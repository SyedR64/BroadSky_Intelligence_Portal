#!/usr/bin/env python3
"""Build the knowledge base behind the BSP Desk assistant.

  python3 scripts/build_corpus.py                       # collect every source, then index
  python3 scripts/build_corpus.py --only firm,news      # re-collect some sources; the rest come from corpus.jsonl
  python3 scripts/build_corpus.py --index-only          # rebuild server/knowledge/kb.sqlite from corpus.jsonl
  python3 scripts/build_corpus.py --refresh             # ignore the fetch cache (.cache/corpus)

Collect writes server/knowledge/corpus.jsonl, one document per line:
  {key, source, kind, title, url, publisher, date, companies, text}
Sources:
  firm       broadskypartners.com through its public WordPress JSON: pages, team bios, investments, news
  cited      every web page the portal's research files cite (press releases, Form D filings, company pages,
             trade press), fetched and reduced to its main text
  companies  each portfolio company's own site: home page plus same-site pages about the company, its people,
             services, locations and news (capped per site)
  news       Bing News and Google News RSS for the firm, its people and each portfolio company
  wiki       Wikipedia articles for the firm's companies and deal counterparties, where one exists
  portal     the portal itself: every page and app route rendered in headless Chromium (visible text), the
             research files (summaries and items) and the prepared answers

Index chunks each document (about 1,100 characters, paragraph and sentence aligned, titled), embeds every chunk
with a static embedding model (token vectors averaged, then normalised; numpy alone at query time) and writes
server/knowledge/kb.sqlite: docs, chunks, an FTS5 index (BM25, Porter stemming), the chunk vectors, the token
vectors and the tokenizer. server/knowledge.py reads that file; nothing else is needed at query time.

Build-time packages: trafilatura (main-text extraction), model2vec (downloads the embedding model once),
playwright (portal pages). The fetcher honours robots.txt and spaces requests to each host.
Author: Syed Rahman.
"""
import argparse, concurrent.futures, datetime as dt, gzip, hashlib, html, io, json, os, re, sqlite3, sys, threading, time
import urllib.error, urllib.parse, urllib.request, urllib.robotparser
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'server', 'knowledge')
CORPUS = os.path.join(OUT_DIR, 'corpus.jsonl')
KB = os.path.join(OUT_DIR, 'kb.sqlite')
CACHE = os.path.join(ROOT, '.cache', 'corpus')
SITE = 'https://syedr64.github.io/BroadSky_Intelligence_Portal/'
UA = 'Mozilla/5.0 (compatible; BSPDeskCorpus/1.0; +https://github.com/SyedR64/BroadSky_Intelligence_Portal)'
EMBED_MODEL = 'minishlab/potion-base-8M'
MAX_BYTES = 4_000_000
CHUNK_CHARS, CHUNK_MAX_PER_DOC = 1100, 80
ALL_SOURCES = ['firm', 'cited', 'companies', 'news', 'wiki', 'portal']

COMPANIES = {   # company code -> how documents name it (used to tag documents)
    'bsp': r'Broad\s*Sky|\bBSP\b|Tyler Zachem',
    'pp': r'Punctual Pros',
    'cet': r'Commonwealth Electrical|\bCET\b|Horton Electrical|NuWave',
    'fl': r'Frontline Managed|\bFrontline\b',
    'ts': r'Thomas Scientific',
    'bpi': r'Bully Pulpit',
    'fh': r'Fair Harbor',
    'sh': r'Smith\s*\+\s*Howard|Smith and Howard',
}
COMPANY_SITES = {   # portfolio company sites crawled from their home page
    'cet': 'https://comelectrical.com/',
    'fl': 'https://www.frontlinems.com/',
    'ts': 'https://www.thomassci.com/',
    'bpi': 'https://bpigroup.com/',
    'fh': 'https://fairharborclothing.com/',
    'sh': 'https://www.smith-howard.com/',
    'pp': 'https://www.onehourheatandair.com/southeast-pennsylvania/',
}
COMPANY_PAGE_RX = re.compile(r'about|leader|team|people|management|company|who-we-are|history|story|service|solution|industr|capabilit|location|news|press|careers|mission|values|sustainab|market|what-we-do|our-work|expertise|offices', re.I)
NEWS_QUERIES = [
    '"Broad Sky Partners"', '"Tyler Zachem"', '"Broad Sky" private equity', '"Punctual Pros"', '"Commonwealth Electrical Technologies"',
    '"Horton Electrical Services"', '"NuWave Energy Solutions"', '"Frontline Managed Services"', '"Thomas Scientific"',
    '"Bully Pulpit International"', '"Bully Pulpit Interactive"', '"Fair Harbor" clothing', '"Smith + Howard" TPG',
]
WIKI_TITLES = ['Bully Pulpit Interactive', 'Thomas Scientific', 'Authority Brands', 'The Carlyle Group', 'TPG Inc.', 'Capital Constellation',
               'Wafra', 'BV Investment Partners', 'Fair Harbor (clothing)']
# Cited URLs that are data endpoints, app shells, logins or listings rather than readable pages.
SKIP_HOST_RX = re.compile(r'(^|\.)(api\.[\w.-]+|echo\.epa\.gov|echodata\.epa\.gov|usaspending\.gov|ncei\.noaa\.gov|weather\.gov|nominatim\.openstreetmap\.org|'
                          r'censusreporter\.org|data\.sec\.gov|efts\.sec\.gov|commbuys\.com|bostonplans\.org|bidnetdirect\.com|linkedin\.com|yelp\.com|'
                          r'facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|google\.com|maps\.google\.com|bing\.com|data\.ct\.gov|'
                          r'open-meteo\.com|arcgis\.com|socrata\.com|opendata\.[\w.-]+|tile\.[\w.-]+|cartocdn\.com|unpkg\.com|cdnjs\.cloudflare\.com|'
                          r'jsdelivr\.net|fonts\.googleapis\.com|github\.com|githubusercontent\.com|courtlistener\.com|find-and-update\.company-information\.service\.gov\.uk|'
                          r'mimecastprotect\.com|createsend\.com|urldefense\.proofpoint\.com|axios\.com)$', re.I)
SKIP_PATH_RX = re.compile(r'\.(json|csv|zip|xlsx?|geojson|png|jpe?g|gif|svg|webp|mp4|mp3|txt)(\?|$)|/api/|[?&](format|f)=(json|csv)|sitemap[^/]*\.xml|/feed/?$', re.I)
MAX_DOC_CHARS = 60000   # longer documents (Form ADV PDFs, annual reports) keep their first 60,000 characters

# ── Utilities ───────────────────────────────────────────────────────────────
def log(*a):
    print(*a, file=sys.stderr, flush=True)


def norm_ws(s):
    s = re.sub(r'[ \t ]+', ' ', s or '')
    s = re.sub(r' *\n *', '\n', s)
    return re.sub(r'\n{3,}', '\n\n', s).strip()


def strip_tags(s):
    s = re.sub(r'<(script|style|noscript)[\s\S]*?</\1>', ' ', s or '', flags=re.I)
    s = re.sub(r'<br\s*/?>|</(p|div|li|h\d|tr|section|article)>', '\n', s, flags=re.I)
    return norm_ws(html.unescape(re.sub(r'<[^>]+>', ' ', s)))


def companies_in(text):
    return [k for k, rx in COMPANIES.items() if re.search(rx, text or '')]


def iso_date(s):
    if not s:
        return ''
    s = str(s).strip()
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return m.group(0)
    for fmt in ('%a, %d %b %Y %H:%M:%S %Z', '%a, %d %b %Y %H:%M:%S %z', '%B %d, %Y', '%b %d, %Y'):
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return ''


def host_of(url):
    return urllib.parse.urlsplit(url).netloc.lower().removeprefix('www.')


def doc(source, kind, title, url, text, publisher='', date='', key=None, companies=None):
    text = norm_ws(text)
    if len(text) > MAX_DOC_CHARS and source != 'portal':
        text = text[:MAX_DOC_CHARS].rsplit('\n', 1)[0] + '\n[…]'
    title = norm_ws(title)[:300] or (url or 'Untitled')
    return {'key': key or hashlib.sha1(f'{source}|{kind}|{url}|{title}'.encode()).hexdigest()[:16], 'source': source, 'kind': kind, 'title': title,
            'url': url or '', 'publisher': publisher or (host_of(url) if url else ''), 'date': iso_date(date),
            'companies': companies if companies is not None else companies_in(f'{title}\n{text}'), 'text': text}


# ── Polite cached fetcher ───────────────────────────────────────────────────
class Fetcher:
    def __init__(self, refresh=False, min_gap=1.0):
        self.refresh, self.min_gap = refresh, min_gap
        self.lock, self.last, self.robots, self.host_locks = threading.Lock(), {}, {}, {}
        os.makedirs(CACHE, exist_ok=True)

    def _host_lock(self, host):
        with self.lock:
            return self.host_locks.setdefault(host, threading.Lock())

    def _allowed(self, url):
        parts = urllib.parse.urlsplit(url)
        base = f'{parts.scheme}://{parts.netloc}'
        with self.lock:
            rp = self.robots.get(base)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            try:
                body = self._raw(base + '/robots.txt', 'text/plain', timeout=15)[0]
                rp.parse(body.decode('utf-8', 'replace').splitlines())
            except Exception:
                rp.parse([])   # no robots.txt (or unreachable): allowed
            with self.lock:
                self.robots[base] = rp
        return rp.can_fetch('BSPDeskCorpus', url) and rp.can_fetch(UA, url)

    def _raw(self, url, accept, timeout=25, data=None, headers=None):
        h = {'User-Agent': UA, 'Accept': accept, 'Accept-Encoding': 'gzip', 'Accept-Language': 'en-US,en;q=0.8'}
        h.update(headers or {})
        req = urllib.request.Request(url, data=data, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('too large')
            enc = (r.headers.get('Content-Encoding') or '').lower().strip()
            if enc == 'gzip' or raw[:2] == b'\x1f\x8b':
                raw = gzip.decompress(raw)
            elif enc not in ('', 'identity'):
                raise UnicodeError(f'unsupported content encoding {enc}')
            return raw, r.headers.get('Content-Type') or '', r.geturl(), r.status

    def get(self, url, accept='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', data=None, headers=None, robots=True, max_age_days=180):
        key = hashlib.sha1((url + ('|' + hashlib.sha1(data).hexdigest() if data else '')).encode()).hexdigest()
        path = os.path.join(CACHE, key + '.json')
        fresh = os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_days * 86400
        if not self.refresh and fresh:
            try:
                return json.load(open(path, encoding='utf-8'))
            except ValueError:
                pass
        res = {'url': url, 'ok': False, 'status': 0, 'final': url, 'ctype': '', 'body': '', 'error': ''}
        try:
            if robots and not self._allowed(url):
                res['error'] = 'robots.txt disallows'
            else:
                host = host_of(url)
                with self._host_lock(host):
                    wait = self.last.get(host, 0) + self.min_gap - time.time()
                    if wait > 0:
                        time.sleep(wait)
                    try:
                        try:
                            raw, ctype, final, status = self._raw(url, accept, data=data, headers=headers)
                        except UnicodeError:   # a compressed body we cannot decode (some CDNs ignore Accept-Encoding): ask for it plain
                            raw, ctype, final, status = self._raw(url, accept, data=data, headers={**(headers or {}), 'Accept-Encoding': 'identity'})
                    finally:
                        self.last[host] = time.time()
                charset = (re.search(r'charset=([\w-]+)', ctype) or [None, 'utf-8'])[1]
                try:
                    body = raw.decode(charset, 'replace')
                except LookupError:
                    body = raw.decode('utf-8', 'replace')
                if 'pdf' in ctype.lower() or raw[:5] == b'%PDF-':
                    body = pdf_text(raw)
                    ctype = 'application/pdf'
                if 'pdf' not in ctype and body.count('\ufffd') > max(20, len(body) // 100):
                    raise UnicodeError('body did not decode as text')
                res.update(ok=True, status=status, final=final, ctype=ctype, body=body)
        except urllib.error.HTTPError as e:
            res.update(status=e.code, error=f'HTTP {e.code}')
        except Exception as e:
            res['error'] = f'{type(e).__name__}: {str(e)[:160]}'
        if res['ok'] or res['status'] in (403, 404, 410, 451) or 'robots' in res['error']:
            json.dump(res, open(path, 'w', encoding='utf-8'))
        return res


def pdf_text(raw):
    try:
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(raw))
        return '\n\n'.join((p.extract_text() or '') for p in r.pages[:40])
    except Exception:
        return ''


def extract(res):
    """(title, text, date, sitename) from a fetched page; XML filings are flattened to 'field: value' lines."""
    body, url, ctype = res['body'], res['final'] or res['url'], res['ctype'].lower()
    if 'pdf' in ctype:
        return '', body, '', ''
    if 'xml' in ctype and not re.search(r'<html', body[:2000], re.I):
        return xml_text(body, url)
    try:
        import trafilatura
        text = trafilatura.extract(body, url=url, include_comments=False, include_tables=True, favor_recall=True) or ''
        md = trafilatura.extract_metadata(body, default_url=url)
        title = (md.title if md else '') or ''
        if not title:
            t = re.search(r'<title[^>]*>([\s\S]*?)</title>', body, re.I)
            title = strip_tags(t.group(1)) if t else ''
        return title, text, (md.date if md else '') or '', (md.sitename if md else '') or ''
    except ImportError:
        t = re.search(r'<title[^>]*>([\s\S]*?)</title>', body, re.I)
        main = re.search(r'<(main|article)[\s\S]*?</\1>', body, re.I)
        return strip_tags(t.group(1)) if t else '', strip_tags(main.group(0) if main else body), '', ''


def xml_text(body, url):
    try:
        root = ET.fromstring(body.encode('utf-8', 'replace'))
    except ET.ParseError:
        return '', strip_tags(body), '', ''
    lines = []

    def walk(el, path):
        tag = re.sub(r'^\{.*\}', '', el.tag)
        kids = list(el)
        if not kids and (el.text or '').strip():
            label = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', tag).replace('_', ' ').strip()
            lines.append(f'{label}: {el.text.strip()}')
        for k in kids:
            walk(k, path + [tag])
    walk(root, [])
    text = '\n'.join(lines)
    title = ''
    m = re.search(r'entityName: (.+)', text)
    if m:
        kind = re.search(r'submission Type: (.+)', text)
        title = f"{kind.group(1) if kind else 'SEC filing'}: {m.group(1)}"
    return title, text, '', 'sec.gov' if 'sec.gov' in url else ''


# ── Sources ─────────────────────────────────────────────────────────────────
def firm_page_text(r):
    """The firm's pages are short and list people in layout blocks that main-text extraction drops, so keep the whole
    visible page (minus header, footer and navigation) when it says noticeably more."""
    text = extract(r)[1]
    full = strip_tags(re.sub(r'<(header|footer|nav)[\s\S]*?</\1>', ' ', r['body'], flags=re.I))
    return full if len(full) > 1.3 * len(text) else text


def src_firm(F):
    """broadskypartners.com: WordPress pages, team bios and investments, plus the press links on its News page."""
    out, links = [], []
    base = 'https://broadskypartners.com/wp-json/wp/v2/'
    for typ, kind in (('pages', 'firm'), ('team', 'firm-team'), ('investment', 'firm-investment')):
        r = F.get(base + typ + '?per_page=100', accept='application/json', max_age_days=1)
        if not r['ok']:
            log('firm', typ, r['error'])
            continue
        try:
            items = json.loads(r['body'])
        except ValueError:
            continue
        for it in items:
            if re.search(r'/(disclaimer|privacy-policy)/', it.get('link') or ''):
                continue   # legal boilerplate
            title = strip_tags(it.get('title', {}).get('rendered', ''))
            content = it.get('content', {}).get('rendered', '')
            links += re.findall(r'href="(https?://[^"]+)"', content)
            text = strip_tags(content)
            extra = []
            for k, v in (it.get('acf') or {}).items() if isinstance(it.get('acf'), dict) else []:
                if isinstance(v, str) and v.strip() and not v.startswith('http'):
                    extra.append(f"{k.replace('_', ' ').capitalize()}: {strip_tags(v)}")
            if typ == 'pages' and len(text) < 120:   # thin shells (home, team, investments): read the rendered page
                pg = F.get(it.get('link'), max_age_days=1)
                if pg['ok']:
                    t2 = firm_page_text(pg)
                    text = t2 if len(t2) > len(text) else text
            if typ == 'team':
                title = f'{title}, Broad Sky Partners' if title else title
            body = '\n'.join(filter(None, [text] + extra))
            if len(body) < 40:
                pg = F.get(it.get('link'))
                if pg['ok']:
                    body = extract(pg)[1] or body
            if body:
                out.append(doc('firm', kind, title, it.get('link'), body, publisher='Broad Sky Partners', date=it.get('date'), key=f'firm-{typ}-{it.get("id")}'))
    for page in ('https://broadskypartners.com/', 'https://broadskypartners.com/team/', 'https://broadskypartners.com/home/investments/',
                 'https://broadskypartners.com/strategy/', 'https://broadskypartners.com/news/'):
        r = F.get(page, max_age_days=1)
        if r['ok']:
            links += re.findall(r'href="(https?://[^"]+)"', r['body'])
            t, text = extract(r)[0], firm_page_text(r)
            out.append(doc('firm', 'firm', t or page, page, text, publisher='Broad Sky Partners', key='firm-page-' + hashlib.sha1(page.encode()).hexdigest()[:8]))
    press = [unwrap(html.unescape(u)) for u in dict.fromkeys(links)]
    press = [u for u in dict.fromkeys(press) if u and not re.search(r'broadskypartners\.com|investorflow|wp-content|fonts\.|cdnjs|wp-json', u)]
    return out, press


def unwrap(u):
    """The real address inside an email-security wrapper (Proofpoint v2), or None for wrappers that cannot be undone."""
    if 'urldefense.proofpoint.com/v2/url' in u:
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(u).query).get('u', [''])[0]
        return re.sub(r'-([0-9A-F]{2})', lambda m: chr(int(m.group(1), 16)), q.replace('_', '/')) or None
    if re.search(r'mimecastprotect\.com|createsend\.com', u):
        return None
    return u


def cited_urls():
    urls = set()
    files = [os.path.join(ROOT, 'data', 'research', f) for f in os.listdir(os.path.join(ROOT, 'data', 'research')) if f.endswith('.json')]
    files += [os.path.join(ROOT, 'data', 'answers', f) for f in os.listdir(os.path.join(ROOT, 'data', 'answers')) if f.endswith('.json')]
    for f in files:
        for u in re.findall(r'https?://[^\s"\'<>)\]\\]+', open(f, encoding='utf-8').read()):
            urls.add(u.rstrip('.,;:'))
    keep = []
    for u in sorted(urls):
        h = host_of(u)
        if not h or SKIP_HOST_RX.search(h) or SKIP_PATH_RX.search(u) or (u.lower().split('?')[0].endswith('.xml') and 'sec.gov' not in h):
            continue
        keep.append(u)
    return keep


def fetch_pages(F, urls, source, kind_of, workers=10, min_chars=280, max_age_days=180):
    out, fails = [], 0

    def one(u):
        r = F.get(u, max_age_days=max_age_days)
        if not r['ok']:
            return None, r['error'] or r['status']
        title, text, date, site = extract(r)
        if len(text) < min_chars:
            return None, 'thin'
        return doc(source, kind_of(u), title or u, r['final'] or u, text, publisher=site, date=date), None
    with concurrent.futures.ThreadPoolExecutor(workers) as ex:
        for d, err in ex.map(one, urls):
            if d:
                out.append(d)
            else:
                fails += 1
    log(f'{source}: {len(out)} pages kept, {fails} skipped of {len(urls)}')
    return out


def kind_for(u):
    h = host_of(u)
    if 'sec.gov' in h:
        return 'filing'
    if re.search(r'prnewswire|businesswire|globenewswire|financialcontent|accesswire|einpresswire', h):
        return 'press-release'
    if 'wikipedia.org' in h:
        return 'reference'
    if re.search(r'comelectrical|frontlinems|thomassci|bpigroup|fairharbor|smith-howard|onehour|benjaminfranklin|mistersparky|broadsky', h):
        return 'company'
    return 'article'


def src_cited(F, extra=()):
    urls = list(dict.fromkeys(list(extra) + cited_urls()))
    return fetch_pages(F, urls, 'cited', kind_for)


def src_companies(F):
    urls = []
    for co, home in COMPANY_SITES.items():
        r = F.get(home, max_age_days=30)
        if not r['ok']:
            log('company home failed', home, r['error'])
            continue
        urls.append(home)
        base = host_of(r['final'] or home)
        found = []
        for href in re.findall(r'href="([^"#]+)"', r['body']):
            u = urllib.parse.urljoin(r['final'] or home, html.unescape(href)).split('#')[0].rstrip('/') + '/'
            if host_of(u) == base and COMPANY_PAGE_RX.search(urllib.parse.urlsplit(u).path) and not SKIP_PATH_RX.search(u) \
                    and not re.search(r'/(cart|account|login|search|tag|category|author|feed|wp-)|\?', u):
                found.append(u)
        if co == 'pp':   # the franchise network's pages for this territory only
            found = [u for u in found if 'southeast-pennsylvania' in u]
        urls += list(dict.fromkeys(found))[:30]
    return fetch_pages(F, list(dict.fromkeys(urls)), 'companies', lambda u: 'company', min_chars=200, max_age_days=30)


def src_news(F):
    out, seen, article_urls = [], set(), []
    for q in NEWS_QUERIES:
        for feed, url in (('bing', 'https://www.bing.com/news/search?format=rss&q=' + urllib.parse.quote(q)),
                          ('google', 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=' + urllib.parse.quote(q))):
            r = F.get(url, accept='application/rss+xml, application/xml, text/xml', robots=False, max_age_days=0.5)
            if not r['ok']:
                log('news feed failed', feed, q, r['error'])
                continue
            try:
                root = ET.fromstring(r['body'].encode('utf-8', 'replace'))
            except ET.ParseError:
                continue
            for it in root.iter('item'):
                title = strip_tags(it.findtext('title') or '')
                link = it.findtext('link') or ''
                if feed == 'bing':
                    real = urllib.parse.parse_qs(urllib.parse.urlsplit(link).query).get('url', [''])[0]
                    link = real or link
                pub = it.findtext('pubDate') or ''
                src = it.find('source')
                publisher = (src.text if src is not None and src.text else '') or (host_of(link) if feed == 'bing' else '')
                if feed == 'google' and ' - ' in title:
                    title, _, pub_name = title.rpartition(' - ')
                    publisher = publisher or pub_name
                desc = strip_tags(it.findtext('description') or '')
                k = re.sub(r'\W+', ' ', title.lower()).strip()
                if not title or k in seen:
                    continue
                seen.add(k)
                if not re.search('|'.join(COMPANIES.values()), f'{title} {desc}', re.I):
                    continue   # the query matched something unrelated
                if feed == 'bing' and link.startswith('http'):
                    article_urls.append(link)
                text = f'Headline: {title}\nPublisher: {publisher}\nDate: {iso_date(pub) or pub}' + (f'\nSummary: {desc}' if desc and feed == 'bing' else '')
                out.append(doc('news', 'headline', title, link if feed == 'bing' else link, text, publisher=publisher, date=pub))
    arts = fetch_pages(F, list(dict.fromkeys(article_urls)), 'news', lambda u: 'article')
    log(f'news: {len(out)} headlines, {len(arts)} full articles')
    return out + arts


def src_wiki(F):
    out = []
    for t in WIKI_TITLES:
        url = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=' + urllib.parse.quote(t)
        r = F.get(url, accept='application/json', robots=False, max_age_days=30)
        if not r['ok']:
            continue
        try:
            pages = json.loads(r['body'])['query']['pages']
        except (ValueError, KeyError):
            continue
        for p in pages.values():
            text = p.get('extract') or ''
            if len(text) < 300:
                continue
            text = re.split(r'\n== (See also|References|External links|Notes) ==', text)[0]
            title = p.get('title') or t
            out.append(doc('wiki', 'reference', f'{title} (Wikipedia)', 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')), text, publisher='Wikipedia'))
    log(f'wiki: {len(out)} articles')
    return out


# ── The portal's own content ────────────────────────────────────────────────
def src_labels():
    """Plain names, descriptions and links for each dataset, from the assistant's own table in assets/chat.js."""
    s = open(os.path.join(ROOT, 'assets', 'chat.js'), encoding='utf-8').read()
    i = s.find('const SRC = {')
    j = s.find('\n};', i)
    out = {}
    for key, name, desc, href in re.findall(r"^\s*'?([\w:]+)'?: \['([^']*)', '([^']*)', ([^\]]*)\]", s[i:j], re.M):
        href = href.strip()
        m = re.match(r"RD \+ '([^']*)'", href)
        if m:
            href = SITE + 'redesigns/' + m.group(1)
        elif href == 'RD':
            href = SITE + 'redesigns/'
        elif href.startswith("'#"):
            href = SITE + 'app.html' + href.strip("'")
        else:
            href = href.strip("'")
        out[key] = {'name': name, 'desc': desc, 'href': href}
    return out


PREFIX = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor', 'bsp': 'BSP', 'ma': 'M&A', 'pe': 'PE'}
UPPER = {'ai', 'os', 'nj', 'pa', 'ne', 'nyc', 'dc', 'hvac', 'ev', 'rfp', 'rfps', 'ctv', 'cbsa'}


def dataset_name(key):
    """A dataset key in plain words (the same rules as srcLabel in assets/chat.js): bsp_network -> 'BSP network'."""
    w = [PREFIX[b] if i == 0 and b in PREFIX else b.upper() if b in UPPER else b for i, b in enumerate(key.split('_')) if b]
    t = ' '.join(w)
    return t[:1].upper() + t[1:]


def humanize_key(k):
    k = re.sub(r'_usd$', ' ($)', k)
    k = re.sub(r'_pct$', ' (%)', k)
    w = k.replace('_', ' ').strip()
    return w[:1].upper() + w[1:]


def flatten(v, depth=0, max_list=40):
    """A JSON value as readable 'Key: value' lines (identifiers humanised)."""
    if isinstance(v, dict):
        lines = []
        for k, x in v.items():
            if k in ('lat', 'lon', 'geo_precision', 'id', 'zip_list', 'geometry', 'coords') or x in (None, '', [], {}):
                continue
            if isinstance(x, (dict, list)):
                inner = flatten(x, depth + 1, max_list)
                if inner:
                    lines.append(f'{humanize_key(k)}:\n' + '\n'.join('  ' + ln for ln in inner.splitlines()))
            else:
                lines.append(f'{humanize_key(k)}: {fmt_val(x)}')
        return '\n'.join(lines)
    if isinstance(v, list):
        parts = [flatten(x, depth + 1, max_list) if isinstance(x, (dict, list)) else fmt_val(x) for x in v[:max_list]]
        parts = [p for p in parts if p]
        if all('\n' not in p and len(p) < 120 for p in parts):
            return '; '.join(parts)
        return '\n'.join('- ' + p.replace('\n', '\n  ') for p in parts)
    return fmt_val(v)


def fmt_val(x):
    if isinstance(x, bool):
        return 'yes' if x else 'no'
    if isinstance(x, float):
        return f'{x:,.4g}' if abs(x) < 1000 else f'{x:,.0f}'
    if isinstance(x, int):
        return f'{x:,}' if abs(x) >= 10000 else str(x)
    return strip_tags(str(x)) if '<' in str(x) else str(x)


ITEM_TITLE_KEYS = ('title', 'name', 'company', 'firm', 'target', 'lever', 'event', 'question', 'headline', 'label', 'agent', 'case', 'platform', 'plant', 'project')


def src_research():
    labels = src_labels()
    out = []
    skip = {'index', 'county_cbsa'}
    for f in sorted(os.listdir(os.path.join(ROOT, 'data', 'research'))):
        if not f.endswith('.json') or f[:-5] in skip:
            continue
        key = f[:-5]
        d = json.load(open(os.path.join(ROOT, 'data', 'research', f), encoding='utf-8'))
        lab = labels.get(key, {'name': dataset_name(key), 'desc': '', 'href': SITE + 'app.html'})
        meta = d.get('meta', {}) if isinstance(d, dict) else {}
        gen = meta.get('generated') or ''
        head = f"{lab['name']}: summary"
        body = (lab['desc'] + '\n\n' if lab['desc'] else '') + flatten({k: v for k, v in meta.items() if k not in ('dataset', 'item_count', 'counts')})
        for extra in [k for k in (d.keys() if isinstance(d, dict) else []) if k not in ('meta', 'items')]:
            body += f'\n\n{humanize_key(extra)}:\n' + flatten(d[extra])
        out.append(doc('portal', 'research', head, lab['href'], body, publisher='BSP Desk research', date=gen, key=f'research-{key}-meta'))
        items = d.get('items', []) if isinstance(d, dict) else []
        if key == 'pp_storm_events':   # 1,500+ NOAA rows: keep the summary above only
            continue
        batch, n = [], 0
        for it in items:
            if not isinstance(it, dict):
                continue
            t = next((str(it[k]) for k in ITEM_TITLE_KEYS if it.get(k) and isinstance(it.get(k), (str, int))), '')
            text = flatten(it)
            if t and len(text) > 250:
                out.append(doc('portal', 'research', f"{lab['name']}: {strip_tags(t)[:160]}", lab['href'], text, publisher='BSP Desk research', date=gen,
                               key=f'research-{key}-{n}'))
            else:
                batch.append(text)
            n += 1
            if len(batch) >= 12:
                out.append(doc('portal', 'research', f"{lab['name']}: records", lab['href'], '\n\n'.join(batch), publisher='BSP Desk research', date=gen,
                               key=f'research-{key}-b{n}'))
                batch = []
        if batch:
            out.append(doc('portal', 'research', f"{lab['name']}: records", lab['href'], '\n\n'.join(batch), publisher='BSP Desk research', date=gen, key=f'research-{key}-b{n}'))
    return out


def src_answers():
    out = []
    folder = os.path.join(ROOT, 'data', 'answers')
    for f in sorted(os.listdir(folder)):
        if not f.endswith('.json') or f in ('index.json', 'prompts.json'):
            continue
        a = json.load(open(os.path.join(folder, f), encoding='utf-8'))
        if not a.get('question') or not (a.get('markdown') or a.get('html')):
            continue
        srcs = '; '.join(s.get('name', '') for s in a.get('sources', []) if isinstance(s, dict))
        text = (a.get('markdown') or strip_tags(a.get('html'))) + (f'\n\nSources used: {srcs}' if srcs else '')
        out.append(doc('portal', 'answer', f"Prepared answer: {a['question']}", SITE + 'assistant.html', text, publisher='BSP Desk prepared answer',
                       date=a.get('generated_at'), key='answer-' + f[:-5]))
    return out


def src_rendered():
    """Every page and app route, rendered in headless Chromium; the visible text of the main content."""
    sys.path.insert(0, os.path.join(ROOT, 'scripts'))
    import ci_check   # page and route discovery shared with the CI check
    from playwright.sync_api import sync_playwright
    import http.server, socket, functools
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}/'
    pages = [p for p in ci_check.find_pages() if not re.search(r'^(server|worker|legacy)/|chat_test|export_|system_demo|^briefing/.*shot', p)]
    routes = [f'app.html#/{m}/{v}' for m, v in ci_check.parse_routes()]
    js = """() => {
      const root = document.querySelector('#content') && location.hash ? document.querySelector('#content') : (document.querySelector('main') || document.body);
      const c = root.cloneNode(true);
      c.querySelectorAll('script,style,noscript,svg,canvas,nav,header,footer,[aria-hidden="true"],[class^="ch-"],[class*=" ch-"],.sys-sr').forEach(e => e.remove());
      const h = document.querySelector('#content h1, main h1, h1');
      return { title: (h && h.innerText.trim()) || document.title, text: c.innerText };
    }"""
    out = []
    with sync_playwright() as p:
        exe = '/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') and not os.environ.get('CORPUS_DEFAULT_CHROMIUM') else None
        try:
            browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        except Exception:
            browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1400, 'height': 1000})
        page = ctx.new_page()
        # Map and chart libraries load from CDNs, so scripts, styles and data calls go out; images, fonts and media (map tiles) do not.
        page.route(re.compile(r'^https?://(?!127\.0\.0\.1)'), lambda route: route.abort() if route.request.resource_type in ('image', 'media', 'font') else route.continue_())
        for target in pages + routes:
            try:
                page.goto(base + target, wait_until='domcontentloaded', timeout=30000)
                sel = '#content' if '#/' in target else 'main'
                try:   # views that draw maps and tables from large datasets take a few seconds
                    page.wait_for_function(f"() => ((document.querySelector('{sel}') || document.body).innerText || '').length > 600", timeout=9000)
                except Exception:
                    pass
                page.wait_for_timeout(1200)
                r = page.evaluate(js)
            except Exception as e:
                log('render failed', target, str(e)[:120])
                continue
            text = norm_ws(r['text'])
            if len(text) < 200:
                continue
            title = re.sub(r'\s+', ' ', r['title'] or target)
            if '#/' in target:
                m, v = target.split('#/')[1].split('/')[:2]
                title = f'Portal: {title}' if not title.lower().startswith('portal') else title
            out.append(doc('portal', 'portal-view' if '#/' in target else 'site-page', title, SITE + target.replace('index.html', ''), text,
                           publisher='BSP Desk', date=dt.date.today().isoformat(), key='page-' + hashlib.sha1(target.encode()).hexdigest()[:10]))
        browser.close()
    srv.shutdown()
    log(f'portal: {len(out)} pages and views rendered')
    return out


def src_portal():
    return src_research() + src_answers() + src_rendered()


# ── Chunking and indexing ───────────────────────────────────────────────────
SENT_RX = re.compile(r'(?<=[.!?])\s+(?=[A-Z0-9"“(])')


def chunk_text(text, size=CHUNK_CHARS):
    paras = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    pieces = []
    for p in paras:
        if len(p) <= size:
            pieces.append(p)
            continue
        cur = ''
        for s in (SENT_RX.split(p) if '. ' in p else p.split('\n')):
            while len(s) > size:   # one enormous sentence or line
                pieces.append((cur + ' ' + s[:size]).strip())
                cur, s = '', s[size:]
            if len(cur) + len(s) + 1 > size and cur:
                pieces.append(cur.strip())
                cur = s
            else:
                cur = (cur + (' ' if cur else '') + s)
        if cur.strip():
            pieces.append(cur.strip())
    chunks, cur = [], ''
    for p in pieces:
        if len(cur) + len(p) + 2 > size and cur:
            chunks.append(cur)
            cur = p
        else:
            cur = cur + ('\n\n' if cur else '') + p
    if cur:
        chunks.append(cur)
    return chunks


class Embedder:
    """Static embeddings: token vectors averaged over a text, then normalised (the same maths as server/knowledge.py)."""
    def __init__(self, model=EMBED_MODEL):
        from model2vec import StaticModel
        import numpy as np
        m = StaticModel.from_pretrained(model, force_download=False)
        self.np = np
        self.tokenizer = m.tokenizer
        self.unk = m.unk_token_id
        full = np.asarray(m.embedding, dtype=np.float32)
        # Stored as int8 with one scale per token (half the size of float16); passages are embedded with the same
        # dequantised table the server uses for queries, so both sides match exactly.
        self.scale = (np.abs(full).max(axis=1) / 127.0).astype(np.float16)
        safe = np.where(self.scale == 0, 1, self.scale).astype(np.float32)
        self.q8 = np.clip(np.rint(full / safe[:, None]), -127, 127).astype(np.int8)
        self.matrix = self.q8.astype(np.float32) * self.scale.astype(np.float32)[:, None]
        self.name = model

    def encode(self, texts):
        np = self.np
        out = np.zeros((len(texts), self.matrix.shape[1]), dtype=np.float32)
        for i, enc in enumerate(self.tokenizer.encode_batch([t[:4096] for t in texts], add_special_tokens=False)):
            ids = [t for t in enc.ids if t != self.unk][:512]
            if ids:
                v = self.matrix[ids].mean(axis=0)
                n = np.linalg.norm(v)
                out[i] = v / n if n else v
        return out


def build_index(docs):
    import numpy as np
    emb = Embedder()
    tmp = KB + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    con = sqlite3.connect(tmp)
    con.executescript("""
    PRAGMA page_size = 4096;
    CREATE TABLE info (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE docs (id INTEGER PRIMARY KEY, key TEXT UNIQUE, source TEXT, kind TEXT, title TEXT, url TEXT, publisher TEXT, date TEXT, companies TEXT);
    CREATE TABLE chunks (id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, ord INTEGER NOT NULL, head TEXT NOT NULL, text TEXT NOT NULL);
    CREATE INDEX idx_chunks_doc ON chunks(doc_id, ord);
    CREATE VIRTUAL TABLE chunks_fts USING fts5(head, text, content='chunks', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
    CREATE TABLE blobs (name TEXT PRIMARY KEY, dtype TEXT, shape TEXT, data BLOB);
    """)
    texts, cid = [], 0
    for i, d in enumerate(docs, 1):
        con.execute('INSERT INTO docs VALUES (?,?,?,?,?,?,?,?,?)', (i, d['key'], d['source'], d['kind'], d['title'], d['url'], d['publisher'], d['date'], ','.join(d['companies'])))
        for o, c in enumerate(chunk_text(d['text'])[:CHUNK_MAX_PER_DOC]):
            cid += 1
            con.execute('INSERT INTO chunks VALUES (?,?,?,?,?)', (cid, i, o, d['title'], c))
            texts.append(f"{d['title']}\n{c}")
    con.execute("INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')")
    vecs = emb.encode(texts).astype(np.float16)
    tok = emb.tokenizer.to_str()
    blobs = [('chunk_vectors', 'float16', f'{vecs.shape[0]},{vecs.shape[1]}', vecs.tobytes()),
             ('token_vectors', 'int8', f'{emb.q8.shape[0]},{emb.q8.shape[1]}', emb.q8.tobytes()),
             ('token_scales', 'float16', f'{emb.scale.shape[0]}', emb.scale.tobytes()),
             ('tokenizer', 'json', '', tok.encode('utf-8'))]
    con.executemany('INSERT INTO blobs VALUES (?,?,?,?)', blobs)
    by_src = {}
    for d in docs:
        by_src[d['source']] = by_src.get(d['source'], 0) + 1
    info = {'built_at': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(), 'embed_model': emb.name, 'unk_token_id': str(emb.unk if emb.unk is not None else ''),
            'docs': str(len(docs)), 'chunks': str(cid), 'sources': json.dumps(by_src), 'max_tokens': '512'}
    con.executemany('INSERT INTO info VALUES (?,?)', info.items())
    con.commit()
    con.execute("INSERT INTO chunks_fts(chunks_fts) VALUES ('optimize')")
    con.commit()
    con.execute('VACUUM')
    con.close()
    os.replace(tmp, KB)
    log(f'index: {len(docs)} documents, {cid} chunks, {os.path.getsize(KB) / 1e6:.1f} MB at {os.path.relpath(KB, ROOT)}')


# ── Deal presets for the assistant's acquisition-model tool ─────────────────
def export_deal_presets():
    """server/knowledge/deal_presets.json: the acquisition model's inputs and presets, built the way modules/deal.js boot() builds them
    (portfolio and market presets from the deal-model research, plus the top three screened add-on targets per company)."""
    R = lambda n: json.load(open(os.path.join(ROOT, 'data', 'research', n + '.json'), encoding='utf-8'))
    dm = R('deal_model')
    files = {n: R(n) for n in ('ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts')}
    out = []
    for it in dm['items']:
        if it.get('kind') == 'preset':
            out.append({'id': it['id'], 'label': it['label'], 'co': it.get('co'), 'group': 'portfolio' if it.get('co') and it.get('group') != 'generic' else 'market',
                        'summary': it.get('summary', ''), 'vals': dict(it['inputs']), 'est': list(it.get('est') or []), 'basis': it.get('basis') or {}})
    parent = {p['co']: p for p in out if p['co']}
    td = dm['meta']['target_defaults']
    affil = lambda t: re.search(r'punctual\s*pros', str(t.get('company') or ''), re.I) or any(re.search(r'name collision|already affiliated', r, re.I) for r in (t.get('risk_flags') or []))
    short = lambda s: re.sub(r'\s{2,}', ' ', re.sub(r',?\s+(Inc|LLC|Corp|Corporation|Co)\.?$', '', re.sub(r'\s*\(.*?\)\s*', ' ', str(s or '')), flags=re.I)).strip()
    for sec in [i for i in dm['items'] if i.get('kind') == 'sector']:
        f, par = files.get(sec['target_file']), parent.get(sec['co'])
        if not f or not par:
            continue
        pool = [t for t in f.get('items', []) if (sec['co'] != 'fl' or t.get('platform') == 'frontline') and (sec['co'] != 'ts' or t.get('platform') == 'thomas_scientific') and not affil(t)]
        with_rev = sorted([t for t in pool if (t.get('revenue_est_usd') or 0) > 0], key=lambda t: -(t.get('fit_score') or 0))
        listed = with_rev[:3]
        listed_ids = {t['id'] for t in listed}
        revs = sorted(t['revenue_est_usd'] / 1e6 for t in with_rev)
        med = (revs[len(revs) // 2] if len(revs) % 2 else (revs[len(revs) // 2 - 1] + revs[len(revs) // 2]) / 2) if revs else None
        rest = sorted([t for t in pool if t['id'] not in listed_ids], key=lambda t: -(t.get('fit_score') or 0))
        for t in listed + rest:   # every screened target, as the portal's model builds them (top three listed, the rest open by link)
            sized = not ((t.get('revenue_est_usd') or 0) > 0)
            if sized and med is None:
                continue
            rev = round((med if sized else t['revenue_est_usd'] / 1e6) * 10) / 10
            e = rev * sec['margin_pct'] / 100
            vals = {**dm['meta']['base'], 'rev': rev, 'mg': sec['margin_pct'], 'gr': sec['growth_pct'], 'em': td['em'], 'lev': td['lev'], 'ir': td['ir'], 'dm': td['dm'],
                    'ae': td['ae'], 'xm': td['xm'], 'am': td['em'], 'n': td['n'], 'nd': round(e * td['lev'] * 10) / 10, 'tm': td['xm'], 'ce': par['vals']['ce'],
                    'cm': par['vals']['em'], 'ra': round(e * 100) / 100, 'rm': td['em'], 'rx': par['vals']['xm'], 'wacc': par['vals']['wacc']}
            out.append({'id': t['id'], 'label': short(t.get('company')), 'co': sec['co'], 'group': 'target', 'parent': par['id'], 'hidden': t['id'] not in listed_ids,
                        'summary': f"{sec['label']} for {par['label']}; fit score {t.get('fit_score')} of 100; " + (f"no revenue on record, so sized at the median screened target (${med:.1f}M)." if sized else 'revenue is a modelled estimate.'),
                        'vals': vals, 'est': ['rev', 'mg', 'gr', 'nd', 'ra', 'ce'],
                        'basis': {**{k: v for k, v in (td.get('basis') or {}).items()},
                                  'rev': f"No revenue on record; sized at the median screened {par['label']} target." if sized else f"Modelled revenue from the {par['label']} add-on screen (fit score {t.get('fit_score')} of 100).",
                                  'mg': sec.get('basis', ''), 'gr': f"Assumed for a {sec['label'].lower()}."}})
    inputs = [{k: i.get(k) for k in ('key', 'label', 'unit', 'min', 'max')} for i in dm['meta']['inputs']]
    path = os.path.join(OUT_DIR, 'deal_presets.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'generated': dm['meta'].get('generated'), 'inputs': inputs, 'presets': out}, fh, ensure_ascii=False, indent=1)
    log(f'deal presets: {len(out)} written to {os.path.relpath(path, ROOT)}')


# ── Main ────────────────────────────────────────────────────────────────────
def dedupe(docs):
    out, seen_url, seen_text, seen_key = [], set(), set(), set()
    full = {re.sub(r'^https?://(www\.)?', '', d['url']).rstrip('/').lower() for d in docs if d['kind'] != 'headline'}
    for d in docs:
        if d['kind'] == 'headline' and re.sub(r'^https?://(www\.)?', '', d['url']).rstrip('/').lower() in full:
            continue   # the full article is in the corpus
        if d['key'] in seen_key:
            continue
        seen_key.add(d['key'])
        u = re.sub(r'^https?://(www\.)?', '', d['url']).rstrip('/').lower()
        h = hashlib.sha1(re.sub(r'\W+', '', d['text'].lower())[:4000].encode()).hexdigest()
        if (u and d['kind'] not in ('research', 'answer', 'headline') and u in seen_url) or h in seen_text:
            continue
        if u and d['kind'] not in ('research', 'answer', 'headline'):
            seen_url.add(u)
        seen_text.add(h)
        out.append(d)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--only', default='', help='comma-separated sources to collect: ' + ','.join(ALL_SOURCES))
    ap.add_argument('--index-only', action='store_true')
    ap.add_argument('--refresh', action='store_true', help='ignore the fetch cache')
    a = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    old = [json.loads(ln) for ln in open(CORPUS, encoding='utf-8')] if os.path.exists(CORPUS) else []
    if not a.index_only:
        want = [s.strip() for s in a.only.split(',') if s.strip()] or ALL_SOURCES
        bad = [s for s in want if s not in ALL_SOURCES]
        if bad:
            sys.exit(f'unknown source(s): {bad}')
        F = Fetcher(refresh=a.refresh)
        fresh, press = [], []
        for s in want:
            t0 = time.time()
            if s == 'firm':
                got, press = src_firm(F)
            elif s == 'cited':
                if not press and 'firm' not in want:
                    press = src_firm(F)[1]
                got = src_cited(F, press)
            else:
                got = {'companies': src_companies, 'news': src_news, 'wiki': src_wiki}[s](F) if s != 'portal' else src_portal()
            log(f'{s}: {len(got)} documents in {time.time() - t0:.0f}s')
            fresh += got
        kept = [d for d in old if d['source'] not in want]
        docs = dedupe(sorted(fresh, key=lambda d: ALL_SOURCES.index(d['source'])) + kept)
        with open(CORPUS + '.tmp', 'w', encoding='utf-8') as fh:
            for d in sorted(docs, key=lambda d: (ALL_SOURCES.index(d['source']), d['kind'], d['key'])):
                fh.write(json.dumps(d, ensure_ascii=False, sort_keys=True) + '\n')
        os.replace(CORPUS + '.tmp', CORPUS)
        log(f'corpus: {len(docs)} documents, {os.path.getsize(CORPUS) / 1e6:.1f} MB at {os.path.relpath(CORPUS, ROOT)}')
    export_deal_presets()
    docs = [json.loads(ln) for ln in open(CORPUS, encoding='utf-8')]
    build_index(docs)


if __name__ == '__main__':
    main()
