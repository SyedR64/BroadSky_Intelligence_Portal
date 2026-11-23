import * as Copy from './copy.js?v=20261123143257';
/* Bully Pulpit International — strategic communications & public affairs (BSP majority, Apr 2023).
   Views: overview · opportunities · filings (comparables live on Fundamentals › Public comparables). The DC home-sales view was dropped (Oct 2026 review: not decision-grade for a public-affairs agency).
   Helpers were originally duplicated from fh.js (no cross-module imports); this file no longer mirrors fh.js line for line. */
import { renderFilings, opportunityCard } from '../assets/components.js?v=20261123143257';
import { companyLinks } from './company-links.js?v=20261123143257';

/* ── module config (the only block that differs from fh.js) ──────────────── */
const CFG = {
  id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--co-bpi)', hex: 'var(--co-bpi)',
  firmId: 'bsp-bpi', oppKey: 'bpi_opportunities', filings: 'bpi_filings', sector: 'communications_agencies', peKey: 'bpi',
  sectorLabel: 'Agency comps', site: 'https://bpigroup.com',
  soWhat: (d) => `BPI has tripled in five years, half of it through ${d.addOns} add-ons. The next step is replacing election-cycle billings with recurring corporate, federal and European retainers.`,
  signal: (ctx, d) => {
    // FEC series: OpenFEC by_recipient totals, re-pulled 2026-10-06 (the 2010-2026 series item was dropped from bpi_filings on 2026-09-24 because of HTTP 429).
    const it = (d.filings?.items || []).find(i => i.id === 'bpi-007' || /FEC Schedule B/i.test(i.title || ''));
    const cyc = FEC.cycles.map(([y, v]) => [y, y === 2024 && it?.key_figures?.cycle_total_usd ? Number(it.key_figures.cycle_total_usd) : v]);
    const m = ctx.fmt.money, rng = a => `${m(Math.min(...a))}-${m(Math.max(...a))}`;
    const rows = cyc.map(([y, v]) => ({ label: y === FEC.ytd ? `${y} YTD` : String(y), value: v, color: y === FEC.ytd ? 'var(--sys-warn)' : y % 4 === 0 ? CFG.hex : 'var(--sys-mute-2)' }));
    const pres = cyc.filter(([y]) => y % 4 === 0).map(c => c[1]), mid = cyc.filter(([y]) => y % 4 === 2 && y !== FEC.ytd).map(c => c[1]), ytd = cyc.find(([y]) => y === FEC.ytd)?.[1];
    return { title: 'Political billing cycle (FEC)', sub: `Federal-committee disbursements to BPI by 2-year cycle, ${cyc[0][0]}-${FEC.ytd}. Gross billings incl. pass-through media, not revenue`,
      body: ctx.charts.bar(rows, { h: 170, fmt: v => m(v) }) + `<div class="small text-2 mt-8">Presidential cycles (pink) ran <b class="num">${rng(pres)}</b>; midterms (grey) <b class="num">${rng(mid)}</b>. 2026 cycle to date: <b class="num">${m(ytd)}</b> (amber). At a 5-15% agency take (est.), the 2024 cycle was worth about $6-17M of fee revenue, and the corporate book has to absorb that swing every four years.</div>`,
      foot: ctx.ui.source('OpenFEC disbursements by recipient, "bully pulpit" (2024 filing record)', FEC.url, words(FEC.retrieved)) };
  },
  levers: (d, f) => [
    { t: 'Corporate reputation & AI-risk advisory', why: `2026 Reputation Resilience Index (${d.co?.key_metrics?.reputation_resilience_index_2026 || '18k adults'}) gives BPI a proprietary data asset to sell recurring reputation-monitoring retainers.`, href: '#/bpi/opportunities' },
    { t: 'Federal communications recompetes', why: `${d.opps.filter(o => /federal/.test(o.type)).length} federal comms contracts identified; USASpending shows $0 prime federal awards to BPI today, so this is a new channel that needs a teaming or GSA-schedule vehicle.`, href: '#/bpi/opportunities' },
    { t: 'Transatlantic corporate affairs', why: 'BOLDT, Seven Hills, Message House and 365 Sherpas make Germany BPI\'s third-largest market. The next step is cross-selling EU policy work to US Fortune 100 clients.', href: '#/bpi/overview' },
    { t: 'De-risk the political cycle', why: 'Federal political billings swing from $115M (2024) to about $41K (2026 to date). Lenders and exit buyers will price that volatility, so recurring non-political revenue should be pushed above 70%.', href: '#/bpi/filings' },
    { t: 'Multiple arbitrage on tuck-ins', why: `PPHC trades at ~8.4x EBITDA; a scaled sponsor exit likely clears 10-13x. Keep buying $2-5M-EBITDA specialists (sports, litigation comms, insights) with earn-outs. ${f.pe} sponsors are already competing for them.`, href: `#/fin/comps?sector=communications_agencies` },
    { t: 'Make the revenue mix reportable', why: `No public source splits BPI revenue by client type.${f.pphc.corp_comms_public_affairs_segment_rev_2025_usd_m ? ` PPHC discloses its corporate-comms and public-affairs segment ($${f.pphc.corp_comms_public_affairs_segment_rev_2025_usd_m}M of $${f.pphc.revenue_2025_usd_m}M 2025 revenue).` : ''} Report corporate vs political vs public-sector revenue, retainer share and billable utilization monthly; exit buyers will ask for these first.`, href: '#/bpi/filings' },
  ],
  actions: [
    'Stand up a federal capture cell: pick 2 of the recompetes (NASA, DOE EERE) and line up a prime or GSA MAS teaming partner before the RFPs drop.',
    'Productize the Reputation Resilience Index into an annual subscription benchmark for the 170 companies it already scores.',
    'Report revenue split political vs corporate vs public-sector each quarter to BSP and the PineBridge lender group.',
    'Build a 2027 add-on pipeline (EU policy, US state-affairs, insights firms) at 6-9x EBITDA, ahead of Shamrock/Penta and MidOcean.',
  ],
  filingsSoWhat: 'Public records point to an est. ~$100M+ of fee revenue and ~$20-25M EBITDA. The key risk is political billings, which swing from $3M to $129M by election cycle.',
};

/* OpenFEC schedule_b/by_recipient totals (recipient_name "bully pulpit"), pulled 2026-10-06 with the public DEMO_KEY. Gross federal-committee
   disbursements to BPI per 2-year cycle; the name match may include a few small unrelated "Bully Pulpit" payees (2018: "Bully Pulpit, Inc"). */
const FEC = { url: 'https://api.open.fec.gov/v1/schedules/schedule_b/by_recipient/?recipient_name=bully%20pulpit&cycle=2024', retrieved: '2026-10-06', ytd: 2026,
  cycles: [[2016, 128967120], [2018, 32485574], [2020, 96485558], [2022, 3143658], [2024, 115309926], [2026, 41037]] };
/* Explicit labels for key_metrics whose auto-humanized key would mislead (e.g. Form D "total amount sold" read as "BSP sold its stake"). */
const LABELS = { bsp_bpi_holdings_sold_usd: 'BSP-BPI Holdings LLC: equity raised (Form D, Apr 2023)', ftes_apr_2023: 'FTEs at BSP entry (Apr 2023)', reputation_resilience_index_2026: 'Reputation Resilience Index 2026', founded: 'Founded' };

/* ── shared helpers ──────────────────────────────────────────────────────── */
const label = t => String(t || 'other').replace(/_usd$/, ' ($)').replace(/_pct$/, ' (%)').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).replace(/\b(rfp|ai|dtc|b2b|pe|eu|us|bsp|bpi|ftes?|m|inc5000)\b/gi, m => m.toUpperCase());
const kLabel = k => LABELS[k] || label(k);
const parseMoney = s => { const m = String(s || '').match(/\$\s?([\d.,]+)\s*(billion|million|thousand|bn|B|M|K)?/i); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, '')); const u = (m[2] || '').toLowerCase(); return n * (u.startsWith('b') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('t') || u === 'k' ? 1e3 : 1); };
const links = (esc, fmt, urls) => `<div class="col gap-4 small">${urls.filter(Boolean).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(fmt.host(u) || u)} ↗</a>`).join('') || '<span class="dim">No source URL</span>'}</div>`;
/* lever list: the system card list (title link + reason) */
const leverList = (esc, items) => `<ul class="sys-card-list" data-co="${CFG.id}">${items.map(l => `<li><b><a href="${esc(l.href)}">${esc(l.t)}</a></b><div>${esc(l.why)}</div></li>`).join('')}</ul>`;
const words = s => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +(m[3] || 15)).toLocaleDateString('en-US', m[3] ? { month: 'long', day: 'numeric', year: 'numeric' } : { month: 'long', year: 'numeric' }) : s; };
const metricFmt = ({ fmt, esc }, k, v) => Array.isArray(v) ? esc(v.join(', ')) : typeof v !== 'number' ? esc(v) : /founded|year|rank/i.test(k) ? String(v) : /usd/i.test(k) ? fmt.moneyFull(v) : fmt.num(v);
const kv2 = (esc, t) => { t = String(t ?? '—'); return t.length > 12 ? `<span class="sys-card-title">${esc(t)}</span>` : esc(t); }; // long text KPI values read at the card-title size

const byId = (ds, id) => (ds?.items || []).find(i => i.id === id) || null;
async function load(ctx) {
  const { data } = ctx;
  const [firm, filings, pe] = await Promise.all([data.research('bsp_firm'), data.research(CFG.filings), data.research('pe_landscape')]);
  const co = (firm?.items || []).find(i => i.id === CFG.firmId) || null;
  const opps = (firm?.[CFG.oppKey] || []).map((o, i) => ({ ...o, why_now: Copy.noEmail(o.why_now), next_action: Copy.noEmail(o.next_action), id: o.id || `${CFG.id}-opp-${i + 1}`, _value: parseMoney(o.value_or_scale) }));
  const rivals = (pe?.items || []).filter(p => (p.overlap_with_bsp || []).includes(CFG.peKey));
  const timeline = (firm?.timeline || []).filter(t => String(t.company || '').toLowerCase().startsWith(CFG.name.toLowerCase().slice(0, 8)));
  const pphcItem = byId(filings, 'bpi-022'), pphc = pphcItem?.key_figures || {};
  return { firm, co, opps, filings, pe, rivals, timeline, pphcItem, pphc, addOns: (co?.add_ons || []).length };
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
  el.innerHTML = ui.pageHead({ title: esc(CFG.name), sub: `${esc(CFG.soWhat(d))}`,
    chips: co ? `${fmt.chip(`Held since ${words(co.entry_date).replace(/ \d{1,2},/, '')}`, CFG.hex)}${fmt.chip(`${String(co.hq_city).split(/[;(]/)[0].trim()}, ${co.state}`)}${fmt.chip(`${d.addOns} add-ons`)}<span class="sys-chip sys-chip--good">${co.status === 'held' ? 'Held' : esc(co.status)}</span>` : '',
    actions: `<a class="sys-btn sys-btn--primary" href="#/${CFG.id}/opportunities">Opportunities</a><a class="sys-btn sys-btn--secondary" href="#/fin/comps?sector=${CFG.sector}">Public comparables</a>` }) + companyLinks(CFG.id) +
  (co ? '' : ui.note('Company record not found in BSP firm profile. Profile panels are empty until it lands.', 'warn')) +
  ui.kpis([
    { label: 'Growth opportunities', value: fmt.num(d.opps.length), sub: `${new Set(d.opps.map(o => o.type)).size} types · sourced`, color: CFG.color },
    { label: 'Revenue (est.)', value: revEst ? kv2(esc, String(revEst.estimate).split(' (')[0]) : '—', sub: revEst ? `${esc(revEst.metric)} · ${esc(revEst.confidence)} confidence` : `no estimate: BPI public filings ${d.filings ? 'have no revenue row' : 'not available'}`, color: 'var(--sys-info)' },
    { label: 'Filings & records', value: fmt.num(d.filings?.items?.length || 0), sub: `${(d.filings?.items || []).filter(i => i.confidence === 'high').length} high-confidence`, color: 'var(--sys-info)' },
    { label: 'Public-affairs valuation floor', value: esc(d.pphc.implied_EV_to_2025_adj_EBITDA || '—'), sub: `PPHC EV / adj. EBITDA · ceiling FGS/KKR`, color: 'var(--sys-warn)' },
    { label: 'PE competitors overlapping', value: fmt.num(d.rivals.length), sub: `${high} high threat`, color: 'var(--sys-mute)' },
    { label: 'Federal political billings (FEC)', value: fmt.money(fecYtd), sub: `2026 to date vs ${fmt.money(fec24)} in 2024`, color: 'var(--sys-warn)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Company profile', sub: esc(co?.sector || ''), body: co ? `<div class="prose small">${esc(co.description)}</div><h4 class="sys-card-label mt-16">Investment thesis</h4><div class="prose small">${esc(co.thesis)}</div><div class="mt-12">${ui.kv({ Leadership: esc(co.ceo), HQ: esc(co.hq_address || co.hq_city), 'BSP entry': `${esc(words(co.entry_date))} · <span class="dim">${esc(co.entry_source)}</span>`, Employees: esc(co.employees_est || '—'), 'Capital / co-investors': esc(co.lenders_or_co_investors || '—'), ...Object.fromEntries(Object.entries(co.key_metrics || {}).map(([k, v]) => [kLabel(k), `<span class="num">${metricFmt(ctx, k, v)}</span>`])) })}</div>` : ui.empty('Profile pending'),
      foot: co ? `${ui.source('BSP firm profile', co.sources?.[0], co.retrieved)} · ${(co.sources || []).slice(1, 6).map(u => fmt.link(u)).join(' · ')}` : '' })}
    ${ui.panel({ title: d.addOns ? 'Add-ons & milestones' : 'Milestones', sub: d.addOns ? `${d.addOns} add-ons since BSP entry` : 'No add-ons yet · organic milestones since BSP entry', scroll: true, body: (() => {
      const ev = [...(co?.add_ons || []).map(a => ({ date: a.date, color: CFG.hex, html: `<b>${esc(a.name)}</b> <span class="dim">(${esc(a.hq || '')})</span><div class="small text-2">${esc(a.note || '')}</div>${a.source_url ? `<a class="small" href="${esc(a.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ''}` })),
        ...d.timeline.filter(t => t.type !== 'add_on').map(t => ({ date: t.date, color: 'var(--sys-mute-2)', html: `${esc(t.event)}${t.source_url ? ` <a class="small" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return ev.length ? ui.timeline(ev) : ui.empty('No add-ons recorded'); })(), foot: ui.source('Company press releases (BSP firm profile)', CFG.site, d.firm?.meta?.generated) })}
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Growth levers', sub: 'Ranked by value at stake × feasibility (analyst view)', body: leverList(esc, CFG.levers(d, { pe: d.rivals.length, pphc: d.pphc })) })}
    ${(() => { const s = CFG.signal(ctx, d); return ui.panel({ title: s.title, sub: s.sub, body: s.body, foot: s.foot }); })()}
    ${ui.panel({ title: 'Next 90-day actions', sub: 'Recommended owner: BSP deal team + PRG with CEO', accent: true, body: `<ol class="prose small">${CFG.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>`, foot: ui.source('Synthesis of the BSP firm profile, BPI public filings, public comparables and the private-equity landscape', null, 'September 24, 2026') })}
  </div>`;
  ctx.app.index([...d.opps.map(o => ({ label: o.title, sub: `${CFG.short} opportunity · ${label(o.type)}`, href: `#/${CFG.id}/opportunities?id=${encodeURIComponent(o.id)}`, kind: 'Opportunity', color: CFG.color })), ...d.rivals.map(r => ({ label: r.firm, sub: `PE competitor to ${CFG.short}`, href: `#/pe/landscape?firm=${encodeURIComponent(r.id)}`, kind: 'PE firm', color: 'var(--sys-mute)' }))]);
}

async function opportunities(ctx) {
  const { el, ui, fmt, esc, charts, inspector, params } = ctx;
  const d = await load(ctx);
  if (!d.firm) { el.innerHTML = ui.pageHead({ title: 'Opportunities' }) + ui.note('Research dataset BSP firm profile not yet available.', 'warn'); return; }
  const opps = d.opps; const types = [...new Set(opps.map(o => o.type))];
  const byType = types.map(t => ({ t, rows: opps.filter(o => o.type === t) })).sort((a, b) => b.rows.length - a.rows.length);
  const top = opps.filter(o => o._value).sort((a, b) => b._value - a._value)[0];
  el.innerHTML = ui.pageHead({ title: 'Growth opportunities', sub: `${fmt.num(opps.length)} sourced opportunities. ${top ? `The largest is <b>${fmt.money(top._value)}</b>: ${esc(String(top.title).split(' (')[0])}.` : 'None has a disclosed dollar value, so rank by capital and time to revenue.'}`, chips: byType.map(g => fmt.chip(`${label(g.t).split(' ').slice(0, 3).join(' ')} · ${g.rows.length}`)).join('') }) +
    ui.kpis([
      { label: 'Opportunities', value: fmt.num(opps.length), sub: `${types.length} types`, color: CFG.color },
      ...(top ? [
        { label: 'Quantified', value: fmt.num(opps.filter(o => o._value).length), sub: 'headline $ parsed from value/scale', color: 'var(--sys-good)' },
        { label: 'Largest headline $', value: fmt.money(top._value), sub: esc(label(top.type)), color: 'var(--sys-warn)' },
        { label: 'Sum of headline $', value: fmt.money(opps.reduce((a, o) => a + (o._value || 0), 0)), sub: 'quantified items · scale, not revenue', color: 'var(--sys-info)' },
      ] : [
        { label: 'Largest type', value: kv2(esc, label(byType[0]?.t)), sub: `${byType[0]?.rows.length || 0} of ${opps.length} opportunities`, color: 'var(--sys-warn)' },
        { label: 'Primary sources', value: fmt.num(new Set(opps.flatMap(o => [o.source_url, o.source_url_2]).filter(Boolean)).size), sub: 'distinct URLs cited', color: 'var(--sys-good)' },
        { label: 'Dollar-sized', value: '0', sub: 'no disclosed $: size in diligence', color: 'var(--sys-warn)' },
      ]),
    ]) +
    `<div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Opportunities by type', sub: 'Click a card for why-now, source and next action', scroll: true, body: `<div id="op-cards">${byType.map(g => `<h4 class="sys-card-label mt-16 mb-8">${esc(label(g.t))} · ${g.rows.length}</h4>${ui.cards(g.rows.map(o => card(ctx, o)))}`).join('')}</div>`, foot: ui.source('BSP firm profile: ' + CFG.name + ' opportunities', null, d.firm?.meta?.generated) })}
      <div class="col gap-12">
        ${ui.panel({ title: 'Type mix', body: charts.donut(byType.map((g, i) => ({ label: label(g.t), value: g.rows.length })), { fmt: v => fmt.num(v) }) })}
        ${ui.panel({ title: 'How to prioritize', accent: true, body: `<ol class="prose small"><li>Timed items first: RFPs, recompetes and seasonal buy windows are fixed (see <i>why now</i>).</li><li>Then capital-light plays that reuse existing assets (practices, licences, add-on teams).</li><li>Assign one owner per card and log it in the BSP value-creation plan; review monthly.</li></ol>` })}
      </div>
    </div>
    <div class="mt-12">${ui.panel({ title: 'All opportunities', sub: 'Sortable · CSV export', body: '<div id="op-tbl"></div>' })}</div>`;
  const open = o => inspector.open({ title: esc(o.title), sub: `${esc(CFG.short)} · ${esc(label(o.type))}`, color: CFG.color, sections: [
    { label: 'Value / scale', html: `<div class="small">${esc(o.value_or_scale || '—')}</div>${o._value ? `<div class="sys-chips mt-8"><span class="sys-chip sys-chip--good">Headline ${fmt.money(o._value)}</span></div>` : ''}` },
    { label: 'Why now', html: `<div class="small text-2">${esc(o.why_now || '—')}</div>` },
    o.caveat ? { label: 'Caveat', html: ui.note(esc(o.caveat), 'warn') } : null,
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
const card = (ctx, o) => { const c = opportunityCard(ctx, o, CFG.color); c.sub = ctx.esc(String(o.why_now || '').slice(0, 150)) + (String(o.why_now || '').length > 150 ? '…' : ''); c.chips += ctx.fmt.chip(String(o.value_or_scale || '').split(/[;(]/)[0].replace(/\[\s*'([^\]]*)'\s*\]/g, '$1').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => m.replace(/_/g, ' ')).slice(0, 60)); return c; };
const nextAction = t => /federal|rfp/.test(t) ? 'Confirm contract vehicle and set-aside status on SAM.gov, identify a prime or teaming partner, and build the capture plan 12-18 months before the period ends.'
  : /international|geographic/.test(t) ? 'Size the addressable client list in-market, name a local lead partner, and set a 12-month revenue target with a go/no-go gate.'
  : /wholesale|channel|licens|collab/.test(t) ? 'Build a target-account list, agree terms (margin, MOQ, royalty) and pilot with 3-5 partners before rolling out.'
  : 'Write a one-page business case (revenue, margin, capex, owner) for the next BSP board meeting and set a 90-day pilot.';

async function filings(ctx) {
  const { el, ui, fmt, esc } = ctx;
  const data = await ctx.data.research(CFG.filings);
  const items = data?.items || [];
  el.innerHTML = ui.pageHead({ title: 'Public filings', sub: data ? `${esc(CFG.filingsSoWhat || String(data.meta?.financial_picture || '').slice(0, 420))}` : 'Public-record financial picture' }) +
    (data ? ui.kpis([
      { label: 'Records', value: fmt.num(items.length), sub: `${new Set(items.map(i => i.category)).size} categories`, color: CFG.color },
      { label: 'High confidence', value: fmt.num(items.filter(i => i.confidence === 'high').length), sub: 'primary-source pulls', color: 'var(--sys-good)' },
      { label: 'Estimates', value: fmt.num((data.meta?.estimate_table || []).length), sub: 'metric · basis · confidence', color: 'var(--sys-info)' },
      { label: 'Data gaps', value: fmt.num((data.meta?.data_gaps || []).length), sub: `${(data.meta?.next_pulls || []).length} next pulls queued`, color: 'var(--sys-warn)' },
    ]) : '') + '<div id="fil" class="mt-12"></div>';
  // renderFilings expects meta.sources_summary to be an array; research files ship it as a string (normalise here).
  const ss = data?.meta?.sources_summary; const norm = data ? { ...data, meta: { ...data.meta, sources_summary: Array.isArray(ss) ? ss : String(ss || '').split(/(?<=\.)\s+|;\s+/).filter(Boolean) } } : null;
  const fil = el.querySelector('#fil');
  renderFilings(ctx, fil, { data: Copy.filings(norm), color: CFG.color, title: CFG.name });
  // Layout patch (shared component): give the estimate table equal width and let long estimates wrap instead of clipping.
  const g = fil.querySelector('.grid-main'); if (g) g.className = 'grid grid-2';
  fil.querySelectorAll('.grid .panel:nth-child(2) tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { td.style.whiteSpace = 'normal'; td.style.verticalAlign = 'top'; if (i === 0) td.style.width = '28%'; if (i === 1) { td.style.minWidth = '110px'; td.style.textAlign = 'left'; } }));
  if (data) ctx.app.index(items.map(i => ({ label: i.title, sub: `${CFG.short} filing · ${Copy.category(i.category)}`, href: `#/${CFG.id}/filings`, kind: 'Filing', color: CFG.color })));
}

export default {
  id: CFG.id, name: CFG.short, tag: CFG.id === 'bpi' ? 'Comms' : 'Consumer', color: CFG.color, group: 'Portfolio',
  tagline: CFG.id === 'bpi' ? 'Strategic communications & public affairs, DC-headquartered, transatlantic' : 'Sustainable beachwear from recycled plastic: DTC, wholesale and two owned stores',
  hq: CFG.id === 'bpi' ? { lat: 38.9072, lon: -77.0369, label: 'Washington, DC' } : { lat: 40.7128, lon: -74.006, label: 'New York, NY' },
  views: [
    { id: 'overview', name: 'Operating picture', icon: '◉', render: overview },
    { id: 'opportunities', name: 'Growth opportunities', icon: '◆', render: opportunities },
    { id: 'filings', name: 'Public filings', icon: '§', render: filings },
  ],
  tour: [
    { order: 600, hash: '#/bpi/overview', caption: '<b>Bully Pulpit International.</b> A ~400-person public-affairs firm built on 6 add-ons since April 2023.', narration: 'Bully Pulpit is a roughly four-hundred-person transatlantic public-affairs firm, built on six add-ons since April 2023.', duration: 7000 },
    { order: 610, hash: '#/bpi/opportunities', caption: '<b>12 sourced growth opportunities</b>: federal comms recompetes, AI-era reputation work, litigation comms and EU corporate affairs.', narration: 'Twelve sourced growth plays, from federal communications recompetes to AI-era reputation advisory.', duration: 5500 },
    { order: 620, hash: '#/fin/comps?sector=communications_agencies', caption: '<b>Valued against public-affairs deals</b>: PPHC\'s ~8.4x is the floor, KKR\'s FGS Global deal the ceiling.', narration: 'BPI is valued against public-affairs deals: PPHC at about eight times EBITDA is the floor.', duration: 7000 },
  ],
};
