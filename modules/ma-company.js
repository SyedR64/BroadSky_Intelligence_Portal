/* Acquisition engine: the company block above the one add-on target list (modules/ma.js, pipeline screen).
   No company picked: six company cards. A company picked: its brief (thesis, facts about the hand-researched list, map,
   ranked picks, sponsor-backed buyers, and what only that company's old targets screen carried). A single target or a
   search open: one line.
   This file has NO imports. Everything it needs from ma.js arrives in `kit`, so the two files can never load each other
   twice under different version stamps. One export: companyBlock(). */

/* Company sites drawn on the map. BPI and Fair Harbor take their HQ from the firm profile. */
const SITES = {
  cet: [{ lat: 42.2626, lon: -71.8023, label: 'CET HQ · Worcester', size: 14 }, { lat: 41.9001, lon: -71.0898, label: 'CET · Taunton', size: 11 },
    { lat: 42.1615, lon: -70.7928, label: 'NuWave · Norwell', size: 11 }, { lat: 41.8243, lon: -72.8937, label: 'Horton · Canton CT', size: 12, note: 'Horton Electrical Services, acquired September 15, 2026' }],
  pp: [{ lat: 40.0629, lon: -76.37, label: 'PP HQ', size: 13, note: 'East Hempfield, Lancaster County' }, { lat: 39.939, lon: -74.2021, label: 'Horvath', size: 11, note: 'Horvath Home Services, Beachwood NJ' }],
  fl: [['St. Louis, MO', 38.627, -90.1994, 'HQ · service desk · RCM'], ['Toledo, OH', 41.6528, -83.5379, 'Service desk hub'], ['New York, NY', 40.7128, -74.006, 'Glasser Tech legacy · legal IT'],
    ['Washington, DC', 38.9072, -77.0369, 'Regional office'], ['Nashville, TN', 36.1627, -86.7816, 'Regional office'], ['Honolulu, HI', 21.3069, -157.8583, 'Pacific time-zone coverage'],
    ['Toronto, ON', 43.6532, -79.3832, 'Canada (since 2010)'], ['London, UK', 51.5074, -0.1278, 'UK / EMEA (since 2009)'], ['Hyderabad, IN', 17.385, 78.4867, 'Offshore delivery'],
    ['Goa, IN', 15.4909, 73.8278, 'Offshore delivery · RCM'], ['Cape Town, ZA', -33.9249, 18.4241, 'Follow-the-sun desk (Jul 2023)']].map(([name, lat, lon, note]) => ({ lat, lon, label: name.split(',')[0], size: 9, note: `Frontline · ${name} · ${note}` })),
  ts: [{ lat: 39.7476, lon: -75.3105, label: 'Thomas HQ', size: 13, note: 'Swedesboro, NJ' }],
};
const RING = { pp: { lat: 40.0629, lon: -76.37, miles: 60, label: '60 miles from HQ' } };
const VIEWPORT = { cet: [[42.3, -71.6], 7, 9], pp: [[40.0, -75.9], 7, 8], fl: [[39, -96], 4, 6], ts: [[40, -92], 4, 6], bpi: [[39, -96], 4, 6], fh: [[39, -96], 4, 6] };
const TIER_TOK = { 'Tier 1': 'var(--sys-good)', 'Tier 2': 'var(--sys-info)', 'Tier 3': 'var(--sys-warn)', 'Tier 4': 'var(--sys-mute-2)' };
const LEGEND_MIN_W = 520;   // a map narrower than this prints its legend as chips under the map: inside, it would cover the map
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/* ── thesis: counts and the written read of each company's pool ──────────────────────────────────────────── */
function thesisStats(b, p, kit) {
  const { DIM_MAX, countBy, topN, median, handOnly, num } = kit;
  const T = b.targets.filter(t => t._p === p);
  const n = T.length; const own = countBy(T, t => t._owner);
  const dims = {}; const mx = DIM_MAX[p] || {};
  T.filter(t => t._src !== 'sba').forEach(t => Object.entries(t.fit_breakdown || {}).forEach(([k, v]) => { (dims[k] = dims[k] || []).push((num(v) || 0) / (mx[k] || 20)); }));
  const dimAvg = Object.entries(dims).map(([k, a]) => [k, a.reduce((s, x) => s + x, 0) / a.length]).sort((x, y) => y[1] - x[1]);
  const H = handOnly(T);
  return { T, H, n, nSba: n - H.length, nHand: H.length, t1: T.filter(t => t._tier === 'Tier 1').length, t2: T.filter(t => t._tier === 'Tier 2').length, t1Sba: T.filter(t => t._tier === 'Tier 1' && t._src === 'sba').length,
    medEmp: median((H.length ? H : T).map(t => t.employees)), medRev: median(H.map(t => t.revenue_est_usd)), medRevSba: median(T.filter(t => t._src === 'sba').map(t => t.revenue_est_usd)),
    ff: own['Founder / family'] || 0, unv: own.Unverified || 0, states: topN(countBy(T, t => t._state), 6), dimAvg,
    risks: topN(countBy(T.flatMap(t => t.risk_flags || []), x => x), 4), affil: T.filter(t => t._affil),
    dens: T.filter(t => !t._affil && t._reach === 'Density tuck-in').length, hub: T.filter(t => !t._affil && t._reach === 'New-hub anchor').length };
}
/** The written thesis in two parts: the read of the pool, and the analyst view (its first sentence is the card line). */
function thesisParts(b, p, s, fmt, kit) {
  const { REACH_TXT, pctOf, handOnly } = kit; const T = s.T, heat = b.pe?.meta?.sector_heatmap || {};
  const stateMix = s.states.map(([k, v]) => `${k} ${v}`).join(', ');
  if (p === 'cet') { const ct = T.filter(t => t._state === 'CT').length;
    return { pool: `CET’s pool is ${s.n} New England electrical, solar, controls and generator contractors (${stateMix}). ${s.dens} of ${s.n} are density tuck-ins (${REACH_TXT.cet}); the other ${s.hub} would be new-hub or capability anchors. ${ct} are in Connecticut, where Horton (120+ staff, Sept 2026) now gives CET a base. The median target has ${fmt.num(s.medEmp)} staff and ${fmt.money(s.medRev)} of modeled revenue, so these are tuck-ins, not mergers of equals. Ownership is the main risk: ${s.unv} of ${s.n} have unverified ownership and only ${s.ff} are confirmed founder or family-owned.`,
      view: ['CET should buy capability (W/WW I&C, generators, solar O&M, controls) and Eastern-MA density now.', `The PE landscape rates the sector “${heat.cet?.intensity || 'medium, rising'}”, and the Kohlberg and Huron electrical companies have not yet entered New England.`] }; }
  if (p === 'pp') { const tri = T.filter(t => ['hvac', 'plumbing', 'electrical'].every(x => (t.trades || []).includes(x))).length;
    const auth = T.filter(t => /One Hour|Benjamin Franklin|Mister Sparky/i.test(`${t.brands_or_franchise || ''} ${t.company}`)).length; const rev1k = T.filter(t => (t.review_count || 0) >= 1000).length;
    return { pool: `Punctual Pros has ${s.n} residential HVAC, plumbing and electrical operators screened across PA, NJ, MD and DE (${stateMix}). ${s.dens} are density tuck-ins (${REACH_TXT.pp}) that add route density to existing dispatch; the other ${s.hub} are new-hub anchors, i.e. branch acquisitions that need their own GM, dispatch and marketing plan. ${s.affil.length ? `${s.affil.length} more trade${s.affil.length === 1 ? 's' : ''} under the Punctual Pros name and ${s.affil.length === 1 ? 'is' : 'are'} held out until affiliation is confirmed. ` : ''}${tri} already run all three trades, ${auth} operate Authority Brands territories that could transfer, and ${rev1k} have 1,000+ reviews. Most are small (median ${fmt.num(s.medEmp)} staff, ${fmt.money(s.medRev)} est. revenue), and ${pctOf(s.ff, s.n)}% are family- or founder-owned, so the likely sellers are owners planning succession.`,
      view: ['Punctual Pros has to win proprietary deals before they go to auction.', `The PE landscape rates the sector “${heat.punctual_pros?.intensity || 'very high'}”, and Sila (Goldman Sachs), Legacy (Gridiron) and Ally (Watchtower) are all buying in its counties.`] }; }
  if (p === 'fl') { const catx = T.filter(t => ['CA', 'TX'].includes(t._state)).length; const intl = T.filter(t => t.country && t.country !== 'United States').length;
    const bill = T.filter(t => /billing|rcm|revenue|invoice|accounting/i.test((t.offerings || []).join(' '))).length; const small = handOnly(T).filter(t => t.revenue_est_usd != null && t.revenue_est_usd <= 15e6).length;   // vendor figures only: the profile was set on them
    return { pool: `Frontline has ${s.n} legal-IT managed-service and law-firm billing/RCM targets (${stateMix}; ${intl} outside the US). ${catx} are in California or Texas, two of Frontline’s stated priority geographies (set under former CEO Naidoo; re-confirm with Tim Britt, CEO since Jan 2026), and ${bill} offer billing, eBilling or RCM services that extend Frontline’s second product line. ${small} of the ${s.nHand} hand-researched targets have modeled revenue at or below $15M, which fits the previously stated tuck-in profile of ~$5M revenue and $1–2M EBITDA.`,
      view: [`the PE landscape rates the sector “${heat.frontline?.intensity || 'low-medium'}” and finds no sponsor-backed copy of the legal IT + RCM model.`, 'The window to lock in law-firm MSP and billing add-ons is open, but it will close once a generalist MSP roll-up (Alpine’s Evergreen) builds a legal vertical.'] }; }
  if (p === 'ts') { const cr = T.filter(t => /cleanroom|controlled/i.test((t.offerings || []).join(' ') + ' ' + (t.strategic_rationale || ''))).length; const nonNE = T.filter(t => !['NJ', 'NY', 'PA', 'MA', 'CT'].includes(t._state)).length;
    return { pool: `Thomas Scientific has ${s.n} lab-supply, life-science and cleanroom distributors (${stateMix}). ${nonNE} are outside Thomas’s Northeast core and would extend its distribution network, and ${cr} bring cleanroom or controlled-environment lines. The screen found no public Thomas acquisition since late 2023, so the company’s earlier add-on pace (regional distributors: NCI, Quintana, Day, Arrowhead) has stalled. The median target has ${fmt.num(s.medEmp)} staff and ${fmt.money(s.medRev)} of modeled revenue.`,
      view: ['restart the programme with exclusive line-card and regional-coverage deals.', 'Calibre Scientific (StoneCalibre) is the main bidder, but its focus is mostly Europe, which leaves room in the US.'] }; }
  return null;   // BPI and Fair Harbor: no hand-researched list and no written thesis
}
/* BPI and Fair Harbor: built only from what the loan screen already says about them; not a thesis. */
const NO_THESIS = {
  bpi: 'No hand-researched list yet. Every candidate comes from SBA loan records. First step: confirm ownership and client mix (public affairs, advocacy, research).',
  fh: 'No hand-researched list yet. Every candidate comes from SBA loan records, a weak source here: most apparel borrowers are contract sewers and boutiques. First step: confirm each is a branded apparel or swim company.',
};
const IDEAL = kit => ({
  cet: ['25–400 employees and $8–120M revenue (rubric scale band)', `Density tuck-in: ${kit.REACH_TXT.cet}; new-hub anchor: CT near Horton`, 'Capabilities that extend CET lines: solar O&M, EV, energy efficiency, W/WW I&C, generators, controls', 'Founder or family owner with a succession need; labour model compatible with CET’s', 'Licensed in several New England states; recurring service/maintenance mix'],
  pp: ['Tri-trade HVAC + plumbing + electrical (top trade-mix score, 20)', '30–150 employees (rubric scale 17–20)', `Density tuck-in: ${kit.REACH_TXT.pp}; farther = new-hub anchor (branch plan needed)`, 'Founder or multi-generation family owner with long tenure', 'Authority Brands franchisee, or 1,000+ reviews and ready to rebrand'],
  fl: ['Law-firm-focused MSP or billing/eBilling/RCM provider', 'Tuck-in ~$5M revenue / $1–2M EBITDA; larger targets at $20M+ revenue', 'Priority geographies: California, Texas, Atlanta, South Florida, UK (stated under former CEO Naidoo; re-confirm with CEO Tim Britt)', 'Point solutions, proprietary software or GenAI capability', 'Founder- or partner-owned, with clean SOC 2 / security posture'],
  ts: ['Regional life-science, clinical or cleanroom distributor', 'Exclusive or hard-to-replicate supplier line cards', 'Geography outside the Northeast core (Midwest, West, Canada)', 'Family or founder owner; 20–150 staff', 'Private-label or kitting capability (margin lever vs 4–5% pure-distributor margins)'],
});
const INTEG = {
  cet: ['Union vs open-shop labour models across add-ons', 'Licence and bonding transfer on change of control', 'Backlog quality and project-margin discipline (public comps: 6–10% op. margin)'],
  pp: ['Brand-conversion dis-synergy when retiring heritage brands', 'Technician retention through dispatch and pay-plan changes', 'Franchisor approval needed for Authority Brands territory transfers'],
  fl: ['Law-firm client concentration and partner-level relationships', 'Service-desk tooling migration onto HELIX', 'Security and compliance posture (SOC 2) of acquired MSPs'],
  ts: ['Supplier change-of-control consents on line cards', 'ERP and catalogue migration; pricing harmonisation', 'Customer overlap with existing Northeast accounts'],
};

/* ── facts about each hand-researched list (they were the KPI rows of the four company target screens), as chips ── */
function handFacts(ctx, b, p, s, kit) {
  const { fmt } = ctx; const { countBy, topN, median, rankedFor } = kit; const H = s.H; if (!H.length) return [];
  const live = H.filter(t => !t._affil); const meta = kit.metaFor(b, p) || {};
  // a ranked pick the loan screen found already sold stays on the ranked list (flagged) but out of the revenue sum
  const ranked = rankedFor(b, p).map(r => b.byId.get(r.id)).filter(t => t && !t._soldPerSba);
  const rankedRev = ranked.reduce((a, t) => a + (t.revenue_est_usd || 0), 0);
  const top3 = topN(countBy(H, t => t._state), 3).map(([k, v]) => `${k} ${v}`).join(' · ');
  const fit80 = H.filter(t => (t.fit_score || 0) >= 80).length;
  if (p === 'cet') return [top3, `${H.filter(t => (t.fit_score || 0) >= 65).length} at fit 65 or more · top score ${Math.max(...H.map(t => t.fit_score || 0))}`,
    `${H.filter(t => t._owner === 'Founder / family').length} founder or family owned · ${H.filter(t => t._owner === 'Unverified').length} ownership unknown`,
    `${H.filter(t => (t.nearest_cet_node_miles ?? 999) <= 30).length} within 30 miles of a node (Worcester · Taunton · Norwell)`, `ranked ${ranked.length}: ${fmt.money(rankedRev)} revenue est.`, `${(meta.screened_and_excluded || []).length} screened out`];
  if (p === 'pp') return [`${live.length} ranked · ${s.affil.length} held`, `PA ${live.filter(t => t._state === 'PA').length} · NJ ${live.filter(t => t._state === 'NJ').length}`,
    `${live.filter(t => /franchisee/.test(t.ownership || '')).length} Authority Brands franchisees · same brands, no rebrand`, `${live.filter(t => /family|founder/.test(t.ownership || '')).length} family or founder owned`,
    `${live.filter(t => t.distance_mi_from_lancaster <= 60 || t.distance_mi_from_toms_river <= 40).length} within 60 mi of Lancaster or 40 of Toms River`, `median ${fmt.num(median(live.map(t => t.distance_mi_from_lancaster)))} mi from Lancaster`,
    `${(meta.excluded_pe_or_strategic_owned || []).length} PE-owned excluded`];
  if (p === 'fl') { const top = rankedFor(b, p); const avg = top.length ? top.reduce((a, r) => a + (r.fit_score || 0), 0) / top.length : null;
    return [`ranked ${top.length}: average fit ${fmt.num(avg, 0)}`, `${fit80} at fit 80 or more`,
      `${H.filter(t => ['CA', 'TX', 'FL', 'GA'].includes(t._state) || t.country === 'United Kingdom').length} in the stated priority regions (CA · TX · GA · FL · UK)`,
      `${H.filter(t => t.revenue_est_usd && t.revenue_est_usd <= 15e6).length} at $15M revenue or less est. · ${H.filter(t => t.revenue_est_usd && t.revenue_est_usd >= 20e6).length} at $20M or more`,
      `${H.filter(t => /billing|revenue|invoice|accounting|time entry/i.test(JSON.stringify(t.offerings || []))).length} billing or revenue-cycle specialists (extend InvoicePrep and eBilling)`,
      `${fmt.num(H.reduce((a, t) => a + (t.employees || 0), 0))} combined staff est.`]; }
  if (p === 'ts') return [`${new Set(H.map(t => t._state)).size} states / provinces`, `${fit80} at fit 80 or more`, `ranked ${ranked.length}: ${fmt.money(rankedRev)} revenue est.`];
  return [];
}
function rubricLine(b, p, kit) {
  const m = kit.metaFor(b, p) || {}; const { Copy } = kit;
  if (p === 'cet') return `Scoring rubric: ${Object.entries(m.scoring_rubric || {}).map(([k, v]) => `${Copy.field(k).toLowerCase()} ${String(v).split(':')[0]}`).join(' · ')}`;
  if (p === 'pp') return `Fit rubric: ${Object.keys(m.scoring_rubric || {}).map(k => k.replace(/_/g, ' ')).join(' · ')} (20 pts each)`;
  if (p === 'fl' || p === 'ts') return `Fit weights: ${Object.entries(b.flts?.meta?.scoring_weights || {}).map(([k, v]) => `${Copy.field(k)} ${Math.round(v * 100)}%`).join(' · ')}`;
  return '';
}
/** Sponsor-backed buyers in one shape for all four companies. The Punctual Pros list ends with a bucket of excluded
    strategic owners ("Other excluded …"), which is not a buyer. Every regional holding on record is printed: this screen
    is the one home of these rows. */
function buyers(b, p) {
  const src = p === 'cet' ? b.cet?.meta?.pe_backed_competitors : p === 'pp' ? b.pp?.meta?.pe_backed_competitors : p === 'fl' ? b.flts?.meta?.frontline?.pe_backed_competitors : p === 'ts' ? b.flts?.meta?.thomas_scientific?.pe_backed_competitors : null;
  return (src || []).filter(c => !/^Other/i.test(c.platform || '')).map(c => ({ name: c.company || c.platform, hq: c.hq || '', owner: c.owner || c.sponsor || '', year: c.year || '',
    detail: [c.threat, c.note || c.notes, c.scale ? `Scale: ${c.scale}` : '', (c.regional_holdings || []).length ? `Holdings in the region: ${c.regional_holdings.join('; ')}` : '', c.footprint ? `Footprint: ${c.footprint}` : ''].filter(Boolean),
    sources: c.sources || [] }));
}

/* ── draw ──────────────────────────────────────────────────────────────────────────────────────────────── */
const bul = xs => `<ul class="bul">${xs.map(x => `<li>${x}</li>`).join('')}</ul>`;
/* A closed section: the portal's one disclosure (.ma-how in ma.css), with room for a table inside. */
const sec = (id, summary, body, foot = '', open = false) => `<details class="ma-how ma-sec"${id ? ` id="${id}"` : ''}${open ? ' open' : ''}><summary>${summary}</summary><div class="ma-sec-body">${body}</div>${foot ? `<div class="ma-how-foot">${foot}</div>` : ''}</details>`;
const WORDS = { 4: 'four', 5: 'five', 6: 'six' };

function cardsHtml(ctx, b, kit) {
  const { fmt, esc } = ctx; const { PLAT, PKEYS, SKEYS, handOnly, pctOf } = kit;
  const S = Object.fromEntries(SKEYS.map(p => [p, thesisStats(b, p, kit)]));
  const best = PKEYS.slice().sort((x, y) => (S[y].t1 + S[y].t2) / (S[y].n || 1) - (S[x].t1 + S[x].t2) / (S[x].n || 1))[0];
  const nHand = handOnly(b.targets).length, nAll = b.targets.length, nCo = SKEYS.filter(p => S[p].n).length;
  const card = p => { const P = PLAT[p], s = S[p]; if (!s.n) return ''; const th = thesisParts(b, p, s, fmt, kit);
    return `<a class="sys-card sys-card--link ma-co-card" data-co="" style="--co:${P.color}" href="#/ma/pipeline?platform=${p}">
      <div class="ma-deal-hd">${fmt.chip(P.label, P.color)}<span class="ma-deal-fit">${fmt.num(s.n)} targets · ${s.t1} Tier 1</span></div>
      <h3 class="sys-card-title">${esc(P.long)}</h3>
      <p class="sys-card-body">${esc(th ? cap(th.view[0]) : NO_THESIS[p])}</p>
      <div class="soft"><span class="ma-co-split">${s.nHand ? `${fmt.num(s.nHand)} hand-researched · ${fmt.num(s.nSba)} from SBA loan records` : `${fmt.num(s.nSba)} from SBA loan records`} · </span><b>Open the ${esc(P.label)} brief →</b></div></a>`; };
  return `<section class="ma-co-cards" aria-label="Add-on targets by company">
    <p class="h-note"><b>${fmt.num(nAll)} add-on targets across ${WORDS[nCo] || nCo} companies: ${fmt.num(nHand)} on the hand-researched list and ${fmt.num(nAll - nHand)} more from the SBA loan screen.</b> ${esc(PLAT[best].label)} has the richest pool (${pctOf(S[best].t1 + S[best].t2, S[best].n)}% Tier 1–2). Punctual Pros faces the hardest competition; CET has the most open field. Pick a company for its thesis, map and ranked picks.</p>
    <div class="sys-grid ma-co-grid">${SKEYS.map(card).join('')}</div></section>`;
}

/* A trade or specialty as the ranked list prints it: no bracketed aside, cut at a word, and HVAC in capitals as the list has it. */
const specialty = (x, kit) => { const y = kit.Copy.text(String(x).replace(/_/g, ' ')).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\bhvac\b/gi, 'HVAC').trim(); return y.length > 44 ? kit.clip(y, 44) : y; };

function rankedHtml(ctx, b, p, s, kit) {
  const { fmt, esc } = ctx; const { rankedFor, rankedRaw, clip, Copy, PLAT, PKEYS } = kit;
  if (!PKEYS.includes(p)) return '';   // only the four hand-researched lists carry a ranked list
  const ranked = rankedFor(b, p); if (!ranked.length) return '';
  const row = r => { const t = b.byId.get(r.id) || {}; const sold = !!t._soldPerSba;
    const place = `${t.hq_city || ''}${t.hq_city ? ', ' : ''}${t._state || r.state || ''}`;
    const bits = [place, t.employees != null ? `${fmt.num(t.employees)} staff` : '', t.revenue_est_usd ? `${fmt.money(t.revenue_est_usd)} est.` : '',
      (t.specialties || t.trades || t.offerings || []).slice(0, 2).map(x => specialty(x, kit)).join(', ')].filter(Boolean).join(' · ');
    return `<tr data-tid="${esc(r.id)}" tabindex="0"><td class="sys-n">${esc(r.rank)}</td><td class="nm"><b>${esc(r.company)}</b>${sold ? ` ${fmt.chip('already sold', 'var(--sys-bad)')}` : ''}<div class="dim small">${esc(bits)}</div>${r.why ? `<div class="small text-2">${esc(clip(r.why, 260))}</div>` : ''}</td><td class="sys-n">${fmt.score(sold ? t.fit_score : r.fit_score ?? t.fit_score)}</td></tr>`; };
  const P = PLAT[p];
  const held = s.affil.length ? `<div class="sys-note sys-note--warn note warn ma-co-held"><b>Held out: verify affiliation.</b> ${s.affil.map(t => `<span data-tid="${esc(t.id)}" tabindex="0" role="button"><b>${esc(t.company)}</b> (${esc(t.hq_city || '')}, ${esc(t._state)}; fit ${fmt.num(t.fit_score)}). ${esc(Copy.text(t.brands_or_franchise || ''))}. ${(t.risk_flags || []).map(r => esc(Copy.text(r))).join('. ')}.</span>`).join(' ')} Trades under the portfolio company’s own name: either already part of the ${esc(P.label)} network (owned or related party) or a brand conflict. <b>Do not contact the company until its affiliation is checked.</b> ${esc(P.label)} leadership to confirm status (owned · related party · independent) first.</div>` : '';
  const nHeld = rankedRaw(b, p).length - ranked.length;
  return ctx.ui.panel({ title: `Ranked picks (${ranked.length})`, sub: `The screen authors’ ranked list${nHeld ? `; ${nHeld} held out for an affiliation check and re-numbered` : ''}. Click a name for its profile and deal math.`, accent: true, scroll: true, flush: true, id: 'ma-co-ranked',
    body: `<div class="sys-table-wrap"><table class="sys-table mini"><thead><tr><th class="sys-n">#</th><th>Company</th><th class="sys-n">Fit</th></tr></thead><tbody>${ranked.map(row).join('')}</tbody></table></div>${held}` });
}

/* What only one company's old targets screen carried: Frontline's M&A plan, Thomas Scientific's add-on history. */
function extraHtml(ctx, b, p, kit) {
  const { fmt, esc, ui } = ctx; const { ceoFix, rankedFor, Copy } = kit;
  const srcs = pc => (pc.sources || []).length ? `Sources: ${pc.sources.slice(0, 4).map(u => fmt.link(u, fmt.host(u))).join(' · ')}` : '';
  if (p === 'fl') { const pc = b.flts?.meta?.frontline?.platform_context || {}; const top3 = rankedFor(b, p).slice(0, 3).map(r => r.company).join(', ');
    return sec('ma-co-extra', 'Frontline M&A plan: prior deals and stated criteria', `<div class="th-two"><div><div class="sys-card-label th-h">Prior acquisitions</div>${bul((pc.prior_acquisitions || []).map(x => esc(Copy.text(x))))}<div class="sys-card-label th-h">Divestitures</div>${bul((pc.divestitures || []).map(x => esc(Copy.text(x))))}${pc.recent ? `<div class="sys-card-label th-h">Recent</div><div class="h-note">${esc(Copy.text(pc.recent))}</div>` : ''}</div>
      <div>${pc.stated_criteria ? `<div class="sys-card-label th-h">Stated criteria</div><div class="h-note">${esc(ceoFix(pc.stated_criteria))}</div>` : ''}<div class="sys-card-label th-h">Next actions</div>${bul([`Approach the top 3 (${esc(top3)}) through PRG before the consolidators do`, 'Before any LOI, check whether revenue claims are ZoomInfo estimates (e.g. Helm360’s $116.5M)', 'Prioritise RCM/billing tuck-ins that extend InvoicePrep margins'])}</div></div>`, srcs(pc)); }
  if (p === 'ts') { const pc = b.flts?.meta?.thomas_scientific?.platform_context || {}; const prior = pc.prior_acquisitions || [];
    return sec('ma-co-extra', `Thomas Scientific add-on history: ${prior.length} deals since December 2017, none since October 2023`, `${ui.timeline(prior.slice().reverse().map(a => ({ date: (String(a).match(/\(([^)]*)\)\s*$/) || [])[1] || '', text: String(a).replace(/\s*\([^)]*\)\s*$/, '') })))}
      ${pc.observation ? `<div class="h-note">${esc(Copy.text(pc.observation))}</div>` : ''}<div class="sys-card-label th-h">What to do</div>${bul(['<b>Re-open the add-on engine.</b> There has been no deal since October 2023. Run owner outreach on the ranked picks through PRG; start with founder- and family-owned targets (lowest process risk).', '<b>Buy margin, not just revenue.</b> Prioritize targets that add gross margin and stocking reach: private label, cleanroom, equipment service. Structure with seller notes or earn-outs where founders stay on.'])}`, srcs(pc)); }
  return '';
}

function briefHtml(ctx, b, p, kit) {
  const { fmt, esc, ui } = ctx; const { PLAT, titleCase, pctOf, sourceFoot, metaFor, nextActionFor, Copy, ceoFix } = kit;
  const P = PLAT[p], s = thesisStats(b, p, kit), th = thesisParts(b, p, s, fmt, kit), meta = metaFor(b, p);
  const strongest = s.dimAvg[0], weakest = s.dimAvg[s.dimAvg.length - 1];
  const chips = `${fmt.chip(`median ${fmt.num(s.medEmp)} staff (${s.nHand ? 'hand-researched' : 'loan screen'})`)}${s.medRev != null ? fmt.chip(`median ${fmt.money(s.medRev)} rev. est. (hand-researched)`) : ''}${s.medRevSba != null ? fmt.chip(`loan screen median ${fmt.money(s.medRevSba)} (Census model)`, 'var(--sys-info)') : ''}${fmt.chip(`${pctOf(s.ff, s.n)}% founder/family`, 'var(--sys-good)')}${s.unv ? fmt.chip(`${s.unv} ownership unverified`, 'var(--sys-warn)') : ''}${s.dens + s.hub ? fmt.chip(`${s.dens} density · ${s.hub} new-hub`, 'var(--sys-info)') : ''}${s.affil.length ? fmt.chip(`${s.affil.length} held · verify affiliation`, 'var(--sys-bad)') : ''}${strongest ? fmt.chip(`strongest: ${titleCase(strongest[0])} ${Math.round(strongest[1] * 100)}%`, P.color) : ''}${weakest && weakest !== strongest ? fmt.chip(`weakest: ${titleCase(weakest[0])} ${Math.round(weakest[1] * 100)}%`, 'var(--sys-warn)') : ''}`;
  const facts = handFacts(ctx, b, p, s, kit); const comps = buyers(b, p); const rub = rubricLine(b, p, kit);
  const riskList = th ? [...s.risks.map(([r, c]) => `${esc(Copy.text(r))} <span class="soft">(${c} target${c === 1 ? '' : 's'})</span>`), ...INTEG[p].map(esc)].slice(0, 6) : [];
  // the two lists are open on a laptop and a closed section on a phone, where the brief would otherwise push the list a screen further down
  const lists = th ? sec('', 'Ideal target profile and integration risks', `<div class="th-two"><div><div class="sys-card-label th-h">Ideal target profile</div>${bul(IDEAL(kit)[p].map(esc))}</div><div><div class="sys-card-label th-h">Integration risks</div>${bul(riskList)}</div></div>`, '', window.matchMedia('(min-width:901px)').matches) : '';
  const brief = ui.panel({ accent: true, title: `${esc(P.long)}: add-on brief`,
    sub: `${fmt.num(s.n)} targets: ${s.nHand ? `${fmt.num(s.nHand)} on the hand-researched list and ${fmt.num(s.nSba)} from the <a href="#/ma/screen">SBA loan screen</a>` : `all from the <a href="#/ma/screen">SBA loan screen</a>`} · ${s.t1} Tier 1${s.t1Sba && s.nHand ? ` (${s.t1 - s.t1Sba} hand-researched + ${s.t1Sba} from SBA loans)` : ''} · ${s.t2} Tier 2`,
    actions: `<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm btn xs" data-ma-jump>The list (${fmt.num(s.n)}) ↓</button><a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/${esc(P.module)}/overview">${esc(P.label)} operating picture →</a>`,
    body: `<div style="--cc:${P.color}"><div class="sys-chips stat-row">${chips}</div>
      ${th ? `<div class="sys-card-label th-h">Thesis <span class="sys-est sys-est--illus analyst">analyst view</span></div><div class="h-note">${esc(th.pool)} Analyst view: ${esc(th.view.join(' '))}</div>`
        : `${ui.note(esc(NO_THESIS[p]), 'info')}<div class="sys-card-label th-h">Next step</div><div class="h-note">${esc(nextActionFor(p))}</div>`}
      ${facts.length ? `<div class="sys-card-label th-h">On the hand-researched list (${fmt.num(s.nHand)})</div><div class="sys-chips stat-row">${facts.map(x => fmt.chip(x)).join('')}</div>` : ''}
      ${lists}
      ${rub ? `<div class="soft mt-8">${esc(rub)}</div>` : ''}</div>`,
    foot: sourceFoot(ui, meta, s.nHand ? `${P.label} add-on screen (ZoomInfo + websites)` : 'SBA loan screen') });
  const ranked = rankedHtml(ctx, b, p, s, kit);
  const ring = RING[p];
  const mapSub = `Colour is fit tier.${s.nHand ? ' Solid dots are hand-researched; smaller, paler dots come from SBA loan records.' : ''}${ring ? ` The ring is ${ring.miles} miles from the Lancaster HQ.` : ''}${p === 'fl' ? ` Markers are Frontline offices. ${s.T.filter(t => t.country === 'United Kingdom').length} UK targets are off the map.` : ''}${p === 'ts' ? ' Thomas Scientific’s demand clusters are on its operating picture.' : ''}`;
  const map = ui.panel({ title: 'Where the targets are', sub: mapSub, cls: 'ma-co-map', flush: true, body: '<div class="map" id="ma-co-map"></div><div class="sys-chips ma-co-legend" id="ma-co-legend" hidden></div>', foot: ui.source('Add-on target lists (ZoomInfo search, company websites); SBA PPP, 7(a) and 504 loan records', null, meta?.generated) });
  const buyersSec = comps.length ? sec('ma-co-buyers', `Sponsor-backed buyers competing for these targets (${comps.length})`,
    `<div class="sys-table-wrap"><table class="sys-table mini ma-stack"><thead><tr><th>Buyer</th><th>Owner or sponsor</th><th>What it is doing</th><th>Sources</th></tr></thead><tbody>${comps.map(c => `<tr><td class="nm"><b>${esc(c.name)}</b><div class="dim small">${esc(c.hq)}${c.year ? `${c.hq ? ' · ' : ''}${esc(c.year)}` : ''}</div></td><td class="wrap small">${esc(Copy.text(c.owner) || 'not verified')}</td><td class="wrap small text-2">${c.detail.map(d => esc(ceoFix(String(d)).replace(/\bin this run\b/g, 'in this pass'))).join('<br>')}</td><td class="small">${c.sources.map(u => fmt.link(u)).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`,
    'A sponsor-backed buyer bids for the same owners. Approach founder- and family-owned names first.') : '';
  const extra = extraHtml(ctx, b, p, kit);
  return `<section class="ma-co-brief" aria-label="${esc(P.label)} add-on brief">${brief}<div class="${ranked ? 'grid grid-main' : ''} mt-12">${map}${ranked}</div>${buyersSec ? `<div class="mt-12">${buyersSec}</div>` : ''}${extra ? `<div class="mt-12">${extra}</div>` : ''}</section>`;
}

function drawMap(ctx, host, b, p, kit) {
  const { maps, fmt, esc } = ctx; const { PLAT, tok, SRC_LABEL, openTarget } = kit; const P = PLAT[p];
  const el = host.querySelector('#ma-co-map'); if (!el || !window.L) return null;
  const [center, zoom, maxFit] = VIEWPORT[p] || VIEWPORT.fl;
  const map = maps.create(el, { center, zoom });
  const T = b.targets.filter(t => t._p === p && t.lat != null && t.lon != null);
  const col = t => tok(t._affil ? 'var(--sys-bad)' : TIER_TOK[t._tier] || 'var(--sys-mute-2)');
  const pop = t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)} · fit ${fmt.num(t.fit_score)} (${esc(t._tier)})${t._src === 'sba' ? `<br><span class="muted">${SRC_LABEL}</span>` : ''}${t._affil ? '<br><b>Name conflict: verify affiliation</b>' : ''}`;
  maps.points(map, T.filter(t => t._src === 'sba'), { color: col, stroke: tok('var(--sys-surface)'), radius: 4, cluster: false, opacity: .45, weight: .5, popup: pop, onClick: t => openTarget(ctx, t, b) });
  maps.points(map, T.filter(t => t._src !== 'sba'), { color: col, stroke: tok('var(--sys-surface)'), radius: t => t._tier === 'Tier 1' ? 8 : t._tier === 'Tier 2' ? 6.5 : 5, cluster: false, opacity: .9, popup: pop, onClick: t => openTarget(ctx, t, b) });
  const sites = SITES[p] || (() => { const i = (b.firm?.items || []).find(x => x.id === P.firmId); return i && i.lat != null ? [{ lat: i.lat, lon: i.lon, label: `${P.label} HQ`, size: 13, note: `${i.hq_city || ''}, ${i.state || ''}` }] : []; })();
  for (const n of sites) maps.marker(map, n.lat, n.lon, { color: tok(P.color), label: n.label, size: n.size || 11, popup: `<b>${esc(n.label)}</b>${n.note ? `<br>${esc(n.note)}` : ''}` });
  const ring = RING[p]; if (ring) maps.circle(map, ring.lat, ring.lon, ring.miles * 1609, { color: tok(P.color), fill: .03, dash: '4 4' });
  const legend = [{ token: TIER_TOK['Tier 1'], label: 'Tier 1 (80+)' }, { token: TIER_TOK['Tier 2'], label: 'Tier 2 (65–79)' }, { token: TIER_TOK['Tier 3'], label: 'Tier 3 (50–64)' }, { token: TIER_TOK['Tier 4'], label: 'Tier 4 (under 50)' },
    ...(T.some(t => t._src === 'sba') ? [{ token: 'var(--sys-mute)', pale: true, label: `Paler, smaller dots: ${SRC_LABEL}` }] : []),
    { token: P.color, label: `${P.label} ${sites.length > 1 ? 'sites' : 'HQ'}`, ring: true }, ...(ring ? [{ token: P.color, label: ring.label, ring: true }] : []), ...(T.some(t => t._affil) ? [{ token: 'var(--sys-bad)', label: 'Name conflict · verify' }] : [])];
  const chipsEl = host.querySelector('#ma-co-legend');
  if (chipsEl && el.clientWidth < LEGEND_MIN_W) { chipsEl.hidden = false; chipsEl.innerHTML = legend.map(i => `<span class="sys-chip" data-co="" style="--co:${i.pale ? `color-mix(in srgb, ${i.token} 45%, transparent)` : i.token}">${esc(i.label)}</span>`).join(''); }
  else maps.legend(map, legend.map(i => ({ color: i.pale ? `color-mix(in srgb, ${tok(i.token)} 45%, transparent)` : tok(i.token), label: i.label, ring: i.ring })), 'Fit');
  const onMap = t => p === 'cet' || p === 'pp' || (t.lon > -130 && t.lon < -60 && t.lat > 23);   // the contiguous US for the national lists
  const hand = T.filter(t => t._src !== 'sba' && onMap(t)); const fit = (hand.length ? hand : T.filter(onMap)).map(t => [t.lat, t.lon]);
  // no animation: a zoom still running when the screen is left would throw inside Leaflet after the map is removed
  const doFit = () => { try { if (fit.length && map.getContainer().isConnected) { map.invalidateSize({ animate: false }); map.fitBounds(window.L.latLngBounds(fit), { padding: [24, 24], maxZoom: maxFit, animate: false }); } } catch { } };
  doFit(); const tm = setTimeout(doFit, 140);
  // the shell re-measures every new map 60 and 240 ms after it is made; if the screen is left sooner, that call must not reach a removed map
  return () => { clearTimeout(tm); map.invalidateSize = () => map; try { map.remove(); } catch { } };
}

/** The company block. Returns an unmount function (it removes the map) or null. */
export function companyBlock(ctx, host, { b, sel, focused, kit }) {
  if (!host) return null;
  const { esc, fmt } = ctx; const { PLAT, openTarget } = kit;
  host.dataset.co = sel;
  if (!b.targets.length) { host.dataset.mode = 'none'; host.hidden = true; return null; }
  if (sel === 'all') { if (focused) { host.dataset.mode = 'none'; host.hidden = true; return null; } host.dataset.mode = 'cards'; host.innerHTML = cardsHtml(ctx, b, kit); return null; }
  if (focused) { host.dataset.mode = 'strip'; host.innerHTML = `<p class="h-note ma-co-strip">${fmt.chip(PLAT[sel].label, PLAT[sel].color)} <a href="#/ma/pipeline?platform=${esc(sel)}">${esc(PLAT[sel].label)} brief: thesis, map and ranked picks →</a></p>`; return null; }
  host.dataset.mode = 'brief'; host.innerHTML = briefHtml(ctx, b, sel, kit);
  const open = n => { const t = b.byId.get(n.dataset.tid); if (t) openTarget(ctx, t, b); };
  host.querySelectorAll('[data-tid]').forEach(n => { n.onclick = () => open(n); n.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === n) { e.preventDefault(); open(n); } }; });
  const jump = host.querySelector('[data-ma-jump]'); if (jump) jump.onclick = () => ctx.el.querySelector('#ma-tg')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return drawMap(ctx, host, b, sel, kit);
}
