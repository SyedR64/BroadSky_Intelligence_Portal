#!/usr/bin/env python3
"""Extract the datasets embedded in the legacy single-file tools into slim JSON
files under /data. Run from the repo root:  python3 scripts/build_data.py
Every output file is documented in data/manifest.json (provenance, row counts)."""
import re, json, os, sys, csv, collections, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEG = os.path.join(ROOT, 'legacy', 'tools')
OUT = os.path.join(ROOT, 'data')
GAZ = sys.argv[1] if len(sys.argv) > 1 else None   # optional Census ZCTA gazetteer path
os.makedirs(OUT, exist_ok=True)
manifest = {"generated": datetime.date.today().isoformat(), "datasets": []}

def read(f): return open(os.path.join(LEG, f), encoding='utf-8', errors='replace').read()

def literal(s, name):
    """Return the JS literal assigned to `name` (array/object or JSON.parse('...'))."""
    m = re.search(r'(?:const|let|var)\s+' + re.escape(name) + r'\s*=\s*', s)
    if not m: raise KeyError(name)
    i = m.end()
    if s.startswith('JSON.parse(', i):
        q = s[i + 11]; j = i + 12; buf = []
        while True:
            c = s[j]
            if c == '\\': buf.append(s[j:j + 2]); j += 2; continue
            if c == q: break
            buf.append(c); j += 1
        raw = ''.join(buf)
        try: return json.loads(raw)
        except Exception: return json.loads(raw.encode().decode('unicode_escape'))
    open_c = s[i]; close_c = {'[': ']', '{': '}'}[open_c]
    depth = 0; j = i; instr = False; esc = False
    while True:
        c = s[j]
        if instr:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == '"': instr = False
        else:
            if c == '"': instr = True
            elif c == open_c: depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0: break
        j += 1
    return json.loads(s[i:j + 1])

def js_object_array(s, name):
    """Parse a JS array of object literals with unquoted keys (Frontline FIRMS)."""
    m = re.search(r'const\s+' + name + r'\s*=\s*\[', s)
    i = m.end() - 1
    depth = 0; j = i; instr = None
    while True:
        c = s[j]
        if instr:
            if c == '\\': j += 2; continue
            if c == instr: instr = None
        else:
            if c in '"\'': instr = c
            elif c == '[': depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0: break
        j += 1
    raw = s[i:j + 1]
    raw = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', raw)
    # values are double-quoted in source; apostrophes inside strings must survive
    return json.loads(raw)

def save(name, data, source, note, fields=None):
    p = os.path.join(OUT, name)
    json.dump(data, open(p, 'w'), separators=(',', ':'))
    n = len(data) if isinstance(data, list) else len(data.get('rows', data))
    manifest['datasets'].append({"file": name, "rows": n, "bytes": os.path.getsize(p),
                                 "source": source, "note": note, "fields": fields or (list(data[0].keys()) if isinstance(data, list) and data and isinstance(data[0], dict) else None)})
    print(f"  wrote {name:32s} rows={n:>6} bytes={os.path.getsize(p):>10,}")

zipll = {}
if GAZ and os.path.exists(GAZ):
    for row in csv.DictReader(open(GAZ, encoding='utf-8'), delimiter='\t'):
        row = {k.strip(): v.strip() for k, v in row.items()}
        zipll[row['GEOID']] = (float(row['INTPTLAT']), float(row['INTPTLONG']))
    print(f"loaded {len(zipll):,} ZCTA centroids")

# ── CET / NuWave (New England only; NYC data archived in legacy) ──────────────
print("CET")
c = read('cet-nuwave.html')
terr = literal(c, 'NE_TERRITORY')
save('cet_ne_counties.json', terr, 'Legacy CET tool v6b: Census CBP 2022, ACS 5-yr 2022, Census BPS (90d), analyst fit scoring',
     '67 New England counties scored for CET fit (Tier 1-3). Some centroids/population null in source.')
dev = literal(c, 'NE_DEV')
save('cet_ne_development.json', dev, 'Municipal development logs (Cambridge, Boston, Worcester…), USASpending federal awards, press releases — compiled Apr–May 2026',
     'New England development activity with MEP/electrical scope likelihood; value_usd may be estimates.')
rfps = literal(c, 'NE_RFPS')
save('cet_ne_rfps.json', rfps, 'COMMBUYS (MA), CTsource (CT), state portals — compiled Apr–May 2026',
     'Public procurement notices tagged for CET fit. Verify due dates on the portal before pursuit.')
bids = literal(c, 'BID_OPPS')
nyc_summary = {"total": len(bids), "by_tier": collections.Counter(b['priority_tier'] for b in bids),
               "by_borough": collections.Counter(b['borough'] for b in bids),
               "note": "NYC pipeline archived: CET/NuWave has no plans to expand into NYC (CEO guidance, Sept 2026). Full dataset remains in legacy/tools/cet-nuwave.html."}
save('cet_nyc_archive_summary.json', nyc_summary, 'Legacy CET tool (NYC DOB NOW filings)', 'Summary only.', fields=list(nyc_summary.keys()))

# ── Punctual Pros ─────────────────────────────────────────────────────────────
print("PUNCTUAL PROS")
p = read('punctual-pros.html')
raw = literal(p, 'RAW')
keep = ['zip','city','county','state','housing_units','owner_occupancy_rate','old_housing_share','housing_density_per_sqmi',
        'service_territory_flag','adjacent_to_service_territory','lat','lon','owner_base_size','recent_owner_moves',
        'data_confidence','executive_rank_score','opportunity_score_v3','opportunity_tier_v3','v3_reason',
        'nearby_tier1_count','cluster_score','practical_priority_score','practical_priority_tier','practical_priority_label',
        'expansion_tailwind','expansion_headwind','builder_sale_count_90d','homeowner_sale_count_90d','meaningful_sale_count_90d',
        'blended_expansion_priority_score','sales_layer_reason']
zips = [{k: z.get(k) for k in keep} for z in raw['zips']]
save('pp_zips.json', zips, 'Legacy Punctual Pros tool v6/v11: ACS 5-yr (B25038 owner move-in, housing stock), analyst scoring; sales layer 2026-01-10 → 2026-04-10',
     'ZIP-level territory + expansion scoring. service_territory_flag=1 marks modeled core footprint (248 PA zips).')
meta = raw['meta']; meta['legacy_note'] = 'Scoring weights: executive_rank 0.46, opportunity_v3 0.20, cluster 0.24, housing_mass 0.10'
json.dump(meta, open(os.path.join(OUT, 'pp_meta.json'), 'w'), indent=1)
sales = literal(p, 'SALES')
save('pp_sales_90d.json', sales, 'County recorder deed transfers (PA: Chester, Lancaster, Dauphin, York, Montgomery; NJ: Ocean, Monmouth), 2026-01-10 → 2026-04-10',
     'Recent residential sales = new-mover leads. builder=1 flags builder/developer grantor.')

# ── Frontline ─────────────────────────────────────────────────────────────────
print("FRONTLINE")
f = read('frontline.html')
firms = js_object_array(f, 'FIRMS')
save('fl_lawfirms.json', firms, 'AM Law 200 (2025) public rankings; analyst scoring of AI/cyber urgency; legacy Frontline tool',
     '149 AM Law firms scored for Frontline managed-IT / RCM fit.')

# ── Thomas Scientific ─────────────────────────────────────────────────────────
print("THOMAS SCIENTIFIC")
t = read('thomas-scientific.html')
CI = {k.strip(): int(v) for k, v in re.findall(r'([a-z_0-9]+)\s*:\s*(\d+)', re.search(r'const CI\s*=\s*\{(.*?)\};', t, re.S).group(1))}
rows = literal(t, 'RAW')
cols = ['rank','name','city','state','zip','vertical','tier','score','npi','phone','parent','sites','angle','subtype',
        'cms_band','hosp_band','hosp_name','hosp_type','hosp_rating','ip_discharges','coverage_layer',
        'commercial_score_v3c','commercial_tier_v3c','commercial_priority_label_v3c','commercial_archetype_v3c','cms_allowed_2023_numeric']
sites = []
missing_ll = 0
for r in rows:
    d = {c: r[CI[c]] for c in cols}
    z = str(d['zip']).zfill(5) if d['zip'] not in (None, '') else ''
    d['zip'] = z
    ll = zipll.get(z)
    if ll: d['lat'], d['lon'] = ll
    else: d['lat'] = d['lon'] = None; missing_ll += 1
    sites.append(d)
print(f"  TS sites without centroid: {missing_ll}")
save('ts_sites.json', sites, 'NPPES NPI registry, CMS Provider Utilization 2023, CLIA, Hospital Compare, PECOS — legacy Thomas Scientific tool; lat/lon = Census 2023 ZCTA centroid',
     '27,503 lab/hospital/pathology sites scored for Thomas Scientific commercial priority.')
parents = literal(t, 'PARENT_DATA')
save('ts_parents.json', parents, 'Roll-up of ts_sites by parent organization (legacy tool)', 'Top 500 parent accounts.')

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print("manifest written")

# ── Columnar compaction for the large tables ──────────────────────────────────
# Format: {"format":"columnar","cols":[...],"enums":{col:[values]},"rows":[[...]]}
# String columns with low cardinality are dictionary-encoded as integer indexes.
# assets/core.js decodes this transparently (Data.load returns row objects).
def compact(name, max_card=2000, round_floats=4):
    p = os.path.join(OUT, name); rows = json.load(open(p))
    cols = list(rows[0].keys())
    enums = {}
    for c in cols:
        vals = [r.get(c) for r in rows]
        if all(isinstance(v, str) or v is None for v in vals):
            card = len(set(vals))
            if card <= max_card and card < len(rows) * 0.5:
                order = sorted(set(v for v in vals if v is not None)); idx = {v: i for i, v in enumerate(order)}
                enums[c] = order
                for r in rows: r[c] = idx[r[c]] if r[c] is not None else None
    out = []
    for r in rows:
        row = []
        for c in cols:
            v = r.get(c)
            if isinstance(v, float): v = round(v, round_floats)
            row.append(v)
        out.append(row)
    before = os.path.getsize(p)
    json.dump({"format": "columnar", "cols": cols, "enums": enums, "rows": out}, open(p, 'w'), separators=(',', ':'))
    after = os.path.getsize(p)
    for d in manifest['datasets']:
        if d['file'] == name: d['bytes'] = after; d['encoding'] = 'columnar'
    print(f"  compacted {name}: {before:,} -> {after:,} bytes ({len(enums)} enum cols)")

compact('ts_sites.json'); compact('pp_zips.json'); compact('pp_sales_90d.json')
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
