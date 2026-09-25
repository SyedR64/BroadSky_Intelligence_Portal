#!/usr/bin/env python3
"""Compact data/sales/*.json ({meta, items}) into the columnar format (keeps meta) and cap size for GitHub Pages.
Usage: python3 scripts/compact_sales.py [max_items_per_file]"""
import json, os, sys, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = int(sys.argv[1]) if len(sys.argv) > 1 else 60000
for p in sorted(glob.glob(os.path.join(ROOT, 'data', 'sales', '*.json'))):
    j = json.load(open(p))
    if j.get('format') == 'columnar': print('skip (already columnar)', os.path.basename(p)); continue
    items = j.get('items', []); meta = j.get('meta', {})
    items = [i for i in items if isinstance(i, dict)]
    items.sort(key=lambda r: str(r.get('sale_date') or ''), reverse=True)
    if len(items) > CAP: meta.setdefault('caveats', []).append(f'Compacted to newest {CAP:,} of {len(items):,} records for web delivery'); items = items[:CAP]
    cols = sorted({k for r in items for k in r.keys()}, key=lambda k: (k != 'id', k))
    enums = {}
    for c in cols:
        vals = [r.get(c) for r in items]
        if all(isinstance(v, str) or v is None for v in vals):
            card = len(set(vals))
            if card <= 5000 and card < len(items) * 0.5:
                order = sorted(set(v for v in vals if v is not None)); idx = {v: i for i, v in enumerate(order)}; enums[c] = order
                for r in items: r[c] = idx[r[c]] if r.get(c) is not None else None
    rows = [[(round(r.get(c), 5) if isinstance(r.get(c), float) else r.get(c)) for c in cols] for r in items]
    meta['item_count'] = len(rows)
    before = os.path.getsize(p)
    json.dump({'format': 'columnar', 'meta': meta, 'cols': cols, 'enums': enums, 'rows': rows}, open(p, 'w'), separators=(',', ':'))
    print(f'{os.path.basename(p)}: {len(rows):,} rows  {before/1e6:.1f} MB -> {os.path.getsize(p)/1e6:.1f} MB  ({len(enums)} enum cols)')
