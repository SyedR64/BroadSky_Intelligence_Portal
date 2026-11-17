#!/usr/bin/env python3
"""Publish the SBA loan rows behind the add-on screen as columnar JSON under data/ppp/.

Input is the export folder written by scripts/build_ppp_screen.py (--export-dir): one CSV per segment and program, each
line copied verbatim from the SBA release. This script keeps every column and every cell exactly as released: values stay
strings (no number parsing, no trimming), the column order is the SBA file's, and nothing is filtered. Low-cardinality
columns are stored as an index into `enums` (the portal's columnar format, decoded by Data.decode in assets/core.js).

Output, per segment (pp, cet, fl, ts, bpi, fh) and program:
  data/ppp/<seg>_ppp.json      PPP loans (data.sba.gov/dataset/ppp-foia)
  data/ppp/<seg>_sba7a.json    7(a) loans (data.sba.gov/dataset/7-a-504-foia)
  data/ppp/<seg>_sba504.json   504 loans
  data/ppp/<seg>_ppp_geo_unresolved.json   rows that matched the NAICS codes and states but whose ZIP has no centroid
  data/ppp/index.json          the file list: rows, bytes, columns, as-of dates
A file over --max-mb is split by borrower state into <name>_<state>.json parts (none needed at the 2026-11 sizes).

Usage: python3 scripts/build_ppp_data.py --export-dir <scratch>/ppp/exports --candidates <scratch>/ppp/ppp_candidates.json
Standard library only. Re-runnable: the same exports give byte-identical files.
"""
import argparse, csv, io, json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEGS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
PROGRAMS = [('ppp', 'ppp', 'PPP', 'BorrowerState'), ('sba7a', 'sba7a', '7(a)', 'BorrState'), ('sba504', 'sba504', '504', 'BorrState')]
PORTAL = {'ppp': 'https://data.sba.gov/dataset/ppp-foia', 'sba7a': 'https://data.sba.gov/dataset/7-a-504-foia', 'sba504': 'https://data.sba.gov/dataset/7-a-504-foia'}
csv.field_size_limit(10 ** 9)


def read_csv(path):
    """Header and rows as strings. The PPP release is UTF-8 except for a stray byte 0xBF in some lender and business-type
    names ('Fed \\xbf Kabbage', '501(c)3 \\xbf Non Profit'); a byte that is not valid UTF-8 is kept as its Latin-1 character (¿)."""
    with open(path, newline='', encoding='utf-8', errors='surrogateescape') as fh:
        text = fh.read()
    if any('\udc80' <= ch <= '\udcff' for ch in text):
        text = ''.join(chr(ord(ch) - 0xdc00) if '\udc80' <= ch <= '\udcff' else ch for ch in text)
    r = csv.reader(io.StringIO(text, newline=''))
    head = next(r, None)
    rows = [row for row in r]
    return head or [], rows


def columnar(cols, rows):
    """{cols, enums, rows}: every value a string, as in the CSV; enum columns hold an index into enums[col]."""
    enums = {}
    n = len(rows)
    for ci, c in enumerate(cols):
        vals = set(r[ci] if ci < len(r) else '' for r in rows)
        if n and len(vals) <= 5000 and len(vals) < n * 0.5:
            order = sorted(vals)
            enums[c] = order
    idx = {c: {v: i for i, v in enumerate(o)} for c, o in enums.items()}
    out = []
    for r in rows:
        r = r + [''] * (len(cols) - len(r))
        out.append([idx[c][r[ci]] if c in idx else r[ci] for ci, c in enumerate(cols)])
    return enums, out


def fy_from(files):
    """'FY1991' from the earliest FYnnnn in the SBA file names read (the 7(a)/504 release is split by fiscal year)."""
    ys = [int(m) for f in files or [] for m in __import__('re').findall(r'FY(\d{4})', f)]
    return f'FY{min(ys)}' if ys else 'the earliest file'


def write(path, obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            if fh.read() == s:
                return len(s.encode('utf-8')), False
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(s)
    return len(s.encode('utf-8')), True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--export-dir', required=True)
    ap.add_argument('--candidates', required=True, help='ppp_candidates.json from build_ppp_screen.py (segment rules, source files, as-of dates)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'ppp'))
    ap.add_argument('--max-mb', type=float, default=90.0)
    a = ap.parse_args()
    cand = json.load(open(a.candidates, encoding='utf-8'))
    cm, segs = cand['meta'], cand['segments']
    os.makedirs(a.out, exist_ok=True)
    gen = cm.get('generated') or datetime.date.today().isoformat()
    files = []
    for seg in SEGS:
        S = segs[seg]
        for prog, stem, label, state_col in PROGRAMS:
            for suffix in ('', '_geo_unresolved'):
                src = os.path.join(a.export_dir, f'{stem}_{seg}{suffix}.csv')
                if not os.path.exists(src):
                    continue
                cols, rows = read_csv(src)
                if suffix and not rows:
                    continue
                if not cols:
                    print('empty export', src, file=sys.stderr); continue
                src_meta = cm['sources']['ppp' if prog == 'ppp' else 'sba_7a_504']
                meta = {
                    'dataset': f"SBA {label} loans matching the {S['label']} screen" + (' (ZIP not resolved to a location)' if suffix else ''),
                    'segment': seg, 'program': label, 'generated': gen,
                    'source': PORTAL[prog],
                    'source_files': [f for f in src_meta['files'] if (prog == 'ppp') or (prog == 'sba7a' and '7a' in f) or (prog == 'sba504' and '504' in f)],
                    'as_of': '2024-09-30' if prog == 'ppp' else src_meta.get('as_of'),
                    'match_rule': f"NAICS {', '.join(S['naics'])}; {S['geography']}" + ('. These rows matched the NAICS codes and state but their ZIP has no Census centroid, so distance could not be measured.' if suffix else ''),
                    'columns_note': 'Every column and cell exactly as the SBA released it, as strings, in the SBA file order. An empty string is an empty cell. A byte the SBA file holds that is not valid UTF-8 (0xBF, in a few lender and business-type names) is shown as ¿. Nothing is filtered: sole proprietors, self-employed individuals and independent contractors are included, and so are the PPP Race, Ethnicity, Gender and Veteran fields.',
                    'data_age': src_meta.get('data_age') or f"7(a) and 504 loans approved {fy_from(src_meta.get('files'))} to date, as of {src_meta.get('as_of')}",
                }
                parts = [(f'{seg}_{prog}{suffix}', rows)]
                enums, crow = columnar(cols, rows)
                est = len(json.dumps({'cols': cols, 'enums': enums, 'rows': crow}, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
                if est > a.max_mb * 1e6:   # split by borrower state
                    si = cols.index(state_col)
                    by = {}
                    for r in rows:
                        by.setdefault(r[si] if si < len(r) else '', []).append(r)
                    parts = [(f'{seg}_{prog}{suffix}_{(st or "none").lower()}', rs) for st, rs in sorted(by.items())]
                for name, prow in parts:
                    enums, crow = columnar(cols, prow)
                    m = {**meta, 'item_count': len(crow)}
                    size, changed = write(os.path.join(a.out, name + '.json'), {'format': 'columnar', 'meta': m, 'cols': cols, 'enums': enums, 'rows': crow})
                    files.append({'name': name, 'segment': seg, 'program': label, 'geo_unresolved': bool(suffix), 'rows': len(crow), 'bytes': size, 'cols': cols, 'as_of': m['as_of']})
                    print(f"{name}.json  {len(crow):>7,} rows  {size / 1e6:6.1f} MB  {'written' if changed else 'unchanged'}")
    index = {'meta': {'dataset': 'SBA loan rows behind the add-on screen (PPP, 7(a), 504)', 'generated': gen,
                      'sources': [{'name': 'SBA PPP loan data (FOIA)', 'url': PORTAL['ppp'], 'as_of': '2024-09-30'},
                                  {'name': 'SBA 7(a) and 504 loan data (FOIA)', 'url': PORTAL['sba7a'], 'as_of': cm['sources']['sba_7a_504'].get('as_of')}],
                      'segments': {s: {'label': segs[s]['label'], 'naics': segs[s]['naics'], 'geography': segs[s]['geography']} for s in SEGS},
                      'note': 'One file per segment and program; each holds every column and row of the SBA release that matches the segment, unfiltered.'},
             'files': files}
    write(os.path.join(a.out, 'index.json'), index)
    print(f"index.json  {len(files)} files  {sum(f['bytes'] for f in files) / 1e6:.1f} MB total")


if __name__ == '__main__':
    main()
