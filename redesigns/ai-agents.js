/* The agentic layer — renders the portfolio AI-agent plan (plus the tech-enablement evidence for the
   OS EBITDA ranges). No framework, no build step. Markup uses the shared sys- components
   (assets/system.css, UNIFIED.md); company colour comes from data-co, never from literals here. */
import { humanizeText } from '../assets/frame.js?v=20261009165425';
const ROOT = new URL('../', import.meta.url).href;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, d) => { v = +v || 0; const sg = v < 0 ? '−' : ''; const a = Math.abs(v); if (a >= 1e6) return sg + '$' + (a / 1e6).toFixed(d ?? 1) + 'M'; if (a >= 1e3) return sg + '$' + Math.round(a / 1e3) + 'K'; return sg + '$' + Math.round(a); };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const sentences = s => String(s || '').replace(/\b(e\.g|i\.e|vs|etc|approx|incl|U\.S)\./g, m => m.replace(/\./g, '\u2024')).split(/(?<=[.!?])\s+(?=[A-Z(“"'$0-9])/).map(x => x.replace(/\u2024/g, '.').trim()).filter(Boolean);
const clip = (s, n) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 20)).replace(/[,;:\s]+$/, '') + '…'; };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };

/* Company registry: identity colour follows the entity everywhere on the page. */
const CO = {
  cet: { name: 'CET', full: 'Commonwealth Electrical Technologies', os: 'GridOS', slug: 'cet', osf: 'gridos.html', pb: 'growth-plan.html', pbl: 'Growth plan', hex: 'var(--co-cet)', rev: 80e6 },
  pp: { name: 'Punctual Pros', full: 'Punctual Pros', os: 'ServiceOS', slug: 'punctual-pros', osf: 'serviceos.html', pb: 'nationwide.html', pbl: 'Nationwide plan', hex: 'var(--co-pp)', rev: 22e6 },
  fl: { name: 'Frontline', full: 'Frontline Managed Services', os: 'FirmOS', slug: 'frontline', osf: 'firmos.html', pb: 'growth-plan.html', pbl: 'Growth plan', hex: 'var(--co-fl)', rev: 120e6 },
  ts: { name: 'Thomas Scientific', full: 'Thomas Scientific', os: 'LabOS', slug: 'thomas-scientific', osf: 'labos.html', pb: 'growth-plan.html', pbl: 'Growth plan', hex: 'var(--co-ts)', rev: 285e6 },
  bpi: { name: 'BPI', full: 'Bully Pulpit International', os: 'SignalOS', slug: 'bpi', osf: 'signalos.html', pb: 'growth-plan.html', pbl: 'Growth plan', hex: 'var(--co-bpi)', rev: 105e6 },
  fh: { name: 'Fair Harbor', full: 'Fair Harbor', os: 'HarborOS', slug: 'fair-harbor', osf: 'harboros.html', pb: 'growth-plan.html', pbl: 'Growth plan', hex: 'var(--co-fh)', rev: 27.5e6 },
};
const COS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']; // portfolio order (UNIFIED §6)
const LAYERS = ['customer', 'field', 'office', 'finance', 'growth', 'risk'];
const dot = c => `<span class="sys-dot" data-co="${CO[c] ? c : ''}" aria-hidden="true"></span>`;
const EST = (t = 'est.') => `<span class="sys-est">${t}</span>`;
const ICO = {
  t: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  a: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="3"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><path d="M12 3v3"/></svg>',
  h: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};
/* Build-vs-buy classification, derived from the agent's vendor_or_build text. */
const decision = a => { const t = String(a.vendor_or_build || ''); if (/^\s*build/i.test(t)) return 'build'; if (/build/i.test(t)) return 'hybrid'; return 'buy'; };
const DEC = { buy: 'Buy', hybrid: 'Hybrid', build: 'Build' };
/* Internal ids (gov-0N, ag-xx-0N) never reach the reader. */
const PLAIN = { cet_opportunities: 'CET bid radar', cet_wwtp_targets: 'CET wastewater-plant target list', pp_storm_events: 'Punctual Pros storm history', pp_demand_model: 'Punctual Pros demand model', est_annual_value_usd: 'agent value', metric_claim: 'cited metric' };
/* Controls are numbered by their position in the plan, so references stay consistent if a control is retired. */
let GOVNUM = {};
const gnum = n => GOVNUM[+n] ?? +n;
const deID = s => humanizeText(String(s ?? '').replace(/\bGridOS datasets\b/g, 'GridOS data').replace(/\bexisting datasets\b/g, 'existing data').replace(/\bdatasets?\b/g, 'data').replace(/\bcomparable deployment\b/g, 'comparable company').replace(/\s*-(?:>|&gt;)\s*/g, ' → ').replace(/agent est_annual_value_usd/g, 'agent value estimates').replace(/\b(cet_opportunities|cet_wwtp_targets|pp_storm_events|pp_demand_model|est_annual_value_usd|metric_claim)\b/g, m => PLAIN[m]).replace(/\bgov-0?(\d+)\s+to\s+gov-0?(\d+)/g, (m, a, b) => `controls ${gnum(a)}–${gnum(b)}`).replace(/\bgov-0?(\d+)/g, (m, a) => `control ${gnum(a)}`).replace(/\s*\(control (\d+)\)/g, ' (control $1)').replace(/\s*Portfolio Resource Group \(PRG\)/g, ' PRG').replace(/\bPP's\b/g, "Punctual Pros'").replace(/\bPP\b/g, 'Punctual Pros').replace(/\bTS\b/g, 'Thomas Scientific'));

/* Operational guardrails only: dataset rows that still cite court rulings, statutes or law-firm commentary are
   restated as operating rules with an operational source (vendor documentation), or lose the citation. */
const LEGAL = /Moffatt|[Tt]ribunal|\bruling\b|\blaws\b|\bliable\b|ethics opinion|mccarthy\.ca|fkks\.com|artificial voice/; // only rows still carrying legal framing are restated
const OPS = {
  'gov-02': {
    evidence: 'The OpenAI Agents SDK pauses a run until a person approves or rejects a sensitive tool call; tier-2 and tier-3 actions wait for the named approver the same way.',
    metric_value: 2, metric_unit: 'tiers that wait for a named person before the action runs',
    source_url: 'https://openai.github.io/openai-agents-python/human_in_the_loop/',
  },
  'gov-07': { evidence: 'Law-firm clients ask for proof that their data never trains a model and that a person supervises the output; a generic assurance does not satisfy them.', metric_value: null, metric_unit: null, source_url: null },
  'ag-fh-01': { risk_notes: 'Say it is a virtual assistant in the first message. Answers on price, refunds and policy come only from the help-center articles; anything outside them goes to a person, and a person reviews a daily sample of conversations.' },
  'ag-pp-01': { risk_notes: 'Inbound answering only: callbacks go by text to the caller who just contacted us, or by a person. Safety scripts (gas, carbon monoxide, flooding) hand off to a person instantly. Say it is a virtual assistant at the start of the call.' },
  'ag-bpi-02': { risk_notes: 'Client confidentiality: separate workspaces per client, no cross-client retrieval, no-training model terms. Political clients: label AI-generated ad content and keep a person on every final cut.' },
  'ag-fh-06': { risk_notes: 'A person makes every denial, and customers get a clear appeal path.' },
};

/* ── PRG analyst overlays (est.) ─────────────────────────────────────────
   The dataset values are ceilings. These overlays add what a CEO needs before approving anything:
   value type and risk haircut, cost to build and run, calendar dates, ramp, and gate fixes. */
const START = { y: 2026, m: 9 };                 // month 0 = October 2026 (approval this month)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const absMo = mo => START.y * 12 + START.m + Math.floor(mo);
const qOf = mo => { const t = absMo(mo); return `Q${Math.floor((t % 12) / 3) + 1}-${String(Math.floor(t / 12)).slice(2)}`; };
const qRange = (s, e) => { const a = qOf(s), b = qOf(e - 0.01); return a === b ? a : `${a}–${b}`; };
const monOf = mo => { const t = absMo(mo); return `${MON[t % 12]} ${Math.floor(t / 12)}`; };
const TS_MATURITY_MO = (2027 * 12 + 11) - (START.y * 12 + START.m); // Dec 2027

/* Value type: what kind of EBITDA each formula produces, and how much of it we count when risk-adjusting. */
const VT = {
  cost: { label: 'Hard cost-out', short: 'Cost-out', hair: [1, 1], col: 'var(--ag-vt-cost)', rule: 'counted at 100%' },
  wc: { label: 'Working-capital carry', short: 'WC carry', hair: [1, 1], col: 'var(--ag-vt-wc)', rule: 'counted at 100% (interest on cash released)' },
  rev: { label: 'Margin on revenue lift & leakage recovery', short: 'Revenue lift', hair: [0.5, 0.5], col: 'var(--ag-vt-rev)', rule: 'counted at 50% (overlaps between agents, unproven at our scale)' },
  product: { label: 'New recurring products', short: 'New products', hair: [0.5, 0.5], col: 'var(--ag-vt-product)', rule: 'counted at 50% (needs buyers and contracts)' },
  cap: { label: 'Freed capacity (hours × loaded rate)', short: 'Capacity', hair: [0, 0.5], col: 'var(--ag-vt-cap)', rule: 'counted at 0–50%: EBITDA only with a hiring-avoidance or headcount plan' },
};
const VT_ORDER = ['cost', 'wc', 'rev', 'product', 'cap'];
const VTYPE = {
  'ag-pp-08': 'cost', 'ag-cet-08': 'cost', 'ag-fl-01': 'cost', 'ag-ts-06': 'cost', 'ag-ts-08': 'cost', 'ag-fh-01': 'cost',
  'ag-ts-05': 'wc', 'ag-ts-07': 'wc',
  'ag-fl-02': 'product', 'ag-bpi-01': 'product', 'ag-bpi-06': 'product', 'ag-cet-06': 'product',
  'ag-cet-01': 'cap', 'ag-cet-02': 'cap', 'ag-cet-03': 'cap', 'ag-fl-03': 'cap', 'ag-fl-04': 'cap', 'ag-fl-05': 'cap', 'ag-ts-01': 'cap', 'ag-bpi-02': 'cap', 'ag-bpi-03': 'cap', 'ag-bpi-05': 'cap', 'ag-fh-07': 'cap',
};
const vtype = a => VTYPE[a.id] || 'rev';

/* Evidence type of the cited metric: only "effect" (an outcome from a comparable deployment) gets a headline number. */
const EFFECT = new Set(['ag-pp-01', 'ag-pp-03', 'ag-pp-04', 'ag-pp-05', 'ag-cet-02', 'ag-cet-08', 'ag-fl-03', 'ag-fl-04', 'ag-fl-06', 'ag-ts-01', 'ag-ts-03', 'ag-ts-07', 'ag-ts-08', 'ag-bpi-05', 'ag-fh-01', 'ag-fh-05']);
const BENCH = new Set(['ag-pp-08', 'ag-cet-01', 'ag-cet-05', 'ag-fl-01', 'ag-ts-02', 'ag-ts-05', 'ag-ts-06', 'ag-fh-03', 'ag-fh-04', 'ag-fh-07']);
const evType = a => EFFECT.has(a.id) ? 'effect' : BENCH.has(a.id) ? 'benchmark' : 'context';

/* Cost model (analyst assumption until vendor quotes exist). */
const COST = {
  engWeek: 5000,                                   // PRG agent engineer, ~$250K loaded / 50 weeks
  fixed: 20000,                                    // implementation fee, evaluation set, 30-day pilot
  fte: { buy: 0.25, hybrid: 0.5, build: 1 },       // engineer share during the deploy weeks
  licence: { buy: 36000, hybrid: 30000, build: 0 },// vendor licence a year
  model: { buy: 0, hybrid: 12000, build: 24000 },  // model/API and hosting spend a year
  upkeep: 25000,                                   // 0.1 engineer a year for evals, drift checks, fixes
};
/* Formulas that already subtract a software or unit cost: do not charge the licence twice. */
const NETTED = new Set(['ag-pp-01', 'ag-pp-07', 'ag-pp-08', 'ag-cet-08', 'ag-fl-01', 'ag-ts-06', 'ag-fh-01']);
/* One-time cash released, from the formula inputs (not in the annual value). */
const CASH = {
  'ag-ts-05': { usd: 45e6 * 0.05, how: '5% of ~$45M inventory' },
  'ag-ts-07': { usd: 3 * 285e6 / 365, how: '3 days of DSO on ~$285M revenue' },
  'ag-fh-04': { usd: 8e6 * 0.08, how: '8% less excess on ~$8M inventory' },
};
/* Re-sequencing: TS has the Dec-2027 maturity; its inventory agent must land before the Dec-2027 maturity. */
const RESEQ = { 'ag-ts-05': { from: 4, to: 2, why: 'Moved from wave 4 to wave 2. Thomas Scientific’s loan matures in December 2027; in wave 4 (Q4-27 to Q1-28) the inventory release would land after the refinancing.' } };
/* Revised wave gates. The dataset gated wave 1 on controls 1–5 only, although three wave-1 agents talk to customers. */
const GATE_FIX = {
  4: 'Monitoring agents priced as recurring services (contracts, SLAs, client reporting); AI-content labeling live at BPI and Fair Harbor. (The Frontline confidentiality evidence pack moved to the wave-1 gate.)',
};
const GOV_GATE = {
  'gov-01': 'Wave-1 gate', 'gov-02': 'Wave-1 gate', 'gov-03': 'Wave-1 gate', 'gov-04': 'Wave-1 gate', 'gov-05': 'Wave-1 gate',
  'gov-06': 'Wave-1 gate · customer-facing', 'gov-07': 'Wave-1 gate · Frontline', 'gov-08': 'Wave-2 gate · finance', 'gov-09': 'Every agent, from launch',
};
const RAMP_MO = 6; // linear ramp to full value over two quarters after go-live (same window as the kill rule)

const E = {}; // per-agent economics, keyed by id
function econ(a) {
  const d = decision(a); const t = vtype(a); const v = a.est_annual_value_usd || 0; const [lo, hi] = VT[t].hair;
  const engW = a.weeks_to_deploy * COST.fte[d];
  const build = engW * COST.engWeek + COST.fixed;
  const run = (NETTED.has(a.id) ? 0 : COST.licence[d]) + COST.model[d] + COST.upkeep;
  const radj = v * (lo + hi) / 2; const net = radj - run;
  const W = WAVES.find(w => w.wave === a.wave); const ws = W ? +W.months.split('-')[0] : 0;
  const live = ws + a.weeks_to_deploy / 4.345;
  return { d, t, v, engW, build, run, radjLo: v * lo, radjHi: v * hi, radj, net, netLo: v * lo - run, netHi: v * hi - run, payback: net > 0 ? build / (net / 12) : Infinity, live, cash: CASH[a.id]?.usd || 0 };
}
const sumBy = (list, f) => list.reduce((s, x) => s + (f(x) || 0), 0);
const pbTxt = m => !isFinite(m) ? 'no payback' : m < 1 ? '< 1 mo' : `${Math.round(m)} mo`;
const rampAt = (list, mo) => sumBy(list, a => a.est_annual_value_usd * Math.min(1, Math.max(0, (mo - E[a.id].live) / RAMP_MO)));
const ebitdaCentral = s => { s = String(s || ''); let m = s.match(/central\s*~?\$([\d.]+)M/i); if (m) return +m[1] * 1e6; m = s.match(/\$([\d.]+)\s*[-–]\s*([\d.]+)M/); return m ? (+m[1] + +m[2]) / 2 * 1e6 : null; };
const fmtMetric = (v, u) => { u = String(u || ''); const n = typeof v === 'number' && v >= 10000 ? v.toLocaleString('en-US') : String(v); if (u.startsWith('$')) return `$${n}${u.slice(1)}`; if (u.startsWith('%')) return `${n}${u}`; return `${n} ${u}`; };
const cashBy = co => qOf(Math.max(...AG.filter(a => a.company === co && E[a.id].cash).map(a => E[a.id].live)) + RAMP_MO);
const pct = (a, b) => b ? Math.round(a / b * 100) : null;

let D, AG = [], PAT = [], GOV = [], RA = {}, WAVES = [];
const S = { co: 'all', layer: 'all', wk: 12, sort: 'value', q: '', pattern: null, sel: null, more: false };
const mobile = () => matchMedia('(max-width: 960px)').matches;

export async function boot() {
  const [d, ev] = await Promise.all([
    fetch(ROOT + 'data/research/ai_agents_portfolio.json').then(r => { if (!r.ok) throw new Error('ai_agents_portfolio ' + r.status); return r.json(); }),
    fetch(ROOT + 'data/research/serviceos_evidence.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  D = d; AG = d.items.filter(i => i.kind === 'agent'); PAT = d.items.filter(i => i.kind === 'pattern'); GOV = d.items.filter(i => i.kind === 'governance');
  GOVNUM = Object.fromEntries(GOV.map((g, i) => [+String(g.id).replace(/\D/g, ''), i + 1]));
  for (const i of ev?.items || []) if (i.kind === 'roadmap_assumption') RA[i.company] = i;
  for (const i of d.items) if (OPS[i.id] && LEGAL.test([i.evidence, i.risk_notes, i.source_url, i.metric_unit].join(' '))) Object.assign(i, OPS[i.id]);
  // Reader-facing text: no internal ids or dataset names.
  const TXT = ['trigger', 'job_to_be_done', 'human_in_the_loop', 'risk_notes', 'build_once_note', 'description', 'evidence', 'requirement', 'owner', 'metric_claim'];
  for (const i of d.items) { for (const k of TXT) if (typeof i[k] === 'string') i[k] = deID(i[k]); if (Array.isArray(i.tools_it_uses)) i.tools_it_uses = i.tools_it_uses.map(deID); if (Array.isArray(i.shared_components)) i.shared_components = i.shared_components.map(deID); }
  d.meta.caveats = (d.meta.caveats || []).map(deID); d.meta.program_summary = deID(d.meta.program_summary);
  // Apply the re-sequencing to a copy of the waves and to each agent.
  WAVES = (d.meta.rollout_waves || []).map(w => ({ ...w, agents: [...w.agents] }));
  for (const [id, r] of Object.entries(RESEQ)) {
    const a = AG.find(x => x.id === id); if (!a) continue;
    WAVES.forEach(w => { w.agents = w.agents.filter(x => x !== id); }); WAVES.find(w => w.wave === r.to)?.agents.push(id); a.wave = r.to;
  }
  for (const a of AG) E[a.id] = econ(a);
  readURL();
  hero(); economics(); filters(); renderCatalog(); patterns(); timeline(); valueChart(); governance(); buildBuy(); companies(); rationale();
  const pick = S.sel && AG.find(a => a.id === S.sel);
  if (pick) select(pick.id, { scroll: false, open: false }); else if (!mobile()) select(sorted(filtered())[0]?.id, { scroll: false, open: false, url: false });
  return { faq: faq() };
}

function readURL() {
  const p = new URLSearchParams(location.search);
  if (COS.includes(p.get('co'))) S.co = p.get('co');
  if (LAYERS.includes(p.get('layer'))) S.layer = p.get('layer');
  if (p.get('pattern') && PAT.some(x => x.id === p.get('pattern'))) S.pattern = p.get('pattern');
  if (p.get('agent')) S.sel = p.get('agent');
}
function writeURL() {
  const p = new URLSearchParams();
  if (S.co !== 'all') p.set('co', S.co); if (S.layer !== 'all') p.set('layer', S.layer); if (S.pattern) p.set('pattern', S.pattern); if (S.sel) p.set('agent', S.sel);
  const q = p.toString(); try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch { /* sandboxed */ }
}

/* Portfolio-level economics, shared by the hero, the economics section and the FAQ. */
function totals(list = AG) {
  const ceil = sumBy(list, a => a.est_annual_value_usd); const build = sumBy(list, a => E[a.id].build); const run = sumBy(list, a => E[a.id].run);
  const radjLo = sumBy(list, a => E[a.id].radjLo), radjHi = sumBy(list, a => E[a.id].radjHi), radj = sumBy(list, a => E[a.id].radj);
  const net = radj - run;
  return { n: list.length, ceil, build, run, radjLo, radjHi, radj, netLo: radjLo - run, netHi: radjHi - run, net, netCeil: ceil - run, engW: sumBy(list, a => E[a.id].engW), payback: net > 0 ? build / (net / 12) : Infinity, cash: sumBy(list, a => E[a.id].cash) };
}
function waveRows() {
  return WAVES.map(w => {
    const ags = w.agents.map(id => AG.find(a => a.id === id)).filter(Boolean); const [s, e] = w.months.split('-').map(Number);
    const T = totals(ags); const weeks = (e - s) * 4.345;
    return { w, ags, s, e, T, eng: Math.max(1, Math.ceil(T.engW / weeks)), q: qRange(s, e) };
  });
}
const vtStrip = (list, cls = '') => {
  const tot = sumBy(list, a => a.est_annual_value_usd) || 1;
  return `<div class="vt-strip ${cls}" role="img" aria-label="Value ceiling by type: ${VT_ORDER.map(t => `${VT[t].short} ${money(sumBy(list.filter(a => vtype(a) === t), a => a.est_annual_value_usd))}`).join(', ')}">${VT_ORDER.map(t => { const v = sumBy(list.filter(a => vtype(a) === t), a => a.est_annual_value_usd); return v ? `<i class="vt-${t}" style="width:${v / tot * 100}%;background:${VT[t].col}" title="${esc(VT[t].label)}: ${money(v)}"></i>` : ''; }).join('')}</div>`;
};
const vtLegend = () => `<div class="vt-legend">${VT_ORDER.map(t => `<span><i class="vt-sw vt-${t}" style="background:${VT[t].col}"></i>${esc(VT[t].short)}</span>`).join('')}</div>`;

/* ── Hero ──────────────────────────────────────────────────────────────── */
function hero() {
  const T = totals();
  $('#hero-total').textContent = money(T.ceil);
  $('#hero-count').textContent = AG.length;
  $('#hero-radj').textContent = `${money(T.netLo)}–${money(T.netHi)}`;
  $('#hero-vt').innerHTML = vtStrip(AG) + vtLegend();
  $('#hero-kpis').innerHTML = [['Agents', AG.length, 'Across six companies'], ['Build cost', money(T.build), 'One-time, all waves'], ['Run cost a year', money(T.run), 'Licences, model spend, upkeep'], ['Payback', pbTxt(T.payback), 'On risk-adjusted net, mid case']].map(([k, v, s], i) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${k}</span><span class="sys-kpi-value">${v}${i ? EST() : ''}</span><span class="sys-kpi-sub">${s}</span></div>`).join('');
  { const g = new Date((D.meta.generated || '2026-10-06') + 'T12:00:00'); $('#gen-date').textContent = isNaN(g) ? 'Oct 2026' : g.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  const ss = sentences(deID(D.meta.program_summary)); const paras = [];
  for (let i = 0; i < ss.length; i += 3) paras.push(ss.slice(i, i + 3).join(' '));
  $('#summary-body').innerHTML = paras.map(p => `<p>${esc(p)}</p>`).join('') + `<p class="sum-note"><b>Overlay on this page:</b> the $${(T.ceil / 1e6).toFixed(1)}M is a ceiling. Net of estimated run costs and risk-adjusted by value type it is ${money(T.netLo)}–${money(T.netHi)} a year; see Program economics. Thomas Scientific's inventory agent moves to wave 2, and the wave-1 gate adds the legal-confidentiality control for Frontline.</p>`;
  // Run card cycles through the wave-1 agents.
  const seq = (WAVES[0]?.agents || []).map(id => AG.find(a => a.id === id)).filter(Boolean);
  let k = 0; const show = (a, animate) => {
    $('#run-id').textContent = `${CO[a.company].name} · agent run`;
    $('#run-trigger').textContent = clip(a.trigger, 120);
    $('#run-agent').textContent = a.agent;
    $('#run-tools').innerHTML = (a.tools_it_uses || []).slice(0, 3).map(t => `<span>${esc(clip(t, 28))}</span>`).join('');
    $('#run-human').textContent = clip(sentences(a.human_in_the_loop)[0], 130);
    $('#run-co').innerHTML = `${dot(a.company)} ${esc(CO[a.company].name)} · ${esc(a.os)}`;
    $('#run-val').textContent = `${money(a.est_annual_value_usd)} a year ceiling`;
    const steps = $$('#run .rs'); const st = $('#run-status');
    if (!animate) { steps.forEach(s => { s.style.transition = 'none'; s.classList.add('on'); void s.offsetWidth; s.style.transition = ''; }); st.textContent = 'awaiting approval'; st.classList.remove('ok'); return; }
    steps.forEach(s => s.classList.remove('on')); st.textContent = 'triggered'; st.classList.remove('ok');
    setTimeout(() => steps[0].classList.add('on'), 80);
    setTimeout(() => { steps[1].classList.add('on'); st.textContent = 'agent working'; }, 900);
    setTimeout(() => { steps[2].classList.add('on'); st.textContent = 'awaiting approval'; }, 1800);
    setTimeout(() => { st.textContent = 'approved by human'; st.classList.add('ok'); }, 3400);
  };
  if (seq.length) { show(seq[0], false); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { if (document.hidden) return; k = (k + 1) % seq.length; show(seq[k], true); }, 5200); }
}

/* ── Program economics: cost, team, risk-adjusted value, payback and the ask ── */
function economics() {
  const T = totals(); const WR = waveRows(); const w1 = WR[0]; const peak = WR.reduce((m, r) => r.eng > m.eng ? r : m, WR[0]);
  const fullMo = Math.max(...AG.map(a => E[a.id].live)) + RAMP_MO;
  const inv = Object.values(RA).map(r => r.investment_usd || [0, 0]); const invLo = sumBy(inv, x => x[0]), invHi = sumBy(inv, x => x[1]);
  $('#eco-kpis').innerHTML = [
    ['Ceiling a year', money(T.ceil), 'Every agent ramped, before costs'],
    ['Risk-adjusted net a year', `${money(T.netLo)}–${money(T.netHi)}`, 'Haircut by value type, less run cost'],
    ['Build, one-time', money(T.build), `${Math.round(T.engW)} engineer-weeks plus pilots`],
    ['Run cost a year', money(T.run), 'Licences, model spend, upkeep'],
    ['Payback', pbTxt(T.payback), 'Build ÷ monthly risk-adjusted net (mid case)'],
    ['Agent engineers', `${w1.eng} → ${peak.eng}`, `${w1.q}, peaking in ${peak.q}`],
  ].map(([k, v, s]) => `<div class="sys-kpi"><span class="sys-kpi-label">${k}</span><span class="sys-kpi-value">${v}${EST()}</span><span class="sys-kpi-sub">${s}</span></div>`).join('');
  $('#eco-strip').innerHTML = vtStrip(AG, 'vt-lg') + vtLegend();
  $('#eco-types').innerHTML = `<thead><tr><th>Value type</th><th class="n">Agents</th><th class="n">Ceiling</th><th class="rule">How we count it</th><th class="n">Risk-adjusted (est.)</th></tr></thead><tbody>${VT_ORDER.map(t => {
    const L = AG.filter(a => vtype(a) === t); const v = sumBy(L, a => a.est_annual_value_usd); const [lo, hi] = VT[t].hair;
    return `<tr><td><i class="vt-sw" style="background:${VT[t].col}"></i>${esc(VT[t].label)}<small class="rule-m">${esc(VT[t].rule)}</small></td><td class="n">${L.length}</td><td class="n">${money(v)}</td><td class="rule">${esc(VT[t].rule)}</td><td class="n">${lo === hi ? money(v * lo) : `${money(v * lo)}–${money(v * hi)}`}</td></tr>`;
  }).join('')}<tr class="tot"><td>Total<small class="rule-m">net of est. run cost ${money(T.run)} a year</small></td><td class="n">${AG.length}</td><td class="n">${money(T.ceil)}</td><td class="rule">less est. run cost ${money(T.run)} a year</td><td class="n">${money(T.netLo)}–${money(T.netHi)}</td></tr></tbody>`;
  const capV = sumBy(AG.filter(a => vtype(a) === 'cap'), a => a.est_annual_value_usd);
  const nettedN = AG.filter(a => NETTED.has(a.id)).length;
  $('#eco-types-foot').innerHTML = `${AG.filter(a => vtype(a) === 'cap').length} agents (${money(capV)}, ${pct(capV, T.ceil)}% of the ceiling) are hours saved × loaded rate. That is EBITDA only if a company hires fewer people or redeploys them to billable work, so each one needs a named hiring-avoidance plan before it is counted. Only ${nettedN} of ${AG.length} value formulas subtract a run cost; the run costs here are charged to the other ${AG.length - nettedN}.`;
  $('#eco-waves').innerHTML = `<thead><tr><th>Wave</th><th>When</th><th class="n">Agents</th><th class="n">Build</th><th class="n">Run a year</th><th class="n">Engineers</th><th class="n">Ceiling</th><th class="n">Risk-adjusted net</th><th class="n">Payback</th></tr></thead><tbody>${WR.map(r => `<tr><td>Wave ${r.w.wave}</td><td style="white-space:nowrap">${r.q}</td><td class="n">${r.ags.length}</td><td class="n">${money(r.T.build)}</td><td class="n">${money(r.T.run)}</td><td class="n">${r.eng}</td><td class="n">${money(r.T.ceil)}</td><td class="n">${money(r.T.netLo)}–${money(r.T.netHi)}</td><td class="n">${pbTxt(r.T.payback)}</td></tr>`).join('')}<tr class="tot"><td>Program</td><td style="white-space:nowrap">${qRange(0, +WAVES[WAVES.length - 1].months.split('-')[1])}</td><td class="n">${AG.length}</td><td class="n">${money(T.build)}</td><td class="n">${money(T.run)}</td><td class="n">peak ${peak.eng}</td><td class="n">${money(T.ceil)}</td><td class="n">${money(T.netLo)}–${money(T.netHi)}</td><td class="n">${pbTxt(T.payback)}</td></tr></tbody>`;
  const neg = AG.filter(a => E[a.id].netHi <= 0);
  $('#eco-assume').innerHTML = [
    `Build cost = weeks to go live × engineer share (buy ${COST.fte.buy}, hybrid ${COST.fte.hybrid}, build ${COST.fte.build}) × $${COST.engWeek.toLocaleString()}/week (a ~$250K loaded agent engineer) + $${(COST.fixed / 1e3)}K for implementation, an evaluation set and a 30-day pilot.`,
    `Run cost a year = vendor licence (buy $${COST.licence.buy / 1e3}K, hybrid $${COST.licence.hybrid / 1e3}K, build $0) + model and hosting spend (buy $0, hybrid $${COST.model.hybrid / 1e3}K, build $${COST.model.build / 1e3}K) + $${COST.upkeep / 1e3}K upkeep (0.1 engineer). The licence is skipped for the ${nettedN} formulas that already subtract a software or unit cost.`,
    `Engineers per wave = engineer-weeks ÷ weeks in the wave, rounded up. The plan's wave-1 gate named one engineer; six agents in 13 weeks need about ${Math.round(w1.T.engW)} engineer-weeks, so ${w1.eng}.`,
    `Payback = build cost ÷ monthly risk-adjusted value net of run cost (mid case: capacity counted at 25%).`,
    neg.length ? `${neg.length} agent${neg.length > 1 ? 's do' : ' does'} not cover its run cost even in the high case: ${neg.map(a => `${a.agent} (${CO[a.company].name})`).join('; ')}. Re-scope or drop before the wave starts.` : '',
    `Cross-check: the agent build cost (${money(T.build)}) is ${pct(T.build, invLo)}–${pct(T.build, invHi) }% of the ${money(invLo)}–${money(invHi)} OS investment envelope in the tech-enablement evidence file, which also pays for system-of-record upgrades, data work and change management. Replace with vendor quotes as they arrive.`,
  ].filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');
  // The ask.
  const W1 = w1.T; const cos = new Set(w1.ags.map(a => a.company)).size;
  $('#ask').innerHTML = `<p class="sys-card-label">The ask</p>
    <h3 id="ask-h">Approve wave 1: ${w1.ags.length} agents, ${money(W1.build)} to build, ${w1.eng} agent engineers.</h3>
    <ul class="ask-list">
      <li><b>Scope.</b> ${w1.ags.length} agents across ${cos} companies in ${w1.q} (${monOf(w1.s)} to ${monOf(w1.e - 0.01)}): ${w1.ags.map(a => esc(a.agent)).join('; ')}.</li>
      <li><b>Budget.</b> ${money(W1.build)} one-time (engineering, implementation, eval sets, pilots) and ${money(W1.run)} a year to run. Est., until vendor quotes.</li>
      <li><b>Team.</b> ${w1.eng} agent engineers plus a named owner in each company. Wave 2 needs ${WR[1]?.eng ?? '—'}.</li>
      <li><b>Controls.</b> 1–${gnum(5)} live everywhere before go-live; control ${gnum(7)} and the confidentiality evidence pack before the Frontline service desk touches law-firm data.</li>
      <li><b>Day-90 gate review.</b> Each agent measured against its 8-week baseline. Continue at ≥ 50% of target; otherwise fix or stop.</li>
    </ul>
    <div class="ask-val"><div><span>Wave-1 ceiling</span><b class="sys-num">${money(W1.ceil)}</b></div><div><span>Risk-adjusted net</span><b class="sys-num">${money(W1.netLo)}–${money(W1.netHi)}</b></div><div><span>Payback</span><b class="sys-num">${pbTxt(W1.payback)}</b></div></div>
    <p class="ask-foot">All figures estimated until vendor quotes arrive.</p>
    <p class="ask-foot">Full ceiling run-rate arrives around ${qOf(fullMo)} (month ${Math.round(fullMo)}), not month 18: agents ramp over two quarters after go-live.</p>`;
}

/* ── Catalog ───────────────────────────────────────────────────────────── */
function filters() {
  const cnt = k => AG.filter(a => a.company === k).length;
  $('#f-co').innerHTML = `<button type="button" class="sys-chip" data-c="all" aria-pressed="${S.co === 'all'}">All <span class="n">${AG.length}</span></button>` +
    COS.map(c => `<button type="button" class="sys-chip" data-c="${c}" data-co="${c}" aria-pressed="${S.co === c}">${esc(CO[c].name)} <span class="n">${cnt(c)}</span></button>`).join('');
  $('#f-layer').innerHTML = `<button type="button" class="sys-chip" data-layer="all" aria-pressed="${S.layer === 'all'}">All layers</button>` +
    LAYERS.map(l => `<button type="button" class="sys-chip" data-layer="${l}" aria-pressed="${S.layer === l}">${esc(l[0].toUpperCase() + l.slice(1))} <span class="n">${AG.filter(a => a.layer === l).length}</span></button>`).join('');
  $('#f-co').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; S.co = b.dataset.c; syncChips(); renderCatalog(); };
  $('#f-layer').onclick = e => { const b = e.target.closest('[data-layer]'); if (!b) return; S.layer = b.dataset.layer; syncChips(); renderCatalog(); };
  const wk = $('#f-wk'); const ws = AG.map(a => a.weeks_to_deploy); wk.min = Math.min(...ws); wk.max = Math.max(...ws); wk.value = S.wk = Math.max(...ws);
  wk.oninput = () => { S.wk = +wk.value; $('#f-wk-out').textContent = S.wk; renderCatalog(); };
  $('#f-wk-out').textContent = S.wk;
  $('#f-sort').onchange = e => { S.sort = e.target.value; renderCatalog(); };
  let t; $('#f-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value.trim().toLowerCase(); renderCatalog(); }, 120); };
  $('#f-reset').onclick = () => resetFilters();
  $('#cards').onclick = e => { const c = e.target.closest('#cards [data-id]'); if (c) select(c.dataset.id, { scroll: false, open: true }); };
}
function resetFilters() {
  Object.assign(S, { co: 'all', layer: 'all', q: '', pattern: null, wk: +$('#f-wk').max });
  $('#f-wk').value = S.wk; $('#f-wk-out').textContent = S.wk; $('#f-q').value = ''; syncChips(); renderCatalog();
}
function syncChips() {
  $$('#f-co .sys-chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === S.co));
  $$('#f-layer .sys-chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.layer === S.layer));
}
const filtered = () => AG.filter(a => (S.co === 'all' || a.company === S.co) && (S.layer === 'all' || a.layer === S.layer) && a.weeks_to_deploy <= S.wk && (!S.pattern || a.pattern_id === S.pattern) &&
  (!S.q || [a.agent, a.job_to_be_done, a.trigger, a.vendor_or_build, a.os, CO[a.company].full, ...(a.tools_it_uses || [])].join(' ').toLowerCase().includes(S.q)));
const sorted = list => list.slice().sort({
  value: (a, b) => b.est_annual_value_usd - a.est_annual_value_usd,
  net: (a, b) => E[b.id].net - E[a.id].net,
  payback: (a, b) => E[a.id].payback - E[b.id].payback || E[b.id].net - E[a.id].net,
  perweek: (a, b) => b.est_annual_value_usd / b.weeks_to_deploy - a.est_annual_value_usd / a.weeks_to_deploy,
  weeks: (a, b) => a.weeks_to_deploy - b.weeks_to_deploy || b.est_annual_value_usd - a.est_annual_value_usd,
  wave: (a, b) => a.wave - b.wave || b.est_annual_value_usd - a.est_annual_value_usd,
}[S.sort] || ((a, b) => b.est_annual_value_usd - a.est_annual_value_usd));
function flowHTML() {
  return `<div class="flow" aria-label="Trigger, then agent, then human approval"><span class="fn fn-t">${ICO.t}Trigger</span><span class="fl"></span><span class="fn fn-a">${ICO.a}Agent</span><span class="fl"></span><span class="fn fn-h">${ICO.h}Approve</span></div>`;
}
function renderCatalog() {
  const list = sorted(filtered()); const v = list.reduce((s, a) => s + a.est_annual_value_usd, 0);
  const T = totals(list); $('#f-count').innerHTML = `<b>${list.length}</b> of ${AG.length} agents · <b class="sys-num">${money(v)}</b> ceiling a year · <b class="sys-num">${money(T.netLo)}–${money(T.netHi)}</b> risk-adjusted net${EST()}`;
  const p = S.pattern && PAT.find(x => x.id === S.pattern);
  $('#f-pattern').innerHTML = p ? `<span class="pchip">Pattern: ${esc(p.pattern)} <button type="button" aria-label="Clear pattern filter">×</button></span>` : '';
  if (p) $('#f-pattern button').onclick = () => { S.pattern = null; renderCatalog(); };
  const lim = mobile() ? 6 : 12; const shown = S.more ? list : list.slice(0, lim);
  $('#cards').innerHTML = list.length ? shown.map(a => `<button type="button" class="sys-card sys-card--link" data-co="${a.company}" data-id="${a.id}" aria-pressed="${a.id === S.sel}">
      <div class="c-top"><span class="c-co">${dot(a.company)}${esc(CO[a.company].name)}</span><span class="c-wave">Wave ${a.wave} · ${a.weeks_to_deploy} wks · payback ${pbTxt(E[a.id].payback)}</span></div>
      <h3>${esc(a.agent)}</h3>
      ${flowHTML()}
      <p class="c-trig"><b>When:</b> ${esc(a.trigger)}</p>
      <div class="c-meta"><span class="layer">${esc(a.layer)}</span><span class="dec dec-${decision(a)}">${DEC[decision(a)]}</span><span class="vt-tag" style="--vt:${VT[vtype(a)].col}">${esc(VT[vtype(a)].short)}</span><span class="c-val">${money(a.est_annual_value_usd)}${EST()}</span></div>
    </button>`).join('') + (list.length > shown.length ? `<button type="button" class="sys-btn sys-btn--secondary ag-more" id="cards-more">Show all ${list.length} agents <span aria-hidden="true">↓</span></button>` : '') : `<div class="ag-empty">No agents match these filters. <button type="button" class="ag-linkbtn" id="empty-reset">Reset filters</button></div>`;
  $('#empty-reset')?.addEventListener('click', resetFilters);
  $('#cards-more')?.addEventListener('click', e => { e.stopPropagation(); S.more = true; renderCatalog(); });
  writeURL();
}
function scrim() {
  let s = $('.scrim'); if (s) return s;
  s = document.createElement('div'); s.className = 'scrim'; s.onclick = closeSheet; document.body.appendChild(s); return s;
}
function closeSheet() { $('#inspector').classList.remove('open'); $('.scrim')?.classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function select(id, { scroll = true, open = true, url = true } = {}) {
  const a = AG.find(x => x.id === id); if (!a) return;
  S.sel = id; $$('#cards > [data-id]').forEach(c => c.setAttribute('aria-pressed', c.dataset.id === id));
  const P = PAT.find(p => p.id === a.pattern_id); const c = CO[a.company]; const dec = decision(a); const e = E[a.id]; const t = VT[e.t];
  const W = WAVES.find(w => w.wave === a.wave); const [ws, we] = (W?.months || '0-0').split('-').map(Number);
  const et = evType(a);
  const src = a.source_url ? `<a href="${esc(a.source_url)}" target="_blank" rel="noopener">${esc(host(a.source_url))} ↗</a>` : '';
  const evidence = et === 'effect'
    ? `<div class="ib"><h4>Effect evidence <span class="ev ev-effect">from a comparable company</span></h4><div class="metric"><b class="sys-num">${esc(a.metric_value)}</b><span>${esc(deID(a.metric_unit))}</span></div><p class="ag-mt">${esc(a.metric_claim)} ${src}</p></div>`
    : `<div class="ib"><h4>${et === 'benchmark' ? 'Benchmark' : 'Why it matters'} <span class="ev ev-${et}">${et === 'benchmark' ? 'industry benchmark, not an effect size' : 'context, not an effect size'}</span></h4><p class="ctx"><b>${esc(deID(fmtMetric(a.metric_value, a.metric_unit)))}.</b> ${esc(a.metric_claim)} ${src}</p><p class="ctx-note">No measured result at a comparable company yet; the value rests on the formula below until the 8-week baseline and pilot.</p></div>`;
  $('#inspector').innerHTML = `
    <div class="insp-head">
      <div class="insp-id">${dot(a.company)}<span>${esc(c.full)} · ${esc(a.os)}</span><button type="button" class="insp-close" aria-label="Close inspector">×</button></div>
      <h3>${esc(a.agent)}</h3>
      <p class="insp-sub"><span class="layer">${esc(a.layer)}</span> <span class="dec dec-${dec}">${DEC[dec]}</span> <span class="vt-tag" style="--vt:${t.col}">${esc(t.short)}</span> ${P ? `<span class="tag">${esc(P.pattern)}</span>` : ''}</p>
    </div>
    <div class="insp-body">
      <div class="insp-stats"><div><span>Ceiling a year</span><b>${money(a.est_annual_value_usd)}</b></div><div><span>Go live</span><b>${a.weeks_to_deploy} wks</b></div><div><span>Wave ${a.wave}</span><b>${esc(qRange(ws, we))}</b></div></div>
      ${RESEQ[a.id] ? `<p class="reseq"><b>Re-sequenced.</b> ${esc(RESEQ[a.id].why)}</p>` : ''}
      <div class="ib"><h4>Economics ${EST()}</h4>
        <div class="insp-stats"><div><span>Build</span><b>${money(e.build)}</b></div><div><span>Run a year</span><b>${money(e.run)}</b></div><div><span>Payback</span><b>${pbTxt(e.payback)}</b></div></div>
        <p class="ag-mt"><b>${esc(t.label)}</b>, ${esc(t.rule)}. Risk-adjusted ${e.radjLo === e.radjHi ? money(e.radjLo) : `${money(e.radjLo)}–${money(e.radjHi)}`} a year; net of run cost ${e.netLo === e.netHi ? money(e.netLo) : `${money(e.netLo)}–${money(e.netHi)}`}.${NETTED.has(a.id) ? ' The formula already nets its software or unit cost, so no licence is charged again.' : ''}</p>
        ${e.cash ? `<p class="cash"><b>${money(e.cash)} one-time cash released</b> (${esc(CASH[a.id].how)}), not in the annual value.</p>` : ''}
      </div>
      <ol class="vflow">
        <li class="rs-trigger"><span class="rs-ico">${ICO.t}</span><div><span class="rs-k">Trigger</span><p>${esc(a.trigger)}</p></div></li>
        <li class="rs-agent"><span class="rs-ico">${ICO.a}</span><div><span class="rs-k">Agent · job to be done</span><p>${esc(a.job_to_be_done)}</p><div class="vf-tools">${(a.tools_it_uses || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></li>
        <li class="rs-human"><span class="rs-ico">${ICO.h}</span><div><span class="rs-k">Human approval</span><p>${esc(a.human_in_the_loop)}</p></div></li>
      </ol>
      ${evidence}
      <div class="ib"><h4>Value formula ${EST('assumption')}</h4><p class="formula">${esc(a.est_annual_value_formula.replace(/^ASSUMPTION \(analyst estimate, not company data\):\s*/, ''))}</p></div>
      <div class="ib"><h4>Vendor or build</h4><p>${esc(a.vendor_or_build)}</p>${(a.vendor_urls || []).length ? `<div class="links ag-mt">${a.vendor_urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))} ↗</a>`).join('')}</div>` : ''}</div>
      <div class="ib"><h4>Risks and controls</h4><p class="risk">${esc(deID(a.risk_notes))}</p></div>
      <div class="ib"><h4>Where it lives</h4><div class="links"><a href="${c.slug}/${c.osf}">${esc(c.os)} product page →</a><a href="${c.slug}/${c.pb}">${esc(c.pbl)} →</a><a href="../app.html#/${a.company}/overview">Portal module →</a></div></div>
    </div>`;
  $('.insp-close', $('#inspector')).onclick = closeSheet;
  $('#inspector').scrollTop = 0;
  if (url) writeURL();
  if (mobile() && open) { scrim().classList.add('open'); $('#inspector').classList.add('open'); $('#inspector').focus({ preventScroll: true }); }
  if (scroll) $('#catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function focusAgent(id) {
  const a = AG.find(x => x.id === id); if (!a) return;
  if (!filtered().some(x => x.id === id)) resetFilters();
  if (!S.more) { S.more = true; renderCatalog(); }
  select(id, { scroll: !mobile(), open: true });
  if (!mobile()) setTimeout(() => $(`#cards > [data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 450);
}

/* ── Patterns ──────────────────────────────────────────────────────────── */
function patterns() {
  $('#pattern-grid').innerHTML = PAT.map((p, i) => {
    const ags = AG.filter(a => a.pattern_id === p.id); const v = ags.reduce((s, a) => s + a.est_annual_value_usd, 0);
    return `<article class="sys-card pat">
      <div class="pat-n"><span>Pattern ${i + 1}</span><span class="pat-cos">${(p.companies || []).map(dot).join('')}</span></div>
      <h3>${esc(p.pattern)}</h3>
      <p>${esc(p.description)}</p>
      <div class="pat-ev"><b class="sys-num">${esc(p.metric_value)}</b><span>${esc(deID(p.metric_unit))}</span><span style="margin-top:4px">${esc(clip(p.evidence, 150))} <a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(host(p.source_url))} ↗</a></span></div>
      <div class="pat-comp">${(p.shared_components || []).map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      <p class="pat-note">${esc(p.build_once_note)}</p>
      <div class="pat-foot"><span><b>${ags.length}</b> agents · ${money(v)}${EST()}</span><button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-pat="${p.id}">Show agents →</button></div>
    </article>`;
  }).join('');
  $('#pattern-grid').onclick = e => { const b = e.target.closest('[data-pat]'); if (!b) return; Object.assign(S, { co: 'all', layer: 'all', q: '', pattern: b.dataset.pat }); $('#f-q').value = ''; syncChips(); renderCatalog(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); };
}

/* ── Rollout timeline ──────────────────────────────────────────────────── */
function timeline() {
  const WR = waveRows();
  const span = Math.max(...WR.map(r => r.e), 18);
  const ticks = []; for (let m = 0; m < span; m += 3) ticks.push(m);
  const wname = ['Inbound contact & documents', 'Finance & shared services', 'Revenue agents', 'Monitoring as a service'];
  const mat = TS_MATURITY_MO + 0.5; const matPct = mat / span * 100;
  const fullMo = Math.max(...AG.map(a => E[a.id].live)) + RAMP_MO;
  $('#timeline').innerHTML = `<div class="tl-axis"><div></div><div class="tl-ticks">${ticks.map(m => `<span style="left:${(m + 1.5) / span * 100}%;transform:translateX(-50%)">${qOf(m)}</span>`).join('')}</div></div>` + WR.map((r, i) => {
    const { w, ags, s, e } = r; const cum = WR.slice(0, i + 1).flatMap(x => x.ags);
    const live = rampAt(AG.filter(a => cum.includes(a)), e);
    const gate = GATE_FIX[w.wave] || (w.wave === 1
      ? `Controls 1–${gnum(5)} live at every company (access, approval tiers, audit log, model terms and vendor review), because three wave-1 agents talk to customers; control ${gnum(7)} and its confidentiality evidence pack live before the Frontline service desk touches law-firm data; 8-week KPI baselines captured; ${r.eng} agent engineers (about ${Math.round(r.T.engW)} engineer-weeks in 13 weeks) and a named owner in each company.`
      : deID(w.prerequisite));
    const moved = ags.filter(a => RESEQ[a.id]?.to === w.wave);
    return `<article class="sys-card wave">
      <div class="w-meta"><span class="w-mo">${esc(r.q)} · months ${s}–${e}</span><h3>Wave ${w.wave} · ${esc(wname[i] || '')}</h3>
        <div class="w-stats"><div><span>Agents</span><b>${ags.length}</b></div><div><span>Adds (ceiling)</span><b>${money(r.T.ceil)}${EST()}</b></div><div><span>Live at wave end</span><b>${money(live)}${EST()}</b></div></div></div>
      <div>
        <div class="w-track" aria-hidden="true"><div class="w-bar" style="left:${s / span * 100}%;width:${(e - s) / span * 100}%">Wave ${w.wave}</div>${matPct <= 100 ? `<i class="w-mat" style="left:${matPct}%"></i>` : ''}</div>
        <div class="sys-chips w-chips">${ags.map(a => `<button type="button" class="sys-chip${RESEQ[a.id] ? ' w-moved' : ''}" data-co="${CO[a.company] ? a.company : ''}" data-id="${a.id}" title="${esc(CO[a.company].full)} · ${money(a.est_annual_value_usd)} ceiling">${esc(a.agent)}</button>`).join('')}</div>
        ${moved.length ? `<p class="w-note"><b>Moved in</b><span>${moved.map(a => esc(RESEQ[a.id].why)).join(' ')}</span></p>` : ''}
        <p class="w-gate"><b>Gate</b><span>${esc(gate)}</span></p>
      </div>
    </article>`;
  }).join('') + `<p class="tl-foot"><i class="w-mat-key" aria-hidden="true"></i> Red line: Thomas Scientific loan maturity, December 2027. Calendar assumes approval this month (month 0 = ${monOf(0)}). <b>Live at wave end</b> assumes each agent goes live its stated number of weeks after the wave starts and ramps evenly to full value over two quarters, the same window the kill rule uses. The full ${money(totals().ceil)} ceiling run-rate arrives around ${qOf(fullMo)}, not month 18.</p>`;
  $('#timeline').onclick = e => { const b = e.target.closest('.w-chips .sys-chip'); if (b) focusAgent(b.dataset.id); };
}

/* ── Value by company (inline SVG stacked by value type, re-rendered at container width) ─────── */
function companyRows() {
  return COS.map(c => {
    const ags = AG.filter(a => a.company === c); const v = sumBy(ags, a => a.est_annual_value_usd); const T = totals(ags);
    const ra = RA[c]; const eb = ebitdaCentral(ra?.current_ebitda_estimate);
    const seg = VT_ORDER.map(t => ({ t, v: sumBy(ags.filter(a => vtype(a) === t), a => a.est_annual_value_usd) }));
    return { c, v, n: ags.length, T, seg, lo: ra?.ebitda_impact_usd?.[0], hi: ra?.ebitda_impact_usd?.[1], pRange: ra?.ebitda_impact_pct_revenue, pct: v / CO[c].rev * 100, eb, ebPct: pct(v, eb), ofTop: pct(v, ra?.ebitda_impact_usd?.[1]) };
  }).sort((a, b) => b.v - a.v);
}
const STRETCH = 75; // agents using ≥ 75% of the top of their OS case need re-basing
function valueChart() {
  const rows = companyRows(); const box = $('#chart'); const tip = $('#tip'); const card = box.closest('.ag-chart-card');
  const hot = rows.filter(r => r.ofTop >= STRETCH).sort((a, b) => b.ofTop - a.ofTop);
  $('#val-sub').innerHTML = `Bars are each company's agent ceiling by value type; the whisker is its OS program's EBITDA case. <b>Agents sit inside that case, so never add the two.</b>`;
  $('#chart-legend').innerHTML = VT_ORDER.map(t => `<span><i class="vt-sw" style="background:${VT[t].col}"></i>${esc(VT[t].short)}</span>`).join('') + '<span><i class="lg-rng"></i>OS program EBITDA case (estimated)</span>';
  const draw = () => {
    const W = Math.max(300, box.clientWidth); const small = W < 520;
    const L = small ? 118 : 178, R = small ? 52 : 70, T = 6, RH = small ? 56 : 52, B = 26;
    const H = T + rows.length * RH + B;
    const maxV = Math.max(...rows.map(r => Math.max(r.v, r.hi || 0))); const step = maxV > 4e6 ? 1e6 : 5e5; const top = Math.ceil(maxV / step) * step;
    const x = v => L + (W - L - R) * v / top; const ticks = []; for (let t = 0; t <= top + 1; t += step) ticks.push(t);
    const bh = 18;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:${VT.cap.col}"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-line" stroke-width="2.2" opacity=".55"/></pattern></defs>
      ${ticks.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}" class="${t ? 'gl' : 'gl0'}" stroke-width="1"/><text x="${x(t)}" y="${H - 8}" font-size="11" class="ax" text-anchor="middle">${t ? money(t, t % 1e6 ? 1 : 0) : '$0'}</text>`).join('')}
      ${rows.map((r, i) => { const y = T + i * RH + 8; const cy = y + bh / 2; let acc = 0; const flag = r.ofTop >= STRETCH;
        const segs = r.seg.filter(z => z.v).map(z => { const x0 = x(acc), x1 = x(acc + z.v); acc += z.v; return `<rect x="${x0 + .5}" y="${y}" width="${Math.max(0, x1 - x0 - 1)}" height="${bh}" rx="2" style="fill:${z.t === 'cap' ? 'url(#hatch)' : VT[z.t].col}"/>`; }).join('');
        return `<g class="row" data-c="${r.c}">
        <rect class="row-hit" x="0" y="${T + i * RH}" width="${W}" height="${RH}" rx="6"/>
        <rect x="${L - 6}" y="${y}" width="3" height="${bh}" rx="1.5" style="fill:${CO[r.c].hex}"/>
        <text x="${L - 12}" y="${cy - 1}" font-size="${small ? 12 : 13}" font-weight="600" class="nm" text-anchor="end">${esc(CO[r.c].name)}</text>
        <text x="${L - 12}" y="${cy + 14}" font-size="11" class="${flag ? 'flg' : 'ax'}" font-weight="${flag ? 600 : 400}" text-anchor="end">${r.ebPct != null ? `${r.ebPct}% of adj. EBITDA` : `${r.n} agents`}</text>
        ${r.lo != null ? `<g class="wh" stroke-width="2"><line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${y + bh + 7}" y2="${y + bh + 7}"/><line x1="${x(r.lo)}" x2="${x(r.lo)}" y1="${y + bh + 3}" y2="${y + bh + 11}"/><line x1="${x(r.hi)}" x2="${x(r.hi)}" y1="${y + bh + 3}" y2="${y + bh + 11}"/></g>` : ''}
        ${segs}
        <text x="${x(r.v) + 7}" y="${cy + 4}" font-size="12.5" font-weight="600" class="nm mono">${money(r.v)}</text>
      </g>`; }).join('')}
    </svg>`;
    $$('.row', box).forEach(g => {
      const r = rows.find(z => z.c === g.dataset.c);
      g.onmousemove = e => {
        tip.hidden = false; const cb = card.getBoundingClientRect();
        tip.innerHTML = `<b>${esc(CO[r.c].full)}</b> · ${esc(CO[r.c].os)}${r.seg.filter(z => z.v).map(z => `<div class="tr"><span>${esc(VT[z.t].short)}</span><span>${money(z.v)}</span></div>`).join('')}<div class="tr tr-sep"><span>Ceiling (${r.n} agents)</span><span>${money(r.v)}</span></div><div class="tr"><span>Risk-adjusted net of run cost</span><span>${money(r.T.netLo)}–${money(r.T.netHi)}</span></div>${r.eb ? `<div class="tr"><span>Share of adj. EBITDA</span><span>${r.ebPct}%</span></div>` : ''}${r.lo != null ? `<div class="tr"><span>OS EBITDA case</span><span>${money(r.lo)}–${money(r.hi)}</span></div><div class="tr"><span>Share of case top</span><span>${r.ofTop}%</span></div>` : ''}`;
        let lx = e.clientX - cb.left + 14, ly = e.clientY - cb.top + 14; if (lx + 250 > cb.width) lx = e.clientX - cb.left - 260; tip.style.left = Math.max(6, lx) + 'px'; tip.style.top = ly + 'px';
      };
      g.onmouseleave = () => { tip.hidden = true; };
    });
  };
  draw(); let raf; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }).observe(box);
  const tot = totals();
  $('#chart-table').innerHTML = `<div class="tbl-scroll"><table class="ag-tbl"><thead><tr><th>Company</th><th class="n">Agents</th><th class="n">Ceiling a year</th><th class="n">Risk-adjusted net</th><th class="n">% of revenue</th><th class="n">% of adj. EBITDA</th><th class="n">OS EBITDA case</th><th class="n">% of case top</th></tr></thead><tbody>${rows.map(r => `<tr${r.ofTop >= STRETCH ? ' class="flag"' : ''}><td>${dot(r.c)} ${esc(CO[r.c].full)}</td><td class="n">${r.n}</td><td class="n">${money(r.v)}</td><td class="n">${money(r.T.netLo)}–${money(r.T.netHi)}</td><td class="n">${r.pct.toFixed(1)}%${r.pRange ? `<small> vs ${r.pRange[0]}–${r.pRange[1]}%</small>` : ''}</td><td class="n">${r.ebPct != null ? r.ebPct + '%' : '—'}${r.c === 'cet' ? '*' : ''}</td><td class="n">${r.lo != null ? `${money(r.lo)}–${money(r.hi)}` : '—'}</td><td class="n">${r.ofTop != null ? r.ofTop + '%' : '—'}</td></tr>`).join('')}<tr class="tot"><td>Portfolio</td><td class="n">${AG.length}</td><td class="n">${money(tot.ceil)}</td><td class="n">${money(tot.netLo)}–${money(tot.netHi)}</td><td></td><td></td><td></td><td></td></tr></tbody></table></div><p class="tbl-note">Adj. EBITDA is the central current estimate in the tech-enablement evidence file (PP ~$2.6M, CET ~$4.5M*, Frontline ~$18M, Thomas ~$30M, BPI ~$22.5M, Fair Harbor ~$2M; all low confidence). *CET standalone, excluding Horton and NuWave, so CET's share is overstated. Revenue bases are the portal's midpoint estimates (PP ~$22M, CET+Horton+NuWave ~$80M, Frontline ~$120M, Thomas ~$285M, BPI ~$105M net, Fair Harbor ~$27.5M). Highlighted rows use ≥ ${STRETCH}% of their OS case top.</p>`;
  $$('.ag-chart-card .ag-seg button').forEach(b => b.onclick = () => {
    const t = b.dataset.view === 'table'; $$('.ag-chart-card .ag-seg button').forEach(x => x.setAttribute('aria-selected', x === b));
    $('#chart').hidden = t; $('#chart-table').hidden = !t; $('#chart-legend').hidden = t;
  });
  // Reality check: agents vs EBITDA and the OS case.
  $('#reality').innerHTML = rows.slice().sort((a, b) => (b.ofTop || 0) - (a.ofTop || 0)).map(r => `<div class="rc${r.ofTop >= STRETCH ? ' hot' : ''}"><span>${dot(r.c)}${esc(CO[r.c].name)}</span><span class="rc-bar"><i style="width:${Math.min(100, r.ofTop || 0)}%"></i></span><span>${r.ofTop ?? '—'}%</span></div>`).join('') + `<p class="vn-foot">Agent ceiling as a share of the top of each OS program's EBITDA case. Above ${STRETCH}% leaves almost nothing for the rest of the OS (systems, pricing, data), so re-base on measured baselines before using either number.</p>`;
  // Thomas Scientific: cash before EBITDA.
  const cashAg = AG.filter(a => E[a.id].cash).sort((a, b) => E[b.id].cash - E[a.id].cash); const tsCash = sumBy(cashAg.filter(a => a.company === 'ts'), a => E[a.id].cash);
  $('#ts-cash').innerHTML = `<p>Thomas Scientific carries est. 7–10x leverage and a loan maturing in <b>December 2027</b> (tech-enablement evidence file). For a refinancing, one-time cash matters more than run-rate EBITDA, and the annual values hide it.</p>
    <ul class="cash-list">${cashAg.filter(a => a.company === 'ts').map(a => { const W = WAVES.find(w => w.wave === a.wave); const [s, e] = W.months.split('-').map(Number); return `<li><span class="cl-n">${dot(a.company)}${esc(a.agent)}</span><span class="cl-v"><b>${money(E[a.id].cash)}</b> cash once · books ${money(a.est_annual_value_usd)} a year · ${qRange(s, e)}</span></li>`; }).join('')}</ul>
    <p class="vn-foot">${money(tsCash)} of Thomas cash starts landing in ${qOf(3)} and is fully released by ${cashBy('ts')} if both agents hit target, ahead of the December 2027 maturity; the inventory agent was moved up from wave 4 for this reason. Elsewhere, Fair Harbor's size-curve agent frees about ${money(E['ag-fh-04']?.cash || 0)} of inventory; Punctual Pros has no working-capital agent.</p>`;
  const WR = waveRows(); const mx = Math.max(...WR.map(r => r.T.ceil));
  $('#by-wave').innerHTML = WR.map(r => `<div class="bw"><span>Wave ${r.w.wave}</span><span class="bw-bar"><i style="width:${r.T.ceil / mx * 100}%"></i></span><span>${money(r.T.ceil)}</span></div>`).join('') + `<p class="vn-foot">Ceiling per wave after moving the Thomas inventory agent to wave 2. ${esc(deID(D.meta.value_summary?.basis || ''))}</p>`;
  const cv = (D.meta.caveats || []).map(deID);
  $('#caveats').innerHTML = [cv[0], cv[1], cv[2], `About a third of the ceiling is freed capacity valued at loaded rates; it becomes EBITDA only with a hiring-avoidance or headcount plan.`, cv[7]].filter(Boolean).map(c => `<li>${esc(c)}</li>`).join('');
}

/* ── Governance ────────────────────────────────────────────────────────── */
function governance() {
  $('#tiers').innerHTML = [
    ['Tier 0', 'Read and summarize', 'Agent reads records and drafts internal summaries.', 'No gate'],
    ['Tier 1', 'Internal write', 'Draft logs, ticket updates, CRM notes.', 'Sampled review'],
    ['Tier 2', 'Customer-facing', 'Messages to customers, quotes inside margin guardrails.', 'Named approver or bounded autonomy + daily QA'],
    ['Tier 3', 'Consequential', 'Money movement, a price below the floor, legal or safety statements, account disablement, public posts.', 'Always a human'],
  ].map(([t, h, p, g]) => `<div class="tier"><b>${t}</b><h3>${h}</h3><p>${p}</p><p class="gate">→ ${g}</p></div>`).join('');
  const done = new Set(store.get('bsp-agents-gov') || []);
  const area = s => { const t = String(s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
  $('#gov-list').innerHTML = GOV.map((g, i) => {
    return `<li class="sys-card gov ${done.has(g.id) ? 'done' : ''}" data-id="${g.id}">
      <label><input type="checkbox" ${done.has(g.id) ? 'checked' : ''} aria-describedby="gr-${g.id}"><span><span class="g-n">Control ${i + 1} · <span class="g-gate${/Wave-1/.test(GOV_GATE[g.id] || '') ? ' w1' : ''}">${esc(GOV_GATE[g.id] || '')}</span></span><h3>${esc(g.control)}</h3></span></label>
      ${g.requirement.length <= 240 ? `<p id="gr-${g.id}">${esc(deID(g.requirement))}</p>` : `<p id="gr-${g.id}">${esc(deID(clip(g.requirement, 200)))}</p><details><summary>Full requirement</summary><p>${esc(deID(g.requirement))}</p></details>`}
      <div class="g-meta"><span class="tag">${esc(area(g.area))}</span><span class="tag">${(g.applies_to || []).includes('all') ? 'All companies' : (g.applies_to || []).map(c => CO[c]?.name || c).join(', ')}</span></div>
      <p class="g-owner"><b>Owner:</b> ${esc(deID(g.owner))}</p>
      <p class="g-ev">${esc(deID(clip(g.evidence, 170)))}${g.source_url ? ` <a href="${esc(g.source_url)}" target="_blank" rel="noopener">${esc(host(g.source_url))} ↗</a>` : ''}</p>
    </li>`;
  }).join('');
  const sync = () => { const n = done.size; $('#gov-count').textContent = `${n} of ${GOV.length} controls live`; $('#gov-fill').style.width = `${n / GOV.length * 100}%`; };
  $('#gov-list').onchange = e => { const li = e.target.closest('.gov'); if (!li) return; e.target.checked ? done.add(li.dataset.id) : done.delete(li.dataset.id); li.classList.toggle('done', e.target.checked); store.set('bsp-agents-gov', [...done]); sync(); };
  $('#gov-reset').onclick = () => { done.clear(); store.set('bsp-agents-gov', []); $$('#gov-list .gov').forEach(li => { li.classList.remove('done'); $('input', li).checked = false; }); sync(); };
  sync();
}

/* ── Build vs buy ──────────────────────────────────────────────────────── */
function buildBuy() {
  const grp = k => AG.filter(a => decision(a) === k);
  const blurb = {
    buy: ['Vendor-native', 'The agent ships inside the system of record or a category leader (Dispatch Pro, Procore Helix, Gorgias, Rilla, Conexiom). Configure, pilot, measure.'],
    hybrid: ['Buy the plumbing, build the judgment', 'A vendor handles extraction or transport; the PRG builds triage, exceptions, disclosure and audit once and reuses it across companies.'],
    build: ['Built in-house on Claude or OpenAI', 'The agent\'s memory is BSP\'s own data and scoring (bids, storms, grants, dockets). This is the IP a buyer pays for at exit.'],
  };
  $('#bb-cols').innerHTML = ['buy', 'hybrid', 'build'].map(k => { const g = grp(k); return `<div class="sys-card bb"><div class="bb-h"><span class="dec dec-${k}">${DEC[k]}</span><b class="sys-num">${g.length}</b></div><h3 class="sys-card-title">${blurb[k][0]}</h3><p class="sys-card-body">${blurb[k][1]}</p><p class="bb-val">${money(g.reduce((s, a) => s + a.est_annual_value_usd, 0))} ceiling${EST()} · average ${(g.reduce((s, a) => s + a.weeks_to_deploy, 0) / (g.length || 1)).toFixed(1)} weeks to go live</p><p class="bb-val">Build ${money(totals(g).build)} · run ${money(totals(g).run)} a year${EST()}</p></div>`; }).join('');
  let tab = 'all';
  const draw = () => {
    $('#bb-tabs').innerHTML = ['all', 'buy', 'hybrid', 'build'].map(k => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === tab}">${k === 'all' ? 'All' : DEC[k]} · ${k === 'all' ? AG.length : grp(k).length}</button>`).join('');
    const list = (tab === 'all' ? AG : grp(tab)).slice().sort((a, b) => COS.indexOf(a.company) - COS.indexOf(b.company) || b.est_annual_value_usd - a.est_annual_value_usd);
    $('#bb-table').innerHTML = `<thead><tr><th>Agent</th><th>Company</th><th>Call</th><th>Vendor or build path</th><th class="n">Weeks</th><th class="n">Ceiling (est.)</th></tr></thead><tbody>${list.map(a => `<tr data-id="${a.id}" tabindex="0"><td>${esc(a.agent)}</td><td style="white-space:nowrap">${dot(a.company)} ${esc(CO[a.company].name)}</td><td><span class="dec dec-${decision(a)}">${DEC[decision(a)]}</span></td><td class="vend">${esc(deID(a.vendor_or_build))}</td><td class="n">${a.weeks_to_deploy}</td><td class="n">${money(a.est_annual_value_usd)}</td></tr>`).join('')}</tbody>`;
  };
  draw();
  $('#bb-tabs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { tab = b.dataset.k; draw(); } };
  const go = e => { const tr = e.target.closest('tr[data-id]'); if (tr) focusAgent(tr.dataset.id); };
  $('#bb-table').onclick = go; $('#bb-table').onkeydown = e => { if (e.key === 'Enter') go(e); };
}

/* ── Companies ─────────────────────────────────────────────────────────── */
function companies() {
  $('#co-grid').innerHTML = COS.map(c => {
    const C = CO[c]; const ags = AG.filter(a => a.company === c).sort((a, b) => b.est_annual_value_usd - a.est_annual_value_usd); const v = ags.reduce((s, a) => s + a.est_annual_value_usd, 0);
    const w1 = ags.filter(a => a.wave === 1).map(a => a.agent);
    return `<article class="sys-card co" data-co="${c}">
      <div class="co-h"><div><span class="sys-card-label"><span class="sys-dot" aria-hidden="true"></span>${esc(C.os)}</span><h3 class="sys-card-title">${esc(C.full)}</h3></div><button type="button" class="ag-linkbtn" data-filter="${c}">Filter catalog</button></div>
      <div class="co-stats"><div><span>Agents</span><b>${ags.length}</b></div><div><span>Ceiling a year</span><b>${money(v)}${EST()}</b></div><div><span>Net, mid case</span><b>${money(totals(ags).net)}${EST()}</b></div></div>
      ${(() => { const r = companyRows().find(z => z.c === c); return `<p class="co-note${r.ofTop >= STRETCH ? ' hot' : ''}">${r.ebPct != null ? `${r.ebPct}% of current adj. EBITDA${c === 'cet' ? ' (CET standalone)' : ''} · ` : ''}${r.ofTop != null ? `${r.ofTop}% of the OS case top` : ''}${r.ofTop >= STRETCH ? ' · re\u2011base first' : ''}</p>`; })()}
      ${c === 'ts' ? `<p class="co-note hot">Loan matures Dec 2027: cash agents first (${money(sumBy(ags, a => E[a.id].cash))} one-time cash by ${cashBy('ts')}).</p>` : ''}
      <p class="co-top"><b>Biggest:</b> ${esc(ags[0]?.agent || '')} (${money(ags[0]?.est_annual_value_usd)}). ${w1.length ? (w1.length === 1 && w1[0] === ags[0]?.agent ? 'Ships in wave 1.' : `<b>Wave 1:</b> ${esc(w1.join(', '))}.`) : ''}</p>
      <div class="co-links">
        <a href="${C.slug}/${C.osf}">${esc(C.os)} page <span>→</span></a>
        <a href="${C.slug}/${C.pb}">${C.pb === 'nationwide.html' ? 'Nationwide plan' : 'Growth plan'} <span>→</span></a>
        <a href="${C.slug}/index.html">Concept site <span>→</span></a>
        <a href="../app.html#/${c}/overview">Portal module <span>→</span></a>
      </div>
    </article>`;
  }).join('');
  $('#co-grid').onclick = e => { const b = e.target.closest('[data-filter]'); if (!b) return; Object.assign(S, { co: b.dataset.filter, layer: 'all', pattern: null }); syncChips(); renderCatalog(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); };
}

/* ── Rationale KPI, computed so it never overstates the evidence ── */
function rationale() {
  const eff = AG.filter(a => evType(a) === 'effect').length; const bench = AG.filter(a => evType(a) === 'benchmark').length;
  const el = $('#kpi-effect'); if (el) el.textContent = `KPI: agents backed by a measured result at a comparable company: ${eff} of ${AG.length} today (${bench} more cite a benchmark, ${AG.length - eff - bench} only context); target ${AG.length} of ${AG.length} via pilots.`;
}

/* ── Chat FAQ, computed from the same data so the widget never drifts from the page ── */
function faq() {
  const T = totals(); const rows = companyRows(); const WR = waveRows(); const w1 = WR[0];
  const li = list => `<ul>${list.map(a => `<li><b>${esc(a.agent)}</b> (${esc(CO[a.company].name)}) — ${money(a.est_annual_value_usd)} a year ceiling, ${a.weeks_to_deploy} wks</li>`).join('')}</ul>`;
  const pay = AG.slice().filter(a => isFinite(E[a.id].payback)).sort((a, b) => E[a.id].payback - E[b.id].payback).slice(0, 5);
  const g = id => GOV.find(x => x.id === id) || {};
  const cnt = k => AG.filter(a => decision(a) === k).length;
  const hot = rows.filter(r => r.ofTop >= STRETCH);
  const out = [
    { q: 'What is the agentic layer?', a: `<p>${esc(sentences(deID(D.meta.program_summary)).slice(0, 3).join(' '))}</p>`, href: '#top' },
    { q: 'What does the agent program cost?', a: `<p>Est. ${money(T.build)} one-time to build all ${AG.length} agents and ${money(T.run)} a year to run them (licences, model spend, upkeep). Against a ${money(T.ceil)} ceiling, the risk-adjusted value net of run cost is ${money(T.netLo)}–${money(T.netHi)} a year; payback about ${pbTxt(T.payback)}. Costs are analyst assumptions until vendor quotes exist.</p>`, href: '#economics' },
    { q: 'What does wave 1 cost and need?', a: `<p>${w1.ags.length} agents in ${w1.q}: ${money(w1.T.build)} to build, ${money(w1.T.run)} a year to run, ${w1.eng} agent engineers plus a named owner per company, controls 1–${gnum(5)} live (${gnum(7)} for Frontline), and a day-90 review against 8-week baselines. Ceiling ${money(w1.T.ceil)}; risk-adjusted net ${money(w1.T.netLo)}–${money(w1.T.netHi)}.</p>`, href: '#economics' },
    { q: 'Which AI agents create the most value across the portfolio?', a: `<p>Ceiling ${money(T.ceil)} a year (not de-duplicated); ${money(T.netLo)}–${money(T.netHi)} risk-adjusted and net of run cost. Top five by ceiling:</p>${li(AG.slice().sort((a, b) => b.est_annual_value_usd - a.est_annual_value_usd).slice(0, 5))}`, href: '#value' },
    { q: 'How much value does each company get from AI agents?', a: `<ul>${rows.map(r => `<li><b>${esc(CO[r.c].full)}</b>: ${money(r.v)} ceiling from ${r.n} agents${r.ebPct != null ? `, ${r.ebPct}% of current adj. EBITDA` : ''}${r.ofTop != null ? `, ${r.ofTop}% of the top of its OS EBITDA case` : ''}</li>`).join('')}</ul><p>Agents are part of each OS case, not additional to it.${hot.length ? ` ${hot.map(r => esc(CO[r.c].name)).join(', ')} need re-basing first.` : ''}</p>`, href: '#value' },
    { q: 'Which agents go live in wave 1?', a: `<p>${esc(w1.q)} (months ${esc(w1.w.months)}). Gate: controls 1–${gnum(5)} at every company, control ${gnum(7)} for Frontline, 8-week baselines, ${w1.eng} agent engineers.</p>${li(w1.ags)}`, href: '#rollout' },
    { q: 'Which agents pay back fastest?', a: `<p>Payback = est. build cost ÷ monthly risk-adjusted value net of run cost:</p><ul>${pay.map(a => `<li><b>${esc(a.agent)}</b> (${esc(CO[a.company].name)}) — ${pbTxt(E[a.id].payback)}, build ${money(E[a.id].build)}</li>`).join('')}</ul>`, href: '#catalog' },
    { q: 'What is the rollout plan and timeline for the agents?', a: `<ul>${WR.map(r => `<li><b>Wave ${r.w.wave}</b> (${esc(r.q)}): ${r.ags.length} agents, ${money(r.T.ceil)} ceiling, ${r.eng} engineers</li>`).join('')}</ul><p>Agents ramp over two quarters after go-live, so the full ceiling arrives after month 18. Thomas Scientific's inventory agent moved to wave 2, ahead of its December 2027 loan maturity.</p>`, href: '#rollout' },
    { q: 'What about Thomas Scientific’s debt maturity?', a: `<p>Thomas carries est. 7–10x leverage and a loan maturing December 2027. Its collections and inventory agents both run in wave 2 and release about ${money(sumBy(AG.filter(a => a.company === 'ts'), a => E[a.id].cash))} of one-time cash by ${cashBy('ts')}, which matters more for a refinancing than their ${money(sumBy(AG.filter(a => a.company === 'ts' && E[a.id].cash), a => a.est_annual_value_usd))} of annual value.</p>`, href: '#value' },
    { q: 'Who approves what an agent does?', a: `<p>${esc(deID(g('gov-02').requirement || ''))}</p>`, href: '#governance' },
    { q: 'Can an agent move money or pay vendors?', a: `<p>No. ${esc(deID(g('gov-08').requirement || ''))}</p>`, href: '#governance' },
    { q: 'Which AI models and vendor data terms are allowed?', a: `<p>${esc(deID(g('gov-04').requirement || ''))}</p>`, href: '#governance' },
    { q: 'What are the kill criteria for an agent?', a: `<p>${esc(deID(g('gov-09').requirement || ''))}</p>`, href: '#governance' },
    { q: 'Should we build or buy each agent?', a: `<p>${cnt('buy')} buy (vendor-native), ${cnt('hybrid')} hybrid (vendor plumbing plus an in-house judgment layer), ${cnt('build')} built in-house on Claude or OpenAI. Buy when the agent lives inside the system of record; build when its memory is BSP's own data, because that scoring is the IP a buyer pays for.</p>`, href: '#build-buy' },
    { q: 'What are the reusable agent patterns?', a: `<ul>${PAT.map(p => `<li><b>${esc(p.pattern)}</b> — ${AG.filter(a => a.pattern_id === p.id).length} agents</li>`).join('')}</ul>`, href: '#patterns' },
  ];
  for (const c of COS) {
    const ags = AG.filter(a => a.company === c).sort((a, b) => b.est_annual_value_usd - a.est_annual_value_usd);
    out.push({ q: `Which AI agents does ${CO[c].full} get?`, a: `<p>${ags.length} agents in ${esc(CO[c].os)}:</p>${li(ags)}`, href: `?co=${c}#catalog` });
  }
  return out;
}
