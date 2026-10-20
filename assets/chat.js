/* ═══════════════════════════════════════════════════════════════════════════
   BSP Desk chat — grounded assistant for the portal and the portfolio sites.
   • Deterministic intents answer from the portal's own datasets (no backend, no key).
   • Retrieval fallback searches an index built from research metadata.
   • Hosted backend (assets/backend.js, discovered on first use): precomputed Claude deep
     dives, hosted Claude for open questions, "Expand with Claude" on grounded answers,
     feedback and saved threads. Everything degrades to the grounded engine when it is off.
   • Visitors see plain labels ("From the portfolio data", "Deep research", "Prepared answer") and an
     "About this assistant" note. The key/model dialog (bring-your-own Anthropic key, stored
     only in this browser) opens only with ?dev=1, or from About when no hosted backend is live.
   Usage:  import { Chat } from '/assets/chat.js';
           Chat.mount(document.querySelector('#hero-chat'), { persona: 'portal', mode: 'inline' });
           Chat.mount(null, { persona: 'pp', mode: 'floating', faq: [...], suggestions: [...] });
   ═══════════════════════════════════════════════════════════════════════════ */
import { Data, Fmt, Live, esc } from './core.js?v=20261009192122';

const ROOT = new URL('../', import.meta.url).href;              // repo root, works from any page depth
const APP = ROOT + 'app.html';
const LOGO = new URL('./img/bsp-mark.png', import.meta.url).href;  // the BSP mark, used as BSP Desk's avatar and launcher
/* Each company's assistant wears that company's mark (Punctual Pros trades under its franchise brands, so its mark is the concept's on-time clock). */
const LOGOS = Object.fromEntries(['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'].map(k => [k, new URL(`./img/logos/${k}.png`, import.meta.url).href]));
const logoOf = id => LOGOS[id] || LOGO;
const SITE = 'https://syedr64.github.io/BroadSky_Intelligence_Portal/';   // the knowledge base names portal pages by their public address
const SITE_NOW = ['https://broadsky-agent.vercel.app/', 'https://broadsky-desk.vercel.app/'];   // the site's own address (and its earlier one), used in acquisition-model links
const ownPath = u => { for (const p of [SITE, ...SITE_NOW]) if (u.startsWith(p)) return u.slice(p.length); return null; };   // a link into this site → its path, else null
const MODEL_DEFAULT = 'claude-opus-5-5';
const KEY_LS = 'bsp-anthropic-key', MODEL_LS = 'bsp-anthropic-model', MODE_LS = 'bsp-chat-llm';
/** Owner tools (key/model dialog, slash-command menu, key hints) appear only with ?dev=1 in the page URL. */
const DEV = (() => { try { return new URLSearchParams(location.search).get('dev') === '1'; } catch { return false; } })();
const $ = (s, r = document) => r.querySelector(s);
const link = (href, label) => `<a class="ch-link" href="${esc(href)}">${esc(label)} →</a>`;
const app = (hash, label) => link(APP + hash, label);
const n = (v, d = 0) => `<span class="ch-num">${Fmt.num(v, d)}</span>`;
const money = v => `<span class="ch-num">${Fmt.money(v)}</span>`;
/* lever baseline / target: thousands separators for numbers (9,355 not 9355), dash when missing */
const bt = v => v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v);
/** Shorten prose on a word boundary and mark the cut, so no answer ends mid-word. */
const clip = (v, n) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const c = t.slice(0, n); const sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[\s,;:.(–—-]+$/, '') + '…'; };
const sentences = (v, k = 3) => { const t = (Array.isArray(v) ? v.slice(0, k).join(' ') : String(v || '').split('. ').slice(0, k).join('. ')).trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
/** Phase title and month span across plan schemas: {phase:'Phase 1 – X', months:'0-12'} or {phase:1, name:'X', months:{start,end} | [a,b]}. */
const phaseName = p => { const t = String(p.name || (typeof p.phase === 'string' ? p.phase : '') || ''); const m = t.match(/^Phase\s*\d+\s*(?:\(([^)]*)\))?\s*[-–—·:]\s*(.+)$/i); return m ? `${m[2]}${m[1] ? ` (${m[1]})` : ''}` : t; };
const phaseMonths = p => { const m = p.months; if (m == null) return ''; if (Array.isArray(m)) return m.length >= 2 ? `${m[0]}–${m[1]} mo` : String(m[0] ?? ''); if (typeof m === 'object') return m.start != null && m.end != null ? `${m.start}–${m.end} mo` : ''; const t = String(m).trim(); return /^\d+\s*[-–]\s*\d+\+?$/.test(t) ? `${t.replace(/\s*[-–]\s*/, '–')} mo` : t; };
/** A dataset named in prose: its readable name now, an inline [n] reference once the answer is polished. */
const cite = k => `<span data-cite="${esc(k)}">${esc(srcLabel(k))}</span>`;
const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${typeof c === 'number' ? 'n' : ''}">${typeof c === 'number' ? Fmt.num(c) : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
/** Short company names for answer headings (six words or fewer). */
const COS_S = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
const COS = { pp: 'Punctual Pros', cet: 'Commonwealth Electrical (CET)', fl: 'Frontline Managed Services', ts: 'Thomas Scientific', bpi: 'Bully Pulpit International', fh: 'Fair Harbor' };
const CO_RX = { pp: /punctual|one hour|ben(jamin)? franklin|mister sparky|horvath|hvac|plumb|serviceos|comfort club/i, cet: /\bcet\b|commonwealth|horton|nuwave|electrical|wastewater|solar|gridos|new england/i, fl: /frontline|law firm|legal|am ?law|firmos/i, ts: /thomas|lab supply|laborator|diagnostic|labos|lab sites?/i, bpi: /bully|\bbpi\b|public affairs|comms|communications agency|signalos/i, fh: /fair harbor|beachwear|swim|apparel|harboros/i };
const coOf = q => Object.keys(CO_RX).find(k => CO_RX[k].test(q));
const TERRITORY_PA = ['Lancaster', 'York', 'Dauphin', 'Cumberland', 'Berks', 'Lebanon', 'Franklin', 'Adams', 'Perry'];
const TERRITORY_NJ = ['Ocean', 'Monmouth'];
/** Live progress from inside an intent ("Computing from 248 core zips"); a no-op when no answer is in flight. */
let ACTIVE = null;
const progress = t => { try { ACTIVE?.progress?.(t); } catch { /* status only */ } };

/* ── Hosted backend: imported and discovered on first use; every path degrades to the grounded engine ── */
const BACKEND_JS = './backend.js?v=20261009192122';
let BE = null, BE_P = null, BE_RETRY = 0;
function backend() {
  // The check on page load can land on a cold start and miss: when the backend looked offline, check again (at most every 15 s).
  if (BE_P && BE && !BE.endpoint && Date.now() - BE_RETRY > 15000) {
    BE_RETRY = Date.now();
    BE_P = BE.discover().catch(() => null).then(() => { WIDGETS.forEach(w => { try { w.refreshEngine(); } catch { /* widget gone */ } }); return BE; });
  }
  if (!BE_P) BE_P = import(BACKEND_JS).then(async m => {
    const B = m.Backend || m.default; if (!B) return null; BE = B;
    try { await B.discover(); } catch { /* offline: grounded only */ }
    WIDGETS.forEach(w => { try { w.refreshEngine(); } catch { /* widget gone */ } });
    return B;
  }).catch(e => { console.debug('assistant backend unavailable', e?.message || e); return null; });
  return BE_P;
}
/** Hosted Claude is live (endpoint answered /health with a model key). */
const hosted = () => !!(BE?.endpoint && BE.llm);
const GENERATIVE_RX = /^(write|draft|compose|summari[sz]e|explain|compare|rewrite|translate|brainstorm|outline|pitch|prepare|suggest|recommend|critique|review|assess)\b|\b(note|memo|email|letter|script|talking points|bullet points|one-pager|agenda|pros and cons|trade-?offs)\b|\b(what do you think|should (we|bsp|the prg)|how would you|in your view)\b/i;
/** Backend storage (feedback, threads) is live. */
const stored = () => !!(BE?.endpoint && BE.db);

/* ── House terminology (scripts/term_map.json), applied to every answer's visible text ── */
const TECH_BEFORE = /\b(ctv|tv|voice|ai|software|tech|technology|e-?commerce|ads?|advertising|media|streaming|reference|data|cloud|digital|booking|marketing|dispatch|crm|saas|servicetitan|online|self-serve|analytics|payments?|video|social|hosting|delivery|learning|training|review|telematics|fintech|ordering|procurement|punchout|scheduling|messaging|phone|telephony|contact-center|field-service|fsm|erp|web|mobile|app|api|developer|integration)[\s-]*$/i;
const capLike = (src, out) => /^[A-Z]/.test(src) ? out[0].toUpperCase() + out.slice(1) : out;
function terms(v) {
  const t = String(v ?? ''); if (!/playbook|platform/i.test(t)) return t;
  return t
    .replace(/\bvalue[- ]creation playbooks?\b/gi, m => capLike(m, 'growth plan'))
    .replace(/\bplaybooks\b/gi, m => capLike(m, 'plans')).replace(/\bplaybook\b/gi, m => capLike(m, 'plan'))
    .replace(/\bplatform (compan(?:y|ies))\b/gi, (m, c) => capLike(m, `portfolio ${c.toLowerCase()}`))
    .replace(/\bplatform (theses|thesis)\b/gi, (m, x) => capLike(m, `company ${x}`))
    .replace(/\bplatform (release|announcement)(s?)\b/gi, (m, x, pl) => capLike(m, `deal announcement${pl}`))
    .replace(/\bplatforms?\b/gi, (m, off, str) => TECH_BEFORE.test(str.slice(Math.max(0, off - 28), off)) ? m : capLike(m, /s$/i.test(m) ? 'companies' : 'company'));
}

/* ── Intents (portal persona) ─────────────────────────────────────────────── */
async function expansionPlan() {
  const [zips, ma, mkt, pe, fil, nw, ev] = await Promise.all([Data.load('pp_zips'), Data.research('ma_targets_pp'), Data.research('pp_market'), Data.research('pe_landscape'), Data.research('pp_filings'), Data.research('pp_nationwide'), Data.research('serviceos_evidence')]);
  const core = zips.filter(z => z.service_territory_flag === 1), adj = zips.filter(z => z.adjacent_to_service_territory === 1 && z.service_territory_flag !== 1);
  progress(`Working from ${core.length} core ZIP codes`);
  const hh = core.reduce((a, z) => a + (z.housing_units || 0), 0);
  const t1adj = adj.filter(z => /^Tier (1|I)$/.test(String(z.practical_priority_tier || '')) || /Go now/i.test(String(z.practical_priority_label || '')));
  const byState = {}; for (const z of t1adj) byState[z.state] = (byState[z.state] || 0) + 1;
  const tgt = (ma?.items || []).slice().sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
  const tgtByState = {}; for (const t of tgt) tgtByState[t.state] = (tgtByState[t.state] || 0) + 1;
  const rivals = (pe?.items || []).filter(f => (f.overlap_with_bsp || []).some(o => /punctual|pp/i.test(o)));
  const et = fil?.meta?.estimate_table || []; const rev = et.find(e => /pro forma/i.test(e.metric) && /revenue/i.test(e.metric)) || et.find(e => /FY2025.*revenue/i.test(e.metric)); const ebitda = et.find(e => /ebitda/i.test(e.metric));
  const items = nw?.items || []; const K = k => items.filter(i => i.kind === k);
  const tmpl = K('template').slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const phases = K('expansion_phase'); const levers = K('growth_lever'); const agents = K('ai_agent'); const pros = K('pro_program'); const fin = K('financing');
  const road = nw?.meta?.kpi_roadmap || []; const assume = (ev?.items || []).find(i => i.kind === 'roadmap_assumption' && (i.company === 'pp' || /punctual/i.test(i.company || '')));
  const sh = tmpl.length ? `<h4>Template: Smith + Howard</h4><p>${esc(sentences(nw?.meta?.narrative, 2))}.</p>${tbl(['When', 'Move', 'Where'], tmpl.slice(0, 8).map(t => [esc(when(t.date)), `<b>${esc(t.event)}</b>${t.metric ? ` <span class="ch-badge">${esc(t.metric)}</span>` : ''}`, esc(t.location || '')]))}<p>Same motion for Punctual Pros: densify, tuck in, regional hub, national — with ServiceOS as the integration spine instead of an accounting practice-management stack.</p>` : `<h4>Template: Smith + Howard</h4><p>One Atlanta office and ~100 professionals at entry; nine add-ons later it was 11 locations across the Southeast plus India, ~800 people and roughly 4× revenue, sold to TPG Growth in August 2026. Punctual Pros runs the same motion in home services.</p>`;
  const ph = phases.length ? phases.map((p, i) => `<h4>Phase ${i + 1}${phaseMonths(p) ? ` <span class="ch-badge">${esc(phaseMonths(p))}</span>` : ''}</h4><p><b>${esc(phaseName(p))}.</b> ${esc(p.thesis || '')}${p.geography?.length ? ` <span style="color:var(--ch-mute)">(${esc((Array.isArray(p.geography) ? p.geography : [p.geography]).slice(0, 6).join(', '))})</span>` : ''}</p>${p.kpi_targets ? `<p class="ch-num">Targets: ${['revenue_usd', 'ebitda_usd', 'technicians', 'territories', 'members'].filter(k => p.kpi_targets[k] != null).map(k => `${({ revenue_usd: 'Revenue', ebitda_usd: 'EBITDA', technicians: 'Technicians', territories: 'Territories', members: 'Members' })[k]} ${/usd/.test(k) ? Fmt.money(p.kpi_targets[k]) : Fmt.num(p.kpi_targets[k])}`).join(' · ')} <span class="ch-badge ch-est">est.</span></p>` : ''}`).join('') :
    `<h4>Phase 1 · Densify (0–12 mo)</h4><p>${n(t1adj.length)} Tier-1 adjacent ZIP codes sit just outside the footprint${Object.keys(byState).length ? ` (${Object.entries(byState).map(([s, c]) => `${s} ${c}`).join(', ')})` : ''}: win them with the new-mover engine and weather-driven capacity, not new branches.</p><h4>Phase 2 · Mid-Atlantic tuck-ins (6–24 mo)</h4><p>${n(tgt.length)} screened add-ons${Object.keys(tgtByState).length ? ` (${Object.entries(tgtByState).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} ${c}`).join(', ')})` : ''}; top: ${tgt.slice(0, 3).map(t => `<b>${esc(t.company)}</b> (${esc(t.state || '')}, fit ${t.fit_score})`).join('; ')}.</p><h4>Phase 3 · Mid-Atlantic hub (18–36 mo)</h4><p>Consolidate franchisees along I-81/I-95 (Baltimore–DC, Richmond, Philadelphia suburbs, Pittsburgh). ${rivals.length ? `${n(rivals.length)} sponsors already compete here, so speed and operator credibility beat price.` : ''}</p><h4>Phase 4 · National (36+ mo)</h4><p>Preferred consolidator inside the Authority Brands network (1,000+ owners, 15 brands); ServiceOS is the spine every acquired shop plugs into.</p>`;
  const lv = (levers.length ? levers : [{ lever: 'Website & online booking', baseline: null, target: null, evidence: 'Conversion-first site, instant booking, reviews' }, { lever: 'Comfort Club memberships', evidence: 'Recurring revenue, higher retention, cheaper demand in shoulder seasons' }, { lever: 'New-mover marketing', evidence: 'Deed feed → scored mailing within 30 days of closing' }, { lever: 'Storm & weather plan', evidence: 'Pre-positioned crews and inventory ahead of NWS alerts' }, { lever: 'IAQ, water-treatment & generator attach', evidence: 'Higher ticket on every visit' }, { lever: 'Consumer financing attach', evidence: 'Replacement close-rate lift' }, { lever: 'Dynamic price-book', evidence: 'Margin discipline across trades' }, { lever: 'Tuck-in machine on ServiceOS', evidence: '100-day integration plan' }]).slice(0, 8);
  const levHtml = `<h4>Eight operating levers</h4>${tbl(['Lever', 'Baseline → target', 'Evidence'], lv.map(l => [`<b>${esc(l.lever)}</b>`, l.baseline != null || l.target != null ? `<span class="ch-num">${esc(bt(l.baseline))} → ${esc(bt(l.target))}${l.unit ? ' ' + esc(l.unit) : ''}</span>` : '—', `<span style="color:var(--ch-fg2)">${esc(clip(l.evidence || '', 110))}</span>`]))}`;
  const agHtml = agents.length ? `<h4>AI agents for office and field</h4>${tbl(['Agent', 'Helps', 'What it does', 'Metric'], agents.slice(0, 8).map(a => [`<b>${esc(a.agent)}</b><br><span style="color:var(--ch-mute)">${esc((a.vendor_examples || []).slice(0, 2).join(', '))}</span>`, esc(a.who_it_helps || ''), esc(clip(a.job_to_be_done || '', 90)), esc(clip(a.metric_claim || '', 90))]))}` : `<h4>AI agents for office and field</h4><ul><li><b>24/7 AI dispatcher</b> — answers and books every call, recovers missed calls by text</li><li><b>Technician copilot</b> — voice diagnostics, parts lookup, option-sheet guidance on site</li><li><b>Estimator & proposal agent</b> — good/better/best in minutes</li><li><b>Route & schedule optimizer</b> — fed by the weather pressure index</li><li><b>Membership renewal, reviews, AP/AR and permit agents</b> — back-office cost out</li></ul>`;
  const prHtml = pros.length ? `<h4>Helping the pros themselves</h4><ul>${pros.slice(0, 6).map(p => `<li><b>${esc(p.program)}</b> — ${esc(clip(p.evidence || '', 120))}</li>`).join('')}</ul>` : `<h4>Helping the pros themselves</h4><ul><li>Trade-school pipeline (Thaddeus Stevens, PA apprenticeships) and earn-while-you-learn ladders</li><li>Pay ladders, tool stipends, ride-along training, veteran hiring</li><li>Contractor partner network for overflow and builder work</li></ul>`;
  const finHtml = fin.length ? `<h4>Financing</h4><ul>${fin.slice(0, 4).map(f => `<li><b>${esc(f.source_of_funds)}</b> — ${esc(f.amount_or_range || '')}${f.evidence ? `: ${esc(clip(f.evidence, 110))}` : ''}</li>`).join('')}</ul>` : '';
  const roadHtml = road.length ? `<h4>36-month roadmap <span class="ch-badge">analyst assumptions</span></h4>${tbl(['Month', 'Revenue', 'EBITDA', 'Techs', 'Territories', 'Members'], road.map(r => [r.month, r.revenue_usd ? money(r.revenue_usd) : '—', r.ebitda_usd ? money(r.ebitda_usd) : '—', r.technicians ?? '—', r.territories ?? '—', r.members ?? '—']))}${assume ? `<p>Multiple expansion case: ${esc(String(assume.multiple_expansion_range || assume.multiple_expansion || '').toString())} ${esc(clip(assume.rationale || '', 160))}</p>` : ''}` : '';
  return {
    html: `<h4>How BSP takes Punctual Pros nationwide</h4><p><b>Where it stands.</b> ${n(core.length)} core ZIP codes in ${TERRITORY_PA.length} Central-PA counties (${n(hh)} housing units) plus Ocean &amp; Monmouth NJ via Horvath. Public filings imply FY2025 revenue of ${esc(rev?.estimate || '~$22M')}${ebitda ? ` and adjusted EBITDA of ${esc(ebitda.estimate)}` : ''} (analyst estimates), with an undrawn delayed-draw line already earmarked for acquisitions.</p>${sh}${ph}${levHtml}${agHtml}${prHtml}${finHtml}${roadHtml}<h4>Exit thesis</h4><p>A multi-state, membership-heavy, AI-run home-services company on one operating system is what a strategic or the next sponsor pays a tech-enabled multiple for — the same arc that took Smith + Howard from a regional firm to a TPG exit.</p><div class="ch-src">Sources: ${cite('pp_nationwide')} (press, franchise disclosures, BLS and ACCA, vendor data), ${cite('pp_zips')}, ${cite('ma_targets_pp')}, ${cite('pe_landscape')}, ${cite('pp_filings')} and ${cite('serviceos_evidence')}. Figures labelled est. are analyst assumptions.</div>`,
    links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html', 'Open the Nationwide plan'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS'), app('#/pp/territory', 'Territory & expansion'), app('#/ma/pipeline?platform=pp', 'Add-on pipeline'), app('#/pe/landscape', 'Private equity'), app('#/pp/filings', 'Filings & estimates')],
    followups: ['Which AI agents pay back fastest?', 'Which counties come first?', 'How does Smith + Howard compare?', 'What does ServiceOS do for valuation?'],
  };
}
async function weatherImpact() {
  const [pa, nj, model] = await Promise.all([Live.nwsAlerts('PA').catch(() => []), Live.nwsAlerts('NJ').catch(() => []), Data.research('pp_demand_model')]);
  const inTerr = a => (a.areas || []).some(x => [...TERRITORY_PA, ...TERRITORY_NJ].some(c => new RegExp(`\\b${c}\\b`, 'i').test(x)));
  progress(`Screening ${pa.length + nj.length} live alerts against ${TERRITORY_PA.length + TERRITORY_NJ.length} territory counties`);
  const alerts = [...pa, ...nj].filter(inTerr);
  const hubs = [{ name: 'Lancaster', lat: 40.04, lon: -76.31 }, { name: 'Toms River', lat: 39.95, lon: -74.2 }];
  const fc = await Promise.all(hubs.map(h => Live.forecast(h.lat, h.lon).catch(() => null)));
  const play = (model?.items || []).filter(i => i.component === 'event_playbook');
  const evNames = x => [x.nws_event, ...(x.aliases_and_related || [])].filter(Boolean).map(nm => String(nm).replace(/\s*\(.*\)\s*$/, '').toLowerCase());
  const planFor = ev => { const e = String(ev || '').toLowerCase(); return play.find(x => evNames(x).some(nm => nm && e.includes(nm))); };
  const planByName = nm => play.find(x => String(x.nws_event || '').toLowerCase() === nm.toLowerCase());
  const mult = p => Object.entries(p?.expected_call_volume_multiplier || {}).map(([t, r]) => `${t} ${Array.isArray(r) ? (r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`) : r}×`).join(' · ');
  const rows = alerts.slice(0, 6).map(a => { const p = planFor(a.event); return [`<b>${esc(a.event)}</b> <span class="ch-badge">${esc(a.severity)}</span>`, esc((a.areas || []).filter(x => [...TERRITORY_PA, ...TERRITORY_NJ].some(c => x.includes(c))).slice(0, 3).join(', ')), p ? esc(mult(p)) : '—']; });
  const fcRows = hubs.map((h, i) => { const d = (fc[i] || []).filter(x => !x.past).slice(0, 7); if (!d.length) return [h.name, '—', '—', '—']; const hot = d.filter(x => x.tmax >= 90).length, cold = d.filter(x => x.tmin <= 20).length, wet = d.filter(x => (x.precip || 0) >= 1.5).length, gust = d.filter(x => (x.gust || 0) >= 40).length; return [h.name, `${Math.round(Math.min(...d.map(x => x.tmin)))}–${Math.round(Math.max(...d.map(x => x.tmax)))}°F`, `${hot} hot · ${cold} freeze · ${wet} heavy-rain · ${gust} gusty days`, d.some(x => x.tmax >= 90) ? 'HVAC surge' : d.some(x => x.tmin <= 20) ? 'Plumbing freeze risk' : gust ? 'Electrical/outage risk' : 'Baseline staffing']; });
  /* response plans: the ones the live alerts call for, then the ones this week's forecast triggers, else the season's most likely */
  const wk = fc.flatMap(f => (f || []).filter(x => !x.past).slice(0, 7));
  const fcTrig = [wk.some(x => x.tmax >= 90) && 'Heat Advisory', wk.some(x => x.tmin <= 20) && 'Extreme Cold Warning', wk.some(x => (x.precip || 0) >= 1.5) && 'Flash Flood Warning', wk.some(x => (x.gust || 0) >= 40) && 'High Wind Warning'].filter(Boolean);
  const mo = new Date().getMonth() + 1;
  const season = mo >= 10 && mo <= 11 ? ['Freeze Warning', 'High Wind Warning', 'Winter Storm Warning'] : mo === 12 || mo <= 2 ? ['Extreme Cold Warning', 'Winter Storm Warning', 'Ice Storm Warning'] : mo <= 5 ? ['Severe Thunderstorm Warning', 'Flash Flood Warning', 'Freeze Warning'] : ['Heat Advisory', 'Severe Thunderstorm Warning', 'Tropical Storm Warning'];
  const live = [...alerts.map(a => planFor(a.event)), ...fcTrig.map(planByName)].filter(Boolean);
  const plans = [...new Set(live.length ? live : season.map(planByName).filter(Boolean))].slice(0, 4);
  const planRows = plans.map(p => [`<b>${esc(p.nws_event)}</b>`, esc(mult(p)), esc(clip(String(p.lead_time || '—').replace(/>=/g, '≥').replace(/<=/g, '≤'), 70)), esc(clip((p.actions || []).slice(0, 2).join('; ').replace(/>=/g, '≥').replace(/<=/g, '≤'), 150))]);
  const planHtml = planRows.length ? `<h4>${live.length ? 'Response plan for this week' : 'Seasonal response plan'} <span class="ch-badge">analyst assumptions</span></h4>${live.length ? '' : '<p>No trigger in the live alerts or the 7-day forecast, so these are the plans most likely to be needed this season.</p>'}${tbl(['If the Weather Service issues', 'Expected calls', 'Lead time', 'First moves'], planRows)}` : '';
  return { html: `<h4>Weather → service-call pressure (live)</h4><p>${n(alerts.length)} active NWS alerts touch the Punctual Pros territory right now${alerts.length ? ':' : '.'}</p>${alerts.length ? tbl(['Alert', 'Counties', 'Call multiplier'], rows) : ''}<h4>Next 7 days by hub</h4>${tbl(['Hub', 'Range', 'Trigger days', 'Implication'], fcRows)}${planHtml}<div class="ch-src">Sources: NWS alerts API, Open-Meteo forecast, ${cite('pp_demand_model')} (ServiceTitan heat-wave elasticities, NOAA storm events).</div>`, links: [app('#/pp/weather', 'Open Weather & demand')], followups: ['Show the storm history for Ocean County', 'How many techs on the peak day?'] };
}
async function wastewater(q = '') {
  const d = await Data.research('cet_wwtp_targets'); if (!d) return null;
  const top = (d.meta?.priority_top_15 || []).slice(0, 6); const items = d.items || [];
  if (/funded|funding|srf|clean water fund|capital (plan|project)|budget/i.test(q)) {
    const f = items.filter(i => /funded/i.test(i.project_class || '')).sort((a, b) => (+b.project_value_usd || 0) - (+a.project_value_usd || 0));
    progress(`Sorting ${f.length} funded plant projects by value`);
    return { html: `<h4>Wastewater plants with funded upgrade projects</h4><p>${n(f.length)} of ${n(items.length)} CT, MA and RI plants carry a project on a state Clean Water Fund or SRF list, about ${money(f.reduce((s2, i) => s2 + (+i.project_value_usd || 0), 0))} of named project value. Sell Horton's electrical and controls scope first, then bundle NuWave efficiency and CET solar, storage and generators.</p>${tbl(['Plant', 'Project', 'Value', 'Funding', 'Horton fit'], f.slice(0, 10).map(i => [`<b>${esc(i.facility_name)}</b> <span class="ch-badge">${esc(i.state || '')}</span>`, esc(clip(i.recent_or_planned_project || '', 80)), i.project_value_usd ? money(+i.project_value_usd) : '—', esc(clip(i.funding_program || '', 40)), `<span class="ch-num">${esc(i.horton_fit ?? '—')}</span>`]))}<div class="ch-src">Source: ${cite('cet_wwtp_targets')} (state Clean Water Fund and SRF priority lists, EPA ECHO permits).</div>`, links: [app('#/cet/wastewater', 'Wastewater accounts'), app('#/cet/opportunities', 'Opportunity radar')], followups: ['Which wastewater plants should Horton call first?', 'Which CET bids are due within 30 days?', 'What do NuWave and Horton add to CET?'] };
  }
  progress(`Scoring ${items.length} treatment plants for Horton fit`);
  const funded = items.filter(i => /funded/i.test(i.project_class || '')), mgd = items.reduce((a, i) => a + (i.design_flow_mgd || 0), 0);
  return { html: `<h4>Horton's first wastewater calls</h4><p>${n(items.length)} CT/MA/RI plants (${n(Math.round(mgd))} MGD) scored for Horton fit; ${n(funded.length)} have funded projects on the state SRF / Clean Water Fund lists.</p><ol>${top.map(t => `<li><b>${esc(t.facility || t.name || t.facility_name || '')}</b> — ${esc(clip(t.rationale || t.reason || t.why || '', 160))}</li>`).join('')}</ol><p>Sell the electrical/I&amp;C scope first (Horton), then bundle NuWave efficiency and CET solar/storage/generators into the same account.</p>`, links: [app('#/cet/wastewater', 'Wastewater accounts'), app('#/cet/opportunities', 'Opportunity radar')], followups: ['Which CET bids are due within 30 days?', 'Show CET add-on targets in Connecticut'] };
}
async function cetDue(days = 30) {
  const d = await Data.research('cet_opportunities'); const legacy = await Data.load('cet_ne_rfps').catch(() => []);
  const radar = d?.items || [];
  // trade bids only: an energy developer's lease/PPA solicitation or a grant program is not electrical work CET would bid
  const NOT_TRADE = /developer rfp|lease\/ppa|power purchase/i;
  const iso = v => v instanceof Date ? v.toISOString().slice(0, 10) : v;
  const all = [...radar.filter(o => o.type === 'rfp' && o.stage !== 'awarded' && !NOT_TRADE.test(o.title || '')).map(o => ({ t: o.title, who: o.owner_or_agency, st: o.state, due: o.due_date, fit: o.fit_score, v: o.est_value_usd })), ...legacy.map(o => ({ t: o.title, who: o.agency, st: o.state, due: o.due_date && new Date(o.due_date), fit: null, v: o.estimated_value_m ? o.estimated_value_m * 1e6 : null }))];
  progress(`Filtering ${all.length} open bids by due date`);
  const afterClose = new Date().getHours() >= 17;   // a bid due today drops off after close of business
  const soon = all.map(o => ({ ...o, k: Fmt.days(iso(o.due)) })).filter(o => o.k != null && o.k <= days && (o.k > 0 || (o.k === 0 && !afterClose))).sort((a, b) => a.k - b.k || (b.fit || 0) - (a.fit || 0));
  const today = soon.filter(o => o.k === 0).length;
  const dueCell = o => o.k === 0 ? '<b>Due today</b>' : esc(Fmt.dateShort(iso(o.due)));
  return { html: `<h4>CET bids due within ${days} days</h4>${soon.length ? `<p>All ${n(soon.length)} open bids due in the next ${days} days, soonest first${today ? `; ${n(today)} close today` : ''}.</p>${tbl(['Due', 'Opportunity', 'Owner', 'Fit'], soon.map(o => [dueCell(o), `<b>${esc(o.t)}</b> <span class="ch-badge">${esc(o.st || '')}</span>`, esc(o.who || ''), o.fit ?? '—']))}` : '<p>No bids close in that window.</p>'}<p>The radar tracks ${n(radar.length)} sourced opportunities across the six New England states, plus ${n(legacy.length)} older public bids.</p>`, links: [app('#/cet/opportunities', 'Opportunity radar')], followups: ['Top 10 actions for CET this month?', 'Which wastewater plants should Horton call first?'] };
}
async function addons(q) {
  const co = coOf(q) || 'pp'; const file = { pp: 'ma_targets_pp', cet: 'ma_targets_cet', fl: 'ma_targets_fl_ts', ts: 'ma_targets_fl_ts' }[co]; if (!file) return { html: `<p>Add-on screens exist for Punctual Pros, CET, Frontline and Thomas Scientific.</p>`, links: [app('#/ma/pipeline', 'Acquisition engine')] };
  const d = await Data.research(file); let items = d?.items || []; if (file === 'ma_targets_fl_ts') items = items.filter(i => i.platform === (co === 'fl' ? 'frontline' : 'thomas_scientific'));
  const st = (q.match(/\b(PA|NJ|MD|DE|NY|CT|MA|RI|NH|ME|VT|pennsylvania|new jersey|connecticut|massachusetts|maryland)\b/i) || [])[1]; const map = { pennsylvania: 'PA', 'new jersey': 'NJ', connecticut: 'CT', massachusetts: 'MA', maryland: 'MD' }; const stc = st ? (map[st.toLowerCase()] || st.toUpperCase()) : null;
  if (stc) items = items.filter(i => (i.state || i.hq_state) === stc);
  progress(`Ranking ${items.length} targets by fit`);
  items = items.slice().sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)).slice(0, 8);
  return { html: `<h4>Top add-on targets · ${esc(COS_S[co])}${stc ? ` · ${stc}` : ''}</h4>${items.length ? tbl(['Fit', 'Company', 'HQ', 'Staff', 'Why'], items.map(t => [t.fit_score ?? '—', `<b>${esc(t.company)}</b>`, esc(`${t.hq_city || ''}${t.hq_city ? ', ' : ''}${t.state || t.hq_state || ''}`), t.employees ?? '—', esc(clip(t.strategic_rationale || '', 90))])) : '<p>No targets match.</p>'}<div class="ch-src">Screened via ZoomInfo + company sites; every target carries sources in the portal.</div>`, links: [app(`#/ma/pipeline?platform=${co}`, 'Full pipeline'), app(`#/${co}/targets`, `${COS[co]} targets`)], followups: ['Who are the PE-backed competitors in this sector?', 'What multiple would a tuck-in trade at?'] };
}
async function peRivals(q) {
  const d = await Data.research('pe_landscape'); if (!d) return null; const co = coOf(q);
  progress(`Ranking ${(d.items || []).length} sponsors by threat level`);
  const ov = x => !co || (x.overlap_with_bsp || []).some(o => new RegExp(co === 'pp' ? 'punctual|pp' : co, 'i').test(o));
  const SECT = { pp: /hvac|plumb|electric|home|residential|roof|pest|garage|water/i, cet: /electric|energy|solar|power|infrastructure|mep|utility/i, fl: /legal|law|msp|managed|it service|cyber|revenue cycle/i, ts: /lab|scientific|distribut|life science/i, bpi: /communic|public affairs|agency|media|marketing/i, fh: /apparel|consumer|brand|retail/i };
  if (/bought|buy(ing)?|acquir|deals?\b|recent|this year|lately|2025|2026/i.test(q)) {
    const rx = /hvac|plumb|home.?serv|residential/i.test(q) ? SECT.pp : co ? SECT[co] : null;
    const deals = (d.items || []).flatMap(x => (x.deals_2025_2026 || []).map(z => ({ ...z, firm: x.firm }))).filter(z => !rx || rx.test(`${z.sector} ${z.company} ${z.note}`)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const kind = t => /add/i.test(t || '') ? 'Add-on' : /platform|anchor/i.test(t || '') ? 'New company' : 'Investment';
    return { html: `<h4>Sponsor deals since 2025${rx ? ` · ${esc(co && co !== 'pp' && !/hvac|plumb|home/i.test(q) ? COS_S[co] : 'home services')}` : ''}</h4><p>${n(deals.length)} deals by the ${n((d.items || []).length)} tracked sponsors match${deals.length ? '; newest first' : ''}.</p>${deals.length ? tbl(['Date', 'Sponsor', 'Company', 'Kind', 'Sector'], deals.slice(0, 10).map(z => [`<span style="white-space:nowrap">${esc(when(z.date))}</span>`, `<b>${esc(clip(z.firm, 40))}</b>`, esc(clip(z.company, 50)), esc(kind(z.type)), esc(clip(z.sector || '', 60))])) : ''}<p>${esc(sentences(d.meta?.landscape_summary, 1)).replace(/\.?$/, '.')}</p><div class="ch-src">Source: ${cite('pe_landscape')} (sponsor press releases and deal databases).</div>`, links: [app('#/pe/deals', 'Deal flow 2025–26'), app('#/pe/landscape', 'Private equity')], followups: ['Which PE firms are the biggest threat to BSP?', 'Who competes with BSP for home-services deals?', 'What multiple would a tuck-in trade at?'] };
  }
  let f = (d.items || []).filter(ov);
  f = f.slice().sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.threat_level] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.threat_level] ?? 3) || ((b.latest_fund?.size_usd || 0) - (a.latest_fund?.size_usd || 0))).slice(0, 8);
  const why = /threat|biggest|dangerous|worry/i.test(q) && f[0]?.threat_rationale ? `<p><b>Biggest threat: ${esc(f[0].firm)}.</b> ${esc(clip(f[0].threat_rationale, 280))}</p>` : '';
  return { html: `<h4>Rival sponsors${co ? ` · ${esc(COS_S[co])}` : ''}</h4>${why}${tbl(['Firm', 'Latest fund', 'Threat', 'Relevant companies'], f.map(x => [`<b>${esc(x.firm)}</b><br><span style="color:var(--ch-mute)">${esc(x.hq || '')}</span>`, x.latest_fund?.size_usd ? money(x.latest_fund.size_usd) : '—', `<span class="ch-badge">${esc(x.threat_level || '')}</span>`, esc((x.platforms_relevant || []).slice(0, 3).map(p => p.name).join(', '))]))}<p>${esc(sentences(d.meta?.landscape_summary, 2))}.</p><div class="ch-src">Source: ${cite('pe_landscape')} (sponsor sites, fund filings and press).</div>`, links: [app('#/pe/landscape', 'Private equity'), app('#/pe/deals', 'Deal flow 2025–26')], followups: ['Which rival sponsors bought HVAC companies recently?', 'How does BSP actually buy companies?', 'What multiple would a tuck-in trade at?'] };
}
async function financials(q) {
  const co = coOf(q) || 'pp'; const file = { pp: 'pp_filings', cet: 'cet_filings', fl: 'frontline_filings', ts: 'thomas_filings', bpi: 'bpi_filings', fh: 'fairharbor_filings' }[co];
  const d = await Data.research(file); if (!d) return null; const est = d.meta?.estimate_table || [];
  return { html: `<h4>${esc(COS_S[co])}: what filings imply</h4><p>${esc(sentences(d.meta?.financial_picture, 3))}.</p>${tbl(['Metric', 'Estimate', 'Confidence'], est.slice(0, 8).map(e => [esc(e.metric), `<b>${esc(e.estimate)}</b>`, `<span class="ch-badge">${esc(e.confidence)}</span>`]))}<div class="ch-src">${n((d.items || []).length)} filings indexed (SEC Form D / ADV, BDC loan schedules, PPP, FDD, state records). Estimates, not audited figures.</div>`, links: [app(`#/${co}/filings`, 'Filings & financials'), app('#/fin/portfolio', 'Fundamentals')], followups: ['How does that compare with public comps?', `Show add-on targets for ${COS[co]}`] };
}
async function movers(q) {
  const county = (q.match(/\b(lancaster|york|dauphin|cumberland|berks|lebanon|franklin|adams|perry|chester|montgomery|ocean|monmouth|atlantic|burlington)\b/i) || [])[1];
  const files = county && /ocean|monmouth|atlantic|burlington/i.test(county) ? ['sales/pp_sales_nj'] : county && /lancaster|york|dauphin|cumberland/i.test(county) ? ['sales/pp_sales_pa_a'] : county ? ['sales/pp_sales_pa_b'] : ['sales/pp_sales_pa_a', 'sales/pp_sales_pa_b', 'sales/pp_sales_nj'];
  const sets = await Promise.all(files.map(f => Data.load(f).catch(() => null))); let items = sets.filter(Boolean).flatMap(s => s.items || []);
  if (county) items = items.filter(i => String(i.county || '').toLowerCase() === county.toLowerCase());
  progress(`Scanning ${items.length} recorded home sales`);
  const res = items.filter(i => i.use_type === 'residential' && i.price >= 10000); const prices = res.map(i => i.price).sort((a, b) => a - b); const med = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const recent = res.filter(i => { const k = Fmt.days(i.sale_date); return k != null && k >= -90; }).length;
  return { html: `<h4>New-mover leads${county ? ` · ${esc(county)} County` : ' · all counties'}</h4><p>${n(res.length)} market-rate home sales on file (median ${med ? money(med) : '—'}), ${n(recent)} in the last 90 days. Every one is a household that just inherited an unknown HVAC system, water heater and panel.</p><ul><li>Welcome tune-up mailer within 30 days of closing</li><li>Pre-1980 stock: panel + plumbing safety inspection (Mister Sparky + Ben Franklin cross-sell)</li><li>Builder sales: maintenance-plan enrollment</li></ul><div class="ch-src">County recorder / GIS parcel data; nominal (&lt;$1k) transfers excluded.</div>`, links: [app(`#/pp/movers${county ? `?county=${encodeURIComponent(county)}` : ''}`, 'Open the lead list')], followups: ['How would ServiceOS automate this?', 'What is the storm outlook this week?'] };
}
const OS = { pp: ['ServiceOS', 'dispatch and capacity planning fed by weather, dynamic pricing, the membership engine, new-mover automation and an AI dispatcher on every missed call'], cet: ['GridOS', 'bid radar to estimating to crew scheduling, solar fleet monitoring, wastewater SCADA service contracts, EV network operations and NuWave savings dashboards'], fl: ['FirmOS', 'an AI first-line service desk, a security posture score for every firm, eBilling and receivables automation and a client portal, with product-led growth into mid-size firms'], ts: ['LabOS', 'punchout e-commerce, vendor-managed inventory, supplier consolidation analytics, AI product search and account-health scoring across 27,000 lab sites'], bpi: ['SignalOS', 'real-time narrative monitoring, synthetic-audience message testing, a generative content workflow with compliance review and productized retainers'], fh: ['HarborOS', 'AI fit and size, replenishment reminders, a wholesale portal, inventory forecasting and recycled-material traceability'] };
async function osConcept(q) {
  const ev = await Data.research('serviceos_evidence'); const prem = ev?.meta?.multiple_premium_summary?.by_platform || {};
  const turns = k => Array.isArray(prem[k]?.range_turns) ? `${prem[k].range_turns[0]}–${prem[k].range_turns[1]} turns` : '—';
  if (/every|all|each|across|portfolio|theses/i.test(q) && !/serviceos|gridos|firmos|labos|signalos|harboros/i.test(q)) {
    return { html: `<h4>Tech-enablement theses for all six companies</h4><p>${esc(clip(ev?.meta?.thesis_summary || 'Each company gets one operating system: buy the system of record, build the data layer and AI workflows on top, and make every add-on plug into it.', 360))}</p>${tbl(['Company', 'Operating system', 'What it does', 'Premium it can claim'], Object.keys(OS).map(k => [`<b>${esc(COS[k])}</b>`, `<b>${esc(OS[k][0])}</b>`, esc(clip(OS[k][1], 120)), `<span class="ch-num">${esc(turns(k))}</span>`]))}<p>${esc(clip(ev?.meta?.multiple_premium_summary?.headline || '', 300))}</p><div class="ch-src">Source: ${cite('serviceos_evidence')} (banker multiple surveys, deal prints, vendor and public-company data). Premium ranges are analyst estimates.</div>`,
      links: [app('#/techos/overview', 'Tech-enablement program'), link(ROOT + 'redesigns/ai-agents.html', 'AI agents')], followups: ['What is ServiceOS and why does it raise valuation?', 'Which AI agents create the most value?', 'What multiple would a tuck-in trade at?'] };
  }
  const co = coOf(q) || 'pp'; const [name, what] = OS[co];
  const items = (ev?.items || []).filter(i => (i.applies_to || [i.company]).includes(co));
  const proof = items.filter(i => i.kind === 'valuation_evidence').slice(0, 4); const kpis = items.filter(i => i.kind === 'kpi_benchmark').slice(0, 4); const stack = items.filter(i => i.kind === 'vendor_stack').slice(0, 4);
  return { html: `<h4>${esc(name)} for ${esc(COS_S[co])}</h4><p><b>What it is:</b> ${esc(what)}.</p><p><b>Why it matters for valuation:</b> tech-enabled services businesses earn higher multiples because growth is repeatable (bookings, memberships, retention), margins are visible in real time and add-ons integrate in weeks. The evidence supports about <b>${esc(turns(co))}</b> of extra EBITDA multiple for ${esc(COS[co])} <span class="ch-badge ch-est">est.</span>${prem[co]?.support ? `: ${esc(clip(prem[co].support, 200))}` : '.'}</p>${proof.length ? `<h4>Evidence</h4><ul>${proof.map(i => `<li>${esc(clip(i.claim || i.title, 200))}</li>`).join('')}</ul>` : ''}${kpis.length ? `<h4>What it should move <span class="ch-badge ch-est">est.</span></h4>${tbl(['KPI', 'Baseline → target'], kpis.map(k => [esc(k.kpi), `<span class="ch-num">${esc(k.baseline ?? '—')} → ${esc(k.target ?? '—')}</span> ${esc(clip(k.unit || '', 40))}`]))}` : ''}${stack.length ? `<p><b>Build on:</b> ${stack.map(v => esc(v.vendor || v.title || v.name || '')).filter(Boolean).join(', ')}. Buy the system of record, build the data layer and the AI workflows on top.</p>` : '<p><b>Build vs buy:</b> buy the system of record, build the data layer and the AI workflows on top.</p>'}<div class="ch-src">Source: ${cite('serviceos_evidence')}. Premium ranges and KPI targets are analyst estimates.</div>`,
    links: [app('#/techos/overview', 'Tech-enablement program'), link(ROOT + `redesigns/${SLUG[co]}/`, `${COS[co]} site concept`)], followups: ['What multiple would a tuck-in trade at?', 'What are the tech-enablement theses for every company?', co === 'pp' ? 'Show me how to take Punctual Pros nationwide' : `What is the growth plan for ${NAMES[co]}?`] };
}
const pct = v => v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : `<span class="ch-num">${Number(v).toFixed(1)}%</span>`;
const SECTOR = { residential_home_services: 'Residential home services', commercial_electrical_energy: 'Commercial electrical and energy', legal_bpo_managed_services: 'Legal outsourcing and managed IT', lab_distribution: 'Lab supply distribution', communications_agencies: 'Communications agencies', apparel_dtc: 'Direct-to-consumer apparel' };
async function comps(q) {
  const d = await Data.research('public_comps'); if (!d) return null; const sb = d.meta?.sector_benchmarks || {};
  const rows = Object.entries(sb).slice(0, 8).map(([k, v]) => [esc(SECTOR[k] || srcLabel(k)), pct(v.median_revenue_growth_latest_pct ?? v.median_revenue_growth_pct ?? v.median_growth ?? v.growth), pct(v.median_operating_margin_latest_pct ?? v.median_operating_margin_pct ?? v.median_operating_margin ?? v.operating_margin), esc(String(v.median_revenue_per_employee_usd ? Fmt.money(v.median_revenue_per_employee_usd) : v.revenue_per_employee ?? '—'))]);
  return { html: `<h4>Public comparables by sector</h4>${tbl(['Sector', 'Growth', 'Op. margin', 'Rev/employee'], rows)}<p>${esc(sentences(d.meta?.financial_picture, 2))}.</p>`, links: [app('#/fin/comps', 'Fundamentals · public comparables'), app('#/ma/valuation', 'Valuation benchmarks')], followups: ['What multiple would a tuck-in trade at?', 'Estimate Punctual Pros revenue from filings'] };
}
const NAV = [[/weather|storm|forecast/i, '#/pp/weather', 'Weather & demand'], [/mover|lead|mailing|home sales/i, '#/pp/movers', 'New-mover marketing'], [/wastewater|horton/i, '#/cet/wastewater', 'Wastewater accounts'], [/radar|opportunit|rfp|bid/i, '#/cet/opportunities', 'Opportunity radar'], [/pipeline|acquisition|add-?on|m&a/i, '#/ma/pipeline', 'Acquisition engine'], [/landscape|competitor|sponsor|pe firm/i, '#/pe/landscape', 'Private equity'], [/filing|financial|sec|form d/i, '#/fin/portfolio', 'Fundamentals'], [/comps|comparable|valuation|multiple/i, '#/fin/comps', 'Fundamentals · public comparables'], [/law ?firm|am ?law/i, '#/fl/amlaw', 'AM Law 200 targets'], [/lab|site explorer|hospital/i, '#/ts/sites', 'Site explorer'], [/briefing|video|tour/i, '#/briefing/play', 'Narrated tour'], [/tech|serviceos|gridos|os\b/i, '#/techos/overview', 'Tech enablement'], [/3d|theater|theatre|cinematic|fly.?through|webgl|globe/i, '#/theater/play', '3D map'], [/case(s| stud)|value.?creation|timeline|exits?\b/i, '#/cases/timeline', 'Sponsor precedents'], [/how broad sky buys|deal patterns|rubric|methodolog|network|deals?\b/i, '#/bsp/deals', 'How BSP buys'], [/national|scorer|county scores?|nationwide/i, '#/national/scorer', 'US expansion']];
function navigate(q) { const hit = NAV.find(([rx]) => rx.test(q)); if (!hit) return null; return { html: `<p>Opening <b>${esc(hit[2])}</b>.</p>`, links: [app(hit[1], hit[2])], go: APP + hit[1] }; }

async function nationwideSub(q) {
  const nw = await Data.research('pp_nationwide'); if (!nw) return expansionPlan();
  const items = nw.items || [];
  if (/agent|ai\b|automation|efficien/i.test(q)) { const a = items.filter(i => i.kind === 'ai_agent').sort((x, y) => (x.weeks_to_deploy || 99) - (y.weeks_to_deploy || 99)); progress(`Ranking ${a.length} agents by time to deploy`); return { html: `<h4>AI agents by payback</h4>${tbl(['Agent', 'Helps', 'Time to launch', 'Evidence'], a.slice(0, 10).map(x => [`<b>${esc(x.agent)}</b><br><span style="color:var(--ch-mute)">${esc((x.vendor_examples || []).slice(0, 2).join(', '))}</span>`, esc(x.who_it_helps || ''), x.weeks_to_deploy ? `${x.weeks_to_deploy} wks` : '—', esc(clip(x.metric_claim || '', 120))]))}<div class="ch-src">${esc(String((nw.meta?.caveats || []).find(c => /vendor|case stud/i.test(c)) || ''))}</div>`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#agents', 'AI agents in the nationwide plan'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS')], followups: ['Which programs help the technicians?', 'Show me how to take Punctual Pros nationwide'] }; }
  if (/pro(s|gram)|technician|tech(s)?\b|contractor|hvac people|trade/i.test(q)) { const p = items.filter(i => i.kind === 'pro_program'); return { html: `<h4>Programs for the pros</h4><ul>${p.map(x => `<li><b>${esc(x.program)}</b> (${esc(x.who_it_helps || '')}) — ${esc(clip(x.evidence || '', 160))}</li>`).join('')}</ul>`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#pros', 'Helping the pros')], followups: ['Which AI agents pay back fastest?', 'Which counties come first?'] }; }
  if (/smith|howard|template|compare|analog/i.test(q)) { const t = items.filter(i => i.kind === 'template').sort((x, y) => String(x.date).localeCompare(String(y.date))); return { html: `<h4>Smith + Howard vs Punctual Pros</h4>${tbl(['When', 'Smith + Howard move', 'Where'], t.slice(0, 12).map(x => [`<span style="white-space:nowrap">${esc(when(x.date))}</span>`, `<b>${esc(x.event)}</b>${x.metric ? ` <span class="ch-badge">${esc(x.metric)}</span>` : ''}`, esc(x.location || '')]))}<p>${esc(String(nw.meta?.narrative || '').split('. ').slice(2, 5).join('. '))}.</p>`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#template', 'The template'), app('#/home/firm', 'BSP profile')], followups: ['Show me how to take Punctual Pros nationwide'] }; }
  if (/count(y|ies)|first|where|phase/i.test(q)) { const ph = items.filter(i => i.kind === 'expansion_phase'); return { html: `<h4>Where first — the four phases</h4>${ph.map((p, i) => `<p><b>Phase ${i + 1} · ${esc(phaseName(p))}</b>${phaseMonths(p) ? ` <span class="ch-badge">${esc(phaseMonths(p))}</span>` : ''}<br>${esc(clip(p.thesis || '', 220))}<br><span style="color:var(--ch-mute)">${esc((Array.isArray(p.geography) ? p.geography : [p.geography || '']).join(', '))}</span></p>`).join('')}`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#map', 'Phased map'), app('#/pp/territory', 'Territory & expansion')], followups: ['Which AI agents pay back fastest?'] }; }
  return expansionPlan();
}
async function adsProgram(q) {
  const d = await Data.research('pp_ads'); if (!d) return { html: `<h4>Growth marketing for Punctual Pros</h4><p>Cheap connected-TV flights triggered by NWS alerts, Google Local Services Ads for people already searching, and postcards to new homeowners from county deed records. The sourced media plan, CTV platform comparison and sample creatives are being compiled.</p>`, links: [link(ROOT + 'redesigns/punctual-pros/ads.html', 'Sample ads & media plan')] };
  const it = d.items || []; const K = k => it.filter(i => i.kind === k);
  const plan = K('media_plan')[0]; const plat = K('ctv_platform').slice().sort((a, b) => (a.minimum_spend_usd ?? 1e9) - (b.minimum_spend_usd ?? 1e9)); const cr = K('creative');
  const ctv = cr.filter(c => /ctv/.test(c.format || ''));
  return { html: `<h4>Punctual Pros sample ads</h4><p>${esc(sentences(d.meta?.strategy_summary, 3))}.</p>${plan ? `<h4>Media plan <span class="ch-badge ch-est">est.</span></h4><p class="ch-num"><b>${esc(plan.phase)}:</b> ${money(plan.monthly_budget_usd)}/mo → ${n(plan.channel_mix?.reduce((a, c) => a + (c.est_leads || 0), 0))} leads · ${n(plan.channel_mix?.reduce((a, c) => a + (c.est_booked_jobs || 0), 0))} booked jobs · CPA ${money(plan.expected_cpa_usd)} · revenue ${money(plan.expected_revenue_usd)}</p>${tbl(['Channel', 'Share', 'Monthly', 'Leads', 'Jobs'], (plan.channel_mix || []).map(c => [esc(c.channel), `${c.share_pct ?? '—'}%`, money(c.monthly_usd), c.est_leads ?? '—', c.est_booked_jobs ?? '—']))}` : ''}<h4>Cheapest CTV entry points</h4>${tbl(['CTV platform', 'Minimum', 'CPM', 'Targets'], plat.slice(0, 6).map(p => [`<b>${esc(p.platform)}</b>${p.self_serve ? ' <span class="ch-badge">self-serve</span>' : ''}`, p.minimum_spend_usd != null ? money(p.minimum_spend_usd) : '—', Array.isArray(p.cpm_range_usd) ? `$${p.cpm_range_usd[0]}–${p.cpm_range_usd[1]}` : '—', esc((p.targeting || []).slice(0, 3).join(', '))]))}<h4>Sample spots</h4><ul>${ctv.slice(0, 4).map(c => `<li><b>${esc(c.title)}</b> (${esc(c.format)}) — ${esc(c.audience || '')}: “${esc(clip(c.hook || '', 110))}”</li>`).join('')}</ul>`, links: [link(ROOT + 'redesigns/punctual-pros/ads.html', 'Open sample ads & media plan'), app('#/pp/weather', 'Storm triggers'), app('#/pp/movers', 'New-mover feed')], followups: ['Show me how to take Punctual Pros nationwide', 'Which AI agents pay back fastest?'] };
}
const PLAN_STOP = new Set(['what', 'does', 'plan', 'plans', 'growth', 'grow', 'grows', 'growing', 'company', 'companies', 'broad', 'take', 'scale', 'next', 'phase', 'should', 'would', 'could', 'more', 'most', 'across', 'into', 'every', 'each', 'build', 'expand', 'value', 'creation', 'help', 'make', 'bsp', 'sky', 'its', 'their', 'there']);
/** Topic words in a growth-plan question ("wholesale", "international"), minus company names and plan vocabulary. */
const focusOf = q => tok(String(q).replace(new RegExp(CO_NAME_RX, 'ig'), ' ')).filter(w => w.length > 3 && !PLAN_STOP.has(w));
async function companyPlaybook(q) {
  const co = coOf(q); if (!co || co === 'pp') return expansionPlan();
  const slug = { cet: 'cet', fl: 'frontline', ts: 'thomas-scientific', bpi: 'bpi', fh: 'fair-harbor' }[co];
  const os = { cet: 'gridos', fl: 'firmos', ts: 'labos', bpi: 'signalos', fh: 'harboros' }[co];
  const d = await Data.research(`${co}_playbook`);
  if (!d) return { html: `<h4>${esc(COS_S[co])} growth plan</h4><p>The sourced growth plan (Smith + Howard template, four phases, levers, AI agents, talent programs, financing, 36-month roadmap) is being compiled. Meanwhile the module below has the live opportunity, target and filings data.</p>`, links: [app(`#/${co}/overview`, `${COS[co]} module`), link(ROOT + `redesigns/${slug}/growth-plan.html`, 'Growth plan page')] };
  const it = d.items || []; const K = k => it.filter(i => i.kind === k); const ph = K('expansion_phase'), lv = K('growth_lever'), ag = K('ai_agent'), tp = K('talent_program'); const road = d.meta?.kpi_roadmap || [];
  const fw = focusOf(q).map(w => w.slice(0, Math.max(5, w.length - 2))); const txt = i => JSON.stringify([i.lever, i.name, i.phase, i.thesis, i.agent, i.program, i.job_to_be_done, i.evidence]).toLowerCase();
  const hits = fw.length ? [...lv, ...ph, ...ag, ...tp].filter(i => fw.some(w => txt(i).includes(w))).slice(0, 6) : [];
  const focus = hits.length ? `<h4>The plan on ${esc(focusOf(q).slice(0, 2).join(' and '))}</h4><ul>${hits.map(i => `<li><b>${esc(i.lever || i.agent || i.program || phaseName(i))}</b>${i.baseline != null || i.target != null ? ` <span class="ch-num">${esc(bt(i.baseline))} → ${esc(bt(i.target))}${i.unit ? ' ' + esc(clip(i.unit, 40)) : ''}</span>` : ''} — ${esc(clip(i.evidence || i.thesis || i.metric_claim || i.job_to_be_done || '', 200))}</li>`).join('')}</ul>` : '';
  return { html: `<h4>${esc(COS_S[co])} growth plan</h4><p>${esc(sentences(d.meta?.narrative, hits.length ? 2 : 3))}.</p>${focus}${ph.map((p, i) => `<h4>Phase ${i + 1}${phaseMonths(p) ? ` <span class="ch-badge">${esc(phaseMonths(p))}</span>` : ''}</h4><p><b>${esc(phaseName(p))}.</b> ${esc(clip(p.thesis || '', 260))}</p>`).join('')}${lv.length ? `<h4>Levers</h4>${tbl(['Lever', 'Baseline → target', 'Evidence'], lv.slice(0, 8).map(l => [`<b>${esc(l.lever)}</b>`, l.baseline != null || l.target != null ? `<span class="ch-num">${esc(bt(l.baseline))} → ${esc(bt(l.target))}${l.unit ? ' ' + esc(l.unit) : ''}</span>` : '—', esc(clip(l.evidence || '', 100))]))}` : ''}${ag.length ? `<h4>AI agents</h4><ul>${ag.slice(0, 6).map(a => `<li><b>${esc(a.agent)}</b> (${esc(a.who_it_helps || '')}) — ${esc(clip(a.metric_claim || a.job_to_be_done || '', 110))}</li>`).join('')}</ul>` : ''}${tp.length ? `<h4>Talent</h4><ul>${tp.slice(0, 4).map(t => `<li><b>${esc(t.program)}</b> — ${esc(clip(t.evidence || '', 110))}</li>`).join('')}</ul>` : ''}${road.length ? `<h4>36-month roadmap <span class="ch-badge">assumptions</span></h4>${tbl(['Month', 'Revenue', 'EBITDA', 'Headcount'], road.map(r => [r.month, r.revenue_usd ? money(r.revenue_usd) : '—', r.ebitda_usd ? money(r.ebitda_usd) : '—', r.headcount ?? '—']))}` : ''}<div class="ch-src">Source: ${cite(`${co}_playbook`)} (press, filings, vendor data) and the portal datasets. Figures labelled est./assumptions are analyst assumptions.</div>`,
    links: [link(ROOT + `redesigns/${slug}/growth-plan.html`, 'Open the growth plan'), link(ROOT + `redesigns/${slug}/${os}.html`, `${os.replace('os', 'OS')} concept`), app(`#/${co}/overview`, `${COS[co]} module`), app(`#/ma/pipeline?platform=${co}`, 'Add-on pipeline')],
    followups: [`Which AI agents help ${COS[co]} most?`, 'Show me how to take Punctual Pros nationwide', 'What are the tech-enablement theses for every company?'] };
}
async function aiAgents(q) {
  const d = await Data.research('ai_agents_portfolio'); const co = coOf(q);
  if (!d || co === 'pp' || /pay ?back|fastest|punctual/i.test(q)) return nationwideSub(q);
  let a = (d.items || []).filter(i => i.kind === 'agent'); if (co) a = a.filter(i => i.company === co);
  a = a.slice().sort((x, y) => (y.est_annual_value_usd || 0) - (x.est_annual_value_usd || 0));
  progress(`Ranking ${a.length} agents by annual value`);
  const tot = a.reduce((s, x) => s + (x.est_annual_value_usd || 0), 0);
  return { html: `<h4>AI agents${co ? ` for ${esc(COS_S[co])}` : ', portfolio-wide'}</h4><p>${esc(sentences(d.meta?.program_summary, 2))}. ${n(a.length)} agents, est. annual value ${money(tot)} <span class="ch-badge">assumption</span>.</p>${tbl(['Agent', 'Layer', 'Trigger → job', 'Est. value/yr', 'Time to launch'], a.slice(0, 10).map(x => [`<b>${esc(x.agent)}</b>${co ? '' : `<br><span style="color:var(--ch-mute)">${esc(COS[x.company] || x.company)}</span>`}`, esc(x.layer || ''), esc(`${x.trigger || ''} → ${clip(x.job_to_be_done, 70)}`), x.est_annual_value_usd ? money(x.est_annual_value_usd) : '—', x.weeks_to_deploy ? `${x.weeks_to_deploy} wks` : '—']))}<div class="ch-src">Vendors and metrics carry sources on the AI agents page; human-in-the-loop gates listed per agent.</div>`, links: [link(ROOT + 'redesigns/ai-agents.html', 'The agentic layer'), app('#/techos/overview', 'Tech enablement')], followups: ['Which AI agents pay back fastest?', 'What are the tech-enablement theses for every company?'] };
}
async function voiceAI(q) {
  const [v, nw] = await Promise.all([Data.research('voice_ai'), Data.research('pp_nationwide')]); const co = coOf(q);
  if (!v) { const disp = (nw?.items || []).find(i => i.kind === 'ai_agent' && /dispatcher|call answering/i.test(i.agent || '')); return { html: `<h4>24/7 voice AI</h4><p>Every unanswered call is a lost job. A voice agent answers every call in two rings, triages no-heat / no-cool / leak calls, checks capacity and books straight into dispatch; after hours and on storm days it is the difference between a booked job and a competitor's. The same agent works outbound: membership renewals, maintenance reminders, pre-storm check-ins, review requests.</p>${disp ? `<p><b>${esc(disp.agent)}</b> — ${esc(clip(disp.metric_claim || '', 220))}</p>` : ''}<p>Sourced economics, vendors, sample calls and a revenue-recovered calculator are being compiled.</p>`, links: [link(ROOT + 'redesigns/voice-ai.html', 'Voice AI growth engine'), link(ROOT + 'redesigns/punctual-pros/nationwide.html#agents', 'AI agents in the nationwide plan')] }; }
  const it = v.items || []; const K = k => it.filter(i => i.kind === k); const m = v.meta?.pp_revenue_model || {};
  let uc = K('use_case'); if (co) uc = uc.filter(u => u.company === co); uc = uc.slice().sort((a, b) => (b.est_annual_value_usd || 0) - (a.est_annual_value_usd || 0));
  const met = K('metric').filter(x => !co || (x.company_applies || []).includes(co)).slice(0, 6); const ven = K('vendor').filter(x => x.type === 'answering' || x.type === 'outbound').slice(0, 5);
  return { html: `<h4>24/7 voice AI${co ? ` for ${esc(COS_S[co])}` : ''}</h4><p>${esc((Array.isArray(v.meta?.thesis) ? v.meta.thesis.slice(0, 3).join(' ') : String(v.meta?.thesis || '').split('. ').slice(0, 3).join('. ')).replace(/\.\s*$/, ''))}.</p>${m.total_est_usd ? `<p class="ch-num">Punctual Pros: ${n(m.inbound_calls_per_month)} calls/mo · ${share(m.missed_share)} missed today → ${share(m.recovered_share_with_ai)} of those recovered × ${share(m.booking_rate)} booked × ${money(m.avg_ticket)} ticket ≈ ${money(m.recovered_revenue_annual_usd)}/yr recovered + ${money(m.outbound_renewal_uplift_usd)} outbound = <b>${money(m.total_est_usd)}/yr</b> <span class="ch-badge">assumption</span></p>` : ''}${met.length ? `<h4>What the data says</h4><ul>${met.map(x => `<li><b>${/^share$|^fraction$/i.test(x.unit || '') && Number(x.value) <= 1 ? share(x.value) : `${esc(String(x.value))}${x.unit ? ' ' + esc(x.unit) : ''}`}</b> — ${esc(x.metric)} <span style="color:var(--ch-mute)">(${esc(Fmt.host(x.source_url))})</span></li>`).join('')}</ul>` : ''}${uc.length ? `<h4>Use cases</h4>${tbl(['Use case', 'Direction', 'Trigger → handoff', 'Est. value/yr', 'Time to launch'], uc.slice(0, 8).map(u => [`<b>${esc(u.name)}</b>${co ? '' : `<br><span style="color:var(--ch-mute)">${esc(COS[u.company] || u.company)}</span>`}`, esc(u.direction || ''), esc(`${clip(u.trigger, 50)} → ${clip(u.handoff_rule, 50)}`), u.est_annual_value_usd ? money(u.est_annual_value_usd) : '—', u.weeks_to_deploy ? `${u.weeks_to_deploy} wks` : '—']))}` : ''}${ven.length ? `<h4>Vendors</h4><ul>${ven.map(x => `<li><b>${esc(x.vendor)}</b> — ${esc(clip(x.pricing_note || '', 90))}</li>`).join('')}</ul>` : ''}<div class="ch-src">Sources on the Voice AI page; guardrails: the agent says it is an AI, hands off to a person on request, and every call is QA-sampled.</div>`, links: [link(ROOT + 'redesigns/voice-ai.html', 'Open Voice AI: play a sample call'), link(ROOT + 'redesigns/ai-agents.html', 'All AI agents'), app('#/pp/weather', 'Storm-day volume')], followups: ['Play the after-hours no-heat call', 'Which AI agents pay back fastest?', 'Show me how to take Punctual Pros nationwide'] };
}
/* ── Value-creation cases, how BSP buys, national county scorer (tolerant of files still being produced) ── */
const NEW_FOLLOW = { cases: 'What did sponsors do with companies like Punctual Pros?', buys: 'How does BSP actually buy companies?', national: 'Which counties nationwide should Punctual Pros expand to first?' };
const pending = (title, what, links, followups) => ({ html: `<h4>${esc(title)}</h4><p>${esc(what)} The full analysis is on the page below.</p>`, links, followups });
const casesLinks = () => [app('#/cases/timeline', 'Sponsor precedents'), link(ROOT + 'redesigns/case-studies.html', 'Case studies page'), link(ROOT + 'redesigns/punctual-pros/nationwide.html', 'Nationwide plan')];
async function valueCases(q = '') {
  const d = await Data.research('value_creation_cases');
  const fus = [NEW_FOLLOW.buys, NEW_FOLLOW.national, 'Show me how to take Punctual Pros nationwide'];
  if (!d || !Array.isArray(d.items)) return pending('What sponsors did before selling', 'This answer compares how sponsors built and sold companies like Apex, Wrench, Champions, Sila and Smith + Howard: when the operator team arrived, how soon the first add-on closed, the cadence of tuck-ins, and what the buyer paid for at exit.', casesLinks(), fus);
  const m = d.meta || {}; const ts = m.timing_stats || {}; const pp = ts.punctual_pros || {};
  progress(`Lining up ${(m.entry_exit_table || []).length} entry-to-exit records`);
  const pats = d.items.filter(i => i.kind === 'pattern');
  const win = w => { if (!w || w.start == null) return w?.median_hold_years ? `~${w.median_hold_years} yr hold` : 'Any time'; if (w.relative_to === 'exit') return `Last ${Math.abs(w.start)} mo`; return `Mo ${Math.round(w.start)}–${Math.round(w.end)}`; };
  const head = p => { const h = String(p.pattern || '').replace(/^(Day|Days|Months?|Years?|Mid-hold|Last)[^:]*:\s*/i, ''); return h.charAt(0).toUpperCase() + h.slice(1); };
  const sold = (m.entry_exit_table || []).filter(r => r.exit_year && /sold|recap|ipo/i.test(r.hold_status || '')).sort((a, b) => (b.exit_year || 0) - (a.exit_year || 0) || (b.revenue_growth_x || 0) - (a.revenue_growth_x || 0)).slice(0, 8);
  const stat = (o, k = 'median') => o && o[k] != null ? o[k] : null;
  const stats = [stat(ts.first_addon_months) != null ? `first add-on at a median of <span class="ch-num">${stat(ts.first_addon_months)}</span> months (n=${ts.first_addon_months.n})` : '', stat(ts.months_per_addon) != null ? `then one deal every <span class="ch-num">${stat(ts.months_per_addon)}</span> months` : '', stat(ts.hold_years_first_sponsor) != null ? `a first-sponsor hold of <span class="ch-num">${stat(ts.hold_years_first_sponsor)}</span> years` : ''].filter(Boolean);
  return {
    html: `<h4>${/how long|hold/i.test(q) ? 'How long sponsors hold home-services companies' : 'What sponsors did before selling'}</h4>${/how long|hold/i.test(q) && stat(ts.hold_years_first_sponsor) != null ? `<p>The first sponsor held for a median of <b class="ch-num">${stat(ts.hold_years_first_sponsor)} years</b> (range ${esc(stat(ts.hold_years_first_sponsor, 'min'))}–${esc(stat(ts.hold_years_first_sponsor, 'max'))} years, ${n(ts.hold_years_first_sponsor.n)} cases)${ts.hold_years_residential_and_franchise?.median != null ? `; residential and franchise companies a median of <b class="ch-num">${esc(ts.hold_years_residential_and_franchise.median)} years</b> (${n(ts.hold_years_residential_and_franchise.n)} cases)` : ''}.${pp.hold_month_on_2026_10_06 != null ? ` Punctual Pros is in month ${esc(pp.hold_month_on_2026_10_06)} of its hold, about ${esc((pp.hold_month_on_2026_10_06 / 12).toFixed(1))} years in.` : ''}</p>` : ''}<p>${esc(sentences(m.narrative, 3)).replace(/\.?$/, '.')}</p>${stats.length ? `<p><b>The clock.</b> Across the case set: ${stats.join(', ')}.${pp.hold_month_on_2026_10_06 != null ? ` Punctual Pros closed its first add-on in month ${esc(pp.first_addon_month)} and is in month ${esc(pp.hold_month_on_2026_10_06)} of the hold today.` : ''}</p>` : ''}${pats.length ? `<h4>The sequence, in hold months</h4>${tbl(['When', 'Move', 'What the cases show'], pats.slice(0, 9).map(p => [`<span class="ch-num" style="white-space:nowrap">${esc(win(p.window_months_from_entry))}</span>`, `<b>${esc(clip(head(p), 70))}</b>`, esc(clip(p.description || '', 150))]))}` : ''}${sold.length ? `<h4>Entry → exit</h4>${tbl(['Company', 'Held', 'Sold to', 'Revenue growth'], sold.map(r => [`<b>${esc(clip(String(r.company || '').replace(/\s*\(.*$/, ''), 38))}</b>`, `<span class="ch-num">${esc(r.entry_year || '—')}–${esc(r.exit_year || '')}</span>`, esc(clip(r.exit_buyer || '—', 48)), r.revenue_growth_x ? `<span class="ch-num">${esc(r.revenue_growth_x)}×</span>` : '—']))}` : ''}<div class="ch-src">Source: ${cite('value_creation_cases')} (34 sponsor cases from press releases and filings). ${esc(clip((m.caveats || [])[0] || '', 200))}</div>`,
    links: casesLinks(), followups: fus,
  };
}
async function bspBuys(q = '') {
  const d = await Data.research('bsp_methodology');
  const L = [app('#/bsp/deals', 'How BSP buys'), link(ROOT + 'redesigns/methodology.html', 'Methodology page'), app('#/home/firm', 'Firm profile')];
  const fus = [NEW_FOLLOW.cases, NEW_FOLLOW.national, 'Who competes with BSP for home-services deals?'];
  if (!d || !Array.isArray(d.items)) return pending('How BSP buys', 'This answer rebuilds every disclosed BSP deal from primary releases to show the pattern: theme-first sourcing, who sells, how soon the first add-on closes, which advisers recur, and a weighted rubric for the next company.', L, fus);
  const m = d.meta || {}; const it = d.items;
  progress(`Reading ${it.filter(i => i.kind === 'deal').length} disclosed deals`);
  const narr = Array.isArray(m.methodology_narrative) ? m.methodology_narrative : String(m.methodology_narrative || '').split(/(?<=\.)\s+/);
  const pats = it.filter(i => i.kind === 'pattern').sort((a, b) => (a.strength === 'strong' ? 0 : 1) - (b.strength === 'strong' ? 0 : 1)).slice(0, 7);
  const crit = it.filter(i => i.kind === 'criterion').sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0));
  const chans = it.filter(i => i.kind === 'sourcing_channel' && !/legal|counsel/i.test(`${i.channel_type} ${i.channel}`)).sort((a, b) => (b.deal_count || 0) - (a.deal_count || 0)).slice(0, 5);
  const split = p => { const t = String(p || ''); const k = t.indexOf(':'); return k > 8 && k < 90 ? [t.slice(0, k), t.slice(k + 1).trim()] : [clip(t, 70), '']; };
  if (/banker|advis[eo]r|intermediar|who (brings|sources|introduces)|where .*deals come from|sourcing/i.test(q)) {
    const dealName = Object.fromEntries(it.filter(i => i.kind === 'deal').map(i => [i.id, i.company]));
    const CH = { buy_side_banker: 'Buy-side bank', sell_side_banker: 'Sell-side bank', exit_banker: 'Exit bank', proprietary_search: 'Proprietary search', thematic_research: 'Thematic research', accounting_ma_consultant: 'M&A consultant', capital_partner: 'Capital partner', platform_relationship: 'Portfolio company relationship' };
    const all = it.filter(i => i.kind === 'sourcing_channel' && !/legal|counsel/i.test(`${i.channel_type} ${i.channel}`)).sort((a, b) => (b.deal_count || 0) - (a.deal_count || 0));
    return { html: `<h4>Who brings BSP its deals</h4><p>${all[0] ? `<b>${esc(all[0].channel)}</b> is the most-used channel (${n(all[0].deal_count)} deals). ` : ''}${esc(clip(narr.find(t => /bank|adviser|advisor|sourc/i.test(t)) || '', 260))}</p>${tbl(['Channel', 'Kind', 'Deals', 'On which deals', 'What it means'], all.slice(0, 9).map(c => [`<b>${esc(c.channel)}</b>`, esc(CH[c.channel_type] || 'Other'), `<span class="ch-num">${esc(c.deal_count ?? (c.roles || []).length)}</span>`, esc(clip((c.roles || []).map(r => `${dealName[r.deal_id] || 'a deal'} (${when(r.date)})`).join(', '), 120)), esc(clip(c.implication || '', 120))]))}<div class="ch-src">Source: ${cite('bsp_methodology')} (BSP, company and adviser press releases).</div>`, links: L, followups: fus };
  }
  return {
    html: `<h4>How BSP actually buys companies</h4><p>${esc(narr.slice(0, 3).join(' '))}</p>${pats.length ? `<h4>Deal patterns</h4>${tbl(['Pattern', 'Strength', 'What it means for the next deal'], pats.map(p => { const [h, rest] = split(p.pattern); return [`<b>${esc(h)}</b>${rest ? `<br><span style="color:var(--ch-mute)">${esc(clip(rest, 110))}</span>` : ''}`, `<span class="ch-badge">${esc(p.strength || '')}</span>`, esc(clip(p.implication_for_next_deals || '', 130))]; }))}` : ''}${crit.length ? `<h4>Screening rubric <span class="ch-badge">inferred weights</span></h4>${tbl(['Criterion', 'Weight', 'How to test it'], crit.slice(0, 10).map(c => [`<b>${esc(c.criterion)}</b>`, `<span class="ch-num">${esc(c.weight_pct)}%</span>`, esc(clip(c.test || '', 110))]))}${m.rubric_summary?.scoring ? `<p>${esc(clip(m.rubric_summary.scoring, 220))}</p>` : ''}` : ''}${chans.length ? `<h4>Where deals come from</h4><ul>${chans.map(c => `<li><b>${esc(c.channel)}</b> <span class="ch-badge">${esc(c.deal_count)} deal${c.deal_count === 1 ? '' : 's'}</span> — ${esc(clip(c.implication || '', 140))}</li>`).join('')}</ul>` : ''}<div class="ch-src">Source: ${cite('bsp_methodology')} (BSP, company and adviser press releases). ${esc(clip((m.caveats || [])[0] || '', 180))}</div>`,
    links: L, followups: fus,
  };
}
const US_STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
const ST_NAME = Object.fromEntries(Object.entries(US_STATES).map(([k, v]) => [v, k.replace(/\b[a-z]/g, c => c.toUpperCase())]));
/** Any US state named in full, or a two-letter code that cannot be an English word in a question. */
const stateAny = q => { const s = String(q); const full = Object.keys(US_STATES).sort((a, b) => b.length - a.length).find(k => new RegExp(`\\b${k}\\b`, 'i').test(s)); if (full) return US_STATES[full]; const m = s.match(/\b(A[KLRZ]|C[AOT]|D[CE]|FL|GA|I[AD]|IL|K[SY]|LA|M[ADINOST]|N[CDEHJMVY]|OH|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/); return m ? m[1] : null; };
const NEAR = new Set(['PA', 'NJ', 'MD', 'DE']);
/** Equal-weight default score: pre-1980 housing, owner share, 2025 permits per 1k homes, home sales per 1k homes (percentile ranks). */
function scoreCounties(rows) {
  const big = rows.filter(r => (r.pop_est_2024 || r.population || 0) >= 100000 && r.housing_units > 0);
  const val = { pre: r => r.pre1980_share, own: r => r.owner_occupied_share, perm: r => r.permits_per_1k_hu_2025, sales: r => (r.home_sales_12m != null ? 1000 * r.home_sales_12m / r.housing_units : null) };
  const rank = {};
  for (const [k, f] of Object.entries(val)) { const xs = big.map(f).filter(v => v != null && isFinite(v)).sort((a, b) => a - b); rank[k] = v => { if (v == null || !isFinite(v) || !xs.length) return null; let lo = 0, hi = xs.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] <= v) lo = mid + 1; else hi = mid; } return lo / xs.length; }; }
  return big.map(r => { const parts = Object.keys(val).map(k => rank[k](val[k](r))).filter(v => v != null); const score = parts.length >= 3 ? Math.round(100 * parts.reduce((a, b) => a + b, 0) / parts.length) : null; return { r, score, sales: val.sales(r) }; }).filter(x => x.score != null).sort((a, b) => b.score - a.score);
}
async function nationalScorer(q) {
  const L = [app('#/national/scorer', 'US expansion · county scorer'), link(ROOT + 'redesigns/punctual-pros/nationwide.html', 'Nationwide plan'), app('#/pp/territory', 'Territory & expansion')];
  const fus = ['Which Texas counties score highest?', NEW_FOLLOW.cases, 'Show me how to take Punctual Pros nationwide'];
  let rows = null; try { const d = await Data.load('./national_counties'); rows = Array.isArray(d) ? d : d?.items; } catch { rows = null; }
  if (!rows?.length) return pending('Where Punctual Pros should expand nationally', 'The national scorer ranks every US county on home sales, building permits, housing age, climate and competition, so expansion follows demand rather than a map pin.', L, fus);
  const st = stateAny(q.replace(/\bpunctual pros\b/ig, ''));
  progress(`Scoring ${Fmt.num(rows.length)} counties on four signals`);
  const all = scoreCounties(rows); const pool = st ? all.filter(x => x.r.state === st) : all;
  const top = pool.slice(0, 10); const near = st ? [] : all.filter(x => NEAR.has(x.r.state)).slice(0, 3);
  const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
  const row = (x, i) => [i + 1, `<b>${esc(x.r.county_name)}</b>, ${esc(x.r.state)}`, `<b class="ch-num">${x.score}</b>`, `<span class="ch-num">${pct(x.r.pre1980_share)}</span>`, `<span class="ch-num">${pct(x.r.owner_occupied_share)}</span>`, x.r.permits_per_1k_hu_2025 != null ? `<span class="ch-num">${Fmt.num(x.r.permits_per_1k_hu_2025, 1)}</span>` : '—', x.sales != null ? `<span class="ch-num">${Fmt.num(x.sales, 1)}</span>` : '—', x.r.authority_brands_presence ? 'Yes' : '—'];
  const head = ['#', 'County', 'Score', 'Pre-1980', 'Owners', 'Permits /1k', 'Sales /1k', 'Brand nearby'];
  return {
    html: `<h4>${st ? `Top ${esc(ST_NAME[st] || st)} counties for Punctual Pros` : 'Where Punctual Pros expands first'} <span class="ch-badge ch-est">est.</span></h4><p>A simple default score ranks the ${n(all.length)} US counties with 100,000+ residents${st ? ` (${n(pool.length)} in ${esc(ST_NAME[st] || st)})` : ''} on four equal-weight signals, each as a percentile: <b>older housing</b> (share built before 1980, more replacement work), <b>owner share</b> (owners buy repairs and memberships), <b>permit momentum</b> (2025 permits per 1,000 homes) and <b>sales velocity</b> (home sales in the last 12 months per 1,000 homes, a new-mover feed).</p>${top.length ? tbl(head, top.map(row)) : `<p>No ${esc(ST_NAME[st] || st || '')} county with 100,000+ residents has enough data to score.</p>`}${near.length ? `<p><b>Closest to today's footprint:</b> ${near.map(x => `${esc(x.r.county_name)}, ${esc(x.r.state)} (${x.score})`).join(' · ')}. Expanding next door repeats the Horvath move: buy a local operator, then densify.</p>` : ''}<p>“Brand nearby” marks counties that already have an Authority Brands location (One Hour, Benjamin Franklin or Mister Sparky), where growth means buying or partnering rather than opening.</p><div class="ch-src">Source: ${cite('national_counties')} (Census ACS 2023 and population estimates, Census building permits, Redfin home sales, NOAA climate normals, County Business Patterns). Equal weights are an analyst default, not a forecast; the scorer page lets you reweight.</div>`,
    links: L, followups: st ? [NEW_FOLLOW.national, NEW_FOLLOW.cases] : fus,
  };
}
/* ── Answer-quality intents: company profiles, add-on history, size ranking, valuation, memberships, pricing,
      CET scopes, transfers and counties, law-firm and lab-account targeting (each reads its own dataset) ── */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** An ISO-style date (2024-04-03, 2025-02 or 2026) in words. */
const when = s => { const m = String(s ?? '').match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/); if (!m) return String(s ?? '—') || '—'; return m[3] ? `${MON[m[2] - 1]} ${+m[3]}, ${m[1]}` : m[2] ? `${MON[m[2] - 1]} ${m[1]}` : m[1]; };
const sectorOf = s => String(s || '').replace(/^(Business|Consumer)( Services)?\s*-\s*/i, '').replace(/\s*\((?:[^()]*)\)\s*$/, '').trim();
const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Llc|Llp|Lp|Pc|Pllc|Usa|Ii|Iii|Clia)\b/g, m => m.toUpperCase()).replace(/(?!^)\b(Of|And|The|For|At|In|On)\b/g, m => m.toLowerCase()).replace(/'S\b/g, "'s");
const share = v => v == null || v === '' || !isFinite(Number(v)) ? esc(String(v ?? '—')) : Number(v) <= 1 ? `${Math.round(Number(v) * 100)}%` : `${Number(v)}%`;
const CO_NAME_RX = 'punctual pros|cet|commonwealth(?: electrical)?(?: technologies)?|frontline(?: managed services)?|thomas scientific|bully pulpit(?: international)?|bpi|fair harbor';
const FIRM_ID = { pp: 'bsp-pp', cet: 'bsp-cet', fl: 'bsp-fl', ts: 'bsp-ts', bpi: 'bsp-bpi', fh: 'bsp-fh' };
const SLUG = { pp: 'punctual-pros', cet: 'cet', fl: 'frontline', ts: 'thomas-scientific', bpi: 'bpi', fh: 'fair-harbor' };
const FILINGS = { pp: 'pp_filings', cet: 'cet_filings', fl: 'frontline_filings', ts: 'thomas_filings', bpi: 'bpi_filings', fh: 'fairharbor_filings' };
const addOnName = a => /unidentified/i.test(a?.name || '') ? 'a second, undisclosed add-on' : String(a?.name || '');
/** The best current revenue and EBITDA rows from a company's filings estimate table. */
function sizeRows(est) {
  const score = (e, rx) => { const m = String(e.metric || ''); if (!rx.test(m)) return -1; let s = 1; if (/pro forma|current|run-?rate|2026|2025|fy2025|ltm/i.test(m)) s += 3; if (/pro forma/i.test(m)) s += 1; if (/2019|2020|2021|\bentry\b|covid|at acquisition|uk |per territory|federal|payroll/i.test(m) || (/horvath|horton|nuwave/i.test(m) && !/pro forma/i.test(m))) s -= 4; if (/total|net/i.test(m)) s += 1; return s; };
  const pick = rx => est.map(e => [score(e, rx), e]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0])[0]?.[1] || null;
  const rev = pick(/revenue/i), ebitda = pick(/ebitda/i);
  const both = rev && /ebitda/i.test(rev.metric) ? String(rev.estimate).split(/;\s*/) : null;   // "$65–100M revenue; $6–11M EBITDA"
  return { rev: rev ? (both ? both[0].replace(/\s*revenue\s*$/i, '') : rev.estimate) : null, revMetric: rev?.metric, ebitda: both?.[1] ? both[1].replace(/\s*EBITDA\s*$/i, '') : ebitda && /revenue;/i.test(ebitda.estimate) ? String(ebitda.estimate).split(/;\s*/).find(x => /ebitda/i.test(x))?.replace(/\s*EBITDA\s*$/i, '') || ebitda.estimate : ebitda?.estimate || null, conf: rev?.confidence || '' };
}
/** Midpoint in $M of a range like "~$22M (range $16-28M)" or "$250–320M", for ranking only. */
const midM = s => { const t = String(s || ''); const pt = t.match(/~\s*\$?([\d.]+)\s*M/i); if (pt) return +pt[1]; const r = t.match(/\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)\s*M/i); if (r) return (+r[1] + +r[2]) / 2; const one = t.match(/\$?([\d.]+)\s*M/i); return one ? +one[1] : 0; };

async function portfolio(q = '') {
  const d = await Data.research('bsp_firm'); const items = (d?.items || []).filter(i => i.status !== 'exited');
  const st = d?.firm?.stats || {}; const rundown = /rundown|summar|each|every|describe|one.?liner|overview of (all|the)|tell me about (all|the|every)/i.test(q);
  const co = id => Object.keys(FIRM_ID).find(k => FIRM_ID[k] === id);
  const body = rundown
    ? items.map(i => `<p><b>${esc(String(i.company).replace(/\s*\(.*\)$/, ''))}</b> <span class="ch-badge">since ${esc(when(i.entry_date))}</span><br>${esc(clip(i.description, 230))}${(i.add_ons || []).length ? ` <span style="color:var(--ch-mute)">Add-ons: ${esc(i.add_ons.map(addOnName).join(', '))}.</span>` : ''}</p>`).join('')
    : tbl(['Company', 'What it does', 'Owned since', 'Add-ons'], items.map(i => [`<b>${esc(String(i.company).replace(/\s*\(.*\)$/, ''))}</b>`, esc(clip(sectorOf(i.sector), 70)), esc(when(i.entry_date)), (i.add_ons || []).length ? `<span class="ch-num">${(i.add_ons || []).length}</span> <span style="color:var(--ch-mute)">${esc(i.add_ons.map(addOnName).filter(x => !/undisclosed/.test(x)).join(', '))}</span>` : '<span class="ch-num">0</span>']));
  const links = items.map(i => co(i.id)).filter(Boolean).slice(0, 3).map(k => app(`#/${k}/overview`, COS[k]));
  return { html: `<h4>BSP: the portfolio today</h4><p>${esc(String(d?.firm?.strategy || 'New York lower-middle-market private equity; control investments in essential business and consumer services.').split('. ').slice(0, 1).join('. ').replace(/\.?$/, '.'))}</p>${body}<p>${n(st.current_holdings || items.length)} companies held today, ${n(st.add_ons || 23)} add-ons closed across ${n(st.platforms || 7)} companies since the 2021 relaunch, and one exit: Smith + Howard, sold to TPG Growth in August 2026.</p><div class="ch-src">Source: ${cite('bsp_firm')} (BSP releases, SEC Form D and company sites).</div>`, links: [app('#/home/firm', 'Firm profile'), app('#/home/overview', 'Command Center'), ...links], followups: ['Which portfolio company is the largest by revenue?', 'Which add-ons has BSP closed so far?', 'What are the tech-enablement theses for every company?'] };
}
async function profile(q) {
  const co = coOf(q); if (!co) return portfolio(q);
  const [d, fil] = await Promise.all([Data.research('bsp_firm'), Data.research(FILINGS[co])]);
  const i = (d?.items || []).find(x => x.id === FIRM_ID[co]); if (!i) return null;
  const sz = sizeRows(fil?.meta?.estimate_table || []);
  const ons = (i.add_ons || []).map(a => `<li><b>${esc(addOnName(a))}</b>${a.date ? ` <span class="ch-badge">${esc(when(a.date))}</span>` : ''}${a.hq ? ` — ${esc(clip(a.hq, 70))}` : ''}</li>`).join('');
  return { html: `<h4>${esc(COS[co])} at a glance</h4><p>${esc(clip(i.description, 420)).replace(/;\s*$/, '.')}</p>${tbl(['Fact', 'Detail'], [['Sector', esc(sectorOf(i.sector))], ['Headquarters', esc(`${i.hq_city || ''}${i.state ? `, ${i.state}` : ''}`)], ['Owned since', esc(when(i.entry_date))], ['Leadership', esc(clip(i.ceo || '—', 90))], sz.rev ? ['Revenue', `<b>${esc(sz.rev)}</b> <span class="ch-badge ch-est">est.</span>`] : null, sz.ebitda ? ['EBITDA', `${esc(sz.ebitda)} <span class="ch-badge ch-est">est.</span>`] : null].filter(Boolean))}${i.thesis ? `<p><b>Why BSP owns it.</b> ${esc(clip(i.thesis, 300))}</p>` : ''}${ons ? `<h4>Add-ons so far</h4><ul>${ons}</ul>` : `<p>No add-ons yet; the growth plan sets out where the first one comes from.</p>`}<div class="ch-src">Sources: ${cite('bsp_firm')} and ${cite(FILINGS[co])}. Revenue and EBITDA are analyst estimates from public filings, not reported figures.</div>`,
    links: [app(`#/${co}/overview`, `${COS[co]} module`), link(ROOT + `redesigns/${SLUG[co]}/growth-plan.html`, 'Growth plan'), app(`#/${co}/filings`, 'Filings & estimates')], followups: [`What is the growth plan for ${NAMES[co]}?`, `Estimate ${NAMES[co]} revenue from public filings`, `Who competes with ${NAMES[co]}?`] };
}
async function sizes() {
  const ks = Object.keys(FILINGS); const fs = await Promise.all(ks.map(k => Data.research(FILINGS[k])));
  progress('Comparing revenue estimates across six companies');
  const rows = ks.map((k, i) => ({ k, ...sizeRows(fs[i]?.meta?.estimate_table || []) })).filter(r => r.rev).sort((a, b) => midM(b.rev) - midM(a.rev));
  const top = rows[0];
  return { html: `<h4>The portfolio ranked by revenue <span class="ch-badge ch-est">est.</span></h4><p>${top ? `<b>${esc(COS[top.k])}</b> is the largest at roughly ${esc(top.rev)} of revenue; ` : ''}${rows.length > 1 ? `<b>${esc(COS[rows.at(-1).k])}</b> is the smallest at ${esc(rows.at(-1).rev)}.` : ''} None of the companies reports publicly, so every figure below is an analyst estimate rebuilt from Form D raises, lender schedules, PPP loans and franchise disclosures.</p>${tbl(['Company', 'Revenue', 'EBITDA', 'Basis'], rows.map(r => [`<b>${esc(COS[r.k])}</b>`, `<span class="ch-num">${esc(r.rev)}</span>`, r.ebitda ? `<span class="ch-num">${esc(clip(r.ebitda, 40))}</span>` : '—', `<span style="color:var(--ch-mute)">${esc(clip(r.revMetric || '', 60))}</span>`]))}<div class="ch-src">Sources: ${ks.map(k => cite(FILINGS[k])).join(', ')}. Ranges are analyst estimates, not audited figures.</div>`, links: [app('#/fin/portfolio', 'Fundamentals'), app('#/fin/comps', 'Fundamentals · public comparables')], followups: ['Compare the portfolio to public comps', 'Estimate Thomas Scientific revenue from public filings', 'What multiple would a tuck-in trade at?'] };
}
const ADDON_NAMES = [['horvath', /horvath/i], ['nuwave', /nuwave/i], ['horton electrical', /horton(?!,? lee)/i], ['boldt', /boldt/i], ['seven hills', /seven hills/i], ['message house', /message house/i], ['propper daley', /propper/i], ['agado', /agado/i], ['365 sherpas', /sherpas/i], ['quintana', /quintana/i], ['day associates', /day associates/i], ['arrowhead', /arrowhead/i], ['north central', /north central|\bnci\b/i]];
async function addonHistory(q) {
  const [m, f] = await Promise.all([Data.research('bsp_methodology'), Data.research('bsp_firm')]);
  let deals = (m?.items || []).filter(i => i.kind === 'deal' && i.deal_type === 'add_on').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const named = deals.filter(x => { const c = String(x.company || '').toLowerCase(); return ADDON_NAMES.some(([w, rx]) => c.includes(w) && rx.test(q)); });
  const co = coOf(q.replace(/horton|nuwave|horvath/ig, '')) || (named[0] ? Object.keys(COS).find(k => new RegExp(NAMES[k].split(' ')[0], 'i').test(named[0].platform)) : null);
  const st = f?.firm?.stats || {};
  if (named.length) {
    return { html: `<h4>${named.length === 1 ? `What ${esc(named[0].company)} added` : `What ${named.map(x => esc(x.company)).join(' and ')} added`}</h4>${named.map(x => `<p><b>${esc(x.company)}</b> <span class="ch-badge">${esc(when(x.date))}</span> · add-on to ${esc(String(x.platform || '').replace(/^Commonwealth Electrical Technologies$/, 'CET'))}<br>${esc(clip(x.sector || '', 90))}${x.hq ? `, ${esc(clip(x.hq, 60))}` : ''}. ${esc(clip(x.structure_notes || '', 260))}${x.seller ? ` Seller: ${esc(clip(x.seller, 110))}.` : ''}${x.size_signals ? ` <span style="color:var(--ch-mute)">${esc(clip(x.size_signals, 160))}</span>` : ''}</p>${x.rationale_quoted ? `<p style="color:var(--ch-fg2)">${esc(clip(x.rationale_quoted, 240))}</p>` : ''}`).join('')}<div class="ch-src">Source: ${cite('bsp_methodology')} (BSP, company and adviser press releases).</div>`,
      links: [app('#/bsp/deals', 'Every BSP deal'), co ? app(`#/${co}/overview`, `${COS[co]} module`) : app('#/home/firm', 'Firm profile')], followups: [co ? `What is the growth plan for ${NAMES[co]}?` : 'How does BSP actually buy companies?', co ? `Top add-on targets for ${NAMES[co]}` : 'Which add-ons has BSP closed so far?', 'How does BSP actually buy companies?'] };
  }
  if (co) deals = deals.filter(x => new RegExp(NAMES[co].split(' ')[0], 'i').test(x.platform || ''));
  progress(`Lining up ${deals.length} disclosed add-ons`);
  const byCo = {}; for (const x of (m?.items || []).filter(i => i.kind === 'deal' && i.deal_type === 'add_on')) byCo[x.platform] = (byCo[x.platform] || 0) + 1;
  return { html: `<h4>${co ? `${esc(COS_S[co])}: add-ons so far` : 'Every add-on BSP has closed'}</h4><p>${co ? `${n(deals.length)} disclosed add-on${deals.length === 1 ? '' : 's'}.` : `${n(st.add_ons || 23)} add-ons across ${n(st.platforms || 7)} companies since the 2021 relaunch; ${n(deals.length)} are disclosed by name (${Object.entries(byCo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k.replace(/^Commonwealth Electrical Technologies$/, 'CET'))} ${v}`).join(', ')}).`} The first add-on typically lands six to nine months after BSP buys the company.</p>${deals.length ? tbl(['Closed', 'Add-on', 'Added to', 'What it brought'], deals.slice(-12).reverse().map(x => [`<span class="ch-num" style="white-space:nowrap">${esc(when(x.date))}</span>`, `<b>${esc(x.company)}</b>`, esc(String(x.platform || '').replace(/^Commonwealth Electrical Technologies$/, 'CET')), esc(clip(x.structure_notes || x.sector || '', 110))])) : `<p>No add-on has closed yet.</p>`}<div class="ch-src">Sources: ${cite('bsp_methodology')} and ${cite('bsp_firm')}.</div>`,
    links: [app('#/bsp/deals', 'Every BSP deal'), app('#/ma/pipeline', 'Add-on pipeline')], followups: ['How does BSP actually buy companies?', 'What did the Horvath acquisition add to Punctual Pros?', 'What do NuWave and Horton add to CET?'] };
}
/** Underwriting questions ("what can we pay and still earn 20%?") run the acquisition model itself. */
async function dealModel(q) {
  const [d, L] = await Promise.all([Data.research('deal_model'), import(ROOT + 'modules/deal-lib.js?v=20261009192122').catch(() => null)]);
  if (!d || !L) return null;
  const pre = (d.items || []).filter(i => i.kind === 'preset'); const co = coOf(q);
  const P = pre.find(i => i.co === co && i.group !== 'generic') || pre.find(i => i.id === 'typical') || pre[0]; if (!P) return null;
  const v = { ...d.meta.base, ...P.inputs }, hurdle = (d.meta.hurdle?.irr_pct || 20) / 100;
  const R = L.lbo(v), max = L.solveEntry(v, hurdle);
  const pct = x => x == null ? 'n/m' : `${(x * 100).toFixed(1)}%`, mult = x => x == null ? 'n/m' : `${x.toFixed(1)}x`;
  const est = P.co ? ' <span class="sys-est">est.</span>' : '';
  const hash = `#/deal/returns?p=${encodeURIComponent(P.id)}`;
  return { html: `<h4>What to pay for ${P.co ? esc(COS_S[P.co] || P.label) : 'a typical tuck-in'}</h4><p>${P.co ? `Using public-filing estimates for ${esc(COS_S[P.co] || P.label)}` : 'For a typical lower-middle-market deal'} ($${n(v.rev, 0)}M revenue, ${n(v.mg, 0)}% EBITDA margin${est}), buying at <b>${mult(v.em)}</b> EBITDA and selling at <b>${mult(v.xm)}</b> after ${n(v.yrs, 0)} years returns <b>${pct(R.irr)} a year</b> (${R.moic == null ? 'n/m' : R.moic.toFixed(2) + 'x'} the money).</p><p>The most a buyer can pay and still earn <b>${Math.round(hurdle * 100)}% a year</b> is about <b>${mult(max)} EBITDA</b>, all else equal.</p><p>The acquisition model lets you change any assumption, see the DCF and roll-up views, and download a live Excel file.</p>`,
    links: [app(hash, 'Open the acquisition model'), app('#/deal/sensitivity', 'Sensitivity tables'), app('#/ma/valuation', 'Valuation benchmarks')],
    followups: ['What are typical EBITDA multiples in the lower middle market?', 'Show the top add-on targets for Punctual Pros', 'How does Broad Sky buy companies?'] };
}
async function valuation(q) {
  const d = await Data.research('serviceos_evidence'); if (!d) return comps(q);
  const ms = d.meta?.multiple_premium_summary || {}; const co = coOf(q);
  const ve = (d.items || []).filter(i => i.kind === 'valuation_evidence' && /\bx\b/.test(String(i.metric_unit || '')) && i.metric_value != null && i.metric_value < 40).filter(i => !co || (i.applies_to || []).includes(co)).sort((a, b) => b.metric_value - a.metric_value);
  const bp = Object.entries(ms.by_platform || {}).filter(([k]) => !co || k === co);
  const tuck = /tuck|add-?on|small|bolt/i.test(q);
  return { html: `<h4>${tuck ? 'Tuck-in multiples and combined value' : 'What the multiples evidence says'}</h4>${tuck ? `<p>Small, project-heavy owner-operated shops trade at the low end: about <b>5–6x EBITDA</b> for HVAC firms with low retention, against <b>10x and up</b> for repeatable-service businesses with visible earnings, and private MSP deals rise from about 5x under $5M of deal size to 11x at scale. Buying at the low band and selling the combined company at the high band is the arbitrage every add-on plan rests on.</p>` : ''}<p>${esc(clip(ms.headline || '', 360))}</p>${ve.length ? tbl(['Evidence', 'Multiple', 'Applies to'], ve.slice(0, 8).map(i => [esc(clip(i.title, 90)), `<b class="ch-num">${esc(i.metric_value)}x</b>`, esc((i.applies_to || []).map(k => NAMES[k] || k).join(', '))])) : ''}${bp.length ? `<h4>Premium tech enablement can claim <span class="ch-badge ch-est">est.</span></h4>${tbl(['Company', 'Extra turns of EBITDA', 'Strength of evidence'], bp.map(([k, v]) => [`<b>${esc(COS[k] || k)}</b>`, Array.isArray(v.range_turns) ? `<span class="ch-num">${v.range_turns[0]}–${v.range_turns[1]}</span>` : '—', esc(clip(v.strength || '', 60))]))}` : ''}<div class="ch-src">Source: ${cite('serviceos_evidence')} (banker surveys, press-reported deal multiples, public filings). Multiples are press or banker estimates.</div>`,
    links: [app('#/ma/valuation', 'Valuation benchmarks'), app('#/fin/comps', 'Fundamentals · public comparables'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS')], followups: ['Compare the portfolio to public comps', 'What is ServiceOS and why does it raise valuation?', 'Show the top add-on targets for Punctual Pros'] };
}
async function membership() {
  const [nw, so, v] = await Promise.all([Data.research('pp_nationwide'), Data.research('serviceos_evidence'), Data.research('voice_ai')]);
  const lev = (nw?.items || []).find(i => i.kind === 'growth_lever' && /member/i.test(i.lever || ''));
  const kpi = (so?.items || []).filter(i => i.kind === 'kpi_benchmark' && /member/i.test(i.kpi || ''));
  const ev = (so?.items || []).filter(i => i.kind === 'valuation_evidence' && /member/i.test(`${i.title} ${i.claim}`)).slice(0, 3);
  const road = (nw?.meta?.kpi_roadmap || []).filter(r => r.members != null); const vm = v?.meta?.pp_revenue_model || {};
  return { html: `<h4>Comfort Club memberships: the recurring-revenue lever</h4>${lev ? `<p class="ch-num">Members: ${n(lev.baseline)} today → ${n(lev.target)} target <span class="ch-badge ch-est">est.</span></p><p>${esc(clip(lev.evidence || '', 420))}</p>` : ''}${road.length ? `<h4>Members on the 36-month roadmap <span class="ch-badge">analyst assumptions</span></h4>${tbl(['Month', 'Members', 'Technicians'], road.map(r => [r.month, r.members, r.technicians ?? '—']))}` : ''}${kpi.length ? `<h4>Benchmarks</h4><ul>${kpi.map(k => `<li><b>${esc(k.kpi)}</b>: target ${esc(k.target)} ${esc(k.unit || '')}${k.baseline_basis ? ` <span style="color:var(--ch-mute)">(${esc(clip(k.baseline_basis, 110))})</span>` : ''}</li>`).join('')}</ul>` : ''}${ev.length ? `<h4>Why buyers pay for it</h4><ul>${ev.map(e => `<li>${esc(clip(e.claim || e.title, 220))}</li>`).join('')}</ul>` : ''}${vm.outbound_renewal_uplift_usd ? `<p>Renewals are also the first outbound job for voice AI: about ${money(vm.outbound_renewal_uplift_usd)} a year of renewal and maintenance revenue <span class="ch-badge ch-est">est.</span>.</p>` : ''}<div class="ch-src">Sources: ${cite('pp_nationwide')}, ${cite('serviceos_evidence')} and ${cite('voice_ai')}. The member baseline is an analyst assumption; Punctual Pros does not disclose it.</div>`,
    links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html', 'Nationwide plan'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS')], followups: ['How should Punctual Pros change its pricing?', 'How much does voice AI recover for Punctual Pros?', 'Show me how to take Punctual Pros nationwide'] };
}
async function pricing(q) {
  const co = coOf(q); if (co && co !== 'pp') return companyPlaybook(q);
  const [nw, so] = await Promise.all([Data.research('pp_nationwide'), Data.research('serviceos_evidence')]);
  const lv = (nw?.items || []).filter(i => i.kind === 'growth_lever' && /pric|financ|territory productivity|attach/i.test(i.lever || ''));
  const kpi = (so?.items || []).filter(i => i.kind === 'kpi_benchmark' && (i.company === 'pp') && /ticket|pric/i.test(i.kpi || ''));
  const ev = (so?.items || []).filter(i => i.kind === 'valuation_evidence' && /pricebook|price ?book/i.test(`${i.title}`));
  return { html: `<h4>What moves the average ticket</h4><p>The plan does not raise list prices across the board. It moves every task to a flat-rate digital price book with good, better and best options, presents financing on every replacement quote, and routes high-ticket calls to the best closers.</p>${lv.length ? tbl(['Lever', 'Baseline → target', 'Evidence'], lv.map(l => [`<b>${esc(l.lever)}</b>`, l.baseline != null || l.target != null ? `<span class="ch-num">${esc(bt(l.baseline))} → ${esc(bt(l.target))}</span> <span style="color:var(--ch-mute)">${esc(clip(l.unit || '', 50))}</span>` : '—', esc(clip(l.evidence || '', 150))])) : ''}${kpi.length ? `<ul>${kpi.map(k => `<li><b>${esc(k.kpi)}</b>: ${esc(k.baseline ?? '—')} → ${esc(k.target)} ${esc(k.unit || '')} <span class="ch-badge ch-est">est.</span></li>`).join('')}</ul>` : ''}${ev.length ? `<p>${ev.map(e => esc(clip(e.claim || e.title, 200))).join(' ')}</p>` : ''}<div class="ch-src">Sources: ${cite('pp_nationwide')} and ${cite('serviceos_evidence')} (ServiceTitan, Synchrony and franchise disclosure data).</div>`,
    links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html', 'Nationwide plan'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS')], followups: ['How big is the Comfort Club opportunity?', 'What does ServiceOS do for Punctual Pros?', 'Show me how to take Punctual Pros nationwide'] };
}
const CET_TOPICS = [['solar', /solar|\bpv\b|photovoltaic/i], ['EV charging', /\bev\b|charg|nevi/i], ['battery storage', /battery|storage|bess/i], ['generators', /generator|standby/i], ['efficiency', /efficien|\bled\b|retrofit|mass save|lighting/i], ['microgrids', /microgrid/i], ['switchgear', /switchgear|substation|medium.?voltage/i], ['wastewater', /wastewater|wwtp|pump station|sewer/i]];
const OPP_TYPE = { rfp: 'Bid', capital_plan: 'Capital plan', award: 'Federal award', program: 'Program', project: 'Project' };
async function cetScope(q) {
  const d = await Data.research('cet_opportunities'); if (!d) return null;
  const topics = CET_TOPICS.filter(([, rx]) => rx.test(q)); const rxs = topics.length ? topics.map(t => t[1]) : [CET_TOPICS[0][1], CET_TOPICS[1][1], CET_TOPICS[2][1]];
  const hay = i => `${i.title} ${(i.scope_tags || []).join(' ')} ${(i.capability_match || []).join?.(' ') || i.capability_match || ''}`;
  const its = (d.items || []).filter(i => rxs.some(rx => rx.test(hay(i))));
  progress(`Filtering ${(d.items || []).length} New England opportunities by scope`);
  const open = i => { const k = Fmt.days(i.due_date); return k != null && k >= 0; };
  const sorted = its.slice().sort((a, b) => (open(b) - open(a)) || ((b.fit_score || 0) - (a.fit_score || 0)));
  const val = its.reduce((s, i) => s + (i.est_value_usd || 0), 0);
  const label = topics.length ? topics.map(t => t[0]).join(' and ') : 'solar, EV charging and storage';
  return { html: `<h4>CET ${esc(label)} work</h4><p>${n(its.length)} tracked opportunities match${val ? `, about ${money(val)} of disclosed value` : ''}; ${n(its.filter(open).length)} have an open bid date.</p>${sorted.length ? tbl(['Opportunity', 'Owner', 'Kind', 'Value', 'Due'], sorted.slice(0, 10).map(i => [`<b>${esc(clip(i.title, 90))}</b> <span class="ch-badge">${esc(i.state || '')}</span>`, esc(clip(i.owner_or_agency || '', 50)), esc(OPP_TYPE[i.type] || 'Opportunity'), i.est_value_usd ? money(i.est_value_usd) : '—', i.due_date ? esc(when(i.due_date)) : '—'])) : '<p>No tracked opportunity matches that scope yet.</p>'}${sorted[0]?.fit_rationale ? `<p><b>Best fit:</b> ${esc(clip(sorted[0].fit_rationale, 240))}</p>` : ''}<div class="ch-src">Source: ${cite('cet_opportunities')} (state procurement portals, capital plans, program pages and federal award data). New England only.</div>`,
    links: [app('#/cet/opportunities', 'Opportunity radar')], followups: ['Which CET bids are due within 30 days?', 'Which wastewater plants should Horton call first?', 'What is the growth plan for CET?'] };
}
async function cetTransfers(q) {
  const st = stateOf(q); const files = st === 'MA' ? ['sales/cet_transfers_ma'] : st === 'CT' || st === 'RI' ? ['sales/cet_transfers_ct_ri'] : ['sales/cet_transfers_ma', 'sales/cet_transfers_ct_ri'];
  const sets = await Promise.all(files.map(f => Data.load(f).catch(() => null)));
  let rows = sets.filter(Boolean).flatMap(s => s.items || s).filter(r => /commercial|industrial|mixed/.test(r.use_type || '') && (r.price || 0) >= 250000);
  if (st) rows = rows.filter(r => r.state === st);
  progress(`Scanning ${Fmt.num(rows.length)} commercial and industrial sales`);
  const age = r => Fmt.days(r.sale_date); const d365 = rows.filter(r => { const k = age(r); return k != null && k >= -365; });
  const latest = rows.reduce((m, r) => String(r.sale_date || '') > m ? String(r.sale_date) : m, ''); const lag = Fmt.days(latest) ?? 0; const d90 = d365.filter(r => age(r) >= lag - 90);
  const byCounty = {}; for (const r of d365) byCounty[`${r.county}, ${r.state}`] = (byCounty[`${r.county}, ${r.state}`] || 0) + 1;
  const big = d365.filter(r => age(r) >= lag - 180).sort((a, b) => b.price - a.price).slice(0, 8);
  const use = u => ({ commercial: 'Commercial', industrial: 'Industrial', mixed: 'Mixed use' })[u] || 'Other';
  return { html: `<h4>Commercial property sales${st ? ` in ${esc(ST_NAME[st] || st)}` : ', CET territory'}</h4><p>${n(d365.length)} sales of $250K or more in the last 12 months, ${n(d90.length)} of them in the 90 days up to the latest recorded sale (${esc(when(latest))}; assessor rolls post sales with a lag). A new owner usually re-scopes electrical service, lighting, EV charging and backup power within the first year, so each sale is a warm lead for CET and NuWave.</p>${big.length ? `<h4>Largest recent sales</h4>${tbl(['Sold', 'Property', 'County', 'Use', 'Price'], big.map(r => [esc(when(r.sale_date)), `<b>${esc(titleCase(r.addr || ''))}</b>${r.muni ? `, ${esc(r.muni)}` : ''}`, esc(`${r.county || ''}, ${r.state || ''}`), esc(use(r.use_type)), money(r.price)]))}` : ''}${Object.keys(byCounty).length ? `<p><b>Busiest counties:</b> ${Object.entries(byCounty).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, k]) => `${esc(c)} ${n(k)}`).join(' · ')}.</p>` : ''}<div class="ch-src">Sources: ${files.map(f => cite(srcKey(f))).join(' and ')} (state assessor parcel rolls; each parcel carries its last sale only).</div>`,
    links: [app('#/cet/transfers', 'Property transfers')], followups: ['Which New England counties are best for CET?', 'What solar and EV work can CET bid on?', 'Which CET bids are due within 30 days?'] };
}
async function cetCounties(q) {
  const rows = await Data.load('cet_ne_counties').catch(() => null); if (!rows?.length) return null;
  const st = stateOf(q); const pool = rows.filter(r => !st || r.state === st).slice().sort((a, b) => (b.cet_fit_score || 0) - (a.cet_fit_score || 0));
  progress(`Ranking ${rows.length} New England counties`);
  return { html: `<h4>Top CET counties${st ? ` in ${esc(ST_NAME[st] || st)}` : ''}</h4><p>The county score blends commercial and healthcare establishment density, manufacturing footprint, permit activity, data-center and EV-charging build-out. ${pool[0] ? `<b>${esc(pool[0].county_name)}, ${esc(pool[0].state)}</b> leads at ${n(pool[0].cet_fit_score, 1)}.` : ''}</p>${tbl(['#', 'County', 'Fit score', 'Tier', 'What drives it'], pool.slice(0, 10).map((r, i) => [i + 1, `<b>${esc(r.county_name)}</b>, ${esc(r.state)}`, `<span class="ch-num">${Fmt.num(r.cet_fit_score, 1)}</span>`, esc(r.cet_fit_tier || '—'), esc(clip((r.fit_drivers || []).slice(0, 2).join('; '), 90))]))}<p>CET grows across New England from its Worcester, Taunton and Norwell base and Horton's Connecticut footprint.</p><div class="ch-src">Source: ${cite('cet_ne_counties')} (Census County Business Patterns, building permits, EV-charging and data-center indicators).</div>`,
    links: [app('#/cet/overview', 'CET module'), app('#/cet/opportunities', 'Opportunity radar')], followups: ['Show CET add-on targets in Massachusetts', 'What solar and EV work can CET bid on?', 'How does BSP scale CET across the Northeast?'] };
}
async function lawFirms(q) {
  if (/mid-?size|midsize|smaller|cyber|breach|incident|ransom|merg|cio/i.test(q)) {
    const d = await Data.research('fl_midsize_firms'); const it = (d?.items || []).slice().sort((a, b) => (a.fit_rank || 999) - (b.fit_rank || 999));
    const want = /cyber|breach|incident|ransom|hack/i.test(q) ? /cyber|breach|incident|ransom|hack/i : /merg|combin|cio|chief information|expan/i.test(q) ? /merg|combin|cio|chief information|expan/i : null;
    const sig = i => (i.signals || []).filter(s => !want || want.test(`${s.type} ${s.note}`)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const hits = want ? it.filter(i => sig(i)) : []; const list = [...hits, ...it.filter(i => !hits.includes(i))].slice(0, 10);
    progress(`Screening ${it.length} mid-size firms`);
    return { html: `<h4>Mid-size law firms${want ? `: ${/cyber|breach/i.test(q) ? 'cyber incidents' : 'trigger events'}` : ''}</h4><p>${n(it.length)} mid-size firms screened for fit. ${want ? `${n(hits.length)} ${hits.length === 1 ? 'carries' : 'carry'} a matching public signal${hits.length ? ` and ${hits.length === 1 ? 'leads' : 'lead'} the list;` + ' the rest are the best-fit firms to watch' : ', so the list below shows the best-fit firms to watch'}.` : ''}</p>${tbl(['Firm', 'Metro', 'Attorneys', 'Fit', 'Latest signal'], list.map(i => { const s = sig(i) || (i.signals || [])[0]; return [`<b>${esc(i.firm_name)}</b>`, esc(i.metro || ''), i.attorney_count ?? '—', `<span class="ch-num">${esc(i.frontline_fit_score ?? '—')}</span>`, s ? `${esc(when(s.date))}: ${esc(clip(s.note || '', 110))}` : '—']; }))}<div class="ch-src">Source: ${cite('fl_midsize_firms')} (firm sites, legal press and breach notices).</div>`,
      links: [app('#/fl/midsize', 'Mid-size firm targets'), app('#/fl/amlaw', 'AM Law 200 targets')], followups: ['Which AM Law 200 firms should Frontline call first?', 'What is the growth plan for Frontline?', 'Which AI agents help Frontline most?'] };
  }
  const rows = await Data.load('fl_lawfirms').catch(() => null); if (!rows?.length) return null;
  const pool = rows.filter(r => !r.current_frontline_client).sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));
  progress(`Ranking ${rows.length} AM Law firms`);
  const ai = s => ({ planning: 'Planning', piloting: 'Piloting', deployed: 'Deployed', none: 'None' })[s] || (s ? String(s).replace(/_/g, ' ') : '—');
  return { html: `<h4>First AM Law 200 calls</h4><p>${n(rows.length)} firms scored on size, practice mix, cyber urgency and AI readiness${rows.some(r => r.current_frontline_client) ? `; ${n(rows.filter(r => r.current_frontline_client).length)} current clients are left out` : ''}. The list below is ranked by that score.</p>${tbl(['Firm', 'AM Law rank', 'Lawyers', 'Revenue', 'Cyber urgency', 'AI', 'Why'], pool.slice(0, 10).map(r => [`<b>${esc(r.firm_name)}</b>`, `<span class="ch-num">${esc(r.amlaw_rank ?? '—')}</span>`, r.attorney_count ?? '—', r.revenue_m ? money(r.revenue_m * 1e6) : '—', `<span class="ch-num">${esc(r.cyber_urgency_score ?? '—')}/5</span>`, esc(ai(r.ai_opportunity_signal)), esc(clip(r.priority_notes || '', 80))]))}<div class="ch-src">Source: ${cite('fl_lawfirms')} (AM Law rankings, firm sites and legal press).</div>`,
    links: [app('#/fl/amlaw', 'AM Law 200 targets'), app('#/fl/midsize', 'Mid-size firm targets')], followups: ['Which mid-size law firms had a cyber incident recently?', 'What is the growth plan for Frontline?', 'Show add-on targets for Frontline'] };
}
async function tsAccounts(q) {
  const sitesQ = /how many|cover|footprint|lab sites?|\bsites\b|universe/i.test(q) && !/parent|account/i.test(q);
  const parents = await Data.load('ts_parents').catch(() => []);
  const label = p => p.commercial_priority_label_v3c || '—';
  if (sitesQ) {
    const s = await Data.load('ts_sites').catch(() => null); const rows = Array.isArray(s) ? s : s?.items || [];
    progress(`Counting ${Fmt.num(rows.length)} lab and clinical sites`);
    const by = k => { const o = {}; for (const r of rows) if (r[k]) o[r[k]] = (o[r[k]] || 0) + 1; return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const vert = by('vertical'), states = by('state').slice(0, 6), pur = by('commercial_priority_label_v3c');
    return { html: `<h4>Thomas Scientific's addressable lab universe</h4><p>${n(rows.length)} lab and clinical sites from public registries (CLIA, CMS and hospital data), rolled up into ${n(parents.length)} parent accounts.</p>${tbl(['Site type', 'Sites'], vert.map(([k, v]) => [esc(k), v]))}<p><b>Largest states:</b> ${states.map(([k, v]) => `${esc(ST_NAME[k] || ({ PR: 'Puerto Rico', DC: 'District of Columbia' })[k] || k)} ${n(v)}`).join(' · ')}.${pur.length ? ` <b>Commercial priority:</b> ${pur.map(([k, v]) => `${esc(k)} ${n(v)}`).join(' · ')}.` : ''}</p><div class="ch-src">Sources: ${cite('ts_sites')} and ${cite('ts_parents')}.</div>`,
      links: [app('#/ts/sites', 'Site explorer'), app('#/ts/accounts', 'Parent accounts')], followups: ['Which parent accounts should Thomas Scientific prioritize?', 'What is the growth plan for Thomas Scientific?', 'Show add-on targets for Thomas Scientific'] };
  }
  const pool = parents.slice().sort((a, b) => ((b.commercial_score_v3c || 0) - (a.commercial_score_v3c || 0)) || ((b.sites || 0) - (a.sites || 0)));
  progress(`Ranking ${parents.length} parent accounts`);
  return { html: `<h4>Thomas Scientific parent accounts to prioritize</h4><p>${n(parents.length)} parent organizations rolled up from public lab registries, ranked by commercial score: lab volume, Medicare billing, hospital scale and multi-state reach. Multi-site parents come first within a score band because one contract covers every site.</p>${tbl(['Parent account', 'Type', 'Sites', 'States', 'Score', 'Tier'], pool.slice(0, 10).map(p => [`<b>${esc(titleCase(p.parent))}</b>`, esc(p.vert || '—'), p.sites ?? '—', (p.states || []).length, `<span class="ch-num">${esc(p.commercial_score_v3c ?? p.score ?? '—')}</span>`, `<span class="ch-badge">Tier ${esc(p.commercial_tier_v3c ?? p.tier ?? '—')}</span>`]))}<div class="ch-src">Source: ${cite('ts_parents')} (CLIA, CMS, NPPES and hospital registries).</div>`,
    links: [app('#/ts/accounts', 'Parent accounts'), app('#/ts/sites', 'Site explorer')], followups: ['How many lab sites does Thomas Scientific cover?', 'What is the growth plan for Thomas Scientific?', 'Show add-on targets for Thomas Scientific'] };
}
const NE_ST = new Set(['MA', 'CT', 'RI', 'NH', 'VT', 'ME']);
const PROFILE_RX = new RegExp(`^(?:what (?:does|do) (?:the company )?(?:${CO_NAME_RX})(?: actually| really)? do|who (?:is|are) (?:${CO_NAME_RX})|tell me (?:more )?about (?:${CO_NAME_RX})|(?:give me )?(?:an? )?(?:quick )?(?:overview|profile|snapshot|primer) (?:of|on) (?:${CO_NAME_RX})|describe (?:${CO_NAME_RX})|what is (?:${CO_NAME_RX})\\s*\\??$|(?:${CO_NAME_RX}) (?:at a glance|overview|profile)\\s*\\??$)`, 'i');
const PORTAL_INTENTS = [
  { id: 'profile', rx: [PROFILE_RX], run: profile },
  { id: 'addon_history', rx: [/(horvath|nuwave|horton(?!,? lee)|boldt|seven hills|message house|propper daley|agado|sherpas|quintana|day associates|arrowhead|north central)\b.*\b(add|adds|added|bring|brings|brought|acqui|deal|buy|bought|close|closed)|\b(what|why) (did|does|do) .*(horvath|nuwave|horton(?!,? lee))\b(?!.*\bcall)|(add-?ons?|acquisitions?) (has|have|did) (broad sky|bsp|they|we|\w+(?: \w+)?) (closed|done|made|completed)|how many (add-?ons|acquisitions)|add-?on (history|track record)|add-?ons? (so far|to date)/i], run: addonHistory },
  { id: 'sizes', rx: [/(largest|biggest|smallest) (portfolio )?compan(y|ies)|(largest|biggest|smallest) .*by (revenue|size|ebitda)|(rank|ranked|ranking|sort) .*(compan(y|ies)|portfolio) by (revenue|size|ebitda)|(portfolio|companies) by (revenue|size|ebitda)|which (portfolio )?company (is|has) the (most|highest|largest|biggest) (revenue|sales|ebitda)/i], run: sizes },
  { id: 'model', rx: [/\b(irr|moic|lbo|dcf|discounted cash flow|underwrit\w*|acquisition model|returns? model|buyout model|sensitivity tables?)\b|how much (could|can|should|would) (we|bsp|broad sky|a buyer|you) pay(?! (a |our |the )?(tech|staff|employee|worker|people|install))|what (could|can|should|would) (we|bsp|broad sky|a buyer) pay|(still|and) (earn|make|get|hit) (a )?\d+ ?%/i], run: dealModel },
  { id: 'valuation', rx: [/\bmultiples?\b|trades? at\b|turns? of ebitda|ev ?\/ ?ebitda|exit multiple|worth at exit/i], run: valuation },
  { id: 'cet_counties', rx: [/\bcount(y|ies)\b.*(\bcet\b|commonwealth|new england|electrical)|(\bcet\b|commonwealth|new england).*\bcount(y|ies)\b/i], run: cetCounties },
  { id: 'transfers', rx: [/changed hands|property transfers?|(commercial|industrial) (buildings?|propert(y|ies)|real estate|sales)|buildings? (sold|that sold|changed)/i], run: cetTransfers },
  { id: 'cet_scope', rx: [/(solar|\bev\b|charging|battery|storage|generators?|efficiency|microgrids?|switchgear).*(\bcet\b|commonwealth|bid|work|opportunit|rfps?|projects?|pipeline)|(\bcet\b|commonwealth).*(solar|\bev\b|charging|battery|storage|generators?|microgrids?)/i], run: cetScope },
  { id: 'lawfirms', rx: [{ test: s => !/add-?on|tuck-?in|acqui/i.test(s) && /am ?law|law firms?|mid-?size firms?|midsize firms?/i.test(s) }], run: lawFirms },
  { id: 'ts_accounts', rx: [{ test: s => !/add-?on|tuck-?in|acqui|revenue|growth plan|ebitda/i.test(s) && /(parent )?accounts?\b.*(thomas|\bts\b|\blabs?\b)|(thomas|\blab\b).*(accounts?|lab sites?|\bsites\b|customers?)|lab sites?/i.test(s) }], run: tsAccounts },
  { id: 'cases', rx: [/value.?creation cases?|case stud(y|ies)|(sponsors?|pe firms?|private equity|other firms|buyers?|owners?).*(did|do|built|build|grew|grow|sold|sell|selling|exit)|before (selling|they sold|the sale|exit(ing)?)|companies like punctual pros|how (did|do) (sponsors|others|other firms|rivals) (build|grow|sell)|how long .*(hold|own|keep)|hold(ing)? (period|length|years)|median hold/i], run: valueCases },
  { id: 'buys', rx: [/how (does|do|did) (broad sky|bsp|they) (actually |really )?(buy|acquire|source|pick|choose|select|find|invest)|how broad sky buys|broad sky'?s? (deal|acquisition|investment|buying) (patterns?|process|criteria|rubric|method(ology)?|approach)|deal (patterns|rubric)|investment criteria|acquisition (methodology|rubric|criteria)|sourcing (network|channels?)|bankers?|advis[eo]rs? .*(deal|broad sky|bring)|intermediar|who (brings|sources|introduces) .*deals|where .*deals come from/i], run: bspBuys },
  { id: 'national', rx: [{ test: s => /\bcount(y|ies)\b/i.test(s) && !/new.?mover|leads?\b|home sales|deed|\bcet\b|new england/i.test(s) && !NE_ST.has(stateAny(s.replace(/\bpunctual pros\b/ig, '')) || 'NE') && !!stateAny(s.replace(/\bpunctual pros\b/ig, '')) }, /(count(y|ies)|metros?|markets?).*(nationwide|national(ly)?|across the (us|country)|in the (us|country)|national scor)|(nationwide|national|us) (count(y|ies)|scorer)|county scor(e|es|ing)|national (scor(e|er|ing)|expansion score)/i], run: nationalScorer },
  { id: 'voice', rx: [/voice|phone agent|call answering|answer(ing)? (the )?phone|24.?7|after.?hours|missed call|receptionist|dispatcher/i], run: voiceAI },
  { id: 'membership', rx: [/comfort club|memberships?\b|\bmembers\b|recurring revenue/i], run: membership },
  { id: 'pricing', rx: [/\bpric(e|es|ing)\b|price ?book|average ticket|ticket size/i], run: pricing },
  { id: 'playbook', rx: [/(playbook|growth plan|value.?creation|how (do|would|should|does) (we|broad sky|bsp) (grow|build|scale|expand|take)|take .* (regional|national|northeast|international|further)|roll.?up plan).*(cet|commonwealth|horton|frontline|thomas|lab|bully|bpi|fair harbor)/i, { test: s => /(cet|commonwealth|frontline|thomas scientific|bully pulpit|bpi|fair harbor).*(playbook|growth plan|\bplan\b|expand|grow|scale|\bnational|international|next phase)/i.test(String(s).replace(/bully pulpit international/ig, 'bully pulpit')) }], run: companyPlaybook },
  { id: 'ai_agents', rx: [/ai agents?|agentic|automation(s)? (for|across)|which agents/i], run: aiAgents },
  { id: 'ads', rx: [/\bads?\b|advertis|ctv|connected.?tv|tv commercials?|commercials\b|media plan|marketing (plan|spend|budget)|campaign/i], run: adsProgram },
  { id: 'nationwide_sub', rx: [/(which|what) (ai )?agents? pay|agents? .*(payback|fastest|first)|which (counties|markets|cities) (come )?first|help(ing)? the (pros|technicians|contractors)|programs? .*(technician|pros)|smith \+? ?howard|how does smith/i], run: nationwideSub },
  { id: 'expansion', rx: [/(nationwide|national|expand|scale|grow|take .* (further|beyond)|roll-?up).*(punctual|pros|hvac|home service)|(punctual|pros).*(nationwide|national|expand|scale)/i], run: expansionPlan },
  { id: 'weather', rx: [/(weather|storm|forecast|heat ?wave|freeze|hurricane|snow).*(punctual|service call|demand|impact|this week|territory)|(punctual|pros).*(weather|storm|forecast)/i, /storm (impact|outlook)|service.?call pressure/i], run: weatherImpact },
  { id: 'wastewater', rx: [/wastewater|treatment plant|horton.*(call|target|account|first)|pump station/i], run: wastewater },
  { id: 'cet_due', rx: [/(bids?|rfps?|opportunit).*(due|closing|next \d+ days|this month|soon)|cet.*(bid|rfp|opportunit)/i], run: q => cetDue(Number((q.match(/(\d+) ?days/) || [])[1]) || 30) },
  { id: 'addons', rx: [/add-?on|tuck-?in|acqui|targets?\b|buy .* (company|competitor)|m&a/i], run: addons },
  { id: 'pe', rx: [/compet(e|itor|ing)|rival|sponsor|other pe|private equity firm|who else|threat|\bpe firms?\b/i], run: peRivals },
  { id: 'fin', rx: [/revenue|ebitda|financial|filings?|form d|sec\b|debt|leverage|valu(e|ation) of|how big is|how much (does|is)/i], run: financials },
  { id: 'movers', rx: [/new.?mover|home sales|deed|leads? in|mailing|just (bought|sold)|recent(ly)? (sold|bought)/i], run: movers },
  { id: 'os', rx: [/serviceos|gridos|firmos|labos|signalos|harboros|tech.?enable|tech.?forward|operating system|\bos\b/i], run: osConcept },
  { id: 'comps', rx: [/comps?\b|comparable|multiple|public (peer|compan)|trades? at|benchmark/i], run: comps },
  { id: 'portfolio', rx: [/\bportfolio\b(?!\s+resource)|which companies|who is broad sky|what is broad sky|about broad sky|platforms|portfolio compan/i], run: portfolio },
  { id: 'nav', rx: [/^(open|show|go to|take me to|navigate)\b/i], run: navigate },
];

/* ── Retrieval index (fallback) ───────────────────────────────────────────── */
const STATIC_DOCS = [
  { t: 'Command Center', s: 'portfolio footprint, live NWS alerts, signals this week, timeline, data coverage', h: '#/home/overview' },
  { t: 'CET opportunity radar', s: 'New England bids, RFPs, capital plans, federal awards for electrical, solar, EV, wastewater, efficiency', h: '#/cet/opportunities' },
  { t: 'CET wastewater accounts', s: 'Horton cross-sell: 183 treatment plants ranked by fit with funded projects', h: '#/cet/wastewater' },
  { t: 'CET property transfers', s: 'commercial and industrial buildings that changed hands in MA CT RI, retrofit triggers, home sales by county', h: '#/cet/transfers' },
  { t: 'Punctual Pros weather & demand', s: 'service-call pressure index, live alerts, 7-day forecast, staffing implication, storm history', h: '#/pp/weather' },
  { t: 'Punctual Pros new-mover marketing', s: 'home sales lead list, lead score, campaigns, mailing list export', h: '#/pp/movers' },
  { t: 'Punctual Pros territory & expansion', s: 'core ZIP codes, adjacent ring, priority tiers, county rollup', h: '#/pp/territory' },
  { t: 'Punctual Pros market & competitors', s: 'competitors, franchise territories, rebates and incentives, county profiles, heating fuel mix', h: '#/pp/market' },
  { t: 'Frontline AM Law 200 targets', s: 'law firms scored for managed IT, cyber urgency, AI signal, revenue cycle', h: '#/fl/amlaw' },
  { t: 'Frontline mid-size firm targets', s: 'mid-size law firms with cyber incidents, mergers, CIO hires', h: '#/fl/midsize' },
  { t: 'Thomas Scientific parent accounts', s: '500 parent accounts, diagnostics labs, hospitals, pathology, commercial priority', h: '#/ts/accounts' },
  { t: 'Acquisition engine', s: 'add-on pipeline across portfolio companies, company theses, rival companies, valuation calculator, white space', h: '#/ma/overview' },
  { t: 'Private equity · sponsor landscape', s: 'competing sponsors, fund history, deals 2025-2026, sector heatmap, comparable companies', h: '#/pe/landscape' },
  { t: 'Sponsor precedents', s: 'how sponsors built and sold home-services companies: operator team at entry, first add-on timing, tuck-in cadence, one system, memberships, exits and buyers, entry to exit timeline', h: '#/cases/timeline' },
  { t: 'How BSP buys', s: 'deal patterns, screening rubric with weights, sourcing network of bankers and advisers, seller types, first add-on timing, every disclosed BSP deal', h: '#/bsp/deals' },
  { t: 'US expansion · county scorer', s: 'county scores nationwide from home sales, building permits, housing age, climate and competition; where Punctual Pros expands next', h: '#/national/scorer' },
  { t: 'Case studies', s: 'sponsor case studies in home services and adjacent sectors: Apex, Wrench, Champions, Sila, Smith + Howard, what they did before selling', p: 'redesigns/case-studies.html' },
  { t: 'Methodology', s: 'how the portal is built and how BSP buys: sources, scoring methods, deal rubric, caveats and estimates', p: 'redesigns/methodology.html' },
  { t: 'Fundamentals', s: 'Form D, Form ADV, BDC loan schedules, PPP, FDD Item 19, public comps, rival financials', h: '#/fin/portfolio' },
  { t: 'Tech enablement program', s: 'ServiceOS GridOS FirmOS LabOS SignalOS HarborOS theses, valuation impact, roadmaps', h: '#/techos/overview' },
  { t: 'Narrated tour', s: 'narrated tour, executive video', h: '#/briefing/play' },
  { t: '3D map', s: 'WebGL fly-through: home-sales hexagons, nationwide expansion arcs, New England opportunity columns, live storm polygons', h: '#/theater/play' },
];
let _index = null;
async function buildIndex(persona) {
  if (_index) return _index;
  const docs = STATIC_DOCS.map(d => ({ ...d, href: d.p ? ROOT + d.p : APP + d.h }));
  const metaFiles = ['pp_filings', 'cet_filings', 'frontline_filings', 'thomas_filings', 'bpi_filings', 'fairharbor_filings', 'pe_landscape', 'cet_opportunities', 'pp_market', 'public_comps', 'ma_targets_pp', 'ma_targets_cet', 'bsp_firm', 'value_creation_cases', 'bsp_methodology'];
  const res = await Promise.all(metaFiles.map(f => Data.research(f)));
  res.forEach((d, i) => { if (!d) return; const m = d.meta || {}; const narr = Array.isArray(m.methodology_narrative) ? m.methodology_narrative.slice(0, 6) : [];
    const pats = (d.items || []).filter(x => x.kind === 'pattern').slice(0, 10).map(x => `${x.pattern || ''} ${x.description || x.implication_for_next_deals || ''}`);
    const texts = [m.financial_picture, m.landscape_summary, m.territory_summary, m.expansion_thesis, typeof m.narrative === 'string' ? m.narrative : null, ...narr, ...pats, ...(m.top_10_actions || []), ...(m.implications_for_bsp || [])].filter(Boolean); texts.forEach((t, k) => docs.push({ t: `${srcLabel(metaFiles[i])} · insight`, s: String(typeof t === 'string' ? t : JSON.stringify(t)).slice(0, 600), href: APP + ({ pp_filings: '#/pp/filings', cet_filings: '#/cet/filings', frontline_filings: '#/fl/filings', thomas_filings: '#/ts/filings', bpi_filings: '#/bpi/filings', fairharbor_filings: '#/fh/filings', pe_landscape: '#/pe/landscape', cet_opportunities: '#/cet/opportunities', pp_market: '#/pp/market', public_comps: '#/fin/comps', ma_targets_pp: '#/pp/targets', ma_targets_cet: '#/cet/targets', bsp_firm: '#/home/firm', value_creation_cases: '#/cases/timeline', bsp_methodology: '#/bsp/deals' }[metaFiles[i]] || '#/home/overview') })); });
  for (const f of (persona.faq || [])) docs.push({ t: f.q, s: f.a.replace(/<[^>]+>/g, ''), href: f.href || null, faq: true, html: f.a });
  _index = docs; return docs;
}
const tok = s => String(s || '').toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'show', 'me', 'does', 'this', 'that', 'are', 'can', 'you', 'your', 'about', 'tell', 'which', 'who', 'where', 'when', 'from', 'into', 'our', 'their', 'have', 'has']);
async function retrieve(q, persona, k = 3) {
  const docs = await buildIndex(persona); const qt = tok(q); if (!qt.length) return [];
  const co = coOf(q); const own = co ? new RegExp(`${NAMES[co]}|${COS[co].replace(/[()]/g, '')}|#/${co}/`, 'i') : null; const other = co ? new RegExp(Object.keys(COS).filter(k => k !== co).map(k => `#/${k}/|${NAMES[k]}`).join('|'), 'i') : null;
  return docs.map(d => { const dt = tok(d.t + ' ' + d.s); const set = new Set(dt); let score = 0; for (const w of qt) { if (set.has(w)) score += 2; else if (dt.some(x => x.startsWith(w) || w.startsWith(x))) score += 0.6; } if (d.faq) score *= 1.3; if (own && score > 0) { const head = `${d.t} ${d.href || ''}`; if (own.test(head)) score *= 1.6; else if (other.test(head)) score *= 0.5; } return { d, score }; }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k).map(x => x.d);
}

/* ── Claude (bring your own key) ──────────────────────────────────────────── */
const LLM = {
  key: () => { try { return localStorage.getItem(KEY_LS) || ''; } catch { return ''; } },
  model: () => { try { return localStorage.getItem(MODEL_LS) || MODEL_DEFAULT; } catch { return MODEL_DEFAULT; } },
  always: () => { try { return localStorage.getItem(MODE_LS) === 'always'; } catch { return false; } },
  _sdk: null,
  async client() { if (!LLM._sdk) LLM._sdk = (await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm')).default; return new LLM._sdk({ apiKey: LLM.key(), dangerouslyAllowBrowser: true }); },
  async *stream(system, history, question) {
    const client = await LLM.client(); const messages = [...history.slice(-8), { role: 'user', content: question }];
    const base = { model: LLM.model(), max_tokens: 2000, system, messages };
    let stream;
    try { stream = client.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }); }   // policy-decline fallback, per Anthropic guidance
    catch { stream = client.messages.stream(base); }
    try {
      for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield ev.delta.text;
    } catch (e) {
      if (/fallback|beta|invalid/i.test(String(e?.message || ''))) { const s2 = client.messages.stream(base); for await (const ev of s2) if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield ev.delta.text; }
      else throw e;
    }
  },
};
/** Minimal markdown → HTML for streamed Claude text; `refOf(n)` maps an inline [n] to a source index (or null to drop it). */
const mdLite = (s, refOf) => mdBase(s).replace(/ ?\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (m, list) => { if (!refOf) return m; const out = list.split(/\s*,\s*/).map(Number).map(refOf).filter(k => k != null); return out.length ? uniq(out).map(k => `<span class="ch-ref" data-src="${k}">${k + 1}</span>`).join('') : ''; });
/** [text](https://…) links in answers: links into this site open in place, others in a new tab (http and https only). */
const mdLink = s => s.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s()<>"]+)\)/g, (m, t, u) => { const p = ownPath(u), own = p !== null; const href = own ? ROOT + p : u; return `<a href="${href}"${own ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`; });
const mdBase = s => mdLink(esc(s)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{2,4} (.+)$/gm, '<h4>$1</h4>').replace(/^\s*[-•*] (.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m.replace(/\n/g, '')}</ul>\n\n`).replace(/(<\/h4>)\n*/g, '$1\n\n')
  .split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => /^<(h4|ul)>[\s\S]*<\/(h4|ul)>$/.test(b) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`).join('');

/* ── Personas ─────────────────────────────────────────────────────────────── */
export const PERSONAS = {
  portal: { name: 'BSP Desk', short: 'the desk', initials: 'BSP', logo: true, greeting: "I'm the analyst on the BSP Desk. I know our six companies, their markets and the add-on pipeline, and I can price a deal while we talk. What are we working on?", placeholder: 'Ask anything, e.g. "Show me how to take Punctual Pros nationwide"', color: '#d9622b',
    suggestions: ['Who leads BSP, and what did they do before?', 'What could BSP pay for CET and still earn 25% a year?', 'Show me how to take Punctual Pros nationwide', 'Which wastewater plants should Horton call first?', "What do this week's storms mean for Punctual Pros?", 'Who competes with BSP for home-services deals?', 'Which CET bids are due within 30 days?', 'Which counties nationwide should Punctual Pros expand to first?', 'What did sponsors do with companies like Punctual Pros?', 'How does BSP actually buy companies?', 'Estimate Punctual Pros revenue from public filings', 'Show the top add-on targets for CET in Connecticut', "How does tech enablement raise Punctual Pros' value?", 'How many new-mover leads are in Lancaster County?', "How do the portfolio's valuations compare with public peers?", 'Which private-equity rivals are most active in our sectors?', 'Which portfolio company is largest by revenue?', 'What would a TV ad campaign for Punctual Pros look like?', 'How does BSP scale CET across the Northeast?', 'What is the growth plan for Frontline?', 'Which AI agents create the most value?', 'How much revenue do missed calls cost Punctual Pros?'],
    intents: PORTAL_INTENTS, faq: [] },
};
/** Customer-facing site personas are extended by each redesign (faq/suggestions/intents via mount options). */
const SITE_BASE = {
  pp: { name: 'Punctual Pros assistant', short: 'Punctual Pros', initials: 'PP', color: '#f08a3c', greeting: 'Hi! I can check whether we serve your address, book a visit, explain memberships and rebates, or tell you what this week\'s weather means for your home.', placeholder: 'Ask about service, coverage, pricing…', suggestions: ['Do you serve 17601?', 'Book a tune-up', 'Can I reach you at 2am?', 'What does the Comfort Club membership include?', 'What rebates are available for a heat pump?', 'Is there a storm coming this week?', 'My AC stopped working'] },
  cet: { name: 'CET project desk', short: 'CET', initials: 'CET', color: '#4c8dff', greeting: 'Ask about electrical construction, solar and storage, EV charging, wastewater and pump-station work (Horton), or energy-efficiency programs (NuWave) anywhere in New England.', placeholder: 'Ask about capabilities, states served, programs…', suggestions: ['Do you work in Connecticut?', 'What incentives exist for commercial solar in Massachusetts?', 'Can you upgrade a wastewater plant\'s switchgear?', 'Request a design-build estimate', 'Which EV charging programs are open now?'] },
  fl: { name: 'Frontline advisor', short: 'Frontline', initials: 'FL', color: '#9d7bff', greeting: 'I help law firms scope managed IT, service desk, cybersecurity and revenue-cycle support. Ask about coverage, security posture or a quick assessment.', placeholder: 'Ask about managed IT for law firms…', suggestions: ['Do you support AM Law 200 firms?', 'What is included in the service desk?', 'How do you handle eBilling and A/R?', 'Request a security assessment', 'Which offices do you operate from?'] },
  ts: { name: 'Thomas Scientific concierge', short: 'Thomas Scientific', initials: 'TS', color: '#2ecc8f', greeting: 'Find products, categories and services for research, clinical, biopharma and cleanroom labs, or reach an account representative.', placeholder: 'Search products or ask about services…', suggestions: ['Do you supply cleanroom consumables?', 'Set up a punchout catalog', 'Who is my account rep?', 'Do you serve cannabis testing labs?', 'What is vendor-managed inventory?'] },
  bpi: { name: 'BPI desk', short: 'BPI', initials: 'BPI', color: '#e05c8a', greeting: 'Ask about public affairs, corporate reputation, campaigns, research and AI-era communications work.', placeholder: 'Ask about services or case studies…', suggestions: ['What services does BPI offer?', 'Can you run a corporate reputation campaign?', 'Which offices do you have?', 'Start a conversation with the team'] },
  fh: { name: 'Fair Harbor helper', short: 'Fair Harbor', initials: 'FH', color: '#3fd0e0', greeting: 'Sizing, fabric, shipping, returns, sustainability and wholesale questions, answered.', placeholder: 'Ask about sizing, shipping, fabric…', suggestions: ['How do the swim trunks fit?', 'What are the trunks made of?', 'What is the return policy?', 'Do you sell wholesale?'] },
};
async function siteIntents(co) {
  const list = [];
  if (co === 'pp') {
    list.push({ id: 'zip', rx: [/\b\d{5}\b/], run: async q => { const z = q.match(/\b(\d{5})\b/)[1]; const zips = await Data.load('pp_zips'); const hit = zips.find(x => String(x.zip) === z); if (!hit) return { html: `<p>I don't have ${esc(z)} in our service model yet. Call the office and we'll confirm coverage.</p>` }; const inT = hit.service_territory_flag === 1, adj = hit.adjacent_to_service_territory === 1; return { html: `<p><b>${esc(z)} · ${esc(hit.city || '')}, ${esc(hit.county || '')}, ${esc(hit.state || '')}</b></p><p>${inT ? '✅ Yes — you are inside our service area. Same-day and emergency service available.' : adj ? '🟡 You are just outside our core area; we serve it by appointment with a small travel window.' : '❌ Not yet in our service area, but we are expanding — leave your details and we will notify you.'}</p>`, links: [link('#book', 'Book a visit')] }; } });
    list.push({ id: 'storm', rx: [/storm|weather|hurricane|freeze|heat ?wave|snow|outage/i], run: async () => { const [pa, nj] = await Promise.all([Live.nwsAlerts('PA').catch(() => []), Live.nwsAlerts('NJ').catch(() => [])]); const a = [...pa, ...nj].filter(x => (x.areas || []).some(y => [...TERRITORY_PA, ...TERRITORY_NJ].some(c => y.includes(c)))); return { html: `<h4>Live National Weather Service alerts</h4>${a.length ? `<ul>${a.slice(0, 5).map(x => `<li><b>${esc(x.event)}</b> — ${esc((x.areas || []).slice(0, 3).join(', '))}</li>`).join('')}</ul><p>If you lose power or heat, call us first: we pre-position crews ahead of storms.</p>` : '<p>No active alerts. Good time to schedule maintenance before the next front.</p>'}`, links: [link('#book', 'Schedule service')] }; } });
  }
  if (co === 'cet') list.push({ id: 'programs', rx: [/incentive|program|smart|rebate|nevi|mass save|connectedsolutions/i], run: async () => { const d = await Data.research('cet_opportunities'); const p = (d?.items || []).filter(i => i.type === 'program' || /program|incentive/i.test(i.title)).slice(0, 5); return { html: `<h4>Programs we work with</h4><ul>${p.map(i => `<li><b>${esc(i.title)}</b> — ${esc(i.state)} · ${esc(clip(i.fit_rationale || '', 120))}</li>`).join('') || '<li>Mass Save, MA SMART, CT NRES, NEVI, EV charging grants, Clean Water SRF-funded upgrades</li>'}</ul>`, links: [link('#contact', 'Talk to an engineer')] }; } });
  return list;
}

/* ── Sources: every dataset an answer reads becomes a numbered, humanized citation ── */
const RESEARCH_FILES = 36, DEED_FILES = 10;   // data/research and data/sales; core tables come from data/manifest.json
let DATASETS = 56;   // refined from the manifest below so the count matches the landing page
const WIDGETS = new Set();
fetch(ROOT + 'data/manifest.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).then(m => {
  const core = Array.isArray(m?.datasets) ? m.datasets.length : 0; if (!core) return;
  const old = DATASETS; DATASETS = core + RESEARCH_FILES + DEED_FILES; if (old !== DATASETS) WIDGETS.forEach(w => w.syncCount(old));
}).catch(() => { /* keep the default count */ });
const AS_OF_DEFAULT = '2026-09-24';
const FRESH = new Set(['value_creation_cases', 'bsp_methodology', 'national_counties', 'cases_home_services', 'cases_cross_sector', 'ai_agents_portfolio', 'bpi_playbook', 'cet_playbook', 'design_refs', 'fh_playbook', 'fl_playbook', 'pp_ads', 'pp_nationwide', 'serviceos_evidence', 'ts_playbook', 'voice_ai']);
const RD = 'redesigns/';
/** key → [readable name, one-line description, where to open it (portal hash, site path or URL)] */
const SRC = {
  pp_nationwide: ['Punctual Pros nationwide evidence', 'Franchise disclosures, press, BLS and vendor data behind the nationwide plan', RD + 'punctual-pros/nationwide.html'],
  pp_zips: ['Punctual Pros ZIP-code model', '3,691 ZIP codes scored for territory, adjacency and priority tier', '#/pp/territory'],
  pp_meta: ['Punctual Pros territory profile', 'Summary of the Central-PA and Jersey Shore footprint', '#/pp/territory'],
  pp_sales_90d: ['County deed records (last 90 days)', 'Recorded home sales across the territory counties in the last 90 days', '#/pp/movers'],
  pp_sales_pa_a: ['County deed records (PA)', 'Recorded transfers for Lancaster, York, Dauphin and Cumberland counties', '#/pp/movers'],
  pp_sales_pa_b: ['County deed records (PA, outer ring)', 'Recorded transfers for Berks, Lebanon, Franklin, Adams, Perry, Chester and Montgomery', '#/pp/movers'],
  pp_sales_nj: ['County deed records (NJ)', 'State sales extract for Ocean, Monmouth, Atlantic and Burlington counties', '#/pp/movers'],
  ma_targets_pp: ['Punctual Pros add-on targets', 'HVAC, plumbing and electrical tuck-ins, screened and fit-scored', '#/ma/pipeline?platform=pp'],
  pp_market: ['Punctual Pros market profile', 'Competitors, franchise territories, rebates and county profiles', '#/pp/market'],
  pp_filings: ['Punctual Pros public filings', 'Form D, lender schedules, franchise disclosures and state records, with analyst estimates', '#/pp/filings'],
  pp_demand_model: ['Punctual Pros demand model', 'Weather-to-service-call elasticities and storm response plans', '#/pp/weather'],
  pp_storm_events: ['Punctual Pros storm history', 'NOAA storm events recorded in the territory counties', '#/pp/weather'],
  pp_ads: ['Punctual Pros ad plan', 'Media plan, connected-TV platform costs and sample creatives', RD + 'punctual-pros/ads.html'],
  deal_model: ['Acquisition model assumptions', 'Deal benchmarks, portfolio presets and model assumptions', '#/deal/returns'],
  serviceos_evidence: ['OS program evidence', 'Evidence for tech-enabled multiples and the roadmap assumptions', RD + 'punctual-pros/serviceos.html'],
  voice_ai: ['Voice AI research', 'Missed-call economics, vendors, use cases and guardrails', RD + 'voice-ai.html'],
  ai_agents_portfolio: ['Portfolio AI-agent plan', 'Agents by company with triggers, annual value and time to deploy', RD + 'ai-agents.html'],
  cet_opportunities: ['CET opportunity radar', 'New England bids, capital plans, programs and federal awards', '#/cet/opportunities'],
  cet_ne_rfps: ['New England public bids', 'State procurement notices tagged for CET fit', '#/cet/opportunities'],
  cet_ne_counties: ['CET New England county scores', '67 New England counties scored for electrical demand', '#/cet/overview'],
  cet_ne_development: ['New England development activity', 'Municipal development logs, federal awards and press', '#/cet/opportunities'],
  cet_nyc_archive_summary: ['CET legacy archive summary', 'Summary of a retired legacy archive', '#/cet/overview'],
  cet_wwtp_targets: ['CET wastewater-plant targets', 'CT, MA and RI treatment plants scored for Horton fit', '#/cet/wastewater'],
  cet_filings: ['CET public filings', 'Form D, lender schedules and state records, with analyst estimates', '#/cet/filings'],
  cet_playbook: ['CET growth plan', 'Phases, levers, AI agents and the roadmap for CET', RD + 'cet/growth-plan.html'],
  cet_home_sales_ma: ['County deed records (MA)', 'Recorded home sales in the CET service area', '#/cet/transfers'],
  cet_home_sales_ct_ri: ['County deed records (CT and RI)', 'Recorded home sales in the CET service area', '#/cet/transfers'],
  cet_transfers_ma: ['Commercial property transfers (MA)', 'Commercial and industrial buildings that changed hands', '#/cet/transfers'],
  cet_transfers_ct_ri: ['Commercial property transfers (CT and RI)', 'Commercial and industrial buildings that changed hands', '#/cet/transfers'],
  ma_targets_cet: ['CET add-on targets', 'Electrical, solar and controls add-ons, screened and fit-scored', '#/ma/pipeline?platform=cet'],
  ma_targets_fl_ts: ['Frontline and Thomas Scientific add-on targets', 'Managed-IT and lab-supply add-ons, screened and fit-scored', '#/ma/pipeline'],
  fl_lawfirms: ['Frontline law-firm universe', 'AM Law 200 firms scored for managed IT and cyber urgency', '#/fl/amlaw'],
  fl_midsize_firms: ['Mid-size law firms', 'Mid-size firms with cyber incidents, mergers and CIO hires', '#/fl/midsize'],
  frontline_filings: ['Frontline public filings', 'Form D, lender schedules and state records, with analyst estimates', '#/fl/filings'],
  fl_playbook: ['Frontline growth plan', 'Phases, levers, AI agents and the roadmap for Frontline', RD + 'frontline/growth-plan.html'],
  ts_sites: ['Thomas Scientific lab sites', '27,503 lab and clinical sites from public registries', '#/ts/sites'],
  ts_parents: ['Thomas Scientific parent accounts', 'Top 500 parent organizations rolled up from lab sites', '#/ts/accounts'],
  thomas_filings: ['Thomas Scientific public filings', 'Form D, lender schedules and state records, with analyst estimates', '#/ts/filings'],
  ts_playbook: ['Thomas Scientific growth plan', 'Phases, levers, AI agents and the roadmap for Thomas Scientific', RD + 'thomas-scientific/growth-plan.html'],
  ts_sales_gloucester_nj: ['County deed records (Gloucester County, NJ)', 'Recorded transfers around the Thomas Scientific campus', '#/ts/overview'],
  bpi_filings: ['BPI public filings', 'Public records and analyst estimates for Bully Pulpit International', '#/bpi/filings'],
  bpi_playbook: ['BPI growth plan', 'Phases, levers, AI agents and the roadmap for BPI', RD + 'bpi/growth-plan.html'],
  bpi_sales_dc: ['Deed records (DC)', 'Recorded transfers in the District of Columbia', '#/bpi/overview'],
  fairharbor_filings: ['Fair Harbor public filings', 'Public records and analyst estimates for Fair Harbor', '#/fh/filings'],
  fh_playbook: ['Fair Harbor growth plan', 'Phases, levers, AI agents and the roadmap for Fair Harbor', RD + 'fair-harbor/growth-plan.html'],
  fh_sales_nyc: ['Deed records (New York City)', 'Recorded transfers used for the Fair Harbor retail screen', '#/fh/overview'],
  pe_landscape: ['Private-equity landscape', 'Competing sponsors, funds, portfolio companies and threat level', '#/pe/landscape'],
  rival_filings: ['Competitor filings', 'Public filings of rival companies', '#/fin/portfolio'],
  public_comps: ['Public comparables', 'Sector medians from SEC XBRL filings', '#/fin/comps'],
  bsp_firm: ['BSP firm profile', 'Strategy, portfolio companies, add-ons and exits', '#/home/firm'],
  value_creation_cases: ['Value-creation cases', '34 sponsor-backed home-services and adjacent cases: entry, add-on cadence, exits and the levers they pulled', '#/cases/timeline'],
  cases_home_services: ['Home-services sponsor cases', 'How sponsors built and sold HVAC, plumbing and electrical companies', '#/cases/timeline'],
  cases_cross_sector: ['Cross-sector sponsor cases', 'Comparable builds in electrical, legal services, lab supply, communications and apparel', '#/cases/timeline'],
  bsp_methodology: ['How BSP buys', 'Every disclosed BSP deal rebuilt from primary releases: patterns, rubric and sourcing network', '#/bsp/deals'],
  national_counties: ['National county table', '3,144 US counties: home sales, permits, housing age, climate and competition', '#/national/scorer'],
  design_refs: ['Design principles', 'The design principles behind the site concepts', RD],
  'live:nws': ['National Weather Service alerts', 'Live watches, warnings and advisories for PA and NJ', 'https://www.weather.gov/'],
  'live:forecast': ['Open-Meteo forecast', 'Seven-day highs, lows, rain and gusts for the service hubs', 'https://open-meteo.com/'],
};
const ASOF = new Map();
const srcHref = h => !h ? null : /^https?:/.test(h) ? h : h[0] === '#' ? APP + h : ROOT + h;
const PREFIX = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor', bsp: 'BSP', ma: 'M&A', pe: 'PE' };
const UPPER = new Set(['ai', 'os', 'pa', 'nj', 'ct', 'ri', 'ne', 'nyc', 'dc', 'nws', 'hvac', 'ev', 'kpi', 'rfp', 'rfps', 'lsa', 'ctv', 'sms', 'seo', 'crm', 'cpa', 'cpm', 'roi', 'api', 'iaq', 'ppc']);
const SPECIAL = { pmax: 'PMax', ebitda: 'EBITDA', usd: 'USD' };
const srcKey = k => String(k || '').replace(/^\.\//, '').replace(/^sales\//, '').replace(/\.json$/, '');
function srcLabel(key) { key = srcKey(key); if (SRC[key]) return SRC[key][0]; const w = key.split('_').filter(Boolean).map((b, i) => i === 0 && PREFIX[b] ? PREFIX[b] : UPPER.has(b) ? b.toUpperCase() : SPECIAL[b] || b).join(' '); return w.charAt(0).toUpperCase() + w.slice(1); }
function srcOf(key) { key = srcKey(key); const r = SRC[key] || []; const live = key.startsWith('live:'); return { key, label: srcLabel(key), desc: r[1] || '', href: srcHref(r[2]), kind: live ? 'live' : 'dataset', asOf: live ? 'live' : ASOF.get(key) || (FRESH.has(key) ? '2026-10-06' : AS_OF_DEFAULT), at: Date.now() }; }
const KIND_TEXT = { live: 'Live feed', page: 'Page', insight: 'Dataset insight', firm: 'BSP website', press: 'Press release', filing: 'SEC filing', news: 'News', company: 'Company website', web: 'Public source', model: 'Acquisition model' };
const DATED = new Set(['firm', 'press', 'filing', 'news', 'company', 'web']);
const asOfText = s => s.kind === 'live' ? `Live · fetched ${new Date(s.at || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : s.kind === 'page' ? 'Portal view' : s.kind === 'model' ? 'Run for this answer' : DATED.has(s.kind) ? (s.asOf ? `Dated ${Fmt.date(s.asOf)}` : 'Public page') : `As of ${Fmt.date(s.asOf || AS_OF_DEFAULT)}`;
const kindText = s => KIND_TEXT[s.kind] || 'Dataset';
/* A source from the hosted knowledge base, in the shape the source list and popovers use. */
const HOSTED_FIRST = new Set(['model']);   // intents the hosted assistant answers better (it has the deal-model tool); the intent stays the offline answer
const SRV_KIND = { page: 'page', 'portal-view': 'page', 'site-page': 'page', answer: 'page', research: 'dataset', model: 'model', firm: 'firm', 'firm-team': 'firm', 'firm-investment': 'firm', 'press-release': 'press', filing: 'filing', company: 'company', article: 'news', headline: 'news', reference: 'web', web: 'web' };
function srvSource(s) {
  const url = String(s?.url || ''), p = ownPath(url), href = p !== null ? ROOT + p : url;
  const kind = SRV_KIND[s?.kind] || 'web';
  const desc = kind === 'page' || kind === 'dataset' ? '' : String(s?.publisher || '');
  return { key: null, label: terms(String(s?.title || 'Source')), desc, href: href || null, kind, asOf: s?.date ? String(s.date).slice(0, 10) : null, at: Date.now() };
}

/** Record which datasets and live feeds an answer actually reads (wraps Data.load / Live once, transparently). */
let TRACK = null;
(function instrument() {
  if (Data.__chTracked) return; Data.__chTracked = true;
  const load = Data.load;
  Data.load = function (name) { const p = load.apply(this, arguments); try { TRACK?.dataset(String(name), p); } catch { /* tracking is best-effort */ } return p; };
  for (const [k, id] of [['nwsAlerts', 'live:nws'], ['forecast', 'live:forecast']]) { const f = Live[k]; if (typeof f === 'function') Live[k] = function () { try { TRACK?.live(id); } catch { /* best-effort */ } return f.apply(this, arguments); }; }
})();
class Tracker {
  constructor(onStep) { this.map = new Map(); this.onStep = onStep; }
  dataset(name, p) {
    const key = srcKey(name); if (key === 'manifest' || this.map.has(key)) return;
    this.map.set(key, srcOf(key)); this.onStep(`Reading ${srcLabel(key)}`);
    Promise.resolve(p).then(j => { const m = j && !Array.isArray(j) ? j.meta : null; const g = m && (m.as_of || m.generated); if (g) { const d = String(g).slice(0, 10); ASOF.set(key, d); const s = this.map.get(key); if (s) s.asOf = d; } }).catch(() => this.map.delete(key));
  }
  live(id) { if (this.map.has(id)) return; this.map.set(id, srcOf(id)); this.onStep(id === 'live:nws' ? 'Checking live National Weather Service alerts' : 'Pulling the seven-day forecast'); }
  list() { return [...this.map.values()]; }
}
const ID_RX = /(?<![\w/.#=@-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?:\.json)?(?![\w/-])/g;
/** Wrap tables, turn raw dataset identifiers into readable names and add inline [n] references. Mutates `sources`. */
function polishAnswer(root, sources) {
  // estimate badges read lowercase "est.", apart from the uppercase status badges (any source: intents, deep dives, page intents)
  root.querySelectorAll('.ch-badge, .sys-est').forEach(b => { if (/^\s*est\.?\s*$/i.test(b.textContent)) { b.classList.add('ch-est'); b.textContent = 'est.'; } });
  root.querySelectorAll('table').forEach(t => {
    if (!t.parentElement?.classList.contains('ch-tbl')) { const w = document.createElement('div'); w.className = 'ch-tbl'; t.replaceWith(w); w.appendChild(t); }
    const cols = t.querySelectorAll('thead th').length; if (cols >= 4 && !t.style.minWidth) t.style.minWidth = `${Math.min(720, cols * 112)}px`;
    const rows = [...t.querySelectorAll('tbody tr')]; if (rows.length) t.querySelectorAll('thead th').forEach((th, c) => { if (rows.every(r => r.children[c]?.classList.contains('n'))) th.classList.add('n'); });
  });
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);   // house terminology on every visible string
  for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (/playbook|platform/i.test(t.nodeValue)) t.nodeValue = terms(t.nodeValue); if (/\bzips\b/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/\bzips\b/g, 'ZIP codes'); if (/[.…]\./.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/(?<!\.)\.\.(?!\.)/g, '.').replace(/…\./g, '…'); if (/\b(?:19|20)\d\d-[01]\d-[0-3]\d\b/.test(t.nodeValue) && !t.parentElement?.closest('a, code')) t.nodeValue = t.nodeValue.replace(/(?<![\w/.-])((?:19|20)\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?![\w/-])/g, (m, y, mo, d) => `${MON[+mo - 1]} ${+d}, ${y}`); if (/\d\/\d{1,2}\/(?:19|20)\d\d/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/(?<![\w/.-])(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])\/((?:19|20)\d\d)(?![\w/-])/g, (m, mo, d, y) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+mo - 1]} ${+d}, ${y}`); }
  const idx = new Map(sources.map((s, i) => [s.key, i]));
  root.querySelectorAll('[data-cite]').forEach(el => { const key = srcKey(el.dataset.cite); el.removeAttribute('data-cite'); if (!SRC[key]) return; let i = idx.get(key); if (i == null) { sources.push(srcOf(key)); i = sources.length - 1; idx.set(key, i); } el.after(refEl(i, sources[i])); });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/[a-z0-9]_[a-z0-9]/.test(n.nodeValue)) nodes.push(n);
  for (const n of nodes) {
    const v = n.nodeValue; const hits = [...v.matchAll(ID_RX)]; if (!hits.length) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    for (const m of hits) {
      frag.append(v.slice(last, m.index)); const key = m[1]; frag.append(srcLabel(key));
      if (SRC[key]) { let i = idx.get(key); if (i == null) { sources.push(srcOf(key)); i = sources.length - 1; idx.set(key, i); } frag.append(refEl(i, sources[i])); }
      last = m.index + m[0].length;
    }
    frag.append(v.slice(last)); n.replaceWith(frag);
  }
}
function refEl(i, s) { const a = document.createElement(s.href ? 'a' : 'span'); a.className = 'ch-ref'; a.dataset.src = i; if (s.href) a.href = s.href; a.setAttribute('aria-label', `Source ${i + 1}: ${s.label}`); a.textContent = i + 1; return a; }
const linksOf = html => { const d = document.createElement('div'); d.innerHTML = (html || []).join(''); return [...d.querySelectorAll('a[href]')].map(a => ({ href: a.href, label: a.textContent.replace(/\s*→\s*$/, '').trim() })); };

/* ── Conversation memory: resolve short follow-ups against the last grounded answer ── */
const NAMES = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
const ST_FULL = { pennsylvania: 'PA', 'new jersey': 'NJ', connecticut: 'CT', massachusetts: 'MA', maryland: 'MD', delaware: 'DE', 'rhode island': 'RI', 'new hampshire': 'NH', vermont: 'VT', 'new york': 'NY' };
const stateOf = q => { const m = String(q).match(/\b(PA|NJ|MD|DE|NY|CT|MA|RI|NH|VT)\b/) || String(q).match(/\b(pennsylvania|new jersey|connecticut|massachusetts|maryland|delaware|rhode island|new hampshire|vermont|new york)\b/i); return m ? (ST_FULL[m[1].toLowerCase()] || m[1].toUpperCase()) : null; };
const FOLLOW_RX = /^(and|but|also|ok(ay)?|so|now|then|what about|how about|same (for|in)|which of|of (those|these)|for|in|only|just)\b|\b(those|these|them|that list|the same|instead)\b/i;
const CO_DEFAULT = { cases: 'pp', national: 'pp', expansion: 'pp', nationwide_sub: 'pp', weather: 'pp', movers: 'pp', ads: 'pp', voice: 'pp', membership: 'pp', pricing: 'pp', wastewater: 'cet', cet_due: 'cet', cet_scope: 'cet', cet_counties: 'cet', transfers: 'cet', lawfirms: 'fl', ts_accounts: 'ts', zip: 'pp', storm: 'pp', programs: 'cet' };
function resolveFollowUp(q, ctx) {
  if (!ctx?.q) return null;
  const s = q.trim(); const words = s.split(/\s+/).length; if (words > 14) return null;
  const co = coOf(s), st = stateOf(s) || (ctx.intent === 'national' ? stateAny(s) : null);
  if (!(FOLLOW_RX.test(s) || ((co || st) && words <= 4))) return null;
  const tco = co || ctx.co || 'pp'; const N = NAMES[tco] || COS[tco];
  const agents = () => tco === 'pp' ? 'Which AI agents pay back fastest?' : `Which AI agents help ${N} most?`;
  const grow = () => st ? `Top add-on targets for ${N} in ${st}` : tco === 'pp' ? 'Show me how to take Punctual Pros nationwide' : `What is the growth plan for ${N}?`;
  const T = {
    expansion: grow, playbook: grow,
    nationwide_sub: () => /agent/i.test(ctx.q) ? agents() : grow(),
    ai_agents: agents,
    voice: () => `How does 24/7 voice AI help ${N}?`,
    addons: () => { const k = st || (co && co !== ctx.co ? null : ctx.st); return `Top add-on targets for ${N}${k ? ` in ${k}` : ''}`; },
    pe: () => `Who competes with ${N}?`,
    fin: () => `Estimate ${N} revenue from public filings`,
    os: () => `What is the tech-enablement thesis for ${N}?`,
    profile: () => `Tell me about ${N}`,
    addon_history: () => `Which add-ons has ${N} closed so far?`,
    cet_counties: () => st && NE_ST.has(st) ? `Which ${ST_NAME[st] || st} counties are best for CET?` : null,
    transfers: () => st && NE_ST.has(st) ? `Which commercial buildings changed hands in ${ST_NAME[st] || st}?` : null,
    cet_scope: () => null,
    national: () => { const s2 = st || stateAny(s); return s2 ? `Which ${ST_NAME[s2] || s2} counties score highest?` : null; },
  };
  let rq = T[ctx.intent]?.();
  if (!rq) {
    rq = ctx.q.replace(/[?.!\s]+$/, '');
    if (co && co !== ctx.co) { const old = [COS[ctx.co], NAMES[ctx.co]].filter(Boolean).find(x => rq.includes(x)); rq = old ? rq.replace(old, N) : `${rq} for ${N}`; }
    if (st && !rq.includes(st)) rq = `${rq} in ${st}`;
    rq += '?';
  }
  return rq.toLowerCase() === s.toLowerCase() ? null : { q: rq, from: ctx.q };
}

/* ── Presentation helpers ─────────────────────────────────────────────────── */
const MODEL_NAMES = { 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-4-5': 'Claude Haiku 4.5' };
const modelName = id => MODEL_NAMES[id] || String(id || '').replace(/^claude-/, 'Claude ').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/\b[a-z]/g, c => c.toUpperCase());
/* Engine labels are plain words for visitors; the detail (model, dataset count, date) lives in the tooltip. */
const GROUNDED = () => 'From the portfolio data';
const CLAUDE = 'Deep research', PREPARED = 'Prepared answer';   // the research assistant's label: BSP Desk's own, no vendor name
const hostedLabel = () => CLAUDE;
const keyLabel = () => CLAUDE;
const groundedTip = () => `Answered directly from ${DATASETS} portfolio datasets`;
const claudeTip = () => 'Researched across BSP Desk\'s library, with the sources it read and the models it ran';
/** Label, tooltip and style for an answer's engine chip; also reads labels saved by older versions. */
function engineInfo(e, tip) {
  const t = String(e || '');
  if (/^(deep dive|prepared)/i.test(t)) return { label: PREPARED, tip: tip || 'Prepared in advance from the portfolio data', llm: true };
  if (/hosted|your key|^claude|^deep research/i.test(t)) return { label: CLAUDE, tip: claudeTip(), llm: true };
  return { label: GROUNDED(), tip: tip || groundedTip(), llm: false };
}
/** Header engine: deep research when the hosted backend (or, in dev, your key) is live, else the portfolio data. */
const engineLabel = () => hosted() || LLM.key() ? CLAUDE : GROUNDED();
const engineTip = () => hosted() ? 'Searches a library of BSP\'s website, press releases, filings, news, the companies\' own sites and the portal\'s research, and can run the acquisition model' : LLM.key() ? 'Portfolio questions are answered from the data; open questions get a research pass' : groundedTip();
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();
const svg = (d, w = 18) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const I = {
  send: svg('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
  stop: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor"/></svg>',
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'),
  clip: svg('<path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>'),
  compose: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  expand: svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>', 16),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 16),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 16),
  regen: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>', 16),
  speak: svg('<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>', 16),
  open: svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>', 16),
  up: svg('<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 4 3.9Z"/>', 16),
  down: svg('<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 5.6 3H17v11l-4 8a3 3 0 0 1-4-3.9Z"/>', 16),
  chev: svg('<path d="m6 9 6 6 6-6"/>', 14),
  arrowDown: svg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>', 16),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>', 15),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 13),
  db: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', 13),
  spark: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path d="M8 10.5h5M10.5 8v5"/>', 13),   // deep research: a magnifier, not a starburst
  menu: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 16),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>', 16),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', 14),
  slash: svg('<path d="m15 4-6 16"/>', 14),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 14),
};
/** Task groups for the empty state; every persona suggestion lands in exactly one. */
const GROUPS = [
  ['expand', 'Expand', svg('<path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/>', 16), /nationwide|expan|scale|grow|playbook|growth plan|counties|national|northeast|\bserve\b|coverage|work in|offices|which states|territor|phase/i],
  ['acquire', 'Acquire', svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', 16), /add-?on|target|acqui|tuck|compet|rival|sponsor|landscape|\bpe\b|deals?\b|who else|\bbuy\b/i],
  ['operate', 'Operate', svg('<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>', 16), /storm|weather|wastewater|\bbids?\b|agent|voice|\bai\b|serviceos|gridos|\bos\b|book|schedule|dispatch|service desk|punchout|inventory|stopped|reach you|support|ebilling|security|tune-?up|engineer|switchgear|tech-?enable/i],
  ['finance', 'Finance', svg('<path d="M3 3v18h18"/><path d="M7 15v2"/><path d="M11 11v6"/><path d="M15 7v10"/><path d="M19 4v13"/>', 16), /revenue|filings?|ebitda|comps?\b|valuation|multiple|cost|price|pricing|rebate|incentive|financ|membership|return|payback|worth|recover|program/i],
  ['market', 'Market', svg('<path d="m3 11 15-6v14L3 13Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>', 16), /\bads?\b|ctv|media|new-?mover|leads?\b|market|campaign|reputation|brand|wholesale|sell|fit|sizing|made of|shipping|return policy/i],
];
const groupOf = s => (GROUPS.find(g => g[3].test(s)) || GROUPS[2])[0];
const COMMANDS = [['/portal', 'BSP Desk', 'portal'], ['/pp', 'Punctual Pros assistant', 'pp'], ['/cet', 'CET project desk', 'cet'], ['/fl', 'Frontline advisor', 'fl'], ['/ts', 'Thomas Scientific concierge', 'ts'], ['/bpi', 'BPI desk', 'bpi'], ['/fh', 'Fair Harbor helper', 'fh'], ['/new', 'Start a new chat'], ['/clear', 'Clear this conversation'], ['/key', 'Model key and settings']];
const FB_LS = 'bsp-chat-feedback', TH_LS = 'bsp-assistant-threads', THEME_KEY = 'bsp-theme';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
/** Answer text for the chat log: paragraphs and list items on their own lines, citations kept as [n]. */
const logText = html => { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<li\b[^>]*>/gi, m => m + '- ').replace(/<\/(p|li|h\d|tr|div|ul|ol|table)>|<br\s*\/?>/gi, m => m + '\n'); d.querySelectorAll('.ch-ref').forEach(r => r.replaceWith(`[${r.textContent.trim()}]`)); return (d.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); };
const plain = html => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('.ch-ref').forEach(r => r.remove()); return (d.innerText || d.textContent || '').replace(/\n{3,}/g, '\n\n').trim(); };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
function resolvePersona(id, opts = {}) {
  const base = PERSONAS[id] || SITE_BASE[id] || PERSONAS.portal;
  const short = opts.short_name || opts.short || base.short;
  return { ...base, ...opts, short, faq: [...(base.faq || []), ...(opts.faq || [])], suggestions: opts.suggestions ? [...opts.suggestions, ...(base.suggestions || [])] : (base.suggestions || []), intents: [...(opts.intents || []), ...(base.intents || [])] };
}

/** The working-status row: cycles through real steps, then collapses to "Answered in 1.3 s · 5 sources". */
class Status {
  constructor(el) { this.el = el; this.t0 = now(); this.steps = []; this.q = []; this.timer = 0; this.done = false; el.hidden = false; el.innerHTML = '<span class="ch-spin" aria-hidden="true"></span><span class="ch-st-t"></span>'; }
  push(t) { if (this.done || !t) return; if (this.steps.at(-1)?.t === t) return; this.steps.push({ t, at: now() - this.t0 }); this.q.push(t); if (!this.timer) this.tick(); }
  tick() {
    if (!this.q.length || this.done) { this.timer = 0; return; }
    if (this.q.length > 2) this.q.splice(0, this.q.length - 2);
    const s = this.el.querySelector('.ch-st-t'); if (s) { s.textContent = this.q.shift(); s.classList.remove('in'); void s.offsetWidth; s.classList.add('in'); }
    this.timer = setTimeout(() => this.tick(), 240);
  }
  async settle(max = 650) { const end = now() + max; while (this.timer && now() < end) await sleep(30); }
  finish(n, label = 'Answered', engine = '', tip = '') { clearTimeout(this.timer); this.timer = 0; this.done = true; this.meta = { label, elapsed: (now() - this.t0) / 1000, n, engine: engine || undefined, tip: tip || undefined, steps: this.steps.map(s => ({ t: s.t, at: Math.round(s.at) })) }; Status.render(this.el, this.meta); return this.meta; }
  static render(el, m) {
    if (!m) { el.hidden = true; return; }
    const secs = m.elapsed < 10 ? m.elapsed.toFixed(1) : Math.round(m.elapsed);
    el.hidden = false;
    el.innerHTML = `<button type="button" class="ch-st-done" data-a="steps" aria-expanded="false">${m.label === 'Stopped' ? I.stop : I.check}<span>${esc(m.label)} in ${secs} s · ${m.n ? `${m.n} source${m.n === 1 ? '' : 's'}` : 'no sources'}</span>${I.chev}</button>${m.engine ? (e => `<span class="ch-eng${e.llm ? ' llm' : ''}" title="${esc(e.tip)}">${e.llm ? I.spark : I.db}<span>${esc(e.label)}</span></span>`)(engineInfo(m.engine, m.tip)) : ''}<ol class="ch-steps" hidden>${(m.steps || []).map(s => `<li><span class="ch-num">${s.at < 1000 ? `${s.at} ms` : `${(s.at / 1000).toFixed(1)} s`}</span>${esc(s.t)}</li>`).join('')}</ol>`;
  }
}

/** Claude's working panel: its summarized reasoning and each step it took (searches, sources read, model runs), streamed
    live above the answer, then folded to "Thought for 12 s" once the answer starts. Saved with the turn. */
class Think {
  constructor(turn) { this.turn = turn; this.el = null; this.parts = []; this.t0 = now(); this.secs = 0; this.closed = false; }
  open() {
    if (this.el) return this.el;
    const d = document.createElement('details'); d.className = 'ch-think'; d.open = true;
    d.innerHTML = '<summary><span class="ch-think-h">Thinking</span><span class="ch-think-dots" aria-hidden="true"></span></summary><div class="ch-think-b" aria-live="off"></div>';
    this.turn.querySelector('.ch-answer').before(d); this.el = d; this.t0 = now(); return d;
  }
  text(t) { if (this.closed || !t) return; const last = this.parts.at(-1); if (last?.k === 't') last.v += t; else this.parts.push({ k: 't', v: t }); this.paint(); }
  step(t) { if (this.closed || !t || /^Thinking it through$/.test(t)) return; if (this.parts.at(-1)?.v === t) return; this.parts.push({ k: 's', v: t }); this.paint(); }
  paint() { const b = this.open().querySelector('.ch-think-b'); b.innerHTML = Think.html(this.parts); b.scrollTop = b.scrollHeight; }
  close() {
    if (!this.el || this.closed) return; this.closed = true;
    this.secs = Math.max(1, Math.round((now() - this.t0) / 1000)); this.el.open = false;
    this.el.querySelector('summary').innerHTML = Think.head(this.secs, this.parts);
  }
  record() { return this.el ? { parts: this.parts, secs: this.secs } : undefined; }
  static html(parts) { return parts.map(p => p.k === 's' ? `<p class="ch-think-step">${esc(p.v)}</p>` : `<div class="ch-think-t">${mdLite(terms(p.v), null)}</div>`).join(''); }
  static head(secs, parts) { const n = parts.filter(p => p.k === 's').length; return `<span class="ch-think-h">Thought for ${secs} s${n ? ` · ${n} step${n === 1 ? '' : 's'}` : ''}</span>${I.chev}`; }
  static render(turn, th) {
    if (!th?.parts?.length) return;
    const d = document.createElement('details'); d.className = 'ch-think';
    d.innerHTML = `<summary>${Think.head(th.secs, th.parts)}</summary><div class="ch-think-b">${Think.html(th.parts)}</div>`;
    turn.querySelector('.ch-answer').before(d);
  }
}

/** Progressive reveal of finished HTML: text nodes fill at ~1,200–1,800 chars/s behind a caret. */
function reveal(root, ctl) {
  if (reduced()) return Promise.resolve();
  const els = [...root.querySelectorAll('*')]; const texts = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) texts.push({ node: n, full: n.nodeValue });
  const total = texts.reduce((a, t) => a + t.full.length, 0); if (total < 40) return Promise.resolve();
  const rate = Math.max(1200, Math.min(1800, total / 4));
  els.forEach(e => e.setAttribute('data-pend', '')); texts.forEach(t => { t.node.nodeValue = ''; });
  const caret = document.createElement('span'); caret.className = 'ch-caret'; caret.setAttribute('aria-hidden', 'true');
  root.classList.add('ch-revealing');
  let i = 0, off = 0, p = 0, budget = 0, last = now();
  const finish = () => { texts.forEach(t => { t.node.nodeValue = t.full; }); els.forEach(e => e.removeAttribute('data-pend')); caret.remove(); root.classList.remove('ch-revealing'); };
  return new Promise(resolve => {
    const step = () => {
      if (ctl?.stopped && root.isConnected) { root.querySelectorAll('[data-pend]').forEach(e => e.remove()); caret.remove(); root.classList.remove('ch-revealing'); resolve(true); return; }
      if (!root.isConnected || document.hidden) { finish(); resolve(false); return; }
      const t1 = now(); budget += rate * Math.min(250, t1 - last) / 1000; last = t1;
      while (budget >= 1 && i < texts.length) {
        const t = texts[i];
        if (off === 0) while (p < els.length && (els[p].compareDocumentPosition(t.node) & Node.DOCUMENT_POSITION_FOLLOWING)) els[p++].removeAttribute('data-pend');
        let take = Math.min(t.full.length - off, Math.floor(budget));
        const sp = t.full.indexOf(' ', off + take); if (sp > 0 && sp - off - take < 12) take = sp - off;   // end on a word
        off += take; budget -= Math.max(1, take); t.node.nodeValue = t.full.slice(0, off);
        if (off >= t.full.length) { i++; off = 0; }
      }
      const cur = (off === 0 && i > 0 ? texts[i - 1] : texts[Math.min(i, texts.length - 1)]).node; if (cur.parentNode) cur.parentNode.insertBefore(caret, cur.nextSibling);
      if (i >= texts.length) { finish(); resolve(false); return; }
      setTimeout(step, 16);
    };
    setTimeout(step, 16);
  });
}

/* ── Widget ───────────────────────────────────────────────────────────────── */
export const Chat = {
  /** mode: 'inline' (hero), 'floating' (launcher + panel) or 'full' (assistant.html). Options are unchanged from v1, plus
      short_name: the short label for the launcher ("Ask {short_name}"); defaults to the persona's own short name. */
  mount(el, opts = {}) {
    let personaId = opts.persona || 'portal';
    if (opts.mode === 'full' && !(PERSONAS[personaId] || SITE_BASE[personaId])) personaId = 'portal';
    const persona = resolvePersona(personaId, opts);
    if (!document.getElementById('bsp-chat-css')) { const l = document.createElement('link'); l.id = 'bsp-chat-css'; l.rel = 'stylesheet'; l.href = ROOT + 'assets/chat.css?v=20261009192122'; document.head.appendChild(l); }
    return new Widget(el, persona, personaId, opts);
  },
};
const IS_MAC = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl ';
const PERSONA_ORDER = ['portal', 'pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];
const uniq = a => [...new Set(a)];
const normQ = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sameQ = (a, b) => !!a && !!b && normQ(a) === normQ(b);

class Widget {
  constructor(el, persona, personaId, opts) {
    this.opts = opts; this.baseId = personaId; this.basePersona = persona; this.persona = persona; this.id = personaId;
    this.mode = opts.mode === 'full' ? 'full' : opts.mode === 'inline' || opts.mode === 'floating' ? opts.mode : (el ? 'inline' : 'floating');
    this.theme = 'auto';   // every widget follows the page: one site-wide theme (html[data-sys-theme], localStorage 'bsp-theme', set from the frame's top bar)
    this.history = []; this.open = false; this.extra = null; this.ctx = null; this.busy = false; this.ctl = null; this.prompts = []; this.lastQ = ''; this.thread = null;
    this.root = document.createElement('div'); this.root.className = `ch ch-${this.mode}`;
    this.setAccent(); this.applyTheme();
    this.msgs = document.createElement('div'); this.msgs.className = 'ch-msgs';
    Object.entries({ role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation', 'aria-busy': 'false' }).forEach(([k, v]) => this.msgs.setAttribute(k, v));
    this.msgs.addEventListener('scroll', () => this.updateJump(), { passive: true });
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('keydown', e => this.onKey(e));
    this.bindPopover();
    if (this.mode === 'inline') { el.appendChild(this.root); this.renderInline(); }
    else if (this.mode === 'full') { el.appendChild(this.root); this.renderFull(); }
    else { document.body.appendChild(this.root); this.renderLauncher(); this.watchTuck(); if (opts.openOnLoad) this.togglePanel(true); }
    this.loadExtra(); this.watchTheme(); WIDGETS.add(this);
    if (opts.autoAsk) setTimeout(() => { this.ask(opts.autoAsk); if (this.mode === 'full') { try { const u = new URL(location.href); u.searchParams.delete('q'); history.replaceState(null, '', u); } catch { /* keep URL */ } } }, 600);
  }

  /* ── theme & chrome ── */
  isDark() {
    if (this.theme === 'dark') return true; if (this.theme === 'light') return false;
    const h = document.documentElement;
    if (h.dataset.theme === 'light' || h.dataset.sysTheme === 'light') return false;
    if (h.dataset.sysTheme === 'dark' || document.body.classList.contains('dark')) return true;
    const c = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    if (c.length < 3 || c[3] === 0) return false;
    return c[0] + c[1] + c[2] < 300;
  }
  applyTheme() {
    const d = this.isDark(); this.root.classList.toggle('ch-dark', d); this.pop?.classList.toggle('ch-dark', d);
    const t = this.root.querySelector('[data-a="theme"]'); if (t) { t.innerHTML = d ? I.sun : I.moon; t.setAttribute('aria-label', d ? 'Switch to light theme' : 'Switch to dark theme'); } }
  watchTheme() {
    if (this.theme !== 'auto' || !('MutationObserver' in window)) return;
    const mo = new MutationObserver(() => this.applyTheme());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-sys-theme', 'class'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  setAccent() { this.root.style.setProperty('--ch-accent', this.persona.color || '#d9622b'); }
  loadExtra() { const id = this.id; siteIntents(id).then(x => { if (this.id === id) this.extra = x; }).catch(() => { }); }
  fullHref() { return `${ROOT}assistant.html?persona=${encodeURIComponent(this.id)}${this.lastQ ? `&q=${encodeURIComponent(this.lastQ)}` : ''}`; }
  avatar(cls = '') { return `<span class="ch-avatar ch-avatar--logo ${cls}" aria-hidden="true"><img src="${logoOf(this.id)}" alt="" width="44" height="44" decoding="async"></span>`; }
  engineHTML() { return `<button type="button" class="ch-engine" data-a="settings" title="${esc(engineTip())}" aria-label="${esc(engineLabel())}. About this assistant">${hosted() || LLM.key() ? I.spark : I.db}<span class="ch-engine-t">${esc(engineLabel())}</span>${I.gear}</button>`; }
  /** One short line: where answers come from. */
  privacy() {
    return hosted() || LLM.key() ? 'Every answer shows its sources.' : 'Answers come from the portfolio data.';
  }
  footHTML() { return `${esc(this.privacy())}${DEV && !hosted() && !LLM.key() ? ' <a href="#" data-a="settings" data-adv="1">Add a model key</a>' : ''}`; }
  /** Backend discovery finished (or settings changed): update engine chips, privacy lines and synthesis actions in place. */
  refreshEngine() {
    const r = this.root;
    r.querySelectorAll('.ch-engine').forEach(b => b.replaceWith(Object.assign(document.createElement('div'), { innerHTML: this.engineHTML() }).firstElementChild));
    const ft = r.querySelector('.ch-compose .ch-foot span'); if (ft) ft.innerHTML = this.footHTML();
    const foot = r.querySelector('.ch-dock .ch-foot span'); if (foot) foot.textContent = this.privacy();
    const pv = r.querySelector('.ch-privacy span'); if (pv) pv.textContent = this.privacy();
    this.msgs.querySelectorAll('.ch-turn.bot').forEach(t => { const bar = t.querySelector('.ch-actions'); if (t._rec && bar && this.canSynth(t._rec) && !bar.querySelector('[data-act="synth"]')) bar.insertAdjacentHTML('beforeend', this.synthBtnHTML()); });
  }
  threadNote() { return stored() ? 'They are saved so you can come back to them.' : 'They stay in this browser.'; }
  canSynth(rec) { return hosted() && rec?.kind === 'grounded' && !rec.synth; }
  synthBtnHTML() { return `<button type="button" class="ch-synth-btn" data-act="synth" aria-label="Go deeper on this answer">${I.spark}<span>Go deeper</span></button>`; }

  headHTML() {
    return `<div class="ch-head">${this.avatar()}<div class="ch-head-t"><div class="ch-title">${esc(this.persona.name)}</div><div class="ch-sub"><span class="ch-dot" aria-hidden="true"></span><span class="ch-state">${this.busy ? 'Working' : 'Online'}</span>${this.engineHTML()}</div></div><div class="ch-ib"><button type="button" data-a="new" aria-label="New chat" data-tip="New chat">${I.compose}</button><a data-a="expand" href="${esc(this.fullHref())}" aria-label="Open full assistant" data-tip="Open full assistant">${I.expand}</a><button type="button" data-a="close" aria-label="Close assistant" data-tip="Close">${I.x}</button></div></div>`;
  }
  tbarHTML() { return `<div class="ch-tbar">${this.avatar('sm')}<b class="ch-tbar-n">${esc(this.persona.name)}</b>${this.engineHTML()}<span class="ch-sp"></span><button type="button" class="ch-ib-b" data-a="new" aria-label="New chat" data-tip="New chat">${I.compose}</button><a class="ch-ib-b" data-a="expand" href="${esc(this.fullHref())}" aria-label="Open full assistant" data-tip="Open full assistant">${I.expand}</a></div>`; }
  /** The page's own suggestion list (Chat.mount opts.suggestions), shown in full and in order; null when the page passed none. */
  ownSuggestions() { const o = this.opts?.suggestions; return this.id === this.baseId && Array.isArray(o) && o.length ? uniq(o.filter(Boolean)) : null; }
  chipsHTML() { const own = this.ownSuggestions(); return `<div class="ch-chips">${(own || uniq(this.persona.suggestions).slice(0, 5)).map(s => `<button type="button" class="ch-chip" data-prompt="${esc(s)}">${esc(s)}</button>`).join('')}</div>`; }
  composeHTML() {
    const mic = ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) ? `<button type="button" class="ch-btn mic" aria-label="Dictate a question" data-tip="Dictate">${I.mic}</button>` : '';
    return `<div class="ch-compose"><div class="ch-ac" role="listbox" aria-label="Suggestions" hidden></div><div class="ch-box"><textarea rows="1" placeholder="${esc(this.persona.placeholder || 'Ask anything…')}" aria-label="Message ${esc(this.persona.name)}" enterkeyhint="send"></textarea><div class="ch-tools"><span class="ch-sp"></span>${mic}<button type="button" class="ch-btn send" aria-label="Send" disabled><span class="i-send">${I.send}</span><span class="i-stop">${I.stop}</span></button></div></div>${this.mode === 'inline' ? `<div class="ch-foot">${I.lock}<span>${this.footHTML()}</span></div>` : ''}</div>`;
  }
  emptyHTML() {
    const full = this.mode === 'full'; const by = {};
    for (const s of uniq(this.persona.suggestions)) (by[groupOf(s)] ||= []).push(s);
    const groups = GROUPS.filter(g => by[g[0]]?.length);
    const per = full ? 3 : groups.length > 3 ? 1 : 2;
    const card = (s, g) => `<button type="button" class="ch-pc" data-prompt="${esc(s)}"><span class="ch-pc-k">${g[2]}<span>${g[1]}</span></span><span class="ch-pc-t">${esc(s)}</span></button>`;
    // A page that passes its own suggestions gets every one, in its order; the persona defaults only fill empty slots.
    const own = this.ownSuggestions(), slots = full ? 9 : 6;
    const list = own ? uniq([...own, ...uniq(this.persona.suggestions)]).slice(0, Math.max(own.length, slots)) : null;
    const body = list ? `<div class="ch-cards ch-cards-own">${list.map(s => card(s, GROUPS.find(g => g[0] === groupOf(s)))).join('')}</div>` : full ? groups.map(g => `<section class="ch-group" aria-label="${g[1]}"><h3 class="ch-group-h">${g[2]}<span>${g[1]}</span></h3><div class="ch-cards">${by[g[0]].slice(0, per).map(s => card(s, g)).join('')}</div></section>`).join('')
      : `<div class="ch-cards">${groups.flatMap(g => by[g[0]].slice(0, per).map(s => card(s, g))).slice(0, 6).join('')}</div>`;
    return `<div class="ch-empty">${full ? '' : ''}<div class="ch-hello">${this.avatar('lg')}<h2>${esc(full ? this.persona.name : 'How can I help?')}</h2><p>${esc(this.persona.greeting || '')}</p></div><div class="ch-groups${full ? '' : ' compact'}${list ? ' own' : ''}">${body}</div>${full ? '' : `<p class="ch-privacy">${I.lock}<span>${esc(this.privacy())}</span></p>`}</div>`;
  }
  showEmpty() { if (this.mode === 'inline') return; this.msgs.innerHTML = this.emptyHTML(); }

  renderLauncher() {
    if (this._tuck) setTimeout(this._tuck, 0);
    const who = this.persona.short || (this.persona.initials === 'BSP' ? 'the desk' : String(this.persona.name || 'us').split(' ')[0]);
    this.root.innerHTML = `<button type="button" class="ch-launch" aria-label="Ask ${esc(who)} (opens the ${esc(this.persona.name)} chat)" aria-haspopup="dialog"><span class="ch-launch-av ch-launch-av--logo" aria-hidden="true"><img src="${logoOf(this.id)}" alt="" width="34" height="34" decoding="async"></span><span>Ask ${esc(who)}</span><span class="ch-dot" aria-hidden="true"></span></button>`;
  }
  /* Phones (<=560px): the launcher steps aside while it would sit on top of a page button or link,
     and comes back once the user scrolls past it. Sampled with elementsFromPoint, throttled to one frame. */
  watchTuck() {
    if (this._tuckOn) return; this._tuckOn = true;
    const mq = window.matchMedia ? window.matchMedia('(max-width:560px)') : null;
    const HIT = 'a[href],button,[role=button],input,select,textarea,summary,label[for]';
    let raf = 0;
    const run = () => {
      raf = 0;
      const b = this.root.querySelector('.ch-launch'); if (!b) return;
      if (!mq || !mq.matches || this.open || b.contains(document.activeElement)) { b.classList.remove('ch-launch--tuck'); return; }
      const r = b.getBoundingClientRect(); if (!r.width) return;
      const pad = 6, xs = [r.left - pad, r.left + r.width / 2, r.right + pad - 1], ys = [r.top - pad, r.top + r.height / 2, r.bottom + pad - 1];
      let hit = false;
      for (const x of xs) for (const y of ys) {
        if (hit || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        for (const el of document.elementsFromPoint(x, y)) {
          if (this.root.contains(el)) continue;
          const t = el.closest(HIT); if (t && !this.root.contains(t)) { hit = true; break; }
        }
      }
      b.classList.toggle('ch-launch--tuck', hit);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(run); };
    document.addEventListener('scroll', kick, { passive: true, capture: true }); addEventListener('resize', kick, { passive: true });
    if (mq && mq.addEventListener) mq.addEventListener('change', kick);
    this._tuck = kick; kick(); setTimeout(kick, 400); setTimeout(kick, 1500);
  }
  togglePanel(open) {
    if (this.mode !== 'floating') { if (open) this.focus(); return; }
    const hadFocus = this.root.contains(document.activeElement);
    this.open = !!open;
    if (!open) { this.stopSpeech(); this.hidePop(); this.renderLauncher(); if (hadFocus) this.root.querySelector('.ch-launch')?.focus({ preventScroll: true }); return; }
    this.root.innerHTML = `<div class="ch-panel" role="dialog" aria-label="${esc(this.persona.name)}">${this.headHTML()}<div class="ch-body"><button type="button" class="ch-jump" data-a="jump" aria-label="Jump to latest" hidden>${I.arrowDown}</button></div>${this.composeHTML()}</div>`;
    $('.ch-body', this.root).prepend(this.msgs);
    if (!this.msgs.querySelector('.ch-turn')) this.showEmpty();
    this.bindComposer(); this.focus(); this.updateJump();
  }
  renderInline() {
    this.root.innerHTML = `${this.composeHTML()}${this.chipsHTML()}<div class="ch-thread">${this.tbarHTML()}</div>`;
    $('.ch-thread', this.root).appendChild(this.msgs);
    this.bindComposer();
  }
  renderFull() {
    const per = id => { const p = PERSONAS[id] || SITE_BASE[id]; return `<button type="button" class="ch-pp" data-persona="${id}" aria-pressed="${id === this.id}" style="--pc:${esc(p.color || '#d9622b')}"><span class="ch-avatar ch-avatar--logo xs" aria-hidden="true"><img src="${logoOf(id)}" alt="" width="22" height="22" decoding="async"></span><span>${esc(p.name)}</span></button>`; };
    this.root.innerHTML = `<div class="ch-app">
<aside class="ch-side" aria-label="Chats"><div class="ch-side-top"><a class="ch-brand" href="${ROOT}"><img src="${ROOT}BSP_Logo.png" alt="" width="28" height="28"><span><b>BSP Desk</b><small>Assistant</small></span></a><button type="button" class="ch-ib-b ch-only-m" data-a="menu" aria-label="Close sidebar">${I.x}</button></div>
<button type="button" class="ch-newchat" data-a="new">${I.compose}<span>New chat</span><kbd>${MOD}⇧O</kbd></button>
<div class="ch-side-sec ch-side-grow"><div class="ch-side-h">Recent</div><nav class="ch-threads" aria-label="Recent chats"></nav></div>
<div class="ch-side-sec"><div class="ch-side-h">Assistant</div><div class="ch-personas" role="group" aria-label="Choose an assistant">${PERSONA_ORDER.map(per).join('')}</div></div>
<nav class="ch-side-links" aria-label="Site"><a href="${APP}">Portal</a><a href="${ROOT}">Site</a><a href="${ROOT}redesigns/">Site concepts</a></nav></aside>
<div class="ch-scrim" data-a="menu" aria-hidden="true"></div>
<div class="ch-main"><header class="ch-top"><button type="button" class="ch-ib-b ch-only-m" data-a="menu" aria-label="Open sidebar">${I.menu}</button><div class="ch-top-t">${this.avatar('sm')}<span class="ch-top-n">${esc(this.persona.name)}</span></div><span class="ch-sp"></span>${this.engineHTML()}<button type="button" class="ch-ib-b" data-a="theme" aria-label="Switch theme" data-tip="Theme"></button></header>
<div class="ch-body"><button type="button" class="ch-jump" data-a="jump" aria-label="Jump to latest" hidden>${I.arrowDown}</button></div>
<div class="ch-dock">${this.composeHTML()}<p class="ch-foot">${I.lock}<span>${esc(this.privacy())}</span></p></div></div></div>`;
    $('.ch-body', this.root).prepend(this.msgs);
    this.applyTheme(); this.bindComposer(); this.showEmpty(); this.renderThreads();
    document.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); this.focus(); }
      else if (mod && e.shiftKey && k === 'o') { e.preventDefault(); this.newChat(); }
      else if (e.key === 'Escape' && this.busy) this.stop();
      else if (e.key === 'Escape' && this.root.classList.contains('ch-side-open')) this.root.classList.remove('ch-side-open');
    });
    setTimeout(() => this.focus(), 50);
  }
  /** Re-render persona- and engine-dependent chrome in place (persona switch, settings saved). */
  refreshChrome() {
    const r = this.root;
    r.querySelector('.ch-head')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: this.headHTML() }).firstElementChild);
    r.querySelector('.ch-tbar')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: this.tbarHTML() }).firstElementChild);
    r.querySelector('.ch-chips')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: this.chipsHTML() }).firstElementChild);
    r.querySelectorAll('.ch-engine').forEach(b => b.replaceWith(Object.assign(document.createElement('div'), { innerHTML: this.engineHTML() }).firstElementChild));
    const tt = r.querySelector('.ch-top-t'); if (tt) tt.innerHTML = `${this.avatar('sm')}<span class="ch-top-n">${esc(this.persona.name)}</span>`;
    r.querySelectorAll('.ch-pp').forEach(b => b.setAttribute('aria-pressed', b.dataset.persona === this.id));
    const ta = r.querySelector('textarea'); if (ta) { ta.placeholder = this.persona.placeholder || 'Ask anything…'; ta.setAttribute('aria-label', `Message ${this.persona.name}`); }
    const foot = r.querySelector('.ch-dock .ch-foot span'); if (foot) foot.textContent = this.privacy();
    const ft = r.querySelector('.ch-compose .ch-foot span'); if (ft) ft.innerHTML = this.footHTML();
    if (this.msgs.querySelector('.ch-empty')) this.showEmpty();
    if (this.mode === 'floating' && !this.open) this.renderLauncher();
    this.updateExpand();
  }
  /** The dataset count arrived from the manifest: update every rendered mention in place. */
  syncCount(old) {
    const rx = new RegExp(`\\b${old}(?= (verified |portfolio )?datasets)`, 'g');
    const w = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (rx.test(n.nodeValue)) { rx.lastIndex = 0; n.nodeValue = n.nodeValue.replace(rx, String(DATASETS)); }
    for (const attr of ['aria-label', 'title']) this.root.querySelectorAll(`[${attr}]`).forEach(e => { const v = e.getAttribute(attr); if (rx.test(v)) { rx.lastIndex = 0; e.setAttribute(attr, v.replace(rx, String(DATASETS))); } });
  }
  updateExpand() { this.root.querySelectorAll('[data-a="expand"]').forEach(a => { a.href = this.fullHref(); }); }
  focus() { const ta = this.root.querySelector('textarea'); if (!ta) return; if (this.mode === 'inline') ta.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); ta.focus({ preventScroll: this.mode === 'inline' }); }

  /* ── composer ── */
  bindComposer() {
    const r = this.root; const ta = $('textarea', r), send = $('.ch-btn.send', r), ac = $('.ch-ac', r); if (!ta) return;
    this.ta = ta; this.sendBtn = send;
    const max = this.mode === 'inline' ? 140 : 240;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(max, ta.scrollHeight) + 'px'; this.syncSend(); };
    this.grow = grow;
    let items = [], idx = -1, kind = 'q';
    const mark = () => ac.querySelectorAll('[data-i]').forEach((d, i) => { d.classList.toggle('on', i === idx); d.setAttribute('aria-selected', String(i === idx)); });
    const pick = i => { const it = items[i]; if (!it) return; ac.hidden = true; if (kind === 'cmd') { ta.value = ''; grow(); this.command(it.text); } else { ta.value = it.text; grow(); this.submit(); } };
    const showAc = () => {
      const q = ta.value.trim().toLowerCase(); if (!q) { ac.hidden = true; return; }
      if (q.startsWith('/')) { if (!DEV) { ac.hidden = true; idx = -1; items = []; return; } kind = 'cmd'; const c = q.split(/\s/)[0]; items = COMMANDS.filter(x => x[0].startsWith(c)).map(x => ({ text: x[0], sub: x[1] })); idx = Math.max(0, items.findIndex(x => x.text === c)); }
      else { kind = 'q'; const words = q.split(/\s+/); items = uniq(this.persona.suggestions).filter(s => { const l = s.toLowerCase(); return l.startsWith(q) || words.every(w => l.includes(w)); }).slice(0, 6).map(s => ({ text: s })); idx = 0; }
      if (!items.length) { ac.hidden = true; idx = -1; return; }
      ac.innerHTML = `<p class="ch-ac-h">${kind === 'cmd' ? 'Commands' : 'Suggestions'}</p>` + items.map((it, i) => { const k = it.text.toLowerCase().indexOf(q); const h = k >= 0 ? esc(it.text.slice(0, k)) + '<b>' + esc(it.text.slice(k, k + q.length)) + '</b>' + esc(it.text.slice(k + q.length)) : esc(it.text); return `<div role="option" data-i="${i}" aria-selected="false">${kind === 'cmd' ? I.slash : I.search}<span class="ch-ac-t">${h}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${i === 0 ? '<span class="k">Tab</span>' : ''}</div>`; }).join('');
      ac.hidden = false; mark();
      ac.querySelectorAll('[data-i]').forEach(d => { d.onmousedown = e => { e.preventDefault(); pick(+d.dataset.i); }; });
    };
    ta.oninput = () => { grow(); showAc(); };
    ta.onkeydown = e => {
      if (!ac.hidden && items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark(); return; }
      if (e.key === 'Tab' && !ac.hidden && idx >= 0) { e.preventDefault(); ta.value = items[idx].text; ac.hidden = true; grow(); return; }
      if (e.key === 'ArrowUp' && !ta.value && this.prompts.length) { e.preventDefault(); ta.value = this.prompts.at(-1); grow(); requestAnimationFrame(() => ta.setSelectionRange(ta.value.length, ta.value.length)); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!ac.hidden && idx >= 0 && (kind === 'cmd' || ta.value.trim().length < 3)) { pick(idx); return; } ac.hidden = true; this.submit(); return; }
      if (e.key === 'Escape') { e.stopPropagation(); if (!ac.hidden) { ac.hidden = true; return; } if (this.busy) { this.stop(); return; } if (this.mode === 'floating') this.togglePanel(false); }
    };
    ta.onblur = () => setTimeout(() => { ac.hidden = true; }, 150);
    ta.addEventListener('focus', () => { backend(); }, { once: true });
    send.onclick = () => (this.busy ? this.stop() : this.submit());
    const mic = $('.ch-btn.mic', r); if (mic) mic.onclick = () => this.listen(ta, mic, grow);
    const att = $('.ch-btn.attach', r); if (att) att.onclick = e => { e.preventDefault(); att.classList.add('tip-on'); clearTimeout(att._t); att._t = setTimeout(() => att.classList.remove('tip-on'), 1800); };
    grow();
  }
  syncSend() { const b = this.sendBtn; if (!b) return; b.disabled = !this.busy && !(this.ta?.value || '').trim(); b.setAttribute('aria-label', this.busy ? 'Stop generating' : 'Send'); b.dataset.tip = this.busy ? 'Stop' : ''; }
  setBusy(on) { this.busy = on; this.root.classList.toggle('ch-busy', on); const s = this.root.querySelector('.ch-state'); if (s) s.textContent = on ? 'Working' : 'Online'; this.syncSend(); }
  submit() { const ta = this.ta; const q = (ta?.value || '').trim(); if (!q || this.busy) return; ta.value = ''; this.grow?.(); if (q.startsWith('/') && this.command(q)) return; this.ask(q); }
  command(text) {
    const c = String(text).trim().split(/\s+/)[0].toLowerCase(); const hit = COMMANDS.find(x => x[0] === c); if (!hit) return false;
    if (hit[2]) this.setPersona(hit[2]); else if (c === '/key') this.settings(); else this.newChat();
    return true;
  }
  listen(ta, btn, grow) { const R = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new R(); rec.lang = 'en-US'; rec.interimResults = true; btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); rec.onresult = e => { ta.value = Array.from(e.results).map(x => x[0].transcript).join(''); grow(); }; rec.onend = () => { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); if (ta.value.trim()) this.submit(); }; rec.onerror = () => { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); }; rec.start(); }

  /* ── conversation ── */
  setPersona(id, { fresh = true } = {}) {
    if (!(PERSONAS[id] || SITE_BASE[id])) return false;
    this.id = id; this.persona = id === this.baseId ? this.basePersona : resolvePersona(id);
    this.setAccent(); this.extra = null; this.loadExtra();
    if (fresh) this.newChat();
    this.refreshChrome();
    if (this.mode === 'full') { try { const u = new URL(location.href); u.searchParams.set('persona', id); history.replaceState(null, '', u); } catch { /* keep URL */ } }
    return true;
  }
  newChat() {
    if (this.busy) this.stop(); this.stopSpeech(); this.hidePop();
    this.history = []; this.ctx = null; this.thread = null; this.lastQ = '';
    this.msgs.innerHTML = '';
    if (this.mode === 'inline') this.root.querySelector('.ch-thread')?.classList.remove('open'); else this.showEmpty();
    if (this.mode === 'full') { this.renderThreads(); this.root.classList.remove('ch-side-open'); }
    this.updateExpand(); this.updateJump(); this.focus();
  }
  stop() { if (this.ctl) this.ctl.stopped = true; try { BE?.abort(); } catch { /* nothing in flight */ } }
  userTurn(q) { const d = document.createElement('div'); d.className = 'ch-turn user'; d.innerHTML = `<div class="ch-ubox">${esc(q)}</div>`; return d; }
  botShell() {
    this.msgs.querySelectorAll('.ch-turn.bot').forEach(t => { t.style.minHeight = ''; });
    const d = document.createElement('div'); d.className = 'ch-turn bot';
    d.innerHTML = `${this.avatar('sm')}<div class="ch-col"><div class="ch-note" hidden></div><div class="ch-status" role="status" hidden></div><div class="ch-answer"></div><div class="ch-synth" hidden></div><div class="ch-after"></div></div>`;
    return d;
  }
  async ask(q) {
    q = String(q ?? '').trim(); if (!q) return;
    backend();
    if (this.busy) { this.stop(); const t0 = now(); while (this.busy && now() - t0 < 2000) await sleep(40); }
    if (q.startsWith('/') && this.command(q)) return;
    if (this.mode === 'inline') this.root.querySelector('.ch-thread')?.classList.add('open');
    else if (this.mode === 'floating' && !this.open) this.togglePanel(true);
    this.msgs.querySelector('.ch-empty')?.remove();
    this.lastQ = q; if (this.prompts.at(-1) !== q) this.prompts.push(q); this.updateExpand();
    const u = this.userTurn(q), turn = this.botShell();
    this.msgs.append(u, turn);
    this.history.push({ role: 'user', html: esc(q), text: q });
    if (this.msgs.querySelectorAll('.ch-turn.user').length > 1 || this.mode !== 'inline') turn.style.minHeight = Math.max(0, this.msgs.clientHeight - u.offsetHeight - 56) + 'px';
    this.msgs.scrollTo({ top: Math.max(0, u.offsetTop - 14), behavior: reduced() ? 'auto' : 'smooth' });
    const rec = await this.answer(q, turn);
    if (rec) { this.history.push({ role: 'assistant', html: rec.html, text: plain(rec.html) }); this.saveTurn(q, rec); this.logAnswer(q, rec); }
    return rec;
  }
  /** Answers built in the browser go to the chat log; the hosted research agent logs its own on the server. */
  logAnswer(q, rec) {
    if (rec.kind === 'claude' && rec.via === 'hosted') return;
    backend().then(B => B?.log?.({ persona: this.id, question: q, read_as: rec.eq || '', kind: rec.kind, intent: rec.intent || '', engine: rec.engine || '', note: rec.note || '',
      answer: logText(rec.html), sources: (rec.sources || []).slice(0, 30).map(s => ({ label: String(s.label || ''), href: s.href || '' })), seconds: rec.meta?.elapsed ?? null })).catch(() => {});
  }
  note(turn, fu) { const n = turn.querySelector('.ch-note'); n.hidden = false; n.innerHTML = `<span aria-hidden="true">↳</span> Continuing from “${esc(fu.from)}” <span class="ch-note-q">· read as “${esc(fu.q)}”</span>`; }
  /** The answer pipeline: intent → (follow-up resolution) → retrieval → optional Claude. Returns a serialisable record. */
  async answer(q, turn) {
    this.setBusy(true); const ctl = this.ctl = { stopped: false };
    const body = turn.querySelector('.ch-answer');
    const st = new Status(turn.querySelector('.ch-status')); const tr = new Tracker(t => st.push(t));
    const prev = ACTIVE; ACTIVE = { progress: t => st.push(t) }; TRACK = tr;
    st.push('Understanding the question');
    const beP = backend();   // discovery runs alongside the grounded engine; it never blocks an intent answer
    try {
      const intents = [...(this.extra || []), ...(this.persona.intents || [])];
      const match = s => intents.find(i => (i.rx || []).some(rx => rx.test(s)));
      let hit = match(q), eq = q, fu = null;
      if (!hit) { fu = resolveFollowUp(q, this.ctx); if (fu) { eq = fu.q; hit = match(eq); this.note(turn, fu); } }
      st.push('Searching the portfolio data');
      if (hit && LLM.key() && LLM.always()) await beP;   // "always use Claude" applies to the personal key only when no backend is live
      // Writing-style requests (notes, memos, comparisons, opinions) go to hosted Claude with retrieved context, even when a data keyword matches.
      const generative = GENERATIVE_RX.test(q) && !/^(open|show|which|how many|list|where|when|who)\b/i.test(q.trim());
      // Deal maths goes to the hosted assistant when it is live: it runs the same acquisition model with each target's own estimates.
      const hostedFirst = !!hit && HOSTED_FIRST.has(hit.id);
      if (generative || hostedFirst) await beP;
      const skipIntent = !!(LLM.key() && LLM.always() && !hosted()) || ((generative || hostedFirst) && hosted());
      let res = null;
      if (hit && !skipIntent) { try { res = await hit.run(eq, { progress: t => st.push(t), persona: this.persona, history: this.history, context: this.ctx }); } catch (e) { console.warn('intent failed', hit.id, e); res = null; } }
      if (ctl.stopped) return this.stopped(turn, st, q);
      if (res) {
        TRACK = null;
        const rec = { kind: 'grounded', q, eq: eq !== q ? eq : undefined, note: fu?.from, html: res.html, links: res.links || [], followups: res.followups || [], sources: tr.list(), intent: hit.id, engine: GROUNDED() };
        await st.settle();
        if (ctl.stopped) return this.stopped(turn, st, q);
        this.prepare(body, rec); rec.meta = st.finish(rec.sources.length, 'Answered', rec.engine, groundedTip());
        await this.present(turn, rec, ctl, st.t0);
        this.ctx = { q: eq, intent: hit.id, co: coOf(eq) || (COS[this.id] ? this.id : null) || CO_DEFAULT[hit.id] || (/pay ?back|fastest/i.test(eq) ? 'pp' : null) || this.ctx?.co || null, st: stateOf(eq) || (hit.id === 'national' ? stateAny(eq) : null) };
        if (res.go && this.mode === 'inline' && !ctl.stopped) setTimeout(() => { location.href = res.go; }, 900);
        return rec;
      }
      // No grounded intent: precomputed deep dive → hosted Claude → your key (only without a backend) → retrieval.
      const B = await beP;
      if (ctl.stopped) return this.stopped(turn, st, q);
      if (B) {
        let pre = null; try { pre = await B.precomputed(eq); } catch (e) { console.debug('deep dives unavailable', e?.message || e); }
        if (ctl.stopped) return this.stopped(turn, st, q);
        if (pre) return await this.deepDive(q, eq, fu, turn, st, pre, ctl);
      }
      let warn = '';
      if (hosted()) {   // the hosted assistant searches its own knowledge base; the local datasets are the fallback
        TRACK = null;
        const r = await this.claude(q, turn, st, [], [], [], ctl, 'hosted'); if (r.rec) return r.rec;
        if (ctl.stopped) return this.stopped(turn, st, q);
        warn = `<p class="ch-warn">${esc(r.error)}</p>`;
      }
      const docs = await retrieve(eq, this.persona); TRACK = null;
      if (ctl.stopped) return this.stopped(turn, st, q);
      const sources = [], sIdx = docs.map(d => { const s = this.docSource(d); let k = sources.findIndex(x => x.label === s.label && x.href === s.href); if (k < 0) { sources.push(s); k = sources.length - 1; } return k; });
      if (!hosted() && LLM.key()) {
        const r = await this.claude(q, turn, st, docs, sources, sIdx, ctl, 'key'); if (r.rec) return r.rec;
        if (ctl.stopped) return this.stopped(turn, st, q);
        warn = `<p class="ch-warn">Deep research didn't answer (${esc(r.error)}), so here is the closest I've got from our data.</p>`;
      }
      const faq = docs.find(d => d.faq);
      const qt = tok(eq), hay = new Set(tok(docs.map(d => `${d.t} ${d.s}`).join(' ')));
      const cover = qt.length ? qt.filter(w => hay.has(w) || (w.length > 4 && [...hay].some(x => x.startsWith(w.slice(0, -1))))).length / qt.length : 0;
      const offerKey = DEV && !BE?.endpoint && !LLM.key();
      const keyHint = offerKey ? `<p class="ch-hint">For questions outside the portfolio data, <a href="#" data-a="settings" data-adv="1">add a model key</a> and the assistant answers with this context.</p>` : '';
      const intro = cover >= 0.75 ? '<p>Here is what we have on that in the portal:</p>' : `<p>I don't have a direct answer in our data, but this is the closest I've got:</p>`;
      const html = warn + (docs.length ? (faq ? faq.html : `${intro}<ul>${docs.map((d, i) => `<li><b>${esc(sources[sIdx[i]].label)}</b> <span class="ch-ref" data-src="${sIdx[i]}">${sIdx[i] + 1}</span> — ${esc(clip(terms(d.s), 180))}</li>`).join('')}</ul>${cover < 0.75 ? keyHint : ''}`) : `<p>I couldn't find that in the portal's datasets.${offerKey ? ' Try one of these, or <a href="#" data-a="settings" data-adv="1">add a model key</a> for open questions.' : ' Try one of these.'}</p>`);
      const rec = { kind: 'retrieval', q, eq: eq !== q ? eq : undefined, note: fu?.from, html, links: sources.filter(s => s.href).slice(0, 3).map(s => link(s.href, s.label)), followups: uniq(this.persona.suggestions).filter(s => !sameQ(s, q) && !sameQ(s, eq)).slice(0, docs.length ? 2 : 3), sources: docs.length ? sources : [], engine: GROUNDED() };
      await st.settle();
      if (ctl.stopped) return this.stopped(turn, st, q);
      this.prepare(body, rec); rec.meta = st.finish(rec.sources.length, 'Answered', rec.engine, groundedTip());
      await this.present(turn, rec, ctl, st.t0);
      this.ctx = { q: eq, intent: null, co: coOf(eq) || this.ctx?.co || (COS[this.id] ? this.id : null), st: stateOf(eq) };
      return rec;
    } catch (e) {
      console.warn('chat failed', e);
      const rec = { kind: 'error', q, html: '<p>Something went wrong with that answer. Please try again.</p>', links: [], followups: [], sources: [] };
      this.prepare(body, rec); rec.meta = st.finish(0, 'Failed'); this.renderAfter(turn, rec); return rec;
    } finally { TRACK = null; ACTIVE = prev; this.ctl = null; this.msgs.setAttribute('aria-busy', 'false'); this.setBusy(false); }
  }
  /** Serve a precomputed Claude deep dive (data/answers) with its own sources and a dated badge. */
  async deepDive(q, eq, fu, turn, st, pre, ctl) {
    TRACK = null; st.push('Opening a prepared answer');
    const sources = (pre.sources || []).map(x => {
      const key = x.dataset ? srcKey(x.dataset) : null; const known = key && SRC[key];
      const base = known ? srcOf(key) : { key: null, label: terms(x.name), desc: '', href: null, kind: 'dataset', at: Date.now() };
      return { ...base, label: base.label || terms(x.name), kind: 'dataset', asOf: x.as_of ? String(x.as_of).slice(0, 10) : base.asOf || AS_OF_DEFAULT };
    });
    const when = pre.generated_at ? Fmt.date(String(pre.generated_at).slice(0, 10)) : '';
    const engine = PREPARED, tip = `Prepared in advance by ${modelName(pre.model || MODEL_DEFAULT)} from the portfolio data${when ? ` on ${when}` : ''}`;
    const rec = { kind: 'deep', q, eq: eq !== q ? eq : undefined, note: fu?.from, html: pre.html, links: sources.filter(s => s.href).slice(0, 3).map(s => link(s.href, s.label)), followups: uniq(this.persona.suggestions).filter(s => !sameQ(s, q) && !sameQ(s, eq) && !sameQ(s, pre.question)).slice(0, 3), sources, engine, model: pre.model || null };
    await st.settle();
    if (ctl.stopped) return this.stopped(turn, st, q);
    this.prepare(turn.querySelector('.ch-answer'), rec); rec.meta = st.finish(rec.sources.length, 'Answered', engine, tip);
    await this.present(turn, rec, ctl, st.t0);
    this.ctx = { q: eq, intent: null, co: coOf(eq) || this.ctx?.co || (COS[this.id] ? this.id : null), st: stateOf(eq) };
    return rec;
  }
  stopped(turn, st, q) { const rec = { kind: 'stopped', q, html: '<p class="ch-stopped">Stopped before answering.</p>', links: [], followups: [], sources: [] }; this.prepare(turn.querySelector('.ch-answer'), rec); rec.meta = st.finish(0, 'Stopped'); this.renderAfter(turn, rec); return rec; }
  docSource(d) {
    const m = /^(.+?) · insight$/.exec(d.t || '');
    if (m) { const s = srcOf(m[1].trim().replace(/\s+/g, '_')); return { ...s, kind: 'insight', desc: clip(terms(String(d.s || '').split(/(?<=[.;])\s/)[0]), 170), href: d.href || s.href }; }
    return { key: null, label: d.t, desc: clip(terms(d.s), 170), href: d.href || null, kind: d.faq ? 'faq' : 'page' };
  }
  /** Put the answer HTML in place, humanize identifiers, number citations; links become page sources when nothing else was read. */
  prepare(body, rec) {
    body.innerHTML = rec.html; polishAnswer(body, rec.sources);
    if (!rec.sources.length) for (const l of linksOf(rec.links).slice(0, 2)) rec.sources.push({ key: null, label: l.label, desc: l.href.includes('app.html') ? 'Portal view with the full table, map and sources' : 'Page with the full plan and its sources', href: l.href, kind: 'page' });
    rec.html = body.innerHTML;
  }
  async present(turn, rec, ctl, t0) {
    this.msgs.setAttribute('aria-busy', 'true'); turn.classList.add('ch-streaming');
    const body = turn.querySelector('.ch-answer'); const cut = await reveal(body, ctl);
    turn.classList.remove('ch-streaming');
    if (cut) { body.insertAdjacentHTML('beforeend', '<p class="ch-stopped">Stopped.</p>'); rec.html = body.innerHTML; rec.meta = { ...rec.meta, label: 'Stopped', elapsed: t0 ? (now() - t0) / 1000 : rec.meta?.elapsed || 0 }; Status.render(turn.querySelector('.ch-status'), rec.meta); }
    this.renderAfter(turn, rec); this.msgs.setAttribute('aria-busy', 'false');
  }
  /** Stream an open question from Claude, hosted (via: 'hosted') or with the visitor's key (via: 'key'), grounded on retrieved docs. */
  async claude(q, turn, st, docs, sources, sIdx, ctl, via) {
    const body = turn.querySelector('.ch-answer'); const isHosted = via === 'hosted';
    let model = isHosted ? (BE.model || MODEL_DEFAULT) : LLM.model();
    let srv = false;   // true once the hosted assistant sends its own numbered sources
    const refOf = n => srv ? (n >= 1 && n <= sources.length ? n - 1 : null) : (n >= 1 && n <= sIdx.length ? sIdx[n - 1] : null);
    const hist = this.history.slice(0, -1).map(h => ({ role: h.role, content: h.text }));
    st.push(isHosted && !docs.length ? 'Searching the knowledge base' : docs.length ? `Researching with ${docs.length} source${docs.length === 1 ? '' : 's'} from the portfolio data` : 'Researching');
    let stream, started = false; const think = new Think(turn);
    if (isHosted) {
      stream = BE.chat({ persona: this.id, messages: hist, question: q, context: docs.map((d, i) => ({ title: sources[sIdx[i]]?.label || d.t, text: terms(d.s), href: d.href || '' })), onEvent: ev => {
        if (ev.type === 'meta' && ev.model) { if (ev.fallback) st.push('Switching to a backup model'); model = ev.model; }
        else if (ev.type === 'done' && ev.model) model = ev.model;
        else if (ev.type === 'sources' && Array.isArray(ev.sources)) { srv = true; sources.length = 0; for (const s of ev.sources) sources.push(srvSource(s)); }
        else if (ev.type === 'status' && ev.text && !started) { st.push(String(ev.text)); think.step(String(ev.text)); }
        else if (ev.type === 'thinking' && ev.text && !started) think.text(String(ev.text));
      } });
    } else {
      const ctxText = docs.map((d, i) => `[${i + 1}] ${sources[sIdx[i]]?.label || d.t}: ${terms(d.s)}`).join('\n');
      const sys = `You are ${this.persona.name}, an assistant embedded in ${this.id === 'portal' ? "BSP Desk, the portal of BSP (a private-equity firm in New York; portfolio: Commonwealth Electrical Technologies, Punctual Pros, Frontline Managed Services, Thomas Scientific, Bully Pulpit International, Fair Harbor)" : `the website of ${this.persona.name.replace(/ (assistant|desk|advisor|concierge|helper)$/i, '')}`}. Answer briefly in markdown (headings of six words or fewer, bullets, bold numbers). Ground every claim in the numbered context below and cite it inline as [1], [2]; if the context does not cover it, say so and point to the most relevant portal view. Say "growth plan" rather than "playbook", and "portfolio company" rather than "platform" for a sponsor's company ("platform" is fine for software). Never print dataset identifiers or underscores; use the plain-English names in the context. Write dates in words (Oct 6, 2026). No greetings or addressing anyone by name. Label estimates "est.". Today is ${new Date().toDateString()}.\n\nCONTEXT:\n${ctxText}`;
      stream = LLM.stream(sys, hist, q);
    }
    const caret = document.createElement('span'); caret.className = 'ch-caret'; caret.setAttribute('aria-hidden', 'true');
    let acc = '', err = ''; this.msgs.setAttribute('aria-busy', 'true'); turn.classList.add('ch-streaming');
    try {
      for await (const t of stream) {
        if (!started) { started = true; think.close(); st.push('Writing the answer'); }
        acc += t; body.innerHTML = mdLite(terms(acc), refOf); (body.lastElementChild || body).appendChild(caret);
        if (ctl.stopped) break;
      }
    } catch (e) { err = e?.message || String(e); }
    caret.remove(); turn.classList.remove('ch-streaming'); think.close();
    if (!acc) { body.innerHTML = ''; this.msgs.setAttribute('aria-busy', 'false'); return { error: ctl.stopped ? 'Stopped.' : err || 'No answer came back. Try again.' }; }
    const engine = isHosted ? hostedLabel(model) : keyLabel(model);
    const rec = { kind: 'claude', via, q, html: mdLite(terms(acc), refOf) + (ctl.stopped ? '<p class="ch-stopped">Stopped.</p>' : '') + (err && !ctl.stopped ? `<p class="ch-warn">${esc(err)}</p>` : ''), links: sources.filter(s => s.href).slice(0, 3).map(s => link(s.href, s.label)), followups: [], sources, model, engine, think: think.record() };
    this.prepare(body, rec); rec.meta = st.finish(rec.sources.length, ctl.stopped ? 'Stopped' : 'Answered', engine, claudeTip(model));
    this.renderAfter(turn, rec); this.msgs.setAttribute('aria-busy', 'false');
    this.ctx = { q, intent: null, co: coOf(q) || this.ctx?.co || null, st: stateOf(q) };
    return { rec };
  }
  /** "Expand with Claude": a short hosted synthesis grounded on a grounded answer's text and its citations. */
  async synth(turn, rec, btn) {
    if (this.busy || !hosted() || rec.synth) return;
    const box = turn.querySelector('.ch-synth'); if (!box) return;
    const S = rec.sources || []; let model = BE.model || MODEL_DEFAULT;
    box.hidden = false; box.innerHTML = this.synthHead(model) + '<div class="ch-synth-body"><p class="ch-synth-wait"><span class="ch-spin" aria-hidden="true"></span>Expanding on this answer and its sources…</p></div>';
    const out = box.querySelector('.ch-synth-body'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    this.setBusy(true); const ctl = this.ctl = { stopped: false }; this.msgs.setAttribute('aria-busy', 'true');
    const question = rec.eq || rec.q || '';
    const context = [{ title: `Grounded answer to: ${question}`, text: plain(rec.html).slice(0, 6000), href: '' }, ...S.slice(0, 14).map(s => ({ title: s.label, text: `${s.desc || s.label} (${kindText(s)}, ${asOfText(s)})`, href: s.href || '' }))];
    const ask = `Synthesize the grounded answer in source [1] to the question "${question}" in 4 to 6 sentences for a BSP partner: lead with the decision it supports, then the two or three numbers that matter most (label estimates est.), then the biggest caveat or open question. Use only the sources and cite them inline as [n].`;
    const refOf = k => (k >= 2 && k - 2 < S.length ? k - 2 : null);
    const caret = document.createElement('span'); caret.className = 'ch-caret'; caret.setAttribute('aria-hidden', 'true');
    let acc = '', err = '';
    try {
      for await (const t of BE.chat({ persona: this.id, messages: [], context, question: ask, retrieve: false, onEvent: ev => { if (ev.type === 'meta' && ev.model) model = ev.model; } })) {
        acc += t; out.innerHTML = mdLite(terms(acc), refOf); (out.lastElementChild || out).appendChild(caret);
        if (ctl.stopped) break;
      }
    } catch (e) { err = e?.message || String(e); }
    finally { caret.remove(); this.ctl = null; this.setBusy(false); this.msgs.setAttribute('aria-busy', 'false'); btn.removeAttribute('aria-busy'); }
    if (!acc) {
      out.innerHTML = ctl.stopped ? '<p class="ch-stopped">Stopped before the synthesis started.</p>' : `<p class="ch-warn">${esc(err || 'Nothing came back.')} The answer above still stands.</p>`;
      btn.disabled = false; return;
    }
    out.innerHTML = mdLite(terms(acc), refOf) + (ctl.stopped ? '<p class="ch-stopped">Stopped.</p>' : '') + (err && !ctl.stopped ? `<p class="ch-warn">${esc(err)}</p>` : '');
    box.querySelector('.ch-synth-h').outerHTML = this.synthHead(model);
    rec.synth = { html: out.innerHTML, model }; btn.remove();
    if (this.thread) { const i = [...this.msgs.querySelectorAll('.ch-turn.bot')].indexOf(turn); const bots = this.thread.turns.filter(t => t.role === 'assistant'); if (bots[i]?.rec) { bots[i].rec.synth = rec.synth; this.persistThread(); } }
  }
  synthHead(model) { return `<div class="ch-synth-h" title="${esc(claudeTip(model))}">${I.spark}<span>Deeper research</span></div>`; }
  citeHTML(s, i) { const tag = s.href ? 'a' : 'span'; return `<${tag} class="ch-cite" data-src="${i}" ${s.href ? `href="${esc(s.href)}"` : 'tabindex="0"'} aria-label="Source ${i + 1}: ${esc(s.label)}"><span class="n">${i + 1}</span><span class="t">${esc(s.label)}</span></${tag}>`; }
  fbKey(rec) { return hash(`${this.id}|${rec.q}|${String(rec.html).slice(0, 400)}`); }
  renderAfter(turn, rec) {
    turn._rec = rec;
    const S = rec.sources || []; const first = linksOf(rec.links)[0]?.href || S.find(s => s.href)?.href;
    const fb = lsGet(FB_LS, {})[this.fbKey(rec)]?.v;
    const cites = S.length ? `<div class="ch-cites">${S.slice(0, S.length > 6 ? 5 : 6).map((s, i) => this.citeHTML(s, i)).join('')}${S.length > 6 ? `<button type="button" class="ch-cite more" data-a="sources" aria-label="Show all ${S.length} sources">+${S.length - 5} more</button>` : ''}</div>` : '';
    const details = S.length ? `<details class="ch-sources"><summary>${I.db}<span>Sources</span><span class="ch-count">${S.length}</span>${I.chev}</summary><ol>${S.map((s, i) => `<li><span class="n">${i + 1}</span><div><div class="t">${s.href ? `<a href="${esc(s.href)}" data-src="${i}">${esc(s.label)}</a>` : esc(s.label)}</div>${s.desc ? `<div class="d">${esc(s.desc)}</div>` : ''}<div class="m">${esc(kindText(s))} · ${esc(asOfText(s))}</div></div></li>`).join('')}</ol></details>` : '';
    const links = rec.links?.length ? `<div class="ch-links">${rec.links.join('')}</div>` : '';
    const speak = 'speechSynthesis' in window ? `<button type="button" data-act="speak" aria-pressed="false" aria-label="Read aloud" data-tip="Read aloud">${I.speak}</button>` : '';
    const actions = rec.kind === 'static' ? '' : `<div class="ch-actions" role="toolbar" aria-label="Answer actions"><button type="button" data-act="copy" aria-label="Copy answer" data-tip="Copy">${I.copy}</button><button type="button" data-act="regen" aria-label="Regenerate answer" data-tip="Regenerate">${I.regen}</button>${speak}${first ? `<a data-act="open" href="${esc(first)}" aria-label="${/app\.html/.test(first) ? 'Open in portal' : 'Open page'}" data-tip="${/app\.html/.test(first) ? 'Open in portal' : 'Open page'}">${I.open}</a>` : ''}<span class="ch-act-sep" aria-hidden="true"></span><button type="button" data-act="good" aria-pressed="${fb === 'good'}" aria-label="Good answer" data-tip="Good answer">${I.up}</button><button type="button" data-act="bad" aria-pressed="${fb === 'bad'}" aria-label="Bad answer" data-tip="Bad answer">${I.down}</button>${this.canSynth(rec) ? this.synthBtnHTML() : ''}</div>`;
    const fus = uniq(rec.followups || []).filter(f => !sameQ(f, rec.q) && !sameQ(f, rec.eq));
    const fu = fus.length ? `<div class="ch-follow"><div class="ch-follow-h">Related</div>${fus.map(f => `<button type="button" class="ch-fu" data-prompt="${esc(f)}"><span>${esc(f)}</span>${I.plus}</button>`).join('')}</div>` : '';
    turn.querySelector('.ch-after').innerHTML = cites + details + links + actions + fu;
    this.msgs.querySelectorAll('.ch-turn.bot.last').forEach(t => t !== turn && t.classList.remove('last')); turn.classList.add('last');
    this.updateJump();
  }
  /** Backwards-compatible: append a static assistant message. */
  bot(html, links = [], silent = false, followups = []) {
    this.msgs.querySelector('.ch-empty')?.remove();
    const turn = this.botShell(); this.msgs.appendChild(turn);
    const rec = { kind: 'static', html, links, followups, sources: [] }; this.prepare(turn.querySelector('.ch-answer'), rec); this.renderAfter(turn, rec);
    if (!silent) this.history.push({ role: 'assistant', html, text: plain(html) });
    return turn;
  }

  /* ── message actions ── */
  async act(btn, e) {
    const turn = btn.closest('.ch-turn'); const rec = turn?._rec; const a = btn.dataset.act; if (!rec) return;
    if (a === 'open') return;   // plain link
    e.preventDefault();
    if (a === 'copy') {
      const txt = plain(rec.html) + (rec.synth?.html ? `\n\nDeeper research\n${plain(rec.synth.html)}` : '') + (rec.sources?.length ? `\n\nSources\n${rec.sources.map((s, i) => `[${i + 1}] ${s.label}${s.href ? ` — ${s.href}` : ''}`).join('\n')}` : '');
      let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch { const t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } t.remove(); }
      btn.innerHTML = ok ? I.check : I.copy; btn.dataset.tip = ok ? 'Copied' : 'Copy failed'; btn.classList.add('tip-on');
      setTimeout(() => { btn.innerHTML = I.copy; btn.dataset.tip = 'Copy'; btn.classList.remove('tip-on'); }, 1600);
    } else if (a === 'regen') {
      if (this.busy) return;
      const q = rec.q; if (!q) return;
      this.stopSpeech(); turn.querySelector('.ch-note').hidden = true; turn.querySelector('.ch-after').innerHTML = ''; turn.querySelector('.ch-answer').innerHTML = ''; const sy = turn.querySelector('.ch-synth'); if (sy) { sy.hidden = true; sy.innerHTML = ''; }
      const isLast = turn === [...this.msgs.querySelectorAll('.ch-turn.bot')].at(-1);
      if (isLast && this.history.at(-1)?.role === 'assistant') this.history.pop();
      const r = await this.answer(q, turn);
      if (r && isLast) this.history.push({ role: 'assistant', html: r.html, text: plain(r.html) });
      if (r && this.thread) { const i = [...this.msgs.querySelectorAll('.ch-turn.bot')].indexOf(turn); const bots = this.thread.turns.filter(t => t.role === 'assistant'); if (bots[i]) bots[i].rec = r; this.persistThread(); }
    } else if (a === 'speak') {
      const ss = window.speechSynthesis; if (!ss) return;
      if (btn.getAttribute('aria-pressed') === 'true') { this.stopSpeech(); return; }
      this.stopSpeech(); const u = new SpeechSynthesisUtterance(plain(rec.html).slice(0, 4000)); u.lang = 'en-US';
      u.onend = u.onerror = () => { btn.setAttribute('aria-pressed', 'false'); btn.dataset.tip = 'Read aloud'; };
      btn.setAttribute('aria-pressed', 'true'); btn.dataset.tip = 'Stop reading'; this.speaking = btn; ss.speak(u);
    } else if (a === 'synth') {
      await this.synth(turn, rec, btn);
    } else if (a === 'good' || a === 'bad') {
      const all = lsGet(FB_LS, {}); const k = this.fbKey(rec); const on = btn.getAttribute('aria-pressed') !== 'true';
      if (on) all[k] = { v: a, q: rec.q, persona: this.id, at: new Date().toISOString() }; else delete all[k];
      lsSet(FB_LS, all);
      if (on && stored()) BE.feedback({ thread_id: this.thread?.id || null, message_id: k, rating: a === 'good' ? 1 : -1, question: rec.q || '', answer_excerpt: plain(rec.html).slice(0, 1000) }).catch(err => console.debug('feedback kept on this device only', err?.message || err));
      turn.querySelectorAll('[data-act="good"],[data-act="bad"]').forEach(b => b.setAttribute('aria-pressed', String(on && b.dataset.act === a)));
      btn.dataset.tip = on ? (stored() ? 'Thanks — feedback saved' : 'Thanks — saved on this device') : (a === 'good' ? 'Good answer' : 'Bad answer'); btn.classList.add('tip-on'); setTimeout(() => { btn.classList.remove('tip-on'); btn.dataset.tip = a === 'good' ? 'Good answer' : 'Bad answer'; }, 1600);
    }
  }
  stopSpeech() { try { if (this.speaking) { window.speechSynthesis?.cancel(); this.speaking.setAttribute('aria-pressed', 'false'); this.speaking = null; } } catch { /* no speech */ } }

  /* ── citations hover card ── */
  bindPopover() {
    const show = el => {
      const s = el.closest('.ch-turn')?._rec?.sources?.[+el.dataset.src]; if (!s) return;
      clearTimeout(this._popT);
      if (!this.pop) { this.pop = document.createElement('div'); this.pop.className = 'ch ch-pop'; this.pop.setAttribute('role', 'tooltip'); this.pop.id = `ch-pop-${Math.random().toString(36).slice(2, 8)}`; this.pop.addEventListener('mouseenter', () => clearTimeout(this._popT)); this.pop.addEventListener('mouseleave', () => this.hidePop(120)); document.body.appendChild(this.pop); this.applyTheme(); }
      this.pop.style.setProperty('--ch-accent', this.persona.color || '#d9622b');
      let host = ''; try { host = s.href ? (new URL(s.href).origin === location.origin ? (s.href.includes('app.html') ? 'Opens in the portal' : 'Opens on this site') : new URL(s.href).hostname.replace(/^www\./, '')) : ''; } catch { host = ''; }
      this.pop.innerHTML = `<div class="ch-pop-k"><span class="n">${+el.dataset.src + 1}</span>${esc(kindText(s))} · ${esc(asOfText(s))}</div><div class="ch-pop-t">${esc(s.label)}</div>${s.desc ? `<div class="ch-pop-d">${esc(s.desc)}</div>` : ''}${host ? `<div class="ch-pop-l">${esc(host)} ${I.open}</div>` : ''}`;
      el.setAttribute('aria-describedby', this.pop.id);
      this.pop.hidden = false; this.pop.classList.add('on');
      const r = el.getBoundingClientRect(), pw = Math.min(320, innerWidth - 24), ph = this.pop.offsetHeight;
      this.pop.style.width = pw + 'px';
      this.pop.style.left = Math.max(12, Math.min(innerWidth - pw - 12, r.left + r.width / 2 - pw / 2)) + 'px';
      this.pop.style.top = (r.top > ph + 16 ? r.top - ph - 8 : r.bottom + 8) + 'px';
    };
    const hide = e => { if (e.relatedTarget && this.pop?.contains(e.relatedTarget)) return; this.hidePop(140); };
    this.root.addEventListener('mouseover', e => { const el = e.target.closest?.('[data-src]'); if (el && this.root.contains(el)) show(el); });
    this.root.addEventListener('mouseout', e => { if (e.target.closest?.('[data-src]')) hide(e); });
    this.root.addEventListener('focusin', e => { const el = e.target.closest?.('[data-src]'); if (el) show(el); });
    this.root.addEventListener('focusout', e => { if (e.target.closest?.('[data-src]')) this.hidePop(0); });
  }
  hidePop(ms = 0) { clearTimeout(this._popT); this._popT = setTimeout(() => { if (this.pop) { this.pop.classList.remove('on'); this.pop.hidden = true; } }, ms); }

  /* ── events ── */
  onClick(e) {
    const t = e.target.closest('[data-a],[data-prompt],[data-act],[data-thread],[data-del-thread],[data-persona],.ch-launch'); if (!t || !this.root.contains(t)) return;
    if (t.classList.contains('ch-launch')) { this.togglePanel(true); return; }
    if (t.dataset.prompt != null) { e.preventDefault(); this.ask(t.dataset.prompt); return; }
    if (t.dataset.act) { this.act(t, e); return; }
    if (t.dataset.thread) { this.openThread(t.dataset.thread); return; }
    if (t.dataset.delThread) { this.deleteThread(t.dataset.delThread); return; }
    if (t.dataset.persona) { this.setPersona(t.dataset.persona); this.root.classList.remove('ch-side-open'); return; }
    const a = t.dataset.a; if (a === 'expand') return;
    e.preventDefault();
    if (a === 'close') this.togglePanel(false);
    else if (a === 'new') this.newChat();
    else if (a === 'settings') this.settings(t, t.dataset.adv === '1');
    else if (a === 'jump') this.msgs.scrollTo({ top: this.msgs.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });
    else if (a === 'steps') { const ol = t.parentElement?.querySelector('.ch-steps'); if (!ol) return; ol.hidden = !ol.hidden; t.setAttribute('aria-expanded', String(!ol.hidden)); }
    else if (a === 'sources') { const d = t.closest('.ch-after')?.querySelector('.ch-sources'); if (d) { d.open = true; d.querySelector('summary')?.focus(); } }
    else if (a === 'theme') {   // the assistant's own button sets the one site-wide theme
      const t = this.isDark() ? 'light' : 'dark', F = window.BSPFrame;
      if (F && typeof F.setTheme === 'function') F.setTheme(t);
      else { document.documentElement.dataset.sysTheme = t; try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked */ } }
      this.applyTheme();
    }
    else if (a === 'menu') this.root.classList.toggle('ch-side-open');
  }
  onKey(e) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && this.mode !== 'full') { e.preventDefault(); this.focus(); return; }
    if (e.key === 'Escape' && !e.target.matches?.('textarea')) { if (this.busy) this.stop(); else if (this.mode === 'floating' && this.open) this.togglePanel(false); }
  }
  updateJump() { const j = this.root.querySelector('.ch-jump'); if (!j) return; const m = this.msgs; j.hidden = !(m.scrollHeight - m.scrollTop - m.clientHeight > 240); }

  /* ── threads (full assistant) ── */
  threads() { const t = lsGet(TH_LS, []); return Array.isArray(t) ? t : []; }
  saveTurn(q, rec) {
    if (this.mode !== 'full') return;
    if (!this.thread) this.thread = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: q.length > 72 ? q.slice(0, 70) + '…' : q, persona: this.id, created: Date.now(), turns: [] };
    this.thread.turns.push({ role: 'user', q }, { role: 'assistant', rec: { ...rec, go: undefined } });
    this.persistThread();
  }
  persistThread() {
    if (!this.thread) return; this.thread.updated = Date.now(); this.thread.ctx = this.ctx; this.thread.persona = this.id;
    let list = this.threads().filter(t => t.id !== this.thread.id); list.unshift(this.thread); list = list.slice(0, 30);
    while (list.length && !lsSet(TH_LS, list)) list = list.slice(0, Math.floor(list.length / 2));
    this.renderThreads(); this.syncThread(this.thread);
  }
  /** Mirror a saved chat to the backend (D1) when storage is live; the browser copy stays the source of truth. */
  syncThread(t) {
    if (!t || !stored()) return;
    const messages = t.turns.slice(-40).map(x => x.role === 'user' ? { role: 'user', content: String(x.q || '').slice(0, 2000) } : { role: 'assistant', content: plain(x.rec?.html || '').slice(0, 2500), kind: x.rec?.kind || null, engine: x.rec?.engine || null, sources: (x.rec?.sources || []).slice(0, 10).map(s => s.label), synth: x.rec?.synth ? plain(x.rec.synth.html).slice(0, 1500) : undefined });
    clearTimeout(this._syncT);
    this._syncT = setTimeout(() => BE.saveThread({ thread_id: t.id, persona: t.persona || this.id, title: t.title, messages_json: messages }).catch(e => console.debug('thread kept in this browser only', e?.message || e)), 400);
  }
  renderThreads() {
    const box = this.root.querySelector('.ch-threads'); if (!box) return; const list = this.threads();
    box.innerHTML = list.length ? list.map(t => { const p = PERSONAS[t.persona] || SITE_BASE[t.persona]; return `<div class="ch-th${this.thread?.id === t.id ? ' on' : ''}"><button type="button" class="ch-th-b" data-thread="${esc(t.id)}" ${this.thread?.id === t.id ? 'aria-current="true"' : ''}><span class="ch-th-t">${esc(t.title)}</span><span class="ch-th-m">${esc(p?.initials === 'BS' ? 'Portfolio' : p?.short || (p?.name || '').split(' ')[0] || 'Chat')} · ${ago(t.updated || t.created)}</span></button><button type="button" class="ch-th-x" data-del-thread="${esc(t.id)}" aria-label="Delete chat: ${esc(t.title)}" data-tip="Delete">${I.trash}</button></div>`; }).join('') : `<p class="ch-th-empty">Your chats appear here. ${esc(this.threadNote())}</p>`;
  }
  openThread(id) {
    const t = this.threads().find(x => x.id === id); if (!t) return;
    if (this.busy) this.stop(); this.stopSpeech(); this.hidePop();
    if (t.persona !== this.id) this.setPersona(t.persona, { fresh: false });
    this.thread = t; this.history = []; this.prompts = []; this.msgs.innerHTML = '';
    for (const x of t.turns) {
      if (x.role === 'user') { this.msgs.appendChild(this.userTurn(x.q)); this.history.push({ role: 'user', html: esc(x.q), text: x.q }); this.prompts.push(x.q); this.lastQ = x.q; continue; }
      const turn = this.botShell(); this.msgs.appendChild(turn); const rec = x.rec || {};
      if (rec.note) this.note(turn, { from: rec.note, q: rec.eq || rec.q });
      Status.render(turn.querySelector('.ch-status'), rec.meta); Think.render(turn, rec.think);
      turn.querySelector('.ch-answer').innerHTML = rec.html || ''; turn.querySelectorAll('.ch-answer .ch-badge').forEach(b => { if (/^\s*est\.?\s*$/i.test(b.textContent)) b.classList.add('ch-est'); }); rec.sources ||= [];
      if (rec.synth?.html) { const sy = turn.querySelector('.ch-synth'); sy.hidden = false; sy.innerHTML = this.synthHead(rec.synth.model) + `<div class="ch-synth-body">${rec.synth.html}</div>`; }
      this.renderAfter(turn, rec);
      this.history.push({ role: 'assistant', html: rec.html, text: plain(rec.html || '') });
    }
    this.ctx = t.ctx || null; this.renderThreads(); this.updateExpand(); this.root.classList.remove('ch-side-open');
    this.msgs.scrollTop = this.msgs.scrollHeight; this.updateJump(); this.focus();
  }
  deleteThread(id) { lsSet(TH_LS, this.threads().filter(t => t.id !== id)); if (this.thread?.id === id) this.newChat(); else this.renderThreads(); }

  /* ── settings ── */
  /** The gear: a plain "About this assistant" note for visitors. The key/model dialog opens only with ?dev=1,
      never for visitors, even when the hosted backend is down. */
  async settings(trigger, advanced = false) {
    await backend();
    if (DEV) return this.advancedSettings(trigger);
    return this.about(trigger);
  }
  modal(trigger, html, label) {
    const back = trigger || document.activeElement;
    this.root.ownerDocument.querySelectorAll('.ch-modal').forEach(x => x.remove());
    const m = document.createElement('div'); m.className = `ch ch-modal ${this.isDark() ? 'ch-dark' : ''}`; m.style.setProperty('--ch-accent', this.persona.color || '#d9622b');
    m.innerHTML = `<div class="ch-card" role="dialog" aria-modal="true" aria-labelledby="${label}">${html}</div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); this.refreshChrome(); const t = back?.isConnected ? back : this.root.querySelector('.ch-engine') || this.root.querySelector('textarea'); try { t?.focus?.(); } catch { /* gone */ } };
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Tab') { const f = [...m.querySelectorAll('input,select,button')]; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } });
    return { m, close };
  }
  about(trigger) {
    const live = hosted();
    const adv = '';   // visitors never see the key dialog; owners open it with ?dev=1
    const { m, close } = this.modal(trigger, `<div class="ch-card-h"><h3 id="ch-about-h">About this assistant</h3><button type="button" class="ch-ib-b" data-x="close" aria-label="Close">${I.x}</button></div>
<p>BSP Desk answers questions about the six portfolio companies. Questions about the portfolio are answered straight from the data behind this site, and every answer lists its sources.</p>
<p>${live ? 'Open questions, and the <b>Go deeper</b> button, get a research pass: the assistant searches the library, reads the sources, runs the acquisition model when a price matters, and shows its thinking.' : 'Open questions get the closest material from the site, with links to the full pages.'}</p>
${BE?.logs ? '<p class="ch-muted">Questions and answers are kept, without names or addresses, to improve the assistant.</p>' : ''}
<div class="row">${adv}<span class="ch-sp"></span><button type="button" class="btn pri" data-x="close">Done</button></div>`, 'ch-about-h');
    m.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => { if (b.dataset.x === 'advanced') { m.remove(); this.advancedSettings(trigger); } else close(); }; });
    m.querySelector('.btn.pri')?.focus();
  }
  advancedSettings(trigger) {
    const { m, close } = this.modal(trigger, `<div class="ch-card-h"><h3 id="ch-set-h">Advanced settings</h3><button type="button" class="ch-ib-b" data-x="cancel" aria-label="Close settings">${I.x}</button></div><p>${hosted() ? `The hosted research assistant (${esc(modelName(BE.model || MODEL_DEFAULT))}) answers open questions and can expand answers. No key needed; a personal key is used only if the hosted service is down.` : 'Answers from the portfolio data need no key. Add an Anthropic key for open questions. It stays in this browser and goes only to Anthropic.'}</p><label for="ch-key">Anthropic key</label><input type="password" id="ch-key" placeholder="sk-ant-…" autocomplete="off" value="${esc(LLM.key())}"><label for="ch-model">Model</label><select id="ch-model">${Object.keys(MODEL_NAMES).map(x => `<option value="${x}" ${LLM.model() === x ? 'selected' : ''}>${MODEL_NAMES[x]}</option>`).join('')}</select><label for="ch-mode">When to use your key</label><select id="ch-mode"><option value="fallback" ${!LLM.always() ? 'selected' : ''}>Only when the portfolio data has no answer</option><option value="always" ${LLM.always() ? 'selected' : ''}>Always (with the portfolio data as context)</option></select><div class="row"><button type="button" class="btn" data-x="clear">Remove key</button><span class="ch-sp"></span><button type="button" class="btn" data-x="cancel">Cancel</button><button type="button" class="btn pri" data-x="save">Save</button></div>`, 'ch-set-h');
    m.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => { const x = b.dataset.x; try { if (x === 'save') { localStorage.setItem(KEY_LS, $('#ch-key', m).value.trim()); localStorage.setItem(MODEL_LS, $('#ch-model', m).value); localStorage.setItem(MODE_LS, $('#ch-mode', m).value); } if (x === 'clear') localStorage.removeItem(KEY_LS); } catch { /* storage blocked */ } close(); }; });
    $('#ch-key', m).focus();
  }
}
window.BSPChat = Chat;
