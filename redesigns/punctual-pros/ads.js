/* ═══════════════════════════════════════════════════════════════════════════
   Punctual Pros · Growth marketing & sample ads — page logic (ES module, no build)
   Data: data/research/pp_ads.json (creatives, plans, platforms, benchmarks),
         data/research/pp_demand_model.json (NWS zones + event plans),
         data/pp_zips.json (core zips), data/sales/pp_sales_* meta.coverage (snapshot below),
         live api.weather.gov alerts + county geometry.
   ═══════════════════════════════════════════════════════════════════════════ */
let Data, Fmt, Live, esc;
const ROOT = new URL('../../', import.meta.url).href;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const num = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const money = (v, d = 0) => v == null || isNaN(v) ? '—' : (v < 0 ? '-$' : '$') + num(Math.abs(v), d);
const pct = (v, d = 0) => v == null || isNaN(v) ? '—' : (v * 100).toFixed(d) + '%';
const compact = v => v == null || isNaN(v) ? '—' : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 2).replace(/\.?0+$/, '') + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : num(v);
const pad = n => String(n).padStart(2, '0');
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u || ''); } };
/* Publisher names for the media-plan sources, so the table never shows a bare domain. */
const PUB = { 'searchlightdigital.io': 'SearchLight Digital', 'adwave.com': 'AdWave', 'mountain.com': 'MNTN', 'localiq.com': 'LocaliQ', 'piworld.com': 'Printing Impressions', 'directmail.io': 'DirectMail.io', 'v2.4over4.com': '4over4', '4over4.com': '4over4', 'housecallpro.com': 'Housecall Pro', 'wordstream.com': 'WordStream', 'fitsmallbusiness.com': 'Fit Small Business' };
const pubName = u => PUB[host(u)] || host(u).replace(/\.(com|io|net|org|land)$/, '');
const ext = (u, label) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(label || host(u))}</a>` : '';
const waitFor = (fn, ms = 10000) => new Promise(res => { const t0 = Date.now(); (function poll() { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, 80); })(); });
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const safe = (name, fn) => { try { return fn(); } catch (e) { console.info(`[ads] ${name} skipped:`, e.message); } };
/* Dataset prose carries analyst shorthand and file paths. Clean every prose string once at load (identifier
   fields and single-token values such as channel ids are left alone, so lookups keep working). */
const SKIP_KEYS = new Set(['id', 'channel', 'kind', 'format', 'component', 'type', 'unit', 'style', 'source_url', 'source_urls', 'url', 'retrieval_status', 'nws_event', 'pp_territory_tier', 'county', 'state']);
const tidy = t => !/\s/.test(t) ? t : t
  .replace(/\s*\(deed feed in data\/sales\)/g, ' (county deed feed)').replace(/\(?deed feed data\/sales\/pp_sales_\*\)?/g, 'county deed records')
  .replace(/data\/sales\/pp_sales_[\w*{},|]*(?:\.json)?/g, 'county deed records').replace(/data\/sales\b/g, 'county deed feeds')
  .replace(/(?:data\/)?(?:research\/)?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\.json/g, (m, id) => (window.BSPFrame?.label?.(id)) || id.replace(/_/g, ' '))
  .replace(/\bPP's\b/g, "Punctual Pros'").replace(/\bPP’s\b/g, 'Punctual Pros’').replace(/\bPP\b/g, 'Punctual Pros').replace(/\bBSP\b/g, 'Broad Sky')
  .replace(/\bFH's\b/g, "Fair Harbor's").replace(/\bFH\b/g, 'Fair Harbor').replace(/\bLive\.nwsAlerts\b/g, 'live weather-alert').replace(/\bLive\.\w+/g, 'live')
  .replace(/(^|[\s/(=])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?=$|[\s;:),.=/])/g, (m, pre, id) => pre + id.replace(/_/g, ' '));
function cleanData(v, k) {
  if (typeof v === 'string') return SKIP_KEYS.has(k) || /^https?:/.test(v) ? v : tidy(v);
  if (Array.isArray(v)) return v.map(x => cleanData(x, k));
  if (v && typeof v === 'object') { const o = {}; for (const [kk, vv] of Object.entries(v)) o[kk] = cleanData(vv, kk); return o; }
  return v;
}
async function getJSON(path) { const r = await fetch(ROOT + path, { cache: 'force-cache' }); if (!r.ok) throw new Error(path + ' ' + r.status); return Data.decode(await r.json()); }

/* ── Snapshot of data/sales/pp_sales_{pa_a,pa_b,nj}.json (rows, generated 2026-09-24) ──
   count = arm's-length residential sales: use_type 'residential', price > $1,000, arms_length not false
   (NJ: SR1A usable flag = true). all = every priced transfer in the county window (meta.coverage.count).
   Same definition as the plan's ~2,300 PA / ~1,150 NJ, so the table and the plan reconcile.
   Loading the 13 MB files just for these counts would break the page-weight budget. */
const SALES_META = [
  { county: 'Lancaster', state: 'PA', from: '2025-09-02', to: '2026-08-24', count: 6508, all: 7283, status: 'ok' },
  { county: 'York', state: 'PA', from: '2025-09-02', to: '2026-09-16', count: 6744, all: 7885, status: 'ok' },
  { county: 'Cumberland', state: 'PA', from: '2025-09-02', to: '2026-08-27', count: 3679, all: 4427, status: 'ok' },
  { county: 'Dauphin', state: 'PA', from: '2025-09-02', to: '2026-07-28', count: 82, all: 227, status: 'partial', note: 'County site blocked after 262 of 7,810 parcel pages' },
  { county: 'Berks', state: 'PA', from: '2025-09-01', to: '2026-08-31', count: 5301, all: 6394, status: 'ok' },
  { county: 'Lebanon', state: 'PA', from: '2025-09-02', to: '2026-09-15', count: 2115, all: 2424, status: 'ok' },
  { county: 'Franklin', state: 'PA', from: '2024-08-01', to: '2025-12-17', count: 2161, all: 2711, status: 'stale', note: 'Public CAMA extract not refreshed after mid-2025; rate taken from the latest 16.5 months' },
  { county: 'Adams', state: 'PA', from: '2025-09-02', to: '2026-07-15', count: 1183, all: 1692, status: 'ok' },
  { county: 'Perry', state: 'PA', from: '2025-09-02', to: '2026-07-02', count: 423, all: 665, status: 'ok' },
  { county: 'Ocean', state: 'NJ', from: '2025-09-01', to: '2026-08-06', months: 9.5, count: 6669, all: 9501, status: 'lag', note: 'SR1A file dense through ~Jun 2026 (9.5 mo used)' },
  { county: 'Monmouth', state: 'NJ', from: '2025-09-01', to: '2026-06-26', months: 9.5, count: 5080, all: 7539, status: 'lag', note: 'SR1A file dense through ~Jun 2026 (9.5 mo used)' },
];
const DAUPHIN_NEIGHBOURS = ['Lancaster', 'York', 'Cumberland', 'Lebanon', 'Perry'];

/* ── NWS warnings actually issued for Punctual Pros counties, 2019–2025 ──
   Iowa Environmental Mesonet VTEC archive (json/vtec_events_byugc.php) for the 24 county + zone UGCs of the
   9 PA core and 2 NJ Horvath counties, retrieved 2026-10-06. terr = distinct warnings touching ≥1 county per year;
   county = average per county per year; usd = extra Phase 1 spend per year if the rule below fires in that county
   (base daily $ × county housing-unit share × uplift × days, overlapping days counted once). */
const VTEC = {
  retrieved: '2026-10-06', years: '2019–2025', url: 'https://mesonet.agron.iastate.edu/vtec/',
  playbook_extreme_cold_warning: { codes: 'EC.W, WC.W', terr: 0, county: 0, usd: 0, note: 'None issued 2019–2025 (incl. predecessor Wind Chill Warning). Cold Weather / Wind Chill Advisory: 1.1/yr, monitor only.' },
  playbook_winter_storm_warning: { codes: 'WS.W, BZ.W', terr: 5.1, county: 1.9, usd: 1308 },
  playbook_ice_storm_warning: { codes: 'IS.W', terr: 0.1, county: 0, usd: 18 },
  playbook_freeze_warning: { codes: 'FZ.W', terr: 7.3, county: 2.7, usd: 213 },
  playbook_extreme_heat_warning: { codes: 'EH.W, XH.W', terr: 2.7, county: 0.9, usd: 483 },
  playbook_heat_advisory: { codes: 'HT.Y', terr: 9.7, county: 3.8, usd: 849 },
  playbook_severe_thunderstorm_warning: { codes: 'SV.W, TO.W', terr: 179.4, county: 26.0, usd: 1414, note: 'Short polygon warnings, ~26 a year per county, so the rule is capped at once per county per week.' },
  playbook_flash_flood_warning: { codes: 'FF.W, FA.W, FL.W', terr: 54.7, county: 7.4, usd: 705 },
  playbook_high_wind_warning: { codes: 'HW.W', terr: 3.3, county: 0.9, usd: 172 },
  playbook_tropical_storm_warning: { codes: 'TR.W, HU.W, SS.W', terr: 0.6, county: 0.1, usd: 0, note: 'NJ only; Phase 1 (PA) spend is $0.' },
  total_usd: 4899,
  // test-window check: PA winter-type warnings (WS/BZ/IS/EC/WC.W) issued in the same calendar windows, 2019–2024
  window: { wk5: '0 of 6 years', wk2to8: '1 of 6 years', wk2to12: '4 of 6 years', janfeb: '22 of 28 PA winter warnings fell in Jan–Feb' },
};

/* ── Conservative case: what a PE reader should underwrite (all labelled assumptions) ── */
const CONS = {
  incr: { google_lsa: 0.5, paid_search_pmax: 0.5, meta_social: 0.5, ctv_zip_targeted: 0.75, new_mover_mail: 0.75, radio: 0.75 },
  incrNote: 'Share of attributed jobs that are truly new. LSA, branded search and Meta retargeting partly capture demand Punctual Pros would get anyway (40–60% haircut range; 50% used). CTV, mail and radio are judged on holdouts (25% haircut until measured).',
  gm: 0.40, fees: 0.075,
  feesNote: 'Franchise royalty 6% + brand fund ~1.2–1.5% of revenue (Punctual Pros public filings, est.)',
  fyRevenue: 22e6, fyNote: '~$22M FY2025 pro forma revenue (Punctual Pros public filings, est.; range $16–28M)',
  jobsPerTech: 45, techNote: 'assumption: ~2.2 jobs per technician-day × ~20.5 working days; replace with ServiceTitan',
  repairTicket: 1024, repairNote: '$1,024 average repair ticket used in the Voice AI case (Voice AI research)',
  moverPool: { mp_phase1_central_pa: 2300, mp_phase2_jersey_shore: 1150, mp_phase3_mid_atlantic: 3450 },
  holdout: 0.20, olderShare: 1 / 3, mailRate: 0.01, satRate: 0.005,
  mailNote: 'Mail drip = postcard #1 to every mover (less the 20% holdout) + postcard #2 to the ~1 in 3 pre-1980 buyers. Remaining pieces are saturation mail to older Tier-I homes at half the new-mover response (0.5%, assumption).',
};
const tier1 = { zips: 61, hu: 336002 };
function moverPieces(p) { const m = CONS.moverPool[p.id]; if (!m) return null; const sent = m * (1 - CONS.holdout); return Math.round(sent + sent * CONS.olderShare); }
function consOf(p) {
  const rows = p.channel_mix.map(c => {
    const f = CONS.incr[c.channel] ?? 0.75; let jobs = c.est_booked_jobs * f, note = `${Math.round(f * 100)}%`;
    if (c.channel === 'new_mover_mail' && c.est_pieces) {
      const pool = moverPieces(p) ?? c.est_pieces; const nm = Math.min(pool, c.est_pieces); const sat = Math.max(0, c.est_pieces - nm);
      const book = c.est_leads ? c.est_booked_jobs / c.est_leads : 0.44;
      jobs = (nm * CONS.mailRate + sat * CONS.satRate) * book * f; note = `${num(nm)} drip + ${num(sat)} sat. · ${Math.round(f * 100)}%`;
      return { c, f, jobs, rev: jobs * c.avg_ticket_usd, note, nm, sat };
    }
    return { c, f, jobs, rev: jobs * c.avg_ticket_usd, note };
  });
  const spend = p.monthly_budget_usd; const jobs = rows.reduce((a, r) => a + r.jobs, 0); const rev = rows.reduce((a, r) => a + r.rev, 0);
  const cm = CONS.gm - CONS.fees; const contrib = rev * cm - spend;
  const repRev = rows.reduce((a, r) => a + r.jobs * (r.c.avg_ticket_usd >= 1500 ? CONS.repairTicket : r.c.avg_ticket_usd), 0);
  const attrRev = p.expected_revenue_usd; const attrJobs = p.totals_est.booked_jobs;
  return { rows, spend, jobs, rev, cm, contrib, cpa: spend / jobs, roas: rev / spend, repContrib: repRev * cm - spend,
    attrJobs, attrRev, attrContrib: attrRev * cm - spend, fyShare: rev * 12 / CONS.fyRevenue, fyShareAttr: attrRev * 12 / CONS.fyRevenue,
    techs: jobs / CONS.jobsPerTech, techsAttr: attrJobs / CONS.jobsPerTech };
}
let P1_CTV = 15000; const D_P1_CTV = () => P1_CTV;
const signed = v => (v >= 0 ? '+' : '−') + money(Math.abs(v));
const monthsBetween = (a, b) => Math.max(1, (new Date(b) - new Date(a)) / (30.44 * 864e5));

const TILES = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16 };
const CH = {
  google_lsa: { label: 'Google Local Services Ads', short: 'LSA', color: '#18945c' },
  ctv_zip_targeted: { label: 'Connected TV (zip-targeted)', short: 'CTV', color: '#f26b1d' },
  paid_search_pmax: { label: 'Paid search + PMax', short: 'Search', color: '#1f8fd6' },
  new_mover_mail: { label: 'New-mover mail', short: 'Mail', color: '#7c4ddb' },
  meta_social: { label: 'Meta social', short: 'Meta', color: '#d6407f' },
  radio: { label: 'Radio (drive-time test)', short: 'Radio', color: '#f2a900' },
};
const FORMAT = { ctv15: 'CTV :15', ctv30: 'CTV :30', social_vertical: 'Social 9:16', display_300x250: 'Display 300×250', direct_mail_postcard: 'Postcard', lsa_copy: 'LSA copy', radio30: 'Radio :30', yard_sign: 'Yard sign', truck_wrap: 'Truck wrap' };

/* ── Icons + scene frames (CSS-rendered storyboard stills) ───────────────── */
const IC = {
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  van: '<path d="M2 16V7h11v9M13 10h4.5l3.5 3.5V16h-8"/><circle cx="6.5" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  home: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  drop: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  wave: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><circle cx="17" cy="7" r="3"/>',
  bottle: '<path d="M10 2h4v3l2 3v13H8V8l2-3z"/><path d="M8 13h8"/>',
};
const ICON_OF = { storm: 'snow', night: 'van', home: 'home', brand: 'clock', sun: 'sun', pipe: 'drop', bolt: 'bolt', shore: 'wave', clock: 'clock', fh: 'bottle' };
const svgI = k => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || IC.home}</svg>`;
function styleOf(text = '', fh = false) {
  const t = String(text).toLowerCase();
  if (/end card|brand card|super with|product carousel|product hero|qr end/.test(t)) return 'brand';
  if (fh) return 'fh';
  if (/pipe|faucet|sink|hose|sewer|drip|plumb|galvanized/.test(t)) return 'pipe';
  if (/thunderstorm|flicker|panel|surge|generator|electric/.test(t)) return 'bolt';
  if (/storm|snow|radar|frost|night exterior|heat advisory|dispatch board/.test(t)) return 'storm';
  if (/beach|shore|condenser|salt|surf|cedar/.test(t)) return 'shore';
  if (/\bvan\b|dusk|driveway/.test(t)) return 'night';
  if (/office|desk|kitchen|clock|phone showing|member card/.test(t)) return 'clock';
  if (/landmark|neighborhood|farmland|b-roll/.test(t)) return 'sun';
  return 'home';
}
function qrSVG(seed = 'pp') {
  let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const inF = (x, y) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
  const f = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  let r = ''; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (!inF(x, y) && rnd() > .52) r += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="-1 -1 23 23" role="img" aria-label="QR code placeholder" fill="#0b1f3a" shape-rendering="crispEdges"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/>${f(0, 0)}${f(14, 0)}${f(0, 14)}<path d="${r}"/></svg>`;
}
function scene(style, { ost = '', sub = '', tc = '', live = '', lock = '', qr = false, cls = '', note = '' } = {}) {
  return `<div class="scr sc-${style} ${cls}">${note ? `<span class="nos">${esc(note)}</span>` : ''}${svgI(ICON_OF[style])}${tc ? `<span class="tc">${esc(tc)}</span>` : ''}${live ? `<span class="live">${esc(live)}</span>` : ''}${lock ? `<span class="lock">${lock}</span>` : ''}${qr ? `<span class="qr">${qrSVG(qr)}</span>` : ''}${ost ? `<b class="ost">${esc(ost)}${sub ? `<small>${esc(sub)}</small>` : ''}</b>` : ''}</div>`;
}
const rulesOf = c => (Array.isArray(c.brand_rules) ? c.brand_rules : c.brand_rules ? [c.brand_rules] : []);
function brandOf(c) {
  if (c.kind === 'fh_appendix') return ['fh', 'Fair Harbor'];
  const r = rulesOf(c); const names = r.map(x => x.brand || '').join(' ') + ' ' + (c.title || '');
  if (r.length > 1) return ['oh', `${r.length} brands`];
  if (/franklin/i.test(names)) return ['bf', 'Benjamin Franklin Plumbing'];
  if (/sparky/i.test(names)) return ['ms', 'Mister Sparky'];
  return ['oh', 'One Hour Heating & Air'];
}

/* ── Live NWS context (shared by hero, display ad, map) ──────────────────── */
const ctx = { alerts: [], byCounty: new Map(), sim: false, zones: [], playbooks: [], listeners: [] };
const SIM_ALERT = { id: 'sim', event: 'Winter Storm Warning', severity: 'Moderate', areas: ['Lancaster, PA', 'York, PA'], zones: ['PAC071', 'PAC133'], simulated: true, ends: null };
const warnAliases = p => (p.aliases_and_related || []).map(a => a.replace(/\s*\(.*\)\s*$/, '').trim()).filter(a => /Warning$/.test(a));
// Ad rules fire on the plan's own event or a warning alias only. Watches and advisories (e.g. Wind Advisory) are monitor-only,
// which matches how the per-year counts in the event plan are built.
function playbookFor(ev) { return ctx.playbooks.find(p => p.nws_event === ev || warnAliases(p).includes(ev)); }
function matchAlerts(alerts) {
  const out = new Map(); const terr = ctx.zones.filter(z => ['core', 'horvath_nj'].includes(z.pp_territory_tier));
  for (const a of alerts) {
    const u = new Set(a.zones || []);
    for (const z of terr) {
      const hit = (z.all_ugcs || []).some(x => u.has(x)) || (a.areas || []).some(ar => ar.replace(/,.*$/, '').trim().toLowerCase() === z.county.toLowerCase() && (!a.state || a.state === z.state));
      if (hit) { if (!out.has(z.county)) out.set(z.county, []); out.get(z.county).push(a); }
    }
  }
  return out;
}
function activeByCounty() { return ctx.sim ? matchAlerts([...ctx.alerts, SIM_ALERT]) : ctx.byCounty; }
function topTrigger() {
  const m = activeByCounty(); let best = null;
  for (const [county, list] of m) for (const a of list) { const pb = playbookFor(a.event); if (pb && (!best || (a.simulated && !best.a.simulated))) best = { county, a, pb }; }
  if (!best) for (const [county, list] of m) { best = { county, a: list[0], pb: null }; break; }
  return best;
}
const notify = () => ctx.listeners.forEach(f => safe('listener', f));

const AD_RULE = {
  playbook_extreme_cold_warning: ['+50% CTV for 72 h · raise LSA cap', 'Storm Ready :15 + frozen-pipe 9:16'],
  playbook_winter_storm_warning: ['+50% CTV for 72 h · raise LSA cap', 'Storm Ready :15'],
  playbook_ice_storm_warning: ['+50% CTV for 72 h', 'Storm Ready :15 + Flicker :30'],
  playbook_freeze_warning: ['+25% Meta for 48 h', 'Frozen-pipe 9:16'],
  playbook_extreme_heat_warning: ['+50% CTV for 72 h', 'Members skip the line 9:16 + AC cut'],
  playbook_heat_advisory: ['+25% CTV for 48 h', 'Members skip the line 9:16'],
  playbook_severe_thunderstorm_warning: ['+30% CTV for 24 h, max once per county per week', 'Flicker :30 (surge/outage)'],
  playbook_flash_flood_warning: ['+30% search for 48 h', 'Ben Franklin sump/backup search ads'],
  playbook_high_wind_warning: ['+30% CTV for 48 h', 'Flicker :30 (generator)'],
  playbook_tropical_storm_warning: ['+50% CTV for 72 h (NJ zips)', 'Flicker :30 generator cut'],
};

/* ═════════════════════════════════ init ═════════════════════════════════ */
export async function init(deps) {
  ({ Data, Fmt, Live, esc } = deps);
  let ads, demand;
  try { [ads, demand] = await Promise.all([getJSON('data/research/pp_ads.json'), getJSON('data/research/pp_demand_model.json').catch(() => null)]); }
  catch (e) { $('#ctv-list').innerHTML = `<div class="sys-note sys-note--warn"><span>Could not load the Punctual Pros ad plan. Try reloading the page.</span></div>`; return mountChat(deps.Chat, null); }
  ads = cleanData(ads);
  const items = ads.items || []; const K = k => items.filter(i => i.kind === k); const byId = Object.fromEntries(items.map(i => [i.id, i]));
  ctx.zones = (demand?.items || []).filter(i => i.component === 'nws_zone');
  ctx.playbooks = (demand?.items || []).filter(i => i.component === 'event_playbook');
  const plans = K('media_plan'); const p1 = plans[0];
  P1_CTV = p1?.channel_mix?.find(c => c.channel === 'ctv_zip_targeted')?.monthly_usd || 15000;
  const D = { ads, items, K, byId, plans, p1, demand };

  safe('hero', () => hero(D));
  safe('baseline', () => baseline(D));
  safe('ctv', () => ctvSection(D));
  safe('social', () => social(D));
  safe('display', () => displayUnit(D));
  safe('mail', () => mail(D));
  safe('lsa', () => lsa(D));
  safe('radio', () => radio(D));
  safe('ooh', () => ooh(D));
  safe('guard', () => guardrails(D));
  safe('flows', () => flows(D));
  safe('playbook', () => playbookTable(D));
  safe('plan', () => mediaPlan(D));
  safe('calc', () => calculator(D));
  safe('platforms', () => platforms(D));
  safe('test', () => testPlan(D));
  safe('fh', () => fairHarbor(D));
  safe('sources', () => sources(D));
  safe('movers', () => moversTable());
  Data.load('pp_zips').then(z => safe('movers', () => moversTable(z))).catch(() => { });
  const chat = mountChat(deps.Chat, D);

  // live alerts → hero, display, alert list, map
  Promise.all([Live.nwsAlerts('PA').catch(() => []), Live.nwsAlerts('NJ').catch(() => [])]).then(([pa, nj]) => {
    ctx.alerts = [...pa, ...nj]; ctx.byCounty = matchAlerts(ctx.alerts); ctx.live = true; notify();
  }).catch(() => { ctx.live = false; notify(); });
  ctx.listeners.push(alertsList, heroLive);
  const simBtn = $('#sim-btn'); if (simBtn) simBtn.onclick = () => { ctx.sim = !ctx.sim; simBtn.setAttribute('aria-pressed', String(ctx.sim)); simBtn.textContent = ctx.sim ? 'Clear simulation' : 'Simulate a storm'; notify(); };
  renderMap(D).catch(e => { const m = $('#map'); if (m) m.innerHTML = `<div class="loading">Map unavailable right now.</div>`; console.warn('[ads] map', e); });
  return chat;
}


/* ── 1 · hero ────────────────────────────────────────────────────────────── */
function hero(D) {
  const p = D.p1; const t = p.totals_est || {}; const cs = consOf(p);
  const k = [[money(p.monthly_budget_usd), 'Monthly media budget', 'Phase 1 · Central PA'], [num(cs.jobs), 'Incremental booked jobs / mo', `upside: ${num(t.booked_jobs)} attributed`], [money(cs.cpa), 'Cost per incremental job', `upside: ${money(p.expected_cpa_usd)} attributed`], [signed(cs.contrib), 'Contribution after media / mo', `upside: ${signed(cs.attrContrib)} · ROAS ${num(p.model?.outputs?.roas, 1)}×`]];
  $('#kpis').innerHTML = k.map(([v, l, u]) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${l}</span><span class="sys-kpi-value">${v}<span class="sys-est">est.</span></span><span class="sys-kpi-sub">${u}</span></div>`).join('');
  const kn = $('#kpi-note'); if (kn) kn.innerHTML = `Conservative case for Phase 1 (Central PA, Nov 2026 – Apr 2027): attributed jobs cut for incrementality (LSA, search and Meta 50%; CTV and mail 75%), contribution after technician labour, materials and ~7.5% franchise fees. At this level the plan adds ~${pct(cs.fyShare)} to Punctual Pros’ ~$22M revenue and needs ~${num(cs.techs)} more technicians. Every figure is <span class="sys-est">est.</span> until the test reads it.`;
  // full thesis
  const pillars = $('.pillars');
  if (pillars && D.ads.meta?.strategy_sentences?.length) pillars.insertAdjacentHTML('afterend', `<details class="sys-card thesis"><summary>Read the full ten-point thesis</summary><ol>${D.ads.meta.strategy_sentences.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>`);
  // TV slideshow from the rendered spot spec
  const spot = D.byId.spot_storm_ready; const tv = $('#hero-tv'); if (!spot || !tv) return;
  const draw = () => {
    const tr = topTrigger();
    tv.innerHTML = spot.scenes.map((s, i) => {
      const first = i === 0; const head = first && tr ? `${tr.a.event}${tr.a.simulated ? ' (sim)' : ''}` : s.headline; const sub = first && tr ? `${tr.county} County · National Weather Service alert` : s.sub;
      return scene(s.style, { ost: head, sub, live: first ? (tr ? 'Live NWS' : 'NWS feed') : '', lock: s.cta ? 'ONE HOUR<br>HEATING &amp; AIR' : '', qr: s.cta ? 'storm' : false, cls: i === 0 ? 'on' : '' });
    }).join('') + '<i class="tv-prog" style="width:0"></i>';
  };
  draw(); ctx.listeners.push(draw);
  if (reduced()) return;
  let i = 0, t0 = Date.now(); const dur = spot.scenes.map(s => (s.duration_s || 3) * 900);
  const tick = () => {
    const frames = $$('.scr', tv); if (!frames.length) return;
    const el = Date.now() - t0; if (el > dur[i]) { i = (i + 1) % frames.length; t0 = Date.now(); }
    frames.forEach((f, j) => f.classList.toggle('on', j === i));
    const total = dur.reduce((a, b) => a + b, 0); const done = dur.slice(0, i).reduce((a, b) => a + b, 0) + Math.min(el, dur[i]);
    const bar = $('.tv-prog', tv); if (bar) bar.style.width = (done / total * 100).toFixed(1) + '%';
  };
  setInterval(tick, 200);
}
function heroLive() {
  const el = $('#hero-live'); if (!el) return;
  const m = activeByCounty(); const n = [...m.values()].reduce((a, l) => a + l.length, 0);
  if (ctx.live === undefined && !ctx.sim) return;
  if (n) { const tr = topTrigger(); el.classList.add('on'); el.innerHTML = `<span class="pulse"></span><span><b>${esc(tr.a.event)}</b>${tr.a.simulated ? ' (simulated)' : ''} in ${esc([...m.keys()].join(', '))}. ${tr.pb ? 'Storm flight would switch ON for those zips.' : 'Monitor only, no ad rule.'}</span>`; }
  else { el.classList.remove('on'); el.innerHTML = `<span class="pulse"></span><span>${ctx.live === false ? 'NWS feed unreachable; CTV runs at base weight.' : `No active NWS alerts in Punctual Pros’ 11 counties (checked ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}). CTV runs at base weight.`}</span>`; }
}

/* ── 1b · baseline: today vs Phase 1 ─────────────────────────────────────── */
function baseline(D) {
  const host = $('#baseline-body'); if (!host) return;
  const p = D.p1; const cs = consOf(p); const mix = p.channel_mix.map(c => `${(CH[c.channel] || {}).short || c.channel} ${num(c.share_pct)}%`).join(' · ');
  const ask = t => `<span class="ask">Request from Punctual Pros: ${t}</span>`;
  const fundLo = CONS.fyRevenue * 0.012 / 12, fundHi = CONS.fyRevenue * 0.015 / 12;
  const rows = [
    ['Marketing spend / mo (all sources)', ask('GL marketing lines + agency invoices, last 24 months'), `${money(p.monthly_budget_usd)} media`, 'Is the $50k new money or a re-allocation of today’s spend?'],
    ['Leads / mo by source', ask('ServiceTitan Marketing ROI report by campaign'), `${num(p.totals_est.leads)} attributed`, ''],
    ['Booked jobs / mo from marketing', ask('ServiceTitan calls → booked jobs by campaign'), `${num(cs.jobs)} incremental · ${num(p.totals_est.booked_jobs)} attributed`, ''],
    ['Cost per booked job', ask('spend ÷ booked jobs, by channel'), `${money(cs.cpa)} incremental · ${money(p.expected_cpa_usd)} attributed`, 'Better or worse than today decides whether Phase 1 is worth running.'],
    ['Channel mix', ask('current split (LSA, search, Angi/HomeAdvisor, mail, radio, other)'), mix, ''],
    ['Booking rate (calls → jobs)', ask('ServiceTitan call booking report'), `${pct(p.model.assumptions.lsa_book_rate.value, 1)} (LSA benchmark)`, 'ServiceTitan typical shop 42%; top performers 77–90%.'],
    ['Franchisor brand fund', `<b>~${money(fundLo)}–${money(fundHi)}/mo</b> <span class="sys-est">est.</span><span class="f">1.2–1.5% of ~$22M revenue (Punctual Pros public filings); plus 6% royalty</span>`, 'unchanged; not part of this budget', 'Brand-fund media already running in Punctual Pros’ DMAs must be netted out of the holdout read.'],
    ['Local advertising minimum / co-op', ask('franchise agreement: local-ad minimum, co-op funds, creative approval'), 'Phase 1 counts toward the minimum if eligible', ''],
  ];
  host.innerHTML = `<div class="tbl-wrap"><table class="t base-t"><thead><tr><th>Metric</th><th>Today</th><th>Phase 1 plan</th><th>Why it matters</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="num">${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table></div>
  <div class="asks"><h3>Four data requests for the first meeting with Punctual Pros management</h3><ol>
    <li><b>ServiceTitan Marketing ROI export</b>, last 24 months by campaign: spend, calls, booked jobs, revenue. Sets the baseline cost per booked job and the share of jobs LSA and branded search already capture.</li>
    <li><b>Job-level export by zip</b>: date, trade, repair vs replacement, ticket, technician hours. Gives booked jobs per 10k housing units for the holdout design and the real average ticket (the plan uses $1,870; the voice-AI case uses $1,024).</li>
    <li><b>Franchise agreement terms</b>: royalty and brand-fund rates, local advertising minimum, co-op funds, and the Authority Brands creative-approval process.</li>
    <li><b>Technician roster and utilisation</b> by trade and month: jobs per tech-day and open capacity in Nov–Feb. The conservative case needs ~${num(cs.techs)} more technicians; the attributed case ~${num(cs.techsAttr)}.</li>
  </ol></div>`;
}

/* ── 2 · creatives ───────────────────────────────────────────────────────── */
const RENDER_FOR = { cr_ctv15_storm_ready: 'spot_storm_ready', cr_ctv15_new_home: 'spot_new_home' };
function storyboard(c, { render = null, fh = false } = {}) {
  const beats = c.script || []; const dur = c.format === 'ctv30' ? 30 : c.format === 'ctv15' ? 15 : ((beats.at(-1)?.t_sec || 0) + 4);
  const [bk, bl] = brandOf(c);
  const frames = beats.map((b, i) => {
    const end = beats[i + 1]?.t_sec ?? dur; const st = styleOf(b.visual, fh); const endCard = i === beats.length - 1 && /end card|qr/i.test(b.visual || '');
    return `<figure class="frame">${scene(endCard ? 'brand' : st, { ost: b.on_screen_text || '', note: b.on_screen_text ? '' : 'No super · picture and VO only', tc: `0:${pad(b.t_sec)}–0:${pad(end)}`, qr: endCard ? c.id : false })}<figcaption><span class="vis">${esc(b.visual || '')}</span>${b.voiceover ? `<span class="vo"><i>VO</i>“${esc(b.voiceover)}”</span>` : ''}</figcaption></figure>`;
  }).join('');
  const tl = beats.map((b, i) => `<span style="width:${(((beats[i + 1]?.t_sec ?? dur) - b.t_sec) / dur * 100).toFixed(2)}%"></span>`).join('');
  const meta = [['Audience', c.audience], ['Call to action', c.cta], ['Offer', c.offer ? `${/illustrative/i.test(c.offer) ? '' : '<span class="note-ill">Illustrative · </span>'}${esc(c.offer)}` : null, true], ['Production', c.production_cost_estimate_usd != null ? `${money(c.production_cost_estimate_usd)} est. · ${esc(String(c.notes || ''))}` : null, true]].filter(m => m[1]);
  const src = c.source_url || c.source_urls?.[0];
  return `<article class="sys-card sb" id="sb-${esc(c.id)}">
    <div class="sb-head"><span class="bchip ${bk}">${esc(bl)}</span><span class="fchip">${esc(FORMAT[c.format] || c.format || '')}</span>${render ? '<span class="sys-est sys-est--illus">rendered animatic</span>' : ''}<h4>${esc(c.title)}</h4></div>
    ${c.hook ? `<p class="sb-hook">${esc(c.hook)}</p>` : ''}
    <div class="strip">${frames}</div>
    <div class="tl" aria-hidden="true">${tl}</div><div class="tl-cap"><span>0:00</span><span>${dur}s</span></div>
    <dl class="sb-meta">${meta.map(([k, v, raw]) => `<div><dt>${k}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join('')}</dl>
    <div class="sb-foot">${render ? `<button class="sys-btn sys-btn--primary sys-btn--sm" type="button" data-play="${esc(render.id)}">▶ Play sample</button>` : ''}<span class="src">${fh ? 'Reference' : 'Guarantee wording'}: ${ext(src)} · copy is original sample work</span></div>
    ${render ? `<div class="vid-slot" data-slot="${esc(render.id)}" hidden></div>` : ''}
  </article>`;
}
async function findRender(id) {
  for (const c of [id.replace(/_/g, '-'), id]) { try { const r = await fetch(`${ROOT}briefing/ads/${c}.mp4`, { method: 'HEAD', cache: 'no-store' }); if (r.ok) return c; } catch { } }
  return null;
}
function ctvSection(D) {
  const list = D.items.filter(i => i.kind === 'creative' && /^ctv/.test(i.format));
  const renders = Object.fromEntries(D.K('spot_render').map(r => [r.id, r]));
  $('#ctv-list').innerHTML = list.map(c => storyboard(c, { render: renders[RENDER_FOR[c.id]] || null })).join('');
  $$('[data-play]').forEach(btn => {
    const id = btn.dataset.play; const r = renders[id]; const slot = $(`[data-slot="${id}"]`); let file;
    const probe = findRender(id).then(f => { file = f; if (!f) { btn.textContent = '▶ Play sample (render missing)'; return; }
      // show the poster frame up front; the video file loads only when played
      slot.hidden = false; slot.innerHTML = `<div class="vid"><video controls playsinline preload="none" poster="${ROOT}briefing/ads/${f}.jpg" aria-label="${esc(r?.title || 'Sample spot')}"><source src="${ROOT}briefing/ads/${f}.mp4" type="video/mp4">Your browser cannot play MP4 video.</video></div>`;
      slot.querySelector('video').addEventListener('error', () => { if (!slot.querySelector('.sys-note')) slot.insertAdjacentHTML('afterbegin', `<div class="sys-note sys-note--warn"><span>The sample video failed to load. The storyboard above is the spec.</span></div>`); }, true); });
    btn.onclick = async () => {
      await probe; slot.hidden = false;
      const scenes = `<div class="vid-scenes"><b>Animatic spec</b> · ${(r.scenes || []).reduce((a, s) => a + (s.duration_s || 0), 0)} s · music: ${esc(r.music_mood || '')}<ol>${(r.scenes || []).map(s => `<li><b>${esc(s.headline)}</b> (${s.duration_s}s, ${esc(s.style)}): ${esc(s.sub)}</li>`).join('')}</ol><b>VO</b> “${esc(r.voice_text || '')}”</div>`;
      if (!file) { slot.innerHTML = `<div class="sys-note sys-note--warn"><span>The rendered sample for this spot is not in this build. The storyboard above is the full spec.</span></div>${scenes}`; return; }
      if (!slot.querySelector('.vid-scenes')) slot.querySelector('.vid')?.insertAdjacentHTML('beforeend', scenes);
      if (!slot.querySelector('video')) {
        slot.innerHTML = `<div class="vid"><video controls playsinline preload="metadata" poster="${ROOT}briefing/ads/${file}.jpg"><source src="${ROOT}briefing/ads/${file}.mp4" type="video/mp4">Your browser cannot play MP4 video.</video>${scenes}</div>`;
        const v = slot.querySelector('video'); v.addEventListener('error', () => { slot.insertAdjacentHTML('afterbegin', `<div class="sys-note sys-note--warn"><span>The sample video failed to load. The storyboard above is the spec.</span></div>`); }, true);
        v.play().catch(() => { });
      }
      btn.textContent = '▶ Replay sample'; const v = slot.querySelector('video'); if (v) { v.currentTime = 0; v.play().catch(() => { }); }
    };
  });
}
function phone(c, { fh = false, ui = {} } = {}) {
  const beats = c.script || []; const [bk, bl] = brandOf(c);
  const id = 'ph-' + c.id;
  return `<div class="phone-wrap"><div class="phone" aria-label="Vertical video mock: ${esc(c.title)}"><div class="phone-scr" id="${id}">
    <div class="phone-dots">${beats.map((_, i) => `<span class="${i === 0 ? 'on' : ''}"></span>`).join('')}</div>
    ${beats.map((b, i) => scene(styleOf(b.visual, fh), { ost: b.on_screen_text || '', cls: i === 0 ? 'on' : '' })).join('')}
    <div class="phone-rail" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="phone-ui"><b>${esc(ui.handle || (fh ? '@fairharbor' : '@punctualpros'))}</b>${esc(ui.caption || (beats[0]?.voiceover || '').slice(0, 64))}<span class="mk-cta">${esc(ui.cta || c.cta || 'Learn more')}</span></div>
  </div></div><div class="phone-cap"><span class="bchip ${bk}">${esc(bl)}</span><h4>${esc(c.title)}</h4><p>${esc(c.audience || '')}</p>${c.production_cost_estimate_usd != null ? `<p class="mut">${money(c.production_cost_estimate_usd)} est. production</p>` : ''}</div></div>`;
}
function cyclePhones() {
  if (reduced()) return;
  $$('.phone-scr').forEach(ph => { let i = 0; const fr = $$('.scr', ph), dots = $$('.phone-dots span', ph); if (fr.length < 2) return; setInterval(() => { i = (i + 1) % fr.length; fr.forEach((f, j) => f.classList.toggle('on', j === i)); dots.forEach((d, j) => d.classList.toggle('on', j <= i)); }, 2200); });
}
function social(D) {
  const v = D.items.filter(i => i.kind === 'creative' && i.format === 'social_vertical');
  $('#social-list').innerHTML = v.map(c => phone(c, { ui: { cta: c.cta?.split('/')[0].trim() } })).join('');
  cyclePhones();
}
function displayUnit(D) {
  const c = D.byId.cr_display_300x250; const host = $('#display-unit'); if (!c || !host) return;
  const draw = () => {
    const tr = topTrigger(); const alert = tr?.pb ? tr.a.event : null; const county = tr?.pb ? tr.county : null;
    host.innerHTML = `<div class="disp-wrap"><div class="disp" role="img" aria-label="Animated 300 by 250 display ad, three frames">
      <div class="f f1">${alert ? `<span class="tk">LIVE · NWS</span><h5>${esc(alert)} tonight</h5><p>${esc(county)} County</p>` : `<h5>Heat or cold, we’re on time.</h5><p>Default copy when no alert is active</p>`}</div>
      <div class="f f2"><h5>Techs staged in ${esc(county ? county + ' County' : 'Central PA')}</h5><p>Crews pre-positioned before demand spikes</p></div>
      <div class="f f3"><h5 style="font-size:20px">Always On Time... Or You Don’t Pay A Dime!®</h5><span class="mk-btn">Book now</span><span class="brandline">One Hour Heating &amp; Air Conditioning® · Southeast PA</span></div>
      <span class="ad">Ad</span></div>
      <div class="disp-notes"><dl>
        <div><dt>Tokens now</dt><dd><span class="token">{alert}</span> = ${alert ? `<b>${esc(alert)}</b>${tr.a.simulated ? ' (simulated)' : ''}` : '<i>none active → default copy</i>'}<br><span class="token">{county}</span> = ${county ? esc(county) : '<i>Central PA</i>'}</dd></div>
        <div><dt>Audience</dt><dd>${esc(c.audience)}</dd></div>
        <div><dt>Build</dt><dd>${esc(c.notes)} ${money(c.production_cost_estimate_usd)} est.</dd></div>
        <div><dt>Try it</dt><dd>Press <b>Simulate a storm</b> in the targeting map to see the live-token version.</dd></div>
      </dl></div></div>`;
  };
  draw(); ctx.listeners.push(draw);
}
const HOUSE = `<svg viewBox="0 0 200 150" aria-hidden="true"><path d="M20 75L100 20l80 55v72H20z" fill="#fff6ea"/><path d="M12 80L100 18l88 62" fill="none" stroke="#f26b1d" stroke-width="7" stroke-linejoin="round"/><rect x="82" y="92" width="36" height="55" rx="3" fill="#f26b1d"/><rect x="38" y="88" width="30" height="26" rx="2" fill="#ffd9a8"/><rect x="132" y="88" width="30" height="26" rx="2" fill="#ffd9a8"/><rect x="70" y="140" width="60" height="8" rx="2" fill="#0b1f3a" opacity=".5"/><g transform="translate(140 118)"><rect width="28" height="22" fill="#c98b4b"/><path d="M0 7h28" stroke="#a46d36" stroke-width="2"/></g><g transform="translate(152 104)"><rect width="22" height="16" fill="#d9a066"/><path d="M0 5h22" stroke="#a46d36" stroke-width="2"/></g></svg>`;
function mail(D) {
  const m1 = D.byId.cr_mail_newmover_1, m2 = D.byId.cr_mail_newmover_2; const host = $('#mail-list'); if (!host) return;
  const muni = 'Lititz', yr = 1962; const tf = D.ads.meta?.territory_facts || {};
  const card1 = m1 ? `<div><div class="pc-title"><span class="bchip oh">${esc(brandOf(m1)[1])}</span><span class="fchip">6×11 · day 7</span><h4>${esc(m1.title)}</h4></div>
    <div class="pc-row">
      <div class="pc r11"><span class="pc-lab">Front</span><div class="pc-front"><div class="pc-copy"><div><h5>Welcome to <em>${muni}</em>! Let’s meet your new home.</h5><div class="pc-sub">Heating · plumbing · electrical, checked by the on-time pros.</div></div><div class="pc-brands">One Hour Heating &amp; Air® · Benjamin Franklin Plumbing® · Mister Sparky®</div></div><div class="pc-art">${HOUSE}</div></div></div>
      <div class="pc r11"><span class="pc-lab">Back</span><div class="pc-back"><div class="l"><b class="h">Your new-home checkup</b><span>Know the age and condition of every system before winter.</span><ul><li>Furnace / AC tune-up</li><li>Water heater flush &amp; age check</li><li>Electrical panel safety look</li></ul><div class="offer"><b>New-neighbor offer:</b> multi-system checkup + first month of membership free <i>(illustrative; expires 60 days)</i></div><span class="promise">Always On Time... Or You Don’t Pay A Dime!®</span></div><div class="r"><span class="stamp">PRSRT<br>MKTG<br>US POSTAGE</span><div class="qrrow">${qrSVG('NM1')}<span data-raw>Scan: /welcome?c=NM1<br>or call <b>{tracking#}</b></span></div><div class="addr">The New Owners<br>1 {street}<br>${muni} PA 17543</div></div></div></div>
    </div><p class="pc-meta">${esc(m1.audience)} Personalised with <span class="token">{muni}</span> and system age from <span class="token">{year built}</span>. ${money(0.75, 2)} per piece all-in (assumption). ${esc(String(m1.notes || '').split('. ').slice(-1)[0])}</p></div>` : '';
  const card2 = m2 ? `<div><div class="pc-title"><span class="bchip ms">${esc(brandOf(m2)[1])}</span><span class="fchip">6×9 · day 45</span><h4>${esc(m2.title)}</h4></div>
    <div class="pc-row">
      <div class="pc r9"><span class="pc-lab">Front</span><div class="pc-front blue"><div class="pc-copy" style="grid-column:1/3"><div><div class="yr">${yr}</div><h5 style="margin-top:2cqw">Built in ${yr}? Some things deserve a <em>second look.</em></h5></div><div class="pc-brands">Mister Sparky® · Benjamin Franklin Plumbing®</div></div></div></div>
      <div class="pc r9"><span class="pc-lab">Back</span><div class="pc-back"><div class="l"><b class="h">Older-home safety inspection</b><ul><li>Panel &amp; breakers</li><li>Ungrounded outlets</li><li>Galvanized pipes</li><li>Water heater age</li></ul><div class="offer"><b>Inspection</b> with credit toward repairs <i>(illustrative)</i></div><span class="promise">America’s On-Time Electrician® · $5/min late, $300 max</span></div><div class="r"><span class="stamp">PRSRT<br>MKTG<br>US POSTAGE</span><div class="qrrow">${qrSVG('NM2')}<span data-raw>/older-home?c=NM2<br>offer ends {date}</span></div><div class="addr">Current Resident<br>{address}<br>York PA 17401</div></div></div></div>
    </div><p class="pc-meta">${esc(m2.notes || '')} Pre-1980 homes are ~${pct(tf.pa_older_stock_share_hu_weighted || .578)} of territory housing units (Punctual Pros ZIP-code model).</p></div>` : '';
  host.innerHTML = card1 + card2;
}
function lsa(D) {
  const c = D.byId.cr_lsa_copy; if (!c) return;
  $('#lsa-table').innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Element</th><th>Copy</th><th class="n">Chars</th></tr></thead><tbody>${c.script.map(s => { const n = (s.on_screen_text || '').length; const lim = /bio/i.test(s.visual) ? 750 : /sms/i.test(s.visual) ? 160 : null; return `<tr><td><b>${esc(s.visual.replace(/^LSA business bio/, 'Bio'))}</b></td><td>${esc(s.on_screen_text)}</td><td class="n ${lim && n > lim ? 'warn' : ''}">${n}${lim ? `<span class="cc"> / ${lim}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div><p class="fn">${esc(c.notes)}</p>`;
}
function radio(D) {
  const c = D.byId.cr_radio30; if (!c) return;
  $('#radio-script').innerHTML = `<div class="sys-card script">${c.script.map((s, i) => `<div class="line"><span class="tc2">0:${pad(s.t_sec)}</span><div>${s.visual ? `<span class="sfx">${esc(s.visual)}</span>` : ''}${s.voiceover ? esc(s.voiceover) : ''}</div></div>`).join('')}<p class="meta"><b>Audience:</b> ${esc(c.audience)}<br><b>Cost:</b> ${esc(c.notes)}</p></div>`;
}
function ooh(D) {
  const y = D.byId.cr_yard_sign, w = D.byId.cr_truck_wrap; const host = $('#ooh-list'); if (!host) return;
  const cls = ['oh', 'bf', 'ms'];
  const signs = y ? `<div><div class="signs">${y.script.map((s, i) => `<div class="sign ${cls[i] || 'oh'}"><div class="sign-face"><b>${esc(s.on_screen_text.replace(/\s+(One Hour|Benjamin|Mister).*$/, ''))}</b><div class="row"><small>${esc((s.on_screen_text.match(/(One Hour[^®]*®|Benjamin Franklin Plumbing®|Mister Sparky®[^]*$)/) || [''])[0].replace(/\s+Scan.*$/, ''))}</small>${qrSVG('yard' + i)}</div></div><div class="sign-legs" aria-hidden="true"></div></div>`).join('')}</div><p class="ooh-notes"><b>${esc(y.title)}.</b> ${esc(y.notes)}</p></div>` : '';
  const side = w?.script?.[0]?.on_screen_text || ''; const [l1, l2] = side.split(/\s{2,}/);
  const van = w ? `<div class="van-wrap"><div class="van"><svg viewBox="0 0 640 230" role="img" aria-label="Service van side with wrap line: ${esc(side)}"><path d="M30 182V60q0-20 20-20h372l70 10 70 62 40 16q14 6 14 22v32z" fill="#fff" stroke="#13202f" stroke-width="3"/><path d="M426 46l64 9 60 52H426z" fill="#cfe3f5" stroke="#13202f" stroke-width="3"/><text x="52" y="80" font-family="Inter,sans-serif" font-weight="800" font-size="27" fill="#0b1f3a">Always On Time...</text><text x="52" y="112" font-family="Inter,sans-serif" font-weight="800" font-size="27" fill="#f26b1d">Or You Don’t Pay A Dime!®</text><text x="52" y="134" font-family="Inter,sans-serif" font-weight="600" font-size="14" fill="#263a50">${esc(l2 || '')}</text><rect x="30" y="144" width="586" height="26" fill="#0b1f3a"/><text x="200" y="162" font-family="Inter,sans-serif" font-weight="800" font-size="13" fill="#fff" letter-spacing="1">ONE HOUR HEATING &amp; AIR CONDITIONING®</text><circle cx="130" cy="186" r="28" fill="#13202f"/><circle cx="130" cy="186" r="11" fill="#9aa5b4"/><circle cx="520" cy="186" r="28" fill="#13202f"/><circle cx="520" cy="186" r="11" fill="#9aa5b4"/></svg></div>
    <div class="doors">${w.script.slice(1).map((s, i) => `<div class="door ${cls[i] || 'oh'}"><small>${esc(s.visual)}</small><span>${esc(s.on_screen_text)}</span></div>`).join('')}</div><p class="ooh-notes"><b>${esc(w.title)}.</b> ${esc(w.notes)}</p></div>` : '';
  host.innerHTML = `<div class="ooh">${signs}${van}</div>`;
}
function guardrails(D) {
  const seen = new Map();
  for (const c of D.items.filter(i => i.kind === 'creative')) for (const r of rulesOf(c)) if (r.brand && !seen.has(r.brand)) seen.set(r.brand, r);
  const k = b => /franklin/i.test(b) ? 'bf' : /sparky/i.test(b) ? 'ms' : 'oh';
  $('#guard-list').innerHTML = [...seen.values()].map(r => `<article class="sys-card guard"><span class="bchip ${k(r.brand)}">${esc(r.brand)}</span><p class="promise">${esc(r.promise_exact || '')}</p><p class="terms">${esc(r.promise_terms || '')}</p><ul>${(r.do || []).slice(0, 4).map(x => `<li class="do">${esc(x)}</li>`).join('')}${(r.dont || []).slice(0, 4).map(x => `<li class="dont">${esc(x)}</li>`).join('')}</ul>${r.source_url ? `<p class="fn">Source: ${ext(r.source_url)}</p>` : ''}</article>`).join('');
}

/* ── 3 · targeting ───────────────────────────────────────────────────────── */
/* Formula names are dataset keys; show them as plain words. */
const FX_NAME = { booked_jobs: 'Booked jobs', expected_revenue_usd: 'Expected revenue ($)', expected_cpa_usd: 'Cost per booked job ($)', gross_profit_usd: 'Gross profit ($)', roas: 'Return on ad spend', membership_adds: 'Membership adds', membership_annual_value_usd: 'Membership value a year ($)' };
const fxName = k => FX_NAME[k] || (s => s.charAt(0).toUpperCase() + s.slice(1))(String(k).replace(/_usd$/, ' ($)').replace(/_/g, ' '));
function flows(D) {
  const tf = D.ads.meta?.territory_facts || {}; const pb = ctx.playbooks.find(p => p.id === 'playbook_extreme_cold_warning'); const ws = ctx.playbooks.find(p => p.id === 'playbook_winter_storm_warning');
  const mul = ws?.expected_call_volume_multiplier || pb?.expected_call_volume_multiplier || {};
  $('#flow-nws').innerHTML = [
    [`The National Weather Service issues an alert`, `Polled every 3 minutes for PA and NJ. Winter Storm Warnings arrive ${esc(ws?.lead_time || '12–36 h')} ahead.`, 'T−36 h'],
    [`Alert zone codes → Punctual Pros county`, `11 counties mapped in the Punctual Pros demand model, e.g. Lancaster = PAC071 / PAZ066, Ocean = NJC029 / NJZ020.`, ''],
    [`The weather-response plan sets the expected call surge`, `Winter Storm Warning (~${num(VTEC.playbook_winter_storm_warning.county, 1)} a year per county): HVAC ${mul.HVAC ? mul.HVAC.join('–') : '1.2–1.6'}×, plumbing ${mul.Plumbing ? mul.Plumbing.join('–') : '—'}× (assumption, calibrate on ServiceTitan).`, ''],
    [`Rules fire for that county’s zips only`, `CTV +50% for 72 h, Storm Ready :15 swapped in, LSA weekly cap raised, frozen-pipe 9:16 boosted on Meta. Display tokens fill {alert} and {county}.`, 'T−24 h'],
    [`Read against a control`, `Pre-registered before launch: the 9 PA counties are randomised 5 rules-on / 4 rules-off for all of Phase 1. Every qualifying warning is a test event; compare booked jobs per 10k housing units in the 72 h after it. Winter warnings are rare before January (${esc(VTEC.window.janfeb)}), so the read accumulates over the season rather than in one test week.`, 'T+72 h'],
  ].map(([b, t, w]) => `<li><b>${b}${w ? `<span class="when">${w}</span>` : ''}</b>${t}</li>`).join('');
  $('#flow-deed').innerHTML = [
    [`Deed recorded at the county`, `County deed feeds: 9 PA counties + Ocean/Monmouth NJ, ~${num(tf.pa_core_new_movers_per_month_est || 2300)} PA and ~${num(tf.nj_new_movers_per_month_est || 1150)} NJ arm’s-length residential buyers a month (est., floor; see the county table).`, 'Day 0'],
    [`Filter, suppress, hold out`, `Arm’s-length residential only. Addresses already in ServiceTitan are suppressed, and ${pct(CONS.holdout)} are held out at random; bookings are pooled across the season for the lift read.`, ''],
    [`Postcard #1: Welcome (6×11)`, `Multi-system checkup offer, a QR code to a personal welcome page, unique tracking number.`, 'Day 7'],
    [`CTV household match`, `Address list uploaded where the company supports it (Universal Ads custom lists, Vibe CRM upload), so the same household sees “New Home, New Comfort”.`, 'Day 7–60'],
    [`Postcard #2: Older-home safety (6×9)`, `Only for pre-1980 homes (~1 in 3 PA sales in the feed) that did not respond to #1.`, 'Day 45'],
    [`Membership follow-up + match-back`, `SMS/email if booked (not mail). Response = any booking within 90 days, matched to ServiceTitan by address. Mail volume per mover: 1 postcard, or 2 for pre-1980 homes, so ~${num(moverPieces(D.p1))} drip pieces a month in PA.`, 'Day 90'],
  ].map(([b, t, w]) => `<li><b>${b}${w ? `<span class="when">${w}</span>` : ''}</b>${t}</li>`).join('') + `<li><b>Hitting the 30-day window</b>PA parcel feeds lag the recorder by 1–5 weeks (Lancaster, York and Cumberland meta caveats), so a weekly pull plus a 7-day print SLA puts card #1 in the mailbox within ~30 days of closing. NJ’s state SR1A file lags 3–4 months, so Horvath needs a county recorder or title-data feed for the same SLA.</li>`;
}
function playbookTable() {
  const host = $('#playbook-table'); if (!host || !ctx.playbooks.length) { if (host) host.innerHTML = '<p class="fn">The Punctual Pros demand model is not available right now.</p>'; return; }
  const m = r => r ? `${r[0]}–${r[1]}×` : '—';
  const yr = v => v == null ? '—' : v === 0 ? '0' : num(v, 1);
  host.innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>NWS warning</th><th>Lead time</th><th class="n">HVAC</th><th class="n">Plumbing</th><th class="n">Electrical</th><th class="n">Warnings / yr<span class="f">any Punctual Pros county</span></th><th class="n">Per county / yr</th><th>Proposed ad rule</th><th class="n">Phase 1 $ / yr</th><th>Creative swapped in</th></tr></thead><tbody>${ctx.playbooks.map(p => { const mm = p.expected_call_volume_multiplier || {}; const ar = AD_RULE[p.id] || ['Monitor', '—']; const v = VTEC[p.id] || {}; const wa = warnAliases(p); return `<tr><td><b>${esc(p.nws_event)}</b>${wa.length ? `<span class="f">incl. ${esc(wa.slice(0, 2).join(', '))}</span>` : ''}${v.codes ? `<span class="f">VTEC ${esc(v.codes)}</span>` : ''}</td><td>${esc(p.lead_time || '—')}</td><td class="n">${m(mm.HVAC)}</td><td class="n">${m(mm.Plumbing)}</td><td class="n">${m(mm.Electrical)}</td><td class="n">${yr(v.terr)}</td><td class="n">${yr(v.county)}</td><td>${esc(ar[0])}${v.note ? `<span class="f" style="font-family:var(--sans)">${esc(v.note)}</span>` : ''}</td><td class="n">${v.usd != null ? money(v.usd) : '—'}</td><td>${esc(ar[1])}</td></tr>`; }).join('')}</tbody>
  <tfoot><tr><td colspan="8">All rules together, Phase 1 PA weights <span class="sys-est">est.</span></td><td class="n">${money(VTEC.total_usd)}</td><td>≈ ${pct(VTEC.total_usd / (D_P1_CTV() * 12), 1)} of annual CTV</td></tr></tfoot></table></div>
  <p class="fn">Warning counts are NWS issuances from the Iowa Environmental Mesonet VTEC archive (${esc(VTEC.years)}, ${ext(VTEC.url, 'mesonet.agron.iastate.edu')}, retrieved Oct 6, 2026) for the county and forecast-zone codes of the 9 PA core and 2 NJ counties. They replace the earlier NOAA Storm Events damage-episode counts, which measured damage reports, not alerts. Watches and advisories (e.g. Wind Advisory, Freeze Watch) are monitor-only. Phase 1 $ / yr = base daily channel spend × county share of core housing units × uplift × days on, with overlapping days counted once. The triggers re-time spend; at ~${money(Math.round(VTEC.total_usd / 100) * 100)} a year they are not a budget line. Call multipliers come from the Punctual Pros demand model and are labelled assumptions to calibrate on ServiceTitan.</p>`;
}
function moversRows(zips) {
  const hu = {}; if (zips) for (const z of zips) { const k = `${String(z.county || '').replace(/ County$/, '')}|${z.state}`; hu[k] = (hu[k] || 0) + (z.housing_units || 0); }
  const rows = SALES_META.map(s => { const months = s.months || monthsBetween(s.from, s.to); const perMo = s.count / months; const h = hu[`${s.county}|${s.state}`] || null; return { ...s, months, perMo, hu: h, per1k: h && s.status !== 'partial' ? perMo / h * 1000 : null }; });
  const nb = rows.filter(r => DAUPHIN_NEIGHBOURS.includes(r.county)); const nbHU = nb.reduce((a, r) => a + (r.hu || 0), 0);
  const rate = nbHU ? nb.reduce((a, r) => a + r.perMo, 0) / nbHU : 0.0027; const d = rows.find(r => r.county === 'Dauphin');
  if (d) d.est = (d.hu || 126112) * rate;
  return rows;
}
function moversTable(zips) {
  const all = moversRows(zips); const rows = all.slice().sort((a, b) => (b.per1k ?? -1) - (a.per1k ?? -1)); const max = Math.max(...rows.map(r => r.per1k || 0)) || 1;
  const pa = all.filter(r => r.state === 'PA' && r.status !== 'partial').reduce((a, r) => a + r.perMo, 0); const nj = all.filter(r => r.state === 'NJ').reduce((a, r) => a + r.perMo, 0);
  const dau = all.find(r => r.county === 'Dauphin'); const allPA = all.filter(r => r.state === 'PA' && r.status !== 'partial').reduce((a, r) => a + r.all / r.months, 0);
  $('#movers-table').innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>County</th><th class="n">Buyers / mo</th><th class="n">per 1k HU</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.county)}</b> <span class="cc">${r.state}</span>${r.status !== 'ok' ? `<span class="f" title="${esc(r.note || '')}">${r.status === 'partial' ? '⚠ partial feed' : r.status === 'stale' ? '⚠ stale window' : 'state file lag'}</span>` : ''}</td><td class="n">${r.status === 'partial' ? `${num(r.perMo)}<span class="f">est. ~${num(r.est)} not counted</span>` : num(r.perMo)}</td><td class="n">${r.per1k != null ? `<span class="bar-in" style="width:${Math.round(r.per1k / max * 46)}px"></span>${num(r.per1k, 1)}` : '—'}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td>PA counted (8 counties)</td><td class="n">${num(pa)}</td><td></td></tr><tr><td>NJ Ocean + Monmouth</td><td class="n">${num(nj)}</td><td></td></tr></tfoot></table></div>
  <p class="fn">Buyers / mo = arm’s-length residential sales (residential use, price &gt; $1,000, not flagged non-arm’s-length) ÷ months in each county’s window, from Punctual Pros deed records (PA and NJ); the same definition as the plan. <b>PA:</b> the 8 complete feeds count ~${num(pa)}/mo, which is the plan’s ~2,300. Dauphin’s feed stopped after 262 parcel pages, so it is left out; at its neighbours’ rate it would add ~${num(dau?.est)}/mo (~${num(pa + (dau?.est || 0))} in all). The plan’s 2,300 is therefore a floor, not an upward adjustment. Counting every priced transfer instead (incl. commercial and land) gives ~${num(allPA)}/mo. <b>NJ:</b> whole-county count is ~${num(nj)}/mo over 9.5 dense months; the plan uses ~1,150 (about ${pct(1 - 1150 / nj)} lower), pending a zip-level split of Horvath’s service area. HU = housing units summed from the Punctual Pros ZIP-code model.</p>`;
}
const DENS = ['#fde7d6', '#fbc6a0', '#f79a62', '#ee7330', '#c9530f'];
async function renderMap(D) {
  const el = $('#map'); if (!el) return;
  const L = await waitFor(() => window.L, 12000); if (!L) { el.innerHTML = '<div class="loading">Map library (Leaflet) did not load.</div>'; return; }
  const map = L.map(el, { center: [40.2, -76.0], zoom: 8, scrollWheelZoom: false, preferCanvas: true });
  L.tileLayer(TILES.url, { attribution: TILES.attr, maxZoom: TILES.maxZoom, maxNativeZoom: TILES.maxZoom }).addTo(map);
  L.tileLayer(TILES.ref, { maxZoom: TILES.maxZoom, maxNativeZoom: TILES.maxZoom, pane: 'shadowPane', opacity: .85 }).addTo(map);
  map.fitBounds([[39.6, -78.1], [40.75, -73.95]]);
  const zcls = () => el.classList.toggle('zlo', map.getZoom() < 9); map.on('zoomend', zcls); zcls();
  setTimeout(() => map.invalidateSize(), 120);
  const zips = await Data.load('pp_zips').catch(() => null);
  const mrows = moversRows(zips); const dens = Object.fromEntries(mrows.map(r => [r.county, r]));
  const vals = mrows.map(r => r.per1k).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  const q = p => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const breaks = [q(.2), q(.4), q(.6), q(.8)];
  const colorOf = v => v == null ? '#e5e7eb' : DENS[breaks.filter(b => v > b).length];
  // counties from api.weather.gov zone geometry
  const terr = ctx.zones.filter(z => ['core', 'horvath_nj'].includes(z.pp_territory_tier));
  const layers = {};
  const style = county => { const on = activeByCounty().has(county); const d = dens[county]; return { color: on ? '#d23c35' : '#0b1f3a', weight: on ? 3 : 1.2, dashArray: on ? '6 4' : null, fillColor: on ? '#d23c35' : colorOf(d?.per1k), fillOpacity: on ? .32 : .38 }; };
  await Promise.all(terr.map(async z => {
    try {
      const r = await fetch(`https://api.weather.gov/zones/county/${z.nws_county_ugc}`); if (!r.ok) return; const g = await r.json(); if (!g.geometry) return;
      const d = dens[z.county];
      layers[z.county] = L.geoJSON(g, { style: () => style(z.county) }).addTo(map).bindTooltip(`${z.county}`, { permanent: true, direction: 'center', className: 'cty' }).bindPopup(() => `<b>${esc(z.county)} County, ${z.state}</b><br>${d ? (d.status === 'partial' ? `Deed feed partial (${num(d.perMo)}/mo counted; est. ~${num(d.est)}/mo)` : `${num(d.perMo)} arm’s-length home buyers / mo · ${num(d.per1k, 1)} per 1k housing units`) : ''}<br>NWS: ${esc(z.nws_county_ugc)} / ${esc((z.nws_forecast_zone_ugcs || []).join(', '))}<br>${activeByCounty().has(z.county) ? `<b class="pop-alert">Alert active: ${esc(activeByCounty().get(z.county).map(a => a.event).join(', '))} → storm flight ON</b>` : 'No active alert → base weight'}`);
      layers[z.county].bringToBack();
    } catch { }
  }));
  // zips
  if (zips) {
    const core = zips.filter(z => z.service_territory_flag === 1 && z.lat && z.lon);
    const nj = zips.filter(z => z.state === 'NJ' && /^(Ocean|Monmouth) County$/.test(z.county) && z.lat && z.lon);
    const tierCol = t => t === 'Tier I' ? (getComputedStyle(document.body).getPropertyValue('--co').trim() || '#f08a3c') : t === 'Tier II' ? '#1d3b66' : '#8a96a8';
    for (const z of core) L.circleMarker([z.lat, z.lon], { radius: 2.5 + Math.sqrt(z.housing_units || 0) / 30, color: '#fff', weight: 1, fillColor: tierCol(z.practical_priority_tier), fillOpacity: .9 }).addTo(map).bindPopup(`<b>${esc(z.zip)} · ${esc(z.city || '')}</b><br>${esc(z.county)} · ${esc(z.practical_priority_tier || '')}<br>${num(z.housing_units)} housing units · ${pct(z.old_housing_share)} older stock<br>${num(z.recent_owner_moves)} recent owner moves (ACS)`);
    for (const z of nj) L.circleMarker([z.lat, z.lon], { radius: 2 + Math.sqrt(z.housing_units || 0) / 34, color: '#fff', weight: 1, fillColor: '#11a3b5', fillOpacity: .85 }).addTo(map).bindPopup(`<b>${esc(z.zip)} · ${esc(z.city || '')}</b><br>${esc(z.county)}, NJ · Horvath territory<br>${num(z.housing_units)} housing units`);
  }
  $('#map-legend').innerHTML = `<span><i class="sw" style="background:var(--co);border-radius:50%"></i>Tier I ZIP</span><span><i class="sw" style="background:#1d3b66;border-radius:50%"></i>Tier II</span><span><i class="sw" style="background:#8a96a8;border-radius:50%"></i>Tier III</span><span><i class="sw" style="background:#11a3b5;border-radius:50%"></i>Horvath NJ ZIP</span><span>New movers / 1k HU<span class="ramp">${DENS.map(c => `<i style="background:${c}"></i>`).join('')}</span>${breaks[0] != null ? `${num(vals[0], 1)}–${num(vals.at(-1), 1)}` : ''}</span><span><i class="sw" style="background:#fdeceb;border:2px dashed #d23c35"></i>Active NWS alert → storm flight on</span>`;
  const restyle = () => { for (const [c, l] of Object.entries(layers)) { l.setStyle(style(c)); const tt = l.getTooltip(); if (tt) { const on = activeByCounty().has(c); tt.options.className = on ? 'cty alert' : 'cty'; l.closeTooltip(); l.unbindTooltip(); l.bindTooltip(on ? `${c} · ON` : c, { permanent: true, direction: 'center', className: on ? 'cty alert' : 'cty' }); } } };
  ctx.listeners.push(restyle); restyle();
  const fitT = () => { const ls = Object.values(layers); if (ls.length) map.fitBounds(L.featureGroup(ls).getBounds(), { padding: [18, 18] }); };
  map.invalidateSize(); fitT(); setTimeout(() => { map.invalidateSize(); fitT(); }, 450);
}
function alertsList() {
  const host = $('#alerts-list'); if (!host) return;
  const m = activeByCounty(); const seen = new Map();
  for (const [county, list] of m) for (const a of list) { const k = a.id || a.event; if (!seen.has(k)) seen.set(k, { a, counties: [] }); seen.get(k).counties.push(county); }
  if (!seen.size) { host.innerHTML = `<div class="calm"><b>No active alerts</b> for Punctual Pros’ 11 counties${ctx.live === false ? ' (feed unreachable)' : ''}. ${ctx.alerts.length ? `${num(ctx.alerts.length)} alerts statewide in PA/NJ, none touching Punctual Pros zones.` : ''} All zips run at base CTV weight. Press <b>Simulate a storm</b> to see the trigger.</div>`; return; }
  host.innerHTML = [...seen.values()].slice(0, 6).map(({ a, counties }) => { const pb = playbookFor(a.event); const rule = pb ? AD_RULE[pb.id] : null; return `<div class="alert-item ${a.simulated ? 'sim' : ''}"><b>${esc(a.event)}</b>${a.simulated ? ' · simulated' : ''} · ${esc(counties.join(', '))}${a.ends ? ` · until ${esc(new Date(a.ends).toLocaleString([], { weekday: 'short', hour: 'numeric' }))}` : ''}<span class="act">${rule ? `→ ${esc(rule[0])} · ${esc(rule[1])}` : '→ monitor only (no growth plan)'}</span></div>`; }).join('');
}

/* ── 4 · media plan ──────────────────────────────────────────────────────── */
const ASSUMP_LABEL = { trade_mix: 'Trade mix', lsa_cpl_usd: 'LSA cost per lead', lsa_book_rate: 'LSA book rate', avg_ticket_usd: 'Avg ticket (LSA/CTV/search)', search_cpl_usd: 'Search CPL', search_book_rate: 'Search book rate', ctv_cpm_usd: 'CTV CPM', ctv_cost_per_visit_usd: 'CTV cost per site visit', visit_to_lead: 'Visit → lead', ctv_frequency_per_month: 'CTV frequency / month', mail_cost_per_piece_usd: 'Mail cost per piece', mail_lead_rate_per_piece: 'Mail lead rate per piece', mail_book_rate: 'Mail book rate', mail_avg_ticket_usd: 'Mail avg ticket', meta_cpl_usd: 'Meta CPL', meta_book_rate: 'Meta book rate', meta_avg_ticket_usd: 'Meta avg ticket', radio_cpl_usd: 'Radio CPL', gross_margin: 'Gross margin', membership_attach: 'Membership attach', membership_price_usd_month: 'Membership price / mo' };
const fmtAssump = (k, v) => typeof v === 'object' && v ? Object.entries(v).map(([a, b]) => `${a} ${pct(b)}`).join(' · ') : /usd/.test(k) ? money(v, v < 10 ? 2 : 0) : /rate|attach|margin|visit_to_lead/.test(k) ? pct(v, v < .1 ? 2 : 1) : num(v, 2);
const phaseName = p => String(p.phase || '').replace(/^Phase\s*\d+\s*-\s*/, '');
function mediaPlan(D) {
  const P = D.plans; if (!P.length) return;
  const sub = (v, t) => `<span class="f">${t} ${v}</span>`;
  $('#plan-compare').innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Phase</th><th>Months</th><th class="n">Budget / mo</th><th class="n">Booked jobs<span class="f">incremental</span></th><th class="n">Cost / job<span class="f">incremental</span></th><th class="n">Revenue / mo<span class="f">incremental</span></th><th class="n">ROAS<span class="f">incremental</span></th><th class="n">Contribution after media</th><th class="n">Annual revenue<span class="f">% of ~$22M FY</span></th><th class="n">Techs needed</th></tr></thead><tbody>${P.map((p, i) => { const c = consOf(p); return `<tr><td><b>Phase ${i + 1}</b> · ${esc(phaseName(p).split('(')[0])}</td><td>${esc(p.months[0])} → ${esc(p.months.at(-1))}</td><td class="n">${money(p.monthly_budget_usd)}</td><td class="n"><b>${num(c.jobs)}</b>${sub(num(p.totals_est.booked_jobs), 'attributed')}</td><td class="n"><b>${money(c.cpa)}</b>${sub(money(p.expected_cpa_usd), 'attributed')}</td><td class="n">${money(c.rev)}${sub(money(p.expected_revenue_usd), 'attributed')}</td><td class="n">${num(c.roas, 1)}×${sub(num(p.model?.outputs?.roas, 1) + '×', 'attributed')}</td><td class="n"><b>${signed(c.contrib)}</b>${sub(signed(c.attrContrib), 'attributed')}</td><td class="n">${pct(c.fyShare)}${sub(pct(c.fyShareAttr), 'attributed')}</td><td class="n">~${num(c.techs)}${sub('~' + num(c.techsAttr), 'attributed')}</td></tr>`; }).join('')}</tbody></table></div><p class="fn">All outputs <span class="sys-est">est.</span>. <b>Incremental</b> = attributed jobs × incrementality (LSA, search, Meta 50%; CTV, mail, radio 75%), with mail split into the new-mover drip and lower-response saturation pieces. <b>Contribution</b> = revenue × (40% gross margin after technician labour and materials − ${pct(CONS.fees, 1)} franchise royalty and brand fund) − media. <b>Annual revenue %</b> = 12 × monthly revenue ÷ ${esc(CONS.fyNote)}; Phase 3 also covers add-on territories, so its base will be larger. <b>Techs</b> = jobs ÷ ${CONS.jobsPerTech} per technician-month (${esc(CONS.techNote)}). Phase 2 starts only if the Phase 1 read beats the conservative case. Phase 3 scales only channels whose measured incremental cost per job beats plan by ≥20%.</p>`;
  const tabs = $('#plan-tabs');
  tabs.innerHTML = P.map((p, i) => `<button role="tab" type="button" id="tab-${i}" aria-selected="${i === 0}" aria-controls="plan-body" data-i="${i}">Phase ${i + 1} · ${esc(phaseName(p).split(' (')[0].split(' - ')[0])}</button>`).join('');
  const show = i => { $$('button', tabs).forEach((b, j) => b.setAttribute('aria-selected', String(j === i))); $('#plan-body').setAttribute('aria-labelledby', 'tab-' + i); $('#plan-body').innerHTML = planBody(P[i], i); };
  tabs.onclick = e => { const b = e.target.closest('button[data-i]'); if (b) show(+b.dataset.i); };
  tabs.onkeydown = e => { if (!/Arrow(Left|Right)/.test(e.key)) return; const cur = $$('button', tabs).findIndex(b => b.getAttribute('aria-selected') === 'true'); const n = (cur + (e.key === 'ArrowRight' ? 1 : -1) + P.length) % P.length; show(n); $$('button', tabs)[n].focus(); };
  show(0);
}
const fixMeasure = m => String(m)
  .replace(/15% of Tier-I zips held dark for 8 weeks/, '~30 of 61 Tier-I zips held dark as matched pairs for 12 weeks (see the power check)')
  .replace(/vs 10% random holdout of new movers/, 'vs a 20% random holdout of new movers, pooled over the season')
  .replace(/^Primary KPI: cost per booked job/, 'Primary KPI: cost per incremental booked job');
function planBody(p, i) {
  const o = p.model?.outputs || {}; const t = p.totals_est || {}; const A = p.model?.assumptions || {};
  const cs = consOf(p); const consBy = Object.fromEntries(cs.rows.map(r => [r.c.channel, r]));
  const minis = [[money(p.monthly_budget_usd), 'Budget / mo'], [`${num(cs.jobs)} <small>/ ${num(t.booked_jobs)}</small>`, 'Jobs: incremental / attributed'], [`${money(cs.cpa)} <small>/ ${money(p.expected_cpa_usd)}</small>`, 'Cost / job: incr. / attr.'], [signed(cs.contrib), 'Contribution after media'], [money(p.expected_revenue_usd), 'Attributed revenue / mo'], [`${num(cs.roas, 1)}× <small>/ ${num(o.roas, 1)}×</small>`, 'ROAS: incr. / attr.'], [`${pct(cs.fyShare)} <small>/ ${pct(cs.fyShareAttr)}</small>`, '% of ~$22M FY revenue'], [`~${num(cs.techs)} <small>/ ~${num(cs.techsAttr)}</small>`, 'Technicians needed']];
  const MAILNOTE = c => { const nm = consBy[c.channel]?.nm; return nm != null ? `Deed feed: ~${num(CONS.moverPool[p.id])} arm’s-length buyers/mo; postcard #1 to all less a ${pct(CONS.holdout)} holdout, postcard #2 to the ~1 in 3 pre-1980 buyers = ~${num(nm)} drip pieces. The other ~${num(consBy[c.channel].sat)} pieces are saturation mail to older Tier-I homes (lower response).` : c.targeting_note; };
  const rows = p.channel_mix.map(c => { const ch = CH[c.channel] || { label: c.channel, color: '#999' }; const vol = c.est_impressions != null ? `${compact(c.est_impressions)}${c.est_pieces ? ' pcs' : ' imps'}${c.est_site_visits ? `<span class="f">${num(c.est_site_visits)} visits</span>` : ''}` : c.est_spots ? `${c.est_spots} spots` : '—';
    return `<tr><td><b><i class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${ch.color};margin-right:6px"></i>${esc(ch.label)}</b><span class="f">${esc(String(c.formula || '').replace(/\busd\b/g, 'spend').replace(/_/g, ' '))}</span><span class="f" style="font-family:var(--sans)">${esc((c.channel === 'new_mover_mail' ? MAILNOTE(c) : c.targeting_note) || '')}</span></td><td class="n">${num(c.share_pct)}%</td><td class="n">${money(c.monthly_usd)}</td><td class="n">${vol}</td><td class="n">${num(c.est_leads, 1)}</td><td class="n"><b>${/CPL/.test(c.metric || '') ? money(c.cpm_or_cpl_usd, 2) : c.est_leads ? money(c.monthly_usd / c.est_leads, 2) : '—'}</b><span class="f">${money(c.cpm_or_cpl_usd, c.cpm_or_cpl_usd % 1 ? 2 : 0)} ${esc(String(c.metric || '').replace(/\s*\(implied\)/, ''))}</span></td><td class="n">${num(c.est_booked_jobs, 1)}</td><td class="n"><b>${num(consBy[c.channel]?.jobs, 1)}</b><span class="f">${esc(consBy[c.channel]?.note || '')}</span></td><td class="n">${money(c.avg_ticket_usd)}</td><td class="n">${money(c.est_revenue_usd)}</td><td class="n"><b>${money(c.monthly_usd / c.est_booked_jobs)}</b></td><td class="srcs">${(c.assumption_source || []).map(u => ext(u, pubName(u))).join('<br>')}</td></tr>`; }).join('');
  const reach = p.household_reach_est;
  const F = p.model?.formulas || {};
  return `<div class="plan-head"><div><h3>${esc(p.phase)}</h3><p>${esc(p.months[0])} → ${esc(p.months.at(-1))} · ${esc(p.geo?.zips || '')}${p.geo?.counties ? ` · ${esc(p.geo.counties.join(', '))}` : ''}${p.geo?.states ? ` · ${esc(p.geo.states.join(', '))}` : ''}</p></div><div class="minis">${minis.map(([v, l]) => `<div class="mini"><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Channel · formula · targeting</th><th class="n">Share</th><th class="n">Monthly spend</th><th class="n">Volume</th><th class="n">Expected leads</th><th class="n">Cost per lead<span class="f">benchmark rate</span></th><th class="n">Booked jobs<span class="f">attributed</span></th><th class="n">Incremental jobs<span class="f">cons.</span></th><th class="n">Avg ticket</th><th class="n">Revenue<span class="f">attributed</span></th><th class="n">$ / job<span class="f">attributed</span></th><th>Sources</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>Total <span class="sys-est">est.</span></td><td class="n">100%</td><td class="n">${money(p.monthly_budget_usd)}</td><td class="n">${reach ? `${compact(reach.ctv_households_per_month)} HH<span class="f">${i === 0 ? `${pct(reach.ctv_households_per_month / tier1.hu, 0)} of ${compact(tier1.hu)} Tier-I HU (where CTV starts) · ${pct(reach.share_of_universe, 1)} of all ${compact(reach.universe_housing_units)}` : `${pct(reach.share_of_universe, 1)} of ${compact(reach.universe_housing_units)} HU`}</span>` : ''}</td><td class="n">${num(t.leads)}</td><td class="n"><b>${money(t.blended_cpl_usd, 2)}</b><span class="f">blended</span></td><td class="n">${num(t.booked_jobs)}</td><td class="n">${num(cs.jobs)}</td><td></td><td class="n">${money(t.revenue_usd)}</td><td class="n">${money(p.expected_cpa_usd)}</td><td></td></tr></tfoot></table></div>
    <div class="plan-cols">
      <div class="sys-card box"><h4>Flighting</h4><dl>${Object.entries(p.flighting || {}).map(([k, v]) => `<div><dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p class="fn">Frequency: ${esc(p.frequency?.ctv_target_per_month)} / mo target · cap ${esc(p.frequency?.cap || '')} · mail: postcard #1 at day 7 to every mover, postcard #2 at day 45 to pre-1980 non-responders, SMS/email at day 90 if booked</p></div>
      <div class="sys-card box"><h4>Measurement</h4><ul>${(p.measurement_plan || []).map(m => `<li>${esc(fixMeasure(m))}</li>`).join('')}</ul></div>
    </div>
    <div class="plan-cols"><div><h4 class="ads-h4">Formulas</h4><pre class="fx">${Object.entries(F).map(([k, v]) => `<b>${esc(fxName(k))}</b> = ${esc(v)}`).join('\n')}${reach ? `\n<b>CTV households</b> = ${esc(reach.formula)} = ${num(p.channel_mix.find(c => c.channel === 'ctv_zip_targeted')?.est_impressions)} / ${p.frequency?.ctv_target_per_month}` : ''}\n<b>Incremental jobs</b> = Σ attributed jobs × incrementality (LSA/search/Meta 0.5, CTV/mail/radio 0.75)\n<b>Incremental mail jobs</b> = (drip pieces × 1.0% + saturation pieces × 0.5%) × 0.44 × 0.75\n<b>Contribution</b> = incremental revenue × (0.40 − ${CONS.fees}) − media = ${signed(cs.contrib)}\n<b>Technicians</b> = incremental jobs ÷ ${CONS.jobsPerTech} = ${num(cs.techs, 1)}</pre></div><div class="payback"><b>Conservative read.</b> ${num(cs.jobs)} incremental jobs and ${money(cs.rev)} revenue a month; contribution after technician labour, materials and franchise fees is ${money(cs.rev * cs.cm)}, or <b>${signed(cs.contrib)}</b> after the ${money(p.monthly_budget_usd)} of media. ${cs.contrib >= 0 ? 'Media pays back inside the month' : 'Media does not pay back inside the month on first jobs alone'}. What has to be true: if the real ticket on LSA, CTV and search jobs is the ${money(CONS.repairTicket)} repair average rather than ${money(p.model?.assumptions?.avg_ticket_usd?.value || 1870)}, contribution is ${signed(cs.repContrib)} a month. Membership and repeat revenue are upside on top.<span class="f" style="display:block;margin-top:6px">Plan (attributed, full ticket, gross margin only): ${esc(p.payback_note || '')}</span></div></div>
    <details class="assump"><summary>Assumptions behind Phase ${i + 1} (${Object.keys(A).length})</summary><div class="tbl-wrap"><table class="t"><thead><tr><th>Assumption</th><th class="n">Value</th><th>Basis / formula</th><th>Source</th></tr></thead><tbody>${Object.entries(A).map(([k, a]) => `<tr><td><b>${esc(ASSUMP_LABEL[k] || k)}</b></td><td class="n">${fmtAssump(k, a.value)}</td><td>${esc(a.formula || a.basis || (/assumption/.test(a.source || '') ? a.source : 'benchmark'))}</td><td>${a.source && /^http/.test(a.source) ? ext(a.source) : `<span class="mut">${esc(a.source || 'assumption')}</span>`}</td></tr>`).join('')}</tbody></table></div></details>`;
}

/* ── 5 · calculator ──────────────────────────────────────────────────────── */
function calculator(D) {
  const p = D.p1; const A = p.model.assumptions; const B = Object.fromEntries(D.K('benchmark').map(b => [b.id, b]));
  const mixOf = plan => { const m = { lsa: 0, ctv: 0, search: 0, mail: 0, meta: 0 }; const key = { google_lsa: 'lsa', ctv_zip_targeted: 'ctv', paid_search_pmax: 'search', new_mover_mail: 'mail', meta_social: 'meta' }; for (const c of plan.channel_mix) if (key[c.channel]) m[key[c.channel]] = c.share_pct; return m; };
  const FIX = { lsaCPL: A.lsa_cpl_usd.value, searchCPL: A.search_cpl_usd.value, searchBook: A.search_book_rate.value, mailCost: A.mail_cost_per_piece_usd.value, mailRate: A.mail_lead_rate_per_piece.value, mailBook: A.mail_book_rate.value, mailTicket: A.mail_avg_ticket_usd.value, metaCPL: A.meta_cpl_usd.value, metaBook: A.meta_book_rate.value, metaTicket: A.meta_avg_ticket_usd.value, freq: A.ctv_frequency_per_month.value, lsaBook: A.lsa_book_rate.value, attach: A.membership_attach.value, memPrice: A.membership_price_usd_month.value };
  const DEF = { spend: p.monthly_budget_usd, ...Object.fromEntries(Object.entries(mixOf(p)).map(([k, v]) => ['mix_' + k, v])), cpm: A.ctv_cpm_usd.value, visit: +(A.ctv_cpm_usd.value / A.ctv_cost_per_visit_usd.value / 1000 * 100).toFixed(3), v2l: +(A.visit_to_lead.value * 100).toFixed(2), book: +(A.lsa_book_rate.value * 100).toFixed(1), ticket: A.avg_ticket_usd.value, margin: A.gross_margin.value * 100, incr: CONS.incr.google_lsa * 100 };
  const MIXC = { lsa: ['Local Services Ads', '#18945c'], ctv: ['Connected TV', '#f26b1d'], search: ['Search + PMax', '#1f8fd6'], mail: ['New-mover mail', '#7c4ddb'], meta: ['Meta social', '#d6407f'] };
  const S = [
    { k: 'spend', label: 'Monthly media spend', min: 5000, max: 150000, step: 2500, fmt: v => money(v), src: `Phase 1 plan budget (${money(DEF.spend)}/mo), Punctual Pros ad plan` },
    ...Object.keys(MIXC).map(k => ({ k: 'mix_' + k, label: MIXC[k][0], min: 0, max: 60, step: 1, mix: true, color: MIXC[k][1], fmt: null, src: `Phase 1 mix: ${DEF['mix_' + k]}%` })),
    { k: 'cpm', label: 'CTV CPM', min: 10, max: 85, step: 1, fmt: v => money(v), src: `eMarketer via Adwave Q2 2026: $${B.bm_ctv_cpm?.value ?? 26} blended, FAST $15–25, addressable $45–85; plan adds a zip premium → $${DEF.cpm}`, url: B.bm_ctv_cpm?.source_url },
    { k: 'visit', label: 'CTV site-visit rate (visits per impression)', min: .05, max: 1, step: .01, fmt: v => v.toFixed(2) + '%', src: `= $${DEF.cpm} CPM ÷ $${A.ctv_cost_per_visit_usd.value} cost/visit. That cost/visit is an assumption: ~1.8× the MNTN DTC case ($6.73)`, url: A.ctv_cost_per_visit_usd.source },
    { k: 'v2l', label: 'Site visit → lead', min: 1, max: 15, step: .01, fmt: v => v.toFixed(1) + '%', src: 'LocaliQ 2025 HVAC search conversion rate (6.56%) used as the landing-page proxy', url: A.visit_to_lead.source },
    { k: 'book', label: 'Booking rate (lead → booked job)', min: 20, max: 85, step: .1, fmt: v => v.toFixed(1) + '%', src: `SearchLight Feb 2026 LSA ${pct(FIX.lsaBook, 1)}. ServiceTitan: typical shop 42%, top performers 77–90%. Search ×${(FIX.searchBook / FIX.lsaBook).toFixed(2)}, Meta ×${(FIX.metaBook / FIX.lsaBook).toFixed(2)} (plan ratios)`, url: B.bm_lsa_book_rate?.source_url },
    { k: 'ticket', label: 'Avg ticket (LSA, CTV, search jobs)', min: 400, max: 4000, step: 10, fmt: v => money(v), src: `SearchLight LSA tickets weighted 50/35/15 HVAC/plumbing/electrical = ${money(DEF.ticket)}. Mail ${money(FIX.mailTicket)} and Meta ${money(FIX.metaTicket)} are held fixed`, url: A.avg_ticket_usd.source },
    { k: 'margin', label: 'Gross margin after technician labour & materials', min: 20, max: 60, step: 1, fmt: v => v.toFixed(0) + '%', src: `Applause HQ: transactional repairs 35–45% GM (planning assumption 40%). ${CONS.feesNote} is taken off on top`, url: A.gross_margin.source },
    { k: 'incr', label: 'Incrementality of LSA, search & Meta jobs', min: 20, max: 100, step: 5, fmt: v => v.toFixed(0) + '%', src: `Assumption: share of attributed jobs Punctual Pros would not have got anyway (40–60% haircut range). CTV and mail fixed at ${pct(CONS.incr.ctv_zip_targeted)} until the holdouts read` },
  ];
  let pool = moverPieces(p) || 2760;
  const st = { ...DEF };
  const form = $('#calc-in');
  const sl = s => `<div class="sl"><div class="sl-top"><label for="in-${s.k}">${esc(s.label)}</label><output id="out-${s.k}" for="in-${s.k}"></output></div><input type="range" id="in-${s.k}" data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${st[s.k]}"><span class="src" id="src-${s.k}">Default ${s.mix ? DEF[s.k] + '%' : s.fmt(DEF[s.k])} · ${esc(s.src)}${s.url ? ` · ${ext(s.url)}` : ''}</span></div>`;
  form.innerHTML = `<fieldset><legend>Budget</legend>${sl(S[0])}</fieldset>
    <fieldset><legend>Channel mix (normalised to 100%)</legend><div class="mixbar" id="mixbar" aria-hidden="true"></div>${S.filter(s => s.mix).map(sl).join('')}</fieldset>
    <fieldset><legend>CTV funnel</legend>${['cpm', 'visit', 'v2l'].map(k => sl(S.find(s => s.k === k))).join('')}</fieldset>
    <fieldset><legend>Conversion &amp; economics</legend>${['book', 'ticket', 'margin', 'incr'].map(k => sl(S.find(s => s.k === k))).join('')}</fieldset>
    <div class="calc-btns"><button class="sys-btn sys-btn--secondary sys-btn--sm" type="button" data-preset="0">Phase 1 defaults</button>${D.plans.slice(1).map((pl, i) => `<button class="sys-btn sys-btn--secondary sys-btn--sm" type="button" data-preset="${i + 1}">Phase ${i + 2} mix &amp; budget</button>`).join('')}</div>
    <p class="fn">Held fixed from the plan: LSA CPL ${money(FIX.lsaCPL, 2)}, search CPL ${money(FIX.searchCPL)}, mail ${money(FIX.mailCost, 2)}/piece at ${pct(FIX.mailRate, 1)} lead rate, Meta CPL ${money(FIX.metaCPL, 2)}, CTV frequency ${FIX.freq}/mo. Phase 3’s 5% radio line is left out of the mix and the rest is re-normalised. Mail: the first ~${num(pool)} pieces a month are the new-mover drip at ${pct(FIX.mailRate, 1)}; pieces beyond that are saturation mail at ${pct(CONS.satRate, 1)} in the incremental view.</p>`;
  const paint = () => {
    for (const s of S) { const inp = $('#in-' + s.k); const v = st[s.k]; inp.value = v; inp.style.setProperty('--p', ((v - s.min) / (s.max - s.min) * 100).toFixed(1) + '%'); const src = $('#src-' + s.k); src.classList.toggle('changed', Math.abs(v - DEF[s.k]) > 1e-9); }
    const r = model(st); for (const s of S) $('#out-' + s.k).textContent = s.mix ? `${st[s.k]} → ${pct(r.share[s.k.slice(4)], 0)} · ${money(r.ch[s.k.slice(4)].usd)}` : s.fmt(st[s.k]);
    $('#mixbar').innerHTML = Object.keys(MIXC).map(k => `<i style="width:${(r.share[k] * 100).toFixed(2)}%;background:${MIXC[k][1]}"></i>`).join('');
    out(r);
  };
  const model = s => {
    const tot = Object.keys(MIXC).reduce((a, k) => a + s['mix_' + k], 0) || 1; const share = Object.fromEntries(Object.keys(MIXC).map(k => [k, s['mix_' + k] / tot]));
    const usd = k => s.spend * share[k]; const book = s.book / 100;
    const ch = {};
    { const u = usd('lsa'); const leads = u / FIX.lsaCPL; ch.lsa = { usd: u, leads, jobs: leads * book, ticket: s.ticket }; }
    { const u = usd('ctv'); const imps = u / s.cpm * 1000; const visits = imps * s.visit / 100; const leads = visits * s.v2l / 100; ch.ctv = { usd: u, imps, visits, leads, jobs: leads * book, ticket: s.ticket }; }
    { const u = usd('search'); const leads = u / FIX.searchCPL; ch.search = { usd: u, leads, jobs: leads * book * FIX.searchBook / FIX.lsaBook, ticket: s.ticket }; }
    { const u = usd('mail'); const pieces = u / FIX.mailCost; const leads = pieces * FIX.mailRate; ch.mail = { usd: u, pieces, leads, jobs: leads * book * FIX.mailBook / FIX.lsaBook, ticket: FIX.mailTicket }; }
    { const u = usd('meta'); const leads = u / FIX.metaCPL; ch.meta = { usd: u, leads, jobs: leads * book * FIX.metaBook / FIX.lsaBook, ticket: FIX.metaTicket }; }
    for (const c of Object.values(ch)) c.rev = c.jobs * c.ticket;
    const sum = f => Object.values(ch).reduce((a, c) => a + (c[f] || 0), 0);
    const leads = sum('leads'), jobs = sum('jobs'), rev = sum('rev'); const gp = rev * s.margin / 100;
    // incremental (conservative) view
    const fi = s.incr / 100, fh = CONS.incr.ctv_zip_targeted; const mp = ch.mail.pieces || 0; const nm = Math.min(pool, mp), sat = Math.max(0, mp - nm);
    const mailInc = (nm * FIX.mailRate + sat * CONS.satRate) * book * FIX.mailBook / FIX.lsaBook * fh;
    const inc = { lsa: ch.lsa.jobs * fi, ctv: ch.ctv.jobs * fh, search: ch.search.jobs * fi, mail: mailInc, meta: ch.meta.jobs * fi };
    const ijobs = Object.values(inc).reduce((a, v) => a + v, 0); const irev = Object.keys(inc).reduce((a, k) => a + inc[k] * ch[k].ticket, 0);
    const cm = s.margin / 100 - CONS.fees; const icontrib = irev * cm - s.spend; const icm = irev * cm;
    return { share, ch, leads, jobs, rev, gp, inc, ijobs, irev, icm, icontrib, icpa: ijobs ? s.spend / ijobs : null, iroas: irev / s.spend, cpa: jobs ? s.spend / jobs : null, cpl: leads ? s.spend / leads : null, roas: rev / s.spend, payDays: icm > 0 ? s.spend / icm * 30.4 : null, hh: (ch.ctv.imps || 0) / FIX.freq, mem: ijobs * 0.6 * FIX.attach, techs: ijobs / CONS.jobsPerTech, fy: irev * 12 / CONS.fyRevenue };
  };
  const HU = D.ads.meta?.territory_facts?.pa_core_housing_units || 1001408; const p1usd = k => p.monthly_budget_usd * (mixOf(p)[k] || 0) / 100; const p1pcs = p1usd('mail') / FIX.mailCost;
  const lim = r => { const w = [];
    if (r.hh > HU) w.push(`CTV reaches ${compact(r.hh)} households at ${FIX.freq}/mo frequency, more than the ${compact(HU)} housing units in the PA core zips. Extra CTV spend buys frequency there, not new households, so the CTV jobs above are an upper bound.`);
    if (r.ch.lsa.usd > p1usd('lsa') * 1.25) w.push(`LSA spend of ${money(r.ch.lsa.usd)} is above the Phase 1 level (${money(p1usd('lsa'))}). LSA lead volume is capped by local search demand, and the plan already expects it to cap out in mild weeks, so a flat ${money(FIX.lsaCPL, 2)} CPL is optimistic here.`);
    if (r.ch.mail.pieces > p1pcs * 1.25) w.push(`${num(r.ch.mail.pieces)} postcards a month is well beyond the Phase 1 mail line (~${num(p1pcs)} pieces, of which only ~${num(pool)} are the new-mover drip). Pieces past that go to colder lists, so even the 0.5% saturation response used in the incremental view may not hold.`);
    if (r.techs > 8) w.push(`~${num(r.techs)} extra technicians would be needed at ${CONS.jobsPerTech} jobs per tech-month. Winter is when Punctual Pros is already busiest; check open capacity before buying demand it cannot serve.`);
    return w.length ? `<div class="limits" role="note"><b>Model limits at these settings</b><ul>${w.map(x => `<li>${x}</li>`).join('')}</ul><span>The calculator is linear: it scales each channel at a constant CPL with no saturation. Read these settings as a ceiling, not a forecast.</span></div>` : ''; };
  const out = r => {
    const ok = r.icontrib >= 0; const plan = consOf(p).cpa;
    const maxJ = Math.max(...Object.values(r.ch).map(c => c.jobs)) || 1;
    $('#calc-out').innerHTML = `<div class="big">
      <div class="sys-kpi" data-co="pp"><span class="sys-kpi-label">Incremental booked jobs / mo</span><span class="sys-kpi-value">${num(r.ijobs)}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi" data-co="pp"><span class="sys-kpi-label">Cost per incremental job</span><span class="sys-kpi-value">${money(r.icpa)}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi" data-co="pp"><span class="sys-kpi-label">Contribution after media / mo</span><span class="sys-kpi-value">${signed(r.icontrib)}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi"><span class="sys-kpi-label">Attributed jobs · cost per job (upside)</span><span class="sys-kpi-value">${num(r.jobs)} · ${money(r.cpa)}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi"><span class="sys-kpi-label">ROAS incremental / attributed</span><span class="sys-kpi-value">${num(r.iroas, 1)}× <small>/ ${num(r.roas, 1)}×</small><span class="sys-est">est.</span></span></div>
      <div class="sys-kpi"><span class="sys-kpi-label">Payback on incremental contribution</span><span class="sys-kpi-value">${r.payDays != null ? (r.payDays < 31 ? num(r.payDays) + ' days' : num(r.payDays / 30.4, 1) + ' mo') : 'never'}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi"><span class="sys-kpi-label">Extra technicians (÷${CONS.jobsPerTech} jobs/mo)</span><span class="sys-kpi-value">~${num(r.techs, 1)}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi"><span class="sys-kpi-label">Annual incr. revenue / ~$22M FY</span><span class="sys-kpi-value">${pct(r.fy, 1)}<span class="sys-est">est.</span></span></div>
      <div class="sys-kpi"><span class="sys-kpi-label">CTV impressions · households</span><span class="sys-kpi-value">${compact(r.ch.ctv.imps)} · ${compact(r.hh)}<span class="sys-est">est.</span></span></div>
    </div>
    <div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? `Pays back inside the month on incremental jobs: contribution ${money(r.icm)} vs ${money(st.spend)} spend.` : `Does not pay back inside the month on incremental jobs: contribution ${money(r.icm)} vs ${money(st.spend)} spend.`} Cost per incremental job is ${r.icpa ? (Math.abs(r.icpa - plan) < 1 ? 'in line with' : r.icpa < plan ? `${money(plan - r.icpa)} better than` : `${money(r.icpa - plan)} worse than`) : '—'} the Phase 1 conservative case (${money(plan)}). Membership adds ≈ ${num(r.mem)}/mo (60% new × ${pct(FIX.attach)} attach), not counted.</div>
    ${lim(r)}
    <div class="sys-card"><div class="jobs-bars">${Object.keys(MIXC).map(k => { const c = r.ch[k]; return `<div class="jb"><span>${MIXC[k][0]}</span><span class="track"><i style="width:${(c.jobs / maxJ * 100).toFixed(1)}%;background:${MIXC[k][1]};opacity:.35"></i><i class="inc" style="width:${(r.inc[k] / maxJ * 100).toFixed(1)}%;background:${MIXC[k][1]}"></i></span><span class="v">${num(r.inc[k], 1)} <small>/ ${num(c.jobs, 1)}</small></span></div>`; }).join('')}</div><p class="fn">Booked jobs by channel: solid = incremental, faded = attributed. Cost per incremental job: ${Object.keys(MIXC).map(k => `${MIXC[k][0].split(' ')[0]} ${r.inc[k] > .05 ? money(r.ch[k].usd / r.inc[k]) : '—'}`).join(' · ')}</p></div>
    <pre class="fx"><b>imps</b> = CTV $ ÷ ${money(st.cpm)} × 1000 = ${num(r.ch.ctv.imps)}
<b>visits</b> = imps × ${st.visit.toFixed(2)}% = ${num(r.ch.ctv.visits)}
<b>leads</b> = LSA $÷${FIX.lsaCPL} + visits×${st.v2l.toFixed(1)}% + search $÷${FIX.searchCPL} + (mail $÷${FIX.mailCost})×${pct(FIX.mailRate)} + Meta $÷${FIX.metaCPL} = ${num(r.leads)}
<b>jobs</b> = Σ leads × ${st.book.toFixed(1)}% × channel ratio = ${num(r.jobs, 1)}
<b>revenue</b> = Σ jobs × ticket (${money(st.ticket)} | mail ${money(FIX.mailTicket)} | Meta ${money(FIX.metaTicket)}) = ${money(r.rev)}
<b>CPA</b> = ${money(st.spend)} ÷ ${num(r.jobs, 1)} = ${money(r.cpa)}
<b>incremental</b> = LSA, search, Meta jobs × ${st.incr}% + CTV jobs × ${pct(CONS.incr.ctv_zip_targeted)} + (drip ${num(Math.min(pool, r.ch.mail.pieces || 0))} × ${pct(FIX.mailRate)} + saturation ${num(Math.max(0, (r.ch.mail.pieces || 0) - pool))} × ${pct(CONS.satRate, 1)}) × ${pct(FIX.mailBook)} × ${pct(CONS.incr.new_mover_mail)} = ${num(r.ijobs, 1)}
<b>contribution</b> = incremental revenue ${money(r.irev)} × (${st.margin}% − ${pct(CONS.fees, 1)} franchise fees) − ${money(st.spend)} = ${signed(r.icontrib)}
<b>payback</b> = spend ÷ incremental contribution × 30.4 days</pre>`;
  };
  form.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; st[k] = +e.target.value; paint(); });
  form.addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (!b) return; const pl = D.plans[+b.dataset.preset]; pool = moverPieces(pl) || pool; Object.assign(st, DEF, { spend: Math.min(150000, pl.monthly_budget_usd) }, Object.fromEntries(Object.entries(mixOf(pl)).map(([k, v]) => ['mix_' + k, v]))); paint(); });
  paint();
}

/* ── 6 · CTV platforms ───────────────────────────────────────────────────── */
function platforms(D) {
  const P = D.K('ctv_platform').slice(); const rank = { high: 0, medium: 1, low: 2 };
  P.sort((a, b) => (rank[a.fit_for_pp] - rank[b.fit_for_pp]) || ((a.minimum_spend_usd ?? 9e9) - (b.minimum_spend_usd ?? 9e9)));
  const short = p => p.platform.split(' (')[0];
  const F = [['all', 'All 12', () => true], ['zip', 'Zip targeting', p => (p.targeting || []).includes('zip')], ['self', 'Self-serve', p => p.self_serve], ['min', 'Minimum ≤ $500', p => p.minimum_spend_usd != null && p.minimum_spend_usd <= 500], ['high', 'High fit for Punctual Pros', p => p.fit_for_pp === 'high']];
  let f = 'all';
  const draw = () => {
    const rows = P.filter(F.find(x => x[0] === f)[2]);
    $('#plat-filter').innerHTML = F.map(([k, l, fn]) => `<button class="sys-chip" type="button" data-f="${k}" aria-pressed="${k === f}">${l} <span class="mut">${P.filter(fn).length}</span></button>`).join('');
    const X = v => (v / 90 * 100).toFixed(2) + '%';
    $('#plat-chart').innerHTML = `<div class="pc-h"><span><b>CPM range by platform</b> (US$ per 1,000 impressions)</span><span><i style="display:inline-block;width:2px;height:10px;background:#d23c35;vertical-align:-1px"></i> $26 market blended · plan uses $30</span></div>${rows.map(p => `<div class="prow"><span class="nm" title="${esc(p.platform)}">${esc(short(p))}</span><div class="ptrack">${Array.isArray(p.cpm_range_usd) ? `<span class="rg ${p.fit_for_pp}" style="left:${X(p.cpm_range_usd[0])};width:${X(p.cpm_range_usd[1] - p.cpm_range_usd[0])}" title="$${p.cpm_range_usd[0]}–${p.cpm_range_usd[1]}"></span>` : '<span class="na">not published</span>'}<span class="mk" style="left:${X(26)}"></span></div></div>`).join('')}<div class="axis"><div></div><div>${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => `<span>$${v}</span>`).join('')}</div></div>`;
    $('#plat-table').innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Platform</th><th>Self-serve</th><th class="n">Minimum</th><th class="n">CPM</th><th>Targeting</th><th>Measurement</th><th>Creative tools / specs</th><th>Fit</th><th>Why / caveats</th></tr></thead><tbody>${rows.map(p => `<tr><td><b>${esc(short(p))}</b><span class="f" style="font-family:var(--sans)">${esc((p.platform.match(/\((.*)\)/) || [])[1] || '')}</span><span class="f">${ext(p.source_url)}${p.retrieval_status === 'search_snippet' ? ' · snippet' : ''}</span></td><td>${p.self_serve ? '<span class="yes">✓</span>' : '<span class="no">managed</span>'}</td><td class="n">${p.minimum_spend_usd != null ? money(p.minimum_spend_usd) : '—'}<span class="f" style="font-family:var(--sans);text-align:left">${esc(p.minimum_unit || '')}</span></td><td class="n">${Array.isArray(p.cpm_range_usd) ? `$${p.cpm_range_usd[0]}–${p.cpm_range_usd[1]}` : '—'}</td><td>${(p.targeting || []).map(t => `<span class="tgt ${t === 'zip' ? 'zip' : ''}">${esc(t)}</span>`).join('')}</td><td>${esc((p.measurement || []).slice(0, 2).join('; '))}</td><td>${esc(p.creative_specs?.in_platform || p.creative_specs?.platform_note || `:${(p.creative_specs?.durations_s || [15, 30]).join('/:')}, 16:9 1080p`)}</td><td><span class="fit ${p.fit_for_pp}">${esc(p.fit_for_pp)}</span></td><td style="min-width:260px">${esc(p.notes || '')}</td></tr>`).join('')}</tbody></table></div><p class="fn">Common spec for every company: 1920×1080 16:9, :15/:30, H.264 or ProRes 15–60 Mbps, −24 LKFS ±2 loudness, text and QR inside the central 90% (Hulu specs via keynes.com; ATTN creative guide). Third-party CPM ranges are planning figures, not rate cards.</p>`;
  };
  $('#plat-filter').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; draw(); } };
  draw();
}

/* ── 7 · test plan ───────────────────────────────────────────────────────── */
// Test-plan edits applied on top of pp_ads.json meta.test_plan (the dataset is shared; the page states the revised design)
const TEST_FIX = [
  [/^Randomize 15% of Tier-I zips and 10% of new movers as holdouts$/, 'Pair the 61 Tier-I zips on housing units and 12-month ServiceTitan jobs; randomise one zip of each pair dark for CTV (~30 zips). Hold out 20% of new movers. Randomise the 9 PA counties 5 rules-on / 4 rules-off for the weather trigger.'],
  [/^Read booked jobs per 10k HU exposed vs holdout \(directional\)$/, 'Directional read of booked jobs per 10k HU, exposed vs holdout (not a decision: see power table)'],
  [/^Turn on NWS trigger rules for half the counties.*$/, 'Weather rules are live from week 2 in the rules-on counties; every qualifying warning is logged as a test event and read 72 h later. Nothing depends on an alert landing this week.'],
  [/^Frozen-pipe vertical on Meta during any Extreme Cold Warning$/, 'Frozen-pipe vertical on Meta during any Freeze or Winter Storm Warning (Extreme Cold Warnings: none issued 2019–2025)'],
  [/^Mail drop 3$/, 'Mail drop 3: postcard #1 to the month’s new deeds'],
  [/^Geo-holdout lift for CTV and mail \(booked jobs, revenue\)$/, 'Read LSA, search and Meta on tracked cost per booked job. CTV holdout read continues to week 12; mail bookings pooled to month 6'],
  [/^Go \/ no-go for Phase 2 and budget re-split$/, 'Go / no-go for Phase 2 on the conservative case; CTV go / stop at week 12'],
];
const fixAction = a => { for (const [re, t] of TEST_FIX) if (re.test(a)) return t; return a; };
function powerRows(D) {
  const cs = consOf(D.p1); const ctvInc = cs.rows.find(r => r.c.channel === 'ctv_zip_targeted')?.jobs || 27; const ctvUsd = P1_CTV;
  const base = 18e6 / CONS.repairTicket / 12 / 1001408 * 1e4; // booked jobs per 10k HU per month, est.
  const cm = CONS.gm - CONS.fees; const tk = D.p1.model?.assumptions?.avg_ticket_usd?.value || 1870;
  const geo = (label, nh, ne, wk, cv, mult) => {
    const mo = wk * 7 / 30.44; const huH = tier1.hu * nh / (nh + ne), huE = tier1.hu - huH;
    const lh = base * huH / 1e4 * mo, le = base * huE / 1e4 * mo; const lift = ctvInc * mult * mo / le;
    const se = Math.sqrt(1 / lh + 1 / le + cv * cv * (1 / nh + 1 / ne)); const mde = Math.exp(2.8 * se) - 1;
    const be = (ctvUsd * mult / (tk * cm)) * mo / le;
    return { label, design: `${nh} dark vs ${ne} exposed zips · ${wk} wk · CTV ${money(ctvUsd * mult)}/mo · geo CV ${cv}`, counts: `${num(lh)} / ${num(le)}`, lift, mde, be, ok: lift >= mde };
  };
  const mail = (label, hold, months) => {
    const p0 = 0.02; const movers = 2300 * months; const nh = movers * hold, nt = movers * (1 - hold);
    const lift = (moverPieces(D.p1) * CONS.mailRate * 0.44 * CONS.incr.new_mover_mail) / (2300 * (1 - CONS.holdout));
    const mde = 2.8 * Math.sqrt(p0 * (1 - p0) * (1 / nh + 1 / nt));
    return { label, design: `${pct(hold)} of movers held out · ${months} months of drops · baseline 90-day booking ${pct(p0)} (assumption)`, counts: `${num(nh)} / ${num(nt)} movers`, lift, mde, ok: lift >= mde, pts: true };
  };
  return { base, rows: [geo('CTV · as first written', 9, 52, 8, 0.25, 1), geo('CTV · matched pairs, 12 weeks, pre-period adjusted', 30, 31, 12, 0.10, 1), geo('CTV · same, at 2× weight in exposed zips', 30, 31, 12, 0.10, 2), mail('Mail · as first written', 0.10, 2), mail('Mail · 20% holdout pooled over Phase 1', 0.20, 6)] };
}
function testPlan(D) {
  const T = D.ads.meta?.test_plan || []; const total = T.reduce((a, w) => a + (w.budget_usd || 0), 0); let cum = 0;
  const p1 = D.p1; const cs = consOf(p1); const pw = powerRows(D);
  const focus = w => w.week === 5 ? 'Weather trigger (runs all season)' : w.focus;
  $('#test-plan').innerHTML = `<div class="weeks">${T.map(w => { cum += w.budget_usd || 0; return `<article class="sys-card wk ${/read/i.test(w.focus) ? 'read' : ''}"><div class="wk-top"><span class="wk-n">WEEK ${w.week}</span><span class="wk-b">${money(w.budget_usd)}</span></div><h4>${esc(focus(w))}</h4><ul>${w.actions.map(a => `<li>${esc(fixAction(a))}</li>`).join('')}</ul><div class="cum"><div><i style="width:${(cum / total * 100).toFixed(1)}%"></i></div><span>${money(cum)} of ${money(total)} cumulative</span></div></article>`; }).join('')}</div>
  <h3 class="h3">Can the test actually decide? Power check before launch</h3>
  <div class="tbl-wrap"><table class="t"><thead><tr><th>Read</th><th>Design</th><th class="n">Expected baseline<span class="f">holdout / exposed</span></th><th class="n">Expected lift<span class="f">conservative</span></th><th class="n">Minimum detectable<span class="f">80% power, 5%</span></th><th>Verdict</th></tr></thead><tbody>${pw.rows.map(r => `<tr><td><b>${esc(r.label)}</b></td><td>${esc(r.design)}</td><td class="n">${r.pts ? r.counts : `${r.counts} jobs`}</td><td class="n">${r.pts ? `+${num(r.lift * 100, 2)} pt` : `+${pct(r.lift, 1)}`}${r.be != null ? `<span class="f">break-even +${pct(r.be, 1)}</span>` : ''}</td><td class="n"><b>${r.pts ? `${num(r.mde * 100, 2)} pt` : pct(r.mde, 0)}</b></td><td>${r.ok ? '<span class="pw-ok">✓ readable</span>' : '<span class="pw-no">✗ underpowered</span>'}</td></tr>`).join('')}</tbody></table></div>
  <p class="fn">Baseline = ~${num(pw.base, 1)} booked jobs per 10k housing units a month <span class="sys-est">est.</span> (~$18M PA revenue ÷ $1,024 ticket ÷ 1.0M HU; replace with ServiceTitan job counts by zip). Expected CTV lift = the conservative ${num(cs.rows.find(r => r.c.channel === 'ctv_zip_targeted')?.jobs, 0)} incremental CTV jobs a month ÷ exposed baseline. MDE = e<sup>2.8·SE</sup> − 1, SE² = 1/holdout jobs + 1/exposed jobs + CV²(1/n<sub>dark</sub> + 1/n<sub>exposed</sub>); zip-level CV is an assumption (0.25 raw, 0.10 after a 12-month pre-period adjustment). The 2× row assumes lift scales with spend, which is optimistic. Mail: incremental bookings per mailed mover are small (~${num(pw.rows[3].lift * 100, 2)} pt), so mail is judged on tracked response and match-back cost per job, with bookings pooled across the season.</p>
  <div class="decision">
    <div class="sys-card box"><h4>Go to Phase 2 if…</h4>Tracked cost per booked job on LSA, search and Meta is at or below plan, and the blended conservative case holds: cost per incremental job ≤ <b>${money(cs.cpa)}</b> and contribution after media ≥ $0. Next: Jersey Shore, zip-only CTV, ${money(D.plans[1]?.monthly_budget_usd)}/mo from ${esc(D.plans[1]?.months?.[0] || '2027-03')}.</div>
    <div class="sys-card box"><h4>Re-split if…</h4>A channel’s cost per booked job is more than 2× LSA’s, or worse than its own model (LSA ~$117, search ~$249, CTV ~$416 attributed). Unspent LSA budget in mild weeks rolls to CTV and mail.</div>
    <div class="sys-card box"><h4>Stop CTV if…</h4>At week 12 the upper end of the 90% confidence interval on holdout lift is below break-even. An 8-week read with 9 dark zips cannot detect anything under ~${pct(pw.rows[0].mde, 0)}, so “no lift at week 8” is not evidence either way. Completion rate is never the reason to keep spending.</div>
  </div>`;
}

/* ── 8 · Fair Harbor appendix ────────────────────────────────────────────── */
function fairHarbor(D) {
  const fh = D.K('fh_appendix'); const g = id => fh.find(x => x.id === id);
  const spots = fh.filter(x => x.type === 'ctv_spot'); const vert = g('fh_vertical_meta_tiktok'); const coop = g('fh_wholesale_coop'); const bm = g('fh_ctv_benchmarks'); const tp = g('fh_test_plan');
  const plan = tp?.plan || {};
  const bmv = b => typeof b.value === 'object' ? Object.entries(b.value).map(([k, v]) => `${({ conversion_rate_yoy: 'Conversion rate, year on year', roas_q3_to_q4: 'Return on ad spend, Q3 to Q4', cost_per_visit_change: 'Cost per visit' })[k] || k.replace(/_/g, ' ')} ${v > 0 ? '+' : ''}${pct(v, 0)}`).join(' · ') : `${b.unit === 'usd_cpm' || b.unit === 'usd' ? money(b.value, 2) : num(b.value, 2)}${b.unit === 'x' ? '×' : b.unit === 'x goal' ? '× goal' : ''}`;
  $('#fh-body').innerHTML = `${tp ? `<div class="fh-kpis"><div class="sys-kpi"><span class="sys-kpi-label">${plan.weeks}-week pilot budget</span><span class="sys-kpi-value">${money(plan.budget_usd)}<span class="sys-est">est.</span></span></div><div class="sys-kpi"><span class="sys-kpi-label">${esc(String(plan.split || '').split('/').slice(1).join('/').trim())}</span><span class="sys-kpi-value">${esc(String(plan.split || '').split(' (')[0].split('/')[0].trim())}<span class="sys-est">est.</span></span></div><div class="sys-kpi"><span class="sys-kpi-label">${esc(String(plan.holdout || '').split(' ').slice(1).join(' '))} (holdout)</span><span class="sys-kpi-value">${esc(String(plan.holdout || '').split(' ')[0])}<span class="sys-est">est.</span></span></div><div class="sys-kpi"><span class="sys-kpi-label">Planning CTV ROAS</span><span class="sys-kpi-value">${bm?.planning_range ? `${bm.planning_range.ctv_roas[0]}–${bm.planning_range.ctv_roas[1]}×` : '—'}<span class="sys-est">est.</span></span></div></div>` : ''}
  <div class="ctv-list" style="margin-top:18px">${spots.map(s => storyboard(s, { fh: true })).join('')}</div>
  <div class="fh-grid">
    <div><h3 class="h3" style="margin-top:20px">${esc(vert?.title || 'Vertical')}</h3><div class="phones">${vert ? phone(vert, { fh: true, ui: { cta: 'Shop now', caption: 'Mesh liner vs. Fair Harbor' } }) : ''}</div><p class="fn">${esc(vert?.notes || '')}</p></div>
    <div><h3 class="h3" style="margin-top:20px">${esc(coop?.title || 'Wholesale co-op')}</h3><div class="sys-card box"><p style="margin:0 0 8px"><b>Audience:</b> ${esc(coop?.audience || '')}</p><ul>${(coop?.mechanics || []).map(m => `<li>${esc(m)}</li>`).join('')}</ul><p class="fn">${esc(coop?.notes || '')}</p></div>
      <h3 class="h3" style="margin-top:20px">Pilot rules</h3><div class="sys-card box"><dl><div><dt>KPIs</dt><dd>${esc((plan.kpis || []).join(' · '))}</dd></div><div><dt>Stop rule</dt><dd>${esc(plan.stop_rule || '')}</dd></div></dl></div></div>
  </div>
  ${bm ? `<h3 class="h3">${esc(bm.title)}</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Metric</th><th class="n">Value</th><th>Source</th></tr></thead><tbody>${bm.benchmarks.map(b => `<tr><td><b>${esc(b.metric)}</b>${b.range ? `<span class="f">range $${b.range[0]}–${b.range[1]}</span>` : ''}${b.cost_per_site_visit_usd ? `<span class="f">${money(b.cost_per_site_visit_usd, 2)} per site visit</span>` : ''}</td><td class="n">${bmv(b)}</td><td>${ext(b.source_url)}${b.retrieval_status === 'search_snippet' ? ' <span class="mut">(snippet)</span>' : ''}</td></tr>`).join('')}</tbody></table></div><p class="fn">${esc(bm.planning_range?.basis || '')}</p>` : ''}`;
  cyclePhonesIn($('#fh-body'));
}
function cyclePhonesIn(root) {
  if (reduced() || !root) return;
  $$('.phone-scr', root).forEach(ph => { let i = 0; const fr = $$('.scr', ph), dots = $$('.phone-dots span', ph); if (fr.length < 2) return; setInterval(() => { i = (i + 1) % fr.length; fr.forEach((f, j) => f.classList.toggle('on', j === i)); dots.forEach((d, j) => d.classList.toggle('on', j <= i)); }, 2200); });
}

/* ── 9 · sources ─────────────────────────────────────────────────────────── */
/* Dataset caveats use analyst shorthand; spell names out for readers. */
const plainAds = t => String(t ?? '').replace(/\bPP's\b/g, "Punctual Pros'").replace(/\bPP\b/g, 'Punctual Pros').replace(/\bBSP\b/g, 'Broad Sky').replace(/\s*\(?retrieval_status='search_snippet'\)?/g, ' (search snippet)');
/* Readable link text for a source URL: a descriptive slug, else the title of the item that cites it. */
const SRC_UP = { hvac: 'HVAC', ctv: 'CTV', ctvs: 'CTV’s', dtc: 'DTC', iab: 'IAB', roas: 'ROAS', roi: 'ROI', yoy: 'YoY', eddm: 'EDDM', lsa: 'LSA', smbs: 'SMBs', q2: 'Q2', q4: 'Q4', mntn: 'MNTN', ott: 'OTT', tv: 'TV', tiktok: 'TikTok', youtube: 'YouTube', usps: 'USPS', google: 'Google', amazon: 'Amazon', roku: 'Roku', hulu: 'Hulu', fair: 'Fair', harbor: 'Harbor', spectrum: 'Spectrum', reach: 'Reach', j: 'J.', lindeberg: 'Lindeberg', maison: 'Maison', mrkt: 'MRKT', facebook: 'Facebook' };
const BRAND_HOSTS = { 'onehourheatandair.com': 'One Hour', 'benjaminfranklinplumbing.com': 'Benjamin Franklin Plumbing', 'mistersparky.com': 'Mister Sparky' };
/* Item kinds in the ad-plan dataset, as a reader sees them. */
const KIND_LABEL = { ctv_platform: 'CTV platforms', benchmark: 'benchmarks', creative: 'sample ads', media_plan: 'media plans', fh_appendix: 'Fair Harbor appendix items', spot_render: 'rendered spots' };
function srcLabel(u, titles) {
  let segs = []; try { segs = new URL(u).pathname.split('/').filter(Boolean); } catch { /* not a URL */ }
  const brand = BRAND_HOSTS[host(u)];
  if (brand) return /guarantee/i.test(u) ? `${brand} guarantee terms` : `${brand} ${segs[0] ? segs[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' ' : ''}location page`;
  const slug = [...segs].reverse().map(x => x.replace(/\.(html?|txt|php)$/i, '').replace(/^\d+-/, '')).find(x => /[a-z]/i.test(x) && (x.match(/-/g) || []).length >= 2);
  if (slug) {
    const w = slug.split('-').filter(Boolean).map((x, i) => SRC_UP[x.toLowerCase()] || (i ? x.toLowerCase() : x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())).join(' ');
    const g = w.replace(/\bplaybooks?\b/gi, m => /s$/i.test(m) ? 'guides' : 'guide');
    return g.length > 64 ? g.slice(0, g.lastIndexOf(' ', 62)) + '…' : g;
  }
  const t = titles.get(u);
  return t ? t.split(/\s+\(|\s+-\s+/)[0] : 'Home page';
}
function sources(D) {
  const meta = D.ads.meta || {}; const urls = meta.sources_summary || [];
  const snip = new Set(D.items.filter(i => i.retrieval_status === 'search_snippet').flatMap(i => [i.source_url, ...(i.source_urls || [])]));
  const blobs = D.items.map(i => JSON.stringify(i)); const uses = u => blobs.filter(b => b.includes(u)).length;
  const groups = {}; for (const u of urls) (groups[host(u)] = groups[host(u)] || []).push(u);
  const titles = new Map(); for (const i of D.items) for (const u of [i.source_url, ...(i.source_urls || [])]) { const t = i.title || i.metric || i.platform; if (u && t && !titles.has(u)) titles.set(u, String(t)); }
  $('#sources-body').innerHTML = `<div class="src-grid"><div><h3 class="h3" style="margin-top:0">Web sources (${urls.length}, retrieved ${esc(meta.generated ? new Date(meta.generated + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')})</h3><ul class="src-list">${Object.entries(groups).sort().map(([h, us]) => `<li><span class="dom">${esc(h)}</span>${us.map(u => `${ext(u, srcLabel(u, titles))}${snip.has(u) ? ' <span class="mut">(search snippet)</span>' : ''} <span class="mut">· ${uses(u)} item${uses(u) === 1 ? '' : 's'}</span>`).join('<br>')}</li>`).join('')}</ul></div>
  <div><h3 class="h3" style="margin-top:0">Portal datasets</h3><ul class="cav"><li><b>Punctual Pros ad plan</b>: ${num(meta.item_count || D.items.length)} items (${Object.entries(meta.counts_by_kind || {}).map(([k, v]) => `${v} ${KIND_LABEL[k] || k.replace(/_/g, ' ')}`).join(', ')})</li><li><b>Punctual Pros demand model</b>: National Weather Service zones, event plans and weather hubs</li><li><b>Punctual Pros ZIP-code model</b>: ${num(meta.territory_facts?.pa_core_zips || 248)} core ZIPs, ${num(meta.territory_facts?.pa_core_housing_units || 1001408)} housing units</li><li><b>Punctual Pros deed records (PA and NJ)</b>: arm’s-length residential buyers by county (row counts as of Sept 24, 2026)</li><li><b>Punctual Pros public filings</b>: ~$22M FY2025 revenue est., 6% royalty + ~1.2–1.5% brand fund</li><li>NWS warnings 2019–2025: ${ext(VTEC.url, 'Iowa Environmental Mesonet VTEC archive')} for 24 Punctual Pros county and zone codes (retrieved Oct 6, 2026)</li><li>Live: National Weather Service active alerts and county zone shapes (api.weather.gov)</li><li>Sample renders: two animatics produced for this concept</li></ul>
  <h3 class="h3">Caveats</h3><ul class="cav">${(meta.caveats || []).map(c => `<li>${esc(plainAds(c))}</li>`).join('')}</ul>
  <h3 class="h3">Method</h3><p class="fn">CTV platform terms, benchmarks and franchisor brand promises were read on the cited pages on Oct 6, 2026; where a page was gated, the figure comes from the search-engine result for that URL and is marked as a search snippet. Territory facts come from the portal’s datasets: the Punctual Pros ZIP-code model (248 core ZIPs, 1,001,408 housing units, 61 Tier-I ZIPs with 336,002 units), county deed records (trailing 12 months of arm’s-length residential sales; 33% of Lancaster, York, Cumberland and Dauphin sales are pre-1980 homes), Punctual Pros storm events (NOAA monthly counts) and the Punctual Pros demand model (National Weather Service plans). Media plans are computed from the benchmark items with explicit formulas; every output is an estimate. Creative is original sample copy written to each brand’s published guarantee language.</p></div></div>`;
}

/* ── chat ────────────────────────────────────────────────────────────────── */
function mountChat(Chat, D) {
  if (!Chat) return null;
  const p1 = D?.p1; const plat = D ? D.K('ctv_platform') : [];
  const cheap = plat.filter(p => p.minimum_spend_usd != null && p.minimum_spend_usd <= 500 && p.self_serve).sort((a, b) => a.minimum_spend_usd - b.minimum_spend_usd);
  const here = (h, l) => ({ href: '#' + h, l });
  const faq = [
    { q: 'What does the ad program cost per month?', a: `<p>Phase 1 (Central PA, Nov 2026–Apr 2027) is <b>${money(p1?.monthly_budget_usd || 50000)}/month</b>: 30% Local Services Ads, 30% zip-targeted CTV, 15% search/PMax, 15% new-mover mail, 10% Meta. Conservative case: ~${num(p1 ? consOf(p1).jobs : 142)} incremental booked jobs a month (upside ~${num(p1?.totals_est?.booked_jobs || 269)} attributed) <span class="ch-badge">est.</span> Whether this is new money or a re-allocation needs Punctual Pros’ current marketing spend.</p>`, href: '#plan' },
    { q: 'What is the expected cost per booked job?', a: `<p>Conservative: about <b>${money(p1 ? consOf(p1).cpa : 351)}</b> per incremental booked job in Phase 1, after cutting LSA, search and Meta jobs by half and CTV and mail by a quarter for demand Punctual Pros would get anyway <span class="ch-badge">est.</span>. Upside (every attributed job counted): ${money(p1?.expected_cpa_usd || 186)}. By channel, attributed: LSA ~$117, search ~$249, CTV ~$416. The test replaces these with measured numbers.</p>`, href: '#calc' },
    { q: 'Which CTV platform should we start with? Cheapest connected TV', a: `<p>Start with <b>Vibe</b> ($50 minimum, $15–35 CPM, zip + CRM upload, no platform fee) and either <b>Disney Campaign Manager</b> ($500 minimum, $25–40 CPM, zip) or <b>YouTube on TV screens</b> (same Google Ads account as LSA). Avoid DMA-only buys such as Roku self-serve or Amazon Sponsored TV, because most of those impressions land outside Punctual Pros’ zips.</p>${cheap.length ? `<p>Self-serve with ≤$500 minimum: ${cheap.map(p => esc(p.platform.split(' (')[0])).join(', ')}.</p>` : ''}`, href: '#platforms' },
    { q: 'Why connected TV for a local HVAC company?', a: '<p>Self-serve CTV now starts at $50–500 with ~$15–40 CPMs and <b>zip targeting</b>, so Punctual Pros can buy TV in its ~240 zips instead of the whole Harrisburg or Philadelphia DMA. The job of CTV is to make the brand familiar before the furnace fails and to lift branded search and LSA conversion. It is judged on cost per booked job and geo-holdout lift.</p>', href: '#thesis' },
    { q: 'How do the NWS triggers turn CTV on?', a: '<p>When api.weather.gov issues a Winter Storm, Ice Storm or Extreme Cold warning for a Punctual Pros county (matched by UGC code), that county’s zips get <b>+50% CTV for 72 h</b> with the “Storm Ready” cut. The LSA weekly cap goes up and the frozen-pipe vertical is boosted on Meta. Winter Storm Warnings come ~2 times a year per county, mostly in January–February; all rules together add only ~$5k a year at Phase 1 weights.</p>', href: '#targeting' },
    { q: 'How do new-mover postcards work?', a: '<p>Each recorded deed in Punctual Pros’ counties starts a drip. Postcard #1 (welcome checkup) goes out on day 7. The same household is matched for CTV from day 7 to 60. Postcard #2 (older-home safety, pre-1980 homes only) goes out on day 45, and a membership follow-up on day 90. That is ~2,300 PA and ~1,150 NJ buyers a month (est.). ServiceTitan customers are suppressed and 20% are held out. That is ~2,450 drip pieces a month in PA; the rest of the mail line is saturation mail to older homes.</p>', href: '#mail' },
    { q: 'How will we know the ads worked? Measurement and attribution', a: '<p>Every channel and creative gets its own call-tracking number, UTM and QR in ServiceTitan. CTV is read with a <b>matched-pair geo holdout</b> (~30 of 61 Tier-I zips dark for 12 weeks, adjusted for each zip’s prior-year jobs). Mail is read on tracked response, with bookings against a 20% holdout of new movers pooled over the season. The primary KPI is cost per incremental booked job. Completion rate is not a KPI, because CTV is non-skippable.</p>', href: '#test' },
    { q: 'What is the 8-week test plan?', a: '<p>Week 1: tracking, pixels, LSA clean-up, holdouts. Week 2: CTV A/B (Storm Ready vs We Watch the Clock) and mail drop 1. Week 3: speed-to-lead texting. Week 4: first read. Weather rules run all season in randomly assigned counties. Week 6: vendor A/B. Week 7: membership. Week 8: LSA, search and Meta decision. CTV decision at week 12, because an 8-week read cannot detect a realistic lift. About $95.5k for the first 8 weeks.</p>', href: '#test' },
    { q: 'Are the offers and prices real?', a: '<p>No. Offers are <b>illustrative</b> until Punctual Pros confirms them against its price book. Multi-brand creative needs Authority Brands approval. Guarantee wording is quoted from each brand’s published guarantee page. For Mister Sparky the safe line (“America’s On-Time Electrician®”) is used until Punctual Pros confirms which guarantee applies locally.</p>', href: '#guardrails' },
    { q: 'What does creative production cost?', a: '<p>Hero :30 brand spot: ~$8–20k for a local crew (one 2-day shoot yields the :15 and vertical cut-downs). The :15 storm/new-home spots cost ~$2.5–4k each, or ~$0–500 through AI builders (Vibe Studio, Waymark) using existing van and tech footage. Social verticals run $400–600 and display sets ~$300.</p>', href: '#ctv' },
    { q: 'What about the Jersey Shore and Horvath?', a: '<p>Phase 2 (from Mar 2027) runs <b>$15k/month</b> in Ocean and Monmouth: 35% zip-only CTV, 35% LSA, 20% new-mover mail, 10% search. It never buys the NY or Philadelphia DMA, where more than 90% of impressions would fall outside the service area. Storm triggers cover tropical storm, coastal flood and heat.</p>', href: '#plan' },
    { q: 'Why Google Local Services Ads first?', a: '<p>LSA gives the cheapest high-intent leads in the category: $39–57 per lead at a ~44% book rate (SearchLight, Feb 2026). LSA ranks on reviews, responsiveness and proximity rather than bids, so the work is review-request texts and answering within minutes.</p>', href: '#lsa' },
    { q: 'Does this work for Fair Harbor?', a: '<p>Yes. A 6-week, $30k CTV pilot (Vibe 60% / MNTN 40%) built on Shopify-customer lookalikes and cart retargeting, with 20% of the top-50 DTC zips held dark. Planning ROAS is 1.5–3.0× (est.). There is also a co-op flight around wholesale doors.</p>', href: '#fh' },
    { q: 'Why not buy the whole TV market (DMA)?', a: '<p>The Harrisburg–Lancaster–Lebanon–York DMA has ~2.1M people, and Punctual Pros serves ~240 zips (~1.0M housing units) across 9 counties. Zip-targeted self-serve CTV removes that waste. Linear TV through Comcast’s Harrisburg zones is only an option after CTV proves its cost per booked job.</p>', href: '#platforms' },
  ].map(f => ({ q: f.q, a: f.a, href: f.href }));
  const intents = D ? [
    { id: 'ads_platforms', rx: [/(ctv|connected.?tv|streaming).*(platform|vendor|cheap|minimum|start|where|which)|which (ctv|platform)|cheapest (tv|ctv)/i], run: async () => ({ html: `<h4>Cheapest ways onto the TV screen</h4><table><thead><tr><th>Platform</th><th>Min</th><th>CPM</th><th>Zip</th><th>Fit</th></tr></thead><tbody>${plat.slice().sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.fit_for_pp] - { high: 0, medium: 1, low: 2 }[b.fit_for_pp])).slice(0, 8).map(p => `<tr><td><b>${esc(p.platform.split(' (')[0])}</b></td><td>${p.minimum_spend_usd != null ? money(p.minimum_spend_usd) : '—'}</td><td>${Array.isArray(p.cpm_range_usd) ? `$${p.cpm_range_usd[0]}–${p.cpm_range_usd[1]}` : '—'}</td><td>${(p.targeting || []).includes('zip') ? '✓' : '—'}</td><td>${esc(p.fit_for_pp)}</td></tr>`).join('')}</tbody></table><p>Start with Vibe + Disney Campaign Manager or YouTube TV screens, all zip-targeted.</p>`, links: [`<a class="ch-link" href="#platforms">Full platform comparison →</a>`], followups: ['What is the expected cost per booked job?', 'How do the NWS triggers turn CTV on?'] }) },
    { id: 'ads_cpa', rx: [/cost per (booked )?job|\bcpa\b|cost per (lead|customer)|how many (leads|jobs)|roas|pay ?back/i], run: async () => ({ html: `<h4>Modelled economics, conservative <span class="ch-badge">est.</span></h4><table><thead><tr><th>Phase</th><th>$/mo</th><th>Incr. jobs</th><th>$/incr. job</th><th>Contribution</th></tr></thead><tbody>${D.plans.map((p, i) => { const c = consOf(p); return `<tr><td>Phase ${i + 1}</td><td>${money(p.monthly_budget_usd)}</td><td>${num(c.jobs)} <small>(${num(p.totals_est.booked_jobs)} attr.)</small></td><td>${money(c.cpa)}</td><td>${signed(c.contrib)}</td></tr>`; }).join('')}</tbody></table><p>Incremental = attributed jobs less demand Punctual Pros would get anyway; contribution is after technician labour, materials and ~7.5% franchise fees, net of media.</p>`, links: [`<a class="ch-link" href="#calc">Open the calculator →</a>`], followups: ['What is the 8-week test plan?', 'Which CTV platform should we start with?'] }) },
  ] : [];
  try {
    return Chat.mount(null, { persona: 'pp', short_name: 'Punctual Pros', mode: 'floating', theme: 'light', faq, intents, suggestions: ['Which CTV platform should we start with?', 'How do the NWS triggers turn CTV on?', 'What is the expected cost per booked job?', 'How do new-mover postcards work?', 'What is the 8-week test plan?', 'Does this work for Fair Harbor?'] });
  } catch (e) { console.info('[ads] chat mount skipped', e.message); return null; }
}
