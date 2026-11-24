/* The five general answer pictures: scorecard, bridge, heatmap, pipeline_board, ranked_bars.
   renderView(container, view) appends ONE <section class="sys-card av"> to `container` and returns { destroy(), ready, el }.
   Pure drawing: no fetch, no storage, no library. Every text value is escaped and every number coerced, so server data never
   becomes markup. The stylesheet assets/agent-views.css is added to <head> by the first call unless the page already links it.

   VIEW (what the server sends)
     { kind, title, lead, data, basis, source, as_of, draft }
       kind    "scorecard" | "bridge" | "heatmap" | "pipeline_board" | "ranked_bars"
       title   the card heading
       lead    one or two sentences, 40 words at most (longer is cut at 40 words)
       basis   default basis of every item: "example" | "est" | "public" | "likely" | "record" | "derived", or any short text
               example  -> "Company record (example data)"   est -> "est."   public -> "Public record"   likely -> "Likely"
               record   -> "Company record"                  derived -> "Derived"
               Every item may carry its own `basis`; it wins over its row's, which wins over the view's. Each item shows its mark.
       source  one line for the Sources drawer (rendered with data-src)
       as_of   "YYYY-MM-DD" (shown as a date) or any short text
       draft   { action, label, ...anything } or null. The button reads `label`; a click dispatches the event
               "bsp:draft" (bubbles, composed) on the card with detail = a copy of the whole draft object.

   DATA PER KIND (units: "$k" thousands of dollars, "$M" millions, "%", or any word such as "jobs"; "" for a bare number)
     scorecard       { cols: [{id, label, unit}],
                       rows: [{id, label, basis?, co?}],
                       cells: [[ {value, target?, status?, trend?, basis?} | null ]]    // cells[row][col]; null draws "No record"
                       target_label?: "plan" }
                     status "good" | "warn" | "bad" (the server decides; words are "On plan", "Watch", "Off plan");
                     trend = up to 12 numbers, oldest first.
     bridge          { unit, start: {label, value}, steps: [{label, delta, basis?}], end: {label, value}, good?: "up" }
                     a positive delta is drawn favourable ("good": "down" flips it). The scale may start above zero; it says so.
     heatmap         { unit, good: "low" | "high", rows: [{id, label, basis?}], cols: [{id, label}], cells: [[number | null]] }
                     darker = worse (higher when good is "low", lower when "high"); null draws "No record".
     pipeline_board  { unit: "$M", amount_label?, stages: [{id, label}],
                       cards: [{ref, title, stage, amount?, tag?, due?, owner?, note?, basis?}] }
                     `ref` is never shown; `due` is words; a card whose stage is not listed adds a column.
     ranked_bars     { unit, max?, plan_label?, bars: [{ref, label, value, sub?, plan?, status?, basis?}] }
                     bars are drawn in the order given; `plan` draws a mark on the bar; status "good" | "warn" | "bad" colours it.

   MARKUP CONTRACT (for tests and for other lanes)
     [data-av-kind]        the card;   [data-av-item]   one per atomic item: scorecard cell, bridge row (start, steps, end),
                           heatmap cell, board card, bar;   each item carries data-basis (resolved) and shows a mark, either in
                           its own [data-av-mark] or in the [data-av-row] that holds it;   [data-src] the source line;
                           [data-av-draft] the draft button;   [data-method] the scale and legend notes. */

const KINDS = ['scorecard', 'bridge', 'heatmap', 'pipeline_board', 'ranked_bars'];
const KIND_LABEL = { scorecard: 'Scorecard', bridge: 'Value bridge', heatmap: 'Heat map', pipeline_board: 'Pipeline board', ranked_bars: 'Ranked bars' };
const LEAD_WORDS = 40;
const BASIS = {
  example: ['Company record (example data)', 'illus'], est: ['est.', ''], public: ['Public record', 'live'],
  likely: ['Likely', ''], record: ['Company record', 'live'], derived: ['Derived', 'illus'],
};
const STATUS = new Set(['good', 'warn', 'bad']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── small helpers ────────────────────────────────────────────────────────── */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === null || v === '' || typeof v === 'boolean' || (typeof v !== 'number' && typeof v !== 'string') ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const arr = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const clip = (v, n) => { const w = str(v, 2000).split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ') : w.join(' '); };
const grp = n => Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let uid = 0;

/** A number with its unit: "$1.98M", "$252k", "43%", "14 jobs", "83 pts". null draws "No record". */
export function fmtValue(v, unit = '') {
  const n = num(v); if (n === null) return 'No record';
  const neg = n < 0 ? '−' : '', a = Math.abs(n);
  if (unit === '$k') return neg + (a >= 10000 ? '$' + (a / 1000).toFixed(1) + 'M' : a >= 1000 ? '$' + (a / 1000).toFixed(2) + 'M' : '$' + grp(a) + 'k');
  if (unit === '$M') return neg + '$' + (a >= 100 ? Math.round(a) : Math.round(a * 10) / 10) + 'M';
  if (unit === '%') return neg + Math.round(a * 10) / 10 + '%';
  return neg + grp(a) + (unit ? ' ' + unit : '');
}
const signed = (n, unit) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtValue(Math.abs(n), unit);
const plain = (v, unit) => (['$k', '$M', '%'].includes(unit) ? fmtValue(v, unit) : (num(v) === null ? 'No record' : (num(v) < 0 ? '−' : '') + grp(Math.abs(num(v)))));

function asOf(s) {
  const t = str(s, 40); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m && MONTHS[Number(m[2]) - 1] ? `As of ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : t ? `As of ${t}` : '';
}
function basisOf(...c) { for (const b of c) { const s = str(b, 60); if (s) return s; } return ''; }
function mark(basis) {
  if (!basis) return '';
  const k = basis.toLowerCase(), hit = BASIS[k];
  const [text, cls] = hit || [basis, ''];
  return `<span class="sys-est${cls ? ' sys-est--' + cls : ''} av-mark" data-av-mark="${esc(hit ? k : 'text')}">${esc(text)}</span>`;
}
const empty = (t = 'Nothing to show.') => `<p class="av-empty">${esc(t)}</p>`;
const statusOf = s => (STATUS.has(s) ? s : '');
const STATUS_ICON = {
  good: '<circle cx="5" cy="5" r="4"/>', warn: '<path d="M5 .8 9.4 9H.6z"/>', bad: '<path d="M5 .4 9.6 5 5 9.6.4 5z"/>',
};
const statusIcon = s => `<svg class="av-ic" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false" fill="currentColor">${STATUS_ICON[s] || ''}</svg>`;

function spark(vals) {
  const v = (Array.isArray(vals) ? vals : []).map(num).filter(x => x !== null).slice(-12);
  if (v.length < 2) return '';
  const w = 64, h = 22, p = 3, mn = Math.min(...v), mx = Math.max(...v);
  const pts = v.map((x, i) => [p + i * (w - 2 * p) / (v.length - 1), h - p - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (h - 2 * p)]);
  const last = pts[pts.length - 1];
  return `<svg class="av-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">`
    + `<polyline points="${pts.map(q => q.map(z => z.toFixed(1)).join(',')).join(' ')}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.3"/></svg>`;
}

/* ── scorecard ────────────────────────────────────────────────────────────── */
function drawScorecard(d, view) {
  const cols = arr(d.cols), rows = arr(d.rows);
  if (!cols.length || !rows.length) return empty();
  const cells = Array.isArray(d.cells) ? d.cells : [];
  const tl = str(d.target_label, 20) || 'plan';
  const words = { good: `On ${tl}`, warn: 'Watch', bad: `Off ${tl}` };
  const head = `<div class="av-sc-hd" role="row"><span role="columnheader"><span class="av-vh">Company</span></span>${cols.map(c => `<span role="columnheader">${esc(c.label)}</span>`).join('')}</div>`;
  const body = rows.map((r, ri) => {
    const rb = basisOf(r.basis, view.basis);
    const line = Array.isArray(cells[ri]) ? cells[ri] : [];
    const tds = cols.map((c, ci) => {
      const cell = line[ci] && typeof line[ci] === 'object' ? line[ci] : null;
      const unit = str(c.unit, 12), id = `${esc(r.id)}:${esc(c.id)}`;
      if (!cell || num(cell.value) === null) {
        return `<div class="av-sc-cell is-none" role="cell" data-av-item="${id}" data-basis="${esc(rb)}"><span class="av-cl">${esc(c.label)}</span><span class="av-val">No record</span></div>`;
      }
      const v = num(cell.value), t = num(cell.target), st = statusOf(cell.status), cb = basisOf(cell.basis, rb);
      const pct = t ? (v - t) / Math.abs(t) * 100 : null;
      const sub = t === null ? '' : `${esc(tl)} ${esc(fmtValue(t, unit))}${pct === null ? '' : ` · ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(Math.round(pct * 10) / 10)}%`}`;
      return `<div class="av-sc-cell" role="cell" data-av-item="${id}" data-basis="${esc(cb)}" data-status="${st}">`
        + `<span class="av-cl">${esc(c.label)}</span>`
        + `<span class="av-val">${esc(fmtValue(v, unit))}</span>`
        + (st ? `<span class="av-st av-st--${st}">${statusIcon(st)}${esc(words[st])}</span>` : '')
        + `<span class="av-sub">${sub}</span>${spark(cell.trend)}`
        + (cb !== rb ? `<span class="av-cm">${mark(cb)}</span>` : '') + '</div>';
    }).join('');
    return `<div class="av-sc-row" role="row" data-av-row="${esc(r.id)}" data-basis="${esc(rb)}"${r.co ? ` data-co="${esc(r.co)}"` : ''}>`
      + `<div class="av-sc-lab" role="rowheader"><b>${esc(r.label)}</b>${mark(rb)}</div>${tds}</div>`;
  }).join('');
  return `<div class="av-sc" role="table" aria-label="${esc(view.title)}" style="--n:${cols.length}">${head}${body}</div>`;
}

/* ── bridge ───────────────────────────────────────────────────────────────── */
function drawBridge(d, view) {
  const unit = str(d.unit, 12), st = d.start && typeof d.start === 'object' ? d.start : null, en = d.end && typeof d.end === 'object' ? d.end : null;
  const steps = arr(d.steps);
  const s0 = st ? num(st.value) : null, e0 = en ? num(en.value) : null;
  if (s0 === null || e0 === null) return empty();
  const up = d.good === 'down' ? -1 : 1;
  const run = [s0]; steps.forEach(s => run.push(run[run.length - 1] + (num(s.delta) || 0)));
  const all = [...run, e0], mn = Math.min(...all), mx = Math.max(...all), range = mx - mn || Math.abs(mx) * 0.2 || 1;
  const unitStep = 10 ** Math.floor(Math.log10(range));
  let lo = Math.floor((mn - range * 0.8) / unitStep) * unitStep; if (mn >= 0) lo = Math.max(0, lo);
  const hi = mx + range * 0.15, span = hi - lo || 1;
  const pos = (a, b) => { const l = (Math.min(a, b) - lo) / span * 100, w = Math.abs(b - a) / span * 100; return `left:${clamp(l, 0, 100).toFixed(2)}%;width:${Math.max(w, 0.9).toFixed(2)}%`; };
  const vb = basisOf(view.basis);
  const total = (t, v, id) => `<li class="av-br-row is-total" data-av-item="${id}" data-basis="${esc(vb)}"><div class="av-br-lab"><b>${esc(t.label)}</b>${mark(vb)}</div>`
    + `<div class="av-br-track" aria-hidden="true"><span class="av-br-bar" style="${pos(lo, v)}"></span></div><span class="av-br-val">${esc(fmtValue(v, unit))}</span></li>`;
  const mid = steps.map((s, i) => {
    const dl = num(s.delta) || 0, a = run[i], b = run[i + 1], sb = basisOf(s.basis, vb), dir = dl === 0 ? 'flat' : (dl * up > 0 ? 'up' : 'down');
    return `<li class="av-br-row is-${dir}" data-av-item="step-${i}" data-basis="${esc(sb)}" data-delta="${dl}"><div class="av-br-lab"><b>${esc(s.label)}</b>${mark(sb)}</div>`
      + `<div class="av-br-track" aria-hidden="true"><span class="av-br-bar" style="${pos(a, b)}"></span></div>`
      + `<span class="av-br-val">${dl > 0 ? '▲' : dl < 0 ? '▼' : ''} ${esc(signed(dl, unit))}</span></li>`;
  }).join('');
  return `<ol class="av-br" aria-label="${esc(view.title)}">${total(st, s0, 'start')}${mid}${total(en, e0, 'end')}</ol>`
    + (lo > 0 ? `<p class="av-note" data-method>Scale starts at ${esc(fmtValue(lo, unit))}.</p>` : '');
}

/* ── heat map ─────────────────────────────────────────────────────────────── */
function drawHeatmap(d, view) {
  const rows = arr(d.rows), cols = arr(d.cols), unit = str(d.unit, 12), grid = Array.isArray(d.cells) ? d.cells : [];
  if (!rows.length || !cols.length) return empty();
  const vals = []; rows.forEach((_, ri) => cols.forEach((_c, ci) => { const v = num((grid[ri] || [])[ci]); if (v !== null) vals.push(v); }));
  const mn = Math.min(...vals), mx = Math.max(...vals), lowGood = d.good !== 'high';
  const head = `<div class="av-hm-hd" role="row"><span role="columnheader"><span class="av-vh">Row</span></span>${cols.map(c => `<span role="columnheader">${esc(c.label)}</span>`).join('')}</div>`;
  const body = rows.map((r, ri) => {
    const rb = basisOf(r.basis, view.basis);
    const tds = cols.map((c, ci) => {
      const v = num((grid[ri] || [])[ci]), id = `${esc(r.id)}:${esc(c.id)}`;
      if (v === null) return `<div class="av-hm-c is-none" role="cell" data-av-item="${id}" data-basis="${esc(rb)}" title="${esc(r.label)}, ${esc(c.label)}: No record"><span class="av-cl">${esc(c.label)}</span><span class="av-hm-v">No record</span></div>`;
      let t = mx === mn ? 0.5 : (v - mn) / (mx - mn); if (!lowGood) t = 1 - t;
      return `<div class="av-hm-c" role="cell" data-av-item="${id}" data-basis="${esc(rb)}" data-value="${v}" style="--t:${t.toFixed(3)}" title="${esc(r.label)}, ${esc(c.label)}: ${esc(fmtValue(v, unit))}"><span class="av-cl">${esc(c.label)}</span><span class="av-hm-v">${esc(plain(v, unit))}</span></div>`;
    }).join('');
    return `<div class="av-hm-row" role="row" data-av-row="${esc(r.id)}" data-basis="${esc(rb)}"><div class="av-hm-lab" role="rowheader"><b>${esc(r.label)}</b>${mark(rb)}</div><div class="av-hm-cells" style="--n:${cols.length}">${tds}</div></div>`;
  }).join('');
  const u = ['$k', '$M', '%'].includes(unit) || !unit ? '' : ` Cells show ${esc(unit)}.`;
  return `<div class="av-hm" role="table" aria-label="${esc(view.title)}" style="--n:${cols.length}">${head}${body}</div>`
    + `<p class="av-note" data-method>Darker cells are ${lowGood ? 'higher' : 'lower'}, and worse.${u}</p>`;
}

/* ── pipeline board ───────────────────────────────────────────────────────── */
function drawBoard(d, view) {
  const unit = str(d.unit, 12) || '$M', al = str(d.amount_label, 24);
  const cards = arr(d.cards);
  const stages = arr(d.stages).map(s => ({ id: str(s.id, 60), label: str(s.label || s.id, 60) }));
  cards.forEach(c => { const id = str(c.stage, 60); if (id && !stages.some(s => s.id === id)) stages.push({ id, label: id }); });
  if (!stages.length || !cards.length) return empty();
  const cols = stages.map(s => {
    const mine = cards.filter(c => str(c.stage, 60) === s.id);
    const sum = mine.reduce((a, c) => a + (num(c.amount) || 0), 0);
    const items = mine.map(c => {
      const b = basisOf(c.basis, view.basis), amt = num(c.amount);
      const meta = [str(c.due, 40), str(c.owner, 48)].filter(Boolean).join(' · ');
      return `<li class="av-pc" data-av-item="${esc(str(c.ref, 80))}" data-basis="${esc(b)}">`
        + `<b class="av-pc-t" title="${esc(c.title)}">${esc(c.title)}</b>`
        + (amt !== null || c.tag ? `<span class="av-pc-row">${amt !== null ? `<span class="av-pc-amt">${esc(fmtValue(amt, unit))}</span>${al ? `<span class="av-pc-al">${esc(al)}</span>` : ''}` : ''}${c.tag ? `<span class="sys-chip av-tag">${esc(str(c.tag, 32))}</span>` : ''}</span>` : '')
        + (meta ? `<span class="av-pc-meta">${esc(meta)}</span>` : '')
        + (c.note ? `<span class="av-pc-note" title="${esc(c.note)}">${esc(c.note)}</span>` : '')
        + `<span class="av-pc-mark">${mark(b)}</span></li>`;
    }).join('');
    return `<section class="av-pb-col" data-stage="${esc(s.id)}" aria-label="${esc(s.label)}, ${mine.length}">`
      + `<header class="av-pb-hd"><h4>${esc(s.label)}</h4><span class="av-pb-sum">${mine.length}${sum ? ` · ${esc(fmtValue(sum, unit))}` : ''}</span></header>`
      + (items ? `<ul class="av-pb-list">${items}</ul>` : '<p class="av-empty">None</p>') + '</section>';
  }).join('');
  return `<div class="av-pb">${cols}</div>`;
}

/* ── ranked bars ──────────────────────────────────────────────────────────── */
function drawBars(d, view) {
  const bars = arr(d.bars), unit = str(d.unit, 12);
  if (!bars.length) return empty();
  const pl = str(d.plan_label, 20) || 'plan';
  const all = bars.flatMap(b => [num(b.value), num(b.plan)]).filter(x => x !== null);
  const max = num(d.max) || Math.max(...all, 1);
  const hasPlan = bars.some(b => num(b.plan) !== null);
  const rows = bars.map((b, i) => {
    const v = num(b.value), p = num(b.plan), bb = basisOf(b.basis, view.basis), st = statusOf(b.status);
    const w = v === null ? 0 : clamp(v / max * 100, 0, 100);
    const txt = v === null ? 'No record' : p !== null ? `${plain(v, unit === '$k' || unit === '$M' || unit === '%' ? unit : '')} of ${fmtValue(p, unit)}` : fmtValue(v, unit);
    return `<li class="av-rb-row" data-av-item="${esc(str(b.ref, 80) || 'bar-' + i)}" data-basis="${esc(bb)}"${st ? ` data-status="${st}"` : ''}>`
      + `<div class="av-rb-lab"><span class="av-rb-n" aria-hidden="true">${i + 1}</span><span class="av-rb-t"><b>${esc(b.label)}</b>${b.sub ? `<span class="av-rb-sub">${esc(b.sub)}</span>` : ''}${mark(bb)}</span></div>`
      + `<div class="av-rb-track" aria-hidden="true"><span class="av-rb-bar" style="width:${w.toFixed(2)}%"></span>${p !== null ? `<span class="av-rb-plan" style="left:${clamp(p / max * 100, 0, 100).toFixed(2)}%" title="${esc(pl)} ${esc(fmtValue(p, unit))}"></span>` : ''}</div>`
      + `<span class="av-rb-val">${esc(txt)}</span></li>`;
  }).join('');
  return `<ol class="av-rb" aria-label="${esc(view.title)}">${rows}</ol>` + (hasPlan ? `<p class="av-note" data-method>The line on each bar marks the ${esc(pl)}.</p>` : '');
}

const DRAW = { scorecard: drawScorecard, bridge: drawBridge, heatmap: drawHeatmap, pipeline_board: drawBoard, ranked_bars: drawBars };

/* ── stylesheet ───────────────────────────────────────────────────────────── */
function cssLink() {
  try {
    const have = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => /agent-views\.css/.test(l.getAttribute('href') || ''));
    if (have) return have;
    const base = new URL(import.meta.url);
    const u = new URL('agent-views.css', base); u.search = base.search;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u.href; document.head.appendChild(l);
    return l;
  } catch { return null; }
}
function cssReady() {
  const l = cssLink();
  if (!l || l.sheet) return Promise.resolve();
  return new Promise(res => { const done = () => res(); l.addEventListener('load', done, { once: true }); l.addEventListener('error', done, { once: true }); setTimeout(done, 4000); });
}

/** Draws one view into `container`. Returns { destroy(), ready, el }; `ready` resolves when the stylesheet is in. */
export function renderView(container, view) {
  const ready = cssReady();
  if (!container || typeof container.appendChild !== 'function') return { destroy() {}, ready, el: null };
  const v = view && typeof view === 'object' ? view : {};
  const kind = KINDS.includes(v.kind) ? v.kind : '';
  const id = `av-${++uid}`;
  const root = document.createElement('section');
  root.className = 'sys-card av';
  root.setAttribute('aria-labelledby', id + '-t');
  root.dataset.avKind = kind || 'unknown';
  const d = v.data && typeof v.data === 'object' ? v.data : {};
  let body;
  try { body = kind ? DRAW[kind](d, v) : empty('This view is not available.'); } catch (e) { console.warn('view failed to draw', e); body = empty('This view could not be drawn.'); }
  const draft = v.draft && typeof v.draft === 'object' && str(v.draft.action) && str(v.draft.label) ? v.draft : null;
  const when = asOf(v.as_of), lead = clip(v.lead, LEAD_WORDS);
  root.innerHTML = `<header class="av-head"><div class="sys-card-label av-kick">${esc(KIND_LABEL[kind] || 'View')}${when ? `<span class="sys-chip av-asof">${esc(when)}</span>` : ''}</div>`
    + `<h3 class="av-title" id="${id}-t">${esc(str(v.title, 160) || KIND_LABEL[kind] || 'View')}</h3>${lead ? `<p class="av-lead">${esc(lead)}</p>` : ''}</header>`
    + `<div class="av-body">${body}</div>`
    + `<footer class="av-foot">${v.source ? `<p class="av-src sys-src" data-src>${esc(str(v.source, 400))}</p>` : ''}`
    + (draft ? `<button type="button" class="sys-btn sys-btn--primary av-draft" data-av-draft>${esc(str(draft.label, 80))}</button>` : '') + '</footer>';
  const onClick = e => {
    if (!e.target.closest?.('[data-av-draft]') || !draft) return;
    let detail; try { detail = JSON.parse(JSON.stringify(draft)); } catch { detail = { ...draft }; }
    root.dispatchEvent(new CustomEvent('bsp:draft', { bubbles: true, composed: true, detail }));
  };
  root.addEventListener('click', onClick);
  container.appendChild(root);
  return { el: root, ready, destroy() { root.removeEventListener('click', onClick); root.remove(); } };
}

export { KINDS as VIEW_KINDS };
