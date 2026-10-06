/* Fair Harbor concept — home page behaviour. Booted from an inline module in index.html
   (so scripts/bump_version.sh can stamp the shared core/chat imports). */
import { art, PRODUCTS, COLORS, recommend, FAQ, SUGGESTIONS, INTENTS, chrome, toast, esc } from './common.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const TINT = { navy: '#E2E8EE', sea: '#D9ECEE', sunset: '#FBE3D7', sand: '#F3EBDD', palm: '#DEEAE2', sky: '#E2F0F4', white: '#ECF1F0', coral: '#FBE6DD' };
const PRINT = { solid: 'Solid', stripe: 'Stripe', hstripe: 'Rugby stripe', pin: 'Pinstripe', palm: 'Palm print', wave: 'Wave print', dot: 'Dot', gingham: 'Gingham' };
const F = { reviews: '35,000+', bottles: 27e6, bottlesTxt: '27M+', bscore: '94.3', doors: '250+', markdown: 38.5, revenue: 27e6, swimPrice: 88, swimShare: 0.40, perTrunk: 11 };

export async function boot({ Chat, Data }) {
  chrome();
  $('#hero-trunk').innerHTML = art('trunk', 'sea', 'palm', 'The Bayberry Trunk in Sea Glass palm print');
  bottleFlow();
  shop();
  fit();
  kit();
  channels();
  reviews();
  faq();
  email();
  const chat = Chat.mount(null, {
    persona: 'fh', mode: 'floating', theme: 'light', color: '#1F7A8C', name: 'Harbor helper · Fair Harbor', initials: 'FH',
    greeting: 'Hi! I can pick your size, explain the BreezeKnit liner and the recycled-bottle fabric, and answer shipping, returns, store and wholesale questions.',
    placeholder: 'Ask about sizing, fabric, shipping…', faq: FAQ, suggestions: SUGGESTIONS, intents: INTENTS, autoAsk: new URLSearchParams(location.search).get('ask') || undefined,
  });
  $('#ask-btn')?.addEventListener('click', () => chat.togglePanel(true));
  // data-powered facts + rationale (graceful if datasets are missing)
  const [fil, refs, ev, pb] = await Promise.all(['fairharbor_filings', 'design_refs', 'serviceos_evidence', 'fh_playbook'].map(n => Data.research(n).catch(() => null)));
  facts(fil); counter(); rationale(refs, ev, pb);
}

/* ── facts from data/research/fairharbor_filings.json ─────────────────── */
function facts(fil) {
  try {
    const it = fil?.items || [];
    const bw = it.find(i => /Business Wire/i.test(i.title || ''))?.key_figures || {};
    const bc = it.find(i => /B Corporation/i.test(i.title || ''))?.key_figures || {};
    const cat = it.find(i => /Shopify catalog/i.test(i.title || ''))?.key_figures || {};
    const rev = (fil?.meta?.estimate_table || []).find(r => /2025 net revenue/i.test(r.metric));
    if (bw.five_star_reviews) F.reviews = bw.five_star_reviews;
    if (bw.specialty_retail_doors) F.doors = bw.specialty_retail_doors;
    if (bc.b_impact_score) F.bscore = String(bc.b_impact_score);
    const m = String(bc.recycled_bottles_claim || '').match(/(\d+)\s*million/); if (m) { F.bottles = +m[1] * 1e6; F.bottlesTxt = `${m[1]}M+`; }
    if (cat.median_swim_price_usd) F.swimPrice = cat.median_swim_price_usd;
    if (cat.markdown_share_pct) F.markdown = cat.markdown_share_pct;
    const pt = String(rev?.estimate || '').match(/point ~\$(\d+)M/); if (pt) F.revenue = +pt[1] * 1e6;
  } catch (e) { console.debug('facts fallback', e); }
  $$('[data-fact]').forEach(el => { const k = el.dataset.fact; el.textContent = k === 'bottles' ? F.bottlesTxt : k === 'markdown' ? `${F.markdown}%` : F[k]; });
  $('#f-rev').textContent = `$${Math.round(F.revenue / 1e6)}M`; $('#f-price').textContent = `$${F.swimPrice}`;
}

/* ── bottle → fabric flow illustration ───────────────────────────────── */
function bottleFlow() {
  const xs = [36, 98, 160, 222, 284], L = ['Bottle', 'Flake', 'Pellet', 'Yarn', 'Fabric'];
  const ico = [
    '<path d="M-5-14h10v5l4 5v17a3 3 0 0 1-3 3h-12a3 3 0 0 1-3-3V-4l4-5z" fill="#9CC9DA" stroke="#1F7A8C" stroke-width="1.6"/><rect x="-5" y="-17" width="10" height="4" rx="1" fill="#1F7A8C"/>',
    '<path d="M-10-6l7-3 3 6-7 2zM2-10l8 2-2 7-7-3zM-6 4l6-2 3 7-7 2zM4 2l7 1-1 7-6-2z" fill="#5FA9B6"/>',
    [[-7, -5], [2, -7], [8, 1], [-3, 4], [5, 8], [-9, 5], [-1, -1]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#F7F4EE" stroke="#1F7A8C" stroke-width="1.4"/>`).join(''),
    '<rect x="-9" y="-12" width="18" height="24" rx="3" fill="#F2B263"/><path d="M-9-6h18M-9-1h18M-9 4h18" stroke="#E39A42" stroke-width="1.6"/><rect x="-11" y="-14" width="22" height="4" rx="2" fill="#0F2733"/><rect x="-11" y="10" width="22" height="4" rx="2" fill="#0F2733"/>',
    '<rect x="-12" y="-12" width="24" height="24" rx="4" fill="#2C8C99"/><path d="M-12-4q6-5 12 0t12 0M-12 4q6-5 12 0t12 0" stroke="#CFEAEE" stroke-width="1.6" fill="none"/>',
  ];
  $('#bottle-flow').innerHTML = `<rect width="320" height="180" fill="#EAF4F4"/><text x="18" y="30" font-family="JetBrains Mono" font-size="11" letter-spacing="1.2" fill="#155E6C">≈11 BOTTLES → 1 TRUNK</text>
    <path d="M36 92 H284" stroke="#1F7A8C" stroke-width="1.6" stroke-dasharray="4 5" class="flow-line"/>
    ${xs.map((x, i) => `<g transform="translate(${x} 92)"><circle r="25" fill="#fff" stroke="#D3EAEF" stroke-width="2"/>${ico[i]}</g><text x="${x}" y="138" text-anchor="middle" font-family="Inter" font-weight="600" font-size="12" fill="#0F2733">${L[i]}</text><text x="${x}" y="154" text-anchor="middle" font-family="JetBrains Mono" font-size="9.5" fill="#5A6E78">0${i + 1}</text>`).join('')}`;
}

/* ── shop grid ───────────────────────────────────────────────────────── */
const state = { cat: 'all', color: null, active: {}, bag: 0 };
function swatchBg(k, pr) { const c = COLORS[k]; return pr === 'solid' ? c.base : `linear-gradient(135deg,${c.base} 50%,${c.accent} 50%)`; }
function shop() {
  const fam = [['navy', '#1E3550'], ['sea', '#2C8C99'], ['sunset', '#E8684A'], ['sand', '#E2D2B4'], ['palm', '#3E6B57'], ['sky', '#9CC9DA']];
  $('#color-filter').innerHTML = fam.map(([k, c]) => `<button class="cf" style="background:${c}" data-fam="${k}" aria-pressed="false" aria-label="${esc(COLORS[k].name)}" title="${esc(COLORS[k].name)}"></button>`).join('');
  $('#grid').innerHTML = PRODUCTS.map(p => `<article class="pc" data-id="${p.id}">
      <div class="pc-art">${p.badge ? `<span class="pc-badge">${esc(p.badge)}</span>` : ''}${p.bottles ? `<span class="pc-bottle" title="Recycled plastic bottles in this item (trunks ≈11 per brand; others est.)">≈${p.bottles} bottles</span>` : ''}<div class="pc-svg"></div></div>
      <div class="pc-body"><div class="pc-top"><h3>${esc(p.name)}</h3><span class="price">$${p.price}</span></div>
      <p class="meta">${esc(p.meta)}</p><p class="cw"></p>
      <div class="sw" role="group" aria-label="${esc(p.name)} colorways">${p.ways.map(([k, pr], i) => `<button data-i="${i}" style="background:${swatchBg(k, pr)}" aria-label="${esc(COLORS[k].name)} ${esc(PRINT[pr])}" aria-pressed="${i === 0}"></button>`).join('')}</div>
      <button class="add">Quick add</button></div></article>`).join('') + '<p class="empty-p" hidden>No styles in that combination yet. Try another color.</p>';
  PRODUCTS.forEach(p => setWay(p.id, 0));
  $$('#grid .pc').forEach(card => {
    const id = card.dataset.id;
    card.querySelectorAll('.sw button').forEach(b => b.addEventListener('click', () => setWay(id, +b.dataset.i)));
    card.querySelector('.add').addEventListener('click', () => addToBag(id));
  });
  $$('.chips .chip').forEach(b => b.addEventListener('click', () => { state.cat = b.dataset.cat; $$('.chips .chip').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); filter(); }));
  $$('.cf').forEach(b => b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') === 'true'; state.color = on ? null : b.dataset.fam; $$('.cf').forEach(x => x.setAttribute('aria-pressed', String(!on && x === b))); filter(); }));
  $$('[data-filter]').forEach(a => a.addEventListener('click', () => { const c = $(`.chip[data-cat="${a.dataset.filter}"]`); c?.click(); }));
}
function setWay(id, i) {
  const p = PRODUCTS.find(x => x.id === id), card = $(`.pc[data-id="${id}"]`); const [k, pr] = p.ways[i]; state.active[id] = i;
  card.querySelector('.pc-svg').innerHTML = art(p.kind, k, pr, `${p.name} in ${COLORS[k].name} ${PRINT[pr].toLowerCase()}`);
  card.querySelector('.pc-art').style.setProperty('--tint', TINT[k]);
  card.querySelector('.cw').textContent = `${COLORS[k].name} · ${PRINT[pr]} · ${p.ways.length} colorways`;
  card.querySelectorAll('.sw button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
}
function filter() {
  let shown = 0;
  PRODUCTS.forEach(p => {
    const card = $(`.pc[data-id="${p.id}"]`); const catOk = state.cat === 'all' || p.cat.includes(state.cat);
    const wi = state.color ? p.ways.findIndex(([k]) => COLORS[k].family === state.color) : -1;
    const ok = catOk && (!state.color || wi >= 0); card.hidden = !ok; if (ok) shown++;
    if (ok && wi >= 0 && state.active[p.id] !== wi) setWay(p.id, wi);
  });
  $('.empty-p').hidden = shown > 0;
}
function addToBag(id, size) {
  const p = PRODUCTS.find(x => x.id === id); const [k] = p.ways[state.active[id] || 0]; state.bag++;
  const bag = $('.bag'); bag.classList.add('has'); $('.bag-n').textContent = state.bag; bag.setAttribute('aria-label', `Bag, ${state.bag} item${state.bag > 1 ? 's' : ''}`);
  toast(`Added ${p.name}${size ? ` (${size})` : ''} in ${COLORS[k].name}. Concept only: no checkout.`);
}

/* ── fit finder ──────────────────────────────────────────────────────── */
function fit() {
  const sel = $('#f-waist'); for (let w = 28; w <= 42; w++) sel.insertAdjacentHTML('beforeend', `<option value="${w}">${w}"</option>`);
  const h = $('#f-h'), w = $('#f-w');
  const paint = r => r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  let last = null;
  const run = () => {
    paint(h); paint(w);
    const hv = +h.value; $('#o-h').textContent = `${Math.floor(hv / 12)}′${hv % 12}″`; $('#o-w').textContent = `${w.value} lb`;
    const fd = new FormData($('#fit-form'));
    const r = recommend({ heightIn: hv, weightLb: +w.value, waistIn: sel.value ? +sel.value : null, fit: fd.get('fit'), use: fd.get('use') });
    const pid = r.inseam === 9 ? 'breakwater' : r.inseam === 7 ? 'anchor' : 'bayberry'; const p = PRODUCTS.find(x => x.id === pid);
    const max = Math.max(...r.probs.map(x => x.p));
    const conf = Math.round(r.confidence * 100);
    $('#fit-out').innerHTML = `<div class="fo-top"><div class="fo-size${last !== r.size ? ' pop' : ''}" aria-label="Recommended size ${r.size}">${r.size}</div>
      <div><p class="fo-k">Your size</p><p class="fo-prod">${esc(r.product)} · ${r.inseam}"</p><p class="fo-conf"><i style="background:${conf >= 60 ? '#2E9D6A' : '#E39A42'}"></i>${conf}% confidence · est. waist ${r.waist.toFixed(1)}"</p></div></div>
      <div class="dist" role="img" aria-label="Probability by size: ${r.probs.map(x => `${x.size} ${Math.round(x.p * 100)}%`).join(', ')}">${r.probs.map(x => `<div class="${x.size === r.size ? 'on' : ''}"><em>${Math.round(x.p * 100)}%</em><i style="height:${Math.max(3, (x.p / max) * 100)}%"></i><span>${x.size}</span></div>`).join('')}</div>
      <ul class="fo-notes">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}<li>Shirts and polos: start with <b>${r.top}</b>.</li></ul>
      <div class="fo-actions"><button class="btn btn-ink sm" data-add="${pid}">Add ${esc(r.size)} to bag · $${p.price}</button><span class="meta">Free exchange if it's off.</span></div>`;
    $('#fit-out [data-add]').onclick = () => addToBag(pid, r.size);
    last = r.size;
  };
  $('#fit-form').addEventListener('input', run); $('#fit-form').addEventListener('change', run); run();
}

/* ── sustainability counter + kit ────────────────────────────────────── */
function counter() {
  const perYear = F.revenue * F.swimShare / F.swimPrice * F.perTrunk; const perDay = perYear / 365;
  const t0 = Date.UTC(2023, 0, 1);
  const now = () => F.bottles + perDay * ((Date.now() - t0) / 864e5);
  $('#rate-day').textContent = Math.round(perDay).toLocaleString('en-US');
  $('#rate-year').textContent = (perYear / 1e6).toFixed(2) + 'M';
  const el = $('#bottle-count'); const fmt = n => Math.floor(n).toLocaleString('en-US');
  const start = () => {
    const to = now(), from = to * 0.96, t1 = performance.now(), d = 1800;
    const step = t => { const k = Math.min(1, (t - t1) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else setInterval(() => { el.textContent = fmt(now()); }, 1000); };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }); io.observe(el); } else start();
  el.textContent = fmt(now());
}
function kit() {
  const rows = [['Swim trunks', 11, 2, 'brand ratio'], ['Boardshorts', 14, 0, 'est.'], ['Camp shirts & polos', 8, 1, 'est.'], ['Hybrid shorts', 10, 0, 'est.']];
  $('#kit').innerHTML = rows.map(([n, b, v, s], i) => `<div class="kr"><span>${n}<small>≈${b} bottles each · ${s}</small></span><div class="step" role="group" aria-label="${n} count"><button data-k="${i}" data-d="-1" aria-label="Fewer ${n}">−</button><output data-o="${i}">${v}</output><button data-k="${i}" data-d="1" aria-label="More ${n}">+</button></div></div>`).join('');
  const vals = rows.map(r => r[2]);
  const upd = () => { const tot = vals.reduce((a, v, i) => a + v * rows[i][1], 0); $('#kit-n').textContent = tot; const show = Math.min(tot, 72); $('#kit-viz').innerHTML = '<i></i>'.repeat(show) + (tot > show ? `<span class="mono" style="font-size:12px;color:#A9C3CB;align-self:center">+${tot - show}</span>` : ''); rows.forEach((_, i) => { $(`[data-o="${i}"]`).textContent = vals[i]; }); };
  $('#kit').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; const i = +b.dataset.k; vals[i] = Math.max(0, Math.min(12, vals[i] + +b.dataset.d)); upd(); });
  upd();
}

/* ── wholesale channels ──────────────────────────────────────────────── */
function channels() {
  const I = {
    dept: '<path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2 10l10-6 10 6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    surf: '<path d="M18 3c-6 1-11 7-13 15l-1 3 3-1c8-2 14-7 15-13 .3-2-1.6-4.3-4-4zM6 18l6-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    sport: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    golf: '<path d="M7 21V3l10 4-10 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><ellipse cx="11" cy="21" rx="7" ry="1.6" fill="currentColor" opacity=".3"/>',
    campus: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    custom: '<rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  };
  const C = [
    ['dept', 'Department stores', 'Premium department-store swim and resort floors, with full size runs in core prints.', 'Nordstrom · Saks Fifth Avenue (2022)'],
    ['surf', 'Specialty surf & coastal', 'Independent surf, resort and coastal boutiques from Montauk to the Gulf. The heart of the brand.', '250+ specialty doors (2022)'],
    ['sport', 'Sporting goods', 'Regional sporting-goods chains bring the brand to lake and river towns far from the coast.', 'Scheels partnership (2023)'],
    ['golf', 'Golf pro shops', 'Polos, hybrid shorts and a co-branded line for green-grass and resort pro shops.', 'FootJoy × Fair Harbor (2026)'],
    ['campus', 'Campus stores', 'Licensed collegiate trunks and shirts for alumni weekends and spring break.', 'Michigan · Syracuse · Purdue · Colgate · Fairfield (2026)'],
    ['custom', 'Corporate & custom', 'Embroidered trunks, shirts and sweatshirts for companies, clubs, hotels and wedding parties.', 'B2B custom program (2025–26)'],
  ];
  $('#channels').innerHTML = C.map(([k, t, d, f]) => `<article class="chan" data-reveal><div class="chan-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg></div><h3>${t}</h3><p>${d}</p><p class="chan-fact">${f}</p></article>`).join('');
}

/* ── reviews (illustrative) ──────────────────────────────────────────── */
function reviews() {
  const R = [
    ['First trunks I\'ve owned where the liner doesn\'t rub. Wore them from the beach straight to dinner.', 'Mike R.', 'Montauk, NY', 'Bayberry · kept M'],
    ['The fit finder said M even though I always buy L. I went with it. It was right.', 'Dan K.', 'Charleston, SC', 'Anchor · kept M'],
    ['Bought matching Kids Bayberrys for the boys. They survived an entire summer at the lake.', 'Sarah P.', 'Lake Geneva, WI', 'Kids Bayberry'],
    ['Dry by the time I walk back from the break, and the 9-inch boardshort stays put in real surf.', 'Chris L.', 'Cocoa Beach, FL', 'Breakwater · kept L'],
    ['The camp shirt was the only thing I packed for vacation that I wore twice.', 'Alex M.', 'Brooklyn, NY', 'Camp Shirt · kept L'],
    ['Eighteen holes and a swim after in the hybrid short. Nobody at the club noticed.', 'Tom W.', 'Greenwich, CT', 'Fairway Hybrid · kept 34'],
    ['My daughter checks the care label for the bottle count on every pair. Eleven, every time.', 'Jen A.', 'Wilmington, NC', 'Bayberry · kept L'],
    ['Ordered for the whole wedding party with embroidered initials. Arrived early and fit everyone.', 'Pat G.', 'Nantucket, MA', 'Custom order'],
  ];
  $('#reviews').innerHTML = R.map(([q, n, c, p]) => `<figure class="rvw"><div class="rvw-top"><span class="stars" aria-label="5 out of 5 stars">★★★★★</span><span class="ill">Illustrative</span></div><blockquote>“${esc(q)}”</blockquote><span class="kept">${esc(p)}</span><figcaption><b>${esc(n)}</b><span>${esc(c)}</span></figcaption></figure>`).join('');
}

/* ── FAQ ─────────────────────────────────────────────────────────────── */
function faq() {
  const pick = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11];
  $('#faq-list').innerHTML = pick.map((i, k) => `<details${k === 0 ? ' open' : ''}><summary>${esc(FAQ[i].q.replace(/\?.*$/, '?'))}</summary><div class="a">${FAQ[i].a}</div></details>`).join('');
}

/* ── email ───────────────────────────────────────────────────────────── */
function email() {
  $('#em-form').addEventListener('submit', e => {
    e.preventDefault(); const v = $('#em').value.trim(); const m = $('#em-msg');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { m.textContent = 'Please enter a valid email address.'; m.classList.add('err'); $('#em').setAttribute('aria-invalid', 'true'); return; }
    m.classList.remove('err'); $('#em').removeAttribute('aria-invalid'); m.textContent = 'You\'re on the list. The fit guide is on its way. (Concept: nothing was sent.)'; $('#em').value = '';
  });
}

/* ── design rationale from data/research/design_refs.json ───────────── */
function rationale(refs, ev, pb) {
  const HERE = {
    'ref-fh-vuori': { pick: [0, 1], here: 'BreezeKnit and the recycled-bottle shell get their own section, like a fabric franchise; the Harbor helper chat sits on every page.', kpi: ['Conversion rate', 'Fit-related returns'] },
    'ref-fh-chubbies': { pick: [0, 3], here: 'Pre-Loved sits in the primary nav (Harbor Again trade-in), and the headlines carry the brand voice ("The trunks that used to be bottles.") instead of a discount banner.', kpi: ['Repeat purchase rate', 'CAC payback'] },
    'ref-fh-outerknown': { pick: [1, 2], here: 'The Bayberry trunk is the hero franchise with spec callouts; a restrained ink-and-sand UI lets the product colours carry the page.', kpi: ['Full-price sell-through', 'Markdown share'] },
    'ref-fh-allbirds': { pick: [0, 2], here: 'Material-first copy and a per-product bottle count; floating pill nav over the sky gradient; no entry discount modal.', kpi: ['Email capture without discount', 'Gross margin'] },
  };
  const items = (refs?.items || []).filter(i => [].concat(i.applies_to || []).includes('fh'));
  const g = $('#ra-grid');
  if (!items.length) g.innerHTML = '<p class="fine">Design references dataset not available; see data/research/design_refs.json.</p>';
  else g.innerHTML = items.map(r => { const h = HERE[r.id] || { pick: [0], here: '', kpi: [] }; const els = h.pick.map(i => r.elements_to_borrow?.[i]).filter(Boolean);
    return `<article class="ra-card" data-reveal><header><h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></h3><span>${h.kpi.map(k => `<span class="ra-kpi-tag">${esc(k)}</span>`).join('')}</span></header>
      <p class="ra-own">${esc(String(r.owner_or_backer || '').split('. ')[0].replace(/\.$/, ''))}.</p>
      ${els.map(e => `<div class="ra-el"><span class="k">Borrowed</span><p><b>${esc(e.element)}.</b> ${esc(e.what_it_does_for_conversion_or_valuation)}</p></div>`).join('')}
      <div class="ra-el"><span class="k">On this page</span><p>${esc(h.here)}</p></div></article>`; }).join('');
  // KPI table from serviceos_evidence + fh_playbook
  const E = id => (ev?.items || []).find(i => i.id === id); const P = id => (pb?.items || []).find(i => i.id === id);
  const k1 = E('kb-fh-1'), k2 = E('kb-fh-2'), g1 = P('gl-01'), g3 = P('gl-03'), g4 = P('gl-04'), ra = E('ra-fh');
  const rows = [
    ['Online return rate', k2 ? `${k2.baseline}% (NRF 2025, all categories)` : '19.3%', k2 ? `${k2.target}% est.` : '17.4% est.', 'Fit finder with confidence score, fit guarantee, size-kept tags on reviews'],
    ['Swim return rate', g4 ? `${g4.baseline}% (Loop benchmark)` : '21.6%', g4 ? `${g4.target}% est.` : '18.5% est.', 'Inseam recommendation by height and use; liner and fit notes on every card'],
    ['Repeat purchase rate', k1 ? `${k1.baseline}% (Klaviyo benchmark)` : '20%', k1 ? `${k1.target}% est.` : '30% est.', 'Harbor Again trade-in credit, Harbor Report, replenishment flows (HarborOS)'],
    ['Markdown share of live variants', g3 ? `${g3.baseline}% (catalog, Sept 2026)` : '38.5%', g3 ? `${g3.target}% est.` : '25% est.', 'Content-led email capture instead of a discount modal; full-price hero franchise'],
    ['Wholesale doors', g1 ? `~${g1.baseline} (2022 release)` : '~252', g1 ? `${g1.target} by month 24 est.` : '420 est.', 'Six named channels and a direct path to the wholesale portal'],
    ['EBITDA margin', '~6% est. (0–12%)', ra ? `+${ra.ebitda_impact_pct_revenue[0]}–${ra.ebitda_impact_pct_revenue[1]} pts est.` : '+2–5 pts est.', 'All of the above, run on HarborOS (see the value-creation math)'],
  ];
  $('#ra-kpi').innerHTML = rows.map(r => `<tr><td>${esc(r[0])}</td><td class="n">${esc(r[1])}</td><td class="n">${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('');
  // newly injected reveal targets
  $$('#ra-grid [data-reveal], #channels [data-reveal]').forEach(el => el.classList.add('in'));
}
