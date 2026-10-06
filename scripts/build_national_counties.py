#!/usr/bin/env python3
"""Build data/national_counties.json: a national county-level dataset (50 states + DC) for
home-services expansion scoring, in the repo's columnar format
{"format":"columnar","meta":{...},"cols":[...],"enums":{...},"rows":[...]}.

Re-runnable. Downloads raw public files with curl into a cache dir (default: $TMPDIR/bsp_national_counties_cache,
override with env BSP_NC_CACHE), parses them with the python3 stdlib, and writes the JSON + prints per-field coverage.
Pass --refresh to force re-download.

Sources (all public, no API key):
  Census Gazetteer 2023 counties, ACS 2023 5-yr table-based summary file (B01003, B25001, B25003, B25034, B25035,
  B19013, B25040), Census PEP Vintage 2024 county totals, Census Building Permits Survey county files (2024 annual,
  2025 annual, 2026 Jan-latest YTD), Redfin Data Center county market tracker, NOAA nClimDiv county 1991-2020 HDD/CDD
  normals, Census County Business Patterns 2022 (NAICS 238210, 238220), and the public location pages of One Hour
  Heating & Air Conditioning, Benjamin Franklin Plumbing and Mister Sparky (Authority Brands), geocoded to county
  via the Census 2020 ZCTA-to-county relationship file.
"""
import csv, gzip, html, io, json, os, re, subprocess, sys, tempfile, unicodedata, zipfile
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'national_counties.json')
MANIFEST = os.path.join(ROOT, 'data', 'manifest.json')
CACHE = os.environ.get('BSP_NC_CACHE') or os.path.join(tempfile.gettempdir(), 'bsp_national_counties_cache')
REFRESH = '--refresh' in sys.argv
TODAY = date.today().isoformat()
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) BSP-portal-research (public data build)'
os.makedirs(CACHE, exist_ok=True)

URL = {
    'gaz': 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip',
    'acs_base': 'https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/acsdt5y2023-{t}.dat',
    'acs_shells': 'https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/documentation/ACS20235YR_Table_Shells.txt',
    'pep': 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv',
    'bps_dir': 'https://www2.census.gov/econ/bps/County/',
    'redfin': 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz',
    'noaa_dir': 'https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/',
    'noaa_readme': 'https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/normals-readme.txt',
    'cbp': 'https://www2.census.gov/programs-surveys/cbp/datasets/2022/cbp22co.zip',
    'zcta_cty': 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt',
    'ab_onehour': 'https://www.onehourheatandair.com/locations/',
    'ab_benfranklin': 'https://www.benjaminfranklinplumbing.com/locations/',
    'ab_mistersparky': 'https://www.mistersparky.com/locations/',
}
RETRIEVED = {}


def fetch(url, name, compressed=False):
    p = os.path.join(CACHE, name)
    if REFRESH or not os.path.exists(p) or os.path.getsize(p) == 0:
        cmd = ['curl', '-sSL', '--fail', '--retry', '3', '-A', UA, '-o', p, url]
        if compressed: cmd.insert(1, '--compressed')
        subprocess.run(cmd, check=True)
    RETRIEVED[url] = TODAY
    return p


def log(*a): print(*a, file=sys.stderr)


def num(x):
    try:
        v = float(x)
        return v
    except (TypeError, ValueError):
        return None


def norm_name(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = s.replace('saint ', 'st ').replace('ste. ', 'ste ').replace('st. ', 'st ')
    return re.sub(r'[^a-z0-9]', '', s)


# ---------- 1. Gazetteer: the county universe ----------
gz = fetch(URL['gaz'], 'gaz2023.zip')
with zipfile.ZipFile(gz) as z:
    txt = z.read([n for n in z.namelist() if n.endswith('.txt')][0]).decode('utf-8', 'replace')
C = {}  # fips -> record
rd = csv.reader(io.StringIO(txt), delimiter='\t')
hdr = [h.strip() for h in next(rd)]
for r in rd:
    r = [x.strip() for x in r]
    d = dict(zip(hdr, r))
    f = d['GEOID']
    if f[:2] == '72':  # Puerto Rico excluded (scope: 50 states + DC)
        continue
    C[f] = {'fips': f, 'state': d['USPS'], 'county_name': d['NAME'],
            'lat': round(float(d['INTPTLAT']), 5), 'lon': round(float(d['INTPTLONG']), 5),
            'land_sqmi': round(float(d['ALAND_SQMI']), 1)}
log('gazetteer counties:', len(C))
ST_FIPS = {}
for f, c in C.items(): ST_FIPS[c['state']] = f[:2]

# ---------- 2. ACS 2023 5-yr (table-based summary file, county rows only) ----------
def acs_table(t):
    p = fetch(URL['acs_base'].format(t=t), f'acs5y2023_{t}.dat')
    out = {}
    with open(p, encoding='utf-8', errors='replace') as fh:
        h = next(fh).rstrip('\n').split('|')
        for line in fh:
            if not line.startswith('0500000US'): continue
            v = line.rstrip('\n').split('|')
            out[v[0][9:]] = dict(zip(h, v))
    return out

acs = {t: acs_table(t) for t in ['b01003', 'b25001', 'b25003', 'b25034', 'b25035', 'b19013', 'b25040']}
for f, c in C.items():
    g = lambda t, col: num(acs[t].get(f, {}).get(col))
    pop = g('b01003', 'B01003_E001'); c['population'] = int(pop) if pop is not None else None
    hu = g('b25001', 'B25001_E001'); c['housing_units'] = int(hu) if hu is not None else None
    occ, own = g('b25003', 'B25003_E001'), g('b25003', 'B25003_E002')
    c['owner_occupied_share'] = round(own / occ, 4) if occ and own is not None else None
    myb = g('b25035', 'B25035_E001'); c['median_year_built'] = int(myb) if myb and myb > 1800 else None
    tot = g('b25034', 'B25034_E001')
    pre = [g('b25034', f'B25034_E{i:03d}') for i in range(7, 12)]
    c['pre1980_share'] = round(sum(pre) / tot, 4) if tot and None not in pre else None
    inc = g('b19013', 'B19013_E001'); c['median_household_income'] = int(inc) if inc and inc > 0 else None
    ht, lp, oil = g('b25040', 'B25040_E001'), g('b25040', 'B25040_E003'), g('b25040', 'B25040_E005')
    c['heating_fuel_oil_propane_share'] = round((lp + oil) / ht, 4) if ht and lp is not None and oil is not None else None
    elec = g('b25040', 'B25040_E004')
    c['heating_electric_share'] = round(elec / ht, 4) if ht and elec is not None else None

# ---------- 3. PEP Vintage 2024 ----------
p = fetch(URL['pep'], 'co-est2024-alldata.csv')
with open(p, encoding='latin-1') as fh:
    for d in csv.DictReader(fh):
        if d['SUMLEV'] != '050': continue
        f = d['STATE'] + d['COUNTY']
        if f not in C: continue
        p20, p24 = num(d['POPESTIMATE2020']), num(d['POPESTIMATE2024'])
        C[f]['pop_est_2024'] = int(p24) if p24 is not None else None
        C[f]['pop_growth_2020_2024'] = round(p24 / p20 - 1, 4) if p20 and p24 is not None else None

# ---------- 4. Building Permits Survey ----------
idx = open(fetch(URL['bps_dir'], 'bps_index.html')).read()
annual = sorted(set(re.findall(r'co(20\d\d)a\.txt', idx)))
ytd = sorted(set(re.findall(r'co(\d\d)(\d\d)y\.txt', idx)))
BPS_FILES = {}

def bps(fname):
    p = fetch(URL['bps_dir'] + fname, 'bps_' + fname)
    out = {}
    with open(p, encoding='latin-1') as fh:
        for r in csv.reader(fh):
            if len(r) < 18 or not r[0].strip().isdigit(): continue
            f = r[1].strip().zfill(2) + r[2].strip().zfill(3)
            units = [num(r[i]) or 0 for i in (7, 10, 13, 16)]
            out[f] = (int(sum(units)), int(units[0]))
    BPS_FILES[fname] = URL['bps_dir'] + fname
    return out

b24 = bps('co2024a.txt')
if '2025' in annual:
    b25 = bps('co2025a.txt'); b25_label = 'co2025a.txt (2025 annual, Jan-Dec; final file - 2025 is complete)'
else:
    lm = max(m for y, m in ytd if y == '25'); b25 = bps(f'co25{lm}y.txt'); b25_label = f'co25{lm}y.txt (2025 YTD through month {lm})'
y26 = [m for y, m in ytd if y == '26']
b26_fname = f'co26{max(y26)}y.txt' if y26 else None
b26 = bps(b26_fname) if b26_fname else {}
for f, c in C.items():
    c['permits_units_2024'] = b24[f][0] if f in b24 else None
    c['permits_units_2025ytd'] = b25[f][0] if f in b25 else None
    c['permits_1unit_2025'] = b25[f][1] if f in b25 else None
    c['permits_units_2026ytd'] = b26[f][0] if f in b26 else None
    hu = c.get('housing_units')
    c['permits_per_1k_hu_2025'] = round(1000 * b25[f][0] / hu, 2) if f in b25 and hu else None

# ---------- 5. Redfin county market tracker (stream + filter; ~240 MB gz) ----------
rf_small = os.path.join(CACHE, 'redfin_allres_monthly.tsv')
if REFRESH or not os.path.exists(rf_small):
    proc = subprocess.Popen(['curl', '-sSL', '--fail', '-A', UA, URL['redfin']], stdout=subprocess.PIPE)
    with gzip.open(proc.stdout, 'rt', encoding='utf-8', errors='replace') as gzf, open(rf_small, 'w') as outf:
        rdr = csv.reader(gzf, delimiter='\t'); h = next(rdr); ix = {k: h.index(k) for k in h}
        keep = ['PERIOD_BEGIN', 'PERIOD_END', 'REGION', 'STATE_CODE', 'MEDIAN_SALE_PRICE', 'HOMES_SOLD', 'MEDIAN_DOM', 'LAST_UPDATED']
        w = csv.writer(outf, delimiter='\t'); w.writerow(keep)
        for r in rdr:
            if len(r) < len(h): continue
            if r[ix['PROPERTY_TYPE']] != 'All Residential' or r[ix['IS_SEASONALLY_ADJUSTED']] != 'false' or r[ix['PERIOD_DURATION']] != '30': continue
            w.writerow([r[ix[k]] for k in keep])
    proc.wait()
RETRIEVED[URL['redfin']] = TODAY
byname = {}
for f, c in C.items():
    byname[(c['state'], norm_name(c['county_name']))] = f
def rf_match(st, reg):
    """Redfin REGION ('X County, ST') -> FIPS. Exact normalized name first, then Redfin naming quirks:
    'Baltimore City County' -> 'Baltimore city'; VA independent cities listed bare ('Alexandria') -> 'Alexandria city';
    '&' -> 'and'; AK 'Anchorage Borough' -> unique Gazetteer name starting with 'Anchorage' in AK."""
    cands = [reg, reg.replace(' City County', ' city'), reg + ' city', reg.replace('&', 'and')]
    for c in cands:
        f = byname.get((st, norm_name(c)))
        if f: return f
    if reg.endswith(' Borough'):
        base = norm_name(reg[:-8])
        hits = [f for (s2, n), f in byname.items() if s2 == st and n.startswith(base)]
        if len(hits) == 1: return hits[0]
    return None

rf = defaultdict(dict); rf_updated = None
with open(rf_small) as fh:
    for d in csv.DictReader(fh, delimiter='\t'):
        reg = d['REGION'].rsplit(',', 1)[0].strip()
        st = d['STATE_CODE']
        f = rf_match(st, reg)
        if not f: continue
        rf[f][d['PERIOD_END']] = (num(d['HOMES_SOLD']), num(d['MEDIAN_SALE_PRICE']), num(d['MEDIAN_DOM']))
        rf_updated = d['LAST_UPDATED'] or rf_updated
all_ends = sorted({e for v in rf.values() for e in v})
latest_end = all_ends[-1]
window = all_ends[-12:]
for f, c in C.items():
    s = rf.get(f)
    c['home_sales_12m'] = c['median_sale_price'] = c['median_dom'] = None
    if not s: continue
    vals = [s[e][0] for e in window if e in s and s[e][0] is not None]
    if len(vals) == 12: c['home_sales_12m'] = int(sum(vals))
    if latest_end in s:
        c['median_sale_price'] = int(s[latest_end][1]) if s[latest_end][1] else None
        c['median_dom'] = int(s[latest_end][2]) if s[latest_end][2] is not None else None
unmatched_rf = None  # computed for meta below
rf_regions = set()
with open(rf_small) as fh:
    for d in csv.DictReader(fh, delimiter='\t'): rf_regions.add((d['STATE_CODE'], d['REGION']))
unmatched_rf = sorted(r for st, r in rf_regions if not rf_match(st, r.rsplit(',', 1)[0].strip()))

# ---------- 6. NOAA nClimDiv county normals (1991-2020 HDD/CDD) ----------
ndir = open(fetch(URL['noaa_dir'], 'noaa_dir.html')).read()
hdd_name = sorted(set(re.findall(r'climdiv-norm-hddccy-v[\d.]+-\d{8}', ndir)))[-1]
cdd_name = sorted(set(re.findall(r'climdiv-norm-cddccy-v[\d.]+-\d{8}', ndir)))[-1]
NOAA_ST = ['AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI',
           'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
           'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']  # NOAA codes 01-48 (alphabetical CONUS, per normals-readme)

def noaa(name, elem):
    p = fetch(URL['noaa_dir'] + name, name)
    out = {}
    for line in open(p):
        if len(line) < 11 or line[5:11] != elem + '0010': continue  # 0010 = 1991-2020 period
        sc = int(line[0:2])
        if sc < 1 or sc > 48: continue
        sf = ST_FIPS.get(NOAA_ST[sc - 1]); f = sf + line[2:5] if sf else None
        vals = [num(line[11 + 7 * i:18 + 7 * i]) for i in range(12)]
        if f and None not in vals and min(vals) >= 0: out[f] = int(round(sum(vals)))
    return out

hdd, cdd = noaa(hdd_name, '25'), noaa(cdd_name, '26')
for f, c in C.items():
    c['hdd_normal_1991_2020'] = hdd.get(f)
    c['cdd_normal_1991_2020'] = cdd.get(f)
    c['cdd_hdd_proxy'] = round(cdd[f] / (cdd[f] + hdd[f]), 4) if f in hdd and f in cdd and (cdd[f] + hdd[f]) else None

# ---------- 7. County Business Patterns 2022 ----------
cp = fetch(URL['cbp'], 'cbp22co.zip')
cbp_present, est = set(), defaultdict(dict)
with zipfile.ZipFile(cp) as z:
    with z.open([n for n in z.namelist() if n.endswith('.txt')][0]) as fh:
        for d in csv.DictReader(io.TextIOWrapper(fh, encoding='latin-1')):
            f = d['fipstate'] + d['fipscty']
            if d['naics'] == '------': cbp_present.add(f)
            if d['naics'] in ('238210', '238220'): est[f][d['naics']] = int(d['est'])
for f, c in C.items():
    if f in cbp_present:  # CBP omits zero-establishment cells; a county present in the file with no row has 0
        e = est.get(f, {})
        c['estab_238220_plumbing_hvac'] = e.get('238220', 0)
        c['estab_238210_electrical'] = e.get('238210', 0)
        c['hvac_plumbing_electrical_establishments'] = c['estab_238220_plumbing_hvac'] + c['estab_238210_electrical']
    else:
        c['estab_238220_plumbing_hvac'] = c['estab_238210_electrical'] = c['hvac_plumbing_electrical_establishments'] = None

# ---------- 8. Authority Brands locations (public location pages) -> ZIP -> county ----------
zc = fetch(URL['zcta_cty'], 'zcta_county_2020.txt')
best = {}
with open(zc, encoding='utf-8-sig') as fh:
    for d in csv.DictReader(fh, delimiter='|'):
        z, f, a = d['GEOID_ZCTA5_20'], d['GEOID_COUNTY_20'], num(d['AREALAND_PART']) or 0
        if not z: continue
        if z not in best or a > best[z][1]: best[z] = (f, a)
ZIP2C = {z: v[0] for z, v in best.items()}
# 2020 CT counties -> 2022 planning regions are not 1:1; resolve CT ZIPs by name lookup is not possible, so map via
# old-county FIPS only when it exists in the 2023 universe (it does not for CT) -> CT locations recorded as unmatched.
NAME_RE = re.compile(r'class="(?:lp-location-info-name|sb-location-name[^"]*)"[^>]*>(.*?)</(?:p|a)>', re.S)
ZIP_RE = re.compile(r'\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b')
ab_counts = {k: defaultdict(int) for k in ('ab_onehour', 'ab_benfranklin', 'ab_mistersparky')}
ab_meta = {}
for key in ab_counts:
    h = open(fetch(URL[key], key + '.html', compressed=True), encoding='utf-8', errors='replace').read()
    ms = list(NAME_RE.finditer(h)); seen = set(); n_loc = n_geo = 0; unmatched = []
    for i, m in enumerate(ms):
        nm = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', m.group(1)))).strip()
        if not nm or nm in seen: continue
        seg = h[m.end(): ms[i + 1].start() if i + 1 < len(ms) else m.end() + 3000]
        zm = ZIP_RE.search(seg)
        if not zm: continue
        seen.add(nm); n_loc += 1
        f = ZIP2C.get(zm.group(2))
        if f in C: ab_counts[key][f] += 1; n_geo += 1
        else: unmatched.append(f'{nm} ({zm.group(1)} {zm.group(2)})')
    ab_meta[key] = {'url': URL[key], 'locations_with_address': n_loc, 'geocoded_to_county': n_geo, 'unmatched': unmatched}
    log(key, ab_meta[key]['locations_with_address'], 'locations,', n_geo, 'geocoded')
ab_ok = all(v['locations_with_address'] > 20 for v in ab_meta.values())
for f, c in C.items():
    for key in ab_counts:
        c[key] = ab_counts[key].get(f, 0) if ab_ok and c['state'] != 'CT' else None
    c['authority_brands_presence'] = (c['ab_onehour'] + c['ab_benfranklin'] + c['ab_mistersparky']) if ab_ok and c['state'] != 'CT' else None
# CT: resolve via the location's 2020 county only if unambiguous is impossible -> null (documented)

# ---------- 9. Assemble columnar output ----------
COLS = ['fips', 'state', 'county_name', 'lat', 'lon', 'land_sqmi', 'population', 'pop_est_2024', 'pop_growth_2020_2024',
        'housing_units', 'owner_occupied_share', 'median_year_built', 'pre1980_share', 'median_household_income',
        'heating_fuel_oil_propane_share', 'heating_electric_share', 'permits_units_2024', 'permits_units_2025ytd',
        'permits_1unit_2025', 'permits_units_2026ytd', 'permits_per_1k_hu_2025', 'home_sales_12m', 'median_sale_price',
        'median_dom', 'hdd_normal_1991_2020', 'cdd_normal_1991_2020', 'cdd_hdd_proxy',
        'estab_238220_plumbing_hvac', 'estab_238210_electrical', 'hvac_plumbing_electrical_establishments',
        'ab_onehour', 'ab_benfranklin', 'ab_mistersparky', 'authority_brands_presence']
recs = [C[f] for f in sorted(C)]
coverage = {k: round(sum(1 for r in recs if r.get(k) is not None) / len(recs), 4) for k in COLS}
states = sorted({r['state'] for r in recs}); sidx = {s: i for i, s in enumerate(states)}
rows = [[(sidx[r['state']] if k == 'state' else r.get(k)) for k in COLS] for r in recs]

meta = {
    'dataset': 'national_counties',
    'title': 'US county-level home-services expansion base table (50 states + DC)',
    'generated': TODAY,
    'author': 'Syed Rahman',
    'builder': 'scripts/build_national_counties.py',
    'geography': 'Census 2023 county universe (Gazetteer 2023): 50 states + DC = %d counties/equivalents. Connecticut uses the 9 planning regions (FIPS 09110-09190). Puerto Rico excluded.' % len(recs),
    'item_count': len(rows),
    'sources': [
        {'field_group': 'fips, state, county_name, lat, lon, land_sqmi', 'name': 'Census Gazetteer 2023 counties', 'url': URL['gaz'], 'vintage': '2023', 'retrieved': TODAY, 'note': 'lat/lon are internal points (INTPTLAT/INTPTLONG)'},
        {'field_group': 'population, housing_units, owner_occupied_share, median_year_built, pre1980_share, median_household_income, heating_*', 'name': 'ACS 2019-2023 5-year estimates, table-based summary file (county rows, GEO_ID 0500000US*)', 'url': URL['acs_base'].format(t='{b01003|b25001|b25003|b25034|b25035|b19013|b25040}'), 'variable_labels': URL['acs_shells'], 'vintage': 'ACS 2023 5-yr', 'retrieved': TODAY, 'note': 'Bulk .dat files used because api.census.gov now redirects key-less requests to missing_key.html'},
        {'field_group': 'pop_est_2024, pop_growth_2020_2024', 'name': 'Census Population Estimates Program, Vintage 2024 county totals (co-est2024-alldata.csv)', 'url': URL['pep'], 'vintage': 'V2024 (July 1 2020-2024)', 'retrieved': TODAY},
        {'field_group': 'permits_units_2024', 'name': 'Census Building Permits Survey, county annual', 'url': BPS_FILES['co2024a.txt'], 'vintage': '2024 annual', 'retrieved': TODAY},
        {'field_group': 'permits_units_2025ytd, permits_1unit_2025, permits_per_1k_hu_2025', 'name': 'Census Building Permits Survey, county', 'url': BPS_FILES[b25_label.split(' ')[0]], 'vintage': b25_label, 'retrieved': TODAY},
        {'field_group': 'permits_units_2026ytd', 'name': 'Census Building Permits Survey, county year-to-date', 'url': BPS_FILES.get(b26_fname), 'vintage': (f'{b26_fname} (Jan-{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][int(b26_fname[4:6])-1]} 2026 cumulative)' if b26_fname else None), 'retrieved': TODAY},
        {'field_group': 'home_sales_12m, median_sale_price, median_dom', 'name': 'Redfin Data Center county market tracker (All Residential, not seasonally adjusted, monthly rows)', 'url': URL['redfin'], 'vintage': f'months ending {window[0]} .. {window[-1]}; file LAST_UPDATED {rf_updated}', 'retrieved': TODAY, 'note': 'Matched to FIPS by "<County name>, <ST>" against Gazetteer names (accent/punctuation-insensitive), with documented fallbacks for VA independent cities, "City County" names, "&" and AK boroughs (see rf_match in the builder).'},
        {'field_group': 'hdd_normal_1991_2020, cdd_normal_1991_2020, cdd_hdd_proxy', 'name': 'NOAA NCEI nClimDiv county normals (HDD element 25, CDD element 26, period code 0010 = 1991-2020)', 'url': [URL['noaa_dir'] + hdd_name, URL['noaa_dir'] + cdd_name], 'format_doc': URL['noaa_readme'], 'vintage': '1991-2020 normals, files ' + hdd_name[-8:], 'retrieved': TODAY, 'note': 'Computed from NOAA county degree-day normals (not the IECC climate-zone fallback). Contiguous US only.'},
        {'field_group': 'estab_238220_plumbing_hvac, estab_238210_electrical, hvac_plumbing_electrical_establishments', 'name': 'Census County Business Patterns 2022, county file (cbp22co)', 'url': URL['cbp'], 'vintage': '2022', 'retrieved': TODAY, 'note': 'Bulk file used (API requires a key). NAICS 238220 = Plumbing, Heating & AC Contractors; 238210 = Electrical Contractors.'},
        {'field_group': 'ab_onehour, ab_benfranklin, ab_mistersparky, authority_brands_presence', 'name': 'Authority Brands public location pages (One Hour Heating & Air Conditioning, Benjamin Franklin Plumbing, Mister Sparky)', 'url': [URL['ab_onehour'], URL['ab_benfranklin'], URL['ab_mistersparky']], 'vintage': 'as listed on ' + TODAY, 'retrieved': TODAY, 'locations': {k: {kk: vv for kk, vv in v.items() if kk != 'url'} for k, v in ab_meta.items()}, 'crosswalk': URL['zcta_cty'], 'note': 'Franchise location street addresses (business addresses, public) -> 5-digit ZIP -> 2020 county with the largest ZCTA land-area overlap. Counts franchise offices, not service territories.'},
    ],
    'formulas': {
        'owner_occupied_share': 'B25003_002E / B25003_001E (owner-occupied / occupied housing units)',
        'median_year_built': 'B25035_001E',
        'pre1980_share': '(B25034_007E + _008E + _009E + _010E + _011E) / B25034_001E  (built 1979 or earlier / all housing units)',
        'median_household_income': 'B19013_001E (2023 inflation-adjusted dollars)',
        'heating_fuel_oil_propane_share': '(B25040_003E bottled/tank/LP gas + B25040_005E fuel oil/kerosene) / B25040_001E. NOTE: the task spec listed _004E + _005E, but per the ACS 2023 table shells _004 is Electricity and _003 is LP gas, so _003 + _005 is used for an oil/propane share.',
        'heating_electric_share': 'B25040_004E / B25040_001E (electric heat; heat-pump/electric HVAC exposure)',
        'pop_growth_2020_2024': 'POPESTIMATE2024 / POPESTIMATE2020 - 1 (July 1 estimates, PEP V2024)',
        'permits_units_*': 'Sum of units across 1-unit, 2-unit, 3-4 unit and 5+ unit columns (reported + imputed set, i.e. the first block of columns, not the "rep" reported-only block)',
        'permits_units_2025ytd': 'Full calendar-year 2025 units from co2025a.txt. Named "ytd" per the original spec; because the 2025 annual file is published, the value is the complete Jan-Dec 2025 total.' if '2025' in annual else 'YTD 2025 units from the latest co25MMy.txt',
        'permits_1unit_2025': 'Single-family (1-unit) units permitted in 2025',
        'permits_per_1k_hu_2025': '1000 * permits_units_2025ytd / housing_units (ACS 2023)',
        'home_sales_12m': f'Sum of Redfin HOMES_SOLD over the 12 latest monthly periods ({window[0]} .. {window[-1]}); null unless all 12 months are reported for the county',
        'median_sale_price': f'Redfin MEDIAN_SALE_PRICE for the latest month ({latest_end}); single-month median, can be noisy in small counties',
        'median_dom': f'Redfin MEDIAN_DOM for the latest month ({latest_end})',
        'hdd_normal_1991_2020 / cdd_normal_1991_2020': 'Sum of the 12 monthly 1991-2020 normal degree-day values (base 65F) from NOAA county normals',
        'cdd_hdd_proxy': 'cdd / (cdd + hdd): 0 = heating-dominated, 1 = cooling-dominated (share of annual degree days that are cooling)',
        'hvac_plumbing_electrical_establishments': 'CBP 2022 ESTAB for NAICS 238220 + 238210. CBP omits zero cells, so a county present in cbp22co (has a total "------" row) with no 2382x0 row is recorded as 0.',
        'authority_brands_presence': 'ab_onehour + ab_benfranklin + ab_mistersparky (franchise offices with a listed street address geocoded into the county); 0 = none listed',
    },
    'coverage': coverage,
    'caveats': [
        'Connecticut (9 planning regions): NOAA county normals and Redfin still use the 8 legacy CT counties, which do not map 1:1 to planning regions, so HDD/CDD and Redfin fields are null for CT; Authority Brands counts are also null for CT because the 2020 ZCTA crosswalk resolves to legacy counties.',
        'Alaska and Hawaii: NOAA county normals cover the contiguous US only (degree-day normals are not computed for Alaska), so HDD/CDD/cdd_hdd_proxy are null for AK and HI. DC is also null: NOAA lists it under an undocumented Maryland code rather than FIPS 11001, so it was not mapped; Lexington city VA (51678) has no NOAA county record.',
        'Building permits: the BPS county files only include counties that contain at least one permit-issuing place in the survey universe (about 4% of counties are absent, mostly rural TX, KY, NM, MT); those counties are null, not zero.',
        'Redfin covers counties with enough MLS activity; small rural counties are often missing or have gaps, so home_sales_12m is null where any of the 12 months is absent. Unmatched Redfin region names: ' + (', '.join(unmatched_rf[:40]) or 'none') + ('' if len(unmatched_rf) <= 40 else f' (+{len(unmatched_rf)-40} more)'),
        'ACS 5-yr medians are suppressed for a handful of very small counties; those fields are null.',
        'Authority Brands counts reflect franchise office addresses on the public locator pages at retrieval time; a franchise typically serves several surrounding counties, and locations listed without a street address/ZIP are not counted. Unmatched (ZIP not in crosswalk or CT): ' + '; '.join(f'{k}: {len(v["unmatched"])}' for k, v in ab_meta.items()) + '.',
        'All figures are public statistics; no figure is estimated or imputed by this build except the documented CBP zero-fill.',
    ],
}
out = {'format': 'columnar', 'meta': meta, 'cols': COLS, 'enums': {'state': states}, 'rows': rows}
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
json.loads(s)
with open(OUT, 'w', encoding='utf-8') as fh: fh.write(s)
size = os.path.getsize(OUT)
assert size < 6_000_000, size
print(f'wrote {OUT}: {len(rows)} rows, {len(COLS)} cols, {size/1e6:.2f} MB')
print('coverage (share of counties populated):')
for k in COLS: print(f'  {k:42s} {coverage[k]*100:6.1f}%')

# ---------- 10. Manifest ----------
man = json.load(open(MANIFEST))
man['datasets'] = [d for d in man['datasets'] if d.get('file') != 'national_counties.json']
man['datasets'].append({
    'file': 'national_counties.json', 'rows': len(rows), 'bytes': size,
    'source': 'Census Gazetteer 2023, ACS 2023 5-yr, PEP V2024, Census BPS 2024/2025/2026 YTD, Redfin county tracker, NOAA nClimDiv 1991-2020 county HDD/CDD normals, CBP 2022 (NAICS 238210/238220), Authority Brands public locators',
    'note': 'National county base table (50 states + DC, CT planning regions) for home-services expansion scoring; columnar; see meta.sources/formulas/coverage. Built by scripts/build_national_counties.py.',
    'fields': COLS,
})
man['generated'] = TODAY
json.dump(man, open(MANIFEST, 'w'), indent=1)
print('manifest updated')
