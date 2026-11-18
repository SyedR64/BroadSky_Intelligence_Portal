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
const RUN_NAMES = { water: 'Water', gas: 'Gas', drain: 'Drain' };
const KINDS = new Set(['water', 'gas', 'drain']);
const BASIS_CHIP = { record: ['From company records', 'good'], likely: ['Likely, confirm on site', 'warn'], mixed: ['Records and likely', 'info'] };
// Company-specific apps carry their company's accent; shared apps (mail, calendar, chat, CRM) take the page's current company.
const APP_CO = { servicetitan: 'pp', procore: 'cet', servicedesk: 'fl', shopify: 'fh' };

const isRecord = b => b === 'record';
const fieldRole = () => { try { return document.querySelector('main.ca')?.dataset.style === 'field'; } catch { return false; } };
const coOf = (ctx, app) => APP_CO[app] || ctx?.turn?.closest?.('[data-co]')?.dataset.co || '';

/** Dispatches a card event to its renderer; unknown kinds render nothing. */
export function renderCard(ev, ctx = {}) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.kind === 'floor_sketch') return renderSketch(ev, ctx);
  if (ev.kind === 'action_draft') return renderDraft(ev, ctx);
  return null;
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
  const rec = isRecord(m.basis), f = isFocus(m, focus);
  return `<g class="ca-fs-m ${rec ? 'is-record' : 'is-likely'}${f ? ' is-focus' : ''}" data-k="${esc(m.key)}">`
    + (f ? `<circle class="ca-fs-ring" cx="${x}" cy="${y}" r="27"/>` : `<circle class="ca-fs-halo" cx="${x}" cy="${y}" r="27"/>`)
    + `<circle cx="${x}" cy="${y}" r="20"${rec ? '' : ' stroke-dasharray="5 4"'}/><text x="${x}" y="${y}">${esc(String(m.short || '?').slice(0, 2))}</text></g>`;
}

/** Eases apart inside markers whose circles (radius 20) would overlap; outside markers stay put. Positions stay on the floor. */
function spread(pts, W, H, gap = 44) {
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]; if (a.fixed && b.fixed) continue;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const push = (gap - d) / (a.fixed || b.fixed ? 1 : 2), ux = dx / d, uy = dy / d;
      if (!a.fixed) { a.x -= ux * push; a.y -= uy * push; }
      if (!b.fixed) { b.x += ux * push; b.y += uy * push; }
      moved = true;
    }
    for (const p of pts) if (!p.fixed) { p.x = Math.min(W, Math.max(0, p.x)); p.y = Math.min(H, Math.max(0, p.y)); }
    if (!moved) break;
  }
  for (const p of pts) { p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; }
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
/** A gas line that stops at the wall continues out to the gas meter drawn outside, when there is one. */
function toMeter(pts, kind, all, W, H) {
  if (kind !== 'gas') return pts;
  const meter = all.find(p => p.fixed && String(p.m.kind) === 'gas_meter'); if (!meter) return pts;
  const atWall = ([x, y]) => x <= 40 || y <= 40 || x >= W - 40 || y >= H - 40;   // within five feet of a wall
  const d = q => Math.hypot(q[0] - meter.x, q[1] - meter.y);
  const [a, b] = [pts[0], pts.at(-1)];
  if (d(a) <= d(b)) return atWall(a) ? [[meter.x, meter.y], ...pts] : pts;
  return atWall(b) ? [...pts, [meter.x, meter.y]] : pts;
}

/**
 * The SVG for one floor (string). Units are feet scaled by 8; margin 56 on each side plus 24 at the bottom for the street label.
 * opts: { focus: string[] (focus kinds), front: 'bottom' | 'top', markers: [{...item, key}] for this floor (inside and outside) }.
 */
export function sketchSVG(floor, outside = [], opts = {}) {
  const f = floor && typeof floor === 'object' ? floor : {};
  const W = Math.max(1, num(f.w)) * PX, H = Math.max(1, num(f.h)) * PX;
  const focus = (opts.focus || []).map(String), front = opts.front === 'top' ? 'top' : 'bottom';
  const inside = opts.markers ? opts.markers.filter(m => !m.outside) : (Array.isArray(f.items) ? f.items : []).map((it, i) => ({ ...it, key: `i${i}` }));
  const outs = opts.markers ? opts.markers.filter(m => m.outside) : (Array.isArray(outside) ? outside : []).map((it, i) => ({ ...it, key: `o${i}`, outside: true }));
  const name = String(f.name || 'Floor');
  const say = [...inside, ...outs].map(m => `${m.label || ''}${m.note ? `, ${m.note}` : ''} (${isRecord(m.basis) ? 'from records' : 'likely'})`);
  const label = `${name} sketch: ${say.length ? say.join('; ') : 'no equipment recorded on this floor'}`;
  const boxes = [];   // label boxes run labels keep clear of
  let roomText = '';   // room names go over the pipe runs (with a halo), so a line never hides them
  let s = `<svg class="ca-fs" viewBox="-56 -56 ${W + 112} ${H + 136}" role="img" aria-label="${esc(label)}" focusable="false"><title>${esc(label)}</title>`;
  s += `<rect class="ca-fs-wall" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;
  for (const r of Array.isArray(f.rooms) ? f.rooms : []) {
    if (!r || typeof r !== 'object') continue;
    const x = num(r.x) * PX, y = num(r.y) * PX, w = num(r.w) * PX, h = num(r.h) * PX;
    if (!(x <= 0 && y <= 0 && w >= W && h >= H)) s += `<rect class="ca-fs-room" x="${x}" y="${y}" width="${w}" height="${h}"/>`;   // a room that is the whole floor is only named
    if (r.label) { roomText += `<text class="ca-fs-room-t" x="${x + 8}" y="${y + 18}">${esc(r.label)}</text>`; boxes.push({ x0: x + 8, y0: y, x1: x + 8 + String(r.label).length * 10.8, y1: y + 22 }); }
  }
  s += `<rect class="ca-fs-wall ca-fs-wall-line" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;
  // Marker positions: outside markers sit off the walls; inside markers closer than one marker apart are eased apart so each stays readable.
  const all = [...inside.map(m => ({ m, x: num(m.x) * PX, y: num(m.y) * PX, fixed: false })), ...outs.map(m => { const [x, y] = outsidePoint(m, W, H, front); return { m, x, y, fixed: true }; })];
  spread(all, W, H);
  // Street side: a small arrow from the wall and the label 30 units out (further out when a marker sits on that side).
  const busy = outs.some(m => { const [, oy] = outsidePoint(m, W, H, front); return front === 'bottom' ? oy > H : oy < 0; });
  if (front === 'bottom') {
    const ly = busy ? H + 72 : H + 30;
    s += `<path class="ca-fs-arrow" d="M${W / 2} ${H + 4}V${ly - 14}M${W / 2 - 5} ${ly - 19}L${W / 2} ${ly - 14}L${W / 2 + 5} ${ly - 19}"/><text class="ca-fs-street" x="${W / 2}" y="${ly}">Street side</text>`;
  } else {
    s += `<text class="ca-fs-street" x="${W / 2}" y="-30">Street side</text>`;
  }
  // Pipe runs under the markers: solid from records, dashed when likely.
  for (const r of Array.isArray(f.runs) ? f.runs : []) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.points)) continue;
    const k = KINDS.has(r.kind) ? r.kind : 'water';
    const pts = toMeter(r.points.filter(p => Array.isArray(p)).map(p => [num(p[0]) * PX, num(p[1]) * PX]), k, all, W, H); if (pts.length < 2) continue;
    s += `<polyline class="ca-fs-run ${isRecord(r.basis) ? 'is-record' : 'is-likely'} k-${k}" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
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
const lineSw = (kind, dashed) => `<svg class="ca-sw" viewBox="0 0 26 10" width="24" height="10" aria-hidden="true" focusable="false"><line class="ca-sw-line k-${kind}" x1="3" y1="5" x2="23" y2="5"${dashed ? ' stroke-dasharray="4 3"' : ''}/></svg>`;

function equipRow(m, focus, floors) {
  const rec = isRecord(m.basis), f = isFocus(m, focus), fl = floors[m.fi];
  const where = [m.note, m.outside ? (/^outside\b/i.test(String(m.note || '')) ? '' : 'Outside') : floors.length > 1 && fl?.name ? fl.name : ''].filter(Boolean).map(String);   // an outside marker is not on a floor
  return `<li><button type="button" class="ca-eq" data-ca="equip" data-k="${esc(m.key)}" data-floor="${m.fi}">`
    + `<span class="ca-eq-m ${rec ? 'is-record' : 'is-likely'}" aria-hidden="true">${esc(String(m.short || '?').slice(0, 2))}</span>`
    + `<span class="ca-eq-t"><span class="ca-eq-h"><b>${esc(m.label || 'Item')}</b>${f ? '<span class="sys-chip sys-chip--soft">Start here</span>' : ''}${rec ? '' : '<span class="sys-chip sys-chip--warn">Likely</span>'}</span>`
    + (where.length ? `<span class="ca-eq-n">${esc(where.join(' · '))}</span>` : '')
    + (m.detail ? `<span class="ca-eq-d">${esc(m.detail)}</span>` : '')
    + `</span></button></li>`;
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
  const basis = BASIS_CHIP[ev.basis] || BASIS_CHIP.likely;
  const fRank = m => { const i = focus.indexOf(String(m.kind)); return i < 0 ? focus.length : i; };
  const list = [
    ...markers.filter(m => isFocus(m, focus)).sort((a, b) => fRank(a) - fRank(b)),
    ...markers.filter(m => !isFocus(m, focus) && m.fi === cur),
    ...markers.filter(m => !isFocus(m, focus) && m.fi !== cur),
  ];
  const a = document.createElement('article');
  a.className = 'ca-sketch sys-card'; a.dataset.co = 'pp';
  a.innerHTML = `<div class="sys-card-label">Floor sketch <span class="sys-chip sys-chip--${basis[1]}">${basis[0]}</span></div>`
    + `<h3 class="sys-card-title ca-fs-title" tabindex="-1">${esc(ev.address || ev.title || 'Floor sketch')}</h3>`
    + (houseText(ev) ? `<p class="ca-house sys-card-body">${esc(houseText(ev))}</p>` : '')
    + (ev.area?.label ? `<p class="sys-src ca-fs-area">${esc(ev.area.label)}</p>` : '')
    + (floors.length ? `<div class="sys-chips ca-fs-floors" role="group" aria-label="Floor">${floors.map((f, i) => `<button type="button" class="sys-chip" data-ca="floor" data-floor="${i}" aria-pressed="${i === cur}">${esc(f.name || `Floor ${i + 1}`)}</button>`).join('')}</div>` : '')
    + floors.map((f, i) => `<div class="ca-fs-svg" data-floor="${i}"${i === cur ? '' : ' hidden'}>${sketchSVG(f, [], { focus, front: ev.front, markers: markers.filter(m => m.fi === i) })}</div>`).join('')
    + `<p class="ca-legend"><span>${swatch('ca-sw-rec')}From company records</span><span>${swatch('ca-sw-lik', true)}Likely, confirm on site</span><span>${lineSw('water')}Water</span><span>${lineSw('gas')}Gas</span><span>${lineSw('drain')}Drain</span><span>${lineSw('water', true)}Likely line</span></p>`
    + (list.length ? `<ul class="ca-equip">${list.map(m => equipRow(m, focus, floors)).join('')}</ul>` : '')
    + (ev.source_line ? `<p class="sys-src">${esc(ev.source_line)}</p>` : '');
  const show = i => {
    a.querySelectorAll('.ca-fs-svg').forEach(d => { d.hidden = Number(d.dataset.floor) !== i; });
    a.querySelectorAll('[data-ca="floor"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === i)));
  };
  a.addEventListener('click', e => {
    const b = e.target.closest?.('[data-ca]'); if (!b || !a.contains(b)) return;
    if (b.dataset.ca === 'floor') { show(Number(b.dataset.floor)); return; }
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
