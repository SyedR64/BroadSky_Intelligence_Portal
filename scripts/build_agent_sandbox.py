#!/usr/bin/env python3
"""
Build the company agent's sandbox: fictional records for BSP and its six portfolio companies.

Writes server/sandbox/*.json (read by server/workspace.py) and data/agent/catalog.json (read by agent.html).
Everything is seeded and deterministic. Dates are day and month offsets from "today"; the server shifts them
at load, so the sandbox never goes stale. People are fictional; one-person offices appear by role only.

  uv run --no-project --python 3.12 scripts/build_agent_sandbox.py                  write the files
  uv run --no-project --python 3.12 scripts/build_agent_sandbox.py --check          regenerate to a temp dir, compare,
                                                                                    re-verify pinned words, privacy and size
  uv run --no-project --python 3.12 scripts/build_agent_sandbox.py --select-words   re-pick invented street and
                                                                                    organisation words (rewrites streets.json)

Standard library only. Run it with Python 3.12 (random sequences differ between versions).
Spec: the company agent build spec, sections 2 and 3.
"""

import argparse
import gzip
import hashlib
import importlib.util
import json
import random
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SANDBOX = ROOT / 'server' / 'sandbox'
CATALOG = ROOT / 'data' / 'agent' / 'catalog.json'
SEED = 20261117
BASE_DATE = '2026-11-17'          # only written to the manifest; records hold offsets
BASE_Y, BASE_M = 2026, 11         # calendar month of offset 0 at generation time (used only for catalogue values)
PYTHON = '3.12'
SIZE_CAP, FILE_CAP = 3_000_000, 750_000

ORGS = ['bsp', 'pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
COS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']

ERRORS = []


def need(cond, msg):
    if not cond:
        ERRORS.append(msg)
    return cond


def dump(obj):
    return json.dumps(obj, sort_keys=True, indent=None, separators=(',', ':'), ensure_ascii=False) + '\n'


def read_json(rel):
    return json.loads((ROOT / rel).read_text())


# ------------------------------------------------------------------------------------------------ formatting

def money(v):
    """Whole dollars -> '$24.1M' / '$1,240'."""
    v = float(v)
    if abs(v) >= 1_000_000:
        return '$%.1fM' % (v / 1_000_000)
    return '${:,.0f}'.format(v)


def money_k(vk):
    return money(vk * 1000)


def t12(hhmm, ampm=True):
    h, m = map(int, hhmm.split(':'))
    s = '%d:%02d' % (h % 12 or 12, m)
    return s + (' am' if h < 12 else ' pm') if ampm else s


def trange(a, b):
    """'08:00','10:00' -> '8:00–10:00 am'; across noon -> '11:00 am–1:00 pm'."""
    same = (int(a[:2]) < 12) == (int(b[:2]) < 12)
    return (t12(a, False) + '–' + t12(b)) if same else (t12(a) + '–' + t12(b))


def days_words(d):
    return 'today' if d == 0 else ('in 1 day' if d == 1 else 'in %d days' % d)


KEEP_CAPS = {'Punctual', 'CET', 'Frontline', 'Thomas', 'BPI', 'Fair', 'BSP', 'KPI', 'IC', 'PRG', 'AC', 'EV', 'Lancaster', 'York', 'Fund'}


def num_word(n):
    return ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] if 0 <= n < 10 else str(n)


def and_list(xs):
    return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' and ' + xs[-1]


def lower_first(s):
    """Lower-case the first letter for use mid-sentence, except names and acronyms."""
    w = s.split(' ', 1)[0] if s else ''
    if not s or w in KEEP_CAPS or (len(w) > 1 and w.isupper()):
        return s
    return s[:1].lower() + s[1:]


def cal_month(m):
    y, mo = divmod(BASE_Y * 12 + BASE_M - 1 + m, 12)
    return y, mo + 1


# ------------------------------------------------------------------------------------------------ inputs

def decode_zips():
    """data/pp_zips.json is columnar: cols, enums, rows."""
    d = read_json('data/pp_zips.json')
    cols, en = d['cols'], d['enums']
    out = []
    for r in d['rows']:
        out.append({c: (en[c][v] if c in en and isinstance(v, int) else v) for c, v in zip(cols, r)})
    return out


def clean_town(city):
    s = city or ''
    s = re.sub(r'\s+(borough|city|CDP|township|town|village)$', '', s, flags=re.I)
    return s.strip()


def clean_county(c):
    return re.sub(r'\s+County$', '', c or '').strip()


# Hubs and their counties: redesigns/punctual-pros/os.js PCI_HUBS (letters from os.js HUBN).
HUBS = [('lancaster', 'L', 'Lancaster', ['Lancaster', 'Lebanon', 'Berks']),
        ('york', 'Y', 'York', ['York', 'Adams', 'Franklin']),
        ('harrisburg', 'H', 'Harrisburg', ['Dauphin', 'Cumberland', 'Perry']),
        ('toms-river', 'N', 'Toms River', ['Ocean', 'Monmouth'])]
HUB_OF_COUNTY = {c: h for h, _, _, cs in HUBS for c in cs}
HUB_NAME = {h: n for h, _, n, _ in HUBS}
HUB_LETTER = {h: l for h, l, _, _ in HUBS}


def build_service_area(zips):
    rows = []
    for r in zips:
        county, state = clean_county(r['county']), r['state']
        if r['service_territory_flag'] == 1 or (state == 'NJ' and county in ('Ocean', 'Monmouth')):
            status = 'in'
        elif r['adjacent_to_service_territory'] == 1:
            status = 'adjacent'
        else:
            continue
        hub = HUB_OF_COUNTY.get(county) if status == 'in' else None
        if status == 'in' and not need(hub, 'service area: no hub for county %s' % county):
            continue
        rows.append([r['zip'], clean_town(r['city']), county, state, status, hub])
    rows.sort(key=lambda x: (x[4] != 'in', x[3], x[0]))
    hubs = {h: {'name': n, 'counties': cs} for h, _, n, cs in HUBS}
    n_in_pa = sum(1 for x in rows if x[4] == 'in' and x[3] == 'PA')
    n_in_nj = sum(1 for x in rows if x[4] == 'in' and x[3] == 'NJ')
    n_adj = sum(1 for x in rows if x[4] == 'adjacent')
    need(n_in_pa == 248, 'service area: expected 248 PA territory zips, got %d' % n_in_pa)
    need(n_in_nj == 78, 'service area: expected 78 NJ Ocean and Monmouth zips, got %d' % n_in_nj)
    need(n_adj == 364, 'service area: expected 364 adjacent zips, got %d' % n_adj)
    return {'rows': rows, 'cols': ['zip', 'town', 'county', 'state', 'status', 'hub'], 'hubs': hubs}


def os_js():
    """TECHS names, trades and hubs, and the JOBS0 ids, from redesigns/punctual-pros/os.js (regex parse)."""
    src = (ROOT / 'redesigns' / 'punctual-pros' / 'os.js').read_text()
    techs = re.findall(r"\{ id: '([A-Z]{2})', n: '([^']+)', t: '(hvac|plumb|elec)', h: '([LYHN])' \}", src)
    jobs = re.findall(r"\{ id: '([LYHN]-\d+)'", src)
    need(len(techs) == 11, 'os.js: expected 11 TECHS, got %d' % len(techs))
    need(len(jobs) == 12, 'os.js: expected 12 JOBS0 ids, got %d' % len(jobs))
    return [(n, t, h) for _, n, t, h in techs], jobs


def anchors():
    """Month-0 run-rate anchors from the growth-plan files (meta.kpi_roadmap) and growth from deal_model.json."""
    files = {'pp': 'data/research/pp_nationwide.json', 'cet': 'data/research/cet_playbook.json',
             'fl': 'data/research/fl_playbook.json', 'ts': 'data/research/ts_playbook.json',
             'bpi': 'data/research/bpi_playbook.json', 'fh': 'data/research/fh_playbook.json'}
    dm = {i['id']: i.get('inputs', {}) for i in read_json('data/research/deal_model.json')['items']}
    out = {}
    for co, f in files.items():
        m0 = [x for x in read_json(f)['meta']['kpi_roadmap'] if x.get('month') == 0][0]
        out[co] = {'rev': float(m0['revenue_usd']), 'ebitda': float(m0['ebitda_usd']),
                   'headcount': int(m0.get('headcount') or 140), 'gr': float(dm[co]['gr']) / 100.0, 'file': f,
                   'technicians': m0.get('technicians'), 'members': m0.get('members'),
                   'cite': f if 'nationwide' in f else 'data/research/%s_*.json (meta.kpi_roadmap, month 0)' % co}
    firm = read_json('data/research/bsp_firm.json')['firm']
    fd = firm['capital_raised_sec_form_d']
    out['fund'] = {'commitments_m': round(fd['broad_sky_partners_lp_total_sold_usd'] / 1e6, 1), 'investors': int(fd['investors'])}
    return out


def county_profiles():
    items = read_json('data/research/pp_market.json')['items']
    out = {}
    for i in items:
        if i.get('kind') != 'county_profile':
            continue
        name = re.sub(r'\s+County,\s*[A-Z]{2}$', '', i['name'])
        mix = i.get('heating_fuel_mix') or {}
        fuel = {'gas': round(mix.get('utility_gas', 0), 2), 'electric': round(mix.get('electricity', 0), 2),
                'oil': round(mix.get('fuel_oil_kerosene', 0), 2), 'propane': round(mix.get('propane_bottled_tank', 0), 2)}
        out['%s|%s' % (name, i['state'])] = {'median_year': int(i['median_year_built']), 'fuel': fuel,
                                             'detached': round(float(i['single_family_detached_share']), 2)}
    return dict(sorted(out.items()))


def incentives():
    items = read_json('data/research/pp_market.json')['items']
    return [i for i in items if i.get('kind') == 'incentive']


# ------------------------------------------------------------------------------------------------ name exclusions

PERSON_KEY = re.compile(r'(^|_)(ceo|cfo|cto|coo|founder|founders|director|directors|executive|executives|leader|leaders|'
                        r'related_person|related_persons|people|person|persons|contact|officer|lead|president|chair|'
                        r'executives_named|other_management_named|bsp_people|new_ceo|prior_ceo|ceo_at_sale|'
                        r'ceo_of_record|listed_contact|ceo_change|new_cfo|bsp_deal_lead|leader_post_close|nuwave_ceo|'
                        r'arrowhead_leaders|chief_compliance_officer)(_|$)', re.I)
FULL_NAME = re.compile(r"\b([A-Z][a-z]+)(?:\s+[A-Z]\.)?\s+(?:[A-Z][a-z]+(?:-[A-Z][a-z]+)?)(?:\s+Jr\.)?")
BANNED_FIRST = ['Tyler', 'Matt', 'Matthew', 'John', 'Sam', 'Samuel', 'Georgette', 'Aditya']
BANNED_FULL = ['Tyler Zachem', 'Matt Buckwalter', 'John Duquette', 'Sam Pawliger', 'Georgette Kiser', 'Aditya Narain']


NETWORK_PEOPLE = {'bsp_team', 'portfolio_ceo', 'portfolio_board', 'operating_partner', 'executive_board'}


def real_names():
    """Person names in the research files, read only to build the exclusion set (never written anywhere)."""
    files = ['data/research/bsp_firm.json'] + sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'data' / 'research').glob('*_playbook.json')) \
        + ['data/research/pp_nationwide.json'] + sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'data' / 'research').glob('*_filings.json'))
    names, loose = set(), set()
    stop = {'Scientific', 'Partners', 'Capital', 'Group', 'York', 'Services', 'Management', 'Holdings', 'Fund', 'Finance', 'Electrical',
            'Pros', 'Harbor', 'Pulpit', 'Sky', 'Officer', 'Director', 'Executive', 'Board', 'Domus', 'Agent', 'Partner'}

    def take(s):
        for m in FULL_NAME.finditer(s):
            loose.add(m.group(1))
        for m in re.finditer(r"\b([A-Z][a-z]+)\s+[A-Z]\.\s+[A-Z][a-z]+", s):
            loose.add(m.group(1))
        for seg in re.split(r"[,;()\[\]'\"]|\band\b|\s-\s", s):
            seg = re.sub(r'\s+Jr\.?$', '', seg.strip())
            if re.fullmatch(r"[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z]+(?:-[A-Z][a-z]+)?", seg) and seg.split()[-1] not in stop:
                names.add(seg)

    def walk(o, key=''):
        if isinstance(o, dict):
            if isinstance(o.get('name'), str) and any(k in o for k in ('title', 'prior', 'role', 'position')):
                take(o['name'])
            for k, v in o.items():
                if PERSON_KEY.search(k):
                    if isinstance(v, str):
                        take(v)
                    elif isinstance(v, list):
                        for x in v:
                            if isinstance(x, str):
                                take(x)
                walk(v, k)
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
    for f in files:
        p = ROOT / f
        if p.exists():
            walk(json.loads(p.read_text()))
    # The relationship map: BSP's team, portfolio CEOs and boards, operating partners and executive boards.
    net = ROOT / 'data' / 'research' / 'bsp_network.json'
    if net.exists():
        for it in json.loads(net.read_text()).get('items') or []:
            if it.get('type') in NETWORK_PEOPLE and isinstance(it.get('name'), str):
                take(it['name'])
    names.update(BANNED_FULL)
    return sorted(names), sorted(loose | {n.split()[0] for n in names})


# Candidate first names for many-of-a-kind people (technicians, dispatchers, customers ...). The generator removes every
# first name of a real person found above, the banned list and the os.js TECHS first names, then keeps the first 120.
FIRST_NAMES = """Abby Adele Alana Alba Alden Alma Alvaro Amara Amos Anika Ansel Arlo Asha Astrid Aubrey Avery Bea Beckett Bianca
Bodhi Bram Brigid Briony Cal Callum Camila Carmen Cecil Celia Cleo Colm Cora Dalia Dario Darius Delia Desmond Devi Dina Dorian
Edie Eitan Elan Elise Elsa Emil Enzo Esme Ezra Farah Felix Fern Fiona Flora Gemma Gideon Greta Hana Harlan Hattie Hugo Idris
Ilse Imani Ines Ingrid Iris Ivo Jada Jalen Jasper Joelle Jonah Joss Juno Kai Kaia Kenji Keira Kofi Lark Leni Levi Lila Lior
Lorna Lucia Mabel Mae Malia Mara Marta Mateo Maya Milo Mira Nadia Nell Nico Nina Noor Odette Omar Opal Oren Otto Paloma Pia
Priya Quinn Rafa Rana Reza Rhea Rina Rocco Rosa Rowan Ruth Sabine Sacha Sana Selma Silas Sofia Soren Tamsin Tariq Tessa
Theo Uma Una Vera Vida Wade Willa Wren Xavi Yara Yusuf Zadie Zara Zeke""".split()

TECH_FIRSTS = set()   # filled from os.js


def name_pool(excluded):
    pool = [n for n in FIRST_NAMES if n not in excluded and n not in TECH_FIRSTS and re.fullmatch(r'[A-Z][a-z]+', n)]
    need(len(pool) >= 120, 'name pool: only %d first names after exclusions' % len(pool))
    return pool[:120]


class People:
    """Deterministic first-name + initial draws; no repeated (first, initial) within one organisation."""

    def __init__(self, rng, pool, banned_pairs, reserved=()):
        self.rng, self.pool, self.banned = rng, pool, set(banned_pairs)
        self.used = set(reserved)

    def name(self):
        for _ in range(5000):
            n = '%s %s.' % (self.rng.choice(self.pool), self.rng.choice('ABCDEFGHIJKLMNOPRSTVWY'))
            if n not in self.used and n not in self.banned:
                self.used.add(n)
                return n
        raise SystemExit('name pool exhausted')

    def person(self, role):
        return {'name': self.name(), 'role': role}


def role_only(role):
    return {'name': None, 'role': role}


YOU = lambda label: {'name': 'You', 'role': label}  # noqa: E731

# One-person offices (spec 3.2): always role-only, never named.
ONE_PERSON = {'Managing partner', 'Partner', 'Operating partner', 'Senior associate', 'Associate', 'Fund CFO',
              'Investor relations', 'Investor relations lead', 'BSP analyst', 'CEO', 'CFO', 'VP operations', 'Controller',
              'Marketing manager', 'Marketing lead', 'VP sales', 'Business development lead', 'Sales lead', 'Growth lead',
              'Location general manager', 'Chief estimator', 'Vice chair', 'Head of finance'}


# ------------------------------------------------------------------------------------------------ invented words

# About 140 invented compound words. --select-words checks each against homes.sqlite (street bases), the business
# directory, the knowledge corpus and municipality names, and pins 40 street bases and 60 organisation words.
CANDIDATES = """Wexcombe Brindlemoor Quillfeather Tamberlyn Orrisdale Pellbrook Hollowmere Marrowick Fennimoor Caddlewick
Thistlecombe Quenwick Larkspindle Oddersley Wimbrelton Corrowmere Skelderby Ravelmoor Tindlecombe Glimmerdale
Haverwick Dunmorrow Sallowmere Brackenfold Kestrelwick Wistermoor Merrowdale Quarrinton Tumbleford Pindlewick Crowsmere
Ottersley Velloway Harrowdine Lindermoor Cobblewick Sedgecombe Myrtlewick Bellingmoor Prenderwick Thornwhistle Gorsemere
Wrenmoor Brisbourne Cradleford Dimbleton Elderwick Foxmorrow Hethercombe Islingmoor Jessamere Lamberdine Mossingford
Orchardine Pewterbrook Quimbleton Rookhaven Saffrondale Umberwick Vellacombe Wendlemoor Yarrowick Zephyrdale Amberwick
Birchwhistle Cindermoor Dovercombe Emberwick Fernwhistle Grislemoor Ivorydale Juniperwick Kettlemoor Lanternwick Marblecombe
Nimbleford Oakwhistle Pondermere Quaverly Rushcombe Sorrelwick Tansymoor Underwhistle Vervainmoor Yewmorrow Ashwhistle
Bellowick Copperdine Drummerly Fiddlecombe Gildermoor Hollisbrook Inglewhit Jasperwick Kinderly Lillimoor Mallowick
Nethercombe Oxlowe Pippindale Quillmoor Rimbledon Sparrowick Tidewhistle Upperdine Wickerdale Brambledine Calderwick
Dappleford Eastwhistle Falconridge Gladdenmoor Heronwick Ironwhistle Kingsmorrow Loftwick Meadowhistle Northwhit Oriendale
Plovermere Quarrymoor Rivelcombe Sandlewick Teaselmoor Vantlewick Weatherdine Yellowick Zinnmoor""".split()

FLAGSHIP_BASES = [('WEXCOMBE', 'LN', 'Lititz'), ('BRINDLEMOOR', 'CT', 'Red Lion'), ('QUILLFEATHER', 'WAY', 'Toms River')]
STREET_SUFFIXES = ['LN', 'CT', 'DR', 'RD', 'ST', 'AVE', 'PL', 'TER', 'CIR']
SUFFIX_SHOW = {'LN': 'Ln', 'CT': 'Ct', 'DR': 'Dr', 'RD': 'Rd', 'ST': 'St', 'AVE': 'Ave', 'PL': 'Pl', 'TER': 'Ter', 'CIR': 'Cir', 'WAY': 'Way'}
CAL_WORDS = re.compile(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|'
                       r'september|october|november|december|spring|summer|fall|autumn|winter|monday|tuesday|wednesday|'
                       r'thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|christmas|thanksgiving|'
                       r'easter|halloween|hanukkah|kwanzaa|holiday|holidays|new year|memorial day|labor day|independence day|'
                       r'black friday|cyber monday|valentine|juneteenth)\b|\b(19|20)\d\d\b|\b20\d\d-\d\d-\d\d\b', re.I)


def load_property():
    spec = importlib.util.spec_from_file_location('bsp_property', ROOT / 'server' / 'property.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def street_words():
    """Whole words (lower case) of real addresses outside homes.sqlite: the sales files and the business directory's addresses.
    A street base must not be one of them (Pemberwick Rd is a real Greenwich, CT street, found this way)."""
    words = set()
    for f in sorted((ROOT / 'data' / 'sales').glob('*.json')):
        words.update(re.findall(r'[a-z]+', f.read_text().lower()))
    words.update(DIRECTORY_ADDR)
    return words


DIRECTORY_ADDR = set()   # filled by directory_words()


def directory_words():
    """Whole words (lower case) of every name and dba in the business directory, decompressed to a temp file. Address words go to
    DIRECTORY_ADDR for street_words()."""
    gz = ROOT / 'data' / 'ppp' / 'directory' / 'businesses.sqlite.gz'
    words, rows = set(), 0
    if not gz.exists():
        return words, 0
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / 'b.sqlite'
        with gzip.open(gz) as f, open(p, 'wb') as out:
            shutil.copyfileobj(f, out)
        con = sqlite3.connect(p)
        for name, dba, addr in con.execute('select name, dba, address from businesses'):
            rows += 1
            for s in (name, dba):
                if s:
                    words.update(re.findall(r'[a-z]+', s.lower()))
            if addr:
                DIRECTORY_ADDR.update(re.findall(r'[a-z]+', addr.lower()))
        con.close()
    return words, rows


def corpus_words():
    p = ROOT / 'server' / 'knowledge' / 'corpus.jsonl'
    words = set()
    if p.exists():
        with open(p) as f:
            for line in f:
                words.update(re.findall(r'[a-z]+', line.lower()))
    return words


def homes_db():
    p = ROOT / 'server' / 'knowledge' / 'homes.sqlite'
    return sqlite3.connect('file:%s?mode=ro' % p, uri=True) if p.exists() else None


def muni_words(con):
    words = set()
    if con:
        for (m,) in con.execute('select muni from munis'):
            words.update(re.findall(r'[a-z]+', (m or '').lower()))
    return words


def street_hits(con, prop, base):
    """Real sales on any street whose key has this base, PA and NJ (spec 3.5)."""
    key = prop.addr_split('100 %s LN' % base)[0].split(' ')[1]
    out = {}
    for st in ('PA', 'NJ'):
        out[st] = con.execute("select count(*) from sales where state=? and (addr_key like ? or addr_key like ?)",
                              (st, '%% %s %%' % key, '%% %s' % key)).fetchone()[0]
    return out


def select_words(customer_towns):
    con, prop = homes_db(), load_property()
    need(con is not None, 'select-words: server/knowledge/homes.sqlite is missing')
    if con is None:
        return None
    munis = muni_words(con)
    dwords, drows = directory_words()
    cwords = corpus_words()
    swords = street_words()
    hs_rows = con.execute('select count(*) from sales').fetchone()[0]
    street_ok, org_ok = [], []
    for w in CANDIDATES:
        base = w.upper()
        hits = street_hits(con, prop, base)
        lw = w.lower()
        if lw in munis or CAL_WORDS.search(w):
            continue
        if hits['PA'] == 0 and hits['NJ'] == 0 and lw not in swords:
            street_ok.append(base)
        if lw not in dwords and lw not in cwords:
            org_ok.append(w)
    for base, _, _ in FLAGSHIP_BASES:
        need(base in street_ok, 'select-words: flagship street base %s failed the homes check' % base)
    flag = [b for b, _, _ in FLAGSHIP_BASES]
    rest = [b for b in street_ok if b not in flag]
    streets = flag + rest[:37]
    need(len(streets) == 40, 'select-words: only %d street bases passed' % len(streets))
    orgs = [w for w in org_ok if w.upper() not in streets][:60]
    need(len(orgs) == 60, 'select-words: only %d organisation words passed' % len(orgs))
    # Towns: each non-flagship base serves three customer towns, round robin, so every town has several streets.
    bases = []
    towns = [t['town'] for t in customer_towns]
    for i, b in enumerate(streets):
        fl = [f for f in FLAGSHIP_BASES if f[0] == b]
        if fl:
            bases.append({'base': b, 'suffixes': [fl[0][1]], 'towns': [fl[0][2]]})
            continue
        k = i - 3
        ts = sorted({towns[(k * 3 + j) % len(towns)] for j in range(3)})
        bases.append({'base': b, 'suffixes': [STREET_SUFFIXES[k % len(STREET_SUFFIXES)]], 'towns': ts})
    return {'selected_with': {'homes_sales_rows': hs_rows, 'directory_rows': drows,
                              'note': 'counts at selection time; street bases have 0 sales in PA and NJ; organisation words '
                                      'are not whole words in the directory, the knowledge corpus or municipality names'},
            'bases': bases, 'org_bases': orgs, 'towns': customer_towns}


def verify_words(streets):
    """--check: re-verify every pinned word against today's homes.sqlite, directory and corpus."""
    con, prop = homes_db(), load_property()
    msgs = []
    if con is not None:
        munis = muni_words(con)
        for b in streets['bases']:
            hits = street_hits(con, prop, b['base'])
            for st, n in sorted(hits.items()):
                if n:
                    msgs.append('street base %s now has %d real sales in %s; run --select-words' % (b['base'], n, st))
            if b['base'].lower() in munis:
                msgs.append('street base %s is now a municipality word; run --select-words' % b['base'])
    dwords, _ = directory_words()
    cwords = corpus_words()
    swords = street_words()
    for b in streets['bases']:
        if b['base'].lower() in swords:
            msgs.append('street base %s is a real street word in the sales files or the business directory; swap it' % b['base'])
    for w in streets['org_bases']:
        if w.lower() in dwords:
            msgs.append('organisation word %s now appears in the business directory; run --select-words' % w)
        if w.lower() in cwords:
            msgs.append('organisation word %s now appears in the knowledge corpus; run --select-words' % w)
    return msgs


def customer_towns(sa):
    """Real towns and zips inside the territory for sandbox customers: a short list of well-known towns per hub (the data
    map's town list, data/pp_zips.json), kept only when the town has 'in' rows in service_area; one zip per town (the
    flagship zips are pinned, otherwise the zip with the most housing units). Towns with a calendar word are skipped."""
    want = {'lancaster': ['Lancaster', 'Lititz', 'Ephrata', 'Manheim', 'Mount Joy', 'Columbia', 'Lebanon', 'Palmyra', 'Myerstown', 'Reading',
                          'Shillington', 'Boyertown'],
            'york': ['York', 'Hanover', 'Red Lion', 'Dallastown', 'Dillsburg', 'Glen Rock', 'Chambersburg', 'Waynesboro', 'Gettysburg'],
            'harrisburg': ['Harrisburg', 'Hershey', 'Hummelstown', 'Camp Hill', 'Mechanicsburg', 'Carlisle', 'Lemoyne', 'Enola'],
            'toms-river': ['Toms River', 'Beachwood', 'Lakewood', 'Point Pleasant', 'Manasquan', 'Belmar']}
    pins = {'Lititz': '17543', 'Red Lion': '17356', 'Toms River': '08753'}
    zips = {z['zip']: z for z in decode_zips()}
    rows = {}
    for zip_, town, county, state, status, hub in sa['rows']:
        if status == 'in' and town:
            rows.setdefault((hub, town), []).append((zips[zip_]['housing_units'] or 0, zip_, county, state))
    out = []
    for hub, _, _, _ in HUBS:
        for t in want[hub]:
            if (hub, t) not in rows or CAL_WORDS.search(t):
                continue
            rs = sorted(rows[(hub, t)], key=lambda x: (-x[0], x[1]))
            z = pins.get(t) or rs[0][1]
            row = [x for x in rs if x[1] == z][0]
            out.append({'town': t, 'zip': z, 'county': row[2], 'state': row[3], 'hub': hub})
    for t, z in pins.items():
        need(any(x['town'] == t and x['zip'] == z for x in out), 'customer towns: flagship town %s %s is not in the service area' % (t, z))
    return sorted(out, key=lambda x: ([h for h, _, _, _ in HUBS].index(x['hub']), x['town']))


# ------------------------------------------------------------------------------------------------ likely layout rules

KINDS = {'main_water': ('Main water shutoff', 'W'), 'water_heater': ('Water heater', 'WH'), 'furnace': ('Furnace', 'F'),
         'air_handler': ('Air handler', 'AH'), 'boiler': ('Boiler', 'B'), 'condenser': ('AC condenser', 'AC'),
         'heat_pump': ('Heat pump', 'HP'), 'panel': ('Electrical panel', 'P'), 'gas_meter': ('Gas meter', 'G'),
         'gas_shutoff': ('Gas shutoff', 'GS'), 'service_switch': ('Furnace switch', 'SW'), 'sewer_cleanout': ('Sewer cleanout', 'C'),
         'sump_pump': ('Sump pump', 'S'), 'fixture_shutoffs': ('Fixture shutoffs', 'FX'), 'oil_tank': ('Oil tank', 'OT'),
         'generator': ('Generator', 'GN')}

SPOTS = {'front-wall-left': [0.15, 0.92], 'front-wall-center': [0.5, 0.92], 'front-wall-right': [0.85, 0.92],
         'rear-wall-left': [0.15, 0.08], 'rear-wall-center': [0.5, 0.08], 'rear-wall-right': [0.85, 0.08],
         'side-left': [0.06, 0.5], 'side-right': [0.94, 0.5], 'center': [0.5, 0.5], 'utility-corner': [0.85, 0.15],
         'stairs-top': [0.4, 0.6], 'kitchen': [0.3, 0.25], 'bath': [0.75, 0.3], 'garage': [0.88, 0.75], 'attic': [0.5, 0.5]}
OUTSIDE_SPOTS = {'outside-left': {'side': 'left', 'at': 0.35}, 'outside-right': {'side': 'right', 'at': 0.35},
                 'outside-rear': {'side': 'rear', 'at': 0.5}, 'outside-front': {'side': 'front', 'at': 0.25}}

# Trade rules of thumb (authored, always labelled likely). Floors: basement, first, second, attic, outside.
LOC = {
    'basement': {
        'main_water': ('basement', 'front-wall-left', 'Front wall where the line comes in from the street, near the water meter'),
        'water_heater': ('basement', 'utility-corner', 'Utility corner, near the floor drain'),
        'furnace': ('basement', 'center', 'Center of the basement, near the chimney or flue'),
        'air_handler': ('basement', 'center', 'Center of the basement, where the ducts meet'),
        'boiler': ('basement', 'center', 'Center of the basement, near the chimney'),
        'condenser': ('outside', 'outside-right', 'Outside on a pad along a side wall'),
        'heat_pump': ('outside', 'outside-right', 'Outside on a pad along a side wall'),
        'panel': ('basement', 'side-left', 'On a side or front wall, near where the power line enters'),
        'gas_meter': ('outside', 'outside-right', 'Outside on a side wall, near where the gas line enters'),
        'gas_shutoff': ('basement', 'center', 'On the gas pipe beside the furnace or boiler, a lever valve'),
        'service_switch': ('basement', 'stairs-top', 'On the wall at the top of the basement stairs, or on the furnace or boiler'),
        'sewer_cleanout': ('basement', 'front-wall-center', 'Front wall where the drain leaves for the street'),
        'sump_pump': ('basement', 'rear-wall-right', 'In a pit in a low corner of the basement'),
        'fixture_shutoffs': ('first', 'kitchen', 'Under each sink and behind each toilet'),
        'oil_tank': ('basement', 'rear-wall-left', 'Along a basement wall near the boiler'),
        'generator': ('outside', 'outside-left', 'Outside on a pad, near the gas meter or the panel wall'),
    },
    'crawl': {
        'main_water': ('first', 'utility-corner', 'In the crawlspace near the front foundation wall, or a utility closet'),
        'water_heater': ('first', 'utility-corner', 'Utility closet or laundry room'),
        'furnace': ('first', 'utility-corner', 'Utility closet, or in the crawlspace'),
        'air_handler': ('first', 'utility-corner', 'Utility closet, or in the crawlspace'),
        'boiler': ('first', 'utility-corner', 'Utility room on the first floor'),
        'condenser': ('outside', 'outside-right', 'Outside on a pad along a side wall'),
        'heat_pump': ('outside', 'outside-right', 'Outside on a pad along a side wall'),
        'panel': ('first', 'garage', 'Garage or utility room wall'),
        'gas_meter': ('outside', 'outside-right', 'Outside on a side wall'),
        'gas_shutoff': ('first', 'utility-corner', 'On the gas pipe at the furnace, boiler or water heater'),
        'service_switch': ('first', 'utility-corner', 'On or beside the furnace or boiler'),
        'sewer_cleanout': ('outside', 'outside-front', 'Outside near the front foundation, a capped pipe'),
        'sump_pump': ('first', 'center', 'In the crawlspace, if there is one'),
        'fixture_shutoffs': ('first', 'kitchen', 'Under each sink and behind each toilet'),
        'oil_tank': ('outside', 'outside-rear', 'Outside along the rear wall'),
        'generator': ('outside', 'outside-left', 'Outside on a pad near the gas meter'),
    },
    'slab': {
        'main_water': ('first', 'utility-corner', 'Utility closet by the water heater, or the garage wall facing the street'),
        'water_heater': ('first', 'garage', 'Garage or utility closet'),
        'furnace': ('first', 'utility-corner', 'Utility closet'),
        'air_handler': ('attic', 'attic', 'In the attic, above the hallway'),
        'boiler': ('first', 'utility-corner', 'Utility closet'),
        'condenser': ('outside', 'outside-right', 'Outside on a pad along a side wall'),
        'heat_pump': ('outside', 'outside-right', 'Outside on a pad along a side wall'),
        'panel': ('first', 'garage', 'Garage wall'),
        'gas_meter': ('outside', 'outside-right', 'Outside on a side wall'),
        'gas_shutoff': ('first', 'utility-corner', 'On the gas pipe at the furnace, boiler or water heater'),
        'service_switch': ('first', 'utility-corner', 'On or beside the furnace or boiler'),
        'sewer_cleanout': ('outside', 'outside-front', 'Outside near the front of the house, a capped pipe'),
        'sump_pump': ('first', 'garage', 'Rare on a slab; check the garage'),
        'fixture_shutoffs': ('first', 'kitchen', 'Under each sink and behind each toilet'),
        'oil_tank': ('outside', 'outside-rear', 'Outside along the rear wall'),
        'generator': ('outside', 'outside-left', 'Outside on a pad near the gas meter'),
    },
}


# How a house heats (trade rules of thumb). The county's most common fuel picks the default type (heat_of_fuel); the customer's
# words override it (heat_words, checked in order, first match wins). Each type lists its equipment kinds, the fuels it burns
# (default_fuel when the county fuel does not fit), the issue whose causes, checks, parts and offers fit it, and what its service
# switch is called (None: no switch).
HEAT_TYPES = {
    'furnace': {'label': 'Furnace', 'kinds': ['furnace'], 'fuels': ['gas', 'propane', 'oil'], 'default_fuel': 'gas', 'issue': 'no_heat',
                'switch_label': 'Furnace switch'},
    'boiler': {'label': 'Boiler', 'kinds': ['boiler'], 'fuels': ['gas', 'oil', 'propane'], 'default_fuel': 'oil', 'issue': 'boiler',
               'switch_label': 'Boiler switch'},
    'heat_pump': {'label': 'Heat pump', 'kinds': ['heat_pump', 'air_handler'], 'fuels': ['electric'], 'default_fuel': 'electric',
                  'issue': 'heat_pump', 'switch_label': None},
}
HEAT_OF_FUEL = {'gas': 'furnace', 'propane': 'furnace', 'oil': 'boiler', 'electric': 'heat_pump'}
HEAT_WORDS = [
    {'heat': 'boiler', 'match': ['radiator', 'boiler', 'baseboards? (are |is )?(cold|not heating|not warm)', 'cold baseboard',
                                 'hot.?water baseboard', 'steam (heat|pipe|boiler)', 'hydronic', 'hot.?water (heat|heating)\\b', 'zone valve',
                                 'circulator']},
    {'heat': 'heat_pump', 'match': ['heat ?pump', 'aux(iliary)? heat', 'emergency heat', 'mini.?split', 'ductless', 'frozen outdoor unit']},
    {'heat': 'furnace', 'match': ['furnace']},
]


def run_rule(kind, floor):
    if kind == 'water':
        return {'kind': 'water', 'label': 'Water line', 'floor': floor, 'via': ['front-wall-left', 'utility-corner'], 'needs': ['main_water', 'water_heater']}
    if kind == 'gas':
        return {'kind': 'gas', 'label': 'Gas line', 'floor': floor, 'via': ['side-right', 'center' if floor == 'basement' else 'utility-corner'], 'needs': ['gas_meter']}
    return {'kind': 'drain', 'label': 'Drain', 'floor': floor,
            'via': ['rear-wall-center', 'front-wall-center'] if floor == 'basement' else ['bath', 'front-wall-center'], 'needs': ['sewer_cleanout']}


ERAS = [{'to': 1939, 'name': 'pre-1940', 'style': 'older two-story', 'stories': 2},
        {'to': 1959, 'name': '1940s-50s', 'style': 'Cape Cod', 'stories': 1.5},
        {'to': 1979, 'name': '1960s-70s', 'style': 'ranch or split-level', 'stories': 1},
        {'to': 1999, 'name': '1980s-90s', 'style': 'two-story colonial', 'stories': 2},
        {'to': 2100, 'name': '2000s or later', 'style': 'two-story', 'stories': 2}]


def build_likely_rules():
    locations = {f: {k: {'floor': v[0], 'spot': v[1], 'note': v[2]} for k, v in sorted(t.items())} for f, t in LOC.items()}
    for f in LOC:
        need(sorted(LOC[f]) == sorted(KINDS), 'likely rules: foundation %s does not cover all 16 kinds' % f)
        for k, v in LOC[f].items():
            need(v[1] in SPOTS or v[1] in OUTSIDE_SPOTS, 'likely rules: unknown spot %s' % v[1])
    runs = {'basement': [run_rule(k, 'basement') for k in ('water', 'gas', 'drain')],
            'crawl': [run_rule(k, 'first') for k in ('water', 'gas', 'drain')],
            'slab': [run_rule(k, 'first') for k in ('water', 'gas', 'drain')]}
    return {'version': 1,
            'source': 'County numbers: data/research/pp_market.json county_profile (ACS 2020-2024). Locations, runs and '
                      'foundations: trade rules of thumb, labelled likely. Era flags: server/property.py LIFE notes.',
            'counties': county_profiles(),
            'eras': ERAS,
            'foundation': {'PA': [{'to': 2100, 'type': 'basement'}], 'NJ': [{'to': 1969, 'type': 'crawl'}, {'to': 2100, 'type': 'slab'}]},
            'heating': {f: HEAT_TYPES[t]['kinds'] for f, t in HEAT_OF_FUEL.items()},
            'heat_types': HEAT_TYPES, 'heat_of_fuel': HEAT_OF_FUEL, 'heat_words': HEAT_WORDS,
            'spots': SPOTS, 'outside_spots': OUTSIDE_SPOTS,
            'kinds': {k: {'label': v[0], 'short': v[1]} for k, v in KINDS.items()},
            'locations': locations, 'runs': runs,
            'materials': [{'kind': 'water', 'to': 1959, 'text': 'galvanized steel'}, {'kind': 'water', 'to': 2100, 'text': 'copper or PEX'},
                          {'kind': 'gas', 'to': 2100, 'text': 'black iron'}, {'kind': 'drain', 'to': 1959, 'text': 'cast iron'},
                          {'kind': 'drain', 'to': 2100, 'text': 'PVC'}],
            'era_flags': [{'from': 1965, 'to': 1973, 'text': 'Aluminum branch wiring is possible in homes built 1965 to 1973.'},
                          {'from': 1800, 'to': 1949, 'text': 'Fuses or early wiring are possible in homes built before 1950.'},
                          {'from': 1800, 'to': 1959, 'text': 'Galvanized supply lines and cast-iron drains are common in homes built before 1960.'}]}


# ------------------------------------------------------------------------------------------------ issues

SAFETY = {'gas': 'If you smell gas: no switches or flames, get everyone out and call the gas utility from outside.',
          'co': 'If a carbon monoxide alarm is sounding: get everyone out, air the house and keep the appliance off until it is checked.',
          'electric': 'Turn off the breaker and test the circuit dead before touching wiring.',
          'water': 'Find the main water shutoff before opening any line.',
          'hot': 'Boiler water and steam scald: let the system cool and drop the pressure before opening a fitting.'}


def I(id_, label, trades, match, focus, causes, check, bring, safety, offers, by_heat=None):
    out = {'id': id_, 'label': label, 'trades': trades, 'match': match, 'focus': focus,
           'causes': [dict(text=c[0], w=c[1], **({'boost': c[2]} if len(c) > 2 else {})) for c in causes],
           'check': check, 'bring': [dict(text=b[0], **({'part': b[1]} if len(b) > 1 else {})) for b in bring],
           'safety': safety, 'offers': offers}
    if by_heat:
        out['by_heat'] = by_heat
    return out


# Job types: redesigns/punctual-pros/os.js JOBS0 and data/research/ai_agents_portfolio.json ag-pp-* triggers.
# Order matters: the first issue whose match pattern hits wins, so the boiler issue (radiators, baseboards) sits before no_heat and
# no_heat sits before breaker ("keeps shutting off"). by_heat: when the house heats with that type (likely_rules heat_types), use
# that issue's causes, checks, parts, safety and offers and keep this issue's label.
ISSUES = [
    I('boiler', 'Boiler or radiators not heating', ['hvac'],
      ['radiator', 'boiler', 'baseboards? (are |is )?(cold|not heating|not warm)', 'cold baseboard', 'hot.?water baseboard',
       'steam (heat|pipe|boiler)', 'hydronic', 'hot.?water (heat|heating)\\b', 'zone valve', 'circulator'],
      ['boiler', 'gas_shutoff', 'service_switch'],
      [('Circulator pump or a zone valve has failed, so hot water does not reach the radiators', 3, {'kind': 'boiler', 'age_over': 12}),
       ('Low pressure or air in the loop; on steam, the low-water cutoff has tripped', 2, {'kind': 'boiler'}),
       ('Burner will not fire: ignitor or flame sensor', 2, {'kind': 'boiler', 'fuel': 'gas'}),
       ('Out of oil, or a clogged oil filter or nozzle', 1, {'kind': 'boiler', 'fuel': 'oil'}),
       ('Thermostat, power or a tripped boiler switch', 1)],
      ['Thermostat calling for heat', 'Boiler switch and breaker on', 'Pressure gauge at 12 to 15 psi, or the sight glass on steam',
       'Circulator running and zone valves open', 'Burner reset button, and the tank gauge on oil'],
      [('Circulator cartridge',), ('Multimeter',), ('Bleeder key, hose and bucket',), ('Flame sensor and emery cloth', 'flame-sensor'),
       ('Oil nozzle and filter',), ('3 to 5 amp fuse', 'fuse-3a')],
      ['hot'], ['boiler_service', 'diag', 'club_total', 'replace_boiler']),
    I('no_heat', 'No heat', ['hvac'],
      ['no heat', '^(?!.*water heater).*not heating', 'runs a few seconds', 'cold (house|inside)', 'heat (is )?(out|off)',
       '^(?!.*(water heater|bang|boom|loud|nois|dryer|stove|oven|range|cooktop|grill|fireplace)).*ignit',
       '(furnace|heat) (won.?t|will not|not|isn.?t|is not|doesn.?t|does not) (start|run|light|ignite|igniting|work|working|turn(ing)? on|come on|fire|firing|kick(ing)? on)',
       'furnace (is )?(out|dead|down|off)', 'furnace .*(shut(s|ting)? (off|down)|cuts? out|stops)', 'furnace clicks'],
      ['furnace', 'boiler', 'heat_pump', 'gas_shutoff', 'service_switch'],
      [('Hot-surface ignitor has failed', 3, {'kind': 'furnace', 'age_over': 10, 'fuel': 'gas', 'rec_word': 'ignitor'}),
       ('Dirty flame sensor shuts the burner down', 2, {'kind': 'furnace', 'fuel': 'gas'}),
       ('Thermostat, power or a tripped furnace switch', 2),
       ('Clogged filter tripping the high-limit switch', 1)],
      ['Thermostat set to heat and calling', 'Furnace switch and breaker on', 'Board light code', 'Filter'],
      [('Universal hot-surface ignitor', 'ign-hsi'), ('Flame sensor and emery cloth', 'flame-sensor'), ('Multimeter',),
       ('3 to 5 amp fuse', 'fuse-3a'), ('16x25 filters', 'filter-1625')],
      ['gas'], ['ignitor', 'diag', 'tuneup', 'club_total', 'replace_furnace'], by_heat={'boiler': 'boiler', 'heat_pump': 'heat_pump'}),
    I('no_cool', 'No cooling', ['hvac'],
      ['no (cool|cooling|ac|a/c|air)', 'not cooling', 'ac (is )?(out|off|not)', 'blowing warm', 'warm air'],
      ['condenser', 'air_handler', 'panel'],
      [('Failed run capacitor on the condenser', 3, {'kind': 'condenser', 'age_over': 8}),
       ('Contactor stuck or burned', 2, {'kind': 'condenser'}),
       ('Low refrigerant from a leak', 2, {'kind': 'condenser', 'age_over': 12}),
       ('Tripped breaker or disconnect off', 1)],
      ['Thermostat set to cool', 'Breaker and outdoor disconnect', 'Condenser fan and compressor running', 'Filter and coil'],
      [('45/5 run capacitor', 'capacitor-45'), ('30 amp contactor', 'contactor-30a'), ('Gauges and leak detector',), ('16x25 filters', 'filter-1625')],
      ['electric'], ['capacitor', 'refrigerant_leak', 'diag', 'club_comfort', 'replace_ac']),
    I('heat_pump', 'Heat pump not heating', ['hvac'],
      ['heat pump', 'heatpump', 'aux heat', 'emergency heat', 'iced (up|over)', 'frozen outdoor unit'],
      ['heat_pump', 'air_handler', 'panel'],
      [('Defrost board or sensor failed; the outdoor coil is iced', 3, {'kind': 'heat_pump', 'age_over': 8}),
       ('Reversing valve stuck', 2, {'kind': 'heat_pump', 'age_over': 10}),
       ('Low refrigerant', 2),
       ('Auxiliary heat strips or breaker off', 1)],
      ['Thermostat mode and aux heat', 'Outdoor coil for ice', 'Breakers for the heat strips', 'Filter'],
      [('Defrost control board',), ('45/5 run capacitor', 'capacitor-45'), ('Gauges and leak detector',), ('Multimeter',)],
      ['electric'], ['heat_pump_repair', 'diag', 'club_comfort', 'replace_heat_pump']),
    I('wh_leak', 'Water heater leaking', ['plumbing'],
      ['water heater (is )?leak', 'leak(ing)? (at|from|under) the (water )?heater', 'tank (is )?leak', 'water on the (basement|garage) floor'],
      ['water_heater', 'gas_shutoff', 'main_water'],
      [('Tank has rusted through; replacement needed', 3, {'kind': 'water_heater', 'age_over': 10}),
       ('Relief valve weeping', 2, {'kind': 'water_heater'}),
       ('Loose supply or drain valve fitting', 1)],
      ['Where the water comes from: tank, relief valve or fittings', 'Cold supply valve on the heater', 'Gas or power to the heater', 'Floor drain'],
      [('Temperature and pressure relief valve', 'tp-valve'), ('Drain hose and wet vac',), ('3/4 in ball valve', 'ball-valve-34'), ('Pipe wrenches',)],
      ['water', 'gas'], ['replace_wh', 'tp_valve', 'replace_wh_tankless', 'club_total']),
    I('no_hot_water', 'No hot water', ['plumbing'],
      ['no hot water', 'hot water (is )?(out|gone)', 'water (is|runs) cold', 'pilot (is )?out',
       'water heater .*(ignit|light|pilot|not working|won.?t work|not heating)'],
      ['water_heater', 'gas_shutoff', 'main_water'],
      [('Pilot or thermocouple failed', 3, {'kind': 'water_heater', 'fuel': 'gas'}),
       ('Heating element burned out', 2, {'kind': 'water_heater', 'fuel': 'electric'}),
       ('Gas control valve failed', 1)],
      ['Gas valve or breaker on', 'Pilot and burner', 'Thermostat dial on the tank', 'Age on the label'],
      [('Thermocouple', 'thermocouple'), ('Heating element', 'wh-element'), ('Multimeter',)],
      ['gas'], ['wh_service', 'replace_wh', 'diag', 'club_total']),
    I('drain_clog', 'Drain clog', ['plumbing'],
      ['clog', 'drain (is )?(slow|backed|stopped)', 'sink (won.?t|not) drain', 'toilet (is )?(clogged|backing)'],
      ['sewer_cleanout'],
      [('Grease and food buildup in the branch line', 3), ('Roots or a sag in the main line', 1), ('Vent blocked', 1)],
      ['Which fixtures are slow', 'Cleanout cap for standing water', 'Vent on the roof if several fixtures gurgle'],
      [('Hand auger and drum machine',), ('Drop cloths and bucket',)],
      [], ['drain', 'main_line', 'camera', 'club_total']),
    I('sewer_backup', 'Sewer backup', ['plumbing'],
      ['sewer', 'backup', 'backing up', 'basement drain (is )?(overflow|backing)', 'sewage'],
      ['sewer_cleanout'],
      [('Main line blocked by roots', 3), ('Collapsed or offset clay pipe', 2), ('Grease blockage', 1)],
      ['Open the cleanout and check for standing water', 'Lowest drain in the house', 'Ask about trees near the line'],
      [('Main-line machine and root cutter',), ('Camera',), ('Gloves, boots and disinfectant',)],
      ['water'], ['main_line', 'camera', 'sewer_repair_estimate']),
    I('sump', 'Sump pump not working', ['plumbing'],
      ['sump', 'pump (won.?t|not) (run|start)', 'basement (is )?(flood|wet)'],
      ['sump_pump', 'panel'],
      [('Float switch stuck', 3, {'kind': 'sump_pump'}), ('Pump motor failed', 2, {'kind': 'sump_pump', 'age_over': 7}),
       ('GFCI outlet tripped', 2)],
      ['Outlet and GFCI', 'Float moves freely', 'Check valve', 'Discharge line outside'],
      [('Vertical float switch', 'sump-float'), ('Replacement pump',), ('Battery backup',)],
      ['electric', 'water'], ['sump', 'replace_sump', 'club_total']),
    I('breaker', 'Breaker keeps tripping', ['electrical'],
      ['breaker', 'tripping', 'trips', 'keeps (cutting|shutting) off'],
      ['panel'],
      [('Overloaded circuit', 3), ('Worn breaker', 2, {'kind': 'panel', 'age_over': 25}), ('Short or ground fault on the circuit', 2)],
      ['Which breaker and what runs on it', 'Breaker warm or loose', 'Signs of heat at outlets'],
      [('20 amp breakers', 'breaker-20a'), ('AFCI breaker', 'afci-20a'), ('Multimeter and circuit tracer',)],
      ['electric'], ['breaker', 'afci_upgrade', 'panel_estimate', 'club_total']),
    I('dead_outlets', 'Outlets not working', ['electrical'],
      ['outlet', 'no power (in|to)', 'lights (are )?out', 'dead (outlet|circuit)'],
      ['panel'],
      [('GFCI tripped upstream', 3), ('Loose backstab connection', 2), ('Breaker tripped', 1)],
      ['GFCI outlets in the kitchen, baths, garage and outside', 'Breaker panel', 'Outlet for heat marks'],
      [('GFCI outlets',), ('Outlet tester and multimeter',)],
      ['electric'], ['outlet_repair', 'gfci', 'diag']),
    I('gas_smell', 'Gas smell', ['hvac', 'plumbing'],
      ['gas (smell|leak|odou?r)', 'smell(s)? (of |like )?gas', 'rotten egg'],
      ['gas_meter', 'gas_shutoff'],
      [('Leak at a fitting or appliance valve', 3), ('Pilot out on an appliance', 2), ('Leak in the gas line', 1)],
      ['Do not enter if the smell is strong', 'Meter shutoff from outside', 'Leak test fittings once safe'],
      [('Combustible gas detector',), ('Leak solution',), ('Meter wrench',)],
      ['gas'], ['gas_leak_check', 'gas_line_repair', 'diag']),
    I('co_alarm', 'Carbon monoxide alarm', ['hvac'],
      ['carbon monoxide', '\\bco\\b alarm', 'co detector', 'alarm (is )?(going off|sounding)'],
      ['furnace', 'water_heater', 'gas_shutoff'],
      [('Cracked heat exchanger or blocked flue', 3, {'kind': 'furnace', 'age_over': 15}),
       ('Water heater venting back', 2, {'kind': 'water_heater'}), ('Alarm at end of life', 1)],
      ['Get everyone out and air the house', 'Combustion analysis on each gas appliance', 'Flue and chimney', 'Alarm age'],
      [('Combustion analyzer',), ('CO meter',), ('Inspection mirror and camera',)],
      ['co', 'gas'], ['co_check', 'diag', 'replace_furnace']),
    I('low_pressure', 'Low water pressure', ['plumbing'],
      ['low (water )?pressure', 'weak (water|flow|shower)', 'pressure (is )?low'],
      ['main_water', 'fixture_shutoffs'],
      [('Pressure reducing valve failing', 3), ('Galvanized pipe clogged with scale', 2), ('Main valve partly closed', 1)],
      ['Pressure gauge at a hose bib', 'Main valve fully open', 'One fixture or the whole house'],
      [('Pressure gauge',), ('Pressure reducing valve',), ('3/4 in ball valve', 'ball-valve-34')],
      ['water'], ['prv', 'main_valve', 'repipe_estimate']),
    I('frozen_pipe', 'Frozen or burst pipe', ['plumbing'],
      ['frozen', 'burst', 'pipe (broke|split|cracked)', 'water (is )?spraying'],
      ['main_water', 'fixture_shutoffs'],
      [('Pipe on an outside wall froze and split', 3), ('Hose bib left connected', 2), ('Crawlspace line exposed', 1)],
      ['Main water off first', 'Find the split', 'Heat tape or insulation on outside walls'],
      [('Repair couplings',), ('Torch or press tool',), ('Pipe insulation',), ('3/4 in ball valve', 'ball-valve-34')],
      ['water', 'electric'], ['frozen_pipe_repair', 'main_valve', 'diag']),
    I('thermostat', 'Thermostat blank', ['hvac'],
      ['thermostat (is )?(blank|dead|off)', 'screen (is )?blank', 'thermostat'],
      ['furnace', 'service_switch'],
      [('Blown 3 or 5 amp fuse on the control board', 3, {'kind': 'furnace'}), ('Dead batteries', 2),
       ('Furnace switch off or condensate safety tripped', 2)],
      ['Batteries', 'Furnace switch and breaker', 'Board fuse', 'Condensate float switch'],
      [('3 to 5 amp fuse', 'fuse-3a'), ('Standard thermostat', 'thermostat-std'), ('Multimeter',)],
      ['electric'], ['thermostat_replace', 'diag', 'club_comfort']),
    I('noise', 'Noisy furnace or AC', ['hvac'],
      ['nois', 'loud', 'bang', 'squeal', 'rattl', 'grinding', 'humming'],
      ['furnace', 'condenser'],
      [('Blower or inducer motor bearings worn', 3, {'kind': 'furnace', 'age_over': 12}),
       ('Delayed ignition boom', 2, {'kind': 'furnace', 'fuel': 'gas'}), ('Loose panel or debris in the fan', 1)],
      ['When it happens: start, run or stop', 'Blower wheel and motor', 'Inducer motor', 'Outdoor fan blade'],
      [('Blower motor oil and belts',), ('Flame sensor and emery cloth', 'flame-sensor'), ('Multimeter',)],
      ['gas'], ['blower_motor', 'inducer_motor', 'tuneup', 'club_comfort']),
    I('unknown', 'Not sure (generic checks)', ['hvac', 'plumbing', 'electrical'],
      [],
      ['main_water', 'panel'],
      [('Ask what changed and when it started', 1)],
      ['Main water shutoff location', 'Panel location and labels', 'Ages of the major equipment'],
      [('Multimeter',), ('Flashlight and inspection mirror',)],
      [], ['diag', 'tuneup', 'club_comfort']),
]


def issue_for(text):
    """The issue a customer's words pick, the way server/workspace.py _text_issue does: an issue label inside the text first
    (longest), then the first issue whose match pattern hits. None when nothing matches."""
    low = (text or '').lower()
    labs = sorted((i for i in ISSUES if i['label'].lower() in low and i['id'] != 'unknown'), key=lambda i: -len(i['label']))
    if labs:
        return labs[0]['id']
    for i in ISSUES:
        if any(re.search(rx, text or '', re.I) for rx in i['match']):
            return i['id']
    return None


def heat_for(text):
    """The heat type a customer's words name (likely_rules heat_words), or None."""
    for w in HEAT_WORDS:
        if any(re.search(rx, text or '', re.I) for rx in w['match']):
            return w['heat']
    return None


# Words a technician types, and the issue (and heat type) they must pick. Checked at every build.
ISSUE_CASES = [('furnace not igniting', 'no_heat', 'furnace'), ("furnace won't ignite", 'no_heat', 'furnace'), ('no ignition', 'no_heat', None),
               ("won't ignite", 'no_heat', None), ('furnace not working', 'no_heat', 'furnace'), ('furnace keeps shutting off', 'no_heat', 'furnace'),
               ("the heat won't come on", 'no_heat', None), ('the radiators are cold', 'boiler', 'boiler'), ("boiler won't fire", 'boiler', 'boiler'),
               ('no heat and the radiators are cold', 'no_heat', 'boiler'), ('baseboards are cold', 'boiler', 'boiler'),
               ('no heat, heat pump', 'no_heat', 'heat_pump'), ('heat pump not heating', 'heat_pump', 'heat_pump'),
               ("water heater won't ignite", 'no_hot_water', None), ('water heater not heating', 'no_hot_water', None),
               ('The furnace makes a loud bang when it starts.', 'noise', 'furnace'), ('The kitchen breaker trips when the microwave runs.', 'breaker', None),
               ('The carbon monoxide alarm went off near the furnace.', 'co_alarm', 'furnace')]


# ------------------------------------------------------------------------------------------------ organisations and apps

ORG_NAME = {'bsp': 'BSP', 'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}
# What each sells and its lines: the site's existing persona strings (assets/chat.js 835-840), spec 1.4.
SELLS = {'bsp': 'Private-equity firm that buys and grows six companies.',
         'pp': 'Heating, cooling, plumbing and electrical service for homes in central PA and the Jersey Shore.',
         'cet': 'Electrical construction, solar and energy services.',
         'fl': 'Managed IT and billing support for law firms.',
         'ts': 'Lab supplies, equipment and services for research and clinical labs.',
         'bpi': 'Public affairs, reputation and campaign work.',
         'fh': 'Swim trunks and beachwear, sold online and wholesale.'}
LINES = {'bsp': ['Fund I', 'New deals and add-ons', 'Portfolio operations'],
         'pp': ['One Hour (HVAC)', 'Ben Franklin (plumbing)', 'Mister Sparky (electrical)', 'Horvath (NJ)', 'Comfort Club'],
         'cet': ['Electrical construction', 'Solar and storage', 'EV charging', 'Wastewater (Horton)', 'Energy efficiency (NuWave)'],
         'fl': ['Managed IT', 'Service desk', 'Cybersecurity', 'E-billing and collections'],
         'ts': ['Lab consumables', 'Equipment', 'Cleanroom supplies', 'Managed inventory'],
         'bpi': ['Public affairs', 'Corporate reputation', 'Campaigns', 'Research'],
         'fh': ['Swim trunks', 'Beachwear', 'Online store', 'Wholesale']}
DEPTS = {'bsp': ['Partners', 'Portfolio operations', 'Deal team', 'Finance and investors'],
         'pp': ['Leadership', 'Marketing', 'Field service', 'Office'],
         'cet': ['Leadership', 'Business development', 'Projects'],
         'fl': ['Leadership', 'Sales', 'Service desk', 'Billing'],
         'ts': ['Leadership', 'Sales', 'Distribution'],
         'bpi': ['Leadership', 'Growth', 'Client service'],
         'fh': ['Leadership', 'Marketing', 'E-commerce']}

APPS = {
    'email': ('Email', 'Inbox threads for this role. Sender names and roles only.', [('threads', 'Threads', 'email threads')]),
    'calendar': ('Calendar', 'Meetings and holds for this role.', [('events', 'Events', 'calendar')]),
    'chat': ('Team chat', 'Channels this role is in.', [('channels', 'Channels', 'channels')]),
    'drive': ('Documents', 'Shared folders, decks and the data room.', [('docs', 'Documents', 'documents')]),
    'dealcloud': ('Deal CRM', 'The deal pipeline: targets, stages, owners and next steps.', [('deals', 'Deals', 'deals')]),
    'salesforce': ('CRM', 'Accounts, opportunities and what the company sells.',
                   [('accounts', 'Accounts', 'accounts'), ('opps', 'Opportunities', 'opportunities'), ('services', 'Services', 'services')]),
    'marketing': ('Marketing', 'Campaigns, leads and what they booked or sold.', [('campaigns', 'Campaigns', 'campaigns')]),
    'servicetitan': ('Field service', 'Jobs, customers, equipment and the price book.',
                     [('jobs', 'Jobs', 'jobs'), ('customers', 'Customers', 'customers'), ('equipment', 'Equipment', 'equipment records'),
                      ('technicians', 'Technicians', 'technicians'), ('pricebook', 'Price book', 'price book')]),
    'procore': ('Construction', 'Projects, RFIs, change orders and daily logs.', [('projects', 'Projects', 'projects')]),
    'servicedesk': ('Service desk', 'Tickets, client runbooks and response times.', [('tickets', 'Tickets', 'tickets'), ('runbooks', 'Runbooks', 'runbooks')]),
    'shopify': ('Online store', 'Orders, products and returns.', [('products', 'Products', 'products'), ('daily', 'Daily sales', 'daily sales'), ('returns', 'Returns', 'returns')]),
    'financials': ('Finance', 'Monthly results, plans, debt and, where kept here, stock, orders or invoices.',
                   [('pnl', 'Monthly P&L', 'monthly P&L'), ('kpis', 'KPIs', 'KPIs'), ('debt', 'Debt', 'debt'), ('close', 'Month-end close', 'month-end close'),
                    ('fund', 'Fund', 'fund'), ('packs', 'Reporting packs', 'reporting packs'), ('inventory', 'Stock', 'stock'),
                    ('orders', 'Orders', 'orders'), ('invoices', 'Invoices', 'invoices')]),
    'adp': ('People', 'Headcount, open roles and payroll totals. No personal records.', [('headcount', 'Headcount', 'headcount'), ('payroll', 'Payroll', 'payroll')]),
}
APP_ORDER = list(APPS)
SET_LABEL = {(a, s): l for a, v in APPS.items() for s, l, _ in v[2]}
SET_PHRASE = {(a, s): p for a, v in APPS.items() for s, _, p in v[2]}
RECORD_SETS = {'docs', 'deals', 'accounts', 'opps', 'services', 'campaigns', 'jobs', 'customers', 'equipment', 'technicians',
               'projects', 'tickets', 'runbooks', 'products', 'returns', 'orders', 'invoices', 'threads', 'channels'}


def app_name(org, app):
    """Example vendor per organisation, the OS build spec section 6. Where a research file names the company's own system it is
    used (Fair Harbor: NetSuite, Shopify; Frontline: ServiceNow; Punctual Pros: ServiceTitan, through its franchisor). Elsewhere
    the name is a product standard in that industry (Chronograph for a firm's portfolio reporting, Viewpoint Vista for an
    electrical contractor's job-cost accounting, CallRail for home-service call and campaign tracking). App ids never change."""
    n = {'email': ('Gmail', 'GM') if org in ('bpi', 'fh') else ('Outlook', 'OL'),
         'calendar': ('Google Calendar', 'GC') if org in ('fh', 'bpi') else ('Outlook Calendar', 'OC'),
         'chat': ('Slack', 'SL') if org in ('bsp', 'bpi', 'fh') else ('Microsoft Teams', 'TM'),
         'drive': ('Google Drive', 'GD') if org in ('bpi', 'fh') else ('SharePoint', 'SP'),
         'dealcloud': ('DealCloud', 'DC'), 'salesforce': ('Salesforce', 'SF'),
         'marketing': ('Klaviyo', 'KL') if org == 'fh' else ('CallRail', 'CR'),
         'servicetitan': ('ServiceTitan', 'ST'), 'procore': ('Procore', 'PC'), 'servicedesk': ('ServiceNow', 'SN'),
         'shopify': ('Shopify', 'SH'),
         'financials': {'bsp': ('Chronograph', 'CG'), 'pp': ('QuickBooks', 'QB'), 'cet': ('Viewpoint Vista', 'VV')}.get(org, ('NetSuite', 'NS')),
         'adp': ('ADP', 'ADP')}[app]
    return {'name': n[0], 'mono': n[1]}


TERMS = {'ServiceTitan': 'ServiceTitan: field-service software for jobs, technicians and pricing.',
         'DealCloud': 'DealCloud: deal-tracking software.', 'Procore': 'Procore: construction project software.',
         'ServiceNow': "ServiceNow: service-desk software; Frontline's legal IT operations run on it.", 'Klaviyo': 'Klaviyo: email and text marketing.'}

# The chat rule is a hard limit for the brief and field styles: it overrides the general length and format guide.
STYLES = {
    'brief': ('Three lines, one action',
              'Hard limit: three short lines, under 60 words in all, no bullets, lists or headings; this overrides the general length '
              'and format guide. Line 1: the answer. Line 2: the number that matters, with its source. Line 3: "Recommend:" and one '
              'action. For a list or a draft (an agenda, deals, people), give the count and the one item that matters most; the full '
              'list stays in the draft on screen and is not repeated in the answer.',
              'Hard limit: three spoken sentences, under 50 words, the last one a recommendation.'),
    'analyst': ('Full numbers, sourced', 'Full numbers with units and [n] on each; a small table is fine; up to 300 words.',
                'Lead with the number, then the two drivers; under 80 words.'),
    'operator': ('Status, risks, next', 'Three short labelled parts: Status, Risks, Next steps; under 180 words.',
                 'Status in one sentence, the top risk, the next step.'),
    'desk': ('Short, with drafts', 'Two to four lines; offer a draft when an action fits.', 'Two sentences; offer a draft.'),
    'field': ('Under 30 seconds',
              'Hard limit for a phone in a driveway: four lines, each one sentence of 15 words or fewer, 60 words in all; no headings '
              'or lists; this overrides the general length and format guide. For a job at an address: line 1, where the equipment for '
              'this issue is and its shutoff; line 2, the likely cause and the first check; line 3, "Bring:" and at most three things; '
              'line 4, "Offer:" one item with its price. A gas or CO report adds one safety line first. Leave other equipment, '
              'pipe runs and history to the sketch unless asked.',
              'Hard limit: under 30 seconds, about 60 words, same order; say "from our records" or "likely" for each location; end '
              'with "The sketch is on your screen." when a sketch was drawn.'),
}

ACTIONS = {'reply_email': ('Reply to an email', 'email'), 'calendar_hold': ('Hold time on the calendar', 'calendar'),
           'chat_post': ('Post in a channel', 'chat'), 'crm_stage': ('Move a deal stage', 'salesforce'),
           'book_job': ('Book a follow-up job', 'servicetitan'), 'log_findings': ('Log what I found', 'servicetitan'),
           'add_recommendation': ('Add a recommendation', 'servicetitan'), 'order_part': ('Order a part', 'servicetitan'),
           'text_customer': ('Text the customer', 'servicetitan'), 'daily_log': ('Add to the daily log', 'procore'),
           'rfi': ('Draft an RFI', 'procore'), 'ticket_update': ('Update a ticket', 'servicedesk')}
PUBLIC = {'search': 'Knowledge base', 'read': 'Knowledge base', 'deal': 'Deal model', 'homes': 'Home sales records',
          'directory': 'Business directory', 'web': 'Web search'}
PUBLIC_ORDER = ['search', 'read', 'deal', 'homes', 'directory', 'web']
VIEWS = ['pnl', 'kpis', 'headcount', 'payroll', 'debt', 'fund']

TEAM_NAME = {'firm': 'Firm', 'deal': 'Deal team', 'ir': 'Investor relations', 'leadership': 'Leadership', 'ops': 'Operations',
             'lancaster': 'Lancaster hub', 'york': 'York hub', 'all-hubs': 'All-hubs', 'crew-2': 'Crew 2', 'pm': 'Project management',
             'estimating': 'Estimating', 'desk-east': 'Service desk east', 'billing': 'Billing team', 'inside-east': 'Inside sales east',
             'swedesboro': 'Swedesboro', 'ad-dc': 'Client service', 'ecommerce': 'E-commerce'}
SALES_TEAM_NAME = {'pp': 'Marketing', 'cet': 'Business development', 'fl': 'Sales', 'ts': 'Sales', 'bpi': 'Growth', 'fh': 'Marketing'}

CO_OPS = {'pp': {'servicetitan': ['jobs', 'customers', 'equipment', 'technicians', 'pricebook']}, 'cet': {'procore': ['projects']},
          'fl': {'servicedesk': ['tickets', 'runbooks']}, 'ts': {'financials': ['inventory', 'orders']}, 'bpi': {},
          'fh': {'shopify': ['products', 'daily', 'returns']}}
CO_CRM = {'pp': {'marketing': ['campaigns']}, 'cet': {'salesforce': ['accounts', 'opps', 'services']},
          'fl': {'salesforce': ['accounts', 'opps', 'services']}, 'ts': {'salesforce': ['accounts', 'opps']},
          'bpi': {'salesforce': ['accounts', 'opps', 'services']}, 'fh': {'marketing': ['campaigns']}}
SALES_LABEL = {'pp': 'Marketing manager', 'cet': 'Business development lead', 'fl': 'Sales lead', 'ts': 'VP sales', 'bpi': 'Growth lead', 'fh': 'Marketing lead'}
SALES_DEPT = {'pp': 'Marketing', 'cet': 'Business development', 'fl': 'Sales', 'ts': 'Sales', 'bpi': 'Growth', 'fh': 'Marketing'}

VP_COPY = {
    'pp': ("Runs day-to-day operations at Punctual Pros. Sees the board, KPIs and headcount, not the ledger.",
           ["Today's board", 'Callbacks this week', 'Tech utilization', 'Overtime risk'], "Ask about today's board"),
    'cet': ('Runs day-to-day operations at CET. Sees projects, KPIs and headcount, not the ledger.',
            ['Projects at risk', 'Open RFIs', 'Crew hours this week', 'Change orders pending'], 'Ask about projects and crews'),
    'fl': ('Runs the service desk and billing operations at Frontline. Sees tickets, KPIs and headcount, not the ledger.',
           ['Tickets past due', 'Ticket backlog', 'First-level resolution', 'Staffing gaps'], 'Ask about the desk'),
    'ts': ('Runs the distribution centers at Thomas Scientific. Sees stock, orders, KPIs and headcount, not the ledger.',
           ['Late orders', 'Stock-outs', 'Fill rate by center', 'Overtime risk'], 'Ask about stock and orders'),
    'bpi': ('Runs staffing and delivery at BPI. Sees KPIs and headcount, not the ledger.',
            ['Hours over scope', 'Retainers at risk', 'Staffing this week', 'Utilization by office'], 'Ask about delivery and staffing'),
    'fh': ('Runs fulfillment and the store at Fair Harbor. Sees orders, products, KPIs and headcount, not the ledger.',
           ['Return rate trend', 'Low stock', 'Top return reasons', 'Fulfillment delays'], 'Ask about orders and stock'),
}
SALES_COPY = {
    'pp': ('Runs marketing for Punctual Pros. Sees campaigns, leads and new-homeowner lists.',
           ['Cost per booked job', 'New homeowners', 'Best campaign', 'Draft a mailer brief'], 'Ask about campaigns or new homeowners'),
    'cet': ('Finds and wins new work for CET. Sees the bid pipeline, accounts and CET\'s services.',
            ['Bids due this week', 'Win rate this year', 'Best-fit bids', 'Draft a follow-up'], 'Ask about bids and accounts'),
    'fl': ("Sells Frontline's services to law firms. Sees the pipeline, renewals and Frontline's services.",
           ['Deals closing soon', 'Renewals at risk', 'Pipeline by stage', 'Draft a follow-up'], 'Ask about the pipeline'),
    'ts': ('Leads sales at Thomas Scientific. Sees accounts, quotes and the pipeline.',
           ['Pipeline by vertical', 'Accounts slipping', 'Quotes awaiting reply', 'Draft a follow-up'], 'Ask about accounts and quotes'),
    'bpi': ("Brings in new work for BPI. Sees the pipeline, proposals and BPI's services.",
            ['New retainers', 'Proposals due', 'Pipeline by practice', 'Draft a follow-up'], 'Ask about the pipeline'),
    'fh': ("Runs marketing for Fair Harbor. Sees campaigns, products and the store's daily sales.",
           ['Email revenue this month', 'Best campaign', 'Repeat purchase rate', 'Draft a campaign brief'], 'Ask about campaigns and sales'),
}


def at_of(co):
    return {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}[co]


def level_of(org, dept, style):
    """The OS level of a role (the OS build spec section 3; assets/session.js levelOf is the same rule)."""
    if org == 'bsp':
        return 'firm_leadership' if dept == 'Partners' else 'firm_team'
    if dept == 'Leadership':
        return 'co_leadership'
    return 'co_field' if style == 'field' else 'co_office'


def mk_role(rid, org, dept, label, label_a, style, team, apps, numbers, numbers_text, public, site, actions, denied, desc, chips,
            placeholder, key_app, action_chips=()):
    tools = (['site_brief'] if site else []) + ['workspace_search', 'open_record'] + (['company_numbers'] if numbers else []) + \
        (['draft_action'] if actions else [])
    comps = sorted({c for c in numbers if c != '_fund'}, key=lambda c: (['pp', 'cet', 'fl', 'ts', 'bpi', 'fh', 'portfolio', 'bsp', 'team'].index(c)))
    views = sorted({v for vs in numbers.values() for v in vs}, key=VIEWS.index)
    by_co = {c: sorted(vs, key=VIEWS.index) for c, vs in numbers.items() if c != '_fund'}
    action_apps = {a: ('dealcloud' if (a == 'crm_stage' and org == 'bsp') else ACTIONS[a][1]) for a in actions}
    return {'id': rid, 'label': label, 'label_a': label_a, 'company': org, 'dept': dept, 'style': style,
            'level': level_of(org, dept, style), 'team': team,
            'key_app': key_app, 'desc': desc, 'chips': chips, 'placeholder': placeholder, 'action_chips': list(action_chips),
            'apps': {a: dict(sorted(s.items())) for a, s in apps.items()},
            'numbers': {'companies': comps, 'views': views, 'by_company': by_co}, 'numbers_text': numbers_text,
            'public': [p for p in PUBLIC_ORDER if p in public], 'tools': tools, 'actions': list(actions), 'action_apps': action_apps,
            'denied_hint': denied}


def own(*sets):
    return {s: 'own' for s in sets}


def build_roles():
    R = []
    six = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
    pf = lambda views: {c: list(views) for c in six + ['portfolio']}  # noqa: E731
    mp_apps = {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'},
               'dealcloud': {'deals': 'company'},
               'financials': {'pnl': 'portfolio', 'kpis': 'portfolio', 'debt': 'portfolio', 'close': 'portfolio', 'fund': 'company', 'packs': 'company'},
               'adp': {'headcount': 'portfolio'}}
    deal_pub = ['search', 'read', 'deal', 'directory', 'web']
    bsp_acts = ['reply_email', 'calendar_hold', 'chat_post', 'crm_stage']
    R.append(mk_role('bsp-managing-partner', 'bsp', 'Partners', 'Managing partner', 'the managing partner', 'brief', 'firm', mp_apps,
                     {**pf(['pnl', 'kpis', 'headcount', 'debt']), '_fund': ['fund']},
                     'P&L, KPIs, headcount and debt for all six companies; the fund', deal_pub, False, bsp_acts, '',
                     'Runs the firm and the investment committee. Sees every company\'s numbers, the fund and the deal pipeline.',
                     ['Portfolio this month', 'Who is off plan?', 'Deals near LOI', 'Draft IC agenda'],
                     'Ask about the portfolio, the fund or a deal', 'financials'))
    p_apps = json.loads(json.dumps(mp_apps))
    del p_apps['financials']['fund'], p_apps['financials']['packs']
    R.append(mk_role('bsp-partner', 'bsp', 'Partners', 'Partner', 'a partner', 'brief', 'firm', p_apps,
                     pf(['pnl', 'kpis', 'headcount', 'debt']), 'P&L, KPIs, headcount and debt for all six companies', deal_pub, False,
                     bsp_acts, 'The fund CFO has the fund figures.',
                     'Leads new deals and add-ons on the deal team. Sees the deal pipeline, the data room and every company\'s numbers.',
                     ['My live deals', "This week's deadlines", 'Price an add-on', 'Draft a seller reply'], 'Ask about a deal or a company', 'financials'))
    R.append(mk_role('bsp-operating-partner', 'bsp', 'Portfolio operations', 'Operating partner', 'the operating partner', 'operator', 'firm',
                     {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'},
                      'financials': {'pnl': 'portfolio', 'kpis': 'portfolio'}, 'adp': {'headcount': 'portfolio'}},
                     pf(['pnl', 'kpis', 'headcount']), 'P&L, KPIs and headcount for all six companies', ['search', 'read', 'web'], False,
                     ['reply_email', 'calendar_hold', 'chat_post'], 'The deal team has the deal pipeline, and the fund CFO has the fund.',
                     "Works with company teams for BSP's Portfolio Resource Group (PRG). Sees operating numbers and headcount for all six companies.",
                     ['KPIs off target', 'Hiring gaps', "This week's reviews", 'Draft a check-in'], "Ask about a company's operations", 'financials'))
    sa_apps = {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'},
               'dealcloud': {'deals': 'company'}, 'financials': {'pnl': 'portfolio', 'kpis': 'portfolio', 'debt': 'portfolio'}}
    R.append(mk_role('bsp-senior-associate', 'bsp', 'Deal team', 'Senior associate', 'a senior associate', 'analyst', 'deal', sa_apps,
                     pf(['pnl', 'kpis', 'debt']), 'P&L, KPIs and debt for all six companies', deal_pub, False, bsp_acts,
                     'The fund CFO has the fund figures.', 'Builds models and runs diligence. Gets full numbers with sources.',
                     ['Model this add-on', 'Data room gaps', 'PP margin bridge', 'Open diligence asks'], 'Ask for a model, a bridge or a document', 'financials'))
    R.append(mk_role('bsp-associate', 'bsp', 'Deal team', 'Associate', 'an associate', 'analyst', 'deal', json.loads(json.dumps(sa_apps)),
                     pf(['pnl', 'kpis', 'debt']), 'P&L, KPIs and debt for all six companies', deal_pub, False, bsp_acts,
                     'The fund CFO has the fund figures.', 'Supports deals and portfolio monitoring. Gets full numbers with sources.',
                     ['Monthly KPI pack', 'Find add-on targets', 'Summarize a CIM', 'Update the tracker'], 'Ask for numbers, targets or a summary', 'financials'))
    R.append(mk_role('bsp-fund-cfo', 'bsp', 'Finance and investors', 'Fund CFO', 'the fund CFO', 'analyst', 'firm',
                     {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'},
                      'financials': {'pnl': 'portfolio', 'kpis': 'portfolio', 'debt': 'portfolio', 'close': 'portfolio', 'fund': 'company', 'packs': 'company'},
                      'adp': {'headcount': 'company'}},
                     {**pf(['pnl', 'kpis', 'debt']), 'bsp': ['headcount'], '_fund': ['fund']},
                     'P&L, KPIs and debt for all six companies; BSP headcount; the fund', ['search', 'read', 'deal'], False,
                     ['reply_email', 'calendar_hold', 'chat_post'], 'The deal team has the deal pipeline.',
                     "Runs fund accounting and portfolio reporting as controller. Sees the fund ledger and every company's financials.",
                     ['Capital called to date', 'Covenant tests due', 'Late reporting packs', 'Quarter-end checklist'],
                     "Ask about the fund or a company's books", 'financials'))
    R.append(mk_role('bsp-investor-relations', 'bsp', 'Finance and investors', 'Investor relations', 'the investor relations lead', 'desk', 'firm',
                     {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'team'},
                      'financials': {'fund': 'company'}},
                     {'_fund': ['fund']}, 'The fund', ['search', 'read', 'web'], False, ['reply_email', 'calendar_hold', 'chat_post'],
                     'The fund CFO has company results.', 'Handles investor questions and reports. Sees fund-level results and approved documents.',
                     ['Open investor questions', 'Quarterly letter status', 'Fund I summary', 'Draft a reply'],
                     'Ask about the fund or an investor question', 'financials'))
    # Portfolio company leadership (spec 2.2), per company in UNIFIED order.
    for co in six:
        Co = ORG_NAME[co]
        ops, crm = CO_OPS[co], CO_CRM[co]
        fin_ceo = {'pnl': 'company', 'kpis': 'company', 'debt': 'company', 'close': 'company'}
        if co == 'ts':
            fin_ceo.update({'inventory': 'company', 'orders': 'company'})
        apps = {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'}}
        for a, sets in list(crm.items()) + list(ops.items()):
            apps.setdefault(a, {}).update({s: 'company' for s in sets})
        apps.setdefault('financials', {}).update(fin_ceo)
        apps['adp'] = {'headcount': 'company', 'payroll': 'company'}
        five = {co: ['pnl', 'kpis', 'headcount', 'payroll', 'debt']}
        crm_act = ['crm_stage'] if co in ('cet', 'fl', 'ts', 'bpi') else []
        key_ceo = 'financials'
        R.append(mk_role('%s-ceo' % co, co, 'Leadership', 'CEO', 'the CEO of %s' % Co, 'brief', 'leadership', apps, five,
                         '%s P&L, KPIs, headcount, payroll and debt' % Co, ['search', 'read', 'deal', 'web'], co == 'pp',
                         ['reply_email', 'calendar_hold', 'chat_post'] + crm_act, "BSP's deal team has the other companies' numbers.",
                         'Runs %s. Sees every app at the company and gets three-line answers with a recommendation.' % Co,
                         ['This month vs plan', 'Top three risks', 'Cash and debt', 'Draft board update'], 'Ask about %s' % Co, key_ceo))
        apps = {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'}}
        if 'salesforce' in crm:
            apps['salesforce'] = {'opps': 'company'}
        else:
            apps['marketing'] = {'campaigns': 'company'}
        apps['financials'] = {'pnl': 'company', 'kpis': 'company', 'debt': 'company', 'close': 'company'}
        if co == 'fl':
            apps['financials']['invoices'] = 'company'
        apps['adp'] = {'headcount': 'company', 'payroll': 'company'}
        R.append(mk_role('%s-cfo' % co, co, 'Leadership', 'CFO', 'the CFO of %s' % Co, 'analyst', 'leadership', apps, five,
                         '%s P&L, KPIs, headcount, payroll and debt' % Co, ['search', 'read', 'deal'], False,
                         ['reply_email', 'calendar_hold', 'chat_post'], 'The VP operations has the field records.',
                         "Owns %s's books and reporting to BSP. Gets full numbers with sources." % Co,
                         ['Margin bridge', 'Month-end close', 'Covenant tests due', 'Payroll vs plan'], 'Ask about the books', 'financials'))
        apps = {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'}}
        for a, sets in ops.items():
            apps.setdefault(a, {}).update({s: 'company' for s in sets})
        apps.setdefault('financials', {})['kpis'] = 'company'
        apps['adp'] = {'headcount': 'company'}
        vdesc, vchips, vph = VP_COPY[co]
        key_vp = {'pp': 'servicetitan', 'cet': 'procore', 'fl': 'servicedesk', 'ts': 'financials', 'bpi': 'financials', 'fh': 'shopify'}[co]
        R.append(mk_role('%s-vp-operations' % co, co, 'Leadership', 'VP operations', 'the VP operations at %s' % Co, 'operator', 'ops', apps,
                         {co: ['kpis', 'headcount']}, '%s KPIs and headcount' % Co, ['search', 'read', 'web'], co == 'pp',
                         ['reply_email', 'calendar_hold', 'chat_post'] + (['book_job', 'text_customer'] if co == 'pp' else []),
                         'The CFO has the ledger and the debt.', vdesc, vchips, vph, key_vp))
        apps = {'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'company'}}
        for a, sets in crm.items():
            apps.setdefault(a, {}).update({s: 'company' for s in sets})
        if co == 'fh':
            apps['shopify'] = {'products': 'company', 'daily': 'company'}
        apps['financials'] = {'kpis': 'company'}
        sdesc, schips, sph = SALES_COPY[co]
        lab = SALES_LABEL[co]
        pub = ['search', 'read', 'web'] + (['homes'] if co == 'pp' else []) + (['directory'] if co == 'cet' else [])
        key_s = list(crm)[0]
        R.append(mk_role('%s-sales' % co, co, SALES_DEPT[co], lab, 'the %s at %s' % (lab[0].lower() + lab[1:] if lab != 'VP sales' else lab, Co),
                         'desk', 'sales', apps, {co: ['kpis']}, '%s KPIs' % Co, pub, False,
                         ['reply_email', 'calendar_hold', 'chat_post'] + crm_act, 'The CFO has the ledger.', sdesc, schips, sph, key_s))
    # Teams (spec 2.2 third table)
    tech_apps = {'servicetitan': {'jobs': 'own', 'customers': 'own', 'equipment': 'own', 'pricebook': 'company'}, 'chat': {'channels': 'team'}}
    tech_acts = ['log_findings', 'add_recommendation', 'order_part', 'text_customer', 'book_job']
    field_chips = ["Where's the main shutoff?", 'Likely cause', 'What to bring', 'What to offer']
    tech_action_chips = [{'label': 'Log what I found', 'prompt': 'Log what I found on this job.'},
                         {'label': 'Add a recommendation', 'prompt': 'Add a recommendation for this customer.'},
                         {'label': 'Order a part', 'prompt': 'Order a part for this job.'},
                         {'label': 'Text: 10 minutes out', 'prompt': "Text the customer that I'm 10 minutes out."}]
    ph_field = "Where are you headed, and what's wrong?"
    R.append(mk_role('pp-hvac-technician', 'pp', 'Field service', 'HVAC technician', 'an HVAC technician', 'field', 'lancaster', tech_apps, {},
                     'None', [], True, tech_acts, 'The location general manager or the CFO has company results.',
                     'Runs heating and cooling calls from the Lancaster hub. Sees own jobs, the customers on them and the price book.',
                     field_chips, ph_field, 'servicetitan', tech_action_chips))
    R.append(mk_role('pp-plumber', 'pp', 'Field service', 'Plumber', 'a plumber', 'field', 'york', json.loads(json.dumps(tech_apps)), {},
                     'None', [], True, tech_acts, 'The location general manager or the CFO has company results.',
                     'Runs plumbing calls from the York hub. Sees own jobs, the customers on them and the price book.',
                     field_chips, ph_field, 'servicetitan', tech_action_chips))
    R.append(mk_role('pp-dispatcher', 'pp', 'Office', 'Dispatcher', 'a dispatcher', 'desk', 'all-hubs',
                     {'servicetitan': {s: 'company' for s in ['jobs', 'customers', 'equipment', 'technicians', 'pricebook']},
                      'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}}, {}, 'None', ['search', 'read'], True,
                     ['book_job', 'text_customer', 'reply_email', 'chat_post'], 'The CFO has company results.',
                     "Books and routes calls and answers customers for all four hubs. Sees the whole board, technicians and customers.",
                     ["Who's free now?", 'Late jobs', 'Members waiting', 'Text a customer'], 'Ask about the board or a customer', 'servicetitan'))
    R.append(mk_role('pp-location-gm', 'pp', 'Office', 'Location general manager', 'the Lancaster location general manager', 'operator', 'lancaster',
                     {'servicetitan': {'jobs': 'team', 'customers': 'team', 'equipment': 'team', 'technicians': 'team', 'pricebook': 'company'},
                      'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'financials': {'kpis': 'team'},
                      'adp': {'headcount': 'team'}}, {'team': ['kpis', 'headcount']}, 'Lancaster hub KPIs and headcount', ['search', 'read'], True,
                     ['book_job', 'text_customer', 'reply_email', 'calendar_hold', 'chat_post'], 'The CFO has the company-wide P&L.',
                     "Runs the Lancaster hub. Sees the hub's board, technicians and numbers.",
                     ["Today's hub board", 'Open recommendations', 'Hub revenue last month', 'Callbacks this week'], 'Ask about the Lancaster hub', 'servicetitan'))
    R.append(mk_role('cet-project-manager', 'cet', 'Projects', 'Project manager', 'a project manager', 'operator', 'pm',
                     {'procore': own('projects'), 'email': own('threads'), 'calendar': own('events'), 'chat': {'channels': 'team'}, 'drive': {'docs': 'team'}},
                     {}, 'None', ['search', 'read'], False, ['rfi', 'daily_log', 'reply_email', 'calendar_hold', 'chat_post'],
                     'The CFO has company results.', 'Runs CET projects from award to closeout. Sees own projects, RFIs and change orders.',
                     ['Projects at risk', 'RFIs due', 'Change orders pending', 'Draft an RFI'], 'Ask about your projects', 'procore'))
    R.append(mk_role('cet-field-electrician', 'cet', 'Projects', 'Field electrician', 'a field electrician', 'field', 'crew-2',
                     {'procore': own('projects'), 'chat': {'channels': 'team'}}, {}, 'None', [], False, ['daily_log', 'rfi', 'chat_post'],
                     'The project manager has bids and results.', 'Works on CET job sites. Sees assigned projects, drawings and the daily log.',
                     ["Today's site", 'Open RFIs', "Who's on site today?", "Who's the PM?"], "Ask about today's site", 'procore',
                     [{'label': "Log today's work", 'prompt': "Add today's work to the daily log."}, {'label': 'Draft an RFI', 'prompt': 'Draft an RFI for this site.'}]))
    R.append(mk_role('cet-estimator', 'cet', 'Business development', 'Estimator', 'an estimator', 'analyst', 'estimating',
                     {'salesforce': {'opps': 'team', 'accounts': 'company', 'services': 'company'}, 'drive': {'docs': 'team'},
                      'email': own('threads'), 'calendar': own('events')}, {}, 'None', ['search', 'read', 'web'], False,
                     ['reply_email', 'calendar_hold', 'crm_stage'], 'The project manager has project costs.',
                     "Prices bids for CET. Sees the bid pipeline, CET's services and past estimates.",
                     ['Bids due this week', 'Similar past jobs', 'Bid or no bid', 'Draft a question'], 'Ask about a bid', 'salesforce'))
    R.append(mk_role('fl-help-desk-engineer', 'fl', 'Service desk', 'Help-desk engineer', 'a help-desk engineer', 'desk', 'desk-east',
                     {'servicedesk': {'tickets': 'own', 'runbooks': 'company'}, 'chat': {'channels': 'team'}}, {}, 'None', [], False,
                     ['ticket_update', 'chat_post'], 'The billing team or the CFO has billing and results.',
                     'Works the service desk for law-firm clients. Sees assigned tickets and client runbooks.',
                     ['My open tickets', 'Due next', 'Runbook for this', 'Similar past tickets'], 'Ask about a ticket', 'servicedesk',
                     [{'label': 'Update a ticket', 'prompt': 'Update my top ticket for the client.'}]))
    R.append(mk_role('fl-billing-specialist', 'fl', 'Billing', 'Billing specialist', 'a billing specialist', 'desk', 'billing',
                     {'financials': {'invoices': 'team'}, 'email': own('threads')}, {}, 'None', [], False, ['reply_email'],
                     'The CFO has company results.', 'Handles e-billing for law-firm clients. Sees invoices, rejections and payment status.',
                     ['Rejected invoices', 'Oldest unpaid', 'Top rejection reasons', 'Draft a client email'], 'Ask about invoices', 'financials'))
    R.append(mk_role('ts-inside-sales', 'ts', 'Sales', 'Inside sales rep', 'an inside sales rep', 'desk', 'inside-east',
                     {'salesforce': {'accounts': 'own', 'opps': 'own'}, 'financials': {'orders': 'own'}, 'email': own('threads'), 'calendar': own('events')},
                     {}, 'None', ['search', 'read'], False, ['reply_email', 'calendar_hold', 'crm_stage'],
                     'The VP sales or the CFO has margins and results.', 'Sells to lab accounts by phone and email. Sees own accounts, quotes and orders.',
                     ['Quotes to chase', 'Accounts slipping', 'Reorders due', 'Draft a follow-up'], 'Ask about your accounts', 'salesforce'))
    R.append(mk_role('ts-warehouse-lead', 'ts', 'Distribution', 'Warehouse lead', 'the Swedesboro warehouse lead', 'field', 'swedesboro',
                     {'financials': {'inventory': 'team', 'orders': 'team'}, 'chat': {'channels': 'team'}}, {}, 'None', [], False, ['chat_post'],
                     'The VP operations has pricing and results.', 'Runs the Swedesboro distribution center. Sees stock and open orders there.',
                     ['Low stock', 'Shipping today', 'Late orders', 'Orders on hold'], 'Ask about stock or orders', 'financials',
                     [{'label': 'Post to the floor', 'prompt': 'Post the late orders in the floor channel.'}]))
    R.append(mk_role('bpi-account-director', 'bpi', 'Client service', 'Account director', 'an account director', 'desk', 'ad-dc',
                     {'salesforce': {'accounts': 'own', 'opps': 'own', 'services': 'company'}, 'email': own('threads'), 'calendar': own('events'),
                      'chat': {'channels': 'team'}, 'drive': {'docs': 'team'}}, {}, 'None', ['search', 'read', 'web'], False,
                     ['reply_email', 'calendar_hold', 'chat_post'], 'The CFO has firm results.',
                     "Leads client accounts at BPI. Sees own clients, retainers, hours and BPI's services.",
                     ['Hours over scope', 'Client asks this week', 'Renewals coming', 'Draft a status note'], 'Ask about your clients', 'salesforce'))
    R.append(mk_role('fh-ecommerce-manager', 'fh', 'E-commerce', 'E-commerce manager', 'the e-commerce manager', 'desk', 'ecommerce',
                     {'shopify': {'products': 'company', 'daily': 'company', 'returns': 'company'}, 'email': own('threads'), 'calendar': own('events'),
                      'chat': {'channels': 'team'}}, {}, 'None', ['search', 'read', 'web'], False, ['chat_post', 'reply_email', 'calendar_hold'],
                     'The CFO has margins and results.', 'Runs the Fair Harbor online store. Sees orders, products and returns.',
                     ['Sales yesterday', 'Top returns', 'Low stock', 'Draft a promo post'], 'Ask about the store', 'shopify'))
    # Tree order: organisations in UNIFIED order, depts in 1.4 order, roles as listed there.
    tree = {'bsp': ['bsp-managing-partner', 'bsp-partner', 'bsp-operating-partner', 'bsp-senior-associate', 'bsp-associate', 'bsp-fund-cfo', 'bsp-investor-relations'],
            'pp': ['pp-ceo', 'pp-cfo', 'pp-vp-operations', 'pp-sales', 'pp-hvac-technician', 'pp-plumber', 'pp-dispatcher', 'pp-location-gm'],
            'cet': ['cet-ceo', 'cet-cfo', 'cet-vp-operations', 'cet-sales', 'cet-estimator', 'cet-project-manager', 'cet-field-electrician'],
            'fl': ['fl-ceo', 'fl-cfo', 'fl-vp-operations', 'fl-sales', 'fl-help-desk-engineer', 'fl-billing-specialist'],
            'ts': ['ts-ceo', 'ts-cfo', 'ts-vp-operations', 'ts-sales', 'ts-inside-sales', 'ts-warehouse-lead'],
            'bpi': ['bpi-ceo', 'bpi-cfo', 'bpi-vp-operations', 'bpi-sales', 'bpi-account-director'],
            'fh': ['fh-ceo', 'fh-cfo', 'fh-vp-operations', 'fh-sales', 'fh-ecommerce-manager']}
    by_id = {r['id']: r for r in R}
    order = [rid for org in ORGS for rid in tree[org]]
    need(sorted(order) == sorted(by_id), 'roles: tree order does not list every role once')
    need(len(order) == 44, 'roles: expected 44, got %d' % len(order))
    out = []
    for i, rid in enumerate(order):
        r = by_id[rid]
        r['order'] = i
        need(DEPTS[r['company']].index(r['dept']) >= 0, 'roles: unknown dept %s' % r['dept'])
        out.append(r)
    # Depts must appear in the 1.4 order inside each organisation.
    for org in ORGS:
        ds = [r['dept'] for r in out if r['company'] == org]
        need(ds == sorted(ds, key=DEPTS[org].index), 'roles: %s departments out of order' % org)
    return out


# ------------------------------------------------------------------------------------------------ ServiceTitan (Punctual Pros)

# Price book. Concept-site prices (redesigns/punctual-pros/site.js PLANS and os.js JOBS0 `val`) are labelled
# "Illustrative price on the concept site"; the rest are modeled.
ILLUS, MODELED = 'Illustrative price on the concept site', 'Modeled'
# code, name, trade, kind, unit, tier, price, low, high, member_price, financing, basis
PRICEBOOK = [
    ('diag', 'Diagnostic visit', 'All', 'Diagnostic', 'visit', None, 89, None, None, 0, False, ILLUS),
    ('after_hours', 'After-hours fee', 'All', 'Fee', 'visit', None, 99, None, None, 0, False, ILLUS),
    ('tuneup', 'HVAC tune-up', 'HVAC', 'Maintenance', 'system', None, 129, None, None, 0, False, ILLUS),
    ('club_comfort', 'Comfort Club: Comfort plan', 'All', 'Membership', 'month', None, 14.95, None, None, None, False, ILLUS),
    ('club_total', 'Comfort Club: Total Home plan', 'All', 'Membership', 'month', None, 24.95, None, None, None, False, ILLUS),
    ('ignitor', 'Ignitor replacement', 'HVAC', 'Repair', 'each', None, 420, None, None, None, False, ILLUS),
    ('flame_sensor', 'Flame sensor clean or replace', 'HVAC', 'Repair', 'each', None, 189, None, None, None, False, MODELED),
    ('capacitor', 'Run capacitor replacement', 'HVAC', 'Repair', 'each', None, 245, None, None, None, False, MODELED),
    ('contactor', 'Contactor replacement', 'HVAC', 'Repair', 'each', None, 265, None, None, None, False, MODELED),
    ('refrigerant_leak', 'Refrigerant leak search and repair', 'HVAC', 'Repair', 'job', None, 680, 450, 1400, None, False, MODELED),
    ('heat_pump_repair', 'Heat pump repair', 'HVAC', 'Repair', 'job', None, 640, None, None, None, False, ILLUS),
    ('thermostat_replace', 'Thermostat replacement', 'HVAC', 'Repair', 'each', None, 285, None, None, None, False, MODELED),
    ('blower_motor', 'Blower motor replacement', 'HVAC', 'Repair', 'each', None, 890, None, None, None, False, MODELED),
    ('inducer_motor', 'Inducer motor replacement', 'HVAC', 'Repair', 'each', None, 760, None, None, None, False, MODELED),
    ('condensate_pump', 'Condensate pump replacement', 'HVAC', 'Repair', 'each', None, 310, None, None, None, False, MODELED),
    ('co_check', 'Carbon monoxide safety check', 'HVAC', 'Diagnostic', 'visit', None, 149, None, None, None, False, MODELED),
    ('boiler_service', 'Boiler service', 'HVAC', 'Maintenance', 'visit', None, 229, None, None, None, False, MODELED),
    ('oil_burner_service', 'Oil burner service', 'HVAC', 'Maintenance', 'visit', None, 249, None, None, None, False, MODELED),
    ('humidifier', 'Whole-home humidifier', 'HVAC', 'Upgrade', 'each', None, 980, None, None, None, False, MODELED),
    ('air_cleaner', 'Air cleaner install', 'HVAC', 'Upgrade', 'each', None, 1150, None, None, None, True, MODELED),
    ('duct_sealing', 'Duct sealing', 'HVAC', 'Upgrade', 'job', None, 1450, 900, 2400, None, True, MODELED),
    ('replace_furnace', 'Replacement furnace', 'HVAC', 'Replacement', 'each', 'good', 11500, 11500, None, None, True, ILLUS),
    ('replace_furnace_better', 'Replacement furnace, two-stage', 'HVAC', 'Replacement', 'each', 'better', 13900, 13900, None, None, True, MODELED),
    ('replace_furnace_best', 'Replacement furnace, variable speed', 'HVAC', 'Replacement', 'each', 'best', 16800, 16800, None, None, True, MODELED),
    ('replace_ac', 'Replacement AC', 'HVAC', 'Replacement', 'each', 'good', 7900, 7900, None, None, True, MODELED),
    ('replace_ac_better', 'Replacement AC, two-stage', 'HVAC', 'Replacement', 'each', 'better', 9600, 9600, None, None, True, MODELED),
    ('replace_ac_best', 'Replacement AC, variable speed', 'HVAC', 'Replacement', 'each', 'best', 12400, 12400, None, None, True, MODELED),
    ('replace_heat_pump', 'Replacement heat pump', 'HVAC', 'Replacement', 'each', 'good', 10800, 10800, None, None, True, MODELED),
    ('replace_heat_pump_better', 'Replacement heat pump, two-stage', 'HVAC', 'Replacement', 'each', 'better', 13200, 13200, None, None, True, MODELED),
    ('replace_heat_pump_best', 'Replacement heat pump, cold-climate', 'HVAC', 'Replacement', 'each', 'best', 16500, 16500, None, None, True, MODELED),
    ('replace_boiler', 'Replacement boiler', 'HVAC', 'Replacement', 'each', 'good', 12800, 12800, None, None, True, MODELED),
    ('ductless', 'Ductless mini-split, one zone', 'HVAC', 'Replacement', 'each', None, 5600, 4800, 7200, None, True, MODELED),
    ('replace_wh', 'Water heater replacement, 40 to 50 gal', 'Plumbing', 'Replacement', 'each', 'good', 1850, None, None, None, True, ILLUS),
    ('replace_wh_better', 'Water heater replacement, high efficiency', 'Plumbing', 'Replacement', 'each', 'better', 2650, None, None, None, True, MODELED),
    ('replace_wh_tankless', 'Tankless water heater', 'Plumbing', 'Replacement', 'each', 'best', 4900, 4200, 6100, None, True, MODELED),
    ('tp_valve', 'Relief valve replacement', 'Plumbing', 'Repair', 'each', None, 245, None, None, None, False, MODELED),
    ('wh_service', 'Water heater repair', 'Plumbing', 'Repair', 'job', None, 325, None, None, None, False, MODELED),
    ('wh_flush', 'Water heater flush', 'Plumbing', 'Maintenance', 'visit', None, 159, None, None, None, False, MODELED),
    ('drain', 'Kitchen drain clearing', 'Plumbing', 'Repair', 'job', None, 289, None, None, None, False, ILLUS),
    ('main_line', 'Main sewer line clearing', 'Plumbing', 'Repair', 'job', None, 425, None, None, None, False, MODELED),
    ('camera', 'Sewer camera inspection', 'Plumbing', 'Diagnostic', 'job', None, 295, None, None, None, False, MODELED),
    ('sewer_repair_estimate', 'Sewer line repair estimate', 'Plumbing', 'Estimate', 'visit', None, 0, 3500, 12000, None, True, MODELED),
    ('sump', 'Sump pump test and battery', 'Plumbing', 'Repair', 'job', None, 540, None, None, None, False, ILLUS),
    ('replace_sump', 'Sump pump replacement', 'Plumbing', 'Replacement', 'each', None, 890, None, None, None, False, MODELED),
    ('prv', 'Pressure reducing valve replacement', 'Plumbing', 'Repair', 'each', None, 520, None, None, None, False, MODELED),
    ('main_valve', 'Main shutoff valve replacement', 'Plumbing', 'Repair', 'each', None, 465, None, None, None, False, MODELED),
    ('repipe_estimate', 'Repipe estimate', 'Plumbing', 'Estimate', 'visit', None, 0, 4500, 9500, None, True, MODELED),
    ('frozen_pipe_repair', 'Burst pipe repair', 'Plumbing', 'Repair', 'job', None, 610, None, None, None, False, MODELED),
    ('fixture_valves', 'Fixture shutoff valve replacement', 'Plumbing', 'Repair', 'each', None, 129, None, None, None, False, MODELED),
    ('toilet_repair', 'Toilet repair', 'Plumbing', 'Repair', 'each', None, 215, None, None, None, False, MODELED),
    ('faucet', 'Faucet replacement', 'Plumbing', 'Repair', 'each', None, 340, None, None, None, False, MODELED),
    ('gas_leak_check', 'Gas leak check', 'Plumbing', 'Diagnostic', 'visit', None, 149, None, None, None, False, MODELED),
    ('gas_line_repair', 'Gas line repair', 'Plumbing', 'Repair', 'job', None, 690, 450, 1500, None, False, MODELED),
    ('breaker', 'Breaker replacement', 'Electrical', 'Repair', 'each', None, 365, None, None, None, False, ILLUS),
    ('afci_upgrade', 'AFCI breaker upgrade', 'Electrical', 'Upgrade', 'each', None, 295, None, None, None, False, MODELED),
    ('outlet_repair', 'Outlet repair', 'Electrical', 'Repair', 'each', None, 185, None, None, None, False, MODELED),
    ('gfci', 'GFCI outlet install', 'Electrical', 'Repair', 'each', None, 210, None, None, None, False, MODELED),
    ('panel_estimate', 'Panel upgrade estimate', 'Electrical', 'Estimate', 'visit', None, 2900, None, None, None, True, ILLUS),
    ('replace_panel', 'Panel replacement, 200 A', 'Electrical', 'Replacement', 'each', None, 3400, 2900, 4600, None, True, MODELED),
    ('surge', 'Whole-home surge protector', 'Electrical', 'Upgrade', 'each', None, 425, None, None, None, False, MODELED),
    ('generator', 'Generator annual service', 'Electrical', 'Maintenance', 'visit', None, 249, None, None, None, False, ILLUS),
    ('generator_install', 'Standby generator install', 'Electrical', 'Replacement', 'each', None, 14500, 12000, 18500, None, True, MODELED),
    ('ev_charger', 'EV charger install', 'Electrical', 'Upgrade', 'each', None, 1650, 1200, 2400, None, True, MODELED),
    ('smoke_co_alarms', 'Smoke and CO alarm replacement', 'Electrical', 'Repair', 'house', None, 395, None, None, None, False, MODELED),
]
PARTS = [('ign-hsi', 'Universal hot-surface ignitor', 64), ('flame-sensor', 'Flame sensor', 28), ('fuse-3a', '3 to 5 amp fuse', 3),
         ('filter-1625', '16x25 filter', 12), ('capacitor-45', '45/5 run capacitor', 34), ('contactor-30a', '30 amp contactor', 29),
         ('tp-valve', 'Temperature and pressure relief valve', 42), ('wh-element', 'Water heater element', 38), ('thermocouple', 'Thermocouple', 18),
         ('sump-float', 'Vertical float switch', 46), ('breaker-20a', '20 amp breaker', 14), ('afci-20a', '20 amp AFCI breaker', 52),
         ('ball-valve-34', '3/4 in ball valve', 24), ('thermostat-std', 'Standard thermostat', 89)]

TRADE_ROLE = {'HVAC': 'HVAC technician', 'Plumbing': 'Plumber', 'Electrical': 'Electrician'}
# type, issue, value, what the customer said (starts so that "Customer says " + lower-first reads well)
JOB_TYPES = {
    'HVAC': [('No heat', 'no_heat', 420, ['The furnace clicks but never lights.', 'No heat since this morning. The house is at 61.', 'The furnace starts, then shuts off after a minute.']),
             ('Heat pump not heating', 'heat_pump', 640, ['The heat pump runs but blows cool air.', 'The outdoor unit is covered in ice.']),
             ('Thermostat blank', 'thermostat', 285, ['The thermostat screen is blank.', 'The thermostat went dark and nothing runs.']),
             ('Noisy furnace', 'noise', 260, ['The furnace makes a loud bang when it starts.', 'A squeal from the furnace every time it runs.']),
             ('No cooling', 'no_cool', 380, ['The AC runs but the house will not cool.', 'The outdoor unit hums but the fan does not spin.']),
             ('Tune-up (member)', 'unknown', 0, ['Member tune-up. No problems reported.']),
             ('Carbon monoxide alarm', 'co_alarm', 149, ['The carbon monoxide alarm went off near the furnace.']),
             ('Replacement estimate', 'unknown', 0, ['The furnace is old and they want options.'])],
    'Plumbing': [('Water heater leaking', 'wh_leak', 1850, ['The water heater is leaking at the bottom.', 'Water on the basement floor next to the water heater.']),
                 ('No hot water', 'no_hot_water', 325, ['No hot water since last night.', 'The water runs cold after a minute.']),
                 ('Drain clog', 'drain_clog', 289, ['The kitchen sink will not drain.', 'The tub drains very slowly.']),
                 ('Sewer backup', 'sewer_backup', 425, ['The basement floor drain is backing up.']),
                 ('Sump pump test and battery', 'sump', 540, ['The sump pump did not kick on in the last rain.']),
                 ('Low water pressure', 'low_pressure', 520, ['The water pressure dropped in the whole house.']),
                 ('Gas smell', 'gas_smell', 149, ['There is a faint gas smell near the water heater.'])],
    'Electrical': [('Breaker keeps tripping', 'breaker', 365, ['The kitchen breaker trips when the microwave runs.', 'A breaker trips every night.']),
                   ('Outlets not working', 'dead_outlets', 185, ['Half the outlets in the living room are dead.']),
                   ('Panel upgrade estimate', 'unknown', 2900, ['They want a bigger panel for an EV charger.']),
                   ('Generator annual service', 'unknown', 249, ['Member generator service.'])],
}
REC_FOR = {'no_heat': ('Replace hot-surface ignitor', 'ignitor'), 'heat_pump': ('Replace the defrost board', 'heat_pump_repair'),
           'no_cool': ('Replace the run capacitor', 'capacitor'), 'noise': ('Replace the blower motor', 'blower_motor'),
           'thermostat': ('Replace the thermostat', 'thermostat_replace'), 'wh_leak': ('Replace the water heater', 'replace_wh'),
           'no_hot_water': ('Replace the water heater', 'replace_wh'), 'drain_clog': ('Camera the main line', 'camera'),
           'sewer_backup': ('Sewer line repair estimate', 'sewer_repair_estimate'), 'sump': ('Replace the sump pump', 'replace_sump'),
           'low_pressure': ('Replace the pressure reducing valve', 'prv'), 'breaker': ('AFCI breaker upgrade', 'afci_upgrade'),
           'dead_outlets': ('Add GFCI outlets in the kitchen', 'gfci'), 'unknown': ('Whole-home surge protector', 'surge'),
           'co_alarm': ('Replace smoke and CO alarms', 'smoke_co_alarms'), 'gas_smell': ('Gas line repair', 'gas_line_repair')}
NOTE_FOR = {'no_heat': 'Cleaned the flame sensor. Ignitor shows wear.',
            'heat_pump': 'Cleared ice from the coil. Defrost board failing.',
            'no_cool': 'Replaced the run capacitor. Charge is low.',
            'noise': 'Blower bearings worn; oiled for now.',
            'thermostat': 'Replaced the board fuse. Loose stat wire.',
            'wh_leak': 'Tank weeping at the base. Wants a quote.',
            'no_hot_water': 'Replaced the thermocouple. Sediment in tank.',
            'drain_clog': 'Cleared grease from the kitchen line.',
            'sewer_backup': 'Cleared roots from the main at 40 ft.',
            'sump': 'Float was sticking; cleaned and tested.',
            'low_pressure': '38 psi at the hose bib. PRV failing.',
            'breaker': 'Kitchen circuit overloaded. Quoted a new circuit.',
            'dead_outlets': 'Reset a tripped GFCI in the garage.',
            'unknown': 'Tune-up done. No problems found.',
            'co_alarm': 'Readings normal. Replaced an old alarm.',
            'gas_smell': 'Tightened a union at the heater. Leak test passed.'}
BOILER_NOTE = 'Bled the radiators and reset the burner. Circulator is noisy.'
BOILER_REC = ('Boiler service', 'boiler_service')
FLAGSHIP_CUSTOMERS = {'st-cus-0001', 'st-cus-0002', 'st-cus-0003'}
URGENT_ISSUES = {'no_heat', 'heat_pump', 'no_cool', 'wh_leak', 'no_hot_water', 'sewer_backup', 'gas_smell', 'co_alarm', 'breaker'}
WINDOWS = [('08:00', '10:00'), ('08:30', '10:30'), ('10:00', '12:00'), ('10:30', '12:30'), ('12:00', '14:00'), ('13:00', '15:00'),
           ('14:00', '16:00'), ('15:30', '17:30'), ('16:00', '18:00')]


def eq_note(kind, spot, floor, rng):
    side = {'front-wall-left': 'front wall, left side', 'front-wall-center': 'front wall center', 'front-wall-right': 'front wall, right side',
            'rear-wall-left': 'rear wall, left side', 'rear-wall-center': 'rear wall center', 'rear-wall-right': 'rear wall, right corner',
            'side-left': 'left side wall', 'side-right': 'right side wall', 'center': 'center', 'utility-corner': 'utility corner',
            'stairs-top': 'top of the stairs', 'kitchen': 'kitchen', 'bath': 'hall bath', 'garage': 'garage wall', 'attic': 'attic',
            'outside-left': 'left side of the house', 'outside-right': 'right side of the house', 'outside-rear': 'behind the house',
            'outside-front': 'front of the house'}[spot]
    t = {'main_water': ['%s, by the meter' % side.capitalize(), '%s, where the line enters' % side.capitalize()],
         'water_heater': ['%s, by the floor drain' % side.capitalize(), '%s, on a stand' % side.capitalize()],
         'furnace': ['%s, by the chimney' % side.capitalize(), '%s, under the trunk duct' % side.capitalize()],
         'air_handler': ['In the attic, above the hallway' if floor == 'attic' else '%s, under the main trunk duct' % side.capitalize()],
         'boiler': ['%s, by the chimney' % side.capitalize()],
         'condenser': ['On a pad on the %s' % side, 'On a pad %s' % side],
         'heat_pump': ['On a pad on the %s' % side],
         'panel': ['%s, labeled door' % side.capitalize(), '%s' % side.capitalize()],
         'gas_meter': ['On the %s' % side],
         'gas_shutoff': ['Gas pipe at the furnace, yellow handle', 'Gas pipe by the water heater'],
         'service_switch': ['Top of the stairs, red plate' if spot == 'stairs-top' else 'On the furnace'],
         'sewer_cleanout': ['%s, capped pipe' % side.capitalize(), 'Capped pipe, %s' % side],
         'sump_pump': ['Pit in the %s' % side, 'Pit in the %s, with a battery backup' % side],
         'fixture_shutoffs': ['Under the kitchen sink', 'Under sinks and toilets'],
         'oil_tank': ['Along the %s' % side],
         'generator': ['On a pad on the %s' % side]}[kind]
    return rng.choice(t)


def eq_detail(kind, fuel, rng):
    tons = rng.choice([2, 2.5, 3, 3.5, 4])
    tons_s = ('%g' % tons)
    return {'furnace': '%s, %s BTU' % ('Gas' if fuel == 'gas' else 'Propane', '{:,}'.format(rng.choice([60000, 80000, 100000]))),
            'boiler': '%s, cast iron' % ('Oil' if fuel == 'oil' else 'Gas'),
            'heat_pump': '%s ton' % tons_s, 'air_handler': '%s ton, heat strips' % tons_s, 'condenser': '%s ton' % tons_s,
            'water_heater': '%s, %d gal' % ({'gas': 'Gas', 'propane': 'Propane', 'oil': 'Electric', 'electric': 'Electric'}[fuel], rng.choice([40, 50, 50, 75])),
            'panel': '%d A' % rng.choice([100, 150, 200, 200]), 'main_water': rng.choice(['3/4 in ball valve', '3/4 in gate valve', '1 in ball valve']),
            'gas_shutoff': None, 'service_switch': None, 'sewer_cleanout': None, 'sump_pump': rng.choice(['1/3 hp', '1/3 hp, battery backup']),
            'fixture_shutoffs': rng.choice(['Quarter-turn valves', 'Multi-turn valves']), 'oil_tank': '275 gal', 'generator': '22 kW, natural gas',
            'gas_meter': None}[kind]


MAKES = {'furnace': ['Carrier', 'Trane', 'Lennox', 'Rheem'], 'condenser': ['Carrier', 'Trane', 'Lennox', 'Rheem'],
         'heat_pump': ['Carrier', 'Trane', 'Lennox'], 'air_handler': ['Carrier', 'Trane', 'Lennox'],
         'water_heater': ['Bradford White', 'A. O. Smith', 'Rheem'], 'panel': ['Square D', 'Siemens', 'Eaton']}
AGE = {'furnace': (2, 26), 'condenser': (2, 20), 'heat_pump': (1, 18), 'air_handler': (1, 18), 'water_heater': (1, 16),
       'boiler': (5, 35), 'panel': (5, 40), 'sump_pump': (1, 9), 'generator': (2, 10)}


def era_of(year):
    return [e for e in ERAS if year <= e['to']][0]


def foundation_of(state, year):
    return 'basement' if state == 'PA' else ('crawl' if year <= 1969 else 'slab')


def material(kind, year, rng):
    if kind == 'gas':
        return 'black iron'
    if kind == 'water':
        if year <= 1959:
            return rng.choice(['galvanized steel', 'copper'])
        return 'PEX' if year >= 2000 else 'copper'
    return 'cast iron' if year <= 1959 else 'PVC'


def run_record(kind, floor, year, rng, side='right'):
    r = run_rule(kind, floor)
    mat = material(kind, year, rng)
    note = {'water': 'Meter, shutoff, %s to heater' % mat, 'gas': 'Meter on the %s side wall to the appliances' % side,
            'drain': '%s to the cleanout' % mat.capitalize()}[kind]
    via = list(r['via'])
    if kind == 'gas':
        via[0] = 'side-' + side   # the line enters on the meter's side, so the note and the drawing agree
    return {'kind': kind, 'label': r['label'], 'floor': floor, 'via': via, 'material': mat, 'note': note}


def build_servicetitan(rng, people, streets, techs_os, sa):
    towns = streets['towns']
    by_town = {}
    for b in streets['bases']:
        for t in b['towns']:
            by_town.setdefault(t, []).append((b['base'], b['suffixes'][0]))
    towns_by_hub = {}
    for t in towns:
        towns_by_hub.setdefault(t['hub'], []).append(t)
    for t in towns:
        need(t['town'] in by_town, 'streets: no street base for customer town %s' % t['town'])
    county_rule = county_profiles()
    used_addr = set()

    def make_house(t, year=None):
        prof = county_rule.get('%s|%s' % (t['county'], t['state']), {'median_year': 1975, 'fuel': {'gas': .4, 'electric': .3, 'oil': .2, 'propane': .1}})
        if year is None:
            year = int(max(1905, min(2022, rng.gauss(prof['median_year'], 20))))
            if 1900 <= year <= 1904:
                year = 1906
        era = era_of(year)
        fnd = foundation_of(t['state'], year)
        fu = prof['fuel']
        tot = sum(fu.values())
        x, acc, fuel = rng.random() * tot, 0, 'gas'
        for k in ('gas', 'electric', 'oil', 'propane'):
            acc += fu[k]
            if x <= acc:
                fuel = k
                break
        style = era['style']
        if style == 'ranch or split-level':
            style = rng.choice(['ranch', 'split-level'])
        stories = era['stories'] if style != 'split-level' else 2
        return {'year': year, 'sqft': rng.randrange(1100, 2900, 50), 'stories': stories, 'style': style, 'foundation': fnd,
                'basement': (rng.choice(['full', 'full', 'full', 'partial']) if fnd == 'basement' else 'none'), 'fuel': fuel,
                'garage': rng.choice(['attached-right', 'attached-left', 'detached', 'none'])}

    def make_addr(t, base=None, suffix=None, house_no=None):
        for _ in range(500):
            b, s = (base, suffix) if base else rng.choice(by_town[t['town']])
            n = house_no or rng.choice([rng.randrange(100, 1900), rng.randrange(2100, 3000)])
            line = '%d %s %s' % (n, b.capitalize(), SUFFIX_SHOW[s])
            key = '%d %s %s' % (n, b, s)
            if key not in used_addr:   # address keys are unique across towns, so a match by street address is never ambiguous
                used_addr.add(key)
                return {'line': line, 'town': t['town'], 'state': t['state'], 'zip': t['zip'], 'county': t['county']}, key, str(n), b
        raise SystemExit('address space exhausted')

    def equipment_for(cus, house, rng_, flagship=None):
        f, fuel = house['foundation'], house['fuel']
        kinds = []
        if fuel in ('gas', 'propane'):
            kinds += ['furnace', 'gas_shutoff'] + (['service_switch'] if rng_.random() < .6 else [])
        elif fuel == 'oil':
            kinds += ['boiler', 'oil_tank']
        else:
            kinds += ['heat_pump', 'air_handler']
        if fuel != 'electric' and rng_.random() < 0.7:
            kinds.append('condenser')
        kinds += ['water_heater', 'main_water', 'panel']
        opt = [k for k, p in (('sewer_cleanout', .5), ('sump_pump', .25 if f == 'basement' else 0), ('fixture_shutoffs', .15),
                              ('gas_meter', .1 if fuel in ('gas', 'propane') else 0), ('generator', .04)) if rng_.random() < p]
        kinds += opt
        kinds = kinds[:7]
        while len(kinds) < 6:
            kinds.append([k for k in ('sewer_cleanout', 'fixture_shutoffs', 'sump_pump', 'gas_meter') if k not in kinds][0])
        out = []
        for k in kinds:
            floor, spot, _ = LOC[f][k]
            alt = {'main_water': ['front-wall-left', 'front-wall-right'], 'panel': ['side-left', 'side-right', 'front-wall-right'],
                   'water_heater': ['utility-corner', 'rear-wall-left'] if f == 'basement' else [spot],
                   'condenser': ['outside-right', 'outside-left', 'outside-rear'], 'heat_pump': ['outside-right', 'outside-left', 'outside-rear']}
            if k in alt and rng_.random() < 0.35:
                spot = rng_.choice(alt[k])
            age = AGE.get(k)
            yr = None
            if age:
                yr = max(house['year'], 2026 - rng_.randint(*age))
            mk = rng_.choice(MAKES[k]) if k in MAKES else None
            out.append({'kind': k, 'floor': floor, 'spot': spot, 'note': eq_note(k, spot, floor, rng_), 'detail': eq_detail(k, fuel, rng_),
                        'make': mk, 'year': yr, 'last_service_d': (-rng_.randint(20, 400) if k in ('furnace', 'boiler', 'heat_pump', 'condenser', 'water_heater', 'generator') and rng_.random() < 0.6 else None)})
        return out

    # ---- technicians (85; hubs by customer share; trade mix 60/28/12 from data/research/pp_filings.json estimate_table)
    plan = {'lancaster': (19, 9, 4), 'york': (13, 6, 2), 'harrisburg': (11, 5, 3), 'toms-river': (8, 4, 1)}
    trade_of = {'hvac': 'HVAC', 'plumb': 'Plumbing', 'elec': 'Electrical'}
    hub_of = {'L': 'lancaster', 'Y': 'york', 'H': 'harrisburg', 'N': 'toms-river'}
    techs = []
    techs.append({'id': 'st-tech-you-hvac', 'co': 'pp', 'team': 'lancaster', 'name': 'You', 'trade': 'HVAC', 'years': 7, 'for': ['pp-hvac-technician'], 'status': 'Driving'})
    techs.append({'id': 'st-tech-you-plumber', 'co': 'pp', 'team': 'york', 'name': 'You', 'trade': 'Plumbing', 'years': 5, 'for': ['pp-plumber'], 'status': 'Driving'})
    for n, t, h in techs_os:
        people.used.add(n)
        techs.append({'id': 'st-tech-' + n.lower().replace(' ', '').replace('.', ''), 'co': 'pp', 'team': hub_of[h], 'name': n,
                      'trade': trade_of[t], 'years': rng.randint(3, 15), 'status': 'Free'})
    i = 0
    for hub, (nh, npl, ne) in plan.items():
        for trade, total in (('HVAC', nh), ('Plumbing', npl), ('Electrical', ne)):
            have = sum(1 for x in techs if x['team'] == hub and x['trade'] == trade)
            for _ in range(total - have):
                i += 1
                techs.append({'id': 'st-tech-%03d' % i, 'co': 'pp', 'team': hub, 'name': people.name(), 'trade': trade,
                              'years': rng.randint(1, 18), 'status': 'Free'})
    need(len(techs) == 85, 'servicetitan: expected 85 technicians, got %d' % len(techs))

    # ---- customers: flagship first (spec 1.8), then per hub
    customers, equipment = [], []
    tw = {t['town']: t for t in towns}
    eq_n = [0]

    def add_customer(cid, hub, t, name, house, addr, key, hn, base, member, runs, items):
        c = {'id': cid, 'co': 'pp', 'team': hub, 'name': name, 'address': addr, 'addr_key': key, 'house_no': hn, 'street_base': base,
             'member': member, 'house': house, 'runs': runs, 'notes': [], 'recs': []}
        customers.append(c)
        for it in items:
            eq_n[0] += 1
            equipment.append(dict({'id': 'st-eq-%04d' % eq_n[0], 'co': 'pp', 'team': hub, 'customer': cid}, **it))
        return c

    # Flagship 1: HVAC technician, 418 Wexcombe Ln, Lititz (spec 1.8 and 3.3).
    a, k, hn, b = make_addr(tw['Lititz'], 'WEXCOMBE', 'LN', 418)
    h1 = {'year': 1962, 'sqft': 1850, 'stories': 2, 'style': 'two-story', 'foundation': 'basement', 'basement': 'full', 'fuel': 'gas', 'garage': 'attached-right'}
    f_items = [
        {'kind': 'furnace', 'floor': 'basement', 'spot': 'center', 'note': 'Center by the chimney', 'detail': 'Gas, 80,000 BTU', 'make': 'Carrier', 'year': 2012, 'last_service_d': -38},
        {'kind': 'gas_shutoff', 'floor': 'basement', 'spot': 'center', 'note': "On the gas pipe at the furnace's left side, yellow-handle valve", 'detail': None, 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'service_switch', 'floor': 'basement', 'spot': 'stairs-top', 'note': 'Top of the basement stairs, red cover plate', 'detail': None, 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'main_water', 'floor': 'basement', 'spot': 'front-wall-left', 'note': 'Front wall, left of the water meter', 'detail': '3/4 in ball valve', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'water_heater', 'floor': 'basement', 'spot': 'utility-corner', 'note': 'Utility corner, next to the floor drain', 'detail': 'Gas, 40 gal', 'make': 'Bradford White', 'year': 2014, 'last_service_d': None},
        {'kind': 'condenser', 'floor': 'outside', 'spot': 'outside-rear', 'note': 'On a pad behind the house, by the back steps', 'detail': '3 ton', 'make': 'Carrier', 'year': 2012, 'last_service_d': -210},
        {'kind': 'panel', 'floor': 'basement', 'spot': 'side-left', 'note': 'Left side wall, gray box with a labeled door', 'detail': '200 A', 'make': 'Square D', 'year': 2003, 'last_service_d': None},
        {'kind': 'sewer_cleanout', 'floor': 'basement', 'spot': 'front-wall-center', 'note': 'Front wall center, capped pipe at floor level', 'detail': '4 in cap', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'fixture_shutoffs', 'floor': 'first', 'spot': 'kitchen', 'note': 'Under the kitchen sink', 'detail': 'Quarter-turn valves', 'make': None, 'year': None, 'last_service_d': None},
    ]
    f_runs = [{'kind': 'water', 'label': 'Water line', 'floor': 'basement', 'via': ['front-wall-left', 'utility-corner'], 'material': 'copper',
               'note': 'Meter then shutoff at the front wall, copper to the water heater'},
              {'kind': 'drain', 'label': 'Drain', 'floor': 'basement', 'via': ['rear-wall-center', 'front-wall-center'], 'material': 'cast iron',
               'note': 'Cast-iron drain to the cleanout at the front wall'}]
    people.used.add('Marta V.')
    c1 = add_customer('st-cus-0001', 'lancaster', tw['Lititz'], 'Marta V.', h1, a, k, hn, b,
                      {'plan': 'Comfort', 'since_m': -26, 'renew_d': 41, 'visits_due': 1}, f_runs, f_items)
    # Flagship 2: plumber, 27 Brindlemoor Ct, Red Lion (York hub).
    a, k, hn, b = make_addr(tw['Red Lion'], 'BRINDLEMOOR', 'CT', 27)
    h2 = {'year': 1978, 'sqft': 1640, 'stories': 2, 'style': 'split-level', 'foundation': 'basement', 'basement': 'full', 'fuel': 'gas', 'garage': 'attached-left'}
    p_items = [
        {'kind': 'water_heater', 'floor': 'basement', 'spot': 'rear-wall-left', 'note': 'Rear wall, left side, on a stand by the floor drain', 'detail': 'Gas, 50 gal', 'make': 'Rheem', 'year': 2013, 'last_service_d': -300},
        {'kind': 'gas_shutoff', 'floor': 'basement', 'spot': 'rear-wall-left', 'note': 'On the gas pipe beside the water heater', 'detail': 'Lever valve', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'main_water', 'floor': 'basement', 'spot': 'front-wall-right', 'note': 'Front wall, right side, beside the water meter', 'detail': '3/4 in gate valve', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'furnace', 'floor': 'basement', 'spot': 'center', 'note': 'Center, under the main trunk duct', 'detail': 'Gas, 60,000 BTU', 'make': 'Trane', 'year': 2009, 'last_service_d': -290},
        {'kind': 'service_switch', 'floor': 'basement', 'spot': 'stairs-top', 'note': 'Top of the basement stairs, red cover plate', 'detail': None, 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'panel', 'floor': 'basement', 'spot': 'side-right', 'note': 'Right side wall', 'detail': '150 A', 'make': 'Siemens', 'year': 1998, 'last_service_d': None},
        {'kind': 'sewer_cleanout', 'floor': 'basement', 'spot': 'front-wall-center', 'note': 'Front wall center, capped pipe at floor level', 'detail': '4 in cap', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'sump_pump', 'floor': 'basement', 'spot': 'rear-wall-right', 'note': 'Pit in the rear wall, right corner', 'detail': '1/3 hp', 'make': None, 'year': 2021, 'last_service_d': None},
    ]
    p_runs = [{'kind': 'water', 'label': 'Water line', 'floor': 'basement', 'via': ['front-wall-right', 'rear-wall-left'], 'material': 'copper',
               'note': 'Meter then shutoff at the front wall, copper to the water heater at the rear wall'},
              {'kind': 'gas', 'label': 'Gas line', 'floor': 'basement', 'via': ['side-left', 'center', 'rear-wall-left'], 'material': 'black iron',
               'note': 'Gas line from the meter on the left side wall to the furnace, then the water heater'},
              {'kind': 'drain', 'label': 'Drain', 'floor': 'basement', 'via': ['rear-wall-center', 'front-wall-center'], 'material': 'PVC',
               'note': 'PVC drain to the cleanout at the front wall'}]
    nm = people.name()
    c2 = add_customer('st-cus-0002', 'york', tw['Red Lion'], nm, h2, a, k, hn, b, None, p_runs, p_items)
    # NJ example (dispatcher sees it): 112 Quillfeather Way, Toms River; slab, air handler in the attic, heat pump not heating.
    a, k, hn, b = make_addr(tw['Toms River'], 'QUILLFEATHER', 'WAY', 112)
    h3 = {'year': 1988, 'sqft': 1520, 'stories': 1, 'style': 'ranch', 'foundation': 'slab', 'basement': 'none', 'fuel': 'electric', 'garage': 'attached-right'}
    n_items = [
        {'kind': 'heat_pump', 'floor': 'outside', 'spot': 'outside-left', 'note': 'On a pad on the left side of the house', 'detail': '3 ton', 'make': 'Lennox', 'year': 2015, 'last_service_d': -330},
        {'kind': 'air_handler', 'floor': 'attic', 'spot': 'attic', 'note': 'In the attic, above the hallway; pull-down stairs in the hall', 'detail': '3 ton, electric heat strips', 'make': 'Lennox', 'year': 2015, 'last_service_d': -330},
        {'kind': 'water_heater', 'floor': 'first', 'spot': 'garage', 'note': 'Garage, back corner', 'detail': 'Electric, 50 gal', 'make': 'A. O. Smith', 'year': 2017, 'last_service_d': None},
        {'kind': 'main_water', 'floor': 'first', 'spot': 'utility-corner', 'note': 'Utility closet by the water heater door, wall facing the street', 'detail': '3/4 in ball valve', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'panel', 'floor': 'first', 'spot': 'garage', 'note': 'Garage wall, left of the door to the house', 'detail': '200 A', 'make': 'Eaton', 'year': 2015, 'last_service_d': None},
        {'kind': 'sewer_cleanout', 'floor': 'outside', 'spot': 'outside-front', 'note': 'Front of the house, capped pipe in the flower bed', 'detail': '4 in cap', 'make': None, 'year': None, 'last_service_d': None},
        {'kind': 'fixture_shutoffs', 'floor': 'first', 'spot': 'kitchen', 'note': 'Under each sink and behind each toilet', 'detail': 'Quarter-turn valves', 'make': None, 'year': None, 'last_service_d': None},
    ]
    n_runs = [{'kind': 'water', 'label': 'Water line', 'floor': 'first', 'via': ['front-wall-left', 'utility-corner', 'garage'], 'material': 'copper',
               'note': 'Main enters at the utility closet, copper to the water heater in the garage'},
              {'kind': 'drain', 'label': 'Drain', 'floor': 'first', 'via': ['bath', 'front-wall-center'], 'material': 'PVC',
               'note': 'PVC drain under the slab to the cleanout out front'}]
    nm = people.name()
    c3 = add_customer('st-cus-0003', 'toms-river', tw['Toms River'], nm, h3, a, k, hn, b,
                      {'plan': 'Total Home', 'since_m': -14, 'renew_d': 112, 'visits_due': 1}, n_runs, n_items)

    counts = {'lancaster': 75, 'york': 50, 'harrisburg': 45, 'toms-river': 30}
    cn = 3
    for hub, total in counts.items():
        have = sum(1 for c in customers if c['team'] == hub)
        for _ in range(total - have):
            cn += 1
            t = rng.choice(towns_by_hub[hub])
            house = make_house(t)
            a, k, hn, b = make_addr(t)
            member = None
            if rng.random() < 0.38:
                member = {'plan': rng.choice(['Comfort', 'Comfort', 'Total Home']), 'since_m': -rng.randint(1, 40),
                          'renew_d': rng.randint(5, 360), 'visits_due': rng.choice([0, 1, 1, 2])}
            floor = 'basement' if house['foundation'] == 'basement' else 'first'
            runs = [run_record('water', floor, house['year'], rng), run_record('drain', floor, house['year'], rng)]
            gas_side = None
            if house['fuel'] in ('gas', 'propane') and rng.random() < 0.3:
                gas_side = rng.choice(['right', 'left'])
                runs.insert(1, run_record('gas', floor, house['year'], rng, gas_side))
            name = people.name()   # drawn before the equipment, as before, so the random stream is unchanged
            items = equipment_for(None, house, rng)
            for it in items:
                if it['kind'] == 'gas_meter' and gas_side:   # a recorded meter sits where the recorded gas line enters
                    it['spot'] = 'outside-' + gas_side
                    it['note'] = 'On the %s side of the house' % gas_side
            add_customer('st-cus-%04d' % cn, hub, t, name, house, a, k, hn, b, member, runs, items)
    need(len(customers) == 200, 'servicetitan: expected 200 customers, got %d' % len(customers))

    # ---- jobs
    jobs = []
    techs_by = {}
    for t in techs:
        if t['name'] != 'You':
            techs_by.setdefault((t['team'], t['trade']), []).append(t)
    cust_by_hub = {}
    for c in customers:
        cust_by_hub.setdefault(c['team'], []).append(c)
    cmap = {c['id']: c for c in customers}
    busy, cust_day = set(), set()

    def pick_type(trade, issue=None, house=None):
        opts = JOB_TYPES[trade]
        if issue:
            return [o for o in opts if o[1] == issue][0]
        w = ([5, 3, 2, 2, 1, 3, 1, 1] if trade == 'HVAC' else [5, 3, 2, 2, 2, 3, 1, 1])[:len(opts)]   # cooling calls kept rare: dates shift, the mix does not
        if house:
            fuel = house['fuel']
            ok = {'no_heat': fuel in ('gas', 'propane', 'oil'), 'heat_pump': fuel == 'electric', 'noise': fuel in ('gas', 'propane'),
                  'co_alarm': fuel in ('gas', 'propane', 'oil'), 'gas_smell': fuel in ('gas', 'propane'), 'sump': house['foundation'] == 'basement'}
            w = [x if ok.get(o[1], True) else 0 for x, o in zip(w, opts)]
        ty = rng.choices(opts, weights=w)[0]
        if house and ty[1] == 'no_heat' and house['fuel'] == 'oil':
            ty = (ty[0], ty[1], ty[2], ['No heat since this morning. The house is at 61.', 'The boiler will not fire.'])
        return ty

    def job(cust, trade, day, win, tech, status, typ=None, said=None, urgent=False, for_=None, number=None):
        ty = typ or pick_type(trade)
        j = {'co': 'pp', 'team': cust['team'], 'customer': cust['id'], 'tech': tech['id'] if tech else None, 'trade': trade,
             'type': ty[0], 'issue': ty[1], 'day': day, 'start': win[0], 'end': win[1], 'status': status, 'assigned': tech is not None,
             'member': cust['member'] is not None, 'urgent': urgent, 'said': said or (rng.choice(ty[3]) if day >= -1 else min(ty[3], key=len)),
             'value': ty[2]}
        if for_:
            j['for'] = [for_]
        if number:
            j['number'] = number
        if tech:
            busy.add((tech['id'], day, win))
        cust_day.add((cust['id'], day))
        jobs.append(j)
        return j

    def free_window(tech, day, prefer=None):
        ws = [prefer] if prefer else []
        ws += rng.sample(WINDOWS, len(WINDOWS))
        for w in ws:
            if (tech['id'], day, w) not in busy:
                return w
        return WINDOWS[0]

    you_h, you_p = techs[0], techs[1]
    # HVAC technician "You" (spec 3.4): 4 today, 3 next 7 days, 18 past; 25 jobs, 23 customers.
    lan = [c for c in cust_by_hub['lancaster'] if c['id'] != 'st-cus-0001']
    rng.shuffle(lan)
    hp = [c for c in lan if c['house']['fuel'] == 'electric'][0]
    gs = [c for c in lan if c['house']['fuel'] == 'gas' and c is not hp][0]
    oth = [c for c in lan if c is not hp and c is not gs]
    C = [c1, hp, oth[0], gs] + oth[1:20]
    today_h = [(C[0], ('08:00', '10:00'), pick_type('HVAC', 'no_heat'), 'Furnace runs a few seconds then stops. House is at 58.', 'L-2187'),
               (C[1], ('10:30', '12:30'), pick_type('HVAC', 'heat_pump'), None, None),
               (C[2], ('13:00', '15:00'), pick_type('HVAC', 'thermostat'), None, None),
               (C[3], ('15:30', '17:30'), pick_type('HVAC', 'noise'), None, None)]
    # Members on today's route: 2; open recommendations on today's customers: 3 (spec 3.4).
    C[1]['member'] = {'plan': 'Total Home', 'since_m': -11, 'renew_d': 203, 'visits_due': 1}
    C[2]['member'] = None
    C[3]['member'] = None
    for c, w, ty, said, num in today_h:
        job(c, 'HVAC', 0, w, you_h, 'Scheduled', ty, said, for_='pp-hvac-technician', number=num)
    for idx, c in enumerate(C[4:7]):
        job(c, 'HVAC', [1, 2, 4][idx], free_window(you_h, [1, 2, 4][idx]), you_h, 'Scheduled', pick_type('HVAC', house=c['house']), for_='pp-hvac-technician')
    past_h = [C[1], C[4]] + C[7:23]
    for c in past_h:
        d = -rng.randint(2, 88)
        job(c, 'HVAC', d, free_window(you_h, d), you_h, 'Done', pick_type('HVAC', house=c['house']), for_='pp-hvac-technician')
    # Plumber "You": 4 today, 3 next 7 days, 16 past; 23 jobs, 21 customers.
    yk = [c for c in cust_by_hub['york'] if c['id'] != 'st-cus-0002']
    rng.shuffle(yk)
    D = [c2] + yk[:20]
    today_p = [(D[0], ('08:00', '10:00'), pick_type('Plumbing', 'wh_leak'), 'The water heater is leaking at the bottom. There is water on the basement floor.', 'Y-2214'),
               (D[1], ('10:30', '12:30'), pick_type('Plumbing', 'drain_clog'), None, None),
               (D[2], ('13:00', '15:00'), pick_type('Plumbing', 'low_pressure'), None, None),
               (D[3], ('15:30', '17:30'), pick_type('Plumbing', 'sump'), None, None)]
    D[0]['member'] = {'plan': 'Comfort', 'since_m': -8, 'renew_d': 122, 'visits_due': 0}
    D[1]['member'] = {'plan': 'Comfort', 'since_m': -19, 'renew_d': 64, 'visits_due': 1}
    D[2]['member'] = None
    D[3]['member'] = None
    for c, w, ty, said, num in today_p:
        job(c, 'Plumbing', 0, w, you_p, 'Scheduled', ty, said, for_='pp-plumber', number=num)
    for idx, c in enumerate(D[4:7]):
        job(c, 'Plumbing', [1, 3, 5][idx], free_window(you_p, [1, 3, 5][idx]), you_p, 'Scheduled', pick_type('Plumbing', house=c['house']), for_='pp-plumber')
    for c in [D[1], D[5]] + D[7:21]:
        d = -rng.randint(2, 88)
        job(c, 'Plumbing', d, free_window(you_p, d), you_p, 'Done', pick_type('Plumbing', house=c['house']), for_='pp-plumber')
    # Dani M.'s tune-up at the flagship 38 days ago (the last visit in spec 1.8).
    dani = [t for t in techs if t['name'] == 'Dani M.'][0]
    job(c1, 'HVAC', -38, ('10:00', '12:00'), dani, 'Done', pick_type('HVAC', 'unknown'), 'Member tune-up. No problems reported.')
    # NJ example job today for the Toms River hub's HVAC technician (os.js: Chris H.).
    chris = [t for t in techs if t['name'] == 'Chris H.'][0]
    job(c3, 'HVAC', 0, ('10:00', '12:00'), chris, 'En route', pick_type('HVAC', 'heat_pump'), 'The heat pump runs but blows cool air. The aux heat light is on.')

    # Everyone else: today 96, next 7 days 120, past 300 in all (spec 3.4).
    hub_w = {'lancaster': 36, 'york': 24, 'harrisburg': 21, 'toms-river': 15}
    def fill(day_range, total_by_hub, status_fn):
        for hub, total in total_by_hub.items():
            have = sum(1 for j in jobs if j['team'] == hub and day_range[0] <= j['day'] <= day_range[1])
            for _ in range(total - have):
                trade = rng.choices(['HVAC', 'Plumbing', 'Electrical'], weights=[60, 28, 12])[0]
                day = rng.randint(*day_range)
                for _ in range(200):
                    cust = rng.choice(cust_by_hub[hub])
                    if cust['id'] not in FLAGSHIP_CUSTOMERS and (cust['id'], day) not in cust_day:
                        break
                cust_day.add((cust['id'], day))
                tech = rng.choice(techs_by[(hub, trade)])
                st, assigned, urgent = status_fn(day)
                tech = tech if assigned else None
                ty = pick_type(trade, house=cust['house'])
                urgent = urgent and ty[1] in URGENT_ISSUES
                win = free_window(tech, day) if tech else rng.choice(WINDOWS)
                if st == 'auto':
                    st = 'Done' if win[0] < '10:00' else ('On site' if win[0] < '12:00' else rng.choice(['Scheduled', 'Scheduled', 'En route']))
                job(cust, trade, day, win, tech, st, ty, urgent=urgent)

    def today_status(day):
        r = rng.random()
        if r < 0.10:
            return 'Unassigned', False, rng.random() < 0.3
        if r < 0.16:
            return 'Running late', True, rng.random() < 0.3
        return 'auto', True, rng.random() < 0.07
    fill((0, 0), hub_w, today_status)
    fill((1, 7), {'lancaster': 45, 'york': 30, 'harrisburg': 27, 'toms-river': 18},
         lambda d: ('Unassigned', False, False) if rng.random() < 0.22 else ('Scheduled', True, False))
    fill((-90, -1), {'lancaster': 113, 'york': 75, 'harrisburg': 67, 'toms-river': 45}, lambda d: ('Done', True, False))
    # One technician, one place at a time: on today's board, jobs before a technician's active job are Done, at most one job
    # is On site, En route or Running late, and the rest are Scheduled.
    active = ('On site', 'En route', 'Running late')
    for t in techs:
        if t['name'] == 'You':
            continue
        mine = sorted((j for j in jobs if j['tech'] == t['id'] and j['day'] == 0), key=lambda j: j['start'])
        pinned = next((k for k, j in enumerate(mine) if j['customer'] in FLAGSHIP_CUSTOMERS), None)
        cur = pinned if pinned is not None else next((k for k, j in enumerate(mine) if j['status'] in active), None)
        if cur is None:
            first_open = next((k for k, j in enumerate(mine) if j['status'] != 'Done'), len(mine))
            for j in mine[first_open:]:
                j['status'] = 'Scheduled'
            continue
        for k, j in enumerate(mine):
            if k < cur:
                j['status'] = 'Done'
            elif k > cur:
                j['status'] = 'Scheduled'

    # Job numbers: hub letter + 4 digits from 5001 upward (flagships pinned); none equals an os.js JOBS0 id.
    jobs.sort(key=lambda j: (j['day'], j['start'], j['team'], j['customer'], j['tech'] or '', j['type']))
    seq = {h: 5001 for h in HUB_LETTER}
    for j in jobs:
        if 'number' not in j:
            j['number'] = '%s-%d' % (HUB_LETTER[j['team']], seq[j['team']])
            seq[j['team']] += 1
        j['id'] = 'st-job-' + (j['number'].split('-')[1] if j['number'] in ('L-2187',) else j['number'].lower().replace('-', ''))
    need(len({j['number'] for j in jobs}) == len(jobs), 'servicetitan: duplicate job numbers')

    # Technician statuses from today's board (stored, never from the clock).
    today = [j for j in jobs if j['day'] == 0]
    for t in techs:
        if t['name'] == 'You':
            continue
        mine = [j for j in today if j['tech'] == t['id']]
        sts = {j['status'] for j in mine}
        t['status'] = 'On a job' if 'On site' in sts else ('Driving' if 'En route' in sts or 'Running late' in sts else
                                                         ('Free' if rng.random() < 0.8 else 'Off'))

    # Notes and recommendations from past visits.
    tmap = {t['id']: t for t in techs}
    rn = 0
    for j in sorted([j for j in jobs if j['status'] == 'Done'], key=lambda j: (j['customer'], j['day'], j['number'])):
        c = cmap[j['customer']]
        if c['id'] == 'st-cus-0001':
            continue
        if rng.random() < 0.7:
            t = tmap[j['tech']]
            by = {'name': 'You', 'role': TRADE_ROLE[t['trade']]} if t['name'] == 'You' else {'name': t['name'], 'role': TRADE_ROLE[t['trade']]}
            boiler = j['issue'] == 'no_heat' and c['house']['fuel'] == 'oil'   # an oil house heats with a boiler, not a furnace
            c['notes'].append({'day': j['day'], 'by': by, 'text': BOILER_NOTE if boiler else NOTE_FOR[j['issue']]})
            if rng.random() < 0.3 and not c['recs']:
                rn += 1
                text, code = BOILER_REC if boiler else REC_FOR[j['issue']]
                c['recs'].append({'id': 'st-rec-%04d' % (rn + 1), 'day': j['day'], 'text': text, 'code': code,
                                  'price': [p[6] for p in PRICEBOOK if p[0] == code][0], 'status': 'open'})
    c1['notes'] = [{'day': -38, 'by': {'name': 'Dani M.', 'role': 'HVAC technician'},
                    'text': 'Tune-up. Cleaned the flame sensor; the ignitor shows wear. Recommended replacing it within a year.'}]
    c1['recs'] = [{'id': 'st-rec-0001', 'day': -38, 'text': 'Replace hot-surface ignitor', 'code': 'ignitor', 'price': 420, 'status': 'open'}]
    # Pin open recommendations on today's route to 3 for each "You": the flagship's plus one each on the next two stops.
    for group in (C[:4], D[:4]):
        for c in group[1:]:
            c['recs'] = []
        for c in group[1:3]:
            if c is c1:
                continue
            rn += 1
            iss = [j for j in jobs if j['customer'] == c['id'] and j['day'] == 0][0]['issue']
            text, code = REC_FOR[iss]
            c['recs'] = [{'id': 'st-rec-%04d' % (rn + 1), 'day': -rng.randint(60, 300), 'text': text, 'code': code,
                          'price': [p[6] for p in PRICEBOOK if p[0] == code][0], 'status': 'open'}]
    if D[0]['recs'] == []:
        rn += 1
        D[0]['recs'] = [{'id': 'st-rec-%04d' % (rn + 1), 'day': -300, 'text': 'Replace the water heater', 'code': 'replace_wh', 'price': 1850, 'status': 'open'}]
    for c in customers:
        c['notes'].sort(key=lambda n: -n['day'])
        if c['notes']:
            c['notes'] = c['notes'][:2]
    for j in jobs:
        j['member'] = cmap[j['customer']]['member'] is not None

    # `for` on customers and equipment: the customers on that role's jobs from day -90 to day +7 (spec 3.3).
    for c in customers:
        roles = sorted({r for j in jobs if j['customer'] == c['id'] and -90 <= j['day'] <= 7 for r in j.get('for', [])})
        if roles:
            c['for'] = roles
    for e in equipment:
        c = cmap[e['customer']]
        if c.get('for'):
            e['for'] = list(c['for'])

    pricebook = [{'id': 'st-pb-' + p[0].replace('_', '-'), 'co': 'pp', 'code': p[0], 'name': p[1], 'trade': p[2], 'kind': p[3], 'unit': p[4],
                  'tier': p[5], 'price': p[6], 'low': p[7], 'high': p[8], 'member_price': p[9], 'financing': p[10], 'basis': p[11],
                  'est': p[11] == MODELED} for p in PRICEBOOK]
    need(len(pricebook) == 64, 'price book: expected 64 items, got %d' % len(pricebook))
    stock_rng = random.Random(SEED + 99)
    parts = [{'id': 'st-part-' + c, 'co': 'pp', 'code': c, 'name': n, 'price': pr,
              'stock': {h: stock_rng.randint(1, 8) for h in ('lancaster', 'york', 'harrisburg', 'toms-river')}} for c, n, pr in PARTS]
    for p in parts:
        if p['code'] == 'ign-hsi':
            p['stock'].update({'lancaster': 6, 'york': 3, 'harrisburg': 4, 'toms-river': 2})
        if p['code'] == 'flame-sensor':
            p['stock']['lancaster'] = 4
    reb = []
    for i in sorted(incentives(), key=lambda x: (x.get('state') or '', x.get('sponsor') or '', x.get('measure') or '')):
        if len(reb) == 6:
            break
        if i.get('amount_min') is None and i.get('amount_max') is None:
            continue
        reb.append({'id': 'st-reb-%02d' % (len(reb) + 1), 'co': 'pp', 'sponsor': i.get('sponsor'), 'measure': i.get('measure'),
                    'state': i.get('state'), 'low': i.get('amount_min'), 'high': i.get('amount_max'),
                    'basis': 'Public program; confirm eligibility'})
    jobs.sort(key=lambda j: (j['day'], j['start'], j['number']))
    return {'co': 'pp', 'technicians': techs, 'customers': customers, 'equipment': equipment, 'jobs': jobs,
            'pricebook': pricebook, 'parts': parts, 'rebates': reb}


# ------------------------------------------------------------------------------------------------ finance (all modeled, est.)

# Calendar-month factors applied by the server at load (records are stored de-seasonalized). PP: October peak and
# February low from data/research/pp_demand_model.json text; FH: swim season. Others flat.
SEASON = {'pp': {1: .85, 2: .8, 3: .9, 4: .95, 5: 1.0, 6: 1.1, 7: 1.2, 8: 1.15, 9: 1.05, 10: 1.25, 11: 1.0, 12: .95},
          'fh': {1: .6, 2: .7, 3: .9, 4: 1.1, 5: 1.5, 6: 1.5, 7: 1.5, 8: 1.5, 9: .9, 10: .8, 11: .6, 12: .6}}
# Cost shares (modeled): cost of revenue as a share of revenue; EBITDA margin from the month-0 anchors.
COGS = {'pp': .51, 'cet': .80, 'fl': .58, 'ts': .74, 'bpi': .48, 'fh': .47}
PAYROLL = {'pp': .36, 'cet': .38, 'fl': .55, 'ts': .12, 'bpi': .55, 'fh': .18}
DEBT = {  # facility, balance $k, maturity year, covenant, next test (days), basis. Rates: data/research/deal_model.json presets.
    'pp': ('First-lien term loan', 14000, 2029, 'Senior leverage under 5.5x', 44, 'Rate and maturity from public filings; balance modeled'),
    'cet': ('Senior credit facility', 40000, 2030, 'Total leverage under 5.0x', 28, 'Modeled within the public filings estimate range'),
    'fl': ('Term loan', 90000, 2030, 'Senior leverage under 6.0x', 58, 'Initial size from public filings; rate and terms modeled'),
    'ts': ('Unitranche loan', 250000, 2027, 'Fixed charge coverage above 1.1x', 17, 'Size and rate from public filings estimates; balance modeled'),
    'bpi': ('Senior secured credit facility', 85000, 2029, 'Senior leverage under 4.5x', 73, 'Modeled within the public filings estimate range'),
    'fh': ('Revolving credit line', 4200, 2028, 'Minimum liquidity', 35, 'Modeled; no term loan in public filings'),
}
CLOSE_ITEMS = {'pp': ['Fleet lease renewal', 'Franchise royalty true-up', 'Bank reconciliation', 'Accrual review', 'Membership deferred revenue', 'Parts inventory count'],
               'cet': ['Revenue on open projects', 'Retainage schedule', 'Bank reconciliation', 'Accrual review', 'Equipment rental accruals', 'Intercompany with Horton'],
               'fl': ['Deferred revenue roll-forward', 'Bank reconciliation', 'Accrual review', 'Unbilled services', 'Contractor invoices'],
               'ts': ['Inventory count adjustment', 'Freight accrual', 'Bank reconciliation', 'Rebate accrual', 'Accrual review', 'Intercompany with add-ons', 'Fixed asset additions'],
               'bpi': ['Unbilled time review', 'Media pass-through reconciliation', 'Bank reconciliation', 'Accrual review', 'Currency translation'],
               'fh': ['Returns reserve', 'Freight accrual', 'Bank reconciliation', 'Inventory count adjustment', 'Wholesale chargebacks']}
# KPI definitions: id, label, unit, value last month, target, change per month (older months), noise, decimals, seasonal
KPIS = {
    'pp': [('booking_rate', 'Booking rate', '%', 41, 45, -.12, .8, 0, False), ('avg_ticket', 'Average ticket', '$', 512, 540, -1.5, 9, 0, False),
           ('callbacks', 'Callbacks', 'jobs', 38, 30, .1, 3, 0, False), ('jobs', 'Jobs completed', 'jobs', 2380, 2450, -8, 40, 0, True),
           ('members', 'Active members', 'members', 6500, 6800, -22, 0, 0, False), ('memberships_sold', 'Memberships sold', 'members', 124, 150, -.6, 8, 0, False),
           ('tech_utilization', 'Technician utilization', '%', 72, 78, -.1, 1.2, 0, False), ('overtime_hours', 'Overtime hours', 'hours', 910, 700, 4, 60, 0, False)],
    'cet': [('projects_active', 'Projects active', 'projects', 28, 30, -.2, 1, 0, False), ('open_rfis', 'Open RFIs', 'RFIs', 31, 25, .1, 3, 0, False),
            ('npt', 'Non-productive time', '%', 35, 32, .08, 1, 0, False), ('bid_win_rate', 'Bid win rate', '%', 15, 20, -.05, 1.5, 0, False),
            ('backlog_k', 'Backlog', 'k$', 96000, 100000, -400, 1500, 0, False), ('field_utilization', 'Field labor utilization', '%', 81, 85, -.1, 1, 0, False),
            ('ev_ports', 'EV ports under management', 'ports', 120, 150, -5, 0, 0, False), ('safety_incidents', 'Recordable incidents', 'incidents', 1, 0, 0, .6, 0, False)],
    'fl': [('open_tickets', 'Open tickets', 'tickets', 1840, 1600, 6, 60, 0, False), ('flr', 'First-level resolution', '%', 74, 80, -.15, .8, 0, False),
           ('response_time', 'Response time', 'min', 18, 15, .05, 1.2, 0, False), ('ebilling_rejection', 'E-billing rejection rate', '%', 18, 15, .05, .8, 0, False),
           ('days_to_pay', 'Days invoice to payment', 'days', 62, 55, .1, 2, 0, False), ('csat', 'Client satisfaction', '%', 91, 93, 0, .8, 0, False),
           ('clients', 'Law-firm clients', 'clients', 900, 930, -2, 0, 0, False), ('tickets_closed', 'Tickets closed', 'tickets', 124000, 128000, -300, 2500, 0, False)],
    'ts': [('orders_day', 'Orders per day', 'orders', 2150, 2250, -3, 40, 0, False), ('fill_rate', 'Fill rate', '%', 95.6, 97, -.02, .4, 1, False),
           ('late_orders', 'Late orders', 'orders', 410, 300, 1, 25, 0, False), ('digital_share', 'Digital share of orders', '%', 58, 65, -.3, .8, 0, False),
           ('private_label', 'Private-label share', '%', 14, 19, -.08, .4, 0, False), ('backorders', 'Backordered lines', 'lines', 960, 700, 2, 50, 0, False),
           ('overtime_hours', 'Warehouse overtime hours', 'hours', 1300, 1000, 5, 90, 0, False)],
    'bpi': [('utilization', 'Utilization', '%', 74, 78, -.05, 1, 0, False), ('hours_over_scope', 'Retainers over hours plan', 'retainers', 9, 5, .05, 1.2, 0, False),
            ('retainers', 'Active retainers', 'retainers', 132, 140, -.5, 2, 0, False), ('retainer_share', 'Retainer share of net revenue', '%', 48, 55, -.15, .8, 0, False),
            ('retainers_at_risk', 'Retainers at risk', 'retainers', 6, 3, .05, 1, 0, False), ('rev_per_fte_k', 'Net revenue per FTE', 'k$', 262, 285, -.6, 3, 0, False),
            ('proposals_won', 'Proposals won', 'proposals', 7, 9, 0, 1.5, 0, False)],
    'fh': [('orders_day', 'Orders per day', 'orders', 420, 450, -1, 15, 0, True), ('return_rate', 'Return rate', '%', 19.3, 17.4, .01, .4, 1, False),
           ('low_stock', 'Low-stock products', 'products', 7, 4, .02, 1.2, 0, False), ('repeat_rate', 'Repeat purchase rate', '%', 20, 23, -.08, .5, 0, False),
           ('aov', 'Average order value', '$', 104, 110, -.2, 2, 0, False), ('email_share', 'Email share of online revenue', '%', 41, 45, -.1, .8, 0, False),
           ('markdown_share', 'Markdown share of live variants', '%', 38.5, 25, .1, .6, 1, False), ('ship_days', 'Days to ship', 'days', 2.4, 1.5, .01, .2, 1, False)],
}
HUB_SHARE = {'lancaster': .38, 'york': .25, 'harrisburg': .22, 'toms-river': .15}
# One plan tolerance everywhere (home leads, sandbox documents, roles.json for the agent): within 1% of plan counts as on plan.
PLAN_TOL_PCT = 1.0


def vs_plan(actual, plan):
    """(percent off plan rounded to 0.1, words): 'on plan' within PLAN_TOL_PCT, else 'x.x% above plan' or 'x.x% below plan'."""
    x = round((actual / plan - 1) * 100, 1) if plan else 0.0
    return x, ('on plan' if abs(x) <= PLAN_TOL_PCT else '%.1f%% %s plan' % (abs(x), 'above' if x > 0 else 'below'))


def ebitda_vs_plan(p):
    return vs_plan(p['revenue_k'] - p['cogs_k'] - p['opex_k'], p['plan_revenue_k'] - p['plan_cogs_k'] - p['plan_opex_k'])


def fin_company(co, rng, anc):
    a = anc[co]
    rev_m0 = a['rev'] / 12 / 1000.0
    margin = a['ebitda'] / a['rev']
    cs = COGS[co]
    pnl, kpis, payroll = [], [], []
    for m in range(-24, 1):
        g = (1 + a['gr']) ** (m / 12.0)
        plan_rev = rev_m0 * g
        noise = rng.uniform(-.028, .028)
        act_rev = plan_rev * (1 + noise)
        plan_cogs, plan_opex = plan_rev * cs, plan_rev * (1 - cs - margin)
        act_cogs = act_rev * cs * (1 + rng.uniform(-.015, .015))
        act_opex = plan_opex * (1 + rng.uniform(-.02, .02))
        # Closed months only: a stored month-to-date row could not follow the real day of the month.
        if m < 0:
            pnl.append({'id': 'fi-%s-pnl-m%d' % (co, -m), 'co': co, 'm': m, 'revenue_k': round(act_rev), 'cogs_k': round(act_cogs),
                        'opex_k': round(act_opex), 'plan_revenue_k': round(plan_rev), 'plan_cogs_k': round(plan_cogs),
                        'plan_opex_k': round(plan_opex), 'team': None, 'est': True})
        if m < 0:
            pk = plan_rev * PAYROLL[co]
            payroll.append({'id': 'ad-%s-pay-m%d' % (co, -m), 'co': co, 'm': m, 'payroll_k': round(pk * (1 + rng.uniform(-.03, .03))),
                            'plan_k': round(pk), 'seasonal': co in SEASON, 'est': True})
    last = [p for p in pnl if p['m'] == -1][0]
    need(abs(last['revenue_k'] / last['plan_revenue_k'] - 1) <= .04, '%s: last closed month is more than 4%% off plan' % co)
    for kid, label, unit, v1, target, slope, sd, dec, seas in KPIS[co]:
        for m in range(-24, 0):
            v = v1 + slope * (m + 1) + (rng.gauss(0, sd) if m != -1 else 0)
            v = round(v, dec) if dec else int(round(v))
            if unit == '%':
                v = max(0, min(100, v))
            kpis.append({'id': 'fi-%s-kpi-%s-m%d' % (co, kid.replace('_', '-'), -m), 'co': co, 'm': m, 'kpi': kid, 'label': label,
                         'value': max(0, v), 'unit': unit, 'target': target, 'team': None, 'seasonal': seas, 'est': True})
    return pnl, kpis, payroll


def hub_kpis(pnl, rng):
    """Punctual Pros by hub: revenue (sums to company revenue), jobs, booking rate, callbacks, average ticket, memberships sold."""
    out = []
    for p in pnl:
        m = p['m']
        if m >= 0:
            continue
        for hub, sh in HUB_SHARE.items():
            hk = hub.replace('-', '')
            rows = [('revenue_k', 'Revenue', 'k$', round(p['revenue_k'] * sh), round(p['plan_revenue_k'] * sh), True),
                    ('jobs', 'Jobs completed', 'jobs', int(round(2380 * sh * (1 + rng.uniform(-.04, .04)))), int(round(2450 * sh)), True),
                    ('booking_rate', 'Booking rate', '%', int(round(41 + rng.uniform(-3, 3))), 45, False),
                    ('callbacks', 'Callbacks', 'jobs', max(1, int(round(38 * sh + rng.uniform(-3, 3)))), int(round(30 * sh)), False),
                    ('avg_ticket', 'Average ticket', '$', int(round(512 + rng.uniform(-35, 35))), 540, False),
                    ('memberships_sold', 'Memberships sold', 'members', max(1, int(round(124 * sh + rng.uniform(-6, 6)))), int(round(150 * sh)), False)]
            for kid, label, unit, v, t, seas in rows:
                out.append({'id': 'fi-pp-kpi-%s-%s-m%d' % (kid.replace('_', '-'), hk, -m), 'co': 'pp', 'm': m, 'kpi': kid, 'label': label,
                            'value': v, 'unit': unit, 'target': t, 'team': hub, 'seasonal': seas, 'est': True})
    return out


def dc_kpis(rng):
    out = []
    for team, share, fill in (('swedesboro', .5, 96.1), ('center-2', .27, 95.2), ('center-3', .23, 94.8)):
        for m in range(-24, 0):
            out.append({'id': 'fi-ts-kpi-fill-%s-m%d' % (team, -m), 'co': 'ts', 'm': m, 'kpi': 'fill_rate', 'label': 'Fill rate', 'value': round(fill + rng.uniform(-.6, .6), 1),
                        'unit': '%', 'target': 97, 'team': team, 'seasonal': False, 'est': True})
            out.append({'id': 'fi-ts-kpi-orders-%s-m%d' % (team, -m), 'co': 'ts', 'm': m, 'kpi': 'orders_day', 'label': 'Orders per day',
                        'value': int(round(2150 * share * (1 + rng.uniform(-.04, .04)))), 'unit': 'orders', 'target': int(round(2250 * share)), 'team': team,
                        'seasonal': False, 'est': True})
    return out


BPI_OFFICES = [('office-dc', 'Washington, DC', 76), ('office-ny', 'New York', 73), ('office-chi', 'Chicago', 71), ('office-ldn', 'London', 72), ('office-ber', 'Berlin', 69)]


def office_kpis(rng):
    out = []
    for team, name, u in BPI_OFFICES:
        for m in range(-24, 0):
            out.append({'id': 'fi-bpi-kpi-util-%s-m%d' % (team.split('-')[1], -m), 'co': 'bpi', 'm': m, 'kpi': 'utilization', 'label': 'Utilization, %s' % name,
                        'value': int(round(u + rng.uniform(-2.5, 2.5))), 'unit': '%', 'target': 78, 'team': team, 'seasonal': False, 'est': True})
    return out


HEADCOUNT = {
    'bsp': [(None, 'BSP', 'Partners', 4, 0), (None, 'BSP', 'Investment team', 4, 1), (None, 'BSP', 'PRG', 2, 0), (None, 'BSP', 'Finance and investor relations', 2, 0)],
    'pp': [('lancaster', 'Lancaster hub', 'Technicians', 32, 3), ('lancaster', 'Lancaster hub', 'Office', 9, 1), ('york', 'York hub', 'Technicians', 21, 2),
           ('york', 'York hub', 'Office', 6, 0), ('harrisburg', 'Harrisburg hub', 'Technicians', 19, 2), ('harrisburg', 'Harrisburg hub', 'Office', 6, 1),
           ('toms-river', 'Toms River hub', 'Technicians', 13, 2), ('toms-river', 'Toms River hub', 'Office', 5, 0),
           (None, 'Headquarters', 'Leadership and finance', 8, 0), (None, 'Headquarters', 'Marketing', 5, 1), (None, 'Headquarters', 'Call center', 16, 2)],
    'cet': [('crew', 'Worcester', 'Field crews', 95, 6), ('crew', 'Taunton', 'Field crews', 40, 3), ('crew', 'Canton, CT (Horton)', 'Field crews', 85, 5),
            ('pm', 'Worcester', 'Project management', 18, 2), ('estimating', 'Worcester', 'Estimating', 9, 1), (None, 'Worcester', 'Office and finance', 18, 1),
            (None, 'Norwell (NuWave)', 'Energy efficiency', 10, 1)],
    'fl': [('desk-east', 'St. Louis', 'Service desk east', 220, 9), ('desk-central', 'Toledo', 'Service desk central', 210, 7),
           ('desk-intl', 'Hyderabad and Goa', 'Service desk international', 190, 6), (None, 'St. Louis', 'Field and network engineering', 160, 5),
           ('billing', 'St. Louis', 'Billing', 140, 4), (None, 'St. Louis', 'Collections', 70, 2), ('sales', 'St. Louis', 'Sales and account management', 60, 3),
           (None, 'St. Louis', 'Corporate', 100, 2)],
    'ts': [('swedesboro', 'Swedesboro', 'Distribution', 120, 6), ('center-2', 'Center 2', 'Distribution', 60, 3), ('center-3', 'Center 3', 'Distribution', 55, 2),
           ('inside-east', 'Swedesboro', 'Inside sales', 70, 4), ('sales', 'Field', 'Field sales', 40, 2), (None, 'Swedesboro', 'Customer service', 50, 2),
           (None, 'Swedesboro', 'Purchasing', 25, 1), (None, 'Swedesboro', 'Corporate', 50, 1)],
    'bpi': [('office-dc', 'Washington, DC', 'Staff', 170, 6), ('office-ny', 'New York', 'Staff', 70, 3), ('office-chi', 'Chicago', 'Staff', 25, 1),
            (None, 'San Francisco', 'Staff', 20, 1), (None, 'Los Angeles', 'Staff', 15, 0), ('office-ldn', 'London', 'Staff', 50, 2),
            ('office-ber', 'Berlin', 'Staff', 25, 1), (None, 'Brussels', 'Staff', 15, 1), (None, 'Other offices', 'Staff', 10, 0)],
    'fh': [(None, 'New York', 'Leadership', 6, 0), ('ecommerce', 'New York', 'E-commerce', 10, 1), (None, 'New York', 'Design and product', 12, 1),
           (None, 'New York', 'Wholesale', 8, 1), (None, 'Stores', 'Retail stores', 14, 2), (None, 'New York', 'Operations', 10, 1)],
}
HC_TOTAL = {'bsp': 12, 'pp': 140, 'cet': 275, 'fl': 1150, 'ts': 470, 'bpi': 400, 'fh': 60}


def headcount(co, rng):
    rows = HEADCOUNT[co]
    need(sum(r[3] for r in rows) == HC_TOTAL[co], '%s: headcount rows do not sum to %d' % (co, HC_TOTAL[co]))
    out = []
    for i, (team, unit, group, count, openr) in enumerate(rows):
        out.append({'id': 'ad-%s-hc-%02d' % (co, i + 1), 'co': co, 'team': team, 'unit': unit, 'group': group, 'count': count,
                    'open_roles': openr, 'turnover_12m_pct': rng.randint(8, 22), 'est': True})
    return out


def debt(co, anc):
    f, bal, mat, cov, nxt, basis = DEBT[co]
    rate = {'pp': 8.73, 'cet': 8.5, 'fl': 9.0, 'ts': 10.0, 'bpi': 8.5, 'fh': 8.0}[co]   # deal_model.json presets; TS from thomas_filings.json
    return [{'id': 'fi-%s-debt' % co, 'co': co, 'facility': f, 'balance_k': bal, 'rate_pct': rate, 'maturity_year': mat, 'covenant': cov,
             'next_test_d': nxt, 'basis': basis, 'est': True}]


def close_items(co, rng):
    items = CLOSE_ITEMS[co]
    out = []
    n_open = 2 if co in ('pp', 'ts') else 1 + rng.randint(0, 2)
    for i, it in enumerate(items):
        out.append({'id': 'fi-%s-close-%d' % (co, i + 1), 'co': co, 'm': -1, 'item': it, 'owner': role_only('Controller'),
                    'status': 'Open' if i < n_open else 'Done'})
    return out


# ------------------------------------------------------------------------------------------------ org words and names

class Words:
    def __init__(self, org_bases, rng):
        self.w = list(org_bases)
        self.rng = rng
        self.used = set()
        self.words_used = set()

    def word(self):
        """One invented word, preferring words this organisation has not used yet."""
        fresh = [w for w in self.w if w not in self.words_used]
        w = self.rng.choice(fresh or self.w)
        self.words_used.add(w)
        return w

    def name(self, pattern):
        """pattern holds {W} and optionally {W2}; returns a name not used before in this organisation, preferring fresh words."""
        for k in range(4000):
            fresh = [w for w in self.w if w not in self.words_used]
            a, b = self.rng.sample(fresh if len(fresh) >= 2 and k < 50 else self.w, 2)
            if fresh and len(fresh) < 2 and k < 50 and '{W2}' not in pattern:
                a = fresh[0]
            n = pattern.replace('{W}', a).replace('{W2}', b)
            if n not in self.used:
                self.used.add(n)
                self.words_used.add(a)
                if '{W2}' in pattern:
                    self.words_used.add(b)
                return n
        raise SystemExit('organisation word combinations exhausted')


NE_TOWNS = [('Worcester', 'MA'), ('Springfield', 'MA'), ('Lowell', 'MA'), ('Fall River', 'MA'), ('Brockton', 'MA'), ('Framingham', 'MA'),
            ('Taunton', 'MA'), ('Holyoke', 'MA'), ('Fitchburg', 'MA'), ('Hartford', 'CT'), ('New Britain', 'CT'), ('Waterbury', 'CT'),
            ('Norwich', 'CT'), ('Torrington', 'CT'), ('Canton', 'CT'), ('Providence', 'RI'), ('Warwick', 'RI'), ('Pawtucket', 'RI'),
            ('Manchester', 'NH'), ('Nashua', 'NH'), ('Concord', 'NH'), ('Portland', 'ME'), ('Lewiston', 'ME'), ('Bangor', 'ME'),
            ('Burlington', 'VT'), ('Rutland', 'VT')]
NE_TOWNS = [t for t in NE_TOWNS if not CAL_WORDS.search(t[0])]   # drops "Fall River" (season word)
STATES_US = ['IL', 'MO', 'OH', 'TX', 'GA', 'CA', 'NY', 'PA', 'MA', 'MN', 'CO', 'WA', 'FL', 'NC', 'VA', 'MD', 'NJ', 'MI', 'WI', 'TN']


def build_dealcloud(rng, words, people):
    fit = [('pp', 14, ['{W} Comfort Services', '{W} Heating and Air', '{W} Plumbing and Drain', '{W} Home Services'],
            'Residential HVAC and plumbing', [('Allentown', 'PA'), ('Hagerstown', 'MD'), ('Vineland', 'NJ'), ('Wilmington', 'DE'), ('Scranton', 'PA'), ('Frederick', 'MD')], (6, 15)),
           ('cet', 10, ['{W} Electric', '{W} Power Systems', '{W} Energy Services'], 'Electrical contractor', NE_TOWNS, (25, 40)),
           ('fl', 8, ['{W} Legal IT', '{W} Technology Partners'], 'Legal IT services', [('Chicago', 'IL'), ('Denver', 'CO'), ('Atlanta', 'GA'), ('Dallas', 'TX')], (10, 40)),
           ('ts', 8, ['{W} Scientific Supply', '{W} Lab Products'], 'Lab distribution', [('Raleigh', 'NC'), ('San Diego', 'CA'), ('Madison', 'WI'), ('Kansas City', 'MO')], (20, 60)),
           ('bpi', 6, ['{W} Strategies', '{W} Communications'], 'Public affairs agency', [('Washington', 'DC'), ('Austin', 'TX'), ('Sacramento', 'CA')], (8, 30)),
           ('fh', 4, ['{W} Swimwear', '{W} Outfitters'], 'Apparel brand', [('Charleston', 'SC'), ('San Clemente', 'CA'), ('Montauk', 'NY')], (5, 20)),
           ('new', 10, ['{W} Facility Services', '{W} Testing Labs', '{W} Inspection Group'], 'New company', [('Columbus', 'OH'), ('Nashville', 'TN'), ('Indianapolis', 'IN'), ('Charlotte', 'NC')], (30, 120))]
    # No 'Closed' deals: a fictional completed add-on would read as a real portfolio event.
    stages = ['Sourced'] * 18 + ['Screening'] * 14 + ['IOI'] * 8 + ['LOI'] * 5 + ['Diligence'] * 4 + ['Passed'] * 11
    rng.shuffle(stages)
    nxt = {'Sourced': ('Intro call with the owner', (3, 30)), 'Screening': ('Review the teaser and first financials', (2, 21)),
           'IOI': ('Submit the indication of interest', (2, 14)), 'LOI': ('Settle LOI terms with the seller', (1, 10)),
           'Diligence': ('Quality of earnings review and site visits', (1, 20)), 'Closed': ('Integration plan with the company team', (-60, -5)),
           'Passed': ('Revisit in two quarters', (60, 180))}
    owners = ['Partner', 'Partner', 'Senior associate', 'Associate', 'Managing partner']
    out, i = [], 0
    for co, n, pats, seg, towns, (lo, hi) in fit:
        for _ in range(n):
            st = stages[i]
            i += 1
            rev = round(rng.uniform(lo, hi), 1)
            town, state = rng.choice(towns)
            txt, (a, b) = nxt[st]
            out.append({'id': 'dc-%03d' % i, 'co': 'bsp', 'name': words.name(rng.choice(pats)), 'fit_for': co, 'segment': seg, 'town': town,
                        'state': state, 'revenue_m': rev, 'ebitda_m': round(rev * rng.uniform(.09, .18), 1), 'stage': st,
                        'owner': role_only(rng.choice(owners)), 'next_step': txt, 'next_d': rng.randint(a, b), 'est': True})
    need(len(out) == 60, 'dealcloud: expected 60 deals')
    return out


def build_packs(rng):
    """Reporting packs from the six companies for the last three closed months; at most one Late per month."""
    late = {(-1, 'ts'): 'Late', (-1, 'bpi'): 'Due'}
    out = []
    for m in (-1, -2, -3):
        for co in COS:
            st = late.get((m, co), 'In')
            rec = {'id': 'fi-bsp-pack-%s-m%d' % (co, -m), 'co': 'bsp', 'company': co, 'm': m, 'status': st}
            if st == 'In':
                rec['received_d'] = -rng.randint(1, 9) + (m + 1) * 30 + (6 if (m, co) == (-2, 'cet') else 0)   # CET's came in a week late
            out.append(rec)
    return out


# ------------------------------------------------------------------------------------------------ CRM, marketing and operating apps

def build_campaigns_pp(rng):
    names = [('New neighbor tune-up', 'Mail'), ('Heating check-up', 'Email'), ('Water heater swap', 'Search ads'), ('Comfort Club renewal', 'Email'),
             ('Generator service reminder', 'Text'), ('Drain special', 'Local services ads'), ('No-heat emergency', 'Search ads'),
             ('Local services ads, HVAC', 'Local services ads'), ('Local services ads, plumbing', 'Local services ads'), ('Heat pump rebate', 'Social')]
    out, i = [], 0
    for m in range(-5, 1):
        for name, ch in rng.sample(names, 7):
            i += 1
            spend = rng.randrange(1500, 9500, 100)
            leads = int(spend / rng.uniform(38, 70))
            booked = int(leads * rng.uniform(.24, .42))
            if m == 0:
                spend, leads, booked = spend // 2, leads // 2, booked // 2
            out.append({'id': 'mk-pp-%03d' % i, 'co': 'pp', 'name': name, 'channel': ch, 'm': m, 'spend': spend, 'leads': leads,
                        'booked': booked, 'est': True})
    return out


def build_campaigns_fh(rng):
    names = [('Welcome series', 'Email flow'), ('Browse abandonment', 'Email flow'), ('Cart abandonment', 'Email flow'), ('Post-purchase', 'Email flow'),
             ('Back in stock', 'Email flow'), ('New arrivals', 'Email campaign'), ('Gift guide', 'Email campaign'), ('Golf shop', 'Email campaign'),
             ('Fleece drop', 'Email campaign'), ('Text: early access', 'Text'), ('Text: restock alert', 'Text')]
    out, i = [], 0
    for m in range(-5, 1):
        for name, ch in rng.sample(names, 8):
            i += 1
            sends = rng.randrange(8000, 140000, 500) if ch != 'Email flow' else rng.randrange(3000, 30000, 100)
            orders = int(sends * rng.uniform(.002, .012))
            out.append({'id': 'mk-fh-%03d' % i, 'co': 'fh', 'name': name, 'channel': ch, 'm': m, 'sends': sends // (2 if m == 0 else 1),
                        'orders': orders // (2 if m == 0 else 1), 'revenue': int(orders * rng.uniform(92, 128)) // (2 if m == 0 else 1), 'est': True})
    return out


def build_cet_crm(rng, words, people):
    accounts, opps = [], []
    pats = [('{W} Regional Water Authority', 'Municipal water'), ('{W} School District', 'Education'), ('{W} Housing Authority', 'Public housing'),
            ('{W} Manufacturing', 'Industrial'), ('{W} Health', 'Healthcare'), ('{W} Logistics', 'Commercial'), ('{W} Energy Cooperative', 'Utility')]
    for i in range(60):
        pat, seg = rng.choice(pats)
        town, st = rng.choice(NE_TOWNS)
        owner = role_only('Business development lead') if rng.random() < .5 else people.person('Account manager')
        accounts.append({'id': 'sf-cet-acc-%03d' % (i + 1), 'co': 'cet', 'name': words.name(pat), 'segment': seg, 'state': st, 'town': town,
                         'owner': owner, 'health': rng.choice(['Good', 'Good', 'Watch', 'At risk'])})
    scopes = [('Pump station electrical upgrade', 400, 2600), ('Rooftop solar, 400 kW', 700, 1400), ('EV chargers, 12 ports', 180, 520),
              ('Wastewater plant controls', 900, 6200), ('LED lighting retrofit', 150, 600), ('Standby generator and switchgear', 300, 1800),
              ('Service upgrade, 2,000 A', 350, 1100), ('Battery storage, 1 MWh', 900, 2400)]
    # Closed bids are drawn as one stage and split into Won and Lost below, so the CRM win rate matches the bid win rate KPI.
    stages = ['Qualifying', 'Bidding', 'Bidding', 'Submitted', 'Closed', 'Closed', 'Closed', 'Closed']
    estimators = [people.person('Estimator') for _ in range(3)]
    seen = set()
    for i in range(84):
        acc = rng.choice(accounts)
        sc, lo, hi = rng.choice(scopes)
        while '%s: %s' % (acc['name'], sc) in seen:   # one opportunity per account and scope
            acc = rng.choice(accounts)
            sc, lo, hi = rng.choice(scopes)
        seen.add('%s: %s' % (acc['name'], sc))
        st = rng.choice(stages)
        st = 'Lost' if st == 'Closed' else st
        close = {'Qualifying': (10, 60), 'Bidding': (0, 21), 'Submitted': (5, 40), 'Won': (-330, -5), 'Lost': (-330, -5)}[st]
        team = 'estimating' if rng.random() < .65 else None
        rec = {'id': 'sf-cet-opp-%03d' % (i + 1), 'co': 'cet', 'account_id': acc['id'], 'account': acc['name'], 'name': '%s: %s' % (acc['name'], sc),
               'stage': st, 'amount': rng.randrange(lo, hi, 10) * 1000, 'close_d': rng.randint(*close),
               'owner': rng.choice(estimators) if team else role_only('Business development lead'),
               'next_step': {'Qualifying': 'Site walk and bid or no-bid call', 'Bidding': 'Finish takeoff and supplier quotes', 'Submitted': 'Wait for the bid opening',
                             'Won': 'Hand off to project management', 'Lost': 'Ask the owner for the bid tab'}[st], 'est': True}
        if team:
            rec['team'] = team
        opps.append(rec)
    # Bids due this week for the estimator (spec 2.3 home lead).
    for j, d in enumerate((1, 3, 4, 6)):
        opps[j].update({'stage': 'Bidding', 'close_d': d, 'team': 'estimating', 'owner': estimators[j % 3], 'next_step': 'Finish takeoff and supplier quotes'})
    # Won share of closed bids = the bid win rate KPI (the public 15% baseline), in the estimating team and in the rest, so the
    # estimator's and the business development lead's win-rate tiles agree with the KPI. Wins are spread evenly over the close dates.
    rate = [k[3] for k in KPIS['cet'] if k[0] == 'bid_win_rate'][0] / 100.0
    for grp in ('estimating', None):
        closed = sorted((o for o in opps if o['stage'] in ('Won', 'Lost') and o.get('team') == grp), key=lambda o: (-o['close_d'], o['id']))
        won = max(1, int(rate * len(closed) + .5))
        wins = {int(k * len(closed) / won) for k in range(won)}
        for k, o in enumerate(closed):
            o['stage'] = 'Won' if k in wins else 'Lost'
            o['next_step'] = 'Hand off to project management' if o['stage'] == 'Won' else 'Ask the owner for the bid tab'
    for grp in ('estimating', None):
        closed = [o for o in opps if o['stage'] in ('Won', 'Lost') and o.get('team') == grp]
        r = 100.0 * sum(1 for o in closed if o['stage'] == 'Won') / max(1, len(closed))
        need(abs(r - rate * 100) <= 3, 'cet crm: win rate %.0f%% is not within 3 points of the bid win rate KPI' % r)
    services = [('Electrical construction, commercial', 'project', 250000, 6000000), ('Wastewater and pump-station electrical (Horton)', 'project', 300000, 8000000),
                ('Solar install', 'project', 400000, 3000000), ('Solar operations and maintenance', 'month', 1500, 9000),
                ('EV charger install', 'project', 60000, 600000), ('EV charger network management', 'month', 25, 50),
                ('Energy efficiency design-build (NuWave)', 'project', 80000, 1500000), ('Standby generators', 'project', 60000, 900000),
                ('Emergency service, 24/7', 'month', 2000, 12000), ('Battery storage', 'project', 500000, 4000000)]
    svc = [{'id': 'sf-cet-svc-%02d' % (i + 1), 'co': 'cet', 'name': n, 'unit': u, 'low': lo, 'high': hi, 'est': True} for i, (n, u, lo, hi) in enumerate(services)]
    return accounts, opps, svc


def build_fl_crm(rng, words, people, firms):
    accounts, opps = [], []
    for i, f in enumerate(firms[:80]):
        accounts.append({'id': 'sf-fl-acc-%03d' % (i + 1), 'co': 'fl', 'name': f, 'segment': rng.choice(['AmLaw 200', 'AmLaw 200', 'Midsize firm', 'Regional firm']),
                         'state': rng.choice(STATES_US), 'owner': people.person('Account manager') if rng.random() < .6 else role_only('Sales lead'),
                         'health': rng.choice(['Good', 'Good', 'Good', 'Watch', 'At risk']), 'renewal_d': rng.randint(10, 360)})
    kinds = [('Managed IT renewal', 120, 900), ('Cybersecurity add-on', 40, 260), ('E-billing outsourcing', 60, 480), ('HELIX desk upgrade', 30, 200),
             ('Legal AI enablement', 25, 150), ('Collections support', 40, 300)]
    seen = set()
    for i in range(64):
        acc = rng.choice(accounts)
        k, lo, hi = rng.choice(kinds)
        while '%s: %s' % (acc['name'], k) in seen:   # one opportunity per account and kind
            acc = rng.choice(accounts)
            k, lo, hi = rng.choice(kinds)
        seen.add('%s: %s' % (acc['name'], k))
        st = rng.choice(['Discovery', 'Proposal', 'Proposal', 'Negotiation', 'Won', 'Lost'])
        close = {'Discovery': (20, 90), 'Proposal': (5, 60), 'Negotiation': (1, 30), 'Won': (-200, -3), 'Lost': (-200, -3)}[st]
        opps.append({'id': 'sf-fl-opp-%03d' % (i + 1), 'co': 'fl', 'account_id': acc['id'], 'account': acc['name'], 'name': '%s: %s' % (acc['name'], k),
                     'stage': st, 'amount': rng.randrange(lo, hi) * 1000, 'close_d': rng.randint(*close), 'owner': acc['owner'],
                     'next_step': {'Discovery': 'Discovery call with the firm', 'Proposal': 'Send the proposal and pricing',
                                   'Negotiation': 'Agree terms with the firm', 'Won': 'Kick off onboarding', 'Lost': 'Note the reason and revisit'}[st], 'est': True})
    services = [('Managed IT, per attorney', 'seat', 180, 320), ('Service desk, per user', 'seat', 45, 90), ('Cyber posture subscription', 'month', 2500, 18000),
                ('Security operations center', 'month', 4000, 30000), ('E-billing outsourcing', 'month', 3000, 25000), ('Collections support', 'month', 2000, 15000),
                ('Network monitoring', 'month', 1500, 9000), ('Microsoft 365 management', 'seat', 8, 18), ('Legal AI enablement', 'project', 15000, 120000),
                ('Office moves and build-outs', 'project', 10000, 250000), ('Accounting services', 'month', 3000, 20000), ('Frontline Essentials bundle', 'seat', 150, 220)]
    svc = [{'id': 'sf-fl-svc-%02d' % (i + 1), 'co': 'fl', 'name': n, 'unit': u, 'low': lo, 'high': hi, 'est': True} for i, (n, u, lo, hi) in enumerate(services)]
    return accounts, opps, svc


def build_ts_crm(rng, words, people):
    accounts, opps = [], []
    pats = [('{W} Labs', 'Diagnostics Lab'), ('{W} Diagnostics', 'Diagnostics Lab'), ('{W} Pathology', 'Pathology'), ('{W} Biotherapeutics', 'Biopharma'),
            ('{W} Medical Center', 'Hospital'), ('{W} Research Institute', 'Academic Medical'), ('{W} Cleanroom Services', 'Cleanroom')]
    reps = [people.person('Inside sales rep') for _ in range(5)]
    for i in range(120):
        pat, seg = rng.choice(pats)
        mine = i < 26
        rec = {'id': 'sf-ts-acc-%03d' % (i + 1), 'co': 'ts', 'name': words.name(pat), 'segment': seg, 'state': rng.choice(STATES_US),
               'owner': YOU('Inside sales rep') if mine else rng.choice(reps), 'health': rng.choice(['Good', 'Good', 'Watch', 'At risk']),
               'last_order_d': -rng.randint(1, 75)}
        if mine:
            rec['for'], rec['team'] = ['ts-inside-sales'], 'inside-east'
        accounts.append(rec)
    lines = ['Gloves and wipes', 'Pipette tips', 'Centrifuge tubes', 'Cleanroom garments', 'Benchtop centrifuge', 'Freezer, -80 C', 'Private-label consumables', 'Managed inventory']
    seen = set()
    for i in range(100):
        acc = accounts[i % 40] if i < 40 else rng.choice(accounts)
        st = rng.choice(['Qualifying', 'Quote sent', 'Quote sent', 'Negotiating', 'Won', 'Lost'])
        close = {'Qualifying': (10, 60), 'Quote sent': (1, 30), 'Negotiating': (1, 21), 'Won': (-120, -2), 'Lost': (-120, -2)}[st]
        line = rng.choice(lines)
        while '%s: %s' % (acc['name'], line) in seen:   # one opportunity per account and product line
            if i >= 40:
                acc = rng.choice(accounts)
            line = rng.choice(lines)
        seen.add('%s: %s' % (acc['name'], line))
        rec = {'id': 'sf-ts-opp-%03d' % (i + 1), 'co': 'ts', 'account_id': acc['id'], 'account': acc['name'],
               'name': '%s: %s' % (acc['name'], line), 'stage': st, 'amount': rng.randrange(2, 250) * 1000,
               'close_d': rng.randint(*close), 'owner': acc['owner'],
               'next_step': {'Qualifying': 'Confirm volumes and the buyer', 'Quote sent': 'Follow up on the quote', 'Negotiating': 'Match the contract price',
                             'Won': 'Set up punchout ordering', 'Lost': 'Ask what price won'}[st], 'est': True}
        if acc.get('for'):
            rec['for'], rec['team'] = list(acc['for']), 'inside-east'
        opps.append(rec)
    return accounts, opps


def build_bpi_crm(rng, words, people):
    accounts, opps = [], []
    pats = [('{W} Alliance', 'Trade association'), ('{W} Foundation', 'Philanthropy'), ('{W} Health Network', 'Corporate'),
            ('{W} Mobility Group', 'Corporate'), ('{W} Coalition', 'Advocacy'), ('{W} Institute', 'Philanthropy')]
    ads = [people.person('Account director') for _ in range(5)]
    for i in range(40):
        pat, seg = rng.choice(pats)
        mine = i < 8
        plan = rng.randrange(120, 900, 10)
        used = int(plan * rng.uniform(.7, 1.12))
        rec = {'id': 'sf-bpi-acc-%03d' % (i + 1), 'co': 'bpi', 'name': words.name(pat), 'segment': seg, 'state': rng.choice(['DC', 'NY', 'IL', 'CA', 'VA', 'MD']),
               'owner': YOU('Account director') if mine else rng.choice(ads), 'health': rng.choice(['Good', 'Good', 'Watch', 'At risk']),
               'renewal_d': rng.randint(5, 330), 'retainer_k': rng.randrange(25, 180, 5), 'hours_plan': plan, 'hours_used': used}
        if mine:
            rec['for'], rec['team'] = ['bpi-account-director'], 'ad-dc'
        accounts.append(rec)
    accounts[0]['hours_used'] = int(accounts[0]['hours_plan'] * 1.18)
    accounts[1]['renewal_d'] = 38
    kinds = [('Public affairs retainer', 300, 1800), ('Reputation research study', 80, 400), ('Issue campaign, paid media', 400, 2400),
             ('Crisis readiness program', 60, 300), ('Policy campaign', 200, 1200)]
    seen = set()
    for i in range(50):
        acc = accounts[i % 8] if i < 8 else rng.choice(accounts)
        k, lo, hi = rng.choice(kinds)
        while '%s: %s' % (acc['name'], k) in seen:   # one opportunity per account and kind
            if i >= 8:
                acc = rng.choice(accounts)
            k, lo, hi = rng.choice(kinds)
        seen.add('%s: %s' % (acc['name'], k))
        st = rng.choice(['Pitch', 'Proposal', 'Proposal', 'Negotiation', 'Won', 'Lost'])
        close = {'Pitch': (14, 90), 'Proposal': (2, 30), 'Negotiation': (1, 30), 'Won': (-120, -2), 'Lost': (-120, -2)}[st]
        rec = {'id': 'sf-bpi-opp-%03d' % (i + 1), 'co': 'bpi', 'account_id': acc['id'], 'account': acc['name'], 'name': '%s: %s' % (acc['name'], k),
               'stage': st, 'amount': rng.randrange(lo, hi) * 1000, 'close_d': rng.randint(*close),
               'owner': acc['owner'] if acc.get('for') else role_only('Growth lead'),
               'next_step': {'Pitch': 'Pitch meeting with the client team', 'Proposal': 'Finish the proposal and budget', 'Negotiation': 'Agree scope and hours',
                             'Won': 'Staff the team', 'Lost': 'Debrief with the client'}[st], 'est': True}
        if acc.get('for'):
            rec['for'], rec['team'] = list(acc['for']), 'ad-dc'
        opps.append(rec)
    services = [('Public affairs retainer', 'retainer', 25000, 180000), ('Corporate reputation', 'retainer', 30000, 150000), ('Paid media campaign', 'project', 200000, 5000000),
                ('Opinion research', 'project', 40000, 300000), ('Crisis and litigation communications', 'project', 50000, 400000),
                ('Oversight readiness', 'project', 60000, 350000), ('Creative and content studio', 'project', 30000, 250000),
                ('Narrative monitoring', 'month', 5000, 25000), ('Executive positioning', 'retainer', 15000, 60000), ('Coalition building', 'project', 80000, 600000)]
    svc = [{'id': 'sf-bpi-svc-%02d' % (i + 1), 'co': 'bpi', 'name': n, 'unit': u, 'low': lo, 'high': hi, 'est': True} for i, (n, u, lo, hi) in enumerate(services)]
    return accounts, opps, svc


def build_procore(rng, words, people):
    out = []
    kinds = [('{W} Pump Station {N} upgrade', '{W} Water District'), ('{W} Wastewater Plant electrical', '{W} Water District'),
             ('{W} Middle School solar', '{W} School District'), ('{W} Elementary School EV charging', '{W} School District'),
             ('{W} Housing renovation, electrical', '{W} Housing Authority'), ('{W} Library lighting retrofit', '{W} Library Authority'),
             ('{W} Treatment Plant generators', '{W} Water Authority')]
    pms = [people.person('Project manager') for _ in range(5)]
    crew = [people.person('Field electrician') for _ in range(14)]
    foremen = [people.person('Foreman') for _ in range(5)]
    rfi_subj = ['Conduit route conflicts with the duct bank', 'Panel location on drawing E-201', 'Generator pad dimensions', 'Grounding detail at the MCC',
                'Owner-furnished switchgear delivery date', 'Roof penetration for the solar feeders', 'Charger mounting height', 'Fire alarm tie-in']
    co_subj = ['Added receptacles in the control room', 'Upsized feeder to the new pump', 'Relocated the transformer pad', 'Extra trenching for the chargers',
               'Temporary power for the owner', 'Lighting controls change']
    notes = ['Pulled feeders to the new panel.', 'Set conduit in the duct bank.', 'Terminated the control wiring.', 'Mounted charger pedestals.',
             'Waited on the owner for access; moved to the second floor.', 'Rough-in inspection passed.', 'Set the solar racking on the east roof.',
             'Tested the generator transfer switch.', 'Trenched for the charger feeders; backfill tomorrow.', 'Hung cable tray in the electrical room.',
             'Installed lighting fixtures on the first floor.', 'Set the transformer on its pad.', 'Labeled breakers and updated the panel schedule.',
             'Pulled wire for the fire alarm devices.', 'Megger tested the new feeders; all passed.', 'Core-drilled the slab for the new risers.',
             'Removed old fixtures and capped abandoned circuits.', 'Installed the MCC and anchored it.', 'Ran temporary power to the trailer.',
             'Mounted the inverters for the solar array.', 'Pulled the service conductors; utility inspection requested.',
             'Swapped the old panelboards in the basement.', 'Rain held up roof work; stayed on interior rough-in.',
             'Commissioned the lighting controls with the owner.']
    rn, cn = 0, 0
    for i in range(28):
        pat, own_pat = kinds[i % len(kinds)]
        pat = pat.replace('{N}', str(rng.randint(2, 9)))
        w = words.word()
        name, owner = pat.replace('{W}', w), own_pat.replace('{W}', w)
        for _ in range(20):
            if name not in words.used:
                break
            w = words.word()
            name, owner = pat.replace('{W}', w), own_pat.replace('{W}', w)
        words.used.add(name)
        town, st = rng.choice(NE_TOWNS)
        pm_mine = i < 6
        el_mine = i in (0, 6, 7)
        fr = [r for r, c in (('cet-project-manager', pm_mine), ('cet-field-electrician', el_mine)) if c]
        team = 'crew-2' if el_mine else 'crew-%d' % (1 + i % 6 if (1 + i % 6) != 2 else 7)
        el_today = i == 0   # the electrician works one of their three sites today
        today_crew = [rng.choice(foremen)] + rng.sample(crew, 3)
        if el_today:
            today_crew = [today_crew[0], YOU('Field electrician')] + today_crew[1:3]
        rfis = []
        for _ in range(rng.choice([2, 3, 3, 4])):
            rn += 1
            stt = rng.choice(['Open', 'Open', 'Answered', 'Closed'])
            rfis.append({'n': 'RFI %d' % rn, 'subject': rng.choice(rfi_subj), 'status': stt, 'due_d': rng.randint(-3, 12) if stt == 'Open' else -rng.randint(5, 60)})
        cos = []
        for _ in range(rng.choice([1, 1, 2])):
            cn += 1
            cos.append({'n': 'CO %d' % cn, 'subject': rng.choice(co_subj), 'amount': rng.randrange(4, 120) * 1000,
                        'status': rng.choice(['Pending owner', 'Pending owner', 'Approved', 'Rejected'])})
        daily = []
        for d, nt in zip(sorted(rng.sample(range(-14, 1), 11), reverse=True), rng.sample(notes, 11)):
            daily.append({'day': d, 'crew': rng.randint(3, 8), 'hours': rng.randrange(24, 72, 4), 'note': nt})
        if el_today and daily[0]['day'] != 0:
            daily.insert(0, {'day': 0, 'crew': 5, 'hours': 40, 'note': 'Crew starts at 7:00 am. Pull feeders to the new panel.'})
        cv = rng.randrange(300, 9000, 10) * 1000
        rec = {'id': 'pc-%03d' % (i + 1), 'co': 'cet', 'team': team, 'number': 'P-%d' % (3101 + i), 'name': name, 'owner_name': owner,
               'town': town, 'state': st, 'contract_value': cv, 'pct_complete': rng.randint(5, 95),
               'phase': rng.choice(['Preconstruction', 'Rough-in', 'Rough-in', 'Trim and terminations', 'Commissioning', 'Closeout']),
               'health': rng.choice(['On track', 'On track', 'Watch', 'At risk']),
               'pm': YOU('Project manager') if pm_mine else rng.choice(pms), 'crew_today': today_crew,
               'next_milestone': rng.choice(['Rough-in inspection', 'Switchgear delivery', 'Energize the new service', 'Owner walkthrough', 'Final inspection']),
               'next_d': rng.randint(2, 40), 'rfis': rfis, 'change_orders': cos, 'daily': daily,
               'inspections': [{'day': rng.randint(2, 20), 'what': rng.choice(['Rough-in electrical', 'Service and grounding', 'Final electrical'])}] if rng.random() < .6 else [],
               'est': True}
        if fr:
            rec['for'] = fr
        if el_mine and not rec['inspections']:
            rec['inspections'] = [{'day': 6, 'what': 'Rough-in electrical'}]
        out.append(rec)
    out[1]['health'] = 'At risk'
    out[0]['rfis'][0].update({'status': 'Open', 'due_d': 2})
    return out


def build_servicedesk(rng, people, firms):
    you = YOU('Help-desk engineer')
    engs = [people.person('Help-desk engineer') for _ in range(8)]
    subj = [('Outlook keeps asking for a password', 'P3'), ('Cannot open documents in the document system', 'P2'), ('VPN drops every hour', 'P3'),
            ('New associate needs accounts and a laptop', 'P4'), ('Printer on the 12th floor will not scan', 'P4'), ('Time entry app freezes at login', 'P2'),
            ('Trial team cannot reach the shared drive', 'P1'), ('MFA prompt not arriving on the phone', 'P2'), ('Docketing calendar not syncing', 'P2'),
            ('Laptop running slowly after an update', 'P4'), ('Suspicious message reported by a partner', 'P1'), ('Video room camera offline', 'P3'),
            ('Shared mailbox missing from Outlook', 'P3'), ('PDF redaction tool will not install', 'P3'), ('E-filing portal rejects the upload', 'P2'),
            ('Dictation software lost its profile', 'P3'), ('Conference room display not detected', 'P4'), ('Account locked after travel', 'P2'),
            ('Billing system report runs blank', 'P2'), ('Second monitor flickers', 'P4'), ('Remote desktop disconnects', 'P3'),
            ('Mobile email stopped syncing', 'P3'), ('Scanner saves to the wrong folder', 'P4'), ('Comparison tool crashes on large files', 'P3'),
            ('Paralegal needs access to a matter workspace', 'P3'), ('Departing attorney: disable accounts', 'P2'), ('Wi-Fi drops in the north wing', 'P3'),
            ('Teams calls have no audio', 'P2'), ('Phone forwarding not working', 'P3'), ('Docket report emails missing', 'P2'),
            ('Password expired while out of office', 'P3'), ('Large file transfer to opposing counsel fails', 'P2')]
    out = []
    for i in range(220):
        mine = i < 18
        s, p = rng.choice(subj)
        st = rng.choice(['New', 'In progress', 'In progress', 'Waiting on client', 'Resolved', 'Resolved', 'Past due'])
        if mine:
            st = ['In progress', 'In progress', 'New', 'Waiting on client', 'Past due', 'In progress', 'New', 'In progress', 'Past due', 'Waiting on client', 'In progress',
                  'Resolved', 'Resolved', 'Resolved', 'Resolved', 'Resolved', 'Resolved', 'Resolved'][i]
        od = -rng.randint(0, 20) if st != 'Resolved' else -rng.randint(1, 40)
        by = you if mine else rng.choice(engs)
        notes = [{'day': od, 'time': '%02d:%02d' % (rng.randint(7, 18), rng.choice([0, 10, 25, 40, 55])), 'by': by,
                  'text': rng.choice(['Called the user and reproduced the issue.', 'Checked the account and reset the session.',
                                      'Escalated to network engineering.', 'Sent steps to the user and asked them to confirm.',
                                      'Remote session scheduled with the user.', 'Pulled the sign-in logs; no errors on our side.',
                                      'Asked the firm\'s office manager to approve access.', 'Reinstalled the client and cleared the cache.',
                                      'Waiting on the vendor for a fix.', 'Swapped the device with a loaner.', 'Checked the license; it had lapsed.',
                                      'Reproduced on a second machine; looks like the last update.'])}]
        if st == 'Resolved':
            notes.append({'day': od + rng.randint(0, 2) if mine and i < 13 else od + 1, 'time': '%02d:%02d' % (rng.randint(9, 17), rng.choice([5, 20, 35, 50])),
                          'by': by, 'text': rng.choice(['Fixed and confirmed with the user. Closing.', 'User confirmed it works. Closing.',
                                                        'Applied the fix from the runbook; confirmed. Closing.', 'Vendor patch installed; user confirmed.',
                                                        'Access granted and tested with the user.'])})
        rec = {'id': 'sd-t-%03d' % (i + 1), 'co': 'fl', 'team': 'desk-east' if mine or rng.random() < .4 else rng.choice(['desk-central', 'desk-intl']),
               'number': 'T-%d' % (48100 + i), 'client': rng.choice(firms), 'requester_role': rng.choice(['Associate attorney', 'Legal assistant', 'Paralegal', 'Office manager', 'Docketing clerk']),
               'priority': p, 'status': st, 'urgent': p in ('P1', 'P2') and st != 'Resolved', 'subject': s, 'opened_d': od,
               'opened_time': '%02d:%02d' % (rng.randint(7, 18), rng.choice([5, 15, 30, 45])), 'notes': notes}
        if mine:
            rec['for'] = ['fl-help-desk-engineer']
        if st == 'Resolved':
            rec['resolved_d'] = notes[-1]['day'] if notes[-1]['day'] <= 0 else 0
        out.append(rec)
    # One resolved today by You (home tile "Resolved today").
    out[11]['resolved_d'] = 0
    out[11]['notes'][-1]['day'] = 0
    out[11]['opened_d'] = min(out[11]['opened_d'], 0)
    runbooks = []
    steps = {'password reset and MFA': ['Confirm the caller with the firm\'s verification question', 'Reset the password in the directory', 'Re-register MFA on the new phone', 'Confirm sign-in'],
             'new hire setup': ['Create the account from the firm\'s request form', 'Assign the practice group licenses', 'Image the laptop', 'Schedule the first-day call'],
             'VPN troubleshooting': ['Check the client version', 'Reset the tunnel profile', 'Test from a hotspot', 'Escalate to network engineering if it drops again'],
             'document system access': ['Confirm the matter security group', 'Re-sync the profile', 'Clear the local cache', 'Test opening a document'],
             'suspected phishing': ['Isolate the message', 'Block the sender', 'Check sign-ins for the user', 'Tell the firm\'s security contact']}
    for i in range(25):
        topic = list(steps)[i % 5]
        client = rng.choice(firms) if i >= 5 else None
        runbooks.append({'id': 'sd-rb-%02d' % (i + 1), 'co': 'fl', 'title': ('%s: %s' % (client, topic)) if client else topic[:1].upper() + topic[1:],
                         'client': client, 'steps': steps[topic]})
    return out, runbooks


def build_invoices(rng, firms):
    reasons = ['Task code missing', 'Rate above the approved rate', 'Timekeeper not approved', 'Block billing', 'Expense receipt missing', 'Late submission']
    out = []
    for i in range(300):
        r = rng.random()
        st = 'Paid' if r < .66 else ('Submitted' if r < .83 else ('Rejected' if r < .95 else 'Appealed'))
        sub = -rng.randint(1, 120)
        if st in ('Rejected', 'Appealed') and sub > -10:
            sub -= 10
        rec = {'id': 'fi-fl-inv-%03d' % (i + 1), 'co': 'fl', 'team': 'billing', 'client': rng.choice(firms), 'number': 'INV-%d' % (61200 + i),
               'amount': rng.randrange(4000, 180000, 50), 'status': st, 'submitted_d': sub, 'days_out': -sub if st != 'Paid' else rng.randint(30, 90)}
        if st in ('Rejected', 'Appealed'):
            rec['reason'] = rng.choice(reasons)
            rec['rejected_d'] = rng.randint(sub + 3, min(-1, sub + 20))
        out.append(rec)
    for i, d in enumerate((-1, -2, -4, -5, -6)):
        out[i].update({'status': 'Rejected', 'reason': reasons[i % len(reasons)], 'submitted_d': d - 6, 'rejected_d': d, 'days_out': 6 - d})
    return out


TS_ITEMS = ['Nitrile gloves, medium, 100 count', 'Nitrile gloves, large, 100 count', 'Pipette tips, 200 uL, racked', 'Pipette tips, 1000 uL, racked',
            'Serological pipets, 10 mL', 'Centrifuge tubes, 50 mL', 'Centrifuge tubes, 15 mL', 'Cleanroom wipes, 9 x 9 in', 'Specimen bags, biohazard',
            'Petri dishes, 100 mm', 'Lab coats, disposable', 'Cryovials, 2 mL', 'Microscope slides, frosted', 'Sterile swabs', 'Bottle-top filters, 0.22 um',
            'Weigh boats, medium', 'Cleanroom coveralls', 'Shoe covers, cleanroom', 'Face masks, procedure', 'Sharps containers, 2 gal']
DCS = [('swedesboro', 'Swedesboro', 150), ('center-2', 'Center 2', 75), ('center-3', 'Center 3', 75)]
# Product families x variants: about 230 distinct item names, so no centre stocks the same name under two item codes.
TS_FAMILIES = [('Nitrile gloves, {v}, 100 count', ['small', 'medium', 'large', 'extra large']),
               ('Chemo-rated nitrile gloves, {v}', ['small', 'medium', 'large']), ('Vinyl gloves, {v}, 100 count', ['medium', 'large']),
               ('Pipette tips, {v}, racked', ['10 uL', '20 uL', '200 uL', '1000 uL']), ('Filter pipette tips, {v}', ['10 uL', '200 uL', '1000 uL']),
               ('Pipette tips, {v}, bulk bag', ['200 uL', '1000 uL']), ('Serological pipets, {v}', ['1 mL', '5 mL', '10 mL', '25 mL', '50 mL']),
               ('Centrifuge tubes, {v}', ['15 mL', '50 mL']), ('Microcentrifuge tubes, {v}', ['0.5 mL', '1.5 mL', '2 mL']),
               ('PCR plates, {v}', ['96-well', '384-well']), ('PCR tube strips, {v}', ['clear', 'flat cap']),
               ('Cleanroom wipes, {v}', ['9 x 9 in', '12 x 12 in', 'presaturated']), ('Specimen bags, {v}', ['biohazard', '6 x 9 in', '12 x 15 in']),
               ('Petri dishes, {v}', ['60 mm', '100 mm', '150 mm']), ('Lab coats, {v}', ['disposable', 'fluid-resistant', 'knit cuff']),
               ('Cryovials, {v}', ['1.2 mL', '2 mL', '5 mL']), ('Cryo boxes, {v}', ['81-place', '100-place']),
               ('Microscope slides, {v}', ['frosted', 'charged', 'plain']), ('Cover glass, {v}', ['22 x 22 mm', '24 x 50 mm']),
               ('Sterile swabs, {v}', ['foam tip', 'cotton tip', 'flocked']), ('Bottle-top filters, {v}', ['0.22 um', '0.45 um']),
               ('Syringe filters, {v}', ['0.22 um PES', '0.45 um nylon', '0.2 um PTFE']), ('Weigh boats, {v}', ['small', 'medium', 'large']),
               ('Cleanroom coveralls, {v}', ['medium', 'large', 'extra large']), ('Shoe covers, {v}', ['cleanroom', 'non-skid']),
               ('Face masks, {v}', ['procedure', 'N95', 'cleanroom']), ('Sharps containers, {v}', ['1 qt', '2 gal', '8 gal']),
               ('Beakers, glass, {v}', ['50 mL', '250 mL', '600 mL', '1 L']), ('Graduated cylinders, {v}', ['10 mL', '100 mL', '500 mL']),
               ('Erlenmeyer flasks, {v}', ['125 mL', '250 mL', '500 mL']), ('Media bottles, {v}', ['100 mL', '500 mL', '1 L']),
               ('Wash bottles, {v}', ['250 mL', '500 mL']), ('Transfer pipets, {v}', ['3 mL', 'graduated', 'fine tip']),
               ('Inoculating loops, {v}', ['1 uL', '10 uL']), ('Cell culture flasks, {v}', ['T25', 'T75', 'T175']),
               ('Cell culture plates, {v}', ['6-well', '24-well', '96-well']), ('Reagent reservoirs, {v}', ['25 mL', '100 mL']),
               ('Lab tape, {v}', ['white', 'colored', 'freezer']), ('Labels, {v}', ['cryo', 'thermal transfer', 'slide']),
               ('Bench paper, {v}', ['roll', 'sheets']), ('Safety glasses, {v}', ['clear', 'anti-fog']), ('Face shields, {v}', ['full', 'visor']),
               ('Sleeve covers, {v}', ['polyethylene', 'cleanroom']), ('Hair nets, {v}', ['21 in', '24 in']), ('Beard covers, {v}', ['standard']),
               ('Autoclave bags, {v}', ['small', 'large', 'biohazard']), ('Autoclave tape, {v}', ['3/4 in', '1 in']),
               ('Disinfectant, {v}', ['70% IPA spray', 'quat wipes', 'bleach wipes']), ('Hand sanitizer, {v}', ['gel', 'foam']),
               ('Nalgene bottles, {v}', ['250 mL', '1 L']), ('Carboys, {v}', ['10 L', '20 L']), ('Spill kits, {v}', ['chemical', 'biohazard']),
               ('Absorbent pads, {v}', ['light', 'heavy']), ('Thermometers, {v}', ['digital', 'freezer']), ('Timers, {v}', ['digital', 'three-channel']),
               ('Test tube racks, {v}', ['13 mm', '16 mm', '25 mm']), ('Freezer racks, {v}', ['upright', 'chest']), ('Ice buckets, {v}', ['2.5 L', '4.5 L']),
               ('Parafilm, {v}', ['2 in', '4 in']), ('Aluminum foil, {v}', ['lab grade', 'heavy duty']), ('pH strips, {v}', ['0-14', '4.5-10']),
               ('Buffer, {v}', ['PBS 10x', 'TAE 50x', 'TBE 10x']), ('Agarose, {v}', ['standard', 'low melt']), ('Gel combs, {v}', ['8-well', '15-well']),
               ('Magnetic stir bars, {v}', ['small', 'large']), ('Glass vials, {v}', ['2 mL screw', '20 mL scintillation']),
               ('Vial caps, {v}', ['9 mm', '13 mm']), ('Syringes, {v}', ['1 mL', '10 mL', '60 mL']), ('Needles, {v}', ['18 G', '25 G'])]
TS_NAMES = [f.replace('{v}', v) for f, vs in TS_FAMILIES for v in vs]


def build_ts_ops(rng, accounts):
    inv, orders = [], []
    sku = 3104
    for team, dc, n in DCS:
        names = rng.sample(TS_NAMES, n)
        for i in range(n):
            sku += rng.randint(3, 19)
            rp = rng.randrange(40, 600, 10)
            oh = int(rp * rng.uniform(.0, 3.2)) if rng.random() > .04 else 0
            inv.append({'id': 'fi-ts-inv-%s-%03d' % (team, i + 1), 'co': 'ts', 'team': team, 'sku': 'TS-%s-%d' % (rng.choice(['PL', 'CR', 'LB', 'SF']), sku),
                        'name': names[i], 'dc': dc, 'on_hand': oh, 'reorder_point': rp, 'on_order': rng.choice([0, 0, rp, rp * 2]),
                        'days_cover': round(oh / max(1, rp / 14.0), 1)})
    need(len(inv) == 300, 'ts: expected 300 SKUs')
    for i in range(400):
        team, dc, _ = rng.choices(DCS, weights=[.5, .27, .23])[0]
        acc = accounts[i % 26] if i < 60 else rng.choice(accounts)
        st = rng.choices(['Shipped', 'Picking', 'Backordered', 'Late', 'On hold'], weights=[60, 25, 6, 5, 4])[0]
        ship = {'Picking': (0, 2), 'Shipped': (-20, -1), 'Late': (-3, -1), 'Backordered': (3, 14), 'On hold': (0, 7)}[st]
        rec = {'id': 'fi-ts-so-%03d' % (i + 1), 'co': 'ts', 'team': team, 'number': 'SO-%d' % (73100 + i * 3), 'account': acc['name'], 'dc': dc,
               'lines': rng.randint(1, 14), 'value': rng.randrange(150, 24000, 5), 'status': st, 'ship_d': rng.randint(*ship)}
        if acc.get('for'):
            rec['for'] = list(acc['for'])
        orders.append(rec)
    return inv, orders


FH_PRODUCTS = [('Classic swim trunk, 6 in', 'Swim', 78), ('Classic swim trunk, 8 in', 'Swim', 78), ('Lined swim trunk, 5 in', 'Swim', 85),
               ('Boardshort, 9 in', 'Swim', 88), ('Kids swim trunk', 'Kids', 52), ('Quarter-zip fleece', 'Fleece', 118), ('Crewneck sweatshirt', 'Fleece', 98),
               ('Short-sleeve tee', 'Tops', 45), ('Linen shirt', 'Tops', 98), ('Golf polo', 'Golf', 88), ('Golf short', 'Golf', 92), ('Bucket hat', 'Accessories', 42),
               ('Beach towel', 'Accessories', 58), ('Crewneck sweater', 'Knits', 128), ('Flannel shirt', 'Tops', 108)]
FH_COLORS = ['navy', 'sand', 'sage', 'coral', 'stripe']


def build_shopify(rng, season):
    products, daily, returns = [], [], []
    combos = [(p, c) for p in FH_PRODUCTS for c in FH_COLORS]
    rng.shuffle(combos)
    for i, ((name, cat, price), color) in enumerate(sorted(combos[:60], key=lambda x: (x[0][0], x[1]))):
        wc = round(rng.uniform(.6, 14), 1)
        products.append({'id': 'sh-p-%03d' % (i + 1), 'co': 'fh', 'name': '%s, %s' % (name, color), 'category': cat, 'price': price,
                         'inventory': int(wc * rng.randint(8, 40)), 'weeks_cover': wc, 'sell_through_pct': rng.randint(22, 88),
                         'return_rate_pct': round(rng.uniform(16, 26) if cat == 'Swim' else rng.uniform(8, 18), 1)})
    for d in range(-90, 0):
        orders = int(rng.uniform(380, 460))
        aov = round(rng.uniform(98, 112), 2)
        daily.append({'id': 'sh-d-%02d' % (-d), 'co': 'fh', 'day': d, 'orders': orders, 'revenue': int(orders * aov), 'aov': aov,
                      'returns': int(orders * rng.uniform(.15, .23)), 'seasonal': True, 'est': True})
    reasons = ['Too small', 'Too big', 'Liner fit', 'Color not as pictured', 'Changed mind', 'Arrived late', 'Defect: seam', 'Defect: drawcord']
    used = set()
    while len(returns) < 40:
        p = rng.choice(products)
        r = rng.choice(reasons)
        if (p['id'], r) in used:
            continue
        used.add((p['id'], r))
        returns.append({'id': 'sh-r-%02d' % (len(returns) + 1), 'co': 'fh', 'product_id': p['id'], 'product': p['name'], 'reason': r,
                        'title': '%s (%s)' % (p['name'], r), 'count_30d': rng.randint(2, 60)})   # the title names the record in sources
    returns.sort(key=lambda x: -x['count_30d'])
    del season
    return products, daily, returns


def fund_record(anc, rng):
    f = anc['fund']
    called_pct = 65
    return [{'id': 'fi-bsp-fund', 'co': 'bsp', 'fund': 'Fund I', 'commitments_m': f['commitments_m'], 'commitments_basis': 'Form D, public',
             'investors': f['investors'], 'called_m': round(f['commitments_m'] * called_pct / 100, 1), 'called_pct': called_pct,
             'next_report_d': 23, 'basis': 'Commitments and investor count from Form D; called share modeled (illustrative)', 'est': True}]


# ------------------------------------------------------------------------------------------------ email, calendar, chat, documents

# Email templates per role archetype: (subject, sender role ('*Role' = a named many-of-a-kind person), kind, [bodies]).
# The first body is the sender's; later bodies alternate You / sender. No calendar words, no addresses, no numbers that
# contradict the records. {co} = company name; {deal1} {deal2} {deal3} {deal4} {acct1} {acct2} {proj1} {firm1} {client1} {client2} filled per role.
EMAIL = {
    'mp': [('IC agenda for the next meeting', 'Senior associate', None, ['Draft agenda: {deal1}, the CET bid review and the fund letter. Want anything moved?', 'Put {deal1} first. Keep the bid review to ten minutes.']),
           ('{month:-1} portfolio results', 'Fund CFO', None, ['Four of six packs are in. Thomas Scientific is late and BPI is due this week. The summary is in SharePoint.']),
           ('Seller call recap: {deal4}', 'Partner', None, ['Owner is open to a sale next year. Wants to stay two years. Revenue looks close to the teaser.', 'Good. Get the first financials before we spend time on a model.']),
           ('Board prep: Punctual Pros', 'Punctual Pros CEO', None, ['Board pack goes out next week. Booking rate and the membership push are the main topics.']),
           ('Covenant tests in the next 30 days', 'Fund CFO', None, ['CET and Thomas Scientific test covenants within 30 days. Both packs say they expect to pass.']),
           ('Investor question on add-on pace', 'Investor relations lead', 'investor question', ['An investor asked how many add-ons we expect across the portfolio next year. Draft answer attached for your review.'])],
    'partner': [('Re: {deal3} process letter', '*Banker', 'seller', ['The seller wants indications by the end of next week. Management meetings follow for the top three.', 'We will submit. Send the data room access when ready.']),
                ('{deal4}: first financials', 'Senior associate', None, ['Revenue and margin are in line with the teaser. Customer concentration is the open question.']),
                ('Add-on screen for CET', 'Associate', None, ['Twelve electrical contractors in New England fit the size range. Four are worth a call.']),
                ('IC memo draft: {deal1}', 'Senior associate', None, ['Memo draft is in the data room folder. The model shows a 2.6x base case. Comments by tomorrow?']),
                ('Lender feedback', '*Lender', None, ['We can support 3.5x on the add-on at current pricing. Term sheet to follow.']),
                ('Management meeting logistics', 'Managing partner', None, ['Can you lead the management meeting? I will join for the first hour.'])],
    'op': [('Booking rate plan, Punctual Pros', 'Punctual Pros VP operations', None, ['Call recordings show missed booking chances after hours. We want the answering pilot on all four hubs.', 'Send me the results from the pilot hub first.']),
           ('CET non-productive time', 'CET VP operations', None, ['Crews are losing time waiting on material at two sites. We are trying staged deliveries.']),
           ('Frontline desk staffing', 'Frontline VP operations', None, ['Open roles on the service desk are slowing first-level resolution. Hiring plan attached.']),
           ('Fill rate by center', 'Thomas Scientific VP operations', None, ['Center 3 fill rate is the lowest of the three. Slotting changes start this week.']),
           ('PRG check-in schedule', 'Partner', None, ['Can you set the next round of company check-ins? Two hours each, KPIs first.']),
           ('Fair Harbor return rate', 'Fair Harbor VP operations', None, ['Swim returns are mostly sizing. The fit guide test is live on two products.'])],
    'sa': [('Data room: missing items for {deal1}', 'Analyst', None, ['Still missing: customer list by revenue, lease schedule and the payroll register. I sent a reminder to the banker.']),
           ('{deal2} model, version 3', 'Partner', None, ['Model looks right. Add a downside with two points less growth before IC.', 'Will do. Sending tonight.']),
           ('Diligence request list', '*Banker', None, ['Responses to the first 40 requests are uploaded. The rest come next week.']),
           ('Punctual Pros margin bridge', 'Punctual Pros CFO', None, ['Bridge for the last closed month is in the pack: price up, overtime up, parts flat.']),
           ('Quality of earnings scope', '*Accounting advisor', None, ['Scope letter attached. Fieldwork can start once the data room is complete.']),
           ('Comps for the IC memo', 'Associate', None, ['Updated the public comps table. Two peers dropped out of the set.'])],
    'fundcfo': [('{month:-1} reporting pack: Thomas Scientific', 'Thomas Scientific CFO', None, ['Pack is late this month. Inventory count adjustments are still open. We expect to send it by the end of the week.', 'Thanks. Send the P&L first if the rest slips.']),
                ('Capital call notice, draft', 'Fund accountant', None, ['Draft notice for the next call is ready for review. Wire instructions come from the administrator, not this note.']),
                ('Covenant tests due', 'CET CFO', None, ['Our leverage test is within 30 days. Compliance certificate draft is attached.']),
                ('Quarter-end checklist', 'Fund accountant', None, ['Checklist is updated. Valuation support from each company is the long pole.']),
                ('Audit planning', '*Audit manager', None, ['Planning meeting for the fund audit. Please share the investor schedule and the call history.']),
                ('Investor reporting timeline', 'Investor relations lead', 'investor question', ['An investor asked when the next quarterly letter goes out. I said about three weeks. Correct?'])],
    'ir': [('Question on Fund I capital calls', '*Investor contact', 'investor question', ['Can you confirm how much of our commitment has been called to date?']),
           ('Portfolio update request', '*Investor contact', 'investor question', ['Our committee asks for a short update on the six companies before the next letter.']),
           ('ESG questionnaire', '*Investor contact', 'investor question', ['Please complete the attached annual questionnaire. Policy documents are fine where they apply.']),
           ('Quarterly letter, draft 2', 'Managing partner', None, ['Comments are in. Shorten the market section and lead with the add-ons.']),
           ('Annual meeting venue', '*Event planner', None, ['Two venues can hold the meeting. Holding both for now.']),
           ('Data request: fund cash flows', '*Investor contact', 'investor question', ['Could you send the fund cash flow history for our model?'])],
    'ceo': [('Board update draft', 'CFO', None, ['Draft board update attached: results against plan, the top three risks and the hiring plan.', 'Lead with the customer numbers. Keep it to two pages.']),
            ('Top three risks', 'VP operations', None, ['My list: hiring pace, overtime and one large customer renewal. Happy to discuss.']),
            ('Check-in with BSP', 'BSP operating partner', None, ['Next check-in is set. KPIs first, then the growth initiatives.']),
            ('{month:-1} close: open items', 'Controller', None, ['{close_hold}']),
            ('Customer feedback', '*Customer success lead', None, ['Feedback from the last survey is in. Response time is the main ask.']),
            ('Hiring plan', '*Recruiter', None, ['Pipeline for the open roles is attached. Offers are out for two.'])],
    'cfo': [('{month:-1} close: open items', 'Controller', None, ['{close_list}']),
            ('Reporting pack for BSP', 'BSP fund CFO', None, ['Please send the {month:-1} pack when ready. P&L first if the rest takes longer.']),
            ('Covenant compliance certificate', '*Lender', None, ['Reminder: the compliance certificate is due with the next test.']),
            ('Payroll variance', '*Payroll specialist', None, ['{payroll_line}']),
            ('Budget draft 2', '*FP&A analyst', None, ['Draft 2 of next year\'s budget is in the finance folder. Revenue plan by line is updated.']),
            ('Audit fieldwork', '*Audit manager', None, ['Fieldwork dates are set. Please confirm the request list owners.'])],
    'vp': [('Staffing for next week', '*Operations manager', None, ['{open_roles_line}']),
           ('KPI review prep', 'CEO', None, ['Please bring the KPI trend and the two biggest drivers to the review.']),
           ('Vendor delay', '*Purchasing lead', None, ['A supplier pushed delivery a week. I have a backup quote.']),
           ('Safety walk notes', '*Safety lead', None, ['Notes from the safety walk are attached. Two follow-ups.']),
           ('Customer escalation', '*Customer success lead', None, ['A customer escalated a delay. I called them; we have a plan.']),
           ('Overtime this period', 'CFO', None, ['Overtime is running above plan. Can we review it at the weekly meeting?'])],
    'sales': [('Pipeline review', 'CEO', None, ['Let us review the top deals by stage before the leadership meeting.']),
              ('Follow-up: {acct1}', '*Client contact', None, ['Thanks for the proposal. We have questions on scope and timing.']),
              ('Proposal template', '*Marketing coordinator', None, ['The updated proposal template is in the shared folder.']),
              ('Win-loss notes', '*Account manager', None, ['Notes from the last two losses: price on one, timing on the other.']),
              ('Campaign results', '*Marketing coordinator', None, ['Results from last month\'s campaigns are in the dashboard.']),
              ('Renewal: {acct2}', '*Client contact', None, ['We plan to renew. Can we talk about adding services?'])],
    'dispatcher': [('Customer callback request', '*Customer service rep', None, ['A member called about her appointment window. Asked for a call back before noon.']),
                   ('Overflow plan', 'Location general manager', None, ['If the board fills, move non-urgent tune-ups to later in the week.']),
                   ('Parts at the York hub', '*Warehouse clerk', None, ['Ignitors are low at York. Lancaster has six.']),
                   ('Membership questions', '*Customer service rep', None, ['Two members asked about the Total Home plan. Script attached.']),
                   ('After-hours calls', '*On-call technician', None, ['Three after-hours calls last night; two booked for this morning.']),
                   ('Route change', 'VP operations', None, ['Please keep Toms River jobs on the NJ technicians this week.'])],
    'gm': [('Hub revenue last month', 'CFO', None, ['Lancaster hub revenue came in near plan. Detail is in the KPI pack.']),
           ('Callbacks review', 'VP operations', None, ['Callbacks at Lancaster are above target. Can you review them with the techs?']),
           ('Ride-along schedule', '*Field trainer', None, ['Ride-alongs for the two newest techs are set for this week.']),
           ('Truck maintenance', '*Fleet coordinator', None, ['Two trucks are due for service. Can we swap them on lighter days?']),
           ('Open recommendations', '*Comfort advisor', None, ['There are open repair recommendations on today\'s customers. I can call them after the visits.']),
           ('Hiring: Lancaster technicians', '*Recruiter', None, ['Three candidates for the open technician roles. Interviews this week?'])],
    'pm': [('RFI response: {proj1}', '*Engineer of record', None, ['Response to the conduit routing RFI is attached. Route along the east wall.']),
           ('Change order pricing', '*Foreman', None, ['Pricing for the added receptacles is ready for your review.']),
           ('Owner meeting', '*Owner representative', None, ['Can we move the owner meeting earlier? The board meets the same day.']),
           ('Material delivery', '*Supplier', None, ['Switchgear ships next week. Delivery window to follow.']),
           ('Inspection request', '*Foreman', None, ['Rough-in inspection is requested. The inspector will confirm a time.']),
           ('Schedule update', 'VP operations', None, ['Please send updated schedules for the at-risk projects before the review.'])],
    'estimator': [('Bid questions: {acct1}', '*Owner representative', None, ['Addendum 2 is posted. It changes the generator size.']),
                  ('Supplier quote', '*Supplier', None, ['Quote for the switchgear is attached. Valid for 30 days.']),
                  ('Bid or no bid', 'Business development lead', None, ['Can you size the two new bids by Thursday-week? We should pick one.'.replace('Thursday-week', 'the end of next week')]),
                  ('Past job costs', '*Project manager', None, ['Final costs for the last pump station job are in the estimating folder.']),
                  ('Bid results', '*Owner representative', None, ['Bid results are posted. Three bidders.']),
                  ('Takeoff help', '*Estimating assistant', None, ['Takeoff for the lighting retrofit is done. Please review counts.'])],
    'billing': [('Rejected invoice: {firm1}', '*Client billing contact', None, ['Your invoice was rejected for a task code. Please correct and resubmit.']),
                ('Rate approval', '*Client billing contact', None, ['New rates are approved from the next billing cycle.']),
                ('Appeal status', '*Billing lead', None, ['Two appeals are with the client. Expect answers this week.']),
                ('Outside counsel guidelines update', '*Client billing contact', None, ['Updated guidelines attached. Expense receipts are now required for every line.']),
                ('Aging report', '*Collections specialist', None, ['Unpaid over 60 days is attached by client.']),
                ('E-billing portal access', '*Client billing contact', None, ['Your portal access is renewed.'])],
    'inside': [('Quote follow-up: {acct1}', '*Lab manager', None, ['We are comparing your quote with our current supplier. Can you match the glove price?']),
               ('Reorder question', '*Lab manager', None, ['Do you have the 200 uL tips in stock? We need them next week.']),
               ('Account review', 'VP sales', None, ['Please review accounts with orders down over the last 30 days.']),
               ('Punchout setup', '*Purchasing contact', None, ['Our procurement team wants to set up punchout ordering.']),
               ('Backorder update', '*Customer service rep', None, ['Two of your accounts have backordered lines. ETA attached.']),
               ('New contact', '*Lab manager', None, ['Our new purchasing contact starts next week.'])],
    'ad': [('Hours this period: {client1}', '*Client contact', 'client ask', ['Can you share hours used against the plan before our next call?']),
           ('Statement review', '*Client contact', 'client ask', ['Please review the attached statement draft by tomorrow.']),
           ('Renewal: {client2}', '*Client contact', 'client ask', ['We would like to discuss renewal terms next month.'.replace(' next month', ' soon')]),
           ('Staffing', 'VP operations', None, ['Can your team cover the extra research work without overtime?']),
           ('Research results', '*Research director', None, ['Topline results from the survey are ready.']),
           ('Media plan', '*Media director', None, ['Draft media plan for the campaign is attached.'])],
    'ecom': [('Low stock: swim trunks', '*Planner', None, ['Three trunk colors are under two weeks of cover. Reorder suggestion attached.']),
             ('Return reasons', '*CX lead', None, ['Top return reason is still sizing. The fit guide test is live.']),
             ('Site speed', '*Developer contractor', None, ['Product pages are slower after the last theme update. Fix scheduled.']),
             ('Promo calendar', 'Marketing lead', None, ['Can we line up the next promo with the restock?']),
             ('Wholesale order overlap', '*Wholesale manager', None, ['A wholesale order could draw down online stock for two products.']),
             ('Shipping carrier update', '*Operations coordinator', None, ['Carrier pickup times change next week.'])],
}
# Per-company wording (spec 3.5 realism): no safety walks at the agency, the law-firm IT company or the apparel brand; owners at CET,
# clients at BPI and Frontline (fill() turns "customer" into "client" there).
EMAIL_SWAP = {
    'pp': {('ceo', 1): ('Top three risks', 'VP operations', None, ['My list: technician hiring, overtime and membership renewals. Happy to discuss.'])},
    'cet': {('ceo', 1): ('Top three risks', 'VP operations', None, ['My list: field hiring, non-productive time and switchgear lead times. Happy to discuss.']),
            ('ceo', 4): ('Owner feedback', '*Project manager', None, ['Two owners gave feedback at closeout. Faster schedule updates are the main ask.']),
            ('vp', 4): ('Owner escalation', '*Project manager', None, ['An owner escalated a schedule slip. I called them; we have a plan.'])},
    'fl': {('ceo', 1): ('Top three risks', 'VP operations', None, ['My list: desk hiring, response time and one large firm renewal. Happy to discuss.']),
           ('ceo', 4): ('Client feedback', '*Client success manager', None, ['Feedback from the last firm survey is in. Response time is the main ask.']),
           ('vp', 2): ('Vendor delay', '*Procurement lead', None, ['A laptop vendor pushed delivery a week. New hires get loaners until then.']),
           ('vp', 3): ('Desk audit notes', '*Desk lead', None, ['Notes from the ticket quality audit are attached. Two follow-ups.']),
           ('vp', 4): ('Client escalation', '*Client success manager', None, ['A firm escalated a slow ticket. I called them; we have a plan.'])},
    'ts': {('ceo', 1): ('Top three risks', 'VP operations', None, ['My list: warehouse hiring, overtime and late orders. Happy to discuss.'])},
    'bpi': {('ceo', 1): ('Top three risks', 'VP operations', None, ['My list: hiring pace, retainers over their hours plan and one large client renewal.']),
            ('ceo', 4): ('Client feedback', '*Account director', None, ['Feedback from the client survey is in. Faster turnaround is the main ask.']),
            ('vp', 2): ('Vendor delay', '*Production manager', None, ['A print vendor pushed delivery a week. I have a backup quote.']),
            ('vp', 3): ('Staffing review notes', '*Account director', None, ['Notes from the staffing review are attached. Two follow-ups.']),
            ('vp', 4): ('Client escalation', '*Account director', None, ['A client escalated a late deliverable. I called them; we have a plan.'])},
    'fh': {('ceo', 1): ('Top three risks', 'VP operations', None, ['My list: inventory cover, the return rate and one large wholesale renewal.']),
           ('vp', 3): ('Fulfillment audit notes', '*Operations coordinator', None, ['Notes from the fulfillment audit are attached. Two follow-ups.'])},
}
CAL_SWAP = {'bpi': {('leader', 9): ('Staffing review', '{office}', ['*Account director'], 'Hours against plan.')},
            'fl': {('leader', 9): ('Desk operations review', 'Video call', ['*Desk lead'], 'Queue and response time.')},
            'fh': {('leader', 9): ('Fulfillment walk', 'Warehouse', ['*Operations coordinator'], 'Pick and pack times.'),
                   ('leader', 6): ('Wholesale account visit', 'On site', ['*Wholesale manager'], 'Relationship check-in.')}}
NO_SAFETY = {'bpi', 'fl', 'fh'}
CHAT_SWAP = {'New safety program starts next week.': 'New onboarding program starts next week.', 'Safety walk notes posted.': 'Audit notes posted.'}
# Fixed times where the title names one ("Morning ...", "lunch", "huddle", "stand-up").
TITLE_TIME = {'Morning board check': ('08:00', '08:30'), 'Technician huddle': ('07:30', '07:45'), 'Banker lunch': ('12:00', '13:00'),
              'Team stand-up': ('09:00', '09:15')}


def email_tpl(a, org):
    return [EMAIL_SWAP.get(org, {}).get((a, i), t) for i, t in enumerate(EMAIL[a])]


def cal_pool(g, org):
    return [CAL_SWAP.get(org, {}).get((g, i), t) for i, t in enumerate(CAL[g])]


ARCH = {'bsp-managing-partner': 'mp', 'bsp-partner': 'partner', 'bsp-operating-partner': 'op', 'bsp-senior-associate': 'sa', 'bsp-associate': 'sa',
        'bsp-fund-cfo': 'fundcfo', 'bsp-investor-relations': 'ir', 'pp-dispatcher': 'dispatcher', 'pp-location-gm': 'gm', 'cet-project-manager': 'pm',
        'cet-estimator': 'estimator', 'fl-billing-specialist': 'billing', 'ts-inside-sales': 'inside', 'bpi-account-director': 'ad', 'fh-ecommerce-manager': 'ecom'}


def arche(rid):
    if rid in ARCH:
        return ARCH[rid]
    return {'ceo': 'ceo', 'cfo': 'cfo', 'vp-operations': 'vp', 'sales': 'sales'}[rid.split('-', 1)[1]]


# Calendar pools per group: (title, where, with roles, notes). Times are assigned in order.
CAL = {
    'bsp': [('Investment committee', 'New York office', ['Managing partner', 'Partner'], 'Two deals on the agenda.'),
            ('Portfolio review: Punctual Pros', 'Video call', ['Punctual Pros CEO', 'Operating partner'], 'Booking rate and memberships first.'),
            ('Deal team weekly', 'New York office', ['Partner', 'Senior associate'], 'Pipeline by stage.'),
            ('Lender call', 'Video call', ['*Lender'], 'Terms for the next add-on.'),
            ('Management meeting: add-on target', 'Video call', ['Partner'], 'Owner and finance lead attend.'),
            ('Fund close checklist', 'New York office', ['Fund CFO'], 'Quarter-end items.'),
            ('Investor call', 'Video call', ['Investor relations lead', '*Investor contact'], 'Portfolio update.'),
            ('CET board meeting', 'Worcester office', ['CET CEO', 'CET CFO'], 'Results and the Horton integration.'),
            ('Frontline operating review', 'Video call', ['Frontline CEO', 'Operating partner'], 'Desk metrics.'),
            ('Thomas Scientific pricing review', 'Video call', ['Thomas Scientific CFO'], 'Price changes and margin.'),
            ('Banker lunch', 'New York office', ['*Banker'], 'New sell-side processes.'),
            ('Associate model review', 'New York office', ['Senior associate', 'Associate'], 'Downside case.'),
            ('Audit planning', 'Video call', ['*Audit manager'], 'Fund audit timeline.'),
            ('Fair Harbor board prep', 'Video call', ['Fair Harbor CEO'], 'Wholesale and store plans.'),
            ('BPI quarterly review', 'Washington office', ['BPI CEO'], 'Retainer mix.'),
            ('Investor letter review', 'New York office', ['Managing partner'], 'Comments on draft 2.'),
            ('Annual meeting planning', 'Video call', ['*Event planner'], 'Venue and agenda.'),
            ('Capital call planning', 'New York office', ['Managing partner'], 'Amount and timing.'),
            ('Investor data requests', 'Video call', ['*Investor contact'], 'Quarterly template.')],
    'leader': [('Leadership meeting', '{office}', ['CEO', 'CFO', 'VP operations'], 'Weekly: KPIs and the top risks.'),
               ('KPI review', '{office}', ['VP operations'], 'Trend and drivers.'),
               ('Check-in with BSP', 'Video call', ['BSP operating partner'], 'KPIs first.'),
               ('Pipeline review', '{office}', ['CEO'], 'Top deals by stage.'),
               ('Month-end close review', '{office}', ['Controller'], 'Open items.'),
               ('Hiring sync', 'Video call', ['*Recruiter'], 'Open roles.'),
               ('Customer visit', 'On site', ['*Client contact'], 'Relationship check-in.'),
               ('Budget working session', '{office}', ['CFO'], "Next year's plan."),
               ('Board update prep', '{office}', ['CEO', 'CFO'], 'Two pages.'),
               ('Safety walk', 'On site', ['*Safety lead'], 'Two sites.'),
               ('Vendor review', 'Video call', ['*Purchasing lead'], 'Prices and lead times.'),
               ('All-hands', '{office}', [], 'Short update to the team.'),
               ('Lender call', 'Video call', ['*Lender'], 'Compliance certificate.'),
               ('Growth review', '{office}', ['CEO'], 'Leads, wins and next steps.'),
               ('Team meeting', '{office}', [], 'Priorities for the week.')],
    'office': [('Morning board check', 'Lancaster office', ['VP operations'], 'Unassigned and late jobs.'),
               ('Technician huddle', 'Lancaster office', [], 'Safety tip and today\'s parts.'),
               ('Callback review', 'Lancaster office', ['*Field trainer'], 'Last week\'s callbacks.'),
               ('CSR training', 'Lancaster office', ['*Customer service rep'], 'Membership offers.'),
               ('Hub numbers review', 'Video call', ['CFO'], 'Revenue and callbacks.'),
               ('Ride-along', 'On site', ['*Field trainer'], 'New technician.'),
               ('Truck swap', 'Lancaster office', ['*Fleet coordinator'], 'Two trucks to service.'),
               ('Weekly ops meeting', 'Lancaster office', ['VP operations', 'Location general manager'], 'Board, callbacks and overtime.'),
               ('Interview: technician candidate', 'Lancaster office', ['*Recruiter'], 'Second round.'),
               ('Parts order review', 'Video call', ['*Warehouse clerk'], 'Low items.')],
    'project': [('Owner meeting', 'On site', ['*Owner representative'], 'Schedule and change orders.'),
                ('Foreman coordination', 'On site', ['*Foreman'], 'Next two weeks.'),
                ('Bid review', 'Worcester office', ['Business development lead'], 'Bid or no bid.'),
                ('Supplier call', 'Video call', ['*Supplier'], 'Switchgear lead times.'),
                ('Inspection walk', 'On site', ['*Foreman'], 'Rough-in.'),
                ('Project review', 'Worcester office', ['VP operations'], 'At-risk projects.'),
                ('Takeoff review', 'Worcester office', ['*Estimating assistant'], 'Counts check.'),
                ('Pre-bid meeting', 'On site', ['*Owner representative'], 'Site walk.'),
                ('Safety stand-down', 'On site', ['*Safety lead'], 'Fall protection.'.replace('Fall protection', 'Working at height')),
                ('Closeout punch list', 'On site', ['*Foreman'], 'Final items.'),
                ('Bid opening', 'Video call', ['*Owner representative'], 'Read-out of the bids.'),
                ('Estimating team meeting', 'Worcester office', [], 'Bids this week.')],
    'desk': [('Team stand-up', 'Video call', [], 'Priorities for today.'),
             ('Client call', 'Video call', ['*Client contact'], 'Open items.'),
             ('Quote and renewal check-in', 'Video call', ['VP sales'], 'Quotes and renewals.'),
             ('Weekly one-on-one', 'Video call', ['*Team lead'], 'Goals.'),
             ('Training', 'Video call', ['*Trainer'], 'New tools.'),
             ('Account planning', 'Video call', ['*Account manager'], 'Top accounts.'),
             ('Promo planning', 'Video call', ['Marketing lead'], 'Next promo.'),
             ('Status meeting', 'Video call', ['*Client contact'], 'Hours and next steps.'),
             ('Vendor call', 'Video call', ['*Vendor contact'], 'Service review.'),
             ('Team retro', 'Video call', [], 'What to keep and change.')],
}
# Who goes to each meeting: the archetypes that may have it on their calendar, by pool and title (titles after CAL_SWAP). A title
# not listed is open to every archetype of its pool. Separately, every role of the same company named in a meeting's attendee
# list always gets the event (build_comms).
WHO = {
    'bsp': {'Investment committee': {'mp', 'partner', 'op', 'sa'}, 'Portfolio review: Punctual Pros': {'mp', 'partner', 'op'},
            'Deal team weekly': {'mp', 'partner', 'sa'}, 'Lender call': {'mp', 'partner', 'fundcfo'},
            'Management meeting: add-on target': {'mp', 'partner', 'sa'}, 'Fund close checklist': {'fundcfo', 'mp'},
            'Investor call': {'mp', 'ir', 'fundcfo'}, 'CET board meeting': {'mp', 'partner', 'op'},
            'Frontline operating review': {'mp', 'partner', 'op'}, 'Thomas Scientific pricing review': {'partner', 'op', 'sa'},
            'Banker lunch': {'mp', 'partner', 'sa'}, 'Associate model review': {'partner', 'sa'}, 'Audit planning': {'fundcfo', 'mp'},
            'Fair Harbor board prep': {'mp', 'partner', 'op'}, 'BPI quarterly review': {'mp', 'partner', 'op'},
            'Investor letter review': {'ir', 'mp'}, 'Annual meeting planning': {'ir'}, 'Capital call planning': {'fundcfo', 'mp'},
            'Investor data requests': {'ir', 'fundcfo'}},
    'leader': {'KPI review': {'ceo', 'cfo', 'vp'}, 'Check-in with BSP': {'ceo', 'cfo', 'vp'}, 'Pipeline review': {'ceo', 'sales'},
               'Month-end close review': {'cfo'}, 'Hiring sync': {'ceo', 'vp', 'sales'}, 'Customer visit': {'ceo', 'vp', 'sales'},
               'Wholesale account visit': {'ceo', 'sales'}, 'Budget working session': {'ceo', 'cfo', 'vp'}, 'Board update prep': {'ceo', 'cfo'},
               'Safety walk': {'ceo', 'vp'}, 'Staffing review': {'ceo', 'vp'}, 'Desk operations review': {'ceo', 'vp'},
               'Fulfillment walk': {'ceo', 'vp'}, 'Vendor review': {'cfo', 'vp'}, 'Lender call': {'ceo', 'cfo'}, 'Growth review': {'ceo', 'sales'},
               'Team meeting': {'vp', 'sales'}},
    'office': {'Callback review': {'gm'}, 'Hub numbers review': {'gm'}, 'Ride-along': {'gm'}, 'Interview: technician candidate': {'gm'}},
    'project': {'Owner meeting': {'pm'}, 'Foreman coordination': {'pm'}, 'Bid review': {'estimator'}, 'Inspection walk': {'pm'},
                'Project review': {'pm'}, 'Takeoff review': {'estimator'}, 'Pre-bid meeting': {'estimator'}, 'Safety stand-down': {'pm'},
                'Closeout punch list': {'pm'}, 'Bid opening': {'estimator'}, 'Estimating team meeting': {'estimator'}},
    'desk': {'Client call': {'billing', 'inside', 'ad'}, 'Quote and renewal check-in': {'inside'}, 'Account planning': {'inside', 'ad'},
             'Promo planning': {'ecom'}, 'Status meeting': {'ad'}},
}
# An attendee label that names a role under another label.
LABEL_ALIAS = {'Investor relations lead': 'Investor relations'}

CAL_GROUP = {'mp': 'bsp', 'partner': 'bsp', 'op': 'bsp', 'sa': 'bsp', 'fundcfo': 'bsp', 'ir': 'bsp', 'ceo': 'leader', 'cfo': 'leader', 'vp': 'leader',
             'sales': 'leader', 'dispatcher': 'office', 'gm': 'office', 'pm': 'project', 'estimator': 'project', 'billing': 'desk', 'inside': 'desk',
             'ad': 'desk', 'ecom': 'desk'}
OFFICE = {'bsp': 'New York office', 'pp': 'Lancaster office', 'cet': 'Worcester office', 'fl': 'St. Louis office', 'ts': 'Swedesboro office',
          'bpi': 'Washington office', 'fh': 'New York office'}
TODAY_TIMES = [('08:30', '09:00'), ('09:30', '10:15'), ('11:00', '11:45'), ('14:00', '15:00'), ('16:00', '16:30')]
LATER_TIMES = [('09:00', '10:00'), ('10:30', '11:30'), ('13:00', '14:00'), ('15:00', '16:00')]

CHAT = {
    'firm': ['Portfolio results summary is in SharePoint.', 'Reminder: IC materials are due tomorrow.', 'Thomas Scientific pack will be late this month.',
             'Lender call moved to the afternoon.', 'Who has the latest comps table?', 'Updated the fund calendar.', 'CET board deck is final.',
             'Investor letter draft 2 is ready for comments.', 'Office closes early on the next team day.', 'New data room for the PP add-on is live.',
             'Welcome the new associate to the deal team.', 'PRG check-ins are set for the next two weeks.'],
    'deal': ['{deal1} data room is open. Request list is in the folder.', 'Model v3 is uploaded.', 'Banker says indications are due next week.',
             'QoE provider shortlist: three firms.', 'Comps refreshed; two peers dropped out.', 'Management meeting confirmed for {deal1}.',
             'Who is on the site visit?', 'IC memo draft is ready for comments.', 'Seller asked for a call on structure.', 'Lender appetite looks fine at 3.5x.',
             'Add-on screen for CET is updated.', 'Diligence tracker shows 40 open requests.'],
    'leadership': ['Board update draft is in the shared folder.', 'KPI pack is out. Please review before the weekly meeting.', 'Hiring plan approved for two roles.',
                   'Customer renewal call went well.', 'Close is on track for the controller\'s date.', 'BSP check-in moved to the morning.',
                   'Please send top risks for the board deck.', 'New safety program starts next week.', 'Budget draft 2 is ready.',
                   'Thanks all for a strong week.', 'Lender asked for the compliance certificate early.', 'All-hands agenda is posted.'],
    'ops': ['{open_roles_chat}', 'Overtime is above plan this week.', 'Vendor pushed a delivery a week.', 'Safety walk notes posted.',
            'Customer escalation handled; plan in the ticket.', 'KPI review prep due tomorrow.', 'New scheduling rule starts Monday.'.replace(' Monday', ' next week'),
            'Training session is set for the new hires.', 'Please update the board before noon.', 'Utilization is up two points.',
            'Backlog review at the weekly meeting.', 'Thanks for covering the extra shifts.'],
    'sales': ['Proposal template updated.', 'Two renewals came in this week.', 'Pipeline review moved to the afternoon.', 'Win-loss notes posted.',
              'New lead from a referral.', 'Pricing question from a client; looping in finance.', 'Campaign results are in the dashboard.',
              'Please update stages before the review.', 'Big proposal goes out tomorrow.', 'Client asked for references.', 'Conference booth is confirmed.',
              'Good week, team.'],
    'hub': ['Two no-heat calls added for this morning. {town} first.', 'Ignitors are low at York; Lancaster has six.', 'Running late on the second stop; customer informed.',
            'Who can take a drain clog this afternoon?', 'Truck 14 is back from service.', 'Member asked for the same technician next time.',
            'Parts run at noon.', 'Reminder: photos of the data plate on every job.', 'Callback from yesterday is resolved.', 'Rain tonight; expect sump calls.',
            'New price book items are live.', 'Nice work on the five-star reviews.'],
    'dispatch': ['Board is full for the morning.', 'Three unassigned jobs in Harrisburg.', 'Toms River jobs stay with the NJ techs.', 'Customer called to confirm the window.',
                 'Urgent no-heat added for this afternoon.', 'Moving two tune-ups to later in the week.', 'Who is free after noon?', 'Member waiting on a callback.',
                 'Running late flag set on two jobs.', 'After-hours calls: three overnight.', 'Parts transfer from Lancaster to York.', 'End-of-day board is clear.'],
    'crew': ['Crew starts at 7:00 am.', 'Feeders pulled to the new panel.', 'Inspector confirmed for the rough-in.', 'Need more 3/4 in conduit on site.',
             'Owner access is open until 3:00 pm.', 'Safety tailgate at the trailer.', 'Generator pad is poured.', 'Who has the lift keys?',
             'Moving to the second floor after lunch.', 'RFI on the panel location is open.', 'Material delivery at 10:00 am.', 'Good progress today.'],
    'pm': ['Updated schedules are in the project folder.', 'Change order pricing is ready for review.', 'Owner meeting moved earlier.', 'Switchgear ships next week.',
           'Two RFIs due this week.', 'At-risk projects review at the weekly meeting.', 'New PM onboarding next week.', 'Please close out punch lists.',
           'Inspector backlog is two days.', 'Safety stand-down on all sites.', 'Retainage schedule updated.', 'Thanks for the quick turnarounds.'],
    'desk': ['Queue is high this morning.', 'P1 at a client is resolved.', 'Runbook updated for MFA resets.', 'Who can take the new hire setups?',
             'Escalated a VPN issue to network engineering.', 'Reminder: update ticket notes before closing.', 'Phishing report from a client; handled.',
             'First-level resolution is up this week.', 'Shift swap approved.', 'Two tickets past due; please check.', 'Training on the new desk tools.',
             'Good work on the backlog.'],
    'floor': ['Late orders list is posted by the dock.', 'Truck pickup moved to 3:00 pm.', 'Cycle count in aisle 12.', 'Low stock on gloves, medium.',
              'Backordered lines are flagged in red.', 'Two orders on hold for credit.', 'New slotting starts tomorrow.', 'Forklift 3 is down.',
              'Overtime approved for the evening shift.', 'Safety huddle at the start of shift.', 'Receiving is caught up.', 'Nice work on fill rate.'],
    'client': ['Client asked for hours against plan.', 'Statement draft is ready for review.', 'Research topline is in.', 'Media plan draft posted.',
               'Renewal call set with a client.', 'Please log hours by end of day.', 'New request from a client; scoping now.', 'Staffing for the research study is set.',
               'Creative review moved to the afternoon.', 'Client thanked the team for the quick response.', 'Over-scope hours flagged on one retainer.', 'Good week.'],
    'ecommerce': ['Low stock on two trunk colors.', 'Return rate is steady.', 'Site speed fix is scheduled.', 'Promo copy is ready for review.',
                  'Restock lands next week.', 'Fit guide test is live on two products.', 'Carrier pickup times change next week.', 'Top return reason is still sizing.',
                  'Wholesale order could draw down online stock.', 'Email flow revenue is up.', 'New product photos are uploaded.', 'Nice sales day yesterday.'],
}
CHANNELS = {
    'bsp': [('firm', 'firm', 'Firm', 'firm'), ('deal', 'deal', 'Deal team', 'deal'), ('reviews', 'firm', 'Portfolio reviews', 'firm')],
    'pp': [('leadership', 'leadership', 'Leadership', 'leadership'), ('ops', 'ops', 'Operations', 'ops'), ('sales', 'sales', 'Marketing', 'sales'), ('lancaster', 'lancaster', 'Lancaster hub', 'hub'),
           ('york', 'york', 'York hub', 'hub'), ('all-hubs', 'all-hubs', 'Dispatch, all hubs', 'dispatch')],
    'cet': [('leadership', 'leadership', 'Leadership', 'leadership'), ('ops', 'ops', 'Operations', 'ops'), ('sales', 'sales', 'Business development', 'sales'), ('pm', 'pm', 'Project managers', 'pm'),
            ('crew-2', 'crew-2', 'Crew 2', 'crew')],
    'fl': [('leadership', 'leadership', 'Leadership', 'leadership'), ('ops', 'ops', 'Operations', 'ops'), ('sales', 'sales', 'Sales', 'sales'), ('desk-east', 'desk-east', 'Service desk east', 'desk')],
    'ts': [('leadership', 'leadership', 'Leadership', 'leadership'), ('ops', 'ops', 'Operations', 'ops'), ('sales', 'sales', 'Sales', 'sales'), ('swedesboro', 'swedesboro', 'Swedesboro floor', 'floor')],
    'bpi': [('leadership', 'leadership', 'Leadership', 'leadership'), ('ops', 'ops', 'Operations', 'ops'), ('sales', 'sales', 'Growth', 'sales'), ('ad-dc', 'ad-dc', 'Client service', 'client')],
    'fh': [('leadership', 'leadership', 'Leadership', 'leadership'), ('ops', 'ops', 'Operations', 'ops'), ('sales', 'sales', 'Marketing', 'sales'), ('ecommerce', 'ecommerce', 'E-commerce', 'ecommerce')],
}
CHAT_SENDERS = {'firm': ['Managing partner', 'Partner', 'Fund CFO', 'Operating partner', 'Investor relations lead'],
                'deal': ['Partner', 'Senior associate', 'Associate', 'Analyst'], 'leadership': ['CEO', 'CFO', 'VP operations', 'Controller'],
                'ops': ['VP operations', '*Operations manager', '*Safety lead'], 'sales': ['*Account manager', '*Marketing coordinator'],
                'hub': ['*Dispatcher', '*Technician', 'Location general manager'], 'dispatch': ['*Dispatcher', '*Customer service rep'],
                'crew': ['*Foreman', '*Field electrician'], 'pm': ['*Project manager', 'VP operations'], 'desk': ['*Help-desk engineer', '*Desk lead'],
                'floor': ['*Warehouse associate', '*Shift lead'], 'client': ['*Account director', '*Research director'],
                'ecommerce': ['*E-commerce specialist', '*CX lead']}

DOCS = {
    'bsp': [('IC memo: {deal1}', 'Investment committee', 'Memo', 'deal', 'Thesis, model summary, risks and the ask.'),
            ('IC memo: {deal2}', 'Investment committee', 'Memo', 'deal', 'Add-on case and integration plan.'),
            ('IC minutes, last meeting', 'Investment committee', 'Notes', 'deal', 'Decisions and follow-ups.'),
            ('CIM: {deal1}', 'Deals', 'CIM', 'deal', "Seller's offering memorandum."),
            ('CIM: {deal3}', 'Deals', 'CIM', 'deal', "Seller's offering memorandum."),
            ('Diligence request list: {deal1}', 'Diligence', 'Request list', 'deal', 'Open and answered requests.'),
            ('Diligence request list: {deal2}', 'Diligence', 'Request list', 'deal', 'Open and answered requests.'),
            ('Data room index: {deal1}', 'Data room', 'Index', 'deal', 'Folders and what is missing.'),
            ('Data room index: {deal2}', 'Data room', 'Index', 'deal', 'Folders and what is missing.'),
            ('Add-on screen: CET', 'Deals', 'Spreadsheet', 'deal', 'New England electrical contractors in the size range.'),
            ('Add-on screen: Punctual Pros', 'Deals', 'Spreadsheet', 'deal', 'Residential service companies near the hubs.'),
            ('Public comps table', 'Deals', 'Spreadsheet', 'deal', 'Listed peers and multiples.'),
            ('Portfolio KPI pack, {month:-1}', 'Portfolio', 'Deck', 'prg', 'KPIs for all six companies against plan.'),
            ('Portfolio results summary, {month:-1}', 'Portfolio', 'Deck', 'prg', 'Revenue and EBITDA against plan by company.'),
            ('PRG check-in notes', 'Portfolio', 'Notes', 'prg', 'Notes from the last round of company check-ins.'),
            ('Value creation plans', 'Portfolio', 'Deck', 'prg', 'Growth plan initiatives by company.'),
            ('Quarter-end checklist', 'Fund', 'Checklist', 'fund', 'Fund close tasks and owners.'),
            ('Capital call history', 'Fund', 'Spreadsheet', 'fund', 'Calls to date by investor class.'),
            ('Covenant test schedule', 'Fund', 'Spreadsheet', 'fund', 'Next test date for each company.'),
            ('Quarterly investor letter, draft 2', 'Investors', 'Letter', 'ir', 'Portfolio update and fund highlights.'),
            ('Fund I summary for investors', 'Investors', 'Deck', 'ir', 'Commitments, calls and the six companies.'),
            ('Approved portfolio overview deck', 'Investors', 'Deck', 'ir', 'Approved for investor use.'),
            ('Investor question log', 'Investors', 'Spreadsheet', 'ir', 'Questions received and answers sent.'),
            ('Annual meeting plan', 'Investors', 'Plan', 'ir', 'Agenda, speakers and venue options.')],
    'company': [("Next year's budget, draft 2", 'Finance', 'Spreadsheet', None, 'Revenue plan by line, with the hiring plan.'),
                ('Board deck, latest', 'Board', 'Deck', None, 'Results against plan, risks and initiatives.'),
                ('{month:-1} results pack', 'Finance', 'Deck', None, 'P&L, KPIs and the close status for {month:-1}.'),
                ('Operating review notes', 'Operations', 'Notes', None, 'KPI trends and actions from the last review.'),
                ('Hiring plan', 'People', 'Spreadsheet', None, 'Open roles by team and target start.'),
                ('Pricing review', 'Finance', 'Deck', None, 'Price changes and expected margin impact.'),
                ('Safety program', 'Operations', 'Policy', None, 'Field safety rules and training schedule.'),
                ('Growth initiatives tracker', 'Strategy', 'Spreadsheet', None, 'Status of each growth initiative with BSP.'),
                ('Customer survey results', 'Customers', 'Deck', None, 'What customers asked for most.'),
                ('Vendor list', 'Operations', 'Spreadsheet', None, 'Key suppliers and lead times.')],
    'pm': [('Project schedules, all active', 'Projects', 'Spreadsheet', 'pm', 'Milestones and float by project.'),
           ('Change order log', 'Projects', 'Spreadsheet', 'pm', 'Pending and approved change orders.')],
    'estimating': [('Past job costs: pump stations', 'Estimating', 'Spreadsheet', 'estimating', 'Final costs on the last six pump-station jobs.'),
                   ('Bid calendar', 'Estimating', 'Spreadsheet', 'estimating', 'Open bids and due dates in days.')],
    'ad-dc': [('Client hours by retainer', 'Client service', 'Spreadsheet', 'ad-dc', 'Hours used against plan for each retainer.'),
              ('Statement templates', 'Client service', 'Template', 'ad-dc', 'Approved statement formats.')],
}
DOC_BODY = '{summary} {detail} Modeled figures are marked est.'
# One or two sentences per document, filled from the records (spec 3.5: no filler bodies).
DOC_DETAIL = {
    'IC memo: {deal1}': 'The base case shows about 2.6x. The top risks are customer concentration and the owner transition.',
    'IC memo: {deal2}': 'The add-on fits next to an existing company. Integration starts with dispatch and pricing.',
    'IC minutes, last meeting': 'The committee moved {deal1} forward and asked for a downside case on {deal2}.',
    'CIM: {deal1}': 'Covers history, services, customers and the last three years of results.',
    'CIM: {deal3}': 'Indications of interest are due by the end of next week.',
    'Diligence request list: {deal1}': 'Responses to the first 40 requests are uploaded. The rest come next week.',
    'Diligence request list: {deal2}': 'Most financial requests are answered. Customer contracts are still open.',
    'Data room index: {deal1}': 'Still missing: the customer list by revenue, the lease schedule and the payroll register.',
    'Data room index: {deal2}': 'Financials and contracts are uploaded. The lease schedule is still missing.',
    'Add-on screen: CET': 'Twelve contractors fit the size range; four are worth a call.',
    'Add-on screen: Punctual Pros': 'Companies are sorted by distance to the nearest hub, with revenue estimates.',
    'Public comps table': 'Two peers dropped out of the set at the last refresh.',
    'Portfolio KPI pack, {month:-1}': '{packs_line}',
    'Portfolio results summary, {month:-1}': '{packs_line}',
    'PRG check-in notes': 'Each company: KPIs first, then the growth initiatives and the asks for BSP.',
    'Value creation plans': 'One page per company, with an owner and a target for each initiative.',
    'Quarter-end checklist': 'Valuation support from each company is the long pole.',
    'Capital call history': 'Each call is shown as a share of commitments.',
    'Covenant test schedule': 'CET and Thomas Scientific test within 30 days.',
    'Quarterly investor letter, draft 2': 'Comments so far: shorten the market section and lead with the add-ons.',
    'Fund I summary for investors': 'Commitments come from the public Form D; the called share is modeled.',
    'Approved portfolio overview deck': 'Uses public facts only; use it to answer investor questions.',
    'Investor question log': 'Open questions: add-on pace and the next letter date.',
    'Annual meeting plan': 'Two venues are on hold.',
    "Next year's budget, draft 2": 'The hiring plan covers {open_roles_n} open roles.',
    'Board deck, latest': '{rev_line} for {month:-1}.',
    '{month:-1} results pack': '{rev_line}. {close_short}',
    'Operating review notes': 'Actions from the last review each have an owner and a date.',
    'Hiring plan': '{open_roles_n} open roles across the company.',
    'Pricing review': 'Proposed price changes by line, with the expected margin effect.',
    'Safety program': 'Training is tracked by crew; the next session is on the shared calendar.',
    'Client service standards': 'Turnaround targets and review steps for client work.',
    'Service desk standards': 'Response targets and escalation rules by priority.',
    'Fulfillment standards': 'Pick, pack and ship targets for the warehouse.',
    'Growth initiatives tracker': 'Each initiative has an owner, a status and the next check-in with BSP.',
    'Customer survey results': 'Response time is the most common ask.',
    'Vendor list': 'Lead times are listed for the top suppliers.',
    'Project schedules, all active': 'At-risk projects are flagged for the weekly review.',
    'Change order log': 'Change orders pending the owner are listed first.',
    'Past job costs: pump stations': 'Use these as the baseline for the next pump-station bid.',
    'Bid calendar': 'Bids due in the next two weeks are at the top.',
    'Client hours by retainer': 'Retainers over their hours plan are flagged.',
    'Statement templates': 'Use the approved format for every client statement.',
    'Team contact list (roles only)': 'Roles and teams only; no personal numbers.',
    'Quarterly priorities': 'Three priorities agreed with BSP, each with an owner.',
}
DOC_SWAP = {'bpi': ('Client service standards', 'Operations', 'Policy', None, 'How client work is reviewed before it goes out.'),
            'fl': ('Service desk standards', 'Operations', 'Policy', None, 'How the desk answers and escalates tickets.'),
            'fh': ('Fulfillment standards', 'Operations', 'Policy', None, 'How orders are picked, packed and shipped.')}


def person_of(role, people, cache):
    """'*Role' -> a stable named person per organisation and role; else role-only."""
    if role.startswith('*'):
        r = role[1:]
        if r not in cache:
            cache[r] = people.person(r)
        return cache[r]
    return role_only(role)


def fill(s, ctx):
    for k, v in ctx.items():
        if not k.startswith('_'):
            s = s.replace('{%s}' % k, v)
    if ctx.get('_org') in ('bpi', 'fl'):
        s = re.sub(r'\bcustomer', 'client', re.sub(r'\bCustomer', 'Client', s))
    return s


def build_comms(org, roles, rng, people, ctx):
    """Email threads and calendar events for each role of the organisation that has those apps. A meeting picked by several roles
    is one event for all of them, at one time; no role is booked twice at once."""
    cache = {}
    threads, picks = [], []
    tn = 0
    for r in [x for x in roles if x['company'] == org and ('email' in x['apps'] or 'calendar' in x['apps'])]:
        a = arche(r['id'])
        you = YOU(r['label'])
        rctx = dict(ctx)
        if 'email' in r['apps']:
            days = [0, -1, -1, -2, -3, -5]
            for i, (subj, frm, kind, bodies) in enumerate(email_tpl(a, org)):
                tn += 1
                sender = person_of(frm, people, cache)
                d = days[i]
                t0 = '%02d:%02d' % (rng.randint(7, 17), rng.choice([2, 14, 27, 39, 42, 51]))
                msgs = []
                for j, b in enumerate(bodies):
                    msgs.append({'from': sender if j % 2 == 0 else you, 'day': d, 'time': t0 if j == 0 else '%02d:%02d' % (min(19, int(t0[:2]) + j), 10 + j),
                                 'body': fill(b, rctx)})
                threads.append({'id': 'em-%s-%03d' % (org, tn), 'co': org, 'for': [r['id']], 'subject': fill(subj, rctx), 'from': sender,
                                'participants': [you, sender], 'day': d, 'time': t0, 'unread': i < 3, 'kind': kind, 'messages': msgs})
        if 'calendar' in r['apps']:
            g = CAL_GROUP[a]
            ok = [i for i, t in enumerate(cal_pool(g, org)) if a in WHO.get(g, {}).get(t[0], {a})]   # only meetings this role attends
            for idx in rng.sample(ok, min(10, len(ok))):
                picks.append((r, g, idx))
    # One event per (pool, entry) per organisation; attendees in the order they picked it.
    meet = {}
    for r, g, idx in picks:
        meet.setdefault((g, idx), []).append(r)
    order = sorted(meet, key=lambda k: (-len(meet[k]), list(meet).index(k)))
    booked = {}   # role id -> [(day, start, end)]
    def free(rs, d, s_, e_):
        return all(not (bd == d and s_ < be and bs < e_) for r in rs for bd, bs, be in booked.get(r['id'], ()))
    later_days = [1, 2, 3, 4, 6, 7]
    events = []
    cal_roles = [x for x in roles if x['company'] == org and 'calendar' in x['apps']]
    for en, key in enumerate(order, 1):
        g, idx = key
        title, where, withs, notes = cal_pool(g, org)[idx]
        named = {LABEL_ALIAS.get(w, w) for w in withs}
        # A role of this company named as an attendee always has the event on its own calendar.
        rs = meet[key] + [x for x in cal_roles if x['label'] in named and x not in meet[key]]
        fixed = TITLE_TIME.get(title)
        today_n = max(sum(1 for d, _, _ in booked.get(r['id'], ()) if d == 0) for r in rs)
        days = ([0] if today_n < 4 else []) + rng.sample(later_days, len(later_days))
        slot = None
        for d in days:
            times = [fixed] if fixed else rng.sample(TODAY_TIMES if d == 0 else LATER_TIMES, len(TODAY_TIMES if d == 0 else LATER_TIMES))
            slot = next(((d, a_, b_) for a_, b_ in times if free(rs, d, a_, b_)), None)
            if slot:
                break
        if not slot:
            continue
        d, s_, e_ = slot
        for r in rs:
            booked.setdefault(r['id'], []).append(slot)
        labels = {r['label'] for r in rs}
        attendees = [person_of(w, people, cache) for w in withs] + [role_only(l) for l in sorted(labels - named)] if len(rs) > 1 else \
            [person_of(w, people, cache) for w in withs if LABEL_ALIAS.get(w, w) != rs[0]['label']]
        events.append({'id': 'ca-%s-%03d' % (org, en), 'co': org, 'for': [r['id'] for r in rs], 'title': fill(title, ctx), 'day': d, 'start': s_,
                       'end': e_, 'where': fill(where, {'office': OFFICE[org]}), 'with': attendees, 'notes': fill(notes, ctx)})
    events.sort(key=lambda e: (e['day'], e['start'], e['id']))
    by_label = {x['label']: x['id'] for x in cal_roles}
    for e in events:
        for w in e['with']:
            rid = by_label.get(LABEL_ALIAS.get(w['role'], w['role'])) if not w.get('name') else None
            need(rid is None or rid in e['for'], 'calendar: %s names the %s but it is not on their calendar' % (e['title'], w['role']))
    return threads, events


def build_chat(org, rng, people, ctx, st=None):
    out = []
    cache = {}
    for cid, team, name, kind in CHANNELS[org]:
        # A hub channel's technicians are that hub's ServiceTitan technicians.
        crew = sorted((t['name'], TRADE_ROLE[t['trade']]) for t in (st or {}).get('technicians', []) if t.get('team') == team and t['name'] != 'You') \
            if kind == 'hub' else []
        texts = [CHAT_SWAP.get(t, t) if org in NO_SAFETY else t for t in CHAT[kind]]
        senders = [x for x in CHAT_SENDERS[kind] if not (org in NO_SAFETY and x == '*Safety lead')]
        rng.shuffle(texts)
        msgs = []
        n = rng.randint(12, len(texts))
        days = sorted(rng.choice([0, 0, -1, -1, -2, -3, -4, -5, -6]) for _ in range(n))
        for i in range(n):
            frm = rng.choice(senders)
            if frm == '*Technician' and crew:
                n_, r_ = rng.choice(crew)
                p = {'name': n_, 'role': r_}
            elif frm.startswith('*'):
                p = people.person(frm[1:]) if rng.random() < .4 or frm[1:] not in cache else cache[frm[1:]]
                cache.setdefault(frm[1:], p)
            else:
                p = role_only(frm)
            msgs.append({'from': p, 'day': days[i], 'time': '%02d:%02d' % (rng.randint(7, 18), rng.randint(0, 59)), 'text': fill(texts[i], ctx)})
        msgs.sort(key=lambda x: (x['day'], x['time']))
        out.append({'id': 'ch-%s-%s' % (org, cid), 'co': org, 'team': team, 'name': name, 'messages': msgs})
    return out


def build_docs(org, rng, people, ctx):
    out = []
    owners = {'bsp': ['Senior associate', 'Associate', 'Fund CFO', 'Investor relations lead', 'Partner'], 'other': ['Controller', 'CFO', 'VP operations', 'CEO']}
    if org == 'bsp':
        tpl = DOCS['bsp']
    else:
        extra = {'cet': DOCS['pm'] + DOCS['estimating'], 'bpi': DOCS['ad-dc']}.get(org) or \
            [('Team contact list (roles only)', 'People', 'Spreadsheet', None, 'Who to call for what, by role.'),
             ('Quarterly priorities', 'Strategy', 'Deck', None, 'Top priorities agreed with BSP.')]
        tpl = [DOC_SWAP[org] if org in DOC_SWAP and t[0] == 'Safety program' else t for t in DOCS['company']] + extra
    for i, (title, folder, kind, team, summary) in enumerate(tpl):
        need(title in DOC_DETAIL, 'documents: no detail for %s' % title)
        body = DOC_BODY.replace('{summary}', summary).replace('{detail}', DOC_DETAIL[title])
        rec = {'id': 'dr-%s-%03d' % (org, i + 1), 'co': org, 'team': team, 'title': fill(title, ctx), 'folder': folder, 'kind': kind,
               'day': -rng.randint(0, 30), 'owner': role_only(rng.choice(owners['bsp' if org == 'bsp' else 'other'])),
               'summary': fill(summary, ctx), 'body': fill(body, ctx)}
        if team == 'ir':
            rec['for'] = ['bsp-investor-relations']
        out.append(rec)
    return out


# ------------------------------------------------------------------------------------------------ visibility (spec 4.3, same rule as the server)

class Pool:
    """Every record of every (app, set) across the organisation files and ServiceTitan, as the server loads them."""

    def __init__(self, org_files, st):
        self.sets = {}
        for org in ORGS:
            for app, sets in org_files[org]['apps'].items():
                for s, recs in sets.items():
                    self.sets.setdefault((app, s), []).extend(recs)
        for s in ('jobs', 'customers', 'equipment', 'technicians', 'pricebook'):
            self.sets.setdefault(('servicetitan', s), []).extend(st[s])

    def all(self, app, s):
        return self.sets.get((app, s), [])


def visible(rec, role, app, set_):
    scope = role['apps'].get(app, {}).get(set_)
    if scope is None:
        return False
    if scope == 'portfolio':
        return True
    if rec.get('co') != role['company']:
        return False
    if scope == 'company':
        return True
    if scope == 'team':
        return rec.get('team') == role['team'] or role['id'] in (rec.get('for') or ())
    if scope == 'own':
        return role['id'] in (rec.get('for') or ())
    return False


def vis(pool, role, app, s, where=None):
    return [r for r in pool.all(app, s) if visible(r, role, app, s) and (where is None or where(r))]


# ------------------------------------------------------------------------------------------------ chip map (spec 3.7)

def D(app, s, where=None):
    return ('data', app, s, where)


T_SITE = ('tool', 'site_brief')


def P(name):
    return ('public', name)


OPEN = lambda r: r.get('stage') not in ('Won', 'Lost', 'Closed', 'Passed')  # noqa: E731


def chip_map(role):
    rid, co = role['id'], role['company']
    m = {
        'bsp-managing-partner': [D('financials', 'pnl', lambda r: r['m'] == -1), D('financials', 'pnl', lambda r: r['m'] == -1),
                                 D('dealcloud', 'deals', lambda r: r['stage'] in ('IOI', 'LOI')), D('drive', 'docs', lambda r: r['folder'] == 'Investment committee')],
        'bsp-partner': [D('dealcloud', 'deals', lambda r: r['stage'] in ('Screening', 'IOI', 'LOI', 'Diligence') and r['owner']['role'] == 'Partner'),
                        D('dealcloud', 'deals', lambda r: 0 <= r['next_d'] <= 7), P('deal'), D('email', 'threads', lambda r: r['kind'] == 'seller')],
        'bsp-operating-partner': [D('financials', 'kpis', lambda r: r['m'] == -1), D('adp', 'headcount', lambda r: r['open_roles'] > 0),
                                  D('calendar', 'events', lambda r: 0 <= r['day'] <= 7 and 'review' in r['title'].lower()), D('email', 'threads')],
        'bsp-senior-associate': [P('deal'), D('drive', 'docs', lambda r: r['folder'] == 'Data room'), D('financials', 'pnl', lambda r: r['co'] == 'pp'),
                                 D('drive', 'docs', lambda r: r['kind'] == 'Request list')],
        'bsp-associate': [D('financials', 'kpis', lambda r: r['m'] == -1), P('directory'), D('drive', 'docs', lambda r: r['kind'] == 'CIM'), D('dealcloud', 'deals')],
        'bsp-fund-cfo': [D('financials', 'fund'), D('financials', 'debt', lambda r: 0 <= r['next_test_d'] <= 45),
                         D('financials', 'packs', lambda r: r['status'] in ('Late', 'Due')), D('drive', 'docs', lambda r: r['title'] == 'Quarter-end checklist')],
        'bsp-investor-relations': [D('email', 'threads', lambda r: r['kind'] == 'investor question'), D('drive', 'docs', lambda r: 'letter' in r['title'].lower()),
                                   D('financials', 'fund'), D('email', 'threads')],
        'pp-hvac-technician': [T_SITE] * 4, 'pp-plumber': [T_SITE] * 4,
        'pp-dispatcher': [D('servicetitan', 'technicians', lambda r: r['status'] == 'Free'), D('servicetitan', 'jobs', lambda r: r['status'] == 'Running late'),
                          D('servicetitan', 'jobs', lambda r: r['day'] == 0 and r['member'] and not r['assigned']), D('servicetitan', 'jobs', lambda r: r['day'] == 0)],
        'pp-location-gm': [D('servicetitan', 'jobs', lambda r: r['day'] == 0), D('servicetitan', 'customers', lambda r: any(x['status'] == 'open' for x in r['recs'])),
                           D('financials', 'kpis', lambda r: r['kpi'] == 'revenue_k' and r['m'] == -1), D('financials', 'kpis', lambda r: r['kpi'] == 'callbacks')],
        'cet-field-electrician': [D('procore', 'projects', lambda r: any(d['day'] == 0 for d in r['daily'])),
                                  D('procore', 'projects', lambda r: any(x['status'] == 'Open' for x in r['rfis'])),
                                  D('procore', 'projects', lambda r: len(r['crew_today']) > 0), D('procore', 'projects')],
        'cet-project-manager': [D('procore', 'projects', lambda r: r['health'] == 'At risk'),
                                D('procore', 'projects', lambda r: any(x['status'] == 'Open' and 0 <= x['due_d'] <= 7 for x in r['rfis'])),
                                D('procore', 'projects', lambda r: any(x['status'] == 'Pending owner' for x in r['change_orders'])), D('procore', 'projects')],
        'cet-estimator': [D('salesforce', 'opps', lambda r: r['stage'] == 'Bidding' and 0 <= r['close_d'] <= 7), D('salesforce', 'opps', lambda r: r['stage'] == 'Won'),
                          D('salesforce', 'opps', lambda r: r['stage'] == 'Qualifying'), D('email', 'threads')],
        'fl-help-desk-engineer': [D('servicedesk', 'tickets', lambda r: r['status'] != 'Resolved'), D('servicedesk', 'tickets', lambda r: r['status'] in ('Past due', 'New')),
                                  D('servicedesk', 'runbooks'), D('servicedesk', 'tickets', lambda r: r['status'] == 'Resolved')],
        'fl-billing-specialist': [D('financials', 'invoices', lambda r: r['status'] == 'Rejected'), D('financials', 'invoices', lambda r: r['status'] != 'Paid'),
                                  D('financials', 'invoices', lambda r: r['status'] == 'Rejected'), D('email', 'threads')],
        'ts-inside-sales': [D('salesforce', 'opps', lambda r: r['stage'] == 'Quote sent'), D('salesforce', 'accounts', lambda r: r['health'] in ('Watch', 'At risk')),
                            D('salesforce', 'accounts', lambda r: r['last_order_d'] <= -30), D('email', 'threads')],
        'ts-warehouse-lead': [D('financials', 'inventory', lambda r: r['on_hand'] < r['reorder_point']), D('financials', 'orders', lambda r: r['ship_d'] == 0),
                              D('financials', 'orders', lambda r: r['status'] == 'Late'), D('financials', 'orders', lambda r: r['status'] == 'On hold')],
        'bpi-account-director': [D('salesforce', 'accounts', lambda r: r['hours_used'] > r['hours_plan']), D('email', 'threads', lambda r: r['kind'] == 'client ask'),
                                 D('salesforce', 'accounts', lambda r: r['renewal_d'] <= 60), D('email', 'threads')],
        'fh-ecommerce-manager': [D('shopify', 'daily', lambda r: r['day'] == -1), D('shopify', 'returns'), D('shopify', 'products', lambda r: r['weeks_cover'] < 2),
                                 D('shopify', 'products')],
    }
    if rid in m:
        return m[rid]
    kind = rid.split('-', 1)[1]
    if kind == 'ceo':
        return [D('financials', 'pnl', lambda r: r['m'] in (0, -1)), D('financials', 'kpis', lambda r: r['m'] == -1 and r['value'] != r['target']),
                D('financials', 'debt'), D('drive', 'docs', lambda r: r['folder'] == 'Board')]
    if kind == 'cfo':
        return [D('financials', 'pnl'), D('financials', 'close'), D('financials', 'debt'), D('adp', 'payroll')]
    if kind == 'vp-operations':
        return {'pp': [D('servicetitan', 'jobs', lambda r: r['day'] == 0), D('financials', 'kpis', lambda r: r['kpi'] == 'callbacks'),
                       D('financials', 'kpis', lambda r: r['kpi'] == 'tech_utilization'), D('financials', 'kpis', lambda r: r['kpi'] == 'overtime_hours')],
                'cet': [D('procore', 'projects', lambda r: r['health'] == 'At risk'), D('procore', 'projects', lambda r: any(x['status'] == 'Open' for x in r['rfis'])),
                        D('procore', 'projects', lambda r: any(-7 <= d['day'] <= 0 for d in r['daily'])),
                        D('procore', 'projects', lambda r: any(x['status'] == 'Pending owner' for x in r['change_orders']))],
                'fl': [D('servicedesk', 'tickets', lambda r: r['status'] == 'Past due'), D('servicedesk', 'tickets', lambda r: r['status'] != 'Resolved'),
                       D('financials', 'kpis', lambda r: r['kpi'] == 'flr'), D('adp', 'headcount', lambda r: r['open_roles'] > 0)],
                'ts': [D('financials', 'orders', lambda r: r['status'] == 'Late'), D('financials', 'inventory', lambda r: r['on_hand'] == 0),
                       D('financials', 'kpis', lambda r: r['kpi'] == 'fill_rate' and r['team']), D('financials', 'kpis', lambda r: r['kpi'] == 'overtime_hours')],
                'bpi': [D('financials', 'kpis', lambda r: r['kpi'] == 'hours_over_scope'), D('financials', 'kpis', lambda r: r['kpi'] == 'retainers_at_risk'),
                        D('adp', 'headcount'), D('financials', 'kpis', lambda r: r['kpi'] == 'utilization' and r['team'])],
                'fh': [D('financials', 'kpis', lambda r: r['kpi'] == 'return_rate'), D('shopify', 'products', lambda r: r['weeks_cover'] < 2),
                       D('shopify', 'returns'), D('financials', 'kpis', lambda r: r['kpi'] == 'ship_days')]}[co]
    if kind == 'sales':
        return {'pp': [D('marketing', 'campaigns'), P('homes'), D('marketing', 'campaigns'), D('marketing', 'campaigns', lambda r: r['channel'] == 'Mail')],
                'cet': [D('salesforce', 'opps', lambda r: r['stage'] == 'Bidding' and 0 <= r['close_d'] <= 7), D('salesforce', 'opps', lambda r: r['stage'] in ('Won', 'Lost')),
                        D('salesforce', 'opps', OPEN), D('email', 'threads')],
                'fl': [D('salesforce', 'opps', lambda r: OPEN(r) and r['close_d'] <= 30), D('salesforce', 'accounts', lambda r: r['health'] == 'At risk'),
                       D('salesforce', 'opps', OPEN), D('email', 'threads')],
                'ts': [D('salesforce', 'opps', OPEN), D('salesforce', 'accounts', lambda r: r['health'] in ('Watch', 'At risk')),
                       D('salesforce', 'opps', lambda r: r['stage'] == 'Quote sent'), D('email', 'threads')],
                'bpi': [D('salesforce', 'opps', lambda r: r['stage'] == 'Won'), D('salesforce', 'opps', lambda r: r['stage'] == 'Proposal'),
                        D('salesforce', 'opps', OPEN), D('email', 'threads')],
                'fh': [D('marketing', 'campaigns', lambda r: r['m'] == 0), D('marketing', 'campaigns'), D('financials', 'kpis', lambda r: r['kpi'] == 'repeat_rate'),
                       D('marketing', 'campaigns')]}[co]
    raise SystemExit('no chip map for ' + rid)


def check_chips(roles, pool, st):
    for r in roles:
        cm = chip_map(r)
        need(len(cm) == len(r['chips']) == 4, 'chips: %s needs four chips and four chip-map entries' % r['id'])
        for chip, b in zip(r['chips'], cm):
            if b[0] == 'data':
                need(b[1] in r['apps'] and b[2] in r['apps'][b[1]], 'chip map: %s "%s" uses %s.%s, which the role cannot read' % (r['id'], chip, b[1], b[2]))
                need(len(vis(pool, r, b[1], b[2], b[3])) > 0, 'chip map: %s "%s" has no visible record behind it' % (r['id'], chip))
            elif b[0] == 'tool':
                need(b[1] in r['tools'], 'chip map: %s "%s" needs %s' % (r['id'], chip, b[1]))
                need(any(j['day'] == 0 and r['id'] in j.get('for', ()) for j in st['jobs']), 'chip map: %s has no job today' % r['id'])
            else:
                need(b[1] in r['public'], 'chip map: %s "%s" needs public %s' % (r['id'], chip, b[1]))


# ------------------------------------------------------------------------------------------------ catalogue

def season(co, m):
    return SEASON.get(co, {}).get(cal_month(m)[1], 1.0)


def kfmt(r):
    u, v = r['unit'], r['value']
    if u == '%':
        return ('%g' % v) + '%'
    if u == '$':
        return '${:,}'.format(v)
    if u == 'k$':
        return money_k(v)
    if u == 'min':
        return '%g min' % v
    if u == 'days':
        return '%g days' % v
    return '{:,}'.format(v)


def kpi_of(pool, co, kid, team=None, m=-1):
    for r in pool.all('financials', 'kpis'):
        if r['co'] == co and r['kpi'] == kid and r['team'] == team and r['m'] == m:
            return r
    raise SystemExit('kpi %s %s missing' % (co, kid))


def l12(pool, co, field='revenue_k'):
    return sum(r[field] * season(co, r['m']) for r in pool.all('financials', 'pnl') if r['co'] == co and -12 <= r['m'] <= -1)


def tile(label, value, sub, needs, modeled=False):
    return {'label': label, 'value': str(value), 'sub': sub, 'modeled': modeled, 'needs': needs}


def cal_list(pool, role):
    ev = sorted(vis(pool, role, 'calendar', 'events', lambda r: r['day'] == 0), key=lambda r: r['start'])
    def prompt(title):
        t = lower_first(title)
        return ('Help me with %s.' if t.lower().endswith(' prep') else 'Prep me for %s.') % t   # never "Prep me for board update prep."
    return [{'time': t12(e['start']), 'title': e['title'], 'where': e['where'], 'prompt': prompt(e['title'])} for e in ev]


def home_for(role, pool, st, org_files):
    rid, co = role['id'], role['company']
    kind = rid.split('-', 1)[1] if co != 'bsp' else rid
    cust = {c['id']: c for c in st['customers']}
    h = {'title': 'At a glance', 'list_first': False, 'list_title': 'Today', 'list': [], 'needs': 'financials', 'needs_text': 'the numbers',
         'list_needs': 'calendar'}
    if rid in ('bsp-managing-partner', 'bsp-partner', 'bsp-operating-partner', 'bsp-senior-associate', 'bsp-associate'):
        # Only companies whose pack is in have reported (the packs show Thomas Scientific late and BPI due).
        sent = {r['company'] for r in pool.all('financials', 'packs') if r['m'] == -1 and r['status'] == 'In'}
        pnl = sorted((r for r in pool.all('financials', 'pnl') if r['m'] == -1 and r['co'] in sent), key=lambda r: COS.index(r['co']))
        # Behind plan = revenue or EBITDA more than PLAN_TOL_PCT under plan (the same tolerance as the CEO homes and the agent).
        behind = []
        for r in pnl:
            rv, ev = vs_plan(r['revenue_k'], r['plan_revenue_k'])[0], ebitda_vs_plan(r)[0]
            miss = [(n_, -x) for n_, x in (('revenue', rv), ('EBITDA', ev)) if x < -PLAN_TOL_PCT]
            if miss:
                behind.append((ORG_NAME[r['co']], miss))
        if not behind:
            tail = 'None is more than %g%% behind plan on revenue or EBITDA.' % PLAN_TOL_PCT
        elif len(behind) == 1:
            nm, miss = behind[0]
            tail = ('%s %s is %.1f%% below plan.' % (nm, miss[0][0], miss[0][1]) if len(miss) == 1 else
                    '%s is below plan: revenue %.1f%%, EBITDA %.1f%%.' % (nm, miss[0][1], miss[1][1]))
        else:
            tail = '%s are more than %g%% behind plan: %s.' % (num_word(len(behind)), PLAN_TOL_PCT, and_list([b[0] for b in behind]))
        h['lead'] = '%d of 6 companies reported for {month:-1}. %s' % (len(pnl), tail)
        h['needs_text'] = 'portfolio results'
        third = tile('Deals in diligence', sum(1 for d in pool.all('dealcloud', 'deals') if d['stage'] == 'Diligence'), 'From DealCloud', 'dealcloud') \
            if rid != 'bsp-operating-partner' else tile('Open roles', sum(r['open_roles'] for r in pool.all('adp', 'headcount') if r['co'] in COS), 'Across six companies', 'adp')
        ebitda = sum(l12(pool, c) - l12(pool, c, 'cogs_k') - l12(pool, c, 'opex_k') for c in COS)
        h['kpis'] = [tile('Portfolio revenue', money_k(sum(l12(pool, c) for c in COS)), 'Last 12 months, six companies', 'financials', True),
                     tile('Portfolio EBITDA', money_k(ebitda), 'Last 12 months, six companies', 'financials', True), third]
        h['list'] = cal_list(pool, role)
    elif rid == 'bsp-fund-cfo':
        p = sum(1 for r in pool.all('financials', 'packs') if r['m'] == -1 and r['status'] == 'In')
        f = pool.all('financials', 'fund')[0]
        h['lead'] = '%d of 6 reporting packs are in for {month:-1}.' % p
        h['needs_text'] = 'reporting packs'
        h['kpis'] = [tile('Capital called', '%d%%' % f['called_pct'], 'Share of Fund I', 'financials', True), tile('Packs in', '%d of 6' % p, 'For {month:-1}', 'financials'),
                     tile('Covenant tests due', sum(1 for r in pool.all('financials', 'debt') if 0 <= r['next_test_d'] <= 30), 'Next 30 days', 'financials')]
        h['list'] = cal_list(pool, role)
    elif rid == 'bsp-investor-relations':
        q = len(vis(pool, role, 'email', 'threads', lambda r: r['kind'] == 'investor question'))
        f = pool.all('financials', 'fund')[0]
        h.update({'lead': '%d investor questions are open. The next letter is due in %d days.' % (q, f['next_report_d']), 'needs': 'email', 'needs_text': 'investor questions'})
        h['kpis'] = [tile('Fund I commitments', '$%.1fM' % f['commitments_m'], 'Form D, public', 'financials'), tile('Open questions', q, 'From your inbox', 'email'),
                     tile('Next letter due', '%d days' % f['next_report_d'], 'Quarterly investor letter', 'financials')]
        h['list'] = cal_list(pool, role)
    elif kind == 'ceo':
        p = [r for r in pool.all('financials', 'pnl') if r['co'] == co and r['m'] == -1][0]
        x = (p['revenue_k'] / p['plan_revenue_k'] - 1) * 100
        ev, ew = ebitda_vs_plan(p)
        h['lead'] = 'Revenue was %s in {month:-1}.' % vs_plan(p['revenue_k'], p['plan_revenue_k'])[1] + (
            '' if ew == 'on plan' else ' EBITDA was %s.' % ew)
        h['needs_text'] = 'results against plan'
        rev = l12(pool, co)
        eb = rev - l12(pool, co, 'cogs_k') - l12(pool, co, 'opex_k')
        h['kpis'] = [tile('Revenue', money_k(rev), 'Last 12 months', 'financials', True), tile('EBITDA margin', '%.1f%%' % (eb / rev * 100), 'Last 12 months', 'financials', True),
                     tile('Vs plan', '%+.1f%%' % x, 'Revenue, {month:-1}', 'financials')]
        h['list'] = cal_list(pool, role)
    elif kind == 'cfo':
        k = sum(1 for r in pool.all('financials', 'close') if r['co'] == co and r['status'] == 'Open')
        h['lead'] = 'One close item is open for {month:-1}.' if k == 1 else '%d close items are open for {month:-1}.' % k
        h['needs_text'] = 'the close'
        rev = l12(pool, co)
        eb = rev - l12(pool, co, 'cogs_k') - l12(pool, co, 'opex_k')
        d = [r for r in pool.all('financials', 'debt') if r['co'] == co][0]
        h['kpis'] = [tile('EBITDA margin', '%.1f%%' % (eb / rev * 100), 'Last 12 months', 'financials', True),
                     tile('Debt', money_k(d['balance_k']), d['facility'], 'financials', True), tile('Open close items', k, 'For {month:-1}', 'financials')]
        h['list'] = cal_list(pool, role)
    elif kind == 'vp-operations':
        first = {'pp': 'booking_rate', 'cet': 'npt', 'fl': 'flr', 'ts': 'fill_rate', 'bpi': 'utilization', 'fh': 'return_rate'}[co]
        r1 = kpi_of(pool, co, first)
        tgt = dict(r1, value=r1['target'])
        h['lead'] = '%s was %s last month against %s.' % (r1['label'], kfmt(r1), kfmt(tgt))
        h['needs_text'] = 'KPIs'
        K = lambda kid, label, sub: tile(label, kfmt(kpi_of(pool, co, kid)), sub, 'financials')  # noqa: E731
        if co == 'pp':
            h['kpis'] = [tile('Jobs today', sum(1 for j in st['jobs'] if j['day'] == 0), 'All four hubs', 'servicetitan'),
                         K('booking_rate', 'Booking rate', 'Last month'), K('callbacks', 'Callbacks', 'Last month')]
        elif co == 'cet':
            projs = pool.all('procore', 'projects')
            h['kpis'] = [tile('Projects active', len(projs), 'In Procore', 'procore'),
                         tile('Open RFIs', sum(1 for p in projs for x in p['rfis'] if x['status'] == 'Open'), 'Across all projects', 'procore'),
                         K('npt', 'Non-productive time', 'Last month')]
        elif co == 'fl':
            h['kpis'] = [K('open_tickets', 'Open tickets', 'Last month'), K('flr', 'First-level resolution', 'Last month'), K('response_time', 'Response time', 'Last month')]
        elif co == 'ts':
            h['kpis'] = [K('orders_day', 'Orders per day', 'Last month'), K('fill_rate', 'Fill rate', 'Last month'), K('late_orders', 'Late orders', 'Last month')]
        elif co == 'bpi':
            h['kpis'] = [K('utilization', 'Utilization', 'Last month'), K('hours_over_scope', 'Hours over scope', 'Retainers over plan, last month'),
                         K('retainers', 'Retainers', 'Active, last month')]
        else:
            y = [d for d in pool.all('shopify', 'daily') if d['day'] == -1][0]
            h['kpis'] = [K('ship_days', 'Days to ship', 'Last month'), K('return_rate', 'Return rate', 'Last month'),
                         tile('Low-stock products', sum(1 for p in pool.all('shopify', 'products') if p['weeks_cover'] < 2), 'Under 2 weeks of cover', 'shopify')]
        h['list'] = cal_list(pool, role)
    elif kind == 'sales':
        if co == 'pp':
            c = [r for r in pool.all('marketing', 'campaigns') if r['co'] == 'pp' and r['m'] == -1]
            l, b, s = sum(r['leads'] for r in c), sum(r['booked'] for r in c), sum(r['spend'] for r in c)
            h.update({'lead': '{month:-1} campaigns booked %s jobs from %s leads.' % ('{:,}'.format(b), '{:,}'.format(l)), 'needs': 'marketing', 'needs_text': 'campaign results'})
            h['kpis'] = [tile('Leads', '{:,}'.format(l), '{month:-1}', 'marketing'), tile('Booked jobs', '{:,}'.format(b), '{month:-1}', 'marketing'),
                         tile('Cost per booked job', money(s / max(1, b)), '{month:-1}', 'marketing', True)]
        elif co == 'fh':
            c = [r for r in pool.all('marketing', 'campaigns') if r['co'] == 'fh' and r['m'] == -1]
            rev, orders = sum(r['revenue'] for r in c), sum(r['orders'] for r in c)
            h.update({'lead': 'Email revenue was %s in {month:-1}.' % money(rev), 'needs': 'marketing', 'needs_text': 'campaign results'})
            h['kpis'] = [tile('Email revenue', money(rev), '{month:-1}', 'marketing', True), tile('Orders from email', '{:,}'.format(orders), '{month:-1}', 'marketing'),
                         tile('Repeat purchase rate', kfmt(kpi_of(pool, 'fh', 'repeat_rate')), 'Last month', 'financials')]
        else:
            o = [r for r in pool.all('salesforce', 'opps') if r['co'] == co]
            op = [r for r in o if OPEN(r)]
            v = sum(r['amount'] for r in op)
            won = [r for r in o if r['stage'] == 'Won']
            lost = [r for r in o if r['stage'] == 'Lost']
            h.update({'lead': '%d open in the pipeline worth %s.' % (len(op), money(v)), 'needs': 'salesforce', 'needs_text': 'the pipeline'})
            h['kpis'] = [tile('Pipeline', money(v), 'Open', 'salesforce', True),
                         tile('Won', money(sum(r['amount'] for r in won if r['close_d'] >= -90)), 'Last 90 days', 'salesforce', True),
                         tile('Win rate', '%d%%' % round(100 * len(won) / max(1, len(won) + len(lost))), 'Closed deals', 'salesforce')]
        h['list'] = cal_list(pool, role)
    elif rid in ('pp-hvac-technician', 'pp-plumber'):
        today = sorted([j for j in st['jobs'] if j['day'] == 0 and rid in j.get('for', ())], key=lambda j: j['start'])
        c0 = cust[today[0]['customer']]
        h.update({'title': 'Today', 'list_first': True, 'list_title': "Today's jobs", 'needs': 'servicetitan', 'needs_text': "today's jobs", 'list_needs': 'servicetitan',
                  'lead': '%d jobs today. First at %s in %s.' % (len(today), t12(today[0]['start']), c0['address']['town'])})
        recs = sum(1 for j in today for x in cust[j['customer']]['recs'] if x['status'] == 'open')
        h['kpis'] = [tile('Jobs today', len(today), 'First at %s' % t12(today[0]['start']), 'servicetitan'),
                     tile("Members on today's route", sum(1 for j in today if j['member']), 'Comfort Club', 'servicetitan'),
                     tile('Open recommendations', recs, "On today's customers", 'servicetitan')]
        rows = []
        for j in today:
            a = cust[j['customer']]['address']
            full = '%s, %s, %s %s' % (a['line'], a['town'], a['state'], a['zip'])
            said = j['said'].split('. ')[0].rstrip('.')
            said = ('the ' + said[0].lower() + said[1:]) if said.split(' ')[0] in ('Furnace', 'Heat') else lower_first(said)
            row = {'time': trange(j['start'], j['end']), 'title': j['type'], 'where': '%s, %s' % (a['line'], a['town']),
                   'prompt': "I'm going to %s. Customer says %s." % (full, said), 'job': {'address': full, 'issue': j['type']}}
            if j['member']:
                row['chip'] = 'Member'
            rows.append(row)
        h['list'] = rows
        need(len(today) == 4 and h['kpis'][1]['value'] == '2' and h['kpis'][2]['value'] == '3', '%s: today plan is not 4 jobs, 2 members, 3 open recommendations' % rid)
    elif rid == 'pp-dispatcher':
        today = [j for j in st['jobs'] if j['day'] == 0]
        un = sorted([j for j in today if not j['assigned']], key=lambda j: (j['start'], j['number']))
        h.update({'title': 'Today', 'needs': 'servicetitan', 'needs_text': "today's board", 'list_title': 'Not assigned', 'list_needs': 'servicetitan',
                  'lead': '%d jobs on the board. %d not assigned yet.' % (len(today), len(un))})
        h['kpis'] = [tile('Jobs today', len(today), 'All four hubs', 'servicetitan'), tile('Not assigned', len(un), 'Needs a technician', 'servicetitan'),
                     tile('Running late', sum(1 for j in today if j['status'] == 'Running late'), 'Marked by dispatch', 'servicetitan')]
        rows = []
        for j in un:
            town = cust[j['customer']]['address']['town']
            row = {'time': t12(j['start']), 'title': j['type'], 'where': town,
                   'prompt': 'Who can take the %s %s job in %s?' % (t12(j['start']), lower_first(j['type']) if not j['type'].startswith('No') else j['type'].lower(), town)}
            if j['urgent']:
                row['chip'] = 'Urgent'
            rows.append(row)
        h['list'] = rows
    elif rid == 'pp-location-gm':
        today = sorted([j for j in st['jobs'] if j['day'] == 0 and j['team'] == 'lancaster'], key=lambda j: (j['start'], j['number']))
        out = sum(1 for t in st['technicians'] if t['team'] == 'lancaster' and t['status'] in ('On a job', 'Driving'))
        tmap = {t['id']: t for t in st['technicians']}
        h.update({'title': 'Today', 'needs': 'servicetitan', 'needs_text': "the hub's board", 'list_title': "Today's hub board", 'list_needs': 'servicetitan',
                  'lead': '%d jobs at Lancaster today. %d technicians out.' % (len(today), out)})
        h['kpis'] = [tile('Jobs today', len(today), 'Lancaster hub', 'servicetitan'),
                     tile('Booking rate', kfmt(kpi_of(pool, 'pp', 'booking_rate', 'lancaster')), 'Lancaster hub, last month', 'financials'),
                     tile('Callbacks', kfmt(kpi_of(pool, 'pp', 'callbacks', 'lancaster')), 'Last 30 days', 'financials')]
        def tech_word(j):
            # A technician named "You" is that technician's own persona; the general manager sees the trade, never "You".
            if not j['tech']:
                return 'Not assigned'
            t_ = tmap[j['tech']]
            return TRADE_ROLE[t_['trade']] if t_['name'] == 'You' and rid not in (t_.get('for') or ()) else t_['name']
        h['list'] = [{'time': t12(j['start']), 'title': j['type'], 'where': '%s · %s' % (cust[j['customer']]['address']['town'], tech_word(j)),
                      'prompt': "What's the status of job %s?" % j['number']} for j in today[:12]]
    elif rid == 'cet-field-electrician':
        mine = vis(pool, role, 'procore', 'projects')
        t = [p for p in mine if any(d['day'] == 0 for d in p['daily']) and any(c['name'] == 'You' for c in p['crew_today'])][0]
        insp = sorted([(i['day'], i['what']) for p in mine for i in p['inspections'] if i['day'] > 0])[0]
        h.update({'title': 'Today', 'list_first': True, 'list_title': "Today's site", 'needs': 'procore', 'needs_text': "today's site", 'list_needs': 'procore',
                  'lead': 'Today: %s, %s. Crew starts at 7:00 am.' % (t['name'], t['town'])})
        # The daily logs record crew-hours (crew of 3 to 8), so the tile says crew hours on the electrician's sites, not personal hours.
        h['kpis'] = [tile('Crew hours', '{:,}'.format(sum(d['hours'] for p in mine for d in p['daily'] if -7 <= d['day'] <= -1)), 'My sites, last 7 days', 'procore'),
                     tile('Open RFIs', sum(1 for p in mine for x in p['rfis'] if x['status'] == 'Open'), 'On my sites', 'procore'),
                     tile('Next inspection', 'In %d days' % insp[0], insp[1], 'procore')]
        need(sum(1 for p in mine if any(c['name'] == 'You' for c in p['crew_today'])) == 1, 'field electrician: on more than one site today')
        h['list'] = [{'time': '7:00 am', 'title': t['name'], 'where': '%s, %s' % (t['town'], t['state']), 'prompt': "What's on today at %s?" % t['name']}]
    elif rid == 'cet-project-manager':
        mine = vis(pool, role, 'procore', 'projects')
        r = sum(1 for p in mine for x in p['rfis'] if x['status'] == 'Open' and 0 <= x['due_d'] <= 7)
        h.update({'title': 'Today', 'needs': 'procore', 'needs_text': 'your projects', 'list_title': 'Projects at risk', 'list_needs': 'procore',
                  'lead': '%d projects. %s due this week.' % (len(mine), 'One RFI is' if r == 1 else '%d RFIs are' % r)})
        h['kpis'] = [tile('Projects', len(mine), 'Active', 'procore'), tile('RFIs due', r, 'Next 7 days', 'procore'),
                     tile('Change orders', sum(1 for p in mine for x in p['change_orders'] if x['status'] == 'Pending owner'), 'Waiting on owner', 'procore')]
        h['list'] = [{'time': '%d%% done' % p['pct_complete'], 'title': p['name'], 'where': '%s, %s' % (p['town'], p['state']), 'chip': p['health'],
                      'prompt': 'What is putting %s at risk?' % p['name']} for p in mine if p['health'] in ('At risk', 'Watch')]
    elif rid == 'cet-estimator':
        o = vis(pool, role, 'salesforce', 'opps')
        due = sorted([x for x in o if x['stage'] == 'Bidding' and 0 <= x['close_d'] <= 7], key=lambda x: x['close_d'])
        won, lost = [x for x in o if x['stage'] == 'Won'], [x for x in o if x['stage'] == 'Lost']
        h.update({'title': 'Today', 'needs': 'salesforce', 'needs_text': 'bids due', 'list_title': 'Bids due', 'list_needs': 'salesforce',
                  'lead': '%d bids due this week.' % len(due)})
        h['kpis'] = [tile('Bids due', len(due), 'Next 7 days', 'salesforce'),
                     tile('Win rate', '%d%%' % round(100 * len(won) / max(1, len(won) + len(lost))), 'Last 12 months', 'salesforce', True),
                     tile('Pipeline', money(sum(x['amount'] for x in o if OPEN(x))), 'Open bids', 'salesforce', True)]
        h['list'] = [{'time': days_words(x['close_d']), 'title': x['name'], 'where': x['account'], 'prompt': 'Help me price the %s bid.' % x['name']} for x in due]
    elif rid == 'fl-help-desk-engineer':
        t = vis(pool, role, 'servicedesk', 'tickets')
        op = sorted([x for x in t if x['status'] != 'Resolved'], key=lambda x: (x['priority'], x['number']))
        u = sum(1 for x in op if x['urgent'])
        h.update({'title': 'Today', 'needs': 'servicedesk', 'needs_text': 'your tickets', 'list_title': 'My tickets', 'list_needs': 'servicedesk',
                  'lead': '%d open tickets. %d are marked urgent.' % (len(op), u)})
        h['kpis'] = [tile('My open tickets', len(op), 'Assigned to you', 'servicedesk'), tile('Urgent', u, 'P1 and P2', 'servicedesk'),
                     tile('Resolved today', sum(1 for x in t if x.get('resolved_d') == 0), 'By you', 'servicedesk')]
        h['list'] = [dict({'time': x['priority'], 'title': x['subject'], 'where': x['client'], 'prompt': 'Help me with ticket %s.' % x['number']},
                          **({'chip': 'Urgent'} if x['urgent'] else {})) for x in op]
    elif rid == 'fl-billing-specialist':
        inv = vis(pool, role, 'financials', 'invoices')
        rej = sorted([x for x in inv if x['status'] == 'Rejected' and x.get('rejected_d', -99) >= -7], key=lambda x: -x['rejected_d'])
        last30 = [x for x in inv if x['submitted_d'] >= -30]
        rate = 100 * sum(1 for x in last30 if x['status'] in ('Rejected', 'Appealed')) / max(1, len(last30))
        h.update({'title': 'Today', 'needs': 'financials', 'needs_text': 'invoices', 'list_title': 'Rejected invoices', 'list_needs': 'financials',
                  'lead': '%d invoices were rejected this week.' % len(rej)})
        h['kpis'] = [tile('Rejected invoices', len(rej), 'Last 7 days', 'financials'),
                     tile('Unpaid over 60 days', sum(1 for x in inv if x['status'] != 'Paid' and x['days_out'] > 60), 'Count', 'financials'),
                     tile('Rejection rate', '%d%%' % round(rate), 'Last 30 days', 'financials')]
        h['list'] = [{'time': 'today' if x['rejected_d'] == 0 else ('yesterday' if x['rejected_d'] == -1 else '%d days ago' % -x['rejected_d']),
                      'title': '%s · %s' % (x['client'], money(x['amount'])), 'where': x['reason'],
                      'prompt': 'Why was %s rejected, and how do I fix it?' % x['number']} for x in rej]
    elif rid == 'ts-inside-sales':
        o = vis(pool, role, 'salesforce', 'opps')
        q = sorted([x for x in o if x['stage'] == 'Quote sent'], key=lambda x: x['close_d'])
        acc = vis(pool, role, 'salesforce', 'accounts')
        orders = vis(pool, role, 'financials', 'orders')
        h.update({'title': 'Today', 'needs': 'salesforce', 'needs_text': 'your quotes', 'list_title': 'Quotes to chase', 'list_needs': 'salesforce',
                  'lead': '%d quotes are waiting on a reply.' % len(q)})
        h['kpis'] = [tile('Open quotes', len(q), 'Waiting on reply', 'salesforce'),
                     tile('Accounts slipping', sum(1 for a in acc if a['health'] in ('Watch', 'At risk')), 'Orders down 30 days', 'salesforce'),
                     tile('Orders', money(sum(x['value'] for x in orders if x['ship_d'] >= -30)), 'Last 30 days', 'financials', True)]
        h['list'] = [{'time': 'due ' + days_words(x['close_d']), 'title': x['name'], 'where': x['account'],
                      'prompt': 'Draft a follow-up on the %s quote.' % x['account']} for x in q[:8]]
    elif rid == 'ts-warehouse-lead':
        orders = vis(pool, role, 'financials', 'orders')
        inv = vis(pool, role, 'financials', 'inventory')
        n = sum(1 for x in orders if x['ship_d'] == 0)
        k = sum(1 for x in inv if x['on_hand'] < x['reorder_point'])
        late = sorted([x for x in orders if x['status'] == 'Late'], key=lambda x: (x['ship_d'], x['number']))
        h.update({'title': 'Today', 'list_first': True, 'needs': 'financials', 'needs_text': 'stock and orders', 'list_title': 'Late orders', 'list_needs': 'financials',
                  'lead': '%d orders ship today. %d items are below reorder point.' % (n, k)})
        h['kpis'] = [tile('Orders shipping today', n, 'Swedesboro', 'financials'), tile('Below reorder point', k, 'Items', 'financials'),
                     tile('Late orders', len(late), 'Past ship date', 'financials')]
        h['list'] = [{'time': '%d days late' % -x['ship_d'] if x['ship_d'] < -1 else '1 day late', 'title': x['account'], 'where': x['dc'],
                      'prompt': "What's holding order %s?" % x['number']} for x in late]
    elif rid == 'bpi-account-director':
        acc = vis(pool, role, 'salesforce', 'accounts')
        over = sum(1 for a in acc if a['hours_used'] > a['hours_plan'])
        asks = vis(pool, role, 'email', 'threads', lambda r: r['kind'] == 'client ask')
        h.update({'title': 'Today', 'needs': 'salesforce', 'needs_text': 'your clients', 'list_title': 'Client asks', 'list_needs': 'email',
                  'lead': '%d clients. %d are over their hours plan.' % (len(acc), over)})
        h['kpis'] = [tile('Retainers', len(acc), 'Your clients', 'salesforce'), tile('Hours over scope', over, 'Last month', 'salesforce'),
                     tile('Renewals', sum(1 for a in acc if a['renewal_d'] <= 60), 'Next 60 days', 'salesforce')]
        h['list'] = [{'time': 'today' if t['day'] == 0 else ('yesterday' if t['day'] == -1 else '%d days ago' % -t['day']), 'title': t['subject'],
                      'where': t['from']['name'] or t['from']['role'], 'prompt': 'Draft a reply to "%s".' % t['subject']} for t in asks]
    elif rid == 'fh-ecommerce-manager':
        y = [d for d in pool.all('shopify', 'daily') if d['day'] == -1][0]
        d30 = [d for d in pool.all('shopify', 'daily') if d['day'] >= -30]
        rate = 100 * sum(d['returns'] for d in d30) / max(1, sum(d['orders'] for d in d30))
        # Stored sales are de-seasonalized and the server applies the real month's factor, so the home shows month-proof numbers only.
        aov = y['revenue'] / max(1, y['orders'])
        low = sum(1 for p in pool.all('shopify', 'products') if p['weeks_cover'] < 2)
        h.update({'title': 'Today', 'needs': 'shopify', 'needs_text': 'store sales', 'list_title': 'Top returns', 'list_needs': 'shopify',
                  'lead': 'Returns are %.1f%% of orders over 30 days. %d products are low on stock.' % (rate, low)})
        h['kpis'] = [tile('Average order', money(aov), 'Yesterday, online store', 'shopify', True), tile('Return rate', '%.1f%%' % rate, 'Last 30 days', 'shopify'),
                     tile('Low-stock products', low, 'Under 2 weeks of cover', 'shopify')]
        h['list'] = [{'time': '%d returns' % r['count_30d'], 'title': r['product'], 'where': r['reason'],
                      'prompt': 'Why are customers returning the %s?' % r['product']} for r in pool.all('shopify', 'returns')[:5]]
    else:
        raise SystemExit('no home for ' + rid)
    need(len(h['lead'].split()) <= 20, 'home lead over 20 words: %s' % rid)
    for k in h['kpis']:
        need(len(k['sub'].split()) <= 8, 'tile sub over 8 words: %s %s' % (rid, k['sub']))
    return h


def read_lines(role, app, sets, org_name):
    read, wont = [], []
    for s, sc in sets.items():
        ph = SET_PHRASE[(app, s)]
        if sc == 'own':
            line = {'jobs': 'Your jobs, the last 90 days and the next week', 'customers': 'Customers on your jobs',
                    'equipment': "Equipment at your customers' homes", 'events': 'Your calendar'}.get(s, 'Your %s' % ph)
            w = {'jobs': "Read other technicians' jobs", 'threads': "Read other people's inboxes", 'tickets': "Read other people's tickets",
                 'events': "Read other people's calendars", 'projects': "Read other teams' projects", 'accounts': "Read other reps' accounts",
                 'opps': "Read other reps' opportunities", 'orders': "Read other reps' orders"}.get(s)
            if w and w not in wont:
                wont.append(w)
        elif sc == 'team':
            tk = role['team']
            if app == 'drive' and role['id'] == 'bsp-investor-relations':
                tk = 'ir'
            tn = SALES_TEAM_NAME[role['company']] if tk == 'sales' else TEAM_NAME[tk]
            line = '%s %s' % (tn, ph)
        elif sc == 'company':
            line = 'The price book' if s == 'pricebook' else (('All %s at %s' % (ph, org_name)) if s in RECORD_SETS else '%s at %s' % (ph[0].upper() + ph[1:], org_name))
        else:
            line = '%s for all six companies' % (ph[0].upper() + ph[1:])
        read.append(line)
    return read, wont


def build_catalog(roles, pool, st, org_files):
    apps_used = {}
    for r in roles:
        apps_used.setdefault(r['company'], set()).update(r['apps'])
    cat_roles = []
    for r in roles:
        org = r['company']
        oname = ORG_NAME[org]
        apps = []
        for app in [a for a in APP_ORDER if a in r['apps']]:
            sets = r['apps'][app]
            ordered = {s: sets[s] for s, _, _ in APPS[app][2] if s in sets}
            read, wont = read_lines(r, app, ordered, oname)
            apps.append({'id': app, 'sets': [{'id': s, 'label': SET_LABEL[(app, s)], 'count': len(vis(pool, r, app, s))} for s in ordered],
                         'read': read, 'wont': wont})
        unavailable = [app_name(org, a)['name'] for a in APP_ORDER if a in apps_used[org] and a not in r['apps']]
        pub = []
        for p in r['public']:
            if PUBLIC[p] not in pub:
                pub.append(PUBLIC[p])
        cat_roles.append({'id': r['id'], 'org': org, 'dept': r['dept'], 'label': r['label'], 'label_a': r['label_a'], 'style': r['style'],
                          'level': r['level'],
                          'key_app': r['key_app'], 'desc': r['desc'], 'placeholder': r['placeholder'], 'chips': r['chips'],
                          'action_chips': r['action_chips'], 'apps': apps, 'unavailable': unavailable, 'numbers_text': r['numbers_text'],
                          'public': pub, 'actions': [ACTIONS[a][0] for a in r['actions']], 'home': home_for(r, pool, st, org_files)})
    tech = [c for c in cat_roles if c['id'] == 'pp-hvac-technician'][0]
    stc = {s['id']: s['count'] for a in tech['apps'] if a['id'] == 'servicetitan' for s in a['sets']}
    need(stc.get('jobs') == 25 and stc.get('customers') == 23, 'catalogue: HVAC technician should see Jobs 25, Customers 23 (got %s)' % stc)
    plum = [c for c in cat_roles if c['id'] == 'pp-plumber'][0]
    stp = {s['id']: s['count'] for a in plum['apps'] if a['id'] == 'servicetitan' for s in a['sets']}
    need(stp.get('jobs') == 23 and stp.get('customers') == 21, 'catalogue: plumber should see Jobs 23, Customers 21 (got %s)' % stp)
    app_names = {}
    for org in ORGS:
        app_names[org] = {a: app_name(org, a) for a in APP_ORDER if a in apps_used[org]}
        if org == 'fh' and 'marketing' in app_names[org]:
            app_names[org]['marketing']['term'] = TERMS['Klaviyo']
    apps = {}
    for a in APP_ORDER:
        apps[a] = {'category': APPS[a][0], 'what': APPS[a][1]}
        nm = app_name('pp', a)['name']
        if nm in TERMS and a != 'marketing':
            apps[a]['term'] = TERMS[nm]
    return {'version': 1, 'sandbox_line': 'Sandbox: fictional people and modeled numbers. No company systems are connected.',
            'start_roles': ['pp-hvac-technician', 'pp-ceo', 'bsp-managing-partner'],
            'start_labels': {'pp-hvac-technician': 'HVAC technician', 'pp-ceo': 'Punctual Pros CEO', 'bsp-managing-partner': 'Managing partner'},
            'orgs': [{'id': o, 'name': ORG_NAME[o], 'co': None if o == 'bsp' else o, 'sells': SELLS[o], 'lines': LINES[o], 'depts': DEPTS[o],
                      'portal': 'app.html' if o == 'bsp' else 'app.html#/%s/overview' % o} for o in ORGS],
            'apps': apps, 'app_names': app_names, 'styles': {k: v[0] for k, v in STYLES.items()},
            'actions': {k: v[0] for k, v in ACTIONS.items()},
            'public_tools': {k: v for k, v in PUBLIC.items() if k != 'read'}, 'roles': cat_roles}


def build_roles_json(roles):
    team_roles = {'pp-hvac-technician', 'pp-plumber', 'pp-dispatcher', 'pp-location-gm', 'cet-field-electrician', 'cet-project-manager', 'cet-estimator',
                  'fl-help-desk-engineer', 'fl-billing-specialist', 'ts-inside-sales', 'ts-warehouse-lead', 'bpi-account-director', 'fh-ecommerce-manager'}
    apps_used = {}
    for r in roles:
        apps_used.setdefault(r['company'], set()).update(r['apps'])
    out = {}
    for r in roles:
        x = {k: r[k] for k in ('label', 'label_a', 'company', 'dept', 'order', 'style', 'level', 'team', 'key_app', 'desc', 'apps', 'numbers', 'numbers_text',
                               'public', 'tools', 'actions', 'action_apps', 'denied_hint')}
        x['team_name'] = TEAM_NAME[r['team']] if r['id'] in team_roles else None
        out[r['id']] = x
    return {'version': 1,
            'companies': {o: {'name': ORG_NAME[o], 'co': None if o == 'bsp' else o, 'sells': SELLS[o], 'lines': LINES[o], 'depts': DEPTS[o]} for o in ORGS},
            'apps': {a: {'category': v[0], 'what': v[1], 'sets': {s: l for s, l, _ in v[2]}} for a, v in APPS.items()},
            'app_names': {o: {a: app_name(o, a) for a in APP_ORDER if a in apps_used[o]} for o in ORGS},
            'styles': {k: {'label': v[0], 'chat': v[1], 'voice': v[2]} for k, v in STYLES.items()},
            'actions': {k: dict({'label': v[0], 'app': v[1]}, **({'app_by_org': {'bsp': 'dealcloud'}} if k == 'crm_stage' else {})) for k, v in ACTIONS.items()},
            'public_tools': PUBLIC, 'teams': TEAM_NAME, 'roles': out, 'plan_tolerance_pct': PLAN_TOL_PCT}


# ------------------------------------------------------------------------------------------------ scans

EMAIL_RX = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
PHONE_RX = re.compile(r'\(?\b\d{3}\)?[-. ]\d{3}[-.]\d{4}\b')
PAIR_RX = re.compile(r'\b(Tyler|Matt|Matthew|John|Sam|Samuel|Georgette|Aditya) [A-Z]\.')
TECH_ROLES = {'HVAC technician', 'Plumber', 'Electrician', 'Technician'}
# Fields that hold identifiers, codes or times rather than prose (exempt from the calendar-word scan).
NON_TEXT = {'id', 'co', 'for', 'team', 'start', 'end', 'time', 'opened_time', 'sku', 'number', 'addr_key', 'house_no', 'street_base', 'customer',
            'tech', 'account_id', 'product_id', 'kpi', 'unit', 'code', 'issue', 'spot', 'floor', 'kind', 'trade', 'status', 'stage', 'priority',
            'zip', 'state', 'fit_for', 'company', 'channel', 'via', 'tier', 'plan', 'health', 'folder', 'phase', 'segment', 'category', 'dc'}


def walk_strings(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from walk_strings(v, path + '.' + str(k))
    elif isinstance(o, list):
        for v in o:
            yield from walk_strings(v, path + '[]')
    elif isinstance(o, str):
        yield path, o


def walk_people(o, path='', out=None):
    """Person objects: {name, role} pairs, plus customer and technician names."""
    out = [] if out is None else out
    if isinstance(o, dict):
        if set(o) == {'name', 'role'}:
            out.append((path, o['name'], o['role']))
        for k, v in o.items():
            walk_people(v, path + '.' + str(k), out)
    elif isinstance(o, list):
        for v in o:
            walk_people(v, path + '[]', out)
    return out


def privacy_scan(files, banned_full, techs_os):
    msgs = []
    tech_names = {n: (t, h) for n, t, h in techs_os}
    for name, obj in files.items():
        for p, s in walk_strings(obj):
            if '@' in s or EMAIL_RX.search(s):
                msgs.append('%s %s: has an "@" or an email address' % (name, p))
            if PHONE_RX.search(s):
                msgs.append('%s %s: phone number pattern: %s' % (name, p, s[:60]))
            if PAIR_RX.search(s):
                msgs.append('%s %s: banned name pair: %s' % (name, p, s[:60]))
            for full in banned_full:
                if full in s:
                    msgs.append('%s %s: real person name %s' % (name, p, full))
            if 'Broad Sky' in s or re.search(r'playbook|platform|\bso what\b|wiretap|tcpa|recording consent|consent law|\bfcc\b', s, re.I):
                msgs.append('%s %s: banned word: %s' % (name, p, s[:60]))
            if 'Smith + Howard' in s:
                msgs.append('%s %s: Smith + Howard' % (name, p))
            if name == 'cet.json' and re.search(r'New York|NYC|Manhattan|Brooklyn|Queens', s):
                msgs.append('%s %s: CET stays in New England: %s' % (name, p, s[:60]))
        for p, n, role in walk_people(obj):
            if n is None or n == 'You':
                pass
            elif not re.fullmatch(r'[A-Z][a-z]+ [A-Z]\.', n):
                msgs.append('%s %s: person name not "First I.": %s' % (name, p, n))
            if n not in (None, 'You') and (role in ONE_PERSON or (name == 'bsp.json' and role in ('Analyst', 'BSP analyst', 'Fund accountant'))):
                msgs.append('%s %s: one-person office %s has a name' % (name, p, role))
            if n in tech_names and role not in TECH_ROLES:
                msgs.append('%s %s: %s is a technician name used for %s' % (name, p, n, role))
    st = files.get('pp_servicetitan.json')
    if st:
        trade = {'hvac': 'HVAC', 'plumb': 'Plumbing', 'elec': 'Electrical'}
        hub = {'L': 'lancaster', 'Y': 'york', 'H': 'harrisburg', 'N': 'toms-river'}
        for t in st['technicians']:
            if t['name'] in tech_names:
                tt, hh = tech_names[t['name']]
                if t['trade'] != trade[tt] or t['team'] != hub[hh]:
                    msgs.append('technician %s has the wrong trade or hub' % t['name'])
        for c in st['customers']:
            if c['name'] in tech_names or not re.fullmatch(r'[A-Z][a-z]+ [A-Z]\.', c['name']):
                msgs.append('customer name %s is not allowed' % c['name'])
    return msgs


def calendar_scan(files):
    msgs = []
    for name, obj in files.items():
        if name in ('service_area.json', 'likely_rules.json', 'streets.json', 'manifest.json'):
            continue   # public town names and dated trade rules (spec 3.3); not record text
        for p, s in walk_strings(obj):
            last = p.rsplit('.', 1)[-1].replace('[]', '')
            if last in NON_TEXT:
                continue
            t = re.sub(r'\{month:-?\d+\}', '', s)
            if CAL_WORDS.search(t):
                msgs.append('%s %s: calendar word or year in text: %s' % (name, p, s[:80]))
    return msgs


def copy_scan(cat):
    msgs = []
    fields = ('label', 'label_a', 'desc', 'chips', 'placeholder', 'numbers_text', 'public', 'actions', 'unavailable')
    for r in cat['roles']:
        texts = [r[f] for f in fields]
        texts += [c['label'] for c in r['action_chips']]
        texts += [v for _, v in walk_strings(r['home']) if v not in APP_ORDER] + [x for a in r['apps'] for x in a['read'] + a['wont']]
        flat = []
        for t in texts:
            flat.extend(t if isinstance(t, list) else [t])
        for t in flat:
            if re.search(r'\b[a-z]+_[a-z0-9_]+\b', t):
                msgs.append('catalogue %s: snake_case in "%s"' % (r['id'], t[:60]))
            if re.search(r'\b(pnl|kpis)\b', t):
                msgs.append('catalogue %s: view id in "%s"' % (r['id'], t[:60]))
        for c in r['chips'] + [c['label'] for c in r['action_chips']]:
            if len(c.split()) > 4:
                msgs.append('catalogue %s: chip over four words: %s' % (r['id'], c))
        if len(re.findall(r'[.!?](\s|$)', r['desc'])) > 2:
            msgs.append('catalogue %s: desc over two sentences' % r['id'])
    for o in cat['orgs']:
        for l in o['lines']:
            if len(l.split()) > 4:
                msgs.append('catalogue: line over four words: %s' % l)
    n_prg = json.dumps(cat).count('Portfolio Resource Group')
    if n_prg != 1:
        msgs.append('catalogue: "Portfolio Resource Group" appears %d times' % n_prg)
    return msgs


# ------------------------------------------------------------------------------------------------ generate

def generate(streets):
    global TECH_FIRSTS
    techs_os, jobs0 = os_js()
    real, loose = real_names()
    excluded = set(BANNED_FIRST) | set(loose)
    banned_pairs = {'%s %s.' % (n.split()[0], n.split()[-1][0]) for n in real if len(n.split()) >= 2}
    # An os.js technician whose "First I." matches a real person keeps the first name with another initial.
    taken = {n for n, _, _ in techs_os}
    for k, (n, t, h) in enumerate(techs_os):
        if n in banned_pairs:
            first = n.split()[0]
            alt = next('%s %s.' % (first, c) for c in 'KMNPRSTW' if '%s %s.' % (first, c) not in banned_pairs | taken)
            taken.add(alt)
            techs_os[k] = (alt, t, h)
    TECH_FIRSTS = {n.split()[0] for n, _, _ in techs_os}
    pool = name_pool(excluded)
    anc = anchors()
    zips = decode_zips()
    sa = build_service_area(zips)
    rules = build_likely_rules()
    issues = {'issues': ISSUES, 'safety': SAFETY}
    roles = build_roles()

    rngs = {o: random.Random(SEED + i) for i, o in enumerate(ORGS)}
    st_rng = random.Random(SEED + 7)
    peoples = {o: People(rngs[o], pool, banned_pairs, reserved={n for n, _, _ in techs_os}) for o in ORGS}
    st_people = People(st_rng, pool, banned_pairs)
    st = build_servicetitan(st_rng, st_people, streets, techs_os, sa)
    peoples['pp'].used |= st_people.used   # one name, one person inside Punctual Pros (staff, contacts, technicians, customers)

    orgw = streets['org_bases']
    words = {o: Words(orgw, rngs[o]) for o in ORGS}
    deals = build_dealcloud(rngs['bsp'], words['bsp'], peoples['bsp'])
    firms = [words['fl'].name('{W} {W2} LLP') for _ in range(90)]
    fin = {}
    for co in COS:
        pnl, kpis, payroll = fin_company(co, rngs[co], anc)
        if co == 'pp':
            kpis += hub_kpis(pnl, rngs[co])
        if co == 'ts':
            kpis += dc_kpis(rngs[co])
        if co == 'bpi':
            kpis += office_kpis(rngs[co])
        fin[co] = {'pnl': pnl, 'kpis': kpis, 'payroll': payroll}
    org_apps = {o: {} for o in ORGS}
    # Operating apps first (their names feed the email and chat placeholders).
    cet_acc, cet_opp, cet_svc = build_cet_crm(rngs['cet'], words['cet'], peoples['cet'])
    fl_acc, fl_opp, fl_svc = build_fl_crm(rngs['fl'], words['fl'], peoples['fl'], firms)
    ts_acc, ts_opp = build_ts_crm(rngs['ts'], words['ts'], peoples['ts'])
    bpi_acc, bpi_opp, bpi_svc = build_bpi_crm(rngs['bpi'], words['bpi'], peoples['bpi'])
    projects = build_procore(rngs['cet'], words['cet'], peoples['cet'])
    tickets, runbooks = build_servicedesk(rngs['fl'], peoples['fl'], firms[:80])
    invoices = build_invoices(rngs['fl'], firms[:80])
    inventory, orders = build_ts_ops(rngs['ts'], ts_acc)
    products, daily, returns = build_shopify(rngs['fh'], SEASON['fh'])
    # deal1 and deal2 carry an IC memo, a request list and a data room, so they are LOI or Diligence deals; deal3 has a CIM (IOI);
    # deal4 is early (Screening): the seller call and the first financials.
    late = [d['name'] for d in deals if d['stage'] in ('Diligence', 'LOI')]
    ioi = [d['name'] for d in deals if d['stage'] == 'IOI']
    scr = [d['name'] for d in deals if d['stage'] == 'Screening']
    ctx = {'bsp': {'deal1': late[0], 'deal2': late[1], 'deal3': ioi[0], 'deal4': scr[0], 'co': 'BSP'},
           'pp': {'co': 'Punctual Pros', 'town': 'Lititz'}, 'cet': {'co': 'CET', 'acct1': cet_acc[0]['name'], 'acct2': cet_acc[1]['name'], 'proj1': projects[0]['name']},
           'fl': {'co': 'Frontline', 'acct1': fl_acc[0]['name'], 'acct2': fl_acc[1]['name'], 'firm1': firms[0]},
           'ts': {'co': 'Thomas Scientific', 'acct1': ts_acc[0]['name'], 'acct2': ts_acc[1]['name']},
           'bpi': {'co': 'BPI', 'acct1': bpi_acc[8]['name'], 'acct2': bpi_acc[9]['name'], 'client1': bpi_acc[0]['name'], 'client2': bpi_acc[1]['name']},
           'fh': {'co': 'Fair Harbor', 'acct1': 'a wholesale account', 'acct2': 'a wholesale account'}}
    for o in ORGS:
        ctx[o].setdefault('acct1', 'a key account')
        ctx[o].setdefault('acct2', 'a key account')
        ctx[o].setdefault('town', 'Lititz')
        ctx[o]['_org'] = o
    # Email, chat and document text that states a fact is built from the records it states (close, payroll, hiring, packs).
    close = {co: close_items(co, rngs[co]) for co in COS}
    hcs = {o: headcount(o, rngs[o]) for o in ORGS}
    packs = build_packs(rngs['bsp'])
    for co in COS:
        c = ctx[co]
        op = [lower_first(x['item']) for x in close[co] if x['status'] == 'Open']
        recon = next(x['status'] for x in close[co] if x['item'] == 'Bank reconciliation')
        n = len(op)
        if n == 0:
            c['close_hold'] = 'The {month:-1} close is done.'
            c['close_list'] = 'The {month:-1} close is done. Bank reconciliation is done.'
            c['close_short'] = 'The close is done.'
        else:
            c['close_hold'] = ('One item holds the {month:-1} close: %s. It should clear this week.' % op[0]) if n == 1 else \
                ('%s items hold the {month:-1} close: %s. All should clear this week.' % (num_word(n), and_list(op)))
            c['close_list'] = 'Open items for the {month:-1} close: %s.%s' % (and_list(op), ' Bank reconciliation is done.' if recon == 'Done' else '')
            c['close_short'] = '%s close %s still open.' % (num_word(n), 'item is' if n == 1 else 'items are')
        pay = [r for r in fin[co]['payroll'] if r['m'] == -1][0]
        d, dw = vs_plan(pay['payroll_k'], pay['plan_k'])
        c['payroll_line'] = 'Payroll ran %s last month%s. Detail by team is attached.' % (dw, ', mostly overtime' if d > PLAN_TOL_PCT else '')
        orl = sum(r['open_roles'] for r in hcs[co])
        c['open_roles_n'] = str(orl)
        c['open_roles_line'] = '%d roles are still open across the company. Overtime covers the gap for now.' % orl
        c['open_roles_chat'] = '%d open roles across the company; hiring plan is in the folder.' % orl
        pnl1 = [r for r in fin[co]['pnl'] if r['m'] == -1][0]
        c['rev_line'] ='Revenue was %s' % vs_plan(pnl1['revenue_k'], pnl1['plan_revenue_k'])[1]
    pin = [p_ for p_ in packs if p_['m'] == -1]
    n_in = sum(1 for p_ in pin if p_['status'] == 'In')
    late = ['%s is %s' % (ORG_NAME[p_['company']], 'late' if p_['status'] == 'Late' else 'due this week') for p_ in pin if p_['status'] != 'In']
    ctx['bsp']['packs_line'] = '%s of six companies have reported for {month:-1}%s.' % (num_word(n_in), ('; ' + and_list(late)) if late else '')
    ctx['bsp']['packs_in'] = str(n_in)
    for o in ORGS:
        threads, events = build_comms(o, roles, rngs[o], peoples[o], ctx[o])
        org_apps[o]['email'] = {'threads': threads}
        org_apps[o]['calendar'] = {'events': events}
        org_apps[o]['chat'] = {'channels': build_chat(o, rngs[o], peoples[o], ctx[o], st if o == 'pp' else None)}
        org_apps[o]['drive'] = {'docs': build_docs(o, rngs[o], peoples[o], ctx[o])}
    org_apps['bsp']['dealcloud'] = {'deals': deals}
    org_apps['bsp']['financials'] = {'pnl': [], 'kpis': [], 'debt': [], 'close': [], 'fund': fund_record(anc, rngs['bsp']), 'packs': packs,
                                     'inventory': [], 'orders': [], 'invoices': []}
    org_apps['bsp']['adp'] = {'headcount': hcs['bsp'], 'payroll': []}
    for co in COS:
        org_apps[co]['financials'] = {'pnl': fin[co]['pnl'], 'kpis': fin[co]['kpis'], 'debt': debt(co, anc), 'close': close[co],
                                      'inventory': inventory if co == 'ts' else [], 'orders': orders if co == 'ts' else [],
                                      'invoices': invoices if co == 'fl' else []}
        org_apps[co]['adp'] = {'headcount': hcs[co], 'payroll': fin[co]['payroll']}
    org_apps['pp']['marketing'] = {'campaigns': build_campaigns_pp(rngs['pp'])}
    org_apps['fh']['marketing'] = {'campaigns': build_campaigns_fh(rngs['fh'])}
    org_apps['cet']['salesforce'] = {'accounts': cet_acc, 'opps': cet_opp, 'services': cet_svc}
    org_apps['fl']['salesforce'] = {'accounts': fl_acc, 'opps': fl_opp, 'services': fl_svc}
    org_apps['ts']['salesforce'] = {'accounts': ts_acc, 'opps': ts_opp, 'services': []}
    org_apps['bpi']['salesforce'] = {'accounts': bpi_acc, 'opps': bpi_opp, 'services': bpi_svc}
    org_apps['cet']['procore'] = {'projects': projects}
    org_apps['fl']['servicedesk'] = {'tickets': tickets, 'runbooks': runbooks}
    org_apps['fh']['shopify'] = {'products': products, 'daily': daily, 'returns': returns}
    org_files = {}
    for o in ORGS:
        org_files[o] = {'co': o, 'season': {str(k): v for k, v in SEASON.get(o, {m: 1.0 for m in range(1, 13)}).items()},
                        'apps': {a: dict(sorted(s.items())) for a, s in sorted(org_apps[o].items())}}
    # Checks that need everything.
    for j in st['jobs']:
        need(j['number'] not in jobs0, 'job number %s equals an os.js demo id' % j['number'])
    codes = {p['code'] for p in st['pricebook']}
    parts = {p['code'] for p in st['parts']}
    for i in ISSUES:
        for b in i['bring']:
            need('part' not in b or b['part'] in parts, 'issue %s: part %s is not in the parts list' % (i['id'], b.get('part')))
        for c in i['offers']:
            need(c in codes, 'issue %s: offer %s is not in the price book' % (i['id'], c))
    need(len(ISSUES) == 18, 'issues: expected 18')
    for g, m in WHO.items():
        titles = {t[0] for t in CAL[g]} | {t[0] for sw in CAL_SWAP.values() for (gg, _), t in sw.items() if gg == g}
        for t, who_ in m.items():
            need(t in titles, 'calendar: WHO names %s, which is not in the %s pool' % (t, g))
            need(who_ <= {a for a, gg in CAL_GROUP.items() if gg == g}, 'calendar: WHO for %s names a role outside the %s pool' % (t, g))
    ids = {i['id'] for i in ISSUES}
    for i in ISSUES:
        for rx in i['match']:
            try:
                re.compile(rx)
            except re.error:
                need(False, 'issue %s: bad pattern %s' % (i['id'], rx))
        for t, iid in (i.get('by_heat') or {}).items():
            need(t in HEAT_TYPES and iid in ids, 'issue %s: by_heat %s -> %s is unknown' % (i['id'], t, iid))
        need(all(k in SAFETY for k in i['safety']), 'issue %s: unknown safety key' % i['id'])
    for t, v in HEAT_TYPES.items():
        need(v['issue'] in ids and all(k in KINDS for k in v['kinds']) and v['default_fuel'] in v['fuels'], 'heat type %s is inconsistent' % t)
    for text, want, heat in ISSUE_CASES:
        need(issue_for(text) == want, 'issues: "%s" picks %s, not %s' % (text, issue_for(text), want))
        need(heat_for(text) == heat, 'heat words: "%s" names %s, not %s' % (text, heat_for(text), heat))
    for trade, types in JOB_TYPES.items():
        for _, iid, _, saids in types:
            for said in saids:
                got = issue_for(said)
                need(got in (None, iid) or (iid, got) == ('no_heat', 'boiler'), 'job type %s: "%s" picks %s' % (iid, said, got))
    need(len(st['parts']) == 14, 'parts: expected 14')
    for o in ORGS:
        for a, sets in org_files[o]['apps'].items():
            for s, recs in sets.items():
                need(isinstance(recs, list), '%s %s.%s is not a list' % (o, a, s))
                for r in recs:
                    need(isinstance(r, dict) and 'id' in r and 'co' in r, '%s %s.%s: record without id or co' % (o, a, s))
    pool_ = Pool(org_files, st)
    check_chips(roles, pool_, st)
    catalog = build_catalog(roles, pool_, st, org_files)
    roles_json = build_roles_json(roles)
    out = {'roles.json': roles_json, 'service_area.json': sa, 'likely_rules.json': rules, 'issues.json': issues, 'pp_servicetitan.json': st}
    for o in ORGS:
        out['%s.json' % o] = org_files[o]
    out['streets.json'] = streets
    derivation = [
        {'what': 'Punctual Pros revenue and EBITDA run rate', 'source_file': anc['pp']['cite'], 'value': '$%.1fM / $%.1fM' % (anc['pp']['rev'] / 1e6, anc['pp']['ebitda'] / 1e6)},
        {'what': 'Punctual Pros technicians and members', 'source_file': anc['pp']['cite'], 'value': '%s technicians, %s members' % (anc['pp']['technicians'], anc['pp']['members'])},
    ] + [{'what': '%s revenue and EBITDA run rate' % ORG_NAME[c], 'source_file': anc[c]['cite'], 'value': '$%.0fM / $%.2fM' % (anc[c]['rev'] / 1e6, anc[c]['ebitda'] / 1e6)}
         for c in ('cet', 'fl', 'ts', 'bpi', 'fh')] + \
        [{'what': '%s growth per year' % ORG_NAME[c], 'source_file': 'data/research/deal_model.json', 'value': '%d%%' % round(anc[c]['gr'] * 100)} for c in COS] + [
        {'what': 'Fund I commitments and investors', 'source_file': 'data/research/bsp_firm.json', 'value': '$%.1fM, %d investors (Form D)' % (anc['fund']['commitments_m'], anc['fund']['investors'])},
        {'what': 'Service area zips', 'source_file': 'data/pp_zips.json', 'value': '248 PA territory, 78 NJ Ocean and Monmouth, 364 adjacent'},
        {'what': 'Hubs and counties; technician names', 'source_file': 'redesigns/punctual-pros/os.js', 'value': 'PCI_HUBS; TECHS (11)'},
        {'what': 'Concept-site prices', 'source_file': 'redesigns/punctual-pros/site.js', 'value': 'tune-up 129, diagnostic 89, after-hours 99, plans 14.95 and 24.95'},
        {'what': 'County housing profiles', 'source_file': 'data/research/pp_market.json', 'value': '%d county profiles' % len(rules['counties'])},
        {'what': 'Rebates', 'source_file': 'data/research/pp_market.json', 'value': '%d public programs' % len(st['rebates'])},
        {'what': 'KPI baselines', 'source_file': 'data/research/serviceos_evidence.json', 'value': 'PP booking 41%, CET bid win 15%, Frontline first-level 74%, FH return 19.3%'},
        {'what': 'Headcount', 'source_file': 'growth-plan files, meta.kpi_roadmap month 0', 'value': ', '.join('%s %d' % (ORG_NAME[o], HC_TOTAL[o]) for o in ORGS)},
        {'what': 'Debt rates', 'source_file': 'data/research/deal_model.json', 'value': 'PP 8.73% (public filings), others modeled'},
        {'what': 'Thomas Scientific debt', 'source_file': 'data/research/thomas_filings.json', 'value': '$250M at about 10% (inside the filings estimates)'}]
    return out, catalog, derivation, techs_os, real


def render(out, catalog, derivation):
    texts = {k: dump(v) for k, v in out.items()}
    cat_text = dump(catalog)
    files = {k: {'bytes': len(v.encode()), 'sha256': hashlib.sha256(v.encode()).hexdigest()} for k, v in sorted(texts.items())}
    files['data/agent/catalog.json'] = {'bytes': len(cat_text.encode()), 'sha256': hashlib.sha256(cat_text.encode()).hexdigest()}
    manifest = {'version': 1, 'seed': SEED, 'base_date': BASE_DATE, 'python': PYTHON, 'generator': 'scripts/build_agent_sandbox.py',
                'files': files, 'derivation': derivation}
    texts['manifest.json'] = dump(manifest)
    return texts, cat_text


def budget(texts, cat_text):
    msgs = []
    total = sum(len(v.encode()) for v in texts.values()) + len(cat_text.encode())
    if total >= SIZE_CAP:
        msgs.append('size: %d bytes in server/sandbox and data/agent (cap %d)' % (total, SIZE_CAP))
    for k, v in list(texts.items()) + [('catalog.json', cat_text)]:
        if len(v.encode()) >= FILE_CAP:
            msgs.append('size: %s is %d bytes (cap %d)' % (k, len(v.encode()), FILE_CAP))
    if len(cat_text.encode()) > 150_000:
        msgs.append('size: catalog.json is %d bytes (budget 150,000)' % len(cat_text.encode()))
    return msgs, total


def scans(texts, cat_text, techs_os, real):
    objs = {k: json.loads(v) for k, v in texts.items()}
    objs['catalog.json'] = json.loads(cat_text)
    return privacy_scan(objs, sorted(set(real)), techs_os) + calendar_scan(objs) + copy_scan(objs['catalog.json'])


def write(texts, cat_text, sandbox, catalog):
    sandbox.mkdir(parents=True, exist_ok=True)
    catalog.parent.mkdir(parents=True, exist_ok=True)
    for k, v in texts.items():
        if k == 'streets.json' and (sandbox / k).exists() and sandbox == SANDBOX:
            continue
        (sandbox / k).write_text(v)
    catalog.write_text(cat_text)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--check', action='store_true', help='regenerate into a temp dir, compare, re-verify pinned words, scan')
    ap.add_argument('--select-words', action='store_true', help='re-pick invented street and organisation words (rewrites streets.json)')
    a = ap.parse_args()
    ver = '%d.%d' % sys.version_info[:2]
    if ver != PYTHON:
        if a.check:
            print('Run with Python 3.12 (this is %s); random sequences differ between versions.' % ver)
            sys.exit(2)
        print('Run with Python 3.12 (this is %s); random sequences differ between versions.' % ver)
        sys.exit(2)
    sp = SANDBOX / 'streets.json'
    if a.select_words or not sp.exists():
        sa = build_service_area(decode_zips())
        streets = select_words(customer_towns(sa))
        if ERRORS or streets is None:
            print('\n'.join(ERRORS))
            sys.exit(1)
        SANDBOX.mkdir(parents=True, exist_ok=True)
        sp.write_text(dump(streets))
        print('streets.json: %d street bases, %d organisation words' % (len(streets['bases']), len(streets['org_bases'])))
    streets = json.loads(sp.read_text())
    out, catalog, derivation, techs_os, real = generate(streets)
    texts, cat_text = render(out, catalog, derivation)
    msgs = list(ERRORS)
    bmsgs, total = budget(texts, cat_text)
    msgs += bmsgs + scans(texts, cat_text, techs_os, real)
    if a.check:
        for k, v in texts.items():
            p = SANDBOX / k
            if not p.exists() or p.read_text() != v:
                msgs.append('server/sandbox/%s differs from a fresh run; run the generator and commit' % k)
        if not CATALOG.exists() or CATALOG.read_text() != cat_text:
            msgs.append('data/agent/catalog.json differs from a fresh run; run the generator and commit')
        extra = sorted(p.name for p in SANDBOX.glob('*.json') if p.name not in texts)
        if extra:
            msgs.append('server/sandbox has files the generator does not write: %s' % ', '.join(extra))
        msgs += verify_words(streets)
        if msgs:
            print('\n'.join(msgs))
            sys.exit(1)
        print('check ok: %d files, %s bytes, words verified, privacy, calendar, chip map and size passed' % (len(texts) + 1, '{:,}'.format(total)))
        return
    if msgs:
        print('\n'.join(msgs))
        sys.exit(1)
    write(texts, cat_text, SANDBOX, CATALOG)
    print('wrote %d files to server/sandbox and data/agent/catalog.json: %s bytes' % (len(texts), '{:,}'.format(total)))


if __name__ == '__main__':
    main()
