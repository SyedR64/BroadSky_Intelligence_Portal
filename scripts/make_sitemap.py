#!/usr/bin/env python3
"""Generate sitemap.html (every page and every portal route, grouped by company) from the repo.

Pages are discovered from the HTML files on disk; portal routes are read from
modules/registry.js and each module's `views: [...]` list, so the sitemap stays
in step with the site. Re-run after adding a page or a portal view:

    python3 scripts/make_sitemap.py

The portal section follows the portal's own menu (the RAIL groups in modules/registry.js), then lists the
modules that are off the menu. Every screen is listed there, once, with or without a tab; a company's own section
carries one row that opens its first screen. A forwarding page (one that
carries <meta name="bsp-forward">, scripts/ci_check.py forward_target) is not a page of its own and is left out.

Writes ./sitemap.html using the unified system (assets/system.css + assets/frame.js).
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ci_check import forward_target   # the one test for a forwarding page, shared with the checker and the knowledge build
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
PAGE_NAME = 'All pages'   # this page's one name: its title, its bar, its crumb, the Start list and the site footer
KNOWN = {
    'index.html': ('Home', 'The front page: what the site is and where to start.'),
    'app.html': ('Portal', 'The six companies and the deal tools. Every screen is listed below.'),
    'theater.html': ('3D map', 'A 3D fly-through of home sales, bids, add-on targets and live weather alerts.'),
    'sitemap.html': (PAGE_NAME, 'This page.'),
    'redesigns/index.html': ('Concepts', 'Six concept websites and the OS program.'),
    'redesigns/voice-ai.html': ('24/7 Voice AI', 'What missed calls cost, the vendors and a sample call.'),
    'redesigns/ai-agents.html': ('AI agents plan', '45 agents across six companies, with rollout and value.'),
    'redesigns/case-studies.html': ('Sponsor precedents', 'How other sponsors grew companies like these.'),
    'redesigns/methodology.html': ('How BSP buys', 'How BSP finds, buys and grows companies.'),
    'assistant.html': ('Full assistant', 'The BSP Desk assistant, full screen.'),
    'agent.html': ('Company agent', 'Ask as any role at BSP or its six companies, with sandbox apps and data.'),
    'briefing/executive_memo.html': ('Executive memo', 'Four pages: where the six companies stand and what to do next.'),
}
CO_PAGE = {
    'index.html': ('Website concept', 'A concept website that uses the portal data.'),
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
SKIP_DIRS = {'legacy', 'scripts', 'node_modules', 'data', '.git', 'assets', 'tools'}


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
        top = rel.split('/')[0]
        if top in SKIP_DIRS or top.startswith('.'):   # .claude/worktrees and other dot dirs are local only
            continue
        if forward_target(rel) is not None:   # a forwarding page: its target is listed, the old address is not
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
            mname = (re.search(r"\bshort:\s*'([^']+)'", cfg.group(1)) or re.search(r"\bname:\s*'([^']+)'", cfg.group(1))) if cfg else None   # the menu shows CFG.short
        vi = s.find('views:', i)
        views = re.findall(r"\{\s*id:\s*'([\w-]+)',\s*name:\s*'([^']+)'", s[vi:]) if vi > 0 else []
        if mid:
            mods.append((mid.group(1), names.get(mid.group(1), mname.group(1) if mname else f), views))
    return mods


def menu():
    """The portal's menu, read from modules/registry.js: ([(group name, [module id, ...])], the label for modules off the
    menu, {module id: [view ids in tab order]} for the modules whose tab order differs from their views' order)."""
    reg = (ROOT / 'modules/registry.js').read_text()
    rail = re.search(r"const RAIL = (\[.*\]);", reg)
    groups = [(name, re.findall(r"'([\w-]+)'", ids)) for name, ids in re.findall(r"\['([^']+)',\s*\[([^\]]*)\]\]", rail.group(1))] if rail else []
    more = re.search(r"const OFF_MENU_GROUP = '([^']+)'", reg)
    order = re.search(r"const TAB_ORDER = \{(.*)\};", reg)
    tabs = {mid: re.findall(r"'([\w-]+)'", ids) for mid, ids in re.findall(r"(\w+):\s*\[([^\]]*)\]", order.group(1))} if order else {}
    return groups, (more.group(1) if more else 'More'), tabs


def item(href, name, blurb, extra=''):
    return f'<li><a href="{esc(href)}">{esc(name)}</a><span>{esc(blurb)}</span>{extra}</li>'


def routes_html(mid, views):
    def nice(n):  # spell out company abbreviations in visible link text
        return re.sub(r'\bPP\b', 'Punctual Pros', n)
    links = ''.join(f'<a href="app.html#/{esc(mid)}/{esc(v)}">{esc(nice(n))}</a>' for v, n in views)
    return f'<span class="lp-map-routes">{links}</span>'


def main():
    all_pages = pages()
    rail, more, tab_order = menu()
    # screens in the same order as the tab row: the ids TAB_ORDER lists first, the rest in place after them
    mods = [(mid, mname, sorted(views, key=lambda v, first=tab_order.get(mid, []): first.index(v[0]) if v[0] in first else len(first))) for mid, mname, views in modules()]
    mod_by_id = {m[0]: m for m in mods}
    groups = []

    # 1. start
    start = [p for p in ['index.html', 'agent.html', 'app.html', 'sitemap.html', 'assistant.html'] if p in all_pages]
    lis = [item(p if p != 'index.html' else './', *KNOWN[p]) for p in start]
    groups.append(('start', 'Start', 'The front page, the company agent and the portal.', None, lis))

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
            # one row here; the screens themselves are listed once, in the portal section (they were on the page twice)
            lis.append(item(f'app.html#/{mid}/{views[0][0]}' if views else 'app.html', 'In the portal', f'{len(views)} screen{"s" if len(views) != 1 else ""}, listed in the portal section below.'))
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

    # 4. the portal, in the order of its own menu: the three menu groups, then the modules that are off the menu.
    # Every screen is listed, including the ones with no tab. `lis` is a list of (sub-heading, [items]) here.
    def mod_item(mid):
        _, mname, views = mod_by_id[mid]
        return item(f'app.html#/{mid}/{views[0][0]}' if views else 'app.html', mname, f'{len(views)} screen{"s" if len(views) != 1 else ""}.', routes_html(mid, views))
    on_menu = {mid for _, ids in rail for mid in ids}
    blocks = [(name, [mod_item(mid) for mid in ids if mid in mod_by_id]) for name, ids in rail]
    off = [mod_item(mid) for mid, _, _ in mods if mid not in on_menu]
    if off:
        blocks.append((more if rail else 'Portal', off))
    n_off = len(off) if rail else 0
    count = {1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six'}.get(n_off, str(n_off))
    lead = 'Listed in the order of the portal’s menu' + ('' if not n_off else f'. The one under “{more}” opens from a button on another screen' if n_off == 1 else f'. The {count} under “{more}” open from buttons on other screens')
    groups.append(('portal', 'Every screen in the portal', lead, None, blocks))

    # 5. briefing (the 3D map is listed here for as long as it is a page of its own)
    lis = []
    if 'theater.html' in all_pages:
        lis.append(item('theater.html', *KNOWN['theater.html']))
    if 'briefing/executive_memo.html' in all_pages:
        lis.append(item('briefing/executive_memo.html', *KNOWN['briefing/executive_memo.html']))
    for f, nm, bl in FILES:
        if (ROOT / f).exists():
            lis.append(item(f, nm, bl))
    groups.append(('briefing', 'Briefing', 'The 3D map, the videos and the memo.' if 'theater.html' in all_pages else 'Videos and the memo.', None, lis))

    n_pages = len(all_pages)
    n_routes = sum(len(m[2]) for m in mods)
    SHORT = {'start': 'Start', 'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor', 'programs': 'Programs', 'portal': 'Portal', 'briefing': 'Briefing'}
    # page bar: five links at most; the six company groups share one "Companies" link to the first of them
    BAR = {'start': 'Start', 'pp': 'Companies', 'programs': 'Programs', 'portal': 'Portal', 'briefing': 'Briefing'}
    sub = ''.join(f'<a href="#g-{g[0]}">{esc(BAR[g[0]])}</a>' for g in groups if g[0] in BAR)

    KICK = {'start': 'Overview', 'pp': 'Home services', 'cet': 'Electrical and energy', 'fl': 'Legal IT', 'ts': 'Lab supply', 'bpi': 'Communications', 'fh': 'Consumer', 'programs': 'Across the portfolio', 'portal': 'Portal', 'briefing': 'Briefing'}

    def ul(lis):
        return f'''      <ul class="lp-list lp-map-list">
        {chr(10).join("        " + x for x in lis).strip()}
      </ul>'''

    def lists(lis):   # one list, or (sub-heading, items) blocks: a heading in the system type scale above each list
        if not lis or not isinstance(lis[0], tuple):
            return ul(lis)
        return chr(10).join(f'''      <h3 class="sys-h3" style="margin:{'0' if k == 0 else 'var(--sys-sp-7)'} 0 var(--sys-sp-4)">{esc(head)}</h3>
{ul(items)}''' for k, (head, items) in enumerate(lis))

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
{lists(lis)}
    </div>
  </section>'''

    body = '\n\n'.join(section(i, g) for i, g in enumerate(groups))
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{PAGE_NAME} · BSP Desk</title>
<meta name="description" content="Every page and portal screen, grouped by company.">
<meta name="theme-color" content="#fbfaf7">
{THEME_JS}
<meta name="author" content="Syed Rahman">
<link rel="icon" href="BSP_Logo.png">
<link rel="apple-touch-icon" href="BSP_Logo.png">
<link rel="canonical" href="https://broadsky-agent.vercel.app/sitemap.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BSP Desk">
<meta property="og:title" content="{PAGE_NAME} · BSP Desk">
<meta property="og:description" content="Every page and portal screen, grouped by company.">
<meta property="og:url" content="https://broadsky-agent.vercel.app/sitemap.html">
<meta property="og:image" content="https://broadsky-agent.vercel.app/assets/img/portal_home_overview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{PAGE_NAME} · BSP Desk">
<meta name="twitter:description" content="Every page and portal screen, grouped by company.">
<meta name="twitter:image" content="https://broadsky-agent.vercel.app/assets/img/portal_home_overview.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/system.css?v={VER}">
<link rel="stylesheet" href="assets/sitemap.css?v={VER}">
<style>
  /* A section opened by its link sits just under the page's bars, and is the one the bar marks as current. system.css
     already pads every jump by the bars' height; the equal margin in sitemap.css doubled the gap, so it is replaced here. */
  .lp-map-group{{scroll-margin-top:-2px}}
</style>
</head>
<body data-page="sitemap">
<!-- Generated by scripts/make_sitemap.py; edit the script, not this file. -->
<main id="main">
  <nav class="sys-subnav" aria-label="On this page">
    <div class="sys-subnav-in">
      <a class="sys-subnav-title" href="#top">{PAGE_NAME}</a>
      <div class="sys-subnav-links">{sub}</div>
    </div>
  </nav>

  <section class="sys-hero" id="top" aria-labelledby="map-title">
    <div class="sys-wrap">
      <p class="sys-eyebrow"><span class="sys-dot" aria-hidden="true"></span><b>Every page</b> and every portal screen, in one place</p>
      <h1 id="map-title" class="sys-h1">Every page, <span class="sys-grad-text">one list.</span></h1>
      <p class="sys-lead">Every page, by company, then the programs that span the portfolio and every screen in the portal.</p>
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
  Frame.mount({{ crumb: [{{ label: 'Home', href: './' }}, {{ label: '{PAGE_NAME}' }}] }});
  // A link straight to a section (the portal's "All views" opens #g-portal): hold that section under the page's bars
  // while the page settles. The browser's own jump starts before the bars and the type are in place and stops short.
  // The first scroll, tap or key hands the page back to the visitor.
  const sec = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (sec && 'ResizeObserver' in window) {{
    const land = () => sec.scrollIntoView({{ block: 'start', behavior: 'instant' }});
    const watch = new ResizeObserver(land), keys = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    const stop = () => {{ watch.disconnect(); for (const k of keys) removeEventListener(k, stop); }};
    for (const k of keys) addEventListener(k, stop, {{ passive: true }});
    addEventListener('load', () => setTimeout(stop, 1500), {{ once: true }});
    watch.observe(document.body); land();
  }}
</script>
</body>
</html>
'''
    (ROOT / 'sitemap.html').write_text(page)
    print(f'sitemap.html: {n_pages} pages, {n_routes} portal views, {len(mods)} modules, {len(groups)} groups')


if __name__ == '__main__':
    main()
