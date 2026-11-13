#!/usr/bin/env python3
"""
Build server/knowledge/homes.sqlite from the portal's public home-sales files.

  python3 scripts/build_homes_db.py            # writes server/knowledge/homes.sqlite
  python3 scripts/build_homes_db.py --out /tmp/homes.sqlite

Input: data/sales/pp_sales_nj.json, pp_sales_pa_a.json, pp_sales_pa_b.json (the Punctual Pros
service area). They are columnar JSON: {format, meta, cols, enums, rows}. A cell is decoded the
way assets/core.js does it: if the column has a non-empty enum list and the cell is not null, the
cell is an index into that list; otherwise the cell is the value.

Output: one row per recorded sale, plus small lookup and summary tables. Buyer and seller names
are NOT copied: the assistant never outputs owner names. Standard library only.

Author: Syed Rahman.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import sqlite3
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['pp_sales_nj', 'pp_sales_pa_a', 'pp_sales_pa_b']
OUT = os.path.join(ROOT, 'server', 'knowledge', 'homes.sqlite')

# A month counts as "dense" (complete enough to report) when its count of market home sales is at
# least this share of the median of the months before it, and at least DENSE_MIN sales.
DENSE_SHARE = 0.85
DENSE_MIN = 20
STATE_SHARE = 0.90      # share of a state's recent sales that must come from counties already full for the month

def _load_normalisers():
    """addr_key and muni_key live in server/property.py so the build and the lookups can never disagree."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('bsp_homes_property', os.path.join(ROOT, 'server', 'property.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)            # standard library only at import time; httpx is loaded on a live lookup
    return mod.addr_key, mod.muni_key


addr_key, muni_key = _load_normalisers()


def decode(j):
    """Mirror of the columnar decoder in assets/core.js."""
    cols, enums = j['cols'], j.get('enums') or {}
    for r in j['rows']:
        o = {}
        for i, c in enumerate(cols):
            v = r[i]
            if v is not None and enums.get(c):
                v = enums[c][v]
            o[c] = v
        yield o


# The source files' QA notes quote sample records, owner names included. Those notes are not copied, and any other note
# that carries a name field is dropped too.
_NAME_FIELD = re.compile(r'OWNER_NAME\s*=|\bOWN\d\b|(?i:buyer|seller|grantor|grantee|owner)\s*[=:]\s*[A-Z]{2,}[ ,]+[A-Z]{2,}')


def clean_caveats(items):
    """The source caveats that are safe to keep: no QA spot-check notes and nothing that quotes a name field."""
    return [c for c in (str(x) for x in items or []) if not re.match(r'\s*QA\b', c) and not _NAME_FIELD.search(c)]


def name_leaks(con, names):
    """Buyer or seller names from the source rows that appear in the notes and source list the database keeps.
    A buyer that is itself a municipality ("HAMPDEN TOWNSHIP") is a public body, not a person, and is not counted."""
    text = '\n'.join(str(v) for t in ('meta', 'sources') for row in con.execute(f'SELECT * FROM {t}') for v in row if isinstance(v, str))
    towns = {str(m).upper() for m, in con.execute('SELECT muni FROM munis')}
    return sorted(n for n in names if n in text and n.upper() not in towns)


def clean_int(v, lo, hi):
    try:
        v = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return v if lo <= v <= hi else None


def tri(v):
    return None if v is None else (1 if v else 0)


def dense_month(counts):
    """Latest month whose count holds up against the six months before it. counts: {ym: n}."""
    months = sorted(counts)
    best = None
    for i, ym in enumerate(months):
        before = [counts[m] for m in months[max(0, i - 6):i]]
        if len(before) < 2:
            continue
        if counts[ym] >= DENSE_MIN and counts[ym] >= DENSE_SHARE * statistics.median(before):
            best = ym
    return best


def state_dense_month(by_county):
    """Latest full month for a state. by_county: {county: {ym: n}}.

    The state total alone is not enough: a month can pass on the total while some counties have only part of it
    posted. So a month counts for the state only when the total passes the rule AND the counties whose own newest
    full month reaches it carry at least STATE_SHARE of the state's sales in the six months before. A county with
    no recent sales (a frozen or stalled source) carries no weight and does not hold the state back."""
    total = {}
    for counts in by_county.values():
        for ym, n in counts.items():
            total[ym] = total.get(ym, 0) + n
    own = {c: dense_month(counts) for c, counts in by_county.items()}
    months = sorted(total)
    for i in range(len(months) - 1, -1, -1):
        ym, prior = months[i], months[max(0, i - 6):i]
        before = [total[m] for m in prior]
        if len(before) < 2 or total[ym] < DENSE_MIN or total[ym] < DENSE_SHARE * statistics.median(before):
            continue
        weight = {c: sum(counts.get(m, 0) for m in prior) for c, counts in by_county.items()}
        full = sum(w for c, w in weight.items() if own[c] and own[c] >= ym)
        if sum(weight.values()) and full >= STATE_SHARE * sum(weight.values()):
            return ym
    return None


def content_hash(con):
    """A hash of everything the database holds except the build time, so an unchanged input is recognised."""
    h = hashlib.sha256()
    for t in ('sources', 'munis', 'sales', 'months'):
        for row in con.execute(f'SELECT * FROM {t} ORDER BY 1, 2, 3'):
            h.update(repr(row).encode('utf-8'))
    for k, v in con.execute("SELECT k, v FROM meta WHERE k NOT IN ('built_at', 'content_sha256') ORDER BY k"):
        h.update(repr((k, v)).encode('utf-8'))
    return h.hexdigest()


def existing_hash(path):
    try:
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        try:
            row = con.execute("SELECT v FROM meta WHERE k='content_sha256'").fetchone()
        finally:
            con.close()
        return row[0] if row else None
    except sqlite3.Error:
        return None


def build(out, src_dir=None):
    src_dir = src_dir or os.path.join(ROOT, 'data', 'sales')
    tmp = out + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    con = sqlite3.connect(tmp)
    con.executescript('''
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
        CREATE TABLE sources (id INTEGER PRIMARY KEY, state TEXT, county TEXT, name TEXT, url TEXT, file TEXT, retrieved TEXT, date_from TEXT, date_to TEXT);
        CREATE TABLE munis (id INTEGER PRIMARY KEY, state TEXT, county TEXT, muni TEXT, muni_key TEXT, code TEXT);
        CREATE TABLE sales (
            id INTEGER PRIMARY KEY, state TEXT NOT NULL, county TEXT NOT NULL, muni_id INTEGER, zip TEXT, addr TEXT, addr_key TEXT,
            sale_date TEXT NOT NULL, ym TEXT NOT NULL, price INTEGER, year_built INTEGER, sqft INTEGER, beds INTEGER,
            use_type TEXT, use_code TEXT, arms_length INTEGER, market INTEGER NOT NULL, home INTEGER NOT NULL, new_construction INTEGER,
            block_lot TEXT, parcel_id TEXT, lat REAL, lon REAL, source_id INTEGER NOT NULL);
        CREATE TABLE months (state TEXT, county TEXT, ym TEXT, n_all INTEGER, n_homes INTEGER, PRIMARY KEY (state, county, ym)) WITHOUT ROWID;
        CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID;
    ''')
    sources, munis, caveats, generated = {}, {}, {}, {}
    stats = {'rows': 0, 'by_state': {}, 'by_file': {}, 'names_dropped': 0}
    months, names = {}, set()
    for f in FILES:
        with open(os.path.join(src_dir, f + '.json'), encoding='utf-8') as fh:
            j = json.load(fh)
        if j.get('format') != 'columnar':
            raise SystemExit(f'{f}: expected the columnar format')
        meta = j.get('meta') or {}
        caveats[f] = clean_caveats(meta.get('caveats'))
        generated[f] = str(meta.get('generated') or '')[:10]
        cov = {(c.get('state'), c.get('county')): c for c in meta.get('coverage') or []}
        n = 0
        batch = []
        for o in decode(j):
            st, co = o.get('state'), o.get('county')
            sale_date = str(o.get('sale_date') or '')
            if not st or not co or not re.match(r'^\d{4}-\d{2}-\d{2}$', sale_date):
                continue
            n += 1
            if o.get('buyer') or o.get('seller'):
                stats['names_dropped'] += 1
                for nm in (o.get('buyer'), o.get('seller')):
                    nm = str(nm or '').strip()
                    if len(nm) >= 8 and ' ' in nm:              # a full name; one short word would match ordinary text
                        names.add(nm)
            # One source per county. New Jersey rows come from yearly state files, so there the source is per file and
            # each sale cites the file that holds it. Rows are newest first, so `retrieved` is that of the newest sale.
            row_url = str(o.get('source_url') or '') if st == 'NJ' else ''
            sk = (st, co, row_url)
            if sk not in sources:
                c = cov.get((st, co)) or {}
                sources[sk] = (len(sources) + 1, st, co, c.get('source') or o.get('source') or '', row_url or c.get('source_url') or '', f,
                               str(o.get('retrieved') or generated[f])[:10], c.get('date_from') or '', c.get('date_to') or '')
            code = None
            if st == 'NJ':
                m = re.match(r'^NJ-(\d{4})-', str(o.get('id') or ''))
                code = m.group(1) if m else None
            mk = (st, co, o.get('muni') or '')
            if mk not in munis:
                munis[mk] = [len(munis) + 1, st, co, o.get('muni') or '', muni_key(o.get('muni')), code]
            elif code and not munis[mk][5]:
                munis[mk][5] = code
            price = clean_int(o.get('price'), 0, 2_000_000_000)
            arms = tri(o.get('arms_length'))
            use_type, use_code = o.get('use_type'), o.get('use_code_raw')
            home = 1 if use_type == 'residential' and not str(use_code or '').startswith('NJ class 4C') else 0   # 4C is apartment buildings
            market = 1 if arms != 0 and price is not None and price >= 1000 else 0
            yb = clean_int(o.get('year_built'), 1700, int(sale_date[:4]) + 1)
            year = int(sale_date[:4])
            if st == 'NJ':
                newc = tri(o.get('new_construction'))
            elif o.get('builder_flag') is True or (yb is not None and yb >= year - 1):
                newc = 1        # same proxy as the NJ file: built in the sale year or the year before, or sold by a builder
            elif yb is not None or o.get('builder_flag') is False:
                newc = 0
            else:
                newc = None
            z = str(o.get('zip') or '')
            batch.append((st, co, munis[mk][0], z if re.match(r'^\d{5}$', z) else None, (o.get('addr') or '').strip() or None,
                          addr_key(o.get('addr')) or None, sale_date, sale_date[:7], price, yb, clean_int(o.get('sqft'), 100, 100000),
                          clean_int(o.get('beds'), 1, 20), use_type, use_code, arms, market, home, newc, o.get('block_lot') or None,
                          o.get('parcel_id') or None, o.get('lat'), o.get('lon'), sources[sk][0]))
            key = (st, co, sale_date[:7])
            a = months.setdefault(key, [0, 0])
            a[0] += 1
            a[1] += 1 if (market and home) else 0
        con.executemany('INSERT INTO sales (state, county, muni_id, zip, addr, addr_key, sale_date, ym, price, year_built, sqft, beds, use_type, use_code, '
                        'arms_length, market, home, new_construction, block_lot, parcel_id, lat, lon, source_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', batch)
        stats['by_file'][f] = n
        stats['rows'] += n
    con.executemany('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?)', list(sources.values()))
    con.executemany('INSERT INTO munis VALUES (?,?,?,?,?,?)', [tuple(m) for m in munis.values()])
    con.executemany('INSERT INTO months VALUES (?,?,?,?,?)', [(k[0], k[1], k[2], v[0], v[1]) for k, v in months.items()])
    con.executescript('''
        CREATE INDEX sales_addr ON sales (addr_key);
        CREATE INDEX sales_period ON sales (market, home, state, county, ym);
        CREATE INDEX sales_muni ON sales (muni_id, ym);
        CREATE INDEX sales_zip ON sales (zip, ym);
        CREATE INDEX munis_key ON munis (muni_key);
    ''')

    # Coverage: latest sale date and last dense month per state and per county (market home sales).
    coverage = {'state': {}, 'county': {}}
    for st, in con.execute('SELECT DISTINCT state FROM sales'):
        c = {}
        for co, ym, n in con.execute('SELECT county, ym, n_homes FROM months WHERE state=?', (st,)):
            c.setdefault(co, {})[ym] = n
        r = con.execute('SELECT COUNT(*), SUM(market AND home), MIN(sale_date), MAX(sale_date) FROM sales WHERE state=?', (st,)).fetchone()
        coverage['state'][st] = {'rows': r[0], 'market_homes': r[1] or 0, 'first_sale': r[2], 'latest_sale': r[3], 'dense_month': state_dense_month(c)}
        stats['by_state'][st] = r[0]
    for st, co in con.execute('SELECT DISTINCT state, county FROM sales ORDER BY state, county'):
        c = dict(con.execute('SELECT ym, n_homes FROM months WHERE state=? AND county=?', (st, co)).fetchall())
        r = con.execute('SELECT COUNT(*), SUM(market AND home), MIN(sale_date), MAX(sale_date), SUM(year_built IS NOT NULL), SUM(sqft IS NOT NULL), '
                        'SUM(beds IS NOT NULL), SUM(zip IS NOT NULL) FROM sales WHERE state=? AND county=?', (st, co)).fetchone()
        coverage['county'][f'{st}|{co}'] = {'rows': r[0], 'market_homes': r[1] or 0, 'first_sale': r[2], 'latest_sale': r[3], 'dense_month': dense_month(c),
                                            'has_year_built': round((r[4] or 0) / r[0], 3), 'has_sqft': round((r[5] or 0) / r[0], 3),
                                            'has_beds': round((r[6] or 0) / r[0], 3), 'has_zip': round((r[7] or 0) / r[0], 3)}
    meta = {
        'built_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'rows': stats['rows'], 'rows_by_state': stats['by_state'], 'rows_by_file': stats['by_file'],
        'market_homes': con.execute('SELECT COUNT(*) FROM sales WHERE market AND home').fetchone()[0],
        'coverage': coverage, 'caveats': caveats, 'files_generated': generated,
        'dense_rule': f'A month is complete enough to report when it has at least {DENSE_MIN} market home sales and at least '
                      f'{int(DENSE_SHARE * 100)}% of the median of the six months before it. For a whole state the counties that are '
                      f'full for the month must also carry at least {int(STATE_SHARE * 100)}% of the recent sales.',
        'names': 'Buyer and seller names are not stored.',
    }
    con.executemany('INSERT INTO meta VALUES (?,?)', [(k, json.dumps(v) if not isinstance(v, str) else v) for k, v in meta.items()])
    con.commit()
    # No buyer or seller name may ship. The sales table has no name column; check every other text the file keeps.
    leaks = name_leaks(con, names)
    if leaks:
        con.close()
        os.remove(tmp)
        raise SystemExit(f'{len(leaks)} buyer or seller names found in the notes or source list; nothing was written')
    cols = {r[1] for r in con.execute('PRAGMA table_info(sales)')}
    assert not cols & {'buyer', 'seller', 'owner', 'grantor', 'grantee'}, 'the sales table must not have a name column'
    # Same sales files in, same database out: when nothing but the build time would differ, the file on disk is left alone.
    # The nightly job relies on this so that an unchanged night does not produce a new homes.sqlite (and a backend deploy).
    sha = content_hash(con)
    meta['content_sha256'] = sha
    if os.path.exists(out) and existing_hash(out) == sha:
        con.close()
        os.remove(tmp)
        meta['unchanged'] = True
        return meta, stats
    con.execute('INSERT INTO meta VALUES (?,?)', ('content_sha256', sha))
    con.commit()
    con.execute('VACUUM')
    con.close()
    os.replace(tmp, out)
    return meta, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    meta, stats = build(a.out)
    verb = 'unchanged (same sales files, file left as it was)' if meta.get('unchanged') else 'wrote'
    print(f"{verb} {a.out}: {os.path.getsize(a.out) / 1e6:.1f} MB, {meta['rows']:,} sales ({meta['market_homes']:,} market home sales)")
    print('rows by file:', meta['rows_by_file'], '| rows carrying a name in the source (not copied):', stats['names_dropped'])
    for st, c in meta['coverage']['state'].items():
        print(f"  {st}: {c['rows']:,} rows, latest sale {c['latest_sale']}, last dense month {c['dense_month']}")
    for k, c in meta['coverage']['county'].items():
        print(f"    {k:16s} {c['rows']:6,d} rows  homes {c['market_homes']:6,d}  latest {c['latest_sale']}  dense {c['dense_month']}  year built {c['has_year_built']:.0%}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
