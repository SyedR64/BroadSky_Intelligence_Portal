"""
Tests for server/site.py (the live site brief) and its join in server/workspace.py.

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q tests/test_site.py

The network is stubbed: property._get_json is replaced by a replayer that answers from the recorded public-building fixtures in
tests/fixtures/site/ (lane S1), and any request that was not recorded fails as a dropped connection would. No test reaches a server
and none calls a model.
"""

import datetime
import json
import os
import re
import subprocess
import sys
import time

import httpx
import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(SERVER_DIR, 'tests', 'fixtures', 'site')
sys.path.insert(0, SERVER_DIR)

import property as homes          # noqa: E402  (never a bare "import property")
import site_sources as sources    # noqa: E402
import workspace                  # noqa: E402

SITE = workspace.site_module()    # server/site.py, loaded by path ("import site" is Python's own module)
SANDBOX_REAL = os.path.join(SERVER_DIR, 'sandbox')
TODAY = datetime.date(2026, 11, 17)
OWNER = 'going to 418 Wexcombe Ln, Lititz for a sink repair, give me the floor plans, view'
TECH, PLUMBER, DISPATCH = 'pp-hvac-technician', 'pp-plumber', 'pp-dispatcher'
FOUND = ['nj_full', 'pa_york_full', 'pa_franklin_full', 'pa_lancaster_outline_only']


def load(name):
    with open(os.path.join(FIX, name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def norm(params):
    return json.dumps({k: str(v) for k, v in params.items()}, sort_keys=True)


class Replay:
    """Stands in for property._get_json: answers from recorded calls; anything else fails like a dropped connection."""

    def __init__(self, calls, delay=0.0):
        self.calls, self.seen, self.missed, self.delay = calls, [], [], delay

    def __call__(self, url, params, timeout=None):
        self.seen.append((url, dict(params), timeout))
        if self.delay:
            time.sleep(self.delay)
        for c in self.calls:
            if c['url'] == url and norm(c['params']) == norm(params):
                return json.loads(json.dumps(c['response']))
        self.missed.append(url)
        raise httpx.ConnectError('not recorded')


@pytest.fixture
def env(monkeypatch):
    """The generated sandbox, a fixed date, live calls on (through the replayer), the local sales table answering nothing."""
    if os.path.exists(os.path.join(SANDBOX_REAL, 'roles.json')):
        monkeypatch.delenv('WORKSPACE_SANDBOX_DIR', raising=False)
    else:
        monkeypatch.setenv('WORKSPACE_SANDBOX_DIR', os.path.join(SERVER_DIR, 'tests', 'fixtures', 'sandbox_min'))
    workspace.reset()
    SITE.reset()
    monkeypatch.setattr(workspace, 'today', lambda: TODAY)
    monkeypatch.setattr(sources, '_today', lambda: datetime.date(2026, 11, 23))
    monkeypatch.setattr(homes, 'LIVE_ON', True)
    monkeypatch.setattr(homes, 'lookup_record', lambda a: {'status': 'not_found', 'record': None, 'choose': [], 'match': ''})
    state = {}

    def use(calls, delay=0.0):
        rp = Replay(calls, delay)
        monkeypatch.setattr(homes, '_get_json', rp)
        SITE.reset()
        state['rp'] = rp
        return rp
    use([])
    yield use
    SITE.reset()
    workspace.reset()


def fx_brief(use, name, role=PLUMBER, connected=(), issue='sink repair'):
    fx = load(name)
    rp = use(fx['calls'])
    return SITE.brief(f"{fx['typed']} for a {issue}", role, list(connected) if connected is not None else None), rp


def card_of(res, kind='floor_sketch'):
    return next((c for c in res['cards'] if c.get('kind') == kind), None)


def walk(o, path=''):
    if isinstance(o, dict):
        yield path, o
        for k, v in o.items():
            yield from walk(v, f'{path}.{k}')
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk(v, f'{path}[{i}]')


def sentences(t):
    return [s for s in re.split(r'(?<=[.!?])\s+', t.strip()) if s]


# ---------------------------------------------------------------- the owner's sentence: the two defects

def test_owner_sentence_parses_to_street_and_town(env):
    p = workspace.parse_address(OWNER)
    assert (p['line'], p['town']) == ('418 Wexcombe Ln', 'Lititz')
    assert workspace.area_of(p['zip'], p['town'], p['state'])['status'] == 'in'
    assert workspace.route(OWNER, workspace.clean({'role': PLUMBER, 'connected': []})) == 'site_brief'
    for text, town in (('418 Wexcombe Ln Lititz for a sink repair', 'Lititz'), ('12 Elm St, Hanover with a leak', 'Hanover'),
                       ('12 Main St, East Petersburg, PA 17520 for a drywall job', 'East Petersburg'),
                       ('12 Elm St, Lititz, please show me the wires', 'Lititz')):
        assert workspace.parse_address(text)['town'] == town, text
    assert workspace.parse_address('12 Elm St, for a sink repair, view')['town'] is None   # the request began before any town


def test_sink_words_reach_the_new_job_types(env):
    for text, want in (('sink repair', 'sink_leak'), ('kitchen sink leaking', 'sink_leak'), ('faucet dripping', 'faucet'), (OWNER, 'sink_leak')):
        issue = workspace._pick_issue(text)
        assert issue['id'] == want, text
        assert issue['focus'][0] == 'fixture_shutoffs' and issue['trade'] == 'plumbing' if 'trade' in issue else issue['focus'][0] == 'fixture_shutoffs'
    assert workspace._pick_issue("sink won't drain")['id'] == 'drain_clog'


# ---------------------------------------------------------------- the ladder and its precision

@pytest.mark.parametrize('name', FOUND)
def test_a_found_public_building_is_placed_at_the_parcel(env, name):
    res, rp = fx_brief(env, name)
    assert res['status'] == 'found' and res['precision'] == 'parcel', res['text']
    fs, mc = card_of(res), card_of(res, 'map_command')
    assert [c['kind'] for c in res['cards']] == ['floor_sketch', 'map_command']
    assert fs['place']['precision'] == 'parcel' and fs['place']['basis'] == 'public' and fs['example'] is False
    b = fs['building']
    assert b['footprint']['basis'] == 'public' and 3 <= len(b['footprint']['ring_m']) <= 48 and b['footprint']['as_of']
    assert b['parcel']['basis'] == 'public' and len(b['parcel']['ring_m']) <= 40
    assert (b['front']['bearing_deg'] - b['footprint']['rot_deg']) % 360 == pytest.approx(180, abs=1)   # the 3D view's convention
    steps = mc['cmd']['steps']
    assert steps[0]['precision'] == 'town' and steps[-1]['kind'] == 'site' and steps[-1]['precision'] == 'parcel'
    assert all(s['zoom'] <= SITE.CEIL[s['precision']] for s in steps) and steps[-1]['zoom'] == 18.5
    assert steps[-1]['label'] == ', '.join(load(name)['typed'].split(', ')[:2]) and len(steps[-1]['outline']) <= 48
    assert all(t == 2.5 for _, _, t in rp.seen)   # each call has its own short timeout
    assert len(json.dumps(b)) < 6000


def test_nj_parcel_brings_permits_and_assessor_facts(env):
    res, _ = fx_brief(env, 'nj_full')
    fs = card_of(res)
    ks = {f['k'] for f in fs['facts']}
    assert {'stories', 'floor_area_sqft', 'building_desc', 'ground_elevation_m'} <= ks
    assert fs['permits'] and all(p['basis'] == 'public' for p in fs['permits'])
    assert fs['building']['storeys'] == {**fs['building']['storeys'], 'n': 2, 'basis': 'public'}
    assert all(isinstance(f['src'], int) and 1 <= f['src'] <= len(res['sources']) for f in fs['facts'])


def test_lancaster_has_an_outline_and_no_building_record(env):
    res, _ = fx_brief(env, 'pa_lancaster_outline_only')
    fs = card_of(res)
    assert 'No public building record.' in res['text'] and 'Outline from imagery dated Aug 2010.' in res['text']
    assert fs['house']['year_basis'] == 'likely' and fs['building']['storeys']['basis'] == 'likely'
    assert fs['building']['height']['basis'] == 'likely'


def test_town_only_draws_no_building(env):
    res, _ = fx_brief(env, 'town_only')
    assert res['status'] == 'not_found' and res['precision'] == 'town'
    assert [c['kind'] for c in res['cards']] == ['map_command']
    steps = card_of(res, 'map_command')['cmd']['steps']
    assert [s['precision'] for s in steps] == ['town'] and steps[0]['zoom'] == 12.5
    assert res['text'].startswith('Found Lititz, PA, not the house.')


def test_several_lots_ask_which_one_with_street_labels_only(env):
    res, _ = fx_brief(env, 'choose')
    assert res['status'] == 'choose' and 2 <= len(res['choices']) <= 6
    assert all(re.fullmatch(r'p-[0-9a-f]{10}', c['key']) for c in res['choices'])
    assert all(c['label'].startswith('200 Georgia Rd') and not re.search(r'block|\d+/\d+', c['label'], re.I) for c in res['choices'])
    assert len({c['label'] for c in res['choices']}) == len(res['choices'])
    steps = card_of(res, 'map_command')['cmd']['steps']
    assert all(s['zoom'] <= SITE.CEIL[s['precision']] for s in steps) and not any(s['precision'] == 'parcel' for s in steps)
    pick = res['choices'][1]['key']
    one = SITE.brief(load('choose')['typed'], PLUMBER, [], pick=pick)
    assert one['status'] == 'found' and one['precision'] == 'parcel'


def test_census_only_is_typed_precision(env, monkeypatch):
    fx = load('nj_full')
    env([c for c in fx['calls'] if 'Parcels_Composite' not in c['url']])   # the parcel layer is down
    res = SITE.brief(fx['typed'], PLUMBER, [])
    assert res['status'] == 'found' and res['precision'] == 'typed' and 'parcel' in res['degraded']
    step = card_of(res, 'map_command')['cmd']['steps'][-1]
    assert step['precision'] == 'typed' and step['zoom'] == 16.5 and 'parcel not matched' in step['sub']
    assert 'The parcel is not matched.' in res['text'] or 'street level' in res['text']


def test_census_point_then_the_parcel_near_it_upgrades_to_parcel(env, monkeypatch):
    fx = load('nj_full')
    parcel = fx['adapters']['parcels']['parcels'][0]
    env(fx['calls'])
    monkeypatch.setattr(sources, 'nj_parcels', lambda *a, **k: {'ok': True, 'src': 'nj_parcels', 'parcels': []})
    seen = []

    def near(key, lat, lon, distance_m=60):
        seen.append((key, round(lat, 4), round(lon, 4)))
        return {'ok': True, 'src': 'nj_parcels', 'parcels': [dict(parcel, match='exact')]}
    monkeypatch.setattr(sources, 'nj_parcels_near', near)
    res = SITE.brief(fx['typed'], PLUMBER, [])
    assert seen == [('33 WASHINGTON ST', 39.9528, -74.1958)]
    assert res['status'] == 'found' and res['precision'] == 'parcel' and card_of(res)['building']['footprint']


def test_a_sales_row_alone_places_the_parcel(env, monkeypatch):
    monkeypatch.setattr(homes, 'LIVE_ON', False)
    rec = {'key': 'rec-0123456789', 'addr': '12 TESTCASE AVE', 'addr_key': '12 TESTCASE AVE', 'unit': None, 'muni': 'LITITZ BORO',
           'county': 'Lancaster', 'state': 'PA', 'zip': '17543', 'lat': 40.157, 'lon': -76.307, 'year_built': 1973, 'sqft': 1840, 'beds': 3,
           'use_type': 'residential', 'parcel': {'county_pin': '500-1'}, 'last_sale_date': '2026-05-01', 'sales_held': 1,
           'source': {'title': 'Lancaster County, Pennsylvania: recorded property sales', 'publisher': 'Lancaster County, Pennsylvania',
                      'url': 'https://example.gov/s', 'date': '2026-11-13'}}
    monkeypatch.setattr(homes, 'lookup_record', lambda a: {'status': 'found', 'record': rec, 'choose': [], 'match': 'exact'})
    res = SITE.brief('12 Testcase Ave, Lititz, PA 17543, sink repair', PLUMBER, [])
    assert res['status'] == 'found' and res['precision'] == 'parcel'
    fs = card_of(res)
    assert fs['house']['year'] == 1973 and fs['house']['year_basis'] == 'public' and 'Built 1973, 1,840 sq ft (public record).' in res['text']
    assert 'building' not in fs and fs['layout']['from'] == 'rules'            # no outline: the rule layout, all likely
    assert any(r['label'] == 'Kitchen' for f in fs['floors'] for r in f['rooms'])
    assert card_of(res, 'map_command')['cmd']['steps'][-1]['precision'] == 'parcel'
    assert '600000' not in json.dumps(res) and 'price' not in json.dumps(fs).lower()


def test_not_found_anywhere(env):
    env([])
    res = SITE.brief('1 Nowhere Rd, Nowhereville', PLUMBER, [])
    assert res['status'] == 'not_found' and not card_of(res) and res['text']


# ---------------------------------------------------------------- basis rules

def basis_problems(card):
    bad = []
    for path, d in walk(card):
        b = d.get('basis')
        if b is None:
            continue
        if b == 'record':
            bad.append((path, 'record on a public address'))
        inferred = any(x in path for x in ('.floors', '.outside', '.height', '.layout')) or path.endswith('.check')
        if inferred and b == 'public' and not (path.endswith('.height') and d.get('from') == 'source'):
            bad.append((path, 'inferred element marked public'))
        if path.startswith('.facts') or path.startswith('.permits') or '.footprint' in path or '.parcel' in path:
            if b != 'public':
                bad.append((path, 'a public record not marked public'))
    return bad


@pytest.mark.parametrize('name', FOUND)
def test_nothing_inferred_is_public_and_nothing_is_a_record(env, name):
    res, _ = fx_brief(env, name, connected=('servicetitan', 'chat'))
    fs = card_of(res)
    assert not basis_problems(fs), basis_problems(fs)[:5]
    assert fs['basis'] == 'likely' and fs['house']['fuel_basis'] in ('likely', 'public')
    for f in fs['floors']:
        assert all(r['basis'] == 'likely' for r in f['rooms']) and all(w['basis'] == 'likely' for w in f.get('wet_walls') or [])
        assert all(i['basis'] == 'likely' for i in f['items']) and all(r['basis'] == 'likely' for r in f['runs'])
    assert fs['building']['storeys']['basis'] in ('public', 'likely') and fs['building']['front']['basis'] in ('public', 'assumed')


def test_rooms_and_items_sit_inside_the_real_outline(env):
    # Changed for FLOORPLAN_SPEC R6: this 48,700 sq ft footprint is 'large' now, so it gets no house rooms (houses: test_site_plan.py).
    res, _ = fx_brief(env, 'pa_lancaster_outline_only')
    fs = card_of(res)
    site_geo = SITE.site_geo
    b = fs['building']
    ring = b['footprint']['ring_m']
    assert b['kind'] == 'large' and not any(f['rooms'] or f['items'] for f in fs['floors'])
    assert [f['id'] for f in fs['floors']] == ['first'] and fs['floors'][0]['name'] == 'Ground floor'
    assert site_geo.ring_area_m2(ring) == pytest.approx(b['footprint']['area_m2'], rel=0.02)


def test_wire_and_wet_wall_are_drawn_as_likely(env):
    res, _ = fx_brief(env, 'pa_lancaster_outline_only')
    fs = card_of(res)
    runs = [r for f in fs['floors'] for r in f['runs']]
    # Changed for FLOORPLAN_SPEC R6: a large building has no interior lines; the water service and sewer are outside, likely.
    assert not runs and not any(f.get('wet_walls') for f in fs['floors'])
    assert {(o['kind'], o['side'], o['basis']) for o in fs['outside']} == {('main_water', 'front', 'likely'), ('sewer_cleanout', 'front', 'likely')}


# ---------------------------------------------------------------- privacy

def test_no_owner_reaches_any_output(env):
    poison = load('owner_poison')
    for name, calls in poison['fixtures'].items():
        env(calls)
        fx = load(name)
        res = SITE.brief(f"{fx['typed']} for a sink repair", PLUMBER, ['servicetitan'])
        text = json.dumps(res)
        assert res['status'] == 'found', name
        for bad in ('ZZTEST', '999999', 'OWNER', 'owner', 'MAIL_', 'PREV_OWNER', 'SALE_PRICE'):
            assert bad not in text, (name, bad)
        # the model path's card and text, too
        ws = workspace.clean({'role': PLUMBER, 'connected': ['servicetitan']})
        SITE.reset()
        t, err, cards = workspace.run_tool('site_brief', {'address': fx['typed'], 'issue': 'sink repair'}, ws, SITE.LocalSources())
        assert not err and 'ZZTEST' not in t + json.dumps(cards) and '999999' not in t + json.dumps(cards)


def test_requests_never_name_an_owner_field(env):
    for name in FOUND + ['choose', 'town_only']:
        _, rp = fx_brief(env, name)
        for _, params, _ in rp.seen:
            of = params.get('outFields') or params.get('$select') or ''
            assert of != '*' and not [f for f in of.split(',') if sources.blocked_key(f)], (name, of)


# ---------------------------------------------------------------- the answer

def test_answers_are_short_and_never_call_a_real_address_example(env):
    for name in FOUND + ['town_only', 'choose']:
        res, _ = fx_brief(env, name)
        t = res['text']
        assert 0 < SITE.words(t) <= 40, (name, t)
        assert all(len(s.split()) <= 18 for s in sentences(t)), (name, t)
        assert not re.search(r'\b(example|sandbox|fictional|owner)\b', t, re.I), (name, t)
        assert not re.search(r'\b(example|sandbox|fictional)\b', json.dumps(res['cards']).replace('"example": false', ''), re.I), name
    res, _ = fx_brief(env, 'nj_full')
    # Changed for FLOORPLAN_SPEC R6: a town hall's answer names the facility and only what holds for any building.
    assert res['text'].startswith('33 Washington St, Toms River. Town hall, 15,226 sq ft, two storeys (public record).')
    assert 'Likely: fixture shutoffs under each sink' in res['text'] and res['text'].endswith('map below.')


def test_outside_the_service_area_still_answers(env, monkeypatch):
    fx = load('pa_york_full')
    monkeypatch.setattr(workspace, 'area_of', lambda *a, **k: {'status': 'out', 'county': None, 'state': 'PA', 'hub': None, 'zip': '17401',
                                                              'label': 'Outside the Punctual Pros service area'})
    env(fx['calls'])
    res = SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, [])
    fs = card_of(res)
    assert res['status'] == 'found' and fs and fs['area']['status'] == 'out'
    assert 'Outside the Punctual Pros service area' in fs['area']['label']
    assert 'Outside our service area; refer to dispatch.' in res['text'] and SITE.words(res['text']) <= 40


def test_templates_fit_the_limits():
    long = ['A required opening sentence that names the address.', '?' + ' '.join(['word'] * 30) + '.', 'Plan below; dashed is likely.']
    out = SITE.fit_words(long)
    assert SITE.words(out) <= 40 and all(len(s.split()) <= 18 for s in sentences(out)) and out.endswith('dashed is likely.')
    assert SITE.fit_words([' '.join(['w'] * 60) + '.']).count('w') <= 18


# ---------------------------------------------------------------- the owner's sentence, end to end

def test_owner_sentence_with_the_app_connected_gives_the_company_record(env):
    for role in (TECH, DISPATCH):
        env([])
        res = SITE.brief(OWNER, role, ['servicetitan'])
        fs = card_of(res)
        assert res['status'] == 'found' and fs['example'] is True, (role, res['text'])
        assert res['text'].startswith('418 Wexcombe Ln, Lititz: company record (example data).')
        assert any(i['basis'] == 'record' for f in fs['floors'] for i in f['items'])
        assert fs['issue'] == 'Sink leaking' and fs['focus'][0] == 'fixture_shutoffs'
        assert SITE.words(res['text']) <= 40


def test_owner_sentence_without_the_app_is_answered_from_public_records_only(env):
    rp = env([])
    res = SITE.brief(OWNER, PLUMBER, [])
    assert res['status'] == 'not_found' and res['precision'] == 'town' and res['text'].startswith('Found Lititz, PA, not the house.')
    assert not re.search(r'example|sandbox|fictional', json.dumps(res).replace('"example": false', ''), re.I)
    assert any('geocod' in u for u, _, _ in rp.seen)                     # it really asked the public geocoder, word for word
    sent = next(p for u, p, _ in rp.seen if 'geocod' in u)['address']
    assert sent == '418 Wexcombe Ln, Lititz, PA'   # the typed street and town, with the state the service area names


def test_a_real_address_never_answers_from_a_company_record(env):
    res, _ = fx_brief(env, 'nj_full', role=TECH, connected=('servicetitan', 'chat'))
    fs = card_of(res)
    assert fs['example'] is False and not basis_problems(fs)
    assert 'company record' not in res['text'].lower()
    # the model path: same card, and the text says no company record
    ws = workspace.clean({'role': TECH, 'connected': ['servicetitan']})
    SITE.reset()
    t, err, cards = workspace.run_tool('site_brief', {'address': load('nj_full')['typed'], 'issue': 'sink repair'}, ws, SITE.LocalSources())
    assert not err and 'No company record for this address.' in t and 'MATCHED' not in t and '(record)' not in t
    assert [c['kind'] for c in cards] == ['floor_sketch', 'map_command'] and cards[0]['building'] == fs['building']


# ---------------------------------------------------------------- who may ask

def test_roles_that_may_ask(env):
    env([])
    assert SITE.brief(OWNER, 'cet-ceo', None)['status'] == 'outside'
    assert SITE.brief(OWNER, 'pp-sales', None)['status'] == 'outside'          # keeps the property brief, no floor plan
    assert SITE.brief(OWNER, 'no-such-role', None)['status'] == 'outside'
    for rid in (PLUMBER, TECH, DISPATCH, 'pp-location-gm', 'pp-vp-operations', 'pp-ceo', 'bsp-managing-partner'):
        assert SITE.brief(OWNER, rid, [])['status'] != 'outside', rid
    firm = SITE.brief(OWNER, 'bsp-managing-partner', None)
    assert firm['status'] == 'not_found' and 'company record' not in firm['text']   # the firm has no ServiceTitan


# ---------------------------------------------------------------- time limits and the cache

def test_a_stalled_service_returns_inside_the_deadline(env):
    env(load('nj_full')['calls'], delay=3.0)
    t = time.monotonic()
    res = SITE.brief(load('nj_full')['typed'], PLUMBER, [], deadline_s=1.0)
    took = time.monotonic() - t
    assert took < 2.5, took
    assert {'geocoder', 'parcel'} <= set(res['degraded']) and res['status'] in ('not_found', 'found')


def test_the_cache_makes_no_second_set_of_calls_and_forgets_a_miss(env, monkeypatch):
    rp = env(load('nj_full')['calls'])
    SITE.brief(load('nj_full')['typed'], PLUMBER, [])
    n = len(rp.seen)
    SITE.brief(load('nj_full')['typed'] + ' for a faucet', PLUMBER, [])
    assert n > 0 and len(rp.seen) == n
    assert SITE._ttl({'status': 'not_found'}) == 300 and SITE._ttl({'status': 'found', 'degraded': []}) == 24 * 3600
    assert SITE._ttl({'status': 'found', 'degraded': ['permits']}) == 60
    rp = env(load('town_only')['calls'])
    SITE.brief(load('town_only')['typed'], PLUMBER, [])
    n = len(rp.seen)
    SITE.brief(load('town_only')['typed'], PLUMBER, [])
    assert len(rp.seen) == n
    real = time.monotonic
    monkeypatch.setattr(SITE.time, 'monotonic', lambda: real() + 301)
    SITE.brief(load('town_only')['typed'], PLUMBER, [])
    assert len(rp.seen) > n


def test_live_off_makes_no_network_call(env, monkeypatch):
    rp = env([])
    monkeypatch.setattr(homes, 'LIVE_ON', False)
    res = SITE.brief(OWNER, PLUMBER, [])
    assert not rp.seen and res['status'] == 'not_found'


def test_brief_loads_no_model_client():
    code = ('import sys; sys.path.insert(0, "."); import workspace; S = workspace.site_module(); '
            'r = S.brief("418 Wexcombe Ln, Lititz, sink repair", "pp-plumber", []); '
            'assert r["status"] in ("found", "not_found"), r; '
            'assert not [m for m in sys.modules if m.startswith("anthropic") or m == "app"], "a model client was loaded"; print("ok")')
    out = subprocess.run([sys.executable, '-c', code], cwd=SERVER_DIR, capture_output=True, text=True, timeout=120,
                         env=dict(os.environ, PROPERTY_LIVE='off'))
    assert out.returncode == 0 and out.stdout.strip().endswith('ok'), out.stderr[-800:]


# ---------------------------------------------------------------- show_view on the model path

def test_show_view_tool(env, monkeypatch):
    assert 'show_view' in workspace.TOOL_NAMES
    ws = workspace.clean({'role': 'pp-cfo', 'connected': ['financials', 'email']})
    text, err, cards = workspace.run_tool('show_view', {'view': 'bridge'}, ws, SITE.LocalSources())
    assert err and 'outside your access' in text and not cards                     # not in the role's tools yet
    R = dict(workspace.role('pp-cfo'))
    R['tools'] = list(R['tools']) + ['show_view']
    monkeypatch.setattr(workspace, 'role', lambda rid, _r=workspace.role: R if rid == 'pp-cfo' else _r(rid))
    workspace._defs.pop('pp-cfo', None)
    assert any(d['name'] == 'show_view' for d in workspace.tool_defs(ws))
    workspace._defs.pop('pp-cfo', None)
    text, err, cards = workspace.run_tool('show_view', {'view': 'bridge'}, ws, SITE.LocalSources())
    assert not err and cards and cards[0]['kind'] == 'bridge', text
    text, err, cards = workspace.run_tool('show_view', {'view': 'bridge'}, workspace.clean({'role': 'pp-cfo', 'connected': []}), SITE.LocalSources())
    assert not err and 'is not connected' in text and not cards
    text, err, cards = workspace.run_tool('show_view', {'view': 'scorecard', 'company': 'cet'}, ws, SITE.LocalSources())
    assert err and 'outside your access' in text
    assert workspace.status_text('show_view', {}) == 'Building the picture'


# ---------------------------------------------------------------- live (opt-in), a public building only

@pytest.mark.skipif(os.environ.get('SITE_LIVE_TEST') != '1', reason='network test: SITE_LIVE_TEST=1 to run (Trenton City Hall only)')
def test_live_public_building_end_to_end(monkeypatch):
    """Trenton City Hall, a public building outside the service area: found at the parcel, outline drawn, still answered."""
    monkeypatch.setattr(homes, 'LIVE_ON', True)
    SITE.reset()
    res = SITE.brief('319 E State St, Trenton, NJ 08608 for a sink repair', PLUMBER, [])
    fs = card_of(res)
    assert res['status'] == 'found' and res['precision'] in ('parcel', 'typed'), res
    assert fs['place']['basis'] == 'public' and fs['area']['status'] == 'out' and SITE.words(res['text']) <= 40
    assert 'ZZTEST' not in json.dumps(res) and not re.search(r'\b(example|sandbox|fictional)\b', res['text'], re.I)
