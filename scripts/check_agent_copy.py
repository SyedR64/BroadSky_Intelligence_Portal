#!/usr/bin/env python3
"""Copy check for the company agent page (SPEC 6.4; voice rules in UNIFIED.md §0).

Scans the visible strings of agent.html (text nodes, the meta description and the alt, aria-label, title and
placeholder attributes), every string literal in assets/agent.js and assets/agent-cards.js, every string value in
data/agent/catalog.json and every string value in server/sandbox/*.json. Prints each failing file and string and
exits 1 on any failure; exits 0 and prints a one-line summary otherwise.

Usage:  python3 scripts/check_agent_copy.py
"""
import glob, json, os, re, subprocess, sys
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from js_spans import prose_spans  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = 'agent.html'
JS = ('assets/agent.js', 'assets/agent-cards.js')
CATALOG = 'data/agent/catalog.json'
SANDBOX = 'server/sandbox'

EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
PHONE = re.compile(r'\(?\b\d{3}\)?[-. ]\d{3}[-.]\d{4}\b')
BANNED_ANY = re.compile(r'playbook|platform|so what|wiretap|tcpa|recording consent|consent law|\bfcc\b', re.I)
BANNED_PAGE = re.compile(r'\bscopes\b|permission matrix|the server\b', re.I)     # page, page JS and catalogue only
BANNED_NAMES = ('Tyler Zachem', 'Matt Buckwalter', 'John Duquette', 'Sam Pawliger', 'Georgette Kiser', 'Aditya Narain')
PAIR = re.compile(r'\b(Tyler|Matt|Matthew|John|Sam|Samuel|Georgette|Aditya) [A-Z]\.')
SNAKE = re.compile(r'\b[a-z]+_[a-z0-9_]+\b')
VIEW_IDS = re.compile(r'\b(pnl|kpis)\b')
ISO = re.compile(r'\b20\d\d-\d\d-\d\d\b')
YEAR = re.compile(r'\b(19|20)\d\d\b')
MONTH = re.compile(r'\b(January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|'
                   r'Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b', re.I)
TOKEN = re.compile(r'\{month:-?\d+\}')
NYC = re.compile(r'New York City|\bNYC\b|Manhattan|Brooklyn|Queens')
PRG_FULL = 'Portfolio Resource Group'
PRG_DESC = 'Portfolio Resource Group (PRG)'
# "sandbox" may appear in visible copy only here (SPEC 1.3), plus the page's meta description (SPEC 1.1)
SANDBOX_OK = ('<b>Sandbox:</b>', 'Sandbox:', 'BSP Desk sandbox', 'Example apps with sandbox records',
              'Source: sandbox ServiceTitan record', 'A sandbox AI agent for BSP')
# catalogue fields whose text is visible on the page (SPEC 6.4 rule 5)
VISIBLE_KEYS = {'label', 'label_a', 'desc', 'sells', 'lines', 'depts', 'chips', 'placeholder', 'read', 'wont', 'numbers_text',
                'public', 'actions', 'unavailable'}

fails = []


def fail(path, rule, s):
    fails.append((path, rule, ' '.join(str(s).split())[:160]))


def words(s):
    return len(re.findall(r"[A-Za-z0-9$%][\w$%.,'’+&/-]*", s))


def sentences(s):
    return len([x for x in re.split(r'(?<=[.!?])\s+', s.strip()) if x])


def real_people():
    names = list(BANNED_NAMES)
    p = os.path.join(ROOT, 'data', 'research', 'bsp_firm.json')
    if os.path.exists(p):
        def walk(v, k=''):
            if isinstance(v, dict):
                for kk, x in v.items():
                    yield from walk(x, kk)
            elif isinstance(v, list):
                for x in v:
                    yield from walk(x, k)
            elif isinstance(v, str) and k in ('name', 'person', 'full_name') and \
                    re.fullmatch(r"[A-Z][a-z]+ [A-Z][A-Za-z.'-]+( [A-Z][a-z]+)?", v):
                yield v
        names += list(walk(json.load(open(p, encoding='utf-8'))))
    return sorted(set(names))


PEOPLE = real_people()


def walk_json(v, path=()):
    """yield (path tuple, string) for every string value, in document order"""
    if isinstance(v, dict):
        for k, x in v.items():
            yield from walk_json(x, path + (k,))
    elif isinstance(v, list):
        for i, x in enumerate(v):
            yield from walk_json(x, path + (i,))
    elif isinstance(v, str):
        yield path, v


def common(path, s, page=False):
    """rules 1-4 (every scanned file)"""
    if EMAIL.search(s):
        fail(path, 'email address', s)
    if PHONE.search(s):
        fail(path, 'phone number', s)
    m = BANNED_ANY.search(s)
    if m:
        fail(path, f'banned word "{m.group(0)}"', s)
    if page:
        m = BANNED_PAGE.search(s)
        if m:
            fail(path, f'banned word "{m.group(0)}"', s)
    if 'Broad Sky' in s:
        fail(path, '"Broad Sky" (use BSP)', s)
    if 'Tyler' in s:
        fail(path, 'real name "Tyler"', s)
    for n in PEOPLE:
        if n in s:
            fail(path, f'real name "{n}"', s)
    if PAIR.search(s):
        fail(path, 'real first name with an initial', s)


def dated(path, s):
    t = TOKEN.sub('', s)
    if ISO.search(t):
        fail(path, 'ISO date', s)
    if YEAR.search(t):
        fail(path, 'four-digit year', s)
    m = MONTH.search(t)
    if m:
        fail(path, f'month name "{m.group(0)}"', s)


def snake(path, s):
    m = SNAKE.search(s) or VIEW_IDS.search(s)
    if m:
        fail(path, f'identifier "{m.group(0)}"', s)


def sandbox_word(path, s):
    t = s
    for ok in SANDBOX_OK:
        t = t.replace(ok, '')
    if re.search(r'sandbox', t, re.I):
        fail(path, '"sandbox" outside the allowed places', s)


# ── agent.html ──────────────────────────────────────────────────────────────────────────────────
class Page(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # (tag, classes)
        self.texts = []          # visible text nodes
        self.attrs = []          # visible attribute values
        self.leads = []          # [text] per lead paragraph
        self.chips = []          # [text] per chip
        self._cap = []           # open captures: (depth, list)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ('alt', 'aria-label', 'title', 'placeholder'):
            if a.get(k):
                self.attrs.append(a[k])
        if tag == 'meta' and a.get('name') == 'description' and a.get('content'):
            self.attrs.append(a['content'])
        if tag in self.VOID:
            return
        cls = set((a.get('class') or '').split())
        self.stack.append((tag, cls))
        if cls & {'sys-lead'} or (tag == 'p' and any('lead' in c for c in cls)):
            buf = []
            self.leads.append(buf)
            self._cap.append((len(self.stack), buf))
        if 'sys-chip' in cls:
            buf = []
            self.chips.append(buf)
            self._cap.append((len(self.stack), buf))

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        while self.stack:
            t, _ = self.stack.pop()
            self._cap = [c for c in self._cap if c[0] <= len(self.stack)]
            if t == tag:
                break

    def handle_data(self, data):
        if any(t in ('script', 'style', 'noscript', 'title') for t, _ in self.stack):
            if not any(t == 'title' for t, _ in self.stack):
                return
        if data.strip():
            self.texts.append(data)
            for _, buf in self._cap:
                buf.append(data)


def check_html():
    src = open(os.path.join(ROOT, HTML), encoding='utf-8').read()
    p = Page()
    p.feed(src)
    full = ' '.join(' '.join(t.split()) for t in p.texts)
    for s in p.texts + p.attrs:
        s1 = ' '.join(s.split())
        common(HTML, s1, page=True)
        dated(HTML, s1)
        snake(HTML, s1)
    # sandbox rule works on the joined text so "<b>Sandbox:</b> fictional ..." is seen whole
    for s in [full] + p.attrs:
        sandbox_word(HTML, s)
    for buf in p.leads:
        s = ' '.join(' '.join(buf).split())
        if words(s) > 30:
            fail(HTML, f'lead paragraph over 30 words ({words(s)})', s)
    for buf in p.chips:
        s = ' '.join(' '.join(buf).split())
        if words(s) > 4:
            fail(HTML, f'chip label over 4 words ({words(s)})', s)
    return src


# ── page JavaScript ─────────────────────────────────────────────────────────────────────────────
def js_strings(path):
    src = open(os.path.join(ROOT, path), encoding='utf-8').read()
    return [src[a:b] for a, b in prose_spans(src) if b > a]


def check_js():
    for path in JS:
        for s in js_strings(path):
            # template text is HTML markup: test the text between tags (class names and ids are code)
            vis = re.sub(r'<[^>]*>', ' ', s)
            vis = ' '.join(vis.split())
            if not vis:
                continue
            common(path, vis, page=True)
            sandbox_word(path, re.sub(r'\s+', ' ', s))
            m = MONTH.search(TOKEN.sub('', vis))
            if m and re.search(r'[a-z]', vis) and ' ' in vis:
                fail(path, f'month name "{m.group(0)}"', vis)


# ── catalogue ───────────────────────────────────────────────────────────────────────────────────
def check_catalog():
    cat = json.load(open(os.path.join(ROOT, CATALOG), encoding='utf-8'))
    prg_full = 0
    seen_prg_desc = False
    cet_paths = set()
    for i, o in enumerate(cat.get('orgs', [])):
        if o.get('id') == 'cet' or o.get('co') == 'cet':
            cet_paths.add(('orgs', i))
    for i, r in enumerate(cat.get('roles', [])):
        if r.get('org') == 'cet':
            cet_paths.add(('roles', i))
    for path, s in walk_json(cat):
        where = f"{CATALOG} {'.'.join(map(str, path))}"
        if '@' in s:
            fail(where, '"@" in catalogue', s)
        common(where, s, page=True)
        if 'Smith + Howard' in s:
            fail(where, '"Smith + Howard"', s)
        if path[:2] in cet_paths and NYC.search(s):
            fail(where, 'New York City place in a CET string', s)
        # Portfolio Resource Group: spelled out once, in the operating partner's desc, before any "PRG"
        is_op_desc = path[0] == 'roles' and path[-1] == 'desc' and cat['roles'][path[1]].get('id') == 'bsp-operating-partner'
        n = s.count(PRG_FULL)
        prg_full += n
        if n and not (is_op_desc and PRG_DESC in s and n == 1):
            fail(where, 'Portfolio Resource Group outside the operating partner description', s)
        if is_op_desc and PRG_DESC in s:
            seen_prg_desc = True
        elif re.search(r'\bPRG\b', s) and not seen_prg_desc:
            fail(where, '"PRG" before it is spelled out', s)
        keys = [k for k in path if isinstance(k, str)]
        visible = 'home' in keys or (keys and keys[-1] in VISIBLE_KEYS) or keys[-2:] == ['action_chips', 'label'] \
            or (path[0] == 'actions') or (path[0] == 'styles') or (path[0] == 'start_labels')
        if visible:
            snake(where, s)
        dated(where, s)
        last = keys[-1] if keys else ''
        if last in ('chips', 'lines') or keys[-2:] == ['action_chips', 'label']:
            if words(s) > 4:
                fail(where, f'chip over 4 words ({words(s)})', s)
        if keys[-3:] == ['home', 'kpis', 'sub'] or (len(keys) >= 3 and keys[-3] == 'home' and keys[-2] == 'kpis' and last == 'sub'):
            if words(s) > 8:
                fail(where, f'tile note over 8 words ({words(s)})', s)
        if last == 'desc' and sentences(s) > 2:
            fail(where, f'description over 2 sentences ({sentences(s)})', s)
        if keys[-2:] == ['home', 'lead'] and words(TOKEN.sub('Oct', s)) > 20:
            fail(where, f'home lead over 20 words ({words(s)})', s)
    if prg_full > 1:
        fail(CATALOG, f'Portfolio Resource Group spelled out {prg_full} times', '')
    return cat


# ── sandbox records ─────────────────────────────────────────────────────────────────────────────
def check_sandbox():
    n = 0
    for f in sorted(glob.glob(os.path.join(ROOT, SANDBOX, '*.json'))):
        rel = os.path.relpath(f, ROOT)
        data = json.load(open(f, encoding='utf-8'))
        is_cet = os.path.basename(f) == 'cet.json'
        for path, s in walk_json(data):
            n += 1
            where = f"{rel} {'.'.join(map(str, path))}"
            if '@' in s:
                fail(where, '"@" in sandbox', s)
            common(where, s)
            if 'Smith + Howard' in s:
                fail(where, '"Smith + Howard"', s)
            # roles.json carries the same role text as the catalogue (the operating partner's desc spells PRG out)
            op_desc = os.path.basename(f) == 'roles.json' and path[-1] == 'desc' and 'bsp-operating-partner' in path
            if PRG_FULL in s and not (op_desc and s.count(PRG_FULL) == 1 and PRG_DESC in s):
                fail(where, 'Portfolio Resource Group in sandbox records', s)
            if is_cet and NYC.search(s):
                fail(where, 'New York City place in a CET string', s)
    return n


# ── voice and terms passes (dry runs must report nothing to change) ─────────────────────────────
def check_passes():
    files = [HTML, *JS]
    review = os.path.join(ROOT, 'scripts', '_terms_review.txt')
    saved = open(review, 'rb').read() if os.path.exists(review) else None
    try:
        v = subprocess.run([sys.executable, 'scripts/apply_voice.py', *files], cwd=ROOT, capture_output=True, text=True)
        t = subprocess.run([sys.executable, 'scripts/apply_terms.py', *files], cwd=ROOT, capture_output=True, text=True)
    finally:
        if saved is None:
            if os.path.exists(review):
                os.remove(review)
        else:
            open(review, 'wb').write(saved)
    vo = v.stdout
    if v.returncode or 'DRY RUN: 0 files change' not in vo or re.search(r':\s*(\d+) -> (\d+)', vo) and \
            any(a != '0' or b != '0' for a, b in re.findall(r':\s*(\d+) -> (\d+)', vo)):
        fail('scripts/apply_voice.py', 'voice pass would change these files', vo.strip().splitlines()[-4:] if vo else v.stderr)
    to = t.stdout
    if t.returncode or 'DRY RUN: 0 replacements' not in to:
        fail('scripts/apply_terms.py', 'terms pass would change these files', to.strip().splitlines()[-3:] if to else t.stderr)


def main():
    check_html()
    check_js()
    check_catalog()
    n = check_sandbox()
    check_passes()
    if fails:
        for path, rule, s in fails:
            print(f'FAIL {path}: {rule}' + (f': {s}' if s else ''))
        print(f'\n{len(fails)} problem(s).')
        return 1
    print(f'check_agent_copy: ok (agent.html, {len(JS)} scripts, catalogue, {n:,} sandbox strings)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
