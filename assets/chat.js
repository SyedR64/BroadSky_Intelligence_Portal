/* ═══════════════════════════════════════════════════════════════════════════
   Broad Sky chat — grounded assistant for the portal and the portfolio sites.
   • Deterministic intents answer from the portal's own datasets (no backend, no key).
   • Retrieval fallback searches an index built from research metadata.
   • Optional: bring-your-own Anthropic key (stored only in this browser) upgrades
     free-form questions to Claude, grounded with the same retrieved context.
   Usage:  import { Chat } from '/assets/chat.js';
           Chat.mount(document.querySelector('#hero-chat'), { persona: 'portal', mode: 'inline' });
           Chat.mount(null, { persona: 'pp', mode: 'floating', faq: [...], suggestions: [...] });
   ═══════════════════════════════════════════════════════════════════════════ */
import { Data, Fmt, Live, esc } from './core.js?v=20261006085442';

const ROOT = new URL('../', import.meta.url).href;              // repo root, works from any page depth
const APP = ROOT + 'app.html';
const MODEL_DEFAULT = 'claude-opus-5-5';
const KEY_LS = 'bsp-anthropic-key', MODEL_LS = 'bsp-anthropic-model', MODE_LS = 'bsp-chat-llm';
const $ = (s, r = document) => r.querySelector(s);
const link = (href, label) => `<a class="ch-link" href="${esc(href)}">${esc(label)} →</a>`;
const app = (hash, label) => link(APP + hash, label);
const n = (v, d = 0) => `<span class="ch-num">${Fmt.num(v, d)}</span>`;
const money = v => `<span class="ch-num">${Fmt.money(v)}</span>`;
const sentences = (v, k = 3) => Array.isArray(v) ? v.slice(0, k).join(' ') : String(v || '').split('. ').slice(0, k).join('. ');
const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${typeof c === 'number' ? 'n' : ''}">${typeof c === 'number' ? Fmt.num(c) : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const COS = { pp: 'Punctual Pros', cet: 'Commonwealth Electrical (CET)', fl: 'Frontline Managed Services', ts: 'Thomas Scientific', bpi: 'Bully Pulpit International', fh: 'Fair Harbor' };
const CO_RX = { pp: /punctual|one hour|ben(jamin)? franklin|mister sparky|horvath|hvac|plumb/i, cet: /\bcet\b|commonwealth|horton|nuwave|electrical|wastewater|solar/i, fl: /frontline|law firm|legal|am ?law/i, ts: /thomas|lab supply|laborator|diagnostic/i, bpi: /bully|bpi|public affairs|comms|communications agency/i, fh: /fair harbor|beachwear|swim|apparel/i };
const coOf = q => Object.keys(CO_RX).find(k => CO_RX[k].test(q));
const TERRITORY_PA = ['Lancaster', 'York', 'Dauphin', 'Cumberland', 'Berks', 'Lebanon', 'Franklin', 'Adams', 'Perry'];
const TERRITORY_NJ = ['Ocean', 'Monmouth'];

/* ── Intents (portal persona) ─────────────────────────────────────────────── */
async function expansionPlan() {
  const [zips, ma, mkt, pe, fil, nw, ev] = await Promise.all([Data.load('pp_zips'), Data.research('ma_targets_pp'), Data.research('pp_market'), Data.research('pe_landscape'), Data.research('pp_filings'), Data.research('pp_nationwide'), Data.research('serviceos_evidence')]);
  const core = zips.filter(z => z.service_territory_flag === 1), adj = zips.filter(z => z.adjacent_to_service_territory === 1 && z.service_territory_flag !== 1);
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
  const sh = tmpl.length ? `<h4>The template: Smith + Howard, regional → national</h4><p>${esc(sentences(nw?.meta?.narrative, 2))}.</p>${tbl(['When', 'Move', 'Where'], tmpl.slice(0, 8).map(t => [esc(Fmt.dateShort(t.date) === '—' ? t.date : Fmt.date(t.date)), `<b>${esc(t.event)}</b>${t.metric ? ` <span class="ch-badge">${esc(t.metric)}</span>` : ''}`, esc(t.location || '')]))}<p>Same motion for Punctual Pros: densify, tuck in, platform, national — with ServiceOS as the integration spine instead of an accounting practice-management stack.</p>` : `<h4>The template: Smith + Howard, regional → national</h4><p>One Atlanta office and ~100 professionals at entry; nine add-ons later it was 11 locations across the Southeast plus India, ~800 people and roughly 4× revenue, sold to TPG Growth in August 2026. Punctual Pros runs the same motion in home services.</p>`;
  const ph = phases.length ? phases.map((p, i) => `<h4>Phase ${i + 1} · ${esc(String(p.phase || '').replace(/^Phase\s*\d+\s*[-–—·:]\s*/i, ''))} <span class="ch-badge">${esc(p.months || '')}</span></h4><p>${esc(p.thesis || '')}${p.geography?.length ? ` <span style="color:var(--ch-mute)">(${esc(p.geography.slice(0, 6).join(', '))})</span>` : ''}</p>${p.kpi_targets ? `<p class="ch-num">Targets: ${['revenue_usd', 'ebitda_usd', 'technicians', 'territories', 'members'].filter(k => p.kpi_targets[k] != null).map(k => `${k.replace('_usd', '').replace('_', ' ')} ${/usd/.test(k) ? Fmt.money(p.kpi_targets[k]) : Fmt.num(p.kpi_targets[k])}`).join(' · ')} <span class="ch-badge">est.</span></p>` : ''}`).join('') :
    `<h4>Phase 1 · Densify (0–12 mo)</h4><p>${n(t1adj.length)} Tier-1 adjacent zips sit just outside the footprint${Object.keys(byState).length ? ` (${Object.entries(byState).map(([s, c]) => `${s} ${c}`).join(', ')})` : ''}: win them with the new-mover engine and weather-driven capacity, not new branches.</p><h4>Phase 2 · Tuck-ins PA · NJ · MD · DE (6–24 mo)</h4><p>${n(tgt.length)} screened add-ons${Object.keys(tgtByState).length ? ` (${Object.entries(tgtByState).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} ${c}`).join(', ')})` : ''}; top: ${tgt.slice(0, 3).map(t => `<b>${esc(t.company)}</b> (${esc(t.state || '')}, fit ${t.fit_score})`).join('; ')}.</p><h4>Phase 3 · Mid-Atlantic platform (18–36 mo)</h4><p>Consolidate franchisees along I-81/I-95 (Baltimore–DC, Richmond, Philadelphia suburbs, Pittsburgh). ${rivals.length ? `${n(rivals.length)} sponsors already compete here, so speed and operator credibility beat price.` : ''}</p><h4>Phase 4 · National (36+ mo)</h4><p>Preferred consolidator inside the Authority Brands network (1,000+ owners, 15 brands); ServiceOS is the spine every acquired shop plugs into.</p>`;
  const lv = (levers.length ? levers : [{ lever: 'Website & online booking', baseline: null, target: null, evidence: 'Conversion-first site, instant booking, reviews' }, { lever: 'Comfort Club memberships', evidence: 'Recurring revenue, higher retention, cheaper demand in shoulder seasons' }, { lever: 'New-mover marketing', evidence: 'Deed feed → scored mailing within 30 days of closing' }, { lever: 'Storm & weather playbook', evidence: 'Pre-positioned crews and inventory ahead of NWS alerts' }, { lever: 'IAQ, water-treatment & generator attach', evidence: 'Higher ticket on every visit' }, { lever: 'Consumer financing attach', evidence: 'Replacement close-rate lift' }, { lever: 'Dynamic price-book', evidence: 'Margin discipline across trades' }, { lever: 'Tuck-in machine on ServiceOS', evidence: '100-day integration playbook' }]).slice(0, 8);
  const levHtml = `<h4>Eight ways we improve the business (not just the website)</h4>${tbl(['Lever', 'Baseline → target', 'Evidence'], lv.map(l => [`<b>${esc(l.lever)}</b>`, l.baseline != null || l.target != null ? `<span class="ch-num">${esc(l.baseline ?? '—')} → ${esc(l.target ?? '—')}${l.unit ? ' ' + esc(l.unit) : ''}</span>` : '—', `<span style="color:var(--ch-fg2)">${esc(String(l.evidence || '').slice(0, 110))}</span>`]))}`;
  const agHtml = agents.length ? `<h4>AI agents for the office, the truck and the customer</h4>${tbl(['Agent', 'Helps', 'What it does', 'Metric'], agents.slice(0, 8).map(a => [`<b>${esc(a.agent)}</b><br><span style="color:var(--ch-mute)">${esc((a.vendor_examples || []).slice(0, 2).join(', '))}</span>`, esc(a.who_it_helps || ''), esc(String(a.job_to_be_done || '').slice(0, 90)), esc(String(a.metric_claim || '').slice(0, 90))]))}` : `<h4>AI agents for the office, the truck and the customer</h4><ul><li><b>24/7 AI dispatcher</b> — answers and books every call, recovers missed calls by text</li><li><b>Technician copilot</b> — voice diagnostics, parts lookup, option-sheet guidance on site</li><li><b>Estimator & proposal agent</b> — good/better/best in minutes</li><li><b>Route & schedule optimizer</b> — fed by the weather pressure index</li><li><b>Membership renewal, reviews, AP/AR and permit agents</b> — back-office cost out</li></ul>`;
  const prHtml = pros.length ? `<h4>Helping the pros themselves</h4><ul>${pros.slice(0, 6).map(p => `<li><b>${esc(p.program)}</b> — ${esc(String(p.evidence || '').slice(0, 120))}</li>`).join('')}</ul>` : `<h4>Helping the pros themselves</h4><ul><li>Trade-school pipeline (Thaddeus Stevens, PA apprenticeships) and earn-while-you-learn ladders</li><li>Pay ladders, tool stipends, ride-along training, veteran hiring</li><li>Contractor partner network for overflow and builder work</li></ul>`;
  const finHtml = fin.length ? `<h4>Financing</h4><ul>${fin.slice(0, 4).map(f => `<li><b>${esc(f.source_of_funds)}</b> — ${esc(f.amount_or_range || '')}${f.evidence ? `: ${esc(String(f.evidence).slice(0, 110))}` : ''}</li>`).join('')}</ul>` : '';
  const roadHtml = road.length ? `<h4>36-month roadmap <span class="ch-badge">analyst assumptions</span></h4>${tbl(['Month', 'Revenue', 'EBITDA', 'Techs', 'Territories', 'Members'], road.map(r => [r.month, r.revenue_usd ? money(r.revenue_usd) : '—', r.ebitda_usd ? money(r.ebitda_usd) : '—', r.technicians ?? '—', r.territories ?? '—', r.members ?? '—']))}${assume ? `<p>Multiple expansion case: ${esc(String(assume.multiple_expansion_range || assume.multiple_expansion || '').toString())} ${esc(String(assume.rationale || '').slice(0, 160))}</p>` : ''}` : '';
  return {
    html: `<h4>How Broad Sky takes Punctual Pros nationwide</h4><p><b>Where it stands.</b> ${n(core.length)} core zips in ${TERRITORY_PA.length} Central-PA counties (${n(hh)} housing units) plus Ocean &amp; Monmouth NJ via Horvath. Public filings imply FY2025 revenue of ${esc(rev?.estimate || '~$22M')}${ebitda ? ` and adjusted EBITDA of ${esc(ebitda.estimate)}` : ''} (analyst estimates), with an undrawn delayed-draw line already earmarked for acquisitions.</p>${sh}${ph}${levHtml}${agHtml}${prHtml}${finHtml}${roadHtml}<h4>Exit thesis</h4><p>A multi-state, membership-heavy, AI-run home-services platform on one operating system is what a strategic or the next sponsor pays a tech-enabled multiple for — the same arc that took Smith + Howard from a regional firm to a TPG exit.</p><div class="ch-src">Sources: pp_nationwide (press, FDD, BLS/ACCA, vendor data), pp_zips, ma_targets_pp, pe_landscape, pp_filings, serviceos_evidence. Figures labelled est. are analyst assumptions.</div>`,
    links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html', 'Open the Nationwide playbook'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS'), app('#/pp/territory', 'Territory & expansion'), app('#/ma/pipeline?platform=pp', 'Add-on pipeline'), app('#/pe/landscape', 'PE competitors'), app('#/pp/filings', 'Filings & estimates')],
    followups: ['Which AI agents pay back fastest?', 'Which counties come first?', 'How does Smith + Howard compare?', 'What does ServiceOS do for valuation?'],
  };
}
async function weatherImpact() {
  const [pa, nj, model] = await Promise.all([Live.nwsAlerts('PA').catch(() => []), Live.nwsAlerts('NJ').catch(() => []), Data.research('pp_demand_model')]);
  const inTerr = a => (a.areas || []).some(x => [...TERRITORY_PA, ...TERRITORY_NJ].some(c => new RegExp(`\\b${c}\\b`, 'i').test(x)));
  const alerts = [...pa, ...nj].filter(inTerr);
  const hubs = [{ name: 'Lancaster', lat: 40.04, lon: -76.31 }, { name: 'Toms River', lat: 39.95, lon: -74.2 }];
  const fc = await Promise.all(hubs.map(h => Live.forecast(h.lat, h.lon).catch(() => null)));
  const play = (model?.items || []).filter(i => i.component === 'playbook');
  const rows = alerts.slice(0, 6).map(a => { const p = play.find(x => new RegExp(String(x.alert_type || x.event || '').split(' ')[0], 'i').test(a.event)); return [`<b>${esc(a.event)}</b> <span class="ch-badge">${esc(a.severity)}</span>`, esc((a.areas || []).filter(x => [...TERRITORY_PA, ...TERRITORY_NJ].some(c => x.includes(c))).slice(0, 3).join(', ')), p ? esc(String(p.call_multiplier || p.multiplier_range || p.expected_multiplier || '').slice(0, 24)) : '—']; });
  const fcRows = hubs.map((h, i) => { const d = (fc[i] || []).filter(x => !x.past).slice(0, 7); if (!d.length) return [h.name, '—', '—', '—']; const hot = d.filter(x => x.tmax >= 90).length, cold = d.filter(x => x.tmin <= 20).length, wet = d.filter(x => (x.precip || 0) >= 1.5).length, gust = d.filter(x => (x.gust || 0) >= 40).length; return [h.name, `${Math.round(Math.min(...d.map(x => x.tmin)))}–${Math.round(Math.max(...d.map(x => x.tmax)))}°F`, `${hot} hot · ${cold} freeze · ${wet} heavy-rain · ${gust} gusty days`, d.some(x => x.tmax >= 90) ? 'HVAC surge' : d.some(x => x.tmin <= 20) ? 'Plumbing freeze risk' : gust ? 'Electrical/outage risk' : 'Baseline staffing']; });
  return { html: `<h4>Weather → service-call pressure (live)</h4><p>${n(alerts.length)} active NWS alerts touch the Punctual Pros territory right now${alerts.length ? ':' : '.'}</p>${alerts.length ? tbl(['Alert', 'Counties', 'Call multiplier'], rows) : ''}<h4>Next 7 days by hub</h4>${tbl(['Hub', 'Range', 'Trigger days', 'Implication'], fcRows)}<div class="ch-src">Sources: NWS alerts API, Open-Meteo forecast, pp_demand_model (ServiceTitan heat-wave elasticities, NOAA Storm Events).</div>`, links: [app('#/pp/weather', 'Open Weather & demand')], followups: ['Show the storm history for Ocean County', 'How many techs do we need on the peak day?'] };
}
async function wastewater() {
  const d = await Data.research('cet_wwtp_targets'); if (!d) return null;
  const top = (d.meta?.priority_top_15 || []).slice(0, 6); const items = d.items || [];
  const funded = items.filter(i => /funded/i.test(i.project_class || '')), mgd = items.reduce((a, i) => a + (i.design_flow_mgd || 0), 0);
  return { html: `<h4>Horton's first calls — municipal wastewater plants</h4><p>${n(items.length)} CT/MA/RI plants (${n(Math.round(mgd))} MGD) scored for Horton fit; ${n(funded.length)} have funded projects on the state SRF / Clean Water Fund lists.</p><ol>${top.map(t => `<li><b>${esc(t.facility || t.name || t.facility_name || '')}</b> — ${esc(String(t.rationale || t.reason || t.why || '').slice(0, 160))}</li>`).join('')}</ol><p>Sell the electrical/I&amp;C scope first (Horton), then bundle NuWave efficiency and CET solar/storage/generators into the same account.</p>`, links: [app('#/cet/wastewater', 'Wastewater accounts'), app('#/cet/opportunities', 'Opportunity radar')], followups: ['Which CET bids are due in the next 30 days?', 'Show CET add-on targets in Connecticut'] };
}
async function cetDue(days = 30) {
  const d = await Data.research('cet_opportunities'); const legacy = await Data.load('cet_ne_rfps').catch(() => []);
  const all = [...(d?.items || []).map(o => ({ t: o.title, who: o.owner_or_agency, st: o.state, due: o.due_date, fit: o.fit_score, v: o.est_value_usd })), ...legacy.map(o => ({ t: o.title, who: o.agency, st: o.state, due: o.due_date && new Date(o.due_date), fit: null, v: o.estimated_value_m ? o.estimated_value_m * 1e6 : null }))];
  const soon = all.filter(o => { const k = Fmt.days(o.due instanceof Date ? o.due.toISOString().slice(0, 10) : o.due); return k != null && k >= 0 && k <= days; }).sort((a, b) => new Date(a.due) - new Date(b.due));
  return { html: `<h4>CET bids due within ${days} days</h4>${soon.length ? tbl(['Due', 'Opportunity', 'Owner', 'Fit'], soon.slice(0, 10).map(o => [esc(Fmt.dateShort(o.due)), `<b>${esc(o.t)}</b> <span class="ch-badge">${esc(o.st || '')}</span>`, esc(o.who || ''), o.fit ?? '—'])) : '<p>No bids close in that window.</p>'}<p>${n(all.length)} opportunities tracked across the six New England states.</p>`, links: [app('#/cet/opportunities', 'Opportunity radar')], followups: ['What are the top 10 actions for CET this month?', 'Which wastewater plants should Horton call first?'] };
}
async function addons(q) {
  const co = coOf(q) || 'pp'; const file = { pp: 'ma_targets_pp', cet: 'ma_targets_cet', fl: 'ma_targets_fl_ts', ts: 'ma_targets_fl_ts' }[co]; if (!file) return { html: `<p>Add-on screens exist for Punctual Pros, CET, Frontline and Thomas Scientific.</p>`, links: [app('#/ma/pipeline', 'Acquisition engine')] };
  const d = await Data.research(file); let items = d?.items || []; if (file === 'ma_targets_fl_ts') items = items.filter(i => i.platform === (co === 'fl' ? 'frontline' : 'thomas_scientific'));
  const st = (q.match(/\b(PA|NJ|MD|DE|NY|CT|MA|RI|NH|ME|VT|pennsylvania|new jersey|connecticut|massachusetts|maryland)\b/i) || [])[1]; const map = { pennsylvania: 'PA', 'new jersey': 'NJ', connecticut: 'CT', massachusetts: 'MA', maryland: 'MD' }; const stc = st ? (map[st.toLowerCase()] || st.toUpperCase()) : null;
  if (stc) items = items.filter(i => (i.state || i.hq_state) === stc);
  items = items.slice().sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)).slice(0, 8);
  return { html: `<h4>Top add-on targets · ${esc(COS[co])}${stc ? ` · ${stc}` : ''}</h4>${items.length ? tbl(['Fit', 'Company', 'HQ', 'Staff', 'Why'], items.map(t => [t.fit_score ?? '—', `<b>${esc(t.company)}</b>`, esc(`${t.hq_city || ''}${t.hq_city ? ', ' : ''}${t.state || t.hq_state || ''}`), t.employees ?? '—', esc(String(t.strategic_rationale || '').slice(0, 90))])) : '<p>No targets match.</p>'}<div class="ch-src">Screened via ZoomInfo + company sites; every target carries sources in the portal.</div>`, links: [app(`#/ma/pipeline?platform=${co}`, 'Full pipeline'), app(`#/${co}/targets`, `${COS[co]} targets`)], followups: ['Who are the PE-backed competitors in this sector?', 'What multiple would a tuck-in trade at?'] };
}
async function peRivals(q) {
  const d = await Data.research('pe_landscape'); if (!d) return null; const co = coOf(q);
  let f = d.items || []; if (co) f = f.filter(x => (x.overlap_with_bsp || []).some(o => new RegExp(co === 'pp' ? 'punctual|pp' : co, 'i').test(o)));
  f = f.slice().sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.threat_level] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.threat_level] ?? 3)).slice(0, 8);
  return { html: `<h4>Sponsors competing with Broad Sky${co ? ` in ${esc(COS[co])}'s sector` : ''}</h4>${tbl(['Firm', 'Latest fund', 'Threat', 'Relevant platforms'], f.map(x => [`<b>${esc(x.firm)}</b><br><span style="color:var(--ch-mute)">${esc(x.hq || '')}</span>`, x.latest_fund?.size_usd ? money(x.latest_fund.size_usd) : '—', `<span class="ch-badge">${esc(x.threat_level || '')}</span>`, esc((x.platforms_relevant || []).slice(0, 3).map(p => p.name).join(', '))]))}<p>${esc(sentences(d.meta?.landscape_summary, 2))}.</p>`, links: [app('#/pe/landscape', 'PE landscape'), app('#/pe/deals', 'Deal flow 2025–26')], followups: ['Which of them bought home-services companies this year?', 'How does Broad Sky\'s fund size compare?'] };
}
async function financials(q) {
  const co = coOf(q) || 'pp'; const file = { pp: 'pp_filings', cet: 'cet_filings', fl: 'frontline_filings', ts: 'thomas_filings', bpi: 'bpi_filings', fh: 'fairharbor_filings' }[co];
  const d = await Data.research(file); if (!d) return null; const est = d.meta?.estimate_table || [];
  return { html: `<h4>${esc(COS[co])} — what public filings imply</h4><p>${esc(sentences(d.meta?.financial_picture, 3))}.</p>${tbl(['Metric', 'Estimate', 'Confidence'], est.slice(0, 8).map(e => [esc(e.metric), `<b>${esc(e.estimate)}</b>`, `<span class="ch-badge">${esc(e.confidence)}</span>`]))}<div class="ch-src">${n((d.items || []).length)} filings indexed (SEC Form D / ADV, BDC loan schedules, PPP, FDD, state records). Estimates, not audited figures.</div>`, links: [app(`#/${co}/filings`, 'Filings & financials'), app('#/fin/portfolio', 'Portfolio financial picture')], followups: ['How does that compare with public comps?', `Show add-on targets for ${COS[co]}`] };
}
async function movers(q) {
  const county = (q.match(/\b(lancaster|york|dauphin|cumberland|berks|lebanon|franklin|adams|perry|chester|montgomery|ocean|monmouth|atlantic|burlington)\b/i) || [])[1];
  const files = county && /ocean|monmouth|atlantic|burlington/i.test(county) ? ['sales/pp_sales_nj'] : county && /lancaster|york|dauphin|cumberland/i.test(county) ? ['sales/pp_sales_pa_a'] : county ? ['sales/pp_sales_pa_b'] : ['sales/pp_sales_pa_a', 'sales/pp_sales_pa_b', 'sales/pp_sales_nj'];
  const sets = await Promise.all(files.map(f => Data.load(f).catch(() => null))); let items = sets.filter(Boolean).flatMap(s => s.items || []);
  if (county) items = items.filter(i => String(i.county || '').toLowerCase() === county.toLowerCase());
  const res = items.filter(i => i.use_type === 'residential' && i.price >= 10000); const prices = res.map(i => i.price).sort((a, b) => a - b); const med = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const recent = res.filter(i => { const k = Fmt.days(i.sale_date); return k != null && k >= -90; }).length;
  return { html: `<h4>New-mover leads${county ? ` · ${esc(county)} County` : ' · all territory counties'}</h4><p>${n(res.length)} market-rate home sales on file (median ${med ? money(med) : '—'}), ${n(recent)} in the last 90 days. Every one is a household that just inherited an unknown HVAC system, water heater and panel.</p><ul><li>Welcome tune-up mailer within 30 days of closing</li><li>Pre-1980 stock: panel + plumbing safety inspection (Mister Sparky + Ben Franklin cross-sell)</li><li>Builder sales: maintenance-plan enrollment</li></ul><div class="ch-src">County recorder / GIS parcel data; nominal (&lt;$1k) transfers excluded.</div>`, links: [app(`#/pp/movers${county ? `?county=${encodeURIComponent(county)}` : ''}`, 'Open the lead list')], followups: ['How would ServiceOS automate this?', 'What is the storm outlook this week?'] };
}
function osConcept(q) {
  const co = coOf(q) || 'pp';
  const OS = { pp: ['ServiceOS', 'dispatch + capacity planning fed by weather, dynamic pricing, membership engine, new-mover automation, AI dispatcher on every missed call'], cet: ['GridOS', 'bid radar → estimating → crew scheduling, solar fleet O&M monitoring, wastewater SCADA service contracts, EV network operations, NuWave M&V dashboards'], fl: ['FirmOS', 'AI Tier-0 service desk, security posture score for every firm, LEDES eBilling + AR automation, client portal; product-led growth into mid-size firms'], ts: ['LabOS', 'punchout e-commerce, VMI/inventory, supplier consolidation analytics, AI product search, account-health scoring across 27k lab sites'], bpi: ['SignalOS', 'real-time narrative monitoring, synthetic-audience message testing, generative content workflow with compliance review, productized retainers'], fh: ['HarborOS', 'AI fit & size, replenishment reminders, wholesale B2B portal, inventory forecasting, recycled-material traceability'] };
  const [name, what] = OS[co];
  return { html: `<h4>${esc(name)} — the tech-enablement thesis for ${esc(COS[co])}</h4><p><b>What it is:</b> ${esc(what)}.</p><p><b>Why it matters for Broad Sky:</b> tech-enabled services businesses earn higher multiples than their non-enabled peers because growth is more repeatable (bookings, memberships, retention), margins are visible in real time, and add-ons integrate in weeks instead of years. ${esc(name)} is the integration layer that makes every tuck-in accretive and the story a buyer pays for at exit.</p><p><b>Build vs buy:</b> buy the system of record, build the data layer and the AI workflows on top; the portal's datasets (weather model, deed feeds, bid radar, account scores) are already the proprietary inputs.</p>`, links: [app('#/techos/overview', 'Tech-enablement program'), link(ROOT + `redesigns/${{ pp: 'punctual-pros', cet: 'cet', fl: 'frontline', ts: 'thomas-scientific', bpi: 'bpi', fh: 'fair-harbor' }[co]}/`, `${esc(COS[co])} site concept`)], followups: ['What evidence supports a tech-enabled multiple premium?', 'Show me how to take Punctual Pros nationwide'] };
}
async function comps(q) {
  const d = await Data.research('public_comps'); if (!d) return null; const sb = d.meta?.sector_benchmarks || {};
  const rows = Object.entries(sb).slice(0, 8).map(([k, v]) => [esc(k.replace(/_/g, ' ')), esc(String(v.median_revenue_growth_pct ?? v.median_growth ?? v.growth ?? '—')), esc(String(v.median_operating_margin_pct ?? v.median_operating_margin ?? v.operating_margin ?? '—')), esc(String(v.median_revenue_per_employee_usd ? Fmt.money(v.median_revenue_per_employee_usd) : v.revenue_per_employee ?? '—'))]);
  return { html: `<h4>Public comparables — sector medians (SEC XBRL)</h4>${tbl(['Sector', 'Growth', 'Op. margin', 'Rev/employee'], rows)}<p>${esc(sentences(d.meta?.financial_picture, 2))}.</p>`, links: [app('#/fin/comps', 'Public comps'), app('#/ma/valuation', 'Valuation benchmarks')], followups: ['What multiple would a tuck-in trade at?', 'Estimate Punctual Pros revenue from filings'] };
}
async function portfolio() {
  const d = await Data.research('bsp_firm'); const items = d?.items || [];
  return { html: `<h4>Broad Sky Partners — portfolio</h4><p>${esc(String(d?.firm?.strategy || 'New York lower-middle-market private equity; control investments in essential business and consumer services.').split('. ').slice(0, 2).join('. '))}.</p>${tbl(['Company', 'Sector', 'Entry', 'Add-ons'], items.filter(i => i.status !== 'exited').map(i => [`<b>${esc(i.company)}</b>`, esc(String(i.sector || '').slice(0, 40)), esc(i.entry_date || ''), (i.add_ons || []).length]))}<p>First exit: Smith + Howard → TPG Growth (Aug 2026). ${n(d?.firm?.stats?.add_ons || 23)} add-ons across ${n(d?.firm?.stats?.platforms || 7)} platforms.</p>`, links: [app('#/home/overview', 'Command Center'), app('#/home/firm', 'Firm profile')], followups: ['Who competes with Broad Sky?', 'What are the tech-enablement theses?'] };
}
const NAV = [[/weather|storm|forecast/i, '#/pp/weather', 'Weather & demand'], [/mover|lead|mailing|home sales/i, '#/pp/movers', 'New-mover marketing'], [/wastewater|horton/i, '#/cet/wastewater', 'Wastewater accounts'], [/radar|opportunit|rfp|bid/i, '#/cet/opportunities', 'Opportunity radar'], [/pipeline|acquisition|add-?on|m&a/i, '#/ma/pipeline', 'Acquisition pipeline'], [/landscape|competitor|sponsor|pe firm/i, '#/pe/landscape', 'PE landscape'], [/filing|financial|sec|form d/i, '#/fin/portfolio', 'Filings & financials'], [/comps|comparable|valuation|multiple/i, '#/fin/comps', 'Public comps'], [/law ?firm|am ?law/i, '#/fl/amlaw', 'AM Law 200 targets'], [/lab|site explorer|hospital/i, '#/ts/sites', 'Site explorer'], [/briefing|video|tour/i, '#/briefing/play', 'Briefing & video'], [/tech|serviceos|gridos|os\b/i, '#/techos/overview', 'Tech enablement'], [/3d|theater|theatre|cinematic|fly.?through|webgl|globe/i, '#/theater/play', '3D theater']];
function navigate(q) { const hit = NAV.find(([rx]) => rx.test(q)); if (!hit) return null; return { html: `<p>Opening <b>${esc(hit[2])}</b>.</p>`, links: [app(hit[1], hit[2])], go: APP + hit[1] }; }

async function nationwideSub(q) {
  const nw = await Data.research('pp_nationwide'); if (!nw) return expansionPlan();
  const items = nw.items || [];
  if (/agent|ai\b|automation|efficien/i.test(q)) { const a = items.filter(i => i.kind === 'ai_agent').sort((x, y) => (x.weeks_to_deploy || 99) - (y.weeks_to_deploy || 99)); return { html: `<h4>AI agents, ranked by time to payback</h4>${tbl(['Agent', 'Helps', 'Deploy', 'Evidence'], a.slice(0, 10).map(x => [`<b>${esc(x.agent)}</b><br><span style="color:var(--ch-mute)">${esc((x.vendor_examples || []).slice(0, 2).join(', '))}</span>`, esc(x.who_it_helps || ''), x.weeks_to_deploy ? `${x.weeks_to_deploy} wks` : '—', esc(String(x.metric_claim || '').slice(0, 120))]))}<div class="ch-src">${esc(String(nw.meta?.caveats?.[0] || ''))}</div>`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#agents', 'AI agents in the playbook'), link(ROOT + 'redesigns/punctual-pros/serviceos.html', 'ServiceOS')], followups: ['Which programs help the technicians?', 'Show me how to take Punctual Pros nationwide'] }; }
  if (/pro(s|gram)|technician|tech(s)?\b|contractor|hvac people|trade/i.test(q)) { const p = items.filter(i => i.kind === 'pro_program'); return { html: `<h4>Programs for the pros</h4><ul>${p.map(x => `<li><b>${esc(x.program)}</b> (${esc(x.who_it_helps || '')}) — ${esc(String(x.evidence || '').slice(0, 160))}</li>`).join('')}</ul>`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#pros', 'Helping the pros')], followups: ['Which AI agents pay back fastest?', 'Which counties come first?'] }; }
  if (/smith|howard|template|compare|analog/i.test(q)) { const t = items.filter(i => i.kind === 'template').sort((x, y) => String(x.date).localeCompare(String(y.date))); return { html: `<h4>Smith + Howard vs Punctual Pros</h4>${tbl(['When', 'Smith + Howard move', 'Where'], t.slice(0, 12).map(x => [esc(x.date || ''), `<b>${esc(x.event)}</b>${x.metric ? ` <span class="ch-badge">${esc(x.metric)}</span>` : ''}`, esc(x.location || '')]))}<p>${esc(String(nw.meta?.narrative || '').split('. ').slice(2, 5).join('. '))}.</p>`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#template', 'The template'), app('#/home/firm', 'Broad Sky profile')], followups: ['Show me how to take Punctual Pros nationwide'] }; }
  if (/count(y|ies)|first|where|phase/i.test(q)) { const ph = items.filter(i => i.kind === 'expansion_phase'); return { html: `<h4>Where first — the four phases</h4>${ph.map((p, i) => `<p><b>Phase ${i + 1} · ${esc(String(p.phase || '').replace(/^Phase\s*\d+\s*[-–—·:]\s*/i, ''))}</b> <span class="ch-badge">${esc(p.months || '')}</span><br>${esc(String(p.thesis || '').slice(0, 220))}<br><span style="color:var(--ch-mute)">${esc((p.geography || []).join(', '))}</span></p>`).join('')}`, links: [link(ROOT + 'redesigns/punctual-pros/nationwide.html#map', 'Phased map'), app('#/pp/territory', 'Territory & expansion')], followups: ['Which AI agents pay back fastest?'] }; }
  return expansionPlan();
}
async function adsProgram(q) {
  const d = await Data.research('pp_ads'); if (!d) return { html: `<h4>Growth marketing for Punctual Pros</h4><p>Cheap connected-TV flights triggered by NWS alerts, Google Local Services Ads for intent, and new-mover postcards from the deed feed. The sourced media plan, CTV platform comparison and sample creatives are being compiled.</p>`, links: [link(ROOT + 'redesigns/punctual-pros/ads.html', 'Sample ads & media plan')] };
  const it = d.items || []; const K = k => it.filter(i => i.kind === k);
  const plan = K('media_plan')[0]; const plat = K('ctv_platform').slice().sort((a, b) => (a.minimum_spend_usd ?? 1e9) - (b.minimum_spend_usd ?? 1e9)); const cr = K('creative');
  const ctv = cr.filter(c => /ctv/.test(c.format || ''));
  return { html: `<h4>Growth marketing & sample ads — Punctual Pros</h4><p>${esc(sentences(d.meta?.strategy_summary, 3))}.</p>${plan ? `<h4>${esc(plan.phase)} media plan <span class="ch-badge">est.</span></h4><p class="ch-num">${money(plan.monthly_budget_usd)}/mo → ${n(plan.channel_mix?.reduce((a, c) => a + (c.est_leads || 0), 0))} leads · ${n(plan.channel_mix?.reduce((a, c) => a + (c.est_booked_jobs || 0), 0))} booked jobs · CPA ${money(plan.expected_cpa_usd)} · revenue ${money(plan.expected_revenue_usd)}</p>${tbl(['Channel', 'Share', 'Monthly', 'Leads', 'Jobs'], (plan.channel_mix || []).map(c => [esc(c.channel), `${c.share_pct ?? '—'}%`, money(c.monthly_usd), c.est_leads ?? '—', c.est_booked_jobs ?? '—']))}` : ''}<h4>Cheapest CTV entry points</h4>${tbl(['Platform', 'Minimum', 'CPM', 'Targets'], plat.slice(0, 6).map(p => [`<b>${esc(p.platform)}</b>${p.self_serve ? ' <span class="ch-badge">self-serve</span>' : ''}`, p.minimum_spend_usd != null ? money(p.minimum_spend_usd) : '—', Array.isArray(p.cpm_range_usd) ? `$${p.cpm_range_usd[0]}–${p.cpm_range_usd[1]}` : '—', esc((p.targeting || []).slice(0, 3).join(', '))]))}<h4>Sample spots</h4><ul>${ctv.slice(0, 4).map(c => `<li><b>${esc(c.title)}</b> (${esc(c.format)}) — ${esc(c.audience || '')}: “${esc(String(c.hook || '').slice(0, 110))}”</li>`).join('')}</ul>`, links: [link(ROOT + 'redesigns/punctual-pros/ads.html', 'Open sample ads & media plan'), app('#/pp/weather', 'Storm triggers'), app('#/pp/movers', 'New-mover feed')], followups: ['Show me how to take Punctual Pros nationwide', 'Which AI agents pay back fastest?'] };
}
async function companyPlaybook(q) {
  const co = coOf(q); if (!co || co === 'pp') return expansionPlan();
  const slug = { cet: 'cet', fl: 'frontline', ts: 'thomas-scientific', bpi: 'bpi', fh: 'fair-harbor' }[co];
  const os = { cet: 'gridos', fl: 'firmos', ts: 'labos', bpi: 'signalos', fh: 'harboros' }[co];
  const d = await Data.research(`${co}_playbook`);
  if (!d) return { html: `<h4>${esc(COS[co])} — value-creation playbook</h4><p>The sourced playbook (Smith + Howard template, four phases, levers, AI agents, talent programs, financing, 36-month roadmap) is being compiled. Meanwhile the module below has the live opportunity, target and filings data.</p>`, links: [app(`#/${co}/overview`, `${COS[co]} module`), link(ROOT + `redesigns/${slug}/playbook.html`, 'Playbook page')] };
  const it = d.items || []; const K = k => it.filter(i => i.kind === k); const ph = K('expansion_phase'), lv = K('growth_lever'), ag = K('ai_agent'), tp = K('talent_program'); const road = d.meta?.kpi_roadmap || [];
  return { html: `<h4>${esc(COS[co])} — how Broad Sky builds the platform</h4><p>${esc(sentences(d.meta?.narrative, 3))}.</p>${ph.map((p, i) => `<h4>Phase ${i + 1} · ${esc(String(p.phase || '').replace(/^Phase\s*\d+\s*[-–—·:]\s*/i, ''))} <span class="ch-badge">${esc(p.months || '')}</span></h4><p>${esc(String(p.thesis || '').slice(0, 260))}</p>`).join('')}${lv.length ? `<h4>Levers</h4>${tbl(['Lever', 'Baseline → target', 'Evidence'], lv.slice(0, 8).map(l => [`<b>${esc(l.lever)}</b>`, l.baseline != null || l.target != null ? `<span class="ch-num">${esc(l.baseline ?? '—')} → ${esc(l.target ?? '—')}${l.unit ? ' ' + esc(l.unit) : ''}</span>` : '—', esc(String(l.evidence || '').slice(0, 100))]))}` : ''}${ag.length ? `<h4>AI agents</h4><ul>${ag.slice(0, 6).map(a => `<li><b>${esc(a.agent)}</b> (${esc(a.who_it_helps || '')}) — ${esc(String(a.metric_claim || a.job_to_be_done || '').slice(0, 110))}</li>`).join('')}</ul>` : ''}${tp.length ? `<h4>Talent</h4><ul>${tp.slice(0, 4).map(t => `<li><b>${esc(t.program)}</b> — ${esc(String(t.evidence || '').slice(0, 110))}</li>`).join('')}</ul>` : ''}${road.length ? `<h4>36-month roadmap <span class="ch-badge">assumptions</span></h4>${tbl(['Month', 'Revenue', 'EBITDA', 'Headcount'], road.map(r => [r.month, r.revenue_usd ? money(r.revenue_usd) : '—', r.ebitda_usd ? money(r.ebitda_usd) : '—', r.headcount ?? '—']))}` : ''}<div class="ch-src">Source: ${esc(co)}_playbook (press, filings, vendor data) + portal datasets. Figures labelled est./assumptions are analyst assumptions.</div>`,
    links: [link(ROOT + `redesigns/${slug}/playbook.html`, 'Open the playbook'), link(ROOT + `redesigns/${slug}/${os}.html`, `${os.replace('os', 'OS')} concept`), app(`#/${co}/overview`, `${COS[co]} module`), app(`#/ma/pipeline?platform=${co}`, 'Add-on pipeline')],
    followups: [`Which AI agents help ${COS[co]} most?`, 'Show me how to take Punctual Pros nationwide', 'What are the tech-enablement theses for every company?'] };
}
async function aiAgents(q) {
  const d = await Data.research('ai_agents_portfolio'); const co = coOf(q);
  if (!d || co === 'pp' || /pay ?back|fastest|punctual/i.test(q)) return nationwideSub(q);
  let a = (d.items || []).filter(i => i.kind === 'agent'); if (co) a = a.filter(i => i.company === co);
  a = a.slice().sort((x, y) => (y.est_annual_value_usd || 0) - (x.est_annual_value_usd || 0));
  const tot = a.reduce((s, x) => s + (x.est_annual_value_usd || 0), 0);
  return { html: `<h4>AI agents${co ? ` for ${esc(COS[co])}` : ' across the portfolio'}</h4><p>${esc(sentences(d.meta?.program_summary, 2))}. ${n(a.length)} agents, est. annual value ${money(tot)} <span class="ch-badge">assumption</span>.</p>${tbl(['Agent', 'Layer', 'Trigger → job', 'Est. value/yr', 'Deploy'], a.slice(0, 10).map(x => [`<b>${esc(x.agent)}</b>${co ? '' : `<br><span style="color:var(--ch-mute)">${esc(COS[x.company] || x.company)}</span>`}`, esc(x.layer || ''), esc(`${x.trigger || ''} → ${String(x.job_to_be_done || '').slice(0, 70)}`), x.est_annual_value_usd ? money(x.est_annual_value_usd) : '—', x.weeks_to_deploy ? `${x.weeks_to_deploy} wks` : '—']))}<div class="ch-src">Vendors and metrics carry sources on the AI agents page; human-in-the-loop gates listed per agent.</div>`, links: [link(ROOT + 'redesigns/ai-agents.html', 'The agentic layer'), app('#/techos/overview', 'Tech enablement')], followups: ['Which AI agents pay back fastest?', 'What are the tech-enablement theses for every company?'] };
}
async function voiceAI(q) {
  const [v, nw] = await Promise.all([Data.research('voice_ai'), Data.research('pp_nationwide')]); const co = coOf(q);
  if (!v) { const disp = (nw?.items || []).find(i => i.kind === 'ai_agent' && /dispatcher|call answering/i.test(i.agent || '')); return { html: `<h4>24/7 voice AI — the growth engine</h4><p>Every unanswered call is a lost job. A voice agent answers every call in two rings, triages no-heat / no-cool / leak calls, checks capacity and books straight into dispatch; after hours and on storm days it is the difference between a booked job and a competitor's. The same agent works outbound: membership renewals, maintenance reminders, pre-storm check-ins, review requests.</p>${disp ? `<p><b>${esc(disp.agent)}</b> — ${esc(String(disp.metric_claim || '').slice(0, 220))}</p>` : ''}<p>Sourced economics, vendors, sample calls and a revenue-recovered calculator are being compiled.</p>`, links: [link(ROOT + 'redesigns/voice-ai.html', 'Voice AI growth engine'), link(ROOT + 'redesigns/punctual-pros/nationwide.html#agents', 'AI agents in the playbook')] }; }
  const it = v.items || []; const K = k => it.filter(i => i.kind === k); const m = v.meta?.pp_revenue_model || {};
  let uc = K('use_case'); if (co) uc = uc.filter(u => u.company === co); uc = uc.slice().sort((a, b) => (b.est_annual_value_usd || 0) - (a.est_annual_value_usd || 0));
  const met = K('metric').filter(x => !co || (x.company_applies || []).includes(co)).slice(0, 6); const ven = K('vendor').filter(x => x.type === 'answering' || x.type === 'outbound').slice(0, 5);
  return { html: `<h4>24/7 voice AI${co ? ` for ${esc(COS[co])}` : ' — the growth engine'}</h4><p>${esc((Array.isArray(v.meta?.thesis) ? v.meta.thesis.slice(0, 3).join(' ') : String(v.meta?.thesis || '').split('. ').slice(0, 3).join('. ')).replace(/\.\s*$/, ''))}.</p>${m.total_est_usd ? `<p class="ch-num">Punctual Pros: ${n(m.inbound_calls_per_month)} calls/mo · ${esc(String(m.missed_share))} missed today → ${esc(String(m.recovered_share_with_ai))} recovered × ${esc(String(m.booking_rate))} booked × ${money(m.avg_ticket)} ticket ≈ ${money(m.recovered_revenue_annual_usd)}/yr recovered + ${money(m.outbound_renewal_uplift_usd)} outbound = <b>${money(m.total_est_usd)}/yr</b> <span class="ch-badge">assumption</span></p>` : ''}${met.length ? `<h4>What the data says</h4><ul>${met.map(x => `<li><b>${esc(String(x.value))}${x.unit ? ' ' + esc(x.unit) : ''}</b> — ${esc(x.metric)} <span style="color:var(--ch-mute)">(${esc(Fmt.host(x.source_url))})</span></li>`).join('')}</ul>` : ''}${uc.length ? `<h4>Use cases</h4>${tbl(['Use case', 'Dir.', 'Trigger → handoff', 'Est. value/yr', 'Deploy'], uc.slice(0, 8).map(u => [`<b>${esc(u.name)}</b>${co ? '' : `<br><span style="color:var(--ch-mute)">${esc(COS[u.company] || u.company)}</span>`}`, esc(u.direction || ''), esc(`${String(u.trigger || '').slice(0, 50)} → ${String(u.handoff_rule || '').slice(0, 50)}`), u.est_annual_value_usd ? money(u.est_annual_value_usd) : '—', u.weeks_to_deploy ? `${u.weeks_to_deploy} wks` : '—']))}` : ''}${ven.length ? `<h4>Vendors</h4><ul>${ven.map(x => `<li><b>${esc(x.vendor)}</b> — ${esc(String(x.pricing_note || '').slice(0, 90))}</li>`).join('')}</ul>` : ''}<div class="ch-src">Sources on the Voice AI page; compliance notes cover AI disclosure, TCPA and PA/NJ recording consent.</div>`, links: [link(ROOT + 'redesigns/voice-ai.html', 'Open Voice AI: play a sample call'), link(ROOT + 'redesigns/ai-agents.html', 'All AI agents'), app('#/pp/weather', 'Storm-day volume')], followups: ['Play the after-hours no-heat call', 'Which AI agents pay back fastest?', 'Show me how to take Punctual Pros nationwide'] };
}
const PORTAL_INTENTS = [
  { id: 'voice', rx: [/voice|phone agent|call answering|answer(ing)? (the )?phone|24.?7|after.?hours|missed call|receptionist|dispatcher/i], run: voiceAI },
  { id: 'playbook', rx: [/(playbook|value.?creation|how (do|would|should|does) (we|broad sky|bsp) (grow|build|scale|expand|take)|take .* (regional|national|northeast|international|further)|roll.?up plan).*(cet|commonwealth|horton|frontline|thomas|lab|bully|bpi|fair harbor)/i, /(cet|commonwealth|frontline|thomas scientific|bully pulpit|bpi|fair harbor).*(playbook|expand|grow|scale|national|international|next phase)/i], run: companyPlaybook },
  { id: 'ai_agents', rx: [/ai agents?|agentic|automation(s)? (for|across)|which agents/i], run: aiAgents },
  { id: 'ads', rx: [/\bads?\b|advertis|ctv|connected.?tv|commercial|media plan|marketing (plan|spend|budget)|campaign/i], run: adsProgram },
  { id: 'nationwide_sub', rx: [/(which|what) (ai )?agents? pay|agents? .*(payback|fastest|first)|which (counties|markets|cities) (come )?first|help(ing)? the (pros|technicians|contractors)|programs? .*(technician|pros)|smith \+? ?howard|how does smith/i], run: nationwideSub },
  { id: 'expansion', rx: [/(nationwide|national|expand|scale|grow|take .* (further|beyond)|roll-?up).*(punctual|pros|hvac|home service)|(punctual|pros).*(nationwide|national|expand|scale)/i], run: expansionPlan },
  { id: 'weather', rx: [/(weather|storm|forecast|heat ?wave|freeze|hurricane|snow).*(punctual|service call|demand|impact|this week|territory)|(punctual|pros).*(weather|storm|forecast)/i, /storm (impact|outlook)|service.?call pressure/i], run: weatherImpact },
  { id: 'wastewater', rx: [/wastewater|treatment plant|horton.*(call|target|account|first)|pump station/i], run: wastewater },
  { id: 'cet_due', rx: [/(bids?|rfps?|opportunit).*(due|closing|next \d+ days|this month|soon)|cet.*(bid|rfp|opportunit)/i], run: q => cetDue(Number((q.match(/(\d+) ?days/) || [])[1]) || 30) },
  { id: 'addons', rx: [/add-?on|tuck-?in|acqui|targets?\b|buy .* (company|competitor)|m&a/i], run: addons },
  { id: 'pe', rx: [/compet(e|itor|ing)|rival|sponsor|other pe|private equity firm|who else/i], run: peRivals },
  { id: 'fin', rx: [/revenue|ebitda|financial|filings?|form d|sec\b|debt|leverage|valu(e|ation) of|how big is|how much (does|is)/i], run: financials },
  { id: 'movers', rx: [/new.?mover|home sales|deed|leads? in|mailing|just (bought|sold)|recent(ly)? (sold|bought)/i], run: movers },
  { id: 'os', rx: [/serviceos|gridos|firmos|labos|signalos|harboros|tech.?enable|tech.?forward|operating system|\bos\b/i], run: osConcept },
  { id: 'comps', rx: [/comps?\b|comparable|multiple|public (peer|compan)|trades? at|benchmark/i], run: comps },
  { id: 'portfolio', rx: [/portfolio|which companies|who is broad sky|what is broad sky|about broad sky|platforms/i], run: portfolio },
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
  { t: 'Punctual Pros territory & expansion', s: 'core zips, adjacent ring, priority tiers, county rollup', h: '#/pp/territory' },
  { t: 'Punctual Pros market & competitors', s: 'competitors, franchise territories, rebates and incentives, county profiles, heating fuel mix', h: '#/pp/market' },
  { t: 'Frontline AM Law 200 targets', s: 'law firms scored for managed IT, cyber urgency, AI signal, revenue cycle', h: '#/fl/amlaw' },
  { t: 'Frontline mid-size firm targets', s: 'mid-size law firms with cyber incidents, mergers, CIO hires', h: '#/fl/midsize' },
  { t: 'Thomas Scientific parent accounts', s: '500 parent accounts, diagnostics labs, hospitals, pathology, commercial priority', h: '#/ts/accounts' },
  { t: 'Acquisition engine', s: 'add-on pipeline across platforms, theses, rival platforms, valuation calculator, white space', h: '#/ma/overview' },
  { t: 'PE landscape', s: 'competing sponsors, fund history, deals 2025-2026, sector heatmap, platform comparables', h: '#/pe/landscape' },
  { t: 'Filings & financials', s: 'Form D, Form ADV, BDC loan schedules, PPP, FDD Item 19, public comps, rival financials', h: '#/fin/portfolio' },
  { t: 'Tech enablement program', s: 'ServiceOS GridOS FirmOS LabOS SignalOS HarborOS theses, valuation impact, roadmaps', h: '#/techos/overview' },
  { t: 'Briefing & video', s: 'narrated tour, executive video', h: '#/briefing/play' },
  { t: '3D theater', s: 'WebGL fly-through: home-sales hexagons, nationwide expansion arcs, New England opportunity columns, live storm polygons', h: '#/theater/play' },
];
let _index = null;
async function buildIndex(persona) {
  if (_index) return _index;
  const docs = STATIC_DOCS.map(d => ({ ...d, href: APP + d.h }));
  const metaFiles = ['pp_filings', 'cet_filings', 'frontline_filings', 'thomas_filings', 'bpi_filings', 'fairharbor_filings', 'pe_landscape', 'cet_opportunities', 'pp_market', 'public_comps', 'ma_targets_pp', 'ma_targets_cet', 'bsp_firm'];
  const res = await Promise.all(metaFiles.map(f => Data.research(f)));
  res.forEach((d, i) => { if (!d) return; const m = d.meta || {}; const texts = [m.financial_picture, m.landscape_summary, m.territory_summary, m.expansion_thesis, ...(m.top_10_actions || []), ...(m.implications_for_bsp || [])].filter(Boolean); texts.forEach((t, k) => docs.push({ t: `${metaFiles[i].replace(/_/g, ' ')} · insight`, s: String(typeof t === 'string' ? t : JSON.stringify(t)).slice(0, 600), href: APP + ({ pp_filings: '#/pp/filings', cet_filings: '#/cet/filings', frontline_filings: '#/fl/filings', thomas_filings: '#/ts/filings', bpi_filings: '#/bpi/filings', fairharbor_filings: '#/fh/filings', pe_landscape: '#/pe/landscape', cet_opportunities: '#/cet/opportunities', pp_market: '#/pp/market', public_comps: '#/fin/comps', ma_targets_pp: '#/pp/targets', ma_targets_cet: '#/cet/targets', bsp_firm: '#/home/firm' }[metaFiles[i]] || '#/home/overview') })); });
  for (const f of (persona.faq || [])) docs.push({ t: f.q, s: f.a.replace(/<[^>]+>/g, ''), href: f.href || null, faq: true, html: f.a });
  _index = docs; return docs;
}
const tok = s => String(s || '').toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'show', 'me', 'does', 'this', 'that', 'are', 'can', 'you', 'your', 'about', 'tell', 'which', 'who', 'where', 'when', 'from', 'into', 'our', 'their', 'have', 'has']);
async function retrieve(q, persona, k = 3) {
  const docs = await buildIndex(persona); const qt = tok(q); if (!qt.length) return [];
  return docs.map(d => { const dt = tok(d.t + ' ' + d.s); const set = new Set(dt); let score = 0; for (const w of qt) { if (set.has(w)) score += 2; else if (dt.some(x => x.startsWith(w) || w.startsWith(x))) score += 0.6; } if (d.faq) score *= 1.3; return { d, score }; }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k).map(x => x.d);
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
const mdLite = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h4>$1</h4>').replace(/^[-•] (.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');

/* ── Personas ─────────────────────────────────────────────────────────────── */
export const PERSONAS = {
  portal: { name: 'Broad Sky Intelligence', initials: 'BS', greeting: 'Ask anything about the six platforms: opportunities, add-on targets, filings, competitors, weather-driven demand, or the tech-enablement theses. Answers come from the portal\'s own verified datasets.', placeholder: 'Ask the portfolio… e.g. "Show me how to take Punctual Pros nationwide"', color: '#d9622b',
    suggestions: ['Show me how to take Punctual Pros nationwide', 'Which wastewater plants should Horton call first?', 'What is the storm impact on Punctual Pros this week?', 'Who competes with Broad Sky for home-services deals?', 'Which CET bids are due in the next 30 days?', 'Estimate Punctual Pros revenue from public filings', 'Show the top add-on targets for CET in Connecticut', 'What is ServiceOS and why does it raise valuation?', 'How many new-mover leads are in Lancaster County?', 'Compare the portfolio to public comps', 'Open the PE landscape', 'What are the tech-enablement theses for every company?', 'Show me sample CTV ads and the media plan for Punctual Pros', 'How does Broad Sky scale CET across the Northeast?', 'What is the value-creation playbook for Frontline?', 'Which AI agents create the most value across the portfolio?', 'How much revenue does 24/7 voice AI recover for Punctual Pros?'],
    intents: PORTAL_INTENTS, faq: [] },
};
/** Customer-facing site personas are extended by each redesign (faq/suggestions/intents via mount options). */
const SITE_BASE = {
  pp: { name: 'Punctual Pros assistant', initials: 'PP', color: '#f08a3c', greeting: 'Hi! I can check whether we serve your address, book a visit, explain memberships and rebates, or tell you what this week\'s weather means for your home.', placeholder: 'Ask about service, coverage, pricing…', suggestions: ['Do you serve 17601?', 'Book a tune-up', 'Can I reach you at 2am?', 'What does the Comfort Club membership include?', 'What rebates are available for a heat pump?', 'Is there a storm coming this week?', 'My AC stopped working'] },
  cet: { name: 'CET project desk', initials: 'CE', color: '#4c8dff', greeting: 'Ask about electrical construction, solar and storage, EV charging, wastewater and pump-station work (Horton), or energy-efficiency programs (NuWave) anywhere in New England.', placeholder: 'Ask about capabilities, states served, programs…', suggestions: ['Do you work in Connecticut?', 'What incentives exist for commercial solar in Massachusetts?', 'Can you upgrade a wastewater plant\'s switchgear?', 'Request a design-build estimate', 'Which EV charging programs are open now?'] },
  fl: { name: 'Frontline advisor', initials: 'FL', color: '#9d7bff', greeting: 'I help law firms scope managed IT, service desk, cybersecurity and revenue-cycle support. Ask about coverage, security posture or a quick assessment.', placeholder: 'Ask about managed IT for law firms…', suggestions: ['Do you support AM Law 200 firms?', 'What is included in the service desk?', 'How do you handle eBilling and A/R?', 'Request a security assessment', 'Which offices do you operate from?'] },
  ts: { name: 'Thomas Scientific concierge', initials: 'TS', color: '#2ecc8f', greeting: 'Find products, categories and services for research, clinical, biopharma and cleanroom labs, or reach an account representative.', placeholder: 'Search products or ask about services…', suggestions: ['Do you supply cleanroom consumables?', 'Set up a punchout catalog', 'Who is my account rep?', 'Do you serve cannabis testing labs?', 'What is vendor-managed inventory?'] },
  bpi: { name: 'BPI desk', initials: 'BP', color: '#e05c8a', greeting: 'Ask about public affairs, corporate reputation, campaigns, research and AI-era communications work.', placeholder: 'Ask about services or case studies…', suggestions: ['What services does BPI offer?', 'Can you run a corporate reputation campaign?', 'Which offices do you have?', 'Start a conversation with the team'] },
  fh: { name: 'Fair Harbor helper', initials: 'FH', color: '#3fd0e0', greeting: 'Sizing, fabric, shipping, returns, sustainability and wholesale questions, answered.', placeholder: 'Ask about sizing, shipping, fabric…', suggestions: ['How do the swim trunks fit?', 'What are the trunks made of?', 'What is the return policy?', 'Do you sell wholesale?'] },
};
async function siteIntents(co) {
  const list = [];
  if (co === 'pp') {
    list.push({ id: 'zip', rx: [/\b\d{5}\b/], run: async q => { const z = q.match(/\b(\d{5})\b/)[1]; const zips = await Data.load('pp_zips'); const hit = zips.find(x => String(x.zip) === z); if (!hit) return { html: `<p>I don't have ${esc(z)} in our service model yet. Call the office and we'll confirm coverage.</p>` }; const inT = hit.service_territory_flag === 1, adj = hit.adjacent_to_service_territory === 1; return { html: `<p><b>${esc(z)} · ${esc(hit.city || '')}, ${esc(hit.county || '')}, ${esc(hit.state || '')}</b></p><p>${inT ? '✅ Yes — you are inside our service area. Same-day and emergency service available.' : adj ? '🟡 You are just outside our core area; we serve it by appointment with a small travel window.' : '❌ Not yet in our service area, but we are expanding — leave your details and we will notify you.'}</p>`, links: [link('#book', 'Book a visit')] }; } });
    list.push({ id: 'storm', rx: [/storm|weather|hurricane|freeze|heat ?wave|snow|outage/i], run: async () => { const [pa, nj] = await Promise.all([Live.nwsAlerts('PA').catch(() => []), Live.nwsAlerts('NJ').catch(() => [])]); const a = [...pa, ...nj].filter(x => (x.areas || []).some(y => [...TERRITORY_PA, ...TERRITORY_NJ].some(c => y.includes(c)))); return { html: `<h4>Weather for our service area (live from the National Weather Service)</h4>${a.length ? `<ul>${a.slice(0, 5).map(x => `<li><b>${esc(x.event)}</b> — ${esc((x.areas || []).slice(0, 3).join(', '))}</li>`).join('')}</ul><p>If you lose power or heat, call us first: we pre-position crews ahead of storms.</p>` : '<p>No active alerts. Good time to schedule maintenance before the next front.</p>'}`, links: [link('#book', 'Schedule service')] }; } });
  }
  if (co === 'cet') list.push({ id: 'programs', rx: [/incentive|program|smart|rebate|nevi|mass save|connectedsolutions/i], run: async () => { const d = await Data.research('cet_opportunities'); const p = (d?.items || []).filter(i => i.type === 'program' || /program|incentive/i.test(i.title)).slice(0, 5); return { html: `<h4>Programs we work with</h4><ul>${p.map(i => `<li><b>${esc(i.title)}</b> — ${esc(i.state)} · ${esc(String(i.fit_rationale || '').slice(0, 120))}</li>`).join('') || '<li>Mass Save, MA SMART, CT NRES, NEVI, EV charging grants, Clean Water SRF-funded upgrades</li>'}</ul>`, links: [link('#contact', 'Talk to an engineer')] }; } });
  return list;
}

/* ── Widget ───────────────────────────────────────────────────────────────── */
export const Chat = {
  mount(el, opts = {}) {
    const personaId = opts.persona || 'portal';
    const base = PERSONAS[personaId] || SITE_BASE[personaId] || PERSONAS.portal;
    const persona = { ...base, ...opts, faq: [...(base.faq || []), ...(opts.faq || [])], suggestions: opts.suggestions ? [...opts.suggestions, ...(base.suggestions || [])] : (base.suggestions || []), intents: [...(opts.intents || []), ...(base.intents || [])] };
    if (!document.getElementById('bsp-chat-css')) { const l = document.createElement('link'); l.id = 'bsp-chat-css'; l.rel = 'stylesheet'; l.href = ROOT + 'assets/chat.css?v=20261006085442'; document.head.appendChild(l); }
    const inst = new Widget(el, persona, personaId, opts); return inst;
  },
};
class Widget {
  constructor(el, persona, personaId, opts) {
    this.persona = persona; this.id = personaId; this.mode = opts.mode || (el ? 'inline' : 'floating'); this.theme = opts.theme || 'auto'; this.history = []; this.open = false; this.extra = null;
    this.root = document.createElement('div'); this.root.className = `ch ch-${this.mode} ${this.isDark() ? 'ch-dark' : ''}`; this.root.style.setProperty('--ch-accent', persona.color || '#2563eb');
    if (this.mode === 'inline') { el.appendChild(this.root); this.renderInline(); }
    else { document.body.appendChild(this.root); this.renderLauncher(); if (opts.openOnLoad) this.togglePanel(true); }
    siteIntents(personaId).then(x => { this.extra = x; });
    if (opts.autoAsk) setTimeout(() => this.ask(opts.autoAsk), 600);
  }
  isDark() { if (this.theme === 'dark') return true; if (this.theme === 'light') return false; return document.documentElement.dataset.theme !== 'light' && (document.body.classList.contains('dark') || getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0, 3).reduce((a, b) => a + +b, 0) < 300); }
  renderLauncher() { this.root.innerHTML = `<button class="ch-launch" aria-label="Open assistant"><span class="ch-dot"></span>Ask ${esc(this.persona.initials === 'BS' ? 'the portfolio' : this.persona.name.split(' ')[0])}</button>`; $('.ch-launch', this.root).onclick = () => this.togglePanel(true); }
  togglePanel(open) {
    this.open = open;
    if (!open) { this.renderLauncher(); return; }
    this.root.innerHTML = `<div class="ch-panel">${this.headHTML()}<div class="ch-msgs"></div>${this.chipsHTML()}${this.composeHTML()}</div>`;
    this.bind(); if (!this.history.length) this.bot(`<p>${esc(this.persona.greeting)}</p>`, [], true);
    else this.history.forEach(m => this.append(m.role, m.html));
    $('textarea', this.root).focus();
  }
  renderInline() { this.root.innerHTML = `${this.composeHTML()}${this.chipsHTML()}<div class="ch-thread"><div class="ch-msgs"></div></div>`; this.bind(); }
  headHTML() { return `<div class="ch-head"><div class="ch-avatar">${esc(this.persona.initials)}</div><div><div class="ch-title">${esc(this.persona.name)}</div><div class="ch-sub"><span class="ch-dot"></span>${LLM.key() ? `Claude · ${esc(LLM.model())}` : 'Grounded on portal data'}</div></div><div class="ch-ib"><button data-a="settings" title="Claude settings">⚙</button><button data-a="clear" title="Clear">⟲</button><button data-a="close" title="Close">✕</button></div></div>`; }
  chipsHTML() { return `<div class="ch-chips">${this.persona.suggestions.slice(0, this.mode === 'inline' ? 5 : 8).map(s => `<button class="ch-chip">${esc(s)}</button>`).join('')}</div>`; }
  composeHTML() { return `<div class="ch-compose"><div class="ch-ac" hidden></div><div class="ch-box"><textarea rows="1" placeholder="${esc(this.persona.placeholder)}" aria-label="Message"></textarea>${('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) ? '<button class="ch-btn mic" title="Speak">🎙</button>' : ''}<button class="ch-btn send" title="Send" disabled>➤</button></div>${this.mode === 'inline' ? `<div class="ch-foot">Answers are generated from the portal's verified datasets · <a href="#" data-a="settings">add a Claude key</a> for free-form questions</div>` : ''}</div>`; }
  bind() {
    const r = this.root; const ta = $('textarea', r), send = $('.ch-btn.send', r), ac = $('.ch-ac', r);
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; send.disabled = !ta.value.trim(); };
    let acItems = [], acIdx = -1;
    const showAc = () => { const q = ta.value.trim().toLowerCase(); if (!q) { ac.hidden = true; return; } const words = q.split(/\s+/); acItems = this.persona.suggestions.filter(s => { const l = s.toLowerCase(); return l.startsWith(q) || words.every(w => l.includes(w)); }).slice(0, 6); acIdx = acItems.length ? 0 : -1; ac.hidden = !acItems.length; ac.innerHTML = acItems.map((s, i) => { const k = s.toLowerCase().indexOf(q); const h = k >= 0 ? esc(s.slice(0, k)) + '<b>' + esc(s.slice(k, k + q.length)) + '</b>' + esc(s.slice(k + q.length)) : esc(s); return `<div class="${i === 0 ? 'on' : ''}" data-i="${i}">${h}${i === 0 ? '<span class="k">Tab</span>' : ''}</div>`; }).join(''); ac.querySelectorAll('div').forEach(d => d.onmousedown = e => { e.preventDefault(); ta.value = acItems[+d.dataset.i]; ac.hidden = true; this.submit(); }); };
    ta.oninput = () => { grow(); showAc(); };
    ta.onkeydown = e => { if (!ac.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length; ac.querySelectorAll('div').forEach((d, i) => d.classList.toggle('on', i === acIdx)); return; } if (e.key === 'Tab' && !ac.hidden && acIdx >= 0) { e.preventDefault(); ta.value = acItems[acIdx]; ac.hidden = true; grow(); return; } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!ac.hidden && acIdx >= 0 && ta.value.trim().length < 3) ta.value = acItems[acIdx]; ac.hidden = true; this.submit(); } if (e.key === 'Escape') { ac.hidden = true; if (this.mode === 'floating') this.togglePanel(false); } };
    ta.onblur = () => setTimeout(() => { ac.hidden = true; }, 150);
    send.onclick = () => this.submit();
    r.querySelectorAll('.ch-chip').forEach(c => c.onclick = () => { ta.value = c.textContent; this.submit(); });
    r.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.preventDefault(); const a = b.dataset.a; if (a === 'close') this.togglePanel(false); if (a === 'clear') { this.history = []; $('.ch-msgs', r).innerHTML = ''; this.bot(`<p>${esc(this.persona.greeting)}</p>`, [], true); } if (a === 'settings') this.settings(); });
    const mic = $('.ch-btn.mic', r); if (mic) mic.onclick = () => this.listen(ta, mic, grow);
  }
  listen(ta, btn, grow) { const R = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new R(); rec.lang = 'en-US'; rec.interimResults = true; btn.classList.add('on'); rec.onresult = e => { ta.value = Array.from(e.results).map(x => x[0].transcript).join(''); grow(); }; rec.onend = () => { btn.classList.remove('on'); if (ta.value.trim()) this.submit(); }; rec.onerror = () => btn.classList.remove('on'); rec.start(); }
  append(role, html) { const m = $('.ch-msgs', this.root); if (!m) return null; const d = document.createElement('div'); d.className = `ch-msg ${role}`; d.innerHTML = html; m.appendChild(d); m.scrollTop = m.scrollHeight; return d; }
  bot(html, links = [], silent = false, followups = []) { const full = `${html}${links.length ? `<div class="ch-links">${links.join('')}</div>` : ''}${followups.length ? `<div class="ch-links">${followups.map(f => `<button class="ch-chip" data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}`; const d = this.append('bot', full); if (d) d.querySelectorAll('[data-f]').forEach(b => b.onclick = () => this.ask(b.dataset.f)); if (!silent) this.history.push({ role: 'assistant', html: full, text: html.replace(/<[^>]+>/g, ' ') }); return d; }
  async submit() { const ta = $('textarea', this.root); const q = ta.value.trim(); if (!q) return; ta.value = ''; ta.style.height = 'auto'; $('.ch-btn.send', this.root).disabled = true; await this.ask(q); }
  async ask(q) {
    if (this.mode === 'inline') { $('.ch-thread', this.root).classList.add('open'); } else if (!this.open) this.togglePanel(true);
    this.append('user', esc(q)); this.history.push({ role: 'user', html: esc(q), text: q });
    const typing = this.append('bot', '<span class="ch-typing"><i></i><i></i><i></i></span>');
    try {
      const intents = [...(this.extra || []), ...this.persona.intents];
      const hit = intents.find(i => i.rx.some(rx => rx.test(q)));
      let res = null; if (hit && !(LLM.key() && LLM.always())) { try { res = await hit.run(q); } catch (e) { console.warn('intent failed', hit.id, e); res = null; } }
      if (res) { typing.remove(); this.bot(res.html, res.links || [], false, res.followups || []); if (res.go && this.mode === 'inline') setTimeout(() => { location.href = res.go; }, 900); return; }
      const docs = await retrieve(q, this.persona);
      if (LLM.key()) {
        const ctx = docs.map(d => `• ${d.t}: ${d.s}`).join('\n');
        const sys = `You are ${this.persona.name}, an assistant embedded in ${this.id === 'portal' ? "Broad Sky Partners' operating-intelligence portal (a private-equity firm in New York; portfolio: Commonwealth Electrical Technologies, Punctual Pros, Frontline Managed Services, Thomas Scientific, Bully Pulpit International, Fair Harbor)" : `the website of ${this.persona.name.replace(/ (assistant|desk|advisor|concierge|helper)$/i, '')}`}. Answer concisely in markdown (short headings, bullets, bold numbers). Ground every claim in the context below; if the context does not cover it, say so and point to the most relevant portal view. Today is ${new Date().toDateString()}.\n\nCONTEXT:\n${ctx}`;
        typing.innerHTML = ''; let acc = '';
        try { for await (const t of LLM.stream(sys, this.history.slice(0, -1).map(h => ({ role: h.role, content: h.text })), q)) { acc += t; typing.innerHTML = mdLite(acc); typing.parentElement.scrollTop = 1e9; } typing.remove(); this.bot(mdLite(acc), docs.filter(d => d.href).slice(0, 3).map(d => link(d.href, d.t)), false); return; }
        catch (e) { typing.remove(); this.bot(`<p>Claude request failed: ${esc(e?.message || e)}. Showing grounded results instead.</p>`, []); }
      } else typing.remove();
      if (docs.length) { const faq = docs.find(d => d.faq); this.bot(faq ? faq.html : `<p>Here is what the portal has on that:</p><ul>${docs.map(d => `<li><b>${esc(d.t)}</b> — ${esc(d.s.slice(0, 180))}${d.s.length > 180 ? '…' : ''}</li>`).join('')}</ul>`, docs.filter(d => d.href).slice(0, 3).map(d => link(d.href, d.t)), false, this.persona.suggestions.slice(0, 2)); }
      else this.bot(`<p>I could not find that in the portal's datasets. Try one of these:</p>`, [], false, this.persona.suggestions.slice(0, 3));
    } catch (e) { typing?.remove(); this.bot(`<p>Something went wrong: ${esc(e?.message || e)}</p>`, []); }
  }
  settings() {
    const m = document.createElement('div'); m.className = `ch ch-modal ${this.isDark() ? 'ch-dark' : ''}`;
    m.innerHTML = `<div class="ch-card"><h3>Claude for free-form questions <span class="ch-badge">optional</span></h3><p>Grounded answers work without a key. Add your own Anthropic API key to let Claude answer open questions using the same retrieved context. The key is stored only in this browser (localStorage) and sent only to api.anthropic.com.</p><label>API key</label><input type="password" id="ch-key" placeholder="sk-ant-…" value="${esc(LLM.key())}"><label>Model</label><select id="ch-model">${['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'].map(x => `<option ${LLM.model() === x ? 'selected' : ''}>${x}</option>`).join('')}</select><label>Mode</label><select id="ch-mode"><option value="fallback" ${!LLM.always() ? 'selected' : ''}>Use Claude only when no grounded answer exists</option><option value="always" ${LLM.always() ? 'selected' : ''}>Always use Claude (grounded with portal context)</option></select><div class="row"><button class="btn" data-x="clear">Remove key</button><button class="btn" data-x="cancel">Cancel</button><button class="btn pri" data-x="save">Save</button></div></div>`;
    document.body.appendChild(m);
    m.onclick = e => { if (e.target === m) m.remove(); };
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { const x = b.dataset.x; try { if (x === 'save') { localStorage.setItem(KEY_LS, $('#ch-key', m).value.trim()); localStorage.setItem(MODEL_LS, $('#ch-model', m).value); localStorage.setItem(MODE_LS, $('#ch-mode', m).value); } if (x === 'clear') { localStorage.removeItem(KEY_LS); } } catch { } m.remove(); if (this.open) this.togglePanel(true); });
  }
}
window.BSPChat = Chat;
