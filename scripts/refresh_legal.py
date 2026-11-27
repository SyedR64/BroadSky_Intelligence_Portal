#!/usr/bin/env python3
"""Public legal records about the companies the portfolio watches: competitors, add-on targets and sector rivals.

Writes
  data/research/legal_watchlist.json   who is watched, built from the repo's own research files (--build-watchlist)
  data/live/legal_signals.json         one row per record: court docket, lien, licence, entity filing, contract award
and one `legal_signals` entry in data/live/manifest.json.

Sources (all public, no account, no key; briefing/legal_records_sources.md has the survey behind the choice):
  courts     CourtListener's public Atom search feed over the RECAP archive of federal dockets (Free Law Project).
             The REST API needs an account token, so only the feed is read. District and bankruptcy courts.
  liens      Connecticut Secretary of the State, UCC lien filings (data.ct.gov xfev-8smz). Business debtors only.
  entities   Connecticut Business Registry: business master (n7gp-d28j) and filing history (ah3s-bes7);
             New York Department of State active corporations (data.ny.gov n9v6-gdp6).
  licences   Connecticut state licences and credentials (data.ct.gov ngch-56tr), business holders only;
             Delaware business licences (data.delaware.gov 5zy2-grhr).
  awards     USAspending contract awards by recipient name, last 12 months.

Rules the code keeps:
  * Companies only. A row is kept only when the record names a watched company. A person is never stored: an
    individual debtor or licence holder is skipped, and a private party in a case caption is written "Individual".
    Officer names, agent names and email addresses in a registry row are dropped.
  * A source that cannot be reached leaves its earlier rows in place and is marked `error`; nothing is invented.
  * A match needs the watched name as whole words in the record AND the record's place to agree with the company's
    (court district for dockets, party state for liens, licences and entities). A national rival has no place test.

Stdlib only. Usage:
  python3 scripts/refresh_legal.py                      refresh every source for the first-slice companies (about 3 minutes)
  python3 scripts/refresh_legal.py --all                the whole watch list, plus New York registry and Delaware licences
  python3 scripts/refresh_legal.py --only courts,liens  some sources
  python3 scripts/refresh_legal.py --build-watchlist    rebuild the watch list from data/research, then refresh
  python3 scripts/refresh_legal.py --limit 20           first 20 watched names (a quick test)
"""
import datetime as dt, hashlib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from http.client import HTTPException

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = os.path.join(ROOT, 'data', 'live')
RESEARCH = os.path.join(ROOT, 'data', 'research')
WATCH = os.path.join(RESEARCH, 'legal_watchlist.json')
OUT = os.path.join(LIVE, 'legal_signals.json')
UA = 'BroadSkyPortal/1.0 (research)'
TODAY = dt.date.today()
COURT_DAYS, AWARD_DAYS, ENTITY_DAYS = 365, 365, 730
PAUSE = 0.7   # seconds between calls to one host


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def http(url, data=None, timeout=45, retries=2, raw=False, accept='application/json'):
    h = {'User-Agent': UA, 'Accept': accept}
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h['Content-Type'] = 'application/json'
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=h, method='POST' if body else 'GET')
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b.decode('utf-8', 'replace') if raw else json.loads(b)
        except (urllib.error.URLError, OSError, HTTPException, ValueError) as e:
            last = e
            if isinstance(e, urllib.error.HTTPError) and 400 <= e.code < 500 and e.code != 429:
                break
            if attempt < retries:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'{url[:120]}: {last}')


# ── names ───────────────────────────────────────────────────────────────────
SUFFIX = r'(?:inc|incorporated|llc|l l c|llp|lp|ltd|limited|corp|corporation|co|company|plc|pllc|pc)'
SUFFIX_RX = re.compile(rf'\b{SUFFIX}\b\.?', re.I)
# what makes a caption party an organisation and not a person (kept short on purpose: a doubt is written "Individual")
ORG_RX = re.compile(rf"\b(?:{SUFFIX}|bank|group|holdings?|partners|associates|association|services|solutions|systems|technologies|"
                    r"enterprises|industries|international|insurance|university|college|hospital|department|commission|authority|"
                    r"board|union|council|foundation|institute|contractors|construction|electric|electrical|mechanical|plumbing|funds?|"
                    r"heating|united states|usa|city of|county of|state of|commonwealth of|town of|township of|borough of|"
                    r"school district|n a)\b", re.I)


def norm(s):
    s = html.unescape(str(s or '')).lower().replace('&', ' and ')
    s = re.sub(r"[’'`.]", '', s)
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', s).split())


def core(s):
    """The name without its corporate suffix: 'Brubaker, Inc.' -> 'brubaker'."""
    return ' '.join(SUFFIX_RX.sub(' ', norm(s)).split())


def has_phrase(text, phrase):
    return bool(phrase) and re.search(rf'(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])', norm(text)) is not None


def title_case(s):
    s = ' '.join(html.unescape(str(s or '')).split())
    if not s or s != s.upper():
        return s
    small = {'of', 'and', 'the', 'for', 'in', 'on', 'at', 'by', 'to', 'a', 'an', 'v.'}
    keep = {'LLC', 'LLP', 'LP', 'USA', 'US', 'NA', 'N.A.', 'PC', 'PLLC', 'II', 'III', 'IV', 'HVAC', 'CT', 'DBA', 'IES', 'JM', 'KM', 'FM', 'ABS'}
    out = []
    for i, w in enumerate(s.split(' ')):
        bare = w.strip('.,()')
        if bare in keep:
            out.append(w)
        elif i and w.lower() in small:
            out.append(w.lower())
        else:
            out.append(re.sub(r"[A-Za-z]+('[A-Za-z]+)?", lambda m: m.group(0)[0].upper() + m.group(0)[1:].lower(), w))
    return ' '.join(out)


def caption(title, phrases):
    """A case caption with every party that is not plainly an organisation written 'Individual'."""
    t = ' '.join(html.unescape(str(title or '')).split())
    parts = re.split(r'\s+v(?:s)?\.?\s+', t, flags=re.I)
    if len(parts) < 2:
        return title_case(t) if any(has_phrase(t, p) for p in phrases) and ORG_RX.search(norm(t)) else 'Case naming the company'
    side = lambda p: title_case(p) if (any(has_phrase(p, x) for x in phrases) or ORG_RX.search(norm(p))) else 'Individual'
    return ' v. '.join(side(p) for p in parts[:2])


def names_company(title, phrases):
    """True when a caption names the company and not a person who shares its name: a one-word name ('Consilio') must
    sit on a side that reads as an organisation ('Consilio, LLC'), since a bare word can be a surname."""
    for side in re.split(r'\s+v(?:s)?\.?\s+', ' '.join(html.unescape(str(title or '')).split()), flags=re.I):
        for p in phrases:
            if has_phrase(side, p) and (len(p.split()) > 1 or ORG_RX.search(norm(side))):
                return True
    return False


def day(s):
    m = re.match(r'(\d{4}-\d{2}-\d{2})', str(s or ''))
    return m.group(1) if m else ''


def rid(*parts):
    return hashlib.sha1('|'.join(str(p) for p in parts).encode()).hexdigest()[:12]


# ── the watch list ──────────────────────────────────────────────────────────
DISTRICTS = {  # CourtListener court ids: district courts, then bankruptcy courts
    'PA': 'paed pamd pawd paeb pamb pawb', 'NJ': 'njd njb', 'DE': 'ded deb', 'MD': 'mdd mdb', 'MA': 'mad mab', 'CT': 'ctd ctb',
    'RI': 'rid rib', 'NH': 'nhd nhb', 'ME': 'med meb', 'VT': 'vtd vtb', 'NY': 'nysd nyed nynd nywd nysb nyeb nynb nywb',
    'IL': 'ilnd ilcd ilsd ilnb', 'DC': 'dcd dcb', 'MO': 'moed mowd moeb', 'TX': 'txnd txsd txed txwd txnb txsb', 'CA': 'cand cacd casd caed canb cacb',
    'MN': 'mnd mnb', 'FL': 'flsd flmd flnd flsb flmb', 'NV': 'nvd nvb', 'OH': 'ohnd ohsd', 'MI': 'mied miwd', 'KS': 'ksd', 'WI': 'wied wiwd',
    'NE': 'ned neb', 'GA': 'gand gamd gasd', 'NC': 'nced ncmd ncwd', 'VA': 'vaed vawd', 'CO': 'cod', 'AZ': 'azd', 'WA': 'wawd waed', 'UT': 'utd', 'TN': 'tnmd tned tnwd',
}
COURT_SEAT = {  # where a docket is pinned when the company has no map point of its own
    'paed': (39.951, -75.151, 'Philadelphia, PA'), 'pamd': (40.261, -76.882, 'Harrisburg, PA'), 'pawd': (40.441, -79.996, 'Pittsburgh, PA'),
    'njd': (40.220, -74.765, 'Trenton, NJ'), 'ded': (39.745, -75.548, 'Wilmington, DE'), 'deb': (39.745, -75.548, 'Wilmington, DE'),
    'mdd': (39.289, -76.616, 'Baltimore, MD'), 'mad': (42.354, -71.048, 'Boston, MA'), 'ctd': (41.307, -72.925, 'New Haven, CT'),
    'rid': (41.825, -71.411, 'Providence, RI'), 'nhd': (43.207, -71.538, 'Concord, NH'), 'nysd': (40.714, -74.002, 'New York, NY'),
    'nyed': (40.697, -73.990, 'Brooklyn, NY'), 'ilnd': (41.878, -87.629, 'Chicago, IL'), 'dcd': (38.893, -77.016, 'Washington, DC'),
    'moed': (38.626, -90.193, 'St. Louis, MO'), 'txsd': (29.757, -95.365, 'Houston, TX'), 'txnd': (32.780, -96.799, 'Dallas, TX'),
    'cand': (37.780, -122.418, 'San Francisco, CA'), 'cacd': (34.054, -118.243, 'Los Angeles, CA'), 'flsd': (25.777, -80.194, 'Miami, FL'),
    'txsb': (29.757, -95.365, 'Houston, TX'), 'nysb': (40.704, -74.013, 'New York, NY'), 'njb': (40.735, -74.172, 'Newark, NJ'),
}
COURT_NAME = {'District Court': '', 'United States Bankruptcy Court': 'Bankruptcy Court'}
# Sector rivals named in data/research/rival_filings.json. `wide` means no place test: the name is distinctive.
RIVALS = [   # (company, name, phrases, state when the research file gives one, wide)
    ('cet', 'IES Holdings', ['IES Holdings'], '', True), ('cet', 'Interstate Electrical Services', ['Interstate Electrical Services'], 'MA', True),
    ('cet', 'J. & M. Brown Company', ['J and M Brown Company', 'JM Brown Company'], 'MA', False), ('cet', 'Sciens Building Solutions', ['Sciens Building Solutions'], '', True),
    ('pp', 'Wrench Group', ['Wrench Group'], '', True), ('pp', 'Apex Service Partners', ['Apex Service Partners'], '', True),
    ('pp', 'TurnPoint Services', ['TurnPoint Services'], '', True), ('pp', 'Heartland Home Services', ['Heartland Home Services Inc'], '', True),
    ('pp', 'Redwood Services', ['Redwood Services LP'], '', True), ('pp', 'Legacy Service Partners', ['Legacy Service Partners'], '', True),
    ('pp', 'Sila Services', ['Sila Services LLC', 'Sila Heating and Air Conditioning'], '', True), ('pp', 'Any Hour Services', ['Any Hour LLC', 'Any Hour Inc'], '', True),
    ('ts', 'Avantor', ['Avantor', 'VWR International'], '', True), ('ts', 'Calibre Scientific', ['Calibre Scientific'], '', True),
    ('ts', 'CELLTREAT Scientific Products', ['Celltreat'], 'MA', True),
    ('fl', 'Consilio', ['Consilio LLC', 'Consilio Services'], '', True), ('fl', 'Epiq', ['Epiq Systems', 'Epiq Global', 'Epiq Class Action', 'Epiq eDiscovery', 'DTI Holdco'], '', True), ('fl', 'Integreon', ['Integreon'], '', True),
    ('bpi', 'Stagwell', ['Stagwell'], '', True), ('bpi', 'SKDK', ['SKDK', 'SKDKnickerbocker'], '', True), ('bpi', 'FGS Global', ['FGS Global'], '', True),
    ('bpi', 'Precision Strategies', ['Precision Strategies LLC'], 'DC', True),
    ('fh', 'Solo Brands', ['Solo Brands'], '', True), ('fh', 'Chubbies', ['Chubbies'], 'TX', True),
]
# The first slice: a few named companies per portfolio company, so a refresh runs in about three minutes.
# `--all` reads the whole watch list (about 25 minutes) and adds the New York registry and Delaware licences.
FIRST = {'Horizon Services', 'Haller Enterprises', 'HB McClure / HB Home Services', 'Wrench Group', 'Apex Service Partners', 'Sila Services',
         'Dinto Electrical Group', 'NY-Conn Corporation', 'Griffin Electrical Contractors, Inc.', 'C&H Electric, Inc.', 'Automated Building Systems, Inc.',
         'CTEC Solar', 'IES Holdings', 'Interstate Electrical Services',
         'Consilio', 'Epiq', 'Integreon', 'Kraft & Kennedy, Inc.', 'Tabush Group',
         'Avantor', 'Calibre Scientific', 'CELLTREAT Scientific Products', 'Pfaltz & Bauer', 'Krackeler Scientific, Inc.',
         'Stagwell', 'SKDK', 'FGS Global', 'Precision Strategies', 'Solo Brands', 'Chubbies'}
ALL = '--all' in sys.argv
FRANCHISE_RX = re.compile(r'one hour|benjamin franklin|mister sparky', re.I)
# a short or everyday name that would match other companies: left out of the search, not guessed at
TOO_GENERIC = {'air care', 'air experts', 'home climates', 'energy electric', 'universal electric', 'electrical connection', 'signature hvac',
               'legal workspace', 'aqua solutions', 'element technologies', 'synergy technical', 'control technologies', 'level5 management',
               'electrical installations', 'valley heating and cooling', 'm and m mechanical', 'h and h service', 'warner service', 'aero energy',
               'mentis group', 'lab alley', 'traveling coaches', 'allnext legal'}
# Names the rules below read wrongly. A key is a piece of the name in the research file; None leaves the company out.
OVERRIDES = {
    'Ron Williams group': None, "Calvert's": None, 'Bucks County': None, 'Bucks & Montgomery': None, 'PHE, Inc.': None,
    'Sila Services - ECS': ('ECS Comfort Heating & Cooling', ['ecs comfort heating and cooling']),
    'Sila Services - Oxford': ('Oxford Plumbing & Heating', ['oxford plumbing and heating']),
    'Plug It In LLC': ('Plug It In LLC (Mister Sparky of Manalapan)', ['plug it in llc']),
    'Pronto Plumbing': ('Pronto Plumbing Heating Air & Drains', ['pronto plumbing heating air', 'secco home services']),
    'Regal Inc.': ('Regal Plumbing, Heating & A/C', ['regal plumbing heating']),
    'Andwin Corporation': ('Andwin Corporation', ['andwin corporation', 'andwin scientific']),
    'Laboratory Equipment Company': ('Laboratory Equipment Company', ['laboratory equipment company', 'labequipco']),
    'Neffsville Plumbing': ('Neffsville Plumbing, Heating & Cooling', ['neffsville plumbing heating']),
    'Essig Plumbing': ('Essig Plumbing & Heating', ['essig plumbing and heating']),
    'SOC Energy': ('SOC Energy', ['soc energy', 'service oil company']),
    'Warner Service': ('Warner Service', ['rw warner inc']),
    'Horizon Services': ('Horizon Services', ['horizon services']),
    'Good Plumbing': ('Good Plumbing, Heating & Air Conditioning', ['good plumbing heating and air conditioning']),
}
MORE_STATES = {'Horizon Services': ['DE', 'PA', 'NJ', 'MD'], 'Sila Services': ['PA', 'NJ', 'DE']}   # multi-state operators named so in pp_market


def phrases_for(name):
    """(display name, search phrases) from a research-file name, or (name, []) when the company is left out.
    'HB McClure / HB Home Services' gives two phrases; a parenthesis counts only when it holds a legal name."""
    name = re.sub(r'[®™]', '', name)
    for k, v in OVERRIDES.items():
        if k in name:
            return (v[0], v[1]) if v else (name, [])
    inner = [y for x in re.findall(r'\(([^)]*)\)', name) for y in x.split(' / ')]
    main = re.sub(r'\([^)]*\)', ' ', name)
    cands = [(c, False) for c in re.split(r'\s+/\s+|\s+\+\s+', main)]
    cands += [(re.sub(r'^(?:incl\.?|including|formerly|fka|former|dba|d/b/a)\s+(?:former\s+)?', '', x.strip(), flags=re.I), True) for x in inner]
    out, display = [], ' '.join(main.split()).strip(' ,')
    for c, alias in cands:
        c = re.sub(r'\s+d/b/a\s+.*$', '', c, flags=re.I).strip(' ,')
        if not c or FRANCHISE_RX.search(c) or (alias and not SUFFIX_RX.search(c)):
            continue
        k = core(c)
        words = [x for x in k.split() if x != 'the']
        if not words or k in TOO_GENERIC or ' '.join(words) in TOO_GENERIC:
            continue
        p = ' '.join(x for x in norm(c).split() if x != 'the') if (len(words) < 2 or alias) and SUFFIX_RX.search(c) else ' '.join(words)
        if len(p.split()) < 2 and len(p) < 7:
            continue
        if FRANCHISE_RX.search(display):
            display = c
        if p not in out:
            out.append(p)
    return display, out[:3]


def build_watchlist():
    J = lambda n: json.load(open(os.path.join(RESEARCH, n + '.json'), encoding='utf-8'))
    seen, watch = set(), []

    def add(co, name, role, state, city='', lat=None, lon=None, phrases=None, wide=False, src=''):
        clean, ph = (name, phrases) if phrases is not None else phrases_for(name)
        ph = [norm(p) for p in ph if norm(p)]
        key = (co, ph[0] if ph else norm(name))
        if not ph or key in seen:
            return
        seen.add(key)
        w = {'id': f'{co}-{rid(co, ph[0])[:8]}', 'co': co, 'name': clean, 'role': role, 'state': state or '', 'city': city or '',
             'lat': lat, 'lon': lon, 'phrases': ph, 'wide': bool(wide), 'from': src}
        if MORE_STATES.get(clean):
            w['states'] = MORE_STATES[clean]
        watch.append(w)

    for it in J('pp_market')['items']:
        if it.get('kind') != 'competitor':
            continue
        hq = (it.get('hq') or '').split(',')
        add('pp', it['name'], 'competitor', hq[-1].strip()[:2] if len(hq) > 1 else '', hq[0].strip(), it.get('lat'), it.get('lon'), src='pp_market')
    for it in J('ma_targets_pp')['items']:
        add('pp', it['company'], 'target', it.get('state'), it.get('hq_city'), it.get('lat'), it.get('lon'), src='ma_targets_pp')
    for it in J('ma_targets_cet')['items']:
        add('cet', it['company'], 'target', it.get('state'), it.get('hq_city'), it.get('lat'), it.get('lon'), src='ma_targets_cet')
    for it in J('ma_targets_fl_ts')['items']:
        if (it.get('country') or 'US') not in ('US', 'USA', 'United States') or len(it.get('state') or '') != 2:
            continue
        add('fl' if it.get('platform') == 'frontline' else 'ts', it['company'], 'target', it.get('state'), it.get('hq_city'), it.get('lat'), it.get('lon'), src='ma_targets_fl_ts')
    for co, name, ph, st, wide in RIVALS:
        add(co, name, 'rival', st, phrases=ph, wide=wide, src='rival_filings')
    payload = {'meta': {'title': 'Legal records watch list', 'generated': str(TODAY), 'count': len(watch),
                        'description': 'Competitors, add-on targets and sector rivals whose public records are read by scripts/refresh_legal.py. '
                                       'Built from pp_market, ma_targets_pp, ma_targets_cet, ma_targets_fl_ts and rival_filings. Companies only.',
                        'fields': {'phrases': 'the name as searched, lower case, whole words', 'wide': 'true for a distinctive national name: no place test', 'states': 'states whose courts and registries count, when more than the home state',
                                   'role': 'competitor, target or rival', 'from': 'the research file the name came from'}},
               'items': watch}
    with open(WATCH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    print(f'watch list: {len(watch)} companies -> {os.path.relpath(WATCH, ROOT)}')
    return watch


def load_watch():
    if not os.path.exists(WATCH):
        return build_watchlist()
    return json.load(open(WATCH, encoding='utf-8'))['items']


def states_for(w):
    return w.get('states') or ([w['state']] if w['state'] else [])


def base(w, typ, date, line, url, source, **extra):
    it = {'id': rid(typ, source, url, date, line), 'type': typ, 'date': date, 'co': w['co'], 'party': w['name'], 'role': w['role'],
          'state': extra.pop('state', w['state']), 'place': extra.pop('place', ', '.join(x for x in (w['city'], w['state']) if x)),
          'lat': extra.pop('lat', w['lat']), 'lon': extra.pop('lon', w['lon']), 'line': line, 'source': source, 'url': url}
    it.update(extra)
    return it


# ── federal courts: CourtListener's public search feed over RECAP ───────────
FEED = 'https://www.courtlistener.com/feed/search/'


def src_courts(watch):
    items, urls, asked = [], [FEED], 0
    floor = str(TODAY - dt.timedelta(days=COURT_DAYS))
    for w in watch:
        courts = '' if w['wide'] else ' '.join(DISTRICTS.get(s, '') for s in states_for(w)).strip()
        if not w['wide'] and not courts:
            continue
        q = ' OR '.join(f'caseName:"{p}"' for p in w['phrases'])
        params = {'q': q, 'type': 'r', 'order_by': 'dateFiled desc'}
        if courts:
            params['court'] = courts
        try:
            xml = http(FEED + '?' + urllib.parse.urlencode(params), raw=True, accept='application/atom+xml')
        except RuntimeError as e:
            if asked == 0:
                raise
            print('   feed miss', w['name'], str(e)[-80:], flush=True)
            continue
        asked += 1
        time.sleep(PAUSE)
        dockets = {}
        for e in re.findall(r'<entry>(.*?)</entry>', xml, flags=re.S):
            g = lambda rx: (re.search(rx, e, re.S) or [None, ''])[1]
            title, link, pub, court = html.unescape(g(r'<title>(.*?)</title>')), g(r'<link href="([^"]+)"'), day(g(r'<published>(.*?)</published>')), html.unescape(g(r'<name>(.*?)</name>'))
            m = re.search(r'/docket/(\d+)/(?:(\d+)/)?', link)
            if not m or not pub or not names_company(title, w['phrases']):
                continue
            d = dockets.setdefault(m.group(1), {'title': title, 'court': court, 'dates': [], 'entries': []})
            d['dates'].append(pub)
            if m.group(2):
                d['entries'].append(int(m.group(2)))
        for did, d in dockets.items():
            newest = max(d['dates'])
            if newest < floor:
                continue
            cap = caption(d['title'], w['phrases'])
            court = d['court'].replace('District Court, ', '').replace('United States Bankruptcy Court, ', 'Bankruptcy Court, ')
            n = len(set(d['entries'])) or len(d['dates'])
            week = sum(1 for x in d['dates'] if x >= str(TODAY - dt.timedelta(days=7)))
            extra = {}
            if w['lat'] is None:   # a rival with no map point is pinned at the court
                seat = _seat(d['court'])
                if seat:
                    extra = {'lat': seat[0], 'lon': seat[1], 'place': seat[2], 'state': seat[2][-2:]}
            items.append(base(w, 'filing', newest, f'{n} docket {"entry" if n == 1 else "entries"} on file', f'https://www.courtlistener.com/docket/{did}/case/', 'courtlistener',   # any last word opens the docket; the case's own would carry a party's name
                             
                              court=court, caption=cap, entries=n, entries_week=week, first_seen=min(d['dates']),
                              record={'case': cap, 'court': d['court'], 'docket': did, 'newest_entry': newest, 'entries_listed': n}, **extra))
    return items, urls, asked


_SEAT_BY_NAME = {'E.D. Pennsylvania': 'paed', 'M.D. Pennsylvania': 'pamd', 'W.D. Pennsylvania': 'pawd', 'D. New Jersey': 'njd', 'D. Delaware': 'ded',
                 'D. Maryland': 'mdd', 'D. Massachusetts': 'mad', 'D. Connecticut': 'ctd', 'D. Rhode Island': 'rid', 'D. New Hampshire': 'nhd',
                 'S.D. New York': 'nysd', 'E.D. New York': 'nyed', 'N.D. Illinois': 'ilnd', 'District of Columbia': 'dcd', 'E.D. Missouri': 'moed',
                 'S.D. Texas': 'txsd', 'N.D. Texas': 'txnd', 'N.D. California': 'cand', 'C.D. California': 'cacd', 'S.D. Florida': 'flsd'}


def _seat(court_name):
    for k, cid in _SEAT_BY_NAME.items():
        if k in court_name:
            return COURT_SEAT[cid]
    return None


# ── Socrata helpers (Connecticut, Delaware, New York open data) ─────────────
def soda(domain, dataset, where=None, select=None, q=None, limit=1000):
    p = {'$limit': str(limit)}
    if where:
        p['$where'] = where
    if select:
        p['$select'] = select
    if q:
        p['$q'] = q
    return http(f'https://{domain}/resource/{dataset}.json?' + urllib.parse.urlencode(p), timeout=30, retries=1)


def find(domain, dataset, w, where=None, select=None):
    """Rows whose text holds one of the company's phrases: the portal's own indexed text search, one call per phrase.
    (A wildcard filter over a whole registry is too heavy for a shared public portal.) The caller still tests each row."""
    rows, seen = [], set()
    for p in w['phrases'][:2]:
        words = ' '.join(x for x in p.split() if x not in ('and', 'inc', 'llc', 'co', 'the'))
        try:
            got = soda(domain, dataset, where, select, q=words)
        except RuntimeError as e:
            print('   search miss', dataset, w['name'], str(e)[-60:], flush=True)
            got = []
        time.sleep(0.12)
        for r in got:
            k = json.dumps(r, sort_keys=True)
            if k not in seen:
                seen.add(k)
                rows.append(r)
    return rows


def match(watch, name, state=None):
    """The watched company a record's party name belongs to, or None. The party's state must agree unless the name is wide."""
    for w in watch:
        if any(has_phrase(name, p) for p in w['phrases']):
            if w['wide'] or not state or state.upper() in (states_for(w) or [state.upper()]):
                return w
    return None


def src_liens(watch):
    DS = 'xfev-8smz'
    url = f'https://data.ct.gov/resource/{DS}.json'
    sel = 'id_ucc_flng_nbr,id_lien_flng_nbr,lien_status,cd_flng_type,tx_lien_descript,debtor_nm_bus,debtor_ad_city,debtor_ad_state,sec_party_nm_bus,sec_party_ad_city,sec_party_ad_state,dt_accept,dt_lapse'
    items = []
    soda('data.ct.gov', DS, limit=1)   # the source must answer once, or the run keeps the earlier rows
    for w0 in watch:
        for r in find('data.ct.gov', DS, w0, "debtor_nm_bus is not null AND lien_status='Active'", sel):
            w = match([w0], r.get('debtor_nm_bus'), r.get('debtor_ad_state'))
            if not w:
                continue
            secured = title_case(r.get('sec_party_nm_bus') or '') or 'a secured party'   # an individual secured party has no business name: not stored
            kind = {'ORIG FIN STMT': 'Lien filed', 'AMENDMENT': 'Lien amended', 'CONTINUATION': 'Lien continued', 'ASSIGNMENT': 'Lien assigned',
                    'TERMINATION': 'Lien ended'}.get((r.get('cd_flng_type') or '').upper(), 'Lien filing')
            items.append(base(w, 'lien', day(r.get('dt_accept')), f'{kind}: {secured}', f"{url}?id_ucc_flng_nbr={r.get('id_ucc_flng_nbr')}", 'ct_ucc',
                              state=r.get('debtor_ad_state') or w['state'], place=', '.join(x for x in (title_case(r.get('debtor_ad_city') or ''), r.get('debtor_ad_state')) if x),
                              secured=secured, lapses=day(r.get('dt_lapse')), status=r.get('lien_status'), record=r))
    return items, [url], None


def src_entities(watch):
    items, urls = [], ['https://data.ct.gov/resource/n7gp-d28j.json', 'https://data.ct.gov/resource/ah3s-bes7.json', 'https://data.ny.gov/resource/n9v6-gdp6.json']
    sel = 'id,name,business_type,status,sub_status,accountnumber,annual_report_due_date,billingcity,billingstate,citizenship,date_registration,state_or_territory_formation,naics_code'
    floor = str(TODAY - dt.timedelta(days=ENTITY_DAYS))
    soda('data.ct.gov', 'n7gp-d28j', limit=1)
    accounts = {}
    for w0 in watch:
        for r in find('data.ct.gov', 'n7gp-d28j', w0, None, sel):
            if match([w0], r.get('name'), r.get('billingstate')):
                accounts[r['id']] = (w0, r)
    ids = list(accounts)
    for i in range(0, len(ids), 40):
        chunk = ','.join("'%s'" % a for a in ids[i:i + 40])
        for f in soda('data.ct.gov', 'ah3s-bes7', f"account in ({chunk}) AND filing_date >= '{floor}T00:00:00'", 'account,name,filing_date,type,filing_type', limit=5000):
            w, r = accounts[f['account']]
            kind = (f.get('filing_type') or f.get('type') or 'Filing').strip()
            items.append(base(w, 'entity', day(f.get('filing_date')), f'{kind} filed in Connecticut', f"https://data.ct.gov/resource/ah3s-bes7.json?name={urllib.parse.quote(f.get('name', ''))}", 'ct_registry',
                              state='CT', status=' · '.join(x for x in (r.get('status'), r.get('sub_status')) if x), registered_name=title_case(r.get('name')),
                              record={**f, 'business': r}))
        time.sleep(PAUSE)
    if not ALL:
        return items, urls[:2], None
    ny_sel = 'dos_id,current_entity_name,initial_dos_filing_date,county,jurisdiction,entity_type'
    for w0 in (w for w in watch if w['wide'] or w['state'] == 'NY'):
        for r in find('data.ny.gov', 'n9v6-gdp6', w0, None, ny_sel):
            w = match([w0], r.get('current_entity_name'))
            if not w or core(r.get('current_entity_name')) not in [core(p) for p in w['phrases']]:
                continue   # New York rows carry no address: the whole name must be the watched name
            items.append(base(w, 'entity', day(r.get('initial_dos_filing_date')), f"Registered in New York: {(r.get('entity_type') or 'entity').lower()}",
                              f"https://data.ny.gov/resource/n9v6-gdp6.json?dos_id={r.get('dos_id')}", 'ny_registry', state='NY',
                              status='Active', registered_name=title_case(r.get('current_entity_name')), record=r))
    return items, urls, None


def src_licences(watch):
    items, urls = [], ['https://data.ct.gov/resource/ngch-56tr.json', 'https://data.delaware.gov/resource/5zy2-grhr.json']
    sel = 'credentialid,name,type,dba,fullcredentialcode,credential,status,statusreason,active,issuedate,effectivedate,expirationdate,city,state'
    soda('data.ct.gov', 'ngch-56tr', limit=1)
    for w0 in watch:
        for r in find('data.ct.gov', 'ngch-56tr', w0, "type not in ('INDIVIDUAL','EMPLOYEE ONLY')", sel):
            holder = r.get('name') if match([w0], r.get('name'), r.get('state')) else r.get('dba')
            w = match([w0], holder, r.get('state'))
            if not w:
                continue
            if holder is not r.get('name'):
                r = {k: v for k, v in r.items() if k != 'name'}   # the licence is in a person's name and the company is the trade name: the person is not stored
            cred, live = title_case(r.get('credential') or 'Licence'), (r.get('active') == '1')
            items.append(base(w, 'licence', day(r.get('effectivedate') or r.get('issuedate')), f"{cred}: {'active' if live else (r.get('status') or 'inactive').lower()}",
                              f"https://data.ct.gov/resource/ngch-56tr.json?credentialid={r.get('credentialid')}", 'ct_licences',
                              state=r.get('state') or 'CT', place=', '.join(x for x in (title_case(r.get('city') or ''), r.get('state')) if x), status=title_case(r.get('status') or ''),
                              expires=day(r.get('expirationdate')), issuer='Connecticut', record=r))
    if not ALL:
        return items, urls[:1], None
    de_sel = 'business_name,trade_name,category,current_license_valid_from,current_license_valid_to,city,state,license_number'
    for w0 in (w for w in watch if w['wide'] or 'DE' in states_for(w)):
        for r in find('data.delaware.gov', '5zy2-grhr', w0, None, de_sel):
            w = match([w0], r.get('business_name'), r.get('state')) or match([w0], r.get('trade_name'), r.get('state'))
            if not w or core(r.get('business_name')) not in [core(p) for p in w['phrases']] and core(r.get('trade_name')) not in [core(p) for p in w['phrases']]:
                continue
            items.append(base(w, 'licence', day(r.get('current_license_valid_from')), f"Delaware business licence: {title_case(r.get('category') or 'general').lower()}",
                              f"https://data.delaware.gov/resource/5zy2-grhr.json?license_number={r.get('license_number')}", 'de_licences',
                              state=r.get('state') or 'DE', place=', '.join(x for x in (title_case(r.get('city') or ''), r.get('state')) if x), status='Active',
                              expires=day(r.get('current_license_valid_to')), issuer='Delaware', record=r))
    return items, urls, None


def src_awards(watch):
    API = 'https://api.usaspending.gov/api/v2/search/spending_by_award/'
    items, start = [], str(TODAY - dt.timedelta(days=AWARD_DAYS))
    fields = ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Start Date', 'End Date', 'Description',
              'Place of Performance State Code', 'Place of Performance City Code', 'generated_internal_id', 'Base Obligation Date', 'Last Modified Date']
    for w in watch:
        body = {'filters': {'recipient_search_text': w['phrases'][:2], 'award_type_codes': ['A', 'B', 'C', 'D'], 'time_period': [{'start_date': start, 'end_date': str(TODAY), 'date_type': 'new_awards_only'}]},
                'fields': fields, 'limit': 25, 'sort': 'Base Obligation Date', 'order': 'desc'}
        try:
            res = http(API, body).get('results') or []
        except RuntimeError:
            body['filters']['time_period'] = [{'start_date': start, 'end_date': str(TODAY)}]
            res = http(API, body).get('results') or []
        time.sleep(0.25)
        for r in res:
            name = r.get('Recipient Name') or ''
            ok = any(core(name) == core(p) or (w['wide'] and has_phrase(name, p)) or (len(p.split()) >= 3 and has_phrase(name, p)) for p in w['phrases'])
            date = day(r.get('Base Obligation Date') or r.get('Start Date'))
            if not ok or not date or date < start:
                continue
            amt = r.get('Award Amount') or 0
            st = r.get('Place of Performance State Code') or w['state']
            rec = {k: v for k, v in r.items() if k not in ('internal_id', 'awarding_agency_id', 'agency_slug')}
            items.append(base(w, 'award', date, f"{r.get('Awarding Agency') or 'Federal'} contract", f"https://www.usaspending.gov/award/{r.get('generated_internal_id')}", 'usaspending',
                              state=st, amount=round(float(amt), 2), agency=r.get('Awarding Agency'), recipient=title_case(name), what=' '.join(str(r.get('Description') or '').split())[:160], record=rec))
    return items, [API], None


SOURCES = {
    'courts': ('courtlistener', 'Federal dockets: CourtListener public search feed (RECAP archive)', src_courts),
    'liens': ('ct_ucc', 'Connecticut UCC lien filings', src_liens),
    'entities': ('registries', 'Business registries: Connecticut, New York', src_entities),
    'licences': ('licences', 'Licences: Connecticut credentials, Delaware business licences', src_licences),
    'awards': ('usaspending', 'USAspending contract awards', src_awards),
}
TYPE_OF = {'courts': 'filing', 'liens': 'lien', 'entities': 'entity', 'licences': 'licence', 'awards': 'award'}


def main(argv):
    os.makedirs(LIVE, exist_ok=True)
    # the first slice reads three sources; the Connecticut registry and licence searches are slow and run only with --all or --only
    only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else (None if ALL else {'courts', 'liens', 'awards'})
    watch = build_watchlist() if '--build-watchlist' in argv else load_watch()
    full = len(watch)
    if not ALL:
        watch = [w for w in watch if w['name'] in FIRST]
    if '--limit' in argv:
        watch = watch[:int(argv[argv.index('--limit') + 1])]
    try:
        prev = json.load(open(OUT, encoding='utf-8'))
    except (OSError, ValueError):
        prev = {}
    kept = {k: [i for i in prev.get('items', []) if i.get('type') == t] for k, t in TYPE_OF.items()}
    status = {s['id']: s for s in prev.get('sources', [])}
    t0, ok = time.time(), 0
    for key, (sid, title, fn) in SOURCES.items():
        if only and key not in only:
            continue
        t1 = time.time()
        try:
            items, urls, asked = fn(watch)
            kept[key] = items
            status[sid] = {'id': sid, 'key': key, 'title': title, 'status': 'ok', 'rows': len(items), 'fetched_at': now_iso(), 'source_urls': urls, 'seconds': round(time.time() - t1, 1)}
            ok += 1
            print(f'  ok    {key:9s} {len(items):4d} rows  {time.time()-t1:.0f}s', flush=True)
        except Exception as e:   # one source failing never fails the run; its earlier rows stay
            status[sid] = {**status.get(sid, {'id': sid, 'key': key, 'title': title, 'rows': len(kept[key])}), 'status': 'error', 'error': str(e)[:300], 'attempted_at': now_iso()}
            print(f'  FAIL  {key:9s} {str(e)[:160]}', flush=True)
    items = sorted((i for k in SOURCES for i in kept[k]), key=lambda i: (i.get('date') or '', i['id']), reverse=True)
    seen, uniq = set(), []
    for i in items:
        if i['id'] not in seen:
            seen.add(i['id'])
            uniq.append(i)
    payload = {'fetched_at': now_iso(), 'title': 'Public legal records about watched companies', 'as_of': str(TODAY), 'watched': len(watch), 'watch_list': full,
               'watching': sorted({(w['co'], w['name'], w['role']) for w in watch}),
               'window': {'courts_days': COURT_DAYS, 'awards_days': AWARD_DAYS, 'entity_filings_days': ENTITY_DAYS, 'liens': 'active liens', 'licences': 'current record'},
               'note': 'Companies only. A private party in a case caption is written "Individual". Rows come from the public sources listed; a source marked error kept its earlier rows.',
               'sources': [status[s[0]] for s in SOURCES.values() if s[0] in status], 'items': uniq}
    s = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    with open(OUT + '.tmp', 'w', encoding='utf-8') as f:
        f.write(s)
    os.replace(OUT + '.tmp', OUT)
    mpath = os.path.join(LIVE, 'manifest.json')
    try:
        manifest = json.load(open(mpath))
    except Exception:
        manifest = {'sources': {}}
    bad = [x['id'] for x in payload['sources'] if x['status'] != 'ok']
    manifest.setdefault('sources', {})['legal_signals'] = {
        'status': 'ok' if not bad else 'partial', 'file': 'data/live/legal_signals.json', 'fetched_at': payload['fetched_at'], 'rows': len(uniq), 'bytes': len(s.encode()),
        'seconds': round(time.time() - t0, 1), 'source_urls': [u for x in payload['sources'] for u in x.get('source_urls', [])][:10],
        'title': 'Public legal records about watched companies (scripts/refresh_legal.py)', **({'failed': bad} if bad else {})}
    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=1)
    print(f'refresh_legal: {ok} source(s) ok, {len(uniq)} rows -> {os.path.relpath(OUT, ROOT)}')
    return 0   # never fail the nightly run


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
