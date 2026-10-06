/* SignalOS product page: demo tabs, synthetic-audience test, compliance workflow, value math, evidence. */
import { Data, Fmt } from '../../assets/core.js?v=20261006155542';
import { chrome, mountChat, plain } from './site.js?v=20261006155542';
import { mountMonitor, reduceMotion } from './monitor.js?v=20261006155542';
import { Frame } from '../../assets/frame.js?v=20261006155542';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const m$ = (v, d = 1) => '$' + (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(d) + 'M');
chrome();

/* ── cyclicality chart (FEC gross billings to BPI, from the BPI filings dataset) ── */
(function cyc() {
  const el = $('#cyc-chart'); if (!el) return;
  const d = [['2020', 96.5], ['2022', 3.1], ['2024', 115.3], ['2026 YTD', 0.04]];
  const W = 560, H = 330, pl = 8, pb = 34, pt = 34, bw = 86, gap = (W - pl * 2 - bw * d.length) / (d.length - 1), mx = 120;
  const bars = d.map(([y, v], i) => { const x = pl + i * (bw + gap), h = Math.max(2, v / mx * (H - pb - pt)), yy = H - pb - h; const peak = v > 50; return `<rect x="${x}" y="${yy}" width="${bw}" height="${h}" rx="6" class="${peak ? 'bar-b' : 'bar-a'}"/><text x="${x + bw / 2}" y="${yy - 9}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-weight="600" font-size="19" class="lab-v" letter-spacing="-.5">${v >= 1 ? '$' + v.toFixed(1) + 'M' : '$41K'}</text><text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="12" class="lab-x">${y}</text>`; }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Federal political committee payments to BPI: 2020 $96.5M, 2022 $3.1M, 2024 $115.3M, 2026 year to date $41K"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" class="base"/>${bars}</svg>`;
})();

/* ── demo tabs ─────────────────────────────────────────────────────────── */
const tabs = [...document.querySelectorAll('.demo-tabs [role=tab]')];
const select = t => { tabs.forEach(b => { const on = b === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('#' + b.getAttribute('aria-controls')).hidden = !on; }); };
tabs.forEach((b, i) => { b.addEventListener('click', () => select(b)); b.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; select(n); n.focus(); } }); });
select(tabs[0]);
const mon = $('#monitor-app'); if (mon) mountMonitor(mon, { initial: 'ai-jobs' });

/* ── synthetic-audience message test (illustrative scores) ─────────────── */
const MSGS = [
  { k: 'A', name: 'Commitment', tx: 'We will retrain every employee whose role changes because of AI, and report progress every quarter.' },
  { k: 'B', name: 'Growth', tx: 'AI is making our teams more productive, and we are hiring into the new roles it creates.' },
  { k: 'C', name: 'Transparency', tx: 'We will publish an independent AI workforce report every year, covering roles changed and roles created.' },
];
const AUD = [
  { id: 'pol', name: 'Policymakers & staff (DC)', sc: [62, 41, 68], ci: 6 },
  { id: 'inv', name: 'Institutional investors', sc: [48, 71, 55], ci: 7 },
  { id: 'vot', name: 'Swing voters (US)', sc: [66, 38, 59], ci: 5 },
  { id: 'emp', name: 'Employees', sc: [74, 45, 61], ci: 5 },
  { id: 'eu', name: 'EU officials (Brussels)', sc: [58, 33, 72], ci: 8 },
];
$('#mt-msgs').innerHTML = MSGS.map(m => `<div class="msg-opt"><b>${m.k} · ${esc(m.name)}</b><p>${esc(m.tx)}</p></div>`).join('');
$('#mt-aud').innerHTML = AUD.map((a, i) => `<label><input type="checkbox" value="${a.id}" ${i !== 4 ? 'checked' : ''}><span>${esc(a.name)}</span></label>`).join('');
const resRow = (a, filled) => { const best = a.sc.indexOf(Math.max(...a.sc)); return `<div class="mt-row"><div class="who">${esc(a.name)}</div><div class="bars">${a.sc.map((v, i) => `<div class="bar${filled && i === best ? ' win' : ''}"><span>${MSGS[i].k}</span><span class="tk"><i style="width:${filled ? v : 0}%"></i><span class="ci" style="left:${filled ? v - a.ci : 0}%;width:${filled ? a.ci * 2 : 0}%"></span></span><span>${filled ? v + ' ±' + a.ci : '—'}</span></div>`).join('')}</div></div>`; };
const chosen = () => [...document.querySelectorAll('#mt-aud input:checked')].map(i => AUD.find(a => a.id === i.value));
const drawEmpty = () => { const c = chosen(); $('#mt-res').innerHTML = c.map(a => resRow(a, false)).join('') || '<p class="sys-src">Pick at least one audience.</p>'; $('#mt-rec').innerHTML = ''; $('#mt-n').textContent = c.length ? `${c.length * 480} synthetic respondents` : '—'; $('#mt-prog').style.width = '0'; };
document.querySelectorAll('#mt-aud input').forEach(i => i.addEventListener('change', drawEmpty)); drawEmpty();
$('#mt-run').addEventListener('click', () => {
  const c = chosen(); if (!c.length) return; const btn = $('#mt-run'); btn.disabled = true; drawEmpty();
  let p = 0; const dur = reduceMotion() ? 50 : 1600; const t0 = performance.now();
  const step = now => { p = Math.min(1, (now - t0) / dur); $('#mt-prog').style.width = (p * 100) + '%'; if (p < 1) return requestAnimationFrame(step); finish(); };
  const finish = () => {
    $('#mt-res').innerHTML = c.map(a => resRow(a, false)).join('');
    requestAnimationFrame(() => { $('#mt-res').innerHTML = c.map(a => resRow(a, true)).join(''); });
    const avg = MSGS.map((m, i) => Math.round(c.reduce((s, a) => s + a.sc[i], 0) / c.length));
    const bi = avg.indexOf(Math.max(...avg)); const second = avg.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0])[1][1];
    const splits = c.filter(a => a.sc.indexOf(Math.max(...a.sc)) !== bi);
    $('#mt-rec').innerHTML = `<div class="move rec"><div style="grid-column:1/-1"><span class="sev lo">Recommendation</span><h4>Lead with ${MSGS[bi].k} · ${esc(MSGS[bi].name)} (avg ${avg[bi]})</h4><ol><li>${splits.length ? `Use ${splits.map(a => `${MSGS[a.sc.indexOf(Math.max(...a.sc))].k} with ${esc(a.name)}`).join('; ')}, where it outperforms.` : `It wins every audience tested; no split messaging needed.`}</li><li>Validate ${MSGS[bi].k} and ${MSGS[second].k} with a live Message House elite panel (about 300 respondents, 48–72 hours) before launch.</li><li>Drop the lowest scorer from paid media; keep it for owned channels only if employees respond.</li></ol></div></div>`;
    btn.disabled = false; btn.innerHTML = 'Run again <span aria-hidden="true">→</span>';
  };
  requestAnimationFrame(step);
});

/* ── compliance-gated content workflow ─────────────────────────────────── */
const STEPS = [
  ['Brief from monitor alert', 'Deepfake memo clip · risk 77 · auto-created', 'auto'],
  ['AI draft in client voice', 'Brand-voice model + approved fact base', 'auto'],
  ['Claims check', 'Every number traced to an approved source', 'check'],
  ['Disclosure check', 'Listed company: forward-looking and Reg FD rules', 'check'],
  ['Account lead review', 'Human edit and tone pass', 'gate'],
  ['Counsel sign-off', 'Employment counsel approves the final text', 'gate'],
  ['Publish & measure', 'Newsroom, social, reporter briefings; scorecard starts', 'auto'],
];
let wf;
const wfReset = () => { wf = { i: -1, fixed: { c1: false, c2: false }, signed: false, running: false }; drawWF(); };
const docHTML = () => `<div class="dh"><span>Draft v${wf.fixed.c1 && wf.fixed.c2 ? 3 : wf.i >= 1 ? 2 : 1} · Holding statement</span><span>${wf.i >= 6 ? 'Published' : wf.signed ? 'Approved' : 'Draft · not for release'}</span></div><h5>Statement on a video circulating today</h5>
  ${wf.i < 1 ? '<p style="color:var(--mute)">Waiting for the AI draft…</p>' : `<p>A video circulating today claims to show an internal memo about job cuts. It is not authentic, and we have asked platforms to label it.</p>
  <p>${wf.fixed.c1 ? '<mark class="fixed">Our AI academy has already helped 1,200 employees move into new roles.</mark>' : '<mark>Our AI tools have already lifted productivity by 30% across the company.</mark>'} We are committed to retraining every employee whose role changes because of AI${wf.fixed.c2 ? ', and <mark class="fixed">we will report our progress publicly every quarter.</mark>' : ', and <mark>we expect to hire 2,000 people into new AI roles next year.</mark>'}</p>
  <p>Our full plan is published on our newsroom today.</p>`}<div class="wm">Fact base: client 10-K, AI academy enrolment data (Sept 2026), approved Q&amp;A · illustrative</div>`;
function stepState(k) {
  if (k === 2 && wf.i >= 2) return wf.fixed.c1 ? 'done' : 'flag';
  if (k === 3 && wf.i >= 3) return wf.fixed.c2 ? 'done' : 'flag';
  if (k === 5 && wf.i >= 5) return wf.signed ? 'done' : 'run';
  if (k < wf.i) return 'done'; if (k === wf.i) return wf.running ? 'run' : 'done'; return '';
}
function drawWF() {
  $('#wf-steps').innerHTML = STEPS.map(([t, s, kind], k) => { const st = stepState(k); const lbl = st === 'done' ? 'Passed' : st === 'flag' ? 'Flagged' : st === 'run' ? (kind === 'gate' ? 'Awaiting human' : 'Running') : kind === 'gate' ? 'Human gate' : kind === 'check' ? 'Checkpoint' : 'Automated'; return `<li class="step ${st}${kind === 'gate' && !st ? ' gate' : ''}"><span class="n">${st === 'done' ? '✓' : st === 'flag' ? '!' : k + 1}</span><div><b>${esc(t)}</b><span>${esc(s)}</span></div><span class="st">${lbl}</span></li>`; }).join('');
  $('#wf-doc').innerHTML = docHTML();
  const iss = [];
  if (wf.i >= 2) iss.push(wf.fixed.c1 ? `<div class="sys-note sys-note--good"><span><b>Claims check passed.</b> Replaced with a figure from the approved fact base.</span></div>` : `<div class="sys-note sys-note--warn"><span><b>Unsupported claim:</b> “30% productivity” has no approved source. Suggested: the AI academy figure from the fact base.</span><button class="sys-btn sys-btn--secondary sys-btn--sm" type="button" data-fix="c1">Apply fix</button></div>`);
  if (wf.i >= 3) iss.push(wf.fixed.c2 ? `<div class="sys-note sys-note--good"><span><b>Disclosure check passed.</b> Forward-looking hiring number removed.</span></div>` : `<div class="sys-note sys-note--warn"><span><b>Forward-looking statement:</b> a hiring forecast from a listed company needs safe-harbor language or removal.</span><button class="sys-btn sys-btn--secondary sys-btn--sm" type="button" data-fix="c2">Remove forecast</button></div>`);
  if (wf.i >= 5 && !wf.signed) iss.push(`<div class="sys-note sys-note--co"><span><b>Human gate:</b> employment counsel must approve before anything ships.</span><button class="sys-btn sys-btn--co sys-btn--sm" type="button" data-sign>Sign off as counsel</button></div>`);
  if (wf.i >= 6) iss.push(`<div class="sys-note sys-note--good"><span><b>Published.</b> Scorecard tracking started: share of voice, sentiment on the “AI is replacing workers” cluster, reporter pickup. Time from alert to release in this run: under 2 hours (illustrative).</span></div>`);
  $('#wf-issues').innerHTML = iss.join('');
  document.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => { wf.fixed[b.dataset.fix] = true; drawWF(); advance(); });
  document.querySelector('[data-sign]')?.addEventListener('click', () => { wf.signed = true; drawWF(); advance(); });
  $('#wf-run').disabled = wf.i >= 0;
}
function advance() {
  const blocked = () => (wf.i === 2 && !wf.fixed.c1) || (wf.i === 3 && !wf.fixed.c2) || (wf.i === 5 && !wf.signed) || wf.i >= 6;
  if (wf.running) return;
  const go = () => { if (blocked()) { wf.running = false; drawWF(); return; } wf.i++; wf.running = true; drawWF(); setTimeout(() => { wf.running = false; drawWF(); go(); }, reduceMotion() ? 10 : 650); };
  go();
}
$('#wf-run').addEventListener('click', () => { if (wf.i < 0) advance(); });
$('#wf-reset').addEventListener('click', wfReset);
wfReset();

/* ── value math ─────────────────────────────────────────────────────────── */
const R = id => +$('#' + id).value;
function value(rev, base, up, mult, turns) { const e0 = rev * base / 100, u = rev * up / 100, va = u * mult, vb = turns * (e0 + u); return { e0, u, va, vb, tot: va + vb }; }
function calc() {
  const rev = R('r-rev') * 1e6, base = R('r-base'), up = R('r-up'), mult = R('r-mult'), turns = R('r-turn'), inv = R('r-inv') * 1e6;
  $('#o-rev').textContent = m$(rev, 0); $('#o-base').textContent = base + '%'; $('#o-up').textContent = '+' + up.toFixed(1) + ' pts'; $('#o-mult').textContent = mult.toFixed(1) + 'x'; $('#o-turn').textContent = '+' + (Math.round(turns * 100) / 100) + 'x'; $('#o-inv').textContent = m$(inv);
  const v = value(rev, base, up, mult, turns);
  $('#c-total').textContent = m$(v.tot, 0); $('#c-roi').textContent = `~${Math.round(v.tot / inv)}x the ${m$(inv)} SignalOS investment`;
  $('#c-e0').textContent = m$(v.e0); $('#c-up').textContent = '+' + m$(v.u); $('#c-va').textContent = m$(v.va); $('#c-vb').textContent = m$(v.vb);
  $('#s-a').style.width = (v.va / v.tot * 100) + '%'; $('#s-b').style.width = (v.vb / v.tot * 100) + '%';
}
function cases(ra) {
  const r = ra?.revenue_basis_usd || [85e6, 125e6], u = ra?.ebitda_impact_pct_revenue || [1, 3], t = ra?.multiple_expansion_turns || [0.5, 2];
  const lo = value(r[0], 18, u[0], 8.4, t[0]), hi = value(r[1], 24, u[1], 13, t[1]), mid = value((r[0] + r[1]) / 2, 21, (u[0] + u[1]) / 2, 10, (t[0] + t[1]) / 2);
  $('#c-cases').innerHTML = [['Low', lo], ['Base', mid], ['High', hi]].map(([n, v]) => `<div><span>${n} case</span><b>${m$(v.tot, 0)}</b></div>`).join('');
}
['r-rev', 'r-base', 'r-up', 'r-mult', 'r-turn', 'r-inv'].forEach(id => $('#' + id).addEventListener('input', calc));
calc(); cases(null);

/* ── evidence + stack from serviceos_evidence.json ─────────────────────── */
const fmtMetric = i => { const v = i.metric_value, u = String(i.metric_unit || ''); if (v == null) return '—'; if (/USD/.test(u)) return m$(v, 1); if (/%/.test(u)) return v + '%'; if (/^x|x EV|x EBITDA/.test(u)) return v.toFixed(1) + 'x'; return String(v); };
const conf = c => `<span class="bpi-tag${c === 'high' ? ' bpi-tag--co' : ''}">${esc(c ? c[0].toUpperCase() + c.slice(1) + ' confidence' : '—')}</span>`;
Data.load('research/serviceos_evidence').then(d => {
  const items = d?.items || []; const ra = items.find(i => i.id === 'ra-bpi');
  if (ra) {
    cases(ra);
    const [i0, i1] = ra.investment_usd || [1e6, 2e6]; $('#r-inv').min = i0 / 1e6; $('#r-inv').max = i1 / 1e6;
    const [t0, t1] = ra.multiple_expansion_turns || [0.5, 2]; $('#k2').textContent = `+${t0}–${t1.toFixed(1)}x`;
    calc();
  }
  const kb1 = items.find(i => i.id === 'kb-bpi-1'); if (kb1) { $('#k1-from').textContent = kb1.baseline + '%'; $('#k1-to').textContent = kb1.target + '%'; }
  const kb2 = items.find(i => i.id === 'kb-bpi-2'); if (kb2) $('#ret-share').textContent = kb2.baseline + '%';
  const ev = items.filter(i => (i.kind === 'valuation_evidence' && (i.applies_to || []).includes('bpi')) || (i.kind === 'kpi_benchmark' && i.company === 'bpi'));
  $('#evidence').innerHTML = ev.map(i => {
    const kb = i.kind === 'kpi_benchmark';
    const big = kb ? `${i.baseline ?? '—'}${i.target != null ? ' → ' + i.target : ''}${/%/.test(i.unit) ? '%' : ''}` : fmtMetric(i);
    const body = String(kb ? [i.baseline_basis, i.target_basis].filter(Boolean).join(' ') : (i.claim || ''));
    return `<article class="sys-card evc"><span class="sys-card-label">${kb ? 'KPI benchmark' : 'Valuation evidence'}</span><div class="v">${esc(big)}${kb && i.target != null ? '<span class="sys-est">est.</span>' : ''}</div><p class="sys-card-title">${esc(plain(kb ? i.kpi : i.title))}</p><p class="sys-card-body">${esc(plain(body).slice(0, 230))}${body.length > 230 ? '…' : ''}</p><div class="ft"><a class="sys-src" href="${esc(i.source_url)}" target="_blank" rel="noopener">${esc(kb ? Fmt.host(i.source_url) : plain(i.source_name || Fmt.host(i.source_url)))} ↗</a>${kb ? '<span class="bpi-tag">Benchmark</span>' : conf(i.confidence)}</div></article>`;
  }).join('') || '<p class="sys-src">Evidence file not available.</p>';
  const vs = items.filter(i => i.kind === 'vendor_stack' && i.company === 'bpi');
  const build = [
    ['Narrative models', 'BPI-built (on vendor feeds)', 'Clusters signals into client-specific narratives; scores velocity, sentiment and synthetic-media risk; drafts the recommended move.', 'Inside the $1–2M program (est.)', 'build'],
    ['Audience Lab', 'Message House panels + simulation', 'Synthetic pre-tests narrow options in hours; Message House elite panels validate finalists across EMEA.', 'Per-study; replaces part of live fieldwork', 'build'],
    ['Compliance rules', 'BPI-built rules engine', 'Fact base per client, claims tracing, regulated-sector disclosures (health, energy, financial), legal routing and audit log.', 'Inside the $1–2M program (est.)', 'build'],
    ['Outcome dashboards', 'BPI-built BI layer', 'Retainer scorecards: share of voice, narrative sentiment, policy outcomes, paid-media lift.', 'Inside the $1–2M program (est.)', 'build'],
  ];
  $('#stack-tbl tbody').innerHTML = vs.map(v => `<tr><td>${esc(Frame.humanizeText(String(v.category || '')))}</td><td><a href="${esc(v.source_url)}" target="_blank" rel="noopener">${esc(v.vendor)}</a></td><td>${esc(plain(v.what_it_does))}</td><td>${esc(plain(v.pricing_note))}</td><td><span class="bb buy">Buy</span></td></tr>`).join('') + build.map(b => `<tr><td>${esc(b[0])}</td><td>${esc(b[1])}</td><td>${esc(b[2])}</td><td>${esc(b[3])}</td><td><span class="bb build">Build</span></td></tr>`).join('');
}).catch(() => { $('#evidence').innerHTML = '<p class="sys-src">Evidence file not available; the defaults above come from the OS program evidence.</p>'; });

/* ── roadmap ───────────────────────────────────────────────────────────── */
(function gantt() {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const rows = [
    ['Stack and data layer', 'Owner: BPI COO and the Portfolio Resource Group', 1, 2, '', 'Contracts, SSO, client workspaces'],
    ['Narrative monitor pilot', 'Owner: Insights lead', 2, 5, 'b', '10 corporate clients from Index briefings'],
    ['Compliance studio', 'Owner: Head of corporate affairs', 3, 6, '', 'Fact bases and legal routing'],
    ['Audience lab', 'Owner: Message House', 4, 8, '', 'Synthetic and live panel loop'],
    ['Outcome dashboards', 'Owner: Analytics', 6, 9, '', 'Renewal scorecards'],
    ['Productized tiers launch', 'Owner: CEO and CFO', 6, 12, 'b', 'Pricing, contracts, enablement'],
    ['Europe rollout', 'Owner: London and Berlin MDs', 8, 12, 'l', 'DE and FR, EU data residency'],
  ];
  const el = $('#gantt'); if (!el) return;
  const rng = (a, b) => `${months[a - 1]}${a === b ? '' : '–' + months[b - 1]}`;
  el.innerHTML = `<div class="g-head"><div class="lbl">Workstream · Oct 2026 – Sep 2027</div><div class="g-months">${months.map(m => `<span>${m}</span>`).join('')}</div></div>` + rows.map(([t, o, s, e, c, note]) => `<div class="g-row"><div class="lbl"><b>${esc(t)}</b><span>${esc(note)} · ${esc(o.replace('Owner: ', ''))}</span></div><div class="g-track"><span class="g-bar ${c}" style="left:calc(${(s - 1) / 12 * 100}% + 4px);width:calc(${(e - s + 1) / 12 * 100}% - 8px)">${rng(s, e)}</span></div></div>`).join('') + `<div class="g-row"><div class="lbl"><b>Milestones</b><span>Month 6 first SignalOS revenue · month 12 ARR reported to the board and lenders</span></div><div class="g-track g-mst" style="height:56px"><span class="g-ms" style="left:calc(50% - 1px)" data-l="Month 6 · first SignalOS revenue"></span><span class="g-ms" style="left:calc(100% - 4px)"></span><span class="g-m12">Month 12 · ARR reported to board</span></div></div>`;
})();

mountChat(['What is SignalOS?', 'How do retainers and pricing work?', 'How fast can you respond in a crisis?', 'Can you test our message before we launch it?', 'Do you work in Brussels and Berlin?']);
