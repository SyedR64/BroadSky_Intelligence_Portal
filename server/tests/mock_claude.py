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
GET /_requests returns the recorded requests (headers of interest + JSON body); DELETE clears them.
GET /_events returns stream outcomes ("complete" or "client_closed" with the delta count).
"""

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ANSWER = ('**Short answer:** lenders will test whether the add-on pipeline can carry the debt. '
          'They usually ask three things [1]:\n\n- How much EBITDA comes from acquired versus organic growth\n'
          '- Leverage after each add-on, est. at closing\n- Integration cost and synergy timing\n\n'
          '### Next actions\n- Build a covenant headroom table by quarter\n- Show organic growth separately [2]')

_lock = threading.Lock()
REQUESTS, EVENTS = [], []


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

    def do_GET(self):
        if self.path == '/_requests':
            with _lock:
                return self._json(200, REQUESTS[-50:])
        if self.path == '/_events':
            with _lock:
                return self._json(200, EVENTS[-50:])
        return self._json(404, {'type': 'error', 'error': {'type': 'not_found_error', 'message': 'Not found'}})

    def do_DELETE(self):
        with _lock:
            REQUESTS.clear()
            EVENTS.clear()
        return self._json(200, {'ok': True})

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n)
        try:
            body = json.loads(raw)
        except ValueError:
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'bad json'}})
        hdr = {k: self.headers.get(k) for k in ('x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type')}
        with _lock:
            REQUESTS.append({'path': self.path, 'headers': {k: (('set' if v else None) if k == 'x-api-key' else v) for k, v in hdr.items()}, 'body': body})
        if self.path != '/v1/messages':
            return self._json(404, {'type': 'error', 'error': {'type': 'not_found_error', 'message': 'Not found'}})
        if not hdr['x-api-key']:
            return self._json(401, {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'x-api-key header is required'}})
        if hdr['anthropic-version'] != '2023-06-01':
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'anthropic-version must be 2023-06-01'}})
        msgs = body.get('messages') or []
        last = msgs[-1].get('content') if msgs else ''
        last = last if isinstance(last, str) else json.dumps(last)
        if '[mock:auth]' in last:
            return self._json(401, {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'invalid x-api-key'}})
        if '[mock:busy]' in last:
            return self._json(429, {'type': 'error', 'error': {'type': 'rate_limit_error', 'message': 'rate limited'}})
        if '[mock:down]' in last:
            return self._json(529, {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded'}})
        if '[mock:slowheaders]' in last:
            time.sleep(30)
        if '[mock:nobeta]' in last and hdr['anthropic-beta']:
            return self._json(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Unexpected value for anthropic-beta header'}})
        self.stream(body, last)

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
            ev('message_start', {'type': 'message_start', 'message': {'id': 'msg_mock', 'type': 'message', 'role': 'assistant', 'model': model, 'content': [], 'stop_reason': None, 'usage': {'input_tokens': 3120, 'output_tokens': 1}}})
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
            parts = words(ANSWER)
            for i, w in enumerate(parts):
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
            ev('content_block_stop', {'type': 'content_block_stop', 'index': 1})
            stop = 'refusal' if '[mock:refusal]' in last else 'end_turn'
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
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    srv.daemon_threads = True
    sys.stderr.write(f'mock_claude: listening on http://{a.host}:{a.port}\n')
    srv.serve_forever()


if __name__ == '__main__':
    main()
