"""
Tests for server/site_sources.py (public-record adapters for a live address) and property.lookup_record.

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q tests/test_site_sources.py

The contract fixtures in tests/fixtures/site/ were recorded from real calls against public buildings
(fixtures/site/record_fixtures.py). Here the network is stubbed: property._get_json is replaced by a replayer that answers
each request from the recorded calls, so no test below reaches a server. One optional test calls the live services, against
Trenton City Hall only:  SITE_LIVE_TEST=1 python -m pytest -q tests/test_site_sources.py -k live
"""

import datetime
import importlib.util
import json
import os
import re
import sys

import httpx
import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(SERVER_DIR, 'tests', 'fixtures', 'site')
sys.path.insert(0, SERVER_DIR)
sys.path.insert(0, os.path.join(SERVER_DIR, 'tests'))

import property as homes          # noqa: E402  (never a bare "import property")
import site_sources as S          # noqa: E402
from test_property import db      # noqa: E402,F401  (the module-scoped home-sales fixture database)

FIVE = ['nj_full', 'pa_york_full', 'pa_lancaster_outline_only', 'town_only', 'choose']
ALL = FIVE + ['pa_franklin_full']


def load(name):
    with open(os.path.join(FIX, name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def recorder_module():
    spec = importlib.util.spec_from_file_location('record_fixtures', os.path.join(FIX, 'record_fixtures.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def norm(params):
    return json.dumps({k: str(v) for k, v in params.items()}, sort_keys=True)


class Replay:
    """Stands in for property._get_json: answers each request from recorded calls. Records every call and its timeout."""

    def __init__(self, calls):
        self.calls, self.seen = calls, []

    def __call__(self, url, params, timeout=None):
        self.seen.append((url, dict(params), timeout))
        for c in self.calls:
            if c['url'] == url and norm(c['params']) == norm(params):
                if 'error' in c:
                    raise httpx.ReadTimeout('recorded timeout')
                return json.loads(json.dumps(c['response']))
        raise AssertionError(f'unrecorded request: {url} {params}')


class Raiser:
    def __init__(self, exc):
        self.exc, self.n = exc, 0

    def __call__(self, url, params, timeout=None):
        self.n += 1
        raise self.exc


@pytest.fixture()
def frozen(monkeypatch):
    def at(date):
        d = datetime.date.fromisoformat(date)
        monkeypatch.setattr(S, '_today', lambda: d)
    return at


def scenario(rec, name):
    return next(s for s in rec.SCENARIOS if s['name'] == name)


# ---------------------------------------------------------------- the fixtures themselves

def test_the_five_contract_fixtures_exist_with_their_parts():
    for n in FIVE:
        fx = load(n)
        assert fx['name'] == n and fx['typed'] and fx['calls'] and fx['map_command']
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', fx['recorded'])
    assert {load(n)['status'] for n in FIVE} == {'found', 'town_only', 'choose'}
    for n in ('nj_full', 'pa_york_full', 'pa_lancaster_outline_only'):
        assert load(n)['card']['kind'] == 'floor_sketch'
    assert load('town_only')['card'] is None and load('choose')['card'] is None


def test_recorded_requests_name_a_whitelist_and_never_a_blocked_field():
    for n in ALL:
        for c in load(n)['calls']:
            of = c['params'].get('outFields')
            if 'arcgis' in c['url'] or 'ycpc' in c['url'] or 'franklincountypa' in c['url']:
                assert of and of != '*', (n, c['url'])
            if of:
                assert not [f for f in of.split(',') if S.blocked_key(f)], (n, of)
            if 'data.nj.gov' in c['url']:
                assert not any(S.blocked_key(f) for f in c['params']['$select'].split(','))


def test_no_owner_or_price_key_in_any_recorded_response():
    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                assert not S.blocked_key(k) or k == 'outFields', (path, k)
                walk(v, path + [k])
        elif isinstance(o, list):
            for v in o:
                walk(v, path)
    for n in ALL:
        walk(load(n)['calls'], [n])


def test_requests_use_the_short_timeout():
    rp = Replay(load('nj_full')['calls'])
    homes_get = homes._get_json
    try:
        homes._get_json = rp
        S.geocode(load('nj_full')['typed'])
    finally:
        homes._get_json = homes_get
    assert rp.seen and all(t == 2.5 for _, _, t in rp.seen)


# ---------------------------------------------------------------- replay: same calls, same answers

@pytest.mark.parametrize('name', ALL)
def test_replay_gives_the_recorded_adapter_output(name, monkeypatch, frozen):
    fx = load(name)
    rec = recorder_module()
    frozen(fx['recorded'])
    rp = Replay(fx['calls'])
    monkeypatch.setattr(homes, '_get_json', rp)
    got = rec.run(scenario(rec, name))
    assert got['status'] == fx['status']
    assert json.loads(json.dumps(got['adapters'])) == fx['adapters']
    assert len(rp.seen) == len(fx['calls'])
    if fx['card']:                  # the new fields; floors and items follow the shared rules files, which other lanes regenerate
        for k in ('place', 'building', 'facts', 'sources', 'front_basis'):
            assert json.loads(json.dumps(got['card'][k])) == fx['card'][k], k
    assert json.loads(json.dumps(got['map_command'])) == fx['map_command']


# ---------------------------------------------------------------- what each fixture says

def test_nj_full_parcel_facts_permits_outline_and_ground():
    a = load('nj_full')['adapters']
    assert a['geocode']['status'] == 'found' and a['geocode']['matches'][0]['precision'] == 'typed'
    (p,) = a['parcels']['parcels']
    assert p['match'] == 'exact' and p['id']['muni_code'] == '1508' and p['id']['block'] == '663' and p['id']['lot'] == '1'
    facts = {f['k']: f['v'] for f in p['facts']}
    assert all(set(f) <= {'k', 'label', 'v', 'basis', 'src', 'source', 'as_of', 'date_kind', 'note'} for f in p['facts'])
    assert facts['stories'] == 2 and facts['floor_area_sqft'] == 15226 and facts['facility'] == 'TOWN HALL'
    assert 'year_built' not in facts                      # YR_CONSTR is 0 on this row: no year is invented
    assert len(p['ring_ll']) >= 4 and p['ring_ll'][0] == p['ring_ll'][-1]
    assert a['footprints']['query'] == 'parcel' and a['footprints']['buildings']
    assert all(b['as_of'] and b['date_kind'] == 'imagery' and b['height_checked'] is False for b in a['footprints']['buildings'])
    assert a['permits']['ok'] and all(re.fullmatch(r'\d{4}-\d{2}-\d{2}', x['date']) for x in a['permits']['permits'])
    assert a['elevation']['fact']['k'] == 'ground_elevation_m' and 0 < a['elevation']['fact']['v'] < 50


def test_york_reads_the_commercial_record_when_the_house_fields_are_empty():
    (p,) = load('pa_york_full')['adapters']['parcels']['parcels']
    facts = {f['k']: f for f in p['facts']}
    assert facts['year_built']['v'] == 2005 and facts['year_built']['note'] == 'commercial building record'
    assert facts['floor_area_sqft']['v'] == 120389 and 'living_area_sqft' not in facts
    assert p['building_facts'] is True and p['codes'] == {'COMM_STRUC': '354'}


def test_lancaster_publishes_no_building_facts():
    (p,) = load('pa_lancaster_outline_only')['adapters']['parcels']['parcels']
    assert p['building_facts'] is False
    assert not {'year_built', 'living_area_sqft', 'floor_area_sqft', 'stories'} & {f['k'] for f in p['facts']}
    card = load('pa_lancaster_outline_only')['card']
    assert card['building']['storeys']['basis'] == 'likely' and card['house']['year_basis'] == 'likely'
    assert card['building']['footprint']['basis'] == 'public' and card['building']['footprint']['as_of'] == '2010-08-17'


def test_town_only_finds_the_town_and_not_the_house():
    fx = load('town_only')
    assert fx['adapters']['geocode']['status'] == 'not_found'
    assert fx['adapters']['parcels']['parcels'] == []
    (step,) = fx['map_command']['cmd']['steps']
    assert step['precision'] == 'town' and step['zoom'] <= 12.5 and step['label'] == 'Lititz, PA'
    assert 'outline' not in step


def test_choose_returns_every_lot_at_the_address_and_nothing_else():
    ps = load('choose')['adapters']['parcels']['parcels']
    assert len(ps) == 4 and {p['key'] for p in ps} == {'200 GEORGIA RD'} and {p['match'] for p in ps} == {'exact'}
    assert all(p['muni'] == 'FREEHOLD TWP' for p in ps)
    assert [p['distance_m'] for p in ps] == sorted(p['distance_m'] for p in ps)


# ---------------------------------------------------------------- the card and map command examples (contract for C1 to C4)

def test_card_examples_follow_the_basis_rules_and_size_limits():
    for n in ('nj_full', 'pa_york_full', 'pa_franklin_full', 'pa_lancaster_outline_only'):
        c = load(n)['card']
        b = c['building']
        assert c['basis'] == 'likely' and c['place']['precision'] == 'parcel' and c['place']['basis'] == 'public'
        assert len(b['footprint']['ring_m']) <= 48 and len(b['parcel']['ring_m']) <= 40
        assert b['footprint']['w_ft'] == c['floors'][0]['w'] and b['footprint']['d_ft'] == c['floors'][0]['h']
        assert b['height']['basis'] in ('public', 'likely') and b['storeys']['basis'] in ('public', 'likely')
        assert all(f['basis'] == 'public' and 1 <= f['src'] <= len(c['sources']) for f in c['facts'])
        for fl in c['floors']:
            assert all(i['basis'] == 'likely' for i in fl['items']) and all(r['basis'] == 'likely' for r in fl['runs'])
        text = json.dumps(c)
        assert '"record"' not in text
        assert not re.search(r'example|fictional|sandbox|owner', text, re.I)


def test_map_commands_use_kind_site_and_respect_the_zoom_ceilings():
    ceil = {'parcel': 19, 'typed': 16.5, 'town': 12.5}
    for n in ALL:
        cmd = load(n)['map_command']
        assert cmd['kind'] == 'map_command' and 1 <= len(cmd['cmd']['steps']) <= 12
        for st in cmd['cmd']['steps']:
            assert st['kind'] == 'site' and st['zoom'] <= ceil[st['precision']]
            assert abs(st['lat']) <= 85 and abs(st['lon']) <= 180
            assert 'example' not in st['label'].lower()
            if 'outline' in st:
                assert st['precision'] == 'parcel' and len(st['outline']) <= 48
                assert all(isinstance(x, float) and isinstance(y, float) for x, y in st['outline'])


# ---------------------------------------------------------------- privacy

@pytest.mark.parametrize('name', ['nj_full', 'pa_york_full', 'pa_franklin_full', 'pa_lancaster_outline_only'])
def test_owner_fields_never_reach_any_output(name, monkeypatch, frozen):
    poison = load('owner_poison')
    calls = poison['fixtures'][name]
    assert 'ZZTEST NAME' in json.dumps(calls)                # the poison is really in what the stub answers
    fx = load(name)
    rec = recorder_module()
    monkeypatch.setattr(rec, 'clean_response', lambda r: r)   # the recorder's own guard would stop here; test the adapters
    frozen(fx['recorded'])
    monkeypatch.setattr(homes, '_get_json', Replay(calls))
    got = rec.run(scenario(rec, name))
    out = json.dumps({k: got[k] for k in ('adapters', 'card', 'map_command')})
    assert 'ZZTEST' not in out and '999999' not in out
    for bad in ('OWNER', 'OWN_NAME', 'MAIL', 'PREV_OWNER', 'PROP_ADDR', 'SALE_PRICE'):
        assert bad not in out


def test_the_guard_drops_owner_mailing_buyer_seller_and_price_keys():
    for k in ('OWNER_NAME', 'OWN1', 'OWN2', 'OWN_NAME1', 'OWNER_FULL', 'FULL_OWNER', 'MAIL_ADDR1', 'MAILING_AD', 'PREV_OWNER', 'PREVIOUS_OWNER_1',
              'ST_ADDRESS', 'CITY_STATE', 'ZIP_CODE', 'ADDR1', 'CAREOF', 'buyer', 'seller', 'SLH_DEEDED', 'SHORT_NAME', 'SECOND_LIS',
              'MAD_MAIL_A', 'SALE_PRICE', 'PRICE', 'CONSIDERATION', 'OWNERADD1'):
        assert S.blocked_key(k), k
    for k in ('YRBLT', 'PROPADR', 'SITUS', 'SITUS_ZIP', 'DEEDED_ACRES', 'DEEDED_ACR', 'LAND_USE_DESC', 'YR_CONSTR', 'BLDG_DESC', 'ZIP5', 'PIN'):
        assert not S.blocked_key(k), k
    assert S.scrub({'PIN': '1', 'OWN1': 'ZZTEST NAME', 'MAIL_ADDR1': 'x'}) == {'PIN': '1'}
    assert S.scrub({'PIN': '1', 'YRBLT': 1950, 'SECRET_FIELD': 'x'}, ('PIN', 'YRBLT')) == {'PIN': '1', 'YRBLT': 1950}
    assert S.scrub(None) == {}


def test_whitelists_are_checked_against_the_guard_at_import(monkeypatch):
    monkeypatch.setitem(S.PA_COUNTIES, 'Bad', dict(S.PA_COUNTIES['York'], fields=('PIDN', 'OWN_NAME1')))
    with pytest.raises(RuntimeError):
        S._check_whitelists()


# ---------------------------------------------------------------- failures move down the ladder, never raise

ADAPTERS = [
    lambda: S.geocode('33 Washington St, Toms River, NJ 08753'),
    lambda: S.nj_parcels('33 WASHINGTON ST', county='Ocean'),
    lambda: S.nj_parcels_near('33 WASHINGTON ST', 39.95, -74.19),
    lambda: S.nj_permits('1508', '663', '1'),
    lambda: S.pa_parcels('York', '45 N GEORGE ST'),
    lambda: S.pa_parcels_near('Lancaster', '50 N DUKE ST', 40.04, -76.30),
    lambda: S.footprints(lat=40.04, lon=-76.30),
    lambda: S.elevation(40.04, -76.30),
]


@pytest.mark.parametrize('exc,kind', [(httpx.ReadTimeout('slow'), 'timeout'), (httpx.ConnectError('down'), 'timeout'),
                                      (httpx.HTTPStatusError('500', request=httpx.Request('GET', 'https://x.test'), response=httpx.Response(500)), 'http'),
                                      (ValueError('bad json'), 'payload')])
def test_every_adapter_reports_a_failure_instead_of_raising(exc, kind, monkeypatch):
    monkeypatch.setattr(homes, '_get_json', Raiser(exc))
    for fn in ADAPTERS:
        r = fn()
        assert r['ok'] is False and r['error'] == kind and r['src'] in S.SOURCES


@pytest.mark.parametrize('payload', [None, [], 'text', {'error': {'code': 400}}, {'features': 'x'}, {'result': None}])
def test_odd_payloads_never_raise(payload, monkeypatch):
    monkeypatch.setattr(homes, '_get_json', lambda url, params, timeout=None: payload)
    for fn in ADAPTERS:
        r = fn()
        assert isinstance(r, dict) and 'ok' in r


def test_bad_input_makes_no_call(monkeypatch):
    r = Raiser(AssertionError('no call expected'))
    monkeypatch.setattr(homes, '_get_json', r)
    assert S.geocode('')['error'] == 'bad_input'
    assert S.nj_parcels('MAIN ST')['error'] == 'bad_input'
    assert S.pa_parcels('York', 'GEORGE ST')['error'] == 'bad_input'
    assert S.pa_parcels('Philadelphia', '1 MAIN ST')['error'] == 'not_wired'
    assert S.nj_permits('1508', '', '1')['error'] == 'bad_input'
    assert S.footprints()['error'] == 'bad_input'
    assert S.elevation('x', None)['error'] == 'bad_input'
    assert r.n == 0


def test_footprint_query_shapes(monkeypatch):
    seen = []
    monkeypatch.setattr(homes, '_get_json', lambda url, params, timeout=None: seen.append(params) or {'features': []})
    small = [[-76.0, 40.0], [-76.0001, 40.0], [-76.0001, 40.0001], [-76.0, 40.0]]
    big = [[-76.0 + i * 1e-6, 40.0 + (i % 2) * 1e-6] for i in range(150)] + [[-76.0, 40.0]]
    assert S.footprints(ring_ll=small)['query'] == 'parcel'
    assert S.footprints(ring_ll=big)['query'] == 'envelope'
    assert S.footprints(ring_ll=big[:40] + [big[0]])['query'] == 'envelope'
    assert S.footprints(ring_ll=big[:39] + [big[0]])['query'] == 'parcel'
    assert S.footprints(lat=40.0, lon=-76.0, distance_m=25)['query'] == 'point'
    assert seen[0]['geometryType'] == 'esriGeometryPolygon' and seen[1]['geometryType'] == 'esriGeometryEnvelope'
    assert seen[4]['distance'] == 25 and seen[4]['units'] == 'esriSRUnit_Meter'
    assert len(seen[3]['geometry']) < 1500                  # the service refuses a GET much over 2,000 characters
    assert all('resultRecordCount' not in p and p['outFields'] == ','.join(S.STRUCTURE_FIELDS) for p in seen)


def test_elevation_no_data_value_is_not_a_fact(monkeypatch):
    monkeypatch.setattr(homes, '_get_json', lambda url, params, timeout=None: {'value': '-1000000'})
    assert S.elevation(40.0, -76.0) == {'ok': True, 'src': 'usgs_epqs', 'fact': None}


# ---------------------------------------------------------------- readers on synthetic rows (no real address)

def test_york_house_fields_and_undecoded_codes(monkeypatch, frozen):
    frozen('2026-11-23')
    row = {'PIDN': 'TEST-1', 'PROPADR': '12 TEST ST', 'CLASS': 'R', 'LUC': '101', 'STYLE': '05', 'NUM_STORIE': 2, 'RES_LIVING_AREA': 1840,
           'YRBLT': 1973, 'HEATSYS': '3', 'FUEL': '2', 'APRBLDG': 150000, 'OWN_NAME1': 'ZZTEST NAME', 'PREV_OWNER': 'ZZTEST NAME'}
    monkeypatch.setattr(homes, '_get_json', lambda url, params, timeout=None: {'features': [{'attributes': row, 'geometry': None}]})
    (p,) = S.pa_parcels('York', '12 TEST ST')['parcels']
    facts = {f['k']: f['v'] for f in p['facts']}
    assert facts == {'year_built': 1973, 'living_area_sqft': 1840, 'stories': 2, 'assessed_building': 150000, 'land_use': 'R / 101'}
    assert p['codes'] == {'STYLE': '05', 'FUEL': '2', 'HEATSYS': '3'}        # no code table: kept apart, never a fact
    assert 'ZZTEST' not in json.dumps(p) and p['ring_ll'] is None and p['centroid'] is None
    assert all(f['basis'] == 'public' and f['src'] == 'pa_york' and f['as_of'] == '2026-11-23' and f['date_kind'] == 'retrieved' for f in p['facts'])


def test_franklin_house_fields_and_zero_bedrooms(monkeypatch, frozen):
    frozen('2026-11-23')
    row = {'CONTROL_NUMBER': '1', 'FULL_SITUS_ADDR': '12 TEST STREET  CHAMBERSBURG PA 17201', 'REM_PRCL_LOCN_CITY': 'CHAMBERSBURG',
           'YEAR_BUILT': 1962, 'CNS_AREA_LIVING': 1500, 'CNS_STORIES': 1, 'CNS_STYLE_DESC': 'RANCH', 'CNS_BASEMENT': 'CRL',
           'HEAT_SOURCE': 'Electric', 'HEAT_DISTRIBUTION': 'Heat Pump', 'ATTACHED_GARAGE': 'YES', 'ATTACHED_GARAGE_AREA_SQFT': 400,
           'TOTAL_NUMBER_OF_BEDROOMS': 0, 'FULL_OWNER': 'ZZTEST NAME'}
    monkeypatch.setattr(homes, '_get_json', lambda url, params, timeout=None: {'features': [{'attributes': row}]})
    (p,) = S.pa_parcels('Franklin', '12 TEST ST', town='Chambersburg')['parcels']
    facts = {f['k']: f['v'] for f in p['facts']}
    assert facts['style'] == 'Ranch' and facts['heat_source'] == 'Electric' and facts['heat_distribution'] == 'Heat Pump'
    assert facts['attached_garage'] == 'yes' and facts['garage_area_sqft'] == 400 and 'beds' not in facts
    assert p['codes'] == {'CNS_BASEMENT': 'CRL'} and p['key'] == '12 TEST ST' and p['muni'] == 'Chambersburg'


def test_pa_town_preference_and_suffix_matching(monkeypatch, frozen):
    frozen('2026-11-23')
    rows = [{'SITUS_ADDR': '7 TEST ST', 'SITUS_CITY': 'ELSEWHERE', 'GEO_PIN': 'A'}, {'SITUS_ADDR': '7 TEST STREET', 'SITUS_CITY': 'LEBANON', 'GEO_PIN': 'B'},
             {'SITUS_ADDR': '7 TEST HILL RD', 'SITUS_CITY': 'LEBANON', 'GEO_PIN': 'C'}]
    monkeypatch.setattr(homes, '_get_json', lambda url, params, timeout=None: {'features': [{'attributes': r} for r in rows]})
    got = S.pa_parcels('Lebanon', '7 TEST ST', town='Lebanon')['parcels']
    assert [p['id']['county_pin'] for p in got] == ['B']
    assert [p['id']['county_pin'] for p in S.pa_parcels('Lebanon', '7 TEST ST')['parcels']] == ['A', 'B']


def test_nj_reader_keeps_a_facility_name_only_for_public_property(frozen):
    frozen('2026-11-23')
    home = S._nj_parcel({'PROP_CLASS': '2', 'FAC_NAME': 'SOMETHING', 'DWELL': 1, 'YR_CONSTR': 1973, 'BLDG_DESC': '2F2G       2240',
                         'PROP_LOC': '12 TEST AVENUE', 'OWNER_NAME': 'ZZTEST NAME'}, None, datetime.date(2026, 11, 23))
    facts = {f['k']: f['v'] for f in home['facts']}
    assert 'facility' not in facts and facts['dwelling_units'] == 1 and facts['year_built'] == 1973
    assert facts['stories'] == 2 and facts['material'] == 'frame' and facts['garage_cars'] == 2 and facts['floor_area_sqft'] == 2240
    assert home['key'] == '12 TEST AVE' and 'ZZTEST' not in json.dumps(home)
    future = S._nj_parcel({'PROP_CLASS': '2', 'YR_CONSTR': 2999}, None, datetime.date(2026, 11, 23))
    assert 'year_built' not in {f['k'] for f in future['facts']}


@pytest.mark.parametrize('desc,want', [
    ('2F2G       2240', {'stories': 2, 'material': 'frame', 'garage_cars': 2, 'floor_area_sqft': 2240}),
    ('3SM 78326SF', {'stories': 3, 'material': 'masonry', 'garage_cars': None, 'floor_area_sqft': 78326}),
    ('2SB       15226', {'stories': 2, 'material': 'brick', 'garage_cars': None, 'floor_area_sqft': 15226}),
    ('2.5SF 1800SF', {'stories': 2.5, 'material': 'frame', 'garage_cars': None, 'floor_area_sqft': 1800}),
    ('B3S 1976SF', {'stories': None, 'material': None, 'garage_cars': None, 'floor_area_sqft': 1976}),
    ('1976 SF', {'stories': None, 'material': None, 'garage_cars': None, 'floor_area_sqft': 1976}),
    ('PARK', {'stories': None, 'material': None, 'garage_cars': None, 'floor_area_sqft': None}),
    ('', {'stories': None, 'material': None, 'garage_cars': None, 'floor_area_sqft': None}),
])
def test_read_bldg_desc(desc, want):
    assert S.read_bldg_desc(desc) == want


def test_address_text_helpers():
    assert S.street_key('157 LINCOLN WAY EAST  CHAMBERSBURG PA 17201') == '157 LINCOLN WAY E'
    assert S.street_key('313 W MARKET ST STE 6302') == '313 W MARKET ST'
    assert S.match_level('200 GEORGIA RD', '200 GEORGIA RD') == 'exact'
    assert S.match_level('1 MUNICIPAL PLAZA', '1 MUNICIPAL PL') == 'street'
    assert S.match_level('200 GEORGIA RD', '200 GEORGIA TAVERN RD') == ''
    assert S.match_level('200 GEORGIA RD', '200 GEORGIA RD REAR') == ''
    assert S.like_prefix('12 N MAIN ST') == '12 N MAIN' and S.like_prefix('45 N GEORGE ST') == '45 N GEORGE'
    assert S.like_prefix('157 LINCOLN WAY E') == '157 LINCOLN' and S.like_prefix('MAIN ST') is None
    assert S._sql("O'BRIEN; DROP") == 'OBRIEN DROP'


def test_town_point_from_the_zip_table():
    p = S.town_point(zip='17543')['place']
    assert p['label'] == 'Lititz, PA 17543' and p['precision'] == 'town' and p['county'] == 'Lancaster' and abs(p['lat'] - 40.18) < 0.05
    assert S.town_point(town='Lititz', state='PA')['place']['zip'] == '17543'
    assert S.town_point(zip='00000')['status'] == 'not_found'


def test_source_entries_cover_every_source():
    for sid in S.SOURCES:
        e = S.source_entry(sid, '2026-11-23')
        assert e['title'] and e['publisher'] and e['url'].startswith('https://') and e['date'] == '2026-11-23'


# ---------------------------------------------------------------- property.lookup_record (local sales table, no network)

@pytest.fixture()
def recs(db, monkeypatch):
    monkeypatch.setattr(homes, 'DB_PATH', db['path'])
    homes.reset()
    net = Raiser(AssertionError('lookup_record must not call the network'))
    monkeypatch.setattr(homes, '_get_json', net)
    yield homes
    homes.reset()
    assert net.n == 0


def test_lookup_record_found_with_coordinates_and_no_price(recs):
    r = recs.lookup_record({'address': '317 Barcelona Drive, Toms River, NJ 08753'})
    assert r['status'] == 'found' and r['match'] == 'exact'
    rec = r['record']
    assert rec['lat'] == 39.9 and rec['lon'] == -74.1 and rec['year_built'] == 1973 and rec['sqft'] == 2240
    assert rec['parcel'] == {'muni_code': '1508', 'block': '442.31', 'lot': '1', 'qual': None}
    assert rec['last_sale_date'] == '2026-05-12' and rec['source']['publisher'] == 'NJ Division of Taxation'
    assert 'price' not in rec and '600000' not in json.dumps(r)


def test_lookup_record_pa_has_a_county_pin_and_never_a_name(recs):
    r = recs.lookup_record({'address': '1800 Lambs Gap Road', 'municipality': 'Hampden Township', 'state': 'PA'})
    assert r['status'] == 'found' and r['record']['parcel'] == {'county_pin': 'P801'} and r['record']['beds'] == 3
    assert 'ZZYZX' not in json.dumps(r) and 'SECRETNAME' not in json.dumps(r)


def test_lookup_record_choose_then_pick(recs):
    r = recs.lookup_record({'address': '4901 Harbor Beach Blvd', 'zip': '08203'})
    assert r['status'] == 'choose' and len(r['choose']) == 3
    assert all(re.fullmatch(r'rec-[0-9a-f]{10}', c['key']) for c in r['choose'])
    assert not any(re.search(r'\d+/\d+|C00|block|lot', c['label'], re.I) for c in r['choose'])
    one = recs.lookup_record({'address': '4901 Harbor Beach Blvd', 'zip': '08203', 'pick': r['choose'][0]['key']})
    assert one['status'] == 'found' and one['record']['key'] == r['choose'][0]['key']
    assert recs.lookup_record({'address': '4901 Harbor Beach Blvd', 'zip': '08203', 'pick': 'rec-0000000000'})['status'] == 'not_found'
    unit = recs.lookup_record({'address': '4901 Harbor Beach Blvd Unit A7', 'zip': '08203'})
    assert unit['status'] == 'found' and unit['record']['sales_held'] == 2


def test_lookup_record_misses(recs):
    assert recs.lookup_record({'address': '1 Nowhere Lane, Toms River, NJ'})['status'] == 'not_found'
    assert recs.lookup_record({'address': 'Ocean Avenue'})['status'] == 'bad_address'
    assert recs.lookup_record({'address': '317 Barcelona Drive', 'municipality': 'Not A Town', 'state': 'NJ'})['status'] == 'found'


def test_lookup_record_without_a_database(monkeypatch, tmp_path):
    monkeypatch.setattr(homes, 'DB_PATH', str(tmp_path / 'missing.sqlite'))
    homes.reset()
    try:
        assert homes.lookup_record({'address': '317 Barcelona Drive'})['status'] == 'unavailable'
    finally:
        homes.reset()


# ---------------------------------------------------------------- live (opt-in; one public building)

@pytest.mark.skipif(os.environ.get('SITE_LIVE_TEST') != '1', reason='set SITE_LIVE_TEST=1 to call the public services')
def test_live_trenton_city_hall():
    g = S.geocode('319 E State St, Trenton, NJ 08608')
    assert g['ok'] and g['status'] == 'found'
    m = g['matches'][0]
    p = S.nj_parcels(S.street_key('319 E State St'), county='Mercer', town='Trenton', near=(m['lat'], m['lon']))
    assert p['ok'] and p['parcels'] and p['parcels'][0]['id']['block'] == '301'
    assert {f['k'] for f in p['parcels'][0]['facts']} >= {'year_built', 'stories'}
    f = S.footprints(ring_ll=p['parcels'][0]['ring_ll'])
    assert f['ok'] and f['buildings']
    e = S.elevation(m['lat'], m['lon'])
    assert e['ok'] and e['fact'] and 0 < e['fact']['v'] < 60
    assert 'OWNER' not in json.dumps([g, p, f, e])
