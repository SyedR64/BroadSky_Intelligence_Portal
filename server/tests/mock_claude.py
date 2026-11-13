"""
Tiny stand-in for the Claude Messages API, for local tests only (standard library, no key needed).

  python3 tests/mock_claude.py --port 8799
  FAKE_ANTHROPIC_URL=http://127.0.0.1:8799 ANTHROPIC_API_KEY=test-not-a-real-key uvicorn app:app --port 8787

POST /v1/messages answers with a realistic streaming sequence:
  message_start, ping, a thinking block (which the backend must strip), a text block of
  content_block_delta events, message_delta (stop_reason + usage), message_stop.
Markers in the last user message switch behaviour:
  [mock:slow]        300 ms between text deltas (for Stop / disconnect tests)
  [mock:hang]        message_start, then nothing for 30 s (for the total-time cap)
  [mock:refusal]     stop_reason "refusal"
  [mock:overloaded]  a few deltas, then an "error" event of type overloaded_error
  [mock:auth]        HTTP 401;  [mock:busy] HTTP 429;  [mock:down] HTTP 529
  [mock:nobeta]      HTTP 400 naming anthropic-beta when the beta header is sent (tests the retry)
  [mock:fallback]    a "fallback" content block mid-answer, then more text from the fallback model
  [mock:slowheaders] waits 30 s before sending any response headers (for the header timeout)
  [mock:garbage]     malformed events (non-JSON data, wrong field types) between valid ones
  [mock:tool]        first call asks for search_knowledge; the call after the tool result answers
  [mock:read]        first call asks for read_source [1];  [mock:deal] first call asks for deal_model (CET, entry 9.5x)
  [mock:homes]       first call asks for new_homeowners (Ocean County, latest month, 5 rows)
  [mock:brief]       first call asks for property_brief (a Pennsylvania address, so no live lookup is made)
  [mock:loop]        asks for search_knowledge on every call until the request sets tool_choice "none"
  [mock:cite]        the answer's text block carries a web-search citation
  [mock:noweb]       HTTP 400 naming web_search when the web search tool is offered (tests the retry)
  [mock:billing]     HTTP 400 "Your credit balance is too low …";  [mock:billing402] HTTP 402 billing_error
  [mock:cache]       the usage block reports a cache read and a cache write (620 uncached + 2,000 read + 500 written)
  [mock:plan:<b64>]  a scripted run: url-safe base64 of a JSON list of [tool name, input]; call k asks for item k, then the answer
  [mock:md]          the answer is heavy with markdown, [n] markers, a link and a bare URL (for the voice filter)
  [mock:sym]         a one-sentence answer with "#26", "~40" and "est." in it (for the page's speech clean-up)
  [mock:maxtokens]   the answer stops after twelve pieces with stop_reason "max_tokens" (the reply budget ran out)
A request without "stream": true is the backend's key check (GET /health?deep=1). It gets a JSON message, or the failure set
with POST /_probe {"mode": "ok" | "auth" | "billing" | "billing402" | "busy" | "down" | "nozero" | "html"} ("nozero" rejects max_tokens 0 once;
"html" answers 200 with a web page, as a wrong address or a gateway would).
GET /_oldhealth is a backend from before the model check: {ok, version, llm} and no model_state (?llm=0 for a missing key).
GET /_requests returns the recorded requests (headers of interest + JSON body); DELETE clears them.
GET /_events returns stream outcomes ("complete" or "client_closed" with the delta count).

It also stands in for the Vercel Blob API used by the chat log (VERCEL_BLOB_API_URL=http://127.0.0.1:8799/blob):
  PUT /blob/?pathname=…   stores the body (needs a Bearer token and x-vercel-blob-access: private)
  GET /blob/?prefix=…     lists stored files ({blobs, cursor, hasMore}, two per page so paging is exercised)
  GET /blobfile/<path>    serves a stored file;  GET /_blobs returns everything stored with its request headers
"""

import argparse
import base64
import json
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

MD_ANSWER = ('### Leadership\n\n**Tyler Zachem** leads BSP as *Managing Partner* [1][2]. He co-founded it in `2021` [3, 4].\n\n'
             '- First, see [the team page](https://broadskypartners.com/team/) for more.\n- Second, Fund I is **$335M** [5].\n\n'
             '1. Details at https://example.com/a?b=1 today.\n> __Done__.')

SYM_ANSWER = 'Fair Harbor ranked #26 on the list, with ~40 stores, est. at $5M a year.'

ANSWER = ('**Short answer:** lenders will test whether the add-on pipeline can carry the debt. '
          'They usually ask three things [1]:\n\n- How much EBITDA comes from acquired versus organic growth\n'
          '- Leverage after each add-on, est. at closing\n- Integration cost and synergy timing\n\n'
          '### Next actions\n- Build a covenant headroom table by quarter\n- Show organic growth separately [2]')

_lock = threading.Lock()
REQUESTS, EVENTS = [], []
BLOBS = {}   # pathname -> {'body': text, 'headers': {...}}
PROBE = {'mode': 'ok'}   # how a non-streaming request (the backend's key check) is answered


def plan_of(text):
    """The scripted tool calls in a [mock:plan:<b64>] marker, or None."""
    m = re.search(r'\[mock:plan:([A-Za-z0-9_=-]+)\]', text)
    if not m:
        return None
    try:
        plan = json.loads(base64.urlsafe_b64decode(m.group(1) + '=' * (-len(m.group(1)) % 4)))
        return plan if isinstance(plan, list) else None
    except ValueError:
        return None


def words(text):
    out, cur = [], ''
    for ch in text:
        cur += ch
        if ch == ' ' or ch == '\n':
            out.append(cur)
            cur = ''
    if cur:
        out.append(cur)
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        sys.stderr.write('mock_claude: ' + (fmt % args) + '\n')

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def blob_auth(self):
        return (self.headers.get('authorization') or '').startswith('Bearer vercel_blob_rw_')

    def do_PUT(self):
        u = urlsplit(self.path)
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8')
        if u.path.rstrip('/') != '/blob' or not self.blob_auth():
            return self._json(403, {'error': {'code': 'forbidden', 'message': 'no'}})
        name = parse_qs(u.query).get('pathname', [''])[0]
        hdr = {k: self.headers.get(k) for k in ('x-api-version', 'x-vercel-blob-access', 'x-add-random-suffix', 'x-content-type', 'x-vercel-blob-store-id')}
        with _lock:
            BLOBS[name] = {'body': body, 'headers': hdr}
        host = f'http://{self.headers.get("host")}'
        return self._json(200, {'url': f'{host}/blobfile/{name}', 'downloadUrl': f'{host}/blobfile/{name}?download=1', 'pathname': name, 'contentType': 'application/json'})

    def do_GET(self):
        u = urlsplit(self.path)
        if u.path.rstrip('/') == '/blob':
            if not self.blob_auth():
                return self._json(403, {'error': {'code': 'forbidden', 'message': 'no'}})
            qs = parse_qs(u.query)
            prefix, start = qs.get('prefix', [''])[0], int(qs.get('cursor', ['0'])[0])
            with _lock:
                names = sorted(n for n in BLOBS if n.startswith(prefix))
            page = names[start:start + 2]
            host = f'http://{self.headers.get("host")}'
            return self._json(200, {'blobs': [{'url': f'{host}/blobfile/{n}', 'downloadUrl': f'{host}/blobfile/{n}?download=1', 'pathname': n, 'size': len(BLOBS[n]['body']), 'uploadedAt': '2026-10-09T12:00:00.000Z'} for n in page],
                                    'cursor': str(start + 2) if start + 2 < len(names) else None, 'hasMore': start + 2 < len(names)})
        if u.path.startswith('/blobfile/'):
            if not self.blob_auth():
                return self._json(403, {'error': {'code': 'forbidden', 'message': 'private'}})
            with _lock:
                b = BLOBS.get(u.path[len('/blobfile/'):])
            return self._json(200, json.loads(b['body'])) if b else self._json(404, {'error': {'code': 'not_found'}})
        if self.path == '/_blobs':
            with _lock:
                return self._json(200, BLOBS)
        if self.path == '/_requests':
            with _lock:
                return self._json(200, REQUESTS[-50:])
        if self.path == '/_events':
            with _lock:
                return self._json(200, EVENTS[-50:])
        if u.path == '/_oldhealth':
            return self._json(200, {'ok': True, 'model': 'claude-opus-5-5', 'version': '2.1.0', 'db': True, 'llm': parse_qs(u.query).get('llm', ['1'])[0] != '0', 'kv': True})
        return self._json(404, {'type': 'error', 'error': {'type': 'not_found_error', 'message': 'Not found'}})

    def do_DELETE(self):
        with _lock:
            REQUESTS.clear()
            EVENTS.clear()
            BLOBS.clear()
        return self._json(200, {'ok': True})

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n)
        try:
            body = json.loads(raw)
        except ValueError:
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'bad json'}})
        if self.path == '/_probe':
            with _lock:
                PROBE['mode'] = str(body.get('mode') or 'ok')
            return self._json(200, {'ok': True, 'mode': PROBE['mode']})
        hdr = {k: self.headers.get(k) for k in ('x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type')}
        with _lock:
            REQUESTS.append({'path': self.path, 'headers': {k: (('set' if v else None) if k == 'x-api-key' else v) for k, v in hdr.items()}, 'body': body})
        if self.path.split('?')[0] != '/v1/messages':   # the SDK's beta calls add ?beta=true
            return self._json(404, {'type': 'error', 'error': {'type': 'not_found_error', 'message': 'Not found'}})
        if not hdr['x-api-key']:
            return self._json(401, {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'x-api-key header is required'}})
        if hdr['anthropic-version'] != '2023-06-01':
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'anthropic-version must be 2023-06-01'}})
        msgs = body.get('messages') or []
        last = msgs[-1].get('content') if msgs else ''
        last = last if isinstance(last, str) else json.dumps(last)
        if not body.get('stream'):
            return self.probe(body)
        if '[mock:billing402]' in last:
            return self._json(402, {'type': 'error', 'error': {'type': 'billing_error', 'message': 'Billing problem'}})
        if '[mock:billing]' in last:
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'}})
        if '[mock:auth]' in last:
            return self._json(401, {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'invalid x-api-key'}})
        if '[mock:busy]' in last:
            return self._json(429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'message': 'rate limited'}})
        if '[mock:down]' in last:
            return self._json(529, {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded'}})
        if '[mock:slowheaders]' in last:
            time.sleep(30)
        if '[mock:noweb]' in last and any(t.get('type', '').startswith('web_search') for t in body.get('tools') or []):
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'web_search is not enabled for this organization'}})
        if '[mock:nobeta]' in last and hdr['anthropic-beta']:
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Unexpected value for anthropic-beta header'}})
        tool = self.wants_tool(body, msgs)
        if tool:
            return self.tool_call(body, *tool)
        self.stream(body, last)

    def probe(self, body):
        """The backend's key check: one small non-streaming request."""
        with _lock:
            mode = PROBE['mode']
            if mode == 'nozero' and body.get('max_tokens') == 0:
                PROBE['mode'] = 'ok'
        err = {'auth': (401, 'authentication_error', 'invalid x-api-key'), 'billing402': (402, 'billing_error', 'Billing problem'),
               'billing': (400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
               'busy': (429, 'rate_limit_error', 'rate limited'), 'down': (529, 'overloaded_error', 'Overloaded'),
               'nozero': (400, 'invalid_request_error', 'max_tokens: must be greater than or equal to 1')}.get(mode)
        if err and not (mode == 'nozero' and body.get('max_tokens') != 0):
            return self._json(err[0], {'type': 'error', 'error': {'type': err[1], 'message': err[2]}})
        if mode == 'html':   # HTTP 200, but not a model reply
            data = b'<!doctype html><html><body><h1>Welcome</h1></body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return None
        return self._json(200, {'id': 'msg_probe', 'type': 'message', 'role': 'assistant', 'model': body.get('model'), 'content': [],
                                'stop_reason': 'max_tokens', 'stop_sequence': None, 'usage': {'input_tokens': 8, 'output_tokens': 0}})

    @staticmethod
    def wants_tool(body, msgs):
        allm = json.dumps(msgs)
        tail = msgs[-1].get('content') if msgs else ''
        after_tool = isinstance(tail, list) and any(isinstance(b, dict) and b.get('type') == 'tool_result' for b in tail)
        if (body.get('tool_choice') or {}).get('type') == 'none' or not body.get('tools'):
            return None   # told to answer, or offered no tools at all
        plan = plan_of(allm)
        if plan is not None:
            done = sum(1 for m in msgs if isinstance(m.get('content'), list) and any(isinstance(b, dict) and b.get('type') == 'tool_result' for b in m['content']))
            return (plan[done][0], plan[done][1]) if done < len(plan) else None
        if '[mock:loop]' in allm:
            return 'search_knowledge', {'query': 'loop again'}
        if after_tool:
            return None
        if '[mock:tool]' in allm:
            return 'search_knowledge', {'query': 'Tyler Zachem chief executive', 'company': 'bsp'}
        if '[mock:read]' in allm:
            return 'read_source', {'source': 1}
        if '[mock:deal]' in allm:
            return 'deal_model', {'preset': 'cet', 'overrides': {'em': 9.5}}
        if '[mock:homes]' in allm:
            return 'new_homeowners', {'county': 'Ocean', 'period': 'latest', 'limit': 5}
        if '[mock:brief]' in allm:
            return 'property_brief', {'address': '1800 Lambs Gap Road', 'municipality': 'Hampden Township', 'state': 'PA'}
        return None

    def tool_call(self, body, name, args):
        """A step that ends in one tool call: thinking, then a tool_use block streamed as input_json_delta fragments."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True

        def ev(name_, obj):
            self.wfile.write(f'event: {name_}\ndata: {json.dumps(obj)}\n\n'.encode())
            self.wfile.flush()
        try:
            ev('message_start', {'type': 'message_start', 'message': {'id': 'msg_tool', 'type': 'message', 'role': 'assistant', 'model': body.get('model'), 'content': [], 'stop_reason': None, 'usage': {'input_tokens': 2000, 'output_tokens': 1}}})
            ev('content_block_start', {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'thinking', 'thinking': '', 'signature': ''}})
            ev('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'signature_delta', 'signature': 'sig-mock'}})
            ev('content_block_stop', {'type': 'content_block_stop', 'index': 0})
            ev('content_block_start', {'type': 'content_block_start', 'index': 1, 'content_block': {'type': 'tool_use', 'id': 'toolu_mock_%d' % len(REQUESTS), 'name': name, 'input': {}}})
            raw = json.dumps(args)
            for k in range(0, len(raw), 7):
                ev('content_block_delta', {'type': 'content_block_delta', 'index': 1, 'delta': {'type': 'input_json_delta', 'partial_json': raw[k:k + 7]}})
            ev('content_block_stop', {'type': 'content_block_stop', 'index': 1})
            ev('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': 'tool_use', 'stop_sequence': None}, 'usage': {'output_tokens': 50}})
            ev('message_stop', {'type': 'message_stop'})
            with _lock:
                EVENTS.append({'outcome': 'tool_call', 'tool': name})
        except (BrokenPipeError, ConnectionResetError):
            with _lock:
                EVENTS.append({'outcome': 'client_closed', 'deltas': 0})

    def stream(self, body, last):
        model = body.get('model') or 'claude-opus-5-5'
        delay = 0.3 if '[mock:slow]' in last else 0.02
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        sent = 0

        def ev(name, obj):
            self.wfile.write(f'event: {name}\ndata: {json.dumps(obj)}\n\n'.encode())
            self.wfile.flush()

        try:
            usage = {'input_tokens': 620, 'cache_read_input_tokens': 2000, 'cache_creation_input_tokens': 500, 'output_tokens': 1} if '[mock:cache]' in last else {'input_tokens': 3120, 'output_tokens': 1}
            ev('message_start', {'type': 'message_start', 'message': {'id': 'msg_mock', 'type': 'message', 'role': 'assistant', 'model': model, 'content': [], 'stop_reason': None, 'usage': usage}})
            ev('ping', {'type': 'ping'})
            if '[mock:garbage]' in last:
                self.wfile.write(b'data: {not json\n\n')
                self.wfile.write(b'data: [1, 2]\n\n')
                ev('message_start', {'type': 'message_start', 'message': 'not-an-object'})
                ev('content_block_start', {'type': 'content_block_start', 'index': [0], 'content_block': 'x'})
                ev('content_block_delta', {'type': 'content_block_delta', 'index': {'a': 1}, 'delta': 'x'})
                ev('message_delta', {'type': 'message_delta', 'delta': None, 'usage': {'output_tokens': 'many', 'input_tokens': 'lots'}})
                self.wfile.flush()
            if '[mock:hang]' in last:
                time.sleep(30)
            ev('content_block_start', {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'thinking', 'thinking': '', 'signature': ''}})
            ev('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'thinking_delta', 'thinking': 'SECRET-THINKING: weigh lender questions.'}})
            ev('content_block_stop', {'type': 'content_block_stop', 'index': 0})
            ev('content_block_start', {'type': 'content_block_start', 'index': 1, 'content_block': {'type': 'text', 'text': ''}})
            parts = words(SYM_ANSWER if '[mock:sym]' in last else MD_ANSWER if '[mock:md]' in json.dumps(body.get('messages')) else ANSWER)
            cut = '[mock:maxtokens]' in json.dumps(body.get('messages'))
            for i, w in enumerate(parts):
                if cut and i == 12:
                    break
                if '[mock:overloaded]' in last and i == 5:
                    ev('error', {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded'}})
                    with _lock:
                        EVENTS.append({'outcome': 'error_sent', 'deltas': sent})
                    return
                if '[mock:fallback]' in last and i == 8:
                    ev('content_block_stop', {'type': 'content_block_stop', 'index': 1})
                    ev('content_block_start', {'type': 'content_block_start', 'index': 2, 'content_block': {'type': 'fallback', 'to': {'model': 'claude-sonnet-5-5'}}})
                    ev('content_block_stop', {'type': 'content_block_stop', 'index': 2})
                    ev('content_block_start', {'type': 'content_block_start', 'index': 3, 'content_block': {'type': 'text', 'text': ''}})
                    model = 'claude-sonnet-5-5'
                idx = 3 if ('[mock:fallback]' in last and i >= 8) else 1
                ev('content_block_delta', {'type': 'content_block_delta', 'index': idx, 'delta': {'type': 'text_delta', 'text': w}})
                sent += 1
                time.sleep(delay)
            if '[mock:cite]' in last:
                ev('content_block_delta', {'type': 'content_block_delta', 'index': 1, 'delta': {'type': 'citations_delta', 'citation': {'type': 'web_search_result_location', 'url': 'https://www.example.com/news/bsp', 'title': 'Example news', 'cited_text': 'BSP', 'encrypted_index': 'x'}}})
            ev('content_block_stop', {'type': 'content_block_stop', 'index': 1})
            stop = 'refusal' if '[mock:refusal]' in last else 'max_tokens' if cut else 'end_turn'
            ev('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': stop, 'stop_sequence': None}, 'usage': {'output_tokens': 640}})
            ev('message_stop', {'type': 'message_stop'})
            with _lock:
                EVENTS.append({'outcome': 'complete', 'deltas': sent})
        except (BrokenPipeError, ConnectionResetError):
            with _lock:
                EVENTS.append({'outcome': 'client_closed', 'deltas': sent})
            sys.stderr.write(f'mock_claude: backend closed the stream after {sent} text deltas\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8799)
    a = ap.parse_args()
    ThreadingHTTPServer.request_queue_size = 128   # the export script fetches eight files at once; the default backlog of 5 refuses some
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    srv.daemon_threads = True
    sys.stderr.write(f'mock_claude: listening on http://{a.host}:{a.port}\n')
    srv.serve_forever()


if __name__ == '__main__':
    main()
