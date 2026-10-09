/* Value-creation cases — "How sponsors built and sold companies like Punctual Pros".
   Data: data/research/value_creation_cases.json via the shared model in modules/cases-lib.js.
   Sections: hero KPIs + six moves, timeline explorer (compare up to 3, PP lane), entry → exit table
   with the multiple ladder and growth chart, lever × case matrix, hold clock of patterns, the
   Punctual Pros 36-month sequence, method and sources. Also returns grounded chat intents + FAQ. */
import {
  build, esc, clean, when, monthLabel, mLabel, dash, capFirst, median, usd, xTimes, yrs, host, hrefFor, kpiVal,
  FAMILY, SECTOR, SECTOR_ORDER, TODAY, timingText, legendHTML, timelineHTML, matrixHTML, clockHTML, ganttHTML, ladderHTML, ladderRows, growthHTML, kpiCardsHTML, csv, download, eventRows,
} from '../modules/cases-lib.js?v=20261009155255';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ROOT = '../';
const EST = '<span class="sys-est">est.</span>';
const ext = (u, label) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}" aria-label="${esc(`${label || host(u)} (opens in a new tab)`)}">${esc(label || host(u))} ↗</a>` : '';
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollTo = el => el?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });

let M = null;
const S = { primary: 'case-ch', compare: ['case-si'], mode: 'aligned', showPP: true, hidden: new Set(), sel: null, sort: { k: 'entry', d: 1 }, filter: 'all', lever: null, pat: 'pat-04', step: 3 };

export async function boot({ Data }) {
  const d = await Data.research('value_creation_cases');
  M = build(d);
  if (!M) {
    const warn = '<div class="sys-note sys-note--warn"><span><b>Data not available.</b> The value-creation cases could not be loaded, so this section is empty.</span></div>';
    ['#hero-kpis', '#tl', '#ee-table', '#matrix', '#clock', '#gantt'].forEach(s => { const el = $(s); if (el) el.outerHTML = warn; });
    return { faq: [], intents: [] };
  }
  S.lever = M.levers[0]?.id || null;
  const parts = [hero, explorer, entryExit, levers, patterns, sequence, sources];
  for (const p of parts) { try { p(); } catch (e) { console.warn('[cases] section failed', p.name, e); } }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  return { faq: faq(), intents: intents() };
}

/* ── hero ─────────────────────────────────────────────────────────────────── */
function hero() {
  const st = M.stats;
  const k = (label, value, sub, co) => `<div class="sys-kpi" role="listitem"${co ? ` data-co="${co}"` : ''}><span class="sys-kpi-label">${esc(label)}</span><span class="sys-kpi-value">${value}</span><span class="sys-kpi-sub">${sub}</span></div>`;
  $('#hero-kpis').innerHTML = [
    k('Cases', String(st.n), `${st.nHome} home services, ${st.nCross} adjacent sectors · ${st.yearMin}–${st.yearMax}`),
    k('Median hold', `${st.hold.toFixed(1)} yrs`, `First sponsor, ${st.holdN} exits`),
    k('Median exit multiple', `~${xTimes(st.exitMult)}${EST}<small>n=${st.exitMults.length}</small>`, 'EBITDA, press-reported'),
    k('Median revenue growth', `~${xTimes(st.growth)}${EST}`, `Across the hold, ${st.growthN} sourced cases`),
  ].join('');
  $('#hero-src').innerHTML = `<b>Source:</b> Value-creation case set: ${st.events} dated events from sponsor and company releases, SEC and Companies House filings and trade press, retrieved ${esc(monthLabel(when(M.retrieved).t))}. Exit multiples and growth are estimates.`;

  const MOVES = [['pat-01', 'Put an operator team in charge'], ['pat-02', 'Buy the first add-on early, close to home'], ['pat-04', 'Keep tuck-ins coming every few months'], ['pat-03', 'Run every brand on one system'], ['pat-06', 'Build recurring members buyers pay for'], ['pat-07', 'Own the technician pipeline']];
  $('#moves').innerHTML = `<p class="cs-moves-h">The six moves, in order</p><ol class="cs-moves-list">${MOVES.map(([id, title], i) => {
    const p = M.patterns.find(x => x.id === id); if (!p) return '';
    const win = (p.pattern.split(':')[0] || '').replace(/(\d)-(\d)/g, '$1–$2');
    const ex = p.evidence.find(e => e.fact && M.byId[e.case]);
    return `<li><a href="#patterns" data-pat-link="${esc(p.id)}"><span class="cs-mv-n">${i + 1}</span><span class="cs-mv-w">${esc(win)}</span><b>${esc(title)}</b><span class="cs-mv-e">${ex ? `${esc(M.byId[ex.case]?.short || '')}: ${esc(ex.fact)}` : ''}</span><span class="sys-chip sys-chip--soft" data-co="pp">Punctual Pros · ${esc(p.chip)}</span></a></li>`;
  }).join('')}</ol>`;
  $$('#moves [data-pat-link]').forEach(a => a.addEventListener('click', () => { S.pat = a.dataset.patLink; renderPatterns(); }));

  const sents = M.narrative.split(/(?<=\.)\s+(?=[A-Z])/);
  const paras = []; for (let i = 0; i < sents.length; i += 3) paras.push(sents.slice(i, i + 3).join(' '));
  $('#story-body').innerHTML = paras.map(p => `<p>${esc(p)}</p>`).join('') + `<p class="sys-src"><b>Source:</b> Value-creation case set synthesis, Oct 2026. Every claim is tied to a dated, sourced event in the timelines below.</p>`;
}

/* ── timeline explorer ────────────────────────────────────────────────────── */
function explorer() {
  const opts = SECTOR_ORDER.map(s => { const cs = M.cases.filter(c => c.sector === s); return cs.length ? `<optgroup label="${esc(SECTOR[s])}">${cs.map(c => `<option value="${esc(c.id)}">${esc(c.short)} · ${esc(c.chainShort)}</option>`).join('')}</optgroup>` : ''; }).join('');
  $('#pick').innerHTML = opts;
  $('#add').innerHTML = `<option value="">Add a case…</option>${opts}`;
  $('#pick').addEventListener('change', e => { S.primary = e.target.value; S.compare = S.compare.filter(x => x !== S.primary); S.sel = null; renderExplorer(); });
  $('#add').addEventListener('change', e => { const v = e.target.value; e.target.value = ''; if (!v || v === S.primary || S.compare.includes(v)) return; S.compare = [...S.compare, v].slice(-2); renderExplorer(); });
  $$('.cs-seg [data-mode]').forEach(b => b.addEventListener('click', () => { S.mode = b.dataset.mode; renderExplorer(); }));
  $('#show-pp').addEventListener('change', e => { S.showPP = e.target.checked; renderExplorer(); });
  $('#cmp').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; S.compare = S.compare.filter(x => x !== b.dataset.rm); renderExplorer(); });
  $('#legend').addEventListener('click', e => { const b = e.target.closest('[data-fam]'); if (!b) return; const f = b.dataset.fam; S.hidden.has(f) ? S.hidden.delete(f) : S.hidden.add(f); if (S.hidden.size === Object.keys(FAMILY).length) S.hidden.clear(); renderExplorer(); });
  $('#tl').addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (b) selectEvent(b.dataset.ev, true); });
  $('#ev-table').addEventListener('click', e => { const tr = e.target.closest('tr[data-ev]'); if (tr && !e.target.closest('a')) selectEvent(tr.dataset.ev, false); });
  $('#ev-table').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-ev]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectEvent(tr.dataset.ev, false); } });
  $('#ev-csv').addEventListener('click', () => {
    const rows = eventRows(laneCases());
    download('value_creation_events', csv(rows, [['company', 'Company'], ['date', 'Date'], ['type', 'Event type'], ['event', 'What happened'], ['metric', 'Metric'], ['source', 'Source URL']]));
  });
  renderExplorer();
}
const laneCases = () => [S.primary, ...S.compare].map(id => M.byId[id]).filter(Boolean);
function lanes() { const l = laneCases(); return S.showPP ? [...l, M.ppLane] : l; }
function findEvent(key) {
  const [id, i] = String(key).split(':'); const lane = id === 'pp' ? M.ppLane : M.byId[id];
  return lane ? { lane, e: lane.events.find(x => String(x.i) === i) } : null;
}
function renderExplorer() {
  $('#pick').value = S.primary;
  $$('.cs-seg [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('#cmp').innerHTML = S.compare.map(id => `<span class="cs-cmp-chip">${esc(M.byId[id].short)}<button type="button" data-rm="${esc(id)}" aria-label="Remove ${esc(M.byId[id].short)} from the comparison">×</button></span>`).join('') + (S.compare.length < 2 ? `<span class="cs-cmp-hint">${S.compare.length ? 'One more slot' : 'Up to two more'}</span>` : '');
  $('#legend').innerHTML = legendHTML(S.hidden, true);
  $('#tl').innerHTML = timelineHTML(lanes(), { mode: S.mode, hidden: S.hidden, selected: S.sel });
  const all = lanes(); const n = all.reduce((a, l) => a + l.events.length, 0);
  $('#tl-src').innerHTML = `<b>Source:</b> ${all.length} timeline${all.length > 1 ? 's' : ''}, ${n} dated events from the value-creation case set. Year-only dates sit at mid-year; ranges show as bars. Shaded span = the hold.`;
  renderEventTable();
  renderCasePanel();
  renderDetail();
}
function renderEventTable() {
  const cs = laneCases(); const multi = cs.length > 1;
  const rows = cs.flatMap(c => c.events.map(e => ({ c, e }))).filter(r => !S.hidden.has(r.e.fam)).sort((a, b) => a.e.w.t0 - b.e.w.t0);
  const cols = `<thead><tr><th scope="col">When</th>${multi ? '<th scope="col">Case</th>' : ''}<th scope="col">What happened</th></tr></thead>`;
  const body = rows.map(({ c, e }) => {
    const key = `${c.id}:${e.i}`; const f = FAMILY[e.fam];
    return `<tr data-ev="${esc(key)}" tabindex="0" class="${S.sel === key ? 'is-sel' : ''}"><td class="cs-when"><span class="sys-num">${esc(e.w.label)}</span><span class="cs-type" style="--c:${f.color}"><i aria-hidden="true"></i>${esc(e.type)}</span></td>${multi ? `<td class="cs-ev-case">${esc(c.short)}</td>` : ''}<td>${esc(e.event)}${e.metric || e.source_url ? `<div class="cs-metric">${e.metric ? esc(e.metric) : ''}${e.metric && e.source_url ? ' · ' : ''}${ext(e.source_url)}</div>` : ''}</td></tr>`;
  }).join('');
  $('#ev-table').innerHTML = cols + `<tbody>${body || '<tr><td colspan="3">No events for the selected types.</td></tr>'}</tbody><caption>Source: value-creation case set, ${rows.length} events, each linked to the release or filing it came from. Retrieved Oct 2026.</caption>`;
}
function renderCasePanel() {
  const c = M.byId[S.primary]; if (!c) return;
  const exitTxt = c.exit ? `${esc(c.exit.label)}${c.buyer ? ` · ${esc(c.buyer)}` : ''}` : c.hold_status === 'held' ? 'Still held' : esc(c.statusLabel);
  const facts = [
    ['Sector', esc(c.sectorLabel)], ['Entry', c.entry ? esc(c.entry.label) : '—'], ['Exit', exitTxt],
    ['Hold', c.hold != null ? `${yrs(c.hold)}${c.exit ? '' : ' so far'}` : '—'],
    ['Exit value', c.exit_ev_usd ? `${usd(c.exit_ev_usd)}${c.evEst ? EST : ''}` : '—'],
    ['Exit multiple', c.exit_multiple_ebitda ? `~${xTimes(c.exit_multiple_ebitda)} EBITDA${EST}` : '—'],
    ['Revenue growth', c.growth != null ? `${xTimes(c.growth, 1)}${EST}` : '—'],
    ['Evidence', `${esc(cap(c.confidence || ''))} confidence`],
  ];
  $('#case-panel').innerHTML = `<div class="sys-card cs-case">
    <span class="sys-card-label">Selected case · ${esc(c.statusLabel)}</span>
    <h3 class="sys-card-title">${esc(c.name)}</h3>
    <p class="cs-chain">${esc(c.chain)}</p>
    <dl class="cs-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${c.moic ? `<p class="cs-moic"><b>Returns on the record:</b> ${esc(c.moic)}</p>` : ''}
    <h4 class="cs-sub">Before and after</h4>
    ${kpiCardsHTML(c)}
    <div class="sys-note sys-note--co" data-co="pp"><span><b>What BSP can copy at Punctual Pros.</b> ${esc(c.copy)}</span></div>
    <h4 class="cs-sub">Levers used</h4>
    <div class="sys-chips cs-lv-chips">${c.levers.map(l => `<span class="sys-chip">${esc(l)}</span>`).join('')}</div>
    <p class="sys-src"><b>Evidence:</b> ${esc(c.basis)}. ${c.sources?.length || 0} sources, retrieved ${esc(when(c.retrieved)?.label || 'Oct 2026')}.</p>
    <div class="cs-case-links"><a class="sys-btn sys-btn--secondary sys-btn--sm" href="${ROOT}app.html#/cases/timeline?case=${esc(c.id)}">Open in portal</a>${c.portal ? `<a class="sys-link" href="${esc(hrefFor(c.portal, ROOT))}">${esc(c.portal.label)} →</a>` : ''}</div>
  </div>`;
}
function selectEvent(key, scrollRow) {
  S.sel = S.sel === key ? null : key;
  $$('#tl .cs-tl-ev').forEach(b => b.classList.toggle('is-sel', b.dataset.ev === S.sel));
  $$('#ev-table tr[data-ev]').forEach(tr => tr.classList.toggle('is-sel', tr.dataset.ev === S.sel));
  renderDetail();
  if (scrollRow && S.sel) { const tr = $(`#ev-table tr[data-ev="${CSS.escape(S.sel)}"]`); const wrap = tr?.closest('.cs-ev-wrap'); if (tr && wrap) wrap.scrollTop = tr.offsetTop - 40; }
}
function renderDetail() {
  const el = $('#ev-detail'); const hit = S.sel && findEvent(S.sel);
  if (!hit?.e) { el.innerHTML = `<p class="cs-x-tip">Select a dot for the full event and its source. Hover shows a preview.</p>`; return; }
  const { lane, e } = hit; const f = FAMILY[e.fam];
  const mo = lane.entry ? Math.round((e.w.t - lane.entry.t) * 12) : null;
  el.innerHTML = `<div class="cs-evd" style="--c:${f.color}"><div class="cs-evd-h"><i aria-hidden="true"></i>${esc(lane.short)} · ${esc(e.type)} · ${esc(e.w.label)}${mo != null ? ` · ${mo >= 0 ? 'month ' + mo + ' of the hold' : Math.abs(mo) + ' months before entry'}` : ''}</div><p>${esc(e.event)}</p>${e.metric ? `<span class="cs-metric">${esc(e.metric)}</span>` : ''}${e.source_url ? `<span>${ext(e.source_url, 'Source: ' + host(e.source_url))}</span>` : ''}</div>`;
}
function openCase(id, extra) {
  if (!M.byId[id]) return;
  S.primary = id; S.compare = (extra || S.compare).filter(x => x !== id && M.byId[x]).slice(0, 2); S.sel = null;
  renderExplorer(); scrollTo($('#timeline'));
}
function fromHash() {
  const m = /^#case=([\w-]+)/.exec(location.hash);
  if (m && M.byId[m[1]]) { openCase(m[1], []); history.replaceState(null, '', '#timeline'); }
}

/* ── entry → exit ─────────────────────────────────────────────────────────── */
const GROUPS = [['all', 'All'], ['home', 'Home services'], ['commercial_services', 'Commercial'], ['legal_services', 'Legal'], ['lab_distribution', 'Lab distribution'], ['agency', 'Agencies'], ['consumer', 'Consumer']];
const EE_COLS = [
  ['short', 'Company', c => c.short], ['sponsor', 'Owners', c => c.chainShort], ['entry', 'Entry', c => c.entry?.t ?? null], ['exit', 'Exit', c => c.exit?.t ?? null],
  ['hold', 'Hold', c => c.hold], ['status', 'Outcome', c => c.statusLabel], ['ev', 'Exit value', c => c.exit_ev_usd ?? null], ['mult', 'Exit multiple', c => c.exit_multiple_ebitda ?? null], ['growth', 'Revenue growth', c => c.growth],
];
function entryExit() {
  $('#ee-filter').innerHTML = GROUPS.map(([k, l]) => `<button class="sys-chip" type="button" data-g="${k}" aria-pressed="${k === S.filter}">${esc(l)}</button>`).join('');
  $('#ee-filter').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; S.filter = b.dataset.g; $$('#ee-filter [data-g]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.g === S.filter))); renderEE(); });
  $('#ee-table').addEventListener('click', e => {
    const th = e.target.closest('button[data-sort]'); if (th) { const k = th.dataset.sort; S.sort = { k, d: S.sort.k === k ? -S.sort.d : (k === 'short' || k === 'sponsor' || k === 'status' ? 1 : -1) }; renderEE(); return; }
    const tr = e.target.closest('tr[data-case]'); if (tr && !e.target.closest('a')) openCase(tr.dataset.case);
  });
  $('#ee-table').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-case]'); if (tr && e.key === 'Enter') openCase(tr.dataset.case); });
  $('#ee-csv').addEventListener('click', () => download('value_creation_entry_exit', csv(eeRows(), [['short', 'Company'], ['sectorLabel', 'Sector'], ['chain', 'Sponsors'], [c => c.entry_date, 'Entry date'], [c => c.exit_date, 'Exit date'], [c => c.hold, 'Hold (years)'], ['statusLabel', 'Outcome'], ['buyer', 'Exit buyer'], [c => c.exit_ev_usd, 'Exit value (USD, reported)'], [c => c.exit_multiple_ebitda, 'Exit EBITDA multiple (press est.)'], [c => c.growth, 'Revenue growth (x, est.)'], ['confidence', 'Confidence'], [c => (c.sources || []).join(' '), 'Sources']])));
  renderEE();
  $('#ladder').innerHTML = ladderHTML(M);
  $('#growth').innerHTML = growthHTML(M);
  $('#growth-h').textContent = `Median growth of about ${xTimes(M.stats.growth)}, with a long tail of serial acquirers.`;
  $('#growth').addEventListener('click', e => { const b = e.target.closest('[data-case]'); if (b) openCase(b.dataset.case); });
}
const eeRows = () => M.cases.filter(c => S.filter === 'all' || (S.filter === 'home' ? c.home : c.sector === S.filter));
function renderEE() {
  const col = EE_COLS.find(c => c[0] === S.sort.k) || EE_COLS[2];
  const rows = eeRows().slice().sort((a, b) => { const x = col[2](a), y = col[2](b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * S.sort.d; });
  const num = new Set(['entry', 'exit', 'hold', 'ev', 'mult', 'growth']);
  const head = `<thead><tr>${EE_COLS.map(([k, l]) => `<th scope="col" class="${num.has(k) ? 'sys-n' : ''}" aria-sort="${S.sort.k === k ? (S.sort.d > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="cs-sort" data-sort="${k}">${esc(l)}<span aria-hidden="true">${S.sort.k === k ? (S.sort.d > 0 ? ' ▲' : ' ▼') : ''}</span></button></th>`).join('')}</tr></thead>`;
  const body = rows.map(c => `<tr data-case="${esc(c.id)}" tabindex="0" title="Open the ${esc(c.short)} timeline">
    <td><b>${esc(c.short)}</b><div class="cs-sub-t">${esc(c.sectorLabel)}</div></td>
    <td>${esc(c.chainShort)}</td>
    <td class="sys-n">${c.entry ? esc(mLabel(c.entry)) : '—'}</td>
    <td class="sys-n">${c.exit ? esc(mLabel(c.exit)) : '—'}</td>
    <td class="sys-n">${c.hold != null ? `${c.hold.toFixed(1)}${c.exit ? '' : '<span class="cs-sub-t"> so far</span>'}` : '—'}</td>
    <td>${esc(c.statusLabel)}${c.buyerShort ? `<div class="cs-sub-t" title="${esc(c.buyer)}">${c.exit && c.hold_status !== 'ipo' ? 'to ' : ''}${esc(c.buyerShort)}</div>` : ''}</td>
    <td class="sys-n">${c.exit_ev_usd ? `${usd(c.exit_ev_usd)}${c.evEst ? EST : ''}` : '—'}</td>
    <td class="sys-n">${c.exit_multiple_ebitda ? `~${xTimes(c.exit_multiple_ebitda)}${EST}` : '—'}</td>
    <td class="sys-n">${c.growth != null ? `${xTimes(c.growth, 1)}${EST}` : '—'}</td></tr>`).join('');
  $('#ee-table').innerHTML = head + `<tbody>${body}</tbody><caption>Source: value-creation case set (sponsor releases, SEC filings, trade press), retrieved Oct 2026. Hold = first sponsor in the case, in years. Exit values disclosed in filings or deal releases are shown plainly; press-reported or derived values carry est. Revenue growth uses sourced before and after figures only.</caption>`;
}

/* ── levers ───────────────────────────────────────────────────────────────── */
function levers() {
  const el = $('#matrix');
  el.innerHTML = matrixHTML(M, { selected: S.lever });
  el.addEventListener('click', e => {
    const lv = e.target.closest('[data-lever]'); if (lv) { S.lever = lv.dataset.lever; renderLever(null); return; }
    const cell = e.target.closest('[data-cell]'); if (cell) { const [l, c] = cell.dataset.cell.split('|'); S.lever = l; renderLever(c); return; }
    const cs = e.target.closest('[data-case]'); if (cs) openCase(cs.dataset.case);
  });
  renderLever(null, false);
}
function renderLever(focusCase, scroll = true) {
  const l = M.levers.find(x => x.id === S.lever); if (!l) return;
  $$('#matrix tbody tr').forEach(tr => tr.classList.toggle('is-sel', tr.querySelector(`[data-lever="${CSS.escape(l.id)}"]`) != null));
  const ev = l.evidence.slice().sort((a, b) => (a.w?.t0 ?? 9999) - (b.w?.t0 ?? 9999));
  const rows = ev.map(e => `<tr class="${focusCase === e.case ? 'is-sel' : ''}"><td><button type="button" class="cs-linkbtn" data-case="${esc(e.case)}">${esc(M.byId[e.case]?.short || '—')}</button></td><td class="sys-n">${esc(e.dateLabel || '—')}</td><td class="sys-n">${e.months_from_entry != null ? Math.round(e.months_from_entry) : '—'}</td><td>${esc(e.fact)}</td><td>${ext(e.source_url)}</td></tr>`).join('');
  const timing = capFirst(timingText(l));
  $('#lever-detail').innerHTML = `<div class="sys-card cs-lv">
    <div class="cs-lv-head"><div><span class="sys-card-label">Lever · used in ${l.cases.length} of ${M.stats.n} cases</span><h3 class="sys-card-title">${esc(dash(l.name))}</h3></div></div>
    <div class="sys-grid sys-grid--2 cs-lv-grid">
      <div><p class="cs-lv-desc">${esc(l.desc)}</p>
        <dl class="cs-facts"><div><dt>KPI it moved</dt><dd>${esc(l.kpi || '—')}</dd></div><div><dt>Typical timing</dt><dd>${esc(timing)}</dd></div><div class="cs-span"><dt>Typical magnitude</dt><dd>${esc(l.magnitude || '—')}</dd></div></dl></div>
      <div class="sys-note sys-note--co" data-co="pp"><span><b>For Punctual Pros.</b> ${esc(l.pp)}${l.links.length ? `<span class="cs-lv-links">${l.links.map(x => `<a href="${esc(hrefFor(x, ROOT))}">${esc(x.label)} →</a>`).join('')}</span>` : ''}</span></div>
    </div>
    <div class="sys-table-wrap cs-lv-tbl"><table class="sys-table"><thead><tr><th scope="col">Case</th><th scope="col" class="sys-n">When</th><th scope="col" class="sys-n">Month</th><th scope="col">Fact</th><th scope="col">Source</th></tr></thead><tbody>${rows}</tbody><caption>Source: value-creation case set; month = months from the sponsor's entry. ${esc(l.basis || '')}</caption></table></div>
  </div>`;
  $('#lever-detail').onclick = e => { const b = e.target.closest('[data-case]'); if (b) openCase(b.dataset.case); };
  if (scroll) scrollTo($('#lever-detail'));
}

/* ── patterns ─────────────────────────────────────────────────────────────── */
function patterns() {
  $('#clock').addEventListener('click', e => { const b = e.target.closest('[data-pat]'); if (b) { S.pat = b.dataset.pat; renderPatterns(true); } });
  renderPatterns(false);
}
function renderPatterns(scroll) {
  $('#clock').innerHTML = clockHTML(M, { selected: S.pat }) + `<div class="cs-ck-key"><span><i class="cs-ck-bar--good"></i>Punctual Pros: done or no stress</span><span><i class="cs-ck-bar--warn"></i>Partly done</span><span><i class="cs-ck-bar--bad"></i>Behind the cases</span><span><i></i>Not started, unknown or ongoing</span><span><i class="cs-ck-tick"></i>Median month</span></div>`;
  const p = M.patterns.find(x => x.id === S.pat); if (!p) return;
  const ev = p.evidence.slice().sort((a, b) => (a.w?.t0 ?? 9999) - (b.w?.t0 ?? 9999));
  $('#pat-detail').innerHTML = `<div class="sys-card cs-pat">
    <span class="sys-card-label">Pattern · ${p.cases.length} cases</span>
    <h3 class="sys-card-title">${esc(dash(cap(p.name)))}</h3>
    <p class="cs-lv-desc">${esc(p.desc)}</p>
    <div class="sys-grid sys-grid--2">
      <div class="sys-note sys-note--${p.tone === 'bad' ? 'bad' : p.tone === 'warn' ? 'warn' : p.tone === 'good' ? 'good' : 'info'}"><span><b>Punctual Pros today: ${esc(p.chip)}.</b> ${esc(p.status)}</span></div>
      <div class="sys-note sys-note--co" data-co="pp"><span><b>Next step.</b> ${esc(p.next)}</span></div>
    </div>
    <ul class="cs-ev-list">${ev.map(e => `<li><button type="button" class="cs-linkbtn" data-case="${esc(e.case)}">${esc(M.byId[e.case]?.short || '—')}</button> <span class="cs-sub-t">${esc(e.dateLabel || '')}${e.months_from_entry != null ? ` · month ${Math.round(e.months_from_entry)}` : ''}</span> — ${esc(e.fact)} ${ext(e.source_url)}</li>`).join('')}
      ${p.counter.map(x => `<li class="cs-counter"><b>Counter-example:</b> <button type="button" class="cs-linkbtn" data-case="${esc(x.case)}">${esc(M.byId[x.case]?.short || '—')}</button> — ${esc(x.note)} ${ext(x.source_url)}</li>`).join('')}</ul>
  </div>`;
  $('#pat-detail').onclick = e => { const b = e.target.closest('[data-case]'); if (b) openCase(b.dataset.case); };
  if (scroll) scrollTo($('#pat-detail'));
}

/* ── the Punctual Pros sequence ───────────────────────────────────────────── */
function sequence() {
  $('#gantt').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) { S.step = Number(b.dataset.step); renderSequence(true); } });
  renderSequence(false);
}
function renderSequence(scroll) {
  $('#gantt').innerHTML = ganttHTML(M, { root: ROOT, selected: S.step });
  const s = M.steps.find(x => x.step === S.step); if (!s) return;
  const pats = s.pats.map(id => M.patterns.find(p => p.id === id)).filter(Boolean);
  const src = (s.xrefs || []).filter(x => x.source_url);
  $('#step-detail').innerHTML = `<div class="sys-card cs-step">
    <span class="sys-card-label">Step ${s.step} · ${esc(s.statusLabel)} · ${esc(s.a?.label === s.b?.label ? s.a?.label : `${mLabel(s.a)} – ${mLabel(s.b)}`)} · hold month ${s.hold_month_start}${s.hold_month_end !== s.hold_month_start ? `–${s.hold_month_end}` : ''}</span>
    <h3 class="sys-card-title">${esc(s.title)}</h3>
    <p class="cs-lv-desc">${esc(s.action)}</p>
    ${s.bench ? `<p class="cs-bench"><b>Benchmark:</b> ${esc(s.bench)}${s.done ? '' : EST}</p>` : ''}
    <div class="cs-step-grid">
      <div><h4 class="cs-sub">Borrowed from</h4><div class="sys-chips">${s.borrows.map(id => `<button class="sys-chip" type="button" data-case="${esc(id)}">${esc(M.byId[id].short)}</button>`).join('')}</div></div>
      <div><h4 class="cs-sub">Patterns it follows</h4><ul class="cs-plain">${pats.map(p => `<li>${esc(dash(cap(p.name)))}</li>`).join('')}</ul></div>
      <div><h4 class="cs-sub">Supporting views</h4><div class="cs-lv-links">${s.refs.map(x => `<a href="${esc(hrefFor(x, ROOT))}">${esc(x.label)} →</a>`).join('') || '—'}</div></div>
    </div>
    ${src.length ? `<p class="sys-src"><b>Source:</b> ${src.map(x => ext(x.source_url)).join(' · ')}</p>` : ''}
  </div>`;
  $('#step-detail').onclick = e => { const b = e.target.closest('[data-case]'); if (b) openCase(b.dataset.case); };
  if (scroll) scrollTo($('#step-detail'));
}

/* ── method and sources ───────────────────────────────────────────────────── */
function sources() {
  const st = M.stats, c = st.conf || {};
  $('#method').innerHTML = `<p>${st.nHome} residential home-services and franchisor histories and ${st.nCross} cross-sector analogs (commercial and fire/life-safety services, legal services, lab distribution, agencies and consumer brands) were rebuilt from sponsor and company press releases, SEC filings, UK Companies House accounts, lender filings and trade press. Each case lists dated events, the levers used, before and after KPIs and what BSP can copy.</p>
    <p>Levers and patterns were derived from the ${st.events} dated events. Timing uses months from the first sponsor's entry; year-only dates count as mid-year. Evidence quality: ${c.high ?? '—'} cases high (filings with disclosed figures), ${c.medium ?? '—'} medium (releases and trade press) and ${c.low ?? '—'} low (few primary sources).</p>
    <p>Unknown values stay blank and show as a dash. Figures from press reports, derived ratios and analyst recommendations carry an est. badge. All pages were retrieved ${esc(when(M.retrieved)?.label || 'Oct 2026')}.</p>`;
  $('#caveats').innerHTML = M.caveats.map(x => `<li>${esc(x)}</li>`).join('');
  const all = new Set(); M.cases.forEach(cs => (cs.sources || []).forEach(u => all.add(u)));
  $('#src-count').textContent = `${all.size} unique pages across ${M.cases.length} cases`;
  $('#src-list').innerHTML = M.cases.map(cs => `<div class="cs-src-case"><h4><button type="button" class="cs-linkbtn" data-case="${esc(cs.id)}">${esc(cs.short)}</button></h4><ul class="cs-src-list">${(cs.sources || []).map(u => `<li>${ext(u)}</li>`).join('')}</ul></div>`).join('');
  $('#src-list').addEventListener('click', e => { const b = e.target.closest('[data-case]'); if (b) openCase(b.dataset.case); });
}

/* ── chat: grounded intents and FAQ ───────────────────────────────────────── */
const A = (href, label) => `<a class="ch-link" href="${esc(href)}">${esc(label)} →</a>`;
const T = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const N = v => `<span class="ch-num">${v}</span>`;
const src = u => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>` : '—';
const ALIAS = {
  'case-rr': /roto.?rooter|chemed/i, 'case-se': /service experts/i, 'case-nb': /neighborly|dwyer/i, 'case-ars': /\bars\b|rescue rooter|american residential/i, 'case-wr': /wrench/i,
  'case-tp': /turn ?point/i, 'case-hl': /heartland/i, 'case-hz': /horizon/i, 'case-ab': /authority brands/i, 'case-fd': /frontdoor|american home shield/i, 'case-ap': /\bapex\b/i,
  'case-rw': /redwood/i, 'case-ch': /champions/i, 'case-th': /threshold/i, 'case-si': /\bsila\b/i, 'case-ah': /any ?hour/i, 'case-lg': /legacy service/i, 'cx-01': /smith (?:\+|and|&) howard/i,
  'cx-02': /frontline|integreon managed/i, 'cx-03': /shermco/i, 'cx-04': /sciens/i, 'cx-05': /\bies\b|integrated electrical/i, 'cx-06': /consilio/i, 'cx-07': /\bepiq\b/i, 'cx-08': /harbor global|hbr consulting/i,
  'cx-09': /\bvwr\b/i, 'cx-10': /avantor/i, 'cx-11': /fisher scientific/i, 'cx-12': /stagwell|mdc partners/i, 'cx-13': /\bfgs\b/i, 'cx-14': /teneo/i, 'cx-15': /vuori/i, 'cx-16': /chubbies/i, 'cx-17': /allbirds/i,
};
const caseOf = q => Object.keys(ALIAS).find(id => ALIAS[id].test(q) && M.byId[id]);
function caseAnswer(q) {
  const c = M.byId[caseOf(q)]; if (!c) return null;
  let evs = c.events, cut = null;
  const bm = /\bbefore\s+(?:the\s+)?([a-z][\w&.+-]*(?:\s+[a-z][\w&.+-]*)?)/i.exec(q);
  if (bm) { const words = bm[1].split(/\s+/).filter(w => w.length > 2 && !/^(it|they|was|were|invested|bought|came|sold|the|its)$/i.test(w)); const hit = words.length && c.events.find(e => words.some(w => new RegExp(`\\b${w.replace(/[^\w]/g, '')}`, 'i').test(e.event))); if (hit) { cut = hit; evs = c.events.filter(e => e.w.t0 < hit.w.t0); } }
  const rows = evs.map(e => [esc(e.w.label), `<b>${esc(e.type)}</b> · ${esc(e.event)}${e.metric ? ` <span class="ch-badge">${esc(e.metric)}</span>` : ''}`, src(e.source_url)]);
  const k = c.kpis.slice(0, 5).map(x => [esc(x.kpi), N(`${esc(kpiVal(x.before))} → ${esc(kpiVal(x.after))}`), esc(x.period || '')]);
  const lead = cut ? `<p>Up to ${esc(cut.w.label)}, when ${esc(cut.event.split(/[;,.]/)[0])}, the owners made ${N(evs.length)} dated moves:</p>` : `<p>${esc(c.chain)}. Entry ${esc(c.entry?.label || '—')}${c.exit ? `; exit ${esc(c.exit.label)} to ${esc(c.buyer)}` : `; ${esc(c.statusLabel.toLowerCase())}`}${c.hold != null ? ` (${yrs(c.hold)})` : ''}.</p>`;
  return {
    html: `<h4>${esc(c.name)}</h4>${lead}${rows.length ? T(['When', 'What happened', 'Source'], rows) : '<p>No dated events before that point.</p>'}${k.length ? `<h4>Before and after</h4>${T(['KPI', 'Before → after', 'Period'], k)}` : ''}<p><b>What BSP can copy:</b> ${esc(c.copy)}</p>`,
    links: [A(`#case=${c.id}`, `Show ${c.short} on the timeline`), A(`${ROOT}app.html#/cases/timeline?case=${c.id}`, 'Open in portal')],
    followups: ['How long did sponsors hold home-services companies?', 'Which levers moved EBITDA fastest?', 'What should Punctual Pros do in the next 12 months?'],
  };
}
function holdAnswer() {
  const st = M.stats; const hs = M.cases.filter(c => c.home && c.hold != null).sort((a, b) => (a.entry?.t ?? 0) - (b.entry?.t ?? 0));
  const ppAt = M.ppLane.entry.t + (st.holdHome || 4);
  return {
    html: `<h4>How long sponsors held home-services companies</h4><p>The median first-sponsor hold is ${N(yrs(st.hold))} across ${N(st.holdN)} exits, and ${N(yrs(st.holdHome))} in residential home services and franchisors (n=${st.holdHomeN}). At that pace Punctual Pros (entry Apr 2024) reaches the home-services median around ${N(esc(monthLabel(ppAt)))}.</p>${T(['Company', 'Owners', 'Hold', 'Outcome'], hs.map(c => [`<b>${esc(c.short)}</b>`, esc(c.chainShort), N(`${c.hold.toFixed(1)}${c.exit ? '' : ' so far'}`), esc(c.exit ? `${c.statusLabel}: ${c.buyerShort}` : c.statusLabel)]))}<p>Most exits went to a larger sponsor, often with the seller or management rolling equity (Charlesbank into GI Partners at ARS, Odyssey alongside Blackstone at Champions).</p>`,
    links: [A('#entry-exit', 'Entry and exit table'), A('#patterns', 'The hold clock')],
    followups: ['What multiples did scaled companies sell for?', 'What should Punctual Pros do in the next 12 months?'],
  };
}
function leverAnswer() {
  const rx = /EBITDA|margin|operating income/i;
  const timed = M.levers.filter(l => l.range || l.med != null).sort((a, b) => ((a.range?.[0] ?? a.med ?? 99) - (b.range?.[0] ?? b.med ?? 99)) || ((a.med ?? 99) - (b.med ?? 99)));
  const money = M.cases.flatMap(c => c.kpis.filter(k => rx.test(k.kpi) || rx.test(k.unit)).map(k => ({ c, k })));
  const levRows = M.levers.filter(l => rx.test(l.magnitude) || rx.test(l.kpi));
  return {
    html: `<h4>Which levers moved EBITDA fastest</h4><p>Few sponsors publish EBITDA, so the record is thin. Where it is published, margin levers and the recurring base moved it most; tuck-ins moved revenue fastest.</p>${levRows.length ? T(['Lever', 'Evidence on the record', 'Typical timing'], levRows.slice(0, 5).map(l => [`<b>${esc(l.name)}</b>`, esc(l.magnitude), esc(l.range ? `${l.range[0]}–${l.range[1]} mo` : l.med != null ? `median ${Math.round(l.med)} mo` : '—')])) : ''}${money.length ? `<h4>EBITDA and margin moves in the cases</h4>${T(['Case', 'KPI', 'Before → after', 'Source'], money.slice(0, 6).map(({ c, k }) => [`<b>${esc(c.short)}</b>`, esc(k.kpi), N(`${esc(kpiVal(k.before))} → ${esc(kpiVal(k.after))}`), src(k.source_url)]))}` : ''}<h4>Earliest levers in the hold</h4>${T(['Lever', 'When', 'Cases'], timed.slice(0, 5).map(l => [esc(l.name), esc(l.range ? `${l.range[0]}–${l.range[1]} mo` : `median ${Math.round(l.med)} mo`), N(l.cases.length)]))}`,
    links: [A('#levers', 'Lever matrix'), A(`${ROOT}app.html#/cases/levers`, 'Levers in the portal')],
    followups: ['What should Punctual Pros do in the next 12 months?', 'What did Alpine do with Apex before Apollo invested?'],
  };
}
function seqAnswer(q) {
  const yr = /12|twelve|year|next/i.test(q) && !/36|thirty/i.test(q);
  const lim = when('2027-10-01').t;
  const st = M.steps.filter(s => !s.done && (!yr || s.a.t < lim));
  return {
    html: `<h4>What Punctual Pros should do ${yr ? 'in the next 12 months' : 'over the next 36 months'}</h4><p>Punctual Pros is at month ${N(M.stats.pp?.hold_month_on_2026_10_06 ?? 30)} of BSP's hold. Three steps are done (entry, ServiceTitan, Horvath). The rest follow the order the winning cases used:</p>${T(['When', 'Step', 'Benchmark'], st.map(s => [esc(`${mLabel(s.a)} – ${mLabel(s.b)}`), `<b>${esc(s.title)}</b>`, esc(s.bench || '—')]))}<p>These are analyst recommendations, not company plans.</p>`,
    links: [A('#sequence', 'The sequence'), A(`${ROOT}app.html#/cases/sequence`, 'Sequence in the portal'), A('punctual-pros/nationwide.html', 'Nationwide plan')],
    followups: ['Which levers moved EBITDA fastest?', 'How long did sponsors hold home-services companies?'],
  };
}
function multAnswer() {
  const rows = ladderRows(M);
  const evs = M.cases.filter(c => c.exit_ev_usd && c.exit).sort((a, b) => b.exit_ev_usd - a.exit_ev_usd);
  return {
    html: `<h4>What scaled companies sold for</h4><p>Only two cases have a press-reported exit multiple: ${rows.filter(r => r.kind === 'exit').map(r => `${esc(r.label)} at ~${xTimes(r.hi)}`).join(' and ')} EBITDA. Small lower-middle-market deals trade at about 6–7x, so every tuck-in rolled into a scaled company is bought at a fraction of what the combined company sells for.</p>${T(['Benchmark or deal', 'Multiple', 'Source'], rows.map(r => [`${esc(r.label)} <span class="ch-badge">${esc(r.sub)}</span>`, N(r.lo !== r.hi ? `${xTimes(r.lo)}–${xTimes(r.hi)}` : `~${xTimes(r.hi)}`), src(r.url)]))}<h4>Exit values on the record</h4>${T(['Case', 'Exit value', 'Buyer'], evs.slice(0, 8).map(c => [`<b>${esc(c.short)}</b>`, N(usd(c.exit_ev_usd) + (c.evEst ? ' est.' : '')), esc(c.buyerShort || c.statusLabel)]))}<p>Press-reported values are estimates; most sponsors disclose no price.</p>`,
    links: [A('#entry-exit', 'Entry and exit table'), A(`${ROOT}app.html#/ma/valuation`, 'Valuation benchmarks')],
    followups: ['How long did sponsors hold home-services companies?', 'What did Champions do before Blackstone bought it?'],
  };
}
function failAnswer() {
  const p = M.patterns.find(x => x.id === 'pat-11'); const ab = M.byId['cx-17'];
  return p ? {
    html: `<h4>What went wrong in the weaker cases</h4><p>${esc(p.desc)}</p><ul>${p.evidence.slice(0, 5).map(e => `<li><b>${esc(M.byId[e.case]?.short || '')}</b>: ${esc(e.fact)} (${src(e.source_url)})</li>`).join('')}</ul>${ab ? `<p><b>${esc(ab.short)}</b> is the consumer cautionary case: ${esc(ab.copy.split('. ')[0])}.</p>` : ''}<p><b>For Punctual Pros:</b> ${esc(p.next)}</p>`,
    links: [A('#patterns', 'The hold clock')], followups: ['Which levers moved EBITDA fastest?', 'What should Punctual Pros do in the next 12 months?'],
  } : null;
}
function cadenceAnswer() {
  const st = M.stats; const p2 = M.patterns.find(x => x.id === 'pat-02'), p4 = M.patterns.find(x => x.id === 'pat-04');
  return {
    html: `<h4>How fast sponsors bought add-ons</h4><p>The first add-on came a median ${N(st.firstAddon?.median + ' months')} after entry (range ${st.firstAddon?.min}–${st.firstAddon?.max}, n=${st.firstAddon?.n}); after that, one deal every ${N(st.cadence?.median + ' months')} (range ${st.cadence?.min}–${st.cadence?.max}, n=${st.cadence?.n}). Punctual Pros bought Horvath in month ${N(st.pp?.first_addon_month ?? 8)}.</p>${p4 ? `<p><b>Punctual Pros today:</b> ${esc(p4.status)}</p>` : ''}${p2 ? T(['Case', 'First add-on', 'Source'], p2.evidence.slice(0, 8).map(e => [`<b>${esc(M.byId[e.case]?.short || '')}</b>`, esc(`${e.months_from_entry != null ? 'month ' + Math.round(e.months_from_entry) : e.date} · ${e.fact}`), src(e.source_url)])) : ''}`,
    links: [A('#patterns', 'The hold clock'), A(`${ROOT}app.html#/pp/targets`, 'Punctual Pros add-on targets')], followups: ['What should Punctual Pros do in the next 12 months?'],
  };
}
function intents() {
  return [
    { id: 'cases-case', rx: [{ test: q => !!caseOf(q) && !/how long|hold(?:ing)? period/i.test(q) }], run: async q => caseAnswer(q) },
    { id: 'cases-hold', rx: [/how long|hold(?:ing)? period|\bheld\b|years? (?:to|before) (?:exit|sell)/i], run: async () => holdAnswer() },
    { id: 'cases-cadence', rx: [/first add-?on|cadence|how (?:fast|often|quickly).*(?:add-?on|tuck|acqui|deal)|tuck-?ins? per/i], run: async () => cadenceAnswer() },
    { id: 'cases-mult', rx: [/multiple|valuation|sold for|sell for|exit value|what .*worth/i], run: async () => multAnswer() },
    { id: 'cases-fail', rx: [/fail|went wrong|cautionar|\bpik\b|stress|mistake|avoid|what not to/i], run: async () => failAnswer() },
    { id: 'cases-levers', rx: [/levers?|ebitda|fastest|margin|what did (?:they|sponsors|owners) do|how did .* improve/i], run: async () => leverAnswer() },
    { id: 'cases-seq', rx: [/sequence|next (?:12|twelve|36|thirty-six) months|what should punctual pros do|36-month|next steps? for punctual/i], run: async q => seqAnswer(q) },
  ];
}
function faq() {
  const st = M.stats; const ch = M.byId['case-ch'], sh = M.byId['cx-01'];
  const lev = M.levers[0];
  return [
    { q: 'How many cases are in the set?', a: `<p>${st.n} cases from ${st.yearMin} to ${st.yearMax}: ${st.nHome} residential home-services companies and franchisors, and ${st.nCross} analogs in commercial services, legal services, lab distribution, agencies and consumer brands. ${st.events} dated events in all.</p>` },
    { q: 'What is the median hold for a home-services company?', a: `<p>${yrs(st.holdHome)} in residential home services (n=${st.holdHomeN}) and ${yrs(st.hold)} across all first-sponsor exits (n=${st.holdN}).</p>` },
    { q: 'How soon after entry did sponsors buy the first add-on?', a: `<p>A median of ${st.firstAddon?.median} months (n=${st.firstAddon?.n}). Punctual Pros bought Horvath in month ${st.pp?.first_addon_month}.</p>` },
    { q: 'What tuck-in cadence did the winners keep?', a: `<p>About one deal every ${st.cadence?.median} months after the first (n=${st.cadence?.n}).</p>` },
    ch ? { q: 'What did Champions sell for?', a: `<p>Blackstone agreed to buy Champions in Feb 2026 at a reported ~$2.5B, about ${xTimes(ch.exit_multiple_ebitda)} trailing EBITDA (press estimate). Members grew from about 60,000 at the Jan 2021 sale to Odyssey to about 150,000, roughly 71 to 83 per technician.</p>`, href: '#case=case-ch' } : null,
    sh ? { q: 'What did BSP do with Smith + Howard?', a: `<p>${esc(sh.copy)}</p>`, href: '#case=cx-01' } : null,
    { q: 'Which lever did the most cases use?', a: `<p>${esc(lev?.name || '')}: ${lev?.cases.length} of ${st.n} cases. ${esc(lev?.pp || '')}</p>`, href: '#levers' },
    { q: 'Is Punctual Pros behind the cases?', a: `<p>On the first add-on it is in line (month 8 vs a median of about 7). On cadence it is behind: no second add-on appears in public sources since Horvath. It is about 30 months into the hold.</p>`, href: '#patterns' },
    { q: 'Where do the exit multiples come from?', a: '<p>Only two cases carry one: Champions (~18.5x, Bloomberg-cited) and Sila (~17x including pending acquisitions). Both are press estimates. Lower-middle-market benchmarks come from GF Data.</p>', href: '#entry-exit' },
    { q: 'Are the Punctual Pros steps company plans?', a: '<p>No. Steps 0–2 are dated facts (entry, ServiceTitan, Horvath). Steps 3–14 are analyst recommendations derived from the cases.</p>', href: '#sequence' },
  ].filter(Boolean);
}
