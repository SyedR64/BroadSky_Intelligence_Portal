/* Fair Harbor concept — shared pieces for index.html and harboros.html:
   SVG product art, the illustrative fit model, chat FAQ/suggestions/intents, banner + nav behaviour. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

/* ── Palette of colourways used by the product art ─────────────────────── */
export const COLORS = {
  navy:   { name: 'Harbor Navy', base: '#1E3550', accent: '#F4EFE6', band: '#14263B', family: 'navy' },
  sea:    { name: 'Sea Glass',   base: '#2C8C99', accent: '#CFEAEE', band: '#1F6B76', family: 'sea' },
  sunset: { name: 'Sunset',      base: '#E8684A', accent: '#FBD9B4', band: '#B94E35', family: 'sunset' },
  sand:   { name: 'Dune',        base: '#E9DCC4', accent: '#C9B48F', band: '#BFA77E', family: 'sand' },
  palm:   { name: 'Palm Green',  base: '#3E6B57', accent: '#A8CDB5', band: '#2C4F40', family: 'palm' },
  sky:    { name: 'Sky',         base: '#9CC9DA', accent: '#EAF5F8', band: '#6FA6BA', family: 'sky' },
  white:  { name: 'Salt White',  base: '#F7F4EE', accent: '#8FBFCF', band: '#DAD3C6', family: 'sand' },
  coral:  { name: 'Coral Stripe', base: '#F3EDE3', accent: '#E8684A', band: '#C9553B', family: 'sunset' },
};

let uid = 0;
function pattern(id, print, c) {
  const b = c.base, a = c.accent;
  switch (print) {
    case 'stripe': return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${b}"/><rect width="6" height="16" fill="${a}"/></pattern>`;
    case 'hstripe': return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${b}"/><rect width="14" height="5" fill="${a}"/></pattern>`;
    case 'pin': return `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${b}"/><rect width="1.6" height="9" fill="${a}"/></pattern>`;
    case 'palm': { const leaf = (x, y, r, sc) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${sc})"><path d="M0 0 Q9 -9 22 -12" fill="none" stroke="${a}" stroke-width="1.6" stroke-linecap="round"/>${[0.2, 0.36, 0.52, 0.68, 0.84].map(t => { const px = 22 * t * (1.1 - t * 0.1), py = -12 * t * t - 3 * t; return `<path d="M${px.toFixed(1)} ${py.toFixed(1)} l${(-2 - 4 * (1 - t)).toFixed(1)} ${(-6 - 3 * (1 - t)).toFixed(1)} M${px.toFixed(1)} ${py.toFixed(1)} l${(5 + 3 * (1 - t)).toFixed(1)} ${(3 + 2 * (1 - t)).toFixed(1)}" stroke="${a}" stroke-width="2.2" stroke-linecap="round"/>`; }).join('')}</g>`;
      return `<pattern id="${id}" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-10)"><rect width="56" height="56" fill="${b}"/>${leaf(6, 30, -8, 1)}${leaf(32, 54, -40, .8)}${leaf(30, 18, 20, .7)}<circle cx="48" cy="8" r="1.8" fill="${a}" opacity=".6"/></pattern>`; }
    case 'wave': return `<pattern id="${id}" width="24" height="14" patternUnits="userSpaceOnUse"><rect width="24" height="14" fill="${b}"/><path d="M0 9 Q6 3 12 9 T24 9" fill="none" stroke="${a}" stroke-width="2"/></pattern>`;
    case 'dot': return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${b}"/><circle cx="7" cy="7" r="2.1" fill="${a}"/></pattern>`;
    case 'gingham': return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${b}"/><rect width="6" height="12" fill="${a}" opacity=".5"/><rect width="12" height="6" fill="${a}" opacity=".5"/></pattern>`;
    default: return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${b}"/></pattern>`;
  }
}
const shade = id => `<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".22" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;

/** Inline SVG product illustration. kind: trunk | anchor | board | kids | camp | linen | polo | henley | short */
export function art(kind, colorKey = 'navy', print = 'solid', label = '') {
  const c = COLORS[colorKey] || COLORS.navy; const id = `fh${++uid}`; const p = `${id}p`, s = `${id}s`;
  const defs = `<defs>${pattern(p, print, c)}${shade(s)}</defs>`;
  const shadow = (rx = 80) => `<ellipse cx="120" cy="222" rx="${rx}" ry="7" fill="#0F2733" opacity=".10"/>`;
  let g = '';
  if (['trunk', 'anchor', 'board', 'kids', 'short'].includes(kind)) {
    const hem = { trunk: 176, kids: 170, anchor: 190, short: 194, board: 206 }[kind];
    const crotch = { trunk: 126, kids: 124, anchor: 132, short: 134, board: 140 }[kind];
    const w = kind === 'kids' ? 0.82 : 1; const top = kind === 'kids' ? 70 : 62;
    const X = x => 120 + (x - 120) * w;
    const flare = kind === 'board' ? 4 : kind === 'short' ? 6 : 10;
    const body = `M${X(52)} ${top} L${X(188)} ${top} C${X(191)} ${top + 30} ${X(186 + flare)} ${hem - 40} ${X(188 + flare)} ${hem} Q${X(160)} ${hem + 8} ${X(126)} ${hem} Q${X(123)} ${crotch + 14} 120 ${crotch} Q${X(117)} ${crotch + 14} ${X(114)} ${hem} Q${X(80)} ${hem + 8} ${X(52 - flare)} ${hem} C${X(54 - flare)} ${hem - 40} ${X(49)} ${top + 30} ${X(52)} ${top} Z`;
    const waist = kind === 'short'
      ? `<rect x="${X(50)}" y="${top - 20}" width="${140 * w}" height="22" rx="4" fill="${c.band}"/><g stroke="#0F2733" stroke-opacity=".25">${[64, 92, 148, 176].map(x => `<rect x="${X(x) - 2}" y="${top - 21}" width="4" height="24" rx="1" fill="${c.band}"/>`).join('')}</g>`
      : `<rect x="${X(50)}" y="${top - 22}" width="${140 * w}" height="24" rx="7" fill="${c.band}"/><path d="M${X(54)} ${top - 4} H${X(186)}" stroke="#fff" stroke-opacity=".35" stroke-dasharray="3 3"/>`;
    const strings = kind === 'short' ? `<rect x="${X(140)}" y="${top + 6}" width="${22 * w}" height="${16 * w}" rx="2" fill="none" stroke="#0F2733" stroke-opacity=".22"/>`
      : kind === 'board' ? `<path d="M120 ${top - 2} L120 ${top + 40}" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/><path d="M114 ${top + 2} C104 ${top + 22} 100 ${top + 34} 96 ${top + 50}M126 ${top + 2} C136 ${top + 22} 140 ${top + 34} 145 ${top + 48}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M115 ${top - 10} C110 ${top + 10} 108 ${top + 22} 104 ${top + 36}M125 ${top - 10} C130 ${top + 10} 133 ${top + 20} 138 ${top + 32}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="104" cy="${top + 37}" r="3" fill="#fff"/><circle cx="138" cy="${top + 33}" r="3" fill="#fff"/>`;
    const seams = `<path d="M${X(57)} ${top + 2} L${X(50 - flare + 4)} ${hem - 2}M${X(183)} ${top + 2} L${X(190 + flare - 4)} ${hem - 2}" stroke="#0F2733" stroke-opacity=".14" stroke-width="1.5"/><path d="M120 ${top + 2} L120 ${crotch - 6}" stroke="#0F2733" stroke-opacity=".2" stroke-dasharray="3 3"/>`;
    const hemline = `<path d="M${X(52 - flare)} ${hem} Q${X(80)} ${hem + 7} ${X(114)} ${hem}M${X(126)} ${hem} Q${X(160)} ${hem + 7} ${X(188 + flare)} ${hem}" fill="none" stroke="#0F2733" stroke-opacity=".22" stroke-width="2"/>`;
    const tag = `<rect x="${X(168)}" y="${hem - 26}" width="12" height="9" rx="1.5" fill="${c.band}" opacity=".9"/>`;
    g = `${shadow(kind === 'kids' ? 60 : 80)}<path d="${body}" fill="url(#${p})"/><path d="${body}" fill="url(#${s})"/>${seams}${hemline}${tag}${waist}${strings}`;
  } else {
    // tops: camp collar, linen button-down, polo, henley
    const body = kind === 'camp' || kind === 'linen'
      ? 'M78 46 L102 34 Q120 46 138 34 L162 46 L212 76 L196 118 L174 108 L174 208 Q120 216 66 208 L66 108 L44 118 L28 76 Z'
      : 'M84 42 Q120 60 156 42 L206 68 L192 108 L172 100 L172 208 Q120 216 68 208 L68 100 L48 108 L34 68 Z';
    const sleeves = kind === 'camp' || kind === 'linen' ? `<path d="M191 113 L206 78M49 113 L34 78" stroke="#0F2733" stroke-opacity=".18" stroke-width="2"/>` : `<path d="M188 104 L201 71M52 104 L39 71" stroke="#0F2733" stroke-opacity=".18" stroke-width="2"/>`;
    let detail = '';
    if (kind === 'camp' || kind === 'linen') {
      const btn = [96, 122, 148, 174, 198].map(y => `<circle cx="120" cy="${y}" r="2.8" fill="#fff" stroke="#0F2733" stroke-opacity=".25"/>`).join('');
      detail = `<path d="M120 72 L120 210" stroke="#0F2733" stroke-opacity=".22" stroke-width="1.5"/>${btn}<path d="M102 34 L120 72 L106 82 L86 46 Z" fill="${c.band}" opacity=".55"/><path d="M138 34 L120 72 L134 82 L154 46 Z" fill="${c.band}" opacity=".55"/>${kind === 'camp' ? `<rect x="136" y="104" width="26" height="28" rx="2" fill="none" stroke="#0F2733" stroke-opacity=".22" stroke-width="1.5"/>` : `<path d="M140 102 h22" stroke="#0F2733" stroke-opacity=".18" stroke-width="1.5"/>`}`;
    } else if (kind === 'polo') {
      detail = `<path d="M84 42 L120 60 L104 74 L80 52 Z M156 42 L120 60 L136 74 L160 52 Z" fill="${c.band}"/><rect x="114" y="60" width="12" height="40" rx="2" fill="none" stroke="#0F2733" stroke-opacity=".22"/><circle cx="120" cy="72" r="2.6" fill="#fff"/><circle cx="120" cy="88" r="2.6" fill="#fff"/><path d="M68 200 Q120 208 172 200" stroke="${c.band}" stroke-width="4" fill="none" opacity=".6"/>`;
    } else {
      detail = `<path d="M84 42 Q120 60 156 42" fill="none" stroke="${c.band}" stroke-width="6"/><rect x="114" y="56" width="12" height="40" rx="2" fill="none" stroke="#0F2733" stroke-opacity=".22"/>${[66, 78, 90].map(y => `<circle cx="120" cy="${y}" r="2.4" fill="#fff" stroke="#0F2733" stroke-opacity=".25"/>`).join('')}`;
    }
    g = `${shadow(70)}<path d="${body}" fill="url(#${p})"/><path d="${body}" fill="url(#${s})"/>${sleeves}${detail}`;
  }
  return `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(label || `${c.name} ${kind}`)}" focusable="false">${defs}${g}</svg>`;
}

/* ── Catalog (illustrative names/prices; $88 median swim price per the live catalog snapshot, Sept 2026) ── */
export const PRODUCTS = [
  { id: 'bayberry', name: 'The Bayberry Trunk', kind: 'trunk', cat: ['swim'], price: 88, meta: '5.5" inseam · BreezeKnit liner', badge: 'Bestseller', bottles: 11,
    ways: [['navy', 'stripe'], ['sea', 'palm'], ['sunset', 'solid'], ['sand', 'wave']] },
  { id: 'anchor', name: 'The Anchor Trunk', kind: 'anchor', cat: ['swim'], price: 88, meta: '7" inseam · BreezeKnit liner', badge: null, bottles: 11,
    ways: [['sea', 'solid'], ['navy', 'dot'], ['palm', 'palm'], ['sky', 'wave']] },
  { id: 'breakwater', name: 'The Breakwater Boardshort', kind: 'board', cat: ['swim'], price: 98, meta: '9" inseam · lace-up fly · no liner', badge: 'Surf', bottles: 14,
    ways: [['navy', 'solid'], ['sunset', 'hstripe'], ['palm', 'solid']] },
  { id: 'camp', name: 'The Harbor Camp Shirt', kind: 'camp', cat: ['shirts'], price: 98, meta: 'Recycled-poly blend · camp collar', badge: 'New', bottles: 8,
    ways: [['white', 'palm'], ['sky', 'solid'], ['coral', 'pin'], ['navy', 'dot']] },
  { id: 'linen', name: 'The Dune Linen Button-Down', kind: 'linen', cat: ['shirts'], price: 118, meta: 'Linen-cotton · relaxed', badge: null, bottles: 0,
    ways: [['sand', 'solid'], ['sky', 'pin'], ['white', 'solid']] },
  { id: 'polo', name: 'The Cape Polo', kind: 'polo', cat: ['shirts', 'golf'], price: 88, meta: 'Quick-dry piqué · golf-ready', badge: 'Golf', bottles: 9,
    ways: [['navy', 'solid'], ['white', 'solid'], ['palm', 'solid'], ['coral', 'hstripe']] },
  { id: 'hybrid', name: 'The Fairway Hybrid Short', kind: 'short', cat: ['golf', 'swim'], price: 88, meta: '7" · swim-to-tee hybrid', badge: null, bottles: 10,
    ways: [['sand', 'solid'], ['navy', 'solid'], ['palm', 'solid']] },
  { id: 'kids', name: 'The Kids Bayberry', kind: 'kids', cat: ['swim', 'kids'], price: 58, meta: 'Sizes 2T–14 · liner', badge: 'Kids', bottles: 6,
    ways: [['sunset', 'palm'], ['sea', 'stripe'], ['navy', 'wave']] },
];

/* ── Illustrative fit model (concept) ──────────────────────────────────── */
export const SIZES = [
  { s: 'S', lo: 28, hi: 30.5 }, { s: 'M', lo: 30.5, hi: 33.5 }, { s: 'L', lo: 33.5, hi: 36.5 }, { s: 'XL', lo: 36.5, hi: 39.5 }, { s: 'XXL', lo: 39.5, hi: 43 },
];
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = (x, m, sd) => 0.5 * (1 + erf((x - m) / (sd * Math.SQRT2)));
/** heightIn, weightLb, waistIn (optional), fit: relaxed|true|trim, use: laps|beach|surf */
export function recommend({ heightIn = 70, weightLb = 175, waistIn = null, fit = 'true', use = 'beach' }) {
  const est = 12.6 + 0.118 * weightLb - 0.085 * (heightIn - 70);
  const waist = waistIn ? waistIn * 0.75 + est * 0.25 : est;
  const shift = fit === 'relaxed' ? 0.8 : fit === 'trim' ? -0.7 : 0;
  const m = waist + shift; const sd = waistIn ? 0.75 : 1.15;
  const probs = SIZES.map((z, i) => ({ size: z.s, p: cdf(i === SIZES.length - 1 ? 99 : z.hi, m, sd) - cdf(i === 0 ? -99 : z.lo, m, sd) }));
  const best = probs.reduce((a, b) => (b.p > a.p ? b : a));
  const inseam = use === 'surf' ? 9 : use === 'laps' ? 5.5 : heightIn >= 73 ? 7 : 5.5;
  const product = inseam === 9 ? 'The Breakwater Boardshort' : inseam === 7 ? 'The Anchor Trunk' : 'The Bayberry Trunk';
  const top = Math.min(4, Math.max(0, Math.round((weightLb - 125) / 28 + (heightIn - 69) / 6 + (fit === 'relaxed' ? 0.3 : fit === 'trim' ? -0.3 : 0))));
  const second = probs.filter(x => x !== best).reduce((a, b) => (b.p > a.p ? b : a));
  const notes = [];
  if (second.p > 0.28) notes.push(`You sit between ${best.size} and ${second.size}. ${SIZES.findIndex(z => z.s === second.size) > SIZES.findIndex(z => z.s === best.size) ? `Size up to ${second.size} if you like room in the seat` : `Size down to ${second.size} if you plan to swim laps`}; the elastic back waist covers the rest.`);
  else notes.push(`Strong match. ${best.size} fits a ${SIZES.find(z => z.s === best.size).lo}–${SIZES.find(z => z.s === best.size).hi}" waist.`);
  notes.push(inseam === 9 ? 'Boardshorts have no liner and a lace-up fly, so they stay put in surf.' : inseam === 7 ? 'At your height the 7" Anchor lands just above the knee.' : 'The 5.5" Bayberry sits mid-thigh and pairs with the BreezeKnit liner.');
  return { size: best.size, confidence: best.p, probs, waist: m, inseam, product, top: SIZES[top].s, notes };
}

/* ── Chat: FAQ, suggestions, intents ───────────────────────────────────── */
export const FAQ = [
  { q: 'How do the swim trunks fit? Do they run true to size?', a: '<p>Our trunks run <b>true to waist size</b> with an elastic back waistband and a drawcord. S fits a 28–30" waist, M 31–33", L 34–36", XL 37–39". Between sizes? Try the <a href="./#fit">fit finder</a>. <i>Concept size chart.</i></p>', href: './#fit' },
  { q: 'What are the swim trunks made of? Recycled plastic bottles?', a: '<p>The shell of our core trunks is spun from <b>recycled plastic bottles</b>, roughly <b>11 bottles per pair</b>. Bottles are cleaned, melted and spun into quick-dry yarn. Each product page lists its fibres.</p>' },
  { q: 'What is the BreezeKnit liner? Is it anti-chafe?', a: '<p>BreezeKnit is our <b>anti-chafe liner</b>: a soft, stretchy knit in place of the usual scratchy mesh. It lives in the Bayberry and Anchor trunks. Boardshorts skip the liner so you can wear your own base layer in surf.</p>' },
  { q: 'What is the return and exchange policy?', a: '<p><b>Free exchanges</b> on every US order, and returns within <b>30 days</b> of delivery for unworn items with tags (swim liners must be intact). Exchanges ship when the carrier scans your box. <i>Proposed policy.</i></p>' },
  { q: 'How much is shipping and how long does it take?', a: '<p>Free standard shipping on US orders over <b>$100</b>; most orders ship in <b>1–2 business days</b> and arrive in 3–5. Expedited options are shown at checkout. We currently ship within the United States only. <i>Proposed policy for this concept.</i></p>' },
  { q: 'Do you sell wholesale? How do I become a stockist?', a: '<p>Yes. Fair Harbor is carried by department stores, <b>250+ specialty surf, resort and coastal shops</b>, sporting-goods retailers, golf pro shops and campus stores. Store buyers can browse line sheets, pre-book and reorder in the <a href="./harboros.html#demo">wholesale portal</a> (demo).</p>', href: './harboros.html#demo' },
  { q: 'Do you do custom or corporate orders with logos and embroidery?', a: '<p>Yes. Our <b>B2B custom program</b> covers trunks, shirts, shorts and sweatshirts with custom embroidery for companies, clubs, weddings and events. Tell the helper your quantity and date, or email the team from the contact link in the footer.</p>' },
  { q: 'Is Fair Harbor a B Corp? What is your sustainability commitment?', a: '<p>Fair Harbor Clothing is a <b>Public Benefit Corporation</b> and a <b>Certified B Corporation</b> (B Impact score <b>94.3</b>; 80 qualifies). The brand reports <b>27M+ plastic bottles</b> recycled into its products.</p>' },
  { q: 'Where are your stores? Can I try trunks on in person?', a: '<p>Visit our own stores in <b>SoHo, New York</b> (Prince St) and <b>Palm Beach Gardens, Florida</b>, or find us at department stores, specialty shops, golf pro shops and campus stores.</p>' },
  { q: 'Do you make kids swim trunks? Matching family trunks?', a: '<p>Yes: the <b>Kids Bayberry</b> comes in sizes 2T–14 with a soft liner, in prints that match the adult trunks.</p>' },
  { q: 'How should I wash and care for my trunks?', a: '<p>Rinse in cold fresh water after salt or chlorine, machine wash cold on gentle, and hang dry in the shade. Skip fabric softener: it clogs the quick-dry finish.</p>' },
  { q: 'What is Pre-Loved / Harbor Again trade-in?', a: '<p><b>Harbor Again</b> (proposed) takes back worn Fair Harbor trunks for store credit. Good-condition pairs are cleaned and resold as Pre-Loved; the rest are recycled. It keeps the bottles in use one more summer.</p>' },
  { q: 'What is HarborOS?', a: '<p><b>HarborOS</b> is the operating system behind this site: AI fit and size, replenishment and retention flows, a wholesale B2B portal, inventory forecasting for the swim season and bottle-to-trunk traceability. It is BSP\'s tech-enablement thesis for Fair Harbor. <a href="./harboros.html">See the product page</a>.</p>', href: './harboros.html' },
  { q: 'Do you ship internationally to Canada or the UK?', a: '<p>Not yet: we ship within the United States today. International shipping to Canada, the UK and Australia is a <i>proposed</i> next step in this concept.</p>' },
];
export const SUGGESTIONS = ['What size am I? 5\'11", 180 lb, 34" waist', 'How many bottles are in one pair?', 'Where can I try them on?', 'Do you do custom team orders?', 'What is HarborOS?'];
const parseFit = q => {
  const ft = q.match(/(\d)\s*(?:'|ft|’)\s*(\d{1,2})?/); const lb = q.match(/(\d{2,3})\s*(?:lb|lbs|pounds)/i); const w = q.match(/(\d{2})\s*(?:"|”|in|inch)?\s*waist|waist\s*(?:of\s*)?(\d{2})/i);
  if (!lb && !w) return null;
  return { heightIn: ft ? +ft[1] * 12 + (+ft[2] || 0) : 70, weightLb: lb ? +lb[1] : null, waistIn: w ? +(w[1] || w[2]) : null };
};
export const INTENTS = [
  { id: 'fh_size', rx: [/\d{2,3}\s*(lb|lbs|pounds)|waist\s*(of\s*)?\d{2}|\d{2}\s*("|”|in|inch)?\s*waist/i], run: async q => {
    const f = parseFit(q); if (!f) return null; const r = recommend({ ...f, weightLb: f.weightLb || (f.waistIn ? (f.waistIn - 12.6) / 0.118 : 175) });
    return { html: `<h4>Your size: ${esc(r.size)} <span class="ch-badge">${Math.round(r.confidence * 100)}% confidence</span></h4><p>${esc(r.notes[0])}</p><p>Try <b>${esc(r.product)}</b> (${r.inseam}" inseam). For shirts, start with <b>${esc(r.top)}</b>.</p><div class="ch-src">Illustrative HarborOS fit model running in your browser; production would learn from Fair Harbor's own kept/returned orders.</div>`, links: [`<a class="ch-link" href="./#fit">Open the fit finder →</a>`] };
  } },
  { id: 'fh_bottles', rx: [/bottles?|plastic|recycl/i], run: async () => ({ html: '<p>Each pair of core trunks turns roughly <b>11 recycled plastic bottles</b> into fabric. Across the brand, Fair Harbor reports <b>27M+ bottles</b> recycled. The live counter on the home page shows our illustrative running total and the formula behind it.</p>', links: ['<a class="ch-link" href="./#impact">See the bottle counter →</a>'] }) },
];

/* ── Shared page behaviour (the frame itself comes from assets/frame.js) ── */
let FR = null;
export function setFrame(f) { FR = f || window.BSPFrame || null; }
/** Plain English from dataset strings: file paths become human dataset names, record ids are dropped. */
const ID_RX = /\b(?:fh|kb|ra|ve|vs|gl|lever|tpl|agent|fin|ref|rival|ph|tp|bsp|cat|risk|ask|tal|ai)-(?:[a-z]+-)*(?:[a-z0-9]*\d[a-z0-9]*\b|\*)(?:,?\.\.\d+)?|\bra-(?:bpi|fh|pp|cet|fl|ts)\b|\s?\bmeta\.[a-z_]+/g;
export function plain(str) {
  let t = String(str ?? '');
  t = t.replace(/(?:data\/(?:research\/|sales\/)?)?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\.(?:json|csv|geojson)/g, (m, id) => id === 'serviceos_evidence' ? 'OS program evidence' : FR ? FR.label(id) : id.replace(/_/g, ' '));
  t = t.replace(ID_RX, '').replace(/\(\s*[;,·]\s*/g, '(').replace(/\s*[;,·]\s*\)/g, ')').replace(/\(\s*[,;·\s]*\)/g, '').replace(/\s+([,.;)])/g, '$1').replace(/ {2,}/g, ' ');
  t = FR ? FR.humanizeText(t) : t;
  return t.replace(/ServiceOS evidence/g, 'OS program evidence').replace(/\s*\(\s*[,;·\s]*\)/g, '').trim();
}
export const ep = v => esc(plain(v));
export function chrome() {
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('[data-reveal]').forEach(el => { el.classList.add('rvl'); io.observe(el); });
  }
}
export function toast(msg) {
  let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
export const fmtMoney = n => '$' + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'K' : Math.round(n));
