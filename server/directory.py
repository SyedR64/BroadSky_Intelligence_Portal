"""
One assistant tool for BSP Desk: find_businesses, a search over every business in the six SBA loan segments (about 145,000).

Data: data/ppp/directory/businesses.sqlite.gz, built by scripts/build_business_directory.py and served by the SITE, not
bundled with this backend (it would add about 24 MB to every deployment). On first use the backend downloads the small
index.json next to it (byte count and sha256 of the gz), downloads the gz, checks both, unzips it into the temp folder, opens
it read-only and keeps it open for the life of the process. Every step runs against one deadline; on failure the tool says
"The business directory is unavailable right now" and the next attempt waits RETRY_AFTER seconds. /health never downloads.

Environment:
  DIRECTORY_URL       the gz URL (default the site's copy); "off" switches the tool off. A plain path or file:// URL is read
                      from disk.
  DIRECTORY_PATH      a local .sqlite or .sqlite.gz to use instead of downloading (tests and local runs).
  DIRECTORY_TIMEOUT   seconds for the whole first load (default 45).
  DIRECTORY_TMP       folder for the unzipped database (default the system temp folder).

Public interface (the same shape as property.py):
  enabled() -> bool                 configured (says nothing about whether it has loaded)
  status() -> dict                  for /health and /stats; never triggers a download
  ready() -> bool                   loads on first call
  reset()                           close and forget (tests)
  tool_definitions() -> [dict]
  run_find_businesses(args) -> (text, sources)

Standard library only. Author: Syed Rahman.
"""

import datetime
import gzip
import hashlib
import json
import os
import re
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

SITE = 'https://broadsky-agent.vercel.app/'
DEFAULT_URL = SITE + 'data/ppp/directory/businesses.sqlite.gz'
SCREEN_URL = SITE + 'app.html#/ma/screen'
RECORDS_URL = SITE + 'app.html#/ma/loans'
MAX_GZ_BYTES = 150_000_000
MAX_RAW_BYTES = 450_000_000      # Vercel's /tmp holds 512 MB
RETRY_AFTER = 60.0
MAX_CHARS = 11000
DEFAULT_LIMIT, MAX_LIMIT = 25, 100

SEGMENTS = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}
SEG_WORDS = {'punctual pros': 'pp', 'punctual': 'pp', 'commonwealth electrical technologies': 'cet', 'commonwealth': 'cet',
             'frontline': 'fl', 'frontline managed services': 'fl', 'thomas scientific': 'ts', 'thomas': 'ts', 'bully pulpit': 'bpi',
             'bully pulpit international': 'bpi', 'fair harbor': 'fh'}
SEG_TRADE = {'pp': 'residential HVAC, plumbing and electrical contractors near Lancaster PA and Toms River NJ',
             'cet': 'New England electrical and water and sewer contractors', 'fl': 'IT services firms, nationwide',
             'ts': 'lab, scientific and chemical supply distributors, nationwide', 'bpi': 'public relations and opinion research firms, nationwide',
             'fh': 'apparel makers and clothing wholesalers, nationwide'}
STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut',
    'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana',
    'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
    'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands', 'AS': 'American Samoa', 'MP': 'Northern Mariana Islands',
}
STATE_BY_NAME = {v.upper(): k for k, v in STATES.items()}
SORTS = {'jobs': 'jobs_latest IS NULL, jobs_latest DESC, name', 'revenue': 'revenue_est_usd IS NULL, revenue_est_usd DESC, name',
         'distance': 'dist_hub_mi IS NULL, dist_hub_mi ASC, name', 'name': 'name COLLATE NOCASE ASC'}
STOP = {'and', 'or', 'the', 'of', 'in', 'a', 'an', 'for', 'with', 'companies', 'company', 'firm', 'firms', 'business', 'businesses'}
# Trade words -> NAICS prefixes. The directory's trade labels are fixed NAICS labels, so a raw substring match misses
# plurals ("plumbers") and catches two-letter words inside others ("it" in "knitting"). Patterns are whole words, tried in
# order, and each match is removed before the next pattern runs (so "sewer" is not read as "sew").
TRADE_CODES = [
    (r'water (and )?sewer( line)?s?|sewers?|sewage|water ?(lines?|mains?)|utility contractors?|underground utilit(y|ies)', ('237110',)),
    (r'hvac|heating|cooling|air ?condition\w*|plumb\w*|mechanical|boilers?|furnaces?|refrigeration|pipefitt\w*|heat pumps?', ('238220',)),
    (r'electric\w*|wiring', ('238210',)),
    (r'it|information technology|computers?|computing|managed services?|managed service providers?|msps?|software|'
     r'cyber ?security|cloud|tech support', ('5415',)),
    (r'pr|public relations|publicity|media relations', ('541820',)),
    (r'market research|opinion research|polling|polls?|pollsters?|research', ('541910',)),
    (r'medical', ('423450',)),
    (r'chemicals?', ('424690',)),
    (r'labs?|laborator(y|ies)', ('423450', '423490', '424690')),
    (r'scientific|science', ('423490',)),
    (r'(clothing|apparel|garment) wholesal\w*', ('424350',)),
    (r'apparel|cloth(es|ing)|garments?|fashion|knit\w*|hosiery|socks|sewing|cut and sew|textiles?|uniforms?', ('315', '424350')),
]
TRADE_FILLER = STOP | {'supply', 'supplies', 'supplier', 'suppliers', 'distributor', 'distributors', 'distribution', 'contractor',
                       'contractors', 'contracting', 'service', 'services', 'shop', 'shops', 'maker', 'makers', 'manufacturer',
                       'manufacturers', 'manufacturing', 'wholesaler', 'wholesalers', 'wholesale', 'provider', 'providers', 'agency',
                       'agencies', 'installer', 'installers', 'installation', 'repair', 'repairs', 'trade', 'trades', 'work', 'equipment',
                       'industry', 'sector', 'commercial', 'residential'}
TRADE_EXAMPLES = '"plumbing", "electrical", "IT", "public relations", "lab supply" or "apparel"'
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
# ownership filter words -> (ownership codes, words for the answer). The ownership column holds the merged call (SBA screen,
# hand-built list, company website read by AI, loan record), so the filter works on databases built before the website research.
OWNERSHIP_FILTERS = {
    'founder': (('founder',), 'founder-run'), 'family': (('family',), 'family-owned'),
    'founder_family': (('founder', 'family'), 'founder-run or family-owned'), 'pe': (('pe',), 'PE-backed or acquired'),
    'employee': (('esop', 'private_independent'), 'employee- or partner-owned'), 'franchise': (('franchisee',), 'franchise unit'),
    'unknown': (('unknown', 'unverified'), 'unknown'),
}
OWNERSHIP_EXAMPLES = '"founder-run", "family-owned", "founder-or-family", "PE-backed", "employee-owned", "franchise" or "unknown"'
SOURCE_SITE = {'title': 'Overture Maps Places (business websites)',
               'url': 'https://overturemaps.org/', 'publisher': 'Overture Maps Foundation', 'date': '2026-10-21', 'kind': 'data'}


def _env(name, default=''):
    return (os.environ.get(name) or default).strip()


def _url():
    return _env('DIRECTORY_URL', DEFAULT_URL)


def enabled():
    """True when a source is configured; the tool is offered even before the first download."""
    if _env('DIRECTORY_PATH'):
        return True
    return _url().lower() not in ('off', '0', 'false', 'no', '')


# ---------------------------------------------------------------- loading

_lock = threading.Lock()      # one loader at a time
_qlock = threading.Lock()     # one query at a time on the shared connection
_state = {'con': None, 'meta': None, 'error': None, 'error_at': 0.0, 'timings': None, 'source': None, 'path': None, 'counties': None,
          'cols': None}


def _today():
    return datetime.date.today()


class Unavailable(Exception):
    pass


def _remaining(deadline):
    left = deadline - time.monotonic()
    if left <= 0:
        raise Unavailable('the download ran past its time limit')
    return left


def _local_path(url):
    if url.startswith('file://'):
        return urllib.parse.unquote(urllib.parse.urlparse(url).path)
    if not re.match(r'^[a-z][a-z0-9+.-]*://', url, re.I):
        return url
    return None


def _get(url, dest, deadline, max_bytes):
    """Stream url to dest within the deadline. Returns (bytes, sha256 hex). Checks the Content-Length when the server sends one."""
    req = urllib.request.Request(url, headers={'User-Agent': 'bsp-desk-backend', 'Cache-Control': 'no-cache'})
    h, n = hashlib.sha256(), 0
    with urllib.request.urlopen(req, timeout=min(20.0, _remaining(deadline))) as r:
        if r.status != 200:
            raise Unavailable(f'the site answered {r.status}')
        total = int(r.headers.get('Content-Length') or 0)
        if total > max_bytes:
            raise Unavailable(f'the file is larger than expected ({total:,} bytes)')
        with open(dest, 'wb') as f:
            while True:
                _remaining(deadline)
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                n += len(chunk)
                if n > max_bytes:
                    raise Unavailable('the file is larger than expected')
                h.update(chunk)
                f.write(chunk)
    if total and n != total:
        raise Unavailable(f'the download stopped early ({n:,} of {total:,} bytes)')
    return n, h.hexdigest()


def _manifest(url, deadline):
    """index.json next to the gz: {sqlite: {bytes, raw_bytes, sha256, built_at}}. None when it cannot be read."""
    iu = _env('DIRECTORY_INDEX_URL') or url.rsplit('/', 1)[0] + '/index.json'
    try:
        local = _local_path(iu)
        if local:
            j = json.load(open(local, encoding='utf-8'))
        else:
            req = urllib.request.Request(iu, headers={'User-Agent': 'bsp-desk-backend', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=min(10.0, _remaining(deadline))) as r:
                j = json.loads(r.read(2_000_000).decode('utf-8'))
        s = j.get('sqlite') or {}
        return s if s.get('bytes') and s.get('sha256') else None
    except Unavailable:
        raise
    except Exception:
        return None


def _gunzip(src, dest, deadline):
    n = 0
    with gzip.open(src, 'rb') as fi, open(dest, 'wb') as fo:
        while True:
            _remaining(deadline)
            chunk = fi.read(4 << 20)
            if not chunk:
                break
            n += len(chunk)
            if n > MAX_RAW_BYTES:
                raise Unavailable('the unzipped database is larger than expected')
            fo.write(chunk)
    return n


def _open(path):
    con = sqlite3.connect(f'file:{path}?mode=ro&immutable=1', uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row
    meta = {}
    for k, v in con.execute('SELECT k, v FROM meta'):
        try:
            meta[k] = json.loads(v)
        except ValueError:
            meta[k] = v
    n = con.execute('SELECT COUNT(*) FROM businesses').fetchone()[0]
    if meta.get('rows') is not None and n != meta['rows']:
        con.close()
        raise Unavailable('the database is incomplete')
    con.execute("SELECT rowid FROM biz_fts WHERE biz_fts MATCH 'a*' LIMIT 1").fetchall()   # FTS5 present and readable
    meta['rows'] = n
    return con, meta


def _load():
    """Download (or read), verify, unzip and open. Runs under _lock. Records timings."""
    t0 = time.monotonic()
    deadline = t0 + float(_env('DIRECTORY_TIMEOUT', '45') or 45)
    tm = {}
    tmp = _env('DIRECTORY_TMP') or os.path.join(tempfile.gettempdir(), 'bsp-directory')
    os.makedirs(tmp, exist_ok=True)
    src = _env('DIRECTORY_PATH') or _url()
    local = _local_path(src)
    man = None
    if local:
        if not os.path.exists(local):
            raise Unavailable('the local directory file is missing')
        gz_path, source = local, 'file'
    else:
        man = _manifest(src, deadline)
        tm['manifest_s'] = round(time.monotonic() - t0, 3)
        raw = os.path.join(tmp, f"businesses-{man['sha256'][:16]}.sqlite") if man else None
        if raw and os.path.exists(raw) and (not man.get('raw_bytes') or os.path.getsize(raw) == man['raw_bytes']):
            t1 = time.monotonic()   # an earlier process on this instance already unzipped this exact build
            con, meta = _open(raw)
            tm['open_s'] = round(time.monotonic() - t1, 3)
            tm['total_s'] = round(time.monotonic() - t0, 3)
            return con, meta, tm, 'cache', raw
        gz_path, source = os.path.join(tmp, 'businesses.sqlite.gz.part'), 'download'
        t1 = time.monotonic()
        n, sha = _get(src, gz_path, deadline, MAX_GZ_BYTES)
        tm['download_s'], tm['download_bytes'] = round(time.monotonic() - t1, 3), n
        if man and (n != man['bytes'] or sha != man['sha256']):
            os.remove(gz_path)
            raise Unavailable('the downloaded file does not match its index (size or checksum)')
    t1 = time.monotonic()
    with open(gz_path, 'rb') as f:
        head = f.read(16)
    if head[:2] == b'\x1f\x8b':
        raw = os.path.join(tmp, f"businesses-{man['sha256'][:16]}.sqlite" if man else 'businesses.sqlite')
        part = raw + '.part'
        try:
            n = _gunzip(gz_path, part, deadline)
        except (OSError, EOFError) as e:
            raise Unavailable(f'the file is not a complete gzip ({type(e).__name__})')
        if man and man.get('raw_bytes') and n != man['raw_bytes']:
            os.remove(part)
            raise Unavailable('the unzipped database has the wrong size')
        os.replace(part, raw)
        tm['gunzip_s'], tm['raw_bytes'] = round(time.monotonic() - t1, 3), n
    elif head.startswith(b'SQLite format 3'):
        raw = gz_path   # a plain .sqlite (local runs)
    else:
        raise Unavailable('the file is neither gzip nor SQLite')
    if source == 'download':
        with _ignore():
            os.remove(gz_path)   # keep /tmp small: only the unzipped copy stays
    t2 = time.monotonic()
    con, meta = _open(raw)
    tm['open_s'] = round(time.monotonic() - t2, 3)
    tm['total_s'] = round(time.monotonic() - t0, 3)
    return con, meta, tm, source, raw


class _ignore:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return True


def ready():
    """Load on first use; True when the database is open. A failure is remembered for RETRY_AFTER seconds."""
    if _state['con'] is not None:
        return True
    if not enabled():
        return False
    if _state['error'] and time.monotonic() - _state['error_at'] < RETRY_AFTER:
        return False
    timeout = float(_env('DIRECTORY_TIMEOUT', '45') or 45)
    if not _lock.acquire(timeout=timeout + 5):
        return False
    try:
        if _state['con'] is not None:
            return True
        if _state['error'] and time.monotonic() - _state['error_at'] < RETRY_AFTER:
            return False   # a caller that held the lock while we waited has just failed: keep the back-off
        try:
            con, meta, tm, source, path = _load()
        except Exception as e:   # network, disk, gzip or SQLite trouble: say what failed, never the stack
            _state.update(error=_why(e), error_at=time.monotonic())
            return False
        _state.update(con=con, meta=meta, timings=tm, source=source, path=path, error=None, error_at=0.0)
        return True
    finally:
        _lock.release()


def _why(e):
    if isinstance(e, Unavailable):
        return str(e)
    if isinstance(e, urllib.error.HTTPError):
        return f'the site answered {e.code}'
    if isinstance(e, (urllib.error.URLError, OSError)) and 'timed out' in str(e).lower():
        return 'the download timed out'
    if isinstance(e, urllib.error.URLError):
        return 'the site could not be reached'
    if isinstance(e, sqlite3.Error):
        return 'the database could not be opened'
    return type(e).__name__


def status():
    """For /health and /stats. Never loads anything."""
    m = _state['meta'] or {}
    out = {'enabled': enabled(), 'loaded': _state['con'] is not None, 'rows': m.get('rows'), 'built_at': m.get('built_at'),
           'rows_by_segment': m.get('rows_by_segment')}
    if _state['con'] is not None:
        out['source'] = _state['source']
        out['timings'] = _state['timings']
    if _state['error']:
        out['error'] = _state['error']
    return out


def info():
    return status()


def reset():
    with _lock:
        if _state['con'] is not None:
            with _ignore():
                _state['con'].close()
        _state.update(con=None, meta=None, error=None, error_at=0.0, timings=None, source=None, path=None, counties=None, cols=None)


def _q(sql, params=()):
    with _qlock:
        return _state['con'].execute(sql, params).fetchall()


def _cols():
    """The businesses table's columns. A database built before the website research has no website or web_* columns."""
    if _state.get('cols') is None:
        _state['cols'] = frozenset(r['name'] for r in _q('PRAGMA table_info(businesses)'))
    return _state['cols']


def _g(r, k):
    """A row's value, or None when this database has no such column."""
    return r[k] if k in r.keys() else None


# ---------------------------------------------------------------- arguments

def _flat(args):
    a = dict(args or {})
    for k in ('area', 'filters', 'place'):
        if isinstance(a.get(k), dict):
            for kk, vv in a.pop(k).items():
                a.setdefault(kk, vv)
    return a


def _list(v):
    if v is None or v == '':
        return []
    if isinstance(v, (list, tuple)):
        return [x for x in v if x not in (None, '')]
    return [x.strip() for x in str(v).split(',') if x.strip()]


def _segments(v):
    out = []
    for x in _list(v):
        s = re.sub(r'[^a-z ]', ' ', str(x).lower()).strip()
        s = re.sub(r'\s+', ' ', s)
        code = s if s in SEGMENTS else SEG_WORDS.get(s)
        if code and code not in out:
            out.append(code)
    return out


def _state_code(v):
    s = re.sub(r'[^A-Za-z ]', ' ', str(v or '')).strip().upper()
    s = re.sub(r'\s+', ' ', s)
    if s in STATES:
        return s
    return STATE_BY_NAME.get(s)


def _int(v, lo=None, hi=None):
    try:
        n = int(float(str(v).replace(',', '').replace('$', '').strip()))
    except (TypeError, ValueError):
        return None
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def _money_arg(v):
    """2000000, "2M", "$2.5 million", "750k" -> dollars."""
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.match(r'^\$?\s*([\d.,]+)\s*(k|thousand|m|mm|million|b|billion)?\b', str(v).strip().lower())
    if not m:
        return None
    try:
        n = float(m.group(1).replace(',', ''))
    except ValueError:
        return None
    mult = {'k': 1e3, 'thousand': 1e3, 'm': 1e6, 'mm': 1e6, 'million': 1e6, 'b': 1e9, 'billion': 1e9}.get(m.group(2) or '', 1)
    return n * mult


def _words(v, n=8):
    toks = [t.lower() for t in re.findall(r'[A-Za-z0-9]+', str(v or ''))]
    return [t for t in toks if t not in STOP][:n]


def _fts(words):
    return ' '.join(f'"{w}"*' for w in words)


def _stem(w):
    """A light stem for prefix matching: roofers -> roof, painting -> paint, electricians -> electric, signs -> sign."""
    for suf, keep in (('ians', 4), ('ian', 4), ('ers', 4), ('ing', 4), ('er', 4), ('es', 4), ('s', 3)):
        if w.endswith(suf) and len(w) - len(suf) >= keep and not w.endswith('ss'):
            return w[:-len(suf)]
    return w


def _trade(v):
    """Trade words -> (NAICS prefixes, words those came from, other words to match as word prefixes, notes)."""
    text = re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', str(v or '').lower())).strip()
    codes, hit = [], []
    for pat, cc in TRADE_CODES:
        rx = re.compile(r'\b(?:' + pat + r')\b')
        for m in rx.finditer(text):
            hit.append(m.group(0))
            codes += [c for c in cc if c not in codes]
        text = rx.sub(' ', text)
    rest = [w for w in text.split() if w not in TRADE_FILLER][:6]
    notes = []
    if codes:
        if rest:
            notes.append(f'Trade words not used: {" ".join(rest)}. Trade matches industry labels; use query or name for other words.')
        return codes, hit, [], notes
    words = []
    for w in rest:
        if len(w) < 3:
            notes.append(f'Trade word "{w}" is too short to match on its own. Try {TRADE_EXAMPLES}, a NAICS code or a segment.')
        else:
            words.append(_stem(w))
    return [], [], words, notes


def _ownership(v):
    """Ownership filter words -> (keys of OWNERSHIP_FILTERS, words not understood). "founder-run, family-owned", "founder or
    family", "PE backed", "ESOP" and "franchisee" are all read."""
    keys, bad = [], []
    for x in _list(v):
        s = re.sub(r'\s+', ' ', re.sub(r'[^a-z]+', ' ', str(x).lower())).strip()
        if ('founder' in s or 'owner run' in s) and 'family' in s:
            k = 'founder_family'
        elif 'founder' in s or 'owner operated' in s or 'owner run' in s:
            k = 'founder'
        elif 'family' in s:
            k = 'family'
        elif re.search(r'\b(pe|private equity|backed|sponsor|acquired|sold)\b', s):
            k = 'pe'
        elif re.search(r'\b(employee|esop|partner|partners)\b', s):
            k = 'employee'
        elif 'franchis' in s:
            k = 'franchise'
        elif re.search(r'\b(unknown|not known|unclear|unverified)\b', s):
            k = 'unknown'
        else:
            bad.append(_echo(x))
            continue
        if k not in keys:
            keys.append(k)
    return keys, bad


def county_key(v):
    """A county name without case, spaces or punctuation, Saint/Sainte read as St/Ste: "Prince George's" and "Prince Georges",
    "St. Louis" and "Saint Louis", "DeKalb" and "De Kalb" agree."""
    s = re.sub(r'\bsainte\b', 'ste', re.sub(r'\bsaint\b', 'st', str(v or '').lower()))
    return re.sub(r'[^a-z0-9]', '', s)


def _county_names():
    """{county_key: [county names as the loan records spell them]}, built once per loaded database."""
    if _state.get('counties') is None:
        out = {}
        for r in _q('SELECT DISTINCT county FROM businesses WHERE county IS NOT NULL'):
            out.setdefault(county_key(r['county']), []).append(r['county'])
        _state['counties'] = out
    return _state['counties']


def _echo(v, n=40):
    return re.sub(r'\s+', ' ', re.sub(r"[^A-Za-z0-9 .,&'/-]", ' ', str(v or ''))).strip()[:n]


def _where(a, today):
    """(SQL WHERE text, params, applied filters in words, notes)."""
    w, p, said, notes = [], [], [], []
    segs = _segments(a.get('segment') or a.get('segments') or a.get('company'))
    if segs:
        w.append(f"segment IN ({','.join('?' * len(segs))})")
        p += segs
        said.append('segment ' + ', '.join(SEGMENTS[s] for s in segs))
    q = _words(a.get('query') or a.get('keyword') or a.get('keywords'))
    if q:
        w.append('rid IN (SELECT rowid FROM biz_fts WHERE biz_fts MATCH ?)')
        p.append(_fts(q))
        said.append('keyword ' + ' '.join(q))
    nm = _words(a.get('name') or a.get('name_contains'))
    if nm:
        w.append('rid IN (SELECT rowid FROM biz_fts WHERE biz_fts MATCH ?)')
        p.append('{name dba} : (' + _fts(nm) + ')')
        said.append('name contains ' + ' '.join(nm))
    states = []
    for x in _list(a.get('state') or a.get('states')):
        c = _state_code(x)
        if c and c not in states:
            states.append(c)
        elif not c:
            notes.append(f'State "{_echo(x)}" was not recognised and was ignored.')
    if states:
        w.append(f"state IN ({','.join('?' * len(states))})")
        p += states
        said.append('state ' + ', '.join(states))
    county = re.sub(r'\s+(county|parish|borough)$', '', _echo(a.get('county')), flags=re.I).strip()
    if county and county_key(county):
        names = _county_names().get(county_key(county)) or [county]
        w.append(f"county IN ({','.join('?' * len(names))})")   # exact names, so the county index is used
        p += names
        said.append(f'{county} County')
    city = _echo(a.get('city') or a.get('town') or a.get('municipality'))
    if city:
        w.append('city = ? COLLATE NOCASE')
        p.append(city)
        said.append(f'city {city}')
    zips = [re.sub(r'\D', '', str(z)) for z in _list(a.get('zip') or a.get('zips'))]
    zips = [z for z in zips if len(z) in (3, 5)]
    if zips:
        w.append('(' + ' OR '.join('zip = ?' if len(z) == 5 else 'zip LIKE ?' for z in zips) + ')')
        p += [z if len(z) == 5 else z + '%' for z in zips]
        said.append('ZIP ' + ', '.join(zips))
    naics = [re.sub(r'\D', '', str(x)) for x in _list(a.get('naics'))]
    naics = [x for x in naics if 2 <= len(x) <= 6]
    if naics:
        w.append('(' + ' OR '.join('naics LIKE ?' for _ in naics) + ')')
        p += [x + '%' for x in naics]
        said.append('NAICS ' + ', '.join(naics))
    codes, hit, tw, tnotes = _trade(a.get('trade'))
    notes += tnotes
    if codes:
        w.append('(' + ' OR '.join('naics LIKE ?' for _ in codes) + ')')
        p += [c + '%' for c in codes]
        said.append(f"trade {' '.join(hit)} (NAICS {', '.join(codes)})")
    for t in tw:   # no known trade word: whole-word prefix match on the trade label, or on researched specialties
        w.append("(rid IN (SELECT rowid FROM biz_fts WHERE biz_fts MATCH ?) OR "
                 "(specialties_basis IN ('researched', 'company website, read by AI') AND "
                 "(' ' || lower(replace(replace(specialties, ';', ' '), ',', ' '))) LIKE ?))")
        p += [f'trade : "{t}"*', f'% {t}%']
    if tw:
        said.append('trade ' + ' '.join(tw))
    jmin, jmax = _int(a.get('jobs_min'), 0), _int(a.get('jobs_max'), 0)
    if jmin is not None:
        w.append('jobs_latest >= ?')
        p.append(jmin)
    if jmax is not None:
        w.append('jobs_latest <= ?')
        p.append(jmax)
    if jmin is not None or jmax is not None:
        said.append(f'jobs {jmin} to {jmax}' if jmin is not None and jmax is not None else f'{jmin} or more jobs' if jmin is not None else f'at most {jmax} jobs')
    rmin, rmax = _money_arg(a.get('revenue_min')), _money_arg(a.get('revenue_max'))
    if rmin is not None:
        w.append('revenue_est_usd >= ?')
        p.append(rmin)
    if rmax is not None:
        w.append('revenue_est_usd <= ?')
        p.append(rmax)
    if rmin is not None or rmax is not None:
        said.append(f'revenue (est.) {money(rmin)} to {money(rmax)}' if rmin is not None and rmax is not None
                    else f'revenue (est.) {money(rmin)} or more' if rmin is not None else f'revenue (est.) at most {money(rmax)}')
    miles = _int(a.get('max_miles') or a.get('max_miles_from_hub'), 0, 5000)
    if miles is not None:
        w.append('dist_hub_mi IS NOT NULL AND dist_hub_mi <= ?')
        p.append(miles)
        said.append(f'within {miles} miles of a BSP hub')
        if segs and not set(segs) & {'pp', 'cet'}:
            notes.append('Distance to a BSP hub is held only for the Punctual Pros and CET segments, so the mileage filter leaves nothing else.')
    yrs = a.get('exclude_sold_within_years')
    if yrs in (None, '') and a.get('exclude_recently_sold') in (True, 'true', 'yes', 1):
        yrs = 3
    since = a.get('exclude_sold_since')
    cut = None
    if since and re.match(r'^\d{4}(-\d{2}-\d{2})?$', str(since).strip()):
        cut = str(since).strip() if len(str(since).strip()) == 10 else str(since).strip() + '-01-01'
    elif _int(yrs, 0, 40) is not None:
        n = _int(yrs, 0, 40)
        try:
            cut = today.replace(year=today.year - n).isoformat()
        except ValueError:
            cut = (today - datetime.timedelta(days=365 * n)).isoformat()
    if cut:
        w.append('(change_of_ownership_date IS NULL OR change_of_ownership_date < ?)')
        p.append(cut)
        said.append(f'no SBA-financed change of ownership since {words_date(cut)}')
    okeys, obad = _ownership(a.get('ownership'))
    for x in obad:
        notes.append(f'Ownership "{x}" was not recognised and was ignored. Use {OWNERSHIP_EXAMPLES}.')
    if okeys:
        codes = [c for k in okeys for c in OWNERSHIP_FILTERS[k][0]]
        cond = f"ownership IN ({','.join('?' * len(codes))})"
        if 'unknown' in okeys:
            cond = f'(ownership IS NULL OR {cond})'
        w.append(cond)
        p += codes
        said.append('ownership ' + ' or '.join(OWNERSHIP_FILTERS[k][1] for k in okeys))
        if 'website' not in _cols():
            notes.append('This copy of the directory was built before the website research, so ownership is known only for '
                         'businesses on the SBA screen or a hand-built list.')
    if a.get('exclude_researched') in (True, 'true', 'yes', 1):
        w.append('on_sba_screen = 0')
        said.append('not on the SBA screen')
    if a.get('exclude_hand_built') in (True, 'true', 'yes', 1) or a.get('exclude_on_list') in (True, 'true', 'yes', 1):
        w.append('hand_built_list_id IS NULL')
        said.append('not on a hand-built list')
    return (' AND '.join(w) or '1=1'), p, said, notes


# ---------------------------------------------------------------- output

def money(v):
    if v is None:
        return ''
    v = float(v)
    if abs(v) >= 1e9:
        return f'${v / 1e9:.1f}B'
    if abs(v) >= 1e6:
        return f'${v / 1e6:.1f}M'
    if abs(v) >= 1e3:
        return f'${v / 1e3:.0f}K'
    return f'${v:,.0f}'


def words_date(iso):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(iso or ''))
    if not m:
        return ''
    try:
        d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return ''
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def _jobs_text(r):
    j = r['jobs_latest']
    if j is None:
        return 'jobs: none on record'
    src = r['jobs_latest_source'] or ''
    m = re.search(r'(\d{4})-\d{2}-\d{2}', src)
    if src.startswith('SBA'):
        prog = '504' if '504' in src[:9] else '7(a)'
        t = f"jobs {j} (SBA {prog} loan{', ' + m.group(1) if m else ''}, lender-reported"
        if m and int(m.group(1)) < 2020:
            t += ', an old figure'
        if r['jobs_ppp'] is not None:
            t += f"; PPP {r['jobs_ppp']} in 2020-21"
        return t + ')'
    return f'jobs {j} (PPP, 2020-21, borrower-reported)'


OWN_WORDS = {'founder': 'founder-run', 'family': 'family-owned', 'pe': 'PE-backed or acquired', 'private_independent': 'independent (employee- or partner-owned)',
             'franchisee': 'franchise unit', 'closed': 'closed or inactive', 'not_in_segment': 'outside the segment', 'unverified': 'not confirmed',
             'esop': 'employee-owned (ESOP)'}


def _county_words(county, state):
    if not county:
        return ''
    if state == 'DC' or re.search(r'\b(city|county|parish|borough|municipality|census area)$', county, re.I):
        return county
    return county + (' Parish' if state == 'LA' else ' County')


def _no_email(v):
    """Email addresses in a borrower's name or city are withheld from answers; the published data keeps them as filed."""
    return EMAIL.sub('[email withheld]', v) if v else v


def _revenue_kind(basis):
    b = (basis or '').lower()
    if 'stated' in b:
        return 'stated by a source'
    if b.startswith('researched'):
        return 'modelled, inputs checked on the SBA screen'   # the screen's figures come from the same Census model
    return 'modelled'


DEAL_WORDS = {'no_deal_found': 'no sale or investment found in public news',
              'unclear': 'a public news search found no sale, but no dated source confirms the current owner',
              'still_independent': 'public news shows no sale; still independent'}


# A website cue that is the reader's own note (site down, redirect, record or roll-up match), not words from the site. The
# directory build keeps these out of web_cue; this guards databases built before it did.
CUE_NOTE = re.compile(
    r"^(?:site|website|title|cues?|no (?:site|page|text|content|owner|ownership|business|company|founder|description|statement|"
    r"clear)|only (?:a|the|one|reviews?|title|footer)|home ?page|page (?:is|reads|shows|title|text|content)|the (?:site|page|"
    r"home ?page|record)|this (?:site|page)|record|roll-?up|unresolved|dead|blocked|server|connection|robots|https?|dns|bot|redirect|"
    r"parked|placeholder|error|crawl|covered|domain)\b|\b(?:pre-label|rollup_names|bot_check|customer review|redirects? to)\b", re.I)


def _quote(v, n=160):
    s = re.sub(r'\s+', ' ', _no_email(str(v or ''))).strip().replace('"', "'")
    s = re.sub(r'\b[a-z]+(?:_[a-z]+)+\b', lambda m: m.group().replace('_', ' '), s)   # no internal field names
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0] + '…'


def _web_bits(r):
    """Website, founding year, the website quote and a deal result, for databases that have them."""
    bits = []
    site = _g(r, 'website')
    if site:
        cov = _g(r, 'web_coverage')
        bits.append(f'website {_no_email(site)}' + ('' if cov in (None, 'covered') else ' (could not be read)'))
    if _g(r, 'founded'):
        bits.append(f"founded {_g(r, 'founded')} (its website)")
    cue = _g(r, 'web_cue') if _g(r, 'web_coverage') == 'covered' else None
    if cue and not CUE_NOTE.search(cue):
        bits.append(f'its website says: "{_quote(cue)}"')
    if _g(r, 'web_note') and _g(r, 'web_coverage') == 'covered':
        bits.append(f"the AI reader noted (not the site's words): {_quote(_g(r, 'web_note'))}")
    if _g(r, 'deal_status') in DEAL_WORDS:
        bits.append(DEAL_WORDS[_g(r, 'deal_status')])
    if _g(r, 'deal_status') == 'sold_or_pe_backed' and _g(r, 'deal_url'):
        bits.append(f"sale news: {_g(r, 'deal_url')}")
    elif _g(r, 'deal_status') == 'still_independent' and _g(r, 'deal_url'):
        bits.append(f"ownership news: {_g(r, 'deal_url')}")
    return bits


def _ownership_text(r):
    own = r['ownership'] or 'unknown'
    b = r['ownership_basis'] or ''
    if own in ('unknown', 'unverified') and not b.startswith('researched'):
        return f"ownership unknown ({b or 'not researched'})"
    t = f"ownership {OWN_WORDS.get(own, own)} ({_ownership_source(r)}"
    if b.startswith('company website') and _g(r, 'web_confidence') is not None:
        t += f", {round(_g(r, 'web_confidence') * 100)}% likely"
    return t + ')'


def _ownership_source(r):
    b = r['ownership_basis'] or ''
    if b.startswith('researched'):
        return 'researched'
    if b.startswith('SBA loan record') or (b == 'hand-built list' and not r['hand_built_list_id'] and r['ownership'] == 'esop'):
        return 'loan record: ESOP business type'   # set from the SBA business type, not from a list
    if b == 'hand-built list':
        return 'researched, hand-built list'   # the lists were checked against company sites and public sources
    return b


def _row_line(i, r):
    name = _no_email(r['name']) + (f" (dba {_no_email(r['dba'])})" if r['dba'] else '')
    place = ', '.join(x for x in (_no_email(r['city']), _county_words(r['county'], r['state']), f"{r['state']} {r['zip']}".strip()) if x)
    bits = [f"{i}. {name}", place, r['trade'], _jobs_text(r)]
    if r['ppp_first_draw_usd']:
        bits.append(f"PPP first draw ${r['ppp_first_draw_usd']:,.0f}")
    if r['sba_latest_date']:
        bits.append(f"latest SBA loan {r['sba_latest_program']} {words_date(r['sba_latest_date'])} ${r['sba_latest_amount_usd'] or 0:,.0f}, "
                    f"{(r['sba_latest_status'] or '').split(' (')[0]}")
    if r['change_of_ownership_date']:
        bits.append(f"SBA-financed change of ownership {words_date(r['change_of_ownership_date'])}")
    if r['dist_hub_mi'] is not None:
        bits.append(f"{r['dist_hub_mi']:g} mi from {r['nearest_hub'] or 'a BSP hub'}")
    if r['revenue_est_usd']:
        kind = _revenue_kind(r['revenue_basis'])
        if kind.startswith('stated'):
            bits.append(f"revenue {money(r['revenue_est_usd'])}, {kind}")
        else:
            rng = f" ({money(r['revenue_low_usd'])} to {money(r['revenue_high_usd'])})" if r['revenue_low_usd'] and r['revenue_high_usd'] else ''
            bits.append(f"revenue est. {money(r['revenue_est_usd'])}{rng}, {kind}, {r['revenue_confidence'] or 'unrated'} confidence")
    else:
        bits.append('revenue: no estimate')
    bits.append(_ownership_text(r))
    if r['specialties_basis'] == 'researched' and r['specialties']:
        bits.append('specialties: ' + r['specialties'])
    elif r['specialties_basis'] == 'company website, read by AI' and r['specialties']:
        bits.append('specialties (its website): ' + r['specialties'])
    bits += _web_bits(r)
    if r['franchise']:
        bits.append(f"franchise: {r['franchise']}")
    tags = []
    if r['on_sba_screen']:
        tags.append('on the SBA screen' + (f", rank {r['screen_rank']}" if r['screen_rank'] else ''))
    if r['hand_built_list_id']:
        tags.append('on a hand-built list')
    if r['pe_list_match']:
        tags.append('name matches a PE-backed company')
    if tags:
        bits.append('; '.join(tags))
    bits.append(f"id {r['id']}")
    return ' | '.join(bits)


def _cap(text, n=MAX_CHARS):
    if len(text) <= n:
        return text
    cut = text[:n - 70]
    return cut[:cut.rfind('\n')] + '\n[List trimmed to fit. Narrow the search or lower the limit.]'


def _sources(meta, any_revenue, any_site=False):
    out = [{'title': 'SBA Paycheck Protection Program loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/ppp-foia',
            'publisher': 'U.S. Small Business Administration', 'date': '2024-09-30', 'kind': 'data'},
           {'title': 'SBA 7(a) and 504 loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/7-a-504-foia',
            'publisher': 'U.S. Small Business Administration', 'date': '2026-09-30', 'kind': 'data'}]
    if any_revenue:
        out.append({'title': 'Statistics of U.S. Businesses 2022 (Census benchmarks behind the revenue model)',
                    'url': 'https://www.census.gov/data/tables/2022/econ/susb/2022-susb-annual.html', 'publisher': 'U.S. Census Bureau',
                    'date': '', 'kind': 'data'})
    if any_site:
        out.append(dict(SOURCE_SITE))
    out.append({'title': 'BSP Desk SBA loan screen (researched add-on candidates)', 'url': SCREEN_URL, 'publisher': 'BSP Desk',
                'date': (meta.get('generated') or ''), 'kind': 'page'})
    return out


def run_find_businesses(args):
    """Search the directory. Returns (text, sources)."""
    if not ready():
        why = _state['error'] or ('the tool is switched off' if not enabled() else 'it has not loaded')
        return (f'The business directory is unavailable right now ({why}). Say so plainly. Point the visitor to the SBA loan screen '
                f'({SCREEN_URL}) and the SBA loan records view ({RECORDS_URL}) on the portal, which hold the researched candidates and '
                f'the raw loans.'), []
    a = _flat(args)
    today = _today()
    where, params, said, notes = _where(a, today)
    sort = str(a.get('sort') or 'jobs').strip().lower()
    sort = {'size': 'jobs', 'employees': 'jobs', 'headcount': 'jobs', 'miles': 'distance', 'closest': 'distance', 'alphabetical': 'name'}.get(sort, sort)
    if sort not in SORTS:
        sort = 'jobs'
    limit = _int(a.get('limit'), 1, MAX_LIMIT) or DEFAULT_LIMIT
    t0 = time.monotonic()
    try:
        total = _q(f'SELECT COUNT(*) n, SUM(on_sba_screen) s, SUM(revenue_est_usd IS NOT NULL) r FROM businesses WHERE {where}', params)[0]
        order = list(SEGMENTS)
        by_seg = sorted(_q(f'SELECT segment, COUNT(*) n FROM businesses WHERE {where} GROUP BY segment', params),
                        key=lambda r: (-r['n'], order.index(r['segment']) if r['segment'] in order else 99))
        by_state = _q(f'SELECT state, COUNT(*) n FROM businesses WHERE {where} GROUP BY state ORDER BY n DESC, state LIMIT 15', params)
        n_states = _q(f'SELECT COUNT(DISTINCT state) n FROM businesses WHERE {where}', params)[0]['n']
        rows = _q(f'SELECT * FROM businesses WHERE {where} ORDER BY {SORTS[sort]} LIMIT ?', params + [limit])
    except sqlite3.OperationalError:
        return ('The search words could not be read. Try plain words for the name or keyword, without symbols.', [])
    ms = (time.monotonic() - t0) * 1000
    meta = _state['meta'] or {}
    n = total['n'] or 0
    head = [f"BUSINESS DIRECTORY: {n:,} businesses match" + (f" ({'; '.join(said)})" if said else ' (no filters: every business)') + '.']
    if n:
        head.append('By segment: ' + '; '.join(f"{SEGMENTS.get(r['segment'], r['segment'])} {r['n']:,}" for r in by_seg) + '.')
        head.append('By state: ' + '; '.join(f"{r['state'] or 'unknown'} {r['n']:,}" for r in by_state)
                    + (f'; and {n_states - len(by_state)} more states' if n_states > len(by_state) else '') + '.')
        head.append(f"{total['s'] or 0:,} of them are on the researched SBA screen.")
    head += [
        'What the fields mean: jobs come from the latest loan record, either PPP (what the borrower reported in 2020-21) or an SBA '
        '7(a) or 504 loan (what the lender reported; these loans go back to 1991, and the row gives the year). It is not a current '
        'headcount. Revenue is always modelled (est.) from Census benchmarks and the loan data, never reported by the company, unless '
        'the row says stated. Ownership is unknown unless the row says researched or loan record, or company website: AI read the '
        "business's own site (re-checked means a second AI pass tried to refute a founder or family call and kept it; corrected on "
        're-check means it changed the call), so treat it '
        'as a lead to confirm and quote the website. A change of ownership is known only '
        'when an SBA loan financed it. Miles are straight-line from the ZIP centre to the nearest BSP hub (Punctual Pros and CET only).',
        f"Directory built {words_date((meta.get('built_at') or '')[:10]) or 'recently'} from SBA PPP (as of Sep 30, 2024) and 7(a)/504 "
        f"(as of Sep 30, 2026) loan records.",
    ]
    head += notes
    if not n:
        if a.get('trade'):
            head.append(f'No business matches. Try another trade word ({TRADE_EXAMPLES}), a segment or a NAICS code. '
                        'Or loosen a filter (a wider area, a lower jobs floor) or check the spelling of the place.')
        else:
            head.append('No business matches. Loosen a filter (a wider area, a lower jobs floor) or check the spelling of the place.')
        return '\n'.join(head), _sources(meta, False)
    head.append(f"Top {len(rows)} sorted by {sort}" + (' (largest first)' if sort in ('jobs', 'revenue') else '') + ':')
    lines = [_row_line(i + 1, r) for i, r in enumerate(rows)]
    tail = [f'Researched candidates and their evidence: SBA loan screen ({SCREEN_URL}). Every loan row behind these businesses: '
            f'SBA loan records view ({RECORDS_URL}).', f'(query took {ms:.0f} ms)']
    text = '\n'.join(head) + '\n' + '\n'.join(lines) + '\n' + '\n'.join(tail)
    return _cap(text), _sources(meta, any(r['revenue_est_usd'] for r in rows), any(_g(r, 'website') for r in rows))


# ---------------------------------------------------------------- tool schema

def tool_definitions():
    # Fixed wording: the tools sit in the cached prompt prefix, so the text must not change once the database has loaded.
    return [{
        'name': 'find_businesses',
        'description': (
            'Search the all-business directory: about 145,000 US businesses found in SBA loan records (PPP 2020-21, SBA 7(a) and 504 loans to '
            'Sep 2026), in six segments, one per BSP company: ' + '; '.join(f'{k} = {SEGMENTS[k]} ({SEG_TRADE[k]})' for k in SEGMENTS) + '. '
            'Filters: segment, keyword or name words, state, county, city, ZIP, NAICS code or trade words, jobs range, modelled revenue '
            'range, miles from a BSP hub (Punctual Pros and CET only), ownership (founder-run, family-owned, founder-or-family, PE-backed, '
            'employee-owned, franchise or unknown), leaving out businesses with an SBA-financed change of ownership in '
            'the last N years, and leaving out businesses already researched or on a hand-built list. Returns totals by segment and state '
            'and the top rows with jobs and their source, PPP first draw, latest SBA loan, change of ownership, distance, a modelled revenue '
            'estimate with its range, the website, and ownership with its source: the SBA screen, a hand-built list, or for about 10,000 '
            'businesses the company\'s own website read by AI (with how likely the call is and the sentence on the site it rests on); '
            'otherwise unknown. Use it to count or list businesses by trade, place, size, ownership '
            'or name, for example "HVAC contractors in Lancaster County with 20 to 60 jobs not sold since 2023", "family-owned electrical '
            'contractors in Massachusetts" or "IT firms with legal '
            'in the name". Some borrowers are sole proprietors filed under a person\'s own name, as the SBA released them.'),
        'input_schema': {
            'type': 'object',
            'properties': {
                'segment': {'type': 'string', 'enum': list(SEGMENTS), 'description': 'Optional. One segment; leave out to search all six.'},
                'query': {'type': 'string', 'description': 'Optional keywords matched against name, dba, city and trade (prefix match, all words must match).'},
                'name': {'type': 'string', 'description': 'Optional words that must appear in the business name or dba, for example "legal".'},
                'state': {'type': 'string', 'description': 'Optional two-letter state code or state name; several separated by commas.'},
                'county': {'type': 'string', 'description': 'Optional county name, for example "Lancaster". Best with state.'},
                'city': {'type': 'string', 'description': 'Optional city as the loan record spells it.'},
                'zip': {'type': 'string', 'description': 'Optional five-digit ZIP, or a three-digit ZIP prefix; several separated by commas.'},
                'naics': {'type': 'string', 'description': 'Optional NAICS code or prefix, for example "238220" or "3152".'},
                'trade': {'type': 'string', 'description': 'Optional trade words, read as industry codes, for example "HVAC", "plumbers", "electricians", "IT", "PR", "lab supply" or "apparel". Other words match the trade label and researched specialties as whole words.'},
                'jobs_min': {'type': 'integer', 'minimum': 0, 'description': 'Optional. Smallest jobs figure (latest loan record).'},
                'jobs_max': {'type': 'integer', 'minimum': 0, 'description': 'Optional. Largest jobs figure (latest loan record).'},
                'revenue_min': {'type': 'number', 'description': 'Optional. Smallest revenue estimate in dollars (modelled).'},
                'revenue_max': {'type': 'number', 'description': 'Optional. Largest revenue estimate in dollars (modelled).'},
                'max_miles': {'type': 'number', 'description': 'Optional. Straight-line miles from the nearest BSP hub (Punctual Pros and CET segments only).'},
                'exclude_sold_within_years': {'type': 'integer', 'minimum': 0, 'maximum': 40, 'description': 'Optional. Leave out businesses with an SBA-financed change of ownership in the last N years.'},
                'exclude_sold_since': {'type': 'string', 'description': 'Optional. Leave out businesses with an SBA-financed change of ownership on or after this year or date ("2023" or "2023-01-01").'},
                'ownership': {'type': 'string', 'enum': ['founder-run', 'family-owned', 'founder-or-family', 'PE-backed', 'employee-owned', 'franchise', 'unknown'],
                              'description': 'Optional. Only businesses with this ownership call (from the SBA screen, a hand-built list or the company website read by AI).'},
                'exclude_researched': {'type': 'boolean', 'description': 'Leave out businesses already on the researched SBA screen.'},
                'exclude_hand_built': {'type': 'boolean', 'description': 'Leave out businesses already on a hand-built target list.'},
                'sort': {'type': 'string', 'enum': list(SORTS), 'description': 'jobs (default, largest first), revenue (largest first), distance (closest first) or name.'},
                'limit': {'type': 'integer', 'minimum': 1, 'maximum': MAX_LIMIT, 'description': f'Rows to list. Default {DEFAULT_LIMIT}.'},
            },
            'required': [],
        },
    }]
