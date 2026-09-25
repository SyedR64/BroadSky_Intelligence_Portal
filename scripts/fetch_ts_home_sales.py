#!/usr/bin/env python3
"""Home sales for Gloucester County NJ (Thomas Scientific HQ, Swedesboro) -> data/sales/ts_sales_gloucester_nj.json (columnar).
Source: NJ Division of Taxation SR1A statewide sales extract (fixed-width, 663 bytes; same source as sales/pp_sales_nj),
geocoded by PAMS_PIN against the NJOGIS Parcels_Composite_NJ_WM layer (parcel centroids, MUN_NAME).
Usage: python3 scripts/fetch_ts_home_sales.py [path/to/YTDSR1A2026.zip]   (downloads the zip when no path is given)"""
import io, json, os, re, sys, time, zipfile, statistics, urllib.request, urllib.parse
from collections import Counter, defaultdict
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from fetch_cet_home_sales import http, columnar, r5, title   # shared helpers (stdlib only)
TODAY = time.strftime('%Y-%m-%d')
SR1A = 'https://www.nj.gov/treasury/taxation/lpt/statdata/YTDSR1A2026.zip'
PARCELS = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0'
COUNTY, COUNTY_NAME, FROM = '08', 'Gloucester', '250901'
# Field offsets inferred against known records of sales/pp_sales_nj (same file):
#  [0:4] county+district (PCL_MUN) · [33] U/N usability · [34:36] non-usable code · [46:55] verified sale price
#  [297:322] property location · [338:344] deed date YYMMDD · [350:355]+[355:359] block+suffix · [359:364]+[364:368] lot+suffix
#  [619:624] qualifier · [626:629] property class · [652:656] year built · [656:660] living space (sq ft)

def part(num, suf):
    n = num.strip().lstrip('0') or '0'; s = suf.strip()
    return f'{n}.{s}' if s else n

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    raw = open(src, 'rb').read() if src else urllib.request.urlopen(urllib.request.Request(SR1A, headers={'User-Agent': 'Mozilla/5.0'}), timeout=300).read()
    z = zipfile.ZipFile(io.BytesIO(raw)); name = z.namelist()[0]
    lines = z.read(name).decode('latin-1').splitlines()
    recs = []
    for l in lines:
        if len(l) < 660 or l[:2] != COUNTY: continue
        d = l[338:344]
        if not d.isdigit() or d < FROM or d > TODAY[2:].replace('-', ''): continue
        cls = l[626:629].strip()
        if cls != '2': continue                                    # class 2 = residential (1-4 family, condo)
        try: price = int(l[46:55])
        except ValueError: continue
        if price < 1000: continue
        un, nu = l[33], l[34:36].strip()
        yb = l[652:656].strip(); sq = l[656:660].strip()
        recs.append({'mun': l[0:4], 'block': part(l[350:355], l[355:359]), 'lot': part(l[359:364], l[364:368]), 'qual': l[619:624].strip(),
                     'addr': l[297:322].strip(), 'date': f'20{d[:2]}-{d[2:4]}-{d[4:]}', 'price': price, 'un': un, 'nu': nu or None,
                     'yb': int(yb) if yb.isdigit() and 1700 < int(yb) <= 2027 else None, 'sqft': int(sq) if sq.isdigit() and int(sq) > 0 else None})
    print(f'  SR1A {name}: {len(recs):,} class-2 Gloucester sales since {FROM}', file=sys.stderr)
    pins = sorted({f"{r['mun']}_{r['block']}_{r['lot']}" for r in recs})
    geo = {}
    for i in range(0, len(pins), 200):
        chunk = pins[i:i + 200]
        j = http(PARCELS + '/query', {'where': 'PAMS_PIN IN (' + ','.join(f"'{p}'" for p in chunk) + ')', 'outFields': 'PAMS_PIN,MUN_NAME,ZIP5', 'returnGeometry': 'false', 'returnCentroid': 'true', 'outSR': '4326', 'f': 'json'})
        for f in j.get('features', []):
            a = f['attributes']; c = f.get('centroid') or {}
            geo[a['PAMS_PIN']] = (c.get('y'), c.get('x'), a.get('MUN_NAME'), a.get('ZIP5'))
    munname = {}
    for p, g in geo.items():
        if g[2]: munname[p[:4]] = g[2]
    items = []
    for r in recs:
        pin = f"{r['mun']}_{r['block']}_{r['lot']}"; g = geo.get(pin)
        arms = r['un'] == 'U' or r['nu'] in ('07', '27')
        items.append({'id': f"NJ-{r['mun']}-{r['block']}_{r['lot']}{('-' + r['qual']) if r['qual'] else ''}-{r['date']}", 'addr': r['addr'] or None, 'arms_length': arms, 'beds': None,
                      'block_lot': f"{r['block']}/{r['lot']}{(' ' + r['qual']) if r['qual'] else ''}", 'builder_flag': None, 'buyer': None, 'county': COUNTY_NAME,
                      'geo_precision': 'parcel_centroid' if g and g[0] else None, 'lat': r5(g[0]) if g else None, 'lon': r5(g[1]) if g else None,
                      'muni': title(munname.get(r['mun'], '')).replace(' Twp', ' Twp').replace(' Boro', ' Boro') or None, 'nu_code': r['nu'], 'price': r['price'], 'retrieved': TODAY,
                      'sale_date': r['date'], 'seller': None, 'source': 'NJ Taxation SR1A YTDSR1A2026', 'source_url': SR1A, 'sqft': r['sqft'], 'state': 'NJ',
                      'use_code_raw': 'NJ class 2', 'use_type': 'residential', 'year_built': r['yb'], 'zip': (g[3] if g and g[3] else None)})
    uniq = {}
    for r in items: uniq.setdefault(r['id'], r)
    items = list(uniq.values())
    ds = sorted(r['sale_date'] for r in items); pr = [r['price'] for r in items if r['arms_length']]
    mc = Counter(r['sale_date'][:7] for r in items)
    meta = {'dataset': 'ts_sales_gloucester_nj', 'portco': 'Thomas Scientific (HQ and distribution center, Swedesboro, Gloucester County NJ)',
            'description': 'Residential (class 2) home sales recorded in Gloucester County, NJ, the county of Thomas Scientific\'s headquarters and main distribution center (its local labor and housing market).',
            'generated': TODAY, 'method': [f'NJ Division of Taxation SR1A statewide sales extract ({SR1A}); COUNTY-CODE 08, deed date >= 2025-09-01, property class 2, verified price >= $1,000. Field offsets verified against sales/pp_sales_nj records from the same file.',
                                            f'Geocoded by PAMS_PIN (muncode_block_lot) against {PARCELS} (returnCentroid, outSR 4326); condo qualifiers map to the parent lot. MUN_NAME and ZIP5 from the same layer.', 'script: scripts/fetch_ts_home_sales.py'],
            'coverage': [{'county': COUNTY_NAME, 'state': 'NJ', 'source': 'NJ Division of Taxation SR1A sales file (YTDSR1A2026) joined to NJOGIS Parcels composite', 'source_url': SR1A,
                          'date_from': ds[0] if ds else None, 'date_to': ds[-1] if ds else None, 'count': len(items), 'residential_count': len(items), 'arms_length_count': sum(1 for r in items if r['arms_length']),
                          'geocoded_count': sum(1 for r in items if r['lat']), 'median_price_arms_length': int(statistics.median(pr)) if pr else None, 'monthly_counts': dict(sorted(mc.items()))}],
            'caveats': ['SR1A lags ~3 months (file dated 2026-08-12): dense through ~May/June 2026.', 'Buyer and seller names are redacted in the public SR1A extract (null).',
                        'arms_length = usable (U) or non-usable codes 07 (improved after assessment) / 27 (pre-revaluation); all other NU codes false.',
                        'Thomas Scientific sells nationally to labs; Gloucester County is its headquarters county (hiring and cost-of-living market), not a service territory.']}
    columnar(os.path.join(ROOT, 'data', 'sales', 'ts_sales_gloucester_nj.json'), meta, items)

if __name__ == '__main__': main()
