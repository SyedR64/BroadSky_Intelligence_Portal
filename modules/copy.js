/* Portal copy helpers (UNIFIED.md §7): plain-English labels for dataset ids and
   record fields, the est. badge, and a post-render pass that turns the console's
   textual "est." markers into .sys-est badges. Module renderers call these at the
   source; Frame.humanize stays the safety net. */
import { Frame } from '../assets/frame.js?v=20261009155255';

export const EST = '<span class="sys-est">est.</span>';
export const ILLUS = '<span class="sys-est sys-est--illus">illustrative</span>';
export const LIVE = '<span class="sys-est sys-est--live">live</span>';

/** Extra names for datasets and sources the frame dictionary does not carry. */
const MORE = {
  pp_revenue_model: 'Punctual Pros revenue model', ts_distribution_centers: 'Thomas Scientific distribution centres', sector_heatmap: 'Sector heatmap',
  fh_opportunities: 'Fair Harbor opportunities', bpi_opportunities: 'BPI opportunities', sector_benchmarks: 'Sector benchmarks', industry_benchmark: 'Industry benchmark',
  cet_ne_rfps: 'New England public bids', sba_ppp: 'SBA Paycheck Protection loans', sec_form_d: 'SEC Form D', form_adv: 'SEC Form ADV', osha_dol: 'OSHA and Labor Department records',
  press_financial: 'press releases', enrich_companies: 'company enrichment', search_companies: 'company search', schedule_b: 'Schedule B', ma_targets: 'add-on target lists',
  financial_picture: 'financial picture', estimate_table: 'estimate table', manifest: 'dataset manifest', collections: 'product collections', products: 'product catalogue',
};
const SUFFIX = [
  [/_usd_m$/, ' ($M)'], [/_usd_k$/, ' ($K)'], [/_usd_000s$/, ' ($K)'], [/_usd_thousands$/, ' ($K)'], [/_usd_approx$/, ' ($, approx.)'], [/_usd_bn$/, ' ($B)'], [/_usd$/, ' ($)'], [/_gbp$/, ' (£)'], [/_gbp_(\d{4})$/, ' (£, $1)'],
  [/_pct$/, ' (%)'], [/_000s$/, ' (thousands)'], [/_mi$/, ' (miles)'], [/_yrs?$/, ' (years)'], [/_count$/, ' count'],
];
const WORDS = { aum: 'AUM', bsp: 'BSP', usd: 'USD', ebitda: 'EBITDA', ceo: 'CEO', cfo: 'CFO', sba: 'SBA', ppp: 'PPP', sec: 'SEC', adv: 'ADV', nci: 'NCI', fy: 'FY', ma: 'MA', pe: 'PE', bdc: 'BDC', llc: 'LLC', gbp: 'GBP', hq: 'HQ', ev: 'EV', d: 'D', a: 'A', and: 'and', of: 'of', rfp: 'RFP', rfps: 'RFPs', nyc: 'NYC', nj: 'NJ', pa: 'PA', ct: 'CT', ri: 'RI', dc: 'DC', ny: 'NY', de: 'DE', md: 'MD', va: 'VA', mo: 'MO', uk: 'UK', us: 'US', naics: 'NAICS', cbp: 'CBP', llp: 'LLP', inc: 'Inc.', ev: 'EV', o: 'O', m: 'M', coinvest: 'co-invest', l2: 'Level 2', level2: 'Level 2', yr: 'year', yrs: 'years', num: 'number', avg: 'average', qty: 'quantity', pct: '%', ts: 'Thomas Scientific', bsp: 'BSP', pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', fh: 'Fair Harbor', bpi: 'BPI', id: 'ID', url: 'link', est: 'est.', approx: 'approx.', yoy: 'YoY', ltv: 'LTV', cac: 'CAC', roi: 'ROI', kpi: 'KPI', osha: 'OSHA', dol: 'DOL', ftes: 'FTEs', fte: 'FTE', mw: 'MW', wwtp: 'wastewater plant', gm: 'GM', ar: 'AR' };

/** Dataset id or file name → human name ("pp_sales_pa_a" → "Punctual Pros deed records (PA)"). */
export function dataset(id) {
  const key = String(id ?? '').replace(/\.(json|csv|geojson)$/, '').replace(/^data\/(research\/|sales\/)?/, '');
  return MORE[key] || Frame.LABELS[key] || Frame.label(key);
}

/** Record field key → sentence-case label ("approx_ebitda_margin_pct" → "Approx. EBITDA margin (%)"). */
export function field(key) {
  let k = String(key ?? '').trim();
  if (!k) return '—';
  const tail = k.match(/_?(\([^)]*\))$/); if (tail) return field(k.slice(0, tail.index)) + ' ' + tail[1].replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/_/g, ' ');
  if (!/_/.test(k) && !/^[a-z]+[A-Z]/.test(k)) return k.charAt(0).toUpperCase() + k.slice(1);
  k = k.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  if (MORE[k]) return cap(MORE[k]);
  let unit = '';
  for (const [rx, u] of SUFFIX) { const m = k.match(rx); if (m) { unit = u.replace('$1', m[1] || ''); k = k.replace(rx, ''); break; } }
  const words = k.split('_').filter(Boolean).map(w => WORDS[w] ?? (/^fy\d{2,4}$/.test(w) || /^bsp-[a-z]+$/.test(w) ? w.toUpperCase() : w));
  // SEC entity keys ("Broad_Sky_Partners_LP_GAV_usd", "BSP-TS_Co-Invest_II_GAV_usd") read as the fund, not lower-cased legal names
  let txt = words.join(' ').replace(/^broad sky partners lp\b/, 'BSP Fund I').replace(/\bco-invest (i{1,3})\b/, (m, r) => `co-invest ${r.toUpperCase()}`).replace(/\blp\b/g, 'LP').replace(/\bgav\b/g, 'GAV');
  txt = txt.replace(/\bd and a\b/i, 'D&A');
  return cap(Frame.keyDates ? Frame.keyDates(txt) : txt) + unit;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** Map an object's keys through field() — for ui.kv() blocks built from raw records. */
export const fields = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [field(k), v]));

/** Strip e-mail addresses from free text (UNIFIED.md §7, no contact strings in copy). */
const RX_MAIL = /\s*\(?\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b\)?/g;
export const noEmail = s => typeof s === 'string' ? s.replace(RX_MAIL, '').replace(/ {2,}/g, ' ').replace(/ +([,.;:)])/g, '$1') : s;

/** Loan shorthand in lender-filing prose → words a general reader can follow ("S+425–475, marked at par"). */
export const credit = s => typeof s !== 'string' ? s : s
  .replace(/\bS\+(\d)(\d{2})\s*[–-]\s*(\d)(\d{2})\b/g, 'SOFR + $1.$2–$3.$4%')
  .replace(/\bS\+(\d)(\d{2})\b/g, 'SOFR + $1.$2%')
  .replace(/\bS\+(\d+(?:\.\d+)?)%/g, 'SOFR + $1%')
  .replace(/\bmarked at par\b/g, 'valued by lenders at full face value')
  .replace(/\bsub-(\d{2}) marks\b/g, 'lender marks below $1% of face value');

/** Clean a free-text string (source summaries, notes) of ids, file names, paths and null artefacts. */
export function text(s) {
  if (s == null) return '';
  let t = noEmail(String(s))
    // absolute or repo paths to data files → the dataset's name
    .replace(/(?:\/Users\/[^\s/]+\/[^\s]*?\/)?(?:data\/)?(?:research|sales)\/\*_filings\.json/g, 'company public filings')
    .replace(/(?:\/Users\/[^\s/]+\/[^\s]*?\/)?(?:data\/)?(?:research\/|sales\/)?([a-z][a-z0-9_]*)\.(?:json|csv|geojson)\b/g, (m, id) => dataset(id))
    .replace(/\*_filings\b/g, 'company public filings')
    .replace(/(?:^|(?<=[\s(]))(?:data\/)?(?:research|sales)\/(?=[a-z])/g, '')
    // dataset.meta.field / dataset.field paths → "Dataset: field"
    .replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)((?:\.(?:meta|items|firm|frontline|thomas_scientific)(?:\[\])?)*)\.([a-z][a-z0-9_]*)\b/g, (m, id, mid, f) => `${dataset(id)}: ${field(f).toLowerCase()}`)
    .replace(/\bmeta\.([a-z][a-z0-9_]*)/g, (m, f) => field(f).toLowerCase())
    // internal record ids
    .replace(/\s*\((?:rival|bpi|cet|pp|fl|ts|fh|kb|ra|op|tg)-[a-z0-9-]+(?:,\s*[a-z0-9-]+)*\)/g, '')
    .replace(/\b(?:rival|kb|ra)-[a-z]*-?\d+[a-z0-9-]*\b\s*/g, '')
    // statistics shorthand and nulls in prose
    .replace(/\bn=(\d+)/g, 'n = $1')
    .replace(/\{([a-z_, ]+)\}/g, (m, l) => l.split(/,\s*/).map(field).join(', ').toLowerCase())
    .replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, (m, id) => (MORE[id] || Frame.LABELS[id]) ? dataset(id) : field(id).replace(/^./, c => c.toLowerCase()))
    .replace(/\(null\)/g, '').replace(/\bnull\b/g, 'blank')
    // research notes about access keys read as plain access limits for a visitor
    .replace(/\(?(?:a |an )?(?:registered )?API key required\)?/gi, m => m.startsWith('(') ? '(registration required)' : 'registration required')
    .replace(/\bwith (?:a |an )?(?:registered )?API key\b/gi, 'with registered access')
    .replace(/\bAPI now requires a key\b/gi, 'now requires registration')
    .replace(/\bAPI key\b/gi, 'registered access');
  return Frame.humanizeText(t).replace(/ {2,}/g, ' ').replace(/ +([,.;:)])/g, '$1');
}

/* ── post-render pass: textual est. markers → .sys-est badges ──────────────── */
const SKIP = 'code,pre,kbd,script,style,textarea,input,select,option,svg,.sys-est,[data-raw],.ch';
// "est." as its own token: "$22M est.", "(est.)", "est. $3M", "· est." — never "interest." or "largest."
const RX_NEQ = /\bn=(\d)/, RX_NEQ_G = /\bn=(\d+)/g;
const RX_EST = /(^|[\s(·,/~≈])\(?(?:est\.|EST\.|Est\.)\)?(?=$|[\s),·;:/])/;
/* ── shared component vocabulary: console markup carries the .sys- classes ──────
   Renderers keep writing .panel / .kpi / .btn / .chip / .tbl / .note (core.js
   helpers); this pass adds the matching system.css class so the console and the
   concept pages share one component set. app.css keeps the console density.    */
const ALIAS = [
  ['.panel,.card', el => ['sys-card']],
  ['.kpi', el => ['sys-kpi']],
  ['.chip', el => ['sys-chip']],
  ['table.tbl', el => ['sys-table']],
  ['.tbl-wrap', el => ['sys-table-wrap']],
  ['.note', el => ['sys-note', el.classList.contains('warn') ? 'sys-note--warn' : el.classList.contains('good') ? 'sys-note--good' : el.classList.contains('bad') ? 'sys-note--bad' : el.classList.contains('brand') ? 'sys-note--co' : 'sys-note--info']],
  ['.btn', el => { const c = el.classList; if ([...c].some(k => /^sys-btn--(primary|secondary|accent|ghost|co)$/.test(k))) return ['sys-btn']; return ['sys-btn', c.contains('primary') ? 'sys-btn--primary' : c.contains('brand') ? 'sys-btn--accent' : c.contains('ghost') ? 'sys-btn--ghost' : 'sys-btn--secondary', ...(c.contains('sm') || c.contains('xs') ? ['sys-btn--sm'] : [])]; }],
];
const ALIAS_SEL = ALIAS.map(a => a[0]).join(',');
export function alias(root) {
  if (!root || !root.querySelectorAll) return;
  const els = root.matches?.(ALIAS_SEL) ? [root, ...root.querySelectorAll(ALIAS_SEL)] : root.querySelectorAll(ALIAS_SEL);
  for (const el of els) for (const [sel, fn] of ALIAS) if (el.matches(sel)) { const add = fn(el); if (!add.every(c => el.classList.contains(c))) el.classList.add(...add); }
}

export function enhance(root) {
  if (!root || !root.querySelectorAll) return;
  alias(root);
  spellPRG(root);
  gloss(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    let v = t.nodeValue;
    // statistics shorthand in data-sourced prose ("n=21") reads as words, never key=value (UNIFIED.md §7)
    if (v && v.indexOf('n=') >= 0 && RX_NEQ.test(v) && !t.parentElement?.closest(SKIP)) v = t.nodeValue = v.replace(RX_NEQ_G, 'n = $1');
    // loan shorthand from lender filings ("S+425", "marked at par") reads as words
    if (v && (v.indexOf('S+') >= 0 || v.indexOf('at par') >= 0 || v.indexOf(' marks') >= 0) && !t.parentElement?.closest(SKIP)) { const c = credit(v); if (c !== v) v = t.nodeValue = c; }
    if (!v || v.indexOf('st.') < 0 || !RX_EST.test(v)) continue;
    const p = t.parentElement;
    if (!p || p.closest(SKIP)) continue;
    hits.push(t);
  }
  for (const t of hits) {
    const parts = t.nodeValue.split(/((?:^|[\s(·,/~≈])\(?(?:est\.|EST\.|Est\.)\)?(?=$|[\s),·;:/]))/);
    if (parts.length < 2) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      const m = part.match(/^([\s(·,/~≈]?)\(?(?:est\.|EST\.|Est\.)\)?$/);
      if (m) {
        const lead = m[1] === '(' ? '' : m[1];
        if (lead) frag.appendChild(document.createTextNode(lead));
        const b = document.createElement('span'); b.className = 'sys-est'; b.textContent = 'est.'; frag.appendChild(b);
      } else frag.appendChild(document.createTextNode(part));
    }
    t.replaceWith(frag);
  }
}

/** Content rule: a non-specialist reader gets a short definition the first time a finance or industry term appears
    in a view (#content) or in the inspector. [pattern, gloss, already-explained test]. The gloss lands after the first
    match in running text (never in a heading, label, chip, button or link); a view that already spells the term out
    is left alone, which also keeps the pass idempotent under the MutationObserver. */
const GLOSS = [
  [/\bunitranche\b/i, 'a single term loan that blends senior and junior debt', /single term loan that blends/i],
  [/\bPIK\b/, 'payment in kind: interest added to the loan instead of paid in cash', /payment[- ]in[- ]kind/i],
  [/\bdelayed-draw(?: term loans?| loans?| lines?| debt| capacity)?/i, 'credit the company draws later, as add-ons close', /credit the company draws later/i],
  [/\bNPDES\b/, 'the federal permit to discharge treated water', /permit to discharge treated water/i],
  [/\bSRF\b/, 'state revolving fund: low-cost state loans for water projects', /state revolving fund/i],
  [/\bWWTP\b/, 'wastewater treatment plant', /wastewater treatment plant/i],
  [/\bFSM\b/, 'field service management software', /field service management/i],
  [/\bMOIC\b/, 'multiple on invested capital: dollars back per dollar invested', /multiple on invested capital/i],
  [/\bIRR\b/, 'internal rate of return: the yearly return on the money invested', /internal rate of return/i],
  [/\bCTV\b/, 'connected TV: ads on streaming services', /connected TV/i],
  [/\bLSA\b/, 'Google Local Services Ads', /Local Services Ads/i],
  [/\bASR\b/, 'automatic speech recognition', /speech recognition/i],
  [/\bBDCs?\b/, 'business development company: a listed private-credit fund that reports its loans', /business development compan/i],
  [/\bRCM\b/, 'revenue-cycle management: billing and collections', /revenue[- ]cycle management/i],
  [/\bMSPs?\b/, 'managed IT service provider', /managed IT service provider/i],
  [/\bLMM\b/, 'lower middle market: companies with roughly $5–25M of EBITDA', /lower[- ]middle[- ]market/i],
  [/\bSPVs?\b/, 'a fund vehicle set up for one deal', /vehicle set up for one deal/i],
  [/\bGAV\b/, 'gross asset value', /gross asset value/i],
  [/\bDTC\b/, 'direct-to-consumer', /direct[- ]to[- ]consumer/i],
  [/\bAOV\b/, 'average order value', /average order value/i],
  [/\bGPO\b/, 'group purchasing organization', /group purchasing organi/i],
  [/\bNWS\b/, 'National Weather Service', /National Weather Service/i],
  [/\bACS\b/, 'the Census Bureau’s American Community Survey', /American Community Survey/i],
  [/\bCBP\b(?! LLC|,)/, 'Census County Business Patterns', /County Business Patterns/i],
];
const NO_GLOSS = SKIP_SEL => `${SKIP_SEL},a,button,label,th,h1,h2,h3,h4,.sys-chip,.chip,.sys-kpi,.sys-card-label,.sys-kicker,.sys-kbd,.view-tab,.sys-src,.leaflet-container,[data-no-gloss]`;
function gloss(root) {
  const scope = (root.closest && root.closest('#content, #inspector')) || null;
  if (!scope) return;
  const all = scope.textContent || '';
  const todo = GLOSS.filter(([rx, , done]) => rx.test(all) && !done.test(all));
  if (!todo.length) return;
  const skip = NO_GLOSS(SKIP);
  const open = str => (str.match(/\(/g) || []).length > (str.match(/\)/g) || []).length;
  for (const [rx, def] of todo) {
    const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let done = false;
    for (let t = w.nextNode(); t && !done; t = w.nextNode()) {
      const v = t.nodeValue || ''; if (!rx.test(v)) continue;
      const p = t.parentElement; if (!p || p.closest(skip)) continue;
      for (const m of v.matchAll(g)) {
        const end = m.index + m[0].length;
        // an existing parenthesis right after the term is usually its own explanation: leave the view alone
        if (/^\s*\(/.test(v.slice(end))) { done = true; break; }
        // never nest a gloss inside someone else's parenthesis; try the next use instead
        if (open(v.slice(0, m.index))) continue;
        t.nodeValue = `${v.slice(0, end)} (${def})${v.slice(end)}`;
        done = true; break;
      }
    }
  }
}

/** Content rule: spell out Portfolio Resource Group on first use in a view. Walks the view (#content, or the
    given root) in reading order; if the first mention is a bare "PRG", it becomes "Portfolio Resource Group (PRG)". */
function spellPRG(root) {
  const scope = (root.closest && root.closest('#content, #inspector')) || root;
  const all = scope.textContent || '';
  if (all.indexOf('PRG') < 0) return;
  const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const v = t.nodeValue || '';
    const full = v.indexOf('Portfolio Resource Group'), i = v.search(/\bPRG\b/);
    if (full < 0 && i < 0) continue;
    const p = t.parentElement; if (!p || p.closest(SKIP)) continue;
    if (full >= 0 && (i < 0 || full < i)) return;
    t.nodeValue = v.slice(0, i) + 'Portfolio Resource Group (PRG)' + v.slice(i + 3);
    return;
  }
}

export default { EST, ILLUS, LIVE, dataset, field, fields, text, enhance, alias, noEmail };

/** Readable link text for a source URL: "sec.gov · Form D filing" style, never the raw path. */
export function srcLabel(u) {
  let h = '';
  try { const x = new URL(u); h = x.hostname.replace(/^www\./, ''); const f = x.pathname.split('/').filter(Boolean).pop() || '';
    if (/sec\.gov$/.test(h)) return /primary_doc|form_?d/i.test(u) ? 'SEC filing (Form D)' : /companyfacts|xbrl/i.test(u) ? 'SEC XBRL company facts' : 'SEC filing';
    if (/\.pdf$/i.test(f)) return `${h} (PDF)`;
  } catch { return String(u || '—'); }
  return h || String(u);
}

/* ── record cleaners: run before handing data to the shared renderers ────────── */
const YEARISH = /(founded|year|since|established|incorporated)$/i;
const cleanVal = (k, v) => {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1800 && v <= 2100 && YEARISH.test(k)) return String(v);
  if (typeof v === 'string') return text(v);
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? text(x) : x);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, vv]) => [field(kk), cleanVal(kk, vv)]));
  return v;
};
/** Human label for a filing / record category id ("sec_form_d" → "SEC Form D"). */
export const category = c => c == null || c === '' ? '—' : (MORE[c] ? cap(MORE[c]) : field(c));
/** Deep-cleaned copy of a filings dataset ({meta, items}) for renderFilings(). */
export function filings(d) {
  if (!d) return d;
  const m = d.meta || {};
  const meta = { ...m,
    financial_picture: m.financial_picture ? text(m.financial_picture) : m.financial_picture,
    sources_summary: Array.isArray(m.sources_summary) ? m.sources_summary.map(x => typeof x === 'string' ? text(x) : x && typeof x === 'object' ? text(x.source || x.name || x.portal || '') : x) : (typeof m.sources_summary === 'string' ? text(m.sources_summary) : m.sources_summary),
    data_gaps: Array.isArray(m.data_gaps) ? m.data_gaps.map(x => text(typeof x === 'string' ? x : JSON.stringify(x))) : m.data_gaps,
    next_pulls: Array.isArray(m.next_pulls) ? m.next_pulls.map(x => text(typeof x === 'string' ? x : JSON.stringify(x))) : m.next_pulls,
    estimate_table: Array.isArray(m.estimate_table) ? m.estimate_table.map(e => ({ ...e, metric: text(e.metric), estimate: text(e.estimate), basis: text(e.basis) })) : m.estimate_table,
  };
  const items = (d.items || []).map(i => ({ ...i,
    source_url: /^file:|^\/Users\//i.test(String(i.source_url || '')) ? null : i.source_url,
    category: category(i.category), title: text(i.title), entity: text(i.entity), what_it_tells_us: text(i.what_it_tells_us), filer_or_source_agency: text(i.filer_or_source_agency),
    key_figures: i.key_figures && typeof i.key_figures === 'object' ? cleanVal('', i.key_figures) : (typeof i.key_figures === 'string' ? text(i.key_figures) : i.key_figures),
  }));
  return { ...d, meta, items };
}
/** Clean the free-text fields of add-on target records for renderTargets(). */
export function targets(items) {
  const word = v => typeof v === 'string' && /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(v) ? field(v).replace(/^./, c => c.toLowerCase()) : (typeof v === 'string' ? text(v) : v);
  return (items || []).map(t => { const o = { ...t };
    for (const k of ['revenue_source', 'ownership', 'ownership_notes', 'notes', 'thesis', 'fit_rationale', 'why', 'risks', 'specialties', 'trades', 'offerings', 'end_markets', 'customer_segments', 'geography_served', 'brands_or_franchise', 'review_source'])
      if (Array.isArray(o[k])) o[k] = o[k].map(word); else if (typeof o[k] === 'string') o[k] = word(o[k]);
    if (Array.isArray(o.risk_flags)) o.risk_flags = o.risk_flags.map(word);
    return o; });
}

/** Frame.humanize passthrough for modules that host third-party text (the theater captions). */
export const humanize = root => Frame.humanize(root);

/* ── one h1 pattern for every portal view ─────────────────────────────────────
   "<Module name> · <view name in sentence case>"; company modules lead with the
   company name ("Punctual Pros · operating picture"). Renderers keep writing their
   own pageHead titles; retitle() runs after every render (app.html) and rewrites
   the view's first h1 so every module reads the same way. Proper nouns and
   acronyms keep their case; everything else is lower case after the dot. */
export const VIEW_TITLES = {
  'home/overview': 'portfolio overview', 'home/firm': 'BSP profile',
  'bsp/deals': 'deal ledger', 'bsp/patterns': 'deal patterns', 'bsp/rubric': 'acquisition rubric', 'bsp/network': 'deal network',
  'cet/overview': 'operating picture', 'cet/opportunities': 'opportunity radar', 'cet/wastewater': 'wastewater accounts', 'cet/territory': 'territory fit', 'cet/transfers': 'property transfers', 'cet/targets': 'add-on targets', 'cet/filings': 'public filings',
  'pp/overview': 'operating picture', 'pp/weather': 'weather and demand', 'pp/movers': 'new-mover marketing', 'pp/territory': 'territory and expansion', 'pp/market': 'market and competitors', 'pp/targets': 'add-on targets', 'pp/filings': 'public filings',
  'fl/overview': 'operating picture', 'fl/amlaw': 'AM Law account map', 'fl/midsize': 'mid-size firm targets', 'fl/targets': 'add-on targets', 'fl/filings': 'public filings',
  'ts/overview': 'operating picture', 'ts/accounts': 'accounts', 'ts/sites': 'site explorer', 'ts/targets': 'add-on targets', 'ts/filings': 'public filings',
  'bpi/overview': 'operating picture', 'bpi/opportunities': 'growth opportunities', 'bpi/benchmarks': 'public-affairs comparables', 'bpi/filings': 'public filings',
  'fh/overview': 'operating picture', 'fh/opportunities': 'growth opportunities', 'fh/benchmarks': 'public comparables', 'fh/filings': 'public filings', 'fh/market': 'Manhattan home sales',
  'ma/overview': 'cross-portfolio overview', 'ma/pipeline': 'add-on pipeline', 'ma/theses': 'company theses', 'ma/rivals': 'rival companies', 'ma/valuation': 'valuation benchmarks', 'ma/whitespace': 'white space',
  'deal/returns': 'buyout returns', 'deal/dcf': 'discounted cash flow', 'deal/rollup': 'buy-and-build roll-up', 'deal/sensitivity': 'sensitivity tables',
  'cases/timeline': 'case timelines', 'cases/levers': 'value-creation levers', 'cases/sequence': 'the Punctual Pros sequence', 'cases/exits': 'entry to exit',
  'pe/landscape': 'sponsor landscape', 'pe/deals': 'deal flow, 2025 to 2026', 'pe/heatmap': 'sector heatmap', 'pe/comparables': 'portfolio company comparables',
  'national/scorer': 'county scorer', 'national/phases': 'Punctual Pros phases on the national map', 'national/markets': 'metro markets', 'national/method': 'method, sources and coverage',
  'fin/portfolio': 'portfolio financial picture', 'fin/deal': 'value and exit scoreboard', 'fin/explorer': 'filings explorer', 'fin/comps': 'public comparables', 'fin/rivals': 'rival company financials', 'fin/methods': 'methods and gaps',
  'techos/overview': 'program overview', 'techos/evidence': 'valuation evidence', 'techos/roadmap': 'OS roadmap', 'techos/calculator': 'value-creation calculator',
  'theater/play': 'cinematic map scenes', 'briefing/play': 'chapters and video briefing',
};
const KEEP_CASE = /^(?:[A-Z]{2,}|AM|OS|Broad|Punctual|Manhattan|New|Thomas|Frontline|Fair)\b/;
/** Sentence-case a view name: first letter lower unless it starts with an acronym or a proper noun. */
export const sentence = s => { const t = String(s || '').replace(/\s*&\s*/g, ' and ').replace(/\s*→\s*/g, ' to ').trim(); return KEEP_CASE.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
/** The h1 text for a module view. */
export const viewTitle = (m, v) => `${m.name} · ${VIEW_TITLES[`${m.id}/${v.id}`] || sentence(v.name)}`;
/** Rewrite the first h1 under root to the shared pattern (idempotent; safe inside a MutationObserver). */
export function retitle(root, m, v) {
  if (!root || !m || !v) return;
  const h = root.querySelector('.page-head h1, .side-head h1'); // the 3D map's h1 is a per-scene caption, not a page title: left alone
  if (!h) return;
  const want = viewTitle(m, v);
  if (h.textContent !== want) { h.textContent = want; h.dataset.viewTitle = '1'; }
}
