#!/usr/bin/env python3
"""Download the assistant's chat log from the private Vercel Blob store and combine it into files to analyze.

  BLOB_READ_WRITE_TOKEN=… python3 scripts/export_chats.py                  # everything so far
  python3 scripts/export_chats.py --env-file server/.env.local --since 2026-10-01
  python3 scripts/export_chats.py --out ~/Desktop/bsp-chats

The token is the store's read-write token: Vercel dashboard → Storage → bsp-desk-chats → .env.local tab, or
`vercel env pull .env.local` inside server/. It is read from the environment or from --env-file, never printed.

Writes to --out (default chat-logs/, ignored by git; the logs hold visitors' questions and stay off the repo):
  raw/chats/…/*.json, raw/ratings/…/*.json   one file per record, as stored (already downloaded files are skipped)
  chats.jsonl, chats.csv                      one row per answer, newest last
  ratings.jsonl, ratings.csv                  one row per thumbs up or down
Each chat record: id, at, source (server = the research agent, browser = built in the page), persona, page,
origin, visitor (a hashed id, never an address), question, history (earlier turns), answer, thinking (the
reasoning summary), steps, sources, outcome, error, model, stop_reason, agent_steps, tokens, seconds. See server/chatlog.py.
Standard library only.
"""
import argparse, csv, json, os, sys, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_URL = 'https://vercel.com/api/blob'
KINDS = ('chats', 'ratings')
CHAT_COLS = ['at', 'id', 'source', 'persona', 'page', 'visitor', 'question', 'outcome', 'kind', 'intent', 'model', 'fallback_model', 'effort',
             'seconds', 'agent_steps', 'tokens_in', 'tokens_out', 'sources', 'history_turns', 'error', 'answer', 'thinking', 'steps', 'origin']
RATING_COLS = ['at', 'id', 'rating', 'question', 'answer_excerpt', 'thread_id', 'message_id', 'origin']


def read_token(env_file):
    tok = os.environ.get('BLOB_READ_WRITE_TOKEN', '').strip()
    if not tok and env_file:
        with open(env_file) as f:
            for line in f:
                k, _, v = line.strip().partition('=')
                if k.strip() == 'BLOB_READ_WRITE_TOKEN':
                    tok = v.strip().strip('"').strip("'")
    if not tok:
        sys.exit('Set BLOB_READ_WRITE_TOKEN or pass --env-file (see the top of this script).')
    return tok


def request(url, tok, api=False):
    h = {'Authorization': f'Bearer {tok}'}
    if api:
        h.update({'x-api-version': '12', 'x-vercel-blob-store-id': tok.split('_')[3] if len(tok.split('_')) > 3 else ''})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
        return r.read()


def list_all(api, tok, prefix):
    out, cursor = [], None
    while True:
        q = {'prefix': prefix, 'limit': '1000', **({'cursor': cursor} if cursor else {})}
        page = json.loads(request(f'{api}/?{urllib.parse.urlencode(q)}', tok, api=True))
        out += page.get('blobs') or []
        cursor = page.get('cursor')
        if not page.get('hasMore') or not cursor:
            return out


def day_of(pathname):
    parts = pathname.split('/')   # chats/YYYY/MM/DD/HHMMSS-id.json
    return '-'.join(parts[1:4]) if len(parts) >= 5 else ''


def flat_chat(r):
    tokens, err = r.get('tokens') or {}, r.get('error') or {}
    return {**{c: r.get(c, '') for c in CHAT_COLS}, 'tokens_in': tokens.get('in', ''), 'tokens_out': tokens.get('out', ''),
            'sources': ' | '.join(s.get('title', '') + (f" <{s['url']}>" if s.get('url') else '') for s in r.get('sources') or []),
            'history_turns': len(r.get('history') or []), 'error': f"{err.get('code', '')}: {err.get('message', '')}" if err else '',
            'steps': ' → '.join(r.get('steps') or [])}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=os.path.join(ROOT, 'chat-logs'))
    ap.add_argument('--env-file', help='a .env file holding BLOB_READ_WRITE_TOKEN (for example server/.env.local)')
    ap.add_argument('--since', help='first day to include, YYYY-MM-DD (UTC)')
    ap.add_argument('--until', help='last day to include, YYYY-MM-DD (UTC)')
    a = ap.parse_args()
    tok = read_token(a.env_file)
    api = (os.environ.get('VERCEL_BLOB_API_URL') or API_URL).rstrip('/')
    os.makedirs(a.out, exist_ok=True)
    for kind in KINDS:
        blobs = [b for b in list_all(api, tok, kind + '/') if (not a.since or day_of(b['pathname']) >= a.since) and (not a.until or day_of(b['pathname']) <= a.until)]
        todo = [b for b in blobs if not os.path.exists(os.path.join(a.out, 'raw', b['pathname']))]

        def fetch(b):
            dest = os.path.join(a.out, 'raw', b['pathname'])
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            data = request(b['url'], tok)
            with open(dest + '.part', 'wb') as f:
                f.write(data)
            os.replace(dest + '.part', dest)
        with ThreadPoolExecutor(8) as ex:
            list(ex.map(fetch, todo))
        rows = []
        for b in sorted(blobs, key=lambda b: b['pathname'].split('/', 1)[1]):
            with open(os.path.join(a.out, 'raw', b['pathname'])) as f:
                rows.append(json.load(f))
        rows.sort(key=lambda r: r.get('at', ''))
        with open(os.path.join(a.out, kind + '.jsonl'), 'w') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        cols = CHAT_COLS if kind == 'chats' else RATING_COLS
        with open(os.path.join(a.out, kind + '.csv'), 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
            w.writeheader()
            for r in rows:
                w.writerow(flat_chat(r) if kind == 'chats' else {c: r.get(c, '') for c in cols})
        print(f'{kind}: {len(rows)} records ({len(todo)} new) -> {os.path.join(a.out, kind + ".csv")}')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as e:
        sys.exit(f'The Blob store answered {e.code}: check the token ({e.reason}).')
