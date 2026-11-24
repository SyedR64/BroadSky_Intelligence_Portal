/* ═══════════════════════════════════════════════════════════════════════════
   How BSP buys (module id 'bsp') — the acquisition methodology,
   reverse-engineered from every disclosed BSP deal, and applied live to
   the add-on pipelines. The methodology page (redesigns/methodology.html) now forwards
   here: its twelve observations are on deals; its scoring detail and call sheet on rubric.
   Screens: deals · patterns · rubric · network.
   Datasets: BSP acquisition methodology, BSP professional network,
   Punctual Pros / CET / Frontline and Thomas Scientific add-on target screens.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as Copy from './copy.js?v=20261123194657';
import {
  loadBundle, isTargetTest, PLATFORMS, PORDER, sellerLabel, DEAL_TYPE, STRENGTH, TESTS, critShort, GROUPS, TYPE_LABEL, REL_LABEL,
  graphSVG, legendHTML, stripSVG, bindGraph, nodeDetail, introFor, firstCallScript, nextFive, fmtMonth, fmtDay, monthsBetween, clip, host, TODAY,
} from './bsp-lib.js?v=20261123194657';

const COLOR = 'var(--sys-brand)';
/* company accents are the system tokens (UNIFIED.md §6); Smith + Howard, exited, reads the neutral mute */
const PCOL = { pp: 'var(--co-pp)', cet: 'var(--co-cet)', fl: 'var(--co-fl)', ts: 'var(--co-ts)', bpi: 'var(--co-bpi)', fh: 'var(--co-fh)', sh: 'var(--sys-mute-2)' };
/* evidence strength and the fit gate are statuses: .sys-chip--good | --warn | --bad, neutral otherwise */
const STR_ST = { strong: 'good', moderate: 'warn', weak: '' };
const GATE_ST = { Priority: 'good', 'Watch list': 'warn', Pass: '', 'Held out': 'bad' };
const CO_IDS = new Set(['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** data-co for a portfolio company (system.css derives --co / --co-ink / --co-soft); Smith + Howard passes its token. */
const coAttr = p => CO_IDS.has(p) ? `data-co="${p}"` : `data-co="" style="--co:${PCOL[p] || COLOR}"`;
const coChip = (p, t, tag = 'span', extra = '') => `<${tag} class="sys-chip sys-chip--soft"${tag === 'button' ? ' type="button"' : ''} ${coAttr(p)}${extra}>${h(t)}</${tag}>`;
const stChip = (t, st) => `<span class="sys-chip${st ? ` sys-chip--${st}` : ''}">${h(t)}</span>`;
const EST = Copy.EST;
const n1 = v => v == null || isNaN(v) ? '—' : Number(v).toFixed(1);
const SRC_METH = 'BSP acquisition methodology (primary releases, SEC filings)';
const SRC_NET = 'BSP professional network (public roles only)';
const SRC_POOLS = 'Add-on target screens: Punctual Pros, CET, Frontline, Thomas Scientific';

/* free text from the deal record in plain English: ISO dates in words ("2027-12-14" → "Dec 14, 2027", "2026-06" → "Jun 2026", "Q4-2024" → "Q4 2024") */
const words = s => s == null ? s : Copy.text(String(s).replace(/\bfilings view\b/g, 'filings screen').replace(/\bQ([1-4])-((?:19|20)\d\d)\b/g, 'Q$1 $2').replace(/\b((?:19|20)\d\d)-(0[1-9]|1[0-2])\b(?!-\d)/g, (m, y, mo) => fmtMonth(`${y}-${mo}-01`)));
const openInsp = (ctx, opts) => { ctx.inspector.open(opts); document.querySelector('#inspector .insp-body')?.classList.add('m-bsp'); };
const injectCss = () => { if (!document.getElementById('css-bsp')) { const l = document.createElement('link'); l.id = 'css-bsp'; l.rel = 'stylesheet'; l.href = 'modules/bsp.css?v=20261123194657'; document.head.appendChild(l); } };

let _b = null;
function bundle(data) {
  if (_b) return _b;
  _b = loadBundle(n => data.research(n));
  _b.then(b => { if (b.missing.length) _b = null; }).catch(() => { _b = null; });
  return _b;
}
let _indexed = false;
function indexOnce(app, b) {
  if (_indexed) return; _indexed = true;
  app.index([
    ...b.deals.map(d => ({ label: d.company, sub: `${DEAL_TYPE[d.deal_type] || 'Deal'} · ${PLATFORMS[d._p]?.short || ''} · ${fmtMonth(d.date)}`, href: `#/bsp/deals?deal=${encodeURIComponent(d.id)}`, kind: 'Deal', color: PCOL[d._p] })),
    ...b.scored.ranked.slice(0, 40).map(r => ({ label: r.company, sub: `BSP fit ${r._score} · ${r._plat}`, href: `#/bsp/rubric?t=${encodeURIComponent(r.id)}`, kind: 'Target', color: PCOL[r._p] })),
    ...(b.graph?.nodes || []).filter(n => /^p-/.test(n.id)).slice(0, 120).map(n => ({ label: n.name, sub: `${TYPE_LABEL[n.type] || ''} · ${n.title || ''}`, href: `#/bsp/network?node=${encodeURIComponent(n.id)}`, kind: 'Network', color: COLOR })),
  ]);
}
/* Shorter text for a table cell (10 words at most; the full text is in the side panel a row opens). */
const brief = (s, n = 10, clause = true) => {
  let t = String(s ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();
  if (clause) t = t.split(/;\s|(?<=[a-z0-9'’]\.)\s+(?=[A-Z])/)[0];
  const w = t.split(' ');
  return w.length > n ? w.slice(0, n).join(' ').replace(/[,:;]$/, '') + '…' : t.replace(/[.;]$/, '');
};
/* Source, method and as-of text: the shell moves these into the Sources and Method drawers */
const srcMark = (ui, text, asof) => `<p class="sys-src" data-src>${ui.source(text, null, asof)}</p>`;
const metaMark = (html) => `<p class="sys-src" data-method>${html}</p>`;
const missingNote = (ui, b) => b.missing.length ? ui.note(`Data not yet available: ${b.missing.map(Copy.dataset).join(', ')}.`, 'warn') + '<div class="mt-12"></div>' : '';
const pChip = (fmt, p) => p ? coChip(p, PLATFORMS[p].short) : '—';

/* ── Deal inspector ──────────────────────────────────────────────────────── */
function vehiclesHTML(ctx, d) {
  const { esc, fmt } = ctx; const v = d.co_invest_vehicle;
  if (!v) return '—';
  const list = (v.vehicles || []).map(x => `<li><b>${esc(x.entity)}</b>${x.amount_sold_usd != null ? ` · ${fmt.money(x.amount_sold_usd)} sold` : ''}${x.investors ? ` · ${x.investors} investor${x.investors > 1 ? 's' : ''}` : ''}${x.note ? `<div class="dim small">${esc(words(x.note))}</div>` : ''}</li>`).join('');
  return `<ul class="bsp-ul">${list}</ul>${v.note ? `<div class="dim small mt-4">${esc(words(v.note))}</div>` : ''}`;
}
const vehicleShort = d => { const v = d.co_invest_vehicle; if (!v?.vehicles?.length) return null; const t = v.vehicles.reduce((a, x) => a + (x.amount_sold_usd || 0), 0); return `${v.vehicles[0].entity}${v.vehicles.length > 1 ? ` +${v.vehicles.length - 1}` : ''}${t ? `, $${(t / 1e6).toFixed(1)}M` : ''}`; };
function openDeal(ctx, b, d) {
  const { ui, esc, inspector, app } = ctx; const P = PLATFORMS[d._p];
  const plat = b.deals.find(x => x.deal_type === 'platform' && x._p === d._p);
  const timing = d.deal_type === 'add_on' && plat ? `${n1(monthsBetween(plat.date, d.date))} months after the ${P.short} anchor deal` : d.deal_type === 'exit' && plat ? `${n1(monthsBetween(plat.date, d.date))}-month hold` : null;
  const pats = b.patterns.filter(p => (p.evidence_deal_ids || []).includes(d.id));
  openInsp(ctx, {
    title: esc(d.company), color: PCOL[d._p],
    sub: `${esc(DEAL_TYPE[d.deal_type] || 'Deal')} · ${esc(P?.short || d.platform)} · ${esc(fmtDay(d.date))}${d.hq ? ` · ${esc(d.hq)}` : ''}`,
    sections: [
      d.rationale_quoted ? { label: 'Rationale, in their words', html: `<blockquote class="bsp-quote">${esc(d.rationale_quoted)}</blockquote>` } : null,
      { label: 'Deal', html: ui.kv({ Seller: `${esc(sellerLabel(d.seller_type))}${d.seller ? `<div class="dim small">${esc(words(d.seller))}</div>` : ''}`, Timing: timing ? esc(timing) : null, Sector: d.sector ? esc(d.sector) : null, 'Buy-side advisers': esc(words(d.buyer_advisor) || '—'), 'Sell-side advisers': esc(words(d.seller_advisor) || '—'), 'Lenders and capital': esc(words(d.lender_or_capital) || 'Not disclosed'), 'Co-invest vehicle': vehiclesHTML(ctx, d) }) },
      d.structure_notes ? { label: 'Structure', html: `<div class="small text-2">${esc(words(d.structure_notes))}</div>` } : null,
      d.size_signals ? { label: 'Size signals', html: `<div class="small text-2">${esc(words(d.size_signals))}</div><div class="dim small mt-4">Figures marked est. are the portal’s labelled estimates, not disclosures.</div>` } : null,
      pats.length ? { label: 'Patterns this deal supports', html: `<div class="sys-chips">${pats.map(p => stChip(clip(p.pattern.split(':')[0], 60), STR_ST[p.strength])).join('')}</div>` } : null,
      { label: 'Source', html: `<div class="small">${ctx.fmt.link(d.source_url, host(d.source_url) || 'Release')}</div><div class="dim small mt-4">Retrieved ${esc(d.retrieved ? fmtDay(d.retrieved) : '—')}</div>` },
    ].filter(Boolean),
    actions: [d.source_url ? { label: 'Release ↗', href: d.source_url } : null, P?.co ? { id: 'mod', label: `Open ${esc(P.short)}`, onClick: () => app.go(P.co) } : null].filter(Boolean),
  });
}

/* The twelve observations (bsp_methodology meta.methodology_narrative), moved from the methodology page.
   Closed by default: open, the list is about one laptop screen tall. */
const NUM_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
function narHTML(ctx, b) {
  const { ui, esc } = ctx; const nar = b.meth?.meta?.methodology_narrative || []; if (!nar.length) return '';
  return `<details class="bsp-drawer mt-12"><summary><b>Thesis first, essential services, founders stay</b><span>${NUM_WORDS[nar.length] || nar.length} observations</span></summary>
    <ol class="bsp-nar">${nar.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>`;
}
/* The next five (highest BSP fit, at most two per company) with the intro path and the draft first call:
   the same text the side panel shows for one row, printed for five. */
function nextFiveHTML(ctx, b) {
  const { ui, esc, fmt } = ctx; const five = nextFive(b, 5, 2); if (!five.length) return '';
  return `<details class="bsp-drawer mt-12"><summary><b>Call sheet: the next five</b></summary>
    <div class="bsp-next">${five.map((r, i) => { const ip = introFor(b, r); const sc = firstCallScript(b, r); return `<article class="sys-card sys-card--flat bsp-nx" ${coAttr(r._p)}>
      <div class="bsp-nx-h"><b>${i + 1}. ${esc(r.company)}</b>${coChip(r._p, r._plat)}<span class="sys-src">${esc([r.hq_city, r.state].filter(Boolean).join(', '))}</span><span class="sys-num">BSP fit ${r._score}</span></div>
      <p class="sys-card-body">${esc(r._explain)}</p>
      <div class="bsp-nx-grid"><div>
        <p class="sys-card-label">Intro path · ${ip?.sourced ? `${esc(ip.confidence)} confidence` : 'default path'}</p>
        ${ip ? `<div class="bsp-path">${ip.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i></i>')}</div><p class="sys-card-body">${esc(ip.path)}</p>` : ''}
        <p class="sys-card-label">Profile</p><p class="sys-card-body">${esc(r.ownership ? String(r.ownership).replace(/_/g, ' ') : '—')}${r.founded_year ? ` · founded ${r.founded_year}` : ''}${r.employees != null ? ` · ${fmt.num(r.employees)} employees` : ''}${r.revenue_est_usd ? ` · ${fmt.money(r.revenue_est_usd)}${EST} revenue` : ''}</p>
        ${r.risk_flags?.length ? `<p class="sys-card-label">Risk flags</p><div class="sys-chips">${r.risk_flags.map(x => stChip(x, 'warn')).join('')}</div>` : ''}
      </div><div>
        <p class="sys-card-label">First-call script (draft)</p><ol class="bsp-script">${sc.map(s => `<li><b>${esc(s.k)}.</b> ${esc(s.t)}</li>`).join('')}</ol>
      </div></div>
    </article>`; }).join('')}</div>
    </details>`;
}
/* How each of the ten criteria is scored: the text the side panel shows for one criterion, printed for all ten. */
function critHTML(ctx, b) {
  const { esc } = ctx;
  return `<details class="bsp-drawer mt-12"><summary><b>How each criterion is scored</b></summary>
    <div class="bsp-critd">${b.criteria.slice().sort((a, c) => c.weight_pct - a.weight_pct).map(c => `<div><p><b>${esc(c.criterion)}</b> · <span class="sys-num">${c.weight_pct}%</span></p><p>${esc(c.test)}</p><p class="bsp-bands">${Object.entries(c.scoring_bands || {}).sort((x, y) => y[0] - x[0]).map(([k, v]) => `<span><b>${esc(k)}</b>${esc(v)}</span>`).join('')}</p><p class="sys-muted">${esc(TESTS[c.id]?.how || '')}</p></div>`).join('')}</div></details>`;
}

/* ═══ View: deals ═══ */
async function viewDeals(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.meth) { el.innerHTML = ui.note('Research dataset not yet available: BSP acquisition methodology.', 'warn'); return; }
  indexOnce(app, b); const c = b.cadence;
  const named = b.deals.filter(d => d.deal_type === 'add_on');
  const disclosed = named.filter(d => d.seller_type), anchors = b.deals.filter(d => d.deal_type === 'platform'), anchorsUndisclosed = anchors.filter(d => !d.seller_type).length;
  const exits = b.deals.filter(d => d.deal_type === 'exit').length;
  const yrs = n1(monthsBetween(b.deals[0].date, anchors.slice(-1)[0].date) / 12);
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Every deal', sub: `${c.platforms} anchors, ${c.addonsStated} add-ons, ${exits} exit; no disclosed add-on seller was a private-equity sponsor.`, actions: `<a class="${ui.btnCls('secondary', '')}" href="#/home/firm">BSP profile</a>` })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'Anchor acquisitions', value: fmt.num(c.platforms), sub: `${c.pePlatforms} sponsor, ${anchors.length - c.pePlatforms - anchorsUndisclosed} owner${anchorsUndisclosed ? `, ${anchorsUndisclosed} undisclosed` : ''}` },
      { label: 'Add-ons', value: `${fmt.num(c.addonsStated)}`, sub: `${c.addonsNamed} named` },
      { label: 'Add-ons from PE sellers', value: fmt.num(c.peAddons), sub: `of ${disclosed.length} disclosed`, color: 'var(--sys-good)' },
      { label: 'Months between anchor deals', value: n1(c.medianGap), sub: `Median over ${yrs} years` },
      { label: 'First exit', value: `${n1(c.exitHold)} mo`, sub: 'Smith + Howard, Aug 2026' },
    ])}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Deal ledger', body: '<div data-f></div><div class="bsp-ledger" data-t></div>' })}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Deal chronology', body: `<div class="bsp-stripwrap">${stripSVG(b, PCOL)}</div>` })}
    ${narHTML(ctx, b)}
    ${srcMark(ui, SRC_METH, 'Oct 2026')}
    <p class="sys-src" data-src>Releases and SEC filings, retrieved Oct 6, 2026.</p>
    <span data-asof="Oct 6, 2026"></span>
    ${metaMark(`${c.platforms} anchors in ${yrs} years; the median gap runs Jan 2022 to Feb 2025. Thomas Scientific uses the Jan 2022 announcement; CET uses the Feb 2025 Form D first sale. First exit: Smith + Howard to TPG Growth. Weights and strengths are analyst inference from the public record, not BSP’s internal criteria. Form ADV: the filing every investment adviser makes with the SEC (Securities and Exchange Commission). PIK: interest paid in more debt instead of cash.`)}
  </div>`;
  const root = el.querySelector('.m-bsp');
  root.querySelectorAll('.bsp-mk').forEach(g => { const go = () => { const d = b.dealById.get(g.dataset.deal); root.querySelectorAll('.bsp-mk').forEach(x => x.classList.toggle('sel', x === g)); openDeal(ctx, b, d); }; g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
  const rows = b.deals.map(d => ({ ...d, _type: DEAL_TYPE[d.deal_type] || d.deal_type, _plat: PLATFORMS[d._p]?.short || d.platform, _seller: d.seller_type ? sellerLabel(d.seller_type) : '—', _buy: words(d.buyer_advisor) || '—', _sell: words(d.seller_advisor) || '—', _lend: words(d.lender_or_capital) || '—', _veh: vehicleShort(d) || '—' }));
  const cell = (v, n, cls = '') => `<div class="bsp-cell${cls}" data-no-gloss title="${esc(v)}">${esc(brief(v, n, false))}</div>`;
  const cols = [
    { key: 'date', label: 'Date', fmt: v => `<span class="sys-num">${esc(fmtMonth(v))}</span>` },
    { key: 'company', label: 'Company', fmt: v => `<b data-no-gloss title="${esc(v)}">${esc(brief(v, 8, false))}</b>`, wrap: true },
    { key: '_plat', label: 'Portfolio company', fmt: (v, r) => pChip(fmt, r._p) },
    { key: '_type', label: 'Type', fmt: v => esc(v) },
    { key: '_seller', label: 'Seller type', fmt: v => `<div style="min-width:90px">${esc(v)}</div>`, wrap: true },
    { key: '_buy', label: 'Buy-side advisers', fmt: v => cell(v, 6), wrap: true },
    { key: '_sell', label: 'Sell-side advisers', fmt: v => cell(v, 6), wrap: true },
    { key: '_lend', label: 'Lenders', fmt: v => cell(v, 7, ' bsp-cell--wide'), wrap: true },
    { key: '_veh', label: 'Co-invest vehicle', fmt: v => cell(v, 6, ' bsp-cell--narrow'), wrap: true },
  ];
  let tbl;
  const f = ui.filters(root.querySelector('[data-f]'), [
    { key: 'q', label: 'Search company, adviser, lender', type: 'search' },
    { key: 'p', label: 'Company', type: 'select', options: PORDER.map(p => ({ value: p, label: PLATFORMS[p].short })) },
    { key: 't', label: 'Type', type: 'select', options: Object.entries(DEAL_TYPE).map(([value, label]) => ({ value, label })) },
    { key: 's', label: 'Seller', type: 'select', options: [...new Set(b.deals.map(d => d.seller_type).filter(Boolean))].map(v => ({ value: v, label: sellerLabel(v) })) },
  ], st => { const q = (st.q || '').toLowerCase(); const r = rows.filter(d => (!st.p || d._p === st.p) && (!st.t || d.deal_type === st.t) && (!st.s || d.seller_type === st.s) && (!q || `${d.company} ${d._buy} ${d._sell} ${d._lend} ${d._veh} ${d.seller || ''}`.toLowerCase().includes(q))); tbl.update(r); f.setCount(`${r.length} of ${rows.length}`); });
  tbl = ui.table(root.querySelector('[data-t]'), { columns: cols, rows, pageSize: 40, exportName: 'broad_sky_deal_ledger', sortKey: 'date', sortDir: 1, onRow: r => openDeal(ctx, b, b.dealById.get(r.id)) });
  f.setCount(`${rows.length} of ${rows.length}`);
  if (params.deal && b.dealById.has(params.deal)) openDeal(ctx, b, b.dealById.get(params.deal));
}

/* ═══ View: patterns ═══ */
const patHead = t => { const m = String(t).match(/^([^:]{4,90}):/); return brief(m && m[1].split(' ').length <= 12 ? m[1] : t, 18); };
function openPattern(ctx, b, p) {
  const { esc, fmt } = ctx; const ids = (p.evidence_deal_ids || []);
  openInsp(ctx, {
    title: esc(patHead(p.pattern)), color: COLOR, sub: `${esc(STRENGTH[p.strength] || p.strength)} · ${ids.length} deals`,
    sections: [
      { label: 'Pattern', html: `<div class="small text-2">${esc(p.pattern)}</div>` },
      { label: 'For the next deal', html: `<div class="small text-2">${esc(p.implication_for_next_deals || '—')}</div>` },
      { label: 'Evidence', html: `<div class="sys-chips">${ids.map(id => { const d = b.dealById.get(id); return d ? coChip(d._p, d.company, 'button', ` data-deal="${esc(id)}" data-evb`) : ''; }).join('')}</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${[...new Set((p.source_urls || [p.source_url]).filter(Boolean))].map(u => fmt.link(u, host(u))).join('')}</div>` },
    ],
  });
  document.querySelectorAll('#inspector [data-evb]').forEach(btn => btn.onclick = () => openDeal(ctx, b, b.dealById.get(btn.dataset.deal)));
}
async function viewPatterns(ctx) {
  const { el, ui, fmt, esc, charts, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.meth) { el.innerHTML = ui.note('Research dataset not yet available: BSP acquisition methodology.', 'warn'); return; }
  indexOnce(app, b); const c = b.cadence;
  const strong = b.patterns.filter(p => p.strength === 'strong').length;
  const first = PORDER.map(p => c.firstAddon.find(f => f.p === p)).filter(f => f && f.months != null).map(f => ({ label: PLATFORMS[f.p].short, value: Math.round(f.months * 10) / 10 }));
  const waiting = c.firstAddon.filter(f => f.months == null).map(f => `${PLATFORMS[f.p].short} ${n1(f.sinceMonths)} mo`);
  const rate = PORDER.map(p => c.rates.find(r => r.p === p)).filter(Boolean).map(r => ({ label: PLATFORMS[r.p].short, value: r.perYear }));
  const card = (p, i) => `<article class="sys-card sys-card--flat bsp-pat"><div class="bsp-pat-h">${stChip(STRENGTH[p.strength] || p.strength, STR_ST[p.strength])}<span class="sys-src">${(p.evidence_deal_ids || []).length} deals</span></div><p class="sys-card-body bsp-pat-t"><button type="button" class="bsp-link" data-pat="${i}">${esc(patHead(p.pattern))}</button></p><p class="sys-card-body bsp-pat-i"><b>Next:</b> ${esc(brief(p.implication_for_next_deals || '—', 15))}</p></article>`;
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Deal patterns', sub: `${strong} of ${b.patterns.length} patterns are strong; first add-on lands near month ${n1(c.medianFirst)}.` })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'Months between anchor deals', value: n1(c.medianGap), sub: `Mean ${n1(c.meanGap)}` },
      { label: 'Months to first add-on', value: n1(c.medianFirst), sub: `${first.length} companies` },
      { label: 'Add-ons per company-year', value: n1(c.portfolioRate), sub: `${n1(c.activeRate)} active buyers` },
      { label: 'Hold to first exit', value: `${n1(c.exitHold)} mo`, sub: 'Smith + Howard' },
    ])}
    <div class="mt-12"></div>
    <div class="grid grid-2">
      ${ui.panel({ title: 'Months from company to first add-on', sub: waiting.length ? `Waiting: ${esc(waiting.join(', '))}` : '', body: charts.hbar(first, { fmt: v => `${n1(v)} mo`, labelW: 130, color: COLOR }) })}
      ${ui.panel({ title: 'Add-ons per company-year', body: charts.hbar(rate, { fmt: v => n1(v), labelW: 130, color: COLOR }) })}
    </div>
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Patterns', body: `<div class="sys-grid bsp-pats">${b.patterns.map(card).join('')}</div>` })}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Where the deals come from', body: '<div data-ch></div>' })}
    ${srcMark(ui, SRC_METH, 'Oct 2026')}
    <span data-asof="Oct 2026"></span>
    ${metaMark(`Patterns are inferred from the deal record. Strength and weights are analyst inference, not BSP’s internal criteria. Mean gap between anchor deals ${n1(c.meanGap)} months over ${c.gaps.length} intervals; the first-add-on median covers ${first.length} companies with an add-on; ${n1(c.activeRate)} add-ons per company-year is the median among active buyers; the exit hold is Smith + Howard, ${(c.rates.find(r => r.p === 'sh') || {}).stated ?? 9} add-ons, to TPG Growth. Add-on counts are BSP’s stated counts over years held (Smith + Howard to its Aug 2026 exit).`)}
  </div>`;
  const root = el.querySelector('.m-bsp');
  root.querySelectorAll('[data-pat]').forEach(btn => btn.onclick = () => openPattern(ctx, b, b.patterns[Number(btn.dataset.pat)]));
  const CT = { buy_side_banker: 'Buy-side bank', sell_side_banker: 'Sell-side banks', exit_banker: 'Exit banks', legal_counsel: 'Counsel', accounting_ma_consultant: 'Accounting M&A adviser', platform_relationship: 'Relationships', proprietary_search: 'Retained search', thematic_research: 'Thematic research', capital_partner: 'Capital partners' };
  const rows = b.channels.map(s => ({ ...s, _type: CT[s.channel_type] || String(s.channel_type).replace(/_/g, ' '), _deals: (s.roles || []).map(r => b.dealById.get(r.deal_id)?.company).filter(Boolean).join(', ') }));
  ui.table(root.querySelector('[data-ch]'), { columns: [
    { key: 'channel', label: 'Channel', fmt: v => `<b data-no-gloss title="${esc(v)}">${esc(brief(v, 8, false))}</b>`, wrap: true },
    { key: '_type', label: 'Type', fmt: v => esc(v) },
    { key: 'deal_count', label: 'Deals', num: true, fmt: v => fmt.num(v) },
    { key: '_deals', label: 'Deals touched', fmt: v => `<span data-no-gloss title="${esc(v)}">${esc(brief(v, 8, false))}</span>`, wrap: true },
    { key: 'implication', label: 'What it means', fmt: v => `<span data-no-gloss title="${esc(v || '')}">${esc(brief(v || '—', 10))}</span>`, wrap: true },
  ], rows, pageSize: 20, exportName: 'broad_sky_sourcing_channels', sortKey: 'deal_count', onRow: r => openInsp(ctx, { title: esc(r.channel), color: COLOR, sub: esc(r._type), sections: [
    { label: 'Roles', html: `<ul class="bsp-ul">${(r.roles || []).map(x => { const d = b.dealById.get(x.deal_id); return `<li><b>${esc(d?.company || '—')}</b> · ${esc(x.role || '')} · ${esc(fmtMonth(x.date))}</li>`; }).join('')}</ul>` },
    { label: 'Implication', html: `<div class="small text-2">${esc(r.implication || '—')}</div>` },
    { label: 'Sources', html: `<div class="col gap-4 small">${(r.source_urls || [r.source_url]).filter(Boolean).map(u => fmt.link(u, host(u))).join('')}</div>` },
  ] }) });
}

/* ═══ View: rubric ═══ */
function openTarget(ctx, b, r) {
  const { ui, esc, fmt, inspector, charts, app } = ctx;
  const intro = introFor(b, r); const script = firstCallScript(b, r);
  const bars = b.criteria.map(c => ({ label: `${critShort(c.id)} · ${c.weight_pct}%${isTargetTest(c.id) ? '' : TESTS[c.id]?.tested ? ' (portfolio company)' : ' (neutral)'}`, value: Math.round((r._crit[c.id] ?? 3) * 20) }));
  openInsp(ctx, {
    title: esc(r.company), color: PCOL[r._p],
    sub: `${esc(r._plat)} add-on candidate · ${esc([r.hq_city, r.state].filter(Boolean).join(', '))} · ${r._rank ? `#${r._rank} on the BSP rubric` : 'held out of the ranking'}`,
    sections: [
      r._affil ? { label: 'Verify affiliation first', html: ui.note('Trades under a BSP portfolio company’s own name. Held out of the ranking until Punctual Pros confirms it is not already affiliated. Do not contact yet.', 'warn') } : null,
      { label: 'BSP fit', html: `<div class="sys-kpis"><div class="sys-kpi" ${coAttr(r._p)}><div class="sys-kpi-label">Score (inferred rubric)</div><div class="sys-kpi-value">${r._score}</div><div class="sys-kpi-sub">${esc(r._gate)} · built from ${r._tested}% of the rubric weight · full rubric with portfolio company context ${r._full} · company screen fit ${fmt.num(r.fit_score)}</div></div></div><div class="small text-2 mt-8">${esc(r._explain)}</div>` },
      { label: 'Criterion scores (0–100)', html: charts.hbar(bars, { max: 100, fmt: v => `${v}`, labelW: 190, color: PCOL[r._p] }) + `<div class="dim small mt-4">Company-level criteria are context; neutral criteria are held at 3 of 5 until diligence measures them. Neither is in the BSP fit score.</div>` },
      { label: 'What drove each test', html: ui.kv(Object.fromEntries(b.criteria.filter(c => TESTS[c.id]?.tested).map(c => [`${critShort(c.id)}${isTargetTest(c.id) ? '' : ' (portfolio company)'}`, esc(r._why[c.id])]))) },
      intro ? { label: intro.sourced ? `Intro path · ${intro.confidence} confidence` : 'Intro path · default path', html: `<div class="bsp-path">${intro.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i></i>')}</div><div class="small text-2 mt-4">${esc(intro.path)}</div>${intro.sourced ? `<div class="dim small mt-4">${fmt.link(intro.source_url, host(intro.source_url))}</div>` : ''}` } : null,
      { label: 'First-call script (draft)', html: `<ol class="bsp-script">${script.map(s => `<li><b>${esc(s.k)}.</b> ${esc(s.t)}</li>`).join('')}</ol>` },
      { label: 'Profile', html: ui.kv({ Ownership: esc(r.ownership || '—'), Founded: r.founded_year, Employees: r.employees != null ? fmt.num(r.employees) : null, 'Revenue': r.revenue_est_usd ? `${fmt.money(r.revenue_est_usd)}${EST} <span class="dim small">modeled</span>` : null, Website: r.website ? fmt.link(r.website) : null }) },
      r.risk_flags?.length ? { label: 'Risk flags', html: `<div class="sys-chips">${r.risk_flags.map(x => stChip(x, 'warn')).join('')}</div>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${(r.sources || []).slice(0, 6).map(u => fmt.link(u, host(u) || u)).join('')}</div><div class="dim small mt-4">Screen retrieved ${r.retrieved ? esc(fmtDay(r.retrieved)) : '—'}</div>` },
    ].filter(Boolean),
    actions: [r.website ? { label: 'Website ↗', href: r.website } : null, { id: 'pipe', label: 'Open in add-on pipeline', onClick: () => app.go('ma', 'pipeline', { platform: r._p, q: r.company }) }, { id: 'net', label: 'Show path on network', onClick: () => app.go('bsp', 'network', { t: r.id }) }].filter(Boolean),
  });
}

async function viewRubric(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.meth) { el.innerHTML = ui.note('Research dataset not yet available: BSP acquisition methodology.', 'warn'); return; }
  indexOnce(app, b);
  const S = b.scored; const all = S.rows; const ranked = S.ranked;
  const pri = ranked.filter(r => r._gate === 'Priority').length, watch = ranked.filter(r => r._gate === 'Watch list').length;
  const tested = b.criteria.filter(c => isTargetTest(c.id)).reduce((a, c) => a + c.weight_pct, 0);
  const platW = b.criteria.filter(c => TESTS[c.id]?.tested === 'platform').reduce((a, c) => a + c.weight_pct, 0);
  const pools = PORDER.filter(p => all.some(r => r._p === p));
  const chipFor = id => { const t = TESTS[id]?.tested; return t ? stChip(t === 'proxy' ? 'Proxy' : t === 'platform' ? 'Company context' : 'Scored', t === 'platform' ? 'info' : 'good') : stChip('Not scored', ''); };
  const untestedW = b.criteria.filter(c => !TESTS[c.id]?.tested).reduce((a, c) => a + c.weight_pct, 0);
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Acquisition rubric', sub: `Call the top 15 first; the score orders targets, it does not filter them.`, chips: stChip('Weights inferred, not disclosed', 'warn'), actions: `<a class="${ui.btnCls('secondary', '')}" href="#/bsp/network">Deal network</a>` })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'Targets scored', value: fmt.num(ranked.length), sub: `${pools.length} companies` },
      { label: 'Clear the 70 gate', value: `${fmt.num(pri)} of ${fmt.num(ranked.length)}`, color: 'var(--sys-good)' },
      { label: 'Watch list (55–69)', value: fmt.num(watch), color: 'var(--sys-warn)' },
      { label: 'Rubric weight tested per target', value: `${tested}%`, sub: `${platW}% company level` },
      ...pools.map(p => ({ label: `Independents · ${PLATFORMS[p].short}`, value: fmt.num(S.indep[p] || 0), color: PCOL[p] })).slice(0, 2),
    ])}
    <div class="mt-12"></div>
    <div class="grid grid-main">
      ${ui.panel({ title: 'Top 15 by BSP fit', body: '<div data-top></div>' })}
      ${ui.panel({ title: 'The inferred screening criteria', body: `<div class="bsp-crit">${b.criteria.slice().sort((a, c) => c.weight_pct - a.weight_pct).map(c => `<div class="bsp-cr" data-crit="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(c.criterion)}, weight ${c.weight_pct}%" title="${esc(c.criterion)}"><div class="bsp-cr-h"><span class="bsp-cr-n">${esc(brief(c.criterion, 6, false))}</span><span class="sys-num">${c.weight_pct}%</span></div><div class="bsp-cr-bar" aria-hidden="true"><i style="width:${c.weight_pct / 15 * 100}%"></i></div><div class="bsp-cr-t">${chipFor(c.id)}</div></div>`).join('')}</div>` })}
    </div>
    <div class="mt-12"></div>
    ${critHTML(ctx, b)}
    ${nextFiveHTML(ctx, b)}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Every target, scored', body: '<div class="mb-12" data-top15></div><div data-f></div><div data-t></div>' })}
    ${srcMark(ui, SRC_METH, 'Oct 2026')}
    ${srcMark(ui, SRC_POOLS, 'Sept 2026')}
    <span data-asof="Oct 2026"></span>
    ${metaMark(`Weights sum to 100; each criterion scores 1–5. BSP fit uses the criteria tested for each target, rescaled to 0–100. ${all.length - ranked.length} target is held out until its affiliation is checked. Re-score a target after the first call. A count of 25 or more independents scores 5 on fragmentation. Scored: tested per target. Proxy: tested by proxy. Company context: tested at portfolio-company level. Not scored: a diligence item. The add-on screens were built to find companies that fit each company, so most clear the 70 gate and the rubric orders them. Recurring revenue, tech upside and the bench below the owner are ${untestedW}% of the weight and come from the first call. Scripts are drafts for the Portfolio Resource Group, not outreach that has happened. Revenue figures are modeled estimates.`)}
  </div>`;
  const root = el.querySelector('.m-bsp');
  root.querySelectorAll('.bsp-cr').forEach(x => x.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); x.onclick(); } });
  root.querySelectorAll('.bsp-cr').forEach(x => x.onclick = () => { const c = b.criteria.find(k => k.id === x.dataset.crit); openInsp(ctx, { title: esc(c.criterion), color: COLOR, sub: `Weight ${c.weight_pct}%`, sections: [
    { label: 'How BSP’s deals imply it', html: `<div class="small text-2">${esc(c.test)}</div>` },
    { label: 'Scoring bands', html: ui.kv(Object.fromEntries(Object.entries(c.scoring_bands || {}).sort((a, d) => d[0] - a[0]).map(([k, v]) => [`${k} of 5`, esc(v)]))) },
    { label: 'How the portal tests it', html: `<div class="small text-2">${esc(TESTS[c.id]?.how || '—')}</div>` },
    { label: 'Evidence deals', html: `<div class="sys-chips">${(c.evidence_deal_ids || []).map(id => b.dealById.get(id)).filter(Boolean).map(d => coChip(d._p, d.company)).join('')}</div>` },
    { label: 'Sources', html: `<div class="col gap-4 small">${(c.source_urls || []).map(u => fmt.link(u, host(u))).join('')}</div>` },
  ] }); });
  const rowsOf = list => list.map(r => ({ ...r, _loc: [r.hq_city, r.state].filter(Boolean).join(', '), _path: introFor(b, r)?.sourced ? introFor(b, r).confidence : '—' }));
  const cols = [
    { key: '_rank', label: '#', num: true, fmt: v => v == null ? '—' : fmt.num(v) },
    { key: 'company', label: 'Target', fmt: (v, r) => `<b>${esc(v)}</b>${r._affil ? ' ' + stChip('Verify affiliation', 'bad') : ''}`, wrap: true },
    { key: '_plat', label: 'Company', fmt: (v, r) => pChip(fmt, r._p) },
    { key: '_loc', label: 'Location', fmt: v => esc(v || '—') },
    { key: '_score', label: 'BSP fit', num: true, fmt: (v, r) => fmt.score(v, PCOL[r._p]) },
    { key: '_gate', label: 'Gate', fmt: v => stChip(v, GATE_ST[v]) },
    { key: 'fit_score', label: 'Screen fit', num: true, fmt: v => fmt.num(v) },
    { key: '_path', label: 'Intro path', fmt: v => v === 'high' || v === 'medium' || v === 'low' ? `${esc(v.charAt(0).toUpperCase() + v.slice(1))} confidence` : esc(v) },
    { key: '_brief', label: 'Why', fmt: (v, r) => `<span title="${esc(r._explain)}">${esc(v)}</span>`, wrap: true },
  ];
  ui.table(root.querySelector('[data-top]'), { columns: [cols[0], cols[1], cols[2], cols[4], cols[8]], rows: rowsOf(ranked.slice(0, 15)), pageSize: 15, exportName: 'broad_sky_fit_top15', sortKey: '_score', onRow: r => openTarget(ctx, b, r) });
  const allRows = rowsOf([...ranked, ...all.filter(r => r._affil)]);
  let tbl;
  const f = ui.filters(root.querySelector('[data-f]'), [
    { key: 'q', label: 'Search target or town', type: 'search' },
    { key: 'p', label: 'Company', type: 'select', options: pools.map(p => ({ value: p, label: PLATFORMS[p].short })) },
    { key: 'g', label: 'Gate', type: 'select', options: ['Priority', 'Watch list', 'Pass', 'Held out'] },
  ], st => draw(st));
  // Top 15 switch: the call list (ranks 1–15 by BSP fit) or every scored target
  let top15 = params.top === '15' || params.top === '1';
  const draw = (st = f.state) => { const q = (st.q || '').toLowerCase(); let r = allRows.filter(x => (!st.p || x._p === st.p) && (!st.g || x._gate === st.g) && (!q || `${x.company} ${x._loc}`.toLowerCase().includes(q))); if (top15) r = r.filter(x => x._rank && x._rank <= 15); tbl.update(r); f.setCount(top15 ? `${r.length} of the top 15` : `${r.length} targets`); };
  ui.seg(root.querySelector('[data-top15]'), [{ value: 'top', label: 'Top 15' }, { value: 'all', label: `All ${allRows.length}` }], top15 ? 'top' : 'all', v => { top15 = v === 'top'; draw(); });
  tbl = ui.table(root.querySelector('[data-t]'), { columns: cols, rows: allRows, pageSize: 15, exportName: 'broad_sky_fit_scored_pipeline', sortKey: '_score', onRow: r => openTarget(ctx, b, r) });
  draw();
  if (params.t) { const r = all.find(x => x.id === params.t); if (r) openTarget(ctx, b, r); }
}

/* ═══ View: network ═══ */
function openNode(ctx, b, n, ctl) {
  const { ui, esc, fmt, inspector } = ctx; const g = b.graph; const det = nodeDetail(g, n);
  openInsp(ctx, {
    title: esc(n.name), color: COLOR, sub: `${esc(TYPE_LABEL[n.type] || n.type)}${n.org && n.org !== n.name ? ` · ${esc(n.org)}` : ''}`,
    sections: [
      { label: 'Public role', html: ui.kv({ Role: esc(n.title || '—'), Sectors: (n.sector_tags || []).length ? n.sector_tags : null, 'Why it matters': n.relevance_to_pipeline ? esc(n.relevance_to_pipeline) : null }) },
      { label: `Connections (${det.conns.length})`, html: `<ul class="bsp-ul bsp-conns">${det.conns.slice(0, 24).map(c => `<li><button type="button" class="bsp-link" data-node="${esc(c.other.id)}">${esc(c.text)}</button>${c.e.current === false ? ' <span class="dim small">(prior)</span>' : ''}<div class="dim small">${esc(clip(c.e.evidence, 160))}</div></li>`).join('')}</ul>` },
      det.paths.length ? { label: 'On intro paths to', html: `<ul class="bsp-ul">${det.paths.map(p => `<li>${esc(p.target)} <span class="dim small">· ${esc(p.confidence)}</span></li>`).join('')}</ul>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${det.sources.slice(0, 8).map(u => fmt.link(u, host(u))).join('')}</div><div class="dim small mt-4">Public professional roles only; retrieved ${n.retrieved ? esc(fmtDay(n.retrieved)) : '—'}</div>` },
    ].filter(Boolean),
  });
  document.querySelectorAll('#inspector .bsp-link').forEach(btn => btn.onclick = () => { const m = g.byId.get(btn.dataset.node); if (m) { ctl?.select(m.id); openNode(ctx, b, m, ctl); } });
}

async function viewNetwork(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.graph) { el.innerHTML = ui.note('Research dataset not yet available: BSP professional network.', 'warn'); return; }
  indexOnce(app, b); const g = b.graph;
  const byG = GROUPS.map(gr => ({ gr, n: g.nodes.filter(n => n._g === gr.id).length }));
  const top = nextFive(b, 8, 3);
  const pathsFor = [...top.map(r => ({ r, ip: introFor(b, r) })), ...g.paths.filter(p => /^next_platform/.test(p.target_ref)).map(p => ({ r: null, ip: { sourced: true, ...p, names: p.path_node_ids.map(id => g.byId.get(id)?.name) } }))];
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Deal network', sub: `Reach add-ons through the company CEO, the franchisor or the selling banker.`, chips: stChip('Public roles only', 'warn') })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'People and organizations', value: fmt.num(g.nodes.length) },
      { label: 'Sourced connections', value: fmt.num(g.edges.length) },
      { label: 'Intro paths', value: fmt.num(g.paths.length) },
      { label: 'Advisers, banks and counsel', value: fmt.num(byG[3].n) },
    ])}
    <div class="mt-12"></div>
    <div class="grid grid-main">
      ${ui.panel({ title: 'Network map', body: `<div class="sys-filters mb-12"><input type="search" class="sys-input bsp-search" placeholder="Search people, firms, sectors" aria-label="Search the network"><span class="sys-src bsp-hits" aria-live="polite"></span></div><div class="bsp-graph">${graphSVG(g)}</div>` })}
      ${ui.panel({ title: 'Intro paths for top targets', scroll: true, body: `<div class="bsp-paths">${pathsFor.map((x, i) => `<button type="button" class="bsp-pathc" data-i="${i}" ${x.r ? coAttr(x.r._p) : 'data-co=""'}><div class="bsp-pathc-h"><b title="${esc(x.r ? x.r.company : x.ip.target)}">${esc(x.r ? x.r.company : brief(String(x.ip.target).replace(/^Next company:\s*/i, ''), 9, false))}</b>${x.r ? `<span class="sys-num">${x.r._score}</span>` : ''}</div><div class="bsp-pathc-m">${x.r ? `${esc(x.r._plat)}, ` : 'Theme, '}${x.ip?.sourced ? `${esc(x.ip.confidence)} confidence, ${x.ip.hops} hops` : 'unsourced'}</div><div class="bsp-path">${(x.ip?.names || []).filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i></i>')}</div></button>`).join('')}</div>` })}
    </div>
    ${srcMark(ui, SRC_NET, 'Oct 2026')}
    <span data-asof="Oct 2026"></span>
    <div class="m-bsp" data-method>${legendHTML()}</div>
    ${metaMark(`${byG[0].n} BSP team and ${byG[1].n} Executive Board; ${byG[4].n} lenders, LPs and other sponsors; ${g.paths.filter(p => p.confidence === 'high').length} high-confidence intro paths and ${g.paths.filter(p => /^next_platform/.test(p.target_ref)).length} next-company themes. The firm runs on a Carlyle and MidOcean lineage, private-credit lenders and sell-side banks. Each connection carries evidence and a source link. Intro paths are hypotheses over public connections, not known relationships. The path list shows the top BSP fit targets, then next-company themes.`)}
  </div>`;
  const root = el.querySelector('.m-bsp');
  let ctl = null;
  ctl = bindGraph(root.querySelector('.bsp-graph'), g, { onSelect: n => openNode(ctx, b, n, ctl) });
  const hits = root.querySelector('.bsp-hits'); let t;
  root.querySelector('.bsp-search').oninput = e => { clearTimeout(t); t = setTimeout(() => { const k = ctl.search(e.target.value); hits.textContent = e.target.value ? `${k} match${k === 1 ? '' : 'es'}` : ''; }, 160); };
  root.querySelectorAll('.bsp-pathc').forEach(btn => btn.onclick = () => { const x = pathsFor[Number(btn.dataset.i)]; root.querySelectorAll('.bsp-pathc').forEach(y => y.classList.toggle('sel', y === btn)); if (x.ip?.path_node_ids) ctl.path(x.ip.path_node_ids); if (x.r) openTarget(ctx, b, x.r); else openInsp(ctx, { title: esc(x.ip.target), color: COLOR, sub: `${esc(x.ip.confidence)} confidence · ${x.ip.hops} hops`, sections: [{ label: 'Path', html: `<div class="bsp-path">${x.ip.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i></i>')}</div><div class="small text-2 mt-8">${esc(x.ip.path)}</div>` }, { label: 'Source', html: fmt.link(x.ip.source_url, host(x.ip.source_url)) }] }); });
  if (params.node && g.byId.has(params.node)) { ctl.select(params.node); openNode(ctx, b, g.byId.get(params.node), ctl); }
  if (params.t) { const i = pathsFor.findIndex(x => x.r?.id === params.t); const r = b.scored.rows.find(x => x.id === params.t); const ip = r ? introFor(b, r) : null; if (ip) ctl.path(ip.path_node_ids); if (i >= 0) root.querySelectorAll('.bsp-pathc')[i]?.classList.add('sel'); }
}

export default {
  id: 'bsp', name: 'How BSP buys', tag: 'Method', color: COLOR, group: 'Command',
  tagline: 'The acquisition methodology reverse-engineered from every disclosed BSP deal, applied live to the add-on pipelines',
  views: [
    { id: 'deals', name: 'Deals', icon: '◆', render: viewDeals },
    { id: 'patterns', name: 'Patterns', icon: '≋', render: viewPatterns },
    { id: 'rubric', name: 'Rubric', icon: '▤', render: viewRubric },
    { id: 'network', name: 'Network', icon: '⬡', render: viewNetwork },
  ],
  tour: [
    { order: 925, hash: '#/bsp/deals', caption: '<b>How BSP buys.</b> Seven companies bought, twenty-one named add-ons and one exit, each with seller, advisers and lenders.', narration: 'Every disclosed deal: seven companies bought, twenty-one named add-ons and one exit, each with seller and lenders.' },
    { order: 926, hash: '#/bsp/patterns', caption: '<b>Deal patterns.</b> Thesis first, founder CEOs stay, first add-on near month eight, a new lender each time.', narration: 'The patterns: thesis first, founder CEOs stay, first add-on near month eight, a new lender each time.' },
    { order: 927, hash: '#/bsp/rubric', caption: '<b>The rubric.</b> Ten inferred criteria scored across every target, with the top fifteen and an intro path.', narration: 'The rubric scores every add-on target on ten inferred criteria. Start with the top fifteen.' },
  ],
};
