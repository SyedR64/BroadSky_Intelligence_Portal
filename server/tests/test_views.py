"""
Tests for server/views.py: the five general pictures (scorecard, bridge, heatmap, pipeline_board, ranked_bars), every role's
signature answer with no model call, access by level and scope, the basis of every drawn item, and the static copy.

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q tests/test_views.py

Reads the generated sandbox (server/sandbox) and the repository's research data. Nothing here opens a network connection:
a fixture makes any socket connect fail the test.
"""

import json
import os
import re
import socket
import subprocess
import sys

import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SERVER_DIR)
sys.path.insert(0, SERVER_DIR)

import views       # noqa: E402
import workspace   # noqa: E402

CATALOG = os.path.join(ROOT, 'data', 'agent', 'catalog.json')
SANDBOX = os.path.join(SERVER_DIR, 'sandbox')
pytestmark = pytest.mark.skipif(not os.path.exists(os.path.join(SANDBOX, 'roles.json')), reason='sandbox not generated')

ROLE_IDS = [r['id'] for r in json.load(open(CATALOG, encoding='utf-8'))['roles']]
CATALOG_SIG = {r['id']: r['signature'] for r in json.load(open(CATALOG, encoding='utf-8'))['roles'] if isinstance(r.get('signature'), dict)}
FIELD = [r['id'] for r in json.load(open(CATALOG, encoding='utf-8'))['roles'] if r.get('level') == 'co_field']
TEXT_KEYS = ('title', 'lead', 'label', 'sub', 'owner', 'tag', 'next_step', 'due', 'source', 'body', 'text', 'value', 'q')


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """No model call and no network: any outbound connection fails the test."""
    def refuse(self, *a, **k):
        raise AssertionError(f'network connection attempted: {a!r}')
    monkeypatch.setattr(socket.socket, 'connect', refuse)
    monkeypatch.delenv('WORKSPACE_SANDBOX_DIR', raising=False)
    workspace.reset()
    yield
    workspace.reset()


def _all_views():
    """Every (role, topic) the role may see, built."""
    out = []
    for rid in ROLE_IDS:
        for topic, spec in views.TOPICS.items():
            if views.access(rid, spec[0], topic)[0]:
                out.append((rid, topic, views.build_view(rid, spec[0], {'topic': topic})))
    return out


@pytest.fixture(scope='module')
def built():
    workspace.reset()
    return _all_views()


@pytest.fixture(scope='module')
def prepared_all():
    workspace.reset()
    with views.frozen_today():
        return {rid: views.prepared(rid) for rid in ROLE_IDS}


# ---------------------------------------------------------------- signatures

def test_every_role_has_a_signature():
    assert len(ROLE_IDS) == 44
    assert set(views.SIGNATURES) == set(ROLE_IDS)
    for rid in ROLE_IDS:
        s = views.signature(rid)
        assert s and s['q'] and views.words(s['q']) <= 12, rid
        assert s['view'] in views.KINDS + ('plan', 'model') or s['tool'] == 'site_brief', rid
        assert s['draft']['action'] in workspace.role(rid)['actions'], rid
        if s['tool'] == 'show_view':
            t = s['args']['topic']
            assert views.TOPICS[t][0] == s['view'], rid
            assert views.access(rid, s['view'], t, s['args'].get('company'))[0], f'{rid} cannot open its own signature'


def test_signature_shape_matches_catalogue_field():
    for rid in ROLE_IDS:
        s = views.signature(rid)
        assert {'q', 'tool', 'args', 'view', 'draft'} <= set(s) <= {'q', 'tool', 'args', 'view', 'draft', 'picture', 'tour'}, rid
        cat = CATALOG_SIG.get(rid)
        if cat:   # the catalogue is the source of the question and the draft
            assert s['q'] == cat['question'] and s['draft']['action'] == cat['draft']['action'], rid
        assert s['tool'] in ('show_view', 'site_brief')


def test_live_first_roles_use_public_data():
    """Ruling 7: where the repository holds real data for the role's question, the signature uses it. The catalogue marks those
    signatures source 'live'; each reads no company records."""
    live = [rid for rid, c in CATALOG_SIG.items() if c.get('source') == 'live']
    assert len(live) >= 11
    for rid in live:
        s = views.signature(rid)
        assert s['tool'] == 'show_view', rid
        assert views.TOPICS[s['args']['topic']][2] is None, rid   # reads no company records


def test_best3_is_the_managing_partners_answer():
    s = views.signature('bsp-managing-partner')
    assert s['q'] == 'Point out the best 3 acquisition targets.' and s['tour'] == 'best3'
    p = views.prepared('bsp-managing-partner')
    kinds = [c['kind'] for c in p['cards']]
    assert kinds == ['ranked_bars', 'map_command', 'action_draft']
    assert p['cards'][1]['cmd'] == {'tour': 'best3'}
    assert len(p['cards'][0]['data']['bars']) == 3 and 'Midland' in p['text']


# ---------------------------------------------------------------- prepared answers

def test_prepared_for_every_role(prepared_all):
    for rid in ROLE_IDS:
        p = prepared_all[rid]
        assert p, rid
        assert views.lead_ok(p['text']), (rid, p['text'])
        sig = views.signature(rid)
        first = p['cards'][0]
        if sig['tool'] == 'site_brief':
            assert first['kind'] in views.SITE_KINDS, rid
        else:
            assert first['kind'] == sig['view'], rid
        drafts = [c for c in p['cards'] if c['kind'] == 'action_draft']
        assert len(drafts) == 1, rid
        assert drafts[0]['status'] == 'draft' and drafts[0]['action'] in workspace.role(rid)['actions'], rid
        assert p['draft']['status'] == 'draft'
        assert 1 <= views.words(p['draft']['label']) <= 15 and p['draft']['label'][0].isupper(), rid


def test_prepared_makes_no_model_call():
    """The module never loads a model client; prepared answers come from data only."""
    code = ('import sys; sys.path.insert(0, "."); import views\n'
            'assert "workspace" not in sys.modules, "workspace imported at load"\n'
            'for r in views.role_ids(): views.prepared(r)\n'
            'bad = [m for m in ("anthropic", "app", "openai", "httpx") if m in sys.modules]\n'
            'assert not bad, bad\n')
    env = dict(os.environ, PROPERTY_LIVE='off')
    r = subprocess.run([sys.executable, '-c', code], cwd=SERVER_DIR, capture_output=True, text=True, env=env, timeout=120)
    assert r.returncode == 0, r.stderr[-2000:]


def test_not_connected_answer():
    p = views.prepared('pp-cfo', connected=['email'])
    assert p['cards'] == [] and 'not connected' in p['text']
    assert views.prepared('pp-cfo', connected=['financials', 'email'])['cards']


def test_flagship_answers_use_the_customer_record(prepared_all):
    for rid, words in (('pp-plumber', 'Water heater'), ('pp-hvac-technician', 'Furnace')):
        p = prepared_all[rid]
        assert words in p['text'] and 'from our records' in p['text']
        assert p['basis'] == views.REC


# ---------------------------------------------------------------- shapes

def _check_shape(kind, d):
    if kind == 'scorecard':
        assert {'rows', 'cols', 'cells', 'target_label'} <= set(d)
        assert len(d['cells']) == len(d['rows'])
        for line in d['cells']:
            assert len(line) == len(d['cols'])
            for c in line:
                assert c is None or ({'value', 'target', 'status'} <= set(c) and (c['status'] in ('good', 'warn', 'bad') or c['target'] is None))
    elif kind == 'bridge':
        assert {'unit', 'start', 'steps', 'end'} <= set(d)
        total = d['start']['value'] + sum(s['delta'] for s in d['steps'])
        assert abs(total - d['end']['value']) < 0.11, (total, d['end'])
    elif kind == 'heatmap':
        assert {'unit', 'good', 'rows', 'cols', 'cells'} <= set(d) and d['good'] in ('low', 'high')
        assert len(d['cells']) == len(d['rows'])
        assert all(len(line) == len(d['cols']) for line in d['cells'])
        assert all(v is None or isinstance(v, (int, float)) for line in d['cells'] for v in line)
    elif kind == 'pipeline_board':
        assert {'unit', 'amount_label', 'stages', 'cards'} <= set(d)
        ids = {s['id'] for s in d['stages']}
        assert all(c['stage'] in ids for c in d['cards'])
        assert all({'ref', 'title', 'stage', 'basis'} <= set(c) for c in d['cards'])
    elif kind == 'ranked_bars':
        assert {'unit', 'value_label', 'bars'} <= set(d) and d['bars']
        assert all({'ref', 'label', 'value', 'basis'} <= set(b) for b in d['bars'])
        assert all(isinstance(b['value'], (int, float)) for b in d['bars'])
    else:
        raise AssertionError(kind)


def test_every_view_has_the_contract_shape(built):
    kinds = set()
    for rid, topic, v in built:
        assert set(v) >= {'kind', 'title', 'lead', 'data', 'basis', 'source', 'as_of', 'draft'}, (rid, topic)
        if v.get('error') == 'empty':
            continue
        assert not v.get('error'), (rid, topic, v)
        assert v['kind'] == views.TOPICS[topic][0]
        assert v['title'] and v['source'] and re.fullmatch(r'\d{4}-\d\d-\d\d', v['as_of']), (rid, topic)
        _check_shape(v['kind'], v['data'])
        assert v['data']['topic'] == topic or (topic, v['data']['topic']) == ('company_scorecard', 'portfolio_scorecard')
        kinds.add(v['kind'])
        c = views.card(v)
        assert c['type'] == 'card' and c['kind'] == v['kind'] and c['data'] is v['data']
    assert kinds == set(views.KINDS)


def test_leads_are_short(built):
    for rid, topic, v in built:
        assert views.lead_ok(v['lead']), (rid, topic, v['lead'])


def test_unknown_view_raises():
    with pytest.raises(views.ViewError):
        views.build_view('pp-ceo', 'pie_chart', {})
    with pytest.raises(views.ViewError):
        views.build_view('pp-ceo', 'heatmap', {'topic': 'returns'})


# ---------------------------------------------------------------- basis: nothing public comes from the sandbox

def _drawn(v):
    d = v['data'] or {}
    out = list(d.get('rows') or []) + list(d.get('bars') or []) + list(d.get('cards') or []) + list(d.get('steps') or [])
    out += [x for x in (d.get('start'), d.get('end')) if isinstance(x, dict)]
    return out


def _sandbox_names():
    names = set()
    for fn in os.listdir(SANDBOX):
        if not fn.endswith('.json'):
            continue
        def walk(x):
            if isinstance(x, dict):
                for k in ('name', 'account', 'client', 'title'):
                    if isinstance(x.get(k), str) and len(x[k]) > 6:
                        names.add(x[k].lower())
                for y in x.values():
                    walk(y)
            elif isinstance(x, list):
                for y in x:
                    walk(y)
        walk(json.load(open(os.path.join(SANDBOX, fn), encoding='utf-8')))
    return names


def test_every_drawn_item_has_a_basis(built):
    for rid, topic, v in built:
        if v.get('error'):
            continue
        assert v['basis'] in views.BASES, (rid, topic)
        items = _drawn(v)
        assert items, (rid, topic)
        for x in items:
            assert x.get('basis') in views.BASES, (rid, topic, x)


def test_no_public_item_comes_from_the_sandbox(built):
    names = _sandbox_names()
    for rid, topic, v in built:
        if v.get('error'):
            continue
        sandbox_topic = views.TOPICS[topic][2] is not None
        for x in _drawn(v):
            if sandbox_topic:
                assert x['basis'] == views.REC, (rid, topic, x)
            else:
                assert x['basis'] in (views.PUBLIC, views.EST), (rid, topic, x)
                lab = (x.get('label') or x.get('title') or '').lower()
                assert lab not in names, (rid, topic, lab)
        if sandbox_topic:
            assert v['basis'] == views.REC and v['source'].startswith(views.REC_LINE)
        else:
            assert 'example' not in v['source'].lower() and 'sandbox' not in v['source'].lower()


# ---------------------------------------------------------------- access

FINANCE_TOPICS = ('portfolio_scorecard', 'company_scorecard', 'plan_bridge', 'deal_bridge', 'due_dates')


def test_field_roles_never_get_company_finances():
    assert set(FIELD) >= {'pp-hvac-technician', 'pp-plumber', 'cet-field-electrician', 'ts-warehouse-lead'}
    for rid in FIELD:
        for topic in FINANCE_TOPICS:
            kind = views.TOPICS[topic][0]
            assert not views.access(rid, kind, topic)[0], (rid, topic)
            v = views.build_view(rid, kind, {'topic': topic})
            assert v['error'] == 'outside' and v['data'] is None and 'outside your access' in v['lead']
        # and no public research either: field roles see their own work only
        for topic, spec in views.TOPICS.items():
            if spec[2] is None:
                assert not views.access(rid, spec[0], topic)[0], (rid, topic)


def test_scopes_hold_for_own_records():
    v = views.build_view('ts-inside-sales', 'ranked_bars', {'topic': 'slipping_accounts'})
    own = {a['name'] for a in workspace._records('salesforce', 'accounts', 'ts') if 'ts-inside-sales' in (a.get('for') or ())}
    allnames = {a['name'] for a in workspace._records('salesforce', 'accounts', 'ts')}
    assert own and own != allnames
    assert {b['label'] for b in v['data']['bars']} <= own
    t = views.build_view('fl-help-desk-engineer', 'pipeline_board', {'topic': 'my_tickets'})
    mine = {x['number'] for x in workspace._records('servicedesk', 'tickets', 'fl') if 'fl-help-desk-engineer' in (x.get('for') or ())}
    assert all(c['title'].split(',')[0] in mine for c in t['data']['cards'])


def test_company_roles_see_their_own_company_only():
    assert views.build_view('pp-ceo', 'bridge', {'topic': 'deal_bridge', 'company': 'cet'})['error'] == 'outside'
    assert views.build_view('cet-ceo', 'ranked_bars', {'topic': 'addon_targets', 'company': 'pp'})['error'] == 'outside'
    v = views.build_view('cet-ceo', 'ranked_bars', {'topic': 'addon_targets'})
    assert not v.get('error') and all(b['co'] == 'cet' for b in v['data']['bars'])
    assert views.build_view('cet-ceo', 'heatmap', {'topic': 'ticket_age'})['error'] == 'outside'
    assert views.build_view('pp-sales', 'bridge', {'topic': 'plan_bridge'})['error'] == 'outside'


def test_firm_levels():
    assert views.build_view('bsp-managing-partner', 'scorecard', {})['data']['rows'][0]['label'] == 'Punctual Pros'
    ok = [t for t, s in views.TOPICS.items() if views.access('bsp-investor-relations', s[0], t)[0]]
    assert ok == ['fund_raised', 'fund_question']   # investor relations: the fund only (its filings, and the fund record for the open question)
    assert views.access('bsp-associate', 'ranked_bars', 'addon_targets', 'cet')[0]
    assert not views.access('bsp-operating-partner', 'ranked_bars', 'due_dates')[0]   # no debt in its apps


# ---------------------------------------------------------------- copy and dates

ID_KEYS = ('ref', 'id')


def _texts(x, out):
    if isinstance(x, dict):
        for k, v in x.items():
            if k in ID_KEYS:
                continue
            if isinstance(v, str) and k in TEXT_KEYS:
                out.append(v)
            else:
                _texts(v, out)
    elif isinstance(x, list):
        for v in x:
            _texts(v, out)
    return out


def test_no_raw_ids_emails_or_snake_case(prepared_all, built):
    texts = _texts(prepared_all, []) + _texts([v for _, _, v in built], [])
    for s in texts:
        assert not workspace.ID_RX.search(s), s
        assert not workspace.EMAIL_RX.search(s), s
        assert not re.search(r'\b[a-z]+_[a-z_]+\b', s), s
        assert 'playbook' not in s.lower() and 'tough leaf' not in s.lower(), s
    for p in prepared_all.values():
        for c in p['cards']:
            if c['kind'] in views.KINDS:
                for x in _drawn({'data': c['data']}):
                    assert re.fullmatch(r'v[0-9a-f]{10}', x.get('ref', 'v0000000000')), x


def test_cet_never_shows_new_york_city():
    for rid in ('cet-ceo', 'cet-sales', 'cet-estimator'):
        s = json.dumps(views.prepared(rid))
        assert 'New York City' not in s and 'NYC' not in s


def test_dates_are_frozen(monkeypatch):
    import datetime
    a = views.build_prepared()
    monkeypatch.setattr(workspace, 'today', lambda: datetime.date(2027, 3, 2))
    b = views.build_prepared()
    assert a == b


def test_static_copy_matches_live(tmp_path):
    path = views.write_prepared(str(tmp_path / 'prepared.json'))
    doc = json.load(open(path, encoding='utf-8'))
    assert doc['base_date'] == views.base_date().isoformat()
    assert set(doc['roles']) == set(ROLE_IDS)
    assert doc == json.loads(json.dumps(views.build_prepared()))
    shipped = os.path.join(ROOT, 'data', 'agent', 'prepared.json')
    assert os.path.exists(shipped), 'run: uv run --no-project --python 3.12 python server/views.py'
    assert json.load(open(shipped, encoding='utf-8')) == doc, 'data/agent/prepared.json is stale: run uv run --no-project --python 3.12 python server/views.py'
