/* Company agent cards (agent.html): the floor sketch and the action-draft card, built from the `card` events in the answer stream.
   renderCard(ev, ctx) is passed to Chat.mount as opts.renderCard (through agent.js); chat.js puts the element in the turn's
   `.ch-blocks` area. Every text value is escaped here and every number is coerced, so no server markup is ever inserted.
   Buttons carry data-ca (never data-a / data-act / data-prompt), so the chat widget's own click handler ignores them.
   Nothing here makes a network call: approving a draft only marks it in this session. */

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const num = v => Number(v) || 0;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const PX = 8;   // drawing units per foot
const FT = 3.28084;   // feet per metre
const RUN_NAMES = { water: 'Water', gas: 'Gas', drain: 'Drain', wire: 'Wire', power: 'Power', duct: 'Duct' };
const KINDS = new Set(['water', 'gas', 'drain', 'wire', 'power', 'duct']);
const BASIS_CHIP = { record: ['Company record (example data)', 'good'], public: ['Public record', 'info'], likely: ['Likely, confirm on site', 'warn'], mixed: ['Records and likely', 'info'] };
const BASIS_KEY = { public: 'Public record', record: 'Company record (example data)', likely: 'Likely, confirm on site' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const VIEW_KINDS = new Set(['scorecard', 'bridge', 'heatmap', 'pipeline_board', 'ranked_bars']);
const STAMP = (() => { try { return new URL(import.meta.url).search; } catch { return ''; } })();   // the ?v= stamp, passed on to lazy imports
const ZOOM_CAP = { parcel: 19, typed: 16.5, town: 12.5 };   // how close the globe may come, by how well the point is known
// Company-specific apps carry their company's accent; shared apps (mail, calendar, chat, CRM) take the page's current company.
const APP_CO = { servicetitan: 'pp', procore: 'cet', servicedesk: 'fl', shopify: 'fh' };

/** One basis vocabulary: 'public', 'record' (a company record, example data), 'likely'; older spellings are accepted. */
export function basisKey(b) {
  const s = String(b ?? '').trim().toLowerCase();
  if (s === 'record' || s === 'example' || s.startsWith('company record')) return 'record';
  if (s === 'public') return 'public';
  if (s === 'estimate' || s === 'est' || s === 'est.') return 'estimate';
  if (s === 'mixed') return 'mixed';
  return 'likely';
}
const isRecord = b => basisKey(b) === 'record';
const isSolid = b => { const k = basisKey(b); return k === 'record' || k === 'public'; };
const markClass = b => { const k = basisKey(b); return k === 'record' ? 'is-record' : k === 'public' ? 'is-public' : 'is-likely'; };
const fieldRole = () => { try { return document.querySelector('main.ca')?.dataset.style === 'field'; } catch { return false; } };
const coOf = (ctx, app) => APP_CO[app] || ctx?.turn?.closest?.('[data-co]')?.dataset.co || '';
/** "2024-08-03" -> "Aug 2024" (month) or "3 Aug 2024" (day); anything else is shown as given. */
function fmtDate(s, day = false) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(s ?? ''));
  if (!m) return String(s ?? '');
  const mo = MONTHS[Number(m[2]) - 1] || '';
  return day && m[3] ? `${Number(m[3])} ${mo} ${m[1]}` : `${mo} ${m[1]}`;
}
const yearsBetween = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return isFinite(x) && isFinite(y) ? (y - x) / 3.15576e10 : 0; };

/** Dispatches a card event to its renderer; unknown kinds render nothing.
 *  ctx.live: the card arrived in an answer being given now (a restored thread passes nothing, so a map command waits for a tap). */
export function renderCard(ev, ctx = {}) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.kind === 'floor_sketch') return renderSketch(ev, ctx);
  if (ev.kind === 'action_draft') return renderDraft(ev, ctx);
  if (ev.kind === 'view' && ev.view && typeof ev.view === 'object') return renderViewCard(ev.view, ctx);
  if (VIEW_KINDS.has(ev.kind)) return renderViewCard(ev, ctx);
  if (ev.kind === 'map_command') return renderMapCard(ev, ctx);
  return null;
}

/* ── pictures (scorecard, bridge, heat map, pipeline board, ranked bars): drawn by assets/agent-views.js ── */

/** The view renderer's own basis words: a company record reads "Company record (example data)", an estimate "est.". */
const viewBasis = b => { if (b == null) return b; const k = basisKey(b); return k === 'record' ? 'example' : k === 'estimate' ? 'est' : k === 'public' ? 'public' : b; };
function fixBasis(o) {
  if (Array.isArray(o)) return o.map(fixBasis);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = k === 'basis' ? viewBasis(v) : fixBasis(v);
  return out;
}
/** A server picture card (source_line, the long basis words) as the view object renderView draws. */
export function viewOf(v) {
  return {
    kind: String(v.kind || ''), title: v.title, lead: v.lead, data: fixBasis(v.data), basis: viewBasis(v.basis),
    source: String(v.source ?? v.source_line ?? '').replace(/^\s*source:\s*/i, ''), as_of: v.as_of,
    draft: v.draft && typeof v.draft === 'object' ? v.draft : null,
  };
}
function renderViewCard(v, ctx = {}) {
  const box = document.createElement('div');
  box.className = 'ca-view'; box.dataset.viewKind = String(v.kind || '');
  const view = viewOf(v);
  box.ready = import(new URL('./agent-views.js' + STAMP, import.meta.url).href)
    .then(m => { box._view = m.renderView(box, view); return box._view?.ready; })
    .catch(e => { console.warn('agent cards: the picture did not load', e); box.innerHTML = '<p class="sys-src">The picture did not load.</p>'; });
  return box;
}

/* ── the globe: "Show on map" ── */

const inFrame = () => { try { return window.parent && window.parent !== window; } catch { return false; } };
/** Sends a map command through the shell: MapCmd on the page that has it, else to the shell from inside its frame. Returns how
 *  it went ('shell', 'parent') or null when neither is there (the control is then a link to the globe). */
export function runMap(cmd) {
  if (!cmd || typeof cmd !== 'object') return null;
  try {
    if (!inFrame() && window.MapCmd && typeof window.MapCmd.run === 'function') { window.MapCmd.run(cmd); return 'shell'; }
    if (inFrame()) { window.parent.postMessage({ type: 'bsp:map', cmd, detail: cmd }, location.origin); return 'parent'; }
  } catch (e) { console.warn('agent cards: map command not sent', e); }
  return null;
}
const canSendMap = () => inFrame() || !!(typeof window !== 'undefined' && window.MapCmd && typeof window.MapCmd.run === 'function');
/** The globe screen's own address for a command: a prepared tour, or the last step's place. */
export function globeHref(cmd) {
  if (cmd?.tour) return `app.html#/globe/view?tour=${encodeURIComponent(cmd.tour)}`;
  const s = (Array.isArray(cmd?.steps) ? cmd.steps : []).filter(x => x && isFinite(Number(x.lat)) && isFinite(Number(x.lon))).at(-1);
  if (!s) return 'app.html#/globe/view';
  const p = new URLSearchParams({ lat: String(s.lat), lon: String(s.lon), label: String(s.label || '') });
  if (isFinite(Number(s.zoom))) p.set('zoom', String(s.zoom));
  return `app.html#/globe/view?${p}`;
}
function mapControlHTML(cmd) {
  return canSendMap()
    ? '<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm ca-map-btn" data-ca="map">Show on map</button>'
    : `<a class="sys-btn sys-btn--secondary sys-btn--sm ca-map-btn" data-ca="map-link" href="${esc(globeHref(cmd))}">Show on map</a>`;
}
/** A floor sketch's own command when the answer sent none: fly to the place, as close as its precision allows. */
function siteCmd(ev) {
  const p = ev.place && typeof ev.place === 'object' ? ev.place : null;
  const lat = Number(p?.lat), lon = Number(p?.lon);
  if (!p || !isFinite(lat) || !isFinite(lon)) return null;
  const prec = ZOOM_CAP[p.precision] ? p.precision : 'typed';
  const b = ev.building || {}, bearing = Number(b.front?.bearing_deg);
  const step = { kind: 'site', lat, lon, label: String(ev.address || p.label || '').split(',').slice(0, 2).join(',').trim(), precision: prec,
    zoom: Math.min(ZOOM_CAP[prec], prec === 'parcel' ? 18.5 : ZOOM_CAP[prec]), pitch: prec === 'parcel' ? 60 : 0, bearing: isFinite(bearing) ? bearing : 0, hold_ms: 8000 };
  const o = b.frame?.origin, ring = b.footprint?.ring_m;
  if (prec !== 'town' && o && isFinite(Number(o.lat)) && isFinite(Number(o.lon)) && Array.isArray(ring) && ring.length >= 3) {
    const k = 111320 * Math.cos(Number(o.lat) * Math.PI / 180);
    step.outline = ring.slice(0, 48).filter(q => Array.isArray(q)).map(([x, y]) => [Math.round((Number(o.lon) + num(x) / k) * 1e7) / 1e7, Math.round((Number(o.lat) + num(y) / 110574) * 1e7) / 1e7]);
    const h = Number(b.height?.ridge_m);
    if (isFinite(h)) { step.height_m = h; step.height_basis = basisKey(b.height?.basis) === 'public' ? 'public' : 'likely'; }
  }
  return { title: step.label, source: 'site', steps: [step] };
}
/** A map command card. On an answer given now it runs once; a restored thread only shows the control. When the turn already
 *  holds a floor sketch, the sketch's own "Show on map" takes the command and no second control is drawn. */
function renderMapCard(ev, ctx = {}) {
  const cmd = ev.cmd && typeof ev.cmd === 'object' ? ev.cmd : null;
  if (!cmd) return null;
  if (ctx.live) runMap(cmd);
  const sk = [...(ctx.turn?.querySelectorAll?.('article.ca-sketch') || [])].find(a => typeof a._setMap === 'function');
  if (sk) { sk._setMap(cmd); return null; }
  const a = document.createElement('article');
  a.className = 'ca-map sys-card';
  a._cmd = cmd;
  const title = ev.title || cmd.title || 'On the globe';
  a.innerHTML = `<div class="sys-card-label">Globe</div><h3 class="sys-card-title">${esc(title)}</h3><div class="sys-card-foot ca-map-foot">${mapControlHTML(cmd)}</div>`;
  a.addEventListener('click', e => { const b = e.target.closest?.('[data-ca="map"]'); if (b && a.contains(b)) runMap(a._cmd); });
  return a;
}

/* ── floor sketch ─────────────────────────────────────────────────────────── */

/** Every marker of the card with its floor: items inside each floor, then the outside markers on their floor. */
function markersOf(ev) {
  const floors = Array.isArray(ev.floors) ? ev.floors.filter(f => f && typeof f === 'object') : [];
  const ids = floors.map(f => String(f.id ?? ''));
  const out = [];
  floors.forEach((f, fi) => (Array.isArray(f.items) ? f.items : []).forEach((it, i) => { if (it && typeof it === 'object') out.push({ ...it, key: `f${fi}-${i}`, fi, outside: false }); }));
  (Array.isArray(ev.outside) ? ev.outside : []).forEach((it, i) => {
    if (!it || typeof it !== 'object') return;
    let fi = ids.indexOf(String(it.floor ?? '')); if (fi < 0) fi = 0;
    if (floors.length) out.push({ ...it, key: `o${i}`, fi, outside: true });
  });
  return { floors, markers: out };
}
function isFocus(m, focus) { return m.focus === true || (focus.includes(String(m.kind)) && m.focus !== false); }
function defaultFloor(ev, floors, markers) {
  const focus = (Array.isArray(ev.focus) ? ev.focus : []).map(String);
  for (const k of focus) { const m = markers.find(x => String(x.kind) === k); if (m) return m.fi; }
  const f = markers.find(x => x.focus === true); if (f) return f.fi;
  let best = 0, n = -1;
  floors.forEach((fl, i) => { const c = markers.filter(m => m.fi === i).length; if (c > n) { n = c; best = i; } });
  return best;
}
/** Where an outside marker sits: 34 units outside the wall, at `at` (0..1) along its side. The street side is `front`. */
function outsidePoint(m, W, H, front) {
  const at = Math.min(1, Math.max(0, num(m.at) || 0.5)), d = 34;
  const map = front === 'top' ? { front: 'top', rear: 'bottom', left: 'left', right: 'right' } : { front: 'bottom', rear: 'top', left: 'left', right: 'right' };
  const edge = map[String(m.side)] || 'right';
  if (edge === 'left') return [-d, at * H];
  if (edge === 'right') return [W + d, at * H];
  if (edge === 'top') return [at * W, -d];
  return [at * W, H + d];
}
function markerSVG(m, x, y, focus) {
  const solid = isSolid(m.basis), f = isFocus(m, focus);
  return `<g class="ca-fs-m ${markClass(m.basis)}${f ? ' is-focus' : ''}" data-k="${esc(m.key)}">`
    + (f ? `<circle class="ca-fs-ring" cx="${x}" cy="${y}" r="27"/>` : `<circle class="ca-fs-halo" cx="${x}" cy="${y}" r="27"/>`)
    + `<circle cx="${x}" cy="${y}" r="20"${solid ? '' : ' stroke-dasharray="5 4"'}/><text x="${x}" y="${y}">${esc(String(m.short || '?').slice(0, 2))}</text></g>`;
}

/** The real building outline (building.footprint.ring_m, metres east and north) in the plan's drawing units, centred on the
 *  plan rectangle. The plan rectangle is the outline's minimum-area rectangle, so the axes come from the ring itself: the
 *  plan's long side follows the rectangle's long side when the plan is wider than deep, and down the page points to the
 *  street (building.front.bearing_deg; south when no bearing is given; away from it when the front is drawn at the top). The
 *  map is turned, never mirrored. rot_deg is not read: the lanes that write it do not yet agree on its meaning.
 *  Null for a town-level place or no ring. */
export function outlinePoints(ev, W, H) {
  const b = ev?.building, fp = b?.footprint;
  if (!fp || ev?.place?.precision === 'town' || !Array.isArray(fp.ring_m)) return null;
  let ring = fp.ring_m.filter(p => Array.isArray(p) && isFinite(Number(p[0])) && isFinite(Number(p[1]))).map(p => [Number(p[0]), Number(p[1])]);
  if (ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring = ring.slice(0, -1);
  if (ring.length < 3) return null;
  // minimum-area rectangle: try each edge's direction
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length], L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-6) continue;
    const u = [(x1 - x0) / L, (y1 - y0) / L], v = [-u[1], u[0]];
    const pu = ring.map(p => p[0] * u[0] + p[1] * u[1]), pv = ring.map(p => p[0] * v[0] + p[1] * v[1]);
    const eu = Math.max(...pu) - Math.min(...pu), ev2 = Math.max(...pv) - Math.min(...pv);
    if (!best || eu * ev2 < best.area - 1e-9) best = { area: eu * ev2, u, v, eu, ev: ev2 };
  }
  if (!best) return null;
  // the axis that runs across the page: the longer side when the plan is wider than deep
  const across = (W >= H) === (best.eu >= best.ev) ? best.u : best.v;
  let down = [across[1], -across[0]];   // a quarter turn clockwise on the map: (east, north) -> (east, south) keeps the turn proper
  const fb = Number(b.front?.bearing_deg), street = isFinite(fb) ? [Math.sin(fb * Math.PI / 180), Math.cos(fb * Math.PI / 180)] : [0, -1];
  const toStreet = down[0] * street[0] + down[1] * street[1];
  if ((ev.front === 'top') === (toStreet > 0)) down = [-down[0], -down[1]];
  const ax = [-down[1], down[0]];   // across, fixed so the map is turned and not mirrored
  const pts = ring.map(([e, n]) => [e * ax[0] + n * ax[1], e * down[0] + n * down[1]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return pts.map(([x, y]) => [Math.round((W / 2 + (x - cx) * FT * PX) * 10) / 10, Math.round((H / 2 + (y - cy) * FT * PX) * 10) / 10]);
}

/** How far a marker's drawing reaches from its centre: a focus ring (radius 27, 3-unit stroke) or the plain circle (radius 20). */
const reach = p => (p.ring ? 29 : 22);
/** Distance from a point to a box {x0, y0, x1, y1} (0 inside it). */
const boxDist = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
/** Moves a marker off a label box until its drawing clears the box; a centre inside the box leaves through the nearest side that
 *  stays on the floor. Returns true when it moved. */
function offBox(p, b, W, H) {
  const r = reach(p), cx = Math.min(b.x1, Math.max(b.x0, p.x)), cy = Math.min(b.y1, Math.max(b.y0, p.y));
  const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
  if (d >= r) return false;
  if (d > 0.01) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; return true; }
  const ways = [[b.x0 - r, p.y, p.x - b.x0], [b.x1 + r, p.y, b.x1 - p.x], [p.x, b.y0 - r, p.y - b.y0], [p.x, b.y1 + r, b.y1 - p.y]];
  const ok = ways.filter(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H);
  const [x, y] = (ok.length ? ok : ways).sort((m, n) => m[2] - n[2])[0];
  p.x = x; p.y = y; return true;
}
/** Eases apart inside markers whose drawings would overlap (focus rings count) and keeps them off the room names in `boxes`;
 *  outside markers stay put. Positions stay on the floor. */
function spread(pts, W, H, gap = 44, boxes = []) {
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const p of pts) if (!p.fixed) for (const b of boxes) if (offBox(p, b, W, H)) moved = true;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]; if (a.fixed && b.fixed) continue;
      const g = a.ring && b.ring ? 58 : a.ring || b.ring ? 51 : gap;   // two focus rings, one ring and a circle, two circles
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= g) continue;
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const push = (g - d) / (a.fixed || b.fixed ? 1 : 2), ux = dx / d, uy = dy / d;
      if (!a.fixed) { a.x -= ux * push; a.y -= uy * push; }
      if (!b.fixed) { b.x += ux * push; b.y += uy * push; }
      moved = true;
    }
    for (const p of pts) if (!p.fixed) { p.x = Math.min(W, Math.max(0, p.x)); p.y = Math.min(H, Math.max(0, p.y)); }
    if (!moved) break;
  }
  for (const p of pts) { p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; }
}
/** Where a room's name goes: the first corner of the room (top left, bottom left, top right, bottom right) whose label box stays
 *  clear of every marker's drawing, else the corner that moves the markers least (a focus marker counts double; outside markers
 *  cannot move). Sizes are for the largest text (18 px on phones). */
function roomLabelAt(r, all, W, H) {
  const tw = String(r.label).length * 10.8, { x, y, w, h } = r;
  const spots = [[x + 8, y + 18, 'start', y], [x + 8, y + h - 8, 'start', y + h - 26], [x + w - 8, y + 18, 'end', y], [x + w - 8, y + h - 8, 'end', y + h - 26]]
    .map(([tx, ty, anchor, top]) => ({ tx, ty, anchor, box: anchor === 'end' ? { x0: tx - tw, y0: top, x1: tx, y1: top + 22 } : { x0: tx, y0: top, x1: tx + tw, y1: top + 22 } }));
  const cost = s => all.reduce((c, p) => {
    if (boxDist(p.x, p.y, s.box) >= reach(p)) return c;
    if (p.fixed) return c + 1e4;
    const q = { ...p }; offBox(q, s.box, W, H);
    return c + Math.hypot(q.x - p.x, q.y - p.y) * (p.ring ? 2 : 1);
  }, 0);
  let best = spots[0], low = Infinity;
  for (const s of spots) { const c = cost(s); if (c === 0) return s; if (c < low) { low = c; best = s; } }
  return best;
}
/** Where a run's label reads best: the point along the run (segment quarters and midpoints) whose label box stays furthest
 *  outside every marker's focus ring (radius 27), so a ring never covers a label. text: the label (its width counts). */
function runLabelAt(pts, markers, text = '', boxes = []) {
  const hw = Math.max(16, String(text).length * 5.4), top = 20, bottom = 2;   // half width and height of the label box at its largest size
  let best = null, score = -1e9;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0);
    const upright = Math.abs(x1 - x0) < Math.abs(y1 - y0);   // beside an upright line, a label can also sit left or right of it
    for (const t of [0.5, 0.25, 0.75, 0.15, 0.85]) for (const off of upright ? [0, -(hw + 8), hw + 8] : [0]) {
      const x = x0 + (x1 - x0) * t + off, y = y0 + (y1 - y0) * t + (off ? 12 : 0), by = y - 6;   // the text baseline sits 6 above the line
      const clear = boxes.reduce((m, b) => {   // room names and labels already placed: boxes {x0, y0, x1, y1}
        const dx = Math.max(b.x0 - (x + hw), 0, (x - hw) - b.x1), dy = Math.max(b.y0 - (by + bottom), 0, (by - top) - b.y1);
        return Math.min(m, Math.hypot(dx, dy) - 12);
      }, markers.reduce((m, p) => {
        const dx = Math.max(x - hw - p.x, 0, p.x - (x + hw)), dy = Math.max(by - top - p.y, 0, p.y - (by + bottom));
        return Math.min(m, Math.hypot(dx, dy) - 29);
      }, 1e9));
      const sc = Math.min(clear, 40) * 4 + Math.min(len, 200) / 10 - (off ? 8 : 0);   // clear of rings and labels first, then on the line, then the longer segment
      if (sc > score) { score = sc; best = [x, y]; }
    }
  }
  return best ? best.map(v => Math.round(v * 10) / 10) : pts[0];
}
/** A gas line that stops at the wall the gas meter sits outside continues out to it: the short link from the line's end (within
 *  five feet of that wall) to the meter, or null. A line ending at any other wall is never joined across the house. */
function toMeter(pts, kind, all, W, H) {
  if (kind !== 'gas' || pts.length < 2) return null;
  const meter = all.find(p => p.fixed && String(p.m.kind) === 'gas_meter'); if (!meter) return null;
  const atWall = meter.x < 0 ? ([x]) => x <= 40 : meter.x > W ? ([x]) => x >= W - 40 : meter.y < 0 ? ([, y]) => y <= 40 : ([, y]) => y >= H - 40;
  const d = q => Math.hypot(q[0] - meter.x, q[1] - meter.y);
  const end = [pts[0], pts.at(-1)].filter(atWall).sort((a, b) => d(a) - d(b))[0];
  return end ? [end, [meter.x, meter.y]] : null;
}

/**
 * The SVG for one floor (string). Units are feet scaled by 8; margin 64 on each side (an outside marker's focus ring reaches 62.5
 * past the wall) plus 16 more at the bottom for the street label.
 * opts: { focus: string[] (focus kinds), front: 'bottom' | 'top', markers: [{...item, key}] for this floor (inside and outside) }.
 */
export function sketchSVG(floor, outside = [], opts = {}) {
  const f = floor && typeof floor === 'object' ? floor : {};
  const W = Math.max(1, num(f.w)) * PX, H = Math.max(1, num(f.h)) * PX;
  const focus = (opts.focus || []).map(String), front = opts.front === 'top' ? 'top' : 'bottom';
  const inside = opts.markers ? opts.markers.filter(m => !m.outside) : (Array.isArray(f.items) ? f.items : []).map((it, i) => ({ ...it, key: `i${i}` }));
  const outs = opts.markers ? opts.markers.filter(m => m.outside) : (Array.isArray(outside) ? outside : []).map((it, i) => ({ ...it, key: `o${i}`, outside: true }));
  const name = String(f.name || 'Floor');
  const said = b => ({ record: 'company record', public: 'public record' }[basisKey(b)] || 'likely');
  const say = [...inside, ...outs].map(m => `${m.label || ''}${m.note ? `, ${m.note}` : ''} (${said(m.basis)})`);
  const ring = Array.isArray(opts.outline) && opts.outline.length >= 3 ? opts.outline : null;
  const label = `${name} sketch${ring ? ', drawn over the building outline from public record, layout likely' : ''}: ${say.length ? say.join('; ') : 'no equipment recorded on this floor'}`;
  const boxes = [];   // label boxes run labels keep clear of
  let roomText = '';   // room names go over the pipe runs (with a halo), so a line never hides them
  // The drawing reaches 64 past the plan on each side (80 below, for the street label), and further when the outline does.
  const rx = ring ? ring.map(p => p[0]) : [0], ry = ring ? ring.map(p => p[1]) : [0];
  const x0 = Math.min(0, ...rx) - 64, y0 = Math.min(0, ...ry) - 64, x1 = Math.max(W, ...rx) + 64, y1 = Math.max(H, ...ry) + 80;
  let s = `<svg class="ca-fs${ring ? ' has-outline' : ''}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="img" aria-label="${esc(label)}" focusable="false"><title>${esc(label)}</title>`;
  if (ring) s += `<polygon class="ca-fs-outline" points="${ring.map(p => p.join(',')).join(' ')}"/>`;
  s += `<rect class="ca-fs-wall" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;
  // Marker positions: outside markers sit off the walls; inside markers closer than one marker apart are eased apart so each stays readable.
  const all = [...inside.map(m => ({ m, x: num(m.x) * PX, y: num(m.y) * PX, fixed: false, ring: isFocus(m, focus) })), ...outs.map(m => { const [x, y] = outsidePoint(m, W, H, front); return { m, x, y, fixed: true, ring: isFocus(m, focus) }; })];
  spread(all, W, H);
  // Room names take the first corner of their room that no marker covers; a marker still on a name is then eased off it.
  for (const r of Array.isArray(f.rooms) ? f.rooms : []) {
    if (!r || typeof r !== 'object') continue;
    const x = num(r.x) * PX, y = num(r.y) * PX, w = num(r.w) * PX, h = num(r.h) * PX;
    if (!(x <= 0 && y <= 0 && w >= W && h >= H)) s += `<rect class="ca-fs-room" x="${x}" y="${y}" width="${w}" height="${h}"/>`;   // a room that is the whole floor is only named
    if (r.label) { const at = roomLabelAt({ label: r.label, x, y, w, h }, all, W, H); roomText += `<text class="ca-fs-room-t" x="${at.tx}" y="${at.ty}"${at.anchor === 'end' ? ' text-anchor="end"' : ''}>${esc(r.label)}</text>`; boxes.push(at.box); }
  }
  s += `<rect class="ca-fs-wall ca-fs-wall-line" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;
  if (boxes.length) spread(all, W, H, 44, boxes);
  // Street side: a small arrow from the wall and the label 34 units out (further out when a marker sits on that side). The arrow
  // stops 18 above the baseline, clear of the capitals at the phone text size.
  const busy = outs.some(m => { const [, oy] = outsidePoint(m, W, H, front); return front === 'bottom' ? oy > H : oy < 0; });
  const street = opts.frontBasis === 'assumed' ? 'Street side, assumed' : 'Street side';
  if (front === 'bottom') {
    const ly = busy ? H + 74 : H + 34;
    s += `<path class="ca-fs-arrow" d="M${W / 2} ${H + 4}V${ly - 18}M${W / 2 - 5} ${ly - 23}L${W / 2} ${ly - 18}L${W / 2 + 5} ${ly - 23}"/><text class="ca-fs-street" x="${W / 2}" y="${ly}">${street}</text>`;
  } else {
    s += `<text class="ca-fs-street" x="${W / 2}" y="-30">${street}</text>`;
  }
  // Pipe runs under the markers: solid from records, dashed when likely. The link from a gas line to its meter is drawn on its own,
  // dashed unless both the line and the meter are records.
  for (const r of Array.isArray(f.runs) ? f.runs : []) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.points)) continue;
    const k = KINDS.has(r.kind) ? r.kind : 'water';
    const pts = r.points.filter(p => Array.isArray(p)).map(p => [num(p[0]) * PX, num(p[1]) * PX]); if (pts.length < 2) continue;
    s += `<polyline class="ca-fs-run ${isSolid(r.basis) ? 'is-record' : 'is-likely'} k-${k}" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
    const link = toMeter(pts, k, all, W, H);
    if (link) { const meter = all.find(p => p.fixed && String(p.m.kind) === 'gas_meter'); s += `<polyline class="ca-fs-run ca-fs-link ${isSolid(r.basis) && isSolid(meter?.m.basis) ? 'is-record' : 'is-likely'} k-${k}" points="${link.map(p => p.join(',')).join(' ')}"/>`; }
    const txt = r.label || RUN_NAMES[k], at = runLabelAt(pts, all, txt, boxes), hw = Math.max(16, String(txt).length * 5.4);
    boxes.push({ x0: at[0] - hw, y0: at[1] - 26, x1: at[0] + hw, y1: at[1] - 4 });
    s += `<text class="ca-fs-run-t" x="${at[0]}" y="${at[1] - 6}">${esc(txt)}</text>`;
  }
  s += roomText;
  // Markers: non-focus first so focus rings sit on top.
  all.sort((a, b) => Number(isFocus(a.m, focus)) - Number(isFocus(b.m, focus)));
  for (const { m, x, y } of all) s += markerSVG(m, x, y, focus);
  return s + '</svg>';
}

/** "Built 1962" becomes "Built 1962 (likely)" when the year is inferred; the same for the fuel and, on a likely sketch, the layout. */
function houseText(ev) {
  const h = ev.house && typeof ev.house === 'object' ? ev.house : {};
  const t = String(h.text || '').trim(); if (!t || /\(likely\)/i.test(t)) return t;
  const likely = s => s.replace(/\.?\s*$/, ' (likely).');
  return t.split(/(?<=\.)\s+/).map((s, i) => {
    if (/\bbuilt\b/i.test(s)) return h.year_basis === 'likely' ? likely(s) : s;
    if (/\b(heat|gas|oil|propane|electric)\b/i.test(s)) return h.fuel_basis === 'likely' ? likely(s) : s;
    if (i === 0 && ev.basis === 'likely') return likely(s);
    return s;
  }).join(' ');
}

const swatch = (cls, dashed) => `<svg class="ca-sw" viewBox="0 0 22 22" width="18" height="18" aria-hidden="true" focusable="false"><circle class="${cls}" cx="11" cy="11" r="8"${dashed ? ' stroke-dasharray="3 2.5"' : ''}/></svg>`;
// Line swatches match the runs: the kind shows in the line weight (and the label on the run), likely lines are dashed.
const lineSw = (kind, dashed) => `<svg class="ca-sw" viewBox="0 0 26 10" width="24" height="10" aria-hidden="true" focusable="false"><line class="ca-sw-line k-${esc(kind)}" x1="3" y1="5" x2="23" y2="5"${dashed ? ' stroke-dasharray="4 3"' : ''}/></svg>`;

function equipRow(m, focus, floors) {
  const solid = isSolid(m.basis), f = isFocus(m, focus), fl = floors[m.fi];
  const where = [m.note, m.outside ? (/^outside\b/i.test(String(m.note || '')) ? '' : 'Outside') : floors.length > 1 && fl?.name ? fl.name : ''].filter(Boolean).map(String);   // an outside marker is not on a floor
  return `<li><button type="button" class="ca-eq" data-ca="equip" data-k="${esc(m.key)}" data-floor="${m.fi}">`
    + `<span class="ca-eq-m ${markClass(m.basis)}" aria-hidden="true">${esc(String(m.short || '?').slice(0, 2))}</span>`
    + `<span class="ca-eq-t"><span class="ca-eq-h"><b>${esc(m.label || 'Item')}</b>${f ? '<span class="sys-chip sys-chip--soft">Start here</span>' : ''}${solid ? '' : '<span class="sys-chip sys-chip--warn">Likely</span>'}</span>`
    + (where.length ? `<span class="ca-eq-n">${esc(where.join(' · '))}</span>` : '')
    + (m.detail ? `<span class="ca-eq-d">${esc(m.detail)}</span>` : '')
    + `</span></button></li>`;
}

const PRECISION = { parcel: 'Parcel match', typed: 'Address point, parcel not matched', town: 'Town only' };
/** The place chip (the typed address and how well it was found) and the outline's date, with a chip when the imagery is old. */
function placeHTML(ev, fp) {
  const p = ev.place && typeof ev.place === 'object' ? ev.place : null;
  if (!p && !fp) return '';
  const typed = String(ev.address || p?.label || '');
  const how = PRECISION[p?.precision] || '';
  const town = p?.precision === 'town' && p.label && p.label !== typed ? `: ${p.label}` : '';
  const chips = [];
  if (typed || how) chips.push(`<span class="sys-chip sys-chip--soft ca-fs-place" data-precision="${esc(p?.precision || '')}"><span class="sys-sr">Place: ${esc(typed)}. </span>${esc(how || typed)}${esc(town)}</span>`);
  const asOf = fp?.as_of;
  if (asOf && yearsBetween(asOf, ev.as_of || new Date().toISOString()) > 5) chips.push('<span class="sys-chip sys-chip--warn ca-fs-old">Outline may be out of date</span>');
  const dated = asOf ? `<p class="sys-src ca-fs-outline-t">Outline from imagery dated ${esc(fmtDate(asOf))}</p>` : '';
  return (chips.length ? `<div class="sys-chips ca-fs-placebar">${chips.join('')}</div>` : '') + dated;
}
/** The key: only the kinds of basis the card holds (public record, company record, likely), then the line kinds drawn. */
function legendHTML(ev, markers, floors, outline) {
  const held = new Set();
  for (const m of markers) held.add(basisKey(m.basis));
  const runs = floors.flatMap(f => (Array.isArray(f.runs) ? f.runs : []).filter(r => r && Array.isArray(r.points) && r.points.length >= 2));
  for (const r of runs) held.add(basisKey(r.basis));
  if (outline) { held.add('public'); held.add('likely'); }   // the outline is a public record; the layout over it is likely
  if (!held.size) held.add('likely');
  const kinds = [...new Set(runs.map(r => (KINDS.has(r.kind) ? r.kind : 'water')))];
  const solidRun = runs.some(r => isSolid(r.basis)), likelyRun = runs.some(r => !isSolid(r.basis));
  const out = [];
  if (held.has('public')) out.push(`<span data-basis="public">${outline ? lineSw('outline') : swatch('ca-sw-pub')}${BASIS_KEY.public}</span>`);
  if (held.has('record')) out.push(`<span data-basis="record">${swatch('ca-sw-rec')}${BASIS_KEY.record}</span>`);
  if (held.has('likely') || held.has('mixed') || held.has('estimate')) out.push(`<span data-basis="likely">${swatch('ca-sw-lik', true)}${BASIS_KEY.likely}</span>`);
  for (const k of (kinds.length ? kinds : ['water', 'gas', 'drain'])) out.push(`<span>${lineSw(k, !solidRun && likelyRun)}${RUN_NAMES[k]}</span>`);
  if (solidRun && likelyRun) out.push(`<span>${lineSw('water', true)}Likely line</span>`);
  return `<p class="ca-legend" aria-label="Key">${out.join('')}</p>`;
}
/** Each public fact with its source and date, permits, and the numbered sources: in a closed section under the plan. */
function factsHTML(ev) {
  const facts = (Array.isArray(ev.facts) ? ev.facts : []).filter(f => f && typeof f === 'object' && f.v != null && f.v !== '');
  const permits = (Array.isArray(ev.permits) ? ev.permits : []).filter(p => p && typeof p === 'object');
  const srcs = (Array.isArray(ev.sources) ? ev.sources : []).filter(s => s && typeof s === 'object');
  if (!facts.length && !permits.length) return '';
  const srcOf = n => srcs.find(s => String(s.n) === String(n));
  const val = v => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
  const where = (src, title, date) => [title || srcOf(src)?.title || '', date ? fmtDate(date, true) : ''].filter(Boolean).join(' · ');
  const rows = facts.map(f => `<div data-basis="${esc(basisKey(f.basis))}"><dt>${esc(f.label || f.k)}</dt><dd><span class="ca-fact-v">${esc(val(f.v))}</span>${basisKey(f.basis) === 'likely' ? ' <span class="sys-chip sys-chip--warn">Likely</span>' : ''}<span class="ca-fact-src">${esc(where(f.src, f.source, f.as_of))}</span></dd></div>`);
  if (permits.length) {
    const p = permits[0];
    rows.push(`<div data-basis="public"><dt>Permits on record</dt><dd><span class="ca-fact-v">${permits.length}, latest ${esc(String(p.type || 'permit').toLowerCase())} ${esc(fmtDate(p.date, true))}</span><span class="ca-fact-src">${esc(where(p.src, '', ''))}</span></dd></div>`);
  }
  const links = srcs.filter(s => s.title).map(s => `<li>${s.url && /^https:\/\//.test(String(s.url)) ? `<a class="sys-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}${s.publisher ? ` · ${esc(s.publisher)}` : ''}${s.date ? ` · ${esc(fmtDate(s.date, true))}` : ''}</li>`).join('');
  return `<details class="ca-facts"><summary>Facts and sources</summary><dl class="ca-fields ca-fact-list">${rows.join('')}</dl>${links ? `<ol class="ca-fact-srcs">${links}</ol>` : ''}</details>`;
}
/** The 3D control: opens assets/house3d.js under the plan (loaded on first use, with this file's ?v= stamp); a second press, or
 *  the view's own Close, removes it and frees what it drew. */
function toggle3D(a, ev, btn) {
  const host = a.querySelector('.ca-3d'); if (!host) return;
  const close = () => {
    try { a._h3?.destroy?.(); } catch (e) { console.warn('3D view did not close cleanly', e); }
    a._h3 = null; host.replaceChildren(); host.hidden = true; btn.setAttribute('aria-expanded', 'false');
  };
  if (btn.getAttribute('aria-expanded') === 'true') { close(); btn.focus({ preventScroll: true }); return; }
  btn.setAttribute('aria-expanded', 'true'); host.hidden = false;
  host.innerHTML = '<p class="sys-src ca-3d-wait">Loading the 3D view</p>';
  import(new URL('./house3d.js' + STAMP, import.meta.url).href).then(H => {
    if (btn.getAttribute('aria-expanded') !== 'true') return;   // closed while it loaded
    host.replaceChildren();
    if (!H.supports3D()) { host.innerHTML = '<p class="sys-src">The 3D view needs WebGL, which this browser does not offer.</p>'; return; }
    a._h3 = H.renderHouse3D(host, ev, { onClose: () => { close(); btn.focus({ preventScroll: true }); } });
  }).catch(e => { console.warn('3D view did not load', e); host.innerHTML = '<p class="sys-src">The 3D view did not load.</p>'; });
}

/** The floor sketch card; a repeat of a sketch already shown in an earlier turn renders as one "Floor sketch above" line. */
export function renderSketch(ev, ctx = {}) {
  const root = ctx.widget?.root || document;
  const findFirst = () => [...root.querySelectorAll('article.ca-sketch')].find(a => a.dataset.cardId === String(ev.id) && !(ctx.turn && ctx.turn.contains(a)));
  if (findFirst()) {
    const p = document.createElement('p'); p.className = 'ca-fs-ref';
    p.innerHTML = '<a class="sys-link" href="#">Floor sketch above</a>';
    p.querySelector('a').addEventListener('click', e => {
      e.preventDefault();
      const first = findFirst() || [...root.querySelectorAll('article.ca-sketch')].find(a => a.dataset.cardId === String(ev.id));   // looked up now: a regenerated turn redraws it
      if (!first) return;
      first.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
      first.querySelector('.ca-fs-title')?.focus({ preventScroll: true });
    });
    return p;
  }
  const { floors, markers } = markersOf(ev);
  const focus = (Array.isArray(ev.focus) ? ev.focus : []).map(String);
  const cur = floors.length ? defaultFloor(ev, floors, markers) : 0;
  const basis = BASIS_CHIP[basisKey(ev.basis)] || BASIS_CHIP.likely;
  const fRank = m => { const i = focus.indexOf(String(m.kind)); return i < 0 ? focus.length : i; };
  const list = [
    ...markers.filter(m => isFocus(m, focus)).sort((a, b) => fRank(a) - fRank(b)),
    ...markers.filter(m => !isFocus(m, focus) && m.fi === cur),
    ...markers.filter(m => !isFocus(m, focus) && m.fi !== cur),
  ];
  const live = !!(ev.place || ev.building) || ev.example === false;
  const example = !live && (ev.example === true || ['record', 'mixed'].includes(basisKey(ev.basis)));   // a company record card only
  const fp = ev.building?.footprint || null;
  const frontBasis = ev.front_basis || ev.building?.front?.basis || '';
  const outlines = floors.map(f => outlinePoints(ev, Math.max(1, num(f.w)) * PX, Math.max(1, num(f.h)) * PX));
  const a = document.createElement('article');
  a.className = 'ca-sketch sys-card'; a.dataset.co = 'pp';
  if (live) a.dataset.live = '1';
  a._cmd = (ev.map_command && typeof ev.map_command === 'object' ? ev.map_command.cmd || ev.map_command : null) || siteCmd(ev);
  a.innerHTML = `<div class="sys-card-label">Floor sketch <span class="sys-chip sys-chip--${basis[1]}">${basis[0]}</span>${example ? ' <span class="sys-chip sys-chip--soft ca-fs-ex">Example address</span>' : ''}</div>`
    + `<h3 class="sys-card-title ca-fs-title" tabindex="-1">${esc(ev.address || ev.place?.label || ev.title || 'Floor sketch')}</h3>`
    + placeHTML(ev, fp)
    + (houseText(ev) ? `<p class="ca-house sys-card-body">${esc(houseText(ev))}</p>` : '')
    + (ev.area?.label ? `<p class="sys-src ca-fs-area">${esc(ev.area.label)}</p>` : '')
    + (floors.length ? `<div class="sys-chips ca-fs-floors" role="group" aria-label="Floor">${floors.map((f, i) => `<button type="button" class="sys-chip" data-ca="floor" data-floor="${i}" aria-pressed="${i === cur}">${esc(f.name || `Floor ${i + 1}`)}</button>`).join('')}</div>` : '')
    + floors.map((f, i) => `<div class="ca-fs-svg" data-floor="${i}"${i === cur ? '' : ' hidden'}>${sketchSVG(f, [], { focus, front: ev.front, markers: markers.filter(m => m.fi === i), outline: outlines[i], frontBasis })}</div>`).join('')
    + legendHTML(ev, markers, floors, outlines.some(Boolean))
    + (list.length ? `<ul class="ca-equip">${list.map(m => equipRow(m, focus, floors)).join('')}</ul>` : '')
    + factsHTML(ev)
    + (floors.length || a._cmd ? `<div class="sys-actions ca-fs-acts">${floors.length ? '<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm ca-3d-btn" data-ca="3d" aria-expanded="false">3D</button>' : ''}<span class="ca-fs-mapslot">${a._cmd ? mapControlHTML(a._cmd) : ''}</span></div><div class="ca-3d" hidden></div>` : '')
    + (ev.source_line ? `<p class="sys-src">${esc(ev.source_line)}</p>` : '');
  /** A map command that came as its own card in the same answer: this card's "Show on map" sends it. */
  a._setMap = cmd => { if (!cmd || typeof cmd !== 'object') return; a._cmd = cmd; const slot = a.querySelector('.ca-fs-mapslot'); if (slot) slot.innerHTML = mapControlHTML(cmd); };
  for (const m of [...(ctx.turn?.querySelectorAll?.('article.ca-map') || [])]) { if (m._cmd) a._cmd = m._cmd; m.remove(); }   // one control per answer
  if (a._cmd) { const slot = a.querySelector('.ca-fs-mapslot'); if (slot) slot.innerHTML = mapControlHTML(a._cmd); }
  const show = i => {
    a.querySelectorAll('.ca-fs-svg').forEach(d => { d.hidden = Number(d.dataset.floor) !== i; });
    a.querySelectorAll('[data-ca="floor"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === i)));
  };
  a.addEventListener('click', e => {
    const b = e.target.closest?.('[data-ca]'); if (!b || !a.contains(b)) return;
    if (b.dataset.ca === 'floor') { show(Number(b.dataset.floor)); return; }
    if (b.dataset.ca === 'map') { runMap(a._cmd); return; }
    if (b.dataset.ca === '3d') { toggle3D(a, ev, b); return; }
    if (b.dataset.ca === 'equip') {
      const i = Number(b.dataset.floor); show(i);
      const box = a.querySelector(`.ca-fs-svg[data-floor="${i}"]`);
      const g = [...(box?.querySelectorAll('.ca-fs-m') || [])].find(x => x.dataset.k === b.dataset.k);
      box?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      if (g) { g.classList.remove('is-pulse'); void g.getBoundingClientRect(); g.classList.add('is-pulse'); clearTimeout(g._t); g._t = setTimeout(() => g.classList.remove('is-pulse'), 1200); }
    }
  });
  try { ctx.onSketch?.(ev); } catch (e) { console.warn('sketch callback failed', e); }
  return a;
}

/* ── action draft ─────────────────────────────────────────────────────────── */

/** A drafted action with Approve and Discard. Deciding only changes this card (and ev.status, so a restored thread shows it). */
export function renderDraft(ev, ctx = {}) {
  const status = ev.status === 'approved' || ev.status === 'discarded' ? ev.status : 'draft';
  const a = document.createElement('article');
  a.className = 'ca-draft sys-card';
  const co = coOf(ctx, ev.app); if (co) a.dataset.co = co;
  const size = fieldRole() ? '' : ' sys-btn--sm';
  const fields = (Array.isArray(ev.fields) ? ev.fields : []).filter(f => f && typeof f === 'object');
  const foot = status === 'approved' ? '<span class="sys-chip sys-chip--good ca-dr-status" tabindex="-1">Approved</span><p class="sys-src ca-dr-note">Nothing was sent.</p>'
    : status === 'discarded' ? '<span class="sys-chip ca-dr-status" tabindex="-1">Discarded</span>'
      : `<button type="button" class="sys-btn sys-btn--primary${size}" data-ca="approve">Approve</button><button type="button" class="sys-btn sys-btn--ghost${size}" data-ca="discard">Discard</button>`;
  a.innerHTML = `<div class="sys-card-label">Draft · Not sent${ev.app_name ? ` <span class="sys-chip sys-chip--soft">${esc(ev.app_name)}</span>` : ''}</div>`
    + `<h3 class="sys-card-title">${esc(ev.title || 'Draft')}</h3>`
    + (fields.length ? `<dl class="ca-fields">${fields.map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>` : '')
    + `<div class="sys-card-foot ca-dr-foot">${foot}</div>`;
  a.addEventListener('click', e => {
    const b = e.target.closest?.('[data-ca]'); if (!b || !a.contains(b)) return;
    const next = b.dataset.ca === 'approve' ? 'approved' : b.dataset.ca === 'discard' ? 'discarded' : null; if (!next) return;
    ev.status = next;
    const n = renderDraft(ev, ctx); if (a.dataset.cardId) n.dataset.cardId = a.dataset.cardId;
    a.replaceWith(n);
    n.querySelector('.ca-dr-status')?.focus({ preventScroll: true });
    try { ctx.onDecision?.(ev, next); } catch (err) { console.warn('decision callback failed', err); }
  });
  return a;
}
