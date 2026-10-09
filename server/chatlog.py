"""
Chat log: every question and answer is saved as one JSON file in a private Vercel Blob store, for later analysis.

  chats/YYYY/MM/DD/HHMMSS-<id>.json     one per answer: the question, prior turns, the answer, its reasoning summary,
                                        progress steps, sources, model, tokens, time taken and how it ended
  ratings/YYYY/MM/DD/HHMMSS-<id>.json   one per thumbs up or down

Answers written by the server's research agent are logged by app.py; answers the browser builds itself (from the
portfolio data or a prepared deep dive) arrive on POST /log. Writes run after the answer is complete, time out
quickly and never fail or change an answer. Logging is on when BLOB_READ_WRITE_TOKEN is set (Vercel adds it when
the store is connected to the project) and off with CHAT_LOG=off. scripts/export_chats.py downloads the store
into one JSONL or CSV file. Uses the Blob REST API directly (the same calls as the @vercel/blob put()).
"""

import json
import logging
import os
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

API_URL = 'https://vercel.com/api/blob'
API_VERSION = '12'
TIMEOUT = 6.0
MAX_TEXT = 40000   # characters kept per long field (answer, reasoning)

log = logging.getLogger('bsp')
_client = {'http': None}


def token():
    return (os.environ.get('BLOB_READ_WRITE_TOKEN') or '').strip()


def enabled():
    if (os.environ.get('CHAT_LOG') or 'on').strip().lower() in ('off', '0', 'false', 'no'):
        return False
    return bool(token())


def store_id(tok):
    """vercel_blob_rw_<store id>_<secret> -> <store id>."""
    parts = tok.split('_')
    return parts[3] if len(parts) > 3 else ''


def clip(s, n=MAX_TEXT):
    s = s if isinstance(s, str) else ''
    return s if len(s) <= n else s[:n] + ' […]'


def pathname(kind, rid, when):
    return f'{kind}/{when:%Y/%m/%d}/{when:%H%M%S}-{rid}.json'


async def _http():
    if _client['http'] is None:
        import httpx   # installed with the anthropic SDK
        _client['http'] = httpx.AsyncClient(timeout=TIMEOUT)
    return _client['http']


async def close():
    if _client['http'] is not None:
        await _client['http'].aclose()
        _client['http'] = None


async def save(kind, record):
    """Store one record under kind/ ('chats' or 'ratings'). Returns the pathname, or None when off or on failure."""
    if not enabled():
        return None
    when = datetime.now(timezone.utc)
    rid = secrets.token_hex(5)
    path = pathname(kind, rid, when)
    body = json.dumps({'id': rid, 'at': when.isoformat(timespec='seconds').replace('+00:00', 'Z'), **record},
                      ensure_ascii=False, separators=(',', ':'), default=str).encode('utf-8')
    tok = token()
    headers = {
        'authorization': f'Bearer {tok}', 'x-api-version': API_VERSION, 'x-vercel-blob-store-id': store_id(tok),
        'x-vercel-blob-access': 'private', 'x-add-random-suffix': '0', 'x-content-type': 'application/json',
    }
    base = (os.environ.get('VERCEL_BLOB_API_URL') or API_URL).rstrip('/')
    try:
        r = await (await _http()).put(f'{base}/?{urlencode({"pathname": path})}', content=body, headers=headers)
        if r.status_code >= 300:
            log.warning('chat log: the store answered %d for %s', r.status_code, path)
            return None
        return path
    except Exception as e:   # the log is best-effort: a slow or missing store never touches the answer
        log.warning('chat log: %s not saved (%s)', path, type(e).__name__)
        return None
