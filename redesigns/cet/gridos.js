/* GridOS concept: interactive demo and value math.
   Real data (portal datasets via core.js): CET opportunity radar, CET wastewater-plant screen,
   GridOS evidence base, public comparables. Illustrative: fleet sites, EV ports, the savings project. */
import { STATES, STAGE, daysTo, money, shortDate, clip, ownerOf, plain, srcName, longDate, EST, ILLUS } from './site.js?v=20261006143735';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const n0 = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const n1 = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const mm = v => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const TYPE = { rfp: 'Public bid', capital_plan: 'Capital plan', award: 'Award', program: 'Program', project: 'Project' };
const CROSS = { ev: 'EV', solar: 'Solar', storage: 'Storage', generator: 'Generator', efficiency: 'Efficiency', scada: 'SCADA' };

/* Fallbacks mirror the GridOS evidence base (CET roadmap assumption and KPI benchmarks) if it is unavailable.
   The keys are dataset record keys and never reach the page. */
const FALLBACK = {
  'ra-cet': { investment_usd: [800000, 1800000], time_to_value_months: [9, 15], ebitda_impact_pct_revenue: [1.0, 2.5], ebitda_impact_usd: [620000, 2620000], multiple_expansion_turns: [0.5, 1.5], revenue_basis_usd: [62e6, 105e6] },
  'kb-cet-1': { kpi: 'Bid win rate on public hard-bid work', baseline: 15, target: 30, source_url: 'https://www.constructconnect.com/blog/bid-hit-ratio-commercial-gcs-2026' },
  'kb-cet-2': { kpi: 'Non-optimal time', baseline: 35, target: null, source_url: 'https://www.constructiondive.com/news/industry-could-be-overspending-177b-per-year-study-finds/529450/' },
  'kb-cet-3': { kpi: 'Solar fleet availability', baseline: 94.7, target: 99.1, source_url: 'https://research-hub.nrel.gov/en/publications/advancing-our-understanding-of-system-availability-through-the-pv/' },
};
let EV = [];
const ev = id => EV.find(i => i.id === id) || FALLBACK[id] || null;

/* ── tabs ─────────────────────────────────────────────────────────────────── */
const RENDER = {}; const DONE = new Set();
function tabs() {
  const ts = $$('.go-app-nav [role=tab]');
  const sel = t => { ts.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; }); const id = t.getAttribute('aria-controls'); if (!DONE.has(id) && RENDER[id]) { DONE.add(id); RENDER[id](); } };
  ts.forEach((t, i) => { t.addEventListener('click', () => sel(t)); t.addEventListener('keydown', e => { let j = null; if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % ts.length; if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + ts.length) % ts.length; if (j != null) { e.preventDefault(); sel(ts[j]); ts[j].focus(); } }); });
  const m = /[?&]tab=(\w+)/.exec(location.search); const start = m ? ts.find(t => t.id === 'tab-' + m[1]) : null;
  sel(start || ts[0]);
}
function clock() { const el = $('#clock'); if (!el) return; const f = () => { el.textContent = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' ET'; }; f(); setInterval(f, 30000); }
const head = (title, sub, right = '') => `<div class="go-ph"><div><h3 class="sys-h3">${title}</h3><p class="go-ph-sub">${sub}</p></div>${right ? `<div class="go-ph-r">${right}</div>` : ''}</div>`;
const tile = (label, value, sub, cls = '') => `<div class="sys-kpi"><span class="sys-kpi-label">${label}</span><span class="sys-kpi-value">${value}</span><span class="sys-kpi-sub${cls ? ' go-' + cls : ''}">${sub}</span></div>`;
const foot = (html, link = '') => `<div class="go-foot"><p class="sys-src">${html}</p>${link}</div>`;

/* ── Bid board (CET opportunity radar) ────────────────────────────────────── */
const CAPS = [['all', 'All capabilities'], ['wastewater', 'Wastewater'], ['pump_station', 'Pump stations'], ['generator', 'Generators'], ['controls', 'Controls and SCADA'], ['solar', 'Solar'], ['storage', 'Storage'], ['ev_charging', 'EV charging'], ['energy_efficiency', 'Efficiency'], ['utility', 'Utility'], ['electrical_construction', 'Electrical']];
const CAPN = Object.fromEntries(CAPS);
const gng = o => { const d = daysTo(o.due_date); if (o.stage === 'awarded' || (d != null && d < 0)) return ['Closed', 'pass']; if (!o.due_date && (o.stage === 'planned' || o.type === 'capital_plan')) return ['Pre-position', 'pre']; if ((o.fit_score || 0) >= 80) return ['Bid', 'bid']; if ((o.fit_score || 0) >= 60) return ['Review', 'rev']; return ['Pass', 'pass']; };
const cd = o => { const d = daysTo(o.due_date); if (o.stage === 'awarded') return ['Awarded', 'closed']; if (d == null) return o.stage === 'planned' || o.type === 'capital_plan' ? ['Planned', 'roll'] : ['Rolling', 'roll']; if (d < 0) return ['Closed', 'closed']; if (d === 0) return ['Today', 'urgent']; return [`${d} ${d === 1 ? 'day' : 'days'}`, d <= 3 ? 'urgent' : d <= 14 ? 'soon' : 'ok']; };
const live = o => o.stage !== 'awarded' && !(o.due_date && daysTo(o.due_date) < 0);
function bids(items, meta) {
  const p = $('#pane-bids'); const S = { st: 'ALL', cap: 'all', q: '', closed: false, open: null };
  const stCount = st => items.filter(o => live(o) && (st === 'ALL' || o.state === st)).length;
  p.innerHTML = head('Bid board · New England', `${items.length} public opportunities · compiled ${esc(longDate(meta?.generated))} · countdown in days from today`,
    `<input class="go-input go-search" type="search" placeholder="Search owner, town or scope" aria-label="Search opportunities" data-f="q"><select class="go-input" aria-label="Capability" data-f="cap">${CAPS.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select><label class="go-tgl"><input type="checkbox" data-f="closed"> Show closed</label>`) +
    `<div class="sys-chips go-fbar" role="group" aria-label="Filter by state">${['ALL', ...Object.keys(STATES)].map(st => `<button class="sys-chip" type="button" data-st="${st}" aria-pressed="${st === 'ALL'}">${st === 'ALL' ? 'All states' : st}<span class="go-c">${stCount(st)}</span></button>`).join('')}</div>
    <div class="go-tiles" data-k="tiles"></div>
    <div class="sys-table-wrap go-tbl"><table class="sys-table go-tb"><thead><tr><th>Due</th><th>Opportunity</th><th class="go-hide-m">State</th><th class="go-hide-m">Scope</th><th class="sys-n go-hide-m">Value ${EST}</th><th class="go-hide-m">Fit</th><th>Go / no-go</th></tr></thead><tbody data-k="rows"></tbody></table></div>` +
    foot(`<b>Source:</b> CET opportunity radar (public bid boards, CT, ME and VT Clean Water SRF lists, owner portals). Go/no-go is a GridOS rule ${ILLUS}: fit 80 or more means bid, 60–79 review, planned work pre-position.`, '<a class="sys-link" href="../../app.html#/cet/opportunities">Full radar in the portal →</a>');
  const draw = () => {
    const q = S.q.toLowerCase();
    let rows = items.filter(o => (S.closed || live(o)) && (S.st === 'ALL' || o.state === S.st) && (S.cap === 'all' || (o.capability_match || []).includes(S.cap)) && (!q || `${o.title} ${o.owner_or_agency} ${o.city} ${(o.scope_tags || []).join(' ')}`.toLowerCase().includes(q)));
    const key = o => { const d = daysTo(o.due_date); if (!live(o)) return 9000 - (d ?? 0); if (d != null) return d; return 500 - (o.fit_score || 0); };
    rows.sort((a, b) => key(a) - key(b));
    const lv = rows.filter(live); const soon = lv.filter(o => o.due_date && daysTo(o.due_date) <= 14);
    const pipe = lv.reduce((s, o) => s + (o.est_value_usd || 0), 0); const fits = lv.filter(o => o.fit_score != null);
    $('[data-k=tiles]', p).innerHTML = tile('Live opportunities', lv.length, `${lv.filter(o => o.stage === 'open').length} open bids · ${lv.filter(o => o.stage !== 'open').length} pipeline`) +
      tile('Due in 14 days', soon.length, `${soon.filter(o => daysTo(o.due_date) <= 3).length} within 3 days`, soon.length ? 'warn' : '') +
      tile('Pipeline value', money(pipe) + EST, 'Owner and SRF list estimates') +
      tile('Average fit', fits.length ? Math.round(fits.reduce((s, o) => s + o.fit_score, 0) / fits.length) : '—', `${lv.filter(o => gng(o)[0] === 'Bid').length} flagged “Bid”`, 'good');
    $('[data-k=rows]', p).innerHTML = rows.map(o => {
      const [c, cc] = cd(o); const [g, gc] = gng(o); const ex = S.open === o.id;
      const caps = (o.capability_match || []).filter(c => c !== 'electrical_construction').slice(0, 2).map(c => `<span class="go-cc">${esc(CAPN[c] || plain(c))}</span>`).join('') || '<span class="go-cc">Electrical</span>';
      return `<tr class="go-row" data-id="${esc(o.id)}" tabindex="0" aria-expanded="${ex}"><td><span class="go-cd go-cd--${cc}">${c}</span></td><td class="go-tt"><b>${esc(clip(o.title, 72))}</b><span>${esc(o.city ? o.city + ', ' + o.state : o.state)}${o.due_date ? ' · due ' + esc(shortDate(o.due_date)) : ''}</span><span>${esc(ownerOf(o))}</span></td><td class="sys-num go-hide-m">${esc(o.state)}</td><td class="go-hide-m"><div class="go-caps">${caps}</div></td><td class="sys-n go-hide-m">${o.est_value_usd ? money(o.est_value_usd) : '—'}</td><td class="go-hide-m"><span class="go-fitb"><i><u style="width:${o.fit_score || 0}%"></u></i>${o.fit_score ?? '—'}</span></td><td><span class="go-gng go-gng--${gc}">${g}</span></td></tr>${ex ? `<tr class="go-det"><td colspan="7"><div class="go-det-g"><div><p class="sys-card-label">Why it fits</p>${esc(plain(o.fit_rationale || '—'))}${(o.scope_tags || []).length ? `<p class="sys-card-label go-mt">Scope</p><div class="go-caps">${(o.scope_tags || []).map(t => `<span class="go-cc">${esc(t)}</span>`).join('')}</div>` : ''}</div><div><p class="sys-card-label">Record</p>${esc(TYPE[o.type] || plain(o.type))} · ${esc(STAGE[o.stage] || o.stage)}${o.posted_date ? ' · posted ' + esc(shortDate(o.posted_date)) : ''}<br>${o.competitors_noted?.length ? 'Competitors noted: ' + esc(o.competitors_noted.join(', ')) + '<br>' : ''}${o.source_url ? `<a href="${esc(o.source_url)}" target="_blank" rel="noopener">${esc(clip(srcName(o.source_name), 70))} ↗</a>` : ''}</div></div></td></tr>` : ''}`;
    }).join('') || '<tr><td colspan="7">No opportunities match these filters.</td></tr>';
  };
  p.addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) { S.st = b.dataset.st; $$('[data-st]', p).forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); return; } const r = e.target.closest('tr.go-row'); if (r && !e.target.closest('a')) { S.open = S.open === r.dataset.id ? null : r.dataset.id; draw(); } });
  p.addEventListener('keydown', e => { const r = e.target.closest('tr.go-row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.open = S.open === r.dataset.id ? null : r.dataset.id; draw(); p.querySelector(`tr.go-row[data-id="${CSS.escape(r.dataset.id)}"]`)?.focus(); } });
  $('[data-f=q]', p).addEventListener('input', e => { S.q = e.target.value; draw(); });
  $('[data-f=cap]', p).addEventListener('change', e => { S.cap = e.target.value; draw(); });
  $('[data-f=closed]', p).addEventListener('change', e => { S.closed = e.target.checked; draw(); });
  draw();
}

/* ── Solar fleet (illustrative sites, live irradiance) ────────────────────── */
const SITES = [
  { nm: 'Municipal parking canopy', town: 'Worcester, MA', lat: 42.262, lon: -71.802, kw: 640 },
  { nm: 'Capped-landfill array', town: 'Taunton, MA', lat: 41.900, lon: -71.090, kw: 2800, avail: .75, sev: 'down', alert: 'Inverter 3 offline: 25% of the array' },
  { nm: 'School rooftop', town: 'Holyoke, MA', lat: 42.204, lon: -72.616, kw: 420 },
  { nm: 'Treatment-plant ground-mount', town: 'Canton, CT', lat: 41.824, lon: -72.894, kw: 1150 },
  { nm: 'Office rooftop and battery', town: 'Norwell, MA', lat: 42.161, lon: -70.793, kw: 310 },
  { nm: 'Transit depot canopy', town: 'Lowell, MA', lat: 42.640, lon: -71.310, kw: 760, sev: 'alert', alert: 'Communications lost for 38 min; data backfilled' },
  { nm: 'Industrial rooftop', town: 'New Bedford, MA', lat: 41.640, lon: -70.930, kw: 980 },
  { nm: 'Cultivation rooftop', town: 'Providence, RI', lat: 41.820, lon: -71.410, kw: 540, avail: .985, sev: 'alert', alert: 'String 14 running 18% below expected' },
];
const PR = 0.80;
const clearSky = () => Array.from({ length: 24 }, (_, h) => { const x = (h + .5 - 7) / 11.3; return x > 0 && x < 1 ? Math.round(720 * Math.sin(Math.PI * x)) : 0; });
async function irradiance() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${SITES.map(s => s.lat).join(',')}&longitude=${SITES.map(s => s.lon).join(',')}&hourly=shortwave_radiation&timezone=America%2FNew_York&forecast_days=1`;
    const r = await fetch(u, { signal: ctl.signal }); clearTimeout(t); if (!r.ok) throw new Error(r.status);
    const j = await r.json(); const arr = Array.isArray(j) ? j : [j];
    return { live: true, ghi: arr.map(x => x.hourly.shortwave_radiation.slice(0, 24).map(v => v || 0)) };
  } catch { return { live: false, ghi: SITES.map(() => clearSky()) }; }
}
const spark = (vals, cls, w = 120, h = 30) => { const mx = Math.max(1, ...vals); const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - v / mx * (h - 4)).toFixed(1)}`).join(' '); return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline class="${cls}" points="${pts}" fill="none" stroke-width="1.5"/></svg>`; };
async function fleet() {
  const p = $('#pane-fleet'); p.innerHTML = '<p class="go-loading">Fetching live irradiance for 8 sites…</p>';
  const { live: isLive, ghi } = await irradiance();
  const nowH = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })) % 24;
  const nowM = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', minute: '2-digit' }));
  const t = nowH + nowM / 60;
  const per = SITES.map((s, i) => { const kw = ghi[i].map(g => g / 1000 * s.kw * PR * (s.avail ?? 1)); const sofar = kw.reduce((a, v, h) => a + (h + 1 <= t ? v : h < t ? v * (t - h) : 0), 0); return { ...s, kwh: kw, sofar, day: kw.reduce((a, v) => a + v, 0) }; });
  const fleetKw = Array.from({ length: 24 }, (_, h) => per.reduce((a, s) => a + s.kwh[h], 0));
  const cap = SITES.reduce((a, s) => a + s.kw, 0); const availToday = SITES.reduce((a, s) => a + s.kw * (s.avail ?? 1), 0) / cap * 100;
  const sofar = per.reduce((a, s) => a + s.sofar, 0), day = per.reduce((a, s) => a + s.day, 0);
  const lostKwh = per.reduce((a, s) => a + (s.avail ? s.day / s.avail * (1 - s.avail) : 0), 0);
  const kb3 = ev('kb-cet-3');
  $('#badge-fleet').textContent = per.filter(s => s.sev).length + ' alerts';
  const W = 760, H = 150, mx = Math.max(1, ...fleetKw) * 1.1; const x = h => 34 + h / 23 * (W - 44); const y = v => H - 20 - v / mx * (H - 34);
  const past = fleetKw.map((v, h) => [x(h), y(v)]).filter((_, h) => h <= Math.ceil(t));
  const all = fleetKw.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = past.length ? `M${past[0][0]},${y(0)} ${past.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} L${past[past.length - 1][0]},${y(0)}Z` : '';
  const grid = [0, .5, 1].map(f => `<line class="go-grid" x1="34" x2="${W - 10}" y1="${y(mx / 1.1 * f)}" y2="${y(mx / 1.1 * f)}"/><text class="go-ax" x="28" y="${y(mx / 1.1 * f) + 3}" text-anchor="end">${n0(mx / 1.1 * f / 1000)}</text>`).join('');
  const hrs = [6, 9, 12, 15, 18].map(h => `<text class="go-ax" x="${x(h)}" y="${H - 4}" text-anchor="middle">${h}:00</text>`).join('');
  const nowX = x(Math.min(23, t));
  p.innerHTML = head('Solar fleet monitor', `${SITES.length} sites · ${n1(cap / 1000)} MW · ${ILLUS}`, `<span class="sys-chip">${isLive ? 'Irradiance: Open-Meteo' : 'Clear-sky model (live feed unavailable)'}</span>${isLive ? '<span class="sys-est sys-est--live">live</span>' : ''}`) +
    `<div class="go-tiles">${tile('Forecast today', `${n1(day / 1000)} MWh`, `${sofar >= 1000 ? n1(sofar / 1000) + ' MWh' : n0(sofar) + ' kWh'} generated so far`)}${tile('Fleet availability today', `${n1(availToday)}%`, `Target ${kb3?.target ?? 99.1}% (NREL P50)`, availToday < (kb3?.baseline ?? 94.7) ? 'bad' : 'warn')}${tile('Energy at risk today', `${n0(lostKwh)} kWh`, `About $${n0(lostKwh * 0.22)} at $0.22 per kWh${EST}`, 'warn')}${tile('Open alerts', per.filter(s => s.sev).length, '1 truck roll dispatched', 'bad')}</div>
    <div class="go-chart"><div class="go-lg"><span><i class="go-sw go-sw--solar"></i>Fleet output (MW, modelled)</span><span class="go-hide-m">Dashed: forecast for the rest of the day</span><span class="go-lg-r">Now ${String(nowH).padStart(2, '0')}:${String(nowM).padStart(2, '0')} ET</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Fleet output today by hour">${grid}${hrs}<path class="go-area-solar" d="${area}"/><polyline class="go-line-solar go-dash" points="${all}" fill="none" stroke-width="1.4"/><polyline class="go-line-solar" points="${past.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}" fill="none" stroke-width="2.2"/><line class="go-now" x1="${nowX}" x2="${nowX}" y1="10" y2="${H - 20}"/></svg></div>
    <div class="go-sites">${per.map(s => `<article class="go-site${s.sev ? ' go-site--' + s.sev : ''}"><div class="go-site-hd"><i></i>${esc(s.town)}<span>${n0(s.kw)} kW</span></div><div class="go-site-nm">${esc(s.nm)}</div><b class="sys-num">${n0(s.day)}</b><small>kWh forecast · ${n0(s.sofar)} so far · ${n1(s.day / s.kw)} kWh per kW</small>${spark(s.kwh, s.sev === 'down' ? 'go-line-bad' : 'go-line-solar')}${s.alert ? `<div class="go-site-al">⚠ ${esc(s.alert)}</div>` : ''}</article>`).join('')}</div>` +
    foot(`<b>Method:</b> output = live hourly irradiance × site size × a ${PR} performance ratio${EST} × availability. Sites, sizes and alerts are illustrative. <b>Source:</b> availability target from the NREL PV fleet study; monitoring vendor AlsoEnergy PowerTrack.`, `<a class="sys-link" href="${esc(kb3?.source_url || '#')}" target="_blank" rel="noopener">NREL study ↗</a>`);
}

/* ── Wastewater service contracts (CET wastewater-plant screen) ───────────── */
const STAGES = ['Target', 'Engineer meeting', 'Proposal', 'Under Assure'];
const assure = mgd => Math.min(300000, 30000 + 2500 * (mgd || 0));
function wastewater(d) {
  const p = $('#pane-ww'); if (!d) { p.innerHTML = '<p class="go-loading">The wastewater screen is not available right now.</p>'; return; }
  const top = [...d.items].sort((a, b) => b.horton_fit - a.horton_fit).slice(0, 10).map((t, i) => ({ ...t, stg: i < 2 ? 2 : i < 5 ? 1 : 0, arr: assure(t.design_flow_mgd) }));
  const funded = d.items.filter(i => i.project_class && i.project_class !== 'none').length;
  let open = null;
  $('#badge-ww').textContent = 'top 10';
  const kb = STAGES.map((s, k) => { const r = top.filter(t => t.stg === k); return tile(s, r.length, r.length ? `${mm(r.reduce((a, t) => a + t.arr, 0))} a year${ILLUS}` : 'Goal: 3 by month 12'); }).join('');
  const permit = t => { const s = t.npdes_permit_status_echo || ''; const c = /Effective/.test(s) ? 'ok' : /Expired/.test(s) ? 'exp' : 'adm'; return `<span class="go-permit go-permit--${c}">${esc(s || '—')}</span>`; };
  const draw = () => {
    $('[data-k=rows]', p).innerHTML = top.map(t => `<tr class="go-row" data-id="${esc(t.id)}" tabindex="0" aria-expanded="${open === t.id}"><td class="go-tt"><b>${esc(t.facility_name)}</b><span>${esc(t.town)}, ${esc(t.state)} · ${esc(String(t.operator || '').split('(')[0].trim())}</span></td><td class="sys-n go-hide-m">${t.design_flow_mgd ?? '—'}</td><td class="go-hide-m">${permit(t)}<br><span class="go-mini">expires ${esc(t.npdes_permit_expiration || '—')}</span></td><td class="sys-n go-hide-m">${t.project_value_usd ? money(t.project_value_usd) : '—'}<br><span class="go-mini">${esc(t.funding_program || '—')}</span></td><td class="go-hide-m"><span class="go-fitb"><i><u style="width:${t.horton_fit}%"></u></i>${t.horton_fit}</span></td><td class="go-hide-m"><div class="go-caps">${(t.cross_sell || []).slice(0, 3).map(c => `<span class="go-cc">${esc(CROSS[c] || plain(c))}</span>`).join('')}</div></td><td><span class="go-stage go-stage--${t.stg + 1}">${STAGES[t.stg]}</span></td><td class="sys-n">${mm(t.arr)}</td></tr>${open === t.id ? `<tr class="go-det"><td colspan="8"><div class="go-det-g"><div><p class="sys-card-label">Project on the funding list</p>${esc(t.recent_or_planned_project || '—')}${t.pipeline_value_usd ? ` · pipeline ${money(t.pipeline_value_usd)}` : ''}<br><span class="go-mini">${esc(t.project_stage || '')}</span>${t.energy_signal ? `<p class="sys-card-label go-mt">Energy signal (NuWave cross-sell)</p>${esc(t.energy_signal)}` : ''}</div><div><p class="sys-card-label">Next action</p>${t.stg === 2 ? 'Send an Assure monitoring and generator-maintenance proposal with the electrical subcontract price.' : t.stg === 1 ? 'Meet the engineer of record; get on the plan-holder list before bid.' : 'Introduce Horton to the plant superintendent; offer a free standby-power assessment.'}<br><a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(clip(srcName(t.source_name), 64))} ↗</a></div></div></td></tr>` : ''}`).join('');
  };
  p.innerHTML = head('Wastewater service contracts · Horton', `Top 10 of ${d.items.length} plants in CT, MA and RI by Horton fit · ${funded} have funded or requested projects`, '<span class="sys-chip">EPA ECHO and state SRF lists</span>') +
    `<div class="go-tiles">${kb}</div>
    <div class="sys-table-wrap go-tbl"><table class="sys-table go-tb go-tb--ww"><thead><tr><th>Plant</th><th class="sys-n go-hide-m">Flow (MGD)</th><th class="go-hide-m">Discharge permit</th><th class="sys-n go-hide-m">Funded project</th><th class="go-hide-m">Fit</th><th class="go-hide-m">Cross-sell</th><th>Stage</th><th class="sys-n">Assure a year ${ILLUS}</th></tr></thead><tbody data-k="rows"></tbody></table></div>` +
    foot(`<b>Source:</b> CET wastewater-plant screen: EPA ECHO, CT DEEP Clean Water Fund, MassDEP Clean Water SRF and the RIDEM intended use plan, compiled ${esc(longDate(d.meta?.generated))}. Pipeline stage and Assure value are illustrative: $30K base plus $2.5K per million gallons a day of design flow, capped at $300K a year.`, '<a class="sys-link" href="../../app.html#/cet/wastewater">Wastewater accounts in the portal →</a>');
  p.addEventListener('click', e => { const r = e.target.closest('tr.go-row'); if (r && !e.target.closest('a')) { open = open === r.dataset.id ? null : r.dataset.id; draw(); } });
  p.addEventListener('keydown', e => { const r = e.target.closest('tr.go-row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open = open === r.dataset.id ? null : r.dataset.id; draw(); } });
  draw();
}

/* ── EV network operations (illustrative) ─────────────────────────────────── */
const EVS = [
  { k: 'nbd', nm: 'Transit depot', town: 'New Bedford, MA', dc: true, n: 8 },
  { k: 'war', nm: 'Highway corridor (NEVI)', town: 'Warwick, RI', dc: true, n: 4 },
  { k: 'low', nm: 'Fleet yard', town: 'Lowell, MA', dc: true, n: 4 },
  { k: 'hol', nm: 'On-street Level 2', town: 'Holyoke, MA', dc: false, n: 6 },
  { k: 'wor', nm: 'Campus garage', town: 'Worcester, MA', dc: false, n: 8 },
  { k: 'tau', nm: 'Municipal lot', town: 'Taunton, MA', dc: false, n: 4 },
  { k: 'nor', nm: 'Workplace', town: 'Norwell, MA', dc: false, n: 4 },
];
function evops() {
  const p = $('#pane-ev'); const r = rng(20261006);
  const ports = EVS.flatMap(s => Array.from({ length: s.n }, (_, i) => ({ s: s.k, dc: s.dc, i, st: r() < (s.dc ? .45 : .32) ? 'chg' : 'av' })));
  ports.find(x => x.s === 'nbd' && x.i === 2).st = 'flt'; ports.find(x => x.s === 'hol' && x.i === 4).st = 'off';
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })) % 24;
  const dayFrac = Math.max(.08, Math.min(1, (hour - 5) / 17));
  const sessions = Math.round(ports.reduce((a, x) => a + (x.dc ? 9 : 3.2), 0) * dayFrac);
  const kwh = Math.round(ports.reduce((a, x) => a + (x.dc ? 9 * 34 : 3.2 * 13), 0) * dayFrac);
  const up = 98.6, nevi = 97;
  const ST = { av: 'available', chg: 'charging', flt: 'faulted', off: 'offline' };
  const draw = () => {
    const c = k => ports.filter(x => x.st === k).length;
    $('[data-k=tiles]', p).innerHTML = tile('Ports online', `${ports.length - c('off') - c('flt')}/${ports.length}`, `${c('flt')} faulted · ${c('off')} offline`, 'warn') + tile('Charging now', c('chg'), `${ports.filter(x => x.st === 'chg' && x.dc).length} on DC fast chargers`) + tile('Sessions today', n0(sessions), `${n0(kwh)} kWh delivered${EST}`) + tile('30-day port uptime', `${up}%`, `NEVI floor ${nevi}%`, 'good');
    $('[data-k=sites]', p).innerHTML = EVS.map(s => `<div class="go-evs"><div class="go-evs-nm">${esc(s.nm)} · ${esc(s.town)}<span>${s.n} × ${s.dc ? 'DC fast 150 kW' : 'Level 2'}</span></div><div class="go-ports">${ports.filter(x => x.s === s.k).map(x => `<span class="go-port go-port--${x.st}${x.dc ? ' go-port--dc' : ''}" title="Port ${x.i + 1}: ${ST[x.st]}"></span>`).join('')}</div></div>`).join('');
    $('#badge-ev').textContent = c('chg') + ' live';
  };
  p.innerHTML = head('EV network operations', `${ports.length} ports at ${EVS.length} sites CET installed · ${ILLUS}`, '<span class="sys-chip">Charger network: ChargeLab</span>') +
    `<div class="go-tiles" data-k="tiles"></div>
    <div class="go-ev-g"><div><div class="go-evsites" data-k="sites"></div><div class="go-lg go-ev-lg"><span><i class="go-port"></i>Available</span><span><i class="go-port go-port--chg"></i>Charging</span><span><i class="go-port go-port--flt"></i>Faulted</span><span><i class="go-port go-port--off"></i>Offline</span><span><i class="go-port go-port--dc"></i>Round = DC fast</span></div></div>
    <div><div class="go-tickets"><p class="sys-card-label">Open tickets</p><div class="go-tk"><span class="go-sv go-sv--1">P1</span><b>New Bedford depot · port 3 ground fault</b>Truck rolled from Taunton at 10:42, arriving in about 40 min<br><span>Opened automatically by GridOS from the charger fault</span></div><div class="go-tk"><span class="go-sv go-sv--2">P2</span><b>Holyoke on-street · port 5 offline (cellular)</b>Modem restart failed; technician booked for 8:00 tomorrow<br><span>Uptime clock running · 3 h 12 min</span></div><div class="go-tk"><span class="go-sv go-sv--3">P3</span><b>Worcester garage · firmware 2.4.1 rollout</b>Staged overnight, 2 of 8 ports done<br><span>Maintenance window, excluded from uptime</span></div></div>
    <div class="go-uptime"><div class="go-ln"><span>30-day port uptime</span><span class="sys-num go-good">${up}%</span></div><div class="go-bar"><u style="width:${(up - 90) * 10}%"></u><s style="left:${(nevi - 90) * 10}%"></s></div><div class="go-ln"><span>90%</span><span class="go-warn">▲ NEVI minimum ${nevi}%</span><span>100%</span></div></div></div></div>` +
    foot(`Ports, sessions and tickets are illustrative. NEVI-funded chargers must average more than 97% annual uptime per port (FHWA, 23 CFR 680.116). Session energy assumes about 34 kWh on DC fast and 13 kWh on Level 2${EST}.`, '<a class="sys-link" href="https://www.ecfr.gov/current/title-23/chapter-I/subchapter-G/part-680" target="_blank" rel="noopener">23 CFR 680 ↗</a>');
  draw();
  if (!RM) setInterval(() => { if (p.hidden || document.hidden) return; const cand = ports.filter(x => x.st === 'av' || x.st === 'chg'); const x = cand[Math.floor(Math.random() * cand.length)]; x.st = x.st === 'av' ? 'chg' : 'av'; draw(); }, 3500);
}

/* ── NuWave measured savings (illustrative) ───────────────────────────────── */
function mv() {
  const p = $('#pane-mv');
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const base = [388, 395, 410, 415, 405, 398, 392, 401, 418, 431, 428, 409];
  const cut = [0, 0, .15, .36, .37, .38, .38, .37, .38, .39, .33, .38];
  const act = base.map((b, i) => Math.round(b * (1 - cut[i])));
  const post = base.map((b, i) => i >= 3 ? b - act[i] : 0); const sav = base.reduce((a, b, i) => a + b - act[i], 0);
  const pct = post.reduce((a, v) => a + v, 0) / base.slice(3).reduce((a, v) => a + v, 0) * 100;
  const rate = 0.22, ef = 0.30;
  const W = 640, H = 240, mx = 460, bw = (W - 50) / 12; const y = v => H - 24 - v / mx * (H - 40);
  const bars = act.map((v, i) => `<rect class="${i < 3 ? 'go-bar-pre' : 'go-bar-eff'}" x="${44 + i * bw + bw * .18}" y="${y(v)}" width="${bw * .64}" height="${H - 24 - y(v)}" rx="3"/>`).join('');
  const line = base.map((v, i) => `${(44 + i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const gl = [0, 200, 400].map(v => `<line class="go-grid" x1="40" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}"/><text class="go-ax" x="34" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
  const lbl = months.map((m, i) => `<text class="go-ax" x="${44 + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${m}</text>`).join('');
  p.innerHTML = head('NuWave measured savings · grow-facility retrofit', `LED and dehumidification controls · whole-facility meter method (IPMVP Option C) · ${ILLUS}`, '<span class="sys-chip">Oct 2025 – Sept 2026</span>') +
    `<div class="go-tiles">${tile('Verified savings', `${n0(sav)} MWh`, 'Since the December cut-over', 'good')}${tile('Reduction vs baseline', `${n1(pct)}%`, 'Weather and production adjusted')}${tile('Cost avoided', `$${n0(sav * 1000 * rate / 1000)}K`, `At $${rate} per kWh${EST}`)}${tile('Emissions avoided', `${n0(sav * ef)} t`, `CO₂e at ${ef} t per MWh${EST}`)}</div>
    <div class="go-mv-g"><div class="go-chart"><div class="go-lg"><span><i class="go-sw go-sw--eff"></i>Metered use (MWh a month)</span><span><i class="go-sw go-sw--pre"></i>Before the retrofit</span><span>Dashed: adjusted baseline</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Monthly metered energy against the adjusted baseline">${gl}${bars}<polyline class="go-base" points="${line}" fill="none" stroke-width="1.6"/>${lbl}<text class="go-mark" x="${44 + 10 * bw + bw / 2}" y="${y(act[10]) - 6}" text-anchor="middle">▼</text></svg></div>
    <div class="go-mv-side"><div class="sys-note sys-note--warn"><span><b>Persistence alert · Aug 12.</b> A room 4 lighting override left fixtures at 100% for 9 nights, and monthly savings slipped to 33%. GridOS flagged it from interval data; the schedule was restored Aug 21.</span></div><div class="sys-note sys-note--good"><span><b>Incentive true-up ready.</b> Twelve months of metered savings packaged for the utility custom-incentive true-up and the owner’s board report.</span></div><div class="sys-note sys-note--co"><span><b>Next sale.</b> Dehumidifier controls in rooms 5–8: same baseline, same meter, scoped by NuWave from this data.</span></div></div></div>` +
    foot(`Project, baseline and meter data are illustrative. The rate and grid emission factor are placeholders${EST}; a live deployment uses the utility tariff and ISO New England marginal factors.`);
}

/* ── Value-creation calculator ────────────────────────────────────────────── */
function value() {
  const ra = ev('ra-cet'); const [r0, r1] = (ra.revenue_basis_usd || [62e6, 105e6]).map(v => v / 1e6); const [u0, u1] = ra.ebitda_impact_pct_revenue; const [t0, t1] = ra.multiple_expansion_turns; const [i0, i1] = ra.investment_usd.map(v => v / 1e6);
  const SL = [
    { k: 'rev', l: 'Combined revenue (CET, Horton and NuWave)', min: r0, max: r1, step: .5, v: (r0 + r1) / 2, f: v => `$${v.toFixed(1)}M`, src: `$${r0}–${r1}M, CET public-filings review (low confidence)` },
    { k: 'm', l: 'Base EBITDA margin', min: 6, max: 12, step: .5, v: 10, f: v => `${v}%`, src: '8–12% for lower-middle-market electrical; public comparables median 11.2%' },
    { k: 'u', l: 'GridOS EBITDA uplift (share of revenue)', min: u0, max: u1, step: .05, v: +((u0 + u1) / 2).toFixed(2), f: v => `${v.toFixed(2)} pts`, src: `${u0}–${u1} points, GridOS roadmap assumption` },
    { k: 'M', l: 'Base EV / EBITDA multiple', min: 6, max: 12, step: .5, v: 10, f: v => `${v.toFixed(1)}x`, src: 'Entry about 9–12x (filings review); PKF typical 5–6x, premium 10x+' },
    { k: 't', l: 'Multiple expansion credited to GridOS', min: 0, max: t1, step: .1, v: 1, f: v => `+${v.toFixed(1)}x`, src: `${t0}–${t1} turns, GridOS roadmap assumption; the Capstone spread caps at 3.0x` },
    { k: 'inv', l: 'GridOS investment', min: i0, max: i1, step: .1, v: +((i0 + i1) / 2).toFixed(1), f: v => `$${v.toFixed(1)}M`, src: `$${i0}–${i1}M, GridOS roadmap assumption` },
  ];
  const S = Object.fromEntries(SL.map(s => [s.k, s.v]));
  $('#calc-in').innerHTML = `<span class="sys-card-label">Assumptions <span class="sys-est">est.</span></span>` + SL.map(s => `<div class="go-sl"><div class="go-sl-top"><label for="sl-${s.k}">${esc(s.l)}</label><output class="sys-num" id="out-${s.k}" for="sl-${s.k}">${s.f(s.v)}</output></div><input type="range" id="sl-${s.k}" data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.v}"><div class="go-sl-meta"><span>${s.f(s.min)}</span><em>${esc(s.src)}</em><span>${s.f(s.max)}</span></div></div>`).join('');
  const calc = x => { const E0 = x.rev * x.m / 100, up = x.rev * x.u / 100, E1 = E0 + up, V0 = E0 * x.M, V1 = E1 * (x.M + x.t); return { E0, up, E1, V0, V1, v1: up * x.M, v2: E1 * x.t, total: V1 - V0 }; };
  const fm = v => `$${v >= 100 ? n0(v) : n1(v)}M`;
  const draw = () => {
    const c = calc(S);
    $('#o-total').textContent = fm(c.total); $('#o-roi').innerHTML = `${n0(c.total / S.inv)}× the $${S.inv.toFixed(1)}M investment${EST}`;
    $('#o-up').textContent = `+${fm(c.up)} a year`; $('#o-v1').textContent = fm(c.v1); $('#o-v2').textContent = fm(c.v2); $('#o-pb').textContent = `${n1(S.inv / c.up * 12)} months`;
    const box = $('#waterfall'); const W = Math.max(320, Math.min(560, box.clientWidth || 560)), H = 190, mx = c.V1 * 1.08, bw = Math.round(W * .165); const gap = (W - 20 - 4 * bw) / 3; const y = v => 20 + (1 - v / mx) * (H - 50); const xs = [0, 1, 2, 3].map(i => Math.round(10 + i * (bw + gap)));
    const nr = W < 480; const bars = [[xs[0], 0, c.V0, 'go-wf-0', nr ? 'Today' : 'EV today'], [xs[1], c.V0, c.V0 + c.v1, 'go-wf-1', nr ? '+EBITDA' : '+ EBITDA uplift'], [xs[2], c.V0 + c.v1, c.V1, 'go-wf-2', nr ? '+Re-rate' : '+ re-rating'], [xs[3], 0, c.V1, 'go-wf-3', nr ? 'With GridOS' : 'EV with GridOS']];
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Enterprise value bridge: ${fm(c.V0)} today plus ${fm(c.v1)} from EBITDA and ${fm(c.v2)} from re-rating equals ${fm(c.V1)}"><line class="go-grid" x1="10" x2="${W - 10}" y1="${y(0)}" y2="${y(0)}"/>${bars.map(([x, a, b, cls, l], i) => `<rect class="${cls}" x="${x}" y="${y(b)}" width="${bw}" height="${Math.max(2, y(a) - y(b))}" rx="4"/>${i < 3 ? `<line class="go-wf-link" x1="${x + bw}" x2="${xs[i + 1]}" y1="${y(b)}" y2="${y(b)}"/>` : ''}<text class="go-wf-v" x="${x + bw / 2}" y="${y(b) - 6}" text-anchor="middle">${i === 1 || i === 2 ? '+' : ''}${fm(b - a)}</text><text class="go-ax" x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${l}</text>`).join('')}</svg>`;
  };
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 150); });
  $('#calc-in').addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; S[k] = +e.target.value; const s = SL.find(x => x.k === k); $('#out-' + k).textContent = s.f(S[k]); draw(); });
  draw();
  $('#scen').innerHTML = [['Low', r0, u0, t0], ['Base', (r0 + r1) / 2, (u0 + u1) / 2, (t0 + t1) / 2], ['High', r1, u1, t1]].map(([nm, rev, u, t]) => { const c = calc({ rev, m: 10, u, M: 10, t, inv: 0 }); return `<div class="sys-kpi"${nm === 'Base' ? ' data-co="cet"' : ''}><span class="sys-kpi-label">${nm} case</span><span class="sys-kpi-value">${fm(c.total)}${EST}</span><span class="sys-kpi-sub">$${n0(rev)}M revenue · +${u.toFixed(2)} pts EBITDA (+${fm(c.up)} a year) · +${t.toFixed(1)}x on a 10x base at a 10% margin</span></div>`; }).join('');
}

/* ── Stack, roadmap, exit, sources ────────────────────────────────────────── */
function stack() {
  const vs = EV.filter(i => i.kind === 'vendor_stack' && i.company === 'cet');
  const LAYER = { 'Construction project management': 'Field', 'Electrical estimating and takeoff': 'Estimate', 'Solar / storage asset monitoring': 'Fleet', 'SCADA / HMI for pump stations and wastewater': 'Pump-station SCADA', 'EV charging management (CSMS)': 'Charge' };
  const buy = vs.map(v => ({ layer: LAYER[v.category] || v.category, cat: v.category, vendor: v.vendor, url: v.source_url, what: plain(v.what_it_does), price: plain(v.pricing_note), bb: 'Buy' }));
  const build = [
    { layer: 'Bid radar', cat: 'Opportunity data and go/no-go', vendor: 'GridOS (Broad Sky PRG)', what: 'Public bids, SRF lists and capital plans across six states, scored for fit: the portal’s CET opportunity radar, refreshed weekly.', price: 'PRG plus one analyst; the data is already assembled in the portal', bb: 'Build' },
    { layer: 'GridOS core', cat: 'Asset register and Assure contracts', vendor: 'GridOS (Broad Sky PRG)', what: 'One record of every pump station, generator, array and charger CET services, linked to contracts, service levels and monitoring feeds.', price: 'Inside the $0.8–1.8M program budget (est.)', bb: 'Build' },
    { layer: 'Measured savings', cat: 'Savings analytics', vendor: 'GridOS (NuWave)', what: 'Adjusted-baseline models on interval meter data, persistence alerts and incentive true-up packs.', price: 'Built on utility interval data; no license', bb: 'Build' },
  ];
  const rows = [...build.slice(0, 1), ...buy, ...build.slice(1)];
  $('#stack-t').innerHTML = rows.map(r => `<tr><td><b>${esc(r.layer)}</b><br><span class="go-mini">${esc(r.cat)}</span></td><td><b>${esc(r.vendor)}</b>${r.url ? `<br><a class="go-mini" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(host(r.url))} ↗</a>` : ''}</td><td>${esc(r.what)}</td><td class="go-mini">${esc(r.price)}</td><td><span class="sys-chip${r.bb === 'Build' ? ' sys-chip--soft' : ''}">${r.bb}</span></td></tr>`).join('');
}
function gantt() {
  const start = new Date(2026, 9, 1); const mo = Array.from({ length: 12 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
  const R = [
    ['Bid radar and go/no-go live', 'PRG · CET estimating', 1, 2, 'elec'],
    ['Accubid estimating standard', 'CET and Horton estimating', 1, 4, 'elec'],
    ['Procore field rollout', 'CET operations · foreman champions', 2, 7, 'elec2'],
    ['Pump-station SCADA pilot, then scale', 'Horton · 10 stations, then 40', 3, 10, 'water'],
    ['Fleet monitoring and Assure O&M', 'CET solar · PowerTrack', 4, 9, 'solar'],
    ['EV network operations', 'CET · ChargeLab', 5, 9, 'ev'],
    ['NuWave savings dashboards', 'NuWave', 6, 10, 'eff'],
    ['Value checkpoints', 'Win rate · attach rate · availability', 0, 0, null, [6, 9, 12]],
  ];
  $('#gantt').innerHTML = `<div class="go-gt"><div class="go-gr go-gr--hd"><div>Workstream · owner</div>${mo.map(d => `<div>${d.toLocaleString('en-US', { month: 'short' })}${d.getMonth() === 0 || d === mo[0] ? ` ’${String(d.getFullYear()).slice(2)}` : ''}</div>`).join('')}</div>${R.map(([l, o, a, b, c, ms]) => `<div class="go-gr"><div class="go-lb">${esc(l)}<span>${esc(o)}</span></div>${ms ? mo.map((_, i) => `<div class="go-gcell">${ms.includes(i + 1) ? `<span class="go-gms" title="Month ${i + 1} checkpoint"></span>` : ''}</div>`).join('') : `<div class="go-gbar go-gbar--${c}" style="grid-column:${a + 1}/${b + 2}">Mo ${a}–${b}</div>`}</div>`).join('')}</div>`;
}
function exitCards(comps) {
  const e5 = ev('ve-05'), e6 = ev('ve-06'), e12 = ev('ve-12'), e13 = ev('ve-13'), e7 = ev('ve-07');
  const bm = comps?.meta?.sector_benchmarks?.commercial_electrical_energy;
  const C = [
    e5 && ['10x+', 'EBITDA for repeatable service', 'Buyers pay for service mix, not volume', 'PKF’s valuation grid puts project-heavy, low-retention contractors at 5–6x and repeatable-service, high-visibility businesses above 10x. Assure and monitoring contracts move CET up that grid.', e5],
    e6 && ['3.0x', 'typical-to-premium spread', 'The ceiling on any one lever', 'Advisors expect 6.8x typical against 9.8x premium middle-market multiples in 2026. GridOS is credited with 0.5–1.5 of those turns, not all of them.', e6],
    e12 && ['106%', 'Procore net revenue retention', 'Digital operating layers stick', 'Contractors that adopt project software rarely leave it (95% gross retention). A buyer inherits a workforce already running on the system.', e12],
    e7 && ['>110%', 'ServiceTitan net dollar retention', 'Contractors keep adding to their operating system', 'Trade contractors keep expanding spend on their operating system: evidence that the company layer becomes core infrastructure, not overhead.', e7],
    e13 && ['99', 'electrical-contractor deals in 2025', 'Fewer, choosier buyers', 'Deal count fell from 140 to 99 while financial buyers did about two thirds of deals. Differentiation in service mix, systems and data decides who gets bid up.', e13],
    bm && [`${bm.median_ebitda_margin_latest_pct}%`, `median EBITDA margin · ${bm.n} public comparables`, 'Margin upside lives in service mix', `Public electrical and energy contractors (${(bm.comps || []).join(', ')}) earn about ${bm.median_operating_margin_latest_pct}% operating margins; only specialist, self-perform and service-heavy leaders clear 10%.`, { source_url: null, source_name: 'Public comparables, SEC filings', date: comps.meta.generated, confidence: 'high' }],
  ].filter(Boolean);
  $('#exit-cards').innerHTML = C.map(([big, sub, h, p, s]) => `<article class="sys-card go-ex" data-co="cet"><div class="go-ex-n"><b class="sys-num">${esc(big)}</b><span class="sys-est">est.</span><small>${esc(sub)}</small></div><h3 class="sys-card-title">${esc(h)}</h3><p class="sys-card-body">${esc(p)}</p><p class="sys-src"><b>Source:</b> ${s.source_url ? `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(clip(srcName(s.source_name), 70))} ↗</a>` : esc(srcName(s.source_name))}${s.date ? ', ' + esc(longDate(s.date)) : ''}${s.confidence ? ' · ' + esc(s.confidence) + ' confidence' : ''}</p></article>`).join('');
  const src = EV.filter(i => (Array.isArray(i.applies_to) && i.applies_to.includes('cet')) || i.company === 'cet');
  const KIND = { valuation_evidence: 'Valuation', vendor_stack: 'Vendor', kpi_benchmark: 'KPI benchmark', roadmap_assumption: 'Roadmap assumption' };
  const label = i => i.kind === 'roadmap_assumption' ? 'GridOS roadmap: investment, time to value, EBITDA impact and multiple range' : i.title || i.vendor || i.kpi || i.os_name || '';
  $('#sources').innerHTML = src.map(i => `<li><span class="sys-card-label">${esc(KIND[i.kind] || 'Evidence')}</span> ${esc(plain(label(i)))}: ${i.source_url ? `<a href="${esc(i.source_url)}" target="_blank" rel="noopener">${esc(clip(srcName(i.source_name || host(i.source_url)), 60))} ↗</a>` : 'analyst assumption, not company guidance'}${i.confidence ? ` <span class="go-cf">${esc(i.confidence)} confidence</span>` : ''}</li>`).join('') || '<li>The evidence file is not available right now.</li>';
  const n = $('#sources-n'); if (n && src.length) n.textContent = `${src.length} sources behind this page`;
}
function hero() {
  const ra = ev('ra-cet'); const k1 = ev('kb-cet-1'), k2 = ev('kb-cet-2'), k3 = ev('kb-cet-3');
  const t = $('#thesis'); if (t && ra) { const M = v => (v / 1e6).toFixed(1); $('[data-k=ebitda]', t).textContent = `$${M(ra.ebitda_impact_usd[0])}–${M(ra.ebitda_impact_usd[1])}M`; $('[data-k=ebitda-s]', t).textContent = `${ra.ebitda_impact_pct_revenue[0].toFixed(1)}–${ra.ebitda_impact_pct_revenue[1].toFixed(1)}% of $${ra.revenue_basis_usd[0] / 1e6}–${ra.revenue_basis_usd[1] / 1e6}M revenue`; $('[data-k=turns]', t).textContent = `+${ra.multiple_expansion_turns[0]}–${ra.multiple_expansion_turns[1]}x`; $('[data-k=inv]', t).textContent = `$${M(ra.investment_usd[0])}–${M(ra.investment_usd[1])}M`; $('[data-k=ttv]', t).textContent = `${ra.time_to_value_months[0]}–${ra.time_to_value_months[1]} mo`; }
  const k = $('#kpi3'); if (!k) return;
  const lnk = (u, l) => `<b>Source:</b> <a href="${esc(u)}" target="_blank" rel="noopener">${l} ↗</a>`;
  if (k1) { $('[data-k=b1]', k).textContent = k1.baseline + '%'; $('[data-k=t1]', k).textContent = k1.target + '%'; $('[data-k=s1]', k).innerHTML = lnk(k1.source_url, 'ConstructConnect and ENR guidance'); }
  if (k3) { $('[data-k=b3]', k).textContent = k3.baseline + '%'; $('[data-k=t3]', k).textContent = k3.target + '%'; $('[data-k=s3]', k).innerHTML = lnk(k3.source_url, 'NREL PV fleet study'); }
  if (k2) { $('[data-k=b2]', k).textContent = k2.baseline + '%'; $('[data-k=t2]', k).textContent = k2.target == null ? 'TBD' : k2.target + '%'; $('[data-k=s2]', k).innerHTML = lnk(k2.source_url, 'FMI and PlanGrid via Construction Dive'); }
}

export async function initOS({ Data }) {
  clock();
  const [evd, opp, ww, comps] = await Promise.all(['serviceos_evidence', 'cet_opportunities', 'cet_wwtp_targets', 'public_comps'].map(n => Data.research(n).catch(() => null)));
  EV = evd?.items || [];
  for (const f of [hero, value, stack, gantt]) { try { f(); } catch (e) { console.warn('gridos section failed:', f.name, e); } }
  try { exitCards(comps); } catch (e) { console.warn('gridos exit cards failed', e); }
  const items = opp?.items || [];
  $('#badge-bids').textContent = items.filter(o => o.due_date && o.stage !== 'awarded' && daysTo(o.due_date) >= 0 && daysTo(o.due_date) <= 14).length + ' due';
  RENDER['pane-bids'] = () => items.length ? bids(items, opp.meta) : ($('#pane-bids').innerHTML = '<p class="go-loading">The opportunity radar is not available right now.</p>');
  RENDER['pane-fleet'] = () => fleet();
  RENDER['pane-ww'] = () => wastewater(ww);
  RENDER['pane-ev'] = () => evops();
  RENDER['pane-mv'] = () => mv();
  $('#badge-fleet').textContent = '3 alerts'; $('#badge-ev').textContent = 'live'; $('#badge-ww').textContent = 'top 10';
  tabs();
}
