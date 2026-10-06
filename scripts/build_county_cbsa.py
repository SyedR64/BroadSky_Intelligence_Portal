#!/usr/bin/env python3
"""Build data/research/county_cbsa.json: OMB July 2023 CBSA delineation (Census List 1), one item per CBSA
with its member counties (5-digit FIPS) and central/outlying flag. Used by modules/national.js for metro roll-ups.
Prepared by Syed Rahman. Public data only.
Usage: python3 scripts/build_county_cbsa.py [path/to/list1_2023.xlsx]
"""
import json, os, sys, urllib.request, tempfile, datetime
import openpyxl

URL = 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'research', 'county_cbsa.json')
RETRIEVED = os.environ.get('RETRIEVED', datetime.date.today().isoformat())

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        path = os.path.join(tempfile.gettempdir(), 'list1_2023.xlsx')
        urllib.request.urlretrieve(URL, path)
    ws = openpyxl.load_workbook(path, read_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    hdr_i = next(i for i, r in enumerate(rows) if r and r[0] == 'CBSA Code')
    H = rows[hdr_i]
    ix = {h: H.index(h) for h in H if h}
    cb = {}
    for r in rows[hdr_i + 1:]:
        if not r or not r[0] or not str(r[0]).isdigit():
            continue
        code = str(r[0])
        st, co = str(r[ix['FIPS State Code']]).zfill(2), str(r[ix['FIPS County Code']]).zfill(3)
        if st == '72':   # Puerto Rico: outside the 50 states + DC county universe used by the portal
            continue
        it = cb.setdefault(code, {
            'id': f'cbsa-{code}', 'cbsa_code': code, 'cbsa_title': r[ix['CBSA Title']],
            'type': 'metro' if r[ix['Metropolitan/Micropolitan Statistical Area']].startswith('Metropolitan') else 'micro',
            'csa_code': r[ix['CSA Code']], 'csa_title': r[ix['CSA Title']], 'counties': [],
            'source_url': URL, 'retrieved': RETRIEVED})
        c = {'fips': st + co, 'central': r[ix['Central/Outlying County']] == 'Central'}
        if r[ix['Metropolitan Division Title']]:
            c['metro_division'] = r[ix['Metropolitan Division Title']]
        it['counties'].append(c)
    items = sorted(cb.values(), key=lambda x: x['cbsa_code'])
    n_cty = sum(len(i['counties']) for i in items)
    meta = {
        'dataset': 'county_cbsa', 'title': 'County to metro / micro area crosswalk (OMB July 2023 delineation)',
        'generated': RETRIEVED, 'author': 'Syed Rahman', 'builder': 'scripts/build_county_cbsa.py',
        'source': {'name': 'Census Bureau List 1: CBSAs, metropolitan divisions and CSAs, July 2023 (OMB Bulletin 23-01)', 'url': URL, 'vintage': 'July 2023', 'retrieved': RETRIEVED},
        'item_count': len(items), 'county_rows': n_cty,
        'metro_count': sum(1 for i in items if i['type'] == 'metro'), 'micro_count': sum(1 for i in items if i['type'] == 'micro'),
        'note': 'Connecticut is delineated on the 9 planning regions (FIPS 09110-09190), matching the 2023 Gazetteer county universe. Counties outside every CBSA are rural and appear in no item. Puerto Rico is excluded. County names come from the Census Gazetteer in the national county table.',
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump({'meta': meta, 'items': items}, f, separators=(',', ':'))
    print(f'wrote {OUT}: {len(items)} CBSAs, {n_cty} county rows')

if __name__ == '__main__':
    main()
