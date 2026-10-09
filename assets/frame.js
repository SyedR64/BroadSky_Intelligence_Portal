/* ═══════════════════════════════════════════════════════════════════════════
   BSP Desk · global frame (frame.js)
   One top bar, one page bar (the page's own sub-nav, with the breadcrumb and the
   concept tag folded in), one footer, one Ask button and one copy safety net
   for every page. Styles live in assets/system.css.
   Spec: UNIFIED.md.

   Usage (any depth; links are computed from this file's own URL):
     <script type="module">
       import { Frame } from '../../assets/frame.js?v=20261009175029';
       Frame.mount({ co: 'pp', persona: 'pp' });          // concept page
     </script>
     Frame.mount({ variant: 'app' });                      // app.html
     Frame.mount({ variant: 'minimal', theme: 'dark' });   // theater.html

   Options (all optional):
     active   'home'|'portal'|'concepts'|'os'|'playbooks'|'briefing'  (auto from URL; 'os' and 'playbooks' mark Concepts)
     co       'pp'|'cet'|'fl'|'ts'|'bpi'|'fh'   company accent + crumb  (auto from URL)
     persona  chat persona for the Ask button      (default: co, else 'portal')
     theme    'light'|'dark'                       fallback when the visitor has no saved choice (default 'light').
                                                    The visitor's choice (localStorage 'bsp-theme', set by the top-bar
                                                    theme button on every page) always wins, except on a 'minimal'
                                                    page that passes theme: 'dark' (the 3D map stage), which stays dark.
     variant  'default'|'app'|'minimal'            (app: strip above the console; minimal: transparent, no footer)
     banner   true|false                           concept tag in the page bar (default: true on concept pages under redesigns/<company>/)
     crumb    false | [{ label, href? }, …]        (default: auto for pages under redesigns/). On a page with a
                                                    sub-nav (.sys-subnav) the parent shows before its title; otherwise
                                                    the crumb is its own row.
     crumbAside  short text at the right of the crumb row, e.g. 'Concept · Oct 2026'
     cta      { label, href }                      small primary button in the top bar
     nav      { <nav id>: href | { href?, label?, hint? } }   per-page override of primary links,
                                                    e.g. { briefing: 'app.html#/briefing/play' }. An href
                                                    with a '#/' route on this page is marked current while
                                                    location.hash is on that route (kept in sync on hashchange).
                                                    Variant 'app' defaults to { briefing: 'app.html#/briefing/play' }.
     footer   true|false                           (default true, false for app/minimal)
     hotkey   'mod+k'|'mod+j'|false                (default 'mod+k'; 'mod+j' for variant 'app',
                                                    where ⌘K already opens the portal search)
     chat     an existing Chat widget instance the Ask button should open
     humanize true|'observe'|false                 (default 'observe': one pass now, then on DOM changes)
   ═══════════════════════════════════════════════════════════════════════════ */

/* The site lives at broadsky-desk.vercel.app. Older addresses (GitHub Pages, the project's first Vercel name) forward there, keeping the page, query and portal view. */
export const HOME = 'https://broadsky-desk.vercel.app/';
if (location.hostname === 'syedr64.github.io' || location.hostname === 'bspdesk.vercel.app') location.replace(HOME + location.pathname.replace(/^\/BroadSky_Intelligence_Portal\/?/, '') + location.search + location.hash);

const SELF = new URL(import.meta.url);
const ROOT = new URL('../', SELF).href;                 // site root from any page depth
const VER = SELF.searchParams.get('v');
const QV = VER ? `?v=${encodeURIComponent(VER)}` : '';
const AUTHOR = 'Syed Rahman';
/** The product name: the one wordmark for the top bar, the mobile sheet and the footer (UNIFIED.md §0). */
export const PRODUCT = 'BSP Desk';
const IS_MAC = /mac|iphone|ipad|ipod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent);

export const COMPANIES = {
  pp:  { name: 'Punctual Pros', short: 'Punctual Pros', slug: 'punctual-pros', os: 'ServiceOS', osFile: 'serviceos.html' },
  cet: { name: 'Commonwealth Electrical Technologies', short: 'CET', slug: 'cet', os: 'GridOS', osFile: 'gridos.html' },
  fl:  { name: 'Frontline Managed Services', short: 'Frontline', slug: 'frontline', os: 'FirmOS', osFile: 'firmos.html' },
  ts:  { name: 'Thomas Scientific', short: 'Thomas Scientific', slug: 'thomas-scientific', os: 'LabOS', osFile: 'labos.html' },
  bpi: { name: 'Bully Pulpit International', short: 'BPI', slug: 'bpi', os: 'SignalOS', osFile: 'signalos.html' },
  fh:  { name: 'Fair Harbor', short: 'Fair Harbor', slug: 'fair-harbor', os: 'HarborOS', osFile: 'harboros.html' },
};
const CO_ORDER = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];

export const NAV = [
  { id: 'portal',    label: 'Portal',   href: 'app.html',   hint: 'analyst console' },
  { id: 'concepts',  label: 'Concepts', href: 'redesigns/', hint: 'websites, OS and growth plans' },
  { id: 'briefing',  label: 'Briefing', href: '#briefing',  hint: 'video and memo' },
];
/** Pages under these old top-bar entries now mark Concepts. */
const NAV_PARENT = { os: 'concepts', playbooks: 'concepts' };

export const BANNER_TEXT = `A concept by ${AUTHOR} for the Portfolio Resource Group at Broad Sky Partners (BSP). This is not the company's official website. Estimates are marked est.`;
const TAG_SHORT = 'not the official site';
export const DISCLAIMER = 'Not an official BSP website, and not endorsed by any portfolio company. Figures come from public records, company releases and licensed sources, as of the dates shown. Estimates are marked est.; illustrative figures are marked illustrative. Company names belong to their owners.';

const PAGE_LABELS = { 'index.html': 'Concept site', 'growth-plan.html': 'Growth plan', 'nationwide.html': 'Nationwide plan', 'ads.html': 'Growth marketing', 'voice-ai.html': '24/7 Voice AI', 'ai-agents.html': 'AI agents' };
const OS_FILES = new Set(Object.values(COMPANIES).map(c => c.osFile));
const PLAYBOOK_FILES = new Set(['growth-plan.html', 'nationwide.html', 'ads.html', 'voice-ai.html', 'ai-agents.html']);

const MARK = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="20" fill="#0e2236"/><g stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M10.5 15.5 15 29l6-5.5L27 12.5l3 15.5"/><path d="M17 8.5 27 26"/></g><g fill="#fff"><circle cx="10.5" cy="15.5" r="3"/><circle cx="17" cy="8.5" r="1.8"/><circle cx="27" cy="12.5" r="2.6"/><circle cx="15" cy="29" r="1.8"/><circle cx="21" cy="23.5" r="1.6"/><circle cx="30" cy="28" r="1.8"/><circle cx="33" cy="17" r=".9"/><circle cx="7" cy="23" r=".9"/><circle cx="25" cy="33" r=".9"/></g></svg>';
const EXT = '<svg class="sys-ext" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M4 2.5h5.5V8M9.3 2.7 2.5 9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Resolve a root-relative href ('app.html', 'redesigns/#os', '#briefing' = landing anchor) to an absolute URL. */
const url = href => {
  if (!href) return '';
  if (/^[a-z]+:|^\/\//i.test(href)) return href;
  if (href.startsWith('#')) return ROOT + href;       // '#briefing' → landing page anchor
  return new URL(href, ROOT).href;
};

/* ── page detection ───────────────────────────────────────────────────────── */
function where() {
  const href = location.href.split('#')[0].split('?')[0];
  const rel = href.startsWith(ROOT) ? href.slice(ROOT.length) : location.pathname.replace(/^\/+/, '');
  const parts = rel.split('/').filter(Boolean);
  const file = rel.endsWith('/') || !parts.length ? 'index.html' : parts[parts.length - 1];
  let active = 'home', co = null;
  if (parts[0] === 'redesigns') {
    const slugCo = CO_ORDER.find(k => COMPANIES[k].slug === parts[1]);
    if (slugCo) co = slugCo;
    if (OS_FILES.has(file)) active = 'os';
    else if (PLAYBOOK_FILES.has(file)) active = 'playbooks';
    else active = 'concepts';
  } else if (file === 'app.html' || file === 'theater.html') active = 'portal';
  else if (parts[0] === 'briefing') active = 'briefing';
  return { rel, parts, file, active, co, concept: parts[0] === 'redesigns' && !!co };
}

function autoCrumb(w) {
  if (w.parts[0] !== 'redesigns' || w.parts.length < 2) return null;
  const items = [{ label: 'Home', href: './' }];
  if (!w.co) {               // redesigns/voice-ai.html, redesigns/ai-agents.html
    items.push({ label: 'Growth plans', href: 'redesigns/#growth-plans' }, { label: PAGE_LABELS[w.file] || 'Page' });
    return items;
  }
  const c = COMPANIES[w.co];
  items.push({ label: 'Concepts', href: 'redesigns/' });
  const label = OS_FILES.has(w.file) ? c.os : (PAGE_LABELS[w.file] || 'Page');
  if (w.file === 'index.html') items.push({ label: c.short, co: w.co });
  else items.push({ label: c.short, co: w.co, href: `redesigns/${c.slug}/` }, { label });
  return items;
}

/* ── markup ───────────────────────────────────────────────────────────────── */
function topHTML(o) {
  const links = o.nav.map(n => `<a data-nav="${esc(n.id)}" href="${esc(url(n.href))}"${n.external ? ' rel="noopener" target="_blank"' : ''}${n.id === o.active ? ' aria-current="page"' : ''}>${esc(n.label)}${n.external ? EXT : ''}</a>`).join('');
  const sheet = o.nav.map(n => `<a data-nav="${esc(n.id)}" href="${esc(url(n.href))}"${n.external ? ' rel="noopener" target="_blank"' : ''}${n.id === o.active ? ' aria-current="page"' : ''}>${esc(n.label)} <span>${esc(n.hint)}</span></a>`).join('');
  const keyName = o.hotkey ? `${IS_MAC ? '⌘' : 'Ctrl '}${o.hotkey.split('+').pop().toUpperCase()}` : '';
  const cta = o.cta ? `<a class="sys-btn sys-btn--primary sys-btn--sm sys-top-cta" href="${esc(url(o.cta.href))}">${esc(o.cta.label)}</a>` : '';
  return `<div class="sys-top-in">
    <a class="sys-brand" href="${esc(ROOT)}" aria-label="${esc(PRODUCT)}, home">${MARK}<span class="sys-brand-name">${esc(PRODUCT)}</span></a>
    <nav class="sys-nav" aria-label="Primary">${links}</nav>
    <div class="sys-top-actions">
      <button class="sys-ask" type="button" data-sys-ask aria-label="Ask the assistant${o.hotkey ? ` (${IS_MAC ? 'Command' : 'Control'} ${o.hotkey.split('+').pop().toUpperCase()})` : ''}"${keyName ? ` title="Ask the assistant (${keyName})"` : ''}><span class="sys-dot" aria-hidden="true"></span>Ask</button>
      ${o.themeToggle ? `<button class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon sys-theme" type="button" data-sys-theme-toggle aria-label="Switch to dark theme" title="Switch to dark theme"></button>` : ''}
      ${cta}
      <button class="sys-menu" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="sys-sheet"><span></span><span></span></button>
    </div>
    <div class="sys-sheet" id="sys-sheet" aria-label="${esc(PRODUCT)} menu" hidden>${sheet}${o.cta ? `<a class="sys-btn sys-btn--primary" href="${esc(url(o.cta.href))}">${esc(o.cta.label)}</a>` : ''}</div>
  </div>`;
}
/** The concept notice: a small tag that stays in the page bar (the full sentence is its tooltip and is read by screen readers). */
function conceptTagHTML() {
  return `<span class="sys-concept" title="${esc(BANNER_TEXT)}"><b aria-hidden="true">Concept</b><span class="sys-concept-more" aria-hidden="true">· ${esc(TAG_SHORT)}</span><span class="sys-vh">${esc(BANNER_TEXT)}</span></span>`;
}
/** Fold the breadcrumb's parent and the concept tag into the page's own sub-nav, so the page has one bar under the top bar. */
function foldIntoSubnav(sub, items, tag) {
  const inner = sub.querySelector('.sys-subnav-in') || sub;
  const title = inner.querySelector('.sys-subnav-title');
  const parent = items && items.length > 2 ? items[items.length - 2] : null;   // nearest parent; 'Home' is the logo
  if (parent && parent.href && title && !inner.querySelector('.sys-subnav-up')) {
    const up = document.createElement('a');
    up.className = 'sys-subnav-up'; up.href = url(parent.href);
    if (parent.co) up.dataset.co = parent.co;
    up.textContent = parent.label;
    title.before(up);
    title.classList.add('sys-subnav-title--child');
  }
  if (tag && !inner.querySelector('.sys-concept')) {
    const links = inner.querySelector('.sys-subnav-links');
    const holder = document.createElement('span'); holder.innerHTML = conceptTagHTML();
    (links ? links.after.bind(links) : inner.append.bind(inner))(holder.firstElementChild);
  }
}
function crumbHTML(items, aside, tag) {
  const li = items.map((it, i) => {
    const last = i === items.length - 1;
    const co = it.co ? ` data-co="${esc(it.co)}"` : '';
    const inner = it.href && !last ? `<a href="${esc(url(it.href))}"${co}>${esc(it.label)}</a>` : `<span${co}${last ? ' aria-current="page"' : ''}>${esc(it.label)}</span>`;
    return `<li>${inner}</li>`;
  }).join('');
  return `<div class="sys-crumb-in"><ol>${li}</ol>${aside ? `<span class="sys-crumb-aside">${esc(aside)}</span>` : ''}${tag ? conceptTagHTML() : ''}</div>`;
}
function footerHTML() {
  const a = (href, label, extra = '') => `<a href="${esc(url(href))}"${extra}>${esc(label)}</a>`;
  const cos = CO_ORDER.map(k => a(`redesigns/${COMPANIES[k].slug}/`, COMPANIES[k].short === 'CET' ? 'CET' : COMPANIES[k].short, ` data-co="${k}"`)).join('');
  return `<div class="sys-wrap">
    <div class="sys-footer-grid">
      <div class="sys-footer-brand">
        <a class="sys-brand" href="${esc(ROOT)}" aria-label="${esc(PRODUCT)}, home">${MARK}<span class="sys-brand-name">${esc(PRODUCT)}</span></a>
        <p>Made by ${AUTHOR} for Broad Sky's Portfolio Resource Group. Public information about six companies, turned into clear next steps.</p>
      </div>
      <nav class="sys-footer-col" aria-label="Portal"><p class="sys-footer-h">Portal</p>${a('app.html', 'Portal home')}${a('app.html#/home/overview', 'Command Center')}${a('app.html#/ma/overview', 'Acquisition engine')}${a('app.html#/techos/overview', 'Tech enablement')}${a('theater.html', '3D map')}</nav>
      <nav class="sys-footer-col" aria-label="Site concepts"><p class="sys-footer-h">Site concepts</p>${cos}</nav>
      <nav class="sys-footer-col" aria-label="Programs"><p class="sys-footer-h">Programs</p>${a('redesigns/#os', 'OS program')}${a('redesigns/#growth-plans', 'Growth plans')}${a('redesigns/voice-ai.html', '24/7 Voice AI')}${a('redesigns/ai-agents.html', 'AI agents')}</nav>
      <nav class="sys-footer-col" aria-label="Briefing"><p class="sys-footer-h">Briefing</p>${a('#briefing', 'Video briefing')}${a('briefing/executive_memo.html', 'Executive memo')}</nav>
    </div>
    <div class="sys-footer-legal"><p>${esc(DISCLAIMER)}</p><p class="sys-mono">Prepared by ${AUTHOR} · October 2026</p></div>
  </div>`;
}

/* ── chat wiring ──────────────────────────────────────────────────────────── */
const state = { mounted: null, chat: null, persona: 'portal', theme: 'light', observer: null, loading: null };

/* ── theme: one preference for every page ─────────────────────────────────────
   html[data-sys-theme] = 'light' | 'dark', saved under localStorage 'bsp-theme' (light by default). Each page's
   head applies the saved value before the stylesheets load; the top-bar button (and the portal's Theme helper,
   which calls setTheme) changes it everywhere, and other open tabs follow through the storage event. */
const THEME_KEY = 'bsp-theme';
const THEME_ICON = {
  sun: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>',
  moon: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z"/></svg>',
};
let themeLocked = false;
function savedTheme() { try { const v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : null; } catch { return null; } }
function getTheme() { return document.documentElement.dataset.sysTheme === 'dark' ? 'dark' : 'light'; }
function paintThemeToggles() {
  const d = getTheme() === 'dark', label = d ? 'Switch to light theme' : 'Switch to dark theme';
  for (const b of document.querySelectorAll('[data-sys-theme-toggle]')) {
    b.innerHTML = d ? THEME_ICON.sun : THEME_ICON.moon; b.setAttribute('aria-label', label); b.title = label;
  }
}
function applyTheme(t) {
  t = t === 'dark' ? 'dark' : 'light';
  const h = document.documentElement;
  if (h.dataset.sysTheme !== t) h.dataset.sysTheme = t;
  if (h.hasAttribute('data-theme') && h.dataset.theme !== t) h.dataset.theme = t;   // older module CSS hooks html[data-theme]
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0a0e14' : '#fbfaf7');
  state.theme = t; paintThemeToggles();
  return t;
}
/** Set and remember the theme for every page of the site. */
function setTheme(t) {
  if (themeLocked) return getTheme();
  t = applyTheme(t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked: this page only */ }
  return t;
}
function toggleTheme() { return setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
window.addEventListener('storage', e => { if (e.key === THEME_KEY && !themeLocked && (e.newValue === 'dark' || e.newValue === 'light')) applyTheme(e.newValue); });

async function openChat() {
  const inst = state.chat;
  if (inst && typeof inst.togglePanel === 'function') {
    if (inst.open) inst.root?.querySelector('textarea')?.focus(); else inst.togglePanel(true);
    return inst;
  }
  const panelTa = document.querySelector('.ch.ch-floating .ch-panel textarea');
  if (panelTa) { panelTa.focus(); return null; }
  const launch = document.querySelector('.ch.ch-floating .ch-launch');
  if (launch) { launch.click(); return null; }
  const inlineTa = document.querySelector('.ch.ch-inline textarea');
  if (inlineTa) {
    inlineTa.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    inlineTa.focus({ preventScroll: true });
    return null;
  }
  if (!state.loading) {
    state.loading = (async () => {
      const Chat = window.BSPChat || (await import(ROOT + 'assets/chat.js' + QV)).Chat;
      state.chat = Chat.mount(null, { persona: state.persona, mode: 'floating', theme: 'auto', openOnLoad: true });
      return state.chat;
    })().catch(e => { console.warn('[frame] chat unavailable', e); return null; }).finally(() => { state.loading = null; });
  }
  return state.loading;
}

function bindHotkey(spec) {
  if (!spec) return;
  const key = spec.split('+').pop().toLowerCase();
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== key) return;
    e.preventDefault();
    openChat();
  });
}

/* ── copy safety net ──────────────────────────────────────────────────────── */
/** Readable names for dataset files and other identifiers that leak into copy. */
export const LABELS = {
  // portal datasets (data/)
  cet_ne_counties: 'CET New England county scores', cet_ne_development: 'New England development activity', cet_ne_rfps: 'New England public bids',
  cet_nyc_archive_summary: 'CET legacy archive summary', fl_lawfirms: 'Frontline law-firm universe', pp_meta: 'Punctual Pros territory profile',
  pp_sales_90d: 'Punctual Pros home sales, January to April 2026', pp_zips: 'Punctual Pros ZIP-code model', ts_parents: 'Thomas Scientific parent accounts', ts_sites: 'Thomas Scientific lab sites',
  // deed records (data/sales/)
  pp_sales_pa_a: 'Punctual Pros deed records (Lancaster, York, Dauphin, Cumberland)', pp_sales_pa_b: 'Punctual Pros deed records (Berks, Lebanon, Franklin, Adams, Perry, Chester, Montgomery)', pp_sales_nj: 'Punctual Pros deed records (NJ)',
  cet_home_sales_ma: 'CET deed records (MA)', cet_home_sales_ct_ri: 'CET deed records (CT and RI)', cet_transfers_ma: 'CET property transfers (MA)', cet_transfers_ct_ri: 'CET property transfers (CT and RI)',
  ts_sales_gloucester_nj: 'Thomas Scientific deed records (Gloucester County, NJ)', bpi_sales_dc: 'BPI deed records (DC)', fh_sales_nyc: 'Fair Harbor deed records (New York City)',
  // research (data/research/)
  ai_agents_portfolio: 'Portfolio AI-agent plan', bpi_filings: 'BPI public filings', bpi_playbook: 'BPI growth plan', bsp_firm: 'BSP firm profile',
  cet_filings: 'CET public filings', cet_opportunities: 'CET opportunity radar', cet_playbook: 'CET growth plan', cet_wwtp_targets: 'CET wastewater-plant targets',
  design_refs: 'Design principles', fairharbor_filings: 'Fair Harbor public filings', fh_playbook: 'Fair Harbor growth plan', fl_midsize_firms: 'Mid-size law firms',
  fl_playbook: 'Frontline growth plan', frontline_filings: 'Frontline public filings', ma_targets_cet: 'CET add-on targets', ma_targets_fl_ts: 'Frontline and Thomas Scientific add-on targets',
  ma_targets_pp: 'Punctual Pros add-on targets', pe_landscape: 'Private-equity landscape', pp_ads: 'Punctual Pros ad plan', pp_demand_model: 'Punctual Pros demand model',
  pp_filings: 'Punctual Pros public filings', pp_market: 'Punctual Pros market profile', pp_nationwide: 'Punctual Pros nationwide plan', pp_storm_events: 'Punctual Pros storm events',
  public_comps: 'Public comparables', rival_filings: 'Competitor filings', serviceos_evidence: 'OS program evidence', thomas_filings: 'Thomas Scientific public filings',
  ts_playbook: 'Thomas Scientific growth plan', voice_ai: 'Voice AI research',
};
const PREFIX = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor', bsp: 'BSP' };
const UPPER = new Set(['sms', 'nws', 'pa', 'nj', 'ct', 'ri', 'ny', 'nyc', 'dc', 'ev', 'ai', 'hvac', 'rfp', 'kpi', 'ebitda', 'crm', 'api', 'id', 'usd', 'os', 'zip', 'fips', 'acs', 'mep', 'roi', 'ltv', 'cac', 'pe', 'ne', 'us', 'url']);
const RX_SNAKE = /(?<![\w@/.#:=$-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(\.(?:json|csv|geojson))?(?![\w@/-]|\.\w)/g;
const RX_ID = /(?<![\w/.#-])[[(]?(?:ra|ref|kb|vs|ag|op|tg|id)-(?:pp|cet|fl|ts|bpi|fh|bsp)(?:-[a-z0-9]+)*[\])]?(?![\w/-])/g;
const RX_NULLP = /\s*\((?:null|undefined|NaN|None)\)/g;
const RX_NULLSEG = /\s*[·|,]\s*(?:null|undefined|NaN)(?=\s*(?:[·|,]|$))/g;
const RX_NAN = /\$?\bNaN\b%?/g;
const RX_ISO = /(?<![\w#/.:-])((?:19|20)\d\d)-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?(?![\w/-]|\.\d)/g;
const RX_UPSNAKE = /(?<![\w@/.#:=$-])([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)(?![\w@/-]|\.\w)/g;
const RX_SLASHSNAKE = /(?<![\w.:/@-])([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*(?:\/[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)+)(?![\w/.@-])/g;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RX_USDATE = /(?<![\w/.-])(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])\/((?:19|20)\d\d)(?![\w/-])/g;
const RX_QUICK = /\b\d{1,2}\/\d{1,2}\/(?:19|20)\d\d\b|_[A-Za-z0-9]|\b(?:ra|ref|kb|vs|ag|op|tg|id)-(?:pp|cet|fl|ts|bpi|fh|bsp)|null|undefined|NaN|None\)|\b(?:19|20)\d\d-(?:0[1-9]|1[0-2])\b/;
/** ISO dates in copy → words ("2026-10-06" → "Oct 6, 2026", "2025-04" → "Apr 2025"). Bid and file numbers ("IFB 2026-01", "#2027-09") and year ranges ("2011-12") are left alone. */
function isoToWords(t) {
  return t.replace(RX_ISO, (m, y, mo, d, off, str) => {
    const before = str.slice(Math.max(0, off - 12), off);
    if (/(?:#|\bNo\.?|\bIFB|\bRFP|\bRFQ|\bITB|\bBid|\bContract|\bProject|\bFile|\bDocket|\bSolicitation)\s*$/i.test(before)) return m;
    if (!d && +mo === (+y + 1) % 100) return m;
    return d ? `${MON[+mo - 1]} ${+d}, ${y}` : `${MON[+mo - 1]} ${y}`;
  });
}
const SKIP_SEL = 'code,pre,kbd,samp,script,style,textarea,input,select,option,noscript,template,svg,math,[data-raw],[contenteditable=""],[contenteditable="true"],.ch-compose';

/** Turn one identifier into words: dictionary first, then a careful split. */
export function label(id) {
  const key = String(id).replace(/\.(json|csv|geojson)$/, '');
  if (LABELS[key]) return LABELS[key];
  const bits = key.split('_').filter(Boolean);
  const words = bits.map((b, i) => (i === 0 && PREFIX[b]) ? PREFIX[b] : UPPER.has(b) ? (b === 'rfp' ? 'RFP' : b.toUpperCase()) : b);
  return keyDates(words.join(' '));
}
/** Dates split out of field keys ("cost_usd_2026_03_31" → "cost USD Mar 31, 2026"). */
export function keyDates(t) { return String(t).replace(/\b((?:19|20)\d\d) (0[1-9]|1[0-2]) (0[1-9]|[12]\d|3[01])\b/g, (m, y, mo, d) => `${MON[+mo - 1]} ${+d}, ${y}`); }
/** Clean one string of copy. Pure; safe to call from renderers before inserting text. */
export function humanizeText(s) {
  if (!s || !RX_QUICK.test(s)) return s;
  let t = s.replace(RX_NULLP, '').replace(RX_NULLSEG, '').replace(RX_NAN, '—');
  t = t.replace(RX_ID, '');
  t = t.replace(RX_SNAKE, (m, id) => label(id));
  t = t.replace(RX_UPSNAKE, m => /[A-Z]/.test(m) ? m.replace(/_+/g, ' ') : m);
  t = t.replace(RX_SLASHSNAKE, m => /_/.test(m) && /[A-Z]/.test(m) ? m.replace(/_+/g, ' ') : m);
  t = t.replace(/\b(Post|Pre)-((?:19|20)\d\d-\d\d-\d\d)\b/g, (m, w, d) => `${w === 'Post' ? 'After' : 'Before'} ${d}`);
  t = t.replace(/(?<![\w#/.:-])((?:19|20)\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/(0[1-9]|[12]\d|3[01])\b/g, (m, y, mo, d1, d2) => `${MON[+mo - 1]} ${+d1}–${+d2}, ${y}`);
  t = isoToWords(t);
  t = t.replace(RX_USDATE, (m, mo, d, y) => `${MON[+mo - 1]} ${+d}, ${y}`);
  const bare = t.trim();
  if (/^(?:null|undefined|NaN)$/.test(bare)) return t.replace(bare, '—');
  if (t !== s) t = t.replace(/\(\s*\)|\[\s*\]/g, '').replace(/([·|])(\s*[·|])+/g, '$1').replace(/ {2,}/g, ' ').replace(/ +([,.;:)])/g, '$1');
  return t;
}
/** Walk visible text under root and rewrite identifiers / null artifacts in place. */
export function humanize(root = document.body) {
  if (!root) return 0;
  if (root.nodeType === 3) return fixText(root) ? 1 : 0;
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return 0;
  const el = root.nodeType === 1 ? root : null;
  if (el && el.closest(SKIP_SEL)) return 0;
  let n = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (fixText(t)) n++;
  const attrs = el ? [el, ...el.querySelectorAll('[title],[aria-label],[alt]')] : [...root.querySelectorAll('[title],[aria-label],[alt]')];
  for (const a of attrs) {
    if (!a.getAttribute || a.closest(SKIP_SEL)) continue;
    for (const k of ['title', 'aria-label', 'alt']) { const v = a.getAttribute(k); if (v && RX_QUICK.test(v)) { const h = humanizeText(v); if (h !== v) { a.setAttribute(k, h); n++; } } }
  }
  return n;
}
function fixText(t) {
  const v = t.nodeValue;
  if (!v || !RX_QUICK.test(v)) return false;
  const p = t.parentElement;
  if (!p || p.closest(SKIP_SEL)) return false;
  const h = humanizeText(v);
  if (h === v) return false;
  t.nodeValue = h;
  return true;
}
function observe(root, words = true) {
  if (state.observer || !('MutationObserver' in window)) return;
  let queue = new Set(), raf = 0;
  state.observer = new MutationObserver(muts => {
    for (const m of muts) for (const node of m.addedNodes) queue.add(node);
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0; const q = queue; queue = new Set(); let scan = false;
      for (const node of q) if (node.isConnected) { if (words) humanize(node); if (node.nodeType === 1) scan = true; }
      if (scan) scrollAccess(root);
    });
  });
  state.observer.observe(root, { childList: true, subtree: true });
}

/* ── accessibility helpers ────────────────────────────────────────────────── */
const SCROLL_SEL = '.sys-table-wrap,.tbl-wrap,.ch-tbl,[data-sys-scroll]';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"]),summary,iframe';
/** A table wrap that scrolls but holds nothing focusable becomes a named, focusable region, so keyboard users can scroll it (axe: scrollable-region-focusable). */
function scrollAccess(root = document.body) {
  if (!root || !root.querySelectorAll) return;
  for (const w of root.querySelectorAll(SCROLL_SEL)) {
    const scrolls = w.scrollWidth > w.clientWidth + 1 || w.scrollHeight > w.clientHeight + 1;
    if (w.dataset.sysScrollA11y) { if (!scrolls) { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); delete w.dataset.sysScrollA11y; } continue; }
    if (!scrolls || w.hasAttribute('tabindex') || w.querySelector(FOCUSABLE)) continue;
    const cap = w.querySelector('caption')?.textContent || w.closest('.panel,.sys-card,section')?.querySelector('h1,h2,h3,h4')?.textContent || 'Table';
    w.setAttribute('tabindex', '0'); w.setAttribute('role', 'region'); w.setAttribute('aria-label', `${cap.trim().slice(0, 80)} (scrollable)`);
    w.dataset.sysScrollA11y = '1';
  }
}

/* ── sub-nav scroll-spy ───────────────────────────────────────────────────── */
function spySubnav() {
  const links = [...document.querySelectorAll('.sys-subnav-links a[href^="#"]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map();
  for (const a of links) { const id = decodeURIComponent(a.getAttribute('href').slice(1)); const sec = id && document.getElementById(id); if (sec) map.set(sec, a); }
  const seen = new Set();
  const io = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target);
    const first = [...map.keys()].find(sec => seen.has(sec));
    for (const a of links) a.removeAttribute('aria-current');
    if (first) { const a = map.get(first); a.setAttribute('aria-current', 'location'); const box = a.parentElement; if (box && (a.offsetLeft < box.scrollLeft || a.offsetLeft + a.offsetWidth > box.scrollLeft + box.clientWidth)) box.scrollTo({ left: Math.max(0, a.offsetLeft - 16) }); }
  }, { rootMargin: '-120px 0px -55% 0px' });
  for (const sec of map.keys()) io.observe(sec);
}

/* ── primary nav: per-page overrides + hash-route current state ───────────── */
const APP_NAV = { briefing: 'app.html#/briefing/play' };
/** NAV with per-page overrides applied: { id: href } or { id: { href, label, hint } }. */
function navFor(over) {
  if (!over || typeof over !== 'object') return NAV;
  return NAV.map(n => {
    const v = over[n.id];
    if (v == null || v === false) return n;
    const o = typeof v === 'string' ? { href: v } : v;
    return { ...n, ...o, external: o.href ? /^[a-z]+:|^\/\//i.test(o.href) && !o.href.startsWith(ROOT) : n.external };
  });
}
/** '#/route' of a nav href when it points into the current page, else null. */
function hashRoute(href) {
  try {
    const u = new URL(url(href), location.href);
    if (u.origin + u.pathname !== location.origin + location.pathname) return null;
    return /^#\//.test(u.hash) ? u.hash : null;
  } catch { return null; }
}
/** aria-current on the top bar and sheet: a hash-route link on this page wins while the hash is on it; otherwise the page's active id. */
function syncCurrent(top, nav, active) {
  const h = location.hash || '';
  const routed = nav.map(n => [n.id, hashRoute(n.href)]).filter(([, r]) => r);
  const hit = routed.find(([, r]) => { const base = r.match(/^#\/[^/?]+/)[0]; return h === base || h.startsWith(base + '/'); });   // '#/briefing/play' owns '#/briefing/…'
  const cur = hit ? hit[0] : active;
  for (const a of top.querySelectorAll('a[data-nav]')) a.dataset.nav === cur ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
}

/* ── mount ────────────────────────────────────────────────────────────────── */
function ensureCSS() {
  if ([...document.styleSheets].some(s => s.href && s.href.includes('/assets/system.css')) || document.querySelector('link[href*="assets/system.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ROOT + 'assets/system.css' + QV; document.head.appendChild(l);
}

function mount(opts = {}) {
  if (state.mounted) return state.mounted;
  ensureCSS();
  const w = where();
  const variant = opts.variant || 'default';
  const o = {
    active: NAV_PARENT[opts.active || w.active] || opts.active || w.active,
    co: opts.co !== undefined ? opts.co : w.co,
    hotkey: opts.hotkey !== undefined ? opts.hotkey : (variant === 'app' ? 'mod+j' : 'mod+k'),
    cta: opts.cta || null,
  };
  o.nav = navFor(opts.nav !== undefined ? opts.nav : (variant === 'app' ? APP_NAV : null));
  state.persona = opts.persona || o.co || 'portal';
  // theme: the visitor's saved choice wins; a 'minimal' page that asks for dark (the 3D map) stays dark
  themeLocked = variant === 'minimal' && opts.theme === 'dark';
  o.themeToggle = !themeLocked && opts.themeToggle !== false;
  applyTheme(themeLocked ? 'dark' : (savedTheme() || (opts.theme === 'dark' ? 'dark' : 'light')));
  if (opts.chat) state.chat = opts.chat;
  const html = document.documentElement, body = document.body;
  body.dataset.sysLayout = variant;
  if (o.co && !body.dataset.co) body.dataset.co = o.co;

  const frag = document.createDocumentFragment();
  if (!document.querySelector('.skip, .sys-skip, a[href="#main"]') && document.getElementById('main')) {
    const s = document.createElement('a'); s.className = 'sys-skip'; s.href = '#main'; s.textContent = 'Skip to content'; frag.appendChild(s);
  }
  const top = document.createElement('header');
  top.className = 'sys-top' + (variant === 'minimal' ? ' sys-top--minimal' : '');
  top.innerHTML = topHTML(o);
  frag.appendChild(top);

  // one page bar: the page's sub-nav carries the crumb's parent and the concept tag; without a sub-nav they share one crumb row
  const tag = (opts.banner !== undefined ? opts.banner : w.concept) && variant !== 'minimal';
  const items = opts.crumb === false ? null : (Array.isArray(opts.crumb) ? opts.crumb : (variant === 'default' ? autoCrumb(w) : null));
  const sub = variant === 'default' ? document.querySelector('.sys-subnav') : null;
  if (sub) foldIntoSubnav(sub, items, tag);
  else if ((items && items.length) || tag) {
    const nav = document.createElement('nav');
    nav.className = 'sys-crumb'; nav.setAttribute('aria-label', 'Breadcrumb');
    nav.innerHTML = crumbHTML(items || [], opts.crumbAside, tag);
    frag.appendChild(nav);
  }
  body.insertBefore(frag, body.firstChild);

  let footer = null;
  const wantFooter = opts.footer !== undefined ? opts.footer : variant === 'default';
  if (wantFooter) {
    footer = document.createElement('footer');
    footer.className = 'sys-footer';
    footer.innerHTML = footerHTML();
    const slot = document.querySelector('[data-sys-footer]');
    if (slot) slot.replaceWith(footer); else body.appendChild(footer);
  }

  // menu sheet
  const menu = top.querySelector('.sys-menu'), sheet = top.querySelector('.sys-sheet');
  const setSheet = (open, focusFirst) => {
    sheet.hidden = !open; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open && focusFirst) sheet.querySelector('a')?.focus();
  };
  menu.addEventListener('click', e => setSheet(sheet.hidden, e.detail === 0));   // keyboard activation moves focus into the sheet
  sheet.addEventListener('click', e => { if (e.target.closest('a')) setSheet(false); });
  document.addEventListener('keydown', e => {
    if (sheet.hidden) return;
    if (e.key === 'Escape') { setSheet(false); menu.focus(); return; }
    if (e.key !== 'Tab') return;
    // focus trap while the sheet is open: the menu button and the sheet links form one loop
    const ring = [menu, ...sheet.querySelectorAll('a[href],button:not([disabled])')].filter(el => el.offsetParent !== null || el === menu);
    const i = ring.indexOf(document.activeElement);
    if (i === -1) { e.preventDefault(); ring[0].focus(); return; }
    const next = e.shiftKey ? (i === 0 ? ring.length - 1 : i - 1) : (i === ring.length - 1 ? 0 : i + 1);
    e.preventDefault(); ring[next].focus();
  });
  document.addEventListener('click', e => { if (!sheet.hidden && !top.contains(e.target)) setSheet(false); });
  matchMedia('(min-width: 961px)').addEventListener?.('change', ev => { if (ev.matches) setSheet(false); });

  // primary nav current state follows hash routes (e.g. app.html#/briefing/play)
  if (o.nav.some(n => hashRoute(n.href))) { syncCurrent(top, o.nav, o.active); window.addEventListener('hashchange', () => syncCurrent(top, o.nav, o.active)); }

  // theme toggle
  top.querySelector('[data-sys-theme-toggle]')?.addEventListener('click', () => toggleTheme());
  paintThemeToggles();

  // ask + hotkey
  top.querySelector('[data-sys-ask]').addEventListener('click', () => openChat());
  bindHotkey(o.hotkey);

  // page sub-nav scroll-spy
  spySubnav();

  // skip link: focus <main> without touching location.hash (hash routers such as app.html read '#main' as a route)
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href="#main"]');
    const main = a && document.getElementById('main');
    if (!main) return;
    e.preventDefault();
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start', behavior: 'auto' });
  });

  // copy safety net
  const hz = opts.humanize !== undefined ? opts.humanize : 'observe';
  if (hz) { humanize(body); if (hz === 'observe') observe(body); }

  // keyboard access for scrolling table wraps (now, after late renders, and on resize)
  scrollAccess(body);
  if (!state.observer) observe(body, false);
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => scrollAccess(body), 200); });
  window.addEventListener('load', () => scrollAccess(body), { once: true });

  state.mounted = { top, banner: null, footer, root: ROOT, page: w, nav: o.nav, openChat, humanize, setTheme, getTheme, toggleTheme, setChat: inst => { state.chat = inst; } };
  return state.mounted;
}

export const Frame = { mount, humanize, humanizeText, label, keyDates, openChat, setTheme, getTheme, toggleTheme, COMPANIES, NAV, LABELS, BANNER_TEXT, DISCLAIMER, PRODUCT, ROOT };
window.BSPFrame = Frame;
export default Frame;
