/* HarborOS concept page — booted from an inline module in harboros.html. */
import { art, PRODUCTS, COLORS, recommend, SIZES, FAQ, INTENTS, chrome, toast, esc, fmtMoney, setFrame, plain, ep } from './common.js?v=20261008145402';
/* Chart colours come from the system tokens (read once; SVG attributes need concrete values). */
const tok = (n, fb) => { try { return getComputedStyle(document.body).getPropertyValue(n).trim() || fb; } catch { return fb; } };
const T = { co: tok('--co', '#3fd0e0'), ink: tok('--sys-ink', '#0c1320'), mute: tok('--sys-mute', '#5f6774'), mute2: tok('--sys-mute-2', '#9aa1ab'), line: tok('--sys-line', '#e8e5de'), bad: tok('--sys-bad', '#c62828'), warn: tok('--sys-warn', '#b45309'), orange: tok('--sys-orange', '#f2832f'), good: tok('--sys-good', '#15803d') };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const pct = (v, d = 1) => `${(+v).toFixed(d).replace(/\.0$/, '')}%`;
const num = v => Math.round(v).toLocaleString('en-US');
const SRC = {
  nrf: 'https://nrf.com/media-center/press-releases/consumers-expected-to-return-nearly-850-billion-in-merchandise-in-2025',
  klaviyo: 'https://klaviyo.com/glossary/what-is-a-good-repeat-purchase-rate',
  lulu: 'https://www.sec.gov/Archives/edgar/data/1397187/000139718726000020/lulu-20260201.htm',
};
// defaults = Fair Harbor return assumptions in the OS program evidence (overwritten when the file loads)
const RA = { investment_usd: [300000, 700000], time_to_value_months: [4, 9], ebitda_impact_pct_revenue: [2, 5], multiple_expansion_turns: [0.2, 0.5], revenue_basis_usd: [20e6, 35e6] };

export async function boot({ Chat, Data, Frame }) {
  setFrame(Frame);
  chrome(); modules(); tabs();
  fitPanel(); retPanel(); wsPanel(); fcPanel(); trPanel();
  const want = new URLSearchParams(location.search).get('tab') || (location.hash.match(/^#demo\/(\w+)/) || [])[1];
  if (want && ['fit', 'retention', 'wholesale', 'forecast', 'trace'].includes(want)) { select(want); if (location.hash.startsWith('#demo')) $('#demo').scrollIntoView(); }
  const chat = Chat.mount(null, {
    persona: 'fh', short_name: 'Fair Harbor', mode: 'floating', theme: 'light', name: 'Harbor helper · HarborOS', initials: 'HX',
    greeting: 'Ask how HarborOS cuts returns, lifts repeat purchase, runs wholesale and forecasting, what it costs and how it pays back. Shopper questions work too.',
    placeholder: 'Ask about HarborOS, ROI, vendors…', faq: [...OS_FAQ, ...[0, 1, 3, 4, 5, 6, 7, 12].map(i => FAQ[i])], intents: INTENTS, autoAsk: new URLSearchParams(location.search).get('ask') || undefined,
    suggestions: ['How does HarborOS cut returns?', 'What does HarborOS cost and how fast does it pay back?', 'Which vendors are in the stack?', 'How does the wholesale portal work?', 'How does bottle-to-trunk traceability work?'],
  });
  Frame?.mount({}).setChat(chat);
  const [ev, comps] = await Promise.all(['serviceos_evidence', 'public_comps'].map(n => Data.research(n).catch(() => null)));
  const ra = (ev?.items || []).find(i => i.id === 'ra-fh'); if (ra) Object.assign(RA, ra);
  kpis(ev); calc(); levers(ev); compsChart(comps); evidence(ev); stack(ev); gantt(); risks(); exitList();
}

const OS_FAQ = [
  { q: 'How does HarborOS cut returns with fit and size AI?', a: '<p>The fit module recommends a size and inseam on every product page and in chat, then learns from which sizes customers keep. Baseline online return rate is <b>19.3%</b> (NRF 2025); the target is <b>17.4%</b> (est.), applying the 9.8% lower return rate True Fit reported at M&amp;Co. Swimwear runs higher, about 21.6% (Loop benchmark).</p>', href: './harboros.html#demo' },
  { q: 'What does HarborOS cost to build and how fast does it pay back? investment payback time to value', a: '<p>Est. investment <b>$300–700K</b> with time-to-value of <b>4–9 months</b>, for an EBITDA impact of <b>+2–5 points</b> of revenue (about <b>$0.4–1.75M</b> on est. $20–35M revenue). Analyst assumptions from the OS program evidence, not company guidance.</p>', href: './harboros.html#math' },
  { q: 'Which vendors are in the HarborOS stack? Shopify Klaviyo True Fit NuORDER Inventory Planner', a: '<p>Buy: <b>Shopify Plus</b> (commerce + B2B), <b>Klaviyo</b> (email/SMS flows), <b>True Fit or Bold Metrics</b> (fit), <b>NuORDER</b> (wholesale line sheets and pre-books), <b>Inventory Planner</b> (demand planning). Build: the Harbor data layer, fit-model tuning on Fair Harbor\'s returns, and the traceability ledger.</p>', href: './harboros.html#stack' },
  { q: 'What is the EBITDA and valuation impact of HarborOS? multiple expansion exit value', a: '<p>Est. <b>+2–5 pts</b> of EBITDA margin and <b>0.2–0.5x</b> of EV/revenue multiple credit (DTC apparel is valued on revenue). On $27M of revenue that is roughly <b>$5–14M</b> of equity value from the multiple alone. Every input is adjustable in the value-math calculator.</p>', href: './harboros.html#math' },
  { q: 'How does the wholesale B2B portal work for store buyers? line sheets pre-book reorder', a: '<p>Store buyers see live line sheets with wholesale pricing and size packs, pre-book next season, and get reorder suggestions from their own sell-through. The reorder agent flags fast sellers before they stock out.</p>', href: './harboros.html#demo' },
  { q: 'How does bottle-to-trunk traceability work? chain of custody care label', a: '<p>Each care label carries a lot code. HarborOS links it to the supplier documents at each step (bottle collection, flake, pellet, yarn, fabric, cut-and-sew), so the bottle count on every pair can be shown, not just claimed. Try the Traceability tab in the demo.</p>', href: './harboros.html#demo' },
];

/* ── modules ────────────────────────────────────────────────────────── */
const ICON = {
  fit: '<path d="M4 7h16M4 7l2 13h12l2-13M9 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 13.5l2 2 3.5-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  ret: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  exch: '<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  ws: '<path d="M3 10l2-6h14l2 6M4 10h16v10H4zM9 20v-5h6v5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  fc: '<path d="M3 20h18M5 16l4-5 4 3 6-8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  tr: '<circle cx="5" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="19" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="19" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.3 11l9.4-4M7.3 13l9.4 4" stroke="currentColor" stroke-width="1.7"/>',
};
function modules() {
  const M = [
    ['fit', 'Fit and size AI', 'Size and inseam on every product page and in chat, with a confidence score. Learns from what customers keep, not what they click.', 'Online return rate', 'True Fit or Bold Metrics + Harbor model', 'fit'],
    ['ret', 'Replenishment and retention', 'Post-purchase fit checks, pre-summer replenishment, cross-sell and win-back flows timed to the swim calendar.', 'Repeat purchase rate', 'Klaviyo flows + SMS', 'retention'],
    ['exch', 'Returns-to-exchange', 'Every return is offered an exchange or instant store credit first, so the sale stays on the books and the box takes the cheapest path.', 'Revenue retained', 'Loop-style returns portal', 'fit'],
    ['ws', 'Wholesale B2B portal', 'Digital line sheets, pre-books and reorder suggestions from each door\'s own sell-through, for specialty, golf and campus buyers.', 'Doors and reorder rate', 'NuORDER or Shopify B2B', 'wholesale'],
    ['fc', 'Demand and inventory forecasting', 'Style, size and color forecasts for a seasonal swim line, reorder points and PO drafts, so July sells out on purpose.', 'Markdown share, stockouts', 'Inventory Planner + agent', 'forecast'],
    ['tr', 'Traceability ledger', 'A lot code on every care label links the trunk to its bottle, flake, pellet, yarn, fabric and factory documents.', 'Claim defensibility', 'Build (Harbor data layer)', 'trace'],
  ];
  $('#hx-mods').innerHTML = M.map(([k, t, d, kpi, v, r]) => `<article class="sys-card hx-mod"><span class="fh-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></span><p class="sys-card-title">${t}</p><p class="sys-card-body">${d}</p><dl><div><dt>Moves</dt><dd>${kpi}</dd></div><div><dt>Stack</dt><dd>${v}</dd></div></dl><div class="sys-card-foot"><button class="sys-btn sys-btn--ghost sys-btn--sm hx-mod-go" type="button" data-goto="${r}">See it in the demo <span aria-hidden="true">→</span></button></div></article>`).join('');
  $$('.hx-mod-go').forEach(b => b.addEventListener('click', () => { select(b.dataset.goto); $('#demo').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }));
}

/* ── tabs ───────────────────────────────────────────────────────────── */
function select(route) {
  $$('#hx-tabs [role=tab]').forEach(t => { const on = t.dataset.r === route; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !on; });
  const lab = { fit: 'Fit and size', retention: 'Replenishment', wholesale: 'Wholesale portal', forecast: 'Forecast', trace: 'Traceability' };
  $('#hx-route').textContent = lab[route] || route;
}
function tabs() {
  const T = $$('#hx-tabs [role=tab]');
  T.forEach((t, i) => {
    t.addEventListener('click', () => select(t.dataset.r));
    t.addEventListener('keydown', e => { const k = e.key; if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) return; e.preventDefault(); const n = k === 'Home' ? 0 : k === 'End' ? T.length - 1 : (i + (k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1) + T.length) % T.length; T[n].focus(); select(T[n].dataset.r); });
  });
}
const head = (t, s, tag) => `<div class="hx-p-head"><div><h3>${t}</h3><p>${s}</p></div>${tag ? `<span class="hx-tag">${tag}</span>` : ''}</div>`;
const range = (id, label, min, max, step, val, out) => `<div class="hx-f"><label for="${id}">${label}<output id="${id}-o">${out}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
const paint = r => r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);

/* ── 1. fit & size ──────────────────────────────────────────────────── */
function fitPanel() {
  const el = $('#p-fit');
  el.innerHTML = head('Fit and size', 'Recommend size and inseam for this shopper, explain why, and size the returns it prevents.', 'True Fit / Bold Metrics + Harbor model') + `
  <div class="hx-split">
    <form class="hx-form" id="fx" aria-label="Shopper profile">
      <p class="hx-sec-k">Shopper signals</p>
      ${range('fx-h', 'Height', 60, 78, 1, 71, '5′11″')}
      ${range('fx-w', 'Weight', 110, 280, 5, 185, '185 lb')}
      <div class="hx-f"><label for="fx-hist">Purchase history</label><select id="fx-hist"><option value="none">First order</option><option value="keptM">Kept Bayberry in M (2025)</option><option value="retL">Returned Anchor L: "too big in waist"</option><option value="retM">Returned Bayberry M: "too snug"</option></select></div>
      <div class="hx-f"><label for="fx-use">Shopping for</label><select id="fx-use"><option value="beach">Beach &amp; boat</option><option value="laps">Laps</option><option value="surf">Surf</option></select></div>
    </form>
    <div class="hx-res" id="fx-out" aria-live="polite"></div>
  </div>
  <div class="hx-impact">
    <div class="hx-impact-in">
      <p class="hx-sec-k">Returns impact · DTC</p>
      ${range('fx-rev', 'Online DTC revenue', 6, 16, 0.5, 11, '$11M')}
      ${range('fx-ad', 'Shoppers using the fit finder', 20, 100, 5, 60, '60%')}
    </div>
    <div class="hx-impact-out" id="fx-imp"></div>
  </div>`;
  const run = () => {
    ['fx-h', 'fx-w', 'fx-rev', 'fx-ad'].forEach(i => paint($('#' + i)));
    const h = +$('#fx-h').value, w = +$('#fx-w').value, hist = $('#fx-hist').value, use = $('#fx-use').value;
    $('#fx-h-o').textContent = `${Math.floor(h / 12)}′${h % 12}″`; $('#fx-w-o').textContent = `${w} lb`;
    const base = recommend({ heightIn: h, weightLb: w, use });
    let waist = null, sig = '';
    if (hist === 'keptM') { waist = base.waist * 0.4 + 32 * 0.6; sig = 'Kept an M before: pulls the estimate toward a 31–33" waist.'; }
    if (hist === 'retL') { waist = Math.min(base.waist, 34) - 1.1; sig = 'Returned an L as too big: shifts the estimate down about one inch.'; }
    if (hist === 'retM') { waist = Math.max(base.waist, 32) + 1.1; sig = 'Returned an M as too snug: shifts the estimate up about one inch.'; }
    const r = waist ? recommend({ heightIn: h, weightLb: w, waistIn: waist, use }) : base;
    const max = Math.max(...r.probs.map(x => x.p)); const conf = Math.round(r.confidence * 100);
    $('#fx-out').innerHTML = `<div class="hx-rec"><div class="hx-size">${r.size}</div><div><p class="hx-sec-k">Recommendation</p><p class="hx-rec-p">${esc(r.product)} · ${r.inseam}" inseam</p><p class="hx-conf"><span class="hx-meter"><i style="width:${conf}%;background:${conf >= 70 ? T.good : conf >= 55 ? '#E39A42' : T.bad}"></i></span>${conf}% confidence</p></div></div>
      <div class="hx-dist">${r.probs.map(x => `<div class="${x.size === r.size ? 'on' : ''}"><span>${x.size}</span><i><b style="width:${Math.max(1.5, (x.p / max) * 100)}%"></b></i><em>${Math.round(x.p * 100)}%</em></div>`).join('')}</div>
      <p class="hx-sec-k" style="margin-top:14px">Why this size</p>
      <ul class="hx-why"><li><b>Body model</b> est. waist ${base.waist.toFixed(1)}" from height and weight</li>${sig ? `<li><b>History</b> ${esc(sig)}</li>` : '<li><b>History</b> none yet: confidence is capped until the first kept order</li>'}<li><b>Use</b> ${use === 'surf' ? 'surf: 9" boardshort, no liner' : use === 'laps' ? 'laps: 5.5" with liner, size down if between' : `beach &amp; boat: ${r.inseam}" by height`}</li></ul>`;
    const rev = +$('#fx-rev').value * 1e6, ad = +$('#fx-ad').value / 100; $('#fx-rev-o').textContent = `$${(+$('#fx-rev').value).toFixed(1).replace(/\.0$/, '')}M`; $('#fx-ad-o').textContent = `${Math.round(ad * 100)}%`;
    const b0 = 19.3, b1 = 17.4, rate = b0 - (b0 - b1) * ad, kept = rev * (b0 - rate) / 100, aov = 110, avoided = kept / aov, cost = avoided * 12;
    $('#fx-imp').innerHTML = `<div class="hx-stat"><span>Return rate</span><b>${pct(b0)} → ${pct(rate)}</b><em><span class="sys-est">est.</span> NRF 2025; True Fit M&amp;Co case</em></div><div class="hx-stat"><span>Revenue kept</span><b>${fmtMoney(kept)}/yr</b><em><span class="sys-est">est.</span> revenue × rate change</em></div><div class="hx-stat"><span>Returns avoided</span><b>${num(avoided)}</b><em>assumes $110 AOV</em></div><div class="hx-stat"><span>Handling saved</span><b>${fmtMoney(cost)}/yr</b><em>assumes $12 per return</em></div>`;
  };
  el.addEventListener('input', run); el.addEventListener('change', run); run();
}

/* ── 2. replenishment & retention ───────────────────────────────────── */
const FLOWS = [
  { id: 'fit', when: 'Day 2', ch: 'Email', name: 'Fit check', lift: 0.8, subj: 'How do your Bayberrys fit?', body: 'If the size is off, swap it free: we ship the new pair as soon as the carrier scans yours.', cta: 'Swap my size' },
  { id: 'rev', when: 'Day 12', ch: 'Email', name: 'Care + review', lift: 0.4, subj: 'Rinse, hang, repeat', body: 'Three-step care for quick-dry fabric, and a 30-second review with the size you kept.', cta: 'Leave a review' },
  { id: 'x', when: 'Day 30', ch: 'Email', name: 'Pairs with your trunks', lift: 1.6, subj: 'The shirt that goes with them', body: 'The Harbor Camp Shirt in Salt White palm was made for your Sea Glass trunks. Your size: L.', cta: 'See the pairing' },
  { id: 'rep', when: 'Apr 15', ch: 'Email + SMS', name: 'Pre-summer replenishment', lift: 3.2, subj: 'Your trunks turn one this summer', body: 'New prints just landed in your size (M). Order by May 20 for Memorial Day.', cta: 'Shop new prints in M' },
  { id: 'again', when: 'Day 300', ch: 'Email', name: 'Harbor Again trade-in', lift: 1.5, subj: '$20 for your old pair', body: 'Send back worn Fair Harbor trunks for $20 credit. We resell or recycle every pair.', cta: 'Start a trade-in' },
  { id: 'wb', when: 'Day 420', ch: 'SMS', name: 'Win-back', lift: 1.5, subj: 'Still your size?', body: 'It has been a while. Your fit profile is saved: M, 5.5". New colorways inside.', cta: 'Pick up where you left off' },
];
function retPanel() {
  const el = $('#p-ret'); const on = new Set(FLOWS.map(f => f.id)); let sel = 'rep';
  el.innerHTML = head('Replenishment and retention', 'Flows timed to the swim calendar. Toggle them and watch the repeat curve.', 'Klaviyo flows + SMS') + `
  <div class="hx-ret">
    <div class="hx-flows" id="flows"></div>
    <div class="hx-phone" aria-live="polite"><div class="hx-phone-in" id="phone"></div></div>
  </div>
  <div class="hx-ret-sim">
    <div class="hx-impact-in">
      <p class="hx-sec-k">Customer file (illustrative)</p>
      ${range('rt-n', 'Customers on file', 40, 200, 5, 100, '100K')}
      ${range('rt-aov', 'Average order value', 70, 160, 5, 110, '$110')}
    </div>
    <div class="hx-curve"><svg viewBox="0 0 520 190" id="curve" role="img" aria-label="Cumulative repeat purchase rate over 24 months"></svg></div>
    <div class="hx-impact-out" id="rt-out"></div>
  </div>`;
  const draw = () => {
    ['rt-n', 'rt-aov'].forEach(i => paint($('#' + i)));
    $('#flows').innerHTML = FLOWS.map(f => `<div class="hx-flow ${sel === f.id ? 'sel' : ''} ${on.has(f.id) ? '' : 'off'}"><button class="hx-flow-b" data-sel="${f.id}" aria-pressed="${sel === f.id}"><span class="hx-when">${f.when}</span><span class="hx-fn">${f.name}<small>${f.ch} · +${f.lift} pts est.</small></span></button><label class="hx-sw"><input type="checkbox" data-tog="${f.id}" ${on.has(f.id) ? 'checked' : ''} aria-label="${f.name} flow on"><i></i></label></div>`).join('');
    const f = FLOWS.find(x => x.id === sel);
    $('#phone').innerHTML = `<div class="hx-ph-top"><span>${f.ch.includes('SMS') && !f.ch.includes('Email') ? 'Messages' : 'Inbox'}</span><b>Fair Harbor</b></div><div class="hx-ph-card"><p class="hx-ph-subj">${esc(f.subj)}</p><div class="hx-ph-art">${art(f.id === 'x' ? 'camp' : f.id === 'wb' ? 'anchor' : 'trunk', f.id === 'x' ? 'white' : 'sea', 'palm')}</div><p class="hx-ph-body">${esc(f.body)}</p><span class="hx-ph-cta">${esc(f.cta)}</span></div><p class="hx-ph-meta">${esc(f.when)} · ${esc(f.ch)} · ${on.has(f.id) ? 'Live' : 'Paused'}</p>`;
    const n = +$('#rt-n').value * 1000, aov = +$('#rt-aov').value; $('#rt-n-o').textContent = `${$('#rt-n').value}K`; $('#rt-aov-o').textContent = `$${aov}`;
    const base = 20, lift = FLOWS.filter(x => on.has(x.id)).reduce((a, x) => a + x.lift, 0), rate = Math.min(30, base + lift);
    const extra = n * (rate - base) / 100, inc = extra * aov;
    $('#rt-out').innerHTML = `<div class="hx-stat"><span>Repeat purchase rate</span><b>${pct(base, 0)} → ${pct(rate)}</b><em><span class="sys-est">est.</span> Klaviyo 20–30% benchmark</em></div><div class="hx-stat"><span>Extra repeat customers</span><b>${num(extra)}</b><em>illustrative file size</em></div><div class="hx-stat"><span>Incremental revenue</span><b>${fmtMoney(inc)}/yr</b><em>one extra order each</em></div><div class="hx-stat"><span>Flows live</span><b>${on.size} of ${FLOWS.length}</b><em>flows ≈41% of email revenue (Klaviyo)</em></div>`;
    // curve
    const W = 520, H = 190, L = 34, B = 24, T = 12, xs = m => L + (m / 24) * (W - L - 10), ys = v => H - B - (v / 32) * (H - B - T);
    const cur = (r, bump) => Array.from({ length: 25 }, (_, m) => { const s = (1 - Math.exp(-m / 6)) / (1 - Math.exp(-24 / 6)); const b = bump ? (m >= 7 ? 1 : 0) * 0.12 + (m >= 19 ? 0.06 : 0) : 0; return Math.min(r, r * (s * (1 - (bump ? 0.18 : 0)) + b)); });
    const pth = arr => arr.map((v, m) => `${m ? 'L' : 'M'}${xs(m).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ');
    const a = cur(base, false), b = cur(rate, true);
    $('#curve').innerHTML = `${[0, 10, 20, 30].map(v => `<line x1="${L}" x2="${W - 10}" y1="${ys(v)}" y2="${ys(v)}" stroke="${T.line}"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end" font-size="10" font-family="JetBrains Mono" fill="${T.mute}">${v}%</text>`).join('')}
      ${[0, 6, 12, 18, 24].map(m => `<text x="${xs(m)}" y="${H - 6}" text-anchor="middle" font-size="10" font-family="JetBrains Mono" fill="${T.mute}">m${m}</text>`).join('')}
      <rect x="${xs(6.5)}" y="${T}" width="${xs(10.5) - xs(6.5)}" height="${H - B - T}" fill="#F2B263" opacity=".12"/><rect x="${xs(18.5)}" y="${T}" width="${xs(22.5) - xs(18.5)}" height="${H - B - T}" fill="#F2B263" opacity=".12"/><text x="${xs(8.5)}" y="${T + 12}" text-anchor="middle" font-size="9.5" font-family="Inter" font-weight="600" fill="${T.warn}">swim season</text>
      <path d="${pth(a)}" fill="none" stroke="${T.mute2}" stroke-width="2" stroke-dasharray="5 4"/><path d="${pth(b)}" fill="none" stroke="${T.co}" stroke-width="2.6"/>
      <circle cx="${xs(24)}" cy="${ys(b[24])}" r="4" fill="${T.co}"/><text x="${xs(24) - 8}" y="${ys(b[24]) - 9}" text-anchor="end" font-size="11" font-family="JetBrains Mono" font-weight="600" fill="${T.ink}">${pct(b[24])}</text>
      <text x="${xs(24) - 8}" y="${ys(a[24]) + 16}" text-anchor="end" font-size="11" font-family="JetBrains Mono" fill="${T.mute}">${pct(a[24], 0)} baseline</text>`;
  };
  el.addEventListener('click', e => { const s = e.target.closest('[data-sel]'); if (s) { sel = s.dataset.sel; draw(); } });
  el.addEventListener('change', e => { const t = e.target.closest('[data-tog]'); if (t) { t.checked ? on.add(t.dataset.tog) : on.delete(t.dataset.tog); draw(); } });
  el.addEventListener('input', e => { if (e.target.type === 'range') draw(); });
  draw();
}

/* ── 3. wholesale portal ────────────────────────────────────────────── */
function wsPanel() {
  const el = $('#p-ws');
  const L = [
    ['bayberry', 1, 'Sea Glass · Palm', 88, 84, 4], ['bayberry', 0, 'Harbor Navy · Stripe', 88, 71, 3], ['anchor', 1, 'Harbor Navy · Dot', 88, 58, 2],
    ['breakwater', 1, 'Sunset · Rugby stripe', 98, 39, 1], ['camp', 0, 'Salt White · Palm', 98, 77, 3], ['polo', 0, 'Harbor Navy', 88, 64, 2],
  ].map(([id, wi, cw, msrp, st, sug]) => ({ p: PRODUCTS.find(x => x.id === id), wi, cw, msrp, ws: msrp / 2, st, sug, q: sug }));
  const PACK = { S: 1, M: 2, L: 2, XL: 1 }, U = 6, MIN = 1500;
  el.innerHTML = head('Wholesale B2B portal', 'What a specialty store buyer sees: line sheet, size packs, sell-through and reorder suggestions.', 'NuORDER or Shopify B2B') + `
  <div class="hx-buyer"><div><span class="hx-av">CS</span><div><b>Coastal Supply Co.</b><span>Specialty surf &amp; resort · 2 doors · Net 30 (illustrative account)</span></div></div><span class="hx-pill-live">Spring '27 pre-book open</span></div>
  <div class="hx-ws">
    <div class="hx-ls" role="table" aria-label="Line sheet">
      <div class="hx-ls-h" role="row"><span role="columnheader">Style</span><span role="columnheader">Wholesale / MSRP</span><span role="columnheader">Your sell-through</span><span role="columnheader">Packs (6 units)</span></div>
      <div id="ls"></div>
    </div>
    <aside class="hx-agent"><p class="hx-sec-k">Reorder agent</p><ul id="agent"></ul><div class="hx-tot" id="tot"></div><button class="sys-btn sys-btn--primary sys-btn--block hx-submit" type="button" id="ws-sub">Submit pre-book</button><p class="sys-src">Size pack S1 · M2 · L2 · XL1. Keystone wholesale (50% of MSRP) shown for illustration.</p></aside>
  </div>`;
  const draw = () => {
    $('#ls').innerHTML = L.map((r, i) => { const [k, pr] = r.p.ways[r.wi]; return `<div class="hx-ls-r" role="row"><div class="hx-ls-s" role="cell"><span class="hx-th">${art(r.p.kind, k, pr)}</span><span><b>${esc(r.p.name.replace('The ', ''))}</b><small>${esc(r.cw)}</small></span></div><div role="cell" class="hx-mono"><b>$${r.ws}</b> / $${r.msrp}</div><div role="cell"><span class="hx-st"><i style="width:${r.st}%;background:${r.st >= 70 ? T.co : r.st >= 50 ? '#7FC8D3' : '#E39A42'}"></i></span><span class="hx-mono hx-st-n">${r.st}%</span>${r.st >= 70 ? '<span class="hx-badge">Reorder</span>' : r.st < 45 ? '<span class="hx-badge warn">Slow</span>' : ''}</div><div role="cell" class="hx-qty"><button data-q="${i}" data-d="-1" aria-label="Fewer packs of ${esc(r.p.name)}">−</button><output>${r.q}</output><button data-q="${i}" data-d="1" aria-label="More packs of ${esc(r.p.name)}">+</button></div></div>`; }).join('');
    const units = L.reduce((a, r) => a + r.q * U, 0), total = L.reduce((a, r) => a + r.q * U * r.ws, 0), retail = L.reduce((a, r) => a + r.q * U * r.msrp, 0);
    $('#agent').innerHTML = L.filter(r => r.st >= 70).map(r => `<li><b>${esc(r.p.name.replace('The ', ''))} · ${esc(r.cw.split(' · ')[0])}</b> sold ${r.st}% in 9 weeks. Suggest ${r.sug} packs before the May peak.</li>`).join('') + `<li class="warn"><b>Breakwater · Sunset</b> is at 39%: hold reorders and move 1 pack to your second door.</li>`;
    const ok = total >= MIN;
    $('#tot').innerHTML = `<div><span>Units</span><b>${num(units)}</b></div><div><span>Wholesale</span><b>$${num(total)}</b></div><div><span>Retail value</span><b>$${num(retail)}</b></div><div class="hx-min"><span>${ok ? 'Minimum met' : `$${num(MIN - total)} to the $${num(MIN)} minimum`}</span><i><b style="width:${Math.min(100, total / MIN * 100)}%"></b></i></div>`;
    $('#ws-sub').disabled = !ok;
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { const r = L[+b.dataset.q]; r.q = Math.max(0, Math.min(20, r.q + +b.dataset.d)); draw(); } });
  el.querySelector('#ws-sub').addEventListener('click', () => toast('Pre-book drafted for Coastal Supply Co. Demo only: nothing was sent.'));
  draw();
}

/* ── 4. forecast ────────────────────────────────────────────────────── */
const SKUS = [
  { id: 'bay', name: 'Bayberry · Sea Glass palm', peak: 255, floor: 16, start: 900, pos: [[19, 1900], [28, 800], [45, 700]], lead: 10, curve: [11, 29, 31, 20, 9] },
  { id: 'anc', name: 'Anchor · Harbor Navy dot', peak: 170, floor: 12, start: 700, pos: [[18, 1200], [27, 600], [45, 500]], lead: 10, curve: [8, 26, 33, 23, 10] },
  { id: 'camp', name: 'Camp Shirt · Salt White palm', peak: 120, floor: 22, start: 600, pos: [[20, 1100], [30, 600], [44, 500]], lead: 8, curve: [9, 27, 32, 22, 10] },
];
function fcPanel() {
  const el = $('#p-fc'); let sku = SKUS[0], apply = false;
  el.innerHTML = head('Demand and inventory forecast', 'Style-level weekly forecast for the next 52 weeks, on-hand projection and a drafted PO. Swim peaks in early July.', 'Inventory Planner + forecasting agent') + `
  <div class="hx-fc-bar"><label for="fc-sku" class="sr">SKU</label><select id="fc-sku">${SKUS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select><label class="hx-chk"><input type="checkbox" id="fc-apply"><span>Apply drafted PO</span></label></div>
  <div class="hx-fc-kpis" id="fc-k"></div>
  <div class="hx-fc-chart"><svg viewBox="0 0 760 270" id="fc-svg" role="img" aria-label="Weekly demand forecast and projected inventory"></svg></div>
  <div class="hx-fc-legend"><span><i style="background:#F2B263"></i>Forecast (80% band)</span><span><i style="background:${T.mute2}"></i>Last year</span><span><i style="background:${T.co}"></i>Projected on-hand</span><span><i class="dash"></i>Reorder point</span><span><i style="background:${T.bad}"></i>Stockout</span></div>
  <div class="hx-fc-low"><div><p class="hx-sec-k">Size curve (forecast mix)</p><div class="hx-curve-sz" id="fc-sz"></div></div><div class="hx-fc-po" id="fc-po"></div></div>`;
  const draw = () => {
    const start = new Date(2026, 9, 5); const wk = w => new Date(start.getTime() + w * 7 * 864e5);
    const f = Array.from({ length: 52 }, (_, w) => { const woy = (40 + w) % 52; const g = Math.exp(-((woy - 27) ** 2) / (2 * 6.5 ** 2)); return sku.floor + sku.peak * g * (1 + 0.06 * Math.sin(w * 1.3)); });
    const ly = f.map((v, w) => v * (0.9 + 0.1 * Math.sin(w * 2.1 + 1)) * 0.92);
    const sim = extra => { let inv = sku.start; const out = [], lost = []; for (let w = 0; w < 52; w++) { for (const [pw, q] of [...sku.pos, ...(extra ? [extra] : [])]) if (pw === w) inv += q; inv -= f[w]; lost.push(inv < 0 ? -inv : 0); if (inv < 0) inv = 0; out.push(inv); } return { out, lost }; };
    const base = sim(null); const firstOut = base.lost.findIndex(x => x > 0);
    const rop = w => f.slice(w, w + 3).reduce((a, b) => a + b, 0);
    let po = null; if (firstOut >= 0) { const arrive = Math.max(0, firstOut - 3); const need = base.lost.reduce((a, b) => a + b, 0) + rop(firstOut); po = [arrive, Math.ceil(need / 50) * 50]; }
    const S = apply && po ? sim(po) : base;
    const W = 760, H = 270, L = 44, R = 48, T = 34, B = 30; const maxY = Math.max(...f.map(v => v * 1.2)) * 1.05; const maxI = Math.max(...S.out, ...f.map((_, w) => rop(w)), 1) * 1.08;
    const x = w => L + (w / 51) * (W - L - R); const y = v => H - B - (v / maxY) * (H - B - T); const yi = v => H - B - (v / maxI) * (H - B - T);
    const band = `M${f.map((v, w) => `${x(w)} ${y(v * 1.18)}`).join(' L')} L${f.map((v, w) => `${x(51 - w)} ${y(f[51 - w] * 0.82)}`).join(' L')} Z`;
    const line = (arr, fy) => arr.map((v, w) => `${w ? 'L' : 'M'}${x(w).toFixed(1)} ${fy(v).toFixed(1)}`).join(' ');
    const months = []; for (let w = 0; w < 52; w++) { const d = wk(w); if (d.getDate() <= 7) months.push([w, d.toLocaleString('en-US', { month: 'short' })]); }
    const swimA = 26, swimB = 47; // Apr–Aug
    $('#fc-svg').innerHTML = `<rect x="${x(swimA)}" y="${T}" width="${x(swimB) - x(swimA)}" height="${H - B - T}" fill="#F2B263" opacity=".08"/><text x="${x(swimA) + 6}" y="${H - B - 8}" font-size="10" font-family="Inter" font-weight="600" fill="${T.warn}">Swim season</text>
      ${[0.25, 0.5, 0.75, 1].map(k => `<line x1="${L}" x2="${W - R}" y1="${y(maxY * k)}" y2="${y(maxY * k)}" stroke="${T.line}"/><text x="${L - 6}" y="${y(maxY * k) + 3}" text-anchor="end" font-size="9.5" font-family="JetBrains Mono" fill="${T.warn}">${Math.round(maxY * k)}</text><text x="${W - R + 6}" y="${y(maxY * k) + 3}" font-size="9.5" font-family="JetBrains Mono" fill="${T.co}">${num(maxI * k)}</text>`).join('')}
      <text x="4" y="${T - 14}" font-size="9.5" font-family="JetBrains Mono" fill="${T.warn}">units/wk</text><text x="${W - R + 6}" y="${T - 14}" font-size="9.5" font-family="JetBrains Mono" fill="${T.co}">on-hand</text>
      ${months.map(([w, m]) => `<text x="${x(w)}" y="${H - 10}" text-anchor="middle" font-size="10" font-family="JetBrains Mono" fill="${T.mute}">${m}</text>`).join('')}
      <path d="${band}" fill="#F2B263" opacity=".18"/>
      <path d="${line(ly, y)}" fill="none" stroke="${T.mute2}" stroke-width="1.6" stroke-dasharray="4 3"/>
      <path d="${line(f, y)}" fill="none" stroke="#E39A42" stroke-width="2.4"/>
      <path d="${line(f.map((_, w) => rop(w)), yi)}" fill="none" stroke="${T.ink}" stroke-width="1.2" stroke-dasharray="2 4"/>
      <path d="${line(S.out, yi)}" fill="none" stroke="${T.co}" stroke-width="2.4"/>
      ${S.lost.map((v, w) => v > 0 ? `<rect x="${x(w) - 5}" y="${H - B - 6}" width="10" height="6" rx="2" fill="${T.bad}"/>` : '').join('')}
      ${[...sku.pos, ...(apply && po ? [po] : [])].map(([w, q], k) => `<g transform="translate(${x(w)} ${T})"><path d="M0 0 V${H - B - T}" stroke="${T.co}" stroke-opacity=".25"/><rect x="-22" y="-26" width="44" height="17" rx="8.5" fill="${k >= sku.pos.length ? '#F2B263' : T.ink}"/><text y="-13.5" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono" fill="${k >= sku.pos.length ? T.ink : '#fff'}">PO ${(q / 1000).toFixed(1)}k</text></g>`).join('')}
`;
    const season = f.reduce((a, b) => a + b, 0), peakW = f.indexOf(Math.max(...f)), cover = sku.start / (f.slice(0, 4).reduce((a, b) => a + b, 0) / 4), lostU = S.lost.reduce((a, b) => a + b, 0), out = S.lost.findIndex(v => v > 0);
    const fmtD = d => d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    $('#fc-k').innerHTML = `<div class="hx-stat"><span>Season forecast</span><b>${num(season)} units</b><em>illustrative</em></div><div class="hx-stat"><span>Peak week</span><b>${fmtD(wk(peakW))}</b><em>${num(f[peakW])} units/wk</em></div><div class="hx-stat"><span>Weeks of cover today</span><b>${cover.toFixed(0)} wks</b><em>off-season run-rate</em></div><div class="hx-stat ${out >= 0 ? 'bad' : 'good'}"><span>Stockout risk</span><b>${out >= 0 ? `from ${fmtD(wk(out))}` : 'None'}</b><em>${out >= 0 ? `${num(lostU)} units of lost sales` : 'covered through peak'}</em></div>`;
    $('#fc-sz').innerHTML = SIZES.map((z, i) => `<div><i style="height:${sku.curve[i] * 2.4}px"></i><b>${sku.curve[i]}%</b><span>${z.s}</span></div>`).join('');
    $('#fc-po').innerHTML = po ? `<p class="hx-sec-k">Drafted PO</p><p class="hx-po-big">${num(po[1])} units</p><p>Place by <b>${fmtD(wk(Math.max(0, po[0] - sku.lead)))}</b> (${sku.lead}-week lead time) to land <b>${fmtD(wk(po[0]))}</b>, three weeks ahead of the first projected stockout. Split by the size curve: ${SIZES.map((z, i) => `${z.s} ${num(po[1] * sku.curve[i] / 100)}`).join(' · ')}.</p><p class="sys-src">AI forecasting cuts errors 20–50% and lost sales from stockouts by up to 65% (McKinsey). Demand and inventory here are illustrative.</p>` : '<p class="hx-sec-k">Drafted PO</p><p>No PO needed: open POs cover the season with safety stock.</p>';
  };
  el.querySelector('#fc-sku').addEventListener('change', e => { sku = SKUS.find(s => s.id === e.target.value); draw(); });
  el.querySelector('#fc-apply').addEventListener('change', e => { apply = e.target.checked; draw(); });
  draw();
}

/* ── 5. traceability ────────────────────────────────────────────────── */
function trPanel() {
  const el = $('#p-tr');
  el.innerHTML = head('Traceability ledger', 'Enter the lot code from a care label. HarborOS returns the chain of custody behind the bottle count.', 'Build · Harbor data layer') + `
  <form class="hx-tr-f" id="tr-f"><label for="tr-c" class="sys-sr">Care-label lot code</label><input id="tr-c" value="FH-26-BAY-0417" spellcheck="false" autocomplete="off"><button class="sys-btn sys-btn--primary sys-btn--sm" type="submit">Trace</button>
    <div class="hx-tr-s"><span>Try:</span><button type="button" data-c="FH-26-BAY-0417">FH-26-BAY-0417</button><button type="button" data-c="FH-26-ANC-1180">FH-26-ANC-1180</button><button type="button" data-c="FH-27-BRK-0052">FH-27-BRK-0052</button></div></form>
  <div id="tr-out" aria-live="polite"></div>`;
  const run = code => {
    const c = code.trim().toUpperCase(); const m = c.match(/^FH-(\d{2})-(BAY|ANC|BRK)-(\d{4})$/);
    if (!m) { $('#tr-out').innerHTML = '<p class="hx-tr-err">That code does not match the care-label format (FH-YY-STYLE-NNNN). Try one of the samples.</p>'; return; }
    const st = { BAY: ['The Bayberry Trunk', 11, 'trunk'], ANC: ['The Anchor Trunk', 11, 'anchor'], BRK: ['The Breakwater Boardshort', 14, 'board'] }[m[2]];
    let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const id = (p, k) => `${p}-${String((h >>> k) % 9000 + 1000)}`;
    const yr = 2000 + +m[1];
    const steps = [
      ['Bottles collected', `${st[1]} post-consumer PET bottles`, `Collection batch ${id('CB', 1)}`, 'Collector receipt'],
      ['Washed & flaked', 'Sorted, label-stripped, hot-washed, flaked', `Flake lot ${id('FL', 3)}`, 'Processor record'],
      ['Pellet', 'Melted and extruded into rPET chip', `Chip lot ${id('RC', 5)}`, 'Transaction certificate'],
      ['Yarn', 'Spun into recycled-polyester filament', `Yarn lot ${id('YN', 7)}`, 'Transaction certificate'],
      ['Fabric', 'Woven and given a quick-dry finish', `Dye lot ${id('DL', 9)}`, 'Mill certificate'],
      ['Cut & sewn', `${st[0]} with care-label code`, `PO ${id(`FH${m[1]}`, 11)}`, 'Packing list'],
      ['Received', `Distribution center · ${yr}`, `Code ${c}`, 'ASN match'],
    ];
    $('#tr-out').innerHTML = `<div class="hx-tr">
      <div class="hx-tr-sum"><div class="hx-tr-art">${art(st[2], m[2] === 'BRK' ? 'navy' : 'sea', m[2] === 'BAY' ? 'palm' : 'solid')}</div><div><p class="hx-sec-k">Lot ${esc(c)}</p><p class="hx-tr-name">${esc(st[0])}</p><p class="hx-tr-b"><b>${st[1]}</b> bottles in this pair</p><p class="hx-tr-ok"><i></i>7 of 7 custody documents matched</p><dl class="hx-tr-kv"><dt>Season</dt><dd>${m[2] === 'BRK' ? 'Surf' : 'Swim'} ${yr}</dd><dt>Shell</dt><dd>Recycled polyester from post-consumer bottles</dd><dt>Bottle count</dt><dd>Computed from fabric weight and recycled content on the mill certificate</dd><dt>Label claim</dt><dd>“Made from ${st[1]} plastic bottles” ✓ supported</dd></dl></div></div>
      <ol class="hx-chain">${steps.map((s, i) => `<li><span class="hx-dot">${i + 1}</span><div><b>${s[0]}</b><span>${esc(s[1])}</span><code>${esc(s[2])}</code></div><span class="hx-doc">✓ ${s[3]}</span></li>`).join('')}</ol>
    </div><p class="sys-src">Illustrative: lot IDs and suppliers are placeholders. In production the fields would follow recycled-content chain-of-custody certificates from each supplier, so the bottle count on the label is computed from documents rather than estimated.</p>`;
  };
  el.querySelector('#tr-f').addEventListener('submit', e => { e.preventDefault(); run($('#tr-c').value); });
  el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { $('#tr-c').value = b.dataset.c; run(b.dataset.c); }));
  run($('#tr-c').value);
}

/* ── hero KPIs from evidence ────────────────────────────────────────── */
function kpis(ev) {
  const E = id => (ev?.items || []).find(i => i.id === id); const k1 = E('kb-fh-1'), k2 = E('kb-fh-2');
  if (!k1 || !k2) return;
  $('#hx-kpis').innerHTML = `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">Online return rate</span><span class="sys-kpi-value">${k2.baseline}% → ${k2.target}%<span class="sys-est">est.</span></span><span class="sys-kpi-sub"><a href="${esc(k2.source_url)}" target="_blank" rel="noopener">NRF 2025</a> baseline; True Fit M&amp;Co case target</span></div>
    <div class="sys-kpi" role="listitem"><span class="sys-kpi-label">Repeat purchase rate</span><span class="sys-kpi-value">${k1.baseline}% → ${k1.target}%<span class="sys-est">est.</span></span><span class="sys-kpi-sub"><a href="${esc(k1.source_url)}" target="_blank" rel="noopener">Klaviyo</a> benchmark range</span></div>
    <div class="sys-kpi" role="listitem"><span class="sys-kpi-label">EBITDA impact</span><span class="sys-kpi-value">+${RA.ebitda_impact_pct_revenue[0]}–${RA.ebitda_impact_pct_revenue[1]} pts<span class="sys-est">est.</span></span><span class="sys-kpi-sub">About ${fmtMoney(RA.ebitda_impact_usd?.[0] ?? 4e5)}–${fmtMoney(RA.ebitda_impact_usd?.[1] ?? 1.75e6)} on ${fmtMoney(RA.revenue_basis_usd[0])}–${fmtMoney(RA.revenue_basis_usd[1])} revenue</span></div>`;
}

/* ── value-creation calculator ──────────────────────────────────────── */
function calc() {
  const [r0, r1] = RA.revenue_basis_usd, [p0, p1] = RA.ebitda_impact_pct_revenue, [m0, m1] = RA.multiple_expansion_turns, [i0, i1] = RA.investment_usd, [t0, t1] = RA.time_to_value_months;
  const F = [
    ['c-rev', 'Revenue base', r0 / 1e6, r1 / 1e6, 0.5, 27, v => `$${v}M`, 'Fair Harbor public filings estimate: 2025 net revenue $20–35M, point about $27M (low confidence)'],
    ['c-pts', 'EBITDA uplift', p0, p1, 0.25, (p0 + p1) / 2, v => `+${v} pts`, 'Analyst assumption: returns, repeat and inventory levers, 2–5 pts of revenue'],
    ['c-mx', 'Multiple credit', m0, m1, 0.05, (m0 + m1) / 2, v => `+${(+v).toFixed(2)}x EV/rev`, 'Analyst assumption: 0.2–0.5x EV/revenue (DTC valued on revenue; entry est. 1.3–2.5x)'],
    ['c-inv', 'Investment', i0 / 1e3, i1 / 1e3, 25, (i0 + i1) / 2e3, v => `$${v}K`, 'Analyst assumption: $300–700K build plus first-year vendor fees'],
    ['c-ttv', 'Time to value', t0, t1, 1, Math.round((t0 + t1) / 2), v => `${v} mo`, 'Analyst assumption: 4–9 months'],
  ];
  $('#calc').innerHTML = `<p class="hx-sec-k">Inputs<span class="sys-est">est.</span></p>` + F.map(([id, l, mn, mx, st, v, f, src]) => `<div class="hx-f"><label for="${id}">${l}<output id="${id}-o">${f(v)}</output></label><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" value="${v}"><small>${esc(src)}</small></div>`).join('');
  const run = () => {
    F.forEach(([id, , , , , , f]) => { const r = $('#' + id); paint(r); $(`#${id}-o`).textContent = f(r.value); });
    const rev = +$('#c-rev').value * 1e6, pts = +$('#c-pts').value, mx = +$('#c-mx').value, inv = +$('#c-inv').value * 1e3, ttv = +$('#c-ttv').value;
    const eb = rev * pts / 100, val = rev * mx, roi = val / inv, pay = ttv + inv / (eb / 12);
    $('#calc-out').innerHTML = `<div class="hx-big"><span>Equity value created (multiple case)</span><b>${fmtMoney(val)}<span class="sys-est">est.</span></b><em>revenue × multiple credit</em></div>
      <div class="hx-out-grid"><div class="hx-stat"><span>EBITDA impact</span><b>${fmtMoney(eb)}/yr</b><em>revenue × uplift</em></div><div class="hx-stat"><span>Value ÷ investment</span><b>${roi.toFixed(0)}x</b><em>multiple case</em></div><div class="hx-stat"><span>Payback</span><b>${pay.toFixed(0)} months</b><em>time to value + investment ÷ monthly EBITDA</em></div><div class="hx-stat"><span>EBITDA margin</span><b>~6% → ${(6 + pts).toFixed(1)}%</b><em>baseline midpoint of 0–12% est.</em></div></div>
      <pre class="hx-formula">value     = ${fmtMoney(rev)} × ${mx.toFixed(2)}x = ${fmtMoney(val)}
EBITDA    = ${fmtMoney(rev)} × ${pts}% = ${fmtMoney(eb)}/yr
payback   = ${ttv} mo + ${fmtMoney(inv)} ÷ ${fmtMoney(eb / 12)}/mo = ${pay.toFixed(1)} mo</pre>
      <p class="sys-src"><b>Source:</b> analyst assumptions labelled est. (OS program evidence, Fair Harbor return assumptions), not a forecast or company guidance. The multiple credit is deliberately narrow: no source isolates a pure technology premium, and DTC multiples track growth and margin.</p>`;
  };
  $('#calc').addEventListener('input', run); run();
}
function levers(ev) {
  const E = id => (ev?.items || []).find(i => i.id === id); const k1 = E('kb-fh-1'), k2 = E('kb-fh-2');
  const Lv = [
    ['Returns and exchanges', 0.30, T.co, `Return rate ${k2?.baseline ?? 19.3}% → ${k2?.target ?? 17.4}%; exchanges keep the sale`],
    ['Repeat purchase', 0.45, T.ink, `Repeat rate ${k1?.baseline ?? 20}% → ${k1?.target ?? 30}%; +5 pts retention lifts profit 25–95% (Bain)`],
    ['Inventory and markdowns', 0.25, T.mute2, 'Markdown share 38.5% → 25% (Fair Harbor growth plan); fewer stockouts in peak'],
  ];
  const mid = (RA.ebitda_impact_pct_revenue[0] + RA.ebitda_impact_pct_revenue[1]) / 2;
  $('#levers').innerHTML = `<div class="hx-stackbar">${Lv.map(([n, s, c]) => `<i style="flex:${s};background:${c}" title="${n}"></i>`).join('')}</div>
    <ul class="hx-lv">${Lv.map(([n, s, c, d]) => `<li><span class="sw" style="background:${c}"></span><div><b>${n}</b><span>${esc(d)}</span></div><em class="hx-mono">+${(mid * s).toFixed(1)} pts<span class="sys-est sys-est--illus">illustrative</span></em></li>`).join('')}</ul>
    <p class="sys-src"><b>Source:</b> the split of the ${mid} pt midpoint is illustrative; the 2–5 pt range is an analyst assumption (OS program evidence).</p>`;
}
function compsChart(comps) {
  let rows = (comps?.items || []).filter(i => ['LULU', 'RVLV', 'CROX', 'DLTH', 'BIRD'].includes(i.ticker) && i.ebitda_margin_latest_pct != null).map(i => [i.ticker, i.ebitda_margin_latest_pct, T.mute2]);
  if (!rows.length) rows = [['LULU', 24.4, T.mute2], ['RVLV', 6.4, T.mute2], ['CROX', 5.7, T.mute2], ['DLTH', 2.7, T.mute2], ['BIRD', -47.2, T.mute2]];
  const mid = (RA.ebitda_impact_pct_revenue[0] + RA.ebitda_impact_pct_revenue[1]) / 2;
  rows.sort((a, b) => b[1] - a[1]); rows.push(['Fair Harbor est.', 6, T.ink], ['FH + HarborOS est.', 6 + mid, T.co]);
  const lo = -10, hi = 28, x = v => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100, z = x(0);
  $('#comps').innerHTML = `<div class="hx-bars">${rows.map(([n, v, c]) => `<div class="hx-bar-r"><span class="n">${esc(n)}</span><span class="t"><i class="${v < lo ? 'clip' : ''}" style="left:${Math.min(z, x(v))}%;width:${Math.abs(x(v) - z)}%;background:${c}"></i><s style="left:${z}%"></s></span><span class="v hx-mono">${(+v).toFixed(1)}%</span></div>`).join('')}</div>
    <p class="sys-src"><b>Source:</b> public comparables (SEC XBRL, latest fiscal year); Allbirds clipped at −10%. The Fair Harbor baseline is the 0–12% est. midpoint (Fair Harbor public filings); LULU 24.4% is the ceiling, not a target.</p>`;
}
function evidence(ev) {
  const ids = ['ve-06', 've-24', 've-25', 've-26']; const it = (ev?.items || []).filter(i => ids.includes(i.id));
  if (!it.length) { $('#evidence').innerHTML = '<p class="sys-src">The evidence file is not available.</p>'; return; }
  $('#evidence').innerHTML = `<p class="sys-kicker">Evidence behind the ranges</p><div class="sys-grid sys-grid--4">${it.map(i => `<a class="sys-card hx-ev-c" href="${esc(i.source_url)}" target="_blank" rel="noopener"><span class="sys-card-label">Valuation evidence · ${esc(i.confidence)} confidence</span><p class="sys-card-title">${ep(i.title)}</p><p class="sys-card-body">${ep(String(i.note || i.claim).slice(0, 150))}</p><span class="sys-card-foot"><span>${ep(i.source_name)} ↗</span></span></a>`).join('')}</div><p class="sys-src"><b>Source:</b> OS program evidence (valuation evidence for DTC apparel), Oct 2026. Each card links to its publisher.</p>`;
}

/* ── stack ──────────────────────────────────────────────────────────── */
function stack(ev) {
  const V = (ev?.items || []).filter(i => i.kind === 'vendor_stack' && i.company === 'fh');
  const rows = V.map(v => ({ layer: plain(v.category), name: v.vendor, mode: 'Buy', what: plain(v.what_it_does), price: plain(v.pricing_note), src: v.source_url, note: plain(v.note || '') }));
  rows.push(
    { layer: 'Returns-to-exchange', name: 'Loop Returns (or Redo)', mode: 'Buy', what: 'Steers each return to an exchange or store credit and routes boxes to the cheapest path.', price: 'Quote-based; swimwear returns run 21.6% at Shopify brands (Loop 2024 benchmark).', src: 'https://www.loopreturns.com/report/2024-benchmark-report/', note: 'From the Fair Harbor growth plan' },
    { layer: 'Data layer', name: 'Harbor data layer', mode: 'Build', what: 'One customer + SKU graph across Shopify, Klaviyo, returns, wholesale sell-through and supplier documents.', price: 'Inside the $300–700K est. investment.', src: null },
    { layer: 'Fit model tuning', name: 'Fair Harbor kept/returned model', mode: 'Build', what: 'Tunes the vendor fit engine on Fair Harbor\'s own kept-versus-returned orders and the liner/inseam specifics.', price: 'PRG data team; weeks, not months.', src: null },
    { layer: 'Traceability', name: 'Bottle → trunk ledger', mode: 'Build', what: 'Links care-label lot codes to supplier chain-of-custody documents.', price: 'Small build on the data layer; supplier onboarding is the work.', src: null },
  );
  $('#hx-stack').innerHTML = `<div class="sys-table-wrap"><table class="sys-table hx-st-t"><thead><tr><th scope="col">Layer</th><th scope="col">Vendor or component</th><th scope="col">Buy or build</th><th scope="col">What it does</th><th scope="col">Pricing note</th></tr></thead><tbody>${rows.map(r => `<tr><td data-l="Layer">${esc(r.layer)}</td><td data-l="Vendor"><b>${esc(r.name)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}</td><td data-l="Mode"><span class="hx-mode ${r.mode === 'Build' ? 'b' : ''}">${r.mode}</span></td><td data-l="What it does">${esc(r.what)}</td><td data-l="Pricing">${esc(r.price)}${r.src ? ` <a href="${esc(r.src)}" target="_blank" rel="noopener" aria-label="Source for ${esc(r.name)}">source ↗</a>` : ''}</td></tr>`).join('')}</tbody><caption>Source: OS program evidence (Fair Harbor vendor stack) and the Fair Harbor growth plan, Oct 2026. Vendor outcome claims are self-reported upper bounds.</caption></table></div>`;
}

/* ── roadmap ────────────────────────────────────────────────────────── */
function gantt() {
  const M = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const R = [
    ['Data foundation', 'Audit and customer graph', 'Shopify and Klaviyo audit, return reasons, one customer graph', 0, 2, 'PRG data lead', T.ink],
    ['Retention flows', 'Klaviyo flows live', 'Fit check, cross-sell, pre-summer replenishment, win-back', 1, 4, 'FH growth', '#F2B263'],
    ['Fit and size pilot', 'Swim product pages, A/B with holdout', 'True Fit or Bold Metrics on swim product pages, A/B with holdout', 1, 5, 'FH e-commerce and vendor', T.co],
    ['Returns-to-exchange', 'Exchange-first', 'Exchange-first returns portal', 3, 5, 'FH ops', '#5FA9B6'],
    ['Forecasting', 'Inventory Planner and reorder agent', 'Inventory Planner and agent for in-season reorders and fall buys', 2, 7, 'FH planning and PRG', '#7FC8D3'],
    ['Wholesale portal', 'Line sheets, pre-books, reorders', 'Line sheets, pre-books, reorder agent before the summer market', 4, 9, 'FH wholesale', '#3E6B57'],
    ['Traceability ledger', 'Supplier onboarding, lot codes', 'Supplier onboarding, care-label lot codes', 6, 11, 'FH sourcing and PRG', '#E39A42'],
  ];
  const MS = [[4.5, 'Fit live on swim product pages'], [6, 'Value readout #1'], [9.5, 'Pre-book on portal'], [11.85, 'Value readout #2']];
  $('#gantt').innerHTML = `<div class="hx-g">
    <div class="hx-g-key"><span><i></i>Swim season (Apr–Aug)</span></div>
    <div class="hx-g-head"><span></span><div class="hx-g-months">${M.map((m, i) => `<span class="${i >= 6 && i <= 10 ? 'ss' : ''}">${m}<small>${i < 3 ? "'26" : "'27"}</small></span>`).join('')}</div></div>
    <div class="hx-g-body">
    ${R.map(([n, sh, d, a, b, o, c]) => `<div class="hx-g-row"><div class="hx-g-l"><b>${n}</b><span>${o}</span></div><div class="hx-g-t"><i style="left:${a / 12 * 100}%;width:${(b - a) / 12 * 100}%;background:${c}" title="${esc(d)}"><span>${esc(sh)}</span></i></div></div>`).join('')}
    <div class="hx-g-row ms"><div class="hx-g-l"><b>Milestones</b><span>PRG readouts</span></div><div class="hx-g-t">${MS.map(([m, t], k) => `<em class="${m > 11 || (MS[k + 1] && MS[k + 1][0] - m < 2) ? 'end' : (k && m - MS[k - 1][0] < 2 ? 'start' : '')}" style="left:${m / 12 * 100}%"><i></i><span>${t}</span></em>`).join('')}</div></div></div>
    <ul class="hx-g-ms">${MS.map(([m, t]) => `<li><i></i><b>${M[Math.floor(m)]}</b> ${t}</li>`).join('')}</ul></div>`;
}
function risks() {
  const R = [
    ['Vendor claims are upper bounds', 'True Fit (up to 40%) and Bold Metrics (17%) report their own best cases.', 'Pilot on swim product pages with a holdout group; scale only on measured lift; prefer outcome-based pricing.'],
    ['Baselines are estimates', 'Revenue ($20–35M) and EBITDA (0–12%) are low-confidence outside-in estimates.', 'Replace with actuals in the first 30 days; every calculator input is already a slider.'],
    ['Seasonality compresses learning', 'Swim demand is concentrated in a few summer months, so a late launch loses a year.', 'Fit and flows live before April; train on prior seasons\' returns and orders.'],
    ['Wholesale channel conflict', 'Portal reorders and DTC promotions can collide on price and allocation.', 'MAP rules, allocation by door tier, and wholesale-first drops for core prints.'],
    ['Markdown habit', '38.5% of live variants were marked down in Sept 2026; customers learn to wait.', 'SKU-level markdowns only; content-led capture instead of blanket discounts.'],
    ['Building too much software', 'Custom platforms become the next owner\'s write-off.', 'Buy the systems of record; build only the data layer, fit tuning and ledger.'],
  ];
  $('#hx-risks').innerHTML = R.map(([t, r, m], i) => `<article class="sys-card"><span class="sys-card-label">Risk 0${i + 1}</span><p class="sys-card-title">${t}</p><p class="sys-card-body">${r}</p><div class="sys-note sys-note--good" style="margin-top:auto"><span><b>Guardrail.</b> ${m}</span></div></article>`).join('');
}
function exitList() {
  const X = [
    ['Cohort curves, not anecdotes', 'Repeat and return rates by cohort, live in the data layer, are the first thing a DTC buyer asks for and the hardest to fake.'],
    ['Inventory discipline on the record', 'Weeks of cover, sell-through and markdown share by SKU tell a working-capital story that supports the margin case.'],
    ['A wholesale channel with reorder data', 'Door-level sell-through and pre-books show a scalable second channel; Chubbies\' retail and wholesale reached 52% of FY2025 sales.'],
    ['Sustainability claims that survive diligence', 'Lot-level traceability turns "made from bottles" from marketing into documentation, and protects the B Corp brand premium.'],
  ];
  $('#exit-list').innerHTML = X.map(([t, d]) => `<li class="sys-card"><h3 class="sys-card-title">${t}</h3><p class="sys-card-body">${d}</p></li>`).join('');
}
