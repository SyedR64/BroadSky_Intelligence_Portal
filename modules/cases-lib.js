/* ═══════════════════════════════════════════════════════════════════════════
   Value-creation cases · shared model and renderers
   Used by the portal module (modules/cases.js) and the public page
   (redesigns/case-studies.html). Pure functions: data in, HTML strings out.
   Dataset: data/research/value_creation_cases.json (34 cases, 18 levers,
   12 patterns, the dated Punctual Pros sequence and the entry → exit table).
   Styles for every .cs-* class live in modules/cases.css (scoped .m-cases).
   ═══════════════════════════════════════════════════════════════════════════ */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── vocabulary ───────────────────────────────────────────────────────────── */
export const SHORT = {
  'case-rr': 'Roto-Rooter', 'case-se': 'Service Experts', 'case-nb': 'Neighborly', 'case-ars': 'ARS / Rescue Rooter', 'case-wr': 'Wrench Group',
  'case-tp': 'TurnPoint', 'case-hl': 'Heartland', 'case-hz': 'Horizon Services', 'case-ab': 'Authority Brands', 'case-fd': 'Frontdoor',
  'case-ap': 'Apex Service Partners', 'case-rw': 'Redwood Services', 'case-ch': 'Champions Group', 'case-th': 'Threshold Brands', 'case-si': 'Sila Services',
  'case-ah': 'Any Hour', 'case-lg': 'Legacy Service Partners', 'cx-01': 'Smith + Howard', 'cx-02': 'Frontline', 'cx-03': 'Shermco',
  'cx-04': 'Sciens', 'cx-05': 'IES Holdings', 'cx-06': 'Consilio', 'cx-07': 'Epiq', 'cx-08': 'Harbor Global', 'cx-09': 'VWR',
  'cx-10': 'Avantor', 'cx-11': 'Fisher Scientific', 'cx-12': 'Stagwell', 'cx-13': 'FGS Global', 'cx-14': 'Teneo', 'cx-15': 'Vuori',
  'cx-16': 'Chubbies', 'cx-17': 'Allbirds',
};
export const SECTOR = {
  residential_home_services: 'Residential home services', franchisor: 'Home-services franchisors', commercial_services: 'Commercial services',
  legal_services: 'Legal services', lab_distribution: 'Lab distribution', agency: 'Agencies', consumer: 'Consumer brands',
};
export const SECTOR_ORDER = Object.keys(SECTOR);
export const SECTOR_GROUP = { residential_home_services: 'home', franchisor: 'home' };
export const STATUS = { sold: 'Sold', held: 'Still held', recap: 'Recap or minority sale', ipo: 'IPO' };

/** Seven colour families for the fourteen event types (chart encoding only). */
export const FAMILY = {
  // system palette tokens (assets/system.css), so the encoding follows the shared light/dark theme
  deal: { label: 'Add-ons', color: 'var(--sys-orange)' },
  owner: { label: 'Recaps and exits', color: 'var(--sys-violet)' },
  ops: { label: 'Systems, pricing, contact center', color: 'var(--sys-info)' },
  members: { label: 'Memberships', color: 'var(--sys-good)' },
  people: { label: 'Leadership and training', color: 'var(--sys-ink-2)' },
  brand: { label: 'Brand and marketing', color: 'var(--sys-coral)' },
  info: { label: 'KPI disclosures and other', color: 'var(--sys-mute-2)' },
};
export const EVENT = {
  add_on: ['Add-on', 'deal'], recap: ['Recap or refinancing', 'owner'], exit: ['Exit', 'owner'],
  tech_rollout: ['Technology rollout', 'ops'], call_center: ['Contact center', 'ops'], pricing: ['Pricing and purchasing', 'ops'], fleet: ['Fleet', 'ops'],
  membership_program: ['Membership program', 'members'], leadership: ['Leadership', 'people'], training_academy: ['Training academy', 'people'],
  brand: ['Brand', 'brand'], marketing: ['Marketing', 'brand'], kpi_disclosure: ['KPI disclosure', 'info'], other: ['Other', 'info'],
};
export const typeLabel = t => (EVENT[t] || [String(t || 'Other').replace(/_/g, ' ')])[0];
export const famOf = t => (EVENT[t] || [null, 'info'])[1];

/** Short, plain-English titles for the Punctual Pros sequence (fallback: the first clause of the action). */
const STEP_TITLE = {
  0: 'BSP acquires Punctual Pros', 1: 'ServiceTitan on every location', 2: 'Add-on #1: Horvath Home Services (NJ)',
  3: 'Integration leader and weekly KPI pack', 4: 'One contact center with AI answering', 5: 'Membership relaunch as the north-star metric',
  6: 'Price book and sales coaching', 7: 'Restart tuck-ins: one per quarter', 8: 'Lancaster technician academy', 9: 'Shared back office in Lancaster',
  10: 'Attach adjacent lines to existing visits', 11: 'Fund the program, keep leverage near 3x', 12: 'Exit preparation: audited KPI pack',
  13: 'Metro anchor acquisition', 14: 'Exit window',
};
/** Supporting views that the dataset does not name but that carry the evidence for a step (shown as extra links). */
const STEP_EXTRA = { 4: ['#/pp/weather'], 7: ['redesigns/punctual-pros/nationwide.html#map'], 10: ['#/pp/movers'] };

/* Portal views and pages a step or lever can point at → readable names. */
const VIEW_LABEL = {
  '#/pp/overview': 'Punctual Pros overview', '#/pp/targets': 'Punctual Pros add-on targets', '#/pp/movers': 'New-mover leads', '#/pp/market': 'Punctual Pros market',
  '#/pp/territory': 'Territory and expansion', '#/pp/filings': 'Punctual Pros filings', '#/pp/weather': 'Weather and demand',
  '#/techos/calculator': 'Tech-enablement calculator', '#/techos/roadmap': 'Tech-enablement roadmap', '#/techos/evidence': 'Tech-enablement evidence', '#/techos/overview': 'Tech enablement',
  '#/ma/pipeline': 'Add-on pipeline', '#/ma/rivals': 'Rival operators', '#/ma/valuation': 'Valuation benchmarks', '#/pe/comparables': 'Sponsor comparables',
  '#/fin/rivals': 'Rival filings', '#/fin/comps': 'Public comparables', '#/fl/overview': 'Frontline overview',
};
const PAGE_LABEL = {
  'redesigns/punctual-pros/serviceos.html': 'ServiceOS', 'redesigns/punctual-pros/nationwide.html': 'Nationwide plan', 'redesigns/punctual-pros/ads.html': 'Growth marketing',
  'redesigns/voice-ai.html': '24/7 Voice AI', 'redesigns/ai-agents.html': 'AI agents', 'redesigns/punctual-pros/index.html': 'Punctual Pros site concept',
};
const ANCHOR_LABEL = {
  modules: 'modules', demo: 'demo', membership: 'memberships', exit: 'exit math', value: 'value math', template: 'Smith + Howard template', map: 'expansion map',
  levers: 'growth levers', agents: 'AI agents', pros: 'technician programs', tuckins: 'tuck-in machine', returns: 'financing and returns', calc: 'calculator', baseline: 'baseline',
};
/** One reference ('#/pp/targets', 'redesigns/voice-ai.html#x') → { ref, label, portal }. Hrefs are built by the caller (root differs). */
export function linkInfo(ref) {
  const r = String(ref || '').trim().replace(/[.,;)]+$/, '');
  if (!r) return null;
  if (r.startsWith('#/')) { const base = r.split('?')[0]; return { ref: r, portal: true, label: VIEW_LABEL[base] || 'Portal view' }; }
  const [path, anchor] = r.split('#');
  const page = PAGE_LABEL[path];
  if (!page) return null;
  return { ref: r, portal: false, label: anchor && ANCHOR_LABEL[anchor] ? `${page} · ${ANCHOR_LABEL[anchor]}` : page };
}
/** Build an href for a reference. root = '' in the portal, '../' on redesigns/ pages. */
export function hrefFor(info, root = '') {
  if (!info) return '#';
  if (info.portal) return root ? `${root}app.html${info.ref}` : info.ref;
  return root + info.ref;
}
/** "a; b" or "a, b and c" → [linkInfo]. */
export function parseRefs(s) {
  const out = [];
  const rx = /#\/[a-z]+\/[a-z_]+(?:\?[\w=&-]+)?|redesigns\/[\w/.-]+?\.html(?:#[\w-]+)?/g;
  for (const m of String(s || '').matchAll(rx)) { const li = linkInfo(m[0]); if (li && !out.some(x => x.ref === li.ref)) out.push(li); }
  return out;
}

/* ── text cleaning (no internal ids, file names or field names reach the page) ── */
const ID = String.raw`(?:kb|pn|ve|pp-fil|fl|rival)-[a-z0-9]+(?:-[a-z0-9]+)*`;
const FIELD = { entry_date: 'entry date', exit_date: 'exit date', entry_ev_usd: 'entry value', exit_ev_usd: 'exit value', entry_multiple_ebitda: 'entry multiple', exit_multiple_ebitda: 'exit multiple', exit_multiple: 'exit multiple', entry_revenue_usd: 'entry revenue', exit_revenue_usd: 'exit revenue', exit_ebitda_usd: 'exit EBITDA', entry_ebitda_usd: 'entry EBITDA', entry_locations: 'entry locations', entry_technicians_or_staff: 'entry staff', what_broad_sky_can_copy: 'what BSP can copy', pe_landscape: 'private-equity landscape', revenue_growth_x: 'The revenue-growth figure', pp_applicability: 'Punctual Pros applicability notes', pp_next_step: 'next steps', punctual_pros_sequence: 'Punctual Pros sequence', months_from_entry: 'months from entry' };
const FILE = { rival_filings: 'competitor filings', frontline_filings: 'Frontline public filings', pp_nationwide: 'the nationwide plan', pp_filings: 'Punctual Pros public filings', serviceos_evidence: 'OS program evidence', pe_landscape: 'the private-equity landscape', cases_home_services: 'the home-services case set', cases_cross_sector: 'the cross-sector case set' };
/* House style: no "platform" in the private-equity sense and no "playbook" in visible copy.
   Tech-sense uses (field-service, booking, marketing, system-wide platform …) are kept. */
const TECH_PLATFORM = /(field-service|primary|system-wide|marketing|booking|software|technology|on one)\s+$/i;
function plainWords(t) {
  t = t.replace(/\b(add-on|tuck-in|integration) playbook\b/gi, '$1 process').replace(/\bplaybooks\b/gi, 'processes').replace(/\bplaybook\b/gi, 'approach');
  t = t.replace(/'?platform-of-platforms'?/gi, 'roll-up of roll-ups')
    .replace(/\bstrategic anchor investment\b/gi, 'strategic investment')
    .replace(/\bPlatform acquisition:/g, 'First acquisition:')
    .replace(/\bplatform deal\b/gi, 'first deal').replace(/\bplatform entry\b/gi, 'sponsor entry').replace(/\bplatform founded\b/gi, 'company founded')
    .replace(/\b(from|vs) platform start\b/gi, '$1 the first deal').replace(/\bplatform buyouts\b/gi, 'initial buyouts')
    .replace(/\bthird platform merged\b/gi, 'third business merged').replace(/\boriginal opco vs platform\b/gi, 'original company vs combined group')
    .replace(/\bthe Sierra platform\b/g, 'the Sierra group').replace(/\bthe Punctual Pros platform\b/g, 'Punctual Pros')
    .replace(/\bone management team and platform\b/gi, 'one management team and one company');
  return t.replace(/\b([Pp])latform(s?)\b(?!-utilization| fee)/g, (m, p, pl, off, str) => {
    if (TECH_PLATFORM.test(str.slice(Math.max(0, off - 40), off))) return m;
    return (p === 'P' ? 'Compan' : 'compan') + (pl ? 'ies' : 'y');
  });
}
export function clean(s) {
  if (s == null) return '';
  let t = String(s);
  t = t.replace(/\s*Supporting (?:views?|pages?)\s*:[\s\S]*$/i, '');
  t = t.replace(/\s*\(cross-reference [^)]*\)/gi, '');
  t = t.replace(/\s*\(?\b(?:pn|kb|ve)-[a-z]+-\*\)?/g, '');
  t = t.replace(/\s*\((?:case-[a-z]+|cx-\d+)\)/g, '');
  t = t.replace(/\b(case-[a-z]+|cx-\d+)\b/g, (m, id) => SHORT[id] || m);
  t = t.replace(new RegExp(String.raw`\b${ID}'s\b`, 'g'), "the plan's");
  t = t.replace(new RegExp(String.raw`\b${ID} shows\b`, 'g'), 'benchmarks show');
  t = t.replace(new RegExp(String.raw`\s*\((?:see\s+)?(?:serviceos\s+|rival_filings\s+)?${ID}(?:\s*\/\s*[a-z0-9-]+)?\)`, 'g'), '');
  t = t.replace(new RegExp(String.raw`\s+in\s+${ID}\b`, 'g'), '');
  t = t.replace(new RegExp(String.raw`,\s*(?:serviceos\s+)?${ID}\b`, 'g'), '');
  t = t.replace(new RegExp(String.raw`\s+items\s+pn-[a-z]+-\d+[^\s,.;)]*`, 'g'), ' items');
  t = t.replace(new RegExp(String.raw`\s*\b(?:serviceos\s+)?${ID}\b`, 'g'), '');
  t = t.replace(/\bserviceos benchmark\b/gi, 'ServiceOS benchmark');
  t = t.replace(/\b([a-z]+_[a-z_]+)\.json\b/g, (m, f) => FILE[f] || f.replace(/_/g, ' '));
  t = t.replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => FIELD[m] || FILE[m] || (EVENT[m] ? EVENT[m][0].toLowerCase() : m.replace(/_/g, ' ')));
  t = t.replace(/\s*->\s*/g, ' → ');
  t = plainWords(t);
  t = t.replace(/\(\s*\)/g, '').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').replace(/ {2,}/g, ' ').trim();
  return t;
}
/** Split "… Supporting views: #/pp/targets and redesigns/…" into clean text plus links. */
export function splitSupport(s) {
  const raw = String(s || '');
  const m = /Supporting (?:views?|pages?)\s*:([\s\S]*)$/i.exec(raw);
  return { text: clean(raw), links: m ? parseRefs(m[1]) : [] };
}
/** levers_used entry → readable: "tech_rollout (ServiceTitan)" → "Technology rollout (ServiceTitan)". */
export function leverUsed(s) {
  const x = String(s || '').trim();
  const m = /^([a-z_/]+)(.*)$/.exec(x);
  if (m && /_/.test(m[1])) {
    const head = m[1].split('/').map(k => EVENT[k] ? EVENT[k][0] : k.replace(/_/g, ' ')).join(' and ');
    return clean(head + m[2]);
  }
  return clean(x.charAt(0).toUpperCase() + x.slice(1));
}

/* ── dates ────────────────────────────────────────────────────────────────── */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const frac = (y, mo, d) => y + (Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
/** Parse '2019-07-30' | '2016-09' | '2025' | '2016-2020' → { t, t0, t1, approx, label } in fractional years. */
export function when(s) {
  const v = String(s ?? '').trim(); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) { const t = frac(+m[1], +m[2], +m[3]); return { t, t0: t, t1: t, approx: '', y: +m[1], m: +m[2] - 1, label: `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` }; }
  if ((m = /^(\d{4})-(\d{2})$/.exec(v))) { const t = +m[1] + (+m[2] - 0.5) / 12; return { t, t0: t, t1: t, approx: 'month', y: +m[1], m: +m[2] - 1, label: `${MON[+m[2] - 1]} ${m[1]}` }; }
  if ((m = /^(\d{4})-(\d{4})$/.exec(v))) { const t0 = +m[1], t1 = +m[2] + 0.999; return { t: (t0 + t1) / 2, t0, t1, approx: 'range', label: `${m[1]}–${m[2]}` }; }
  if ((m = /^(\d{4})$/.exec(v))) { const t = +m[1] + 0.5; return { t, t0: +m[1], t1: +m[1] + 0.999, approx: 'year', label: m[1] }; }
  return null;
}
/** "Sept 2026" from a parsed date (exact) or a fractional year. */
export const mLabel = w => w == null ? '—' : typeof w === 'number' ? monthLabel(w) : w.m != null ? `${MON[w.m]} ${w.y}` : w.label;
export const monthLabel = t => { const y = Math.floor(t + 1e-6); const mo = Math.min(11, Math.max(0, Math.floor((t - y) * 12 + 1e-6))); return `${MON[mo]} ${y}`; };
export const TODAY = when('2026-10-06');

/* ── numbers ──────────────────────────────────────────────────────────────── */
export const median = a => { const v = a.filter(x => x != null && !isNaN(x)).map(Number).sort((x, y) => x - y); if (!v.length) return null; const k = Math.floor(v.length / 2); return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2; };
export const usd = v => { if (v == null || isNaN(v)) return '—'; const a = Math.abs(v); if (a >= 1e9) return '$' + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B'; if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M'; if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K'; return '$' + Math.round(v); };
export const xTimes = (v, d = 1) => v == null || isNaN(v) ? '—' : `${Number(v).toFixed(d).replace(/\.0$/, '')}x`;
export const yrs = v => v == null || isNaN(v) ? '—' : `${Number(v).toFixed(1)} yrs`;
export const kpiVal = v => v == null || v === '' ? '—' : typeof v === 'number' ? (Math.abs(v) >= 1e6 ? usd(v).replace('$', '') : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })) : clean(String(v));
export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
export const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
/** "Months 12-48: …" → "Months 12–48: …" (en dash between numbers, never inside dates). */
export const dash = s => String(s || '').replace(/(^|[^\d-])(\d{1,3})-(\d{1,3})(?![\d-])/g, '$1$2–$3');
const firstClause = s => { const t = clean(s); const c = t.split(/[:;]|, (?:then|and) |\. /)[0]; return c.length > 70 ? c.slice(0, 68).replace(/\s+\S*$/, '') + '…' : c; };

/* ── model ────────────────────────────────────────────────────────────────── */
/** Evidence rows come as dated facts {date, months_from_entry, fact} or KPI moves {kpi, before, after, unit, period}. */
function normEv(e) {
  if (e.kpi && !e.fact) return { ...e, w: null, fact: clean(`${e.kpi}: ${kpiVal(e.before)} → ${kpiVal(e.after)} ${e.unit || ''}`), dateLabel: clean(e.period || '') };
  const w = when(e.date);
  return { ...e, w, fact: clean(e.fact), dateLabel: w?.label || clean(e.date || '') };
}
/** Exit value is a press or secondary estimate (vs. a filed figure). */
const evEstimate = c => c.confidence !== 'high';
/** Build the derived model the page and the module share. Returns null if the dataset is missing. */
export function build(d) {
  if (!d || !Array.isArray(d.items)) return null;
  const meta = d.meta || {};
  const eet = Object.fromEntries((meta.entry_exit_table || []).map(r => [r.case, r]));
  const cases = d.items.filter(i => i.kind === 'case').map(c => {
    const row = eet[c.id] || {};
    const entry = when(c.entry_date), exit = when(c.exit_date);
    const events = (c.timeline || []).map((e, i) => ({ ...e, i, w: when(e.date), fam: famOf(e.event_type), type: typeLabel(e.event_type), event: clean(e.event), metric: clean(e.metric) }))
      .filter(e => e.w).sort((a, b) => a.w.t0 - b.w.t0 || a.i - b.i);
    const chain = clean(c.sponsor);
    return {
      ...c, raw: c, short: SHORT[c.id] || clean(c.company).split(/ \(| - /)[0], name: clean(c.company), sectorLabel: SECTOR[c.sector] || clean(c.sector),
      home: SECTOR_GROUP[c.sector] === 'home', entry, exit, events, chain, firstSponsor: chain.split(' → ')[0].replace(/\s*\(.*$/, ''),
      chainShort: chain.split(' → ').map(x => x.replace(/\s*\([^)]*\)/g, '').replace(/\s*\(.*$/, '').replace(/,.*$/, '').trim()).filter(Boolean).join(' → '),
      statusLabel: (c.hold_status === 'held' && exit ? STATUS.sold : STATUS[c.hold_status]) || clean(c.hold_status), hold: row.hold_years ?? null, growth: row.revenue_growth_x ?? null, eetNote: clean(row.note),
      copy: clean(c.what_broad_sky_can_copy), kpis: (c.kpi_before_after || []).map(k => ({ ...k, kpi: clean(k.kpi), unit: clean(k.unit), period: clean(k.period) })),
      levers: (c.levers_used || []).map(leverUsed), buyer: clean(c.exit_buyer), moic: clean(c.moic_or_irr_reported), basis: clean(c.confidence_basis),
      portal: c.portal_view ? parseRefs(c.portal_view)[0] || null : null, evEst: evEstimate(c), buyerShort: clean(c.exit_buyer).split(/\s*[(;]/)[0].replace(/,\s*$/, ''),
    };
  });
  cases.sort((a, b) => SECTOR_ORDER.indexOf(a.sector) - SECTOR_ORDER.indexOf(b.sector) || (a.entry?.t ?? 9999) - (b.entry?.t ?? 9999));
  const byId = Object.fromEntries(cases.map(c => [c.id, c]));

  const levers = d.items.filter(i => i.kind === 'lever').map(l => {
    const sup = splitSupport(l.pp_applicability);
    const timing = {};
    const tt0 = l.typical_timing_months_from_entry || {};
    const fa = tt0.first_addon || null, mpd = tt0.months_per_deal || null;
    const tt = fa ? { range: fa.range, median: fa.median, n: fa.n, label: 'First add-on', basis: `First add-on a median ${fa.median} months after entry (${fa.n} cases)${mpd ? `; then one deal every ${mpd.median} months (range ${mpd.range?.[0]}–${mpd.range?.[1]}, n=${mpd.n})` : ''}.` } : tt0;
    for (const [cid, mo] of Object.entries(fa?.by_case || {})) if (byId[cid]) timing[cid] = { m: mo, fact: `first add-on, month ${Math.round(mo)}`, date: null, url: null };
    for (const ev of l.evidence || []) {
      if (!byId[ev.case]) continue;
      const cur = timing[ev.case];
      if (ev.kpi) { if (!cur) timing[ev.case] = { m: null, fact: clean(`${ev.kpi}: ${kpiVal(ev.before)} → ${kpiVal(ev.after)}`), date: null, url: ev.source_url }; continue; }
      if (ev.months_from_entry != null && (cur == null || cur.m == null || ev.months_from_entry < cur.m)) timing[ev.case] = { m: ev.months_from_entry, fact: clean(ev.fact), date: ev.date, url: ev.source_url };
      else if (!cur) timing[ev.case] = { m: null, fact: clean(ev.fact), date: ev.date, url: ev.source_url };
    }
    return {
      ...l, name: clean(l.lever), desc: clean(l.description), kpi: clean(l.kpi_moved), magnitude: clean(l.typical_magnitude), pp: sup.text, links: sup.links,
      cases: (l.cases_using || []).filter(id => byId[id]), timing, range: tt.range || null, med: tt.median ?? null, n: tt.n ?? 0, basis: clean(tt.basis), timingLabel: tt.label || '',
      evidence: (l.evidence || []).map(normEv), xrefs: (l.cross_references || []).map(x => ({ ...x, fact: clean(x.fact) })),
    };
  }).sort((a, b) => b.cases.length - a.cases.length);

  const patterns = d.items.filter(i => i.kind === 'pattern').map(p => {
    const w = p.window_months_from_entry || {};
    const st = String(p.pp_status || '');
    const tone = /^Done/i.test(st) ? 'good' : /^Partly/i.test(st) ? 'warn' : /^Behind/i.test(st) ? 'bad' : /^No stress/i.test(st) ? 'good' : 'info';
    const chip = /^Done/i.test(st) ? 'Done' : /^Partly/i.test(st) ? 'Partly done' : /^Behind/i.test(st) ? 'Behind' : /^Not started/i.test(st) ? 'Not started' : /^Unknown/i.test(st) ? 'Unknown' : /^No stress/i.test(st) ? 'No stress signal' : 'In progress';
    return { ...p, name: clean(p.pattern), desc: clean(p.description), status: clean(p.pp_status), next: clean(p.pp_next_step), tone, chip, w,
      cases: (p.cases || []).filter(id => byId[id]), evidence: (p.evidence || []).map(normEv),
      counter: (p.counter_examples || []).map(x => ({ ...x, note: clean(x.note) })) };
  });

  const steps = ((meta.punctual_pros_sequence || {}).steps || []).map(s => {
    const refs = parseRefs(s.portal_view);
    for (const x of STEP_EXTRA[s.step] || []) { const li = linkInfo(x); if (li && !refs.some(r => r.ref === li.ref)) refs.push(li); }
    return { ...s, title: STEP_TITLE[s.step] || firstClause(s.action), action: clean(s.action), bench: clean(s.kpi_or_benchmark), done: /^done/i.test(s.status || ''),
      statusLabel: /^done/i.test(s.status || '') ? 'Done' : /^option/i.test(s.status || '') ? 'Option' : 'Recommended', a: when(s.start), b: when(s.end), refs,
      borrows: (s.borrows_from_cases || []).filter(id => byId[id]), pats: s.pattern_ids || [], xrefs: s.cross_references || [] };
  });

  const ts = meta.timing_stats || {};
  const exitMults = cases.filter(c => c.exit_multiple_ebitda != null).map(c => ({ id: c.id, v: Number(c.exit_multiple_ebitda) }));
  const growth = cases.filter(c => c.growth != null);
  const entries = cases.map(c => c.entry?.t).filter(Boolean);
  const stats = {
    n: cases.length, nHome: cases.filter(c => c.home).length, nCross: cases.filter(c => !c.home).length,
    yearMin: Math.floor(Math.min(...entries)), yearMax: 2026,
    hold: ts.hold_years_first_sponsor?.median ?? median(cases.filter(c => c.hold_status !== 'held').map(c => c.hold)), holdN: ts.hold_years_first_sponsor?.n ?? null,
    holdHome: ts.hold_years_residential_and_franchise?.median ?? null, holdHomeN: ts.hold_years_residential_and_franchise?.n ?? null,
    exitMult: median(exitMults.map(x => x.v)), exitMults,
    growth: median(growth.map(c => c.growth)), growthN: growth.length,
    firstAddon: ts.first_addon_months || null, cadence: ts.months_per_addon || null, pp: ts.punctual_pros || null,
    sold: cases.filter(c => c.hold_status === 'sold').length, events: cases.reduce((a, c) => a + c.events.length, 0),
    conf: meta.confidence_counts || null,
  };
  const ppEntry = when(ts.punctual_pros?.entry || '2024-04-03');
  const ppLane = {
    id: 'pp', short: 'Punctual Pros', chain: 'BSP (2024–)', entry: ppEntry, exit: null, pp: true,
    events: steps.filter(s => s.done && s.a).map(s => ({ i: s.step, date: s.start, w: s.a, event_type: s.step === 2 ? 'add_on' : s.step === 1 ? 'tech_rollout' : 'other', fam: s.step === 2 ? 'deal' : s.step === 1 ? 'ops' : 'owner', type: s.step === 2 ? 'Add-on' : s.step === 1 ? 'Technology rollout' : 'Sponsor entry', event: s.action, metric: s.title, source_url: (s.xrefs[0] || {}).source_url || null })),
  };
  const xrefIndex = {};
  for (const l of levers) for (const x of l.xrefs) if (x.ref && x.source_url) xrefIndex[x.ref] = x;
  return { meta, cases, byId, levers, patterns, steps, stats, ppLane, xrefIndex, narrative: clean(meta.narrative), caveats: (meta.caveats || []).map(clean), retrieved: meta.generated || '2026-10-06' };
}

/** Plain-English timing for a lever ("months 0–10, median 0", "18–0 months before exit"). */
export function timingText(l, short = false) {
  if (!l.range) return short ? 'timing not dated' : 'Not dated consistently across cases';
  const [a, b] = l.range;
  const f = v => Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
  const core = a < 0 ? `${f(a)}–${f(b)} months before exit` : `${l.timingLabel ? (short ? l.timingLabel.toLowerCase() : l.timingLabel) + ' ' : ''}months ${f(a)}–${f(b)}${short ? '' : ' after entry'}`;
  return `${core}${l.med != null ? `, median ${f(l.med)}` : ''}${!short && l.n ? ` (n=${l.n})` : ''}`;
}

/* ── renderers ────────────────────────────────────────────────────────────── */
const fmtN = v => Number.isInteger(v) ? String(v) : Number(v).toFixed(1);
const pct = (v, a, b) => Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100));
const niceStep = (span, cands) => cands.find(s => span / s <= 9) || cands[cands.length - 1];

/** Legend for the seven event families. Buttons toggle visibility when `toggle` is set. */
export function legendHTML(hidden = new Set(), toggle = true) {
  return `<div class="cs-legend" role="group" aria-label="Event types">${Object.entries(FAMILY).map(([k, f]) => toggle
    ? `<button type="button" class="cs-leg" data-fam="${k}" aria-pressed="${hidden.has(k) ? 'false' : 'true'}" style="--c:${f.color}"><i aria-hidden="true"></i>${esc(f.label)}</button>`
    : `<span class="cs-leg" style="--c:${f.color}"><i aria-hidden="true"></i>${esc(f.label)}</span>`).join('')}</div>`;
}

/**
 * Horizontal timeline: one lane per case. mode 'calendar' (years) or 'aligned' (months from sponsor entry).
 * lanes: case objects (or the Punctual Pros lane). opts: { mode, hidden:Set(families), selected:'id:i' }.
 */
export function timelineHTML(lanes, { mode = 'calendar', hidden = new Set(), selected = null } = {}) {
  if (!lanes.length) return '<p class="cs-empty">Pick a case to see its dated events.</p>';
  const origin = l => l.entry?.t ?? l.events[0]?.w.t0 ?? 0;
  const X = (l, t) => mode === 'aligned' ? (t - origin(l)) * 12 : t;
  let lo = Infinity, hi = -Infinity;
  for (const l of lanes) {
    for (const e of l.events) { lo = Math.min(lo, X(l, e.w.t0)); hi = Math.max(hi, X(l, e.w.t1)); }
    if (l.entry) { lo = Math.min(lo, X(l, l.entry.t)); hi = Math.max(hi, X(l, l.entry.t)); }
    if (l.exit) hi = Math.max(hi, X(l, l.exit.t));
    if (l.pp || (!l.exit && l.hold_status !== 'sold')) hi = Math.max(hi, X(l, TODAY.t));
  }
  if (!isFinite(lo)) { lo = mode === 'aligned' ? 0 : 2015; hi = lo + 1; }
  const span0 = Math.max(hi - lo, mode === 'aligned' ? 12 : 1);
  const step = mode === 'aligned' ? niceStep(span0, [6, 12, 24, 36, 60, 120]) : niceStep(span0, [1, 2, 5, 10]);
  const a = Math.floor(lo / step) * step, b = Math.ceil((lo + span0) / step) * step + (Math.ceil((lo + span0) / step) * step - (lo + span0) < step * 0.15 ? step * 0.25 : 0);
  const P = (l, t) => pct(X(l, t), a, b);
  const ticks = []; for (let v = a; v <= b + 1e-9; v += step) ticks.push(v);
  const tickLabel = v => mode === 'aligned' ? (v === 0 ? 'Entry' : `${v > 0 ? '+' : ''}${v} mo`) : String(Math.round(v));
  const grid = ticks.map(v => `<span class="cs-tl-grid${mode === 'aligned' && v === 0 ? ' cs-tl-grid--zero' : ''}" style="left:${pct(v, a, b).toFixed(2)}%"></span>`).join('');
  const lanesHTML = lanes.map(l => {
    const rows = []; const GAP = 2.1;
    const evs = l.events.filter(e => !hidden.has(e.fam)).map(e => {
      const x0 = P(l, e.w.t0), x1 = e.w.approx === 'range' ? P(l, e.w.t1) : x0;
      let r = rows.findIndex(end => x0 - end >= GAP);
      if (r < 0) { if (rows.length < 5) { rows.push(-99); r = rows.length - 1; } else r = rows.indexOf(Math.min(...rows)); }
      rows[r] = Math.max(x1, x0 + 0.6);
      return { e, x0, x1, r };
    });
    const h = 22 + Math.max(1, rows.length) * 17;
    const hold0 = l.entry ? P(l, l.entry.t) : null;
    const hold1 = l.exit ? P(l, l.exit.t) : (l.pp || l.hold_status === 'held' || l.hold_status === 'recap' || l.hold_status === 'ipo') ? P(l, TODAY.t) : null;
    const holdBar = hold0 != null && hold1 != null && hold1 > hold0 ? `<span class="cs-tl-hold" style="left:${hold0.toFixed(2)}%;width:${(hold1 - hold0).toFixed(2)}%" aria-hidden="true"></span>` : '';
    const entryMk = l.entry ? `<span class="cs-tl-mark cs-tl-mark--entry" style="left:${P(l, l.entry.t).toFixed(2)}%" title="${esc(`${l.pp ? 'BSP' : 'Sponsor'} entry · ${l.entry.label}`)}"><b>${l.pp ? 'Entry' : 'In'}</b></span>` : '';
    const exitMk = l.exit ? `<span class="cs-tl-mark cs-tl-mark--exit" style="left:${P(l, l.exit.t).toFixed(2)}%" title="${esc(`Exit · ${l.exit.label}`)}"><b>Out</b></span>` : '';
    const todayMk = (l.pp || (mode === 'calendar' && !l.exit)) ? `<span class="cs-tl-today" style="left:${P(l, TODAY.t).toFixed(2)}%" title="Today · Oct 2026"></span>` : '';
    const dots = evs.map(({ e, x0, x1, r }) => {
      const key = `${l.id}:${e.i}`; const f = FAMILY[e.fam] || FAMILY.info;
      const lab = `${e.w.label} · ${e.type}: ${e.event}`;
      const range = e.w.approx === 'range';
      return `<button type="button" class="cs-tl-ev${range ? ' cs-tl-ev--range' : ''}${e.event_type === 'exit' ? ' cs-tl-ev--exit' : ''}${selected === key ? ' is-sel' : ''}" data-ev="${esc(key)}" style="left:${x0.toFixed(2)}%;top:${16 + r * 17}px;--c:${f.color}${range ? `;width:max(10px,${(x1 - x0).toFixed(2)}%)` : ''}" aria-label="${esc(lab)}" title="${esc(lab.length > 220 ? lab.slice(0, 218) + '…' : lab)}"></button>`;
    }).join('');
    return `<div class="cs-tl-lane${l.pp ? ' cs-tl-lane--pp' : ''}" data-case="${esc(l.id)}">
      <div class="cs-tl-name"><b>${esc(l.short)}</b><span>${esc(l.pp ? 'BSP · today = month ' + Math.round((TODAY.t - l.entry.t) * 12) : `${(l.chainShort || '').length > 46 ? l.chainShort.slice(0, 44).replace(/\s+\S*$/, '') + '…' : l.chainShort || ''}${l.statusLabel ? ' · ' + l.statusLabel : ''}`)}</span></div>
      <div class="cs-tl-track" style="height:${h}px">${grid}${holdBar}${entryMk}${exitMk}${todayMk}${dots}</div>
    </div>`;
  }).join('');
  const axis = ticks.map(v => `<span style="left:${pct(v, a, b).toFixed(2)}%">${esc(tickLabel(v))}</span>`).join('');
  return `<div class="cs-tl" data-mode="${mode}"><div class="cs-tl-scroll"><div class="cs-tl-in">${lanesHTML}
    <div class="cs-tl-lane cs-tl-lane--axis" aria-hidden="true"><div class="cs-tl-name"><span>${mode === 'aligned' ? 'Months from sponsor entry' : 'Calendar year'}</span></div><div class="cs-tl-axis">${axis}</div></div>
  </div></div></div>`;
}

/** Lever × case matrix. Cells: filled by timing band of the earliest dated evidence; hollow when used but undated. */
export function matrixHTML(model, { selected = null, onlyHome = false } = {}) {
  const cols = model.cases.filter(c => !onlyHome || c.home);
  const groups = []; for (const c of cols) { const g = groups[groups.length - 1]; if (g && g.s === c.sector) g.n++; else groups.push({ s: c.sector, n: 1 }); }
  const band = m => m == null ? 'undated' : m <= 12 ? 'early' : m <= 36 ? 'mid' : 'late';
  const bandTxt = { early: 'first 12 months', mid: 'months 13–36', late: 'after month 36', undated: 'date not disclosed' };
  const head1 = `<tr><th class="cs-mx-corner" rowspan="2" scope="col">Lever <span>sorted by number of cases</span></th>${groups.map(g => `<th colspan="${g.n}" class="cs-mx-grp" scope="colgroup">${esc(SECTOR[g.s] || g.s)}</th>`).join('')}</tr>`;
  let prev = null;
  const head2 = `<tr>${cols.map(c => { const first = c.sector !== prev; prev = c.sector; return `<th class="cs-mx-col${first ? ' cs-mx-first' : ''}" scope="col"><button type="button" data-case="${esc(c.id)}" title="${esc(c.name)}"><span>${esc(c.short)}</span></button></th>`; }).join('')}</tr>`;
  const body = model.levers.map(l => {
    let pv = null;
    const cells = cols.map(c => {
      const first = c.sector !== pv; pv = c.sector;
      const used = l.cases.includes(c.id); const tm = l.timing[c.id];
      if (!used && !tm) return `<td class="cs-mx-cell${first ? ' cs-mx-first' : ''}"></td>`;
      const bd = band(tm?.m ?? null);
      const tip = `${c.short} · ${l.name} · ${tm?.m != null ? `month ${Math.round(tm.m)} from entry` : bandTxt.undated}${tm?.fact ? ` · ${tm.fact}` : ''}`;
      return `<td class="cs-mx-cell${first ? ' cs-mx-first' : ''}"><button type="button" class="cs-mx-dot cs-mx-dot--${bd}" data-cell="${esc(l.id)}|${esc(c.id)}" title="${esc(tip)}" aria-label="${esc(tip)}"></button></td>`;
    }).join('');
    const when = timingText(l, true);
    return `<tr class="${selected === l.id ? 'is-sel' : ''}"><th scope="row" class="cs-mx-lever"><button type="button" data-lever="${esc(l.id)}"><span class="cs-mx-ln">${esc(l.name)}</span><span class="cs-mx-meta">${l.cases.length} cases · ${esc(when)}</span></button></th>${cells}</tr>`;
  }).join('');
  return `<div class="cs-mx-wrap"><table class="cs-mx"><thead>${head1}${head2}</thead><tbody>${body}</tbody></table></div>
    <div class="cs-mx-key" aria-label="Key"><span><i class="cs-mx-dot cs-mx-dot--early"></i>first 12 months</span><span><i class="cs-mx-dot cs-mx-dot--mid"></i>months 13–36</span><span><i class="cs-mx-dot cs-mx-dot--late"></i>after month 36</span><span><i class="cs-mx-dot cs-mx-dot--undated"></i>used, date not disclosed</span></div>`;
}

/** "Hold clock": pattern windows on a 0–84 month axis with Punctual Pros' current month. */
export function clockHTML(model, { selected = null } = {}) {
  const MAX = 84, hold = model.stats.hold || 4.4, exitM = Math.round(hold * 12);
  const ppM = model.stats.pp?.hold_month_on_2026_10_06 ?? Math.round((TODAY.t - model.ppLane.entry.t) * 12);
  const rows = model.patterns.map(p => {
    let s = p.w.start, e = p.w.end, rel = '';
    if (p.w.relative_to === 'exit') { s = exitM + (p.w.start ?? -18); e = exitM + (p.w.end ?? 0); rel = ` (shown before an exit at the ${hold.toFixed(1)}-year median hold)`; }
    const has = s != null && e != null;
    const med = p.w.median ?? null;
    const lab = has ? `Months ${Math.round(s)}–${Math.round(e)}${rel}` : 'Applies across the hold';
    const mh = p.w.median_hold_years ? Math.round(p.w.median_hold_years * 12) : null;
    const bar = has ? `<span class="cs-ck-bar cs-ck-bar--${p.tone}" style="left:${pct(s, 0, MAX).toFixed(2)}%;width:${Math.max(1.2, pct(e, 0, MAX) - pct(s, 0, MAX)).toFixed(2)}%"></span>${med != null ? `<span class="cs-ck-med" style="left:${pct(med, 0, MAX).toFixed(2)}%" title="Median month ${med}"></span>` : ''}` : mh ? `<span class="cs-ck-med" style="left:${pct(mh, 0, MAX).toFixed(2)}%" title="Median hold ${p.w.median_hold_years} years"></span><span class="cs-ck-span" style="left:calc(${pct(mh, 0, MAX).toFixed(2)}% + 8px)">Median hold ${p.w.median_hold_years} yrs (${p.w.n} cases)${p.w.home_services_median_hold_years ? ` · ${p.w.home_services_median_hold_years} in home services` : ''}</span>` : `<span class="cs-ck-span">No fixed window</span>`;
    return `<li class="${selected === p.id ? 'is-sel' : ''}"><button type="button" class="cs-ck-row" data-pat="${esc(p.id)}" aria-label="${esc(`${p.name}. ${lab}. Punctual Pros: ${p.chip}`)}">
      <span class="cs-ck-label"><b>${esc(capFirst(p.name.replace(/^(?:Day|Months?|Years?|Last|Mid-hold|Exit route|Failure pattern|Chain value)[^:]*:\s*/i, '') || p.name))}</b><span>${esc(lab)}</span></span>
      <span class="cs-ck-track">${bar}<span class="cs-ck-now" style="left:${pct(ppM, 0, MAX).toFixed(2)}%"></span></span>
      <span class="sys-chip sys-chip--${p.tone} cs-ck-chip">${esc(p.chip)}</span></button></li>`;
  }).join('');
  const ticks = [0, 12, 24, 36, 48, 60, 72, 84].map(v => `<span class="${(v / 12) % 2 ? 'is-odd' : ''}" style="left:${pct(v, 0, MAX)}%">${v === 0 ? 'Entry' : `Year ${v / 12}`}</span>`).join('');
  return `<div class="cs-ck"><ol class="cs-ck-list">${rows}</ol>
    <div class="cs-ck-axis" aria-hidden="true"><span class="cs-ck-label"></span><span class="cs-ck-ticks">${ticks}<em style="left:${pct(ppM, 0, MAX)}%">Punctual Pros today · month ${ppM}</em></span><span class="cs-ck-chip"></span></div></div>`;
}

/** The Punctual Pros 36-month sequence as a Gantt (forward window Oct 2026 – Sept 2029) plus the done milestones. */
export function ganttHTML(model, { root = '', selected = null } = {}) {
  const A = when('2026-10-01').t, B = when('2029-09-30').t + 1 / 365;
  const done = model.steps.filter(s => s.done), fwd = model.steps.filter(s => !s.done);
  const qs = []; for (let y = 2026; y <= 2029; y++) for (let q = 0; q < 4; q++) { const t = y + q / 4; if (t >= A - 1e-6 && t < B - 1e-6) qs.push({ t, l: `Q${q + 1} ${y}`, y: q === 0 }); }
  const today = pct(TODAY.t, A, B);
  const grid = qs.map(q => `<span class="cs-g-grid${q.y ? ' cs-g-grid--y' : ''}" style="left:${pct(q.t, A, B).toFixed(2)}%"></span>`).join('');
  const link = r => `<a href="${esc(hrefFor(r, root))}">${esc(r.label)}</a>`;
  const rows = fwd.map(s => {
    const x0 = pct(s.a.t, A, B), x1 = pct(s.b.t + 1 / 365, A, B);
    return `<li class="cs-g-row${selected === s.step ? ' is-sel' : ''}">
      <button type="button" class="cs-g-label" data-step="${s.step}"><span class="cs-g-n">${s.step}</span><span><b>${esc(s.title)}</b><span>${esc(mLabel(s.a))} – ${esc(mLabel(s.b))} · hold months ${s.hold_month_start}–${s.hold_month_end}</span></span></button>
      <div class="cs-g-track">${grid}<span class="cs-g-today" style="left:${today.toFixed(2)}%"></span><button type="button" class="cs-g-bar cs-g-bar--${s.statusLabel === 'Option' ? 'opt' : 'rec'}" data-step="${s.step}" style="left:${x0.toFixed(2)}%;width:${Math.max(2, x1 - x0).toFixed(2)}%" aria-label="${esc(`${s.title}: ${s.statusLabel}, ${mLabel(s.a)} to ${mLabel(s.b)}`)}"><span>${s.hold_month_start}–${s.hold_month_end}</span></button></div>
      <div class="cs-g-links">${s.refs.slice(0, 3).map(link).join('')}</div>
    </li>`;
  }).join('');
  const axis = qs.map((q, i) => `<span class="${q.y ? 'is-y' : ''}" style="left:${pct(q.t, A, B).toFixed(2)}%">${esc(q.y || i === 0 ? q.l : q.l.split(' ')[0])}</span>`).join('');
  const doneHTML = done.map(s => `<li><button type="button" data-step="${s.step}"><span class="cs-g-n cs-g-n--done">✓</span><span><b>${esc(s.title)}</b><span>${esc(s.a.label)} · hold month ${s.hold_month_start}</span></span></button></li>`).join('');
  return `<div class="cs-g">
    <div class="cs-g-done"><p class="sys-card-label cs-g-h">Already done</p><ol>${doneHTML}</ol></div>
    <div class="cs-g-fwd"><div class="cs-g-headrow"><p class="sys-card-label cs-g-h">Next 36 months · Oct 2026 – Sept 2029</p><span class="cs-g-key"><i class="cs-g-k cs-g-k--rec"></i>Recommended <i class="cs-g-k cs-g-k--opt"></i>Option <span>Bar text = months of BSP's hold</span></span></div>
      <div class="cs-g-axisrow" aria-hidden="true"><span></span><div class="cs-g-axis">${axis}<em style="left:${today.toFixed(2)}%">Today</em></div><span></span></div>
      <ol class="cs-g-rows">${rows}</ol></div>
  </div>`;
}

/** Multiple ladder: what small deals cost vs what scaled companies sold for (all sourced). */
export function ladderRows(model) {
  const x5 = model.xrefIndex['pn-fin-05'], x6 = model.xrefIndex['pn-fin-06'];
  const rows = [];
  if (x6) rows.push({ label: 'Lower-middle-market buyouts under $25M value', sub: 'GF Data, H1 2025', lo: 6.3, hi: 6.9, url: x6.source_url, kind: 'bench' });
  if (x5) rows.push({ label: 'Initial buyouts (non-add-on), average', sub: 'GF Data, Q2 2026', lo: 7.0, hi: 7.0, url: x5.source_url, kind: 'bench' });
  if (x6) rows.push({ label: 'Buyouts valued $100–250M', sub: 'GF Data, H1 2025', lo: 10.0, hi: 10.0, url: x6.source_url, kind: 'bench' });
  for (const m of model.stats.exitMults.slice().sort((a, b) => a.v - b.v)) {
    const c = model.byId[m.id];
    const src = c.timeline.find(e => /x\b/.test(String(e.metric || '')) && /~?\d+(\.\d)?x/.test(String(e.metric || '')))?.source_url || c.sources?.[c.sources.length - 1];
    rows.push({ label: `${c.short} sold to ${c.buyer.split(' (')[0]}`, sub: `${c.exit?.label || ''} · press-reported`, lo: m.v, hi: m.v, url: src, kind: 'exit', id: c.id });
  }
  return rows;
}
export function ladderHTML(model, { max = 20 } = {}) {
  const rows = ladderRows(model);
  if (!rows.length) return '<p class="cs-empty">No multiples disclosed.</p>';
  return `<ul class="cs-bars">${rows.map(r => `<li class="cs-bar-row">
      <span class="cs-bar-l"><b>${esc(r.label)}</b><span>${esc(r.sub)}${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(host(r.url))}</a>` : ''}</span></span>
      <span class="cs-bar-t"><span class="cs-bar cs-bar--${r.kind}" style="left:0;width:${pct(r.hi, 0, max).toFixed(2)}%">${r.lo !== r.hi ? `<span class="cs-bar-lo" style="width:${(r.lo / r.hi * 100).toFixed(1)}%"></span>` : ''}</span></span>
      <span class="cs-bar-v">${r.lo !== r.hi ? `${xTimes(r.lo)}–${xTimes(r.hi)}` : `~${xTimes(r.hi)}`}${r.kind === 'exit' ? '<span class="sys-est">est.</span>' : ''}</span></li>`).join('')}</ul>
    <div class="cs-bar-axis" aria-hidden="true"><span></span><span class="cs-bar-ticks">${[0, 5, 10, 15, 20].map(v => `<i style="left:${pct(v, 0, max)}%">${v}x</i>`).join('')}</span><span></span></div>`;
}

/** Revenue growth during the hold, log scale around 1x. */
export function growthHTML(model) {
  const rows = model.cases.filter(c => c.growth != null).sort((a, b) => b.growth - a.growth);
  if (!rows.length) return '<p class="cs-empty">No sourced before/after revenue pairs.</p>';
  const L = v => Math.log2(Math.max(0.5, Math.min(40, v)));
  const lo = L(0.5), hi = L(40), one = pct(L(1), lo, hi);
  return `<ul class="cs-bars cs-bars--log">${rows.map(c => {
    const x = pct(L(c.growth), lo, hi); const left = Math.min(x, one), w = Math.abs(x - one);
    return `<li class="cs-bar-row"><span class="cs-bar-l"><button type="button" data-case="${esc(c.id)}"><b>${esc(c.short)}</b></button><span>${esc(c.sectorLabel)}</span></span>
      <span class="cs-bar-t"><span class="cs-bar-one" style="left:${one.toFixed(2)}%"></span><span class="cs-bar cs-bar--${c.growth < 1 ? 'down' : c.home ? 'home' : 'cross'}" style="left:${left.toFixed(2)}%;width:${Math.max(0.8, w).toFixed(2)}%"></span></span>
      <span class="cs-bar-v">${xTimes(c.growth, c.growth < 10 ? 1 : 0)}<span class="sys-est">est.</span></span></li>`;
  }).join('')}</ul>
  <div class="cs-bar-axis" aria-hidden="true"><span></span><span class="cs-bar-ticks">${[1, 2, 5, 10, 35].map(v => `<i style="left:${pct(L(v), lo, hi)}%">${v}x</i>`).join('')}</span><span></span></div>`;
}

/** KPI before → after cards for one case. */
export function kpiCardsHTML(c) {
  if (!c?.kpis?.length) return '<p class="cs-empty">This case discloses no before/after KPIs.</p>';
  // the system KPI tile (.sys-kpi in a .sys-kpis strip): label, before → after value, unit and period, source line
  return `<div class="sys-kpis cs-kba">${c.kpis.map(k => `<div class="sys-kpi cs-kba-i">
      <div class="sys-kpi-label cs-kba-k">${esc(k.kpi)}</div>
      <div class="sys-kpi-value cs-kba-v"><span>${esc(kpiVal(k.before))}</span><i aria-hidden="true">→</i><b>${esc(kpiVal(k.after))}</b></div>
      <div class="sys-kpi-sub cs-kba-u">${esc([k.unit, k.period].filter(Boolean).join(' · '))}${/derived|est|~/i.test(`${k.unit} ${k.before} ${k.after}`) ? '<span class="sys-est">est.</span>' : ''}</div>
      ${k.source_url ? `<a class="sys-src cs-kba-s" href="${esc(k.source_url)}" target="_blank" rel="noopener">${esc(host(k.source_url))} ↗</a>` : ''}
    </div>`).join('')}</div>`;
}

/** Plain-text CSV helpers shared by both surfaces. */
export function csv(rows, cols) {
  const cell = v => { if (v == null) return ''; const s = Array.isArray(v) ? v.join('; ') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(c => cell(c[1])).join(','), ...rows.map(r => cols.map(c => cell(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))].join('\n');
}
export function download(name, text) {
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(text); a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
}
export const eventRows = (cases) => cases.flatMap(c => c.events.map(e => ({ company: c.short, date: e.w.label, sort: e.w.t0, type: e.type, event: e.event, metric: e.metric, source: e.source_url || '' }))).sort((a, b) => a.sort - b.sort);
