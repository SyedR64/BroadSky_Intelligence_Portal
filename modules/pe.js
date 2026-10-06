import * as Copy from './copy.js?v=20261006180606';
/* PE landscape — history, trajectory, deal flow and buy-and-build benchmarks for the sponsors competing with Broad Sky.
   Data: Private-equity landscape (35 firms), Broad Sky firm profile (BSP reference), Competitor filings (financials of rival companies),
   sales/* (home-sale turnover in the counties each platform serves: PP PA/NJ, CET MA/CT/RI, BPI DC, Fair Harbor NYC). */

const TODAY = new Date('2026-09-24T12:00:00');
const SRC_PE = { text: 'Private-equity landscape research (firm sites, press releases, PR Newswire, PE Hub)', url: 'https://broadskypartners.com/news/' };

const SECTORS = {
  punctual_pros: { label: 'Punctual Pros', short: 'PP', color: 'var(--co-pp)', mod: 'pp', bucket: 'Residential services (PP)' },
  cet: { label: 'CET', short: 'CET', color: 'var(--co-cet)', mod: 'cet', bucket: 'Electrical & energy (CET)' },
  frontline: { label: 'Frontline', short: 'FL', color: 'var(--co-fl)', mod: 'fl', bucket: 'Legal / managed IT (Frontline)' },
  thomas_scientific: { label: 'Thomas Scientific', short: 'TS', color: 'var(--co-ts)', mod: 'ts', bucket: 'Lab supply (Thomas)' },
  bpi: { label: 'BPI', short: 'BPI', color: 'var(--co-bpi)', mod: 'bpi', bucket: 'Comms & public affairs (BPI)' },
  fair_harbor: { label: 'Fair Harbor', short: 'FH', color: 'var(--co-fh)', mod: 'fh', bucket: 'Consumer brands (Fair Harbor)' },
};
const SECTOR_KEYS = Object.keys(SECTORS);
const OTHER = { label: 'Other services', short: '—', color: 'var(--sys-mute-2)', bucket: 'Other services' };
const THREAT = { high: { label: 'High threat', color: 'var(--sys-bad)', rank: 3 }, medium: { label: 'Medium threat', color: 'var(--sys-warn)', rank: 2 }, low: { label: 'Low threat', color: 'var(--sys-mute)', rank: 1 } };
const COMPETES = { deals: 'Rival bidder for companies', targets: 'Rival buyer of add-on targets', both: 'Companies + add-on targets' };
const TYPE = { platform: { label: 'Anchor', color: 'var(--c-pe)' }, add_on: { label: 'Add-on', color: 'var(--sys-info)' }, exit: { label: 'Exit', color: 'var(--sys-warn)' } };

/* ── data prep ─────────────────────────────────────────────────────────── */
const num = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
const firstSentence = s => { const t = String(s || '').trim(); const m = t.match(/^(.+?[a-z0-9)%'"][.!?])(?=\s+[A-Z("']|$)/); return m ? m[1] : t; };
const stateOf = hq => { const m = String(hq || '').match(/,\s*([A-Z]{2})\b/); return m ? m[1] : null; };
const median = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); if (!v.length) return null; const h = Math.floor(v.length / 2); return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
const quant = (a, q) => { const v = a.filter(x => x != null).sort((x, y) => x - y); if (!v.length) return null; const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
const yearsSince = d => (TODAY - new Date(d)) / (365.25 * 864e5);

/** Classify a free-text sector/company string into the BSP platform it overlaps with (or 'other'). */
function bucketOf(text) {
  const s = String(text || '').toLowerCase();
  if (/residential|home[- ]?services|garage door|\bpool\b|sewer|drain|foundation repair|windows & doors|waterproofing/.test(s)) return 'punctual_pros';
  if (/(hvac|plumb|heating)/.test(s) && !/commercial/.test(s)) return 'punctual_pros';
  if (/electric|energy|solar|\bpower\b|building automation|commercial hvac|ev charg|wastewater|utility (infrastructure|engineering|services)/.test(s)) return 'cet';
  if (/legal|\blaw\b|ediscovery|court report|deposition|managed (it|services)|\bmsp\b|it services|\bit\b|it\/|cyber|database|revenue[- ]cycle/.test(s)) return 'frontline';
  if (/\blab\b|laborator|scientific|reagent|chromatograph|life science|consumables/.test(s)) return 'thomas_scientific';
  if (/cloud comm|ucaas/.test(s)) return 'other';
  if (/public affairs|public relations|\bpr\b|communications|marketing|advocacy|stakeholder|\bmedia\b/.test(s)) return 'bpi';
  if (/apparel|beachwear|swim|consumer products|consumer brand|fashion|lifestyle/.test(s)) return 'fair_harbor';
  return 'other';
}
const sec = k => SECTORS[k] || OTHER;
/** Sort comparator that keeps null/undisclosed values below real ones when sorting descending (ui.table negates the comparator). */
const nullLast = k => (a, b) => (a[k] ?? -1) - (b[k] ?? -1);
const shortName = n => String(n || '').split(' - ')[0].replace(/\s+(Partners|Investors|Capital|Capital Partners|Equity Partners|& Company|Investment Partners)$/i, '').replace(/^The /, '');

const RIVAL_STOP = new Set(['the', 'service', 'services', 'cloud', 'commercial', 'residential', 'group', 'legal', 'superior', 'array', 'industrial', 'smith', 'camp', 'left', 'stream', 'right', 'apps', 'engage', 'valor', 'summit', 'guardian', 'ruppert', 'threshold', 'mosaic', 'cobalt', 'orion', 'evergreen', 'wind', 'frontline']);
function rivalKey(name) {
  const w = String(name || '').replace(/\(.*?\)/g, '').toLowerCase().match(/[a-z0-9&-]+/g);
  if (!w) return null;
  return (w[0].length >= 4 && !RIVAL_STOP.has(w[0])) ? w[0] : w.slice(0, 2).join(' ');
}

let _bundle = null;
async function load(ctx) {
  const [pe, bsp, rival] = await Promise.all([ctx.data.research('pe_landscape'), ctx.data.research('bsp_firm'), ctx.data.research('rival_filings')]);
  if (!pe || !Array.isArray(pe.items)) return { pe: null, bsp, rival };
  if (_bundle && _bundle.pe === pe && _bundle.bsp === bsp && _bundle.rival === rival) return _bundle;
  const rivalItems = rival?.items || [];
  const firms = pe.items.map(i => {
    const lf = i.latest_fund || {};
    const plats = (i.platforms_relevant || []).map((p, k) => {
      const entry = num(p.entry_year), add = num(p.add_ons_count), exitY = num(p.exit_year);
      const yrs = entry ? Math.max(0.5, (exitY ? exitY + 0.5 : 2026.73) - (entry + 0.5)) : null;
      const key = rivalKey(p.name);
      const filings = key ? rivalItems.filter(r => new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(String(r.entity || '').toLowerCase())) : [];
      return { ...p, id: `${i.id}-p${k}`, firm: i.firm, firm_id: i.id, entry_year: entry, add_ons_count: add, exit_year: exitY, status: p.status || 'n/d', _bucket: bucketOf(`${p.sector} ${p.name}`), _velocity: add != null && yrs ? add / yrs : null, _years: yrs, _exit: p.exit_buyer ? `${p.exit_year || ''} → ${p.exit_buyer}` : (p.exit_year ? String(p.exit_year) : ''), _filings: filings };
    });
    const deals = (i.deals_2025_2026 || []).map((d, k) => ({ ...d, id: `${i.id}-d${k}`, firm: i.firm, firm_id: i.id, _threat: i.threat_level, _bucket: bucketOf(d.sector), _month: /^\d{4}-\d{2}/.test(d.date || '') ? d.date.slice(0, 7) : null }));
    return {
      ...i, _state: stateOf(i.hq), _fund: num(lf.size_usd), _fundName: lf.name || null, _fundYear: num(lf.year), _threatRank: THREAT[i.threat_level]?.rank || 0,
      _overlap: (i.overlap_with_bsp || []).filter(k => SECTORS[k]).sort((a, b) => SECTOR_KEYS.indexOf(a) - SECTOR_KEYS.indexOf(b)), _plats: plats, _deals: deals,
      _filings: [...new Map(plats.flatMap(p => p._filings).map(f => [f.id, f])).values()],
    };
  });
  const byId = Object.fromEntries(firms.map(f => [f.id, f]));
  const deals = firms.flatMap(f => f._deals);
  const plats = firms.flatMap(f => f._plats);
  // BSP reference
  const ref = pe.meta?.bsp_reference || {};
  const stats = bsp?.firm?.stats || {};
  // Fund I = SEC Form D for Broad Sky Partners, LP ($335M sold, Apr 2025). pe_landscape.meta.bsp_reference.fund_i_usd ($137M) is the
  // BSP-FL (Frontline) deal SPV, per bsp_firm caveats — never use it as the fund size. Deal SPVs / co-invest are shown separately.
  const secD = bsp?.firm?.capital_raised_sec_form_d || null;
  const spvs = (secD?.deal_vehicles || []).filter(v => /^BSP-/.test(v.vehicle || '') && num(v.sold_usd) != null);
  const bspRef = {
    fund: num(secD?.broad_sky_partners_lp_total_sold_usd) || 335e6, fundClose: secD?.as_of ? String(secD.as_of).slice(0, 7) : '2025-04',
    fundSrc: secD?.source_url || 'https://www.sec.gov/Archives/edgar/data/1917706/000139834425008250/primary_doc.xml', investors: num(secD?.investors),
    spvTotal: spvs.reduce((a, v) => a + num(v.sold_usd), 0) || null, spvCount: spvs.length, platforms: num(stats.platforms) || num(ref.platforms) || 7, addOns: num(stats.add_ons) || num(ref.add_ons) || 23,
    exits: num(stats.exits) ?? 1, checkMin: num(ref.equity_check_usd?.min) || 50e6, checkMax: num(ref.equity_check_usd?.max) || 250e6, firstExit: ref.first_exit || 'Smith + Howard → TPG Growth (Aug 2026)',
    sec: bsp?.firm?.capital_raised_sec_form_d || null,
  };
  // BSP platforms for the buy-and-build benchmark (Smith + Howard exited — fall back to the published facts if the item is absent)
  const bspPlats = (bsp?.items || []).map(p => ({ name: p.company.replace(/\s*\(.*?\)\s*/g, ' ').trim(), entry: p.entry_date, add: (p.add_ons || []).length, exit: p.exit_date || null, status: p.status }));
  if (!bspPlats.some(p => /smith/i.test(p.name))) bspPlats.push({ name: 'Smith + Howard', entry: '2022-11-15', add: 9, exit: '2026-08-06', status: 'exited', note: 'per BSP exit release' });
  bspPlats.forEach(p => { const end = p.exit ? new Date(p.exit) : TODAY; p.years = Math.max(0.5, (end - new Date(p.entry)) / (365.25 * 864e5)); p.velocity = p.add / p.years; });
  _bundle = { pe, bsp, rival, firms, byId, deals, plats, bspRef, bspPlats, meta: pe.meta || {} };
  return _bundle;
}

function injectCss() { if (!document.getElementById('css-pe')) { const l = document.createElement('link'); l.id = 'css-pe'; l.rel = 'stylesheet'; l.href = 'modules/pe.css?v=20261006180606'; document.head.appendChild(l); } }
function missing(ctx, title) { ctx.el.innerHTML = ctx.ui.pageHead({ title, sub: 'Competitive intelligence on the private-equity sponsors bidding against Broad Sky.' }) + ctx.ui.note('Research dataset <b>Private-equity landscape</b> is not yet available (still being verified). This view will populate automatically once it is published.', 'warn'); }
const srcFoot = (ctx, meta, extra) => ctx.ui.source(SRC_PE.text, null, meta?.generated) + (extra ? ` <span class="dim">· ${extra}</span>` : '');

/* ── shared chips / actions ────────────────────────────────────────────── */
const threatChip = (ctx, t) => ctx.fmt.chip(THREAT[t]?.label || 'n/d', THREAT[t]?.color || 'var(--sys-mute-2)');
const overlapChips = (ctx, keys) => (keys || []).map(k => ctx.fmt.chip(sec(k).short, sec(k).color)).join('');
const money = (ctx, v) => v == null ? '<span class="dim">n/d</span>' : ctx.fmt.money(v);
const range = (ctx, r) => r && (r.min != null || r.max != null) ? `${r.min != null ? ctx.fmt.money(r.min) : '?'}–${r.max != null ? ctx.fmt.money(r.max) : '?'}` : null;

const PLAY = {
  punctual_pros: 'run proprietary outreach to sub-$3M EBITDA HVAC/plumbing/electrical shops in the overlapping PA/NJ counties and use Authority Brands territory rights before this portfolio company reaches them',
  cet: 'lock up New England electrical, wastewater and energy-efficiency contractors (Horton-style) before this sponsor\'s portfolio company enters the six-state footprint',
  frontline: 'secure law-firm MSP and billing/RCM add-ons before a generalist consolidator builds a legal vertical',
  thomas_scientific: 'treat as the primary rival bidder for US lab consumables, chromatography and line-card add-ons; move early on proprietary targets',
  bpi: 'benchmark valuation and talent moves against their comms portfolio company; pursue sub-scale public-affairs boutiques they overlook',
  fair_harbor: 'monitor only: overlap with consumer brands is thin; no dedicated apparel sponsor verified',
};
function nextAction(f) {
  const k = SECTOR_KEYS.find(x => f._overlap.includes(x));
  const pre = f.competes_for === 'targets' ? 'Competes for our add-on targets:' : f.competes_for === 'both' ? 'Competes for companies and add-ons:' : 'Rival bidder in auctions:';
  const exitNote = f.threat_level === 'low' && (f._fund || 0) >= 3e9 ? ' Also a likely exit buyer for a scaled BSP portfolio company; keep the deal team warm.' : '';
  return k ? `${pre} ${PLAY[k]}.${exitNote}` : `Track fund-level competition for new companies.${exitNote}`;
}

/* ── inspectors ────────────────────────────────────────────────────────── */
function openFirm(ctx, f, B) {
  const { ui, fmt, charts, inspector, app, esc } = ctx;
  const fh = (f.fund_history || []).filter(x => num(x.size_usd) != null).slice().sort((a, b) => (num(a.year) || 0) - (num(b.year) || 0));
  const roman = n => { const m = String(n || '').match(/\b([IVX]+|\d+)\b(?!.*\b([IVX]+|\d+)\b)/); return m ? m[1] : String(n || '').slice(0, 6); };
  const fundChart = fh.length ? charts.bar([...fh.map(x => ({ label: `${roman(x.name)}${x.year ? " '" + String(x.year).slice(2) : ''}`, value: num(x.size_usd), color: 'var(--c-pe)' })), { label: 'BSP I', value: B.bspRef.fund, color: 'var(--sys-brand)' }], { h: 120, fmt: v => fmt.money(v) }) + `<div class="dim small mt-8">${fh.map(x => `${esc(x.name)}${x.year ? ` (${esc(x.year)})` : ''}: ${fmt.money(num(x.size_usd))}`).join(' · ')}</div>` : `<div class="dim small">No fund sizes disclosed${(f.fund_history || []).length ? ` (${(f.fund_history || []).map(x => esc(x.name)).join(', ')})` : ''}.</div>`;
  const platTbl = f._plats.length ? `<div class="sys-table-wrap"><table class="sys-table pe-mini"><thead><tr><th>Portfolio company</th><th class="sys-n">Entry</th><th class="sys-n">Add-ons</th><th>Status</th></tr></thead><tbody>${f._plats.map(p => `<tr><td><b>${esc(p.name)}</b><div class="dim">${esc(p.sector || '')}</div>${p.notes ? `<div class="small text-2" style="margin-top:var(--sys-sp-1)">${esc(p.notes)}</div>` : ''}</td><td class="sys-n">${p.entry_year ?? '—'}</td><td class="sys-n">${p.add_ons_count != null ? fmt.num(p.add_ons_count) : '—'}</td><td>${fmt.chip(p.status, p.status === 'exited' ? 'var(--sys-mute)' : p.status === 'held' ? 'var(--sys-good)' : 'var(--sys-mute-2)')}${p.exit_buyer ? `<div class="dim small">→ ${esc(p.exit_buyer)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="dim small">No relevant companies recorded.</div>';
  const deals = f._deals.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const dealList = deals.length ? deals.map(d => `<div class="pe-deal"><div class="row"><span class="d">${esc(d.date)}</span>${fmt.chip(TYPE[d.type]?.label || d.type, TYPE[d.type]?.color)}${d._bucket !== 'other' ? fmt.chip(sec(d._bucket).short, sec(d._bucket).color) : ''}</div><div><b>${esc(d.company)}</b> <span class="dim">· ${esc(d.sector || '')}</span></div>${d.note ? `<div class="x">${esc(d.note)}</div>` : ''}${d.source_url ? `<div>${fmt.link(d.source_url, (fmt.host(d.source_url) || 'source') + ' ↗')}</div>` : ''}</div>`).join('') : '<div class="dim small">No disclosed 2025–26 deals (many sponsors do not announce add-ons).</div>';
  const filings = f._filings.length ? f._filings.map(r => `<div class="pe-deal"><div class="d">${esc(r.filed_or_dated || '')} · ${esc(Copy.category ? Copy.category(r.category) : String(r.category || '').replace(/_/g, ' '))}</div><div><b>${esc(r.title)}</b></div><div class="x">${esc(r.what_it_tells_us || '')}</div>${r.source_url ? fmt.link(r.source_url, (fmt.host(r.source_url) || 'source') + ' ↗') : ''}</div>`).join('') : null;
  inspector.open({
    title: esc(f.firm), sub: `${esc(f.hq || 'HQ n/d')}${f.founded ? ` · founded ${esc(f.founded)}` : ''} · ${esc(THREAT[f.threat_level]?.label || '')}`, color: THREAT[f.threat_level]?.color || 'var(--c-pe)',
    sections: [
      { label: 'Snapshot', html: `<div class="row wrap mb-8">${threatChip(ctx, f.threat_level)}${fmt.chip(COMPETES[f.competes_for] || f.competes_for || 'n/d', 'var(--c-pe)')}${overlapChips(ctx, f._overlap)}</div>` + ui.kv({ AUM: f.aum_usd ? fmt.money(f.aum_usd) : null, 'Latest fund': f._fundName ? `${esc(f._fundName)}${f._fundYear ? ` (${f._fundYear})` : ''} · ${money(ctx, f._fund)}` : null, 'vs BSP Fund I': f._fund ? `<span class="num">${fmt.num(f._fund / B.bspRef.fund, 1)}×</span>` : null, 'Equity check': range(ctx, f.check_size_usd), 'EV range': range(ctx, f.enterprise_value_usd), 'Typical EBITDA': range(ctx, f.typical_ebitda_usd), Website: f.website ? fmt.link(f.website) : null }) },
      { label: 'Why it matters to BSP', html: `<div class="m-pe"><div class="pe-txt">${esc(f.threat_rationale || '—')}</div></div>` },
      { label: 'Recommended next action', html: `<div class="m-pe"><div class="pe-next">${esc(nextAction(f))}</div></div>` },
      { label: 'Strategy', html: `<div class="m-pe"><div class="pe-txt">${esc(f.strategy || '—')}</div>${(f.sectors || []).length ? `<div class="row wrap mt-8">${f.sectors.slice(0, 8).map(s => fmt.chip(s)).join('')}</div>` : ''}</div>` },
      { label: 'Trajectory', html: `<div class="m-pe"><div class="pe-txt">${esc(f.trajectory || '—')}</div></div>` },
      { label: `Fund history (vs BSP Fund I)`, html: fundChart },
      { label: `Relevant companies (${f._plats.length})`, html: `<div class="m-pe">${platTbl}</div>` },
      { label: `Deals 2025–2026 (${deals.length})`, html: `<div class="m-pe">${dealList}</div>` },
      filings ? { label: `Rival company filings (${f._filings.length})`, html: `<div class="m-pe">${filings}</div>` } : null,
      (f.key_people || []).length ? { label: 'Key people', html: `<div class="col gap-4">${f.key_people.map(p => `<div class="small"><b>${esc(p.name)}</b> <span class="muted">${esc(p.title || '')}</span></div>`).join('')}</div>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${(f.sources || []).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(fmt.host(s) || s)}</a>`).join('') || '—'}</div><div class="dim small mt-8">Retrieved ${esc(f.retrieved || B.meta.generated || '')} · threat level is an analyst judgment</div>` },
    ].filter(Boolean),
    actions: [f.website ? { label: 'Website ↗', href: f.website } : null, { id: 'pe-deals', label: 'Deals →', onClick: () => app.go('pe', 'deals', { firm: f.id }) }, { id: 'pe-plats', label: 'Companies →', onClick: () => app.go('pe', 'platforms', { firm: f.id }) }].filter(Boolean),
  });
}

function openDeal(ctx, d, B) {
  const { ui, fmt, inspector, esc } = ctx; const f = B.byId[d.firm_id]; const k = d._bucket;
  const act = k !== 'other' ? `${sec(k).label} overlap: ${PLAY[k]}.` : `Outside BSP's current company sectors; relevant as a signal of where ${d.firm} is deploying capital.`;
  inspector.open({
    title: esc(d.company), sub: `${esc(d.firm)} · ${esc(TYPE[d.type]?.label || d.type)} · ${esc(d.date)}`, color: TYPE[d.type]?.color || 'var(--c-pe)',
    sections: [
      { label: 'Deal', html: ui.kv({ Sponsor: esc(d.firm), Date: esc(d.date), Type: fmt.chip(TYPE[d.type]?.label || d.type, TYPE[d.type]?.color), Sector: esc(d.sector || '—'), 'BSP overlap': k !== 'other' ? fmt.chip(sec(k).label, sec(k).color) : '<span class="dim">none</span>', 'Sponsor threat': threatChip(ctx, d._threat) }) },
      { label: 'Note', html: `<div class="m-pe"><div class="pe-txt">${esc(d.note || '—')}</div></div>` },
      { label: 'Recommended next action', html: `<div class="m-pe"><div class="pe-next">${esc(act)}</div></div>` },
      { label: 'Source', html: d.source_url ? fmt.link(d.source_url, Copy.srcLabel(d.source_url)) : '<span class="dim">No source URL</span>' },
    ],
    actions: [d.source_url ? { label: 'Source ↗', href: d.source_url } : null, f ? { id: 'pe-firm', label: `Open ${esc(f.firm.split(' - ')[0])}`, onClick: () => openFirm(ctx, f, B) } : null].filter(Boolean),
  });
}

function openPlatform(ctx, p, B) {
  const { ui, fmt, inspector, esc } = ctx; const f = B.byId[p.firm_id]; const k = p._bucket;
  const bspMed = median(B.bspPlats.map(x => x.velocity));
  const act = p.status === 'exited' ? `Exited${p.exit_buyer ? ` to ${p.exit_buyer}` : ''}: use as an exit comparable (buyer appetite for scaled ${sec(k).label === 'Other services' ? 'services' : sec(k).label} companies).` : k !== 'other' ? `Head-to-head with ${sec(k).label}: ${PLAY[k]}.` : 'Benchmark only: buy-and-build pacing outside BSP sectors.';
  inspector.open({
    title: esc(p.name), sub: `${esc(p.firm)} · ${esc(p.sector || '')}`, color: k !== 'other' ? sec(k).color : 'var(--c-pe)',
    sections: [
      { label: 'Company', html: ui.kv({ Sponsor: esc(p.firm), HQ: p.hq ? esc(p.hq) : null, Entry: p.entry_year ? String(p.entry_year) : '<span class="dim">n/d</span>', Status: fmt.chip(p.status, p.status === 'exited' ? 'var(--sys-mute)' : 'var(--sys-good)'), Exit: p._exit ? esc(p._exit) : null, 'Add-ons (disclosed)': p.add_ons_count != null ? fmt.num(p.add_ons_count) : '<span class="dim">n/d</span>', 'Add-on pace': p._velocity != null ? `<span class="num">${fmt.num(p._velocity, 1)}/yr</span> <span class="dim">vs BSP median ${fmt.num(bspMed, 1)}/yr</span>` : null, 'BSP overlap': k !== 'other' ? fmt.chip(sec(k).label, sec(k).color) : '<span class="dim">none</span>' }) },
      p.notes ? { label: 'Notes', html: `<div class="m-pe"><div class="pe-txt">${esc(p.notes)}</div></div>` } : null,
      { label: 'Recommended next action', html: `<div class="m-pe"><div class="pe-next">${esc(act)}</div></div>` },
      p._filings.length ? { label: `Financial filings (${p._filings.length})`, html: `<div class="m-pe">${p._filings.map(r => `<div class="pe-deal"><div class="d">${esc(r.filed_or_dated || '')} · ${esc(r.filer_or_source_agency || '')}</div><div><b>${esc(r.title)}</b></div><div class="x">${esc(r.what_it_tells_us || '')}</div>${r.source_url ? fmt.link(r.source_url, (fmt.host(r.source_url) || 'source') + ' ↗') : ''}</div>`).join('')}</div>` } : null,
      { label: 'Source', html: `<div class="small text-2">${esc(p.firm)} profile — ${(f?.sources || []).slice(0, 3).map(s => fmt.link(s, fmt.host(s) || s)).join(' · ') || '—'}</div>` },
    ].filter(Boolean),
    actions: [f ? { id: 'pe-firm', label: `Open sponsor`, onClick: () => openFirm(ctx, f, B) } : null].filter(Boolean),
  });
}

/* ── View 1: Landscape ─────────────────────────────────────────────────── */
async function landscape(ctx) {
  const { el, ui, fmt, app, esc, params } = ctx; injectCss();
  const B = await load(ctx); if (!B.pe) return missing(ctx, 'PE landscape');
  const { firms, meta, bspRef } = B;
  const high = firms.filter(f => f.threat_level === 'high');
  const funds = firms.map(f => f._fund).filter(v => v != null);
  const medFund = median(funds);
  const capital = funds.reduce((a, b) => a + b, 0);
  const overlapPlats = B.plats.filter(p => p._bucket !== 'other' && p.status !== 'exited');
  const rank = funds.filter(v => v > bspRef.fund).length + 1;
  const summary = Array.isArray(meta.landscape_summary) ? meta.landscape_summary : [];
  const ppFirms = firms.filter(f => f._overlap.includes('punctual_pros'));

  el.innerHTML = `<div class="m-pe">` + ui.pageHead({
    title: 'PE landscape',
    sub: `<b>So what:</b> ${firms.length} sponsors chase the same LMM services deals; ${high.length} are high-threat. Fund I (${fmt.money(bspRef.fund)}, SEC Form D ${esc(bspRef.fundClose)}) is ${fmt.num(medFund / bspRef.fund, 1)}× smaller than the median rival flagship (${fmt.money(medFund)}) and ranks #${rank} of ${funds.length + 1} disclosed funds${bspRef.spvTotal ? `; ${fmt.money(bspRef.spvTotal)} raised in ${bspRef.spvCount} deal SPVs/co-invest vehicles narrows the gap deal by deal` : ''}. BSP must win on sector focus, co-invest and operating credibility, not price. Residential services (Punctual Pros) is the most crowded field: <span title="Overlapping = sponsors whose companies or mandate overlap Punctual Pros (Private-equity landscape, overlap with Broad Sky). Named most-active = the subset analysts flag as most active in Punctual Pros' sector (sector heatmap).">${ppFirms.length} overlapping sponsors, ${(meta.sector_heatmap?.punctual_pros?.most_active || []).length} named most-active</span>.`,
    actions: `<button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" id="pe-exp">⇩ Firms CSV</button><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/deals">Deal flow</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/heatmap">Heatmap</a>`,
  }) + ui.kpis([
    { label: 'Sponsors profiled', value: fmt.num(firms.length), sub: `${(meta.excluded_candidates || []).length} more screened out`, color: 'var(--c-pe)' },
    { label: 'High-threat firms', value: fmt.num(high.length), sub: `${firms.filter(f => f.threat_level === 'medium').length} medium · ${firms.filter(f => f.threat_level === 'low').length} low`, color: 'var(--sys-bad)' },
    { label: 'Latest-fund capital', value: fmt.money(capital), sub: `${funds.length} disclosed rival funds · BSP Fund I #${rank} of ${funds.length + 1}`, color: 'var(--c-pe)' },
    { label: 'Deals 2025–26', value: fmt.num(B.deals.length), sub: `${B.deals.filter(d => d.type === 'add_on').length} add-ons · ${B.deals.filter(d => d.type === 'exit').length} exits (disclosed)`, color: 'var(--sys-info)' },
    { label: 'Rival companies in BSP sectors', value: fmt.num(overlapPlats.length), sub: `held, of ${fmt.num(B.plats.length)} companies tracked`, color: 'var(--sys-warn)' },
  ]) + (B.bsp ? '' : `<div class="mt-12">${ui.note('Research dataset <b>Broad Sky firm profile</b> is not available — the Broad Sky reference uses the published facts (7 companies, 23 add-ons, 1 exit).', 'warn')}</div>`) + `
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Broad Sky reference — scale vs peers', sub: 'The yardstick for every card below', accent: true, body: `<div class="sys-kpis pe-ref">
        <div class="sys-kpi pe-stat"><div class="sys-kpi-label l">Fund I</div><div class="sys-kpi-value v">${fmt.money(bspRef.fund)}</div><div class="sys-kpi-sub s" title="Broad Sky Partners, LP total sold per SEC Form D${bspRef.investors ? ` (${bspRef.investors} investors)` : ''}">Form D, ${esc(bspRef.fundClose)}${bspRef.spvTotal ? ` · +${fmt.money(bspRef.spvTotal)} deal SPVs` : ''}</div></div>
        <div class="sys-kpi pe-stat"><div class="sys-kpi-label l">Companies</div><div class="sys-kpi-value v">${fmt.num(bspRef.platforms)}</div><div class="sys-kpi-sub s">6 held · ${fmt.num(bspRef.exits)} exited</div></div>
        <div class="sys-kpi pe-stat"><div class="sys-kpi-label l">Add-ons</div><div class="sys-kpi-value v">${fmt.num(bspRef.addOns)}</div><div class="sys-kpi-sub s">since late-2021 relaunch</div></div>
        <div class="sys-kpi pe-stat"><div class="sys-kpi-label l">Equity check</div><div class="sys-kpi-value v">$${fmt.num(bspRef.checkMin / 1e6)}–${fmt.num(bspRef.checkMax / 1e6)}M</div><div class="sys-kpi-sub s">control, per brief</div></div>
        <div class="sys-kpi pe-stat"><div class="sys-kpi-label l">First exit</div><div class="sys-kpi-value v">S+H</div><div class="sys-kpi-sub s">→ TPG Growth, Aug 2026</div></div>
      </div>
      <div class="mt-12">${ctx.charts.hbar([
        { label: 'BSP Fund I', value: bspRef.fund, color: 'var(--sys-brand)' },
        ...(bspRef.spvTotal ? [{ label: 'BSP Fund I + deal SPVs', value: bspRef.fund + bspRef.spvTotal, color: 'var(--sys-brand)' }] : []),
        { label: `Rival flagship — 25th pct`, value: quant(funds, .25), color: 'var(--c-pe)' },
        { label: `Rival flagship — median`, value: medFund, color: 'var(--c-pe)' },
        { label: `Rival flagship — 75th pct`, value: quant(funds, .75), color: 'var(--c-pe)' },
      ], { fmt: v => fmt.money(v), labelW: 170 })}</div>`,
      foot: ui.source('SEC Form D — Broad Sky Partners, LP', bspRef.fundSrc, bspRef.fundClose) + ` <span class="dim">· rival funds: Private-equity landscape research (${esc(meta.generated || '')}) · deal SPVs = ${bspRef.spvCount || 0} BSP-* Form D vehicles (BSP-TS, BSP-BPI, BSP-FL, BSP-CET), deal-specific capital not commingled with Fund I · the $137M sometimes quoted as Fund I is the BSP-FL (Frontline) vehicle</span>` })}
    ${ui.panel({ title: 'Threat by BSP portfolio company', sub: 'Sponsors overlapping each portfolio company · click a row to filter', body: `<div class="sys-table-wrap"><table class="sys-table pe-mini"><thead><tr><th>Portfolio company</th><th class="sys-n">High</th><th class="sys-n">Med</th><th class="sys-n">Low</th><th>Intensity</th><th>Top high-threat rivals</th></tr></thead><tbody>${SECTOR_KEYS.map(k => { const fs = firms.filter(f => f._overlap.includes(k)); const hm = meta.sector_heatmap?.[k]; const ma = hm?.most_active || []; const rk = f => { const i = ma.indexOf(f.id); return i < 0 ? 99 : i; }; const hi = fs.filter(f => f.threat_level === 'high').sort((x, y) => rk(x) - rk(y)); return `<tr class="click" data-ov="${k}"><td>${ctx.fmt.chip(sec(k).label, sec(k).color)}</td><td class="sys-n" style="color:var(--sys-bad-ink)">${hi.length || '·'}</td><td class="sys-n">${fs.filter(f => f.threat_level === 'medium').length || '·'}</td><td class="sys-n">${fs.filter(f => f.threat_level === 'low').length || '·'}</td><td class="small nowrap" title="${esc(hm?.intensity || '')}">${esc(String(hm?.intensity || '—').split('(')[0].trim())}</td><td class="small">${hi.map(f => esc(shortName(f.firm))).slice(0, 4).join(', ') || '<span class="dim">none</span>'}</td></tr>`; }).join('')}</tbody></table></div>`, foot: srcFoot(ctx, meta, 'threat = analyst judgment') })}
  </div>
  ${ui.panel({ title: 'Competitor sponsors', sub: 'Sorted by threat, then overlap with BSP, then fund size · click a card for history, funds, companies, deals and sources', body: `<div id="pe-f"></div><div id="pe-cards"></div>`, cls: 'mt-12', foot: srcFoot(ctx, meta, `${(meta.caveats || []).length} caveats — fund sizes left blank where undisclosed`) })}
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Watch list — high-threat sponsors and what to do', sub: 'Action list', body: `<div class="pe-acts" id="pe-watch">${high.slice().sort((a, b) => b._overlap.length - a._overlap.length || (b._fund || 0) - (a._fund || 0)).map((f, i) => `<div class="pe-act click" tabindex="0" role="button" data-id="${esc(f.id)}"><div class="n">${String(i + 1).padStart(2, '0')}</div><div><div class="h">${esc(f.firm)}</div><div class="b">${esc(nextAction(f))}</div><div class="sys-chips c">${overlapChips(ctx, f._overlap)}${fmt.chip(COMPETES[f.competes_for] || '', 'var(--c-pe)')}</div></div></div>`).join('')}</div>`, foot: srcFoot(ctx, meta) })}
    ${ui.panel({ title: 'Landscape read-out', sub: 'Analyst synthesis, condensed by sector', body: `<div class="pe-bul">${summary.slice(1).map(s => `<div><b>${esc(firstSentence(s))}</b> ${esc(String(s).slice(firstSentence(s).length).trim())}</div>`).join('') || ui.empty('No synthesis in dataset')}</div>`, scroll: true, foot: srcFoot(ctx, meta) })}
  </div></div>`;

  // filters + cards
  const states = [...new Set(firms.map(f => f._state).filter(Boolean))].sort();
  const cols = [{ key: 'firm', label: 'Firm' }, { key: 'hq', label: 'HQ' }, { key: 'founded', label: 'Founded' }, { key: 'aum_usd', label: 'AUM (USD)' }, { key: '_fundName', label: 'Latest fund' }, { key: '_fund', label: 'Latest fund size (USD)' }, { key: '_fundYear', label: 'Fund year' }, { key: 'threat_level', label: 'Threat' }, { key: 'competes_for', label: 'Competes for' }, { key: '_overlap', label: 'Overlap with BSP' }, { key: 'strategy', label: 'Strategy' }, { key: 'threat_rationale', label: 'Threat rationale' }, { key: 'website', label: 'Website' }];
  let shown = firms;
  const cardsEl = el.querySelector('#pe-cards');
  const draw = st => {
    const q = (st.q || '').toLowerCase();
    shown = firms.filter(f => (!st.ov || f._overlap.includes(st.ov)) && (!st.threat || f.threat_level === st.threat) && (!st.comp || f.competes_for === st.comp) && (!st.st || f._state === st.st) && (!q || JSON.stringify(f).toLowerCase().includes(q)))
      .sort((a, b) => b._threatRank - a._threatRank || b._overlap.length - a._overlap.length || (b._fund || 0) - (a._fund || 0));
    fl.setCount(`${shown.length} / ${firms.length} firms`);
    cardsEl.innerHTML = shown.length ? `<div class="sys-grid pe-grid">${shown.map(f => `<div class="sys-card sys-card--link card pe-card" tabindex="0" role="button" data-co="" data-id="${esc(f.id)}" style="--co:${THREAT[f.threat_level]?.color || 'var(--sys-line-2)'}">
      <div class="sys-card-title t"><span class="nm" title="${esc(f.firm)}">${esc(f.firm)}</span>${threatChip(ctx, f.threat_level)}</div>
      <div class="sys-card-body s">${esc(f.hq || 'HQ n/d')}${f.founded ? ` · founded ${esc(f.founded)}` : ''}${f.aum_usd ? ` · AUM ${fmt.money(f.aum_usd)}` : ''}</div>
      <div class="pe-fund"><b>${f._fund != null ? fmt.money(f._fund) : 'n/d'}</b><span title="${esc(f._fundName || '')}">${esc(f._fundName || 'Latest fund not disclosed')}${f._fundYear ? ` · ${f._fundYear}` : ''}</span></div>
      <div class="sys-card-body pe-strat">${esc(firstSentence(f.strategy))}</div>
      <div class="sys-chips m">${overlapChips(ctx, f._overlap)}${fmt.chip(`${f._deals.length} deal${f._deals.length === 1 ? '' : 's'}`, 'var(--sys-info)')}${fmt.chip(`${f._plats.length} portfolio compan${f._plats.length === 1 ? 'y' : 'ies'}`, 'var(--sys-mute)')}</div></div>`).join('')}</div>` : ui.empty('No firms match these filters');
    cardsEl.querySelectorAll('.pe-card').forEach(c => c.onclick = () => { cardsEl.querySelectorAll('.pe-card').forEach(x => x.classList.toggle('selected', x === c)); openFirm(ctx, B.byId[c.dataset.id], B); });
  };
  const fl = ui.filters(el.querySelector('#pe-f'), [
    { key: 'q', label: 'Search firm, portfolio company, person, sector…', type: 'search', value: params.q || '' },
    { key: 'ov', label: 'Overlap', options: SECTOR_KEYS.map(k => ({ value: k, label: sec(k).label })), value: params.overlap || '' },
    { key: 'threat', label: 'Threat', options: ['high', 'medium', 'low'].map(t => ({ value: t, label: THREAT[t].label })) },
    { key: 'comp', label: 'Competes for', options: Object.entries(COMPETES).map(([value, label]) => ({ value, label })) },
    { key: 'st', label: 'HQ state', options: states },
  ], draw);
  draw(fl.state);
  el.querySelectorAll('tr[data-ov]').forEach(tr => tr.onclick = () => { const s = el.querySelector('#pe-f select[data-k="ov"]'); if (s) { s.value = tr.dataset.ov; s.onchange(); el.querySelector('#pe-cards').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  el.querySelectorAll('#pe-watch .pe-act').forEach(a => a.onclick = () => openFirm(ctx, B.byId[a.dataset.id], B));
  el.querySelector('#pe-exp').onclick = () => ui.exportCSV(shown, cols, 'pe_landscape_firms');
  app.index(firms.map(f => ({ label: f.firm, sub: `PE sponsor · ${THREAT[f.threat_level]?.label || ''} · ${f.hq || ''}`, href: `#/pe/landscape?firm=${encodeURIComponent(f.id)}`, kind: 'PE firm', color: 'var(--c-pe)' })));
  app.index(B.plats.slice(0, 200).map(p => ({ label: p.name, sub: `${p.firm} portfolio company · ${p.sector || ''}`, href: `#/pe/comparables?q=${encodeURIComponent(p.name)}`, kind: 'Rival company', color: 'var(--c-pe)' })));
  if (params.firm && B.byId[params.firm]) openFirm(ctx, B.byId[params.firm], B);
}

/* ── View 2: Deal flow ─────────────────────────────────────────────────── */
function months(from, to) { const out = []; let [y, m] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number); while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } } return out; }
function stackedMonthly(rows, fmt) {
  const ms = months('2025-01', '2026-09'); const types = Object.keys(TYPE);
  const counts = ms.map(m => Object.fromEntries(types.map(t => [t, rows.filter(r => r._month === m && r.type === t).length])));
  const tot = counts.map(c => types.reduce((a, t) => a + c[t], 0)); const max = Math.max(2, ...tot); const H = 200;
  const step = max <= 4 ? 1 : max <= 8 ? 2 : Math.ceil(max / 4);
  const grid = []; for (let v = step; v <= max; v += step) grid.push(`<div class="gl" style="bottom:${16 + (v / max) * H}px"><span>${v}</span></div>`);
  return `<div class="pe-sbar">${grid.join('')}${ms.map((m, i) => `<div class="mc" title="${m}: ${tot[i]} deals (${types.map(t => `${counts[i][t]} ${TYPE[t].label.toLowerCase()}`).join(', ')})"><div class="stk">${types.map(t => counts[i][t] ? `<i style="height:${(counts[i][t] / max) * H}px;background:${TYPE[t].color}"></i>` : '').join('')}${tot[i] ? `<span class="tot">${tot[i]}</span>` : ''}</div><div class="lb">${m.endsWith('-01') || i === 0 ? m.slice(2, 4) + '·' : ''}${new Date(m + '-15').toLocaleDateString('en-US', { month: 'short' }).slice(0, 3)}</div></div>`).join('')}</div>`;
}
async function dealsView(ctx) {
  const { el, ui, fmt, charts, esc, params } = ctx; injectCss();
  const B = await load(ctx); if (!B.pe) return missing(ctx, 'Deal flow 2025–2026');
  const { deals, meta } = B;
  const inB = deals.filter(d => d._bucket !== 'other');
  const byFirm = {}; deals.forEach(d => byFirm[d.firm_id] = (byFirm[d.firm_id] || 0) + 1);
  const topFirmId = Object.entries(byFirm).sort((a, b) => b[1] - a[1])[0]?.[0]; const topFirm = B.byId[topFirmId];
  const bucketCounts = k => deals.filter(d => d._bucket === k && d.type !== 'exit').length;
  const ppN = bucketCounts('punctual_pros');
  const undated = deals.filter(d => !d._month).length;
  const firmsActive = new Set(deals.map(d => d.firm_id)).size;

  el.innerHTML = `<div class="m-pe">` + ui.pageHead({
    title: 'Deal flow 2025–2026',
    sub: `<b>So what:</b> ${fmt.num(deals.length)} disclosed deals by ${firmsActive} sponsors since Jan 2025; ${fmt.pct(inB.length / Math.max(1, deals.length))} land in sectors where BSP owns a company, led by residential services (${ppN} portfolio company/add-on deals — Punctual Pros' add-on pool). Add-ons are under-reported, so treat counts as a floor.`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/landscape">Landscape</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/comparables">Companies</a>`,
  }) + ui.kpis([
    { label: 'Disclosed deals', value: fmt.num(deals.length), sub: `${firmsActive} of ${B.firms.length} sponsors active`, color: 'var(--c-pe)' },
    { label: 'New companies', value: fmt.num(deals.filter(d => d.type === 'platform').length), sub: 'incl. structured equity', color: TYPE.platform.color },
    { label: 'Add-ons', value: fmt.num(deals.filter(d => d.type === 'add_on').length), sub: 'disclosed only — lower bound', color: TYPE.add_on.color },
    { label: 'Exits', value: fmt.num(deals.filter(d => d.type === 'exit').length), sub: 'incl. partial liquidity', color: TYPE.exit.color },
    { label: 'In BSP sectors', value: fmt.num(inB.length), sub: `${fmt.pct(inB.length / Math.max(1, deals.length))} of all deals`, color: 'var(--sys-warn)' },
    { label: 'Most active sponsor', value: fmt.num(byFirm[topFirmId] || 0), sub: esc(topFirm?.firm.split(' - ')[0] || '—'), color: 'var(--c-pe)' },
  ]) + `
  <div id="pe-df" class="mt-12"></div>
  <div class="grid grid-main">
    ${ui.panel({ title: 'Monthly deal count', sub: `Stacked by deal type · Jan 2025 – Sep 2026${undated ? ` · ${undated} deals dated to year only are excluded from the chart` : ''}`, body: `<div id="pe-month"></div><div class="sys-chips pe-legend mt-8">${Object.values(TYPE).map(t => `<span><i style="background:${t.color}"></i>${t.label}</span>`).join('')}</div>`, foot: srcFoot(ctx, meta, 'disclosed transactions only') })}
    ${ui.panel({ title: 'What they are buying', sub: 'Portfolio company + add-on deals by BSP-overlap sector, then top raw sectors', body: `<div id="pe-buy"></div>`, foot: srcFoot(ctx, meta, 'sector mapping = keyword classification') })}
  </div>
  <div class="mt-12" id="pe-dt"></div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Deals that touch BSP companies — act on these', sub: 'Most recent first · click for detail and next action', body: `<div class="pe-acts" id="pe-dact"></div>`, scroll: true, foot: srcFoot(ctx, meta) })}
    ${ui.panel({ title: 'Exits 2025–26 — who is paying for scaled services', sub: 'Sponsor-to-sponsor and strategic exits support BSP exit multiples', body: `<div id="pe-exits"></div>`, scroll: true, foot: srcFoot(ctx, meta) })}
  </div></div>`;

  const columns = [
    { key: 'date', label: 'Date', num: true, width: '96px', fmt: v => /^\d{4}$/.test(String(v)) ? `${esc(v)} <span class="dim">(yr)</span>` : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmt.date(v + 'T12:00:00') : /^\d{4}-\d{2}$/.test(String(v)) ? new Date(v + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : esc(v) },
    { key: 'firm', label: 'Sponsor', fmt: (v, r) => `<span title="${esc(v)}">${esc(String(v).split(' - ')[0])}</span>${r._threat === 'high' ? ` ${fmt.chip('high', 'var(--sys-bad)')}` : ''}` },
    { key: 'company', label: 'Company', fmt: v => `<b>${esc(v)}</b>` },
    { key: 'type', label: 'Type', fmt: v => fmt.chip(TYPE[v]?.label || v, TYPE[v]?.color) },
    { key: 'sector', label: 'Sector', fmt: (v, r) => `${esc(v || '—')}${r._bucket !== 'other' ? ` ${fmt.chip(sec(r._bucket).short, sec(r._bucket).color)}` : ''}` },
    { key: 'note', label: 'Note', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 150))}</span>` },
    { key: 'source_url', label: 'Source', fmt: v => v ? fmt.link(v, (fmt.host(v) || 'link') + ' ↗') : '—' },
  ];
  let tbl;
  const firmOpts = [...new Set(deals.map(d => d.firm_id))].map(id => ({ value: id, label: B.byId[id].firm.split(' - ')[0] })).sort((a, b) => a.label.localeCompare(b.label));
  const render = st => {
    const q = (st.q || '').toLowerCase();
    const rows = deals.filter(d => (!st.type || d.type === st.type) && (!st.bucket || d._bucket === st.bucket) && (!st.firm || d.firm_id === st.firm) && (!q || JSON.stringify(d).toLowerCase().includes(q)));
    f.setCount(`${rows.length} / ${deals.length} deals`);
    el.querySelector('#pe-month').innerHTML = rows.length ? stackedMonthly(rows, fmt) : ui.empty('No deals match');
    const buys = rows.filter(d => d.type !== 'exit');
    const bk = [...SECTOR_KEYS, 'other'].map(k => ({ label: sec(k).bucket, value: buys.filter(d => d._bucket === k).length, color: sec(k).color })).filter(x => x.value);
    const raw = {}; buys.forEach(d => { const s = d.sector || 'n/d'; raw[s] = (raw[s] || 0) + 1; });
    el.querySelector('#pe-buy').innerHTML = buys.length ? charts.hbar(bk, { fmt: v => fmt.num(v), labelW: 190 }) + `<h4 class="sys-card-label mt-12 mb-8">Top sectors as reported</h4><div class="sys-chips">${Object.entries(raw).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s, n]) => `<span class="sys-chip chip">${esc(s)} <span class="sys-num sys-muted">${n}</span></span>`).join('')}</div>` : ui.empty('No portfolio company/add-on deals in selection');
    tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#pe-dt'), { columns, rows, pageSize: 25, sortKey: 'date', exportName: 'pe_deals_2025_2026', onRow: d => openDeal(ctx, d, B) }));
    const acts = rows.filter(d => d._bucket !== 'other' && d.type !== 'exit').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.querySelector('#pe-dact').innerHTML = acts.length ? acts.map((d, i) => `<div class="pe-act click" tabindex="0" role="button" data-id="${esc(d.id)}"><div class="n">${String(i + 1).padStart(2, '0')}</div><div><div class="h">${esc(d.company)} <span class="sys-muted" style="font-weight:400">· ${esc(d.firm.split(' - ')[0])} · ${esc(d.date)}</span></div><div class="b">${esc(PLAY[d._bucket] ? PLAY[d._bucket].charAt(0).toUpperCase() + PLAY[d._bucket].slice(1) : '')}.</div><div class="sys-chips c">${fmt.chip(TYPE[d.type]?.label || d.type, TYPE[d.type]?.color)}${fmt.chip(sec(d._bucket).label, sec(d._bucket).color)}</div></div></div>`).join('') : ui.empty('No deals in BSP sectors for this selection');
    el.querySelectorAll('#pe-dact .pe-act').forEach(a => a.onclick = () => openDeal(ctx, deals.find(d => d.id === a.dataset.id), B));
    const ex = rows.filter(d => d.type === 'exit').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.querySelector('#pe-exits').innerHTML = ex.length ? `<div class="sys-table-wrap"><table class="sys-table pe-mini"><thead><tr><th>Date</th><th>Company</th><th>Seller</th><th>Note</th></tr></thead><tbody>${ex.map(d => `<tr class="click" tabindex="0" data-id="${esc(d.id)}"><td class="sys-num nowrap">${esc(d.date)}</td><td><b>${esc(d.company)}</b><div class="dim">${esc(d.sector || '')}</div></td><td>${esc(d.firm.split(' - ')[0])}</td><td class="small text-2" style="white-space:normal">${esc(d.note || '')}</td></tr>`).join('')}</tbody></table></div>` : ui.empty('No exits in selection');
    el.querySelectorAll('#pe-exits tr[data-id]').forEach(a => a.onclick = () => openDeal(ctx, deals.find(d => d.id === a.dataset.id), B));
  };
  const f = ui.filters(el.querySelector('#pe-df'), [
    { key: 'q', label: 'Search company, note, sector…', type: 'search', value: params.q || '' },
    { key: 'type', label: 'Type', options: Object.entries(TYPE).map(([value, t]) => ({ value, label: t.label })), value: params.type || '' },
    { key: 'bucket', label: 'Sector', options: [...SECTOR_KEYS, 'other'].map(k => ({ value: k, label: sec(k).bucket })), value: params.sector || '' },
    { key: 'firm', label: 'Sponsor', options: firmOpts, value: params.firm || '' },
  ], render);
  render(f.state);
}

/* ── View 3: Sector heatmap ────────────────────────────────────────────── */
/* Home-sales footprints of every platform that has a county sales file in data/sales/.
   Rival presence is parsed from Private-equity landscape text (county/city names), plus region-wide mentions. */
const FOOTPRINTS = {
  punctual_pros: {
    files: ['sales/pp_sales_pa_a', 'sales/pp_sales_pa_b', 'sales/pp_sales_nj'], where: 'Central PA + Jersey Shore', heldOnly: true,
    rx: {
      Lancaster: /\bLancaster\b/, York: /(?<!New )\bYork\b(?!,?\s*NY)/, Dauphin: /\bDauphin\b|\bHarrisburg\b/, Cumberland: /\bCumberland\b/, Lebanon: /\bLebanon\b/, Berks: /\bBerks\b|\bReading\b/,
      Chester: /\bChester County\b|\bWest Chester\b/, Montgomery: /\bMontgomery County\b|\bKing of Prussia\b/, Franklin: /\bFranklin County\b|\bChambersburg\b/, Adams: /\bAdams County\b|\bGettysburg\b/, Perry: /\bPerry County\b/,
      Ocean: /\bOcean County\b|\bOcean\b(?= &| and)|\bToms River\b/, Monmouth: /\bMonmouth\b/, Burlington: /\bBurlington County\b/, Atlantic: /\bAtlantic County\b|\bAtlantic City\b/,
    },
    region: /\bCentral (PA|Pennsylvania)\b|\bJersey Shore\b|\bSouth(ern)? Jersey\b/,
    why: 'New-mover volume is the demand pool both Punctual Pros and these rival residential companies market to.',
    src: ['County parcel/assessor layers & NJ SR1A', 'https://www.nj.gov/treasury/taxation/lpt/statdata/'],
  },
  cet: {
    files: ['sales/cet_transfers_ma', 'sales/cet_transfers_ct_ri', 'sales/cet_home_sales_ma', 'sales/cet_home_sales_ct_ri'], where: 'MA · CT · RI',
    rx: {
      Worcester: /\bWorcester\b/, Bristol: /\bBristol County\b|\bTaunton\b|\bFall River\b|\bNew Bedford\b/, Plymouth: /\bPlymouth County\b|\bBrockton\b|\bNorwell\b/, Norfolk: /\bNorfolk County\b|\bQuincy\b/,
      Suffolk: /\bBoston\b|\bSuffolk County\b/, Middlesex: /\bMiddlesex\b|\bCambridge\b|\bLowell\b/, Essex: /\bEssex County\b|\bLawrence, MA\b/, Hampden: /\bHampden\b|\bSpringfield, MA\b/,
      Hartford: /\bHartford\b/, 'New Haven': /\bNew Haven\b/, Fairfield: /\bFairfield County\b|\bStamford\b|\bBridgeport\b/, 'New London': /\bNew London\b/, Providence: /\bProvidence\b/,
    },
    region: /\bNew England\b|\bMassachusetts\b|\bConnecticut\b|\bRhode Island\b/,
    why: 'Home sales drive residential electrical/EV/solar retrofit demand; CET\'s core is commercial, so use the commercial rows in the CET module for its main market.',
    src: ['MassGIS L3 parcels, CT CAMA / OPM, RI town parcels', 'https://www.mass.gov/info-details/massgis-data-property-tax-parcels'],
  },
  bpi: {
    files: ['sales/bpi_sales_dc'], where: 'Washington, DC',
    rx: { 'District of Columbia': /\bWashington,? D\.?C\.?\b|\bDistrict of Columbia\b/ },
    region: null,
    why: 'DC housing turnover is a proxy for the policy/comms talent market BPI hires from; comms rivals compete nationally, not by county.',
    src: ['DC OTR owner polygons (DCGIS)', 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer/40'],
  },
  thomas_scientific: {
    files: ['sales/ts_sales_gloucester_nj'], where: 'Gloucester Co. NJ (Swedesboro HQ)',
    rx: { Gloucester: /\bGloucester County\b|\bSwedesboro\b|\bLogan Township\b/ },
    region: /\bSouth(ern)? Jersey\b|\bPhiladelphia region\b|\bDelaware Valley\b/,
    why: 'Gloucester County housing turnover is context for Thomas Scientific\'s HQ labor market; lab-supply rivals compete nationally, not by county.',
    src: ['NJ Taxation SR1A sales file', 'https://www.nj.gov/treasury/taxation/lpt/statdata/'],
  },
  fair_harbor: {
    files: ['sales/fh_sales_nyc'], where: 'Manhattan (SoHo store)',
    rx: { 'New York': /\bManhattan\b|\bSoHo\b/ },
    region: /\bNYC\b|\bNew York City\b/,
    why: 'Manhattan turnover (co-ops, condos, 1–3 family) is context for Fair Harbor\'s owned store; consumer-brand rivals compete nationally.',
    src: ['NYC DOF rolling sales', 'https://data.cityofnewyork.us/resource/usep-8jbt'],
  },
};
const NO_SALES = { frontline: 'St. Louis (managed IT for law firms, national; Missouri does not disclose sale prices)' };
const _countyCache = {};
async function countyRows(ctx, k, B) {
  if (_countyCache[k] && _countyCache[k].B === B) return _countyCache[k];
  const F = FOOTPRINTS[k];
  const rivals = B.firms.filter(f => f._overlap.includes(k) && (!F.heldOnly || f._plats.some(p => p._bucket === k && p.status !== 'exited')));
  const presence = {}; const regional = [];
  for (const f of rivals) {
    const txt = [f.trajectory, f.threat_rationale, f.strategy, ...f._plats.map(p => `${p.notes || ''} ${p.hq || ''}`), ...f._deals.map(d => `${d.note || ''} ${d.company || ''}`)].join(' ');
    const plat = f._plats.find(p => p._bucket === k && p.status !== 'exited')?.name || shortName(f.firm.split(' - ')[0]);
    let hit = false;
    for (const [c, rx] of Object.entries(F.rx)) if (rx.test(txt)) { (presence[c] = presence[c] || []).push({ f, plat }); hit = true; }
    if (!hit && F.region && F.region.test(txt)) regional.push({ f, plat, m: txt.match(F.region)[0] });
  }
  const res = await Promise.all(F.files.map(n => ctx.data.load(n).catch(() => null)));
  const got = res.filter(Boolean);
  const FROM = '2025-09-01'; const cov = {}; const partial = new Set(); const trims = [];
  const totalItems = got.reduce((s, d) => s + (d.items || []).length, 0);
  const hasRes = got.some(d => (d.items || []).some(r => r.use_type === 'residential'));
  const useOk = hasRes ? (u => u === 'residential') : (u => u === 'commercial' || u === 'industrial' || u === 'mixed');
  const agg = {};
  for (const d of got) {
    const m = d.meta || {};
    const covs = Array.isArray(m.coverage) ? m.coverage : m.coverage ? [m.coverage] : [];
    covs.forEach(c => { if (!c || !c.county) return; const o = cov[c.county]; cov[c.county] = o ? { from: [o.from, c.date_from].filter(Boolean).sort()[0], to: [o.to, c.date_to].filter(Boolean).sort().pop() } : { from: c.date_from, to: c.date_to }; });
    (m.caveats || []).forEach(t => { const mm = String(t).match(/\b([A-Z]{4,}) IS PARTIAL\b/); if (mm) partial.add(mm[1].charAt(0) + mm[1].slice(1).toLowerCase()); if (/residential rows removed/i.test(t)) trims.push(String(t)); });
    for (const r of d.items || []) {
      if (!useOk(r.use_type) || !r.sale_date || r.sale_date < FROM || !(r.price > 1000) || r.arms_length === false || !r.county) continue;
      const a = agg[r.county] || (agg[r.county] = { n: 0, prices: [], state: r.state, max: r.sale_date });
      a.n++; a.prices.push(r.price); if (r.sale_date > a.max) a.max = r.sale_date;
    }
  }
  const rows = Object.entries(agg).map(([county, a]) => {
    const from = cov[county]?.from && cov[county].from > FROM ? cov[county].from : FROM; const to = [cov[county]?.to, a.max].filter(Boolean).sort().pop();
    const mo = Math.max(1, (new Date(to) - new Date(from)) / (30.44 * 864e5));
    return { county, state: a.state, n: a.n, perMo: a.n / mo, med: median(a.prices), rivals: presence[county] || [], partial: partial.has(county), from, to };
  }).sort((x, y) => (y.rivals.length > 0) - (x.rivals.length > 0) || y.perMo - x.perMo);
  return (_countyCache[k] = { B, rows, regional, loaded: got.length, files: F.files.length, fallback: !hasRes && totalItems > 0, totalItems, trims });
}
async function portfolioCounties(ctx, box, B, alive) {
  const { ui, fmt, esc } = ctx;
  box.innerHTML = `<div class="row wrap gap-8 mb-8"><div id="pe-cseg"></div><button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" id="pe-cexp">⇩ CSV</button></div><div id="pe-cbody">${ui.loading('Loading county home-sales records…')}</div>`;
  const body = box.querySelector('#pe-cbody'); let cur = null;
  const show = async k => {
    cur = k; body.innerHTML = ui.loading(`Loading ${esc(sec(k).label)} county home-sales records…`);
    let R; try { R = await countyRows(ctx, k, B); } catch (e) { if (alive() && cur === k) body.innerHTML = ui.note(`Could not load county home-sales data: ${esc(e.message)}`, 'warn'); return; }
    if (!alive() || cur !== k) return;
    const F = FOOTPRINTS[k];
    const regional = R.regional.length ? `<div class="small mt-8"><span class="muted">Region-wide mentions (no county named):</span> ${R.regional.map(x => fmt.chip(`${x.plat} · ${x.m}`, x.f.threat_level === 'high' ? 'var(--sys-bad)' : 'var(--sys-warn)')).join(' ')}</div>` : '';
    if (!R.rows.length) { body.innerHTML = ui.note(`Home-sales datasets for ${esc(sec(k).label)} (${[...new Set(F.files.map(n => Copy.dataset(n)))].map(esc).join(', ')}) are not available yet.`, 'warn') + regional; return; }
    const unit = R.fallback ? 'commercial/industrial transfers' : 'home sales';
    const fbNote = R.fallback ? ui.note(`<b>No home-sale (residential) records in the ${esc(sec(k).label)} files.</b> ${fmt.num(R.totalItems)} transfers are present, but the residential rows gathered for these counties were trimmed out${R.trims.length ? ` (<i>${esc(R.trims[0].slice(0, 140))}</i>)` : ''}. Showing commercial/industrial/mixed-use transfer turnover instead until the residential rows are restored to ${[...new Set(F.files.map(f => Copy.dataset(f)))].map(esc).join(', ')}.`, 'warn') : '';
    const rows = R.rows; const totMo = rows.reduce((s, r) => s + r.perMo, 0); const conMo = rows.filter(r => r.rivals.length).reduce((s, r) => s + r.perMo, 0);
    body.innerHTML = `${fbNote}${R.loaded < R.files ? ui.note(`${R.files - R.loaded} of ${R.files} sales files could not be loaded — totals are partial.`, 'warn') : ''}<div class="sys-kpis pe-cstats mb-8"><div class="sys-kpi pe-stat" data-co="" style="--co:var(--sys-bad)"><div class="sys-kpi-label l">Contested share of turnover</div><div class="sys-kpi-value v">${fmt.pct(conMo / Math.max(1, totMo))}</div><div class="sys-kpi-sub s">${fmt.num(conMo)} of ${fmt.num(totMo)} ${unit} / month</div></div><div class="sys-kpi pe-stat" data-co="" style="--co:${sec(k).color}"><div class="sys-kpi-label l">Counties with a rival named</div><div class="sys-kpi-value v">${rows.filter(r => r.rivals.length).length} / ${rows.length}</div><div class="sys-kpi-sub s">${esc(sec(k).label)} footprint · ${esc(F.where)}</div></div></div>
    <div class="sys-table-wrap"><table class="sys-table pe-mini"><thead><tr><th>County</th><th class="sys-n">${R.fallback ? 'Transfers' : 'Home sales'} / mo</th><th class="sys-n">Median price</th><th>Rival companies named in research</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.county)}</b>, ${esc(r.state || '')}${r.partial ? ` ${fmt.chip('partial data', 'var(--sys-warn)')}` : ''}<div class="dim small">${esc(r.from)} → ${esc(r.to)}</div></td><td class="sys-n">${fmt.num(r.perMo)}</td><td class="sys-n">${fmt.money(r.med)}</td><td>${r.rivals.length ? r.rivals.map(x => fmt.chip(x.plat, x.f.threat_level === 'high' ? 'var(--sys-bad)' : 'var(--sys-warn)')).join(' ') : '<span class="dim">none named</span>'}</td></tr>`).join('')}</tbody></table></div>${regional}
    <div class="dim small mt-8">${R.fallback ? 'Commercial, industrial and mixed-use' : 'Residential'}, price &gt; $1,000, arms-length where flagged; sales since September 1, 2025 (or county coverage start) ÷ months of county coverage — source lags differ by county. ${esc(F.why)}</div>
    <p class="sys-src"><b>Source:</b> ${fmt.link(F.src[1], F.src[0])} via ${[...new Set(F.files.map(f => Copy.dataset(f)))].map(esc).join(', ')}. No home-sales file for ${Object.entries(NO_SALES).map(([kk, v]) => `${esc(sec(kk).label)} (${esc(v)})`).join(' or ')}.</p>`;
    box.querySelector('#pe-cexp').onclick = () => ui.exportCSV(rows.map(r => ({ ...r, portco: sec(k).label, rivals: r.rivals.map(x => x.plat).join('; '), perMo: Math.round(r.perMo * 10) / 10 })), [{ key: 'portco', label: 'Portfolio company' }, { key: 'county', label: 'County' }, { key: 'state', label: 'State' }, { key: 'n', label: R.fallback ? 'Commercial/industrial transfers in window' : 'Residential sales in window' }, { key: 'from', label: 'Window from' }, { key: 'to', label: 'Window to' }, { key: 'perMo', label: R.fallback ? 'Transfers per month' : 'Home sales per month' }, { key: 'med', label: 'Median price (USD)' }, { key: 'partial', label: 'Partial data' }, { key: 'rivals', label: 'Rival companies named' }], `pe_portco_county_home_sales_${k}`);
  };
  ui.seg(box.querySelector('#pe-cseg'), Object.keys(FOOTPRINTS).map(k => ({ value: k, label: sec(k).label })), 'punctual_pros', show);
  await show('punctual_pros');
}
async function heatmap(ctx) {
  const { el, ui, fmt, charts, esc } = ctx; injectCss();
  const B = await load(ctx); if (!B.pe) return missing(ctx, 'Sector heatmap');
  const { firms, meta, bspRef } = B;
  const hm = meta.sector_heatmap || {};
  const active = Object.fromEntries(SECTOR_KEYS.map(k => [k, new Set(hm[k]?.most_active || [])]));
  const cellOf = (f, k) => active[k].has(f.id) ? 2 : f._overlap.includes(k) ? 1 : 0;
  const rows = firms.map(f => ({ f, cells: SECTOR_KEYS.map(k => cellOf(f, k)) })).filter(r => r.cells.some(Boolean))
    .sort((a, b) => b.cells.filter(c => c === 2).length - a.cells.filter(c => c === 2).length || b.f._threatRank - a.f._threatRank || b.cells.filter(Boolean).length - a.cells.filter(Boolean).length);
  const multi = rows.filter(r => r.cells.filter(Boolean).length >= 2).length;
  const hottest = SECTOR_KEYS.slice().sort((a, b) => active[b].size - active[a].size)[0];
  const funds = firms.filter(f => f._fund != null).sort((a, b) => b._fund - a._fund);
  const rank = funds.filter(f => f._fund > bspRef.fund).length + 1;
  const imps = Array.isArray(meta.implications_for_bsp) ? meta.implications_for_bsp : [];
  const impKey = s => { for (const [k, v] of Object.entries(SECTORS)) if (new RegExp(v.label.split(' ')[0], 'i').test(s.slice(0, 60))) return k; return null; };
  const unmounted = { v: false };

  el.innerHTML = `<div class="m-pe">` + ui.pageHead({
    title: 'Sector heatmap',
    sub: `<b>So what:</b> ${sec(hottest).label} faces the densest competition (${active[hottest].size} named most-active of ${firms.filter(f => f._overlap.includes(hottest)).length} overlapping sponsors, intensity "${esc(hm[hottest]?.intensity || '')}"); CET's New England footprint is still open space and Frontline's legal IT + RCM model has no sponsor-backed copy. Defend PP with proprietary sourcing; accelerate CET and Frontline add-ons while the window is open.`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/landscape">Landscape</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/comparables">Companies</a>`,
  }) + ui.kpis([
    { label: 'BSP sectors mapped', value: fmt.num(SECTOR_KEYS.length), sub: `${rows.length} sponsors active in ≥1`, color: 'var(--sys-brand)' },
    { label: 'Hottest sector', value: esc(sec(hottest).short), sub: `<span title="Named most-active = sponsors analysts flag as most active in the sector (sector heatmap); overlapping = any sponsor whose companies or mandate overlap the BSP portfolio company">${active[hottest].size} named most-active · ${firms.filter(f => f._overlap.includes(hottest)).length} overlapping</span>`, color: sec(hottest).color },
    { label: 'Multi-sector rivals', value: fmt.num(multi), sub: 'overlap ≥2 BSP companies', color: 'var(--sys-bad)' },
    { label: 'Open-space sectors', value: fmt.num(SECTOR_KEYS.filter(k => /low/.test(hm[k]?.intensity || '')).length), sub: SECTOR_KEYS.filter(k => /low/.test(hm[k]?.intensity || '')).map(k => sec(k).short).join(' · ') || '—', color: 'var(--sys-good)' },
    { label: 'BSP fund-size rank', value: `#${rank}`, sub: `Fund I ${fmt.money(bspRef.fund)} (Form D) of ${funds.length + 1} disclosed latest funds`, color: 'var(--c-pe)' },
  ]) + `
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Rival activity × BSP portfolio company', sub: 'Filled = named most-active in that sector · ring = overlap only · click a row for the sponsor profile', body: `<div class="sys-table-wrap pe-matrix"><table class="sys-table"><thead><tr><th class="l">Sponsor</th>${SECTOR_KEYS.map(k => `<th title="${esc(hm[k]?.sector || '')} — intensity: ${esc(hm[k]?.intensity || 'n/d')}"><span class="co"><span class="sys-dot" style="--co:${sec(k).color}" aria-hidden="true"></span>${esc(sec(k).short)}</span><span class="int">${fmt.chip(String(hm[k]?.intensity || 'n/d').split('(')[0].trim(), /very high/.test(hm[k]?.intensity || '') ? 'var(--sys-bad)' : /medium/.test(hm[k]?.intensity || '') ? 'var(--sys-warn)' : 'var(--sys-good)')}</span></th>`).join('')}<th>Threat</th><th class="sys-n">Fund</th></tr></thead><tbody>${rows.map(r => `<tr data-id="${esc(r.f.id)}"><td class="l" title="${esc(r.f.firm)}"><div class="nm"><b>${esc(r.f.firm.split(' - ')[0])}</b></div>${r.f.firm.includes(' - ') ? `<div class="sb dim">${esc(r.f.firm.split(' - ')[1])}</div>` : ''}</td>${r.cells.map((c, j) => `<td><span class="pe-cell ${c === 2 ? 'on' : c === 1 ? 'ov' : 'no'}" style="--cc:${sec(SECTOR_KEYS[j]).color}" title="${esc(sec(SECTOR_KEYS[j]).label)}: ${c === 2 ? 'most active' : c === 1 ? 'overlap' : '—'}"></span></td>`).join('')}<td>${threatChip(ctx, r.f.threat_level)}</td><td class="sys-n">${r.f._fund != null ? fmt.money(r.f._fund) : '<span class="dim">n/d</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="pe-notes">${SECTOR_KEYS.filter(k => hm[k]?.note).map(k => `<div style="--cc:${sec(k).color}"><b>${esc(sec(k).label)}.</b> ${esc(hm[k].note)}</div>`).join('')}</div>`, foot: srcFoot(ctx, meta, 'most-active lists and intensity are analyst judgments') })}
    ${ui.panel({ title: 'Implications for Broad Sky', sub: 'Action list — one move per company', body: `<div class="pe-acts">${imps.map((s, i) => { const k = impKey(s); return `<div class="pe-act"><div class="n">${String(i + 1).padStart(2, '0')}</div><div><div class="h">${esc(firstSentence(s))}</div><div class="b">${esc(String(s).slice(firstSentence(s).length).trim())}</div><div class="sys-chips c">${k ? `${fmt.chip(sec(k).label, sec(k).color)}<a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/${sec(k).mod}">Open ${esc(sec(k).short)} →</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/pe/deals?sector=${k}">Rival deals →</a>` : fmt.chip('Firm level', 'var(--sys-brand)')}</div></div></div>`; }).join('') || ui.empty('No implications in dataset')}</div>`, foot: srcFoot(ctx, meta, 'analyst judgment') })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Fund-size comparison — latest flagship', sub: `BSP Fund I highlighted · bars coloured by threat · ${firms.length - funds.length} firms without a disclosed fund size omitted`, body: charts.hbar([...funds.map(f => ({ label: `${f.firm.split(' - ')[0]}${f._fundYear ? ` '${String(f._fundYear).slice(2)}` : ''}`, value: f._fund, color: THREAT[f.threat_level]?.color || 'var(--c-pe)' })), { label: '▶ Broad Sky Fund I', value: bspRef.fund, color: 'var(--sys-brand)' }, ...(bspRef.spvTotal ? [{ label: '▷ BSP Fund I + deal SPVs', value: bspRef.fund + bspRef.spvTotal, color: 'var(--sys-brand)' }] : [])].sort((a, b) => b.value - a.value), { fmt: v => fmt.money(v), labelW: 180 }) + `<div class="sys-chips pe-legend mt-12"><span><i style="background:var(--sys-bad)"></i>High threat</span><span><i style="background:var(--sys-warn)"></i>Medium</span><span><i style="background:var(--sys-mute)"></i>Low</span><span><i style="background:var(--sys-brand)"></i>Broad Sky</span></div>`, foot: srcFoot(ctx, meta, 'fund sizes as announced; some are co-invest/top-up vehicles') + ` <span class="dim">· BSP Fund I = ${fmt.link(bspRef.fundSrc, 'SEC Form D')} (${esc(bspRef.fundClose)}); deal SPVs from BSP-* Form D filings</span>` })}
    ${ui.panel({ title: 'Portfolio counties — rival presence × home-sales turnover', sub: 'Home sales in the counties each portfolio company serves, crossed with the rival companies research places there · switch company below', body: `<div id="pe-cc">${ui.loading('Loading county home-sales records…')}</div>`, foot: ui.source('County assessor and deed records (PA, NJ, MA, CT, RI, DC, New York City)', 'https://www.nj.gov/treasury/taxation/lpt/statdata/', 'Sep 2026') + ` <span class="dim">· rival presence parsed from Private-equity landscape text</span>` })}
  </div></div>`;
  el.querySelectorAll('.pe-matrix tbody tr').forEach(tr => tr.onclick = () => openFirm(ctx, B.byId[tr.dataset.id], B));
  portfolioCounties(ctx, el.querySelector('#pe-cc'), B, () => !unmounted.v && document.body.contains(el.querySelector('#pe-cc'))).catch(e => { const b = el.querySelector('#pe-cc'); if (b) b.innerHTML = ui.note(`Could not load county home-sales data: ${esc(e.message)}`, 'warn'); });
  return () => { unmounted.v = true; };
}

/* ── View 4: Platform comparables ──────────────────────────────────────── */
async function platforms(ctx) {
  const { el, ui, fmt, charts, esc, params } = ctx; injectCss();
  const B = await load(ctx); if (!B.pe) return missing(ctx, 'Portfolio company comparables');
  const { plats, meta, bspPlats } = B;
  const withAdd = plats.filter(p => p.add_ons_count != null);
  const withVel = plats.filter(p => p._velocity != null);
  const rivMed = median(withVel.map(p => p._velocity)); const bspMed = median(bspPlats.map(p => p.velocity));
  const top = withVel.slice().sort((a, b) => b._velocity - a._velocity)[0];
  const exits = plats.filter(p => p.status === 'exited');
  const inB = plats.filter(p => p._bucket !== 'other');
  const bspTotal = bspPlats.reduce((s, p) => s + p.add, 0);

  el.innerHTML = `<div class="m-pe">` + ui.pageHead({
    title: 'Portfolio company comparables',
    sub: `<b>So what:</b> rival companies with disclosed counts add a median ${fmt.num(rivMed, 1)} add-ons/yr vs ${fmt.num(bspMed, 1)}/yr across BSP's companies${top ? `; ${esc(top.name)} (${esc(top.firm.split(' - ')[0])}) runs at ${fmt.num(top._velocity, 0)}/yr` : ''}. To keep pace in contested sectors (PP especially), BSP needs a funded add-on engine, not episodic tuck-ins.`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/pe/landscape">Landscape</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/ma">Acquisition engine</a>`,
  }) + ui.kpis([
    { label: 'Rival companies tracked', value: fmt.num(plats.length), sub: `${fmt.num(plats.filter(p => p.status === 'held').length)} held · ${fmt.num(exits.length)} exited`, color: 'var(--c-pe)' },
    { label: 'In BSP sectors', value: fmt.num(inB.length), sub: `${fmt.num(inB.filter(p => p._bucket === 'punctual_pros').length)} residential services`, color: 'var(--sys-warn)' },
    { label: 'Disclosed add-on counts', value: fmt.num(withAdd.length), sub: `${fmt.num(withAdd.reduce((s, p) => s + p.add_ons_count, 0))} add-ons in total`, color: 'var(--sys-info)' },
    { label: 'Rival median pace', value: `${fmt.num(rivMed, 1)}<small>/yr</small>`, sub: `${withVel.length} companies with an entry year`, color: 'var(--sys-bad)' },
    { label: 'BSP median pace', value: `${fmt.num(bspMed, 1)}<small>/yr</small>`, sub: `${bspTotal} add-ons across ${bspPlats.length} portfolio compan${bspPlats.length === 1 ? 'y' : 'ies'}`, color: 'var(--sys-brand)' },
  ]) + (B.bsp ? '' : `<div class="mt-12">${ui.note('Research dataset <b>Broad Sky firm profile</b> is not available — the Broad Sky benchmark falls back to Smith + Howard only (published exit facts); BSP pace is not representative until the Broad Sky firm profile is restored.', 'warn')}</div>`) + `
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Add-on velocity — rivals vs Broad Sky', sub: 'Disclosed add-ons ÷ years held (mid-year entry assumed where month unknown) · Broad Sky companies marked ▶', actions: `<div id="pe-vseg"></div>`, body: `<div id="pe-vel"></div>`, foot: srcFoot(ctx, meta, 'add-on counts mix lifetime and single-year figures — indicative') + ` · ${ui.source('Broad Sky firm profile', 'https://broadskypartners.com/news/', B.bsp?.meta?.generated)}` })}
    ${ui.panel({ title: 'Exits — who buys scaled companies', sub: 'Exit buyers set the ceiling for BSP exit multiples', body: `<div class="sys-table-wrap"><table class="sys-table pe-mini"><thead><tr><th>Portfolio company</th><th>Seller</th><th class="sys-n">Year</th><th>Buyer</th></tr></thead><tbody>${exits.sort((a, b) => (b.exit_year || 0) - (a.exit_year || 0)).map(p => `<tr class="click" data-id="${esc(p.id)}"><td><b>${esc(p.name)}</b><div class="dim">${esc(p.sector || '')}</div></td><td>${esc(p.firm.split(' - ')[0])}</td><td class="sys-n">${p.exit_year ?? '—'}</td><td>${esc(p.exit_buyer || 'n/d')}</td></tr>`).join('')}<tr><td><b>Smith + Howard</b><div class="dim">Tax, accounting & advisory</div></td><td>Broad Sky</td><td class="sys-n">2026</td><td>TPG Growth</td></tr></tbody></table></div>`, scroll: true, foot: srcFoot(ctx, meta) })}
  </div>
  <div class="mt-12" id="pe-pf"></div><div id="pe-pt"></div>
  ${ui.panel({ title: 'What the benchmark means for Broad Sky', sub: 'Action list', cls: 'mt-12', body: `<div class="pe-acts" id="pe-pact"></div>`, foot: srcFoot(ctx, meta) })}
  </div>`;

  // velocity chart
  const velRows = mode => {
    const r = withAdd.map(p => ({ label: `${p.name} · ${p.firm.split(' - ')[0].split(' ')[0]}`, value: mode === 'pace' ? p._velocity : p.add_ons_count, color: p._bucket !== 'other' ? 'var(--c-pe)' : 'var(--sys-mute)', rival: true }))
      .concat(bspPlats.map(p => ({ label: `▶ ${p.name} (BSP)`, value: mode === 'pace' ? p.velocity : p.add, color: 'var(--sys-brand)' })))
      .filter(x => x.value != null).sort((a, b) => b.value - a.value);
    return charts.hbar(r, { fmt: v => mode === 'pace' ? `${fmt.num(v, 1)}/yr` : fmt.num(v), labelW: 230 }) + `<div class="sys-chips pe-legend mt-12"><span><i style="background:var(--c-pe)"></i>Rival company in a BSP sector</span><span><i style="background:var(--sys-mute)"></i>Rival company, other sector</span><span><i style="background:var(--sys-brand)"></i>Broad Sky portfolio company (▶)</span></div>`;
  };
  const velEl = el.querySelector('#pe-vel');
  ui.seg(el.querySelector('#pe-vseg'), [{ value: 'pace', label: 'Per year' }, { value: 'total', label: 'Total' }], 'pace', v => velEl.innerHTML = velRows(v));
  velEl.innerHTML = velRows('pace');
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openPlatform(ctx, plats.find(p => p.id === tr.dataset.id), B));

  // actions
  const ppR = withVel.filter(p => p._bucket === 'punctual_pros'); const ppPace = median(ppR.map(p => p._velocity));
  const bspPP = bspPlats.find(p => /punctual/i.test(p.name)); const bspCET = bspPlats.find(p => /commonwealth|cet/i.test(p.name));
  const acts = [
    { h: `Punctual Pros is out-paced ${ppPace && bspPP ? `${fmt.num(ppPace / Math.max(.1, bspPP.velocity), 0)}×` : ''} by residential consolidators`, b: `Residential rivals with disclosed counts run at a median ${fmt.num(ppPace, 1)} add-ons/yr (${ppR.map(p => esc(p.name)).join(', ')}) vs Punctual Pros at ${bspPP ? fmt.num(bspPP.velocity, 1) : '—'}/yr. Stand up a funded tuck-in program (target 3–4/yr) aimed at founder-owned PA/NJ shops below the size large sponsors chase.`, k: 'punctual_pros' },
    { h: 'CET should compound before institutional electrical companies arrive', b: `Kohlberg's Loenbro and Huron's Criticore are adding ${fmt.num(median(withVel.filter(p => p._bucket === 'cet').map(p => p._velocity)), 1)}/yr outside New England; CET is at ${bspCET ? fmt.num(bspCET.velocity, 1) : '—'}/yr. Pre-build a pipeline of New England electrical/wastewater targets (see Acquisition engine).`, k: 'cet' },
    { h: 'Smith + Howard proves the model — replicate its cadence', b: `S+H added 9 firms in ~${fmt.num(bspPlats.find(p => /smith/i.test(p.name))?.years || 3.7, 1)} years (${fmt.num(bspPlats.find(p => /smith/i.test(p.name))?.velocity || 2.4, 1)}/yr) and sold to TPG Growth. Use it as the Fund II proof point and as the template for BPI and Thomas Scientific add-on programs.`, k: null },
    { h: 'Exit buyers are paying for scale', b: `${exits.length} rival company exits in the dataset went to ${[...new Set(exits.map(p => p.exit_buyer).filter(Boolean))].slice(0, 5).map(esc).join(', ')}. Build companies to the size these buyers underwrite.`, k: null },
  ];
  el.querySelector('#pe-pact').innerHTML = acts.map((a, i) => `<div class="pe-act"><div class="n">${String(i + 1).padStart(2, '0')}</div><div><div class="h">${a.h}</div><div class="b">${a.b}</div>${a.k ? `<div class="sys-chips c">${fmt.chip(sec(a.k).label, sec(a.k).color)}<a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/${sec(a.k).mod}">Open ${esc(sec(a.k).short)} →</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/ma">Targets →</a></div>` : ''}</div></div>`).join('');

  // table
  const columns = [
    { key: 'name', label: 'Company', fmt: (v, r) => `<b>${esc(v)}</b>${r._filings.length ? ` ${fmt.chip(`${r._filings.length} filings`, 'var(--c-fin)')}` : ''}` },
    { key: 'firm', label: 'Sponsor', fmt: v => `<span title="${esc(v)}">${esc(String(v).split(' - ')[0])}</span>` },
    { key: 'sector', label: 'Sector', wrap: true, width: '220px', fmt: (v, r) => `<span class="small">${esc(v || '—')}</span>${r._bucket !== 'other' ? ` ${fmt.chip(sec(r._bucket).short, sec(r._bucket).color)}` : ''}` },
    { key: 'entry_year', label: 'Entry', num: true, sort: nullLast('entry_year'), fmt: v => v ?? '—' },
    { key: 'add_ons_count', label: 'Add-ons', num: true, sort: nullLast('add_ons_count'), fmt: v => v != null ? fmt.num(v) : '<span class="dim">n/d</span>' },
    { key: '_velocity', label: 'Pace /yr', num: true, sort: nullLast('_velocity'), fmt: v => v != null ? fmt.num(v, 1) : '—' },
    { key: 'status', label: 'Status', fmt: v => fmt.chip(v, v === 'exited' ? 'var(--sys-mute)' : v === 'held' ? 'var(--sys-good)' : 'var(--sys-mute-2)') },
    { key: '_exit', label: 'Exit', wrap: true, width: '150px', fmt: v => v ? `<span class="small">${esc(v)}</span>` : '—' },
    { key: 'notes', label: 'Notes', wrap: true, width: '280px', fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 120))}</span>` },
  ];
  let tbl;
  const firmOpts = B.firms.filter(f => f._plats.length).map(f => ({ value: f.id, label: f.firm.split(' - ')[0] })).sort((a, b) => a.label.localeCompare(b.label));
  const f = ui.filters(el.querySelector('#pe-pf'), [
    { key: 'q', label: 'Search company, sponsor, notes…', type: 'search', value: params.q || '' },
    { key: 'bucket', label: 'Sector', options: [...SECTOR_KEYS, 'other'].map(k => ({ value: k, label: sec(k).bucket })), value: params.sector || '' },
    { key: 'status', label: 'Status', options: ['held', 'exited', 'n/d'] },
    { key: 'firm', label: 'Sponsor', options: firmOpts, value: params.firm || '' },
    { key: 'disc', label: 'Add-on count disclosed', type: 'toggle' },
  ], st => {
    const q = (st.q || '').toLowerCase();
    const rows = plats.filter(p => (!st.bucket || p._bucket === st.bucket) && (!st.status || p.status === st.status) && (!st.firm || p.firm_id === st.firm) && (!st.disc || p.add_ons_count != null) && (!q || JSON.stringify(p).toLowerCase().includes(q)));
    f.setCount(`${rows.length} / ${plats.length} companies`);
    tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#pe-pt'), { columns, rows, pageSize: 25, sortKey: 'add_ons_count', exportName: 'pe_company_comparables', onRow: p => openPlatform(ctx, p, B) }));
  });
  const st0 = f.state; const q0 = (st0.q || '').toLowerCase();
  const rows0 = plats.filter(p => (!st0.bucket || p._bucket === st0.bucket) && (!st0.firm || p.firm_id === st0.firm) && (!q0 || JSON.stringify(p).toLowerCase().includes(q0)));
  f.setCount(`${rows0.length} / ${plats.length} companies`);
  tbl = ui.table(el.querySelector('#pe-pt'), { columns, rows: rows0, pageSize: 25, sortKey: 'add_ons_count', exportName: 'pe_company_comparables', onRow: p => openPlatform(ctx, p, B) });
  const exact = params.q ? rows0.find(p => p.name.toLowerCase() === params.q.toLowerCase()) : null; if (exact || (params.q && rows0.length === 1)) openPlatform(ctx, exact || rows0[0], B);
}

export default {
  id: 'pe', name: 'PE landscape', tag: 'Competitors', color: 'var(--c-pe)', group: 'Intelligence',
  tagline: 'History, trajectory, deal flow and buy-and-build benchmarks of the PE sponsors competing with Broad Sky',
  hq: { lat: 40.7585, lon: -73.9745, label: 'New York, NY (Broad Sky HQ)' },
  views: [
    { id: 'landscape', name: 'Landscape', icon: '◎', render: landscape },
    { id: 'deals', name: 'Deal flow 2025–26', icon: '⇄', render: dealsView },
    { id: 'heatmap', name: 'Sector heatmap', icon: '▦', render: heatmap },
    { id: 'comparables', name: 'Portfolio company comparables', icon: '◫', render: platforms },
  ],
  tour: [
    { order: 900, hash: '#/pe/landscape', caption: '<b>PE landscape.</b> 35 sponsors chase the same deals; 9 are high-threat. The median rival flagship ($1.5B) is ~4.5× Fund I ($335M, SEC Form D).', narration: 'Broad Sky competes with thirty-five sponsors, nine of them high-threat. We win on focus and operating credibility, not price.', duration: 8000 },
    { order: 910, hash: '#/pe/heatmap', caption: '<b>Sector heatmap.</b> Punctual Pros sits in the most crowded field; CET and Frontline still have open space to consolidate.', narration: 'Residential services is the most crowded field; CET and Frontline still have open space to accelerate add-ons.', duration: 7000 },
    { order: 920, hash: '#/pe/deals', caption: '<b>Deal flow 2025–26.</b> Every disclosed portfolio company, add-on and exit by rival sponsors, with the ones touching BSP sectors flagged.', narration: 'Every disclosed rival deal since January 2025, with those touching our sectors flagged.', duration: 5500 },
  ],
};
