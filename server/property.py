"""
Two assistant tools for BSP Desk, built only on public records of the Punctual Pros service area.

  new_homeowners   who should get the new-homeowner promotion: recorded market home sales for an
                   area and period, ranked by likely need (oldest homes first).
  property_brief   what the records say about one address, what to check on arrival, and offer leads.

Data: knowledge/homes.sqlite, built by scripts/build_homes_db.py from the portal's home-sales files.
It holds no buyer or seller names, so neither tool can output one. For New Jersey addresses
property_brief also asks two public services, with short timeouts and a clean fallback:
  - NJOGIS statewide parcels and tax list (ArcGIS feature service), and
  - NJ Construction Permit Data (data.nj.gov, dataset w9se-dmra), keyed by municipality code + block + lot.
Pennsylvania has no public permit feed, so a Pennsylvania brief uses the local record only.

Public interface:
  ready() -> bool
  info() -> dict                                  (build time, row counts, coverage)
  tool_definitions() -> [dict, dict]              (Anthropic tool schemas)
  run_new_homeowners(args) -> (text, sources)
  run_property_brief(args) -> (text, sources)
sources is a list of {title, url, publisher, date, kind}.

Import note: this file is named property.py. Use `import property as homes` (or importlib), because a
bare `import property` rebinds the built-in name `property` in the importing module.

Standard library plus httpx (imported only when a live lookup runs). Author: Syed Rahman.
"""

import datetime
import difflib
import json
import math
import os
import re
import sqlite3
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor

DB_PATH = os.environ.get('HOMES_DB_PATH') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'knowledge', 'homes.sqlite')
MAX_CHARS = 6000
DEFAULT_LIMIT, MAX_LIMIT = 25, 100

PARCELS_URL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0'
# Only these fields are requested. The owner name and mailing address fields are never asked for.
PARCEL_FIELDS = ('PAMS_PIN,PCL_MUN,PCLBLOCK,PCLLOT,PCLQCODE,PROP_CLASS,COUNTY,MUN_NAME,PROP_LOC,LAND_VAL,IMPRVT_VAL,NET_VALUE,LAST_YR_TX,'
                 'BLDG_DESC,LAND_DESC,CALC_ACRE,BLDG_CLASS,YR_CONSTR,DWELL,DEED_DATE,SALE_PRICE,PCL_PBDATE')
PERMITS_URL = 'https://data.nj.gov/resource/w9se-dmra.json'
PERMITS_PAGE = 'https://data.nj.gov/Reference-Data/NJ-Construction-Permit-Data/w9se-dmra'
PERMIT_FIELDS = 'permitdate,certdate,status,permittypedesc,update,buildfee,plumbfee,electfee,firefee,otherfee,constcost,usegroup,processdate'
LIVE_TIMEOUT = float(os.environ.get('PROPERTY_LIVE_TIMEOUT', '3'))      # seconds per attempt; each lookup tries twice
LIVE_ON = os.environ.get('PROPERTY_LIVE', 'on').lower() != 'off'

STATES = {'NJ': 'New Jersey', 'PA': 'Pennsylvania'}
NJ_CLASS = {'1': 'vacant land', '2': 'residential (one to four family)', '3A': 'farm (regular)', '3B': 'farm (qualified)', '4A': 'commercial',
            '4B': 'industrial', '4C': 'apartments'}
# Typical service life in years. General trade ranges (est.), not from any record.
LIFE = {'water heater': (8, 12), 'central air or heat pump': (12, 17), 'furnace': (15, 20), 'electrical panel': (25, 40)}

SUFFIX = {
    'STREET': 'ST', 'STR': 'ST', 'AVENUE': 'AVE', 'AV': 'AVE', 'AVENU': 'AVE', 'DRIVE': 'DR', 'DRV': 'DR', 'ROAD': 'RD', 'LANE': 'LN',
    'COURT': 'CT', 'CRT': 'CT', 'PLACE': 'PL', 'BOULEVARD': 'BLVD', 'BOULV': 'BLVD', 'TERRACE': 'TER', 'TERR': 'TER', 'CIRCLE': 'CIR',
    'HIGHWAY': 'HWY', 'PARKWAY': 'PKWY', 'PKY': 'PKWY', 'TRAIL': 'TRL', 'TR': 'TRL', 'SQUARE': 'SQ', 'TURNPIKE': 'TPKE', 'ALLEY': 'ALY',
    'EXTENSION': 'EXT', 'HEIGHTS': 'HTS', 'POINT': 'PT', 'CROSSING': 'XING', 'RIDGE': 'RDG', 'MOUNT': 'MT', 'ROUTE': 'RT', 'RTE': 'RT',
    'CENTER': 'CTR', 'COVE': 'CV', 'NORTH': 'N', 'SOUTH': 'S', 'EAST': 'E', 'WEST': 'W', 'NORTHEAST': 'NE', 'NORTHWEST': 'NW',
    'SOUTHEAST': 'SE', 'SOUTHWEST': 'SW', 'FIRST': '1ST', 'SECOND': '2ND', 'THIRD': '3RD', 'FOURTH': '4TH', 'FIFTH': '5TH', 'SIXTH': '6TH',
    'SEVENTH': '7TH', 'EIGHTH': '8TH', 'NINTH': '9TH', 'TENTH': '10TH', 'ELEVENTH': '11TH', 'TWELFTH': '12TH', 'SAINT': 'ST',
}
_UNIT = re.compile(r'\s+(?:APT|APARTMENT|UNIT|STE|SUITE|#|LOT|BLDG|FL|FLOOR|RM)\s*#?\s*-?\s*([A-Z0-9-]*)$')
_WARD = re.compile(r'\s+(?:\d+(?:ST|ND|RD|TH)\s+WA?RD(?:\s+ANX)?|WA?RD\s+\d+)$')
_MUNI_TYPE = re.compile(r'\s+(?:TWP|TOWNSHIP|BORO|BOROUGH|CITY|TOWN|VILLAGE|VLG|MUNICIPALITY)$')


# ---------------------------------------------------------------- normalising

def addr_split(s):
    """Street address -> (key, unit). The key is upper case with standard suffixes and no unit, city, state or ZIP."""
    s = (s or '').upper()
    s = re.sub(r"[.,'`]", '', s)
    s = re.sub(r'-\s*(?=UNIT\b|APT\b)', ' ', s)
    s = re.sub(r'#', ' # ', s)
    s = re.sub(r'[^A-Z0-9#/& -]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s+(?:PA|NJ|PENNSYLVANIA|NEW JERSEY)(?:\s+\d{5}(?:-?\d{4})?)?$', '', s)
    if re.match(r'^\d+\S*\s+\S+.*\s\d{5}(?:-\d{4})?$', s):
        s = re.sub(r'\s+\d{5}(?:-\d{4})?$', '', s)
    unit = ''
    while True:
        m = _UNIT.search(s)
        if not m:
            break
        unit = m.group(1) or unit
        s = s[:m.start()]
    return ' '.join(SUFFIX.get(w, w) for w in s.split()), unit


def addr_key(s):
    return addr_split(s)[0]


def muni_key(s):
    """Municipality name without its ward and its type word ("Toms River Twp" -> "TOMS RIVER", "Atlantic City City" -> "ATLANTIC CITY")."""
    s = re.sub(r'[^A-Z0-9 ]', ' ', (s or '').upper())
    s = re.sub(r'\s+', ' ', s).strip()
    prev = None
    while prev != s:
        prev = s
        s = _WARD.sub('', s)
    return _MUNI_TYPE.sub('', s, count=1)


def words_date(iso):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(iso or ''))
    if not m:
        return ''
    try:
        d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return ''
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def words_month(ym):
    m = re.match(r'(\d{4})-(\d{2})', str(ym or ''))
    if not m or not 1 <= int(m.group(2)) <= 12:
        return str(ym or '')
    return datetime.date(int(m.group(1)), int(m.group(2)), 1).strftime('%B %Y')


def money(v):
    try:
        return '' if v is None else f'${int(v):,}'
    except (TypeError, ValueError, OverflowError):
        return ''


def _echo(v):
    """A caller's word, safe to repeat back: letters, digits, spaces and a few marks, 40 characters."""
    return re.sub(r'\s+', ' ', re.sub(r"[^A-Za-z0-9 .,'-]", ' ', str(v or ''))).strip()[:40]


def _today():
    return datetime.date.today()


def _months_between(ym, today):
    return (today.year - int(ym[:4])) * 12 + today.month - int(ym[5:7])


def _cap(text, n=MAX_CHARS):
    if len(text) <= n:
        return text
    cut = text[:n - 60]
    return cut[:cut.rfind('\n')] + '\n[Output trimmed to fit. Narrow the area or lower the limit.]'


# ---------------------------------------------------------------- database

_lock = threading.Lock()
_con = None
_meta = None


def _db():
    global _con, _meta
    if _con is None:
        with _lock:
            if _con is None:
                if not os.path.exists(DB_PATH):
                    raise FileNotFoundError(DB_PATH)
                con = sqlite3.connect(f'file:{DB_PATH}?mode=ro&immutable=1', uri=True, check_same_thread=False)
                con.row_factory = sqlite3.Row
                meta = {}
                for k, v in con.execute('SELECT k, v FROM meta'):
                    try:
                        meta[k] = json.loads(v)
                    except ValueError:
                        meta[k] = v
                _meta, _con = meta, con
    return _con


def _q(sql, params=()):
    con = _db()
    with _lock:
        return con.execute(sql, params).fetchall()


def ready():
    """True when the homes database is present and readable."""
    try:
        _db()
        return True
    except Exception:
        return False


def info():
    if not ready():
        return {}
    m = _meta
    return {'built_at': m.get('built_at'), 'rows': m.get('rows'), 'market_homes': m.get('market_homes'), 'rows_by_state': m.get('rows_by_state'),
            'coverage': m.get('coverage')}


def reset():
    """Close the database (tests point DB_PATH at a fixture and call this)."""
    global _con, _meta
    with _lock:
        if _con is not None:
            _con.close()
        _con, _meta = None, None
        _town_reports.clear()


def _cov(state, county=None):
    c = (_meta or {}).get('coverage') or {}
    return (c.get('county') or {}).get(f'{state}|{county}') if county else (c.get('state') or {}).get(state)


def _retrieved(state, county=None):
    """The date the held copy of the sales records was pulled from the source (the newest, when counties differ), or ''."""
    r = _q('SELECT MAX(retrieved) d FROM sources WHERE state=?' + (' AND county=?' if county else ''), (state, county) if county else (state,))
    return (r[0]['d'] or '') if r else ''


def _through(state, county=None):
    """(first sale date, newest sale date) held for a county or a state, or ('', '')."""
    c = (_cov(state, county) if county else _cov(state)) or {}
    return c.get('first_sale') or '', c.get('latest_sale') or ''


def _counties(state=None):
    return [(r['state'], r['county']) for r in _q('SELECT DISTINCT state, county FROM sources' + (' WHERE state=?' if state else '') + ' ORDER BY state, county',
                                                  (state,) if state else ())]


# ---------------------------------------------------------------- area

def _state_of(v):
    v = re.sub(r'[^A-Z ]', '', str(v or '').upper()).strip()
    if v in ('NJ', 'NEW JERSEY', 'JERSEY'):
        return 'NJ'
    if v in ('PA', 'PENNSYLVANIA', 'PENN', 'PENNA'):
        return 'PA'
    return None


def _flat(args):
    """Accept flat arguments, or the same keys nested under area / filters."""
    a = dict(args or {})
    for k in ('area', 'filters'):
        if isinstance(a.get(k), dict):
            for kk, vv in a.pop(k).items():
                a.setdefault(kk, vv)
    if 'muni' in a:
        a.setdefault('municipality', a['muni'])
    if 'town' in a:
        a.setdefault('municipality', a['town'])
    if 'city' in a:
        a.setdefault('municipality', a['city'])
    return a


def _find_munis(name, state=None, county=None):
    raw = re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', str(name or '').upper())).strip()
    if not raw:
        return []
    where, p = [], []
    if state:
        where.append('state=?')
        p.append(state)
    if county:
        where.append('county=?')
        p.append(county)
    w = (' AND ' + ' AND '.join(where)) if where else ''
    rows = _q('SELECT * FROM munis WHERE (muni_key=? OR UPPER(muni)=?)' + w, [raw, raw] + p)
    if not rows and muni_key(raw) != raw:
        rows = _q('SELECT * FROM munis WHERE muni_key=?' + w, [muni_key(raw)] + p)
    return rows


def _scope(a):
    """Resolve the area arguments. Returns (scope, None) or (None, message)."""
    state = _state_of(a.get('state'))
    county, munis, zip_, notes = None, [], None, []
    free = [t.strip() for t in re.split(r'[,;]', str(a['area'])) if t.strip()] if isinstance(a.get('area'), str) else []
    z = re.search(r'\b(\d{5})\b', str(a.get('zip') or ''))
    if z:
        zip_ = z.group(1)
    known = _counties()
    names = {c.upper(): (s, c) for s, c in known}

    def take_county(v):
        nonlocal county, state
        v = re.sub(r'\s+COUNTY$', '', re.sub(r'[^A-Z ]', ' ', str(v).upper()).strip()).strip()
        if v in names and (not state or names[v][0] == state):
            state, county = names[v]
            return True
        return False

    if a.get('county') and not take_county(a['county']):
        return None, (f"{_echo(a['county'])} is not a county in the Punctual Pros home-sales data. Counties held: "
                      + '; '.join(f"{STATES[s]}: {', '.join(c for ss, c in known if ss == s)}" for s in STATES) + '.')
    muni_name = a.get('municipality')
    for t in free:
        zz = re.fullmatch(r'\d{5}', t)
        if zz and not zip_:
            zip_ = t
        elif _state_of(t) and not state:
            state = _state_of(t)
        elif re.search(r'\bcounty\b', t, re.I) and not county and take_county(t):
            pass
        elif not muni_name:
            m = re.match(r'^(.*?)[\s,]+(NJ|PA)$', t, re.I)
            if m:
                state = state or m.group(2).upper()
                t = m.group(1)
            muni_name = t
    if muni_name:
        munis = _find_munis(muni_name, state, county)
        if not munis and not county and take_county(muni_name):
            pass                                                # "Ocean" given as the place: read it as the county
        elif not munis:
            pool = [r['muni'] for r in _q('SELECT muni FROM munis' + (' WHERE state=?' if state else ''), (state,) if state else ())]
            close = difflib.get_close_matches(str(muni_name).title(), pool, n=4, cutoff=0.6)
            return None, (f"No municipality named {_echo(muni_name)} in the home-sales data" + (f' for {STATES[state]}' if state else '')
                          + '. The data uses municipal names, not postal city names.' + (f" Close names: {', '.join(close)}." if close else '')
                          + ' Try the township or borough name, the county or a ZIP code.')
        else:
            sts = {r['state'] for r in munis}
            cos = {(r['state'], r['county']) for r in munis}
            if len(sts) == 1:
                state = state or next(iter(sts))
            if len(cos) == 1:
                state, county = next(iter(cos))
            elif len(cos) > 1:
                notes.append('More than one municipality has this name (' + ', '.join(f"{r['muni']}, {r['county']} {r['state']}" for r in munis[:6])
                             + '); all are included. Give the county to pick one.')
    where, p = [], []
    if state:
        where.append('s.state=?')
        p.append(state)
    if county:
        where.append('s.county=?')
        p.append(county)
    if munis:
        where.append(f"s.muni_id IN ({','.join('?' * len(munis))})")
        p += [r['id'] for r in munis]
    if zip_:
        where.append('s.zip=?')
        p.append(zip_)
    bits = []
    if munis:
        bits.append(' / '.join(sorted({r['muni'] for r in munis}))[:80])
    if zip_:
        bits.append(f'ZIP {zip_}')
    if county:
        bits.append(f'{county} County, {STATES[state]}')
    elif state:
        bits.append(STATES[state])
    label = ', '.join(bits) if bits else 'the whole Punctual Pros territory (New Jersey and Pennsylvania counties)'
    return {'state': state, 'county': county, 'munis': munis, 'zip': zip_, 'where': where, 'params': p, 'label': label, 'notes': notes}, None


# ---------------------------------------------------------------- new_homeowners

def _period(a, scope, today):
    """Returns (kind, value, label, note). kind: 'range' (since, until), 'month' ym, or 'latest' {state: ym}.
    note is a line to show when the period given could not be read, else ''."""
    since, until = str(a.get('since') or '')[:10], str(a.get('until') or '')[:10]
    ok = lambda d: bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', d)) and bool(words_date(d))
    if ok(since) or ok(until):
        s, u = (since if ok(since) else '0000-01-01'), (until if ok(until) else '9999-12-31')
        lab = (f'{words_date(s)} to {words_date(u)}' if ok(since) and ok(until) else f'since {words_date(s)}' if ok(since) else f'until {words_date(u)}')
        return 'range', (s, u), lab, ''
    per = re.sub(r'\s+', ' ', str(a.get('period') or 'latest')).strip().lower()
    ym = None
    m = re.fullmatch(r'(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?(?:t.*)?', per)             # 2026-10, 2026/10, 2026-10-15
    if m:
        ym = (int(m.group(1)), int(m.group(2)))
    m = re.fullmatch(r'(\d{1,2})/(?:\d{1,2}/)?(\d{4})', per)                           # 10/2026, 10/15/2026
    if m:
        ym = (int(m.group(2)), int(m.group(1)))
    m = re.fullmatch(r'(?:\d{1,2} )?([a-z]{3,9})\.?,? (?:\d{1,2}(?:st|nd|rd|th)?,? )?(\d{4})', per)   # October 2026, Oct 2026, Oct 15, 2026
    if m and m.group(1)[:3] in _MONTHS and _MONTH_NAMES[_MONTHS.index(m.group(1)[:3])].startswith(m.group(1)):
        ym = (int(m.group(2)), _MONTHS.index(m.group(1)[:3]) + 1)
    if ym and 1 <= ym[1] <= 12 and 1900 <= ym[0] <= 2200:
        ym = f'{ym[0]}-{ym[1]:02d}'
        return 'month', ym, words_month(ym), ''
    if per in ('this month', 'current', 'current month', 'now'):
        ym = today.strftime('%Y-%m')
        return 'month', ym, words_month(ym), ''
    if per in ('last month', 'previous month'):
        d = today.replace(day=1) - datetime.timedelta(days=1)
        return 'month', d.strftime('%Y-%m'), words_month(d.strftime('%Y-%m')), ''
    note = ''
    if per not in ('latest', 'latest month', 'latest full month', 'newest', 'newest month', 'most recent', 'recent', 'default'):
        note = f'The period "{_echo(a.get("period"))}" was not understood, so the latest full month is shown instead. Give a month as YYYY-MM.'
    return 'latest', _latest(scope), 'latest full month', note


_MONTH_NAMES = ('january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december')
_MONTHS = tuple(n[:3] for n in _MONTH_NAMES)


def _latest(scope):
    """Latest dense month per state for the scope: the county's own when one county is chosen, else the state's."""
    out = {}
    if scope['county']:
        c = _cov(scope['state'], scope['county']) or {}
        out[scope['state']] = c.get('dense_month')        # no fallback: a county with no full month says so
    else:
        for st in ([scope['state']] if scope['state'] else list(STATES)):
            out[st] = (_cov(st) or {}).get('dense_month')
    return {k: v for k, v in out.items() if v}


def _period_sql(kind, value):
    if kind == 'range':
        return '(s.sale_date BETWEEN ? AND ?)', list(value)
    if kind == 'month':
        return 's.ym=?', [value]
    parts, p = [], []
    for st, ym in value.items():
        parts.append('(s.state=? AND s.ym=?)')
        p += [st, ym]
    return ('(' + ' OR '.join(parts) + ')', p) if parts else ('0', [])


def _int(v, lo, hi):
    try:
        v = int(float(v))
    except (TypeError, ValueError, OverflowError):      # OverflowError: "inf" and "1e999"
        return None
    return v if lo <= v <= hi else None


def _lag_lines(scope, today, states=None):
    lines = []
    for st in ([scope['state']] if scope['state'] else [x for x in STATES if not states or x in states]):
        c = _cov(st, scope['county']) if scope['county'] else _cov(st)
        if not c:
            continue
        name = f"{scope['county']} County, {STATES[st]}" if scope['county'] else STATES[st]
        dm = c.get('dense_month')
        if dm:
            behind = _months_between(dm, today)
            s = f"{name}: newest full month is {words_month(dm)} ({behind} months before today); newest recorded sale {words_date(c['latest_sale'])}."
        else:
            s = f"{name}: no full month is held; newest recorded sale {words_date(c['latest_sale'])}. Coverage here is partial."
        # The gap to today has two parts: the publisher's own lag, and the age of this copy. Say both; quote no fixed figure.
        pulled = words_date(_retrieved(st, scope['county']))
        s += (' The state sales file runs months behind the sale date' if st == 'NJ' else ' Pennsylvania counties post sales on their own schedules')
        s += f', and this copy was pulled on {pulled}.' if pulled else '.'
        lines.append(s)
    return lines


def _homes_sources(rows_by_county):
    """One source per publisher: the state file for New Jersey, the busiest counties for Pennsylvania."""
    out, seen = [], set()
    order = sorted(rows_by_county, key=lambda k: -rows_by_county[k])
    for st, co in order:
        r = _q('SELECT * FROM sources WHERE state=? AND county=?', (st, co))
        if not r:
            continue
        r = r[0]
        if st == 'NJ':
            key, title, pub = 'NJ', 'New Jersey home sales file (Atlantic, Burlington, Monmouth and Ocean counties)', 'NJ Division of Taxation'
        else:
            key, title, pub = (st, co), f'{co} County, Pennsylvania: recorded property sales', f'{co} County, Pennsylvania'
        if key in seen:
            continue
        seen.add(key)
        out.append({'title': title, 'url': r['url'] or '', 'publisher': pub, 'date': r['retrieved'] or '', 'kind': 'data'})
        if len(out) >= 6:
            break
    return out


def _row_line(i, r):
    place = ', '.join(x for x in (r['muni'], f"{r['county']} {r['state']}" + (f" {r['zip']}" if r['zip'] else '')) if x)
    bits = [f"{i}. {r['addr'] or '(no street address in record)'}, {place}",
            f"built {r['year_built']}" if r['year_built'] else 'year built not recorded',
            f"sold {words_date(r['sale_date'])}", money(r['price'])]
    if r['sqft']:
        bits.append(f"{r['sqft']:,} sq ft")
    if r['beds']:
        bits.append(f"{r['beds']} bed")
    if r['new_construction']:
        bits.append('likely new build')
    return ' | '.join(bits)


def _homeowners_report(scope, kind, value, label, a, today, limit):
    psql, pp = _period_sql(kind, value)
    where = ['s.market=1', 's.home=1', psql] + scope['where']
    params = pp + scope['params']
    notes = []
    if a.get('exclude_new_construction') in (True, 'true', 'True', 1, '1', 'yes'):
        where.append('(s.new_construction IS NULL OR s.new_construction=0)')
        notes.append('Likely new builds are left out (homes built in the sale year or the year before, or sold by a builder).')
    lo, hi = _int(a.get('min_year_built'), 1600, 2100), _int(a.get('max_year_built'), 1600, 2100)
    if lo is not None:
        where.append('s.year_built>=?')
        params.append(lo)
    if hi is not None:
        where.append('s.year_built<=?')
        params.append(hi)
    if lo is not None or hi is not None:
        notes.append('The year-built filter drops homes with no recorded year built.')
    w = ' AND '.join(where)
    total = _q(f'SELECT COUNT(*) n, SUM(s.year_built IS NOT NULL) yb FROM sales s WHERE {w}', params)[0]
    n = total['n']
    if not n:
        return 0, [], {}
    by_county = _q(f'SELECT s.state, s.county, COUNT(*) n FROM sales s WHERE {w} GROUP BY s.state, s.county ORDER BY n DESC', params)
    by_muni = _q(f'SELECT m.muni, s.county, s.state, COUNT(*) n FROM sales s JOIN munis m ON m.id=s.muni_id WHERE {w} GROUP BY s.muni_id ORDER BY n DESC LIMIT 12', params)
    n_muni = _q(f'SELECT COUNT(DISTINCT s.muni_id) n FROM sales s WHERE {w}', params)[0]['n']
    prices = [r['price'] for r in _q(f'SELECT s.price FROM sales s WHERE {w} AND s.price IS NOT NULL', params)]
    rows = _q(f'SELECT s.*, m.muni FROM sales s LEFT JOIN munis m ON m.id=s.muni_id WHERE {w} '
              'ORDER BY (s.year_built IS NULL), s.year_built ASC, s.sale_date DESC, s.price DESC, s.id LIMIT ?', params + [limit * 2 + 10])
    seen, ranked = set(), []
    for r in rows:
        k = (r['addr_key'], r['muni_id'], r['sale_date'], r['block_lot'] or r['parcel_id'] or r['id'])
        if k in seen:
            continue
        seen.add(k)
        ranked.append(r)
        if len(ranked) >= limit:
            break

    if kind == 'latest':
        plabel = '; '.join(words_month(ym) if scope['county'] else f'{STATES[st]} {words_month(ym)}' for st, ym in value.items()
                           if any(r['state'] == st for r in by_county))
    else:
        plabel = label
    L = [f"NEW HOMEOWNERS: {scope['label']}", f'Period: {plabel} (the newest full month in the data)' if kind == 'latest' else f'Period: {plabel}',
         f'Today is {words_date(today.isoformat())}. These are recorded sales from the period above, not sales made this month.', '',
         'Data through']
    L += ['- ' + s for s in _lag_lines(scope, today, {r['state'] for r in by_county})]
    if kind in ('month', 'latest'):
        thin = []
        for r in by_county:
            dm = (_cov(r['state'], r['county']) or {}).get('dense_month')
            want = value if kind == 'month' else value.get(r['state'])
            if want and (not dm or dm < want):
                thin.append(f"{r['county']} {r['state']}")
        if thin:
            L.append(f"- Not complete yet for this period: {', '.join(thin)}. Counts there will rise as the source catches up.")
    L += ['', f'Totals: {n:,} market home sales' + (f', median price {money(statistics.median(prices))}' if prices else '') + '.',
          'By county: ' + '; '.join(f"{r['county']} {r['state']} {r['n']:,}" for r in by_county) + '.',
          f'By municipality (top {len(by_muni)} of {n_muni}): ' + '; '.join(f"{r['muni']} ({r['county']}) {r['n']:,}" for r in by_muni) + '.']
    scoped = {(r['state'], r['county']) for r in by_county}
    quiet = [f'{c} {s}' for s, c in _counties(scope['state']) if (s, c) not in scoped] if not (scope['county'] or scope['munis'] or scope['zip']) else []
    if quiet:
        L.append(f"No sales in this period for: {', '.join(quiet)} (the source has not reached this period there, or coverage is partial).")
    L += ['', 'What counts: market sales of homes only. Left out: deeds the record marks as not a market sale (family, estate, sheriff and similar), '
              'prices under $1,000, land, commercial property and apartment buildings. Pennsylvania counties publish no sale-validity code, so a '
              'Pennsylvania row is any priced home sale.',
          'Ranking rule: oldest recorded year built first, because older homes are more likely to need plumbing, heating, cooling and electrical work. '
          'Ties go to the most recent sale. Homes with no recorded year built come last, newest sale first. Only recorded facts are used.']
    no_yb = n - (total['yb'] or 0)
    if no_yb:
        gap = any(r['county'] in ('Lancaster', 'Chester', 'Adams') for r in by_county)
        L.append(f'{no_yb:,} of the {n:,} have no recorded year built' + (' (Lancaster, Chester and Adams counties do not publish it).' if gap else '.'))
    L += ['Owner names are not held and are never shown. Address mail to "New homeowner".']
    L += notes + scope['notes']
    L += ['', f'Ranked list (top {len(ranked)} of {n:,})']
    head = '\n'.join(L)
    body, used = [], len(head)
    compact = limit > 30
    if compact:
        body.append('Columns: address, municipality, state and ZIP | year built | sale date | price')
        used += len(body[0]) + 1
    for i, r in enumerate(ranked, 1):
        line = _row_line(i, r) if not compact else ' | '.join((
            f"{i}. {r['addr'] or '(no street address)'}, {r['muni']} {r['state']}" + (f" {r['zip']}" if r['zip'] else ''),
            str(r['year_built'] or 'not recorded'), r['sale_date'], money(r['price'])))
        if used + len(line) + 1 > MAX_CHARS - 170:
            body.append(f'[List stops at {i - 1} of {len(ranked)} to keep this short. Ask for one county, municipality or ZIP to see more.]')
            break
        body.append(line)
        used += len(line) + 1
    return n, [head] + body, {(r['state'], r['county']): r['n'] for r in by_county}


def run_new_homeowners(args):
    """Returns (text, sources)."""
    if not ready():
        return 'The home-sales data is not available on this server.', []
    a = _flat(args)
    today = _today()
    scope, err = _scope(a)
    if err:
        return err, []
    limit = _int(a.get('limit'), 1, 10 ** 6) or DEFAULT_LIMIT
    limit = min(limit, MAX_LIMIT)
    kind, value, label, note = _period(a, scope, today)
    n, lines, counts = _homeowners_report(scope, kind, value, label, a, today, limit)
    if n:
        return _cap('\n'.join(([note, ''] if note else []) + lines)), _homes_sources(counts)
    # Nothing for the requested period: say so, then give the latest full month instead.
    if kind == 'latest' and not value:
        L = ([note] if note else []) + [f"No full month of sales is held for {scope['label']}, so there is no latest month to report. Coverage here is partial."]
    else:
        L = [f"No recorded market home sales for {label} in {scope['label']}."]
    if kind == 'month':
        latest_sale = max(((_cov(st, scope['county']) if scope['county'] else _cov(st)) or {}).get('latest_sale') or ''
                          for st in ([scope['state']] if scope['state'] else list(STATES)))
        if latest_sale and value > latest_sale[:7]:
            L.append(f'The public sources have not published {label} yet. The newest recorded sale is {words_date(latest_sale)}.')
        elif value == today.strftime('%Y-%m'):
            L.append('No public source is current to this month.')
    if kind != 'latest':
        lk = _latest(scope)
        n2, lines2, counts2 = _homeowners_report(scope, 'latest', lk, '', a, today, limit) if lk else (0, [], {})
        if n2:
            L += ['The latest full month is given below instead. Do not present it as this month.', ''] + lines2
            return _cap('\n'.join(L)), _homes_sources(counts2)
    L += ['Data through'] + ['- ' + s for s in _lag_lines(scope, today)]
    L.append('Try a wider area, a since and until date range, an earlier month, or drop the year-built filter.')
    return _cap('\n'.join(L)), []


# ---------------------------------------------------------------- live lookups (New Jersey only)

def _get_json(url, params, timeout=LIVE_TIMEOUT):
    """One GET, JSON back, with one retry on a timeout or dropped connection. Tests replace this function."""
    import httpx
    last = None
    for _ in range(2):
        try:
            r = httpx.get(url, params=params, timeout=httpx.Timeout(timeout, connect=min(timeout, 2.5)), headers={'User-Agent': 'BSP-Desk/1.0'},
                          follow_redirects=True)
            r.raise_for_status()
            return r.json()
        except httpx.TransportError as e:       # timeouts and connection errors; an HTTP error status is not retried
            last = e
    raise last


def _safe(v, n=12):
    """A block, lot or qualifier as the services store it: letters, digits, dot and dash only."""
    v = str(v or '').strip().upper()
    return v if re.fullmatch(r'[A-Z0-9.\-]{1,%d}' % n, v) else None


def _split_block_lot(block_lot):
    m = re.match(r'^\s*([^/\s]+)/([^/\s]+)(?:\s+(\S+))?\s*$', str(block_lot or ''))
    return (_safe(m.group(1)), _safe(m.group(2)), _safe(m.group(3)) if m.group(3) else None) if m else (None, None, None)


def _parcel_attrs(js):
    if not isinstance(js, dict) or js.get('error'):
        raise ValueError('parcel service error')
    return [f['attributes'] for f in js.get('features') or [] if isinstance(f, dict) and isinstance(f.get('attributes'), dict)]


def nj_parcel(code, block, lot, qual=None):
    """The parcel record for a municipality code + block + lot (+ qualifier). Returns a dict or None. Raises on a failed call."""
    code, block, lot = _safe(code, 4), _safe(block), _safe(lot)
    if not (code and block and lot):
        return None
    q = _safe(qual)
    where = f"PCL_MUN='{code}' AND PCLBLOCK='{block}' AND PCLLOT='{lot}'"
    where += f" AND (PCLQCODE='{q}' OR PCLQCODE='' OR PCLQCODE IS NULL)" if q else ''
    feats = _parcel_attrs(_get_json(PARCELS_URL + '/query', {'where': where, 'outFields': PARCEL_FIELDS, 'returnGeometry': 'false',
                                                              'resultRecordCount': 10, 'f': 'json'}))
    if not feats:
        return None
    if q:
        for f in feats:
            if (f.get('PCLQCODE') or '').upper() == q:
                return f
        feats[0]['_parent_lot'] = True
        return feats[0]
    for f in feats:
        if not (f.get('PCLQCODE') or ''):
            return f
    return feats[0]


def nj_parcels_by_address(key, code=None, county=None):
    """Parcels whose location starts with the house number and street name. Returns a list (may be empty). Raises on a failed call."""
    toks = [t for t in re.sub(r'[^A-Z0-9 ]', ' ', key.upper()).split() if t]
    if len(toks) < 2 or not re.match(r'^\d', toks[0]):
        return []
    like = ' '.join(toks[:2]) if len(toks) == 2 or len(toks[1]) > 2 else ' '.join(toks[:3])     # keep "12 N MAIN", not just "12 N"
    if code and _safe(code, 4):
        where = f"PCL_MUN='{_safe(code, 4)}' AND PROP_LOC LIKE '{like}%'"
    elif county:
        where = f"COUNTY='{re.sub(r'[^A-Z ]', '', county.upper())}' AND PROP_LOC LIKE '{like}%'"
    else:
        where = "COUNTY IN ('ATLANTIC','BURLINGTON','MONMOUTH','OCEAN') AND PROP_LOC LIKE '" + like + "%'"
    return _parcel_attrs(_get_json(PARCELS_URL + '/query', {'where': where, 'outFields': PARCEL_FIELDS, 'returnGeometry': 'false',
                                                             'resultRecordCount': 8, 'f': 'json'}))


def _num(v):
    """A number from a live payload, or 0.0 when it is missing, not a number or not finite."""
    try:
        f = float(v or 0)
    except (TypeError, ValueError):
        return 0.0
    return f if math.isfinite(f) else 0.0


def _bl_forms(v):
    """A block or lot in each form the permit feed uses: as written, zero-padded to five digits, and padded with two spaces for the dot."""
    forms = [v]
    m = re.fullmatch(r'(\d{1,5})((?:\.\d+)?[A-Z]*)', v or '')
    if m:
        pad = m.group(1).zfill(5) + m.group(2)
        forms.append(pad)
        if '.' in pad:
            forms.append(pad.replace('.', '  '))
    return list(dict.fromkeys(forms))


# Municipalities with no rows at all in the permit feed (Lakehurst and Pine Beach, checked Nov 12, 2026). Used when the live count fails.
NO_PERMIT_FEED = frozenset({'1514', '1523'})
_town_reports = {}


def nj_town_reports(code):
    """True when the permit feed holds any row for the municipality code, False when it holds none. Raises on a failed call."""
    code = _safe(code, 4)
    if not code:
        raise ValueError('no municipality code')
    if code not in _town_reports:
        js = _get_json(PERMITS_URL, {'$select': 'count(*) AS n', '$where': f"treasurycode='{code}'"})
        if not (isinstance(js, list) and js and isinstance(js[0], dict)):
            raise ValueError('permit service error')
        _town_reports[code] = int(float(js[0]['n'])) > 0
    return _town_reports[code]


def nj_permits(code, block, lot, today=None):
    """Permits reported for a municipality code + block + lot, newest first, impossible dates dropped. Raises on a failed call."""
    code, block, lot = _safe(code, 4), _safe(block), _safe(lot)
    if not (code and block and lot):
        return []
    today = today or _today()
    # Some towns file the block and lot zero-padded ("01066", "00004") or with spaces for the dot ("01201  04"): ask for every form.
    quoted = lambda v: ','.join(f"'{f}'" for f in _bl_forms(v))
    where = f"treasurycode='{code}' AND block in({quoted(block)}) AND lot in({quoted(lot)})"
    js = _get_json(PERMITS_URL, {'$where': where, '$select': PERMIT_FIELDS, '$order': 'permitdate DESC', '$limit': 60})
    if not isinstance(js, list):
        raise ValueError('permit service error')
    out = []
    for r in js:
        if not isinstance(r, dict):
            continue
        d = str(r.get('permitdate') or '')[:10]
        if not words_date(d) or not ('1980-01-01' <= d <= today.isoformat()):
            continue                                            # the feed carries dates such as 1113 and 2925
        trades = [t for t, k in (('building', 'buildfee'), ('plumbing', 'plumbfee'), ('electrical', 'electfee'), ('fire', 'firefee')) if _num(r.get(k)) > 0]
        other = _num(r.get('otherfee')) > 0
        cert = str(r.get('certdate') or '')[:10]
        out.append({'date': d, 'type': str(r.get('permittypedesc') or 'Permit')[:60], 'trades': trades, 'other': other,
                    'fees': {k: _num(r.get(k)) for k in ('buildfee', 'plumbfee', 'electfee', 'firefee', 'otherfee') if _num(r.get(k)) > 0},
                    'cost': _num(r.get('constcost')), 'cert': cert if words_date(cert) and cert <= today.isoformat() else '',
                    'status': r.get('status') or '', 'update': (r.get('update') or '') == 'X', 'processed': str(r.get('processdate') or '')[:10]})
    out.sort(key=lambda p: p['date'], reverse=True)
    return out


def _bldg_reading(desc):
    """A cautious reading of the assessor's building shorthand ("2F2G       2240"), or ''."""
    s = re.sub(r'\s+', ' ', str(desc or '').upper()).strip()
    m = re.match(r'^(\d(?:\.5)?)\s?S?\s?(CB|AL|F|B|V|M)?(?:\s?(\d)\s?G)?(?=\s|$)', s)
    if not m or not 1 <= float(m.group(1)) <= 4 or not (m.group(2) or m.group(3)):
        return ''
    st = m.group(1)
    bits = [f"{st} stor{'y' if st == '1' else 'ies'}"]
    mat = {'F': 'frame', 'B': 'brick', 'AL': 'aluminium siding', 'V': 'vinyl siding', 'CB': 'concrete block', 'M': 'masonry'}.get(m.group(2) or '')
    if mat:
        bits.append(mat)
    if m.group(3):
        bits.append(f'{m.group(3)}-car garage')
    return ', '.join(bits)


def _mod4_deed(v, today):
    m = re.fullmatch(r'(\d{2})(\d{2})(\d{2})', str(v or ''))
    if not m:
        return ''
    yy = int(m.group(1))
    year = 2000 + yy if 2000 + yy <= today.year else 1900 + yy
    iso = f'{year}-{m.group(2)}-{m.group(3)}'
    return iso if words_date(iso) else ''


# ---------------------------------------------------------------- property_brief

FIND_LIMIT = 200      # the busiest address in the data has 45 recorded sales


def _parcel_of(r):
    """What tells one property from another at the same address: block and lot (New Jersey) or the county parcel number."""
    return r['block_lot'] or r['parcel_id'] or ''


def _unit_matches(unit, qual):
    """New Jersey gives a condo unit a code on the lot: C0055 for unit 55, C00A7 for unit A7."""
    u = re.sub(r'[^A-Z0-9]', '', str(unit or '').upper()).lstrip('0')
    q = re.sub(r'[^A-Z0-9]', '', str(qual or '').upper())
    return bool(u) and q[:1] == 'C' and q[1:].lstrip('0') == u


def _window_note(state, county=None):
    """One line saying how far the held sales reach for a county or state, or ''."""
    first, last = _through(state, county)
    if not last:
        return ''
    pulled = words_date(_retrieved(state, county))
    name = f'{county} County' if county else STATES[state]
    return (f'Sales for {name} are held from {words_date(first)} through {words_date(last)}' + (f' (records pulled {pulled})' if pulled else '')
            + '. A purchase after that date is not in the data yet.')


def _find_address(key, unit, scope):
    """Local sales rows for an address, newest first. Returns (rows, how) with how in exact / prefix / near / ''."""
    base = 'SELECT s.*, m.muni, m.code FROM sales s LEFT JOIN munis m ON m.id=s.muni_id WHERE '
    extra = (' AND ' + ' AND '.join(scope['where'])) if scope['where'] else ''
    order = f' ORDER BY s.sale_date DESC, s.id LIMIT {FIND_LIMIT}'
    rows = _q(base + 's.addr_key=?' + extra + order, [key] + scope['params'])
    how = 'exact'
    if not rows:
        rows = _q(base + 's.addr_key >= ? AND s.addr_key < ?' + extra + order, [key + ' ', key + ' ￿'] + scope['params'])
        how = 'prefix'
    if rows and unit:
        with_unit = [r for r in rows if addr_split(r['addr'])[1] == unit]
        rows = with_unit or rows
    if rows:
        return rows, how
    toks = key.split()
    if len(toks) >= 2 and re.match(r'^\d', toks[0]):
        stem = toks[1] if len(toks[1]) > 2 or len(toks) < 3 else f'{toks[1]} {toks[2]}'
        near = _q(base + 's.addr_key >= ? AND s.addr_key < ?' + extra + order, [f'{toks[0]} {stem}', f'{toks[0]} {stem}￿'] + scope['params'])
        if near:
            return near, 'near'
    return [], ''


def _place(r):
    return ', '.join(x for x in (r['muni'], f"{r['county']} County {r['state']}" + (f" {r['zip']}" if r['zip'] else '')) if x)


def _src_tag(src):
    return f"{src['short']}, retrieved {words_date(src['retrieved'])}"


def _sale_source(state, county):
    r = _q('SELECT * FROM sources WHERE state=? AND county=?', (state, county))
    r = r[0] if r else None
    if state == 'NJ':
        return {'short': 'New Jersey home sales file', 'retrieved': r['retrieved'] if r else '', 'src': {
            'title': 'New Jersey home sales file (Atlantic, Burlington, Monmouth and Ocean counties)', 'url': r['url'] if r else '',
            'publisher': 'NJ Division of Taxation', 'date': r['retrieved'] if r else '', 'kind': 'data'}}
    return {'short': f'{county} County property sales records', 'retrieved': r['retrieved'] if r else '', 'src': {
        'title': f'{county} County, Pennsylvania: recorded property sales', 'url': r['url'] if r else '',
        'publisher': f'{county} County, Pennsylvania', 'date': r['retrieved'] if r else '', 'kind': 'data'}}


def _offers(year_built, yb_tag, sale_date, new_build, state, permits, permits_ok, today, market=True, shared=False, reports=True):
    """Offer leads from simple, stated rules. Each lead: (offer, evidence)."""
    out = []
    age = today.year - year_built if year_built else None
    if sale_date:
        mo = (today.year - int(sale_date[:4])) * 12 + today.month - int(sale_date[5:7])
        if mo <= 24 and not market:
            out.append(('Whole-home check, if the caller is new to the house.',
                        f'A deed was recorded {words_date(sale_date)} [recorded], but the record marks it as not a market sale, so the occupant may not be new [inferred].'))
        elif mo <= 24:
            out.append(('New-homeowner whole-home check: plumbing, heating, cooling and electrical in one visit.',
                        f'Bought {mo} months ago: sale recorded {words_date(sale_date)} [recorded]. New owners rarely know the age of each system [inferred].'))
    if state == 'NJ':
        if permits_ok and not permits and reports is False:
            mech = plumb = elec = None
            none = lambda what: 'This municipality does not report to the state permit feed, so permit history is unknown.'
        elif permits_ok and shared:
            mech = plumb = elec = None
            none = lambda what: 'Permits here are filed on a lot shared with other units, so they cannot be tied to this unit.'
        elif permits_ok:
            mech = [p for p in permits if p['other']]
            plumb = [p for p in permits if 'plumbing' in p['trades']]
            elec = [p for p in permits if 'electrical' in p['trades']]
            none = lambda what: f'No permit with {what} matched this block and lot in the state feed [recorded absence].'
        else:
            mech = plumb = elec = None
            none = lambda what: 'The state permit feed could not be checked just now, so permit history is unknown.'
    else:
        mech = plumb = elec = None
        none = lambda what: 'Pennsylvania has no public permit feed, so permit history is unknown.'
    if age is None:
        out.append(('Ask the caller how old the home and each system are before quoting.', 'Year built is not in the record for this address.'))
        return out
    if new_build or age <= 2:
        out.append(('Maintenance plan rather than replacement.',
                    f'Built {year_built} ({yb_tag}); equipment is likely original and may be under builder or maker warranty [inferred].'))
        return out
    lo, hi = LIFE['central air or heat pump'][0], LIFE['furnace'][1]
    if mech:
        out.append(('Heating and cooling maintenance plan; ask what the permitted work covered.',
                    f"A permit dated {words_date(mech[0]['date'])} carries an \"other\" fee, the column that holds mechanical fees [recorded]. "
                    'That may be heating or cooling work [inferred].'))
    elif age >= lo:
        out.append(('Heating and cooling inspection, with a replacement quote if the equipment is original or near the end of its life.',
                    f'The house is about {age} years old [inferred from year built {year_built}, {yb_tag}]. Typical life is {lo} to {hi} years (est.) [inferred]. '
                    + none('a mechanical-type fee')))
    lo, hi = LIFE['water heater']
    if plumb:
        out.append(('Plumbing check-up; ask what the permitted plumbing work covered.',
                    f"A permit dated {words_date(plumb[0]['date'])} carries a plumbing fee [recorded]. The record does not say what was done."))
    elif age >= lo:
        out.append(('Water heater age check, with a replacement quote if it is past its typical life.',
                    f'House about {age} years old [inferred]. A water heater typically lasts {lo} to {hi} years (est.) [inferred], '
                    f'so the original one has likely been replaced at least once; the record does not show when. ' + none('a plumbing fee')))
    lo, hi = LIFE['electrical panel']
    if elec:
        out.append(('Electrical safety check; ask what the permitted electrical work covered.',
                    f"A permit dated {words_date(elec[0]['date'])} carries an electrical fee [recorded]. The record does not say what was done."))
    elif age >= lo:
        ev = f'House about {age} years old [inferred]. A panel typically lasts {lo} to {hi} years (est.) [inferred]. ' + none('an electrical fee')
        if 1965 <= year_built <= 1973:
            ev += ' Some homes built from 1965 to 1973 have aluminium branch wiring [inferred from year built].'
        elif year_built < 1950:
            ev += ' Homes of this age may still have fuses or early wiring [inferred from year built].'
        out.append(('Electrical panel and service evaluation.', ev))
    if year_built < 1960:
        out.append(('Water and drain line inspection, with a repipe or drain repair quote if needed.',
                    f'Built {year_built} ({yb_tag}). Galvanised steel supply lines and cast-iron drains were common before 1960 [inferred from year built].'))
    return out


def run_property_brief(args):
    """Returns (text, sources)."""
    if not ready():
        return 'The home-sales data is not available on this server.', []
    a = _flat(args)
    today = _today()
    raw = re.sub(r'\s+', ' ', str(a.get('address') or '')).strip()[:120]
    if not raw:
        return 'Give a street address, and the municipality, county or ZIP if you have it.', []
    # "317 Barcelona Drive, Toms River, NJ 08753": the first part is the street, the rest is the area.
    parts = [p.strip() for p in raw.split(',') if p.strip()]
    if len(parts) > 1:
        tail = ', '.join(parts[1:])
        z = re.search(r'\b(\d{5})\b', tail)
        if z and not a.get('zip'):
            a['zip'] = z.group(1)
        tail = re.sub(r'\b\d{5}(?:-\d{4})?\b', '', tail).strip(' ,')
        if tail and not a.get('area'):
            a['area'] = tail if not isinstance(a.get('area'), str) else a['area']
        elif tail and isinstance(a.get('area'), str):
            pass
    key, unit = addr_split(parts[0] if parts else raw)
    if not key or not re.search(r'[A-Z]', key):
        return 'Give a street address with a house number and street name.', []
    area_note = ''
    scope, err = _scope(a)
    if err:
        # The area could not be read (often a postal city name). Search on state, county and ZIP only.
        b = {k: v for k, v in a.items() if k in ('state', 'county', 'zip')}
        if isinstance(a.get('area'), str):
            st = next((_state_of(t.strip()) or (re.search(r'\b(NJ|PA)\b', t.upper()) or [None])[0] for t in a['area'].split(',')
                       if _state_of(t.strip()) or re.search(r'\b(NJ|PA)\b', t.upper())), None)
            if st and not b.get('state'):
                b['state'] = st
        scope, err2 = _scope(b)
        if err2:
            return err2, []
        named = a.get('municipality') or a.get('area')
        area_note = (f'"{_echo(named)}" is not a municipal name in the data (it may be a postal city), so the search covered '
                     f"{scope['label'] if (scope['state'] or scope['zip']) else 'the whole territory'}.")
    rows, how = _find_address(key, unit, scope)
    if not rows and scope['zip']:                                # ZIPs in the data are derived and sometimes missing: retry without
        s2 = dict(scope)
        i = s2['where'].index('s.zip=?')
        s2['where'] = [w for w in s2['where'] if w != 's.zip=?']
        s2['params'] = [p for j, p in enumerate(scope['params']) if j != i]
        rows, how = _find_address(key, unit, s2)

    sources, L = [], []
    shown = key + (f' unit {unit}' if unit else '')

    def candidates(rs, lead):
        seen, out = set(), [lead]
        for r in rs:
            k = (r['addr'], r['muni_id'])
            if k in seen:
                continue
            seen.add(k)
            out.append(f"- {r['addr']}, {_place(r)}")
            if len(out) > 8:
                break
        return out

    # One property is one address in one municipality on one lot. A condo building, or a street recorded with no house numbers,
    # puts many lots under one address: those are different homes and are never merged into one brief.
    place = lambda r: (r['addr_key'], r['muni_id'], addr_split(r['addr'])[1], _parcel_of(r))
    places = {place(r) for r in rows}
    one_addr = len({p[:3] for p in places}) == 1
    if rows and how != 'near' and len(places) > 1 and one_addr and unit:
        hit = [r for r in rows if _unit_matches(unit, _split_block_lot(r['block_lot'])[2])]
        if len({_parcel_of(r) for r in hit}) == 1:              # the unit asked for matches one lot's unit code
            rows, places = hit, {place(r) for r in hit}
    if rows and how == 'near':
        L = [f'PROPERTY BRIEF: {shown}', f'No recorded sale matches this address exactly in {scope["label"]}.' + (f' {area_note}' if area_note else '')]
        L += candidates(rows, 'Closest recorded addresses (same house number and street name start). Confirm the address with the caller, then ask again:')
        return _cap('\n'.join(L)), []
    if rows and len(places) > 1 and one_addr:
        lots, codes = {}, []
        for r in rows:                                          # newest sale first, so the first row seen for a lot is its last sale
            if _parcel_of(r) not in lots:
                lots[_parcel_of(r)] = r
                codes.append(_split_block_lot(r['block_lot'])[2])
        more = ' or more' if len(rows) >= FIND_LIMIT else ''
        L = [f'PROPERTY BRIEF: {shown}',
             f"{rows[0]['addr']}, {_place(rows[0])}: the sales records hold {len(lots)}{more} separate lots at this address. They are different homes, "
             'so no single brief is given.']
        if unit:
            L.append(f'No lot here has a unit code that matches unit {unit}.')
        eg = next((c for c in codes if c and c[:1] == 'C' and c[1:].lstrip('0')), None)
        if eg:
            L.append(f'Ask the caller for the unit, then ask again with it in the address (for example "{rows[0]["addr"]} Unit {eg[1:].lstrip("0")}"). '
                     f'The state gives each unit a code: {eg} is read as unit {eg[1:].lstrip("0")} [inferred].')
        else:
            L.append('The record gives no house or unit number to tell them apart. Ask the caller for the full street address, then ask again.')
        L.append('Lots recorded here, newest sale first:')
        for (pid, r), c in list(zip(lots.items(), codes))[:8]:
            if r['block_lot']:
                b, l, _ = _split_block_lot(r['block_lot'])
                ident = (f'unit code {c}, ' if c else '') + (f'block and lot {b} / {l}' if b and l else f"block and lot {r['block_lot']}")
            else:
                ident = f'county parcel number {pid}' if pid else 'no parcel number recorded'
            L.append(f"- {ident}: last recorded sale {words_date(r['sale_date'])}, {money(r['price']) or 'price not recorded'}")
        if len(lots) > 8:
            L.append(f'- and {len(lots) - 8}{more} more.')
        L.append(_window_note(rows[0]['state'], rows[0]['county']))
        return _cap('\n'.join(x for x in L if x)), []
    if rows and len(places) > 1:
        L = [f'PROPERTY BRIEF: {shown}', 'More than one recorded address matches. Ask the caller for the municipality or the unit, then ask again:']
        L += candidates(rows, 'Matches:')[1:]
        return _cap('\n'.join(L)), []

    rec = rows[0] if rows else None
    state = rec['state'] if rec else scope['state']
    parcel, permits, permit_ok, parcel_ok, timing = None, [], False, False, {}
    reports, town_ok = None, False                               # True / False once the town check answers; None when unknown
    code = block = lot = qual = None
    if rec and state == 'NJ':
        code = rec['code']
        block, lot, qual = _split_block_lot(rec['block_lot'])
    if state == 'NJ' and LIVE_ON:
        def timed(name, fn, *fa):
            t = time.monotonic()
            try:
                return fn(*fa), True
            except Exception:
                return None, False
            finally:
                timing[name] = round(time.monotonic() - t, 3)
        if rec and code and block and lot:
            with ThreadPoolExecutor(max_workers=3) as ex:
                f1 = ex.submit(timed, 'parcel', nj_parcel, code, block, lot, qual)
                f2 = ex.submit(timed, 'permits', nj_permits, code, block, lot, today)
                f3 = ex.submit(timed, 'town', nj_town_reports, code)          # does this municipality report to the feed at all?
                (parcel, parcel_ok), (permits, permit_ok), (reports, town_ok) = f1.result(), f2.result(), f3.result()
            permits = permits or []
        elif not rec:
            mcode = next((m['code'] for m in scope['munis'] if m['code']), None) if len({m['code'] for m in scope['munis']}) == 1 else None
            found, parcel_ok = timed('parcel', nj_parcels_by_address, key, mcode, scope['county'])
            found = found or []
            exact = [f for f in found if addr_key(f.get('PROP_LOC')) == key]
            pick = exact if exact else found
            if len({(f.get('PCL_MUN'), f.get('PCLBLOCK'), f.get('PCLLOT'), f.get('PCLQCODE')) for f in pick}) == 1:
                parcel = pick[0]
                code, block, lot = _safe(parcel.get('PCL_MUN'), 4), _safe(parcel.get('PCLBLOCK')), _safe(parcel.get('PCLLOT'))
                permits, permit_ok = timed('permits', nj_permits, code, block, lot, today)
                permits = permits or []
                if permit_ok and not permits and code:
                    reports, town_ok = timed('town', nj_town_reports, code)
            elif pick:
                L = [f'PROPERTY BRIEF: {shown}', 'No recorded sale is held for this address, and the New Jersey parcel list has more than one match. '
                     'Ask the caller for the municipality or the unit, then ask again:']
                for f in pick[:8]:
                    L.append(f"- {f.get('PROP_LOC')}, {str(f.get('MUN_NAME') or '').title()}, {str(f.get('COUNTY') or '').title()} County NJ"
                             + (f" (unit code {f.get('PCLQCODE')})" if f.get('PCLQCODE') else ''))
                return _cap('\n'.join(L)), [_parcel_source(pick[0])]
    run_property_brief.last_timing = timing
    if permits:
        reports = True
    elif not town_ok:
        reports = False if code in NO_PERMIT_FEED else None      # the count did not answer: fall back to the towns known to be silent
    if not isinstance(parcel, dict):
        parcel = None

    if not rec and not parcel:
        if scope['county']:
            windows = [_window_note(scope['state'], scope['county'])]
        else:
            windows = [_window_note(st) for st in ([state] if state else list(STATES))]
        windows = [w.replace(' A purchase after that date is not in the data yet.', '') for w in windows if w]
        L = [f'PROPERTY BRIEF: {shown}',
             f"No record found for this address in {scope['label']}." + (f' {area_note}' if area_note else ''),
             'What that means: the file only holds homes with a sale recorded between these dates. ' + ' '.join(windows)
             + ' A home bought before or after those dates is not in it, so this does not show whether the caller is a new owner.']
        if state == 'NJ':
            L.append('The New Jersey parcel list was also checked and returned no match for this house number and street.' if parcel_ok and LIVE_ON
                     else 'The New Jersey parcel list could not be checked just now.')
        elif state == 'PA':
            L.append('Pennsylvania has no public permit feed, and county assessor sites are not searched.')
        else:
            L.append('Give the state and municipality. For New Jersey addresses the state parcel list can also be checked.')
        L += ['', 'What to do', '- Confirm the spelling, the house number and the municipality (the township or borough, not the postal city).',
              '- Ask the caller when they bought the home. A purchase after the dates above is not in the data yet.',
              '- Ask the caller the age of the home and of the water heater, heating and cooling equipment and panel.',
              '- No offer leads are given: there is no record to base them on.']
        return _cap('\n'.join(L)), []

    # ----- the brief
    facts, year_built, yb_tag, sale_date, new_build, through_co = [], None, '', None, False, None
    if rec:
        ss = _sale_source(rec['state'], rec['county'])
        sources.append(ss['src'])
        tag = f'[recorded: {_src_tag(ss)}]'
        title = f"{rec['addr']}, {_place(rec)}"
        through_co = rec['county']
        sale_date = rec['sale_date']
        kind = ('market sale; the state marks the deed usable' if rec['arms_length'] == 1 else
                'the record marks it as not a market sale: family, estate, sheriff or similar' if rec['arms_length'] == 0 or not rec['market'] else
                'priced sale; this county publishes no sale-validity code')
        facts.append(f"- Last recorded sale: {words_date(rec['sale_date'])}, {money(rec['price']) or 'price not recorded'} ({kind}) {tag}")
        earlier = list(dict.fromkeys((r['sale_date'], r['price']) for r in rows[1:]            # the same lot only, each deed once
                                     if _parcel_of(r) == _parcel_of(rec) and (r['sale_date'], r['price']) != (rec['sale_date'], rec['price'])))
        if earlier:
            facts.append(f"- Earlier recorded sales here: {', '.join((words_date(d) + ' ' + money(pr)).strip() for d, pr in earlier[:3])} {tag}")
        if rec['year_built']:
            year_built, yb_tag = rec['year_built'], f'recorded: {ss["short"]}'
            facts.append(f"- Year built: {rec['year_built']} {tag}")
        else:
            facts.append('- Year built: not in the record for this county or address.')
        facts.append(f"- Living area: {rec['sqft']:,} sq ft {tag}" if rec['sqft'] else '- Living area: not in the record.')
        facts.append(f"- Bedrooms: {rec['beds']} {tag}" if rec['beds'] else '- Bedrooms: not in the record.')
        if rec['use_type']:
            facts.append(f"- Use: {rec['use_type']}" + (f" ({rec['use_code']})" if rec['state'] == 'NJ' and rec['use_code'] else '') + f' {tag}')
        if rec['block_lot']:
            facts.append(f"- Block and lot: {rec['block_lot'].replace('/', ' / ')} {tag}")
        elif rec['parcel_id']:
            facts.append(f"- County parcel number: {rec['parcel_id']} {tag}")
        new_build = bool(rec['new_construction'])
        if new_build:
            facts.append('- Likely a new build: built in the sale year or the year before, or sold by a builder [inferred].')
    else:
        title = f"{parcel.get('PROP_LOC')}, {str(parcel.get('MUN_NAME') or '').title()}, {str(parcel.get('COUNTY') or '').title()} County NJ"
        pco = str(parcel.get('COUNTY') or '').title()
        through_co = pco if ('NJ', pco) in _counties('NJ') else None
        first, last = _through('NJ', through_co)
        facts.append(f'- No sale from {words_date(first)} through {words_date(last)} is held for this address. A later purchase is not in the data yet. '
                     'The facts below come from the state parcel list.')
    def parcel_facts(yb, tag2):
        """Fact lines from the live parcel answer. Every value is coerced before it is formatted: the payload is not ours."""
        pf = []
        ps = _parcel_source(parcel)
        ptag = f"[recorded: NJ parcels and tax list{', published ' + words_date(ps['date']) if ps['date'] else ''}]"
        if parcel.get('_parent_lot'):
            pf.append('- The parcel list has no entry for this unit; the lines below describe the parent lot.')
        pc = str(parcel.get('PROP_CLASS') or '').strip()
        if pc:
            pf.append(f"- Property class: {pc}" + (f' ({NJ_CLASS[pc]})' if pc in NJ_CLASS else '') + f' {ptag}')
        yc = _int(parcel.get('YR_CONSTR'), 1700, today.year + 1)
        if yc and not yb:
            yb, tag2 = yc, 'recorded: NJ parcels and tax list'
            pf.append(f'- Year built: {yc} {ptag}')
        elif yc and yc != yb:
            pf.append(f'- The parcel list gives year built {yc}; the sales file gives {yb}. Both are recorded; confirm on site. {ptag}')
        bd = re.sub(r'\s+', ' ', str(parcel.get('BLDG_DESC') or '')).strip()
        if bd:
            rd = _bldg_reading(bd)
            pf.append(f'- Building description (assessor shorthand): "{bd}" {ptag}' + (f'. Likely reading: {rd} [inferred]' if rd else ''))
        vals = [(n, _int(parcel.get(k), 1, 10 ** 10)) for n, k in (('land', 'LAND_VAL'), ('improvements', 'IMPRVT_VAL'), ('net', 'NET_VALUE'))]
        if any(v for _, v in vals):
            pf.append('- Assessed value: ' + ', '.join(f'{n} {money(v)}' for n, v in vals if v) + f' {ptag}')
        elif rec and rec['year_built']:
            pf.append(f'- The parcel list shows no improvement value yet, so it is behind the sale record for this address {ptag}')
        ld, ac = str(parcel.get('LAND_DESC') or '').strip(), _num(parcel.get('CALC_ACRE'))
        if ld or ac > 0:
            pf.append('- Lot: ' + ', '.join(x for x in (ld, f'{ac:.2f} acres (computed)' if ac > 0 else '') if x) + f' {ptag}')
        if _int(parcel.get('DWELL'), 1, 500):
            pf.append(f"- Dwelling units on the parcel: {_int(parcel.get('DWELL'), 1, 500)} {ptag}")
        if not rec:
            dd = _mod4_deed(parcel.get('DEED_DATE'), today)
            if dd:
                pf.append(f"- Last deed in the tax list: {words_date(dd)}" + (f", {money(_int(parcel.get('SALE_PRICE'), 1000, 10 ** 10))}" if _int(parcel.get('SALE_PRICE'), 1000, 10 ** 10) else '')
                             + f' {ptag}. The tax list can trail the latest sale.')
            if block and lot:
                pf.append(f"- Block and lot: {block} / {lot}" + (f" {parcel.get('PCLQCODE')}" if parcel.get('PCLQCODE') else '') + f' {ptag}')
        return pf, yb, tag2, ps

    if parcel:
        try:
            pf, year_built, yb_tag, ps = parcel_facts(year_built, yb_tag)
            sources.append(ps)
            facts += pf
        except Exception:                                        # an odd value in the answer must not cost the rest of the brief
            facts.append('- New Jersey parcel list: the answer could not be read, so it could not be checked just now.')
    elif state == 'NJ':
        facts.append('- New Jersey parcel list: ' + ('no entry for this block and lot.' if parcel_ok else 'could not be checked just now (the service did not answer in time).'
                                                    if LIVE_ON else 'live lookups are switched off.'))
    if year_built:
        age = today.year - year_built
        facts.append(f'- Age: about {age} years [inferred from year built]' if age >= 1 else '- Age: built this year [inferred from year built]')

    P = []
    if state == 'NJ':
        if permit_ok:
            sources.append({'title': 'NJ Construction Permit Data', 'url': PERMITS_PAGE, 'publisher': 'NJ Department of Community Affairs',
                            'date': today.isoformat(), 'kind': 'data'})
            ptag = '[recorded: NJ Construction Permit Data]'
            if permits:
                show = 3 if qual else 6
                P.append(f'- {len(permits)}{" or more" if len(permits) >= 60 else ""} permit record{"s" if len(permits) != 1 else ""} for this block and lot {ptag}:')
                for p in permits[:show]:
                    fees = ', '.join(f"{n} fee {money(p['fees'][k])}" for n, k in (('building', 'buildfee'), ('plumbing', 'plumbfee'), ('electrical', 'electfee'),
                                                                                  ('fire', 'firefee'), ('other', 'otherfee')) if k in p['fees']) or 'no trade fee listed'
                    P.append(f"  - {words_date(p['date'])}: {p['type'].lower()}; {fees}" + (f"; stated cost {money(p['cost'])}" if p['cost'] > 1 else '')
                             + (f"; certificate {words_date(p['cert'])}" if p['cert'] else '; no certificate date recorded') + (' (update record)' if p['update'] else ''))
                if len(permits) > show:
                    P.append(f'  - and {len(permits) - show}{" or more" if len(permits) >= 60 else ""} older records.')
                tr = sorted({t for p in permits for t in p['trades']})
                P.append('- Trades read from the fee columns: ' + (', '.join(tr) if tr else 'none') + ' [inferred]. '
                         + ('An "other" fee appears; that column holds mechanical fees, so it may mean heating or cooling work [inferred].'
                            if any(p['other'] for p in permits) else 'No "other" fee appears, so there is no sign of mechanical work in the feed [inferred].'))
            elif reports is False:
                P.append(f'- This municipality does not report to the state permit feed: the feed holds no permit for the whole town {ptag}. '
                         'Permit history here is unknown.')
            else:
                P.append(f'- No permit matched this block and lot as written {ptag}.'
                         + ('' if reports else ' Whether this municipality reports to the feed could not be checked.'))
            P.append('- The feed keeps about five years, has no address and no description of the work, and some towns do not report.')
            if qual:
                P.append('- This is a unit in a shared lot. Permits are filed by block and lot, so they may belong to another unit or the association.')
        else:
            P.append('- The state permit feed ' + ('could not be checked just now (it did not answer in time).' if LIVE_ON and block and lot
                                                   else 'was not checked: no block and lot is known for this address.' if LIVE_ON else 'was not checked: live lookups are switched off.'))
    else:
        P.append('- Pennsylvania has no public permit feed. Permit history for this address is not in any record used here.')

    offers = _offers(year_built, yb_tag, sale_date, new_build, state, permits, permit_ok, today, bool(rec['market']) if rec else True, bool(qual), reports)
    C = ['- Read the data plates: water heater, furnace or air handler, outdoor unit. The plate gives the make and the year. No record holds these.',
         '- Ask the caller where the main water shut-off, the panel and the water heater are. No record shows where they are.',
         '- Panel: note the brand, the amps and whether there are open slots.',
         '- Supply and drain pipes: note the material where it is visible.']
    last_held = _through(state, through_co)[1] if state in STATES else ''
    if rec:
        C.append('- Ask whether the caller bought the home in the sale above. A later sale would not be in the data yet.')
        C.append('- Ask for the home inspection report from the purchase and what the seller disclosed or replaced.')
    elif last_held:
        C.append(f'- Ask the caller when they bought the home. A purchase after {words_date(last_held)} is not in the data yet.')
    if any(not p['cert'] for p in permits):
        C.append('- A permit above has no certificate date in the feed. Ask whether that work was finished and signed off.')
    if year_built is None:
        C.append('- Ask the age of the home: the record does not give it.')

    L = [f'PROPERTY BRIEF: {title}', 'Each fact is tagged recorded (with its source) or inferred.']
    if state in STATES and _window_note(state, through_co):
        L.append(_window_note(state, through_co))
    if area_note:
        L.append(area_note)
    if how == 'prefix' and rec:
        L.append(f'Matched on the start of the recorded address ("{rec["addr"]}").')
    L += ['', 'What the records say'] + facts + ['', 'Permits'] + P + ['', 'What to check on arrival'] + C + ['', 'Possible offers (leads, not findings)']
    for i, (offer, ev) in enumerate(offers, 1):
        L.append(f'{i}. {offer} Evidence: {ev}')
    if not offers:
        L.append('None: the record gives no basis for a lead.')
    L += ['', 'Limits', '- No permit on record is not proof that no work was done. Work is often done without a permit, or before the feed begins.',
          '- Not in any record: where the pipes, panel or water heater are, the make or age of any equipment, and the condition of the house.',
          '- Owner names are not held and are never shown.']
    return _cap('\n'.join(L)), sources


run_property_brief.last_timing = {}


def _parcel_source(parcel):
    pb = parcel.get('PCL_PBDATE')
    date = ''
    try:
        if pb:
            date = datetime.datetime.fromtimestamp(float(pb) / 1000, datetime.timezone.utc).date().isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        date = ''
    return {'title': 'New Jersey parcels and tax list', 'url': PARCELS_URL, 'publisher': 'NJ Office of GIS', 'date': date, 'kind': 'data'}


# ---------------------------------------------------------------- tool schemas

def tool_definitions():
    cov = (info().get('coverage') or {}).get('state') or {}
    through = '; '.join(f"{STATES[s]} newest full month {words_month(c['dense_month'])}" for s, c in cov.items() if c.get('dense_month'))
    counties = '; '.join(f"{STATES[s]}: {', '.join(c for ss, c in _counties(s))}" for s in STATES) if ready() else ''
    return [
        {
            'name': 'new_homeowners',
            'description': (
                'List recent home buyers in the Punctual Pros service area for the new-homeowner promotion. Reads public home-sales records '
                f'({counties}). Returns totals by county and municipality, a ranked list of addresses (oldest homes first, since older homes are more '
                'likely to need plumbing, heating, cooling and electrical work), the data-through date and the source lag. '
                f'The records run behind today ({through}). Never describe the result as this month\'s sales: say which month it covers. '
                'Owner names are not held and are never returned; mail is addressed to "New homeowner". Use it for questions such as '
                '"who should get our new-homeowner promotion this month" or "new buyers in Toms River".'),
            'input_schema': {
                'type': 'object',
                'properties': {
                    'state': {'type': 'string', 'enum': ['NJ', 'PA'], 'description': 'Optional. Leave out for the whole territory.'},
                    'county': {'type': 'string', 'description': 'Optional county name, for example "Ocean" or "Lancaster".'},
                    'municipality': {'type': 'string', 'description': 'Optional township, borough or city name as the county records it, for example "Toms River" or "Manheim Township".'},
                    'zip': {'type': 'string', 'description': 'Optional five-digit ZIP code. Some counties do not publish ZIP codes.'},
                    'period': {'type': 'string', 'description': '"latest" (default: the newest full month in the data) or a month as "YYYY-MM". A month name with the year, such as "October 2026", is also read.'},
                    'since': {'type': 'string', 'description': 'Optional start date "YYYY-MM-DD". With since or until, period is ignored.'},
                    'until': {'type': 'string', 'description': 'Optional end date "YYYY-MM-DD".'},
                    'limit': {'type': 'integer', 'minimum': 1, 'maximum': MAX_LIMIT, 'description': f'Rows in the ranked list. Default {DEFAULT_LIMIT}.'},
                    'exclude_new_construction': {'type': 'boolean', 'description': 'Leave out likely new builds.'},
                    'min_year_built': {'type': 'integer', 'description': 'Optional. Only homes built in or after this year.'},
                    'max_year_built': {'type': 'integer', 'description': 'Optional. Only homes built in or before this year.'},
                },
                'required': [],
            },
        },
        {
            'name': 'property_brief',
            'description': (
                'Brief a technician or call-taker on one address in the Punctual Pros service area. Looks up the last recorded sale (date, price, '
                'year built, living area, bedrooms, block and lot). For New Jersey it also checks the state parcel list and the state construction '
                'permit feed live. Pennsylvania has no public permit feed, so a Pennsylvania brief uses the sale record only. Returns facts each '
'tagged recorded or inferred, the date the sales data reaches (a later purchase is not in it), what to check on arrival, and '
                'possible offers as leads with their evidence. For a condo or apartment, put the unit in the address. It never gives owner '
                'names, and it cannot say where pipes, the panel or the water heater are: no record holds that. Use it for questions such as '
                '"I got a call from 317 Barcelona Drive in Toms River: what do we know and what can we offer".'),
            'input_schema': {
                'type': 'object',
                'properties': {
                    'address': {'type': 'string', 'description': 'House number and street, with the unit if there is one, for example "317 Barcelona Drive" or "4901 Harbor Beach Blvd Unit A7".'},
                    'municipality': {'type': 'string', 'description': 'Township, borough or city, if known.'},
                    'county': {'type': 'string', 'description': 'County, if known.'},
                    'state': {'type': 'string', 'enum': ['NJ', 'PA'], 'description': 'State, if known.'},
                    'zip': {'type': 'string', 'description': 'Five-digit ZIP code, if known.'},
                },
                'required': ['address'],
            },
        },
    ]
