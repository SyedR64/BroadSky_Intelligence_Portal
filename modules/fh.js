import * as Copy from './copy.js?v=20261124183445';
/* Fair Harbor — sustainable beachwear from recycled plastic (BSP investment, Mar 2022).
   Views: overview · opportunities · filings · NYC context (Manhattan home sales, demoted: context only). Shared helpers are duplicated in bpi.js by design (no cross-module imports). */
import { renderFilings, opportunityCard } from '../assets/components.js?v=20261124183445';
import { companyLinks } from './company-links.js?v=20261124183445';
import { embedView } from './embed.js?v=20261124183445';

/* ── module config (the only block that differs from bpi.js) ──────────────── */
const CFG = {
  id: 'fh', name: 'Fair Harbor', short: 'Fair Harbor', color: 'var(--co-fh)', hex: 'var(--co-fh)',
  firmId: 'bsp-fh', oppKey: 'fh_opportunities', filings: 'fairharbor_filings', sector: 'apparel_dtc', peKey: 'fair_harbor',
  sectorLabel: 'Apparel/DTC comps', site: 'https://fairharborclothing.com',
  sales: 'sales/fh_sales_nyc', salesArea: 'Manhattan (New York County)', salesShort: 'NYC', center: [40.772, -73.975], zoom: 12, zipAgg: true,
  soWhat: () => "BSP's only consumer brand, 4.5 years in. 38.5% of variants marked down.",
  hq: { label: 'New York, NY', detail: '520 Broadway, New York, NY (NY DOS principal executive office)', alt: 'Form D and PPP filings use the founders\' Larchmont, NY address' },
  signal: (ctx, d) => {
    const it = (d.filings?.items || []).find(i => i.key_figures?.product_type_mix);
    if (!it) return { title: 'Catalog health', body: ctx.ui.note('Catalog data is not in the Fair Harbor filings yet.', 'warn') };
    const k = it.key_figures;
    return { title: 'Catalog health (live store data)', sub: `${ctx.fmt.num(k.active_products)} active products · ${ctx.fmt.num(k.variants)} variants · median price $${ctx.fmt.num(k.median_variant_price_usd)}`,
      body: ctx.charts.hbar(Object.entries(k.product_type_mix).map(([l, v]) => ({ label: l, value: v, color: /swim|rash|short/i.test(l) ? CFG.hex : 'var(--sys-mute-2)' })), { fmt: v => ctx.fmt.num(v), labelW: 120 }),
      method: `<div class="small text-2" data-method><b>Catalog health.</b> Swim and summer items (teal) are ~${ctx.fmt.num(((k.product_type_mix.Swim || 0) + (k.product_type_mix.Shorts || 0) + (k.product_type_mix.Rashguard || 0)) / k.active_products * 100)}% of the catalog. Women's products live: ${ctx.fmt.num(k.womens_products)}. "Marked down" = variant price below its compare-at price on the public store (retrieved ${ctx.esc(it.retrieved || '')}).</div>`,
      src: `<div data-src>${ctx.ui.source('Fair Harbor Shopify product catalogue (Fair Harbor public filings)', it.source_url, it.retrieved)}</div>` };
  },
  levers: () => [
    { t: 'Wholesale & specialty door expansion', why: 'Nordstrom, Saks, ~250 specialty doors (2022), Scheels (2023). Chubbies: 52% of 2025 sales, 18% segment margin.', href: '#/fh/opportunities' },
    { t: 'Licensing & collaborations', why: 'FootJoy golf, collegiate, HBO White Lotus and Athletic Brewing collabs: make them a royalty line.', href: '#/fh/opportunities' },
    { t: 'B2B custom program', why: 'Clubs, resorts and gifting sell off-season; B Corp credentials (score 94.3) help in RFPs.', href: '#/fh/opportunities' },
    { t: 'Margin repair & markdown discipline', why: "38.5% of variants marked down; women's cleared at ~70% off (Dec 2025). Test: fewer SKUs beat growth for EBITDA.", href: '#/fh/filings' },
    { t: 'De-seasonalize the assortment', why: 'Swim is 134 of 372 products. Cold-weather, kids (51 items) and golf smooth the Q2-Q3 spike.', href: '#/fh/overview' },
    { t: 'Wholesale sell-through visibility', why: 'Doors are public only as of 2022 (~250 specialty, Nordstrom, Saks; Scheels 2023). Track reorders, not opening orders, by account.', href: '#/fh/opportunities' },
  ],
  confirm: [
    'FY25 P&L by channel (DTC, wholesale, B2B, stores).',
    'Summer 2026 sell-through and markdown dollars by category: clearance or carry-over?',
    'Wholesale doors, top-10 accounts and reorder rates vs the 2022 baseline (~250 specialty, Nordstrom, Saks).',
    "Women's line: relaunch plan, timing and inventory exposure after the Dec 2025 rework.",
    'Lender and ABL availability after the eCapital lien release (Dec 2025).',
  ],
  actions: [
    'Cut marked-down share from 38.5% to below 20% before the Summer 2027 buy. Drop the bottom 20% of SKUs.',
    'Sign 3-5 wholesale or resort accounts (golf pro shops, coastal specialty, Scheels); report sell-through monthly.',
    'Put licensing (collegiate, FootJoy, co-brands) in a royalty P&L line with a 2027 target.',
    'Test Shopify Markets in Canada and the UK; the store ships only to the US today.',
  ],
  marketLens: s => `${s.n} Manhattan home sales, ${s.medTxt} median.`,
  marketActions: s => [
    `Match Shopify and SoHo-store customer ZIPs to ${s.top.slice(0, 3).join(', ')}; act only on material overlap.`,
    'If it holds, judge pop-ups in the densest ZIPs on sell-through, not traffic.',
    'Add customer-file ZIP density, Suffolk County (Hamptons, Fire Island) and Palm Beach County (store 2) sales.',
  ],
  hoodAction: h => h.luxShare >= 15 ? 'Higher $2M+ share: candidate for a SoHo-store event or pop-up test, if customer-ZIP overlap confirms it.' : h.n >= 300 ? 'High turnover: possible new-mover offer test, only if customer-ZIP overlap confirms it.' : 'No action; context only.',
  filingsSoWhat: 'Entry equity $30.7M confirmed (Form D); revenue and EBITDA are estimates.',
  filingsChip: '<span class="sys-chip">No add-ons recorded</span>',
};

/* ── shared helpers (duplicated in bpi.js) ────────────────────────────────── */
const med = a => { const s = a.filter(v => v != null && !isNaN(v)).map(Number).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pp = (fmt, v, sign) => v == null || isNaN(v) ? '—' : `${sign && v > 0 ? '+' : ''}${fmt.num(v, 1)}%`;
const label = t => String(t || 'other').replace(/_usd$/, ' ($)').replace(/_pct$/, ' (%)').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).replace(/\b(rfp|ai|dtc|b2b|pe|eu|us|bsp|bpi|ftes?|m|inc5000)\b/gi, m => m.toUpperCase());
const nameCase = s => /[a-z]/.test(s || '') ? s : String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const parseMoney = s => { const m = String(s || '').match(/\$\s?([\d.,]+)\s*(billion|million|thousand|bn|B|M|K)?/i); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, '')); const u = (m[2] || '').toLowerCase(); return n * (u.startsWith('b') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('t') || u === 'k' ? 1e3 : 1); };
const links = (esc, fmt, urls) => `<div class="col gap-4 small">${urls.filter(Boolean).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(fmt.host(u) || u)} ↗</a>`).join('') || '<span class="dim">No source URL</span>'}</div>`;
/* lever list: the system card list (title link + reason) */
const leverList = (esc, items) => `<ul class="sys-card-list" data-co="${CFG.id}">${items.map(l => `<li><b><a href="${esc(l.href)}">${esc(l.t)}</a></b><div>${esc(l.why)}</div></li>`).join('')}</ul>`;
const words = s => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +(m[3] || 15)).toLocaleDateString('en-US', m[3] ? { month: 'long', day: 'numeric', year: 'numeric' } : { month: 'long', year: 'numeric' }) : s; };
const metricFmt = ({ fmt, esc }, k, v) => Array.isArray(v) ? esc(v.join(', ')) : typeof v !== 'number' ? esc(v) : /founded|year|rank/i.test(k) ? String(v) : /usd/i.test(k) ? fmt.moneyFull(v) : fmt.num(v);
const money = (fmt, v) => fmt.money(v >= 995000 && v < 1e6 ? 1e6 : v); // avoid '$1000K' from compact rounding
const day = (fmt, s) => fmt.date(typeof s === 'string' && s.length === 10 ? `${s}T12:00:00` : s); // avoid UTC→ET off-by-one on bare dates
const clip = (s, n = 10) => { const w = String(s ?? '').trim().split(/\s+/); return w.length > n ? w.slice(0, n).join(' ').replace(/[,;:(\-–]+$/, '') + '…' : w.join(' '); }; // long cell text opens in full in the side panel
const kv2 = (esc, t) => { t = String(t ?? '—'); return t.length > 12 ? `<span class="sys-card-title">${esc(t)}</span>` : esc(t); }; // long text KPI values read at the card-title size
const useLbl = v => { const t = nameCase(String(v || '').replace(/^\d+\s*/, '')); const m = t.match(/\((Row|Det|Sem|Garag|Mis)[^)]*$/); return m ? t.replace(/\([^)]*$/, `(${{ Row: 'Row house', Det: 'Detached', Sem: 'Semi-detached', Garag: 'Garage', Mis: 'Misc.' }[m[1]]})`) : t; }; // DC source truncates use codes at 30 chars
const zipOk = z => /^\d{5}$/.test(String(z || '')) && z !== '00000' ? z : ''; // source has truncated/placeholder ZIPs ('20', '00000')
/* price bands in system tokens; tok() resolves one for the Leaflet canvas renderer */
const band = p => p >= 2e6 ? 'var(--co-bpi)' : p >= 1e6 ? 'var(--sys-warn)' : p >= 5e5 ? 'var(--co-fh)' : 'var(--sys-info)';
const BANDS = [{ color: 'var(--sys-info)', label: '< $500K' }, { color: 'var(--co-fh)', label: '$500K – $1M' }, { color: 'var(--sys-warn)', label: '$1M – $2M' }, { color: 'var(--co-bpi)', label: '$2M +' }];
const tok = v => { const m = /^var\((--[\w-]+)\)$/.exec(String(v || '')); if (!m) return v; try { return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || v; } catch { return v; } };

async function load(ctx, withSales = false) {
  const { data } = ctx;
  const [firm, filings, comps, pe, sales] = await Promise.all([data.research('bsp_firm'), data.research(CFG.filings), data.research('public_comps'), data.research('pe_landscape'), withSales ? data.load(CFG.sales).catch(() => null) : null]);
  const co = (firm?.items || []).find(i => i.id === CFG.firmId) || null;
  const opps = (firm?.[CFG.oppKey] || []).map((o, i) => ({ ...o, why_now: Copy.noEmail(o.why_now), next_action: Copy.noEmail(o.next_action), id: o.id || `${CFG.id}-opp-${i + 1}`, _value: parseMoney(o.value_or_scale) }));
  const bm = comps?.meta?.sector_benchmarks?.[CFG.sector] || null;
  const rivals = (pe?.items || []).filter(p => (p.overlap_with_bsp || []).includes(CFG.peKey));
  const timeline = (firm?.timeline || []).filter(t => String(t.company || '').toLowerCase().startsWith(CFG.name.toLowerCase().slice(0, 8)));
  return { firm, co, opps, filings, comps, bm, pe, rivals, timeline, sales, addOns: (co?.add_ons || []).length };
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
  const d = await load(ctx);
  const co = d.co;
  const est = d.filings?.meta?.estimate_table || [];
  const revEst = est.find(e => /revenue/i.test(e.metric) && /2025/.test(e.metric)) || est.find(e => /revenue/i.test(e.metric));
  const fItems = d.filings?.items || [];
  const cat = fItems.find(i => i.key_figures?.product_type_mix);
  const k = cat?.key_figures || null;
  const doorsIt = fItems.find(i => i.key_figures?.specialty_retail_doors);
  const doors = doorsIt?.key_figures?.specialty_retail_doors || null;
  const nonSwim = k ? (k.active_products - (k.product_type_mix.Swim || 0)) : null;
  const sig = CFG.signal(ctx, d);
  const profile = co ? `<div class="prose small">${esc(co.description)}</div><h4 class="sys-card-label mt-16">Investment thesis</h4><div class="prose small">${esc(co.thesis)}</div><div class="mt-12">${ui.kv({ Leadership: esc(co.ceo), HQ: `${esc(CFG.hq.detail)}<div class="dim small">${esc(CFG.hq.alt)}</div>`, 'BSP entry': `${esc(words(co.entry_date))} · <span class="dim">${esc(co.entry_source)}</span>`, Employees: esc(co.employees_est || '—'), 'Capital / co-investors': esc(co.lenders_or_co_investors || '—'), ...Object.fromEntries(Object.entries(co.key_metrics || {}).map(([k, v]) => [label(k), `<span class="num">${metricFmt(ctx, k, v)}</span>`])) })}</div>` : '';
  const ev = [...(co?.add_ons || []).map(a => ({ date: a.date, color: CFG.hex, html: `<details><summary><b>${esc(a.name)}</b> <span class="dim">(${esc(a.hq || '')})</span></summary><div class="small text-2">${esc(a.note || '')}</div>${a.source_url ? `<a class="small" href="${esc(a.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ''}</details>` })),
    ...d.timeline.filter(t => t.type !== 'add_on').map(t => ({ date: t.date, color: 'var(--sys-mute-2)', html: `${esc(t.event)}${t.source_url ? ` <a class="small" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` }))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  el.innerHTML = ui.pageHead({ title: esc(CFG.name), sub: `${esc(CFG.soWhat(d))}`,
    chips: co ? `${fmt.chip(`Held since ${words(co.entry_date).replace(/ \d{1,2},/, '')}`, CFG.hex)}${fmt.chip(CFG.hq.label)}${fmt.chip(`${d.addOns} add-ons`)}<span class="sys-chip sys-chip--good">${co.status === 'held' ? 'Held' : esc(co.status)}</span>` : '',
  }) +
  (co ? '' : ui.note('Company record not found in BSP firm profile. Profile panels are empty until it lands.', 'warn')) +
  ui.kpis([
    { label: 'Variants marked down', value: k ? `${fmt.num(k.markdown_share_pct, 1)}%` : '—', sub: k ? `${fmt.num(k.variants_marked_down_vs_compare_at)} of ${fmt.num(k.variants)}` : 'pending', color: 'var(--sys-bad)' },
    { label: 'Specialty doors (2022)', value: doors ? esc(doors) : '—', color: CFG.color },
    { label: 'Non-swim share of catalog', value: k ? `${fmt.num(nonSwim / k.active_products * 100, 1)}%` : '—', color: 'var(--sys-good)' },
    { label: 'Revenue 2025 (est.)', value: revEst ? kv2(esc, String(revEst.estimate).split(' (')[0]) : '—', sub: revEst ? `${esc(revEst.confidence)} confidence` : 'no estimate', color: 'var(--sys-info)' },
    { label: 'Growth opportunities', value: fmt.num(d.opps.length), color: 'var(--sys-warn)' },
    { label: `${CFG.sectorLabel} median growth`, value: pp(fmt, d.bm?.median_revenue_growth_latest_pct, true), sub: `margin ${pp(fmt, d.bm?.median_operating_margin_latest_pct)} · ${d.bm?.n ?? '—'} peers`, color: 'var(--sys-info)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Growth levers', body: leverList(esc, CFG.levers(d)) })}
    ${ui.panel({ title: sig.title, body: sig.body })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'First meeting, then 90 days', sub: 'Owner: BSP deal team + PRG with CEO', accent: true, body: `<h4 class="sys-card-label">Confirm with management</h4><ol class="prose small">${CFG.confirm.map(a => `<li>${esc(a)}</li>`).join('')}</ol><h4 class="sys-card-label mt-16">Then, next 90 days</h4><ol class="prose small">${CFG.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ol>` })}
    ${ui.panel({ title: d.addOns ? 'Add-ons & milestones' : 'Milestones', scroll: true, body: ev.length ? ui.timeline(ev) : ui.empty('No add-ons recorded') })}
  </div>
  ${co ? `<div class="mt-12"><details class="sys-fold"><summary><b>Company profile</b><span>Leadership, HQ, entry, capital</span></summary>${profile}</details></div>` : ''}
  <div class="mt-12">${companyLinks(CFG.id)}</div>
  ${sig.method || ''}${sig.sub ? `<div data-method>${esc(sig.sub)}</div>` : ''}${sig.src || ''}
  <div data-src>${ui.source('BSP firm profile', co?.sources?.[0], co?.retrieved)} · ${(co?.sources || []).slice(1, 6).map(u => fmt.link(u)).join(' · ')}</div>
  <div data-src>${ui.source('Company press releases (BSP firm profile)', CFG.site, d.firm?.meta?.generated)}</div>
  <div data-src>${ui.source('Synthesis of the BSP firm profile, Fair Harbor public filings, public comparables and the private-equity landscape (analyst view)', null, 'September 24, 2026')}</div>
  <div data-method>Growth levers are ranked by value at stake times feasibility (analyst view). <span class="sys-est">est.</span> marks an outside-in estimate; the revenue figure is not company data. Specialty doors are plus Nordstrom and Saks. Non-swim products: ${k ? `${fmt.num(nonSwim)} of ${fmt.num(k.active_products)}` : '—'}. Opportunities span ${new Set(d.opps.map(o => o.type)).size} types.</div>
  <span data-asof="September 24, 2026"></span>`;
  ctx.app.index([...d.opps.map(o => ({ label: o.title, sub: `${CFG.short} opportunity · ${label(o.type)}`, href: `#/${CFG.id}/opportunities?id=${encodeURIComponent(o.id)}`, kind: 'Opportunity', color: CFG.color })), ...d.rivals.map(r => ({ label: r.firm, sub: `PE competitor to ${CFG.short}`, href: `#/pe/landscape?firm=${encodeURIComponent(r.id)}`, kind: 'PE firm', color: 'var(--sys-mute)' }))]);
}

/* Analyst classification (est.): capital intensity × time-to-revenue for each opportunity. Keyed on title/type text so new rows degrade to 'unclassified'. */
const CLASS = [
  { re: /sustainab|b corp/i, cap: 1, ttr: 5, window: 'Rolling corporate-merch and hospitality procurement cycles.', capNote: 'existing credentials' },
  { re: /wholesale/i, cap: 2, ttr: 9, window: 'Spring/Summer 2027 line reviews: wholesale buyers typically commit S/S orders the preceding fall and winter.', capNote: 'opening-order inventory, reps, terms' },
  { re: /international/i, cap: 1, ttr: 4, window: 'Off-season test window (Oct-Mar); Australian summer runs Dec-Feb.', capNote: 'Shopify Markets, landed-cost pricing' },
  { re: /golf|footjoy/i, cap: 1, ttr: 4, window: 'PGA Show (late Jan, Orlando) for 2027 pro-shop orders.', capNote: 'collab inventory already live' },
  { re: /b2b|custom/i, cap: 1, ttr: 3, window: 'Q4 corporate-gifting budgets and winter resort buys.', capNote: 'made-to-order, minimum order sizes' },
  { re: /collegiate|licens/i, cap: 2, ttr: 3, window: 'Fall 2026 football season and holiday gifting (live now).', capNote: 'royalty minimums + stocked inventory' },
  { re: /collab/i, cap: 1, ttr: 2, window: 'Rolling; tie each drop to an email or wholesale moment.', capNote: 'small limited runs' },
  { re: /cold-weather|kids|year-round|de-season/i, cap: 2, ttr: 9, window: 'Holiday 2026 is live; Fall/Holiday 2027 buys are typically committed in H1 2027.', capNote: 'inventory depth in new categories' },
  { re: /women/i, cap: 3, ttr: 15, window: 'No fixed window: needs a relaunch decision after the Dec 2025 rework.', capNote: 'new line build, fit, inventory' },
];
const CAP = ['—', 'Low', 'Medium', 'High'];
const ttrLbl = m => m == null ? '—' : m <= 3 ? '≤ 3 mo' : m <= 6 ? '3-6 mo' : m <= 12 ? '6-12 mo' : '12+ mo';
const classify = o => { const c = CLASS.find(x => x.re.test(`${o.title} ${o.type}`)); return c ? { _cap: c.cap, _capLbl: CAP[c.cap], _capNote: c.capNote, _ttr: c.ttr, _ttrLbl: ttrLbl(c.ttr), _window: c.window } : { _cap: null, _capLbl: '—', _capNote: '', _ttr: null, _ttrLbl: '—', _window: '' }; };
const QUADS = [
  { id: 'q1', t: 'Quick wins', s: 'low capital · ≤ 6 months', f: o => o._cap === 1 && o._ttr <= 6, c: 'var(--sys-good)' },
  { id: 'q2', t: 'Timed bets', s: 'more capital · ≤ 6 months', f: o => o._cap > 1 && o._ttr <= 6, c: 'var(--sys-warn)' },
  { id: 'q3', t: 'Cheap options', s: 'low capital · > 6 months', f: o => o._cap === 1 && o._ttr > 6, c: 'var(--co-fh)' },
  { id: 'q4', t: 'Strategic builds', s: 'more capital · > 6 months', f: o => o._cap > 1 && o._ttr > 6, c: 'var(--sys-bad)' },
];

async function opportunities(ctx) {
  const { el, ui, fmt, esc, charts, inspector, params } = ctx;
  const d = await load(ctx);
  if (!d.firm) { el.innerHTML = ui.pageHead({ title: 'Opportunities' }) + ui.note('Research dataset BSP firm profile not yet available.', 'warn'); return; }
  const opps = d.opps.map((o, i) => ({ ...o, _n: i + 1, ...classify(o) })); const types = [...new Set(opps.map(o => o.type))];
  const byType = types.map(t => ({ t, rows: opps.filter(o => o.type === t) })).sort((a, b) => b.rows.length - a.rows.length);
  const top = opps.filter(o => o._value).sort((a, b) => b._value - a._value)[0];
  const q = Object.fromEntries(QUADS.map(x => [x.id, opps.filter(x.f)]));
  const nm = o => esc(String(o.title).split(/ \(| - |:| beyond | as | with | to de-/)[0].trim());
  /* 2×2 of system cards: the quadrant colour is the card's accent bar (data-co); each opportunity is a numbered link */
  const quad = x => `<div class="sys-card sys-card--flat" data-co="" style="--co:${x.c}"><h4 class="sys-card-label">${esc(x.t)} · ${q[x.id].length}</h4><div class="dim small">${esc(x.s)}</div><ul class="sys-card-list">${q[x.id].map(o => `<li><a href="#/${CFG.id}/opportunities?id=${encodeURIComponent(o.id)}" class="m-fh-q" data-id="${esc(o.id)}"><span class="num">${o._n}.</span> ${nm(o)}</a></li>`).join('') || '<li class="dim">None</li>'}</ul></div>`;
  const matrix = `<div class="grid grid-2">${quad(QUADS[1])}${quad(QUADS[3])}${quad(QUADS[0])}${quad(QUADS[2])}</div>`;
  el.innerHTML = ui.pageHead({ title: 'Growth opportunities', sub: `${fmt.num(q.q1.length)} of ${fmt.num(opps.length)} are quick wins on live assets.` }) +
    ui.kpis([
      { label: 'Opportunities', value: fmt.num(opps.length), sub: `${types.length} types`, color: CFG.color },
      { label: 'Quick wins (est.)', value: fmt.num(q.q1.length), color: 'var(--sys-good)' },
      { label: 'Timed bets (est.)', value: fmt.num(q.q2.length), color: 'var(--sys-warn)' },
      { label: 'Strategic builds (est.)', value: fmt.num(q.q4.length), color: 'var(--sys-bad)' },
      ...(top ? [{ label: 'Largest headline $', value: fmt.money(top._value), sub: esc(label(top.type)), color: 'var(--sys-warn)' }]
        : [{ label: 'Dollar-sized', value: '0', sub: 'size in diligence', color: 'var(--sys-mute-2)' }]),
    ]) +
    `<div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Opportunities by type', scroll: true, body: `<div id="op-cards">${byType.map(g => `<h4 class="sys-card-label mt-16 mb-8">${esc(label(g.t))} · ${g.rows.length}</h4>${ui.cards(g.rows.map(o => card(ctx, o)))}`).join('')}</div>` })}
      ${ui.panel({ title: 'Capital intensity × time to revenue', body: `<div id="op-2x2">${matrix}</div>` })}
    </div>
    <div class="mt-12">${ui.panel({ title: 'All opportunities', body: '<div id="op-tbl"></div>' })}</div>
    <div class="mt-12"><details class="sys-fold"><summary><b>How to prioritize</b><span>Order of work</span></summary><ol class="prose small"><li><b>Buy windows first:</b> wholesale doors and golf pro shops (PGA Show, late Jan) must reach buyers this winter or slip a season.</li><li><b>Then quick wins on live assets:</b> B2B custom, collabs, sustainability credentials, a Shopify Markets test.</li><li><b>Licensing:</b> confirm royalty minimums and stocked inventory before adding more schools.</li><li><b>Gate the builds</b> (women's relaunch, cold-weather and kids depth) on FY25 sell-through and markdown data.</li><li>One owner per card in the value-creation plan; review monthly.</li></ol></details></div>
    <div data-src>${ui.source('BSP firm profile: ' + CFG.name + ' opportunities', null, d.firm?.meta?.generated)}</div>
    <div data-src>${ui.source('Analyst view on Fair Harbor opportunities (BSP firm profile) and Fair Harbor public filings', null, 'October 6, 2026')}</div>
    <div data-method>Capital intensity and time to revenue are analyst estimates (<span class="sys-est">est.</span>). Matrix: top row more capital, bottom row low capital; left revenue within 6 months, right after 6 months; builds wait for sell-through data.</div>
    <span data-asof="${esc(d.firm?.meta?.generated || '')}"></span>`;
  const open = o => inspector.open({ title: esc(o.title), sub: `${esc(CFG.short)} · ${esc(label(o.type))}`, color: CFG.color, sections: [
    { label: 'Value / scale', html: `<div class="small">${esc(o.value_or_scale || '—')}</div>${o._value ? `<div class="sys-chips mt-8"><span class="sys-chip sys-chip--good">Headline ${fmt.money(o._value)}</span></div>` : ''}` },
    { label: 'Why now', html: `<div class="small text-2">${esc(o.why_now || '—')}</div>` },
    { label: 'Priority (analyst est.)', html: ui.kv({ 'Capital intensity': `${esc(o._capLbl)}${o._capNote ? ` <span class="dim">· ${esc(o._capNote)}</span>` : ''}`, 'Time to revenue': esc(o._ttrLbl), 'Buy window': esc(o._window || '—') }) },
    o.caveat ? { label: 'Caveat', html: ui.note(esc(o.caveat), 'warn') } : null,
    { label: 'Sources', html: links(esc, fmt, [o.source_url, o.source_url_2, o.source_url_api]) + `<div class="dim small mt-8">Retrieved ${esc(o.retrieved || '')}</div>` },
    { label: 'Next action', html: `<div class="small text-2">${esc(nextAction(o))}</div>` },
  ].filter(Boolean), actions: [o.source_url ? { label: 'Open source ↗', href: o.source_url } : null].filter(Boolean) });
  const cards = byType.flatMap(g => g.rows.map(o => card(ctx, o)));
  ui.bindCards(el.querySelector('#op-cards'), cards, c => open(opps.find(o => o.id === c.id)));
  el.querySelectorAll('#op-2x2 .m-fh-q').forEach(b => b.addEventListener('click', e => { const o = opps.find(x => x.id === b.dataset.id); if (o) { e.preventDefault(); open(o); } }));
  ui.table(el.querySelector('#op-tbl'), { rows: opps, pageSize: 25, exportName: `${CFG.id}_opportunities`, onRow: open, sortKey: top ? '_value' : '_n', sortDir: top ? -1 : 1, columns: [
    { key: '_n', label: '#', num: true },
    { key: 'type', label: 'Type', fmt: v => fmt.chip(label(v), CFG.hex) },
    { key: 'title', label: 'Opportunity', wrap: true, fmt: v => `<b>${esc(clip(v, 7))}</b>` },
    ...(top ? [{ key: '_value', label: 'Headline $', num: true, fmt: v => fmt.money(v) }] : []),
    { key: 'value_or_scale', label: 'Value / scale', wrap: true, fmt: v => `<span class="small text-2">${esc(clip(String(v || '').replace(/\[\s*'([^\]]*)'\s*\]/g, '$1').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => m.replace(/_/g, ' ')), 6))}</span>` },
    { key: '_cap', label: 'Capital (est.)', num: true, fmt: (v, r) => `<span class="sys-chip${v === 1 ? ' sys-chip--good' : v === 2 ? ' sys-chip--warn' : v === 3 ? ' sys-chip--bad' : ''}">${esc(r._capLbl)}</span>` },
    { key: '_ttr', label: 'Time to rev. (est.)', num: true, fmt: (v, r) => esc(r._ttrLbl) },
    { key: '_window', label: 'Buy window', wrap: true, fmt: v => `<span class="small text-2">${esc(clip(v, 6))}</span>` },
    { key: 'source_url', label: 'Source', fmt: v => fmt.link(v) },
  ] });
  if (params.id) { const o = opps.find(x => x.id === params.id); if (o) open(o); }
}
const card = (ctx, o) => { const c = opportunityCard(ctx, o, CFG.color); c.sub = ctx.esc(clip(o.why_now, 10)); c.chips += ctx.fmt.chip(String(o.value_or_scale || '').split(/[;(]/)[0].replace(/\[\s*'([^\]]*)'\s*\]/g, '$1').replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => m.replace(/_/g, ' ')).slice(0, 60)); return c; };
const nextAction = o => { const t = `${o.title} ${o.type}`;
  return /sustainab|b corp/i.test(t) ? 'Package B Corp (94.3) and recycled-bottle proof points into a one-page procurement sheet; use it in every B2B and hospitality pitch this quarter.'
    : /wholesale/i.test(t) ? 'Get the current door list with sell-through and reorder rate by account, then build a target list (golf pro shops, coastal specialty, campus stores) for the Spring/Summer 2027 line review.'
    : /international/i.test(t) ? 'Turn on Shopify Markets for one market (Canada or the UK) with landed-cost pricing; run a 90-day test with a go/no-go on conversion and return rate.'
    : /women/i.test(t) ? "Ask management for the women's post-mortem (sell-through, returns, markdown cost) before any relaunch capital is committed."
    : /cold-weather|kids|year-round/i.test(t) ? 'Ask for sell-through and gross margin by category for Holiday 2025 before sizing the Fall/Holiday 2027 buy.'
    : /b2b|custom/i.test(t) ? 'Build a target list of clubs, resorts and corporate-gifting buyers; set a Q4 2026 pipeline target and minimum order economics.'
    : /collegiate|licens|golf|collab/i.test(t) ? 'Agree terms (margin, MOQ, royalty minimums) and pilot with 3-5 partners; report sell-through per partner monthly.'
    : 'Write a one-page business case (revenue, margin, capital, owner) for the next BSP board meeting and set a 90-day pilot.'; };

async function market(ctx) {
  const { el, ui, fmt, esc, charts, maps, inspector } = ctx;
  let raw = null; try { raw = await ctx.data.load(CFG.sales); } catch (e) { console.warn(e.message); }
  if (!raw?.items?.length) { el.innerHTML = ui.pageHead({ title: `${esc(CFG.salesArea.replace(/\s*\(.*\)$/, ''))} home sales` }) + ui.note('The Manhattan home-sales dataset is not available yet.', 'warn'); return; }
  const meta = raw.meta || {}; const all = raw.items; const s = salesStats(all, fmt);
  el.innerHTML = ui.pageHead({ title: `${esc(CFG.salesArea.replace(/\s*\(.*\)$/, ''))} home sales`, sub: `${esc(CFG.marketLens(s))}`, chips: `${fmt.chip(`${fmt.num(all.length)} recorded sales`, CFG.hex)}${fmt.chip(`${day(fmt, meta.coverage?.date_from)} – ${day(fmt, meta.coverage?.date_to)}`.replace(/ \d{1,2},/g, ''))}<span class="sys-chip sys-chip--warn">Context only</span>` }) +
    `<div class="mb-12">${ui.note('No public data links these buyers to Fair Harbor customers.', 'warn')}</div>` +
    ui.kpis([
      { label: 'Arms-length home sales', value: s.n, color: CFG.color },
      { label: 'Median price', value: s.medTxt, color: 'var(--sys-warn)' },
      { label: '$2M+ sales', value: s.lux, sub: `${pp(fmt, s.res.filter(i => i.price >= 2e6).length / Math.max(1, s.res.length) * 100)} of home sales`, color: 'var(--co-bpi)' },
      { label: 'Top $2M+ area', value: kv2(esc, s.top[0] || '—'), sub: `${fmt.num(s.hoodRows.find(h => h.hood === s.top[0])?.lux)} sales ≥ $2M`, color: 'var(--co-fh)' },
    ]) +
    `<div class="mt-12" id="mk-f"></div>
    <div class="grid grid-main">
      ${ui.panel({ title: CFG.zipAgg ? 'Sales by ZIP' : 'Sales by parcel', flush: true, body: '<div class="map tall" id="mk-map"></div>' })}
      <div class="col gap-12">
        ${ui.panel({ title: 'Monthly volume', body: charts.bar(s.byM.map(m => ({ label: m.m.slice(2), value: m.n, color: CFG.hex })), { h: 130, fmt: v => fmt.num(v), labelEvery: Math.max(1, Math.ceil(s.byM.length / 7)) }) })}
        ${ui.panel({ title: 'Median price by month', body: charts.line([{ name: 'Median', color: 'var(--sys-warn)', points: s.byM.map(m => [m.m.slice(2), m.med]) }], { h: 130, fmt: v => money(fmt, v), area: true, xLabels: s.byM.map((m, i) => i % 2 === 0 && i < s.byM.length - 1 ? m.m.slice(2) : '') }) })}
        ${ui.panel({ title: `What it means for ${esc(CFG.short)}`, accent: true, body: `<ol class="prose small">${CFG.marketActions(s).map(a => `<li>${esc(a)}</li>`).join('')}</ol>` })}
      </div>
    </div>
    <div class="grid grid-side mt-12">
      ${ui.panel({ title: 'Neighborhoods', body: '<div id="mk-hood"></div>' })}
      ${ui.panel({ title: 'Sales ledger', body: '<div id="mk-tbl"></div>' })}
    </div>
    <div data-src>${ui.source(meta.method ? Copy.text(String(meta.method).split(/[.(]/)[0].slice(0, 90)) : 'Public property records', (all[0] || {}).source_url, meta.generated)}</div>
    <div data-src>${ui.source(Copy.text(`${Copy.dataset(meta.dataset || CFG.sales)}: ${(meta.caveats || [])[0] || ''}`).slice(0, 160), null, meta.generated)}</div>
    <div data-method>Map: bubble size is the count of sales, colour the median price. Home sales are arms-length residential sales of $50K or more. The latest partial month is dropped from the monthly charts. Monthly medians move with sales mix and are not a price index. Twelve months of data (September 2025 – August 2026) cannot give a same-period YoY trend, so none is shown. Owner names are not retained.</div>
    <span data-asof="${esc(meta.generated || '')}"></span>`;
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
      layer = maps.points(map, zr, { cluster: false, color: r => tok(band(r.median)), radius: r => Math.min(20, 3 + Math.sqrt(r.n) * 0.75), opacity: .6, popup: r => `<b>ZIP ${esc(r.zip)}</b><br>${fmt.num(r.n)} sales · median ${money(fmt, r.median)}` });
    } else layer = maps.points(map, rows, { cluster: false, color: r => tok(band(r.price)), radius: 3.2, weight: 0, opacity: .75, popup: r => `<b>${esc(r.addr)}</b><br>${money(fmt, r.price)} · ${day(fmt, r.sale_date)}<br><span class="muted">${esc(r.neighborhood || '')} · ${esc(r.use_code_raw || '')}</span>`, onClick: openSale });
    const sorted = rows.slice().sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)));
    tbl ? tbl.update(sorted) : (tbl = ui.table(el.querySelector('#mk-tbl'), { rows: sorted, pageSize: 10, exportName: `${CFG.id}_home_sales`, onRow: openSale, columns: [
      { key: 'sale_date', label: 'Date', num: true, fmt: v => day(fmt, v) },
      { key: 'addr', label: 'Address', fmt: (v, r) => `${esc(v)}<div class="dim small">${esc(r.neighborhood || '')} · ${esc(zipOk(r.zip) || '—')}</div>` },
      { key: 'price', label: 'Price', num: true, fmt: v => money(fmt, v) },
      { key: 'arms_length', label: 'Arms-length', fmt: v => v ? '<span class="sys-chip sys-chip--good">Yes</span>' : '<span class="sys-chip">No</span>' },
    ] }));
  }
  hoodTbl = ui.table(el.querySelector('#mk-hood'), { rows: s.hoodRows, pageSize: 10, sortKey: 'n', exportName: `${CFG.id}_neighborhoods`, onRow: openHood, columns: [
    { key: 'hood', label: 'Neighborhood', fmt: v => `<b>${esc(v)}</b>` }, { key: 'n', label: 'Sales', num: true, fmt: v => fmt.num(v) },
    { key: 'median', label: 'Median', num: true, fmt: v => money(fmt, v) }, { key: 'luxShare', label: '$2M+', num: true, fmt: v => pp(fmt, v) },
  ] });
  apply(f.state);
  ctx.app.index(s.hoodRows.filter(h => h.n >= 10).slice(0, 150).map(h => ({ label: `${h.hood} home sales`, sub: `${CFG.salesShort} · ${fmt.num(h.n)} sales · median ${money(fmt, h.median)}`, href: `#/${CFG.id}/market`, kind: 'Market', color: CFG.color })));
  return () => map.remove();
}

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
    { id: 'market', name: 'Manhattan home sales', icon: '⌂', render: market },
    { id: 'tools', name: 'Tools', render: ctx => embedView(ctx, 'redesigns/fair-harbor/harboros.html', { title: 'Fair Harbor tools' }) },
    { id: 'plan', name: 'Plan', render: ctx => embedView(ctx, 'redesigns/fair-harbor/growth-plan.html', { title: 'Fair Harbor plan' }) },
  ],
  tour: [
    { order: 700, hash: '#/fh/overview', caption: '<b>Fair Harbor.</b> 4.5 years in. First questions: sell-through, markdowns (38.5% of variants), wholesale doors.', narration: 'For Fair Harbor, the first questions for management are sell-through, markdowns and wholesale doors.', duration: 6000 },
    { order: 710, hash: '#/fh/opportunities', caption: '<b>9 sourced growth plays</b> ranked by capital and time to revenue. Quick wins first; builds wait on sell-through.', narration: 'Nine sourced growth plays, ranked by capital intensity and time to revenue.', duration: 6000 },
    { order: 720, hash: '#/fh/filings', caption: '<b>Filings.</b> $30.7M of entry equity is the hard number; revenue and EBITDA are estimates.', narration: 'The equity check is the hard number. Revenue and EBITDA stay estimates until management shares the books.', duration: 7000 },
  ],
};
