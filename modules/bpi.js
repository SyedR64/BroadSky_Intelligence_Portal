/* Bully Pulpit International — strategic communications & public affairs (BSP majority, Apr 2023).
   Views: overview · opportunities · benchmarks · home sales (DC) · filings. Shared helpers are duplicated in fh.js by design (no cross-module imports). */
import { renderFilings, opportunityCard } from '../assets/components.js?v=20260924203049';

/* ── module config (the only block that differs from fh.js) ──────────────── */
const CFG = {
  id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--c-bpi)', hex: '#e05c8a',
  firmId: 'bsp-bpi', oppKey: 'bpi_opportunities', filings: 'bpi_filings', sector: 'communications_agencies', peKey: 'bpi',
  sectorLabel: 'Agency comps', site: 'https://bpigroup.com',
  sales: 'sales/bpi_sales_dc', salesArea: 'District of Columbia', salesShort: 'DC', center: [38.905, -77.02], zoom: 12, zipAgg: false,
  soWhat: (d) => `BPI has tripled in five years (about half through ${d.addOns} add-ons) into a ~375-425 person transatlantic public-affairs platform. Value creation now depends on replacing presidential-cycle political billings with recurring corporate-affairs, federal and European retainers.`,
  signal: (ctx, d) => {
    const it = (d.filings?.items || []).find(i => Object.keys(i.key_figures || {}).filter(k => /^\d{4}_usd$/.test(k)).length >= 4);
    if (!it) return { title: 'Political billing cycle', body: ctx.ui.note('FEC cycle data not in bpi_filings yet.', 'warn') };
    const rows = Object.entries(it.key_figures).filter(([k]) => /^\d{4}_usd$/.test(k)).map(([k, v]) => ({ label: k.slice(0, 4), value: Number(v), color: Number(k.slice(0, 4)) % 4 === 0 ? CFG.hex : '#7d8796' }));
    const ytd = it.key_figures['2026_cycle_to_date_usd'];
    if (ytd != null) rows.push({ label: '2026 YTD', value: Number(ytd), color: 'var(--amber)' });
    return { title: 'Political billing cycle (FEC)', sub: 'Federal-committee disbursements to BPI by 2-year cycle: gross billings incl. pass-through media, not revenue',
      body: ctx.charts.bar(rows, { h: 170, fmt: v => ctx.fmt.money(v) }) + `<div class="small text-2 mt-8">Presidential years (pink) run $97-129M; midterms $3-32M. 2026 cycle to date: <b class="num">${ctx.fmt.money(ytd)}</b>. The shift to corporate work is real, and so is the revenue gap it has to fill.</div>`,
      foot: ctx.ui.source('OpenFEC schedule_b by_recipient', it.source_url, it.retrieved) };
  },
  levers: (d, f) => [
    { t: 'Corporate reputation & AI-risk advisory', why: `2026 Reputation Resilience Index (${d.co?.key_metrics?.reputation_resilience_index_2026 || '18k adults'}) gives BPI a proprietary data asset to sell recurring reputation-monitoring retainers.`, href: '#/bpi/opportunities' },
    { t: 'Federal communications recompetes', why: `${d.opps.filter(o => /federal/.test(o.type)).length} federal comms contracts identified; USASpending shows $0 prime federal awards to BPI today, so this is a new channel that needs a teaming or GSA-schedule vehicle.`, href: '#/bpi/opportunities' },
    { t: 'Transatlantic corporate affairs', why: 'BOLDT, Seven Hills, Message House and 365 Sherpas make Germany BPI\'s third-largest market. The next step is cross-selling EU policy work to US Fortune 100 clients.', href: '#/bpi/overview' },
    { t: 'De-risk the political cycle', why: 'Federal political billings swing from $115M (2024) to about $41K (2026 to date). Lenders and exit buyers will price that volatility, so recurring non-political revenue should be pushed above 70%.', href: '#/bpi/filings' },
    { t: 'Multiple arbitrage on tuck-ins', why: `PPHC trades at ~8.4x EBITDA; a scaled sponsor exit likely clears 10-13x. Keep buying $2-5M-EBITDA specialists (sports, litigation comms, insights) with earn-outs. ${f.pe} sponsors are already competing for them.`, href: '#/bpi/benchmarks' },
    { t: 'Talent-cost discipline in DC', why: 'DC home prices set the compensation floor for BPI\'s largest office. Use the DC home-sales view to calibrate cost-of-living bands and hybrid-office policy.', href: '#/bpi/market' },
  ],
  actions: [
    'Stand up a federal capture cell: pick 2 of the recompetes (NASA, DOE EERE) and line up a prime or GSA MAS teaming partner before the RFPs drop.',
    'Productize the Reputation Resilience Index into an annual subscription benchmark for the 170 companies it already scores.',
    'Report revenue split political vs corporate vs public-sector each quarter to BSP and the PineBridge lender group.',
    'Build a 2027 add-on pipeline (EU policy, US state-affairs, insights firms) at 6-9x EBITDA, ahead of Shamrock/Penta and MidOcean.',
  ],
  marketLens: s => `BPI's largest office sits in a market where the median arms-length home sold for ${s.medTxt} (${s.n} sales). Housing cost is the main driver of DC comp inflation for mid-level staff, so salary bands, hybrid policy and office location should follow neighborhood prices.`,
  marketActions: s => [
    `Benchmark DC salary bands to housing: the median home costs ${s.medTxt}, and neighborhoods with more sub-$700K sales (${s.cheap.slice(0, 3).join(', ') || 'n/a'}) are where junior staff can buy.`,
    `Track ${s.lux} sales at $2M+ in ${s.top.slice(0, 3).join(', ')}. These neighborhoods hold the policy and lobbying households that are both BPI's clients and its senior recruits.`,
    'Look at a satellite or hybrid hub in a lower-cost Ward if junior attrition rises; re-check against this view every quarter.',
  ],
  hoodAction: h => h.luxShare >= 15 ? 'High-income cluster: prioritise for client and senior-talent events.' : h.sub700 >= 40 ? 'Attainable-housing cluster: relevant to junior-staff retention and hybrid-hub siting.' : 'Mid-market: monitor quarterly.',
  filingsSoWhat: 'Public records point to a ~$100M+ fee-revenue, ~$20-25M EBITDA agency (est.), funded by $90M of BSP equity plus a PineBridge senior facility. The key underwriting issue is political billings, which swing between $3M and $129M by election cycle.',
};

/* ── shared helpers (duplicated in fh.js) ────────────────────────────────── */
const med = a => { const s = a.filter(v => v != null && !isNaN(v)).map(Number).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pp = (fmt, v, sign) => v == null || isNaN(v) ? '—' : `${sign && v > 0 ? '+' : ''}${fmt.num(v, 1)}%`;
const label = t => String(t || 'other').replace(/_usd$/, ' ($)').replace(/_pct$/, ' (%)').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).replace(/\b(rfp|ai|dtc|b2b|pe|eu|us|bsp|bpi|ftes?|m|inc5000)\b/gi, m => m.toUpperCase());
const nameCase = s => /[a-z]/.test(s || '') ? s : String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const parseMoney = s => { const m = String(s || '').match(/\$\s?([\d.,]+)\s*(billion|million|thousand|bn|B|M|K)?/i); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, '')); const u = (m[2] || '').toLowerCase(); return n * (u.startsWith('b') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('t') || u === 'k' ? 1e3 : 1); };
const links = (esc, fmt, urls) => `<div class="col gap-4 small">${urls.filter(Boolean).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(fmt.host(u) || u)} ↗</a>`).join('') || '<span class="dim">No source URL</span>'}</div>`;
const divBars = (fmt, rows, { color = CFG.hex, fmtV = v => pp(fmt, v, true), labelW = 70 } = {}) => {
  const mx = Math.max(1, ...rows.map(r => Math.abs(r.value || 0)));
  return `<div class="col gap-4">${rows.map(r => { const w = Math.abs(r.value || 0) / mx * 50; const neg = (r.value || 0) < 0; return `<div class="row" style="gap:8px"><div class="small text-2 ellipsis" style="width:${labelW}px;flex-shrink:0" title="${r.title || ''}">${r.label}</div><div class="grow" style="position:relative;height:12px;background:var(--surface-3);border-radius:3px"><div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border-2)"></div><div style="position:absolute;top:1px;bottom:1px;${neg ? `right:50%` : `left:50%`};width:${w}%;background:${neg ? 'var(--red)' : (r.color || color)};border-radius:2px"></div></div><div class="num small" style="width:58px;text-align:right;flex-shrink:0">${fmtV(r.value)}</div></div>`; }).join('')}</div>`;
};
const metricFmt = ({ fmt, esc }, k, v) => Array.isArray(v) ? esc(v.join(', ')) : typeof v !== 'number' ? esc(v) : /founded|year|rank/i.test(k) ? String(v) : /usd/i.test(k) ? fmt.moneyFull(v) : fmt.num(v);
const money = (fmt, v) => fmt.money(v >= 995000 && v < 1e6 ? 1e6 : v); // avoid '$1000K' from compact rounding
const day = (fmt, s) => fmt.date(typeof s === 'string' && s.length === 10 ? `${s}T12:00:00` : s); // avoid UTC→ET off-by-one on bare dates
const kv2 = (esc, t) => { t = String(t ?? '—'); return t.length > 12 ? `<span style="font-size:15px;line-height:1.25;display:inline-block">${esc(t)}</span>` : esc(t); }; // long text KPI values
const useLbl = v => { const t = nameCase(String(v || '').replace(/^\d+\s*/, '')); const m = t.match(/\((Row|Det|Sem|Garag|Mis)[^)]*$/); return m ? t.replace(/\([^)]*$/, `(${{ Row: 'Row house', Det: 'Detached', Sem: 'Semi-detached', Garag: 'Garage', Mis: 'Misc.' }[m[1]]})`) : t; }; // DC source truncates use codes at 30 chars
const zipOk = z => /^\d{5}$/.test(String(z || '')) && z !== '00000' ? z : ''; // source has truncated/placeholder ZIPs ('20', '00000')
const band = p => p >= 2e6 ? '#e05c8a' : p >= 1e6 ? '#f5b73d' : p >= 5e5 ? '#3fd0e0' : '#4c8dff';
const BANDS = [{ color: '#4c8dff', label: '< $500K' }, { color: '#3fd0e0', label: '$500K – $1M' }, { color: '#f5b73d', label: '$1M – $2M' }, { color: '#e05c8a', label: '$2M +' }];

async function load(ctx, withSales = false) {
  const { data } = ctx;
  const [firm, filings, comps, pe, sales] = await Promise.all([data.research('bsp_firm'), data.research(CFG.filings), data.research('public_comps'), data.research('pe_landscape'), withSales ? data.load(CFG.sales).catch(() => null) : null]);
  const co = (firm?.items || []).find(i => i.id === CFG.firmId) || null;
  const opps = (firm?.[CFG.oppKey] || []).map((o, i) => ({ ...o, id: o.id || `${CFG.id}-opp-${i + 1}`, _value: parseMoney(o.value_or_scale) }));
  const bm = comps?.meta?.sector_benchmarks?.[CFG.sector] || null;
  const peers = (comps?.items || []).filter(c => c.sector_tag === CFG.sector || (c.secondary_sector_tags || []).includes(CFG.sector)).map(c => { const l = (c.fiscal_years || []).slice(-1)[0] || {}; return { ...c, rev: l.revenue_usd, emp: l.employees }; });
  const rivals = (pe?.items || []).filter(p => (p.overlap_with_bsp || []).includes(CFG.peKey));
  const timeline = (firm?.timeline || []).filter(t => String(t.company || '').toLowerCase().startsWith(CFG.name.toLowerCase().slice(0, 8)));
  return { firm, co, opps, filings, comps, bm, peers, pe, rivals, timeline, sales, addOns: (co?.add_ons || []).length };
}
function salesStats(items, fmt) {
  const res = items.filter(i => i.use_type === 'residential' && i.arms_length && i.price >= 50000);
  const months = [...new Set(res.map(i => String(i.sale_date).slice(0, 7)))].sort();
  const cnt = m => res.filter(i => i.sale_date.startsWith(m)).length;
  const avg = res.length / Math.max(1, months.length);
  while (months.length > 3 && cnt(months[months.length - 1]) < avg * 0.6) months.pop(); // drop partial latest month
  const byM = months.map(m => { const r = res.filter(i => i.sale_date.startsWith(m)); return { m, n: r.length, med: med(r.map(i => i.price)) }; });
  let chg = null, chgLbl = '';
  if (months.length >= 13) { const last = months.slice(-6), prior = last.map(m => `${+m.slice(0, 4) - 1}${m.slice(4)}`); const a = med(res.filter(i => last.includes(i.sale_date.slice(0, 7))).map(i => i.price)), b = med(res.filter(i => prior.includes(i.sale_date.slice(0, 7))).map(i => i.price)); if (a && b) { chg = (a / b - 1) * 100; chgLbl = 'last 6 mo vs year earlier'; } }
  else if (months.length >= 6) { const a = med(res.filter(i => months.slice(-3).includes(i.sale_date.slice(0, 7))).map(i => i.price)), b = med(res.filter(i => months.slice(0, 3).includes(i.sale_date.slice(0, 7))).map(i => i.price)); if (a && b) { chg = (a / b - 1) * 100; chgLbl = 'last 3 mo vs first 3 mo'; } }
  const hoods = {}; for (const i of res) { const k = i.neighborhood || i.zip || '—'; (hoods[k] ||= []).push(i); }
  const hoodRows = Object.entries(hoods).map(([k, r]) => ({ id: k, hood: k, n: r.length, median: med(r.map(i => i.price)), lux: r.filter(i => i.price >= 2e6).length, luxShare: r.filter(i => i.price >= 2e6).length / r.length * 100, sub700: r.filter(i => i.price < 7e5).length / r.length * 100, last: r.map(i => i.sale_date).sort().pop(), zip: med(r.map(i => +i.zip).filter(Boolean)) }));
  const m = med(res.map(i => i.price));
  return { res, byM, chg, chgLbl, hoodRows, median: m, medTxt: money(fmt, m), n: fmt.num(res.length), lux: fmt.num(res.filter(i => i.price >= 2e6).length),
    top: hoodRows.filter(h => h.n >= 15).sort((a, b) => b.lux - a.lux).map(h => h.hood), cheap: hoodRows.filter(h => h.n >= 25).sort((a, b) => b.sub700 - a.sub700).map(h => h.hood) };
}

/* ── views ───────────────────────────────────────────────────────────────── */
async function overview(ctx) {
  const { el, ui, fmt, esc, charts } = ctx;
  const d = await load(ctx, true);
  const co = d.co;
  const ss = d.sales?.items ? salesStats(d.sales.items, fmt) : null;
  const est = d.filings?.meta?.estimate_table || [];
  const revEst = est.find(e => /revenue/i.test(e.metric) && /2025/.test(e.metric)) || est.find(e => /revenue/i.test(e.metric));
  const high = d.rivals.filter(r => r.threat_level === 'high').length;
  el.innerHTML = ui.pageHead({ title: esc(CFG.name), sub: `<b>So what:</b> ${esc(CFG.soWhat(d))}`,
    chips: co ? `${fmt.chip(`BSP entry ${co.entry_date}`, CFG.hex)}${fmt.chip(`${String(co.hq_city).split(/[;(]/)[0].trim()}, ${co.state}`)}${fmt.chip(`${d.addOns} add-ons`)}${fmt.chip(co.status === 'held' ? 'Held' : co.status, 'var(--green)')}` : '',
    actions: `<a class="btn" href="#/${CFG.id}/opportunities">Opportunities</a><a class="btn" href="#/${CFG.id}/benchmarks">Benchmarks</a>` }) +
  (co ? '' : ui.note('Company record not found in research/bsp_firm. Profile panels are empty until it lands.', 'warn')) +
  ui.kpis([
    { label: 'Growth opportunities', value: fmt.num(d.opps.length), sub: `${new Set(d.opps.map(o => o.type)).size} types · sourced`, color: CFG.color },
    { label: 'Revenue (est.)', value: revEst ? kv2(esc, String(revEst.estimate).split(' (')[0]) : '—', sub: revEst ? `${esc(revEst.metric)} · ${esc(revEst.confidence)} conf.` : `no estimate: ${esc(CFG.filings)} ${d.filings ? 'has no revenue row' : 'not available'}`, color: 'var(--c-fin)' },
    { label: 'Filings & records', value: fmt.num(d.filings?.items?.length || 0), sub: `${(d.filings?.items || []).filter(i => i.confidence === 'high').length} high-confidence`, color: 'var(--accent)' },
    { label: `${CFG.sectorLabel} median growth`, value: pp(fmt, d.bm?.median_revenue_growth_latest_pct, true), sub: `op. margin ${pp(fmt, d.bm?.median_operating_margin_latest_pct)} · n=${d.bm?.n ?? '—'}`, color: 'var(--c-ma)' },
    { label: 'PE competitors overlapping', value: fmt.num(d.rivals.length), sub: `${high} high threat`, color: 'var(--c-pe)' },
    { label: `${CFG.salesShort} home sales (median)`, value: ss ? ss.medTxt : '—', sub: ss ? `${ss.n} arms-length sales${ss.chg != null ? ` · ${pp(fmt, ss.chg, true)} ${esc(ss.chgLbl)}${/first/.test(ss.chgLbl) ? ' (mix, not YoY)' : ''}` : ''}` : 'dataset pending', color: 'var(--cyan)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Company profile', sub: esc(co?.sector || ''), body: co ? `<div class="prose small">${esc(co.description)}</div><h4 class="mt-12 small dim">INVESTMENT THESIS</h4><div class="prose small">${esc(co.thesis)}</div><div class="mt-12">${ui.kv({ Leadership: esc(co.ceo), HQ: esc(co.hq_address || co.hq_city), 'BSP entry': `${esc(co.entry_date)} · <span class="dim">${esc(co.entry_source)}</span>`, Employees: esc(co.employees_est || '—'), 'Capital / co-investors': esc(co.lenders_or_co_investors || '—'), ...Object.fromEntries(Object.entries(co.key_metrics || {}).map(([k, v]) => [label(k), `<span class="num">${metricFmt(ctx, k, v)}</span>`])) })}</div>` : ui.empty('Profile pending'),
      foot: co ? `${ui.source('bsp_firm research', co.sources?.[0], co.retrieved)} · ${(co.sources || []).slice(1, 6).map(u => fmt.link(u)).join(' · ')}` : '' })}
    ${ui.panel({ title: d.addOns ? 'Add-ons & milestones' : 'Milestones', sub: d.addOns ? `${d.addOns} add-ons since BSP entry` : 'No add-ons yet · organic milestones since BSP entry', scroll: true, body: (() => {
      const ev = [...(co?.add_ons || []).map(a => ({ date: a.date, color: CFG.hex, html: `<b>${esc(a.name)}</b> <span class="dim">(${esc(a.hq || '')})</span><div class="small text-2">${esc(a.note || '')}</div>${a.source_url ? `<a class="small" href="${esc(a.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ''}` })),
        ...d.timeline.filter(t => t.type !== 'add_on').map(t => ({ date: t.date, color: '#7d8796', html: `${esc(t.event)}${t.source_url ? ` <a class="small" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return ev.length ? ui.timeline(ev) : ui.empty('No add-ons recorded'); })(), foot: ui.source('Company press releases via bsp_firm', CFG.site, d.firm?.meta?.generated) })}
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Growth levers', sub: 'Ranked by value at stake × feasibility (analyst view)', body: `<div class="col gap-12">${CFG.levers(d, { pe: d.rivals.length }).map((l, i) => `<a href="${l.href}" class="row" style="align-items:flex-start;gap:10px;color:inherit;text-decoration:none"><span class="chip solid" style="--cc:${CFG.hex};min-width:22px;justify-content:center">${i + 1}</span><div><div class="strong small">${esc(l.t)}</div><div class="small text-2">${esc(l.why)}</div></div></a>`).join('')}</div>` })}
    ${(() => { const s = CFG.signal(ctx, d); return ui.panel({ title: s.title, sub: s.sub, body: s.body, foot: s.foot }); })()}
    ${ui.panel({ title: 'Next 90-day actions', sub: 'Recommended owner: BSP deal team + PRG with CEO', accent: true, body: `<ol class="prose small" style="padding-left:4px">${CFG.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>`, foot: ui.source('Synthesis of bsp_firm, filings, public_comps and pe_landscape', null, '2026-09-24') })}
  </div>`;
  ctx.app.index([...d.opps.map(o => ({ label: o.title, sub: `${CFG.short} opportunity · ${label(o.type)}`, href: `#/${CFG.id}/opportunities?id=${encodeURIComponent(o.id)}`, kind: 'Opportunity', color: CFG.color })), ...d.rivals.map(r => ({ label: r.firm, sub: `PE competitor to ${CFG.short}`, href: `#/${CFG.id}/benchmarks`, kind: 'PE firm', color: 'var(--c-pe)' }))]);
}

async function opportunities(ctx) {
  const { el, ui, fmt, esc, charts, inspector, params } = ctx;
  const d = await load(ctx);
  if (!d.firm) { el.innerHTML = ui.pageHead({ title: 'Opportunities' }) + ui.note('Research dataset bsp_firm not yet available.', 'warn'); return; }
  const opps = d.opps; const types = [...new Set(opps.map(o => o.type))];
  const byType = types.map(t => ({ t, rows: opps.filter(o => o.type === t) })).sort((a, b) => b.rows.length - a.rows.length);
  const top = opps.filter(o => o._value).sort((a, b) => b._value - a._value)[0];
  el.innerHTML = ui.pageHead({ title: `${esc(CFG.short)} growth opportunities`, sub: `<b>So what:</b> ${fmt.num(opps.length)} sourced opportunities across ${types.length} types. ${top ? `The largest headline value is <b>${fmt.money(top._value)}</b> (${esc(top.title)}).` : 'None carries a disclosed dollar value, so rank them by capital intensity and time-to-revenue.'} Each card shows why it is timely now and links to its primary source.`, chips: byType.map(g => fmt.chip(`${label(g.t)} · ${g.rows.length}`)).join('') }) +
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
      ${ui.panel({ title: 'Opportunities by type', sub: 'Click a card for why-now, source and next action', scroll: true, body: `<div id="op-cards">${byType.map(g => `<h4 class="small dim mt-12 mb-8">${esc(label(g.t).toUpperCase())} · ${g.rows.length}</h4>${ui.cards(g.rows.map(o => card(ctx, o)))}`).join('')}</div>`, foot: ui.source('bsp_firm.' + CFG.oppKey, null, d.firm?.meta?.generated) })}
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
  const d = await load(ctx);
  if (!d.comps) { el.innerHTML = ui.pageHead({ title: 'Benchmarks' }) + ui.note('Research dataset public_comps not yet available.', 'warn'); return; }
  const bm = d.bm || {}; const peers = d.peers.slice().sort((a, b) => (b.rev || 0) - (a.rev || 0));
  const est = (d.filings?.meta?.estimate_table || []).filter(e => /revenue|ebitda|headcount|margin|value/i.test(e.metric)).slice(0, 6);
  el.innerHTML = ui.pageHead({ title: `${esc(CFG.short)} vs public comps`, sub: `<b>So what:</b> ${esc(CFG.sectorLabel)} (${esc((bm.comps || []).join(', '))}) grew a median ${pp(fmt, bm.median_revenue_growth_latest_pct, true)} last year at a ${pp(fmt, bm.median_operating_margin_latest_pct)} operating margin (${pp(fmt, bm.median_operating_margin_multiyear_avg_pct)} multi-year average). The benchmark ${esc(CFG.short)} should be held to is below.` }) +
    ui.kpis([
      { label: 'Comps', value: fmt.num(peers.length), sub: esc(peers.map(p => p.ticker).join(' · ')), color: CFG.color },
      { label: 'Median growth (latest)', value: pp(fmt, bm.median_revenue_growth_latest_pct, true), sub: `CAGR since 2023 ${pp(fmt, bm.median_revenue_cagr_2023_latest_pct, true)}`, color: 'var(--c-ma)' },
      { label: 'Median op. margin', value: pp(fmt, bm.median_operating_margin_latest_pct), sub: `multi-yr avg ${pp(fmt, bm.median_operating_margin_multiyear_avg_pct)}`, color: 'var(--accent)' },
      { label: 'Median EBITDA margin', value: pp(fmt, bm.median_ebitda_margin_latest_pct), sub: 'op. income + D&A (approx.)', color: 'var(--green)' },
      { label: 'Median revenue / employee', value: fmt.money(bm.median_revenue_per_employee_usd), sub: 'latest FY, year-end headcount', color: 'var(--cyan)' },
      { label: 'PE competitors', value: fmt.num(d.rivals.length), sub: `${d.rivals.filter(r => r.threat_level === 'high').length} high threat`, color: 'var(--c-pe)' },
    ]) +
    `<div class="grid grid-main mt-12">
      <div class="col gap-12">
      ${ui.panel({ title: 'Public comparables', sub: 'SEC XBRL fundamentals, latest fiscal year. Click a row for history and 10-K', body: '<div id="bm-tbl"></div>', foot: ui.source('SEC EDGAR XBRL companyfacts via public_comps', 'https://www.sec.gov/edgar/search/', d.comps.meta?.generated) })}
      ${ui.panel({ title: 'Growth, margin and productivity', sub: `Latest FY · red = negative · sector medians: growth ${pp(fmt, bm.median_revenue_growth_latest_pct, true)}, op. margin ${pp(fmt, bm.median_operating_margin_latest_pct)}, rev/emp ${fmt.money(bm.median_revenue_per_employee_usd)}`, body: `<div class="grid grid-3"><div><h4 class="small dim mb-8">REVENUE GROWTH</h4>${divBars(fmt, peers.map(p => ({ label: esc(p.ticker), title: esc(p.company), value: p.revenue_growth_latest_pct })), { labelW: 40 })}</div><div><h4 class="small dim mb-8">OPERATING MARGIN</h4>${divBars(fmt, peers.map(p => ({ label: esc(p.ticker), title: esc(p.company), value: p.operating_margin_latest_pct, color: 'var(--accent)' })), { labelW: 40 })}</div><div><h4 class="small dim mb-8">REVENUE / EMPLOYEE</h4>${charts.hbar(peers.map(p => ({ label: p.ticker, value: p.revenue_per_employee_usd, color: CFG.hex })), { fmt: v => fmt.money(v), labelW: 40 })}</div></div>` })}
      </div>
      ${ui.panel({ title: `What this implies for ${esc(CFG.short)}`, accent: true, body: `<div class="prose small">${esc(bm.what_this_implies_for_bsp || 'Sector benchmark text pending.')}</div>${est.length ? `<h4 class="small dim mt-12">${esc(CFG.short)} ESTIMATES (FILINGS) FOR COMPARISON</h4><div class="col gap-4 mt-8">${est.map(e => `<div class="row" style="align-items:flex-start;gap:10px;border-bottom:1px solid var(--border);padding:4px 0"><div class="grow"><div class="small dim">${esc(e.metric)}</div><div class="strong small num" title="${esc(e.basis || '')}">${esc(e.estimate)}</div></div>${fmt.chip(e.confidence, e.confidence === 'high' ? 'var(--green)' : e.confidence === 'medium' ? 'var(--amber)' : 'var(--dim)')}</div>`).join('')}</div>` : ''}`, foot: ui.source(`public_comps.sector_benchmarks.${CFG.sector}; ${CFG.filings}.estimate_table`, null, '2026-09-24') })}
    </div>
    <div class="grid grid-main mt-12">
      ${ui.panel({ title: 'PE competitors overlapping ' + esc(CFG.short), sub: esc(d.pe?.meta?.sector_heatmap?.[CFG.peKey]?.note || 'Sponsors with platforms or theses that overlap'), body: '<div id="pe-tbl"></div>', foot: ui.source('pe_landscape (firm sites, press, PitchBook-sourced results)', null, d.pe?.meta?.generated) })}
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
  ui.table(el.querySelector('#bm-tbl'), { rows: peers, columns: cols, pageSize: 20, sortKey: 'rev', exportName: `${CFG.id}_public_comps`, onRow: p => inspector.open({ title: `${esc(p.ticker)} · ${esc(nameCase(p.company))}`, sub: `${esc(label(p.sector_tag))} · FY${esc(p.latest_fy)}`, color: CFG.color, sections: [
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
    { key: 'platforms_relevant', label: 'Relevant platforms', wrap: true, fmt: v => `<span class="small text-2">${fmt.list((v || []).map(p => p.name), 3)}</span>` },
    { key: 'competes_for', label: 'Competes for', fmt: v => fmt.chip(v || '—') },
  ], onRow: r => inspector.open({ title: esc(r.firm), sub: `${esc(r.hq || '')} · founded ${esc(r.founded || '—')} · threat ${esc(r.threat_level)}`, color: 'var(--c-pe)', sections: [
    { label: 'Why it matters to ' + CFG.short, html: `<div class="small text-2">${esc(r.threat_rationale || '')}</div>` },
    { label: 'Fund', html: ui.kv({ 'Latest fund': `${esc(r.latest_fund?.name || '—')} · ${fmt.money(r.latest_fund?.size_usd)}`, AUM: fmt.money(r.aum_usd), 'Check size': r.check_size_usd?.min ? `${fmt.money(r.check_size_usd.min)}–${fmt.money(r.check_size_usd.max)}` : null, Strategy: esc(r.strategy || '') }) },
    { label: 'Relevant platforms', html: `<div class="col gap-4 small">${(r.platforms_relevant || []).map(p => `<div><b>${esc(p.name)}</b> <span class="dim">${esc(p.sector || '')}${p.status ? ` · ${esc(p.status)}` : ''}</span>${p.notes ? `<div class="text-2">${esc(p.notes)}</div>` : ''}</div>`).join('') || '—'}</div>` },
    (r.deals_2025_2026 || []).length ? { label: 'Deals 2025-26', html: `<div class="col gap-4 small">${r.deals_2025_2026.map(x => `<div><span class="num dim">${esc(x.date)}</span> ${esc(x.company)} <span class="dim">(${esc(x.type)})</span></div>`).join('')}</div>` } : null,
    { label: 'Sources', html: links(esc, fmt, [r.website, ...(r.sources || [])].slice(0, 6)) },
    { label: 'Next action', html: `<div class="small text-2">${r.threat_level === 'high' ? 'Map this sponsor\'s live add-on targets against ours; pre-empt with founder outreach and faster diligence.' : 'Monitor fund deployment and keep on the exit-buyer list.'}</div>` },
  ].filter(Boolean), actions: r.website ? [{ label: 'Website ↗', href: r.website }] : [] }) });
  ctx.app.index(peers.map(p => ({ label: `${p.ticker} · ${nameCase(p.company)}`, sub: `${CFG.short} public comp`, href: `#/${CFG.id}/benchmarks`, kind: 'Comp', color: CFG.color })));
}

async function market(ctx) {
  const { el, ui, fmt, esc, charts, maps, inspector } = ctx;
  let raw = null; try { raw = await ctx.data.load(CFG.sales); } catch (e) { console.warn(e.message); }
  if (!raw?.items?.length) { el.innerHTML = ui.pageHead({ title: `${CFG.salesArea} home sales` }) + ui.note(`Sales dataset <span class="mono">data/${esc(CFG.sales)}.json</span> is not available yet.`, 'warn'); return; }
  const meta = raw.meta || {}; const all = raw.items; const s = salesStats(all, fmt);
  el.innerHTML = ui.pageHead({ title: `${esc(CFG.salesArea)} home sales`, sub: `<b>So what:</b> ${esc(CFG.marketLens(s))}`, chips: `${fmt.chip(`${fmt.num(all.length)} recorded sales`, CFG.hex)}${fmt.chip(`${day(fmt, meta.coverage?.date_from)} – ${day(fmt, meta.coverage?.date_to)}`)}${fmt.chip('owner names not retained')}` }) +
    ui.kpis([
      { label: 'Arms-length home sales', value: s.n, sub: `residential, price ≥ $50K · of ${fmt.num(all.length)} recorded transfers`, color: CFG.color },
      { label: 'Median price', value: s.medTxt, sub: 'arms-length residential', color: 'var(--c-ma)' },
      { label: 'Median price trend', value: s.chg != null ? pp(fmt, s.chg, true) : '—', sub: esc(s.chgLbl ? `${s.chgLbl}${/first/.test(s.chgLbl) ? ' · mix/seasonal, not YoY' : ''}` : 'insufficient history'), color: s.chg == null || /first/.test(s.chgLbl) ? 'var(--amber)' : s.chg >= 0 ? 'var(--green)' : 'var(--red)' },
      { label: '$2M+ sales', value: s.lux, sub: `${pp(fmt, s.res.filter(i => i.price >= 2e6).length / Math.max(1, s.res.length) * 100)} of home sales`, color: 'var(--c-bpi)' },
      { label: 'Top $2M+ area', value: kv2(esc, s.top[0] || '—'), sub: `${fmt.num(s.hoodRows.find(h => h.hood === s.top[0])?.lux)} sales ≥ $2M`, color: 'var(--cyan)' },
    ]) +
    `<div class="mt-12" id="mk-f"></div>
    <div class="grid grid-main">
      ${ui.panel({ title: CFG.zipAgg ? 'Sales by ZIP (bubble = count, colour = median price)' : 'Sales by parcel (colour = price band)', flush: true, body: '<div class="map tall" id="mk-map"></div>', foot: ui.source(meta.method ? String(meta.method).split(/[.(]/)[0].slice(0, 90) : 'Public property records', (all[0] || {}).source_url, meta.generated) })}
      <div class="col gap-12">
        ${ui.panel({ title: 'Monthly volume', sub: 'Arms-length residential sales per month (partial latest month dropped)', body: charts.bar(s.byM.map(m => ({ label: m.m.slice(2), value: m.n, color: CFG.hex })), { h: 130, fmt: v => fmt.num(v), labelEvery: Math.max(1, Math.ceil(s.byM.length / 7)) }) })}
        ${ui.panel({ title: 'Median price by month', body: charts.line([{ name: 'Median', color: 'var(--c-ma)', points: s.byM.map(m => [m.m.slice(2), m.med]) }], { h: 130, fmt: v => money(fmt, v), area: true, xLabels: s.byM.map((m, i) => i % 2 === 0 && i < s.byM.length - 1 ? m.m.slice(2) : '') }) })}
        ${ui.panel({ title: `What it means for ${esc(CFG.short)}`, accent: true, body: `<ol class="prose small" style="padding-left:4px">${CFG.marketActions(s).map(a => `<li>${esc(a)}</li>`).join('')}</ol>` })}
      </div>
    </div>
    <div class="grid grid-side mt-12">
      ${ui.panel({ title: 'Neighborhoods', sub: 'Arms-length residential · click for detail', body: '<div id="mk-hood"></div>' })}
      ${ui.panel({ title: 'Sales ledger', sub: 'Filtered records · newest first', body: '<div id="mk-tbl"></div>', foot: ui.source(`${meta.dataset || CFG.sales}: ${(meta.caveats || [])[0] || ''}`.slice(0, 160), null, meta.generated) })}
    </div>`;
  const map = maps.create(el.querySelector('#mk-map'), { center: CFG.center, zoom: CFG.zoom });
  maps.legend(map, BANDS, CFG.zipAgg ? 'Median price' : 'Sale price');
  let layer = null, tbl = null, hoodTbl = null;
  const openSale = r => inspector.open({ title: esc(r.addr || 'Sale'), sub: `${esc(r.neighborhood || '')} · ${esc(zipOk(r.zip) || '—')} · ${day(fmt, r.sale_date)}`, color: CFG.color, sections: [
    { label: 'Sale', html: ui.kv({ Price: fmt.moneyFull(r.price), 'Arms-length': r.arms_length ? 'Yes' : 'No', Use: esc(r.use_code_raw || r.use_type), 'Assessed value': r.assessed_total ? fmt.moneyFull(r.assessed_total) : null, 'Sale / assessed': r.assessed_total ? `${fmt.num(r.price / r.assessed_total, 2)}x` : null, 'Gross sq ft': r.sqft ? fmt.num(r.sqft) : null, 'Year built': r.year_built, Acceptance: esc(r.accept_code || ''), Ward: esc(r.ward || ''), Geocode: esc(r.geo_precision || '') }) },
    { label: 'Source', html: `${fmt.link(r.source_url, r.source)}<div class="dim small mt-8">Retrieved ${esc(r.retrieved || '')}. Owner names not retained.</div>` },
    { label: 'Next action', html: `<div class="small text-2">Use as a comparable in the ${esc(r.neighborhood || 'neighborhood')} cost-of-living / customer-density read; no outreach to individuals.</div>` },
  ] });
  const openHood = h => { const rows = s.res.filter(i => (i.neighborhood || i.zip || '—') === h.hood).sort((a, b) => b.sale_date.localeCompare(a.sale_date));
    inspector.open({ title: esc(h.hood), sub: `${fmt.num(h.n)} arms-length home sales`, color: CFG.color, sections: [
      { label: 'Stats', html: ui.kv({ 'Median price': money(fmt, h.median), '$2M+ sales': `${fmt.num(h.lux)} (${pp(fmt, h.luxShare)})`, 'Share < $700K': pp(fmt, h.sub700), 'Latest sale': day(fmt, h.last) }) },
      { label: 'Price by month', html: charts.bar([...new Set(rows.map(r => r.sale_date.slice(0, 7)))].sort().map(m => ({ label: m.slice(2), value: med(rows.filter(r => r.sale_date.startsWith(m)).map(r => r.price)), color: CFG.hex })), { h: 110, fmt: v => money(fmt, v) }) },
      { label: 'Most recent sales', html: `<div class="col gap-4 small">${rows.slice(0, 8).map(r => `<div class="row"><span class="num dim">${fmt.dateShort(`${r.sale_date}T12:00:00`)}</span><span class="ellipsis grow">${esc(r.addr)}</span><span class="num">${money(fmt, r.price)}</span></div>`).join('')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${esc(CFG.hoodAction(h))}</div>` },
    ] }); };
  const f = ui.filters(el.querySelector('#mk-f'), [
    { key: 'q', label: 'Search address, neighborhood, ZIP…', type: 'search' },
    { key: 'use', label: 'Use', options: [...new Set(all.map(i => i.use_type))].sort(), value: 'residential' },
    { key: 'band', label: 'Price', options: BANDS.map(b => b.label) },
    { key: 'arms', label: 'Arms-length only', type: 'toggle', value: true },
  ], st => apply(st));
  function apply(st) {
    const q = (st.q || '').toLowerCase(); const bi = BANDS.findIndex(b => b.label === st.band); const lo = [0, 5e5, 1e6, 2e6][bi], hi = [5e5, 1e6, 2e6, Infinity][bi];
    const rows = all.filter(i => (!st.use || i.use_type === st.use) && (!st.arms || i.arms_length) && (bi < 0 || (i.price >= lo && i.price < hi)) && (!q || `${i.addr} ${i.neighborhood} ${i.zip}`.toLowerCase().includes(q)));
    f.setCount(`${fmt.num(rows.length)} / ${fmt.num(all.length)}`);
    if (layer) layer.remove();
    if (CFG.zipAgg) { const z = {}; for (const r of rows) if (r.lat != null) { const k = r.zip; (z[k] ||= { zip: k, lat: r.lat, lon: r.lon, p: [] }).p.push(r.price); }
      const zr = Object.values(z).map(x => ({ ...x, n: x.p.length, median: med(x.p) }));
      layer = maps.points(map, zr, { cluster: false, color: r => band(r.median), radius: r => Math.min(20, 3 + Math.sqrt(r.n) * 0.75), opacity: .6, popup: r => `<b>ZIP ${esc(r.zip)}</b><br>${fmt.num(r.n)} sales · median ${money(fmt, r.median)}` });
    } else layer = maps.points(map, rows, { cluster: false, color: r => band(r.price), radius: 3.2, weight: 0, opacity: .75, popup: r => `<b>${esc(r.addr)}</b><br>${money(fmt, r.price)} · ${day(fmt, r.sale_date)}<br><span class="muted">${esc(r.neighborhood || '')} · ${esc(r.use_code_raw || '')}</span>`, onClick: openSale });
    const sorted = rows.slice().sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)));
    tbl ? tbl.update(sorted) : (tbl = ui.table(el.querySelector('#mk-tbl'), { rows: sorted, pageSize: 15, exportName: `${CFG.id}_home_sales`, onRow: openSale, columns: [
      { key: 'sale_date', label: 'Date', num: true, fmt: v => day(fmt, v) },
      { key: 'addr', label: 'Address', fmt: (v, r) => `${esc(v)}<div class="dim small">${esc(r.neighborhood || '')} · ${esc(zipOk(r.zip) || '—')}</div>` },
      { key: 'use_code_raw', label: 'Type', fmt: v => { const t = useLbl(v); return `<span class="small text-2 ellipsis" style="display:inline-block;max-width:190px;vertical-align:bottom" title="${esc(t)}">${esc(t)}</span>`; } },
      { key: 'price', label: 'Price', num: true, fmt: v => money(fmt, v) },
      { key: 'arms_length', label: 'Arms', fmt: v => v ? fmt.chip('yes', 'var(--green)') : fmt.chip('no', 'var(--dim)') },
    ] }));
  }
  hoodTbl = ui.table(el.querySelector('#mk-hood'), { rows: s.hoodRows, pageSize: 15, sortKey: 'n', exportName: `${CFG.id}_neighborhoods`, onRow: openHood, columns: [
    { key: 'hood', label: 'Neighborhood', fmt: v => `<b>${esc(v)}</b>` }, { key: 'n', label: 'Sales', num: true, fmt: v => fmt.num(v) },
    { key: 'median', label: 'Median', num: true, fmt: v => money(fmt, v) }, { key: 'luxShare', label: '$2M+', num: true, fmt: v => pp(fmt, v) },
  ] });
  apply(f.state);
  ctx.app.index(s.hoodRows.filter(h => h.n >= 10).slice(0, 150).map(h => ({ label: `${h.hood} home sales`, sub: `${CFG.salesShort} · ${fmt.num(h.n)} sales · median ${money(fmt, h.median)}`, href: `#/${CFG.id}/market`, kind: 'Market', color: CFG.color })));
  return () => map.remove();
}

async function filings(ctx) {
  const { el, ui, fmt, esc } = ctx;
  const data = await ctx.data.research(CFG.filings);
  const items = data?.items || [];
  el.innerHTML = ui.pageHead({ title: `${esc(CFG.short)} filings & financials`, sub: data ? `<b>So what:</b> ${esc(CFG.filingsSoWhat || String(data.meta?.financial_picture || '').slice(0, 420))}` : 'Public-record financial picture' }) +
    (data ? ui.kpis([
      { label: 'Records', value: fmt.num(items.length), sub: `${new Set(items.map(i => i.category)).size} categories`, color: CFG.color },
      { label: 'High confidence', value: fmt.num(items.filter(i => i.confidence === 'high').length), sub: 'primary-source pulls', color: 'var(--green)' },
      { label: 'Estimates', value: fmt.num((data.meta?.estimate_table || []).length), sub: 'metric · basis · confidence', color: 'var(--c-fin)' },
      { label: 'Data gaps', value: fmt.num((data.meta?.data_gaps || []).length), sub: `${(data.meta?.next_pulls || []).length} next pulls queued`, color: 'var(--amber)' },
    ]) : '') + '<div id="fil" class="mt-12"></div>';
  // renderFilings expects meta.sources_summary to be an array; research files ship it as a string (normalise here).
  const ss = data?.meta?.sources_summary; const norm = data ? { ...data, meta: { ...data.meta, sources_summary: Array.isArray(ss) ? ss : String(ss || '').split(/(?<=\.)\s+|;\s+/).filter(Boolean) } } : null;
  const fil = el.querySelector('#fil');
  renderFilings(ctx, fil, { data: norm, color: CFG.color, title: CFG.name });
  // Layout patch (shared component): give the estimate table equal width and let long estimates wrap instead of clipping.
  const g = fil.querySelector('.grid-main'); if (g) g.className = 'grid grid-2';
  fil.querySelectorAll('.grid .panel:nth-child(2) tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { td.style.whiteSpace = 'normal'; td.style.verticalAlign = 'top'; if (i === 0) td.style.width = '28%'; if (i === 1) { td.style.minWidth = '110px'; td.style.textAlign = 'left'; } }));
  if (data) ctx.app.index(items.map(i => ({ label: i.title, sub: `${CFG.short} filing · ${i.category}`, href: `#/${CFG.id}/filings`, kind: 'Filing', color: CFG.color })));
}

export default {
  id: CFG.id, name: CFG.name, tag: CFG.id === 'bpi' ? 'Comms' : 'Consumer', color: CFG.color, group: 'Portfolio',
  tagline: CFG.id === 'bpi' ? 'Strategic communications & public affairs, DC-headquartered, transatlantic' : 'Sustainable beachwear from recycled plastic: DTC, wholesale and two owned stores',
  hq: CFG.id === 'bpi' ? { lat: 38.9072, lon: -77.0369, label: 'Washington, DC' } : { lat: 40.7128, lon: -74.006, label: 'New York, NY' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'opportunities', name: 'Opportunities', icon: '◆', render: opportunities },
    { id: 'benchmarks', name: 'Benchmarks', icon: '▤', render: benchmarks },
    { id: 'market', name: 'Home sales', icon: '⌂', render: market },
    { id: 'filings', name: 'Filings & financials', icon: '§', render: filings },
  ],
  tour: [
    { order: 600, hash: '#/bpi/overview', caption: '<b>Bully Pulpit International.</b> A ~400-person transatlantic public-affairs platform built on 6 add-ons since Broad Sky\'s April 2023 investment.', narration: 'Bully Pulpit is a roughly four-hundred-person transatlantic public-affairs platform, built on six add-ons since April 2023.', duration: 7000 },
    { order: 610, hash: '#/bpi/opportunities', caption: '<b>12 sourced growth opportunities</b>: federal comms recompetes, AI-era reputation work, litigation comms and EU corporate affairs.', narration: 'Twelve sourced growth plays, from federal communications recompetes to AI-era reputation advisory.', duration: 5500 },
    { order: 620, hash: '#/bpi/market', caption: '<b>DC home sales</b> since Jan 2025, mapped by parcel: the cost-of-living floor for BPI\'s largest office.', narration: 'Every District of Columbia home sale since January 2025 sets the cost-of-living floor for BPI\'s largest office.', duration: 7000 },
  ],
};
