"""
Knowledge base for the BSP Desk assistant: hybrid search over knowledge/kb.sqlite.

scripts/build_corpus.py builds that file from the firm's website, the sources the portal's research cites,
the portfolio companies' own sites, news coverage and the portal itself. It holds documents, their chunks,
an FTS5 index (BM25 keyword search) and an embedding for every chunk. A search runs both and fuses the two
rankings (reciprocal rank fusion), so "who runs the firm" finds the CEO's biography even though the words
differ, and an exact name or figure still ranks first.

Embeddings are static: the tokenizer's token vectors averaged over the text and normalised, so a query is
embedded with numpy alone (no model server, nothing downloaded at run time).
Author: Syed Rahman.
"""

import json
import os
import re
import sqlite3
import threading

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(HERE, 'knowledge', 'kb.sqlite')
PRESETS_PATH = os.path.join(HERE, 'knowledge', 'deal_presets.json')

RRF_K = 60
POOL = 60                 # candidates taken from each ranking before fusion
PER_DOC = 2               # chunks kept per document in one result list
KIND_WEIGHT = {'firm': 1.15, 'firm-team': 1.2, 'firm-investment': 1.15, 'press-release': 1.08, 'filing': 1.0, 'company': 1.0,
               'research': 1.0, 'answer': 1.05, 'portal-view': 1.0, 'site-page': 0.95, 'article': 1.0, 'reference': 0.95, 'headline': 0.85}
COMPANY_BOOST = 1.35
STOP = set('a an and are as at be by can could did do does for from had has have how i if in into is it its me my of on or our '
           'should so than that the their them then there these they this to us was we were what when where which who whom why will '
           'with would you your about tell show give list find much many any all also please'.split())
TOKEN_RX = re.compile(r"[a-z0-9][a-z0-9+&'.-]*")
COMPANY_NAMES = {'bsp': 'Broad Sky Partners', 'pp': 'Punctual Pros', 'cet': 'Commonwealth Electrical Technologies', 'fl': 'Frontline Managed Services',
                 'ts': 'Thomas Scientific', 'bpi': 'Bully Pulpit International', 'fh': 'Fair Harbor', 'sh': 'Smith + Howard'}


class KnowledgeBase:
    def __init__(self, path=KB_PATH):
        from tokenizers import Tokenizer   # imported here so the module loads (and /health answers) without it
        self.path = path
        self.con = sqlite3.connect(f'file:{path}?mode=ro&immutable=1', uri=True, check_same_thread=False)
        self.lock = threading.Lock()
        self.info = dict(self.con.execute('SELECT k, v FROM info').fetchall())
        blobs = {name: (dtype, shape, data) for name, dtype, shape, data in self.con.execute('SELECT name, dtype, shape, data FROM blobs')}
        n, d = map(int, blobs['chunk_vectors'][1].split(','))
        self.vectors = np.frombuffer(blobs['chunk_vectors'][2], dtype=np.float16).reshape(n, d).astype(np.float32)
        v, d2 = map(int, blobs['token_vectors'][1].split(','))
        if blobs['token_vectors'][0] == 'int8':   # int8 with one float16 scale per token
            self.token_vectors = np.frombuffer(blobs['token_vectors'][2], dtype=np.int8).reshape(v, d2)
            self.token_scales = np.frombuffer(blobs['token_scales'][2], dtype=np.float16).astype(np.float32)
        else:
            self.token_vectors = np.frombuffer(blobs['token_vectors'][2], dtype=np.float16).reshape(v, d2)
            self.token_scales = None
        self.tokenizer = Tokenizer.from_str(blobs['tokenizer'][2].decode('utf-8'))
        unk = self.info.get('unk_token_id') or ''
        self.unk = int(unk) if unk.isdigit() else None
        self.max_tokens = int(self.info.get('max_tokens') or 512)
        self.docs = {}
        for row in self.con.execute('SELECT id, key, source, kind, title, url, publisher, date, companies FROM docs'):
            i, key, source, kind, title, url, publisher, date, cos = row
            self.docs[i] = {'id': i, 'key': key, 'source': source, 'kind': kind, 'title': title, 'url': url, 'publisher': publisher, 'date': date,
                            'companies': [c for c in (cos or '').split(',') if c]}
        rows = self.con.execute('SELECT id, doc_id FROM chunks ORDER BY id').fetchall()
        self.chunk_ids = np.array([r[0] for r in rows], dtype=np.int64)
        self.chunk_doc = np.array([r[1] for r in rows], dtype=np.int64)
        if len(self.chunk_ids) != n:
            raise ValueError(f'knowledge base is inconsistent: {len(self.chunk_ids)} chunks, {n} vectors')

    # ── embeddings and the two rankings ─────────────────────────────────────
    def embed(self, text):
        enc = self.tokenizer.encode(text[:4096], add_special_tokens=False)
        ids = [t for t in enc.ids if t != self.unk][:self.max_tokens]
        if not ids:
            return None
        rows = self.token_vectors[ids].astype(np.float32)
        if self.token_scales is not None:
            rows *= self.token_scales[ids][:, None]
        v = rows.mean(axis=0)
        n = float(np.linalg.norm(v))
        return v / n if n else None

    @staticmethod
    def fts_query(text):
        words = [w.strip(".'-") for w in TOKEN_RX.findall(text.lower())]
        words = [w for w in dict.fromkeys(words) if w and w not in STOP and len(w) > 1][:16]
        return ' OR '.join('"' + w.replace('"', '') + '"' for w in words)

    def keyword(self, text, limit=POOL):
        q = self.fts_query(text)
        if not q:
            return []
        with self.lock:
            try:
                rows = self.con.execute('SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts, 3.0, 1.0) LIMIT ?', (q, limit)).fetchall()
            except sqlite3.OperationalError:
                return []
        return [r[0] for r in rows]

    def semantic(self, text, limit=POOL):
        q = self.embed(text)
        if q is None:
            return []
        scores = self.vectors @ q
        top = np.argpartition(-scores, min(limit, len(scores) - 1))[:limit]
        top = top[np.argsort(-scores[top])]
        return [int(self.chunk_ids[i]) for i in top]

    # ── search ──────────────────────────────────────────────────────────────
    def search(self, text, k=6, company=None, kinds=None, exclude_docs=()):
        """Top k chunks for a query: [{chunk_id, doc, text, score}], at most PER_DOC chunks per document."""
        fused = {}
        for ranking in (self.keyword(text), self.semantic(text)):
            for rank, cid in enumerate(ranking):
                fused[cid] = fused.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
        if not fused:
            return []
        scored = []
        for cid, s in fused.items():
            doc = self.docs.get(int(self.chunk_doc[cid - 1]))
            if not doc or doc['id'] in exclude_docs or (kinds and doc['kind'] not in kinds):
                continue
            s *= KIND_WEIGHT.get(doc['kind'], 1.0)
            if company and company in doc['companies']:
                s *= COMPANY_BOOST
            scored.append((s, cid, doc))
        scored.sort(key=lambda x: -x[0])
        out, per = [], {}
        for s, cid, doc in scored:
            if per.get(doc['id'], 0) >= PER_DOC:
                continue
            per[doc['id']] = per.get(doc['id'], 0) + 1
            out.append({'chunk_id': cid, 'doc': doc, 'score': round(s, 5)})
            if len(out) >= k:
                break
        if out:
            with self.lock:
                text_of = dict(self.con.execute(f"SELECT id, text FROM chunks WHERE id IN ({','.join('?' * len(out))})", [o['chunk_id'] for o in out]).fetchall())
            for o in out:
                o['text'] = text_of.get(o['chunk_id'], '')
        return out

    def document(self, doc_id, max_chars=9000):
        """The document's text (its chunks in order), clipped to max_chars."""
        doc = self.docs.get(doc_id)
        if not doc:
            return None, ''
        with self.lock:
            parts = [r[0] for r in self.con.execute('SELECT text FROM chunks WHERE doc_id = ? ORDER BY ord', (doc_id,))]
        text, n = [], 0
        for p in parts:
            if n + len(p) > max_chars:
                text.append(p[:max(0, max_chars - n)] + ' […]')
                break
            text.append(p)
            n += len(p) + 2
        return doc, '\n\n'.join(text)

    def stats(self):
        return {'docs': len(self.docs), 'chunks': int(len(self.chunk_ids)), 'built_at': self.info.get('built_at'), 'sources': json.loads(self.info.get('sources') or '{}')}


_kb = {'kb': None, 'error': None}
_kb_lock = threading.Lock()


def get_kb():
    """The shared knowledge base, opened once per process; None (with the reason logged by the caller) if it cannot open."""
    if _kb['kb'] is None and _kb['error'] is None:
        with _kb_lock:
            if _kb['kb'] is None and _kb['error'] is None:
                try:
                    _kb['kb'] = KnowledgeBase()
                except Exception as e:   # missing file, missing package: the assistant still answers, without the knowledge base
                    _kb['error'] = f'{type(e).__name__}: {e}'
    return _kb['kb']


def kb_error():
    return _kb['error']
