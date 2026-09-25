#!/usr/bin/env python3
"""Document every research/sales dataset (schema, counts, meta keys) into data/research/README.md for module builders."""
import json, os, glob, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = ["# Research & sales datasets — auto-generated schema reference\n", "Shape: `{meta:{...}, items:[...]}` unless noted. Load with `ctx.data.research('<name>')` (research/) or `ctx.data.load('sales/<name>')` (sales/).\n"]
for folder in ['research', 'sales']:
    for p in sorted(glob.glob(os.path.join(ROOT, 'data', folder, '*.json'))):
        name = os.path.basename(p)[:-5]
        try: j = json.load(open(p))
        except Exception as e: out.append(f"\n## {folder}/{name}\nINVALID JSON: {e}\n"); continue
        items = j.get('items', []) if isinstance(j, dict) else j
        meta = j.get('meta', {}) if isinstance(j, dict) else {}
        size = os.path.getsize(p)
        out.append(f"\n## {folder}/{name}  ({len(items):,} items · {size/1e6:.1f} MB)\n")
        if meta:
            out.append(f"meta keys: {', '.join(meta.keys())}\n")
            for k in ('dataset', 'generated', 'method', 'item_count', 'caveats'):
                if k in meta: out.append(f"- **{k}**: {json.dumps(meta[k])[:400]}\n")
        extra = [k for k in (j.keys() if isinstance(j, dict) else []) if k not in ('meta', 'items')]
        if extra: out.append(f"extra top-level keys: {', '.join(extra)}\n")
        if items and isinstance(items[0], dict):
            keys = collections.Counter(); types = {}
            for it in items[:500]:
                for k, v in it.items(): keys[k] += 1; types.setdefault(k, type(v).__name__ if v is not None else 'null')
            out.append("fields: " + ', '.join(f"`{k}`:{types[k]}" for k, _ in keys.most_common()) + "\n")
            out.append("sample: `" + json.dumps(items[0])[:700].replace('`', "'") + "`\n")
            # enumerate categorical values for small-cardinality string fields
            for k in list(keys)[:40]:
                vals = [it.get(k) for it in items if isinstance(it.get(k), str)]
                c = collections.Counter(vals)
                if 1 < len(c) <= 12 and len(vals) > len(items) * 0.5: out.append(f"- `{k}` values: {dict(c.most_common(12))}\n")
open(os.path.join(ROOT, 'data', 'research', 'README.md'), 'w').write(''.join(out))
print(''.join(out)[:6000])
