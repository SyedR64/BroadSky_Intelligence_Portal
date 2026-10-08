/* FirmOS product page: demos and value math. Data via core.js (Data.load('research/...')). */
import { QUESTIONS, ring, tierOf } from './site.js?v=20261008192515';
const CO = 'var(--co)', CO_SOFT = 'color-mix(in srgb,var(--co) 45%,var(--sys-surface))';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = { get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } } };
const M = n => { const a = Math.abs(n); return (n < 0 ? '−' : '') + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : a.toFixed(2)); };
const N = n => Math.round(n).toLocaleString('en-US');
const pctv = (x, d = 0) => (x * 100).toFixed(d) + '%';
const setP = i => i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min) * 100) + '%');
const line = (l, v, sub, cls = '') => `<div class="ln ${cls}"><span>${l}${sub ? `<small>${sub}</small>` : ''}</span><b>${v}</b></div>`;
let esc = s => String(s ?? '');

/* ── Evidence helpers ── */
let EV = [];
const ev = id => EV.find(x => x.id === id);
/* Plain-English name for an evidence source (never a file path or internal id). */
const srcName = e => { const n = String(e?.source_name || ''); if (!n || /^data\/|\.json|\b[a-z]+_[a-z_]+\b/.test(n)) return 'Frontline public filings (Form D and Intelliteach accounts)'; return n; };
const srcLink = (id, label) => { const e = ev(id); const t = label || srcName(e); return e && e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t); };

function heroKpis() {
  const box = $('#hero-kpis'); if (!box) return;
  const k = ['kb-fl-3', 'kb-fl-1', 'kb-fl-2'].map(ev);
  if (k.some(x => !x)) return; // keep static fallback
  const fmt = (x, v) => x.unit.startsWith('%') ? v + '%' : String(v);
  const lab = { 'kb-fl-3': 'Net first-level resolution', 'kb-fl-1': 'eBilling invoice rejection rate', 'kb-fl-2': 'Days from invoice to payment' };
  const sub = { 'kb-fl-3': 'MetricNet benchmark → analyst target', 'kb-fl-1': 'Elite research, 2025 → 2024 level', 'kb-fl-2': 'Elite eBillingHub customers, pre-2025 → 2025' };
  box.innerHTML = k.map(x => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${lab[x.id]}</span><span class="sys-kpi-value hk-val"><s>${fmt(x, x.baseline)}</s><span class="ar">→</span>${fmt(x, x.target)}<span class="sys-est">est.</span></span><span class="sys-kpi-sub">${sub[x.id]} · ${srcLink(x.id, 'source')}</span></div>`).join('');
}

/* ── Tier-0 simulator ── */
const CATS = [
  { k: 'Password / MFA', s: .22, a: .92, need: 'id', l2: .03, ex: ['MFA reset after phone upgrade', 'Account locked, associate, NYC', 'Password expired, remote staff'] },
  { k: 'Access & permissions', s: .13, a: .70, need: 'id', l2: .10, ex: ['Shared-drive access, new matter team', 'Add assistant to distribution list', 'Client extranet access'] },
  { k: 'DMS', s: .12, a: .55, need: 'dms', l2: .20, ex: ['iManage workspace permissions', 'NetDocuments sync stuck', 'Restore deleted draft brief'] },
  { k: 'Email & Outlook', s: .10, a: .45, need: null, l2: .15, ex: ['Outlook profile corrupted', 'Large exhibit to opposing counsel', 'Calendar delegation for EA'] },
  { k: 'Print & scan', s: .07, a: .60, need: null, l2: .05, ex: ['Printer queue stuck, 14th floor', 'Scan-to-DMS failing'] },
  { k: 'Time & billing apps', s: .08, a: .40, need: 'dms', l2: .25, ex: ['Elite time-entry sync error', 'Aderant login loop'] },
  { k: 'Hardware', s: .09, a: .08, need: null, l2: .35, ex: ['Docking station dead', 'War-room monitor flicker'] },
  { k: 'Network & VPN', s: .07, a: .25, need: null, l2: .45, ex: ['VPN drops at hotel', 'Conference room Wi-Fi'] },
  { k: 'Joiners & leavers', s: .06, a: .75, need: 'jml', l2: .20, ex: ['Lateral partner onboarding', 'Departing associate offboarding'] },
  { k: 'Security alerts', s: .06, a: .15, need: null, l2: .70, ex: ['Suspicious sign-in, London', 'Phishing report from paralegal'] },
];
function simModel(st) {
  const kbF = 0.15 + 0.6 * st.kb; let t0 = 0, l2 = 0; const per = [];
  for (const c of CATS) {
    const gate = c.need ? (st[c.need] ? 1 : 0.25) : 1;
    const t = c.s * Math.min(.95, c.a * kbF * gate);
    const l2r = c.l2 * 1.3 * (1 - 0.25 * st.kb - (st.cop ? 0.15 : 0));
    const x = Math.min(c.s * l2r, c.s - t);
    t0 += t; l2 += x; per.push({ c, t: t / c.s, x: x / c.s });
  }
  const l1 = 1 - t0 - l2;
  const base = (.74 * 22 + .26 * 62) * st.cf;
  const now = t0 * 3 + (l1 * 22 + l2 * 62) * st.cf;
  const ebitda = st.vol * (base - now) * st.ret;
  return { t0, l1, l2, flr: t0 + l1, base, now, ebitda, per };
}
function simulator() {
  const root = $('#demo'); if (!root) return;
  const st = { kb: .55, id: true, dms: true, jml: false, cop: false, vol: 1.5e6, cf: .35, ret: .6 };
  let model = simModel(st), running = true, counts = { t0: 0, l1: 0, l2: 0 }, n = 0;
  const outs = { kb: v => v + '%', vol: v => (v / 1e6).toFixed(1) + 'M', cf: v => v + '%', ret: v => v + '%' };
  const read = () => { st.kb = +$('#d-kb').value / 100; st.vol = +$('#d-vol').value; st.cf = +$('#d-cf').value / 100; st.ret = +$('#d-ret').value / 100; $$('#d-toggles input').forEach(i => st[i.dataset.k] = i.checked); ['kb', 'vol', 'cf', 'ret'].forEach(k => { const i = $('#d-' + k); setP(i); $('#o-' + k).textContent = outs[k](+i.value); }); };
  const draw = () => {
    read(); model = simModel(st); const b = simModel({ ...st, kb: 0, id: false, dms: false, jml: false, cop: false });
    $('#s-def').textContent = pctv(model.t0); $('#s-def-d').textContent = `${pctv(model.t0 - b.t0)} vs no FirmOS`;
    $('#s-flr').textContent = pctv(model.flr);
    $('#s-cpt').textContent = '$' + model.now.toFixed(2); $('#s-cpt-d').textContent = `from $${model.base.toFixed(2)}`;
    $('#s-ebitda').innerHTML = `${M(model.ebitda)}<span class="sys-est">est.</span>`; $('#s-ebitda-d').textContent = `${Math.round(st.ret * 100)}% of savings retained`;
    $('#d-mix').innerHTML = model.per.map(p => { const l1 = Math.max(0, 1 - p.t - p.x); return `<div class="mix-r"><span>${esc(p.c.k)}</span><span class="tr"><i class="c-t0" style="width:${p.t * 100}%"></i><i class="c-l1" style="width:${l1 * 100}%"></i><i class="c-l2" style="width:${p.x * 100}%"></i></span><b>${Math.round(p.c.s * 100)}%</b></div>`; }).join('');
  };
  root.addEventListener('input', e => { if (e.target.matches('input')) draw(); });
  draw();
  const lanes = { t0: $('#lane-t0'), l1: $('#lane-l1'), l2: $('#lane-l2') };
  const pick = () => { let r = Math.random(), acc = 0; for (const p of model.per) { acc += p.c.s; if (r <= acc) return p; } return model.per[0]; };
  const tick = () => {
    if (!running) return;
    const p = pick(); const r = Math.random(); const lane = r < p.t ? 't0' : r < p.t + p.x ? 'l2' : 'l1';
    const title = p.c.ex[(n++) % p.c.ex.length];
    const meta = lane === 't0' ? `resolved · 0:${String(18 + Math.floor(Math.random() * 40)).padStart(2, '0')}` : lane === 'l1' ? `Level 1 · ${3 + Math.floor(Math.random() * 9)} min` : 'escalated to engineering';
    const el = document.createElement('div'); el.className = 'tk ' + lane; el.innerHTML = `<b>${esc(title)}</b><div class="m"><span>${esc(p.c.k)}</span><span>${meta}</span></div>`;
    lanes[lane].prepend(el); while (lanes[lane].children.length > 5) lanes[lane].lastChild.remove();
    counts[lane]++; ['t0', 'l1', 'l2'].forEach(k => $('#n-' + k).textContent = counts[k]);
  };
  for (let i = 0; i < 14; i++) tick();
  let timer = null; const start = () => { if (!timer && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(tick, 900); }; const stop = () => { clearInterval(timer); timer = null; };
  if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop())).observe(root); else start();
  $('#sim-pause').addEventListener('click', e => { running = !running; e.target.textContent = running ? 'Pause' : 'Resume'; });
}

/* ── Security score card ── */
const FN = { mfa: 'PR', edr: 'DE', bak: 'RC', mail: 'PR', patch: 'PR', priv: 'PR', train: 'PR', ir: 'RS', ocg: 'GV', vend: 'GV' };
const FN_NAME = { GV: 'Govern', PR: 'Protect', DE: 'Detect', RS: 'Respond', RC: 'Recover' };
const SAMPLE = { mfa: 1, edr: 0.5, bak: 1, mail: 0.5, patch: 0, priv: 0, train: 1, ir: 0, ocg: 0.5, vend: 0.5 };
function scorecard() {
  const list = $('#sc-list'); if (!list) return;
  const stored = store.get('fl-posture', {}) || {}; const fromSite = Object.keys(stored).length > 0;
  const ans = { ...SAMPLE, ...stored };
  if (fromSite) { $('#sc-ttl').textContent = 'FirmOS · Posture · Your self-assessment'; $('#sc-src').textContent = `Loaded ${Object.keys(stored).length} answer(s) from your self-assessment on the Frontline site; unanswered controls use sample values. Weights match the self-assessment. Mapping is at the NIST CSF 2.0 function level.`; }
  const lab = v => v === 1 ? ['Pass', 'ok'] : v === 0.5 ? ['Partial', 'warn'] : ['Gap', 'bad'];
  const render = () => {
    let s = 0; QUESTIONS.forEach(q => s += q.w * ans[q.id]); s = Math.round(s);
    ring($('#sc-ring'), s, { label: 'posture score', size: 176, stroke: 14 });
    const g = s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F'; const t = tierOf(s);
    const te = $('#sc-tier'); te.className = 'tier ' + t.cls; te.textContent = `Grade ${g} · ${t.label}`;
    list.innerHTML = QUESTIONS.map(q => { const [l, c] = lab(ans[q.id]); return `<button type="button" class="ctl" data-id="${q.id}"><span class="t">${esc(q.q)}<small>${FN_NAME[FN[q.id]]} · weight ${q.w}${ans[q.id] < 1 ? ` · fix: ${esc(q.fix)}` : ''}</small></span><span class="sys-chip fl-st fl-st--${c}">${l}</span></button>`; }).join('');
    const fns = {}; QUESTIONS.forEach(q => { const f = FN[q.id]; fns[f] = fns[f] || { w: 0, s: 0 }; fns[f].w += q.w; fns[f].s += q.w * ans[q.id]; });
    $('#sc-func').innerHTML = `<span class="sys-card-label">NIST CSF 2.0 functions</span><div class="bars" style="margin-top:8px">${Object.keys(FN_NAME).filter(f => fns[f]).map(f => { const v = fns[f].s / fns[f].w; return `<div class="bar-r" style="grid-template-columns:70px 1fr 40px"><span style="text-align:left">${FN_NAME[f]}</span><span class="tr"><i style="width:${v * 100}%;background:${v >= .85 ? 'var(--sys-good)' : v >= .6 ? 'var(--sys-warn)' : 'var(--sys-bad)'}"></i></span><b>${Math.round(v * 100)}</b></div>`; }).join('')}</div>`;
    const tr = [s - 15, s - 12, s - 10, s - 6, s - 3, s].map(v => Math.max(5, Math.min(100, v)));
    const lo = Math.min(...tr) - 4, hi = Math.max(...tr) + 4; const pts = tr.map((v, i) => [10 + i * 52, 54 - (v - lo) / (hi - lo) * 46]);
    $('#sc-spark').innerHTML = `<polyline points="${pts.map(p => p.join(',')).join(' ')}" style="fill:none;stroke:${CO}" stroke-width="2.2" stroke-linejoin="round"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === 5 ? 4 : 2.5}" style="fill:${i === 5 ? CO : 'var(--sys-surface)'};stroke:${CO}" stroke-width="1.6"/>`).join('')}`;
  };
  list.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; const id = b.dataset.id; ans[id] = ans[id] === 1 ? 0.5 : ans[id] === 0.5 ? 0 : 1; render(); $('#sc-pack-out').textContent = ''; });
  $('#sc-pack').addEventListener('click', () => { const gaps = QUESTIONS.filter(q => ans[q.id] < 1).length; $('#sc-pack-out').textContent = `Evidence pack drafted: ${QUESTIONS.length} controls, ${QUESTIONS.length - gaps} with evidence attached and ${gaps} with remediation plans, mapped to NIST CSF 2.0. Illustrative.`; });
  let m = 3; setInterval(() => { m = m >= 6 ? 1 : m + 1; $('#sc-upd').textContent = `Updated ${m} min ago`; }, 30000);
  render();
}

/* ── LEDES pre-flight ── */
const LEDES = [
  { n: 1, t: 'F', u: '3.50', task: 'L120', act: 'A106', tk: 'ROKAFOR', cls: 'PARTNER', rate: '795.00', tot: '2782.50', d: 'Review prod.; draft memo; client call', issue: 'block', fix: 'split' },
  { n: 2, t: 'F', u: '0.40', task: 'L110', act: 'A107', tk: 'JLIN', cls: 'ASSOCIATE', rate: '540.00', tot: '216.00', d: 'Conference', issue: 'vague', fix: 'route' },
  { n: 3, t: 'F', u: '2.00', task: '', act: 'A103', tk: 'JLIN', cls: 'ASSOCIATE', rate: '540.00', tot: '1080.00', d: 'Draft motion to compel', issue: 'task', fix: 'auto' },
  { n: 4, t: 'F', u: '1.20', task: 'L240', act: 'A104', tk: 'MDUARTE', cls: 'PARTNER', rate: '850.00', tot: '1020.00', d: 'Analyze opposing expert rpt', issue: 'rate', fix: 'auto' },
  { n: 5, t: 'E', u: '1', task: '', act: 'E101', tk: '', cls: '', rate: '412.00', tot: '412.00', d: 'In-house copying 2,060pp', issue: 'exp', fix: 'auto' },
];
const RULES = {
  block: ['Block billing: three tasks in one entry', 'Client guideline §3.1', 'Split into 3 coded lines (attorney approves)'],
  vague: ['Vague description: "Conference"', 'Guideline §3.4', 'Routed to timekeeper for detail'],
  task: ['Missing UTBMS task code', 'LEDES 1998B required field', 'Inferred L250 from description'],
  rate: ['Rate $850 exceeds approved $795', 'Approved rate schedule', 'Adjusted to approved rate; $66 write-down noted'],
  exp: ['Non-reimbursable expense: in-house copying', 'Guideline §4.2', 'Removed; flagged in cover note'],
};
function ledes() {
  const code = $('#lf-code'); if (!code) return;
  let state = 'raw';
  const cell = (txt, bad, fixed) => bad ? `<span class="${fixed ? 'fix' : 'bad'}">${esc(txt || '····')}</span>` : esc(txt);
  const render = () => {
    const hd = '<span class="hd">LEDES1998B[]\nLINE|T|UNITS|TASK|ACT |TKPR    |RATE  |TOTAL  |DESCRIPTION[]</span>\n';
    code.innerHTML = hd + LEDES.map(r => {
      const flag = state !== 'raw'; const fixed = state === 'fixed';
      let task = r.task, rate = r.rate, tot = r.tot, d = r.d;
      if (fixed && r.issue === 'task') task = 'L250';
      if (fixed && r.issue === 'rate') { rate = '795.00'; tot = '954.00'; }
      if (fixed && r.issue === 'block') d = 'split → 3 coded lines';
      if (fixed && r.issue === 'exp') d = '[removed per §4.2]';
      const b = k => flag && r.issue === k;
      return `${String(r.n).padStart(4, '0')}|${r.t}|${r.u.padEnd(5)}|${cell((task || '').padEnd(4), b('task'), fixed)}|${r.act}|${(r.tk || '').padEnd(8)}|${cell(rate.padEnd(6), b('rate'), fixed)}|${tot.padEnd(7)}|${cell(d, b('block') || b('vague') || b('exp'), fixed && r.issue !== 'vague')}[]`;
    }).join('\n');
    const checks = $('#lf-checks');
    if (state === 'raw') { checks.innerHTML = `<div class="chk ok"><span class="i">i</span><span>5 lines · invoice total $5,510.50 · client guideline set: 14 rules loaded</span><span class="c">ready</span></div>`; return; }
    const rows = LEDES.map(r => { const [t, rule, fx] = RULES[r.issue]; const done = state === 'fixed'; const auto = r.fix !== 'route'; return `<div class="chk ${done && auto ? 'ok' : 'bad'}"><span class="i">${done && auto ? '✓' : '!'}</span><span><b>Line ${r.n}:</b> ${esc(t)}<span class="sub">${esc(rule)} · ${done ? esc(fx) : (auto ? 'auto-fix available' : 'needs timekeeper')}</span></span><span class="c">${done ? (auto ? 'fixed' : 'routed') : 'flag'}</span></div>`; }).join('');
    const sum = state === 'fixed' ? `<div class="chk ok"><span class="i">✓</span><span><b>4 lines fixed automatically, 1 routed to the timekeeper.</b> Predicted first-pass acceptance: 96%<span class="sys-est sys-est--illus">illustrative</span></span><span class="c">ready</span></div>` : `<div class="chk ok"><span class="i">✓</span><span>Invoice total reconciles · timekeeper classifications present · matter ID valid</span><span class="c">pass</span></div>`;
    checks.innerHTML = rows + sum;
  };
  const run = () => { state = 'flagged'; $('#lf-fix').disabled = false; render(); $$('#lf-checks .chk').forEach((c, i) => { c.style.animation = `fl-in .35s ease ${i * 0.12}s both`; }); };
  $('#lf-run').addEventListener('click', run);
  $('#lf-fix').addEventListener('click', () => { state = 'fixed'; $('#lf-fix').disabled = true; render(); });
  state = 'flagged'; $('#lf-fix').disabled = false; render();
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); setTimeout(run, 400); } }, { threshold: .3 }); io.observe(code); } else run();
}
function realization() {
  const box = $('#e-math'); if (!box) return;
  const k1 = ev('kb-fl-1'), k2 = ev('kb-fl-2');
  const r0 = (k1?.baseline ?? 18) / 100, r1 = (k1?.target ?? 11) / 100, d0 = k2?.baseline ?? 62, d1 = k2?.target ?? 50;
  const draw = () => {
    ['fees', 'wo', 'coc'].forEach(k => setP($('#e-' + k)));
    const F = +$('#e-fees').value * 1e6, wo = +$('#e-wo').value / 100, coc = +$('#e-coc').value / 100;
    $('#o-fees').textContent = M(F); $('#o-wo').textContent = Math.round(wo * 100) + '%'; $('#o-coc').textContent = (coc * 100).toFixed(1) + '%';
    const rej0 = F * r0, rej1 = F * r1, avoided = (rej0 - rej1) * wo, cash = F * (d0 - d1) / 365, carry = cash * coc;
    box.innerHTML = line(`Rejected value today (${Math.round(r0 * 100)}%)`, M(rej0)) + line(`Rejected value with FirmOS (${Math.round(r1 * 100)}%)`, M(rej1)) +
      line('Write-offs avoided per year', M(avoided), `Realization +${(avoided / F * 100).toFixed(2)} pts on e-billed fees`) +
      line(`Cash released (${d0 - d1} fewer days to pay)`, M(cash), 'One-time working-capital release') + line(`Carrying cost saved at ${(coc * 100).toFixed(1)}%`, M(carry) + '/yr') +
      line('Annual value to the firm', M(avoided + carry), 'Write-offs avoided + carrying cost saved', 'tot');
  };
  $('#ebilling').addEventListener('input', e => { if (e.target.matches('#e-fees,#e-wo,#e-coc')) draw(); }); draw();
}

/* ── Client portal mock ── */
function portal(score) {
  const main = $('#pmain'); if (!main) return;
  const weeks = [[132, 182, 58], [148, 176, 52], [161, 170, 49], [170, 160, 44], [178, 154, 41], [190, 149, 38]];
  const FILL = ['var(--co)', 'var(--fl-l1)', 'var(--fl-l2)'];
  const chart = () => { const W = Math.max(300, Math.min(860, (main.clientWidth || 860) - 40)), H = W < 500 ? 150 : 170, bw = W / 12.3, gap = (W - 6 * bw) / 7, max = 400; return `<svg viewBox="0 0 ${W} ${H + 24}" style="width:100%;height:auto" role="img" aria-label="Weekly tickets by tier">${weeks.map((w, i) => { const x = gap + i * (bw + gap); let y = H; return w.map((v, k) => { const h = v / max * H; y -= h; return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" style="fill:${FILL[k]}"/>`; }).join('') + `<text x="${x + bw / 2}" y="${H + 16}" text-anchor="middle" font-size="11" style="fill:var(--sys-mute);font-family:var(--sys-mono)">${W < 560 ? 'W' : 'Week '}${35 + i}</text>`; }).join('')}</svg>`; };
  const legend = '<span class="fl-legend"><span><i class="c-t0"></i>Tier-0</span><span><i class="c-l1"></i>Level 1</span><span><i class="c-l2"></i>Level 2+</span></span>';
  const table = (head, rows) => `<div class="sys-table-wrap"><table class="sys-table"><thead><tr>${head.map(h => `<th${h[1] ? ' class="sys-n"' : ''}>${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const V = {
    ov: () => `<div class="ptitle"><h4>Overview · October 2026</h4><span>Next quarterly review: Nov 12</span></div>
      <div class="mstat"><div class="c"><span>Open tickets</span><b>23</b><small>−31% vs Q2</small></div><div class="c"><span>SLA met</span><b>98.6%</b><small>target 97%</small></div><div class="c"><span>Posture score</span><b>${score}</b><small>+6 this quarter</small></div><div class="c"><span>eBilling first-pass</span><b>96%</b><small>from 84%</small></div></div>
      <div class="sys-card pchart"><div class="mixcard"><div class="hd"><b>Tickets by tier, last 6 weeks</b>${legend}</div></div>${chart()}</div>`,
    tk: () => `<div class="ptitle"><h4>Tickets</h4><span>Live · last 24 hours</span></div>${table([['Ticket'], ['Request'], ['Requester'], ['Tier'], ['Status'], ['Time', 1]], [['48211', 'MFA reset after phone upgrade', 'Associate · NYC', 'T0', 'ac', 'Resolved', '0:34'], ['48209', 'iManage workspace for new matter', 'Paralegal · Chicago', 'L1', 'ok', 'Resolved', '6m'], ['48204', 'Trial laptop imaging, 3 units', 'Partner · Dallas', 'L2', 'warn', 'In progress', '2h'], ['48199', 'Elite time-entry sync error', 'Associate · NYC', 'L1', 'ok', 'Resolved', '9m'], ['48197', 'Suspicious sign-in alert', 'SOC', 'L2', 'warn', 'Contained', '14m'], ['48190', 'Departing associate offboarding', 'HR', 'T0', 'ac', 'Resolved', '1:12']].map(r => `<tr><td class="sys-num">#${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td><span class="sys-chip fl-st fl-st--${r[3] === 'T0' ? 'ac' : r[3] === 'L1' ? 'ok' : 'warn'}">${r[3] === 'T0' ? 'Tier-0' : r[3] === 'L1' ? 'Level 1' : 'Level 2'}</span></td><td><span class="sys-chip fl-st fl-st--${r[4]}">${r[5]}</span></td><td class="sys-n">${r[6]}</td></tr>`))}`,
    sc: () => `<div class="ptitle"><h4>Security</h4><span>Score ${score} · mapped to NIST CSF 2.0</span></div><div class="sys-grid sys-grid--2" style="gap:12px">${[['Endpoints protected', '1,284 / 1,290', 'ok', '6 laptops pending check-in'], ['MFA coverage', '100%', 'ok', 'Phishing-resistant for admins'], ['Critical patches over 14 days old', '3', 'warn', 'VPN appliance, 2 workstations'], ['Phishing simulation click rate', '4.1%', 'ok', 'Q3 campaign, down from 9.8%'], ['Immutable backups', 'Daily', 'ok', 'Last restore test Sep 18'], ['Open client security questionnaires', '2', 'warn', 'Due Oct 21 and Oct 30']].map(r => `<div class="sys-card pcard"><div class="sys-row" style="justify-content:space-between;gap:8px"><span class="sys-card-label">${r[0]}</span><span class="sys-chip fl-st fl-st--${r[2]}">${r[2] === 'ok' ? 'OK' : 'Action'}</span></div><b class="v">${r[1]}</b><span class="sys-kpi-sub">${r[3]}</span></div>`).join('')}</div>`,
    bl: () => `<div class="ptitle"><h4>Billing pipeline</h4><span>e-billed invoices · last 30 days</span></div>${table([['Invoice'], ['Client (fictional)'], ['Portal'], ['Amount', 1], ['Status'], ['Days', 1]], [['24187', 'Calder Mutual Insurance', 'Portal A', '$84,210', 'ok', 'Paid', '41'], ['24190', 'Northwind Logistics', 'Portal B', '$22,940', 'ac', 'Submitted', '6'], ['24192', 'Brightwater Health', 'Portal A', '$61,075', 'bad', 'Rejected → appeal drafted', '3'], ['24195', 'Calder Mutual Insurance', 'Portal A', '$18,300', 'ac', 'Pre-flight passed', '0'], ['24171', 'Orion Freight', 'Portal C', '$47,880', 'warn', 'Appealed', '19'], ['24166', 'Northwind Logistics', 'Portal B', '$35,615', 'ok', 'Paid', '48']].map(r => `<tr><td class="sys-num">#${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="sys-n">${r[3]}</td><td><span class="sys-chip fl-st fl-st--${r[4]}">${r[5]}</span></td><td class="sys-n">${r[6]}</td></tr>`))}`,
  };
  const show = t => { $$('#portal .pnav button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t))); main.innerHTML = V[t](); };
  $('#portal .pnav').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t); });
  show('ov');
}

/* ── Growth: mid-size firms ── */
const SHORT = { bundle: 'Bundle', managed_it: 'Managed IT', ebilling: 'eBilling', service_desk: 'Service desk', cyber: 'Cyber' };
const OFFER = { bundle: ['Bundle: IT + security + RCM', 1], managed_it: ['Managed IT', .6], ebilling: ['eBilling / RCM', .35], service_desk: ['Service desk', .4], cyber: ['Cybersecurity', .3] };
function bars(el, rows, { fmt = N, max, color = CO, labelW } = {}) { const mx = max || Math.max(...rows.map(r => r[1])); el.innerHTML = rows.map(r => `<div class="bar-r"${labelW ? ` style="--lw:${labelW}px"` : ''}><span>${esc(r[0])}</span><span class="tr"><i style="width:${r[1] / mx * 100}%;background:${r[2] || color}"></i></span><b>${fmt(r[1])}</b></div>`).join(''); }
async function growth(Data) {
  const k = $('#g-kpis'); if (!k) return;
  let d = null; try { d = await Data.load('research/fl_midsize_firms'); } catch (e) { console.debug(e); }
  const items = d?.items || [];
  if (!items.length) { k.innerHTML = '<p class="sys-src">Mid-size firm research is not available right now.</p>'; return; }
  const att = items.reduce((s, x) => s + (x.attorney_count || 0), 0); const metros = new Set(items.map(x => x.metro));
  const sorted = items.map(x => x.attorney_count || 0).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
  const sig = items.filter(x => (x.signals || []).length).length; const ins = items.filter(x => /insurance/i.test(x.client_base || '')).length;
  k.innerHTML = [['Firms researched', N(items.length), `${metros.size} metros`], ['Attorneys', N(att), `median firm ${med}`], ['Insurance-heavy books', N(ins), 'high LEDES intensity'], ['Firms with buying signals', N(sig), 'mergers, expansions, CIO hires']].map(r => `<div class="c"><span>${r[0]}</span><b>${r[1]}</b><small class="m">${r[2]}</small></div>`).join('');
  const byM = {}; items.forEach(x => byM[x.metro] = (byM[x.metro] || 0) + (x.attorney_count || 0));
  bars($('#g-metro'), Object.entries(byM).sort((a, b) => b[1] - a[1]), { labelW: 170 });
  const byO = {}; items.forEach(x => byO[x.recommended_offer] = (byO[x.recommended_offer] || 0) + 1);
  bars($('#g-offer'), Object.entries(byO).sort((a, b) => b[1] - a[1]).map(([o, v]) => [OFFER[o]?.[0] || o, v]), { fmt: v => v + (v === 1 ? ' firm' : ' firms'), labelW: 170 });
  const bands = [['40–79 attorneys', 0, 80], ['80–149', 80, 150], ['150–249', 150, 250], ['250–350', 250, 1e9]].map(([l, a, b]) => [l, items.filter(x => (x.attorney_count || 0) >= a && (x.attorney_count || 0) < b).length, CO_SOFT]);
  bars($('#g-size'), bands, { fmt: v => v + (v === 1 ? ' firm' : ' firms'), labelW: 170 });
  const top = [...items].sort((a, b) => b.frontline_fit_score - a.frontline_fit_score).slice(0, 8);
  $('#g-top').innerHTML = `<thead><tr><th>Firm and metro</th><th class="sys-n">Attorneys</th><th class="sys-n">Fit</th><th>First offer</th></tr></thead><tbody>${top.map(x => `<tr><td>${esc(x.firm_name)}<div class="sys-src" style="margin-top:2px">${esc(x.metro)}</div></td><td class="sys-n">${N(x.attorney_count)}</td><td class="sys-n">${x.frontline_fit_score}</td><td><span class="sys-chip fl-st fl-st--ac">${esc(SHORT[x.recommended_offer] || 'Bundle')}</span></td></tr>`).join('')}</tbody>`;
  const gen = d.meta?.generated ? new Date(d.meta.generated + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Sept 2026';
  $('#g-src').innerHTML = `<b>Source:</b> Mid-size law firms research (${N(items.length)} firms, ${esc(gen)}). Attorney counts are stated on firm websites or approximated from sitemaps (±25%). The fit score starts at 35 and adds points for size, an insurance or corporate client base, office count, a recent merger, a cyber incident, office expansions, eBilling and technology initiatives, a new CIO and a metro with a Frontline office; it is capped at 95.`;
  const draw = () => {
    ['acv', 'win', 'mar'].forEach(k => setP($('#g-' + k)));
    const acv = +$('#g-acv').value, win = +$('#g-win').value / 100, mar = +$('#g-mar').value / 100;
    $('#o-acv').textContent = '$' + N(acv) + '/yr'; $('#o-win').textContent = Math.round(win * 100) + '%'; $('#o-mar').textContent = Math.round(mar * 100) + '%';
    const pot = items.reduce((s, x) => s + (x.attorney_count || 0) * acv * (OFFER[x.recommended_offer]?.[1] ?? .5), 0);
    const won = pot * win, contrib = won * mar;
    $('#g-math').innerHTML = line('Addressable ARR, researched firms', M(pot), 'Attorneys × ACV × first-offer weight') + line(`New ARR at ${Math.round(win * 100)}% win rate`, M(won), 'Over 3 years') + line('Contribution to EBITDA', M(contrib) + '/yr') + line('Value at 12x exit multiple', M(contrib * 12), 'Before FirmOS multiple effects', 'tot');
  };
  $('#growth').addEventListener('input', e => { if (e.target.matches('#g-acv,#g-win,#g-mar')) draw(); }); draw();
}

/* ── Value-creation math ── */
function water(svg, steps) {
  const narrow = (svg.clientWidth || 560) < 460; const W = narrow ? 380 : 560, H = narrow ? 300 : 280; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); const pad = { l: narrow ? 44 : 50, r: 6, t: 30, b: narrow ? 34 : 46 }; let acc = 0; const max = Math.max(...steps.map(s => { acc = s.total ? s.v : acc + s.v; return acc; })) * 1.12;
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max); const bw = (W - pad.l - pad.r) / steps.length * .62, gap = (W - pad.l - pad.r) / steps.length;
  let run = 0, out = '';
  [0, .25, .5, .75, 1].forEach(t => { const v = max * t; out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--sys-line)"/><text x="${pad.l - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" style="fill:var(--sys-mute-2)">$${Math.round(v)}M</text>`; });
  steps.forEach((s, i) => {
    const x = pad.l + i * gap + (gap - bw) / 2; let a, b, c;
    if (s.total) { a = 0; b = s.v; c = s.c || 'var(--sys-ink)'; run = s.v; } else { a = run; b = run + s.v; run = b; c = s.v >= 0 ? (s.c || CO) : 'var(--sys-bad)'; }
    const top = y(Math.max(a, b)), h = Math.max(1.5, Math.abs(y(a) - y(b)));
    out += `<rect x="${x}" y="${top}" width="${bw}" height="${h}" rx="4" style="fill:${c}"/><text x="${x + bw / 2}" y="${top - 6}" font-size="${narrow ? 11 : 12.5}" font-weight="600" text-anchor="middle" style="fill:var(--sys-ink)">${s.total ? '' : s.v >= 0 ? '+' : '−'}$${Math.abs(s.v).toFixed(s.total ? 0 : 1)}M</text>`;
    out += (narrow ? s.l.slice(0, 1) : s.l).map((t, k) => `<text x="${x + bw / 2}" y="${H - pad.b + 16 + k * 13}" font-size="11.5" text-anchor="middle" style="fill:var(--sys-ink-2);font-family:var(--sys-font)">${t}</text>`).join('');
    if (i < steps.length - 1) { const nx = pad.l + (i + 1) * gap + (gap - bw) / 2; out += `<line x1="${x + bw}" x2="${nx}" y1="${y(run)}" y2="${y(run)}" style="stroke:var(--sys-mute-2)" stroke-dasharray="3 3"/>`; }
  });
  svg.innerHTML = out;
}
function value() {
  const box = $('#v-math'); if (!box) return;
  const ra = ev('ra-fl');
  if (ra) { $('#val-lede').innerHTML = `BSP's entry multiple is an estimated 12–15x (${srcLink('ve-15', 'Frontline public filings')}), already a premium. FirmOS has to protect it and add a measured amount on top.`; }
  const ids = ['rev', 'ebitda', 'up', 'mult', 'exp', 'inv'];
  const fmt = { rev: v => '$' + v + 'M', ebitda: v => '$' + (+v).toFixed(1) + 'M', up: v => (+v).toFixed(1) + '%', mult: v => (+v).toFixed(1) + 'x', exp: v => '+' + (+v).toFixed(1) + 'x', inv: v => '$' + (+v).toFixed(2) + 'M' };
  const calc = (R, E0, u, Mx, x, I) => { const dE = R * u / 100, base = E0 * Mx, fos = (E0 + dE) * (Mx + x); return { dE, base, fos, created: fos - base, margin: dE * Mx, mult: x * (E0 + dE), net: fos - base - I, roi: (fos - base) / I }; };
  const draw = () => {
    const v = Object.fromEntries(ids.map(k => { const i = $('#v-' + k); setP(i); $('#o-' + k).textContent = fmt[k](i.value); return [k, +i.value]; }));
    const r = calc(v.rev, v.ebitda, v.up, v.mult, v.exp, v.inv);
    water($('#v-water'), [{ l: ['Base EV', `${v.ebitda.toFixed(1)}M × ${v.mult.toFixed(1)}x`], v: r.base, total: true, c: 'var(--sys-mute)' }, { l: ['Margin', `ΔEBITDA × ${v.mult.toFixed(1)}x`], v: r.margin }, { l: ['Multiple', `+${v.exp.toFixed(1)}x`], v: r.mult, c: CO_SOFT }, { l: ['Investment'], v: -v.inv }, { l: ['FirmOS EV', 'net of build'], v: r.fos - v.inv, total: true, c: CO }]);
    box.innerHTML = line('EBITDA uplift', '$' + r.dE.toFixed(1) + 'M/yr', `${v.up.toFixed(1)}% of $${v.rev}M revenue`) + line('EV from margin', '$' + r.margin.toFixed(1) + 'M') + line('EV from multiple expansion', '$' + r.mult.toFixed(1) + 'M') + line('Equity value created, net of investment', '$' + r.net.toFixed(1) + 'M', `${r.roi.toFixed(0)}x gross return on $${v.inv.toFixed(2)}M`, 'tot');
  };
  $('#v-in').addEventListener('input', draw); draw();
  const sc = [['Low', 100, 16, 1.5, 12, .5, 3], ['Mid', 120, 18, 2.25, 13.5, 1.0, 2.25], ['High', 140, 20, 3.0, 15, 1.5, 1.5]];
  $('#v-scen').innerHTML = `<thead><tr><th>Case</th><th class="sys-n">Revenue</th><th class="sys-n">ΔEBITDA</th><th class="sys-n">Multiple</th><th class="sys-n">Value created</th></tr></thead><tbody>${sc.map(s => { const r = calc(s[1], s[2], s[3], s[4], s[5], s[6]); return `<tr><td>${s[0]}</td><td class="sys-n">$${s[1]}M</td><td class="sys-n">$${r.dE.toFixed(1)}M</td><td class="sys-n">${s[4]}x +${s[5]}</td><td class="sys-n"><b>$${r.net.toFixed(0)}M</b></td></tr>`; }).join('')}</tbody><caption>Scenarios are estimates built from the roadmap assumption ranges, Oct 2026.</caption>`;
  // evidence list
  const evs = ['ve-15', 've-14', 've-06', 've-17', 've-16'].map(ev).filter(Boolean);
  const conf = c => c === 'high' ? 'High' : c === 'medium' ? 'Medium' : 'Low';
  const when = d => /^\d{4}-\d{2}/.test(String(d || '')) ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : esc(d || '—');
  const clean = t => (window.BSPFrame ? window.BSPFrame.humanizeText(String(t ?? '')) : String(t ?? '')).replace(/\s*\((?:fl|ve|kb|vs)-[\w-]+[^)]*\)/g, '');
  $('#v-ev').innerHTML = evs.length ? evs.map(e => `<div class="risk"><span class="lv sys-chip fl-st fl-st--${e.confidence === 'high' ? 'ok' : e.confidence === 'medium' ? 'warn' : 'bad'}">${conf(e.confidence)}</span><div><h4>${esc(clean(e.title))}</h4><p>${esc(clean(e.claim))}</p><p class="sys-src" style="margin-top:4px"><a href="${esc(e.source_url)}" target="_blank" rel="noopener">${esc(srcName(e))}</a> · ${when(e.date)}</p></div></div>`).join('') : '<p class="sys-src">Evidence file not available.</p>';
}
async function comps(Data) {
  const el = $('#v-comps'); if (!el) return;
  let d = null; try { d = await Data.load('research/public_comps'); } catch (e) { console.debug(e); }
  const rows = (d?.items || []).filter(x => x.sector_tag === 'legal_bpo_managed_services' && x.ebitda_margin_latest_pct != null).sort((a, b) => b.ebitda_margin_latest_pct - a.ebitda_margin_latest_pct);
  if (!rows.length) { el.innerHTML = '<p class="sys-src">Public comparables are not available right now.</p>'; return; }
  const data = rows.map(x => [`${x.ticker} · FY${x.latest_fy}`, x.ebitda_margin_latest_pct, CO_SOFT]);
  data.splice(data.findIndex(r => r[1] < 15.5), 0, ['Frontline (midpoint)', 15.5, CO]);
  bars(el, data, { fmt: v => v.toFixed(1) + '%', max: 20, labelW: 150 });
  $('#v-comps-src').innerHTML = `<b>Source:</b> Public comparables, SEC XBRL company facts (EBITDA approximated as operating income plus D&amp;A). Frontline's 13–18% is an analyst estimate from Frontline public filings (low confidence)<span class="sys-est">est.</span>; the bar shows the midpoint. WNS was acquired in 2025 and CBIZ agreed to a sale in 2026.`;
}

/* ── Stack, roadmap, risks ── */
function stack() {
  const t = $('#stack-tbl'); if (!t) return;
  const buy = EV.filter(x => x.kind === 'vendor_stack' && x.company === 'fl');
  const build = [['FirmOS data layer', 'Data platform', 'One model across PSA/RMM tickets, identity, DMS logs, eBilling and A/R, with history from the roll-up entities brought in.', 'Proprietary operating data is the asset a buyer diligences.'], ['Tier-0 agent (on HELIX)', 'AI service desk', 'Firm-scoped retrieval over runbooks, action execution through Rewst, human handoff with context.', 'Legal-specific behavior and audit trail. Generic bots fail OCG review.'], ['Posture score + evidence library', 'Security product', 'Scores controls continuously and maps evidence to client OCGs and insurer questionnaires.', 'Turns security from a cost line into a renewal argument.'], ['LEDES rules engine', 'RCM product', 'A library of client billing guidelines with pre-flight checks, auto-fixes and appeal drafting.', 'The guideline library compounds with every client added.'], ['Client portal + Insight', 'Experience', 'Tickets, SLAs, posture and billing in one view; QBR packs; churn early warning.', 'Where the client sees the value every month.']];
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Vendor site'; } };
  const cat = c => (window.BSPFrame ? window.BSPFrame.humanizeText(String(c ?? '')) : String(c ?? '')).replace(/^\w/, m => m.toUpperCase());
  t.innerHTML = `<thead><tr><th>Component</th><th>Choice</th><th>What it does</th><th>Pricing or rationale</th><th>Source</th></tr></thead><tbody>${buy.map(x => `<tr><td>${esc(x.vendor)}<div class="sys-src">${esc(cat(x.category))}</div></td><td><span class="bb buy">Buy</span></td><td>${esc(x.what_it_does)}${x.note ? `<div class="sys-src">${esc(x.note)}</div>` : ''}</td><td>${esc(x.pricing_note)}</td><td><a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(host(x.source_url))} ↗</a></td></tr>`).join('')}${build.map(b => `<tr><td>${b[0]}<div class="sys-src">${b[1]}</div></td><td><span class="bb build">Build</span></td><td>${b[2]}</td><td>${b[3]}</td><td>Concept</td></tr>`).join('')}</tbody><caption>Source: OS program evidence, vendor stack for Frontline (vendor sites and pricing pages, Sept 2026); build items are concept scope.</caption>`;
}
function roadmap() {
  const g = $('#gantt'); if (!g) return;
  const mon = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const rows = [['Data layer: PSA, RMM, billing unified', 'CTO · PRG', 1, 3, 'b3', 'Foundation'], ['Rewst automation library', 'Service desk lead', 1, 5, 'b1', 'Identity, joiner and leaver flows'], ['Tier-0 agent: pilot → scale', 'CTO', 2, 9, 'b1', 'Pilot 20 firms → all'], ['LEDES pre-flight rules engine', 'RCM lead', 2, 6, 'b2', 'Top-50 client guidelines'], ['Posture score + evidence packs', 'CISO', 3, 7, 'b2', 'Score live in portal'], ['Client portal v2', 'Product', 4, 9, 'b2', 'Desk · security · billing'], ['Collect: A/R + appeals', 'RCM lead', 6, 10, 'b1', 'Appeal drafting'], ['Mid-size GTM, assessment-led', 'CRO · PRG', 6, 12, 'b4', '143 researched firms'], ['Insight: QBR packs, churn signals', 'Client success', 8, 12, 'b3', 'Renewal defense']];
  g.innerHTML = `<div class="g-head"><div>Workstream · owner</div>${mon.map(m => `<div>${m}</div>`).join('')}</div>${rows.map(r => `<div class="g-row"><div class="nm">${r[0]}<small>${r[1]}</small></div><div style="grid-column:${r[2] + 1} / ${r[3] + 2}"><div class="g-bar ${r[4]}" title="${r[5]}">${r[5]}</div></div></div>`).join('')}<div class="g-row" style="min-height:40px"><div class="nm ms">Milestones</div><div class="g-ms" style="grid-column:7 / 8"><span class="sys-chip fl-st fl-st--ac">◆ First EBITDA read</span></div><div class="g-ms" style="grid-column:13 / 14"><span class="sys-chip fl-st fl-st--ok end">◆ Exit-ready</span></div></div>`;
}
function risks() {
  const el = $('#risk-list'); if (!el) return;
  const R = [['HIGH', 'bad', 'AI near privileged material', 'Tier-0 could touch matter names or document metadata.', 'Firm-scoped retrieval over runbooks only, no training on client data, full audit log, and opt-in per client guideline.'], ['HIGH', 'bad', 'Client limits on offshore and AI handling', 'Some outside counsel guidelines restrict where data is touched and by what.', 'Per-client routing rules that pin work to approved hubs and switch AI off by client. The trust center lists hubs and subprocessors.'], ['MED', 'warn', 'Benchmarks are dated or vendor-sourced', 'MetricNet data is from 2011, and the vendor case studies are self-reported.', 'Baseline Frontline\'s own ticket and billing data in month one, then re-cut the value math before committing the second half of the budget.'], ['MED', 'warn', 'Savings competed away in pricing', 'Clients may ask for automation gains back at renewal.', 'Keep about 60% as margin, and sell the posture score and portal as a paid tier rather than giving them away.'], ['MED', 'warn', 'Roll-up integration debt', 'Intelliteach, Hilltop, LOGICFORCE, Glasser, InvoicePrep and KL Software each brought their own systems.', 'Build the data layer first and standardize on one PSA before scaling Tier-0.'], ['LOW', 'ok', 'Attorney adoption', 'Partners may bypass self-serve and call the desk directly.', 'Keep a white-glove line one tap away, and measure attorney CSAT next to deflection.']];
  const LV = { HIGH: 'High', MED: 'Medium', LOW: 'Low' };
  el.innerHTML = R.map(r => `<div class="risk"><span class="lv sys-chip fl-st fl-st--${r[1]}">${LV[r[0]] || r[0]}</span><div><h4>${r[2]}</h4><p>${r[3]}</p><p class="ctrl"><b>Control:</b> ${r[4]}</p></div></div>`).join('');
}

export async function firmos({ Data, esc: e }) {
  if (e) esc = e;
  try { const d = await Data.load('research/serviceos_evidence'); EV = d?.items || []; } catch (err) { console.debug(err); EV = []; }
  heroKpis(); simulator(); scorecard(); ledes(); realization(); value(); stack(); roadmap(); risks();
  const st = store.get('fl-posture', {}) || {}; const a = { ...SAMPLE, ...st }; let s = 0; QUESTIONS.forEach(q => s += q.w * a[q.id]);
  portal(Math.round(s));
  growth(Data); comps(Data);
}
