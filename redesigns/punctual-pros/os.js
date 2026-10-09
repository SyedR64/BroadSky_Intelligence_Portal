/* ServiceOS product page — demo logic. Shared helpers come from ./site.js (same folder). */
import { FAQ, TERRITORY, HUBS, classifyZip, zipIndex, cleanCity, miles, fillRange, territoryAlerts, alertLevel } from './site.js?v=20261009165425';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const mm = (n, d = 1) => '$' + (n / 1e6).toFixed(d) + 'M';
const kfmt = n => n >= 1e6 ? mm(n) : n >= 1e4 ? '$' + Math.round(n / 1e3) + 'K' : money(n);

export function init({ Data, Fmt, Live, Chat, esc, Frame }) {
  if (Frame?.label) frameLabel = Frame.label;
  const ctx = { Data, Fmt, Live, esc, pci: null };
  const parts = [tabs, () => board(ctx), () => pressure(ctx), () => transcript(ctx), membership, () => movers(ctx), valueMath, () => evidence(ctx), roadmap, risks];
  for (const fn of parts) { try { fn(); } catch (e) { console.warn('section failed', e); } }
  const faq = FAQ.map(f => ({ ...f, a: f.a.replace(/href="#/g, 'href="./index.html#'), href: f.href && f.href.startsWith('#') ? './index.html' + f.href : f.href }));
  faq.push({ q: 'How much does ServiceOS cost and what does it return?', a: '<p>Estimated $0.4–0.9M of software and implementation, 6–12 months to value, and 2–4 points of EBITDA margin on ~$22M of revenue (~$0.3–1.1M), all labelled est. in the <a href="#value">value math</a>.</p>', href: '#value' });
  faq.push({ q: 'What is the Service-Call Pressure Index?', a: '<p>A 7-day forecast of expected service calls per hub and trade, computed from the live forecast and the portal\'s weather-to-demand multipliers. 100 is a normal day. <a href="#demo">Open the demo</a>.</p>', href: '#demo' });
  try { return Chat.mount(null, { persona: 'pp', short_name: 'Punctual Pros', mode: 'floating', theme: 'light', faq, suggestions: ['What is ServiceOS?', 'What is the Service-Call Pressure Index?', 'Is there a storm coming this week?', 'How much does ServiceOS cost and what does it return?', 'Do you serve 08753?'] }); } catch (e) { console.warn('chat mount failed', e); return null; }
}
function tabs() {
  const btns = $$('.tabs [role="tab"]');
  const sel = id => { btns.forEach(b => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('#' + b.getAttribute('aria-controls')).hidden = !on; }); };
  btns.forEach((b, i) => { b.onclick = () => sel(b.dataset.tab); b.onkeydown = e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length]; n.focus(); sel(n.dataset.tab); } }; });
  $$('.mod[data-tab]').forEach(a => a.addEventListener('click', () => sel(a.dataset.tab)));
  window.__osTab = sel;
  const q = new URLSearchParams(location.search).get('tab'); if (q && btns.some(b => b.dataset.tab === q)) setTimeout(() => { sel(q); if (q === 'ai') $('#replay')?.click(); }, 0);
}
const setRange = el => { fillRange(el); };

/* ── Dispatch board ───────────────────────────────────────────────────────── */
const TRADE = { hvac: { n: 'HVAC', c: 'var(--pp-heat)' }, plumb: { n: 'Plumbing', c: 'var(--pp-plumb)' }, elec: { n: 'Electrical', c: 'var(--pp-elec)' } };
const jobNo = id => '#' + String(id).split('-').pop();
const HUBN = { L: 'Lancaster', Y: 'York', H: 'Harrisburg', N: 'Toms River' };
const HUBLL = { L: [40.079, -76.388], Y: [39.9585, -76.6587], H: [40.2677, -76.7871], N: [39.9284, -74.2022] };
const TECHS = [
  { id: 'DM', n: 'Dani M.', t: 'hvac', h: 'L' }, { id: 'JR', n: 'Jose R.', t: 'plumb', h: 'L' }, { id: 'KS', n: 'Kim S.', t: 'elec', h: 'L' },
  { id: 'MB', n: 'Marcus B.', t: 'hvac', h: 'Y' }, { id: 'BL', n: 'Ben L.', t: 'hvac', h: 'Y' }, { id: 'AT', n: 'Ana T.', t: 'plumb', h: 'Y' },
  { id: 'TW', n: 'Tom W.', t: 'hvac', h: 'H' }, { id: 'LP', n: 'Luis P.', t: 'elec', h: 'H' }, { id: 'RG', n: 'Ryan G.', t: 'plumb', h: 'H' },
  { id: 'CH', n: 'Chris H.', t: 'hvac', h: 'N' }, { id: 'EV', n: 'Erin V.', t: 'elec', h: 'N' },
];
const JOBS0 = [
  { id: 'L-1041', h: 'L', zip: '17601', city: 'Lancaster', t: 'hvac', ty: 'No heat — furnace ignitor', w: 8, st: 'onsite', tech: 'DM', mem: 1, urg: 1, cust: 'R. Hoffman', val: 420 },
  { id: 'L-1042', h: 'L', zip: '17552', city: 'Mount Joy', t: 'plumb', ty: 'Water heater leaking', w: 10, st: 'enroute', tech: 'JR', mem: 1, cust: 'K. Stoltzfus', val: 1850 },
  { id: 'L-1043', h: 'L', zip: '17543', city: 'Lititz', t: 'elec', ty: 'Panel upgrade estimate', w: 12, st: 'scheduled', tech: 'KS', cust: 'M. Brubaker', val: 2900 },
  { id: 'L-1044', h: 'L', zip: '17522', city: 'Ephrata', t: 'hvac', ty: 'Fall tune-up (member)', w: 14, st: 'new', mem: 1, cust: 'J. Weaver', val: 0 },
  { id: 'Y-2031', h: 'Y', zip: '17402', city: 'York', t: 'hvac', ty: 'Heat pump not heating', w: 8, st: 'done', tech: 'MB', cust: 'T. Gross', val: 640 },
  { id: 'Y-2032', h: 'Y', zip: '17331', city: 'Hanover', t: 'plumb', ty: 'Kitchen drain clog', w: 10, st: 'onsite', tech: 'AT', cust: 'L. Miller', val: 289 },
  { id: 'Y-2033', h: 'Y', zip: '17356', city: 'Red Lion', t: 'hvac', ty: 'Fall tune-up (member)', w: 12, st: 'new', mem: 1, cust: 'S. Keller', val: 0 },
  { id: 'H-3021', h: 'H', zip: '17111', city: 'Harrisburg', t: 'elec', ty: 'Breaker keeps tripping', w: 10, st: 'enroute', tech: 'LP', urg: 1, cust: 'D. Nguyen', val: 365 },
  { id: 'H-3022', h: 'H', zip: '17011', city: 'Camp Hill', t: 'hvac', ty: 'No heat upstairs', w: 14, st: 'new', urg: 1, cust: 'A. Shah', val: 480 },
  { id: 'H-3023', h: 'H', zip: '17055', city: 'Mechanicsburg', t: 'plumb', ty: 'Sump pump test + battery', w: 12, st: 'scheduled', tech: 'RG', mem: 1, cust: 'P. Ruiz', val: 540 },
  { id: 'N-4011', h: 'N', zip: '08753', city: 'Toms River', t: 'hvac', ty: 'No heat — booked by AI at 2:07 AM', w: 8, st: 'onsite', tech: 'CH', mem: 1, urg: 1, cust: 'M. Torres', val: 510 },
  { id: 'N-4012', h: 'N', zip: '08723', city: 'Brick', t: 'elec', ty: 'Generator annual service', w: 10, st: 'new', mem: 1, cust: 'G. Walsh', val: 249 },
];
const COLS = [['new', 'Unassigned'], ['scheduled', 'Scheduled'], ['enroute', 'En route'], ['onsite', 'On site'], ['done', 'Completed']];
const STEPS = ['new', 'scheduled', 'enroute', 'onsite', 'done'];
const hr = h => `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`;
function board(ctx) {
  const { esc } = ctx;
  let jobs, hub = 'all', sel = null, clock;
  const reset = () => { jobs = JOBS0.map(j => ({ ...j, log: [] })); clock = 10 * 60 + 30; sel = 'N-4011'; render(); };
  zipIndex(ctx.Data).then(idx => { for (const j of JOBS0) { const r = idx.get(j.zip); if (r) { j.county = String(r.county || '').replace(/ County$/, ''); j.lat = r.lat; j.lon = r.lon; j.cov = classifyZip(r).s; } } if (jobs) { jobs.forEach(j => { const o = JOBS0.find(x => x.id === j.id); Object.assign(j, { county: o.county, lat: o.lat, lon: o.lon, cov: o.cov }); }); render(); } }).catch(() => { });
  $('#hub-chips').innerHTML = [['all', 'All hubs'], ...Object.entries(HUBN)].map(([k, n]) => `<button type="button" class="sys-chip" data-h="${k}" aria-pressed="${k === 'all'}">${n}</button>`).join('');
  $('#hub-chips').onclick = e => { const b = e.target.closest('.sys-chip'); if (!b) return; hub = b.dataset.h; $$('#hub-chips .sys-chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); };
  const load = id => jobs.filter(j => j.tech === id && j.st !== 'done').length;
  function render() {
    const vis = jobs.filter(j => hub === 'all' || j.h === hub);
    const n = s => vis.filter(j => j.st === s).length;
    const booked = vis.reduce((s, j) => s + j.val, 0);
    $('#board-kpis').innerHTML = [['Jobs today', vis.length], ['Unassigned', n('new')], ['In the field', n('enroute') + n('onsite')], ['Completed', n('done')], ['Ticket value', kfmt(booked) + '<span class="sys-est sys-est--illus">illustrative</span>']].map(([l, v]) => `<div class="bk"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');
    $('#cols').innerHTML = COLS.map(([k, name]) => { const list = vis.filter(j => j.st === k).sort((a, b) => (b.urg || 0) - (a.urg || 0) || (b.mem || 0) - (a.mem || 0) || a.w - b.w); return `<div class="col"><h4>${name}<span>${list.length}</span></h4>${list.map(card).join('') || '<div class="empty">—</div>'}</div>`; }).join('');
    $('#clock').textContent = `${Math.floor(clock / 60) % 12 || 12}:${String(clock % 60).padStart(2, '0')} ${clock >= 720 ? 'PM' : 'AM'} · ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    detail();
  }
  function card(j) {
    const T = TECHS.find(t => t.id === j.tech);
    return `<button type="button" class="job${j.flash ? ' flash' : ''}" data-id="${j.id}" aria-pressed="${sel === j.id}" style="--c:${TRADE[j.t].c}"><div class="r1"><span>${jobNo(j.id)}</span><span>${hr(j.w)}–${hr(j.w + 2)}</span></div><div class="ty">${esc(j.ty)}</div><div class="wh">${esc(j.city)} · ${j.zip}</div><div class="r3">${T ? `<span class="av" title="${esc(T.n)}">${T.id}</span>` : '<span class="tg un">Needs tech</span>'}${j.mem ? '<span class="tg mem">Member</span>' : ''}${j.urg ? '<span class="tg urg">Urgent</span>' : ''}</div></button>`;
  }
  function detail() {
    const j = jobs.find(x => x.id === sel); const el = $('#detail');
    if (!j) { el.innerHTML = '<p class="sys-muted">Select a job to see details.</p>'; return; }
    const T = TECHS.find(t => t.id === j.tech); const i = STEPS.indexOf(j.st);
    const pci = ctx.pci?.today?.[j.h];
    el.innerHTML = `<div class="sub">Job ${jobNo(j.id)} · ${TRADE[j.t].n} · ${HUBN[j.h]} hub</div><h4>${esc(j.ty)}</h4><div class="sub">${esc(j.cust)} (illustrative) · ${esc(j.city)} ${j.zip}${j.county ? ` · ${esc(j.county)} Co.` : ''}</div>
      <dl><div><dt>Window</dt><dd>${hr(j.w)}–${hr(j.w + 2)}</dd></div><div><dt>Technician</dt><dd>${T ? esc(T.n) : '—'}</dd></div><div><dt>Membership</dt><dd>${j.mem ? 'Comfort Club' : 'None · offer at close'}</dd></div><div><dt>Hub pressure today</dt><dd class="sys-num">${pci != null ? pci : '…'}</dd></div></dl>
      <div class="why">${j.why ? `<b>Auto-dispatch:</b> ${esc(j.why)}` : j.st === 'new' ? `<b>Waiting for a tech.</b> Click <i>Auto-dispatch</i> to assign by trade, hub, load and member priority.` : j.mem ? '<b>Member priority</b> applied: first available window, diagnostic fee waived.' : '<b>Membership offer</b> queued for job close: tech shows Comfort Club savings on the tablet.'}</div>
      <ul class="tl">${['Booked', 'Assigned', 'En route · ETA text sent', 'On site · upfront price shown', 'Completed · text-to-pay + review'].map((s, k) => `<li class="${k <= i ? 'on' : ''}"><i></i>${s}</li>`).join('')}</ul>`;
  }
  $('#cols').onclick = e => { const b = e.target.closest('.job'); if (!b) return; sel = b.dataset.id; render(); };
  $('#auto').onclick = () => {
    const un = jobs.filter(j => j.st === 'new').sort((a, b) => (b.urg || 0) - (a.urg || 0) || (b.mem || 0) - (a.mem || 0) || a.w - b.w);
    if (!un.length) { $('#auto').textContent = 'All jobs assigned ✓'; setTimeout(() => { $('#auto').innerHTML = '<svg class="ico"><use href="#i-bolt"/></svg>Auto-dispatch unassigned'; }, 1600); return; }
    for (const j of un) {
      const cands = TECHS.filter(t => t.t === j.t).map(t => { const ll = HUBLL[t.h]; const d = j.lat != null ? miles(j.lat, j.lon, ll[0], ll[1]) : (t.h === j.h ? 10 : 60); return { t, d, l: load(t.id) }; }).sort((a, b) => (a.d > 40) - (b.d > 40) || a.l - b.l || a.d - b.d);
      const c = cands[0]; if (!c) continue;
      j.tech = c.t.id; j.st = 'scheduled'; j.flash = 1; sel = j.id;
      j.why = `${c.t.n} (${TRADE[j.t].n}, ${HUBN[c.t.h]}) · ${c.l} open job${c.l === 1 ? '' : 's'} · ~${Math.round(c.d)} mi from shop, ~${Math.max(10, Math.round(c.d * 1.35 / 35 * 60))} min drive${j.mem ? ' · member priority' : ''}${j.urg ? ' · urgent first' : ''}.`;
    }
    render(); setTimeout(() => jobs.forEach(j => j.flash = 0), 1300);
  };
  $('#tick').onclick = () => {
    clock += 30;
    jobs.filter(j => j.st === 'onsite').slice(0, 2).forEach(j => j.st = 'done');
    jobs.filter(j => j.st === 'enroute').forEach(j => j.st = 'onsite');
    jobs.filter(j => j.st === 'scheduled').sort((a, b) => a.w - b.w).slice(0, 2).forEach(j => j.st = 'enroute');
    render();
  };
  $('#reset').onclick = reset;
  ctx.renderBoard = () => render();
  reset();
}

/* ── Service-Call Pressure Index ──────────────────────────────────────────── */
const PCI_HUBS = [
  { k: 'L', name: 'Lancaster', lat: 40.038, lon: -76.3057, counties: ['Lancaster', 'Lebanon', 'Berks'] },
  { k: 'Y', name: 'York', lat: 39.9625, lon: -76.7277, counties: ['York', 'Adams', 'Franklin'] },
  { k: 'H', name: 'Harrisburg', lat: 40.2663, lon: -76.8861, counties: ['Dauphin', 'Cumberland', 'Perry'] },
  { k: 'N', name: 'Toms River', lat: 39.9528, lon: -74.1967, counties: ['Ocean', 'Monmouth'] },
];
const HH_FALLBACK = { Lancaster: 212748, Lebanon: 56712, Berks: 163236, York: 181583, Adams: 40841, Franklin: 63510, Dauphin: 121358, Cumberland: 106427, Perry: 18299, Ocean: 243843, Monmouth: 251712 };
function pressure(ctx) {
  const { Data, Live, esc } = ctx;
  let model = null, data = null, selCell = null, share = 3, hhMap = null, scen = 'live'; const cache = {};
  const sh = $('#share'); setRange(sh);
  sh.oninput = () => { share = +sh.value; $('#o-share').textContent = share + '%'; setRange(sh); renderCap(); };
  $('#o-share').textContent = share + '%';

  Promise.all([Data.research('pp_demand_model'), Data.research('pp_market')]).then(async ([dm, mk]) => {
    const it = dm?.items || [];
    const get = id => it.find(i => i.id === id);
    const mid = (id, i, fb) => { const p = get(id)?.piecewise?.[i]?.multiplier; return Array.isArray(p) ? (p[0] + p[1]) / 2 : fb; };
    const base = id => get(id)?.value_point;
    model = {
      base: { hvac: base('baseline_hvac') ?? 10, plumb: base('baseline_plumbing') ?? 16, elec: base('baseline_electrical') ?? 7 },
      cool: [mid('mult_hvac_cooling_tmax', 1, 1.1), mid('mult_hvac_cooling_tmax', 2, 1.175), mid('mult_hvac_cooling_tmax', 3, 1.225), mid('mult_hvac_cooling_tmax', 4, 1.45)],
      heat: [mid('mult_hvac_heating_tmin', 1, 1.1), mid('mult_hvac_heating_tmin', 2, 1.35), mid('mult_hvac_heating_tmin', 3, 1.75), mid('mult_hvac_heating_tmin', 4, 2.5), mid('mult_hvac_heating_tmin', 5, 1.45)],
      frz: [mid('mult_plumbing_hard_freeze', 0, 1.125), mid('mult_plumbing_hard_freeze', 1, 2.0), mid('mult_plumbing_hard_freeze', 2, 2.75), mid('mult_plumbing_hard_freeze', 3, 2.5)],
      rain: [mid('mult_plumbing_heavy_rain', 0, 1.2), mid('mult_plumbing_heavy_rain', 1, 1.65)],
      wind: [mid('mult_electrical_wind', 1, 1.25), mid('mult_electrical_wind', 2, 2.0)],
      ts: mid('mult_electrical_lightning', 0, 1.4),
      play: Object.fromEntries(it.filter(i => i.component === 'event_playbook').map(i => [i.id, i])),
      fromData: !!dm,
    };
    hhMap = { ...HH_FALLBACK };
    for (const i of (mk?.items || []).filter(i => i.kind === 'county_profile')) { const c = String(i.name).split(' County')[0]; if (i.occupied_units) hhMap[c] = +i.occupied_units; }
    await loadScen('live');
    const qs = new URLSearchParams(location.search).get('scen'); if (qs && qs !== 'live') $(`#pci-scen [data-s="${qs}"]`)?.click();
    territoryAlerts(Data, Live).then(({ inT }) => { const l = alertLevel(inT); $('#demo-live').textContent = `live · ${l === 'ok' ? 'no weather alerts' : inT.length + ' weather alert' + (inT.length > 1 ? 's' : '')}`; if (l !== 'ok') $('#demo-live').classList.add('alert'); }).catch(() => { });
  }).catch(() => {
    $('#heat').innerHTML = '<tbody><tr><td class="sys-muted" style="padding:20px">Live forecast unavailable right now. The index needs Open-Meteo; try again in a minute.</td></tr></tbody>';
    $('#drv').innerHTML = '<h4>Pressure Index offline</h4><p class="sys-muted">The demand model is loaded from the Punctual Pros demand model; the forecast feed did not respond.</p>';
  });

  const SCEN = { live: { label: 'Live 7-day forecast' }, cold: { label: 'Replay · Jan 20–26 2025 Arctic blast', from: '2025-01-19', to: '2025-01-26' }, heat: { label: 'Replay · Jun 22–28 2025 heat wave', from: '2025-06-21', to: '2025-06-28' } };
  const chipsEl = $('#pci-scen');
  chipsEl.innerHTML = Object.entries(SCEN).map(([k, v]) => `<button type="button" class="sys-chip" data-s="${k}" aria-pressed="${k === 'live'}">${v.label}</button>`).join('');
  chipsEl.onclick = async e => { const b = e.target.closest('.sys-chip'); if (!b || !model) return; $$('.sys-chip', chipsEl).forEach(x => x.setAttribute('aria-pressed', String(x === b))); try { await loadScen(b.dataset.s); } catch { $('#drv').innerHTML = '<h4>Replay unavailable</h4><p class="sys-muted">The Open-Meteo archive did not respond.</p>'; } };
  async function loadScen(k) {
    scen = k; const S = SCEN[k];
    if (!cache[k]) {
      const fcs = await Promise.all(PCI_HUBS.map(h => (k === 'live' ? Live.forecast(h.lat, h.lon).then(f => f.filter(d => !d.past).slice(0, 7)) : Live.history(h.lat, h.lon, S.from, S.to).then(f => f.map(d => ({ ...d, code: 0, past: false })))).catch(() => null)));
      if (fcs.every(f => !f)) throw new Error('weather unavailable');
      cache[k] = fcs;
    }
    const fcs = cache[k];
    // replays include one warm-up day so streaks (hard freeze, heat wave) start correctly; drop it after scoring
    data = PCI_HUBS.map((h, i) => { const sc = score(fcs[i] || [], model); return { ...h, hh: h.counties.reduce((s, c) => s + (hhMap[c] || 0), 0), days: k === 'live' ? sc : sc.slice(1) }; });
    if (k === 'live') { ctx.pci = { today: Object.fromEntries(data.map(h => [h.k, h.days[0]?.idx ?? null])) }; ctx.renderBoard?.(); }
    const peak = data.flatMap(h => h.days.map((d, j) => ({ h, d, j }))).sort((a, b) => b.d.idx - a.d.idx)[0];
    selCell = peak ? [data.indexOf(peak.h), peak.j] : [0, 0];
    renderHeat(); renderDrv(); renderCap();
  }
  function score(days, M) {
    let prevFrz = 0, coldSnapSeen = false, frzStreak = 0, hardStreak = 0;
    return days.map((d, i) => {
      const drv = { hvac: [], plumb: [], elec: [] };
      const mean = (d.tmax + d.tmin) / 2;
      if (d.tmax >= 95) drv.hvac.push([M.cool[3], `High ${Math.round(d.tmax)}°F, 95 or above`]);
      else if (d.tmax >= 90 && d.tmin >= 70 && i > 0 && days[i - 1].tmax >= 90) drv.hvac.push([M.cool[2], 'Heat wave (2+ hot days, warm nights)']);
      else if (d.tmax >= 90) drv.hvac.push([M.cool[1], `High ${Math.round(d.tmax)}°F (90–95)`]);
      else if (d.tmax >= 85) drv.hvac.push([M.cool[0], `High ${Math.round(d.tmax)}°F (85–90)`]);
      if (d.tmin <= 0) drv.hvac.push([M.heat[3], `Low ${Math.round(d.tmin)}°F, 0 or below`]);
      else if (d.tmin <= 10) drv.hvac.push([M.heat[2], `Low ${Math.round(d.tmin)}°F (0–10)`]);
      else if (d.tmin <= 20) drv.hvac.push([M.heat[1], `Low ${Math.round(d.tmin)}°F (10–20)`]);
      else if (d.tmin <= 25) drv.hvac.push([M.heat[0], `Low ${Math.round(d.tmin)}°F (20–25)`]);
      const month = +String(d.date).slice(5, 7);
      if (!coldSnapSeen && mean <= 40 && (month >= 10 || month <= 1)) { coldSnapSeen = true; drv.hvac.push([M.heat[4], `First cold snap (mean ${Math.round(mean)}°F ≤ 40)`]); }
      frzStreak = d.tmin <= 20 ? frzStreak + 1 : 0; hardStreak = (d.tmin <= 10 || d.tmax < 32) ? hardStreak + 1 : 0;
      if (hardStreak >= 2) drv.plumb.push([M.frz[2], 'Hard freeze: 2+ days ≤ 10°F']);
      else if (frzStreak >= 2) drv.plumb.push([M.frz[1], 'Hard freeze: 2+ nights ≤ 20°F']);
      else if (frzStreak === 1) drv.plumb.push([M.frz[0], `Single night ≤ 20°F`]);
      if (prevFrz >= 2 && d.tmax > 40 && frzStreak === 0) drv.plumb.push([M.frz[3], 'Thaw day after hard freeze (burst pipes found)']);
      prevFrz = frzStreak || (d.tmax > 40 ? 0 : prevFrz);
      if (d.precip >= 1.5) drv.plumb.push([M.rain[1], `${d.precip.toFixed(1)} in rain (sump / backups)`]);
      else if (d.precip >= 1) drv.plumb.push([M.rain[0], `${d.precip.toFixed(1)} in rain`]);
      if (d.gust >= 58) drv.elec.push([M.wind[1], `Gusts ${Math.round(d.gust)} mph, 58 or above`]);
      else if (d.gust >= 40) drv.elec.push([M.wind[0], `Gusts ${Math.round(d.gust)} mph (40–58)`]);
      if (d.code >= 95) drv.elec.push([M.ts, 'Thunderstorms (lightning / surge)']);
      const comb = list => { if (!list.length) return 1; const ms = list.map(x => x[0]).sort((a, b) => b - a); return ms[0] + ms.slice(1).reduce((s, m) => s + .5 * (m - 1), 0); };
      const m = { hvac: comb(drv.hvac), plumb: comb(drv.plumb), elec: comb(drv.elec) };
      const B = M.base; const idx = Math.round((B.hvac * m.hvac + B.plumb * m.plumb + B.elec * m.elec) / (B.hvac + B.plumb + B.elec) * 100);
      return { d, m, drv, idx };
    });
  }
  const col = v => v < 105 ? '#eef3ea' : v < 125 ? '#fff1d6' : v < 150 ? '#ffd3ae' : v < 200 ? '#ff9f73' : '#e8551a';
  function renderHeat() {
    const days = data[0].days;
    $('#heat').innerHTML = `<thead><tr><th></th>${days.map(x => `<th>${new Date(x.d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}<br><span>${new Date(x.d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></th>`).join('')}</tr></thead><tbody>${data.map((h, i) => `<tr><th class="h" scope="row">${esc(h.name)}</th>${h.days.map((x, j) => `<td><button type="button" class="cell${x.idx >= 200 ? ' x2' : ''}" style="background:${col(x.idx)}" data-c="${i},${j}" aria-pressed="${selCell[0] === i && selCell[1] === j}" aria-label="${esc(h.name)} ${wordDate(x.d.date)} index ${x.idx}">${x.idx}<small>${Math.round(x.d.tmax)}°/${Math.round(x.d.tmin)}°</small></button></td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#heat').onclick = e => { const b = e.target.closest('.cell'); if (!b) return; selCell = b.dataset.c.split(',').map(Number); renderHeat(); renderDrv(); renderCap(); };
  }
  function playbookFor(x) {
    const all = [...x.drv.hvac, ...x.drv.plumb, ...x.drv.elec].map(z => z[1]).join(' ');
    const P = model.play;
    const pick = /Hard freeze|0 or below|0–10/.test(all) ? P.playbook_extreme_cold_warning : /freeze|≤ 20|cold snap|20–25|10–20/i.test(all) ? P.playbook_freeze_warning : /95 or above|Heat wave/.test(all) ? P.playbook_extreme_heat_warning : /90–95|85–90/.test(all) ? P.playbook_heat_advisory : /rain/.test(all) ? P.playbook_flash_flood_warning : /Gusts/.test(all) ? P.playbook_high_wind_warning : /Thunder/.test(all) ? P.playbook_severe_thunderstorm_warning : null;
    return pick;
  }
  function renderDrv() {
    const h = data[selCell[0]], x = h.days[selCell[1]];
    const day = new Date(x.d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const drivers = [...x.drv.hvac.map(z => ['HVAC', ...z]), ...x.drv.plumb.map(z => ['Plumbing', ...z]), ...x.drv.elec.map(z => ['Electrical', ...z])];
    const pb = playbookFor(x);
    const actions = pb?.actions?.slice(0, 3) || ['Normal day: fill open capacity with member tune-ups and replacement estimates.', 'Push outbound renewal texts to members due this month.'];
    const bar = (n, v, c) => `<div class="tr"><span>${n}</span><span class="bar"><i style="width:${Math.min(100, (v - .8) / 2.2 * 100)}%;background:${c}"></i></span><b>×${v.toFixed(2)}</b></div>`;
    const flat = scen === 'live' && data.every(z => z.days.every(q => q.idx === 100));
    $('#drv').innerHTML = `${flat ? '<div class="why" style="margin-bottom:12px"><b>Calm week:</b> no weather driver crosses a threshold, so every hub sits at baseline. Pick a replay above to see a real cold snap or heat wave run through the same model.</div>' : ''}<div class="meta">${esc(h.name)} hub · ${esc(day)}${scen !== 'live' ? ' · historical replay' : ''}</div><h4>Service-Call Pressure Index</h4><div class="big${x.idx >= 125 ? ' hot' : ''}">${x.idx}</div><div class="meta">${x.idx === 100 ? 'Baseline demand' : `${x.idx > 100 ? '+' : ''}${x.idx - 100}% vs a normal day`} · ${Math.round(x.d.tmax)}°/${Math.round(x.d.tmin)}°F, gusts ${Math.round(x.d.gust || 0)} mph, ${(x.d.precip || 0).toFixed(2)} in</div>
      <div class="trades">${bar('HVAC', x.m.hvac, 'var(--pp-heat)')}${bar('Plumbing', x.m.plumb, 'var(--pp-plumb)')}${bar('Electrical', x.m.elec, 'var(--pp-elec)')}</div>
      <div class="lbl">Drivers</div>
      <ul>${drivers.length ? drivers.map(([t, m, s]) => `<li><b>${t} ×${m.toFixed(2)}</b> — ${esc(s)}</li>`).join('') : '<li>No weather driver above threshold.</li>'}</ul>
      <div class="lbl">Growth plan${pb ? ` · ${esc(pb.nws_event)}` : ''}</div>
      <ul>${actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  }
  function renderCap() {
    if (!data) return;
    const j = selCell[1]; const B = model.base;
    let mkt = 0; for (const h of data) { const x = h.days[j]; if (!x) continue; mkt += h.hh / 1e4 * (B.hvac * x.m.hvac + B.plumb * x.m.plumb + B.elec * x.m.elec); }
    let base = 0; for (const h of data) base += h.hh / 1e4 * (B.hvac + B.plumb + B.elec);
    const pp = mkt * share / 100, techs = pp / 3.5, extra = (mkt - base) * share / 100 / 3.5;
    $('#cap').innerHTML = `<div class="bk"><div class="l">Market reactive calls, 4 hubs</div><div class="v">${Math.round(mkt).toLocaleString('en-US')}<span class="sys-est">est.</span></div></div><div class="bk"><div class="l">Punctual Pros calls at ${share}% share</div><div class="v">${Math.round(pp)}<span class="sys-est">est.</span></div></div><div class="bk"><div class="l">Techs needed at 3.5 calls a day</div><div class="v">${Math.ceil(techs)}<span class="sys-est">est.</span> <span class="extra${extra > .5 ? ' up' : ''}">${extra > .5 ? `+${Math.ceil(extra)} vs normal` : 'normal'}</span></div></div>`;
  }
}

/* ── AI dispatcher transcript ─────────────────────────────────────────────── */
function transcript(ctx) {
  const { Data, Live, esc } = ctx;
  let low = null, cov = null, timer = [];
  const SCRIPT = () => [
    ['c', 'Hi, our heat stopped working and the house is getting cold. We have two little kids.'],
    ['a', 'I\'m sorry, let\'s get that fixed. Can I get the ZIP code at the house?', 0],
    ['c', '08753, Toms River.'],
    ['a', `Thanks. ${cov === 'nj' ? 'You\'re in our Horvath Home Services area' : 'You\'re in our service area'}, and I see you're a Comfort Club member, so there's no after-hours fee tonight.${low != null ? ` It's going down to about ${Math.round(low)}°F tonight.` : ''}`, 1],
    ['a', 'Is the thermostat blank, or is it on and just blowing cold air?', 2],
    ['c', 'It\'s on, but nothing is coming out of the vents.'],
    ['a', 'Okay. Please check that the furnace switch near the unit is on and the filter door is closed. If that doesn\'t fix it, I can book you the first window: 8 to 10 this morning, with Chris, our on-call HVAC tech.', 3],
    ['c', 'The switch is on. Yes, please book 8 to 10.'],
    ['a', 'Done. You\'ll get a text with Chris\'s photo and a live ETA when he\'s on the way. If the house drops below 55°F before then, call back and I\'ll page him right now.', 4],
  ];
  const ACTS = () => [
    ['Coverage check', `08753 → ${cov === 'nj' ? 'Ocean County, Horvath territory' : cov ? 'in territory' : 'checking…'} (ZIP-code model)`],
    ['Member lookup', 'Comfort Club active · after-hours fee waived'],
    ['Weather context', low != null ? `Tonight's low ${Math.round(low)}°F (Open-Meteo, live)` : 'Forecast lookup'],
    ['Triage script', 'No-heat, blower not running → likely ignition / limit switch'],
    ['Booked into ServiceTitan', 'Job #4011 · 8–10 AM · Chris H. · urgent, member priority · on-call tech paged'],
  ];
  const run = () => {
    timer.forEach(clearTimeout); timer = [];
    const S = SCRIPT(), A = ACTS();
    $('#msgs').innerHTML = ''; $('#acts').innerHTML = A.map(a => `<li><span class="ck"><svg class="ico"><use href="#i-check"/></svg></span><span><b>${esc(a[0])}</b><span class="d">${esc(a[1])}</span></span></li>`).join('');
    S.forEach((m, i) => timer.push(setTimeout(() => {
      const d = document.createElement('div'); d.className = 'm ' + m[0]; d.innerHTML = `<span class="who">${m[0] === 'a' ? 'ServiceOS AI' : 'Caller'}</span>${esc(m[1])}`; $('#msgs').appendChild(d);
      if (m[2] != null) $$('#acts li')[m[2]]?.classList.add('done');
    }, 300 + i * 1100)));
  };
  const ready = Promise.race([Promise.all([zipIndex(Data).then(idx => { cov = classifyZip(idx.get('08753')).s; }).catch(() => { }), Live.forecast(39.9528, -74.1967).then(f => { const t = f.find(d => !d.past); low = t?.tmin; }).catch(() => { })]), new Promise(r => setTimeout(r, 4000))]);
  const go = () => ready.then(run);
  $('#replay').onclick = go;
  $$('[data-tab="ai"]').forEach(b => b.addEventListener('click', () => setTimeout(go, 50)));
}

/* ── Output tiles (system KPI cards; `est` adds the estimate badge, `hi` the company accent) ── */
const kpi = (label, value, sub, est, cls = '') => `<div class="sys-kpi${cls === 'hi' ? '' : ''}${cls && cls !== 'hi' ? ' ' + cls : ''}"${cls === 'hi' ? ' data-co="pp"' : ''}><span class="sys-kpi-label">${label}</span><span class="sys-kpi-value">${value}${est ? '<span class="sys-est">est.</span>' : ''}</span>${sub ? `<span class="sys-kpi-sub">${sub}</span>` : ''}</div>`;

/* ── Membership economics ─────────────────────────────────────────────────── */
function membership() {
  const ids = ['mem', 'tech', 'price', 'churn', 'pull', 'mult']; const el = Object.fromEntries(ids.map(i => [i, $('#m-' + i)]));
  let boost = false;
  const fmtO = { mem: v => (+v).toLocaleString('en-US'), tech: v => v, price: v => '$' + (+v).toFixed(2), churn: v => v + '%', pull: v => '$' + v, mult: v => (+v).toFixed(1) + 'x' };
  const calc = churn => { const m = +el.mem.value, p = +el.price.value, pull = +el.pull.value; const arr = m * p * 12, cost = m * 140, gp = arr - cost + m * pull; const life = 1 / (churn / 100); const ltv = (p * 12 - 140 + pull) * life; return { arr, gp, ltv, life, val: gp * +el.mult.value }; };
  const upd = () => {
    ids.forEach(i => { setRange(el[i]); $('#o-' + i).textContent = fmtO[i](el[i].value); });
    const ch = +el.churn.value - (boost ? 5 : 0); const r = calc(Math.max(1, ch)); const r0 = calc(+el.churn.value);
    const den = +el.mem.value / +el.tech.value;
    $('#m-outs').innerHTML = kpi('Membership revenue a year', kfmt(r.arr), `${(+el.mem.value).toLocaleString('en-US')} × $${(+el.price.value).toFixed(2)} × 12`, true) + kpi('Member gross profit a year', kfmt(r.gp), 'Plan gross profit + repair pull-through', true) + kpi('Member lifetime value', money(r.ltv), `${r.life.toFixed(1)}-year average life at ${Math.max(1, ch)}% churn${boost ? ` · +${money(r.ltv - r0.ltv)} vs before` : ''}`, true) + kpi('Value of the member book', mm(r.val), `Gross profit × ${(+el.mult.value).toFixed(1)}x${boost ? ` · +${mm(r.val - r0.val, 2)} from retention` : ''}`, true, 'hi');
    $('#m-den').textContent = den.toFixed(0) + ' / tech';
    $('#m-fill').style.width = Math.min(100, den / 120 * 100) + '%';
    $('#m-ret').textContent = boost ? 'Remove retention boost' : 'Apply +5 pts retention';
  };
  ids.forEach(i => el[i].addEventListener('input', upd));
  $('#m-ret').onclick = () => { boost = !boost; upd(); };
  upd();
}

/* ── New-mover autopilot (lazy-loads deed feeds) ──────────────────────────── */
function movers(ctx) {
  const { Data, esc } = ctx;
  let res = null;
  const files = ['sales/pp_sales_pa_a', 'sales/pp_sales_pa_b', 'sales/pp_sales_nj'];
  const sl = ['resp', 'ticket', 'attach'].map(k => $('#n-' + k));
  const upd = () => {
    sl.forEach(setRange);
    $('#o-resp').textContent = (+sl[0].value).toFixed(1) + '%'; $('#o-ticket').textContent = '$' + sl[1].value; $('#o-attach').textContent = sl[2].value + '%';
    if (!res) { $('#n-outs').innerHTML = kpi('Year-one revenue from movers', '—', 'Appears once the deed feeds load', false, 'span2'); return; }
    const perMo = res.monthly; const booked = perMo * +sl[0].value / 100; const mem = booked * +sl[2].value / 100;
    $('#f4').textContent = Math.round(perMo).toLocaleString('en-US');
    $('#f5').textContent = Math.round(booked).toLocaleString('en-US');
    const rev = booked * 12 * +sl[1].value + mem * 12 * 239;
    $('#n-outs').innerHTML = kpi('First visits a year', Math.round(booked * 12).toLocaleString('en-US'), `${(+sl[0].value).toFixed(1)}% of mailed movers`, true) + kpi('New members a year', Math.round(mem * 12).toLocaleString('en-US'), `${sl[2].value}% attach on first visit`, true) + kpi('Year-one revenue from movers', kfmt(rev), `First tickets + $239 a year membership (illustrative plan price). Mail cost ≈ ${kfmt(perMo * 12 * 1.1)} at ~$1.10 a kit.`, true, 'hi span2');
  };
  sl.forEach(s => s.addEventListener('input', upd)); upd();
  const run = async () => {
    const idx = await zipIndex(Data).catch(() => null);
    const core = new Set(); if (idx) for (const [z, r] of idx) { const s = classifyZip(r).s; if (s === 'in' || s === 'nj') core.add(z); }
    const counties = new Set([...TERRITORY.PA, ...TERRITORY.NJ]);
    let total = 0, resid = 0, scored = 0, done = 0; const byC = {}; const span = { PA: [null, null], NJ: [null, null] }; const scoredBy = { PA: 0, NJ: 0 };
    $('#n-hint').textContent = 'Loading 3 county deed feeds (~77K transfers)…';
    for (const f of files) {
      let d; try { d = await Data.load(f); } catch { d = null; }
      done++; $('#lb').style.width = (done / files.length * 100) + '%';
      if (!d) continue;
      total += d.meta?.item_count || d.items?.length || 0; $('#f1').textContent = total.toLocaleString('en-US');
      for (const r of d.items || []) {
        if (!r.sale_date || r.sale_date < '2025-09-01') continue;
        if (r.use_type !== 'residential' || !counties.has(r.county)) continue;
        resid++;
        let s = 0; const z = String(r.zip || '');
        if (core.has(z)) s += 30;
        const yb = +r.year_built; s += yb && yb < 1980 ? 25 : yb && yb < 2005 ? 15 : yb ? 5 : 15;
        const pr = +r.price || 0; s += pr >= 150000 && pr <= 1500000 ? 20 : pr >= 50000 ? 5 : 0;
        if (r.builder_flag === true) s -= 30;
        if (r.arms_length === false) s -= 30;
        if (s >= 65) {
          scored++; byC[r.county] = (byC[r.county] || 0) + 1;
          const st = r.state === 'NJ' ? 'NJ' : 'PA'; scoredBy[st]++;
          const sp = span[st]; if (!sp[0] || r.sale_date < sp[0]) sp[0] = r.sale_date; if (!sp[1] || r.sale_date > sp[1]) sp[1] = r.sale_date;
        }
      }
      $('#f2').textContent = resid.toLocaleString('en-US'); $('#f3').textContent = scored.toLocaleString('en-US');
    }
    const months = sp => sp[0] ? Math.max(1, (new Date(sp[1]) - new Date(sp[0])) / 864e5 / 30.44) : 1;
    const monthly = scoredBy.PA / months(span.PA) + (scoredBy.NJ ? scoredBy.NJ / months(span.NJ) : 0);
    res = { monthly };
    const list = Object.entries(byC).sort((a, b) => b[1] - a[1]); const max = list[0]?.[1] || 1;
    $('#n-cty').innerHTML = list.map(([c, n]) => `<div class="tr"><span>${esc(c)}${TERRITORY.NJ.includes(c) ? ' NJ' : ''}</span><span class="bar"><i style="width:${n / max * 100}%;background:${TERRITORY.NJ.includes(c) ? 'var(--pp-nj)' : 'var(--co)'}"></i></span><b>${n.toLocaleString('en-US')}</b></div>`).join('') || '<p class="sys-muted">No transfers loaded.</p>';
    const d = v => v ? new Date(v + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    $('#n-hint').textContent = `${scored.toLocaleString('en-US')} scored transfers since Sept 1, 2025 · PA ${d(span.PA[0])} to ${d(span.PA[1])}, NJ ${d(span.NJ[0])} to ${d(span.NJ[1])}.`;
    upd();
  };
  const tgt = $('#movers');
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '200px' }); io.observe(tgt); } else run();
}

/* ── Value-creation math ──────────────────────────────────────────────────── */
function valueMath() {
  const ids = ['rev', 'ebitda', 'pts', 'mult', 'turns', 'inv']; const el = Object.fromEntries(ids.map(i => [i, $('#v-' + i)]));
  const out = { rev: v => '$' + (+v).toFixed(1) + 'M', ebitda: v => '$' + (+v).toFixed(1) + 'M', pts: v => (+v).toFixed(2) + ' pts', mult: v => (+v).toFixed(1) + 'x', turns: v => '+' + (+v).toFixed(1) + 'x', inv: v => '$' + (+v).toFixed(2) + 'M' };
  const oid = { rev: 'o-rev', ebitda: 'o-ebitda', pts: 'o-pts', mult: 'o-mult2', turns: 'o-turns', inv: 'o-inv' };
  const upd = () => {
    ids.forEach(i => { setRange(el[i]); $('#' + oid[i]).textContent = out[i](el[i].value); });
    const R = +el.rev.value, E0 = +el.ebitda.value, pts = +el.pts.value / 100, m = +el.mult.value, dm = +el.turns.value, inv = +el.inv.value;
    const dE = R * pts, E1 = E0 + dE, ev0 = E0 * m, a = dE * m, b = E1 * dm, ev1 = E1 * (m + dm), created = ev1 - ev0 - inv;
    const steps = [['EV today', 0, ev0, 'var(--sys-mute-2)', `${E0.toFixed(1)} × ${m.toFixed(1)}x`], ['EBITDA uplift', ev0, a, 'var(--co)', `+${dE.toFixed(2)}M × ${m.toFixed(1)}x`], ['Re-rating', ev0 + a, b, 'color-mix(in srgb,var(--co) 50%,var(--sys-surface))', `${E1.toFixed(2)}M × +${dm.toFixed(1)}x`], ['Investment', ev0 + a + b - inv, inv, 'var(--sys-bad)', `−${inv.toFixed(2)}M`], ['EV after', 0, ev1 - inv, 'var(--sys-good)', `net of spend`]];
    const lv = [ev0, ev0 + a, ev0 + a + b, ev0 + a + b - inv];
    const W = Math.max(360, Math.min(640, $('#wf').clientWidth || 640)), sm = W < 520, H = sm ? 260 : 300, pad = 34, top = Math.max(...steps.map(s => s[1] + s[2])) * 1.12, bw = (W - pad * 2) / steps.length * .62, gap = (W - pad * 2) / steps.length;
    const y = v => H - 40 - v / top * (H - 70);
    $('#wf').innerHTML = `<svg class="wf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Enterprise value bridge">${[0, .25, .5, .75, 1].map(f => `<line x1="${pad}" x2="${W - 8}" y1="${y(top * f)}" y2="${y(top * f)}" style="stroke:var(--sys-line)"/>`).join('')}${steps.map((s, i) => { const x = pad + i * gap + (gap - bw) / 2; const y0 = y(s[1] + s[2]), y1 = y(s[1]); const val = i === 3 ? -s[2] : s[2]; return `<rect x="${x}" y="${y0}" width="${bw}" height="${Math.max(2, y1 - y0)}" rx="6" style="fill:${s[3]}"/><text x="${x + bw / 2}" y="${y0 - 8}" text-anchor="middle" style="fill:var(--sys-ink);font-family:var(--sys-mono)" font-weight="600" font-size="${sm ? 12 : 14}">${val < 0 ? '−' : ''}$${Math.abs(val).toFixed(1)}M</text><text x="${x + bw / 2}" y="${H - 20}" text-anchor="middle" style="fill:var(--sys-ink-2);font-family:var(--sys-font)" font-weight="600" font-size="${sm ? 10.5 : 12}">${sm ? s[0].replace('EBITDA uplift', 'Uplift') : s[0]}</text>${sm ? '' : `<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle" style="fill:var(--sys-mute);font-family:var(--sys-mono)" font-size="10">${s[4]}</text>`}${i < steps.length - 1 ? `<line x1="${x + bw}" x2="${x + gap}" y1="${y(lv[i])}" y2="${y(lv[i])}" style="stroke:var(--sys-line-2)" stroke-dasharray="3 3"/>` : ''}}`; }).join('')}</svg>`;
    $('#v-res').innerHTML = kpi('EBITDA uplift', `+$${dE.toFixed(2)}M`, `${(+el.pts.value).toFixed(2)} pts × $${R.toFixed(1)}M`, true) + kpi('Exit multiple', `${(m + dm).toFixed(1)}x`, `${m.toFixed(1)}x + ${dm.toFixed(1)} turns`, true) + kpi('Equity value created', `+$${created.toFixed(1)}M`, `${(created / inv).toFixed(0)}× the ServiceOS spend`, true, 'hi');
    const vm = $('#v-math'); if (vm) vm.innerHTML = `<b>The arithmetic</b> <span class="sys-est">est.</span><br>EV today = $${E0.toFixed(1)}M EBITDA × ${m.toFixed(1)}x = $${ev0.toFixed(1)}M · new EBITDA = $${E0.toFixed(1)}M + ${(+el.pts.value).toFixed(2)} pts × $${R.toFixed(1)}M = $${E1.toFixed(2)}M · <b>multiple applied ${(m + dm).toFixed(1)}x</b> (${m.toFixed(1)}x today + ${dm.toFixed(1)} turns) · EV after = $${E1.toFixed(2)}M × ${(m + dm).toFixed(1)}x − $${inv.toFixed(2)}M = $${(ev1 - inv).toFixed(1)}M`;
  };
  ids.forEach(i => el[i].addEventListener('input', upd)); upd();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(upd, 150); });
}

/* ── Evidence + stack tables ──────────────────────────────────────────────── */
function evidence(ctx) {
  const { Data, esc } = ctx;
  Data.research('serviceos_evidence').then(d => {
    const it = d?.items || [];
    const host = u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return 'source'; } };
    const ve = it.filter(i => i.kind === 'valuation_evidence' && (i.applies_to || []).includes('pp'));
    $('#ev-body').innerHTML = ve.length ? ve.map(i => `<tr><td><b>${esc(prose(i.title))}</b><small>${esc(clip(prose(i.note || i.claim), 170))}</small></td><td class="sys-n">${i.metric_value != null ? esc(i.metric_value >= 1e8 ? '$' + (i.metric_value / 1e9).toFixed(1) + 'B' : String(i.metric_value)) : '—'}<small>${esc(clip(prose(i.metric_unit), 64))}</small></td><td class="sys-n" style="white-space:nowrap">${esc(wordDate(i.date))}</td><td><span class="conf ${esc(String(i.confidence || '').toLowerCase())}">${esc(String(i.confidence || '—').toLowerCase())}</span></td><td><a href="${esc(i.source_url)}" target="_blank" rel="noopener">${esc(host(i.source_url))}</a><small>${esc(clip(prose(i.source_name), 64))}</small></td></tr>`).join('') : '<tr><td colspan="5">Evidence is not available right now.</td></tr>';
    const vs = it.filter(i => i.kind === 'vendor_stack' && i.company === 'pp');
    const dec = v => /Avoca/.test(v) ? 'rent' : 'buy';
    const rows = vs.map(i => `<tr><td><b>${esc(i.category)}</b></td><td><b>${esc(i.vendor)}</b>${i.note ? `<small>${esc(clip(prose(i.note), 130))}</small>` : ''}</td><td><span class="dec ${dec(i.vendor)}">${dec(i.vendor) === 'rent' ? 'Rent (usage)' : 'Buy'}</span></td><td>${esc(prose(i.what_it_does))}</td><td>${esc(clip(prose(i.pricing_note), 150))}<small><a href="${esc(i.source_url)}" target="_blank" rel="noopener">${esc(host(i.source_url))}</a></small></td></tr>`);
    rows.push(`<tr><td><b>Demand forecasting</b></td><td><b>Pressure Index</b> (BSP portal)<small>Punctual Pros demand model, National Weather Service and Open-Meteo; already prototyped in the portal</small></td><td><span class="dec build">Build</span></td><td>7-day call forecast by hub and trade; drives staffing, on-call and parts staging.</td><td>Internal; free public feeds (Weatherbit optional)<small><a href="../../app.html#/pp/weather">portal view</a></small></td></tr>`);
    rows.push(`<tr><td><b>Customer acquisition</b></td><td><b>New-mover autopilot</b> (BSP portal)<small>County ArcGIS and NJ SR1A deed feeds</small></td><td><span class="dec build">Build</span></td><td>Deed → score → welcome mail → opt-in call; writes leads into ServiceTitan.</td><td>Internal + print and mail vendor (~$1.10 a kit<span class="sys-est">est.</span>)<small><a href="../../app.html#/pp/movers">portal view</a></small></td></tr>`);
    $('#stk-body').innerHTML = rows.join('') || '<tr><td colspan="5">Stack details are not available right now.</td></tr>';
    labelCells($('#ev-body')); labelCells($('#stk-body'));
  });
}

/* ── Roadmap ──────────────────────────────────────────────────────────────── */
function roadmap() {
  const start = new Date(2026, 10, 1); const mo = [...Array(12)].map((_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1).toLocaleDateString('en-US', { month: 'short' }) + (i === 0 || new Date(start.getFullYear(), start.getMonth() + i, 1).getMonth() === 0 ? " '" + String(new Date(start.getFullYear(), start.getMonth() + i, 1).getFullYear()).slice(2) : ''));
  const W = [
    ['Data spine & KPI baseline', 'PRG ops + Punctual Pros COO', 1, 2, '#3a4a5e', 'Gate: booking rate, ticket, members/tech measured'],
    ['AI dispatcher (Avoca) after-hours → 24/7', 'Punctual Pros call center + vendor', 2, 5, '#c2510f', 'Gate: +8 pts booking rate'],
    ['Good-better-best pricebook + tablet sales', 'Punctual Pros ops + Profit Rhino', 2, 6, '#b93a22', 'Gate: ticket +4% YoY'],
    ['Comfort Club engine (renewals, Podium)', 'Punctual Pros marketing + PRG', 3, 8, '#0f7a4b', 'Gate: members/tech +15'],
    ['Pressure Index → staffing', 'PRG data + Punctual Pros dispatch', 4, 9, '#1f5fc9', 'Gate: back-test r ≥ 0.6 on call history'],
    ['New-mover autopilot', 'PRG data + Punctual Pros marketing', 5, 10, '#1670b0', 'Gate: CAC below paid search'],
    ['AI coaching (Rilla) on replacements', 'Punctual Pros sales manager', 7, 12, '#9a5d00', 'Gate: +9% rel. close rate'],
    ['Add-on onboarding plan (60 days)', 'PRG M&A integration', 9, 12, '#0d1521', 'Gate: next add-on live on ServiceOS'],
  ];
  $('#gantt').innerHTML = `<div class="g-row h"><span style="text-align:left">Workstream · owner (est.)</span>${mo.map(m => `<span>${m}</span>`).join('')}</div>` + W.map(w => `<div class="g-row"><div class="g-l" style="grid-row:1;grid-column:1"><b>${w[0]}</b><small>${w[1]}</small></div><div style="grid-row:1;grid-column:${w[2] + 1} / ${w[3] + 2};display:flex;align-items:center;min-width:0"><div class="g-bar" style="background:${w[4]};flex:1" title="${w[5]}">M${w[2]}–M${w[3]}</div></div>${w[3] < 11 ? `<div class="g-gate" style="grid-row:1;grid-column:${w[3] + 2} / 14">${w[5]}</div>` : `<div class="g-gate" style="grid-row:1;grid-column:2 / ${w[2] + 1};text-align:right;margin:0 8px 0 0">${w[5]}</div>`}</div>`).join('') + `<p class="g-note">M1 = Nov 2026. Value timing (ServiceOS roadmap assumption): first EBITDA impact in months 6–12.<span class="sys-est">est.</span> Owners are proposed, not agreed.</p>`;
}

/* ── Risks ────────────────────────────────────────────────────────────────── */
function risks() {
  const R = [
    ['High', 'Franchisor constraints', 'Authority Brands sets brand standards and may mandate parts of the tech stack; royalties (~7.2–7.5% of revenue) cap margin upside.', 'Pilot with franchisor sign-off; build only in the layers the FDD leaves to the franchisee (data, dispatch logic, outreach).'],
    ['High', 'No Punctual Pros actuals yet', 'Every KPI baseline is an industry benchmark. Booking rate, members and ticket are not public.', 'Month 1–2 data spine sprint; replace every est. with ServiceTitan actuals before the investment committee.'],
    ['Medium', 'AI on the phone', 'A bad 2 a.m. call costs a member. Vendor booking lifts are unaudited.', 'After-hours first, human hand-off on urgency words, weekly call scoring, opt-out to a person on request.'],
    ['Medium', 'Cold outreach', 'Calling new movers cold is a poor first touch; mail first, then call the ones who respond.', 'Mail first; call only people who respond; do-not-contact lists synced daily.'],
    ['Medium', 'Technician adoption', 'Tablets, pricebooks and coaching fail if techs see them as surveillance.', 'Tie spiffs to good-better-best adoption; lead techs pilot first; coaching is opt-in for month one.'],
    ['Low', 'Model error in the Index', 'Most cold, plumbing and electrical multipliers are assumptions, not fitted elasticities.', 'Regress 12+ months of Punctual Pros booked calls on GHCN weather; publish error bands; staff to the band, not the point.'],
  ];
  $('#risk-grid').innerHTML = R.map(r => `<div class="sys-card risk"><span class="sev ${r[0].toLowerCase()}">${r[0]} risk</span><span class="sys-card-title">${r[1]}</span><span class="sys-card-body">${r[2]}</span><span class="sys-card-foot"><span><b>Mitigation:</b> ${r[3]}</span></span></div>`).join('');
}

/** '2026-10-06' → 'Oct 6, 2026'; '2026-10' → 'Oct 2026'; anything else passes through ('—' when empty). */
function wordDate(v) { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v || '').trim()); if (!m) return v ? String(v) : '—'; const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+m[2] - 1]; return m[3] ? `${mo} ${+m[3]}, ${m[1]}` : `${mo} ${m[1]}`; }

/* Dataset prose can carry file paths and evidence ids; readers get dataset names instead. */
let frameLabel = null;
const dsName = id => (frameLabel && frameLabel(id)) || String(id).replace(/_/g, ' ');
export function prose(v) {
  return String(v == null ? '' : v)
    .replace(/\bOur fetch of\b/g, 'Our read of').replace(/\bheadless\/composable builds\b/g, 'custom storefronts')
    .replace(/\s*Also in data\/[\w/.-]+?\.(?:json|csv)\.?/g, '')
    .replace(/(?:data\/)?(?:research\/|sales\/)?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\.(?:json|csv)/g, (m, id) => `the ${dsName(id)} data`)
    .replace(/(?<![\w@/.#:=$-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?![\w@/-])/g, (m, id) => `the ${dsName(id)} data`)
    .replace(/\s*\((?:see\s+)?(?:ve|kb|ra|ref|pn)-[a-z0-9-]+(?:\s*[,;]\s*(?:ve|kb|ra|ref|pn)-[a-z0-9-]+)*\)/gi, '')
    .replace(/\b(?:ve|kb|ra|ref)-(?:pp-)?[0-9a-z]+\b/g, '').replace(/\s*\(Live\.\w+\)/g, '')
    .replace(/\bmembership-dense platform\b/g, 'membership-dense company').replace(/\b\d{4}-\d{2}-\d{2}\b/g, m => wordDate(m)).replace(/\bBSP\b/g, 'BSP').replace(/\bPP's\b/g, "Punctual Pros'").replace(/\bPP\b/g, 'Punctual Pros').replace(/\bGBB\b/g, 'good-better-best').replace(/\s{2,}/g, ' ').replace(/\s+([.,;)])/g, '$1').trim();
}
function clip(v, n) { const t = String(v == null ? '' : v).trim(); if (t.length <= n) return t; const cut = t.slice(0, n); const sp = cut.lastIndexOf(' '); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:(\-–]+$/, '') + '…'; }

/* copy each column header onto its cells so phones can show the tables as stacked cards */
function labelCells(tbody) {
  const ths = [...(tbody?.closest('table')?.querySelectorAll('thead th') || [])].map(th => th.textContent.trim());
  tbody?.querySelectorAll('tr').forEach(tr => [...tr.children].forEach((td, i) => { if (!td.hasAttribute('colspan') && ths[i]) td.dataset.l = ths[i]; }));
}
