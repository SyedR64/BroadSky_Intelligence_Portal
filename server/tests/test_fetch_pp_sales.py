"""
Offline tests for scripts/fetch_pp_sales.py: the merge, the safe-failure rule, the rolling window and the
byte-stable output. No network: the sources are replaced with fakes.

  cd server && python3 -m pytest -q tests/test_fetch_pp_sales.py
"""

import importlib.util
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TODAY = '2026-11-12'


@pytest.fixture()
def F(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location('fetch_pp_sales_under_test', os.path.join(ROOT, 'scripts', 'fetch_pp_sales.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    cols = ['id', 'addr', 'buyer', 'county', 'lat', 'lon', 'muni', 'price', 'retrieved', 'sale_date', 'source', 'state', 'use_code_raw', 'use_type', 'zip']

    def row(county, n, date, price=250000, addr=None, buyer='A BUYER'):
        return {'id': f'{county[:3].upper()}-{n}-{date}', 'addr': addr or f'{n} MAIN ST', 'buyer': buyer, 'county': county, 'lat': 40.0, 'lon': -76.5,
                'muni': 'TOWN', 'price': price, 'retrieved': '2026-09-24', 'sale_date': date, 'source': 'src', 'state': 'PA', 'use_code_raw': 'R',
                'use_type': 'residential', 'zip': '17000'}

    def write(name, counties, rows):
        meta = {'dataset': name, 'generated': '2026-09-24', 'coverage': [{'county': c, 'state': 'PA', 'count': 0} for c in counties], 'caveats': [], 'item_count': len(rows)}
        (tmp_path / f'{name}.json').write_text(mod.encode(meta, cols, mod.sort_rows(rows)), encoding='utf-8')

    york = [row('York', i, f'2026-09-{i:02d}') for i in range(1, 21)] + [row('York', 99, '2024-12-31')]       # the last one is past the window
    write('pp_sales_nj', ['Ocean'], [row('Ocean', i, f'2026-06-{i:02d}') for i in range(1, 16)])
    write('pp_sales_pa_a', ['York', 'Dauphin'], york + [row('Dauphin', 1, '2024-01-05')])                         # frozen: kept whatever its age
    write('pp_sales_pa_b', ['Berks'], [row('Berks', i, f'2026-09-{i:02d}') for i in range(1, 16)])
    mod.row = row
    mod.tmp = tmp_path
    monkeypatch.setattr(mod, 'robots_ok', lambda url: True)
    return mod


def read(F, name):
    text = (F.tmp / f'{name}.json').read_text(encoding='utf-8')
    j = json.loads(text)
    return text, j['meta'], {r['id']: r for r in F.decode(j)}


def sources(F, york, berks, ocean=lambda ctx: 'unchanged'):
    keep = lambda rows, ctx: rows
    return [('nj', 'pp_sales_nj', ['Ocean'], ocean, keep, ['addr', 'price']),
            ('york', 'pp_sales_pa_a', ['York'], york, keep, ['addr', 'buyer', 'price']),
            ('berks', 'pp_sales_pa_b', ['Berks'], berks, keep, ['addr', 'buyer', 'price'])]


def run(F, *extra):
    return F.main(['--dir', str(F.tmp), '--today', TODAY, *extra])


def test_merge_replaces_changed_rows_keeps_the_rest_and_is_stable(F, monkeypatch):
    def york(ctx):
        assert ctx['since'] == '2026-07-28'                 # 10th-newest held sale (Sep 11) less 45 days
        held = [F.row('York', i, f'2026-09-{i:02d}') for i in range(5, 21)]       # rows 1 to 4 are not returned: they stay
        held[0]['buyer'] = 'A NEW OWNER'                                         # one changed field: replaced
        return held + [F.row('York', 50, '2026-10-15'), F.row('York', 51, '2026-10-16', price=10)]   # one new, one under the price floor

    def berks(ctx):
        return [F.row('Berks', i, f'2026-09-{i:02d}') for i in range(1, 16)]      # nothing new

    monkeypatch.setattr(F, 'SOURCES', sources(F, york, berks))
    before_b = read(F, 'pp_sales_pa_b')[0]
    assert run(F, '--dry-run') == 0
    assert read(F, 'pp_sales_pa_b')[0] == before_b and 'YOR-50-2026-10-15' not in read(F, 'pp_sales_pa_a')[2]      # a dry run writes nothing
    assert run(F) == 0
    text, meta, rows = read(F, 'pp_sales_pa_a')
    assert 'YOR-50-2026-10-15' in rows and 'YOR-51-2026-10-16' not in rows and 'YOR-1-2026-09-01' in rows
    assert rows['YOR-5-2026-09-05']['buyer'] == 'A NEW OWNER' and rows['YOR-5-2026-09-05']['retrieved'] == TODAY
    assert rows['YOR-6-2026-09-06']['retrieved'] == '2026-09-24'                 # returned unchanged: not touched
    assert 'YOR-99-2024-12-31' not in rows                                       # older than 18 months
    assert 'DAU-1-2024-01-05' in rows                                            # Dauphin is frozen, never dropped
    cov = {c['county']: c for c in meta['coverage']}
    assert meta['generated'] == TODAY and meta['item_count'] == len(rows) == 22 and cov['York']['count'] == 21
    assert cov['York']['date_to'] == '2026-10-15' and cov['York']['retrieved'] == TODAY and cov['Dauphin']['frozen'] == '2026-09-24'
    assert meta['refresh']['window_months'] == 18 and any('Dauphin County is a frozen snapshot' in c for c in meta['caveats'])
    ids = [r[0] for r in json.loads(text)['rows']]
    assert ids[0] == 'YOR-50-2026-10-15' and ids == sorted(ids, key=lambda i: i[-10:], reverse=True)              # newest first
    # A second run with the same source answers leaves every file byte for byte the same.
    snap = {n: read(F, n)[0] for n in F.FILES}
    monkeypatch.setattr(F, 'SOURCES', sources(F, lambda ctx: york({'since': '2026-07-28'}), berks))
    assert run(F) == 0
    assert {n: read(F, n)[0] for n in F.FILES} == snap


def test_a_failing_or_implausible_source_keeps_its_rows(F, monkeypatch):
    def boom(ctx):
        raise RuntimeError('service down')

    def thin(ctx):
        return [F.row('Berks', 1, '2026-09-01')]            # 1 row where 15 are held for the overlap: not believable

    monkeypatch.setattr(F, 'SOURCES', sources(F, boom, thin))
    assert run(F) == 0                                      # NJ answered (file not modified), so the run is not a total failure
    _, meta_a, rows_a = read(F, 'pp_sales_pa_a')
    _, meta_b, rows_b = read(F, 'pp_sales_pa_b')
    assert len([r for r in rows_a if r.startswith('YOR')]) == 21 and len(rows_b) == 15
    assert 'YOR-99-2024-12-31' in rows_a                    # a failed source is left untouched: the window does not move for it
    assert meta_a['generated'] == '2026-09-24' and meta_a['item_count'] == 22       # no rows changed, so the file date stays
    fa = [x for x in meta_a['failed_sources'] if x.get('refresh')]
    fb = [x for x in meta_b['failed_sources'] if x.get('refresh')]
    assert fa[0]['county'] == 'York' and 'service down' in fa[0]['error'] and fa[0]['date'] == TODAY
    assert fb[0]['county'] == 'Berks' and 'are held' in fb[0]['error']
    # The note goes away once the source answers again.
    monkeypatch.setattr(F, 'SOURCES', sources(F, lambda ctx: [F.row('York', i, f'2026-09-{i:02d}') for i in range(1, 21)],
                                              lambda ctx: [F.row('Berks', i, f'2026-09-{i:02d}') for i in range(1, 16)]))
    assert run(F) == 0
    assert not [x for x in read(F, 'pp_sales_pa_a')[1].get('failed_sources', []) if x.get('refresh')]
    assert 'YOR-99-2024-12-31' not in read(F, 'pp_sales_pa_a')[2]                   # it answered, so the window moved


def test_a_source_that_stays_empty_is_written_once_and_not_again(F, monkeypatch):
    """Two nights running with the same failure: the note is written the first night and the files do not change on the second."""
    def thin(ctx):
        return [F.row('Berks', 1, '2026-09-01')]            # the message carries counts; the day does not change it
    monkeypatch.setattr(F, 'SOURCES', sources(F, lambda ctx: [], thin))             # York holds rows and returns none
    assert F.main(['--dir', str(F.tmp), '--today', '2026-11-12']) == 0
    first = {n: read(F, n)[0] for n in F.FILES}
    note = [x for x in read(F, 'pp_sales_pa_a')[1]['failed_sources'] if x.get('refresh')][0]
    assert note['error'] == 'York: zero rows returned' and note['date'] == '2026-11-12'
    for day in ('2026-11-13', '2026-11-14'):
        assert F.main(['--dir', str(F.tmp), '--today', day]) == 0
        assert {n: read(F, n)[0] for n in F.FILES} == first, day
    assert F.same_error('Berks: 1 rows returned for the overlap window but 15 are held', 'Berks: 3 rows returned for the overlap window but 14 are held')
    assert not F.same_error('York: zero rows returned', 'URLError: timed out')


def test_a_county_with_nothing_held_in_the_window_and_nothing_returned_is_not_a_failure(F, monkeypatch):
    """Franklin once the window has passed its last sale: nothing published, so its old rows leave with the window. No failure, no note."""
    monkeypatch.setattr(F, 'SOURCES', [s for s in sources(F, None, lambda ctx: []) if s[0] == 'berks'])
    assert F.main(['--dir', str(F.tmp), '--today', '2028-06-02']) == 0              # every Berks row held (Sep 2026) is now older than 18 months
    text, meta, rows = read(F, 'pp_sales_pa_b')
    assert not rows and meta['item_count'] == 0 and not [x for x in meta.get('failed_sources', []) if x.get('refresh')]
    for day in ('2028-06-03', '2028-06-04'):                                        # nothing held, nothing returned: still no failure and no write
        assert F.main(['--dir', str(F.tmp), '--today', day]) == 0
        assert read(F, 'pp_sales_pa_b')[0] == text


def test_only_leaves_the_other_sources_rows_alone(F, monkeypatch):
    monkeypatch.setattr(F, 'SOURCES', sources(F, None, lambda ctx: [F.row('Berks', i, f'2026-09-{i:02d}') for i in range(1, 16)]))
    before = read(F, 'pp_sales_pa_a')
    assert run(F, '--only', 'berks') == 0
    _, meta, rows = read(F, 'pp_sales_pa_a')                                        # only the refresh settings are added to its notes
    assert rows == before[2] and 'YOR-99-2024-12-31' in rows and meta['generated'] == before[1]['generated']


def test_a_redated_sale_replaces_the_held_row(F, monkeypatch):
    def york(ctx):
        rows = [F.row('York', i, f'2026-09-{i:02d}') for i in range(1, 20)]
        return rows + [F.row('York', 20, '2026-09-22'),                             # parcel 20 held as sold Sep 20: same buyer and price, new date
                       F.row('York', 19, '2026-10-30', buyer='NEXT OWNER', price=300000)]   # parcel 19 sold again: both sales are kept
    monkeypatch.setattr(F, 'SOURCES', sources(F, york, lambda ctx: [F.row('Berks', i, f'2026-09-{i:02d}') for i in range(1, 16)]))
    assert run(F) == 0
    rows = read(F, 'pp_sales_pa_a')[2]
    assert 'YOR-20-2026-09-22' in rows and 'YOR-20-2026-09-20' not in rows
    assert 'YOR-19-2026-09-19' in rows and 'YOR-19-2026-10-30' in rows
    # New Jersey: the same sale in two yearly files under two deed references. The newer file wins, in the pull and against held rows.
    old = dict(F.row('Ocean', 1, '2026-06-01'), id='NJ-1515-20414-01285-765.01_23', block_lot='765.01/23', source='NJ Taxation SR1A YTDSR1A2026')
    new = dict(old, id='NJ-1515-20426-01995-765.01_23', source='NJ Taxation SR1A YTDSR1A2027')
    twin = dict(old, id='NJ-1515-20414-01286-765.01_23')                            # second deed in the same file: a separate record
    assert [r['id'] for r in F.drop_superseded('nj', [old, new, twin])] == [new['id']]
    assert [r['id'] for r in F.drop_superseded('nj', [old, twin])] == [old['id'], twin['id']]
    assert F.superseded_held('nj', [new], [old, twin]) == {id(old), id(twin)} and F.superseded_held('nj', [twin], [old]) == set()


def test_notes_follow_the_rows(F, monkeypatch):
    meta = {'caveats': ['Source lag: Lancaster latest sale 2026-08-24 (behind 2026-09-24).', 'a parcel that sold twice in the window appears once (latest sale), and buyer = current owner.',
                        'QA 2026-09-24: Validated all 27,117 items.', 'ZIP is derived from the parcel centroid.'],
            'as_of': '2026-09-24', 'window_requested': {'from': '2025-09-01', 'to': '2026-09-24'}}
    F.refresh_notes(meta, TODAY, '2025-05-01')
    c = meta['caveats']
    assert c[0].startswith('First pull (2026-09-24): Source lag') and c[1].startswith('each pull shows only the latest sale') and 'can have more than one row' in c[1]
    assert c[2].startswith('QA 2026-09-24') and c[3] == 'ZIP is derived from the parcel centroid.'
    assert c[4].startswith('Refreshed by scripts/fetch_pp_sales.py since 2026-11-12') and '18 months' in c[4]
    assert meta['as_of'] == TODAY and meta['window_requested'] == {'from': '2025-09-01', 'to': TODAY} and meta['refresh']['first_refresh'] == TODAY
    again = json.dumps(meta)
    F.refresh_notes(meta, TODAY, '2025-05-01')
    assert json.dumps(meta) == again                                                # same text every time
    F.refresh_notes(meta, '2026-11-19', '2025-05-01')
    assert meta['caveats'] == c and meta['refresh']['first_refresh'] == TODAY       # a later run adds nothing
    # The NJ source names every state file that supplied the county's rows and links the newest.
    url = 'https://www.nj.gov/treasury/taxation/lpt/statdata/YTDSR1A{}.zip'
    rows = [dict(F.row('Ocean', i, '2026-06-01'), state='NJ', source=f'NJ Taxation SR1A YTDSR1A{y}', source_url=url.format(y)) for i, y in ((1, 2026), (2, 2027))]
    cov = {'coverage': [{'county': 'Ocean', 'state': 'NJ', 'source': 'NJ Division of Taxation SR1A sales file (YTDSR1A2026) joined to NJOGIS', 'source_url': url.format(2026)}]}
    F.refresh_coverage(cov, rows, TODAY, {'Ocean'})
    assert cov['coverage'][0]['source'] == 'NJ Division of Taxation SR1A sales files (YTDSR1A2026, YTDSR1A2027) joined to NJOGIS'
    assert cov['coverage'][0]['source_url'] == url.format(2027)


def test_a_new_row_with_no_town_in_the_source_takes_the_town_of_its_parcel_prefix(F):
    held = [dict(F.row('Lebanon', 1, '2026-09-01'), id='LEBA-27-2332964-380000-0000-2026-09-01', muni='North Londonderry Township')]
    ctx = {'learned': F.Learned(held)}
    new = [{'id': 'LEBA-27-2332964-380310-0000-2026-10-27', '_muni': None, '_zip': '17078', '_oid': 7}]
    F._local_geo = lambda layer, oid, rows: iter([(7, (40.3, -76.6))])
    assert F.lebanon_enrich(new, ctx)[0]['muni'] == 'North Londonderry Township'


def test_an_unreadable_robots_file_is_reported_as_unreadable_and_asked_again(monkeypatch):
    spec = importlib.util.spec_from_file_location('fetch_pp_sales_robots', os.path.join(ROOT, 'scripts', 'fetch_pp_sales.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    calls = []

    class Resp:
        def __init__(self, body): self.body = body
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self, n=-1): return self.body

    def down(req, timeout=0):
        calls.append(req.full_url)
        raise OSError('connection reset')

    monkeypatch.setattr(mod, 'ROBOTS_WAIT', 0)
    monkeypatch.setattr(mod.urllib.request, 'urlopen', down)
    with pytest.raises(mod.SourceError) as e:
        mod.http('https://county.example/arcgis/rest/services/x/query')
    assert 'robots.txt could not be read for county.example' in str(e.value) and 'disallow' not in str(e.value)
    assert len(calls) == mod.ROBOTS_TRIES == 3 and mod._robots == {}                # tried three times; the failure is not kept

    def up(req, timeout=0):
        calls.append(req.full_url)
        return Resp(b'User-agent: *\nDisallow: /private/\n' if req.full_url.endswith('/robots.txt') else b'{"ok": true}')

    monkeypatch.setattr(mod.urllib.request, 'urlopen', up)
    assert mod.http('https://county.example/arcgis/rest/services/x/query') == {'ok': True}        # the next source on the host asks again
    with pytest.raises(mod.SourceError, match='robots.txt disallows'):
        mod.http('https://county.example/private/x')


def test_exit_code_is_non_zero_only_when_every_source_failed(F, monkeypatch):
    def boom(ctx):
        raise RuntimeError('down')

    monkeypatch.setattr(F, 'SOURCES', sources(F, boom, lambda ctx: [], ocean=boom))       # an empty answer counts as a failure
    assert run(F, '--dry-run') == 1
    monkeypatch.setattr(F, 'SOURCES', sources(F, boom, boom))
    assert run(F, '--dry-run') == 0


def test_the_real_files_round_trip_byte_for_byte(F):
    for name in F.FILES:
        with open(os.path.join(ROOT, 'data', 'sales', name + '.json'), encoding='utf-8') as fh:
            text = fh.read()
        j = json.loads(text)
        assert F.encode(j['meta'], j['cols'], F.decode(j)) == text
        ids = [r[0] for r in j['rows']]
        assert len(ids) == len(set(ids)) == j['meta']['item_count']


def test_window_cutoff_and_robots():
    spec = importlib.util.spec_from_file_location('fetch_pp_sales_plain', os.path.join(ROOT, 'scripts', 'fetch_pp_sales.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.window_cutoff('2026-11-12') == '2025-05-01' and mod.window_cutoff('2027-01-31') == '2025-07-01'
    assert not any('dauphin' in str(s).lower() or 'devnetwedge' in str(s).lower() for s in mod.SOURCES)             # never fetched
    assert ('pp_sales_pa_a', 'Dauphin') in mod.FROZEN
