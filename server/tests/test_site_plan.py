"""
Tests for server/site_plan.py and its use in server/site.py dress() and answer_text() (FLOORPLAN_SPEC rulings R3, R5, R6, R8, R9,
R10 and the plan lane of section 4).

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q tests/test_site_plan.py

No network: the four recorded public buildings replay their recorded calls (tests/fixtures/site), and the house shapes are
invented outlines at an invented street in an invented town point (test input only, never a real home). The generated outlines
are seeded, so every run of this file checks the same 200+ shapes.
"""

import datetime
import json
import math
import os
import random
import re
import sys
import time

import httpx
import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SERVER_DIR)
FIX = os.path.join(SERVER_DIR, 'tests', 'fixtures', 'site')
sys.path.insert(0, SERVER_DIR)

import property as homes          # noqa: E402  (never a bare "import property")
import site_geo                   # noqa: E402
import site_plan                  # noqa: E402
import site_sources as sources    # noqa: E402
import workspace                  # noqa: E402

SITE = workspace.site_module()
TODAY = datetime.date(2026, 11, 17)
PLUMBER = 'pp-plumber'
RECORDED = ['nj_full', 'pa_york_full', 'pa_franklin_full', 'pa_lancaster_outline_only']
BANNED = re.compile(r'\b(house|houses|home|homes|garage|garages|living|bedroom|bedrooms|kitchen|kitchens)\b', re.I)
EPS = 0.05

# The eight invented house shapes of FP/cards.py: metres, x across the front, y back from the street; the street point in front.
SHAPES = {
    'ranch_rect': dict(pts=[(0, 0), (13, 0), (13, 8.5), (0, 8.5)], rot=20, st=1, sqft=1150, year=1968, beds=3, garage=False, street=(6, -12)),
    'colonial_L': dict(pts=[(0, 0), (11, 0), (11, 3), (17, 3), (17, 10), (0, 10)], rot=-35, st=2, sqft=2300, year=1994, beds=4, garage=True,
                       street=(8, -14)),
    'cape_T': dict(pts=[(0, 0), (10, 0), (10, 7), (7, 7), (7, 11), (3, 11), (3, 7), (0, 7)], rot=75, st=1, sqft=1300, year=1952, beds=2,
                   garage=False, street=(5, -12)),
    'narrow_row': dict(pts=[(0, 0), (5.5, 0), (5.5, 14), (0, 14)], rot=8, st=2, sqft=1500, year=1925, beds=3, garage=False, street=(2.7, -8)),
    'u_shape': dict(pts=[(0, 0), (6, 0), (6, 4), (12, 4), (12, 0), (18, 0), (18, 11), (0, 11)], rot=140, st=1, sqft=1900, year=1978, beds=3,
                    garage=True, street=(9, -13)),
    'cottage': dict(pts=[(0, 0), (7.2, 0), (7.2, 6.4), (0, 6.4)], rot=-10, st=1, sqft=500, year=1940, beds=1, garage=False, street=(3.6, -9)),
    'angled_bay': dict(pts=[(0, 0), (12, 0), (14.5, 2.5), (14.5, 9), (0, 9)], rot=33, st=1, sqft=1350, year=2004, beds=3, garage=False,
                       street=(6, -12)),
    'big_slab_2st': dict(pts=[(0, 0), (8, 0), (8, -2), (15, -2), (15, 0), (21, 0), (21, 11), (13, 11), (13, 13), (4, 13), (4, 11), (0, 11)],
                         rot=-80, st=2, sqft=3900, year=2012, beds=5, garage=True, street=(10, -16)),
}
ISSUES = {'sink': 'sink repair', 'wires': 'an electrical job, where are the wires', 'drywall': 'a drywall job, what is behind the wall'}


# ---------------------------------------------------------------- set-up: no network, a fixed date

def norm(params):
    return json.dumps({k: str(v) for k, v in params.items()}, sort_keys=True)


@pytest.fixture(scope='module')
def env():
    mp = pytest.MonkeyPatch()
    if os.path.exists(os.path.join(SERVER_DIR, 'sandbox', 'roles.json')):
        mp.delenv('WORKSPACE_SANDBOX_DIR', raising=False)
    else:
        mp.setenv('WORKSPACE_SANDBOX_DIR', os.path.join(SERVER_DIR, 'tests', 'fixtures', 'sandbox_min'))
    workspace.reset()
    SITE.reset()
    mp.setattr(workspace, 'today', lambda: TODAY)
    mp.setattr(sources, '_today', lambda: datetime.date(2026, 11, 23))
    mp.setattr(homes, 'LIVE_ON', True)
    mp.setattr(homes, 'lookup_record', lambda a: {'status': 'not_found', 'record': None, 'choose': [], 'match': ''})
    yield mp
    mp.undo()
    SITE.reset()
    workspace.reset()


def recorded(mp, name, issue='sink repair'):
    with open(os.path.join(FIX, name + '.json'), encoding='utf-8') as f:
        fx = json.load(f)

    def rp(url, params, timeout=None, calls=fx['calls']):
        for c in calls:
            if c['url'] == url and norm(c['params']) == norm(params):
                return json.loads(json.dumps(c['response']))
        raise httpx.ConnectError('not recorded')
    mp.setattr(homes, '_get_json', rp)
    SITE.reset()
    return SITE.brief(f"{fx['typed']} for a {issue}", PLUMBER, [])


LAT0, LON0 = 40.05, -76.30


def _ll(pts, rot):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    out = []
    for x, y in pts:
        e, n = x * c - y * s, x * s + y * c
        out.append([LON0 + e / (111320 * math.cos(math.radians(LAT0))), LAT0 + n / 110540])
    return out


def invented(mp, pts, rot=0, st=1, sqft=1500, year=1990, beds=3, garage=False, street=None, issue='sink repair', state='PA'):
    """A brief for an invented outline (metres) at an invented street: the live lookup is replaced by this record."""
    closed = lambda r: r + [r[0]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    street = street or ((min(xs) + max(xs)) / 2, min(ys) - 10)
    ring = _ll(pts, rot)
    st_ll = _ll([street], rot)[0]
    lot = _ll([(min(xs) - 6, min(ys) - 9), (max(xs) + 6, min(ys) - 9), (max(xs) + 6, max(ys) + 12), (min(xs) - 6, max(ys) + 12)], rot)
    f = lambda k, label, v: {'k': k, 'label': label, 'v': v, 'src': 'nj_parcels', 'as_of': '2026-10-01'}
    town, z = ('Lititz', '17543') if state == 'PA' else ('Toms River', '08753')
    live = {'status': 'found', 'precision': 'parcel', 'label': f'12 Harness Test Ln, {town}, {state} {z}', 'point': ring[0], 'line': '12 Harness Test Ln',
            'town': town, 'state': state, 'zip': z, 'county': 'Lancaster' if state == 'PA' else 'Ocean', 'record': None,
            'parcel': {'ring_ll': closed(lot), 'src': 'nj_parcels', 'as_of': '2026-10-01'}, 'geocode': {'lon': st_ll[0], 'lat': st_ll[1]},
            'town_place': None, 'building': {'ring_ll': closed(ring), 'height_m': None, 'as_of': '2024-08-01', 'imagery_source': 'test'},
            'outbuildings': [], 'permits': [],
            'facts': [f('year_built', 'Year built', year), f('stories', 'Storeys', st), f('living_area_sqft', 'Living area', sqft),
                      f('beds', 'Bedrooms', beds)] + ([f('attached_garage', 'Attached garage', 'yes')] if garage else []),
            'choose': [], 'degraded': [], 'seconds': 0.1}
    mp.setattr(SITE, 'lookup', lambda parsed, area=None, pick=None, deadline_s=8.0, live=live: json.loads(json.dumps(live)))
    SITE.reset()
    return SITE.brief(f'12 Harness Test Ln, {town}, {state} {z} for {issue}', PLUMBER, [])


def card_of(res):
    return next((c for c in res['cards'] if c.get('kind') == 'floor_sketch'), None)


# ---------------------------------------------------------------- the checks every house card must pass

def plan_ring_of(card):
    f0 = card['floors'][0]
    return site_plan.plan_ring(card['building'], f0['w'], f0['h'])


def inside(p, ring):
    return site_geo.point_in_ring(p, ring)


def seg_inside(a, b, ring, n=12):
    return all(inside((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n), ring) for k in range(n + 1))


def house_problems(card):
    """Every rule of R3 and R5 this lane owns, as a list of plain faults (empty when the card is right)."""
    bad = []
    ring = plan_ring_of(card)
    if not ring:
        return ['no plan ring']
    floors = card['floors']
    ids = [f['id'] for f in floors]
    kinds = {r['kind'] for f in floors for r in f['runs']}
    for f in floors:
        for it in f['items']:
            if not inside((it['x'], it['y']), ring):
                bad.append(f"{f['id']}: item {it['kind']} at {it['x']},{it['y']} outside the outline")
        for r in f['runs']:
            pts = r['points']
            if len(pts) < 2:
                bad.append(f"{f['id']}: run {r['kind']} has {len(pts)} point(s)")
            for p in pts:
                if not inside(p, ring):
                    bad.append(f"{f['id']}: run {r['kind']} point {p} outside the outline")
            for a, b in zip(pts, pts[1:]):
                if abs(a[0] - b[0]) >= EPS and abs(a[1] - b[1]) >= EPS:
                    bad.append(f"{f['id']}: run {r['kind']} diagonal {a}->{b}")
                elif not seg_inside(a, b, ring):
                    bad.append(f"{f['id']}: run {r['kind']} segment {a}->{b} leaves the outline")
            for x, y, d in r.get('risers') or []:
                if d not in ('up', 'down') or [x, y] not in pts:
                    bad.append(f"{f['id']}: riser {x},{y},{d} not on its run")
    # every wet room on a floor people live on: the supply and the drain reach it
    for f in floors:
        if f['id'] == 'basement':
            continue
        for room in f['rooms']:
            if room['kind'] not in ('kitchen', 'bath', 'laundry'):
                continue
            for k in ('water', 'drain'):
                if k not in kinds:
                    continue
                hit = any(room['x'] - 0.2 <= p[0] <= room['x'] + room['w'] + 0.2 and room['y'] - 0.2 <= p[1] <= room['y'] + room['h'] + 0.2
                          for r in f['runs'] if r['kind'] == k for p in (r['points'][0], r['points'][-1]))
                if not hit:
                    bad.append(f"{f['id']}: {room['label']} not reached by {k}")
    # risers pair across floors: up on one floor, down at the same spot on the next
    for k, f in enumerate(floors):
        for r in f['runs']:
            for x, y, d in r.get('risers') or []:
                j = k + 1 if d == 'up' else k - 1
                if not 0 <= j < len(floors):
                    bad.append(f"{f['id']}: riser {d} with no floor there")
                    continue
                want = 'down' if d == 'up' else 'up'
                if not any(rr['kind'] == r['kind'] and [x, y, want] in (rr.get('risers') or []) for rr in floors[j]['runs']):
                    bad.append(f"{f['id']}: {r['kind']} riser {d} at {x},{y} has no pair on {ids[j]}")
    # the question's run kinds are kept
    return bad


def large_problems(res):
    card = card_of(res)
    bad = []
    b = card.get('building') or {}
    if b.get('kind') != 'large' or not b.get('kind_from'):
        bad.append('not large')
    if card.get('layout', {}).get('from') != 'none' or card['layout'].get('note') != site_plan.LARGE_NOTE:
        bad.append('layout')
    fl = card['floors']
    if len(fl) != 1 or fl[0]['id'] != 'first' or fl[0]['name'] != 'Ground floor' or fl[0]['rooms'] or fl[0]['items'] or fl[0]['runs']:
        bad.append('floors')
    if {o['side'] for o in card['outside']} != {'front'} or {o['kind'] for o in card['outside']} != {'main_water', 'sewer_cleanout'}:
        bad.append('outside')
    for path, s in strings(card):
        if BANNED.search(s):
            bad.append(f'banned word at {path}: {s[:60]}')
    if BANNED.search(res['text']):
        bad.append('banned word in the answer: ' + res['text'])
    if SITE.words(res['text']) > SITE.WORDS_MAX or any(len(x.split()) > SITE.SENTENCE_MAX for x in re.split(r'(?<=[.!?])\s+', res['text'])):
        bad.append('answer too long')
    for path, s in strings(card):
        if re.search(r'\b(safe|clear|example|sandbox|fictional)\b', s, re.I):
            bad.append(f'R8 word at {path}')
    return bad


def strings(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from strings(v, f'{path}.{k}')
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from strings(v, f'{path}[{i}]')
    elif isinstance(o, str):
        yield path, o


# ---------------------------------------------------------------- R6: house or large

def test_building_kind_thresholds():
    fact = lambda k, v, label='x': {'k': k, 'label': label, 'v': v}
    m2 = lambda sqft: sqft / site_plan.SQFT_PER_M2
    assert site_plan.building_kind({}, m2(4400))['kind'] == 'house'
    assert site_plan.building_kind({}, m2(4600)) == {'kind': 'large', 'from': 'footprint 4,600 sq ft'}
    assert site_plan.building_kind({'facts': [fact('floor_area_sqft', 8100)]}, m2(2000))['kind'] == 'large'
    assert site_plan.building_kind({'facts': [fact('living_area_sqft', 7900)]}, m2(2000))['kind'] == 'house'
    assert site_plan.building_kind({'facts': [fact('stories', 4)]}, m2(2000))['kind'] == 'large'
    assert site_plan.building_kind({'facts': [fact('stories', 3)]}, m2(2000))['kind'] == 'house'
    for k, v in (('property_class', '15C (public property)'), ('property_class', '4A (commercial)'), ('land_use', 'Other Miscellaneous, Exempt'),
                 ('facility', 'TOWN HALL'), ('tax_exempt', 'yes'), ('land_use', 'Industrial')):
        assert site_plan.building_kind({'facts': [fact(k, v)]}, m2(1500))['kind'] == 'large', (k, v)
    for k, v in (('property_class', '2 (residential)'), ('tax_exempt', 'no'), ('land_use', 'Single family'), ('utilities', 'All Public')):
        assert site_plan.building_kind({'facts': [fact(k, v)]}, m2(1500))['kind'] == 'house', (k, v)
    assert site_plan.building_kind({}, None)['kind'] == 'house'


@pytest.mark.parametrize('name', RECORDED)
def test_recorded_public_buildings_are_large_with_no_rooms(env, name):
    res = recorded(env, name)
    assert res['status'] == 'found'
    assert not large_problems(res), large_problems(res)
    card = card_of(res)
    assert {u['kind'] for u in card['unplaced']} == {'fixture_shutoffs', 'main_water'}
    assert all(u['basis'] == 'likely' for u in card['unplaced']) and all(o['basis'] == 'likely' for o in card['outside'])
    assert 'mechanical room' in res['text'] and 'ask the site contact' in res['text']


def test_town_hall_answer_reads_as_the_ruling_says(env):
    res = recorded(env, 'nj_full')
    assert res['text'] == ('33 Washington St, Toms River. Town hall, 15,226 sq ft, two storeys (public record). Likely: fixture shutoffs '
                           'under each sink; building shutoff in the mechanical room, ask the site contact. Outline, 3D and map below.')
    assert card_of(res)['building']['kind_from'].startswith('footprint ')


# ---------------------------------------------------------------- the invented houses: all sixteen cards of FP/cards.py

CASES = [(n, 'sink') for n in SHAPES] + [(n, t) for n in ('colonial_L', 'ranch_rect') for t in ('wires', 'drywall')]


@pytest.mark.parametrize('name,tag', CASES)
def test_invented_houses_are_houses_with_square_runs(env, name, tag):
    h = SHAPES[name]
    res = invented(env, h['pts'], h['rot'], h['st'], h['sqft'], h['year'], h['beds'], h['garage'], h['street'], ISSUES[tag])
    card = card_of(res)
    assert res['status'] == 'found' and card['building']['kind'] == 'house' and card['layout']['from'] == 'outline'
    assert not house_problems(card), house_problems(card)[:6]
    runs = [r for f in card['floors'] for r in f['runs']]
    assert {'water', 'drain', 'power'} <= {r['kind'] for r in runs}                     # every kind the question brings is kept
    assert all(r['basis'] == 'likely' for r in runs)
    items = [i for f in card['floors'] for i in f['items']]
    for it in items:                                                                    # the rules' wording stays
        assert it['basis'] == 'likely' and it['label'] and it['short'] and it['note'] is not None
    if tag == 'sink':
        fx = [i for i in items if i['kind'] == 'fixture_shutoffs']
        assert fx and all(i.get('room') for i in fx)                                    # at a sink or a bath, not over the stairs
        first = next(f for f in card['floors'] if f['id'] == 'first')
        assert any(i['kind'] == 'fixture_shutoffs' for i in first['items']) and first['runs']   # problem 5: the first floor has lines
    else:
        assert not any(i['kind'] == 'fixture_shutoffs' for i in items)
    for f in card['floors']:
        for r in f['rooms']:
            assert isinstance(r.get('short'), str) and 0 < len(r['short']) <= 7
    assert not re.search(r'\b(safe|clear)\b', json.dumps(card), re.I) and not BANNED_R8.search(res['text'])


BANNED_R8 = re.compile(r'\b(example|sandbox|fictional|owner)\b', re.I)


def test_main_shutoff_is_on_the_street_wall_and_the_heater_in_the_utility_corner(env):
    h = SHAPES['colonial_L']
    card = card_of(invented(env, h['pts'], h['rot'], h['st'], h['sqft'], h['year'], h['beds'], h['garage'], h['street']))
    ring = plan_ring_of(card)
    base = next(f for f in card['floors'] if f['id'] == 'basement')
    w = next(i for i in base['items'] if i['kind'] == 'main_water')
    front = max(p[1] for p in ring)
    assert front - w['y'] < 3.0                                                         # within a few feet of the street wall
    wh = next(i for i in base['items'] if i['kind'] == 'water_heater')
    assert wh.get('room') == 'Utility'
    first = next(f for f in card['floors'] if f['id'] == 'first')
    kit = next(i for i in first['items'] if i['kind'] == 'fixture_shutoffs')
    assert kit['room'] == 'Kitchen'


def test_a_straight_l_is_kept_when_it_stays_inside():
    ring = [[0, 0], [40, 0], [40, 30], [0, 30]]
    r = site_plan.Router(ring, 1.0, [[5, 5], [30, 20]])
    assert r.route([5, 5], [30, 20]) in ([[5, 5], [30, 5], [30, 20]], [[5, 5], [5, 20], [30, 20]])


def test_a_run_goes_round_a_notch_not_through_it():
    ring = [[0, 0], [20, 0], [20, 20], [40, 20], [40, 40], [0, 40]]          # an L: the top right quarter is outside
    r = site_plan.Router(ring, 1.0, [[35, 35], [15, 5]])
    pts = r.route([35, 35], [15, 5])
    assert pts and all(abs(a[0] - b[0]) < 1e-9 or abs(a[1] - b[1]) < 1e-9 for a, b in zip(pts, pts[1:]))
    assert all(seg_inside(a, b, ring, 40) for a, b in zip(pts, pts[1:]))
    assert len(pts) == 3 and pts[1] == [15, 35]                                     # the one L that stays inside


def test_slab_and_crawl_houses_route_on_the_first_floor(env):
    for year in (1960, 1995):                                                       # NJ: crawlspace before 1970, slab after
        for st in (1, 2):
            res = invented(env, [(0, 0), (14, 0), (14, 4), (18, 4), (18, 10), (0, 10)], 25, st, 1800, year, 3, True, state='NJ')
            card = card_of(res)
            assert card['house']['foundation'] in ('slab', 'crawl') and not house_problems(card), house_problems(card)[:5]
            first = next(f for f in card['floors'] if f['id'] == 'first')
            assert {'water', 'drain'} <= {r['kind'] for r in first['runs']}


# ---------------------------------------------------------------- 200+ generated outlines

def gen_ring(rng):
    """A seeded rectilinear outline of 4 to 12 corners, house sized: a rectangle with notches and wings, metres."""
    W, D = rng.uniform(7, 22), rng.uniform(6, 14)
    pts = [(0, 0), (W, 0), (W, D), (0, D)]
    shape = rng.choice(['rect', 'L', 'T', 'U', 'notch', 'step'])
    if shape == 'L':
        a, b = rng.uniform(0.3, 0.7) * W, rng.uniform(0.3, 0.6) * D
        pts = [(0, 0), (a, 0), (a, b), (W, b), (W, D), (0, D)]
    elif shape == 'T':
        a, b, c = rng.uniform(0.15, 0.35) * W, rng.uniform(0.6, 0.85) * W, rng.uniform(3, 6)
        pts = [(0, 0), (W, 0), (W, D), (b, D), (b, D + c), (a, D + c), (a, D), (0, D)]
    elif shape == 'U' and W > 12:
        a, b, c = W * 0.3, W * 0.7, rng.uniform(2, 0.45 * D)
        pts = [(0, 0), (a, 0), (a, c), (b, c), (b, 0), (W, 0), (W, D), (0, D)]
    elif shape == 'notch':
        a, b, c = rng.uniform(0.2, 0.5) * W, rng.uniform(0.55, 0.8) * W, rng.uniform(1, 3)
        pts = [(0, 0), (a, 0), (a, -c), (b, -c), (b, 0), (W, 0), (W, D), (0, D)]
    elif shape == 'step':
        a, b = rng.uniform(0.3, 0.7) * W, rng.uniform(1.5, 4)
        pts = [(0, 0), (a, 0), (a, -b), (W, -b), (W, D), (a * 0.5, D), (a * 0.5, D + 2), (0, D + 2)]
    return pts


def test_two_hundred_generated_outlines(env, monkeypatch):
    rng = random.Random(20261123)
    faults, n, times = [], 0, []
    real = site_plan.dress_house

    def timed(*a, **k):
        t = time.perf_counter()
        out = real(*a, **k)
        times.append(time.perf_counter() - t)
        return out
    monkeypatch.setattr(site_plan, 'dress_house', timed)
    for k in range(210):
        pts = gen_ring(rng)
        st = rng.choice([1, 1, 2, 2])
        area = abs(site_geo.ring_signed_area([list(p) for p in pts])) * 10.7639
        res = invented(env, pts, rng.uniform(-180, 180), st, int(area * st * 0.9), rng.choice([1925, 1955, 1975, 1995, 2010]),
                       rng.randint(1, 5), rng.random() < 0.4, issue=rng.choice(list(ISSUES.values())), state=rng.choice(['PA', 'PA', 'NJ']))
        card = card_of(res)
        assert res['status'] == 'found'
        if card['building']['kind'] != 'house':
            continue
        n += 1
        faults += [f'shape {k}: {p}' for p in house_problems(card)]
    assert n >= 200 and not faults, (n, faults[:8])
    times.sort()
    assert times[len(times) // 2] < 0.015 and times[-1] < 0.030, (times[len(times) // 2], times[-1])


# ---------------------------------------------------------------- R10: same input, same card; the time it adds

def test_same_input_same_card(env):
    h = SHAPES['big_slab_2st']
    a = invented(env, h['pts'], h['rot'], h['st'], h['sqft'], h['year'], h['beds'], h['garage'], h['street'])
    b = invented(env, h['pts'], h['rot'], h['st'], h['sqft'], h['year'], h['beds'], h['garage'], h['street'])
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    c, d = recorded(env, 'nj_full'), recorded(env, 'nj_full')
    assert json.dumps(c, sort_keys=True) == json.dumps(d, sort_keys=True)


def test_the_plan_adds_under_30_ms_a_card(env, monkeypatch):
    times = []
    real_h, real_l = site_plan.dress_house, site_plan.large_card

    def wrap(fn):
        def f(*a, **k):
            t = time.perf_counter()
            out = fn(*a, **k)
            times.append(time.perf_counter() - t)
            return out
        return f
    monkeypatch.setattr(site_plan, 'dress_house', wrap(real_h))
    monkeypatch.setattr(site_plan, 'large_card', wrap(real_l))
    for name, h in SHAPES.items():
        invented(env, h['pts'], h['rot'], h['st'], h['sqft'], h['year'], h['beds'], h['garage'], h['street'])
    for name in RECORDED:
        recorded(env, name)
    assert len(times) == 12 and max(times) < 0.030, times


# ---------------------------------------------------------------- R9: company-record cards keep their data byte for byte

def test_company_record_cards_are_unchanged():
    """The technicians' prepared answers (data/agent/prepared.json, built by views.py before this change) against the same
    answers built now: the floor sketch card and its map card are the same, byte for byte."""
    import views
    with open(os.path.join(ROOT, 'data', 'agent', 'prepared.json'), encoding='utf-8') as f:
        stored = json.load(f)['roles']
    seen = 0
    with views.frozen_today():
        for rid, p in stored.items():
            fs = next((c for c in p.get('cards') or [] if c.get('kind') == 'floor_sketch'), None)
            if not fs or not fs.get('example'):
                continue
            assert 'building' not in fs
            now = views.prepared(rid)
            fs2 = next(c for c in now['cards'] if c.get('kind') == 'floor_sketch')
            assert json.dumps(fs2, sort_keys=True, separators=(',', ':'), ensure_ascii=False) == \
                json.dumps(fs, sort_keys=True, separators=(',', ':'), ensure_ascii=False), rid
            seen += 1
    assert seen >= 3


# ---------------------------------------------------------------- review fixes: classes, large facts, the service line, the stack

def test_building_kind_class_codes_and_office_words():
    fact = lambda k, v: {'k': k, 'label': 'x', 'v': v}
    m2 = 1500 / site_plan.SQFT_PER_M2
    for v in ('4C (apartments)', '6A (telephone business)', '5B (railroad)', '15F (other exempt)', '4B (industrial)'):
        assert site_plan.building_kind({'facts': [fact('property_class', v)]}, m2)['kind'] == 'large', v
    assert site_plan.building_kind({'facts': [fact('land_use', 'Office')]}, m2)['kind'] == 'large'
    assert site_plan.building_kind({'facts': [fact('land_use', 'Single family w/ home office')]}, m2)['kind'] == 'house'
    assert site_plan.building_kind({'facts': [fact('property_class', '2 (residential)')]}, m2)['kind'] == 'house'
    assert site_plan.building_kind({'facts': [fact('tax_exempt', 'Non-exempt')]}, m2)['kind'] == 'house'


def test_large_card_drops_house_facts_and_says_the_note_once(env):
    big = [(0, 0), (30, 0), (30, 16), (0, 16)]                 # 30 x 16 m: over 4,500 sq ft, so large
    card = card_of(invented(env, big, beds=5, garage=True))
    assert card['building']['kind'] == 'large'
    assert not [f for f in card['facts'] if f['k'] in ('beds', 'attached_garage')]
    for s in strings(card):
        assert not BANNED.search(s[1]), s
    texts = [card.get('house', {}).get('text') or '', card.get('source_line') or '', (card.get('layout') or {}).get('note') or '']
    assert sum(t.count(site_plan.LARGE_NOTE) for t in texts) == 1


def test_service_line_comes_in_at_a_wall_from_the_meter_outside(env):
    card = card_of(invented(env, [(0, 0), (13, 0), (13, 8.5), (0, 8.5)], issue='an electrical job, where are the wires'))
    ring = plan_ring_of(card)
    meter = [o for o in card['outside'] if o['kind'] == 'electric_meter']
    assert len(meter) == 1 and meter[0]['basis'] == 'likely'
    for fl in card['floors']:
        for r in fl['runs']:
            if r['kind'] != 'power':
                continue
            panel = next(i for i in fl['items'] if i['kind'] == 'panel')
            assert r['points'][-1] == [panel['x'], panel['y']]
            assert site_plan.wall_dist(r['points'][0], ring) <= site_plan.ROUTE_IN + 0.2      # it starts at the wall


def test_fixture_notes_fit_the_room_and_risers_sit_in_wet_rooms(env):
    card = card_of(invented(env, [(0, 0), (13, 0), (13, 8.5), (0, 8.5)], st=2, beds=3))
    notes = {}
    for fl in card['floors']:
        for it in fl['items']:
            if it['kind'] == 'fixture_shutoffs':
                kind = next(r['kind'] for r in fl['rooms'] if r['label'] == it['room'])
                notes.setdefault(kind, set()).add(it['note'])
    assert notes.get('kitchen') == {'Under the sink'}
    assert 'behind each toilet' not in json.dumps(card)
    first = next(f for f in card['floors'] if f['id'] == 'first')
    for r in first['runs']:
        for x, y, _ in r.get('risers') or []:
            room = site_plan.room_of(first['rooms'], (x, y))
            assert room and room['kind'] in ('kitchen', 'bath', 'laundry'), (r['kind'], room and room['label'])
