"""
End-to-end tests for server/app.py over real HTTP (httpx), against a local mock of the Claude API.
The fixtures start the mock and four backend instances (normal, daily cap of 1, no Claude key, a short key-check interval)
on free ports with throwaway SQLite files, and stop them afterwards.

  cd server && python3 -m pytest -q tests
"""

import base64
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
        ports = {k: procs.free_port() for k in ('main', 'capped', 'nokey', 'health')}
        main = procs.start_server(ports['main'], str(d / 'main.log'), str(d / 'main.db'), mport, RL_PER_10MIN=5, UPSTREAM_TOTAL_TIMEOUT=3,
                                  BLOB_READ_WRITE_TOKEN=BLOB_TOKEN, VERCEL_BLOB_API_URL=f'http://127.0.0.1:{mport}/blob')
        started.append(main)
        capped = procs.start_server(ports['capped'], str(d / 'capped.log'), str(d / 'capped.db'), mport, DAILY_CAP=1)
        started.append(capped)
        nokey = procs.start_server(ports['nokey'], str(d / 'nokey.log'), str(d / 'nokey.db'), mport, key=None)
        started.append(nokey)
        health = procs.start_server(ports['health'], str(d / 'health.log'), str(d / 'health.db'), mport, HEALTH_PROBE_SECONDS=1)   # the key check may run every second here
        started.append(health)
        yield {
            'health': f'http://127.0.0.1:{ports["health"]}',
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
        assert {k: j[k] for k in ('ok', 'model', 'version', 'db', 'llm', 'kv', 'log')} == {'ok': True, 'model': 'claude-opus-5-5', 'version': '2.2.0', 'db': True, 'llm': True, 'kv': True, 'log': True}
        assert j['homes']['sales'] > 50000 and j['homes']['market_homes'] > 0 and j['homes']['built_at'] and re.fullmatch(r'\d{4}-\d{2}', j['homes']['through']['NJ']['full_month'])
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
    assert events[0] == {'type': 'meta', 'model': 'claude-opus-5-5', 'version': '2.2.0'}
    src = next(e for e in events if e['type'] == 'sources')['sources']
    assert src[0] == {'n': 1, 'title': 'Debt memo', 'url': 'app.html#debt', 'publisher': 'This page', 'date': '', 'kind': 'page'}
    assert len(src) > 1 and all(s['n'] == i + 1 for i, s in enumerate(src))   # knowledge-base sources follow the page context
    text = ''.join(e['text'] for e in events if e['type'] == 'text')
    assert text.startswith('**Short answer:** lenders will test') and 'Show organic growth separately [2]' in text
    assert 'SECRET-THINKING' not in text   # thinking never mixes into the answer text …
    assert ''.join(e['text'] for e in events if e['type'] == 'thinking') == 'SECRET-THINKING: weigh lender questions.'   # … it comes as its own events
    assert events[-1] == {'type': 'done', 'stop_reason': 'end_turn', 'model': 'claude-opus-5-5', 'steps': 1, 'mode': 'chat',
                          'usage': {'input_tokens': 3120, 'output_tokens': 640, 'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}}


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
    assert 'deal_model' not in system['text'] and 'web search' not in system['text'] and 'new_homeowners' not in system['text'] and 'property_brief' not in system['text']
    assert [t['name'] for t in b['tools']] == ['search_knowledge', 'read_source']   # a concept-site assistant does not run deal maths, web searches or home-records lookups
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
    assert [t.get('name') for t in b['tools']] == ['search_knowledge', 'read_source', 'deal_model', 'new_homeowners', 'property_brief', 'web_search']
    assert '12. Home-sales records' in s and 'Never give owner, buyer or seller names' in s and 'no record holds that' in s
    assert all(t['eager_input_streaming'] is True for t in b['tools'][:5]) and 'never returned' in b['tools'][3]['description']
    assert b['tools'][5] == {'type': 'web_search_20260209', 'name': 'web_search', 'max_uses': 3}
    src = b['messages'][-1]['content'][0]['text']
    assert src.startswith('<sources>\n[1] Debt (This page) (from the page the visitor is on)\nLeverage & terms\n\n[2] Plan (This page) app.html#plan (from the page the visitor is on)\nx\n\n[3] ')
    # the rule that makes a question about "this view" get answered from the page context, in the same words the sources block uses
    assert '1a. A source marked "(from the page the visitor is on)"' in s and 'answer from that source first' in s and 'Do not answer with a general overview instead.' in s


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


def test_home_records_tools(env):
    """BSP Desk can list new homeowners and brief one address; both results reach the model with numbered sources."""
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], "Who should we send this month's new-homeowner promotion to in Ocean County? [mock:homes]")
    assert status == 200 and events[-1]['type'] == 'done' and events[-1]['steps'] == 2
    assert {'type': 'status', 'text': 'Looking up new homeowners in Ocean County'} in events
    assert ''.join(e['text'] for e in events if e['type'] == 'text').startswith('**Short answer:**')
    reqs = mock_requests(env)
    res = reqs[1]['body']['messages'][-1]['content'][0]
    assert res['type'] == 'tool_result' and not res.get('is_error') and len(res['content']) < 7000
    text = res['content']
    final = [e for e in events if e['type'] == 'sources'][-1]['sources']
    data = [s for s in final if s['kind'] == 'data']
    assert data and data[0]['title'].startswith('New Jersey home sales file') and data[0]['publisher'] == 'NJ Division of Taxation' and data[0]['date']
    assert text.startswith(f"Sources for this result (cite them as [n]):\n[{data[0]['n']}] New Jersey home sales file")
    assert 'NEW HOMEOWNERS: ' in text and 'Ocean' in text and 'Data through' in text and 'not sales made this month' in text
    assert 'Owner names are not held' in text and 'Ranking rule' in text and re.search(r'\n1\. .+ \| built \d{4} \| sold ', text)
    assert not re.search(r'\b(buyer|seller|grantee|grantor)\b\s*:', text, re.I)

    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], 'I got a call from 1800 Lambs Gap Road in Hampden Township, tell me what you know about the structure and what we can offer [mock:brief]')
    assert status == 200 and events[-1]['type'] == 'done' and events[-1]['steps'] == 2
    assert {'type': 'status', 'text': 'Building a property brief for 1800 Lambs Gap Road'} in events
    res = mock_requests(env)[1]['body']['messages'][-1]['content'][0]
    text = res['content']
    final = [e for e in events if e['type'] == 'sources'][-1]['sources']
    data = [s for s in final if s['kind'] == 'data']
    assert data and not res.get('is_error') and text.startswith(f"Sources for this result (cite them as [n]):\n[{data[0]['n']}] ")
    assert 'PROPERTY BRIEF: 1800 LAMBS GAP' in text and '[recorded: ' in text and '[inferred' in text
    assert 'What to check on arrival' in text and 'Possible offers' in text and 'Evidence:' in text and 'no public permit feed' in text


def test_home_records_tools_stay_off_the_concept_sites(env):
    for persona in ('pp', 'cet', 'fl', 'ts', 'bpi', 'fh'):
        httpx.delete(env['mock'] + '/_requests')
        status, _, events = chat(env['main'], 'New homeowners in Ocean County? [mock:homes]', persona=persona)
        reqs = mock_requests(env)
        assert [t['name'] for t in reqs[0]['body']['tools']] == ['search_knowledge', 'read_source']
        assert 'Home-sales records' not in reqs[0]['body']['system'][0]['text']
        res = reqs[1]['body']['messages'][-1]['content'][0]   # a call the model was never offered is refused, not run
        assert res['is_error'] is True and res['content'] == 'Unknown tool new_homeowners.'
        assert status == 200 and events[-1]['type'] == 'done' and not any(s['kind'] == 'data' for e in events if e['type'] == 'sources' for s in e['sources'])


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
    for o in ('http://127.0.0.1:8765', 'http://localhost:8765', 'https://broadsky-agent.vercel.app', 'https://broadsky-desk.vercel.app'):
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
    assert s['ok'] is True and s['db'] is True and s['version'] == '2.2.0' and s['model'] == 'claude-opus-5-5' and s['daily_cap'] == 400
    assert s['knowledge']['docs'] > 100 and s['knowledge']['chunks'] > s['knowledge']['docs']
    assert s['homes']['sales'] > 50000 and set(s['homes']['through']) == {'NJ', 'PA'}
    assert s['threads'] == threads and s['feedback'] == fb[0] and s['feedback_up'] == fb[1] and s['feedback_down'] == fb[2]
    assert s['today']['requests'] == req and s['today']['tokens_out'] > 0 and s['today']['tokens_in'] > 0
    if threads:
        assert s['messages'] >= 1


# ── model state on /health and /stats ───────────────────────────────────────
def probe_mode(env, mode):
    assert httpx.post(env['mock'] + '/_probe', json={'mode': mode}).json() == {'ok': True, 'mode': mode}


def key_checks(env):
    """The key-check requests the mock received (the only requests the backend sends without "stream")."""
    return [r['body'] for r in mock_requests(env) if not r['body'].get('stream')]


def test_health_reports_the_outcome_of_real_calls(env):
    """/health is free: it never calls the provider, and it says what the last real call found. A rejected key or a billing
    problem turns llm off; a rate limit or an outage is reported but leaves it on; the next good answer clears it."""
    base = env['health']
    httpx.delete(env['mock'] + '/_requests')
    h = httpx.get(base + '/health').json()
    ms = h['model_state']
    assert (h['llm'], h['llm_state'], ms['state'], ms['ok'], ms['checked_at'], ms['source'], ms['last_call'], ms['probe']) == (True, 'unverified', 'unverified', False, None, None, None, None)
    assert 'has not answered a question' in ms['message'] and 'check' not in ms

    def state_after(question):
        status, _, body = chat(base, question)
        j = httpx.get(base + '/health').json()
        assert j['llm_state'] == j['model_state']['state'] and j['model_state']['ok'] is (j['llm_state'] == 'ok')
        return status, (body.get('error') if isinstance(body, dict) else None), j['llm'], j['llm_state'], j['model_state']

    s, err, llm, state, ms = state_after('Hello')
    assert (s, llm, state, ms['source'], ms['last_call']['http']) == (200, True, 'ok', 'chat', 200) and ms['checked_at'].endswith('Z')
    s, err, llm, state, ms = state_after('x [mock:auth]')
    assert (s, err, llm, state, ms['last_call']['http']) == (502, 'backend_auth', False, 'auth', 401) and 'rejected the key' in ms['message']
    assert procs.TEST_KEY not in json.dumps(ms) and 'x-api-key' not in json.dumps(ms)   # no key and no provider text in the payload
    s, err, llm, state, ms = state_after('x [mock:billing]')
    assert (s, err, llm, state, ms['last_call']['http']) == (502, 'backend_billing', False, 'billing', 400) and 'billing problem' in ms['message']
    s, err, llm, state, ms = state_after('x [mock:billing402]')
    assert (s, err, llm, state, ms['last_call']['http']) == (502, 'backend_billing', False, 'billing', 402)
    s, err, llm, state, ms = state_after('x [mock:busy]')
    assert (s, err, llm, state) == (429, 'upstream_busy', True, 'rate_limited')
    s, err, llm, state, ms = state_after('x [mock:down]')
    assert (s, err, llm, state) == (503, 'upstream_unavailable', True, 'down')
    st = httpx.get(base + '/stats').json()   # /stats carries the same block
    assert (st['llm'], st['llm_state'], st['model_state']['state'], st['model_state']['last_call']['http']) == (True, 'down', 'down', 529)
    s, err, llm, state, ms = state_after('Hello again')
    assert (s, llm, state) == (200, True, 'ok')
    _, _, ev = chat(base, 'Busy [mock:overloaded]')   # an outage in the middle of an answer counts too
    assert ev[-1]['code'] == 'upstream_unavailable' and httpx.get(base + '/health').json()['llm_state'] == 'down'
    assert key_checks(env) == []   # none of this ran a key check


def test_health_deep_runs_one_key_check_and_keeps_the_result(env):
    """GET /health?deep=1 sends one request with max_tokens 0, at most once per ten minutes per instance; in between it returns the stored result."""
    base = env['capped']   # an instance with the default ten-minute interval
    probe_mode(env, 'ok')
    try:
        httpx.delete(env['mock'] + '/_requests')
        assert httpx.get(base + '/health').json()['model_state']['probe'] is None and key_checks(env) == []   # plain /health never checks
        h = httpx.get(base + '/health?deep=1', headers={'Origin': GH})
        j = h.json()
        ms = j['model_state']
        assert h.status_code == 200 and h.headers['cache-control'] == 'no-store' and h.headers['access-control-allow-origin'] == GH
        assert (j['llm'], j['llm_state'], ms['source'], ms['probe']['state'], ms['probe']['http']) == (True, 'ok', 'probe', 'ok', 200)
        assert ms['check'] == {'ran': True, 'cached': False, 'age_seconds': 0, 'next_check_in_seconds': 600}
        sent = key_checks(env)
        assert len(sent) == 1 and sent[0] == {'model': 'claude-opus-5-5', 'max_tokens': 0, 'messages': [{'role': 'user', 'content': 'ping'}]}   # no tools, no system prompt, no output
        probe_mode(env, 'auth')   # the key is revoked a moment later …
        for _ in range(3):
            j = httpx.get(base + '/health?deep=1').json()
            c = j['model_state']['check']
            assert (c['ran'], c['cached']) == (False, True) and 590 <= c['next_check_in_seconds'] <= 600 and c['age_seconds'] <= 10
            assert (j['llm'], j['llm_state']) == (True, 'ok')   # … and the stored result is returned until the window passes
        assert len(key_checks(env)) == 1   # hammering the endpoint cannot spend credit
        assert httpx.get(base + '/stats').json()['today']['requests'] in (0, 2)   # and a key check is not a question: the daily count is untouched
    finally:
        probe_mode(env, 'ok')


def test_health_deep_finds_a_bad_key_and_a_billing_problem(env):
    base = env['health']   # HEALTH_PROBE_SECONDS=1: a new check is allowed every second

    def deep(mode):
        probe_mode(env, mode)
        time.sleep(1.15)
        j = httpx.get(base + '/health?deep=1').json()
        assert j['model_state']['check']['ran'] is True and j['model_state']['source'] == 'probe'
        return j['llm'], j['llm_state'], j['model_state']['probe']['http']
    try:
        assert deep('ok') == (True, 'ok', 200)
        assert deep('auth') == (False, 'auth', 401)
        j = httpx.get(base + '/health').json()   # the plain check now reports it too, with a plain-language reason and no secrets
        assert (j['llm'], j['llm_state']) == (False, 'auth') and 'rejected the key' in j['model_state']['message'] and procs.TEST_KEY not in json.dumps(j)
        assert deep('billing') == (False, 'billing', 400)
        assert deep('billing402') == (False, 'billing', 402)
        assert deep('busy') == (True, 'rate_limited', 429)
        assert deep('down') == (True, 'down', 529)
        httpx.delete(env['mock'] + '/_requests')
        assert deep('nozero') == (True, 'ok', 200)   # a provider that will not take max_tokens 0 is asked for one token instead
        assert [b['max_tokens'] for b in key_checks(env)] == [0, 1]
        s, _, ev = chat(base, 'Hello')   # a real answer after a failed check clears the state
        probe_mode(env, 'auth')
        time.sleep(1.15)
        assert httpx.get(base + '/health?deep=1').json()['llm_state'] == 'auth'
        s, _, ev = chat(base, 'Hello')
        assert s == 200 and httpx.get(base + '/health').json()['llm_state'] == 'ok'
        # HTTP 200 is not enough: a web page from a wrong address or a gateway is not a model reply
        httpx.delete(env['mock'] + '/_requests')
        assert deep('html') == (False, 'error', 200) and len(key_checks(env)) == 1
        assert 'not a model answer' in httpx.get(base + '/health').json()['model_state']['message']
        assert deep('ok') == (True, 'ok', 200)
    finally:
        probe_mode(env, 'ok')


def test_an_off_state_clears_once_the_account_is_fixed(env):
    """A billing problem found by a real call turns llm off, and the page then stops sending questions. Plain /health keeps saying
    so (it never calls the provider), and the key check the page asks for (assets/backend.js verify) is what clears it."""
    base = env['health']
    probe_mode(env, 'ok')
    s, _, body = chat(base, 'x [mock:billing]')
    assert (s, body['error']) == (502, 'backend_billing')
    time.sleep(1.15)
    j = httpx.get(base + '/health').json()
    assert (j['llm'], j['llm_state']) == (False, 'billing')
    j = httpx.get(base + '/health?deep=1').json()   # the account was topped up: no redeploy, no successful question
    assert (j['llm'], j['llm_state'], j['model_state']['check']['ran'], j['model_state']['source']) == (True, 'ok', True, 'probe')
    j = httpx.get(base + '/health').json()
    assert (j['llm'], j['llm_state']) == (True, 'ok')


WORKFLOW = os.path.join(os.path.dirname(procs.SERVER_DIR), '.github', 'workflows', 'assistant-health.yml')


def run_health_workflow(url, cwd):
    """Runs the scheduled workflow's own script against a local address. Returns (exit code, output)."""
    lines = open(WORKFLOW, encoding='utf-8').read().split('\n')
    start = next(i for i, l in enumerate(lines) if l.strip() == 'run: |') + 1
    block = [l for l in lines[start:]]
    script = '\n'.join(l[10:] if l.startswith(' ' * 10) else l.strip() for l in block)
    r = subprocess.run(['bash', '-c', script], env={**os.environ, 'HEALTH_URL': url}, capture_output=True, text=True, timeout=120, cwd=str(cwd))
    return r.returncode, r.stdout + r.stderr


@pytest.mark.skipif(not all(any(os.access(os.path.join(d, x), os.X_OK) for d in os.environ.get('PATH', '').split(os.pathsep)) for x in ('bash', 'jq', 'curl')), reason='needs bash, jq and curl')
def test_health_workflow_fails_when_live_answers_are_off(env, tmp_path):
    probe_mode(env, 'ok')
    try:
        code, out = run_health_workflow(env['nokey'] + '/health?deep=1', tmp_path)
        assert code == 1 and "Model state 'no_key'" in out and '::error title=Assistant live answers are off::' in out
        time.sleep(1.15)
        code, out = run_health_workflow(env['health'] + '/health?deep=1', tmp_path)
        assert code == 0 and "model state 'ok'" in out
        probe_mode(env, 'billing')
        time.sleep(1.15)
        code, out = run_health_workflow(env['health'] + '/health?deep=1', tmp_path)
        assert code == 1 and "Model state 'billing'" in out
        # a backend from before the model check: a missing key still fails the job; with a key it passes with a warning
        code, out = run_health_workflow(env['mock'] + '/_oldhealth?llm=0', tmp_path)
        assert code == 1 and '::error title=Assistant live answers are off::' in out and 'does not report a model state' in out
        code, out = run_health_workflow(env['mock'] + '/_oldhealth', tmp_path)
        assert code == 0 and '::warning title=Model check not deployed::' in out
    finally:
        probe_mode(env, 'ok')


def test_health_deep_without_a_key_calls_nobody(env):
    httpx.delete(env['mock'] + '/_requests')
    j = httpx.get(env['nokey'] + '/health?deep=1').json()
    assert (j['llm'], j['llm_state'], j['model_state']['check']) == (False, 'no_key', {'ran': False, 'cached': False, 'reason': 'no_key'})
    assert mock_requests(env) == []


# ── what each question sends ────────────────────────────────────────────────
def test_cache_tokens_reach_the_done_event_and_the_log(env):
    q = 'Cached? [mock:cache] ' + uuid.uuid4().hex[:6]
    _, _, events = chat(env['main'], q)
    assert events[-1]['usage'] == {'input_tokens': 3120, 'output_tokens': 640, 'cache_read_input_tokens': 2000, 'cache_creation_input_tokens': 500}
    r = logged(env, q)[0][1]['record']
    assert r['tokens'] == {'in': 3120, 'out': 640, 'cache_read': 2000, 'cache_write': 500} and r['usage_steps'] == [{'in': 620, 'cache_read': 2000, 'cache_write': 500, 'out': 640}]


def test_repeated_excerpts_are_named_not_resent(env):
    httpx.delete(env['mock'] + '/_requests')
    chat(env['main'], 'Keep searching [mock:loop]')
    reqs = mock_requests(env)
    first, second = (reqs[k]['body']['messages'][-1]['content'][0]['content'] for k in (1, 2))   # the same search, twice
    assert first.startswith('Results for "loop again":') and '(This excerpt is already above; not repeated.)' not in first
    assert second.count('(This excerpt is already above; not repeated.)') == first.count('\n\n[') and 'Nothing new: every result is already above.' in second
    assert len(second) < len(first) / 2 and re.findall(r'^\[\d+\]', second, re.M) == re.findall(r'^\[\d+\]', first, re.M)   # the numbers and titles stay, so it can still cite and read them
    assert reqs[0]['body']['cache_control'] == {'type': 'ephemeral'} and reqs[0]['body']['system'][0]['cache_control'] == {'type': 'ephemeral'}


def test_home_records_question_skips_the_knowledge_lookup(env):
    httpx.delete(env['mock'] + '/_requests')
    _, _, events = chat(env['main'], "Who should get this month's new-homeowner mailer in Ocean County? [mock:homes]")
    src = mock_requests(env)[0]['body']['messages'][-1]['content'][0]['text']
    assert src == '<sources>\n(No excerpts were looked up: this question is answered from the home-sales records. Search the knowledge base if you need more.)\n</sources>'
    assert events[-1]['type'] == 'done' and any(s['kind'] == 'data' for s in [e for e in events if e['type'] == 'sources'][-1]['sources'])
    httpx.delete(env['mock'] + '/_requests')
    chat(env['main'], "Who should get this month's new-homeowner mailer in Ocean County?", persona='pp')   # a concept site has no records tool: it still gets excerpts
    assert mock_requests(env)[0]['body']['messages'][-1]['content'][0]['text'].startswith('<sources>\n[1] ')
    # a private-equity question about "buyers" or "owners" is not a home-records question: it keeps its excerpts and its sources
    for q in NOT_ROUTED[:5] + NOT_ROUTED[7:10]:
        httpx.delete(env['mock'] + '/_requests')
        _, _, events = chat(env['main'], q)
        src = mock_requests(env)[0]['body']['messages'][-1]['content'][0]['text']
        assert src.startswith('<sources>\n[1] ') and 'No excerpts were looked up' not in src and len(re.findall(r'^\[\d+\] ', src, re.M)) >= 3, q
        assert any(e['type'] == 'sources' for e in events), q
    httpx.delete(env['mock'] + '/_requests')
    chat(env['main'], NOT_ROUTED[0], mode='voice')   # and in voice mode it is offered no home-records tool
    assert 'tools' not in mock_requests(env)[0]['body'] and 'new_homeowners' not in mock_requests(env)[0]['body']['system'][0]['text']


def test_older_answers_are_shortened_in_history(env):
    httpx.delete(env['mock'] + '/_requests')
    hist = [{'role': 'user', 'content': 'One'}, {'role': 'assistant', 'content': 'a' * 5000}, {'role': 'user', 'content': 'Two'}, {'role': 'assistant', 'content': 'b' * 5000}]
    chat(env['main'], 'Three', messages=hist)
    sent = mock_requests(env)[0]['body']['messages']
    assert [len(m['content']) for m in sent[:4]] == [3, 2004, 3, 5000] and sent[1]['content'].endswith(' […]')   # the latest answer is kept whole


# ── voice mode ──────────────────────────────────────────────────────────────
NOT_ROUTED = ['List the recent buyers of home services companies', 'Show recent buyers in HVAC roll-ups', 'Find new buyers for Smith + Howard',
              'Give me the list of new owners at Thomas Scientific', 'Send me the list of recent buyers BSP lost deals to',
              "BSP's office is at 350 Park Avenue. What do we know about the firm?", 'What do we know about the building at 350 Park Avenue in New York?',
              'Show recent buyers of home-services companies', 'List the new owners of Smith + Howard', 'Send me the list of recent buyers of law-firm services companies',
              'What is this page worth reading for?', 'what is the weather worth watching', 'What are swim trunks worth?']
SPOKEN = ('Leadership. Tyler Zachem leads BSP as Managing Partner. He co-founded it in 2021. First, see the team page for more. '
          'Second, Fund I is $335M. Details today. Done.')


def spoken(events):
    return ''.join(e['text'] for e in events if e['type'] == 'text')


def test_voice_answer_is_plain_speech(env):
    """mode "voice": the same answer stream, but whatever markdown the model writes never reaches it."""
    httpx.delete(env['mock'] + '/_requests')
    q = 'Who leads BSP? [mock:md] ' + uuid.uuid4().hex[:6]
    status, _, events = chat(env['main'], q, mode='voice', context=[{'title': 'Team', 'text': 'x' * 5000, 'href': 'app.html#team'}])
    assert status == 200 and [e['type'] for e in events][0] == 'meta' and events[-1]['type'] == 'done'
    assert spoken(events) == SPOKEN and not re.search(r'[*#`\[\]_>|]|https?:|\n|  ', spoken(events))
    assert not any(e['type'] == 'thinking' for e in events) and 'SECRET-THINKING' not in json.dumps(events)   # reasoning is never shown or spoken
    src = [e for e in events if e['type'] == 'sources'][-1]['sources']   # the screen still gets the sources
    assert src[0]['kind'] == 'page' and 2 <= len(src) <= 5
    assert (events[-1]['mode'], events[-1]['steps'], events[-1]['stop_reason']) == ('voice', 1, 'end_turn')
    reqs = mock_requests(env)
    assert len(reqs) == 1
    b = reqs[0]['body']
    assert (b['max_tokens'], b['output_config'], b['fallbacks']) == (3000, {'effort': 'low'}, 'default')
    assert all(k not in b for k in ('tools', 'tool_choice', 'thinking', 'cache_control'))   # no tools, default thinking
    system = b['system'][0]
    assert 'cache_control' not in system and 'cache_control' not in json.dumps(b)   # one call, so nothing would read a cache entry back: none is written
    assert system['text'].startswith("You are BSP Desk, the in-house analyst on Broad Sky's desk")
    assert 'this answer is spoken aloud' in system['text'] and 'under about 80 words' in system['text'] and 'the knowledge base does not cover it' in system['text']
    assert 'Format for a chat panel' not in system['text'] and 'search_knowledge' not in system['text'] and 'deal_model' not in system['text']
    block = b['messages'][-1]['content'][0]['text']
    assert block.startswith('<sources>\n[1] Team (This page) app.html#team (from the page the visitor is on)\n' + 'x' * 3000 + ' […]') and len(re.findall(r'^\[\d+\] ', block, re.M)) <= 5
    r = logged(env, q)[0][1]['record']
    assert (r['mode'], r['route'], r['answer'], r['thinking'], r['effort'], r['agent_steps']) == ('voice', None, SPOKEN, '', 'low', 1)


def test_voice_is_one_step_with_no_research_loop(env):
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], 'Keep searching [mock:loop]', mode='voice')   # in chat mode this question runs six steps
    assert status == 200 and events[-1]['type'] == 'done' and events[-1]['steps'] == 1 and len(mock_requests(env)) == 1
    assert spoken(events).startswith('Short answer: lenders will test') and '[1]' not in spoken(events) and '**' not in spoken(events)
    # a model that writes a list anyway is not read as one run-on sentence: each item and heading ends with a full stop
    assert spoken(events).endswith('They usually ask three things: How much EBITDA comes from acquired versus organic growth. Leverage after each add-on, est. at closing. '
                                   'Integration cost and synergy timing. Next actions. Build a covenant headroom table by quarter. Show organic growth separately.')
    httpx.delete(env['mock'] + '/_requests')
    hist = [{'role': 'user' if k % 2 == 0 else 'assistant', 'content': f'turn {k} ' + 'y' * 3000} for k in range(10)]
    chat(env['main'], 'And then?', mode='voice', messages=hist)
    sent = mock_requests(env)[0]['body']['messages']
    assert len(sent) == 7 and sent[0]['content'].startswith('turn 4 ') and all(len(m['content']) <= 1505 for m in sent[:6])   # the last few turns, shortened


def test_voice_allows_one_tool_call_for_a_routed_question(env):
    httpx.delete(env['mock'] + '/_requests')
    status, _, events = chat(env['main'], "Who should get this month's new-homeowner mailer in Ocean County? [mock:homes]", mode='voice')
    assert status == 200 and events[-1]['type'] == 'done' and events[-1]['steps'] == 2
    assert {'type': 'status', 'text': 'Looking up new homeowners in Ocean County'} in events
    assert any(s['kind'] == 'data' for s in [e for e in events if e['type'] == 'sources'][-1]['sources'])
    assert spoken(events).startswith('Short answer: lenders will test') and not re.search(r'[*#\[\]]', spoken(events))
    reqs = mock_requests(env)
    assert len(reqs) == 2
    one, two = reqs[0]['body'], reqs[1]['body']
    assert [t['name'] for t in one['tools']] == ['new_homeowners', 'property_brief'] and one['tool_choice'] == {'type': 'auto', 'disable_parallel_tool_use': True}
    assert 'call new_homeowners once' in one['system'][0]['text'] and 'Never give owner, buyer or seller names' in one['system'][0]['text']
    assert one['system'][0]['cache_control'] == {'type': 'ephemeral'} and two['system'] == one['system'] and 'cache_control' not in one   # two calls: the second reads the fixed part back
    assert two['tool_choice'] == {'type': 'none'} and 'NEW HOMEOWNERS: ' in two['messages'][-1]['content'][0]['content']

    httpx.delete(env['mock'] + '/_requests')
    _, _, events = chat(env['main'], 'What could BSP pay for CET and still earn 25% a year? [mock:deal]', mode='voice')
    reqs = mock_requests(env)
    assert len(reqs) == 2 and [t['name'] for t in reqs[0]['body']['tools']] == ['deal_model'] and events[-1]['steps'] == 2
    assert 'IRR' in reqs[1]['body']['messages'][-1]['content'][0]['content'] and 'call deal_model once' in reqs[0]['body']['system'][0]['text']

    # a model that keeps asking still gets one lookup: a second tool, or a tool it was not offered, is refused and the next call must answer
    httpx.delete(env['mock'] + '/_requests')
    plan = base64.urlsafe_b64encode(json.dumps([['new_homeowners', {'county': 'Ocean'}], ['new_homeowners', {'county': 'Monmouth'}]]).encode()).decode().rstrip('=')
    _, _, events = chat(env['main'], f'New homeowner list for Ocean County [mock:plan:{plan}]', mode='voice')
    assert len(mock_requests(env)) == 2 and events[-1]['type'] == 'done' and events[-1]['steps'] == 2
    httpx.delete(env['mock'] + '/_requests')
    _, _, events = chat(env['main'], 'New homeowner list for Ocean County [mock:tool]', mode='voice')   # asks for search_knowledge, which voice does not offer
    reqs = mock_requests(env)
    res = reqs[1]['body']['messages'][-1]['content'][0]
    assert len(reqs) == 2 and res['is_error'] is True and res['content'].startswith('Only one lookup is allowed') and events[-1]['type'] == 'done'


def test_voice_answer_cut_at_the_token_ceiling_says_so(env):
    """stop_reason "max_tokens" is not a finished answer. Text already spoken is closed with a short notice; when nothing was
    spoken (or only a held preamble before a lookup), the stream ends with an error so the page can fall back."""
    _, _, events = chat(env['main'], 'Who leads BSP? [mock:maxtokens]', mode='voice')
    assert events[-1]['type'] == 'done' and events[-1]['stop_reason'] == 'max_tokens'
    assert spoken(events) == ('Short answer: lenders will test whether the add-on pipeline can carry the. '
                              'That is as far as a spoken answer goes. Type the question for the full answer.')
    httpx.delete(env['mock'] + '/_requests')
    _, _, events = chat(env['main'], 'New homeowner list for Ocean County [mock:maxtokens]', mode='voice')   # routed: step one is cut before any lookup
    assert spoken(events) == '' and events[-1] == {'type': 'error', 'code': 'cut_off', 'message': 'The spoken answer did not fit. Ask again, or type the question for a full answer.'}
    assert len(mock_requests(env)) == 1 and not any(e['type'] == 'done' for e in events)
    _, _, events = chat(env['main'], 'Who leads BSP? [mock:maxtokens]')   # chat mode is unchanged: the text so far and the stop reason
    assert events[-1]['type'] == 'done' and events[-1]['stop_reason'] == 'max_tokens' and 'spoken answer' not in spoken(events)


def test_voice_keeps_tool_gating_and_limits(env):
    for persona in ('pp', 'fh'):   # the concept sites have no home-records or deal tool, in voice mode either
        httpx.delete(env['mock'] + '/_requests')
        status, _, events = chat(env['main'], 'New homeowner list for Ocean County [mock:homes]', mode='voice', persona=persona)
        reqs = mock_requests(env)
        assert status == 200 and len(reqs) == 1 and 'tools' not in reqs[0]['body'] and events[-1]['steps'] == 1
        assert 'new_homeowners' not in reqs[0]['body']['system'][0]['text'] and not any(s['kind'] == 'data' for e in events if e['type'] == 'sources' for s in e['sources'])
    httpx.delete(env['mock'] + '/_requests')
    chat(env['main'], 'Who runs the firm? [mock:tool]', mode='voice')   # BSP Desk, a question for no tool: none is offered
    assert len(mock_requests(env)) == 1 and 'tools' not in mock_requests(env)[0]['body']
    s, _, b = chat(env['main'], 'x', mode='song')
    assert (s, b['error']) == (400, 'bad_mode')
    s, _, b = chat(env['capped'], 'one more', mode='voice')   # the daily cap covers voice answers too (test_daily_cap used it up)
    assert (s, b['error']) == (429, 'daily_cap')
    who = ip()
    codes = [chat(env['main'], f'q{k}', visitor=who, mode='voice')[0] for k in range(6)]   # and so does the per-visitor limit (5 per 10 minutes here)
    assert codes == [200] * 5 + [429]
    s, _, b = chat(env['nokey'], 'x', mode='voice')
    assert (s, b['error']) == (503, 'no_model_key')


def test_voice_filter_and_routes():
    import importlib.util
    spec = importlib.util.spec_from_file_location('bsp_app3', os.path.join(procs.SERVER_DIR, 'app.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    md = ('### Leadership\n\n**Tyler Zachem** leads BSP as *Managing Partner* [1][2]. He co-founded it in `2021` [3, 4].\n\n'
          '- First, see [the team page](https://broadskypartners.com/team/) for more.\n- Second, Fund I is **$335M** [5].\n\n'
          '1. Details at https://example.com/a?b=1 today.\n> __Done__.')
    for size in (1, 2, 3, 5, 7, 11, 40, 1000):   # however the stream is cut, the same clean text comes out
        f = mod.VoiceFilter()
        assert ''.join([f.feed(md[i:i + size]) for i in range(0, len(md), size)] + [f.flush()]) == SPOKEN
    f = mod.VoiceFilter()
    assert f.feed('It grew 12.5 percent, to $3.2 million, in the 2025 fiscal_year; a 3 - 2 split. ') + f.flush() == 'It grew 12.5 percent, to $3.2 million, in the 2025 fiscal_year; a 3 - 2 split.'
    routes = {"Who should get this month's new-homeowner mailer in Ocean County?": 'homes', 'New buyers in Toms River: who should we mail?': 'homes',
              'I got a call from 317 Barcelona Drive in Toms River, what do we know about the house?': 'homes', 'What could BSP pay for CET and still earn 25% a year?': 'deal',
              'What is Fair Harbor worth?': 'deal', 'Who leads BSP, and what did they do before?': None, 'Show the top 10 targets in CT': None,
              'Draft a memo about the new homeowner mailer': None, 'What is GridOS and why does it raise valuation for CET?': None}
    assert {q: mod.tool_route(q) for q in routes} == routes
    more = {'New homeowner list for Ocean County': 'homes', 'List recent buyers in Lancaster County': 'homes', 'Which recent buyers in ZIP 08753 should get a postcard?': 'homes',
            'Got a call from 12 Main Street, what can we offer?': 'homes', 'What is NuWave worth?': 'deal', 'What is Lancaster Plumbing worth?': 'deal',
            'What would a plumbing company with $5M EBITDA be worth?': 'deal'}
    assert {q: mod.tool_route(q) for q in more} == more
    # "buyers" and "owners" of companies are private-equity questions, an office address is not a house call, and "worth" is not always a valuation
    for q in NOT_ROUTED:
        assert mod.tool_route(q) is None, q
    for text, want in {'See www.example.com/page (source: https://x.y/z).': '', 'Read more at https://x.com/a. Then call.': 'Read more. Then call.',
                       'We looked at the map. See the legend at left.': 'We looked at the map. See the legend at left.', '1. One\n2. Two\n3. Three': 'One. Two. Three.',
                       '| Company | EBITDA |\n|---|---|\n| CET | $10M |\n\nThat is all': 'Company, EBITDA. CET, $10M. That is all'}.items():
        for size in (1, 2, 3, 7, 1000):
            f = mod.VoiceFilter()
            assert ''.join([f.feed(text[i:i + size]) for i in range(0, len(text), size)] + [f.flush()]) == want, (text, size)
    assert len(mod.clip_result('z' * 20000)) < 12100 and mod.clip_result('short') == 'short'


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
    assert (r['outcome'], r['error'], r['model'], r['stop_reason'], r['agent_steps'], r['tokens']) == ('answered', None, 'claude-opus-5-5', 'end_turn', 1, {'in': 3120, 'out': 640, 'cache_read': 0, 'cache_write': 0})
    assert (r['mode'], r['route'], r['usage_steps']) == ('chat', None, [{'in': 3120, 'cache_read': 0, 'cache_write': 0, 'out': 640}])
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
