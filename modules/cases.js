/* ═══════════════════════════════════════════════════════════════════════════
   Value-creation cases (Precedents) — how sponsors built and sold companies like
   Punctual Pros. Dataset: Value-creation case set (data/research/value_creation_cases.json),
   modelled by ./cases-lib.js (shared with redesigns/case-studies.html).
   Views: timeline · levers · sequence · exits.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as L from './cases-lib.js?v=20261008192305';
import * as Copy from './copy.js?v=20261008192305';

const COLOR = 'var(--sys-violet)';   // module accent from the brand palette (company accents stay with their companies)
/* chips: status (.sys-chip--good|warn|bad|info), Punctual Pros (.sys-chip--soft in its accent) or neutral */
const stChip = (t, st) => `<span class="sys-chip${st ? ` sys-chip--${st}` : ''}">${esc(t)}</span>`;
const ppChip = t => `<span class="sys-chip sys-chip--soft" data-co="pp">${esc(t)}</span>`;
const btn = (ui, size = '') => ui.btnCls('secondary', size);
/** "2026-10-06" → "Oct 6, 2026" for provenance lines (dates in words). */
const asOf = s => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || '')); if (!m) return s; const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]; return m[3] ? `${mo} ${Number(m[3])}, ${m[1]}` : `${mo} ${m[1]}`; };
const PAGE = 'redesigns/case-studies.html';
const injectCss = () => { if (!document.getElementById('css-cases')) { const l = document.createElement('link'); l.id = 'css-cases'; l.rel = 'stylesheet'; l.href = 'modules/cases.css?v=20261008192305'; document.head.appendChild(l); } };
const esc = L.esc;
const EST = Copy.EST;
const ext = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">${esc(t || L.host(u))} ↗</a>` : '—';
const clip = (s, n = 140) => { s = String(s ?? ''); return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…'; };
const SRC = (ui, M) => ui.source('Value-creation case set (sponsor and company releases, SEC and Companies House filings, trade press)', null, asOf(M?.retrieved || '2026-10-06'));

let _model = null, _indexed = false;
function load(ctx) {
  if (!_model) _model = ctx.data.research('value_creation_cases').then(L.build).catch(() => null);
  return _model.then(M => {
    if (M && !_indexed) {
      _indexed = true;
      ctx.app.index([
        ...M.cases.map(c => ({ label: c.short, sub: `${c.sectorLabel} · ${c.chainShort}`, href: `#/cases/timeline?case=${c.id}`, kind: 'Case', color: COLOR })),
        ...M.levers.map(l => ({ label: L.dash(l.name), sub: `Lever · ${l.cases.length} cases`, href: `#/cases/levers?lever=${l.id}`, kind: 'Lever', color: COLOR })),
        ...M.steps.map(s => ({ label: `Punctual Pros step ${s.step}: ${s.title}`, sub: `${L.mLabel(s.a)} – ${L.mLabel(s.b)} · ${s.statusLabel}`, href: `#/cases/sequence?step=${s.step}`, kind: 'Sequence', color: COLOR })),
      ]);
    }
    return M;
  });
}
const missing = ui => ui.note('Research dataset not yet available: the value-creation case set could not be loaded.', 'warn');
function kpis(ctx, M) {
  const st = M.stats;
  return ctx.ui.kpis([
    { label: 'Cases', value: String(st.n), sub: `${st.nHome} home services · ${st.nCross} adjacent · ${st.yearMin}–${st.yearMax}` },
    { label: 'Median hold', value: `${st.hold.toFixed(1)} yrs`, sub: `first sponsor, ${st.holdN} cases · ${st.holdHome?.toFixed(1)} in home services` },
    { label: 'Median exit multiple', value: `~${L.xTimes(st.exitMult)}${EST}`, sub: `EBITDA, press-reported, ${st.exitMults.length} cases` },
    { label: 'Median revenue growth', value: `~${L.xTimes(st.growth)}${EST}`, sub: `over the hold, ${st.growthN} sourced pairs` },
    { label: 'Punctual Pros', value: `month ${st.pp?.hold_month_on_2026_10_06 ?? 30}`, sub: `of BSP's hold · first add-on month ${st.pp?.first_addon_month ?? 8}`, color: 'var(--co-pp)' },
  ]);
}

/* ── inspector ────────────────────────────────────────────────────────────── */
function openCase(ctx, M, c) {
  const { ui, inspector } = ctx;
  inspector.open({
    title: esc(c.short), sub: `${esc(c.sectorLabel)} · ${esc(c.statusLabel)}`, color: COLOR,
    sections: [
      { label: 'Owners', html: `<div class="small text-2">${esc(c.chain)}</div>` },
      { label: 'Entry and exit', html: ui.kv({ Entry: esc(c.entry?.label || '—'), Exit: c.exit ? `${esc(c.exit.label)} · ${esc(c.buyerShort)}` : esc(c.statusLabel), Hold: c.hold != null ? `${L.yrs(c.hold)}${c.exit ? '' : ' so far'}` : '—', 'Exit value': c.exit_ev_usd ? `${L.usd(c.exit_ev_usd)}${c.evEst ? EST : ''}` : '—', 'Exit multiple': c.exit_multiple_ebitda ? `~${L.xTimes(c.exit_multiple_ebitda)} EBITDA${EST}` : '—', 'Revenue growth': c.growth != null ? `${L.xTimes(c.growth)}${EST}` : '—', Returns: c.moic ? esc(c.moic) : '—', Evidence: `${esc(L.capFirst(c.confidence || ''))}: ${esc(c.basis)}` }) },
      { label: 'Before and after', html: `<div class="m-cases">${L.kpiCardsHTML(c)}</div>` },
      { label: 'What BSP can copy at Punctual Pros', html: `<div class="m-cases"><p class="sys-note sys-note--co cs-copy" data-co="pp">${esc(c.copy)}</p></div>` },
      { label: `Dated events (${c.events.length})`, html: `<div class="col gap-4 small">${c.events.map(e => `<div><span class="sys-num dim">${esc(e.w.label)}</span> · <b>${esc(e.type)}</b> — ${esc(clip(e.event, 160))} ${e.source_url ? ext(e.source_url) : ''}</div>`).join('')}</div>` },
      { label: 'Levers used', html: `<div class="sys-chips">${c.levers.map(l => stChip(l, '')).join('')}</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${(c.sources || []).map(u => ext(u)).join('')}</div>` },
    ],
    actions: [{ label: 'Timeline', href: `#/cases/timeline?case=${c.id}` }, { label: 'Public page ↗', href: `${PAGE}#case=${c.id}` }, ...(c.portal ? [{ label: c.portal.label, href: L.hrefFor(c.portal, '') }] : [])],
  });
}
function openLever(ctx, M, l, focus) {
  const ev = l.evidence.slice().sort((a, b) => (a.w?.t0 ?? 9999) - (b.w?.t0 ?? 9999));
  ctx.inspector.open({
    title: esc(L.dash(l.name)), sub: `Lever · used in ${l.cases.length} of ${M.stats.n} cases`, color: COLOR,
    sections: [
      { label: 'What it is', html: `<div class="small text-2">${esc(l.desc)}</div>` },
      { label: 'Effect and timing', html: ctx.ui.kv({ 'KPI it moved': esc(l.kpi || '—'), 'Typical timing': esc(L.capFirst(L.timingText(l))), 'Typical magnitude': esc(l.magnitude || '—') }) },
      { label: 'For Punctual Pros', html: `<div class="m-cases"><p class="sys-note sys-note--co cs-copy" data-co="pp">${esc(l.pp)}</p></div>${l.links.length ? `<div class="col gap-4 small mt-8">${l.links.map(x => `<a href="${esc(L.hrefFor(x, ''))}">${esc(x.label)} →</a>`).join('')}</div>` : ''}` },
      { label: `Evidence (${ev.length})`, html: `<div class="m-cases col gap-4 small">${ev.map(e => `<div${focus === e.case ? ' class="cs-focus"' : ''}><b>${esc(M.byId[e.case]?.short || '—')}</b> <span class="sys-num dim">${esc(e.dateLabel || '')}${e.months_from_entry != null ? ` · month ${Math.round(e.months_from_entry)}` : ''}</span> — ${esc(e.fact)} ${ext(e.source_url)}</div>`).join('')}</div>` },
      { label: 'Cases', html: l.cases.map(id => `<a href="#/cases/timeline?case=${esc(id)}">${esc(M.byId[id].short)}</a>`).join(', ') },
    ],
    actions: [{ label: 'Lever matrix', href: `#/cases/levers?lever=${l.id}` }, { label: 'Public page ↗', href: `${PAGE}#levers` }],
  });
}
function openPattern(ctx, M, p) {
  ctx.inspector.open({
    title: esc(L.dash(L.capFirst(p.name))), sub: `Pattern · ${p.cases.length} cases · Punctual Pros: ${esc(p.chip)}`, color: COLOR,
    sections: [
      { label: 'Pattern', html: `<div class="small text-2">${esc(p.desc)}</div>` },
      { label: 'Punctual Pros today', html: `<div class="small text-2">${esc(p.status)}</div>` },
      { label: 'Next step', html: `<div class="m-cases"><p class="sys-note sys-note--co cs-copy" data-co="pp">${esc(p.next)}</p></div>` },
      { label: 'Evidence', html: `<div class="col gap-4 small">${p.evidence.map(e => `<div><b>${esc(M.byId[e.case]?.short || '—')}</b> <span class="sys-num dim">${esc(e.dateLabel || '')}</span> — ${esc(e.fact)} ${ext(e.source_url)}</div>`).join('')}${p.counter.map(x => `<div><b>Counter-example · ${esc(M.byId[x.case]?.short || '')}</b> — ${esc(x.note)} ${ext(x.source_url)}</div>`).join('')}</div>` },
    ],
    actions: [{ label: 'Sequence', href: '#/cases/sequence' }],
  });
}
function openStep(ctx, M, s) {
  const pats = s.pats.map(id => M.patterns.find(p => p.id === id)).filter(Boolean);
  ctx.inspector.open({
    title: `Step ${s.step} · ${esc(s.title)}`, sub: `${esc(s.statusLabel)} · ${esc(L.mLabel(s.a))} – ${esc(L.mLabel(s.b))} · hold months ${s.hold_month_start}–${s.hold_month_end}`, color: COLOR,
    sections: [
      { label: 'Action', html: `<div class="small text-2">${esc(s.action)}</div>` },
      s.bench ? { label: 'Benchmark', html: `<div class="small text-2">${esc(s.bench)}${s.done ? '' : EST}</div>` } : null,
      { label: 'Borrowed from', html: s.borrows.map(id => `<a href="#/cases/timeline?case=${esc(id)}">${esc(M.byId[id].short)}</a>`).join(', ') || '—' },
      { label: 'Patterns it follows', html: `<div class="col gap-4 small">${pats.map(p => `<div>${esc(L.dash(L.capFirst(p.name)))}</div>`).join('')}</div>` },
      { label: 'Supporting views', html: `<div class="col gap-4 small">${s.refs.map(x => `<a href="${esc(L.hrefFor(x, ''))}">${esc(x.label)} →</a>`).join('') || '—'}</div>` },
      (s.xrefs || []).length ? { label: 'Sources', html: `<div class="col gap-4 small">${s.xrefs.filter(x => x.source_url).map(x => ext(x.source_url)).join('')}</div>` } : null,
    ].filter(Boolean),
    actions: s.refs.slice(0, 2).map(x => ({ label: x.label, href: L.hrefFor(x, '') })),
  });
}
function openEvent(ctx, M, key) {
  const [id, i] = String(key).split(':'); const lane = id === 'pp' ? M.ppLane : M.byId[id]; const e = lane?.events.find(x => String(x.i) === i);
  if (!e) return;
  const mo = lane.entry ? Math.round((e.w.t - lane.entry.t) * 12) : null;
  ctx.inspector.open({
    title: esc(`${lane.short} · ${e.type}`), sub: `${esc(e.w.label)}${mo != null ? ` · ${mo >= 0 ? `month ${mo} of the hold` : `${-mo} months before entry`}` : ''}`, color: (L.FAMILY[e.fam] || L.FAMILY.info).color,
    sections: [{ label: 'What happened', html: `<div class="small text-2">${esc(e.event)}</div>` }, e.metric ? { label: 'Metric', html: `<div class="sys-num small">${esc(e.metric)}</div>` } : null, { label: 'Source', html: ext(e.source_url) }].filter(Boolean),
    actions: id !== 'pp' ? [{ id: 'case', label: 'Whole case', onClick: () => openCase(ctx, M, M.byId[id]) }] : [],
  });
}

/* ── views ────────────────────────────────────────────────────────────────── */
const TS = { primary: 'case-ch', compare: ['case-si'], mode: 'aligned', showPP: true, hidden: new Set() };

async function timeline(ctx) {
  const { el, ui, esc: e2 } = ctx; injectCss();
  const M = await load(ctx); if (!M) { el.innerHTML = missing(ui); return; }
  if (ctx.params.case && M.byId[ctx.params.case]) { if (TS.primary !== ctx.params.case) { TS.compare = TS.compare.filter(x => x !== ctx.params.case); } TS.primary = ctx.params.case; }
  if (ctx.params.compare) TS.compare = ctx.params.compare.split(',').filter(x => M.byId[x] && x !== TS.primary).slice(0, 2);
  const opts = L.SECTOR_ORDER.map(s => { const cs = M.cases.filter(c => c.sector === s); return cs.length ? `<optgroup label="${esc(L.SECTOR[s])}">${cs.map(c => `<option value="${esc(c.id)}">${esc(c.short)}</option>`).join('')}</optgroup>` : ''; }).join('');
  el.innerHTML = `<div class="m-cases">${ui.pageHead({
    title: 'Case timelines',
    sub: `<b>${M.stats.n} sponsor-built companies, ${M.stats.events} dated moves.</b> Winners bought the first add-on near month ${M.stats.firstAddon?.median ?? 7}, then one every ~${M.stats.cadence?.median ?? 4.6} months. Punctual Pros is at month ${M.stats.pp?.hold_month_on_2026_10_06 ?? 30}.`,
    chips: `${ctx.fmt.chip('Releases, filings, trade press')}${ctx.fmt.chip('Months from sponsor entry')}`,
    actions: `<a class="${btn(ui)}" href="${PAGE}" target="_blank" rel="noopener">Public page ↗</a>`,
  })}${kpis(ctx, M)}
  <div class="mt-12">${ui.panel({ title: 'Dated events by case', sub: 'Pick a case, compare up to two more, align by months from entry · click a dot for the event', body: `
    <div class="sys-filters cs-ctl"><label class="sys-field"><span class="sys-field-label">Case</span><select class="sys-input" id="cs-pick">${opts}</select></label><label class="sys-field"><span class="sys-field-label">Compare</span><select class="sys-input" id="cs-add"><option value="">Add a case…</option>${opts}</select></label><div class="sys-chips cs-cmp" id="cs-cmp"></div>
      <div class="sys-chips cs-seg" role="group" aria-label="Time axis"><button type="button" class="sys-chip" data-mode="aligned">Months from entry</button><button type="button" class="sys-chip" data-mode="calendar">Calendar</button></div>
      <label class="sys-chip cs-check"><input type="checkbox" id="cs-pp" ${TS.showPP ? 'checked' : ''}> Punctual Pros lane</label></div>
    <div id="cs-legend" class="mt-8"></div><div id="cs-tl" class="mt-12"></div>`, foot: SRC(ui, M) })}</div>
  <div class="grid grid-main mt-12">
    <div>${ui.panel({ title: 'Event log', sub: 'Chronological across the selected cases · sortable · CSV', body: '<div id="cs-ev"></div>', foot: SRC(ui, M) })}</div>
    <div>${ui.panel({ title: 'Before and after', sub: 'Disclosed KPI moves for the selected case', body: '<div id="cs-kpi"></div>', foot: SRC(ui, M) })}</div>
  </div></div>`;
  const $ = s => el.querySelector(s);
  let tbl = null;
  const render = () => {
    const cs = [TS.primary, ...TS.compare].map(id => M.byId[id]).filter(Boolean);
    const lanes = TS.showPP ? [...cs, M.ppLane] : cs;
    $('#cs-pick').value = TS.primary;
    el.querySelectorAll('.cs-seg [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === TS.mode)));
    $('#cs-cmp').innerHTML = TS.compare.map(id => `<span class="sys-chip cs-cmp-chip">${esc(M.byId[id].short)}<button type="button" data-rm="${esc(id)}" aria-label="Remove ${esc(M.byId[id].short)} from the comparison">×</button></span>`).join('');
    $('#cs-legend').innerHTML = L.legendHTML(TS.hidden, true);
    $('#cs-tl').innerHTML = L.timelineHTML(lanes, { mode: TS.mode, hidden: TS.hidden });
    const rows = cs.flatMap(c => c.events.filter(x => !TS.hidden.has(x.fam)).map(x => ({ id: `${c.id}:${x.i}`, t: x.w.t0, date: x.w.label, company: c.short, type: x.type, fam: x.fam, event: x.event, metric: x.metric, source: x.source_url || '' })));
    const cols = [
      { key: 't', label: 'When', num: true, fmt: (v, r) => e2(r.date) },
      { key: 'company', label: 'Case' },
      { key: 'type', label: 'Type', fmt: (v, r) => `<span class="cs-type" style="--c:${(L.FAMILY[r.fam] || L.FAMILY.info).color}"><i></i>${e2(v)}</span>` },
      { key: 'event', label: 'What happened', wrap: true, fmt: (v, r) => `${e2(clip(v, 150))}${r.metric ? `<div class="dim small sys-num">${e2(r.metric)}</div>` : ''}` },
      { key: 'source', label: 'Source', fmt: v => v ? ext(v) : '—' },
    ];
    if (tbl) tbl.update(rows); else tbl = ui.table($('#cs-ev'), { columns: cols, rows, pageSize: 14, sortKey: 't', sortDir: 1, exportName: 'value_creation_events', onRow: r => openEvent(ctx, M, r.id) });
    const c = M.byId[TS.primary];
    $('#cs-kpi').innerHTML = `<div class="small strong">${esc(c.name)}</div><div class="small dim mt-4">${esc(c.chain)}</div><div class="mt-12">${L.kpiCardsHTML(c)}</div><p class="sys-note sys-note--co cs-copy mt-12" data-co="pp"><b>What BSP can copy.</b> ${esc(c.copy)}</p><div class="mt-12"><button class="${btn(ui, 'sm')}" type="button" id="cs-open">Case detail</button></div>`;
    $('#cs-open').onclick = () => openCase(ctx, M, c);
  };
  $('#cs-pick').onchange = ev => { TS.primary = ev.target.value; TS.compare = TS.compare.filter(x => x !== TS.primary); render(); };
  $('#cs-add').onchange = ev => { const v = ev.target.value; ev.target.value = ''; if (v && v !== TS.primary && !TS.compare.includes(v)) { TS.compare = [...TS.compare, v].slice(-2); render(); } };
  $('#cs-pp').onchange = ev => { TS.showPP = ev.target.checked; render(); };
  const onClick = ev => {
    const m = ev.target.closest('.cs-seg [data-mode]'); if (m) { TS.mode = m.dataset.mode; render(); return; }
    const rm = ev.target.closest('[data-rm]'); if (rm) { TS.compare = TS.compare.filter(x => x !== rm.dataset.rm); render(); return; }
    const f = ev.target.closest('[data-fam]'); if (f) { const k = f.dataset.fam; TS.hidden.has(k) ? TS.hidden.delete(k) : TS.hidden.add(k); if (TS.hidden.size === Object.keys(L.FAMILY).length) TS.hidden.clear(); render(); return; }
    const dot = ev.target.closest('[data-ev]'); if (dot) { el.querySelectorAll('.cs-tl-ev.is-sel').forEach(x => x.classList.remove('is-sel')); dot.classList.add('is-sel'); openEvent(ctx, M, dot.dataset.ev); }
  };
  el.addEventListener('click', onClick);
  render();
  return () => el.removeEventListener('click', onClick);
}

async function levers(ctx) {
  const { el, ui, esc: e2 } = ctx; injectCss();
  const M = await load(ctx); if (!M) { el.innerHTML = missing(ui); return; }
  const top = M.levers[0];
  const early = M.levers.filter(l => l.range && l.range[0] >= 0).sort((a, b) => a.range[0] - b.range[0] || (a.med ?? 99) - (b.med ?? 99))[0];
  const behind = M.patterns.filter(p => p.tone === 'bad');
  el.innerHTML = `<div class="m-cases">${ui.pageHead({
    title: 'Value-creation levers',
    sub: `<b>Eighteen levers across ${M.stats.n} cases;</b> the most common is ${esc(L.dash(top.name).split(' (')[0].replace(/^[A-Z](?=[a-z])/, m => m.toLowerCase()))} (${top.cases.length} cases). ${behind.length ? `Punctual Pros trails on ${behind.length} pattern${behind.length === 1 ? '' : 's'}.` : 'Punctual Pros trails on none.'}`,
    chips: `${ctx.fmt.chip('Dated evidence per case')}${ppChip('Applied to Punctual Pros')}`,
  })}${ui.kpis([
    { label: 'Levers', value: String(M.levers.length), sub: `${M.levers.reduce((a, l) => a + l.evidence.length, 0)} evidence rows` },
    { label: 'Most used', value: String(top.cases.length), sub: clip(L.dash(top.name), 46) },
    { label: 'Earliest', value: early ? `month ${early.range[0]}` : '—', sub: early ? clip(early.name, 46) : '—' },
    { label: 'Patterns', value: String(M.patterns.length), sub: `${M.patterns.filter(p => p.tone === 'good').length} done or clear for Punctual Pros`, color: 'var(--sys-good)' },
    { label: 'Behind', value: String(behind.length), sub: 'patterns where Punctual Pros trails', color: 'var(--sys-bad)' },
  ])}
  <div class="mt-12">${ui.panel({ title: 'Lever × case matrix', sub: 'Solid = dated move (more saturated = earlier in the hold) · hollow = used, date not disclosed · click a lever, dot or case', body: '<div id="cs-mx"></div>', foot: SRC(ui, M) })}</div>
  <div class="mt-12">${ui.panel({ title: 'Levers: evidence, timing and Punctual Pros applicability', sub: 'Sortable · click a row for the evidence and supporting views · CSV', body: '<div id="cs-lv"></div>', foot: SRC(ui, M) })}</div>
  <div class="mt-12">${ui.panel({ title: 'Chronological patterns on the hold clock', sub: 'Window in months from entry · colour = Punctual Pros status · dotted line = Punctual Pros today', body: '<div id="cs-ck"></div>', foot: SRC(ui, M) })}</div></div>`;
  const $ = s => el.querySelector(s);
  $('#cs-mx').innerHTML = L.matrixHTML(M, { selected: ctx.params.lever || null });
  $('#cs-ck').innerHTML = L.clockHTML(M);
  const rows = M.levers.map(l => ({ id: l.id, name: L.dash(l.name), n: l.cases.length, ev: l.evidence.length, start: l.range ? l.range[0] : null, timing: L.timingText(l, true), kpi: l.kpi, pp: l.pp, links: l.links.map(x => x.label).join('; '), _l: l }));
  ui.table($('#cs-lv'), { rows, pageSize: 20, sortKey: 'n', exportName: 'value_creation_levers', onRow: r => openLever(ctx, M, r._l), columns: [
    { key: 'name', label: 'Lever', wrap: true, fmt: v => `<b>${e2(v)}</b>` },
    { key: 'n', label: 'Cases', num: true }, { key: 'ev', label: 'Evidence', num: true },
    { key: 'start', label: 'Timing', fmt: (v, r) => `<span class="small">${e2(r.timing)}</span>` },
    { key: 'kpi', label: 'KPI moved', wrap: true, fmt: v => `<span class="small text-2">${e2(clip(v, 80))}</span>` },
    { key: 'pp', label: 'Punctual Pros applicability', wrap: true, fmt: v => `<span class="small text-2">${e2(clip(v, 150))}</span>` },
    { key: 'links', label: 'Supporting views', wrap: true, fmt: (v, r) => r._l.links.map(x => `<a class="small" href="${e2(L.hrefFor(x, ''))}" onclick="event.stopPropagation()">${e2(x.label)}</a>`).join('<br>') || '—' },
  ] });
  const onClick = ev => {
    const lv = ev.target.closest('[data-lever]'); if (lv) { openLever(ctx, M, M.levers.find(l => l.id === lv.dataset.lever)); return; }
    const cell = ev.target.closest('[data-cell]'); if (cell) { const [l, c] = cell.dataset.cell.split('|'); openLever(ctx, M, M.levers.find(x => x.id === l), c); return; }
    const cs = ev.target.closest('[data-case]'); if (cs) { openCase(ctx, M, M.byId[cs.dataset.case]); return; }
    const p = ev.target.closest('[data-pat]'); if (p) openPattern(ctx, M, M.patterns.find(x => x.id === p.dataset.pat));
  };
  el.addEventListener('click', onClick);
  if (ctx.params.lever) { const l = M.levers.find(x => x.id === ctx.params.lever); if (l) openLever(ctx, M, l); }
  return () => el.removeEventListener('click', onClick);
}

async function sequence(ctx) {
  const { el, ui, esc: e2 } = ctx; injectCss();
  const M = await load(ctx); if (!M) { el.innerHTML = missing(ui); return; }
  const fwd = M.steps.filter(s => !s.done), next12 = fwd.filter(s => s.a.t < L.when('2027-10-01').t);
  const exitStep = M.steps.find(s => /exit window/i.test(s.title));
  el.innerHTML = `<div class="m-cases">${ui.pageHead({
    title: 'The Punctual Pros sequence',
    sub: `<b>Three steps done, ${fwd.length} to go, in the order the winning cases used.</b> Next: ${esc(next12.map(s => /^[A-Z][a-z]/.test(s.title) ? s.title[0].toLowerCase() + s.title.slice(1) : s.title).slice(0, 1).join(''))}. Steps after 3 are recommendations.`,
    chips: `${ppChip('Entry: April 2024')}${ctx.fmt.chip('To September 2029')}`,
    actions: `<a class="${btn(ui)}" href="${PAGE}#sequence" target="_blank" rel="noopener">Public page ↗</a>`,
  })}${ui.kpis([
    { label: 'Hold month today', value: String(M.stats.pp?.hold_month_on_2026_10_06 ?? 30), sub: 'BSP entry Apr 3, 2024', color: 'var(--co-pp)' },
    { label: 'Done', value: String(M.steps.filter(s => s.done).length), sub: 'entry · ServiceTitan · Horvath (month 8)', color: 'var(--sys-good)' },
    { label: 'Next 12 months', value: String(next12.length), sub: 'recommended steps starting before Oct 2027' },
    { label: 'Home-services median hold', value: `${M.stats.holdHome?.toFixed(1)} yrs`, sub: `≈ ${L.monthLabel(M.ppLane.entry.t + (M.stats.holdHome || 4))} for Punctual Pros` },
    { label: 'Exit window', value: exitStep ? `${L.mLabel(exitStep.a)}` : '—', sub: exitStep ? `option, to ${L.mLabel(exitStep.b)}` : '' },
  ])}
  <div class="mt-12">${ui.panel({ title: '36-month plan', sub: 'Bars = recommended window (text = hold months) · dashed = option · click a step for the action, benchmark, precedent cases and supporting views', body: '<div id="cs-g"></div>', foot: ui.source('Value-creation case set (Punctual Pros sequence), Punctual Pros public filings, OS program evidence, nationwide plan', null, asOf(M.retrieved)) })}</div>
  <div class="mt-12">${ui.panel({ title: 'Steps', sub: 'Sortable · CSV · click for detail', body: '<div id="cs-st"></div>', foot: SRC(ui, M) })}</div></div>`;
  const $ = s => el.querySelector(s);
  $('#cs-g').innerHTML = L.ganttHTML(M, { root: '', selected: ctx.params.step != null ? Number(ctx.params.step) : null });
  const rows = M.steps.map(s => ({ id: s.step, step: s.step, title: s.title, start: s.a.t, when: `${L.mLabel(s.a)} – ${L.mLabel(s.b)}`, months: `${s.hold_month_start}–${s.hold_month_end}`, status: s.statusLabel, bench: s.bench, borrows: s.borrows.map(id => M.byId[id].short).join(', '), views: s.refs.map(r => r.label).join('; '), _s: s }));
  ui.table($('#cs-st'), { rows, pageSize: 20, sortKey: 'step', sortDir: 1, exportName: 'punctual_pros_sequence', onRow: r => openStep(ctx, M, r._s), columns: [
    { key: 'step', label: '#', num: true }, { key: 'title', label: 'Step', wrap: true, fmt: v => `<b>${e2(v)}</b>` },
    { key: 'start', label: 'When', fmt: (v, r) => `<span class="small">${e2(r.when)}</span>` }, { key: 'months', label: 'Hold months', num: true },
    { key: 'status', label: 'Status', fmt: v => stChip(v, v === 'Done' ? 'good' : v === 'Option' ? 'warn' : 'info') },
    { key: 'bench', label: 'Benchmark', wrap: true, fmt: (v, r) => v ? `<span class="small text-2">${e2(clip(v, 110))}</span>${r._s.done ? '' : EST}` : '—' },
    { key: 'borrows', label: 'Borrowed from', wrap: true, fmt: v => `<span class="small">${e2(v || '—')}</span>` },
    { key: 'views', label: 'Supporting views', wrap: true, fmt: (v, r) => r._s.refs.map(x => `<a class="small" href="${e2(L.hrefFor(x, ''))}" onclick="event.stopPropagation()">${e2(x.label)}</a>`).join('<br>') || '—' },
  ] });
  const onClick = ev => { const b = ev.target.closest('[data-step]'); if (b) { const s = M.steps.find(x => x.step === Number(b.dataset.step)); if (s) openStep(ctx, M, s); } };
  el.addEventListener('click', onClick);
  if (ctx.params.step != null) { const s = M.steps.find(x => x.step === Number(ctx.params.step)); if (s) openStep(ctx, M, s); }
  return () => el.removeEventListener('click', onClick);
}

async function entryExit(ctx) {
  const { el, ui, esc: e2 } = ctx; injectCss();
  const M = await load(ctx); if (!M) { el.innerHTML = missing(ui); return; }
  const sold = M.cases.filter(c => c.exit), toSponsor = sold.filter(c => c.hold_status !== 'ipo' && !/^Avantor/i.test(c.buyer || '') && /partners|capital|blackstone|kkr|apollo|goldman|carlyle|omers|tpg|bci|lgt|broad sky|bsp\b|harvest|jordan|altas|stone point|new mountain|investcorp|leonard green|baypine|gi /i.test(c.buyer || ''));
  el.innerHTML = `<div class="m-cases">${ui.pageHead({
    title: 'Entry to exit',
    sub: `<b>${toSponsor.length} of ${sold.length} dated exits went to another sponsor</b> after a median ${M.stats.hold.toFixed(1)}-year hold. Scaled home-services companies sold near ~${L.xTimes(M.stats.exitMult)} against ~6–7x for small deals.`,
    chips: `${stChip('Press-reported values are estimates', 'warn')}${ctx.fmt.chip('First-sponsor hold')}`,
    actions: `<a class="${btn(ui)}" href="${PAGE}#entry-exit" target="_blank" rel="noopener">Public page ↗</a>`,
  })}${kpis(ctx, M)}
  <div class="mt-12" id="cs-flt"></div>
  <div class="mt-12">${ui.panel({ title: 'Entry and exit by case', sub: 'Sortable · click a row for the full case · CSV', body: '<div id="cs-ee"></div>', foot: SRC(ui, M) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'The multiple ladder', sub: 'What small deals cost vs what scaled companies sold for (EBITDA multiples)', body: L.ladderHTML(M), foot: ui.source('GF Data via Middle Market Growth and ACG; Champions and Sila press-reported', null, asOf(M.retrieved)) })}
    ${ui.panel({ title: 'Revenue growth during the hold', sub: 'Log scale · sourced before and after pairs only · several not like-for-like', body: L.growthHTML(M), foot: SRC(ui, M) })}
  </div></div>`;
  const $ = s => el.querySelector(s);
  const rowsAll = M.cases.map(c => ({ id: c.id, company: c.short, sector: c.sectorLabel, owners: c.chainShort, entry: c.entry?.t ?? null, exit: c.exit?.t ?? null, hold: c.hold, status: c.statusLabel, buyer: c.buyerShort, ev: c.exit_ev_usd ?? null, mult: c.exit_multiple_ebitda ?? null, growth: c.growth, confidence: c.confidence, _c: c }));
  const t = ui.table($('#cs-ee'), { rows: rowsAll, pageSize: 40, sortKey: 'entry', sortDir: 1, exportName: 'value_creation_entry_exit', onRow: r => openCase(ctx, M, r._c), columns: [
    { key: 'company', label: 'Company', fmt: (v, r) => `<b>${e2(v)}</b><div class="dim small">${e2(r.sector)}</div>` },
    { key: 'owners', label: 'Owners', wrap: true, fmt: v => `<span class="small">${e2(v)}</span>` },
    { key: 'entry', label: 'Entry', num: true, fmt: (v, r) => e2(r._c.entry ? L.mLabel(r._c.entry) : '—') },
    { key: 'exit', label: 'Exit', num: true, fmt: (v, r) => e2(r._c.exit ? L.mLabel(r._c.exit) : '—') },
    { key: 'hold', label: 'Hold (yrs)', num: true, fmt: (v, r) => v == null ? '—' : `${v.toFixed(1)}${r._c.exit ? '' : ' <span class="dim small">so far</span>'}` },
    { key: 'status', label: 'Outcome', wrap: true, fmt: (v, r) => `${e2(v)}${r.buyer ? `<div class="dim small">${r._c.exit && r._c.hold_status !== 'ipo' ? 'to ' : ''}${e2(r.buyer)}</div>` : ''}` },
    { key: 'ev', label: 'Exit value', num: true, fmt: (v, r) => v ? `${L.usd(v)}${r._c.evEst ? EST : ''}` : '—' },
    { key: 'mult', label: 'Exit multiple', num: true, fmt: v => v ? `~${L.xTimes(v)}${EST}` : '—' },
    { key: 'growth', label: 'Revenue growth', num: true, fmt: v => v != null ? `${L.xTimes(v)}${EST}` : '—' },
    { key: 'confidence', label: 'Evidence', fmt: v => stChip(L.capFirst(v || '—'), v === 'high' ? 'good' : v === 'medium' ? 'info' : 'warn') },
  ] });
  ui.seg($('#cs-flt'), [{ value: 'all', label: 'All' }, { value: 'home', label: 'Home services' }, ...['commercial_services', 'legal_services', 'lab_distribution', 'agency', 'consumer'].map(k => ({ value: k, label: L.SECTOR[k] }))], 'all',
    v => t.update(rowsAll.filter(r => v === 'all' || (v === 'home' ? r._c.home : r._c.sector === v))));
  const onClick = ev => { const b = ev.target.closest('[data-case]'); if (b) openCase(ctx, M, M.byId[b.dataset.case]); };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

export default {
  id: 'cases', name: 'Value-creation cases', tag: 'Peers', color: COLOR, group: 'Intelligence',
  tagline: 'How sponsors built and sold companies like Punctual Pros: dated case timelines, levers, entry and exit, and the 36-month sequence for Punctual Pros',
  hq: { lat: 40.7536, lon: -73.9832, label: 'BSP, New York, NY' },
  views: [
    { id: 'timeline', name: 'Timelines', icon: '⇢', render: timeline },
    { id: 'levers', name: 'Levers', icon: '▦', render: levers },
    { id: 'sequence', name: 'PP sequence', icon: '☰', render: sequence },
    { id: 'exits', name: 'Entry → exit', icon: '$', render: entryExit },
  ],
  tour: [
    { order: 930, hash: '#/cases/timeline', caption: '<b>Sponsor precedents.</b> Thirty-four sponsor-built companies on one clock, with Punctual Pros at month thirty.', narration: 'Thirty-four sponsor-built companies on one clock. Punctual Pros sits at month thirty.' },
    { order: 931, hash: '#/cases/levers', caption: '<b>Levers.</b> Operator team first, first add-on near month seven, then a deal every four to five months.', narration: 'Operator team first, the first add-on near month seven, then a deal every four to five months.' },
    { order: 932, hash: '#/cases/sequence', caption: '<b>The Punctual Pros sequence.</b> Three steps done, twelve recommended over 36 months.', narration: 'For Punctual Pros, a thirty-six month sequence: integration leader, one contact center, memberships, steady tuck-ins.' },
  ],
};
