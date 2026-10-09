"""
End-to-end tests for server/app.py over real HTTP (httpx), against a local mock of the Claude API.
The fixtures start the mock and three backend instances (normal, daily cap of 1, no Claude key)
on free ports with throwaway SQLite files, and stop them afterwards.

  cd server && python3 -m pytest -q tests
"""

import csv
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import uuid

import httpx
import pytest

import procs

GH = 'https://syedr64.github.io'
EVIL = 'https://evil.example'
BLOB_TOKEN = 'vercel_blob_rw_teststore_notarealsecret'   # only ever sent to the local mock
EXPORT = os.path.join(os.path.dirname(procs.SERVER_DIR), 'scripts', 'export_chats.py')


@pytest.fixture(scope='session')
def env(tmp_path_factory):
    d = tmp_path_factory.mktemp('bsp')
    mport = procs.free_port()
    mock = procs.start_mock(mport, str(d / 'mock.log'))
    started = [mock]
    try:
        ports = {k: procs.free_port() for k in ('main', 'capped', 'nokey')}
        main = procs.start_server(ports['main'], str(d / 'main.log'), str(d / 'main.db'), mport, RL_PER_10MIN=5, UPSTREAM_TOTAL_TIMEOUT=3,
                                  BLOB_READ_WRITE_TOKEN=BLOB_TOKEN, VERCEL_BLOB_API_URL=f'http://127.0.0.1:{mport}/blob')
        started.append(main)
        capped = procs.start_server(ports['capped'], str(d / 'capped.log'), str(d / 'capped.db'), mport, DAILY_CAP=1)
        started.append(capped)
        nokey = procs.start_server(ports['nokey'], str(d / 'nokey.log'), str(d / 'nokey.db'), mport, key=None)
        started.append(nokey)
        yield {
            'mock': f'http://127.0.0.1:{mport}', 'main': f'http://127.0.0.1:{ports["main"]}',
            'capped': f'http://127.0.0.1:{ports["capped"]}', 'nokey': f'http://127.0.0.1:{ports["nokey"]}',
            'main_proc': main, 'mock_proc': mock, 'main_db': str(d / 'main.db'),
        }
    finally:
        for p in reversed(started):
            p.stop()


def ip():
    """A fresh visitor address per test, so per-visitor buckets never collide."""
    return '203.0.113.%d' % (uuid.uuid4().int % 250 + 1) + '-' + uuid.uuid4().hex[:6]


def hdrs(origin=GH, visitor=None, **extra):
    h = {'Origin': origin, 'Content-Type': 'application/json'}
    if visitor:
        h['X-Real-IP'] = visitor
    h.update(extra)
    return h


def chat(base, question, visitor=None, origin=GH, **body):
    """POST /chat and return (status, headers, events or JSON)."""
    payload = {'question': question, **body}
    with httpx.stream('POST', base + '/chat', headers=hdrs(origin, visitor or ip()), json=payload, timeout=30) as r:
        if r.headers.get('content-type', '').startswith('text/event-stream'):
            events, buf = [], ''
            for piece in r.iter_text():
                buf += piece
                while '\n\n' in buf:
                    raw, buf = buf.split('\n\n', 1)
                    data = ''.join(l[5:].lstrip() for l in raw.split('\n') if l.startswith('data:'))
                    if data:
                        events.append(json.loads(data))
            return r.status_code, r.headers, events
        r.read()
        return r.status_code, r.headers, r.json()


def mock_requests(env):
    return httpx.get(env['mock'] + '/_requests').json()


# ── /health ─────────────────────────────────────────────────────────────────
def test_health_shape(env):
    for path in ('/health', '/', '/health/'):
        r = httpx.get(env['main'] + path, headers={'Origin': GH})
        assert r.status_code == 200
        j = r.json()
        assert {k: j[k] for k in ('ok', 'model', 'version', 'db', 'llm', 'kv', 'log')} == {'ok': True, 'model': 'claude-opus-5-5', 'version': '2.0.0', 'db': True, 'llm': True, 'kv': True, 'log': True}
        assert j['kb']['docs'] > 100 and j['kb']['chunks'] > j['kb']['docs'] and j['kb']['built_at']
        assert r.headers['access-control-allow-origin'] == GH
        assert r.headers['cache-control'] == 'no-store'


def test_missing_key_health_and_chat(env):
    h = httpx.get(env['nokey'] + '/health').json()
    assert h['ok'] is True and h['llm'] is False and h['log'] is False   # no store token: the chat log is off
    status, headers, body = chat(env['nokey'], 'Anything?')
    assert status == 503
    assert body['ok'] is False and body['error'] == 'no_model_key'
    assert 'not configured' in body['message']
    assert headers['access-control-allow-origin'] == GH


# ── /chat streaming ─────────────────────────────────────────────────────────
def test_chat_streams_meta_text_done(env):
    httpx.delete(env['mock'] + '/_requests')
    status, headers, events = chat(env['main'], 'What will lenders ask about roll-up debt?', context=[{'title': '<b>Debt</b> memo', 'text': '<p>Leverage 4.5x</p><script>x()</script>', 'href': 'app.html#debt'}])
    assert status == 200
    assert headers['content-type'].startswith('text/event-stream')
    assert headers['cache-control'] == 'no-cache, no-transform'
    assert headers['access-control-allow-origin'] == GH
    types = [e['type'] for e in events]
    assert types[0] == 'meta' and types[-1] == 'done' and set(types[1:-1]) == {'text', 'status', 'thinking', 'sources'}
    assert events[0] == {'type': 'meta', 'model': 'claude-opus-5-5', 'version': '2.0.0'}
    src = next(e for e in events if e['type'] == 'sources')['sources']
    assert src[0] == {'n': 1, 'title': 'Debt memo', 'url': 'app.html#debt', 'publisher': 'This page', 'date': '', 'kind': 'page'}
    assert len(src) > 1 and all(s['n'] == i + 1 for i, s in enumerate(src))   # knowledge-base sources follow the page context
    text = ''.join(e['text'] for e in events if e['type'] == 'text')
    assert text.startswith('**Short answer:** lenders will test') and 'Show organic growth separately [2]' in text
    assert 'SECRET-THINKING' not in text   # thinking never mixes into the answer text …
    assert ''.join(e['text'] for e in events if e['type'] == 'thinking') == 'SECRET-THINKING: weigh lender questions.'   # … it comes as its own events
    assert events[-1] == {'type': 'done', 'stop_reason': 'end_turn', 'model': 'claude-opus-5-5', 'steps': 1, 'usage': {'input_tokens': 3120, 'output_tokens': 640}}


def test_upstream_request_shape(env):
    httpx.delete(env['mock'] + '/_requests')
    chat(env['main'], 'Second question', persona='PP', messages=[{'role': 'assistant', 'content': 'orphan'}, {'role': 'user', 'content': 'First question'}, {'role': 'assistant', 'content': [{'type': 'text', 'text': 'First answer'}, {'type': 'tool_use', 'id': 'x'}]}])
    req = mock_requests(env)[-1]
    h, b = req['headers'], req['body']
    assert h['x-api-key'] == 'set' and h['anthropic-version'] == '2023-06-01'
    assert h['anthropic-beta'] == 'server-side-fallback-2026-07-01' and b['fallbacks'] == 'default'
    assert b['model'] == 'claude-opus-5-5' and b['max_tokens'] == 16000 and b['stream'] is True
    assert b['output_config'] == {'effort': 'medium'} and b['cache_control'] == {'type': 'ephemeral'}   # a concept-site assistant stays quick
    assert b['thinking'] == {'type': 'adaptive', 'display': 'summarized'}
    assert re.fullmatch(r'v-[0-9a-f]{24}', b['metadata']['user_id'])
    system = b['system'][0]
    assert system['cache_control'] == {'type': 'ephemeral'}
    assert system['text'].startswith('You are the assistant on a concept website for Punctual Pros') and 'How to answer:' in system['text']
    assert 'deal_model' not in system['text'] and 'web search' not in system['text']
    assert [t['name'] for t in b['tools']] == ['search_knowledge', 'read_source']   # a concept-site assistant does not run deal maths or web searches
    assert all(t['eager_input_streaming'] is True for t in b['tools'])
    assert b['messages'][:2] == [{'role': 'user', 'content': 'First question'}, {'role': 'assistant', 'content': 'First answer'}]
    last = b['messages'][2]
    assert last['role'] == 'user' and last['content'][0]['text'].startswith('<sources>\n[1] ') and last['content'][1] == {'type': 'text', 'text': 'Second question'}


def test_portal_persona_and_context_format(env):
    httpx.delete(env['mock'] + '/_requests')
    chat(env['main'], 'Q?', persona='unknown-id', context=[{'title': '<b>Debt</b>', 'text': 'Leverage &amp; terms', 'href': 'javascript:alert(1)'}, {'title': 'Plan', 'text': 'x', 'href': 'app.html#plan'}])
    b = mock_requests(env)[-1]['body']
    s = b['system'][0]['text']
    assert s.startswith("You are BSP Desk, the in-house analyst on Broad Sky's desk") and 'Say "we" and "our" for BSP' in s
    assert 'No "So what" labels' in s and 'never "playbook"' in s and '10. Deal maths:' in s and '11. Strategy and deal questions' in s
    assert b['output_config'] == {'effort': 'high'}   # the portal's research assistant works harder
    assert [t.get('name') for t in b['tools']] == ['search_knowledge', 'read_source', 'deal_model', 'web_search']
    assert b['tools'][3] == {'type': 'web_search_20260209', 'name': 'web_search', 'max_uses': 3}
    src = b['messages'][-1]['content'][0]['text']
    assert src.startswith('<sources>\n[1] Debt (This page) (from the page the visitor is on)\nLeverage & terms\n\n[2] Plan (This page) app.html#plan (from the page the visitor is on)\nx\n\n[3] ')


def test_knowledge_search_tool_round_trip(env):
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], 'Who runs the firm? [mock:tool]')
    assert status == 200 and events[-1]['type'] == 'done' and events[-1]['steps'] == 2
    assert {'type': 'status', 'text': 'Searching the knowledge base for “Tyler Zachem chief executive”'} in events
    reqs = mock_requests(env)
    assert len(reqs) == 2
    second = reqs[1]['body']['messages']
    assistant, results = second[-2], second[-1]
    assert [blk['type'] for blk in assistant['content']] == ['thinking', 'tool_use']   # thinking is sent back unchanged with the tool call
    assert assistant['content'][0]['signature'] == 'sig-mock' and assistant['content'][1]['input'] == {'query': 'Tyler Zachem chief executive', 'company': 'bsp'}
    res = results['content'][0]
    assert res['type'] == 'tool_result' and res['tool_use_id'] == assistant['content'][1]['id'] and not res.get('is_error')
    assert res['content'].startswith('Results for "Tyler Zachem chief executive":') and 'broadskypartners.com/team/tyler-zachem' in res['content']
    final_sources = [e for e in events if e['type'] == 'sources'][-1]['sources']
    assert any('broadskypartners.com/team/tyler-zachem' in s['url'] for s in final_sources)


def test_read_source_and_deal_model_tools(env):
    httpx.delete(env['mock'] + '/_requests')
    _, _, events = chat(env['main'], 'Read it [mock:read]')
    res = mock_requests(env)[1]['body']['messages'][-1]['content'][0]
    assert res['content'].startswith('[1] ') and len(res['content']) > 300 and not res.get('is_error')
    assert events[-1]['type'] == 'done'
    httpx.delete(env['mock'] + '/_requests')
    _, _, events = chat(env['main'], 'What is CET worth at 9.5x? [mock:deal]')
    res = mock_requests(env)[1]['body']['messages'][-1]['content'][0]['content']
    assert 'IRR' in res and 'Equity check' not in res and 'equity check' in res
    assert 'app.html#/deal/returns?p=cet&em=9.5' in res
    assert {'type': 'status', 'text': 'Running the acquisition model for CET'} in events
    model = [s for s in [e for e in events if e['type'] == 'sources'][-1]['sources'] if s['kind'] == 'model']
    assert model and model[0]['url'].endswith('app.html#/deal/returns?p=cet&em=9.5') and res.startswith(f"This run is source [{model[0]['n']}].")


def test_step_cap_forces_an_answer(env):
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], 'Keep searching [mock:loop]')
    assert status == 200 and events[-1]['type'] == 'done' and events[-1]['steps'] == 6
    reqs = mock_requests(env)
    assert len(reqs) == 6
    assert all('tool_choice' not in r['body'] for r in reqs[:5]) and reqs[5]['body']['tool_choice'] == {'type': 'none'}


def test_web_citations_become_numbered_sources(env):
    _, _, events = chat(env['main'], 'News? [mock:cite]')
    text = ''.join(e['text'] for e in events if e['type'] == 'text')
    web = [s for s in [e for e in events if e['type'] == 'sources'][-1]['sources'] if s['kind'] == 'web']
    assert web and web[0]['url'] == 'https://www.example.com/news/bsp' and web[0]['publisher'] == 'example.com'
    assert text.endswith(f" [{web[0]['n']}]")


def test_web_search_rejected_retries_without_it(env):
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], 'Web please [mock:noweb]')
    assert status == 200 and events[-1]['type'] == 'done'
    reqs = mock_requests(env)
    assert len(reqs) == 2 and 'web_search' in [t.get('name') for t in reqs[0]['body']['tools']]
    assert 'web_search' not in [t.get('name') for t in reqs[1]['body']['tools']]


def test_beta_rejected_retries_without_it(env):
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], 'Retry please [mock:nobeta]')
    assert status == 200 and events[-1]['type'] == 'done'
    reqs = mock_requests(env)
    assert len(reqs) == 2
    assert reqs[0]['headers']['anthropic-beta'] and reqs[0]['body'].get('fallbacks') == 'default'
    assert reqs[1]['headers']['anthropic-beta'] is None and 'fallbacks' not in reqs[1]['body']


def test_fallback_announced_and_text_kept(env):
    status, _, events = chat(env['main'], 'Go [mock:fallback]')
    metas = [e for e in events if e['type'] == 'meta']
    assert metas[1] == {'type': 'meta', 'model': 'claude-sonnet-5-5', 'fallback': True, 'midstream': True}
    assert events[-1]['type'] == 'done' and events[-1]['model'] == 'claude-sonnet-5-5'
    assert ''.join(e['text'] for e in events if e['type'] == 'text').startswith('**Short answer:**')


def test_refusal_and_overloaded_error_events(env):
    _, _, ev = chat(env['main'], 'No [mock:refusal]')
    assert ev[-1] == {'type': 'error', 'code': 'refusal', 'message': 'The assistant declined to answer this one.'}
    _, _, ev = chat(env['main'], 'Busy [mock:overloaded]')
    assert ev[-1] == {'type': 'error', 'code': 'upstream_unavailable', 'message': 'The assistant is overloaded right now. Try again shortly.'}
    assert not any(e['type'] == 'done' for e in ev)


def test_upstream_http_errors_map_to_worker_codes(env):
    s, h, b = chat(env['main'], 'x [mock:auth]')
    assert (s, b['error']) == (502, 'backend_auth')
    s, h, b = chat(env['main'], 'x [mock:busy]')
    assert (s, b['error'], b['scope'], b['retryAfter'], h['retry-after']) == (429, 'upstream_busy', 'upstream', 60, '60')
    s, h, b = chat(env['main'], 'x [mock:down]')
    assert (s, b['error'], b['retryAfter']) == (503, 'upstream_unavailable', 30)


def test_total_time_cap_sends_timeout_event(env):
    t0 = time.time()
    s, _, ev = chat(env['main'], 'Slow one [mock:hang]')
    assert s == 200 and time.time() - t0 < 8
    assert ev[0]['type'] == 'meta'
    assert ev[-1]['type'] == 'error' and ev[-1]['code'] == 'upstream_timeout'


def test_client_disconnect_cancels_upstream(env):
    httpx.delete(env['mock'] + '/_requests')
    before = env['main_proc'].text().count('visitor disconnected')
    with httpx.stream('POST', env['main'] + '/chat', headers=hdrs(visitor=ip()), json={'question': 'Long one [mock:slow]'}, timeout=30) as r:
        got = 0
        for line in r.iter_lines():
            if line.startswith('data:') and '"text"' in line:
                got += 1
                if got == 2:
                    break
    # Closing the response drops the connection, as the browser does on Stop.
    deadline = time.time() + 6
    while time.time() < deadline and env['main_proc'].text().count('visitor disconnected') == before:
        time.sleep(0.1)
    assert env['main_proc'].text().count('visitor disconnected') == before + 1
    deadline = time.time() + 6
    outcome = None
    while time.time() < deadline:
        evs = httpx.get(env['mock'] + '/_events').json()
        if evs and evs[-1]['outcome'] == 'client_closed':
            outcome = evs[-1]
            break
        time.sleep(0.2)
    assert outcome is not None and outcome['deltas'] < 20   # the mock stopped early: upstream was cancelled


def test_slow_upstream_headers_time_out(env):
    t0 = time.time()
    s, h, b = chat(env['main'], 'x [mock:slowheaders]')
    assert time.time() - t0 < 8   # bounded by the total cap (3 s on this instance), not the 30 s stall
    assert (s, b['error'], b['retryAfter'], h['retry-after']) == (504, 'upstream_timeout', 30, '30')


def test_malformed_upstream_events_end_cleanly(env):
    """Malformed events in Claude's stream end the answer with an error event: never a 500, never a hung response."""
    s, _, ev = chat(env['main'], 'x [mock:garbage]')
    assert s == 200 and ev[0]['type'] == 'meta'
    assert ev[-1]['type'] in ('done', 'error')
    if ev[-1]['type'] == 'error':
        assert ev[-1]['code'] == 'upstream_error'
    assert httpx.get(env['main'] + '/health').json()['ok'] is True


def test_concurrent_streams(env):
    import concurrent.futures as cf
    with cf.ThreadPoolExecutor(10) as ex:
        res = list(ex.map(lambda _: chat(env['main'], 'parallel'), range(10)))
    assert all(s == 200 and ev[-1]['type'] == 'done' for s, _, ev in res)
    assert httpx.get(env['main'] + '/health').json()['ok'] is True


# ── Validation ──────────────────────────────────────────────────────────────
def test_validation_errors(env):
    base = env['main']
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), json={'question': '  '})
    assert (r.status_code, r.json()['error']) == (400, 'missing_question')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), json={'question': 'x' * 2001})
    assert (r.status_code, r.json()['error'], r.json()['message']) == (413, 'question_too_long', 'Questions are limited to 2,000 characters.')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip(), **{'Content-Type': 'application/x-www-form-urlencoded'}), content=b'question=x')
    assert (r.status_code, r.json()['error']) == (415, 'bad_content_type')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), content=b'[1,2]')
    assert (r.status_code, r.json()['error']) == (400, 'bad_json')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), json={'question': 'q', 'context': 'nope'})
    assert (r.status_code, r.json()['error']) == (400, 'bad_context')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), json={'question': 'q', 'messages': {}})
    assert (r.status_code, r.json()['error']) == (400, 'bad_messages')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), json={'question': 'q', 'context': [{'title': 't', 'text': 'x' * 12001}]})
    assert (r.status_code, r.json()['error']) == (413, 'context_too_long')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), content=b'{"question":"' + b'x' * 140000 + b'"}')
    assert (r.status_code, r.json()['error']) == (413, 'too_large')


def test_hostile_bodies_get_worker_errors_not_500(env):
    base = env['main']
    deep = b'{"question":"x","context":' + b'[' * 5000 + b']' * 5000 + b'}'
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), content=deep)
    # Python 3.12+ parses this nesting (older versions raise RecursionError): either way it is a 400 or an answer that ignores it, never a 500
    assert (r.status_code, r.json()['error']) == (400, 'bad_json') if r.status_code != 200 else r.headers['content-type'].startswith('text/event-stream')
    r = httpx.post(base + '/thread', headers=hdrs(visitor=ip()), json={'thread_id': 'deep-thread-1', 'messages_json': '[' * 5000 + ']' * 5000})
    assert (r.status_code, r.json().get('error')) in ((400, 'bad_messages_json'), (200, None))   # 200 on Python 3.12+, which parses the nesting
    r = httpx.post(base + '/feedback', headers=hdrs(visitor=ip()), content=b'{"rating": 1' + b'0' * 400 + b'}')
    assert (r.status_code, r.json()['error']) == (400, 'bad_rating')
    r = httpx.post(base + '/feedback', headers=hdrs(visitor=ip()), json={'rating': '1_0'})
    assert (r.status_code, r.json()['error']) == (400, 'bad_rating')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), content=b'')
    assert (r.status_code, r.json()['error']) == (400, 'bad_json')
    r = httpx.post(base + '/chat', headers=hdrs(visitor=ip()), content=b'\xff\xfe{"question":"x"}')
    assert (r.status_code, r.json()['error']) == (400, 'bad_json')


# ── CORS ────────────────────────────────────────────────────────────────────
def test_cors_preflight_and_origin_rules(env):
    base = env['main']
    pre = {'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'}
    r = httpx.options(base + '/chat', headers={'Origin': GH, **pre})
    assert r.status_code == 204
    assert r.headers['access-control-allow-origin'] == GH
    assert r.headers['access-control-allow-methods'] == 'GET, POST, OPTIONS'
    assert r.headers['access-control-allow-headers'] == 'Content-Type, Accept'
    assert r.headers['access-control-max-age'] == '86400'
    for o in ('http://127.0.0.1:8765', 'http://localhost:8765', 'https://broadsky-desk.vercel.app'):
        assert httpx.options(base + '/chat', headers={'Origin': o, **pre}).status_code == 204
    r = httpx.options(base + '/chat', headers={'Origin': EVIL, **pre})
    assert r.status_code == 403 and 'access-control-allow-origin' not in r.headers
    r = httpx.post(base + '/chat', headers=hdrs(EVIL, ip()), json={'question': 'hi'})
    assert (r.status_code, r.json()['error']) == (403, 'origin_not_allowed')
    r = httpx.post(base + '/feedback', headers={'Content-Type': 'application/json'}, json={'rating': 1})
    assert r.status_code == 403   # no Origin at all
    r = httpx.get(base + '/health', headers={'Origin': EVIL})
    assert r.status_code == 200 and 'access-control-allow-origin' not in r.headers


# ── Limits ──────────────────────────────────────────────────────────────────
def test_per_visitor_rate_limit(env):
    v = ip()
    for _ in range(5):   # RL_PER_10MIN=5 on this instance
        s, _, ev = chat(env['main'], 'quick', visitor=v)
        assert s == 200
    s, h, b = chat(env['main'], 'quick', visitor=v)
    assert (s, b['error'], b['scope']) == (429, 'rate_limited', 'visitor')
    assert b['message'] == 'Too many questions in a short time (limit 5 per 10 minutes).'
    assert 500 < b['retryAfter'] <= 600 and h['retry-after'] == str(b['retryAfter'])
    s, _, _ = chat(env['main'], 'quick', visitor=ip())   # another visitor is unaffected
    assert s == 200


def test_spoofed_cf_connecting_ip_does_not_reset_the_limit(env):
    """Railway does not set CF-Connecting-IP, so a fresh value per request must not mint a fresh visitor."""
    v = ip()
    codes = []
    for i in range(6):   # RL_PER_10MIN=5 on this instance
        h = hdrs(visitor=v, **{'CF-Connecting-IP': '198.51.100.%d' % (i + 1)})
        with httpx.stream('POST', env['main'] + '/chat', headers=h, json={'question': 'quick'}, timeout=30) as r:
            r.read()
            codes.append(r.status_code)
    assert codes == [200] * 5 + [429]


def test_daily_cap(env):
    s, _, ev = chat(env['capped'], 'first of the day')
    assert s == 200 and ev[-1]['type'] == 'done'
    s, h, b = chat(env['capped'], 'second of the day')
    assert s == 429
    assert b == {'ok': False, 'error': 'daily_cap', 'message': "Today's research budget for this site is used up. It resets at midnight UTC.", 'retryAfter': b['retryAfter'], 'scope': 'global'}
    assert 60 <= b['retryAfter'] <= 86400 and h['retry-after'] == str(b['retryAfter'])
    st = httpx.get(env['capped'] + '/stats').json()
    assert st['daily_cap'] == 1 and st['today']['requests'] == 2


# ── Storage ─────────────────────────────────────────────────────────────────
def test_feedback_lands_in_sqlite(env):
    r = httpx.post(env['main'] + '/feedback', headers=hdrs(visitor=ip()), json={'thread_id': 'thread-abc-123', 'message_id': 'm1', 'rating': 1, 'question': 'Q', 'answer_excerpt': '<p>Answer <b>text</b></p>'})
    assert r.status_code == 201
    body = r.json()
    assert body['ok'] is True and isinstance(body['id'], int)
    with sqlite3.connect(env['main_db']) as con:
        row = con.execute('SELECT thread_id, message_id, rating, question, answer_excerpt FROM feedback WHERE id = ?', (body['id'],)).fetchone()
    assert row == ('thread-abc-123', 'm1', 1, 'Q', 'Answer text')
    r = httpx.post(env['main'] + '/feedback', headers=hdrs(visitor=ip()), json={'rating': 0})
    assert (r.status_code, r.json()['error']) == (400, 'bad_rating')
    r = httpx.post(env['main'] + '/feedback', headers=hdrs(visitor=ip()), json={'rating': '-1', 'message_id': 'bad id!'})
    assert r.status_code == 201
    with sqlite3.connect(env['main_db']) as con:
        assert con.execute('SELECT message_id, rating FROM feedback WHERE id = ?', (r.json()['id'],)).fetchone() == (None, -1)


def test_thread_round_trip(env):
    tid = 'tst' + uuid.uuid4().hex[:12]
    msgs = [{'role': 'user', 'content': 'Q1'}, {'role': 'assistant', 'content': 'A1', 'sources': ['Debt memo']}]
    r = httpx.post(env['main'] + '/thread', headers=hdrs(visitor=ip()), json={'thread_id': tid, 'persona': 'Portal', 'title': '<b>Debt</b> questions', 'messages_json': msgs})
    assert r.status_code == 200 and r.json()['ok'] is True and r.json()['thread_id'] == tid
    g = httpx.get(env['main'] + '/thread/' + tid, headers={'Origin': GH}).json()
    assert g['ok'] is True and g['thread_id'] == tid and g['persona'] == 'portal' and g['title'] == 'Debt questions' and g['messages'] == msgs
    created = g['created_at']
    r = httpx.post(env['main'] + '/thread', headers=hdrs(visitor=ip()), json={'thread_id': tid, 'title': 'Renamed', 'messages_json': json.dumps(msgs + [{'role': 'user', 'content': 'Q2'}])})
    g2 = httpx.get(env['main'] + '/thread/' + tid).json()
    assert g2['title'] == 'Renamed' and len(g2['messages']) == 3 and g2['created_at'] == created and g2['updated_at'] >= g['updated_at']
    assert httpx.get(env['main'] + '/thread/nope-not-here').status_code == 404
    assert httpx.get(env['main'] + '/thread/bad%20id').json()['error'] == 'bad_thread_id'
    r = httpx.post(env['main'] + '/thread', headers=hdrs(visitor=ip()), json={'thread_id': 'short', 'messages_json': []})
    assert (r.status_code, r.json()['error']) == (400, 'bad_thread_id')
    r = httpx.post(env['main'] + '/thread', headers=hdrs(visitor=ip()), json={'thread_id': tid, 'messages_json': '{"a":1}'})
    assert (r.status_code, r.json()['error']) == (400, 'bad_messages_json')


def test_stats_counts(env):
    st = httpx.get(env['main'] + '/stats', headers={'Origin': GH})
    assert st.status_code == 200 and st.headers['cache-control'] == 'public, max-age=60'
    s = st.json()
    with sqlite3.connect(env['main_db']) as con:
        threads = con.execute('SELECT COUNT(*) FROM threads').fetchone()[0]
        fb = con.execute('SELECT COUNT(*), SUM(rating > 0), SUM(rating < 0) FROM feedback').fetchone()
        req = con.execute('SELECT requests FROM usage_daily').fetchone()[0]
    assert s['ok'] is True and s['db'] is True and s['version'] == '2.0.0' and s['model'] == 'claude-opus-5-5' and s['daily_cap'] == 400
    assert s['knowledge']['docs'] > 100 and s['knowledge']['chunks'] > s['knowledge']['docs']
    assert s['threads'] == threads and s['feedback'] == fb[0] and s['feedback_up'] == fb[1] and s['feedback_down'] == fb[2]
    assert s['today']['requests'] == req and s['today']['tokens_out'] > 0 and s['today']['tokens_in'] > 0
    if threads:
        assert s['messages'] >= 1


# ── chat log (Vercel Blob, mocked) ───────────────────────────────────────────
def logged(env, question, prefix='chats/', wait=6.0):
    """The stored records whose question is `question`, as [(pathname, {'headers', 'record'})]."""
    deadline = time.time() + wait
    while True:
        stored = httpx.get(env['mock'] + '/_blobs').json()
        hits = [(k, {'headers': v['headers'], 'record': json.loads(v['body'])}) for k, v in stored.items() if k.startswith(prefix) and json.loads(v['body']).get('question') == question]
        if hits or time.time() > deadline:
            return hits
        time.sleep(0.1)


def test_chat_log_keeps_question_answer_and_reasoning(env):
    q = 'What will lenders ask about roll-up debt? ' + uuid.uuid4().hex[:6]
    hist = [{'role': 'user', 'content': 'Earlier question'}, {'role': 'assistant', 'content': 'Earlier answer'}]
    _, _, events = chat(env['main'], q, page='/app.html#/briefing', messages=hist)
    hits = logged(env, q)
    assert len(hits) == 1
    path, b = hits[0]
    assert re.match(r'^chats/\d{4}/\d{2}/\d{2}/\d{6}-[0-9a-f]{10}\.json$', path)
    assert b['headers'] == {'x-api-version': '12', 'x-vercel-blob-access': 'private', 'x-add-random-suffix': '0', 'x-content-type': 'application/json', 'x-vercel-blob-store-id': 'teststore'}
    r = b['record']
    assert (r['source'], r['persona'], r['page'], r['origin'], r['effort']) == ('server', 'portal', '/app.html#/briefing', GH, 'high')
    assert re.match(r'^v-[0-9a-f]{16}$', r['visitor']) and '203.0.113' not in json.dumps(r)   # a hashed visitor id, never the address
    assert r['history'] == hist
    assert r['answer'] == ''.join(e['text'] for e in events if e['type'] == 'text')
    assert r['thinking'] == 'SECRET-THINKING: weigh lender questions.'
    assert 'Thinking it through' in r['steps'] and r['sources'][0]['n'] == 1 and set(r['sources'][0]) == {'n', 'title', 'url', 'kind'}
    assert (r['outcome'], r['error'], r['model'], r['stop_reason'], r['agent_steps'], r['tokens']) == ('answered', None, 'claude-opus-5-5', 'end_turn', 1, {'in': 3120, 'out': 640})
    assert re.match(r'^[0-9a-f]{10}$', r['id']) and r['at'].endswith('Z') and r['seconds'] >= 0


def test_chat_log_keeps_failed_and_abandoned_answers(env):
    q = 'No [mock:refusal] ' + uuid.uuid4().hex[:6]
    chat(env['main'], q)
    assert logged(env, q)[0][1]['record']['outcome'] == 'refused'
    q = 'Busy [mock:overloaded] ' + uuid.uuid4().hex[:6]
    chat(env['main'], q)
    r = logged(env, q)[0][1]['record']
    assert r['outcome'] == 'error' and r['error']['code'] == 'upstream_unavailable' and r['answer']   # the partial answer is kept
    q = 'Long one [mock:slow] ' + uuid.uuid4().hex[:6]
    with httpx.stream('POST', env['main'] + '/chat', headers=hdrs(visitor=ip()), json={'question': q}, timeout=30) as resp:
        got = 0
        for line in resp.iter_lines():
            if line.startswith('data:') and '"text"' in line:
                got += 1
                if got == 2:
                    break
    r = logged(env, q)[0][1]['record']
    assert r['outcome'] == 'left early' and r['answer']


def test_browser_answers_and_ratings_are_logged(env):
    q = 'Which company has the most technicians? ' + uuid.uuid4().hex[:6]
    r = httpx.post(env['main'] + '/log', headers=hdrs(visitor=ip()), json={
        'persona': 'PP', 'question': q, 'read_as': 'technicians by company', 'kind': 'grounded', 'intent': 'techs', 'engine': 'From the portfolio data',
        'answer': 'Punctual Pros [1]\n- 120 technicians', 'sources': [{'label': 'Technicians', 'href': 'app.html#/pp'}, 'junk', {'href': 'x'}], 'seconds': 1.234,
        'page': '/redesigns/punctualpros/', 'extra': 'dropped'})
    assert (r.status_code, r.json()) == (202, {'ok': True, 'saved': True})
    rec = logged(env, q)[0][1]['record']
    assert {k: rec[k] for k in ('source', 'persona', 'page', 'read_as', 'kind', 'intent', 'engine', 'answer', 'sources', 'outcome', 'seconds', 'origin')} == {
        'source': 'browser', 'persona': 'pp', 'page': '/redesigns/punctualpros/', 'read_as': 'technicians by company', 'kind': 'grounded', 'intent': 'techs',
        'engine': 'From the portfolio data', 'answer': 'Punctual Pros [1]\n- 120 technicians', 'sources': [{'title': 'Technicians', 'url': 'app.html#/pp'}],
        'outcome': 'answered', 'seconds': 1.2, 'origin': GH}
    assert 'extra' not in rec and rec['visitor'].startswith('v-')
    r = httpx.post(env['main'] + '/log', headers=hdrs(visitor=ip()), json={'question': 'Stopped one ' + q, 'kind': 'stopped', 'seconds': 'soon'})
    rec = logged(env, 'Stopped one ' + q)[0][1]['record']
    assert (rec['outcome'], rec['seconds'], rec['persona']) == ('stopped', None, 'portal')
    r = httpx.post(env['main'] + '/log', headers=hdrs(visitor=ip()), json={'answer': 'no question'})
    assert (r.status_code, r.json()['error']) == (400, 'missing_question')
    assert httpx.post(env['main'] + '/log', headers=hdrs(EVIL, visitor=ip()), json={'question': 'x'}).status_code == 403
    r = httpx.post(env['nokey'] + '/log', headers=hdrs(visitor=ip()), json={'question': 'x'})
    assert (r.status_code, r.json()) == (202, {'ok': True, 'saved': False})   # no store: accepted, nothing kept
    r = httpx.post(env['main'] + '/feedback', headers=hdrs(visitor=ip()), json={'thread_id': 't-1', 'message_id': 'm-9', 'rating': -1, 'question': q, 'answer_excerpt': '<p>Too vague</p>'})
    assert r.status_code == 201 and isinstance(r.json()['id'], int)
    rat = logged(env, q, prefix='ratings/')[0][1]['record']
    assert {k: rat[k] for k in ('rating', 'thread_id', 'message_id', 'answer_excerpt', 'origin')} == {'rating': -1, 'thread_id': 't-1', 'message_id': 'm-9', 'answer_excerpt': 'Too vague', 'origin': GH}


def test_export_script_downloads_and_flattens(env, tmp_path):
    tag = uuid.uuid4().hex[:6]
    chat(env['main'], 'Export check ' + tag)
    for i in range(2):   # more than one listing page (the mock pages two at a time)
        httpx.post(env['main'] + '/log', headers=hdrs(visitor=ip()), json={'question': f'Local {i} {tag}', 'kind': 'retrieval', 'answer': 'From the data'})
    httpx.post(env['main'] + '/feedback', headers=hdrs(visitor=ip()), json={'rating': 1, 'question': 'Export check ' + tag})
    assert logged(env, 'Export check ' + tag, prefix='ratings/')
    out = tmp_path / 'logs'
    run_env = {**os.environ, 'BLOB_READ_WRITE_TOKEN': BLOB_TOKEN, 'VERCEL_BLOB_API_URL': env['mock'] + '/blob'}
    p = subprocess.run([sys.executable, EXPORT, '--out', str(out)], env=run_env, capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    assert BLOB_TOKEN not in p.stdout + p.stderr
    rows = [json.loads(line) for line in open(out / 'chats.jsonl')]
    assert {'Export check ' + tag, f'Local 0 {tag}', f'Local 1 {tag}'} <= {r['question'] for r in rows}
    with open(out / 'chats.csv', newline='') as f:
        row = next(r for r in csv.DictReader(f) if r['question'] == 'Export check ' + tag)
    assert (row['source'], row['outcome'], row['tokens_in'], row['history_turns']) == ('server', 'answered', '3120', '0')
    assert row['answer'].startswith('**Short answer:**') and row['thinking'].startswith('SECRET-THINKING') and ' → ' in row['steps']
    with open(out / 'ratings.csv', newline='') as f:
        assert any(r['question'] == 'Export check ' + tag and r['rating'] == '1' for r in csv.DictReader(f))
    again = subprocess.run([sys.executable, EXPORT, '--out', str(out)], env=run_env, capture_output=True, text=True, timeout=60)
    assert again.returncode == 0 and '(0 new)' in again.stdout   # files already downloaded are skipped
    future = subprocess.run([sys.executable, EXPORT, '--out', str(tmp_path / 'none'), '--since', '2999-01-01'], env=run_env, capture_output=True, text=True, timeout=60)
    assert future.returncode == 0 and 'chats: 0 records' in future.stdout
    bad = subprocess.run([sys.executable, EXPORT, '--out', str(tmp_path / 'bad')], env={**run_env, 'BLOB_READ_WRITE_TOKEN': 'wrong'}, capture_output=True, text=True, timeout=60)
    assert bad.returncode != 0 and 'answered 403' in bad.stderr


def test_unknown_routes_and_methods(env):
    r = httpx.get(env['main'] + '/nope')
    assert (r.status_code, r.json()['error']) == (404, 'not_found')
    r = httpx.post(env['main'] + '/nope', headers=hdrs(visitor=ip()), json={})
    assert (r.status_code, r.json()['error']) == (404, 'not_found')
    r = httpx.put(env['main'] + '/chat', headers={'Origin': GH})
    assert (r.status_code, r.json()['error']) == (405, 'method_not_allowed')
    assert httpx.get(env['main'] + '/docs').status_code == 404


def test_schema_matches_worker():
    """The embedded schema creates the same tables and indexes as worker/schema.sql."""
    worker = os.path.join(procs.SERVER_DIR, '..', 'worker', 'schema.sql')
    if not os.path.exists(worker):
        pytest.skip('worker/schema.sql not present (deployed without the repo)')
    import importlib.util
    spec = importlib.util.spec_from_file_location('bsp_app', os.path.join(procs.SERVER_DIR, 'app.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    def shape(sql):
        con = sqlite3.connect(':memory:')
        con.executescript(sql)
        rows = con.execute("SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        cols = {t: con.execute(f'PRAGMA table_info({t})').fetchall() for _, t, _ in rows if _ == 'table'}
        return rows, cols
    with open(worker) as f:
        assert shape(mod.SCHEMA) == shape(f.read())


def test_db_path_defaults(monkeypatch):
    import importlib.util
    spec = importlib.util.spec_from_file_location('bsp_app2', os.path.join(procs.SERVER_DIR, 'app.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.delenv('DB_PATH', raising=False)
    monkeypatch.delenv('RAILWAY_VOLUME_MOUNT_PATH', raising=False)
    assert mod.db_path() == os.path.join(procs.SERVER_DIR, 'data', 'bsp_assistant.db')
    monkeypatch.setenv('RAILWAY_VOLUME_MOUNT_PATH', '/data')
    assert mod.db_path() == '/data/bsp_assistant.db'
    monkeypatch.setenv('DB_PATH', '/x/y.db')
    assert mod.db_path() == '/x/y.db'
    monkeypatch.setenv('FAKE_ANTHROPIC_URL', 'http://127.0.0.1:1/')
    assert mod.anthropic_base_url() == 'http://127.0.0.1:1'
    monkeypatch.setenv('FAKE_ANTHROPIC_URL', 'http://127.0.0.1:1/v1/messages')
    assert mod.anthropic_base_url() == 'http://127.0.0.1:1'
    monkeypatch.delenv('FAKE_ANTHROPIC_URL')
    assert mod.anthropic_base_url() is None   # the SDK's default, api.anthropic.com


def test_main_py_starts_on_port(tmp_path):
    """Railpack's zero-config start (`python main.py`) serves /health on $PORT."""
    import subprocess
    import sys
    port = procs.free_port()
    env = {k: v for k, v in os.environ.items() if k != 'ANTHROPIC_API_KEY'}
    env.update(PORT=str(port), HOST='127.0.0.1', DB_PATH=str(tmp_path / 'm.db'))
    p = procs.Proc([sys.executable, 'main.py'], str(tmp_path / 'main.log'), env=env, cwd=procs.SERVER_DIR, ready_url=f'http://127.0.0.1:{port}/health')
    try:
        h = httpx.get(f'http://127.0.0.1:{port}/health').json()
        assert h['ok'] is True and h['llm'] is False and h['db'] is True
    finally:
        p.stop()
