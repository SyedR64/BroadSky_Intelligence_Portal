/* Thomas Scientific — growth plan. Renders every section from the portal datasets. */
import { badgeEst } from './shared.js?v=20261009190627';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
let esc = s => String(s ?? '');
const n0 = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const mUSD = (v, d) => v == null || isNaN(v) ? '—' : '$' + (v / 1e6).toFixed(d ?? (Math.abs(v) >= 99.5e6 || v % 1e6 === 0 ? 0 : 1)) + 'M';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const srcLink = (u, label) => u ? `<span class="sys-src pb-src"><b>Source:</b> <a href="${esc(u)}" target="_blank" rel="noopener">${esc(label || host(u))}</a></span>` : '';
const cut = (s, k) => { s = String(s || ''); return s.length > k ? s.slice(0, k).replace(/\s+\S*$/, '') + '…' : s; };
const safe = (name, fn) => { try { return fn(); } catch (e) { console.warn('[growth plan]', name, e && e.message); } };
let HZ = t => t;   // Frame.humanizeText once boot() receives the frame
const EST = '<span class="sys-est">est.</span>';
/* Dataset text is written for analysts; strip internal IDs and file names before it reaches the page. */
const clean = t => String(t ?? '')
  .replace(/\s*\((?:see )?[a-z]+_[a-z_]+(?: items)?\)/g, '').replace(/\bdata\/[\w/.-]+\.json\b/g, 'portal data').replace(/\bthomas_filings estimate_table\b/g, 'SEC-filing estimate table').replace(/\bestimate_table\b/g, 'estimate table')
  .replace(/\(baseline null\)/gi, '(not disclosed)').replace(/baseline null/gi, 'baseline not disclosed')
  .replace(/\bts_sites scores\b/g, 'The scored-site file rates').replace(/\bts_sites\b/g, 'the scored-site file').replace(/\bts_parents\b/g, 'the parent-organization file')
  .replace(/\bthomas_filings estimates\b/g, 'SEC-filing estimates').replace(/\(thomas_filings\)/g, '(SEC-filing estimates)').replace(/\bthomas_filings\b/g, 'SEC-filing estimates').replace(/\bkpi_roadmap\b/g, 'KPI roadmap')
  .replace(/\bserviceos_evidence\b/g, "the portal's tech-premium evidence").replace(/\bpe_landscape\b/g, "the portal's sponsor screen").replace(/\bweeks_to_deploy values\b/g, 'Go-live week figures')
  .replace(/\s*\((?:[a-z]{2,3}-\d+[a-z]?|kb-ts-[\w*]+|ra-ts)(?:\s*[,;/…–-]+\s*(?:[a-z]{2,3}-\d+[a-z]?|kb-ts-[\w*]+|ra-ts))*\)/g, '')
  .replace(/\bdata\/[\w/.-]+\.json\b/g, 'portal data')
  .replace(/\b(?:tpl|fin|gl|ai|ph|tal|rk)-\d+[a-z]?\b/g, '').replace(/\(\s*\)/g, '').replace(/ {2,}/g, ' ').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, isoW);
/* ISO dates → words (Aug 15, 2023) */
function isoW(m, y, mo, d) { return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+mo - 1] || mo} ${+d}, ${y}`; }
const wd = v => String(v ?? '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, isoW);
/* Keep dataset copy consistent with the plan: two funded tuck-ins in 36 months, amend-and-extend at the Dec 2027 maturity, refinancing at month 36. */
const planFix = t => clean(t)
  .replace(/Restart a disciplined cadence of one \$5-25M tuck-in every 4-6 months once liquidity allows;/, 'Restart with two funded tuck-ins in the 36-month plan (~month 24 and ~month 36), none while the refinancing is open;')
  .replace(/it is a re-rated, refinanced (?:platform|portfolio company|company) with (.+?) before the Dec-2027 loan maturity\./, 'it is an amend-and-extend at the Dec-2027 maturity, then a re-rated, refinanceable company with $1 by month 36.');
const D0 = 260, RATE = 0.101, DSO_DAYS = [5, 10], TUCK = { 24: 16, 36: 12 };
const INVESTED = 257.1, COMMON_IN = 236.1, CO_INV = 95.5;

/* Phase geography: states per phase reproduce the ts_playbook data_points exactly (3,502 / 10,636 / 5,786 / 6,098 sites). */
const PHASE_STATES = {
  1: 'NJ PA NY DE MD MA CT RI NH VT ME DC',
  2: 'TX IL OH MI LA MO IN OK WI KS MN AR IA NE ND SD',
  3: 'CA AZ WA OR CO NV UT ID NM HI WY MT AK',
  4: 'FL GA NC SC VA TN AL KY WV MS ON',
};
const US48 = [[24.5, -124.8], [49.4, -66.9]];
const STATE_PHASE = {}; Object.entries(PHASE_STATES).forEach(([p, s]) => s.split(' ').forEach(x => { STATE_PHASE[x] = +p; }));
const SHORT = { 1: 'Stabilize the core', 2: 'Target-account selling', 3: 'West + cleanroom', 4: 'Southeast + specialty' };
const PC = { 1: '#0e8f6e', 2: '#1767d1', 3: '#7a4fd6', 4: '#d9822b', 0: '#94a3b3' };

/* Thomas locations, city-level, from ts_playbook expansion phases + bsp_firm add-on history. */
const THOMAS_SITES = [
  { n: 'Swedesboro, NJ', w: 'Headquarters and main distribution center (founded 1900)', lat: 39.7476, lon: -75.3102, hq: true },
  { n: 'Holliston, MA', w: 'Denville Scientific (Carlyle-era add-on, 2018): private-label lab essentials', lat: 42.2001, lon: -71.4245 },
  { n: 'Haverhill, MA', w: 'Quintana Supply (BSP add-on, Aug 2023): cleanroom, packaging, industrial', lat: 42.7762, lon: -71.0773 },
  { n: 'Dracut, MA', w: 'Day Associates (BSP add-on, Aug 2023): cleanroom and safety products', lat: 42.6704, lon: -71.302 },
  { n: 'Brooklyn Park, MN', w: 'North Central Instruments (BSP add-on, Aug 2022): microscopy, histology, Leica dealer', lat: 45.0941, lon: -93.3563 },
  { n: 'Lenexa, KS', w: 'Arrowhead Forensics (BSP add-on, Oct 2023): forensics kitting, ATF BPA', lat: 38.9536, lon: -94.7336 },
  { n: 'Santa Clara, CA', w: 'E&K Scientific (Carlyle-era add-on): West Coast life science', lat: 37.3541, lon: -121.9552 },
  { n: 'Irvine, CA', w: 'American Cleanstat (Carlyle-era add-on): cleanroom consumables', lat: 33.6846, lon: -117.8265 },
  { n: 'Candler, NC', w: 'Phenix Research (Carlyle-era add-on): Southeast life science', lat: 35.5365, lon: -82.6929 },
];

const NARROW = () => window.matchMedia('(max-width:560px)').matches;
const S = { pb: null, items: [], meta: {}, ma: [], maMeta: {}, fil: null, comps: null, pe: null, firm: null, ev: null, parents: null, agg: null, phase: 0, view: 'dt' };
const MG = () => S.view === 'mgmt';
const byKind = k => S.items.filter(i => i.kind === k);
const byId = id => S.items.find(i => i.id === id);

export async function boot({ Data, Fmt, esc: e, Chat, Frame, frame }) {
  esc = e || esc;
  if (Frame?.humanizeText) HZ = Frame.humanizeText;
  S.frame = frame;
  const R = n => Data.research('research/' + n);
  const [pb, ma, fil, comps, pe, firm, ev] = await Promise.all(['ts_playbook', 'ma_targets_fl_ts', 'thomas_filings', 'public_comps', 'pe_landscape', 'bsp_firm', 'serviceos_evidence'].map(R));
  S.pb = pb; S.items = pb?.items || []; S.meta = pb?.meta || {};
  S.ma = (ma?.items || []).filter(i => i.platform === 'thomas_scientific'); S.maMeta = ma?.meta || {};
  S.fil = fil; S.comps = comps; S.pe = pe; S.firm = firm; S.ev = ev;
  if (!pb) { $('#hero-lede').insertAdjacentHTML('afterend', '<div class="sys-note sys-note--warn"><span>The plan could not be loaded; sections below may be empty.</span></div>'); }
  try { S.view = new URLSearchParams(location.search).get('view') === 'mgmt' ? 'mgmt' : 'dt'; } catch { }
  safe('hero', renderHero); safe('clock', renderClock); safe('strip', renderStrip);
  safe('template', renderTemplate); safe('phasebar', renderPhaseBar); safe('panel', () => renderPanel(0));
  safe('levers', renderLevers); safe('agents', renderAgents); safe('talent', renderTalent);
  safe('addons', renderAddons); safe('returns', renderReturns); safe('risks', renderRisks); safe('sources', renderSources);
  safe('first', renderFirstMeeting); safe('view', initView);
  safe('chat', () => mountChat(Chat));
  safe('rationale', () => { const open = () => { if (location.hash === '#rationale') $('#rat-drawer').open = true; }; window.addEventListener('hashchange', open); open(); });
  safe('est', () => badgeEst($('main')));
  safe('map', () => initMap(Data));
}

/* ── HERO ─────────────────────────────────────────────────────────────── */
const road = () => S.meta.kpi_roadmap || [];
const debtEst = () => { const m = /\$(\d{3})M debt/.exec((road()[3] || {}).note || ''); return m ? +m[1] * 1e6 : D0 * 1e6; };
const interp = (m, k) => { const r = road(); for (let i = 0; i < r.length - 1; i++) { const a = r[i], b = r[i + 1]; if (m >= a.month && m <= b.month) return a[k] + (b[k] - a[k]) * (m - a.month) / (b.month - a.month); } return (r[r.length - 1] || {})[k]; };
const unitranche = () => { const f4 = byId('fin-04'); const m = /unitranche\s*([\d.]+)x?\s*-\s*([\d.]+)x/i.exec(f4?.facts || ''); return m ? [+m[1], +m[2]] : [5.25, 6.25]; };
/* Monthly cash bridge, months 0-36 ($M). Debt starts at est. $260M; every month's free cash after interest pays it down, tuck-ins add to it unless funded with new preferred. */
function cashModel(prefFund) {
  const r = road(); if (r.length < 2) return null;
  const a = r[0], z = r[r.length - 1]; const dsoDay = a.revenue_usd / 1e6 / 365; const dsoMid = dsoDay * (DSO_DAYS[0] + DSO_DAYS[1]) / 2;
  const tuckRev = 35; const wcMo = Math.max(0, (z.revenue_usd - a.revenue_usd) / 1e6 - tuckRev) * 0.15 / 36;
  const A = { ebitda: 0, dso: 0, interest: 0, capex: 0, wc: 0, labos: 0, reps: 0, tuck: 0 }; let D = D0; const at = { 0: { D, A: { ...A } } };
  for (let m = 1; m <= 36; m++) {
    const f = { ebitda: interp(m - .5, 'ebitda_usd') / 12e6, dso: m > 3 && m <= 12 ? dsoMid / 9 : 0, interest: D * RATE / 12, capex: interp(m - .5, 'revenue_usd') / 12e6 * .0075, wc: wcMo, labos: m <= 18 ? 3 / 18 : 0, reps: m > 6 && m <= 30 ? 5 / 24 : 0, tuck: TUCK[m] || 0 };
    for (const k in A) A[k] += f[k];
    D -= f.ebitda + f.dso - f.interest - f.capex - f.wc - f.labos - f.reps - (prefFund ? 0 : f.tuck);
    at[m] = { D, A: { ...A } };
  }
  return { at, dsoDay, tuckTotal: Object.values(TUCK).reduce((x, y) => x + y, 0) };
}
const CM = () => (S._cm ||= cashModel(false)), CMP = () => (S._cmp ||= cashModel(true));
const debtAt = m => (CM()?.at?.[m]?.D ?? D0);
function renderHero() {
  const r = road(); if (!r.length) return; const a = r[0], z = r[r.length - 1], D = D0 * 1e6, D3 = debtAt(36) * 1e6, Dp = (CMP()?.at?.[36]?.D ?? D0) * 1e6;
  const k = [
    { l: 'Revenue', f: mUSD(a.revenue_usd), t: mUSD(z.revenue_usd), d: `+${Math.round((z.revenue_usd / a.revenue_usd - 1) * 100)}% · ~4% organic + 2 tuck-ins` },
    { l: 'EBITDA', f: mUSD(a.ebitda_usd), t: mUSD(z.ebitda_usd), d: `margin ${(a.ebitda_usd / a.revenue_usd * 100).toFixed(1)}% → ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(1)}%` },
    { l: 'Total leverage', f: (D / a.ebitda_usd).toFixed(1) + 'x', t: (D3 / z.ebitda_usd).toFixed(1) + 'x', d: `debt ${mUSD(D)} → ${mUSD(D3)}` },
    { l: 'Sites covered', f: '—', t: '~3,000', d: 'Pursue and Nurture sites with a named rep' },
  ];
  const lede = $('#hero-lede'); if (lede && !S._ledeDT) S._ledeDT = lede.innerHTML;
  if (lede) lede.innerHTML = MG() ? `A 36-month operating plan. Release cash first so the December 2027 refinancing starts from strength, then grow through target accounts, digital ordering and private label.` : S._ledeDT;
  const eb = $('#eyebrow-t'); if (eb) eb.textContent = MG() ? 'Operating plan · October 2026' : 'Growth plan · October 2026';
  $('#kpis').innerHTML = k.map(x => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${esc(x.l)} · today → month 36</span><span class="sys-kpi-value"><small>${esc(x.f)} →</small>${esc(x.t)}${EST}</span><span class="sys-kpi-sub">${esc(x.d)}</span></div>`).join('');
}

function loanMarks() {
  const out = []; const items = (S.fil?.items || []).filter(i => /^ts-(0\d|10)$/.test(i.id));
  for (const it of items) {
    const kf = it.key_figures || {}; const per = (/period (\d{4}-\d{2}-\d{2})/.exec(it.filed_or_dated || '') || [])[1];
    const take = (o, d) => { const par = o.tl_par_usd_k ?? o.term_loan_par_usd_k; const fv = o.tl_fv_usd_k ?? o.term_loan_fv_usd_k; if (par && fv && d) out.push({ d, v: fv / par * 100 }); };
    take(kf, per);
    for (const [key, val] of Object.entries(kf)) if (/^\d{4}-\d{2}-\d{2}$/.test(key) && val && typeof val === 'object') take(val, key);
    const pairs = {}; for (const [key, val] of Object.entries(kf)) { const m = /^(?:tl|term_loan)_(par|fv)_(\d{4}-\d{2}-\d{2})_usd_k$/.exec(key); if (m) { (pairs[m[2]] ||= {})[m[1]] = val; } }
    for (const [d, p] of Object.entries(pairs)) if (p.par && p.fv) out.push({ d, v: p.fv / p.par * 100 });
  }
  const seen = new Set(); return out.filter(x => !seen.has(x.d) && seen.add(x.d)).sort((a, b) => a.d.localeCompare(b.d));
}
function renderClock() {
  const mat = new Date(2027, 11, 14); const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((mat - today) / 864e5));
  $('#count b').textContent = n0(days);
  const pts = loanMarks();
  if (pts.length > 2) {
    const W = 340, H = 96, pl = 30, pr = 8, pt = 10, pb = 18, lo = 86, hi = 101;
    const x = i => pl + i * (W - pl - pr) / (pts.length - 1), y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    $('#spark').innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${[100, 95, 90].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8ef"/><text x="${pl - 5}" y="${y(v) + 3}" font-size="9" text-anchor="end" fill="#94a3b3" font-family="JetBrains Mono">${v}</text>`).join('')}<path d="${path}" fill="none" stroke="#1767d1" stroke-width="2"/><path d="${path}L${x(pts.length - 1)},${H - pb}L${pl},${H - pb}Z" fill="rgba(23,103,209,.08)"/><circle cx="${x(pts.length - 1)}" cy="${y(last.v)}" r="4" fill="#c2413b"/><text x="${pl}" y="${H - 4}" font-size="9" fill="#94a3b3" font-family="JetBrains Mono">${(d => { const [y, m] = String(d).split('-'); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] || ''} ${y}`; })(pts[0].d)}</text><text x="${W - pr}" y="${H - 4}" font-size="9" fill="#94a3b3" text-anchor="end" font-family="JetBrains Mono">${(d => { const [y, m] = String(d).split('-'); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] || ''} ${y}`; })(last.d)}</text></svg>`;
    $('#mark-last').textContent = last.v.toFixed(1) + '%';
    $('#spark-note').innerHTML = `<b>Source:</b> term loan fair value ÷ par, ${pts.length} quarterly marks from MFIC's schedules of investments (latest: 10-Q, June 30, 2026).`;
  }
  const [lo, hi] = unitranche();
  const r = road(); const e0 = (r[0]?.ebitda_usd || 30e6) / 1e6, e14 = (interp(14, 'ebitda_usd') || 33.3e6) / 1e6, e3 = (r[3]?.ebitda_usd || 42.5e6) / 1e6; const max = 320;
  const row = (l, a, b, c) => `<div class="pb-gap-row"><span>${l}</span><div class="pb-bar"><i style="left:${a / max * 100}%;width:${(b - a) / max * 100}%;background:${c}"></i></div><b>$${Math.round(a)}–${Math.round(b)}M</b></div>`;
  $('#gap').innerHTML = `<div class="pb-card-h"><h3 class="sys-card-label">The refinancing gap</h3>${EST}</div>${row('Debt outstanding', 210, 310, '#c2413b')}${row(`Capacity today`, lo * e0, hi * e0, '#94a3b3')}${row(`At maturity, mo. 14`, lo * e14, hi * e14, '#d9822b')}${row(`Capacity, mo. 36`, lo * e3, hi * e3, '#0e8f6e')}<p class="sys-src"><b>Source:</b> capacity = ${lo}–${hi}x unitranche (Houlihan Lokey, Oct 2025) × EBITDA of $${e0}M today, ~$${e14.toFixed(1)}M at the Dec 2027 maturity and $${e3}M at month 36 (Oct 2029). The gap is still open at maturity.</p>`;
}
function renderStrip() {
  const p2 = byId('ph-2')?.data_points || {};
  const cells = [
    [n0(p2.national_sites_total || 27503), 'lab, pathology & hospital sites scored'],
    [n0(p2.national_pursue || 713), 'rated Pursue'],
    [n0(p2.national_nurture || 2317), 'rated Nurture'],
    [n0(p2.top500_parent_sites || 832), 'sites at the top-500 parent orgs'],
    [n0(S.ma.length || 25), 'add-on targets screened'],
    [THOMAS_SITES.length, 'Thomas locations · founded 1900'],
  ];
  $('#hero-strip').innerHTML = cells.map(([b, s]) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-value">${esc(b)}</span><span class="sys-kpi-sub">${esc(s)}</span></div>`).join('');
}

/* ── TEMPLATE ─────────────────────────────────────────────────────────── */
function renderTemplate() {
  const r = road(); const a = r[0] || {}, z = r[3] || {};
  const vs = [
    { l: 'People', sh: '~100 → ~800', th: `${n0(a.headcount)} → ${n0(z.headcount)}`, note: 'est.' },
    { l: 'Locations', sh: '1 → 11', th: '9 → 11 DCs', note: '' },
    { l: 'Add-ons', sh: '9 in 3.5 yrs', th: '4 since 2022 · +2 plan', note: '' },
    { l: 'Revenue', sh: '~4x', th: `${(z.revenue_usd / a.revenue_usd || 1.25).toFixed(2)}x`, note: 'est.' },
  ];
  $('#vs').innerHTML = vs.map(v => `<div class="sys-card"><span class="sys-card-label">${esc(v.l)}</span><div class="pb-pair"><div><small>Smith + Howard</small><b>${esc(v.sh)}</b></div><div class="t"><small>Thomas plan</small><b>${esc(v.th)}${v.note ? EST : ''}</b></div></div></div>`).join('');
  const t = byKind('template').filter(x => x.template === 'Smith + Howard').sort((x, y) => String(x.date).localeCompare(String(y.date)));
  $('#timeline').innerHTML = t.map((x, i) => `<li class="${i === t.length - 1 ? 'exit' : ''}"><article class="sys-card"><span class="pb-tl-date sys-num">${esc(wd(x.date))}</span><h3 class="sys-card-title">${esc(x.move)}</h3><p class="sys-card-body">${esc(clean(x.what_happened))}</p>${x.metric ? `<span class="pb-metric">${esc(clean(x.metric))}</span>` : ''}${srcLink(x.source_url)}<div class="sys-card-foot"><span class="sys-card-label">For Thomas</span><p class="sys-card-body">${esc(planFix(x.ts_translation))}</p></div></article></li>`).join('');
  const an = byKind('template').filter(x => x.template !== 'Smith + Howard');
  $('#analogs').innerHTML = `<p class="sys-kicker">Same-vertical analogs</p>` + an.map(x => `<div class="sys-card"><span class="sys-chip sys-chip--soft">${esc(x.template.replace(/^Analog:\s*/, ''))}</span><h4 class="sys-card-title">${esc(x.move)}</h4><p class="sys-card-body">${esc(clean(x.what_happened))}</p>${x.metric ? `<span class="pb-metric">${esc(clean(x.metric))}</span>` : ''}<p class="sys-card-body"><b>For Thomas:</b> ${esc(planFix(x.ts_translation))}</p>${srcLink(x.source_url)}</div>`).join('') + `<div class="sys-card"><h4 class="sys-card-title">What carries over, what does not</h4><p class="sys-card-body">Carries over: specialist add-ons, a tech and offshore back office, regional density. Does not: 4x revenue, in a market growing ~1.5% a year.</p></div>`;
}

/* ── MAP ──────────────────────────────────────────────────────────────── */
let MAP = null, LAY = { states: [], targets: [], dcs: [] }, PLAY = null;
function renderPhaseBar() {
  const ph = byKind('expansion_phase');
  $('#phase-bar').innerHTML = `<button type="button" class="sys-chip" role="tab" aria-selected="true" data-p="0" style="--pc:linear-gradient(90deg,#0e8f6e,#1767d1,#7a4fd6,#d9822b)"><i></i>All phases</button>` + ph.map(p => `<button type="button" class="sys-chip" role="tab" aria-selected="false" data-p="${p.phase}" style="--pc:${PC[p.phase]}"><i></i>${p.phase}. ${esc(SHORT[p.phase] || cut(p.name, 30))} <small>months ${p.months[0]}–${p.months[1]}</small></button>`).join('') + `<button type="button" class="sys-chip pb-play" data-play aria-pressed="false">▶ Play</button>`;
  $$('#phase-bar [data-p]').forEach(b => b.onclick = () => { stopPlay(); setPhase(+b.dataset.p); });
  $('#phase-bar [data-play]').onclick = () => PLAY ? stopPlay() : startPlay();
}
function startPlay() { let p = S.phase; const step = () => { p = p % 4 + 1; setPhase(p); }; step(); PLAY = setInterval(step, 4200); const b = $('#phase-bar [data-play]'); b.textContent = '❚❚ Pause'; b.setAttribute('aria-pressed', 'true'); }
function stopPlay() { if (PLAY) clearInterval(PLAY); PLAY = null; const b = $('#phase-bar [data-play]'); if (b) { b.textContent = '▶ Play'; b.setAttribute('aria-pressed', 'false'); } }
function setPhase(p) {
  S.phase = p;
  $$('#phase-bar [data-p]').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.p === p)));
  safe('panel', () => renderPanel(p)); safe('style', styleMap);
  if (MAP) safe('fit', () => { const pts = []; LAY.states.forEach(l => { if (!p || l.ph === p) pts.push(l.c.getLatLng()); }); LAY.targets.forEach(l => { if (!p || l.ph === p) pts.push(l.m.getLatLng()); }); if (!p) MAP.fitBounds(US48, { padding: [10, 10] }); else if (pts.length) MAP.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 6 }); });
}
function aggregate(sites, parents) {
  const st = {};
  for (const s of sites) {
    const k = s.state || '?'; const o = st[k] ||= { state: k, n: 0, pursue: 0, nurture: 0, cms: 0, lat: 0, lon: 0, ll: 0, vert: {}, par: new Set() };
    o.n++; if (s.commercial_priority_label_v3c === 'Pursue') o.pursue++; else if (s.commercial_priority_label_v3c === 'Nurture') o.nurture++;
    o.cms += +s.cms_allowed_2023_numeric || 0; if (s.lat != null && s.lon != null) { o.lat += +s.lat; o.lon += +s.lon; o.ll++; }
    const v = s.vertical || 'Other'; o.vert[v] = (o.vert[v] || 0) + 1; if (s.parent) o.par.add(s.parent);
  }
  const top = {}; (parents || []).forEach(p => (p.states || []).forEach(x => { top[x] = (top[x] || 0) + 1; }));
  const list = Object.values(st).map(o => ({ ...o, lat: o.ll ? o.lat / o.ll : null, lon: o.ll ? o.lon / o.ll : null, parents: o.par.size, top500: top[o.state] || 0, phase: STATE_PHASE[o.state] || 0, par: undefined }));
  const ph = {}; for (const o of list) { const p = o.phase; const a = ph[p] ||= { n: 0, pursue: 0, nurture: 0, cms: 0, parents: 0, vert: {}, states: 0 }; a.n += o.n; a.pursue += o.pursue; a.nurture += o.nurture; a.cms += o.cms; a.parents += o.parents; a.states++; for (const [k, v] of Object.entries(o.vert)) a.vert[k] = (a.vert[k] || 0) + v; }
  const all = { n: 0, pursue: 0, nurture: 0, cms: 0, parents: 0, vert: {}, states: 0 }; for (const o of list) { all.n += o.n; all.pursue += o.pursue; all.nurture += o.nurture; all.cms += o.cms; all.parents += o.parents; all.states++; for (const [k, v] of Object.entries(o.vert)) all.vert[k] = (all.vert[k] || 0) + v; }
  ph[0] = all;
  const tp = {}; (parents || []).forEach(p => { const set = new Set((p.states || []).map(x => STATE_PHASE[x] || 0)); set.forEach(x => { tp[x] = (tp[x] || 0) + 1; }); }); tp[0] = (parents || []).length;
  return { list, ph, tp };
}
async function initMap(Data) {
  if (!window.L) { $('#map-status').textContent = 'Map library unavailable'; return; }
  MAP = L.map('leaf', { zoomControl: true, scrollWheelZoom: false, attributionControl: true, worldCopyJump: false, zoomSnap: 0.25 });
  const T = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors' };
  L.tileLayer(T.url, { attribution: T.attr, maxZoom: 16, maxNativeZoom: 16 }).addTo(MAP);
  L.tileLayer(T.ref, { maxZoom: 16, maxNativeZoom: 16, pane: 'shadowPane', opacity: .9 }).addTo(MAP);
  MAP.fitBounds(US48, { padding: [10, 10] });
  $('#map-legend').innerHTML = `<div class="pb-lg-ph">${[1, 2, 3, 4].map(p => `<span><i class="pb-lg-b" style="--c:${PC[p]}"></i>Phase ${p}</span>`).join('')}</div><span>Bubble = scored sites by state; dark core = Pursue + Nurture</span><span><i class="pb-lg-s"></i>Thomas location</span><span><i class="pb-lg-r"></i>Screened add-on target (size = fit)</span><span class="pb-lg-src">Source: Thomas Scientific lab sites and parent accounts; Frontline and Thomas Scientific add-on targets, Oct 2026.</span>`;
  // Targets + Thomas sites first (small data), then the 27.5k-site aggregate.
  for (const t of S.ma) {
    if (t.lat == null || t.lon == null) continue; const ph = STATE_PHASE[t.state] || 0;
    const m = L.circleMarker([t.lat, t.lon], { radius: 6 + Math.max(0, (t.fit_score - 55) / 9), color: PC[ph], weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(MAP);
    m.bindPopup(`<b>${esc(t.company)}</b><br>${esc(t.hq_city)}, ${esc(t.state)} · Phase ${ph || '—'}<br>Fit <b>${t.fit_score}</b>/100 · ZoomInfo revenue ${mUSD(t.revenue_est_usd)} ${EST}${t.employees ? ` · ~${n0(t.employees)} staff` : ''}<br><span class="pb-pop-mute">${esc(cut(clean(t.strategic_rationale), 200))}</span>`);
    m.bindTooltip(`${esc(t.company)} · fit ${t.fit_score}`, { direction: 'top' });
    LAY.targets.push({ m, ph });
  }
  for (const d of THOMAS_SITES) {
    const m = L.marker([d.lat, d.lon], { icon: L.divIcon({ className: '', html: `<div class="pb-dc-ic ${d.hq ? 'hq' : ''}"></div>`, iconSize: d.hq ? [18, 18] : [14, 14], iconAnchor: d.hq ? [9, 9] : [7, 7] }), zIndexOffset: 1000, keyboard: true, title: d.n }).addTo(MAP);
    m.bindPopup(`<b>Thomas Scientific · ${esc(d.n)}</b><br>${esc(d.w)}`); LAY.dcs.push(m);
  }
  try {
    const [sites, parents] = await Promise.all([Data.load('ts_sites'), Data.load('ts_parents').catch(() => [])]);
    const arr = Array.isArray(sites) ? sites : (sites.items || []); S.parents = Array.isArray(parents) ? parents : (parents?.items || []);
    S.agg = aggregate(arr, S.parents);
    for (const o of S.agg.list) {
      if (o.lat == null || o.state === '?') continue;
      const r = 3 + Math.sqrt(o.n) * .42, ri = 2 + Math.sqrt(o.pursue + o.nurture) * .42;
      const c = L.circleMarker([o.lat, o.lon], { radius: r, color: '#fff', weight: 1, fillColor: PC[o.phase], fillOpacity: .32 }).addTo(MAP);
      const ci = L.circleMarker([o.lat, o.lon], { radius: ri, stroke: false, fillColor: PC[o.phase], fillOpacity: .85, interactive: false }).addTo(MAP);
      c.bindTooltip(`<b>${esc(o.state)}</b> · ${o.phase ? 'Phase ' + o.phase : 'outside plan'}<br>${n0(o.n)} scored sites · ${n0(o.pursue)} Pursue · ${n0(o.nurture)} Nurture<br>${mUSD(o.cms)} 2023 Medicare-allowed at scored sites<br>${n0(o.top500)} of the top-500 parent orgs present`, { sticky: true });
      c.bringToBack(); LAY.states.push({ c, ci, ph: o.phase });
    }
    LAY.dcs.forEach(m => m.setZIndexOffset(1000)); LAY.targets.forEach(t => t.m.bringToFront());
    $('#map-status').classList.add('done'); renderPanel(S.phase); styleMap();
  } catch (e) { console.warn('[growth plan] sites', e && e.message); $('#map-status').textContent = 'Site aggregate unavailable; showing locations and targets'; }
}
function styleMap() {
  const p = S.phase;
  LAY.states.forEach(l => { const on = !p || l.ph === p; l.c.setStyle({ fillOpacity: on ? .32 : .05, opacity: on ? 1 : .2 }); l.ci.setStyle({ fillOpacity: on ? .85 : .1 }); });
  LAY.targets.forEach(l => { const on = !p || l.ph === p; l.m.setStyle({ opacity: on ? 1 : .2, fillOpacity: on ? 1 : .25 }); });
}
function renderPanel(p) {
  const ph = byKind('expansion_phase'); const it = ph.find(x => x.phase === p);
  const agg = S.agg?.ph?.[p]; const dp = it?.data_points || {};
  const sites = agg ? agg.n : (p ? dp.ts_sites_total : 27503), pu = agg ? agg.pursue : (p ? dp.ts_sites_pursue : 713), nu = agg ? agg.nurture : (p ? dp.ts_sites_nurture : 2317);
  const cms = agg ? agg.cms : (dp.cms_allowed_2023_usd_m || 0) * 1e6; const top = S.agg?.tp?.[p] ?? (p ? dp.top500_parents_with_sites_in_region : 500);
  const tg = S.ma.filter(t => !p || (STATE_PHASE[t.state] || 0) === p).sort((a, b) => b.fit_score - a.fit_score);
  const vert = agg ? Object.entries(agg.vert).sort((a, b) => b[1] - a[1]) : [];
  const vc = ['#0e8f6e', '#1767d1', '#7a4fd6', '#d9822b', '#c2413b', '#94a3b3'];
  const vbar = vert.length ? `<div><div class="pb-vbar">${vert.map(([k, v], i) => `<i title="${esc(k)}: ${n0(v)}" style="flex:${v};background:${vc[i % 6]}"></i>`).join('')}</div><div class="pb-fine">${vert.slice(0, 4).map(([k, v], i) => `<span style="color:${vc[i]}">■</span> ${esc(k)} ${Math.round(v / agg.n * 100)}%`).join(' · ')}</div></div>` : '';
  const head = p ? `<div class="pb-pp-top"><span class="pb-pp-num" style="--pc:${PC[p]}">Phase ${p} · months ${it.months[0]}–${it.months[1]}</span>${EST}</div><h3 class="sys-card-title">${esc(it.name)}</h3><p class="pb-fine">${esc(clean(it.geography))}</p><p class="sys-card-body">${esc(clean(it.thesis))}</p>`
    : `<div class="pb-pp-top"><span class="pb-pp-num" style="--pc:var(--sys-ink)">All phases · 36 months</span></div><h3 class="sys-card-title">Cash first, then coverage, then the West and Southeast</h3><p class="sys-card-body">${esc(clean(S.meta.thesis || ''))}</p>`;
  const kta = dp.kpi_target_assumptions ? `<div class="sys-note sys-note--warn"><span><b>KPI targets</b> ${EST} ${Object.entries(dp.kpi_target_assumptions).map(([k, v]) => `${esc(HZ(k).replace(/_/g, ' '))}: ${esc(clean(v))}`).join(' · ')}</span></div>` : '';
  $('#phase-panel').innerHTML = `${head}<div class="pb-stats"><div><b>${n0(sites)}</b><span>scored sites</span></div><div><b>${n0(pu)}</b><span>Pursue</span></div><div><b>${n0(nu)}</b><span>Nurture</span></div><div><b>${cms ? '$' + (cms / 1e9).toFixed(2) + 'B' : '—'}</b><span>2023 Medicare-allowed</span></div><div><b>${n0(top)}</b><span>top-500 parent orgs present</span></div><div><b>${tg.length}</b><span>targets · ${mUSD(tg.reduce((a, t) => a + (t.revenue_est_usd || 0), 0))} revenue ${EST}</span></div></div>${vbar}${tg.length ? `<div><p class="sys-card-label">Top add-on targets here</p><ul class="pb-pp-list">${tg.slice(0, 4).map(t => `<li>${esc(t.company)}<span>${esc(t.state)} · fit ${t.fit_score}</span></li>`).join('')}</ul></div>` : ''}${kta}<p class="sys-src"><b>Source:</b> ${S.agg ? "Thomas Scientific lab sites and parent accounts, aggregated by state live; no account names." : 'Thomas Scientific growth plan summary while the site file loads.'} CMS allowed amount is Medicare billing at scored sites, not lab-supply spend.</p>`;
}

/* ── LEVERS ───────────────────────────────────────────────────────────── */
function renderLevers() {
  const r = road(); const rev = r[0]?.revenue_usd || 285e6; const dsoDay = rev / 365;
  const L8 = [
    { id: 'gl-01', t: 'Named coverage of Pursue + Nurture sites', base: null, tgt: 3030, max: 3030, fmt: v => n0(v), unit: 'sites', ms: [1000, 2000], impact: '~30 rep books of 100 accounts; milestones 1,000 (m12) and 2,000 (m24)' },
    { id: 'gl-02', t: 'Digital share of transactions', base: null, tgt: 80, max: 100, fmt: v => v + '%', impact: 'Lower cost-to-serve on ~$700 average orders; Avantor ~80%' },
    { id: 'gl-03', t: 'Punchout / eProcurement share of contract orders', base: null, tgt: 40, max: 100, fmt: v => v + '%', impact: 'Stickier contract accounts (Grainger ePro ~40%)' },
    { id: 'gl-05', t: 'Private-label mix', base: null, tgt: 19, max: 40, fmt: v => v + '%', impact: 'Higher-margin own brand; Denville ran ~35% gross margin' },
    { id: 'gl-06', t: 'Price realization (gross margin)', base: 0, tgt: 120, lo: 50, max: 150, fmt: v => v + ' bps', bL: 'today', tL: '+50–120 bps', impact: `${mUSD(rev * .005)}–${mUSD(rev * .012)} EBITDA on est. ${mUSD(rev)} revenue` },
    { id: 'ai-07', t: 'Days sales outstanding (reduction)', base: 0, tgt: 10, lo: 5, max: 20, fmt: v => v + ' days', bL: 'today', tL: '−5 to −10 days', impact: `${mUSD(dsoDay * 5)}–${mUSD(dsoDay * 10)} of one-time cash at ~${mUSD(dsoDay, 1)} per day`, ev: x => x.metric_claim },
    { id: 'gl-07', t: 'Growth of the specialty mix (cleanroom)', base: 1.5, tgt: 7.3, max: 10, fmt: v => v + '%', impact: 'Ride a 7.3% CAGR niche vs a 1.5% lab-distribution median', baseL: 'lab-distr. median' },
    { id: 'gl-10', t: 'Federal and forensics channel', base: 8.3, tgt: 10, max: 12, fmt: v => '$' + v + 'M', impact: 'DLA ECAT, NIH/CDC BPAs and the ATF forensic BPA from Arrowhead', baseL: 'FY2025' },
  ];
  $('#lever-grid').innerHTML = L8.map((l, i) => {
    const it = byId(l.id) || {}; const pct = v => Math.max(0, Math.min(100, v / l.max * 100));
    const track = l.base == null
      ? `<div class="gapz" style="width:${pct(l.tgt)}%"></div><div class="tgt" style="left:${pct(l.tgt) - 3}%;width:3%"></div>`
      : `<div class="base" style="width:${pct(l.base)}%"></div><div class="tgt" style="left:${pct(l.base)}%;width:${pct(l.tgt) - pct(l.base)}%;${l.lo != null ? `background:linear-gradient(90deg,#9fdcc8 ${((l.lo - l.base) / (l.tgt - l.base) * 100).toFixed(0)}%,var(--acc) 0)` : ''}"></div>`;
    const ms = (l.ms || []).map(v => `<div class="ms" style="left:${pct(v)}%" title="${n0(v)}"></div>`).join('');
    return `<article class="sys-card pb-lever"><span class="sys-card-label"><span class="sys-dot" aria-hidden="true"></span>Lever ${i + 1}</span><h3 class="sys-card-title">${esc(l.t)}</h3><div class="pb-lv-nums"><div class="b"><small>Baseline${l.baseL ? ' · ' + esc(l.baseL) : ''}</small><b>${l.base == null ? '—' : esc(l.bL || l.fmt(l.base))}</b></div><div class="t"><small>Target</small><b>${esc(l.tL || l.fmt(l.tgt))}</b></div></div><div class="pb-lv-track" aria-hidden="true">${track}${ms}</div><div class="pb-lv-scale"><span>0</span><span>${esc(l.fmt(l.max))}</span></div><div class="pb-impact">${esc(l.impact)}</div><p class="sys-card-body">${esc(cut(clean(l.ev ? l.ev(it) : it.evidence), 230))}</p>${srcLink(it.source_url)}</article>`;
  }).join('');
  const more = ['gl-04', 'gl-08', 'gl-09'].map(byId).filter(Boolean);
  $('#also').innerHTML = `<b>Also in the plan:</b> ${more.map(x => `<span class="sys-chip" title="${esc(clean(x.evidence))}">${esc(x.lever)} · ${esc(x.target)}${esc(x.unit && /%/.test(x.unit) ? '%' : '')}</span>`).join('')} <span class="pb-fine">Hatched bars = Thomas baseline not disclosed; fill in the first 30 days.</span>`;
}

/* ── AGENTS ───────────────────────────────────────────────────────────── */
const GROUPS = [['all', 'All'], ['sales', 'Reps & sales'], ['service', 'Customer service'], ['buyers', 'Scientists & buyers'], ['ops', 'DCs & purchasing'], ['finance', 'Finance & cash']];
const AG_MAP = { 'ai-01': ['sales', 'service', 'buyers'], 'ai-02': ['service', 'buyers'], 'ai-03': ['buyers', 'sales'], 'ai-04': ['ops', 'finance'], 'ai-05': ['sales'], 'ai-06': ['sales', 'finance'], 'ai-07': ['finance'], 'ai-08': ['sales'], 'ai-09': ['buyers', 'service'] };
const WAVE = { 'ai-07': 1, 'ai-06': 1, 'ai-02': 1, 'ai-01': 2, 'ai-05': 2, 'ai-08': 2, 'ai-03': 3, 'ai-09': 3, 'ai-04': 3 };
const WSTART = { 1: 0, 2: 10, 3: 20 };
const agGroups = a => AG_MAP[a.id] || GROUPS.slice(1).filter(([k]) => new RegExp({ sales: 'rep|sales', service: 'service|csr', buyers: 'buyer|scientist|customer', ops: 'purchas|dc|warehouse', finance: 'finance|ar|treasury|cfo' }[k], 'i').test(a.who_it_helps || '')).map(([k]) => k);
function renderAgents() {
  const ag = byKind('ai_agent').map(a => ({ ...a, g: agGroups(a), w: WAVE[a.id] || 3 })).sort((a, b) => a.w - b.w || (a.weeks_to_deploy || 99) - (b.weeks_to_deploy || 99));
  const cnt = k => k === 'all' ? ag.length : ag.filter(a => a.g.includes(k)).length;
  $('#ag-seg').innerHTML = GROUPS.map(([k, l], i) => `<button type="button" class="sys-chip" role="tab" aria-selected="${i === 0}" data-g="${k}">${esc(l)}<small>${cnt(k)}</small></button>`).join('');
  const maxW = Math.ceil((Math.max(...ag.map(a => WSTART[a.w] + (a.weeks_to_deploy || 8)), 36) + 10) / 4) * 4;
  $('#runway').innerHTML = `<div class="pb-rw-head"><h3 class="sys-card-title">Go-live runway</h3><p class="pb-fine">Three waves: cash (collections, pricing, order entry) from week 0, selling from week ${WSTART[2]}, digital from week ${WSTART[3]}. Bars show weeks to go live (analyst estimates ${EST}). The filter above dims agents that do not help the selected group.</p></div>${ag.map(a => `<div class="pb-rw" data-id="${a.id}"><span class="t" title="${esc(a.agent)}">${esc(a.agent.split(/ and | \(/)[0].replace(/ agent$/i, ''))}</span><div class="pb-bar"><i style="left:${WSTART[a.w] / maxW * 100}%;width:${(a.weeks_to_deploy || 8) / maxW * 100}%"></i><em>Wave ${a.w} · ${a.weeks_to_deploy || '—'} wks</em></div></div>`).join('')}<div class="pb-rw-axis"><span></span><div><span>wk 0</span><span>wk ${Math.round(maxW / 2)}</span><span>wk ${maxW}</span></div></div><p class="sys-src"><b>Source:</b> Thomas Scientific growth plan, vendor case studies, Oct 2026.</p>`;
  const big = a => a.metric_value != null ? `<div class="sys-kpi-value">${esc(n0(a.metric_value))}<small>${esc(HZ(a.metric_unit || ''))}</small></div>` : '';
  $('#agent-grid').innerHTML = ag.map(a => `<article class="sys-card pb-agent" data-id="${a.id}" data-g="${a.g.join(' ')}"><span class="sys-card-label"><span class="sys-dot" aria-hidden="true"></span>Wave ${a.w} · ${a.weeks_to_deploy || '—'} wks</span><h3 class="sys-card-title">${esc(a.agent)}</h3>${big(a)}<p class="sys-card-body">${esc(clean(a.job_to_be_done))}</p><p class="sys-card-body"><b>Helps:</b> ${esc(a.who_it_helps)}</p><p class="pb-claim">${esc(cut(clean(a.metric_claim), 220))}</p><div class="sys-chips">${(a.vendor_examples || []).map(v => `<span class="sys-chip">${esc(v)}</span>`).join('')}</div>${a.cost_model ? `<p class="pb-fine">${esc(clean(a.cost_model))}</p>` : ''}${srcLink(a.source_url)}</article>`).join('');
  $$('#ag-seg button').forEach(b => b.onclick = () => {
    $$('#ag-seg button').forEach(x => x.setAttribute('aria-selected', String(x === b))); const g = b.dataset.g;
    $$('#agent-grid .pb-agent').forEach(c => { c.hidden = g !== 'all' && !c.dataset.g.split(' ').includes(g); });
    $$('#runway .pb-rw').forEach(r => { const a = ag.find(x => x.id === r.dataset.id); r.classList.toggle('off', g !== 'all' && !a.g.includes(g)); });
  });
}

/* ── TALENT ───────────────────────────────────────────────────────────── */
function renderTalent() {
  const p2 = byId('ph-2')?.data_points || {}; const pu = p2.national_pursue || 713, nu = p2.national_nurture || 2317;
  const bp = Math.round(pu / 100), bn = Math.round((pu + nu) / 100) - bp;
  $('#books').innerHTML = `<p class="sys-card-label">Inside-sales academy</p><h3 class="sys-card-title">${bp + bn} books of 100 accounts</h3><p class="pb-fine">Each square is one rep book. Grainger's academy: 4 paid weeks, then a book of 100+ mid-size accounts.</p><div class="pb-bk" role="img" aria-label="${bp} Pursue books and ${bn} Nurture books">${Array.from({ length: bp + bn }, (_, i) => `<i class="${i < bp ? 'pu' : 'nu'}"></i>`).join('')}</div><div class="pb-bk-leg"><span><i class="pu"></i>${bp} Pursue books (${n0(pu)} sites)</span><span><i class="nu"></i>${bn} Nurture books (${n0(nu)} sites)</span></div><p class="sys-card-body">Ramp: structured onboarding cut ramp time <b>23–52%</b> in four distributors. Hire in three cohorts of ~10 (months 6, 12 and 18) so coverage hits ~1,000 / ~2,000 / ~3,000 sites at months 12 / 24 / 36.</p><p class="sys-src"><b>Source:</b> Thomas Scientific growth plan; distributor academy case studies, Oct 2026.</p>`;
  $('#programs').innerHTML = byKind('talent_program').map(t => `<article class="sys-card"><h3 class="sys-card-title">${esc(t.program)}</h3><span class="sys-card-label">For: ${esc(t.who_it_helps)}</span><p class="sys-card-body">${esc(cut(clean(t.evidence), 220))}</p><p class="pb-impact">${esc(clean(t.metric))}</p>${srcLink(t.source_url)}</article>`).join('');
}

/* ── ADD-ONS ──────────────────────────────────────────────────────────── */
function renderAddons() {
  const steps = [['Source', 'The portal screen ranks 25 U.S./Canadian distributors and specialists by capability, overlap, scale, readiness and geography.'], ['Screen', 'Prefer specialist lines (cleanroom, reagents, private label) that sell into all nine DCs; regional full-liners where a DC is missing (TX, Plains, West).'], ['Structure', 'Cash-light until the refinancing: earn-outs, seller notes, rollover equity, or new sponsor preferred money.'], ['Integrate', '100 days: line card into every DC, punchout catalogs, private-label swap list, CRM and pricing guardrails.'], ['Repeat', `Two tuck-ins in the 36-month plan: none while the refinancing is open, ~$20M of revenue around month 24 and ~$15M around month 36. Faster only once liquidity allows.`]];
  $('#machine').innerHTML = steps.map(([b, p], i) => `<div><span class="sys-num">0${i + 1}</span><b>${esc(b)}</b><p>${esc(p)}</p></div>`).join('');
  const t = [...S.ma].sort((a, b) => b.fit_score - a.fit_score || (b.revenue_est_usd || 0) - (a.revenue_est_usd || 0)).slice(0, 10);
  $('#targets').innerHTML = t.map((x, i) => { const ph = STATE_PHASE[x.state] || 0; return `<article class="sys-card pb-tg"><span class="pb-rk sys-num">${String(i + 1).padStart(2, '0')}</span><div><h3 class="sys-card-title">${esc(x.company)} <span class="sys-chip" style="--cc:${PC[ph]}"><i></i>Phase ${ph || '—'}</span></h3><div class="pb-fine">${esc(x.hq_city)}, ${esc(x.state)} · ${esc(clean(x.ownership || 'ownership not disclosed'))}${x.employees ? ` · ~${n0(x.employees)} staff` : ''}</div><p class="sys-card-body">${esc(cut(clean(x.strategic_rationale), 230))}</p>${(x.risk_flags || []).length ? `<div class="pb-flags">⚠ ${esc(x.risk_flags.slice(0, 2).map(clean).join(' · '))}</div>` : ''}</div><div class="pb-num"><div><b class="sys-num">${mUSD(x.revenue_est_usd)}${EST}</b><small>ZoomInfo revenue</small></div><div class="pb-fit"><div class="pb-bar"><i style="width:${x.fit_score}%"></i></div><b class="sys-num">${x.fit_score}</b></div></div></article>`; }).join('');
  const sub = $('#ad-sub'); const w = S.maMeta.scoring_weights; if (w && typeof w === 'object') { const tw = w.thomas_scientific || w; const s = Object.entries(tw).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${HZ(k).replace(/_/g, ' ')} ${v}`).join(', '); if (s) sub.textContent = `Top 10 of ${S.ma.length} screened targets by fit score. Revenue figures are modelled estimates.`; }
  const f5 = byId('fin-05'); const ve6 = (S.ev?.items || []).find(i => i.id === 've-06');
  const typ = ve6?.metric_range?.[0] ?? 6.8, prem = ve6?.metric_range?.[1] ?? 9.8; const gf = +(/([\d.]+)x TTM/.exec(f5?.facts || '') || [])[1] || 7.2;
  const bars = [['Tuck-in buy', 5, 7, '#94a3b3'], ['LMM average (GF Data)', gf, gf, '#1767d1'], ['Typical MM exit', typ, typ, '#d9822b'], ['Premium MM exit', prem, prem, '#0e8f6e']];
  $('#arb').innerHTML = `<h3 class="sys-card-title">Multiple arbitrage, once funded ${EST}</h3>${bars.map(([l, a, b, c]) => `<div class="pb-arb-row"><span>${esc(l)}</span><div class="pb-bar"><i style="left:${(a === b ? 0 : a / 11 * 100)}%;width:${(a === b ? b / 11 : (b - a) / 11) * 100}%;background:${c}"></i></div><b class="sys-num">${a === b ? a.toFixed(1) : a + '–' + b}x</b></div>`).join('')}<p class="pb-fine">Denville precedent: ~$20M for ~$25M revenue (~0.8x sales). Each $1M of acquired EBITDA bought at 6x and held at ${typ}x adds ~$${(typ - 6).toFixed(1)}M of value before synergies; at the premium multiple, ~$${(prem - 6).toFixed(1)}M. ${srcLink(f5?.source_url, 'Harvard Bioscience 8-K')}</p>`;
  const riv = (S.pe?.items || []).filter(i => /Thomas Scientific/.test(JSON.stringify(i))).sort((a, b) => (a.threat_level === 'high' ? -1 : 1) - (b.threat_level === 'high' ? -1 : 1));
  const cal = byId('tpl-09');
  $('#rivals').innerHTML = `<h3 class="sys-card-title">Who else is bidding</h3>${riv.map(r => `<div class="pb-rival"><h4>${esc(r.firm)} <span class="pb-thr ${esc(r.threat_level || 'medium')}">${esc(r.threat_level || '—')} threat${r.competes_for ? ' · ' + esc(HZ(r.competes_for).replace(/_/g, ' ')) : ''}</span></h4><p>${esc(cut(clean(r.threat_rationale), 210))}</p></div>`).join('')}<p class="sys-src"><b>Source:</b> Private-equity landscape. ${riv.length} sponsors in the portal's sponsor screen name Thomas Scientific as a competitor for deals or targets. The response is speed on the top-ranked names with seller-friendly, cash-light structures${cal ? '; Calibre\'s three-division model is the precedent (see the analogs in section 01)' : ''}.</p>`;
}

/* ── RETURNS ──────────────────────────────────────────────────────────── */
function renderReturns() {
  $('#fin-grid').innerHTML = byKind('financing').map(f => `<article class="sys-card"><h3 class="sys-card-title">${esc(f.instrument)}</h3><p class="sys-card-body">${esc(cut(clean(f.facts), 200))}</p><div class="pb-imp">${esc(cut(clean(f.implication), 190))}</div>${srcLink(f.source_url)}</article>`).join('');
  const r = road(); const D = D0 * 1e6;
  const rows = r.length ? [...r.slice(0, 2), { month: 14, revenue_usd: interp(14, 'revenue_usd'), ebitda_usd: interp(14, 'ebitda_usd'), headcount: Math.round(interp(14, 'headcount')), locations_or_accounts: 'First-lien maturity, 14 Dec 2027', note: 'Interpolated between months 12 and 24. The 2027 amend-and-extend is sized on this EBITDA, not on month 36.', maturity: true }, ...r.slice(2)] : [];
  safe('cash', renderCash);
  const charts = () => { if (!r.length) return;
    const W = NARROW() ? 400 : 640, H = 250, pl = 46, pr = 46, pt = 26, pb = 34; const gw = (W - pl - pr) / r.length; const yR = v => H - pb - v / 400e6 * (H - pt - pb), yE = v => H - pb - v / 60e6 * (H - pt - pb);
    const line = r.map((m, i) => `${i ? 'L' : 'M'}${(pl + gw * i + gw / 2).toFixed(1)},${yE(m.ebitda_usd).toFixed(1)}`).join('');
    $('#road-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue bars and EBITDA line by month, estimated">${[0, 100, 200, 300, 400].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${yR(v * 1e6)}" y2="${yR(v * 1e6)}" stroke="#eef1f5"/><text x="${pl - 6}" y="${yR(v * 1e6) + 3}" font-size="10" text-anchor="end" fill="#94a3b3" font-family="JetBrains Mono">$${v}M</text><text x="${W - pr + 6}" y="${yR(v * 1e6) + 3}" font-size="10" fill="#0e8f6e" font-family="JetBrains Mono">$${v * .15}M</text>`).join('')}${r.map((m, i) => { const x = pl + gw * i + gw * .22, w = gw * .56; return `<rect x="${x}" y="${yR(m.revenue_usd)}" width="${w}" height="${H - pb - yR(m.revenue_usd)}" rx="5" fill="${i ? '#c9d9ee' : '#dfe6ee'}"/><text x="${x + w / 2}" y="${H - pb - 10}" font-size="12" text-anchor="middle" fill="#2c3d4f" font-weight="700">${mUSD(m.revenue_usd)}</text><text x="${x + w / 2}" y="${H - pb + 16}" font-size="11" text-anchor="middle" fill="#617184" font-family="JetBrains Mono">Month ${m.month}</text>`; }).join('')}<path d="${line}" fill="none" stroke="#0e8f6e" stroke-width="3"/>${r.map((m, i) => `<circle cx="${pl + gw * i + gw / 2}" cy="${yE(m.ebitda_usd)}" r="5" fill="#fff" stroke="#0e8f6e" stroke-width="3"/><text x="${pl + gw * i + gw / 2}" y="${yE(m.ebitda_usd) - 10}" font-size="11.5" text-anchor="middle" fill="#0e8f6e" font-weight="700">${mUSD(m.ebitda_usd, 1)}</text>`).join('')}<text x="${pl}" y="12" font-size="10.5" fill="#617184">Revenue (bars, left) · EBITDA (line, right)</text></svg>`;
    $('#road-chart').insertAdjacentHTML('beforeend', `<div class="pb-road-stats">${[['EBITDA margin', `${(r[0].ebitda_usd / r[0].revenue_usd * 100).toFixed(1)}% → ${(r[3].ebitda_usd / r[3].revenue_usd * 100).toFixed(1)}%`], ['Leverage', `${(D / r[0].ebitda_usd).toFixed(1)}x → ${(debtAt(36) * 1e6 / r[3].ebitda_usd).toFixed(1)}x`], ['Headcount', `${n0(r[0].headcount)} → ${n0(r[3].headcount)}`], ['Distribution centers', '9 → 11']].map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>`);
    $('#road-table').innerHTML = `<div class="sys-table-wrap"><table class="sys-table pb-road-t"><thead><tr><th class="sys-n">Month</th><th class="sys-n">Revenue</th><th class="sys-n">EBITDA</th><th class="sys-n">Margin</th><th class="sys-n">Debt*</th><th class="sys-n">Leverage*</th><th class="sys-n">Headcount</th><th>Footprint and coverage</th></tr></thead><tbody>${rows.map(m => `<tr${m.maturity ? ' class="mat"' : ''}><td class="sys-n" data-l="Month">${m.month}${m.maturity ? '<span class="pb-mat-tag">Dec 2027</span>' : ''}</td><td class="sys-n" data-l="Revenue">${mUSD(m.revenue_usd)}</td><td class="sys-n" data-l="EBITDA">${mUSD(m.ebitda_usd, 1)}</td><td class="sys-n" data-l="Margin">${(m.ebitda_usd / m.revenue_usd * 100).toFixed(1)}%</td><td class="sys-n" data-l="Debt*">${mUSD(debtAt(m.month) * 1e6)}</td><td class="sys-n" data-l="Leverage*">${(debtAt(m.month) * 1e6 / m.ebitda_usd).toFixed(1)}x</td><td class="sys-n" data-l="Headcount">${n0(m.headcount)}</td><td>${esc(clean(m.locations_or_accounts))}<br><small>${esc(cut(clean(m.note).replace(/At est\. \$260M debt this is ~6\.1x, inside the 5\.25-6\.25x unitranche band\. /, ''), 240))}</small></td></tr>`).join('')}</tbody><caption>Source: Thomas Scientific growth plan KPI roadmap and SEC-filing estimates (revenue $250–320M, EBITDA $25–35M), Oct 2026. *Debt from the sources-and-uses bridge above: ${mUSD(D)} today, paid down by free cash after interest, raised by debt-funded tuck-ins. Analyst assumptions, not company guidance.</caption></table></div>`;
    // Refi capacity
    const f4 = byId('fin-04'); const [lo, hi] = unitranche();
    const RW = NARROW() ? 360 : 440, RH = 250, rl = 100, rr = 16, rt = 16, rb = 28, mx = 340; const X = v => rl + v / mx * (RW - rl - rr); const bh = (RH - rt - rb) / rows.length;
    $('#refi').innerHTML = `<svg viewBox="0 0 ${RW} ${RH}" role="img" aria-label="Unitranche debt capacity by month against estimated debt outstanding"><rect x="${X(210)}" y="${rt - 6}" width="${X(310) - X(210)}" height="${RH - rt - rb + 6}" fill="rgba(194,65,59,.08)"/>${rows.map((m, i) => { const e = m.ebitda_usd / 1e6, a = lo * e, b = hi * e, y = rt + i * bh + bh * .25, dm = debtAt(m.month); return `${m.maturity ? `<rect x="2" y="${y - bh * .2}" width="${RW - 4}" height="${bh * .9}" rx="6" fill="rgba(217,130,43,.12)" stroke="#d9822b" stroke-dasharray="3 3"/>` : ''}<text x="${rl - 8}" y="${y + bh * .32}" font-size="11" text-anchor="end" fill="${m.maturity ? '#9a4f0c' : '#2c3d4f'}" font-weight="${m.maturity ? 700 : 400}" font-family="JetBrains Mono">${m.maturity ? 'Dec 27 · m14' : 'Month ' + m.month}</text><rect x="${X(0)}" y="${y}" width="${X(a) - X(0)}" height="${bh * .5}" rx="4" fill="#e3f4ee"/><rect x="${X(a)}" y="${y}" width="${X(b) - X(a)}" height="${bh * .5}" rx="4" fill="${b >= dm ? '#0e8f6e' : '#9fdcc8'}"/><line x1="${X(dm)}" x2="${X(dm)}" y1="${y - 3}" y2="${y + bh * .5 + 3}" stroke="#c2413b" stroke-width="2.5"/><text x="${X(0) + 8}" y="${y + bh * .36}" font-size="10.5" fill="#0b5d48" font-family="JetBrains Mono" font-weight="600">$${Math.round(a)}–${Math.round(b)}M${m.maturity ? ` vs $${Math.round(dm)}M` : ''}</text>`; }).join('')}${[0, 100, 200, 300].map(v => `<text x="${X(v)}" y="${RH - 8}" font-size="10" text-anchor="middle" fill="#94a3b3" font-family="JetBrains Mono">$${v}M</text>`).join('')}</svg>`;
    const e14 = interp(14, 'ebitda_usd') / 1e6, d14 = debtAt(14), d36 = debtAt(36), e36 = r[r.length - 1].ebitda_usd / 1e6;
    $('#refi-note').innerHTML = `Bars = ${lo}–${hi}x × EBITDA (new-issue unitranche, $20–100M EBITDA borrowers). Shaded band = est. debt of $210–310M after PIK accretion. <b>At the Dec 2027 maturity (month 14)</b> ~$${e14.toFixed(1)}M of EBITDA supports $${Math.round(lo * e14)}–${Math.round(hi * e14)}M against ~$${Math.round(d14)}M of debt left after the wave-1 cash levers: a $${Math.round(d14 - hi * e14)}–${Math.round(d14 - lo * e14)}M gap that an amend-and-extend must bridge with sponsor preferred, paydown or lender terms. Month 36 (Oct 2029) comes after the maturity; there ~$${Math.round(d36)}M of debt is ${(d36 / e36).toFixed(1)}x (${((CMP()?.at?.[36]?.D ?? d36) / e36).toFixed(1)}x if the tuck-ins use new preferred), at the top of the band: the bar for a full refinancing or sale. Red ticks = est. debt that month, from the sources-and-uses bridge. ${srcLink(f4?.source_url, 'Houlihan Lokey, Oct 2025')}`;
  }; charts();
  const ra = (S.ev?.items || []).find(i => i.id === 'ra-ts'); const ve6 = (S.ev?.items || []).find(i => i.id === 've-06');
  if (ra) { const os = $('#os'); os.max = ra.multiple_expansion_turns?.[1] ?? 1; }
  if (ve6?.metric_range) { $('#mx').min = Math.min(6, ve6.metric_range[0]); $('#mx').max = Math.max(10, ve6.metric_range[1]); }
  const d36 = Math.round(debtAt(36) / 5) * 5; $('#dbt').value = d36; $('#dbt').max = Math.max(320, d36 + 20);
  const upd = () => safe('bridge', () => drawBridge(ra, ve6));
  ['#mx', '#os', '#dbt', '#pf'].forEach(s => $(s).addEventListener('input', upd)); upd();
  try { window.matchMedia('(max-width:560px)').addEventListener('change', () => { safe('charts', charts); upd(); }); } catch { }
}
function drawBridge(ra, ve6) {
  const r = road(); const e0 = (r[0]?.ebitda_usd || 30e6) / 1e6, e3 = (r[3]?.ebitda_usd || 42.5e6) / 1e6;
  const M = +$('#mx').value, P = +$('#os').value, D = +$('#dbt').value, PF = +$('#pf').value;
  $('#mx-out').textContent = M.toFixed(1) + 'x'; $('#os-out').textContent = P.toFixed(2) + ' turns'; $('#dbt-out').textContent = '$' + D + 'M'; $('#pf-out').textContent = '$' + PF + 'M';
  const ev0 = e0 * M, g = (e3 - e0) * M, prem = e3 * P, ev3 = ev0 + g + prem, eq0 = ev0 - D0, eq3 = ev3 - D;
  const steps = [['Today EV', 0, ev0, '#94a3b3'], ['EBITDA growth', ev0, ev0 + g, '#1767d1'], ['LabOS premium', ev0 + g, ev3, '#7a4fd6'], ['Month-36 EV', 0, ev3, '#0b1d2c'], ['Less debt', ev3 - D, ev3, '#c2413b'], ['Equity', 0, Math.max(eq3, 0), eq3 >= 0 ? '#0e8f6e' : '#c2413b']];
  const nar = NARROW(); if (nar) { const sh = ['Today EV', 'Growth', 'LabOS', 'Mo-36 EV', 'Debt', 'Equity']; steps.forEach((x, i) => { x[0] = sh[i]; }); }
  const W = nar ? 400 : 640, H = 240, pl = 10, pr = 10, pt = 22, pb = 40; const top = Math.max(ev3, 1) * 1.08; const lo = Math.min(0, eq3, eq0) * 1.1; const Y = v => pt + (top - v) / (top - lo) * (H - pt - pb); const bw = (W - pl - pr) / steps.length;
  $('#bridge').innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#cfd8e3"/>${steps.map(([l, a, b, c], i) => { const x = pl + bw * i + bw * .16, w = bw * .68, y1 = Y(Math.max(a, b)), y2 = Y(Math.min(a, b)); const val = i === 4 ? -D : (i === 1 ? g : i === 2 ? prem : i === 5 ? eq3 : b - a); return `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(1, y2 - y1)}" rx="5" fill="${c}"/><text x="${x + w / 2}" y="${y1 - 6}" font-size="12" text-anchor="middle" font-weight="700" fill="#0b1d2c">${val < 0 ? '−' : i === 1 || i === 2 ? '+' : ''}$${Math.abs(Math.round(val))}M</text><text x="${x + w / 2}" y="${H - pb + 16}" font-size="11" text-anchor="middle" fill="#617184">${esc(l)}</text>`; }).join('')}</svg>`;
  const mark = Math.max(0, eq0), rec = Math.max(0, eq3) - mark; const sgn = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)) + 'M';
  $('#eq').innerHTML = `<div class="${eq0 >= 0 ? '' : 'neg'}"><small>Equity value at today's estimates</small><b>${sgn(eq0)}</b><span>${M.toFixed(1)}x × $${e0}M − $${D0}M debt · est.</span></div><div class="${eq3 >= 0 ? 'pos' : 'neg'}"><small>Equity value, month 36</small><b>${sgn(eq3)}</b><span>${(M + P).toFixed(2)}x × $${e3}M − $${D}M debt</span></div><div><small>Equity value recovered vs today's mark</small><b>${rec >= 0 ? '+' : ''}${sgn(rec)}</b><span>EBITDA growth +$${Math.round(g)}M · LabOS +$${Math.round(prem)}M · debt change ${D > D0 ? '−' : '+'}$${Math.abs(Math.round(D - D0))}M</span></div>`;
  const pos = Math.max(0, eq3), pRec = Math.min(pos, PF), cRec = Math.max(0, pos - PF), moic = pos / INVESTED, cm = cRec / COMMON_IN;
  $('#recov').innerHTML = `<div class="pb-recov-h"><h4 class="sys-card-title">Paths back to full equity recovery ${EST}</h4><p class="pb-fine">BSP-TS, LP raised $${COMMON_IN}M at close and $${INVESTED}M cumulative; the co-invest vehicles ($${CO_INV}M) most likely invest through BSP-TS, LP, so they are not added. Preferred units rank ahead of common.</p></div><div class="pb-recov-g"><div><small>Invested capital</small><b>$${INVESTED}M</b><span>$${COMMON_IN}M at close + ~$21M preferred top-ups</span></div><div><small>Preferred recovery</small><b>$${Math.round(pRec)}M <em>of $${PF}M</em></b><span>${PF ? Math.round(pRec / PF * 100) + '% of the preferred balance' : 'no preferred assumed'}</span></div><div class="${cRec > 0 ? '' : 'neg'}"><small>Common recovery</small><b>$${Math.round(cRec)}M</b><span>${cm.toFixed(2)}x of the $${COMMON_IN}M common cheque</span></div><div class="${moic >= 1 ? 'pos' : 'neg'}"><small>Recovery multiple</small><b>${moic.toFixed(2)}x</b><span>month-36 equity ÷ all capital invested</span></div></div><div class="sys-note sys-note--warn"><span>This is a capital protection and recovery plan, not a return plan. On these settings ${moic < 1 ? `BSP gets back about ${Math.round(moic * 100)} cents per dollar invested by month 36, and ${pRec >= pos - .5 && PF > 0 ? 'all of it goes to the preferred' : `the preferred is paid first`}` : 'invested capital is returned'}. The win is keeping control of the asset through the 2027 maturity and owning the upside after it.</span></div>`;
  const inv = ra?.investment_usd ? `$${ra.investment_usd[0] / 1e6}–${ra.investment_usd[1] / 1e6}M` : '$2–4M';
  $('#bridge-note').innerHTML = `Base multiple slider spans the Capstone/IMAP typical (${ve6?.metric_range?.[0] ?? 6.8}x) to premium (${ve6?.metric_range?.[1] ?? 9.8}x) middle-market range. LabOS premium is capped at ${ra?.multiple_expansion_turns?.join('–') ?? '0.5–1.0'} turns in the portal's tech-premium evidence ("${esc(cut(clean((ra?.rationale || '').split('. ').find(x => /capped/.test(x)) || ''), 200)).replace(/[.…]+$/, '')}…"). LabOS costs ${inv}, ${ra?.time_to_value_months?.join('–') ?? '9–18'} months to value, est. EBITDA impact ${ra ? mUSD(ra.ebitda_impact_usd[0], 2) + '–' + mUSD(ra.ebitda_impact_usd[1], 1) : '$1.25–4.8M'} (already inside the roadmap). Today's equity uses est. $${D0}M of debt; the month-36 debt slider starts at the sources-and-uses result (tuck-ins debt-funded). If the tuck-ins are funded with new preferred instead, lower the debt and raise the preferred by the same ~$28M.${EST} Analyst assumption, not a forecast.`;
}

/* ── RISKS & ASKS ─────────────────────────────────────────────────────── */
function renderRisks() {
  const avtr = (S.comps?.items || []).find(i => i.ticker === 'AVTR'); const lab = S.comps?.meta?.sector_benchmarks?.lab_distribution;
  const cal = (S.pe?.items || []).find(i => i.id === 'stonecalibre'); const calN = cal?.platforms_relevant?.[0]?.add_ons_count;
  const R = [
    MG() ? { hi: 1, t: 'Maturity and refinancing (14 Dec 2027)', p: 'Lenders will size the 2027 amend-and-extend on the EBITDA and cash Thomas can show by mid-2027, about $33M on this plan, which supports less debt than is outstanding today.', m: 'Cash levers first (collections, pricing, order entry); two quarters of KPI proof before the lender dialogue opens in Q1 2027; the sponsor prepares the equity side.' }
      : { hi: 1, t: 'Maturity and refinancing (14 Dec 2027)', p: 'The first-lien loan is at 88.3% of par (MFIC 10-Q, June 30, 2026) and leverage is est. 7–10x. At maturity (month 14) est. EBITDA of ~$33M supports well under today\'s debt; without a sponsor-backed amend-and-extend the outcome is lender-led.', m: 'Cash levers first (collections, pricing, order entry); open the lender dialogue in Q1 2027 with two quarters of KPI proof; size sponsor preferred or paydown for the ~$50–80M gap now.' },
    { hi: 1, t: 'The numbers are estimates', p: 'Revenue, EBITDA and headcount are outside-in estimates from SEC filings at low confidence; most lever baselines are not disclosed.', m: 'The ten-line data request above replaces every missing baseline and estimate on this page before any spend is committed.' },
    { t: 'A flat or shrinking end market', p: `Lab-distribution median growth is ${lab?.median_revenue_growth_latest_pct ?? 1.5}%; Avantor revenue moved ${avtr?.revenue_growth_latest_pct ?? -3.4}% in its latest year.`, m: 'Growth targets lean on mix (private label, specialty verticals) and coverage of under-served sites, not market volume.' },
    { t: 'Add-on competition', p: `Calibre Scientific has made ${calN ? calN + '+' : 'dozens of'} acquisitions and is rated a high threat for the same U.S. targets.`, m: 'Use the proprietary screen and seller-friendly structures (rollover, earn-outs); focus on U.S. regional distributors Calibre has not prioritized.' },
    { t: 'Cannabis and specialty credit risk', p: 'Thomas is a listed trade creditor in the 2026 Cannabist Co. bankruptcy; cannabis testing growth comes with weak customers.', m: 'Credit limits, prepay or card terms for cannabis accounts; grow the vertical through testing labs, not operators.' },
    { t: 'Vendor results are upper bounds', p: 'AI-agent and VMI metrics are self-reported vendor case studies; go-live weeks are estimates.', m: 'Pilot each agent with a control group, stage-gate spend against measured cash or margin, inside the LabOS $2–4M envelope.' },
    { t: 'Federal revenue volatility', p: 'Federal obligations fell from $84–91M a year in the COVID period to $8.3M in FY2025.', m: 'Treat federal and forensics as upside; do not underwrite the refinancing on it.' },
  ];
  $('#risk-list').innerHTML = R.map(x => `<li class="${x.hi ? 'hi' : ''}"><b>${esc(x.t)}</b><p>${esc(x.p)}</p><p><span class="pb-mit">Mitigation:</span> ${esc(x.m)}</p></li>`).join('');
  const top = [...S.ma].sort((a, b) => b.fit_score - a.fit_score).slice(0, 4).map(t => t.company.replace(/\s*\(.*\)/, '').replace(/,? Inc\.?$/, ''));
  const A = MG() ? [
    ['CEO', 'Own the 36-month plan', 'Confirm or correct the baselines and targets on this page; set the four phase goals with the leadership team.'],
    ['CFO & COO (Adrian Whipple)', 'Cash first', 'Run the ten-line data request and a 13-week cash forecast; lead the collections and pricing pilots; build the KPI pack the lenders will see in Q1 2027.'],
    ['VP Sales', 'Coverage plan', 'Map the 3,030 Pursue and Nurture sites to rep books; recruit academy cohort 1 for month 6.'],
    ['VP Operations', 'Order entry and fill rate', 'Pilot the order-entry agent at one DC; report fill rate and lines picked per DC monthly.'],
    ['BSP PRG (support)', 'Vendors, academy, dashboards', 'Vendor selection, academy design, the NJDOL apprenticeship filing and the portal dashboards behind the board pack.'],
  ] : [
    ['Deal team', 'Open the refinancing track', 'Engage Apollo/MidCap on an amend-and-extend by Q1 2027; model amend-and-extend vs recap vs sale against the KPI roadmap.'],
    ['PRG finance with the CFO & COO', '30-day data request', 'The ten lines above: P&L by DC, debt, 13-week cash, AR aging, price waterfall, channel split, private label, DCs, rep roster, top customers.'],
    ['PRG technology', 'Approve wave-1 agents', 'Collections/cash-application, pricing guidance and order entry, stage-gated inside the LabOS budget.'],
    ['PRG talent', 'Stand up the academy', 'Hire an inside-sales academy lead; file the NJDOL GAINS apprenticeship application for Swedesboro (up to $12,000 per apprentice).'],
    ['Deal team (M&A)', 'Keep the screen warm', `Relationship calls with ${top.join(', ')}; cash-light structures only; no LOIs until the refinancing path is visible.`],
    ['Board (Lynn Calpeter, Chair)', 'One KPI pack', 'Quarterly dashboard from the portal\'s Thomas views (coverage, digital share, DSO, margin) doubles as the lender update.'],
  ];
  const own = (o, t) => `<span class="pb-own-i"><em>${esc(o)}</em>${esc(t)}</span>`;
  $('#ninety').innerHTML = `<h4 class="sys-card-title">The first 90 days, with a management owner for each item</h4>${[
    ['Day 0–30', [['CFO & COO', 'Data request and 13-week cash forecast; lender pre-read'], ['CEO', 'Pick the collections and pricing vendors'], ['VP Sales', 'Rep roster and current coverage of the 3,030 sites']]],
    ['Day 30–60', [['CFO & COO', 'Collections and pricing agents in pilot with control groups'], ['VP Sales', 'Academy cohort 1 recruited'], ['VP Operations', 'Private-label swap list for the top 200 SKUs; order-entry pilot at one DC']]],
    ['Day 60–90', [['CFO & COO', 'First measured cash release (DSO) and price-realization read'], ['CEO', 'KPI pack v1 to the board' + (MG() ? '' : ' and lenders')]]],
  ].map(([d, items]) => `<div class="pb-n-row"><b>${d}</b><span>${items.map(([o, t]) => own(o, t)).join('')}</span></div>`).join('')}`;
  $('#ask-list').innerHTML = A.map(([w, t, d]) => `<li><span class="pb-who">${esc(w)}</span><br><b>${esc(t)}.</b> ${esc(d)}</li>`).join('');
}

/* ── CASH BRIDGE ──────────────────────────────────────────────────────── */
function renderCash() {
  const cm = CM(), cp = CMP(); const r = road(); if (!cm || !cp) return;
  const [lo, hi] = unitranche(); const a14 = cm.at[14].A, a36 = cm.at[36].A; const e36 = r[r.length - 1].ebitda_usd / 1e6;
  const f = v => Math.abs(v) < .05 ? '$0' : (v < 0 ? '−' : '+') + '$' + Math.abs(v).toFixed(1) + 'M';
  const lines = [
    ['EBITDA (roadmap, month by month)', a => a.ebitda, 1, 'Pricing gains ($1.4–3.4M a year at 50–120 bps) sit inside this line'],
    ['Collections: DSO down 5–10 days (one-time)', a => a.dso, 1, `~$${cm.dsoDay.toFixed(2)}M per day; mid-case 7.5 days, released months 4–12`],
    ['Cash interest at ~10.1% (SOFR+640)', a => a.interest, -1, 'On the running debt balance; coverage starts near 1.0–1.3x'],
    ['Maintenance capex (~0.75% of revenue)', a => a.capex, -1, 'Distributor norm; validate against the fixed-asset register'],
    ['Working capital for organic growth', a => a.wc, -1, '~15% of new organic revenue (receivables plus inventory)'],
    ['LabOS build', a => a.labos, -1, '$2–4M envelope; $3M used, spent over months 0–18'],
    ['Rep cohorts: ramp cost before productivity', a => a.reps, -1, '30 reps in three cohorts (m6, m12, m18); est. $2.5–3M a year at full strength, $5M of unrecovered ramp'],
    ['Tuck-in purchase prices (~0.8x sales)', a => a.tuck, -1, '~$16M at month 24 (~$20M revenue) and ~$12M at month 36 (~$15M revenue)'],
  ];
  const net = A => lines.reduce((t, [, g, sg]) => t + sg * g(A), 0);
  const n14 = net(a14), n36 = net(a36); const d14 = cm.at[14].D, d36 = cm.at[36].D, p36 = cp.at[36].D;
  const e14 = interp(14, 'ebitda_usd') / 1e6;
  $('#cash').innerHTML = `<div class="sys-table-wrap"><table class="sys-table pb-cash-t"><thead><tr><th>Source or use of cash</th><th class="sys-n">To maturity<br><small>months 0–14</small></th><th class="sys-n">Full plan<br><small>months 0–36</small></th><th>Basis</th></tr></thead><tbody>${lines.map(([l, g, sg, b]) => `<tr><td>${esc(l)}</td><td class="sys-n ${sg < 0 ? 'neg' : 'pos'}">${f(sg * g(a14))}</td><td class="sys-n ${sg < 0 ? 'neg' : 'pos'}">${f(sg * g(a36))}</td><td class="b">${esc(b)}</td></tr>`).join('')}<tr class="tot"><td>Net cash (pays down debt if positive)</td><td class="sys-n">${f(n14)}</td><td class="sys-n">${f(n36)}</td><td class="b">Cash taxes assumed nil (pass-through LLC, heavy interest)</td></tr><tr class="tot"><td>Debt at the end of the period</td><td class="sys-n">$${Math.round(d14)}M</td><td class="sys-n">$${Math.round(d36)}M</td><td class="b">Starts at est. $${D0}M (range $210–310M after PIK)</td></tr></tbody><caption>Source: Thomas Scientific growth plan KPI roadmap; Houlihan Lokey unitranche terms; analyst cash model, Oct 2026.</caption></table></div>
  <div class="pb-cash-out"><div class="warn"><small>At the Dec 2027 maturity</small><b>${(d14 / e14).toFixed(1)}x</b><span>$${Math.round(d14)}M on ~$${e14.toFixed(1)}M EBITDA; the market lends $${Math.round(lo * e14)}–${Math.round(hi * e14)}M</span></div><div class="${d36 / e36 <= hi ? 'ok' : 'warn'}"><small>Month 36, tuck-ins debt-funded</small><b>${(d36 / e36).toFixed(1)}x</b><span>$${Math.round(d36)}M of debt ${d36 / e36 <= hi ? 'inside' : 'above'} the ${lo}–${hi}x band</span></div><div class="ok"><small>Month 36, tuck-ins funded with ~$${cp.tuckTotal}M new preferred</small><b>${(p36 / e36).toFixed(1)}x</b><span>$${Math.round(p36)}M of debt, inside the band; the preferred ranks ahead of common</span></div></div>
  <p class="pb-fine">Free cash after interest is thin: the plan pays its own way but does not shrink the debt much before 2027. That is why the maturity needs sponsor support, and why the tuck-ins wait for new money. The debt slider in the multiple-expansion case below starts at $${Math.round(d36 / 5) * 5}M from this bridge.${EST}</p>`;
}

/* ── FIRST MEETING ────────────────────────────────────────────────────── */
function renderFirstMeeting() {
  const cm = CM(); const r = road(); if (!cm || !r.length) return;
  const [lo, hi] = unitranche(); const e14 = interp(14, 'ebitda_usd') / 1e6; const rev = r[0].revenue_usd / 1e6;
  const gapLo = D0 - hi * e14, gapHi = D0 - lo * e14; const dsoLo = cm.dsoDay * DSO_DAYS[0], dsoHi = cm.dsoDay * DSO_DAYS[1];
  const a14 = cm.at[14].A; const ofc = a14.ebitda - a14.interest - a14.capex - a14.wc - a14.labos - a14.reps; const prLo = rev * .005 * .67, prHi = rev * .012 * .67;
  const remLo = Math.max(0, gapLo - dsoHi - ofc), remHi = Math.max(0, gapHi - dsoLo - ofc);
  const req = [
    ['Monthly P&L', 'revenue, gross margin and EBITDA by DC, Jan 2024 to date, plus the 2026 budget'],
    ['Debt and covenants', 'lender model, compliance certificates, current term loan, DDTL and revolver balances'],
    ['13-week cash forecast', 'and the capex plan for the next four quarters'],
    ['AR aging', 'by customer segment, with monthly DSO for the last 24 months'],
    ['Price waterfall', 'list to contract to invoice to pocket price for the top 500 SKUs; override rates'],
    ['Order channels', 'ERP split of orders by punchout, web, email/PDF, phone and fax, by month'],
    ['Private label', 'SKU list and revenue mix by category'],
    ['DC list', 'square footage, lines picked, fill rate and inventory by distribution center'],
    ['Rep roster', 'territory, book size, tenure and quota attainment'],
    ['Top 200 customers', 'revenue, contract and punchout status (names stay inside the company)'],
  ];
  const max = Math.max(gapHi, 1) * 1.05; const bar = (a, b, c) => `<div class="pb-bar"><i style="left:${Math.max(0, a) / max * 100}%;width:${Math.max(.6, (b - a) / max * 100)}%;background:${c}"></i></div>`;
  const wf = [
    ['Gap at maturity', `Debt ~$${D0}M vs $${Math.round(lo * e14)}–${Math.round(hi * e14)}M of capacity on ~$${e14.toFixed(1)}M EBITDA`, gapLo, gapHi, '#c2413b', `$${Math.round(gapLo)}–${Math.round(gapHi)}M`],
    ['Collections (DSO −5 to −10 days)', 'One-time cash release, months 4–12', dsoLo, dsoHi, '#0e8f6e', `−$${dsoLo.toFixed(1)}–${dsoHi.toFixed(1)}M`],
    [ofc >= 0 ? 'Operating cash after interest' : 'Operating cash after interest (a small drain)', `Includes ~$${prLo.toFixed(1)}–${prHi.toFixed(1)}M of pricing gains realized by month 14; net of capex, working capital, LabOS and rep ramp`, 0, Math.abs(ofc), ofc >= 0 ? '#0e8f6e' : '#c2413b', `${ofc >= 0 ? '−' : '+'}$${Math.abs(ofc).toFixed(1)}M`],
    ['Left for the amend-and-extend', 'Sponsor preferred, equity paydown or lender terms (extension fee, margin step-up, partial PIK)', remLo, remHi, '#d9822b', `$${Math.round(remLo)}–${Math.round(remHi)}M`],
  ];
  $('#first-meeting').innerHTML = `<div class="pb-fm-h"><div><p class="sys-kicker">For the first meeting with management</p><h3 id="fm-h" class="sys-h3">A 14-month cash plan and a ten-line data request</h3><p class="sys-card-body">Wave-1 levers do not close the refinancing gap on their own. Say so in the first meeting.</p></div><button type="button" class="sys-btn sys-btn--primary sys-btn--sm pb-fm-print" id="fm-print">Print this one-pager</button></div>
  <div class="pb-fm-grid"><div><h4 class="sys-card-label">Data request</h4><ol class="pb-fm-req">${req.map(([b, t]) => `<li><b>${esc(b)}:</b> ${esc(t)}</li>`).join('')}</ol></div>
  <div><h4 class="sys-card-label">Cash to the Dec 2027 maturity ${EST}</h4><div class="pb-fm-wf">${wf.map(([l, s, a, b, c, v]) => `<div class="pb-fm-row"><div class="pb-fm-l"><b>${esc(l)}</b><span>${esc(s)}</span></div>${bar(a, b, c)}<b class="pb-fm-v sys-num">${esc(v)}</b></div>`).join('')}</div><p class="sys-src"><b>Source:</b> capacity = ${lo}–${hi}x unitranche (Houlihan Lokey, Oct 2025). EBITDA at month 14 is interpolated from the roadmap. Every figure needs management validation.</p></div></div>`;
  $('#fm-print').onclick = () => { document.body.classList.add('print-fm'); const done = () => { document.body.classList.remove('print-fm'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500); };
}

/* ── VIEW (deal team vs management) ───────────────────────────────────── */
function initView() {
  const apply = () => {
    document.body.classList.toggle('mgmt', MG());
    $$('.pb-view-sw [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
    safe('hero', renderHero); safe('risks', renderRisks); safe('est', () => { badgeEst($('#hero-lede')); badgeEst($('#risks')); });
    $('#ask-h').textContent = MG() ? 'Owners inside Thomas, with PRG support' : 'Asks of the deal team, the PRG and management';
    $$('.sys-est').forEach(e => { e.title = 'Estimate: needs management validation'; });
  };
  $$('.pb-view-sw [data-view]').forEach(b => b.onclick = () => {
    S.view = b.dataset.view; apply();
    try { const u = new URL(location.href); if (MG()) u.searchParams.set('view', 'mgmt'); else u.searchParams.delete('view'); history.replaceState(null, '', u); } catch { }
  });
  apply();
}

/* ── SOURCES ──────────────────────────────────────────────────────────── */
function renderSources() {
  const urls = new Map(); S.items.forEach(i => { if (i.source_url) urls.set(i.source_url, i.id); (i.source_urls || []).forEach(u => urls.set(u, i.id)); });
  const m = S.meta;
  const DSN = { ts_sites: 'Thomas Scientific lab sites', ts_parents: 'Thomas Scientific parent accounts', ma_targets_fl_ts: 'Frontline and Thomas Scientific add-on targets', thomas_filings: 'Thomas Scientific public filings (MFIC and MAIPL marks, Form D, USASpending)', public_comps: 'Public comparables', pe_landscape: 'Private-equity landscape', bsp_firm: 'BSP firm profile', serviceos_evidence: 'OS program evidence' };
  const lab = u => { const h = host(u); if (/sec\.gov/.test(h)) return /1278752/.test(u) ? 'MFIC 10-Q / 10-K schedule of investments' : /1901071|1900890|1917661/.test(u) ? 'BSP Form D (BSP-TS vehicles)' : 'SEC filing'; return h; };
  const caveats = (m.caveats || []).filter(c => !/not present in the repo|build time/i.test(c)).map(clean);
  const ext = clean(String(m.method || '').split(/(?=External evidence)/)[1] || '');
  const method = `Phase counts are computed from the portal's scored-site file (27,503 sites, aggregated by region only: counts by vertical, priority label and archetype, plus summed 2023 CMS allowed amounts) and its top-500 parent-organization file. Add-on targets come from the portal's 25-company Thomas screen (ZoomInfo revenue estimates). Capital structure and company estimates come from SEC filings research; lab-distribution medians from public comparables; Calibre and Sterling from the sponsor landscape; the Smith + Howard timeline and Thomas add-ons from the BSP firm profile; LabOS benchmarks from the portal's tech-premium evidence. ${ext}`;
  $('#src-body').innerHTML = `<div class="sys-prose pb-srcs"><p><b>Method.</b> ${esc(method)}</p><p><b>Caveats.</b></p><ul>${caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul><p><b>Portal data used:</b> ${(m.related_datasets || []).map(d => esc(DSN[d] || HZ(d).replace(/_/g, ' '))).join(' · ')} · the Thomas Scientific growth plan${m.generated ? ` (${esc(wd(String(m.generated).slice(0, 10)))})` : ''}. Thomas locations are plotted at city level from the plan and the firm's add-on history.</p><p><b>Sources (${urls.size}).</b></p><ul>${[...urls.keys()].map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(lab(u))}</a> <span class="pb-fine">${esc(host(u))}</span></li>`).join('')}</ul></div>`;
}

/* ── CHAT ─────────────────────────────────────────────────────────────── */
function mountChat(Chat) {
  const r = road(); const a = r[0] || {}, z = r[3] || {}; const D = debtEst();
  const top = [...S.ma].sort((x, y) => y.fit_score - x.fit_score).slice(0, 4);
  const w1 = byKind('ai_agent').filter(x => WAVE[x.id] === 1);
  const faq = [
    { q: 'What is the Thomas Scientific growth plan?', href: '#top', a: `<h4>Thomas Scientific growth plan <span class="ch-badge">est.</span></h4><p>${esc(clean(S.meta.thesis || ''))}</p><ul><li>Revenue <b>${mUSD(a.revenue_usd)} → ${mUSD(z.revenue_usd)}</b> and EBITDA <b>${mUSD(a.ebitda_usd)} → ${mUSD(z.ebitda_usd, 1)}</b> in 36 months</li><li>Leverage <b>${(D0 * 1e6 / a.ebitda_usd).toFixed(1)}x → ${(debtAt(36) * 1e6 / z.ebitda_usd).toFixed(1)}x</b> (debt est. $${D0}M → ~$${Math.round(debtAt(36))}M after the cash bridge)</li><li>Coverage of ~3,000 Pursue + Nurture sites out of 27,503 scored</li></ul><p>Four phases: stabilize the Northeast core (m0–6), target-account selling from the Midwest/South Central hubs (m6–18), West Coast + cleanroom (m12–30), Southeast and specialty verticals (m24–36).</p>` },
    { q: 'When does the Thomas loan mature and why is cash first?', href: '#returns', a: `<h4>Cash first: the December 2027 maturity</h4><p>The Apollo/MidCap first-lien unitranche matures <b>14 Dec 2027</b>; MFIC's 10-Q for June 30, 2026 carries it at <b>88.3% of par</b>. Est. leverage is 7–10x against a 5.25–6.25x unitranche market.</p><p>Each day of DSO is worth ~<b>${mUSD((a.revenue_usd || 285e6) / 365, 1)}</b> of cash, and 50–120 bps of price realization is ~${mUSD((a.revenue_usd || 285e6) * .005)}–${mUSD((a.revenue_usd || 285e6) * .012)} of EBITDA, so collections, pricing and order-entry agents go first. The plan has two steps: a 2027 amend-and-extend sized on ~$33M of EBITDA at the maturity (month 14), with sponsor preferred, paydown or lender terms closing a ~$50–80M gap; then a refinancing or sale near 6x once EBITDA reaches ~$42.5M at month 36 (Oct 2029).</p>` },
    { q: 'Which add-on targets come first for Thomas?', href: '#addons', a: `<h4>Add-on machine: two funded tuck-ins in 36 months</h4><ul>${top.map(t => `<li><b>${esc(t.company)}</b> (${esc(t.hq_city)}, ${esc(t.state)}) · fit ${t.fit_score} · ZoomInfo est. ${mUSD(t.revenue_est_usd)}</li>`).join('')}</ul><p>None while the refinancing is open; ~$20M of revenue around month 24 and ~$15M around month 36, cash-light (earn-outs, seller notes, rollover) or funded with new preferred. Calibre Scientific is the main rival bidder. Regional distributors trade near 0.8x sales (Denville precedent).</p>` },
    { q: 'Which AI agents should Thomas Scientific start with?', href: '#agents', a: `<h4>Wave 1 agents: release cash</h4><ul>${w1.map(x => `<li><b>${esc(x.agent)}</b> (${esc((x.vendor_examples || []).slice(0, 2).join(', '))}, ~${x.weeks_to_deploy} wks): ${esc(cut(x.metric_claim, 130))}</li>`).join('')}</ul><p>Wave 2 sells (quote, account health, rep copilot); wave 3 is digital (search, self-serve assistant, forecasting). Vendor results are self-reported upper bounds.</p>` },
  ];
  let autoAsk; try { autoAsk = new URLSearchParams(location.search).get('ask') || undefined; } catch { }
  const inst = Chat.mount(null, { persona: 'ts', short_name: 'Thomas', mode: 'floating', theme: 'light', faq, suggestions: faq.map(f => f.q).concat(['How does Thomas compare with Smith + Howard?']), autoAsk });
  S.frame?.setChat?.(inst);
}
