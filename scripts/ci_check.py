#!/usr/bin/env python3
"""Headless smoke test for the static site: every HTML page and every app route must load
without console errors or uncaught page errors, and every link to a portal screen must lead somewhere.

  python3 scripts/ci_check.py                    # starts its own static server if :8765 is free
  python3 scripts/ci_check.py --base http://127.0.0.1:8765 --out ci-report --settle 2500
  python3 scripts/ci_check.py --links-only       # the link audit alone: no browser, a few seconds

Pages:  every *.html in the repo except scripts/, .git/, node_modules/.
Routes: app.html#/<module>/<view> for each module/view parsed from modules/*.js (cross-checked against the
        live App registry once the app boots), viewed as the managing partner (app.html?role=bsp-managing-partner),
        the level that opens every screen.
Levels: for each of the five levels of Broad Sky OS, one role (LEVEL_ROLES), chosen through localStorage before the
        page loads, as a visitor's earlier "Viewing as" choice would be: every item of that role's menu must open
        without an error and land on its screen, the menu must hold what OS_SPEC 3 gives the level (LEVEL_MENU), and a
        screen the level does not have must send the visitor to #/home/overview with the line "Not in this view.".
Forwarding pages: a page whose <head> carries <meta name="bsp-forward" content="<target>"> only hands its visitor on.
        It is not rendered or counted as a page. Its target must be a file that exists and is not itself a
        forwarding page; a target of app.html#/<module>/<view> must be a live route or a key of the forwarding
        table; and the page must carry a meta refresh, a script that changes the location and a plain link.
        <target> is written from the site root ("app.html#/cases/timeline"); "./" or "../" means relative to the page.
        find_pages() leaves these pages out, so the knowledge build and the sitemap skip them too.
Link audit (no browser): every literal #/<module>/<view> in the site's pages, assets/, modules/, redesigns/ and
        server/*.py, and every "portal_view" field in data/, must be a live route or a key of the forwarding table
        (modules/registry.js ALIASES). Every target in that table must be a live route. A key that is still a
        live route is a "pending merge": the old screen has not been deleted yet, so nothing forwards. That is
        reported, and fails only with --strict-aliases. Each failure is listed with its file and line.
        Once a key's view is gone, the old address is also opened in the browser to prove it lands on its target
        with its parameters kept.
Ignored noise: luma.gl / deck.gl warnings and map-tile failures.
Warnings (listed in the report, never fatal): console errors caused by external hosts, i.e. third-party URLs (live
        public APIs, CDNs) answering 429 or 5xx, timing out, failing CORS or dropping the connection. The site
        falls back to data/live snapshots for those, so a rate limit upstream must not fail CI.
Errors (fatal): everything local: same-origin 4xx/5xx (a missing file in this repo), uncaught page errors and any
        console error that does not come from an external resource.
Exit 1 if any page or route has errors. Writes <out>/ci_summary.json and <out>/ci_summary.md.
Requires: pip install playwright && python -m playwright install chromium
"""
import argparse, asyncio, functools, http.server, json, os, re, socket, sys, tempfile, threading, time
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE_DIRS = {'legacy', 'scripts', '.git', 'node_modules', '.github', '.claude', 'tools'}

IGNORE_TEXT = [
    re.compile(r'luma\.gl|deck\.gl|@deck\.gl|luma', re.I),
    re.compile(r'WebGL|GPU stall|GL Driver Message|CONTEXT_LOST|THREE\.WebGLRenderer', re.I),   # headless GPU noise
    re.compile(r'Download the React DevTools', re.I),
]
URL_RX = re.compile(r"https?://[^\s'\"()<>]+")
TILE_RX = re.compile(r'tile|/\d+/\d+/\d+(@2x)?\.(png|jpg|jpeg|webp|pbf|mvt)|basemaps|cartocdn|openstreetmap|arcgisonline|mapbox|stadiamaps|maptiler', re.I)


def _read(path, limit=None):
    try:
        with open(os.path.join(ROOT, path), encoding='utf-8', errors='ignore') as f:
            return f.read(limit) if limit else f.read()
    except OSError:
        return ''


def forward_target(path):
    """The target of a forwarding page, or None for an ordinary page. A forwarding page carries
    <meta name="bsp-forward" content="<target>"> in its <head>. This one test is shared by the checker, the knowledge
    build (through find_pages) and scripts/make_sitemap.py, so a forwarding page is never rendered, indexed or listed."""
    head = re.split(r'</head\s*>', _read(path, 65536), maxsplit=1, flags=re.I)[0]
    for tag in re.findall(r'<meta\b[^>]*>', head, re.I):
        if re.search(r'\bname\s*=\s*["\']bsp-forward["\']', tag, re.I):
            c = re.search(r'\bcontent\s*=\s*["\']([^"\']*)["\']', tag, re.I)
            return c.group(1).strip() if c else ''
    return None


def find_pages(include_forwards=False):
    """Every site page, as a path from the repo root. Forwarding pages are left out unless asked for."""
    out = []
    for dp, dns, fns in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        dns[:] = [d for d in dns if d not in EXCLUDE_DIRS and not d.startswith('.')]
        if rel != '.' and rel.split(os.sep)[0] in EXCLUDE_DIRS:
            continue
        out += [os.path.normpath(os.path.join(rel, f)).replace(os.sep, '/') for f in fns if f.endswith('.html')]
    return sorted(p for p in out if include_forwards or forward_target(p) is None)


def find_forwards():
    """[(page, target)] for every forwarding page."""
    return [(p, t) for p in find_pages(include_forwards=True) for t in [forward_target(p)] if t is not None]


def _matching(s, i, open_ch, close_ch):
    depth = 0
    for j in range(i, len(s)):
        if s[j] == open_ch: depth += 1
        elif s[j] == close_ch:
            depth -= 1
            if depth == 0: return j
    return len(s)


def parse_routes():
    """[(module_id, view_id)] from each module's `export default { id, views: [...] }`."""
    reg = os.path.join(ROOT, 'modules', 'registry.js')
    order = re.findall(r"import\s+\w+\s+from\s+'\./([\w-]+)\.js", open(reg).read()) if os.path.exists(reg) else []
    files = order or sorted(f[:-3] for f in os.listdir(os.path.join(ROOT, 'modules')) if f.endswith('.js'))
    routes = []
    for stem in files:
        src = open(os.path.join(ROOT, 'modules', stem + '.js')).read()
        k = src.find('export default {')
        if k < 0: continue
        body = src[k:]
        m = re.search(r"\bid:\s*'([\w-]+)'", body[:400])
        mid = m.group(1) if m else None
        if not mid:  # e.g. id: CFG.id
            cm = re.search(r"const\s+CFG\s*=\s*\{[^}]*?\bid:\s*'([\w-]+)'", src, re.S)
            mid = cm.group(1) if cm else stem
        v = body.find('views:')
        if v < 0: continue
        a = body.find('[', v); b = _matching(body, a, '[', ']')
        arr = body[a:b + 1]
        # top-level objects in the array only
        depth, views = 0, []
        for i, ch in enumerate(arr):
            if ch in '[{(': depth += 1
            elif ch in ']})': depth -= 1
            if ch == '{' and depth == 2:
                mm = re.match(r"\{\s*id:\s*'([\w-]+)'", arr[i:i + 80])
                if mm: views.append(mm.group(1))
        routes += [(mid, vid) for vid in views]
    return routes


# ── Forwarding table, forwarding pages and the link audit (static: no browser) ───────────────────────────────────────
ROUTE_RX = re.compile(r'#/([A-Za-z][\w-]*)/([A-Za-z][\w-]*)')                           # a literal #/module/view
MODULE_RX = re.compile(r'''(?:app\.html|href=["'])#/([A-Za-z][\w-]*)/?(?=["'?\s]|$)''')   # a link to a module's first screen
GO_RX = re.compile(r'''\b[Aa]pp\.go\(\s*['"]([\w-]+)['"]\s*(?:,\s*['"]([\w-]+)['"])?''')   # App.go('module', 'view')
FIELD_RX = re.compile(r'"portal_view"\s*:\s*"((?:[^"\\]|\\.)*)"')
AUDIT_EXT = ('.html', '.js', '.mjs', '.css', '.json')
AUDIT_MAX_BYTES = 8_000_000   # generated bundles and data blobs are not hand-written links


def parse_aliases():
    """{'module/view': {'target': 'module/view?params', 'line': n}} from `export const ALIASES = {...}` in modules/registry.js."""
    src = _read('modules/registry.js')
    m = re.search(r'export\s+const\s+ALIASES\s*=\s*\{([^}]*)\}', src)
    out = {}
    if m:
        for a in re.finditer(r'''['"]([\w-]+/[\w-]+)['"]\s*:\s*['"]([^'"]+)['"]''', m.group(1)):
            out[a.group(1)] = {'target': a.group(2), 'line': src.count('\n', 0, m.start(1) + a.start()) + 1}
    return out


def audit_files():
    """Every source file the link audit reads, as paths from the repo root: the site's pages, assets/, modules/,
    redesigns/ and the backend's own Python (server/*.py, not its tests)."""
    out = set(find_pages(include_forwards=True))
    for top in ('assets', 'modules', 'redesigns'):
        for dp, dns, fns in os.walk(os.path.join(ROOT, top)):
            dns[:] = [d for d in dns if not d.startswith('.') and d != 'node_modules']
            out.update(os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, '/') for f in fns if f.endswith(AUDIT_EXT))
    sdir = os.path.join(ROOT, 'server')
    if os.path.isdir(sdir):
        out.update('server/' + f for f in os.listdir(sdir) if f.endswith('.py'))
    return sorted(out)


def _portal_link(text, i):
    """True if the '#/…' at text[i] addresses the portal: written bare (inside the portal's own code and pages) or
    straight after app.html. A hash on another page or another site ("https://example.com/#/a/b") is not ours."""
    j = i
    while j > 0 and text[j - 1] not in ' \t\r\n"\'`()<>=,;{}[]|+':
        j -= 1
    pre = text[j:i].split('?')[0]
    return not pre or pre.endswith('app.html')


def portal_view_fields():
    """(file, line, value) for every "portal_view" field in a dataset under data/."""
    for dp, dns, fns in os.walk(os.path.join(ROOT, 'data')):
        dns[:] = sorted(d for d in dns if not d.startswith('.'))
        for f in sorted(fns):
            if not f.endswith('.json'):
                continue
            path = os.path.join(dp, f)
            try:
                with open(path, 'rb') as fh:
                    raw = fh.read()
            except OSError:
                continue
            if b'"portal_view"' not in raw:
                continue
            text = raw.decode('utf-8', 'ignore')
            for m in FIELD_RX.finditer(text):
                yield os.path.relpath(path, ROOT).replace(os.sep, '/'), text.count('\n', 0, m.start()) + 1, m.group(1)


def _page_exists(ref):
    """A path from the site root names a file, or a folder with an index page."""
    p = os.path.join(ROOT, ref.lstrip('/'))
    return os.path.isfile(p) or os.path.isfile(os.path.join(p, 'index.html'))


def link_audit(routes=None, aliases=None):
    """Check every written link to a portal screen against the live routes and the forwarding table.
    Returns {'checked', 'dead', 'pending_merge', 'forwarded_links', 'dead_go_calls'}; each entry carries file and line.
      dead            a link to a screen that does not exist and is not forwarded, or a broken entry in the table (fatal)
      pending_merge   a key of the table whose old view is still live, so nothing forwards yet (fatal with --strict-aliases)
      forwarded_links links that still name a merged screen: they work through the table (listed, never fatal)
      dead_go_calls   App.go('module', 'view') calls that name no screen (listed; fatal with --strict-go)"""
    routes = set(parse_routes() if routes is None else routes)
    mods = {m for m, _ in routes}
    aliases = parse_aliases() if aliases is None else aliases
    out = {'checked': 0, 'dead': [], 'pending_merge': [], 'forwarded_links': [], 'dead_go_calls': []}

    def judge(mod, view, where, link):
        out['checked'] += 1
        if (mod, view) in routes:
            return
        if f'{mod}/{view}' in aliases:
            out['forwarded_links'].append(dict(where, link=link, to=aliases[f'{mod}/{view}']['target']))
        else:
            out['dead'].append(dict(where, link=link, why='no such screen' if mod in mods else 'no such module'))

    for rel in audit_files():
        try:
            if os.path.getsize(os.path.join(ROOT, rel)) > AUDIT_MAX_BYTES:
                continue
        except OSError:
            continue
        text = _read(rel)
        if '#/' not in text and 'pp.go(' not in text:
            continue
        where = lambda i: {'file': rel, 'line': text.count('\n', 0, i) + 1}
        for m in ROUTE_RX.finditer(text):
            if _portal_link(text, m.start()):
                judge(m.group(1), m.group(2), where(m.start()), m.group(0))
        for m in MODULE_RX.finditer(text):
            out['checked'] += 1
            if m.group(1) not in mods:
                out['dead'].append(dict(where(m.start()), link='#/' + m.group(1), why='no such module'))
        if rel.endswith(('.js', '.mjs', '.html')):
            for m in GO_RX.finditer(text):
                mod, view = m.group(1), m.group(2)
                if mod not in mods or (view and (mod, view) not in routes and f'{mod}/{view}' not in aliases):
                    out['dead_go_calls'].append(dict(where(m.start()), link=f"App.go('{mod}'" + (f", '{view}')" if view else ')'),
                                                     why='no such screen' if mod in mods else 'no such module'))

    for rel, line, value in portal_view_fields():   # "a; b; c": portal screens (#/module/view) and pages (path#anchor)
        for ref in filter(None, (r.strip() for r in value.split(';'))):
            where = {'file': rel, 'line': line}
            m = ROUTE_RX.search(ref)
            if ref.startswith('#/') or 'app.html#/' in ref:
                if m:
                    judge(m.group(1), m.group(2), where, m.group(0))
                else:
                    out['checked'] += 1
                    mod = ref.split('#/')[1].split('/')[0].split('?')[0]
                    if mod not in mods:
                        out['dead'].append(dict(where, link=ref, why='no such module'))
            elif not re.match(r'[a-z][a-z0-9+.-]*:', ref, re.I):
                out['checked'] += 1
                if not _page_exists(ref.split('#')[0].split('?')[0]):
                    out['dead'].append(dict(where, link=ref, why='no such page'))

    for key, a in aliases.items():
        where = {'file': 'modules/registry.js', 'line': a['line']}
        target = a['target'].split('?')[0]
        if tuple(target.split('/')) not in routes:
            out['dead'].append(dict(where, link=f"{key} -> {a['target']}", why='the forwarding target is not a live route'))
        elif target in aliases:
            out['dead'].append(dict(where, link=f"{key} -> {a['target']}", why='the forwarding target is itself in the forwarding table'))
        if tuple(key.split('/')) in routes:
            out['pending_merge'].append(dict(where, link=f"{key} -> {a['target']}", why='the old view is still live, so nothing forwards yet'))
    return out


def check_forwards(routes=None, aliases=None):
    """[{'page', 'target', 'errors': [text]}] for every forwarding page. Static: a forwarding page is never rendered."""
    routes = set(parse_routes() if routes is None else routes)
    mods = {m for m, _ in routes}
    aliases = parse_aliases() if aliases is None else aliases
    out = []
    for page, target in find_forwards():
        errs = []
        path, _, frag = target.partition('#')
        path = path.split('?')[0]
        if path.startswith(('./', '../')):   # relative to the page; anything else is written from the site root
            path = os.path.normpath(os.path.join(os.path.dirname(page), path)).replace(os.sep, '/')
        path = path.lstrip('/')
        if os.path.isdir(os.path.join(ROOT, path)) and path:
            path = path.rstrip('/') + '/index.html'
        if not path:
            errs.append('the target names no page')
        elif not os.path.isfile(os.path.join(ROOT, path)):
            errs.append(f'the target file does not exist: {path}')
        elif path == page:
            errs.append('the page forwards to itself')
        elif forward_target(path) is not None:
            errs.append(f'the target is itself a forwarding page: {path}')
        if frag.startswith('/') and path == 'app.html':
            mod, _, view = frag[1:].split('?')[0].partition('/')
            view = view.strip('/')
            if mod not in mods and not (view and f'{mod}/{view}' in aliases):
                errs.append(f'no such module in the portal: #/{mod}')
            elif view and (mod, view) not in routes and f'{mod}/{view}' not in aliases:
                errs.append(f'the portal has no such screen and no forward for it: #/{mod}/{view}')
        text = _read(page)
        if not re.search(r'http-equiv\s*=\s*["\']?refresh', text, re.I):
            errs.append('no meta refresh (a visitor without scripts would stay on the old page)')
        if not re.search(r'location\s*\.\s*(?:replace|assign)\s*\(|location(?:\s*\.\s*href)?\s*=[^=]', text):
            errs.append('no script that changes the location')
        if not re.search(r'<a\b[^>]*\bhref\s*=', text, re.I):
            errs.append('no plain link to the new page')
        out.append({'page': page, 'target': target, 'errors': errs})
    return out


def port_open(host, port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def start_server(port):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    class Srv(http.server.ThreadingHTTPServer):
        request_queue_size = 128   # the default backlog of 5 resets connections when a view imports many modules at once
        daemon_threads = True
    srv = Srv(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Collector:
    """errors fail the run; warnings (external hosts: 429/5xx, CORS, timeouts, dropped connections) are listed only."""
    RESOURCE_RX = re.compile(r'Failed to load resource|net::ERR_|blocked by CORS policy|CORS request did not succeed', re.I)

    def __init__(self, origin):
        self.origin, self.errors, self.warnings, self.ignored = origin, [], [], 0
        self.host = urlparse(origin).netloc

    def _external(self, url):
        n = urlparse(url).netloc if url else ''
        return bool(n) and n != self.host

    def _warn(self, kind, text, url=''):
        if url and TILE_RX.search(url): self.ignored += 1; return   # map tiles are noise, not a signal
        if any(w['text'] == text[:300] for w in self.warnings): return   # retries log the same line twice
        self.warnings.append({'kind': kind, 'text': text[:300], 'url': url})

    def on_console(self, msg):
        if msg.type != 'error': return
        loc = (msg.location or {}).get('url', '') if isinstance(msg.location, dict) else ''
        text = msg.text
        if any(rx.search(text) for rx in IGNORE_TEXT): self.ignored += 1; return
        if self.RESOURCE_RX.search(text):
            # the failing resource is the console location, or the first URL in the message (CORS, net::ERR_*)
            urls = [loc] + URL_RX.findall(text) if 'Failed to load resource' in text else URL_RX.findall(text) + [loc]
            target = next((u for u in urls if u and u.startswith('http')), '')
            if target and self._external(target): self._warn('external', text, target); return
            if not target and not loc: self._warn('external', text); return   # resource errors with no url are external fetches
        self.errors.append({'kind': 'console', 'text': text[:500], 'url': loc})

    def on_pageerror(self, err):
        text = str(err)
        if any(rx.search(text) for rx in IGNORE_TEXT): self.ignored += 1; return
        self.errors.append({'kind': 'pageerror', 'text': text[:500]})

    def on_response(self, resp):
        if resp.status < 400 or TILE_RX.search(resp.url): return
        if not self._external(resp.url):
            self.errors.append({'kind': 'http', 'text': f'{resp.status} {resp.url}'})
        elif resp.status == 429 or resp.status >= 500:
            self._warn('external', f'{resp.status} {resp.url}', resp.url)

    def on_requestfailed(self, req):
        if not self._external(req.url): return   # a local request that never completes surfaces as a console or http error
        f = req.failure
        reason = (f.get('errorText') if isinstance(f, dict) else f) or 'failed'
        if 'ERR_ABORTED' in str(reason): return   # our own 6 s timeout or a navigation, not an upstream failure
        self._warn('external', f'{reason} {req.url}', req.url)


# One role per level (data/agent/catalog.json ids), and what its menu must hold (OS_SPEC 3): 'must' items are always
# there, 'may' items only once their screen exists (each company's Plan and Tools are built in their own lane).
LEVEL_ROLES = [('firm_leadership', 'bsp-managing-partner'), ('firm_team', 'bsp-investor-relations'),
               ('co_leadership', 'pp-ceo'), ('co_office', 'pp-dispatcher'), ('co_field', 'pp-hvac-technician')]
LEVEL_MENU = {
    'bsp-managing-partner': {'must': ['home', 'cet', 'pp', 'fl', 'ts', 'bpi', 'fh', 'ma', 'deal', 'pe', 'bsp', 'signals', 'fin', 'techos', 'connect'], 'may': []},
    'bsp-investor-relations': {'must': ['home', 'fin', 'connect'], 'may': []},
    'pp-ceo': {'must': ['home', 'pp', 'ma/pipeline', 'signals/overview', 'connect'], 'may': ['pp/plan', 'pp/tools']},
    'pp-dispatcher': {'must': ['home', 'pp', 'connect'], 'may': ['pp/tools']},
    'pp-hvac-technician': {'must': ['home'], 'may': []},
}


def attach(page, col):
    page.on('console', col.on_console)
    page.on('pageerror', col.on_pageerror)
    page.on('response', col.on_response)
    page.on('requestfailed', col.on_requestfailed)


async def check_page(ctx, base, path, settle, sem):
    async with sem:
        page = await ctx.new_page(); col = Collector(base); attach(page, col); t0 = time.time()
        try:
            await page.goto(f'{base}/{path}', wait_until='load', timeout=45000)
            await page.wait_for_timeout(settle)
        except Exception as e:
            col.errors.append({'kind': 'navigation', 'text': str(e)[:300]})
        finally:
            await page.close()
        return {'target': path, 'errors': col.errors, 'warnings': col.warnings, 'ignored': col.ignored, 'seconds': round(time.time() - t0, 1)}


async def check_aliases(page, col, aliases, live):
    """The forwarding table in the browser: the portal must have loaded the same table the audit parsed, and every key
    whose old view is gone must land on its target with its own parameters kept. A key whose view is still live is a
    pending merge: the old screen opens as before, so there is nothing to follow yet."""
    results = []
    n0 = len(col.errors); t0 = time.time()
    loaded = await page.evaluate('() => (window.BSP.App.aliases ? { ...window.BSP.App.aliases } : null)')
    parsed = {k: a['target'] for k, a in aliases.items()}
    if (loaded or {}) != parsed:
        col.errors.append({'kind': 'forwarding table', 'text': f'modules/registry.js lists {len(parsed)} forwards but the portal loaded {len(loaded or {})}: '
                           f'{sorted(set(parsed.items()) ^ set((loaded or {}).items()))[:6]}'})
        results.append({'target': 'app.html (forwarding table)', 'errors': col.errors[n0:], 'warnings': [], 'ignored': 0, 'seconds': round(time.time() - t0, 1)})
    for key, target in parsed.items():
        if key.split('/') in live:
            continue
        n0, w0 = len(col.errors), len(col.warnings); t0 = time.time()
        path, _, query = target.partition('?')
        tm, tv = path.split('/')
        try:
            await page.evaluate('h => { location.hash = h; }', f'#/{key}?ci_probe=1')
            # wait for the address to change too: two keys in a row can share a target, and the screen is then already the right one
            await page.wait_for_function(
                "([m, v, old]) => !location.hash.includes('#/' + old) && window.BSP.App.current && window.BSP.App.current.id === m && window.BSP.App.view && window.BSP.App.view.id === v && !document.querySelector('#content > .loading')",
                arg=[tm, tv, key], timeout=30000)
            got = await page.evaluate('() => location.hash')
            want = [f'#/{path}', 'ci_probe=1'] + [p for p in query.split('&') if p]
            miss = [w for w in want if w not in got]
            if miss or key in got:
                col.errors.append({'kind': 'forward', 'text': f'#/{key} landed on {got}; expected {" and ".join(want)} in the address'})
        except Exception as e:
            col.errors.append({'kind': 'forward', 'text': f'#/{key} did not reach #/{path}: {str(e)[:200]}'})
        results.append({'target': f'app.html#/{key} (forwards to #/{target})', 'errors': col.errors[n0:], 'warnings': col.warnings[w0:], 'ignored': 0, 'seconds': round(time.time() - t0, 1)})
    return results


async def check_routes(ctx, base, routes, settle, aliases=None):
    """One app instance; navigate by hash so each route renders exactly as a user would reach it."""
    page = await ctx.new_page(); col = Collector(base); attach(page, col); results = []
    await page.goto(f'{base}/app.html?role=bsp-managing-partner#/{routes[0][0]}/{routes[0][1]}', wait_until='load', timeout=45000)
    await page.wait_for_function('() => window.BSP && window.BSP.App && window.BSP.App.modules.length > 0', timeout=30000)
    live = await page.evaluate('() => window.BSP.App.modules.flatMap(m => m.views.map(v => [m.id, v.id]))')
    missing = [r for r in map(tuple, live) if r not in routes]
    for mid, vid in routes + missing:
        n0, w0 = len(col.errors), len(col.warnings); t0 = time.time()
        try:
            await page.evaluate('h => { if (location.hash !== h) location.hash = h; }', f'#/{mid}/{vid}')
            await page.wait_for_function(
                "([m, v]) => window.BSP.App.current && window.BSP.App.current.id === m && window.BSP.App.view && window.BSP.App.view.id === v && !document.querySelector('#content > .loading')",
                arg=[mid, vid], timeout=30000)
            await page.wait_for_timeout(settle)
            failed = await page.evaluate("() => { const e = document.querySelector('#content .empty'); return e && /This (?:screen|view) failed to (?:load|render)/i.test(e.textContent) ? e.textContent.trim() : null; }")   # the shell's own failure text (assets/core.js App.route)
            if failed: col.errors.append({'kind': 'render', 'text': failed[:300]})
        except Exception as e:
            col.errors.append({'kind': 'navigation', 'text': str(e)[:300]})
        results.append({'target': f'app.html#/{mid}/{vid}', 'errors': col.errors[n0:], 'warnings': col.warnings[w0:], 'ignored': 0, 'seconds': round(time.time() - t0, 1)})
    forwarded = await check_aliases(page, col, aliases, live) if aliases is not None else []
    await page.close()
    unknown = [f'{m}/{v}' for m, v in routes if [m, v] not in live]
    return results, unknown, forwarded


async def check_levels(browser, base, settle):
    """Each level in its own browser context, its role stored before the page loads (assets/session.js reads
    localStorage 'bsp-agent-role'). Returns one result row per menu item and one per level for the menu and the
    hidden-screen redirect."""
    results = []
    for level, rid in LEVEL_ROLES:
        ctx = await browser.new_context(viewport={'width': 1440, 'height': 900}, service_workers='block')
        await ctx.add_init_script("try { localStorage.setItem('bsp-ci', '1'); localStorage.setItem('bsp-agent-role', JSON.stringify(%s)); } catch (e) {}" % json.dumps(rid))
        page = await ctx.new_page(); col = Collector(base); attach(page, col)
        n0, w0, t0 = 0, 0, time.time()
        label = f'level {level} as {rid}'
        try:
            await page.goto(f'{base}/app.html#/home/overview', wait_until='load', timeout=45000)
            await page.wait_for_function("() => window.BSP && window.BSP.App.current && window.BSPSession && window.BSPSession.catalog() && !document.querySelector('#content > .loading')", timeout=30000)
            got = await page.evaluate('() => ({ id: BSPSession.role().id, level: BSPSession.level() })')
            if got != {'id': rid, 'level': level}:
                col.errors.append({'kind': 'level', 'text': f'viewing as {got}, expected {rid} at {level}'})
            menu = await page.evaluate("() => [...document.querySelectorAll('#rail .rail-item')].map(a => ({ key: a.dataset.k, href: a.getAttribute('href'), label: a.textContent.trim() }))")
            keys = [m['key'] for m in menu]
            want = LEVEL_MENU.get(rid, {'must': [], 'may': []})
            missing = [k for k in want['must'] if k not in keys]
            extra = [k for k in keys if k not in want['must'] + want['may']]
            if missing or extra:
                col.errors.append({'kind': 'menu', 'text': f'menu {keys}: missing {missing}, not expected {extra}'})
            if await page.evaluate("() => !!document.querySelector('#rail .rail-foot a[href]:not([hidden])')") != (level in ('firm_leadership', 'firm_team')):
                col.errors.append({'kind': 'menu', 'text': '"All views" must show for the firm levels only'})
            # a screen this level does not have: the first registered one it cannot open
            hidden = await page.evaluate("() => { for (const m of BSP.App.modules) for (const v of m.views) if (!BSP.App.can(m.id, v.id)) return `#/${m.id}/${v.id}`; return null; }")
            if level == 'firm_leadership' and hidden:
                col.errors.append({'kind': 'level', 'text': f'the managing partner cannot open {hidden}'})
            if hidden:
                await page.evaluate("h => { document.querySelectorAll('.toast').forEach(t => t.remove()); location.hash = h; }", hidden)
                try:
                    await page.wait_for_function("() => location.hash === '#/home/overview' && BSP.App.current.id === 'home' && BSP.App.view.id === 'overview' && [...document.querySelectorAll('.toast')].some(t => t.textContent.trim() === 'Not in this view.')", timeout=15000)
                except Exception:
                    now = await page.evaluate("() => location.hash + ' | ' + [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' / ')")
                    col.errors.append({'kind': 'redirect', 'text': f'{hidden} did not go home with "Not in this view.": {now}'})
        except Exception as e:
            col.errors.append({'kind': 'navigation', 'text': str(e)[:300]}); menu = []; hidden = None
        results.append({'target': f'{label}: menu {", ".join(m["label"] for m in menu)}' + (f'; {hidden} goes home' if hidden else ''), 'errors': col.errors[n0:], 'warnings': col.warnings[w0:], 'ignored': 0, 'seconds': round(time.time() - t0, 1)})
        for m in menu:
            n0, w0, t0 = len(col.errors), len(col.warnings), time.time()
            try:
                await page.evaluate("h => { document.querySelectorAll('.toast').forEach(t => t.remove()); if (location.hash === h) location.hash = '#/home/overview'; }", m['href'])
                await page.wait_for_timeout(50)
                await page.evaluate("h => { location.hash = h; }", m['href'])
                mod, _, rest = m['href'][2:].partition('/')
                view = rest.split('?')[0]
                await page.wait_for_function(
                    "([m, v]) => window.BSP.App.current && window.BSP.App.current.id === m && window.BSP.App.view && window.BSP.App.view.id === v && !document.querySelector('#content > .loading')",
                    arg=[mod, view], timeout=30000)
                await page.wait_for_timeout(settle)
                state = await page.evaluate("() => ({ hash: location.hash, denied: [...document.querySelectorAll('.toast')].some(t => t.textContent.trim() === 'Not in this view.'), failed: (document.querySelector('#content .empty') || {}).textContent || '' })")
                # the screen may add its own parameters (deal/returns?p=typical); the item's own must all be there
                want_path, _, want_q = m['href'].partition('?')
                got_path, _, got_q = state['hash'].partition('?')
                if state['denied'] or got_path != want_path or not set(filter(None, want_q.split('&'))) <= set(got_q.split('&')):
                    col.errors.append({'kind': 'menu item', 'text': f"{m['href']} landed on {state['hash']}{' with Not in this view.' if state['denied'] else ''}"})
                if re.search(r'This (?:screen|view) failed to (?:load|render)', state['failed'], re.I):
                    col.errors.append({'kind': 'render', 'text': state['failed'][:300]})
            except Exception as e:
                col.errors.append({'kind': 'navigation', 'text': str(e)[:300]})
            results.append({'target': f"{label}: {m['label']} ({m['href']})", 'errors': col.errors[n0:], 'warnings': col.warnings[w0:], 'ignored': 0, 'seconds': round(time.time() - t0, 1)})
        await ctx.close()
    return results


def static_checks(args, routes):
    """The forwarding pages and the link audit: ([result rows for the report], the audit, the forwarding table)."""
    aliases = parse_aliases()
    audit = link_audit(routes, aliases)
    rows = [{'target': f"{f['page']} (forwards to {f['target']})", 'errors': [{'kind': 'forward', 'text': e} for e in f['errors']], 'warnings': [], 'ignored': 0, 'seconds': 0}
            for f in check_forwards(routes, aliases)]
    fatal = list(audit['dead'])
    if args.strict_aliases: fatal += audit['pending_merge']
    if args.strict_go: fatal += audit['dead_go_calls']
    audit['fatal'] = fatal
    return rows, audit, aliases


def print_audit(audit, n_forwards):
    loc = lambda e: f"{e['file']}:{e['line']}"
    print(f"ci_check: link audit: {audit['checked']} links to portal screens read, {len(audit['dead'])} dead, {len(audit['forwarded_links'])} through a forward, "
          f"{len(audit['pending_merge'])} pending merge" + (f', {n_forwards} forwarding page(s)' if n_forwards else ''))
    fatal = {id(e) for e in audit['fatal']}
    for e in audit['dead']:
        print(f"  FAIL  dead link  {loc(e)}  {e['link']}  ({e['why']})")
    for e in audit['dead_go_calls']:
        print(f"  {'FAIL' if id(e) in fatal else 'warn'}  dead call  {loc(e)}  {e['link']}  ({e['why']})")
    for e in audit['pending_merge']:
        print(f"  {'FAIL' if id(e) in fatal else 'note'}  pending merge  {loc(e)}  {e['link']}")


async def run(args):
    all_routes = parse_routes()
    pages, routes = find_pages(), all_routes
    forward_rows, audit, aliases = static_checks(args, all_routes)
    if args.only:
        pages = [p for p in pages if args.only in p]; routes = [r for r in routes if args.only in f'{r[0]}/{r[1]}']
    if args.links_only or args.levels_only:
        pages, routes = [], []
    print(f'ci_check: {len(pages)} pages, {len(routes)} app routes -> {args.base}')
    print_audit(audit, len(forward_rows))
    if args.links_only:
        for r in forward_rows:
            print(f"  {'ok  ' if not r['errors'] else 'FAIL'}  {r['target']}")
            for e in r['errors']: print(f"        {e['kind']}: {e['text'][:220]}")
        bad = len(audit['fatal']) + sum(1 for r in forward_rows if r['errors'])
        print(f"ci_check: {'PASS' if not bad else 'FAIL'} - link audit only (no page was opened)")
        return 0 if not bad else 1
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await browser.new_context(viewport={'width': 1440, 'height': 900}, service_workers='block')
        await ctx.add_init_script("try { localStorage.setItem('bsp-ci', '1'); } catch (e) {}")
        sem = asyncio.Semaphore(args.concurrency)
        page_results = await asyncio.gather(*[check_page(ctx, args.base, p, args.settle, sem) for p in pages])
        # the forwarding table is followed in the browser on a full run only (a filtered run may not load the portal at all)
        route_results, unknown, forwarded = (await check_routes(ctx, args.base, routes, args.route_settle, None if args.only else aliases)) if routes else ([], [], [])
        # the five levels: on a full run, or with --levels-only
        level_results = await check_levels(browser, args.base, args.route_settle) if (not args.only and not args.no_levels) or args.levels_only else []
        # one retry for failing standalone pages: a deterministic error reproduces; a timing flake is reported but not fatal
        page_results = list(page_results)
        for _ in range(args.retries):
            for i, r in enumerate(page_results):
                if r['errors']:
                    again = await check_page(ctx, args.base, r['target'], args.settle * 2, sem)
                    if not again['errors']:
                        again['flaky_first_run'] = r['errors']; page_results[i] = again
        await browser.close()
    results = page_results + route_results    # the pages and app routes, counted as before
    extra = forwarded + forward_rows + level_results   # old addresses, forwarding pages read from disk, and the five levels
    flaky = [r['target'] for r in results if r.get('flaky_first_run')]
    bad = [r for r in results + extra if r['errors']]
    warned = [r for r in results + extra if r.get('warnings')]
    ok = not bad and not audit['fatal']
    fatal = {id(e) for e in audit['fatal']}
    summary = {'base': args.base, 'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'pages': len(pages), 'routes': len(route_results),
               'failed': len(bad), 'ok': ok, 'warned': len(warned), 'flaky_passed_on_retry': flaky, 'routes_parsed_but_not_registered': unknown, 'results': results,
               'forwards': extra, 'link_audit': {k: audit[k] for k in ('checked', 'dead', 'pending_merge', 'forwarded_links', 'dead_go_calls')}, 'link_audit_failures': len(audit['fatal'])}
    os.makedirs(args.out, exist_ok=True)
    json.dump(summary, open(os.path.join(args.out, 'ci_summary.json'), 'w'), indent=1)
    md = [f"# Pages check: {'PASS' if ok else 'FAIL'}", '', f"{len(pages)} pages and {len(route_results)} app routes checked; {len(bad)} with errors, {len(warned)} with external-host warnings (not failing).", '']
    if unknown: md += [f"Routes in modules/*.js not registered at runtime: {', '.join(unknown)}", '']
    if flaky: md += [f"Passed on retry (first run had errors): {', '.join(flaky)}", '']
    md += ['| Target | Result | Time |', '|---|---|---|']
    for r in results + extra:
        res = 'ok' if not r['errors'] else str(len(r['errors'])) + ' error(s)'
        if r.get('warnings'): res += f" · {len(r['warnings'])} warning(s)"
        md.append(f"| `{r['target']}` | {res} | {r['seconds']}s |")
    for r in bad:
        md += ['', f"## {r['target']}"] + [f"- **{e['kind']}**: {e['text']}" for e in r['errors'][:20]]
    if warned:
        md += ['', '## Warnings: external hosts (not failing)', '']
        for r in warned:
            md += [f"- `{r['target']}`: {w['text']}" for w in r['warnings'][:10]]
    loc = lambda e: f"`{e['file']}:{e['line']}`"
    md += ['', f"## Link audit: {'FAIL' if audit['fatal'] else 'ok'}", '',
           f"{audit['checked']} written links to portal screens read. {len(audit['dead'])} dead, {len(audit['forwarded_links'])} through a forward, "
           f"{len(audit['pending_merge'])} pending merge, {len(extra)} forward(s) checked."]
    if audit['dead']:
        md += ['', '### Dead links (failing)', ''] + [f"- {loc(e)} `{e['link']}`: {e['why']}" for e in audit['dead']]
    if audit['dead_go_calls']:
        md += ['', f"### App.go calls that name no screen ({'failing' if args.strict_go else 'not failing; --strict-go makes them fail'})", ''] + [f"- {loc(e)} `{e['link']}`: {e['why']}" for e in audit['dead_go_calls']]
    if audit['pending_merge']:
        md += ['', f"### Pending merges ({'failing: --strict-aliases' if args.strict_aliases else 'not failing'})", '',
               'The forwarding table names these, but the old view is still live, so the old address opens the old screen.', ''] + [f"- `{e['link']}`" for e in audit['pending_merge']]
    if audit['forwarded_links']:
        md += ['', '### Links that still name a merged screen (they forward; not failing)', ''] + [f"- {loc(e)} `{e['link']}` lands on `#/{e['to']}`" for e in audit['forwarded_links']]
    open(os.path.join(args.out, 'ci_summary.md'), 'w').write('\n'.join(md) + '\n')
    for r in results + extra:
        print(f"  {'ok  ' if not r['errors'] else 'FAIL'}  {r['target']}  ({r['seconds']}s){'  [flaky: passed on retry]' if r.get('flaky_first_run') else ''}")
        for e in r['errors'][:8]:
            print(f"        {e['kind']}: {e['text'][:220]}")
        for w in (r.get('warnings') or [])[:4]:
            print(f"        warning (external): {w['text'][:200]}")
    n_bad = sum(1 for r in results if r['errors'])
    tail = f"; {len(extra) - sum(1 for r in extra if r['errors'])}/{len(extra)} forwards clean" if extra else ''
    print(f"ci_check: {'PASS' if ok else 'FAIL'} - {len(results) - n_bad}/{len(results)} clean, {len(warned)} with external-host warnings{tail}; "
          f"link audit: {len(audit['fatal'])} failing, {len(audit['pending_merge'])} pending merge. Summary: {os.path.join(args.out, 'ci_summary.md')}")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--base', default='http://127.0.0.1:8765')
    ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'bsp-ci-report'))
    ap.add_argument('--settle', type=int, default=2500, help='ms to wait after load on each page')
    ap.add_argument('--route-settle', type=int, default=1200, help='ms to wait after each app route renders')
    ap.add_argument('--concurrency', type=int, default=4)
    ap.add_argument('--retries', type=int, default=1, help='re-check a failing standalone page this many times')
    ap.add_argument('--only', default='', help='substring filter for pages/routes')
    ap.add_argument('--links-only', action='store_true', help='run the link audit and the forwarding-page checks only: no browser')
    ap.add_argument('--levels-only', action='store_true', help='run the five-level check only (and the link audit)')
    ap.add_argument('--no-levels', action='store_true', help='skip the five-level check')
    ap.add_argument('--strict-aliases', action='store_true', help='fail when a key of the forwarding table is still a live route (a pending merge)')
    ap.add_argument('--strict-go', action='store_true', help="fail on an App.go('module', 'view') call that names no screen")
    args = ap.parse_args()
    u = urlparse(args.base)
    srv = None
    if not args.links_only and u.hostname in ('127.0.0.1', 'localhost') and not port_open(u.hostname, u.port or 80):
        srv = start_server(u.port or 80); print(f'ci_check: started static server on {args.base}')
    try:
        return asyncio.run(run(args))
    finally:
        if srv: srv.shutdown()


if __name__ == '__main__':
    sys.exit(main())
