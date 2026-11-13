"""
Tests for server/property.py (the new_homeowners and property_brief tools) and scripts/build_homes_db.py.

  cd server && python3 -m pytest -q tests/test_property.py

A small home-sales fixture is written in the portal's columnar format, built into a SQLite file by
the real build script, and queried through the real module. Network calls are replaced by a fake.
One optional test calls the live New Jersey services:  PROPERTY_LIVE_TEST=1 python3 -m pytest -q tests/test_property.py
"""

import datetime
import importlib.util
import json
import os
import re
import sqlite3
import sys

import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SERVER_DIR)
sys.path.insert(0, SERVER_DIR)

import property as homes   # noqa: E402  (never a bare "import property": it would hide the built-in)

TODAY = datetime.date(2026, 11, 12)
NJ_COLS = ['id', 'addr', 'arms_length', 'beds', 'block_lot', 'builder_flag', 'buyer', 'county', 'geo_precision', 'lat', 'lon', 'muni',
           'new_construction', 'nu_code', 'price', 'retrieved', 'sale_date', 'seller', 'source', 'source_url', 'sqft', 'state',
           'use_code_raw', 'use_type', 'year_built', 'zip']
PA_COLS = ['id', 'addr', 'arms_length', 'beds', 'builder_flag', 'buyer', 'county', 'deed_ref', 'geo_precision', 'lat', 'lon', 'muni',
           'parcel_id', 'price', 'retrieved', 'sale_date', 'sale_type_raw', 'seller', 'source', 'source_url', 'sqft', 'state',
           'use_code_raw', 'use_type', 'year_built', 'zip']
PB_COLS = [c for c in PA_COLS if c not in ('deed_ref', 'parcel_id', 'sale_type_raw')]
ENUM_COLS = ('county', 'geo_precision', 'muni', 'retrieved', 'sale_date', 'source', 'source_url', 'state', 'use_code_raw', 'use_type', 'zip')
SECRET = 'ZZYZX SECRETNAME'          # stands in for a buyer or seller name; it must never reach the database or an answer


def columnar(cols, items, meta, empty_enums=()):
    """Encode dict rows the way data/sales/*.json is encoded: enum columns hold indexes, the rest hold values."""
    enums = {c: sorted({i[c] for i in items if i.get(c) is not None}) for c in cols if c in ENUM_COLS}
    for c in empty_enums:
        enums[c] = []                # the New Jersey file carries empty enum lists for beds, buyer and seller
    rows = [[(enums[c].index(i[c]) if enums.get(c) and i.get(c) is not None else i.get(c)) for c in cols] for i in items]
    return {'format': 'columnar', 'meta': meta, 'cols': cols, 'enums': enums, 'rows': rows}


def nj_row(n, date, addr, muni='Toms River Twp', code='1508', block_lot=None, price=400000, yb=1970, arms=True, use='residential',
           cls='NJ class 2', newc=False, zip_='08753', county='Ocean', sqft=1500):
    return {'id': f'NJ-{code}-{n}', 'addr': addr, 'arms_length': arms, 'beds': None, 'block_lot': block_lot or f'{100 + n}/{n}', 'builder_flag': None,
            'buyer': None, 'county': county, 'geo_precision': 'parcel_centroid', 'lat': 39.9, 'lon': -74.1, 'muni': muni, 'new_construction': newc,
            'nu_code': None, 'price': price, 'retrieved': '2026-09-24', 'sale_date': date, 'seller': None, 'source': 'NJ Taxation SR1A',
            'source_url': 'https://example.test/nj.zip', 'sqft': sqft, 'state': 'NJ', 'use_code_raw': cls, 'use_type': use, 'year_built': yb, 'zip': zip_}


def pa_row(n, date, addr, county='York', muni='SPRINGETTSBURY TWP', price=250000.0, yb=1960, beds=None, zip_='17402', use='residential', arms=None,
           builder=False):
    return {'id': f'PA-{n}', 'addr': addr, 'arms_length': arms, 'beds': beds, 'builder_flag': builder, 'buyer': SECRET, 'county': county, 'deed_ref': '1-2',
            'geo_precision': 'parcel_centroid', 'lat': 39.98, 'lon': -76.7, 'muni': muni, 'parcel_id': f'P{n}', 'price': price, 'retrieved': '2026-09-24',
            'sale_date': date, 'sale_type_raw': None, 'seller': SECRET + ' SELLER', 'source': f'{county} parcels', 'source_url': f'https://example.test/{county}',
            'sqft': 1400, 'state': 'PA', 'use_code_raw': 'CLASS=R', 'use_type': use, 'year_built': yb, 'zip': zip_}


@pytest.fixture(scope='module')
def db(tmp_path_factory):
    d = tmp_path_factory.mktemp('homes')
    src = d / 'sales'
    src.mkdir()
    nj, n = [], 0
    for ym, count in (('2025-12', 30), ('2026-01', 30), ('2026-02', 30), ('2026-03', 30), ('2026-04', 30), ('2026-05', 30), ('2026-06', 5)):
        for i in range(count):
            n += 1
            nj.append(nj_row(n, f'{ym}-{(i % 27) + 1:02d}', f'{n} OCEAN AVENUE', yb=1950 + (n % 60)))
    nj += [
        nj_row(901, '2026-05-12', '317 BARCELONA DRIVE', block_lot='442.31/1', price=600000, yb=1973, sqft=2240),
        nj_row(902, '2026-05-13', '9 OLDEST LANE', yb=1801),
        nj_row(903, '2026-05-14', '11 FAMILY DEED RD', arms=False, price=1, yb=1700),                       # not a market sale
        nj_row(904, '2026-05-15', '12 SHOP STREET', use='commercial', cls='NJ class 4A', yb=1705),           # not a home
        nj_row(905, '2026-05-16', '13 APARTMENT BLDG WAY', cls='NJ class 4C/029', yb=1710),                  # apartment building
        nj_row(906, '2026-05-17', '14 BRAND NEW CT', yb=2026, newc=True),
        nj_row(907, '2026-05-18', '77 EAST WATER STREET #21', block_lot='669/43 C0121', yb=1988),
        nj_row(908, '2026-05-19', '77 EAST WATER STREET #12', block_lot='669/43 C0112', yb=1988),
        nj_row(909, '2026-05-20', '5 SHORE RD', muni='Brick Twp', code='1507', zip_='08723', yb=1965),
        nj_row(910, '2026-05-21', '12 MAIN ST', muni='Matawan Boro', code='1331', county='Monmouth', zip_='07747', yb=1925),
        # a condo building: one street address, a lot per unit (unit A7 sold twice), and no unit in the address
        nj_row(920, '2026-04-10', '4901 HARBOR BEACH BLVD', muni='Brigantine City', code='0103', county='Atlantic', zip_='08203', yb=1968,
               block_lot='4700/140.07 C00A7', price=215000, sqft=685),
        nj_row(921, '2026-04-09', '4901 HARBOR BEACH BLVD', muni='Brigantine City', code='0103', county='Atlantic', zip_='08203', yb=1968,
               block_lot='4700/140.200 C00P8', price=210000, sqft=685),
        nj_row(922, '2026-04-01', '4901 HARBOR BEACH BLVD', muni='Brigantine City', code='0103', county='Atlantic', zip_='08203', yb=1968,
               block_lot='4700/140.161 C0055', price=230000, sqft=685),
        nj_row(923, '2026-01-15', '4901 HARBOR BEACH BLVD', muni='Brigantine City', code='0103', county='Atlantic', zip_='08203', yb=1968,
               block_lot='4700/140.07 C00A7', price=199000, sqft=685),
        nj_row(930, '2026-03-29', '309 MANAPAQUA AVE', muni='Lakehurst Boro', code='1514', zip_='08733', yb=1945, block_lot='56/3'),   # a town with no permit rows
        nj_row(931, '2026-03-30', '8 PADDED LOT RD', muni='Berkeley Twp', code='1506', zip_='08721', yb=1975, block_lot='1066.02/4'),
    ]
    pa, n = [], 0
    for ym, count in (('2026-02', 30), ('2026-03', 30), ('2026-04', 30), ('2026-05', 30), ('2026-06', 30), ('2026-07', 30), ('2026-08', 8)):
        for i in range(count):
            n += 1
            pa.append(pa_row(n, f'{ym}-{(i % 27) + 1:02d}', f'{n} MARKET ST', yb=1930 + (n % 80)))
    pa += [pa_row(801, '2026-07-30', '1800 LAMBS GAP ROAD', county='Cumberland', muni='HAMPDEN TOWNSHIP', price=350000, yb=1961, beds=3, zip_='17050'),
           pa_row(802, '2026-07-29', '12 MAIN ST', muni='NEW SALEM BORO', zip_='17408', yb=1900),
           pa_row(803, '2026-07-28', '645 ROCKWOOD DR', county='Lancaster', muni='MOUNT JOY TOWNSHIP', yb=None, zip_='17022')]
    # a street the county records with no house numbers: three lots in one deed, the same date and price on each
    pa += [pa_row(810 + i, '2026-06-12', 'EL VISTA DR', muni='WEST MANHEIM TWP', price=425000, yb=None, zip_='17331', use='land') for i in range(3)]
    pb = [{k: v for k, v in pa_row(700 + i, f'2025-0{6 if i < 25 else 7}-{(i % 27) + 1:02d}', f'{i} TALHELM ROAD CHAMBERSBURG PA 17202', county='Franklin',
                                   muni='Antrim Township', yb=1950 + i).items() if k in PB_COLS} for i in range(1, 30)]
    cov = lambda st, cos: [{'county': c, 'state': st, 'source': f'{c} source', 'source_url': f'https://example.test/{c}', 'date_from': '2025-09-01',
                            'date_to': '2026-09-01'} for c in cos]
    files = {'pp_sales_nj': columnar(NJ_COLS, nj, {'generated': '2026-09-24', 'coverage': cov('NJ', ['Ocean', 'Monmouth']), 'caveats': ['NJ lag caveat']},
                                     empty_enums=('beds', 'builder_flag', 'buyer', 'seller')),
             'pp_sales_pa_a': columnar(PA_COLS, pa, {'generated': '2026-09-24T19:27:23-04:00', 'coverage': cov('PA', ['York', 'Cumberland', 'Lancaster']),
                                                     'caveats': ['PA a caveat', 'York seller = PREV_OWNER (owner before the latest transfer).',
                                                                 f'QA 2026-09-24: spot check 1 MARKET ST OWNER_NAME={SECRET} matched the county page.',
                                                                 f'Spot check: 2 MARKET ST buyer={SECRET} matched.']}),
             'pp_sales_pa_b': columnar(PB_COLS, pb, {'generated': '2026-09-24', 'coverage': cov('PA', ['Franklin']), 'caveats': ['Franklin lags']})}
    for name, j in files.items():
        (src / f'{name}.json').write_text(json.dumps(j))
    spec = importlib.util.spec_from_file_location('build_homes_db', os.path.join(ROOT, 'scripts', 'build_homes_db.py'))
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    out = str(d / 'homes.sqlite')
    meta, _ = build.build(out, str(src))
    return {'path': out, 'meta': meta, 'n': len(nj) + len(pa) + len(pb), 'src': str(src), 'build': build}


class Net:
    """Stands in for property._get_json. Records every call."""

    def __init__(self, parcels=None, permits=None, fail=False, town_rows=500):
        self.parcels, self.permits, self.fail, self.town_rows, self.calls = parcels or [], permits or [], fail, town_rows, []

    def __call__(self, url, params, timeout=None):
        self.calls.append((url, dict(params)))
        if self.fail:
            raise TimeoutError('simulated timeout')
        if 'arcgis' in url:
            return {'features': [{'attributes': p} for p in self.parcels]}
        if str(params.get('$select', '')).startswith('count('):            # "does this municipality report at all"
            if self.town_rows is None:
                raise TimeoutError('simulated timeout')
            return [{'n': str(self.town_rows)}]
        return list(self.permits)

    def permit_calls(self):
        return [c for c in self.calls if 'data.nj.gov' in c[0] and not str(c[1].get('$select', '')).startswith('count(')]


PARCEL = {'PAMS_PIN': '1508_442.31_1', 'PCL_MUN': '1508', 'PCLBLOCK': '442.31', 'PCLLOT': '1', 'PCLQCODE': '', 'PROP_CLASS': '2', 'COUNTY': 'OCEAN',
          'MUN_NAME': 'TOMS RIVER TWP', 'PROP_LOC': '317 BARCELONA DRIVE', 'LAND_VAL': 123000, 'IMPRVT_VAL': 276200, 'NET_VALUE': 399200,
          'LAST_YR_TX': 7269.43, 'BLDG_DESC': '2F2G       2240', 'LAND_DESC': '110X150', 'CALC_ACRE': 0.3788, 'BLDG_CLASS': '16', 'YR_CONSTR': 1973,
          'DWELL': 1, 'DEED_DATE': '021105', 'SALE_PRICE': 199000, 'PCL_PBDATE': 1780549200000}


def permit(date, **fees):
    r = {'permitdate': date + 'T00:00:00.000', 'status': 'P', 'permittypedesc': 'Alteration', 'buildfee': '0', 'plumbfee': '0', 'electfee': '0',
         'firefee': '0', 'otherfee': '0', 'constcost': '1500', 'usegroup': 'R-5', 'processdate': '2022-10-07T00:00:00.000'}
    r.update({k: str(v) for k, v in fees.items()})
    return r


@pytest.fixture()
def mod(db, monkeypatch):
    monkeypatch.setattr(homes, 'DB_PATH', db['path'])
    monkeypatch.setattr(homes, '_today', lambda: TODAY)
    monkeypatch.setattr(homes, 'LIVE_ON', True)
    homes.reset()
    net = Net()
    monkeypatch.setattr(homes, '_get_json', net)
    yield homes, net
    homes.reset()


def ranked(text):
    return [ln for ln in text.split('\n') if re.match(r'^\d+\. ', ln) and '|' in ln]


# ---------------------------------------------------------------- the build

def test_build_holds_every_sale_and_no_names(db):
    con = sqlite3.connect(db['path'])
    assert con.execute('SELECT COUNT(*) FROM sales').fetchone()[0] == db['n']
    cols = [r[1] for r in con.execute('PRAGMA table_info(sales)')]
    assert 'buyer' not in cols and 'seller' not in cols and 'owner' not in cols
    for need in ('state', 'county', 'zip', 'addr', 'sale_date', 'price', 'year_built', 'sqft', 'beds', 'use_type', 'arms_length', 'new_construction',
                 'block_lot', 'lat', 'lon', 'source_id'):
        assert need in cols
    assert open(db['path'], 'rb').read().find(b'SECRETNAME') == -1          # no buyer or seller name anywhere in the file
    idx = {r[1] for r in con.execute("SELECT * FROM sqlite_master WHERE type='index'")}
    assert {'sales_addr', 'sales_period'} <= idx


def test_build_flags_and_decoding(db):
    con = sqlite3.connect(db['path'])
    con.row_factory = sqlite3.Row
    g = lambda a: con.execute('SELECT s.*, m.muni, m.code FROM sales s JOIN munis m ON m.id=s.muni_id WHERE s.addr=?', (a,)).fetchone()
    r = g('317 BARCELONA DRIVE')
    assert (r['state'], r['county'], r['muni'], r['code'], r['zip']) == ('NJ', 'Ocean', 'Toms River Twp', '1508', '08753')
    assert (r['sale_date'], r['ym'], r['price'], r['year_built'], r['sqft'], r['block_lot']) == ('2026-05-12', '2026-05', 600000, 1973, 2240, '442.31/1')
    assert (r['market'], r['home'], r['arms_length'], r['beds']) == (1, 1, 1, None)
    assert g('11 FAMILY DEED RD')['market'] == 0 and g('12 SHOP STREET')['home'] == 0 and g('13 APARTMENT BLDG WAY')['home'] == 0
    assert g('14 BRAND NEW CT')['new_construction'] == 1
    p = g('1800 LAMBS GAP ROAD')
    assert (p['state'], p['price'], p['beds'], p['arms_length'], p['market'], p['parcel_id'], p['block_lot']) == ('PA', 350000, 3, None, 1, 'P801', None)
    assert g('645 ROCKWOOD DR')['year_built'] is None
    src = con.execute('SELECT name, url FROM sources WHERE county=?', ('Cumberland',)).fetchone()
    assert tuple(src) == ('Cumberland source', 'https://example.test/Cumberland')


def test_build_meta_dense_months_and_caveats(db):
    m = db['meta']
    assert m['rows'] == db['n'] and re.match(r'^\d{4}-\d\d-\d\dT', m['built_at'])
    assert m['coverage']['state']['NJ']['dense_month'] == '2026-05'          # June has 5 sales: not a full month
    assert m['coverage']['state']['NJ']['latest_sale'].startswith('2026-06')
    assert m['coverage']['county']['PA|York']['dense_month'] == '2026-07'    # August has 8
    assert m['coverage']['county']['PA|Lancaster']['dense_month'] is None    # a single sale: partial coverage
    assert m['caveats']['pp_sales_nj'] == ['NJ lag caveat'] and m['caveats']['pp_sales_pa_b'] == ['Franklin lags']
    # the QA note and the note that quotes a name field are not copied; an ordinary note about the seller column is kept
    assert m['caveats']['pp_sales_pa_a'] == ['PA a caveat', 'York seller = PREV_OWNER (owner before the latest transfer).']

    assert m['rows_by_state']['NJ'] + m['rows_by_state']['PA'] == db['n']

def test_build_refuses_to_ship_a_name_in_its_notes(db, tmp_path):
    src = tmp_path / 'sales'
    src.mkdir()
    for name in ('pp_sales_nj', 'pp_sales_pa_a', 'pp_sales_pa_b'):
        j = json.load(open(os.path.join(db['src'], name + '.json')))
        if name == 'pp_sales_pa_a':
            j['meta']['caveats'] = [f'The first parcel checked belongs to {SECRET} SELLER.']      # a name the caveat filter cannot recognise
        (src / f'{name}.json').write_text(json.dumps(j))
    out = tmp_path / 'homes.sqlite'
    with pytest.raises(SystemExit, match='buyer or seller names'):
        db['build'].build(str(out), str(src))
    assert not out.exists() and not os.path.exists(str(out) + '.tmp')
    names = db['build'].name_leaks(sqlite3.connect(db['path']), {SECRET, SECRET + ' SELLER', 'SPRINGETTSBURY TWP'})
    assert names == []                                                       # the shipped fixture is clean; a town as buyer is not a person


def test_address_and_municipality_keys():
    k = homes.addr_key
    assert k('317 Barcelona Drive') == k('317 BARCELONA DR.') == '317 BARCELONA DR'
    assert k('77 East Water Street #21') == '77 E WATER ST' and homes.addr_split('77 East Water Street #21')[1] == '21'
    assert homes.addr_split('580 Patten Ave Unit 70') == ('580 PATTEN AVE', '70')
    assert k('1919 BAY BLVD-UNIT B37') == '1919 BAY BLVD'
    assert k('8435 TALHELM ROAD CHAMBERSBURG PA 17202') == '8435 TALHELM RD CHAMBERSBURG'
    assert k("12 O'Brien St; DROP TABLE sales") == '12 OBRIEN ST DROP TABLE SALES'
    mk = homes.muni_key
    assert mk('Toms River Twp') == 'TOMS RIVER' and mk('Atlantic City City') == 'ATLANTIC CITY' and mk('Neptune City Boro') == 'NEPTUNE CITY'
    assert mk('CARLISLE BORO 1ST WRD') == 'CARLISLE' and mk('HAMPDEN TOWNSHIP') == 'HAMPDEN'


# ---------------------------------------------------------------- tool schemas

def test_tool_definitions(mod):
    m, _ = mod
    assert m.ready() and m.info()['rows'] > 0
    defs = m.tool_definitions()
    assert [d['name'] for d in defs] == ['new_homeowners', 'property_brief']
    json.dumps(defs)
    for d in defs:
        assert d['input_schema']['type'] == 'object' and isinstance(d['input_schema']['properties'], dict) and len(d['description']) > 200
        assert 'names' in d['description'].lower()
    nh, pb = defs
    assert set(nh['input_schema']['properties']) >= {'state', 'county', 'municipality', 'zip', 'period', 'since', 'until', 'limit',
                                                     'exclude_new_construction', 'min_year_built', 'max_year_built'}
    assert nh['input_schema']['properties']['limit']['maximum'] == 100 and 'New homeowner' in nh['description']
    assert pb['input_schema']['required'] == ['address']
    for banned in ('playbook', 'platform', 'Tough Leaf', '@'):
        assert banned not in json.dumps(defs)


def test_not_ready_without_a_database(monkeypatch, tmp_path):
    monkeypatch.setattr(homes, 'DB_PATH', str(tmp_path / 'missing.sqlite'))
    homes.reset()
    assert homes.ready() is False and homes.info() == {}
    assert homes.run_new_homeowners({})[1] == [] and 'not available' in homes.run_property_brief({'address': '1 A St'})[0]
    homes.reset()


# ---------------------------------------------------------------- new_homeowners

def test_latest_reports_the_newest_full_month_per_state(mod):
    m, net = mod
    text, sources = m.run_new_homeowners({})
    assert len(text) <= 6000 and net.calls == []
    assert 'New Jersey May 2026' in text and 'Pennsylvania July 2026' in text
    assert 'Today is Nov 12, 2026' in text and 'not sales made this month' in text
    assert 'newest full month is May 2026 (6 months before today); newest recorded sale Jun 5, 2026.' in text
    assert 'runs months behind the sale date, and this copy was pulled on Sep 24, 2026.' in text            # the lag and the age of the copy
    assert 'three to four months' not in text and 'weeks behind' not in text
    assert 'Ranking rule: oldest recorded year built first' in text and 'New homeowner' in text
    rows = ranked(text)
    assert len(rows) == 25
    years = [int(re.search(r'built (\d{4})', r).group(1)) for r in rows]
    assert years == sorted(years) and years[0] == 1801                       # 9 OLDEST LANE; the 1700 family deed is left out
    for gone in ('FAMILY DEED', 'SHOP STREET', 'APARTMENT BLDG', SECRET):
        assert gone not in text
    assert sources and all(set(s) == {'title', 'url', 'publisher', 'date', 'kind'} for s in sources)
    assert any(s['publisher'] == 'NJ Division of Taxation' for s in sources)


def test_area_and_filters(mod):
    m, _ = mod
    text, _ = m.run_new_homeowners({'municipality': 'Toms River', 'period': 'latest', 'limit': 5})
    assert 'Toms River Twp, Ocean County, New Jersey' in text and len(ranked(text)) == 5 and 'Brick Twp' not in text and 'MARKET ST' not in text
    text, _ = m.run_new_homeowners({'area': {'state': 'NJ', 'municipality': 'Brick'}})
    assert 'Totals: 1 market home sales' in text and '5 SHORE RD' in text
    text, _ = m.run_new_homeowners({'zip': '08723'})
    assert '5 SHORE RD' in text and 'ZIP 08723' in text
    with_new, _ = m.run_new_homeowners({'state': 'NJ', 'min_year_built': 2020})
    assert '14 BRAND NEW CT' in with_new and 'likely new build' in with_new
    without, _ = m.run_new_homeowners({'state': 'NJ', 'filters': {'exclude_new_construction': True, 'min_year_built': 1960, 'max_year_built': 1970}})
    assert 'BRAND NEW' not in without and 'Likely new builds are left out' in without
    assert all(1960 <= int(re.search(r'built (\d{4})', r).group(1)) <= 1970 for r in ranked(without))
    text, _ = m.run_new_homeowners({'county': 'York County', 'since': '2026-08-01', 'until': '2026-08-31'})
    assert 'Aug 1, 2026 to Aug 31, 2026' in text and 'Totals: 8 market home sales' in text


def test_a_month_with_no_data_says_so_and_offers_the_latest(mod):
    m, _ = mod
    text, sources = m.run_new_homeowners({'state': 'NJ', 'period': '2026-10', 'limit': 3})
    assert text.startswith('No recorded market home sales for October 2026 in New Jersey.')
    assert 'have not published October 2026 yet' in text and 'Do not present it as this month' in text
    assert 'New Jersey May 2026' in text and len(ranked(text)) == 3 and sources
    text, _ = m.run_new_homeowners({'period': 'this month', 'county': 'York'})
    assert text.startswith('No recorded market home sales for November 2026 in York County, Pennsylvania.') and 'July 2026' in text
    partial, _ = m.run_new_homeowners({'state': 'NJ', 'period': '2026-06'})
    assert 'Not complete yet for this period: Ocean NJ' in partial and 'Totals: 5 market home sales' in partial
    text, sources = m.run_new_homeowners({'county': 'Lancaster'})
    assert 'No full month of sales is held for Lancaster County, Pennsylvania' in text and sources == []


def test_limits_bad_input_and_injection(mod, db):
    m, _ = mod
    big, _ = m.run_new_homeowners({'limit': 100000})
    assert len(big) <= 6000 and 25 < len(ranked(big)) <= 100
    assert len(ranked(m.run_new_homeowners({'limit': 'lots'})[0])) == 25
    text, sources = m.run_new_homeowners({'county': 'Bergen'})
    assert 'is not a county' in text and 'Ocean' in text and sources == []
    for bad in ({'state': "NJ' OR 1=1 --", 'municipality': "x'; DROP TABLE sales;--"}, {'zip': "08753' OR '1'='1"}, {'county': 'Ocean"; DELETE FROM sales'},
                {'period': "2026-05' OR 1=1"}, {'since': "2026-01-01'; DROP TABLE sales;--"}, {'limit': '5; DROP TABLE sales'}, {'area': ['a', {'b': 1}]},
                {'min_year_built': 'x', 'max_year_built': None, 'municipality': 12345}, {'limit': '1e999'}, {'limit': 'inf'}, {'limit': float('nan')},
                {'min_year_built': 'inf', 'max_year_built': '-1e999'}):
        text, _ = m.run_new_homeowners(bad)
        assert isinstance(text, str) and len(text) <= 6000 and '<' not in text
    assert sqlite3.connect(db['path']).execute('SELECT COUNT(*) FROM sales').fetchone()[0] == db['n']


# ---------------------------------------------------------------- property_brief

FACT_OK = re.compile(r'\[recorded|\[inferred|not in the record|could not be checked|come from the state parcel list|no entry')


def test_new_jersey_brief_with_parcel_and_permits(mod):
    m, net = mod
    net.parcels = [PARCEL]
    net.permits = [permit('2022-09-13', electfee=65), permit('2024-03-02', otherfee=120, plumbfee=40), permit('1113-11-11', buildfee=10),
                   permit('2925-08-15', buildfee=10)]
    text, sources = m.run_property_brief({'address': '317 Barcelona Dr.', 'municipality': 'Toms River', 'state': 'NJ'})
    assert len(text) <= 6000
    assert text.startswith('PROPERTY BRIEF: 317 BARCELONA DRIVE, Toms River Twp, Ocean County NJ 08753')
    assert 'Last recorded sale: May 12, 2026, $600,000' in text and 'Year built: 1973 [recorded: New Jersey home sales file, retrieved Sep 24, 2026]' in text
    assert 'Block and lot: 442.31 / 1' in text and 'Likely reading: 2 stories, frame, 2-car garage [inferred]' in text
    assert 'land $123,000, improvements $276,200, net $399,200' in text and 'published Jun 4, 2026' in text
    assert '2 permit records for this block and lot' in text and '1113' not in text and '2925' not in text      # impossible dates dropped
    assert 'Mar 2, 2024: alteration; plumbing fee $40, other fee $120' in text and 'may mean heating or cooling work [inferred]' in text
    facts = text.split('What the records say\n')[1].split('\n\nPermits')[0].split('\n')
    assert len(facts) >= 8 and all(FACT_OK.search(f) for f in facts), [f for f in facts if not FACT_OK.search(f)]
    for part in ('What to check on arrival', 'Possible offers (leads, not findings)', 'No permit on record is not proof that no work was done',
                 'No record shows where they are', 'Bought 6 months ago'):
        assert part in text
    offers = text.split('Possible offers (leads, not findings)\n')[1].split('\n\nLimits')[0].split('\n')
    assert len(offers) >= 3 and all('Evidence:' in o for o in offers)
    assert [s['title'] for s in sources] == ['New Jersey home sales file (Atlantic, Burlington, Monmouth and Ocean counties)',
                                             'New Jersey parcels and tax list', 'NJ Construction Permit Data']
    assert all(set(s) == {'title', 'url', 'publisher', 'date', 'kind'} for s in sources)
    # what was asked of the services: keyed by municipality code + block + lot, and never the owner fields
    (purl, pp), = [c for c in net.calls if 'arcgis' in c[0]]
    (surl, sp), = net.permit_calls()
    assert pp['where'] == "PCL_MUN='1508' AND PCLBLOCK='442.31' AND PCLLOT='1'" and 'OWNER' not in pp['outFields'] and 'ST_ADDRESS' not in pp['outFields']
    assert sp['$where'] == "treasurycode='1508' AND block in('442.31','00442.31','00442  31') AND lot in('1','00001')"      # every form the feed uses
    assert 'OWNER' not in text.upper().replace('HOMEOWNER', '').replace('OWNER NAMES ARE NOT HELD', '').replace('NEW OWNERS', '')


def test_never_states_where_equipment_is(mod):
    m, net = mod
    net.parcels, net.permits = [PARCEL], [permit('2023-01-05', electfee=50)]
    for a in ({'address': '317 Barcelona Drive', 'state': 'NJ'}, {'address': '1800 Lambs Gap Road', 'state': 'PA'}):
        text = m.run_property_brief(a)[0].lower()
        assert not re.search(r'\b(panel|water heater|pipes?|shut-off) (is|are) (located |found )?(in|on|at|under|behind|near)\b', text)
        assert 'basement' not in text and 'garage wall' not in text and 'crawl' not in text


def test_new_jersey_brief_survives_a_dead_network(mod):
    m, net = mod
    net.fail = True
    text, sources = m.run_property_brief({'address': '317 Barcelona Drive', 'municipality': 'Toms River'})
    assert 'Last recorded sale: May 12, 2026' in text and 'could not be checked just now' in text
    assert 'permit history is unknown' in text and len(net.calls) == 3      # parcel, permits and the town check, each failed
    assert [s['publisher'] for s in sources] == ['NJ Division of Taxation']


def test_live_lookups_can_be_switched_off(mod, monkeypatch):
    m, net = mod
    monkeypatch.setattr(m, 'LIVE_ON', False)
    text, _ = m.run_property_brief({'address': '317 Barcelona Drive'})
    assert net.calls == [] and 'live lookups are switched off' in text and 'Year built: 1973' in text


def test_pennsylvania_brief_is_local_only(mod):
    m, net = mod
    text, sources = m.run_property_brief({'address': '1800 Lambs Gap Rd', 'municipality': 'Hampden Township', 'state': 'PA'})
    assert net.calls == []
    assert text.startswith('PROPERTY BRIEF: 1800 LAMBS GAP ROAD, HAMPDEN TOWNSHIP, Cumberland County PA 17050')
    assert 'Pennsylvania has no public permit feed' in text and 'Bedrooms: 3 [recorded: Cumberland County property sales records' in text
    assert 'this county publishes no sale-validity code' in text and 'County parcel number: P801' in text
    assert 'Age: about 65 years [inferred from year built]' in text and 'Electrical panel and service evaluation' in text
    assert SECRET not in text and [s['publisher'] for s in sources] == ['Cumberland County, Pennsylvania']
    text, _ = m.run_property_brief({'address': '645 Rockwood Dr', 'area': 'Mount Joy, PA'})
    assert 'Year built: not in the record' in text and 'Ask the caller how old the home and each system are' in text


def test_unknown_addresses(mod):
    m, net = mod
    text, sources = m.run_property_brief({'address': '999 Nowhere Blvd', 'state': 'PA'})
    assert text.startswith('PROPERTY BRIEF: 999 NOWHERE BLVD\nNo record found for this address in Pennsylvania.') and sources == [] and net.calls == []
    assert 'No offer leads are given' in text and 'county assessor sites are not searched' in text
    text, sources = m.run_property_brief({'address': '999 Nowhere Blvd', 'area': 'Bayville, NJ'})     # a postal city, not a municipality
    assert 'No record found' in text and '"Bayville, NJ" is not a municipal name' in text and 'returned no match' in text
    assert len(net.calls) == 1 and "PROP_LOC LIKE '999 NOWHERE%'" in net.calls[0][1]['where']
    assert m.run_property_brief({'address': ''})[0].startswith('Give a street address')
    assert m.run_property_brief({'address': '12345'})[0].startswith('Give a street address')
    text, _ = m.run_property_brief({'address': "12 Robert'); DROP TABLE sales;-- St", 'state': 'NJ'})
    assert 'No record found' in text and "'" not in net.calls[-1][1]['where'].split('LIKE')[1].strip("'% ")


def test_new_jersey_address_with_no_sale_uses_the_parcel_list(mod):
    m, net = mod
    net.parcels = [dict(PARCEL, PROP_LOC='315 BARCELONA DRIVE', PCLLOT='2', PAMS_PIN='1508_442.31_2', BLDG_DESC='1F1G       1937', DEED_DATE='121016',
                        SALE_PRICE=305000)]
    text, sources = m.run_property_brief({'address': '315 Barcelona Drive', 'municipality': 'Toms River', 'state': 'NJ'})
    assert text.startswith('PROPERTY BRIEF: 315 BARCELONA DRIVE, Toms River Twp, Ocean County NJ')
    assert 'No sale from Dec 1, 2025 through Jun 5, 2026 is held for this address. A later purchase is not in the data yet.' in text
    assert 'Ask the caller when they bought the home. A purchase after Jun 5, 2026 is not in the data yet.' in text
    assert 'Year built: 1973 [recorded: NJ parcels and tax list' in text
    assert 'Last deed in the tax list: Oct 16, 2012, $305,000' in text and 'No permit matched this block and lot as written' in text
    assert net.calls[0][1]['where'] == "PCL_MUN='1508' AND PROP_LOC LIKE '315 BARCELONA%'"
    assert "treasurycode='1508'" in net.calls[1][1]['$where'] and "lot in('2','00002')" in net.calls[1][1]['$where']
    assert [s['title'] for s in sources] == ['New Jersey parcels and tax list', 'NJ Construction Permit Data']
    assert 'New-homeowner' not in text                                       # no recorded purchase, so no new-owner lead


def test_ambiguous_addresses_ask_for_more(mod):
    m, net = mod
    text, sources = m.run_property_brief({'address': '12 Main St'})
    assert 'More than one recorded address matches' in text and 'Matawan Boro' in text and 'NEW SALEM BORO' in text and sources == []
    text, _ = m.run_property_brief({'address': '12 Main St', 'municipality': 'Matawan'})
    assert text.startswith('PROPERTY BRIEF: 12 MAIN ST, Matawan Boro, Monmouth County NJ 07747')
    text, _ = m.run_property_brief({'address': '77 East Water Street', 'state': 'NJ'})
    assert 'More than one recorded address matches' in text and '#21' in text and '#12' in text
    net.parcels = [dict(PARCEL, PCLBLOCK='669', PCLLOT='43', PCLQCODE='C0121', PROP_LOC='77 E WATER ST')]
    text, _ = m.run_property_brief({'address': '77 East Water Street #21', 'state': 'NJ'})
    assert text.startswith('PROPERTY BRIEF: 77 EAST WATER STREET #21') and 'This is a unit in a shared lot' in text
    assert "PCLQCODE='C0121'" in [c for c in net.calls if 'arcgis' in c[0]][-1][1]['where']
    assert 'cannot be tied to this unit' in text


def test_address_with_the_town_in_one_string(mod):
    m, net = mod
    net.parcels = [PARCEL]
    text, _ = m.run_property_brief({'address': '317 Barcelona Drive, Toms River, NJ 08753'})
    assert text.startswith('PROPERTY BRIEF: 317 BARCELONA DRIVE, Toms River Twp') and 'No permit matched this block and lot as written' in text


def test_house_voice_rules_in_all_output(mod):
    m, net = mod
    net.parcels, net.permits = [PARCEL], [permit('2022-09-13', electfee=65)]
    outs = [m.run_new_homeowners({})[0], m.run_new_homeowners({'period': '2026-10'})[0], m.run_property_brief({'address': '317 Barcelona Drive'})[0],
            m.run_property_brief({'address': '1800 Lambs Gap Road'})[0], m.run_property_brief({'address': '1 Missing Rd', 'state': 'PA'})[0]]
    for t in outs:
        low = t.lower()
        for banned in ('playbook', 'platform', 'so what', 'tough leaf', '@', 'broad sky', SECRET.lower(), 'sr1a', 'mod-iv', 'w9se'):
            assert banned not in low, banned


# ---------------------------------------------------------------- review fixes

def test_period_words_and_dates_are_read_and_an_unreadable_period_says_so(mod):
    m, _ = mod
    for per in ('October 2026', 'Oct 2026', 'oct. 2026', '2026-10-15', '10/2026', 'Oct 15, 2026'):
        text, _ = m.run_new_homeowners({'state': 'NJ', 'period': per, 'limit': 2})
        assert text.startswith('No recorded market home sales for October 2026 in New Jersey.'), per
    text, _ = m.run_new_homeowners({'state': 'NJ', 'period': 'May 2026', 'limit': 2})
    assert 'Period: May 2026\n' in text and 'was not understood' not in text
    text, _ = m.run_new_homeowners({'state': 'NJ', 'period': 'the autumn <b>', 'limit': 2})
    assert text.startswith('The period "the autumn b" was not understood, so the latest full month is shown instead.') and 'New Jersey May 2026' in text
    for per in ('latest', '', None, 'Latest full month'):
        assert 'was not understood' not in m.run_new_homeowners({'state': 'NJ', 'period': per, 'limit': 2})[0]


def test_a_shared_address_is_never_merged_into_one_brief(mod):
    m, net = mod
    text, sources = m.run_property_brief({'address': '4901 Harbor Beach Blvd', 'municipality': 'Brigantine'})
    assert 'the sales records hold 3 separate lots at this address' in text and sources == [] and net.calls == []
    assert 'Last recorded sale:' not in text and 'Earlier recorded sales' not in text and 'Possible offers' not in text
    for part in ('unit code C00A7, block and lot 4700 / 140.07: last recorded sale Apr 10, 2026, $215,000', 'unit code C00P8', 'unit code C0055',
                 'for example "4901 HARBOR BEACH BLVD Unit A7"', 'Sales for Atlantic County are held'):
        assert part in text, part
    assert text.count('unit code C00A7,') == 1                               # one line per lot, not per sale
    # with the unit, the lot whose unit code matches is briefed, and only its own earlier sale is listed
    net.parcels = [dict(PARCEL, PCL_MUN='0103', PCLBLOCK='4700', PCLLOT='140.07', PCLQCODE='C00A7', PROP_LOC='4901 HARBOR BEACH BLVD')]
    text, _ = m.run_property_brief({'address': '4901 Harbor Beach Blvd Unit A7', 'municipality': 'Brigantine'})
    assert text.startswith('PROPERTY BRIEF: 4901 HARBOR BEACH BLVD, Brigantine City, Atlantic County NJ 08203')
    assert 'Last recorded sale: Apr 10, 2026, $215,000' in text and 'Earlier recorded sales here: Jan 15, 2026 $199,000 [' in text
    assert 'Block and lot: 4700 / 140.07 C00A7' in text and '$210,000' not in text and '$230,000' not in text
    assert "PCLLOT='140.07'" in net.calls[0][1]['where'] and "PCLQCODE='C00A7'" in net.calls[0][1]['where']
    text, _ = m.run_property_brief({'address': '4901 Harbor Beach Blvd #55', 'municipality': 'Brigantine'})
    assert 'Last recorded sale: Apr 1, 2026, $230,000' in text and 'Earlier recorded sales' not in text
    text, _ = m.run_property_brief({'address': '4901 Harbor Beach Blvd Unit 9', 'municipality': 'Brigantine'})
    assert 'No lot here has a unit code that matches unit 9.' in text and 'separate lots' in text
    # a street recorded with no house numbers: the same deed on three lots is three lots, not one sale and its history
    text, sources = m.run_property_brief({'address': 'El Vista Dr', 'municipality': 'West Manheim', 'state': 'PA'})
    assert 'hold 3 separate lots' in text and 'gives no house or unit number' in text and text.count('county parcel number P81') == 3
    assert 'Earlier recorded sales' not in text and sources == []


def test_every_brief_says_how_far_the_sales_data_reaches(mod):
    m, net = mod
    net.parcels = [PARCEL]
    text, _ = m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})
    head = text.split('What the records say')[0]
    assert 'Sales for Ocean County are held from Dec 1, 2025 through Jun 5, 2026 (records pulled Sep 24, 2026). A purchase after that date is not in the data yet.' in head
    assert 'Ask whether the caller bought the home in the sale above. A later sale would not be in the data yet.' in text
    text, _ = m.run_property_brief({'address': '1800 Lambs Gap Road', 'state': 'PA'})
    assert 'Sales for Cumberland County are held from Jul 30, 2026 through Jul 30, 2026 (records pulled Sep 24, 2026).' in text
    # no record: the dates held, no claim that the home has not sold, and a prompt to ask when the caller bought
    text, _ = m.run_property_brief({'address': '999 Nowhere Blvd', 'state': 'PA'})
    assert re.search(r'Sales for Pennsylvania are held from Jun \d, 2025 through Aug 8, 2026 \(records pulled Sep 24, 2026\)\.', text), text
    assert 'A home bought before or after those dates is not in it' in text and 'Ask the caller when they bought the home' in text
    assert 'has not sold' not in text and 'since September 2025' not in text
    text, _ = m.run_property_brief({'address': '999 Nowhere Blvd'})
    assert 'Sales for New Jersey are held from' in text and 'Sales for Pennsylvania are held from' in text


def test_a_town_that_does_not_report_permits_is_not_a_recorded_absence(mod):
    m, net = mod
    net.town_rows = 0
    text, _ = m.run_property_brief({'address': '309 Manapaqua Ave', 'municipality': 'Lakehurst'})
    assert 'This municipality does not report to the state permit feed' in text and 'Permit history here is unknown' in text
    assert '[recorded absence]' not in text and 'No permit matched' not in text
    assert text.count('This municipality does not report to the state permit feed, so permit history is unknown.') >= 2      # in the offers
    # the count did not answer: the two towns known to be silent still say so; any other town says it could not be checked
    net.calls.clear(); net.town_rows = None; m.reset()
    text, _ = m.run_property_brief({'address': '309 Manapaqua Ave', 'municipality': 'Lakehurst'})
    assert 'This municipality does not report to the state permit feed' in text and '[recorded absence]' not in text
    text, _ = m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})
    assert 'No permit matched this block and lot as written' in text and 'Whether this municipality reports to the feed could not be checked.' in text
    # a town that reports and a lot with no permit: a recorded absence, worded as a match on the block and lot
    net.town_rows = 500; m.reset()
    text, _ = m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})
    assert 'No permit matched this block and lot as written [recorded: NJ Construction Permit Data].' in text and '[recorded absence]' in text
    assert 'could not be checked' not in text.split('Permits')[1]
    n = len(net.calls)
    m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})
    assert len(net.calls) == n + 2                                           # the town check is asked once per process, then remembered


def test_permit_lookup_asks_for_padded_blocks_and_lots(mod):
    m, net = mod
    assert m._bl_forms('1066') == ['1066', '01066'] and m._bl_forms('4') == ['4', '00004'] and m._bl_forms('00011') == ['00011']
    assert m._bl_forms('1201.04') == ['1201.04', '01201.04', '01201  04'] and m._bl_forms('3.01A') == ['3.01A', '00003.01A', '00003  01A']
    assert m._bl_forms('A12') == ['A12']
    net.permits = [permit('2021-06-20', plumbfee=30)]
    text, _ = m.run_property_brief({'address': '8 Padded Lot Rd', 'municipality': 'Berkeley'})
    (_, sp), = net.permit_calls()
    assert sp['$where'] == "treasurycode='1506' AND block in('1066.02','01066.02','01066  02') AND lot in('4','00004')"
    assert '1 permit record for this block and lot' in text


def test_an_odd_live_payload_does_not_cost_the_brief(mod):
    m, net = mod
    net.parcels = [dict(PARCEL, CALC_ACRE='zz', SALE_PRICE='n/a', LAND_VAL=float('inf'), YR_CONSTR='1e999', DWELL={}, LAND_DESC=['x'], PCL_PBDATE='soon')]
    net.permits = [dict(permit('2023-01-05', electfee='abc'), constcost='inf', otherfee='1e999', permittypedesc=77), 'not a row', None]
    text, sources = m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})
    assert 'Last recorded sale: May 12, 2026, $600,000' in text and 'Property class: 2' in text and 'acres' not in text
    assert '1 permit record for this block and lot' in text and 'Jan 5, 2023: 77; no trade fee listed' in text and 'inf' not in text.replace('inferred', '')
    assert len(sources) == 3
    # an answer that cannot be read at all: the local record still comes back
    monkey = m.NJ_CLASS
    try:
        m.NJ_CLASS = None                                                    # forces an error inside the parcel lines
        text, sources = m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})
    finally:
        m.NJ_CLASS = monkey
    assert 'Last recorded sale: May 12, 2026, $600,000' in text and 'the answer could not be read' in text
    assert 'New Jersey parcels and tax list' not in [s['title'] for s in sources]
    net.parcels = [{'attributes': 5}, 7]                                     # not parcel records at all
    assert 'Last recorded sale: May 12, 2026' in m.run_property_brief({'address': '317 Barcelona Drive', 'state': 'NJ'})[0]


# ---------------------------------------------------------------- the real file, and the live services

REAL = os.path.join(SERVER_DIR, 'knowledge', 'homes.sqlite')


@pytest.mark.skipif(not os.path.exists(REAL), reason='server/knowledge/homes.sqlite has not been built')
def test_the_built_database(monkeypatch):
    monkeypatch.setattr(homes, 'DB_PATH', REAL)
    monkeypatch.setattr(homes, 'LIVE_ON', False)
    homes.reset()
    try:
        i = homes.info()
        assert i['rows'] > 70000 and set(i['rows_by_state']) == {'NJ', 'PA'} and i['coverage']['state']['NJ']['dense_month']
        cols = [r[1] for r in sqlite3.connect(REAL).execute('PRAGMA table_info(sales)')]
        assert not {'buyer', 'seller', 'owner'} & set(cols)
        text, sources = homes.run_new_homeowners({})
        assert len(text) <= 6000 and len(ranked(text)) == 25 and sources
        text, _ = homes.run_property_brief({'address': '317 Barcelona Drive', 'municipality': 'Toms River', 'state': 'NJ'})
        assert 'Year built: 1973' in text and len(text) <= 6000 and 'Sales for Ocean County are held from' in text
        blob = open(REAL, 'rb').read()                                       # the source files' QA notes quote owner names: none may ship
        assert b'OWNER_NAME=' not in blob and b'OWN1/OWN2' not in blob and not re.search(rb'QA \d{4}-\d\d-\d\d', blob)
        text, sources = homes.run_property_brief({'address': '4901 Harbor Beach Blvd', 'municipality': 'Brigantine'})
        assert 'separate lots at this address' in text and 'Earlier recorded sales' not in text and sources == []
    finally:
        homes.reset()


@pytest.mark.skipif(not (os.environ.get('PROPERTY_LIVE_TEST') and os.path.exists(REAL)), reason='set PROPERTY_LIVE_TEST=1 to call the live New Jersey services')
def test_live_new_jersey_lookups(monkeypatch):
    monkeypatch.setattr(homes, 'DB_PATH', REAL)
    monkeypatch.setattr(homes, 'LIVE_ON', True)
    homes.reset()
    try:
        p = homes.nj_parcel('1508', '442.31', '1')
        assert p and p['PROP_LOC'] == '317 BARCELONA DRIVE' and p['YR_CONSTR'] == 1973 and 'OWNER_NAME' not in p
        permits = homes.nj_permits('1508', '442.31', '1')
        assert isinstance(permits, list) and all('1980-01-01' <= x['date'] <= datetime.date.today().isoformat() for x in permits)
        text, sources = homes.run_property_brief({'address': '317 Barcelona Drive', 'municipality': 'Toms River', 'state': 'NJ'})
        assert '[recorded: NJ parcels and tax list' in text and 'NJ Construction Permit Data' in [s['title'] for s in sources]
        print('live timing (s):', homes.run_property_brief.last_timing)
    finally:
        homes.reset()


def test_state_full_month_needs_the_counties_to_be_full(db):
    """A month can pass on the state total while some counties have only part of it posted. It is not the state's full month then."""
    b = db['build']
    months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
    big = dict(zip(months, [1000, 1100, 1100, 1300, 1500, 1500, 1300]))
    late = dict(zip(months, [300, 300, 300, 400, 450, 451, 287]))                   # August is part published
    total = {m: big[m] + late[m] for m in months}
    assert b.dense_month(total) == '2026-08' and b.dense_month(late) == '2026-07'   # the total alone would pass August
    assert b.state_dense_month({'Big': big, 'Late': late}) == '2026-07'             # a quarter of the state is not full: July
    # A county with under a tenth of the sales does not hold the state back, and neither does a source that stopped a year ago.
    small = {m: n // 10 for m, n in late.items()}
    stalled = {'2025-05': 200, '2025-06': 210, '2025-07': 190}
    assert b.dense_month(small) == '2026-07'
    assert b.state_dense_month({'Big': big, 'Small': small, 'Stalled': stalled}) == '2026-08'
    assert b.state_dense_month({'Stalled': {'2025-05': 5}}) is None


def test_a_new_jersey_sale_cites_the_state_file_it_came_from(db, tmp_path, monkeypatch):
    """Rows from two yearly state files sit side by side after a refresh. Each sale cites its own file; a list cites the newest."""
    y26, y27 = 'https://example.test/YTDSR1A2026.zip', 'https://example.test/YTDSR1A2027.zip'
    nj = [dict(nj_row(2, '2026-09-03', '9 NEWER SALE LANE'), source_url=y27, retrieved='2026-11-12'),
          dict(nj_row(1, '2026-05-12', '317 BARCELONA DRIVE', block_lot='442.31/1'), source_url=y26)]
    src = tmp_path / 'sales'
    src.mkdir()
    cov = [{'county': 'Ocean', 'state': 'NJ', 'source': 'NJ sales files (YTDSR1A2026, YTDSR1A2027)', 'source_url': y27}]
    files = {'pp_sales_nj': columnar(NJ_COLS, nj, {'generated': '2026-11-12', 'coverage': cov}, empty_enums=('beds', 'builder_flag', 'buyer', 'seller')),
             'pp_sales_pa_a': columnar(PA_COLS, [pa_row(1, '2026-07-01', '1 MARKET ST')], {'generated': '2026-11-12', 'coverage': []}),
             'pp_sales_pa_b': columnar(PB_COLS, [], {'generated': '2026-11-12', 'coverage': []})}
    for name, j in files.items():
        (src / f'{name}.json').write_text(json.dumps(j))
    out = str(tmp_path / 'homes.sqlite')
    db['build'].build(out, str(src))
    con = sqlite3.connect(out)
    cited = dict(con.execute("SELECT s.addr, x.url || '|' || x.retrieved FROM sales s JOIN sources x ON x.id=s.source_id WHERE s.state='NJ'"))
    con.close()
    assert cited == {'9 NEWER SALE LANE': y27 + '|2026-11-12', '317 BARCELONA DRIVE': y26 + '|2026-09-24'}      # the row's own source_url
    monkeypatch.setattr(homes, 'DB_PATH', out)
    monkeypatch.setattr(homes, 'LIVE_ON', False)
    homes.reset()
    try:
        _, old = homes.run_property_brief({'address': '317 Barcelona Drive', 'municipality': 'Toms River', 'state': 'NJ'})
        _, new = homes.run_property_brief({'address': '9 Newer Sale Lane', 'municipality': 'Toms River', 'state': 'NJ'})
        assert (old[0]['url'], old[0]['date']) == (y26, '2026-09-24') and (new[0]['url'], new[0]['date']) == (y27, '2026-11-12')
        assert homes._homes_sources({('NJ', 'Ocean'): 2})[0]['url'] == y27
    finally:
        homes.reset()


def test_the_period_is_called_full_only_when_every_county_listed_is_full(mod):
    m, _ = mod
    text, _ = m.run_new_homeowners({'state': 'NJ'})                 # Monmouth holds one sale: no full month of its own
    assert 'Not complete yet for this period: Monmouth NJ' in text
    assert 'the newest month that is full for most of the area' in text and 'the newest full month in the data' not in text
    text, _ = m.run_new_homeowners({'county': 'Ocean'})
    assert '(the newest full month in the data)' in text and 'Not complete yet' not in text
