/* Punctual Pros concept site — interactions and live data.
   Dependencies (core.js Data/Fmt/Live, chat.js Chat) are injected by the page so this file never
   imports shared modules with a different cache stamp. */

/* ── Shared content (also used by serviceos.html) ─────────────────────────── */
export const TERRITORY = {
  PA: ['Lancaster', 'York', 'Dauphin', 'Cumberland', 'Berks', 'Lebanon', 'Franklin', 'Adams', 'Perry'],
  NJ: ['Ocean', 'Monmouth'],
};
export const HUBS = [
  { id: 'hq', name: 'HQ · East Hempfield', short: 'Lancaster', lat: 40.079, lon: -76.388, pos: 'r' },
  { id: 'york', name: 'York', short: 'York', lat: 39.9585, lon: -76.6587, pos: 'b' },
  { id: 'hbg', name: 'Harrisburg', short: 'Harrisburg', lat: 40.2677, lon: -76.7871, pos: 't' },
  { id: 'nj', name: 'Horvath · Beachwood', short: 'Beachwood', lat: 39.9284, lon: -74.2022, pos: 'r' },
];
export const FAQ = [
  { q: 'What areas do you serve?', a: '<p>Nine Central Pennsylvania counties from our East Hempfield headquarters, plus Ocean and Monmouth counties on the Jersey Shore through Horvath Home Services. Check your ZIP in the <a href="#coverage">coverage checker</a>.</p>', href: '#coverage' },
  { q: 'How does the on-time guarantee work?', a: '<p>You pick a two-hour window and we text a live ETA when the technician is on the way. If we arrive late, we pay you for the wait. <i>(Terms are illustrative.)</i></p>' },
  { q: 'How much does a service call cost?', a: '<p>We use upfront, flat-rate pricing. The technician diagnoses the problem, then shows good, better and best options with the full price before any work starts. Comfort Club members pay no diagnostic fee. <i>(Prices on this concept site are illustrative.)</i></p>' },
  { q: 'What is the Comfort Club membership?', a: '<p>A monthly plan with two HVAC tune-ups a year, repair discounts, no diagnostic or after-hours fees and priority scheduling. The <a href="#club">savings calculator</a> shows what it is worth to you.</p>', href: '#club' },
  { q: 'Do you offer financing for a new system?', a: '<p>Yes. Replacements can be spread over 5 to 10 years, subject to credit approval through a lending partner. Try the <a href="#financing">payment estimator</a>. We also file the utility rebates for you.</p>', href: '#financing' },
  { q: 'What rebates can I get for a heat pump or water heater?', a: '<p>In PA, PPL, FirstEnergy (Met-Ed) and UGI rebate heat pumps, furnaces and water heaters; in NJ, SAVEGREEN and JCP&amp;L do. The federal 25C credit ended on December 31, 2025. See the <a href="#rebates">live list</a>.</p>', href: '#rebates' },
  { q: 'Are you open nights, weekends and holidays?', a: '<p>Yes, 24/7/365 for no-heat, no-cool, leaks, backups and electrical hazards. After hours, our AI dispatcher can book a real slot and page the on-call technician immediately.</p>' },
  { q: 'Which brands are you?', a: '<p>Punctual Pros operates One Hour Heating &amp; Air Conditioning, Benjamin Franklin Plumbing and Mister Sparky franchises across 25 territories in Pennsylvania and New Jersey (2026 franchise disclosure documents). Horvath Home Services joined in December 2024.</p>' },
  { q: 'Do you install generators, EV chargers and panel upgrades?', a: '<p>Yes. Mister Sparky handles panel upgrades, surge protection, Level 2 EV chargers and whole-home standby generators, including permits and utility coordination.</p>' },
  { q: 'Are your technicians licensed and background-checked?', a: '<p>Every technician is licensed for their trade, background-checked and drug-tested, and trained on the same flat-rate pricebook. License numbers would be listed on every page (placeholders in this concept).</p>' },
  { q: 'Are you hiring technicians?', a: '<p>Yes. A recent Punctual Pros HVAC Service Technician posting in Lancaster listed $70,000–$120,000 a year. We also hire apprentices and pay for training. See <a href="#careers">careers</a>.</p>', href: '#careers' },
  { q: 'I own a home-services business. Would you acquire it?', a: '<p>We partner with respected HVAC, plumbing and electrical companies in PA, NJ, MD and DE. Horvath Home Services joined in 2024 and kept its name and team. <a href="#partner">Start a confidential conversation</a>.</p>', href: '#partner' },
  { q: 'What is ServiceOS?', a: '<p>ServiceOS is the software behind every visit: weather-aware capacity planning, a live dispatch board, an AI dispatcher for after-hours calls, membership automation and new-mover outreach. <a href="./serviceos.html">See how it works</a>.</p>', href: './serviceos.html' },
  { q: 'How do you prepare for storms and cold snaps?', a: '<p>Our dispatchers watch live National Weather Service alerts and a seven-day Service-Call Pressure Index. Before a freeze or a storm we stage technicians, stock generator and sump parts, and hold same-day slots for members. Check the <a href="#storm">storm-readiness panel</a>.</p>', href: '#storm' },
];
export const SUGGESTIONS = ['Do you serve 17601?', 'Is there a storm coming this week?', 'What does the Comfort Club include?', 'Do you offer financing?', 'Are you hiring technicians?', 'What is ServiceOS?'];

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
export const cleanCity = s => String(s || '').replace(/\s+(city|CDP|borough|township|village|town)$/i, '').trim();
export function miles(a, b, c, d) { const R = 3958.8, r = x => x * Math.PI / 180; const dl = r(c - a), dn = r(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
export function fillRange(el) { const p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--p', p + '%'); }

/** Classify a ZIP against the portal's coverage model. */
export function classifyZip(row) {
  if (!row) return { s: 'unk' };
  const county = String(row.county || '').replace(/ County$/, '');
  if (row.service_territory_flag === 1) return { s: 'in', county };
  if (row.state === 'NJ' && TERRITORY.NJ.includes(county)) return { s: 'nj', county };
  if (row.adjacent_to_service_territory === 1) return { s: 'adj', county };
  return { s: 'out', county };
}
export function nearestHub(row) {
  let best = null;
  for (const h of HUBS) { const d = miles(row.lat, row.lon, h.lat, h.lon); if (!best || d < best.d) best = { ...h, d }; }
  return best;
}
let _zipIdx = null;
export async function zipIndex(Data) {
  if (_zipIdx) return _zipIdx;
  const rows = await Data.load('pp_zips');
  _zipIdx = new Map(rows.map(r => [String(r.zip).padStart(5, '0'), r]));
  return _zipIdx;
}

/* ── Page init ────────────────────────────────────────────────────────────── */
/** Mounts every section and the floating assistant; returns the chat widget so the frame's Ask button opens it. */
export function init({ Data, Fmt, Live, Chat, esc, Frame }) {
  if (Frame?.humanizeText) humanizeText = Frame.humanizeText;
  const parts = [() => faq(esc), services, geo, () => booking(Data), () => coverage(Data, Fmt, esc), club, financing, () => rebates(Data, esc),
    () => storm(Data, Live, esc), () => careers(Data, esc), () => rationale(Data, esc)];
  for (const fn of parts) { try { fn(); } catch (e) { console.warn('section failed', e); } }
  try {
    return Chat.mount(null, { persona: 'pp', short_name: 'Punctual Pros', mode: 'floating', theme: 'light', faq: FAQ, suggestions: SUGGESTIONS });
  } catch (e) { console.warn('chat mount failed', e); return null; }
}

/* Service cards preselect the trade in the booking card. */
function services() {
  $$('.pp-svc[data-trade]').forEach(a => a.addEventListener('click', () => { const r = document.getElementById(a.dataset.trade); if (r) r.checked = true; setTimeout(() => $('#hero-zip')?.focus({ preventScroll: true }), 500); }));
}
/* Brand accent for canvas map layers (read from the system token, with a fallback). */
const coColor = () => (getComputedStyle(document.body).getPropertyValue('--co').trim() || '#f08a3c');
function faq() {
  const el = $('#faq-list'); if (!el) return;
  el.innerHTML = FAQ.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${f.q}<span class="pm" aria-hidden="true"><svg class="ico" style="width:16px;height:16px"><use href="#i-plus"/></svg></span></summary><div class="a">${f.a}</div></details>`).join('');
}
function toast(msg) {
  let t = $('#pp-toast');
  if (!t) { t = document.createElement('div'); t.id = 'pp-toast'; t.className = 'pp-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 3200);
}

/* Region chip (Parker & Sons geo bar pattern) */
function geo() {
  const R = { pa: { label: 'Central PA', phone: '(717) 555-0123', tel: '+17175550123', sub: 'Lancaster · York · Harrisburg · Reading' }, nj: { label: 'Jersey Shore', phone: '(732) 555-0148', tel: '+17325550148', sub: 'Ocean & Monmouth · Horvath Home Services' } };
  let cur = 'pa';
  const apply = () => { const r = R[cur]; $('#geo-lbl').textContent = r.label; $('#region-sub').textContent = r.sub; $$('[data-phone]').forEach(e => e.textContent = r.phone); $$('[data-phone-link]').forEach(e => e.href = 'tel:' + r.tel); };
  $('#geo').onclick = () => { cur = cur === 'pa' ? 'nj' : 'pa'; apply(); toast(`Showing ${R[cur].label}: phone and service details updated.`); };
  window.__ppRegion = k => { if (R[k] && k !== cur) { cur = k; apply(); } };
}

/* Hero booking card */
function booking(Data) {
  const zip = $('#hero-zip'), msg = $('#hero-zipmsg'), slots = $('#slots'), card = $('#book');
  // arrival windows from current Eastern time
  const hr = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(new Date())) % 24;
  const label = h => { const f = x => (x % 12 || 12); return `${f(h)}–${f(h + 2)} ${h + 2 >= 12 ? 'PM' : 'AM'}`; };
  const wins = []; for (const h of [8, 10, 12, 14, 16, 18]) if (h >= hr + 1) wins.push({ d: 'Today', h });
  for (const h of [8, 10, 12]) if (wins.length < 3) wins.push({ d: 'Tomorrow', h });
  const W = wins.slice(0, 3);
  $('#slots-live').textContent = W[0].d === 'Today' ? 'Slots open today' : 'First slot tomorrow';
  slots.innerHTML = W.map((w, i) => `<button type="button" class="slot" aria-pressed="${i === 0}" data-i="${i}">${w.d} <small>· ${label(w.h)}</small></button>`).join('');
  let sel = 0; slots.onclick = e => { const b = e.target.closest('.slot'); if (!b) return; sel = +b.dataset.i; $$('.slot', slots).forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
  const setMsg = (s, html) => { msg.dataset.s = s; msg.innerHTML = `<span class="dot"></span><span>${html}</span>`; };
  let status = null;
  const check = async () => {
    const z = zip.value.replace(/\D/g, '').slice(0, 5); zip.value = z; status = null;
    if (z.length < 5) { setMsg('', 'We serve 248 ZIP codes in Central PA plus Ocean &amp; Monmouth, NJ.'); return; }
    setMsg('', 'Checking our service map…');
    try {
      const idx = await zipIndex(Data); const row = idx.get(z); const c = classifyZip(row); status = c.s;
      if (c.s === 'in') { const h = nearestHub(row); setMsg('in', `<b>Yes, we serve ${cleanCity(row.city)}.</b> Closest crew: ${h.short} (~${Math.max(10, Math.round(h.d * 1.35 / 35 * 60))} min).`); window.__ppRegion?.('pa'); }
      else if (c.s === 'nj') { setMsg('nj', `<b>Yes, ${cleanCity(row.city)} is served by Horvath Home Services</b>, a Punctual Pros company.`); window.__ppRegion?.('nj'); }
      else if (c.s === 'adj') setMsg('adj', `<b>${cleanCity(row.city)}</b> is just outside our core area. We serve it by appointment.`);
      else if (c.s === 'out') setMsg('out', `<b>${cleanCity(row.city)}, ${row.state}</b> isn't in our area yet. Join the waitlist and we'll tell you when we expand.`);
      else setMsg('out', 'We don\'t have that ZIP on file. Call us and we\'ll confirm.');
    } catch { setMsg('', 'Coverage map unavailable right now. Call us and we\'ll confirm.'); }
  };
  zip.addEventListener('input', check);
  $('#book-go').onclick = async () => {
    if (zip.value.length < 5) { zip.focus(); setMsg('out', 'Enter your 5-digit ZIP to see times.'); return; }
    if (status == null) await check();
    const trade = $('input[name="trade"]:checked')?.value || 'Service';
    const w = W[sel];
    $('#done-h').textContent = status === 'out' || status === 'unk' ? 'You\'re on the expansion waitlist' : `${trade} · ${w.d} ${label(w.h)}`;
    card.classList.add('done'); $('#book-done').focus({ preventScroll: true });
  };
  $('#book-again').onclick = () => { card.classList.remove('done'); zip.focus(); };
}

/* Coverage: ZIP checker + Leaflet map */
function coverage(Data, Fmt, esc) {
  const input = $('#cov-zip'), res = $('#zipres');
  let map = null, layer = null, rowsAll = null;
  const show = async z => {
    z = String(z || '').replace(/\D/g, '').slice(0, 5); input.value = z;
    if (z.length < 5) { res.innerHTML = '<h4>Enter a 5-digit ZIP</h4>'; return; }
    try {
      const idx = await zipIndex(Data); const row = idx.get(z); const c = classifyZip(row);
      if (!row) { res.innerHTML = `<span class="st out">Not on file</span><h4>${esc(z)}</h4><p>That ZIP isn't in our service model. Call us and we'll confirm coverage.</p>`; return; }
      const h = nearestHub(row); const mins = Math.max(10, Math.round(h.d * 1.35 / 35 * 60));
      const label = { in: 'In our core area', nj: 'Horvath Home Services', adj: 'By appointment', out: 'Not yet served' }[c.s];
      const blurb = { in: 'Same-day and emergency service. Members get front-of-line scheduling.', nj: 'Served by Horvath Home Services, the Jersey Shore team that joined Punctual Pros in December 2024.', adj: 'Just outside our core map. We book these visits with a wider arrival window.', out: 'We\'re expanding. Leave your details and we\'ll tell you when we arrive.' }[c.s];
      res.innerHTML = `<span class="st ${c.s}">${label}</span><h4>${esc(cleanCity(row.city))}, ${esc(row.state)} <span class="z">${esc(z)}</span></h4><p>${blurb}</p><dl><div><dt>County</dt><dd>${esc(c.county)}</dd></div><div><dt>Nearest shop</dt><dd>${esc(h.short)}</dd></div><div><dt>Drive time</dt><dd>${c.s === 'out' ? '—' : '~' + mins + ' min<span class="sys-est">est.</span>'}</dd></div></dl>`;
      if (map && row.lat) map.flyTo([row.lat, row.lon], 10, { duration: .8 });
    } catch { res.innerHTML = '<h4>Coverage data unavailable</h4>'; }
  };
  $('#cov-go').onclick = () => show(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') show(input.value); });
  input.addEventListener('input', () => { if (input.value.replace(/\D/g, '').length === 5) show(input.value); });
  $$('.quick button').forEach(b => b.onclick = () => show(b.dataset.zip));

  // stats + map (lazy)
  (async () => {
    try {
      const idx = await zipIndex(Data); rowsAll = [...idx.values()];
      const core = rowsAll.filter(r => r.service_territory_flag === 1);
      const nj = rowsAll.filter(r => classifyZip(r).s === 'nj');
      const hh = [...core, ...nj].reduce((s, r) => s + (r.housing_units || 0), 0);
      const coreHH = core.reduce((s, r) => s + (r.housing_units || 0), 0);
      $('#st-zips').textContent = core.length; $('#st-nj').textContent = nj.length; $('#st-hh').textContent = Fmt.compact(hh);
      $('#trust-homes').textContent = `~${(coreHH / 1e6).toFixed(1)}M`;
    } catch { /* keep static fallbacks */ }
  })();
  const mapEl = $('#map');
  const build = async () => {
    if (map || !window.L) return;
    const idx = await zipIndex(Data).catch(() => null); if (!idx) return;
    map = L.map(mapEl, { center: [40.1, -75.9], zoom: 8, zoomSnap: 0.25, zoomControl: true, scrollWheelZoom: false, preferCanvas: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16, pane: 'shadowPane', opacity: .85 }).addTo(map);
    const rend = L.canvas({ padding: .5 });
    layer = L.layerGroup().addTo(map);
    const pts = []; const COL = { in: coColor(), nj: '#2b5fab', adj: '#c9bba6' };
    for (const r of idx.values()) {
      const c = classifyZip(r); if (!COL[c.s] || r.lat == null) continue;
      const hu = r.housing_units || 0; const rad = c.s === 'adj' ? 3.5 : Math.max(4, Math.min(11, Math.sqrt(hu) / 12));
      const m = L.circleMarker([r.lat, r.lon], { renderer: rend, radius: rad, color: c.s === 'adj' ? '#b3a48c' : '#fff', weight: c.s === 'adj' ? .5 : 1, fillColor: COL[c.s], fillOpacity: c.s === 'adj' ? .55 : .85 });
      m.bindPopup(`<b>${esc(r.zip)} · ${esc(cleanCity(r.city))}</b><br>${esc(c.county)} County, ${esc(r.state)}<br>${Fmt.num(hu)} housing units<br><a href="#coverage" data-pz="${esc(r.zip)}">Check this ZIP →</a>`);
      m.on('click', () => show(r.zip));
      m.addTo(layer); if (c.s !== 'adj') pts.push([r.lat, r.lon]);
    }
    for (const h of HUBS) {
      if (mapEl.clientWidth < 520 && (h.id === 'york' || h.id === 'hbg')) { L.circleMarker([h.lat, h.lon], { radius: 6, color: '#ffc23d', weight: 3, fillColor: '#13202f', fillOpacity: 1 }).bindTooltip(h.name).addTo(map); continue; }
      const narrow = mapEl.clientWidth < 520; const lab = { r: 'left:14px;top:-10px', b: 'left:-30px;top:14px', t: 'left:-40px;top:-34px', l: 'right:-12px;top:-36px' }[narrow && h.id === 'nj' ? 'l' : narrow && h.id === 'hq' ? 'b' : h.pos];
      const ic = L.divIcon({ className: '', html: `<div style="position:relative"><span style="position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:#13202f;border:3px solid #ffc23d;box-shadow:0 2px 6px rgba(0,0,0,.3)"></span><span style="position:absolute;${lab};font:700 11.5px var(--sys-font);background:#13202f;color:#fff;padding:3px 7px;border-radius:6px;white-space:nowrap">${esc(h.name)}</span></div>`, iconSize: [0, 0] });
      L.marker([h.lat, h.lon], { icon: ic, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
    setTimeout(() => map.invalidateSize(), 120);
  };
  const tryBuild = () => { if (window.L) build(); else setTimeout(tryBuild, 150); };
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); tryBuild(); } }, { rootMargin: '300px' }); io.observe(mapEl); } else tryBuild();
}

/* Comfort Club savings calculator */
export const PLANS = {
  comfort: { name: 'Comfort', mo: 14.95, disc: .15, extras: 0 },
  total: { name: 'Total Home', mo: 24.95, disc: .20, extras: 129 + 119 },
};
export function clubSavings(plan, sys, visits, ticket) {
  const P = PLANS[plan];
  const tune = 2 * 129 * sys + P.extras;
  const disc = P.disc * visits * ticket;
  const diag = 89 * visits;
  const after = .25 * visits * 99;
  const fee = P.mo * 12;
  return { tune, disc, diag, after, fee, net: tune + disc + diag + after - fee };
}
function club() {
  let plan = 'comfort';
  const sys = $('#c-sys'), vis = $('#c-visits'), tic = $('#c-ticket');
  const upd = () => {
    [sys, vis, tic].forEach(fillRange);
    $('#o-sys').textContent = sys.value; $('#o-visits').textContent = vis.value; $('#o-ticket').textContent = money(tic.value);
    const r = clubSavings(plan, +sys.value, +vis.value, +tic.value);
    $('#c-save').textContent = (r.net < 0 ? '−' : '') + money(Math.abs(r.net));
    const parts = [['Tune-ups and inspections included', r.tune, 'var(--pp-sun)'], [`Member discount on repairs (${Math.round(PLANS[plan].disc * 100)}%)`, r.disc, 'var(--co)'], ['Diagnostic fees waived', r.diag, 'color-mix(in srgb,var(--co) 55%,var(--sys-ink))'], ['After-hours fees waived', r.after, 'color-mix(in srgb,var(--pp-sun) 55%,var(--sys-surface))']];
    const tot = parts.reduce((s, p) => s + p[1], 0) || 1;
    $('#c-stack').innerHTML = parts.map(p => `<i style="width:${p[1] / tot * 100}%;background:${p[2]}"></i>`).join('');
    $('#c-brk').innerHTML = parts.map(p => `<div><span><i style="background:${p[2]}"></i>${p[0]}</span><b>+${money(p[1])}</b></div>`).join('') + `<div class="neg"><span>${PLANS[plan].name} plan (${money(r.fee)}/yr)</span><b>−${money(r.fee)}</b></div>`;
  };
  [sys, vis, tic].forEach(i => i.addEventListener('input', upd));
  $$('.tier').forEach(t => t.onclick = () => { plan = t.dataset.plan; $$('.tier').forEach(x => x.setAttribute('aria-pressed', String(x === t))); upd(); });
  upd();
  const f = clubSavings('comfort', 1, 2, 420); $('#float-save').textContent = money(f.net) + ' saved';
}

/* Financing estimator */
function financing() {
  const price = $('#f-price'); let term = 120, apr = 7.99;
  const upd = () => {
    fillRange(price); const P = +price.value; $('#o-price').textContent = money(P);
    const r = apr / 100 / 12; const pay = r ? P * r / (1 - Math.pow(1 + r, -term)) : P / term;
    $('#f-pay').innerHTML = `${money(pay)}<small>/mo</small>`;
    $('#f-tot').innerHTML = `${term} payments<br>${apr}% APR · total ${money(pay * term)}`;
  };
  const seg = (id, cb) => { const el = $(id); el.onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('button', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); cb(+b.dataset.v); upd(); }; };
  seg('#f-term', v => term = v); seg('#f-apr', v => apr = v);
  price.addEventListener('input', upd); upd();
}

/* Rebates from pp_market incentives */
function rebates(Data, esc) {
  const el = $('#reb-list'); let items = []; let st = 'PA';
  const render = () => {
    const list = items.filter(i => st === 'ALL' || i.state === st || i.state === 'US');
    if (!list.length) { el.innerHTML = '<p class="sys-muted">No programs on file for this filter.</p>'; return; }
    el.innerHTML = list.map(i => {
      const exp = /expired|ended|closed|lapsed/i.test(i.status || '');
      const amt = i.amount_max ? `up to $${Number(i.amount_max).toLocaleString('en-US')}` : (i.amount_usd ? String(i.amount_usd).slice(0, 24) : 'Varies');
      return `<div class="reb${exp ? ' exp' : ''}"><h4>${esc(i.name)}</h4><span class="amt">${esc(amt)}</span><p>${esc(i.measure || '')}${i.status ? ` · <b>${esc(String(i.status).split(/[-–(]/)[0].trim())}</b>` : ''}${i.source_url ? ` · <a href="${esc(i.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</p></div>`;
    }).join('');
  };
  $('#reb-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; st = b.dataset.st; $$('#reb-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); };
  Data.research('pp_market').then(d => {
    items = (d?.items || []).filter(i => i.kind === 'incentive');
    const rank = i => /expired|ended|closed|lapsed/i.test(i.status || '') ? 3 : /not launched|pending|paused|waitlist/i.test(i.status || '') ? 2 : /active|open/i.test(i.status || '') ? 0 : 1;
    items.sort((a, b) => (rank(a) - rank(b)) || ((b.amount_max || 0) - (a.amount_max || 0)));
    if (!items.length) { el.innerHTML = '<p class="sys-muted">Rebate data is not available right now.</p>'; return; }
    render();
  });
}

/* Storm readiness: NWS alerts + 7-day forecast */
const FC_HUBS = { lancaster: { name: 'Lancaster', lat: 40.038, lon: -76.3057 }, york: { name: 'York', lat: 39.9625, lon: -76.7277 }, harrisburg: { name: 'Harrisburg', lat: 40.2663, lon: -76.8861 }, toms: { name: 'Toms River', lat: 39.9528, lon: -74.1967 } };
export function wxIcon(code) { if (code >= 95) return 'i-storm'; if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'i-snowc'; if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'i-rain'; if (code <= 1) return 'i-sun'; return 'i-cloud'; }
export function homeRisk(d, prevCold) {
  if (d.tmin != null && d.tmin <= 20) return { c: 'cold', t: 'Pipe freeze' };
  if (d.tmax != null && d.tmax >= 90) return { c: 'heat', t: 'AC strain' };
  if (d.precip != null && d.precip >= 1) return { c: 'wet', t: 'Sump & drains' };
  if (d.gust != null && d.gust >= 40) return { c: 'wind', t: 'Outage risk' };
  if (d.tmin != null && d.tmin <= 32) return { c: 'cold', t: 'Frost night' };
  if (!prevCold && d.tmax != null && (d.tmax + d.tmin) / 2 <= 45) return { c: 'cold', t: 'Heat kicks on' };
  return { c: 'ok', t: 'Normal' };
}
export async function territoryAlerts(Data, Live) {
  const dm = await Data.research('pp_demand_model').catch(() => null);
  const zones = (dm?.items || []).filter(i => i.component === 'nws_zone' && (i.pp_territory_tier === 'core' || i.pp_territory_tier === 'horvath_nj'));
  const ugc = new Set(zones.flatMap(z => z.all_ugcs || []));
  const names = { PA: TERRITORY.PA, NJ: TERRITORY.NJ };
  const [pa, nj] = await Promise.all([Live.nwsAlerts('PA').catch(() => null), Live.nwsAlerts('NJ').catch(() => null)]);
  if (!pa && !nj) throw new Error('NWS unavailable');
  const all = [...(pa || []), ...(nj || [])];
  const uniq = new Map(all.map(a => [a.id, a]));
  const inT = [], out = [];
  for (const a of uniq.values()) {
    const byZone = ugc.size && (a.zones || []).some(z => ugc.has(z));
    const byName = (a.areas || []).some(x => names[a.state]?.some(c => new RegExp(`(^|\\s)${c}(,|$|\\s)`).test(x)));
    (byZone || byName ? inT : out).push(a);
  }
  return { inT, out, total: uniq.size, at: new Date() };
}
export const alertLevel = list => !list.length ? 'ok' : list.some(a => /warning/i.test(a.event) || /severe|extreme/i.test(a.severity || '')) ? 'warn' : 'watch';
function storm(Data, Live, esc) {
  const bar = $('#stormbar'), msg = $('#storm-msg'), src = $('#storm-src'), box = $('#alerts'), meta = $('#alert-meta');
  const t = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  territoryAlerts(Data, Live).then(({ inT, out, total, at }) => {
    const lvl = alertLevel(inT); bar.dataset.level = lvl;
    src.textContent = `National Weather Service · updated ${t(at)} ET`;
    const outEv = [...new Set(out.map(a => a.event))].slice(0, 2).join(' and ');
    if (!inT.length) msg.innerHTML = `<b>All clear across our 11 counties.</b> ${out.length ? `${out.length} weather alert${out.length > 1 ? 's' : ''} elsewhere in PA and NJ (${esc(outEv)}). ` : ''}<a href="#book">Book a tune-up →</a>`;
    else { const a = inT[0]; msg.innerHTML = `<b>${esc(a.event)}</b> for ${esc((a.areas || []).slice(0, 3).join(', '))}${inT.length > 1 ? ` (+${inT.length - 1} more)` : ''}. We're staging crews now. <a href="#storm">What to do →</a>`; }
    meta.textContent = `${inT.length} in territory · ${total} statewide`;
    const card = (a, cls) => `<div class="alert ${cls}"><span class="sv"></span><div><h4>${esc(a.event)}</h4><p>${esc((a.areas || []).slice(0, 4).join(', '))}${(a.areas || []).length > 4 ? '…' : ''}${a.ends ? ` · until ${esc(new Date(a.ends).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }))}` : ''}</p></div></div>`;
    box.innerHTML = inT.length ? inT.slice(0, 5).map(a => card(a, /warning/i.test(a.event) ? 'warn' : '')).join('')
      : `<div class="alert ok"><span class="sv"></span><div><h4>No active alerts in our service area</h4><p>Checked ${total} live National Weather Service alerts across Pennsylvania and New Jersey at ${esc(t(at))} ET.</p></div></div>` + (out.length ? `<p class="near">Nearby, outside our counties</p>` + out.slice(0, 3).map(a => card(a, '')).join('') : '');
  }).catch(() => {
    bar.dataset.level = 'ok'; msg.innerHTML = 'Live weather alerts are unavailable right now. <b>Our phones are open 24/7.</b>'; src.textContent = 'National Weather Service · offline';
    box.innerHTML = '<div class="alert"><span class="sv"></span><div><h4>Alert feed unavailable</h4><p>The National Weather Service API did not respond. Try again in a few minutes.</p></div></div>'; meta.textContent = '—';
  });

  const days = $('#days'), todo = $('#todo');
  const load = async key => {
    const h = FC_HUBS[key]; days.innerHTML = '<div class="skel" style="height:150px;grid-column:1/-1"></div>';
    try {
      const fc = (await Live.forecast(h.lat, h.lon)).filter(d => !d.past).slice(0, 7);
      let cold = false; const risks = [];
      days.innerHTML = fc.map(d => {
        const r = homeRisk(d, cold); if (r.t === 'Heat kicks on') cold = true; if (r.c !== 'ok') risks.push({ ...r, d });
        const dn = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        return `<div class="day"><div class="dn">${dn}</div><svg class="ico wx" aria-hidden="true"><use href="#${wxIcon(d.code)}"/></svg><div class="hi">${Math.round(d.tmax)}°</div><div class="lo">${Math.round(d.tmin)}°</div><div class="risk ${r.c}">${r.t}</div></div>`;
      }).join('');
      const tips = { 'Pipe freeze': 'Open sink cabinets on exterior walls and drip faucets on the coldest night.', 'Frost night': 'First frost on the way. Have the furnace checked before you need it.', 'Heat kicks on': 'Your heat will run for the first time this season. A tune-up catches cracked heat exchangers and CO risks.', 'AC strain': 'Rinse the outdoor unit and set the thermostat no lower than 74°F during the peak.', 'Sump & drains': 'Test the sump pump (pour in a bucket of water) and clear downspouts.', 'Outage risk': 'Run your generator\'s self-test and keep phones charged.' };
      const seen = new Set(); const list = risks.filter(r => !seen.has(r.t) && seen.add(r.t)).slice(0, 3);
      todo.innerHTML = (list.length ? list.map(r => `<li><svg class="ico"><use href="#i-check"/></svg><span><b>${new Date(r.d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}:</b> ${tips[r.t]}</span></li>`).join('') : `<li><svg class="ico"><use href="#i-check"/></svg><span><b>A calm week in ${esc(h.name)}.</b> The best time to book maintenance is before the weather turns.</span></li>`);
    } catch { days.innerHTML = '<p class="sys-muted" style="grid-column:1/-1">Forecast unavailable right now.</p>'; todo.innerHTML = ''; }
  };
  $('#hub-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#hub-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); load(b.dataset.hub); };
  load('lancaster');
}

/* Careers: wages + pipeline from pp_market */
function careers(Data, esc) {
  $('#apply-btn').onclick = e => { e.preventDefault(); toast('Concept demo: applications would route to the ATS with a 60-second mobile form.'); };
  Data.research('pp_market').then(d => {
    const it = d?.items || [];
    const wages = it.filter(i => /Trade wages/.test(i.name || '') && i.wage_median_hvac).map(i => ({ n: (i.geography || '').split('(')[0].replace(/, PA MSA|-Jersey City MSA| MSA/g, '').replace('New York-Newark', 'NY–N. Jersey').trim(), v: +i.wage_median_hvac }));
    const post = it.find(i => /Punctual Pros posts HVAC/.test(i.name || ''));
    const lo = 70000, hi = 120000; const max = 125000;
    if (!wages.length) { $('#wage').innerHTML = '<p class="sys-muted">Wage data not yet available.</p>'; return; }
    wages.sort((a, b) => b.v - a.v);
    $('#wage').innerHTML = `<div class="wrow pp"><span>Punctual Pros</span><span class="bar"><i style="left:${lo / max * 100}%;width:${(hi - lo) / max * 100}%"></i></span><span class="val">$70–120K</span></div>` + wages.map(w => `<div class="wrow"><span>${esc(w.n)}</span><span class="bar"><i style="width:${w.v / max * 100}%"></i></span><span class="val">$${Math.round(w.v / 1000)}K</span></div>`).join('');
    $('#wage-meta').textContent = 'HVAC technicians · posted range vs BLS median';
    const stv = it.find(i => /Thaddeus Stevens College builds/.test(i.name || ''));
    const hp = it.find(i => /Penn Heat Pump Pathways/.test(i.name || ''));
    const kpi = (v, l) => `<div class="sys-kpi"><span class="sys-kpi-label">${l}</span><span class="sys-kpi-value">${v}</span></div>`;
    $('#pipe').innerHTML = kpi(post ? '$70–120K' : '—', 'Posted HVAC tech range, Lancaster') + kpi(stv ? '1,491' : '—', 'Thaddeus Stevens enrollment (875 in 2013)') + kpi(hp ? '$4.9M' : '—', 'PA heat-pump training grant, 2026');
  });
}

/* Design rationale from the design-references dataset */
const KPI_MAP = {
  'ref-pp-sila': 'Inbound seller conversations / quarter → lower entry multiples on add-ons',
  'ref-pp-parker': 'Web-to-booking conversion and membership attach rate',
  'ref-pp-anyhour': 'ZIP-qualified sessions → online booking share; fewer out-of-area calls',
  'ref-pp-frankgay': 'Storm-week emergency share and review velocity',
};
const PRINCIPLE = { 'ref-pp-sila': 'Make selling to us a front-door path', 'ref-pp-parker': 'Proof and action at the moment of intent', 'ref-pp-anyhour': 'Qualify by ZIP and trade in one click', 'ref-pp-frankgay': 'Tie demand to the weather, keep the heritage' };
/** Strip any mention of the reference company from dataset prose (principle-only rationale). */
const unbrand = (r, t) => {
  const parts = String(r.name || '').split(/[()]/).map(n => n.trim()).filter(Boolean);
  const names = [...new Set([...parts, ...parts.map(n => n.split(/\s+/)[0]).filter(n => n.length >= 4)])].sort((a, b) => b.length - a.length);
  let s = String(t ?? '');
  for (const n of names) { const rx = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s = s.replace(new RegExp(`\\s*\\([^)]*\\b${rx}\\b[^)]*\\)`, 'g'), '').replace(new RegExp(`\\b${rx}(?:'s)?\\b`, 'g'), 'the reference'); }
  return s;
};
const WHERE = { 'ref-pp-sila': '#partner', 'ref-pp-parker': '#book', 'ref-pp-anyhour': '#coverage', 'ref-pp-frankgay': '#storm' };
/* Dataset prose uses analyst shorthand; spell the names out for readers. */
let humanizeText = t => t;
const plain = t => humanizeText(String(t ?? '')).replace(/\bBSP\b/g, 'BSP').replace(/\bPP's\b/g, "Punctual Pros'").replace(/\bPP\b/g, 'Punctual Pros');
function rationale(Data, esc) {
  const grid = $('#ref-grid'), body = $('#score-body');
  Promise.all([Data.research('design_refs'), Data.research('serviceos_evidence')]).then(([d, ev]) => {
    const refs = (d?.items || []).filter(i => (Array.isArray(i.applies_to) ? i.applies_to : [i.applies_to]).includes('pp'));
    grid.innerHTML = refs.length ? refs.map(r => `<article class="sys-card ref"><span class="sys-card-label">Principle</span><h3 class="sys-card-title">${esc(PRINCIPLE[r.id] || plain(unbrand(r, r.elements_to_borrow?.[0]?.element)))}</h3><div class="borrow">${(r.elements_to_borrow || []).slice(0, 2).map(e => `<div><b>${esc(plain(unbrand(r, e.element)))}</b></div>`).join('')}</div><span class="sys-card-foot"><a href="${WHERE[r.id] || '#top'}">Moves: ${esc(KPI_MAP[r.id] || 'Booked-call rate')}</a></span></article>`).join('')
      : '<p class="sys-muted">Design references are not available right now.</p>';
    const kb = id => (ev?.items || []).find(i => i.id === id);
    const rows = [
      ['Inbound call booking rate (HVAC)', kb('kb-pp-1'), v => `${v.baseline}%`, v => `${v.target}%`, 'Sticky phone + Book now, 30-second booking card, after-hours AI dispatcher'],
      ['Average ticket growth (YoY)', kb('kb-pp-2'), v => `${v.baseline}%`, v => `${v.target}%`, 'Good / better / best pricing promise, financing estimator, rebates list'],
      ['Active members per technician', kb('kb-pp-3'), () => 'not disclosed', v => `~${v.target}`, 'Comfort Club calculator, membership in every service card'],
      ['In-home replacement close rate', kb('kb-pp-4'), () => 'current', v => `+${v.target}% rel.`, 'Upfront price on tablet + coaching (ServiceOS)'],
    ];
    body.innerHTML = rows.map(([k, v, b, t, w]) => `<tr><td>${esc(k)}</td><td class="sys-n" data-l="Today">${v ? esc(b(v)) : '—'}</td><td class="sys-n" data-l="Target">${v ? `${esc(t(v))}<span class="sys-est">est.</span>` : '—'}</td><td data-l="Moved by">${esc(w)}</td><td data-l="Source">${v ? `<a href="${esc(v.source_url)}" target="_blank" rel="noopener">${esc(new URL(v.source_url).hostname.replace('www.', ''))}</a>` : '—'}</td></tr>`).join('');
  });
}
