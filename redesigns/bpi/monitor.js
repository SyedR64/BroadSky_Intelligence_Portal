/* ═══════════════════════════════════════════════════════════════════════════
   SignalOS narrative monitor — illustrative engine shared by the BPI concept
   site and the SignalOS product page. All signals, clients and scores below are
   ILLUSTRATIVE (written for the demo); outlets are described generically.
   ═══════════════════════════════════════════════════════════════════════════ */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const compact = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
const sCol = v => v <= -0.25 ? 'var(--neg)' : v >= 0.25 ? 'var(--pos)' : 'var(--neu)';
export const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const GLYPH = {
  News: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Zm13 4h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4"/></svg>',
  Social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>',
  Video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg>',
  Policy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18L12 4 3 10Zm2 0v8m4-8v8m6-8v8m4-8v8M3 20h18"/></svg>',
  Podcast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  Forum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h12v8H7l-4 3V5Zm6 11h8l4 3V9h-3"/></svg>',
};

export const SCENARIOS = [
  {
    id: 'ai-jobs', label: 'AI & jobs', client: 'Fortune 100 technology employer', markets: 'US · UK · DE', risk: 71,
    curve: { base: 380, spikeAt: 19, amp: 2.6, s0: -0.08, dip: -0.42 },
    clusters: [
      { n: '“AI is replacing workers”', share: 36, s: -0.58, tr: 'up' },
      { n: 'Deepfake “leaked memo” clip', share: 14, s: -0.81, tr: 'up', flag: 'Synthetic?' },
      { n: 'Reskilling commitments', share: 21, s: 0.38, tr: 'fl' },
      { n: 'Productivity & wages', share: 17, s: 0.12, tr: 'fl' },
      { n: 'Workforce hearings (US/DE)', share: 12, s: -0.28, tr: 'up' },
    ],
    move: {
      sev: 'hi', sevL: 'Elevated', window: 'Act within 6 hours', title: 'Put provenance out before the clip reaches broadcast',
      steps: ['Publish a provenance statement with the authentic memo; request platform labels on the clip', 'Brief four tier-1 labor and tech reporters with the reskilling data', 'Activate 12 employee voices from the AI academy cohort', 'Prep CEO lines for the committee hearing; align Berlin works-council messaging'],
      draft: 'A video circulating today claims to show an internal memo about job cuts. It is not authentic. Our actual plan, published this morning, commits to retraining every employee whose role changes because of AI, and we will report progress publicly every quarter.',
      checks: [['ok', 'Claims match approved fact base'], ['ok', 'No forward-looking headcount figures'], ['hold', 'Employment counsel sign-off']],
    },
    signals: [
      { ch: 'Video', src: 'Creator · 1.4M followers', rg: 'US', tx: 'Clip claims a “leaked memo” cuts 30% of support roles by spring; provenance unverified', s: -0.82, r: 1.4e6, flag: 'Synthetic media?' },
      { ch: 'News', src: 'Tier-1 national daily', rg: 'US', tx: 'Analysis: large employers quietly rewrite hiring plans around AI copilots', s: -0.35, r: 2.1e6 },
      { ch: 'Policy', src: 'Senate committee notice', rg: 'US', tx: 'Hearing scheduled on AI and workforce displacement; three large employers invited', s: -0.22, r: 4.0e4 },
      { ch: 'Social', src: 'Labor organizer · 210K', rg: 'US', tx: 'Thread asks employees to share layoff notices tied to AI rollouts', s: -0.66, r: 2.1e5 },
      { ch: 'News', src: 'Business wire', rg: 'UK', tx: 'Retail group reports 9% productivity gain from AI scheduling with no headcount cut', s: 0.42, r: 6.0e5 },
      { ch: 'Podcast', src: 'Top-20 tech podcast', rg: 'US', tx: 'Hosts argue the “AI layoffs” framing is overstated and point to reskilling funds', s: 0.14, r: 9.0e5 },
      { ch: 'Policy', src: 'Bundestag digital committee', rg: 'DE', tx: 'Committee requests data on AI-related restructuring from large employers', s: -0.25, r: 3.0e4 },
      { ch: 'Social', src: 'Employee post · 18K reshares', rg: 'US', tx: 'Engineer shares her path through the company AI academy into a new role', s: 0.61, r: 3.4e5 },
      { ch: 'Forum', src: 'Large investing forum', rg: 'US', tx: 'Thread links share-price moves to AI cost-cutting headlines', s: -0.18, r: 2.8e5 },
      { ch: 'News', src: 'HR trade press', rg: 'UK', tx: 'Survey: workers trust employers who publish an AI transition plan', s: 0.33, r: 1.2e5 },
      { ch: 'Video', src: 'Fact-check channel', rg: 'US', tx: 'Frame analysis flags artifacts consistent with a generated document in the memo clip', s: 0.22, r: 4.5e5 },
      { ch: 'News', src: 'German business daily', rg: 'DE', tx: 'Works councils seek a say over AI deployment in customer service', s: -0.31, r: 3.9e5 },
    ],
  },
  {
    id: 'grid', label: 'Data centers & power bills', client: 'Utility and data-center coalition', markets: 'US · Mid-Atlantic', risk: 58,
    curve: { base: 260, spikeAt: 15, amp: 1.7, s0: -0.12, dip: -0.3 },
    clusters: [
      { n: 'Data centers raise household bills', share: 41, s: -0.62, tr: 'up' },
      { n: 'Grid reliability warnings', share: 19, s: -0.35, tr: 'up' },
      { n: 'Local jobs & tax base', share: 18, s: 0.44, tr: 'fl' },
      { n: 'Clean firm power deals', share: 13, s: 0.31, tr: 'dn' },
      { n: 'Moratorium proposals', share: 9, s: -0.4, tr: 'up' },
    ],
    move: {
      sev: 'md', sevL: 'Watch', window: 'Next 48 hours', title: 'Reframe from cost to capacity before the utility-commission hearing',
      steps: ['Publish project-by-project cost-allocation data in plain language', 'Line up two county executives and a building-trades leader as validators', 'Geo-target ratepayer explainer video in the three affected districts', 'Brief state energy reporters ahead of the commission docket'],
      draft: 'Coalition members pay for the grid upgrades their facilities need, so households do not. This week we are publishing the cost-allocation numbers for every project in the state, and we will testify to them at the commission.',
      checks: [['ok', 'Figures tie to filed tariff documents'], ['ok', 'Disclosure: coalition members named'], ['hold', 'Regulatory counsel review']],
    },
    signals: [
      { ch: 'News', src: 'Regional daily', rg: 'US', tx: 'Ratepayers face higher summer bills as utility cites new large-load demand', s: -0.58, r: 7.2e5 },
      { ch: 'Policy', src: 'State utility commission', rg: 'US', tx: 'Docket opened on cost allocation for large-load interconnections', s: -0.1, r: 2.0e4 },
      { ch: 'Social', src: 'Consumer advocate · 95K', rg: 'US', tx: '“Your bill is subsidizing someone else’s server farm” graphic spreads', s: -0.71, r: 6.1e5 },
      { ch: 'News', src: 'Energy trade press', rg: 'US', tx: 'Grid operator flags tighter reserve margins for next summer', s: -0.36, r: 1.4e5 },
      { ch: 'Video', src: 'Local TV segment', rg: 'US', tx: 'County celebrates first data-center tax payment funding two schools', s: 0.52, r: 3.3e5 },
      { ch: 'Forum', src: 'Neighborhood forum', rg: 'US', tx: 'Residents debate noise and water use at proposed campus', s: -0.44, r: 2.4e4 },
      { ch: 'Podcast', src: 'Energy policy podcast', rg: 'US', tx: 'Economists split on whether large loads raise or lower average rates long term', s: 0.05, r: 1.1e5 },
      { ch: 'Policy', src: 'State legislator', rg: 'US', tx: 'Bill drafted to pause new large-load hookups for 18 months', s: -0.48, r: 6.0e4 },
      { ch: 'News', src: 'Business wire', rg: 'US', tx: 'Coalition member signs 20-year clean firm power contract', s: 0.39, r: 2.6e5 },
      { ch: 'Social', src: 'Building-trades union', rg: 'US', tx: 'Post highlights 1,100 construction jobs on grid upgrade projects', s: 0.47, r: 8.8e4 },
    ],
  },
  {
    id: 'eu-ai', label: 'EU AI Act enforcement', client: 'US platform company with EU operations', markets: 'EU · DE · US', risk: 46,
    curve: { base: 210, spikeAt: 10, amp: 1.4, s0: -0.05, dip: -0.22 },
    clusters: [
      { n: 'Compliance gaps in general-purpose AI', share: 33, s: -0.45, tr: 'up' },
      { n: 'Brussels vs. Washington framing', share: 24, s: -0.2, tr: 'up' },
      { n: 'Transparency & labelling', share: 19, s: 0.25, tr: 'fl' },
      { n: 'Startup competitiveness', share: 14, s: 0.18, tr: 'fl' },
      { n: 'Enforcement timeline confusion', share: 10, s: -0.15, tr: 'dn' },
    ],
    move: {
      sev: 'lo', sevL: 'Monitor', window: 'This week', title: 'One position, three capitals',
      steps: ['Publish a plain-language model transparency summary in EN, DE and FR', 'Brief Brussels trade press and two Berlin dailies ahead of the Commission Q&A', 'Align DC messaging so transatlantic framing does not read as resistance', 'Seed third-party validators: two academic labs and an SME association'],
      draft: 'We support the AI Act’s transparency goals. Today we are publishing a plain-language summary of how our models are trained and tested, in English, German and French, and we will update it with every major release.',
      checks: [['ok', 'Consistent with filed compliance documentation'], ['ok', 'Translations reviewed in-market'], ['hold', 'EU regulatory counsel sign-off']],
    },
    signals: [
      { ch: 'Policy', src: 'European Commission Q&A', rg: 'EU', tx: 'Guidance published on transparency duties for general-purpose models', s: 0.08, r: 9.0e4 },
      { ch: 'News', src: 'Brussels policy outlet', rg: 'EU', tx: 'Officials signal early scrutiny of large US model providers', s: -0.42, r: 2.2e5 },
      { ch: 'News', src: 'German national daily', rg: 'DE', tx: 'Editorial: “Rules are only as strong as their enforcement”', s: -0.3, r: 5.4e5 },
      { ch: 'Social', src: 'MEP staffer · 40K', rg: 'EU', tx: 'Thread lists providers that have not yet published training summaries', s: -0.52, r: 4.0e4 },
      { ch: 'Podcast', src: 'Tech policy podcast', rg: 'US', tx: 'Hosts frame EU enforcement as a transatlantic trade irritant', s: -0.24, r: 2.7e5 },
      { ch: 'News', src: 'Startup trade press', rg: 'EU', tx: 'European founders welcome clearer labelling rules', s: 0.36, r: 8.0e4 },
      { ch: 'Forum', src: 'Developer forum', rg: 'EU', tx: 'Engineers compare provider documentation quality side by side', s: 0.1, r: 6.5e4 },
      { ch: 'Policy', src: 'Bundestag digital committee', rg: 'DE', tx: 'Hearing on national supervisory authority staffing', s: -0.12, r: 2.5e4 },
      { ch: 'Video', src: 'Explainer channel · 600K', rg: 'EU', tx: '“What the AI Act means for your feed” explainer trends', s: 0.21, r: 6.0e5 },
      { ch: 'News', src: 'US trade press', rg: 'US', tx: 'Companies weigh EU-first transparency reports as a global standard', s: 0.28, r: 1.9e5 },
    ],
  },
];

/* deterministic noise */
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function series(sc) {
  const r = rng(sc.id.length * 9973 + sc.risk), c = sc.curve, out = [];
  for (let h = 0; h < 24; h++) {
    const bump = Math.exp(-Math.pow((h - c.spikeAt) / 2.6, 2)) * c.amp + (h > c.spikeAt ? 0.45 * c.amp * Math.exp(-(h - c.spikeAt) / 6) : 0);
    const v = Math.round(c.base * (0.75 + 0.35 * r() + bump));
    const s = Math.max(-0.95, Math.min(0.9, c.s0 + c.dip * (bump / c.amp) + (r() - 0.5) * 0.14));
    out.push({ h, v, s });
  }
  return out;
}

export function chartSVG(data, { w = 600, h = 170 } = {}) {
  const pad = { l: 34, r: 30, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const mx = Math.max(...data.map(d => d.v)) * 1.08, bw = iw / data.length;
  const y = v => pad.t + ih - (v / mx) * ih, ys = s => pad.t + ih / 2 - s * (ih / 2);
  const bars = data.map((d, i) => `<rect x="${(pad.l + i * bw + 1.5).toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(pad.t + ih - y(d.v)).toFixed(1)}" rx="2" fill="${i >= data.length - 1 ? '#6f6fff' : '#3a3a48'}"/>`).join('');
  const pts = data.map((d, i) => `${(pad.l + i * bw + bw / 2).toFixed(1)},${ys(d.s).toFixed(1)}`).join(' ');
  const grid = [0, 0.5, 1].map(f => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${pad.t + ih * f}" y2="${pad.t + ih * f}" stroke="#26262e" ${f === 0.5 ? 'stroke-dasharray="3 4"' : ''}/>`).join('');
  const xl = [0, 6, 12, 18, 23].map(i => `<text x="${pad.l + i * bw + bw / 2}" y="${h - 6}" fill="#7d7d89" font-size="10" font-family="JetBrains Mono,monospace" text-anchor="middle">${i === 23 ? 'now' : `−${24 - i}h`}</text>`).join('');
  const yl = `<text x="${pad.l - 6}" y="${pad.t + 8}" fill="#7d7d89" font-size="10" font-family="JetBrains Mono,monospace" text-anchor="end">${compact(mx)}</text><text x="${w - pad.r + 5}" y="${pad.t + 8}" fill="#7d7d89" font-size="10" font-family="JetBrains Mono,monospace">+1</text><text x="${w - pad.r + 5}" y="${pad.t + ih / 2 + 3}" fill="#7d7d89" font-size="10" font-family="JetBrains Mono,monospace">0</text><text x="${w - pad.r + 5}" y="${pad.t + ih}" fill="#7d7d89" font-size="10" font-family="JetBrains Mono,monospace">−1</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Mentions per hour (bars) and net sentiment (line) over the last 24 hours, illustrative">${grid}${bars}<polyline points="${pts}" fill="none" stroke="#ff6b61" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${xl}${yl}</svg>`;
}
const sbar = s => { const w = Math.abs(s) * 50; return `<span class="sbar" aria-hidden="true"><i style="${s < 0 ? `right:50%` : `left:50%`};width:${w}%;background:${sCol(s)}"></i></span>`; };
const gaugeSVG = v => { const a = Math.PI * (1 - v / 100), x = 46 + 38 * Math.cos(a), y = 50 - 38 * Math.sin(a); const col = v >= 65 ? '#ef4135' : v >= 50 ? '#f5a524' : '#0fa765'; return `<svg viewBox="0 0 92 56" aria-hidden="true"><path d="M8 50a38 38 0 0 1 76 0" fill="none" stroke="#26262e" stroke-width="8" stroke-linecap="round"/><path d="M8 50A38 38 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"/></svg>`; };
const ago = m => m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h`;

/** Full monitor UI. Returns { setScenario, destroy }. */
export function mountMonitor(root, { initial = 'ai-jobs', interval = 2600 } = {}) {
  root.classList.add('mon');
  root.innerHTML = `
    <div class="mon-bar">
      <div class="seg" role="tablist" aria-label="Issue being monitored">${SCENARIOS.map(s => `<button role="tab" aria-selected="${s.id === initial}" data-sc="${s.id}">${esc(s.label)}</button>`).join('')}</div>
      <div class="meta"><span class="dot g" aria-hidden="true"></span><span data-k="client"></span></div>
      <button class="ctl" data-k="pause" aria-pressed="false"><span aria-hidden="true">❚❚</span> <span class="lbl">Pause</span></button>
    </div>
    <div class="mon-body">
      <div class="mon-left">
        <div class="kpis" data-k="kpis"></div>
        <div class="chart-box"><div class="hd"><span>Last 24 hours</span><span class="lg"><span><i style="background:#3a3a48"></i>Mentions / hr</span><span><i style="background:#ff6b61"></i>Net sentiment</span></span></div><div data-k="chart"></div></div>
        <div><div class="sub-h"><span>Narrative clusters</span><span>share · sentiment</span></div><div class="clusters" data-k="clusters"></div></div>
      </div>
      <div class="mon-right">
        <div class="sub-h"><span>Signal stream</span><span data-k="count"></span></div>
        <ul class="feed" data-k="feed" aria-live="off"></ul>
      </div>
    </div>
    <div class="move" data-k="move"></div>`;
  const $ = k => root.querySelector(`[data-k="${k}"]`);
  let sc, queue, shown, timer, paused = reduceMotion(), visible = true, mentions, seen;
  const kpis = () => {
    const recent = shown.slice(0, 6); const net = recent.reduce((a, x) => a + x.s, 0) / Math.max(1, recent.length);
    const risk = Math.max(5, Math.min(97, Math.round(sc.risk + (-net) * 12 + (seen - 5) * 0.6)));
    const vel = Math.round((sc.curve.amp * 100) + seen * 3);
    $('kpis').innerHTML = [
      ['Mentions / hr', mentions.toLocaleString('en-US'), `${sc.markets}`],
      ['Net sentiment', `<span class="${net < -0.1 ? 'neg' : net > 0.1 ? 'pos' : ''}">${sgn(net)}</span>`, 'last 6 signals'],
      ['Velocity', `+${vel}%`, 'vs. 7-day baseline'],
      ['Risk index', `${risk}<span style="font-size:13px;color:#8e8e9b">/100</span>`, risk >= 65 ? 'elevated' : risk >= 50 ? 'watch' : 'stable'],
    ].map(([l, v, d]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`).join('');
    $('count').textContent = `${seen} signals · illustrative`;
  };
  const sigHTML = (x, fresh) => `<li class="sig${fresh ? ' new' : ''}"><span class="gl" aria-hidden="true">${GLYPH[x.ch] || ''}</span><div><div class="row"><b>${esc(x.ch)}</b><span>${esc(x.src)}</span><span class="rg">${esc(x.rg)}</span><span class="t">${ago(x.age)}</span></div><p>${esc(x.tx)}</p><div class="bot">${sbar(x.s)}<span style="color:${sCol(x.s)}">${sgn(x.s)}</span><span>reach ${compact(x.r)}</span>${x.flag ? `<span class="flag">${esc(x.flag)}</span>` : ''}</div></div></li>`;
  const renderFeed = (freshFirst) => { $('feed').innerHTML = shown.slice(0, 6).map((x, i) => sigHTML(x, freshFirst && i === 0)).join(''); };
  const renderStatic = () => {
    const data = series(sc); mentions = data[data.length - 1].v;
    const cw = $('chart').clientWidth || 600; $('chart').innerHTML = chartSVG(data, cw < 460 ? { w: 360, h: 150 } : {});
    $('clusters').innerHTML = sc.clusters.map(c => `<div class="cl"><div class="nm"><span class="tr ${c.tr}">${c.tr === 'up' ? '▲' : c.tr === 'dn' ? '▼' : '■'}</span><span title="${esc(c.n)}">${esc(c.n)}</span>${c.flag ? `<span class="flag">${esc(c.flag)}</span>` : ''}</div>${sbar(c.s)}<div class="pc">${c.share}%</div></div>`).join('');
    const m = sc.move;
    $('move').innerHTML = `<div><div class="gauge">${gaugeSVG(sc.risk)}<div><span class="sev ${m.sev}">${esc(m.sevL)}</span><div class="src" style="margin-top:6px;color:#8e8e9b">${esc(m.window)} · recommended by SignalOS</div></div></div><h4>${esc(m.title)}</h4><ol>${m.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div><div><div class="sub-h"><span>Draft holding statement</span><span>AI draft · human-approved</span></div><blockquote>${esc(m.draft)}</blockquote><div class="checks">${m.checks.map(([k, t]) => `<span class="${k}">${esc(t)}</span>`).join('')}</div></div>`;
    root.querySelector('[data-k="client"]').textContent = `Client: ${sc.client} (illustrative)`;
  };
  const setScenario = id => {
    sc = SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
    root.querySelectorAll('[data-sc]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sc === sc.id)));
    queue = sc.signals.map(x => ({ ...x })); shown = queue.splice(0, 5).map((x, i) => ({ ...x, age: i * 7 + 2 })); seen = shown.length;
    shown = shown.sort((a, b) => a.age - b.age);
    renderStatic(); renderFeed(false); kpis();
  };
  const tick = () => {
    if (paused || !visible) return;
    if (!queue.length) queue = sc.signals.map(x => ({ ...x }));
    shown.forEach(x => { x.age += interval / 60000 * 25; });
    shown.unshift({ ...queue.shift(), age: 0 }); shown = shown.slice(0, 8); seen++;
    mentions = Math.round(mentions * (1 + (Math.random() * 0.03 + (shown[0].s < -0.3 ? 0.02 : -0.005))));
    renderFeed(true); kpis();
  };
  root.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => setScenario(b.dataset.sc));
  const pb = $('pause');
  const syncPause = () => { pb.setAttribute('aria-pressed', String(paused)); pb.querySelector('.lbl').textContent = paused ? 'Resume' : 'Pause'; pb.firstElementChild.textContent = paused ? '▶' : '❚❚'; };
  pb.onclick = () => { paused = !paused; syncPause(); }; syncPause();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.05 }) : null; io?.observe(root);
  setScenario(initial); timer = setInterval(tick, interval);
  return { setScenario, destroy() { clearInterval(timer); io?.disconnect(); } };
}

/** Compact hero card: rotating signals + sparkline. */
export function mountPulse(el) {
  const sc = SCENARIOS[0], data = series(sc), list = el.querySelector('ul'), big = el.querySelector('[data-k="big"]'), sp = el.querySelector('svg.spark');
  const w = 400, h = 84, mx = Math.max(...data.map(d => d.v));
  const pts = data.map((d, i) => [i / (data.length - 1) * w, h - 6 - d.v / mx * (h - 14)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  sp.setAttribute('viewBox', `0 0 ${w} ${h}`);
  sp.innerHTML = `<defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2b2bff" stop-opacity=".55"/><stop offset="1" stop-color="#2b2bff" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${line} ${w},${h}" fill="url(#pg)"/><polyline points="${line}" fill="none" stroke="#8f8fff" stroke-width="2"/><circle cx="${pts[pts.length - 1][0] - 3}" cy="${pts[pts.length - 1][1]}" r="4" fill="#fff"/>`;
  big.textContent = data[data.length - 1].v.toLocaleString('en-US');
  let i = 0; const items = sc.signals;
  const row = x => `<li><span class="ch">${esc(x.ch)}</span><span>${esc(x.tx.length > 74 ? x.tx.slice(0, 72) + '…' : x.tx)}</span><span class="s" style="color:${x.s < -0.25 ? '#ff8a80' : x.s > 0.25 ? '#5ee6a6' : '#aaa'}">${sgn(x.s)}</span></li>`;
  list.innerHTML = [0, 1, 2].map(k => row(items[k])).join('').replace(/<li>/g, '<li style="animation:none">');
  if (reduceMotion()) return;
  setInterval(() => { if (document.hidden) return; i = (i + 1) % items.length; list.insertAdjacentHTML('afterbegin', row(items[(i + 2) % items.length])); while (list.children.length > 3) list.lastElementChild.remove(); }, 3400);
}
