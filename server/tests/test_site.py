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
import site_geo                   # noqa: E402
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
    assert res['text'].startswith('33 Washington St, Toms River. Town hall, 15,226 sq ft, two stories (public record).')
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


# ---------------------------------------------------------------- which building on the lot is drawn

SQ = 0.09290304   # m2 per sq ft


def bld(area, bid, outbuilding=False):
    return {'area_m2': area, 'build_id': bid, 'outbuilding': outbuilding}


def rec_facts(sqft=None, stories=None, k='floor_area_sqft'):
    return ([{'k': k, 'v': sqft}] if sqft is not None else []) + ([{'k': 'stories', 'v': stories}] if stories is not None else [])


def choose(cands, facts=(), building=None):
    area, st = SITE.record_size(list(facts))
    return SITE.choose_building(cands, area, st, building, house=SITE.reads_as_house(facts))


def test_pick_house_over_a_detached_garage_or_a_shed():
    house, garage, shed = bld(150, 1), bld(60, 2), bld(12, 3)
    for others in ([garage], [shed]):
        ch = choose([others[0], house])
        assert ch['pick'] is house and ch['why'] == 'largest' and ch['sizeable'] == [house] and SITE._lot_block(ch | {'buildings': ch['sizeable']}) is None


def test_pick_keeps_the_house_when_it_is_not_over_twice_the_record():
    house, garage = bld(160, 1), bld(155, 2)
    ch = choose([garage, house], rec_facts(1800, 2, 'living_area_sqft'))   # 900 sq ft a story = 83.6 m2; 160 is under 2 x
    assert ch['pick'] is house and ch['why'] == 'largest' and ch['sizeable'] == [house, garage]


def test_pick_farm_house_by_the_record_and_the_barn_without_one():
    barn, house = bld(400, 1), bld(170, 2)
    ch = choose([barn, house], rec_facts(2000, 2))
    assert ch['pick'] is house and ch['why'] == 'record' and ch['shown'] == 2
    ch = choose([barn, house])
    assert ch['pick'] is barn and ch['why'] == 'largest' and ch['shown'] == 1
    lot = SITE._lot_block({'why': ch['why'], 'shown': ch['shown'], 'buildings': ch['sizeable']})
    assert lot == {'n': 2, 'shown': 1, 'why': 'largest', 'buildings': [{'n': 1, 'sqft': 4300, 'shown': True}, {'n': 2, 'sqft': 1800, 'shown': False}]}
    assert SITE.building_notes({'building': {'lot': lot, 'kind': 'house'}}, {}) == '2 buildings on this lot. Showing the largest.'


def test_pick_town_hall_numbers_from_the_fixture():
    garage, hall, shed = bld(3447.6, 9520271), bld(2092.6, 9520410), bld(90.0, 9520278)
    ch = choose([garage, hall, shed], rec_facts(15226, 2))
    assert ch['pick'] is hall and ch['why'] == 'record' and ch['sizeable'] == [garage, hall] and ch['shown'] == 2


def test_pick_with_no_stories_recorded_reads_one_story():
    assert SITE.record_size(rec_facts(2000)) == (2000, 1)
    barn, house = bld(570, 1), bld(230, 2)
    ch = choose([barn, house], rec_facts(2000))   # 2,000 sq ft on one story = 185.8 m2: the 230 m2 house fits, the barn is over 3 x
    assert ch['pick'] is house and ch['why'] == 'record'
    ch = choose([barn, house], rec_facts(2000, 2))   # read as two stories (92.9 m2 a story) the house is 2.5 x and still the pick
    assert ch['pick'] is house and ch['why'] == 'record'


def test_pick_keeps_a_house_with_its_garage_over_a_detached_shop_or_barn():
    # a one-story ranch outline with its attached garage and porch runs 2 to 2.5 x the recorded living area: a 150 to 220 m2
    # shop or pole barn beside it fits the record better, but the house is kept (the facts read as a house: 3 x is needed)
    cases = ((240, 155, 1100, 1), (230, 160, 1000, 1), (200, 160, 1400, 1.5), (186, 160, 1600, 2), (250, 220, 1200, 1),
             (250, 180, 2400, 2), (180, 151, 900, 1), (250, 151, 1100, None))
    for house_m2, shop_m2, sqft, st in cases:
        house, shop = bld(house_m2, 1), bld(shop_m2, 2)
        ch = choose([shop, house], rec_facts(sqft, st, 'living_area_sqft'))
        assert ch['pick'] is house and ch['why'] == 'largest', (house_m2, shop_m2, sqft, st)
    # the same 2.35 x on a lot whose facts say it is not a house (a public building) is doubted at 2 x
    house, shop = bld(240, 1), bld(155, 2)
    ch = choose([shop, house], rec_facts(1100, 1) + [{'k': 'facility', 'v': 'ADMIN BUILDING'}])
    assert ch['pick'] is shop and ch['why'] == 'record'


def test_pick_does_not_switch_to_an_outline_that_fits_the_record_badly_too():
    barns, house = [bld(900, 1), bld(600, 2), bld(450, 3)], bld(180, 4)   # the house is under 0.4 of the largest: not sizeable
    ch = choose(barns + [house], rec_facts(2400, 2))                     # 111.5 m2 a story: the best sizeable one is 4 x over
    assert ch['pick'] is barns[0] and ch['why'] == 'largest'


def test_record_size_skips_an_absurd_number_and_reads_floor_area_first():
    living_bad = [{'k': 'living_area_sqft', 'v': 50}, {'k': 'stories', 'v': 2}, {'k': 'floor_area_sqft', 'v': 2000}]
    assert SITE.record_size(living_bad) == (2000, 2)
    floor_bad = [{'k': 'floor_area_sqft', 'v': 9_999_999}, {'k': 'living_area_sqft', 'v': 1800}]
    assert SITE.record_size(floor_bad) == (1800, 1)
    both = [{'k': 'living_area_sqft', 'v': 1800}, {'k': 'floor_area_sqft', 'v': 2000}]     # the order site_plan.building_kind reads
    assert SITE.record_size(both) == (2000, 1)
    barn, house = bld(400, 1), bld(170, 2)
    ch = choose([barn, house], living_bad)
    assert ch['pick'] is house and ch['why'] == 'record'


def test_pick_ignores_an_absurd_record():
    barn, house = bld(400, 1), bld(170, 2)
    for sqft in (150, 199, 2_000_001, 9_999_999):
        assert SITE.record_size(rec_facts(sqft, 2))[0] is None
        ch = choose([barn, house], rec_facts(sqft, 2))
        assert ch['pick'] is barn and ch['why'] == 'largest', sqft


def test_pick_equal_areas_is_deterministic():
    a, b, c = bld(200, 7), bld(200, 3), bld(200, 5)
    for order in ([a, b, c], [c, b, a], [b, a, c]):
        ch = choose(order)
        assert ch['pick'] is b and ch['sizeable'] == [b, c, a]
    # no build_id: the rounded centre decides, whatever order the layer returns them in
    x = {'area_m2': 200, 'build_id': None, 'centroid': [-74.2, 39.95]}
    y = {'area_m2': 200, 'build_id': None, 'centroid': [-74.1, 39.95]}
    assert {id(choose(o)['pick']) for o in ([x, y], [y, x])} == {id(x)}


def test_pick_survives_a_text_area_and_an_outline_with_no_centre():
    a, b = {'area_m2': '300', 'build_id': 1}, bld(200, 2)
    assert choose([b, a])['pick'] is a
    lot = ring(0, 0, 120, 80)
    good = outline(0, 0, 15, 12, 1)
    assert SITE._primary_building([{'ring_ll': good['ring_ll'], 'area_m2': 500}, good], lot, None)[0] is good


def test_pick_the_persons_choice_and_an_out_of_range_one():
    garage, hall = bld(3447.6, 1), bld(2092.6, 2)
    ch = choose([garage, hall], rec_facts(15226, 2), building=1)
    assert ch['pick'] is garage and ch['why'] == 'chosen' and ch['shown'] == 1
    ch = choose([garage, hall], building=2)
    assert ch['pick'] is hall and ch['why'] == 'chosen' and ch['shown'] == 2
    for bad in (9, 0, -1, 3, True, '2', 2.0, None):
        ch = choose([garage, hall], rec_facts(15226, 2), building=bad)
        assert ch['pick'] is hall and ch['why'] == 'record', bad


def test_pick_one_candidate_says_only_and_has_no_lot_block():
    one = bld(180, 1)
    ch = choose([one])
    assert ch['pick'] is one and ch['why'] == 'only' and SITE._lot_block({'why': 'only', 'shown': ch['shown'], 'buildings': ch['sizeable']}) is None


ORIGIN = {'lon': -76.3, 'lat': 40.1}


def ring(cx, cy, w, h):
    pts = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]
    ll = site_geo.m_to_ll(pts + [pts[0]], ORIGIN)
    return ll


def outline(cx, cy, w, h, bid, outbuilding=False):
    r = ring(cx, cy, w, h)
    return {'ring_ll': r, 'centroid': site_geo.m_to_ll([[cx, cy]], ORIGIN)[0], 'area_m2': w * h, 'build_id': bid, 'outbuilding': outbuilding}



def test_primary_building_marks_a_second_building_apart_from_a_shed():
    lot = ring(0, 0, 120, 80)
    barn, house, shed, flagged = outline(-30, 0, 20, 20, 1), outline(20, 0, 17, 10, 2), outline(40, 25, 4, 3, 3), outline(0, 30, 20, 20, 4, True)
    far = outline(500, 0, 30, 30, 5)
    prim, outs, lot_info = SITE._primary_building([shed, house, far, barn, flagged], lot, None, rec_facts(2000, 2))
    assert prim is house and lot_info['why'] == 'record' and lot_info['shown'] == 2
    assert [o['build_id'] for o in outs] == [1, 4, 3] and [bool(o.get('sizeable')) for o in outs] == [True, False, False]


def test_primary_building_point_branch_is_unchanged():
    near, other = outline(0, 0, 12, 10, 1), outline(60, 0, 30, 30, 2)
    p = site_geo.m_to_ll([[0, 0]], ORIGIN)[0]
    assert SITE._primary_building([other, near], None, p) == (near, [], None)
    assert SITE._primary_building([other, near], None, site_geo.m_to_ll([[200, 200]], ORIGIN)[0]) == (None, [], None)


LOT_RECORD = '2 buildings on this lot. Showing the one that best fits the recorded size.'
LOT_CHOSEN = '2 buildings on this lot. Showing the one you picked.'
TOWN_HALL_NOTE = 'Outline: about 22,500 sq ft of ground. Record: 15,226 sq ft. They do not agree.'


def test_nj_full_draws_the_town_hall_and_says_so(env):
    res, _ = fx_brief(env, 'nj_full')
    fs = card_of(res)
    b = fs['building']
    assert b['footprint']['area_m2'] == pytest.approx(2092.6, abs=5) and b['kind'] == 'large'
    assert b['lot'] == {'n': 2, 'shown': 2, 'why': 'record', 'buildings': [{'n': 1, 'sqft': 37100, 'shown': False}, {'n': 2, 'sqft': 22500, 'shown': True}]}
    assert LOT_RECORD in fs['house']['text'] and TOWN_HALL_NOTE in fs['house']['text']
    assert fs['house']['text'].index(LOT_RECORD) < fs['house']['text'].index(TOWN_HALL_NOTE)
    outs = b['footprint']['outbuildings']
    assert [o.get('kind') for o in outs] == ['building', None]      # the garage is another building; the small one a shed
    assert res['text'].startswith('33 Washington St, Toms River. Town hall, 15,226 sq ft, two stories (public record).')
    assert 'build_id' not in json.dumps(fs) and '9520' not in json.dumps(b['lot'])
    step = card_of(res, 'map_command')['cmd']['steps'][-1]
    assert step['outline'] and SITE.words(res['text']) <= 40


def test_nj_full_building_one_is_the_persons_pick(env):
    fx = load('nj_full')
    env(fx['calls'])
    res = SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, [], building=1)
    fs = card_of(res)
    b = fs['building']
    assert b['footprint']['area_m2'] == pytest.approx(3447.6, abs=5)
    assert b['lot']['why'] == 'chosen' and b['lot']['shown'] == 1 and [x['shown'] for x in b['lot']['buildings']] == [True, False]
    assert LOT_CHOSEN in fs['house']['text'] and 'Outline: about 37,100 sq ft of ground. Record: 15,226 sq ft. They do not agree.' in fs['house']['text']
    assert [o.get('kind') for o in b['footprint']['outbuildings']] == ['building', None]
    again = card_of(SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, []))   # the default is cached apart from the pick
    assert again['building']['lot']['why'] == 'record' and again['building']['footprint']['area_m2'] == pytest.approx(2092.6, abs=5)


def test_a_building_pick_makes_no_new_public_lookup(env):
    fx = load('nj_full')
    rp = env(fx['calls'])
    first = SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, [])
    n = len(rp.seen)
    assert n > 0
    for k in (1, 2, 1, 5, 8):                                    # each press, and out-of-range picks, re-pick from the cached outlines
        SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, [], building=k)
    assert len(rp.seen) == n
    two = card_of(SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, [], building=1))['building']
    assert two['lot']['why'] == 'chosen' and two['footprint']['area_m2'] == pytest.approx(3447.6, abs=5)
    five = card_of(SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, [], building=5))['building']
    assert five['lot']['why'] == 'record'                          # out of range: the default answer
    assert card_of(SITE.brief(fx['typed'] + ' for a sink repair', PLUMBER, []))['building']['lot']['why'] == 'record'
    assert card_of(first)['building']['lot']['why'] == 'record'


def test_building_reaches_the_lookup_and_bad_values_do_not(env, monkeypatch):
    seen = []
    real = SITE.lookup

    def spy(parsed, area=None, pick=None, deadline_s=8.0, **kw):
        seen.append(kw.get('building'))
        return real(parsed, area, pick=pick, deadline_s=deadline_s, **kw)
    monkeypatch.setattr(SITE, 'lookup', spy)
    fx = load('nj_full')
    env(fx['calls'])
    for b in (2, 9, 0, True, '2', None):
        SITE.brief(fx['typed'], PLUMBER, [], building=b)
    assert seen == [2, None, None, None, None, None]


def test_franklin_pick_is_unchanged(env):
    res, _ = fx_brief(env, 'pa_franklin_full')
    b = card_of(res)['building']
    # the courthouse outline (2,411.3 m2 in the layer) is the largest, the record does not move it (no other sizeable one)
    assert b['footprint']['area_m2'] == pytest.approx(2450.6, abs=1) and 'lot' not in b
    assert 'buildings on this lot' not in (card_of(res).get('house') or {}).get('text', '')


def test_a_house_card_never_carries_the_outline_note():
    live = {'facts': rec_facts(1000, 1), 'building': {'area_m2': 400}}
    card = {'building': {'kind': 'house', 'footprint': {'ring_m': [[0, 0], [20, 0], [20, 20]], 'area_m2': 400}}}
    assert SITE.building_notes(card, live) == ''
    card['building']['kind'] = 'large'
    assert SITE.building_notes(card, live) == 'Outline: about 4,300 sq ft of ground. Record: 1,000 sq ft. They do not agree.'


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
