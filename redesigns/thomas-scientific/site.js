/* Thomas Scientific concept site — interactions. Data via the portal's core.js (Data). */
import { esc, num, CATS, PRODUCTS, STOCK, catById, search, VERTICALS, TILES, STATE_NAMES, REGIONS, regionOf, SITES_FALLBACK, aggregateSites, FAQ, LOGO, banner, toast, reveal, mountChat } from './shared.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
let DataRef = null;
let SITES = null;            // aggregated ts_sites (never row-level on screen)
let sitesPromise = null;

/* ── Quote cart (per-viewer convenience; browser storage guarded) ─────────── */
const cart = new Map();
const CART_KEY = 'ts-concept-cart';
function loadCart() { try { const j = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); j.forEach(([k, v]) => PRODUCTS.some(p => p.id === k) && cart.set(k, v)); } catch { } }
function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify([...cart])); } catch { } }
function addToCart(id, qty = 1, quiet = false) {
  const p = PRODUCTS.find(x => x.id === id); if (!p) return;
  cart.set(id, (cart.get(id) || 0) + qty); saveCart(); renderCart();
  if (!quiet) toast(`<b>Added</b> ${esc(p.name)} × ${qty} to your quote cart`);
}
function renderCart() {
  const n = [...cart.values()].reduce((a, b) => a + b, 0);
  $$('[data-cart-n]').forEach(e => { e.textContent = n; e.classList.toggle('has', n > 0); });
  const list = $('[data-cart-list]');
  if (list) list.innerHTML = cart.size ? [...cart].map(([id, q]) => { const p = PRODUCTS.find(x => x.id === id); return `<div class="cl"><div><b>${esc(p.name)}</b><span class="mono">${esc(p.id)} · ${esc(p.pack)}</span></div><div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}"><button data-dq="${esc(id)}" data-d="-1" aria-label="Decrease">−</button><span class="mono">${q}</span><button data-dq="${esc(id)}" data-d="1" aria-label="Increase">+</button></div></div>`; }).join('') : `<div class="empty"><p>Your quote cart is empty.</p><p>Search the catalog or paste catalog numbers into Quick order.</p></div>`;
  const qc = $('[data-qt-cart]');
  if (qc) qc.innerHTML = cart.size ? `<div class="qc-h"><b>${cart.size} line${cart.size > 1 ? 's' : ''} in your quote cart</b><button type="button" data-cart-open class="link">Edit</button></div><ul>${[...cart].slice(0, 4).map(([id, q]) => `<li><span class="mono">${esc(id)}</span> ${esc(PRODUCTS.find(x => x.id === id).name)} <em>× ${q}</em></li>`).join('')}${cart.size > 4 ? `<li class="more">+ ${cart.size - 4} more</li>` : ''}</ul>` : '';
  $$('[data-cart-open]', qc || document).forEach(b => b.onclick = openDrawer);
}
function openDrawer() { const d = $('[data-drawer]'); d.classList.add('on'); d.setAttribute('aria-hidden', 'false'); $('[data-scrim]').hidden = false; $('[data-cart-close]').focus(); }
function closeDrawer() { const d = $('[data-drawer]'); d.classList.remove('on'); d.setAttribute('aria-hidden', 'true'); $('[data-scrim]').hidden = true; }

/* ── Search (header + hero) ─────────────────────────────────────────────── */
const stockBadge = p => `<span class="stock ${STOCK[p.stock].cls}">${STOCK[p.stock].label}</span>`;
function resultRow(p, i) {
  const c = catById(p.cat);
  return `<div class="res" role="option" id="opt-${esc(p.id)}" data-i="${i}" aria-selected="false"><span class="res-sym" style="--h:${c.hue}">${c.sym}</span><div class="res-m"><b>${esc(p.name)}</b><span>${esc(p.spec)}</span><span class="res-meta"><span class="mono">${esc(p.id)}</span> · ${esc(p.pack)} · ${stockBadge(p)}</span></div><button class="res-add" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)} to quote cart">${p.stock === 'quote' ? 'Quote' : 'Add'}</button></div>`;
}
function wireSearch(form) {
  const input = $('input', form), box = $('.results', form), scope = $('[data-scope]', form);
  let items = [], idx = -1;
  const render = () => {
    const q = input.value.trim(); const sc = scope ? scope.value : '';
    if (!q && !sc) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    items = q ? search(q, 30) : PRODUCTS.slice(); if (sc) items = items.filter(p => p.cat === sc); items = items.slice(0, 7); idx = -1;
    box.innerHTML = items.length ? `<div class="res-h"><span>${items.length} match${items.length > 1 ? 'es' : ''}${sc ? ` in ${esc(catById(sc).name)}` : ''}</span><span class="mono">↑↓ to move · ↵ to add</span></div>${items.map(resultRow).join('')}` : `<div class="res-none"><b>No exact match for “${esc(q)}”.</b><p>Ask the concierge (bottom right) or <a href="#quote">send us the spec</a>: we source beyond the online catalog.</p></div>`;
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const move = d => { if (!items.length) return; idx = (idx + d + items.length) % items.length; $$('.res', box).forEach((r, i) => { r.classList.toggle('on', i === idx); r.setAttribute('aria-selected', i === idx); }); input.setAttribute('aria-activedescendant', `opt-${items[idx].id}`); $$('.res', box)[idx].scrollIntoView({ block: 'nearest' }); };
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  scope && scope.addEventListener('change', () => { render(); input.focus(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { box.hidden = true; } else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); addToCart(items[idx].id); }
  });
  form.addEventListener('submit', e => { e.preventDefault(); render(); if (items.length && idx < 0) move(1); });
  box.addEventListener('mousedown', e => { const b = e.target.closest('[data-add]'); if (b) { e.preventDefault(); addToCart(b.dataset.add); } });
  document.addEventListener('click', e => { if (!form.contains(e.target)) box.hidden = true; });
  return { set(q) { input.value = q; render(); input.focus(); } };
}

/* ── Quick order ────────────────────────────────────────────────────────── */
function parseQuick(txt) {
  return txt.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/([A-Za-z]{2}-[A-Za-z0-9]+-[A-Za-z0-9]+)\s*(?:[,;x×\t ]\s*(\d+))?/);
    if (!m) return { raw: l, ok: false };
    const p = PRODUCTS.find(x => x.id.toLowerCase() === m[1].toLowerCase());
    return { raw: l, id: p?.id || m[1].toUpperCase(), qty: Math.max(1, +(m[2] || 1)), ok: !!p, p };
  });
}
function wireQuick() {
  const ta = $('#qo-text'), out = $('[data-qo-parse]');
  const draw = () => { const r = parseQuick(ta.value); out.innerHTML = r.length ? `<ul>${r.map(x => `<li class="${x.ok ? 'ok' : 'bad'}"><i aria-hidden="true">${x.ok ? '✓' : '!'}</i><span class="mono">${esc(x.id || x.raw)}</span><em>${x.ok ? `${esc(x.p.name)} × ${x.qty}` : 'Not found: we will source it'}</em></li>`).join('')}</ul>` : ''; };
  ta.addEventListener('input', draw); draw();
  $('[data-qo-add]').onclick = () => { const r = parseQuick(ta.value).filter(x => x.ok); r.forEach(x => addToCart(x.id, x.qty, true)); toast(r.length ? `<b>${r.length} lines</b> added to your quote cart` : 'No catalog numbers recognized'); if (r.length) openDrawer(); };
}

/* ── Periodic table + shelf ─────────────────────────────────────────────── */
function wireTable() {
  const pt = $('[data-ptable]'), shelf = $('[data-shelf]');
  pt.innerHTML = CATS.map(c => { const n = PRODUCTS.filter(p => p.cat === c.id).length; return `<button class="el" role="listitem" data-cat="${c.id}" style="--h:${c.hue}" aria-expanded="false" aria-controls="shelf"><span class="el-no mono">${c.no}</span><span class="el-sym">${c.sym}</span><span class="el-name">${c.name}</span><span class="el-blurb">${c.blurb}</span><span class="el-subs">${c.subs.map(s => `<i>${s}</i>`).join('')}</span><span class="el-n mono">${n} featured lines →</span></button>`; }).join('');
  shelf.id = 'shelf';
  const open = id => {
    const c = catById(id); const rows = PRODUCTS.filter(p => p.cat === id);
    $$('.el', pt).forEach(b => { const on = b.dataset.cat === id; b.classList.toggle('on', on); b.setAttribute('aria-expanded', on); });
    shelf.hidden = false; shelf.style.setProperty('--h', c.hue);
    shelf.innerHTML = `<div class="shelf-h"><div><span class="el-sym sm">${c.sym}</span><h3>${c.name}</h3><span class="muted">${rows.length} featured lines · illustrative catalog numbers</span></div><button class="link" data-shelf-x>Close ✕</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Catalog #</th><th scope="col">Product</th><th scope="col" class="hide-s">Specification</th><th scope="col" class="hide-s">Pack</th><th scope="col">Availability</th><th scope="col"><span class="sr">Add</span></th></tr></thead><tbody>${rows.map(p => `<tr><td class="mono">${esc(p.id)}</td><td><b>${esc(p.name)}</b><span class="show-s">${esc(p.spec)}</span></td><td class="hide-s">${esc(p.spec)}</td><td class="hide-s">${esc(p.pack)}</td><td>${stockBadge(p)}</td><td><button class="res-add" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)}">${p.stock === 'quote' ? 'Quote' : 'Add'}</button></td></tr>`).join('')}</tbody></table></div>`;
    $('[data-shelf-x]', shelf).onclick = () => { shelf.hidden = true; $$('.el', pt).forEach(b => { b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); }); };
    shelf.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };
  pt.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) open(b.dataset.cat); });
  shelf.addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) addToCart(b.dataset.add); });
}

/* ── Category finder ────────────────────────────────────────────────────── */
const FLOWS = [
  { id: 'culture', name: 'Cell culture', w: { consumables: 5, equipment: 3, coldchain: 2, safety: 1 }, p: ['TS-1105-10', 'TS-5075-T75', 'TS-3050-50', 'TS-9300-CO2', 'TS-9400-BSC', 'TS-6002-CV'] },
  { id: 'molecular', name: 'Molecular / PCR', w: { consumables: 5, equipment: 2, chemicals: 2, coldchain: 1 }, p: ['TS-2210-200', 'TS-4096-PCR', 'TS-3015-15', 'TS-8810-MC', 'TS-C077-TR', 'TS-9620-PP'] },
  { id: 'chrom', name: 'Chromatography & LC-MS', w: { chemicals: 5, consumables: 3, equipment: 2, safety: 1 }, p: ['TS-C056-4L', 'TS-C075-4L', 'TS-7200-HV', 'TS-7020-SY', 'TS-9001-AB', 'TS-S020-SG'] },
  { id: 'micro', name: 'Microbiology & QC', w: { consumables: 4, equipment: 2, safety: 2, chemicals: 1 }, p: ['TS-5100-PD', 'TS-9400-BSC', 'TS-C100-PBS', 'TS-9700-MS', 'TS-S001-NG', 'TS-1105-05'] },
  { id: 'gowning', name: 'Gowning & contamination control', w: { cleanroom: 5, safety: 3, chemicals: 1 }, p: ['TS-R005-WP', 'TS-R020-CV', 'TS-R030-IPA', 'TS-R040-TM', 'TS-R050-SC', 'TS-S001-NG'] },
  { id: 'storage', name: 'Sample storage & shipping', w: { coldchain: 5, consumables: 3 }, p: ['TS-K080-ULT', 'TS-K300-CB', 'TS-6002-CV', 'TS-K100-DS', 'TS-K200-DL', 'TS-K004-LR'] },
  { id: 'collection', name: 'Specimen & evidence collection', w: { consumables: 4, safety: 3, coldchain: 1 }, p: ['TS-6510-SW', 'TS-S001-NG', 'TS-S040-LC', 'TS-3050-50', 'TS-K100-DS', 'TS-9700-MS'] },
];
const NEEDS = [
  { id: 'sterile', name: 'Sterile / certified', svc: null, note: 'Sterile and certified lines are flagged; lot and CoA ride on every shipment.' },
  { id: 'docs', name: 'GMP / CLIA documents', svc: 'Document center', note: 'CoA and SDS attach to each order line for audits.' },
  { id: 'iso', name: 'ISO-class cleanroom', svc: 'Gowning-room VMI', note: 'ISO 5–8 lines and gowning-room replenishment from Northeast cleanroom specialists.' },
  { id: 'cold', name: 'Cold chain', svc: 'Cold-chain logistics', note: 'Dry-ice shippers and data loggers ship with temperature-sensitive lines.' },
  { id: 'kit', name: 'Custom kits', svc: 'Kitting', note: 'Your protocol packed under one catalog number.' },
  { id: 'punch', name: 'Punchout / ePro', svc: 'Punchout & eProcurement', note: 'Order inside Coupa, Ariba or Jaggaer with contract pricing.' },
  { id: 'vmi', name: 'Someone else counts', svc: 'Vendor-managed inventory', note: 'We own the min/max and replenish on a schedule.' },
];
const VERT_FLOW = { research: 'culture', biopharma: 'micro', clinical: 'collection', cleanroom: 'gowning', cannabis: 'chrom', forensics: 'collection' };
function wireFinder() {
  const st = { vert: 'clinical', flow: 'collection', need: new Set(['docs', 'vmi']) };
  const box = $('[data-finder]'), out = $('[data-finder-out]');
  const pill = (k, o, on) => `<button type="button" class="pill${on ? ' on' : ''}" data-k="${k}" data-v="${o.id}" aria-pressed="${on}">${esc(o.name)}</button>`;
  const drawPills = () => {
    $('[data-f="vert"]', box).innerHTML = VERTICALS.map(o => pill('vert', o, st.vert === o.id)).join('');
    $('[data-f="flow"]', box).innerHTML = FLOWS.map(o => pill('flow', o, st.flow === o.id)).join('');
    $('[data-f="need"]', box).innerHTML = NEEDS.map(o => pill('need', o, st.need.has(o.id))).join('');
  };
  const draw = () => {
    const f = FLOWS.find(x => x.id === st.flow), v = VERTICALS.find(x => x.id === st.vert);
    const w = { ...f.w }; if (st.need.has('iso')) w.cleanroom = (w.cleanroom || 0) + 3; if (st.need.has('cold')) w.coldchain = (w.coldchain || 0) + 3;
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    const bars = Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const c = catById(k); return `<div class="fb"><span>${c.sym} · ${c.name}</span><i style="--w:${Math.round(n / tot * 100)}%;--h:${c.hue}"></i><b class="mono">${Math.round(n / tot * 100)}%</b></div>`; }).join('');
    let picks = f.p.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    if (st.need.has('iso') && !picks.some(p => p.cat === 'cleanroom')) picks = [PRODUCTS.find(p => p.id === 'TS-R005-WP'), ...picks].slice(0, 6);
    if (st.need.has('cold') && !picks.some(p => p.cat === 'coldchain')) picks = [...picks.slice(0, 5), PRODUCTS.find(p => p.id === 'TS-K200-DL')];
    const svcs = NEEDS.filter(n => st.need.has(n.id));
    const S = SITES || SITES_FALLBACK; const like = v.siteKey.reduce((a, k) => a + (S.vertical[k] || 0), 0);
    out.innerHTML = `<div class="fo-h"><p class="kicker">Your starter list</p><h3>${esc(v.name)} · ${esc(f.name)}</h3><p class="muted">${esc(v.fix)}</p></div>
      <div class="fo-sec"><h4>Category mix</h4>${bars}</div>
      <div class="fo-sec"><h4>Start with these lines</h4><ul class="fo-p">${picks.map(p => `<li><span class="mono">${esc(p.id)}</span><b>${esc(p.name)}</b>${stockBadge(p)}<button class="res-add" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)}">Add</button></li>`).join('')}</ul></div>
      ${svcs.length ? `<div class="fo-sec"><h4>Services for you</h4><ul class="fo-s">${svcs.map(n => `<li><b>${esc(n.svc || n.name)}</b><span>${esc(n.note)}</span></li>`).join('')}</ul></div>` : ''}
      <div class="fo-like"><span class="mono">${like ? num(like) : num(S.total)}</span><p>${like ? `${esc(v.likeLabel)} mapped in LabOS: labs like yours` : 'US lab sites mapped in LabOS across research, clinical and industry'}</p></div>
      <div class="fo-cta"><button class="btn btn-primary" data-add-all>Add all ${picks.length} to quote</button><a class="btn btn-ghost" href="#reps">Talk to your regional team</a></div>`;
    $('[data-add-all]', out).onclick = () => { picks.forEach(p => addToCart(p.id, 1, true)); toast(`<b>${picks.length} lines</b> added to your quote cart`); };
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('.pill'); if (!b) return; const { k, v } = b.dataset;
    if (k === 'need') st.need.has(v) ? st.need.delete(v) : st.need.add(v); else { st[k] = v; if (k === 'vert') st.flow = VERT_FLOW[v] || st.flow; }
    drawPills(); draw();
  });
  out.addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) addToCart(b.dataset.add); });
  drawPills(); draw();
  return { redraw: draw };
}

/* ── Services & verticals ───────────────────────────────────────────────── */
const ICON = {
  vmi: '<path d="M4 7h16v12H4z"/><path d="M4 11h16M9 7V4h6v3"/><path d="m9 15 2 2 4-4"/>',
  punch: '<path d="M4 5h9v14H4z"/><path d="M13 12h7m-3-3 3 3-3 3"/>',
  kit: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  standing: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  cold: '<path d="M12 3v18M5 7l14 10M19 7 5 17"/>',
  contract: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
};
const SERVICES = [
  { i: 'vmi', t: 'Vendor-managed inventory', d: 'We own min/max in the stockrooms you choose, count on a schedule and replenish automatically. Consignment for critical items.' },
  { i: 'punch', t: 'Punchout & eProcurement', d: 'Shop our catalog with your contract pricing inside Coupa, SAP Ariba or Jaggaer. cXML, OCI and EDI invoicing.' },
  { i: 'kit', t: 'Kitting & assembly', d: 'Specimen-collection, evidence and gowning kits built to your protocol and sold under one catalog number.' },
  { i: 'standing', t: 'Standing orders', d: 'Lot-controlled, scheduled shipments for the lines you never want to think about again.' },
  { i: 'cold', t: 'Cold-chain logistics', d: 'Dry-ice and insulated shippers with data loggers for frozen and 2–8 °C lines.' },
  { i: 'contract', t: 'Contract pricing & spend reports', d: 'One price file across sites, monthly usage reports and supplier-consolidation reviews.' },
];
function wireServices() {
  $('[data-services]').innerHTML = SERVICES.map(s => `<article class="sv card" data-reveal><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[s.i]}</svg><h3>${s.t}</h3><p>${s.d}</p></article>`).join('');
  $('[data-verticals]').innerHTML = VERTICALS.map((v, i) => `<article class="vt card" data-reveal><span class="vt-n mono">0${i + 1}</span><h3>${v.name}</h3><p class="vt-pain"><b>The job:</b> ${v.pain}</p><p><b>How we help:</b> ${v.fix}</p><button class="link" data-vfind="${v.id}">Build a starter list →</button></article>`).join('');
}

/* ── Rep match by state (aggregated ts_sites) ───────────────────────────── */
function loadSites() {
  if (!sitesPromise) sitesPromise = DataRef.load('ts_sites').then(rows => { SITES = aggregateSites(Array.isArray(rows) ? rows : rows.items || []); return SITES; }).catch(e => { console.warn('ts_sites unavailable:', e.message); return null; });
  return sitesPromise;
}
function wireReps(finder) {
  const map = $('[data-tilemap]'), sel = $('[data-rp-select]'), out = $('[data-rp-out]');
  const states = Object.keys(TILES);
  sel.innerHTML = states.slice().sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b])).map(s => `<option value="${s}">${STATE_NAMES[s]}</option>`).join('');
  $('[data-qt-state]').innerHTML = `<option value="">Select…</option>` + sel.innerHTML;
  map.innerHTML = states.map(s => { const [c, r] = TILES[s]; return `<button class="tile" data-st="${s}" style="grid-column:${c + 1};grid-row:${r + 1}" aria-label="${STATE_NAMES[s]}" aria-pressed="false">${s}</button>`; }).join('');
  let cur = 'NJ';
  const RAMP = ['#eef3f6', '#cfe9e5', '#9fd3cb', '#5fb5aa', '#157a74', '#075a56'];
  const shade = () => {
    if (!SITES) return; const vals = states.map(s => SITES.by[s]?.n || 0).filter(Boolean).sort((a, b) => a - b);
    const q = [.2, .4, .6, .8].map(f => vals[Math.floor(f * (vals.length - 1))]);
    $$('.tile', map).forEach(t => { const n = SITES.by[t.dataset.st]?.n || 0; const b = n ? 1 + q.filter(x => n > x).length : 0; t.style.background = RAMP[b]; t.classList.toggle('dark', b >= 4); t.title = `${STATE_NAMES[t.dataset.st]}: ${num(n)} lab sites mapped`; t.setAttribute('aria-label', `${STATE_NAMES[t.dataset.st]}, ${num(n)} lab sites mapped`); });
    $('[data-rp-legend]').innerHTML = `<span>Lab sites</span>${RAMP.slice(1).map((c, i) => `<i style="background:${c}"></i>`).join('')}<span class="mono">${num(vals[0])}–${num(vals[vals.length - 1])}</span>`;
    drawRegions();
  };
  const regBox = $('[data-rp-regions]');
  const drawRegions = () => {
    regBox.innerHTML = `<h4>Regional teams</h4><div class="rg">${REGIONS.map(r => { const n = SITES ? r.states.reduce((a, s) => a + (SITES.by[s]?.n || 0), 0) : null; const on = r.states.includes(cur); return `<button class="rg-b${on ? ' on' : ''}" data-reg="${r.id}"><b>${esc(r.name)}</b><span class="mono">${n != null ? num(n) + ' sites' : r.states.length + ' states'}</span></button>`; }).join('')}</div>`;
  };
  regBox.addEventListener('click', e => { const b = e.target.closest('[data-reg]'); if (!b) return; const r = REGIONS.find(x => x.id === b.dataset.reg); cur = SITES ? r.states.slice().sort((a, c) => (SITES.by[c]?.n || 0) - (SITES.by[a]?.n || 0))[0] : r.states[0]; draw(); });
  map.addEventListener('mouseover', e => { const t = e.target.closest('.tile'); const r = t && regionOf(t.dataset.st); $$('.tile', map).forEach(x => x.classList.toggle('reg', !!r && r.states.includes(x.dataset.st))); });
  map.addEventListener('mouseleave', () => $$('.tile', map).forEach(x => x.classList.remove('reg')));
  const draw = () => {
    $$('.tile', map).forEach(t => { const on = t.dataset.st === cur; t.classList.toggle('on', on); t.setAttribute('aria-pressed', on); });
    sel.value = cur; const reg = regionOf(cur); drawRegions();
    const d = SITES?.by[cur]; const rank = SITES ? states.slice().sort((a, b) => (SITES.by[b]?.n || 0) - (SITES.by[a]?.n || 0)).indexOf(cur) + 1 : null;
    const vm = d ? Object.entries(d.vert).sort((a, b) => b[1] - a[1]) : [];
    const am = d ? Object.entries(d.arche).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
    const regSites = SITES ? reg.states.reduce((a, s) => a + (SITES.by[s]?.n || 0), 0) : null;
    out.innerHTML = `<p class="kicker">Your regional team <span class="illus">Illustrative</span></p>
      <h3>${esc(reg.name)} lab team</h3>
      <p class="muted">Serving ${esc(STATE_NAMES[cur])} · ${reg.states.length} states and territories</p>
      <div class="rp-team">${['Account manager', 'Lab specialist', 'Cleanroom & safety specialist'].map((r, i) => `<div><span class="av" aria-hidden="true">${['AM', 'LS', 'CS'][i]}</span><b>${r}</b><small>${['Pricing, punchout, VMI', 'Equipment & workflows', 'ISO-class, PPE, gowning'][i]}</small></div>`).join('')}</div>
      <dl class="rp-kv"><div><dt>Hub</dt><dd>${esc(reg.hub)}</dd></div><div><dt>Regional focus</dt><dd>${esc(reg.focus)}</dd></div></dl>
      ${SITES ? `<div class="rp-num"><div><b class="mono">${num(d?.n || 0)}</b><span>lab sites mapped in ${esc(STATE_NAMES[cur])}${rank ? ` · #${rank} of ${states.length}` : ''}</span></div><div><b class="mono">${num(regSites)}</b><span>across the ${esc(reg.name)} region</span></div></div>
      ${vm.length ? `<h4>Lab mix in ${esc(cur)}</h4><div class="rp-bars">${vm.slice(0, 5).map(([k, n]) => `<div class="fb"><span>${esc(k)}</span><i style="--w:${Math.max(2, Math.round(n / d.n * 100))}%"></i><b class="mono">${num(n)}</b></div>`).join('')}</div>` : ''}
      ${am.length ? `<p class="rp-arche"><b>Most common lab profiles:</b> ${am.map(([k]) => esc(k.toLowerCase())).join(' · ')}</p>` : ''}` : `<div class="skel"><i></i><i></i><i></i><span>Loading the lab-site map…</span></div>`}
      <div class="fo-cta"><a class="btn btn-primary" href="#quote" data-rp-call>Request a call</a><a class="btn btn-ghost" href="#services">Set up punchout</a></div>`;
    $('[data-rp-call]', out).onclick = () => { const s = $('[data-qt-state]'); if (s) s.value = cur; };
  };
  map.addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) { cur = t.dataset.st; draw(); } });
  sel.addEventListener('change', () => { cur = sel.value; draw(); });
  draw();
  const go = () => loadSites().then(S => { if (!S) { out.querySelector('.skel')?.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Lab-site map unavailable right now.' })); return; } shade(); draw(); finder.redraw(); $$('[data-stat="sites"]').forEach(e => e.textContent = num(S.total)); $$('[data-stat="parents"]').forEach(e => e.textContent = num(S.parents)); });
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '900px 0px' }); io.observe($('#reps')); setTimeout(() => { io.disconnect(); go(); }, 2500); } else go();
}

/* ── Design rationale (design_refs.json) ────────────────────────────────── */
const REF_USE = {
  'ref-ts-mcmaster': { where: 'Periodic-table category index and a stock badge on every line', kpi: 'Time-to-SKU under 30 s; search exit rate; cart abandonment' },
  'ref-ts-fisher': { where: 'Quick order card in the hero; CoA & SDS in the utility bar; workflow-based finder', kpi: 'Share of orders via quick order; clicks per reorder; document support tickets' },
  'ref-ts-vwr': { where: 'Search that accepts CAS and catalog numbers; LabOS in primary nav; running quote cart', kpi: 'Search-to-cart conversion; punchout-connected accounts; switching orders won' },
  'ref-ts-calibre': { where: 'Industry sections and the 125-year heritage band, separate from the shop flow', kpi: 'A diversified end-market story for lenders and buyers; inbound add-on conversations' },
};
async function wireRationale() {
  const host = $('[data-refs]');
  const d = await DataRef.research('research/design_refs');
  let refs = (d?.items || []).filter(i => i.applies_to === 'ts' || (Array.isArray(i.applies_to) && i.applies_to.includes('ts')));
  const order = ['ref-ts-mcmaster', 'ref-ts-fisher', 'ref-ts-vwr', 'ref-ts-calibre'];
  refs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (!refs.length) { host.innerHTML = `<p class="muted">Reference dataset unavailable. Inspirations: McMaster-Carr (category index), Fisher Scientific (quick order, documents), VWR/Avantor (part-number search, e-procurement), Calibre Scientific (segment story).</p>`; }
  else host.innerHTML = refs.map(r => { const u = REF_USE[r.id] || {}; const el = (r.elements_to_borrow || []).slice(0, 2); return `<article class="ref card"><div class="ref-h"><h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></h3><span>${esc(String(r.owner_or_backer || '').split(';')[0].split('(')[0])}</span></div><p class="ref-why">${esc(String(r.why_it_is_a_reference || '').split('. ').slice(0, 2).join('. ').replace(/\.+$/, ''))}.</p><ul>${el.map(e => `<li><b>${esc(e.element)}</b><span>${esc(e.what_it_does_for_conversion_or_valuation)}</span></li>`).join('')}</ul><div class="ref-use"><div><small>On this page</small><p>${esc(u.where || '')}</p></div><div><small>KPI it should move</small><p>${esc(u.kpi || '')}</p></div></div></article>`; }).join('');
  const ev = await DataRef.research('research/serviceos_evidence');
  const it = id => (ev?.items || []).find(x => x.id === id);
  const k1 = it('kb-ts-1'), k2 = it('kb-ts-2'), k3 = it('kb-ts-3');
  const kp = [
    { v: k1 ? `${k1.target}%` : '80%', l: 'Digital share of transactions: the bar to clear', s: 'Avantor FY2025 10-K', u: k1?.source_url },
    { v: k2 ? `${k2.target}%` : '40%', l: 'eProcurement share of connected orders', s: 'Grainger Q4 2025', u: k2?.source_url },
    { v: k3 ? `${k3.target}% vs ${k3.baseline}%` : '15.6% vs 2.1%', l: 'Digital vs rep-led channel growth', s: 'Grainger FY2025', u: k3?.source_url },
    { v: '< 30 s', l: 'Time-to-SKU target for this design', s: 'est. design target', u: null },
  ];
  $('[data-dr-kpis]').innerHTML = `<h3>KPIs this site is built to move</h3><div class="kp">${kp.map(k => `<div><b class="mono">${esc(k.v)}</b><span>${esc(k.l)}</span><small>${k.u ? `<a href="${esc(k.u)}" target="_blank" rel="noopener">${esc(k.s)}</a>` : esc(k.s)}</small></div>`).join('')}</div><p class="muted">Thomas Scientific's own digital share is not disclosed (a data gap in the evidence file); LabOS instruments it from day one.</p>`;
}

/* ── FAQ, quote form, nav ───────────────────────────────────────────────── */
function wireFaq() {
  $('[data-faq]').innerHTML = FAQ.map((f, i) => `<details class="fq"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<i aria-hidden="true"></i></summary><div class="fq-a">${f.a}</div></details>`).join('');
}
function wireQuote() {
  const f = $('[data-quote]');
  f.addEventListener('submit', e => {
    e.preventDefault(); const name = f.name.value.trim(), email = f.email.value.trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Add your name and a valid work email'); (!name ? f.name : f.email).focus(); return; }
    const reg = f.state.value ? regionOf(f.state.value) : null;
    toast(`<b>Concept only:</b> nothing was sent. In production, ${reg ? esc(reg.name) : 'your regional'} team would reply with pricing for ${cart.size || 'your'} line${cart.size === 1 ? '' : 's'}.`);
  });
  $('[data-cart-quote]').onclick = () => { closeDrawer(); const ta = f.need; if (cart.size && !ta.value) ta.value = [...cart].map(([id, q]) => `${id} × ${q}`).join('\n'); };
}
function wireNav() {
  const btn = $('[data-menu]'), nav = $('.hnav');
  btn.onclick = () => { const on = !nav.classList.contains('open'); nav.classList.toggle('open', on); btn.setAttribute('aria-expanded', on); };
  nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  const hdr = $('.hdr'); const on = () => hdr.classList.toggle('scrolled', scrollY > 8); addEventListener('scroll', on, { passive: true }); on();
}

export function init({ Data, Chat }) {
  DataRef = Data;
  banner();
  $$('[data-logo]').forEach(e => e.innerHTML = LOGO);
  $$('[data-scope]').forEach(s => s.innerHTML += CATS.map(c => `<option value="${c.id}">${c.name}</option>`).join(''));
  loadCart(); renderCart();
  const searches = $$('[data-search]').map(wireSearch);
  $$('.trend [data-q]').forEach(b => b.onclick = () => searches[1].set(b.dataset.q));
  wireQuick(); wireTable(); wireServices();
  const finder = wireFinder();
  $('[data-verticals]').addEventListener('click', e => { const b = e.target.closest('[data-vfind]'); if (!b) return; const pb = $(`.pill[data-k="vert"][data-v="${b.dataset.vfind}"]`); pb && pb.click(); $('#finder').scrollIntoView({ behavior: 'smooth' }); });
  wireReps(finder); wireFaq(); wireQuote(); wireNav();
  $$('[data-cart-open]').forEach(b => b.onclick = openDrawer); $('[data-cart-close]').onclick = closeDrawer; $('[data-scrim]').onclick = closeDrawer;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  wireRationale();
  reveal();
  mountChat(Chat);
}
