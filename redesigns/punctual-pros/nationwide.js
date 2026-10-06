/* Punctual Pros — "From Lancaster to national" growth-plan page.
   Data: data/research/pp_nationwide.json, ma_targets_pp.json, serviceos_evidence.json, data/pp_zips.json.
   Shared modules (core.js, chat.js) are injected by the page's inline module so their ?v= stamps stay in the HTML. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
let esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── formatting ─────────────────────────────────────────────────────────── */
const comma = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = v => { if (v == null || isNaN(v)) return '—'; const a = Math.abs(v); if (a >= 1e9) return '$' + (v / 1e9).toFixed(a >= 1e10 ? 0 : 2).replace(/\.?0+$/, '') + 'B'; if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'; if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K'; return '$' + Math.round(v); };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const srcLink = (u, label) => u ? `<a class="src" href="${esc(u)}" target="_blank" rel="noopener">${esc(label || host(u))} <span aria-hidden="true">↗</span></a>` : '';
const shortDate = s => { const d = new Date(String(s) + 'T12:00:00'); return isNaN(d) ? esc(s) : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
/** Value with its unit, e.g. 70 + "% booking rate" -> "70%"; 1.2 + "USD M revenue" -> "$1.2M". Returns [value, rest-of-unit]. */
function valUnit(v, unit = '') {
  const u = String(unit || '');
  if (v == null) return ['—', u];
  if (/^%/.test(u)) return [`${comma(v, v % 1 ? 1 : 0)}%`, u.replace(/^%\s*/, '')];
  if (/^x\b/.test(u)) return [`${v}x`, u.replace(/^x\s*/, '')];
  if (/^USD M\b/.test(u)) return [`$${v}M`, u.replace(/^USD M\s*/, '')];
  if (/^USD\b/.test(u)) return [`$${comma(v)}`, u.replace(/^USD\s*/, '')];
  return [comma(v, v % 1 ? 2 : 0), u];
}
const fmtVal = (v, unit) => valUnit(v, unit)[0];

/* ── constants ──────────────────────────────────────────────────────────── */
const HQ = [40.0712, -76.3720];            // 516 Running Pump Rd, East Hempfield (Lancaster) — Punctual Pros HQ
const HORVATH = [39.9390, -74.1935];       // Beachwood, NJ — Horvath Home Services (Dec 2024 add-on)
const STATE_C = { PA: '#0b1f3a', NJ: '#0f9d8a', MD: '#7c4ddb', DE: '#d6407f', NY: '#2f7de1' };
const PHASE_C = { 1: '#f26b1d', 2: '#0f9d8a', 3: '#7c4ddb', 4: '#2f7de1' };
const WHO = {
  customer: { label: 'Customer', c: '#2f7de1', bg: '#e8f1fd', ic: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
  technician: { label: 'Technician', c: '#e0600f', bg: '#fff1e8', ic: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
  office: { label: 'Office', c: '#0f9d8a', bg: '#e4f6f3', ic: '<rect x="4" y="4" width="16" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  owner: { label: 'Owner', c: '#7c4ddb', bg: '#f0eafd', ic: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
};
/* Territory path (franchised outlets, FDD Item 20 basis), capped at what Phases 1-3 can buy or convert:
   25 today (PA 19, NJ 6) + mapped Authority outlets in PA/NJ/MD/DE that Punctual Pros does not own (54) + converted independents.
   Revenue per territory then rises toward the lever-10 top-quartile benchmark instead of staying flat. */
const TERR_PATH = { 0: 25, 12: 32, 24: 44, 36: 58 };
/* Returns-model assumptions (est.): organic growth from the month-12 roadmap note (+10-12%), tuck-ins bought at today's margin, 3% deal fees. */
const ORG_G = 0.12, FEES = 0.03;
/* Levers whose numbers are market benchmarks, not a Punctual Pros baseline and target. */
const BENCH = {
  'pn-lev-05': l => [fmtVal(l.baseline, '%'), 'of US homes have a home standby generator (Generac). That is the attach headroom, not a Punctual Pros baseline.'],
  'pn-lev-06': l => [fmtVal(l.target, '%'), 'higher spend from customers who finance (published benchmark). Punctual Pros\' financing attach rate is not public.'],
  'pn-lev-07': l => [comma(l.baseline), 'home sales in 90 days (Jan to Apr 2026) in core ZIPs, from the Lancaster, Dauphin and York deed records only. A floor: Redfin counts ~26,900 sales a year across all 9 core counties.'],
  'pn-lev-08': l => [`+${fmtVal(l.baseline, '%')} calls · +${fmtVal(l.target, '%')} revenue`, 'during a heat wave (ServiceTitan data). The surge a storm plan captures, not a company baseline.'],
};
const isBench = l => l.value_kind === 'benchmark' || !!BENCH[l.id];
/* What each agent's headline number is, so a problem statistic is never read as a result. Duplicates point at the lever that already counts them. */
const AG_KIND = { 'pn-ai-02': ['Problem it solves', 'warn'], 'pn-ai-08': ['Survey benchmark', 'warn'], 'pn-ai-10': ['Vendor claim', 'warn'] };
const AG_DUP = { 'pn-ai-06': 'pn-lev-09', 'pn-ai-07': 'pn-lev-04' };
/* The measurable KPI each agent and each technician program moves, read monthly from ServiceTitan, payroll and the HR system. */
const AG_KPI = {
  'pn-ai-01': 'Booking rate on inbound calls (booked ÷ answered), including after-hours calls',
  'pn-ai-02': 'Speed to lead (minutes to first reply) and share of missed calls that become bookings',
  'pn-ai-03': 'Close rate on unsold estimates and replacement revenue per estimate',
  'pn-ai-04': 'Average ticket per technician and in-home sales conversion rate',
  'pn-ai-05': 'First-time fix rate (second truck rolls per 100 jobs)',
  'pn-ai-06': 'Average ticket, jobs per technician-day and drive time per job',
  'pn-ai-07': 'Membership renewal rate and active members (lever 04)',
  'pn-ai-08': 'New Google reviews per month and average star rating (lever 03)',
  'pn-ai-09': 'Cost per invoice and days sales outstanding',
  'pn-ai-10': 'Days from job sold to permit issued, and office hours per permit',
  'pn-ai-11': 'Days to fill a technician opening and applicant-to-hire rate',
};
const PRO_KPI = {
  'pn-pro-01': 'Graduates hired a year and cost per technician hire',
  'pn-pro-02': 'Apprentices enrolled and share who become licensed technicians',
  'pn-pro-07': 'Annual technician turnover (industry 16% in HVAC; goal below 12%)',
  'pn-pro-09': 'Average ticket per technician and time for a new hire to reach it',
  'pn-pro-10': 'Share of storm-week calls served (served ÷ received) and overflow jobs a month',
  'pn-pro-11': 'Veteran hires a year and their 12-month retention',
};
const needsVerify = t => (t.risk_flags || []).some(f => /name collision|already affiliated/i.test(f));
const FIT_KEYS = [['density_adjacency', 'Density', '#f26b1d'], ['trade_mix', 'Trade mix', '#0b1f3a'], ['scale', 'Scale', '#2f7de1'], ['ownership_readiness', 'Ownership', '#0f9d8a'], ['brand_alignment', 'Brand fit', '#f5a524']];

/* ── state ──────────────────────────────────────────────────────────────── */
const S = { nw: null, ma: null, ev: null, items: [], K: () => [], road: [], ra: null, top: [], verify: [], screen: [], phase: 'all' };

export async function boot(mods) {
  const { Data, Chat } = mods; if (mods.esc) esc = mods.esc;
  const [nw, ma, ev] = await Promise.all([Data.research('research/pp_nationwide'), Data.research('research/ma_targets_pp'), Data.research('research/serviceos_evidence')]);
  const clean = j => j && JSON.parse(JSON.stringify(j).replace(/\s*\((null|undefined|NaN)\)/g, '').replace(/\s*\(see [a-z0-9]+_[a-z0-9_]+\)/g, '').replace(/ tracked in [a-z0-9]+_[a-z0-9_]+/g, ''));   // dataset notes like "(null)" or internal file names never reach the page
  S.nw = clean(nw); S.ma = ma; S.ev = ev; S.items = S.nw?.items || [];
  S.K = k => S.items.filter(i => i.kind === k);
  S.road = (nw?.meta?.kpi_roadmap || []).map(r => ({ ...r, territories: TERR_PATH[r.month] ?? r.territories }));
  S.ra = (ev?.items || []).find(i => i.kind === 'roadmap_assumption' && i.company === 'pp') || null;
  const byId = Object.fromEntries((ma?.items || []).map(t => [t.id, t]));
  // A target that may already be part of Punctual Pros (same trade name) is held out of the ranking until ownership is confirmed.
  S.verify = (ma?.items || []).filter(needsVerify);
  S.screen = (ma?.items || []).filter(t => !needsVerify(t));
  const firstSentence = x => String(x || '').split(/(?<=\.)\s/)[0];
  let top = (ma?.meta?.ranked_top_10 || []).map(r => ({ ...(byId[r.id] || {}), ...r, why: prose(r.why) })).filter(t => !needsVerify(t));
  const have = new Set(top.map(t => t.id));
  const fill = S.screen.filter(t => !have.has(t.id)).sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
  while (top.length < 10 && fill.length) { const t = fill.shift(); top.push({ ...t, why: prose(firstSentence(t.strategic_rationale)) }); }
  S.top = top.map((t, i) => ({ ...t, rank: i + 1 }));

  const parts = [hero, template, levers, agents, pros, tuckins, financing, risks, sources];
  for (const fn of parts) { try { fn(); } catch (e) { console.warn('section failed', fn.name, e); } }
  try { const floating = mountChat(Chat); if (floating) mods.onChat?.(floating); } catch (e) { console.warn('chat failed', e); }
  try { await buildMap(Data); } catch (e) { console.warn('map failed', e); const el = $('#leaf'); if (el) el.innerHTML = '<p style="padding:24px;color:#6b7a90">The map could not load (Leaflet or data unavailable).</p>'; }
  window.addEventListener('hashchange', onHash); onHash();
}

/* Dataset prose can carry file paths, internal ids and analyst shorthand; readers get plain names. */
const dsName = id => (window.BSPFrame?.label?.(id)) || String(id).replace(/_/g, ' ');
const prose = v => String(v ?? '')
  .replace(/(?:data\/)?(?:research\/|sales\/)?([a-z][a-z0-9]*(?:_[a-z0-9*]+)+)\.(?:json|csv)/g, (m, id) => dsName(id.replace(/_\*$/, '')))
  .replace(/\s*\((?:see\s+)?(?:ve|kb|ra|ref|pn)-[a-z0-9-]+\)/gi, '').replace(/\b(?:pn-(?:lev|ai|ph|fin|pro|tpl)-\d+)\b/g, '')
  .replace(/(?<![\w/.-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?![\w/-])/g, (m, id) => dsName(id))
  .replace(/\bplatform-scale\b/g, 'anchor-scale').replace(/\bplaybooks\b/g, 'franchise systems').replace(/\b([Pp])laybook\b/g, (m, p) => p === 'P' ? 'Plan' : 'plan')
  .replace(/The repo's deed pull shows ~?([\d,]+) meaningful sales per quarter in PP's core zips\./, 'County deed records show ~$1 sales in one quarter (Jan to Apr 2026) in the core ZIPs of Lancaster, Dauphin and York counties, a floor for the full core.')
  .replace(/\bBSP\b/g, 'Broad Sky').replace(/\bPP's\b/g, "Punctual Pros'").replace(/\bPP\b/g, 'Punctual Pros').replace(/\s{2,}/g, ' ').trim();

/* ── 1 · hero ───────────────────────────────────────────────────────────── */
function spark(vals, color = 'var(--co)') {
  const w = 120, h = 28, max = Math.max(...vals), min = Math.min(...vals);
  const pts = vals.map((v, i) => [i * (w / (vals.length - 1)), h - 3 - ((v - min) / ((max - min) || 1)) * (h - 6)]);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.map(p => p.join(',')).join(' L')} L${w},${h} L0,${h}Z" style="fill:${color}" fill-opacity=".14"/><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" style="stroke:${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.2" style="fill:${color}"/>`).join('')}</svg>`;
}
function hero() {
  const r = S.road; if (r.length < 2) return;
  const a = r[0], z = r[r.length - 1];
  const K = [['Revenue', 'revenue_usd', usd], ['Adj. EBITDA', 'ebitda_usd', usd], ['Technicians', 'technicians', comma], ['Territories', 'territories', comma]];
  $('#kpis').innerHTML = K.map(([l, k, f]) => `<div class="sys-kpi"><span class="sys-kpi-label">${l} · month ${z.month}</span><span class="sys-kpi-value">${f(z[k])}<span class="sys-est">est.</span></span>${spark(r.map(x => x[k]))}<span class="sys-kpi-sub">${f(a[k])} today · <b>${(z[k] / a[k]).toFixed(1)}x</b> in ${z.month} months</span></div>`).join('');
  const p1 = S.K('expansion_phase')[0]?.data_points || {}, p4 = S.K('expansion_phase')[3]?.data_points || {};
  const p2 = S.K('expansion_phase')[1]?.data_points || {};
  const strip = [
    [comma(p1.core_zips), 'Core ZIP codes', `${comma((p1.core_housing_units || 0) / 1e6, 1)}M homes today`],
    [comma(p1.adjacent_tier1_zips_total), 'Tier-1 ZIPs next door', 'Opportunity-score Tier 1 in the Phase 1 ring'],
    [comma((S.ma?.items || []).length), 'Add-on targets screened', 'PA, NJ, MD, DE and NY'],
    [comma(p4.fdd_system_outlets_end_2025?.total), 'Tri-brand outlets', 'One Hour, Ben Franklin, Mister Sparky nationally'],
    [comma(p2.pe_sponsors_overlapping_punctual_pros), 'PE sponsors', 'Chasing the same founders'],
  ];
  $('#hero-strip').innerHTML = strip.map(([b, l, s]) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${l}</span><span class="sys-kpi-value">${b}</span><span class="sys-kpi-sub">${s}</span></div>`).join('');
}

/* ── 2 · template ───────────────────────────────────────────────────────── */
function template() {
  const t = S.K('template').slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const isFL = x => /frontline/i.test(x.company || '');
  const draw = mode => {
    const list = mode === 'all' ? t : t.filter(x => !isFL(x));
    $('#timeline').innerHTML = list.map((x, i) => {
      const add = /^Add-on (\d+)/.exec(x.event || ''), ms = /^Milestone/.test(x.event || ''), exit = /completes the sale/i.test(x.event || '');
      const cls = isFL(x) ? 'fl' : exit ? 'exit' : ms ? 'ms' : '';
      const tag = isFL(x) ? '<span class="tl-tag f">Frontline · law-firm analog</span>' : exit ? '<span class="tl-tag x">Exit</span>' : add ? `<span class="tl-tag">Add-on ${add[1]}</span>` : ms ? '<span class="tl-tag m">Milestone</span>' : /TPG/.test(x.event) ? '<span class="tl-tag m">Exit signed</span>' : '<span class="tl-tag m">Anchor acquisition</span>';
      const ev0 = String(x.event || '').replace(/^(Add-on \d+|Milestone|Second analog):\s*/, ''); const ev = ev0.charAt(0).toUpperCase() + ev0.slice(1);
      const minor = !isFL(x) && !exit && !/TPG/.test(x.event) && !(add && ['1', '5', '8', '9'].includes(add[1])) && i > 0;
      return `<li class="tl ${cls} ${minor ? 'minor' : ''}"><div class="tl-top"><span class="tl-date">${shortDate(x.date)}</span>${tag}<span class="tl-date">· ${esc(x.location || '')}</span></div><h4>${esc(x.company)}</h4><p>${esc(prose(ev))}</p>${x.metric ? `<span class="tl-m">${esc(prose(x.metric))}</span>` : ''}${srcLink(x.source_url)}</li>`;
    }).join('');
  };
  draw('sh');
  const more = document.createElement('button'); more.className = 'sys-btn sys-btn--secondary sys-btn--sm tl-more'; more.type = 'button';
  const setMore = () => { const n = $$('#timeline .tl.minor').length; more.hidden = !n; more.textContent = $('#timeline').classList.contains('all') ? 'Show key steps only' : `Show all steps (+${n})`; };
  more.onclick = () => { $('#timeline').classList.toggle('all'); setMore(); };
  $('#timeline').after(more); setMore();
  const _draw = draw;
  $$('#tpl-seg button').forEach(b => b.onclick = () => { $$('#tpl-seg button').forEach(x => { x.setAttribute('aria-pressed', String(x === b)); }); _draw(b.dataset.f); setMore(); });
  $('#tpl-caveat').textContent = 'Smith + Howard is an Atlanta accounting and advisory firm. Frontline, which serves law firms, was already national when Broad Sky invested, so it appears as a secondary analog.';
  const r = S.road, a = r[0] || {}, z = r[r.length - 1] || {}, an = S.nw?.meta?.anchors || {};
  const rows = [
    ['Start', 'One Atlanta office, ~100 professionals (Nov 2022)', `Lancaster HQ + Horvath (NJ), ${esc(an.staff_est || '~130–150')} staff, ${comma(an.territories)} territories`],
    ['Revenue', '<b>$53.2M</b> FY23 → <b>~$175M</b> expected 2026', `<b>${usd(a.revenue_usd)}</b> today (FY25 ~${usd(an.fy2025_revenue_est_usd)}) → <b>${usd(z.revenue_usd)}</b> month ${z.month} <span class="sys-est">est.</span>`],
    ['Add-ons', '<b>9</b> in about 3.7 years', '<b>1</b> so far (Horvath, Dec 2024) → 2 in year 1, then a steady cadence'],
    ['People', '<b>~100 → ~800</b> professionals', `<b>${comma(a.technicians)} → ${comma(z.technicians)}</b> technicians <span class="sys-est">est.</span>`],
    ['Footprint', '1 office → 11 locations, 7 states + India', '9 PA counties + 2 NJ → PA, NJ, MD, DE, southern NY → national'],
    ['Exit', 'TPG Growth, closed Aug 6 2026 (~4x revenue)', `~${(z.revenue_usd / a.revenue_usd).toFixed(1)}x today's revenue, sold into GF Data's 10x EBITDA tier`],
  ];
  const pairs = [
    ['Market Street Partners: first new state (TN)', 'Horvath Home Services: first new state (NJ)'],
    ['Fahrenheit Advisors: first Mid-Atlantic office', 'Phase 3 metro anchor: Baltimore or the Philly suburbs'],
    ['Bauknight Pietras & Stormer: ~90 staff, the biggest local firm', 'Oliver Heating & Cooling: 230+ staff, anchor-size deal'],
    ['Geels Norton: adds a cyber capability buyers pay for', 'ServiceOS + AI agents: the capability buyers pay for'],
  ];
  $('#compare').innerHTML = `<div class="sys-card cmp" data-sys-theme="dark"><span class="sys-card-label">Smith + Howard actuals vs the Punctual Pros plan</span><h3 class="sys-card-title">Same plan, new sector</h3><table><thead><tr><th><span class="sys-sr">Measure</span></th><th>Smith + Howard</th><th>Punctual Pros</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table><div class="pairs">${pairs.map(p => `<div class="pair"><span>${esc(p[0])}</span><i>→</i><span>${esc(p[1])}</span></div>`).join('')}</div><p class="sys-src"><b>Source:</b> Smith + Howard and TPG Growth releases; Punctual Pros nationwide plan.</p></div>`;
}

/* ── 3 · map ────────────────────────────────────────────────────────────── */
const TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16,
};
const M = { map: null, groups: {}, phases: [], timer: null };
const km = (a, b) => { const R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const centroid = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const pctl = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };

async function buildMap(Data) {
  if (!window.L) throw new Error('Leaflet not loaded');
  const phases = S.K('expansion_phase'); M.phases = phases;
  phaseBar(phases);
  const map = L.map('leaf', { center: [40.2, -76.4], zoom: 7, minZoom: 3, maxZoom: 14, zoomControl: true, preferCanvas: true, scrollWheelZoom: false, attributionControl: true });
  M.map = map;
  L.tileLayer(TILES.url, { attribution: TILES.attr, maxZoom: TILES.maxZoom, maxNativeZoom: TILES.maxZoom }).addTo(map);
  L.tileLayer(TILES.ref, { maxZoom: TILES.maxZoom, maxNativeZoom: TILES.maxZoom, pane: 'shadowPane', opacity: .9 }).addTo(map);
  const canvas = L.canvas({ padding: .5 }), svg = L.svg({ padding: .5 });
  map.on('focus', () => map.scrollWheelZoom.enable()); map.on('blur', () => map.scrollWheelZoom.disable());

  const [zips, nc] = await Promise.all([Data.load('pp_zips'), Data.load('./national_counties').catch(() => null)]);
  const ncRows = Array.isArray(nc) ? nc : nc?.items || [];
  M.nc = new Map(ncRows.map(r => [`${r.state}|${r.county_name}`, r]));
  const core = zips.filter(z => z.service_territory_flag === 1 && z.lat != null);
  const adjT1 = zips.filter(z => z.adjacent_to_service_territory === 1 && z.service_territory_flag !== 1 && z.opportunity_tier_v3 === 'Tier 1' && z.lat != null);
  const ncT1 = zips.filter(z => z.service_territory_flag !== 1 && z.adjacent_to_service_territory !== 1 && z.opportunity_tier_v3 === 'Tier 1' && z.lat != null);
  const horv = zips.filter(z => z.state === 'NJ' && /^(Ocean|Monmouth) County$/.test(z.county || '') && z.lat != null);
  const rad = z => 2.6 + Math.min(4.2, Math.sqrt(z.housing_units || 0) / 42);
  const zpop = z => `<div class="pp-pop"><b>${esc(z.zip)} · ${esc(z.city || '')}</b><small>${esc(z.county || '')}, ${esc(z.state)} · ${comma(z.housing_units)} homes · ${esc(z.opportunity_tier_v3 || '—')}${z.practical_priority_label ? ' · ' + esc(z.practical_priority_label) : ''}</small></div>`;
  const dots = (rows, o) => { const g = L.layerGroup(); rows.forEach(z => L.circleMarker([z.lat, z.lon], { renderer: canvas, radius: o.r ? o.r(z) : rad(z), color: o.stroke || '#fff', weight: o.w ?? .8, fillColor: o.fill, fillOpacity: o.op ?? .85 }).bindPopup(zpop(z)).addTo(g)); return g; };
  const G = M.groups;
  G.ncT1 = dots(ncT1, { fill: '#f5a524', op: .35, r: () => 2.4, w: 0 });
  G.adj = dots(adjT1, { fill: '#f5a524', op: .9 });
  G.horv = dots(horv, { fill: '#fff', stroke: '#f26b1d', w: 1.6, op: .9, r: () => 3.2 });
  G.core = dots(core, { fill: '#f26b1d', op: .9 });

  // add-on targets, by state; top-10 get numbered pins
  const topIds = new Set(S.top.map(t => t.id));
  const tPop = t => `<div class="pp-pop"><b>${esc(t.company)}</b><small>${esc(t.hq_city || '')}, ${esc(t.state)} · fit ${t.fit_score ?? '—'}${t.employees ? ' · ~' + t.employees + ' staff' : ''}${t.revenue_est_usd ? ' · ' + usd(t.revenue_est_usd) + ' rev. est.' : ''}</small><p class="pop-p">${esc(prose(t.strategic_rationale).slice(0, 220))}${String(t.strategic_rationale || '').length > 220 ? '…' : ''}</p></div>`;
  G.tState = {};
  for (const t of S.ma?.items || []) {
    if (t.lat == null || topIds.has(t.id) || needsVerify(t)) continue;
    const g = G.tState[t.state] || (G.tState[t.state] = L.layerGroup());
    L.circleMarker([t.lat, t.lon], { renderer: canvas, radius: 4 + Math.max(0, (t.fit_score || 50) - 50) / 8, color: '#fff', weight: 1.6, fillColor: STATE_C[t.state] || '#555', fillOpacity: .95 }).bindPopup(tPop(t)).addTo(g);
  }
  G.verify = L.layerGroup();
  S.verify.forEach(t => { if (t.lat == null) return; L.circleMarker([t.lat, t.lon], { renderer: canvas, radius: 7, color: '#d6453d', weight: 2.4, dashArray: '3 3', fillColor: '#fff', fillOpacity: 1 }).bindPopup(`<div class="pp-pop"><b>${esc(t.company)}</b><small>${esc(t.hq_city || '')}, ${esc(t.state)} · not ranked</small><p class="pop-warn">Verify ownership first: this business trades under the Punctual Pros name and may already be affiliated. Held out of the top 10 until confirmed.</p></div>`).addTo(G.verify); });
  G.top = L.layerGroup();
  S.top.forEach(t => { if (t.lat == null) return; L.marker([t.lat, t.lon], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${STATE_C[t.state] || '#333'}"><b>${t.rank}</b></div>`, iconSize: [24, 24], iconAnchor: [3, 22] }), zIndexOffset: 500 - t.rank, title: t.company, keyboard: true }).bindPopup(tPop(t)).addTo(G.top); });
  G.hq = L.layerGroup();
  L.marker(HQ, { icon: L.divIcon({ className: '', html: '<div class="hq">HQ</div>', iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 1000, title: 'Punctual Pros HQ, East Hempfield (Lancaster), PA' }).bindPopup('<div class="pp-pop"><b>Punctual Pros HQ</b><small>516 Running Pump Rd, East Hempfield (Lancaster), PA · founded 1958 as The Rohrer Company</small></div>').addTo(G.hq);
  L.marker(HORVATH, { icon: L.divIcon({ className: '', html: '<div class="hq" style="width:26px;height:26px;font-size:9.5px">NJ</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 900, title: 'Horvath Home Services, Beachwood NJ' }).bindPopup('<div class="pp-pop"><b>Horvath Home Services</b><small>Beachwood / Toms River, NJ · add-on Dec 2024 · first out-of-state deal</small></div>').addTo(G.hq);

  // phase rings
  const lbl = (ll, text, cls = '') => L.marker(ll, { icon: L.divIcon({ className: '', html: `<span class="mlabel ${cls}">${esc(text)}</span>`, iconSize: [0, 0] }), interactive: false, keyboard: false });
  const ring = (ll, r, ph, dashed = true) => L.circle(ll, { renderer: svg, radius: r, color: PHASE_C[ph], weight: 2.2, fillColor: PHASE_C[ph], fillOpacity: .06, className: dashed ? 'ring' : '', interactive: false });
  const metroGeo = m => { const set = new Set(m.counties || []); const pts = zips.filter(z => z.state === m.state && set.has(z.county) && z.lat != null).map(z => [z.lat, z.lon]); if (!pts.length) return null; const c = centroid(pts); return { c, r: Math.max(18, Math.min(70, pctl(pts.map(p => km(c, p)), .75))) * 1000 }; };
  G.ring = { 1: L.layerGroup(), 2: L.layerGroup(), 3: L.layerGroup(), 4: L.layerGroup() };
  const corePts = core.map(z => [z.lat, z.lon]), cc = centroid(corePts);
  const r1 = (pctl(corePts.map(p => km(cc, p)), .95) + 22) * 1000;
  ring(cc, r1, 1).addTo(G.ring[1]); lbl([cc[0] + r1 / 111000 * .93, cc[1]], 'Phase 1 · densify the core + ring', 'o').addTo(G.ring[1]);
  const ph2 = phases[1]?.data_points?.metros || [];
  ph2.forEach(m => { const g = metroGeo(m); if (!g) return; ring(g.c, g.r, 2).addTo(G.ring[2]); lbl(g.c, m.metro.replace(/\s*\(.*\)/, ''), 'g').addTo(G.ring[2]); });
  const DE = [39.62, -75.64]; ring(DE, 30000, 2).addTo(G.ring[2]); lbl(DE, 'Delaware', 'g').addTo(G.ring[2]);
  const ph3 = phases[2]?.data_points?.metros || [];
  ph3.forEach(m => { const g = metroGeo(m); if (!g) return; ring(g.c, g.r, 3).addTo(G.ring[3]); lbl(g.c, m.metro.replace(/\s*\(.*\)/, ''), 'g').addTo(G.ring[3]); });
  const RIC = [37.54, -77.44]; ring(RIC, 35000, 3).addTo(G.ring[3]); lbl(RIC, 'Richmond, VA (not yet modeled)', 'g').addTo(G.ring[3]);
  // phase 4: illustrative national arcs into the Authority Brands system
  const nat = [['Sun Belt · Atlanta', [33.75, -84.39]], ['Texas · Dallas', [32.78, -96.80]], ['Florida · Orlando', [28.54, -81.38]], ['Midwest · Columbus', [39.96, -83.00]], ['Midwest · Chicago', [41.88, -87.63]], ['Carolinas · Charlotte', [35.23, -80.84]]];
  const arc = (a, b) => { const mid = [(a[0] + b[0]) / 2 + Math.abs(a[1] - b[1]) * .12, (a[1] + b[1]) / 2]; const pts = []; for (let i = 0; i <= 32; i++) { const t = i / 32, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1]]); } return pts; };
  nat.forEach(([n, ll]) => { L.polyline(arc(HQ, ll), { renderer: svg, color: PHASE_C[4], weight: 2.2, opacity: .85, className: 'ring', interactive: false }).addTo(G.ring[4]); L.circleMarker(ll, { renderer: svg, radius: 9, color: PHASE_C[4], weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`${n} (illustrative)`).addTo(G.ring[4]); lbl([ll[0] - .9, ll[1]], n, 'g').addTo(G.ring[4]); });
  M.bounds = {
    all: L.latLngBounds([...corePts, ...(S.ma?.items || []).filter(t => t.lat != null).map(t => [t.lat, t.lon]), RIC]),
    1: L.latLngBounds([...corePts, ...adjT1.map(z => [z.lat, z.lon])]),
    2: L.latLngBounds([...corePts, ...(S.ma?.items || []).filter(t => t.lat != null).map(t => [t.lat, t.lon]), [42.3, -75.9], [41.3, -74.0]]),
    3: L.latLngBounds([...corePts, [40.44, -79.99], RIC, [39.95, -75.16], [38.98, -77.1]]),
    4: L.latLngBounds([[27.5, -98], [44.5, -73]]),
  };
  M.legend = {
    core: '<span><i style="background:#f26b1d"></i>Core zips (' + core.length + ')</span>',
    horv: '<span><i style="background:#fff;box-shadow:0 0 0 1.6px #f26b1d"></i>Horvath NJ (Ocean, Monmouth)</span>',
    adj: '<span><i style="background:#f5a524"></i>Tier-1 adjacent zips (' + adjT1.length + ')</span>',
    nc: '<span><i style="background:#f5a524;opacity:.4"></i>Other Tier-1 zips (' + ncT1.length + ')</span>',
    tg: Object.keys(STATE_C).filter(s => G.tState[s] || S.top.some(t => t.state === s)).map(s => `<span><i style="background:${STATE_C[s]}"></i>${s} targets</span>`).join(''),
    top: '<span><i style="background:#0b1f3a;border-radius:50% 50% 50% 0"></i>Top-10 ranked</span>',
    verify: S.verify.length ? '<span><i style="background:#fff;border:2px dashed #d6453d;box-shadow:none"></i>Verify ownership first</span>' : '',
  };
  let ph0 = 'all'; try { const q = new URLSearchParams(location.search).get('phase'); if (/^[1-4]$/.test(q || '')) ph0 = q; } catch { /* ignore */ }
  setPhase(ph0, false);
}

function phaseBar(phases) {
  const short = ['Densify the core', 'Tuck-ins PA·NJ·MD·DE·NY', 'Mid-Atlantic metros', 'National consolidator'];
  $('#phase-bar').innerHTML = `<button class="sys-chip" type="button" aria-pressed="true" data-p="all"><b>All phases</b><small>0–60 mo</small></button>${phases.map((p, i) => `<button class="sys-chip" type="button" aria-pressed="false" data-p="${i + 1}"><span class="sw" style="background:${PHASE_C[i + 1]}"></span><b>${i + 1} · ${esc(short[i] || p.phase)}</b><small>${esc(p.months)} mo</small></button>`).join('')}<button class="sys-btn sys-btn--secondary sys-btn--sm ph-play" type="button" id="ph-play" aria-label="Play through the phases"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>Play</button>`;
  $$('#phase-bar .sys-chip').forEach(b => b.onclick = () => { stopPlay(); setPhase(b.dataset.p); });
  $('#ph-play').onclick = () => { if (M.timer) { stopPlay(); return; } const seq = ['1', '2', '3', '4', 'all']; let i = 0; const step = () => { setPhase(seq[i]); i++; if (i >= seq.length) { stopPlay(); return; } M.timer = setTimeout(step, 4200); }; $('#ph-play').lastChild.textContent = 'Stop'; step(); };
}
function stopPlay() { clearTimeout(M.timer); M.timer = null; const b = $('#ph-play'); if (b) b.lastChild.textContent = 'Play'; }

function setPhase(p, fly = true) {
  S.phase = p; const G = M.groups, map = M.map; if (!map) return;
  $$('#phase-bar .sys-chip').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.p === p)); });
  const want = new Set(['hq']);
  const st = [];
  if (p === 'all') { want.add('core').add('horv').add('adj').add('top'); st.push('PA', 'NJ', 'MD', 'DE'); [1, 2, 3].forEach(n => want.add('ring' + n)); }
  if (p === '1') { want.add('core').add('horv').add('adj').add('top').add('ring1'); st.push('PA'); }
  if (p === '2') { want.add('core').add('horv').add('adj').add('nc').add('top').add('ring2'); st.push('PA', 'NJ', 'MD', 'DE'); }
  if (p === '3') { want.add('core').add('adj').add('nc').add('ring3').add('top'); st.push('MD', 'DE', 'PA'); }
  if (p === '4') { want.add('core').add('horv').add('ring4'); }
  const toggle = (layer, on) => { if (!layer) return; if (on && !map.hasLayer(layer)) layer.addTo(map); if (!on && map.hasLayer(layer)) map.removeLayer(layer); };
  toggle(G.core, want.has('core')); toggle(G.horv, want.has('horv')); toggle(G.adj, want.has('adj')); toggle(G.ncT1, want.has('nc'));
  for (const s of Object.keys(G.tState)) toggle(G.tState[s], st.includes(s));
  toggle(G.top, want.has('top')); toggle(G.verify, st.includes('NJ')); toggle(G.hq, true);
  [1, 2, 3, 4].forEach(n => { if (map.hasLayer(G.ring[n])) map.removeLayer(G.ring[n]); });   // re-add so the ring animation replays
  [1, 2, 3, 4].forEach(n => { if (want.has('ring' + n)) G.ring[n].addTo(map); });
  $('#leaf').classList.toggle('all-view', p === 'all');
  const b = M.bounds[p] || M.bounds.all; const pad = window.innerWidth < 720 ? [16, 16] : [36, 36];
  if (fly) map.flyToBounds(b, { padding: pad, duration: 1.1 }); else map.fitBounds(b, { padding: pad });
  const L1 = M.legend; const leg = [L1.core, want.has('horv') ? L1.horv : '', want.has('adj') ? L1.adj : '', want.has('nc') ? L1.nc : '', st.length ? L1.tg : '', want.has('top') ? L1.top : '', st.includes('NJ') ? L1.verify : '', '<span><i class="ring"></i>Phase ring</span>'];
  $('#map-legend').innerHTML = leg.join('');
  phasePanel(p);
}

function phasePanel(p) {
  const el = $('#phase-panel'); const ph = M.phases;
  const stat = (b, s) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`;
  const list = (h, rows) => rows.length ? `<div><div class="plist-h">${h}</div><ul class="plist">${rows.map(([a, b]) => `<li><span>${esc(a)}</span><b>${b}</b></li>`).join('')}</ul></div>` : '';
  if (p === 'all') {
    el.innerHTML = `<span class="sys-card-label">The route</span><h3 class="sys-card-title">Densify, tuck in, anchor metros, then go national.</h3><p class="thesis">${esc(prose(String(S.nw?.meta?.narrative || '').split('. ').slice(2, 4).join('. ')))}.</p>${ph.map((x, i) => `<button class="sys-chip nw-go" type="button" data-go="${i + 1}"><span class="sw" style="background:${PHASE_C[i + 1]}"></span><span><b>Phase ${i + 1} · ${esc(x.phase.replace(/^Phase \d+\s*-\s*/, ''))}</b><small>Months ${esc(x.months)}</small></span></button>`).join('')}`;
    $$('[data-go]', el).forEach(b => b.onclick = () => { stopPlay(); setPhase(b.dataset.go); });
    countyTable(p);
    return;
  }
  const x = ph[+p - 1]; if (!x) return; const d = x.data_points || {};
  let body = '';
  const hasCt = M.nc?.size > 0;   // the county table below repeats the county and metro lists, so the panel keeps only the headline stats
  if (p === '1') {
    body = `<div class="stats">${stat(comma(d.core_zips), 'core zips (9 PA counties)')}${stat(comma((d.core_housing_units || 0) / 1e6, 2) + 'M', 'housing units in the core')}${stat(comma(d.adjacent_tier1_zips_total), `Tier-1 adjacent zips (${Object.entries(d.adjacent_tier1_zips_by_state || {}).map(([s, n]) => `${s} ${n}`).join(' · ')})`)}${stat(comma(d.pa_addon_targets), `PA add-on targets, ${comma(d.pa_addon_targets_fit70plus)} with fit 70+`)}</div>${hasCt ? '' : list('Core zips by county', Object.entries(d.core_zips_by_county || {}).slice(0, 5).map(([c, n]) => [c.replace(' County', ''), n]))}${hasCt ? '' : list('Next ring: Tier-1 zips by county', (d.adjacent_tier1_top_counties || []).slice(0, 5).map(s => { const m = /^(.*) \((\d+)\)$/.exec(s); return m ? [m[1].replace(' County', ''), m[2]] : [s, '']; }))}`;
  } else if (p === '2') {
    const notPP = Object.values(d.authority_territories_not_pp_by_state || {}).reduce((a, b) => a + b, 0);
    body = `<div class="stats">${stat(comma(d.authority_territories_mapped), 'Authority territories mapped (PA/NJ/MD/DE)')}${stat(comma(notPP), 'of them not owned by Punctual Pros')}${stat(comma(Object.entries(d.addon_targets_by_state || {}).filter(([s]) => s !== 'PA').reduce((a, [, n]) => a + n, 0)), 'NJ, MD and DE add-on targets')}${stat(comma(d.pe_sponsors_overlapping_punctual_pros), `PE sponsors in the same market (${comma(d.pe_sponsor_threat_mix?.high)} high threat)`)}</div>${hasCt ? '' : list('Metros in this phase · housing units', (d.metros || []).map(m => [m.metro.replace(/\s*\(.*\)/, ''), usd(m.housing_units).replace('$', '')]))}`;
  } else if (p === '3') {
    const hu = (d.metros || []).reduce((a, m) => a + (m.housing_units || 0), 0);
    body = `<div class="stats">${stat(comma((d.metros || []).length + 1), 'metro anchors (incl. Richmond)')}${stat(comma(hu / 1e6, 1) + 'M', 'housing units in the 4 modeled metros')}${stat(comma(d.md_tier1_zips_noncore), 'Tier-1 zips in Maryland')}${stat(comma(d.authority_territories_md_not_pp), 'MD Authority territories, none owned by PP')}</div>${hasCt ? '' : list('Metro · Tier-1 zips · homes', (d.metros || []).map(m => [`${m.metro.replace(/\s*\(.*\)/, '')} (${m.tier1_zips})`, usd(m.housing_units).replace('$', '')]))}<p class="sys-src">Pittsburgh: ${esc(prose(d.fdd_other_pa_one_hour_franchisees) || '—')}. Richmond needs a separate ZIP pull (VA is not in the model).</p>`;
  } else if (p === '4') {
    const o = d.fdd_system_outlets_end_2025 || {}, lg = d.largest_franchisee_revenue_usd || {};
    body = `<div class="stats">${stat(comma(o.total), 'One Hour + Ben Franklin + Mister Sparky outlets')}${stat(comma(d.fdd_franchisees_end_2025), 'franchisees in the tri-brand system')}${stat(usd(d.fdd_reported_gross_revenue_fy2025_usd), 'reported system revenue FY2025')}${stat(comma(d.pp_share_of_tri_brand_outlets_pct, 2) + '%', 'Punctual Pros share of outlets today')}</div>${list('Largest single franchisee (FDD Item 19)', [['Mister Sparky', usd(lg.mister_sparky)], ['One Hour', usd(lg.one_hour)], ['Ben Franklin', usd(lg.ben_franklin)]])}<p class="sys-src">Arcs show the priority regions named in the thesis (Sun Belt, Midwest). They are illustrative, not specific targets.<span class="sys-est sys-est--illus">illustrative</span></p>`;
  }
  const ct = countyTable(p);
  if (ct) body = `<div class="stats">${stat(comma(ct.n), `counties${ct.dup ? ` (+${ct.dup} shared with Phase 1)` : ''}`)}${stat(comma(ct.hu / 1e6, 2) + 'M<span class="sys-est">est.</span>', 'housing units in those counties (ACS)')}${stat(comma(ct.sales), 'home sales in the last 12 months (Redfin)')}${stat(comma(ct.ab), 'of them with an Authority Brands outlet')}</div>` + body;
  el.innerHTML = `<span class="sys-card-label"><span class="sw" style="background:${PHASE_C[p]}"></span>Phase ${p} · months ${esc(x.months)}</span><h3 class="sys-card-title">${esc(x.phase.replace(/^Phase \d+\s*-\s*/, ''))}</h3><p class="thesis">${esc(prose(String(x.thesis || '').split('. ').slice(0, 2).join('. ')))}.</p>${body}`;
}

/* Every phase names its counties, with ACS housing units and Redfin home sales from the national county base table.
   County lists come from the plan's phase geography; Delaware, Richmond and the Phase 4 regions are named on the map but not in the phase metros. */
const DE_COUNTIES = ['New Castle County', 'Kent County', 'Sussex County'];
const RIC_COUNTIES = ['Richmond city', 'Henrico County', 'Chesterfield County', 'Hanover County'];
const P4_REGIONS = [['Sun Belt · Atlanta', 'GA', 'Fulton County'], ['Texas · Dallas', 'TX', 'Dallas County'], ['Florida · Orlando', 'FL', 'Orange County'], ['Midwest · Columbus', 'OH', 'Franklin County'], ['Midwest · Chicago', 'IL', 'Cook County'], ['Carolinas · Charlotte', 'NC', 'Mecklenburg County']];
function phaseGroups(p) {
  const ph = M.phases, d = n => ph[n - 1]?.data_points || {};
  if (p === '1') {
    const core = Object.keys(d(1).core_zips_by_county || {}).map(c => ['PA', c]);
    const ringTxt = String((ph[0]?.geography || []).find(g => /adjacent ring/i.test(g)) || '').replace(/^adjacent ring:\s*/i, '');
    const ring = ringTxt.split(';').flatMap(part => { const m = /^(.*)\s(PA|MD|NJ|DE|NY)$/.exec(part.trim()); if (!m) return []; return m[1].split(',').map(n => [m[2], n.trim().replace(/\s*Co\.$/, '').replace(/\s*County$/, '') + ' County']); });
    return [['Core: the 9 counties served today', core], ['Adjacent ring: Tier-1 ZIPs next door', ring]];
  }
  if (p === '2') return [...(d(2).metros || []).map(m => [m.metro, (m.counties || []).map(c => [m.state, c])]), ['Delaware', DE_COUNTIES.map(c => ['DE', c])]];
  if (p === '3') return [...(d(3).metros || []).map(m => [m.metro, (m.counties || []).map(c => [m.state, c])]), ['Richmond, VA (not yet in the ZIP model)', RIC_COUNTIES.map(c => ['VA', c])]];
  if (p === '4') return [['Priority regions named in the thesis (illustrative anchor counties)', P4_REGIONS.map(([, s, c]) => [s, c])]];
  return [];
}
function countyTable(p) {
  const host = $('#phase-counties'); if (!host) return null;
  if (!M.nc?.size) { host.innerHTML = ''; return null; }
  const ab = r => (r?.ab_onehour ? 1 : 0) + (r?.ab_benfranklin ? 1 : 0) + (r?.ab_mistersparky ? 1 : 0);
  const abTxt = r => { const b = [r?.ab_onehour && 'One Hour', r?.ab_benfranklin && 'Ben Franklin', r?.ab_mistersparky && 'Mister Sparky'].filter(Boolean); return b.length ? b.join(', ') : '—'; };
  const sumOf = rows => rows.reduce((a, [, , r]) => ({ n: a.n + 1, hu: a.hu + (r?.housing_units || 0), sales: a.sales + (r?.home_sales_12m || 0), ab: a.ab + (ab(r) ? 1 : 0) }), { n: 0, hu: 0, sales: 0, ab: 0 });
  const p1Keys = new Set(phaseGroups('1').flatMap(([, l]) => l.map(([s, c]) => `${s}|${c}`)));
  const resolve = (n, list) => list.map(([s, c]) => [s, c, M.nc.get(`${s}|${c}`)]).filter(x => x[2]);
  const est = '<span class="sys-est">est.</span>';
  const caption = `<caption>Housing units: Census ACS 2019–2023 five-year estimates (whole county; the ZIP model counts only served ZIPs). Home sales: Redfin county market tracker, all residential, twelve months ending May 2026. Authority Brands outlets: national county base table.${p === '4' ? ' Phase 4 regions are illustrative, not named targets.' : ''}</caption>`;
  if (p === 'all') {
    const rows = ['1', '2', '3', '4'].map(n => { const seen = new Set(); const all = phaseGroups(n).flatMap(([, l]) => resolve(n, l)).filter(([s, c]) => { const k = `${s}|${c}`; if (seen.has(k) || (n !== '1' && p1Keys.has(k))) return false; seen.add(k); return true; }); return [n, sumOf(all)]; });
    host.innerHTML = `<div class="sys-table-wrap"><table class="sys-table" aria-label="Counties, housing units and home sales by phase"><thead><tr><th>Phase</th><th class="sys-n">Counties</th><th class="sys-n">Housing units${est}</th><th class="sys-n">Home sales, 12 months</th><th class="sys-n">With an Authority Brands outlet</th></tr></thead><tbody>${rows.map(([n, t]) => `<tr><td><span class="sw" style="background:${PHASE_C[n]}"></span><b>Phase ${n}</b> · ${esc(M.phases[n - 1]?.phase.replace(/^Phase \d+\s*-\s*/, '') || '')}${n === '4' ? '<span class="sys-est sys-est--illus">illustrative</span>' : ''}</td><td class="sys-n">${comma(t.n)}</td><td class="sys-n">${comma(t.hu)}</td><td class="sys-n">${comma(t.sales)}</td><td class="sys-n">${comma(t.ab)}</td></tr>`).join('')}</tbody>${caption.replace('</caption>', ' Counties already counted in Phase 1 are not counted again in later phases. Pick a phase above to see every county.</caption>')}</table></div>`;
    return null;
  }
  const groups = phaseGroups(p).map(([g, l]) => [g, resolve(p, l)]);
  const flat = groups.flatMap(([, l]) => l);
  const seen = new Set(); const uniq = flat.filter(([s, c]) => { const k = `${s}|${c}`; if (seen.has(k) || (p !== '1' && p1Keys.has(k))) return false; seen.add(k); return true; });
  const t = sumOf(uniq), dup = new Set(flat.filter(([s, c]) => p !== '1' && p1Keys.has(`${s}|${c}`)).map(([s, c]) => `${s}|${c}`)).size;
  const tr = ([s, c, r]) => { const shared = p !== '1' && p1Keys.has(`${s}|${c}`); return `<tr${shared ? ' class="shared"' : ''}><td>${esc(c.replace(/ County$/, ''))}, ${esc(s)}${shared ? '<small>also in the Phase 1 ring</small>' : ''}</td><td class="sys-n">${comma(r.housing_units)}</td><td class="sys-n">${r.home_sales_12m != null ? comma(r.home_sales_12m) : '<span class="sys-muted">not reported</span>'}</td><td>${esc(abTxt(r))}</td></tr>`; };
  host.innerHTML = `<div class="sys-table-wrap"><table class="sys-table" aria-label="Phase ${p} counties"><thead><tr><th>County</th><th class="sys-n">Housing units${est}</th><th class="sys-n">Home sales, 12 months</th><th>Authority Brands outlets</th></tr></thead>${groups.map(([g, l]) => `<tbody><tr class="grp"><th colspan="4" scope="colgroup">${esc(g)}</th></tr>${l.map(tr).join('')}</tbody>`).join('')}<tfoot><tr><td><b>Phase ${p} total</b> · ${comma(t.n)} counties${dup ? `, excluding ${dup} shared with Phase 1` : ''}${p === '4' ? '<span class="sys-est sys-est--illus">illustrative</span>' : ''}</td><td class="sys-n"><b>${comma(t.hu)}</b></td><td class="sys-n"><b>${comma(t.sales)}</b></td><td>${comma(t.ab)} with an outlet</td></tr></tfoot>${caption}</table></div>`;
  return { ...t, dup };
}

function onHash() {
  const m = /^#phase-(all|[1-4])$/.exec(location.hash); if (!m) return;
  $('#map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); stopPlay(); setTimeout(() => setPhase(m[1]), 350);
}

/* ── 4 · levers ─────────────────────────────────────────────────────────── */
function levers() {
  const lv = S.K('growth_lever'); if (!lv.length) return;
  $('#lev-h').textContent = `${lv.length} ways we improve the business. The website is only one of them.`;
  $('#lever-grid').innerHTML = lv.map((l, i) => {
    const bench = isBench(l);
    const b = l.baseline, t = l.target, has = !bench && b != null && t != null;
    const max = Math.max(b || 0, t || 0) || 1;
    const bw = b != null ? (b / max) * 100 : 0, tw = has && t > b ? ((t - b) / max) * 100 : 0;
    const unitTxt = String(l.unit || '').replace(/^(%|x|USD M)\s*/, '');
    const bt = bench ? (BENCH[l.id] ? BENCH[l.id](l) : [fmtVal(b ?? t, l.unit), unitTxt]) : null;
    const bar = bench
      ? `<div class="bench"><span class="sys-chip sys-chip--soft bench-k">Benchmark</span><b>${esc(bt[0])}</b><span>${esc(bt[1])}</span></div><div class="lv-legend"><span class="lv-flag">Punctual Pros baseline and target set in diligence</span></div>`
      : has
      ? `<div class="bar" data-bw="${bw.toFixed(1)}" data-tw="${tw.toFixed(1)}"><i class="b-base" style="width:0"></i><i class="b-tgt" style="left:0;width:0"></i><div class="b-lab"><span>${fmtVal(b, l.unit)}</span><span>${fmtVal(t, l.unit)}</span></div></div><div class="lv-legend"><span>Today <b>${fmtVal(b, l.unit)}</b></span><span>Target <b>${fmtVal(t, l.unit)}</b></span><span>${t > b ? `+${comma(((t - b) / b) * 100)}%` : ''}</span></div>`
      : `<div class="bar empty"><div class="b-lab"><span>${b != null ? `Today ${fmtVal(b, l.unit)}` : 'Baseline not public'}</span><span>${t != null ? `Target ${fmtVal(t, l.unit)}` : 'Target set in diligence'}</span></div></div><div class="lv-legend"><span class="lv-flag">${b == null ? 'Needs company data' : 'Target to be set with the company'}</span></div>`;
    const web = /website/i.test(l.lever);
    return `<article class="sys-card lever ${web ? 'web' : ''}" id="lever-${i + 1}"><div class="lv-top"><span class="lv-n">${String(i + 1).padStart(2, '0')}</span><div><h3 class="sys-card-title">${esc(l.lever)}</h3>${bench ? '' : `<div class="lv-unit">${esc(unitTxt)}</div>`}</div></div>${bar}<p class="lv-ev">${esc(prose(l.evidence))}</p><div class="sys-card-foot lv-foot">${web ? '<a href="index.html">See the redesign →</a>' : '<button class="lv-more" type="button">Read more</button>'}${srcLink(l.source_url)}</div></article>`;
  }).join('');
  $$('#lever-grid .lv-more').forEach(b => b.onclick = () => { const c = b.closest('.lever'); c.classList.toggle('open'); b.textContent = c.classList.contains('open') ? 'Show less' : 'Read more'; });
  const animate = el => { const bw = +el.dataset.bw, tw = +el.dataset.tw; el.querySelector('.b-base').style.width = bw + '%'; const tg = el.querySelector('.b-tgt'); tg.style.left = bw + '%'; tg.style.width = tw + '%'; };
  const bars = $$('#lever-grid .bar[data-bw]');
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); } }), { threshold: .3 }); bars.forEach(b => io.observe(b)); setTimeout(() => bars.forEach(animate), 4000); }
  else bars.forEach(animate);
}

/* ── 5 · AI agents ──────────────────────────────────────────────────────── */
const levNo = id => { const i = S.K('growth_lever').findIndex(l => l.id === id); return i < 0 ? '' : String(i + 1).padStart(2, '0'); };
const agSlug = a => 'agent-' + String(a.agent || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function agents() {
  const ag = S.K('ai_agent').slice().sort((a, b) => (a.weeks_to_deploy || 99) - (b.weeks_to_deploy || 99)); if (!ag.length) return;
  const counts = {}; ag.forEach(a => counts[a.who_it_helps] = (counts[a.who_it_helps] || 0) + 1);
  const keys = ['all', ...Object.keys(WHO).filter(k => counts[k])];
  $('#ag-seg').innerHTML = keys.map(k => `<button class="sys-chip" type="button" aria-pressed="${k === 'all'}" data-w="${k}">${k === 'all' ? 'All agents' : 'Helps the ' + WHO[k].label.toLowerCase()}<span class="c">${k === 'all' ? ag.length : counts[k]}</span></button>`).join('');
  const maxW = Math.max(...ag.map(a => a.weeks_to_deploy || 0), 10);
  const draw = w => {
    const list = w === 'all' ? ag : ag.filter(a => a.who_it_helps === w);
    $('#runway').innerHTML = `<h3 class="sys-card-title">Deployment runway</h3><p class="rw-sub">Weeks from kickoff to live, fastest first. Click an agent to jump to it.</p><div class="rw">${list.map(a => `<div class="rw-row" data-id="${esc(agSlug(a))}" tabindex="0" role="button"><div class="rw-name"><span>${esc(a.agent.replace(/\s*\(.*\)/, ''))}</span><b>${a.weeks_to_deploy ?? '—'} wk</b></div><div class="rw-track"><i style="width:0;background:${WHO[a.who_it_helps]?.c || '#f26b1d'}" data-w="${((a.weeks_to_deploy || 0) / maxW) * 100}"></i></div></div>`).join('')}</div><div class="rw-axis"><span>0</span><span>${Math.round(maxW / 2)} wks</span><span>${maxW} wks</span></div>`;
    requestAnimationFrame(() => setTimeout(() => $$('#runway .rw-track i').forEach(i => i.style.width = i.dataset.w + '%'), 60));
    $('#agent-grid').innerHTML = list.map((a, i) => {
      const w = WHO[a.who_it_helps] || WHO.office; const [v, u] = valUnit(a.metric_value, a.metric_unit);
      const dup = AG_DUP[a.id] && levNo(AG_DUP[a.id]); const kind = dup ? [`Same evidence as lever ${dup}, counted once`, 'dup'] : AG_KIND[a.id] || ['Published result', ''];
      return `<article class="sys-card agent" id="${esc(agSlug(a))}"><div class="ag-top"><span class="ag-ic" style="--w:${w.c}"><svg viewBox="0 0 24 24" aria-hidden="true">${w.ic}</svg></span><div><span class="sys-card-label">Helps the ${w.label.toLowerCase()}</span><h3 class="sys-card-title">${esc(a.agent)}</h3></div></div><p class="job">${esc(prose(a.job_to_be_done))}</p><div class="ag-metric" title="${esc(prose(a.metric_claim))}"><span class="ag-kind ${kind[1]}">${esc(kind[0])}</span><b>${v}</b><span>${esc(u)}</span></div><p class="claim">${esc(prose(a.metric_claim))}</p>${AG_KPI[a.id] ? `<p class="ag-kpi"><b>KPI it moves:</b> ${esc(AG_KPI[a.id])}</p>` : ''}<div class="vend">${(a.vendor_examples || []).map(x => `<span class="sys-chip">${esc(x)}</span>`).join('')}</div><div class="sys-card-foot ag-foot"><span>Live in <span class="wk">${a.weeks_to_deploy ?? '—'} weeks</span> · ${esc(String(a.cost_model || '').split(/[;,(]/)[0])}</span>${srcLink(a.source_url)}</div></article>`;
    }).join('');
    $$('#runway .rw-row').forEach(r => { const go = () => { const c = $(`#${CSS.escape(r.dataset.id)}`); if (!c) return; c.scrollIntoView({ behavior: 'smooth', block: 'center' }); $$('.agent.hl').forEach(x => x.classList.remove('hl')); c.classList.add('hl'); setTimeout(() => c.classList.remove('hl'), 2200); }; r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  };
  draw('all');
  $$('#ag-seg button').forEach(b => b.onclick = () => { $$('#ag-seg button').forEach(x => { x.setAttribute('aria-pressed', String(x === b)); }); draw(b.dataset.w); });
}

/* ── 6 · pros ───────────────────────────────────────────────────────────── */
function pros() {
  const pr = S.K('pro_program'); if (!pr.length) return;
  const bls = pr.filter(p => /\(BLS\)/.test(p.program));
  const find = rx => pr.find(p => rx.test(p.program));
  const ind = find(/Industry shortage/), wage = find(/wage benchmark/i), turn = find(/Pay ladders/i), appr = find(/apprenticeship/i);
  const total = bls.reduce((a, b) => a + (b.metric_value || 0), 0);
  const cols = ['#f26b1d', '#2f7de1', '#f5a524'];
  const lab = p => p.program.replace(/^Technician shortage - /, '').replace(/\s*\(BLS\)/, '');
  $('#shortage').innerHTML = `<div class="sys-card sh-main" data-sys-theme="dark"><span class="sys-card-label">The binding constraint · BLS 2025–35</span><div class="sh-big">${comma(total)}</div><p class="sh-cap">openings a year for HVAC techs, plumbers and electricians in the US. Every phase of the plan needs more of them than the market produces.</p><div class="stack">${bls.map((p, i) => `<div style="flex-grow:${p.metric_value};background:${cols[i]}">${comma(p.metric_value)}</div>`).join('')}</div><div class="stack-l">${bls.map((p, i) => `<span><i style="background:${cols[i]}"></i>${esc(lab(p))}</span>`).join('')}</div><div style="margin-top:12px">${bls.map(p => srcLink(p.source_url, 'BLS ' + lab(p))).join(' ')}</div></div><div class="sh-side">${[ind, turn, wage, appr].filter(Boolean).map(p => `<div class="sys-kpi sh-tile"><span class="sys-kpi-value">${fmtVal(p.metric_value, p.metric_unit)}</span><span class="sys-kpi-sub">${esc(valUnit(p.metric_value, p.metric_unit)[1])}</span>${srcLink(p.source_url)}</div>`).join('')}</div>`;
  const progs = pr.filter(p => !bls.includes(p) && p !== ind && p !== wage);
  $('#programs').innerHTML = progs.map(p => { const [v, u] = valUnit(p.metric_value, p.metric_unit); return `<article class="sys-card prog"><span class="sys-card-label">For the ${p.who_it_helps === 'owner' ? 'owner and partner contractors' : 'technicians'}</span><h3 class="sys-card-title">${esc(p.program)}</h3><div class="pm"><b>${v}</b><span>${esc(u)}</span></div><p class="sys-card-body">${esc(prose(p.evidence))}</p>${PRO_KPI[p.id] ? `<p class="ag-kpi"><b>KPI it moves:</b> ${esc(PRO_KPI[p.id])}</p>` : ''}${p.cost_note ? `<div class="cost">${esc(prose(p.cost_note))}</div>` : ''}<span class="sys-card-foot">${srcLink(p.source_url)}</span></article>`; }).join('');
}

/* ── 7 · tuck-ins + 100-day plan ────────────────────────────────────────── */
function verifyNote() {
  if (!S.verify.length) return '';
  const fdd = S.K('expansion_phase')[0]?.data_points?.pp_territories_fdd || {};
  const mapNJ = (S.ma?.meta?.authority_brands_territory_map || []).filter(t => t.state === 'NJ' && /^portfolio/i.test(t.owner_status || '')).length;
  return `<div class="tk-verify" role="note"><b>Held back until ownership is confirmed</b>${S.verify.map(t => `<p>${esc(String(t.company).replace(/\s*\(.*\)/, ''))} (${esc(t.hq_city || '')}, ${esc(t.state)}) scores ${t.fit_score ?? '—'}/100 but trades as “The Punctual Pros”. ${fdd.NJ && mapNJ && fdd.NJ > mapNJ ? `The franchise disclosure lists ${fdd.NJ} New Jersey outlets for Punctual Pros, but only ${mapNJ} map to Horvath, so these outlets may already belong to Punctual Pros. ` : ''}Confirm with Authority Brands before any outreach.</p>`).join('')}</div>`;
}
function tuckins() {
  const it = S.ma?.items || [];
  const byState = {}; it.forEach(t => byState[t.state] = (byState[t.state] || 0) + 1);
  const fit70 = it.filter(t => (t.fit_score || 0) >= 70).length;
  const rev = it.reduce((a, t) => a + (t.revenue_est_usd || 0), 0);
  const pe = S.K('expansion_phase')[1]?.data_points?.pe_sponsors_overlapping_punctual_pros;
  $('#tk-sub').textContent = `Ranked from the portal's add-on screen of ${it.length} companies (${Object.entries(byState).map(([s, n]) => `${s} ${n}`).join(', ')}). Fit is scored out of 100 across density, trade mix, scale, ownership readiness and brand alignment. Click a row for the rationale.`;
  const pin = t => `<span class="tgt-r" style="background:${STATE_C[t.state] || '#333'}">${t.rank}</span>`;
  $('#targets').innerHTML = `<div class="tk-stats"><div><b>${it.length}</b><span>companies screened</span></div><div><b>${fit70}</b><span>with fit score 70+</span></div><div><b>${usd(rev)}</b><span>modeled revenue in the screen (est.)</span></div><div><b>${pe ?? '—'}</b><span>PE sponsors chasing the same founders</span></div></div><div class="fit-key">${FIT_KEYS.map(k => `<span><i style="background:${k[2]}"></i>${k[1]}</span>`).join('')}</div>${S.top.map((t, i) => {
    const fb = t.fit_breakdown || {}; const meta = [`${t.hq_city || ''}, ${t.state}`, t.employees ? `~${t.employees} staff` : '', t.revenue_est_usd ? `${usd(t.revenue_est_usd)} rev. est.` : '', t.ownership ? String(t.ownership).replace(/_/g, ' ') : ''].filter(Boolean).join(' · ');
    return `<div class="tgt ${i === 0 ? 'open' : ''}" tabindex="0" role="button" aria-expanded="${i === 0}">${pin(t)}<div style="min-width:0"><h4 title="${esc(t.company)}">${esc(t.company)}</h4><div class="meta">${esc(meta)}</div></div><div class="fit"><span class="fit-n">${t.fit_score ?? '—'}<span class="of">/100</span></span><div class="fit-bar" aria-label="Fit breakdown">${FIT_KEYS.map(k => `<i style="width:${fb[k[0]] || 0}%;background:${k[2]}" title="${k[1]} ${fb[k[0]] ?? '—'}/20"></i>`).join('')}</div></div><p class="why">${esc(prose(t.why || t.strategic_rationale))}${t.risk_flags?.length ? ` <b>Watch:</b> ${esc(prose(t.risk_flags[0]))}.` : ''}</p></div>`;
  }).join('')}${verifyNote()}`;
  $$('#targets .tgt').forEach(r => { const tog = () => { r.classList.toggle('open'); r.setAttribute('aria-expanded', String(r.classList.contains('open'))); }; r.onclick = tog; r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } }; });

  // 100-day plan: the agents are placed by their published weeks-to-deploy
  const ag = S.K('ai_agent').slice().sort((a, b) => (a.weeks_to_deploy || 99) - (b.weeks_to_deploy || 99));
  const slot = a => { const d = (a.weeks_to_deploy || 0) * 7; return d <= 14 ? 0 : d <= 45 ? 1 : d <= 75 ? 2 : 3; };
  const P = [
    { d: 'Day 0–14', h: 'Close and stabilize', t: ['Authority Brands transfer consent (franchisees) or a conversion plan (independents)', 'Founder rollover of 20–35% and stay bonuses for the top technicians', 'Pay, benefits and tool-stipend parity with Punctual Pros on day one'] },
    { d: 'Day 15–45', h: 'Plug into ServiceOS', t: ['Phones move to the shared Lancaster contact center', 'Field-service software, price book and Comfort Club memberships migrate'] },
    { d: 'Day 46–75', h: 'Run it like the core', t: ['Multi-entity close on one chart of accounts', 'Recruiting through the Thaddeus Stevens and apprenticeship pipeline'] },
    { d: 'Day 76–100', h: 'Prove it and line up the next one', t: ['KPI pack for the PRG: booking rate, average ticket, members, tech turnover', 'Integration review, then an LOI on the next target from the top 10'] },
  ];
  ag.forEach(a => P[slot(a)].t.push({ ai: a.agent.replace(/\s*\(.*\)/, ''), w: a.weeks_to_deploy }));
  $('#hundred').innerHTML = `<h3 class="sys-card-title">The 100-day integration plan</h3><p class="h-sub">Analyst plan. Accented items are AI agents, placed by their published weeks to deploy.</p>${P.map(p => `<div class="hd-phase"><div class="hd-day">${p.d}</div><h4>${p.h}</h4><ul>${p.t.map(x => typeof x === 'string' ? `<li>${esc(x)}</li>` : `<li class="ai">${esc(x.ai)}<em>${x.w} wk</em></li>`).join('')}</ul></div>`).join('')}<p class="sys-src">Run on <a href="serviceos.html">ServiceOS</a>, the shared stack every tuck-in joins.</p>`;
}

/* ── 8 · financing & returns ────────────────────────────────────────────── */
/* Value bridge + sources & uses + returns, all from the roadmap and the financing items. Every output is an estimate. */
function bridgeNums(mx, os) {
  const r = S.road, a = r[0] || {}, z = r[r.length - 1] || {}, fin = S.K('financing');
  const rng = (rx, re) => { const f = fin.find(x => rx.test(x.source_of_funds)); const m = re.exec(f?.amount_or_range || ''); return m ? m.slice(1).map(Number) : null; };
  const arbR = rng(/arbitrage/i, /([\d.]+)-([\d.]+)x entry.*vs ([\d.]+)x/), levR = rng(/leverage/i, /([\d.]+)-([\d.]+)x/), rollR = rng(/rollover/i, /(\d+)-(\d+)%/);
  const dd = fin.find(x => /delayed-draw|credit facility/i.test(x.source_of_funds)) || {};
  const ddtl = +((/\$([\d.]+)M unfunded/.exec(dd.amount_or_range || '') || [])[1] || 0) * 1e6, fac = (/~\$([\d.]+)-([\d.]+)M/.exec(dd.amount_or_range || '') || []).slice(1).map(v => +v * 1e6), par = +((/\$([\d.]+)M par/.exec(dd.evidence || '') || [])[1] || 0) * 1e6;
  const m0 = arbR ? (arbR[0] + arbR[1]) / 2 : 6.6, mExit = arbR ? arbR[2] : 10, lev = levR ? (levR[0] + levR[1]) / 2 : 3.1, roll = rollR ? (rollR[0] + rollR[1]) / 200 : 0.275;
  mx = mx ?? mExit; os = os ?? 0;
  const yrs = (z.month || 36) / 12, e0 = a.ebitda_usd || 0, e36 = z.ebitda_usd || 0, mg0 = e0 / (a.revenue_usd || 1), mg36 = e36 / (z.revenue_usd || 1);
  // organic = today's business growing ORG_G a year at the month-36 margin; acquired = the rest of month-36 revenue
  const orgRev = (a.revenue_usd || 0) * (1 + ORG_G) ** yrs, orgE = orgRev * mg36, acqRev = (z.revenue_usd || 0) - orgRev, acqE36 = e36 - orgE;
  const acqE = acqRev * mg0;                        // EBITDA as bought, at today's ~12% margin
  const price = acqE * m0, fees = price * FEES, os$ = S.ra ? (S.ra.investment_usd[0] + S.ra.investment_usd[1]) / 2 : 0, uses = price + fees + os$;
  const debtNew = acqE * lev, rollover = price * roll, eqNew = uses - debtNew - rollover;
  const ev0 = e0 * m0, debt0 = e0 * lev, eq0 = ev0 - debt0;
  const gOrg = (orgE - e0) * m0, gAcq = acqE36 * m0, arb = e36 * (mx - m0), prem = e36 * os, ev36 = e36 * mx;
  const debt36 = debt0 + debtNew, eq36 = ev36 - debt36, eqIn = eq0 + eqNew + rollover, moic = eq36 / eqIn, irr = moic > 0 ? moic ** (1 / yrs) - 1 : -1;
  const moicUp = (eq36 + prem) / eqIn, irrUp = moicUp ** (1 / yrs) - 1;
  return { ddtl, fac, par, e0, e36, m0, mx, os, lev, roll, yrs, mg0, mg36, orgRev, orgE, acqRev, acqE, acqE36, price, fees, os$, uses, debtNew, rollover, eqNew, ev0, debt0, eq0, gOrg, gAcq, arb, prem, ev36, debt36, eq36, eqIn, moic, irr, moicUp, irrUp };
}
const pct = v => `${Math.round(v * 100)}%`;
function roadNote() {
  const r = S.road, a = r[0] || {}, z = r[r.length - 1] || {}, an = S.nw?.meta?.anchors || {};
  const d1 = S.K('expansion_phase')[0]?.data_points || {}, d2 = S.K('expansion_phase')[1]?.data_points || {};
  const fdd = d1.pp_territories_fdd || {}, owned = Object.values(d2.authority_territories_pp_owned_or_inferred_by_state || {}).reduce((x, y) => x + y, 0), notPP = Object.values(d2.authority_territories_not_pp_by_state || {}).reduce((x, y) => x + y, 0);
  const lv = S.K('growth_lever').find(l => /territory productivity/i.test(l.lever));
  return `<p class="sys-src"><b>Base:</b> today = Oct 2026 run-rate of ${usd(a.revenue_usd)} (FY25 est. ~${usd(an.fy2025_revenue_est_usd)} grown ~8%), so month ${z.month} is ~${(z.revenue_usd / a.revenue_usd).toFixed(1)}x today's revenue. <b>Territories</b> = franchised outlets as counted in the franchise disclosure (one per brand per area): ${comma(fdd.total)} today${fdd.PA ? ` (PA ${fdd.PA}, NJ ${fdd.NJ})` : ''}, of which ${owned} appear on Authority's location map. The path to ${comma(z.territories)} is capped at what Phases 1–3 can buy or convert: ${notPP} mapped Authority outlets in PA, NJ, MD and DE that Punctual Pros does not own, plus independents converted to the three brands. Revenue per territory rises from ${usd(a.revenue_usd / a.territories)} (${lv?.baseline ? `${usd(lv.baseline * 1e6)} on FY25 revenue` : 'run-rate'}) to ${usd(z.revenue_usd / z.territories)}${lv?.target ? `, about halfway to the ${usd(lv.target * 1e6)} top-quartile benchmark in lever ${levNo(lv.id)}` : ''}.</p>`;
}
function financing() {
  const fin = S.K('financing');
  const tag = f => /credit|loan|debt/i.test(f.source_of_funds) ? 'Debt' : /Fund I/i.test(f.source_of_funds) ? 'Fund equity' : /co-invest/i.test(f.source_of_funds) ? 'Co-invest' : /rollover/i.test(f.source_of_funds) ? 'Seller equity' : /leverage/i.test(f.source_of_funds) ? 'Market check' : 'Value creation';
  $('#fin-grid').innerHTML = fin.map(f => `<article class="sys-card fin"><span class="sys-card-label">${tag(f)}</span><h3 class="sys-card-title">${esc(f.source_of_funds)}</h3><div class="amt">${esc(prose(f.amount_or_range))}</div><p class="sys-card-body">${esc(prose(f.evidence))}</p><span class="sys-card-foot">${srcLink(f.source_url)}</span></article>`).join('');
  // roadmap chart + table
  const r = S.road; if (r.length) {
    const W = 600, H = 270, pl = 30, pr = 30, pt = 30, pb = 40, cw = (W - pl - pr) / r.length;
    const maxR = Math.max(...r.map(x => x.revenue_usd)) * 1.12, maxE = Math.max(...r.map(x => x.ebitda_usd)) * 1.12;
    const y = v => pt + 70 + (H - pt - pb - 70) * (1 - v / maxR), ye = v => pt + 8 + 52 * (1 - v / maxE);
    const bars = r.map((x, i) => { const bx = pl + i * cw + cw * .22, bw = cw * .56; return `<rect x="${bx}" y="${y(x.revenue_usd)}" width="${bw}" height="${H - pb - y(x.revenue_usd)}" rx="7" style="fill:${i === r.length - 1 ? 'var(--co)' : 'var(--sys-ink-2)'}" opacity="${.55 + .15 * i}"/><text x="${bx + bw / 2}" y="${y(x.revenue_usd) - 8}" text-anchor="middle" font-size="13" font-weight="700" style="fill:var(--sys-ink)">${usd(x.revenue_usd)}</text><text x="${bx + bw / 2}" y="${H - pb + 18}" text-anchor="middle" font-size="12" style="fill:var(--sys-mute)">Month ${x.month}</text><text x="${bx + bw / 2}" y="${H - pb + 33}" text-anchor="middle" font-size="11" style="fill:var(--sys-mute)">${x.technicians} techs</text>`; }).join('');
    const pts = r.map((x, i) => [pl + i * cw + cw / 2, ye(x.ebitda_usd)]);
    const line = `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" style="stroke:var(--sys-good)" stroke-width="3"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#fff" style="stroke:var(--sys-good)" stroke-width="3"/><rect x="${p[0] - 44}" y="${p[1] - 27}" width="88" height="19" rx="9.5" style="fill:var(--sys-surface);stroke:var(--sys-line-2)"/><text x="${p[0]}" y="${p[1] - 13.5}" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--sys-good)">${usd(r[i].ebitda_usd)} · ${Math.round(r[i].ebitda_usd / r[i].revenue_usd * 100)}%</text>`).join('')}`;
    const grid = `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" style="stroke:var(--sys-line-2)"/><line x1="${pl}" x2="${W - pr}" y1="${pt + 66}" y2="${pt + 66}" style="stroke:var(--sys-line)" stroke-dasharray="4 4"/>`;
    $('#road-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue bars and EBITDA line, months 0 to 36 (estimates)">${grid}${bars}${line}<g font-size="11.5" style="fill:var(--sys-ink-2)"><rect x="${pl}" y="2" width="11" height="11" rx="3" style="fill:var(--sys-ink-2)"/><text x="${pl + 16}" y="12">Revenue</text><line x1="${pl + 82}" x2="${pl + 100}" y1="7.5" y2="7.5" style="stroke:var(--sys-good)" stroke-width="3"/><text x="${pl + 105}" y="12">Adj. EBITDA · margin</text></g></svg>`;
    $('#road-table').innerHTML = `<table class="sys-table tbl"><thead><tr><th>Month</th><th class="sys-n">Revenue</th><th class="sys-n">EBITDA</th><th class="sys-n">Margin</th><th class="sys-n">Techs</th><th class="sys-n">Territories</th><th class="sys-n" title="Revenue per territory">Rev / terr.</th><th class="sys-n">Members</th></tr></thead><tbody>${r.map(x => `<tr><td>${x.month}</td><td class="sys-n">${usd(x.revenue_usd)}</td><td class="sys-n">${usd(x.ebitda_usd)}</td><td class="sys-n">${Math.round(x.ebitda_usd / x.revenue_usd * 100)}%</td><td class="sys-n">${comma(x.technicians)}</td><td class="sys-n">${comma(x.territories)}</td><td class="sys-n">${usd(x.revenue_usd / x.territories)}</td><td class="sys-n">${comma(x.members)}</td></tr>`).join('')}</tbody><caption>Source: Punctual Pros nationwide plan (KPI roadmap), analyst estimates.</caption></table>`;
    $('#road-table').insertAdjacentHTML('afterend', roadNote());
  }
  // value bridge
  const mxI = $('#mx'), osI = $('#os');
  const base = bridgeNums(); mxI.value = base.mx; osI.min = 0; osI.max = 1; osI.step = 0.25; osI.value = 0;
  const draw = () => {
    const b = bridgeNums(+mxI.value, +osI.value);
    $('#mx-out').textContent = b.mx.toFixed(1) + 'x'; $('#os-out').textContent = b.os ? `+${b.os.toFixed(2).replace(/0$/, '')} turn` : 'off';
    const steps = [['EV|today', 0, b.ev0, 'var(--sys-ink-2)'], ['Organic|growth', b.ev0, b.gOrg, 'var(--co)'], ['Acquired|EBITDA', b.ev0 + b.gOrg, b.gAcq, 'color-mix(in srgb,var(--co) 62%,var(--sys-surface))'], ['Multiple|arbitrage', b.ev0 + b.gOrg + b.gAcq, b.arb, 'color-mix(in srgb,var(--co) 36%,var(--sys-surface))'], ['EV|month 36', 0, b.ev36, 'var(--sys-good)']];
    if (b.os) steps.push(['AI upside|not in base', b.ev36, b.prem, 'url(#hatch)']);
    const W = 540, H = 250, pl = 6, pb = 46, pt = 26, cw = (W - pl * 2) / steps.length, max = (b.ev36 + b.prem) * 1.1 || 1;
    const y = v => pt + (H - pt - pb) * (1 - v / max);
    const g = steps.map(([n, s0, v, c], i) => { const x = pl + i * cw + cw * .14, w = cw * .72; const top = y(s0 + Math.max(0, v)), h = Math.max(2, Math.abs(y(s0) - y(s0 + v))); const [l1, l2 = ''] = n.split('|'); const mid = i > 0 && i !== 4; return `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="6" style="fill:${c}"${c.startsWith('url') ? ' stroke="#7c4ddb" stroke-width="1.5"' : ''}/>${mid ? `<line x1="${x - cw * .28}" x2="${x}" y1="${y(s0)}" y2="${y(s0)}" style="stroke:var(--sys-line-2)" stroke-dasharray="3 3"/>` : ''}<text x="${x + w / 2}" y="${top - 7}" text-anchor="middle" font-size="12.5" font-weight="700" style="fill:var(--sys-ink)">${mid ? '+' : ''}${usd(v)}</text><text x="${x + w / 2}" y="${H - pb + 17}" text-anchor="middle" font-size="11" style="fill:var(--sys-ink-2)">${esc(l1)}</text><text x="${x + w / 2}" y="${H - pb + 31}" text-anchor="middle" font-size="11" style="fill:var(--sys-ink-2)">${esc(l2)}</text>`; }).join('');
    const defs = '<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f0eafd"/><rect width="3.5" height="8" fill="#7c4ddb" opacity=".55"/></pattern></defs>';
    $('#bridge').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Enterprise value bridge from ${usd(b.ev0)} today to ${usd(b.ev36)} at month 36 (estimate)">${defs}${g}</svg><div class="ev-row"><span>Base enterprise value at month 36<span class="sys-est">est.</span><br><span class="sys-muted">${usd(b.e36)} EBITDA × ${b.mx.toFixed(1)}x, vs ${usd(b.e0)} × ${b.m0.toFixed(1)}x today${b.os ? `. Upside case with the AI premium: ${usd(b.ev36 + b.prem)} (not in base)` : ''}</span></span><b>${usd(b.ev36)}</b></div>`;
    const ra = S.ra;
    $('#bridge-note').innerHTML = `Organic = today's business growing ~${pct(ORG_G)} a year at the ${pct(b.mg36)} month-36 margin. Acquired = the rest of the ${usd(S.road[S.road.length - 1]?.revenue_usd)}, valued at the entry multiple: the tuck-ins cost ~${usd(b.price)} of that bar (see sources and uses below) and the remainder is their margin lift after joining. ServiceOS savings are already inside the roadmap margin (${pct(b.mg0)} → ${pct(b.mg36)}), so the base adds no AI premium. The slider is an upside case only, capped at 1 turn${ra ? `: the ServiceOS case is a ${usd(ra.investment_usd[0])}–${usd(ra.investment_usd[1])} investment with ${usd(ra.ebitda_impact_usd[0])}–${usd(ra.ebitda_impact_usd[1])} of EBITDA impact` : ''}. Entry ${b.m0.toFixed(1)}x = midpoint of GF Data's sub-$25M TEV range (6.3–6.9x); exit 10.0x = its $100–250M TEV tier.`;
    returnsTable(b);
  };
  mxI.oninput = draw; osI.oninput = draw; draw();
}
function returnsTable(b) {
  const el = $('#su'); if (!el) return;
  const row = (l, v, sub) => `<tr><td>${l}${sub ? `<small>${sub}</small>` : ''}</td><td>${v}</td></tr>`;
  el.innerHTML = `<div><h4>Uses · tuck-ins to month ${S.road[S.road.length - 1]?.month}</h4><table class="tbl su">${[
      row('Tuck-in purchase price', usd(b.price), `${usd(b.acqE)} acquired EBITDA × ${b.m0.toFixed(1)}x`),
      row('Deal fees', usd(b.fees), `${pct(FEES)} of price`),
      row('ServiceOS build', usd(b.os$), 'midpoint of the ServiceOS case'),
      row('Total uses', usd(b.uses))].join('')}</table></div>
    <div><h4>Sources</h4><table class="tbl su">${[
      ...(b.ddtl ? [row('Existing delayed-draw line', usd(b.ddtl), 'undrawn commitment in PGIM Private Credit Fund\'s slice (10-Q, Jun 30, 2026)'),
        row('Upsized or incremental term loan', usd(b.debtNew - b.ddtl), `to be raised; total acquisition debt ${usd(b.debtNew)} = ${b.lev.toFixed(1)}x acquired EBITDA`)]
        : [row('Acquisition debt', usd(b.debtNew), `delayed-draw / unitranche at ${b.lev.toFixed(1)}x acquired EBITDA`)]),
      row('Seller rollover', usd(b.rollover), `${pct(b.roll)} of price (20–35% typical)`),
      row('New equity', usd(b.eqNew), 'Fund I follow-on + deal co-invest'),
      row('Total sources', usd(b.debtNew + b.rollover + b.eqNew))].join('')}</table></div>
    <div><h4>Equity returns at ${b.mx.toFixed(1)}x exit</h4><table class="tbl su">${[
      row('Exit enterprise value', usd(b.ev36), `${usd(b.e36)} × ${b.mx.toFixed(1)}x, no AI premium`),
      row('Less net debt', '−' + usd(b.debt36), `today ~${usd(b.debt0)} (${b.lev.toFixed(1)}x today's EBITDA${b.fac.length ? `, consistent with a facility estimated at ~${usd(b.fac[0])}–${usd(b.fac[1])}` : ''}) + acquisition ${usd(b.debtNew)}; no paydown assumed (${(b.debt36 / b.e36).toFixed(1)}x exit EBITDA)`),
      row('Equity value at exit', usd(b.eq36)),
      row('Equity in', usd(b.eqIn), `today's equity at ${b.m0.toFixed(1)}x (${usd(b.eq0)}) + new ${usd(b.eqNew)} + rollover ${usd(b.rollover)}`),
      row('IRR', pct(b.irr), `all equity counted from day 0${b.os ? `; upside case ${b.moicUp.toFixed(1)}x / ${pct(b.irrUp)}` : ''}`),
      row('Gross MOIC', b.moic.toFixed(1) + 'x')].join('')}</table></div>`;
  $('#su-note').innerHTML = `Every line is an analyst estimate built from the roadmap above and the financing sources on this page. Acquired revenue (${usd(b.acqRev)} at month 36) is bought at today's ~${pct(b.mg0)} margin; organic growth is ~${pct(ORG_G)} a year. Returns are measured on today's value (${b.m0.toFixed(1)}x run-rate EBITDA), not on Broad Sky's original cost, and are gross of fees and carry. Debt is held flat, which understates returns if cash flow pays it down.${b.ddtl ? ` <b>Debt capacity check:</b> the only acquisition line visible in filings is PGIM Private Credit Fund's first-lien loan to Punctual Pros Midco (${usd(b.par)} par, SOFR + 5.00%, due March 2029) with ${usd(b.ddtl)} undrawn on its delayed-draw commitment. Other lenders likely hold the rest of a facility estimated at ~${usd(b.fac[0])}–${usd(b.fac[1])}. The plan therefore assumes the lender group upsizes the unitranche or adds an incremental term loan for the other ${usd(b.debtNew - b.ddtl)}, sized at ${b.lev.toFixed(1)}x acquired EBITDA, the midpoint of GF Data's 2.9–3.3x.` : ''}`;
}

/* ── 9 · risks & asks; footer sources ───────────────────────────────────── */
function risks() {
  const p2 = S.K('expansion_phase')[1]?.data_points || {}; const notPP = Object.values(p2.authority_territories_not_pp_by_state || {}).reduce((a, b) => a + b, 0);
  const R = [
    ['Franchisor approval', `Every franchise tuck-in and conversion needs Authority Brands' consent, and independents may hit territorial limits.`, `Agree a territory roadmap with Authority at CEO level before Phase 2; pre-clear the ${notPP} mapped territories Punctual Pros does not own.`],
    ['Technician capacity', 'BLS projects ~155,300 trade openings a year, and turnover runs 16–21% by trade.', 'The pro programs above, plus AI copilots that make juniors productive faster.'],
    ['Competition for founders', `${p2.pe_sponsors_overlapping_punctual_pros ?? 17} PE sponsors overlap Punctual Pros, ${p2.pe_sponsor_threat_mix?.high ?? 6} rated high threat (${(p2.pe_sponsors_high_threat || []).slice(3, 6).map(s => s.split(' - ').pop()).join(', ')}).`, 'Move first on the top 10, offer rollover, and sell the operator growth plan rather than price.'],
    ['Royalty-capped margins', 'Franchise royalties of ~7.2–7.5% of revenue cap how far margin can rise.', 'Grow memberships, financing and attach revenue, and add independents where Authority allows it.'],
    ['AI results are vendor claims', 'Agent metrics come from vendor case studies, not controlled studies.', 'Pilot each agent in one territory against a control group for 60 days before rolling it out.'],
    ['Thin company data', "Membership count, review count, online-booking share and technician headcount are not public; several baselines are assumptions.", 'A 30-day data request replaces every est. baseline on this page.'],
  ];
  $('#risk-list').innerHTML = R.map(r => `<li><b>${esc(r[0])}</b><span>${esc(r[1])}</span><em>Mitigation: ${esc(r[2])}</em></li>`).join('');
  const ra = S.ra;
  const A = [
    ['PRG + Punctual Pros CFO', 'Company data pull', 'Members, reviews, booking rate, tech headcount and revenue by territory, to replace the est. baselines.'],
    ['Broad Sky deal partners', 'Authority Brands meeting', 'A territory roadmap for PA, NJ, MD, DE and southern NY, with transfer pre-clearance.'],
    ['PRG tech lead', `Approve ServiceOS${ra ? ` (${usd(ra.investment_usd[0])}–${usd(ra.investment_usd[1])} est.)` : ''}`, 'Start with a 60-day pilot of the AI dispatcher and missed-call text-back in Lancaster.'],
    ['PRG talent', 'Hire an integration lead and a head of talent', 'They own the 100-day plan, the Thaddeus Stevens partnership, apprenticeships and veteran hiring.'],
    ['Deal team', 'Founder outreach to the top 10', 'Start with Lancaster Plumbing, the West Chester tri-brand and C&C, using rollover terms.'],
    ['Deal team + lenders', 'Capital for Phase 3', 'Expand the delayed-draw line and prepare a Punctual Pros co-invest SPV like the TS, FL and CET vehicles.'],
  ];
  $('#ask-list').innerHTML = A.map(a => `<li><div><span class="who">${esc(a[0])}</span><b>${esc(a[1])}</b><span>${esc(a[2])}</span></div></li>`).join('');
}
function sources() {
  const m = S.nw?.meta || {}; const urls = new Set(S.items.map(i => i.source_url).filter(Boolean));
  const gen = m.generated ? shortDate(String(m.generated).slice(0, 10)) : '—';
  // The dataset's method note mixes reader-facing sourcing with build notes; show the sourcing and describe the computation in plain words.
  const sourcing = String(m.method || '').split(/\s*Expansion-phase/)[0].replace(/, fetched (\d{4}-\d{2}-\d{2})/, (x, d) => `, fetched ${shortDate(d)}`);
  const method = `${esc(prose(sourcing))} Expansion-phase figures were computed from the portal's datasets: the Punctual Pros ZIP-code model (core, adjacent and Tier-1 flags), Punctual Pros add-on targets with the Authority Brands territory map, the Private-equity landscape and Punctual Pros public filings (franchise disclosure Items 19 and 20, PGIM 10-Q, Form D and ADV). KPI targets and the 36-month roadmap are analyst assumptions anchored to the FY2025 estimates in those filings.`;
  const caveats = (m.caveats || []).filter(c => !/^(The user's request|Per earlier user guidance)/i.test(c)).map(c => prose(c).replace(/Confirm which company .*$/, '').replace(/\bor null\b/g, 'or shown as —'));
  $('#src-body').innerHTML = `<p><b>Method.</b> ${method}</p><p><b>Datasets.</b> Punctual Pros nationwide plan (${S.items.length} sourced items from ${urls.size} distinct sources, compiled ${gen}), Punctual Pros add-on targets, ServiceOS evidence and the Punctual Pros ZIP-code model, all in the Broad Sky portal.</p><p><b>Caveats</b></p><ul>${caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`;
}

/* ── chat: autocomplete prompts + data-computed answers ─────────────────── */
const SUGG = [
  'Which counties come first?', 'Which AI agents pay back fastest?', 'How can AI agents help HVAC techs and plumbers?', 'Which AI agents improve office efficiency?', 'How does Smith + Howard compare?', 'How do we help the technicians and contractors?',
  'What are the top tuck-in targets?', 'How do we fund the expansion?', 'What is the revenue plan for month 36?', 'What improves beyond the website?',
  'What happens in Phase 1?', 'What happens in Phase 2?', 'What happens in Phase 3?', 'What happens in Phase 4?',
  'Which AI agents help the office?', 'Which AI agents help technicians?', 'Which AI agents help customers?', 'Which AI agents help the owner?',
  'How big is the technician shortage?', 'What is the multiple-expansion case?', 'What does ServiceOS add to valuation?', 'Who else is bidding for HVAC founders?',
  'Show tuck-in targets in New Jersey', 'Show tuck-in targets in Pennsylvania', 'Show tuck-in targets in Delaware', 'What is the 100-day integration plan?',
  'How big is the Authority Brands system?', 'How many members does the plan need?', 'What are the biggest risks?', 'What do we need from the Portfolio Resource Group?',
  'Give me the nationwide plan in one minute',
];
const A = (href, label) => `<a class="ch-link" href="${esc(href)}">${esc(label)} →</a>`;
const portal = (hash, label) => A('../../app.html' + hash, label);
const T = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const N = v => `<span class="ch-num">${v}</span>`;

function chatIntents() {
  const ph = S.K('expansion_phase');
  const phaseAns = n => { const x = ph[n - 1]; if (!x) return null; const d = x.data_points || {}; let extra = '';
    if (n === 1) extra = T(['County', 'Core zips'], Object.entries(d.core_zips_by_county || {}).slice(0, 6).map(([c, v]) => [esc(c), N(v)]));
    if (n === 2 || n === 3) extra = T(['Metro', 'Tier-1 zips', 'Homes'], (d.metros || []).map(m => [esc(m.metro), N(m.tier1_zips), N(comma(m.housing_units))]));
    if (n === 4) extra = `<p>${N(comma(d.fdd_system_outlets_end_2025?.total))} tri-brand outlets, ${N(d.fdd_franchisees_end_2025)} franchisees, ${N(usd(d.fdd_reported_gross_revenue_fy2025_usd))} reported revenue; Punctual Pros holds ${N(d.pp_share_of_tri_brand_outlets_pct + '%')} of outlets today.</p>`;
    return { html: `<h4>${esc(x.phase)} <span class="ch-badge">months ${esc(x.months)}</span></h4><p>${esc(x.thesis)}</p>${extra}`, links: [A(`#phase-${n}`, `Show Phase ${n} on the map`)], followups: [n < 4 ? `What happens in Phase ${n + 1}?` : 'What is the multiple-expansion case?', 'What are the top tuck-in targets?'] }; };
  const whoOf = q => /office|back.?office|admin|dispatch|permit|invoice|\bap\b/i.test(q) ? 'office' : /technician|\btechs?\b|truck|field|plumbers?|electricians?|installers?|hvac|contractors?|(?<!punctual )pros\b/i.test(q) ? 'technician' : /customer|homeowner|caller|calls?\b/i.test(q) ? 'customer' : /owner|recruit|retention|member/i.test(q) ? 'owner' : null;
  const stateOf = q => { const m = /\b(new jersey|nj|pennsylvania|pa|maryland|md|delaware|de|new york|ny)\b/i.exec(q); if (!m) return null; const k = m[1].toLowerCase(); return { 'new jersey': 'NJ', pennsylvania: 'PA', maryland: 'MD', delaware: 'DE', 'new york': 'NY' }[k] || k.toUpperCase(); };
  return [
    { id: 'nw_horvath', rx: [/horvath/i], run: async () => ({ html: `<h4>Horvath Home Services, the first out-of-state deal</h4><p>Beachwood / Toms River NJ (Ocean &amp; Monmouth counties), closed Dec 2024. It is Punctual Pros' Market Street Partners moment: Smith + Howard's first add-on took it into a new state, and Horvath did the same for Punctual Pros.</p><p>Phase 2 repeats it across PA, NJ, MD, DE and southern NY: ${N((S.ma?.items || []).filter(x => x.state === 'NJ').length)} NJ companies are already in the add-on screen.</p>`, links: [A('#phase-2', 'Show Phase 2 on the map')], followups: ['Show tuck-in targets in New Jersey', 'What happens in Phase 2?'] }) },
    { id: 'nw_os', rx: [/^(what('| i)s|explain|tell me about)\s+serviceos\??$/i], run: async () => { const ra = S.ra; return { html: `<h4>ServiceOS</h4><p>The shared operating stack every Punctual Pros location and tuck-in runs on: AI answering and dispatch, price book, memberships, reviews, finance and recruiting agents. Each tuck-in plugs into it in days 15–45 of the 100-day plan.</p>${ra ? `<p>${N(usd(ra.investment_usd[0]) + '–' + usd(ra.investment_usd[1]))} investment, ${N(usd(ra.ebitda_impact_usd[0]) + '–' + usd(ra.ebitda_impact_usd[1]))} EBITDA impact <span class="ch-badge">est.</span></p>` : ''}`, links: [A('serviceos.html', 'ServiceOS demo'), A('#agents', 'The agents inside it')], followups: ['What does ServiceOS add to valuation?', 'Which AI agents pay back fastest?'] }; } },
    { id: 'nw_market', rx: [/market size|size of the market|how big is the (hvac|home.?services?|residential|plumbing)|\btam\b/i], run: async () => { const me = S.nw?.meta?.market_evidence || {}; const h = me.hvac_services_us || {}; return { html: `<h4>How big is the market</h4><p>${h.value_usd ? `US HVAC services (residential + commercial): ${N(usd(h.value_usd))} in ${esc(h.year)} <span class="ch-badge">est.</span> Publishers disagree, so treat it as a range.` : 'Market-size estimates vary by publisher.'} The Authority Brands tri-brand system alone reports ${N(usd(S.K('expansion_phase')[3]?.data_points?.fdd_reported_gross_revenue_fy2025_usd))} of franchisee revenue (FY2025 FDD).</p>`, links: [A('#map', 'Phased expansion map')], followups: ['How big is the Authority Brands system?', 'Which counties come first?'] }; } },
    { id: 'nw_phase', rx: [/phase\s*(1|2|3|4|one|two|three|four)\b/i], run: async q => { const w = /phase\s*(1|2|3|4|one|two|three|four)\b/i.exec(q)[1].toLowerCase(); return phaseAns({ one: 1, two: 2, three: 3, four: 4 }[w] || +w); } },
    { id: 'nw_100', rx: [/100.?day|integrat|day one|onboard(ing)? (a |the )?(tuck|acqui)/i], run: async () => { const ag = S.K('ai_agent').slice().sort((a, b) => a.weeks_to_deploy - b.weeks_to_deploy); return { html: `<h4>The 100-day integration plan</h4><ul><li><b>Day 0–14 · close &amp; stabilize:</b> franchisor consent, 20–35% founder rollover, pay and tool-stipend parity.</li><li><b>Day 15–45 · plug into ServiceOS:</b> phones to the Lancaster contact center, price book and memberships migrate.</li><li><b>Day 46–75 · run it like the core:</b> one chart of accounts, recruiting through the shared pipeline.</li><li><b>Day 76–100 · prove it:</b> KPI pack to the PRG, then an LOI on the next target.</li></ul><p>AI agents switch on in this order: ${ag.map(a => `${esc(a.agent.replace(/\s*\(.*\)/, ''))} (${N(a.weeks_to_deploy + ' wk')})`).join(', ')}.</p>`, links: [A('#tuckins', 'Open the plan'), A('serviceos.html', 'ServiceOS')], followups: ['What are the top tuck-in targets?', 'Which AI agents pay back fastest?'] }; } },
    { id: 'nw_agents', rx: [/\bai\b|agents?\b|automat|efficien|copilot|pay ?back/i], run: async q => { const w = whoOf(q); let ag = S.K('ai_agent'); if (w) ag = ag.filter(a => a.who_it_helps === w); ag = ag.slice().sort((a, b) => (a.weeks_to_deploy || 99) - (b.weeks_to_deploy || 99)); const f = ag[0];
      return { html: `<h4>AI agents${w ? ` that help the ${esc(WHO[w].label.toLowerCase())}` : ''}, fastest to value first</h4>${f ? `<p>Fastest: <b>${esc(f.agent)}</b>, live in ${N(f.weeks_to_deploy + ' weeks')}. ${esc(f.metric_claim)}</p>` : ''}${T(['Agent', 'Helps', 'Live in', 'Published benchmark'], ag.map(a => [`<b>${esc(a.agent.replace(/\s*\(.*\)/, ''))}</b><br><span style="color:var(--ch-mute)">${esc((a.vendor_examples || []).slice(0, 2).join(', '))}</span>`, esc(a.who_it_helps), N(a.weeks_to_deploy + ' wk'), N(fmtVal(a.metric_value, a.metric_unit)) + ' ' + esc(valUnit(a.metric_value, a.metric_unit)[1])]))}<div class="ch-src">Weeks to deploy is the speed proxy; actual payback depends on Punctual Pros' call volume and ticket size. Results are vendor-published case studies, so treat them as upper bounds.</div>`, links: [A('#agents', 'See the agent catalog'), A('serviceos.html', 'ServiceOS demo')], followups: w ? ['Which AI agents pay back fastest?', 'What is the 100-day integration plan?'] : ['Which AI agents help technicians?', 'Which AI agents help the office?'] }; } },
    { id: 'nw_template', rx: [/smith|howard|template|\btpg\b|law.?firm|accounting firm|regional.{0,15}national|compare|analog/i], run: async () => { const t = S.K('template').filter(x => !/frontline/i.test(x.company)).sort((a, b) => String(a.date).localeCompare(String(b.date))); const z = S.road[S.road.length - 1] || {}, an = S.nw?.meta?.anchors || {};
      return { html: `<h4>Smith + Howard vs Punctual Pros</h4>${T(['', 'Smith + Howard (actual)', 'Punctual Pros (plan, est.)'], [['Start', '1 Atlanta office, ~100 people', `Lancaster + Horvath NJ, ${esc(an.staff_est)} staff`], ['Revenue', '$53.2M FY23 → ~$175M 2026', `${usd(S.road[0]?.revenue_usd)} today → ${usd(z.revenue_usd)} month ${z.month}`], ['Add-ons', '9 in about 3.7 years', '1 so far (Horvath) → 2 in year 1, then Phases 2–4'], ['Exit', 'TPG Growth, Aug 2026, ~4x revenue', `~${(z.revenue_usd / (S.road[0]?.revenue_usd || 1)).toFixed(1)}x today's revenue, sold into the 10x EBITDA tier`]])}<p><b>Key moves:</b> ${t.filter(x => /^Add-on/.test(x.event)).map(x => esc(x.company)).join(', ')}.</p><div class="ch-src">Smith + Howard is an accounting and advisory firm, not a law firm. Frontline (managed IT for law firms) is a secondary analog because it was already national at entry.</div>`, links: [A('#template', 'See the timeline')], followups: ['Which counties come first?', 'What are the top tuck-in targets?'] }; } },
    { id: 'nw_pros', rx: [/technicians?|\btechs\b|(?<!punctual )\bpros\b|contractors?|hvac (people|workers)|plumbers?|electricians?|shortage|apprentic|training|talent|hiring|recruit|veteran|thaddeus|workforce/i], run: async () => { const p = S.K('pro_program'); const bls = p.filter(x => /\(BLS\)/.test(x.program)); const progs = p.filter(x => !/shortage|wage benchmark/i.test(x.program));
      return { html: `<h4>Helping the pros</h4><p>BLS projects ${N(comma(bls.reduce((a, b) => a + b.metric_value, 0)))} openings a year for HVAC techs, plumbers and electricians (${bls.map(b => `${esc(b.program.replace(/^Technician shortage - |\s*\(BLS\)/g, ''))} ${N(comma(b.metric_value))}`).join(', ')}). Technicians, not demand, limit growth.</p><ul>${progs.map(x => `<li><b>${esc(x.program)}</b>: ${N(fmtVal(x.metric_value, x.metric_unit))} ${esc(valUnit(x.metric_value, x.metric_unit)[1])}</li>`).join('')}</ul>`, links: [A('#pros', 'Helping the pros')], followups: ['Which AI agents help technicians?', 'What do we need from the Portfolio Resource Group?'] }; } },
    { id: 'nw_authority', rx: [/authority|franchis|one hour|ben(jamin)? franklin|mister sparky|\bfdd\b|tri-?brand/i], run: async () => { const d = ph[3]?.data_points || {}, me = S.nw?.meta?.market_evidence?.authority_brands || {}; const o = d.fdd_system_outlets_end_2025 || {};
      return { html: `<h4>The Authority Brands system</h4>${T(['Brand', 'Outlets (end 2025)', 'Largest franchisee'], [['One Hour Heating & Air', N(o.one_hour), N(usd(d.largest_franchisee_revenue_usd?.one_hour))], ['Benjamin Franklin Plumbing', N(o.ben_franklin), N(usd(d.largest_franchisee_revenue_usd?.ben_franklin))], ['Mister Sparky', N(o.mister_sparky), N(usd(d.largest_franchisee_revenue_usd?.mister_sparky))]])}<p>${N(d.fdd_franchisees_end_2025)} franchisees and ${N(usd(d.fdd_reported_gross_revenue_fy2025_usd))} of reported revenue. Punctual Pros holds ${N(d.pp_share_of_tri_brand_outlets_pct + '%')} of outlets. Across all ${esc(me.brands)} brands Authority reports ${esc(me.territories)} territories and ${esc(me.franchise_owners)} owners.</p>`, links: [A('#phase-4', 'Phase 4 on the map')], followups: ['What happens in Phase 4?', 'What are the biggest risks?'] }; } },
    { id: 'nw_compete', rx: [/compet|bidding|rival|sponsors?\b|other pe|private equity|who else/i], run: async () => { const d = ph[1]?.data_points || {};
      return { html: `<h4>Who else is bidding for HVAC founders</h4><p>${N(d.pe_sponsors_overlapping_punctual_pros)} PE sponsors overlap Punctual Pros (${N(d.pe_sponsor_threat_mix?.high)} high, ${N(d.pe_sponsor_threat_mix?.medium)} medium, ${N(d.pe_sponsor_threat_mix?.low)} low threat).</p><ul>${(d.pe_sponsors_high_threat || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul><p>Broad Sky's edge is the operator growth plan plus the AI stack, which raises a tuck-in's margin within 12 months, and rollover that keeps founders in the upside.</p>`, links: [portal('#/pe/landscape', 'PE landscape'), A('#tuckins', 'Our top 10')], followups: ['What are the top tuck-in targets?', 'How do we fund the expansion?'] }; } },
    { id: 'nw_targets', rx: [/tuck.?ins?|targets?\b|acqui|add.?ons?|\bm&a\b|\bbuy\b|founders? to call/i], run: async q => { const st = stateOf(q); let t = S.screen.slice(); if (st) t = t.filter(x => x.state === st); t.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
      return { html: `<h4>Top tuck-in targets${st ? ` · ${st}` : ''}</h4>${t.length ? T(['Fit', 'Company', 'HQ', 'Staff', 'Rev. est.'], t.slice(0, 8).map(x => [N(x.fit_score ?? '—'), `<b>${esc(x.company)}</b>`, esc(`${x.hq_city || ''}, ${x.state}`), N(x.employees ?? '—'), N(usd(x.revenue_est_usd))])) : '<p>No screened targets in that state yet.</p>'}<div class="ch-src">${t.length} of ${(S.ma?.items || []).length} screened companies${st ? ` are in ${st}` : ''}. Scores: density, trade mix, scale, ownership readiness, brand alignment (each /20).${S.verify.filter(x => !st || x.state === st).length ? ` Not ranked until ownership is confirmed: ${S.verify.filter(x => !st || x.state === st).map(x => esc(x.company.replace(/\s*\(.*\)/, ''))).join(', ')} (trades under the Punctual Pros name).` : ''}</div>`, links: [A('#tuckins', 'Ranked list + 100-day plan'), portal('#/ma/pipeline?platform=pp', 'Full add-on pipeline')], followups: [st === 'NJ' ? 'Show tuck-in targets in Delaware' : 'Show tuck-in targets in New Jersey', 'What is the 100-day integration plan?'] }; } },
    { id: 'nw_fin', rx: [/\bfund(ing|s)?\b|how do we (pay|finance)|financ(e|ing) (the|it|expansion|deals?|plan)|\bdebt\b|leverage|\bcapital\b|co.?invest|rollover|pay for|unitranche|pgim|delayed.?draw/i], run: async () => ({ html: `<h4>How we fund the expansion</h4>${T(['Source', 'Amount / range'], S.K('financing').map(f => [`<b>${esc(f.source_of_funds)}</b>`, esc(f.amount_or_range)]))}${(() => { const b = bridgeNums(); return `<p>Modeled uses to month 36: ${N(usd(b.uses))} (tuck-ins ${usd(b.price)}, fees, ServiceOS). Sources: ${N(usd(b.debtNew))} debt, ${N(usd(b.rollover))} seller rollover, ${N(usd(b.eqNew))} new equity <span class="ch-badge">est.</span></p>`; })()}${(() => { const b = bridgeNums(); return b.ddtl ? `<p>Only ${N(usd(b.ddtl))} of undrawn delayed-draw capacity is visible today (PGIM Private Credit Fund's slice of the unitranche), so year-1 tuck-ins also lean on seller rollover and Fund I equity, and the other ${usd(b.debtNew - b.ddtl)} of acquisition debt assumes an upsized or incremental term loan <span class="ch-badge">est.</span></p>` : ''; })()}<p>Phase 3–4 anchor deals need a deal-level co-invest vehicle, as Broad Sky raised for Thomas Scientific, Frontline and CET.</p>`, links: [A('#returns', 'Financing & returns')], followups: ['What is the multiple-expansion case?', 'What is the revenue plan for month 36?'] }) },
    { id: 'nw_value', rx: [/multiple|valuation|\bexit\b|serviceos|arbitrage|returns?\b|worth|enterprise value|moic|\birr\b|sources and uses/i], run: async () => { const b = bridgeNums(); const ra = S.ra;
      return { html: `<h4>Value and returns at month 36 <span class="ch-badge">est.</span></h4>${T(['Step', 'Value'], [['EV today', `${N(usd(b.ev0))} (${usd(b.e0)} × ${b.m0.toFixed(1)}x)`], ['+ Organic EBITDA growth', N('+' + usd(b.gOrg))], ['+ Acquired EBITDA (≈ what the tuck-ins cost)', N('+' + usd(b.gAcq))], [`+ Multiple arbitrage to ${b.mx.toFixed(1)}x`, N('+' + usd(b.arb))], ['<b>Base EV month 36</b>', `<b>${N(usd(b.ev36))}</b> (${usd(b.e36)} × ${b.mx.toFixed(1)}x)`], ['Less net debt', N('−' + usd(b.debt36))], ['Equity in → equity out', `${N(usd(b.eqIn))} → ${N(usd(b.eq36))}`], ['<b>Gross MOIC / IRR</b>', `<b>${N(b.moic.toFixed(1) + 'x')}</b> / ${N(pct(b.irr))}`]])}<p>Tuck-ins cost ~${N(usd(b.price))}, funded by ${N(usd(b.debtNew))} of debt, ${N(usd(b.rollover))} of seller rollover and ${N(usd(b.eqNew))} of new equity.</p>${ra ? `<p>No AI premium in the base: ServiceOS (${usd(ra.investment_usd[0])}–${usd(ra.investment_usd[1])} investment, ${usd(ra.ebitda_impact_usd[0])}–${usd(ra.ebitda_impact_usd[1])} EBITDA impact) is already inside the margin path. A premium of up to 1 turn is shown only as an upside case.</p>` : ''}<div class="ch-src">Multiples from GF Data (sub-$25M TEV 6.3–6.9x vs $100–250M TEV 10.0x). Returns on today's value, gross of fees and carry, debt held flat.</div>`, links: [A('#returns', 'Value bridge and sources & uses')], followups: ['How do we fund the expansion?', 'What are the biggest risks?'] }; } },
    { id: 'nw_road', rx: [/revenue|ebitda|month\s*\d+|\bkpis?\b|roadmap|members?(hip)?|grow to|36 months|\b\d+ years?\b|three years|look like in|numbers/i], run: async () => ({ html: `<h4>36-month KPI roadmap <span class="ch-badge">est.</span></h4>${T(['Month', 'Revenue', 'EBITDA', 'Techs', 'Territories', 'Members'], S.road.map(x => [N(x.month), N(usd(x.revenue_usd)), N(usd(x.ebitda_usd)), N(x.technicians), N(x.territories), N(comma(x.members))]))}<p>${esc(S.road[S.road.length - 1]?.note || '')}</p>`, links: [A('#returns', 'Roadmap chart')], followups: ['What is the multiple-expansion case?', 'How do we fund the expansion?'] }) },
    { id: 'nw_levers', rx: [/levers?|beyond|website|improve|online booking|reviews?\b|google|\bseo\b|\blsa\b|new.?mover|pric(e|ing)|generator|organic/i], run: async () => ({ html: `<h4>Beyond the website: ${S.K('growth_lever').length} growth levers</h4>${T(['Lever', 'Today → target'], S.K('growth_lever').map(l => [`<b>${esc(l.lever)}</b>`, isBench(l) && BENCH[l.id] ? `<span class="ch-badge">benchmark</span> ${N(esc(BENCH[l.id](l)[0]))} <span style="color:var(--ch-mute)">${esc(BENCH[l.id](l)[1])}</span>` : N(`${l.baseline != null ? fmtVal(l.baseline, l.unit) : 'n/a'} → ${l.target != null ? fmtVal(l.target, l.unit) : 'tbd'}`) + ` <span style="color:var(--ch-mute)">${esc(String(l.unit || '').replace(/^(%|x|USD M)\s*/, ''))}</span>`]))}`, links: [A('#levers', 'All levers with sources'), A('index.html', 'The website redesign')], followups: ['Which AI agents pay back fastest?', 'How many members does the plan need?'] }) },
    { id: 'nw_risk', rx: [/risks?|downside|go wrong|worr|concern/i], run: async () => ({ html: `<h4>Biggest risks</h4><ul>${$$('#risk-list li').map(li => `<li>${li.innerHTML.replace(/<em>/, '<br><i>').replace(/<\/em>/, '</i>')}</li>`).join('')}</ul>`, links: [A('#risks', 'Risks & asks')], followups: ['What do we need from the Portfolio Resource Group?'] }) },
    { id: 'nw_prg', rx: [/\bprg\b|need from|resource group|\basks?\b|next steps?|what do (you|we) need/i], run: async () => ({ html: `<h4>What we need from the PRG</h4><ol>${$$('#ask-list li').map(li => `<li><b>${esc(li.querySelector('b')?.textContent)}</b> (${esc(li.querySelector('.who')?.textContent)}): ${esc(li.querySelector('span:last-child')?.textContent)}</li>`).join('')}</ol>`, links: [A('#risks', 'Risks & asks')], followups: ['What are the biggest risks?', 'Which AI agents pay back fastest?'] }) },
    { id: 'nw_where', rx: [/count(y|ies)|\bfirst\b|where|which (markets|metros|cities|states)|\bmap\b|geograph|new jersey|maryland|delaware|pittsburgh|baltimore|philadelphia|richmond/i], run: async q => { const d1 = ph[0]?.data_points || {}, d2 = ph[1]?.data_points || {};
      return { html: `<h4>Which counties come first</h4><p><b>Phase 1 (months 0–12): win the 9 counties we already serve.</b> ${N(d1.core_zips)} core zips, ${N(comma(d1.core_housing_units))} homes, ${N(d1.core_go_now_zips)} "go now" zips.</p>${T(['Core county', 'Zips'], Object.entries(d1.core_zips_by_county || {}).slice(0, 5).map(([c, n]) => [esc(c), N(n)]))}<p><b>Then the adjacent ring:</b> ${N(d1.adjacent_tier1_zips_total)} Tier-1 zips (${Object.entries(d1.adjacent_tier1_zips_by_state || {}).map(([s, n]) => `${s} ${n}`).join(', ')}), led by ${esc((d1.adjacent_tier1_top_counties || []).slice(0, 5).join(', '))}.</p><p><b>Phase 2 (months 9–24):</b> ${esc((d2.metros || []).map(m => m.metro.replace(/\s*\(.*\)/, '')).join(', '))} and Delaware.</p>${(() => { const st = stateOf(q); if (!st || st === 'PA') return ''; const t = S.screen.filter(x => x.state === st).sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)); return `<p><b>In ${esc(st)}:</b> ${t.length} screened add-on targets${t.length ? `, led by ${t.slice(0, 3).map(x => `${esc(x.company.replace(/\s*\(.*\)/, ''))} (${N(x.fit_score ?? '—')})`).join(', ')}` : ''}.</p>`; })()}`, links: [A('#phase-1', 'Show Phase 1 on the map'), portal('#/pp/territory', 'Territory & expansion')], followups: ['What happens in Phase 2?', 'What are the top tuck-in targets?'] }; } },
    { id: 'nw_overview', rx: [/nationwide|national|expan|scale|playbook|thesis|summary|overview|one minute|\bplan\b|grow/i], run: async () => ({ html: `<h4>Punctual Pros, Lancaster to national</h4><p>${esc(String(S.nw?.meta?.narrative || '').split('. ').slice(0, 3).join('. '))}.</p><ul>${ph.map((x, i) => `<li><b>Phase ${i + 1}</b> (${esc(x.months)} mo): ${esc(x.phase.replace(/^Phase \d+\s*-\s*/, ''))}</li>`).join('')}</ul><p>Plan: ${N(usd(S.road[0]?.revenue_usd))} → ${N(usd(S.road[S.road.length - 1]?.revenue_usd))} revenue and ${N(S.road[0]?.technicians)} → ${N(S.road[S.road.length - 1]?.technicians)} technicians in 36 months <span class="ch-badge">est.</span></p>`, links: [A('#template', 'The template'), A('#map', 'Phased map'), A('#agents', 'AI agents')], followups: ['Which counties come first?', 'Which AI agents pay back fastest?', 'How does Smith + Howard compare?'] }) },
  ];
}

function chatFaq() {
  const z = S.road[S.road.length - 1] || {}, an = S.nw?.meta?.anchors || {}, me = S.nw?.meta?.market_evidence || {};
  const ag = S.K('ai_agent').slice().sort((a, b) => a.weeks_to_deploy - b.weeks_to_deploy);
  return [
    { q: 'What is the nationwide plan for Punctual Pros?', a: `<p>A four-phase plan to take Punctual Pros from a ~${usd(S.road[0]?.revenue_usd)} run-rate in Central PA to a ~${usd(z.revenue_usd)} Mid-Atlantic company in 36 months, then national inside the Authority Brands system, using the Smith + Howard template. <span class="ch-badge">est.</span></p>`, href: '#template' },
    { q: 'Why Smith + Howard and not a law firm?', a: '<p>Smith + Howard (Atlanta accounting and advisory) is Broad Sky\'s regional-to-national exit: 1 office to 11 locations, 9 add-ons, sold to TPG Growth in Aug 2026. Frontline serves law firms but was already national at entry, so it is a secondary analog.</p>', href: '#template' },
    { q: 'What is ServiceOS?', a: '<p>The shared operating stack every Punctual Pros location and tuck-in runs on: AI dispatch and answering, price book, memberships, reviews, finance and recruiting agents. See the ServiceOS page for the demo and valuation math.</p>', href: 'serviceos.html' },
    { q: 'How long until the AI agents are live?', a: `<p>Two to ten weeks each. First: ${ag.slice(0, 3).map(a => `${esc(a.agent.replace(/\s*\(.*\)/, ''))} (${a.weeks_to_deploy} wk)`).join(', ')}.</p>`, href: '#agents' },
    { q: 'How many technicians will the plan need?', a: `<p>${S.road.map(r => `${r.technicians} at month ${r.month}`).join(', ')} <span class="ch-badge">est.</span>. That is why the plan includes the Thaddeus Stevens pipeline, PA apprenticeships, pay ladders and AI copilots.</p>`, href: '#pros' },
    { q: 'What did the Horvath Home Services deal prove?', a: '<p>Horvath (Beachwood / Toms River NJ, Dec 2024) was Punctual Pros\' first out-of-state add-on, its Market Street Partners moment. Phase 2 repeats it across PA, NJ, MD, DE and southern NY.</p>', href: '#phase-2' },
    { q: 'How big is the HVAC services market?', a: `<p>Mordor Intelligence puts US HVAC services (residential + commercial) at ${usd(me.hvac_services_us?.value_usd)} in ${me.hvac_services_us?.year}, growing ~5.9% a year. Publishers disagree, so treat it as a range.</p>` },
    { q: 'Where does the website redesign fit?', a: '<p>It is lever 1 of 10: online booking from ~5% to 20% of jobs. It is the front door. The AI agents, memberships, financing and tuck-ins create most of the value.</p>', href: 'index.html' },
    { q: 'What does the debt look like today?', a: '<p>PGIM Private Credit Fund\'s 10-Q shows a first-lien loan to Punctual Pros Midco at SOFR+5.00% due March 26, 2029, plus a $1.4M unfunded delayed-draw commitment in that fund\'s slice.</p>', href: '#returns' },
    { q: 'What is the Thaddeus Stevens partnership?', a: '<p>Thaddeus Stevens College in Lancaster reports 97% placement and 18 job opportunities per graduate. Punctual Pros would fund scholarships, lab equipment and a signing-bonus pool (est. $50–150K/yr) to get first pick.</p>', href: '#pros' },
  ];
}

function mountChat(Chat) {
  const intents = chatIntents(), faq = chatFaq();
  const common = { persona: 'pp', short_name: 'Punctual Pros', theme: 'light', name: 'Growth plan assistant', initials: 'PP', color: '#b84a17', greeting: 'Ask me anything about taking Punctual Pros national: where we expand first, which AI agents to deploy, how we help technicians, the tuck-in targets, financing and returns. Every answer is computed from the plan datasets.', placeholder: 'Ask how Punctual Pros goes national…', suggestions: SUGG, faq, intents };
  let qp = null; try { qp = new URLSearchParams(location.search); } catch { /* ignore */ }
  const autoAsk = qp?.get('ask') || undefined;
  const inline = Chat.mount($('#hero-chat'), { ...common, mode: 'inline', autoAsk });
  const floating = Chat.mount(null, { ...common, mode: 'floating' });
  const fitPh = () => { const ta = $('#hero-chat textarea'); if (ta) ta.placeholder = ta.clientWidth < 300 ? 'Ask the plan…' : common.placeholder; };
  fitPh(); addEventListener('resize', fitPh);
  // "type a few letters" demo buttons: show the autocomplete working in place
  const card = $('#ask'); const tries = ['ai age', 'phase', 'smith', 'tuck-in', 'fund'];
  const row = document.createElement('div'); row.className = 'ask-try';
  row.innerHTML = `<span>Try typing:</span>${tries.map(t => `<button type="button" data-t="${esc(t)}">${esc(t)}…</button>`).join('')}`;
  card.appendChild(row);
  const typeIn = t => { const ta = $('#hero-chat textarea'); if (!ta) return; ta.value = t; ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true })); };
  $$('button', row).forEach(b => b.onclick = () => typeIn(b.dataset.t));
  if (qp?.get('type')) setTimeout(() => typeIn(qp.get('type')), 400);   // shareable demo: ?type=ai shows the autocomplete
  return floating || inline;
}

