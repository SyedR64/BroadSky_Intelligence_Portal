import * as Copy from './copy.js?v=20261006134218';
/* Bully Pulpit International — strategic communications & public affairs (BSP majority, Apr 2023).
   Views: overview · opportunities · benchmarks · filings. The DC home-sales view was dropped (Oct 2026 review: not decision-grade for a public-affairs agency).
   Helpers were originally duplicated from fh.js (no cross-module imports); this file no longer mirrors fh.js line for line. */
import { renderFilings, opportunityCard } from '../assets/components.js?v=20261006134218';

/* ── module config (the only block that differs from fh.js) ──────────────── */
const CFG = {
  id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--c-bpi)', hex: '#e05c8a',
  firmId: 'bsp-bpi', oppKey: 'bpi_opportunities', filings: 'bpi_filings', sector: 'communications_agencies', peKey: 'bpi',
  sectorLabel: 'Agency comps', site: 'https://bpigroup.com',
  soWhat: (d) => `BPI has tripled in five years (about half through ${d.addOns} add-ons) into a ~375-425 person transatlantic public-affairs firm. Value creation now depends on replacing presidential-cycle political billings with recurring corporate-affairs, federal and European retainers.`,
  signal: (ctx, d) => {
    // FEC series: OpenFEC by_recipient totals, re-pulled 2026-10-06 (the 2010-2026 series item was dropped from bpi_filings on 2026-09-24 because of HTTP 429).
    const it = (d.filings?.items || []).find(i => i.id === 'bpi-007' || /FEC Schedule B/i.test(i.title || ''));
    const cyc = FEC.cycles.map(([y, v]) => [y, y === 2024 && it?.key_figures?.cycle_total_usd ? Number(it.key_figures.cycle_total_usd) : v]);
    const m = ctx.fmt.money, rng = a => `${m(Math.min(...a))}-${m(Math.max(...a))}`;
    const rows = cyc.map(([y, v]) => ({ label: y === FEC.ytd ? `${y} YTD` : String(y), value: v, color: y === FEC.ytd ? 'var(--amber)' : y % 4 === 0 ? CFG.hex : '#7d8796' }));
    const pres = cyc.filter(([y]) => y % 4 === 0).map(c => c[1]), mid = cyc.filter(([y]) => y % 4 === 2 && y !== FEC.ytd).map(c => c[1]), ytd = cyc.find(([y]) => y === FEC.ytd)?.[1];
    return { title: 'Political billing cycle (FEC)', sub: `Federal-committee disbursements to BPI by 2-year cycle, ${cyc[0][0]}-${FEC.ytd}. Gross billings incl. pass-through media, not revenue`,
      body: ctx.charts.bar(rows, { h: 170, fmt: v => m(v) }) + `<div class="small text-2 mt-8">Presidential cycles (pink) ran <b class="num">${rng(pres)}</b>; midterms (grey) <b class="num">${rng(mid)}</b>. 2026 cycle to date: <b class="num">${m(ytd)}</b> (amber). At a 5-15% agency take (est.), the 2024 cycle was worth about $6-17M of fee revenue, and the corporate book has to absorb that swing every four years.</div>`,
      foot: ctx.ui.source('OpenFEC disbursements by recipient, "bully pulpit" (2024 filing record)', FEC.url, FEC.retrieved) };
  },
  levers: (d, f) => [
    { t: 'Corporate reputation & AI-risk advisory', why: `2026 Reputation Resilience Index (${d.co?.key_metrics?.reputation_resilience_index_2026 || '18k adults'}) gives BPI a proprietary data asset to sell recurring reputation-monitoring retainers.`, href: '#/bpi/opportunities' },
    { t: 'Federal communications recompetes', why: `${d.opps.filter(o => /federal/.test(o.type)).length} federal comms contracts identified; USASpending shows $0 prime federal awards to BPI today, so this is a new channel that needs a teaming or GSA-schedule vehicle.`, href: '#/bpi/opportunities' },
    { t: 'Transatlantic corporate affairs', why: 'BOLDT, Seven Hills, Message House and 365 Sherpas make Germany BPI\'s third-largest market. The next step is cross-selling EU policy work to US Fortune 100 clients.', href: '#/bpi/overview' },
    { t: 'De-risk the political cycle', why: 'Federal political billings swing from $115M (2024) to about $41K (2026 to date). Lenders and exit buyers will price that volatility, so recurring non-political revenue should be pushed above 70%.', href: '#/bpi/filings' },
    { t: 'Multiple arbitrage on tuck-ins', why: `PPHC trades at ~8.4x EBITDA; a scaled sponsor exit likely clears 10-13x. Keep buying $2-5M-EBITDA specialists (sports, litigation comms, insights) with earn-outs. ${f.pe} sponsors are already competing for them.`, href: '#/bpi/benchmarks' },
    { t: 'Make the revenue mix reportable', why: `No public source splits BPI revenue by client type.${f.pphc.corp_comms_public_affairs_segment_rev_2025_usd_m ? ` PPHC discloses its corporate-comms and public-affairs segment ($${f.pphc.corp_comms_public_affairs_segment_rev_2025_usd_m}M of $${f.pphc.revenue_2025_usd_m}M 2025 revenue).` : ''} Report corporate vs political vs public-sector revenue, retainer share and billable utilization monthly; exit buyers will ask for these first.`, href: '#/bpi/filings' },
  ],
  actions: [
    'Stand up a federal capture cell: pick 2 of the recompetes (NASA, DOE EERE) and line up a prime or GSA MAS teaming partner before the RFPs drop.',
    'Productize the Reputation Resilience Index into an annual subscription benchmark for the 170 companies it already scores.',
    'Report revenue split political vs corporate vs public-sector each quarter to BSP and the PineBridge lender group.',
    'Build a 2027 add-on pipeline (EU policy, US state-affairs, insights firms) at 6-9x EBITDA, ahead of Shamrock/Penta and MidOcean.',
  ],
  filingsSoWhat: 'Public records point to a ~$100M+ fee-revenue, ~$20-25M EBITDA agency (est.), funded by $90M of BSP equity plus a PineBridge senior facility. The key underwriting issue is political billings, which swing between $3M and $129M by election cycle.',
};

/* OpenFEC schedule_b/by_recipient totals (recipient_name "bully pulpit"), pulled 2026-10-06 with the public DEMO_KEY. Gross federal-committee
   disbursements to BPI per 2-year cycle; the name match may include a few small unrelated "Bully Pulpit" payees (2018: "Bully Pulpit, Inc"). */
const FEC = { url: 'https://api.open.fec.gov/v1/schedules/schedule_b/by_recipient/?recipient_name=bully%20pulpit&cycle=2024', retrieved: '2026-10-06', ytd: 2026,
  cycles: [[2016, 128967120], [2018, 32485574], [2020, 96485558], [2022, 3143658], [2024, 115309926], [2026, 41037]] };
/* Explicit labels for key_metrics whose auto-humanized key would mislead (e.g. Form D "total amount sold" read as "BSP sold its stake"). */
const LABELS = { bsp_bpi_holdings_sold_usd: 'BSP-BPI Holdings LLC: equity raised (Form D, Apr 2023)', ftes_apr_2023: 'FTEs at BSP entry (Apr 2023)', reputation_resilience_index_2026: 'Reputation Resilience Index 2026', founded: 'Founded' };

/* ── shared helpers ──────────────────────────────────────────────────────── */
const pp = (fmt, v, sign) => v == null || isNaN(v) ? '—' : `${sign && v > 0 ? '+' : ''}${fmt.num(v, 1)}%`;
const label = t => String(t || 'other').replace(/_usd$/, ' ($)').replace(/_pct$/, ' (%)').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).replace(/\b(rfp|ai|dtc|b2b|pe|eu|us|bsp|bpi|ftes?|m|inc5000)\b/gi, m => m.toUpperCase());
const kLabel = k => LABELS[k] || label(k);
const nameCase = s => /[a-z]/.test(s || '') ? s : String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const parseMoney = s => { const m = String(s || '').match(/\$\s?([\d.,]+)\s*(billion|million|thousand|bn|B|M|K)?/i); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, '')); const u = (m[2] || '').toLowerCase(); return n * (u.startsWith('b') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('t') || u === 'k' ? 1e3 : 1); };
const links = (esc, fmt, urls) => `<div class="col gap-4 small">${urls.filter(Boolean).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(fmt.host(u) || u)} ↗</a>`).join('') || '<span class="dim">No source URL</span>'}</div>`;
const divBars = (fmt, rows, { color = CFG.hex, fmtV = v => pp(fmt, v, true), labelW = 70 } = {}) => {
  const mx = Math.max(1, ...rows.map(r => Math.abs(r.value || 0)));
  return `<div class="col gap-4">${rows.map(r => { const w = Math.abs(r.value || 0) / mx * 50; const neg = (r.value || 0) < 0; return `<div class="row" style="gap:8px"><div class="small text-2 ellipsis" style="width:${labelW}px;flex-shrink:0" title="${r.title || ''}">${r.label}</div><div class="grow" style="position:relative;height:12px;background:var(--surface-3);border-radius:3px"><div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border-2)"></div><div style="position:absolute;top:1px;bottom:1px;${neg ? `right:50%` : `left:50%`};width:${w}%;background:${neg ? 'var(--red)' : (r.color || color)};border-radius:2px"></div></div><div class="num small" style="width:58px;text-align:right;flex-shrink:0">${fmtV(r.value)}</div></div>`; }).join('')}</div>`;
};
const metricFmt = ({ fmt, esc }, k, v) => Array.isArray(v) ? esc(v.join(', ')) : typeof v !== 'number' ? esc(v) : /founded|year|rank/i.test(k) ? String(v) : /usd/i.test(k) ? fmt.moneyFull(v) : fmt.num(v);
const kv2 = (esc, t) => { t = String(t ?? '—'); return t.length > 12 ? `<span style="font-size:15px;line-height:1.25;display:inline-block">${esc(t)}</span>` : esc(t); }; // long text KPI values

const byId = (ds, id) => (ds?.items || []).find(i => i.id === id) || null;
async function load(ctx, withDeals = false) {
  const { data } = ctx;
  const [firm, filings, comps, pe, rivalF, playbook] = await Promise.all([data.research('bsp_firm'), data.research(CFG.filings), data.research('public_comps'), data.research('pe_landscape'), withDeals ? data.research('rival_filings') : null, withDeals ? data.research('bpi_playbook') : null]);
  const co = (firm?.items || []).find(i => i.id === CFG.firmId) || null;
  const opps = (firm?.[CFG.oppKey] || []).map((o, i) => ({ ...o, why_now: Copy.noEmail(o.why_now), next_action: Copy.noEmail(o.next_action), id: o.id || `${CFG.id}-opp-${i + 1}`, _value: parseMoney(o.value_or_scale) }));
  const bm = comps?.meta?.sector_benchmarks?.[CFG.sector] || null;
  const peers = (comps?.items || []).filter(c => c.sector_tag === CFG.sector || (c.secondary_sector_tags || []).includes(CFG.sector)).map(c => { const l = (c.fiscal_years || []).slice(-1)[0] || {}; return { ...c, rev: l.revenue_usd, emp: l.employees }; });
  const rivals = (pe?.items || []).filter(p => (p.overlap_with_bsp || []).includes(CFG.peKey));
  const timeline = (firm?.timeline || []).filter(t => String(t.company || '').toLowerCase().startsWith(CFG.name.toLowerCase().slice(0, 8)));
  const pphcItem = byId(filings, 'bpi-022'), pphc = pphcItem?.key_figures || {};
  return { firm, co, opps, filings, comps, bm, peers, pe, rivals, timeline, rivalF, playbook, pphcItem, pphc, addOns: (co?.add_ons || []).length };
}
/* Public-affairs transactions: the primary valuation benchmark for BPI (PPHC floor, FGS/KKR ceiling, Penta and Teneo as sponsor-exit analogs). */
function dealRows(d) {
  const pk = d.pphc, pi = d.pphcItem, fgs = byId(d.rivalF, 'rival-046'), fgsT = byId(d.playbook, 'tpl-fgs-03'), penta = byId(d.playbook, 'tpl-penta-03'), teneo = byId(d.playbook, 'tpl-teneo-01');
  const fgsEst = (d.rivalF?.meta?.estimate_table || []).find(e => /FGS.*EBITDA/i.test(e.metric));
  return [
    pi && { id: 'pphc', deal: 'PPHC: Nasdaq IPO', date: '2026-01', buyer: 'Public market', ev: pk.implied_EV_usd_m ? pk.implied_EV_usd_m * 1e6 : null, evTxt: pk.implied_EV_usd_m ? `$${pk.implied_EV_usd_m}M` : '—', mult: `${pk.implied_EV_to_2025_adj_EBITDA || '—'} 2025 adj. EBITDA`, scale: `$${pk.revenue_2025_usd_m}M revenue · ${pk.adj_EBITDA_margin_2025} adj. EBITDA margin · ${pk.organic_growth_2025} organic growth`, role: 'Floor (public multiple)', confidence: pi.confidence || 'high', lesson: pi.what_it_tells_us, src: [pi.source_url], retrieved: pi.retrieved },
    fgs && { id: 'fgs', deal: 'FGS Global: WPP sells ~50% to KKR', date: fgsT?.date || fgs.filed_or_dated || '2024-08', buyer: 'KKR', ev: fgs.key_figures?.enterprise_value_usd, evTxt: '$1.7B', mult: fgsEst ? `~12-16x 2023 EBITDA (est.; EBITDA ${fgsEst.estimate})` : 'not disclosed', scale: `${fgs.key_figures?.experts || '—'} experts · ${fgs.key_figures?.clients || '—'} clients`, role: 'Ceiling (scaled strategic comms)', confidence: `EV high · multiple ${fgsEst?.confidence || 'n/a'}`, lesson: fgsT?.lesson_for_bpi || fgs.what_it_tells_us, src: [fgs.source_url, fgsT?.source_url], retrieved: fgs.retrieved },
    penta && { id: 'penta', deal: 'Penta Group: Falfurrias sells to Shamrock Capital', date: penta.date, buyer: 'Shamrock Capital', ev: null, evTxt: 'undisclosed', mult: 'terms undisclosed', scale: penta.metric, role: 'Closest analog (~$100M rev., data-led)', confidence: penta.confidence, lesson: penta.lesson_for_bpi, src: [penta.source_url], retrieved: penta.retrieved },
    teneo && { id: 'teneo', deal: 'Teneo: CVC Fund VII replaces BC Partners', date: teneo.date, buyer: 'CVC', ev: 7e8, evTxt: '~$700M (reported)', mult: 'not disclosed', scale: teneo.metric, role: 'Sponsor-to-sponsor analog', confidence: teneo.confidence, lesson: teneo.lesson_for_bpi, src: [teneo.source_url], retrieved: teneo.retrieved },
  ].filter(Boolean);
}

/* ── views ───────────────────────────────────────────────────────────────── */
async function overview(ctx) {
  const { el, ui, fmt, esc, charts } = ctx;
  const d = await load(ctx);
  const co = d.co;
  const fec24 = FEC.cycles.find(c => c[0] === 2024)[1], fecYtd = FEC.cycles.find(c => c[0] === FEC.ytd)[1];
  const est = d.filings?.meta?.estimate_table || [];
  const revEst = est.find(e => /revenue/i.test(e.metric) && /2025/.test(e.metric)) || est.find(e => /revenue/i.test(e.metric));
  const high = d.rivals.filter(r => r.threat_level === 'high').length;
  el.innerHTML = ui.pageHead({ title: esc(CFG.name), sub: `<b>So what:</b> ${esc(CFG.soWhat(d))}`,
    chips: co ? `${fmt.chip(`BSP entry ${co.entry_date}`, CFG.hex)}${fmt.chip(`${String(co.hq_city).split(/[;(]/)[0].trim()}, ${co.state}`)}${fmt.chip(`${d.addOns} add-ons`)}${fmt.chip(co.status === 'held' ? 'Held' : co.status, 'var(--green)')}` : '',
    actions: `<a class="btn" href="#/${CFG.id}/opportunities">Opportunities</a><a class="btn" href="#/${CFG.id}/benchmarks">Benchmarks</a>` }) +
  (co ? '' : ui.note('Company record not found in Broad Sky firm profile. Profile panels are empty until it lands.', 'warn')) +
  ui.kpis([
    { label: 'Growth opportunities', value: fmt.num(d.opps.length), sub: `${new Set(d.opps.map(o => o.type)).size} types · sourced`, color: CFG.color },
    { label: 'Revenue (est.)', value: revEst ? kv2(esc, String(revEst.estimate).split(' (')[0]) : '—', sub: revEst ? `${esc(revEst.metric)} · ${esc(revEst.confidence)} conf.` : `no estimate: ${esc(CFG.filings)} ${d.filings ? 'has no revenue row' : 'not available'}`, color: 'var(--c-fin)' },
    { label: 'Filings & records', value: fmt.num(d.filings?.items?.length || 0), sub: `${(d.filings?.items || []).filter(i => i.confidence === 'high').length} high-confidence`, color: 'var(--accent)' },
    { label: 'Public-affairs valuation floor', value: esc(d.pphc.implied_EV_to_2025_adj_EBITDA || '—'), sub: `PPHC EV / 2025 adj. EBITDA · ceiling: FGS/KKR $1.7B EV`, color: 'var(--c-ma)' },
    { label: 'PE competitors overlapping', value: fmt.num(d.rivals.length), sub: `${high} high threat`, color: 'var(--c-pe)' },
    { label: 'Federal political billings (FEC)', value: fmt.money(fecYtd), sub: `2026 cycle to date vs ${fmt.money(fec24)} in 2024 · gross, not revenue`, color: 'var(--amber)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Company profile', sub: esc(co?.sector || ''), body: co ? `<div class="prose small">${esc(co.description)}</div><h4 class="mt-12 small dim">INVESTMENT THESIS</h4><div class="prose small">${esc(co.thesis)}</div><div class="mt-12">${ui.kv({ Leadership: esc(co.ceo), HQ: esc(co.hq_address || co.hq_city), 'BSP entry': `${esc(co.entry_date)} · <span class="dim">${esc(co.entry_source)}</span>`, Employees: esc(co.employees_est || '—'), 'Capital / co-investors': esc(co.lenders_or_co_investors || '—'), ...Object.fromEntries(Object.entries(co.key_metrics || {}).map(([k, v]) => [kLabel(k), `<span class="num">${metricFmt(ctx, k, v)}</span>`])) })}</div>` : ui.empty('Profile pending'),
      foot: co ? `${ui.source('Broad Sky firm profile', co.sources?.[0], co.retrieved)} · ${(co.sources || []).slice(1, 6).map(u => fmt.link(u)).join(' · ')}` : '' })}
    ${ui.panel({ title: d.addOns ? 'Add-ons & milestones' : 'Milestones', sub: d.addOns ? `${d.addOns} add-ons since BSP entry` : 'No add-ons yet · organic milestones since BSP entry', scroll: true, body: (() => {
      const ev = [...(co?.add_ons || []).map(a => ({ date: a.date, color: CFG.hex, html: `<b>${esc(a.name)}</b> <span class="dim">(${esc(a.hq || '')})</span><div class="small text-2">${esc(a.note || '')}</div>${a.source_url ? `<a class="small" href="${esc(a.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ''}` })),
        ...d.timeline.filter(t => t.type !== 'add_on').map(t => ({ date: t.date, color: '#7d8796', html: `${esc(t.event)}${t.source_url ? ` <a class="small" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return ev.length ? ui.timeline(ev) : ui.empty('No add-ons recorded'); })(), foot: ui.source('Company press releases (Broad Sky firm profile)', CFG.site, d.firm?.meta?.generated) })}
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Growth levers', sub: 'Ranked by value at stake × feasibility (analyst view)', body: `<div class="col gap-12">${CFG.levers(d, { pe: d.rivals.length, pphc: d.pphc }).map((l, i) => `<a href="${l.href}" class="row" style="align-items:flex-start;gap:10px;color:inherit;text-decoration:none"><span class="chip solid" style="--cc:${CFG.hex};min-width:22px;justify-content:center">${i + 1}</span><div><div class="strong small">${esc(l.t)}</div><div class="small text-2">${esc(l.why)}</div></div></a>`).join('')}</div>` })}
    ${(() => { const s = CFG.signal(ctx, d); return ui.panel({ title: s.title, sub: s.sub, body: s.body, foot: s.foot }); })()}
    ${ui.panel({ title: 'Next 90-day actions', sub: 'Recommended owner: BSP deal team + PRG with CEO', accent: true, body: `<ol class="prose small" style="padding-left:4px">${CFG.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>`, foot: ui.source('Synthesis of the Broad Sky firm profile, BPI public filings, public comparables and the private-equity landscape', null, '2026-09-24') })}
  </div>`;
  ctx.app.index([...d.opps.map(o => ({ label: o.title, sub: `${CFG.short} opportunity · ${label(o.type)}`, href: `#/${CFG.id}/opportunities?id=${encodeURIComponent(o.id)}`, kind: 'Opportunity', color: CFG.color })), ...d.rivals.map(r => ({ label: r.firm, sub: `PE competitor to ${CFG.short}`, href: `#/${CFG.id}/benchmarks`, kind: 'PE firm', color: 'var(--c-pe)' }))]);
}

async function opportunities(ctx) {
  const { el, ui, fmt, esc, charts, inspector, params } = ctx;
  const d = await load(ctx);
  if (!d.firm) { el.innerHTML = ui.pageHead({ title: 'Opportunities' }) + ui.note('Research dataset Broad Sky firm profile not yet available.', 'warn'); return; }
  const opps = d.opps; const types = [...new Set(opps.map(o => o.type))];
  const byType = types.map(t => ({ t, rows: opps.filter(o => o.type === t) })).sort((a, b) => b.rows.length - a.rows.length);
  const top = opps.filter(o => o._value).sort((a, b) => b._value - a._value)[0];
  el.innerHTML = ui.pageHead({ title: 'Growth opportunities', sub: `<b>So what:</b> ${fmt.num(opps.length)} sourced opportunities across ${types.length} types. ${top ? `The largest headline value is <b>${fmt.money(top._value)}</b> (${esc(top.title)}).` : 'None carries a disclosed dollar value, so rank them by capital intensity and time-to-revenue.'} Each card shows why it is timely now and links to its primary source.`, chips: byType.map(g => fmt.chip(`${label(g.t)} · ${g.rows.length}`)).join('') }) +
    ui.kpis([
      { label: 'Opportunities', value: fmt.num(opps.length), sub: `${types.length} types`, color: CFG.color },
      ...(top ? [
        { label: 'Quantified', value: fmt.num(opps.filter(o => o._value).length), sub: 'headline $ parsed from value/scale', color: 'var(--green)' },
        { label: 'Largest headline $', value: fmt.money(top._value), sub: esc(label(top.type)), color: 'var(--c-ma)' },
        { label: 'Sum of headline $', value: fmt.money(opps.reduce((a, o) => a + (o._value || 0), 0)), sub: 'quantified items · scale, not revenue', color: 'var(--accent)' },
      ] : [
        { label: 'Largest type', value: kv2(esc, label(byType[0]?.t)), sub: `${byType[0]?.rows.length || 0} of ${opps.length} opportunities`, color: 'var(--c-ma)' },
        { label: 'Primary sources', value: fmt.num(new Set(opps.flatMap(o => [o.source_url, o.source_url_2]).filter(Boolean)).size), sub: 'distinct URLs cited', color: 'var(--green)' },
        { label: 'Dollar-sized', value: '0', sub: 'no disclosed $: size in diligence', color: 'var(--amber)' },
      ]),
    ]) +
    `<div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Opportunities by type', sub: 'Click a card for why-now, source and next action', scroll: true, body: `<div id="op-cards">${byType.map(g => `<h4 class="small dim mt-12 mb-8">${esc(label(g.t).toUpperCase())} · ${g.rows.length}</h4>${ui.cards(g.rows.map(o => card(ctx, o)))}`).join('')}</div>`, foot: ui.source('Broad Sky firm profile: ' + CFG.name + ' opportunities', null, d.firm?.meta?.generated) })}
      <div class="col gap-12">
        ${ui.panel({ title: 'Type mix', body: charts.donut(byType.map((g, i) => ({ label: label(g.t), value: g.rows.length })), { fmt: v => fmt.num(v) }) })}
        ${ui.panel({ title: 'How to prioritize', accent: true, body: `<ol class="prose small" style="padding-left:4px"><li>Timed items first: RFPs, recompetes and seasonal buy windows are fixed (see <i>why now</i>).</li><li>Then capital-light plays that reuse existing assets (practices, licences, add-on teams).</li><li>Assign one owner per card and log it in the BSP value-creation plan; review monthly.</li></ol>` })}
      </div>
    </div>
    <div class="mt-12">${ui.panel({ title: 'All opportunities', sub: 'Sortable · CSV export', body: '<div id="op-tbl"></div>' })}</div>`;
  const open = o => inspector.open({ title: esc(o.title), sub: `${esc(CFG.short)} · ${esc(label(o.type))}`, color: CFG.color, sections: [
    { label: 'Value / scale', html: `<div class="small">${esc(o.value_or_scale || '—')}</div>${o._value ? `<div class="mt-8">${fmt.chip(`headline ${fmt.money(o._value)}`, 'var(--green)')}</div>` : ''}` },
    { label: 'Why now', html: `<div class="small text-2">${esc(o.why_now || '—')}</div>` },
    o.caveat ? { label: 'Caveat', html: `<div class="small" style="color:var(--amber)">${esc(o.caveat)}</div>` } : null,
    { label: 'Sources', html: links(esc, fmt, [o.source_url, o.source_url_2, o.source_url_api]) + `<div class="dim small mt-8">Retrieved ${esc(o.retrieved || '')}</div>` },
    { label: 'Next action', html: `<div class="small text-2">${esc(nextAction(o.type))}</div>` },
  ].filter(Boolean), actions: [o.source_url ? { label: 'Open source ↗', href: o.source_url } : null].filter(Boolean) });
  const cards = byType.flatMap(g => g.rows.map(o => card(ctx, o)));
  ui.bindCards(el.querySelector('#op-cards'), cards, c => open(opps.find(o => o.id === c.id)));
  ui.table(el.querySelector('#op-tbl'), { rows: opps, pageSize: 25, exportName: `${CFG.id}_opportunities`, onRow: open, sortKey: top ? '_value' : 'type', sortDir: top ? -1 : 1, columns: [
    { key: 'type', label: 'Type', fmt: v => fmt.chip(label(v), CFG.hex) },
    { key: 'title', label: 'Opportunity', wrap: true, fmt: v => `<b>${esc(v)}</b>` },
    ...(top ? [{ key: '_value', label: 'Headline $', num: true, fmt: v => fmt.money(v) }] : []),
    { key: 'value_or_scale', label: 'Value / scale', wrap: true, fmt: v => `<span class="small text-2">${esc(v)}</span>` },
    { key: 'why_now', label: 'Why now', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 160))}</span>` },
    { key: 'source_url', label: 'Source', fmt: v => fmt.link(v) },
  ] });
  if (params.id) { const o = opps.find(x => x.id === params.id); if (o) open(o); }
}
const card = (ctx, o) => { const c = opportunityCard(ctx, o, CFG.color); c.sub = ctx.esc(String(o.why_now || '').slice(0, 150)) + (String(o.why_now || '').length > 150 ? '…' : ''); c.chips += ctx.fmt.chip(String(o.value_or_scale || '').split(/[;(]/)[0].replace(/\[\s*'([^\]]*)'\s*\]/g, '$1').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => m.replace(/_/g, ' ')).slice(0, 60), 'var(--muted)'); return c; };
const nextAction = t => /federal|rfp/.test(t) ? 'Confirm contract vehicle and set-aside status on SAM.gov, identify a prime or teaming partner, and build the capture plan 12-18 months before the period ends.'
  : /international|geographic/.test(t) ? 'Size the addressable client list in-market, name a local lead partner, and set a 12-month revenue target with a go/no-go gate.'
  : /wholesale|channel|licens|collab/.test(t) ? 'Build a target-account list, agree terms (margin, MOQ, royalty) and pilot with 3-5 partners before rolling out.'
  : 'Write a one-page business case (revenue, margin, capex, owner) for the next BSP board meeting and set a 90-day pilot.';

async function benchmarks(ctx) {
  const { el, ui, fmt, esc, charts, inspector } = ctx;
  const d = await load(ctx, true);
  if (!d.comps && !d.filings) { el.innerHTML = ui.pageHead({ title: 'Benchmarks' }) + ui.note('Research datasets Public comparables and BPI public filings not yet available.', 'warn'); return; }
  const bm = d.bm || {}; const peers = d.peers.slice().sort((a, b) => (b.rev || 0) - (a.rev || 0));
  const est = (d.filings?.meta?.estimate_table || []).filter(e => /revenue|ebitda|headcount|margin|value/i.test(e.metric)).slice(0, 6);
  const deals = dealRows(d); const pk = d.pphc;
  // Illustrative value bridge: BPI est. adj. EBITDA range x PPHC floor and the 10-13x sponsor-exit range (bpi_playbook phase-4 / serviceos_evidence ve-22).
  const eb = String((d.filings?.meta?.estimate_table || []).find(e => /adj\. ebitda/i.test(e.metric))?.estimate || '').match(/\$(\d+)\s*[-–]\s*(\d+)M/);
  const lo = eb ? +eb[1] : null, hi = eb ? +eb[2] : null, floor = parseFloat(String(pk.implied_EV_to_2025_adj_EBITDA || '').replace(/[^\d.]/g, '')) || null;
  const bridge = lo && floor ? `At BPI's est. $${lo}-${hi}M adj. EBITDA, the PPHC floor (${floor}x) implies ~$${Math.round(lo * floor)}-${Math.round(hi * floor)}M EV, and a 10-13x sponsor exit ~$${lo * 10}-${hi * 13}M (illustrative).` : '';
  const fgsD = deals.find(x => x.id === 'fgs'), pentaD = deals.find(x => x.id === 'penta');
  el.innerHTML = ui.pageHead({ title: 'Public-affairs comparables', sub: `<b>So what:</b> Value ${esc(CFG.short)} against public-affairs deals, not ad holding companies. PPHC's ${esc(pk.implied_EV_to_2025_adj_EBITDA || '~8.4x')} EBITDA IPO is the floor${fgsD ? `, KKR's $1.7B FGS Global deal (~12-16x est.) the ceiling` : ''}${pentaD ? `, and Penta's 2025 sale to Shamrock (~$100M revenue, data-led) the closest analog` : ''}. ${esc(bridge)} Agency holding companies (median growth ${pp(fmt, bm.median_revenue_growth_latest_pct, true)}, margins distorted by impairments) are context only.`,
    chips: `${fmt.chip('Primary: public-affairs transactions', CFG.hex)}${fmt.chip('Secondary: agency holding cos.')}` }) +
    ui.kpis([
      { label: 'PPHC EV / adj. EBITDA', value: esc(pk.implied_EV_to_2025_adj_EBITDA || '—'), sub: `public floor · EV $${esc(pk.implied_EV_usd_m ?? '—')}M on $${esc(pk.adj_EBITDA_2025_usd_m ?? '—')}M 2025 adj. EBITDA`, color: CFG.color },
      { label: 'FGS Global EV (KKR, 2024)', value: fgsD ? '$1.7B' : '—', sub: fgsD ? '~12-16x 2023 EBITDA (est.) · ceiling' : 'Competitor filings not available', color: 'var(--c-ma)' },
      { label: 'PPHC adj. EBITDA margin', value: esc(pk.adj_EBITDA_margin_2025 || '—'), sub: `2024 ${esc(pk.adj_EBITDA_margin_2024 || '—')} · BPI est. 18-24%`, color: 'var(--green)' },
      { label: 'PPHC organic growth', value: esc(pk.organic_growth_2025 || '—'), sub: pk.revenue_2024_usd_m ? `2025 · reported ${pp(fmt, (pk.revenue_2025_usd_m / pk.revenue_2024_usd_m - 1) * 100, true)} incl. M&A` : '2025', color: 'var(--accent)' },
      { label: 'Holding-co median growth', value: pp(fmt, bm.median_revenue_growth_latest_pct, true), sub: `context only · ${esc((bm.comps || []).join(', '))} · op. margin ${pp(fmt, bm.median_operating_margin_latest_pct)}`, color: 'var(--dim)' },
      { label: 'PE competitors', value: fmt.num(d.rivals.length), sub: `${d.rivals.filter(r => r.threat_level === 'high').length} high threat`, color: 'var(--c-pe)' },
    ]) +
    `<div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Public-affairs transactions (primary benchmark)', sub: 'Valuation floor, ceiling and sponsor-exit analogs. Sortable · CSV · click a row for terms, lesson and sources', body: deals.length ? '<div id="deal-tbl"></div>' : ui.empty('Deal datasets (BPI public filings, Competitor filings, BPI growth plan) not available'), foot: ui.source('BPI public filings: PPHC annual report (10-K), competitor filings (WPP 6-K), BPI growth plan templates', d.pphcItem?.source_url, '2026-10-06') })}
      ${ui.panel({ title: `What this implies for ${esc(CFG.short)}`, accent: true, body: `<ol class="prose small" style="padding-left:4px"><li><b>Underwrite to the PPHC floor.</b> ${esc(bridge || 'PPHC trades at ~8.4x 2025 adj. EBITDA.')}</li><li><b>Earn the sponsor premium.</b> FGS, Penta and Teneo cleared above the public multiple on scale, transatlantic reach and proprietary data. BPI needs off-year resilience and recurring retainers to get there.</li><li><b>Match PPHC's disclosure.</b> PPHC reports organic growth and a corporate-affairs segment; BPI's board pack should too.</li></ol>${est.length ? `<h4 class="small dim mt-12">${esc(CFG.short)} ESTIMATES (FILINGS) FOR COMPARISON</h4><div class="col gap-4 mt-8">${est.map(e => `<div class="row" style="align-items:flex-start;gap:10px;border-bottom:1px solid var(--border);padding:4px 0"><div class="grow"><div class="small dim">${esc(e.metric)}</div><div class="strong small num" title="${esc(e.basis || '')}">${esc(e.estimate)}</div></div>${fmt.chip(e.confidence, e.confidence === 'high' ? 'var(--green)' : e.confidence === 'medium' ? 'var(--amber)' : 'var(--dim)')}</div>`).join('')}</div>` : ''}`, foot: ui.source(`${CFG.name} public filings estimate table; BPI growth plan, phase 4`, null, '2026-10-06') })}
    </div>
    ${d.comps ? `<div class="grid grid-main mt-12">
      <div class="col gap-12">
      ${ui.panel({ title: 'Context: agency holding companies', sub: 'Secondary reference only (ad/marketing holding cos., not public-affairs peers). SEC XBRL, latest FY. Click a row for history and 10-K', body: '<div id="bm-tbl"></div>', foot: ui.source('SEC EDGAR XBRL company facts (public comparables)', 'https://www.sec.gov/edgar/search/', d.comps.meta?.generated) })}
      ${ui.panel({ title: 'Holding-co growth, margin and productivity', sub: `Latest FY · red = negative · medians: growth ${pp(fmt, bm.median_revenue_growth_latest_pct, true)}, op. margin ${pp(fmt, bm.median_operating_margin_latest_pct)} (impairment-distorted), rev/emp ${fmt.money(bm.median_revenue_per_employee_usd)}`, body: `<div class="grid grid-3"><div><h4 class="small dim mb-8">REVENUE GROWTH</h4>${divBars(fmt, peers.map(p => ({ label: esc(p.ticker), title: esc(p.company), value: p.revenue_growth_latest_pct })), { labelW: 40 })}</div><div><h4 class="small dim mb-8">OPERATING MARGIN</h4>${divBars(fmt, peers.map(p => ({ label: esc(p.ticker), title: esc(p.company), value: p.operating_margin_latest_pct, color: 'var(--accent)' })), { labelW: 40 })}</div><div><h4 class="small dim mb-8">REVENUE / EMPLOYEE</h4>${charts.hbar(peers.map(p => ({ label: p.ticker, value: p.revenue_per_employee_usd, color: CFG.hex })), { fmt: v => fmt.money(v), labelW: 40 })}</div></div>` })}
      </div>
      ${ui.panel({ title: 'Holding-company read-across', body: `<div class="prose small">${esc(bm.what_this_implies_for_bsp || 'Sector benchmark text pending.')}</div>`, foot: ui.source(`Public comparables: ${Copy.field(CFG.sector).toLowerCase()} sector benchmarks`, null, d.comps.meta?.generated) })}
    </div>` : ui.note('Research dataset Public comparables not yet available (holding-company context).', 'warn')}
    <div class="grid grid-main mt-12">
      ${ui.panel({ title: 'PE competitors overlapping ' + esc(CFG.short), sub: esc(d.pe?.meta?.sector_heatmap?.[CFG.peKey]?.note || 'Sponsors with companies or theses that overlap'), body: '<div id="pe-tbl"></div>', foot: ui.source('Private-equity landscape (firm sites, press, PitchBook-sourced results)', null, d.pe?.meta?.generated) })}
      ${ui.panel({ title: 'Competitive read-out', body: `<div class="col gap-12">${ui.kv({ Intensity: esc(d.pe?.meta?.sector_heatmap?.[CFG.peKey]?.intensity || '—'), 'Most active': esc((d.pe?.meta?.sector_heatmap?.[CFG.peKey]?.most_active || []).map(id => (d.pe?.items || []).find(x => x.id === id)?.firm || id).join(', ')) })}<ol class="prose small" style="padding-left:4px"><li>Treat <b>high-threat</b> sponsors as competing bidders on add-ons: move early with proprietary, founder-direct outreach.</li><li>The same sponsors are <b>exit buyers</b>. Track their fund vintages; a 2023-2026 fund needs deployment.</li><li>Benchmark ${esc(CFG.short)}'s margin and revenue/employee against the comps table before each budget cycle.</li></ol></div>` })}
    </div>`;
  const cols = [
    { key: 'ticker', label: 'Ticker', fmt: v => `<b class="mono">${esc(v)}</b>` },
    { key: 'company', label: 'Company', fmt: (v, r) => `${esc(nameCase(v))}${r.status_note ? ` <span title="${esc(r.status_note)}" style="color:var(--amber)">⚠</span>` : ''}` },
    { key: 'latest_fy', label: 'FY', num: true },
    { key: 'rev', label: 'Revenue', num: true, fmt: v => fmt.money(v) },
    { key: 'revenue_growth_latest_pct', label: 'Growth', num: true, fmt: v => pp(fmt, v, true) },
    { key: 'operating_margin_latest_pct', label: 'Op. margin', num: true, fmt: v => pp(fmt, v) },
    { key: 'ebitda_margin_latest_pct', label: 'EBITDA mgn', num: true, fmt: v => pp(fmt, v) },
    { key: 'revenue_per_employee_usd', label: 'Rev / emp.', num: true, fmt: v => fmt.money(v) },
  ];
  const openDeal = x => inspector.open({ title: esc(x.deal), sub: `${esc(x.date)} · ${esc(x.role)}`, color: CFG.color, sections: [
    { label: 'Terms', html: ui.kv({ Buyer: esc(x.buyer), 'Enterprise value': esc(x.evTxt), Multiple: esc(x.mult), Scale: esc(x.scale), Confidence: esc(x.confidence) }) },
    { label: `Lesson for ${CFG.short}`, html: `<div class="small text-2">${esc(x.lesson || '—')}</div>` },
    { label: 'Sources', html: links(esc, fmt, x.src || []) + `<div class="dim small mt-8">Retrieved ${esc(x.retrieved || '')}</div>` },
    { label: 'Next action', html: `<div class="small text-2">Add ${esc(x.deal.split(':')[0])} to the exit comp set in the BPI board pack and refresh it when new terms are disclosed.</div>` },
  ], actions: x.src?.[0] ? [{ label: 'Open source ↗', href: x.src[0] }] : [] });
  if (deals.length) ui.table(el.querySelector('#deal-tbl'), { rows: deals, pageSize: 10, sortKey: 'date', exportName: `${CFG.id}_public_affairs_deals`, onRow: openDeal, columns: [
    { key: 'deal', label: 'Transaction', wrap: true, fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.role)}</div>` },
    { key: 'date', label: 'Date', fmt: v => `<span class="num">${esc(v)}</span>` },
    { key: 'ev', label: 'EV', num: true, fmt: (v, r) => esc(r.evTxt) },
    { key: 'mult', label: 'Multiple', wrap: true, fmt: v => `<span class="small">${esc(v)}</span>` },
    { key: 'scale', label: 'Scale', wrap: true, fmt: v => `<span class="small text-2">${esc(v)}</span>` },
    { key: 'src', label: 'Source', fmt: v => fmt.link(v?.[0]) },
  ] });
  if (d.comps) ui.table(el.querySelector('#bm-tbl'), { rows: peers, columns: cols, pageSize: 20, sortKey: 'rev', exportName: `${CFG.id}_public_comps`, onRow: p => inspector.open({ title: `${esc(p.ticker)} · ${esc(nameCase(p.company))}`, sub: `${esc(label(p.sector_tag))} · FY${esc(p.latest_fy)}`, color: CFG.color, sections: [
    { label: 'Revenue by fiscal year', html: charts.bar((p.fiscal_years || []).map(f => ({ label: `FY${f.fy}`, value: f.revenue_usd, color: CFG.hex })), { h: 130, fmt: v => fmt.money(v) }) },
    { label: 'Latest year', html: ui.kv({ Revenue: fmt.money(p.rev), Employees: fmt.num(p.emp), Growth: pp(fmt, p.revenue_growth_latest_pct, true), 'CAGR 2023→latest': pp(fmt, p.revenue_cagr_2023_latest_pct, true), 'Op. margin': pp(fmt, p.operating_margin_latest_pct), 'Op. margin (avg)': pp(fmt, p.operating_margin_avg_pct), 'EBITDA margin': pp(fmt, p.ebitda_margin_latest_pct), 'Revenue / employee': fmt.money(p.revenue_per_employee_usd) }) },
    p.status_note || p.employee_note ? { label: 'Notes', html: `<div class="small" style="color:var(--amber)">${esc(p.status_note || '')} ${esc(p.employee_note || '')}</div>` } : null,
    { label: 'Sources', html: links(esc, fmt, [p.tenk_url, p.source_url]) + `<div class="dim small mt-8">${esc(p.tenk_form || '')} filed ${esc(p.tenk_filed || '')} · confidence ${esc(p.confidence || '')}</div>` },
    { label: 'Next action', html: `<div class="small text-2">Use ${esc(p.ticker)}'s margin and revenue/employee as a comparison line in ${esc(CFG.short)}'s monthly KPI pack.</div>` },
  ].filter(Boolean), actions: [p.tenk_url ? { label: 'Open 10-K ↗', href: p.tenk_url } : null].filter(Boolean) }) });
  const threatC = t => t === 'high' ? 'var(--red)' : t === 'medium' ? 'var(--amber)' : 'var(--dim)';
  const rivals = d.rivals.map(r => ({ ...r, _fund: r.latest_fund?.size_usd || null, _tl: { high: 3, medium: 2, low: 1 }[r.threat_level] || 0 }));
  ui.table(el.querySelector('#pe-tbl'), { rows: rivals, pageSize: 15, sortKey: '_tl', exportName: `${CFG.id}_pe_competitors`, columns: [
    { key: 'firm', label: 'Firm', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.hq || '')}</div>` },
    { key: '_tl', label: 'Threat', fmt: (v, r) => fmt.chip(r.threat_level || '—', threatC(r.threat_level)) },
    { key: '_fund', label: 'Latest fund', num: true, title: r => r.latest_fund?.name || '', fmt: (v, r) => `${fmt.money(v)}${r.latest_fund?.year ? `<div class="dim small">${r.latest_fund.year}</div>` : ''}` },
    { key: 'platforms_relevant', label: 'Relevant companies', wrap: true, fmt: v => `<span class="small text-2">${fmt.list((v || []).map(p => p.name), 3)}</span>` },
    { key: 'competes_for', label: 'Competes for', fmt: v => fmt.chip(({ deals: 'Companies', targets: 'Add-on targets', both: 'Companies and add-ons' })[v] || v || '—') },
  ], onRow: r => inspector.open({ title: esc(r.firm), sub: `${esc(r.hq || '')} · founded ${esc(r.founded || '—')} · threat ${esc(r.threat_level)}`, color: 'var(--c-pe)', sections: [
    { label: 'Why it matters to ' + CFG.short, html: `<div class="small text-2">${esc(r.threat_rationale || '')}</div>` },
    { label: 'Fund', html: ui.kv({ 'Latest fund': `${esc(r.latest_fund?.name || '—')} · ${fmt.money(r.latest_fund?.size_usd)}`, AUM: fmt.money(r.aum_usd), 'Check size': r.check_size_usd?.min ? `${fmt.money(r.check_size_usd.min)}–${fmt.money(r.check_size_usd.max)}` : null, Strategy: esc(r.strategy || '') }) },
    { label: 'Relevant companies', html: `<div class="col gap-4 small">${(r.platforms_relevant || []).map(p => `<div><b>${esc(p.name)}</b> <span class="dim">${esc(p.sector || '')}${p.status ? ` · ${esc(p.status)}` : ''}</span>${p.notes ? `<div class="text-2">${esc(p.notes)}</div>` : ''}</div>`).join('') || '—'}</div>` },
    (r.deals_2025_2026 || []).length ? { label: 'Deals 2025-26', html: `<div class="col gap-4 small">${r.deals_2025_2026.map(x => `<div><span class="num dim">${esc(x.date)}</span> ${esc(x.company)} <span class="dim">(${esc(({ platform: 'anchor', add_on: 'add-on', exit: 'exit' })[x.type] || String(x.type || '').replace(/_/g, '-'))})</span></div>`).join('')}</div>` } : null,
    { label: 'Sources', html: links(esc, fmt, [r.website, ...(r.sources || [])].slice(0, 6)) },
    { label: 'Next action', html: `<div class="small text-2">${r.threat_level === 'high' ? 'Map this sponsor\'s live add-on targets against ours; pre-empt with founder outreach and faster diligence.' : 'Monitor fund deployment and keep on the exit-buyer list.'}</div>` },
  ].filter(Boolean), actions: r.website ? [{ label: 'Website ↗', href: r.website }] : [] }) });
  ctx.app.index(peers.map(p => ({ label: `${p.ticker} · ${nameCase(p.company)}`, sub: `${CFG.short} public comp`, href: `#/${CFG.id}/benchmarks`, kind: 'Comp', color: CFG.color })));
}

async function filings(ctx) {
  const { el, ui, fmt, esc } = ctx;
  const data = await ctx.data.research(CFG.filings);
  const items = data?.items || [];
  el.innerHTML = ui.pageHead({ title: 'Filings and financials', sub: data ? `<b>So what:</b> ${esc(CFG.filingsSoWhat || String(data.meta?.financial_picture || '').slice(0, 420))}` : 'Public-record financial picture' }) +
    (data ? ui.kpis([
      { label: 'Records', value: fmt.num(items.length), sub: `${new Set(items.map(i => i.category)).size} categories`, color: CFG.color },
      { label: 'High confidence', value: fmt.num(items.filter(i => i.confidence === 'high').length), sub: 'primary-source pulls', color: 'var(--green)' },
      { label: 'Estimates', value: fmt.num((data.meta?.estimate_table || []).length), sub: 'metric · basis · confidence', color: 'var(--c-fin)' },
      { label: 'Data gaps', value: fmt.num((data.meta?.data_gaps || []).length), sub: `${(data.meta?.next_pulls || []).length} next pulls queued`, color: 'var(--amber)' },
    ]) : '') + '<div id="fil" class="mt-12"></div>';
  // renderFilings expects meta.sources_summary to be an array; research files ship it as a string (normalise here).
  const ss = data?.meta?.sources_summary; const norm = data ? { ...data, meta: { ...data.meta, sources_summary: Array.isArray(ss) ? ss : String(ss || '').split(/(?<=\.)\s+|;\s+/).filter(Boolean) } } : null;
  const fil = el.querySelector('#fil');
  renderFilings(ctx, fil, { data: Copy.filings(norm), color: CFG.color, title: CFG.name });
  // Layout patch (shared component): give the estimate table equal width and let long estimates wrap instead of clipping.
  const g = fil.querySelector('.grid-main'); if (g) g.className = 'grid grid-2';
  fil.querySelectorAll('.grid .panel:nth-child(2) tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { td.style.whiteSpace = 'normal'; td.style.verticalAlign = 'top'; if (i === 0) td.style.width = '28%'; if (i === 1) { td.style.minWidth = '110px'; td.style.textAlign = 'left'; } }));
  if (data) ctx.app.index(items.map(i => ({ label: i.title, sub: `${CFG.short} filing · ${i.category}`, href: `#/${CFG.id}/filings`, kind: 'Filing', color: CFG.color })));
}

export default {
  id: CFG.id, name: CFG.short, tag: CFG.id === 'bpi' ? 'Comms' : 'Consumer', color: CFG.color, group: 'Portfolio',
  tagline: CFG.id === 'bpi' ? 'Strategic communications & public affairs, DC-headquartered, transatlantic' : 'Sustainable beachwear from recycled plastic: DTC, wholesale and two owned stores',
  hq: CFG.id === 'bpi' ? { lat: 38.9072, lon: -77.0369, label: 'Washington, DC' } : { lat: 40.7128, lon: -74.006, label: 'New York, NY' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'opportunities', name: 'Opportunities', icon: '◆', render: opportunities },
    { id: 'benchmarks', name: 'Benchmarks', icon: '▤', render: benchmarks },
    { id: 'filings', name: 'Filings and financials', icon: '§', render: filings },
  ],
  tour: [
    { order: 600, hash: '#/bpi/overview', caption: '<b>Bully Pulpit International.</b> A ~400-person transatlantic public-affairs firm built on 6 add-ons since Broad Sky\'s April 2023 investment.', narration: 'Bully Pulpit is a roughly four-hundred-person transatlantic public-affairs firm, built on six add-ons since April 2023.', duration: 7000 },
    { order: 610, hash: '#/bpi/opportunities', caption: '<b>12 sourced growth opportunities</b>: federal comms recompetes, AI-era reputation work, litigation comms and EU corporate affairs.', narration: 'Twelve sourced growth plays, from federal communications recompetes to AI-era reputation advisory.', duration: 5500 },
    { order: 620, hash: '#/bpi/benchmarks', caption: '<b>Valued against public-affairs deals</b>: PPHC\'s ~8.4x EBITDA IPO is the floor, KKR\'s $1.7B FGS Global deal the ceiling, Penta\'s sale to Shamrock the closest analog.', narration: 'BPI is benchmarked against public-affairs deals: PPHC at about eight times EBITDA as the floor, and KKR\'s one-point-seven-billion-dollar FGS Global deal as the ceiling.', duration: 7000 },
  ],
};
