#!/usr/bin/env python3
"""All-business directory: one record per business in the six SBA loan segments, for the portal and for BSP Desk.

Standard library only. No network calls. The same inputs always give the same output (apart from the build date).

Input
  --candidates  ppp_candidates.json from scripts/build_ppp_screen.py (the business-level view: every deduplicated business
                in all six segments, with its PPP and SBA 7(a)/504 links). Its rows already carry the stable business id (cid).
  --cid-map     cid_map.json from the same run ({business key: cid}); used to check that every id is the stable one.
  --zcta        US Census ZCTA gazetteer (2024_Gaz_zcta_national.txt) for ZIP centroids.
  data/ppp/<segment>_ppp.json, _sba7a.json, _sba504.json   the published loan rows (county, first-draw amount, SBA jobs).
  data/research/ma_ppp_screen.json   the researched SBA screen (ownership, specialties, revenue from research).
  data/research/revenue_benchmarks.json and scripts/estimate_revenue.py   the revenue model (imported, not changed).

Output
  data/ppp/directory/<segment>.json      columnar JSON (the portal's format; assets/core.js decodes it). A segment over
                                         --split-mb is written as <segment>-<STATE>.json files plus a small <segment>.json
                                         that lists them.
  data/ppp/directory/businesses.sqlite.gz   SQLite with the same records, an FTS5 index on name, dba, city and trade, and
                                         indexes on segment, state, zip, naics, jobs, revenue and distance; gzip-compressed.
                                         Served by the site; server/directory.py downloads it on first use.
  data/ppp/directory/index.json          build date, counts, file sizes, sha256 of the gz and field notes.

Field rules
  jobs_ppp            PPP JobsReported (max over the business's PPP loans; borrower-reported, 2020-21).
  jobs_sba            JobsSupported on the latest SBA 7(a)/504 loan (lender-reported), when that row is in the published files.
  jobs_latest         The latest figure on record and its source (the screen's rule: the latest SBA loan's JobsSupported when
                      it came after the last PPP loan, else PPP JobsReported).
  ppp_first_draw_usd  Sum of CurrentApprovalAmount over first-draw loans (ProcessingMethod PPP); second draws apart.
  county              PPP ProjectCountyName (most common over the business's loans), else the SBA ProjectCounty of a loan
                      with the same name and ZIP, else the most common county of every loan in that ZIP (county_basis says which).
  lat, lon            ZCTA centroid of the ZIP (geo_precision 'zip'), else the mean of the ZIP3 ('zip3').
  dist_hub_mi         Straight-line miles to the nearest BSP hub: Punctual Pros (Lancaster PA, Toms River NJ) and CET
                      (Worcester, Taunton, Norwell MA) only, as the screen computed it.
  trade               A plain label for the NAICS code. specialties is the researched list for a business on the SBA screen,
                      else the plain NAICS label only (specialties_basis says so).
  ownership           Researched ownership for a business on the SBA screen; the hand-built list's call when it has one;
                      'esop' from the SBA business type; else 'unknown'.
  revenue_*           The SBA screen's figures where the business is on the screen (the same Census model with checked
                      inputs; revenue_basis 'researched model'). Otherwise MODELLED with
                      scripts/estimate_revenue.py (Census SUSB 2022 receipts per employee and payroll shares, CPI-U to 2025,
                      PPP payroll), never reported by the company. Industry codes with no Census benchmark in
                      revenue_benchmarks.json (older 315xxx apparel codes) use the closest benchmarked apparel code, with a
                      note and one step less confidence.

Usage
  python3 scripts/build_business_directory.py --candidates .../ppp_candidates.json --cid-map .../cid_map.json \\
      --zcta .../2024_Gaz_zcta_national.txt [--work /tmp/dir] [--split-mb 25]
"""
import argparse, collections, datetime, gzip, hashlib, json, os, re, shutil, sqlite3, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import estimate_revenue as REV          # noqa: E402  the revenue model (read only)
from build_ppp_screen import split_dba, compact, zip5, load_zcta   # noqa: E402  the screen's own name and ZIP keys

SEGS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
SEG_LABEL = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}
OUT_DIR = os.path.join(ROOT, 'data', 'ppp', 'directory')

TRADE = {
    '237110': 'water and sewer line contractor', '238210': 'electrical contractor', '238220': 'HVAC and plumbing contractor',
    '423450': 'medical and lab supply distributor', '423490': 'lab and scientific supply distributor',
    '424690': 'chemical and lab supply distributor', '424350': 'clothing wholesaler',
    '541512': 'IT services firm (computer systems design)', '541513': 'IT services firm (computer facilities management)',
    '541519': 'IT services firm (other computer services)', '541820': 'public relations firm', '541910': 'market and opinion research firm',
    '315110': 'apparel maker (hosiery and socks)', '315111': 'apparel maker (sheer hosiery)', '315119': 'apparel maker (hosiery and socks)',
    '315120': 'apparel maker (knitting mill)', '315190': 'apparel maker (knitting mill)', '315191': 'apparel maker (knit outerwear)',
    '315192': 'apparel maker (knit underwear and nightwear)', '315210': 'apparel maker (cut and sew contractor)',
    '315211': "apparel maker (men's cut and sew contractor)", '315212': "apparel maker (women's cut and sew contractor)",
    '315220': "apparel maker (men's and boys' clothing)", '315221': "apparel maker (men's underwear and nightwear)",
    '315222': "apparel maker (men's suits and coats)", '315223': "apparel maker (men's shirts)", '315224': "apparel maker (men's trousers)",
    '315225': 'apparel maker (work clothing)', '315228': "apparel maker (men's outerwear)", '315231': "apparel maker (women's lingerie)",
    '315232': "apparel maker (women's blouses and shirts)", '315233': "apparel maker (women's dresses)",
    '315234': "apparel maker (women's suits and coats)", '315239': "apparel maker (women's outerwear)",
    '315240': "apparel maker (women's and children's clothing)", '315250': 'apparel maker (cut and sew)',
    '315280': 'apparel maker (cut and sew)', '315291': "apparel maker (infants' clothing)", '315292': 'apparel maker (fur and leather)',
    '315299': 'apparel maker (cut and sew)', '315990': 'apparel maker (accessories and other apparel)',
    '315991': 'apparel maker (hats and caps)', '315992': 'apparel maker (gloves)', '315993': 'apparel maker (neckwear)',
    '315999': 'apparel maker (accessories and other apparel)',
}
# Codes with no Census benchmark in revenue_benchmarks.json -> the closest benchmarked code (same 5-digit family).
BENCH_PROXY_PREFIX = [('3151', '315190'), ('3152', '315280'), ('3159', '315990')]
SBA_LATEST_RX = re.compile(r'^(7\(a\)|504), (\d{4}-\d{2}-\d{2}), \$([\d,]+(?:\.\d+)?), (.*)$')
STATE_NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut',
    'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana',
    'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
    'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands', 'AS': 'American Samoa', 'MP': 'Northern Mariana Islands',
}

# Column order of a directory record (the SQLite table and the columnar JSON share it).
COLS = [
    'id', 'segment', 'name', 'dba', 'address', 'city', 'county', 'county_basis', 'state', 'zip', 'lat', 'lon', 'geo_precision',
    'naics', 'trade', 'specialties', 'specialties_basis', 'business_type', 'franchise', 'nonprofit', 'person_named',
    'jobs_ppp', 'jobs_sba', 'jobs_latest', 'jobs_latest_source', 'ppp_loans', 'ppp_total_usd', 'ppp_first_draw_usd',
    'ppp_second_draw_usd', 'ppp_first_approved', 'ppp_loan_numbers', 'sba_loans', 'sba_latest_program', 'sba_latest_date',
    'sba_latest_amount_usd', 'sba_latest_status', 'change_of_ownership_date', 'change_of_ownership_recent', 'dist_hub_mi',
    'nearest_hub', 'on_sba_screen', 'screen_rank', 'hand_built_list_id', 'hand_built_list_name', 'pe_list_match', 'ownership',
    'ownership_basis', 'revenue_est_usd', 'revenue_low_usd', 'revenue_high_usd', 'revenue_basis', 'revenue_confidence',
    'revenue_methods', 'revenue_benchmark_naics', 'revenue_note', 'source', 'data_source',
]
SQL_TYPES = {'lat': 'REAL', 'lon': 'REAL', 'dist_hub_mi': 'REAL', 'ppp_total_usd': 'REAL', 'ppp_first_draw_usd': 'REAL',
             'ppp_second_draw_usd': 'REAL', 'sba_latest_amount_usd': 'REAL'}
INT_COLS = {'jobs_ppp', 'jobs_sba', 'jobs_latest', 'ppp_loans', 'sba_loans', 'screen_rank', 'revenue_est_usd', 'revenue_low_usd',
            'revenue_high_usd', 'nonprofit', 'person_named', 'change_of_ownership_recent', 'on_sba_screen'}
JSON_SKIP = {'revenue_note'}   # long per-row text: in SQLite only (the assistant reads it); the portal shows the figures


def title_county(s):
    s = re.sub(r'\s+', ' ', (s or '').strip())
    if not s or s.upper() in ('NONE', 'N/A', 'UNKNOWN'):
        return ''
    s = re.sub(r'\s+COUNTY$', '', s, flags=re.I)
    return ' '.join(w.capitalize() if not re.match(r"^(of|the|and)$", w, re.I) else w.lower() for w in s.split(' ')).replace("'S", "'s")


_SURR = re.compile(r'[\udc80-\udcff]')


def clean(v):
    """A byte the SBA file holds that is not valid UTF-8 (read with surrogateescape) shown as its Latin-1 character (0xBF is ¿),
    as the published loan files show it."""
    return _SURR.sub(lambda m: bytes([ord(m.group()) - 0xDC00]).decode('latin-1'), v) if isinstance(v, str) else v


def num(x):
    try:
        return float(str(x).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def load_sba(ppp_dir):
    """Every published 7(a)/504 row, decoded: [(program, row)]."""
    out = []
    for seg in SEGS:
        for prog in ('sba7a', 'sba504'):
            p = os.path.join(ppp_dir, f'{seg}_{prog}.json')
            if not os.path.exists(p):
                continue
            d = json.load(open(p, encoding='utf-8'))
            cols, en = d['cols'], d['enums']
            for r in d['rows']:
                out.append(('504' if prog == 'sba504' else '7(a)', {c: (en[c][v] if c in en and v is not None else v) for c, v in zip(cols, r)}))
    return out


def bench_for(naics, bench_by):
    """(benchmark NAICS, proxy note or None) for an industry code."""
    if naics in bench_by:
        return naics, None
    for pre, code in BENCH_PROXY_PREFIX:
        if str(naics).startswith(pre) and code in bench_by:
            return code, (f'No Census benchmark for NAICS {naics}; benchmarked on {code} ({bench_by[code]["industry"]}), '
                          f'the closest code with one.')
    return None, None


def write_columnar(path, meta, recs, cols):
    """The portal's columnar JSON (scripts/compact_sales.py; assets/core.js Data.decode)."""
    enums, rows = {}, []
    n = len(recs)
    for c in cols:
        vals = [r.get(c) for r in recs]
        if all(isinstance(v, str) or v is None for v in vals):
            card = len(set(vals))
            if card <= 5000 and card < max(2, n * 0.5):
                enums[c] = sorted(set(v for v in vals if v is not None))
    idx = {c: {v: i for i, v in enumerate(o)} for c, o in enums.items()}
    for r in recs:
        row = []
        for c in cols:
            v = r.get(c)
            if v is not None and c in idx:
                v = idx[c][v]
            elif isinstance(v, float):
                v = round(v, 5)
            row.append(v)
        rows.append(row)
    meta = dict(meta, item_count=len(rows))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'format': 'columnar', 'meta': meta, 'cols': cols, 'enums': enums, 'rows': rows}, f, separators=(',', ':'), ensure_ascii=False)
    return os.path.getsize(path)


def write_sqlite(raw, recs, meta):
    """The directory database: table businesses (COLS), FTS5 table biz_fts over name, dba, city and trade (with the researched
    specialties), indexes for the tool's filters and sorts, and a meta table (JSON values). Returns the meta written."""
    if os.path.exists(raw):
        os.remove(raw)
    con = sqlite3.connect(raw)
    con.execute('PRAGMA journal_mode=OFF')
    con.execute('PRAGMA synchronous=OFF')
    con.execute('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)')
    defs = ', '.join(f'{c} {SQL_TYPES.get(c, "INTEGER" if c in INT_COLS else "TEXT")}' for c in COLS if c != 'id')
    con.execute(f'CREATE TABLE businesses (rid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, {defs})')
    con.executemany(f'INSERT INTO businesses ({", ".join(COLS)}) VALUES ({", ".join("?" * len(COLS))})',
                    [[x.get(c) for c in COLS] for x in sorted(recs, key=lambda x: (x['segment'], x['state'], x['name']))])
    con.execute("CREATE VIRTUAL TABLE biz_fts USING fts5(name, dba, city, trade, content='businesses', content_rowid='rid', "
                "tokenize='unicode61 remove_diacritics 2')")
    con.execute("INSERT INTO biz_fts(rowid, name, dba, city, trade) SELECT rid, name, dba, city, trade || ' ' || COALESCE(specialties, '') FROM businesses")
    for c in ('segment', 'state', 'zip', 'naics', 'jobs_latest', 'revenue_est_usd', 'dist_hub_mi', 'county'):
        con.execute(f'CREATE INDEX ix_{c} ON businesses({c})')
    con.execute('CREATE INDEX ix_seg_state ON businesses(segment, state)')
    meta = dict(meta, rows=len(recs), rows_by_segment=dict(collections.Counter(x['segment'] for x in recs)),
                rows_by_state=dict(con.execute('SELECT state, COUNT(*) FROM businesses GROUP BY state ORDER BY 2 DESC').fetchall()),
                revenue_coverage=dict(collections.Counter(x.get('revenue_basis') for x in recs)))
    con.executemany('INSERT INTO meta (k, v) VALUES (?, ?)', [(k, json.dumps(v)) for k, v in meta.items()])
    con.commit()
    con.execute("INSERT INTO biz_fts(biz_fts) VALUES('optimize')")
    con.commit()
    con.execute('VACUUM')
    con.close()
    return meta


def gzip_file(raw, gz):
    """gzip -9 with a fixed mtime (same input, same bytes). Returns (raw bytes, gz bytes, sha256 of the gz)."""
    with open(raw, 'rb') as fi, open(gz, 'wb') as fz, gzip.GzipFile(filename='businesses.sqlite', mode='wb', compresslevel=9, fileobj=fz, mtime=0) as fo:
        shutil.copyfileobj(fi, fo, 1 << 20)
    h = hashlib.sha256()
    with open(gz, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return os.path.getsize(raw), os.path.getsize(gz), h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--candidates', required=True)
    ap.add_argument('--cid-map', required=True)
    ap.add_argument('--zcta', required=True)
    ap.add_argument('--ppp-dir', default=os.path.join(ROOT, 'data', 'ppp'))
    ap.add_argument('--screen', default=os.path.join(ROOT, 'data', 'research', 'ma_ppp_screen.json'))
    ap.add_argument('--benchmarks', default=REV.BENCH)
    ap.add_argument('--out-dir', default=OUT_DIR)
    ap.add_argument('--work', default=None, help='where the raw .sqlite is built before gzip (default: next to the output)')
    ap.add_argument('--split-mb', type=float, default=25.0)
    ap.add_argument('--generated', default=None)
    a = ap.parse_args()
    t0 = time.time()
    generated = a.generated or datetime.date.today().isoformat()
    os.makedirs(a.out_dir, exist_ok=True)

    cand = json.load(open(a.candidates, encoding='utf-8'))
    bcols = cand['businesses']['cols']
    ci = {c: i for i, c in enumerate(bcols)}
    brows = cand['businesses']['rows']
    cid_map = json.load(open(a.cid_map, encoding='utf-8'))
    cid_known = set(cid_map.values())
    shortlist_rank = {s['cid']: s.get('rank') for s in cand.get('shortlist') or []}
    as_of_coo_cut = cand['meta'].get('change_of_ownership_recent_cutoff')
    print(f'candidates: {len(brows):,} businesses; cid map {len(cid_map):,}', flush=True)

    zpts, z3c = load_zcta(a.zcta)
    loans = REV.load_ppp(a.ppp_dir)
    sba = load_sba(a.ppp_dir)
    print(f'loaded: {len(zpts):,} ZCTAs, {len(loans):,} PPP loans, {len(sba):,} SBA 7(a)/504 rows ({time.time() - t0:.0f} s)', flush=True)

    # county: by ZIP (majority over every loan), by SBA name+ZIP key; SBA rows by (date, amount, state) for the latest loan's jobs
    zip_county = collections.defaultdict(collections.Counter)
    for x in loans.values():
        z = zip5(x.get('BorrowerZip'), x.get('ProjectZip'))
        c = title_county(x.get('ProjectCountyName'))
        if z and c:
            zip_county[(z, x.get('ProjectState') or x.get('BorrowerState'))][c] += 1
    sba_by_key = collections.defaultdict(list)
    sba_by_loan = collections.defaultdict(list)
    for prog, x in sba:
        z = zip5(x.get('BorrZip'))
        legal, _ = split_dba(x.get('BorrName') or '')
        sba_by_key[(compact(legal), z)].append((prog, x))
        amt = num(x.get('GrossApproval'))
        sba_by_loan[(prog, (x.get('ApprovalDate') or '')[:10], round(amt or 0), (x.get('BorrState') or '').strip())].append(x)
        c = title_county(x.get('ProjectCounty'))
        if z and c:
            zip_county[(z, (x.get('ProjectState') or x.get('BorrState') or '').strip())][c] += 1

    screen = {x['id']: x for x in json.load(open(a.screen, encoding='utf-8'))['items']}
    bench = json.load(open(a.benchmarks, encoding='utf-8'))
    bmeta = bench['meta']
    bench_by = {x['naics']: x for x in bench['items']}
    stated = {x['id']: x for x in bmeta.get('stated_revenue') or []}

    recs = []
    miss = collections.Counter()
    for r in brows:
        g = lambda c: r[ci[c]]
        cid = g('cid')
        if cid not in cid_known:
            miss['cid_not_in_map'] += 1
        seg, name, dba = g('segment'), g('name') or '', g('dba') or ''
        if dba.upper() in ('NONE', 'N/A', 'NA'):
            dba = ''
        state, z, naics = (g('state') or '').strip(), zip5(g('zip')), str(g('naics') or '')
        nums = [str(x) for x in (g('ppp_loan_numbers') or [])]
        lrows = [loans[k] for k in nums if k in loans]
        miss['ppp_loan_not_found'] += len(nums) - len(lrows)
        first = [x for x in lrows if x.get('ProcessingMethod') == 'PPP']
        second = [x for x in lrows if x.get('ProcessingMethod') == 'PPS']
        # geography
        p = zpts.get(z)
        lat, lon, prec = (p[0], p[1], 'zip') if p else ((z3c[z[:3]][0], z3c[z[:3]][1], 'zip3') if z and z[:3] in z3c else (None, None, None))
        if lat is None:
            miss['no_latlon'] += 1
        cc = collections.Counter(title_county(x.get('ProjectCountyName')) for x in lrows if title_county(x.get('ProjectCountyName')))
        county, cbasis = (cc.most_common(1)[0][0], 'ppp') if cc else ('', '')
        legal, _ = split_dba(name)
        skey = sba_by_key.get((compact(legal), z)) or []
        if not county:
            sc = collections.Counter(title_county(x.get('ProjectCounty')) for _, x in skey if title_county(x.get('ProjectCounty')))
            if sc:
                county, cbasis = sc.most_common(1)[0][0], 'sba'
        if not county and z:
            zc = zip_county.get((z, state))
            if zc:
                county, cbasis = zc.most_common(1)[0][0], 'zip'
        if not county:
            miss['no_county'] += 1
        # latest SBA loan
        prog = sdate = sstatus = None
        samt = None
        jobs_sba = None
        m = SBA_LATEST_RX.match(g('sba_latest_loan') or '')
        if m:
            prog, sdate, samt, sstatus = m.group(1), m.group(2), float(m.group(3).replace(',', '')), m.group(4)
            cands = sba_by_loan.get((prog, sdate, round(samt), state)) or []
            if len(cands) > 1:
                cands = [x for x in cands if zip5(x.get('BorrZip')) == z] or cands
            if cands:
                js = num(cands[0].get('JobsSupported'))
                jobs_sba = int(round(js)) if js is not None else None
            else:
                miss['sba_latest_row_not_found'] += 1
        elif g('sba_latest_loan'):
            miss['sba_latest_unparsed'] += 1
        jl_src = g('jobs_latest_source') or ''
        jobs_latest = g('jobs_latest') if jl_src != 'none reported' else None
        if jobs_sba is None and jl_src.startswith('SBA'):
            jobs_sba = jobs_latest
        jobs_ppp = g('jobs_reported') if g('source') != 'sba_only' else None
        # lists
        hb = g('on_existing_list') or ''
        hm = re.match(r'^(\S+) \((.*)\)$', hb)
        hb_id, hb_name = (hm.group(1), hm.group(2)) if hm else ((hb, '') if hb else ('', ''))
        scr = screen.get(cid)
        trade = TRADE.get(naics) or ('apparel maker' if naics.startswith('315') else f'NAICS {naics}')
        rec = {
            'id': cid, 'segment': seg, 'name': name, 'dba': dba, 'address': g('address') or '', 'city': g('city') or '', 'county': county,
            'county_basis': cbasis, 'state': state, 'zip': z, 'lat': round(lat, 5) if lat is not None else None,
            'lon': round(lon, 5) if lon is not None else None, 'geo_precision': prec, 'naics': naics, 'trade': trade,
            'business_type': g('business_type') or '', 'franchise': g('franchise_name') or '', 'nonprofit': int(bool(g('nonprofit'))),
            'person_named': int(bool(g('person_named'))), 'jobs_ppp': jobs_ppp, 'jobs_sba': jobs_sba, 'jobs_latest': jobs_latest,
            'jobs_latest_source': jl_src, 'ppp_loans': g('loans') or 0, 'ppp_total_usd': g('loan_total_usd') or None,
            'ppp_first_draw_usd': round(sum(num(x.get('CurrentApprovalAmount')) or 0 for x in first), 2) if first else None,
            'ppp_second_draw_usd': round(sum(num(x.get('CurrentApprovalAmount')) or 0 for x in second), 2) if second else None,
            'ppp_first_approved': g('date_approved') or None, 'ppp_loan_numbers': ','.join(nums) or None,
            'sba_loans': g('sba_loans') or 0, 'sba_latest_program': prog, 'sba_latest_date': sdate, 'sba_latest_amount_usd': samt,
            'sba_latest_status': sstatus, 'change_of_ownership_date': g('change_of_ownership') or None,
            'change_of_ownership_recent': int(bool(g('change_of_ownership_recent'))),
            'dist_hub_mi': g('dist_mi'), 'nearest_hub': g('nearest_hub') or None, 'on_sba_screen': int(scr is not None),
            'screen_rank': shortlist_rank.get(cid), 'hand_built_list_id': hb_id or None, 'hand_built_list_name': hb_name or None,
            'pe_list_match': g('pe_backed_flag') or None, 'source': g('source'),
            'data_source': ('SBA PPP loan data (FOIA, as of 2024-09-30)' if g('source') == 'ppp' else
                            'SBA 7(a)/504 loan data (FOIA, as of 2026-09-30)' if g('source') == 'sba_only' else
                            'SBA PPP and 7(a)/504 loan data (FOIA)'),
        }
        # specialties and ownership
        if scr and scr.get('specialties'):
            rec['specialties'], rec['specialties_basis'] = '; '.join(scr['specialties']), 'researched'
        else:
            rec['specialties'], rec['specialties_basis'] = trade, 'NAICS trade label only (not researched)'
        own = (g('ownership') or '').strip()
        if scr:
            rec['ownership'], rec['ownership_basis'] = scr.get('ownership') or 'unverified', 'researched (SBA screen)'
        elif own == 'esop' and not hb:   # set from the SBA business type "Employee Stock Ownership Plan(ESOP)", not from a list
            rec['ownership'], rec['ownership_basis'] = own, 'SBA loan record (ESOP business type)'
        elif own and own not in ('unverified', 'unknown'):
            rec['ownership'], rec['ownership_basis'] = own, 'hand-built list'
        else:
            rec['ownership'], rec['ownership_basis'] = 'unknown', 'not researched'
        # revenue
        if scr and scr.get('revenue_est_usd'):
            rec.update({'revenue_est_usd': scr.get('revenue_est_usd'), 'revenue_low_usd': scr.get('revenue_est_low_usd'),
                        'revenue_high_usd': scr.get('revenue_est_high_usd'),
                        'revenue_basis': 'researched ' + (scr.get('revenue_basis') or 'model'),
                        'revenue_confidence': scr.get('revenue_confidence'), 'revenue_methods': scr.get('revenue_method'),
                        'revenue_benchmark_naics': None, 'revenue_note': scr.get('revenue_note') or ''})
        else:
            bn, pnote = bench_for(naics, bench_by)
            t = {'id': cid, 'segment': seg, 'naics': bn or naics, 'jobs_latest': jobs_latest, 'jobs_source': jl_src, 'company': name}
            s = {'segment': seg, 'naics': bn or naics, 'jobs_latest_source': jl_src, 'full_data_keys': {'ppp_loan_numbers': nums}}
            if bn is None:
                e = {'revenue_est_usd': None, 'basis': 'none', 'confidence': None, 'confidence_note': f'No Census benchmark for NAICS {naics}.'}
            else:
                try:
                    e = REV.estimate_one(t, s, bench_by, bmeta, loans, stated)
                except ZeroDivisionError:
                    # estimate_revenue.py divides by a method that rounds to $0 (a tiny PPP loan or one job): retry without the
                    # PPP loans (headcount method only) and say so. Reported to the owner of that script; not changed here.
                    miss['revenue_zero_method_retry'] += 1
                    e = REV.estimate_one(t, dict(s, full_data_keys={'ppp_loan_numbers': []}), bench_by, bmeta, loans, stated)
                    if e.get('revenue_est_usd'):
                        e['confidence'] = 'low'
                        e['confidence_note'] = ('The payroll method rounds to $0 on this PPP loan, so only the headcount method is used. '
                                                + (e.get('confidence_note') or ''))
            note = e.get('confidence_note') or ''
            conf = e.get('confidence')
            if pnote and e.get('revenue_est_usd'):
                note = (pnote + ' ' + note).strip()
                if conf in REV.LEVELS:
                    conf = REV.LEVELS[max(0, REV.LEVELS.index(conf) - 1)]
            rec.update({'revenue_est_usd': e.get('revenue_est_usd'), 'revenue_low_usd': e.get('revenue_low_usd'),
                        'revenue_high_usd': e.get('revenue_high_usd'),
                        'revenue_basis': e.get('basis') if e.get('revenue_est_usd') else 'none', 'revenue_confidence': conf,
                        'revenue_methods': '+'.join(e.get('midpoint_methods') or e.get('methods_used') or []) or None,
                        'revenue_benchmark_naics': bn if bn != naics else None, 'revenue_note': note})
            if not e.get('revenue_est_usd'):
                miss['no_revenue'] += 1
                rec.update({'revenue_est_usd': None, 'revenue_low_usd': None, 'revenue_high_usd': None, 'revenue_confidence': None})
        for c in INT_COLS:
            if rec.get(c) is not None:
                rec[c] = int(rec[c])
        recs.append({k: clean(v) for k, v in rec.items()})
    print(f'records: {len(recs):,} ({time.time() - t0:.0f} s); gaps: {dict(miss)}', flush=True)

    ids = [x['id'] for x in recs]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    by_seg = collections.Counter(x['segment'] for x in recs)

    # ---- (a) columnar JSON per segment
    jcols = [c for c in COLS if c not in JSON_SKIP]
    files = {}
    meta_common = {
        'generated': generated, 'source': 'SBA PPP (FOIA, as of 2024-09-30) and SBA 7(a)/504 (FOIA, as of 2026-09-30) loan records',
        'script': 'scripts/build_business_directory.py',
        'notes': ['Jobs come from the latest loan record: PPP JobsReported is what the borrower reported in 2020-21; SBA JobsSupported is '
                  'what the lender reported on a 7(a) or 504 loan, approved as far back as 1991 (jobs_latest_source gives the date).',
                  'Revenue is always modelled (est.) from Census benchmarks and the loan data. "researched model" means the SBA screen ran '
                  'the same model with checked inputs; only a revenue_basis that says "stated" is a figure a source reported.',
                  'Ownership is unknown unless ownership_basis gives a source: researched (SBA screen), hand-built list (checked against '
                  'company sites and public sources) or SBA loan record (ESOP business type).',
                  'Specialties for a business that was not researched are the plain NAICS trade label only.'],
    }
    for seg in SEGS:
        srecs = sorted((x for x in recs if x['segment'] == seg), key=lambda x: (x['state'], x['name']))
        meta = dict(meta_common, dataset=f'All businesses in the {SEG_LABEL[seg]} SBA loan segment', segment=seg)
        p = os.path.join(a.out_dir, f'{seg}.json')
        size = write_columnar(p, meta, srecs, jcols)
        for old in [f for f in os.listdir(a.out_dir) if f.startswith(seg + '-') and f.endswith('.json')]:
            os.remove(os.path.join(a.out_dir, old))
        if size > a.split_mb * 1e6:
            parts = []
            for st in sorted({x['state'] for x in srecs}):
                part = [x for x in srecs if x['state'] == st]
                fn = f'{seg}-{st or "XX"}.json'
                sz = write_columnar(os.path.join(a.out_dir, fn), dict(meta, state=st), part, jcols)
                parts.append({'file': fn, 'state': st, 'rows': len(part), 'bytes': sz})
            with open(p, 'w', encoding='utf-8') as f:
                json.dump({'format': 'split', 'meta': dict(meta, item_count=len(srecs)), 'parts': parts}, f, separators=(',', ':'))
            files[seg] = {'rows': len(srecs), 'bytes_unsplit': size, 'split_by_state': parts, 'bytes': os.path.getsize(p)}
        else:
            files[seg] = {'file': f'{seg}.json', 'rows': len(srecs), 'bytes': size}
        print(f'{seg}.json: {len(srecs):,} rows, {size / 1e6:.1f} MB' + (' -> split by state' if seg in files and 'split_by_state' in files[seg] else ''), flush=True)

    # ---- (b) SQLite + FTS5, gzip
    work = a.work or a.out_dir
    os.makedirs(work, exist_ok=True)
    raw = os.path.join(work, 'businesses.sqlite')
    meta_db = {
        'built_at': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(), 'generated': generated,
        'sources': [{'title': 'SBA Paycheck Protection Program loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/ppp-foia', 'publisher': 'U.S. Small Business Administration', 'date': '2024-09-30'},
                    {'title': 'SBA 7(a) and 504 loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/7-a-504-foia', 'publisher': 'U.S. Small Business Administration', 'date': '2026-09-30'},
                    {'title': 'Statistics of U.S. Businesses 2022 (revenue model benchmarks)', 'url': REV.SUSB_PAGE, 'publisher': 'U.S. Census Bureau', 'date': bmeta.get('generated')}],
        'change_of_ownership_recent_cutoff': as_of_coo_cut, 'notes': meta_common['notes'],
    }
    meta_db = write_sqlite(raw, recs, meta_db)
    gz = os.path.join(a.out_dir, 'businesses.sqlite.gz')
    raw_bytes, gz_bytes, sha = gzip_file(raw, gz)
    if a.work is None:
        os.remove(raw)
    print(f'businesses.sqlite: {raw_bytes / 1e6:.1f} MB raw, {gz_bytes / 1e6:.1f} MB gzip', flush=True)

    index = {'meta': {'dataset': 'All-business directory (SBA loan segments)', 'generated': generated, 'built_at': meta_db['built_at'],
                      'script': 'scripts/build_business_directory.py', 'notes': meta_common['notes'], 'sources': meta_db['sources']},
             'rows': len(recs), 'rows_by_segment': dict(by_seg), 'files': files,
             'sqlite': {'file': 'businesses.sqlite.gz', 'bytes': gz_bytes, 'raw_bytes': raw_bytes, 'sha256': sha,
                        'built_at': meta_db['built_at']},
             'columns': jcols, 'revenue_coverage': meta_db['revenue_coverage'], 'gaps': dict(miss)}
    with open(os.path.join(a.out_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=1)
        f.write('\n')
    print(json.dumps({'rows_by_segment': dict(by_seg), 'revenue_coverage': meta_db['revenue_coverage'],
                      'county_basis': dict(collections.Counter(x['county_basis'] for x in recs)),
                      'geo_precision': dict(collections.Counter(x['geo_precision'] for x in recs))}, indent=1))
    print(f'done in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
