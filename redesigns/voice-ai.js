/* 24/7 Voice AI — the growth engine. Renders data/research/voice_ai.json into the page.
   No framework, no build step. Every dollar figure is an estimate and is labelled so. */
import { Data } from '../assets/core.js?v=20261006085442';

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

const CO = {
  pp: { name: 'Punctual Pros', hex: '#e0592a' }, cet: { name: 'CET', hex: '#2a78d6' }, fl: { name: 'Frontline', hex: '#7c5cd6' },
  ts: { name: 'Thomas Scientific', hex: '#0c8a63' }, bpi: { name: 'BPI', hex: '#c2386f' }, fh: { name: 'Fair Harbor', hex: '#1593a8' },
};

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
    [money(m.recovered_revenue_annual_usd), 'Revenue recovered a year from calls that go unanswered today', 'inbound · after-hours + overflow'],
    [money(m.outbound_renewal_uplift_usd), 'Membership renewal uplift a year from consented outbound calls', `${(6000).toLocaleString()} members × 8-pt lift (assumption)`],
    [money(m.total_est_usd), `Total a year, about ${Math.round(m.share_of_pp_revenue * 1000) / 10}% of Punctual Pros revenue`, 'before speed-to-lead, Spanish, no-shows'],
    [`${(m.missed_share * 100).toFixed(1)}%`, `of ~${m.inbound_calls_per_month.toLocaleString()} inbound calls a month missed today`, `range ${m.missed_share_range.map(x => Math.round(x * 100) + '%').join('–')}`],
  ];
  $('#kpis').innerHTML = k.map(([v, l, s]) => `<div class="kpi"><div class="kpi-v">${esc(v)}</div><div class="kpi-l">${esc(l)}</div><div class="kpi-s"><span class="est" style="margin:0 4px 0 0">est.</span>${esc(s)}</div></div>`).join('');
  $('#wave').innerHTML = Array.from({ length: 36 }, (_, i) => `<span style="--h:${30 + Math.round(60 * Math.abs(Math.sin(i * 1.7)))}%;animation-delay:${(i % 9) * -0.13}s"></span>`).join('');
  clock(m);
}

function clock(m) {
  const c = m.missed_revenue_counter; const rows = hourly(m);
  const how = $('#clock-how');
  how.innerHTML = `<code>${esc(usd(c.annual_usd))} a year ÷ seconds in a year = $${c.per_second_usd} a second</code>, counted from January 1 in your time zone. The annual figure is the revenue the AI layer is modelled to recover: <code>${esc(m.recovered_revenue_formula)}</code>. This is a modelled estimate for Punctual Pros, not a measured loss. Calibrate it against ServiceTitan call tracking in week 1.`;
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
  const COL = { csr: 'var(--csr)', miss: 'var(--miss)', ai: 'var(--ai)' };
  let mode = 'today';
  let W, H, iw, ih, bw, narrow; const L = 30, R = 6, T = 16, B = 28;
  const max = Math.ceil(Math.max(...rows.map(r => r.calls)) / 2) * 2;
  const y = v => T + ih - v / max * ih;
  const size = () => { W = Math.max(300, Math.round($('#tl-chart').clientWidth || 960)); narrow = W < 600; H = narrow ? 220 : 250; iw = W - L - R; ih = H - T - B; bw = iw / 24; };
  const legend = () => { $('#tl-legend').innerHTML = (mode === 'today'
    ? [['csr', 'Answered by CSR / answering service'], ['miss', 'Missed or abandoned']]
    : [['csr', 'Answered by CSR'], ['ai', 'Answered by AI agent'], ['miss', 'Still lost (hang-ups, non-leads)']]).map(([k, l]) => `<span><i style="background:${COL[k]}"></i>${esc(l)}</span>`).join(''); };
  const draw = () => {
    size(); let g = '';
    // after-hours bands
    g += `<rect x="${L}" y="${T}" width="${bw * 8}" height="${ih}" fill="#0f1424" opacity=".045"/><rect x="${L + bw * 17}" y="${T}" width="${bw * 7}" height="${ih}" fill="#0f1424" opacity=".045"/>`;
    g += `<text class="lab" x="${L + 6}" y="${T + 12}">${narrow ? 'After' : 'After hours'}</text><text class="lab" x="${L + bw * 8 + 6}" y="${T + 12}">${narrow ? 'Staffed' : 'Staffed 8 a.m.–5 p.m.'}</text><text class="lab" x="${L + bw * 17 + 6}" y="${T + 12}">${narrow ? 'After' : 'After hours'}</text>`;
    for (let v = 0; v <= max; v += max / 4) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e2da" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
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
      g += `<rect class="hit" data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" fill="transparent" style="cursor:pointer"><title>${r.h}:00</title></rect>`;
    });
    $('#tl-chart').innerHTML = `<svg class="tl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calls by hour of day, ${mode === 'today' ? 'today' : 'with 24/7 voice AI'}">${g}</svg>`;
    $$('#tl-chart .hit').forEach(el => { const show = () => read(+el.dataset.i); el.addEventListener('mouseenter', show); el.addEventListener('click', show); });
    legend(); summary();
  };
  const lab = h => new Date(2026, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' });
  const read = i => { const r = rows[i];
    $('#tl-read').innerHTML = `<b>${lab(r.h)}–${lab((r.h + 1) % 24)}</b> · ${r.staffed ? 'staffed' : 'after hours'} · <b>${r.calls.toFixed(1)}</b> calls/day · ` + (mode === 'today'
      ? `<b style="color:var(--miss)">${r.missed.toFixed(2)}</b> missed (${r.staffed ? '12% daytime' : '35% after-hours'} rate)`
      : `<b style="color:var(--ai)">${(r.staffed ? r.recovered : r.calls - r.residual).toFixed(2)}</b> answered by AI · <b>${r.residual.toFixed(2)}</b> still lost`); };
  const summary = () => {
    const sum = k => rows.reduce((a, r) => a + r[k], 0); const calls = sum('calls'), missed = sum('missed'), rec = sum('recovered');
    const ah = rows.filter(r => !r.staffed).reduce((a, r) => a + r.missed, 0);
    const jobs = rec * m.booking_rate * m.incrementality;
    const tiles = mode === 'today'
      ? [[calls.toFixed(0), 'inbound calls a day'], [missed.toFixed(1), 'calls missed a day'], [ah.toFixed(1), 'of those after hours'], [usd(m.missed_revenue_counter.per_day_usd), 'job revenue lost a day']]
      : [[calls.toFixed(0), 'inbound calls a day'], [(missed - rec).toFixed(1), 'calls still lost a day'], [jobs.toFixed(1), 'incremental jobs booked a day'], [usd(jobs * m.avg_ticket), 'job revenue recovered a day']];
    $('#tl-sum').innerHTML = tiles.map(([v, l]) => `<div><b>${esc(v)}<span class="est">est.</span></b><span>${esc(l)}</span></div>`).join('');
  };
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const w = $('#tl-chart').clientWidth; if (Math.abs(w - W) > 8) draw(); }, 150); });
  $$('[data-tl]').forEach(b => b.onclick = () => { mode = b.dataset.tl; $$('[data-tl]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  $('#tl-assume').innerHTML = [
    `Volume: ${m.inbound_calls_per_month.toLocaleString()} inbound calls a month ÷ 30.42 days ≈ ${(m.inbound_calls_per_month / 30.42).toFixed(0)} a day, backed out of the ~$22M revenue estimate (call volume is not public).`,
    `Split: 12% of calls arrive outside staffed hours (ServiceTitan 2025 HVAC data runs from 9.8% in October to 14.1% in June). Weekend calls are folded into the after-hours hours, and the hourly shape inside each block is illustrative.`,
    `Missed today: 35% of after-hours calls (ServiceTitan: trades lose 30–40%) and 12% of daytime calls (assumption for a staffed CSR team, well below Invoca's 35% industry rate). Blended rate ${(m.missed_share * 100).toFixed(1)}%.`,
    `With AI: ${Math.round(m.recovered_share_with_ai * 100)}% of would-be-missed calls are recovered. The rest hang up on hearing an assistant or are spam, vendors or wrong numbers. Jobs = recovered × ${m.booking_rate} booked × ${m.incrementality} incremental × $${m.avg_ticket.toLocaleString()} ticket.`,
  ].map(x => `<li>${esc(x)}</li>`).join('');
  if (new URLSearchParams(location.search).get('tl') === 'ai') $('[data-tl="ai"]').click(); else draw();
  read(2);
}

/* ── 3. Call demo ─────────────────────────────────────────────────────── */
const TOOLS = {
  'call-pp-noheat': [
    [0, 'call.answer', 'brand=One Hour · after_hours=true', 'ring 1 · disclosure + recording notice'],
    [4, 'customer_lookup', 'phone=caller_id', 'Jordan Miller · 412 Maple Ave, Lititz 17543'],
    [6, 'equipment_on_file', 'location_id', 'gas furnace 2011 · tune-up Mar'],
    [8, 'check_capacity', 'zip=17543, job=no_heat, priority=infant', 'on-call Marcus · 3:15–4:15 a.m.'],
    [10, 'book_job + page_on_call', 'trade=hvac, priority=P1', 'job booked · tech acknowledged'],
    [10, 'send_sms', 'confirmation + after-hours fee terms', 'delivered'],
    [13, 'log_disposition', 'booked · recording_notice ✓ · ai_disclosed ✓', 'written to job record'],
  ],
  'call-pp-storm': [
    [0, 'queue_status', 'line=Ben Franklin', 'all CSRs busy · NWS flash-flood warning → overflow on ring 3'],
    [6, 'zip_check', 'zip=17552 (Mount Joy)', 'in service area (pp_zips)'],
    [8, 'check_capacity', 'job=active_water, triage=storm', '1–2 p.m. today · pump on truck'],
    [10, 'add_job_note', 'water-heater safety check', 'saved'],
    [12, 'book_job + send_sms', 'mobile …4417', 'booked ahead of non-urgent calls'],
    [14, 'log_disposition', 'booked · storm_mode · recording_notice ✓', 'written to job record'],
  ],
  'call-pp-renewal': [
    [0, 'consent_check', 'member · outbound', 'TCPA consent on file · within 8 a.m.–9 p.m.'],
    [0, 'customer_lookup', 'member_id', 'Linda Hoover · renews Oct 31'],
    [2, 'log_ai_disclosure', 'asked "is this a robot?"', 'answered truthfully · human offered'],
    [6, 'invoice_history', 'last 12 months', 'Jan igniter repair · member discount applied'],
    [8, 'send_payment_link', 'card on file · no card data in voice', 'SMS sent'],
    [8, 'check_capacity', 'job=furnace_tune_up', 'Tue Oct 13 8–9 a.m. · Thu Oct 15 1–2 p.m.'],
    [10, 'book_job', 'tune-up · Tue Oct 13 8–9 a.m.', 'booked · renewal accepted'],
    [13, 'log_disposition', 'renewed + booked · consent source logged', 'written to member record'],
  ],
};
const BLURB = { 'call-pp-noheat': 'After hours · inbound', 'call-pp-storm': 'Storm overflow · inbound', 'call-pp-renewal': 'Membership · outbound' };

function demo(calls) {
  const S = { call: calls[0], token: 0, playing: false, voiceOn: true };
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice = null;
  const pickVoice = () => { if (!synth) return; const vs = synth.getVoices() || []; voice = vs.find(v => /^en[-_]US$/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; };
  if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch { synth.onvoiceschanged = pickVoice; } }
  const note = $('#voice-note');
  note.textContent = synth ? 'Agent lines are spoken by your browser\'s built-in en-US voice. Turn Voice off for a text-only run. Sample calls are illustrative scripts with fictional customers.' : 'Your browser does not support speech synthesis, so the demo runs text-only. Sample calls are illustrative scripts with fictional customers.';
  if (!synth) { $('#pl-voice').setAttribute('aria-pressed', 'false'); $('#pl-voice').textContent = 'Text only'; $('#pl-voice').disabled = true; S.voiceOn = false; }

  $('#calls').innerHTML = calls.map((c, i) => `<button type="button" class="callbtn" data-c="${esc(c.id)}" aria-pressed="${i === 0}"><small>${esc(BLURB[c.id] || c.company)}</small><b>${esc(c.title)}</b><span>${esc(c.brand)} · books in ${mmss(c.time_to_book_seconds)}</span></button>`).join('');
  $$('#calls .callbtn').forEach(b => b.onclick = () => select(b.dataset.c));

  const words = s => s.split(/\s+/).length;
  const thread = $('#thread'), tools = $('#tools'), clockEl = $('#pl-clock'), playBtn = $('#pl-play');
  const setPlay = on => { S.playing = on; playBtn.querySelector('span').textContent = on ? 'Stop' : 'Play'; playBtn.querySelector('svg').innerHTML = on ? '<rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/>' : '<path d="M2 1l9 5-9 5z" fill="currentColor"/>'; };
  const stop = () => { S.token++; if (synth) synth.cancel(); setPlay(false); };
  const reset = () => {
    const c = S.call; $('#pl-title').innerHTML = `<b>${esc(c.title)}</b><span>${esc(c.brand)} · ${c.lines.length} turns · scripted</span>`;
    thread.innerHTML = `<div class="empty"><b>Press Play</b>The agent answers on ring one. Agent lines are read aloud and caller lines type in as the call runs.</div>`;
    tools.innerHTML = ''; clockEl.textContent = '0:00';
  };
  const select = id => { stop(); S.call = calls.find(c => c.id === id) || calls[0]; $$('#calls .callbtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === S.call.id))); reset(); };
  const simTimes = c => { const tot = c.lines.reduce((a, l) => a + words(l.text), 0); let acc = 0; return c.lines.map(l => (acc += words(l.text)) / tot * c.time_to_book_seconds); };
  const addTools = (i, c) => (TOOLS[c.id] || []).filter(t => t[0] === i).forEach(([, n, a, r]) => tools.insertAdjacentHTML('beforeend', `<div class="tool"><b>${esc(n)}</b>(${esc(a)})<br><i>→ ${esc(r)}</i></div>`));
  const bubble = l => { const d = document.createElement('div'); d.className = `msg ${l.speaker === 'Agent' ? 'agent' : 'caller'}`; d.innerHTML = `<span class="who">${l.speaker === 'Agent' ? 'AI agent' : 'Caller'}</span><span class="tx"></span>`; thread.appendChild(d); thread.scrollTop = thread.scrollHeight; return d; };
  const outcome = c => { thread.insertAdjacentHTML('beforeend', `<div class="outcome" role="status"><b class="big">Booked in ${mmss(c.time_to_book_seconds)}</b>${esc(c.outcome)}<div style="margin-top:6px;font-size:12px;opacity:.8">Today, without the agent, this call ${c.id === 'call-pp-renewal' ? 'would depend on a CSR finding time to dial the member list.' : c.id === 'call-pp-storm' ? 'rings out while every CSR is on another storm call.' : 'goes to voicemail or an answering service that takes a message.'}</div></div>`); thread.scrollTop = thread.scrollHeight; };
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
  const player = $('.player');
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
    { id: 'book', l: 'Booking rate on recovered calls', min: 20, max: 90, step: 1, v: m.booking_rate * 100, f: v => Math.round(v) + '%', n: 'Invoca 45%. ServiceTitan AI reports 70% (90% when capacity is open). Typical human CSR: 42%.' },
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
  $('#fields').innerHTML = F.map(f => f.g ? `<div class="grp">${esc(f.g)}</div>` : f.type === 'select'
    ? `<div class="field"><label for="in-vendor">${esc(f.l)}</label><output></output><select id="in-vendor">${VENDORS.map(v => `<option value="${v.id}">${esc(v.label)}</option>`).join('')}</select><small>Public pricing from vendor pages, retrieved 2026-10-06. Trades-native pricing is not published.</small></div>`
    : `<div class="field"><label for="in-${f.id}">${esc(f.l)}</label><output id="o-${f.id}" for="in-${f.id}"></output><input type="range" id="in-${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.v}"><small>${esc(f.n)}</small></div>`).join('');
  $('#presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="chip" data-p="${i}" aria-pressed="${i === 0}">${esc(p.l)}</button>`).join('');
  $$('#presets .chip').forEach(b => b.onclick = () => { const p = PRESETS[+b.dataset.p]; Object.entries({ ...DEF, ...p.set }).forEach(([k, v]) => { const el = $('#in-' + k); if (el) el.value = v; }); $$('#presets .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); calc(); });
  const val = id => +$('#in-' + id).value;
  function calc() {
    F.filter(f => f.id && f.f).forEach(f => { $('#o-' + f.id).textContent = f.f(val(f.id)); });
    const calls = val('calls'), missed = val('missed') / 100, recov = val('recov') / 100, book = val('book') / 100, inc = val('inc') / 100, ticket = val('ticket');
    const missedM = calls * missed, recM = missedM * recov, bookedM = recM * book, jobsM = bookedM * inc;
    const inRevM = jobsM * ticket; const renewY = val('members') * val('lift') / 100 * val('mval');
    const revM = inRevM + renewY / 12, revY = revM * 12;
    const v = VENDORS.find(x => x.id === $('#in-vendor').value) || VENDORS[0];
    const outboundM = val('members') * 2 / 12; // two consented touches per member a year (renewal + tune-up)
    const handledM = calls * val('cover') / 100 + outboundM;
    const perCall = v.perCall ?? v.perMin * val('mins');
    const costM = handledM * perCall, costY = costM * 12;
    const netM = revM * val('margin') / 100 - costM; const payback = netM > 0 ? val('setup') / netM : Infinity;
    const roi = costY > 0 ? revY / costY : Infinity;
    const W = x => Math.max(1.5, Math.min(100, x / calls * 100));
    $('#calc-out').innerHTML = `
      <div class="out-cap">Recovered revenue a year <span class="est" style="background:rgba(255,209,102,.16);color:#ffd166">est.</span></div>
      <div class="out-big">${usd(revY)}</div>
      <div style="font-size:13px;color:#aeb6cf">${usd(revM)} a month · inbound ${usd(inRevM * 12)} + renewals ${usd(renewY)}</div>
      <div class="out-grid">
        <div><b>${Math.round(jobsM * 12).toLocaleString()}</b><span>incremental jobs a year</span></div>
        <div><b>${usd(costY)}</b><span>vendor cost a year · ${Math.round(handledM).toLocaleString()} calls/mo × $${perCall.toFixed(2)}</span></div>
        <div><b>${isFinite(payback) ? (payback < 1 ? '< 1 month' : payback.toFixed(1) + ' months') : 'n/a'}</b><span>payback on ${usd(val('setup'))} setup at ${val('margin')}% margin</span></div>
        <div><b>${isFinite(roi) ? Math.round(roi) + '×' : '—'}</b><span>recovered revenue per $1 of vendor cost (${revY ? (costY / revY * 100).toFixed(1) : 0}% of revenue)</span></div>
      </div>
      <div class="funnel" aria-label="Monthly inbound funnel">
        <div class="fn"><span>Inbound calls</span><div class="track"><div class="fill" style="width:100%"></div></div><b>${Math.round(calls).toLocaleString()}</b></div>
        <div class="fn"><span>Missed today</span><div class="track"><div class="fill m" style="width:${W(missedM)}%"></div></div><b>${Math.round(missedM).toLocaleString()}</b></div>
        <div class="fn"><span>Recovered by AI</span><div class="track"><div class="fill" style="width:${W(recM)}%"></div></div><b>${Math.round(recM).toLocaleString()}</b></div>
        <div class="fn"><span>Booked</span><div class="track"><div class="fill" style="width:${W(bookedM)}%"></div></div><b>${Math.round(bookedM).toLocaleString()}</b></div>
        <div class="fn"><span>Incremental jobs</span><div class="track"><div class="fill" style="width:${W(jobsM)}%"></div></div><b>${Math.round(jobsM).toLocaleString()}</b></div>
      </div>
      <div class="formula">${Math.round(calls).toLocaleString()} × 12 × ${+missed.toFixed(4)} missed × ${recov.toFixed(2)} recovered × ${book.toFixed(2)} booked × ${inc.toFixed(2)} incremental × ${usd(ticket)} = ${usd(inRevM * 12)}<br>+ ${Math.round(val('members')).toLocaleString()} members × ${(val('lift') / 100).toFixed(3)} lift × ${usd(val('mval'))} = ${usd(renewY)}</div>
      <p style="font-size:11.5px;color:#8f98b3;margin-top:12px">Outbound cost assumes two consented calls per member a year. The model leaves out speed-to-lead, unsold-estimate follow-up, no-show reduction, the Spanish line and CSR labor savings. These are valued separately in the catalog.</p>`;
  }
  $$('#calc input, #calc select').forEach(el => el.addEventListener('input', () => { $$('#presets .chip').forEach(x => x.setAttribute('aria-pressed', 'false')); calc(); }));
  calc();
}

/* ── 5. Use cases ─────────────────────────────────────────────────────── */
function useCases(items) {
  const ucs = items.filter(i => i.kind === 'use_case');
  const cos = ['all', ...Object.keys(CO).filter(k => ucs.some(u => u.company === k))];
  let cur = store.get('vai-co') || 'all'; if (!cos.includes(cur)) cur = 'all';
  $('#uc-filters').innerHTML = cos.map(c => `<button type="button" class="chip" data-co="${c}">${c === 'all' ? 'All companies' : esc(CO[c].name)} <span class="muted">${c === 'all' ? ucs.length : ucs.filter(u => u.company === c).length}</span></button>`).join('') + '<span class="sum" id="uc-sum"></span>';
  const render = () => {
    const list = ucs.filter(u => cur === 'all' || u.company === cur);
    $$('#uc-filters .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.co === cur)));
    $('#uc-sum').innerHTML = `${list.length} lines · <b class="mono">${money(list.reduce((a, u) => a + (u.est_annual_value_usd || 0), 0))}</b> a year <span class="est">est.</span>`;
    $('#uc-grid').innerHTML = list.map(u => `<article class="card uc">
      <div class="uc-top"><span class="co-dot"><span class="dot" style="background:${CO[u.company].hex}"></span>${esc(CO[u.company].name)}</span><span class="tag ${u.direction === 'inbound' ? 'in' : 'out'}">${esc(u.direction)}</span><span class="tag">${u.weeks_to_deploy} wks to deploy</span></div>
      <h3>${esc(u.name)}</h3>
      <dl><div><dt>Trigger</dt><dd>${esc(u.trigger)}</dd></div><div><dt>Human handoff</dt><dd>${esc(u.handoff_rule)}</dd></div>
      <div><dt>KPIs</dt><dd class="kpi-chips">${(u.kpis || []).map(k => `<span>${esc(k)}</span>`).join('')}</dd></div></dl>
      <details><summary>Call flow and risks</summary><ol>${(u.flow || []).map(f => `<li>${esc(f)}</li>`).join('')}</ol>${u.risk_notes ? `<p style="margin-top:6px"><b>Risk:</b> ${esc(u.risk_notes)}</p>` : ''}<p class="f">${esc(u.value_formula)}</p><p class="src">Evidence: ${srcLink(u.source_url)}</p></details>
      <div class="uc-val"><b>${money(u.est_annual_value_usd)}<span class="est">${esc(u.value_label === 'assumption' ? 'est.' : u.value_label)}</span></b><span>a year</span></div>
    </article>`).join('');
  };
  $$('#uc-filters .chip').forEach(b => b.onclick = () => { cur = b.dataset.co; store.set('vai-co', cur); render(); });
  render();
}

/* ── 6. Vendors ───────────────────────────────────────────────────────── */
function vendors(items) {
  const vs = items.filter(i => i.kind === 'vendor');
  $('#pick').innerHTML = [
    ['Weeks 1–6 · pilot', 'Trades-native answering', 'Run a two-week bake-off between ServiceTitan\'s Voice Agent (native dispatch board and Adaptive Capacity, 70% booking reported) and Avoca (ServiceTitan-certified, H.L. Bowman runs 70% of calls through it). Start on the after-hours line of one brand.'],
    ['Months 3–12 · portfolio engine', 'Own the stack', 'Build the shared engine on Twilio, Deepgram, Claude and ElevenLabs or Cartesia, orchestrated by Vapi, Retell or LiveKit, at about $0.12 a minute. One engine serves per-company agents: CET emergency lines, the Frontline desk, Thomas Scientific reorders.'],
    ['Benchmarks, not picks', 'Price ceilings and specialists', 'Smith.ai ($1.67–$3 a call) and Goodcall set the price ceiling for bought answering. Hatch (now Yelp) covers speed-to-lead texting. Rilla coaches in-home sales and does not answer calls.'],
  ].map(([lbl, h, p]) => `<div class="card"><div class="lbl">${esc(lbl)}</div><h3>${esc(h)}</h3><p>${esc(p)}</p><p class="src" style="margin-top:8px">Analyst recommendation · not vendor-endorsed</p></div>`).join('');
  const types = ['all', ...new Set(vs.map(v => v.type))];
  let cur = 'all';
  $('#v-filters').innerHTML = types.map(t => `<button type="button" class="chip" data-t="${t}">${t === 'all' ? 'All types' : esc(t)} <span class="muted">${t === 'all' ? vs.length : vs.filter(v => v.type === t).length}</span></button>`).join('');
  const render = () => {
    $$('#v-filters .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === cur)));
    $('#v-table tbody').innerHTML = vs.filter(v => cur === 'all' || v.type === cur).map(v => `<tr>
      <td><b>${esc(v.vendor)}</b><span class="s">${srcLink(v.source_url)} · ${esc(v.retrieval_status)}</span></td>
      <td><span class="vtype">${esc(v.type)}</span></td>
      <td style="min-width:200px">${esc(v.pricing_note || '—')}</td>
      <td style="min-width:160px">${esc((v.integrations || []).join(', '))}</td>
      <td style="min-width:150px">${esc(v.languages || '—')}${v.latency_note ? `<span class="s">${esc(v.latency_note)}</span>` : ''}</td>
      <td style="min-width:260px">${esc(v.notable_customers_or_cases || '—')}</td></tr>`).join('');
  };
  $$('#v-filters .chip').forEach(b => b.onclick = () => { cur = b.dataset.t; render(); });
  render();
}

/* ── 6b. Reference platforms + architecture + stack ───────────────────── */
function playbook(items) {
  const refs = items.filter(i => i.kind === 'reference_platform');
  const card = (r, feature) => `<article class="card ref ${feature ? 'feature' : ''}">
    <div><h3>${esc(r.company)}</h3><div class="meta">${esc(r.hq)} · ${esc(r.sector)}</div>
      <div class="chs" style="margin-top:8px">${(r.channels || []).map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div>
      ${feature ? `<div class="k" style="margin-top:12px">Funding</div><p>${esc(r.funding_note)}</p>` : ''}</div>
    <div><div class="k">What it automates</div><p>${esc(r.what_it_automates)}</p><div class="k" style="margin-top:8px">Published outcomes <span class="est">vendor-reported</span></div><p>${esc(r.published_outcomes)}</p></div>
    <div style="display:flex;flex-direction:column;gap:8px"><div class="k">What to borrow for home services</div><p class="borrow">${esc(r.what_to_borrow_for_home_services)}</p>${feature ? '' : `<p class="src">${esc(r.funding_note || '')}</p>`}<p class="src">${srcLink(r.source_url)}</p></div>
  </article>`;
  $('#refs').innerHTML = refs.map((r, i) => card(r, i === 0 && /elise/i.test(r.company))).join('');

  const a = items.find(i => i.kind === 'architecture'); if (!a) return;
  const lb = a.latency_budget; const P = a.pipeline;
  $('#arch-sub').textContent = `${a.name}. Component targets follow Twilio's latency guide: ${lb.platform_turn_gap_target_ms.toLocaleString()} ms platform turn gap (upper ${lb.platform_upper_ms.toLocaleString()}), ${lb.mouth_to_ear_target_ms.toLocaleString()} ms mouth-to-ear (upper ${lb.mouth_to_ear_upper_ms.toLocaleString()}). People leave about ${lb.human_benchmark_ms} ms between turns.`;
  const ms = h => typeof h.budget_ms === 'number' ? `${h.budget_ms} ms <small>/ ${h.upper_ms} upper</small>` : '~230 ms <small>network/PSTN</small>';
  const icons = {
    caller: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1z" fill="#3b4fd8"/></svg>',
  };
  $('#pipe').innerHTML = `<div class="hop caller"><div class="hop-box">${icons.caller}<div class="hop-n">00</div><h4>Caller</h4><p>Dials a brand tracking number at 2 a.m. or during a storm. Every turn gap above about 1.4 s feels broken.</p><span class="ms">${lb.human_benchmark_ms} ms <small>human gap</small></span></div></div>` +
    P.map((h, i) => `<div class="hop"><div class="hop-box"><div class="hop-n">0${i + 1}</div><h4>${esc(h.hop.replace(/^\w/, c => c.toUpperCase()))}</h4><p>${esc(h.what)}</p><span class="ms">${ms(h)}</span>${h.tools ? `<div class="tools">${h.tools.map(t => `<code>${esc(t.split(' -> ')[0])}</code>`).join('')}</div>` : ''}</div></div>`).join('');
  $('#handoff').innerHTML = `<div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="#e0592a" stroke-width="2"/><path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" fill="none" stroke="#e0592a" stroke-width="2"/><path d="M15 9h6m-2.5-2.5L21 9l-2.5 2.5" fill="none" stroke="#e0592a" stroke-width="2" stroke-linecap="round"/></svg></div><div><b>Human handoff path: LLM → transfer_to_human</b><p>${esc(a.human_handoff)}</p><p style="margin-top:6px"><b style="display:inline;font-size:13px">Logging and QA:</b> ${esc(a.logging_qa)}</p></div>`;
  const segs = [['Telephony / network', 230, '#1f2c8f', 'Network'], ['Streaming ASR', P[1].budget_ms, '#3b4fd8', 'ASR'], ['LLM first token', P[2].budget_ms, '#6f7fe6', 'LLM'], ['TTS first byte', P[3].budget_ms, '#a7b1f2', 'TTS']];
  const tot = segs.reduce((x, s) => x + s[1], 0);
  $('#budget').innerHTML = `<div class="k" style="font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin-bottom:8px">Latency budget per turn (targets)</div>
    <div class="budget-bar" role="img" aria-label="Latency budget: ${segs.map(s => s[0] + ' ' + s[1] + ' ms').join(', ')}">${segs.map(s => `<div style="flex:${s[1]};background:${s[2]};${s[2] === '#a7b1f2' ? 'color:#17205c' : ''}" title="${esc(s[0])}: ${s[1]} ms">${esc(s[3])} ${s[1]}</div>`).join('')}</div>
    <div class="budget-meta"><span>Sum of hop targets <b>${tot.toLocaleString()} ms</b> against <b>${lb.mouth_to_ear_target_ms.toLocaleString()} ms</b> mouth-to-ear target and <b>${lb.mouth_to_ear_upper_ms.toLocaleString()} ms</b> upper limit</span><span>${esc(lb.tool_call_rule)}</span></div>`;
  const cb = a.est_cost_breakdown_per_minute || {};
  const nice = { telephony_inbound: 'Telephony (inbound)', recording: 'Recording', asr_deepgram_nova3: 'ASR · Deepgram Nova-3', llm_estimate: 'LLM (est.)', tts_estimate: 'TTS (est.)', orchestration_vapi: 'Orchestration · Vapi' };
  $('#costrow').innerHTML = Object.entries(cb).map(([k, v]) => `<div><b>$${v}</b>${esc(nice[k] || k)} /min</div>`).join('') +
    `<p style="grid-column:1/-1;font-size:12.5px;color:var(--ink2);margin-top:4px"><b class="mono">$${a.est_cost_per_minute_usd}/min</b> all-in <span class="est">est.</span> · ${esc(a.est_cost_note)} ${srcLink(a.source_url, 'Twilio latency guide')}</p>`;

  const order = ['telephony', 'asr', 'llm', 'tts', 'orchestration'];
  const LAYER = { telephony: 'Telephony', asr: 'ASR', llm: 'LLM', tts: 'TTS', orchestration: 'Orchestration' };
  const st = items.filter(i => i.kind === 'asr_stack').sort((x, y) => order.indexOf(x.layer) - order.indexOf(y.layer));
  $('#stack-table tbody').innerHTML = st.map(s => `<tr><td><span class="vtype">${esc(LAYER[s.layer] || s.layer)}</span></td><td><b>${esc(s.product)}</b><span class="s">${srcLink(s.source_url)}</span></td><td style="min-width:220px">${esc(s.accuracy_or_latency_note || '—')}</td><td style="min-width:200px">${esc(s.pricing_note || 'Not published')}</td><td style="min-width:260px">${esc(s.why_it_matters_for_a_dispatch_call)}</td></tr>`).join('');
}

/* ── 7. Governance ────────────────────────────────────────────────────── */
function governance(items) {
  $('#gov').innerHTML = items.filter(i => i.kind === 'governance').map(g => `<article class="card gv">
    <h3>${esc(g.topic)}</h3>
    <div class="pol"><b>Portfolio policy</b>${esc(g.policy_for_portfolio)}</div>
    <p>${esc(g.finding)}</p>
    <div class="kpi-chips">${(g.company_applies || []).map(c => `<span><span class="dot" style="background:${CO[c]?.hex || '#999'};width:7px;height:7px;margin-right:4px"></span>${esc(CO[c]?.name || c)}</span>`).join('')}</div>
    <p class="src">Source: ${srcLink(g.source_url)} · ${esc(g.retrieval_status)} · not legal advice</p></article>`).join('');
}

/* ── 8. Rollout ───────────────────────────────────────────────────────── */
const WEEKS = [
  ['Calibrate & choose', ['Pull ServiceTitan call tracking (missed and abandoned by hour), booking-rate reports and the membership export', 'Replace every model assumption on this page', 'Consent audit of the member list', 'Vendor bake-off: ServiceTitan Voice Agent vs Avoca'], 'Baseline signed off by PP ops and finance'],
  ['Build & test', ['Brand personas for One Hour, Ben Franklin and Mister Sparky', 'Safety screen, fee wording and disclosures scripted', 'Tools wired: lookup, capacity, booking, SMS, paging', 'A 100-call test suite: gas smell, CO alarm, Spanish speakers, angry callers'], '100% disclosures and zero wrong safety instructions'],
  ['After-hours line live', ['Shadow mode for 3 nights, then live on one brand, then all brands', 'On-call manager warm transfer within 60 s', 'Daily transcript review'], 'After-hours booking rate at or above the answering-service baseline; escalations ≤20%'],
  ['Overflow & speed-to-lead', ['Daytime overflow on ring 3', 'NWS warnings switch on storm triage', 'Web form and LSA leads called back in under 60 s'], 'Abandon rate down with CSR occupancy steady'],
  ['Consented outbound', ['Day-before confirmations and ETA line', 'Membership renewal and fall tune-up campaign, only to members with consent on file', 'Do-not-call honored on first request'], 'Opt-outs and complaints under the agreed threshold'],
  ['Spanish line & PRG readout', ['Spanish line for Lancaster City', 'Automated scoring of 100% of transcripts plus human review of a weighted 5% sample', 'Scorecard to the PRG', 'Go or no-go for Horvath NJ and the CET emergency line'], 'Booked revenue per inbound call above baseline'],
];
function rollout() {
  $('#weeks').innerHTML = WEEKS.map(([h, list, gate], i) => `<article class="card wk"><div class="wk-n">WEEK ${i + 1}</div><div class="prog" aria-hidden="true"><i style="width:${(i + 1) / 6 * 100}%"></i></div><h3>${esc(h)}</h3><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="gate"><b>Gate</b>${esc(gate)}</div></article>`).join('');
}

/* ── Chat FAQ ─────────────────────────────────────────────────────────── */
function faq(meta, items) {
  const m = meta.pp_revenue_model; const a = items.find(i => i.kind === 'architecture'); const s = m.sensitivity;
  const ucs = items.filter(i => i.kind === 'use_case');
  return [
    { q: 'How much revenue does 24/7 voice AI recover?', href: '#calculator', a: `<p>For Punctual Pros the conservative model recovers about <b>${money(m.recovered_revenue_annual_usd)} a year</b> (est.) from calls that go unanswered today. Consented outbound renewals add <b>${money(m.outbound_renewal_uplift_usd)}</b>, for a total of <b>${money(m.total_est_usd)}</b>, or about ${(m.share_of_pp_revenue * 100).toFixed(1)}% of revenue.</p><p><small>${esc(m.recovered_revenue_formula)}</small></p><p>Sensitivity: at Invoca's 35% miss rate it is ${money(s['missed_share_0.35_invoca_industry'])}; at ServiceTitan's 70% AI booking rate, ${money(s['booking_0.70_servicetitan_ai'])}; if every booking is incremental, ${money(s['incrementality_1.0'])}. Try your own inputs in the <a href="#calculator">calculator</a>.</p>` },
    { q: 'Play the after-hours no-heat call', href: '#play-noheat', a: `<p>It is 2:10 a.m. in Lititz, PA, the furnace has quit and there is a baby in the house. The One Hour AI dispatcher discloses that it is an AI and that the call is recorded, runs the gas and CO safety screen, finds the customer in ServiceTitan, marks the job priority and books the on-call technician for 3:15–4:15 a.m. in about <b>1:35</b>.</p><p><a href="#play-noheat">▶ Play the call</a> (your browser reads the agent's lines aloud).</p>` },
    { q: 'Which vendor should Punctual Pros pick?', href: '#vendors', a: `<p><b>Pilot on a trades-native product, then own the engine.</b></p><ul><li><b>Weeks 1–6:</b> a bake-off between ServiceTitan's Voice Agent (native dispatch and capacity, 70% booking reported) and Avoca (ServiceTitan-certified, H.L. Bowman runs 70% of its calls through it) on one brand's after-hours line.</li><li><b>Months 3–12:</b> a shared portfolio engine built on Twilio, Deepgram, Claude and ElevenLabs or Cartesia via Vapi, Retell or LiveKit, at about $${a?.est_cost_per_minute_usd ?? 0.12} a minute, which is ~$0.46 for a 4-minute call against $1.67–$3 a call bought.</li></ul><p><small>Analyst recommendation; vendor outcomes are self-reported.</small></p>` },
    { q: 'What does a voice AI call cost per minute?', href: '#playbook', a: `<p>A self-built cascaded stack runs about <b>$${a?.est_cost_per_minute_usd}/min</b> (est.): telephony $0.0085, recording $0.0025, Deepgram ASR $0.0048, LLM ~$0.03, TTS ~$0.02 and Vapi orchestration $0.05. ${esc(a?.est_cost_note || '')}</p>` },
    { q: 'Is AI calling legal under the TCPA? Do we need consent?', href: '#governance', a: `<p>Since February 2024 the FCC treats AI voices as "artificial" under the TCPA. Outbound AI calls therefore need prior express consent, and written consent if the call is telemarketing. Inbound answering is not a TCPA call by Punctual Pros. Policy: call only members with documented consent, log the consent source, and honor opt-outs immediately. Not legal advice.</p>` },
    { q: 'Do we need consent to record calls in Pennsylvania, New Jersey or Massachusetts?', href: '#governance', a: `<p>Pennsylvania requires consent from all parties, and Massachusetts bars secret recording. New Jersey requires only one party's consent. The portfolio applies the strictest rule everywhere, so every call opens with a recording notice in the greeting.</p>` },
    { q: 'Must the agent disclose it is an AI?', href: '#governance', a: `<p>Yes. The agent says it is the virtual assistant in its first sentence, answers "are you a robot?" truthfully every time and offers a person. That goes beyond current US rules (California AB 2905, Utah SB 226 and the pending FCC NPRM).</p>` },
    { q: 'What is the 6-week rollout?', href: '#rollout', a: `<ol>${WEEKS.map(([h, , g]) => `<li><b>${esc(h)}</b> (gate: ${esc(g)})</li>`).join('')}</ol>` },
    { q: 'How fast does a voice agent need to respond? Latency budget', href: '#playbook', a: `<p>People leave about 200 ms between turns. The budget per turn is telephony ~230 ms, streaming ASR 350 ms, LLM first token 375 ms and TTS 100 ms, against a 1,115 ms mouth-to-ear target and a 1,400 ms upper limit. Tool calls slower than ~700 ms get a spoken filler.</p>` },
    { q: 'What happens when the caller wants a human? Handoff and escalation', href: '#playbook', a: `<p>${esc(a?.human_handoff || '')}</p>` },
    { q: 'What is the EliseAI playbook for home services?', href: '#playbook', a: `<p>EliseAI (NYC) runs one AI assistant across voice, SMS, email and chat for about one in six US apartments. It raised $350M at a $4B valuation in September 2026. The lesson for Punctual Pros is to run the same assistant on every channel at every hour, book into live capacity, and measure booked jobs and after-hours share rather than call-center savings.</p>` },
    { q: 'What is the missed-call revenue clock?', href: '#top', a: `<p>The hero clock adds about <b>$${m.missed_revenue_counter.per_second_usd}</b> a second (${usd(m.missed_revenue_counter.annual_usd)} a year ÷ seconds in a year), counted from January 1. That is about ${m.missed_revenue_counter.missed_calls_per_day} missed calls a day. It is a modelled estimate for Punctual Pros, not a measured loss.</p>` },
    { q: 'Which other portfolio companies can use voice AI?', href: '#usecases', a: `<ul>${ucs.filter(u => u.company !== 'pp').map(u => `<li><b>${esc(CO[u.company].name)}</b>: ${esc(u.name)} (${money(u.est_annual_value_usd)}/yr est.)</li>`).join('')}</ul>` },
  ];
}

/* ── Boot ─────────────────────────────────────────────────────────────── */
export async function boot() {
  const ban = $('#concept');
  if (store.get('vai-banner') === 'x') ban.remove(); else $('.concept-x', ban).onclick = () => { ban.remove(); store.set('vai-banner', 'x'); };
  const d = await Data.research('research/voice_ai');
  if (!d?.meta) { $('#kpis').innerHTML = '<p class="muted">The voice AI dataset could not be loaded.</p>'; return { faq: [] }; }
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
  $('#caveats').innerHTML = '<li style="list-style:none;margin-left:-18px"><b>Caveats from the dataset</b></li>' + (meta.caveats || []).map(c => `<li>${esc(c)}</li>`).join('');
  return { faq: faq(meta, items) };
}
