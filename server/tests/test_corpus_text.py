"""Text clean-up in scripts/build_corpus.py (the knowledge-base build): repo paths go, source URLs stay whole, benchmarks name their industry."""
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location('build_corpus', os.path.join(ROOT, 'scripts', 'build_corpus.py'))
bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bc)

KEEP = ['https://www.sec.gov/Archives/edgar/data/0000880430/000095013599001734/0000950135-99-001734.txt',
        'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/StormEvents_details-ftp_v1.0_d2019_c20260323.csv.gz',
        'https://www2.census.gov/econ/bps/County/co2024a.txt\nNotes: ACS', 'https://data.bls.gov/cew/data/api/2024/a/area/42071.csv',
        'https://vibe.co/llms.txt', 'fairharborclothing.com/robots.txt contains', 'on llms.txt; blog says', '(data/insights, health, energy, AI policy)',
        'Publicis (data/tech-led)', 'the server/ folder deploys']


def test_scrub_keeps_urls_and_prose():
    for t in KEEP:
        assert bc.scrub_paths(t) == t, t


def test_scrub_drops_repo_and_machine_paths():
    assert bc.scrub_paths('Benchmarks (data/research/bpi_filings.json, low confidence).') == 'Benchmarks.'
    for t in ('scripts/classify_ownership.py', '/Users/x/BSP/data/a.json', 'file:///Users/x/BSP/data/x.json', '2024_Gaz_zcta_national.txt'):
        assert bc.scrub_paths(f'see {t} here') .split() == ['see', 'here'], t
    assert bc.scrub_paths('a; data/x.json; ; b') == 'a; b'
    assert bc.scrub_paths('https://a.com/x; https://b.com/y; data/z.json') == 'https://a.com/x; https://b.com/y; '   # URLs never glued


def test_benchmark_paragraphs_name_their_industry():
    it = {'naics': '541513', 'industry': 'Computer Facilities Management Services', 'parent_industry': 'Computer Systems Design', 'parent_naics': '5415',
          'all_sizes': {'firms': 3000, 'employees': 90000, 'receipts_per_employee_2025': 210000, 'receipts_per_employee_2022': 190000, 'payroll_share': 0.4},
          'parent_all_sizes': {'receipts_per_employee_2025': 230000},
          'band_5_to_299': {'receipts_per_employee_2025_min': 150000, 'receipts_per_employee_2025_max': 260000, 'payroll_share_min': 0.3, 'payroll_share_max': 0.5},
          'detailed': [{'size_class': '5-9', 'receipts_per_employee_2025': 180000, 'payroll_share': 0.42, 'firms': 400, 'reliable': True},
                       {'size_class': '400-499', 'receipts_per_employee_2025': 250000, 'payroll_share': 0.38, 'firms': 9, 'reliable': False}]}
    paras = bc.benchmark_text(it).split('\n\n')
    assert len(paras) == 2 and all(len(p) < bc.CHUNK_CHARS for p in paras) and all('Computer Facilities Management Services (NAICS 541513; managed IT services firms)' in p for p in paras)
    assert '$210,000 in 2025 dollars' in paras[0] and '(thin data)' in paras[1]
