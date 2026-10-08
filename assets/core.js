/* ═══════════════════════════════════════════════════════════════════════════
   BSP Desk — core runtime (ES module, no build step)
   Exports: Data, Fmt, UI, Maps, Charts, Live, Tour, App
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE = new URL('.', import.meta.url).href.replace(/assets\/$/, '');

/* ── Icons (inline SVG, currentColor) ─────────────────────────────────────── */
const svgI = d => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  search: svgI('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>'),
  play: svgI('<path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/>'),
  stop: svgI('<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>'),
  panel: svgI('<rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M10 2.5v11"/>'),
  sun: svgI('<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>'),
  moon: svgI('<path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z"/>'),
  close: svgI('<path d="m4 4 8 8M12 4l-8 8"/>'),
};

/* ── Theme ────────────────────────────────────────────────────────────────────
   One preference for every page: html[data-sys-theme] = 'light' | 'dark', saved under localStorage 'bsp-theme'
   (light by default, like the site; an explicit saved choice wins). system.css swaps the tokens; html[data-theme] is
   mirrored for older module CSS hooks. Whoever flips the attribute (the console toggle, the frame, the assistant),
   Theme.watch callers hear it: maps swap their tiles in place, so a view keeps its filters and selection. */
const THEME_KEY = 'bsp-theme';
export const Theme = {
  key: THEME_KEY,
  get: () => document.documentElement.dataset.sysTheme === 'dark' ? 'dark' : 'light',
  saved() { try { const t = localStorage.getItem(THEME_KEY); return t === 'dark' || t === 'light' ? t : null; } catch { return null; } },
  apply(t) {
    const h = document.documentElement, v = t === 'dark' ? 'dark' : 'light';
    if (h.dataset.sysTheme !== v) h.dataset.sysTheme = v;
    if (h.dataset.theme !== v) h.dataset.theme = v;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v === 'dark' ? '#0a0e14' : '#fbfaf7');
  },
  set(t) {
    const F = globalThis.BSPFrame;
    if (F && typeof F.setTheme === 'function') { try { F.setTheme(t); } catch { /* frame without a theme API */ } }
    Theme.apply(t);
    try { localStorage.setItem(THEME_KEY, Theme.get()); } catch { /* storage blocked: this page only */ }
  },
  toggle() { Theme.set(Theme.get() === 'dark' ? 'light' : 'dark'); },
  _fns: new Set(), _mo: null,
  /** fn(theme) on every change of html[data-sys-theme]; returns an unsubscribe function. */
  watch(fn) {
    Theme._fns.add(fn);
    if (!Theme._mo && typeof MutationObserver !== 'undefined') {
      let last = Theme.get();
      Theme._mo = new MutationObserver(() => { const t = Theme.get(); if (t === last) return; last = t; Theme.apply(t); for (const f of Theme._fns) { try { f(t); } catch (e) { console.debug(e); } } });
      Theme._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sys-theme'] });
    }
    return () => Theme._fns.delete(fn);
  },
};

/* ── Shared fetches ─────────────────────────────────────────────────────────
   data/manifest.json is read by the frame, the rail, the assistant and the home view: Data.manifest() keeps one
   promise per page (shared across module instances via globalThis), and plain fetch() calls for that exact URL are
   answered from the same request, so the file is downloaded once. Snapshots in data/live/ share one map with
   assets/live.js. */
const SHARED = globalThis.__bspShared || (globalThis.__bspShared = { manifest: null, manifestJson: null, snaps: new Map() });
if (!SHARED.snaps) SHARED.snaps = new Map();
const nativeFetch = globalThis.__bspNativeFetch || (globalThis.__bspNativeFetch = globalThis.fetch.bind(globalThis));
const MANIFEST_URL = BASE + 'data/manifest.json';
function manifestText() {
  if (!SHARED.manifest) {
    const p = nativeFetch(MANIFEST_URL, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`Dataset manifest not found (${r.status})`); return r.text(); });
    SHARED.manifest = p; p.catch(() => { if (SHARED.manifest === p) SHARED.manifest = null; });
  }
  return SHARED.manifest;
}
if (!globalThis.__bspFetchShim) {
  globalThis.__bspFetchShim = true;
  globalThis.fetch = function (input, init) {
    try {
      const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      const method = String(init?.method || (typeof input === 'object' && !(input instanceof URL) && input?.method) || 'GET').toUpperCase();
      if (raw && method === 'GET' && new URL(raw, location.href).href === MANIFEST_URL) {
        return manifestText().then(t => new Response(t, { status: 200, headers: { 'Content-Type': 'application/json' } }), () => nativeFetch(input, init));
      }
    } catch { /* not a URL we share */ }
    return nativeFetch(input, init);
  };
}
function snapshot(name) {
  if (!/^[a-z0-9_]+$/.test(name)) return Promise.resolve(null);
  if (!SHARED.snaps.has(name)) {
    const p = nativeFetch(`${BASE}data/live/${name}.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    SHARED.snaps.set(name, p); p.then(v => { if (v == null && SHARED.snaps.get(name) === p) SHARED.snaps.delete(name); });
  }
  return SHARED.snaps.get(name);
}

/* ── Data ─────────────────────────────────────────────────────────────────── */
const _cache = new Map();
export const Data = {
  /** Load data/<name>.json (or data/research/<name>.json). Decodes the columnar format transparently. */
  async load(name) {
    if (_cache.has(name)) return _cache.get(name);
    if (name === 'manifest') return Data.manifest();
    const p = (async () => {
      // Legacy tables live in data/; everything else (research datasets) lives in data/research/. No probing → no 404 noise.
      const LEGACY = new Set(['cet_ne_counties', 'cet_ne_development', 'cet_ne_rfps', 'cet_nyc_archive_summary', 'pp_zips', 'pp_meta', 'pp_sales_90d', 'fl_lawfirms', 'ts_sites', 'ts_parents', 'manifest']);
      const path = name.includes('/') ? `data/${name}.json` : LEGACY.has(name) ? `data/${name}.json` : `data/research/${name}.json`;
      const r = await fetch(BASE + path, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`Dataset ${name} not found (${r.status})`);
      const j = await r.json();
      return Data.decode(j);
    })();
    _cache.set(name, p);
    p.catch(() => _cache.delete(name));
    return p;
  },
  async _exists(path) { try { const r = await fetch(BASE + path, { method: 'HEAD', cache: 'force-cache' }); return r.ok; } catch { return false; } },
  /** Research files are {meta, items,...}; legacy tables are arrays or columnar. */
  decode(j) {
    if (j && j.format === 'columnar') {
      const { cols, enums, rows } = j;
      const out = rows.map(r => { const o = {}; for (let i = 0; i < cols.length; i++) { const c = cols[i]; let v = r[i]; if (v != null && enums[c]) v = enums[c][v]; o[c] = v; } return o; });
      return j.meta ? { meta: j.meta, items: out } : out;   // wrapped datasets keep {meta, items}
    }
    return j;
  },
  /** Load a research dataset and return {meta, items, ...}; tolerant of missing files (returns null). */
  async research(name) { try { return await Data.load(name); } catch (e) { console.debug(e.message); return null; } },
  /** data/manifest.json, fetched once per page however many callers ask (frame, rail, counter, assistant, home). */
  manifest() {
    if (!SHARED.manifestJson) { const p = manifestText().then(t => JSON.parse(t)); SHARED.manifestJson = p; p.catch(() => { if (SHARED.manifestJson === p) SHARED.manifestJson = null; }); }
    return SHARED.manifestJson;
  },
  clear() { _cache.clear(); },
};

/* ── Formatting ───────────────────────────────────────────────────────────── */
const parseDate = v => { if (v instanceof Date) return v; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v); };
export const Fmt = {
  num: (n, d = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }),
  compact: n => n == null || isNaN(n) ? '—' : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(Math.abs(n) >= 1e8 ? 0 : 1) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(Math.abs(n) >= 1e5 ? 0 : 1) + 'K' : String(Math.round(n)),
  money: (n, d) => n == null || isNaN(n) ? '—' : '$' + Fmt.compact(n),
  moneyFull: n => n == null || isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }),
  pct: (n, d = 0) => n == null || isNaN(n) ? '—' : (Number(n) * (Math.abs(n) <= 1.5 ? 100 : 1)).toFixed(d) + '%',
  pct1: n => Fmt.pct(n, 1),
  date: s => { if (!s) return '—'; const d = parseDate(s); return isNaN(d) ? esc(s) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); },
  dateShort: s => { if (!s) return '—'; const d = parseDate(s); return isNaN(d) ? esc(s) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); },
  title: s => String(s ?? '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Llc|Llp|Inc|Pc|Lp|Md|Do|Dds|Rn|Np|Hvac|Nyc|Ct|Ma|Ri|Nh|Me|Vt|Pa|Nj|Ny|Md|Cet|Ii|Iii|Iv)\b/g, m => m.toUpperCase()),
  days: s => { if (!s) return null; const d = parseDate(s); if (isNaN(d)) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); },
  score: (v, color) => `<span class="score" style="--sc:${color || Fmt.scoreColor(v)}"><span class="bar"><i style="width:${Math.max(0, Math.min(100, v || 0))}%"></i></span>${v == null ? '—' : Math.round(v)}</span>`,
  scoreColor: v => v >= 80 ? 'var(--green)' : v >= 60 ? 'var(--accent)' : v >= 40 ? 'var(--amber)' : 'var(--dim)',
  /** Tier chip: a .sys-chip status chip (Tier 1 good · 2 info · 3 warn · 4 neutral); .chip.t<n> kept for module CSS hooks. */
  tier: t => { const s = String(t ?? '').toLowerCase(); const n = (s.match(/\d/) || ['4'])[0]; const st = { 1: ' sys-chip--good', 2: ' sys-chip--info', 3: ' sys-chip--warn' }[n] || ''; return `<span class="sys-chip${st} chip t${n}">${esc(t)}</span>`; },
  /** Chip: a neutral .sys-chip, or with a colour a .sys-chip--soft tinted by that accent (data-co derives the text-safe shade). */
  chip: (t, color) => color ? `<span class="sys-chip sys-chip--soft chip" data-co="" style="--co:${color};--cc:${color}">${esc(t)}</span>` : `<span class="sys-chip chip">${esc(t)}</span>`,
  list: (a, n = 3) => Array.isArray(a) ? a.slice(0, n).map(x => esc(x)).join(', ') + (a.length > n ? ` +${a.length - n}` : '') : esc(a),
  link: (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || (new URL(u, 'https://x').hostname.replace('www.', '')))}</a>` : '—',
  host: u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } },
};

/* ── UI components ────────────────────────────────────────────────────────── */
/* Every helper writes system.css components (.sys-card, .sys-kpi, .sys-table, .sys-chip, .sys-btn, .sys-note,
   .sys-est …) and keeps the old console class on the same element (class="sys-card panel") so module CSS hooks such
   as `.m-ts .ikpis .kpi .value` keep matching. Look comes from system.css; app.css only lays the console out.
   Old → system map: UNIFIED.md §8. */
const NOTE_KIND = { warn: 'warn', good: 'good', bad: 'bad', brand: 'co', info: 'info' };
const btnCls = (variant = 'secondary', size = 'sm', legacy = '') => `sys-btn sys-btn--${variant}${size ? ` sys-btn--${size}` : ''} btn${legacy ? ' ' + legacy : ''}`;
export const UI = {
  btnCls,
  kpi: ({ label, value, sub, delta, color, spark, small }) => `<div class="sys-kpi kpi"${color ? ` style="--kc:${color}"` : ''}><div class="sys-kpi-label label">${color ? `<span class="sys-dot" style="--co:${color}" aria-hidden="true"></span>` : ''}${esc(label)}</div><div class="sys-kpi-value value">${value}${small ? `<small>${esc(small)}</small>` : ''}${delta != null ? `<span class="sys-delta ${delta > 0 ? 'sys-delta--up delta up' : delta < 0 ? 'sys-delta--down delta down' : 'sys-muted delta flat'}">${delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} ${esc(typeof delta === 'number' ? Math.abs(delta) : delta)}</span>` : ''}</div>${sub ? `<div class="sys-kpi-sub sub">${sub}</div>` : ''}${spark ? `<div class="spark">${spark}</div>` : ''}</div>`,
  kpis: items => `<div class="sys-kpis kpis">${items.map(UI.kpi).join('')}</div>`,
  /** Card with a head (title, sub, actions), a body and a source line. accent → the module accent bar (.sys-card[data-co]). */
  panel: ({ title, sub, actions, body, foot, cls = '', id = '', accent = false, flush = false, scroll = false }) => `<section class="sys-card panel${accent ? ' accent' : ''}${cls ? ' ' + cls : ''}"${accent ? ' data-co=""' : ''}${id ? ` id="${id}"` : ''}>${title ? `<div class="panel-head"><div class="panel-title"><h3 class="sys-card-title">${title}</h3>${sub ? `<div class="sys-card-body sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>` : ''}<div class="panel-body${flush ? ' flush' : ''}${scroll ? ' scroll' : ''}">${body}</div>${foot ? `<div class="sys-src panel-foot">${foot}</div>` : ''}</section>`,
  source: (text, url, asof) => `<span class="src">Source: ${url ? Fmt.link(url, text) : esc(text)}${asof ? ` · as of ${esc(asof)}` : ''}</span>`,
  /** View heading: .sys-h1 + .sys-lead, status chips in .sys-chips, buttons in .sys-actions. */
  pageHead: ({ title, sub, actions, chips }) => `<header class="page-head"><div class="page-head-copy"><h1 class="sys-h1">${title}</h1>${sub ? `<div class="sys-lead sub">${sub}</div>` : ''}${chips ? `<div class="sys-chips chips">${chips}</div>` : ''}</div>${actions ? `<div class="sys-actions actions">${actions}</div>` : ''}</header>`,
  empty: msg => `<div class="empty">${esc(msg || 'No data')}</div>`,
  loading: msg => `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(msg || 'Loading…')}</div>`,
  /** Note: '' or 'info' → .sys-note--info, 'warn', 'good', 'bad', 'brand' (→ .sys-note--co, the module accent). */
  note: (html, kind = '') => `<div class="sys-note sys-note--${NOTE_KIND[kind] || 'info'} note${kind ? ' ' + kind : ''}">${html}</div>`,
  kv: obj => `<dl class="kv">${Object.entries(obj).filter(([k, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${Array.isArray(v) ? `<span class="sys-chips">${v.map(x => `<span class="sys-chip chip">${esc(x)}</span>`).join('')}</span>` : v}</dd>`).join('')}</dl>`,
  timeline: items => `<div class="timeline">${items.map(i => `<div class="tl-item" style="${i.color ? `--cc:${i.color}` : ''}"><div class="d">${esc(i.date)}</div><div class="e">${i.html || esc(i.text)}</div></div>`).join('')}</div>`,
  toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'sys-note sys-note--info toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); },
  /** Segmented choice: .sys-chip buttons in a .sys-chips group; the pressed one is the selected (ink) chip. */
  seg(el, options, value, onChange) { el.innerHTML = `<div class="sys-chips seg" role="group">${options.map(o => `<button type="button" data-v="${esc(o.value)}" class="sys-chip${o.value === value ? ' active' : ''}" aria-pressed="${o.value === value}">${esc(o.label)}</button>`).join('')}</div>`; $$('button', el).forEach(b => b.onclick = () => { $$('button', el).forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); onChange(b.dataset.v); }); },
  /** Filter bar. filters: [{key,label,type:'select'|'search'|'toggle',options:[{value,label}],value}] → .sys-input / .sys-field / pressed .sys-chip */
  filters(el, filters, onChange) {
    el.innerHTML = `<div class="sys-filters filters">${filters.map(f => f.type === 'search' ? `<input class="sys-input" type="search" data-k="${f.key}" placeholder="${esc(f.label)}" aria-label="${esc(f.label)}" value="${esc(f.value || '')}">` : f.type === 'toggle' ? `<button type="button" class="sys-chip${f.value ? ' active' : ''}" data-k="${f.key}" data-toggle aria-pressed="${f.value ? 'true' : 'false'}">${esc(f.label)}</button>` : `<label class="sys-field f"><span class="sys-field-label">${esc(f.label)}</span><select class="sys-input" data-k="${f.key}"><option value="">All</option>${(f.options || []).map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`).join('')}<span class="sys-src count" data-count></span></div>`;
    const state = Object.fromEntries(filters.map(f => [f.key, f.value ?? (f.type === 'toggle' ? false : '')]));
    const emit = () => onChange(state);
    $$('select', el).forEach(s => s.onchange = () => { state[s.dataset.k] = s.value; emit(); });
    $$('input[type=search]', el).forEach(i => { let t; i.oninput = () => { clearTimeout(t); t = setTimeout(() => { state[i.dataset.k] = i.value; emit(); }, 180); }; });
    $$('[data-toggle]', el).forEach(b => b.onclick = () => { state[b.dataset.k] = !state[b.dataset.k]; b.classList.toggle('active', state[b.dataset.k]); b.setAttribute('aria-pressed', String(!!state[b.dataset.k])); emit(); });
    return { state, setCount: n => { const c = $('[data-count]', el); if (c) c.textContent = n; } };
  },
  /** Sortable, paginated .sys-table in a .sys-table-wrap scroller. columns: [{key,label,fmt(v,row),num,width,wrap,sort(a,b)}] */
  table(el, { columns, rows, pageSize = 50, onRow, selectedKey, rowKey = r => r.id, exportName, sortKey, sortDir = -1, rowClass }) {
    let page = 0, sk = sortKey || null, sd = sortDir, data = rows.slice(), selected = null;
    const sortRows = () => { if (!sk) return; const col = columns.find(c => c.key === sk); const cmp = col?.sort || ((a, b) => { const x = a[sk], y = b[sk]; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); }); const nul = v => v == null || v === '' || (typeof v === 'number' && isNaN(v)); data.sort((a, b) => { const na = nul(a[sk]), nb = nul(b[sk]); if (na && nb) return 0; if (na) return 1; if (nb) return -1; return cmp(a, b) * sd; }); };
    const render = () => {
      sortRows(); const start = page * pageSize, slice = data.slice(start, start + pageSize), pages = Math.max(1, Math.ceil(data.length / pageSize));
      el.innerHTML = `<div class="sys-table-wrap tbl-wrap"><table class="sys-table tbl"><thead><tr>${columns.map(c => `<th data-k="${c.key}" class="${c.num ? 'sys-n num' : ''}${sk === c.key ? ' sorted' : ''}" style="${c.width ? `width:${c.width}` : ''}" tabindex="0" aria-sort="${sk === c.key ? (sd > 0 ? 'ascending' : 'descending') : 'none'}">${esc(c.label)}${sk === c.key ? `<span class="arr" aria-hidden="true">${sd > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>${slice.length ? slice.map((r, i) => `<tr data-i="${start + i}" class="${selected != null && rowKey(r) === selected ? 'selected' : ''} ${rowClass ? rowClass(r) : ''}"${onRow ? ` tabindex="0"${selected != null && rowKey(r) === selected ? ' aria-selected="true"' : ''}` : ''}>${columns.map(c => `<td class="${c.num ? 'sys-n num' : ''} ${c.wrap ? 'wrap' : ''}" title="${c.title ? esc(c.title(r)) : ''}">${c.fmt ? c.fmt(r[c.key], r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="empty">No rows match</div></td></tr>`}</tbody></table></div><div class="tbl-foot"><span class="sys-src">${Fmt.num(data.length)} rows</span>${exportName ? `<button type="button" class="${btnCls('secondary', 'sm', 'xs')}" data-export>⇩ CSV</button>` : ''}<div class="pages"><button type="button" class="${btnCls('ghost', 'sm', 'xs ghost')}" data-pg="-1" aria-label="Previous page" ${page === 0 ? 'disabled' : ''}>‹</button><span class="sys-src">${page + 1} / ${pages}</span><button type="button" class="${btnCls('ghost', 'sm', 'xs ghost')}" data-pg="1" aria-label="Next page" ${page >= pages - 1 ? 'disabled' : ''}>›</button></div></div>`;
      $$('th', el).forEach(th => { th.onclick = () => { const k = th.dataset.k; if (sk === k) sd = -sd; else { sk = k; sd = -1; } page = 0; render(); $(`th[data-k="${CSS.escape(k)}"]`, el)?.focus({ preventScroll: true }); }; th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.onclick(); } }; });
      $$('[data-pg]', el).forEach(b => b.onclick = () => { page = Math.max(0, Math.min(Math.ceil(data.length / pageSize) - 1, page + Number(b.dataset.pg))); render(); });
      $$('tbody tr', el).forEach(tr => { tr.onclick = () => { const r = data[Number(tr.dataset.i)]; if (!r) return; selected = rowKey(r); $$('tbody tr', el).forEach(x => { x.classList.toggle('selected', x === tr); if (onRow) x.toggleAttribute('aria-selected', x === tr); }); onRow && onRow(r); }; if (onRow) tr.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); tr.onclick(); } }; });
      const ex = $('[data-export]', el); if (ex) ex.onclick = () => UI.exportCSV(data, columns, exportName);
    };
    render();
    return { update(newRows) { data = newRows.slice(); page = 0; render(); }, get rows() { return data; }, select(key) { selected = key; render(); } };
  },
  exportCSV(rows, columns, name) {
    const cols = columns ? columns.map(c => c.key) : Object.keys(rows[0] || {});
    const cell = v => { if (v == null) return ''; const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `${name || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    UI.toast(`Exported ${rows.length} rows`);
  },
  /** Selectable list of .sys-card items in a .sys-grid; each card carries its accent as the .sys-card[data-co] top bar. */
  cards(items, { color, onSelect, selectedId } = {}) {
    return `<div class="sys-grid cards">${items.map(i => { const c = i.color || color || 'var(--sys-line-2)'; return `<div class="sys-card sys-card--link card${i.id === selectedId ? ' selected' : ''}" data-co="" data-id="${esc(i.id)}" style="--co:${c};--cc:${c}" tabindex="0" role="button"${i.id === selectedId ? ' aria-pressed="true"' : ''}><div class="sys-card-title t">${i.title}${i.rank != null ? `<span class="sys-num rk">#${i.rank}</span>` : ''}</div>${i.sub ? `<div class="sys-card-body s">${i.sub}</div>` : ''}${i.chips ? `<div class="sys-chips m">${i.chips}</div>` : ''}</div>`; }).join('')}</div>`;
  },
  bindCards(el, items, onSelect) { $$('.card', el).forEach(c => { c.onclick = () => { $$('.card', el).forEach(x => { x.classList.toggle('selected', x === c); x.toggleAttribute('aria-pressed', x === c); }); onSelect(items.find(i => String(i.id) === c.dataset.id)); }; c.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); c.onclick(); } }; }); },
};

/* ── Inspector (right panel) ──────────────────────────────────────────────── */
export const Inspector = {
  /** Right-hand drawer (#inspector is a .sys-card): accent bar from `color`, sections with .sys-card-label heads, .sys-btn actions. */
  open({ title, sub, color, sections = [], actions = [] }) {
    const el = $('#inspector'); if (!el) return;
    const c = color || 'var(--mc, var(--sys-brand))';
    el.dataset.co = ''; el.style.setProperty('--co', c); el.style.setProperty('--mc', c);
    el.innerHTML = `<div class="insp-head" style="--mc:${c}"><div class="grow"><h2 class="sys-card-title">${title}</h2>${sub ? `<div class="sys-kpi-sub sub">${sub}</div>` : ''}</div><button class="${btnCls('ghost', 'sm', 'icon-btn')} sys-btn--icon" type="button" data-close title="Close (Esc)" aria-label="Close inspector">${ICON.close}</button></div><div class="insp-body">${sections.map(s => `<section class="insp-sec">${s.label ? `<h4 class="sys-card-label">${esc(s.label)}</h4>` : ''}${s.html}</section>`).join('')}</div>${actions.length ? `<div class="insp-actions">${actions.map(a => a.href ? `<a class="${btnCls('secondary', 'sm', 'sm')}" href="${esc(a.href)}" target="_blank" rel="noopener">${a.label}</a>` : `<button type="button" class="${btnCls('secondary', 'sm', 'sm')}" data-act="${esc(a.id)}">${a.label}</button>`).join('')}</div>` : ''}`;
    const wasOpen = el.classList.contains('open');
    el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
    // keyboard: remember what opened the inspector and move focus to its close button; Esc or close hands focus back
    const from = document.activeElement;
    if (!wasOpen || !el.contains(from)) Inspector._from = from && from !== document.body ? from : null;
    if (Inspector._from && Inspector._from.matches?.(':focus-visible')) $('[data-close]', el)?.focus({ preventScroll: true });
    $('[data-close]', el).onclick = () => Inspector.close();
    actions.forEach(a => { if (a.onClick) { const b = $(`[data-act="${a.id}"]`, el); if (b) b.onclick = a.onClick; } });
  },
  close() {
    const el = $('#inspector'); if (!el) return;
    const had = el.contains(document.activeElement);
    el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); setTimeout(() => { if (!el.classList.contains('open')) el.innerHTML = ''; }, 250);
    const back = Inspector._from; Inspector._from = null;
    if (had && back && back.isConnected) back.focus({ preventScroll: true });
  },
};

/* ── Maps (Leaflet) ───────────────────────────────────────────────────────── */
const TILES = {
  // Esri Canvas tiles: key-free, dark + light, labels as a separate reference layer (CARTO free tiles now require an API key).
  dark: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16 },
  light: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16 },
};
export const Maps = {
  create(el, { center = [41.5, -73.5], zoom = 7, minZoom = 4, maxZoom = 18 } = {}) {
    if (!window.L) throw new Error('Leaflet not loaded');
    const map = L.map(el, { center, zoom, minZoom, maxZoom: Math.min(maxZoom, 16), zoomControl: true, preferCanvas: true, attributionControl: true });
    Maps._tile(map, Theme.get()); Maps._live.add(map);
    map._renderer = L.canvas({ padding: 0.5 });
    setTimeout(() => map.invalidateSize(), 60); setTimeout(() => map.invalidateSize(), 240);
    return map;
  },
  /** Base + label tiles for a theme; a theme change swaps them on every live map (Theme.watch below). */
  _live: new Set(),
  _tile(map, theme) {
    const T = TILES[theme === 'dark' ? 'dark' : 'light'];
    if (map._bspTiles) { for (const l of map._bspTiles) map.removeLayer(l); }
    const base = L.tileLayer(T.url, { attribution: T.attr, maxZoom: T.maxZoom, maxNativeZoom: T.maxZoom }).addTo(map);
    const ref = L.tileLayer(T.ref, { maxZoom: T.maxZoom, maxNativeZoom: T.maxZoom, pane: 'shadowPane', opacity: .9 }).addTo(map);
    base.bringToBack(); map._bspTiles = [base, ref]; map._bspTheme = theme;
  },
  retheme(theme = Theme.get()) {
    for (const map of Maps._live) {
      const c = map.getContainer?.();
      if (!c || !c.isConnected) { Maps._live.delete(map); continue; }
      if (map._bspTheme !== theme) { try { Maps._tile(map, theme); } catch (e) { console.debug(e); } }
    }
  },
  /** Add points. rows need lat/lon (or latKey/lonKey). opts: color(row)|string, radius(row)|n, popup(row)->html, onClick(row), cluster:boolean */
  points(map, rows, { latKey = 'lat', lonKey = 'lon', color = '#4c8dff', radius = 5, popup, onClick, cluster = true, opacity = .85, weight = 1, stroke = '#0a0e14', clusterZoom = 9, gridDeg } = {}) {
    const group = L.layerGroup().addTo(map);
    const valid = rows.filter(r => r[latKey] != null && r[lonKey] != null && !isNaN(r[latKey]) && !isNaN(r[lonKey]));
    const colorOf = r => typeof color === 'function' ? color(r) : color;
    const radOf = r => typeof radius === 'function' ? radius(r) : radius;
    const draw = () => {
      group.clearLayers(); const z = map.getZoom();
      if (cluster && valid.length > 600 && z < clusterZoom) {
        const g = gridDeg || (z <= 5 ? 0.6 : z <= 6 ? 0.35 : z <= 7 ? 0.2 : 0.1); const bins = new Map();
        for (const r of valid) { const k = `${Math.floor(r[latKey] / g)}:${Math.floor(r[lonKey] / g)}`; let b = bins.get(k); if (!b) { b = { n: 0, lat: 0, lon: 0, rows: [] }; bins.set(k, b); } b.n++; b.lat += r[latKey]; b.lon += r[lonKey]; if (b.rows.length < 5) b.rows.push(r); }
        for (const b of bins.values()) { const c = colorOf(b.rows[0]); const m = L.circleMarker([b.lat / b.n, b.lon / b.n], { renderer: map._renderer, radius: Math.min(26, 6 + Math.sqrt(b.n) * 1.6), color: c, weight: 1, fillColor: c, fillOpacity: .35 }); m.bindTooltip(`${b.n.toLocaleString()} items`, { direction: 'top' }); m.on('click', () => map.setView(m.getLatLng(), Math.min(map.getZoom() + 2, 14))); group.addLayer(m); }
        return;
      }
      const bounds = map.getBounds().pad(0.3);
      for (const r of valid) {
        if (valid.length > 2000 && !bounds.contains([r[latKey], r[lonKey]])) continue;
        const c = colorOf(r); const m = L.circleMarker([r[latKey], r[lonKey]], { renderer: map._renderer, radius: radOf(r), color: stroke, weight, fillColor: c, fillOpacity: opacity });
        if (popup) m.bindPopup(() => popup(r), { maxWidth: 320 });
        if (onClick) m.on('click', () => onClick(r));
        group.addLayer(m);
      }
    };
    draw(); const h = () => draw(); map.on('zoomend moveend', h);
    return { layer: group, rows: valid, redraw: draw, remove() { map.off('zoomend moveend', h); map.removeLayer(group); }, fit(pad = 0.08) { if (valid.length) map.fitBounds(L.latLngBounds(valid.map(r => [r[latKey], r[lonKey]])), { padding: [20, 20], maxZoom: 11 }); } };
  },
  marker(map, lat, lon, { color = '#d9622b', label, popup, size = 12 } = {}) {
    const icon = L.divIcon({ className: '', html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid var(--sys-bg,#fff);box-shadow:0 0 0 3px ${color}55,0 2px 8px rgba(0,0,0,.35)"></div>${label ? `<div style="position:absolute;left:0;top:100%;margin-top:4px;transform:translateX(calc(-50% + ${size/2}px));white-space:nowrap;font:600 11px/1.2 Inter,system-ui,sans-serif;color:var(--sys-ink,#0f172a);background:color-mix(in srgb,var(--sys-bg,#fff) 88%,transparent);border:1px solid var(--sys-line,rgba(0,0,0,.12));border-radius:999px;padding:2px 7px;pointer-events:none">${esc(label)}</div>` : ''}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    const m = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map); if (popup) m.bindPopup(popup); return m;
  },
  legend(map, items, title) { const d = L.control({ position: 'bottomright' }); d.onAdd = () => { const div = L.DomUtil.create('div', 'map-legend'); div.innerHTML = `${title ? `<div class="t">${esc(title)}</div>` : ''}${items.map(i => `<div class="li"><span class="sw" style="background:${i.color};${i.ring ? `background:transparent;border:2px solid ${i.color}` : ''}"></span>${esc(i.label)}</div>`).join('')}`; return div; }; d.addTo(map); return d; },
  overlay(map, html) { const d = L.control({ position: 'topleft' }); d.onAdd = () => { const div = L.DomUtil.create('div', 'map-overlay'); div.innerHTML = html; L.DomEvent.disableClickPropagation(div); return div; }; d.addTo(map); return d; },
  circle(map, lat, lon, meters, { color = '#4c8dff', fill = .06, dash } = {}) { return L.circle([lat, lon], { radius: meters, color, weight: 1.2, fillColor: color, fillOpacity: fill, dashArray: dash }).addTo(map); },
  geojson(map, gj, opts = {}) { return L.geoJSON(gj, Object.assign({ style: f => ({ color: opts.color || '#4c8dff', weight: 1, fillColor: opts.fill ? opts.fill(f) : (opts.color || '#4c8dff'), fillOpacity: opts.fillOpacity ?? .15 }) }, opts)).addTo(map); },
  fitPoints(map, pts, maxZoom = 10) { if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom }); },
};

/* ── Charts (inline SVG, theme-aware) ─────────────────────────────────────── */
const svgWrap = (w, h, inner, cls = '') => `<svg class="chart ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px">${inner}</svg>`;
export const Charts = {
  palette: ['#4c8dff', '#f08a3c', '#2ecc8f', '#9d7bff', '#f5b73d', '#3fd0e0', '#e05c8a', '#ff5c5c', '#8ab4ff', '#c9a0ff'],
  sparkline(values, { w = 90, h = 26, color = 'var(--accent)' } = {}) {
    const v = values.filter(x => x != null); if (v.length < 2) return ''; const max = Math.max(...v), min = Math.min(...v), rng = max - min || 1;
    const pts = v.map((y, i) => `${(i / (v.length - 1)) * w},${h - 2 - ((y - min) / rng) * (h - 4)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}"/><circle cx="${w}" cy="${h - 2 - ((v[v.length - 1] - min) / rng) * (h - 4)}" r="2" fill="${color}"/></svg>`;
  },
  /** Vertical bars. data: [{label, value, color?}] */
  bar(data, { h = 180, color = 'var(--accent)', fmt = Fmt.compact, labelEvery = 1, maxBars = 60, highlight } = {}) {
    data = data.slice(0, maxBars); const w = 600, padL = 36, padB = 26, padT = 12; const max = Math.max(1, ...data.map(d => d.value || 0)); const bw = (w - padL - 8) / data.length;
    const bars = data.map((d, i) => { const bh = ((d.value || 0) / max) * (h - padB - padT); const x = padL + i * bw; return `<rect x="${x + bw * 0.12}" y="${h - padB - bh}" width="${bw * 0.76}" height="${bh}" rx="2" fill="${d.color || (highlight && highlight(d) ? 'var(--brand-2)' : color)}"><title>${esc(d.label)}: ${fmt(d.value)}</title></rect>${i % labelEvery === 0 ? `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle">${esc(String(d.label).slice(0, 10))}</text>` : ''}`; }).join('');
    const ticks = [0, .5, 1].map(t => `<g class="tick"><line x1="${padL}" x2="${w - 4}" y1="${h - padB - t * (h - padB - padT)}" y2="${h - padB - t * (h - padB - padT)}"/><text x="${padL - 4}" y="${h - padB - t * (h - padB - padT) + 3}" text-anchor="end">${fmt(max * t)}</text></g>`).join('');
    return svgWrap(w, h, ticks + bars);
  },
  /** Horizontal bars. data: [{label, value, color?, sub?}] */
  hbar(data, { color = 'var(--accent)', fmt = Fmt.compact, max, labelW = 150 } = {}) {
    const mx = max || Math.max(1, ...data.map(d => d.value || 0));
    return `<div class="col gap-4">${data.map(d => `<div class="row" style="gap:8px"><div class="ellipsis small text-2" style="width:${labelW}px;flex-shrink:0" title="${esc(d.label)}">${esc(d.label)}</div><div class="grow" style="height:10px;background:var(--surface-3);border-radius:3px;overflow:hidden"><div style="width:${((d.value || 0) / mx) * 100}%;height:100%;background:${d.color || color};border-radius:3px"></div></div><div class="num small" style="width:64px;text-align:right;flex-shrink:0">${fmt(d.value)}</div></div>`).join('')}</div>`;
  },
  /** Line chart. series: [{name, color, points:[[x(label|number), y]]}] — x categorical by index */
  line(series, { h = 200, fmt = Fmt.compact, xLabels, area = false } = {}) {
    const w = 600, padL = 40, padR = 26, padB = 24, padT = 10; const all = series.flatMap(s => s.points.map(p => p[1])).filter(v => v != null); const max = Math.max(1, ...all), min = Math.min(0, ...all); const n = Math.max(...series.map(s => s.points.length)); const xs = i => padL + (i / Math.max(1, n - 1)) * (w - padL - padR); const ys = v => padT + (1 - (v - min) / (max - min || 1)) * (h - padT - padB);
    const ticks = [0, .5, 1].map(t => { const v = min + t * (max - min); return `<g class="tick"><line x1="${padL}" x2="${w - padR}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${padL - 5}" y="${ys(v) + 3}" text-anchor="end">${fmt(v)}</text></g>`; }).join('');
    const labels = (xLabels || series[0].points.map(p => p[0])).map((l, i) => (n <= 14 || i % Math.ceil(n / 12) === 0) ? `<text x="${xs(i)}" y="${h - 6}" text-anchor="${i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${esc(String(l).slice(0, 8))}</text>` : '').join('');
    const lines = series.map((s, si) => { const c = s.color || Charts.palette[si % 10]; const pts = s.points.map((p, i) => p[1] == null ? null : `${xs(i)},${ys(p[1])}`).filter(Boolean); return `${area ? `<polygon points="${xs(0)},${ys(min)} ${pts.join(' ')} ${xs(s.points.length - 1)},${ys(min)}" fill="${c}" opacity=".12"/>` : ''}<polyline fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" points="${pts.join(' ')}"/>${s.points.map((p, i) => p[1] == null ? '' : `<circle cx="${xs(i)}" cy="${ys(p[1])}" r="2.5" fill="${c}"><title>${esc(s.name)} · ${esc(p[0])}: ${fmt(p[1])}</title></circle>`).join('')}`; }).join('');
    return svgWrap(w, h, ticks + labels + lines);
  },
  /** Heat grid. rows: [labels], cols: [labels], values: 2D array, color scale via opacity */
  heatgrid(rows, cols, values, { fmt = v => v, color = '76,141,255', max } = {}) {
    const mx = max || Math.max(1, ...values.flat().filter(v => v != null));
    return `<div class="tbl-wrap"><table class="tbl heat"><thead><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td class="nowrap" style="text-align:left;font-family:var(--font)">${esc(r)}</td>${cols.map((c, j) => { const v = values[i][j]; const a = v == null ? 0 : Math.min(1, v / mx); return `<td style="background:rgba(${color},${(a * 0.85).toFixed(2)});color:${a > .55 ? '#fff' : 'var(--text-2)'}" title="${esc(r)} · ${esc(c)}: ${fmt(v)}">${v == null ? '' : fmt(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  },
  donut(data, { size = 120, thick = 16, fmt = Fmt.compact } = {}) {
    const tot = data.reduce((a, d) => a + (d.value || 0), 0) || 1; let acc = 0; const r = (size - thick) / 2, C = 2 * Math.PI * r;
    const segs = data.map((d, i) => { const f = (d.value || 0) / tot; const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${d.color || Charts.palette[i % 10]}" stroke-width="${thick}" stroke-dasharray="${f * C} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(d.label)}: ${fmt(d.value)} (${Math.round(f * 100)}%)</title></circle>`; acc += f; return s; }).join('');
    return `<div class="row gap-12"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segs}<text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" style="font-size:13px;font-weight:600;fill:var(--text)">${fmt(tot)}</text></svg><div class="legend col gap-4">${data.map((d, i) => `<span><i style="background:${d.color || Charts.palette[i % 10]}"></i>${esc(d.label)} <span class="num dim">${Math.round(((d.value || 0) / tot) * 100)}%</span></span>`).join('')}</div></div>`;
  },
};

/* ── Live data (NWS alerts, Open-Meteo forecast) ──────────────────────────── */
/* One helper for every public weather API call: 6 s timeout, one retry with backoff on 429, 5xx, timeout or network
   failure, a 10-minute sessionStorage cache (so repeated views and CI sweeps do not hit rate limits) and a 2-minute
   failure marker that sends repeat calls straight to the snapshot. When the API stays down, nwsAlerts and forecast
   resolve from the nightly snapshot in data/live/*.json (scripts/refresh_live.py) and the page shows a
   "snapshot from <date>" note instead of an error. */
const LIVE_CFG = { timeout: 6000, ttl: 10 * 60e3, failTtl: 2 * 60e3, prefix: 'bsp-live:' };
const _live = new Map(), _liveInflight = new Map();
/* Per-host guard: until a host has answered once this session, its first call goes alone and the rest wait for it, so a
   rate-limited API (HTTP 429) costs one request rather than one per hub; a 429 then sends that host's calls straight
   to the snapshot for the failure window. */
const _hostOk = new Set(), _hostGate = new Map();
const liveHost = u => { try { return new URL(u).host; } catch { return ''; } };
class LiveError extends Error { constructor(msg, status = 0, retryAfter = null) { super(msg); this.name = 'LiveError'; this.status = status; this.retryAfter = retryAfter; } }
const ssGet = k => { try { const s = sessionStorage.getItem(LIVE_CFG.prefix + k); return s ? JSON.parse(s) : null; } catch { return null; } };
const ssSet = (k, o) => {
  let s; try { s = JSON.stringify(o); } catch { return; }
  try { sessionStorage.setItem(LIVE_CFG.prefix + k, s); }
  catch { try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key && key.startsWith(LIVE_CFG.prefix)) sessionStorage.removeItem(key); } sessionStorage.setItem(LIVE_CFG.prefix + k, s); } catch { /* storage full or blocked: memory cache only */ } }
};
const liveSleep = ms => new Promise(r => setTimeout(r, ms));
async function liveAttempt(url, init) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), LIVE_CFG.timeout);
  try {
    const r = await nativeFetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new LiveError(`${r.status} ${url}`, r.status, r.headers.get('Retry-After'));
    return await r.json();
  } catch (e) {
    if (e instanceof LiveError) throw e;
    throw new LiveError(`${e?.name === 'AbortError' ? 'timeout' : 'network'} ${url}`, 0);
  } finally { clearTimeout(timer); }
}
/** GET a public JSON API through the shared timeout / retry / cache path. Rejects with a LiveError ({status}) after one retry. */
async function fetchLive(url, { ttl = LIVE_CFG.ttl, headers } = {}) {
  const now = Date.now();
  const hit = _live.get(url) || ssGet(url);
  if (hit && now - hit.t < ttl) { _live.set(url, hit); return hit.v; }
  const fail = _live.get(url + '#fail') || ssGet(url + '#fail');
  if (fail && now - fail.t < LIVE_CFG.failTtl) throw new LiveError(`recent failure (${fail.status || 'network'}) ${url}`, fail.status || 0);
  if (_liveInflight.has(url)) return _liveInflight.get(url);
  const host = liveHost(url), hkey = 'host:' + host + '#429';
  const limited = () => { const h = _live.get(hkey) || ssGet(hkey); return h && Date.now() - h.t < LIVE_CFG.failTtl; };
  if (limited()) throw new LiveError(`rate limited (429) ${url}`, 429);
  const init = headers ? { headers } : {};
  const retryable = e => !e.status || e.status >= 500 || (e.status === 429 && Number(e.retryAfter) > 0 && Number(e.retryAfter) <= 5);
  const run = async () => {
    if (host && !_hostOk.has(host) && _hostGate.has(host)) { await _hostGate.get(host); if (limited()) throw new LiveError(`rate limited (429) ${url}`, 429); }
    return liveAttempt(url, init)
      .catch(async e => {
        if (e.status === 429) { const h = { t: Date.now(), status: 429 }; _live.set(hkey, h); ssSet(hkey, h); }
        if (!retryable(e)) throw e;
        const ra = Number(e.retryAfter);
        await liveSleep(Number.isFinite(ra) && ra > 0 && ra <= 5 ? ra * 1000 : 800 + Math.random() * 700);
        return liveAttempt(url, init);
      });
  };
  const p = run()
    .then(v => { const o = { t: Date.now(), v }; _live.set(url, o); ssSet(url, o); _live.delete(url + '#fail'); if (host) _hostOk.add(host); return v; },
      e => { const f = { t: Date.now(), status: e.status || 0 }; _live.set(url + '#fail', f); ssSet(url + '#fail', f); throw e; })
    .finally(() => _liveInflight.delete(url));
  if (host && !_hostOk.has(host) && !_hostGate.has(host)) _hostGate.set(host, p.then(() => { }, () => { }).finally(() => _hostGate.delete(host)));
  _liveInflight.set(url, p);
  return p;
}

/* "snapshot from <date>" note: one small status line per page, cleared on every app route change. */
const _snapNotes = new Map();
const longDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
function clearSnapshotNote() { _snapNotes.clear(); document.getElementById('bsp-live-note')?.remove(); }
function paintSnapshotNote() {
  if (!_snapNotes.size || typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('bsp-live-note');
  if (!el) {
    el = document.createElement('div'); el.id = 'bsp-live-note'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:max(16px,var(--launch-clear,16px));transform:translateX(-50%);z-index:70;box-sizing:border-box;width:max-content;max-width:min(560px,calc(100vw - 32px));display:flex;gap:10px;align-items:flex-start;padding:9px 10px 9px 12px;border-radius:10px;font:500 12.5px/1.45 var(--sys-font,system-ui,sans-serif);color:var(--sys-ink-2,#333);background:var(--sys-surface,#fff);border:1px solid var(--sys-line-2,#ccc);border-left:3px solid var(--sys-warn,#b7791f);box-shadow:0 10px 28px -14px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  const items = [..._snapNotes.entries()], dates = [...new Set(items.map(([, d]) => longDate(d)))];
  const what = items.map(([label]) => label);
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0];
  const text = dates.length === 1
    ? `Live ${list} unavailable right now; showing the snapshot from ${dates[0]}.`
    : `Live ${list} unavailable right now; showing saved snapshots (${items.map(([label, d]) => `${label} from ${longDate(d)}`).join('; ')}).`;
  el.innerHTML = `<span style="flex:1;min-width:0">${esc(text)}</span><button type="button" aria-label="Dismiss" style="flex:none;border:0;background:none;color:inherit;cursor:pointer;font:inherit;line-height:1;padding:2px 4px">✕</button>`;
  el.querySelector('button').onclick = () => el.remove();
}
function markSnapshot(v, snap, label) {
  try { Object.defineProperty(v, '_snapshot', { value: { fetched_at: snap.fetched_at, name: snap.dataset }, enumerable: false }); } catch { /* frozen */ }
  _snapNotes.set(label, snap.fetched_at);
  try { window.dispatchEvent(new CustomEvent('bsp:live-snapshot', { detail: { name: snap.dataset, label, fetched_at: snap.fetched_at } })); } catch { /* no window */ }
  if (typeof document !== 'undefined') { if (document.body) paintSnapshotNote(); else document.addEventListener('DOMContentLoaded', paintSnapshotNote, { once: true }); }
  return v;
}
const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const normAlert = (f, area) => { const p = f.properties || {}; return { id: p.id, event: p.event, severity: p.severity, urgency: p.urgency, certainty: p.certainty, headline: p.headline, areaDesc: p.areaDesc, areas: (p.areaDesc || '').split(';').map(s => s.trim()), zones: (p.geocode?.UGC || []), fips: (p.geocode?.SAME || []), onset: p.onset, ends: p.ends || p.expires, sent: p.sent, description: p.description, instruction: p.instruction, sender: p.senderName, geometry: f.geometry, state: area }; };
export const Live = {
  /** Active NWS alerts for a state code (PA, NJ, MA…). Returns normalized array; falls back to the nightly snapshot. */
  async nwsAlerts(area) {
    try {
      const j = await fetchLive(`https://api.weather.gov/alerts/active?area=${area}`, { headers: { Accept: 'application/geo+json' } });
      return (j.features || []).map(f => normAlert(f, area));
    } catch (e) {
      const s = await snapshot('nws_alerts');
      if (!s || !Array.isArray(s.items) || (Array.isArray(s.states) && !s.states.includes(area)) || s.errors?.[area]) throw e;
      const now = Date.now();
      const rows = s.items.filter(a => a.state === area && !(a.ends && Date.parse(a.ends) < now))
        .map(a => ({ ...a, areas: String(a.areaDesc || '').split(';').map(x => x.trim()).filter(Boolean), zones: a.zones || [], fips: a.fips || [], geometry: null }));
      return markSnapshot(rows, s, 'weather alerts');
    }
  },
  /** 7-day daily forecast via Open-Meteo (no key), plus 2 observed days flagged past; falls back to the nearest snapshot hub. */
  async forecast(lat, lon, days = 7) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,snowfall_sum&hourly=temperature_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=${days}&past_days=2`;
    try {
      const j = await fetchLive(u); const d = j.daily; return d.time.map((t, i) => ({ date: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], precip: d.precipitation_sum[i], pop: d.precipitation_probability_max?.[i], wind: d.wind_speed_10m_max[i], gust: d.wind_gusts_10m_max[i], code: d.weather_code[i], snow: d.snowfall_sum[i], past: i < 2 }));
    } catch (e) {
      const s = await snapshot('forecast_hubs');
      const dist = h => Math.hypot(h.lat - lat, (h.lon - lon) * Math.cos(lat * Math.PI / 180));
      const hub = (s?.items || []).filter(h => Array.isArray(h.days) && Number.isFinite(h.lat) && Number.isFinite(h.lon)).sort((a, b) => dist(a) - dist(b))[0];
      if (!hub || dist(hub) > 0.3) throw e;   // ~20 miles: beyond that a hub's forecast is not this point's forecast
      const today = localISO();
      const all = hub.days.map(x => ({ date: x.date, tmax: x.tmax, tmin: x.tmin, precip: x.precip, pop: x.pop, wind: x.wind, gust: x.gust, code: x.code, snow: x.snow, past: x.date < today }));
      const fut = all.filter(x => !x.past).slice(0, days); if (!fut.length) throw e;
      return markSnapshot([...all.filter(x => x.past).slice(-2), ...fut], s, 'weather forecast');
    }
  },
  wmo: c => ({ 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'T-storm w/ hail', 99: 'T-storm w/ hail' }[c] || '—'),
  /** Historical daily weather (Open-Meteo archive) — for backtesting. No snapshot: callers handle the rejection. */
  async history(lat, lon, start, end) { const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York`; const j = await fetchLive(u, { ttl: 6 * 3600e3 }); const d = j.daily; return d.time.map((t, i) => ({ date: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], precip: d.precipitation_sum[i], gust: d.wind_gusts_10m_max[i] })); },
  /** The shared helper, for other public JSON APIs: Live.fetchJSON(url, { ttl, headers }). */
  fetchJSON: fetchLive,
  /** Nightly snapshot data/live/<name>.json (null if missing); shared with assets/live.js. */
  snapshot,
};

/* ── Tour / briefing engine ───────────────────────────────────────────────── */
export const Tour = {
  steps: [], i: 0, timer: null, running: false, speak: true,
  /** Steps may carry an optional numeric `order`; the narrative is kept sorted by order (steps without one keep registration order, after ordered ones). */
  _seq: 0,
  register(steps) { for (const st of steps || []) Tour.steps.push({ ...st, _seq: Tour._seq++ }); const k = st => (typeof st.order === 'number' ? st.order : 1e9); Tour.steps.sort((a, b) => k(a) - k(b) || a._seq - b._seq); },
  start(from = 0, { speak = true } = {}) { if (!Tour.steps.length) return UI.toast('No briefing steps registered'); Tour.speak = speak && 'speechSynthesis' in window; Tour.running = true; Tour.i = from; Tour._show(); App._tourBtn?.(); },
  stop() { Tour.running = false; clearTimeout(Tour.timer); if (window.speechSynthesis) speechSynthesis.cancel(); $('#tour')?.remove(); App._tourBtn?.(); },
  next() { Tour.i++; if (Tour.i >= Tour.steps.length) return Tour.stop(); Tour._show(); },
  prev() { Tour.i = Math.max(0, Tour.i - 1); Tour._show(); },
  _show() {
    clearTimeout(Tour.timer); const s = Tour.steps[Tour.i]; if (!s) return Tour.stop();
    if (s.hash && location.hash !== s.hash) location.hash = s.hash;
    let el = $('#tour'); if (!el) { el = document.createElement('div'); el.id = 'tour'; document.body.appendChild(el); }
    const dur = s.duration || Math.max(6000, (s.narration || s.caption).split(' ').length * 420);
    if (!el.classList.contains('sys-card')) { el.className = 'sys-card'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Briefing'); }
    el.innerHTML = `<div class="cap">${s.caption}</div><div class="meta"><span class="sys-src">${Tour.i + 1} / ${Tour.steps.length}</span><div class="prog" aria-hidden="true"><i style="width:0%"></i></div><button type="button" class="${btnCls('secondary', 'sm', 'xs')}" data-t="prev">‹ Back</button><button type="button" class="${btnCls('primary', 'sm', 'xs primary')}" data-t="next">Next ›</button><button type="button" class="${btnCls('ghost', 'sm', 'xs ghost')}" data-t="stop">Exit</button></div>`;
    $('[data-t=prev]', el).onclick = Tour.prev; $('[data-t=next]', el).onclick = Tour.next; $('[data-t=stop]', el).onclick = Tour.stop;
    requestAnimationFrame(() => { const p = $('#tour .prog i'); if (p) { p.style.transition = `width ${dur}ms linear`; p.style.width = '100%'; } });
    if (Tour.speak) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(s.narration || s.caption.replace(/<[^>]+>/g, '')); u.rate = 1.02; u.pitch = 1; const v = speechSynthesis.getVoices().find(v => /Samantha|Daniel|Google US English|Alex/.test(v.name)); if (v) u.voice = v; speechSynthesis.speak(u); }
    Tour.timer = setTimeout(() => Tour.running && Tour.next(), dur);
  },
};

/* ── App shell / router ───────────────────────────────────────────────────── */
const searchIndex = [];
export const App = {
  modules: [], current: null, view: null, params: {}, state: {}, _unmount: null,
  register(m) { App.modules.push(m); if (Array.isArray(m.tour) && m.tour.length) Tour.register(m.tour); (m.views || []).forEach(v => searchIndex.push({ label: `${m.name} · ${v.name}`, kind: 'View', href: `#/${m.id}/${v.id}`, color: m.color })); },
  /** Modules call this to make entities searchable in ⌘K: items [{label, sub, href, kind}] */
  index(items) { for (const i of items) if (!searchIndex.some(x => x.href === i.href && x.label === i.label)) searchIndex.push(i); },
  parse() { const h = location.hash.replace(/^#\/?/, ''); const [path, q] = h.split('?'); const [mod, view] = path.split('/'); const params = Object.fromEntries(new URLSearchParams(q || '')); return { mod: mod || App.modules[0]?.id, view, params }; },
  go(mod, view, params) { const q = params ? '?' + new URLSearchParams(params).toString() : ''; location.hash = `#/${mod}/${view || ''}${q}`; },
  async route() {
    const { mod, view, params } = App.parse(); const m = App.modules.find(x => x.id === mod) || App.modules[0]; if (!m) return;
    const v = m.views.find(x => x.id === view) || m.views[0];
    if (App._unmount) { try { App._unmount(); } catch { } App._unmount = null; }
    App.current = m; App.view = v; App.params = params; Inspector.close(); clearSnapshotNote();
    document.documentElement.style.setProperty('--mc', m.color);
    // the module accent drives .sys-card[data-co] bars, .sys-chip--soft, .sys-note--co and the current view tab (system.css §3)
    const main = $('#main'); if (main) { main.dataset.co = m.id; main.style.setProperty('--co', m.color); }
    App.renderRail(); App.renderTop();
    const content = $('#content'); content.className = v.flush ? 'flush' : ''; content.scrollTop = 0; content.innerHTML = UI.loading(`Loading ${m.name} · ${v.name}`);
    const ctx = { el: content, module: m, view: v, params, data: Data, ui: UI, maps: Maps, charts: Charts, fmt: Fmt, live: Live, inspector: Inspector, app: App, esc, $, $$ };
    try { const un = await v.render(ctx); if (typeof un === 'function') App._unmount = un; }
    catch (e) { console.error(e); content.innerHTML = `<div class="empty">This view failed to render.<br><span class="mono small">${esc(e.message)}</span></div>`; }
    document.title = `${m.name} · ${v.name} — BSP Desk`;
  },
  renderRail() {
    const nav = $('#rail .rail-nav'); const groups = [...new Set(App.modules.map(m => m.group || 'Portfolio'))];
    const refocus = App._railKey && nav.contains(document.activeElement);   // keyboard user on the rail: keep focus there after the re-render
    nav.innerHTML = groups.map(g => `<div class="rail-group"><div class="sys-card-label rail-section">${esc(g)}</div>${App.modules.filter(m => (m.group || 'Portfolio') === g).map(m => `<a class="rail-item${m === App.current ? ' active' : ''}" href="#/${esc(m.id)}/" data-co="" style="--co:${m.color};--mc:${m.color}" data-mod="${m.id}"${m === App.current ? ' aria-current="page"' : ''}><span class="sys-dot" aria-hidden="true"></span><span class="ellipsis">${esc(m.name)}</span>${m.tag ? `<span class="sys-kbd tag">${esc(m.tag)}</span>` : ''}</a>`).join('')}</div>`).join('');
    $$('.rail-item', nav).forEach(el => { el.onclick = e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); App.go(el.dataset.mod); }; el.onkeydown = e => { if (e.key === ' ') { e.preventDefault(); App.go(el.dataset.mod); } }; });
    if (refocus) $(`.rail-item[data-mod="${CSS.escape(App._railKey)}"]`, nav)?.focus({ preventScroll: true });
    // phone strip: keep the current module in view
    const cur = $('.rail-item.active', nav); if (cur && nav.scrollWidth > nav.clientWidth + 4) { const a = cur.getBoundingClientRect(), b = nav.getBoundingClientRect(); if (a.left < b.left || a.right > b.right) nav.scrollLeft += a.left - b.left - (b.width - a.width) / 2; }
  },
  renderTop() {
    const m = App.current, v = App.view; const t = $('#topbar');
    $('.crumb', t).innerHTML = `<a class="sys-subnav-title" href="#/${esc(m.id)}/" data-co="" style="--co:${m.color}">${esc(m.name)}</a><span class="sys-sr"> · ${esc(v.name)}</span>`;
    $('.view-tabs', t).innerHTML = m.views.map(x => `<a class="view-tab" href="#/${esc(m.id)}/${esc(x.id)}" data-v="${x.id}"${x === v ? ' aria-current="page"' : ''}>${x.icon ? `<span class="ico" aria-hidden="true">${x.icon}</span>` : ''}${esc(x.name)}${x.badge ? `<span class="sys-kbd n">${esc(x.badge)}</span>` : ''}</a>`).join('');
    $$('.view-tab', t).forEach(b => b.onclick = e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); App.go(m.id, b.dataset.v); });
    const cur = $('.view-tab[aria-current]', t), tabs = $('.view-tabs', t); if (cur && tabs.scrollWidth > tabs.clientWidth) { const a = cur.getBoundingClientRect(), b = tabs.getBoundingClientRect(); if (a.left < b.left || a.right > b.right - 24) tabs.scrollLeft += a.left - b.left - 24; }
  },
  palette() {
    let el = $('#palette'); if (el) return el.remove();
    el = document.createElement('div'); el.id = 'palette'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Search the portal'); el.innerHTML = `<div class="sys-card pal"><div class="pal-in">${ICON.search}<input class="pal-input" placeholder="Search views, companies, targets, opportunities…" aria-label="Search views, companies, targets and opportunities" autofocus><span class="sys-kbd">Esc</span></div><div class="pal-list" role="listbox"></div></div>`; document.body.appendChild(el);
    const inp = $('input', el), list = $('.pal-list', el); let items = [], active = 0;
    const draw = () => { const q = inp.value.trim().toLowerCase(); items = (q ? searchIndex.filter(i => (i.label + ' ' + (i.sub || '')).toLowerCase().includes(q)) : searchIndex.filter(i => i.kind === 'View')).slice(0, 40); active = 0; list.innerHTML = items.map((i, k) => `<div class="pal-item ${k === 0 ? 'active' : ''}" role="option" aria-selected="${k === 0}" data-h="${esc(i.href)}"><span class="sys-card-label k"><span class="sys-dot" style="--co:${i.color || 'var(--sys-mute-2)'}" aria-hidden="true"></span>${esc(i.kind || '')}</span><span class="ellipsis">${esc(i.label)}</span>${i.sub ? `<span class="s ellipsis">${esc(i.sub)}</span>` : ''}</div>`).join('') || `<div class="empty">No matches</div>`; $$('.pal-item', list).forEach(x => x.onclick = () => { location.hash = x.dataset.h; el.remove(); }); };
    inp.oninput = draw; draw(); inp.focus();
    inp.onkeydown = e => { if (e.key === 'Escape') el.remove(); if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); } if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); } if (e.key === 'Enter' && items[active]) { location.hash = items[active].href; el.remove(); } $$('.pal-item', list).forEach((x, k) => { x.classList.toggle('active', k === active); x.setAttribute('aria-selected', String(k === active)); if (k === active) x.scrollIntoView({ block: 'nearest' }); }); };
    el.onclick = e => { if (e.target === el) el.remove(); };
  },
  start() {
    window.addEventListener('hashchange', App.route);
    document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); App.palette(); } if (e.key === 'Escape' && !(e.target.closest && e.target.closest('.ch'))) { if ($('#palette')) $('#palette').remove(); else Inspector.close(); } });
    // keep keyboard focus on the chosen rail item when the rail re-renders after a route change
    $('#rail .rail-nav')?.addEventListener('focusin', e => { const it = e.target.closest('.rail-item'); App._railKey = it ? it.dataset.mod : null; });
    $('#search-btn').onclick = App.palette;
    // theme: one preference shared with every page (Theme above); the console toggle hides when the frame brings its own
    const tb = $('#theme-btn');
    const paintTheme = () => { if (!tb) return; const d = Theme.get() === 'dark'; tb.innerHTML = d ? ICON.sun : ICON.moon; tb.setAttribute('aria-label', d ? 'Switch to light theme' : 'Switch to dark theme'); tb.title = tb.getAttribute('aria-label'); };
    if (tb) { tb.onclick = () => Theme.toggle(); if (document.querySelector('.sys-top [data-sys-theme-toggle], .sys-top .sys-theme')) tb.hidden = true; }
    Theme.apply(Theme.get()); paintTheme();
    Theme.watch(t => { paintTheme(); Maps.retheme(t); });
    const ib = $('#insp-btn'); if (ib) { ib.innerHTML = ICON.panel; ib.onclick = () => $('#inspector').classList.contains('open') ? Inspector.close() : UI.toast('Select a row, card or map point to inspect it'); }
    const rb = $('#tour-btn'); App._tourBtn = () => { if (!rb) return; rb.innerHTML = Tour.running ? ICON.stop : ICON.play; const l = Tour.running ? 'Stop the briefing' : 'Play the briefing'; rb.setAttribute('aria-label', l); rb.title = l; };
    if (rb) { rb.onclick = () => Tour.running ? Tour.stop() : Tour.start(0); App._tourBtn(); }
    const sb = $('#search-btn .sys-kbd'); if (sb && !/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)) sb.textContent = 'Ctrl K';
    const clock = $('#clock'); const tick = () => { if (clock) clock.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'; }; tick(); setInterval(tick, 1000);
    App.route();
  },
};
// Guard: assets/components.js imports ./core.js?v=20261008151643 without the ?v= stamp, which creates a second module instance; keep the first (the one index.html registers modules on).
window.BSP = window.BSP || { Data, Fmt, UI, Maps, Charts, Live, Tour, App, Inspector, Theme };
