/* BPI value-creation playbook — renders every section from the repo datasets.
   Sources: bpi_playbook (template, phases, levers, agents, talent, financing, kpi_roadmap),
   bsp_firm (bsp-bpi add_ons, bpi_opportunities), bpi_filings (offices, estimates),
   pe_landscape (sponsors overlapping BPI), serviceos_evidence (ra-bpi, ve-22), public_comps. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const M = v => v == null ? '—' : `$${(v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1).replace(/\.0$/, '')}M`;
const K = v => `$${Math.round(v / 1000)}K`;
const num = v => Number(v).toLocaleString('en-US');
const monthsBetween = (a, b) => (new Date(b) - new Date(a)) / (1000 * 3600 * 24 * 30.4375);
const TODAY = '2026-10-06';
const est = '<span class="est">est.</span>';
const src = (url, label) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || host(url))}</a>` : '';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const narrow = (el, w = 520) => (el?.clientWidth || window.innerWidth) < w;

const C = { ink: '#0f1522', ink2: '#42495a', ink3: '#6b7282', line: '#e4dfd4', wash: '#efebe2', accent: '#c8264f', blue: '#1f4fd1', violet: '#6d3fc0', green: '#17845a', gold: '#a87414' };
const PHASE_C = ['#c8264f', '#1f4fd1', '#6d3fc0', '#17845a'];

const GEO = {
  'Washington DC': [38.9001, -77.031], 'New York': [40.7128, -74.006], 'San Francisco': [37.7749, -122.4194], 'Chicago': [41.8781, -87.6298],
  'Los Angeles': [34.0522, -118.2437], 'Boston': [42.3601, -71.0589], 'Miami': [25.7617, -80.1918], 'London': [51.5074, -0.1278],
  'Brussels': [50.8503, 4.3517], 'Berlin': [52.52, 13.405], 'Dusseldorf': [51.2277, 6.7735], 'Oslo': [59.9139, 10.7522],
  'Zurich': [47.3769, 8.5417], 'Geneva': [46.2044, 6.1432], 'Paris': [48.8566, 2.3522], 'Sydney': [-33.8688, 151.2093],
  // Smith + Howard footprint (template overlay)
  'Atlanta, GA': [33.749, -84.388], 'Chattanooga, TN': [35.0456, -85.3097], 'Chicago, IL': [41.8781, -87.6298], 'Dallas, TX': [32.7767, -96.797],
  'Richmond, VA': [37.5407, -77.436], 'Carolinas': [35.2271, -80.8431], 'Birmingham, AL': [33.5186, -86.8104], 'South Carolina': [34.0007, -81.0348],
};
const GEO_ALIAS = { 'US (6 hubs)': ['Washington DC', 'New York', 'San Francisco', 'Chicago', 'Los Angeles', 'Boston'], 'UK': ['London'], 'Germany': ['Berlin', 'Dusseldorf'], 'Nordics/Switzerland': ['Oslo', 'Zurich', 'Geneva'], 'APAC via Mandala': ['Sydney'], 'Zurich/Geneva': ['Zurich', 'Geneva'], 'Sydney (Mandala alliance)': ['Sydney'] };
const resolveGeo = g => GEO_ALIAS[g] || (GEO[g] ? [g] : g.split('/').map(s => s.trim()).filter(s => GEO[s]));

const OFFICE_NOTE = {
  'Washington DC': 'Headquarters · 1445 New York Ave NW', 'London': '#2 location, about 70 staff (Nov 2024)', 'Berlin': 'Germany is BPI\'s #3 market (365 Sherpas, May 2026)',
  'Boston': 'Presence expanded with the Dave Whiting hire (Aug 2026)', 'Los Angeles': 'New market with Propper Daley (Mar 2025)', 'Miami': 'New market with Propper Daley (Mar 2025)',
  'Brussels': 'EU affairs, arrived with BOLDT (Dec 2023)', 'Dusseldorf': 'Arrived with BOLDT (Dec 2023)', 'Oslo': 'Arrived with BOLDT (Dec 2023)', 'Zurich': 'Arrived with BOLDT (Dec 2023)', 'Geneva': 'Zurich/Geneva presence', 'Chicago': 'US hub', 'New York': 'US hub', 'San Francisco': 'US hub',
};
const ADDON_CITY = { 'BOLDT': 'Brussels', 'Seven Hills': 'London', 'Message House': 'London', 'Propper Daley': 'Los Angeles', '365 Sherpas': 'Berlin' };

const ICON = {
  radar: '<path d="M12 12l6-6"/><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.5c2.5 0 5.5 1.5 5.5 4.5"/>',
  gavel: '<path d="M14 4l6 6M11 7l6 6M8 10l6-6M10 16l-6 4M7 13l4 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
};
const AGENT_ICON = ['radar', 'pen', 'users', 'gavel', 'mail', 'spark', 'book', 'chart', 'shield'];
const AGENT_FILTERS = [
  ['all', 'Everyone'], ['account', 'Account & crisis teams', /account|crisis|media relations|junior/i], ['insights', 'Insights & strategy', /insight|research|strateg|partners preparing/i],
  ['pa', 'Public affairs', /public-affairs|trade-association|DC|Brussels/i], ['clients', 'Clients', /client/i], ['finance', 'Finance & integration', /finance|CFO|integration|all staff/i],
];
const CORE_AGENTS = new Set(['agent-01', 'agent-02', 'agent-03']);

/* ── Returns model (shared by the KPI row, the calculator and the chat FAQ) ──
   All inputs are analyst assumptions (est.). Acquired revenue is cumulative from Oct 2026 and
   reconciles the 2.5/yr add-on plan with the kpi_roadmap: ~$4.5–5M of net revenue per tuck-in. */
const MULT0 = 11.5;                         // constant multiple for "today vs month 36" comparisons
const ACQ = { 0: [0, 0], 12: [10e6, 2], 24: [22e6, 5], 36: [35e6, 7.5] }; // [acquired net revenue, deals closed]
const ACQ_MARGIN = 0.20, BUY_MULT = 7;      // acquired boutiques at ~20% margin, bought at 6–8x (midpoint)
const ENTRY_DATE = '2023-04-27';
const EXITS = { 36: { date: '2029-10-01', label: 'Oct 2029' }, 24: { date: '2028-10-01', label: 'Oct 2028' } };
const deals = n => Number.isInteger(n) ? String(n) : `${Math.floor(n)}–${Math.ceil(n)}`;
function returnsCase(pb, { E36, m, p, month = 36 }) {
  const r = pb.meta.kpi_roadmap; const an = pb.meta.anchors || {};
  const row = r.find(x => x.month === month) || r[r.length - 1], z = r[r.length - 1], e0 = r[0].ebitda_usd;
  const Ex = E36 * row.ebitda_usd / z.ebitda_usd;              // exit-year EBITDA (scales with the month-36 slider)
  const Ea = (ACQ[month] || ACQ[36])[0] * ACQ_MARGIN;           // acquired EBITDA in the exit year
  const spend = Ea * BUY_MULT;                                  // acquisition consideration, DDTL-funded
  const d = an.senior_debt_usd_range_est || [60e6, 110e6], debt0 = (d[0] + d[1]) / 2;
  const EV = Ex * (m + p), netDebt = debt0 + spend, equity = EV - netDebt, eq0 = an.entry_equity_usd || 90e6;
  const yrs = monthsBetween(ENTRY_DATE, (EXITS[month] || EXITS[36]).date) / 12, moic = equity / eq0;
  return { e0, Ex, Ea, spend, debt0, EV, netDebt, equity, eq0, yrs, moic, irr: moic > 0 ? Math.pow(moic, 1 / yrs) - 1 : NaN,
    steps: [['Today, same multiple', e0 * m, 'today'], ['Organic growth', (Ex - e0 - Ea) * m, 'org'], ['Add-ons at cost', spend, 'buy'], ['Multiple arbitrage', Ea * (m - BUY_MULT), 'arb'], ['SignalOS premium', Ex * p, 'sig']] };
}
const pct = v => `${(v * 100).toFixed(0)}%`;

/* ── small SVG helpers ─────────────────────────────────────────────────── */
const svg = (w, h, inner, label) => `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.fs || 11}" fill="${o.fill || C.ink2}" font-weight="${o.fw || 500}" text-anchor="${o.a || 'start'}"${o.mono ? ' font-family="JetBrains Mono, monospace"' : ''}>${esc(s)}</text>`;

/* ── KPIs ──────────────────────────────────────────────────────────────── */
function renderKpis(pb) {
  const r = pb.meta.kpi_roadmap; if (!r?.length) return;
  const a = r[0], z = r[r.length - 1];
  const ev0 = a.ebitda_usd * MULT0, ev1 = z.ebitda_usd * MULT0;
  const cagr = (x, y) => ((Math.pow(y / x, 1 / 3) - 1) * 100).toFixed(0);
  const spark = vals => { const mn = Math.min(...vals), mx = Math.max(...vals); const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${26 - ((v - mn) / ((mx - mn) || 1)) * 22}`).join(' '); return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${C.accent}" stroke-width="2" vector-effect="non-scaling-stroke"/><polyline points="0,30 ${pts} 100,30" fill="${C.accent}" opacity=".08" stroke="none"/></svg>`; };
  const k = [
    ['Net revenue', M(a.revenue_usd), M(z.revenue_usd), `+${Math.round((z.revenue_usd / a.revenue_usd - 1) * 100)}% · ${cagr(a.revenue_usd, z.revenue_usd)}% CAGR`, r.map(x => x.revenue_usd)],
    ['Adj. EBITDA', M(a.ebitda_usd), M(z.ebitda_usd), `margin ${(a.ebitda_usd / a.revenue_usd * 100).toFixed(0)}% → ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(0)}%`, r.map(x => x.ebitda_usd)],
    ['Headcount', num(a.headcount), num(z.headcount), `${a.locations_or_accounts} → ${z.locations_or_accounts} offices`, r.map(x => x.headcount)],
    ['Enterprise value', M(ev0), M(ev1), `both at ${MULT0}x · ${(ev1 / ev0).toFixed(1)}x today's EV`, r.map(x => x.ebitda_usd * MULT0)],
  ];
  $('#kpis').innerHTML = k.map(([l, f, to, d, s]) => `<div class="kpi"><div class="k">${esc(l)} ${est}</div><div class="v"><span class="from">${f}</span><span class="arrow" aria-label="to">→</span><span class="to">${to}</span></div><div class="delta">${esc(d)}</div>${spark(s)}</div>`).join('');
  $('#kpi-note').innerHTML = `Month 0 = ${esc(a.date)}, month 36 = ${esc(z.date)}. Today's figures are low-confidence analyst estimates from public filings (FY2025 net revenue $85–125M, adj. EBITDA $17–28M, ~375–425 staff), not company disclosures. Both EVs use the same basis: roadmap EBITDA × ${MULT0}x (midpoint of the 10–13x sponsor range), before any SignalOS premium. <b>Since entry:</b> Broad Sky's $90M of equity (Form D, Apr 2023) implies an entry EV of $150–220M ${est}; the equity return on that check, net of debt and add-on spend, is in the <a href="#returns">returns case</a>. The roadmap is an analyst assumption anchored to the bpi_filings midpoints, not a forecast or company guidance.`;
}

/* ── Template: swimlane + comparison ───────────────────────────────────── */
function renderTemplate(pb, firm) {
  const el = $('#swim'); const compact = narrow(el);
  const sh = pb.items.filter(i => i.id.startsWith('tpl-sh')).sort((a, b) => a.date.localeCompare(b.date));
  const shEntry = sh[0].date, shExit = sh.find(i => i.id === 'tpl-sh-11')?.date || '2026-08-06';
  const shAdds = sh.filter(i => !['entry', 'exit'].includes(i.stage));
  const bpi = firm?.items?.find(i => i.id === 'bsp-bpi'); const bEntry = bpi?.entry_date || '2023-04-27';
  const bAdds = (bpi?.add_ons || []).map(a => ({ ...a, m: monthsBetween(bEntry, a.date) }));
  const today = monthsBetween(bEntry, TODAY), planEnd = today + 36, maxM = Math.ceil(planEnd / 6) * 6;
  const W = compact ? 420 : 660, H = compact ? 250 : 280, L = compact ? 64 : 112, R = 16;
  const x = m => L + (m / maxM) * (W - L - R);
  const y1 = compact ? 78 : 92, y2 = compact ? 172 : 196;
  let g = '';
  for (let m = 0; m <= maxM; m += 12) { g += `<line x1="${x(m)}" x2="${x(m)}" y1="30" y2="${H - 32}" stroke="${C.line}" stroke-dasharray="${m ? '2 4' : ''}"/>${t(x(m), H - 14, m ? `yr ${m / 12}` : 'entry', { a: 'middle', fs: 10.5, fill: C.ink3, mono: 1 })}`; }
  g += t(compact ? 4 : 8, y1 + 4, compact ? 'S + H' : 'Smith + Howard', { fw: 700, fill: C.ink, fs: compact ? 11 : 12.5 }) + t(compact ? 4 : 8, y2 + 4, 'BPI', { fw: 700, fill: C.accent, fs: compact ? 11 : 12.5 });
  if (!compact) g += t(8, y1 + 19, 'Nov 2022 → Aug 2026', { fs: 10, fill: C.ink3, mono: 1 }) + t(8, y2 + 19, 'Apr 2023 → plan', { fs: 10, fill: C.ink3, mono: 1 });
  const shEnd = monthsBetween(shEntry, shExit);
  g += `<line x1="${x(0)}" x2="${x(shEnd)}" y1="${y1}" y2="${y1}" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`;
  const short = s => s.replace(/^(Merges with|Acquires|Signs agreement to acquire)\s+/i, '').replace(/\s*\(.*\)$/, '').replace(/ joins.*/, '').replace(/ & Co\.?$/, '').replace(/^VIP Search.*/, 'VIP').replace('Horton, Lee & Burnett', 'HLB').replace('Bauknight Pietras & Stormer', 'BPS').replace('Market Street Partners', 'Market St').replace('Fahrenheit Advisors', 'Fahrenheit').replace('JMM CPAs', 'JMM');
  shAdds.forEach((a, i) => { const m = monthsBetween(shEntry, a.date), lv = i % 3; g += `<circle cx="${x(m)}" cy="${y1}" r="6" fill="#fff" stroke="${C.ink}" stroke-width="2.5"><title>${esc(a.date + ' · ' + a.event + ' · ' + a.location)}</title></circle>`; if (!compact) g += t(x(m), lv === 2 ? y1 + 24 : y1 - 13 - lv * 14, short(a.event), { a: 'middle', fs: 11, fill: C.ink2 }); });
  g += `<path d="M${x(shEnd)} ${y1 - 10} l3 7 7 .5 -5.5 4.5 2 7 -6.5 -4 -6.5 4 2 -7 -5.5 -4.5 7 -.5z" fill="${C.green}"><title>Sold to TPG Growth, Aug 2026</title></path>`;
  g += t(x(shEnd) + 12, y1 + 4, compact ? 'TPG' : 'Sold to TPG Growth', { fs: 10.5, fw: 700, fill: C.green });
  g += `<line x1="${x(0)}" x2="${x(today)}" y1="${y2}" y2="${y2}" stroke="${C.accent}" stroke-width="3" stroke-linecap="round"/><line x1="${x(today)}" x2="${x(planEnd)}" y1="${y2}" y2="${y2}" stroke="${C.accent}" stroke-width="2.5" stroke-dasharray="5 5" opacity=".7"/>`;
  const seen = {}; bAdds.forEach((a, i) => { const k = a.date; seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) return; const n = bAdds.filter(b => b.date === k); const lab = n.length > 1 ? 'Seven Hills + MH' : n[0].name.replace(' Communications', ''); g += `<circle cx="${x(a.m)}" cy="${y2}" r="${n.length > 1 ? 8 : 6}" fill="${C.accent}" stroke="#fff" stroke-width="2"><title>${esc(n.map(b => b.date + ' · ' + b.name + ' · ' + b.hq).join('\n'))}</title></circle>${n.length > 1 ? t(x(a.m), y2 + 3.5, '2', { a: 'middle', fs: 9, fw: 800, fill: '#fff', mono: 1 }) : ''}`; const lv = (i - (i > 1 ? 1 : 0)) % 3; if (!compact) g += t(x(a.m), lv === 1 ? y2 + 24 : y2 - 13 - (lv ? 14 : 0), lab, { a: 'middle', fs: 11, fill: C.accent, fw: 600 }); });
  const per = 12 / 2.5; for (let k = 1; today + k * per < planEnd; k++) g += `<circle cx="${x(today + k * per)}" cy="${y2}" r="5.5" fill="#fff" stroke="${C.accent}" stroke-width="2" stroke-dasharray="2 2"><title>Planned specialist tuck-in at 2.5 per year (est.)</title></circle>`;
  g += `<line x1="${x(today)}" x2="${x(today)}" y1="${y2 - 36}" y2="${y2 + 34}" stroke="${C.ink}" stroke-width="1.2"/>${t(x(today), y2 - 40, 'today', { a: 'middle', fs: 10, fw: 700, fill: C.ink, mono: 1 })}`;
  g += `<rect x="${x(planEnd) - 7}" y="${y2 - 7}" width="14" height="14" rx="3" fill="${C.green}" opacity=".85"><title>Exit window after the 2028 cycle (est.)</title></rect>`;
  g += t(x(planEnd) + 4, y2 + 24, compact ? 'exit' : 'exit window (est.)', { a: 'end', fs: 10.5, fw: 600, fill: C.green });
  g += `<line x1="${x(shEnd)}" x2="${x(shEnd)}" y1="${y1 + 10}" y2="${y2 - 12}" stroke="${C.green}" stroke-dasharray="3 3" opacity=".7"/>`;
  el.innerHTML = svg(W, H, g, 'Swimlane timeline: Smith + Howard add-ons and exit versus BPI add-ons to date and planned tuck-ins, by months since entry');
  const shRate = (shAdds.length + 1) / monthsBetween(shEntry, shExit) * 12; // exit release counts 9 add-ons
  const bRate = bAdds.length / monthsBetween(bEntry, bAdds[bAdds.length - 1]?.date || TODAY) * 12;
  $('#swim-src').innerHTML = `Filled dots are closed add-ons (BPI's "2" is Seven Hills + Message House, closed together). Hollow dashed dots are planned tuck-ins at 2.5 a year ${est}. Smith + Howard: 8 dated add-ons in the dataset, 9 per the exit release. Sources: ${src('https://broadskypartners.com/broad-sky-partners-completes-sale-of-smith-howard-to-tpg/', 'Broad Sky exit release')}, ${src('https://bpigroup.com/bpi-strengthens-transatlantic-corporate-affairs-offer-with-acquisition-of-365-sherpas/', 'BPI releases')}, bsp_firm.`;
  const rows = [
    ['Entry', '<b>~100 professionals</b>, 1 Atlanta office (Nov 2022)', `<b>200+ staff</b>, DC-led, $90M equity (Apr 2023)`],
    ['Scale', '<b>~800</b> people, 11 locations at exit', `<b>~400</b> today → <b>~560</b> at month 36 ${est}; 15 → 19 offices`],
    ['Add-on pace', `<b>9</b> in ~3.7 yrs (<b>${shRate.toFixed(1)}/yr</b>)`, `<b>${bAdds.length}</b> since entry (<b>${bRate.toFixed(1)}/yr</b>) → target <b>2.5/yr</b>`],
    ['Geography move', 'Atlanta → Southeast density → Richmond, Carolinas, Dallas, Chicago, India', 'DC → London (#2 hub) → Germany (#3 market) → Brussels, Paris'],
    ['Specialist buys', 'Benefit-plan audit, staffing advisory, cyber-risk SOC (last before sale)', 'Message testing, sports, corporate affairs; next: data, health, energy, AI policy'],
    ['Growth', '~4x revenue over the hold', `$105M → $160M net revenue ${est} (1.5x), before upside from the 2028 cycle`],
    ['Exit', 'TPG Growth, signed Jun 2026, closed Aug 2026', 'Growth or sector sponsor after the 2028 off-year test (Penta → Shamrock, FGS → KKR)'],
  ];
  $('#cmp tbody').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  const an = [['tpl-penta-03', 'Penta → Shamrock', '$100M+', 'reported revenue, about half from AI/data'], ['tpl-fgs-03', 'FGS Global → KKR', '$1.7B', 'enterprise value, 1,400+ experts'], ['tpl-teneo-01', 'Teneo → CVC', '9 deals', '3x headcount in ~4 years, reported ~$700M']];
  $('#analogs').innerHTML = an.map(([id, h, big, sub]) => { const it = pb.items.find(i => i.id === id) || {}; return `<article class="card pad analog rv"><span class="tag"><i style="background:${C.violet}"></i>Analog exit · ${esc(String(it.date || '').slice(0, 7))}</span><h3 style="margin-top:10px">${esc(h)}</h3><div class="big">${esc(big)}</div><div class="src">${esc(sub)}</div><p>${esc(it.lesson_for_bpi || '')}</p><p class="src" style="margin-top:8px">Confidence: ${esc(it.confidence || 'n/a')} · ${src(it.source_url)}</p></article>`; }).join('');
}

/* ── Phased map ────────────────────────────────────────────────────────── */
let MAP = null, phaseLayer = null;
function renderMap(pb, firm, filings, pe) {
  const phases = pb.items.filter(i => i.kind === 'expansion_phase');
  const opps = firm?.bpi_opportunities || [];
  const fed = opps.filter(o => /^federal/.test(o.type));
  const fedTotal = phases[1]?.data_points?.find(d => /Combined ceiling/i.test(d.label))?.value || 250486000;
  const sponsors = (pe?.items || []).filter(p => (p.overlap_with_bsp || []).includes('bpi'));
  const bpi = firm?.items?.find(i => i.id === 'bsp-bpi');
  const offFig = (filings?.items || []).find(i => i.id === 'bpi-014')?.key_figures?.office_list || ['Berlin', 'Brussels', 'Chicago', 'Washington DC', 'Dusseldorf', 'London', 'New York', 'Oslo', 'San Francisco', 'Zurich'];
  const newMk = (filings?.items || []).find(i => i.id === 'bpi-016')?.key_figures?.new_markets || ['Los Angeles', 'Miami'];
  const offices = [...new Set([...offFig, ...newMk, 'Boston', 'Geneva'])].filter(c => GEO[c]);

  $('#map-stats').innerHTML = [
    [`${offices.length}`, 'office cities mapped: the Mar 2025 office list, LA and Miami (Propper Daley) and Boston'], ['6', 'countries, plus APAC via the Mandala alliance'],
    [M(fedTotal), `combined ceiling of ${fed.length} tracked federal recompetes (BPI primes today: $0)`], [`${sponsors.length}`, `sponsors that overlap BPI (${sponsors.filter(s => s.threat_level === 'high').length} high threat)`],
  ].map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');

  const tabs = $('#phase-tabs');
  tabs.innerHTML = ['All', ...phases.map((_, i) => `P${i + 1}`)].map((l, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i - 1}" style="--pc:${i ? PHASE_C[i - 1] : C.ink}">${l}</button>`).join('');
  const body = $('#phase-body');
  const showPhase = i => {
    $$('button', tabs).forEach(b => b.setAttribute('aria-selected', String(+b.dataset.i === i)));
    if (i < 0) {
      body.innerHTML = `<div class="when">OCT 2026 → SEP 2029 · 36 MONTHS</div><h3>The whole plan on one map</h3><p>${esc(pb.meta.narrative_sentences?.[0] || '')}</p>${phases.map((p, k) => `<div class="dp" style="cursor:pointer" data-go="${k}"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${PHASE_C[k]};margin-right:7px"></i><b style="font-family:var(--sans);font-weight:650;color:var(--ink)">P${k + 1}</b> ${esc(p.phase)}</span><b>${esc(String(p.months).split(' ')[0])} mo</b></div>`).join('')}<p class="src" style="margin-top:12px">Tap a phase row or tab to zoom in.</p>`;
      $$('[data-go]', body).forEach(d => d.onclick = () => showPhase(+d.dataset.go));
    } else {
      const p = phases[i], kt = p.kpi_targets || {};
      const fmtV = d => Array.isArray(d.value) ? (/USD/.test(d.unit) ? `${M(d.value[0])}–${M(d.value[1])}` : `${d.value[0]}–${d.value[1]}${/turn|x/.test(d.unit) ? 'x' : ''}`) : (/^USD$/.test(d.unit) ? M(d.value) : d.unit === '%' ? `${d.value}%` : d.unit === 'x' ? `${d.value}x` : `${num(d.value)}`);
      const geos = p.geography || []; const off = geos.filter(g => resolveGeo(g).some(c => GEO[c][1] > 60));
      body.innerHTML = `<div class="when" style="color:${PHASE_C[i]}">PHASE ${i + 1} · MONTHS ${esc(p.months)}</div><h3>${esc(p.phase)}</h3><p>${esc(p.thesis)}</p>
        <div class="kt"><div><small>Revenue</small><b>${M(kt.revenue_usd)}</b></div><div><small>EBITDA</small><b>${M(kt.ebitda_usd)}</b></div><div><small>${kt.international_share_pct ? 'Intl. share' : 'Recurring'}</small><b>${kt.international_share_pct ?? kt.recurring_share_pct ?? '—'}%</b></div></div>
        <div class="src" style="margin-bottom:6px">KPI gate ${est} · ${esc(String(kt.label || '').replace(/^est\. - /, ''))}</div>
        ${(p.data_points || []).slice(0, 6).map(d => `<div class="dp"><span>${esc(d.label)}<br><span class="src">${esc(d.source)}</span></span><b>${esc(fmtV(d))}</b></div>`).join('')}
        <p class="src" style="margin-top:10px">Where: ${esc(geos.join(' · '))}${off.length ? ` (${esc(off.join(', '))} is off the zoomed map)` : ''}. ${src(p.source_url, 'Lead source')}</p>`;
    }
    drawPhase(phases, i);
  };
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) showPhase(+b.dataset.i); };
  tabs.onkeydown = e => { if (!/Arrow(Left|Right)/.test(e.key)) return; const bs = $$('button', tabs); const cur = bs.findIndex(b => b.getAttribute('aria-selected') === 'true'); const n = bs[(cur + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); showPhase(+n.dataset.i); };

  if (!window.L) { $('#map').innerHTML = '<p class="pad">Map library failed to load.</p>'; showPhase(-1); return; }
  const mob = window.innerWidth < 720;
  MAP = L.map('map', { center: [44, -38], zoom: mob ? 2 : 3, minZoom: 2, maxZoom: 12, scrollWheelZoom: false, worldCopyJump: true, attributionControl: true });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16 }).addTo(MAP);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'shadowPane' }).addTo(MAP);

  const addonsBy = {}; (bpi?.add_ons || []).forEach(a => { const c = ADDON_CITY[a.name]; if (c) (addonsBy[c] = addonsBy[c] || []).push(a); });
  const layers = {
    offices: L.layerGroup(offices.map(c => {
      const ad = addonsBy[c] || []; const hq = c === 'Washington DC';
      const g = L.layerGroup();
      if (ad.length) L.circleMarker(GEO[c], { radius: 13, color: C.accent, weight: 2, fill: false, dashArray: '3 3' }).addTo(g);
      L.circleMarker(GEO[c], { radius: hq ? 9 : 6.5, color: '#fff', weight: 2, fillColor: hq ? C.accent : C.ink, fillOpacity: 1 })
        .bindPopup(`<b>${esc(c)}</b><br>${esc(OFFICE_NOTE[c] || 'Office')}${ad.length ? `<br><br><b>Add-on${ad.length > 1 ? 's' : ''}:</b> ${ad.map(a => `${esc(a.name)} (${esc(a.date.slice(0, 7))})`).join(', ')}` : ''}<div class="src" style="margin-top:6px">bpi_filings bpi-014/016 · bsp_firm add_ons</div>`).addTo(g);
      return g;
    })),
    federal: L.layerGroup([L.circleMarker([38.86, -76.94], { radius: 15, color: C.gold, weight: 2, fillColor: C.gold, fillOpacity: .25 })
      .bindPopup(`<b>Federal communications recompetes (aggregate)</b><br>${fed.length} tracked · ${M(fedTotal)} combined ceiling/value<br>Agencies: NASA, DOL Job Corps, DOE (SEOSS), Navy/USMC, SSA, NAGB<br>BPI federal prime awards to date: $0 (USASpending)<div class="src" style="margin-top:6px">bsp_firm bpi_opportunities · eligibility and set-asides unverified ${''}</div>`)]),
    sponsors: L.layerGroup(Object.values(sponsors.reduce((acc, s) => { const k = `${s.hq_lat},${s.hq_lon}`; (acc[k] = acc[k] || { ll: [s.hq_lat, s.hq_lon], hq: s.hq, firms: [] }).firms.push(s); return acc; }, {}))
      .map(g => L.circleMarker([g.ll[0] - .35, g.ll[1] + .5], { radius: 6 + g.firms.length * 2.5, color: C.blue, weight: 1.5, fillColor: C.blue, fillOpacity: .18 })
        .bindPopup(`<b>${esc(g.hq)}: ${g.firms.length} sponsor${g.firms.length > 1 ? 's' : ''} overlapping BPI</b><br>${g.firms.map(f => `${esc(f.firm)} <span class="src">(${esc(f.threat_level)} threat)</span>`).join('<br>')}<div class="src" style="margin-top:6px">pe_landscape · competes for deals and add-ons</div>`))),
    template: L.layerGroup(pb.items.filter(i => i.id.startsWith('tpl-sh') && GEO[i.location]).map(i => L.circleMarker(GEO[i.location], { radius: 6, color: C.green, weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .bindPopup(`<b>Smith + Howard · ${esc(i.location)}</b><br>${esc(i.event)} (${esc(i.date.slice(0, 7))})<br><span class="src">${esc(i.lesson_for_bpi)}</span>`))),
  };
  layers.offices.addTo(MAP); layers.federal.addTo(MAP); layers.sponsors.addTo(MAP);
  phaseLayer = L.layerGroup().addTo(MAP);
  const leg = L.control({ position: 'topright' });
  leg.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend-x');
    d.innerHTML = `<div class="t">Layers</div>${[['offices', 'BPI offices (ring = add-on)', C.ink, 1], ['federal', `Federal recompetes · ${M(fedTotal)}`, C.gold, 1], ['sponsors', 'Competing sponsors (pe_landscape)', C.blue, 1], ['template', 'Smith + Howard footprint', C.green, 0]].map(([k, l, c, on]) => `<label><input type="checkbox" data-l="${k}" ${on ? 'checked' : ''}><span class="sw" style="background:${c}"></span>${esc(l)}</label>`).join('')}`;
    L.DomEvent.disableClickPropagation(d);
    d.querySelectorAll('input').forEach(inp => inp.onchange = () => { const l = layers[inp.dataset.l]; inp.checked ? l.addTo(MAP) : MAP.removeLayer(l); if (inp.dataset.l === 'template' && inp.checked) MAP.flyTo([38, -60], window.innerWidth < 720 ? 2 : 3, { duration: .6 }); });
    return d;
  };
  leg.addTo(MAP);
  showPhase(-1);
  setTimeout(() => MAP.invalidateSize(), 200);
}
function drawPhase(phases, i) {
  if (!MAP) return; phaseLayer.clearLayers();
  const list = i < 0 ? phases.map((p, k) => [p, k]) : [[phases[i], i]];
  const pts = [];
  list.forEach(([p, k]) => (p.geography || []).flatMap(resolveGeo).forEach((c, j) => {
    const ll = GEO[c]; if (!ll) return; if (ll[1] < 60) pts.push(ll);
    const off = i < 0 ? (k - 1.5) * .9 : 0;
    L.circle([ll[0] + off * .6, ll[1] + off], { radius: i < 0 ? 90000 : 140000, color: PHASE_C[k], weight: 1.5, fillColor: PHASE_C[k], fillOpacity: i < 0 ? .12 : .2 })
      .bindPopup(`<b>Phase ${k + 1}: ${esc(c)}</b><br>${esc(p.phase)}<br><span class="src">${esc(p.months)}</span>`).addTo(phaseLayer);
  }));
  if (i >= 0 && pts.length) MAP.flyToBounds(L.latLngBounds(pts).pad(.35), { duration: .7, maxZoom: 5 });
  else if (i < 0) MAP.flyTo([44, -38], window.innerWidth < 720 ? 2 : 3, { duration: .5 });
}

/* ── Levers ────────────────────────────────────────────────────────────── */
function fmtLever(v, unit) {
  if (v == null) return 'undisclosed';
  if (/USD ARR/.test(unit)) return v ? M(v) : '$0';
  if (/USD per FTE/.test(unit)) return K(v);
  if (/add-ons per year/.test(unit)) return `${v}/yr`;
  if (/prime awards/.test(unit)) return `${v}`;
  if (/%/.test(unit)) return `${v > 0 && /change/.test(unit) ? '+' : ''}${v}%`;
  return String(v);
}
function renderLevers(pb) {
  const pick = ['lever-01', 'lever-02', 'lever-03', 'lever-04', 'lever-05', 'lever-06', 'lever-07', 'lever-08'];
  const lv = pick.map(id => pb.items.find(i => i.id === id)).filter(Boolean);
  $('#lever-grid').innerHTML = lv.map((l, k) => {
    const res = l.id === 'lever-03'; // plot as resilience (% of net revenue kept) so a longer bar is better, like the other levers
    const b = res && l.baseline != null ? 100 + l.baseline : l.baseline, tg = res && l.target != null ? 100 + l.target : l.target;
    const sc = res ? 100 : Math.max(Math.abs(b ?? 0), Math.abs(tg ?? 0)) * 1.08 || 1;
    const w = v => v == null ? 0 : Math.max(2, Math.abs(v) / sc * 100);
    const fv = (v, raw) => res ? `${v}% kept` : fmtLever(raw, l.unit);
    const ev = res ? 'Peer proxy, not BPI: Stagwell Communications (SKDK et al.) fell 16.5% organically in FY2025, the year after the election (83.5% of net revenue kept), including a $62.7M advocacy decline. BPI\'s gross FEC billings, mostly pass-through media, went from $115.3M (2024) to about $3.1M in the 2022 off-cycle (weaker-sourced). The target assumes corporate and international retainers absorb the swing.' : l.evidence;
    return `<article class="card lever rv"><div class="lever-top"><h3>${esc(l.lever)}</h3><span class="n">L${k + 1}</span></div>
      <div class="bars"><div class="bar b"><span class="lab">${res ? 'Peer' : 'Today'}</span><div class="track"><div class="fill ${l.baseline == null ? 'unk' : ''}${res ? ' proxy' : ''}" data-w="${w(b)}"></div></div><span class="val">${esc(fv(b, l.baseline))}</span></div>
      <div class="bar t"><span class="lab">Mo 36</span><div class="track"><div class="fill" data-w="${w(tg)}"></div></div><span class="val">${esc(fv(tg, l.target))}</span></div></div>
      <p>${esc(ev)}</p><div class="meta"><span class="src">${res ? 'Net revenue kept in the post-election year (100% + organic change). Top bar is a peer proxy (Stagwell Comms FY2025), hatched because it is not BPI data' : esc(l.unit)} · ${esc(l.confidence)}</span><span class="src">${src(l.source_url)}</span></div></article>`;
  }).join('');
  const g = ['lever-09', 'lever-10'].map(id => pb.items.find(i => i.id === id)).filter(Boolean);
  $('#lever-guard').innerHTML = g.length ? `Guardrails tracked alongside the eight: ${g.map(x => `<b>${esc(x.lever)}</b> target ${x.id === 'lever-09' ? '<' : ''}${esc(x.target)}% (${esc(x.evidence.split('. ')[0])})`).join('; ')}.` : '';
}

/* ── Agents ────────────────────────────────────────────────────────────── */
function renderAgents(pb) {
  const ag = pb.items.filter(i => i.kind === 'ai_agent');
  const f = $('#agent-filter');
  f.innerHTML = AGENT_FILTERS.map(([k, l], i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${esc(l)} <span class="src">${k === 'all' ? ag.length : ag.filter(a => AGENT_FILTERS.find(x => x[0] === k)[2].test(a.who_it_helps)).length}</span></button>`).join('');
  const fmtM = a => a.metric_unit?.includes('correlation') ? a.metric_value.toFixed(2) : a.metric_unit?.startsWith('%') ? `${a.metric_value}%` : num(a.metric_value);
  $('#agent-grid').innerHTML = ag.map((a, i) => `<article class="card agent rv" data-who="${esc(a.who_it_helps)}">
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[AGENT_ICON[i % AGENT_ICON.length]]}</svg></div>${CORE_AGENTS.has(a.id) ? '<span class="tag" style="background:var(--accent-wash);color:var(--accent-ink)">★ SignalOS core</span>' : `<span class="tag">${esc(a.weeks_to_deploy)} wks</span>`}</div>
    <h3>${esc(a.agent)}</h3><p>${esc(a.job_to_be_done)}</p>
    <div class="metric"><b>${esc(fmtM(a))}</b><span>${esc(a.metric_unit)}</span></div>
    <p class="src" style="font-family:var(--sans);font-size:12px">${esc(a.metric_claim)}</p>
    <div class="row">${(a.vendor_examples || []).map(v => `<span class="tag">${esc(v)}</span>`).join('')}</div>
    <div class="foot"><span class="src"><b style="color:var(--ink)">Helps:</b> ${esc(a.who_it_helps)}</span></div>
    <div class="src">${esc(a.cost_model?.model || '')}${a.cost_model?.examples ? ` · ${esc(a.cost_model.examples)}` : ''} · deploy ${esc(a.weeks_to_deploy)} wks ${est} · ${src(a.source_url)}</div></article>`).join('');
  f.onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('button', f).forEach(x => x.setAttribute('aria-pressed', String(x === b))); const rx = AGENT_FILTERS.find(x => x[0] === b.dataset.k)[2]; $$('.agent').forEach(c => c.classList.toggle('dim', !!rx && !rx.test(c.dataset.who))); };
}

/* ── Talent ────────────────────────────────────────────────────────────── */
function renderTalent(pb) {
  $('#talent-grid').innerHTML = pb.items.filter(i => i.kind === 'talent_program').map((p, i) => `<article class="card tp rv"><div class="k">Program ${i + 1} · ${esc(p.confidence)} confidence</div><h3>${esc(p.program)}</h3><p><b style="color:var(--ink)">For:</b> ${esc(p.who_it_helps)}</p><p>${esc(p.evidence)}</p><div class="m">Measure: ${esc(p.metric)}</div><p class="src" style="margin:10px 0 0">${src(p.source_url)}</p></article>`).join('');
}

/* ── Add-on machine ────────────────────────────────────────────────────── */
function renderAddons(pb, firm, pe) {
  const el = $('#cadence'); const compact = narrow(el);
  const sh = pb.items.filter(i => i.id.startsWith('tpl-sh')).sort((a, b) => a.date.localeCompare(b.date));
  const shE = sh[0].date, shX = sh.find(i => i.id === 'tpl-sh-11').date;
  const shY = sh.filter(i => !['entry', 'exit'].includes(i.stage)).map(i => monthsBetween(shE, i.date) / 12);
  const bpi = firm?.items?.find(i => i.id === 'bsp-bpi'); const bE = bpi?.entry_date || '2023-04-27';
  const bY = (bpi?.add_ons || []).map(a => monthsBetween(bE, a.date) / 12).sort((a, b) => a - b);
  const now = monthsBetween(bE, TODAY) / 12, end = now + 3;
  const W = compact ? 400 : 520, H = compact ? 270 : 300, L = 34, R = compact ? 74 : 96, T = 18, B = 30;
  const maxX = Math.ceil(end), maxY = Math.ceil((bY.length + 2.5 * 3) / 2) * 2;
  const x = v => L + v / maxX * (W - L - R), y = v => H - B - v / maxY * (H - T - B);
  const step = (arr, endX) => { let d = `M${x(0)} ${y(0)}`; arr.forEach((v, i) => { d += ` H${x(v)} V${y(i + 1)}`; }); return d + ` H${x(endX)}`; };
  let g = '';
  for (let v = 0; v <= maxY; v += 2) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}"/>${t(L - 6, y(v) + 4, v, { a: 'end', fs: 10, fill: C.ink3, mono: 1 })}`;
  for (let v = 0; v <= maxX; v++) g += t(x(v), H - B + 16, `${v}y`, { a: 'middle', fs: 10, fill: C.ink3, mono: 1 });
  g += `<path d="${step(shY, monthsBetween(shE, shX) / 12)}" fill="none" stroke="${C.ink}" stroke-width="2.5"/>`;
  g += `<path d="${step(bY, now)}" fill="none" stroke="${C.accent}" stroke-width="2.5"/>`;
  g += `<line x1="${x(now)}" y1="${y(bY.length)}" x2="${x(end)}" y2="${y(bY.length + 7.5)}" stroke="${C.accent}" stroke-width="2.5" stroke-dasharray="6 5"/>`;
  g += `<line x1="${x(now)}" y1="${y(bY.length)}" x2="${x(end)}" y2="${y(bY.length + 6)}" stroke="${C.ink3}" stroke-width="1.5" stroke-dasharray="2 4"/>`;
  g += `<line x1="${x(now)}" x2="${x(now)}" y1="${T}" y2="${H - B}" stroke="${C.ink}" stroke-width="1" opacity=".5"/>${t(x(now) + 4, T + 10, 'today', { fs: 10, fw: 700, mono: 1, fill: C.ink })}`;
  const shEnd = monthsBetween(shE, shX) / 12;
  g += `<path d="M${x(shEnd)} ${y(shY.length) - 9} l2.6 6 6 .4 -4.7 3.9 1.7 6 -5.6 -3.4 -5.6 3.4 1.7 -6 -4.7 -3.9 6 -.4z" fill="${C.green}"><title>Smith + Howard sold to TPG Growth</title></path>`;
  const lg = [[C.ink, '', 'Smith + Howard (★ sold to TPG)'], [C.accent, '', 'BPI actual'], [C.accent, '6 5', 'BPI plan, 2.5/yr']]; lg.forEach(([c, d, l], i) => { const lx = L + 10, ly = T + 18 + i * 16; g += `<line x1="${lx}" x2="${lx + 22}" y1="${ly}" y2="${ly}" stroke="${c}" stroke-width="2.5" ${d ? `stroke-dasharray="${d}"` : ''}/>` + t(lx + 28, ly + 4, l, { fs: 10.5, fill: C.ink2 }); });
  g += t(x(end) + 6, y(bY.length + 7.5) + 4, `${bY.length + 7}–${bY.length + 8} @ 2.5/yr`, { fs: 11, fw: 700, fill: C.accent });
  g += t(x(end) + 6, y(bY.length + 6) + 14, `${bY.length + 6} @ 2.0/yr`, { fs: 10.5, fw: 600, fill: C.ink3 });
  g += t(L, T - 4, 'Cumulative add-ons by years since Broad Sky entry', { fs: 11, fw: 700, fill: C.ink });
  el.innerHTML = svg(W, H, g, 'Cumulative add-ons since entry: Smith + Howard versus BPI actual and planned');
  $('#cadence-src').innerHTML = `Black: Smith + Howard (8 dated add-ons, 9 per the exit release). Crimson: BPI actual, then the 2.5/yr plan ${est}: 7–8 more deals by Oct 2029, for ${bY.length + 7}–${bY.length + 8} in all. Grey: the current ~2.0/yr pace. Seven Hills and Message House count as two. Sources: bpi_playbook lever-06, bsp_firm add_ons.`;

  const T6 = [
    ['Narrative-intelligence / data shop (US)', 'Penta started from a data firm, and S+H\'s last pre-sale buy was tech-enabled. Brings proprietary data into SignalOS ARR.', '$3–6M'],
    ['Brussels EU-affairs specialist', 'Lets one retainer cover DC, Brussels and Berlin across the AI Act, energy and trade files. Phase 3.', '$2–5M'],
    ['Health & life-sciences policy comms (Boston)', 'Builds on the Whiting hire. Regulation produces recurring mandates.', '$3–6M'],
    ['Energy & critical-minerals public affairs', 'DOE SEOSS recompetes and the Mandala critical-minerals focus.', '$2–5M'],
    ['Paris corporate-affairs boutique', 'France is in the Reputation Resilience Index. Completes the FGS-style triangle.', '$4–8M'],
    ['Federal comms contractor with schedule vehicles', 'BPI has $0 in federal primes. Buy or team for access to about $250M of recompetes.', '$3–7M'],
  ];
  $('#targets tbody').innerHTML = T6.map((r, i) => `<tr><td><span class="pri">${i + 1}</span></td><td><b>${esc(r[0])}</b></td><td style="color:var(--ink-2)">${esc(r[1])}</td><td class="r">${esc(r[2])}</td></tr>`).join('');
  const sp = (pe?.items || []).filter(p => (p.overlap_with_bsp || []).includes('bpi')).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.threat_level] - { high: 0, medium: 1, low: 2 }[b.threat_level]));
  $('#target-note').innerHTML = `Size bands are net revenue per deal, analyst assumptions ${est}. They are sized to reconcile with the roadmap: 7–8 tuck-ins at about $4.5–5M each add roughly $35M of acquired revenue by month 36 (see the acquired column in the returns section). Larger deals would mean fewer of them. These are archetypes to source against; a named BPI target screen (like the CET and PP lists in the portal) is the next data build.`;
  $('#sponsor-note').innerHTML = `${sp.length} sponsors in pe_landscape overlap BPI and compete for the same communications platforms and add-ons. Shamrock bought Penta in 2025. Pre-agreed delayed-draw capacity is how BPI wins on speed.`;
  $('#sponsors').innerHTML = sp.map(s => `<span class="tag ${s.threat_level === 'high' ? 'high' : ''}" title="${esc(s.hq)}">${esc(s.firm.replace(/ - .*/, ''))} · ${esc(s.threat_level)}</span>`).join('');
}

/* ── Financing & returns ───────────────────────────────────────────────── */
function renderReturns(pb, ev) {
  const r = pb.meta.kpi_roadmap || [];
  $('#roadmap tbody').innerHTML = r.map((x, i) => `<tr class="${i === 0 ? 'now' : i === r.length - 1 ? 'exit' : ''}"><td><b>M${x.month}</b> <span class="src">${esc(x.date)}</span></td><td>${M(x.revenue_usd)}</td><td>${M(x.ebitda_usd)}</td><td>${(x.ebitda_usd / x.revenue_usd * 100).toFixed(1)}%</td><td>${(ACQ[x.month] || [0])[0] ? M(ACQ[x.month][0]) : '—'}</td><td>${(ACQ[x.month] || [0, 0])[1] ? deals(ACQ[x.month][1]) : '—'}</td><td>${num(x.headcount)}</td><td>${x.locations_or_accounts}</td><td>${K(x.revenue_usd / x.headcount)}</td></tr>`).join('');
  const zR = r[r.length - 1], org36 = zR.revenue_usd - (ACQ[zR.month] || [0])[0], orgCagr = (Math.pow(org36 / r[0].revenue_usd, 1 / 3) - 1) * 100;
  $('#roadmap-src').innerHTML = `${est} ${esc(String(pb.meta.kpi_roadmap_label || '').replace(/^est\.\s*-\s*/, '').replace(/^./, c => c.toUpperCase()))}. <b>Acquired</b> is cumulative net revenue from tuck-ins closed after Oct 2026, at about $4.5–5M a deal ${est}. The rest of the growth (${M(r[0].revenue_usd)} → ${M(org36)} at month 36) is ~${orgCagr.toFixed(0)}% organic CAGR, plus the 2028 cycle at month 24.<ul class="rm-notes">${r.map(x => `<li><b>M${x.month}</b> ${esc(String(x.note).replace(/\s*est\.$/, '').replace(/^Anchor:\s*/, 'Anchor: '))}</li>`).join('')}</ul>`;
  const el = $('#roadmap-chart'); const compact = narrow(el);
  const W = compact ? 400 : 560, H = 210, L = 40, R = 10, T = 22, B = 30, mx = Math.ceil(Math.max(...r.map(x => x.revenue_usd)) / 2e7) * 2e7;
  const bw = (W - L - R) / r.length; const y = v => H - B - v / mx * (H - T - B);
  let g = '';
  for (let v = 0; v <= mx; v += 4e7) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}"/>${t(L - 6, y(v) + 4, `$${v / 1e6}M`, { a: 'end', fs: 9.5, fill: C.ink3, mono: 1 })}`;
  r.forEach((x, i) => {
    const cx = L + bw * i + bw / 2, w = Math.min(54, bw * .42);
    g += `<rect x="${cx - w - 2}" y="${y(x.revenue_usd)}" width="${w}" height="${H - B - y(x.revenue_usd)}" rx="4" fill="${C.ink}" opacity=".85"/><rect x="${cx + 2}" y="${y(x.ebitda_usd)}" width="${w}" height="${H - B - y(x.ebitda_usd)}" rx="4" fill="${C.accent}"/>`;
    g += t(cx - w / 2 - 2, y(x.revenue_usd) - 5, M(x.revenue_usd), { a: 'middle', fs: 10, fw: 700, fill: C.ink, mono: 1 }) + t(cx + w / 2 + 2, y(x.ebitda_usd) - 5, M(x.ebitda_usd), { a: 'middle', fs: 10, fw: 700, fill: C.accent, mono: 1 });
    g += t(cx, H - B + 16, `M${x.month} · ${x.date.slice(0, 4)}`, { a: 'middle', fs: 10, fill: C.ink3, mono: 1 });
  });
  g += `<rect x="${L}" y="4" width="10" height="10" rx="2" fill="${C.ink}"/>${t(L + 15, 13, 'Net revenue', { fs: 10.5 })}<rect x="${L + 100}" y="4" width="10" height="10" rx="2" fill="${C.accent}"/>${t(L + 115, 13, 'Adj. EBITDA (est.)', { fs: 10.5 })}`;
  el.innerHTML = svg(W, H, g, 'Bar chart of net revenue and adjusted EBITDA at months 0, 12, 24 and 36 (estimates)');

  const ra = (ev?.items || []).find(i => i.id === 'ra-bpi') || { multiple_expansion_turns: [0.5, 2], investment_usd: [1e6, 2e6] };
  const S = { e: $('#s-ebitda'), m: $('#s-mult'), p: $('#s-prem') };
  S.p.max = ra.multiple_expansion_turns[1];
  const tg = $('#exit-toggle');
  const BC = { today: C.ink3, org: C.ink, buy: C.gold, arb: C.violet, sig: C.accent };
  const sgn = v => v < 0 ? `−${M(-v)}` : `+${M(v)}`;
  const mon = d => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const calc = () => {
    const E = +S.e.value * 1e6, m = +S.m.value, p = +S.p.value;
    const month = +(tg?.querySelector('[aria-pressed="true"]')?.dataset.x || 36), other = month === 36 ? 24 : 36;
    const R = returnsCase(pb, { E36: E, m, p, month }), alt = returnsCase(pb, { E36: E, m, p, month: other });
    const x = EXITS[month], xa = EXITS[other];
    $('#o-ebitda').textContent = M(E); $('#o-mult').textContent = `${m.toFixed(1)}x`; $('#o-prem').textContent = `${p.toFixed(1)}x`;
    $('#o-ev').textContent = M(R.EV); $('#o-eq').textContent = M(R.equity); $('#o-moic').textContent = `${R.moic.toFixed(1)}x`; $('#o-irr').textContent = pct(R.irr);
    $('#o-irr-l').textContent = `IRR · ${R.yrs.toFixed(1)}-yr hold`;
    $('#equity').innerHTML = `<div><dt>Exit EV, ${esc(x.label)} (EBITDA ${M(R.Ex)})</dt><dd>${M(R.EV)}</dd></div>
      <div><dt>− Net debt at exit ${est}<small>~${M(R.debt0)} senior debt today + ${M(R.spend)} drawn for ${deals(ACQ[month][1])} add-ons</small></dt><dd>−${M(R.netDebt)}</dd></div>
      <div class="tot"><dt>= Equity value</dt><dd>${M(R.equity)}</dd></div>
      <div><dt>MOIC on the ${M(R.eq0)} Form D equity</dt><dd>${R.moic.toFixed(1)}x</dd></div>
      <div><dt>IRR, ${esc(mon(ENTRY_DATE))} → ${esc(x.label)} (${R.yrs.toFixed(1)} yrs)</dt><dd>${pct(R.irr)}</dd></div>`;
    $('#exit-cmp').innerHTML = `<b>${esc(x.label)}:</b> ${R.moic.toFixed(1)}x · ${pct(R.irr)} IRR. <b>${esc(xa.label)}:</b> ${alt.moic.toFixed(1)}x · ${pct(alt.irr)} IRR at the same multiple. ` +
      (month === 36
        ? (alt.irr > R.irr ? `Waiting through the 2028 cycle adds ${M(R.equity - alt.equity)} of equity and costs about ${Math.round((alt.irr - R.irr) * 100)} pt${Math.round((alt.irr - R.irr) * 100) === 1 ? '' : 's'} of IRR; the reward is an off-year track record a buyer can underwrite.` : `Waiting through the 2028 cycle adds ${M(R.equity - alt.equity)} of equity without costing IRR at these inputs.`)
        : `Selling in Oct 2028 means cycle-peak EBITDA and no off-year proof, so a buyer would likely pay a lower multiple. Drag the multiple down to test it.`);
    const bl = $('#bridge'); const cmp = narrow(bl);
    const steps = R.steps; const total = steps.reduce((a2, z2) => a2 + z2[1], 0);
    const BW = cmp ? 360 : 460, BH = 172, bL = 4, bR = 4, top = 24, bot = 36; const n = steps.length + 1, cw = (BW - bL - bR) / n;
    const yy = v => BH - bot - v / Math.max(total, 1) * (BH - top - bot);
    const fs = cmp ? 8.8 : 9.5;
    const LAB = { today: ['Today,', 'same mult.'], org: ['Organic', 'growth'], buy: ['Add-ons', 'at cost'], arb: ['Multiple', 'arbitrage'], sig: ['SignalOS', 'premium'] };
    let acc = 0, gg = `<defs><pattern id="hatch-buy" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f8efdc"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.gold}" stroke-width="2.4"/></pattern></defs>`;
    steps.forEach(([l, v, k], i) => {
      const x0 = bL + cw * i + 4, w = cw - 8, yTop = yy(acc + Math.max(v, 0)), h = Math.max(1, Math.abs(yy(acc) - yy(acc + v)));
      gg += `<rect x="${x0}" y="${yTop}" width="${w}" height="${h}" rx="3" fill="${k === 'buy' ? 'url(#hatch-buy)' : BC[k]}"${k === 'buy' ? ` stroke="${C.gold}"` : ''}><title>${esc(l)}: ${esc(i ? sgn(v) : M(v))}</title></rect>`;
      gg += t(x0 + w / 2, Math.min(yTop, yy(acc)) - 5, i ? sgn(v) : M(v), { a: 'middle', fs: cmp ? 9 : 10, fw: 700, mono: 1, fill: k === 'today' ? C.ink2 : BC[k] });
      gg += t(x0 + w / 2, BH - bot + 14, LAB[k][0], { a: 'middle', fs, fill: C.ink3 }) + t(x0 + w / 2, BH - bot + 26, LAB[k][1], { a: 'middle', fs, fill: C.ink3 });
      acc += v;
    });
    const xT = bL + cw * steps.length + 4, wT = cw - 8;
    gg += `<rect x="${xT}" y="${yy(total)}" width="${wT}" height="${BH - bot - yy(total)}" rx="3" fill="${C.green}"/>${t(xT + wT / 2, yy(total) - 5, M(total), { a: 'middle', fs: cmp ? 9.5 : 10.5, fw: 800, mono: 1, fill: C.green })}${t(xT + wT / 2, BH - bot + 14, 'Exit EV', { a: 'middle', fs, fill: C.ink3 })}`;
    bl.innerHTML = svg(BW, BH, gg, `Value bridge to ${M(total)} exit enterprise value: today's EV at the same multiple, organic EBITDA growth, add-on EBITDA at purchase cost, multiple arbitrage on add-ons, and the SignalOS premium`);
    $('#bridge-note').innerHTML = `Hatched gold is EBITDA bought, not built: ${M(R.Ea)} of acquired EBITDA (${M(ACQ[month][0])} of revenue at ~${ACQ_MARGIN * 100}% margin) at ~${BUY_MULT}x ${est}, funded with debt. Net of that spend, the plan adds <b>${M(R.EV - R.steps[0][1] - R.spend)}</b> of EV over today's ${M(R.steps[0][1])}.`;
  };
  if (!S.e.dataset.bound) {
    Object.values(S).forEach(s2 => s2.addEventListener('input', () => window.__bpiCalc()));
    if (tg) tg.onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('button', tg).forEach(z2 => z2.setAttribute('aria-pressed', String(z2 === b))); window.__bpiCalc(); };
    S.e.dataset.bound = '1';
    $('#calc .note').innerHTML += ` SignalOS costs ${M(ra.investment_usd[0])}–${M(ra.investment_usd[1])} ${est} and is credited with ${ra.multiple_expansion_turns[0]}–${ra.multiple_expansion_turns[1]} turns only if subscription revenue shows in the numbers (serviceos_evidence ra-bpi, ve-22).`;
  }
  window.__bpiCalc = calc; calc();
  const FIN_TEXT = { // filing facts only; fund-share, co-invest and lender-vehicle inferences stay off this page
    'fin-01': 'Form D filed by BSP-BPI Holdings LLC. Implied entry EV $150–220M (est.), depending on how much debt was used at close.',
    'fin-02': 'Credit and Guaranty Agreement dated 7 Dec 2023, amended 29 Oct 2024 (the day the UK add-ons closed). This is the M&A funding line.',
  };
  $('#stack').innerHTML = pb.items.filter(i => i.kind === 'financing').map(f => `<article class="card rv"><h3>${esc(f.source_of_funds)}</h3><div class="amt">${esc(f.amount_or_range)}</div><p>${esc(FIN_TEXT[f.id] || f.evidence)}</p><p class="src" style="margin-top:8px">${esc(f.confidence)} · ${src(f.source_url)}</p></article>`).join('');
}

/* ── Risks & asks ──────────────────────────────────────────────────────── */
function renderRisksAsks(pb) {
  const dp = id => pb.items.find(i => i.id === id);
  const risks = [
    ['h', 'Election-cycle cyclicality', 'Gross federal political billings (FEC; mostly pass-through media, not BPI revenue) went from about $3.1M in 2022 (weaker-sourced) to $115.3M in 2024. At a ~5–15% agency take, that is a fee swing of roughly $6–17M (est.). Stagwell\'s comparable segment fell 16.5% organically in the year after the election.', 'SignalOS retainers plus corporate and international mix: 55% recurring revenue and at least 95% of net revenue kept in the post-election year (lever 3).'],
    ['h', 'Political-client concentration', 'Of the $115.3M of 2024-cycle gross federal political billings, $114.2M (99%) came from one presidential campaign committee (FEC Schedule B). On a ~5–15% take, that one client was roughly $6–17M of 2024 fee revenue (est.). A buyer\'s quality-of-earnings review will test this first.', 'Grow the corporate and international retainer mix (levers 1 and 3), and add top-20 client concentration to the 30-day data request (ask 2) so the exit story is told on actuals.'],
    ['h', 'AI substitutes for agency work', `The Writer-commissioned Forrester TEI reports clients cutting external agency scope by 50%. 79% of PR firms already use AI for writing.`, 'Own the AI layer instead of competing with it: price on outcomes (agent 8), compliance-gated drafting, the AI-fluency academy.'],
    ['h', 'Senior talent and founders leave', 'Revenue follows the senior bench (LaBolt, Gibbs, Alexander, Whiting) and the founders of acquired firms. FGS, Teneo and Brunswick recruit from the same pool.', 'Partner equity pool on the FGS model, founder-to-practice-leader paths, earn-outs that outlast integration.'],
    ['m', 'Integrating six add-ons across six countries', 'Six add-ons in about three years, across six countries, three brands and multiple P&Ls. Germany now holds two acquired teams (BOLDT, Dec 2023, and 365 Sherpas, May 2026).', '100-day integration office, one knowledge base (agent 7), shared delivery and finance systems before the next add-on closes.'],
    ['m', 'Baseline estimates could be wrong', 'Net revenue of $85–125M and EBITDA of $17–28M are low-confidence estimates from headcount, the Form D and FEC filings.', 'First PRG ask: within 30 days, re-anchor the roadmap on actuals (mix by office, retainer share, comp ratio).'],
    ['m', 'Federal eligibility and incumbents', 'Tracked recompetes total about $250M, dominated by the NASA ceiling. Set-aside status is unverified and BPI has no prime past performance.', 'Capture team with teaming agreements (prime-sub) first; buy a contractor with schedule vehicles only if the pipeline justifies it.'],
    ['m', 'Competition for add-ons', '8 sponsors overlap BPI in pe_landscape, MidOcean and CIVC rated high threat. Shamrock now owns Penta.', 'Proprietary sourcing through the Index briefings and Mandala, and pre-agreed DDTL capacity so BPI can close fast.'],
    ['m', 'FX and European exposure', 'International share rises from ~17% to 30% (est.). The UK estimate assumes GBP/USD of 1.27.', 'Local cost base as a natural hedge, and a multi-currency DDTL tranche.'],
  ];
  $('#risk-grid').innerHTML = risks.map(([s, h, p, m]) => `<article class="card risk rv"><div class="sev ${s}" aria-label="${s === 'h' ? 'High' : 'Medium'} severity">${s === 'h' ? 'HIGH' : 'MED'}</div><div><h3>${esc(h)}</h3><p>${esc(p)}</p><div class="mit"><b>Mitigation:</b> ${esc(m)}</div></div></article>`).join('');
  const fin04 = dp('fin-04');
  const asks = [
    ['Approve SignalOS phase 1', 'Fund $1–2M (est.) for the narrative monitor, compliance-gated drafting and synthetic-audience testing, sold first through the Reputation Resilience Index briefings.', 'PRG tech lead + BPI President · gate: $1M+ ARR signed by month 12'],
    ['Re-anchor on actuals in 30 days', 'Data request: net revenue by office and practice, retainer vs project mix, comp-to-revenue ratio, top-20 client concentration, election-cycle share.', 'BPI CFO + PRG finance · replaces every est. on this page'],
    ['Size an M&A delayed-draw term loan', `Use the existing PineBridge facility and UK debenture package to fund 2–3 specialist tuck-ins a year. Comparable pricing: ${fin04 ? 'SOFR+450 (FGS) to SOFR+500 (Precision)' : 'SOFR+450–500'}.`, 'Broad Sky deal team · gate: lender term sheet by Q1 2027'],
    ['Stand up a federal capture team', 'Teaming agreements for the NASA (May 2027) and DOL Job Corps (Aug 2027) recompetes, and a scan of DOE SEOSS orders ending Nov 2026–Sep 2027.', 'BPI President + PRG · gate: 1 prime or sub award by month 24'],
    ['Partner equity / topco pool', 'A co-invest pool for partners and acquired founders, matching FGS\'s retention tool before the next senior hires.', 'Tyler + BPI CEO · gate: regretted partner attrition under 5% a year'],
    ['Integration office and 100-day playbook', 'Finish the 365 Sherpas integration (closed May 2026), then codify it as one standard play for the next close: SignalOS onboarding, knowledge base, brand, finance systems.', 'PRG operating partner · gate: integration done before the next close'],
  ];
  $('#ask-grid').innerHTML = asks.map(([h, p, w]) => `<article class="card ask rv"><h3>${esc(h)}</h3><p>${esc(p)}</p><div class="who">${esc(w)}</div></article>`).join('');
  $('#caveats').innerHTML = (pb.meta.caveats || []).slice(0, 6).map(c => `<li>${esc(c)}</li>`).join('') + `<li>Datasets: data/research/bpi_playbook.json (generated ${esc(pb.meta.generated)}), bpi_filings, bsp_firm, pe_landscape, public_comps, serviceos_evidence. Methodology: ${esc(String(pb.meta.method || '').split('. ')[0])}.</li>`;
  $('#gen').textContent = pb.meta.generated || '2026-10-06';
}

/* ── Chat ──────────────────────────────────────────────────────────────── */
function mountChat(Chat, pb) {
  const r = pb?.meta?.kpi_roadmap || []; const a = r[0] || {}, z = r[r.length - 1] || {};
  let ret = '<p>See the returns case on this page. All figures are analyst estimates.</p>';
  try { const R1 = returnsCase(pb, { E36: z.ebitda_usd, m: MULT0, p: 1 }), R0 = returnsCase(pb, { E36: z.ebitda_usd, m: MULT0, p: 0 });
    ret = `<p>At month 36 (Oct 2029), est. EBITDA of ${M(z.ebitda_usd)} at ${MULT0}x plus a 1.0x SignalOS premium is about <b>${M(R1.EV)}</b> of EV. Less est. net debt of ~${M(R1.netDebt)} (today's ~${M(R1.debt0)} plus DDTL-funded add-ons) leaves ~${M(R1.equity)} of equity: about <b>${R1.moic.toFixed(1)}x</b> the $90M Form D check and <b>~${pct(R1.irr)} IRR</b> over a ${R1.yrs.toFixed(1)}-year hold. Without the SignalOS premium: ${M(R0.EV)} EV, ${R0.moic.toFixed(1)}x, ~${pct(R0.irr)}. These are analyst scenarios, not forecasts.</p>`; } catch { /* keep fallback */ }
  const faq = [
    { q: 'What is the BPI value-creation plan?', a: `<p><b>Thesis:</b> turn BPI from a campaign-heavy agency into a productized, transatlantic communications platform.</p><ol><li><b>P1 (0–12 mo):</b> SignalOS retainers to take the business out of the election cycle.</li><li><b>P2 (6–24):</b> regulated-sector practices (AI, energy, health) and a federal capture team.</li><li><b>P3 (12–30):</b> Europe density (London, Berlin, Brussels, Paris) and 2–3 specialist tuck-ins a year.</li><li><b>P4 (24–36):</b> exit-ready: 55% recurring, through the 2028 off-year test.</li></ol><p>Revenue ${M(a.revenue_usd)} → ${M(z.revenue_usd)}, EBITDA ${M(a.ebitda_usd)} → ${M(z.ebitda_usd)} <i>(est.)</i>.</p>`, href: '#map-sec' },
    { q: 'How does BPI compare with Smith + Howard?', a: '<p>Smith + Howard went from ~100 to ~800 people, made 9 add-ons in ~3.7 years (~2.4 a year), grew revenue ~4x and sold to <b>TPG Growth</b> in Aug 2026. BPI has made <b>6 add-ons</b> since Apr 2023 (~2.0 a year) and is making the same regional-to-national move across the Atlantic: London is its #2 hub and Germany its #3 market. The plan targets 2.5 a year of specialist shops.</p>', href: '#template' },
    { q: 'What returns could BPI generate at exit?', a: ret, href: '#returns' },
    { q: 'Which AI agents should BPI deploy first?', a: '<p>Three form the SignalOS core: <b>narrative early-warning monitor</b> (6–10 wks), <b>compliance-gated drafting agent</b> (Writer TEI: 85% faster review cycles) and <b>synthetic-audience message tester</b> (Aaru for EY: 0.90 correlation in one day). Then come the policy radar, journalist matching, insights synthesis, the meeting copilot, outcome dashboards and a scope guard. Vendor figures are upper bounds.</p>', href: '#agents' },
  ];
  try { Chat.mount(null, { persona: 'bpi', mode: 'floating', theme: 'light', faq, suggestions: faq.map(f => f.q) }); } catch (e) { console.warn('chat mount failed', e); }
}

/* ── Bars animate in when visible (content itself is never hidden) ────── */
function reveal() {
  const fill = f => { if (!f.classList.contains('unk')) f.style.width = f.dataset.w + '%'; };
  const all = () => $$('.fill[data-w]').forEach(fill);
  if (!('IntersectionObserver' in window)) return all();
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { $$('.fill[data-w]', e.target).forEach(fill); io.unobserve(e.target); } }));
  $$('.lever').forEach(e => io.observe(e));
  setTimeout(all, 1500);
}

export async function init({ Data, Chat }) {
  const x = $('#concept-x'); if (x) x.onclick = () => { $('#concept').remove(); try { sessionStorage.setItem('bpi-pb-banner', '0'); } catch {} };
  try { if (sessionStorage.getItem('bpi-pb-banner') === '0') $('#concept')?.remove(); } catch {}
  const [pb, firm, filings, pe, ev] = await Promise.all(['bpi_playbook', 'bsp_firm', 'bpi_filings', 'pe_landscape', 'serviceos_evidence'].map(n => Data.research('research/' + n)));
  mountChat(Chat, pb);
  if (!pb) { $('#main').insertAdjacentHTML('afterbegin', '<div class="wrap"><p class="card pad">The playbook dataset (data/research/bpi_playbook.json) could not be loaded. Serve the repo root and reload.</p></div>'); reveal(); return; }
  const run = (name, fn) => { try { fn(); } catch (e) { console.warn(`${name} failed`, e); } };
  run('kpis', () => renderKpis(pb));
  run('template', () => renderTemplate(pb, firm));
  run('map', () => renderMap(pb, firm, filings, pe));
  run('levers', () => renderLevers(pb));
  run('agents', () => renderAgents(pb));
  run('talent', () => renderTalent(pb));
  run('addons', () => renderAddons(pb, firm, pe));
  run('returns', () => renderReturns(pb, ev));
  run('risks', () => renderRisksAsks(pb));
  reveal();
  let w = window.innerWidth, tm;
  window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => { if ((w < 600) !== (window.innerWidth < 600)) { run('template', () => renderTemplate(pb, firm)); run('addons', () => renderAddons(pb, firm, pe)); run('returns', () => renderReturns(pb, ev)); } w = window.innerWidth; }, 200); });
}
