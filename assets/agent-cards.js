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
/* The plan is drawn in CSS pixels at the card's own width: the building scales to fit, text and markers keep their size. */
const MR = 14, RING = 18;   // marker radius and focus ring radius (px): 28 and 36 px across
const MAX_H = 620;   // the drawing grows to about this height, then the plan scales by height and is centred
const MONO = 0.6;   // the plan's monospace text: one character is 0.6 em wide
const OUT_D = 32;   // an outside marker's centre sits this far out from the wall (px)
const OUT_BAND = OUT_D + RING + 6;   // the band outside markers take beside the plan
const DIM_BAND = 36, DIM_OFF = 26, STREET_BAND = 46, PAD = 10;   // the sizes sit DIM_OFF out from the wall, clear of a focus ring on it
/** A room name's short form when the card gives none (seven characters at most). */
const SHORT_NAME = { 'living room': 'Living', 'family room': 'Family', 'dining room': 'Dining', 'half bath': 'Half ba', 'full bath': 'Bath', 'bathroom': 'Bath',
  'laundry room': 'Laundry', 'utility room': 'Utility', 'mechanical room': 'Mech', 'recreation room': 'Rec', 'crawl space': 'Crawl', 'unfinished basement': 'Basemt',
  'primary bedroom': 'Primary', 'bonus room': 'Bonus', 'storage': 'Storage', 'closet': 'Closet', 'garage or utility closet': 'Utility', 'partial basement': 'Basemt' };
export function shortName(r) {
  const own = String(r?.short ?? '').trim(); if (own) return own.slice(0, 7);
  const l = String(r?.label ?? '').trim(), k = l.toLowerCase();
  if (SHORT_NAME[k]) return SHORT_NAME[k];
  const bed = /^bedroom\s*(\d+)$/i.exec(l); if (bed) return `Bed ${bed[1]}`;
  return l.split(/\s+/)[0].slice(0, 7);
}
const r1 = v => Math.round(v * 10) / 10;
const hits = (a, b, pad = 0) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
/** Distance from a point to a box {x0, y0, x1, y1} (0 inside it). */
const boxDist = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
/** How far a marker's drawing reaches from its centre: a focus ring or the plain circle, with its stroke. */
const reach = p => (p.ring ? RING + 2 : MR + 2);
function inPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Whether segment p-q crosses the box (Liang-Barsky clipping). */
function segHitsBox([x0, y0], [x1, y1], b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - b.x0], [dx, b.x1 - x0], [-dy, y0 - b.y0], [dy, b.y1 - y0]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
/** A box wholly inside the polygon: its middle inside and no wall crossing it. */
const boxInPoly = (b, P) => inPoly((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, P) && P.every((p, i) => !segHitsBox(p, P[(i + 1) % P.length], b));
const clearOfMarks = (b, all, gap = 2) => all.every(p => boxDist(p.x, p.y, b) >= reach(p) + gap);
/** Which edge of the drawing an outside marker's side is on: the street side is `front`. */
const edgeOf = (m, front) => {
  const map = front === 'top' ? { front: 'top', rear: 'bottom', left: 'left', right: 'right' } : { front: 'bottom', rear: 'top', left: 'left', right: 'right' };
  return map[String(m.side)] || 'right';
};
function markerSVG(m, x, y, focus) {
  const solid = isSolid(m.basis), f = isFocus(m, focus);
  return `<g class="ca-fs-m ${markClass(m.basis)}${f ? ' is-focus' : ''}" data-k="${esc(m.key)}">`
    + (f ? `<circle class="ca-fs-ring" cx="${x}" cy="${y}" r="${RING}"/>` : `<circle class="ca-fs-halo" cx="${x}" cy="${y}" r="${RING}"/>`)
    + `<circle cx="${x}" cy="${y}" r="${MR}"${solid ? '' : ' stroke-dasharray="4 3"'}/><text x="${x}" y="${y}">${esc(String(m.short || '?').slice(0, 2))}</text></g>`;
}

/** The real building outline (building.footprint.ring_m, metres east and north) in plan units, centred on the plan rectangle
 *  W x H. `scale` is plan units per foot (1: feet; the default 8 is the old drawing unit). The plan rectangle is the outline's
 *  minimum-area rectangle, so the axes come from the ring itself: the plan's long side follows the rectangle's long side when
 *  the plan is wider than deep, and down the page points to the street (building.front.bearing_deg; south when no bearing is
 *  given; away from it when the front is drawn at the top). The map is turned, never mirrored. rot_deg is not read.
 *  The returned list carries `north`: the unit vector toward north in the plan (x across, y down).
 *  Null for a town-level place or no ring. */
export function outlinePoints(ev, W, H, scale = 8) {
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
  const out = pts.map(([x, y]) => [r1(W / 2 + (x - cx) * FT * scale), r1(H / 2 + (y - cy) * FT * scale)]);
  out.north = [ax[1], down[1]];
  return out;
}

/** Eases apart markers whose drawings would overlap (focus rings count). Inside markers stay inside the plan box; outside
 *  markers slide only along their own wall. */
function spread(pts, box) {
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const g = reach(a) + reach(b);
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= g) continue;
      if (d < 0.01) { dx = 1; dy = 0.3; d = Math.hypot(dx, dy); }
      const push = (g - d) / 2 + 0.1, ux = dx / d, uy = dy / d;
      for (const [p, sgn] of [[a, -1], [b, 1]]) {
        if (p.edge === 'top' || p.edge === 'bottom') p.x += sgn * (Math.abs(ux) > 0.2 ? Math.sign(ux) : 1) * push;
        else if (p.edge) p.y += sgn * (Math.abs(uy) > 0.2 ? Math.sign(uy) : 1) * push;
        else { p.x += sgn * ux * push; p.y += sgn * uy * push; }
      }
      moved = true;
    }
    for (const p of pts) if (!p.edge) { p.x = Math.min(box.x1, Math.max(box.x0, p.x)); p.y = Math.min(box.y1, Math.max(box.y0, p.y)); }
    if (!moved) break;
  }
  for (const p of pts) { p.x = r1(p.x); p.y = r1(p.y); }
}
/** A square run drawn with its corners rounded a little: an SVG path through the points. */
function roundPath(pts, rad = 6) {
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === pts.length - 1) { d += `L${r1(x)} ${r1(y)}`; break; }
    const [px, py] = pts[i - 1], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), r = Math.min(rad, l1 / 2, l2 / 2);
    if (r < 0.5 || l1 < 0.01 || l2 < 0.01) { d += `L${r1(x)} ${r1(y)}`; continue; }
    const ax = x - (x - px) / l1 * r, ay = y - (y - py) / l1 * r, bx = x + (nx - x) / l2 * r, by = y + (ny - y) / l2 * r;
    d += `L${r1(ax)} ${r1(ay)}Q${r1(x)} ${r1(y)} ${r1(bx)} ${r1(by)}`;
  }
  return d;
}
/** Where a run's label reads: beside a segment (above or below a level one, left or right of an upright one), clear of every
 *  marker, every name and label already placed, and inside the building. Null when no such place exists (the key names the line). */
function runLabelAt(pts, all, text, boxes, fs, area, P) {
  const tw = String(text).length * fs * MONO, th = fs + 2;
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; segs.push({ x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0) }); }
  segs.sort((a, b) => b.len - a.len);
  for (const s of segs) for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    const x = s.x0 + (s.x1 - s.x0) * t, y = s.y0 + (s.y1 - s.y0) * t, level = Math.abs(s.y1 - s.y0) <= Math.abs(s.x1 - s.x0);
    const spots = level ? [[x - tw / 2, y - 5 - th], [x - tw / 2, y + 5]] : [[x + 6, y - th / 2], [x - 6 - tw, y - th / 2]];
    for (const [bx, by] of spots) {
      const b = { x0: bx, y0: by, x1: bx + tw, y1: by + th };
      if (b.x0 < area.x0 + 2 || b.y0 < area.y0 + 2 || b.x1 > area.x1 - 2 || b.y1 > area.y1 - 2 || (P && !boxInPoly(b, P))) continue;
      if (!clearOfMarks(b, all, 3) || boxes.some(o => hits(b, o, 3))) continue;
      return { b, x: r1(bx + tw / 2), y: r1(by + th - 3) };
    }
  }
  return null;
}
/** A gas line that stops at the wall the gas meter sits outside continues out to it: the short link from the line's end (within
 *  five feet of that wall) to the meter, or null. A line ending at any other wall is never joined across the house. */
function toMeter(pts, kind, all, box, s) {
  if (kind !== 'gas' || pts.length < 2) return null;
  const meter = all.find(p => p.edge && String(p.m.kind) === 'gas_meter'); if (!meter) return null;
  const near = 5 * s;
  const atWall = { left: ([x]) => x <= box.x0 + near, right: ([x]) => x >= box.x1 - near, top: ([, y]) => y <= box.y0 + near, bottom: ([, y]) => y >= box.y1 - near }[meter.edge];
  const d = q => Math.hypot(q[0] - meter.x, q[1] - meter.y);
  const end = [pts[0], pts.at(-1)].filter(atWall).sort((a, b) => d(a) - d(b))[0];
  if (!end) return null;
  // square: along the wall's normal first, then along the wall
  const corner = meter.edge === 'left' || meter.edge === 'right' ? [meter.x, end[1]] : [end[0], meter.y];
  return [end, corner, [meter.x, meter.y]].filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.5);
}
let CLIPS = 0;

/**
 * The SVG for one floor (string, no DOM needed). The viewBox is in CSS pixels at opts.width (default 720), so drawn at that
 * width text is 11 to 12 px and markers 28 px (36 with a focus ring) whatever the building's size.
 * opts: { width: CSS px, focus: string[] (focus kinds), front: 'bottom' | 'top', markers: [{...item, key}] for this floor
 *   (inside and outside), outline: the real outline in feet in the plan frame (outlinePoints(ev, w, h, 1)), north: [x, y],
 *   frontBasis, note: one short line drawn on the plan (a large building's) }.
 */
export function sketchSVG(floor, outside = [], opts = {}) {
  const f = floor && typeof floor === 'object' ? floor : {};
  const Wf = Math.max(1, num(f.w)), Hf = Math.max(1, num(f.h));
  const width = Math.round(Math.min(2400, Math.max(200, num(opts.width) || 720)));
  const fs = width < 480 ? 11 : 12, fsSmall = 11;
  const focus = (opts.focus || []).map(String), front = opts.front === 'top' ? 'top' : 'bottom', rear = front === 'top' ? 'bottom' : 'top';
  const inside = opts.markers ? opts.markers.filter(m => !m.outside) : (Array.isArray(f.items) ? f.items : []).map((it, i) => ({ ...it, key: `i${i}` }));
  const outs = opts.markers ? opts.markers.filter(m => m.outside) : (Array.isArray(outside) ? outside : []).map((it, i) => ({ ...it, key: `o${i}`, outside: true }));
  const name = String(f.name || 'Floor');
  const said = b => ({ record: 'company record', public: 'public record' }[basisKey(b)] || 'likely');
  const say = [...inside, ...outs].map(m => `${m.label || ''}${m.note ? `, ${m.note}` : ''} (${said(m.basis)})`);
  const ring = Array.isArray(opts.outline) && opts.outline.length >= 3 ? opts.outline.filter(p => Array.isArray(p)).map(p => [num(p[0]), num(p[1])]) : null;
  const note = String(opts.note || '').trim();
  const label = `${name} sketch${ring ? `, the building outline from public record${note ? '' : ', layout likely'}` : ''}: ${say.length ? say.join('; ') : 'no equipment recorded on this floor'}`;
  // the plan box in feet: the plan rectangle and the outline together
  const rx = ring ? ring.map(p => p[0]) : [], ry = ring ? ring.map(p => p[1]) : [];
  const fx0 = Math.min(0, ...rx), fy0 = Math.min(0, ...ry), fx1 = Math.max(Wf, ...rx), fy1 = Math.max(Hf, ...ry);
  // margins: outside markers, the overall sizes (rear and left), the north arrow (right) and the street side
  const sides = new Set(outs.map(m => edgeOf(m, front)));
  const band = e => (sides.has(e) ? OUT_BAND : 0);
  const dimSide = e => ring && (e === rear || e === 'left');
  const mL = PAD + band('left') + (dimSide('left') ? DIM_BAND : 0);
  const mR = PAD + Math.max(band('right'), 0);
  const mT = PAD + band('top') + (dimSide('top') ? DIM_BAND : 0) + (front === 'top' ? STREET_BAND : 0);
  const mB = PAD + band('bottom') + (dimSide('bottom') ? DIM_BAND : 0) + (front === 'bottom' ? STREET_BAND : 0);
  const sW = (width - mL - mR) / (fx1 - fx0), sH = (MAX_H - mT - mB) / (fy1 - fy0);
  const s = Math.max(0.2, Math.min(sW, sH, 40));
  const pw = (fx1 - fx0) * s, ph = (fy1 - fy0) * s, H = Math.round(mT + ph + mB);
  const ox = mL + Math.max(0, (width - mL - mR - pw) / 2), oy = mT;
  const X = x => r1(ox + (num(x) - fx0) * s), Y = y => r1(oy + (num(y) - fy0) * s);
  const box = { x0: ox, y0: oy, x1: ox + pw, y1: oy + ph };
  const P = ring ? ring.map(([x, y]) => [X(x), Y(y)]) : null;
  const rb = P ? { x0: Math.min(...P.map(p => p[0])), y0: Math.min(...P.map(p => p[1])), x1: Math.max(...P.map(p => p[0])), y1: Math.max(...P.map(p => p[1])) } : box;
  const boxes = [];   // text boxes already placed: names, labels, sizes; nothing placed later may overlap them
  let s1 = `<svg class="ca-fs${ring ? ' has-outline' : ''}" viewBox="0 0 ${width} ${H}" data-w="${width}" style="--ca-fs-t:${fs}px" role="img" aria-label="${esc(label)}" focusable="false"><title>${esc(label)}</title>`;
  const clip = ring ? `ca-fs-clip-${++CLIPS}` : '';
  if (P) s1 += `<defs><clipPath id="${clip}"><polygon points="${P.map(p => p.join(',')).join(' ')}"/></clipPath></defs>`
    + `<polygon class="ca-fs-floor" points="${P.map(p => p.join(',')).join(' ')}"/>`;   // the floor; the wall (the outline itself) is drawn over the rooms
  else s1 += `<rect class="ca-fs-wall" x="${X(0)}" y="${Y(0)}" width="${r1(Wf * s)}" height="${r1(Hf * s)}" rx="3"/>`;
  // markers: inside ones at their place, outside ones OUT_D past the wall at `at` along their side; then eased apart
  const all = [
    ...inside.map(m => ({ m, x: X(m.x), y: Y(m.y), edge: '', ring: isFocus(m, focus) })),
    ...outs.map(m => {
      const e = edgeOf(m, front), at = Math.min(1, Math.max(0, num(m.at) || 0.5));
      const x = e === 'left' ? rb.x0 - OUT_D : e === 'right' ? rb.x1 + OUT_D : rb.x0 + at * (rb.x1 - rb.x0);
      const y = e === 'top' ? rb.y0 - OUT_D : e === 'bottom' ? rb.y1 + OUT_D : rb.y0 + at * (rb.y1 - rb.y0);
      return { m, x, y, edge: e, ring: isFocus(m, focus) };
    })];
  spread(all, box);
  // rooms: dashed (likely), inside the outline
  let rooms = '', names = '';
  const roomList = (Array.isArray(f.rooms) ? f.rooms : []).filter(r => r && typeof r === 'object');
  for (const r of roomList) {
    const x = X(r.x), y = Y(r.y), w = r1(num(r.w) * s), h = r1(num(r.h) * s);
    if (!(num(r.x) <= 0 && num(r.y) <= 0 && num(r.w) >= Wf && num(r.h) >= Hf)) rooms += `<rect class="ca-fs-room" x="${x}" y="${y}" width="${w}" height="${h}"/>`;   // a room that is the whole floor is only named
  }
  if (rooms) s1 += P ? `<g clip-path="url(#${clip})">${rooms}</g>` : rooms;
  if (P) s1 += `<polygon class="ca-fs-outline" data-outline points="${P.map(p => p.join(',')).join(' ')}"/>`;   // the wall is the real outline (public record), solid; the address box uses it too
  // the runs' segments: names keep off them when they can
  const segs = [];
  for (const r of Array.isArray(f.runs) ? f.runs : []) {
    const q = (Array.isArray(r?.points) ? r.points : []).filter(p => Array.isArray(p)).map(p => [X(p[0]), Y(p[1])]);
    for (let i = 1; i < q.length; i++) segs.push({ x0: Math.min(q[i - 1][0], q[i][0]) - 3, y0: Math.min(q[i - 1][1], q[i][1]) - 3, x1: Math.max(q[i - 1][0], q[i][0]) + 3, y1: Math.max(q[i - 1][1], q[i][1]) + 3 });
  }
  // room names: the full name, else the short one, else none; centred when clear, else a corner; never on a marker or another name
  const th = fs + 2;
  for (const r of [...roomList].sort((a, b) => num(a.w) * num(a.h) - num(b.w) * num(b.h))) {
    if (!r.label) continue;
    const x = X(r.x), y = Y(r.y), w = num(r.w) * s, h = num(r.h) * s;
    const rbox = { x0: Math.max(x, box.x0), y0: Math.max(y, box.y0), x1: Math.min(x + w, box.x1), y1: Math.min(y + h, box.y1) };
    let placed = null;
    for (const strict of [true, false]) for (const text of [...new Set([String(r.label), shortName(r)])]) {
      if (placed) break;
      const tw = text.length * fs * MONO;
      if (tw + 8 > rbox.x1 - rbox.x0 || th + 6 > rbox.y1 - rbox.y0) continue;
      const cx = (rbox.x0 + rbox.x1) / 2 - tw / 2, cy = (rbox.y0 + rbox.y1) / 2 - th / 2;
      const spots = [[cx, cy], [rbox.x0 + 5, rbox.y0 + 4], [rbox.x1 - 5 - tw, rbox.y0 + 4], [rbox.x0 + 5, rbox.y1 - 4 - th], [rbox.x1 - 5 - tw, rbox.y1 - 4 - th],
        [cx, rbox.y0 + 4], [cx, rbox.y1 - 4 - th], [rbox.x0 + 5, cy], [rbox.x1 - 5 - tw, cy]];
      for (const [bx, by] of spots) {
        const b = { x0: bx, y0: by, x1: bx + tw, y1: by + th };
        if (!clearOfMarks(b, all) || boxes.some(o => hits(b, o, 2)) || (P && !boxInPoly(b, P)) || (strict && segs.some(o => hits(b, o, 1)))) continue;
        placed = { text, b }; break;
      }
    }
    if (!placed) continue;
    boxes.push(placed.b);
    names += `<text class="ca-fs-room-t" x="${r1((placed.b.x0 + placed.b.x1) / 2)}" y="${r1(placed.b.y1 - 3)}">${esc(placed.text)}</text>`;
  }
  // the note a large building carries, inside the outline when it fits
  if (note) {
    // one line, else two; the place nearest the middle where the whole line sits inside the outline and clear of markers
    const cut = note.lastIndexOf(' ', Math.ceil(note.length / 2) + 4);
    const ways = [[note], ...(cut > 0 ? [[note.slice(0, cut), note.slice(cut + 1)]] : [])];
    const mx = (rb.x0 + rb.x1) / 2, my = (rb.y0 + rb.y1) / 2;
    let best = null;
    for (const lines of ways) {
      const tw = Math.max(...lines.map(l => l.length)) * fs * MONO + 8, th2 = lines.length * (fs + 4) + 4;
      for (let gy = 0; gy <= 12; gy++) for (let gx = 0; gx <= 12; gx++) {
        const cx = rb.x0 + (rb.x1 - rb.x0) * gx / 12, cy = rb.y0 + (rb.y1 - rb.y0) * gy / 12;
        const b = { x0: cx - tw / 2, y0: cy - th2 / 2, x1: cx + tw / 2, y1: cy + th2 / 2 };
        if (b.x0 < 2 || b.x1 > width - 2 || (P ? !boxInPoly(b, P) : !hits(b, box)) || !clearOfMarks(b, all) || boxes.some(o => hits(b, o, 2))) continue;
        const d = Math.hypot(cx - mx, cy - my) + (lines.length - 1) * 30;
        if (!best || d < best.d) best = { d, lines, cx, b };
      }
    }
    if (!best) { const lines = ways.at(-1), th2 = lines.length * (fs + 4) + 4; best = { lines, cx: mx, b: { x0: mx - 1, y0: my - th2 / 2, x1: mx + 1, y1: my + th2 / 2 } }; }
    boxes.push(best.b);
    names += best.lines.map((l, i) => `<text class="ca-fs-note" x="${r1(best.cx)}" y="${r1(best.b.y0 + 2 + (i + 1) * (fs + 4) - 4)}">${esc(l)}</text>`).join('');
  }
  // overall sizes from the outline (public record, solid): width along the rear, depth along the left
  let dims = '';
  if (P) {
    const wFt = Math.round((Math.max(...rx) - Math.min(...rx))), dFt = Math.round((Math.max(...ry) - Math.min(...ry)));
    const yW = rear === 'top' ? rb.y0 - band('top') - DIM_OFF : rb.y1 + band('bottom') + DIM_OFF, xD = rb.x0 - band('left') - DIM_OFF;
    const tW = `${wFt} ft`, tD = `${dFt} ft`, twW = tW.length * fsSmall * MONO, twD = tD.length * fsSmall * MONO;
    const mx = (rb.x0 + rb.x1) / 2, my = (rb.y0 + rb.y1) / 2, gw = twW / 2 + 5, gd = twD / 2 + 5;
    dims += `<g class="ca-fs-dim" data-dim="width"><path d="M${rb.x0} ${yW}H${r1(Math.max(rb.x0, mx - gw))}M${r1(Math.min(rb.x1, mx + gw))} ${yW}H${rb.x1}M${rb.x0} ${yW - 5}V${yW + 5}M${rb.x1} ${yW - 5}V${yW + 5}"/>`
      + `<text class="ca-fs-dim-t" x="${r1((rb.x0 + rb.x1) / 2)}" y="${r1(yW + 4)}">${tW}</text></g>`;
    dims += `<g class="ca-fs-dim" data-dim="depth"><path d="M${xD} ${rb.y0}V${r1(Math.max(rb.y0, my - gd))}M${xD} ${r1(Math.min(rb.y1, my + gd))}V${rb.y1}M${xD - 5} ${rb.y0}H${xD + 5}M${xD - 5} ${rb.y1}H${xD + 5}"/>`
      + `<text class="ca-fs-dim-t" x="${r1(xD)}" y="${r1((rb.y0 + rb.y1) / 2 + 4)}" transform="rotate(-90 ${r1(xD)} ${r1((rb.y0 + rb.y1) / 2)})">${tD}</text></g>`;
    boxes.push({ x0: (rb.x0 + rb.x1 - twW) / 2 - 3, y0: yW - fsSmall / 2 - 2, x1: (rb.x0 + rb.x1 + twW) / 2 + 3, y1: yW + fsSmall / 2 + 2 });
    boxes.push({ x0: xD - fsSmall / 2 - 2, y0: (rb.y0 + rb.y1 - twD) / 2 - 3, x1: xD + fsSmall / 2 + 2, y1: (rb.y0 + rb.y1 + twD) / 2 + 3 });
  }
  // street side: a small arrow from the wall (below any outside markers there) and the label
  const street = opts.frontBasis === 'assumed' ? 'Street side, assumed' : 'Street side';
  const busy = sides.has(front), cxS = r1((rb.x0 + rb.x1) / 2), stw = street.length * fs * MONO;
  let st;
  if (front === 'bottom') {
    const base = rb.y1 + (busy ? OUT_BAND : 0) + 4, ly = r1(base + STREET_BAND - 14), tip = r1(ly - fs * 0.73 - 5);
    // the arrow starts below any marker it would cross
    const a0 = Math.min(tip - 8, all.filter(p => Math.abs(p.x - cxS) < reach(p) + 3).reduce((y, p) => Math.max(y, p.y + reach(p) + 3), base));
    st = `<path class="ca-fs-arrow" d="M${cxS} ${r1(a0)}V${tip}M${cxS - 4} ${tip - 5}L${cxS} ${tip}L${cxS + 4} ${tip - 5}"/><text class="ca-fs-street" x="${cxS}" y="${ly}">${street}</text>`;
    boxes.push({ x0: cxS - stw / 2, y0: ly - fs, x1: cxS + stw / 2, y1: ly + 3 });
  } else {
    const ly = r1(rb.y0 - (busy ? OUT_BAND : 0) - 24);
    st = `<path class="ca-fs-arrow" d="M${cxS} ${r1(ly + 6)}V${r1(rb.y0 - (busy ? OUT_BAND : 0) - 4)}"/><text class="ca-fs-street" x="${cxS}" y="${ly}">${street}</text>`;
    boxes.push({ x0: cxS - stw / 2, y0: ly - fs, x1: cxS + stw / 2, y1: ly + 3 });
  }
  // north arrow (the outline's own bearing): in the street band, beside the label, clear of it and of the markers
  let north = '';
  const nv = Array.isArray(opts.north) ? opts.north : ring && Array.isArray(opts.outline?.north) ? opts.outline.north : null;
  if (P && nv && isFinite(num(nv[0])) && (num(nv[0]) || num(nv[1]))) {
    const L = Math.hypot(num(nv[0]), num(nv[1])), nx = num(nv[0]) / L, ny = num(nv[1]) / L;
    const sb = boxes.at(-1), cy = front === 'bottom' ? r1(sb.y1 - 8) : r1(sb.y0 + 6);
    const at = [rb.x1 - 24, rb.x0 + 24, sb.x1 + 34, sb.x0 - 34, width - 26].map(x => ({ x0: x - 22, y0: cy - 22, x1: x + 22, y1: cy + 22, cx: x }))
      .find(b => b.x0 >= 2 && b.x1 <= width - 2 && !hits(b, sb, 4) && clearOfMarks(b, all, 2) && !boxes.some(o => hits(b, o, 2)));
    if (at) {
      const cx = r1(at.cx), t = (k) => [r1(cx + nx * k), r1(cy + ny * k)], [hx, hy] = t(9), [bx, by] = t(-9), [lx, ly] = t(17);
      const side = [r1(-ny * 4), r1(nx * 4)];
      north = `<g class="ca-fs-north" data-north="${r1(nx * 100) / 100},${r1(ny * 100) / 100}"><path d="M${bx} ${by}L${hx} ${hy}M${r1(hx - nx * 6 + side[0])} ${r1(hy - ny * 6 + side[1])}L${hx} ${hy}L${r1(hx - nx * 6 - side[0])} ${r1(hy - ny * 6 - side[1])}"/>`
        + `<text class="ca-fs-north-t" x="${lx}" y="${ly}">N</text></g>`;
      boxes.push(at);
    }
  }
  // runs under the markers: solid from records, dashed when likely; square, corners rounded a little; risers as small rings
  let runs = '', runText = '';
  for (const r of Array.isArray(f.runs) ? f.runs : []) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.points)) continue;
    const k = KINDS.has(r.kind) ? r.kind : 'water', cls = isSolid(r.basis) ? 'is-record' : 'is-likely';
    const pts = r.points.filter(p => Array.isArray(p)).map(p => [X(p[0]), Y(p[1])]); if (pts.length < 2) continue;
    runs += `<path class="ca-fs-run ${cls} k-${k}" d="${roundPath(pts)}" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
    const link = toMeter(pts, k, all, box, s);
    if (link) { const meter = all.find(p => p.edge && String(p.m.kind) === 'gas_meter'); runs += `<path class="ca-fs-run ca-fs-link ${isSolid(r.basis) && isSolid(meter?.m.basis) ? 'is-record' : 'is-likely'} k-${k}" d="${roundPath(link)}" points="${link.map(p => p.join(',')).join(' ')}"/>`; }
    for (const q of Array.isArray(r.risers) ? r.risers : []) {
      if (!Array.isArray(q)) continue;
      const dir = q[2] === 'up' ? 'up' : 'down';
      runs += `<circle class="ca-fs-riser k-${k}" data-dir="${dir}" cx="${X(q[0])}" cy="${Y(q[1])}" r="4.5"><title>${RUN_NAMES[k]} ${dir === 'up' ? 'goes to the floor above' : 'goes to the floor below'}</title></circle>`;
    }
    const txt = r.label || RUN_NAMES[k], at = runLabelAt(pts, all, txt, boxes, fsSmall, box, P);
    if (at) { boxes.push(at.b); runText += `<text class="ca-fs-run-t" x="${at.x}" y="${at.y}">${esc(txt)}</text>`; }
  }
  s1 += runs + dims + st + north + names + runText;
  // markers last, non-focus first so focus rings sit on top
  all.sort((a, b) => Number(isFocus(a.m, focus)) - Number(isFocus(b.m, focus)));
  for (const { m, x, y } of all) s1 += markerSVG(m, x, y, focus);
  return s1 + '</svg>';
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
const riserSw = '<svg class="ca-sw" viewBox="0 0 22 22" width="18" height="18" aria-hidden="true" focusable="false"><circle class="ca-fs-riser" cx="11" cy="11" r="5"/></svg>';
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
  for (const k of (kinds.length || outline ? kinds : ['water', 'gas', 'drain'])) out.push(`<span>${lineSw(k, !solidRun && likelyRun)}${RUN_NAMES[k]}</span>`);
  if (solidRun && likelyRun) out.push(`<span>${lineSw('water', true)}Likely line</span>`);
  if (runs.some(r => Array.isArray(r.risers) && r.risers.length)) out.push(`<span data-key="riser">${riserSw}Riser to another floor</span>`);
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

/** Redraws the plans at the card's own width (text and markers keep their size): at once when the card is first laid out, then
 *  debounced as it resizes. A width already drawn twice in a row (a scrollbar coming and going) stops the redraws. */
function fitWidth(a, floors, svgOf) {
  if (typeof ResizeObserver !== 'function' || !floors.length) return;
  let drawn = 720, last = [], timer = 0;
  const widthNow = () => {
    const d = [...a.querySelectorAll('.ca-fs-svg')].find(x => !x.hidden) || a.querySelector('.ca-fs-svg');
    if (!d || !d.clientWidth) return 0;
    const cs = getComputedStyle(d);
    return Math.floor(d.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  };
  const draw = () => {
    const w = widthNow(); if (!w || Math.abs(w - drawn) < 1) return;
    if (last.length >= 2 && last.at(-2) === w && Date.now() - last.t < 600) return;
    last.push(w); if (last.length > 3) last.shift(); last.t = Date.now();
    drawn = w;
    a.querySelectorAll('.ca-fs-svg').forEach(d => { const i = Number(d.dataset.floor); if (floors[i]) d.innerHTML = svgOf(floors[i], i, w); });
  };
  let first = true;
  const ro = new ResizeObserver(() => {
    if (!a.isConnected) return;
    if (first) { first = false; draw(); return; }
    clearTimeout(timer); timer = setTimeout(draw, 120);
  });
  ro.observe(a);
  a._fit = draw;
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
  const outlines = floors.map(f => outlinePoints(ev, Math.max(1, num(f.w)), Math.max(1, num(f.h)), 1));   // feet, in the plan frame
  const large = ev.building?.kind === 'large' || ev.layout?.from === 'none';
  const note = large ? String(ev.layout?.note || 'Interior layout is not on public record.') : '';
  const svgOf = (f, i, width) => sketchSVG(f, [], { width, focus, front: ev.front, markers: markers.filter(m => m.fi === i), outline: outlines[i], frontBasis, note });
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
    + floors.map((f, i) => `<div class="ca-fs-svg" data-floor="${i}"${i === cur ? '' : ' hidden'}>${svgOf(f, i, 720)}</div>`).join('')
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
  fitWidth(a, floors, svgOf);
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
