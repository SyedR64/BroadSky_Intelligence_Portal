"""
Tests for server/directory.py (the find_businesses tool) and its wiring in app.py.

  cd server && python3 -m pytest -q tests/test_directory.py

A small fixture database is built here with the same writer as scripts/build_business_directory.py, so the schema, the FTS5
index and the meta table match the real build. Downloads go to a local HTTP server; nothing leaves the machine.
"""

import base64
import functools
import http.server
import importlib.util
import json
import os
import shutil
import sys
import threading
import time

import httpx
import pytest

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SERVER)
sys.path.insert(0, SERVER)
sys.path.insert(0, os.path.join(SERVER, 'tests'))
import directory as bizdir   # noqa: E402
import procs                 # noqa: E402


def _builder():
    spec = importlib.util.spec_from_file_location('build_business_directory', os.path.join(ROOT, 'scripts', 'build_business_directory.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


B = _builder()


def rec(**kw):
    r = {c: None for c in B.COLS}
    r.update({'nonprofit': 0, 'person_named': 0, 'ppp_loans': 1, 'sba_loans': 0, 'change_of_ownership_recent': 0, 'on_sba_screen': 0,
              'dba': '', 'franchise': '', 'county_basis': 'ppp', 'geo_precision': 'zip', 'source': 'ppp', 'ownership': 'unknown',
              'ownership_basis': 'not researched', 'specialties_basis': 'NAICS trade label only (not researched)', 'revenue_basis': 'model',
              'revenue_confidence': 'medium', 'jobs_latest_source': 'PPP JobsReported (borrower-reported, 2020-2021)',
              'data_source': 'SBA PPP loan data (FOIA, as of 2024-09-30)'})
    r.update(kw)
    r['specialties'] = r['specialties'] or r['trade']
    r['jobs_ppp'] = r['jobs_ppp'] if 'jobs_ppp' in kw else r['jobs_latest']
    return r


HVAC, ELEC, IT, LAB = 'HVAC and plumbing contractor', 'electrical contractor', 'IT services firm (computer systems design)', 'lab and scientific supply distributor'
RECS = [
    rec(id='pp-1', segment='pp', name='ACME HEATING & COOLING INC', city='Lancaster', county='Lancaster', state='PA', zip='17601', naics='238220', trade=HVAC,
        jobs_latest=40, dist_hub_mi=3.0, nearest_hub='Lancaster PA hub', revenue_est_usd=9_000_000, revenue_low_usd=7_000_000, revenue_high_usd=11_000_000,
        ppp_first_draw_usd=410000.0),
    rec(id='pp-2', segment='pp', name='BRAVO MECHANICAL LLC', city='Lititz', county='Lancaster', state='PA', zip='17543', naics='238220', trade=HVAC,
        jobs_latest=30, dist_hub_mi=8.5, nearest_hub='Lancaster PA hub', revenue_est_usd=6_000_000, change_of_ownership_date='2024-06-01',
        change_of_ownership_recent=1, sba_loans=1, sba_latest_program='7(a)', sba_latest_date='2024-06-01', sba_latest_amount_usd=2_500_000.0,
        sba_latest_status='still open (disbursed; detail withheld under FOIA Exemption 4)', source='ppp+sba'),
    rec(id='pp-3', segment='pp', name='CHARLIE ELECTRIC CO', city='Ephrata', county='Lancaster', state='PA', zip='17522', naics='238210', trade=ELEC,
        jobs_latest=25, dist_hub_mi=12.0, nearest_hub='Lancaster PA hub', revenue_est_usd=5_000_000),
    rec(id='pp-4', segment='pp', name='DELTA PLUMBING INC', city='Toms River', county='Ocean', state='NJ', zip='08753', naics='238220', trade=HVAC,
        jobs_latest=70, dist_hub_mi=1.0, nearest_hub='Toms River NJ hub', revenue_est_usd=15_000_000),
    rec(id='fl-1', segment='fl', name='LEGAL IT PARTNERS LLC', city='New York', county='New York', state='NY', zip='10018', naics='541512', trade=IT,
        jobs_latest=15, on_sba_screen=1, screen_rank=2, ownership='founder', ownership_basis='researched (SBA screen)',
        specialties='managed IT; legal software support', specialties_basis='researched', revenue_est_usd=4_000_000,
        revenue_low_usd=3_000_000, revenue_high_usd=5_000_000, revenue_basis='researched model', revenue_confidence='high'),
    rec(id='fl-2', segment='fl', name='NETWORK SOLUTIONS INC', city='Austin', county='Travis', state='TX', zip='78704', naics='541519', trade=IT,
        jobs_latest=50, revenue_est_usd=12_000_000, hand_built_list_id='fl-t03', hand_built_list_name='Network Solutions'),
    rec(id='ts-1', segment='ts', name='GARDEN STATE LAB SUPPLY CO', city='Edison', county='Middlesex', state='NJ', zip='08837', naics='423490', trade=LAB,
        jobs_latest=20, revenue_est_usd=14_000_000),
    rec(id='fh-1', segment='fh', name='SURF APPAREL LLC', city='Los Angeles', county='Los Angeles', state='CA', zip='90021', naics='315280',
        trade='apparel maker (cut and sew)', jobs_latest=None, jobs_latest_source='none reported', revenue_est_usd=None, revenue_basis='none',
        revenue_confidence=None, source='sba_only'),
]


@pytest.fixture(scope='module')
def fixture_files(tmp_path_factory):
    """data/ppp/directory/{businesses.sqlite.gz, index.json} under a temp site root."""
    root = tmp_path_factory.mktemp('site')
    d = root / 'data' / 'ppp' / 'directory'
    d.mkdir(parents=True)
    raw = str(root / 'businesses.sqlite')
    meta = B.write_sqlite(raw, RECS, {'built_at': '2026-11-17T12:00:00+00:00', 'generated': '2026-11-17'})
    raw_bytes, gz_bytes, sha = B.gzip_file(raw, str(d / 'businesses.sqlite.gz'))
    (d / 'index.json').write_text(json.dumps({'sqlite': {'file': 'businesses.sqlite.gz', 'bytes': gz_bytes, 'raw_bytes': raw_bytes, 'sha256': sha,
                                                         'built_at': meta['built_at']}}))
    return {'root': str(root), 'dir': str(d), 'gz': str(d / 'businesses.sqlite.gz'), 'raw': raw, 'sha': sha, 'gz_bytes': gz_bytes}


@pytest.fixture
def local(monkeypatch, tmp_path, fixture_files):
    monkeypatch.setenv('DIRECTORY_PATH', fixture_files['gz'])
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.delenv('DIRECTORY_URL', raising=False)
    bizdir.reset()
    yield bizdir
    bizdir.reset()


class _Site:
    def __init__(self, root):
        handler = functools.partial(_Quiet, directory=root)
        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        self.url = f'http://127.0.0.1:{self.httpd.server_address[1]}/'
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.t.start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope='module')
def site(fixture_files):
    s = _Site(fixture_files['root'])
    yield s
    s.close()


def find(**args):
    text, sources = bizdir.run_find_businesses(args)
    return text, sources


# ---------------------------------------------------------------- the tool

def test_filters_trade_county_jobs_and_sold_since(local):
    text, sources = find(segment='pp', trade='HVAC', county='Lancaster County', state='Pennsylvania', jobs_min=20, jobs_max=60, exclude_sold_since='2023')
    assert text.startswith('BUSINESS DIRECTORY: 1 businesses match (segment Punctual Pros; state PA; Lancaster County; trade hvac (NAICS 238220); jobs 20 to 60; '
                           'no SBA-financed change of ownership since Jan 1, 2023).')
    assert 'ACME HEATING' in text and 'BRAVO' not in text and 'CHARLIE' not in text and 'DELTA' not in text
    assert '1. ACME HEATING & COOLING INC | Lancaster, Lancaster County, PA 17601 | HVAC and plumbing contractor | jobs 40 (PPP, 2020-21, borrower-reported)' in text
    assert 'revenue est. $9.0M ($7.0M to $11.0M), modelled, medium confidence' in text and 'ownership unknown (not researched)' in text
    assert '3 mi from Lancaster PA hub' in text and 'id pp-1' in text
    assert 'jobs come from the latest loan record' in text and 'go back to 1991, and the row gives the year' in text and '2020-2026' not in text
    assert 'Revenue is always modelled (est.)' in text and 'unless the row says stated' in text
    assert 'Ownership is unknown unless the row says researched or loan record' in text
    assert '#/ma/screen' in text and '#/ma/loans' in text
    assert [s['title'] for s in sources][:2] == ['SBA Paycheck Protection Program loan data (FOIA)', 'SBA 7(a) and 504 loan data (FOIA)']
    assert any('Census' in s['title'] for s in sources) and all(s['url'].startswith('https://') for s in sources)
    # without the sale filter the recently sold business is back, and its sale is shown
    text, _ = find(segment='pp', county='Lancaster', trade='hvac')
    assert '2 businesses match' in text and 'SBA-financed change of ownership Jun 1, 2024' in text
    text, _ = find(segment='pp', county='Lancaster', exclude_sold_within_years=3)
    assert '2 businesses match' in text and 'BRAVO' not in text


def test_name_keyword_state_and_researched_labels(local):
    text, _ = find(segment='fl', name='legal')
    assert '1 businesses match' in text and 'LEGAL IT PARTNERS LLC' in text and 'NETWORK' not in text
    # the screen's revenue comes from the same Census model: never shown as anything but modelled
    assert 'revenue est. $4.0M ($3.0M to $5.0M), modelled, inputs checked on the SBA screen, high confidence' in text
    assert 'ownership founder-run (researched)' in text
    assert 'specialties: managed IT; legal software support' in text and 'on the SBA screen, rank 2' in text
    text, _ = find(query='lab supply', state='new jersey')
    assert '1 businesses match' in text and 'GARDEN STATE LAB SUPPLY CO' in text
    text, _ = find(segment='fl', exclude_researched=True, exclude_hand_built=True)
    assert 'No business matches' in text
    text, _ = find(segment='fl', exclude_researched=True)
    assert 'NETWORK SOLUTIONS INC' in text and 'on a hand-researched list' in text
    text, _ = find(state='Atlantis')
    assert 'State "Atlantis" was not recognised' in text


def test_totals_sort_limit_and_miles(local):
    text, _ = find(limit=2)
    assert text.startswith('BUSINESS DIRECTORY: 8 businesses match (no filters: every business).')
    assert 'By segment: Punctual Pros 4; Frontline 2; Thomas Scientific 1; Fair Harbor 1.' in text
    assert 'By state: PA 3; NJ 2;' in text and '1 of them are on the researched SBA screen.' in text
    assert 'Top 2 sorted by jobs (largest first):' in text and '1. DELTA PLUMBING INC' in text and '2. NETWORK SOLUTIONS INC' in text and '3. ' not in text
    text, _ = find(segment='pp', max_miles=5, sort='distance')
    assert '2 businesses match' in text and text.index('DELTA') < text.index('ACME')
    text, _ = find(segment='fl', max_miles=50)
    assert 'only for the Punctual Pros and CET segments' in text
    text, _ = find(revenue_min='10M')
    assert '3 businesses match' in text
    text, _ = find(segment='fh')
    assert 'jobs: none on record' in text and 'revenue: no estimate' in text
    text, _ = find(limit=500)
    assert 'Top 8 sorted' in text   # capped at MAX_LIMIT, and only 8 exist


def test_status_never_loads_and_reports_after_first_use(local):
    s = bizdir.status()
    assert s == {'enabled': True, 'loaded': False, 'rows': None, 'built_at': None, 'rows_by_segment': None}
    assert bizdir.tool_definitions()[0]['name'] == 'find_businesses' and bizdir.status()['loaded'] is False
    assert bizdir.ready() is True
    s = bizdir.status()
    assert s['loaded'] is True and s['rows'] == len(RECS) and s['built_at'] == '2026-11-17T12:00:00+00:00' and s['source'] == 'file'
    assert s['timings']['gunzip_s'] >= 0 and s['timings']['open_s'] >= 0 and s['rows_by_segment']['pp'] == 4


def test_download_checks_size_and_checksum(monkeypatch, tmp_path, site, fixture_files):
    monkeypatch.delenv('DIRECTORY_PATH', raising=False)
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.setenv('DIRECTORY_URL', site.url + 'data/ppp/directory/businesses.sqlite.gz')
    bizdir.reset()
    try:
        assert bizdir.ready() is True
        s = bizdir.status()
        assert s['source'] == 'download' and s['timings']['download_bytes'] == fixture_files['gz_bytes'] and s['rows'] == len(RECS)
        assert not os.path.exists(tmp_path / 'tmp' / 'businesses.sqlite.gz.part')   # only the unzipped copy stays in /tmp
        text, _ = find(segment='ts')
        assert 'GARDEN STATE LAB SUPPLY CO' in text
        # a second process on the same instance reuses the unzipped copy of the same build
        bizdir.reset()
        assert bizdir.ready() is True and bizdir.status()['source'] == 'cache'
    finally:
        bizdir.reset()


def test_download_that_does_not_match_its_index_is_refused(monkeypatch, tmp_path, fixture_files):
    root = tmp_path / 'site'
    d = root / 'data' / 'ppp' / 'directory'
    d.mkdir(parents=True)
    shutil.copy(fixture_files['gz'], d / 'businesses.sqlite.gz')
    (d / 'index.json').write_text(json.dumps({'sqlite': {'bytes': fixture_files['gz_bytes'], 'sha256': '0' * 64, 'raw_bytes': 1}}))
    s = _Site(str(root))
    monkeypatch.delenv('DIRECTORY_PATH', raising=False)
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.setenv('DIRECTORY_URL', s.url + 'data/ppp/directory/businesses.sqlite.gz')
    bizdir.reset()
    try:
        assert bizdir.ready() is False
        assert bizdir.status()['error'] == 'the downloaded file does not match its index (size or checksum)'
        text, sources = find(segment='pp')
        assert text.startswith('The business directory is unavailable right now (the downloaded file does not match its index') and sources == []
        assert '#/ma/screen' in text and '#/ma/loans' in text
    finally:
        bizdir.reset()
        s.close()


def test_unreachable_site_fails_fast_and_backs_off(monkeypatch, tmp_path):
    monkeypatch.delenv('DIRECTORY_PATH', raising=False)
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.setenv('DIRECTORY_URL', 'http://127.0.0.1:9/data/ppp/directory/businesses.sqlite.gz')
    monkeypatch.setenv('DIRECTORY_TIMEOUT', '5')
    bizdir.reset()
    try:
        t0 = time.monotonic()
        text, _ = find(segment='pp')
        assert time.monotonic() - t0 < 6 and text.startswith('The business directory is unavailable right now (the site could not be reached)')
        t0 = time.monotonic()
        assert bizdir.ready() is False and time.monotonic() - t0 < 0.05   # the failure is remembered: no retry for a minute
    finally:
        bizdir.reset()


def test_gz_that_is_cut_short_is_refused(monkeypatch, tmp_path, fixture_files):
    bad = tmp_path / 'cut.sqlite.gz'
    bad.write_bytes(open(fixture_files['gz'], 'rb').read()[:2000])
    monkeypatch.setenv('DIRECTORY_PATH', str(bad))
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    bizdir.reset()
    try:
        assert bizdir.ready() is False and bizdir.status()['error'].startswith('the file is not a complete gzip')
    finally:
        bizdir.reset()


def test_tool_description_does_not_change_after_loading(local):
    before = json.dumps(bizdir.tool_definitions())
    assert bizdir.ready() is True and bizdir.status()['rows'] == len(RECS)
    assert json.dumps(bizdir.tool_definitions()) == before   # the cached prompt prefix stays the same on every instance
    assert 'about 145,000 US businesses' in before


# ---------------------------------------------------------------- trade words, county spellings and row labels

OLD_SBA = 'SBA 7(a) JobsSupported on loan approved 2005-03-01 (jobs created plus retained, lender-reported)'
EXTRA = [
    rec(id='pp-10', segment='pp', name='SHORE LINE SERVICES LLC', city='Toms River', county='Ocean', state='NJ', zip='08753', naics='238220', trade=HVAC,
        jobs_latest=22),
    rec(id='fh-10', segment='fh', name='KNIT WORKS INC', city='Fall River', county='Bristol', state='MA', zip='02720', naics='315190',
        trade='apparel maker (knitting mill)', jobs_latest=30),
    rec(id='fl-10', segment='fl', name='BYTE SHOP LLC', city='Boston', county='Suffolk', state='MA', zip='02110', naics='541512', trade=IT, jobs_latest=18),
    rec(id='bpi-10', segment='bpi', name='SPIN PR LLC', city='Arlington', county='Arlington', state='VA', zip='22201', naics='541820',
        trade='public relations firm', jobs_latest=12),
    rec(id='bpi-11', segment='bpi', name='INFO@POLLCO.COM RESEARCH', city='Arlington', county='Arlington', state='VA', zip='22201', naics='541910',
        trade='market and opinion research firm', jobs_latest=11),
    rec(id='cet-10', segment='cet', name='GRIFFIN ELECTRIC INC', city='Upper Marlboro', county='Prince Georges', state='MD', zip='20772',
        naics='238210', trade=ELEC, jobs_latest=45, ownership='family', ownership_basis='hand-built list', hand_built_list_id='cet-t26',
        hand_built_list_name='Griffin Electric'),
    rec(id='cet-11', segment='cet', name='RIVER ELECTRIC CO', city='Florissant', county='Saint Louis', state='MO', zip='63031', naics='238210',
        trade=ELEC, jobs_latest=80, jobs_ppp=None, jobs_latest_source=OLD_SBA, ownership='esop', ownership_basis='hand-built list',
        source='sba_only', sba_loans=1),
    rec(id='ts-10', segment='ts', name='STATED LAB CO', city='Edison', county='Middlesex', state='NJ', zip='08837', naics='423490', trade=LAB,
        jobs_latest=25, on_sba_screen=1, specialties='it asset disposal; pipettes', specialties_basis='researched', revenue_est_usd=20_000_000,
        revenue_basis='researched stated', revenue_confidence='high'),
]


@pytest.fixture(scope='module')
def extra_gz(tmp_path_factory):
    d = tmp_path_factory.mktemp('extra')
    raw = str(d / 'businesses.sqlite')
    B.write_sqlite(raw, EXTRA, {'built_at': '2026-11-17T12:00:00+00:00', 'generated': '2026-11-17'})
    B.gzip_file(raw, str(d / 'businesses.sqlite.gz'))
    return str(d / 'businesses.sqlite.gz')


@pytest.fixture
def extra(monkeypatch, tmp_path, extra_gz):
    monkeypatch.setenv('DIRECTORY_PATH', extra_gz)
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.delenv('DIRECTORY_URL', raising=False)
    bizdir.reset()
    yield bizdir
    bizdir.reset()


def test_trade_words_plurals_and_short_words(extra):
    text, _ = find(trade='plumbers', county='Ocean', state='NJ')
    assert '1 businesses match' in text and 'SHORE LINE SERVICES LLC' in text and 'trade plumbers (NAICS 238220)' in text
    text, _ = find(trade='electricians')
    assert '2 businesses match' in text and 'GRIFFIN' in text and 'RIVER ELECTRIC' in text
    text, _ = find(trade='IT')   # a whole word: not "knitting", not a researched specialty that merely contains "it"
    assert '1 businesses match' in text and 'BYTE SHOP LLC' in text and 'KNIT' not in text and 'STATED LAB' not in text
    text, _ = find(trade='PR')
    assert '1 businesses match' in text and 'SPIN PR LLC' in text and 'RESEARCH' not in text
    text, _ = find(trade='public relations firms')
    assert '1 businesses match' in text and 'SPIN PR LLC' in text
    text, _ = find(trade='residential plumbing contractors', state='NJ')
    assert '1 businesses match' in text and 'not used' not in text
    text, _ = find(trade='plumbing legal')
    assert 'Trade words not used: legal.' in text
    text, _ = find(trade='lab supply')
    assert '1 businesses match' in text and 'NAICS 423450, 423490, 424690' in text
    text, _ = find(trade='disposal')   # no trade code: whole-word match on researched specialties
    assert '1 businesses match' in text and 'STATED LAB CO' in text
    text, _ = find(trade='roofers')
    assert 'No business matches. Try another trade word ("plumbing"' in text
    text, _ = find(trade='AV')
    assert 'Trade word "av" is too short to match on its own.' in text


def test_county_spellings(extra):
    for county, state in (("Prince George's", 'MD'), ('Prince George’s County', 'Maryland'), ('St. Louis', 'MO'), ('saint louis county', 'MO')):
        text, _ = find(county=county, state=state)
        assert '1 businesses match' in text, county
    text, _ = find(county='Atlantis', state='MD')
    assert 'No business matches' in text


def test_row_labels_name_their_source(extra):
    text, _ = find(segment='cet', sort='name')
    assert 'GRIFFIN ELECTRIC INC' in text and 'ownership family-owned (researched, hand-researched list)' in text
    assert 'hand-built' not in text   # the database keeps its own value; the answer uses the portal's wording
    assert 'jobs 80 (SBA 7(a) loan, 2005, lender-reported, an old figure)' in text
    assert 'ownership employee-owned (ESOP) (loan record: ESOP business type)' in text
    # a list that does not give the ownership: the stored basis is shown in the same wording
    undisclosed = {'ownership': 'unknown', 'ownership_basis': 'hand-built list, ownership not disclosed'}
    assert bizdir._ownership_text(undisclosed) == 'ownership unknown (hand-researched list, ownership not disclosed)'
    text, _ = find(segment='ts')
    assert 'revenue $20.0M, stated by a source' in text and 'specialties: it asset disposal; pipettes' in text
    text, _ = find(segment='bpi')
    assert '[email withheld] RESEARCH' in text and '@' not in text   # the data keeps it; the answer does not repeat it


# ---------------------------------------------------------------- website research: ownership filter and old databases

WEB_BASIS, WEB_KEPT = 'company website, read by AI', 'company website, read by AI and re-checked'
WEB = [
    rec(id='pp-20', segment='pp', name='FOUNDER HVAC LLC', city='Lancaster', county='Lancaster', state='PA', zip='17601', naics='238220', trade=HVAC,
        jobs_latest=35, ownership='founder', ownership_basis=WEB_KEPT, website='https://founderhvac.example/', web_coverage='covered',
        web_ownership='Founder-run', web_confidence=0.82, web_rechecked=1, founded=1998, fit_score=91.0,
        web_cue='Founded in 1998 by our owner, who still runs every job. Write to office@founderhvac.example', specialties='boilers; geothermal wells',
        specialties_basis=WEB_BASIS),
    rec(id='pp-21', segment='pp', name='FAMILY PLUMBING INC', city='Lititz', county='Lancaster', state='PA', zip='17543', naics='238220', trade=HVAC,
        jobs_latest=28, ownership='family', ownership_basis=WEB_KEPT, website='https://familyplumbing.example/', web_coverage='covered',
        web_ownership='Family-owned', web_confidence=0.9, web_rechecked=1, web_cue='Now in our third generation of family ownership'),
    rec(id='pp-22', segment='pp', name='ROLLUP MECHANICAL LLC', city='Ephrata', county='Lancaster', state='PA', zip='17522', naics='238220', trade=HVAC,
        jobs_latest=60, ownership='pe', ownership_basis=WEB_BASIS, website='https://rollup.example/', web_coverage='covered',
        web_ownership='PE-backed or acquired', web_confidence=0.66, web_rechecked=0, web_cue='Rollup Mechanical is now part of a national group'),
    rec(id='pp-23', segment='pp', name='QUIET HEATING CO', city='Lancaster', county='Lancaster', state='PA', zip='17602', naics='238220', trade=HVAC,
        jobs_latest=22, ownership='unknown', ownership_basis='company website could not be read', website='https://quiet.example/',
        web_coverage='dead', web_ownership='Unknown', web_confidence=0.9, web_cue='Dead (dns); no content reviewed'),
    rec(id='cet-20', segment='cet', name='WORKER ELECTRIC CO', city='Worcester', county='Worcester', state='MA', zip='01608', naics='238210',
        trade=ELEC, jobs_latest=40, ownership='esop', ownership_basis='SBA loan record (ESOP business type)'),
    rec(id='cet-21', segment='cet', name='SPARKS FRANCHISE LLC', city='Worcester', county='Worcester', state='MA', zip='01608', naics='238210',
        trade=ELEC, jobs_latest=12, ownership='franchisee', ownership_basis=WEB_BASIS, website='https://sparks.example/', web_coverage='covered',
        web_ownership='Franchise unit', web_confidence=0.7, web_cue='An independently owned and operated franchise'),
]


def _gz(d, recs, cols=None):
    raw = str(d / 'businesses.sqlite')
    B.write_sqlite(raw, recs, {'built_at': '2026-11-17T12:00:00+00:00', 'generated': '2026-11-17'}, cols=cols)
    B.gzip_file(raw, str(d / 'businesses.sqlite.gz'))
    return str(d / 'businesses.sqlite.gz')


@pytest.fixture
def web(monkeypatch, tmp_path):
    monkeypatch.setenv('DIRECTORY_PATH', _gz(tmp_path, WEB))
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.delenv('DIRECTORY_URL', raising=False)
    bizdir.reset()
    yield bizdir
    bizdir.reset()


def test_ownership_filter_and_website_lines(web):
    text, sources = find(segment='pp', ownership='founder-run')
    assert text.startswith('BUSINESS DIRECTORY: 1 businesses match (segment Punctual Pros; ownership founder-run).')
    line = [l for l in text.splitlines() if l.startswith('1. ')][0]
    assert 'FOUNDER HVAC LLC' in line and 'ownership founder-run (company website, read by AI and re-checked, 82% likely)' in line
    assert 'website https://founderhvac.example/' in line and 'founded 1998 (its website)' in line
    assert 'its website says: "Founded in 1998 by our owner, who still runs every job. Write to [email withheld]"' in line
    assert 'specialties (its website): boilers; geothermal wells' in line and '@' not in text
    assert any(s['title'].startswith('Overture Maps Places') for s in sources)
    text, _ = find(ownership='founder-or-family', sort='name')
    assert '2 businesses match' in text and 'ownership founder-run or family-owned' in text and 'FAMILY PLUMBING INC' in text
    for words, n, name in (('family-owned', 1, 'FAMILY PLUMBING'), ('PE-backed', 1, 'ROLLUP'), ('employee-owned', 1, 'WORKER ELECTRIC'),
                           ('franchise', 1, 'SPARKS'), ('unknown', 1, 'QUIET HEATING'), ('founder-run, family-owned', 2, 'FOUNDER HVAC')):
        text, _ = find(ownership=words)
        assert f'{n} businesses match' in text and name in text, words
    text, _ = find(ownership='unknown')
    assert 'ownership unknown (company website could not be read)' in text and 'website https://quiet.example/ (could not be read)' in text
    assert 'its website says' not in text   # a dead site's note is not a quote
    text, _ = find(ownership='PE-backed')
    assert 'ownership PE-backed or acquired (company website, read by AI, 66% likely)' in text
    text, _ = find(ownership='martian')
    assert '6 businesses match' in text and 'Ownership "martian" was not recognised and was ignored.' in text
    text, _ = find(query='generation')   # the website quote is in the keyword index where the site was read
    assert '1 businesses match' in text and 'FAMILY PLUMBING INC' in text
    text, _ = find(query='dns')
    assert 'No business matches' in text
    text, _ = find(trade='geothermal')   # website specialties match trade words like researched ones
    assert '1 businesses match' in text and 'FOUNDER HVAC LLC' in text
    d = bizdir.tool_definitions()[0]
    assert 'founder-or-family' in d['input_schema']['properties']['ownership']['enum'] and 'website read by AI' in d['description']


NOTES = [
    rec(id='pp-30', segment='pp', name='REDIRECT HVAC LLC', city='Lancaster', county='Lancaster', state='PA', zip='17601', naics='238220',
        trade=HVAC, jobs_latest=30, ownership='pe', ownership_basis=WEB_BASIS, website='https://redirect.example/', web_coverage='covered',
        web_ownership='PE-backed or acquired', web_confidence=0.7,
        web_cue='home page https://redirect.example redirects to bigco.example; pre-label pe_backed_or_acquired'),
    rec(id='pp-31', segment='pp', name='NOTED HVAC LLC', city='Lancaster', county='Lancaster', state='PA', zip='17601', naics='238220',
        trade=HVAC, jobs_latest=29, ownership='pe', ownership_basis=WEB_BASIS, website='https://noted.example/', web_coverage='covered',
        web_ownership='PE-backed or acquired', web_confidence=0.6, web_note='Known roll-up match: BigCo (on a list of known roll-ups)'),
    rec(id='pp-32', segment='pp', name='CHANGED HVAC LLC', city='Lancaster', county='Lancaster', state='PA', zip='17601', naics='238220',
        trade=HVAC, jobs_latest=28, ownership='family', ownership_basis='company website, read by AI and corrected on re-check',
        website='https://changed.example/', web_coverage='covered', web_ownership='Family-owned', web_confidence=None, web_rechecked=1,
        web_cue='Now run by the third generation of geothermalists', deal_status='unclear'),
]


@pytest.fixture
def notes(monkeypatch, tmp_path):
    monkeypatch.setenv('DIRECTORY_PATH', _gz(tmp_path, NOTES))
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.delenv('DIRECTORY_URL', raising=False)
    bizdir.reset()
    yield bizdir
    bizdir.reset()


def test_reader_notes_are_not_quoted_and_trade_ignores_the_quote(notes):
    text, _ = find(segment='pp', sort='name', limit=10)
    line = {l.split(' | ')[0].split('. ', 1)[1]: l for l in text.splitlines() if l[:1].isdigit() and '. ' in l[:4]}
    assert 'its website says' not in line['REDIRECT HVAC LLC'] and 'pre-label' not in text and '_' not in text.split('Top ')[1]
    assert "the AI reader noted (not the site's words): Known roll-up match: BigCo" in line['NOTED HVAC LLC']
    assert 'its website says' not in line['NOTED HVAC LLC']
    # a call the re-check changed has no probability, and an unclear deal search says what it found
    assert 'ownership family-owned (company website, read by AI and corrected on re-check)' in line['CHANGED HVAC LLC']
    assert '% likely' not in line['CHANGED HVAC LLC']
    assert 'a public news search found no sale, but no dated source confirms the current owner' in line['CHANGED HVAC LLC']
    text, _ = find(query='geothermalists')   # the quote is in the keyword index ...
    assert '1 businesses match' in text and 'CHANGED HVAC LLC' in text
    text, _ = find(trade='geothermalists')   # ... but a trade word never matches quote text
    assert 'No business matches' in text


def test_split_cue_and_email_scrub():
    assert B.split_cue('home page http://x.com/ redirects to ntiva.com (Ntiva); pre-label pe_backed_or_acquired') == \
        (None, 'home page http://x.com/ redirects to ntiva.com (Ntiva)')
    assert B.split_cue('Record roll-up match: EMCOR (rollup_names)') == (None, 'Record roll-up match: EMCOR (on a list of known roll-ups)')
    assert B.split_cue('Since 1987, we have served Boston; no owner stated.') == ('Since 1987, we have served Boston', None)
    assert B.split_cue('She became the owner and president in 2019 (owner-operator, not founder)') == \
        ('She became the owner and president in 2019', None)
    assert B.split_cue('I HIGHLY recommend this company The owner, Bob, was great') == (None, None)
    assert B.split_cue('Great family owned feel! (a customer review, not an ownership statement)') == (None, None)
    assert B.split_cue('Founded in 1998 by John Smith and Mary Jones. Write to office@acme.example') == \
        ('Founded in 1998 by [name] and [name]. Write to', None)
    assert B.split_cue('Owner Erik Gitli runs every job') == ('Owner [name] runs every job', None)
    assert B.split_cue("I'm Allison Kenner, President and Founder of Preferred MedSurg")[0].startswith("I'm [name], President")
    assert B.split_cue('In March of 2022, Microdesk was acquired by Symetri, an Addnode Group company')[0].endswith('Addnode Group company')
    assert B.scrub_email('63 Winsor Ave Somebody02@Hotmail Com') == '63 Winsor Ave'
    assert B.scrub_email('DAVID@EXAMPLEMSP.COM') == '' and B.scrub_email('NET@WORK INC.') == 'NET@WORK INC.'


def test_old_database_without_website_columns(monkeypatch, tmp_path):
    new = {'website', 'web_coverage', 'web_ownership', 'web_confidence', 'web_cue', 'web_note', 'founded', 'web_rechecked', 'fit_score',
           'deal_status', 'deal_buyer', 'deal_date', 'deal_url'}
    old_cols = [c for c in B.COLS if c not in new]
    monkeypatch.setenv('DIRECTORY_PATH', _gz(tmp_path, RECS + EXTRA, cols=old_cols))
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.delenv('DIRECTORY_URL', raising=False)
    bizdir.reset()
    try:
        assert bizdir.ready() is True and 'website' not in bizdir._cols()
        text, sources = find(limit=100)
        assert '16 businesses match' in text and 'website' not in text.split('Top ')[1] and 'Traceback' not in text
        assert not any(s['title'].startswith('Overture') for s in sources)
        text, _ = find(ownership='founder-or-family')
        assert '2 businesses match' in text and 'LEGAL IT PARTNERS LLC' in text and 'GRIFFIN ELECTRIC INC' in text
        assert 'built before the website research' in text
        text, _ = find(ownership='employee-owned')
        assert '1 businesses match' in text and 'RIVER ELECTRIC CO' in text
        text, _ = find(trade='disposal')
        assert '1 businesses match' in text and 'STATED LAB CO' in text
    finally:
        bizdir.reset()


# ---------------------------------------------------------------- concurrent first calls

class _Counting(_Quiet):
    def do_GET(self):
        self.server.hits[self.path] = self.server.hits.get(self.path, 0) + 1
        if self.path.endswith('.gz'):
            time.sleep(self.server.delay)
        super().do_GET()


def _counting_site(root, delay):
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Counting, directory=root))
    httpd.hits, httpd.delay = {}, delay
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'


def _race(n):
    gate, out = threading.Barrier(n), []

    def go():
        gate.wait()
        out.append(bizdir.ready())
    ts = [threading.Thread(target=go) for _ in range(n)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(30)
    return out


@pytest.mark.parametrize('good', [True, False])
def test_concurrent_first_calls_download_once(monkeypatch, tmp_path, fixture_files, good):
    root = tmp_path / 'site'
    d = root / 'data' / 'ppp' / 'directory'
    d.mkdir(parents=True)
    shutil.copy(fixture_files['gz'], d / 'businesses.sqlite.gz')
    sha = fixture_files['sha'] if good else '0' * 64   # a bad checksum makes every load fail
    (d / 'index.json').write_text(json.dumps({'sqlite': {'bytes': fixture_files['gz_bytes'], 'sha256': sha}}))
    httpd, url = _counting_site(str(root), 0.5)
    monkeypatch.delenv('DIRECTORY_PATH', raising=False)
    monkeypatch.setenv('DIRECTORY_TMP', str(tmp_path / 'tmp'))
    monkeypatch.setenv('DIRECTORY_URL', url + 'data/ppp/directory/businesses.sqlite.gz')
    bizdir.reset()
    try:
        t0 = time.monotonic()
        out = _race(4)
        assert out == [good] * 4
        assert httpd.hits.get('/data/ppp/directory/businesses.sqlite.gz') == 1   # the callers that waited kept the back-off
        assert time.monotonic() - t0 < 3
    finally:
        bizdir.reset()
        httpd.shutdown()
        httpd.server_close()


def test_switched_off(monkeypatch):
    monkeypatch.delenv('DIRECTORY_PATH', raising=False)
    monkeypatch.setenv('DIRECTORY_URL', 'off')
    bizdir.reset()
    assert bizdir.enabled() is False and bizdir.ready() is False and bizdir.status()['enabled'] is False
    text, _ = find(segment='pp')
    assert 'unavailable right now (the tool is switched off)' in text
    bizdir.reset()


# ---------------------------------------------------------------- through /chat

@pytest.fixture(scope='module')
def stack(tmp_path_factory, fixture_files, site):
    d = tmp_path_factory.mktemp('dirstack')
    mport, sport = procs.free_port(), procs.free_port()
    started = []
    try:
        mock = procs.start_mock(mport, str(d / 'mock.log'))
        started.append(mock)
        srv = procs.start_server(sport, str(d / 'server.log'), str(d / 'server.db'), mport,
                                 DIRECTORY_URL=site.url + 'data/ppp/directory/businesses.sqlite.gz', DIRECTORY_TMP=str(d / 'tmp'))
        started.append(srv)
        yield {'mock': f'http://127.0.0.1:{mport}', 'main': f'http://127.0.0.1:{sport}'}
    finally:
        for p in reversed(started):
            p.stop()


def _chat(base, question, persona='portal'):
    headers = {'Origin': 'https://syedr64.github.io', 'Content-Type': 'application/json', 'X-Real-IP': '198.51.100.7'}
    events, buf = [], ''
    with httpx.stream('POST', base + '/chat', headers=headers, json={'question': question, 'persona': persona}, timeout=60) as r:
        for piece in r.iter_text():
            buf += piece
            while '\n\n' in buf:
                raw, buf = buf.split('\n\n', 1)
                data = ''.join(l[5:].lstrip() for l in raw.split('\n') if l.startswith('data:'))
                if data:
                    events.append(json.loads(data))
    return events


def test_chat_round_trip_downloads_on_first_use(stack):
    h = httpx.get(stack['main'] + '/health').json()
    assert h['directory']['enabled'] is True and h['directory']['loaded'] is False   # /health does not download
    httpx.delete(stack['mock'] + '/_requests')
    args = {'segment': 'pp', 'trade': 'HVAC', 'county': 'Lancaster', 'state': 'PA', 'jobs_min': 20, 'jobs_max': 60, 'exclude_sold_since': '2023'}
    plan = base64.urlsafe_b64encode(json.dumps([['find_businesses', args]]).encode()).decode().rstrip('=')
    events = _chat(stack['main'], f'HVAC contractors in Lancaster County with 20 to 60 jobs not sold since 2023 [mock:plan:{plan}]')
    reqs = httpx.get(stack['mock'] + '/_requests').json()
    assert events[-1]['type'] == 'done' and len(reqs) == 2
    tools = [t.get('name') for t in reqs[0]['body']['tools']]
    assert 'find_businesses' in tools and '13. Business directory' in reqs[0]['body']['system'][0]['text']
    assert {'type': 'status', 'text': 'Searching the business directory for HVAC in Lancaster County, PA'} in events
    res = reqs[1]['body']['messages'][-1]['content'][0]
    assert not res.get('is_error') and res['content'].startswith('Sources for this result (cite them as [n]):\n[')
    assert 'BUSINESS DIRECTORY: 1 businesses match' in res['content'] and 'ACME HEATING & COOLING INC' in res['content']
    final = [e for e in events if e['type'] == 'sources'][-1]['sources']
    assert any(s['title'] == 'SBA Paycheck Protection Program loan data (FOIA)' for s in final)
    h = httpx.get(stack['main'] + '/health').json()
    assert h['directory']['loaded'] is True and h['directory']['rows'] == len(RECS) and h['directory']['source'] == 'download'
    s = httpx.get(stack['main'] + '/stats').json()
    assert s['directory']['loaded'] is True and s['directory']['built_at'] == '2026-11-17T12:00:00+00:00'


def test_concept_sites_never_get_the_directory(stack):
    plan = base64.urlsafe_b64encode(json.dumps([['find_businesses', {'segment': 'pp'}]]).encode()).decode().rstrip('=')
    for persona in ('pp', 'fl'):
        httpx.delete(stack['mock'] + '/_requests')
        events = _chat(stack['main'], f'List HVAC firms [mock:plan:{plan}]', persona=persona)
        reqs = httpx.get(stack['mock'] + '/_requests').json()
        assert 'find_businesses' not in [t.get('name') for t in reqs[0]['body'].get('tools') or []]
        assert 'Business directory' not in reqs[0]['body']['system'][0]['text']
        res = reqs[1]['body']['messages'][-1]['content'][0]
        assert res['is_error'] is True and res['content'] == 'Unknown tool find_businesses.' and events[-1]['type'] == 'done'
