/* GridOS concept — interactive demo + value math. Real data: cet_opportunities, cet_wwtp_targets,
   serviceos_evidence, public_comps (via core.js Data). Illustrative: fleet sites, EV ports, M&V project. */
import { STATES, daysTo, money, shortDate, cleanSrc, clip, ownerOf, shell } from './site.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const n0 = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const n1 = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const mm = v => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`;

/* Fallbacks mirror data/research/serviceos_evidence.json (ra-cet, kb-cet-*) if the file is unavailable. */
const FALLBACK = {
  'ra-cet': { investment_usd: [800000, 1800000], time_to_value_months: [9, 15], ebitda_impact_pct_revenue: [1.0, 2.5], ebitda_impact_usd: [620000, 2620000], multiple_expansion_turns: [0.5, 1.5], revenue_basis_usd: [62e6, 105e6], label: 'est. — analyst assumption, not a forecast or company guidance' },
  'kb-cet-1': { kpi: 'Bid win rate on public hard-bid work', baseline: 15, target: 30, unit: '% of bids won', source_url: 'https://www.constructconnect.com/blog/bid-hit-ratio-commercial-gcs-2026' },
  'kb-cet-2': { kpi: 'Non-optimal time', baseline: 35, target: null, source_url: 'https://www.constructiondive.com/news/industry-could-be-overspending-177b-per-year-study-finds/529450/' },
  'kb-cet-3': { kpi: 'Solar fleet availability', baseline: 94.7, target: 99.1, source_url: 'https://research-hub.nrel.gov/en/publications/advancing-our-understanding-of-system-availability-through-the-pv/' },
};
let EV = [];
const ev = id => EV.find(i => i.id === id) || FALLBACK[id] || null;

/* ── tabs ─────────────────────────────────────────────────────────────────── */
const RENDER = {}; const DONE = new Set();
function tabs() {
  const ts = $$('.app-nav [role=tab]');
  const sel = t => { ts.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; }); const id = t.getAttribute('aria-controls'); if (!DONE.has(id) && RENDER[id]) { DONE.add(id); RENDER[id](); } };
  ts.forEach((t, i) => { t.addEventListener('click', () => sel(t)); t.addEventListener('keydown', e => { let j = null; if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % ts.length; if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + ts.length) % ts.length; if (j != null) { e.preventDefault(); sel(ts[j]); ts[j].focus(); } }); });
  const m = /[?&]tab=(\w+)/.exec(location.search); const start = m ? ts.find(t => t.id === 'tab-' + m[1]) : null;
  sel(start || ts[0]);
}
function clock() { const el = $('#clock'); if (!el) return; const f = () => { el.textContent = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' ET · live'; }; f(); setInterval(f, 30000); }

/* ── Bid board (cet_opportunities) ────────────────────────────────────────── */
const CAPS = [['all', 'All capabilities'], ['wastewater', 'Wastewater'], ['pump_station', 'Pump stations'], ['generator', 'Generators'], ['controls', 'Controls & SCADA'], ['solar', 'Solar'], ['storage', 'Storage'], ['ev_charging', 'EV charging'], ['energy_efficiency', 'Efficiency'], ['utility', 'Utility'], ['electrical_construction', 'Electrical']];
const CAPN = Object.fromEntries(CAPS);
const gng = o => { const d = daysTo(o.due_date); if (o.stage === 'awarded' || (d != null && d < 0)) return ['Closed', 'pass']; if (!o.due_date && (o.stage === 'planned' || o.type === 'capital_plan')) return ['Pre-position', 'pre']; if ((o.fit_score || 0) >= 80) return ['Bid', 'bid']; if ((o.fit_score || 0) >= 60) return ['Review', 'rev']; return ['Pass', 'pass']; };
const cd = o => { const d = daysTo(o.due_date); if (o.stage === 'awarded') return ['AWARDED', 'closed']; if (d == null) return o.stage === 'planned' || o.type === 'capital_plan' ? ['PLANNED', 'roll'] : ['ROLLING', 'roll']; if (d < 0) return ['CLOSED', 'closed']; if (d === 0) return ['TODAY', 'urgent']; return [`D-${d}`, d <= 3 ? 'urgent' : d <= 14 ? 'soon' : 'ok']; };
const live = o => o.stage !== 'awarded' && !(o.due_date && daysTo(o.due_date) < 0);
function bids(items, meta) {
  const p = $('#pane-bids'); const S = { st: 'ALL', cap: 'all', q: '', closed: false, open: null };
  const stCount = st => items.filter(o => live(o) && (st === 'ALL' || o.state === st)).length;
  p.innerHTML = `<div class="ph"><div><h3>Bid board · New England</h3><p>${items.length} public opportunities · compiled ${esc(meta?.generated || '')} · countdown in days from today</p></div><div class="r"><input class="srch" type="search" placeholder="Search owner, town, scope…" aria-label="Search opportunities" data-f="q"><select class="sel" aria-label="Capability" data-f="cap">${CAPS.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select><label class="tgl"><input type="checkbox" data-f="closed"> show closed</label></div></div>
  <div class="fbar" role="group" aria-label="Filter by state">${['ALL', ...Object.keys(STATES)].map(st => `<button class="pill" type="button" data-st="${st}" aria-pressed="${st === 'ALL'}">${st === 'ALL' ? 'All states' : st}<span class="c">${stCount(st)}</span></button>`).join('')}</div>
  <div class="tiles" data-k="tiles"></div><div class="tbl-w"><table class="tb"><thead><tr><th>Due</th><th>Opportunity</th><th class="hide-m">St</th><th class="hide-m">Scope</th><th class="hide-m" style="text-align:right">Est. value</th><th class="hide-m">Fit</th><th>Go / no-go</th></tr></thead><tbody data-k="rows"></tbody></table></div>
  <div class="foot-n"><span>Fit score and est. value from the CET opportunity radar (public bid boards, CT/ME/VT SRF lists, owner portals). Go/no-go = GridOS rule (illustrative): fit ≥ 80 bid · 60–79 review · planned work pre-position.</span><a href="../../app.html#/cet/opportunities">Full radar in the portal →</a></div>`;
  const draw = () => {
    const q = S.q.toLowerCase();
    let rows = items.filter(o => (S.closed || live(o)) && (S.st === 'ALL' || o.state === S.st) && (S.cap === 'all' || (o.capability_match || []).includes(S.cap)) && (!q || `${o.title} ${o.owner_or_agency} ${o.city} ${(o.scope_tags || []).join(' ')}`.toLowerCase().includes(q)));
    const key = o => { const d = daysTo(o.due_date); if (!live(o)) return 9000 - (d ?? 0); if (d != null) return d; return 500 - (o.fit_score || 0); };
    rows.sort((a, b) => key(a) - key(b));
    const lv = rows.filter(live); const soon = lv.filter(o => o.due_date && daysTo(o.due_date) <= 14);
    const pipe = lv.reduce((s, o) => s + (o.est_value_usd || 0), 0); const fits = lv.filter(o => o.fit_score != null);
    $('[data-k=tiles]', p).innerHTML = `<div class="tile"><span>Live opportunities</span><b class="num">${lv.length}</b><small>${lv.filter(o => o.stage === 'open').length} open bids · ${lv.filter(o => o.stage !== 'open').length} pipeline</small></div><div class="tile"><span>Due ≤ 14 days</span><b class="num">${soon.length}</b><small class="${soon.length ? 'warn' : ''}">${soon.filter(o => daysTo(o.due_date) <= 3).length} within 3 days</small></div><div class="tile"><span>Pipeline value</span><b class="num">${money(pipe)}</b><small>est. · owner / SRF lists</small></div><div class="tile"><span>Avg fit score</span><b class="num">${fits.length ? Math.round(fits.reduce((s, o) => s + o.fit_score, 0) / fits.length) : '—'}</b><small class="up">${lv.filter(o => gng(o)[0] === 'Bid').length} flagged “Bid”</small></div>`;
    $('[data-k=rows]', p).innerHTML = rows.map(o => { const [c, cc] = cd(o); const [g, gc] = gng(o); const ex = S.open === o.id; return `<tr class="row" data-id="${esc(o.id)}" tabindex="0" aria-expanded="${ex}"><td><span class="cd ${cc}">${c}</span></td><td class="tt"><b>${esc(clip(o.title, 72))}</b><span>${esc(o.city ? o.city + ', ' + o.state : o.state)}${o.due_date ? ' · due ' + esc(shortDate(o.due_date)) : ''}</span><span>${esc(ownerOf(o))}</span></td><td class="mono hide-m">${esc(o.state)}</td><td class="hide-m"><div class="caps-c">${(o.capability_match || []).filter(c => c !== 'electrical_construction').slice(0, 2).map(c => `<span class="cc">${esc(CAPN[c] || c)}</span>`).join('') || '<span class="cc">Electrical</span>'}</div></td><td class="n hide-m">${o.est_value_usd ? money(o.est_value_usd) : '—'}</td><td class="hide-m"><span class="fitb"><i><u style="width:${o.fit_score || 0}%"></u></i>${o.fit_score ?? '—'}</span></td><td><span class="gng ${gc}">${g}</span></td></tr>${ex ? `<tr class="det"><td colspan="7"><div class="g"><div><h5>Why it fits</h5>${esc(o.fit_rationale || '—')}${(o.scope_tags || []).length ? `<h5 style="margin-top:12px">Scope</h5>${(o.scope_tags || []).map(t => `<span class="cc" style="margin:0 4px 4px 0;display:inline-block">${esc(t)}</span>`).join('')}` : ''}</div><div><h5>Record</h5>${esc(o.type.replace('_', ' '))} · stage ${esc(o.stage)}${o.posted_date ? ' · posted ' + esc(shortDate(o.posted_date)) : ''}<br>${o.competitors_noted?.length ? 'Competitors noted: ' + esc(o.competitors_noted.join(', ')) + '<br>' : ''}${o.source_url ? `<a href="${esc(o.source_url)}" target="_blank" rel="noopener">${esc(clip(cleanSrc(o.source_name), 70))} ↗</a>` : ''}</div></div></td></tr>` : ''}`; }).join('') || '<tr><td colspan="7" style="color:var(--tx-3);padding:24px">No opportunities match these filters.</td></tr>';
  };
  p.addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) { S.st = b.dataset.st; $$('[data-st]', p).forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); return; } const r = e.target.closest('tr.row'); if (r) { S.open = S.open === r.dataset.id ? null : r.dataset.id; draw(); } });
  p.addEventListener('keydown', e => { const r = e.target.closest('tr.row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.open = S.open === r.dataset.id ? null : r.dataset.id; draw(); p.querySelector(`tr.row[data-id="${CSS.escape(r.dataset.id)}"]`)?.focus(); } });
  $('[data-f=q]', p).addEventListener('input', e => { S.q = e.target.value; draw(); });
  $('[data-f=cap]', p).addEventListener('change', e => { S.cap = e.target.value; draw(); });
  $('[data-f=closed]', p).addEventListener('change', e => { S.closed = e.target.checked; draw(); });
  draw();
}

/* ── Solar fleet (illustrative sites, live irradiance) ────────────────────── */
const SITES = [
  { id: 'WOR-01', nm: 'Municipal parking canopy', town: 'Worcester, MA', lat: 42.262, lon: -71.802, kw: 640 },
  { id: 'TAU-02', nm: 'Capped-landfill array', town: 'Taunton, MA', lat: 41.900, lon: -71.090, kw: 2800, avail: .75, sev: 'down', alert: 'Inverter 3 offline · 25% of array' },
  { id: 'HOL-03', nm: 'School rooftop', town: 'Holyoke, MA', lat: 42.204, lon: -72.616, kw: 420 },
  { id: 'CAN-04', nm: 'WPCF ground-mount', town: 'Canton, CT', lat: 41.824, lon: -72.894, kw: 1150 },
  { id: 'NOR-05', nm: 'Office rooftop + BESS', town: 'Norwell, MA', lat: 42.161, lon: -70.793, kw: 310 },
  { id: 'LOW-06', nm: 'Transit depot canopy', town: 'Lowell, MA', lat: 42.640, lon: -71.310, kw: 760, sev: 'alert', alert: 'Comms loss 38 min · data backfilled' },
  { id: 'NBD-07', nm: 'Industrial rooftop', town: 'New Bedford, MA', lat: 41.640, lon: -70.930, kw: 980 },
  { id: 'PRV-08', nm: 'Cultivation rooftop', town: 'Providence, RI', lat: 41.820, lon: -71.410, kw: 540, avail: .985, sev: 'alert', alert: 'String 14 underperforming −18%' },
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
const spark = (vals, w = 120, h = 30, col = '#fbbf24') => { const mx = Math.max(1, ...vals); const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - v / mx * (h - 4)).toFixed(1)}`).join(' '); return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`; };
async function fleet() {
  const p = $('#pane-fleet'); p.innerHTML = '<div class="loading">Fetching live irradiance for 8 sites…</div>';
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
  // chart
  const W = 760, H = 150, mx = Math.max(1, ...fleetKw) * 1.1; const x = h => 34 + h / 23 * (W - 44); const y = v => H - 20 - v / mx * (H - 34);
  const past = fleetKw.map((v, h) => [x(h), y(v)]).filter((_, h) => h <= Math.ceil(t));
  const all = fleetKw.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = past.length ? `M${past[0][0]},${y(0)} ${past.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} L${past[past.length - 1][0]},${y(0)}Z` : '';
  const grid = [0, .5, 1].map(f => `<line x1="34" x2="${W - 10}" y1="${y(mx / 1.1 * f)}" y2="${y(mx / 1.1 * f)}" stroke="#1b2c4f"/><text x="28" y="${y(mx / 1.1 * f) + 3}" fill="#7385a6" font-size="9.5" text-anchor="end">${n0(mx / 1.1 * f / 1000 * 10 / 10)}</text>`).join('');
  const hrs = [6, 9, 12, 15, 18].map(h => `<text x="${x(h)}" y="${H - 4}" fill="#7385a6" font-size="9.5" text-anchor="middle">${h}:00</text>`).join('');
  const nowX = x(Math.min(23, t));
  p.innerHTML = `<div class="ph"><div><h3>Solar fleet monitor</h3><p>${SITES.length} sites · ${n1(cap / 1000)} MWdc · <span class="label-ill">illustrative sites</span></p></div><div class="r"><span class="chip">${isLive ? '● Irradiance: Open-Meteo live' : '○ Clear-sky model (live feed unavailable)'}</span></div></div>
  <div class="tiles"><div class="tile"><span>Forecast today</span><b class="num">${n1(day / 1000)} MWh</b><small>${sofar >= 1000 ? n1(sofar / 1000) + ' MWh' : n0(sofar) + ' kWh'} generated so far</small></div><div class="tile"><span>Fleet availability · today</span><b class="num">${n1(availToday)}%</b><small class="${availToday < (kb3?.baseline ?? 94.7) ? 'bad' : 'warn'}">target ${kb3?.target ?? 99.1}% (NREL P50)</small></div><div class="tile"><span>Energy at risk · today</span><b class="num">${n0(lostKwh)} kWh</b><small class="warn">≈ $${n0(lostKwh * 0.22)} at $0.22/kWh est.</small></div><div class="tile"><span>Open alerts</span><b class="num">${per.filter(s => s.sev).length}</b><small class="bad">1 truck roll dispatched</small></div></div>
  <div class="fleet-chart"><div class="lg"><span style="color:#fbbf24">■ fleet output (MW, modelled)</span><span>┄ forecast rest of day</span><span style="margin-left:auto">now ${String(nowH).padStart(2, '0')}:${String(nowM).padStart(2, '0')} ET</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Fleet output today by hour">${grid}${hrs}<path d="${area}" fill="rgba(251,191,36,.18)"/><polyline points="${all}" fill="none" stroke="#fbbf24" stroke-width="1.4" stroke-dasharray="4 4" opacity=".6"/><polyline points="${past.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}" fill="none" stroke="#fbbf24" stroke-width="2.2"/><line x1="${nowX}" x2="${nowX}" y1="10" y2="${H - 20}" stroke="#22d3ee" stroke-dasharray="3 3"/></svg></div>
  <div class="sites">${per.map(s => `<article class="site ${s.sev || ''}"><div class="hd"><i></i>${esc(s.id)}<span>${n0(s.kw)} kW</span></div><div class="nm">${esc(s.nm)} · ${esc(s.town)}</div><b class="num">${n0(s.day)}</b><small>kWh forecast · ${n0(s.sofar)} so far · ${n1(s.day / s.kw)} kWh/kWp</small>${spark(s.kwh, 120, 30, s.sev === 'down' ? '#f87171' : '#fbbf24')}${s.alert ? `<div class="al">⚠ ${esc(s.alert)}</div>` : ''}</article>`).join('')}</div>
  <div class="foot-n"><span>Output = live hourly shortwave irradiance × site kWdc × PR ${PR} (est.) × availability. Sites, sizes and alerts are illustrative. Availability target from NREL PV Fleet study (kb-cet-3); vendor: AlsoEnergy PowerTrack.</span><a href="${esc(kb3?.source_url || '#')}" target="_blank" rel="noopener">NREL source ↗</a></div>`;
}

/* ── Wastewater service-contract tracker (cet_wwtp_targets) ───────────────── */
const STAGES = ['Target', 'EOR meeting', 'Proposal', 'Under Assure'];
const assure = mgd => Math.min(300000, 30000 + 2500 * (mgd || 0));
function wastewater(d) {
  const p = $('#pane-ww'); if (!d) { p.innerHTML = '<div class="loading">Wastewater dataset not available.</div>'; return; }
  const top = [...d.items].sort((a, b) => b.horton_fit - a.horton_fit).slice(0, 10).map((t, i) => ({ ...t, stg: i < 2 ? 2 : i < 5 ? 1 : 0, arr: assure(t.design_flow_mgd) }));
  const funded = d.items.filter(i => i.project_class && i.project_class !== 'none').length;
  let open = null;
  $('#badge-ww').textContent = 'top 10';
  const kb = STAGES.map((s, k) => { const r = top.filter(t => t.stg === k); return `<div class="kb"><span>${s}</span><b class="num">${r.length}</b><small>${r.length ? mm(r.reduce((a, t) => a + t.arr, 0)) + '/yr est.' : 'goal: 3 by month 12'}</small></div>`; }).join('');
  const permit = t => { const s = t.npdes_permit_status_echo || ''; const c = /Effective/.test(s) ? 'ok' : /Expired/.test(s) ? 'exp' : 'adm'; return `<span class="permit ${c}">${esc(s || '—')}</span>`; };
  const draw = () => {
    $('[data-k=rows]', p).innerHTML = top.map(t => `<tr class="row" data-id="${esc(t.id)}" tabindex="0" aria-expanded="${open === t.id}"><td class="tt"><b>${esc(t.facility_name)}</b><span>${esc(t.town)}, ${esc(t.state)} · ${esc(String(t.operator || '').split('(')[0].trim())}</span></td><td class="n hide-m">${t.design_flow_mgd ?? '—'}</td><td class="hide-m">${permit(t)}<br><span class="mono" style="font-size:10.5px;color:var(--tx-3)">exp. ${esc(t.npdes_permit_expiration || '—')}</span></td><td class="n hide-m">${t.project_value_usd ? money(t.project_value_usd) : '—'}<br><span style="font-size:10.5px;color:var(--tx-3)">${esc(t.funding_program)}</span></td><td class="hide-m"><span class="fitb"><i><u style="width:${t.horton_fit}%"></u></i>${t.horton_fit}</span></td><td class="hide-m"><div class="caps-c">${(t.cross_sell || []).slice(0, 3).map(c => `<span class="cc">${esc(c)}</span>`).join('')}</div></td><td><span class="stage s${t.stg + 1}">${STAGES[t.stg]}</span></td><td class="n">${mm(t.arr)}</td></tr>${open === t.id ? `<tr class="det"><td colspan="8"><div class="g"><div><h5>Project on the funding list</h5>${esc(t.recent_or_planned_project || '—')}${t.pipeline_value_usd ? ` · pipeline ${money(t.pipeline_value_usd)}` : ''}<br><span style="color:var(--tx-3)">${esc(t.project_stage || '')}</span>${t.energy_signal ? `<h5 style="margin-top:12px">Energy signal (NuWave cross-sell)</h5>${esc(t.energy_signal)}` : ''}</div><div><h5>Next action</h5>${t.stg === 2 ? 'Send Assure monitoring + generator PM proposal with the E&amp;I subcontract price.' : t.stg === 1 ? 'Meet the engineer of record; get on the plan-holder list before bid.' : 'Introduce Horton to the plant superintendent; offer a free standby-power assessment.'}<br><a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(clip(cleanSrc(t.source_name), 64))} ↗</a></div></div></td></tr>` : ''}`).join('');
  };
  p.innerHTML = `<div class="ph"><div><h3>Wastewater service contracts · Horton</h3><p>Top 10 of ${d.items.length} CT/MA/RI plants by Horton fit · ${funded} have funded or requested projects</p></div><div class="r"><span class="chip">EPA ECHO + state SRF lists</span></div></div>
  <div class="kanban">${kb}</div>
  <div class="tbl-w"><table class="tb ww"><thead><tr><th>Plant</th><th class="hide-m" style="text-align:right">MGD</th><th class="hide-m">NPDES permit</th><th class="hide-m" style="text-align:right">Funded project</th><th class="hide-m">Fit</th><th class="hide-m">Cross-sell</th><th>Stage</th><th style="text-align:right">Assure/yr</th></tr></thead><tbody data-k="rows"></tbody></table></div>
  <div class="foot-n"><span>Plants, flows, permits, projects and fit from cet_wwtp_targets (EPA ECHO, CT DEEP CWF, MassDEP CWSRF, RIDEM IUP; compiled ${esc(d.meta?.generated || '')}). Pipeline stage and Assure value are illustrative: $30K base + $2.5K per MGD design flow, capped at $300K/yr.</span><a href="../../app.html#/cet/wastewater">Wastewater accounts in the portal →</a></div>`;
  p.addEventListener('click', e => { const r = e.target.closest('tr.row'); if (r) { open = open === r.dataset.id ? null : r.dataset.id; draw(); } });
  p.addEventListener('keydown', e => { const r = e.target.closest('tr.row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open = open === r.dataset.id ? null : r.dataset.id; draw(); } });
  draw();
}

/* ── EV network ops (illustrative) ────────────────────────────────────────── */
const EVS = [
  { id: 'NBD-D1', nm: 'Transit depot', town: 'New Bedford, MA', dc: true, n: 8 },
  { id: 'WAR-C1', nm: 'Highway corridor (NEVI)', town: 'Warwick, RI', dc: true, n: 4 },
  { id: 'LOW-T1', nm: 'Fleet yard', town: 'Lowell, MA', dc: true, n: 4 },
  { id: 'HOL-S1', nm: 'On-street Level 2', town: 'Holyoke, MA', dc: false, n: 6 },
  { id: 'WOR-G1', nm: 'Campus garage', town: 'Worcester, MA', dc: false, n: 8 },
  { id: 'TAU-M1', nm: 'Municipal lot', town: 'Taunton, MA', dc: false, n: 4 },
  { id: 'NOR-W1', nm: 'Workplace', town: 'Norwell, MA', dc: false, n: 4 },
];
function evops() {
  const p = $('#pane-ev'); const r = rng(20261006);
  const ports = EVS.flatMap(s => Array.from({ length: s.n }, (_, i) => ({ s: s.id, dc: s.dc, i, st: r() < (s.dc ? .45 : .32) ? 'chg' : 'av' })));
  ports.find(x => x.s === 'NBD-D1' && x.i === 2).st = 'flt'; ports.find(x => x.s === 'HOL-S1' && x.i === 4).st = 'off';
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })) % 24;
  const dayFrac = Math.max(.08, Math.min(1, (hour - 5) / 17));
  const sessions = Math.round(ports.reduce((a, x) => a + (x.dc ? 9 : 3.2), 0) * dayFrac);
  const kwh = Math.round(ports.reduce((a, x) => a + (x.dc ? 9 * 34 : 3.2 * 13), 0) * dayFrac);
  const up = 98.6, nevi = 97;
  const draw = () => {
    const c = k => ports.filter(x => x.st === k).length;
    $('[data-k=tiles]', p).innerHTML = `<div class="tile"><span>Ports online</span><b class="num">${ports.length - c('off') - c('flt')}/${ports.length}</b><small class="warn">${c('flt')} faulted · ${c('off')} offline</small></div><div class="tile"><span>Charging now</span><b class="num">${c('chg')}</b><small>${ports.filter(x => x.st === 'chg' && x.dc).length} on DC fast</small></div><div class="tile"><span>Sessions today</span><b class="num">${n0(sessions)}</b><small>${n0(kwh)} kWh delivered</small></div><div class="tile"><span>30-day port uptime</span><b class="num">${up}%</b><small class="up">NEVI floor ${nevi}%</small></div>`;
    $('[data-k=sites]', p).innerHTML = EVS.map(s => `<div class="evs"><div class="nm">${esc(s.nm)} · ${esc(s.town)}<span>${esc(s.id)} · ${s.n} × ${s.dc ? 'DCFC 150 kW' : 'Level 2'}</span></div><div class="ports">${ports.filter(x => x.s === s.id).map(x => `<span class="port ${x.st} ${x.dc ? 'dc' : ''}" title="Port ${x.i + 1}: ${{ av: 'available', chg: 'charging', flt: 'faulted', off: 'offline' }[x.st]}"></span>`).join('')}</div></div>`).join('');
    $('#badge-ev').textContent = c('chg') + ' live';
  };
  p.innerHTML = `<div class="ph"><div><h3>EV network operations</h3><p>${ports.length} ports at ${EVS.length} sites CET installed · <span class="label-ill">illustrative network</span></p></div><div class="r"><span class="chip">CSMS: ChargeLab (OCPP)</span></div></div>
  <div class="tiles" data-k="tiles"></div>
  <div class="ev-g"><div><div class="evsites" data-k="sites"></div><div class="ev-lg"><span><i></i>available</span><span><i style="background:var(--green)"></i>charging</span><span><i style="border-color:var(--red);background:rgba(248,113,113,.4)"></i>faulted</span><span><i style="border-color:#3a4a6b;background:#1a2440"></i>offline</span><span>● = DC fast</span></div></div>
  <div><div class="tickets"><h5>Open tickets</h5><div class="tk"><span class="sv p1">P1</span><b>NBD-D1 · port 3 ground fault</b>Truck rolled from Taunton 10:42 · ETA 40 min<br><span>auto-opened by GridOS from OCPP fault</span></div><div class="tk"><span class="sv p2">P2</span><b>HOL-S1 · port 5 offline (cellular)</b>Modem power-cycle failed; tech scheduled tomorrow 08:00<br><span>uptime clock running · 3h 12m</span></div><div class="tk"><span class="sv p3">P3</span><b>WOR-G1 · firmware 2.4.1 rollout</b>Staged overnight, 2 of 8 ports complete<br><span>maintenance window — excluded from uptime</span></div></div>
  <div class="uptime"><div class="ln"><span>30-day port uptime</span><span class="num" style="color:var(--green)">${up}%</span></div><div class="bar"><u style="width:${(up - 90) * 10}%"></u><s style="left:${(nevi - 90) * 10}%"></s></div><div class="ln"><span>90%</span><span style="color:var(--amber)">▲ NEVI minimum ${nevi}%</span><span>100%</span></div></div></div></div>
  <div class="foot-n"><span>Ports, sessions and tickets are illustrative. NEVI-funded chargers must average >97% annual uptime per port (FHWA, 23 CFR 680.116). Session energy assumes ~34 kWh DC / ~13 kWh L2 (est.).</span><a href="https://www.ecfr.gov/current/title-23/chapter-I/subchapter-G/part-680" target="_blank" rel="noopener">23 CFR 680 ↗</a></div>`;
  draw();
  if (!RM) setInterval(() => { if (p.hidden || document.hidden) return; const cand = ports.filter(x => x.st === 'av' || x.st === 'chg'); const x = cand[Math.floor(Math.random() * cand.length)]; x.st = x.st === 'av' ? 'chg' : 'av'; draw(); }, 3500);
}

/* ── NuWave M&V (illustrative) ────────────────────────────────────────────── */
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
  const bars = act.map((v, i) => `<rect x="${44 + i * bw + bw * .18}" y="${y(v)}" width="${bw * .64}" height="${H - 24 - y(v)}" rx="3" fill="${i < 3 ? '#3b4f7a' : '#a78bfa'}" opacity="${i < 3 ? .8 : .9}"/>`).join('');
  const line = base.map((v, i) => `${(44 + i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const gl = [0, 200, 400].map(v => `<line x1="40" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="#1b2c4f"/><text x="34" y="${y(v) + 3}" fill="#7385a6" font-size="9.5" text-anchor="end">${v}</text>`).join('');
  const lbl = months.map((m, i) => `<text x="${44 + i * bw + bw / 2}" y="${H - 8}" fill="#7385a6" font-size="9.5" text-anchor="middle">${m}</text>`).join('');
  p.innerHTML = `<div class="ph"><div><h3>NuWave M&amp;V · grow-facility retrofit</h3><p>LED + dehumidification controls · IPMVP Option C (whole-facility meter) · <span class="label-ill">illustrative project</span></p></div><div class="r"><span class="chip">Oct 2025 – Sep 2026</span></div></div>
  <div class="tiles"><div class="tile"><span>Verified savings</span><b class="num">${n0(sav)} MWh</b><small class="up">since Dec cut-over</small></div><div class="tile"><span>Reduction vs baseline</span><b class="num">${n1(pct)}%</b><small>weather &amp; production adjusted</small></div><div class="tile"><span>Cost avoided</span><b class="num">$${n0(sav * 1000 * rate / 1000)}K</b><small>at $${rate}/kWh est.</small></div><div class="tile"><span>Emissions avoided</span><b class="num">${n0(sav * ef)} t</b><small>CO₂e at ${ef} t/MWh est.</small></div></div>
  <div class="mv-g"><div class="mv-chart"><div class="ev-lg" style="margin:0 0 6px"><span><i style="background:#a78bfa;border-color:#a78bfa"></i>metered kWh (MWh/mo)</span><span><i style="background:#3b4f7a;border-color:#3b4f7a"></i>pre-retrofit</span><span style="color:#e9effb">┄ adjusted baseline</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Monthly metered energy versus adjusted baseline">${gl}${bars}<polyline points="${line}" fill="none" stroke="#e9effb" stroke-width="1.6" stroke-dasharray="5 4"/>${lbl}<text x="${44 + 10 * bw + bw / 2}" y="${y(act[10]) - 6}" fill="#fbbf24" font-size="10" text-anchor="middle">▼</text></svg></div>
  <div class="mv-side"><div class="ev-note"><b>Persistence alert · Aug 12</b><br>Room 4 photoperiod override left fixtures at 100% for 9 nights; monthly savings slipped to 33%. GridOS flagged it from interval data; schedule restored Aug 21.</div><div class="ev-note" style="border-color:var(--green);background:rgba(52,211,153,.05)"><b>Incentive true-up ready</b><br>12 months of metered savings packaged for the utility custom-incentive true-up and the owner’s board report.</div><div class="ev-note" style="border-color:var(--blue);background:rgba(59,130,255,.06)"><b>Next sale</b><br>HVAC dehumidifier controls in Rooms 5–8 — same baseline, same meter, scoped by NuWave from this data.</div></div></div>
  <div class="foot-n"><span>Project, baseline and meter data are illustrative. Rate and grid emission factor are est. placeholders; a live deployment uses the utility tariff and ISO-NE marginal factors.</span><span>Method: IPMVP Option C</span></div>`;
}

/* ── Value-creation calculator ────────────────────────────────────────────── */
function value() {
  const ra = ev('ra-cet'); const [r0, r1] = (ra.revenue_basis_usd || [62e6, 105e6]).map(v => v / 1e6); const [u0, u1] = ra.ebitda_impact_pct_revenue; const [t0, t1] = ra.multiple_expansion_turns; const [i0, i1] = ra.investment_usd.map(v => v / 1e6);
  const SL = [
    { k: 'rev', l: 'Combined revenue (CET + Horton + NuWave)', min: r0, max: r1, step: .5, v: (r0 + r1) / 2, f: v => `$${v.toFixed(1)}M`, src: `est. $${r0}–${r1}M · cet_filings estimate_table (low confidence)` },
    { k: 'm', l: 'Base EBITDA margin', min: 6, max: 12, step: .5, v: 10, f: v => `${v}%`, src: 'est. 8–12% · LMM electrical (cet_filings); public comps median 11.2%' },
    { k: 'u', l: 'GridOS EBITDA uplift (% of revenue)', min: u0, max: u1, step: .05, v: +((u0 + u1) / 2).toFixed(2), f: v => `${v.toFixed(2)} pts`, src: `est. ${u0}–${u1} pts · ra-cet` },
    { k: 'M', l: 'Base EV / EBITDA multiple', min: 6, max: 12, step: .5, v: 10, f: v => `${v.toFixed(1)}x`, src: 'est. entry ~9–12x (cet_filings); PKF typical 5–6x / premium 10x+' },
    { k: 't', l: 'Multiple expansion credited to GridOS', min: 0, max: t1, step: .1, v: 1, f: v => `+${v.toFixed(1)}x`, src: `est. ${t0}–${t1} turns · ra-cet; Capstone spread caps at 3.0x` },
    { k: 'inv', l: 'GridOS investment', min: i0, max: i1, step: .1, v: +((i0 + i1) / 2).toFixed(1), f: v => `$${v.toFixed(1)}M`, src: `est. $${i0}–${i1}M · ra-cet` },
  ];
  const S = Object.fromEntries(SL.map(s => [s.k, s.v]));
  $('#calc-in').innerHTML = SL.map(s => `<div class="sl"><div class="top"><label for="sl-${s.k}">${esc(s.l)}</label><output id="out-${s.k}" for="sl-${s.k}">${s.f(s.v)}</output></div><input type="range" id="sl-${s.k}" data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.v}"><div class="meta"><span>${s.f(s.min)}</span><em>${esc(s.src)}</em><span>${s.f(s.max)}</span></div></div>`).join('');
  const calc = x => { const E0 = x.rev * x.m / 100, up = x.rev * x.u / 100, E1 = E0 + up, V0 = E0 * x.M, V1 = E1 * (x.M + x.t); return { E0, up, E1, V0, V1, v1: up * x.M, v2: E1 * x.t, total: V1 - V0 }; };
  const fm = v => `$${v >= 100 ? n0(v) : n1(v)}M`;
  const draw = () => {
    const c = calc(S);
    $('#o-total').textContent = fm(c.total); $('#o-roi').textContent = `${n0(c.total / S.inv)}× the $${S.inv.toFixed(1)}M investment · est.`;
    $('#o-up').textContent = `+${fm(c.up)} / yr`; $('#o-v1').textContent = fm(c.v1); $('#o-v2').textContent = fm(c.v2); $('#o-pb').textContent = `${n1(S.inv / c.up * 12)} months`;
    const box = $('#waterfall'); const W = Math.max(320, Math.min(560, box.clientWidth || 560)), H = 190, mx = c.V1 * 1.08, bw = Math.round(W * .165); const gap = (W - 20 - 4 * bw) / 3; const y = v => 20 + (1 - v / mx) * (H - 50); const xs = [0, 1, 2, 3].map(i => Math.round(10 + i * (bw + gap)));
    const nr = W < 480; const bars = [[xs[0], 0, c.V0, '#3b4f7a', nr ? 'Today' : 'EV today'], [xs[1], c.V0, c.V0 + c.v1, '#3b82ff', nr ? '+EBITDA' : '+ EBITDA uplift'], [xs[2], c.V0 + c.v1, c.V1, '#22d3ee', nr ? '+Re-rate' : '+ re-rating'], [xs[3], 0, c.V1, 'url(#wf)', nr ? 'w/ GridOS' : 'EV with GridOS']];
    $('#waterfall').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Enterprise value bridge: ${fm(c.V0)} today plus ${fm(c.v1)} from EBITDA and ${fm(c.v2)} from re-rating equals ${fm(c.V1)}"><defs><linearGradient id="wf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#1d5ff0"/></linearGradient></defs><line x1="10" x2="${W - 10}" y1="${y(0)}" y2="${y(0)}" stroke="#1b2c4f"/>${bars.map(([x, a, b, col, l], i) => `<rect x="${x}" y="${y(b)}" width="${bw}" height="${Math.max(2, y(a) - y(b))}" rx="4" fill="${col}"/>${i < 3 ? `<line x1="${x + bw}" x2="${xs[i + 1]}" y1="${y(b)}" y2="${y(b)}" stroke="#46598a" stroke-dasharray="3 3"/>` : ''}<text x="${x + bw / 2}" y="${y(b) - 6}" fill="#e9effb" font-size="11" font-weight="600" text-anchor="middle">${i === 1 || i === 2 ? '+' : ''}${fm(b - a)}</text><text x="${x + bw / 2}" y="${H - 10}" fill="#7385a6" font-size="10" text-anchor="middle">${l}</text>`).join('')}</svg>`;
  };
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 150); });
  $('#calc-in').addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; S[k] = +e.target.value; const s = SL.find(x => x.k === k); $('#out-' + k).textContent = s.f(S[k]); draw(); });
  draw();
  const sc = [['Low', r0, u0, t0], ['Base', (r0 + r1) / 2, (u0 + u1) / 2, (t0 + t1) / 2], ['High', r1, u1, t1]].map(([nm, rev, u, t]) => { const c = calc({ rev, m: 10, u, M: 10, t, inv: 0 }); return `<div class="sc ${nm === 'Base' ? 'mid' : ''}"><h4>${nm} case · est.</h4><b class="num">${fm(c.total)}</b><p>$${n0(rev)}M revenue · +${u.toFixed(2)} pts EBITDA (+${fm(c.up)}/yr) · +${t.toFixed(1)}x on a 10x base, 10% margin</p></div>`; }).join('');
  $('#scen').innerHTML = sc;
}

/* ── Stack, roadmap, exit, sources ────────────────────────────────────────── */
function stack() {
  const vs = EV.filter(i => i.kind === 'vendor_stack' && i.company === 'cet');
  const LAYER = { 'Construction project management': 'Field', 'Electrical estimating and takeoff': 'Estimate', 'Solar / storage asset monitoring': 'Fleet', 'SCADA / HMI for pump stations and wastewater': 'Pump-station SCADA', 'EV charging management (CSMS)': 'Charge' };
  const buy = vs.map(v => ({ layer: LAYER[v.category] || v.category, cat: v.category, vendor: v.vendor, url: v.source_url, what: v.what_it_does, price: v.pricing_note, bb: 'buy' }));
  const build = [
    { layer: 'Bid Radar', cat: 'Opportunity data + go/no-go', vendor: 'GridOS (BSP PRG)', what: 'Public bids, SRF lists and capital plans across six states, scored for fit — the portal’s cet_opportunities dataset, refreshed weekly.', price: 'PRG + 1 analyst; data already assembled in the portal', bb: 'build' },
    { layer: 'GridOS core', cat: 'Asset registry + Assure contracts', vendor: 'GridOS (BSP PRG)', what: 'One record of every pump station, generator, array and charger CET services, linked to contracts, SLAs and monitoring feeds.', price: 'Inside the $0.8–1.8M program budget (est.)', bb: 'build' },
    { layer: 'M&V', cat: 'Savings analytics', vendor: 'GridOS (NuWave)', what: 'Adjusted-baseline models on interval meter data; persistence alerts and incentive true-up packs.', price: 'Built on utility interval data; no license', bb: 'build' },
  ];
  const rows = [...build.slice(0, 1), ...buy, ...build.slice(1)];
  $('#stack-t').innerHTML = `<div class="stk h"><span>Module</span><span>Vendor</span><span>What it does for CET</span><span>Pricing note</span><span>Build / buy</span></div>${rows.map(r => `<div class="stk"><span><b>${esc(r.layer)}</b><br><span class="cat">${esc(r.cat)}</span></span><span class="v"><b>${esc(r.vendor)}</b>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">source: ${esc(new URL(r.url).hostname.replace('www.', ''))} ↗</a>` : ''}</span><span class="w">${esc(r.what)}</span><span class="pr">${esc(r.price)}</span><span class="bb ${r.bb}">${r.bb.toUpperCase()}</span></div>`).join('')}`;
}
function gantt() {
  const start = new Date(2026, 9, 1); const mo = Array.from({ length: 12 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
  const R = [
    ['Bid Radar + go/no-go live', 'PRG · CET estimating', 1, 2, '#3b82ff'],
    ['Accubid estimating standard', 'CET + Horton estimating', 1, 4, '#3b82ff'],
    ['Procore field rollout', 'CET ops · foreman champions', 2, 7, '#5c9dff'],
    ['Pump-station SCADA pilot → scale', 'Horton · 10 stations, then 40', 3, 10, '#22d3ee'],
    ['Fleet monitoring + Assure O&M', 'CET solar · PowerTrack', 4, 9, '#fbbf24'],
    ['EV network ops', 'CET · ChargeLab', 5, 9, '#34d399'],
    ['NuWave M&V dashboards', 'NuWave', 6, 10, '#a78bfa'],
    ['Value checkpoints', 'Win rate · attach rate · availability', 0, 0, null, [6, 9, 12]],
  ];
  $('#gantt').innerHTML = `<div class="gt"><div class="gr hd"><div>Workstream · owner</div>${mo.map(d => `<div>${d.toLocaleString('en-US', { month: 'short' })}${d.getMonth() === 0 || d === mo[0] ? ` ’${String(d.getFullYear()).slice(2)}` : ''}</div>`).join('')}</div>${R.map(([l, o, a, b, c, ms]) => `<div class="gr"><div class="lb">${esc(l)}<span>${esc(o)}</span></div>${ms ? mo.map((_, i) => `<div style="display:grid">${ms.includes(i + 1) ? `<span class="gms" title="Month ${i + 1} checkpoint"></span>` : ''}</div>`).join('') : `<div class="gbar" style="grid-column:${a + 1}/${b + 2};background:${c}">M${a}–M${b}</div>`}</div>`).join('')}</div>`;
}
function exitCards(comps) {
  const e5 = ev('ve-05'), e6 = ev('ve-06'), e12 = ev('ve-12'), e13 = ev('ve-13'), e7 = ev('ve-07');
  const bm = comps?.meta?.sector_benchmarks?.commercial_electrical_energy;
  const C = [
    e5 && ['10x+', 'EBITDA for repeatable service', 'Buyers pay for service mix, not volume', 'PKF’s valuation grid puts project-heavy, low-retention contractors at 5–6x and repeatable-service, high-visibility businesses north of 10x. Assure and monitoring contracts move CET up that grid.', e5],
    e6 && ['3.0x', 'typical → premium spread', 'The ceiling on any one lever', 'Advisors expect 6.8x typical vs 9.8x premium middle-market multiples in 2026. GridOS is credited with 0.5–1.5 of those turns, not all of them.', e6],
    e12 && ['106%', 'Procore net revenue retention', 'Digital operating layers stick', 'Contractors that adopt project software rarely leave it (95% gross retention). A buyer inherits a workforce already running on the system.', e12],
    e7 && ['>110%', 'ServiceTitan net dollar retention', 'Contractors keep adding to their OS', 'Trade contractors keep expanding spend on their operating system — evidence that the platform layer becomes core infrastructure, not overhead.', e7],
    e13 && ['99', 'electrical-contractor deals in 2025', 'Fewer, choosier buyers', 'Deal count fell from 140 to 99 while financial buyers did ~2/3 of deals. Differentiation — service mix, systems, data — decides who gets bid up.', e13],
    bm && [`${bm.median_ebitda_margin_latest_pct}%`, `median EBITDA margin · ${bm.n} public comps`, 'Margin upside lives in service mix', `Public electrical and energy contractors (${(bm.comps || []).join(', ')}) earn ~${bm.median_operating_margin_latest_pct}% operating margins; only specialist, self-perform and service-heavy leaders clear 10%.`, { source_url: null, source_name: 'public_comps.json · sector_benchmarks (SEC filings)', date: comps.meta.generated, confidence: 'high' }],
  ].filter(Boolean);
  $('#exit-cards').innerHTML = C.map(([big, sub, h, p, s]) => `<article class="ex rv in"><div class="n num">${esc(big)}<small>${esc(sub)}</small></div><h3>${esc(h)}</h3><p>${esc(p)}</p><span class="s">est. · ${s.source_url ? `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(clip(s.source_name, 70))} ↗</a>` : esc(s.source_name)} · ${esc(s.date || '')}${s.confidence ? ' · ' + esc(s.confidence) + ' confidence' : ''}</span></article>`).join('');
  const src = EV.filter(i => (Array.isArray(i.applies_to) && i.applies_to.includes('cet')) || i.company === 'cet');
  $('#sources').innerHTML = src.map(i => `<li><b style="color:var(--tx-2)">${esc(i.id)}</b> · ${esc(i.title || `${i.vendor || i.kpi || i.os_name || ''}`)} — ${i.source_url ? `<a href="${esc(i.source_url)}" target="_blank" rel="noopener">${esc(clip(cleanSrc(i.source_name || new URL(i.source_url).hostname), 60))} ↗</a>` : esc(i.label || i.revenue_source || 'analyst assumption')}${i.confidence ? `<span class="cf">${esc(i.confidence)}</span>` : ''}</li>`).join('') || '<li>Evidence file not available.</li>';
}
function hero() {
  const ra = ev('ra-cet'); const k1 = ev('kb-cet-1'), k2 = ev('kb-cet-2'), k3 = ev('kb-cet-3');
  const t = $('#thesis'); if (t && ra) { const M = v => (v / 1e6).toFixed(1); $('[data-k=ebitda]', t).textContent = `$${M(ra.ebitda_impact_usd[0])}–${M(ra.ebitda_impact_usd[1])}M`; $('[data-k=ebitda-s]', t).textContent = `${ra.ebitda_impact_pct_revenue[0].toFixed(1)}–${ra.ebitda_impact_pct_revenue[1].toFixed(1)}% of est. $${ra.revenue_basis_usd[0] / 1e6}–${ra.revenue_basis_usd[1] / 1e6}M revenue`; $('[data-k=turns]', t).textContent = `+${ra.multiple_expansion_turns[0]}–${ra.multiple_expansion_turns[1]}x`; $('[data-k=inv]', t).textContent = `$${M(ra.investment_usd[0])}–${M(ra.investment_usd[1])}M`; $('[data-k=ttv]', t).textContent = `${ra.time_to_value_months[0]}–${ra.time_to_value_months[1]} mo`; }
  const k = $('#kpi3'); if (!k) return;
  if (k1) { $('[data-k=b1]', k).textContent = k1.baseline + '%'; $('[data-k=t1]', k).textContent = k1.target + '%'; $('[data-k=s1]', k).innerHTML = `est. · <a href="${esc(k1.source_url)}" target="_blank" rel="noopener" style="color:inherit">ConstructConnect / ENR guidance ↗</a>`; }
  if (k3) { $('[data-k=b3]', k).textContent = k3.baseline + '%'; $('[data-k=t3]', k).textContent = k3.target + '%'; $('[data-k=s3]', k).innerHTML = `est. · <a href="${esc(k3.source_url)}" target="_blank" rel="noopener" style="color:inherit">NREL PV Fleet study ↗</a>`; }
  if (k2) { $('[data-k=b2]', k).textContent = k2.baseline + '%'; $('[data-k=t2]', k).textContent = k2.target == null ? 'TBD' : k2.target + '%'; $('[data-k=s2]', k).innerHTML = `est. · <a href="${esc(k2.source_url)}" target="_blank" rel="noopener" style="color:inherit">FMI / PlanGrid via Construction Dive ↗</a>`; }
}

export async function initOS({ Data }) {
  shell(); clock();
  const [evd, opp, ww, comps] = await Promise.all(['serviceos_evidence', 'cet_opportunities', 'cet_wwtp_targets', 'public_comps'].map(n => Data.research(n).catch(() => null)));
  EV = evd?.items || [];
  hero(); value(); stack(); gantt(); exitCards(comps);
  const items = opp?.items || [];
  $('#badge-bids').textContent = items.filter(o => o.due_date && o.stage !== 'awarded' && daysTo(o.due_date) >= 0 && daysTo(o.due_date) <= 14).length + ' due';
  RENDER['pane-bids'] = () => items.length ? bids(items, opp.meta) : ($('#pane-bids').innerHTML = '<div class="loading">Opportunity dataset not available.</div>');
  RENDER['pane-fleet'] = () => fleet();
  RENDER['pane-ww'] = () => wastewater(ww);
  RENDER['pane-ev'] = () => evops();
  RENDER['pane-mv'] = () => mv();
  $('#badge-fleet').textContent = '3 alerts'; $('#badge-ev').textContent = 'live'; $('#badge-ww').textContent = 'top 10';
  tabs();
}
