/* ═══════════════════════════════════════════════════════════════════════════
   Broad Sky Operating Intelligence — core runtime (ES module, no build step)
   Exports: Data, Fmt, UI, Maps, Charts, Live, Tour, App
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE = new URL('.', import.meta.url).href.replace(/assets\/$/, '');

/* ── Data ─────────────────────────────────────────────────────────────────── */
const _cache = new Map();
export const Data = {
  /** Load data/<name>.json (or data/research/<name>.json). Decodes the columnar format transparently. */
  async load(name) {
    if (_cache.has(name)) return _cache.get(name);
    const p = (async () => {
      const path = name.includes('/') ? `data/${name}.json` : (await Data._exists(`data/${name}.json`)) ? `data/${name}.json` : `data/research/${name}.json`;
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
  tier: t => { const s = String(t ?? '').toLowerCase(); const n = (s.match(/\d/) || ['4'])[0]; return `<span class="chip t${n}"><i class="cdot"></i>${esc(t)}</span>`; },
  chip: (t, color) => `<span class="chip" style="${color ? `--cc:${color}` : ''}">${esc(t)}</span>`,
  list: (a, n = 3) => Array.isArray(a) ? a.slice(0, n).map(x => esc(x)).join(', ') + (a.length > n ? ` +${a.length - n}` : '') : esc(a),
  link: (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || (new URL(u, 'https://x').hostname.replace('www.', '')))}</a>` : '—',
  host: u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } },
};

/* ── UI components ────────────────────────────────────────────────────────── */
export const UI = {
  kpi: ({ label, value, sub, delta, color, spark, small }) => `<div class="kpi" style="${color ? `--kc:${color}` : ''}"><div class="label">${esc(label)}</div><div class="value">${value}${small ? `<small>${esc(small)}</small>` : ''}${delta != null ? `<span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">${delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} ${esc(typeof delta === 'number' ? Math.abs(delta) : delta)}</span>` : ''}</div>${sub ? `<div class="sub">${sub}</div>` : ''}${spark ? `<div class="spark">${spark}</div>` : ''}</div>`,
  kpis: items => `<div class="kpis">${items.map(UI.kpi).join('')}</div>`,
  panel: ({ title, sub, actions, body, foot, cls = '', id = '', accent = false, flush = false, scroll = false }) => `<section class="panel ${accent ? 'accent' : ''} ${cls}" ${id ? `id="${id}"` : ''}>${title ? `<div class="panel-head"><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>` : ''}<div class="panel-body ${flush ? 'flush' : ''} ${scroll ? 'scroll' : ''}">${body}</div>${foot ? `<div class="panel-foot">${foot}</div>` : ''}</section>`,
  source: (text, url, asof) => `<span class="src">Source: ${url ? Fmt.link(url, text) : esc(text)}${asof ? ` · as of ${esc(asof)}` : ''}</span>`,
  pageHead: ({ title, sub, actions, chips }) => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}${chips ? `<div class="row wrap mt-8">${chips}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`,
  empty: msg => `<div class="empty">${esc(msg || 'No data')}</div>`,
  loading: msg => `<div class="loading"><div class="spinner"></div>${esc(msg || 'Loading…')}</div>`,
  note: (html, kind = '') => `<div class="note ${kind}">${html}</div>`,
  kv: obj => `<dl class="kv">${Object.entries(obj).filter(([k, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${Array.isArray(v) ? v.map(x => `<span class="chip">${esc(x)}</span>`).join(' ') : v}</dd>`).join('')}</dl>`,
  timeline: items => `<div class="timeline">${items.map(i => `<div class="tl-item" style="${i.color ? `--cc:${i.color}` : ''}"><div class="d">${esc(i.date)}</div><div class="e">${i.html || esc(i.text)}</div></div>`).join('')}</div>`,
  toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); },
  seg(el, options, value, onChange) { el.innerHTML = `<div class="seg">${options.map(o => `<button data-v="${esc(o.value)}" class="${o.value === value ? 'active' : ''}">${esc(o.label)}</button>`).join('')}</div>`; $$('button', el).forEach(b => b.onclick = () => { $$('button', el).forEach(x => x.classList.toggle('active', x === b)); onChange(b.dataset.v); }); },
  /** Filter bar. filters: [{key,label,type:'select'|'search'|'range',options:[{value,label}],value}] */
  filters(el, filters, onChange) {
    el.innerHTML = `<div class="filters">${filters.map(f => f.type === 'search' ? `<input type="search" data-k="${f.key}" placeholder="${esc(f.label)}" value="${esc(f.value || '')}">` : f.type === 'toggle' ? `<button class="btn sm ${f.value ? 'active' : ''}" data-k="${f.key}" data-toggle>${esc(f.label)}</button>` : `<label class="f">${esc(f.label)} <select data-k="${f.key}"><option value="">All</option>${(f.options || []).map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`).join('')}<span class="count" data-count></span></div>`;
    const state = Object.fromEntries(filters.map(f => [f.key, f.value ?? (f.type === 'toggle' ? false : '')]));
    const emit = () => onChange(state);
    $$('select', el).forEach(s => s.onchange = () => { state[s.dataset.k] = s.value; emit(); });
    $$('input[type=search]', el).forEach(i => { let t; i.oninput = () => { clearTimeout(t); t = setTimeout(() => { state[i.dataset.k] = i.value; emit(); }, 180); }; });
    $$('[data-toggle]', el).forEach(b => b.onclick = () => { state[b.dataset.k] = !state[b.dataset.k]; b.classList.toggle('active', state[b.dataset.k]); emit(); });
    return { state, setCount: n => { const c = $('[data-count]', el); if (c) c.textContent = n; } };
  },
  /** Sortable, paginated table. columns: [{key,label,fmt(v,row),num,width,wrap,sort(a,b)}] */
  table(el, { columns, rows, pageSize = 50, onRow, selectedKey, rowKey = r => r.id, exportName, sortKey, sortDir = -1, rowClass }) {
    let page = 0, sk = sortKey || null, sd = sortDir, data = rows.slice(), selected = null;
    const sortRows = () => { if (!sk) return; const col = columns.find(c => c.key === sk); const cmp = col?.sort || ((a, b) => { const x = a[sk], y = b[sk]; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); }); const nul = v => v == null || v === '' || (typeof v === 'number' && isNaN(v)); data.sort((a, b) => { const na = nul(a[sk]), nb = nul(b[sk]); if (na && nb) return 0; if (na) return 1; if (nb) return -1; return cmp(a, b) * sd; }); };
    const render = () => {
      sortRows(); const start = page * pageSize, slice = data.slice(start, start + pageSize), pages = Math.max(1, Math.ceil(data.length / pageSize));
      el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${columns.map(c => `<th data-k="${c.key}" class="${c.num ? 'num' : ''} ${sk === c.key ? 'sorted' : ''}" style="${c.width ? `width:${c.width}` : ''}">${esc(c.label)}${sk === c.key ? `<span class="arr">${sd > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>${slice.length ? slice.map((r, i) => `<tr data-i="${start + i}" class="${selected != null && rowKey(r) === selected ? 'selected' : ''} ${rowClass ? rowClass(r) : ''}">${columns.map(c => `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}" title="${c.title ? esc(c.title(r)) : ''}">${c.fmt ? c.fmt(r[c.key], r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="empty">No rows match</div></td></tr>`}</tbody></table></div><div class="tbl-foot"><span class="num">${Fmt.num(data.length)} rows</span>${exportName ? `<button class="btn xs" data-export>⇩ CSV</button>` : ''}<div class="pages"><button class="btn xs" data-pg="-1" ${page === 0 ? 'disabled' : ''}>‹</button><span class="num">${page + 1} / ${pages}</span><button class="btn xs" data-pg="1" ${page >= pages - 1 ? 'disabled' : ''}>›</button></div></div>`;
      $$('th', el).forEach(th => th.onclick = () => { const k = th.dataset.k; if (sk === k) sd = -sd; else { sk = k; sd = -1; } page = 0; render(); });
      $$('[data-pg]', el).forEach(b => b.onclick = () => { page = Math.max(0, Math.min(Math.ceil(data.length / pageSize) - 1, page + Number(b.dataset.pg))); render(); });
      $$('tbody tr', el).forEach(tr => tr.onclick = () => { const r = data[Number(tr.dataset.i)]; if (!r) return; selected = rowKey(r); $$('tbody tr', el).forEach(x => x.classList.toggle('selected', x === tr)); onRow && onRow(r); });
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
  cards(items, { color, onSelect, selectedId } = {}) {
    return `<div class="cards">${items.map(i => `<div class="card ${i.id === selectedId ? 'selected' : ''}" data-id="${esc(i.id)}" style="--cc:${i.color || color || 'var(--border-2)'}"><div class="t">${i.title}${i.rank != null ? `<span class="rk">#${i.rank}</span>` : ''}</div>${i.sub ? `<div class="s">${i.sub}</div>` : ''}${i.chips ? `<div class="m">${i.chips}</div>` : ''}</div>`).join('')}</div>`;
  },
  bindCards(el, items, onSelect) { $$('.card', el).forEach(c => c.onclick = () => { $$('.card', el).forEach(x => x.classList.toggle('selected', x === c)); onSelect(items.find(i => String(i.id) === c.dataset.id)); }); },
};

/* ── Inspector (right panel) ──────────────────────────────────────────────── */
export const Inspector = {
  open({ title, sub, color, sections = [], actions = [] }) {
    const el = $('#inspector'); if (!el) return;
    el.innerHTML = `<div class="insp-head" style="--mc:${color || 'var(--accent)'}"><div class="grow"><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="icon-btn" data-close title="Close (Esc)">✕</button></div><div class="insp-body">${sections.map(s => `<div class="insp-sec">${s.label ? `<h4>${esc(s.label)}</h4>` : ''}${s.html}</div>`).join('')}</div>${actions.length ? `<div class="insp-actions">${actions.map(a => a.href ? `<a class="btn sm" href="${esc(a.href)}" target="_blank" rel="noopener">${a.label}</a>` : `<button class="btn sm" data-act="${esc(a.id)}">${a.label}</button>`).join('')}</div>` : ''}`;
    el.classList.add('open');
    $('[data-close]', el).onclick = () => Inspector.close();
    actions.forEach(a => { if (a.onClick) { const b = $(`[data-act="${a.id}"]`, el); if (b) b.onclick = a.onClick; } });
  },
  close() { const el = $('#inspector'); if (el) { el.classList.remove('open'); setTimeout(() => { if (!el.classList.contains('open')) el.innerHTML = ''; }, 250); } },
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
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const map = L.map(el, { center, zoom, minZoom, maxZoom: Math.min(maxZoom, 16), zoomControl: true, preferCanvas: true, attributionControl: true });
    const T = TILES[theme]; L.tileLayer(T.url, { attribution: T.attr, maxZoom: T.maxZoom, maxNativeZoom: T.maxZoom }).addTo(map); L.tileLayer(T.ref, { maxZoom: T.maxZoom, maxNativeZoom: T.maxZoom, pane: 'shadowPane', opacity: .9 }).addTo(map);
    map._renderer = L.canvas({ padding: 0.5 });
    setTimeout(() => map.invalidateSize(), 60); setTimeout(() => map.invalidateSize(), 240);
    return map;
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
    const icon = L.divIcon({ className: '', html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 3px ${color}55,0 2px 8px rgba(0,0,0,.6)"></div>${label ? `<div style="position:absolute;left:${size + 4}px;top:-2px;white-space:nowrap;font:600 10.5px Inter,sans-serif;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000">${esc(label)}</div>` : ''}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
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
const _live = new Map();
async function cachedFetch(url, ttlMs = 5 * 60e3, init) { const now = Date.now(); const c = _live.get(url); if (c && now - c.t < ttlMs) return c.v; const r = await fetch(url, init); if (!r.ok) throw new Error(`${r.status} ${url}`); const v = await r.json(); _live.set(url, { t: now, v }); return v; }
export const Live = {
  /** Active NWS alerts for a state code (PA, NJ, MA…). Returns normalized array. */
  async nwsAlerts(area) {
    const j = await cachedFetch(`https://api.weather.gov/alerts/active?area=${area}`, 3 * 60e3, { headers: { Accept: 'application/geo+json' } });
    return (j.features || []).map(f => { const p = f.properties; return { id: p.id, event: p.event, severity: p.severity, urgency: p.urgency, certainty: p.certainty, headline: p.headline, areaDesc: p.areaDesc, areas: (p.areaDesc || '').split(';').map(s => s.trim()), zones: (p.geocode?.UGC || []), fips: (p.geocode?.SAME || []), onset: p.onset, ends: p.ends || p.expires, sent: p.sent, description: p.description, instruction: p.instruction, sender: p.senderName, geometry: f.geometry, state: area }; });
  },
  /** 7-day daily forecast via Open-Meteo (no key). */
  async forecast(lat, lon, days = 7) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,snowfall_sum&hourly=temperature_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=${days}&past_days=2`;
    const j = await cachedFetch(u, 30 * 60e3); const d = j.daily; return d.time.map((t, i) => ({ date: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], precip: d.precipitation_sum[i], pop: d.precipitation_probability_max?.[i], wind: d.wind_speed_10m_max[i], gust: d.wind_gusts_10m_max[i], code: d.weather_code[i], snow: d.snowfall_sum[i], past: i < 2 }));
  },
  wmo: c => ({ 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'T-storm w/ hail', 99: 'T-storm w/ hail' }[c] || '—'),
  /** Historical daily weather (Open-Meteo archive) — for backtesting. */
  async history(lat, lon, start, end) { const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York`; const j = await cachedFetch(u, 6 * 3600e3); const d = j.daily; return d.time.map((t, i) => ({ date: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], precip: d.precipitation_sum[i], gust: d.wind_gusts_10m_max[i] })); },
};

/* ── Tour / briefing engine ───────────────────────────────────────────────── */
export const Tour = {
  steps: [], i: 0, timer: null, running: false, speak: true,
  /** Steps may carry an optional numeric `order`; the narrative is kept sorted by order (steps without one keep registration order, after ordered ones). */
  _seq: 0,
  register(steps) { for (const st of steps || []) Tour.steps.push({ ...st, _seq: Tour._seq++ }); const k = st => (typeof st.order === 'number' ? st.order : 1e9); Tour.steps.sort((a, b) => k(a) - k(b) || a._seq - b._seq); },
  start(from = 0, { speak = true } = {}) { if (!Tour.steps.length) return UI.toast('No briefing steps registered'); Tour.speak = speak && 'speechSynthesis' in window; Tour.running = true; Tour.i = from; Tour._show(); },
  stop() { Tour.running = false; clearTimeout(Tour.timer); if (window.speechSynthesis) speechSynthesis.cancel(); $('#tour')?.remove(); },
  next() { Tour.i++; if (Tour.i >= Tour.steps.length) return Tour.stop(); Tour._show(); },
  prev() { Tour.i = Math.max(0, Tour.i - 1); Tour._show(); },
  _show() {
    clearTimeout(Tour.timer); const s = Tour.steps[Tour.i]; if (!s) return Tour.stop();
    if (s.hash && location.hash !== s.hash) location.hash = s.hash;
    let el = $('#tour'); if (!el) { el = document.createElement('div'); el.id = 'tour'; document.body.appendChild(el); }
    const dur = s.duration || Math.max(6000, (s.narration || s.caption).split(' ').length * 420);
    el.innerHTML = `<div class="cap">${s.caption}</div><div class="meta"><span class="num">${Tour.i + 1} / ${Tour.steps.length}</span><div class="prog"><i style="width:0%"></i></div><button class="btn xs" data-t="prev">‹ Back</button><button class="btn xs" data-t="next">Next ›</button><button class="btn xs ghost" data-t="stop">Exit</button></div>`;
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
    App.current = m; App.view = v; App.params = params; Inspector.close();
    document.documentElement.style.setProperty('--mc', m.color);
    App.renderRail(); App.renderTop();
    const content = $('#content'); content.className = v.flush ? 'flush' : ''; content.scrollTop = 0; content.innerHTML = UI.loading(`Loading ${m.name} · ${v.name}`);
    const ctx = { el: content, module: m, view: v, params, data: Data, ui: UI, maps: Maps, charts: Charts, fmt: Fmt, live: Live, inspector: Inspector, app: App, esc, $, $$ };
    try { const un = await v.render(ctx); if (typeof un === 'function') App._unmount = un; }
    catch (e) { console.error(e); content.innerHTML = `<div class="empty">This view failed to render.<br><span class="mono small">${esc(e.message)}</span></div>`; }
    document.title = `${m.name} · ${v.name} — Broad Sky Intelligence`;
  },
  renderRail() {
    const nav = $('#rail .rail-nav'); const groups = [...new Set(App.modules.map(m => m.group || 'Portfolio'))];
    nav.innerHTML = groups.map(g => `<div class="rail-section">${esc(g)}</div>${App.modules.filter(m => (m.group || 'Portfolio') === g).map(m => `<div class="rail-item ${m === App.current ? 'active' : ''}" style="--mc:${m.color}" data-mod="${m.id}"><span class="dot"></span><span class="ellipsis">${esc(m.name)}</span>${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : ''}</div>`).join('')}`).join('');
    $$('.rail-item', nav).forEach(el => el.onclick = () => App.go(el.dataset.mod));
  },
  renderTop() {
    const m = App.current, v = App.view; const t = $('#topbar');
    $('.crumb', t).innerHTML = `<span class="co" style="--mc:${m.color}"><span class="dot"></span>${esc(m.name)}</span><span class="sep">/</span><span>${esc(v.name)}</span>`;
    $('.view-tabs', t).innerHTML = m.views.map(x => `<button class="view-tab ${x === v ? 'active' : ''}" data-v="${x.id}">${x.icon ? `<span>${x.icon}</span>` : ''}${esc(x.name)}${x.badge ? `<span class="n">${esc(x.badge)}</span>` : ''}</button>`).join('');
    $$('.view-tab', t).forEach(b => b.onclick = () => App.go(m.id, b.dataset.v));
  },
  palette() {
    let el = $('#palette'); if (el) return el.remove();
    el = document.createElement('div'); el.id = 'palette'; el.innerHTML = `<div class="pal"><input placeholder="Search views, companies, targets, opportunities…" autofocus><div class="pal-list"></div></div>`; document.body.appendChild(el);
    const inp = $('input', el), list = $('.pal-list', el); let items = [], active = 0;
    const draw = () => { const q = inp.value.trim().toLowerCase(); items = (q ? searchIndex.filter(i => (i.label + ' ' + (i.sub || '')).toLowerCase().includes(q)) : searchIndex.filter(i => i.kind === 'View')).slice(0, 40); active = 0; list.innerHTML = items.map((i, k) => `<div class="pal-item ${k === 0 ? 'active' : ''}" data-h="${esc(i.href)}"><span class="k" style="color:${i.color || 'var(--dim)'}">${esc(i.kind || '')}</span><span class="ellipsis">${esc(i.label)}</span>${i.sub ? `<span class="s ellipsis">${esc(i.sub)}</span>` : ''}</div>`).join('') || `<div class="empty">No matches</div>`; $$('.pal-item', list).forEach(x => x.onclick = () => { location.hash = x.dataset.h; el.remove(); }); };
    inp.oninput = draw; draw(); inp.focus();
    inp.onkeydown = e => { if (e.key === 'Escape') el.remove(); if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); } if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); } if (e.key === 'Enter' && items[active]) { location.hash = items[active].href; el.remove(); } $$('.pal-item', list).forEach((x, k) => x.classList.toggle('active', k === active)); };
    el.onclick = e => { if (e.target === el) el.remove(); };
  },
  start() {
    window.addEventListener('hashchange', App.route);
    document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); App.palette(); } if (e.key === 'Escape') { Inspector.close(); $('#palette')?.remove(); } });
    $('#search-btn').onclick = App.palette;
    $('#theme-btn').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light'; try { localStorage.setItem('bsp-theme', r.dataset.theme); } catch { } App.route(); };
    $('#insp-btn').onclick = () => $('#inspector').classList.contains('open') ? Inspector.close() : UI.toast('Select an entity to inspect');
    $('#tour-btn').onclick = () => Tour.running ? Tour.stop() : Tour.start(0);
    try { const th = localStorage.getItem('bsp-theme'); if (th) document.documentElement.dataset.theme = th; } catch { }
    const clock = $('#clock'); setInterval(() => { clock.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'; }, 1000);
    App.route();
  },
};
// Guard: assets/components.js imports ./core.js without the ?v= stamp, which creates a second module instance; keep the first (the one index.html registers modules on).
window.BSP = window.BSP || { Data, Fmt, UI, Maps, Charts, Live, Tour, App, Inspector };
