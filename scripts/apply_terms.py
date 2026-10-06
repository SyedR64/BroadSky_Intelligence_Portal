#!/usr/bin/env python3
"""Deterministic terminology pass for the site (rules in scripts/term_map.json).

Usage:  python3 scripts/apply_terms.py            # dry run: report what would change + what needs review
        python3 scripts/apply_terms.py --write    # apply the safe replacements
        python3 scripts/apply_terms.py --write path1 path2 ...

Visible copy only. Identifiers (object keys, enum string literals, attribute values, file paths,
camelCase symbols, snake_case keys) are never touched; they are listed under REVIEW so a person
can decide (usually: keep the key, change the label map that renders it).
"""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from js_spans import prose_spans, html_script_blocks

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITE = '--write' in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
EXTS = ('.html', '.js', '.css', '.json', '.md', '.py')
SKIP_DIRS = ('.git', 'node_modules', 'data/sales', 'data/live', 'worker', '.github', 'legacy')
SKIP_FILES = ('scripts/term_map.json', 'scripts/apply_terms.py', 'scripts/bump_version.sh')

# Files where "platform" is the private-equity sense nearly everywhere → bare word may be replaced.
PE_DOMINANT = re.compile(r'(data/research/(pe_landscape|bsp_methodology|bsp_network|bsp_firm|value_creation_cases|cases_[a-z_]+|ma_targets_[a-z_]+|public_comps|rival_filings|[a-z]+_filings|pp_nationwide|[a-z]+_playbook)\.json'
                         r'|modules/(home|ma|pe|fin|bsp|bsp-lib|cases|cases-lib|national|copy)\.js'
                         r'|redesigns/(methodology|case-studies)\.(js|html)'
                         r'|briefing/.*|README\.md|UNIFIED\.md|data/answers/.*|data/research/README\.md|index\.html|sitemap\.html)$')

def keep_case(src, repl):
    if src.isupper() and len(src) > 1: return repl.upper()
    if src[:1].isupper(): return repl[:1].upper() + repl[1:]
    return repl

# ---- protection: contexts where a match is an identifier, not prose ----
PROTECT = [
    r'[A-Za-z0-9]_%s', r'%s_[A-Za-z0-9]',          # snake_case keys
    r'[a-z]%s', r'%s[A-Z(]',                       # camelCase / function names
    r'%s\.(html|js|css|json|py)', r'/%s',          # paths
    r'[-.#]%s', r'%s-[a-z]',                       # css classes / anchors / hyphenated ids
    r'''(["'])%s\1''',                             # whole string literal ('platform', "playbook")
    r'''%s(s)?["']\s*:''',                         # object key
    r'''(id|class|data-[\w-]+|href|name|for|key|value|component|type|kind|role)=["'][^"']*%s''',  # attribute values
]

def code_spans(text, ext):
    """Spans that are JavaScript code (identifiers, keys, regex literals): never rewritten."""
    out = []
    if ext == '.js':
        prose = prose_spans(text); last = 0
        for a, b in prose: out.append((last, a)); last = b
        out.append((last, len(text)))
    elif ext == '.html':
        for a, b in html_script_blocks(text):
            seg = text[a:b]; last = a
            for x, y in prose_spans(seg): out.append((last, a + x)); last = a + y
            out.append((last, b))
    return out

def protected_spans(text, word, ext=''):
    spans = list(code_spans(text, ext))
    for pat in PROTECT:
        for m in re.finditer(pat % word, text, flags=re.I):
            spans.append((m.start(), m.end()))
    return spans

def in_spans(pos, spans):
    return any(a <= pos < b for a, b in spans)

# ---- rule sets: list of (regex, replacement-lambda or template with keep_case) ----
def R(pat, repl):
    rx = re.compile(pat, re.I)
    def f(m):
        out = repl(m) if callable(repl) else m.expand(repl)
        return keep_case(m.group(0), out) if not callable(repl) else out
    return rx, f

PLAYBOOK_RULES = [
    R(r'\b(Smith \+ Howard|S\+H)\s+playbook\b', lambda m: m.group(1) + ' template'),
    R(r'\bvalue[- ]creation\s+playbooks\b', 'growth plans'),
    R(r'\bvalue[- ]creation\s+playbook\b', 'growth plan'),
    R(r'\bnationwide\s+playbook\b', 'nationwide plan'),
    R(r'\b(business-services|Carlyle|sponsor|private[- ]equity|PE|firm)\s+playbook\b', lambda m: m.group(1) + ' approach'),
    R(r'\b(exit|integration|acquisition|M&amp;A|M&A|operating|operations|sales|marketing|pricing|hiring|recruiting|onboarding|launch|response|storm|event|weather|winter|retention|add-on|buy-and-build|roll-up|100-day|first-100-day|expansion|growth|execution|market-entry|entry|service|dispatch|technician|franchise)\s+playbooks\b', lambda m: m.group(1) + ' plans'),
    R(r'\b(exit|integration|acquisition|M&amp;A|M&A|operating|operations|sales|marketing|pricing|hiring|recruiting|onboarding|launch|response|storm|event|weather|winter|retention|add-on|buy-and-build|roll-up|100-day|first-100-day|expansion|growth|execution|market-entry|entry|service|dispatch|technician|franchise)\s+playbook\b', lambda m: m.group(1) + ' plan'),
    R(r'\b(the|this|that|its|their|our|each|every|whole|full|entire|same)\s+playbook\b', lambda m: m.group(1) + ' plan'),
    R(r'\bplaybooks\b', 'growth plans'),
    R(r'\bplaybook\b', 'growth plan'),
]

TECH_BEFORE = r'(?:software|tech|technology|voice|voice-AI|voice AI|AI|ad|ads|advertising|CTV|streaming|OTT|cloud|data|telephony|reference|SaaS|digital|e-?commerce|commerce|payments?|marketing|CRM|FSM|dispatch|booking|ordering|hosting|developer|automation|agent|intelligence|analytics|chat|messaging|social|media|demand-side|DSP|programmatic|retail|procurement|OS|operating|B2B|D2C|DTC|self-serve|quoting|scheduling|customer|single|one|unified|common|shared|internal|modern|open|closed|enablement|tech-enablement|technology-enablement|AI-agent|automation|workflow|ticketing|portal|web|mobile|app|IoT|SCADA|monitoring|telemetry|fleet|routing|GPS|billing|ERP|LIMS|e-procurement|punchout|punch-out|learning|training|LMS|content|video|audio|speech|ASR|LLM|model|ML|API|low-code|no-code|integration|intelligence|observability|security|compliance|trust|identity|collaboration|productivity|document|knowledge|search|recommendation|personalization|loyalty|subscription|membership|marketplace|lending|banking|fintech|insurtech|proptech|edtech|healthtech|legaltech|legal-tech|govtech|cleantech|climate|energy|grid|utility|smart-home|smart home|connected-home|connected home|franchise-management|franchise management|ServiceOS|GridOS|FirmOS|LabOS|SignalOS|HarborOS|[A-Za-z]+OS|Shopify|Salesforce|HubSpot|ServiceTitan|Housecall Pro|Jobber|EliseAI|Retell|Vapi|Bland|Deepgram|Twilio|Roku|Amazon|Samsung|Google|Meta|LinkedIn|Hulu|Vizio|Procore|Autodesk|Clio|NetDocuments|iManage|Cision|Muck Rack|Meltwater|Klaviyo|Attentive|Yotpo|Gorgias)'
TECH_AFTER = r'(?:fee|fees|tier|tiers|vendor|vendors|provider|providers|partner|partners|integration|integrations|API|APIs|stack|layer|license|licenses|licensing|subscription|team|engineering|release|releases|roadmap|build|migration|rollout|module|modules|feature|features|UI|UX|app|apps|software|dashboard|login|logins|account|accounts|user|users|data|analytics|architecture|choice|decision|selection|vendor)'

def not_tech(text):
    """Return a predicate(pos) → True when the 'platform' at pos is NOT tech sense (so may be replaced)."""
    tech_spans = []
    for m in re.finditer(r'\b' + TECH_BEFORE + r'(?:[\s-]+\w+)?[\s-]+platforms?\b', text, re.I):
        tech_spans.append((m.start(), m.end()))
    for m in re.finditer(r'\bplatforms?[\s-]+' + TECH_AFTER + r'\b', text, re.I):
        tech_spans.append((m.start(), m.end()))
    for m in re.finditer(r'\b[A-Z][A-Za-z]+ Platform\b', text):   # product names "Hebbia Platform"
        tech_spans.append((m.start(), m.end()))
    for m in re.finditer(r'platform-as-a-service|platforms? (like|such as)', text, re.I):
        tech_spans.append((m.start(), m.end()))
    return lambda pos: not in_spans(pos, tech_spans)

PLATFORM_PHRASES = [
    R(r'\bplatform\s+compan(y|ies)\b', lambda m: keep_case(m.group(0), 'portfolio compan' + m.group(1))),
    R(r'\bplatform\s+(acquisition|investment|deal|purchase|buyout|transaction|close|closing)(s?)\b', lambda m: keep_case(m.group(0), 'anchor ' + m.group(1) + m.group(2))),
    R(r'\bplatform\s+bu(y|ys)\b', lambda m: keep_case(m.group(0), 'anchor acquisition' + ('s' if m.group(1) == 'ys' else ''))),
    R(r'\bplatform-scale\b', 'anchor-scale'),
    R(r'\bplatform\s+(HQ|headquarters)\b', lambda m: keep_case(m.group(0), 'company ' + m.group(1))),
    R(r'\bplatform\s+entry\b', 'entry'),
    R(r'\bplatform-level\b', 'company-level'),
    R(r'\bplatform-wide\b', 'company-wide'),
    R(r'\bplatform[- ]years?\b', lambda m: keep_case(m.group(0), 'company-year' + ('s' if m.group(0).lower().endswith('s') else ''))),
    R(r'\bplatform\s+(CEO|CFO|COO|CRO|CMO|CTO|president|founder|founders|management|leadership|executives?|board|boards|team|teams)\b', lambda m: keep_case(m.group(0), 'portfolio-company ' + m.group(1))),
    R(r'\bplatform\s+(thesis|theses|value|values|EBITDA|revenue|revenues|margin|margins|debt|lender|lenders|loan|loans|unitranche|credit|hold|holds|holding|ownership|equity|exit|exits|entry|size|scale|economics|multiple|multiples|valuation|valuations|growth|strategy|strategies|history|histories|track record|record|profile|profiles|screen|screens|criteria|list|roster|count|mix|footprint|territory|territories|market|markets|brand|brands|segment|segments|sector|sectors|cadence)\b', lambda m: keep_case(m.group(0), 'company ' + m.group(1))),
    R(r'\bplatform\s+(add-on|add-ons|tuck-in|tuck-ins|bolt-on|bolt-ons)\b', lambda m: keep_case(m.group(0), 'company ' + m.group(1))),
    R(r'\bplatforms\s+and\s+add-ons\b', 'companies and add-ons'),
    R(r'\bplatform\s+and\s+add-ons?\b', lambda m: keep_case(m.group(0), 'anchor and add-on' + ('s' if m.group(0).endswith('s') else ''))),
    R(r'\badd-ons?\s+(to|for|onto|under|into)\s+(the|a|each|its|their|that|this)\s+platform\b', lambda m: m.group(0)[:-8] + 'company'),
    R(r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|dozen|several|multiple|many|few|fewer|more|most|all|both|other|new|existing|current|active|realized|exited|held|remaining|portfolio|rival|peer|competing|competitor|sponsor-backed|PE-backed|private-equity-backed|sponsor|backed|regional|national|local|comparable|similar|home-services|home services|residential|commercial|infrastructure|services|accounting|CPA|HVAC|plumbing|electrical|lab-supply|lab supply|distribution|apparel|swimwear|legal|legal-tech|IT|MSP|consulting|communications|PR|advisory|utility|electrical-services|industrial|healthcare|insurance|scaled|sub-scale|founder-led|family-owned|first|second|third|fourth|fifth|sixth|seventh|eighth|next|prior|previous|earlier|later|original|initial|flagship|anchor|core|smaller|larger|bigger|mid-sized|lower-middle-market|middle-market)\s+platforms\b', lambda m: keep_case(m.group(0), m.group(1) + ' companies')),
    R(r'\b(a|an|the|each|every|any|one|another|new|next|prior|previous|earlier|later|original|initial|flagship|anchor|core|first|second|third|fourth|fifth|sixth|seventh|eighth|existing|current|active|realized|exited|regional|national|local|comparable|similar|home-services|home services|residential|commercial|infrastructure|services|accounting|CPA|HVAC|plumbing|electrical|lab-supply|lab supply|distribution|apparel|swimwear|legal|legal-tech|IT|MSP|consulting|communications|PR|advisory|utility|electrical-services|industrial|healthcare|insurance|scaled|sub-scale|founder-led|family-owned|smaller|larger|bigger|mid-sized|lower-middle-market|middle-market|sponsor-backed|PE-backed|private-equity-backed|rival|peer|competing|competitor|portfolio)\s+platform\b', lambda m: keep_case(m.group(0), m.group(1) + ' company')),
    R(r'\b(per|across|among|between|within|from|of|for|by|at|to|into|onto|than)\s+platforms\b', lambda m: keep_case(m.group(0), m.group(1) + ' companies')),
    R(r'\b(per|across|within|of|for|by|at|to|into|onto|than|from)\s+platform\b', lambda m: keep_case(m.group(0), m.group(1) + ' company')),
    R(r'\bplatforms\b', 'portfolio companies'),       # bare plural: PE sense everywhere in this repo once tech spans are excluded
]
PLATFORM_BARE = R(r'\bplatform\b', 'portfolio company')   # bare singular: only in PE-dominant files

def apply_rules(text, rules, word, gate=None, ext=''):
    changed = []
    for rx, f in rules:
        spans = protected_spans(text, word, ext)
        def sub(m):
            if in_spans(m.start(), spans): return m.group(0)
            if gate and not gate(m.start()): return m.group(0)
            new = f(m)
            if new != m.group(0): changed.append((m.group(0), new))
            return new
        text = rx.sub(sub, text)
    return text, changed

def review_lines(text, word, rel):
    out = []
    spans = protected_spans(text, word)
    for m in re.finditer(r'\b%ss?\b' % word, text, re.I):
        if in_spans(m.start(), spans) or True:
            ln = text.count('\n', 0, m.start()) + 1
            line = text[text.rfind('\n', 0, m.start()) + 1: text.find('\n', m.end()) if text.find('\n', m.end()) > 0 else len(text)]
            out.append((ln, line.strip()[:200]))
    return out

def process(path):
    rel = os.path.relpath(path, ROOT)
    try: text = open(path, encoding='utf-8').read()
    except Exception: return None
    orig = text
    log = {'file': rel, 'changes': [], 'review': []}
    ext = os.path.splitext(path)[1]
    if not path.endswith('.css'):
        text, ch = apply_rules(text, PLAYBOOK_RULES, 'playbook', None, ext); log['changes'] += ch
        gate = not_tech(text)
        text, ch = apply_rules(text, PLATFORM_PHRASES, 'platform', gate, ext); log['changes'] += ch
        if PE_DOMINANT.search(rel):
            gate = not_tech(text)
            text, ch = apply_rules(text, [PLATFORM_BARE], 'platform', gate, ext); log['changes'] += ch
    # leftovers for review
    for word in ('playbook', 'platform'):
        for ln, line in review_lines(text, word, rel):
            log['review'].append((word, ln, line))
    if WRITE and text != orig:
        open(path, 'w', encoding='utf-8').write(text)
    log['modified'] = text != orig
    return log

def walk():
    if ARGS:
        for a in ARGS:
            p = a if os.path.isabs(a) else os.path.join(ROOT, a)
            if os.path.isdir(p):
                for d, _, fs in os.walk(p):
                    for f in fs: yield os.path.join(d, f)
            else: yield p
        return
    for d, dirs, fs in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT)
        if any(rel == s or rel.startswith(s + '/') or ('/' + s) in ('/' + rel) for s in SKIP_DIRS): dirs[:] = []; continue
        for f in fs: yield os.path.join(d, f)

def main():
    total_changes = 0; files_mod = 0; review = {}
    for p in walk():
        if not p.endswith(EXTS): continue
        rel = os.path.relpath(p, ROOT)
        if rel in SKIP_FILES: continue
        log = process(p)
        if not log: continue
        if log['changes']:
            files_mod += 1; total_changes += len(log['changes'])
            from collections import Counter
            c = Counter(log['changes'])
            print(f"\n== {rel}: {len(log['changes'])} replacement(s)" + (' [written]' if WRITE else ''))
            for (a, b), n in c.most_common(12): print(f"   {n:>3}× {a!r} → {b!r}")
        if log['review']: review[rel] = log['review']
    print(f"\n{'APPLIED' if WRITE else 'DRY RUN'}: {total_changes} replacements in {files_mod} files")
    rp = os.path.join(ROOT, 'scripts', '_terms_review.txt')
    with open(rp, 'w') as f:
        for rel, items in sorted(review.items()):
            f.write(f"\n## {rel} ({len(items)} left)\n")
            for word, ln, line in items: f.write(f"  L{ln} [{word}] {line}\n")
    left = sum(len(v) for v in review.values())
    print(f"REVIEW: {left} remaining 'playbook'/'platform' occurrences in {len(review)} files → scripts/_terms_review.txt")

if __name__ == '__main__': main()
