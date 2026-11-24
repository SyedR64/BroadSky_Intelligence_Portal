import * as Copy from './copy.js?v=20261124183445';
/* Bully Pulpit International — strategic communications & public affairs (BSP majority, Apr 2023).
   Views: overview · opportunities · filings (comparables live on Fundamentals › Public comparables). The DC home-sales view was dropped (Oct 2026 review: not decision-grade for a public-affairs agency).
   Helpers were originally duplicated from fh.js (no cross-module imports); this file no longer mirrors fh.js line for line. */
import { renderFilings, opportunityCard } from '../assets/components.js?v=20261124183445';
import { companyLinks } from './company-links.js?v=20261124183445';
import { embedView } from './embed.js?v=20261124183445';

/* ── module config (the only block that differs from fh.js) ──────────────── */
const CFG = {
  id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--co-bpi)', hex: 'var(--co-bpi)',
  firmId: 'bsp-bpi', oppKey: 'bpi_opportunities', filings: 'bpi_filings', sector: 'communications_agencies', peKey: 'bpi',
  sectorLabel: 'Agency comps', site: 'https://bpigroup.com',
  soWhat: () => 'Tripled in five years, half of it through add-ons.',
  signal: (ctx, d) => {
    // FEC series: OpenFEC by_recipient totals, re-pulled 2026-10-06 (the 2010-2026 series item was dropped from bpi_filings on 2026-09-24 because of HTTP 429).
    const it = (d.filings?.items || []).find(i => i.id === 'bpi-007' || /FEC Schedule B/i.test(i.title || ''));
    const cyc = FEC.cycles.map(([y, v]) => [y, y === 2024 && it?.key_figures?.cycle_total_usd ? Number(it.key_figures.cycle_total_usd) : v]);
    const m = ctx.fmt.money, rng = a => `${m(Math.min(...a))}-${m(Math.max(...a))}`;
    const rows = cyc.map(([y, v]) => ({ label: y === FEC.ytd ? `${y} YTD` : String(y), value: v, color: y === FEC.ytd ? 'var(--sys-warn)' : y % 4 === 0 ? CFG.hex : 'var(--sys-mute-2)' }));
    const pres = cyc.filter(([y]) => y % 4 === 0).map(c => c[1]), mid = cyc.filter(([y]) => y % 4 === 2 && y !== FEC.ytd).map(c => c[1]), ytd = cyc.find(([y]) => y === FEC.ytd)?.[1];
    return { title: 'Political billing cycle (FEC)', chip: 'Gross billings, not revenue',
      body: ctx.charts.bar(rows, { h: 170, fmt: v => m(v) }),
      method: `<div class="small text-2" data-method><b>Political billing cycle.</b> Federal-committee disbursements to BPI by 2-year cycle, ${cyc[0][0]}-${FEC.ytd}; gross billings including pass-through media. Presidential cycles (pink) ran <b class="num">${rng(pres)}</b>; midterms (grey) <b class="num">${rng(mid)}</b>. 2026 cycle to date: <b class="num">${m(ytd)}</b> (amber). At a 5-15% agency take (est.), the 2024 cycle was worth about $6-17M of fee revenue, and the corporate book has to absorb that swing every four years.</div>`,
      src: `<div data-src>${ctx.ui.source('OpenFEC disbursements by recipient, "bully pulpit" (2024 filing record)', FEC.url, words(FEC.retrieved))}</div>` };
  },
  levers: (d, f) => [
    { t: 'Corporate reputation & AI-risk advisory', why: 'Sell retainers off the 2026 Reputation Resilience Index.', href: '#/bpi/opportunities' },
    { t: 'Federal communications recompetes', why: `${d.opps.filter(o => /federal/.test(o.type)).length} federal contracts identified; USASpending shows $0 prime awards today.`, href: '#/bpi/opportunities' },
    { t: 'Transatlantic corporate affairs', why: 'Germany is now the third-largest market. Cross-sell EU policy to US Fortune 100 clients.', href: '#/bpi/overview' },
    { t: 'De-risk the political cycle', why: 'Political billings swing from $115M (2024) to $41K (2026 YTD). Push recurring revenue above 70%.', href: '#/bpi/filings' },
    { t: 'Multiple arbitrage on tuck-ins', why: `PPHC trades at ~8.4x EBITDA; a scaled exit likely clears 10-13x. Buy $2-5M-EBITDA specialists (sports, litigation comms, insights) with earn-outs; ${f.pe} sponsors compete.`, href: `#/fin/comps?sector=communications_agencies` },
    { t: 'Make the revenue mix reportable', why: `${f.pphc.corp_comms_public_affairs_segment_rev_2025_usd_m ? `PPHC discloses a $${f.pphc.corp_comms_public_affairs_segment_rev_2025_usd_m}M corporate-comms segment of $${f.pphc.revenue_2025_usd_m}M (2025); BPI's split is not public.` : "BPI's revenue split by client type is not public. "}Report retainer share and utilization monthly.`, href: '#/bpi/filings' },
  ],
  actions: [
    'Pick 2 federal recompetes (NASA, DOE EERE); line up a prime or GSA MAS partner before RFPs.',
    'Productize the Reputation Resilience Index as an annual benchmark for 170 companies.',
    'Report political, corporate and public-sector revenue quarterly to BSP and PineBridge lenders.',
    'Build a 2027 add-on pipeline (EU policy, state-affairs) at 6-9x EBITDA before Shamrock, Penta and MidOcean.',
  ],
  filingsSoWhat: 'Fee revenue ~$100M+ est.; EBITDA ~$20-25M.',
  filingsChip: '<span class="sys-chip sys-chip--warn">Political billings: $3M-$129M by cycle</span>',
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
const clip = (s, n = 10) => { const w = String(s ?? '').trim().split(/\s+/); return w.length > n ? w.slice(0, n).join(' ').replace(/[,;:(\-–]+$/, '') + '…' : w.join(' '); }; // long cell text opens in full in the side panel
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
  const sig = CFG.signal(ctx, d);
  const profile = co ? `<div class="prose small">${esc(co.description)}</div><h4 class="sys-card-label mt-16">Investment thesis</h4><div class="prose small">${esc(co.thesis)}</div><div class="mt-12">${ui.kv({ Leadership: esc(co.ceo), HQ: esc(co.hq_address || co.hq_city), 'BSP entry': `${esc(words(co.entry_date))} · <span class="dim">${esc(co.entry_source)}</span>`, Employees: esc(co.employees_est || '—'), 'Capital / co-investors': esc(co.lenders_or_co_investors || '—'), ...Object.fromEntries(Object.entries(co.key_metrics || {}).map(([k, v]) => [kLabel(k), `<span class="num">${metricFmt(ctx, k, v)}</span>`])) })}</div>` : '';
  const ev = [...(co?.add_ons || []).map(a => ({ date: a.date, color: CFG.hex, html: `<details><summary><b>${esc(a.name)}</b> <span class="dim">(${esc(a.hq || '')})</span></summary><div class="small text-2">${esc(a.note || '')}</div>${a.source_url ? `<a class="small" href="${esc(a.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ''}</details>` })),
    ...d.timeline.filter(t => t.type !== 'add_on').map(t => ({ date: t.date, color: 'var(--sys-mute-2)', html: `${esc(t.event)}${t.source_url ? ` <a class="small" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  el.innerHTML = ui.pageHead({ title: esc(CFG.name), sub: `${esc(CFG.soWhat(d))}`,
    chips: co ? `${fmt.chip(`Held since ${words(co.entry_date).replace(/ \d{1,2},/, '')}`, CFG.hex)}${fmt.chip(`${String(co.hq_city).split(/[;(]/)[0].trim()}, ${co.state}`)}${fmt.chip(`${d.addOns} add-ons`)}<span class="sys-chip sys-chip--good">${co.status === 'held' ? 'Held' : esc(co.status)}</span>` : '',
  }) +
  (co ? '' : ui.note('Company record not found in BSP firm profile. Profile panels are empty until it lands.', 'warn')) +
  ui.kpis([
    { label: 'Growth opportunities', value: fmt.num(d.opps.length), color: CFG.color },
    { label: 'Revenue (est.)', value: revEst ? kv2(esc, String(revEst.estimate).split(' (')[0]) : '—', sub: revEst ? `${esc((String(revEst.metric).match(/(?:FY)?20\d\d/) || [''])[0])} · ${esc(revEst.confidence)}` : '', color: 'var(--sys-info)' },
    { label: 'Filings & records', value: fmt.num(d.filings?.items?.length || 0), sub: `${(d.filings?.items || []).filter(i => i.confidence === 'high').length} high`, color: 'var(--sys-info)' },
    { label: 'Public-affairs valuation floor', value: esc(d.pphc.implied_EV_to_2025_adj_EBITDA || '—'), sub: 'ceiling FGS/KKR', color: 'var(--sys-warn)' },
    { label: 'PE competitors overlapping', value: fmt.num(d.rivals.length), sub: `${high} high threat`, color: 'var(--sys-mute)' },
    { label: 'Federal political billings (FEC)', value: fmt.money(fecYtd), sub: `2024: ${fmt.money(fec24)}`, color: 'var(--sys-warn)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Growth levers', body: leverList(esc, CFG.levers(d, { pe: d.rivals.length, pphc: d.pphc })) })}
    ${ui.panel({ title: sig.title, body: `<div class="sys-chips mb-8"><span class="sys-chip sys-chip--warn">${esc(sig.chip)}</span></div>${sig.body}` })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Next 90-day actions', sub: 'Owner: BSP deal team + PRG with CEO', accent: true, body: `<ol class="prose small">${CFG.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>` })}
    ${ui.panel({ title: d.addOns ? 'Add-ons & milestones' : 'Milestones', scroll: true, body: ev.length ? ui.timeline(ev) : ui.empty('No add-ons recorded') })}
  </div>
  ${co ? `<div class="mt-12"><details class="sys-fold"><summary><b>Company profile</b><span>Leadership, HQ, entry, capital</span></summary>${profile}</details></div>` : ''}
  <div class="mt-12">${companyLinks(CFG.id)}</div>
  ${sig.method}${sig.src}
  <div data-src>${ui.source('BSP firm profile', co?.sources?.[0], co?.retrieved)} · ${(co?.sources || []).slice(1, 6).map(u => fmt.link(u)).join(' · ')}</div>
  <div data-src>${ui.source('Company press releases (BSP firm profile)', CFG.site, d.firm?.meta?.generated)}</div>
  <div data-src>${ui.source('Synthesis of the BSP firm profile, BPI public filings, public comparables and the private-equity landscape', null, 'September 24, 2026')}</div>
  <div data-method>Growth levers are ranked by value at stake times feasibility (analyst view). <span class="sys-est">est.</span> marks an outside-in estimate. Revenue is net (fee) revenue. Opportunities span ${new Set(d.opps.map(o => o.type)).size} types. The valuation floor is PPHC EV / adj. EBITDA.</div>
  <span data-asof="September 24, 2026"></span>`;
  ctx.app.index([...d.opps.map(o => ({ label: o.title, sub: `${CFG.short} opportunity · ${label(o.type)}`, href: `#/${CFG.id}/opportunities?id=${encodeURIComponent(o.id)}`, kind: 'Opportunity', color: CFG.color })), ...d.rivals.map(r => ({ label: r.firm, sub: `PE competitor to ${CFG.short}`, href: `#/pe/landscape?firm=${encodeURIComponent(r.id)}`, kind: 'PE firm', color: 'var(--sys-mute)' }))]);
}

async function opportunities(ctx) {
  const { el, ui, fmt, esc, charts, inspector, params } = ctx;
  const d = await load(ctx);
  if (!d.firm) { el.innerHTML = ui.pageHead({ title: 'Opportunities' }) + ui.note('Research dataset BSP firm profile not yet available.', 'warn'); return; }
  const opps = d.opps; const types = [...new Set(opps.map(o => o.type))];
  const byType = types.map(t => ({ t, rows: opps.filter(o => o.type === t) })).sort((a, b) => b.rows.length - a.rows.length);
  const top = opps.filter(o => o._value).sort((a, b) => b._value - a._value)[0];
  el.innerHTML = ui.pageHead({ title: 'Growth opportunities', sub: `${fmt.num(opps.length)} opportunities; ${top ? `largest <b>${fmt.money(top._value)}</b>: ${esc(String(top.title).split(' (')[0])}.` : 'none has a disclosed dollar value.'}` }) +
    ui.kpis([
      { label: 'Opportunities', value: fmt.num(opps.length), sub: `${types.length} types`, color: CFG.color },
      ...(top ? [
        { label: 'Quantified', value: fmt.num(opps.filter(o => o._value).length), color: 'var(--sys-good)' },
        { label: 'Largest headline $', value: fmt.money(top._value), sub: esc(label(top.type)), color: 'var(--sys-warn)' },
        { label: 'Sum of headline $', value: fmt.money(opps.reduce((a, o) => a + (o._value || 0), 0)), sub: 'scale, not revenue', color: 'var(--sys-info)' },
      ] : [
        { label: 'Largest type', value: kv2(esc, label(byType[0]?.t)), sub: `${byType[0]?.rows.length || 0} of ${opps.length}`, color: 'var(--sys-warn)' },
        { label: 'Primary sources', value: fmt.num(new Set(opps.flatMap(o => [o.source_url, o.source_url_2]).filter(Boolean)).size), color: 'var(--sys-good)' },
        { label: 'Dollar-sized', value: '0', sub: 'size in diligence', color: 'var(--sys-warn)' },
      ]),
    ]) +
    `<div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Opportunities by type', scroll: true, body: `<div id="op-cards">${byType.map(g => `<h4 class="sys-card-label mt-16 mb-8">${esc(label(g.t))} · ${g.rows.length}</h4>${ui.cards(g.rows.map(o => card(ctx, o)))}`).join('')}</div>` })}
      <div class="col gap-12">
        ${ui.panel({ title: 'Type mix', body: charts.donut(byType.map((g, i) => ({ label: label(g.t), value: g.rows.length })), { fmt: v => fmt.num(v) }) })}
      </div>
    </div>
    <div class="mt-12">${ui.panel({ title: 'All opportunities', body: '<div id="op-tbl"></div>' })}</div>
    <div class="mt-12"><details class="sys-fold"><summary><b>How to prioritize</b><span>Order of work</span></summary><ol class="prose small"><li>Timed items first: RFPs, recompetes, seasonal buy windows.</li><li>Then capital-light plays on existing assets (practices, licences, add-on teams).</li><li>One owner per card in the value-creation plan; review monthly.</li></ol></details></div>
    <div data-src>${ui.source('BSP firm profile: ' + CFG.name + ' opportunities', null, d.firm?.meta?.generated)}</div>
    <span data-asof="${esc(d.firm?.meta?.generated || '')}"></span>`;
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
    { key: 'title', label: 'Opportunity', wrap: true, fmt: v => `<b>${esc(clip(v, 7))}</b>` },
    ...(top ? [{ key: '_value', label: 'Headline $', num: true, fmt: v => fmt.money(v) }] : []),
    { key: 'value_or_scale', label: 'Value / scale', wrap: true, fmt: v => `<span class="small text-2">${esc(clip(String(v || '').replace(/\[\s*'([^\]]*)'\s*\]/g, '$1').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => m.replace(/_/g, ' ')), 6))}</span>` },
    { key: 'source_url', label: 'Source', fmt: v => fmt.link(v) },
  ] });
  if (params.id) { const o = opps.find(x => x.id === params.id); if (o) open(o); }
}
const card = (ctx, o) => { const c = opportunityCard(ctx, o, CFG.color); c.sub = ctx.esc(clip(o.why_now, 10)); c.chips += ctx.fmt.chip(String(o.value_or_scale || '').split(/[;(]/)[0].replace(/\[\s*'([^\]]*)'\s*\]/g, '$1').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => m.replace(/_/g, ' ')).slice(0, 60)); return c; };
const nextAction = t => /federal|rfp/.test(t) ? 'Confirm contract vehicle and set-aside status on SAM.gov, identify a prime or teaming partner, and build the capture plan 12-18 months before the period ends.'
  : /international|geographic/.test(t) ? 'Size the addressable client list in-market, name a local lead partner, and set a 12-month revenue target with a go/no-go gate.'
  : /wholesale|channel|licens|collab/.test(t) ? 'Build a target-account list, agree terms (margin, MOQ, royalty) and pilot with 3-5 partners before rolling out.'
  : 'Write a one-page business case (revenue, margin, capex, owner) for the next BSP board meeting and set a 90-day pilot.';

async function filings(ctx) {
  const { el, ui, fmt, esc, inspector } = ctx;
  const data = await ctx.data.research(CFG.filings);
  if (!data) { el.innerHTML = ui.pageHead({ title: 'Public filings', sub: 'Public-record financial picture' }) + ui.note(`Public filings for ${esc(CFG.name)} are not available yet.`, 'warn'); return; }
  // research files ship meta.sources_summary as a string; Copy.filings cleans the text of the whole dataset.
  const ss = data.meta?.sources_summary; const norm = { ...data, meta: { ...data.meta, sources_summary: Array.isArray(ss) ? ss : String(ss || '').split(/(?<=\.)\s+|;\s+/).filter(Boolean) } };
  const cl = Copy.filings(norm); const m = cl.meta || {}; const items = cl.items || [];
  const rawItems = data.items || [];
  const est = (m.estimate_table || []).map((e, i) => ({ ...e, id: `est-${i}` }));
  const conf = c => fmt.chip(c, c === 'high' ? 'var(--green)' : c === 'medium' ? 'var(--amber)' : 'var(--dim)');
  const fig = x => x == null ? '—' : typeof x === 'boolean' ? (x ? 'yes' : 'no') : typeof x === 'number' ? x.toLocaleString() : typeof x === 'object' ? (Array.isArray(x) ? x.map(fig).join(', ') : Object.entries(x).map(([k, v]) => `${k} ${fig(v)}`).join('; ')) : String(x);
  const fold = (title, line, list) => `<details class="sys-fold"><summary><b>${esc(title)}</b><span>${esc(line)}</span></summary><ul class="sys-card-list prose">${list.map(g => `<li>${esc(g)}</li>`).join('') || '<li>—</li>'}</ul></details>`;
  const picture = String(m.financial_picture || '').split(/(?:^|\s)\(?\d{1,2}\)\s+(?=[A-Z])/).map(x => x.trim()).filter(Boolean);
  const gaps = Array.isArray(m.data_gaps) ? m.data_gaps : [], pulls = Array.isArray(m.next_pulls) ? m.next_pulls : [];
  const cats = [...new Set(items.map(i => i.category))];
  el.innerHTML = ui.pageHead({ title: 'Public filings', sub: esc(CFG.filingsSoWhat), chips: CFG.filingsChip }) +
    `<div class="mt-12">${ui.panel({ title: 'Estimates', accent: true, body: est.length ? '<div id="est-tbl"></div>' : ui.empty('No estimates') })}</div>` +
    ui.kpis([
      { label: 'Records', value: fmt.num(rawItems.length), sub: `${new Set(rawItems.map(i => i.category)).size} categories`, color: CFG.color },
      { label: 'High confidence', value: fmt.num(rawItems.filter(i => i.confidence === 'high').length), color: 'var(--sys-good)' },
      { label: 'Estimates', value: fmt.num(est.length), color: 'var(--sys-info)' },
      { label: 'Data gaps', value: fmt.num(gaps.length), sub: `${pulls.length} next pulls`, color: 'var(--sys-warn)' },
    ]) + '<div class="mt-12" id="fil-filters"></div><div id="fil-table"></div>' +
    `<div class="col gap-12 mt-12">${fold('What the public record does not show', `${gaps.length} gaps`, gaps)}${fold('Where to look next', `${pulls.length} pulls`, pulls)}</div>` +
    `<div data-method><h4 class="sys-card-label">Financial picture</h4>${picture.length > 1 ? `<ol class="prose small">${picture.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : `<div class="prose small">${esc(m.financial_picture || '')}</div>`}</div>` +
    `<div data-method>Estimates are outside-in, from public records, with a confidence rating each. Basis and detail open from a row. <span class="sys-est">est.</span> marks an estimate.</div>` +
    `<div data-src>${esc((Array.isArray(m.sources_summary) ? m.sources_summary : []).map(x => typeof x === 'string' ? x : (x && (x.source || x.name || x.portal)) || '').join(' · '))}</div>` +
    `<span data-asof="${esc(m.generated || data.meta?.generated || '')}"></span>`;
  if (est.length) ui.table(el.querySelector('#est-tbl'), { rows: est, pageSize: 25, exportName: `${CFG.id}_estimates`, onRow: e => inspector.open({ title: esc(e.metric), sub: `Estimate · ${esc(e.confidence)} confidence`, color: CFG.color, sections: [{ label: 'Estimate', html: `<div class="small">${esc(e.estimate)}</div>` }, { label: 'Basis', html: `<div class="small text-2">${esc(e.basis)}</div>` }] }), columns: [
    { key: 'metric', label: 'Metric', wrap: true, fmt: v => `<b>${esc(clip(v, 10))}</b>` },
    { key: 'estimate', label: 'Estimate', wrap: true, fmt: v => `<span class="num">${esc(clip(v, 10))}</span>` },
    { key: 'basis', label: 'Basis', wrap: true, fmt: v => `<span class="small text-2">${esc(clip(v, 10))}</span>` },
    { key: 'confidence', label: 'Conf.', fmt: v => conf(v) },
  ] });
  const openF = i => inspector.open({ title: esc(i.title), sub: `${esc(i.entity || '')} · ${esc(i.filer_or_source_agency || '')} · ${esc(i.filed_or_dated || '')}`, color: CFG.color, sections: [{ label: 'Key figures', html: ui.kv(Object.fromEntries(Object.entries(i.key_figures || {}).map(([k, v]) => [k, esc(fig(v))]))) }, { label: 'What it tells us', html: `<div class="small text-2">${esc(i.what_it_tells_us || '')}</div>` }, { label: 'Source', html: `${fmt.link(i.source_url, i.source_url)}<div class="dim small mt-8">Confidence ${esc(i.confidence)} · retrieved ${esc(i.retrieved || '')}</div>` }], actions: [i.source_url ? { label: 'Open source ↗', href: i.source_url } : null].filter(Boolean) });
  const columns = [
    { key: 'category', label: 'Category', fmt: v => fmt.chip(String(v || '').replace(/_/g, ' '), CFG.color) },
    { key: 'title', label: 'Filing / record', wrap: true, fmt: (v, r) => `<b>${esc(clip(v, 10))}</b><div class="dim small">${esc(clip(String(r.filer_or_source_agency || '').replace(/\s*\([^)]*\)/g, ''), 6))}</div>` },
    { key: 'filed_or_dated', label: 'Date', num: true, fmt: v => esc(String(v || '').slice(0, 10)) },
    { key: 'confidence', label: 'Conf.', fmt: v => conf(v) },
    { key: 'source_url', label: 'Source', fmt: v => fmt.link(v) },
  ];
  let tbl;
  const f = ui.filters(el.querySelector('#fil-filters'), [{ key: 'q', label: 'Search filings…', type: 'search' }, { key: 'cat', label: 'Category', options: cats }], st => { const q = (st.q || '').toLowerCase(); const rows = items.filter(i => (!st.cat || i.category === st.cat) && (!q || JSON.stringify(i).toLowerCase().includes(q))); f.setCount(`${rows.length} / ${items.length}`); tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#fil-table'), { columns, rows, pageSize: 30, exportName: 'filings', onRow: openF })); });
  f.setCount(`${items.length} / ${items.length}`); tbl = ui.table(el.querySelector('#fil-table'), { columns, rows: items, pageSize: 30, exportName: 'filings', onRow: openF });
  ctx.app.index(items.map((i, n) => ({ label: i.title, sub: `${CFG.short} filing · ${Copy.category(rawItems[n]?.category)}`, href: `#/${CFG.id}/filings`, kind: 'Filing', color: CFG.color })));
}

export default {
  id: CFG.id, name: CFG.short, tag: CFG.id === 'bpi' ? 'Comms' : 'Consumer', color: CFG.color, group: 'Portfolio',
  tagline: CFG.id === 'bpi' ? 'Strategic communications & public affairs, DC-headquartered, transatlantic' : 'Sustainable beachwear from recycled plastic: DTC, wholesale and two owned stores',
  hq: CFG.id === 'bpi' ? { lat: 38.9072, lon: -77.0369, label: 'Washington, DC' } : { lat: 40.7128, lon: -74.006, label: 'New York, NY' },
  views: [
    { id: 'overview', name: 'Operating picture', icon: '◉', render: overview },
    { id: 'opportunities', name: 'Growth opportunities', icon: '◆', render: opportunities },
    { id: 'filings', name: 'Public filings', icon: '§', render: filings },
    { id: 'tools', name: 'Tools', render: ctx => embedView(ctx, 'redesigns/bpi/signalos.html', { title: 'BPI tools' }) },
    { id: 'plan', name: 'Plan', render: ctx => embedView(ctx, 'redesigns/bpi/growth-plan.html', { title: 'BPI plan' }) },
  ],
  tour: [
    { order: 600, hash: '#/bpi/overview', caption: '<b>Bully Pulpit International.</b> A ~400-person public-affairs firm built on 6 add-ons since April 2023.', narration: 'Bully Pulpit is a roughly four-hundred-person transatlantic public-affairs firm, built on six add-ons since April 2023.', duration: 7000 },
    { order: 610, hash: '#/bpi/opportunities', caption: '<b>12 sourced growth opportunities</b>: federal comms recompetes, AI-era reputation work, litigation comms and EU corporate affairs.', narration: 'Twelve sourced growth plays, from federal communications recompetes to AI-era reputation advisory.', duration: 5500 },
    { order: 620, hash: '#/fin/comps?sector=communications_agencies', caption: '<b>Valued against public-affairs deals</b>: PPHC\'s ~8.4x is the floor, KKR\'s FGS Global deal the ceiling.', narration: 'BPI is valued against public-affairs deals: PPHC at about eight times EBITDA is the floor.', duration: 7000 },
  ],
};
