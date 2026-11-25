/* The address lookup (window.BSPSite): a real address typed word for word goes to the server's site brief (POST /site-brief,
   no model call) and comes back as a short answer, the floor plan of the real building, a 3D control and a map command.

     BSPSite.mount(container, { out })   draws the "Address" box; its answers land in `out` (default: under the box)
     BSPSite.lookup(text, opts)          runs one lookup. opts: { host, role, connected, pick, building }. With no host and no box on
                                         screen it opens the home with ?address=<text>, which runs the lookup there
     BSPSite.renderCards(host, cards)    draws answer cards: the plan (assets/agent-cards.js renderCard), the five pictures
                                         (assets/agent-views.js renderView), the draft; returns the map command, if any

   One short progress line while it runs; it always ends (the backend call has an 11 s timeout and the box a guard of its own).
   The map command runs through window.MapCmd (assets/mapcmd.js). Inside a frame it goes to the shell by postMessage.
   Nothing here calls a model. */
import { Backend } from './backend.js?v=20261124223132';
import { renderCard } from './agent-cards.js?v=20261124223132';
import { renderView, VIEW_KINDS } from './agent-views.js?v=20261124223132';
import { parseAddress } from './globe-intents.js?v=20261124223132';
import { Session } from './session.js?v=20261124223132';

const STAMP = new URL(import.meta.url).search;   // the ?v= stamp this file was loaded with, for the stylesheets it adds
const GUARD_MS = 12500;                           // the box gives up even if the network never answers
const HOME = '#/home/overview';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = s => String(s ?? '').trim().split(/\s+/).filter(Boolean);
const clip40 = s => { const w = words(s); return w.length > 40 ? w.slice(0, 40).join(' ').replace(/[,;:]$/, '') + '…' : w.join(' '); };

function css(href, id) {
  if (document.getElementById(id) || document.querySelector(`link[href^="${href.split('?')[0]}"]`)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
const styles = () => {
  css(new URL('./site-lookup.css' + STAMP, import.meta.url).href, 'css-site-lookup');
  css(new URL('./agent-cards.css' + STAMP, import.meta.url).href, 'css-agent-cards');   // the plan and draft cards' own styles
};

/* ── basis words: the five pictures read 'example', 'est', 'public', 'likely'. The server writes 'record' and 'estimate'
   (and, in the static copy, 'company record (example data)'); a company record is always shown as example data. ── */
const BASIS = { record: 'example', 'company record (example data)': 'example', 'company record': 'example', estimate: 'est' };
function normBasis(v) {
  if (Array.isArray(v)) return v.map(normBasis);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = k === 'basis' && typeof x === 'string' ? (BASIS[x.toLowerCase()] || x) : normBasis(x);
  return o;
}
/** A picture card in either shape: { kind: 'view', view: {...} } or the server's flat card { kind: 'scorecard', data, source_line, … }. */
const same = (a, b) => { const n = x => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); return !!n(a) && n(a) === n(b); };
function viewOf(c, said = '') {
  const v = c.kind === 'view' ? c.view : c;
  if (!v || !VIEW_KINDS.includes(v.kind)) return null;
  // the draft is drawn once, by its own card; the picture keeps only its title, lead, data and source. A lead that repeats
  // the answer text above it is dropped (one sentence never shows twice on a screen)
  return normBasis({ kind: v.kind, title: v.title, lead: same(v.lead, said) ? '' : v.lead, data: v.data, basis: v.basis, source: v.source || v.source_line || '', as_of: v.as_of });
}

/* ── the 3D control: opens assets/house3d.js under the plan, only where the browser draws WebGL ── */
function webgl() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}
function threeD(card) {
  if (!webgl()) return null;
  const wrap = document.createElement('div'); wrap.className = 'sl-3d';
  wrap.innerHTML = '<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm sl-3d-btn" data-sl="3d" aria-expanded="false">3D view</button><div class="sl-3d-host"></div>';
  const btn = wrap.querySelector('button'), host = wrap.querySelector('.sl-3d-host');
  let view = null;
  const close = () => { try { view?.destroy?.(); } catch { /* gone */ } view = null; host.replaceChildren(); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', async () => {
    if (view) { close(); btn.focus(); return; }
    btn.disabled = true;
    try {
      const H = await import('./house3d.js?v=20261124223132');
      if (!H.supports3D()) { wrap.remove(); return; }
      view = H.renderHouse3D(host, card, { onClose: () => { close(); btn.focus(); } });
      if (view?.fallback) { view = null; wrap.remove(); return; }
      btn.setAttribute('aria-expanded', 'true');
    } catch (e) {
      console.warn('3D view did not load', e);
      host.innerHTML = '<p class="sl-line">The 3D view did not load.</p>';
    } finally { btn.disabled = false; }
  });
  return wrap;
}

/** Draws answer cards into `host`, in order: plans (with the real outline and the 3D control), pictures, drafts.
 *  ctx.said: the answer text shown above the cards. Returns the first map command found ({ title, steps } or { tour }), or null. */
export function renderCards(host, cards, ctx = {}) {
  styles();
  let cmd = null;
  for (const c of Array.isArray(cards) ? cards : []) {
    if (!c || typeof c !== 'object') continue;
    if (c.kind === 'map_command') { if (!cmd && c.cmd && typeof c.cmd === 'object') cmd = c.cmd; continue; }
    const v = viewOf(c, ctx.said);
    if (v) {
      const box = document.createElement('div'); box.className = 'sl-card';
      host.appendChild(box);
      try { renderView(box, v); } catch (e) { console.warn('picture failed', e); box.remove(); }
      continue;
    }
    let el = null;
    try { el = renderCard(c, { turn: host }); } catch (e) { console.warn('card failed', e); }
    if (!el) continue;
    host.appendChild(el);
    // the plan card draws the real outline itself (agent-cards.js, marked data-outline) and its own 3D control (data-ca="3d")
    if (c.kind === 'floor_sketch' && !el.querySelector('[data-ca="3d"],[data-sl="3d"]')) { const d = threeD(c); if (d) el.after(d); }
  }
  return cmd;
}

/* ── the map command: the shell's bus (assets/mapcmd.js) ── */
let busP = null;
const bus = () => (window.MapCmd ? Promise.resolve(window.MapCmd) : (busP ||= import('./mapcmd.js?v=20261124223132').then(m => m.MapCmd || window.MapCmd).catch(() => null)));
/** Sends a map command without leaving the screen: inside a frame to the shell; in the shell to the globe when it is open,
 *  else as a 'bsp:map' event the bus keeps off the globe ("Show on map" opens the globe with it). Returns where it went. */
export async function sendMap(cmd) {
  if (!cmd || typeof cmd !== 'object') return null;
  if (window.parent && window.parent !== window) { try { window.parent.postMessage({ type: 'bsp:map', cmd }, location.origin); return 'shell'; } catch { /* no parent */ } }
  const M = await bus();
  if (M && window.__bspGlobeOpen) return M.run(cmd) ? 'globe' : null;
  const v = M ? M.validate(cmd) : { ok: true };
  if (!v.ok) { console.warn('[map] command refused:', (v.errors || []).join('; ')); return null; }
  // the command as the server sent it (a globe that knows the 'site' step reads its outline and precision); _clean keeps the
  // bus from parking it and opening the globe over the answer
  window.dispatchEvent(new CustomEvent('bsp:map', { detail: { ...cmd, _clean: true } }));
  return 'event';
}
/** Opens the globe and runs the command there (the visitor asked for the map). */
export async function openMap(cmd) {
  if (window.parent && window.parent !== window) return sendMap(cmd);
  const M = await bus();
  return M ? M.run(cmd) : null;
}
function mapButton(cmd, label = 'Show on map') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'sys-btn sys-btn--ghost sys-btn--sm sl-map'; b.dataset.sl = 'map'; b.textContent = label;
  b.addEventListener('click', () => openMap(cmd));
  return b;
}

/* ── the box ── */
let active = null;    // the box on screen: { form, input, out }
let seq = 0;
const DEGRADED = { parcel: 'parcel record', parcels: 'parcel record', footprint: 'building outline', footprints: 'building outline', outline: 'building outline', permits: 'permits', elevation: 'ground elevation', geocode: 'address match', census: 'address match', assessor: 'assessor record', record: 'sales record' };
const say = s => DEGRADED[String(s).toLowerCase()] || String(s).replace(/[_-]+/g, ' ');
const short = text => { const p = parseAddress(text); return p ? [p.street, p.town].filter(Boolean).join(', ') : String(text).trim().slice(0, 60); };
const roleId = () => { try { return Session.role().id; } catch { return ''; } };
function connectedFor(id) {
  try { const r = Session.roles().find(x => x.id === id) || Session.role(); return Session.connectedApps(r.co, (r.apps || []).map(a => a.id)); } catch { return undefined; }
}

function drawAnswer(out, res, text, opts) {
  const a = document.createElement('div');
  a.className = 'sl-ans'; a.dataset.status = String(res.status || 'error');
  const st = String(res.status || '');
  const body = clip40(res.text || (st === 'not_found' ? `Could not find ${short(text)}.` : 'The address lookup did not answer.'));
  a.innerHTML = `<p class="sl-text">${esc(body)}</p>`;
  const chips = [];
  if (st === 'outside') chips.push('<span class="sys-chip sys-chip--warn">Outside the service area</span>');
  const deg = Array.isArray(res.degraded) ? [...new Set(res.degraded.map(say))].slice(0, 3) : [];
  if (deg.length) chips.push(`<span class="sys-chip sys-chip--info">No answer from ${esc(deg.join(', '))}</span>`);
  if (chips.length) a.insertAdjacentHTML('beforeend', `<div class="sys-chips sl-chips">${chips.join('')}</div>`);
  // several buildings on the lot: one button each, largest first; the drawn one is pressed, another runs the lookup again for it
  const lot = (res.cards || []).find(c => c && c.kind === 'floor_sketch')?.building?.lot;
  const bs = lot && Number(lot.n) >= 2 && Array.isArray(lot.buildings) ? lot.buildings.filter(b => b && Number.isInteger(b.n) && b.n >= 1 && b.n <= 8) : [];
  if (st === 'found' && bs.length >= 2) {
    const g = document.createElement('div'); g.className = 'sl-choose'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Buildings on this lot, largest first');
    for (const x of bs) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sys-btn sys-btn--secondary sys-btn--sm'; b.dataset.sl = 'building';
      const on = x.shown === true || x.n === lot.shown;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = `Building ${x.n}` + (Number(x.sqft) > 0 ? ` · ${Number(x.sqft).toLocaleString('en-US')} sq ft` : '');
      b.addEventListener('click', async () => {
        if (b.getAttribute('aria-pressed') === 'true' || g.getAttribute('aria-busy') === 'true') return;
        // the answer stays on screen while the other building loads (keep), so the page does not jump to what lies below it;
        // the new answer's pressed button is then kept in view and focused
        g.setAttribute('aria-busy', 'true');
        await lookup(text, { ...opts, host: out, building: x.n, keep: true });
        const now = out.querySelector('[data-sl="building"][aria-pressed="true"]');
        if (now) { now.scrollIntoView({ block: 'nearest' }); now.focus({ preventScroll: true }); }
      });
      g.appendChild(b);
    }
    a.appendChild(g);
  }
  // several lots at one address: one button each, a street address and no owner
  const list = (Array.isArray(res.choices) ? res.choices : Array.isArray(res.choose) ? res.choose : []).slice(0, 8)
    .map(c => (typeof c === 'string' ? { label: c } : c)).filter(c => c && c.label);
  if (st === 'choose' && list.length) {
    const g = document.createElement('div'); g.className = 'sl-choose'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Lots at this address');
    const job = parseAddress(text)?.job;
    for (const c of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sys-btn sys-btn--secondary sys-btn--sm'; b.dataset.sl = 'pick';
      b.textContent = String(c.label).slice(0, 80);
      b.addEventListener('click', () => {
        const next = job ? `${c.label} for ${/^(a|an|the)\s/i.test(job) ? '' : 'a '}${job}` : String(c.label);
        if (active && active.out === out) active.input.value = next;
        lookup(next, { ...opts, host: out, pick: c.key || c.id || undefined });
      });
      g.appendChild(b);
    }
    a.appendChild(g);
  }
  const cards = document.createElement('div'); cards.className = 'sl-cards';
  a.appendChild(cards);
  const cmd = renderCards(cards, res.cards || [], { said: body });
  if (!cards.childElementCount) cards.remove();
  // one "Show on map" per answer: a plan card carries its own, and takes the answer's command
  const sketch = [...cards.querySelectorAll('article.ca-sketch')].find(x => typeof x._setMap === 'function');
  if (cmd && sketch) sketch._setMap(cmd);
  else if (cmd && !cards.querySelector('[data-ca="map"],[data-ca="map-link"]')) a.appendChild(mapButton(cmd));
  const src = (Array.isArray(res.sources) ? res.sources : []).filter(s => s && (s.title || s.publisher)).slice(0, 8);
  if (src.length) a.insertAdjacentHTML('beforeend', `<div class="sys-src sl-src" data-src>${src.map(s => `<p>${s.n ? `[${esc(s.n)}] ` : ''}${s.url && /^https?:\/\//i.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.publisher)}</a>` : esc(s.title || s.publisher)}${s.publisher && s.title ? ` · ${esc(s.publisher)}` : ''}${s.date ? ` · ${esc(s.date)}` : ''}</p>`).join('')}</div>`);
  // the Sources drawer holds one copy of this box's sources: the earlier answer's lines (its own and its cards'), moved
  // there by the shell, go
  for (const el of out._slSrc || []) (el.closest('.drawer-item') || el).remove();
  out._slSrc = [...a.querySelectorAll('[data-src]')];
  // an answer with no sources leaves no Sources control over an empty list (the shell repaints it only when sources land)
  if (!out._slSrc.length) {
    const list = document.querySelector('.drawer-list[data-drawer="src"]'), btn = document.querySelector('#topbar [data-drawer-btn="src"]');
    if (list && btn && !list.childElementCount) btn.hidden = true;
  }
  out.replaceChildren(a);
  return cmd;
}
function drawLine(out, text, cls = '') {
  const p = document.createElement('p'); p.className = `sl-line${cls ? ' ' + cls : ''}`; p.textContent = text;
  out.replaceChildren(p);
  return p;
}

/**
 * Looks up one typed address, word for word. Resolves { status, text, cmd } once the answer (or the reason there is none)
 * is on screen. With no host and no box on screen, the home opens with ?address=<text> and runs it there.
 */
export async function lookup(text, opts = {}) {
  const typed = String(text ?? '').trim();
  if (!typed) return { status: 'error', text: '' };
  const out = opts.host || (active && active.out && active.out.isConnected ? active.out : null);
  if (!out) { location.hash = `${HOME}?address=${encodeURIComponent(typed)}`; return { status: 'handed', text: typed }; }
  styles();
  const my = ++seq, ctrl = new AbortController();
  out._slCtrl?.abort(); out._slCtrl = ctrl;
  out.setAttribute('aria-busy', 'true');
  // opts.keep (another building on the same lot): the answer stays and one progress line goes under its row of buttons
  const kept = opts.keep ? out.querySelector('.sl-ans .sl-choose') : null;
  out.querySelector('.sl-keep')?.remove();
  let line;
  if (kept) { line = document.createElement('p'); line.className = 'sl-line sl-progress sl-keep'; line.textContent = `Looking up ${short(typed)}…`; kept.after(line); }
  else line = drawLine(out, `Looking up ${short(typed)}…`, 'sl-progress');
  line.setAttribute('role', 'status');
  const role = opts.role || roleId(), connected = opts.connected || connectedFor(role);
  let res, guard;
  try {
    res = await Promise.race([
      Backend.siteBrief(typed, role, connected, { signal: ctrl.signal, pick: opts.pick, building: opts.building }),
      new Promise((_, no) => { guard = setTimeout(() => { ctrl.abort(); no(Object.assign(new Error('The address lookup took too long. Try again.'), { code: 'timeout' })); }, GUARD_MS); }),
    ]);
  } catch (e) {
    if (my !== seq || e?.code === 'aborted') return { status: 'stopped', text: '' };
    out.removeAttribute('aria-busy');
    const msg = e?.message && e.name === 'BackendError' || e?.code === 'timeout' ? e.message : 'The address lookup service cannot be reached.';
    if (kept && kept.isConnected) { line.className = 'sl-line sl-fail sl-keep'; line.textContent = msg; kept.removeAttribute('aria-busy'); }
    else drawLine(out, msg, 'sl-fail').setAttribute('role', 'status');
    return { status: 'error', text: msg, code: e?.code || 'error' };
  } finally { clearTimeout(guard); }
  if (my !== seq) return { status: 'stopped', text: '' };
  out.removeAttribute('aria-busy');
  const cmd = drawAnswer(out, res, typed, { role, connected, pick: opts.pick });   // a building pick keeps the lot pick
  if (cmd) await sendMap(cmd);
  return { status: res.status || 'error', text: res.text || '', cmd };
}

/** Draws the "Address" box in `container`; answers land in opts.out (default: a block under the box). Returns { destroy }. */
export function mount(container, opts = {}) {
  styles();
  const n = ++mount.n;
  const box = document.createElement('form');
  box.className = 'sl-box'; box.setAttribute('role', 'search'); box.setAttribute('aria-label', 'Address lookup'); box.noValidate = true;
  box.innerHTML = `<label class="sys-field-label sl-label" for="sl-in-${n}">Address</label>`
    + `<div class="sl-row"><input class="sys-input sl-in" id="sl-in-${n}" name="address" type="text" inputmode="text" autocomplete="street-address" maxlength="300" enterkeyhint="search" spellcheck="false">`
    + `<button type="submit" class="sys-btn sys-btn--primary sl-go">Look up</button></div>`;
  container.appendChild(box);
  let out = opts.out;
  if (!out) { out = document.createElement('div'); out.className = 'sl-out'; container.appendChild(out); }
  out.setAttribute('aria-live', 'polite');
  const input = box.querySelector('input');
  if (opts.value) input.value = opts.value;
  const me = { form: box, input, out };
  active = me;
  box.addEventListener('submit', e => { e.preventDefault(); const t = input.value.trim(); if (t) lookup(t, { host: out, role: opts.role }); else input.focus(); });
  return { el: box, input, out, lookup: t => { input.value = t; return lookup(t, { host: out, role: opts.role }); }, destroy() { out._slCtrl?.abort(); if (active === me) active = null; box.remove(); } };
}
mount.n = 0;

export const BSPSite = { lookup, mount, renderCards, sendMap, openMap };
if (typeof window !== 'undefined' && !window.BSPSite) window.BSPSite = BSPSite;   // a page's own stand-in (a test's stub) keeps its place
export default BSPSite;
