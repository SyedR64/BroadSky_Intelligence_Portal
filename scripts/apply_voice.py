#!/usr/bin/env python3
"""Voice pass for the site (rules in UNIFIED.md §0 Voice).

Usage:  python3 scripts/apply_voice.py            # dry run: counts per file + every skipped context
        python3 scripts/apply_voice.py --write    # apply
        python3 scripts/apply_voice.py --write path1 path2 ...
        python3 scripts/apply_voice.py --quiet     # totals only

Three rules, all idempotent:
  1. Product name. Every spelling of the old product name becomes "BSP Desk" ("bsp-desk" in slugs),
     in every text file (prose, comments, docs, scripts). The repo URL path and GitHub links stay.
  2. No "So what". "So what:" / "So what —" / "So what." labels (with their <b>/<strong> wrapper)
     are removed from HTML, JavaScript prose and JSON prose; the sentence that followed is kept and
     its first letter capitalised.
  3. The firm is BSP. "Broad Sky" becomes "BSP" in HTML, JavaScript UI strings and research JSON
     prose. Kept as written: strings containing a legal entity ("Broad Sky Partners, LP",
     "Broad Sky Partners LLC", "BSP-…" vehicles, the unrelated "Broad Sky Networks"), URLs and file
     paths, quoted press text (a string that opens with a quotation mark, a quoted phrase inside a
     string, a wire-service headline, a field named *quote*), and verbatim filing fields. On each
     HTML page without the concept banner, the first plain "Broad Sky Partners" in the body becomes
     "Broad Sky Partners (BSP)"; concept pages get that once from the frame's banner.

JavaScript code is never touched: only the contents of string and template literals (scripts/js_spans.py).
JSON object keys, ids, enum values and dataset keys are never touched; files keep their layout.
"""
import os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from js_spans import prose_spans

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITE = '--write' in sys.argv
QUIET = '--quiet' in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]

TEXT_EXTS = ('.html', '.js', '.json', '.md', '.py', '.sh', '.yml', '.yaml', '.css', '.toml', '.sql', '.txt')
SKIP_DIRS = ('.git', 'node_modules', 'legacy', 'ci-report')
SKIP_FILES = {'scripts/apply_voice.py', 'scripts/_terms_review.txt'}
CO_SLUGS = ('punctual-pros', 'cet', 'frontline', 'thomas-scientific', 'bpi', 'fair-harbor')

# ── rule 1: product name (applied to the whole text of every file) ──────────────────────────────
PRODUCT_RULES = [
    (r'Broad_Sky_Operating_Intelligence_Memo', 'BSP_Desk_Memo'),
    (r'Broad Sky <span>/</span> Operating Intelligence', 'BSP Desk'),
    (r"Broad Sky Partners' operating-intelligence portal \(a private-equity firm",
     'BSP Desk, the portal of BSP (a private-equity firm'),
    (r"Broad Sky Partners['’]? operating[- ]intelligence portal", 'BSP Desk'),
    (r"Commonwealth Electrical Technologies / Broad Sky Partners operating[- ]intelligence", 'CET in BSP Desk'),
    (r"Broad Sky Partners['’]? operating[- ]intelligence", 'BSP Desk'),
    (r"the firm's operating[- ]intelligence portal", "BSP Desk, the firm's portal"),
    (r'Broad Sky operating[- ]intelligence portal', 'BSP Desk'),
    (r'BSP operating[- ]intelligence', 'BSP Desk'),
    (r'Broad Sky Operating Intelligence', 'BSP Desk'),
    (r'BROAD SKY OPERATING INTELLIGENCE', 'BSP DESK'),
    (r'Broad Sky Intelligence', 'BSP Desk'),
    (r'\bthe Operating Intelligence portal\b', 'BSP Desk'),
    (r'\bthe Operating Intelligence data\b', 'the BSP Desk data'),
    (r'\bOperating-intelligence portal\b', 'BSP Desk portal'),
    (r'\boperating-intelligence portal\b', 'BSP Desk portal'),
    (r'(?<=[/_.])operating[-_]intelligence\b|\boperating[-_]intelligence(?=[/_.]\w)', 'bsp-desk'),
    (r'OPERATING INTELLIGENCE', 'BSP DESK'),
    (r'\b[Oo]perating[- ][Ii]ntelligence\b', 'BSP Desk'),
    (r'BSP Desk · Broad Sky(?=</title>)|BSP Desk · BSP Desk(?=</title>)', 'BSP Desk'),     # the landing page's own title
]
PRODUCT_RULES = [(re.compile(p), r) for p, r in PRODUCT_RULES]
OLD_NAME = re.compile(r'operating[- _]intelligence|Broad Sky Intelligence', re.I)

# ── rule 2: "So what" labels ────────────────────────────────────────────────────────────────────
SO_WHAT = re.compile(
    r'<(b|strong)>\s*So what\s*(?:[:.]|—|–|&mdash;)?\s*</\1>\s*(?:[:.]|—|–|&mdash;)?\s*'   # <b>So what:</b> / <b>So what</b>:
    r'|\bSo what\s*(?::|—|–|&mdash;|\.(?=\s))\s*')                                            # bare label
SO_WHAT_ANY = re.compile(r'so what', re.I)

# ── rule 3: Broad Sky → BSP ─────────────────────────────────────────────────────────────────────
ENTITY = re.compile(r'Broad Sky Partners,? (?:LP|LLC|L\.P\.)(?![\w.])|Broad Sky Networks(?:,? LLC)?')
QUOTE_OPEN = re.compile(r'^\s*(?:\\"|"|“|‘|\'|&quot;|&ldquo;|&lsquo;)')
HEADLINE = re.compile(r'^\s*(?:Business Wire|PR Newswire|GlobeNewswire|WWD|PitchBook[\w ]*|Company press release|Press release)\s*:', re.I)
URLISH = re.compile(r'^\s*(?:https?:|mailto:|/|\.\.?/)|^[\w./#-]+\.(?:html?|js|json|pdf|mp4|png|jpe?g|csv|css)(?:[?#]\S*)?\s*$')
QUESTION = re.compile(r'\?\s*(?:”|"|&rdquo;|&quot;)\s*$')   # a suggested question in quotes is not press text
LABEL_OK = re.compile(r'what Broad Sky can copy')               # a field label quoted in notes, renamed with the label
INNER_QUOTE_JS = re.compile(r'“[^”]*”|‘[^’]*’|\\"[^"\n]*?\\"|(?<![=\\])"[^"<>=\n]{1,40}"'
                            r'|^[^“”]*”|“[^”]*$')   # a quotation split by ${…} continues into the next literal piece
INNER_QUOTE = re.compile(r'“[^”]*”|‘[^’]*’|(?<![A-Za-z\\])\'[^\'\n]{3,}?\'(?![A-Za-z])|\\"[^"\\]*\\"|&quot;.*?&quot;|&ldquo;.*?&rdquo;')
QUOTE_KEY = re.compile(r'quote', re.I)
FILING_KEYS = {'related_persons', 'filer_or_source_agency', 'legal_entities_on_sec_edgar', 'ultimate_controlling_party_post_deal',
               'records', 'entity', 'issuer', 'filer', 'legal_name', 'entity_name'}
BSP_KEEP = re.compile(r'Broad Sky Partners \(BSP\)')
BSP_RX = re.compile(r'Broad Sky Partners(?P<pp>[\'’](?=\s))?|Broad Sky(?P<ps>[\'’]s)?')
TITLE_TAIL = re.compile(r'(·|&middot;)\s*Broad Sky(?=\s*$)')
WORDMARK = re.compile(r'<b>Broad Sky</b><small>Assistant</small>')

stats = {}          # path -> {rule: n}
skipped = []        # (path, reason, snippet)

def bump(path, rule, n=1):
    if n: stats.setdefault(path, {}).setdefault(rule, 0); stats[path][rule] += n

def skip_reason(unit, key=None, kind='json'):
    """Whole-unit exceptions: the string is kept exactly as written."""
    if 'Broad Sky' not in unit: return None
    if key and QUOTE_KEY.search(key): return f'quoted field "{key}"'
    if key in FILING_KEYS: return f'verbatim filing field "{key}"'
    if URLISH.search(unit): return 'URL or file path'
    if kind != 'js' and QUOTE_OPEN.search(unit) and not QUESTION.search(unit) and not LABEL_OK.match(unit.lstrip(' \'"‘“\\')):
        return 'string opens with a quotation mark'
    if HEADLINE.search(unit): return 'wire-service headline'
    return None

def bsp_unit(unit, path, key=None, page=None, kind='json', quoted_start=False):
    """Broad Sky -> BSP inside one prose unit. page: dict with 'expand' (bool) for the first-mention rule.
    kind: 'json' | 'html' | 'js' (JS units are literal contents, so straight quotes inside them are markup, not quotation)."""
    if 'Broad Sky' not in unit: return unit
    why = skip_reason(unit, key, kind)
    if why:
        skipped.append((path, why, unit.strip()[:140])); return unit
    unit, n = WORDMARK.subn('<b>BSP Desk</b><small>Assistant</small>', unit); bump(path, 'bsp', n)
    unit, n = TITLE_TAIL.subn(lambda t: t.group(1) + ' BSP Desk', unit); bump(path, 'title', n)
    keep = [(q.start(), q.end(), None) for q in BSP_KEEP.finditer(unit)]
    keep += [(q.start(), q.end(), f'legal entity "{q.group(0)}"') for q in ENTITY.finditer(unit) if 'Broad Sky' in q.group(0)]
    qrx = INNER_QUOTE_JS if kind == 'js' else INNER_QUOTE
    if quoted_start:
        close = unit.find('”'); keep.append((0, len(unit) if close < 0 else close, 'quoted phrase inside the string'))
    keep += [(q.start(), q.end(), 'quoted phrase inside the string') for q in qrx.finditer(unit) if not (LABEL_OK.search(q.group(0)) or QUESTION.search(q.group(0)))]
    out, last = [], 0
    for m in BSP_RX.finditer(unit):
        hit = next((k for k in keep if k[0] <= m.start() < k[1]), None)
        if hit:
            if hit[2]: skipped.append((path, hit[2], unit.strip()[:140]))
            continue
        tok = m.group(0)
        if m.group('pp'): rep = 'BSP' + ('’s' if m.group('pp') == '’' else "'s")
        elif m.group('ps'): rep = 'BSP' + m.group('ps')
        elif tok == 'Broad Sky Partners' and page is not None and page.get('expand'):
            rep = 'Broad Sky Partners (BSP)'; page['expand'] = False; bump(path, 'first-mention')
        else: rep = 'BSP'
        out.append(unit[last:m.start()]); out.append(rep); last = m.end(); bump(path, 'bsp')
    out.append(unit[last:])
    return ''.join(out)

def sowhat_unit(unit, path):
    if 'So what' not in unit: return unit
    def cap(s, i):
        return s[:i] + s[i].upper() + s[i + 1:] if i < len(s) and s[i].islower() else s
    while True:
        m = SO_WHAT.search(unit)
        if not m: break
        unit = cap(unit[:m.start()] + unit[m.end():], m.start()); bump(path, 'so-what')
    return unit

def product_text(text, path):
    for rx, rep in PRODUCT_RULES:
        text, n = rx.subn(rep, text); bump(path, 'product', n)
    return text

def splice(text, spans, fn):
    """Apply fn to each (a, b) span of text; spans must be sorted and disjoint."""
    out, last = [], 0
    for a, b in spans:
        out.append(text[last:a]); out.append(fn(text[a:b])); last = b
    out.append(text[last:]); return ''.join(out)

# ── per-format drivers ──────────────────────────────────────────────────────────────────────────
# js_spans does not see regex literals inside ${…} template expressions, so a quote inside one (/"/g) flips
# string and code. Mask regex literal bodies (same length) before scanning; edits still apply to the real text.
JS_REGEX = re.compile(r'''(?<=[(,=:\[!&|?{};])(\s*)/(?![/*])((?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\n\\\[])+)/([a-z]*)(?=\s*[.,);:\]}|&?]|\s*$)''', re.M)
def safe_prose_spans(text):
    masked = JS_REGEX.sub(lambda m: m.group(1) + '/' + 'x' * len(m.group(2)) + '/' + m.group(3), text)
    return prose_spans(masked)

def do_js(text, path, bsp=True):
    spans = safe_prose_spans(text)
    out, last, carried, prev_end = [], 0, False, -1
    for a, b in spans:
        u = text[a:b]
        # a “quotation” opened in the previous piece of the same template literal (piece ends at ${) continues here
        opened = carried and text[prev_end:prev_end + 2] == '${'
        u = sowhat_unit(u, path)
        if bsp:
            u = bsp_unit(u, path, kind='js', quoted_start=opened)
        state = opened
        for ch in text[a:b]:
            if ch == '“': state = True
            elif ch == '”': state = False
        carried, prev_end = state, b
        out.append(text[last:a]); out.append(u); last = b
    out.append(text[last:])
    return ''.join(out)

JSON_STR = re.compile(r'"(?:[^"\\\n]|\\.)*"')
def do_json(text, path, bsp=True):
    out, last, key = [], 0, None
    for m in JSON_STR.finditer(text):
        is_key = text[m.end():m.end() + 8].lstrip().startswith(':')
        if is_key:
            key = m.group(0)[1:-1]; continue
        inner = m.group(0)[1:-1]
        new = sowhat_unit(inner, path)
        if bsp: new = bsp_unit(new, path, key)
        if new != inner:
            out.append(text[last:m.start() + 1]); out.append(new); last = m.end() - 1
    out.append(text[last:]); return ''.join(out)

HTML_TOKEN = re.compile(r'<!--.*?-->|<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<[^>]+>', re.S | re.I)
ATTR = re.compile(r'''(\s(?:content|title|alt|aria-label|placeholder|data-ask|data-q|data-prompt|data-label|data-caption)=)(["'])(.*?)\2''', re.S | re.I)
def do_html(text, path):
    rel = path.replace(os.sep, '/')
    parts = rel.split('/')
    concept = (len(parts) >= 3 and parts[0] == 'redesigns' and parts[1] in CO_SLUGS) or re.search(r'banner:\s*true', text) is not None
    page = {'expand': not concept}
    body_at = text.lower().find('<body')
    out, last = [], 0
    def text_unit(seg, pos):
        seg = sowhat_unit(seg, path)
        return bsp_unit(seg, path, page=page if pos > body_at >= 0 else None, kind='html')
    for m in HTML_TOKEN.finditer(text):
        out.append(text_unit(text[last:m.start()], last))
        tok = m.group(0); low = tok[:12].lower()
        if low.startswith('<!--') or low.startswith('<style'):
            pass
        elif low.startswith('<script'):
            head_end = tok.find('>') + 1; tail_start = tok.lower().rfind('</script')
            open_tag = tok[:head_end]
            if 'src=' not in open_tag.lower() and 'json' not in open_tag.lower():
                tok = open_tag + do_js(tok[head_end:tail_start], path) + tok[tail_start:]
        else:
            tok = ATTR.sub(lambda a: a.group(1) + a.group(2) + bsp_unit(sowhat_unit(a.group(3), path), path, kind='html') + a.group(2), tok)
        out.append(tok); last = m.end()
    out.append(text_unit(text[last:], last))
    return ''.join(out)

PY_STR = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"")
def do_py_ui(text, path):
    """Generators of HTML pages (scripts/make_sitemap.py): the contents of each string literal are UI copy."""
    text, n = re.subn(r'(·|&middot;)\s*Broad Sky(?=</title>|")', lambda t: t.group(1) + ' BSP Desk', text); bump(path, 'title', n)
    return PY_STR.sub(lambda m: m.group(0)[0] + bsp_unit(m.group(0)[1:-1], path, kind='js') + m.group(0)[-1], text)

def process(rel):
    path = os.path.join(ROOT, rel)
    try: text = open(path, encoding='utf-8').read()
    except (UnicodeDecodeError, OSError): return None
    new = product_text(text, rel)
    ext = os.path.splitext(rel)[1]
    top = rel.split('/')[0]
    if top != 'worker':
        if ext == '.html': new = do_html(new, rel)
        elif ext == '.js': new = do_js(new, rel)
        elif ext == '.json':
            bsp = rel.startswith(('data/research/', 'data/answers/', 'briefing/'))
            new = do_json(new, rel, bsp=bsp)
        elif rel == 'scripts/make_sitemap.py': new = do_py_ui(new, rel)
    if new != text and WRITE:
        open(path, 'w', encoding='utf-8').write(new)
    return text, new

def files():
    if ARGS: return [os.path.relpath(os.path.abspath(a), ROOT) for a in ARGS]
    listed = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split('\n')
    return sorted(rel for rel in listed if rel.endswith(TEXT_EXTS) and rel not in SKIP_FILES
                  and not rel.endswith('.min.js') and not any(part in SKIP_DIRS for part in rel.split('/')))

def tally(text):
    return (len(OLD_NAME.findall(text)), len(SO_WHAT_ANY.findall(text)), text.count('Broad Sky'))

def main():
    before = [0, 0, 0]; after = [0, 0, 0]; changed = 0
    for rel in files():
        r = process(rel)
        if not r: continue
        old, new = r
        for i, v in enumerate(tally(old)): before[i] += v
        for i, v in enumerate(tally(new)): after[i] += v
        if old != new: changed += 1
    mode = 'WRITE' if WRITE else 'DRY RUN'
    if not QUIET:
        print(f'== {mode}: per-file changes')
        for p in sorted(stats):
            print(f'  {p}: ' + ', '.join(f'{k} {v}' for k, v in sorted(stats[p].items())))
        print(f'\n== kept as written ({len(skipped)} contexts)')
        seen = set()
        for p, why, snip in skipped:
            k = (p, why, snip)
            if k in seen: continue
            seen.add(k); print(f'  {p} · {why} · {snip}')
    print(f'\n== {mode}: {changed} files change')
    print(f'   old product name : {before[0]} -> {after[0]}')
    print(f'   "So what"        : {before[1]} -> {after[1]}')
    print(f'   "Broad Sky"      : {before[2]} -> {after[2]}')

if __name__ == '__main__':
    main()
