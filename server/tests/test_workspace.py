"""
Tests for server/workspace.py (the company agent on agent.html): the request field, the permission matrix, the sandbox tools,
the site brief and the drafts.

  cd server && python3 -m pytest -q tests/test_workspace.py

In process, like test_property.py. Every test that reads sandbox data runs twice: against the small hand-made fixture in
tests/fixtures/sandbox_min/ and against the generated server/sandbox/ (skipped until scripts/build_agent_sandbox.py has run).
WORKSPACE_SANDBOX_DIR is set with monkeypatch only, never exported, and workspace.today is monkeypatched where a date matters.
"""

import datetime
import gzip
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SERVER_DIR)
sys.path.insert(0, SERVER_DIR)

import property as homes   # noqa: E402  (never a bare "import property": it would hide the built-in)
import workspace           # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SANDBOX_MIN = os.path.join(HERE, 'fixtures', 'sandbox_min')
SANDBOX_REAL = os.path.join(SERVER_DIR, 'sandbox')
HAVE_REAL = os.path.exists(os.path.join(SANDBOX_REAL, 'roles.json'))
CATALOG = os.path.join(ROOT, 'data', 'agent', 'catalog.json')
CARDS = os.path.join(ROOT, 'scripts', 'fixtures', 'agent_cards.json')
HOMES_DB = os.path.join(SERVER_DIR, 'knowledge', 'homes.sqlite')
TODAY = datetime.date(2026, 11, 17)
TECH = 'pp-hvac-technician'
FLAGSHIP = '418 Wexcombe Ln, Lititz, PA 17543'
ID_IN_TEXT = re.compile(r'\b(em|ca|ch|dr|dc|sf|mk|st|pc|sd|sh|fi|ad)-[a-z0-9-]+\b')
PUBLIC_TOOL_NAMES = {'search_knowledge', 'read_source', 'deal_model', 'new_homeowners', 'property_brief', 'find_businesses', 'web_search'}
_REAL_TODAY = workspace.today


class Sources:
    """The app's Sources contract (app.py): add() numbers a source once per key, header() formats it."""
    def __init__(self):
        self.items, self.by_key = [], {}

    def add(self, key, title, url='', publisher='', date='', kind=''):
        if key in self.by_key:
            return self.by_key[key]
        n = len(self.items) + 1
        self.items.append({'n': n, 'title': title, 'url': url, 'publisher': publisher, 'date': date, 'kind': kind})
        self.by_key[key] = n
        return n

    def header(self, n):
        it = self.items[n - 1]
        return f"[{n}] {it['title']} ({it['publisher']}, {it['date']})"


def use(monkeypatch, d, today=TODAY):
    if d == SANDBOX_REAL:
        monkeypatch.delenv('WORKSPACE_SANDBOX_DIR', raising=False)
    else:
        monkeypatch.setenv('WORKSPACE_SANDBOX_DIR', d)
    workspace.reset()
    monkeypatch.setattr(workspace, 'today', lambda: today)
    monkeypatch.setattr(homes, 'LIVE_ON', False, raising=False)


@pytest.fixture(params=['min', 'real'])
def sb(request, monkeypatch):
    if request.param == 'real' and not HAVE_REAL:
        pytest.skip('server/sandbox has not been generated yet')
    d = SANDBOX_MIN if request.param == 'min' else SANDBOX_REAL
    use(monkeypatch, d)
    yield d
    workspace.reset()


@pytest.fixture
def mini(monkeypatch):
    use(monkeypatch, SANDBOX_MIN)
    yield SANDBOX_MIN
    workspace.reset()


@pytest.fixture
def real(monkeypatch):
    if not HAVE_REAL:
        pytest.skip('server/sandbox has not been generated yet')
    use(monkeypatch, SANDBOX_REAL)
    yield SANDBOX_REAL
    workspace.reset()


def ws_for(role_id, apps=None, job=None):
    R = workspace.role(role_id)
    raw = {'role': role_id, 'connected': list(R['apps']) if apps is None else apps}
    if job:
        raw['job'] = job
    return workspace.clean(raw)


def run(name, args, ws, sources=None):
    s = sources or Sources()
    text, err, cards = workspace.run_tool(name, args, ws, s)
    return text, err, cards, s


def org_files(d):
    return [n for n in workspace.ORGS if os.path.exists(os.path.join(d, n + '.json'))]


def walk_strings(v, key=''):
    if isinstance(v, str):
        yield key, v
    elif isinstance(v, dict):
        for k, x in v.items():
            yield from walk_strings(x, k)
    elif isinstance(v, list):
        for x in v:
            yield from walk_strings(x, key)


def persons(v):
    if isinstance(v, dict):
        if set(v) >= {'name', 'role'} and (v['name'] is None or isinstance(v['name'], str)) and isinstance(v.get('role'), str):
            yield v
        for x in v.values():
            yield from persons(x)
    elif isinstance(v, list):
        for x in v:
            yield from persons(x)


def visible_jobs_of(role_id):
    return workspace._visible_records(role_id, 'servicetitan', 'jobs')


def hidden_job_number(role_id):
    seen = {j['id'] for j in visible_jobs_of(role_id)}
    return next((j['number'] for j in workspace.load('pp_servicetitan')['jobs'] if j['id'] not in seen and j.get('number')), None)


def card_items(card):
    return [i for f in card['floors'] for i in f['items']] + list(card['outside'])


# ---------------------------------------------------------------- request field

def test_clean_rejects_bad_input(sb):
    assert workspace.clean(None) is None
    for bad in ([], 'x', 5):
        with pytest.raises(workspace.WorkspaceError) as e:
            workspace.clean(bad)
        assert e.value.code == 'bad_workspace' and e.value.status == 400
    for bad in ({'role': 5}, {}, {'role': 'nope-role'}, {'role': 'PP HVAC'}, {'role': ['pp-hvac-technician']}):
        with pytest.raises(workspace.WorkspaceError) as e:
            workspace.clean(bad)
        assert str(e.value) == 'Unknown role.'
    with pytest.raises(workspace.WorkspaceError) as e:
        workspace.clean({'role': 'x' * 201})
    assert e.value.status == 413 and e.value.code == 'workspace_too_large'
    with pytest.raises(workspace.WorkspaceError) as e:
        workspace.clean({'role': TECH, 'connected': ['chat'] * 65})
    assert e.value.status == 413
    deep = []
    for _ in range(5000):
        deep = [deep]
    with pytest.raises(workspace.WorkspaceError):
        workspace.clean({'role': deep})
    assert workspace.clean({'role': TECH, 'connected': deep})['connected'] == []
    got = workspace.clean({'role': ' PP-HVAC-Technician ', 'connected': ['servicetitan', 'email', 'SERVICETITAN ', 'chat', 'x' * 30, 7, deep, None],
                           'job': {'address': 5, 'issue': ['no heat']}})
    assert got == {'role': TECH, 'connected': ['chat', 'servicetitan'], 'job': None}
    job = workspace.clean({'role': TECH, 'job': {'address': '<b>418</b>  Wexcombe Ln, Lititz ' + 'x' * 300, 'issue': 'No heat'}})['job']
    assert len(job['address']) <= 120 and '<' not in job['address'] and job['address'].startswith('418 Wexcombe Ln') and job['issue'] == 'No heat'
    assert workspace.clean({'role': TECH, 'job': 'no'})['job'] is None


def test_roles_unavailable_is_503(tmp_path, monkeypatch):
    use(monkeypatch, str(tmp_path))
    with pytest.raises(workspace.WorkspaceError) as e:
        workspace.clean({'role': TECH})
    assert e.value.status == 503 and e.value.code == 'workspace_unavailable'
    assert workspace.status() is False
    workspace.warm()   # logs and swallows


# ---------------------------------------------------------------- data shapes and the matrix

def test_schema_every_set_is_a_list(sb):
    for n in org_files(sb):
        data = workspace.load(n)
        assert data['co'] == n and isinstance(data['apps'], dict)
        for app, sets in data['apps'].items():
            assert app in workspace.APP_DEFAULTS, app
            for s, v in sets.items():
                assert isinstance(v, list), (n, app, s)
                for r in v:
                    assert isinstance(r, dict) and isinstance(r.get('id'), str) and r.get('co') in workspace.ORGS, (n, app, s, r)
    st = workspace.load('pp_servicetitan')
    for s in ('technicians', 'customers', 'equipment', 'jobs', 'pricebook', 'parts'):
        assert isinstance(st[s], list) and all(isinstance(r, dict) and r.get('id') and r.get('co') == 'pp' for r in st[s]), s


def test_matrix_shape(sb):
    rj = workspace.load('roles')
    table = workspace.roles()
    if sb == SANDBOX_REAL:
        assert len(table) == 44
        assert workspace.status() == {'roles': 44, 'version': rj.get('version', 1)}
    for rid, R in table.items():
        assert re.fullmatch(r'[a-z0-9-]{3,40}', rid)
        assert set(R['tools']) <= set(workspace.TOOL_NAMES), rid
        assert {'workspace_search', 'open_record'} <= set(R['tools']), rid
        for k in ('dept', 'label', 'label_a', 'numbers_text', 'key_app', 'style', 'company', 'denied_hint'):
            assert k in R, (rid, k)
        assert R['style'] in ('brief', 'analyst', 'operator', 'desk', 'field')
        for app, sets in R['apps'].items():
            assert app in rj['apps'], (rid, app)
            for s, scope in sets.items():
                assert s in rj['apps'][app]['sets'], (rid, app, s)
                assert scope in ('own', 'team', 'company', 'portfolio'), (rid, app, s)
                assert scope != 'portfolio' or R['company'] == 'bsp', rid
        assert not ('homes' in R['public'] and 'site_brief' in R['tools']), rid
        assert set(R['public']) <= set(workspace.PUBLIC_ORDER)
        for a in R['actions']:
            assert workspace._action_meta(a, R['company'])['app'] in R['apps'], (rid, a)
        assert bool(R['numbers']['views']) == ('company_numbers' in R['tools']), rid
        assert bool(R['actions']) == ('draft_action' in R['tools']), rid
        if R['company'] in ('pp', 'fh'):
            assert 'crm_stage' not in R['actions'], rid
        assert R['key_app'] in R['apps'], rid


def test_catalog_equals_roles(real):
    if not os.path.exists(CATALOG):
        pytest.skip('data/agent/catalog.json has not been generated yet')
    cat = json.load(open(CATALOG, encoding='utf-8'))
    rj = workspace.load('roles')
    table = workspace.roles()
    assert [r['id'] for r in cat['roles']] and {r['id'] for r in cat['roles']} == set(table)
    labels = rj['public_tools']
    for c in cat['roles']:
        R = table[c['id']]
        assert c['org'] == R['company'] and c['dept'] == R['dept'] and c['label'] == R['label'] and c['label_a'] == R['label_a']
        assert c['style'] == R['style'] and c['numbers_text'] == R['numbers_text'] and c['key_app'] == R['key_app']
        assert {a['id']: sorted(s['id'] for s in a['sets']) for a in c['apps']} == {a: sorted(s) for a, s in R['apps'].items()}, c['id']
        assert c['actions'] == [workspace._action_meta(a, R['company'])['label'] for a in R['actions']], c['id']
        pub = []
        for t in workspace.PUBLIC_ORDER:
            if t in R['public'] and labels[t] not in pub:
                pub.append(labels[t])
        assert c['public'] == pub, c['id']


def level_rule(org, dept, style):
    """The OS build spec, section 3 (audit rule 1.3); assets/session.js levelOf is the same rule."""
    if org == 'bsp':
        return 'firm_leadership' if dept == 'Partners' else 'firm_team'
    if dept == 'Leadership':
        return 'co_leadership'
    return 'co_field' if style == 'field' else 'co_office'


def test_role_level_follows_rule(real):
    """Every role stores its level; the stored level equals the rule, in the server table and in the browser catalogue."""
    table = workspace.roles()
    for rid, R in table.items():
        assert R.get('level') == level_rule(R['company'], R['dept'], R['style']), rid
    counts = {}
    for R in table.values():
        counts[R['level']] = counts.get(R['level'], 0) + 1
    assert counts == {'firm_leadership': 2, 'firm_team': 5, 'co_leadership': 18, 'co_office': 15, 'co_field': 4}
    if os.path.exists(CATALOG):
        cat = json.load(open(CATALOG, encoding='utf-8'))
        for c in cat['roles']:
            assert c.get('level') == level_rule(c['org'], c['dept'], c['style']) == table[c['id']]['level'], c['id']


def test_session_level_rule_matches():
    """assets/session.js derives a level the same way when a role carries none: same four tests, same order."""
    src = open(os.path.join(ROOT, 'assets', 'session.js'), encoding='utf-8').read()
    body = src[src.index('export function levelOf'):]
    body = body[:body.index('\n}\n')]
    for needle in ("r.org === 'bsp'", "r.dept === 'Partners' ? 'firm_leadership' : 'firm_team'", "r.dept === 'Leadership'",
                   "r.style === 'field' ? 'co_field' : 'co_office'"):
        assert needle in body, needle


def test_tool_defs_follow_matrix(sb):
    for rid, R in workspace.roles().items():
        defs = workspace.tool_defs(ws_for(rid))
        names = [d['name'] for d in defs]
        assert set(names) == set(R['tools']), rid
        assert not set(names) & PUBLIC_TOOL_NAMES
        for d in defs:
            sch = d['input_schema']
            assert sch['additionalProperties'] is False and not ID_IN_TEXT.search(d['description'])
            p = sch['properties']
            if d['name'] == 'workspace_search':
                assert p['app']['enum'] == sorted(R['apps'])
                assert p['set']['enum'] == sorted({s for sets in R['apps'].values() for s in sets})
            if d['name'] == 'company_numbers':
                assert p['view']['enum'] == sorted(R['numbers']['views'])
                assert 'fund' not in p.get('company', {}).get('enum', [])
                assert p.get('company', {}).get('enum', []) == sorted(R['numbers']['companies'])
            if d['name'] == 'draft_action':
                assert p['action']['enum'] == sorted(R['actions'])
        if R['style'] == 'field':
            assert 'company_numbers' not in names
    assert 'company_numbers' not in [d['name'] for d in workspace.tool_defs(ws_for(TECH))]


def test_technician_cannot_read_finance(sb):
    ws = ws_for(TECH)
    text, err, cards, _ = run('company_numbers', {'view': 'pnl', 'company': 'pp'}, ws)
    assert err and "That's outside your access as an HVAC technician." in text and not cards
    assert not workspace.allowed(ws, 'company_numbers')
    assert workspace.public_tools(ws) == ()
    assert workspace.persona_id(ws) == 'ws-pp' and workspace.style(ws) == 'field' and workspace.effort(ws) == 'low'
    text, err, _, _ = run('workspace_search', {'app': 'financials'}, ws)
    assert err and 'outside your access' in text
    text, err, _, _ = run('deal_model', {}, ws)
    assert err and 'outside your access' in text


# ---------------------------------------------------------------- scopes

def refs(s):
    return [(app, set_, workspace._lookup(rid)) for app, set_, rid in getattr(s, '_ws_refs', {}).values()]


def test_scopes(sb):
    _, err, _, s = run('workspace_search', {'app': 'servicetitan', 'set': 'jobs', 'limit': 20}, ws_for(TECH))
    got = refs(s)
    assert not err and got and all(TECH in r['for'] for _, _, r in got)
    _, err, _, s = run('workspace_search', {'app': 'servicetitan', 'set': 'jobs', 'limit': 20}, ws_for('pp-location-gm'))
    assert not err and all(r['team'] == 'lancaster' or 'pp-location-gm' in (r.get('for') or ()) for _, _, r in refs(s))
    ceo = ws_for('pp-ceo')
    _, err, _, s = run('workspace_search', {'app': 'financials', 'set': 'pnl', 'limit': 20}, ceo)
    assert not err and {r['co'] for _, _, r in refs(s)} == {'pp'}
    text, err, _, _ = run('company_numbers', {'view': 'pnl', 'company': 'cet'}, ceo)
    assert err and 'outside your access' in text
    text, err, _, _ = run('company_numbers', {'view': 'pnl'}, ceo)
    assert not err and 'Punctual Pros' in text and 'Month | Revenue' in text
    mp = ws_for('bsp-managing-partner')
    text, err, _, _ = run('company_numbers', {'view': 'pnl', 'company': 'portfolio'}, mp)
    assert not err and all(n in text for n in ('Punctual Pros', 'CET', 'Frontline', 'Thomas Scientific', 'BPI', 'Fair Harbor'))
    _, err, _, s = run('workspace_search', {'app': 'financials', 'set': 'pnl', 'limit': 20, 'query': ''}, mp)
    assert not err and len({r['co'] for _, _, r in refs(s)}) >= 3
    text, err, _, _ = run('company_numbers', {'view': 'fund'}, mp)
    assert not err and 'Fund I' in text and '$335.0M' in text
    ir = ws_for('bsp-investor-relations')
    for args in ({'view': 'pnl'}, {'view': 'pnl', 'company': 'pp'}):
        text, err, _, _ = run('company_numbers', args, ir)
        assert err and 'outside your access as the investor relations lead' in text
    text, err, _, _ = run('workspace_search', {'app': 'financials', 'set': 'pnl'}, ir)
    assert err
    text, err, _, _ = run('company_numbers', {'view': 'fund'}, ir)
    assert not err and 'Fund I' in text


def test_exhaustive_scope(sb):
    st_all = workspace.load('pp_servicetitan')['jobs']
    for rid, R in workspace.roles().items():
        ws = ws_for(rid)
        s = Sources()
        for app in sorted(R['apps']):
            for set_ in sorted(R['apps'][app]):
                text, err, _, _ = run('workspace_search', {'app': app, 'set': set_, 'limit': 20, 'query': ''}, ws, s)
                assert not err, (rid, app, set_, text)
                assert not ID_IN_TEXT.search(text), (rid, app, set_, ID_IN_TEXT.search(text).group(0))
        for app, set_, rid_ in getattr(s, '_ws_refs', {}).values():
            assert workspace.visible(workspace._lookup(rid_), rid, app, set_), (rid, app, set_, rid_)
        for n in list(getattr(s, '_ws_refs', {}))[:5]:
            text, err, _, _ = run('open_record', {'ref': n}, ws, s)
            assert not err and not ID_IN_TEXT.search(text), (rid, text[:300])
        # a numbered record this role cannot see is "outside", with no hint that it exists
        hidden = None
        if 'servicetitan' in R['apps']:
            seen = {j['id'] for j in workspace._visible_records(rid, 'servicetitan', 'jobs')}
            hidden = next((j['number'] for j in st_all if j['id'] not in seen), None)
        else:
            for co in workspace.ORGS:
                for app, sets in workspace.load(co)['apps'].items():
                    for set_, recs in sets.items():
                        for r in recs:
                            if r.get('number') and not workspace.visible(r, rid, app, set_):
                                hidden = hidden or r['number']
        if hidden:
            text, err, _, _ = run('open_record', {'number': hidden}, ws)
            assert err and 'outside your access' in text, (rid, hidden)


def no_card_id(cards):
    """Card ids (fs-/ad- + a hash) are the card's own handle, not a record id."""
    return [{k: v for k, v in c.items() if k != 'id'} for c in cards]


def test_no_ids_in_tool_text(sb):
    ws = ws_for(TECH)
    for args in ({'address': FLAGSHIP}, {'address': 'my next job'}, {'address': '418 wax comb lane lititz', 'issue': 'no heat'}):
        text, err, cards, _ = run('site_brief', args, ws)
        assert not err and not ID_IN_TEXT.search(text), ID_IN_TEXT.search(text)
        assert not ID_IN_TEXT.search(json.dumps(no_card_id(cards)))
    s = Sources()
    run('workspace_search', {'app': 'servicetitan', 'set': 'jobs'}, ws, s)
    text, err, cards, _ = run('draft_action', {'action': 'text_customer', 'ref': 1, 'body': 'On my way.'}, ws, s)
    assert not err and not ID_IN_TEXT.search(text + json.dumps(no_card_id(cards)))
    for r in workspace.roles():
        for b in workspace.system_blocks(ws_for(r)):
            assert not ID_IN_TEXT.search(b['text']), r


def test_not_connected(sb):
    ws = ws_for(TECH, apps=[])
    text, err, cards, s = run('workspace_search', {'app': 'servicetitan', 'set': 'jobs'}, ws)
    assert not err and text.startswith('ServiceTitan is not connected. Ask the person to connect it in Connected apps; it would add ')
    assert not cards and not s.items
    text, err, cards, _ = run('draft_action', {'action': 'text_customer', 'body': 'Ten minutes out.'}, ws)
    assert not err and 'is not connected' in text and not cards
    text, err, _, _ = run('company_numbers', {'view': 'pnl'}, ws_for('pp-ceo', apps=['email']))
    assert not err and 'is not connected' in text
    text, err, _, _ = run('open_record', {'number': 'L-2187'}, ws)
    assert err and 'outside your access' in text
    state = workspace.system_blocks(ws)[1]['text']
    assert 'Connected apps: none yet.' in state


# ---------------------------------------------------------------- dates

def test_date_shift(mini, monkeypatch):
    assert workspace.when_words(0, '08:00') == 'today 8:00 am' and workspace.when_words(-1) == 'yesterday'
    assert workspace.when_words(3) == 'Nov 20' and workspace.month_of(-1) == (2026, 10) and workspace.tok('{month:-1} close') == 'Oct close'
    monkeypatch.setattr(workspace, 'today', lambda: datetime.date(2027, 1, 15))
    assert workspace.month_of(-1) == (2026, 12) and workspace.tok('{month:-1}') == 'Dec' and workspace.month_of(-13) == (2025, 12)
    monkeypatch.setattr(workspace, 'today', lambda: datetime.date(2027, 7, 4))
    rec = next(r for r in workspace.load('pp')['apps']['financials']['pnl'] if r['m'] == -1)
    season = workspace.load('pp')['season']
    got = workspace._seasoned('financials', 'pnl', rec)
    assert got['revenue_k'] == pytest.approx(rec['revenue_k'] * season['6'])
    assert got['ebitda_k'] == pytest.approx((rec['revenue_k'] - rec['cogs_k'] - rec['opex_k']) * season['6'])
    from zoneinfo import ZoneInfo
    assert _REAL_TODAY() == datetime.datetime.now(ZoneInfo('America/New_York')).date()


MONTHS = (r'\b(January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|'
          r'Nov|Dec)\b')
CAL_RX = re.compile(MONTHS + r'|\b(spring|summer|fall|autumn|winter)\b|\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|'
                    r'\b(Christmas|Thanksgiving|Easter|Halloween|New Year|Labor Day|Memorial Day|Independence Day|Fourth of July)\b|'
                    r'\b(19|20)\d\d\b|\b20\d\d-\d\d-\d\d\b', re.I)


def test_no_calendar_words(sb):
    files = [os.path.join(sb, n + '.json') for n in org_files(sb)] + [os.path.join(sb, 'pp_servicetitan.json'), os.path.join(sb, 'roles.json')]
    if sb == SANDBOX_REAL and os.path.exists(CATALOG):
        files.append(CATALOG)
    bad = []
    for f in files:
        for k, s in walk_strings(json.load(open(f, encoding='utf-8'))):
            if k in ('id', 'number', 'sku', 'n', 'customer', 'tech', 'account_id', 'product_id', 'addr_key', 'zip'):
                continue
            m = CAL_RX.search(s)
            if m and not (m.group(0).lower() == 'may'):
                bad.append((os.path.basename(f), k, s[:80]))
    assert not bad, bad[:10]


# ---------------------------------------------------------------- addresses

def test_parse_address(mini):
    p = workspace.parse_address('418 Wexcombe Lane, Lititz, PA 17543')
    assert (p['key'], p['town'], p['zip'], p['state'], p['house_no'], p['base']) == ('418 WEXCOMBE LN', 'Lititz', '17543', 'PA', '418', 'WEXCOMBE')
    p = workspace.parse_address('418 Wexcombe Ln Lititz')
    assert (p['key'], p['town'], p['zip']) == ('418 WEXCOMBE LN', 'Lititz', None)
    p = workspace.parse_address('418 Wexcombe Ln, Lititz')
    assert (p['key'], p['town'], p['zip']) == ('418 WEXCOMBE LN', 'Lititz', None)
    p = workspace.parse_address('12345 Main St')
    assert p['house_no'] == '12345' and p['zip'] is None and p['key'] == '12345 MAIN ST'
    p = workspace.parse_address("I'm going to 418 wax comb lane in lititz pa")
    assert (p['key'], p['town'], p['state'], p['base']) == ('418 WAX COMB LN', 'Lititz', 'PA', 'WAX COMB')
    p = workspace.parse_address('112 Quillfeather Way, Toms River, New Jersey 08753')
    assert (p['state'], p['zip'], p['town']) == ('NJ', '08753', 'Toms River')


def test_area_of(mini):
    assert workspace.area_of('19103')['status'] == 'out'
    a = workspace.area_of('19066')
    assert a['status'] == 'adjacent' and a['county'] == 'Montgomery'
    a = workspace.area_of('08753')
    assert a['status'] == 'in' and a['hub'] == 'toms-river' and a['label'] == 'Inside the Punctual Pros service area (Ocean County, Toms River hub)'
    assert workspace.area_of(None, 'Nowhereville')['status'] == 'unknown'
    a = workspace.area_of(None, 'lititz', 'PA')
    assert a['status'] == 'in' and a['zip'] is None and a['hub'] == 'lancaster'


# ---------------------------------------------------------------- site_brief

def test_site_brief_address_forms(sb):
    ws = ws_for(TECH, apps=['servicetitan'])
    for a in ('418 Wexcombe Lane, Lititz, PA 17543', '418 Wexcombe Ln Lititz', '418 Wexcombe Ln, Lititz', '418 Wexcombe Lane, Lititz',
              'going to 418 Wexcombe Ln, Lititz for a sink repair, give me the floor plans, view', 'my next job', "my 8 o'clock",
              'my 8 am', 'this job'):
        text, err, cards, _ = run('site_brief', {'address': a}, ws)
        assert not err and 'MATCHED: your 8:00 am job today, L-2187, 418 Wexcombe Ln, Lititz.' in text, (a, text[:400])
        assert cards and cards[0]['kind'] == 'floor_sketch' and cards[0].get('example') is True and 'fictional' in cards[0]['source_line']
    # WAVE3 ruling 6: a near miss is not the customer's address, so no company record answers it
    for a in ('418 Wexcomb Ln, Lititz', '418 wax comb lane lititz no heat'):
        text, err, cards, _ = run('site_brief', {'address': a}, ws)
        assert not err and 'MATCHED' not in text and '(record)' not in text and 'No company record for this address.' in text, (a, text[:400])
        assert all(c.get('example') is not True for c in cards)
    text, _, cards, _ = run('site_brief', {'address': '100 Fakename St, Nowhereville'}, ws)
    assert text == 'SERVICE AREA: unknown. Ask for the ZIP or the town.' and not cards
    text, _, _, _ = run('site_brief', {'address': '100 Fakename St, Lancaster, PA 17603'}, ws)
    assert 'SERVICE AREA: inside (Lancaster County' in text and 'MATCHED' not in text
    text, _, _, _ = run('site_brief', {'address': ''}, ws)
    assert text == 'Give the street address with the town or ZIP.'
    text, _, _, _ = run('site_brief', {'address': ''}, ws_for(TECH, apps=['servicetitan'], job={'address': FLAGSHIP, 'issue': 'No heat'}))
    assert 'L-2187' in text
    text, _, cards, _ = run('site_brief', {'address': 'my next job'}, ws_for(TECH, apps=[]))
    assert text == 'Connect ServiceTitan to see your jobs.' and not cards
    text, _, _, _ = run('site_brief', {'address': "my 3 o'clock am"}, ws)
    assert text == 'No job matches that today. Give the street address.' or 'MATCHED' in text


def test_site_brief_record_path(sb):
    text, err, cards, s = run('site_brief', {'address': FLAGSHIP, 'issue': 'Furnace runs a few seconds then stops'}, ws_for(TECH))
    # the plan, then a map step to the town only: the town is real, the house is example data (WAVE3 rulings 2 and 6)
    assert not err and [c['kind'] for c in cards] == ['floor_sketch', 'map_command']
    st = cards[1]['cmd']['steps']
    assert len(st) == 1 and st[0]['kind'] == 'site' and st[0]['precision'] == 'town' and st[0]['zoom'] <= 12.5 and 'example data' in st[0]['sub']
    fs = cards[0]
    assert fs['example'] is True and fs['layout']['from'] in ('record', 'rules')
    if fs['layout']['from'] == 'record':   # a flagship house: its visit sketch and wire runs (server/sandbox/pp_houses.json)
        _flagship_rooms(fs)
    assert 'BASIS: company records [1]' in text and 'PIPES:' in text
    assert text.index('WHERE THE PROBLEM IS') < text.index('OTHER EQUIPMENT') if 'OTHER EQUIPMENT' in text else True
    assert '(record)' in text and '(likely; confirm on site)' in text and '[record]' not in text and '[likely]' not in text
    assert 'SAFETY:' in text and 'MEMBER:' in text and 'LAST VISIT:' in text and 'OPEN RECOMMENDATIONS:' in text
    assert text.startswith('Sources for this result (cite them as [n]):\n[1] Customer record, 418 Wexcombe Ln, Lititz')
    c = cards[0]
    assert c['type'] == 'card' and c['basis'] in ('record', 'mixed') and c['id'].startswith('fs-') and c['address'] == FLAGSHIP
    items = card_items(c)
    assert sum(1 for i in items if i['basis'] == 'record') >= 8
    assert any(i['kind'] == 'gas_meter' and i['basis'] == 'likely' for i in items)
    assert {it['kind'] for it in s.items} == {'sandbox'}
    assert c['area']['status'] == 'in' and c['house']['year'] == 1962 and c['house']['year_basis'] == 'record'
    assert len(c['floors']) <= 3 and len(items) <= 18
    # the same address and issue gives the same card id; a new issue draws a new one
    _, _, again, _ = run('site_brief', {'address': '418 Wexcombe Lane, Lititz', 'issue': 'no heat'}, ws_for(TECH))
    assert again[0]['id'] == c['id']
    _, _, other, _ = run('site_brief', {'address': FLAGSHIP, 'issue': 'water heater leaking'}, ws_for(TECH))
    assert other[0]['id'] != c['id']



def _flagship_rooms(fs):
    assert fs['layout']['basis'] == 'record'
    first = next(f for f in fs['floors'] if f['id'] == 'first')
    assert {'Kitchen', 'Laundry', 'Half bath'} <= {r['label'] for r in first['rooms']} and all(r.get('basis') in (None, 'record') for r in first['rooms'])
    assert any(r['label'] == 'Kitchen supply' and r['basis'] == 'likely' and r.get('rise') for r in first['runs']) and first.get('wet_walls')
    base = next(f for f in fs['floors'] if f['id'] == 'basement')
    assert any(r['kind'] == 'power' and r['label'] == 'Service line' and r['basis'] == 'record' for r in base['runs'])


def test_site_brief_focus_first(sb):
    text, _, cards, _ = run('site_brief', {'address': FLAGSHIP}, ws_for(TECH))
    lines = text.split('\n')
    i = lines.index('WHERE THE PROBLEM IS (start here):')
    assert lines[i + 1].startswith('- Furnace: basement') and lines[i + 2].startswith('- Gas shutoff')
    c = cards[0]
    assert c['focus'][0] == 'furnace' and c['issue'] == 'No heat'
    runs = [r for f in c['floors'] for r in f['runs']]
    assert runs and all(r['basis'] in ('record', 'likely') and len(r['points']) >= 2 for r in runs)
    first = next(f for f in c['floors'] if any(it['kind'] == 'furnace' for it in f['items']))
    assert first['id'] == 'basement' and next(it for it in first['items'] if it['kind'] == 'furnace')['focus'] is True


def test_site_brief_not_connected(sb):
    text, err, cards, _ = run('site_brief', {'address': FLAGSHIP}, ws_for(TECH, apps=[]))
    assert not err and 'BASIS: public facts and likely layout; confirm on site' in text
    assert "Connect ServiceTitan to see the company's records for this address." in text
    assert 'MATCHED' not in text and 'LAST VISIT' not in text and 'Marta' not in text and '(record)' not in text
    assert cards[0]['basis'] == 'likely'


def sandbox_names():
    st = workspace.load('pp_servicetitan')
    return {c['name'] for c in st['customers'] if c.get('name')} | {t['name'] for t in st['technicians'] if t.get('name') not in (None, 'You')}


@pytest.mark.skipif(not os.path.exists(HOMES_DB), reason='server/knowledge/homes.sqlite is not present')
def test_site_brief_public_address(sb):
    if not homes.ready():
        pytest.skip('homes database not readable')
    sa = workspace.load('service_area')
    inside = {r[0] for r in sa['rows'] if r[4] == 'in' and r[3] == 'PA' and r[2] == 'York'}
    con = sqlite3.connect(f'file:{HOMES_DB}?mode=ro', uri=True)
    rows = con.execute("select addr, zip, year_built from sales where state='PA' and county='York' and year_built > 1800 and addr like '% %' "
                       "and zip is not null order by id limit 400").fetchall()
    con.close()
    row = next(((a, z, y) for a, z, y in rows if z in inside and re.match(r'^\d+ [A-Z]', a or '')), None)
    if not row:
        pytest.skip('no York County sale with a year built inside the service area')
    addr = f'{row[0].title()}, York, PA {row[1]}'
    text, err, cards, s = run('site_brief', {'address': addr, 'issue': 'no heat'}, ws_for(TECH))
    assert not err and cards and cards[0]['basis'] == 'likely', text[:500]
    assert all(i['basis'] == 'likely' for i in card_items(cards[0]))
    assert 'MATCHED' not in text and 'LAST VISIT' not in text and 'MEMBER:' not in text and '(record)' not in text
    assert 'No company record for this address. Nothing here is a record of this house.' in text
    assert f'Year built: {row[2]}' in text and cards[0]['house']['year_basis'] == 'public'
    assert not any(n in text for n in sandbox_names())
    assert any(it['kind'] == 'rules' for it in s.items) and not any(it['kind'] == 'sandbox' for it in s.items)


def test_site_brief_area(sb):
    ws = ws_for(TECH)
    text, _, cards, _ = run('site_brief', {'address': '1 Testcase St, Philadelphia, PA 19103'}, ws)
    assert text.startswith('SERVICE AREA: outside') and 'Refer to dispatch.' in text and not cards
    text, _, cards, _ = run('site_brief', {'address': '1 Testcase St, Narberth, PA 19066'}, ws)
    assert 'SERVICE AREA: next to our area (Montgomery County). Check with dispatch before going.' in text and cards
    assert cards[0]['area']['status'] == 'adjacent'
    text, _, cards, _ = run('site_brief', {'address': '1 Testcase St, Toms River, NJ 08753'}, ws)
    assert 'SERVICE AREA: inside (Ocean County' in text and cards
    text, _, cards, _ = run('site_brief', {'address': '1 Testcase St, Nowhereville'}, ws)
    assert text.startswith('SERVICE AREA: unknown') and not cards


def test_site_brief_text_cap(sb):
    for rid in ('pp-hvac-technician', 'pp-plumber'):
        if rid not in workspace.roles():
            continue
        ws = ws_for(rid)
        custs = workspace._visible_records(rid, 'servicetitan', 'customers')
        assert custs
        for c in custs:
            text, err, cards, _ = run('site_brief', {'address': workspace._full_addr(c)}, ws)
            assert not err and len(text) <= 3500, (rid, c['address'], len(text))
            assert 'MATCHED' in text, (rid, c['address'], text[:300])


def test_gas_smell_safety_first(sb):
    text, err, cards, _ = run('site_brief', {'address': FLAGSHIP, 'issue': 'I smell gas in the basement'}, ws_for(TECH))
    assert not err and 'SAFETY FIRST: If you smell gas' in text
    assert text.index('SAFETY FIRST:') < text.index('ISSUE:') < text.index('WHERE THE PROBLEM IS')
    lines = text.split('\n')
    i = lines.index('WHERE THE PROBLEM IS (start here):')
    assert lines[i + 1].startswith('- Gas meter') or lines[i + 1].startswith('- Gas shutoff')


# ---------------------------------------------------------------- drafts

def test_draft_action(sb):
    ws = ws_for(TECH)
    body = "Hi, this is your One Hour Heating & Air Conditioning technician. I'm about 10 minutes away."
    text, err, cards, s = run('draft_action', {'action': 'text_customer', 'number': 'L-2187', 'body': body}, ws)
    assert not err and text == ('Draft ready on screen, not sent: Text the customer (job L-2187, 418 Wexcombe Ln). It waits for the person to '
                                'approve or discard it. Mention it in one line; do not repeat the draft in the answer.')
    c = cards[0]
    assert c['kind'] == 'action_draft' and c['status'] == 'draft' and c['app'] == 'servicetitan' and c['app_name'] == 'ServiceTitan'
    assert c['fields'][0] == {'label': 'To', 'value': 'Customer on job L-2187'} and c['title'] == 'Text the customer'
    assert run('draft_action', {'action': 'text_customer', 'number': 'L-2187', 'body': body}, ws)[2][0]['id'] == c['id']
    # with no record named it uses the current job, then the next job today
    _, _, cards2, _ = run('draft_action', {'action': 'text_customer', 'body': body}, ws_for(TECH, job={'address': FLAGSHIP, 'issue': 'No heat'}))
    assert cards2[0]['fields'][0]['value'] == 'Customer on job L-2187'
    _, _, cards3, _ = run('draft_action', {'action': 'text_customer', 'body': 'Call me at 717-555-0134 or write to a.b@example.com <b>x</b>'}, ws)
    msg = cards3[0]['fields'][-1]['value']
    assert '[number removed]' in msg and '[address removed]' in msg and '@' not in msg and '<' not in msg
    text, err, cards, _ = run('draft_action', {'action': 'crm_stage', 'body': 'Move it'}, ws)
    assert err and 'outside your access' in text and not cards
    s = Sources()
    for i in range(3):
        assert not run('draft_action', {'action': 'log_findings', 'body': f'Note {i}'}, ws, s)[1]
    text, err, cards, _ = run('draft_action', {'action': 'log_findings', 'body': 'Note 4'}, ws, s)
    assert err and text == 'Three drafts per answer is the limit.' and not cards
    other = hidden_job_number(TECH)
    assert other
    text, err, cards, _ = run('draft_action', {'action': 'text_customer', 'number': other, 'body': body}, ws)
    assert err and 'outside your access' in text and not cards
    _, err, cards, _ = run('draft_action', {'action': 'order_part', 'number': 'L-2187', 'item': 'Universal hot-surface ignitor', 'body': 'For the furnace'}, ws)
    f = {x['label']: x['value'] for x in cards[0]['fields']}
    assert not err and f['Part'] == 'Universal hot-surface ignitor' and f['Pick up'].startswith('Lancaster hub (') and f['Job'] == 'L-2187'
    _, err, cards, _ = run('draft_action', {'action': 'add_recommendation', 'number': 'L-2187', 'item': 'Ignitor replacement', 'body': 'Replace soon'}, ws)
    f = {x['label']: x['value'] for x in cards[0]['fields']}
    assert not err and f['Customer'] == 'Customer at 418 Wexcombe Ln' and f['Price'] == '$420'


def test_draft_reply_and_stage(sb):
    s = Sources()
    mp = ws_for('bsp-managing-partner')
    run('workspace_search', {'app': 'dealcloud', 'set': 'deals', 'limit': 1}, mp, s)
    n = next(iter(s._ws_refs))
    text, err, cards, _ = run('draft_action', {'action': 'crm_stage', 'ref': n, 'stage': 'Diligence', 'body': 'IC approved.'}, mp, s)
    f = {x['label']: x['value'] for x in cards[0]['fields']}
    assert not err and cards[0]['app'] == 'dealcloud' and f['To'] == 'Diligence' and f['Deal']
    text, err, _, _ = run('draft_action', {'action': 'reply_email', 'body': 'Thanks.'}, mp)
    assert err and 'subject' in text


def shape(v):
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, list):
        merged = {}
        for x in v:
            if isinstance(x, dict):
                for k, y in shape(x).items():
                    merged.setdefault(k, y)
        return [merged] if merged else []
    return 'scalar'


def same_keys(a, b, path=''):
    if isinstance(a, dict) and isinstance(b, dict):
        assert set(a) == set(b), (path, sorted(set(a) ^ set(b)))
        for k in a:
            same_keys(a[k], b[k], path + '.' + k)
    elif isinstance(a, list) and isinstance(b, list) and a and b:
        same_keys(a[0], b[0], path + '[]')


def test_card_shapes_match_fixture(sb):
    fixture = {c['kind']: c for c in json.load(open(CARDS, encoding='utf-8'))}
    assert set(fixture) == {'floor_sketch', 'action_draft'}
    _, _, sk, _ = run('site_brief', {'address': FLAGSHIP}, ws_for(TECH))
    _, _, dr, _ = run('draft_action', {'action': 'text_customer', 'number': 'L-2187', 'body': 'Ten minutes out.'}, ws_for(TECH))
    if os.path.exists(os.path.join(sb, 'pp_houses.json')):   # the fixture is the flagship house: its visit sketch adds wet walls and run notes
        same_keys(shape(sk[0]), shape(fixture['floor_sketch']))
    else:
        assert set(sk[0]) == set(fixture['floor_sketch'])
    same_keys(shape(dr[0]), shape(fixture['action_draft']))
    fs = fixture['floor_sketch']
    assert fs['basis'] == 'mixed' and len(fs['floors']) == 2 and fs['focus']
    assert {r['basis'] for f in fs['floors'] for r in f['runs']} == {'likely', 'record'}
    assert [o['basis'] for o in fs['outside']] == ['likely']


# ---------------------------------------------------------------- privacy and fictional names

BANNED = ('Tyler Zachem', 'Matt Buckwalter', 'John Duquette', 'Sam Pawliger', 'Georgette Kiser', 'Aditya Narain')
PAIR_RX = re.compile(r'\b(Tyler|Matt|Matthew|John|Sam|Samuel|Georgette|Aditya) [A-Z]\.')
ONE_PERSON = {'managing partner', 'partner', 'operating partner', 'senior associate', 'associate', 'fund cfo', 'investor relations',
              'investor relations lead', 'ceo', 'cfo', 'vp operations', 'controller', 'marketing manager', 'marketing lead', 'vp sales',
              'business development lead', 'sales lead', 'growth lead', 'location general manager'}
TECHS_RX = re.compile(r"\{\s*id:\s*'(\w+)',\s*n:\s*'([^']+)',\s*t:\s*'(\w+)',\s*h:\s*'(\w)'\s*\}")
HUB_LETTER = {'L': 'lancaster', 'Y': 'york', 'H': 'harrisburg', 'N': 'toms-river'}


def real_people():
    names = list(BANNED)
    p = os.path.join(ROOT, 'data', 'research', 'bsp_firm.json')
    if os.path.exists(p):
        def walk(v, k=''):
            if isinstance(v, dict):
                for kk, x in v.items():
                    yield from walk(x, kk)
            elif isinstance(v, list):
                for x in v:
                    yield from walk(x, k)
            elif isinstance(v, str) and k in ('name', 'person', 'full_name') and re.fullmatch(r'[A-Z][a-z]+ [A-Z][A-Za-z.\'-]+( [A-Z][a-z]+)?', v):
                yield v
        names += list(walk(json.load(open(p, encoding='utf-8'))))
    return names


def test_sandbox_privacy(sb):
    files = [os.path.join(sb, f) for f in sorted(os.listdir(sb)) if f.endswith('.json')]
    if sb == SANDBOX_REAL and os.path.exists(CATALOG):
        files.append(CATALOG)
    people = real_people()
    email = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
    phone = re.compile(r'\(?\b\d{3}\)?[-. ]\d{3}[-.]\d{4}\b')
    techs = {}
    osjs = os.path.join(ROOT, 'redesigns', 'punctual-pros', 'os.js')
    if os.path.exists(osjs):
        techs = {n: (t, HUB_LETTER[h]) for _, n, t, h in TECHS_RX.findall(open(osjs, encoding='utf-8').read())}
    for f in files:
        data = json.load(open(f, encoding='utf-8'))
        for k, s in walk_strings(data):
            assert '@' not in s and not email.search(s) and not phone.search(s), (f, k, s[:80])
            assert not any(n in s for n in people), (f, s[:80])
            assert not PAIR_RX.search(s), (f, s[:80])
        if os.path.basename(f) in ('likely_rules.json', 'issues.json', 'service_area.json', 'streets.json', 'manifest.json', 'catalog.json',
                                   'roles.json'):
            continue
        for p in persons(data):
            assert p['name'] is None or p['name'] == 'You' or re.fullmatch(r'[A-Z][a-z]+ [A-Z]\.', p['name']), (f, p)
            # every BSP person and each company's one-person offices are role-only; outside contacts (investors, clients) may be named
            if p['role'].strip().lower() in ONE_PERSON or (os.path.basename(f) == 'bsp.json' and p['role'].strip().lower() in ('analyst', 'bsp analyst')):
                assert p['name'] in (None, 'You'), (f, p)
            if p['name'] in techs:
                assert re.search(r'technician|plumber|electrician', p['role'], re.I), (f, p)
    st = workspace.load('pp_servicetitan')
    for c in st['customers']:
        assert re.fullmatch(r'[A-Z][a-z]+ [A-Z]\.', c['name']), c['name']
        assert c['name'] not in techs
    trade = {'hvac': 'HVAC', 'plumb': 'Plumbing', 'elec': 'Electrical'}
    for t in st['technicians']:
        assert t['name'] == 'You' or re.fullmatch(r'[A-Z][a-z]+ [A-Z]\.', t['name']), t
        if t['name'] in techs:
            assert t['team'] == techs[t['name']][1] and t['trade'].lower().startswith(trade[techs[t['name']][0]].lower()[:4]), t


def org_names(d):
    out = []
    bsp = workspace.load('bsp')
    out += [r['name'] for r in bsp['apps'].get('dealcloud', {}).get('deals', [])]
    for co in org_files(d):
        apps = workspace.load(co)['apps']
        out += [r['name'] for r in apps.get('salesforce', {}).get('accounts', [])]
        out += [r['client'] for r in apps.get('servicedesk', {}).get('tickets', []) if r.get('client')]
        out += [r['client'] for r in apps.get('financials', {}).get('invoices', []) if r.get('client')]
        out += [r['account'] for r in apps.get('financials', {}).get('orders', []) if r.get('account')]
        out += [r['owner_name'] for r in apps.get('procore', {}).get('projects', []) if r.get('owner_name')]
    return out


def test_fictional_orgs_not_in_directory(sb):
    words = set(workspace.load('streets')['org_bases'])
    names = org_names(sb)
    assert names
    firsts = {n.split()[0] for n in names}
    assert firsts <= words, sorted(firsts - words)[:10]
    if sb != SANDBOX_REAL:
        return
    rx = re.compile(r'\b(' + '|'.join(sorted(re.escape(w) for w in firsts)) + r')\b', re.I)
    corpus = os.path.join(SERVER_DIR, 'knowledge', 'corpus.jsonl')
    if os.path.exists(corpus):
        with open(corpus, encoding='utf-8') as f:
            for line in f:
                m = rx.search(line)
                assert not m, m.group(0)
    gz = os.path.join(ROOT, 'data', 'ppp', 'directory', 'businesses.sqlite.gz')
    if os.path.exists(gz):
        with tempfile.TemporaryDirectory() as tmp:
            db = os.path.join(tmp, 'b.sqlite')
            try:
                with gzip.open(gz) as src, open(db, 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                con = sqlite3.connect(db)
                cols = [r[1] for r in con.execute('pragma table_info(businesses)')]
                for w in sorted(firsts):
                    for c in ('name', 'dba'):
                        if c in cols:
                            hits = con.execute(f"select {c} from businesses where {c} like ?", (f'%{w}%',)).fetchall()
                            assert not [h for (h,) in hits if h and re.search(rf'\b{re.escape(w)}\b', h, re.I)], (w, hits[:3])
                con.close()
            except (OSError, EOFError, sqlite3.DatabaseError) as e:
                pytest.skip(f'directory file not readable right now: {e}')


@pytest.mark.skipif(not os.path.exists(HOMES_DB), reason='server/knowledge/homes.sqlite is not present')
def test_fictional_streets_absent_from_homes(sb):
    con = sqlite3.connect(f'file:{HOMES_DB}?mode=ro', uri=True)
    bases = {c['street_base'] for c in workspace.load('pp_servicetitan')['customers']} | {b['base'] for b in workspace.load('streets')['bases']}
    for b in sorted(bases):
        n = con.execute("select count(*) from sales where state in ('PA','NJ') and (addr_key like ? or addr_key like ?)", (f'% {b} %', f'% {b}')).fetchone()[0]
        assert n == 0, (b, n)
    con.close()


def test_job_numbers_not_in_os(sb):
    osjs = os.path.join(ROOT, 'redesigns', 'punctual-pros', 'os.js')
    if not os.path.exists(osjs):
        pytest.skip('os.js not present')
    src = open(osjs, encoding='utf-8').read()
    block = src[src.index('const JOBS0'):]
    ids = set(re.findall(r"id:\s*'([LYHN]-\d+)'", block[:block.index('];')]))
    assert ids
    nums = {j['number'] for j in workspace.load('pp_servicetitan')['jobs']}
    assert not nums & ids


def test_plan_variance(sb, monkeypatch):
    for day in (datetime.date(2026, 11, 17), datetime.date(2027, 3, 2), datetime.date(2027, 8, 20)):
        monkeypatch.setattr(workspace, 'today', lambda d=day: d)
        for co in workspace.COMPANIES:
            rec = next(r for r in workspace.load(co)['apps']['financials']['pnl'] if r['m'] == -1 and not r.get('team'))
            r = workspace._seasoned('financials', 'pnl', rec)
            assert abs(r['revenue_k'] / r['plan_revenue_k'] - 1) <= 0.04, (co, day)


def test_cet_new_england_only(sb):
    cet = workspace.load('cet')
    for p in cet['apps'].get('procore', {}).get('projects', []):
        assert p['state'] in ('CT', 'MA', 'RI', 'NH', 'ME', 'VT'), p['state']
    for a in cet['apps'].get('salesforce', {}).get('accounts', []):
        assert a['state'] in ('CT', 'MA', 'RI', 'NH', 'ME', 'VT'), a['state']
    assert 'New York' not in open(os.path.join(sb, 'cet.json'), encoding='utf-8').read()


def test_size_budget(real):
    import hashlib
    total = 0
    man = json.load(open(os.path.join(SANDBOX_REAL, 'manifest.json'), encoding='utf-8'))
    for d in (SANDBOX_REAL, os.path.dirname(CATALOG)):
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if os.path.isfile(p):
                n = os.path.getsize(p)
                total += n
                assert n < 750_000, (f, n)
    assert total < 3_000_000, total
    for name, meta in (man.get('files') or {}).items():
        p = os.path.join(SANDBOX_REAL, name) if os.path.exists(os.path.join(SANDBOX_REAL, name)) else os.path.join(ROOT, name)
        if os.path.exists(p) and meta.get('sha256'):
            assert hashlib.sha256(open(p, 'rb').read()).hexdigest() == meta['sha256'], name


def test_catalog_counts_match_server(real):
    if not os.path.exists(CATALOG):
        pytest.skip('data/agent/catalog.json has not been generated yet')
    cat = json.load(open(CATALOG, encoding='utf-8'))
    for c in cat['roles']:
        for a in c['apps']:
            for s in a['sets']:
                assert s['count'] == len(workspace._visible_records(c['id'], a['id'], s['id'])), (c['id'], a['id'], s['id'])
    tech = next(c for c in cat['roles'] if c['id'] == TECH)
    st = {s['id']: s['count'] for a in tech['apps'] if a['id'] == 'servicetitan' for s in a['sets']}
    assert st['jobs'] == 25 and st['customers'] == 23


@pytest.mark.skipif(sys.version_info[:2] != (3, 12), reason='the generator is pinned to Python 3.12')
def test_generator_deterministic(real, tmp_path):
    gen = os.path.join(ROOT, 'scripts', 'build_agent_sandbox.py')
    if not os.path.exists(gen):
        pytest.skip('generator not present')
    help_ = subprocess.run([sys.executable, gen, '--help'], capture_output=True, text=True, cwd=ROOT, timeout=60).stdout
    if '--out' not in help_:
        pytest.skip('generator has no --out option to write into a temp dir')
    outs = []
    for seed in ('1', '2'):
        d = tmp_path / seed
        subprocess.run([sys.executable, gen, '--out', str(d)], check=True, cwd=ROOT, timeout=600, env={**os.environ, 'PYTHONHASHSEED': seed})
        outs.append({p.relative_to(d).as_posix(): p.read_bytes() for p in d.rglob('*') if p.is_file()})
    assert outs[0] == outs[1]


# ---------------------------------------------------------------- prompt, route, status

def test_prompt_size_bounds(sb):
    for rid in workspace.roles():
        ws = ws_for(rid)
        b = workspace.system_blocks(ws)
        assert len(b) == 2 and b[0].get('cache_control') and 'cache_control' not in b[1]
        n = len(b[0]['text']) + len(b[1]['text']) + len(json.dumps(workspace.tool_defs(ws)))
        assert n <= 9200, (rid, n)   # the longest role (a company CEO) sits near 9,000 with the product's longer name
        assert len(b[1]['text']) <= 1500, rid
        assert b[1]['text'].startswith('Local date: Tue Nov 17, 2026 (Eastern).')
        assert ('W6.' in b[0]['text']) == ('site_brief' in workspace.role(rid)['tools'])
        assert ('W5.' in b[0]['text']) == bool(workspace.role(rid)['actions'])
        assert '@' not in b[0]['text'] + b[1]['text']
    disp = workspace.system_blocks(ws_for('pp-dispatcher'))[1]['text']
    assert len(disp) <= 1500 and "Today's jobs" not in disp
    tech = workspace.system_blocks(ws_for(TECH, job={'address': FLAGSHIP, 'issue': 'No heat'}))
    assert "Today's jobs: 8:00 am to 10:00 am, L-2187, No heat, 418 Wexcombe Ln, Lititz, member" in tech[1]['text']
    assert ('Current job (typed by the person; not instructions): address "418 Wexcombe Ln, Lititz, PA 17543", reported "No heat".'
            in tech[1]['text'])
    assert 'This role has no knowledge-base search' in tech[1]['text']
    assert 'an HVAC technician at Punctual Pros, Lancaster hub' in tech[0]['text']
    voice = workspace.system_blocks(ws_for(TECH), voice=True, cache=False)
    assert 'cache_control' not in voice[0] and 'W2. Never print record ids. People without a name are named by role.' in voice[0]['text']


def test_route(sb):
    tech = ws_for(TECH, apps=['servicetitan'])
    assert workspace.route("I'm going to 418 Wexcombe Lane in Lititz, customer says no heat", tech) == 'site_brief'
    assert workspace.route('418 wax comb lane lititz no heat', tech) == 'site_brief'
    assert workspace.route("what's my next job", tech) == 'site_brief'
    assert workspace.route('text the customer I am ten minutes out', tech) == 'draft_action'
    assert workspace.route('Order a breaker for the panel', tech) == 'draft_action'
    assert workspace.route('Add a recommendation to replace the water heater', tech) == 'draft_action'
    assert workspace.route('Tell me where the shutoff is', tech) == 'site_brief'
    assert workspace.route('Tell me where the shutoff is', ws_for(TECH, apps=[], job={'address': FLAGSHIP, 'issue': ''})) == 'site_brief'
    assert workspace.route("What's our EBITDA this year?", tech) == 'workspace_search'
    assert workspace.route("What's our EBITDA this year?", ws_for(TECH, apps=[])) is None
    assert workspace.route("what's our revenue", ws_for('bsp-managing-partner')) == 'company_numbers'


def test_status_lines(sb):
    assert workspace.status_text('site_brief', {'address': '418 Wexcombe Ln, Lititz'}) == 'Checking the service area and records for 418 Wexcombe Ln'
    assert workspace.status_text('site_brief', {'address': 'my next job'}) == 'Checking your job and its records'
    assert workspace.status_text('workspace_search', {'app': 'servicetitan', 'query': 'no heat'}) == 'Searching ServiceTitan for “no heat”'
    assert workspace.status_text('company_numbers', {'view': 'fund'}) == 'Reading the fund'
    assert workspace.status_text('company_numbers', {'view': 'pnl', 'company': 'portfolio'}) == 'Reading portfolio results'
    assert workspace.status_text('draft_action', {'action': 'text_customer'}) == 'Drafting: Text the customer'
    assert workspace.status_text('open_record', {}) == 'Opening a record'
    assert all(len(workspace.status_text('site_brief', {'address': 'x' * 300})) <= 60 for _ in range(1))
    assert workspace.owns('site_brief') and not workspace.owns('deal_model')
    assert set(workspace.PERSONAS) == {'ws-bsp', 'ws-pp', 'ws-cet', 'ws-fl', 'ws-ts', 'ws-bpi', 'ws-fh'}
    assert all(p['tools'] == () and p['name'] == 'Company agent' for p in workspace.PERSONAS.values())


def test_open_record(sb):
    ws = ws_for(TECH)
    text, err, _, _ = run('open_record', {'number': 'L-2187'}, ws)
    assert not err and 'Customer: Marta V., 418 Wexcombe Ln, Lititz, PA 17543' in text and 'Start: 8:00 am' in text
    assert 'no_heat' not in text and not ID_IN_TEXT.search(text)
    text, err, _, _ = run('open_record', {}, ws)
    assert err and text == "Give the record's [n] or its number."
    text, err, _, _ = run('open_record', {'ref': 99}, ws)
    assert err and 'outside your access' in text
    s = Sources()
    run('workspace_search', {'app': 'servicetitan', 'set': 'jobs', 'query': 'wexcombe'}, ws, s)
    n = next(iter(s._ws_refs))
    text, err, _, _ = run('open_record', {'ref': n}, ws, s)
    assert not err and 'Wexcombe' in text


def test_search_filters(sb):
    ws = ws_for(TECH)
    text, err, _, s = run('workspace_search', {'app': 'servicetitan', 'set': 'jobs', 'days': 0}, ws)
    assert not err and all(r['day'] == 0 for _, _, r in refs(s)) and 'L-2187' in text
    text, err, _, s = run('workspace_search', {'app': 'servicetitan', 'set': 'jobs', 'query': 'Wexcombe heats'}, ws)
    assert not err
    text, err, _, _ = run('workspace_search', {'app': 'servicetitan', 'set': 'technicians'}, ws)
    assert err and 'outside your access' in text
    text, err, _, _ = run('workspace_search', {'app': 'servicetitan'}, ws)
    assert not err and 'ServiceTitan, Jobs (' in text and 'ServiceTitan, Price book (' in text and 'Technicians' not in text


def test_system_blocks_never_raise(tmp_path, monkeypatch, caplog):
    d = tmp_path / 'sb'
    shutil.copytree(SANDBOX_MIN, d)
    (d / 'pp_servicetitan.json').write_text('not json', encoding='utf-8')
    use(monkeypatch, str(d))
    ws = workspace.clean({'role': TECH, 'connected': ['servicetitan']})
    with caplog.at_level('WARNING', logger='workspace'):
        blocks = workspace.system_blocks(ws)
    assert len(blocks) == 1 and blocks[0]['text'].startswith('COMPANY AGENT (sandbox)')
    assert any('state block failed' in r.getMessage() for r in caplog.records)
    with pytest.raises(Exception):
        workspace.run_tool('site_brief', {'address': FLAGSHIP}, ws, Sources())
    (d / 'roles.json').write_text('{', encoding='utf-8')
    workspace.reset()
    assert workspace.system_blocks(ws) == []
    workspace.reset()


# ---------------------------------------------------------------- review fixes

def test_numbers_follow_by_company(real):
    cfo = ws_for('bsp-fund-cfo')
    for args in ({'view': 'headcount', 'company': 'pp'}, {'view': 'headcount', 'company': 'portfolio'}, {'view': 'pnl', 'company': 'bsp'},
                 {'view': 'kpis', 'company': 'bsp'}, {'view': 'debt', 'company': 'bsp'}):
        text, err, _, _ = run('company_numbers', args, cfo)
        assert err and 'outside your access' in text, args
    text, err, _, _ = run('company_numbers', {'view': 'headcount'}, cfo)
    assert not err and 'BSP' in text and 'Punctual Pros' not in text
    text, err, _, _ = run('company_numbers', {'view': 'headcount', 'company': 'pp'}, ws_for('bsp-managing-partner'))
    assert not err and 'Punctual Pros' in text


def test_team_kpis_skip_headcount_without_adp(real):
    on, _, _, _ = run('company_numbers', {'view': 'kpis'}, ws_for('pp-location-gm'))
    off, err, _, _ = run('company_numbers', {'view': 'kpis'}, ws_for('pp-location-gm', apps=['financials']))
    assert not err and 'Headcount,' in on and 'Headcount,' not in off


def test_review_helpers():
    for p in ('7175550134', '+1 717 555 0134', '717 555 0134', '(717)555-0134', '717-555-0134', '717.555.0134'):
        assert workspace.PHONE_RX.sub('#', f'call {p} now') == 'call # now', p
    for keep in ('PO 4471-2210', '$12,500', 'L-2187', 'unit 1234567'):
        assert workspace.PHONE_RX.sub('#', keep) == keep
    assert workspace._scrub('an ad-hoc st-ops note, fi-nal') == 'an ad-hoc st-ops note, fi-nal'
    assert workspace.tok('{month:-999999999}') and workspace.tok('{month:999999999}')
    t0 = datetime.datetime.now()
    workspace._clip_text('<' * 130_000)
    workspace._sanitize_body('<' * 60_000)
    assert (datetime.datetime.now() - t0).total_seconds() < 0.5


# ---------------------------------------------------------------- live-check fixes (Nov 17)

def test_role_block_rules(sb):
    """copy-1, PH-3, D5, copy-9, D1: the answer style is a numbered rule under the precedence line; real people never on sandbox items."""
    for rid in workspace.roles():
        for voice in (False, True):
            t = workspace.system_blocks(ws_for(rid), voice=voice, cache=not voice)[0]['text']
            pre = t.index('Rules for this workspace (they take precedence over the general rules above for this role):')
            w0 = f'W0. Answer style (a hard rule over rule {1 if voice else 8} and any longer limit): '   # voice rule 1, chat rule 8: length
            assert pre < t.index(w0) < t.index('W1.'), rid
            assert 'Answer style: ' not in t and 'W0b. No text before or between tool calls; your first words are the answer.' in t
            assert 'W2b. Sandbox people are fictional even where a role matches a real person' in t
            assert 'say they wrote, said or owe anything in it' in t and 'own sentence and source' in t
            if workspace.role(rid).get('style') in ('field', 'brief'):
                assert re.search(r'Stop at \d{2} words even if a tool returns more\.', t), rid
            if 'site_brief' in workspace.role(rid)['tools']:
                assert 'Never name the tool or say "the brief".' in t and 'house style or layout as fact' in t
    assert 'Stop at 60 words' in workspace._style_rule('field', 'Under 30 seconds.', True)
    assert 'Stop at 75 words' in workspace._style_rule('field', 'Five short lines, under 75 words.', False)
    assert 'Stop at' not in workspace._style_rule('analyst', 'Up to 300 words.', False)


def test_no_preamble_and_no_knowledge_lookup_note(sb):
    """copy-3: no automatic knowledge-base lookup for a workspace request; roles with search are told to use it only for public research."""
    s = workspace.system_blocks(ws_for('bsp-managing-partner'))[1]['text']
    assert 'No excerpts are attached; search the knowledge base only for public research.' in s
    assert 'This role has no knowledge-base search' in workspace.system_blocks(ws_for(TECH))[1]['text']


def test_field_site_brief_is_short(sb):
    """PH-3: a field role is fed at most three things to bring and two offers."""
    text, err, _, _ = run('site_brief', {'address': FLAGSHIP, 'issue': 'no heat'}, ws_for(TECH))
    bring = next(l for l in text.split('\n') if l.startswith('BRING: '))
    offer = next(l for l in text.split('\n') if l.startswith('OFFER '))
    assert not err and bring.count(';') <= 2 and offer.split(': ', 1)[1].count('; ') <= 1


def test_pnl_has_gross_margin_and_plan_ebitda(real):
    """D3 and copy-5: P&L views and search lines carry gross margin and plan EBITDA; on plan means within the home view's tolerance."""
    text, err, _, _ = run('company_numbers', {'view': 'pnl', 'company': 'pp'}, ws_for('bsp-senior-associate'))
    assert not err and '| Gross margin |' in text and '| EBITDA plan |' in text
    oct_row = next(l for l in text.split('\n') if l.startswith('Oct 2026 |'))
    assert '| 49.5% |' in oct_row and '| 300 |' in oct_row, oct_row
    assert 'gross margin 49.1%' in text and 'against plan $2.8M' in text
    assert 'On plan means within 1% of plan, the rule the home view uses' in text
    text, err, _, _ = run('company_numbers', {'view': 'pnl', 'company': 'portfolio'}, ws_for('bsp-managing-partner'))
    pp = next(l for l in text.split('\n') if l.startswith('- Punctual Pros:'))
    assert '(-0.2%, on plan)' in pp and 'gross margin 49.5%' in pp and 'plan EBITDA $300,000 (+5.0%, above plan)' in pp
    fl = next(l for l in text.split('\n') if l.startswith('- Frontline:'))
    assert '(-4.2%, below plan)' in fl
    text, err, _, _ = run('workspace_search', {'app': 'financials', 'set': 'pnl', 'limit': 1}, ws_for('pp-cfo'))
    assert not err and 'gross margin 49.5%' in text and 'plan EBITDA $300,000 (+5.0%, above plan)' in text
    assert workspace._vs_plan(99.2, 100) == '-0.8%, on plan' and workspace._vs_plan(98.9, 100) == '-1.1%, below plan'


def test_seasoned_counts_stay_whole(real):
    """D7: a season-scaled count target is a whole number ("3,063 jobs", never "3,062.5 jobs")."""
    text, err, _, _ = run('company_numbers', {'view': 'kpis', 'company': 'pp', 'months': 2}, ws_for('bsp-senior-associate'))
    jobs = next(l for l in text.split('\n') if l.startswith('- Jobs completed'))
    assert not err and 'target 3,063 jobs' in jobs and not re.search(r'\d\.\d jobs', text), jobs
    rows = [workspace._seasoned('financials', 'kpis', r) for r in workspace.load('pp')['apps']['financials']['kpis'] if r.get('seasonal')]
    assert all(isinstance(r['value'], int) and isinstance(r['target'], int) for r in rows if r.get('unit') == 'jobs')
    assert any(isinstance(r['value'], float) for r in rows if r.get('unit') == 'k$')   # money keeps its precision


def test_source_titles_name_the_record(real):
    """D8 and ACC-7: Shopify returns and daily sales say which record; the fund source is "BSP Fund I", never "BSP the fund"."""
    ws = ws_for('fh-ecommerce-manager')
    _, err, _, s = run('workspace_search', {'app': 'shopify', 'set': 'returns', 'limit': 20}, ws)
    titles = [it['title'] for it in s.items]
    assert not err and titles and all(t.startswith('Returns: ') and len(t) > len('Returns: ') for t in titles), titles
    text, err, _, _ = run('open_record', {'ref': 1}, ws, s)
    assert not err and 'Title:' not in text and len(text.split('\n')) == len(set(text.split('\n')))
    _, _, _, s = run('workspace_search', {'app': 'shopify', 'set': 'daily', 'limit': 3}, ws)
    assert all(re.fullmatch(r'Daily sales: [A-Z][a-z]{2} \d{1,2}', it['title']) or it['title'].startswith('Daily') for it in s.items)
    if 'fund' in ((workspace.role('bsp-investor-relations').get('numbers') or {}).get('views') or ()):
        text, err, _, s = run('company_numbers', {'view': 'fund'}, ws_for('bsp-investor-relations'))
        assert not err and 'the fund' not in s.items[0]['title'] and s.items[0]['title'].startswith('BSP ')


def test_drafts_never_attach_to_another_customers_job(sb):
    """ACC-1: at an address that is none of the person's jobs, a job draft asks for the job number instead of using the next job."""
    for addr in ('800 Florida Ave, York PA 17404', '12 Nowhere Rd, Lititz, PA 17543'):
        ws = ws_for(TECH, job={'address': addr, 'issue': 'no heat'})
        for action in ('text_customer', 'log_findings', 'order_part', 'add_recommendation', 'book_job'):
            if action not in workspace.role(TECH)['actions']:
                continue
            text, err, cards, _ = run('draft_action', {'action': action, 'body': 'Back tomorrow at 9 with the part.', 'item': 'Ignitor'}, ws)
            assert err and not cards and 'job number' in text and 'L-2187' not in text, (addr, action, text)
    # with no address the next job is used, and the result names the job it attached to
    text, err, cards, _ = run('draft_action', {'action': 'log_findings', 'body': 'Cracked heat exchanger.'}, ws_for(TECH))
    assert not err and '(job L-2187, 418 Wexcombe Ln)' in text and cards[0]['fields'][0]['value'].startswith('L-2187')
    text, err, cards, _ = run('draft_action', {'action': 'text_customer', 'number': 'L-2187', 'body': 'On my way.'},
                              ws_for(TECH, job={'address': '800 Florida Ave, York PA 17404', 'issue': ''}))
    assert not err and cards   # a job number given outright still works


def test_named_state_outside_the_area(sb):
    """ACC-3 and ADDR-1: a state the area does not reach is outside without a ZIP; full state names parse."""
    assert workspace.area_of(None, 'Burlington', 'VT')['status'] == 'out'
    assert workspace.area_of(None, 'Nowhereville', 'PA')['status'] == 'unknown'
    assert workspace.area_of(None, 'Nowhereville')['status'] == 'unknown'
    for a, town, st in (('12 Elm St, Burlington, Vermont', 'Burlington', 'VT'), ('12 Elm St in Burlington, Vermont', 'Burlington', 'VT'),
                        ('12 Elm St Burlington Vermont', 'Burlington', 'VT'), ('45 Oak St, Staten Island, New York', 'Staten Island', 'NY'),
                        ('12 Main St, Washington, PA', 'Washington', 'PA'), ('12 Main St, Washington', 'Washington', None),
                        ('12 Main St, Fort Washington', 'Fort Washington', None), ('12 Elm St, Seattle, Washington', 'Seattle', 'WA'),
                        ('9 Pine Rd, Charleston, West Virginia 25301', 'Charleston', 'WV')):
        p = workspace.parse_address(a)
        assert (p['town'], p['state'], p['line']) == (town, st, a.split(',')[0].split(' in ')[0].replace(' Burlington Vermont', '')), (a, p)
    ws = ws_for(TECH)
    for a in ('12 Elm St, Burlington, Vermont', '12 Elm St, Burlington, VT', '12 Elm St Burlington Vermont', '12 Elm St, Brooklyn, NY'):
        text, err, cards, _ = run('site_brief', {'address': a, 'issue': 'no heat'}, ws)
        assert text.startswith('SERVICE AREA: outside (') and 'no ZIP is needed' in text and 'Refer to dispatch.' in text and not cards, (a, text)
        assert '(outside)' not in text
    text, _, _, _ = run('site_brief', {'address': '12 Elm St, Burlington, VT'}, ws)
    assert text.startswith('SERVICE AREA: outside (Burlington, VT).')
    text, _, cards, _ = run('site_brief', {'address': '12 Main St, Washington'}, ws)
    assert text.startswith('SERVICE AREA: unknown') and not cards   # a town that is also a state name, alone: ask, never "outside"


def test_address_without_a_house_number(sb):
    """ADDR-5: a ZIP or a route number is never read as the house number."""
    for a in ('Fruitville Pike, Lancaster PA 17601', 'Fruitville Pike Lancaster PA 17601', 'Heading to a house on Fruitville Pike, Lancaster PA 17601'):
        p = workspace.parse_address(a)
        assert (p['line'], p['house_no'], p['town'], p['state'], p['zip']) == ('Fruitville Pike', '', 'Lancaster', 'PA', '17601'), (a, p)
    p = workspace.parse_address('Route 30, Lancaster, PA 17601')
    assert (p['line'], p['house_no'], p['zip']) == ('Route 30', '', '17601')
    p = workspace.parse_address('418 2nd St, York, PA 17401')
    assert (p['house_no'], p['town'], p['zip']) == ('418', 'York', '17401')
    p = workspace.parse_address('Fruitville Pike, Lancaster PA 17601 customer says no heat')
    assert (p['town'], p['zip'], p['house_no']) == ('Lancaster', '17601', '')
    text, err, cards, _ = run('site_brief', {'address': 'Fruitville Pike, Lancaster PA 17601', 'issue': 'no heat'}, ws_for(TECH))
    assert not err and 'SERVICE AREA: inside (Lancaster County' in text and cards and 'MATCHED' not in text


def test_issue_fallback_for_heating_words(sb):
    """ACC-4: heating or water-heater words the patterns miss still pick the heating issue, never "not sure"."""
    assert workspace._pick_issue('the furnace is acting up')['id'] == 'no_heat'
    assert workspace._pick_issue('heating is weird today')['id'] == 'no_heat'
    assert workspace._pick_issue('something with the water heater')['id'] in ('no_hot_water', 'wh_leak')
    assert workspace._pick_issue('it smells odd')['id'] == 'unknown'


def test_furnace_phrases_pick_no_heat(real):
    for t in ('furnace not igniting', "furnace won't ignite", 'furnace not working', 'furnace keeps shutting off'):
        assert workspace._pick_issue(t)['id'] == 'no_heat', t
        text, _, cards, _ = run('site_brief', {'address': FLAGSHIP, 'issue': t}, ws_for(TECH))
        assert cards[0]['focus'][:2] == ['furnace', 'gas_shutoff'], (t, cards[0]['focus'])


def test_heat_type_follows_the_house_and_the_words(real):
    """ADDR-4 and ADDR-6: a heat-pump house gets heat-pump causes, parts and offers; "radiators are cold" means a boiler."""
    ws = ws_for(TECH)
    text, err, cards, _ = run('site_brief', {'address': '221 Arch St, Ephrata PA 17522', 'issue': 'no heat'}, ws)
    assert not err and cards
    kinds = {i['kind'] for i in card_items(cards[0])}
    assert 'heat_pump' in kinds and 'furnace' not in kinds and 'gas_meter' not in kinds
    bring = next(l for l in text.split('\n') if l.startswith('BRING: ')).lower()
    assert 'ignitor' not in bring and 'defrost' in bring and 'If you smell gas' not in text and 'Heat pump repair' in text
    assert 'ISSUE: no heat' in text and 'the heat is likely a heat pump (likely)' in text
    text, err, cards, _ = run('site_brief', {'address': '317 E College Ave, York PA 17403', 'issue': 'no heat and the radiators are cold'}, ws)
    kinds = {i['kind'] for i in card_items(cards[0])}
    assert 'boiler' in kinds and 'furnace' not in kinds and cards[0]['focus'][0] == 'boiler'
    bring = next(l for l in text.split('\n') if l.startswith('BRING: ')).lower()
    assert 'circulator' in bring and 'ignitor' not in bring and 'Boiler service' in text
    assert "the customer's words point to a boiler (likely)" in text and '- Boiler switch:' in text and 'Furnace switch' not in text
    assert any(i['label'] == 'Boiler switch' for i in card_items(cards[0]) if i['kind'] == 'service_switch')
    # the flagship furnace house is unchanged
    text, _, cards, _ = run('site_brief', {'address': FLAGSHIP, 'issue': 'no heat'}, ws)
    assert cards[0]['focus'][0] == 'furnace' and 'ignitor' in text.lower()


def test_likely_gas_meter_on_the_recorded_side(real):
    """PH-4: a likely gas meter sits outside the wall where the recorded gas line enters."""
    text, err, cards, _ = run('site_brief', {'address': '27 Brindlemoor Ct, Red Lion, PA 17356', 'issue': 'water heater leaking'},
                              ws_for('pp-plumber'))
    meter = next(o for o in cards[0]['outside'] if o['kind'] == 'gas_meter')
    assert not err and meter['side'] == 'left' and meter['basis'] == 'likely'
    assert '- Gas meter: outside on the left side wall, where the recorded gas line enters (likely; confirm on site)' in text


def test_house_style_and_assessor_reading_stay_likely(sb, monkeypatch):
    """ADDR-3: an inferred reading of the assessor's shorthand is never "(public record)"; no house style is stated as fact."""
    def f(k, v):
        return {'k': k, 'label': k, 'v': v, 'basis': 'public', 'src': 'nj_parcels', 'as_of': '2026-06-04'}
    live = {'status': 'found', 'precision': 'parcel', 'label': '120 Newington Ln, Toms River, NJ 08755', 'line': '120 Newington Lane',
            'point': [-74.2, 39.97], 'record': None, 'parcel': None, 'building': None, 'outbuildings': [], 'permits': [], 'geocode': None,
            'town_place': None, 'choose': [], 'degraded': [],
            'facts': [f('year_built', 2001), f('living_area_sqft', 3680), f('building_desc', '2F2G 3634')]}
    monkeypatch.setattr(workspace.site_module(), 'lookup', lambda *a, **k: live)   # the public ladder, as server/site.py returns it
    text, err, cards, _ = run('site_brief', {'address': '120 Newington Lane, Toms River NJ 08755', 'issue': 'water heater leaking'},
                              ws_for(TECH))
    house = next(l for l in text.split('\n') if l.startswith('HOUSE: '))
    assert not err and 'assessor shorthand "2F2G 3634" (public record), likely meaning 2 stories, frame, 2-car garage (likely)' in house
    assert 'garage (public record)' not in house and 'reads 2 stories' not in house
    assert 'style not on public record; a house of that age here is often a' in house and '(likely; confirm on site)' in house
    assert cards[0]['source_line'] == ('Source: public property records where shown; layout is a rule of thumb for houses built around 2001 in '
                                       'Ocean County.')


@pytest.mark.skipif(not os.path.exists(HOMES_DB), reason='server/knowledge/homes.sqlite is not present')
def test_postal_town_keeps_public_year_built(sb):
    """ADDR-2: a postal town that is a different municipality (Camp Hill vs Lower Allen Township) still finds the public record."""
    if not homes.ready():
        pytest.skip('homes database not readable')
    con = sqlite3.connect(f'file:{HOMES_DB}?mode=ro', uri=True)
    row = con.execute("select s.year_built from sales s join munis m on m.id=s.muni_id where s.addr='112 OLD MILL DRIVE' and s.zip='17011' "
                      "and m.muni='LOWER ALLEN TOWNSHIP'").fetchone()
    con.close()
    if not row or not row[0]:
        pytest.skip('the Camp Hill example is not in this homes database')
    text, _ = homes.run_property_brief({'address': '112 Old Mill Dr', 'municipality': 'Camp Hill', 'state': 'PA', 'zip': '17011'})
    assert f'Year built: {row[0]}' in text and 'is the postal town; the house is recorded in LOWER ALLEN TOWNSHIP, ZIP 17011.' in text
    text, err, _, _ = run('site_brief', {'address': '112 Old Mill Dr, Camp Hill PA 17011', 'issue': 'furnace makes a loud bang'}, ws_for(TECH))
    assert not err and f'Year built: {row[0]} (public record' in text and 'not on public record here' not in text


def test_you_is_only_the_readers_own_persona(sb):
    """copy-2: another role sees the technician persona by its role, never as "You"."""
    gm = ws_for('pp-location-gm')
    text, err, _, _ = run('open_record', {'number': 'L-2187'}, gm)
    assert not err and 'Technician: HVAC technician' in text and 'You' not in text
    text, err, _, _ = run('workspace_search', {'app': 'servicetitan', 'set': 'technicians', 'limit': 20}, gm)
    assert not err and '] You ·' not in text
    text, _, _, _ = run('open_record', {'number': 'L-2187'}, ws_for(TECH))
    assert 'Technician: You' in text
    _, err, cards, _ = run('draft_action', {'action': 'book_job', 'number': 'L-2187', 'body': 'Ignitor swap'}, ws_for('pp-dispatcher'))
    if not err:
        assert next(f['value'] for f in cards[0]['fields'] if f['label'] == 'Technician') != 'You'
    workspace._READER.set(None)
    assert workspace.who({'name': 'You', 'role': 'HVAC technician'}) == 'You'   # no reader set: unchanged
    tok_ = workspace._READER.set('pp-location-gm')
    try:
        assert workspace.who({'name': 'You', 'role': 'HVAC technician'}) == 'the HVAC technician'
        assert workspace.who({'name': 'You', 'role': 'Location general manager'}) == 'You'
    finally:
        workspace._READER.reset(tok_)


def test_technician_titles_follow_the_reader(sb):
    """copy-2: a manager's source titles and full records name the technician persona by its role, never as "You"."""
    gm = ws_for('pp-location-gm')
    text, err, _, s = run('workspace_search', {'app': 'servicetitan', 'set': 'technicians', 'limit': 20}, gm)
    if err or 'HVAC technician' not in text:
        pytest.skip('this sandbox lists no technician the manager can see')
    assert not any('Technicians: You' in str(x) for x in s.__dict__.values())
    assert 'Technicians: You' not in text and 'Name: You' not in text


def test_gas_and_co_outrank_a_heating_complaint(sb):
    """A gas smell or a CO alarm reported along with a heating complaint is still a gas or CO call (safety first)."""
    ids = {i.get('id') for i in workspace.load('issues').get('issues') or []}
    if not {'gas_smell', 'co_alarm', 'no_heat'} <= ids:
        pytest.skip('this sandbox has no gas, CO or no-heat issue')
    assert workspace._text_issue('furnace not igniting and I smell gas')['id'] == 'gas_smell'
    assert workspace._pick_issue('furnace not working, co alarm going off', 'no_heat')['id'] == 'co_alarm'
    assert workspace._pick_issue('radiators cold and I smell gas', 'boiler')['id'] == 'gas_smell'
    assert workspace._pick_issue('no heat', 'no_heat')['id'] == 'no_heat'


def test_house_numbers_stay_whole(sb):
    """Rear and split house numbers keep their real number; a house number after "in" is not taken for a ZIP; LA is Lane."""
    for text, key, hn in (('418 1/2 Main St, Lititz PA 17543', '418 1/2 MAIN ST', '418'),
                          ('123-125 Main St, Lancaster PA', '123-125 MAIN ST', '123'),
                          ('Job in 11050 Susquehanna Trail, Glen Rock PA 17327', None, '11050')):
        p = workspace.parse_address(text)
        assert p['house_no'] == hn and (key is None or p['key'] == key), (text, p)
    p = workspace.parse_address('25 Orchard LA Lititz PA')
    assert p['state'] == 'PA' and (p['town'] or '').lower() == 'lititz', p
    assert workspace.parse_address('25 ORCHARD LA LITITZ')['state'] is None


def test_founder_owned_is_not_a_leadership_question():
    """'founder-owned businesses' is about acquisition targets: no BSP leadership hint, no team-page pin. 'Who founded BSP?' keeps both."""
    import app
    q = 'Website research on founder-owned businesses'
    assert app.retrieval_query('portal', q) == q and not [u for rx, u in app.PINNED if rx.search(q)]
    assert app.retrieval_query('portal', 'founder-led HVAC companies') == 'founder-led HVAC companies'
    assert 'CEO chief executive' in app.retrieval_query('portal', 'Who are the founders of the firm?')
    assert [u for rx, u in app.PINNED if rx.search('Who founded BSP?')]


# ---------------------------------------------------------------- wave 3: sink calls, room rules, flagship houses, signatures

OWNER_SINK = 'going to 418 Wexcombe Ln, Lititz for a sink repair, give me the floor plans, view'


def test_sink_and_faucet_calls_focus_the_fixture_shutoffs(real):
    """'sink repair', 'kitchen sink leaking' and 'faucet dripping' (and the owner's own sentence) resolve to the new issues, whose focus
    starts with the sink's own shutoffs; drain words and a burst pipe keep their old issues."""
    for text, want in ((OWNER_SINK, 'sink_leak'), ('sink repair', 'sink_leak'), ('kitchen sink leaking', 'sink_leak'),
                       ('faucet dripping', 'faucet'), ("sink won't drain", 'drain_clog'), ('clogged kitchen sink', 'drain_clog'),
                       ('the pipe under the sink burst', 'frozen_pipe')):
        i = workspace._pick_issue(text)
        assert i['id'] == want, (text, i['id'])
        if want in ('sink_leak', 'faucet'):
            assert i['focus'][0] == 'fixture_shutoffs' and 'main_water' in i['focus'] and i['trades'] == ['plumbing'] and i['safety'] == ['water']
    codes = {p['code'] for p in workspace.load('pp_servicetitan')['pricebook']}
    for i in workspace.load('issues')['issues']:
        assert set(i['offers']) <= codes, i['id']


def _inside(box, pt):
    return box['x'] <= pt[0] <= box['x'] + box['w'] and box['y'] <= pt[1] <= box['y'] + box['h']


def test_room_and_wet_wall_rules_are_likely_and_hold_the_spots(real):
    """likely_rules rooms and wet_wall: labelled likely with low confidence; every layout's first-floor kitchen holds the kitchen and
    sink spots and its bath holds the bath spot; every select row names a layout; every wet wall names rooms on its floor."""
    rules = workspace.load('likely_rules')
    spots = rules['spots']
    assert {'riser', 'kitchen-sink', 'entry-left', 'entry-right'} <= set(spots)
    rooms, wet = rules['rooms'], rules['wet_wall']
    assert rooms['basis'] == wet['basis'] == 'likely' and rooms['confidence'] == wet['confidence'] == 'low'
    assert 'confirm on site' in rooms['note'] and 'clear' not in rooms['note'].lower()
    for lid, lay in rooms['layouts'].items():
        first = lay['floors']['first']
        kit = [b for b in first if b['name'] == 'Kitchen']
        bath = [b for b in first if 'bath' in b['name'].lower()]
        assert len(kit) == 1 and _inside(kit[0], spots['kitchen']) and _inside(kit[0], spots['kitchen-sink']), lid
        assert len(bath) == 1 and _inside(bath[0], spots['bath']), lid
        assert wet['by_layout'][lid], lid
        for w in wet['by_layout'][lid]:
            assert set(w['rooms']) <= {b['name'] for b in lay['floors'][w['floor']]}, (lid, w)
    assert all(r['layout'] in rooms['layouts'] for r in rooms['select']) and rooms['select'][-1] == {'layout': 'ranch'}
    assert all(r['kind'] == 'power' and r['needs'] == ['panel'] and all(v in spots for v in r['via']) for r in rules['power_runs'].values())
    assert rules['heights']['basis'] == 'likely' and rules['heights']['unit'] == 'in'


def test_flagship_houses_rooms_and_wires(real):
    """pp_houses.json: only the two flagship customers. Rooms are records from a prior visit sketch; every wire run is a record that
    reaches the recorded panel; the first-floor riser lines stay likely; 418 Wexcombe Ln has no wiring on record by the kitchen."""
    houses = workspace.load('pp_houses')['houses']
    assert sorted(houses) == ['st-cus-0001', 'st-cus-0002']
    st = workspace.load('pp_servicetitan')
    for cid, h in houses.items():
        cust = next(c for c in st['customers'] if c['id'] == cid)
        panel = next(e for e in st['equipment'] if e['customer'] == cid and e['kind'] == 'panel')
        assert h['for'] == cust['for'] and h['team'] == cust['team'] and h['address'].startswith(cust['address']['line'])
        assert {r['floor'] for r in h['rooms']} == {'first', 'second'} and all(r['basis'] == 'record' for r in h['rooms'])
        assert all(r['src'] == 'Prior visit sketch' for r in h['rooms'])
        kit = next(r for r in h['rooms'] if r['floor'] == 'first' and r['name'] == 'Kitchen')
        assert _inside(kit, workspace.load('likely_rules')['spots']['kitchen-sink'])
        for run in h['runs']:
            if run['kind'] == 'power':
                assert run['basis'] == 'record' and panel['spot'] in run['via'] and run['floor'] == panel['floor']
            if run['floor'] == 'first':
                assert run['basis'] == 'likely' and run['rise'] == {'from': 'basement', 'to': 'first', 'at': 'riser'}
        assert all(w['basis'] == 'likely' for w in h['wet_wall'])
    assert [r['label'] for r in houses['st-cus-0001']['runs'] if r['kind'] == 'power'] == ['Service line']
    assert houses['st-cus-0002']['split_level'] is True and houses['st-cus-0001']['split_level'] is False


SIG_VIEWS = {'floor_plan', 'house_model', 'globe_tour', 'scorecard', 'bridge', 'heatmap', 'pipeline_board', 'ranked_bars'}


def test_every_role_has_one_signature(real):
    """Catalogue and roles.json: each of the 44 roles has one signature {question, view, source, draft, data}: a question of 12 words
    at most, one of the eight pictures, live or records, a draft from the role's own actions, and data it can read or a site file."""
    if not os.path.exists(CATALOG):
        pytest.skip('data/agent/catalog.json has not been generated yet')
    cat = json.load(open(CATALOG, encoding='utf-8'))
    assert len(cat['roles']) == 44
    for c in cat['roles']:
        s = c['signature']
        R = workspace.role(c['id'])
        assert R['signature'] == s, c['id']
        assert {'question', 'view', 'source', 'draft', 'data'} <= set(s) and len(s['question'].split()) <= 12, c['id']
        assert s['view'] in SIG_VIEWS and s['source'] in ('live', 'records'), c['id']
        assert s['draft']['action'] in R['actions'] and len(s['draft']['title'].split()) <= 15, c['id']
        for ref in s['data']:
            if s['source'] == 'live':
                assert ref.startswith('data/') and os.path.exists(os.path.join(ROOT, ref.split('#')[0])), (c['id'], ref)
            else:
                app, set_ = ref.split('.')
                assert set_ in R['apps'].get(app, {}), (c['id'], ref)
    by = {c['id']: c['signature'] for c in cat['roles']}
    assert by['bsp-managing-partner'] == {'question': 'Point out the best 3 acquisition targets.', 'view': 'globe_tour', 'source': 'live',
                                          'draft': {'action': 'chat_post', 'title': 'Post the three targets to the partners channel'},
                                          'data': ['data/research/globe_tours.json#best3']}
    assert (by['pp-plumber']['view'], by['pp-plumber']['address']) == ('floor_plan', '27 Brindlemoor Ct, Red Lion, PA 17356')
    assert (by['pp-hvac-technician']['view'], by['pp-hvac-technician']['address']) == ('house_model', FLAGSHIP)
    assert by['pp-dispatcher']['view'] == 'floor_plan' and by['pp-dispatcher']['draft']['action'] == 'book_job'
