/* ═══════════════════════════════════════════════════════════════════════════
   How Broad Sky buys (module id 'bsp') — the acquisition methodology,
   reverse-engineered from every disclosed Broad Sky deal, and applied live to
   the add-on pipelines.
   Views: deals · patterns · rubric · network.
   Datasets: Broad Sky acquisition methodology, Broad Sky professional network,
   Punctual Pros / CET / Frontline and Thomas Scientific add-on target screens.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as Copy from './copy.js?v=20261006134218';
import {
  loadBundle, isTargetTest, PLATFORMS, PORDER, sellerLabel, DEAL_TYPE, STRENGTH, TESTS, critShort, GROUPS, TYPE_LABEL, REL_LABEL,
  graphSVG, legendHTML, stripSVG, bindGraph, nodeDetail, introFor, firstCallScript, nextFive, fmtMonth, fmtDay, monthsBetween, clip, host, TODAY,
} from './bsp-lib.js?v=20261006134218';

const COLOR = 'var(--c-bsp)';
const PCOL = { pp: 'var(--c-pp)', cet: 'var(--c-cet)', fl: 'var(--c-fl)', ts: 'var(--c-ts)', bpi: 'var(--c-bpi)', fh: 'var(--c-fh)', sh: 'var(--sys-mute)' };
const STR_COL = { strong: 'var(--green)', moderate: 'var(--amber)', weak: 'var(--dim)' };
const GATE_COL = { Priority: 'var(--green)', 'Watch list': 'var(--amber)', Pass: 'var(--dim)', 'Held out': 'var(--red)' };
const EST = Copy.EST;
const n1 = v => v == null || isNaN(v) ? '—' : Number(v).toFixed(1);
const SRC_METH = 'Broad Sky acquisition methodology (primary releases, SEC filings)';
const SRC_NET = 'Broad Sky professional network (public roles only)';
const SRC_POOLS = 'Add-on target screens: Punctual Pros, CET, Frontline, Thomas Scientific';

/* free text from the deal record in plain English: ISO dates in words ("2027-12-14" → "Dec 14, 2027", "2026-06" → "Jun 2026", "Q4-2024" → "Q4 2024") */
const words = s => s == null ? s : Copy.text(String(s).replace(/\bQ([1-4])-((?:19|20)\d\d)\b/g, 'Q$1 $2').replace(/\b((?:19|20)\d\d)-(0[1-9]|1[0-2])\b(?!-\d)/g, (m, y, mo) => fmtMonth(`${y}-${mo}-01`)));
const openInsp = (ctx, opts) => { ctx.inspector.open(opts); document.querySelector('#inspector .insp-body')?.classList.add('m-bsp'); };
const injectCss = () => { if (!document.getElementById('css-bsp')) { const l = document.createElement('link'); l.id = 'css-bsp'; l.rel = 'stylesheet'; l.href = 'modules/bsp.css?v=20261006134218'; document.head.appendChild(l); } };

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
    ...b.scored.ranked.slice(0, 40).map(r => ({ label: r.company, sub: `Broad Sky fit ${r._score} · ${r._plat}`, href: `#/bsp/rubric?t=${encodeURIComponent(r.id)}`, kind: 'Target', color: PCOL[r._p] })),
    ...(b.graph?.nodes || []).filter(n => /^p-/.test(n.id)).slice(0, 120).map(n => ({ label: n.name, sub: `${TYPE_LABEL[n.type] || ''} · ${n.title || ''}`, href: `#/bsp/network?node=${encodeURIComponent(n.id)}`, kind: 'Network', color: COLOR })),
  ]);
}
const missingNote = (ui, b) => b.missing.length ? ui.note(`Research dataset${b.missing.length > 1 ? 's' : ''} not yet available: ${b.missing.map(Copy.dataset).join(', ')}. This view shows partial results.`, 'warn') + '<div class="mt-12"></div>' : '';
const chip = (fmt, text, col) => fmt.chip(text, col);
const pChip = (fmt, p) => p ? fmt.chip(PLATFORMS[p].short, PCOL[p]) : '—';

/* ── Deal inspector ──────────────────────────────────────────────────────── */
function vehiclesHTML(ctx, d) {
  const { esc, fmt } = ctx; const v = d.co_invest_vehicle;
  if (!v) return '—';
  const list = (v.vehicles || []).map(x => `<li><b>${esc(x.entity)}</b>${x.amount_sold_usd != null ? ` · ${fmt.money(x.amount_sold_usd)} sold` : ''}${x.investors ? ` · ${x.investors} investor${x.investors > 1 ? 's' : ''}` : ''}${x.note ? `<div class="dim small">${esc(words(x.note))}</div>` : ''}</li>`).join('');
  return `<ul class="bsp-ul">${list}</ul>${v.note ? `<div class="dim small mt-4">${esc(words(v.note))}</div>` : ''}`;
}
const vehicleShort = d => { const v = d.co_invest_vehicle; if (!v?.vehicles?.length) return null; const t = v.vehicles.reduce((a, x) => a + (x.amount_sold_usd || 0), 0); return `${v.vehicles[0].entity}${v.vehicles.length > 1 ? ` +${v.vehicles.length - 1}` : ''}${t ? ` · $${(t / 1e6).toFixed(1)}M` : ''}`; };
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
      pats.length ? { label: 'Patterns this deal supports', html: `<div class="row wrap gap-4">${pats.map(p => chip(ctx.fmt, clip(p.pattern.split(':')[0], 60), STR_COL[p.strength])).join(' ')}</div>` } : null,
      { label: 'Source', html: `<div class="small">${ctx.fmt.link(d.source_url, host(d.source_url) || 'Release')}</div><div class="dim small mt-4">Retrieved ${esc(d.retrieved ? fmtDay(d.retrieved) : '—')}</div>` },
    ].filter(Boolean),
    actions: [d.source_url ? { label: 'Release ↗', href: d.source_url } : null, P?.co ? { id: 'mod', label: `${esc(P.short)} module`, onClick: () => app.go(P.co) } : null].filter(Boolean),
  });
}

/* ═══ View: deals ═══ */
async function viewDeals(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.meth) { el.innerHTML = ui.note('Research dataset not yet available: Broad Sky acquisition methodology.', 'warn'); return; }
  indexOnce(app, b); const c = b.cadence;
  const named = b.deals.filter(d => d.deal_type === 'add_on');
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Every deal', sub: `<b>So what:</b> ${c.platforms} anchor acquisitions in ${n1(monthsBetween(b.deals[0].date, b.deals.filter(d => d.deal_type === 'platform').slice(-1)[0].date) / 12)} years, ${c.pePlatforms} bought from other sponsors and the rest from founders, partners or private owners; none of the ${named.length} named add-ons came from a private-equity seller. Read the rationale in each release before you pitch the next one.`, chips: `${fmt.chip('Primary releases and SEC filings', COLOR)} ${fmt.chip('Retrieved Oct 6, 2026', 'var(--dim)')}` })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'Anchor acquisitions', value: fmt.num(c.platforms), sub: `${c.pePlatforms} sponsor secondaries · ${c.platforms - c.pePlatforms} founder, partner or private sellers`, color: COLOR },
      { label: 'Add-ons', value: `${fmt.num(c.addonsStated)}`, sub: `${c.addonsNamed} identified by name`, color: COLOR },
      { label: 'Add-ons from PE sellers', value: fmt.num(c.peAddons), sub: 'Founder, family, partner or franchisee owners', color: 'var(--green)' },
      { label: 'Months between anchor deals', value: n1(c.medianGap), sub: 'Median, Jan 2022 to Feb 2025', color: COLOR },
      { label: 'First exit', value: `${n1(c.exitHold)} mo`, sub: 'Smith + Howard to TPG Growth, Aug 2026', color: 'var(--sys-mute)' },
    ])}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Deal chronology', sub: 'Each mark is a disclosed transaction. Select one to read the rationale, advisers, lenders and co-invest vehicle.', body: `<div class="bsp-stripwrap">${stripSVG(b, PCOL)}</div>`, foot: ui.source(SRC_METH, null, 'Oct 2026') + `<span>Thomas Scientific uses the Jan 2022 announcement; CET uses the Feb 2025 Form D first sale.</span>` })}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Deal ledger', sub: 'Portfolio company, add-on and exit records with seller type, advisers, lenders and co-invest vehicles', body: '<div data-f></div><div class="bsp-ledger" data-t></div>', foot: ui.source(SRC_METH, null, 'Oct 2026') })}
  </div>`;
  const root = el.querySelector('.m-bsp');
  root.querySelectorAll('.bsp-mk').forEach(g => { const go = () => { const d = b.dealById.get(g.dataset.deal); root.querySelectorAll('.bsp-mk').forEach(x => x.classList.toggle('sel', x === g)); openDeal(ctx, b, d); }; g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
  const rows = b.deals.map(d => ({ ...d, _type: DEAL_TYPE[d.deal_type] || d.deal_type, _plat: PLATFORMS[d._p]?.short || d.platform, _seller: sellerLabel(d.seller_type), _buy: words(d.buyer_advisor) || '—', _sell: words(d.seller_advisor) || '—', _lend: words(d.lender_or_capital) || 'Not disclosed', _veh: vehicleShort(d) || '—' }));
  const cols = [
    { key: 'date', label: 'Date', fmt: v => `<span class="num">${esc(fmtMonth(v))}</span>` },
    { key: 'company', label: 'Company', fmt: (v, r) => `<b>${esc(v)}</b>`, wrap: true },
    { key: '_plat', label: 'Portfolio company', fmt: (v, r) => pChip(fmt, r._p) },
    { key: '_type', label: 'Type', fmt: v => esc(v) },
    { key: '_seller', label: 'Seller type', fmt: v => `<div style="min-width:90px">${esc(v)}</div>`, wrap: true },
    { key: '_buy', label: 'Buy-side advisers', fmt: v => `<div class="bsp-cell">${esc(v)}</div>`, wrap: true },
    { key: '_sell', label: 'Sell-side advisers', fmt: v => `<div class="bsp-cell">${esc(v)}</div>`, wrap: true },
    { key: '_lend', label: 'Lenders', fmt: v => `<div class="bsp-cell bsp-cell--wide">${esc(v)}</div>`, wrap: true },
    { key: '_veh', label: 'Co-invest vehicle', fmt: v => `<div class="bsp-cell bsp-cell--narrow">${esc(v)}</div>`, wrap: true },
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
async function viewPatterns(ctx) {
  const { el, ui, fmt, esc, charts, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.meth) { el.innerHTML = ui.note('Research dataset not yet available: Broad Sky acquisition methodology.', 'warn'); return; }
  indexOnce(app, b); const c = b.cadence;
  const strong = b.patterns.filter(p => p.strength === 'strong').length;
  const first = PORDER.map(p => c.firstAddon.find(f => f.p === p)).filter(f => f && f.months != null).map(f => ({ label: PLATFORMS[f.p].short, value: Math.round(f.months * 10) / 10 }));
  const waiting = c.firstAddon.filter(f => f.months == null).map(f => `${PLATFORMS[f.p].short} (${n1(f.sinceMonths)} months, none yet)`);
  const rate = PORDER.map(p => c.rates.find(r => r.p === p)).filter(Boolean).map(r => ({ label: PLATFORMS[r.p].short, value: r.perYear }));
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Deal patterns', sub: `<b>So what:</b> ${strong} of ${b.patterns.length} patterns are strong. Broad Sky buys a thesis first, prefers essential services, keeps founder CEOs, lands the first add-on about ${n1(c.medianFirst)} months after the company and finances each company with a different private-credit lender.`, chips: fmt.chip('Inferred from the public deal record', COLOR) })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'Months between anchor deals', value: n1(c.medianGap), sub: `Median; mean ${n1(c.meanGap)} · ${c.gaps.length} intervals`, color: COLOR },
      { label: 'Months to first add-on', value: n1(c.medianFirst), sub: `Median of ${first.length} companies with an add-on`, color: COLOR },
      { label: 'Add-ons per company-year', value: n1(c.portfolioRate), sub: `Portfolio; ${n1(c.activeRate)} median among active buyers`, color: COLOR },
      { label: 'Hold to first exit', value: `${n1(c.exitHold)} mo`, sub: 'Smith + Howard, 9 add-ons, to TPG Growth', color: 'var(--sys-mute)' },
    ])}
    <div class="mt-12"></div>
    <div class="grid grid-2">
      ${ui.panel({ title: 'Months from company to first add-on', sub: waiting.length ? `Still waiting: ${esc(waiting.join(', '))}` : '', body: charts.hbar(first, { fmt: v => `${n1(v)} mo`, labelW: 130, color: COLOR }), foot: ui.source(SRC_METH, null, 'Oct 2026') })}
      ${ui.panel({ title: 'Add-ons per company-year', sub: 'Broad Sky’s stated add-on counts over years held (Smith + Howard to its Aug 2026 exit)', body: charts.hbar(rate, { fmt: v => n1(v), labelW: 130, color: COLOR }), foot: ui.source(SRC_METH, null, 'Oct 2026') })}
    </div>
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Patterns', sub: 'Each card names the pattern, how strongly the deal record supports it, and what it means for the next deal. Select an evidence chip to open the deal.', body: `<div class="bsp-pats">${b.patterns.map(p => `<article class="bsp-pat" style="--cc:${STR_COL[p.strength] || 'var(--dim)'}"><div class="bsp-pat-h">${fmt.chip(STRENGTH[p.strength] || p.strength, STR_COL[p.strength])}<span class="dim small">${(p.evidence_deal_ids || []).length} deals</span></div><p class="bsp-pat-t">${esc(p.pattern)}</p><p class="bsp-pat-i"><b>For the next deal:</b> ${esc(p.implication_for_next_deals || '—')}</p><div class="bsp-ev">${(p.evidence_deal_ids || []).map(id => { const d = b.dealById.get(id); return d ? `<button type="button" class="bsp-evb" data-deal="${esc(id)}" style="--pc:${PCOL[d._p]}">${esc(clip(d.company, 28))}</button>` : ''; }).join('')}</div><div class="bsp-pat-s">${(p.source_urls || [p.source_url]).filter(Boolean).slice(0, 3).map(u => fmt.link(u, host(u))).join(' · ')}</div></article>`).join('')}</div>`, foot: ui.source(SRC_METH, null, 'Oct 2026') + '<span>Strength and weights are analyst inference, not Broad Sky’s internal criteria.</span>' })}
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Where the deals come from', sub: 'Advisers, banks, counsel and relationship channels, with the deals each touched', body: '<div data-ch></div>', foot: ui.source(SRC_METH, null, 'Oct 2026') })}
  </div>`;
  const root = el.querySelector('.m-bsp');
  root.querySelectorAll('.bsp-evb').forEach(btn => btn.onclick = () => openDeal(ctx, b, b.dealById.get(btn.dataset.deal)));
  const CT = { buy_side_banker: 'Buy-side bank', sell_side_banker: 'Sell-side banks', exit_banker: 'Exit banks', legal_counsel: 'Counsel', accounting_ma_consultant: 'Accounting M&A adviser', platform_relationship: 'Relationships', proprietary_search: 'Retained search', thematic_research: 'Thematic research', capital_partner: 'Capital partners' };
  const rows = b.channels.map(s => ({ ...s, _type: CT[s.channel_type] || String(s.channel_type).replace(/_/g, ' '), _deals: (s.roles || []).map(r => b.dealById.get(r.deal_id)?.company).filter(Boolean).join(', ') }));
  ui.table(root.querySelector('[data-ch]'), { columns: [
    { key: 'channel', label: 'Channel', fmt: v => `<b>${esc(v)}</b>`, wrap: true },
    { key: '_type', label: 'Type', fmt: v => esc(v) },
    { key: 'deal_count', label: 'Deals', num: true, fmt: v => fmt.num(v) },
    { key: '_deals', label: 'Deals touched', fmt: v => `<span title="${esc(v)}">${esc(clip(v, 70))}</span>`, wrap: true },
    { key: 'implication', label: 'What it means', fmt: v => esc(clip(v, 150)), wrap: true },
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
    sub: `${esc(r._plat)} add-on candidate · ${esc([r.hq_city, r.state].filter(Boolean).join(', '))} · ${r._rank ? `#${r._rank} on the Broad Sky rubric` : 'held out of the ranking'}`,
    sections: [
      r._affil ? { label: 'Verify affiliation first', html: ui.note('Trades under a Broad Sky portfolio company’s own name. Held out of the ranking until Punctual Pros confirms it is not already affiliated. Do not contact yet.', 'warn') } : null,
      { label: 'Broad Sky fit', html: `<div class="kpi" style="--kc:${PCOL[r._p]}"><div class="label">Score (inferred rubric)</div><div class="value">${r._score}</div><div class="sub">${esc(r._gate)} · built from ${r._tested}% of the rubric weight · full rubric with portfolio company context ${r._full} · company screen fit ${fmt.num(r.fit_score)}</div></div><div class="small text-2 mt-8">${esc(r._explain)}</div>` },
      { label: 'Criterion scores (0–100)', html: charts.hbar(bars, { max: 100, fmt: v => `${v}`, labelW: 190, color: PCOL[r._p] }) + `<div class="dim small mt-4">Company-level criteria are context; neutral criteria are held at 3 of 5 until diligence measures them. Neither is in the Broad Sky fit score.</div>` },
      { label: 'What drove each test', html: ui.kv(Object.fromEntries(b.criteria.filter(c => TESTS[c.id]?.tested).map(c => [`${critShort(c.id)}${isTargetTest(c.id) ? '' : ' (portfolio company)'}`, esc(r._why[c.id])]))) },
      intro ? { label: intro.sourced ? `Intro path · ${intro.confidence} confidence` : 'Intro path · default route', html: `<div class="bsp-path">${intro.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i>→</i>')}</div><div class="small text-2 mt-4">${esc(intro.path)}</div>${intro.sourced ? `<div class="dim small mt-4">${fmt.link(intro.source_url, host(intro.source_url))}</div>` : ''}` } : null,
      { label: 'First-call script (draft)', html: `<ol class="bsp-script">${script.map(s => `<li><b>${esc(s.k)}.</b> ${esc(s.t)}</li>`).join('')}</ol>` },
      { label: 'Profile', html: ui.kv({ Ownership: esc(r.ownership || '—'), Founded: r.founded_year, Employees: r.employees != null ? fmt.num(r.employees) : null, 'Revenue': r.revenue_est_usd ? `${fmt.money(r.revenue_est_usd)}${EST} <span class="dim small">modeled</span>` : null, Website: r.website ? fmt.link(r.website) : null }) },
      r.risk_flags?.length ? { label: 'Risk flags', html: `<div class="row wrap gap-4">${r.risk_flags.map(x => fmt.chip(x, 'var(--amber)')).join(' ')}</div>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${(r.sources || []).slice(0, 6).map(u => fmt.link(u, host(u) || u)).join('')}</div><div class="dim small mt-4">Screen retrieved ${esc(r.retrieved || '—')}</div>` },
    ].filter(Boolean),
    actions: [r.website ? { label: 'Website ↗', href: r.website } : null, { id: 'pipe', label: 'Open in add-on pipeline', onClick: () => app.go('ma', 'pipeline', { platform: r._p, q: r.company }) }, { id: 'net', label: 'Show path on network', onClick: () => app.go('bsp', 'network', { t: r.id }) }].filter(Boolean),
  });
}

async function viewRubric(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.meth) { el.innerHTML = ui.note('Research dataset not yet available: Broad Sky acquisition methodology.', 'warn'); return; }
  indexOnce(app, b);
  const S = b.scored; const all = S.rows; const ranked = S.ranked;
  const pri = ranked.filter(r => r._gate === 'Priority').length, watch = ranked.filter(r => r._gate === 'Watch list').length;
  const tested = b.criteria.filter(c => isTargetTest(c.id)).reduce((a, c) => a + c.weight_pct, 0);
  const platW = b.criteria.filter(c => TESTS[c.id]?.tested === 'platform').reduce((a, c) => a + c.weight_pct, 0);
  const pools = PORDER.filter(p => all.some(r => r._p === p));
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Acquisition rubric', sub: `<b>So what:</b> <b>${pri} of ${ranked.length} targets clear the 70-point gate</b>, and ${watch} more sit on the watch list. That is most of the list because the company screens already keep only what Broad Sky buys, so <b>the score is for ordering, not for passing or failing a target</b>. Broad Sky closes about one add-on per company-year, so work the top 15 first: use the Top 15 switch on the table below. The score uses the five criteria the screens can test per target (${tested}% of the rubric weight); essentiality and add-on runway are scored at company level (${platW}%), and recurring revenue, tech upside and bench wait for diligence.`, chips: `${fmt.chip('Weights are inferred, not disclosed', 'var(--amber)')} ${fmt.chip(`${ranked.length} targets · ${pools.length} companies`, COLOR)}` })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'Targets scored', value: fmt.num(ranked.length), sub: `${all.length - ranked.length} held out (affiliation check)`, color: COLOR },
      { label: 'Clear the 70 gate', value: `${fmt.num(pri)} of ${fmt.num(ranked.length)}`, sub: 'Most clear it: the score orders the list', color: 'var(--green)' },
      { label: 'Watch list (55–69)', value: fmt.num(watch), sub: 'Re-score after a first call', color: 'var(--amber)' },
      { label: 'Rubric weight tested per target', value: `${tested}%`, sub: `${platW}% at company level · rest in diligence`, color: COLOR },
      ...pools.map(p => ({ label: `Independents · ${PLATFORMS[p].short}`, value: fmt.num(S.indep[p] || 0), sub: 'Fragmentation test (25+ = 5)', color: PCOL[p] })).slice(0, 2),
    ])}
    <div class="mt-12"></div>
    <div class="grid grid-side">
      ${ui.panel({ title: 'The inferred screening criteria', sub: 'Weights sum to 100. Each criterion scores 1–5. Broad Sky fit uses the criteria tested per target, renormalised to 0–100.', body: `<div class="bsp-crit">${b.criteria.slice().sort((a, c) => c.weight_pct - a.weight_pct).map(c => `<div class="bsp-cr" data-crit="${esc(c.id)}"><div class="bsp-cr-h"><span class="bsp-cr-n">${esc(c.criterion)}</span><span class="num">${c.weight_pct}%</span></div><div class="bsp-cr-bar"><i style="width:${c.weight_pct / 15 * 100}%"></i></div><div class="bsp-cr-t">${TESTS[c.id]?.tested ? fmt.chip(TESTS[c.id].tested === 'proxy' ? 'In score · tested by proxy' : TESTS[c.id].tested === 'platform' ? 'Portfolio company level · context' : 'In score · tested per target', TESTS[c.id].tested === 'platform' ? 'var(--accent)' : 'var(--green)') : fmt.chip('Diligence item · not scored', 'var(--dim)')}</div></div>`).join('')}</div>`, foot: ui.source(SRC_METH, null, 'Oct 2026') })}
      ${ui.panel({ title: 'Top 15 by Broad Sky fit', sub: 'Across all company screens. Select a row for the criterion breakdown, intro path and first-call script.', body: '<div data-top></div>', foot: ui.source(SRC_POOLS, null, 'Sept 2026') })}
    </div>
    <div class="mt-12"></div>
    ${ui.panel({ title: 'Every target, scored', sub: 'Ranked by Broad Sky fit. Switch to the top 15 for the call list; sort any column; export the scored pipeline to CSV.', actions: '<div data-top15></div>', body: '<div data-f></div><div data-t></div>', foot: ui.source(SRC_POOLS, null, 'Sept 2026') + `<span>Rubric: ${esc(SRC_METH)}</span>` })}
  </div>`;
  const root = el.querySelector('.m-bsp');
  root.querySelectorAll('.bsp-cr').forEach(x => x.onclick = () => { const c = b.criteria.find(k => k.id === x.dataset.crit); openInsp(ctx, { title: esc(c.criterion), color: COLOR, sub: `Weight ${c.weight_pct}%`, sections: [
    { label: 'How Broad Sky’s deals imply it', html: `<div class="small text-2">${esc(c.test)}</div>` },
    { label: 'Scoring bands', html: ui.kv(Object.fromEntries(Object.entries(c.scoring_bands || {}).sort((a, d) => d[0] - a[0]).map(([k, v]) => [`${k} of 5`, esc(v)]))) },
    { label: 'How the portal tests it', html: `<div class="small text-2">${esc(TESTS[c.id]?.how || '—')}</div>` },
    { label: 'Evidence deals', html: `<div class="row wrap gap-4">${(c.evidence_deal_ids || []).map(id => b.dealById.get(id)).filter(Boolean).map(d => fmt.chip(d.company, PCOL[d._p])).join(' ')}</div>` },
    { label: 'Sources', html: `<div class="col gap-4 small">${(c.source_urls || []).map(u => fmt.link(u, host(u))).join('')}</div>` },
  ] }); });
  const rowsOf = list => list.map(r => ({ ...r, _loc: [r.hq_city, r.state].filter(Boolean).join(', '), _path: introFor(b, r)?.sourced ? introFor(b, r).confidence : '—' }));
  const cols = [
    { key: '_rank', label: '#', num: true, fmt: v => v == null ? '—' : fmt.num(v) },
    { key: 'company', label: 'Target', fmt: (v, r) => `<b>${esc(v)}</b>${r._affil ? ' ' + fmt.chip('verify affiliation', 'var(--red)') : ''}`, wrap: true },
    { key: '_plat', label: 'Company', fmt: (v, r) => pChip(fmt, r._p) },
    { key: '_loc', label: 'Location', fmt: v => esc(v || '—') },
    { key: '_score', label: 'Broad Sky fit', num: true, fmt: (v, r) => fmt.score(v, PCOL[r._p]) },
    { key: '_gate', label: 'Gate', fmt: v => fmt.chip(v, GATE_COL[v]) },
    { key: 'fit_score', label: 'Screen fit', num: true, fmt: v => fmt.num(v) },
    { key: '_path', label: 'Intro path', fmt: v => esc(v) },
    { key: '_explain', label: 'Why', fmt: v => `<span title="${esc(v)}">${esc(clip(v, 120))}</span>`, wrap: true },
  ];
  ui.table(root.querySelector('[data-top]'), { columns: [cols[0], cols[1], cols[2], cols[4], cols[8]], rows: rowsOf(ranked.slice(0, 15)), pageSize: 15, exportName: 'broad_sky_fit_top15', sortKey: '_score', onRow: r => openTarget(ctx, b, r) });
  const allRows = rowsOf([...ranked, ...all.filter(r => r._affil)]);
  let tbl;
  const f = ui.filters(root.querySelector('[data-f]'), [
    { key: 'q', label: 'Search target or town', type: 'search' },
    { key: 'p', label: 'Company', type: 'select', options: pools.map(p => ({ value: p, label: PLATFORMS[p].short })) },
    { key: 'g', label: 'Gate', type: 'select', options: ['Priority', 'Watch list', 'Pass', 'Held out'] },
  ], st => draw(st));
  // Top 15 switch: the call list (ranks 1–15 by Broad Sky fit) or every scored target
  let top15 = params.top === '15' || params.top === '1';
  const draw = (st = f.state) => { const q = (st.q || '').toLowerCase(); let r = allRows.filter(x => (!st.p || x._p === st.p) && (!st.g || x._gate === st.g) && (!q || `${x.company} ${x._loc}`.toLowerCase().includes(q))); if (top15) r = r.filter(x => x._rank && x._rank <= 15); tbl.update(r); f.setCount(top15 ? `${r.length} of the top 15` : `${r.length} targets`); };
  ui.seg(root.querySelector('[data-top15]'), [{ value: 'top', label: 'Top 15' }, { value: 'all', label: `All ${allRows.length}` }], top15 ? 'top' : 'all', v => { top15 = v === 'top'; draw(); });
  tbl = ui.table(root.querySelector('[data-t]'), { columns: cols, rows: allRows, pageSize: 25, exportName: 'broad_sky_fit_scored_pipeline', sortKey: '_score', onRow: r => openTarget(ctx, b, r) });
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
      { label: 'Sources', html: `<div class="col gap-4 small">${det.sources.slice(0, 8).map(u => fmt.link(u, host(u))).join('')}</div><div class="dim small mt-4">Public professional roles only; retrieved ${esc(n.retrieved || '—')}</div>` },
    ].filter(Boolean),
  });
  document.querySelectorAll('#inspector .bsp-link').forEach(btn => btn.onclick = () => { const m = g.byId.get(btn.dataset.node); if (m) { ctl?.select(m.id); openNode(ctx, b, m, ctl); } });
}

async function viewNetwork(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await bundle(ctx.data);
  if (!b.graph) { el.innerHTML = ui.note('Research dataset not yet available: Broad Sky professional network.', 'warn'); return; }
  indexOnce(app, b); const g = b.graph;
  const byG = GROUPS.map(gr => ({ gr, n: g.nodes.filter(n => n._g === gr.id).length }));
  const top = nextFive(b, 8, 3);
  const pathsFor = [...top.map(r => ({ r, ip: introFor(b, r) })), ...g.paths.filter(p => /^next_platform/.test(p.target_ref)).map(p => ({ r: null, ip: { sourced: true, ...p, names: p.path_node_ids.map(id => g.byId.get(id)?.name) } }))];
  el.innerHTML = `<div class="m-bsp">${ui.pageHead({ title: 'Deal network', sub: `<b>So what:</b> the firm runs on a Carlyle and MidOcean lineage, a bench of private-credit lenders and specialist sell-side banks. For add-ons, the shortest path is almost always through the portfolio-company CEO, the franchisor or the banker who sold the company.`, chips: `${fmt.chip('Public professional roles only', 'var(--amber)')} ${fmt.chip(`${g.nodes.length} nodes · ${g.edges.length} sourced edges`, COLOR)}` })}
    ${missingNote(ui, b)}
    ${ui.kpis([
      { label: 'People and organizations', value: fmt.num(g.nodes.length), sub: `${byG[0].n} Broad Sky team · ${byG[1].n} Executive Board`, color: COLOR },
      { label: 'Sourced connections', value: fmt.num(g.edges.length), sub: 'Each with evidence and a source link', color: COLOR },
      { label: 'Intro paths', value: fmt.num(g.paths.length), sub: `${g.paths.filter(p => p.confidence === 'high').length} high confidence · ${g.paths.filter(p => /^next_platform/.test(p.target_ref)).length} next-company themes`, color: COLOR },
      { label: 'Advisers, banks and counsel', value: fmt.num(byG[3].n), sub: `${byG[4].n} lenders, LPs and other sponsors`, color: COLOR },
    ])}
    <div class="mt-12"></div>
    <div class="grid grid-main">
      ${ui.panel({ title: 'Network map', sub: 'Hover to see a node’s connections; select it for role and sources. Search highlights matches.', actions: `<input type="search" class="bsp-search" placeholder="Search people, firms, sectors" aria-label="Search the network">`, body: `<div class="bsp-graph">${graphSVG(g)}</div>${legendHTML()}<div class="bsp-hits dim small" aria-live="polite"></div>`, foot: ui.source(SRC_NET, null, 'Oct 2026') + '<span>Intro paths are hypotheses over public connections, not known relationships.</span>' })}
      ${ui.panel({ title: 'Intro paths for top targets', sub: 'Top Broad Sky fit targets, then next-company themes. Select a path to trace it on the map.', scroll: true, body: `<div class="bsp-paths">${pathsFor.map((x, i) => `<button type="button" class="bsp-pathc" data-i="${i}" style="--pc:${x.r ? PCOL[x.r._p] : COLOR}"><div class="bsp-pathc-h"><b>${esc(x.r ? x.r.company : x.ip.target)}</b>${x.r ? `<span class="num">${x.r._score}</span>` : ''}</div><div class="bsp-pathc-m">${x.r ? `${esc(x.r._plat)} · ` : 'Next company · '}${x.ip?.sourced ? `${esc(x.ip.confidence)} confidence · ${x.ip.hops} hops` : 'default route, unsourced'}</div><div class="bsp-path">${(x.ip?.names || []).filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i>→</i>')}</div></button>`).join('')}</div>`, foot: ui.source(SRC_NET, null, 'Oct 2026') })}
    </div>
  </div>`;
  const root = el.querySelector('.m-bsp');
  let ctl = null;
  ctl = bindGraph(root.querySelector('.bsp-graph'), g, { onSelect: n => openNode(ctx, b, n, ctl) });
  const hits = root.querySelector('.bsp-hits'); let t;
  root.querySelector('.bsp-search').oninput = e => { clearTimeout(t); t = setTimeout(() => { const k = ctl.search(e.target.value); hits.textContent = e.target.value ? `${k} match${k === 1 ? '' : 'es'}` : ''; }, 160); };
  root.querySelectorAll('.bsp-pathc').forEach(btn => btn.onclick = () => { const x = pathsFor[Number(btn.dataset.i)]; root.querySelectorAll('.bsp-pathc').forEach(y => y.classList.toggle('sel', y === btn)); if (x.ip?.path_node_ids) ctl.path(x.ip.path_node_ids); if (x.r) openTarget(ctx, b, x.r); else openInsp(ctx, { title: esc(x.ip.target), color: COLOR, sub: `${esc(x.ip.confidence)} confidence · ${x.ip.hops} hops`, sections: [{ label: 'Path', html: `<div class="bsp-path">${x.ip.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i>→</i>')}</div><div class="small text-2 mt-8">${esc(x.ip.path)}</div>` }, { label: 'Source', html: fmt.link(x.ip.source_url, host(x.ip.source_url)) }] }); });
  if (params.node && g.byId.has(params.node)) { ctl.select(params.node); openNode(ctx, b, g.byId.get(params.node), ctl); }
  if (params.t) { const i = pathsFor.findIndex(x => x.r?.id === params.t); const r = b.scored.rows.find(x => x.id === params.t); const ip = r ? introFor(b, r) : null; if (ip) ctl.path(ip.path_node_ids); if (i >= 0) root.querySelectorAll('.bsp-pathc')[i]?.classList.add('sel'); }
}

export default {
  id: 'bsp', name: 'How Broad Sky buys', tag: 'Method', color: COLOR, group: 'Command',
  tagline: 'The acquisition methodology reverse-engineered from every disclosed Broad Sky deal, applied live to the add-on pipelines',
  views: [
    { id: 'deals', name: 'Deals', icon: '◆', render: viewDeals },
    { id: 'patterns', name: 'Patterns', icon: '≋', render: viewPatterns },
    { id: 'rubric', name: 'Rubric', icon: '▤', render: viewRubric },
    { id: 'network', name: 'Network', icon: '⬡', render: viewNetwork },
  ],
  tour: [
    { order: 925, hash: '#/bsp/deals', caption: '<b>How Broad Sky buys.</b> Every disclosed deal on one strip: seven companies, twenty-one named add-ons and the Smith + Howard exit, each with seller, advisers, lenders and co-invest vehicle.', narration: 'How Broad Sky buys. Every disclosed deal on one strip: seven companies, twenty-one named add-ons and the Smith plus Howard exit, each with its seller, advisers, lenders and co-invest vehicle.' },
    { order: 926, hash: '#/bsp/patterns', caption: '<b>The patterns behind the deals.</b> Thesis first, essential services, founder CEOs stay, first add-on about eight months after the company, a different private-credit lender on every company.', narration: 'The patterns behind the deals. Thesis first, essential services, founder CEOs stay, the first add-on about eight months after the company, and a different private-credit lender on every company.' },
    { order: 927, hash: '#/bsp/rubric', caption: '<b>The rubric, applied.</b> Ten inferred criteria with weights, run live across every add-on target: the top fifteen, why each scores, the intro path and a first-call script.', narration: 'The rubric, applied. Ten inferred criteria with weights, run live across every add-on target, with the top fifteen, why each scores, the intro path and a first-call script.' },
  ],
};
