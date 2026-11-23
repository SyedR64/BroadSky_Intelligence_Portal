"""
GET /prepared?role=<id>: a role's signature answer, built from data by the server with no model call.

Uses the real views.prepared and the same in-process app, stub and mock Claude API as test_site_endpoint.py (the stub's
teardown checks that no model client was asked for, the mock saw no request and nothing went to the chat log).

  cd server && python3 -m pytest -q tests/test_prepared_endpoint.py
"""

import threading
import time

import pytest

from test_site_endpoint import EVIL, GH, OWNER, client, mock, post, srv, stub, visitor   # noqa: F401  (fixtures)


def get_prepared(client, query, who=None, origin=GH):
    return client.get('/prepared' + query, headers={'Origin': origin, 'X-Real-IP': who or visitor()})


@pytest.mark.parametrize('role', ['bsp-managing-partner', 'pp-plumber', 'pp-cfo', 'cet-estimator'])
def test_prepared_answers_a_role(client, stub, role):
    r = get_prepared(client, '?role=' + role)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j['ok'] is True and j['role'] == role and j['question'] and j['text'] and isinstance(j['cards'], list) and j['cards']
    assert len(j['text'].split()) <= 40
    assert r.headers['access-control-allow-origin'] == GH
    assert stub.calls == []   # the prepared answer never runs a live lookup


def test_prepared_without_the_needed_app_says_so(client, stub):
    j = get_prepared(client, '?role=pp-cfo&connected=email').json()
    assert j['cards'] == [] and j['question']


@pytest.mark.parametrize('query', ['', '?role=', '?role=nobody-here', '?role=PP_PLUMBER!'])
def test_prepared_bad_role_is_400(client, stub, query):
    r = get_prepared(client, query)
    assert r.status_code == 400 and r.json()['error'] == 'bad_workspace'


def test_prepared_origin_and_limit(client, stub):
    assert get_prepared(client, '?role=pp-plumber', origin=EVIL).status_code == 403
    who = visitor()
    for _ in range(20):
        assert get_prepared(client, '?role=bsp-partner', who).status_code == 200
    r = get_prepared(client, '?role=bsp-partner', who)
    assert r.status_code == 429 and r.json()['error'] == 'rate_limited' and r.json()['retryAfter'] > 0
    assert post(client, {'text': OWNER, 'role': 'pp-plumber'}, who).status_code == 200   # the two endpoints keep separate counts


def test_prepared_has_a_ceiling(client, stub, monkeypatch):
    import views
    gate = threading.Event()
    monkeypatch.setattr(views, 'prepared', lambda *a, **k: gate.wait(30))
    monkeypatch.setitem(srv.SITE, 'ceiling', 1.0)
    t0 = time.monotonic()
    r = get_prepared(client, '?role=pp-plumber')
    gate.set()
    assert r.status_code == 504 and r.json()['error'] == 'timeout' and time.monotonic() - t0 < 1.5
