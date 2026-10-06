/* ═══════════════════════════════════════════════════════════════════════════
   How Broad Sky buys · shared logic for the portal module (modules/bsp.js) and
   the methodology page (redesigns/methodology.html). Pure functions only: no
   DOM framework, no portal runtime. Datasets: Broad Sky acquisition methodology,
   Broad Sky professional network, Punctual Pros / CET / Frontline and Thomas
   Scientific add-on target screens.
   Prepared by Syed Rahman.
   ═══════════════════════════════════════════════════════════════════════════ */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => v == null || v === '' || isNaN(v) ? null : Number(v);
export const median = a => { const v = a.filter(x => x != null && !isNaN(x)).map(Number).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
export const clip = (s, n = 170) => { s = String(s ?? ''); if (s.length <= n) return s; const cut = s.slice(0, n); const i = cut.lastIndexOf('. '); return i > 70 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, '') + '…'; };
const DAY = 864e5, MONTH_DAYS = 30.4375;
const toDate = s => { const d = new Date(String(s).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? null : d; };
export const monthsBetween = (a, b) => { const x = toDate(a), y = toDate(b); return x && y ? (y - x) / DAY / MONTH_DAYS : null; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
export const fmtMonth = s => { const d = toDate(s); return d ? `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '—'; };
export const estHTML = h => String(h ?? '').replace(/\best\.(?=[\s,;)]|$)/g, '<span class="sys-est">est.</span>');
export const fmtDay = s => { const d = toDate(s); return d ? `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : '—'; };
export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const TODAY = '2026-10-06';

/* ── Platforms (portfolio order per UNIFIED §6, Smith + Howard last as the exited template) ── */
export const PLATFORMS = {
  pp: { key: 'pp', name: 'Punctual Pros', short: 'Punctual Pros', co: 'pp', node: 'pc-pp', re: /punctual/i },
  cet: { key: 'cet', name: 'Commonwealth Electrical Technologies', short: 'CET', co: 'cet', node: 'pc-cet', re: /commonwealth|\bcet\b/i },
  fl: { key: 'fl', name: 'Frontline Managed Services', short: 'Frontline', co: 'fl', node: 'pc-fl', re: /frontline/i },
  ts: { key: 'ts', name: 'Thomas Scientific', short: 'Thomas Scientific', co: 'ts', node: 'pc-ts', re: /thomas/i },
  bpi: { key: 'bpi', name: 'Bully Pulpit International', short: 'BPI', co: 'bpi', node: 'pc-bpi', re: /bully|\bbpi\b/i },
  fh: { key: 'fh', name: 'Fair Harbor', short: 'Fair Harbor', co: 'fh', node: 'pc-fh', re: /fair harbor/i },
  sh: { key: 'sh', name: 'Smith + Howard', short: 'Smith + Howard', co: null, node: 'pc-sh', re: /smith \+ howard|smith & howard/i },
};
export const PORDER = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh', 'sh'];
export const platformOf = s => PORDER.find(k => PLATFORMS[k].re.test(String(s || ''))) || null;

export const SELLER = { pe_sponsor: 'Private-equity sponsor', founder: 'Founder', partner_owned: 'Partner-owned', franchisee: 'Franchisee owner', family: 'Family-owned' };
export const sellerLabel = v => SELLER[v] || (v ? String(v).replace(/_/g, ' ') : 'Not disclosed');
export const DEAL_TYPE = { platform: 'Anchor', add_on: 'Add-on', exit: 'Exit' };
export const STRENGTH = { strong: 'Strong', moderate: 'Moderate', weak: 'Weak' };

/* ── Plain-English pass over dataset text (file names and dataset ids → human names) ── */
const DS_NAMES = { cet_filings: 'CET public filings', bpi_filings: 'BPI public filings', pp_filings: 'Punctual Pros public filings', fairharbor_filings: 'Fair Harbor public filings', thomas_filings: 'Thomas Scientific public filings', frontline_filings: 'Frontline public filings', rival_filings: 'competitor filings', pe_landscape: 'private-equity landscape', ma_targets_pp: 'Punctual Pros add-on screen', ma_targets_cet: 'CET add-on screen', ma_targets_fl_ts: 'Frontline and Thomas Scientific add-on screens', bsp_firm: 'Broad Sky firm profile', bsp_methodology: 'Broad Sky methodology', bsp_network: 'Broad Sky network', pp_market: 'Punctual Pros market model', pp_zips: 'Punctual Pros zip model' };
export const tx = v => typeof v !== 'string' ? v : v
  .replace(/\bBSP(?![-\w])/g, 'Broad Sky')
  .replace(/\bma_targets_\*(?:\.json)?/g, 'add-on target screens').replace(/\*_filings(?:\.json)?/g, 'company filings')
  .replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\.json(#[\w-]+)?/g, (m, id) => DS_NAMES[id] || id.replace(/_/g, ' '))
  .replace(/\b(ma_targets_(?:pp|cet|fl_ts)|[a-z]+_filings|pe_landscape|bsp_firm)\b/g, m => DS_NAMES[m] || m.replace(/_/g, ' '));
const KEEP = /(^|_)(url|urls|id|ids|ref|kind|type|relation|deal_type|seller_type|channel_type|strength|date|retrieved|website|sources)$/;
function clean(o, key = '') {
  if (Array.isArray(o)) return KEEP.test(key) ? o : o.map(x => clean(x, key));
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = KEEP.test(k) ? v : clean(v, k); return r; }
  return typeof o === 'string' ? tx(o) : o;
}

/* ── Load ─────────────────────────────────────────────────────────────────── */
/** loader(name) → dataset object or null. Returns the bundle every view uses. */
export async function loadBundle(loader) {
  const names = ['bsp_methodology', 'bsp_network', 'ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts'];
  const res = await Promise.all(names.map(n => Promise.resolve(loader(n)).catch(() => null)));
  const [meth, net, pp, cet, flts] = res.map(d => d ? clean(d) : d);
  const missing = names.filter((n, i) => !res[i]);
  const items = meth?.items || [];
  const K = k => items.filter(i => i.kind === k);
  const deals = K('deal').map(d => ({ ...d, _p: platformOf(d.platform), _t: toDate(d.date)?.getTime() ?? null })).sort((a, b) => (a._t ?? 0) - (b._t ?? 0));
  const b = {
    meth, net, missing, deals,
    dealById: new Map(deals.map(d => [d.id, d])),
    patterns: K('pattern'), criteria: K('criterion'), channels: K('sourcing_channel'),
    pools: { pp, cet, flts },
  };
  b.cadence = cadence(b);
  b.graph = net ? buildGraph(net) : null;
  b.scored = scoreTargets(b);
  return b;
}

/* ── Cadence (computed from the deal records; BSP-stated add-on counts from the dataset) ── */
export function cadence(b) {
  const plats = b.deals.filter(d => d.deal_type === 'platform');
  const gaps = plats.slice(1).map((d, i) => ({ from: plats[i], to: d, months: monthsBetween(plats[i].date, d.date) }));
  const firstAddon = plats.map(p => {
    const adds = b.deals.filter(d => d.deal_type === 'add_on' && d._p === p._p);
    const first = adds[0] || null;
    return { p: p._p, platform: p, first, months: first ? monthsBetween(p.date, first.date) : null, named: adds.length, sinceMonths: monthsBetween(p.date, TODAY) };
  });
  const cs = b.meth?.meta?.cadence_stats || {};
  const rates = Object.entries(cs.add_ons_per_platform_per_year || {}).map(([name, v]) => ({ p: platformOf(name), name, stated: v.add_ons_stated_by_bsp, years: v.years_held, perYear: v.add_ons_per_year }));
  const exit = b.deals.find(d => d.deal_type === 'exit');
  const exitPlat = exit ? plats.find(p => p._p === exit._p) : null;
  return {
    gaps, medianGap: median(gaps.map(g => g.months)), meanGap: gaps.length ? gaps.reduce((a, g) => a + g.months, 0) / gaps.length : null,
    firstAddon, medianFirst: median(firstAddon.filter(f => f.months != null).map(f => f.months)),
    rates, portfolioRate: cs.portfolio_add_ons_per_platform_year ?? null, activeRate: cs.median_add_ons_per_platform_per_year_active_buyers ?? null,
    addonsStated: cs.add_ons_stated_by_bsp ?? null, addonsNamed: b.deals.filter(d => d.deal_type === 'add_on').length,
    exitHold: exit && exitPlat ? monthsBetween(exitPlat.date, exit.date) : null, exit,
    pePlatforms: plats.filter(p => p.seller_type === 'pe_sponsor').length, platforms: plats.length,
    peAddons: b.deals.filter(d => d.deal_type === 'add_on' && d.seller_type === 'pe_sponsor').length,
    basis: cs.basis || null,
  };
}

/* ── Rubric ───────────────────────────────────────────────────────────────── */
/* Platform hubs used for straight-line adjacency (same nodes as the acquisition engine). */
const PP_NODES = [['Lancaster', 40.06, -76.37], ['Harrisburg', 40.2732, -76.8867], ['York', 39.9626, -76.7277], ['Toms River', 39.9537, -74.1979]];
const miles = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, h = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 2 * 3958.8 * Math.asin(Math.sqrt(h)); };
const DIM_MAX = { pp: 20, cet: 20, fl: 5, ts: 5 };

/* Which rubric criteria the target screens let us test, and how. Untested criteria are held at a neutral 3 of 5. */
export const TESTS = {
  'crit-essential': { tested: 'platform', how: 'Company-level: Punctual Pros, Frontline and CET are non-discretionary (repair, managed services, electrical and wastewater service) = 5; Thomas Scientific lab supply is repeat but proved cyclical after the COVID peak = 3.' },
  'crit-recurring': { tested: false, how: 'Not in the target screens. Held at a neutral 3 until diligence measures contracted or membership revenue.' },
  'crit-fragmentation': { tested: 'platform', how: 'Counted live: independent, non-sponsor targets in the company’s own screen. 25 or more = 5, 10–24 = 3, under 10 = 1.' },
  'crit-founder-transition': { tested: true, how: 'Ownership class (founder or family with 20+ years = 4, founder or family or franchisee = 3.5, independent = 3, unverified = 2, sponsor-owned, subsidiary or ESOP = 1), averaged with the screen’s own ownership-readiness sub-score. A 5 needs proof the owner stays with a successor named, which only a first call can supply.' },
  'crit-size-band': { tested: true, how: 'Add-on band of 10–150 employees = 5; 5–9 or 151–250 = 3; otherwise 1. Without headcount, modeled revenue of $3–40M = 4, else 2. Unknown = 2.' },
  'crit-geo-adjacency': { tested: true, how: 'Straight-line miles to the nearest portfolio company hub (Punctual Pros: Lancaster, Harrisburg, York, Toms River; CET: Worcester, Taunton, Norwell, Horton CT). 60 mi or less = 5, 60–150 = 3, beyond = 1. Frontline and Thomas Scientific use the screen’s geography sub-score (fills a named gap = 5). CET targets in New York score 1 (no NYC).' },
  'crit-thematic-tailwind': { tested: 'proxy', how: 'Proxy: rank inside the company’s own screen (fit score encodes the company thesis). Top fifth = 5, then 4, 3, 2, bottom fifth = 1, so companies with different screens compare fairly.' },
  'crit-tech-upside': { tested: false, how: 'Not in the target screens. Held at a neutral 3 until the tooling gap is checked (job posts, web stack).' },
  'crit-mgmt-culture': { tested: false, how: 'Not in the target screens. Held at a neutral 3 until the bench below the owner is known.' },
  'crit-downside': { tested: true, how: 'Risk flags: start at 4 (a 5 needs earnings, leverage and concentration data from diligence), minus 1 per serious flag (union model, acquirer or anti-sale stance, sponsor or ESOP owner, concentration, regulatory), minus 0.5 per business-risk flag (key-person, cyclical or seasonal demand, contested market, non-core revenue) and per data-gap flag. Size and distance flags are not counted twice. Thomas Scientific targets lose 1 more because the company loan is marked near 88% of par.' },
};
const ESSENTIAL = { pp: 5, cet: 5, fl: 5, ts: 3 };
/** Criteria tested per target (the Broad Sky fit score); platform-level and neutral criteria are context only. */
export const isTargetTest = id => TESTS[id]?.tested === true || TESTS[id]?.tested === 'proxy';
const SERIOUS = /union|anti-?pe|stay independent|prefer to stay|itself an acquirer|acquirer|esop|employee-owned|sponsor|private equity|pe-backed|subsidiary|part of|concentration|regulat|litigation|lawsuit|osha|violation|declin|distress|bankrupt|name collision|affiliat/i;
const MINOR = /transfer approval|consent|rebrand|not (disclosed|verified|public|found|captured|named)|undisclosed|unverified|modeled|modelled|estimate|unknown|no clean record|may be overstated|thin|limited data/i;
/* Business risks the size and adjacency tests do not already price: key-person, cyclical or seasonal demand, contested markets, non-core revenue. */
const BUSINESS = /key-person|founder dependence|cyclical|seasonal|contested|competes with|non-core|outside the core|carve-out|residential exposure|both needed/i;

export function ownerClass(t) {
  const x = String(t.ownership || '').toLowerCase();
  if (/subsidiary|part of|venture|pe-backed|private equity|backed by|\bsponsor\b(?! disclosed)/.test(x.replace(/no sponsor disclosed/g, ''))) return 'Sponsor or corporate';
  if (/esop|employee-owned/.test(x)) return 'ESOP';
  if (/franchisee_founder|founder|family|partner-owned/.test(x)) return 'Founder or family';
  if (/franchisee/.test(x)) return 'Franchisee';
  if (/unknown|unverified|not disclosed|not verified|^$/.test(x)) return 'Unverified';
  return 'Independent';
}
export const isAffiliated = t => /punctual\s*pros/i.test(String(t?.company || '')) || (t?.risk_flags || []).some(r => /name collision|already affiliated/i.test(r));
export const ceoFix = s => s == null ? s : String(s)
  .replace(/Frontline CEO Seelin Naidoo['’]s stated expansion geographies(?:\s*\(California, Texas\))?/g, 'Frontline’s stated priority geographies (CA, TX; set under former CEO Naidoo, to be re-confirmed with CEO Tim Britt)')
  .replace(/(?:Frontline )?CEO Seelin Naidoo(?:['’]s)?/g, m => /['’]s$/.test(m) ? 'former CEO Seelin Naidoo’s' : 'former CEO Seelin Naidoo');

function nearestHub(t, p) {
  if (p === 'pp') {
    if (t.lat != null && t.lon != null) { let best = null; for (const [n, la, lo] of PP_NODES) { const d = miles(t.lat, t.lon, la, lo); if (!best || d < best.mi) best = { node: n, mi: d }; } return best; }
    const a = num(t.distance_mi_from_lancaster), c = num(t.distance_mi_from_toms_river);
    if (a == null && c == null) return null; return c == null || (a != null && a <= c) ? { node: 'Lancaster', mi: a } : { node: 'Toms River', mi: c };
  }
  if (p === 'cet') { const m = num(t.nearest_cet_node_miles); return m == null ? null : { node: String(t.nearest_cet_node || 'nearest CET site').replace(/\s*\(.*\)$/, ''), mi: m }; }
  return null;
}
const r1 = v => Math.round(v * 10) / 10;
const clamp = v => Math.max(1, Math.min(5, v));
const pctRankScore = (rank, n) => { if (n <= 1) return 3; const q = rank / (n - 1); return q <= .2 ? 5 : q <= .4 ? 4 : q <= .6 ? 3 : q <= .8 ? 2 : 1; };

/** Score every target in the add-on screens against the inferred rubric. */
export function scoreTargets(b) {
  const crit = b.criteria.length ? b.criteria : [];
  const W = Object.fromEntries(crit.map(c => [c.id, Number(c.weight_pct) || 0]));
  const rows = [];
  const add = (t, p) => rows.push({ ...t, strategic_rationale: ceoFix(t.strategic_rationale), _p: p, _plat: PLATFORMS[p].short, _owner: ownerClass(t), _affil: isAffiliated(t), fit_score: num(t.fit_score), employees: num(t.employees), revenue_est_usd: num(t.revenue_est_usd) });
  (b.pools.pp?.items || []).forEach(t => add(t, 'pp'));
  (b.pools.cet?.items || []).forEach(t => add(t, 'cet'));
  (b.pools.flts?.items || []).forEach(t => add(t, t.platform === 'frontline' ? 'fl' : 'ts'));
  // fragmentation: live count of independent, non-sponsor targets per company screen
  const indep = {}; for (const r of rows) if (!r._affil && !/Sponsor|ESOP/.test(r._owner)) indep[r._p] = (indep[r._p] || 0) + 1;
  // within-platform fit percentile
  const byP = {}; for (const r of rows) (byP[r._p] ||= []).push(r);
  for (const list of Object.values(byP)) { list.slice().sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)).forEach((r, i, arr) => { r._fitRank = i; r._fitN = arr.length; }); }
  const tsStress = /88% of par|near zero/i.test(JSON.stringify(b.net?.meta?.caveats || '') + JSON.stringify(b.meth?.meta?.methodology_narrative || ''));

  for (const r of rows) {
    const s = {}, why = {};
    // essentiality (platform-level)
    s['crit-essential'] = ESSENTIAL[r._p] ?? 3; why['crit-essential'] = r._p === 'ts' ? 'lab supply: repeat but cyclical' : 'non-discretionary portfolio company';
    // fragmentation (platform-level, counted)
    const n = indep[r._p] || 0; s['crit-fragmentation'] = n >= 25 ? 5 : n >= 10 ? 3 : 1; why['crit-fragmentation'] = `${n} independent targets in the ${PLATFORMS[r._p].short} screen`;
    // founder / transition readiness
    const yrs = r.founded_year ? 2026 - Number(r.founded_year) : null;
    // A 5 needs evidence the founder stays and a successor exists, which no screen carries: the class score tops out at 4.
    const cls = r._owner === 'Founder or family' ? (yrs != null && yrs >= 20 ? 4 : 3.5) : r._owner === 'Franchisee' ? 3.5 : r._owner === 'Independent' ? 3 : r._owner === 'Unverified' ? 2 : 1;
    const orv = num(r.fit_breakdown?.ownership_readiness); const om = DIM_MAX[r._p] || 20;
    const scr = orv == null ? null : Math.min(4, clamp(1 + 4 * orv / om));
    s['crit-founder-transition'] = r1(scr == null ? cls : (cls + scr) / 2);
    why['crit-founder-transition'] = `${r._owner.toLowerCase()}${yrs != null ? `, founded ${r.founded_year}` : ''}`;
    // size band
    if (r.employees != null) { const e = r.employees; s['crit-size-band'] = e >= 10 && e <= 150 ? 5 : (e >= 5 && e < 10) || (e > 150 && e <= 250) ? 3 : 1; why['crit-size-band'] = `${e} employees`; }
    else if (r.revenue_est_usd != null) { const m = r.revenue_est_usd / 1e6; s['crit-size-band'] = m >= 3 && m <= 40 ? 4 : 2; why['crit-size-band'] = `~$${m.toFixed(1)}M modeled revenue`; }
    else { s['crit-size-band'] = 2; why['crit-size-band'] = 'size not disclosed'; }
    // geography
    const hub = nearestHub(r, r._p);
    if (r._p === 'cet' && /^NY$/i.test(r.state || '')) { s['crit-geo-adjacency'] = 1; why['crit-geo-adjacency'] = 'New York is outside CET’s New England footprint'; }
    else if (hub) { const mi = Math.round(hub.mi); s['crit-geo-adjacency'] = mi <= 60 ? 5 : mi <= 150 ? 3 : 1; why['crit-geo-adjacency'] = mi < 1 ? `same town as the ${hub.node} hub` : `${mi} mi from ${hub.node}`; r._hub = hub.node; r._hubMi = mi; }
    else if (DIM_MAX[r._p] === 5 && num(r.fit_breakdown?.geography) != null) { const g = num(r.fit_breakdown.geography); s['crit-geo-adjacency'] = clamp(g); why['crit-geo-adjacency'] = g >= 5 ? 'fills a named geographic gap (screen 5 of 5)' : `screen geography ${g} of 5`; }
    else { s['crit-geo-adjacency'] = 2; why['crit-geo-adjacency'] = 'location not scored'; }
    // thematic tailwind proxy: platform-screen percentile
    s['crit-thematic-tailwind'] = pctRankScore(r._fitRank ?? 0, r._fitN ?? 1);
    why['crit-thematic-tailwind'] = `#${(r._fitRank ?? 0) + 1} of ${r._fitN ?? 1} in the ${PLATFORMS[r._p].short} screen, fit ${r.fit_score ?? '—'}`;
    // downside
    const flags = r.risk_flags || []; const serious = flags.filter(f => SERIOUS.test(f)); const biz = flags.filter(f => !SERIOUS.test(f) && BUSINESS.test(f)); const minor = flags.filter(f => !SERIOUS.test(f) && !BUSINESS.test(f) && MINOR.test(f));
    // A 5 needs stable earnings, leverage and concentration data the screens do not carry: a clean flag list tops out at 4.
    let dn = 4 - serious.length - 0.5 * (biz.length + minor.length); if (r._p === 'ts' && tsStress) dn -= 1;
    s['crit-downside'] = r1(clamp(dn)); why['crit-downside'] = `${serious.length} serious, ${biz.length} business-risk, ${minor.length} data-gap flag${minor.length === 1 ? '' : 's'}${r._p === 'ts' && tsStress ? '; company loan marked near 88% of par' : ''}`;
    r._serious = [...serious, ...biz];
    // untested criteria
    for (const id of ['crit-recurring', 'crit-tech-upside', 'crit-mgmt-culture']) { s[id] = 3; why[id] = 'not tested · neutral'; }
    // Broad Sky fit = the target-level tests only (owner readiness, size band, adjacency, platform-thesis fit, downside),
    // each at its rubric weight, renormalised to 0-100. The full rubric (platform-level essentiality and runway, three
    // criteria held neutral) is kept as context in _full.
    let tot = 0, wsum = 0, ftot = 0, fsum = 0;
    for (const c of crit) { const w = W[c.id] || 0; fsum += w; ftot += w * (s[c.id] ?? 3); if (isTargetTest(c.id)) { wsum += w; tot += w * (s[c.id] ?? 3); } }
    r._crit = s; r._why = why; r._score = wsum ? Math.round(tot / 5 * (100 / wsum)) : null; r._tested = wsum; r._full = fsum ? Math.round(ftot / 5 * (100 / fsum)) : null;
    r._gate = r._score == null ? '—' : r._score >= 70 ? 'Priority' : r._score >= 55 ? 'Watch list' : 'Pass';
    r._explain = explain(r, crit, W);
  }
  const ranked = rows.filter(r => !r._affil).sort((a, b) => (b._score - a._score) || ((b.fit_score || 0) - (a.fit_score || 0)));
  ranked.forEach((r, i) => { r._rank = i + 1; });
  rows.filter(r => r._affil).forEach(r => { r._rank = null; r._gate = 'Held out'; });
  return { rows, ranked, indep, weights: W };
}

const SHORT = { 'crit-essential': 'essential sector', 'crit-recurring': 'recurring revenue', 'crit-fragmentation': 'add-on runway', 'crit-founder-transition': 'owner readiness', 'crit-size-band': 'size band', 'crit-geo-adjacency': 'adjacency', 'crit-thematic-tailwind': 'company-thesis fit', 'crit-tech-upside': 'tech upside', 'crit-mgmt-culture': 'bench and culture', 'crit-downside': 'downside' };
export const critShort = id => SHORT[id] || id;
function explain(r, crit, W) {
  const tested = crit.filter(c => TESTS[c.id]?.tested === true || TESTS[c.id]?.tested === 'proxy');
  const strong = tested.filter(c => r._crit[c.id] >= 4.5).sort((a, b) => W[b.id] - W[a.id]).slice(0, 3);
  const weak = tested.filter(c => r._crit[c.id] <= 2.5).sort((a, b) => W[b.id] - W[a.id]).slice(0, 2);
  const parts = [];
  if (strong.length) parts.push('Strong on ' + strong.map(c => `${SHORT[c.id]} (${r._why[c.id]})`).join('; '));
  if (weak.length) parts.push('weak on ' + weak.map(c => `${SHORT[c.id]} (${r._why[c.id]})`).join('; '));
  if (!parts.length) parts.push('Middle of the band on every tested criterion');
  return parts.join('; ') + '.';
}

/* ── Network graph ────────────────────────────────────────────────────────── */
export const GROUPS = [
  { id: 1, label: 'Broad Sky team', types: ['firm', 'bsp_team', 'operating_partner'], shape: 'circle' },
  { id: 2, label: 'Executive Board', types: ['executive_board'], shape: 'diamond' },
  { id: 3, label: 'Portfolio companies and leaders', types: ['portfolio_company', 'portfolio_ceo', 'portfolio_board'], shape: 'square' },
  { id: 4, label: 'Advisers, bankers and counsel', types: ['advisor_banker'], shape: 'triangle' },
  { id: 5, label: 'Lenders, LPs and other sponsors', types: ['lender', 'lp_investor', 'counterparty_sponsor'], shape: 'tri-down' },
  { id: 6, label: 'Franchisors and industry bodies', types: ['franchisor', 'industry_body'], shape: 'pentagon' },
  { id: 7, label: 'Former firms', types: ['former_firm'], shape: 'ring' },
];
const groupOf = type => (GROUPS.find(g => g.types.includes(type)) || GROUPS[6]).id;
export const TYPE_LABEL = { firm: 'Sponsor (hub)', bsp_team: 'Broad Sky team', operating_partner: 'Operating partner', executive_board: 'Executive Board', portfolio_company: 'Portfolio company', portfolio_ceo: 'Portfolio leader', portfolio_board: 'Portfolio board', advisor_banker: 'Adviser or banker', lender: 'Lender', lp_investor: 'Investor or LP', counterparty_sponsor: 'Other sponsor', franchisor: 'Franchisor', former_firm: 'Former firm', industry_body: 'Industry body' };
export const REL_LABEL = { works_at: 'works at', board_of: 'board of', advised_deal: 'advised', lent_to: 'lent to', co_invested: 'co-invested in', former_colleague: 'former colleague of', franchisor_of: 'franchisor of', member_of: 'member of', invested_in: 'invested in', acquired: 'acquired' };

export function buildGraph(net) {
  const nodes = (net.items || []).filter(i => i.kind === 'node').map(n => ({ ...n, _g: groupOf(n.type) }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = (net.items || []).filter(i => i.kind === 'edge' && byId.has(i.from) && byId.has(i.to));
  const deg = new Map(); for (const e of edges) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }
  nodes.forEach(n => { n._deg = deg.get(n.id) || 0; });
  const adj = new Map(nodes.map(n => [n.id, []])); for (const e of edges) { adj.get(e.from).push(e); adj.get(e.to).push(e); }
  return { nodes, edges, byId, adj, paths: net.meta?.intro_paths || [], layout: layout(nodes, edges) };
}

/* Deterministic force layout (Fruchterman–Reingold with group anchors). */
function layout(nodes, edges, W = 1000, H = 640) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const anchor = g => { if (g === 0) return [0, 0]; const a = (g - 1) / 7 * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * 330, Math.sin(a) * 210]; };
  const P = nodes.map(n => { const [ax, ay] = n.type === 'firm' ? [0, 0] : anchor(n._g); return { x: ax + (rnd() - .5) * 120, y: ay + (rnd() - .5) * 90, dx: 0, dy: 0 }; });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const k = 46; let temp = 70; const RX = 470, RY = 300;
  for (let it = 0; it < 360; it++) {
    for (const p of P) { p.dx = 0; p.dy = 0; }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y; let d2 = dx * dx + dy * dy; if (d2 < .01) { dx = .1; dy = .1; d2 = .02; }
      const f = k * k / d2; P[i].dx += dx * f; P[i].dy += dy * f; P[j].dx -= dx * f; P[j].dy -= dy * f;
    }
    for (const e of edges) { const a = P[idx.get(e.from)], c = P[idx.get(e.to)]; const dx = a.x - c.x, dy = a.y - c.y; const d = Math.sqrt(dx * dx + dy * dy) || .1; const f = d / k * .5; a.dx -= dx * f; a.dy -= dy * f; c.dx += dx * f; c.dy += dy * f; }
    nodes.forEach((n, i) => { const [ax, ay] = n.type === 'firm' ? [0, 0] : anchor(n._g); P[i].dx += (ax - P[i].x) * .2; P[i].dy += (ay - P[i].y) * .2; });
    for (let i = 0; i < P.length; i++) { if (nodes[i].type === 'firm') { P[i].x = 0; P[i].y = 0; continue; } const p = P[i]; const d = Math.sqrt(p.dx * p.dx + p.dy * p.dy) || 1; const m = Math.min(d, temp); p.x += p.dx / d * m; p.y += p.dy / d * m; const e = (p.x / RX) ** 2 + (p.y / RY) ** 2; if (e > 1) { const f = 1 / Math.sqrt(e); p.x *= f; p.y *= f; } }
    temp = Math.max(2, temp * .985);
  }
  const xs = P.map(p => p.x), ys = P.map(p => p.y); const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 46; const sx = (W - pad * 2) / ((maxX - minX) || 1), sy = (H - pad * 2) / ((maxY - minY) || 1);
  const out = new Map(); nodes.forEach((n, i) => out.set(n.id, { x: Math.round((pad + (P[i].x - minX) * sx) * 10) / 10, y: Math.round((pad + (P[i].y - minY) * sy) * 10) / 10 }));
  return { pos: out, W, H };
}

const shapePath = (shape, r) => {
  switch (shape) {
    case 'diamond': return `<path d="M0 ${-r * 1.25}L${r * 1.25} 0L0 ${r * 1.25}L${-r * 1.25} 0Z"/>`;
    case 'square': return `<rect x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" rx="2"/>`;
    case 'triangle': return `<path d="M0 ${-r * 1.3}L${r * 1.2} ${r * .9}L${-r * 1.2} ${r * .9}Z"/>`;
    case 'tri-down': return `<path d="M0 ${r * 1.3}L${r * 1.2} ${-r * .9}L${-r * 1.2} ${-r * .9}Z"/>`;
    case 'pentagon': { const pts = [0, 1, 2, 3, 4].map(i => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return `${(Math.cos(a) * r * 1.2).toFixed(1)},${(Math.sin(a) * r * 1.2).toFixed(1)}`; }); return `<polygon points="${pts.join(' ')}"/>`; }
    case 'ring': return `<circle r="${r}" class="bn-ring"/>`;
    default: return `<circle r="${r}"/>`;
  }
};
const shortName = n => { const s = String(n.name || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/,? (LLP|LLC|Inc\.?)$/i, '').trim(); return s.length > 24 ? s.slice(0, 22).trim() + '…' : s; };

/** Graph SVG markup (viewBox 1000×640). Labels on hubs and high-degree nodes; every node has a <title>. */
export function graphSVG(g, { labelDeg = 7 } = {}) {
  const { pos, W, H } = g.layout;
  const edges = g.edges.map(e => { const a = pos.get(e.from), b = pos.get(e.to); return `<line class="bn-e" data-e="${esc(e.id)}" data-a="${esc(e.from)}" data-b="${esc(e.to)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; }).join('');
  const nodes = g.nodes.slice().sort((a, b) => a._deg - b._deg).map(n => {
    const p = pos.get(n.id); const grp = GROUPS.find(x => x.id === n._g); const r = n.type === 'firm' ? 12 : n.type === 'portfolio_company' ? 7.5 : Math.min(7.5, 4.2 + n._deg * .35);
    const lab = n.type === 'firm' || n.type === 'portfolio_company' || n._deg >= labelDeg;
    return `<g class="bn-n bn-g${n._g}${lab ? ' bn-lab' : ''}" data-id="${esc(n.id)}" transform="translate(${p.x} ${p.y})" tabindex="0" role="button" aria-label="${esc(n.name)}, ${esc(TYPE_LABEL[n.type] || '')}"><title>${esc(n.name)} · ${esc(TYPE_LABEL[n.type] || '')}${n.title ? ` · ${esc(n.title)}` : ''}</title><circle class="bn-hit" r="12"/>${shapePath(grp.shape, r)}${lab ? `<text class="bn-t" y="${-r - 5}">${esc(shortName(n))}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="bn-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Broad Sky professional network: ${g.nodes.length} people and organizations, ${g.edges.length} sourced connections"><g class="bn-edges">${edges}</g><g class="bn-nodes">${nodes}</g></svg>`;
}
export const legendHTML = () => `<div class="bn-legend">${GROUPS.map(gr => `<span class="bn-li"><svg viewBox="-9 -9 18 18" width="14" height="14" class="bn-g${gr.id}" aria-hidden="true">${shapePath(gr.shape, 5.5)}</svg>${esc(gr.label)}</span>`).join('')}</div>`;

/** Attach search, hover and path highlighting to a rendered graph. onSelect(node) on click/Enter. */
export function bindGraph(root, g, { onSelect } = {}) {
  const svg = root.querySelector('.bn-svg'); if (!svg) return null;
  const nodeEls = new Map([...svg.querySelectorAll('.bn-n')].map(el => [el.dataset.id, el]));
  const edgeEls = [...svg.querySelectorAll('.bn-e')];
  const clear = () => { svg.classList.remove('bn-focus'); nodeEls.forEach(el => el.classList.remove('on', 'hit')); edgeEls.forEach(el => el.classList.remove('on')); };
  const focusIds = (ids, edgeFilter) => { clear(); if (!ids.size) return; svg.classList.add('bn-focus'); ids.forEach(id => nodeEls.get(id)?.classList.add('on')); edgeEls.forEach(el => { if (edgeFilter(el)) el.classList.add('on'); }); };
  let pinned = null;
  const neighbors = id => { const s = new Set([id]); (g.adj.get(id) || []).forEach(e => { s.add(e.from); s.add(e.to); }); return s; };
  const showNeighbors = id => focusIds(neighbors(id), el => el.dataset.a === id || el.dataset.b === id);
  nodeEls.forEach((el, id) => {
    el.addEventListener('mouseenter', () => { if (!pinned) showNeighbors(id); });
    el.addEventListener('mouseleave', () => { if (!pinned) clear(); });
    const pick = () => { pinned = { type: 'node', id }; showNeighbors(id); el.classList.add('hit'); onSelect && onSelect(g.byId.get(id)); };
    el.addEventListener('click', pick); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  svg.addEventListener('click', e => { if (!e.target.closest('.bn-n')) { pinned = null; clear(); } });
  return {
    search(q) {
      q = String(q || '').trim().toLowerCase(); pinned = null; if (!q) { clear(); return 0; }
      const hits = new Set(g.nodes.filter(n => `${n.name} ${n.org || ''} ${n.title || ''} ${(n.sector_tags || []).join(' ')}`.toLowerCase().includes(q)).map(n => n.id));
      focusIds(hits, el => hits.has(el.dataset.a) && hits.has(el.dataset.b)); hits.forEach(id => nodeEls.get(id)?.classList.add('hit')); if (hits.size) pinned = { type: 'search' }; return hits.size;
    },
    path(ids) {
      const set = new Set(ids); const pairs = new Set(); for (let i = 1; i < ids.length; i++) { pairs.add(ids[i - 1] + '|' + ids[i]); pairs.add(ids[i] + '|' + ids[i - 1]); }
      pinned = { type: 'path' }; focusIds(set, el => pairs.has(el.dataset.a + '|' + el.dataset.b)); ids.forEach(id => nodeEls.get(id)?.classList.add('hit'));
    },
    select(id) { const el = nodeEls.get(id); if (el) { pinned = { type: 'node', id }; showNeighbors(id); el.classList.add('hit'); } },
    clear() { pinned = null; clear(); },
  };
}

/** Node detail: role, connections with evidence, sources. */
export function nodeDetail(g, n) {
  const conns = (g.adj.get(n.id) || []).map(e => { const other = g.byId.get(e.from === n.id ? e.to : e.from); const out = e.from === n.id; const rel = REL_LABEL[e.relation] || String(e.relation).replace(/_/g, ' '); return { e, other, out, text: out ? `${rel} ${other.name}` : `${other.name} ${rel} ${shortName(n)}` }; });
  const paths = g.paths.filter(p => (p.path_node_ids || []).includes(n.id));
  const sources = [...new Set([n.source_url, ...conns.map(c => c.e.source_url)].filter(Boolean))];
  return { conns, paths, sources };
}

/* ── Intro paths ──────────────────────────────────────────────────────────── */
const refId = ref => String(ref || '').split('#')[1] || null;
/** Sourced intro path for a target (by id), or a default path through the company's leader built from graph edges. */
export function introFor(b, t) {
  const g = b.graph; if (!g) return null;
  const sourced = g.paths.find(p => refId(p.target_ref) === t.id);
  if (sourced) return { sourced: true, ...sourced, names: sourced.path_node_ids.map(id => g.byId.get(id)?.name || '—') };
  const pc = PLATFORMS[t._p]?.node; if (!pc || !g.byId.has(pc)) return null;
  const leader = (g.adj.get(pc) || []).filter(e => e.relation === 'works_at' && e.to === pc && e.current !== false).map(e => g.byId.get(e.from)).find(n => n?.type === 'portfolio_ceo');
  const ids = ['org-bsp', pc, leader?.id].filter(Boolean);
  return { sourced: false, path_node_ids: ids, names: ids.map(id => g.byId.get(id)?.name), hops: ids.length - 1, confidence: 'unsourced', path: `No sourced intro path yet. Default route: ${leader ? `${leader.name} (${leader.title}) at ${g.byId.get(pc).name}` : g.byId.get(pc).name} makes the owner-to-owner approach, which is how most named Broad Sky add-ons were sourced.` };
}

/* ── Chronological strip (inline SVG) ─────────────────────────────────────── */
/** Chronological strip of every deal: rows in portfolio order, platform = diamond, add-on = dot, exit = square. */
export function stripSVG(b, PCOL) {
  const rows = PORDER.filter(p => b.deals.some(d => d._p === p));
  const W = 1100, L = 128, R = 18, T = 22, RH = 30, H = T + rows.length * RH + 26;
  const t0 = Date.UTC(2021, 11, 1), t1 = Date.UTC(2026, 11, 1); const x = t => L + (t - t0) / (t1 - t0) * (W - L - R);
  const yrs = [2022, 2023, 2024, 2025, 2026].map(y => { const xx = x(Date.UTC(y, 0, 1)); return `<line class="bsp-grid" x1="${xx}" x2="${xx}" y1="${T - 8}" y2="${H - 22}"/><text class="bsp-ax" x="${xx + 4}" y="${H - 8}">${y}</text>`; }).join('');
  const today = x(Date.parse(TODAY + 'T12:00:00Z'));
  const lanes = rows.map((p, i) => {
    const y = T + i * RH + RH / 2; const ds = b.deals.filter(d => d._p === p);
    const plat = ds.find(d => d.deal_type === 'platform'); const exit = ds.find(d => d.deal_type === 'exit');
    const span = plat ? `<line class="bsp-hold" style="stroke:${PCOL[p]}" x1="${x(plat._t)}" x2="${exit ? x(exit._t) : today}" y1="${y}" y2="${y}"/>` : '';
    const marks = ds.map(d => { const cx = x(d._t); const lab = `${d.company} · ${DEAL_TYPE[d.deal_type]} · ${fmtMonth(d.date)}`;
      const shape = d.deal_type === 'platform' ? `<rect x="-7" y="-7" width="14" height="14" rx="2" transform="rotate(45)"/>` : d.deal_type === 'exit' ? `<rect x="-6" y="-6" width="12" height="12" rx="2"/>` : `<circle r="5"/>`;
      return `<g class="bsp-mk bsp-mk-${d.deal_type}" data-deal="${d.id}" transform="translate(${cx.toFixed(1)} ${y})" style="--pc:${PCOL[p]}" tabindex="0" role="button" aria-label="${lab.replace(/"/g, '')}"><title>${lab.replace(/</g, '')}</title><circle class="bsp-hit" r="11"/>${shape}</g>`; }).join('');
    return `<text class="bsp-lane" x="0" y="${y + 4}">${PLATFORMS[p].short}</text>${span}${marks}`;
  }).join('');
  return `<svg class="bsp-strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="Every disclosed Broad Sky deal from 2022 to 2026 by company">${yrs}<line class="bsp-today" x1="${today}" x2="${today}" y1="${T - 12}" y2="${H - 22}"/><text class="bsp-ax" x="${today - 4}" y="${T - 14}" text-anchor="end">today</text>${lanes}</svg>
  <div class="bsp-key"><span><svg width="12" height="12" viewBox="-7 -7 14 14"><rect x="-5" y="-5" width="10" height="10" transform="rotate(45)"/></svg>Anchor acquisition</span><span><svg width="12" height="12" viewBox="-7 -7 14 14"><circle r="4.5"/></svg>Add-on</span><span><svg width="12" height="12" viewBox="-7 -7 14 14"><rect x="-5" y="-5" width="10" height="10" rx="2"/></svg>Exit</span><span><i class="bsp-holdkey"></i>Holding period</span></div>`;
}

/* ── Next five + first-call script ────────────────────────────────────────── */
export function nextFive(b, n = 5, perPlatform = 2) {
  const out = [], seen = {};
  for (const r of b.scored.ranked) { if (out.length >= n) break; if ((seen[r._p] || 0) >= perPlatform) continue; seen[r._p] = (seen[r._p] || 0) + 1; out.push(r); }
  return out;
}
export function firstCallScript(b, r) {
  const intro = introFor(b, r); const P = PLATFORMS[r._p]; const g = b.graph;
  const pc = P?.node; const leader = g && pc ? (g.adj.get(pc) || []).filter(e => e.relation === 'works_at' && e.to === pc && e.current !== false).map(e => g.byId.get(e.from)).find(n => n?.type === 'portfolio_ceo') : null;
  const skip = new Set(['org-bsp', pc, leader?.id]);
  const via = intro?.sourced ? (intro.path_node_ids || []).filter(id => !skip.has(id)).map(id => g.byId.get(id)?.name).filter(Boolean).slice(-1)[0] : null;
  const what = r._p === 'pp' ? 'the leading home-services operator in the Mid-Atlantic' : r._p === 'cet' ? 'the leading electrical and energy services group in New England' : r._p === 'fl' ? 'the managed-IT partner of choice for law firms' : 'the leading independent lab-supply distributor';
  const lines = [
    { k: 'Who calls', t: `${leader ? `${leader.name} of ${P.short}` : `${P.short} leadership`}, with the Portfolio Resource Group${via ? `; ask ${via} for the introduction first` : '; no warm introduction is on file, so the call opens cold'}.` },
    { k: 'Open', t: `“I lead ${P.short}. We are backed by Broad Sky Partners and building ${what}. I’d like to understand your plans; this is not an offer.”` },
    { k: 'Why them', t: clip(r.strategic_rationale || '', 240) },
    { k: 'Ownership', t: `“Where are you on succession? With Broad Sky the founder usually stays, keeps equity and helps lead the next acquisitions.” Tests owner readiness; the screen reads ${r._owner.toLowerCase()}${r.founded_year ? `, founded ${r.founded_year}` : ''}.` },
    { k: 'Revenue quality', t: '“What share of revenue is repeat, maintenance or contracted?” Recurring revenue is 12% of the rubric and is not in the screen yet.' },
    { k: 'Bench and tools', t: '“Who runs the business day to day besides you, and what software runs dispatch, billing and the customer record?” Bench and tech upside are 14% of the rubric, untested so far.' },
    r._serious?.length ? { k: 'Risk to clear', t: `Raise gently: ${r._serious.map(s => s.replace(/\.$/, '')).join('; ')}.` } : null,
    { k: 'Close', t: `“Could we meet with ${P.short}’s leadership in the next two weeks? We can walk you through how the last owner joined and what changed for their team.”` },
  ].filter(Boolean);
  return lines;
}

/* ── FAQ for the chat widget (built from the datasets) ────────────────────── */
export function buildFaq(b, base = '') {
  const c = b.cadence; const nar = b.meth?.meta?.methodology_narrative || [];
  const top = b.scored.ranked.slice(0, 5);
  const topPP = b.scored.ranked.find(r => r._p === 'pp'); const ip = topPP ? introFor(b, topPP) : null;
  const n1 = v => v == null ? '—' : v.toFixed(1);
  const faq = [
    { q: 'What is Broad Sky’s acquisition pattern?', href: base + '#narrative', a: `<p>${esc(nar[0] || '')}</p><ul>${nar.slice(1, 6).map(s => `<li>${esc(s)}</li>`).join('')}</ul><p>Anchor acquisitions come every ${n1(c.medianGap)} months (median) and the first add-on lands ${n1(c.medianFirst)} months after the anchor deal.</p>` },
    topPP ? { q: 'Who in the network can introduce us to the top Punctual Pros target?', href: base + '#next', a: `<p>The top Punctual Pros target on the Broad Sky rubric is <b>${esc(topPP.company)}</b> (score ${topPP._score} of 100).</p><p>${ip ? `${ip.sourced ? 'Sourced path' : 'Default path'}: ${esc(ip.names.filter(Boolean).join(' → '))}. ${esc(ip.path)}${ip.sourced ? ` Confidence: ${esc(ip.confidence)}.` : ''}` : 'No intro path in the network data.'}</p>` } : null,
    { q: 'Score the pipeline with the Broad Sky rubric', href: base + '#rubric', a: `<p>Every add-on target in the four company screens was scored on the five Broad Sky criteria the screens can test (owner readiness, size band, adjacency, company-thesis fit and downside), each at its inferred rubric weight. Top five:</p><ol>${top.map(r => `<li><b>${esc(r.company)}</b> · ${esc(r._plat)} · ${r._score} (${esc(r._gate)})</li>`).join('')}</ol><p>Gates: 70+ priority, 55–69 watch list, under 55 pass.</p>` },
    { q: 'How long until the first add-on after an anchor deal?', href: base + '#cadence', a: `<p>Median ${n1(c.medianFirst)} months: ${c.firstAddon.filter(f => f.months != null).map(f => `${esc(PLATFORMS[f.p]?.short)} ${n1(f.months)}`).join(', ')}. Frontline and Fair Harbor have no add-on yet.</p>` },
    { q: 'Which banks and lawyers does Broad Sky use?', href: base + '#patterns', a: `<p>${b.channels.filter(s => /buy_side|legal|accounting_ma/.test(s.channel_type)).map(s => `<b>${esc(s.channel)}</b> (${s.deal_count} deal${s.deal_count === 1 ? '' : 's'})`).join(', ')}.</p><p>${esc(b.channels.find(s => s.id === 'src-berenson')?.implication || '')}</p>` },
    { q: 'How does Broad Sky finance its companies?', href: base + '#patterns', a: `<p>${esc(b.patterns.find(p => p.id === 'pat-private-credit')?.pattern || '')}</p><p>${esc(b.patterns.find(p => p.id === 'pat-spv-coinvest')?.pattern || '')}</p>` },
    { q: 'Do founder CEOs stay after Broad Sky buys?', href: base + '#patterns', a: `<p>${esc(b.patterns.find(p => p.id === 'pat-ceo-retention')?.pattern || '')}</p>` },
    { q: 'How big are the deals Broad Sky does?', href: base + '#rubric', a: `<p>${esc(b.meth?.meta?.rubric_summary?.size_band_finding || '')}</p>` },
  ];
  return faq.filter(Boolean);
}
