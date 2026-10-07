/* Frontline Managed Services — concept site runtime (shared by index.html and firmos.html) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
/* Frontline accent, read from the design-system token so JS-drawn marks match the page. */
const tok = (n, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch { return d; } };
export const ACCENT = tok('--co-fl', '#9d7bff');
const money = n => '$' + (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(Math.abs(n) >= 1e8 ? 0 : 1) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'K' : Math.round(n));
const num = n => Math.round(n).toLocaleString('en-US');

/* ── Security posture questions (shared with FirmOS score card) ─────────── */
export const QUESTIONS = [
  { id: 'mfa', w: 12, q: 'MFA is enforced for every attorney and staff account', d: 'Including email, VPN, remote desktop and the DMS', fix: 'Enforce phishing-resistant MFA and conditional access', svc: 'Cybersecurity' },
  { id: 'edr', w: 12, q: 'Every endpoint runs EDR with 24/7 managed detection and response', d: 'A human analyst can isolate a laptop at 2 a.m.', fix: 'Deploy EDR with a 24/7 SOC behind it', svc: 'Cybersecurity · MDR' },
  { id: 'bak', w: 12, q: 'Backups of the DMS and billing system are immutable and restore-tested', d: 'iManage or NetDocuments, Elite or Aderant, tested in the last 6 months', fix: 'Add immutable copies and a quarterly restore test', svc: 'Infrastructure' },
  { id: 'mail', w: 10, q: 'Email is filtered for phishing and DMARC is set to quarantine or reject', d: 'Wire-fraud and business-email-compromise defense', fix: 'Move DMARC to enforcement and add impersonation filtering', svc: 'Cybersecurity' },
  { id: 'patch', w: 10, q: 'Critical patches are applied within 14 days', d: 'Operating systems, browsers, VPN appliances, practice apps', fix: 'Set a 14-day critical patch SLA with monthly reporting', svc: 'Infrastructure' },
  { id: 'priv', w: 8, q: 'Admin accounts are separate from daily accounts and granted just in time', d: 'No one browses the web as a domain admin', fix: 'Split admin identities and add just-in-time elevation', svc: 'Cybersecurity' },
  { id: 'train', w: 8, q: 'Attorneys and staff get phishing simulations at least quarterly', d: 'With follow-up training for anyone who clicks', fix: 'Run quarterly simulations with micro-training', svc: 'Cybersecurity' },
  { id: 'ir', w: 10, q: 'The incident response plan was tested in a tabletop in the last 12 months', d: 'Including who calls clients, carriers and regulators', fix: 'Run a partner-level tabletop with your carrier\'s panel counsel', svc: 'Incident response' },
  { id: 'ocg', w: 8, q: 'Client security questionnaires are answered from a maintained evidence library', d: 'Outside counsel guidelines, RFP security sections, audits', fix: 'Stand up an evidence library mapped to client OCGs', svc: 'FirmOS · Posture' },
  { id: 'vend', w: 10, q: 'Third-party access is reviewed at least twice a year', d: 'eDiscovery, court reporting, cloud apps, former vendors', fix: 'Inventory vendor access and remove stale accounts', svc: 'Cybersecurity' },
];
export function postureScore(ans) {
  let s = 0, n = 0; for (const q of QUESTIONS) { const v = ans[q.id]; if (v != null) { n++; s += q.w * v; } }
  return { score: Math.round(s), answered: n };
}
export function tierOf(score, answered = 10) {
  if (!answered) return { label: 'Answer to see your tier', cls: 't-none' };
  if (score >= 85) return { label: 'Client-audit ready', cls: 't-ok' };
  if (score >= 70) return { label: 'Defensible, with gaps', cls: 't-warn' };
  if (score >= 50) return { label: 'Exposed', cls: 't-bad' };
  return { label: 'High risk', cls: 't-bad' };
}

/* ── Ring gauge ──────────────────────────────────────────────────────────── */
export function ring(el, value, { label = 'of 100', color, size = 150, stroke = 12, max = 100 } = {}) {
  if (!el) return;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(max, value));
  const col = color || (value == null ? 'var(--sys-line-2)' : v >= 85 ? 'var(--sys-good)' : v >= 70 ? 'var(--sys-warn)' : 'var(--sys-bad)');
  el.style.width = el.style.height = size + 'px';
  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--sys-bg-3)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / max)}" style="transition:stroke-dashoffset .6s ease,stroke .3s"/></svg><div class="v"><div><b>${value == null ? '—' : Math.round(v)}</b><span>${label}</span></div></div>`;
}

/* ── Chat FAQ (shared) ───────────────────────────────────────────────────── */
export const FAQ = [
  { q: 'Do you support AM Law 200 firms?', a: '<p>Yes. Frontline serves <b>900+ law firms</b>, including <b>more than 50% of the AM Law 200</b> and 28% of the AM Law 50 (company release, June 2026). Law firms are the only clients Frontline serves.</p>', href: '#top' },
  { q: 'What is included in the 24/7 service desk?', a: '<p>A legal-trained desk staffed <b>24/7/365</b> from nine hubs: VIP lines, DMS, time entry, onboarding and trial support. It runs on <b>HELIX</b>, Frontline\'s AI-optimized desk.</p>', href: '#services' },
  { q: 'How do you handle eBilling, rejections and A/R?', a: '<p>Frontline checks LEDES invoices against outside counsel guidelines, submits them, works rejections and appeals, and follows up on A/R. FirmOS targets a rejection rate of <b>11%</b>, down from <b>18%</b> (est.).</p>', href: 'firmos.html#ebilling' },
  { q: 'What cybersecurity services do you provide?', a: '<p>Managed detection and response with a 24/7 SOC, email and phishing defense, vulnerability and patch management, privileged-access hygiene, incident response and tabletop drills, plus the evidence packs your clients\' security questionnaires and OCGs require.</p>', href: '#assessment' },
  { q: 'How is pricing structured?', a: '<p><b>Concept answer:</b> managed IT and the service desk are scoped as a per-user monthly subscription, and eBilling and A/R are priced on volume. The assessment ends with a fixed proposal, so there are no surprises at renewal.</p>', href: '#contact' },
  { q: 'Which offices do you operate from?', a: '<p>Nine hubs: <b>St. Louis</b> (HQ), Toledo, Honolulu, New York, Toronto, London, Hyderabad, Goa and Cape Town. Together they provide follow-the-sun coverage, so the desk is staffed every hour of every day.</p>', href: '#global' },
  { q: 'What are your support hours?', a: '<p>24 hours a day, 7 days a week, 365 days a year, including holidays and filing-deadline nights.</p>', href: '#global' },
  { q: 'Do you offer co-managed IT for firms with an internal IT team?', a: '<p>Yes. Many larger firms keep IT leadership and strategy in-house while Frontline runs the desk, after-hours coverage, security operations or billing operations alongside them.</p>', href: '#services' },
  { q: 'How long does onboarding take?', a: '<p>Three steps: <b>Assess</b> (weeks 1–3), <b>Transition</b> (typically days 30–90, with a runbook-driven cutover and parallel run on the desk), then <b>Run &amp; improve</b> with monthly scorecards. (Concept timeline.)</p>', href: '#services' },
  { q: 'How do you protect client confidentiality with offshore delivery and AI?', a: '<p><b>Concept answer:</b> the trust center lists every delivery hub and subprocessor, access is role-based and logged, and firms can restrict which hubs touch which systems. FirmOS\'s Tier-0 AI answers from each firm\'s own runbooks and is not trained on client matter data.</p>', href: 'firmos.html#risks' },
  { q: 'What is FirmOS?', a: '<p><b>FirmOS</b> is the operating layer behind every Frontline client. It combines an AI Tier-0 service desk, a live security posture score, LEDES pre-flight and A/R automation, and a client portal. <a href="firmos.html">See the product and the live demo →</a></p>', href: 'firmos.html' },
  { q: 'Request a security assessment', a: '<p>Start with the 2-minute self-assessment on this page, then request the full 3-week assessment. It covers security posture, service desk baseline and billing leakage, and ends with a fixed-price proposal. You keep the report either way.</p>', href: '#contact' },
  { q: 'Are you hiring?', a: '<p>Frontline hires service desk analysts, security engineers and revenue-cycle specialists across its hubs, including St. Louis, Toledo, Hyderabad, Goa and Cape Town. (Concept: a careers page would list open roles by hub.)</p>', href: '#global' },
];
export const SUGGESTIONS = ['What is included in the 24/7 service desk?', 'How do you handle eBilling, rejections and A/R?', 'Do you support AM Law 200 firms?', 'Request a security assessment', 'What is FirmOS?', 'Which offices do you operate from?'];

/* ── Common: banner, nav, reveal, counters, chat ─────────────────────────── */
export function common({ Chat, page = 'home', suggestions } = {}) {
  let inst = null;
  // reveal
  const els = $$('.rv');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const vh = innerHeight; const later = els.filter(e => e.getBoundingClientRect().top > vh);
    els.filter(e => !later.includes(e)).forEach(e => e.classList.add('in', 'now'));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
    later.forEach(e => io.observe(e));
  } else els.forEach(e => e.classList.add('in', 'now'));
  // count-up
  const counters = $$('[data-count]');
  const run = el => { const to = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || ''; const t0 = performance.now(), d = 1100; const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + Math.round(to * e).toLocaleString('en-US') + suf; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const vh = innerHeight; const io2 = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); io2.unobserve(e.target); } }), { threshold: .4 }); counters.filter(c => c.getBoundingClientRect().top > vh).forEach(c => io2.observe(c)); }
  // chat
  if (Chat) {
    try {
      inst = Chat.mount(null, { persona: 'fl', short_name: 'Frontline', mode: 'floating', theme: 'light', color: ACCENT, name: 'Frontline advisor',
        greeting: page === 'os' ? 'Ask about FirmOS: the Tier-0 AI desk, the security score card, LEDES pre-flight, the client portal or the value math.' : 'I help law firms scope managed IT, the 24/7 service desk, cybersecurity and eBilling. Ask about coverage, security posture or an assessment.',
        faq: FAQ, suggestions: suggestions || SUGGESTIONS });
    } catch (e) { console.warn('chat mount failed', e); }
  }
  return inst;
}

/* ── Home page ───────────────────────────────────────────────────────────── */
const HUBS = [
  { id: 'stl', lab: 'St. Louis', side: 'l', name: 'St. Louis', role: 'Headquarters · service desk', lat: 38.627, lon: -90.199, tz: 'America/Chicago', hq: true },
  { id: 'tol', name: 'Toledo', role: 'Service desk hub (2020)', lat: 41.654, lon: -83.537, tz: 'America/New_York' },
  { id: 'nyc', lab: 'NYC · Toledo · Toronto', name: 'New York', role: 'Client advisory', lat: 40.713, lon: -74.006, tz: 'America/New_York' },
  { id: 'tor', name: 'Toronto', role: 'Canada (2010)', lat: 43.653, lon: -79.383, tz: 'America/Toronto' },
  { id: 'hnl', lab: 'Honolulu', name: 'Honolulu', role: 'Pacific coverage', lat: 21.307, lon: -157.858, tz: 'Pacific/Honolulu' },
  { id: 'lon', lab: 'London', name: 'London', role: 'EMEA clients (2009)', lat: 51.507, lon: -0.128, tz: 'Europe/London' },
  { id: 'cpt', lab: 'Cape Town', name: 'Cape Town', role: 'Delivery center (2023)', lat: -33.925, lon: 18.424, tz: 'Africa/Johannesburg' },
  { id: 'goa', name: 'Goa', role: 'Delivery center', lat: 15.491, lon: 73.828, tz: 'Asia/Kolkata' },
  { id: 'hyd', lab: 'Hyderabad · Goa', side: 'l', name: 'Hyderabad', role: 'Delivery center', lat: 17.385, lon: 78.487, tz: 'Asia/Kolkata' },
];
const localHour = tz => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t)?.value; return { h: +g('hour') % 24, m: +g('minute'), wd: g('weekday') }; } catch { return { h: 12, m: 0, wd: 'Mon' }; } };
const fmtTime = tz => { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date()); } catch { return '—'; } };
const onShift = tz => { const { h, wd } = localHour(tz); return h >= 8 && h < 19 && wd !== 'Sat' && wd !== 'Sun'; };

function heroConsole() {
  ring($('#hero-ring'), 87, { label: 'posture', color: 'var(--co)' });
  const feed = $('#hero-feed'); if (!feed) return;
  const T = [['t0', 'T0', 'MFA reset for associate, NYC office', '0:31'], ['l1', 'L1', 'iManage workspace access, M&A team', '3:48'], ['t0', 'T0', 'Password unlock, Toledo staff', '0:22'], ['t0', 'T0', 'Printer queue cleared, 14th floor', '0:40'], ['l2', 'L2', 'VPN appliance patch, London', '22:10'], ['t0', 'T0', 'Outlook profile rebuild, partner', '1:05'], ['l1', 'L1', 'Elite time-entry sync error', '6:12'], ['t0', 'T0', 'New-hire laptop provisioning started', '0:55']];
  let i = 0; const now = new Date();
  const add = () => { const t = T[i % T.length]; const d = new Date(now.getTime() + i * 47000); const el = document.createElement('div'); el.className = 'feed-i'; el.innerHTML = `<span class="tm">${d.toTimeString().slice(0, 5)}</span><span class="tg ${t[0]}">${t[1]}</span><span class="tx">${t[2]}</span><span class="tm" style="margin-left:auto;text-align:right">${t[3]}</span>`; feed.prepend(el); while (feed.children.length > 3) feed.lastChild.remove(); i++; };
  add(); add(); add();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(add, 2600);
  let m = 2; setInterval(() => { m = m >= 5 ? 1 : m + 1; const u = $('#upd'); if (u) u.textContent = `Updated ${m} min ago`; }, 30000);
}

function assessment() {
  const list = $('#qs'); if (!list) return;
  const ans = store.get('fl-posture', {}) || {};
  const opts = [['1', 'Yes'], ['0.5', 'Partly'], ['0', 'No']];
  list.innerHTML = QUESTIONS.map((q, i) => `<li class="q" data-id="${q.id}"><div class="qt">${i + 1}. ${q.q}<small>${q.d}</small></div><div class="seg" role="group" aria-label="Answer for question ${i + 1}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div></li>`).join('');
  const render = () => {
    $$('.q', list).forEach(li => { const v = ans[li.dataset.id]; li.classList.toggle('done', v != null); $$('button', li).forEach(b => b.setAttribute('aria-pressed', String(v != null && +b.dataset.v === v))); });
    const { score, answered } = postureScore(ans);
    $('#q-count').textContent = answered; $('#q-prog').style.width = answered * 10 + '%';
    const live = $('#q-live'); if (live) live.textContent = answered ? ` · score ${Math.round(score / Math.max(1, QUESTIONS.filter(q => ans[q.id] != null).reduce((s, q) => s + q.w, 0)) * 100)}` : '';
    // project the score over answered weight so partial completion reads sensibly
    const wAns = QUESTIONS.filter(q => ans[q.id] != null).reduce((s, q) => s + q.w, 0);
    const shown = answered ? Math.round(score / wAns * 100) : null;
    ring($('#as-ring'), shown, { label: answered < 10 && answered ? `${answered}/10 answered` : 'of 100', size: 168, stroke: 13 });
    const t = tierOf(shown ?? 0, answered); const tierEl = $('#as-tier'); tierEl.className = 'tier ' + t.cls; tierEl.textContent = answered ? t.label + (answered < 10 ? ' (provisional)' : '') : t.label;
    const gaps = QUESTIONS.filter(q => ans[q.id] != null && ans[q.id] < 1).map(q => ({ ...q, loss: q.w * (1 - ans[q.id]) })).sort((a, b) => b.loss - a.loss).slice(0, 3);
    $('#as-gaps').innerHTML = gaps.length ? `<h4>Your top ${gaps.length === 1 ? 'gap' : gaps.length + ' gaps'}</h4>${gaps.map((g, i) => `<div class="gap"><span class="n">${i + 1}</span><div>${g.fix}<small>+${Math.round(g.loss)} pts · closed by <b>${g.svc}</b></small></div></div>`).join('')}` : (answered ? '<h4>No gaps flagged yet</h4><p class="sys-src">Every control you answered is in place.</p>' : '');
    const em = $('#as-empty'); if (em) em.hidden = answered > 0;
    store.set('fl-posture', ans);
  };
  list.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; const id = b.closest('.q').dataset.id; const v = +b.dataset.v; if (ans[id] === v) delete ans[id]; else ans[id] = v; render(); });
  $('#q-reset').addEventListener('click', () => { for (const k of Object.keys(ans)) delete ans[k]; render(); });
  if (/[?&]sample=1/.test(location.search)) Object.assign(ans, { mfa: 1, edr: 0.5, bak: 1, mail: 0.5, patch: 0, priv: 0, train: 1, ir: 0, ocg: 0.5, vend: 0.5 });
  $('#q-sample')?.addEventListener('click', () => { Object.assign(ans, { mfa: 1, edr: 0.5, bak: 1, mail: 0.5, patch: 0, priv: 0, train: 1, ir: 0, ocg: 0.5, vend: 0.5 }); render(); });
  render();
}

function roi() {
  const ids = ['att', 'tpa', 'def', 'min', 'rate']; const el = id => $('#r-' + id); if (!el('att')) return;
  const fmtOut = { att: v => num(v), tpa: v => (+v).toFixed(1), def: v => v + '%', min: v => v + ' min', rate: v => '$' + num(v) + '/hr' };
  const calc = () => {
    const v = Object.fromEntries(ids.map(k => [k, +el(k).value]));
    ids.forEach(k => { const i = el(k); i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min) * 100) + '%'); $('#o-' + k).textContent = fmtOut[k](v[k]); });
    const tickets = v.att * v.tpa * 12, t0 = tickets * v.def / 100, rest = tickets - t0;
    const l2Share = 0.26, l2 = rest * l2Share, l1 = rest - l2;
    const hours = t0 * Math.max(0, v.min - 1) / 60;
    const timeVal = hours * v.rate;
    const deskCost = t0 * (22 - 3);           // Level-1 cost avoided less Tier-0 cost (MetricNet $22; Tier-0 $3 assumption)
    $('#roi-big').textContent = money(timeVal + deskCost);
    $('#k-tk').textContent = num(tickets); $('#k-df').textContent = num(t0); $('#k-hr').textContent = num(hours); $('#k-cs').textContent = money(deskCost);
    const pct = x => (x / tickets * 100) || 0;
    $('#b-t0').style.width = pct(t0) + '%'; $('#b-l1').style.width = pct(l1) + '%'; $('#b-l2').style.width = pct(l2) + '%';
    $('#l-t0').textContent = Math.round(pct(t0)) + '%'; $('#l-l1').textContent = Math.round(pct(l1)) + '%'; $('#l-l2').textContent = Math.round(pct(l2)) + '%';
  };
  ids.forEach(k => el(k).addEventListener('input', calc)); calc();
}

function hubs() {
  const list = $('#hub-list'); if (!list) return;
  const draw = () => {
    let on = 0;
    list.innerHTML = HUBS.map(h => { const s = onShift(h.tz); if (s) on++; return `<button class="hub" type="button" data-id="${h.id}"><span class="st ${s ? 'on' : ''}" aria-label="${s ? 'in business hours' : 'after hours'}"></span><span class="nm">${h.name}${h.hq ? ' <span class="hq">HQ</span>' : ''}<small>${h.role}</small></span><span class="tm">${fmtTime(h.tz)}<small>${localHour(h.tz).wd}</small></span></button>`; }).join('');
    ['#on-count', '#hubs-on'].forEach(s => { const e = $(s); if (e) e.textContent = on; });
    return on;
  };
  draw(); setInterval(draw, 30000);
  // lazy-load Leaflet when the map nears the viewport
  const box = $('#fl-map'); let started = false;
  const start = () => { if (started) return; started = true; loadLeaflet().then(() => drawMap(box)).catch(e => { console.warn('map unavailable', e); box.innerHTML = '<p class="sys-src" style="padding:20px">Map unavailable offline. The hub clock lists every location.</p>'; }); };
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { start(); io.disconnect(); } }, { rootMargin: '400px' }); io.observe(box); } else start();
  list.addEventListener('click', e => { const b = e.target.closest('.hub'); if (!b || !window._flMap) return; const h = HUBS.find(x => x.id === b.dataset.id); window._flMap.flyTo([h.lat, h.lon], 5, { duration: .8 }); });
}
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; l.crossOrigin = ''; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.crossOrigin = ''; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
function drawMap(el) {
  const L = window.L; const mobile = el.clientWidth < 620;
  const map = L.map(el, { zoomControl: !mobile, scrollWheelZoom: false, worldCopyJump: true, minZoom: 1, maxZoom: 8, attributionControl: true });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16 }).addTo(map);
  map.setView([14, el.clientWidth >= 620 ? -38 : -40], el.clientWidth >= 620 ? 2 : 1);
  const hq = HUBS[0];
  const arc = (a, b) => { const dl = b.lat - a.lat, dn = b.lon - a.lon, sg = dn >= 0 ? 1 : -1, k = 0.18; const c = [(a.lat + b.lat) / 2 + sg * dn * k, (a.lon + b.lon) / 2 - sg * dl * k]; const pts = []; for (let i = 0; i <= 48; i++) { const t = i / 48, u = 1 - t; pts.push([u * u * a.lat + 2 * u * t * c[0] + t * t * b.lat, u * u * a.lon + 2 * u * t * c[1] + t * t * b.lon]); } return pts; };
  HUBS.slice(1).forEach(h => L.polyline(arc(hq, h), { color: ACCENT, weight: 1.6, opacity: .55, dashArray: '4 6', interactive: false }).addTo(map));
  HUBS.forEach(h => { const icon = L.divIcon({ className: '', html: `<div class="fl-pin ${h.hq ? 'hq' : ''} ${onShift(h.tz) ? 'on' : ''}"><i></i>${!mobile && h.lab ? `<span class="${h.side || ''}">${h.lab}</span>` : ''}</div>`, iconSize: [0, 0] }); L.marker([h.lat, h.lon], { icon, keyboard: false, title: h.name }).addTo(map).bindTooltip(`<b>${h.name}</b><br>${h.role}<br>${fmtTime(h.tz)} local`, { direction: 'top', offset: [0, -8] }); });
  window._flMap = map; setTimeout(() => map.invalidateSize(), 120);
}

const INSIGHTS = [
  { cat: 'Revenue cycle', type: 'Report', min: 7, t: 'Rejections jumped from 11% to 18% in 2025. A pre-flight checklist to bring them back.', d: 'Client AI tools now audit every line. These are the five LEDES checks that catch most rejections before submission.', src: 'https://www.elite.com/insights/news/new-elite-research-law-firms-see-64-climb-in-rejection-rates-as-client-ai-billing-scrutiny-advances' },
  { cat: 'Security', type: 'Bulletin', min: 4, t: 'Outside counsel guidelines are the new security questionnaire', d: 'Clients now write MFA, EDR and breach-notice windows into engagement terms. Here is how to keep an evidence library current.' },
  { cat: 'Service desk', type: 'Guide', min: 6, t: 'What "AI-optimized" should mean on a law-firm service desk', d: 'Tier-0 handles resets and access requests; judgment calls stay with people. Where to draw the line.' },
  { cat: 'AI', type: 'Guide', min: 8, t: 'Generative AI in the firm: a deployment checklist for IT leaders', d: 'Data boundaries, vendor terms, audit logs and the rollout questions to settle before go-live.' },
  { cat: 'Revenue cycle', type: 'Benchmark', min: 5, t: '62 days to 50: how eBilling automation shortens the cash cycle', d: 'What the fastest-paying firms do differently between invoice approval and cash application.', src: 'https://www.elite.com/insights/news/new-elite-research-law-firms-see-64-climb-in-rejection-rates-as-client-ai-billing-scrutiny-advances' },
  { cat: 'Service desk', type: 'Event', ic: 'i-users', min: 2, t: 'Meet Frontline at ILTACON and ALA', d: 'Tabletop demos, the FirmOS posture score and a CIO roundtable on co-managed IT. Book time with the team.' },
];
const MIX = (c, p, base = 'var(--sys-surface)') => `color-mix(in srgb,${c} ${p}%,${base})`;
const ART = { 'Revenue cycle': [MIX('var(--co)', 12), 'var(--co)', 'i-invoice', false], 'Security': ['var(--sys-navy)', MIX('var(--co)', 80, '#fff'), 'i-shield', true], 'Service desk': ['var(--sys-bg-3)', 'var(--co)', 'i-desk', false], 'AI': ['var(--sys-ink)', 'var(--sys-good)', 'i-spark', true] };
function artSvg(x) { const [bg, fg, ic0, dark] = ART[x.cat] || ART['Service desk']; const ic = x.ic || ic0; let g = ''; for (let k = 0; k < 7; k++) g += `<circle cx="200" cy="65" r="${26 + k * 22}" style="fill:none;stroke:${fg};stroke-opacity:${((dark ? .32 : .22) - k * .035).toFixed(3)}"/>`; return `<svg viewBox="0 0 400 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="130" style="fill:${bg}"/>${g}<rect x="176" y="41" width="48" height="48" rx="14" style="fill:${dark ? MIX('var(--sys-navy)', 80, '#fff') : 'var(--sys-surface)'};stroke:${fg};stroke-opacity:.35"/><use href="#${ic}" x="188" y="53" width="24" height="24" style="color:${fg}"/></svg>`; }
function insights() {
  const grid = $('#in-grid'), bar = $('#in-filters'); if (!grid) return;
  const cats = ['All', ...new Set(INSIGHTS.map(x => x.cat))]; let cur = 'All', savedOnly = false;
  const saved = new Set(store.get('fl-saved', []) || []);
  bar.innerHTML = cats.map(c => `<button class="sys-chip" type="button" data-c="${c}" aria-pressed="${c === cur}">${c}</button>`).join('') + `<button class="sys-chip" type="button" data-s="1" aria-pressed="false"><span>Saved (<span id="sv-n">${saved.size}</span>)</span></button>`;
  const draw = () => {
    const rows = INSIGHTS.map((x, i) => ({ ...x, i })).filter(x => (cur === 'All' || x.cat === cur) && (!savedOnly || saved.has(x.i)));
    grid.innerHTML = rows.length ? rows.map(x => `<article class="sys-card post"><div class="art">${artSvg(x)}</div><div class="bd"><span class="sys-card-label"><span class="type">${x.type}</span><span>· ${x.cat} · ${x.min} min</span></span><h3 class="sys-card-title">${x.t}</h3><p class="sys-card-body">${x.d}</p><div class="sys-card-foot">${x.src ? `<a href="${x.src}" target="_blank" rel="noopener">Elite research →</a>` : '<span class="sys-muted">Concept article</span>'}<button class="bm" type="button" data-i="${x.i}" aria-pressed="${saved.has(x.i)}" aria-label="${saved.has(x.i) ? 'Remove from saved' : 'Save for later'}"><svg aria-hidden="true"><use href="#i-mark"/></svg></button></div></div></article>`).join('') : '<p class="sys-src">Nothing saved yet. Use the bookmark on any piece.</p>';
    $('#sv-n').textContent = saved.size;
  };
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.s) { savedOnly = !savedOnly; b.setAttribute('aria-pressed', savedOnly); } else { cur = b.dataset.c; $$('button[data-c]', bar).forEach(x => x.setAttribute('aria-pressed', x === b)); } draw(); });
  grid.addEventListener('click', e => { const b = e.target.closest('.bm'); if (!b) return; const i = +b.dataset.i; saved.has(i) ? saved.delete(i) : saved.add(i); store.set('fl-saved', [...saved]); draw(); });
  draw();
}

function faqList(esc) {
  const el = $('#faq-list'); if (!el) return;
  el.innerHTML = FAQ.filter(f => !/^Request/.test(f.q)).slice(0, 9).map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${f.a.replace(/<\/?p>/g, '')}</p></details>`).join('');
}

async function rationale({ Data, esc }) {
  const el = $('#refs'); if (!el) return;
  const HERE = { 'ref-fl-vantatrust': ['Trust panel with mapped frameworks, "Updated X min ago" live chips, advisor chat over FAQ', 'Trust strip, hero console, chat'], 'ref-fl-harbor': ['One editorial brand over IT + security + RCM; filterable insights with type labels and bookmarks', 'Services, Insights'], 'ref-fl-its': ['ROI calculator and self-assessment; one clear sales call to action; 3-step engagement', 'Assessment, ROI, steps'], 'ref-fl-kraftkennedy': ['Client-portal links; events and security bulletins as content', 'Hero, Insights'] };
  let refs = [];
  try { const d = await Data.load('research/design_refs'); refs = (d?.items || []).filter(r => [].concat(r.applies_to || []).includes('fl')); } catch (e) { console.debug(e); }
  if (!refs.length) { el.innerHTML = '<p class="sys-src">Design reference dataset not available.</p>'; return; }
  const order = ['ref-fl-vantatrust', 'ref-fl-harbor', 'ref-fl-its', 'ref-fl-kraftkennedy'];
  refs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const clean = t => (window.BSPFrame ? window.BSPFrame.humanizeText(String(t ?? '')) : String(t ?? '')).replace(/\bBSP\b/g, 'BSP');
  const PRINCIPLE = { 'ref-fl-vantatrust': 'Prove security continuously, in public', 'ref-fl-harbor': 'One brand over the roll-up', 'ref-fl-its': 'Let prospects build their own business case', 'ref-fl-kraftkennedy': 'Serve existing clients from the top bar' };
  const unbrand = (r, t) => {
    const parts = String(r.name || '').split(/[()]/).map(n => n.trim()).filter(Boolean);
    const names = [...new Set([...parts, ...parts.map(n => n.split(/\s+/)[0]).filter(n => n.length >= 4)])].sort((a, b) => b.length - a.length);
    let s = clean(t);
    for (const n of names) { const rx = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s = s.replace(new RegExp(`\\s*\\([^)]*\\b${rx}\\b[^)]*\\)`, 'g'), '').replace(new RegExp(`\\b${rx}(?:'s)?\\b`, 'g'), 'the reference'); }
    return s;
  };
  el.innerHTML = refs.map(r => `<article class="sys-card ref"><div class="hd"><h3 class="sys-card-title">${esc(PRINCIPLE[r.id] || unbrand(r, r.elements_to_borrow?.[0]?.element))}</h3></div>${HERE[r.id] ? `<p class="sys-card-body">${esc(HERE[r.id][0])}.</p><p class="sys-src">See: ${esc(HERE[r.id][1])}</p>` : ''}</article>`).join('');
}

function leadForm() {
  const f = $('#lead'); if (!f) return;
  $$('[data-prefill]').forEach(a => a.addEventListener('click', () => { const v = a.dataset.prefill; const cb = f.querySelector(`input[value="${v}"]`); if (cb) cb.checked = true; }));
  f.addEventListener('submit', e => {
    e.preventDefault();
    const name = f.name.value.trim(), email = f.email.value.trim(), firm = f.firm.value.trim();
    const done = $('#lead-done'); done.hidden = false;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !firm) { done.className = 'sys-note sys-note--bad form-done'; done.textContent = 'Please add your name, a valid work email and your firm.'; return; }
    const p = store.get('fl-posture', {}) || {}; const { score, answered } = postureScore(p);
    done.className = 'sys-note sys-note--good form-done';
    done.textContent = `Thanks, ${name.split(' ')[0]}. In the live site a senior consultant would reply within one business day${answered ? `, starting from your self-assessed score of ${Math.round(score / QUESTIONS.filter(q => p[q.id] != null).reduce((s, q) => s + q.w, 0) * 100)}` : ''}. (Concept form: nothing was sent.)`;
  });
}

export function home({ Data, esc }) {
  heroConsole(); assessment(); roi(); hubs(); insights(); faqList(esc); leadForm();
  rationale({ Data, esc });
}
