#!/usr/bin/env python3
"""Pull residential (home) sales for the counties CET serves and write them as separate columnar files:
  data/sales/cet_home_sales_ma.json     MassGIS L3 assessor parcels, USE_CODE 1xx (excl. 13x land), last sale 2025-09-01..today, price >= $1,000
  data/sales/cet_home_sales_ct_ri.json  CT OPM Real Estate Sales (Residential, recorded >= 2025-06-01)
                                        + CT statewide CAMA parcel layer (State_Use 1xx excl. 13x, last sale 2025-10-01..today, price >= $2,000)
                                        + Cranston RI parcels (residential state codes, recorded >= 2025-09-01, price >= $2,000)
The CET transfer files (cet_transfers_ma / cet_transfers_ct_ri) were trimmed to non-residential rows for page weight; this
script restores the home-sale records the user asked for ("home sales in every county the portfolio companies serve").
Usage: python3 scripts/fetch_cet_home_sales.py            (stdlib only; ~3-6 minutes)"""
import json, os, sys, time, re, statistics, urllib.request, urllib.parse
from collections import Counter, defaultdict
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'sales')
TODAY = time.strftime('%Y-%m-%d')
UA = {'User-Agent': 'Mozilla/5.0 (BSP operating-intelligence research; public records)'}

def http(url, data=None, tries=4):
    for k in range(tries):
        try:
            body = urllib.parse.urlencode(data).encode() if data is not None else None
            req = urllib.request.Request(url, data=body, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read().decode('utf-8', 'replace'))
        except Exception as e:
            if k == tries - 1: raise
            print('  retry', k + 1, e, file=sys.stderr); time.sleep(3 * (k + 1))

def arcgis_all(url, where, out_fields, page=500, centroid=True):
    """returnIdsOnly, then fetch attribute batches by objectIds (robust against offset paging errors on large layers)."""
    ids = None
    for k in range(4):
        j = http(url + '/query', {'where': where, 'returnIdsOnly': 'true', 'f': 'json'})
        if 'error' not in j: ids = sorted(j.get('objectIds') or []); break
        print('  ids retry', k + 1, j['error'].get('message'), file=sys.stderr); time.sleep(5 * (k + 1))
    if ids is None: raise RuntimeError(f'{url}: could not list object ids for {where}')
    rows = []
    for i in range(0, len(ids), page):
        chunk = ids[i:i + page]
        for k in range(4):
            j = http(url + '/query', {'objectIds': ','.join(map(str, chunk)), 'outFields': out_fields, 'returnGeometry': 'false',
                                      'returnCentroid': 'true' if centroid else 'false', 'outSR': '4326', 'f': 'json'})
            if 'error' not in j: break
            print('  batch retry', k + 1, j['error'].get('message'), file=sys.stderr); time.sleep(5 * (k + 1))
        else: raise RuntimeError(f"{url}: batch failed {j['error']}")
        for f in j.get('features', []):
            a = f['attributes']; c = f.get('centroid') or {}
            a['_lat'] = c.get('y'); a['_lon'] = c.get('x'); rows.append(a)
    return rows

def r5(v): return round(v, 5) if isinstance(v, (int, float)) else None
def title(s): return ' '.join(w.capitalize() for w in str(s or '').lower().split())
def num(v):
    try: return int(float(v)) if v not in (None, '') else None
    except Exception: return None

def columnar(path, meta, items):
    items.sort(key=lambda r: str(r.get('sale_date') or ''), reverse=True)
    cols = sorted({k for r in items for k in r}, key=lambda k: (k != 'id', k)); enums = {}
    for c in cols:
        vals = [r.get(c) for r in items]
        if all(isinstance(v, str) or v is None for v in vals):
            card = len(set(vals))
            if card <= 5000 and card < len(items) * 0.5:
                order = sorted(set(v for v in vals if v is not None)); idx = {v: i for i, v in enumerate(order)}; enums[c] = order
                for r in items: r[c] = idx[r[c]] if r.get(c) is not None else None
    rows = [[(round(r.get(c), 5) if isinstance(r.get(c), float) else r.get(c)) for c in cols] for r in items]
    meta['item_count'] = len(rows)
    json.dump({'format': 'columnar', 'meta': meta, 'cols': cols, 'enums': enums, 'rows': rows}, open(path, 'w'), separators=(',', ':'))
    print(f'wrote {os.path.relpath(path, ROOT)}: {len(rows):,} rows, {os.path.getsize(path)/1e6:.1f} MB')

# ── Massachusetts ────────────────────────────────────────────────────────────
MA_URL = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0'
MUNI_URL = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Municipalities/FeatureServer/1'
MA_COUNTIES = ['WORCESTER', 'MIDDLESEX', 'NORFOLK', 'BRISTOL', 'PLYMOUTH', 'ESSEX', 'HAMPDEN', 'HAMPSHIRE', 'SUFFOLK']

def pull_ma():
    towns = arcgis_all(MUNI_URL, '1=1', 'OBJECTID,TOWN_ID,TOWN,COUNTY', centroid=False)
    by_c = defaultdict(list); name = {}
    for t in towns:
        name[t['TOWN_ID']] = title(t['TOWN'])
        if t['COUNTY'] in MA_COUNTIES and t['TOWN_ID'] != 35: by_c[t['COUNTY']].append(t['TOWN_ID'])   # Boston (35) is a stale FY2023 snapshot
    items, seen, cov = [], set(), []
    for county in MA_COUNTIES:
        ids = sorted(set(by_c[county]))
        where = f"TOWN_ID IN ({','.join(map(str, ids))}) AND LS_DATE >= '20250901' AND LS_DATE <= '{TODAY.replace('-', '')}' AND USE_CODE LIKE '1%'"
        raw = arcgis_all(MA_URL, where, 'TOWN_ID,PROP_ID,LOC_ID,LS_DATE,LS_PRICE,USE_CODE,USE_DESC,SITE_ADDR,ZIP,OWNER1,LS_BOOK,LS_PAGE,YEAR_BUILT,BLD_AREA,RES_AREA')
        n0 = len(items)
        for a in raw:
            code = re.sub(r'\D', '', str(a.get('USE_CODE') or ''))
            if len(code) == 4 and not code.startswith('0'): code = code[:3]
            elif len(code) == 4: code = code[1:]
            if code.startswith('13'): continue                      # residential vacant land -> not a home sale
            price = num(a.get('LS_PRICE'))
            if price is None or price < 1000: continue                # nominal-consideration transfers
            d = str(a.get('LS_DATE') or '')
            if not re.fullmatch(r'\d{8}', d): continue
            date = f'{d[:4]}-{d[4:6]}-{d[6:]}'
            key = (a['TOWN_ID'], a.get('PROP_ID'), date, price)
            if key in seen: continue
            seen.add(key)
            pid = re.sub(r'[^A-Za-z0-9]+', '-', str(a.get('PROP_ID') or a.get('LOC_ID') or '')).strip('-')
            book, pg = a.get('LS_BOOK'), a.get('LS_PAGE')
            items.append({'id': f"mah-{a['TOWN_ID']}-{pid}-{date}", 'addr': (a.get('SITE_ADDR') or '').strip() or None, 'arms_length': None, 'beds': None, 'builder_flag': None,
                          'buyer': (a.get('OWNER1') or '').strip() or None, 'county': title(county), 'deed_ref': f'Bk {book} Pg {pg}' if book and pg else None,
                          'geo_precision': 'parcel_centroid' if a['_lat'] else None, 'lat': r5(a['_lat']), 'lon': r5(a['_lon']), 'muni': name.get(a['TOWN_ID']),
                          'price': price, 'retrieved': TODAY, 'sale_date': date, 'seller': None, 'source': 'MassGIS L3 Parcels',
                          'source_url': MA_URL + '/query?' + urllib.parse.urlencode({'where': f"LOC_ID='{a.get('LOC_ID')}'", 'outFields': '*', 'f': 'json'}),
                          'sqft': num(a.get('BLD_AREA')) or num(a.get('RES_AREA')), 'state': 'MA', 'use_code_raw': str(a.get('USE_CODE') or ''), 'use_desc': a.get('USE_DESC'),
                          'use_type': 'residential', 'year_built': num(a.get('YEAR_BUILT')) or None, 'zip': (str(a.get('ZIP') or '').strip()[:5] or None)})
        got = items[n0:]
        ds = sorted(r['sale_date'] for r in got)
        cov.append({'county': title(county), 'state': 'MA', 'source': 'MassGIS L3 Standardized Assessor Parcels', 'source_url': MA_URL, 'towns_queried': len(ids),
                    'date_from': ds[0] if ds else None, 'date_to': ds[-1] if ds else None, 'count': len(got), 'munis_with_records': len({r['muni'] for r in got}),
                    'median_price': int(statistics.median([r['price'] for r in got])) if got else None})
        print(f'  MA {county}: {len(raw):,} raw -> {len(got):,} home sales', file=sys.stderr)
    meta = {'dataset': 'cet_home_sales_ma', 'portco': 'Commonwealth Electrical Technologies (Worcester + Taunton; NuWave, Norwell) - home sales in the CET-served MA counties, per user request',
            'description': 'Residential (home) sales in the 9 Massachusetts counties covered by the CET transfer dataset: 1-3 family, condos, apartments and other 1xx residential assessor classes.',
            'generated': TODAY, 'method': {'endpoint': MA_URL, 'county_assignment': 'TOWN_ID -> COUNTY via ' + MUNI_URL,
            'query': "TOWN_ID IN (<county towns>) AND LS_DATE >= '20250901' AND LS_DATE <= '<today>' AND USE_CODE LIKE '1%'", 'filters': '13x residential vacant land excluded; LS_PRICE >= $1,000; dedup (TOWN_ID, PROP_ID, sale_date, price)',
            'script': 'scripts/fetch_cet_home_sales.py'}, 'coverage': cov,
            'caveats': ['Assessor roll, not deeds: each parcel carries only its LAST sale (LS_DATE/LS_PRICE); a parcel sold twice in the window appears once.',
                        'buyer = OWNER1 (current owner of record); seller not published, so builder_flag is null.',
                        'Towns update the statewide layer on their own cadence; the most recent months are incomplete (lag, not a market decline).',
                        'Suffolk County covers Chelsea, Revere and Winthrop only (Boston data in the layer is a stale FY2023 snapshot).',
                        'Condo units share one parcel polygon, so several condo sales can share coordinates. Multi-parcel deeds repeat the total price on every parcel.']}
    columnar(os.path.join(OUT, 'cet_home_sales_ma.json'), meta, items)

# ── Connecticut + Rhode Island ───────────────────────────────────────────────
OPM = 'https://data.ct.gov/resource/5mzw-sjtu.json'
CAMA_URL = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0'
CRAN_URL = 'https://arcgisserver.cranstonri.org/arcgis/rest/services/Parcels/FeatureServer/0'
NON_HOME = re.compile(r'vac|land\b|\blnd\b|\bld\b|unbuild|ubld|apt ?5|apts? ?over|over ?(8|12)|apartments|apts comp|comm(ercial)? bldg|industrial', re.I)
TOWN_FIX = {'greenwhich': 'greenwich'}
CT_FIPS = {'001': 'Fairfield', '003': 'Hartford', '005': 'Litchfield', '007': 'Middlesex', '009': 'New Haven', '011': 'New London', '013': 'Tolland', '015': 'Windham'}

def socrata(url, params):
    out, off = [], 0
    while True:
        q = dict(params); q['$limit'] = 50000; q['$offset'] = off
        page = http(url + '?' + urllib.parse.urlencode(q))
        out += page; off += len(page)
        if len(page) < 50000: break
    return out

def pull_ct_ri():
    # town -> county crosswalk (CT Towns, FIPS county code)
    xw = http('https://data.ct.gov/resource/5hqs-h5c3.json?$limit=500')
    town_county = {}
    for t in xw:
        nm = (t.get('town_name') or t.get('town') or '').strip().lower(); cf = str(t.get('fips_code') or '')[2:5]
        if nm and cf in CT_FIPS: town_county[nm] = CT_FIPS[cf]
    town_county['norwich'] = 'New London'
    if len(town_county) < 150:   # fall back to the county already assigned per town in the published transfer file
        print('  crosswalk fields:', list(xw[0].keys()) if xw else None, file=sys.stderr)
    tr = json.load(open(os.path.join(OUT, 'cet_transfers_ct_ri.json')))
    cols, en = tr['cols'], tr['enums']
    tx = [{c: (en[c][v] if c in en and v is not None else v) for c, v in zip(cols, r)} for r in tr['rows']]
    pts = defaultdict(list)
    for r in tx:
        if r['state'] == 'CT' and r.get('muni'):
            town_county.setdefault(r['muni'].lower(), r['county'])
            if r.get('lat') and r.get('geo_precision') in ('address', 'parcel_centroid'): pts[r['muni'].lower()].append((r['lat'], r['lon']))
    town_pt = {k: (statistics.median(a for a, _ in v), statistics.median(b for _, b in v)) for k, v in pts.items()}
    items = []
    # 1) CT OPM residential, recorded 2025-06-01 onward (OPM newest vintage ends 2025-09-30)
    opm = socrata(OPM, {'$where': "daterecorded>='2025-06-01' AND propertytype='Residential' AND saleamount>=2000", '$order': 'serialnumber,listyear,town'})
    seen = set(); miss_geo = 0
    for a in opm:
        date = str(a.get('daterecorded') or '')[:10]; town = (a.get('town') or '').strip(); price = num(a.get('saleamount'))
        key = (town, a.get('serialnumber'), a.get('listyear'), a.get('address'), date, price)
        if key in seen or not date: continue
        seen.add(key)
        g = a.get('geo_coordinates') or a.get('location') or {}
        lat = lon = None; prec = 'address'
        if isinstance(g, dict) and g.get('coordinates'): lon, lat = g['coordinates'][:2]
        elif isinstance(g, dict) and g.get('latitude'): lat, lon = float(g['latitude']), float(g['longitude'])
        if lat is None:
            p = town_pt.get(town.lower()); miss_geo += 1
            if p: lat, lon = p; prec = 'town'
            else: prec = None
        nonuse = a.get('nonusecode')
        items.append({'id': f"cth-opm-{a.get('listyear')}-{a.get('serialnumber')}-{re.sub(r'[^A-Za-z]+', '', town)}", 'addr': a.get('address'), 'arms_length': not bool(nonuse), 'beds': None, 'builder_flag': None,
                      'buyer': None, 'county': town_county.get(town.lower()), 'geo_precision': prec, 'lat': r5(lat), 'lon': r5(lon), 'muni': town, 'price': price, 'retrieved': TODAY,
                      'sale_date': date, 'seller': None, 'source': 'ct_opm_sales', 'source_url': f"{OPM}?serialnumber={a.get('serialnumber')}&listyear={a.get('listyear')}",
                      'sqft': None, 'state': 'CT', 'use_code_raw': ' | '.join(x for x in [a.get('propertytype'), a.get('residentialtype'), f'nonuse:{nonuse}' if nonuse else None] if x),
                      'use_desc': a.get('residentialtype'), 'use_type': 'residential', 'year_built': None, 'zip': None})
    print(f'  CT OPM residential: {len(opm):,} -> {len(items):,} ({miss_geo} without a published point; placed at town median)', file=sys.stderr)
    n_opm = len(items)
    # 2) CT CAMA residential, last sale 2025-10-01 onward
    where = "(Sale_Date LIKE '10/%/2025%' OR Sale_Date LIKE '11/%/2025%' OR Sale_Date LIKE '12/%/2025%' OR Sale_Date LIKE '%/2026%') AND State_Use LIKE '1%' AND Sale_Price >= 2000"
    cam = arcgis_all(CAMA_URL, where, 'OBJECTID,Town_Name,Location,Property_Zip,State_Use,State_Use_Description,Sale_Date,Sale_Price,Owner,Co_Owner,AYB,Living_Area,Number_of_Bedroom')
    for a in cam:
        su = str(a.get('State_Use') or '')
        desc = f"{su} {a.get('State_Use_Description') or ''}"
        if su.startswith('13') or NON_HOME.search(desc): continue   # residential land / 5+ unit apartment buildings are not home sales
        m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', str(a.get('Sale_Date') or ''))
        if not m: continue
        date = f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}'
        if not ('2025-10-01' <= date <= TODAY): continue
        town = title(TOWN_FIX.get(str(a.get('Town_Name') or '').lower().replace('_', ' '), str(a.get('Town_Name') or '').replace('_', ' '))); z = re.sub(r'\D', '', str(a.get('Property_Zip') or ''))
        z = z.zfill(5)[:5] if z else None
        owner = ' & '.join(x.strip() for x in [a.get('Owner'), a.get('Co_Owner')] if x and x.strip())
        items.append({'id': f"cth-cama-{a['OBJECTID']}", 'addr': a.get('Location'), 'arms_length': None, 'beds': num(a.get('Number_of_Bedroom')) or None, 'builder_flag': None,
                      'buyer': owner or None, 'county': town_county.get(town.lower()), 'geo_precision': 'parcel_centroid' if a['_lat'] else None, 'lat': r5(a['_lat']), 'lon': r5(a['_lon']),
                      'muni': town, 'price': num(a.get('Sale_Price')), 'retrieved': TODAY, 'sale_date': date, 'seller': None, 'source': 'ct_cama_parcels', 'source_url': f"{CAMA_URL}/{a['OBJECTID']}",
                      'sqft': num(a.get('Living_Area')) or None, 'state': 'CT', 'use_code_raw': f"{su} {a.get('State_Use_Description') or ''}".strip(), 'use_desc': a.get('State_Use_Description'),
                      'use_type': 'residential', 'year_built': num(a.get('AYB')) or None, 'zip': z if z and z != '00000' else None})
    print(f'  CT CAMA residential: {len(cam):,} -> {len(items) - n_opm:,}', file=sys.stderr)
    n_ct = len(items)
    # 3) Cranston RI residential (state codes 01-03 residential / condo), recorded 2025-09-01 onward
    cr = arcgis_all(CRAN_URL, "RecordDate >= DATE '2025-09-01' AND SalesPrice >= 2000", 'OBJECTID,PropertyID,Location,Zip,ZIPCODE,SalesPrice,RecordDate,Deed_Type,Owner1,Owner2,LandUseCode,LandUseDescript,StateCode,StateCodeDescription,YearBuilt')
    for a in cr:
        sc = str(a.get('StateCode') or ''); desc = f"{a.get('StateCodeDescription') or ''} {a.get('LandUseDescript') or ''}"
        if not (re.match(r'0?[123]$', sc) or re.search(r'resid|single|family|condo|two fam|three fam', desc, re.I)) or re.search(r'vacant|land only|commercial|industrial', desc, re.I): continue
        ms = a.get('RecordDate'); date = time.strftime('%Y-%m-%d', time.gmtime(ms / 1000)) if ms else None
        if not date or date > TODAY: continue
        owner = ' & '.join(x.strip() for x in [a.get('Owner1'), a.get('Owner2')] if x and x.strip())
        items.append({'id': f"rih-cranston-{a.get('PropertyID')}-{date}", 'addr': (a.get('Location') or '').strip() or None, 'arms_length': None, 'beds': None, 'builder_flag': None, 'buyer': owner or None,
                      'county': 'Providence', 'geo_precision': 'parcel_centroid' if a['_lat'] else None, 'lat': r5(a['_lat']), 'lon': r5(a['_lon']), 'muni': 'Cranston', 'price': num(a.get('SalesPrice')),
                      'retrieved': TODAY, 'sale_date': date, 'seller': None, 'source': 'cranston_ri_parcels', 'source_url': f"http://web.cranstonri.org/CranstonGIS/TitleCard.aspx?propid={a.get('PropertyID')}",
                      'sqft': None, 'state': 'RI', 'use_code_raw': f"{a.get('LandUseCode') or ''} {a.get('LandUseDescript') or ''} | state:{sc} {a.get('StateCodeDescription') or ''} | deed:{a.get('Deed_Type') or ''}".strip(),
                      'use_desc': a.get('LandUseDescript'), 'use_type': 'residential', 'year_built': num(a.get('YearBuilt')) or None, 'zip': (str(a.get('Zip') or a.get('ZIPCODE') or '').strip()[:5] or None)})
    print(f'  Cranston RI residential: {len(cr):,} -> {len(items) - n_ct:,}', file=sys.stderr)
    # dedupe ids
    uniq = {}
    for r in items: uniq.setdefault(r['id'], r)
    items = list(uniq.values())
    cov = []
    grp = defaultdict(list)
    for r in items: grp[(r['county'] or 'Unknown', r['state'], r['source'])].append(r)
    for (c, s, src), rs in sorted(grp.items()):
        ds = sorted(r['sale_date'] for r in rs); pr = [r['price'] for r in rs if r['price']]
        cov.append({'county': c, 'state': s, 'source': src, 'date_from': ds[0], 'date_to': ds[-1], 'count': len(rs), 'munis_with_records': len({r['muni'] for r in rs}), 'median_price': int(statistics.median(pr)) if pr else None})
    meta = {'dataset': 'cet_home_sales_ct_ri', 'portco': 'Commonwealth Electrical Technologies / Horton Electrical Services (CT) - home sales in the CET-served CT and RI counties, per user request',
            'description': 'Residential (home) sales in all 8 Connecticut counties and Providence County RI (Cranston).', 'generated': TODAY,
            'counts_by_source': dict(Counter(r['source'] for r in items)),
            'method': [f"CT OPM Socrata {OPM} $where=daterecorded>='2025-06-01' AND propertytype='Residential' AND saleamount>=2000 (OPM newest vintage ends at 2025-09-30); county via CT towns crosswalk https://data.ct.gov/resource/5hqs-h5c3.json.",
                       f"CT CAMA {CAMA_URL} where Sale_Date in Oct 2025-{TODAY[:4]} AND State_Use LIKE '1%' (13x residential land excluded) AND Sale_Price >= 2000, returnCentroid, outSR 4326.",
                       f"Cranston RI {CRAN_URL} where RecordDate >= 2025-09-01 AND SalesPrice >= 2000, residential state/land-use codes only.", 'script: scripts/fetch_cet_home_sales.py'],
            'coverage': cov,
            'caveats': ['CT OPM rows have no buyer, year built, sqft or beds. OPM arms_length = no Non Use Code. OPM rows without a published point are placed at the town median (geo_precision "town").',
                        "CT CAMA holds each parcel's LAST sale only, and town extracts end between ~2026-01 and 2026-06; recent months are incomplete.",
                        'Rhode Island coverage is Cranston only (no statewide RI sales source is public; other towns are token-protected or lack sale fields).',
                        'CT counties are the 8 legacy counties (planning regions replaced them for Census purposes in 2022).']}
    cama_ids = {r['id'] for r in items if r['source'] == 'ct_cama_parcels'}   # before columnar() enum-encodes the rows in place
    columnar(os.path.join(OUT, 'cet_home_sales_ct_ri.json'), meta, items)
    reconcile_ct_transfers(cama_ids)

def reconcile_ct_transfers(home_ids):
    """Remove from cet_transfers_ct_ri the CT CAMA parcels that are homes (State_Use 1xx single-family / condo / 2-4 family /
    manufactured) but were tagged commercial/industrial/land by description keywords (e.g. '101P 1 Family Planned Comm').
    They now live in cet_home_sales_ct_ri, so the C&I outreach list no longer contains houses."""
    p = os.path.join(OUT, 'cet_transfers_ct_ri.json'); j = json.load(open(p))
    ii = j['cols'].index('id'); en = j['enums'].get('id')
    keep, drop = [], 0
    for r in j['rows']:
        rid = en[r[ii]] if en and r[ii] is not None else r[ii]
        if rid and rid.replace('ct-cama-', 'cth-cama-') in home_ids: drop += 1; continue
        keep.append(r)
    if not drop: return
    j['rows'] = keep; j['meta']['item_count'] = len(keep)
    j['meta'].setdefault('caveats', []).append(f'Reconciled {TODAY}: removed {drop} CT CAMA parcels with residential state use codes (1-family, condo, 2-4 family, manufactured home) that keyword mapping had tagged commercial/industrial/land; they are home sales and now live in sales/cet_home_sales_ct_ri.')
    json.dump(j, open(p, 'w'), separators=(',', ':'))
    print(f'reconciled cet_transfers_ct_ri: removed {drop} residential CAMA rows -> {len(keep):,} rows', file=sys.stderr)

if __name__ == '__main__':
    which = sys.argv[1:] or ['ma', 'ct']
    if 'ma' in which: pull_ma()
    if 'ct' in which: pull_ct_ri()
