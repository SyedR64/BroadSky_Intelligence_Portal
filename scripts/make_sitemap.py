#!/usr/bin/env python3
"""Generate sitemap.html (every page and every portal route, grouped by company) from the repo.

Pages are discovered from the HTML files on disk; portal routes are read from
modules/registry.js and each module's `views: [...]` list, so the sitemap stays
in step with the site. Re-run after adding a page or a portal view:

    python3 scripts/make_sitemap.py

Writes ./sitemap.html using the unified system (assets/system.css + assets/frame.js).
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VER = '20261006090506'
m = re.search(r"system\.css\?v=(\d+)", (ROOT / 'index.html').read_text())
if m:
    VER = m.group(1)

CO = [  # portfolio order is fixed: PP, CET, Frontline, Thomas Scientific, BPI, Fair Harbor
    ('pp', 'punctual-pros', 'Punctual Pros', 'Residential HVAC, plumbing and electrical, Central PA and the Jersey Shore'),
    ('cet', 'cet', 'Commonwealth Electrical Technologies', 'Electrical and energy infrastructure across New England'),
    ('fl', 'frontline', 'Frontline Managed Services', 'Managed IT, security and billing services for law firms'),
    ('ts', 'thomas-scientific', 'Thomas Scientific', 'Lab supply distribution'),
    ('bpi', 'bpi', 'Bully Pulpit International', 'Strategic communications and public affairs'),
    ('fh', 'fair-harbor', 'Fair Harbor', 'Sustainable beachwear'),
]
OS = {'pp': 'ServiceOS', 'cet': 'GridOS', 'fl': 'FirmOS', 'ts': 'LabOS', 'bpi': 'SignalOS', 'fh': 'HarborOS'}

# Hand-written names and one-line blurbs for known pages (plain English, no identifiers).
KNOWN = {
    'index.html': ('Home', 'The landing page: ask a question, then three things to try.'),
    'app.html': ('Portal', 'Every module and view, listed below.'),
    'theater.html': ('3D map', 'A 3D fly-through of home sales, bids, add-on targets and live weather alerts.'),
    'sitemap.html': ('Sitemap', 'This page.'),
    'redesigns/index.html': ('Site concepts', 'Six concept websites and the OS program.'),
    'redesigns/voice-ai.html': ('24/7 Voice AI', 'What missed calls cost, the vendors and a sample call.'),
    'redesigns/ai-agents.html': ('AI agents', '45 agents across six companies, with rollout and value.'),
    'redesigns/case-studies.html': ('Sponsor case studies', 'How other sponsors grew companies like these.'),
    'redesigns/methodology.html': ('How BSP buys', 'How BSP finds, buys and grows companies.'),
    'assistant.html': ('Assistant', 'The BSP Desk assistant, full screen.'),
    'briefing/executive_memo.html': ('Executive memo', 'Four pages: where the six companies stand and what to do next.'),
}
CO_PAGE = {
    'index.html': ('Concept site', 'A concept website that uses the portal data.'),
    'growth-plan.html': ('Growth plan', 'The steps from today to a higher exit value, with sources.'),
    'nationwide.html': ('Nationwide plan', 'Lancaster to national in four phases.'),
    'ads.html': ('Growth marketing and sample ads', 'Connected TV, Local Services Ads and new-mover mail.'),
}
FILES = [
    ('briefing/broad_sky_briefing.mp4', 'Full briefing video', '5 minutes 3 seconds, 52 chapters.'),
    ('briefing/broad_sky_intro.mp4', 'Cinematic film', '2 minutes 13 seconds.'),
    ('briefing/BSP_Desk_Memo.pdf', 'Executive memo (PDF)', 'The memo as a printable PDF.'),
]
# Applied before the stylesheets load so a saved dark theme never flashes light (UNIFIED.md §8).
THEME_JS = '<script>/* one theme for the whole site (UNIFIED.md §8): apply the saved choice (localStorage \'bsp-theme\', light by default) before the stylesheets load; the frame\'s top-bar button changes it */(function(){try{var t=localStorage.getItem(\'bsp-theme\');if(t===\'dark\'||t===\'light\'){document.documentElement.setAttribute(\'data-sys-theme\',t);if(t===\'dark\'){var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute(\'content\',\'#0a0e14\')}}}catch(e){}})();</script>'
SKIP_DIRS = {'legacy', 'scripts', 'node_modules', 'data', '.git', 'assets'}


def esc(s):
    return html.escape(str(s), quote=True)


def title_of(path):
    t = re.search(r'<title>([^<]*)</title>', path.read_text(errors='ignore'))
    t = html.unescape(t.group(1)) if t else path.stem.replace('-', ' ').capitalize()
    return re.split(r'\s+[·|—–-]\s+', t)[0].strip()


def desc_of(path):
    d = re.search(r'<meta name="description" content="([^"]*)"', path.read_text(errors='ignore'))
    if not d:
        return ''
    d = html.unescape(d.group(1))
    first = re.split(r'(?<=[.!?])\s', d)[0]
    return first if len(first) <= 160 else first[:157].rsplit(' ', 1)[0] + '…'


def pages():
    out = []
    for p in sorted(ROOT.rglob('*.html')):
        rel = p.relative_to(ROOT).as_posix()
        if rel.split('/')[0] in SKIP_DIRS:
            continue
        out.append(rel)
    if 'sitemap.html' not in out:
        out.append('sitemap.html')
    return out


def modules():
    reg = (ROOT / 'modules/registry.js').read_text()
    _nm = re.search(r"const NAMES = \{([^}]*)\}", reg)
    names = dict(re.findall(r"(\w+):\s*'([^']+)'", _nm.group(1))) if _nm else {}
    files = re.findall(r"import \w+ from '\./([\w-]+)\.js", reg)
    mods = []
    for f in files:
        s = (ROOT / f'modules/{f}.js').read_text()
        i = s.find('export default')
        head = s[i:i + 600]
        mid = re.match(r"export default \{\s*id:\s*'([\w-]+)'", head)
        mname = re.search(r"\bname:\s*'([^']+)'", head)
        if not mid:  # modules configured through a CFG object (bpi.js, fh.js)
            cfg = re.search(r"CFG\s*=\s*\{([^}]*)\}", s)
            mid = re.search(r"\bid:\s*'([\w-]+)'", cfg.group(1)) if cfg else None
            mname = re.search(r"\bname:\s*'([^']+)'", cfg.group(1)) if cfg else None
        vi = s.find('views:', i)
        views = re.findall(r"\{\s*id:\s*'([\w-]+)',\s*name:\s*'([^']+)'", s[vi:]) if vi > 0 else []
        if mid:
            mods.append((mid.group(1), names.get(mid.group(1), mname.group(1) if mname else f), views))
    return mods


def item(href, name, blurb, extra=''):
    return f'<li><a href="{esc(href)}">{esc(name)}</a><span>{esc(blurb)}</span>{extra}</li>'


def routes_html(mid, views):
    def nice(n):  # spell out company abbreviations in visible link text
        return re.sub(r'\bPP\b', 'Punctual Pros', n)
    links = ''.join(f'<a href="app.html#/{esc(mid)}/{esc(v)}">{esc(nice(n))}</a>' for v, n in views)
    return f'<span class="lp-map-routes">{links}</span>'


def main():
    all_pages = pages()
    mods = modules()
    mod_by_id = {m[0]: m for m in mods}
    groups = []

    # 1. start
    start = [p for p in ['index.html', 'app.html', 'theater.html', 'sitemap.html', 'assistant.html'] if p in all_pages]
    lis = [item(p if p != 'index.html' else './', *KNOWN[p]) for p in start]
    groups.append(('start', 'Start', 'The front door, the portal and the 3D map.', None, lis))

    # 2. companies
    used = set(start)
    for co, slug, name, what in CO:
        lis = []
        base = f'redesigns/{slug}/'
        files = [p for p in all_pages if p.startswith(base)]
        order = ['index.html', f'{OS[co].lower()}.html', 'nationwide.html', 'growth-plan.html', 'ads.html']
        files.sort(key=lambda p: (order.index(p[len(base):]) if p[len(base):] in order else 99, p))
        for p in files:
            fn = p[len(base):]
            used.add(p)
            if fn.lower() == f'{OS[co].lower()}.html':
                nm, bl = OS[co], 'Product page and demo.'
            elif fn in CO_PAGE:
                nm, bl = CO_PAGE[fn]
            else:
                nm, bl = title_of(ROOT / p), desc_of(ROOT / p)
            lis.append(item(base if fn == 'index.html' else p, nm, bl))
        if co in mod_by_id:
            mid, mname, views = mod_by_id[co]
            lis.append(item(f'app.html#/{mid}/{views[0][0]}' if views else 'app.html', 'Portal module', f'{len(views)} views in the portal.', routes_html(mid, views)))
        groups.append((co, name, what, co, lis))

    # 3. portfolio-wide programs and pages
    lis = []
    for p in ['redesigns/index.html', 'redesigns/voice-ai.html', 'redesigns/ai-agents.html', 'redesigns/case-studies.html', 'redesigns/methodology.html']:
        if p in all_pages:
            used.add(p)
            lis.append(item('redesigns/' if p == 'redesigns/index.html' else p, *KNOWN[p]))
    for p in all_pages:  # anything new that is not yet classified
        if p in used or p in KNOWN or p.startswith('briefing/'):
            continue
        used.add(p)
        lis.append(item(p, title_of(ROOT / p), desc_of(ROOT / p)))
    groups.append(('programs', 'Portfolio programs', 'Programs that span all six companies.', None, lis))

    # 4. portfolio-wide portal modules
    lis = []
    co_ids = {c[0] for c in CO}
    for mid, mname, views in mods:
        if mid in co_ids:
            continue
        lis.append(item(f'app.html#/{mid}/{views[0][0]}' if views else 'app.html', mname, f'{len(views)} view{"s" if len(views) != 1 else ""}.', routes_html(mid, views)))
    groups.append(('portal', 'Portal: portfolio modules', 'Modules that span the portfolio.', None, lis))

    # 5. briefing
    lis = []
    if 'briefing/executive_memo.html' in all_pages:
        lis.append(item('briefing/executive_memo.html', *KNOWN['briefing/executive_memo.html']))
    for f, nm, bl in FILES:
        if (ROOT / f).exists():
            lis.append(item(f, nm, bl))
    groups.append(('briefing', 'Briefing', 'Videos and the memo.', None, lis))

    n_pages = len(all_pages)
    n_routes = sum(len(m[2]) for m in mods)
    SHORT = {'start': 'Start', 'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor', 'programs': 'Programs', 'portal': 'Portal modules', 'briefing': 'Briefing'}
    # page bar: five links at most; the six company groups share one "Companies" link to the first of them
    BAR = {'start': 'Start', 'pp': 'Companies', 'programs': 'Programs', 'portal': 'Portal', 'briefing': 'Briefing'}
    sub = ''.join(f'<a href="#g-{g[0]}">{esc(BAR[g[0]])}</a>' for g in groups if g[0] in BAR)

    KICK = {'start': 'Overview', 'pp': 'Home services', 'cet': 'Electrical and energy', 'fl': 'Legal IT', 'ts': 'Lab supply', 'bpi': 'Communications', 'fh': 'Consumer', 'programs': 'Across the portfolio', 'portal': 'Portal', 'briefing': 'Briefing'}

    def section(i, g):
        gid, name, what, co, lis = g
        alt = ' sys-section--alt' if i % 2 == 1 else ''
        dco = f' data-co="{co}"' if co else ''
        dot = '<span class="sys-dot" aria-hidden="true"></span>' if co else ''
        return f'''  <section class="sys-section sys-section--tight lp-map-group{alt}" id="g-{gid}"{dco} aria-labelledby="g-{gid}-t">
    <div class="sys-wrap">
      <div class="sys-section-head">
        <p class="sys-kicker">{esc(KICK.get(gid, 'Section'))}</p>
        <h2 id="g-{gid}-t" class="sys-h2">{esc(name)}</h2>
        <p class="sys-lead">{esc(what if what.endswith('.') else what + '.')}</p>
      </div>
      <ul class="lp-list lp-map-list">
        {chr(10).join("        " + x for x in lis).strip()}
      </ul>
    </div>
  </section>'''

    body = '\n\n'.join(section(i, g) for i, g in enumerate(groups))
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sitemap · BSP Desk</title>
<meta name="description" content="Every page and portal view, grouped by company.">
<meta name="theme-color" content="#fbfaf7">
{THEME_JS}
<meta name="author" content="Syed Rahman">
<link rel="icon" href="BSP_Logo.png">
<link rel="apple-touch-icon" href="BSP_Logo.png">
<link rel="canonical" href="https://broadsky-desk.vercel.app/sitemap.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BSP Desk">
<meta property="og:title" content="Sitemap · BSP Desk">
<meta property="og:description" content="Every page and portal view, grouped by company.">
<meta property="og:url" content="https://broadsky-desk.vercel.app/sitemap.html">
<meta property="og:image" content="https://broadsky-desk.vercel.app/assets/img/portal_home_overview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Sitemap · BSP Desk">
<meta name="twitter:description" content="Every page and portal view, grouped by company.">
<meta name="twitter:image" content="https://broadsky-desk.vercel.app/assets/img/portal_home_overview.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/system.css?v={VER}">
<link rel="stylesheet" href="assets/sitemap.css?v={VER}">
</head>
<body data-page="sitemap">
<!-- Generated by scripts/make_sitemap.py; edit the script, not this file. -->
<main id="main">
  <nav class="sys-subnav" aria-label="On this page">
    <div class="sys-subnav-in">
      <a class="sys-subnav-title" href="#top">Sitemap</a>
      <div class="sys-subnav-links">{sub}</div>
    </div>
  </nav>

  <section class="sys-hero" id="top" aria-labelledby="map-title">
    <div class="sys-wrap">
      <p class="sys-eyebrow"><span class="sys-dot" aria-hidden="true"></span><b>Every page</b> and every portal view, in one place</p>
      <h1 id="map-title" class="sys-h1">Every page, <span class="sys-grad-text">one list.</span></h1>
      <p class="sys-lead">Every page and portal view, by company, then the programs and modules that span the portfolio.</p>
      <div class="sys-chips" style="margin-top:var(--sys-sp-6)">
        {''.join(f'<a class="sys-chip" data-co="{c[0]}" href="#g-{c[0]}">{esc(SHORT[c[0]])}</a>' for c in CO)}
      </div>
    </div>
  </section>

{body}

  <section class="sys-cta" aria-labelledby="cta-title">
    <div class="sys-wrap">
      <div class="sys-cta-in">
        <div class="sys-cta-copy">
          <h2 id="cta-title">Not sure where to start?</h2>
          <p>Ask a question; the answer links to the right page.</p>
        </div>
        <div class="sys-actions">
          <a class="sys-btn sys-btn--accent sys-btn--lg" href="./#start">Start here</a>
          <a class="sys-btn sys-btn--secondary sys-btn--lg" href="app.html">Open the portal</a>
        </div>
      </div>
    </div>
  </section>
</main>

<script type="module">
  import {{ Frame }} from './assets/frame.js?v={VER}';
  Frame.mount({{ crumb: [{{ label: 'Home', href: './' }}, {{ label: 'Sitemap' }}] }});
</script>
</body>
</html>
'''
    (ROOT / 'sitemap.html').write_text(page)
    print(f'sitemap.html: {n_pages} pages, {n_routes} portal views, {len(mods)} modules, {len(groups)} groups')


if __name__ == '__main__':
    main()
