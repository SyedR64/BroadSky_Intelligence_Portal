"""
POST /site-brief: the live address lookup's endpoint (no model call).

Runs the app in this process (Starlette's test client) with server/site.py replaced by a stub, so each answer status, the
limits and a stalled lookup can be driven exactly. The mock Claude API runs beside it: every test checks it saw no request.

  cd server && python3 -m pytest -q tests/test_site_endpoint.py
"""

import logging
import os
import sys
import threading
import time
import types
import uuid

import httpx
import pytest

import procs

sys.path.insert(0, procs.SERVER_DIR)
os.environ.setdefault('PROPERTY_LIVE', 'off')

import app as srv   # noqa: E402
from starlette.testclient import TestClient   # noqa: E402

GH = 'https://syedr64.github.io'
EVIL = 'https://evil.example'
OWNER = 'going to 418 Wexcombe Ln, Lititz for a sink repair, give me the floor plans, view'
STREET = '418 Wexcombe Ln'


@pytest.fixture(scope='module')
def mock(tmp_path_factory):
    port = procs.free_port()
    p = procs.start_mock(port, str(tmp_path_factory.mktemp('site') / 'mock.log'))
    try:
        yield f'http://127.0.0.1:{port}'
    finally:
        p.stop()


def card_found():
    return [{'type': 'card', 'kind': 'floor_sketch', 'id': 'fs-1', 'place': {'label': '418 Wexcombe Ln, Lititz', 'precision': 'parcel'},
             'building': {}, 'facts': []},
            {'type': 'card', 'kind': 'map_command', 'cmd': {'title': '418 Wexcombe Ln', 'steps': [{'kind': 'site', 'precision': 'parcel', 'zoom': 19}]}}]


class Stub:
    """Stands in for server/site.py: brief(text, role_id, connected=None, deadline_s=8.0)."""

    def __init__(self):
        self.calls = []
        self.answer = {'status': 'found', 'text': 'Found it.', 'cards': card_found(), 'choices': [], 'sources': [{'n': 1, 'title': 'Census'}], 'degraded': []}
        self.gate = None      # a threading.Event: the lookup waits on it (a stalled upstream)
        self.raise_ = None

    def brief(self, text, role_id, connected=None, deadline_s=8.0, **kw):
        self.calls.append({'text': text, 'role': role_id, 'connected': connected, 'deadline_s': deadline_s, **kw})
        if self.gate is not None:
            self.gate.wait(30)
        if self.raise_:
            raise self.raise_
        return self.answer


@pytest.fixture
def stub(monkeypatch, mock):
    s = Stub()
    monkeypatch.setitem(srv._site, 'mod', types.SimpleNamespace(brief=s.brief))
    monkeypatch.setattr(srv, '_site_buckets', {})
    monkeypatch.setattr(srv, '_prepared_buckets', {})
    monkeypatch.setattr(srv, '_site_day', {'day': None, 'n': 0})
    monkeypatch.setattr(srv, '_slots', {'site': 0, 'prepared': 0})
    monkeypatch.setenv('FAKE_ANTHROPIC_URL', mock)   # any model call would land on the mock and be counted there
    monkeypatch.setenv('ANTHROPIC_API_KEY', procs.TEST_KEY)
    model = {'n': 0}

    def counted(*a, **k):
        model['n'] += 1
        raise AssertionError('a model client was asked for')
    monkeypatch.setattr(srv, 'claude_client', counted)
    monkeypatch.setattr(srv, 'sdk', counted)
    saved = []

    async def no_log(*a, **k):
        saved.append(a)
    monkeypatch.setattr(srv.chatlog, 'save', no_log)
    httpx.delete(mock + '/_requests')
    s.model, s.saved, s.mock = model, saved, mock
    yield s
    if s.gate is not None:
        s.gate.set()
    assert model['n'] == 0, 'the endpoint asked for a model client'
    assert httpx.get(mock + '/_requests').json() == [], 'the mock Claude API saw a request'
    assert saved == [], 'something was written to the chat log'


@pytest.fixture
def client():
    return TestClient(srv.app)


def visitor():
    return '198.51.100.%d-%s' % (uuid.uuid4().int % 250 + 1, uuid.uuid4().hex[:6])


def post(client, body, who=None, origin=GH):
    return client.post('/site-brief', json=body, headers={'Origin': origin, 'X-Real-IP': who or visitor()})


# ── each status ─────────────────────────────────────────────────────────────
@pytest.mark.parametrize('status', ['found', 'choose', 'not_found', 'outside', 'error'])
def test_each_status_passes_through(client, stub, status):
    stub.answer = {'status': status, 'text': 'Answer for ' + status + '.', 'cards': card_found() if status in ('found', 'outside') else [],
                   'choices': [{'label': '200 Georgia Rd, lot 1', 'key': 'k1'}] if status == 'choose' else [], 'sources': [], 'degraded': []}
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'})
    assert r.status_code == 200
    j = r.json()
    assert j['ok'] is True and j['status'] == status and j['text'] == 'Answer for ' + status + '.'
    assert set(j) >= {'status', 'text', 'cards', 'choices', 'sources', 'degraded'}
    assert (j['choices'][0]['key'] == 'k1') if status == 'choose' else j['choices'] == []
    assert r.headers['access-control-allow-origin'] == GH and r.headers['cache-control'] == 'no-store'


def test_found_keeps_both_cards_and_the_typed_text_word_for_word(client, stub):
    r = post(client, {'text': OWNER, 'role': 'pp-dispatcher', 'connected': ['servicetitan']})
    j = r.json()
    assert [c['kind'] for c in j['cards']] == ['floor_sketch', 'map_command']
    assert j['cards'][1]['cmd']['steps'][0]['kind'] == 'site'
    assert stub.calls == [{'text': OWNER, 'role': 'pp-dispatcher', 'connected': ['servicetitan'], 'deadline_s': stub.calls[0]['deadline_s']}]
    assert 7.5 <= stub.calls[0]['deadline_s'] <= 8.0   # the lookup's own deadline sits inside the 9 s ceiling


def test_building_one_to_eight_reaches_the_lookup_and_anything_else_is_dropped(client, stub):
    for k in range(1, 9):
        assert post(client, {'text': OWNER, 'role': 'pp-plumber', 'building': k}).status_code == 200
    assert [c.get('building') for c in stub.calls] == list(range(1, 9))
    stub.calls.clear()
    for bad in (0, 9, -1, 2.5, '2', True, None, [1], {'n': 1}):
        r = post(client, {'text': OWNER, 'role': 'pp-plumber', 'building': bad})
        assert r.status_code == 200 and r.json()['status'] == 'found', bad
    assert len(stub.calls) == 9 and all('building' not in c for c in stub.calls)
    post(client, {'text': OWNER, 'role': 'pp-plumber', 'pick': 'p-0123456789', 'building': 2})
    assert {k: stub.calls[-1].get(k) for k in ('pick', 'building')} == {'pick': 'p-0123456789', 'building': 2}


def test_connected_is_none_when_not_sent(client, stub):
    post(client, {'text': OWNER, 'role': 'pp-plumber'})
    post(client, {'text': OWNER, 'role': 'pp-plumber', 'connected': []})
    assert [c['connected'] for c in stub.calls] == [None, []]


def test_an_odd_answer_becomes_an_error_and_a_failure_is_answered(client, stub):
    stub.answer = {'status': 'maybe', 'text': 5, 'cards': 'x', 'degraded': ['parcel', None]}
    j = post(client, {'text': OWNER, 'role': 'pp-plumber'}).json()
    assert j['status'] == 'error' and j['text'] == '' and j['cards'] == [] and j['choices'] == [] and j['degraded'] == ['parcel']
    stub.answer = None
    assert post(client, {'text': OWNER, 'role': 'pp-plumber'}).json()['status'] == 'error'
    stub.raise_ = RuntimeError('lookup broke on ' + OWNER)
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'})
    assert r.status_code == 200 and r.json()['status'] == 'error' and r.json()['degraded'] == ['site']


# ── input, roles, origin ────────────────────────────────────────────────────
@pytest.mark.parametrize('body,code', [
    ({'role': 'pp-plumber'}, 'bad_text'),
    ({'text': '', 'role': 'pp-plumber'}, 'bad_text'),
    ({'text': '   ', 'role': 'pp-plumber'}, 'bad_text'),
    ({'text': 42, 'role': 'pp-plumber'}, 'bad_text'),
    ({'text': 'x' * 241, 'role': 'pp-plumber'}, 'text_too_long'),
    ({'text': OWNER}, 'bad_workspace'),
    ({'text': OWNER, 'role': 'no-such-role'}, 'bad_workspace'),
    ({'text': OWNER, 'role': 7}, 'bad_workspace'),
    ({'text': OWNER, 'role': 'pp-plumber', 'connected': 'servicetitan'}, 'bad_connected'),
])
def test_bad_input_is_400(client, stub, body, code):
    r = post(client, body)
    assert r.status_code == 400 and r.json()['error'] == code and r.json()['ok'] is False
    assert stub.calls == []


def test_not_json_is_400(client, stub):
    r = client.post('/site-brief', content=b'[1,2]', headers={'Origin': GH, 'Content-Type': 'application/json'})
    assert r.status_code == 400 and r.json()['error'] == 'bad_json'


@pytest.mark.parametrize('role', ['pp-sales', 'cet-ceo', 'fl-help-desk-engineer', 'ts-inside-sales'])
def test_a_role_without_the_site_brief_is_403(client, stub, role):
    r = post(client, {'text': OWNER, 'role': role})
    assert r.status_code == 403 and r.json()['error'] == 'role_not_allowed' and stub.calls == []


@pytest.mark.parametrize('role', ['pp-plumber', 'pp-hvac-technician', 'pp-dispatcher', 'pp-ceo', 'bsp-managing-partner', 'bsp-associate'])
def test_site_roles_and_firm_levels_may_ask(client, stub, role):
    assert post(client, {'text': OWNER, 'role': role}).status_code == 200


def test_origin_rules_match_chat(client, stub):
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'}, origin=EVIL)
    assert r.status_code == 403 and r.json()['error'] == 'origin_not_allowed' and 'access-control-allow-origin' not in r.headers
    pre = client.options('/site-brief', headers={'Origin': GH, 'Access-Control-Request-Method': 'POST'})
    assert pre.status_code == 204 and pre.headers['access-control-allow-origin'] == GH
    assert client.options('/site-brief', headers={'Origin': EVIL}).status_code == 403
    assert client.get('/site-brief', headers={'Origin': GH}).status_code == 404
    assert stub.calls == []


def test_unavailable_when_the_module_is_missing(client, stub, monkeypatch):
    monkeypatch.setitem(srv._site, 'mod', None)
    monkeypatch.setattr(srv, 'SITE_PATH', '/nonexistent/site.py')
    monkeypatch.delitem(sys.modules, 'bsp_site', raising=False)
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'})
    assert r.status_code == 503 and r.json()['error'] == 'site_unavailable'
    h = client.get('/health', headers={'Origin': GH}).json()
    assert h['site'] is False


def test_health_says_the_lookup_is_available(client, stub):
    h = client.get('/health', headers={'Origin': GH}).json()
    assert h['site'] is True and h['ok'] is True


def test_the_real_module_is_loaded_by_path_not_the_startup_module(monkeypatch, tmp_path):
    f = tmp_path / 'site.py'
    f.write_text('def brief(text, role_id, connected=None, deadline_s=8.0):\n    return {"status": "not_found", "text": "x"}\n')
    monkeypatch.setitem(srv._site, 'mod', None)
    monkeypatch.setattr(srv, 'SITE_PATH', str(f))
    monkeypatch.delitem(sys.modules, 'bsp_site', raising=False)
    m = srv.site_module()
    assert m is not sys.modules['site'] and m.brief('a', 'b')['status'] == 'not_found'
    assert srv.site_available() is True


# ── limits ──────────────────────────────────────────────────────────────────
def test_twenty_per_visitor_per_ten_minutes(client, stub):
    who = visitor()
    for _ in range(20):
        assert post(client, {'text': OWNER, 'role': 'pp-plumber'}, who).status_code == 200
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'}, who)
    j = r.json()
    assert r.status_code == 429 and j['error'] == 'rate_limited' and j['scope'] == 'visitor'
    assert 0 < j['retryAfter'] <= 600 and r.headers['retry-after'] == str(j['retryAfter'])
    assert j['message'] == 'Too many address lookups in a short time. Try again in a few minutes.'
    assert len(stub.calls) == 20
    assert post(client, {'text': OWNER, 'role': 'pp-plumber'}).status_code == 200   # another visitor is not held back


def test_two_thousand_a_day(client, stub, monkeypatch):
    assert srv.SITE['daily'] == 2000
    monkeypatch.setitem(srv.SITE, 'daily', 3)
    for _ in range(3):
        assert post(client, {'text': OWNER, 'role': 'pp-plumber'}).status_code == 200
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'})
    assert r.status_code == 429 and r.json()['error'] == 'daily_cap' and r.json()['scope'] == 'global' and r.json()['retryAfter'] > 0
    assert len(stub.calls) == 3


def test_at_most_six_in_flight(client, stub, monkeypatch):
    assert srv.SITE['in_flight'] == 6
    monkeypatch.setitem(srv.SITE, 'slot_wait', 0.3)
    stub.gate = threading.Event()
    res = []
    ts = [threading.Thread(target=lambda: res.append(post(client, {'text': OWNER, 'role': 'pp-plumber'}).status_code)) for _ in range(6)]
    for t in ts:
        t.start()
    t0 = time.time()
    while len(stub.calls) < 6 and time.time() - t0 < 10:
        time.sleep(0.02)
    assert len(stub.calls) == 6 and srv._slots['site'] == 6
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'})
    assert r.status_code == 429 and r.json()['error'] == 'busy' and r.json()['message'].startswith('Many address lookups')
    assert len(stub.calls) == 6
    stub.gate.set()
    for t in ts:
        t.join(15)
    assert res == [200] * 6 and srv._slots['site'] == 0
    assert post(client, {'text': OWNER, 'role': 'pp-plumber'}).status_code == 200


def test_a_stalled_lookup_returns_inside_the_ceiling(client, stub):
    assert srv.SITE['ceiling'] == 9.0
    stub.gate = threading.Event()   # never set until the end: the lookup hangs past every deadline
    t0 = time.monotonic()
    r = post(client, {'text': OWNER, 'role': 'pp-plumber'})
    took = time.monotonic() - t0
    j = r.json()
    assert r.status_code == 200 and took < 9.0, took
    assert j['status'] == 'error' and j['degraded'] == ['site'] and j['text']
    assert stub.calls[0]['deadline_s'] <= 8.0
    assert srv._slots['site'] == 1   # the stalled work still holds its slot until it ends
    stub.gate.set()
    t1 = time.time()
    while srv._slots['site'] and time.time() - t1 < 5:
        time.sleep(0.02)
    assert srv._slots['site'] == 0


def test_a_partial_answer_names_what_did_not_answer(client, stub):
    stub.answer = dict(stub.answer, degraded=['parcel', 'permits'])
    j = post(client, {'text': OWNER, 'role': 'pp-plumber'}).json()
    assert j['status'] == 'found' and j['degraded'] == ['parcel', 'permits']


# ── privacy ─────────────────────────────────────────────────────────────────
def test_the_address_is_never_logged_or_stored(client, stub, caplog, monkeypatch):
    def no_db(*a, **k):
        raise AssertionError('the database was opened')
    monkeypatch.setattr(srv, '_connect', no_db)
    caplog.set_level(logging.DEBUG)
    post(client, {'text': OWNER, 'role': 'pp-plumber'})
    stub.raise_ = ValueError('no parcel for ' + OWNER)
    post(client, {'text': OWNER, 'role': 'pp-plumber'})
    stub.raise_, stub.gate = None, threading.Event()
    monkeypatch.setitem(srv.SITE, 'ceiling', 1.5)
    post(client, {'text': OWNER, 'role': 'pp-plumber'})
    stub.gate.set()
    text = '\n'.join(r.getMessage() + ' ' + str(r.exc_info or '') for r in caplog.records)
    assert 'site brief: found, precision parcel' in text and 'failed: ValueError' in text and 'failed: timeout' in text
    for piece in (STREET, 'Wexcombe', 'Lititz', 'sink repair'):
        assert piece not in text
