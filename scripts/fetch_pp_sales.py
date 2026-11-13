#!/usr/bin/env python3
"""
Refresh the Punctual Pros home-sales files from the public sources they were first pulled from.

  python3 scripts/fetch_pp_sales.py --dry-run          # fetch and report, write nothing
  python3 scripts/fetch_pp_sales.py                    # fetch, merge, rewrite the files that changed
  python3 scripts/fetch_pp_sales.py --only york        # one source (nj, lancaster, york, cumberland, montgomery,
                                                       #   chester, berks, lebanon, franklin, adams, perry)
  python3 scripts/fetch_pp_sales.py --dry-run --diff   # also list which fields changed on rows already held

Files: data/sales/pp_sales_nj.json, pp_sales_pa_a.json, pp_sales_pa_b.json (columnar: format, meta, cols, enums, rows).

Sources
  New Jersey (Atlantic, Burlington, Monmouth, Ocean): the Division of Taxation SR1A year-to-date sales file
    (YTDSR1A<year>.zip, fixed width, 663 bytes a record). New rows get a parcel centroid, town and ZIP from the
    NJOGIS Parcels_Composite_NJ_WM service. The file for the next sales year appears while the current one is
    still posted, so both names are tried every run.
  Pennsylvania (Lancaster, York, Cumberland, Berks, Lebanon, Franklin, Adams, Perry, Chester, Montgomery): each
    county's public ArcGIS REST parcel or assessment service.
  Dauphin County is NOT refreshed. Its rows came from a property-tax inquiry website whose robots.txt disallows
    automated access. The rows already held stay as a frozen snapshot.

Rules
  Incremental: each source is asked for sales from (the newest sale date held, less 45 days) to today. The 45 days
    cover deeds that are recorded late. The NJ file is a whole-file download, so every record in it from the
    start of the held coverage is read.
  Merge: rows are keyed by the same id scheme as the first pull. A row returned again replaces the held row only
    when a source field changed. A held row that is not returned is kept.
    A sale that comes back under a new record id (an NJ deed recorded again in the next yearly file, a PA sale
    the county re-dated) replaces the held row instead of sitting beside it.
  Safe failure: a source that errors, returns nothing, returns far fewer rows than are held for the overlap
    window, or has lost a field leaves its rows untouched and is listed in meta.failed_sources. The note is
    written once and stays the same while the failure lasts. A county with no rows held inside the window and
    none returned is not a failure. The run exits non-zero only when every source failed.
  Window: sales older than 18 months are dropped (the cut-off is the first day of the month, so it moves once a
    month). The window moves only for a source that answered in this run.
  Deterministic: stable row order and JSON formatting. A file whose rows did not change is not rewritten.
  Notes: when rows change, meta.coverage is recomputed, the NJ source names every state file in use, and
    first-pull notes that quote a date or a count are marked "First pull".
  coverage[].retrieved is the date a county's rows last changed, not the date the source was last asked.
  robots.txt is fetched for every host; a source whose path is disallowed, or whose robots.txt cannot be read,
    is skipped for the run.
  Buyer and seller columns stay as they are in these files. No other personal field is added.

Standard library only. Author: Syed Rahman.
"""

import argparse
import collections
import datetime
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALES = os.path.join(ROOT, 'data', 'sales')
UA = 'BSP-portal-sales-refresh/1.0 (nightly public-records refresh; Python urllib)'
OVERLAP_DAYS = 45
WINDOW_MONTHS = 18
MIN_PRICE = 1000                 # the files keep a sale when its price is missing or at least this
TIME_BUDGET = 420                # seconds; a source that has not started by then is reported as failed
SOURCE_BUDGET = 180              # seconds one source may spend before it is given up on for this run
SCRIPT = 'scripts/fetch_pp_sales.py'
ROBOTS_TRIES, ROBOTS_WAIT = 3, 2    # attempts at a host's robots.txt, and the pause between them (seconds, growing)
FROZEN = {('pp_sales_pa_a', 'Dauphin'): {
    'county': 'Dauphin', 'state': 'PA', 'frozen_at': '2026-09-24',
    'reason': 'Rows came from the county property-tax inquiry website, whose robots.txt disallows automated access. '
              'They are a frozen snapshot and are not refreshed.'}}
FROZEN_CAVEAT = ('Dauphin County is a frozen snapshot taken 2026-09-24. It is not part of the automatic refresh because the '
                 'county site disallows automated access. Dauphin rows are partial and do not get newer.')

DEADLINE = [None, None]          # whole run, current source
LOG = []


def log(msg):
    print(msg, file=sys.stderr, flush=True)


class SourceError(Exception):
    """A source failed or looked wrong. Its held rows stay untouched."""


# ───────────────────────── HTTP, robots.txt, ArcGIS ─────────────────────────

_robots = {}


def robots_ok(url):
    """True when the host's robots.txt lets this script fetch the URL path. No robots.txt (4xx) means no rules."""
    u = urllib.parse.urlsplit(url)
    host = f'{u.scheme}://{u.netloc}'
    if host not in _robots:
        rp, err = urllib.robotparser.RobotFileParser(), None
        for i in range(ROBOTS_TRIES):
            try:
                req = urllib.request.Request(host + '/robots.txt', headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=15) as r:
                    body = r.read(500_000).decode('utf-8', 'replace')
                # A firewall page or an HTML error served with status 200 is not a robots file: no rules.
                rp.parse(body.splitlines() if re.search(r'(?im)^\s*(user-agent|disallow|allow)\s*:', body) and '<html' not in body[:300].lower() else [])
                err = None
                break
            except urllib.error.HTTPError as e:
                if e.code < 500:
                    rp.parse([])                                # no robots.txt: no rules
                    err = None
                    break
                err = e
            except Exception as e:                              # timeout, reset, DNS
                err = e
            if i + 1 < ROBOTS_TRIES:
                time.sleep(ROBOTS_WAIT * (i + 1))
        if err is not None:
            # The rules could not be read, so the source is skipped for this run. That is not a disallow, and the
            # answer is not kept: the next source on the same host asks again.
            raise SourceError(f'robots.txt could not be read for {u.netloc}: {type(err).__name__}: {err}'[:200])
        _robots[host] = rp
    return _robots[host].can_fetch(UA, url)


def http(url, data=None, timeout=90, tries=3, raw=False, method=None):
    if not robots_ok(url):
        raise SourceError(f'robots.txt disallows {urllib.parse.urlsplit(url).netloc}{urllib.parse.urlsplit(url).path}')
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    err = None
    for i in range(tries):
        if (DEADLINE[0] and time.time() > DEADLINE[0] + 60) or (DEADLINE[1] and time.time() > DEADLINE[1]):
            raise SourceError('time budget exhausted' + (f' (last error: {type(err).__name__}: {err})'[:160] if err else ''))
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': UA}, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if method == 'HEAD':
                    return {k.lower(): v for k, v in r.headers.items()}
                b = r.read()
            return b if raw else json.loads(b.decode('utf-8', 'replace'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            err = e
        except Exception as e:      # timeouts, resets, bad JSON
            err = e
        time.sleep(2 * (i + 1))
    raise SourceError(f'{type(err).__name__}: {err}')


def arcgis(layer, params, timeout=90):
    p = {'f': 'json'}
    p.update(params)
    j = http(layer + '/query', p, timeout=timeout)
    if isinstance(j, dict) and j.get('error'):
        e = j['error']
        raise SourceError(f"ArcGIS error {e.get('code')}: {e.get('message')} {' '.join(map(str, e.get('details') or []))}"[:300])
    return j


def arcgis_all(layer, where, fields, oid, page=1000, need=()):
    """Every record matching `where`, attributes only, paged in object-id order."""
    out, off = [], 0
    while True:
        j = arcgis(layer, {'where': where, 'outFields': ','.join(fields), 'returnGeometry': 'false', 'orderByFields': oid,
                           'resultOffset': off, 'resultRecordCount': page})
        fs = j.get('features') or []
        if fs and off == 0:
            missing = [f for f in need if f not in fs[0]['attributes']]
            if missing:
                raise SourceError('schema change: missing field(s) ' + ', '.join(missing))
        out += [f['attributes'] for f in fs]
        if not fs or not j.get('exceededTransferLimit'):
            return out
        off += len(fs)
        if off > 400_000:
            raise SourceError('paging did not end')


def arcgis_in(layer, field, values, fields, batch=200, centroid=False, geometry=False, numeric=False):
    """Records whose `field` is one of `values`, in batches. Yields (attributes, (lat, lon) or None)."""
    values = sorted(set(values))
    for i in range(0, len(values), batch):
        chunk = values[i:i + batch]
        inlist = ','.join(str(int(v)) for v in chunk) if numeric else ','.join("'" + str(v).replace("'", "''") + "'" for v in chunk)
        p = {'where': f'{field} IN ({inlist})', 'outFields': ','.join(fields), 'returnGeometry': 'true' if geometry else 'false', 'outSR': '4326'}
        if centroid:
            p['returnCentroid'] = 'true'
        if geometry:
            p['geometryPrecision'] = '6'
        j = arcgis(layer, p, timeout=120)
        for f in j.get('features') or []:
            pt = None
            if centroid and f.get('centroid'):
                pt = (f['centroid'].get('y'), f['centroid'].get('x'))
            elif geometry and f.get('geometry'):
                pt = ring_centroid(f['geometry'].get('rings') or [])
            yield f['attributes'], pt


def ring_centroid(rings):
    """Area-weighted centroid of a polygon given as rings of [lon, lat]. Returns (lat, lon) or None."""
    A = cx = cy = 0.0
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            c = x0 * y1 - x1 * y0
            A += c
            cx += (x0 + x1) * c
            cy += (y0 + y1) * c
    if abs(A) < 1e-14:
        pts = [p for ring in rings for p in ring]
        return (sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)) if pts else None
    return (cy / (3 * A), cx / (3 * A))


def in_rings(lon, lat, rings):
    inside = False
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            if (y0 > lat) != (y1 > lat) and lon < (x1 - x0) * (lat - y0) / (y1 - y0) + x0:
                inside = not inside
    return inside


ZCTA = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1'


def zcta_for(points):
    """ZIP (2020 Census ZCTA) for each (lat, lon), by point-in-polygon. Returns {point: zip}. Never fails the source."""
    points = [p for p in points if p and p[0] is not None]
    if not points:
        return {}
    try:
        env = f'{min(p[1] for p in points) - .01},{min(p[0] for p in points) - .01},{max(p[1] for p in points) + .01},{max(p[0] for p in points) + .01}'
        polys, off = [], 0
        while True:
            j = arcgis(ZCTA, {'geometry': env, 'geometryType': 'esriGeometryEnvelope', 'inSR': '4326', 'spatialRel': 'esriSpatialRelIntersects',
                              'outFields': 'ZCTA5', 'returnGeometry': 'true', 'outSR': '4326', 'maxAllowableOffset': '0.0001', 'geometryPrecision': '5',
                              'orderByFields': 'ZCTA5', 'resultOffset': off, 'resultRecordCount': 200}, timeout=120)
            fs = j.get('features') or []
            for f in fs:
                rings = (f.get('geometry') or {}).get('rings') or []
                xs = [p[0] for r in rings for p in r]
                ys = [p[1] for r in rings for p in r]
                if xs:
                    polys.append((min(xs), min(ys), max(xs), max(ys), rings, f['attributes']['ZCTA5']))
            if not fs or not j.get('exceededTransferLimit'):
                break
            off += len(fs)
    except Exception as e:
        log(f'    ZIP lookup skipped ({e}); new rows keep a blank ZIP')
        return {}
    out = {}
    for lat, lon in set(points):
        for x0, y0, x1, y1, rings, z in polys:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and in_rings(lon, lat, rings):
                out[(lat, lon)] = z
                break
    return out


# ───────────────────────── small helpers ─────────────────────────

def clean(v):
    """Trimmed text with runs of spaces collapsed; None when empty."""
    if v is None:
        return None
    v = re.sub(r'\s+', ' ', str(v)).strip()
    return v or None


def to_int(v, lo=None, hi=None):
    try:
        n = int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None
    if (lo is not None and n < lo) or (hi is not None and n > hi):
        return None
    return n


def r5(v):
    return round(float(v), 5) if v is not None else None


def ms_date(v):
    """ArcGIS epoch milliseconds to the UTC calendar date."""
    if v is None:
        return None
    try:
        return (datetime.datetime(1970, 1, 1) + datetime.timedelta(milliseconds=int(v))).strftime('%Y-%m-%d')
    except (OverflowError, ValueError):
        return None


def months_between(since, today):
    y, m = int(since[:4]), int(since[5:7])
    out = []
    while (y, m) <= (int(today[:4]), int(today[5:7])):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

_BUILDER = re.compile(r'\b(BUILDERS?|DEVELOPERS?|DEVELOPMENT|HOMES|CONSTRUCTION|COMMUNITIES|NVR|D ?R HORTON|RYAN HOMES|LENNAR|PULTE|TOLL BROTHERS)\b')
_ENTITY = re.compile(r'\b(LLC|INC|LP|CORP)\b')
_PLACE = re.compile(r'\b(ESTATES|VILLAGE|MEADOWS|CROSSING|PRESERVE)\b')
_NOT_BUILDER = re.compile(r'\b(HUD|HOUSING AND URBAN|REDEVELOPMENT|COMMUNITY DEVELOPMENT|BUYS HOMES|HOME BUYERS)\b')


def builder_flag(seller):
    """Same idea as the first pull: the seller name reads like a home builder or developer."""
    if not seller:
        return None
    u = seller.upper()
    if _NOT_BUILDER.search(u):
        return False
    return bool(_BUILDER.search(u) or (_ENTITY.search(u) and _PLACE.search(u)))


def street_key(addr):
    m = re.match(r'\s*(\d+)\s+(?:[NSEW]\s+)?(\w+)', (addr or '').upper())
    return m.groups() if m else None


class Learned:
    """Lookups learned from the rows already held, so a refresh maps codes the way the first pull did."""

    def __init__(self, rows):
        self.rows = rows

    def table(self, keyfn, field):
        votes = collections.defaultdict(collections.Counter)
        for r in self.rows:
            k = keyfn(r)
            if k is not None and r.get(field) is not None:
                votes[k][r[field]] += 1
        return {k: c.most_common(1)[0][0] for k, c in votes.items()}


def use_type_for(learned_use, code, fallback):
    return learned_use.get(code) if code in learned_use else fallback


# ───────────────────────── New Jersey: SR1A file + NJOGIS parcels ─────────────────────────

SR1A_URL = 'https://www.nj.gov/treasury/taxation/lpt/statdata/YTDSR1A{year}.zip'
NJ_PARCELS = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0'
NJ_COUNTIES = {'01': 'Atlantic', '03': 'Burlington', '13': 'Monmouth', '15': 'Ocean'}
NJ_USE = {'1': 'land', '2': 'residential', '3A': 'other', '3B': 'land', '4A': 'commercial', '4B': 'industrial', '4C': 'residential'}
# SR1A layout (https://www.nj.gov/treasury/taxation/pdf/lpt/SR1Afilelayout.pdf), offsets checked against the held rows:
#  [0:4] county+district · [33] U/N usability · [34:36] non-usable code · [46:55] verified sale price
#  [297:322] property location · [328:333] deed book · [333:338] deed page · [338:344] deed date YYMMDD
#  [350:355]+[355:359] block+suffix · [359:364]+[364:368] lot+suffix · [619:624] qualifier
#  [626:629] property class · [629:632] class 4 type · [652:656] year built · [656:663] living space


def _nj_part(num, suf):
    n = num.strip().lstrip('0') or '0'
    s = suf.strip()
    return f'{n}.{s}' if s else n


def nj_parse(line, label, url):
    d6 = line[338:344]
    if not d6.isdigit():
        return None
    mun = line[0:4]
    blk, lot, qual = _nj_part(line[350:355], line[355:359]), _nj_part(line[359:364], line[364:368]), line[619:624].strip()
    cls, c4 = line[626:629].strip(), line[629:632].strip()
    nu = line[34:36].strip() or None
    return {
        'id': f"NJ-{mun}-{line[328:333].strip()}-{line[333:338].strip()}-{blk}_{lot}{'-' + qual if qual else ''}",
        'addr': line[297:322].strip() or None, 'arms_length': line[33] == 'U' or nu in ('07', '27'), 'beds': None,
        'block_lot': f"{blk}/{lot}{' ' + qual if qual else ''}", 'builder_flag': None, 'buyer': None, 'county': NJ_COUNTIES[line[:2]],
        'nu_code': nu, 'price': to_int(line[46:55]), 'sale_date': f'20{d6[:2]}-{d6[2:4]}-{d6[4:]}', 'seller': None,
        'source': label, 'source_url': url, 'sqft': to_int(line[656:663], 1), 'state': 'NJ',
        'use_code_raw': f'NJ class {cls}' + (f'/{c4}' if c4 and c4 != '000' else ''), 'use_type': NJ_USE.get(cls, 'other'),
        'year_built': to_int(line[652:656], 1701, int(line[338:340]) + 2001), '_mun': mun, '_blk': blk, '_lot': lot, '_qual': qual, '_cls': cls}


def nj_fetch(ctx):
    """All four counties from every posted SR1A year-to-date file. Returns {county: [rows]}."""
    today, year = ctx['today'], int(ctx['today'][:4])
    seen_files = dict((ctx['meta'].get('refresh') or {}).get('sr1a_files') or {})
    files, changed = [], False
    for y in (year, year + 1):                          # the file is named for the sales year, which runs ahead of the calendar
        url = SR1A_URL.format(year=y)
        try:
            h = http(url, method='HEAD', timeout=60)
        except urllib.error.HTTPError:
            continue                                    # not posted (yet, or any more)
        lm = h.get('last-modified') or ''
        files.append((y, url, lm))
        if seen_files.get(f'YTDSR1A{y}') != lm:
            changed = True
    if not files:
        raise SourceError('no YTDSR1A file is posted for ' + f'{year} or {year + 1}')
    ctx['notes'].append('SR1A files posted: ' + '; '.join(f'YTDSR1A{y} (last modified {lm or "unknown"})' for y, _, lm in files))
    if not changed and not ctx.get('force'):
        return 'unchanged'
    recs = {}
    for y, url, lm in files:
        raw = http(url, raw=True, timeout=300)
        z = zipfile.ZipFile(io.BytesIO(raw))
        text = z.read(z.namelist()[0]).decode('latin-1')
        label, n = f'NJ Taxation SR1A YTDSR1A{y}', 0
        for line in text.splitlines():
            if len(line) < 660 or line[:2] not in NJ_COUNTIES:
                continue
            r = nj_parse(line, label, url)
            if r is None or not (ctx['floor'][r['county']] <= r['sale_date'] <= today):
                continue
            if r['price'] is None or r['price'] < MIN_PRICE:
                continue
            recs[r['id']] = r                              # a later file wins
            n += 1
        log(f'    YTDSR1A{y}: {n:,} in-scope records')
        ctx['sr1a_seen'][f'YTDSR1A{y}'] = lm
    if not recs:
        raise SourceError('SR1A files parsed to zero in-scope records (layout change?)')
    out = collections.defaultdict(list)
    for r in recs.values():
        out[r['county']].append(r)
    return out


def nj_enrich(rows, ctx):
    """Parcel centroid, town, ZIP and missing year built or address for rows not yet held."""
    L = ctx['learned']
    muni_by_code = L.table(lambda r: r['id'][3:7], 'muni')
    cand = {}
    for r in rows:
        mun, blk, lot, q = r['_mun'], r['_blk'], r['_lot'], r['_qual']
        lotpin = f'{mun}_{blk}_{lot}'
        r['_pins'] = [lotpin, f"{mun}_{blk}_{lot.split('.')[0]}", f"{mun}_{blk.split('.')[0]}_{lot}"]
        r['_unit'] = f'{lotpin}_{q}' if q else None
        for p in r['_pins'] + ([r['_unit']] if r['_unit'] else []):
            cand[p] = None
    for a, pt in arcgis_in(NJ_PARCELS, 'PAMS_PIN', cand, ['PAMS_PIN', 'MUN_NAME', 'PCLBLOCK', 'PROP_LOC', 'ST_ADDRESS', 'ZIP5', 'YR_CONSTR'], batch=200, centroid=True):
        cand[a['PAMS_PIN']] = (a, pt)
    blockzip = {}

    def block_zip(mun, blk):
        if mun not in blockzip:
            votes, off = collections.defaultdict(collections.Counter), 0
            try:
                while True:
                    j = arcgis(NJ_PARCELS, {'where': f"PCL_MUN='{mun}' AND ST_ADDRESS=PROP_LOC", 'groupByFieldsForStatistics': 'PCLBLOCK,ZIP5',
                                            'outStatistics': json.dumps([{'statisticType': 'count', 'onStatisticField': 'OBJECTID', 'outStatisticFieldName': 'n'}]),
                                            'orderByFields': 'PCLBLOCK,ZIP5', 'resultOffset': off, 'resultRecordCount': 2000})
                    fs = j.get('features') or []
                    for f in fs:
                        a = f['attributes']
                        if clean(a.get('ZIP5')):
                            votes[a['PCLBLOCK']][a['ZIP5']] += a['n']
                    if not fs or not j.get('exceededTransferLimit'):
                        break
                    off += len(fs)
            except SourceError:
                votes = {}
            blockzip[mun] = votes
        c = blockzip[mun].get(blk)
        if c:
            top, n = c.most_common(1)[0]
            if n / sum(c.values()) >= 0.6:
                return top
        return None

    for r in rows:
        pt = None
        for p in r['_pins'] + ([r['_unit']] if r['_unit'] else []):
            if cand.get(p) and cand[p][1] and cand[p][1][0] is not None:
                pt = cand[p][1]
                break
        own = (cand.get(r['_unit']) if r['_unit'] else None) or cand.get(r['_pins'][0])
        a = own[0] if own else {}
        r['lat'], r['lon'] = (r5(pt[0]), r5(pt[1])) if pt else (None, None)
        r['geo_precision'] = 'parcel_centroid' if pt else 'none'
        r['muni'] = muni_by_code.get(r['_mun']) or (clean(a.get('MUN_NAME')) or '').title() or None
        if a.get('ST_ADDRESS') is not None and clean(a.get('ST_ADDRESS')) == clean(a.get('PROP_LOC')):
            z = clean(a.get('ZIP5'))
        else:
            z = block_zip(r['_mun'], r['_blk'])
        r['zip'] = z if z and re.fullmatch(r'\d{5}', z) else None
        if r['year_built'] is None:
            r['year_built'] = to_int(a.get('YR_CONSTR'), 1701, int(r['sale_date'][:4]) + 1)
        if r['addr'] is None:
            r['addr'] = clean(a.get('PROP_LOC'))
        r['new_construction'] = bool(r['_cls'] == '2' and r['year_built'] is not None and r['year_built'] >= int(r['sale_date'][:4]) - 1)
    return [r for r in rows if r['addr'] or r['lat'] is not None]


# ───────────────────────── Pennsylvania counties ─────────────────────────

def _pa_row(pid, date, prefix, **kw):
    r = {'id': f'{prefix}-{pid}-{date}', 'sale_date': date, 'state': 'PA', 'arms_length': None, 'beds': None, 'builder_flag': None,
         'seller': None, 'sqft': None, 'year_built': None}
    r.update(kw)
    return r


def _local_geo(layer, oid, rows):
    for a, pt in arcgis_in(layer, oid, [r['_oid'] for r in rows], [oid], batch=100, geometry=True, numeric=True):
        yield a[oid], pt


def _set_geo(rows, pts):
    for r in rows:
        pt = pts.get(r['_oid'])
        r['lat'], r['lon'] = (r5(pt[0]), r5(pt[1])) if pt and pt[0] is not None else (None, None)
        r['geo_precision'] = 'parcel_centroid' if r['lat'] is not None else 'none'


# Lancaster ---------------------------------------------------------------------------------------------------
LAN = 'https://services1.arcgis.com/I6XnrlnguPDoEObn/arcgis/rest/services/Parcels_HUBnew/FeatureServer/0'


def lancaster_fetch(ctx):
    F = ['OBJECTID', 'ACCOUNT', 'LANDUSECD', 'OWNER_NAME', 'SALE_PRICE', 'SALE_DATE', 'DEED_BK_PG', 'ADDRESS']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(LAN, f"SALE_DATE>={ctx['since'].replace('-', '')}", F, 'OBJECTID', need=F):
        sd = str(to_int(a.get('SALE_DATE')) or '')
        if len(sd) != 8 or not a.get('ACCOUNT'):
            continue
        lu = clean(a.get('LANDUSECD'))
        d1 = (lu or ' ')[0]
        fb = 'land' if lu == '101' or d1 in '89' else 'residential' if d1 in '12' else 'industrial' if d1 == '4' else 'commercial' if d1 in '35' else 'other' if d1 in '67' else None
        out.append(_pa_row(a['ACCOUNT'], f'{sd[:4]}-{sd[4:6]}-{sd[6:]}', 'PA-LAN', addr=clean(a.get('ADDRESS')), buyer=clean(a.get('OWNER_NAME')),
                           deed_ref=clean(a.get('DEED_BK_PG')), parcel_id=a['ACCOUNT'], price=to_int(a.get('SALE_PRICE')), sale_type_raw=None,
                           use_code_raw=lu, use_type=use_type_for(use, lu, fb), _oid=a['OBJECTID']))
    return out


def lancaster_enrich(rows, ctx):
    muni = ctx['learned'].table(lambda r: (r.get('parcel_id') or '')[:3], 'muni')
    _set_geo(rows, dict(_local_geo(LAN, 'OBJECTID', rows)))
    z = zcta_for([(r['lat'], r['lon']) for r in rows])
    for r in rows:
        r['muni'] = muni.get(r['parcel_id'][:3])
        r['zip'] = z.get((r['lat'], r['lon']))
    seen = {(h.get('parcel_id') or '')[:3] for h in ctx['learned'].rows}
    new_codes = sorted({r['parcel_id'][:3] for r in rows} - seen)
    if new_codes:
        log(f'    Lancaster: municipality code(s) not seen before, town left blank: {", ".join(new_codes)}')
    return rows


# York --------------------------------------------------------------------------------------------------------
YOR = 'https://arcweb1.ycpc.org/server/rest/services/OPEN_DATA/Parcels/FeatureServer/0'


def york_fetch(ctx):
    F = ['OBJECTID', 'PIDN', 'DEED_BK', 'DEED_PG', 'PROPADR', 'OWNER_FULL', 'PREV_OWNER', 'CLASS', 'LUC', 'RES_LIVING_AREA', 'YRBLT', 'SALEDT', 'PRICE', 'COMM_YEAR_BUILT', 'COMM_BUILDING_SQ_FT']
    where = ' OR '.join(f"SALEDT LIKE '%-{MON[m - 1]}-{y}'" for y, m in months_between(ctx['since'], ctx['today']))
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(YOR, where, F, 'OBJECTID', need=F):
        m = re.fullmatch(r'(\d\d)-([A-Z]{3})-(\d{4})', clean(a.get('SALEDT')) or '')
        if not m or m.group(2) not in MON or not a.get('PIDN'):
            continue
        cl, luc = clean(a.get('CLASS')), clean(a.get('LUC'))
        code = f'CLASS={cl};LUC={luc}'
        fb = 'land' if luc == '100' else {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'F': 'land', 'A': 'land', 'E': 'other', 'U': 'other'}.get(cl)
        bk, pg, seller = clean(a.get('DEED_BK')), clean(a.get('DEED_PG')), clean(a.get('PREV_OWNER'))
        out.append(_pa_row(a['PIDN'], f'{m.group(3)}-{MON.index(m.group(2)) + 1:02d}-{m.group(1)}', 'PA-YOR', addr=clean(a.get('PROPADR')),
                           buyer=clean(a.get('OWNER_FULL')), seller=seller, builder_flag=builder_flag(seller), deed_ref=f'{bk}-{pg}' if bk and pg else None,
                           parcel_id=a['PIDN'], price=float(a['PRICE']) if a.get('PRICE') is not None else None, sale_type_raw=None,
                           sqft=to_int(a.get('RES_LIVING_AREA'), 1) or to_int(a.get('COMM_BUILDING_SQ_FT'), 1),
                           year_built=to_int(a.get('YRBLT'), 1) or to_int(a.get('COMM_YEAR_BUILT'), 1), use_code_raw=code,
                           use_type=use_type_for(use, code, fb), _oid=a['OBJECTID']))
    return out


def york_enrich(rows, ctx):
    muni = ctx['learned'].table(lambda r: (r.get('parcel_id') or '')[:2], 'muni')
    _set_geo(rows, dict(_local_geo(YOR, 'OBJECTID', rows)))
    z = zcta_for([(r['lat'], r['lon']) for r in rows])
    for r in rows:
        r['muni'] = muni.get(r['parcel_id'][:2])
        r['zip'] = z.get((r['lat'], r['lon']))
    return rows


# Cumberland --------------------------------------------------------------------------------------------------
CUM = 'https://services1.arcgis.com/1Cfo0re3un0w6a30/arcgis/rest/services/Tax_Parcels/FeatureServer/0'


def cumberland_fetch(ctx):
    F = ['OBJECTID', 'PID', 'PIN', 'Suffix', 'OWNER', 'SITUS', 'SITUS_ZIP', 'P_TYPE', 'LUC', 'DB_PG', 'SQFT', 'SALEPRICE', 'SALEDATE', 'YEAR_BLT', 'MUNI_NAME', 'BEDROOM_CO']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(CUM, f"SALEDATE >= DATE '{ctx['since']}'", F, 'OBJECTID', need=F):
        d = ms_date(a.get('SALEDATE'))
        if not d or not a.get('PID'):
            continue
        pt = clean(a.get('P_TYPE')) or ''
        m = re.search(r'\((\d+)\)\s*$', a.get('LUC') or '')
        luc = m.group(1) if m else None
        code = f'P_TYPE={pt};LUC={luc}'
        fb = 'land' if luc == '100' or pt[:1] in ('A', 'L', 'V') else 'residential' if pt[:1] == 'R' else 'commercial' if pt[:1] == 'C' else 'industrial' if pt == 'I' else 'other'
        pin, suf = clean(a.get('PIN')), clean(a.get('Suffix'))
        out.append(_pa_row(clean(a['PID']), d, 'PA-CUM', addr=clean(a.get('SITUS')), buyer=clean(a.get('OWNER')), deed_ref=clean(a.get('DB_PG')),
                           parcel_id=f'{pin} {suf}' if pin and suf else pin, price=to_int(a.get('SALEPRICE')), sale_type_raw=None,
                           beds=to_int(a.get('BEDROOM_CO'), 1), sqft=to_int(a.get('SQFT'), 1), year_built=to_int(a.get('YEAR_BLT'), 1),
                           use_code_raw=code, use_type=use_type_for(use, code, fb), _oid=a['OBJECTID'],
                           _zip=clean(a.get('SITUS_ZIP')), _muni=clean(a.get('MUNI_NAME'))))
    return out


def cumberland_enrich(rows, ctx):
    _set_geo(rows, dict(_local_geo(CUM, 'OBJECTID', rows)))
    for r in rows:
        r['muni'], r['zip'] = r['_muni'], (r['_zip'] or '')[:5] or None
    return rows


# Montgomery --------------------------------------------------------------------------------------------------
MON_T = 'https://gis.montcopa.org/arcgis/rest/services/Parcels/GIS_BOA_LAND/FeatureServer/0'
MON_P = 'https://gis.montcopa.org/arcgis/rest/services/Parcels/Montgomery_County_Parcels/FeatureServer/10'


def montgomery_fetch(ctx):
    F = ['OBJECT_ID', 'PARCEL', 'SALE_DATE_1', 'CONSIDERATION', 'OWN1', 'OWN2', 'LOCATION1', 'LOC_ZIP1_ZIP2', 'CLASS', 'LAND_USE', 'SFLA', 'YEAR_BUILT',
         'BEDROOMS', 'MUNI_CODE', 'COMM_YR_BLT', 'COMM_AREA']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(MON_T, f"SALE_DATE_1 >= timestamp '{ctx['since']} 00:00:00'", F, 'OBJECT_ID', page=1000, need=F):
        d, pid = ms_date(a.get('SALE_DATE_1')), clean(a.get('PARCEL'))
        if not d or not pid:
            continue
        cl, lu = clean(a.get('CLASS')), clean(a.get('LAND_USE'))
        code = f'CL={cl};LU={lu}'
        fb = {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'A': 'land', 'F': 'land', 'E': 'other', 'U': 'other'}.get((cl or ' ')[0], 'other')
        o1, o2 = clean(a.get('OWN1')), clean(a.get('OWN2'))
        out.append(_pa_row(pid, d, 'MONT', addr=clean(a.get('LOCATION1')), buyer=f'{o1} & {o2}' if o1 and o2 else o1, price=to_int(a.get('CONSIDERATION')),
                           beds=to_int(a.get('BEDROOMS'), 1), sqft=to_int(a.get('SFLA'), 1) or to_int(a.get('COMM_AREA'), 1),
                           year_built=to_int(a.get('YEAR_BUILT'), 1) or to_int(a.get('COMM_YR_BLT'), 1), use_code_raw=code,
                           use_type=use_type_for(use, code, fb), _zip=(clean(a.get('LOC_ZIP1_ZIP2')) or '')[:5] or None, _pid=pid))
    return out


def montgomery_enrich(rows, ctx):
    muni = ctx['learned'].table(lambda r: r['id'][5:7], 'muni')
    pts = {clean(a['TAXPIN']): pt for a, pt in arcgis_in(MON_P, 'TAXPIN', [r['_pid'] for r in rows], ['TAXPIN'], batch=250, centroid=True)}
    for r in rows:
        pt = pts.get(r['_pid'])
        r['lat'], r['lon'] = (r5(pt[0]), r5(pt[1])) if pt and pt[0] is not None else (None, None)
        r['zip'] = r['_zip'] if r['_zip'] and re.fullmatch(r'\d{5}', r['_zip']) else None
        r['geo_precision'] = 'parcel_centroid' if r['lat'] is not None else 'zip' if r['zip'] else 'none'
        r['muni'] = muni.get(r['_pid'][:2])
    return rows


# Chester -----------------------------------------------------------------------------------------------------
CHE = 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/arcgis/rest/services/Parcels_owners/FeatureServer/0'


def chester_fetch(ctx):
    F = ['OBJECTID', 'UPI', 'LOC_ADDRESS', 'MUNI', 'OWN1', 'OWN2', 'ADDR1', 'ZIP1', 'DEED_REC_DATE', 'LUC', 'CLASS', 'LAST_SALE_PRICE']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(CHE, f"DEED_REC_DATE >= DATE '{ctx['since']}'", F, 'OBJECTID', need=F):
        d, upi = ms_date(a.get('DEED_REC_DATE')), clean(a.get('UPI'))
        if not d or not upi:
            continue
        cl, luc = clean(a.get('CLASS')), clean(a.get('LUC'))
        code = f'CL={cl};LUC={luc}'
        fb = 'land' if (luc or '').startswith('V') else {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'F': 'land', 'A': 'land', 'E': 'other'}.get((cl or ' ')[0], 'other')
        o1, o2, addr = clean(a.get('OWN1')), clean(a.get('OWN2')), clean(a.get('LOC_ADDRESS'))
        k = street_key(addr)
        price = to_int(a.get('LAST_SALE_PRICE'))
        out.append(_pa_row(upi, d, 'CHES', addr=addr, buyer=f'{o1} & {o2}' if o1 and o2 else o1, price=price, use_code_raw=code,
                           use_type=use_type_for(use, code, fb), _oid=a['OBJECTID'],
                           _zip=(clean(a.get('ZIP1')) or '')[:5] if k and k == street_key(a.get('ADDR1')) else None))
    return out


def chester_enrich(rows, ctx):
    muni = ctx['learned'].table(lambda r: r['id'].split('-')[1], 'muni')
    pts = {a['OBJECTID']: pt for a, pt in arcgis_in(CHE, 'OBJECTID', [r['_oid'] for r in rows], ['OBJECTID'], batch=200, centroid=True, numeric=True)}
    _set_geo(rows, pts)
    for r in rows:
        r['muni'] = muni.get(r['id'].split('-')[1])
        r['zip'] = r['_zip'] if r['_zip'] and re.fullmatch(r'\d{5}', r['_zip']) else None
    return rows


# Berks -------------------------------------------------------------------------------------------------------
BER = 'https://services3.arcgis.com/dGYe1jDYrTw1wwpc/arcgis/rest/services/Berks_Assessment_CAMA_Master_File/FeatureServer/14'
BER_P = 'https://services3.arcgis.com/dGYe1jDYrTw1wwpc/arcgis/rest/services/Berks_County_Parcels_V2/FeatureServer/2'
BER_R = 'https://services3.arcgis.com/dGYe1jDYrTw1wwpc/arcgis/rest/services/Berks_Assessment_CAMA_Residential_File/FeatureServer/15'


def berks_fetch(ctx):
    F = ['auto', 'PARID', 'OWN1', 'OWN2', 'MAILING', 'ZIP1', 'CLASS', 'PRICE', 'SALEDT', 'ADRNO', 'ADRADD', 'ADRDIR', 'ADRSTR', 'ADRSUF', 'LUC']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(BER, f"SALEDT >= DATE '{ctx['since']}' AND SALEDT <= DATE '{ctx['tomorrow']}'", F, 'auto', need=F):
        d, pid = ms_date(a.get('SALEDT')), clean(a.get('PARID'))
        if not d or not pid:
            continue
        cl, luc = clean(a.get('CLASS')), clean(a.get('LUC'))
        code = f'CL={cl};LUC={luc}'
        fb = {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'F': 'land', 'A': 'land', 'E': 'other'}.get((cl or ' ')[0], 'other')
        addr = clean(' '.join(str(a.get(k) or '') for k in ('ADRNO', 'ADRADD', 'ADRDIR', 'ADRSTR', 'ADRSUF')))
        k = street_key(addr)
        out.append(_pa_row(pid, d, 'BERK', addr=addr, buyer=clean(a.get('OWN1')), price=to_int(a.get('PRICE')), use_code_raw=code,
                           use_type=use_type_for(use, code, fb), _pid=pid,
                           _zip=(clean(a.get('ZIP1')) or '')[:5] if k and k == street_key(a.get('MAILING')) else None))
    return out


def berks_enrich(rows, ctx):
    muni = ctx['learned'].table(lambda r: (r.get('muni') or '').upper(), 'muni')
    by_prefix = ctx['learned'].table(lambda r: r['id'][5:7], 'muni')
    pids = [r['_pid'] for r in rows]
    # The parcel layer has no index on PROPID, so a date-window scan is far quicker than asking for ids. Stragglers are asked by id.
    par, off = {}, 0
    while True:
        j = arcgis(BER_P, {'where': f"DEED_DATE >= DATE '{shift(ctx['since'], -90)}'", 'outFields': 'PROPID,MUNICIPALNAME', 'returnGeometry': 'false',
                           'returnCentroid': 'true', 'outSR': '4326', 'orderByFields': 'OBJECTID', 'resultOffset': off, 'resultRecordCount': 2000}, timeout=120)
        fs = j.get('features') or []
        for f in fs:
            c = f.get('centroid') or {}
            par[clean(f['attributes']['PROPID'])] = (f['attributes'], (c.get('y'), c.get('x')) if c else None)
        if not fs or not j.get('exceededTransferLimit'):
            break
        off += len(fs)
    missing = sorted({p for p in pids if p not in par and p[:14] not in par} | {p[:14] for p in pids if p not in par and p[:14] not in par})[:200]
    if missing:
        try:
            par.update({clean(a['PROPID']): (a, pt) for a, pt in arcgis_in(BER_P, 'PROPID', missing, ['PROPID', 'MUNICIPALNAME'], batch=200, centroid=True)})
        except SourceError as e:
            log(f'    Berks parcel lookup by id skipped ({e})')
    res = {}
    try:
        for a, _ in arcgis_in(BER_R, 'PARID', pids, ['PARID', 'CARD', 'YRBLT', 'SFLA', 'BEDROOMS'], batch=200):
            if clean(a['PARID']) not in res or to_int(a.get('CARD')) == 1:
                res[clean(a['PARID'])] = a
    except SourceError as e:
        log(f'    Berks residential detail skipped ({e}); new rows keep blank year built, size and bedrooms')
    for r in rows:
        a, pt = par.get(r['_pid']) or par.get(r['_pid'][:14]) or ({}, None)      # a unit (C38, T42) sits on its parent parcel
        r['lat'], r['lon'] = (r5(pt[0]), r5(pt[1])) if pt and pt[0] is not None else (None, None)
        r['zip'] = r['_zip'] if r['_zip'] and re.fullmatch(r'\d{5}', r['_zip']) else None
        r['geo_precision'] = 'parcel_centroid' if r['lat'] is not None else 'zip' if r['zip'] else 'none'
        mn = clean(a.get('MUNICIPALNAME'))
        # A condo unit or a new lot can be missing from the parcel layer. The first two digits of the parcel id are the
        # municipality, and every prefix held maps to one town, so the town is taken from there.
        r['muni'] = (muni.get(mn.upper()) or mn.title()) if mn else by_prefix.get(r['_pid'][:2])
        d = res.get(r['_pid']) or {}
        r['year_built'], r['sqft'], r['beds'] = to_int(d.get('YRBLT'), 1), to_int(d.get('SFLA'), 1), to_int(d.get('BEDROOMS'), 1)
    return rows


# Lebanon -----------------------------------------------------------------------------------------------------
LEB = 'https://utility.arcgis.com/usrsvcs/servers/7072ca11c43c43feb1ab453851e847b9/rest/services/LandRecords/TaxParcels/MapServer/0'


def lebanon_fetch(ctx):
    F = ['OBJECTID_1', 'MAP_NUMBER', 'OWNER', 'SECOND_LIS', 'SITUS_ADDR', 'SITUS_ZIP', 'MUNICIPAL1', 'LIVING_ARE', 'SALE_DATE', 'SALE_PRICE', 'YEAR_BUILT', 'PROPERTY_T', 'LU_CODE']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(LEB, f"SALE_DATE >= DATE '{ctx['since']}'", F, 'OBJECTID_1', need=F):
        d, pid = ms_date(a.get('SALE_DATE')), clean(a.get('MAP_NUMBER'))
        if not d or not pid:
            continue
        pt, lu = clean(a.get('PROPERTY_T')), to_int(a.get('LU_CODE'))
        code = f'PT={pt};LU={lu or 0}'
        fb = {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'A': 'land', 'F': 'land', 'V': 'land', 'E': 'other'}.get((pt or ' ')[0])
        o1, o2 = clean(a.get('OWNER')), clean(a.get('SECOND_LIS'))
        out.append(_pa_row(pid, d, 'LEBA', addr=clean(a.get('SITUS_ADDR')), buyer=f'{o1} & {o2}' if o1 and o2 else o1, price=to_int(a.get('SALE_PRICE')),
                           sqft=to_int(a.get('LIVING_ARE'), 1), year_built=to_int(a.get('YEAR_BUILT'), 1), use_code_raw=code,
                           use_type=use_type_for(use, code, fb), _oid=a['OBJECTID_1'], _zip=str(to_int(a.get('SITUS_ZIP')) or ''), _muni=clean(a.get('MUNICIPAL1'))))
    return out


def _named_muni(rows, ctx):
    muni = ctx['learned'].table(lambda r: (r.get('muni') or '').upper(), 'muni')
    for r in rows:
        mn = r.get('_muni')
        r['muni'] = (muni.get(mn.upper()) or mn.title()) if mn else None


def lebanon_enrich(rows, ctx):
    _set_geo(rows, dict(_local_geo(LEB, 'OBJECTID_1', rows)))
    _named_muni(rows, ctx)
    by_prefix = ctx['learned'].table(lambda r: r['id'][5:7], 'muni')     # the map number starts with the municipality code
    for r in rows:
        r['muni'] = r['muni'] or by_prefix.get(r['id'][5:7])
        r['zip'] = r['_zip'].zfill(5) if r['_zip'] else None
    return rows


# Franklin ----------------------------------------------------------------------------------------------------
FRA = 'https://fcgis.franklincountypa.gov/fcgishosting/rest/services/TaxRecords/FC_TaxRecords/MapServer/0'


def franklin_fetch(ctx):
    F = ['OBJECTID', 'Name', 'REM_PRCL_LOCN_ZIP', 'TAX_DIST', 'LAND_USE_CODE', 'LAND_USE_DESC', 'YEAR_BUILT', 'CNS_AREA_LIVING', 'TOTAL_NUMBER_OF_BEDROOMS',
         'SLH_PRICE', 'PREVIOUS_OWNER_1', 'SALE_DATE', 'FULL_OWNER', 'FULL_SITUS_ADDR', 'COMM_BLDG_TOTAL_SQFT']
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(FRA, f"SALE_DATE >= DATE '{ctx['since']}' AND SALE_DATE <= DATE '{ctx['tomorrow']}'", F, 'OBJECTID', need=F):
        d, pid = ms_date(a.get('SALE_DATE')), clean(a.get('Name'))
        if not d or not pid:
            continue
        lu, desc = to_int(a.get('LAND_USE_CODE')), clean(a.get('LAND_USE_DESC'))
        code = f'LU={lu};{desc}'
        u = (desc or '').upper()
        fb = 'land' if 'VACANT' in u or 'LAND' in u else 'residential' if 'RESID' in u else 'commercial' if 'COMM' in u else 'industrial' if 'INDUST' in u else 'other'
        seller = clean(a.get('PREVIOUS_OWNER_1'))
        out.append(_pa_row(pid, d, 'FRAN', addr=clean(a.get('FULL_SITUS_ADDR')), buyer=clean(a.get('FULL_OWNER')), seller=seller, builder_flag=builder_flag(seller),
                           price=to_int(a.get('SLH_PRICE')), beds=to_int(a.get('TOTAL_NUMBER_OF_BEDROOMS'), 1), sqft=to_int(a.get('CNS_AREA_LIVING'), 1) or to_int(a.get('COMM_BLDG_TOTAL_SQFT'), 1),
                           year_built=to_int(a.get('YEAR_BUILT'), 1), use_code_raw=code, use_type=use_type_for(use, code, fb), _oid=a['OBJECTID'],
                           _zip=(clean(a.get('REM_PRCL_LOCN_ZIP')) or '')[:5] or None))
    return out


def franklin_enrich(rows, ctx):
    muni = ctx['learned'].table(lambda r: r['id'][5:7], 'muni')
    _set_geo(rows, dict(_local_geo(FRA, 'OBJECTID', rows)))
    for r in rows:
        r['muni'], r['zip'] = muni.get(r['id'][5:7]), r['_zip']
    return rows


# Adams -------------------------------------------------------------------------------------------------------
ADA = 'https://mapping.adamscountypa.gov/arcgis/rest/services/AGOL/Parcel_Owners/MapServer/0'


def adams_fetch(ctx):
    F = ['OBJECTID', 'Parcel_ID', 'SHORT_NAME', 'COMBINED_SITUS', 'DISTRICT_NAME', 'PROPERTY_TYPE', 'SALE_DATE', 'SALE_PRICE']
    where = ' OR '.join(f"SALE_DATE LIKE '{m:02d}/%/{y}'" for y, m in months_between(ctx['since'], ctx['today']))
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    out = []
    for a in arcgis_all(ADA, where, F, 'OBJECTID', need=F):
        m = re.fullmatch(r'(\d\d)/(\d\d)/(\d{4})', clean(a.get('SALE_DATE')) or '')
        pid = clean(a.get('Parcel_ID'))
        if not m or not pid:
            continue
        pt = clean(a.get('PROPERTY_TYPE'))
        code = f'PT={pt}' if pt else None
        fb = {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'A': 'land', 'F': 'land', 'V': 'land', 'E': 'other'}.get((pt or ' ')[0], 'other')
        out.append(_pa_row(pid, f'{m.group(3)}-{m.group(1)}-{m.group(2)}', 'ADAM', addr=clean(a.get('COMBINED_SITUS')), buyer=clean(a.get('SHORT_NAME')),
                           price=to_int(a.get('SALE_PRICE')), use_code_raw=code, use_type=use_type_for(use, code, fb), _oid=a['OBJECTID'],
                           _muni=clean(a.get('DISTRICT_NAME'))))
    return out


def adams_enrich(rows, ctx):
    _set_geo(rows, dict(_local_geo(ADA, 'OBJECTID', rows)))
    _named_muni(rows, ctx)
    for r in rows:
        r['zip'] = None
    return rows


# Perry -------------------------------------------------------------------------------------------------------
PER = 'https://services.arcgis.com/b1rOZp0BNgsXJwyv/arcgis/rest/services/Perry_County_Web_Map_WFL1/FeatureServer/2'
PER_F = 'https://services.arcgis.com/b1rOZp0BNgsXJwyv/arcgis/rest/services/Perry_Field_Updated_gdb/FeatureServer/3'


def perry_fetch(ctx):
    F = ['OBJECTID', 'PIN', 'SLH_DEEDED', 'REM_PRCL_L', 'SLH_SALE_D', 'SLH_PRICE', 'REM_USRFLD']
    out = []
    for a in arcgis_all(PER, f"SLH_SALE_D >= DATE '{ctx['since']}'", F, 'OBJECTID', need=F):
        d, pid = ms_date(a.get('SLH_SALE_D')), clean(a.get('PIN'))
        if not d or not pid:
            continue
        out.append(_pa_row(pid, d, 'PERR', addr=clean(a.get('REM_PRCL_L')), buyer=clean(a.get('SLH_DEEDED')), price=to_int(a.get('SLH_PRICE')),
                           _oid=a['OBJECTID'], _pid=pid, _muni=clean(a.get('REM_USRFLD'))))
    return out


def perry_enrich(rows, ctx):
    use = ctx['learned'].table(lambda r: r['use_code_raw'], 'use_type')
    pts = {a['OBJECTID']: pt for a, pt in arcgis_in(PER, 'OBJECTID', [r['_oid'] for r in rows], ['OBJECTID'], batch=200, centroid=True, numeric=True)}
    _set_geo(rows, pts)
    _named_muni(rows, ctx)
    field = {}
    try:
        for a, _ in arcgis_in(PER_F, 'PIN', [r['_pid'] for r in rows], ['PIN', 'PROPERTY_T', 'LAND_USE_C', 'YEAR_BUILT', 'TOT_LIV_A'], batch=150):
            field[clean(a['PIN'])] = a
    except SourceError as e:
        log(f'    Perry field detail skipped ({e}); new rows keep blank use, year built and size')
    for r in rows:
        a = field.get(r['_pid']) or {}
        pt, lu = clean(a.get('PROPERTY_T')), to_int(a.get('LAND_USE_C'))
        code = (f'PT={pt}' + (f';LU={lu}' if lu is not None else '')) if pt else None
        fb = {'R': 'residential', 'C': 'commercial', 'I': 'industrial', 'A': 'land', 'F': 'land', 'V': 'land', 'E': 'other'}.get((pt or ' ')[0])
        r['use_code_raw'], r['use_type'] = code, use_type_for(use, code, fb)
        r['year_built'], r['sqft'], r['zip'] = to_int(a.get('YEAR_BUILT'), 1), to_int(a.get('TOT_LIV_A'), 1), None
    return rows


# key, file, counties, fetch, enrich, fields compared on rows already held (the rest come from joins and stay as held)
CORE_PA = ['addr', 'buyer', 'seller', 'price', 'use_code_raw', 'use_type', 'sqft', 'year_built', 'beds']
SOURCES = [
    ('nj', 'pp_sales_nj', ['Atlantic', 'Burlington', 'Monmouth', 'Ocean'], nj_fetch, nj_enrich,
     ['addr', 'arms_length', 'block_lot', 'nu_code', 'price', 'sale_date', 'sqft', 'use_code_raw', 'use_type', 'year_built']),
    ('lancaster', 'pp_sales_pa_a', ['Lancaster'], lancaster_fetch, lancaster_enrich, ['addr', 'buyer', 'price', 'use_code_raw', 'use_type', 'deed_ref']),
    ('york', 'pp_sales_pa_a', ['York'], york_fetch, york_enrich, CORE_PA[:-1] + ['deed_ref']),
    ('cumberland', 'pp_sales_pa_a', ['Cumberland'], cumberland_fetch, cumberland_enrich, CORE_PA + ['deed_ref', 'parcel_id']),
    ('montgomery', 'pp_sales_pa_b', ['Montgomery'], montgomery_fetch, montgomery_enrich, CORE_PA),
    ('chester', 'pp_sales_pa_b', ['Chester'], chester_fetch, chester_enrich, ['addr', 'buyer', 'price', 'use_code_raw', 'use_type']),
    ('berks', 'pp_sales_pa_b', ['Berks'], berks_fetch, berks_enrich, ['addr', 'buyer', 'price', 'use_code_raw', 'use_type']),
    ('lebanon', 'pp_sales_pa_b', ['Lebanon'], lebanon_fetch, lebanon_enrich, ['addr', 'buyer', 'price', 'use_code_raw', 'use_type', 'sqft', 'year_built']),
    ('franklin', 'pp_sales_pa_b', ['Franklin'], franklin_fetch, franklin_enrich, CORE_PA),
    ('adams', 'pp_sales_pa_b', ['Adams'], adams_fetch, adams_enrich, ['addr', 'buyer', 'price', 'use_code_raw', 'use_type']),
    ('perry', 'pp_sales_pa_b', ['Perry'], perry_fetch, perry_enrich, ['addr', 'buyer', 'price']),
]
FILES = ['pp_sales_nj', 'pp_sales_pa_a', 'pp_sales_pa_b']


# ───────────────────────── columnar files ─────────────────────────

def decode(j):
    cols, enums = j['cols'], j.get('enums') or {}
    rows = []
    for r in j['rows']:
        o = {}
        for i, c in enumerate(cols):
            v = r[i]
            if v is not None and enums.get(c):
                v = enums[c][v]
            o[c] = v
        rows.append(o)
    return rows


def encode(meta, cols, rows):
    """Same layout as scripts/compact_sales.py: text columns with few distinct values become sorted enum lists."""
    enums, n = {}, len(rows)
    for c in cols:
        vals = [r.get(c) for r in rows]
        if all(isinstance(v, str) or v is None for v in vals):
            card = len(set(vals))
            if card <= 5000 and card < n * 0.5:
                order = sorted(set(v for v in vals if v is not None))
                enums[c] = order
    idx = {c: {v: i for i, v in enumerate(order)} for c, order in enums.items()}
    out = []
    for r in rows:
        row = []
        for c in cols:
            v = r.get(c)
            if c in idx:
                v = idx[c][v] if v is not None else None
            elif isinstance(v, float) and c in ('lat', 'lon'):
                v = round(v, 5)
            row.append(v)
        out.append(row)
    return json.dumps({'format': 'columnar', 'meta': meta, 'cols': cols, 'enums': enums, 'rows': out}, separators=(',', ':'))


def row_order(r):
    return r['id']


def sort_rows(rows):
    rows.sort(key=row_order)
    rows.sort(key=lambda r: str(r.get('sale_date') or ''), reverse=True)     # newest first, id breaks ties (sort is stable)
    return rows


def window_cutoff(today):
    y, m = int(today[:4]), int(today[5:7])
    m -= WINDOW_MONTHS
    while m <= 0:
        y, m = y - 1, m + 12
    return f'{y:04d}-{m:02d}-01'


def nth_newest(dates, n=10):
    """The newest sale date held, ignoring a handful of stray late dates (the n-th newest row)."""
    ds = sorted(dates, reverse=True)
    return ds[min(n, len(ds)) - 1] if ds else None


def shift(date, days):
    return (datetime.date.fromisoformat(date) + datetime.timedelta(days=days)).isoformat()


def refresh_coverage(meta, rows, today, changed_counties):
    """Per-source counts and date ranges, recomputed from the rows that are kept."""
    by = collections.defaultdict(list)
    for r in rows:
        by[r.get('county')].append(r)
    for c in meta.get('coverage') or []:
        rs = by.get(c.get('county'), [])
        ds = sorted(r['sale_date'] for r in rs if r.get('sale_date'))
        c['date_from'], c['date_to'], c['count'] = (ds[0] if ds else None), (ds[-1] if ds else None), len(rs)
        if 'monthly_counts' in c:
            c['monthly_counts'] = dict(sorted(collections.Counter(d[:7] for d in ds).items()))
        homes = sum(1 for r in rs if r.get('use_type') == 'residential')
        geo = sum(1 for r in rs if r.get('lat') is not None)
        for k, v in (('arms_length_count', sum(1 for r in rs if r.get('arms_length') is True)), ('residential_count', homes), ('count_residential', homes),
                     ('geocoded_count', geo), ('count_geocoded', geo), ('zip_count', sum(1 for r in rs if r.get('zip'))),
                     ('count_price_gt_1000', sum(1 for r in rs if (r.get('price') or 0) > 1000)),
                     ('nominal_price_le_100', sum(1 for r in rs if r.get('price') is not None and r['price'] <= 100))):
            if k in c:
                c[k] = v
        if c.get('state') == 'NJ':
            # Name every state file that supplied this county's rows, and link the newest one.
            files = sorted({m.group(0) for r in rs for m in [re.search(r'YTDSR1A\d{4}', r.get('source') or '')] if m})
            urls = sorted({r['source_url'] for r in rs if r.get('source_url')})
            if files and urls and re.search(r'\(YTDSR1A[^)]*\)', c.get('source') or ''):
                c['source'] = re.sub(r'sales files? \(YTDSR1A[^)]*\)', f"sales file{'s' if len(files) > 1 else ''} ({', '.join(files)})", c['source'])
                c['source_url'] = urls[-1]
        if c.get('county') in changed_counties or 'retrieved' not in c:
            c['retrieved'] = today if c.get('county') in changed_counties else max((r.get('retrieved') or '' for r in rs), default='') or None


FIRST_PULL = '2026-09-24'
# First-pull notes that quote a date, a lag or a count. They stay, marked as describing the first pull.
_DATED_NOTE = re.compile(r'Source lag|latest sale|Franklin window|Window limited|File is ~|layer last edited|~?\b\d{1,3}(?:,\d{3})* (?:rows|records|Berks)\b')
_ONCE = re.compile(r'a parcel (?:that )?sold twice in the window appears once \(latest sale\)')
_ONCE_NOW = ('each pull shows only the latest sale of a parcel; an earlier sale picked up by a previous pull is kept, '
             'so a parcel that sold again can have more than one row')


def refresh_notes(meta, today, cutoff):
    """Bring the file notes in line with refreshed rows. Runs only when rows changed, and gives the same text every time."""
    ref = meta.setdefault('refresh', {})
    ref.setdefault('first_refresh', today)
    mark = f'First pull ({FIRST_PULL}): '
    own = f"Refreshed by {SCRIPT} since {ref['first_refresh']}. meta.coverage holds the current counts and date ranges. " \
          f"meta.method and the notes marked 'First pull ({FIRST_PULL})' describe the first pull only. " \
          f'Sales older than {WINDOW_MONTHS} months are dropped at the start of each month.'
    out = []
    for c in meta.get('caveats') or []:
        if isinstance(c, str) and not c.startswith(('QA ', 'First pull', 'Refreshed by ', FROZEN_CAVEAT[:30])):
            if _ONCE.search(c) or _ONCE_NOW in c:
                c = _ONCE.sub(_ONCE_NOW, c)                 # brought up to date, so not a first-pull note
            elif _DATED_NOTE.search(c):
                c = mark + c
        out.append(c)
    if own not in out:
        out.append(own)
    meta['caveats'] = out
    if 'as_of' in meta:
        meta['as_of'] = today
    w = meta.get('window_requested')
    if isinstance(w, dict) and 'to' in w:
        w['to'] = today
        if w.get('from'):
            w['from'] = max(str(w['from']), cutoff)


def same_error(a, b):
    """Two failure messages are the same failure when they differ only in numbers (counts, dates, seconds)."""
    return a is not None and b is not None and re.sub(r'\d+', '#', a) == re.sub(r'\d+', '#', b)


def _dup_key(key, r):
    if key == 'nj':                     # district, block and lot, deed date, price
        return (r['id'][3:7], r.get('block_lot'), r['sale_date'], r.get('price'))
    return (r['id'][:-11], r.get('price'), r.get('buyer'))      # parcel, price, buyer


def drop_superseded(key, rows):
    """NJ only: the same sale can sit in two yearly files under two deed references. The newer file's record wins.
    Two records for one lot, date and price inside one file are left alone (they are separate deeds)."""
    if key != 'nj':
        return rows
    newest = {}
    for r in rows:
        k = _dup_key(key, r)
        newest[k] = max(newest.get(k, ''), r.get('source') or '')
    return [r for r in rows if (r.get('source') or '') == newest[_dup_key(key, r)]]


def superseded_held(key, fresh, held_rows):
    """ids (python object ids) of held rows that a new row replaces under a new record id."""
    by = collections.defaultdict(list)
    for h in held_rows:
        by[_dup_key(key, h)].append(h)
    gone = set()
    for r in fresh:
        if r.get('price') is None:
            continue
        for h in by.get(_dup_key(key, r), []):
            if key == 'nj':
                if (h.get('source') or '') < (r.get('source') or ''):                 # the held record is from an older yearly file
                    gone.add(id(h))
            elif r.get('buyer') and h['sale_date'] < r['sale_date'] <= shift(h['sale_date'], OVERLAP_DAYS):
                gone.add(id(h))
    return gone


# ───────────────────────── run ─────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description='Refresh the Punctual Pros home-sales files (data/sales/pp_sales_*.json).')
    ap.add_argument('--dry-run', action='store_true', help='fetch and report per-source counts; write nothing')
    ap.add_argument('--only', action='append', help='source to run (repeatable): ' + ', '.join(s[0] for s in SOURCES))
    ap.add_argument('--diff', action='store_true', help='list which fields changed on rows already held')
    ap.add_argument('--force', action='store_true', help='re-read the NJ file even when it has not been modified since the last run')
    ap.add_argument('--today', help=argparse.SUPPRESS)
    ap.add_argument('--dir', default=SALES, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    only = [o.lower() for o in a.only or []]
    bad = [o for o in only if o not in [s[0] for s in SOURCES]]
    if bad:
        ap.error('unknown source: ' + ', '.join(bad))
    today = a.today or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    cutoff = window_cutoff(today)
    t0 = time.time()
    DEADLINE[0] = t0 + TIME_BUDGET

    data = {}
    for f in FILES:
        with open(os.path.join(a.dir, f + '.json'), encoding='utf-8') as fh:
            text = fh.read()
        j = json.loads(text)
        if j.get('format') != 'columnar':
            raise SystemExit(f'{f}: expected the columnar format')
        data[f] = {'text': text, 'meta': j['meta'], 'cols': j['cols'], 'rows': decode(j), 'changed': set(), 'touched': False}

    table, failures, attempted = [], {}, 0
    for key, f, counties, fetch, enrich, core in SOURCES:
        if only and key not in only:
            continue
        attempted += 1
        D = data[f]
        held = {c: {r['id']: r for r in D['rows'] if r.get('county') == c} for c in counties}
        ctx = {'today': today, 'tomorrow': shift(today, 1), 'meta': D['meta'], 'learned': Learned([r for r in D['rows'] if r.get('county') in counties]),
               'notes': [], 'force': a.force, 'sr1a_seen': {}, 'floor': {}}
        newest = nth_newest([r['sale_date'] for c in counties for r in held[c].values()])
        ctx['since'] = max(shift(newest, -OVERLAP_DAYS), cutoff) if newest else cutoff
        for c in counties:
            ds = [r['sale_date'] for r in held[c].values()]
            ctx['floor'][c] = max(min(ds), cutoff) if ds else cutoff
        t1 = time.time()
        log(f'{key}: sales from {ctx["since"] if key != "nj" else min(ctx["floor"].values())} to {today}')
        try:
            if time.time() > DEADLINE[0]:
                raise SourceError('time budget exhausted before this source started')
            DEADLINE[1] = time.time() + SOURCE_BUDGET
            got = fetch(ctx)
            for n in ctx['notes']:
                log('    ' + n)
            if got == 'unchanged':
                for c in counties:
                    table.append({'source': c, 'state': held[c] and next(iter(held[c].values()))['state'] or '', 'held': len(held[c]), 'fetched': 0, 'new': 0,
                                  'replaced': 0, 'status': 'not modified', 'secs': time.time() - t1})
                continue
            by_county = got if isinstance(got, dict) else {counties[0]: got}
            staged = []
            for c in counties:
                since = ctx['floor'][c] if key == 'nj' else ctx['since']
                rows, seen = [], set()
                for r in by_county.get(c, []):
                    if r['id'] in seen or not (since <= r['sale_date'] <= today):
                        continue
                    if r.get('price') is not None and r['price'] < MIN_PRICE:
                        continue
                    seen.add(r['id'])
                    r['county'] = c
                    rows.append(r)
                rows = drop_superseded(key, rows)
                held_overlap = sum(1 for r in held[c].values() if r['sale_date'] >= since)
                if not rows and not held_overlap:
                    # Nothing is held inside the window and nothing was published for it: not a failure. Rows held from
                    # before the window (a source that stopped publishing, like Franklin) then leave with the window.
                    staged.append((c, rows, set(), []))
                    continue
                if not rows:
                    raise SourceError(f'{c}: zero rows returned')   # no dates here: the note must read the same every night
                if len(rows) < 0.5 * held_overlap:
                    raise SourceError(f'{c}: {len(rows):,} rows returned for the overlap window but {held_overlap:,} are held')
                fresh = [r for r in rows if r['id'] not in held[c]]
                if fresh:
                    fresh = enrich(fresh, ctx)
                staged.append((c, rows, {r['id'] for r in fresh}, fresh))
            # Nothing above raised: apply.
            for c, rows, fresh_ids, fresh in staged:
                replaced, why = 0, collections.Counter()
                examples = collections.defaultdict(list)
                for r in rows:
                    h = held[c].get(r['id'])
                    if h is None:
                        continue
                    diff = [k for k in core if k in D['cols'] and r.get(k) != h.get(k)
                            and not (key == 'nj' and k in ('year_built', 'addr') and r.get(k) is None)]
                    if key != 'nj' and 'use_type' in diff and 'use_code_raw' not in diff:
                        diff.remove('use_type')              # the type follows the code; an unchanged code keeps its held type
                    if not diff:
                        continue
                    replaced += 1
                    for k in diff:
                        why[k] += 1
                        if len(examples[k]) < 3:
                            examples[k].append(f'{r["id"]}: {h.get(k)!r} -> {r.get(k)!r}')
                    if True:
                        for k in diff:
                            h[k] = r.get(k)
                        if 'seller' in diff and 'builder_flag' in D['cols']:
                            h['builder_flag'] = r.get('builder_flag')
                        if key == 'nj':
                            h['new_construction'] = bool(h['use_code_raw'].split('/')[0] == 'NJ class 2' and h.get('year_built') is not None
                                                         and h['year_built'] >= int(h['sale_date'][:4]) - 1)
                        h['retrieved'] = today
                proto = next(iter(held[c].values()), {})
                # A deed recorded again under a new book and page (NJ), or a sale the county re-dated (PA), comes back under
                # a new id. The held row it replaces is dropped so the sale is not listed twice.
                gone = superseded_held(key, fresh, held[c].values())
                if gone:
                    D['rows'] = [x for x in D['rows'] if id(x) not in gone]
                    why['re-recorded or re-dated'] += len(gone)
                    replaced += len(gone)
                for r in fresh:
                    o = {col: r.get(col) for col in D['cols']}
                    o['county'], o['retrieved'] = c, today
                    if key != 'nj':
                        o['source'], o['source_url'] = proto.get('source'), proto.get('source_url')
                    D['rows'].append(o)
                if fresh or replaced:
                    D['changed'].add(c)
                table.append({'source': c, 'state': proto.get('state', ''), 'held': len(held[c]), 'fetched': len(rows), 'new': len(fresh) - len(gone), 'replaced': replaced,
                              'status': 'ok' if rows else 'ok (nothing published in the window)', 'secs': time.time() - t1, 'why': why, 'examples': examples,
                              'common': sum(1 for r in rows if r['id'] in held[c])})
            if ctx['sr1a_seen']:
                ref = D['meta'].setdefault('refresh', {})
                if ref.get('sr1a_files') != ctx['sr1a_seen']:
                    ref['sr1a_files'] = ctx['sr1a_seen']
                    D['touched'] = True
        except Exception as e:                        # this source only; its held rows stay as they are
            msg = str(e) if isinstance(e, SourceError) else f'{type(e).__name__}: {e}'
            log(f'  FAILED {key}: {msg}')
            for c in counties:
                failures[(f, c)] = msg[:300]
                table.append({'source': c, 'state': '', 'held': len(held[c]), 'fetched': 0, 'new': 0, 'replaced': 0, 'status': 'FAILED: ' + msg[:90], 'secs': time.time() - t1})

    # Rolling window, frozen sources, failure notes, then write what changed.
    ran = {(f, c) for key, f, counties, *_ in SOURCES if not only or key in only for c in counties}
    written = []
    for f in FILES:
        D, meta = data[f], data[f]['meta']
        frozen = {c for (ff, c) in FROZEN if ff == f}
        before = len(D['rows'])
        # The window moves only for a source that answered this run. A source that failed, or was not asked (--only),
        # keeps every row it holds, old ones included, until the next run in which it answers.
        stay = frozen | {c for (ff, c) in failures if ff == f} | {c for key, ff, counties, *_ in SOURCES if ff == f for c in counties if (f, c) not in ran}
        dropped = collections.Counter(r.get('county') for r in D['rows'] if r.get('county') not in stay and str(r.get('sale_date') or '9') < cutoff)
        D['rows'] = [r for r in D['rows'] if r.get('county') in stay or str(r.get('sale_date') or '9') >= cutoff]
        for t in table:
            if (f, t['source']) in ran and t['source'] in dropped:
                t['dropped'] = dropped[t['source']]
        for c in frozen:
            table.append({'source': c, 'state': 'PA', 'held': sum(1 for r in D['rows'] if r.get('county') == c), 'fetched': 0, 'new': 0, 'replaced': 0,
                          'status': 'frozen snapshot (not refreshed)', 'secs': 0}) if not only else None
        rows_changed = bool(D['changed']) or len(D['rows']) != before
        # meta.failed_sources: keep the notes from the first pull; refresh notes are replaced each run.
        old = meta.get('failed_sources') or []
        keep = [x for x in old if not (isinstance(x, dict) and x.get('refresh'))]
        prev = {x.get('county'): x for x in old if isinstance(x, dict) and x.get('refresh')}
        notes = []
        for (ff, c), msg in sorted(failures.items()):
            if ff == f:
                p = prev.get(c)
                notes.append(p if p and same_error(p.get('error'), msg) else {'source': f'{c} County automatic refresh', 'county': c, 'error': msg,
                                                                    'tried': SCRIPT, 'date': today, 'refresh': True})
        notes += [p for c, p in sorted(prev.items()) if (f, c) not in ran and (f, c) not in failures]       # not run this time: keep the note
        if keep + notes != old:
            meta['failed_sources'] = keep + notes
            D['touched'] = True
        ref = meta.setdefault('refresh', {})
        want = {'script': SCRIPT, 'window_months': WINDOW_MONTHS, 'overlap_days': OVERLAP_DAYS}
        fz = [v for (ff, c), v in sorted(FROZEN.items()) if ff == f]
        if fz:
            want['frozen'] = fz
        if any(ref.get(k) != v for k, v in want.items()):
            ref.update(want)
            D['touched'] = True
        if fz and FROZEN_CAVEAT not in (meta.get('caveats') or []):
            meta.setdefault('caveats', []).append(FROZEN_CAVEAT)
            D['touched'] = True
        for c in meta.get('coverage') or []:
            if (f, c.get('county')) in FROZEN and c.get('frozen') != FROZEN[(f, c['county'])]['frozen_at']:
                c['frozen'] = FROZEN[(f, c['county'])]['frozen_at']
                D['touched'] = True
        if not rows_changed and not D['touched']:
            continue
        if rows_changed:
            sort_rows(D['rows'])
            meta['generated'] = today
            meta['item_count'] = len(D['rows'])
            refresh_coverage(meta, D['rows'], today, D['changed'])
            refresh_notes(meta, today, cutoff)
        text = encode(meta, D['cols'], D['rows'])
        if text == D['text']:
            continue
        written.append(f)
        if not a.dry_run:
            tmp = os.path.join(a.dir, f + '.json.tmp')
            with open(tmp, 'w', encoding='utf-8') as fh:
                fh.write(text)
            os.replace(tmp, os.path.join(a.dir, f + '.json'))

    # Report.
    print(f'Punctual Pros home sales refresh  {today}  window from {cutoff}  ({"dry run, nothing written" if a.dry_run else "live"})')
    print(f'{"source":12s} {"held":>7s} {"fetched":>8s} {"new":>6s} {"replaced":>8s} {"dropped":>8s} {"after":>7s} {"secs":>5s}  status')
    for t in table:
        after = t['held'] + t['new'] - t.get('dropped', 0)
        print(f'{t["source"]:12s} {t["held"]:7,d} {t["fetched"]:8,d} {t["new"]:6,d} {t["replaced"]:8,d} {t.get("dropped", 0):8,d} {after:7,d} {t["secs"]:5.0f}  {t["status"]}')
    if a.diff:
        print('\nRows already held whose source fields changed (rate = replaced / ids returned that are held):')
        for t in table:
            if t.get('common'):
                print(f'  {t["source"]}: {t["replaced"]:,} of {t["common"]:,} ({100 * t["replaced"] / t["common"]:.1f}%)  ' + ', '.join(f'{k} {n}' for k, n in t['why'].most_common()))
                for k, n in t['why'].most_common(4):
                    for e in t['examples'][k][:2]:
                        print(f'      {k}  {e}')
    print(f'files {"that would change" if a.dry_run else "written"}: {", ".join(written) or "none"}   total {time.time() - t0:.0f}s')
    failed_sources = {k for k, f, counties, *_ in SOURCES if any((f, c) in failures for c in counties)}
    if attempted and len(failed_sources) == attempted:
        print('every source failed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
