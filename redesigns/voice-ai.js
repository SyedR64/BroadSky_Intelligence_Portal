/* 24/7 Voice AI — the growth engine. Renders the voice AI research dataset into the page.
   No framework, no build step. Markup uses the shared sys- components (assets/system.css, UNIFIED.md);
   every dollar figure is an estimate and carries the est. badge; dataset text passes through plain(). */
import { Data } from '../assets/core.js?v=20261008192515';
import { humanizeText } from '../assets/frame.js?v=20261008192515';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, d) => { v = +v || 0; const a = Math.abs(v); if (a >= 1e6) return '$' + (Math.round(v / 1e4) / 100).toFixed(d ?? 2).replace(/\.?0+$/, '') + 'M'; if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K'; return '$' + Math.round(v); };
const usd = v => '$' + Math.round(+v || 0).toLocaleString('en-US');
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const srcLink = (u, label) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(label || host(u))}</a>` : '';
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const EST = '<span class="sys-est">est.</span>';

/* Plain English for dataset text: tool names, arrows, control ids and dataset names never reach the reader. */
const TOOL_WORDS = {
  customer_lookup: 'customer lookup', check_capacity: 'capacity check', book_job: 'booking', send_payment_link: 'payment link by text',
  page_on_call: 'paging the on-call technician', transfer_to_human: 'warm transfer to a person', log_disposition: 'outcome logging',
};
const FIXES = [
  [/\bthe repo's ai_agents_portfolio governance \(gov-0?(\d+)\)/g, "the portfolio AI-agent plan (control $1)"],
  [/\bgov-0?(\d+)\b/g, 'control $1'],
  [/\bitems say so via retrieval_status\b/g, 'each item notes how its figure was retrieved'],
  [/\s*-(?:>|&gt;)\s*/g, ' → '],
  [/(\d|\))\s+x\s+(?=[\d$(]|[a-z])/g, '$1 × '],
  [/^\s*[:;,]\s*/, ''],
  [/\bdisclosure given\b/g, 'virtual-assistant greeting given'],
  [/\bPP's\b/g, "Punctual Pros'"],
  [/\bJSON-schema functions\b/g, 'structured functions'],
  [/\bnot fetchable\b/g, 'not readable'],
  [/\bfetched\b/g, 'read'],
  [/\bdatasets?\b/g, 'data'],
  [/\bdeployments\b/g, 'live agents'],
  [/\bpre-deployment\b/g, 'pre-launch'],
  [/\bdeployment\b/g, 'rollout'],
  [/\bPP\b/g, 'Punctual Pros'],
];
const plain = s => {
  let t = String(s ?? '');
  for (const [rx, to] of FIXES) t = t.replace(rx, to);
  t = t.replace(/\b(customer_lookup|check_capacity|book_job|send_payment_link|page_on_call|transfer_to_human|log_disposition)\b/g, m => TOOL_WORDS[m]);
  return humanizeText(t);
};
/* Dataset text that lost words upstream (empty parentheses, dangling commas) is not shown. */
const broken = s => /\(\s|\s[,;]|\bnot ;|\bpost- |\bthe \.|\bthe \?/.test(String(s || ''));
/* Operational sources only: if a use case still cites a legal-article host, show the company or the data feed
   the line runs on instead, or no citation. */
const UC_SRC = {
  'uc-cet-emergency': ['https://comelectrical.com/commonwealth-electrical-technologies-acquires-horton-electrical-services/', 'CET: Horton wastewater and pump-station service'],
  'uc-cet-storm-pm': ['https://www.weather.gov/documentation/services-web-api', 'National Weather Service alerts API'],
  'uc-bpi-pressline': null,
};
const RETRIEVAL = { fetched: 'page read Oct 2026', search_snippet: 'search result, Oct 2026', repo_dataset: 'portfolio data' };
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());

/* Portfolio order (UNIFIED §6); colour comes from data-co, never from here. */
const CO = { pp: { name: 'Punctual Pros' }, cet: { name: 'CET' }, fl: { name: 'Frontline' }, ts: { name: 'Thomas Scientific' }, bpi: { name: 'BPI' }, fh: { name: 'Fair Harbor' } };

/* Hourly call shape (relative intensity by local hour). Staffed hours 8:00-16:59 are normalised to the
   model's 88% daytime share, the other 15 hours to the 12% after-hours share (weekends folded in). */
const SHAPE = [1, .7, .6, .5, .5, .8, 1.6, 3.2, 7.5, 9, 9.2, 8.8, 7.6, 8.4, 8.6, 8.2, 7.4, 4.6, 3.4, 2.8, 2.3, 1.8, 1.4, 1.1];
const STAFFED = h => h >= 8 && h <= 16;

function hourly(m) {
  const perDay = m.inbound_calls_per_month / 30.42;
  const dSum = SHAPE.reduce((a, v, h) => a + (STAFFED(h) ? v : 0), 0), nSum = SHAPE.reduce((a, v, h) => a + (STAFFED(h) ? 0 : v), 0);
  return SHAPE.map((v, h) => {
    const staffed = STAFFED(h); const calls = perDay * (staffed ? 0.88 * v / dSum : 0.12 * v / nSum);
    const missed = calls * (staffed ? 0.12 : 0.35); const recovered = missed * m.recovered_share_with_ai;
    return { h, staffed, calls, missed, recovered, residual: missed - recovered };
  });
}

/* ── 1. Hero ──────────────────────────────────────────────────────────── */
function hero(meta) {
  const m = meta.pp_revenue_model;
  const k = [
    ['Recovered revenue a year', money(m.recovered_revenue_annual_usd), 'From calls unanswered today'],
    ['Renewal uplift a year', money(m.outbound_renewal_uplift_usd), `${(6000).toLocaleString()} members × 8-point lift (assumption)`],
    ['Total a year', money(m.total_est_usd), `About ${Math.round(m.share_of_pp_revenue * 1000) / 10}% of Punctual Pros revenue`],
    ['Calls missed today', `${(m.missed_share * 100).toFixed(1)}%`, `Of ~${m.inbound_calls_per_month.toLocaleString()} calls a month (${m.missed_share_range.map(x => Math.round(x * 100) + '%').join('–')})`],
  ];
  $('#kpis').innerHTML = k.map(([l, v, s]) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${esc(l)}</span><span class="sys-kpi-value">${esc(v)}${EST}</span><span class="sys-kpi-sub">${esc(s)}</span></div>`).join('');
  $('#wave').innerHTML = Array.from({ length: 36 }, (_, i) => `<span style="--h:${30 + Math.round(60 * Math.abs(Math.sin(i * 1.7)))}%;animation-delay:${(i % 9) * -0.13}s"></span>`).join('');
  clock(m);
}

function clock(m) {
  const c = m.missed_revenue_counter; const rows = hourly(m);
  const how = $('#clock-how');
  how.innerHTML = `<b class="sys-num">${esc(usd(c.annual_usd))} a year ÷ seconds in a year = $${c.per_second_usd} a second</b>, counted from January 1 in your time zone. The annual figure is the revenue the AI layer is modelled to recover: <span class="sys-num">${esc(plain(m.recovered_revenue_formula))}</span>. This is a modelled estimate for Punctual Pros, not a measured loss. Calibrate it against ServiceTitan call tracking in week one.`;
  $('#clock-why').onclick = e => { const open = how.hidden; how.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open)); };
  $('#clock-day').textContent = c.missed_calls_per_day.toFixed(0);
  const v = $('#clock-v'), today = $('#clock-today'), t = $('#cc-time');
  let last = 0;
  const tick = ts => {
    if (ts - last > 90) {
      last = ts; const now = new Date(); const jan1 = new Date(now.getFullYear(), 0, 1);
      const val = c.per_second_usd * (now - jan1) / 1000;
      v.textContent = '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const hf = now.getHours() + now.getMinutes() / 60; let miss = 0;
      rows.forEach(r => { if (r.h + 1 <= hf) miss += r.missed; else if (r.h < hf) miss += r.missed * (hf - r.h); });
      today.textContent = miss.toFixed(1);
      t.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── 2. 24-hour strip ─────────────────────────────────────────────────── */
function timeline(meta) {
  const m = meta.pp_revenue_model; const rows = hourly(m);
  const COL = { csr: 'var(--vai-csr)', miss: 'var(--vai-miss)', ai: 'var(--vai-ai)' };
  let mode = 'today';
  let W, H, iw, ih, bw, narrow; const L = 30, R = 6, T = 16, B = 28;
  const lab = h => new Date(2026, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' });
  const max = Math.ceil(Math.max(...rows.map(r => r.calls)) / 2) * 2;
  const y = v => T + ih - v / max * ih;
  const size = () => { W = Math.max(300, Math.round($('#tl-chart').clientWidth || 960)); narrow = W < 600; H = narrow ? 220 : 250; iw = W - L - R; ih = H - T - B; bw = iw / 24; };
  const legend = () => { $('#tl-legend').innerHTML = (mode === 'today'
    ? [['csr', 'Answered by a rep or answering service'], ['miss', 'Missed or abandoned']]
    : [['csr', 'Answered by a rep'], ['ai', 'Answered by the AI agent'], ['miss', 'Still lost (hang-ups, non-leads)']]).map(([k, l]) => `<span><i style="background:${COL[k]}"></i>${esc(l)}</span>`).join(''); };
  const draw = () => {
    size(); let g = '';
    // after-hours bands
    g += `<rect class="band" x="${L}" y="${T}" width="${bw * 8}" height="${ih}"/><rect class="band" x="${L + bw * 17}" y="${T}" width="${bw * 7}" height="${ih}"/>`;
    g += `<text class="lab" x="${L + 6}" y="${T + 12}">${narrow ? 'After' : 'After hours'}</text><text class="lab" x="${L + bw * 8 + 6}" y="${T + 12}">${narrow ? 'Staffed' : 'Staffed 8 a.m.–5 p.m.'}</text><text class="lab" x="${L + bw * 17 + 6}" y="${T + 12}">${narrow ? 'After' : 'After hours'}</text>`;
    for (let v = 0; v <= max; v += max / 4) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    rows.forEach((r, i) => {
      const gap = narrow ? 1 : 3; const x = L + i * bw + gap, w = bw - gap * 2; const rr = Math.min(3, w / 2);
      const segs = mode === 'today'
        ? [['csr', r.calls - r.missed], ['miss', r.missed]]
        : r.staffed ? [['csr', r.calls - r.missed], ['ai', r.recovered], ['miss', r.residual]] : [['ai', r.calls - r.residual], ['miss', r.residual]];
      let base = 0;
      segs.forEach(([k, v], si) => {
        const y0 = y(base), y1 = y(base + v); const top = si === segs.length - 1; const hgt = Math.max(0, y0 - y1 - (top ? 0 : 2));
        if (hgt > 0.2) g += top ? `<path d="M${x},${y0}V${y1 + rr}q0,-${rr} ${rr},-${rr}h${w - 2 * rr}q${rr},0 ${rr},${rr}V${y0}Z" fill="${COL[k]}"/>` : `<rect x="${x}" y="${y1 + 2}" width="${w}" height="${hgt}" fill="${COL[k]}"/>`;
        base += v;
      });
      if (i % (narrow ? 6 : 3) === 0) g += `<text x="${L + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${i === 0 ? '12a' : i < 12 ? i + 'a' : i === 12 ? '12p' : (i - 12) + 'p'}</text>`;
      g += `<rect class="hit" data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" fill="transparent" style="cursor:pointer"><title>${lab(r.h)}</title></rect>`;
    });
    $('#tl-chart').innerHTML = `<svg class="tl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calls by hour of day, ${mode === 'today' ? 'today' : 'with 24/7 voice AI'}">${g}</svg>`;
    $$('#tl-chart .hit').forEach(el => { const show = () => read(+el.dataset.i); el.addEventListener('mouseenter', show); el.addEventListener('click', show); });
    legend(); summary();
  };
  const read = i => { const r = rows[i];
    $('#tl-read').innerHTML = `<b>${lab(r.h)}–${lab((r.h + 1) % 24)}</b> · ${r.staffed ? 'staffed' : 'after hours'} · <b class="sys-num">${r.calls.toFixed(1)}</b> calls a day · ` + (mode === 'today'
      ? `<b class="sys-num">${r.missed.toFixed(2)}</b> missed (${r.staffed ? '12% daytime' : '35% after-hours'} rate)`
      : `<b class="sys-num">${(r.staffed ? r.recovered : r.calls - r.residual).toFixed(2)}</b> answered by AI · <b class="sys-num">${r.residual.toFixed(2)}</b> still lost`) + EST; };
  const summary = () => {
    const sum = k => rows.reduce((a, r) => a + r[k], 0); const calls = sum('calls'), missed = sum('missed'), rec = sum('recovered');
    const ah = rows.filter(r => !r.staffed).reduce((a, r) => a + r.missed, 0);
    const jobs = rec * m.booking_rate * m.incrementality;
    const tiles = mode === 'today'
      ? [[calls.toFixed(0), 'Inbound calls a day'], [missed.toFixed(1), 'Calls missed a day'], [ah.toFixed(1), 'Of those, after hours'], [usd(m.missed_revenue_counter.per_day_usd), 'Job revenue lost a day']]
      : [[calls.toFixed(0), 'Inbound calls a day'], [(missed - rec).toFixed(1), 'Calls still lost a day'], [jobs.toFixed(1), 'Extra jobs booked a day'], [usd(jobs * m.avg_ticket), 'Job revenue recovered a day']];
    $('#tl-sum').innerHTML = tiles.map(([v, l]) => `<div class="sys-kpi"><span class="sys-kpi-label">${esc(l)}</span><span class="sys-kpi-value">${esc(v)}${EST}</span></div>`).join('');
  };
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const w = $('#tl-chart').clientWidth; if (Math.abs(w - W) > 8) draw(); }, 150); });
  $$('[data-tl]').forEach(b => b.onclick = () => { mode = b.dataset.tl; $$('[data-tl]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  $('#tl-assume').innerHTML = [
    `Volume: ${m.inbound_calls_per_month.toLocaleString()} inbound calls a month ÷ 30.42 days ≈ ${(m.inbound_calls_per_month / 30.42).toFixed(0)} a day, backed out of the ~$22M revenue estimate (call volume is not public).`,
    `Split: 12% of calls arrive outside staffed hours (ServiceTitan 2025 HVAC data runs from 9.8% in October to 14.1% in June). Weekend calls are folded into the after-hours hours, and the hourly shape inside each block is illustrative.`,
    `Missed today: 35% of after-hours calls (ServiceTitan: trades lose 30–40%) and 12% of daytime calls (assumption for a staffed team of reps, well below Invoca's 35% industry rate). Blended rate ${(m.missed_share * 100).toFixed(1)}%.`,
    `With AI: ${Math.round(m.recovered_share_with_ai * 100)}% of would-be-missed calls are recovered. The rest hang up on hearing an assistant or are spam, vendors or wrong numbers. Jobs = recovered × ${m.booking_rate} booked × ${m.incrementality} incremental × $${m.avg_ticket.toLocaleString()} ticket.`,
  ].map(x => `<li>${esc(x)}</li>`).join('');
  if (new URLSearchParams(location.search).get('tl') === 'ai') $('[data-tl="ai"]').click(); else draw();
  read(2);
}

/* ── 3. Call demo ─────────────────────────────────────────────────────── */
/* The call log reads like a dispatcher's notes, not code: [turn, what the agent did, result]. */
const LOG = {
  'call-pp-noheat': [
    [0, 'Answered on ring one as One Hour, after hours', 'Said it is the virtual assistant'],
    [4, 'Looked up the customer from caller ID', 'Jordan Miller, 412 Maple Ave, Lititz 17543'],
    [6, 'Checked the equipment on file', 'Gas furnace from 2011, tuned up in March'],
    [8, 'Checked on-call capacity for a priority no-heat job (infant in the home)', 'Marcus is on call, 3:15–4:15 a.m.'],
    [10, 'Booked the job and paged the on-call technician', 'Job booked; technician acknowledged'],
    [10, 'Texted a confirmation with the after-hours fee terms', 'Delivered'],
    [13, 'Logged the outcome on the job', 'Booked; greeting check passed'],
  ],
  'call-pp-storm': [
    [0, 'Picked up the Ben Franklin overflow on ring three', 'Every rep busy; flash-flood warning in effect'],
    [6, 'Checked the ZIP code', '17552 (Mount Joy) is in the service area'],
    [8, 'Checked storm capacity for active water', '1–2 p.m. today, pump on the truck'],
    [10, 'Added a note to the job', 'Water-heater safety check'],
    [12, 'Booked the job and texted a confirmation', 'Sent to the mobile ending 4417; booked ahead of non-urgent calls'],
    [14, 'Logged the outcome on the job', 'Booked in storm mode'],
  ],
  'call-pp-renewal': [
    [0, 'Checked the member record before dialing', 'Asked for reminder calls; inside calling hours, 8 a.m.–9 p.m.'],
    [0, 'Looked up the member', 'Linda Hoover, membership renews Oct 31'],
    [2, 'Answered the "is this a robot?" question', 'Said it is an AI assistant and offered a person'],
    [6, 'Pulled the last 12 months of invoices', 'January igniter repair, member discount applied'],
    [8, 'Texted a payment link', 'Card stays on file; no card details spoken'],
    [8, 'Checked tune-up capacity', 'Tue Oct 13, 8–9 a.m. or Thu Oct 15, 1–2 p.m.'],
    [10, 'Booked the tune-up', 'Tue Oct 13, 8–9 a.m.; renewal accepted'],
    [13, 'Logged the outcome on the member record', 'Renewed and booked'],
  ],
};
const BLURB = { 'call-pp-noheat': 'After hours · inbound', 'call-pp-storm': 'Storm overflow · inbound', 'call-pp-renewal': 'Membership · outbound' };

/* Scripted greetings say calls are reviewed for coaching (operational QA), not that they are recorded. */
const coachLine = t => String(t || '').replace(/\bthis call is recorded\b/g, 'calls are reviewed for coaching').replace(/\bThis call is recorded\b/g, 'Calls are reviewed for coaching');
function demo(calls) {
  calls = calls.map(c => ({ ...c, lines: (c.lines || []).map(l => ({ ...l, text: coachLine(l.text) })) }));
  const S = { call: calls[0], token: 0, playing: false, voiceOn: true };
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice = null;
  const pickVoice = () => { if (!synth) return; const vs = synth.getVoices() || []; voice = vs.find(v => /^en[-_]US$/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; };
  if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch { synth.onvoiceschanged = pickVoice; } }
  const note = $('#voice-note');
  note.innerHTML = (synth ? 'Agent lines are spoken by your browser\'s built-in US English voice. Turn the voice off for a text-only run.' : 'Your browser cannot speak the agent\'s lines, so the demo runs as text.') + ' Sample calls are scripted with fictional customers<span class="sys-est sys-est--illus">illustrative</span>';
  if (!synth) { $('#pl-voice').setAttribute('aria-pressed', 'false'); $('#pl-voice').textContent = 'Text only'; $('#pl-voice').disabled = true; S.voiceOn = false; }

  $('#calls').innerHTML = calls.map((c, i) => `<button type="button" class="vai-callbtn" data-c="${esc(c.id)}" aria-pressed="${i === 0}"><span class="sys-card-label">${esc(BLURB[c.id] || CO[c.company]?.name || 'Sample call')}</span><b>${esc(plain(c.title))}</b><span>${esc(c.brand)} · books in ${mmss(c.time_to_book_seconds)}</span></button>`).join('');
  $$('#calls .vai-callbtn').forEach(b => b.onclick = () => select(b.dataset.c));

  const words = s => s.split(/\s+/).length;
  const thread = $('#thread'), tools = $('#tools'), clockEl = $('#pl-clock'), playBtn = $('#pl-play');
  const setPlay = on => { S.playing = on; playBtn.querySelector('span').textContent = on ? 'Stop' : 'Play'; playBtn.querySelector('svg').innerHTML = on ? '<rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/>' : '<path d="M2 1l9 5-9 5z" fill="currentColor"/>'; };
  const stop = () => { S.token++; if (synth) synth.cancel(); setPlay(false); };
  const reset = () => {
    const c = S.call; $('#pl-title').innerHTML = `<b>${esc(plain(c.title))}</b><span>${esc(c.brand)} · ${c.lines.length} turns · scripted</span>`;
    thread.innerHTML = `<div class="vai-empty"><b>Press Play</b>The agent answers on ring one. Agent lines are read aloud and caller lines type in as the call runs.</div>`;
    tools.innerHTML = ''; clockEl.textContent = '0:00';
  };
  const select = id => { stop(); S.call = calls.find(c => c.id === id) || calls[0]; $$('#calls .vai-callbtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === S.call.id))); reset(); };
  const simTimes = c => { const tot = c.lines.reduce((a, l) => a + words(l.text), 0); let acc = 0; return c.lines.map(l => (acc += words(l.text)) / tot * c.time_to_book_seconds); };
  const addTools = (i, c) => (LOG[c.id] || []).filter(t => t[0] === i).forEach(([, did, res]) => tools.insertAdjacentHTML('beforeend', `<li class="vai-step"><b>${esc(did)}</b><span>${esc(res)}</span></li>`));
  const bubble = l => { const d = document.createElement('div'); d.className = `vai-msg ${l.speaker === 'Agent' ? 'agent' : 'caller'}`; d.innerHTML = `<span class="who">${l.speaker === 'Agent' ? 'AI agent' : 'Caller'}</span><span class="tx"></span>`; thread.appendChild(d); thread.scrollTop = thread.scrollHeight; return d; };
  const outcome = c => { thread.insertAdjacentHTML('beforeend', `<div class="sys-note sys-note--good vai-outcome" role="status"><div><b class="big sys-num">Booked in ${mmss(c.time_to_book_seconds)}</b>${esc(plain(c.outcome))}<p class="vai-outcome-today">Today, without the agent, this call ${c.id === 'call-pp-renewal' ? 'would depend on a CSR finding time to dial the member list.' : c.id === 'call-pp-storm' ? 'rings out while every CSR is on another storm call.' : 'goes to voicemail or an answering service that takes a message.'}</p></div></div>`); thread.scrollTop = thread.scrollHeight; };
  const speak = (text, tok) => new Promise(res => {
    const est = Math.max(1400, words(text) * 360);
    if (!synth || !S.voiceOn) { setTimeout(res, est * 0.55); return; }
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try {
      const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.lang = 'en-US'; u.rate = 1.04; u.pitch = 1;
      u.onend = fin; u.onerror = () => setTimeout(fin, est * 0.55); synth.speak(u);
    } catch { fin(); }
    setTimeout(fin, est * 1.9 + 2500); // safety net when a voice never fires onend
    const iv = setInterval(() => { if (tok !== S.token) { clearInterval(iv); fin(); } if (done) clearInterval(iv); }, 120);
  });
  async function play() {
    if (S.playing) { stop(); return; }
    player.classList.remove('noanim'); const c = S.call; const tok = ++S.token; setPlay(true); thread.innerHTML = ''; tools.innerHTML = ''; const times = simTimes(c);
    if (synth) { synth.cancel(); await sleep(80); } // Chrome drops a speak() issued in the same tick as cancel()
    for (let i = 0; i < c.lines.length; i++) {
      if (tok !== S.token) return;
      addTools(i, c);
      const l = c.lines[i]; const b = bubble(l); const tx = b.querySelector('.tx');
      if (l.speaker === 'Agent') { tx.textContent = l.text; b.classList.add('speaking'); await speak(l.text, tok); b.classList.remove('speaking'); }
      else { b.querySelector('.tx').insertAdjacentHTML('afterend', '<span class="caret"></span>'); for (let k = 1; k <= l.text.length; k += 2) { if (tok !== S.token) return; tx.textContent = l.text.slice(0, k); thread.scrollTop = thread.scrollHeight; await sleep(22); } tx.textContent = l.text; b.querySelector('.caret')?.remove(); await sleep(420); }
      clockEl.textContent = mmss(times[i]);
    }
    if (tok !== S.token) return;
    addTools(c.lines.length, c); outcome(c); setPlay(false);
  }
  const player = $('.vai-player');
  const showAll = () => { stop(); player.classList.add('noanim'); const c = S.call; thread.innerHTML = ''; tools.innerHTML = '';
    c.lines.forEach((l, i) => { addTools(i, c); bubble(l).querySelector('.tx').textContent = l.text; });
    addTools(c.lines.length, c); outcome(c); clockEl.textContent = mmss(c.time_to_book_seconds); thread.scrollTop = 0; };
  playBtn.onclick = play; $('#pl-all').onclick = showAll;
  $('#pl-voice').onclick = e => { S.voiceOn = !S.voiceOn; e.currentTarget.setAttribute('aria-pressed', String(S.voiceOn)); e.currentTarget.textContent = S.voiceOn ? 'Voice on' : 'Voice off'; if (!S.voiceOn && synth) synth.cancel(); };
  reset();
  // Deep link (used by the chat FAQ): #play-noheat / #play-storm / #play-renewal
  const deep = () => { const m = /^#play-(\w+)/.exec(location.hash); if (!m) return; const c = calls.find(x => x.id === 'call-pp-' + m[1]); if (!c) return; select(c.id); $('#demo').scrollIntoView({ behavior: 'smooth' }); play(); };
  window.addEventListener('hashchange', deep); if (/^#play-/.test(location.hash)) setTimeout(deep, 300);
  // Re-clicking the same #play-… link (e.g. from the chat FAQ) does not fire hashchange, so replay it directly.
  document.addEventListener('click', e => { const a = e.target.closest?.('a[href^="#play-"]'); if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); deep(); } });
  // ?show=noheat renders a finished transcript without audio (useful for screenshots and print)
  const sh = new URLSearchParams(location.search).get('show'); if (sh && calls.some(x => x.id === 'call-pp-' + sh)) { select('call-pp-' + sh); showAll(); }
}

/* ── 4. Calculator ────────────────────────────────────────────────────── */
function calculator(meta, items) {
  const m = meta.pp_revenue_model; const arch = items.find(i => i.kind === 'architecture');
  const per = arch?.est_cost_per_minute_usd ?? 0.1158;
  const VENDORS = [
    { id: 'self', label: `Self-built stack (Twilio + Deepgram + Claude + TTS via Vapi) · $${per}/min`, perMin: per },
    { id: 'retell', label: 'Retell AI all-in · ~$0.12/min (range $0.09–0.15)', perMin: 0.12 },
    { id: 'bland', label: 'Bland AI all-in · ~$0.13/min (range $0.12–0.14)', perMin: 0.13 },
    { id: 'smith-ent', label: 'Smith.ai Enterprise · $1.67/call', perCall: 1.67 },
    { id: 'smith-pro', label: 'Smith.ai Pro · ~$2.00/call', perCall: 2 },
    { id: 'trades', label: 'Trades-native (ServiceTitan / Avoca) · $3.00/call (assumption, pricing not published)', perCall: 3 },
  ];
  const F = [
    { g: 'Inbound' },
    { id: 'calls', l: 'Inbound calls a month', min: 500, max: 15000, step: 1, v: m.inbound_calls_per_month, f: v => Math.round(v).toLocaleString(), n: 'Backed out of the ~$22M revenue estimate. Replace with ServiceTitan call tracking.' },
    { id: 'missed', l: 'Missed or abandoned today', min: 5, max: 40, step: 0.01, v: (0.12 * 0.35 + 0.88 * 0.12) * 100, f: v => (+(+v).toFixed(2)) + '%', n: 'Blend: 12% of calls after hours × 35% lost + 88% daytime × 12% missed = 14.76%. Invoca\'s industry rate is about 35%.' },
    { id: 'recov', l: 'Recovered by the AI agent', min: 40, max: 100, step: 1, v: m.recovered_share_with_ai * 100, f: v => Math.round(v) + '%', n: 'The rest hang up on hearing an assistant or are spam, vendors or wrong numbers.' },
    { id: 'book', l: 'Booking rate on recovered calls', min: 20, max: 90, step: 1, v: m.booking_rate * 100, f: v => Math.round(v) + '%', n: 'Invoca 45%. ServiceTitan AI reports 70% (90% when capacity is open). A typical human rep books 42%.' },
    { id: 'inc', l: 'Incrementality', min: 20, max: 100, step: 1, v: m.incrementality * 100, f: v => Math.round(v) + '%', n: 'Share of booked jobs that would not have come back anyway.' },
    { id: 'ticket', l: 'Average ticket', min: 300, max: 2500, step: 1, v: m.avg_ticket, f: v => usd(v), n: 'Housecall Pro HVAC repair $1,205 × 0.85 for plumbing and electrical mix.' },
    { g: 'Outbound renewals' },
    { id: 'members', l: 'Active members', min: 0, max: 20000, step: 250, v: 6000, f: v => Math.round(v).toLocaleString(), n: 'Assumption. Replace with the ServiceTitan membership export.' },
    { id: 'lift', l: 'Renewal lift from AI outbound', min: 0, max: 15, step: 0.5, v: 8, f: v => (+v).toFixed(1) + ' pts', n: '80% base renewal (Applause HQ) → 88% (assumption informed by vendor-reported lapse rates).' },
    { id: 'mval', l: 'Value per member-year', min: 200, max: 1500, step: 10, v: 840, f: v => usd(v), n: '$240 fee + $600 extra service revenue (assumption).' },
    { g: 'Cost and payback' },
    { id: 'vendor', l: 'Vendor / stack', type: 'select' },
    { id: 'cover', l: 'Share of inbound calls the AI answers', min: 10, max: 100, step: 0.5, v: (0.12 + 0.88 * 0.12) * 100, f: v => (+v).toFixed(1) + '%', n: 'All after-hours calls plus daytime overflow (22.6%). Set to 100% for AI-first answering.' },
    { id: 'mins', l: 'Average minutes per call', min: 1, max: 8, step: 0.5, v: 4, f: v => (+v).toFixed(1) + ' min', n: 'ServiceTitan reports average talk time under 5 minutes.' },
    { id: 'margin', l: 'Contribution margin on recovered revenue', min: 20, max: 70, step: 1, v: 45, f: v => Math.round(v) + '%', n: 'Assumption, used for payback only.' },
    { id: 'setup', l: 'One-time setup (integration, scripts, QA suite)', min: 0, max: 250000, step: 5000, v: 60000, f: v => usd(v), n: 'Assumption.' },
  ];
  const PRESETS = [
    { l: 'Conservative model', set: {} },
    { l: 'Invoca industry miss rate (35%)', set: { missed: 35 } },
    { l: 'ServiceTitan AI booking (70%)', set: { book: 70 } },
    { l: 'Fully incremental', set: { inc: 100 } },
    { l: 'Half the members (3,000)', set: { members: 3000 } },
  ];
  const DEF = Object.fromEntries(F.filter(f => f.id && f.type !== 'select').map(f => [f.id, f.v]));
  $('#fields').innerHTML = F.map(f => f.g ? `<p class="sys-card-label vai-grp">${esc(f.g)}</p>` : f.type === 'select'
    ? `<div class="vai-field"><label for="in-vendor">${esc(f.l)}</label><output></output><select id="in-vendor">${VENDORS.map(v => `<option value="${v.id}">${esc(v.label)}</option>`).join('')}</select><small>Public pricing from vendor pages, retrieved October 2026. Trades-native pricing is not published.</small></div>`
    : `<div class="vai-field"><label for="in-${f.id}">${esc(f.l)}</label><output id="o-${f.id}" for="in-${f.id}"></output><input type="range" id="in-${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.v}"><small>${esc(f.n)}</small></div>`).join('');
  $('#presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="sys-chip" data-p="${i}" aria-pressed="${i === 0}">${esc(p.l)}</button>`).join('');
  $$('#presets .sys-chip').forEach(b => b.onclick = () => { const p = PRESETS[+b.dataset.p]; Object.entries({ ...DEF, ...p.set }).forEach(([k, v]) => { const el = $('#in-' + k); if (el) el.value = v; }); $$('#presets .sys-chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); calc(); });
  const val = id => +$('#in-' + id).value;
  function calc() {
    F.filter(f => f.id && f.f).forEach(f => { $('#o-' + f.id).textContent = f.f(val(f.id)); });
    const calls = val('calls'), missed = val('missed') / 100, recov = val('recov') / 100, book = val('book') / 100, inc = val('inc') / 100, ticket = val('ticket');
    const missedM = calls * missed, recM = missedM * recov, bookedM = recM * book, jobsM = bookedM * inc;
    const inRevM = jobsM * ticket; const renewY = val('members') * val('lift') / 100 * val('mval');
    const revM = inRevM + renewY / 12, revY = revM * 12;
    const v = VENDORS.find(x => x.id === $('#in-vendor').value) || VENDORS[0];
    const outboundM = val('members') * 2 / 12; // two reminder calls per member a year (renewal + tune-up)
    const handledM = calls * val('cover') / 100 + outboundM;
    const perCall = v.perCall ?? v.perMin * val('mins');
    const costM = handledM * perCall, costY = costM * 12;
    const netM = revM * val('margin') / 100 - costM; const payback = netM > 0 ? val('setup') / netM : Infinity;
    const roi = costY > 0 ? revY / costY : Infinity;
    const W = x => Math.max(1.5, Math.min(100, x / calls * 100));
    $('#calc-out').innerHTML = `
      <p class="sys-card-label">Recovered revenue a year${EST}</p>
      <p class="vai-out-big sys-num">${usd(revY)}</p>
      <p class="vai-out-sub">${usd(revM)} a month · inbound ${usd(inRevM * 12)} + renewals ${usd(renewY)}</p>
      <div class="vai-out-grid">
        <div><b class="sys-num">${Math.round(jobsM * 12).toLocaleString()}</b><span>extra jobs a year</span></div>
        <div><b class="sys-num">${usd(costY)}</b><span>vendor cost a year · ${Math.round(handledM).toLocaleString()} calls a month × $${perCall.toFixed(2)}</span></div>
        <div><b class="sys-num">${isFinite(payback) ? (payback < 1 ? '< 1 month' : payback.toFixed(1) + ' months') : '—'}</b><span>payback on ${usd(val('setup'))} setup at ${val('margin')}% margin</span></div>
        <div><b class="sys-num">${isFinite(roi) ? Math.round(roi) + '×' : '—'}</b><span>recovered revenue per $1 of vendor cost (${revY ? (costY / revY * 100).toFixed(1) : 0}% of revenue)</span></div>
      </div>
      <div class="vai-funnel" aria-label="Monthly inbound funnel">
        <div class="vai-fn"><span>Inbound calls</span><div class="track"><div class="fill" style="width:100%"></div></div><b>${Math.round(calls).toLocaleString()}</b></div>
        <div class="vai-fn"><span>Missed today</span><div class="track"><div class="fill m" style="width:${W(missedM)}%"></div></div><b>${Math.round(missedM).toLocaleString()}</b></div>
        <div class="vai-fn"><span>Recovered by AI</span><div class="track"><div class="fill" style="width:${W(recM)}%"></div></div><b>${Math.round(recM).toLocaleString()}</b></div>
        <div class="vai-fn"><span>Booked</span><div class="track"><div class="fill" style="width:${W(bookedM)}%"></div></div><b>${Math.round(bookedM).toLocaleString()}</b></div>
        <div class="vai-fn"><span>Incremental jobs</span><div class="track"><div class="fill" style="width:${W(jobsM)}%"></div></div><b>${Math.round(jobsM).toLocaleString()}</b></div>
      </div>
      <p class="vai-formula sys-num">${Math.round(calls).toLocaleString()} × 12 × ${+missed.toFixed(4)} missed × ${recov.toFixed(2)} recovered × ${book.toFixed(2)} booked × ${inc.toFixed(2)} incremental × ${usd(ticket)} = ${usd(inRevM * 12)}<br>+ ${Math.round(val('members')).toLocaleString()} members × ${(val('lift') / 100).toFixed(3)} lift × ${usd(val('mval'))} = ${usd(renewY)}</p>
      <p class="vai-out-note">Outbound cost assumes two reminder calls per member a year. The model leaves out speed-to-lead, unsold-estimate follow-up, no-show reduction, the Spanish line and CSR labor savings. These are valued separately in the catalog.</p>`;
  }
  $$('#calc input, #calc select').forEach(el => el.addEventListener('input', () => { $$('#presets .sys-chip').forEach(x => x.setAttribute('aria-pressed', 'false')); calc(); }));
  calc();
}

/* ── 5. Use cases ─────────────────────────────────────────────────────── */
const ucSrc = u => { if (!/rcfp\.org|cooley\.com|akingump\.com/.test(u.source_url || '')) return srcLink(u.source_url); const o = UC_SRC[u.id]; return o ? srcLink(o[0], o[1]) : ''; };
function useCases(items) {
  const ucs = items.filter(i => i.kind === 'use_case');
  const cos = ['all', ...Object.keys(CO).filter(k => ucs.some(u => u.company === k))];
  let cur = store.get('vai-co') || 'all'; if (!cos.includes(cur)) cur = 'all';
  $('#uc-filters').innerHTML = `<div class="sys-chips">${cos.map(c => `<button type="button" class="sys-chip" data-c="${c}"${c === 'all' ? '' : ` data-co="${c}"`}>${c === 'all' ? 'All companies' : esc(CO[c].name)} <span class="sys-muted sys-num">${c === 'all' ? ucs.length : ucs.filter(u => u.company === c).length}</span></button>`).join('')}</div><p class="vai-sum" id="uc-sum"></p>`;
  const render = () => {
    const list = ucs.filter(u => cur === 'all' || u.company === cur);
    $$('#uc-filters .sys-chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === cur)));
    $('#uc-sum').innerHTML = `${list.length} lines · <b class="sys-num">${money(list.reduce((a, u) => a + (u.est_annual_value_usd || 0), 0))}</b> a year${EST}`;
    $('#uc-grid').innerHTML = list.map(u => `<article class="sys-card vai-uc" data-co="${esc(u.company)}">
      <div class="vai-uc-top"><span class="sys-card-label"><span class="sys-dot" aria-hidden="true"></span>${esc(CO[u.company].name)}</span><span class="vai-tag vai-tag--${u.direction === 'inbound' ? 'in' : 'out'}">${esc(cap(u.direction))}</span><span class="vai-tag">${u.weeks_to_deploy} weeks to go live</span></div>
      <h3 class="sys-card-title">${esc(plain(u.name))}</h3>
      <dl class="vai-dl"><div><dt>Trigger</dt><dd>${esc(plain(u.trigger))}</dd></div><div><dt>Human handoff</dt><dd>${esc(plain(u.handoff_rule))}</dd></div>
      <div><dt>KPIs</dt><dd class="vai-kpi-chips">${(u.kpis || []).map(k => `<span>${esc(plain(k))}</span>`).join('')}</dd></div></dl>
      <details class="vai-details"><summary>Call flow and risks</summary><ol>${(u.flow || []).map(f => `<li>${esc(plain(f))}</li>`).join('')}</ol>${u.risk_notes && !broken(u.risk_notes) ? `<p><b>Risk:</b> ${esc(plain(u.risk_notes))}</p>` : ''}<p class="vai-formula-lite sys-num">${esc(plain(u.value_formula))}</p>${ucSrc(u) ? `<p class="sys-src"><b>Evidence:</b> ${ucSrc(u)}</p>` : ''}</details>
      <div class="sys-card-foot"><span><b class="sys-num vai-uc-v">${money(u.est_annual_value_usd)}</b>${EST}</span><span class="sys-muted">a year</span></div>
    </article>`).join('');
  };
  $$('#uc-filters .sys-chip').forEach(b => b.onclick = () => { cur = b.dataset.c; store.set('vai-co', cur); render(); });
  render();
}

/* ── 6. Vendors ───────────────────────────────────────────────────────── */
function vendors(items) {
  const vs = items.filter(i => i.kind === 'vendor');
  $('#pick').innerHTML = [
    ['Weeks 1–6 · pilot', 'Trades-native answering', 'Run a two-week bake-off on one brand\'s after-hours line: ServiceTitan\'s Voice Agent (70% booking reported) against Avoca (ServiceTitan-certified). Keep the one that books more jobs.'],
    ['Months 3–12 · portfolio engine', 'Own the stack', 'Build one shared engine (Twilio, Deepgram, Claude, ElevenLabs; Vapi or Retell) at about $0.12 a minute. It serves CET emergency lines, the Frontline desk and Thomas Scientific reorders.'],
    ['Benchmarks, not picks', 'Price ceilings and specialists', 'Smith.ai ($1.67–$3 a call) and Goodcall set the price ceiling for bought answering. Hatch covers speed-to-lead texting and Rilla coaches in-home sales.'],
  ].map(([lbl, h, p]) => `<div class="sys-card"><span class="sys-card-label">${esc(lbl)}</span><h3 class="sys-card-title">${esc(h)}</h3><p class="sys-card-body">${esc(p)}</p><p class="sys-src">Analyst recommendation, not vendor-endorsed.</p></div>`).join('');
  const types = ['all', ...new Set(vs.map(v => v.type))];
  let cur = 'all';
  $('#v-filters').innerHTML = `<div class="sys-chips">${types.map(t => `<button type="button" class="sys-chip" data-t="${t}">${t === 'all' ? 'All types' : esc(cap(t))} <span class="sys-muted sys-num">${t === 'all' ? vs.length : vs.filter(v => v.type === t).length}</span></button>`).join('')}</div>`;
  const render = () => {
    $$('#v-filters .sys-chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === cur)));
    $('#v-table tbody').innerHTML = vs.filter(v => cur === 'all' || v.type === cur).map(v => `<tr>
      <td><b>${esc(v.vendor)}</b><span class="vai-s">${srcLink(v.source_url)} · ${esc(RETRIEVAL[v.retrieval_status] || 'source page')}</span></td>
      <td><span class="vai-tag">${esc(cap(v.type))}</span></td>
      <td class="w-200">${esc(plain(v.pricing_note) || '—')}</td>
      <td class="w-160">${esc((v.integrations || []).join(', ') || '—')}</td>
      <td class="w-150">${esc(plain(v.languages) || '—')}${v.latency_note ? `<span class="vai-s">${esc(plain(v.latency_note))}</span>` : ''}</td>
      <td class="w-260">${esc(plain(v.notable_customers_or_cases) || '—')}</td></tr>`).join('');
  };
  $$('#v-filters .sys-chip').forEach(b => b.onclick = () => { cur = b.dataset.t; render(); });
  render();
}

/* ── 6b. Reference platforms + pipeline + stack ───────────────────────── */
/* Pipeline tools in plain English everywhere; the function names never reach visible text. */
const TOOL_INFO = {
  customer_lookup: ['Look up the customer', 'Customer, location and equipment from ServiceTitan, by phone or address'],
  check_capacity: ['Check capacity', 'Open windows for the ZIP code, job type and priority'],
  book_job: ['Book the job', 'A job number on the dispatch board'],
  send_payment_link: ['Text a payment link', 'A secure link by text; no card details are spoken'],
  page_on_call: ['Page the on-call technician', 'An acknowledgement from the technician'],
  transfer_to_human: ['Hand off to a person', 'A warm transfer with a spoken and written summary'],
  log_disposition: ['Log the outcome', 'Outcome and notes on the call record'],
};
const toolName = t => String(t).split(/\(|\s/)[0];
function playbook(items) {
  const refs = items.filter(i => i.kind === 'reference_platform');
  const card = (r, feature) => `<article class="sys-card vai-ref${feature ? ' sys-card--feature vai-ref--feature' : ''}">
    <div class="vai-ref-col"><h3 class="sys-card-title">${esc(r.company)}</h3><p class="vai-ref-meta">${esc(plain(r.hq))} · ${esc(plain(r.sector))}</p>
      <div class="sys-chips vai-ref-chs">${(r.channels || []).map(c => `<span class="sys-chip">${esc(cap(plain(c)))}</span>`).join('')}</div>
      ${feature ? `<p class="sys-card-label">Funding</p><p class="sys-card-body">${esc(plain(r.funding_note))}</p>` : ''}</div>
    <div class="vai-ref-col"><p class="sys-card-label">What it automates</p><p class="sys-card-body">${esc(plain(r.what_it_automates))}</p><p class="sys-card-label">Published outcomes<span class="sys-est sys-est--illus">vendor-reported</span></p><p class="sys-card-body">${esc(plain(r.published_outcomes))}</p></div>
    <div class="vai-ref-col"><p class="sys-card-label">What to borrow for home services</p><p class="vai-borrow">${esc(plain(r.what_to_borrow_for_home_services))}</p>${feature ? '' : `<p class="sys-src">${esc(plain(r.funding_note || ''))}</p>`}<p class="sys-src"><b>Source:</b> ${srcLink(r.source_url)}</p></div>
  </article>`;
  $('#refs').innerHTML = refs.map((r, i) => card(r, i === 0 && /elise/i.test(r.company))).join('');

  const a = items.find(i => i.kind === 'architecture'); if (!a) return;
  const lb = a.latency_budget; const P = a.pipeline;
  $('#arch-sub').textContent = `${plain(a.name)}. Targets follow Twilio's latency guide: a ${lb.platform_turn_gap_target_ms.toLocaleString()} ms platform turn gap (upper limit ${lb.platform_upper_ms.toLocaleString()} ms) and ${lb.mouth_to_ear_target_ms.toLocaleString()} ms mouth to ear (upper limit ${lb.mouth_to_ear_upper_ms.toLocaleString()} ms). People leave about ${lb.human_benchmark_ms} ms between turns.`;
  const ms = h => typeof h.budget_ms === 'number' ? `${h.budget_ms} ms <small>/ ${h.upper_ms} upper</small>` : '~230 ms <small>network</small>';
  const icon = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1z" fill="currentColor"/></svg>';
  $('#pipe').innerHTML = `<div class="vai-hop vai-hop--caller"><div class="vai-hop-box">${icon}<span class="vai-hop-n sys-num">00</span><h4>Caller</h4><p>Dials a brand tracking number at 2 a.m. or during a storm. Every turn gap above about 1.4 seconds feels broken.</p><span class="vai-ms sys-num">${lb.human_benchmark_ms} ms <small>human gap</small></span></div></div>` +
    P.map((h, i) => `<div class="vai-hop"><div class="vai-hop-box"><span class="vai-hop-n sys-num">0${i + 1}</span><h4>${esc(cap(plain(h.hop)))}</h4><p>${esc(plain(h.what))}</p><span class="vai-ms sys-num">${ms(h)}</span>${h.tools ? `<ul class="vai-hop-tools">${h.tools.map(t => `<li>${esc(TOOL_INFO[toolName(t)]?.[0] || plain(toolName(t)))}</li>`).join('')}</ul>` : ''}</div></div>`).join('');
  $('#handoff').innerHTML = `<svg class="sys-note-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 9h6m-2.5-2.5L21 9l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><div><b>Human handoff: the agent hands the caller to a person</b><p>${esc(plain(a.human_handoff))}</p><p><b>Logging and QA.</b> ${esc(plain(a.logging_qa))}</p></div>`;
  const segs = [['Telephony and network', 230, 1, 'Network'], ['Streaming speech recognition', P[1].budget_ms, 2, 'Speech'], ['Language model first token', P[2].budget_ms, 3, 'Model'], ['Voice first byte', P[3].budget_ms, 4, 'Voice']];
  const tot = segs.reduce((x, s) => x + s[1], 0);
  $('#budget').innerHTML = `<p class="sys-card-label">Latency budget per turn (targets)</p>
    <div class="vai-budget-bar" role="img" aria-label="Latency budget: ${segs.map(s => s[0] + ' ' + s[1] + ' ms').join(', ')}">${segs.map(s => `<div class="b${s[2]}" style="flex:${s[1]}" title="${esc(s[0])}: ${s[1]} ms">${esc(s[3])} ${s[1]}</div>`).join('')}</div>
    <div class="vai-budget-meta"><span>Sum of hop targets <b class="sys-num">${tot.toLocaleString()} ms</b> against a <b class="sys-num">${lb.mouth_to_ear_target_ms.toLocaleString()} ms</b> mouth-to-ear target and a <b class="sys-num">${lb.mouth_to_ear_upper_ms.toLocaleString()} ms</b> upper limit</span><span>${esc(plain(lb.tool_call_rule))}</span></div>`;
  const cb = a.est_cost_breakdown_per_minute || {};
  const nice = { telephony_inbound: 'Telephony (inbound)', recording: 'Recording', asr_deepgram_nova3: 'Speech recognition · Deepgram Nova-3', llm_estimate: 'Language model', tts_estimate: 'Voice', orchestration_vapi: 'Orchestration · Vapi' };
  $('#costrow').innerHTML = Object.entries(cb).map(([k, v]) => `<div><b class="sys-num">$${v}${/estimate/.test(k) ? EST : ''}</b><span>${esc(nice[k] || plain(k))} a minute</span></div>`).join('') +
    `<p class="vai-cost-tot"><b class="sys-num">$${a.est_cost_per_minute_usd} a minute</b> all-in${EST} · ${esc(plain(a.est_cost_note))} ${srcLink(a.source_url, 'Twilio latency guide')}</p>`;

  const order = ['telephony', 'asr', 'llm', 'tts', 'orchestration'];
  const LAYER = { telephony: 'Telephony', asr: 'Speech recognition', llm: 'Language model', tts: 'Voice', orchestration: 'Orchestration' };
  const st = items.filter(i => i.kind === 'asr_stack').sort((x, y) => order.indexOf(x.layer) - order.indexOf(y.layer));
  const llmHop = P.find(h => h.tools) || { tools: [] };
  $('#stack-table tbody').innerHTML = st.map(s => `<tr><td><span class="vai-tag">${esc(LAYER[s.layer] || cap(s.layer))}</span></td><td><b>${esc(s.product)}</b><span class="vai-s">${srcLink(s.source_url)}</span></td><td class="w-220">${esc(plain(s.accuracy_or_latency_note) || '—')}</td><td class="w-200">${esc(plain(s.pricing_note) || 'Not published')}</td><td class="w-260">${esc(plain(s.why_it_matters_for_a_dispatch_call))}</td></tr>`).join('') +
    `<tr class="vai-tr-group"><th colspan="5" scope="rowgroup">Agent tools the language model can call</th></tr>` +
    llmHop.tools.map(t => { const n = toolName(t); const [what, ret] = TOOL_INFO[n] || [plain(n), '']; return `<tr><td><span class="vai-tag">Tool</span></td><td><b>${esc(what)}</b></td><td colspan="2" class="w-220">${esc(ret || '—')}</td><td class="w-260">Called by the language model during the turn; slow calls get a spoken filler so the gap stays under 1.4 seconds.</td></tr>`; }).join('');
}

/* ── 7. Governance ────────────────────────────────────────────────────── */
function governance(items) {
  $('#gov').innerHTML = items.filter(i => i.kind === 'governance').map(g => `<article class="sys-card vai-gv">
    <h3 class="sys-card-title">${esc(plain(g.topic))}</h3>
    <div class="sys-note sys-note--good"><div><b>Portfolio policy.</b> ${esc(plain(g.policy_for_portfolio))}</div></div>
    <p class="sys-card-body">${esc(plain(g.finding))}</p>
    <div class="sys-chips">${(g.company_applies || []).filter(c => CO[c]).map(c => `<span class="sys-chip" data-co="${c}">${esc(CO[c].name)}</span>`).join('')}</div>
    <p class="sys-src"><b>Source:</b> ${srcLink(g.source_url)} · ${esc(RETRIEVAL[g.retrieval_status] || 'source page')}</p></article>`).join('');
}

/* ── 8. Rollout ───────────────────────────────────────────────────────── */
const WEEKS = [
  ['Calibrate and choose', ['Pull ServiceTitan call tracking (missed and abandoned by hour), booking-rate reports and the membership export', 'Replace every model assumption on this page', 'Clean the member contact list', 'Vendor bake-off: ServiceTitan Voice Agent vs Avoca'], 'Baseline signed off by Punctual Pros operations and finance'],
  ['Build and test', ['Brand personas for One Hour, Ben Franklin and Mister Sparky', 'Safety screen, fee wording and greeting scripted', 'Tools wired: lookup, capacity, booking, SMS, paging', 'A 100-call test suite: gas smell, CO alarm, Spanish speakers, angry callers'], 'Greeting correct on 100% of test calls and zero wrong safety instructions'],
  ['After-hours line live', ['Shadow mode for three nights, then live on one brand, then all brands', 'Warm transfer to the on-call manager within 60 seconds', 'Daily transcript review'], 'After-hours booking rate at or above the answering-service baseline; escalations at or under 20%'],
  ['Overflow and speed-to-lead', ['Daytime overflow on ring three', 'National Weather Service warnings switch on storm triage', 'Web-form and Local Services leads called back in under 60 seconds'], 'Abandon rate down with rep occupancy steady'],
  ['Member outbound', ['Day-before confirmations and ETA line', 'Membership renewal and fall tune-up campaign for members who asked for reminders', 'Anyone who asks to stop is taken off the list at once'], 'Stop requests and complaints under the agreed threshold'],
  ['Spanish line and readout', ['Spanish line for Lancaster City', 'Automated scoring of 100% of transcripts plus human review of a weighted 5% sample', 'Scorecard to the PRG', 'Go or no-go for Horvath NJ and the CET emergency line'], 'Booked revenue per inbound call above baseline'],
];
function rollout() {
  $('#weeks').innerHTML = WEEKS.map(([h, list, gate], i) => `<article class="sys-card vai-wk"><span class="sys-card-label">Week ${i + 1}</span><div class="vai-prog" aria-hidden="true"><i style="width:${(i + 1) / 6 * 100}%"></i></div><h3 class="sys-card-title">${esc(h)}</h3><ul class="sys-card-list">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="vai-gate"><b>Gate</b>${esc(gate)}</p></article>`).join('');
}

/* ── Chat FAQ ─────────────────────────────────────────────────────────── */
function faq(meta, items) {
  const m = meta.pp_revenue_model; const a = items.find(i => i.kind === 'architecture'); const s = m.sensitivity;
  const ucs = items.filter(i => i.kind === 'use_case');
  return [
    { q: 'How much revenue does 24/7 voice AI recover?', href: '#calculator', a: `<p>For Punctual Pros the conservative model recovers about <b>${money(m.recovered_revenue_annual_usd)} a year</b> (est.) from calls that go unanswered today. Consented outbound renewals add <b>${money(m.outbound_renewal_uplift_usd)}</b>, for a total of <b>${money(m.total_est_usd)}</b>, or about ${(m.share_of_pp_revenue * 100).toFixed(1)}% of revenue.</p><p><small>${esc(plain(m.recovered_revenue_formula))}</small></p><p>Sensitivity: at Invoca's 35% miss rate it is ${money(s['missed_share_0.35_invoca_industry'])}; at ServiceTitan's 70% AI booking rate, ${money(s['booking_0.70_servicetitan_ai'])}; if every booking is incremental, ${money(s['incrementality_1.0'])}. Try your own inputs in the <a href="#calculator">calculator</a>.</p>` },
    { q: 'Play the after-hours no-heat call', href: '#play-noheat', a: `<p>It is 2:10 a.m. in Lititz, PA, the furnace has quit and there is a baby in the house. The One Hour AI dispatcher says it is the virtual assistant, runs the gas and CO safety screen, finds the customer in ServiceTitan, marks the job priority and books the on-call technician for 3:15–4:15 a.m. in about <b>1:35</b>.</p><p><a href="#play-noheat">▶ Play the call</a> (your browser reads the agent's lines aloud).</p>` },
    { q: 'Which vendor should Punctual Pros pick?', href: '#vendors', a: `<p><b>Pilot on a trades-native product, then own the engine.</b></p><ul><li><b>Weeks 1–6:</b> a bake-off between ServiceTitan's Voice Agent (native dispatch and capacity, 70% booking reported) and Avoca (ServiceTitan-certified, H.L. Bowman runs 70% of its calls through it) on one brand's after-hours line.</li><li><b>Months 3–12:</b> a shared portfolio engine built on Twilio, Deepgram, Claude and ElevenLabs or Cartesia via Vapi, Retell or LiveKit, at about $${a?.est_cost_per_minute_usd ?? 0.12} a minute, which is ~$0.46 for a 4-minute call against $1.67–$3 a call bought.</li></ul><p><small>Analyst recommendation; vendor outcomes are self-reported.</small></p>` },
    { q: 'What does a voice AI call cost per minute?', href: '#pipeline', a: `<p>A self-built cascaded stack runs about <b>$${a?.est_cost_per_minute_usd}/min</b> (est.): telephony $0.0085, recording $0.0025, Deepgram ASR $0.0048, LLM ~$0.03, TTS ~$0.02 and Vapi orchestration $0.05. ${esc(plain(a?.est_cost_note || ''))}</p>` },
    { q: 'What is the 6-week rollout?', href: '#rollout', a: `<ol>${WEEKS.map(([h, , g]) => `<li><b>${esc(h)}</b> (gate: ${esc(g)})</li>`).join('')}</ol>` },
    { q: 'How fast does a voice agent need to respond? Latency budget', href: '#pipeline', a: `<p>People leave about 200 ms between turns. The budget per turn is telephony ~230 ms, streaming ASR 350 ms, LLM first token 375 ms and TTS 100 ms, against a 1,115 ms mouth-to-ear target and a 1,400 ms upper limit. Tool calls slower than ~700 ms get a spoken filler.</p>` },
    { q: 'What happens when the caller wants a human? Handoff and escalation', href: '#pipeline', a: `<p>${esc(plain(a?.human_handoff || ''))}</p>` },
    { q: 'How does the EliseAI model apply to home services?', href: '#pipeline', a: `<p>EliseAI (New York) runs one AI assistant across voice, SMS, email and chat for about one in six US apartments. It raised $350M at a $4B valuation in September 2026. The lesson for Punctual Pros is to run the same assistant on every channel at every hour, book into live capacity, and measure booked jobs and after-hours share rather than call-center savings.</p>` },
    { q: 'What is the missed-call revenue clock?', href: '#main', a: `<p>The hero clock adds about <b>$${m.missed_revenue_counter.per_second_usd}</b> a second (${usd(m.missed_revenue_counter.annual_usd)} a year ÷ seconds in a year), counted from January 1. That is about ${m.missed_revenue_counter.missed_calls_per_day} missed calls a day. It is a modelled estimate for Punctual Pros, not a measured loss.</p>` },
    { q: 'Which other portfolio companies can use voice AI?', href: '#usecases', a: `<ul>${ucs.filter(u => u.company !== 'pp').map(u => `<li><b>${esc(CO[u.company].name)}</b>: ${esc(plain(u.name))} (${money(u.est_annual_value_usd)} a year, est.)</li>`).join('')}</ul>` },
  ];
}

/* ── Boot ─────────────────────────────────────────────────────────────── */
export async function boot() {
  const d = await Data.research('research/voice_ai');
  if (!d?.meta) { $('#kpis').innerHTML = '<p class="sys-muted">The voice AI research could not be loaded.</p>'; return { faq: [] }; }
  const { meta, items } = d;
  const run = (name, fn) => { try { fn(); } catch (e) { console.warn(`voice-ai: ${name} failed`, e); } };
  run('hero', () => hero(meta));
  run('timeline', () => timeline(meta));
  run('demo', () => demo(items.filter(i => i.kind === 'sample_call')));
  run('calculator', () => calculator(meta, items));
  run('usecases', () => useCases(items));
  run('vendors', () => vendors(items));
  run('playbook', () => playbook(items));
  run('governance', () => governance(items));
  run('rollout', rollout);
  $('#caveats').innerHTML = (meta.caveats || []).filter(c => !broken(c)).map(c => `<li>${esc(plain(c))}</li>`).join('');
  return { faq: faq(meta, items) };
}
