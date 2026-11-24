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
  const n = {}; for (const m of out) n[m.kind] = (n[m.kind] || 0) + 1;
  for (const m of out) m.dup = n[m.kind] > 1;
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
const RUN_OFF = 6;   // a drain beside a water line on the same route sits this far off it (px): both strokes and a gap
const WET = new Set(['kitchen', 'bath', 'laundry']);
const OUT_BAND = OUT_D + RING + 6;   // the band outside markers take beside the plan
const DIM_BAND = 36, DIM_OFF = 26, STREET_BAND = 46, PAD = 10;   // the sizes sit DIM_OFF out from the wall, clear of a focus ring on it
/** A room name's short form when the card gives none (seven characters at most). */
const SHORT_NAME = { 'living room': 'Living', 'family room': 'Family', 'dining room': 'Dining', 'half bath': '\u00bd Bath', 'full bath': 'Bath', 'bathroom': 'Bath',
  'laundry room': 'Laundry', 'utility room': 'Utility', 'mechanical room': 'Mech', 'recreation room': 'Rec', 'crawl space': 'Crawl', 'unfinished basement': 'Basemt',
  'primary bedroom': 'Primary', 'bonus room': 'Bonus', 'storage': 'Storage', 'closet': 'Closet', 'garage or utility closet': 'Utility', 'partial basement': 'Basemt' };
export function shortName(r) {
  const own = String(r?.short ?? '').trim(); if (own) return own.slice(0, 7);
  const l = String(r?.label ?? '').trim(), k = l.toLowerCase();
  if (SHORT_NAME[k]) return SHORT_NAME[k];
  const bed = /^bedroom\s*(\d+)$/i.exec(l); if (bed) return `Bed ${bed[1]}`;
  return l.split(/\s+/)[0].slice(0, 7);
}
/** Short names a reader knows at a glance; any other short form is not drawn (the room goes unnamed instead). */
const GOOD_SHORT = /^(Living|Family|Dining|Kitchen|Bed( \d)?|Bath( \d)?|\u00bd Bath|Bonus|Rec|Laundry|Utility|Storage|Closet|Garage|Stairs|Hall|Office|Den|Pantry|Mudroom|Linen|Primary|Basemt|Crawl|Mech)$/;
const NUMBERED = /\s+\d+$/;
/** Each room's drawn name: {full, short, group}. A number stays only on a bedroom or bath that has a partner of its kind on the
 *  floor ("Bed 2" beside "Bed 1"); a hall, closet or storage room is never numbered. `group` keeps one form per kind. */
function nameForms(rooms) {
  const groupOf = r => String(r.label).trim().replace(NUMBERED, '').toLowerCase();
  const n = {}; for (const r of rooms) if (r.label) n[groupOf(r)] = (n[groupOf(r)] || 0) + 1;
  const out = new Map();
  for (const r of rooms) {
    if (!r.label) continue;
    const label = String(r.label).trim(), g = groupOf(r);
    const keep = /^(bedroom|bath)$/.test(g) && n[g] > 1;
    const full = keep ? label : label.replace(NUMBERED, '');
    let short = shortName(r); if (!keep) short = short.replace(NUMBERED, '');
    out.set(r, { full, short: short && short !== full && GOOD_SHORT.test(short) ? short : '', group: g });
  }
  return out;
}
const r1 = v => Math.round(v * 10) / 10;
const hits = (a, b, pad = 0) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
/** Distance from a point to a box {x0, y0, x1, y1} (0 inside it). */
const boxDist = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
/** How far a marker's drawing reaches from its centre: a focus ring or the plain circle, with its stroke (a little over). */
const reach = p => (p.rr ?? (p.ring ? RING + 2 : MR + 2));
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
function markerSVG(m, x, y, focus, mr = MR, rg = RING) {
  const solid = isSolid(m.basis), f = isFocus(m, focus);
  return `<g class="ca-fs-m ${markClass(m.basis)}${f ? ' is-focus' : ''}" data-k="${esc(m.key)}">`
    + (f ? `<circle class="ca-fs-ring" cx="${x}" cy="${y}" r="${rg}"/>` : `<circle class="ca-fs-halo" cx="${x}" cy="${y}" r="${rg}"/>`)
    + `<circle cx="${x}" cy="${y}" r="${mr}"${solid ? '' : ' stroke-dasharray="4 3"'}/><text x="${x}" y="${y}">${esc(String(m.short || '?').slice(0, 2))}</text></g>`;
}
/** The nearest point to (x, y) on segment a-b, and the distance to it. */
function nearOnSeg(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
  const cx = ax + t * dx, cy = ay + t * dy;
  return { cx, cy, d: Math.hypot(x - cx, y - cy) };
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

/** Eases apart markers whose drawings would overlap (focus rings count): every pair ends at least the sum of their reaches plus
 *  one px apart. Inside markers stay in their room (while that can hold them) and inside the outline, the ring crossing the wall
 *  by under 2 px; outside markers slide only along their own wall, within its length while that can hold them. A public or
 *  company-record marker moves last (it gives way a little only when nothing else can). Deterministic.
 *  P: the outline in px (or the wall rectangle); edge markers carry lo/hi, the wall's ends along it. */
function spread(pts, P) {
  const edges = P.map((a, i) => {
    const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    if (!inPoly((a[0] + b[0]) / 2 + n[0] * 0.5, (a[1] + b[1]) / 2 + n[1] * 0.5, P)) n = [-n[0], -n[1]];
    return { a, b, n };
  });
  const keepIn = (p, useRoom) => {
    if (useRoom && p.room) { p.x = Math.min(p.room.x1 - 1, Math.max(p.room.x0 + 1, p.x)); p.y = Math.min(p.room.y1 - 1, Math.max(p.room.y0 + 1, p.y)); }
    const need = reach(p) - 2;   // the ring may cross the wall by under 2 px
    for (let k = 0; k < 6; k++) {
      let best = null;
      for (const e of edges) { const q = nearOnSeg(p.x, p.y, e.a, e.b); if (!best || q.d < best.q.d) best = { q, e }; }
      if (!best) return;
      if (!inPoly(p.x, p.y, P)) { p.x = best.q.cx + best.e.n[0] * need; p.y = best.q.cy + best.e.n[1] * need; continue; }
      let moved = false;
      for (const e of edges) {
        const q = nearOnSeg(p.x, p.y, e.a, e.b); if (q.d >= need - 0.01) continue;
        const ux = q.d > 0.01 ? (p.x - q.cx) / q.d : e.n[0], uy = q.d > 0.01 ? (p.y - q.cy) / q.d : e.n[1];
        p.x += ux * (need - q.d); p.y += uy * (need - q.d); moved = true;
      }
      if (!moved) return;
    }
  };
  const along = p => (p.edge === 'top' || p.edge === 'bottom' ? 'x' : 'y');
  const fit = (p, useRoom, slack) => {
    if (p.edge) { const k = along(p); p[k] = Math.min(p.hi + slack, Math.max(p.lo - slack, p[k])); }
    else keepIn(p, useRoom);
  };
  const weight = p => (isSolid(p.m.basis) ? 0.12 : 1);
  for (let pass = 0; pass < 160; pass++) {
    const useRoom = pass < 60, slack = pass < 60 ? 0 : pass < 110 ? 12 : 40;
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const g = reach(a) + reach(b) + 1.2;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= g) continue;
      if (d < 0.01) { dx = 1; dy = 0.3; d = Math.hypot(dx, dy); }
      const o = g - d + 0.2, ux = dx / d, uy = dy / d;
      // how much each can move along the push: an outside marker only along its wall
      const mob = (p) => weight(p) * (p.edge ? Math.max(Math.abs(along(p) === 'x' ? ux : uy), 0.25) : 1);
      const ma = mob(a), mb = mob(b), tot = ma + mb;
      for (const [p, sgn, share] of [[a, -1, ma / tot], [b, 1, mb / tot]]) {
        const push = o * share;
        if (p.edge) {
          const k = along(p), c = k === 'x' ? ux : uy;
          const dir = Math.abs(c) > 0.2 ? Math.sign(c) : 1;
          p[k] += sgn * dir * push / Math.max(Math.abs(c), 0.25);
        } else { p.x += sgn * ux * push; p.y += sgn * uy * push; }
      }
      moved = true;
    }
    for (const p of pts) { const x = p.x, y = p.y; fit(p, useRoom, slack); if (Math.abs(p.x - x) + Math.abs(p.y - y) > 0.01) moved = true; }
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
/** The parts of a square run not already drawn by a line of its kind (`trunk`: drawn segments): two branches that share a route
 *  draw it once, so their dashes never overlap into what looks like a solid (recorded) line. Returns polylines. */
function untraced(pts, trunk) {
  const out = []; let cur = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vert = Math.abs(a[0] - b[0]) < 0.5, c = vert ? 1 : 0, o = vert ? 0 : 1;
    const lo = Math.min(a[c], b[c]), hi = Math.max(a[c], b[c]), dir = b[c] >= a[c] ? 1 : -1;
    let free = [[lo, hi]];
    for (const [p, q] of trunk) {
      if (Math.abs(p[o] - q[o]) > 0.5 || Math.abs(p[o] - a[o]) > 1) continue;
      const c0 = Math.min(p[c], q[c]), c1 = Math.max(p[c], q[c]);
      free = free.flatMap(([f0, f1]) => (c1 <= f0 || c0 >= f1 ? [[f0, f1]] : [[f0, Math.max(f0, c0)], [Math.min(f1, c1), f1]].filter(([x, y]) => y - x > 0.5)));
    }
    free.sort((u, v) => dir * (u[0] - v[0]));
    const at = t => (vert ? [a[0], t] : [t, a[1]]);
    for (const [f0, f1] of free) {
      const st = at(dir > 0 ? f0 : f1), en = at(dir > 0 ? f1 : f0);
      if (cur && Math.hypot(cur.at(-1)[0] - st[0], cur.at(-1)[1] - st[1]) < 0.5) cur.push(en);
      else { if (cur) out.push(cur); cur = [st, en]; }
    }
  }
  if (cur) out.push(cur);
  return out;
}
/** Where a run's label reads: beside a segment (above or below a level one, left or right of an upright one), clear of every
 *  marker, every name and label already placed, and inside the building. Null when no such place exists (the key names the line). */
function runLabelAt(pts, all, text, boxes, fs, area, P, lines = [], avoid = () => false) {
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
      if (!clearOfMarks(b, all, 3) || boxes.some(o => hits(b, o, 3)) || lines.some(o => hits(b, o, 0)) || avoid(b)) continue;   // never across a line
      return { b, x: r1(bx + tw / 2), y: r1(by + th - 3) };
    }
  }
  return null;
}
/** A gas line (or the electric service line) that stops at the wall its meter sits outside continues out to it: the short link
 *  from the line's end (within five feet of that wall) to the meter, or null. A line ending at any other wall is never joined
 *  across the house. */
const METER_OF = { gas: 'gas_meter', power: 'electric_meter' };
function toMeter(pts, kind, all, box, s) {
  if (!METER_OF[kind] || pts.length < 2) return null;
  const meter = all.find(p => p.edge && String(p.m.kind) === METER_OF[kind]); if (!meter) return null;
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
  // a narrow drawing (a phone) keeps its gutters slim: smaller markers under 420 px, outside markers close to the wall, less
  // padding, and the depth figure on a side with no outside marker (or folded into the width figure) so the plan fills the frame
  const narrow = width < 480, mr = width < 420 ? 13 : MR, rg = width < 420 ? 17 : RING;   // 26 px markers at the least (R1)
  const pad = narrow ? 4 : PAD, dimOff = narrow ? rg + 5 : DIM_OFF, dimBand = narrow ? dimOff + 9 : DIM_BAND;
  const rrOf = m => (isFocus(m, focus) ? rg + 2 : mr + 2);
  const outD = m => (narrow ? rrOf(m) + 3 : OUT_D);   // the ring about 4 px off the wall on a phone
  // margins: outside markers, the overall sizes (rear and a side), the north arrow (right) and the street side
  const sides = new Set(outs.map(m => edgeOf(m, front)));
  const band = e => (!sides.has(e) ? 0 : narrow ? Math.max(...outs.filter(m => edgeOf(m, front) === e).map(m => outD(m) + rrOf(m))) + 2 : OUT_BAND);
  const layout = depthAt => {
    const dimSide = e => ring && (e === rear || e === depthAt);
    const mL = pad + band('left') + (dimSide('left') ? dimBand : 0);
    const mR = pad + band('right') + (dimSide('right') ? dimBand : 0);
    const mT = pad + band('top') + (dimSide('top') ? dimBand : 0) + (front === 'top' ? STREET_BAND : 0);
    const mB = pad + band('bottom') + (dimSide('bottom') ? dimBand : 0) + (front === 'bottom' ? STREET_BAND : 0);
    const sW = (width - mL - mR) / (fx1 - fx0), sH = (MAX_H - mT - mB) / (fy1 - fy0);
    return { depthAt, mL, mR, mT, mB, s: Math.max(0.2, Math.min(sW, sH, 40)) };
  };
  let lay = layout('left');
  if (narrow && ring) {
    // the first that keeps the plan at least 72% of the drawing's width, or as large as the height allows
    const fold = layout('fold'), share = L => (fx1 - fx0) * L.s / width;
    lay = [...(sides.has('left') ? [] : [layout('left')]), ...(sides.has('right') ? [] : [layout('right')])]
      .find(L => share(L) >= 0.72 || L.s >= fold.s - 1e-6) || fold;
  }
  const { mL, mR, mT, mB, s, depthAt } = lay;
  const pw = (fx1 - fx0) * s, ph = (fy1 - fy0) * s, H = Math.round(mT + ph + mB);
  const ox = mL + Math.max(0, (width - mL - mR - pw) / 2), oy = mT;
  const X = x => r1(ox + (num(x) - fx0) * s), Y = y => r1(oy + (num(y) - fy0) * s);
  const box = { x0: ox, y0: oy, x1: ox + pw, y1: oy + ph };
  const P = ring ? ring.map(([x, y]) => [X(x), Y(y)]) : null;
  const rb = P ? { x0: Math.min(...P.map(p => p[0])), y0: Math.min(...P.map(p => p[1])), x1: Math.max(...P.map(p => p[0])), y1: Math.max(...P.map(p => p[1])) } : box;
  const boxes = [];   // text boxes already placed: names, labels, sizes; nothing placed later may overlap them
  let noteGrow = 0;   // extra height when a large building's note has to sit under the drawing
  let s1 = `<svg class="ca-fs${ring ? ' has-outline' : ''}" viewBox="0 0 ${width} ${H}" data-w="${width}" style="--ca-fs-t:${fs}px" role="img" aria-label="${esc(label)}" focusable="false"><title>${esc(label)}</title>`;
  const clip = ring ? `ca-fs-clip-${++CLIPS}` : '';
  if (P) s1 += `<defs><clipPath id="${clip}"><polygon points="${P.map(p => p.join(',')).join(' ')}"/></clipPath></defs>`
    + `<polygon class="ca-fs-floor" points="${P.map(p => p.join(',')).join(' ')}"/>`;   // the floor; the wall (the outline itself) is drawn over the rooms
  else if (!note) s1 += `<rect class="ca-fs-wall" x="${X(0)}" y="${Y(0)}" width="${r1(Wf * s)}" height="${r1(Hf * s)}" rx="3"/>`;   // a large building with no outline: no wall is drawn
  // markers: inside ones at their place (in their room), outside ones past the wall at `at` along their side; then eased apart.
  // One moved more than 8 px from its true spot gets a thin leader line back to it.
  const roomList = (Array.isArray(f.rooms) ? f.rooms : []).filter(r => r && typeof r === 'object');
  const inRoom = (m, r) => num(m.x) >= num(r.x) && num(m.x) <= num(r.x) + num(r.w) && num(m.y) >= num(r.y) && num(m.y) <= num(r.y) + num(r.h);
  const whole = r => num(r.x) <= 0 && num(r.y) <= 0 && num(r.w) >= Wf && num(r.h) >= Hf;
  const roomOf = m => (typeof m.room === 'string' && roomList.find(r => r.label === m.room && inRoom(m, r)))
    || roomList.filter(r => inRoom(m, r)).sort((a, b) => num(a.w) * num(a.h) - num(b.w) * num(b.h))[0] || null;
  const all = [
    ...inside.map(m => {
      const r = roomOf(m), x = X(m.x), y = Y(m.y);
      return { m, x, y, tx: x, ty: y, edge: '', ring: isFocus(m, focus), rr: rrOf(m), r,
        room: r && !whole(r) ? { x0: X(r.x), y0: Y(r.y), x1: X(num(r.x) + num(r.w)), y1: Y(num(r.y) + num(r.h)) } : null };
    }),
    ...outs.map(m => {
      const e = edgeOf(m, front), at = Math.min(1, Math.max(0, num(m.at) || 0.5)), d = outD(m);
      const x = e === 'left' ? rb.x0 - d : e === 'right' ? rb.x1 + d : rb.x0 + at * (rb.x1 - rb.x0);
      const y = e === 'top' ? rb.y0 - d : e === 'bottom' ? rb.y1 + d : rb.y0 + at * (rb.y1 - rb.y0);
      const lev = e === 'top' || e === 'bottom';
      return { m, x, y, tx: x, ty: y, edge: e, ring: isFocus(m, focus), rr: rrOf(m), lo: lev ? rb.x0 : rb.y0, hi: lev ? rb.x1 : rb.y1 };
    })];
  spread(all, P || [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]);
  const leaders = all.filter(p => Math.hypot(p.x - p.tx, p.y - p.ty) > 8).map(p => {
    const d = Math.hypot(p.tx - p.x, p.ty - p.y);
    return [[r1(p.tx), r1(p.ty)], [r1(p.x + (p.tx - p.x) / d * (mr + 1)), r1(p.y + (p.ty - p.y) / d * (mr + 1))]];
  });
  const onLeader = (b, pad = 1) => leaders.some(([p, q]) => segHitsBox(p, q, { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }));
  // rooms: dashed (likely), inside the outline
  let rooms = '', names = '';
  for (const r of roomList) {
    const x = X(r.x), y = Y(r.y), w = r1(num(r.w) * s), h = r1(num(r.h) * s);
    if (!(num(r.x) <= 0 && num(r.y) <= 0 && num(r.w) >= Wf && num(r.h) >= Hf)) rooms += `<rect class="ca-fs-room" x="${x}" y="${y}" width="${w}" height="${h}"/>`;   // a room that is the whole floor is only named
  }
  if (rooms) s1 += P ? `<g clip-path="url(#${clip})">${rooms}</g>` : rooms;
  if (P) s1 += `<polygon class="ca-fs-outline" data-outline points="${P.map(p => p.join(',')).join(' ')}"/>`;   // the wall is the real outline (public record), solid; the address box uses it too
  // the runs as drawn (a drain beside a water line sits RUN_OFF px off it): names and run labels keep off them
  const runList = (Array.isArray(f.runs) ? f.runs : []).filter(r => r && typeof r === 'object' && Array.isArray(r.points));
  const hasWater = runList.some(r => r.kind === 'water');
  // a run whose points are all one spot (a line passing straight through to another floor) draws no line, only its riser ring
  const still = r => { const q = r.points.filter(p => Array.isArray(p)); return q.every(p => Math.abs(num(p[0]) - num(q[0][0])) < 0.05 && Math.abs(num(p[1]) - num(q[0][1])) < 0.05); };
  // a drain is drawn where it reads best: on its route, or RUN_OFF px off it on a diagonal, whichever keeps it farthest (up to
  // 9 px) from the water lines and the wall along its middle; its ends stay under their marker or riser
  const pxOf = r => r.points.filter(p => Array.isArray(p)).map(p => [X(p[0]), Y(p[1])]);
  const waterPx = runList.filter(r => r.kind === 'water' && !still(r)).map(pxOf);
  const wallPx = P ? P.map((p, i) => [p, P[(i + 1) % P.length]]) : [];
  const sample = q => { const o = []; for (let i = 1; i < q.length; i++) { const [ax, ay] = q[i - 1], [bx, by] = q[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3)); for (let k = 0; k <= n; k++) o.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); } return o; };
  const minD = (pts, lines) => { let m = 99; for (const [x, y] of pts) for (const l of lines) for (let i = 1; i < l.length; i++) m = Math.min(m, nearOnSeg(x, y, l[i - 1], l[i]).d); return m; };
  // one offset for every drain on the floor, so drains that merge on one route draw as one line
  const drainOff = qs => {
    if (!qs.length || (!waterPx.length && !P)) return [0, 0];
    const use = qs.flatMap(q => { const ends = [q[0], q.at(-1)], all3 = sample(q), mid = all3.filter(p => ends.every(e => Math.hypot(p[0] - e[0], p[1] - e[1]) > 14)); return mid.length >= 3 ? mid : all3; });
    let best = null;
    for (const [dx, dy] of [[0, 0], [RUN_OFF, RUN_OFF], [-RUN_OFF, -RUN_OFF], [RUN_OFF, -RUN_OFF], [-RUN_OFF, RUN_OFF]]) {
      const m = use.map(([x, y]) => [x + dx, y + dy]);
      if (P && m.some(([x, y]) => !inPoly(x, y, P))) continue;
      const sc = Math.min(9, minD(m, waterPx), wallPx.length ? minD(m, wallPx) : 99);
      if (!best || sc > best.sc + 0.5) best = { sc, d: [dx, dy] };
    }
    return best ? best.d : [0, 0];
  };
  const dOff = hasWater ? drainOff(runList.filter(r => r.kind === 'drain' && !still(r)).map(pxOf)) : [0, 0];
  const drawn = new Map(runList.filter(r => !still(r)).map(r => {
    const q = pxOf(r), d = r.kind === 'drain' ? dOff : [0, 0];
    return [r, q.map(p => [r1(p[0] + d[0]), r1(p[1] + d[1])])];
  }));
  const segBoxes = pad => [...drawn.values()].flatMap(q => q.slice(1).map((p, i) => ({ x0: Math.min(q[i][0], p[0]) - pad, y0: Math.min(q[i][1], p[1]) - pad, x1: Math.max(q[i][0], p[0]) + pad, y1: Math.max(q[i][1], p[1]) + pad })));
  const segs = segBoxes(3), segsTight = segBoxes(1.5);
  // room names (R4): each name sits wholly inside its own room and inside the outline, never across a line, a marker or another
  // name. The full name, else the short one (one form for every room of a kind on the floor), else none. Rooms that hold a
  // marker are named first, then wet rooms; a room that holds a marker may have its name over a run when nothing else fits.
  const th = fs + 2, namedRooms = new Set();
  const riserBoxes = runList.flatMap(r => (Array.isArray(r.risers) ? r.risers : []).filter(Array.isArray).map(q => ({ x0: X(q[0]) - 6, y0: Y(q[1]) - 6, x1: X(q[0]) + 6, y1: Y(q[1]) + 6 })));
  const holds = r => all.some(p => !p.edge && p.r === r);
  const rank = r => (holds(r) ? 0 : WET.has(r.kind) ? 1 : 2);
  const forms = nameForms(roomList);
  const nameOrder = [...roomList].filter(r => r.label).sort((a, b) => rank(a) - rank(b) || num(a.w) * num(a.h) - num(b.w) * num(b.h));
  const spotIn = (r, text, used, pass) => {
    const tw = text.length * fs * MONO;
    const ib = { x0: Math.max(X(r.x), box.x0) + 3, y0: Math.max(Y(r.y), box.y0) + 3, x1: Math.min(X(num(r.x) + num(r.w)), box.x1) - 3, y1: Math.min(Y(num(r.y) + num(r.h)), box.y1) - 3 };
    const fw = ib.x1 - ib.x0 - tw, fh = ib.y1 - ib.y0 - th;
    if (fw < 0 || fh < 0) return null;
    const nx = Math.min(24, Math.ceil(fw / 4)), ny = Math.min(24, Math.ceil(fh / 4)), cx = ib.x0 + fw / 2, cy = ib.y0 + fh / 2;
    const spots = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) spots.push([ib.x0 + (nx ? fw * i / nx : fw / 2), ib.y0 + (ny ? fh * j / ny : fh / 2)]);
    spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy) || a[0] - b[0] || a[1] - b[1]);
    let loose = null;   // the last pass: the spot over the fewest lines
    for (const [bx, by] of spots) {
      const b = { x0: bx, y0: by, x1: bx + tw, y1: by + th };
      if (!clearOfMarks(b, all) || used.some(o => hits(b, o, 2)) || (P && !boxInPoly(b, P)) || onLeader(b)) continue;
      if (pass === 'strict' && (segs.some(o => hits(b, o, 1)) || riserBoxes.some(o => hits(b, o, 1)))) continue;
      if (pass === 'tight' && (segsTight.some(o => hits(b, o, 0)) || riserBoxes.some(o => hits(b, o, 0)))) continue;
      if (pass !== 'loose') return b;
      const n = segsTight.filter(o => hits(b, o, 0)).length + riserBoxes.filter(o => hits(b, o, 0)).length;
      if (!loose || n < loose.n) loose = { n, b };
      if (n === 0) break;
    }
    return loose ? loose.b : null;
  };
  const placeNames = shortOnly => {
    const used = [], got = [];
    for (const r of nameOrder) {
      const fm = forms.get(r); if (!fm) continue;
      const texts = shortOnly.has(fm.group) ? (fm.short ? [fm.short] : []) : [fm.full, ...(fm.short ? [fm.short] : [])];
      let placed = null;
      for (const pass of holds(r) ? ['strict', 'tight', 'loose'] : ['strict', 'tight']) {
        for (const text of texts) { const b = spotIn(r, text, used, pass); if (b) { placed = { r, text, b, short: text !== fm.full, group: fm.group }; break; } }
        if (placed) break;
      }
      if (placed) { used.push(placed.b); got.push(placed); }
    }
    return got;
  };
  // one form per kind on a floor: when one bedroom needs its short name, every bedroom there uses its short name
  const shortOnly = new Set();
  let got = placeNames(shortOnly);
  for (let k = 0; k < 3; k++) {
    const mixed = [...new Set(got.map(g => g.group))].filter(g => !shortOnly.has(g) && got.some(x => x.group === g && x.short) && got.some(x => x.group === g && !x.short));
    if (!mixed.length) break;
    mixed.forEach(g => shortOnly.add(g));
    got = placeNames(shortOnly);
  }
  for (const g of got) {
    boxes.push(g.b); namedRooms.add(g.r);
    names += `<text class="ca-fs-room-t" x="${r1((g.b.x0 + g.b.x1) / 2)}" y="${r1(g.b.y1 - 3)}">${esc(g.text)}</text>`;
  }
  // the note a large building carries, inside the outline when it fits
  if (note) {
    // one line, else two; the place nearest the middle where the whole line sits inside the outline and clear of markers
    const cut = note.lastIndexOf(' ', Math.ceil(note.length / 2) + 4);
    const w3 = note.split(' '), t3 = Math.ceil(w3.length / 3);   // three short lines for a narrow wing
    const ways = [[note], ...(cut > 0 ? [[note.slice(0, cut), note.slice(cut + 1)]] : []),
      ...(w3.length >= 5 ? [[w3.slice(0, t3).join(' '), w3.slice(t3, 2 * t3).join(' '), w3.slice(2 * t3).join(' ')]] : [])];
    const mx = (rb.x0 + rb.x1) / 2, my = (rb.y0 + rb.y1) / 2;
    let best = null;
    for (const lines of ways) {
      const tw = Math.max(...lines.map(l => l.length)) * fs * MONO + 8, th2 = lines.length * (fs + 4) + 4;
      for (let gy = 0; gy <= 36; gy++) for (let gx = 0; gx <= 36; gx++) {   // fine enough to find a narrow wing
        const cx = rb.x0 + (rb.x1 - rb.x0) * gx / 36, cy = rb.y0 + (rb.y1 - rb.y0) * gy / 36;
        const b = { x0: cx - tw / 2, y0: cy - th2 / 2, x1: cx + tw / 2, y1: cy + th2 / 2 };
        if (b.x0 < 2 || b.x1 > width - 2 || (P ? !boxInPoly(b, P) : !hits(b, box)) || !clearOfMarks(b, all) || boxes.some(o => hits(b, o, 2))) continue;
        const d = Math.hypot(cx - mx, cy - my) + (lines.length - 1) * 30;
        if (!best || d < best.d) best = { d, lines, cx, b };
      }
    }
    // a plan too flat or thin to hold it: the note goes under the drawing (the SVG grows), never across a wall
    if (!best) {
      const lines = (width - 8) / (fs * MONO) >= note.length ? [note] : ways[1] || [note], th2 = lines.length * (fs + 4) + 4;
      const tw = Math.max(...lines.map(l => l.length)) * fs * MONO + 8, cx = width / 2;
      best = { lines, cx, b: { x0: cx - tw / 2, y0: H + 2, x1: cx + tw / 2, y1: H + 2 + th2 } };
      noteGrow = th2 + 6;
    }
    boxes.push(best.b);
    names += best.lines.map((l, i) => `<text class="ca-fs-note" x="${r1(best.cx)}" y="${r1(best.b.y0 + 2 + (i + 1) * (fs + 4) - 4)}">${esc(l)}</text>`).join('');
  }
  // overall sizes from the outline (public record, solid): width along the rear, depth along a side (the left, or on a phone
  // the side with no outside marker); when both sides hold outside markers on a phone, one figure along the rear: "56 ft × 33 ft"
  let dims = '';
  if (P) {
    const wFt = Math.round((Math.max(...rx) - Math.min(...rx))), dFt = Math.round((Math.max(...ry) - Math.min(...ry)));
    const yW = rear === 'top' ? rb.y0 - band('top') - dimOff : rb.y1 + band('bottom') + dimOff;
    const xD = depthAt === 'right' ? rb.x1 + band('right') + dimOff : rb.x0 - band('left') - dimOff;
    const tW = depthAt === 'fold' ? `${wFt} ft \u00d7 ${dFt} ft` : `${wFt} ft`, tD = `${dFt} ft`, twW = tW.length * fsSmall * MONO, twD = tD.length * fsSmall * MONO;
    const mx = (rb.x0 + rb.x1) / 2, my = (rb.y0 + rb.y1) / 2, gw = twW / 2 + 5, gd = twD / 2 + 5;
    dims += `<g class="ca-fs-dim" data-dim="${depthAt === 'fold' ? 'both' : 'width'}"><path d="M${rb.x0} ${yW}H${r1(Math.max(rb.x0, mx - gw))}M${r1(Math.min(rb.x1, mx + gw))} ${yW}H${rb.x1}M${rb.x0} ${yW - 5}V${yW + 5}M${rb.x1} ${yW - 5}V${yW + 5}"/>`
      + `<text class="ca-fs-dim-t" x="${r1((rb.x0 + rb.x1) / 2)}" y="${r1(yW + 4)}">${tW}</text></g>`;
    boxes.push({ x0: (rb.x0 + rb.x1 - twW) / 2 - 3, y0: yW - fsSmall / 2 - 2, x1: (rb.x0 + rb.x1 + twW) / 2 + 3, y1: yW + fsSmall / 2 + 2 });
    if (depthAt !== 'fold') {
      dims += `<g class="ca-fs-dim" data-dim="depth"><path d="M${xD} ${rb.y0}V${r1(Math.max(rb.y0, my - gd))}M${xD} ${r1(Math.min(rb.y1, my + gd))}V${rb.y1}M${xD - 5} ${rb.y0}H${xD + 5}M${xD - 5} ${rb.y1}H${xD + 5}"/>`
        + `<text class="ca-fs-dim-t" x="${r1(xD)}" y="${r1((rb.y0 + rb.y1) / 2 + 4)}" transform="rotate(${depthAt === 'right' ? 90 : -90} ${r1(xD)} ${r1((rb.y0 + rb.y1) / 2)})">${tD}</text></g>`;
      boxes.push({ x0: xD - fsSmall / 2 - 2, y0: (rb.y0 + rb.y1 - twD) / 2 - 3, x1: xD + fsSmall / 2 + 2, y1: (rb.y0 + rb.y1 + twD) / 2 + 3 });
    }
  }
  // street side: a small arrow from the wall (below any outside markers there) and the label
  const street = opts.frontBasis === 'assumed' ? 'Street side, assumed' : 'Street side';
  const cxS = r1((rb.x0 + rb.x1) / 2), stw = street.length * fs * MONO;
  let st, arrowBox = null;
  if (front === 'bottom') {
    const base = rb.y1 + band('bottom') + 4, ly = r1(base + STREET_BAND - 14), tip = r1(ly - fs * 0.73 - 5);
    // the arrow starts below any marker it would cross
    const a0 = Math.min(tip - 8, all.filter(p => Math.abs(p.x - cxS) < reach(p) + 3).reduce((y, p) => Math.max(y, p.y + reach(p) + 3), base));
    arrowBox = { x0: cxS - 5, y0: a0, x1: cxS + 5, y1: tip };
    st = `<path class="ca-fs-arrow" d="M${cxS} ${r1(a0)}V${tip}M${cxS - 4} ${tip - 5}L${cxS} ${tip}L${cxS + 4} ${tip - 5}"/><text class="ca-fs-street" x="${cxS}" y="${ly}">${street}</text>`;
    boxes.push({ x0: cxS - stw / 2, y0: ly - fs, x1: cxS + stw / 2, y1: ly + 3 });
  } else {
    const ly = r1(rb.y0 - band('top') - 24);
    arrowBox = { x0: cxS - 5, y0: ly + 6, x1: cxS + 5, y1: rb.y0 - band('top') - 4 };
    st = `<path class="ca-fs-arrow" d="M${cxS} ${r1(ly + 6)}V${r1(rb.y0 - band('top') - 4)}"/><text class="ca-fs-street" x="${cxS}" y="${ly}">${street}</text>`;
    boxes.push({ x0: cxS - stw / 2, y0: ly - fs, x1: cxS + stw / 2, y1: ly + 3 });
  }
  // north arrow (the outline's own bearing): in the street band, beside the label, clear of it and of the markers
  let north = '';
  const nv = Array.isArray(opts.north) ? opts.north : ring && Array.isArray(opts.outline?.north) ? opts.outline.north : null;
  if (P && nv && isFinite(num(nv[0])) && (num(nv[0]) || num(nv[1]))) {
    const L = Math.hypot(num(nv[0]), num(nv[1])), nx = num(nv[0]) / L, ny = num(nv[1]) / L;
    const sb = boxes.at(-1), cy0 = front === 'bottom' ? r1(sb.y1 - 8) : r1(sb.y0 + 6);
    // the arrow and its letter wholly inside the drawing (the letter sits 17 px out along north)
    const inDrawing = (x, y) => x - 6 >= 2 && x + 6 <= width - 2 && y - 7 >= 2 && y + 7 <= H - 2;
    const at = [0, -10, -20, 10].flatMap(dy => [rb.x1 - 24, rb.x0 + 24, sb.x1 + 34, sb.x0 - 34, width - 26].map(x => ({ x0: x - 22, y0: cy0 + dy - 22, x1: x + 22, y1: cy0 + dy + 22, cx: x, cy: r1(cy0 + dy) })))
      .find(b => b.x0 >= 2 && b.x1 <= width - 2 && inDrawing(b.cx + nx * 17, b.cy + ny * 17) && inDrawing(b.cx - nx * 9, b.cy - ny * 9) && !hits(b, sb, 4) && clearOfMarks(b, all, 2) && !boxes.some(o => hits(b, o, 2)));
    if (at) {
      const cx = r1(at.cx), cy = at.cy, t = (k) => [r1(cx + nx * k), r1(cy + ny * k)], [hx, hy] = t(9), [bx, by] = t(-9), [lx, ly] = t(17);
      const side = [r1(-ny * 4), r1(nx * 4)];
      north = `<g class="ca-fs-north" data-north="${r1(nx * 100) / 100},${r1(ny * 100) / 100}"><path d="M${bx} ${by}L${hx} ${hy}M${r1(hx - nx * 6 + side[0])} ${r1(hy - ny * 6 + side[1])}L${hx} ${hy}L${r1(hx - nx * 6 - side[0])} ${r1(hy - ny * 6 - side[1])}"/>`
        + `<text class="ca-fs-north-t" x="${lx}" y="${ly}">N</text></g>`;
      boxes.push(at);
    }
  }
  // runs under the markers: solid from records, dashed when likely; square, corners rounded a little; risers as small rings
  // one name per line kind per floor (the server sends one run per branch), placed on the longest run of that kind first;
  // a drain that shares its route with a water line is drawn a few px off it so both stay visible (still square);
  // its riser ring stays on the true spot, so the water and drain rings at one stack draw as one
  let runs = '', runText = '', risers = '';
  const runLen = r => r.points.filter(p => Array.isArray(p)).reduce((a, p, i, q) => i ? a + Math.abs(p[0] - q[i - 1][0]) + Math.abs(p[1] - q[i - 1][1]) : 0, 0);
  const named = new Set(), stacks = new Set(), traced = {}, hotPower = focus.includes('panel');
  const wallHit = b => P && P.some((p, i) => segHitsBox(p, P[(i + 1) % P.length], b));
  const order = runList.map((r, i) => [r, i, runLen(r)]).sort((a, b) => b[2] - a[2] || a[1] - b[1]).map(e => e[0]);
  for (const r of order) {
    const k = KINDS.has(r.kind) ? r.kind : 'water', cls = isSolid(r.basis) ? 'is-record' : 'is-likely';
    for (const q of Array.isArray(r.risers) ? r.risers : []) {
      if (!Array.isArray(q)) continue;
      const dir = q[2] === 'up' ? 'up' : 'down';
      risers += `<circle class="ca-fs-riser k-${k}" data-dir="${dir}" cx="${X(q[0])}" cy="${Y(q[1])}" r="4.5"><title>${RUN_NAMES[k]} ${dir === 'up' ? 'goes to the floor above' : 'goes to the floor below'}</title></circle>`;
    }
    if (still(r)) {   // a line that only passes through this floor: its ring, named "Stack" once beside it when there is room
      const q = r.points.find(p => Array.isArray(p)), cx = X(q[0]), cy = Y(q[1]), key = `${r1(cx)},${r1(cy)}`;
      if (stacks.has(key)) continue;
      stacks.add(key);
      const tw = 5 * fsSmall * MONO, ch = fsSmall + 2;
      const b = [[cx + 8, cy - ch / 2], [cx - 8 - tw, cy - ch / 2], [cx - tw / 2, cy - 8 - ch], [cx - tw / 2, cy + 8]].map(([x, y]) => ({ x0: x, y0: y, x1: x + tw, y1: y + ch }))
        .find(o => (!P || boxInPoly(o, P)) && clearOfMarks(o, all, 2) && !boxes.some(x => hits(o, x, 2)) && !segsTight.some(x => hits(o, x, 0)) && !onLeader(o));
      if (b) { boxes.push(b); runText += `<text class="ca-fs-run-t ca-fs-stack" x="${r1((b.x0 + b.x1) / 2)}" y="${r1(b.y1 - 3)}">Stack</text>`; }
      continue;
    }
    const pts = drawn.get(r); if (!pts || pts.length < 2) continue;
    const hot = k === 'power' && hotPower ? ' is-hot' : '';   // an electrical question: the service line is the line to see
    const trunk = traced[k] || (traced[k] = []), parts = untraced(pts, trunk);
    for (let i = 1; i < pts.length; i++) trunk.push([pts[i - 1], pts[i]]);
    if (parts.length) {
      const main = parts.reduce((m, q) => (q.length > m.length ? q : m), parts[0]);
      runs += `<path class="ca-fs-run ${cls} k-${k}${hot}" d="${parts.map(q => roundPath(q)).join('')}" points="${main.map(p => p.join(',')).join(' ')}"/>`;
    }
    const link = toMeter(pts, k, all, box, s);
    if (link) { const meter = all.find(p => p.edge && String(p.m.kind) === METER_OF[k]); runs += `<path class="ca-fs-run ca-fs-link ${isSolid(r.basis) && isSolid(meter?.m.basis) ? 'is-record' : 'is-likely'} k-${k}${hot}" d="${roundPath(link)}" points="${link.map(p => p.join(',')).join(' ')}"/>`; }
    const txt = r.label || RUN_NAMES[k]; if (named.has(k + '|' + txt)) continue;
    // the service line's name may sit outside beside its link to the meter when the line inside is too short for it
    const at = runLabelAt(pts, all, txt, boxes, fsSmall, box, P, segs, onLeader)
      || (link ? runLabelAt(link, all, txt, boxes, fsSmall, { x0: 0, y0: 0, x1: width, y1: H }, null, segs, b => onLeader(b) || wallHit(b)) : null);
    if (at) { named.add(k + '|' + txt); boxes.push(at.b); runText += `<text class="ca-fs-run-t" x="${at.x}" y="${at.y}">${esc(txt)}</text>`; }
  }
  // leaders: a thin line from a marker eased off its spot back to the spot, with a small dot there
  const lead = leaders.map(([p, q]) => `<path class="ca-fs-lead" d="M${p[0]} ${p[1]}L${q[0]} ${q[1]}"/><circle class="ca-fs-lead-dot" cx="${p[0]}" cy="${p[1]}" r="2"/>`).join('');
  s1 += runs + risers + lead + dims + st + north + names + runText;
  // markers last, non-focus first so focus rings sit on top
  all.sort((a, b) => Number(isFocus(a.m, focus)) - Number(isFocus(b.m, focus)));
  for (const { m, x, y } of all) s1 += markerSVG(m, x, y, focus, mr, rg);
  if (noteGrow) s1 = s1.replace(`viewBox="0 0 ${width} ${H}"`, `viewBox="0 0 ${width} ${H + noteGrow}"`);
  return s1 + '</svg>';
}

const LOT_NOTE = /^(\d+ buildings on this lot\.|Showing the (largest|one that best fits the recorded size|one you picked)\.|Outline: about [\d,]+ sq ft of ground\.|Record: [\d,]+ sq ft\.|They do not agree\.)$/;
/** "Built 1962" becomes "Built 1962 (likely)" when the year is inferred; the same for the fuel and, on a likely sketch, the layout. */
function houseText(ev) {
  const h = ev.house && typeof ev.house === 'object' ? ev.house : {};
  const t = String(h.text || '').trim(); if (!t || /\(likely\)/i.test(t)) return t;
  const likely = s => s.replace(/\.?\s*$/, ' (likely).');
  return t.split(/(?<=\.)\s+/).map((s, i) => {
    if (LOT_NOTE.test(s)) return s;   // the server's notes on which building is drawn state counts and recorded numbers
    if (/\bbuilt\b/i.test(s)) return h.year_basis === 'likely' ? likely(s) : s;
    if (/\b(heat|gas|oil|propane|electric)\b/i.test(s)) return h.fuel_basis === 'likely' ? likely(s) : s;
    if (i === 0 && ev.basis === 'likely' && !/public record/i.test(s)) return likely(s);   // a recorded fact is not made likely
    return s;
  }).join(' ');
}

const swatch = (cls, dashed) => `<svg class="ca-sw" viewBox="0 0 22 22" width="18" height="18" aria-hidden="true" focusable="false"><circle class="${cls}" cx="11" cy="11" r="8"${dashed ? ' stroke-dasharray="3 2.5"' : ''}/></svg>`;
// Line swatches match the runs: the kind shows in the line weight (and the label on the run), likely lines are dashed.
const riserSw = '<svg class="ca-sw" viewBox="0 0 22 22" width="18" height="18" aria-hidden="true" focusable="false"><circle class="ca-fs-riser" cx="11" cy="11" r="5"/></svg>';
const lineSw = (kind, dashed) => `<svg class="ca-sw" viewBox="0 0 26 10" width="24" height="10" aria-hidden="true" focusable="false"><line class="ca-sw-line k-${esc(kind)}" x1="3" y1="5" x2="23" y2="5"${dashed ? ' stroke-dasharray="4 3"' : ''}/></svg>`;

/** Things that hold for the building but have no spot on the plan (card.unplaced, large buildings): listed, not drawn. */
function unplacedRow(m, focus) {
  if (!m || typeof m !== 'object') return '';
  const f = isFocus(m, focus), solid = isSolid(m.basis);
  return `<li><div class="ca-eq ca-eq--off" data-k="${esc(String(m.kind || ''))}">`
    + `<span class="ca-eq-m ${markClass(m.basis)}" aria-hidden="true">${esc(String(m.short || '?').slice(0, 2))}</span>`
    + `<span class="ca-eq-t"><span class="ca-eq-h"><b>${esc(m.label || 'Item')}</b>${f ? '<span class="sys-chip sys-chip--soft">Start here</span>' : ''}${solid ? '' : '<span class="sys-chip sys-chip--warn">Likely</span>'}</span>`
    + `<span class="ca-eq-n">${esc([m.note, 'Not on the plan'].filter(Boolean).join(' · '))}</span>`
    + `</span></div></li>`;
}

function equipRow(m, focus, floors) {
  const solid = isSolid(m.basis), f = isFocus(m, focus), fl = floors[m.fi];
  const room = !m.outside && m.dup && typeof m.room === 'string' ? m.room : '';   // several of one kind: the room tells them apart
  const where = [m.note, room, m.outside ? (/^outside\b/i.test(String(m.note || '')) ? '' : 'Outside') : floors.length > 1 && fl?.name ? fl.name : ''].filter(Boolean).map(String);   // an outside marker is not on a floor
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
  return `<details class="ca-facts"><summary>Public facts</summary><dl class="ca-fields ca-fact-list">${rows.join('')}</dl>${links ? `<ol class="ca-fact-srcs" data-src>${links}</ol>` : ''}</details>`;
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
  const unplaced = Array.isArray(ev.unplaced) ? ev.unplaced.filter(m => m && typeof m === 'object') : [];
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
    + (list.length || unplaced.length ? `<ul class="ca-equip">${unplaced.map(m => unplacedRow(m, focus)).join('')}${list.map(m => equipRow(m, focus, floors)).join('')}</ul>` : '')
    + factsHTML(ev)
    + (floors.length || a._cmd ? `<div class="sys-actions ca-fs-acts">${floors.length && !(large && !fp) ? '<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm ca-3d-btn" data-ca="3d" aria-expanded="false">3D</button>' : ''}<span class="ca-fs-mapslot">${a._cmd ? mapControlHTML(a._cmd) : ''}</span></div><div class="ca-3d" hidden></div>` : '')
    + (ev.source_line ? `<p class="sys-src" data-src>${esc(ev.source_line)}</p>` : '');   // the shell moves it to the Sources drawer (copy rule 4)
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
