/* Home: the first screen for every level (firm, company, role) and the agent inside the shell */
import { dataset, srcLabel } from './copy.js?v=20261123143257';
import { loadScoreboard, templateExit } from './fin.js?v=20261123143257';
import { Session } from '../assets/session.js?v=20261123143257';
import { embedView } from './embed.js?v=20261123143257';
const COS = [
  { id: 'cet', name: 'Commonwealth Electrical (CET)', short: 'CET', color: 'var(--co-cet)', hex: '#4c8dff', sector: 'Commercial electrical · solar · energy', hq: 'Worcester, MA', lat: 42.2626, lon: -71.8023, entry: '2025-02', footprint: 'Licensed in all 6 New England states' },
  { id: 'pp', name: 'Punctual Pros', short: 'PP', color: 'var(--co-pp)', hex: '#f08a3c', sector: 'Residential HVAC · plumbing · electrical', hq: 'East Hempfield, PA', lat: 40.0629, lon: -76.3700, entry: '2024-04', footprint: '248 Central PA zips + Ocean/Monmouth NJ' },
  { id: 'fl', name: 'Frontline Managed Services', short: 'FL', color: 'var(--co-fl)', hex: '#9d7bff', sector: 'Legal managed IT · revenue cycle', hq: 'St. Louis, MO', lat: 38.6270, lon: -90.1994, entry: '2024-12', footprint: '800+ law firms · >50% of AM Law 200' },
  { id: 'ts', name: 'Thomas Scientific', short: 'TS', color: 'var(--co-ts)', hex: '#2ecc8f', sector: 'Lab supply distribution', hq: 'Swedesboro, NJ', lat: 39.7476, lon: -75.3105, entry: '2022-01', footprint: 'National · 27k scored lab/hospital sites' },
  { id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--co-bpi)', hex: '#e05c8a', sector: 'Communications · public affairs', hq: 'Washington, DC', lat: 38.9072, lon: -77.0369, entry: '2023-04', footprint: 'DC · NYC · SF · Chicago · Europe' },
  { id: 'fh', name: 'Fair Harbor', short: 'FH', color: 'var(--co-fh)', hex: '#3fd0e0', sector: 'Consumer · sustainable apparel', hq: 'New York, NY', lat: 40.7128, lon: -74.0060, entry: '2022-03', footprint: 'DTC + wholesale' },
];

const CO_HEX = { cet: '#4c8dff', pp: '#f08a3c', fl: '#9d7bff', ts: '#2ecc8f', bpi: '#e05c8a', fh: '#3fd0e0', ma: '#f5b73d', pe: '#c9a0ff', fin: '#8bd3ff', bsp: '#d9622b', sh: '#8a94a6' };
/* system accent per dataset owner: the six companies read their own --co-* token (data-co), everything portfolio-wide reads
   the brand, Smith + Howard (exited, not a current company) reads the neutral mute */
const CO_IDS = new Set(['cet', 'pp', 'fl', 'ts', 'bpi', 'fh']);
const CO_VAR = id => CO_IDS.has(id) ? `var(--co-${id})` : id === 'sh' ? 'var(--sys-mute-2)' : 'var(--sys-brand)';
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** data-co attribute for a company id (system.css derives --co, --co-ink, --co-soft); others pass their token inline. */
const coAttr = id => CO_IDS.has(id) ? `data-co="${id}"` : `data-co="" style="--co:${CO_VAR(id)}"`;
/** Company chip: .sys-chip--soft in the company accent (the short name or a label). */
const coChip = (id, t, title) => `<span class="sys-chip sys-chip--soft" ${coAttr(id)}${title ? ` title="${h(title)}"` : ''}>${h(t)}</span>`;
/** Status chip: .sys-chip--good | --warn | --bad | --info, or neutral. */
const stChip = (t, st) => `<span class="sys-chip${st ? ` sys-chip--${st}` : ''}">${h(t)}</span>`;
/* names spelled out in leads and KPI subs; the short codes stay on table chips only */
const LONG = { cet: 'CET', pp: 'Punctual Pros', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor', sh: 'Smith + Howard' };
/** "1 add-on under BSP + 1 reported, unnamed" — named add-ons counted apart from ones BSP reports without a name */
const addCount = adds => { const named = adds.filter(a => !a.unid).length, unid = adds.length - named; return `${named} ${unid ? 'named ' : ''}add-on${named === 1 ? '' : 's'} under BSP${unid ? ` + ${unid} reported, unnamed` : ''}`; };
const CO_SHORT = { cet: 'CET', pp: 'PP', fl: 'FL', ts: 'TS', bpi: 'BPI', fh: 'FH', ma: 'M&A', pe: 'PE', fin: 'FIN', bsp: 'BSP', sh: 'S+H' };
/* bsp_firm.timeline company names → company colour */
const tlColor = c => { const s = String(c || ''); return CO_VAR(/Commonwealth|CET|NuWave|Horton/i.test(s) ? 'cet' : /Punctual|Horvath/i.test(s) ? 'pp' : /Frontline/i.test(s) ? 'fl' : /Thomas/i.test(s) ? 'ts' : /Bully|BPI/i.test(s) ? 'bpi' : /Fair Harbor/i.test(s) ? 'fh' : /Smith/i.test(s) ? 'sh' : 'bsp'); };
const mdy = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : (s || null); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = s => { if (!s) return null; const v = mdy(String(s)); const d = new Date(/^\d{4}$/.test(v) ? `${v}-07-01` : /^\d{4}-\d{2}$/.test(v) ? `${v}-15` : v); return isNaN(d) ? null : d; };
const monYr = s => { const d = toDate(s); return d ? `${MON[d.getMonth()]} ${d.getFullYear()}` : '—'; };
const yrsBetween = (a, b = new Date()) => { const x = toDate(a), y = b instanceof Date ? b : toDate(b); return x && y ? (y - x) / (365.25 * 864e5) : null; };
const dot = c => `<span class="sys-dot" role="img" aria-label="${c || 'unrated'} confidence" title="${c || 'unrated'} confidence" style="--co:${c === 'high' ? 'var(--sys-good)' : c === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)'};margin-left:6px;vertical-align:1px"></span>`;
/* Research-note phrasing that must never reach a reader (bsp_firm timeline/history). */
const cleanEvent = s => String(s || '').replace(/\s+-\s+likely source of .*$/i, '');

/* ── Add-ons under BSP, from bsp_firm.items[].add_ons (pre-BSP acquisitions excluded) ── */
const firmItem = (firm, id) => (firm?.items || []).find(i => i.id === `bsp-${id}`);
const addOnsOf = (firm, id) => (firmItem(firm, id)?.add_ons || []).map(a => { const unid = /^Unidentified/i.test(a.name || ''); return { name: unid ? '1 reported, unnamed (per BSP’s site)' : a.name, year: a.date ? String(a.date).slice(0, 4) : null, date: a.date, hq: a.hq, note: a.note, src: a.source_url, unid }; });


/* ── NWS alert relevance. Only alerts touching portfolio operating counties count (statewide feeds are noise).
   PP: the 15 territory counties from Punctual Pros demand model nws_zone rows (UGC + SAME FIPS, same matcher as #/pp/weather).
   CET: node + Tier-1/2 counties — Worcester, Bristol (Taunton), Plymouth (NuWave, Norwell), Middlesex, Norfolk, Essex MA; Hartford County / Capitol region CT (Horton, Canton). ── */
const PP_TERR_FALLBACK = [['Lancaster', 'PA', '42071'], ['York', 'PA', '42133'], ['Dauphin', 'PA', '42043'], ['Cumberland', 'PA', '42041'], ['Berks', 'PA', '42011'], ['Lebanon', 'PA', '42075'], ['Franklin', 'PA', '42055'], ['Adams', 'PA', '42001'], ['Perry', 'PA', '42099'], ['Chester', 'PA', '42029'], ['Montgomery', 'PA', '42091'], ['Ocean', 'NJ', '34029'], ['Monmouth', 'NJ', '34025'], ['Atlantic', 'NJ', '34001'], ['Burlington', 'NJ', '34005']];
const CET_TERR = [['Worcester', 'MA', '25027'], ['Bristol', 'MA', '25005'], ['Plymouth', 'MA', '25023'], ['Middlesex', 'MA', '25017'], ['Norfolk', 'MA', '25021'], ['Essex', 'MA', '25009'], ['Hartford', 'CT', '09003'], ['Capitol', 'CT', '09110']];
function alertMatcher(ppModel) {
  const zones = (ppModel?.items || []).filter(i => i.component === 'nws_zone');
  const terr = [...(zones.length ? zones.map(z => ({ co: 'pp', county: z.county, state: z.state, fips: z.county_fips, ugcs: z.all_ugcs || [] })) : PP_TERR_FALLBACK.map(([county, state, fips]) => ({ co: 'pp', county, state, fips, ugcs: [] }))),
    ...CET_TERR.map(([county, state, fips]) => ({ co: 'cet', county, state, fips, ugcs: [] }))];
  const byUgc = new Map(), byFips = new Map();
  for (const t of terr) { for (const u of t.ugcs) byUgc.set(u, t); byFips.set('0' + t.fips, t); }
  return a => {
    const hit = new Map();
    for (const u of a.zones || []) if (byUgc.has(u)) { const t = byUgc.get(u); hit.set(`${t.co}|${t.county}`, t); }
    for (const f of a.fips || []) if (byFips.has(f)) { const t = byFips.get(f); hit.set(`${t.co}|${t.county}`, t); }
    if (!hit.size && !(a.fips || []).length) { const ad = String(a.areaDesc || '').toLowerCase(); for (const t of terr) if (t.state === a.state && new RegExp(`\\b${t.county.toLowerCase()}\\b`).test(ad)) hit.set(`${t.co}|${t.county}`, t); }
    return [...hit.values()];
  };
}

/* ── Home by level (OS spec 5). One screen, three homes, chosen by the role in view ("Viewing as", assets/session.js):
   the firm home for the firm levels, the company home for company leadership (and the fund home for investor relations),
   the role home for office and field. It redraws when the role changes. Sources and method text carry data-src and
   data-method: the shell moves them into its Sources and Method drawers. ── */
const injectCss = () => { if (!document.getElementById('css-home')) { const l = document.createElement('link'); l.id = 'css-home'; l.rel = 'stylesheet'; l.href = 'modules/home.css?v=20261123143257'; document.head.appendChild(l); } };
const APPROVALS_KEY = 'bsp-os-approvals';   // drafts the agent made that wait for the person's OK (assets/agent.js writes it)
const AGENT = '#/home/agent';                // never with a question in the address (OS spec 9.4)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** {month:-1} in the catalogue becomes last month's short name (the agent page fills it the same way). */
const fill = t => String(t ?? '').replace(/\{month:(-?\d+)\}/g, (_, n) => MONTHS[((new Date().getMonth() + Number(n)) % 12 + 12) % 12]);
const FUND_ONLY = new Set(['bsp-investor-relations']);   // firm team, but the fund and documents only (OS spec 3)
const homeKind = r => FUND_ONLY.has(r.id) ? 'company' : r.level === 'firm_leadership' || r.level === 'firm_team' ? 'firm' : r.level === 'co_leadership' ? 'company' : 'role';

/** Drafts waiting for this role's OK, newest first. */
function waiting(role) {
  try { const v = JSON.parse(localStorage.getItem(APPROVALS_KEY) || '[]'); return (Array.isArray(v) ? v : []).filter(x => x && x.role === role.id && (!x.status || x.status === 'draft')).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))); } catch { return []; }
}
const itemChip = (t, esc) => `<span class="sys-chip ${/urgent|late|past due/i.test(t) ? 'sys-chip--warn' : 'sys-chip--info'}">${esc(t)}</span>`;
function todayHTML(role, esc, max = 6) {
  const h = role.home || {}, list = Array.isArray(h.list) ? h.list : [];
  const rows = list.map((x, i) => `<li${i >= max ? ' class="hm-hide"' : ''}><a class="hm-item" href="${AGENT}"><span class="hm-time sys-num">${esc(fill(x.time))}</span><span class="hm-main"><b>${esc(fill(x.title))}</b><span>${esc(fill(x.where))}</span></span>${x.chip ? itemChip(x.chip, esc) : ''}</a></li>`).join('');
  return `<section class="sys-card hm-card" aria-labelledby="hm-today-h"><h2 class="sys-h3" id="hm-today-h">${esc(fill(h.list_title || 'Today'))}</h2>${list.length
    ? `<ul class="hm-list" id="hm-today">${rows}</ul>${list.length > max ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm hm-show" data-hm="all">All ${list.length}</button>` : ''}`
    : '<p class="hm-empty">Nothing today.</p>'}</section>`;
}
function waitingHTML(role, esc) {
  const xs = waiting(role);
  return `<section class="sys-card hm-card" aria-labelledby="hm-wait-h" id="hm-wait"><h2 class="sys-h3" id="hm-wait-h">Waiting for approval${xs.length ? ` <span class="sys-chip sys-chip--warn">${xs.length}</span>` : ''}</h2>${xs.length
    ? `<ul class="hm-list">${xs.slice(0, 5).map(x => `<li><a class="hm-item" href="${AGENT}"><span class="hm-time">${esc(x.app || 'Draft')}</span><span class="hm-main"><b>${esc(x.title || 'Draft')}</b></span><span class="sys-chip">Not sent</span></a></li>`).join('')}</ul>`
    : '<p class="hm-empty">Nothing waiting.</p>'}</section>`;
}
const askHTML = (role, esc) => `<a class="hm-ask" href="${AGENT}"><span>${esc(role.placeholder || 'Ask the agent')}</span><span class="sys-btn sys-btn--primary sys-btn--sm">Ask the agent</span></a>`;
const kpi = (esc, t) => ({ label: fill(t.label), value: `${esc(fill(t.value))}${t.modeled ? '<span class="sys-est">est.</span>' : ''}`, sub: esc(fill(t.sub)) });
const headHTML = (esc, title, lead, org) => `<header class="hm-head">${org ? `<p class="sys-card-label hm-org">${esc(org)}</p>` : ''}<h1 class="sys-h1">${esc(title)}</h1>${lead ? `<p class="sys-lead">${esc(lead)}</p>` : ''}</header>`;
function wire(el) {
  el.querySelectorAll('[data-hm="all"]').forEach(b => { b.onclick = () => { b.previousElementSibling?.classList.add('is-all'); b.hidden = true; }; });
}

/* What moves each company's value, in ten words or fewer. The full sentence is the next action fin.js prints for both
   value tables; it opens in the side panel. */
const MOVES = {
  cet: r => 'Integrate Horton and NuWave; next tuck-in',
  pp: r => 'Next tuck-in, from undrawn debt',
  fl: r => 'First add-on under BSP',
  ts: r => `Refinance or sell before ${r.matLabel || 'Dec 2027'}`,
  bpi: r => `One reporting line for ${r.addOns ?? 6} add-ons`,
  fh: r => 'Exit path: sponsor or strategic sale',
};
/** The status chip: the exit-window flag fin.js sets, cut to its first words ("Build", "In exit window", "Refinancing due in 13 mo"). */
const status = r => String(r.flag?.t || '').replace(/\s*\(.*\)$/, '').replace(/:.*$/, '').replace(/^Refinancing due in/, 'Refinance in');
/** The dollar figure an estimate gives for `kind` ('revenue' picks the revenue half of "$65–100M revenue; $6–11M EBITDA"). */
function dollars(e, kind) {
  if (!e) return '';
  const parts = String(e.estimate || '').split(/;\s+/), part = (kind && parts.find(p => new RegExp(kind, 'i').test(p))) || parts[0];
  const m = part.match(/~?\$\s*[\d.,]+(?:\s*[–-]\s*\$?\s*[\d.,]+)?\s*[KMB]/i);
  return m ? m[0].replace(/\s+/g, '').replace(/-/g, '–') : '';
}

async function firmHome(ctx, role, live) {
  const { el, ui, fmt, data, maps, esc, app, inspector } = ctx;
  const [firm, sb] = await Promise.all([data.research('bsp_firm'), loadScoreboard(ctx).catch(e => { console.error(e); return null; })]);
  if (!live()) return;
  const rows = (sb?.rows || []).slice().sort((a, b) => a._k - b._k);
  const tpl = sb?.tpl || templateExit(firm);
  const inWindow = rows.filter(r => r.held != null && r.held >= 4);
  const today = role.home?.list || [];
  const lead = `${inWindow.length ? `${inWindow.map(r => r.short).join(' and ')} in the exit window` : 'No company in the exit window'} · ${today.length} on today's list`;

  const coRow = r => {
    const rev = dollars(r.rev, 'revenue'), ev = dollars(r.ev);
    return `<tr tabindex="0" data-id="${esc(r.id)}" aria-label="${esc(r.name)}: open the details">
      <td><span class="hm-co" ${coAttr(r.id)}><span class="sys-dot" aria-hidden="true"></span><b>${esc(LONG[r.id] || r.name)}</b></span></td>
      <td class="sys-n hm-cell" data-label="Held">${r.held != null ? `${r.held.toFixed(1)} yrs` : '—'}<span class="hm-sub"> · ${fmt.num(r.addOns || 0)} add-on${r.addOns === 1 ? '' : 's'}</span></td>
      <td class="sys-n hm-cell" data-label="Revenue">${rev ? `${esc(rev)}<span class="sys-est">est.</span>` : '—'}</td>
      <td class="sys-n hm-cell" data-label="Entry value">${ev ? `${esc(ev)}<span class="sys-est">est.</span>` : '—'}</td>
      <td class="hm-cell hm-wrap">${esc((MOVES[r.id] || (() => ''))(r))}</td>
      <td>${stChip(status(r), r.flag.st)}</td></tr>`;
  };
  el.innerHTML = `<div class="hm hm-firm">${headHTML(esc, 'Portfolio', lead)}
    <section class="hm-sec hm-cos" aria-labelledby="hm-cos-h"><h2 class="sys-sr" id="hm-cos-h">Six companies</h2>${rows.length ? `<div class="sys-table-wrap"><table class="sys-table">
      <thead><tr><th scope="col">Company</th><th scope="col" class="sys-n">Held</th><th scope="col" class="sys-n">Revenue</th><th scope="col" class="sys-n">Entry value</th><th scope="col">What moves it</th><th scope="col">Status</th></tr></thead>
      <tbody>${rows.map(coRow).join('')}</tbody></table></div>` : ui.note('The company table did not load.', 'warn')}
      <p class="sys-src hm-src" data-src>Company filings estimate tables (SEC Form D and ADV, BDC schedules, PPP loans, franchise disclosures) and the BSP firm profile, as of ${esc(firm?.meta?.generated || 'Sept 2026')}. <a href="#/fin/portfolio">Value and exit table</a></p>
      <p class="sys-src hm-src" data-method>Revenue is the current or pro forma estimate; entry value is the enterprise value at BSP's entry. Status: debt due within 24 months, refinance or sell; held 4 years or more, exit window; 3 or more, exit prep. Smith + Howard sold at ${esc(tpl.hold.toFixed(1))} years.</p>
    </section>
    <div class="hm-pair">${todayHTML(role, esc)}${waitingHTML(role, esc)}</div>
    <div class="hm-more">
      <section class="hm-sec" aria-labelledby="hm-fig-h"><h2 class="sys-h3" id="hm-fig-h">Figures</h2><div id="hm-figs">${ui.loading()}</div></section>
      <section class="hm-sec" aria-labelledby="hm-sig-h"><h2 class="sys-h3" id="hm-sig-h">This week</h2><div id="hm-signals">${ui.loading()}</div></section>
      <section class="hm-sec" aria-labelledby="hm-map-h"><h2 class="sys-h3" id="hm-map-h">Footprint</h2><div class="hm-map" id="home-map"></div>
        <p class="sys-src hm-src" data-src>Company filings and press; National Weather Service alerts for operating counties, live.</p></section>
    </div></div>`;
  wire(el);

  // a row opens the side panel: the full next action, the add-ons under BSP and the estimates behind the figures
  const openRow = r => {
    const adds = addOnsOf(firm, r.id), est = r.estShown || [];
    inspector.open({ title: esc(r.name), sub: `Held since ${esc(monYr(r.entry))} · ${r.held != null ? r.held.toFixed(1) : '—'} yrs · ${esc(r.flag.t)}`, color: CO_VAR(r.id), sections: [
      { label: 'Next action', html: `<div class="small">${esc(r.action)}</div>${r.detail ? `<div class="small dim mt-8">${esc(r.detail)}</div>` : ''}` },
      { label: 'Add-ons under BSP', html: adds.length ? ui.timeline(adds.map(a => ({ date: a.year || 'n/d', color: CO_VAR(r.id), html: `${esc(a.name)}${a.hq ? ` <span class="dim">· ${esc(a.hq)}</span>` : ''}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener">↗</a>` : ''}` }))) : '<div class="small dim">None announced under BSP</div>' },
      est.length ? { label: `Estimates · ${est.length}`, html: `<div class="col gap-8">${est.map(e => `<div><div class="small"><b>${esc(e.metric)}</b>${dot(e.confidence)}</div><div class="small">${esc(e.estimate)}</div>${e.basis ? `<div class="small dim">${esc(e.basis)}</div>` : ''}</div>`).join('')}</div>` } : null,
      !r.d ? { label: 'Estimates', html: ui.note(`<b>${esc(dataset(r.co.ds))}</b> is not available yet`, 'warn') } : null,
    ].filter(Boolean), actions: [{ label: 'Value and exit table', href: '#/fin/portfolio' }, { label: `Open ${esc(r.short)}`, href: `#/${r.id}` }] });
  };
  el.querySelectorAll('.hm-cos tbody tr').forEach(tr => {
    const r = rows.find(x => x.id === tr.dataset.id);
    tr.onclick = () => r && openRow(r);
    tr.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); openRow(r); } };
  });

  // below the first screen: figures, this week's signals and the footprint map
  const [rfps, zips, maCet, maPp, maFlTs, pe, cetOpp, ppModel, alertsPA, alertsNJ, alertsMA, alertsCT, fredSnap] = await Promise.all([
    data.load('cet_ne_rfps').catch(() => []), data.load('pp_zips').catch(() => []),
    data.research('ma_targets_cet'), data.research('ma_targets_pp'), data.research('ma_targets_fl_ts'), data.research('pe_landscape'), data.research('cet_opportunities'),
    data.research('pp_demand_model'),
    ctx.live.nwsAlerts('PA').catch(() => []), ctx.live.nwsAlerts('NJ').catch(() => []), ctx.live.nwsAlerts('MA').catch(() => []), ctx.live.nwsAlerts('CT').catch(() => []),
    Promise.resolve(ctx.live.snapshot ? ctx.live.snapshot('fred_signals') : null).catch(() => null),
  ]);
  if (!live()) return;
  const opps = cetOpp?.items || [];
  const due = [...opps.filter(o => o.stage !== 'awarded').map(o => ({ ...o })), ...rfps.map(r => ({ title: String(r.title || '').replace(/\s+/g, ' '), owner_or_agency: r.agency, state: r.state, due_date: mdy(r.due_date) }))]
    .map(o => ({ ...o, _d: fmt.days(o.due_date) })).filter(o => o._d != null && o._d >= 0 && o._d <= 60).sort((a, b) => a._d - b._d);
  const nT = { cet: maCet?.items?.length || 0, pp: maPp?.items?.length || 0, flts: maFlTs?.items?.length || 0 };
  const seen = new Set(), allAlerts = [];
  for (const a of [...alertsPA, ...alertsNJ, ...alertsMA, ...alertsCT]) if (!seen.has(a.id)) { seen.add(a.id); allAlerts.push(a); }
  const match = alertMatcher(ppModel);
  const alerts = allAlerts.map(a => ({ ...a, hits: match(a) })).filter(a => a.hits.length);
  const sevAlerts = alerts.filter(a => /Extreme|Severe/.test(a.severity));
  const stats = firm?.firm?.stats || { platforms: 7, add_ons: 23, exits: 1 };
  const held = rows.filter(r => r.held != null);
  const avgHold = held.length ? held.reduce((s, r) => s + r.held, 0) / held.length : null;
  const heldAddons = held.reduce((s, r) => s + (r.addOns || 0), 0);
  el.querySelector('#hm-figs').innerHTML = ui.kpis([
    { label: 'Companies', value: fmt.num(rows.length || 6), sub: `${fmt.num(stats.exits)} exit, Aug 2026` },
    { label: 'Add-ons, held companies', value: held.length ? fmt.num(heldAddons) : '—', sub: `${fmt.num(stats.add_ons)} since launch` },
    { label: 'Average hold', value: avgHold != null ? `${avgHold.toFixed(1)} yrs` : '—', sub: `S+H sold at ${tpl.hold.toFixed(1)}`, color: inWindow.length ? 'var(--sys-warn)' : 'var(--sys-good)' },
    { label: 'CET opportunities', value: cetOpp ? fmt.num(opps.length) : '—', sub: `${fmt.num(due.length)} bids due, 60 days`, color: 'var(--co-cet)' },
    { label: 'Add-on targets', value: fmt.num(nT.cet + nT.pp + nT.flts), sub: `<a href="#/ma/pipeline">CET ${nT.cet} · PP ${nT.pp} · FL/TS ${nT.flts}</a>` },
    { label: 'PE sponsors profiled', value: pe ? fmt.num(pe.items.length) : '—', sub: pe ? `${fmt.num(pe.items.filter(f => f.threat_level === 'high').length)} high-threat` : '' },
  ]);

  // signals, all from real fields: bids due, the two market readings that moved most, alerts in operating counties, top add-ons, sponsor deals
  const sig = [];
  due.slice(0, 3).forEach(o => sig.push({ co: 'cet', t: `CET bid due ${fmt.dateShort(o.due_date)}`, s: `${o.owner_or_agency || ''}${o.state ? ` (${o.state})` : ''}: ${o.title || ''}`, h: '#/cet/opportunities' }));
  const READS = [['GASDESW', 'ts', 'Diesel', 'freight cost'], ['PCOPPUSDM', 'cet', 'Copper', 'material cost on bids'], ['APU000072511', 'pp', 'Heating oil', 'heat-pump leads'],
    ['MORTGAGE30US', 'pp', 'Mortgage rate', 'fewer new-mover leads'], ['CES2000000003', 'pp', 'Construction pay', 'technician pay'], ['UMCSENT', 'fh', 'Consumer sentiment', 'apparel demand']];
  const fredById = new Map((fredSnap?.items || []).map(x => [x.id, x]));
  const size = x => x.chg_kind === 'pts' ? Math.abs(x.chg) / 4 : Math.abs(x.chg);
  READS.map(([id, co, label, why]) => ({ x: fredById.get(id), co, label, why })).filter(m => m.x && m.x.chg != null).sort((a, b) => size(b.x) - size(a.x)).slice(0, 2)
    .forEach(m => { const d = m.x.chg_kind === 'pts' ? `${m.x.chg >= 0 ? '+' : '−'}${Math.abs(m.x.chg).toFixed(2)} pts` : `${m.x.chg >= 0 ? '+' : '−'}${Math.abs(m.x.chg * 100).toFixed(0)}%`; sig.push({ co: m.co, t: `${m.label} ${d} in a year`, s: `${CO_SHORT[m.co]}: ${m.why}`, h: `#/signals/overview?co=${m.co}` }); });
  (sevAlerts.length ? sevAlerts : alerts).slice(0, 2).forEach(a => { const cos = [...new Set(a.hits.map(x => x.co))]; sig.push({ st: /Extreme|Severe/.test(a.severity) ? 'bad' : 'warn', t: `${a.event} · ${cos.map(c => CO_SHORT[c]).join('+')}`, s: a.hits.map(x => `${x.county} ${x.state}`).join(', '), h: cos.includes('pp') ? '#/pp/weather' : '#/cet/overview' }); });
  if (!alerts.length) sig.push({ st: 'good', t: 'Weather clear', s: 'No alerts in operating counties', h: '#/pp/weather' });
  [['PP', 'pp', maPp?.meta?.ranked_top_10], ['CET', 'cet', maCet?.meta?.ranked_top_10], ['FL', 'fl', maFlTs?.meta?.frontline?.ranked_top_8], ['TS', 'ts', maFlTs?.meta?.thomas_scientific?.ranked_top_8]]
    .forEach(([lab, p, list]) => { const t = (list || [])[0]; if (t && t.company) sig.push({ co: p, t: `${lab} add-on #${t.rank ?? 1}`, s: `${t.company} · fit ${t.fit_score ?? '—'}`, h: `#/ma/pipeline?platform=${p}&q=${encodeURIComponent(String(t.company).split(/[,(/]/)[0].trim())}` }); });
  (pe?.items || []).flatMap(f => (f.deals_2025_2026 || []).map(d => ({ ...d, firm: f.firm }))).filter(d => d.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 2)
    .forEach(d => sig.push({ st: '', t: `PE deal ${fmt.dateShort(d.date)}`, s: `${d.firm} → ${d.company}`, h: '#/pe/deals' }));
  el.querySelector('#hm-signals').innerHTML = sig.length ? `<ul class="hm-signals">${sig.map(s => `<li><a class="sys-chip${s.co ? ' sys-chip--soft' : s.st ? ` sys-chip--${s.st}` : ''}" ${s.co ? coAttr(s.co) : ''} href="${esc(s.h)}">${esc(s.t)}</a><span title="${esc(s.s)}">${esc(s.s)}</span></li>`).join('')}</ul>
    <p class="sys-src hm-src" data-src>CET opportunity radar; FRED and US Treasury readings; National Weather Service alerts; add-on target lists; private-equity landscape, as of ${esc(cetOpp?.meta?.generated || 'Sept 2026')}.</p>` : ui.empty('No signals');

  // footprint map: headquarters, CET counties, Punctual Pros zips and alert areas
  app.index([...COS.map(c => ({ label: c.name, sub: c.sector, href: `#/${c.id}`, kind: 'Company', color: c.hex })), ...COS.flatMap(c => addOnsOf(firm, c.id).filter(a => !a.unid).map(a => ({ label: a.name, sub: `${c.short} add-on${a.year ? ` · ${a.year}` : ''}`, href: `#/${c.id}`, kind: 'Add-on', color: c.hex })))]);
  let map;
  try { map = maps.create(el.querySelector('#home-map'), { center: [40.3, -76.0], zoom: 6 }); }
  catch (e) { console.warn('home: the map did not load', e); el.querySelector('#home-map')?.closest('.hm-sec')?.remove(); return; }
  const css = getComputedStyle(document.documentElement), tok = (n, fb) => css.getPropertyValue(n).trim() || fb;
  const mix = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a; const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v * (1 - t) + B[i] * t).toString(16).padStart(2, '0')).join(''); };
  const MC = { cet: tok('--co-cet', CO_HEX.cet), pp: tok('--co-pp', CO_HEX.pp), bad: tok('--sys-bad', '#c62828'), warn: tok('--sys-warn', '#b45309'), mute: tok('--sys-mute-2', '#646b77'), surface: tok('--sys-surface', '#ffffff') };
  MC.cet2 = mix(MC.cet, MC.surface, .45);
  for (const c of COS) maps.marker(map, c.lat, c.lon, { color: tok(`--co-${c.id}`, c.hex), label: c.short, popup: `<b>${esc(c.name)}</b><br>${esc(c.hq)}<br><a href="#/${c.id}">Open</a>` });
  const cnt = await data.load('cet_ne_counties').catch(() => []);
  if (!live()) { map.remove(); return; }
  maps.points(map, cnt.filter(c => c.centroid_lat), { latKey: 'centroid_lat', lonKey: 'centroid_lng', color: r => r.cet_fit_tier === 'Tier 1' ? MC.cet : r.cet_fit_tier === 'Tier 2' ? MC.cet2 : MC.mute, radius: r => r.cet_fit_tier === 'Tier 1' ? 7 : 5, cluster: false, opacity: .55, popup: r => `<b>${esc(r.county_name)}, ${esc(r.state)}</b><br>CET fit ${esc(r.cet_fit_score)} · ${esc(r.cet_fit_tier)}` });
  maps.points(map, zips.filter(z => z.service_territory_flag === 1), { color: MC.pp, radius: 2.5, cluster: false, opacity: .5, weight: 0 });
  for (const a of alerts) if (a.geometry) L.geoJSON(a.geometry, { style: { color: /Extreme|Severe/.test(a.severity) ? MC.bad : MC.warn, weight: 1, fillOpacity: .12 } }).bindPopup(`<b>${esc(a.event)}</b><br>${esc(a.hits.map(h => `${h.county} ${h.state}`).join(', '))}`).addTo(map);
  maps.legend(map, [{ color: MC.pp, label: 'Punctual Pros zips' }, { color: MC.cet, label: 'CET Tier-1 counties' }, { color: MC.cet2, label: 'CET Tier-2 counties' }, { color: MC.warn, label: 'Weather alert' }, { color: MC.bad, label: 'Severe weather alert' }], 'Layers');
  return () => map.remove();
}

/* Company leadership (and investor relations, for the fund): four figures, today, waiting for approval, its screens. */
async function companyHome(ctx, role, live) {
  const { el, ui, fmt, esc, app } = ctx;
  const co = role.co, org = (Session.orgs() || []).find(o => o.id === role.org);
  const sb = co ? await loadScoreboard(ctx).catch(() => null) : null;
  if (!live()) return;
  const row = sb?.rows?.find(r => r.id === co);
  const tiles = (role.home?.kpis || []).slice(0, 3).map(t => kpi(esc, t));
  if (row) tiles.push(({ label: 'Held by BSP', value: row.held != null ? `${row.held.toFixed(1)} yrs` : '—', sub: `${fmt.num(row.addOns || 0)} add-on${row.addOns === 1 ? '' : 's'} · ${esc(status(row))}` }));
  // its screens: the company's own tabs (drawn from the open registry, so a screen added later shows here too), then its slice of the firm screens
  const m = co && app.modules.find(x => x.id === co);
  const links = [
    ...(m ? m.views.filter(v => v.menu !== false).map(v => [`#/${co}/${v.id}`, v.id === 'overview' ? m.name : v.name]) : []),
    ...(co ? [[`#/ma/pipeline?platform=${co}`, 'Add-on targets'], [`#/signals/overview?co=${co}`, 'Local signals']] : [['#/fin/portfolio', 'Fundamentals']]),
    ['#/connect/overview', 'Connections'], [AGENT, 'Agent'],
  ];
  el.innerHTML = `<div class="hm hm-co-home"${co ? ` data-co="${esc(co)}"` : ''}>${headHTML(esc, co ? (org?.name || LONG[co] || co) : 'Fund', fill(role.home?.lead), `${role.title}${co ? '' : ' · BSP'}`)}
    ${tiles.length ? ui.kpis(tiles) : ''}
    <div class="hm-pair">${todayHTML(role, esc)}${waitingHTML(role, esc)}</div>
    <nav class="hm-sec" aria-labelledby="hm-links-h"><h2 class="sys-h3" id="hm-links-h">Screens</h2><div class="hm-links">${links.map(([h, t]) => `<a class="sys-btn sys-btn--secondary sys-btn--sm" href="${esc(h)}">${esc(t)}</a>`).join('')}</div></nav>
    <p class="sys-src hm-src" data-method>Figures marked est. are sandbox examples modeled from the public estimates; hold and add-ons are from public filings.</p>
  </div>`;
  wire(el);
}

/* Office and field: today's items first, then the agent's question box (a link into the agent screen), then the role's figures. */
async function roleHome(ctx, role) {
  const { el, ui, esc } = ctx;
  const org = (Session.orgs() || []).find(o => o.id === role.org);
  const field = role.level === 'co_field';
  const tiles = (role.home?.kpis || []).map(t => kpi(esc, t));
  el.innerHTML = `<div class="hm hm-role${field ? ' hm-field' : ''}"${role.co ? ` data-co="${esc(role.co)}"` : ''}>${headHTML(esc, role.title, fill(role.home?.lead), org ? `${org.name} · ${role.dept}` : role.dept)}
    ${todayHTML(role, esc, field ? 4 : 6)}
    ${askHTML(role, esc)}
    ${tiles.length ? ui.kpis(tiles) : ''}
    <p class="sys-src hm-src" data-method>Sandbox records: fictional people and modeled numbers.</p>
  </div>`;
  wire(el);
}

async function overview(ctx) {
  injectCss();
  await Session.ready();
  let alive = true, gen = 0, undo = null;
  const draw = async () => {
    const my = ++gen, live = () => alive && my === gen && ctx.el.isConnected;
    if (undo) { try { undo(); } catch { /* already gone */ } undo = null; }
    ctx.inspector.close();
    const role = Session.role(), kind = homeKind(role);
    ctx.el.dataset.home = kind;
    const un = await (kind === 'firm' ? firmHome : kind === 'company' ? companyHome : roleHome)(ctx, role, live);
    if (live()) undo = typeof un === 'function' ? un : null; else if (typeof un === 'function') un();
  };
  const stop = Session.onChange((r, what) => { if (alive && what === 'role') draw(); });
  // a draft approved or made on the agent screen (same browser) changes the "Waiting for approval" list
  const onStore = e => { if (alive && e.key === APPROVALS_KEY) { const w = ctx.el.querySelector('#hm-wait'); if (w) w.outerHTML = waitingHTML(Session.role(), ctx.esc); } };
  addEventListener('storage', onStore);
  await draw();
  return () => { alive = false; stop(); removeEventListener('storage', onStore); delete ctx.el.dataset.home; if (undo) { try { undo(); } catch { /* gone */ } } };
}

/* The agent inside the shell: agent.html in its embedded form, following the role in view. */
function agentView(ctx) {
  injectCss();
  return embedView(ctx, 'agent.html', { title: 'Agent' });
}

async function firmView(ctx) {
  const { el, ui, fmt, data, esc, inspector, app } = ctx;
  // the next action per company is the sentence the value and exit tables print (fin.js); the profile still draws if that load fails
  const [firm, sb] = await Promise.all([data.research('bsp_firm'), loadScoreboard(ctx).catch(() => null)]);
  if (!el.isConnected) return;
  if (!firm) { el.innerHTML = ui.pageHead({ title: 'Firm profile' }) + ui.note('Research dataset not yet available: <b>BSP firm profile</b>', 'warn'); return; }
  const f = firm.firm || {};
  const stats = f.stats || { platforms: 7, add_ons: 23, exits: 1, current_holdings: 6 };
  const cap = f.capital_raised_sec_form_d || null;
  const fund = cap?.broad_sky_partners_lp_total_sold_usd || null;
  const spvs = (cap?.deal_vehicles || []).filter(v => /^BSP-/.test(v.vehicle || ''));
  const spvSum = spvs.reduce((s, v) => s + (v.sold_usd || 0), 0);
  const flSpv = spvs.find(v => v.vehicle === 'BSP-FL LP'), flCo = spvs.find(v => v.vehicle === 'BSP-FL Co-Invest, LLC');
  const sh = templateExit(firm);
  const prg = f.prg && typeof f.prg === 'object' ? f.prg : (typeof f.prg === 'string' ? { description: f.prg, members: [] } : null);
  // History: research notes are rewritten as reader-facing facts (the unverified '$137M Fund I' entry is the Frontline deal vehicle)
  const hist = (Array.isArray(f.history) ? f.history : []).map(h => /^Task brief/i.test(h.event || '')
    ? { ...h, verified: true, event: `Frontline deal vehicle BSP-FL LP files Form D: ${flSpv ? fmt.money(flSpv.sold_usd) : '$137M'} sold${flCo ? `, plus ${fmt.money(flCo.sold_usd)} through BSP-FL Co-Invest` : ''}. This is deal-level capital, not a fund close; the main fund (Fund I) reports ${fund ? fmt.money(fund) : '$335M'} sold.` }
    : { ...h, event: cleanEvent(h.event) });
  const yr = s => String(s || '').slice(0, 4);

  el.innerHTML = ui.pageHead({
    title: 'Firm profile',
    sub: `Fund I is ${fund ? fmt.money(fund) : '—'} from ${cap?.investors ?? '—'} investors. ${spvs.length} single-deal vehicles add ${fmt.money(spvSum)} of co-investment, so investors back larger checks. ${fmt.num(stats.current_holdings ?? 6)} companies today, ${fmt.num(stats.platforms)} since launch. ${fmt.num(stats.add_ons)} add-ons, one exit.`,
    chips: `${fmt.chip(`Relaunched ${f.relaunched ? monYr(f.relaunched) : 'Jun 2021'}`, 'var(--sys-brand)')}${fund ? fmt.chip(`Fund I ${fmt.money(fund)}`) : ''}${spvSum ? fmt.chip(`Deal vehicles ${fmt.money(spvSum)}`) : ''}${fmt.chip(`${stats.current_holdings ?? 6} held · ${stats.platforms} since launch · ${stats.add_ons} add-ons`)}${fmt.chip(`Exit: S+H, Aug 2026`)}`,
    actions: `<a class="${ui.btnCls('secondary', '')}" href="#/fin/portfolio">Portfolio financial picture</a><a class="${ui.btnCls('secondary', '')}" href="#/home/overview">Exit readiness</a>`,
  }) +
  ui.kpis([
    { label: 'Fund I sold (Form D)', value: fund ? fmt.money(fund) : '—', sub: `${cap?.investors ?? '—'} investors · ${cap?.as_of ? esc(monYr(cap.as_of)) : ''}` },
    { label: 'Deal-vehicle capital', value: spvSum ? fmt.money(spvSum) : '—', sub: `${spvs.length} vehicles · not additive to Fund I` },
    { label: 'Companies', value: fmt.num(stats.platforms), sub: `${fmt.num(stats.current_holdings ?? 6)} held · ${fmt.num(stats.exits)} exited` },
    { label: 'Add-ons', value: fmt.num(stats.add_ons), sub: sh ? `${sh.addons} at S+H · ${stats.add_ons - sh.addons} in current holdings` : '' },
    { label: 'Investment team', value: fmt.num((f.team || []).length), sub: `${fmt.num(prg?.members?.length || 0)} in the Portfolio Resource Group` },
  ]) +
  `<div class="mt-12">${ui.panel({ title: 'Companies', sub: 'Every BSP portfolio company including the exit · click a row for thesis, add-ons and sources', body: '<div id="pf-tbl"></div>', flush: true, foot: ui.source('BSP firm profile: current holdings and timeline (Smith + Howard)', 'https://broadskypartners.com/', firm.meta?.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'History', sub: 'Founding, Carlyle years, relaunch, fund formation and first exit', scroll: true, body: hist.length ? ui.timeline(hist.map(h => ({ date: h.date, color: h.verified === false ? 'var(--sys-warn)' : 'var(--sys-brand)', html: `${esc(h.event)}${h.verified === false ? ` ${stChip('unverified', 'warn')}` : ''}${h.source_url ? ` <a class="dim" href="${esc(h.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}` }))) : ui.note('Firm history pending in BSP firm profile', 'warn'), foot: ui.source('BSP team pages, press releases, SEC EDGAR', 'https://broadskypartners.com/team/', f.retrieved) })}
    ${ui.panel({ title: 'Team & Portfolio Resource Group', scroll: true, body: `${(f.team || []).length ? `<div class="col gap-8">${f.team.map(t => `<div><div class="row"><span class="strong">${esc(t.name)}</span><span class="muted small">${esc(t.title || '')}</span>${t.source_url ? `<a class="dim small" href="${esc(t.source_url)}" target="_blank" rel="noopener" aria-label="Bio">↗</a>` : ''}</div>${t.prior ? `<div class="small dim">${esc(t.prior)}</div>` : ''}</div>`).join('')}</div>` : ui.note('Team list pending', 'warn')}
      ${prg ? `<h4 class="sys-card-label mt-16">Portfolio Resource Group</h4><div class="small text-2">${esc(prg.description || '')}</div><div class="col gap-8 mt-8">${(prg.members || []).map(m => `<div><div class="row"><span class="strong">${esc(m.name)}</span><span class="muted small">${esc(m.title || '')}</span>${m.source_url ? `<a class="dim small" href="${esc(m.source_url)}" target="_blank" rel="noopener" aria-label="Bio">↗</a>` : ''}</div>${m.prior ? `<div class="small dim">${esc(m.prior)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${(f.executive_board || []).length ? `<h4 class="sys-card-label mt-16">Executive Board · ${f.executive_board.length}</h4><div class="sys-chips mt-8">${f.executive_board.map(b => `<span class="sys-chip" title="${esc(b.prior || '')}">${esc(b.name)}</span>`).join('')}</div>` : ''}`, foot: ui.source('broadskypartners.com/team and /strategy', prg?.source_url || 'https://broadskypartners.com/team/', f.retrieved) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'BSP timeline', sub: 'Anchor acquisitions, add-ons and exits · newest first', body: '<div id="tl"></div>', scroll: true, foot: ui.source('Press releases & BSP site', 'https://broadskypartners.com/news/', firm.meta?.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Capital raised (SEC Form D)', sub: 'Main fund plus deal-by-deal vehicles · amounts sold per latest filing', body: '<div id="cap-tbl"></div>', flush: true, foot: ui.source('SEC EDGAR Form D', cap?.source_url || 'https://www.sec.gov/', cap?.as_of) })}
    ${ui.panel({ title: 'Strategy & sources', body: `${f.strategy ? `<div class="small text-2">${esc(f.strategy)}</div>${(f.sectors || []).length ? `<div class="sys-chips mt-8">${f.sectors.map(x => fmt.chip(x)).join('')}</div>` : ''}<h4 class="sys-card-label mt-16">Sources</h4>` : ''}<div class="col gap-4 small">${(f.sources || []).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(srcLabel(s))}</a>`).join('') || '—'}</div>` })}
  </div>`;

  // timeline — bsp_firm.timeline, newest first, coloured by company
  const tl = (firm.timeline || []).filter(t => t.date).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  el.querySelector('#tl').innerHTML = tl.length ? ui.timeline(tl.slice(0, 40).map(t => ({ date: t.date, color: tlColor(t.company), html: `${t.company ? `<b>${esc(t.company)}</b> · ` : ''}${esc(cleanEvent(t.event))}${t.source_url ? ` <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}` }))) : ui.note('The BSP timeline is not available yet.', 'warn');

  // companies table — current holdings from items[], Smith + Howard from the timeline
  const rows = (firm.items || []).map(p => { const id = String(p.id || '').replace(/^bsp-/, ''); const co = COS.find(c => c.id === id); return { id, p, company: p.company, sector: p.sector, entry: p.entry_date, hold: Math.round((yrsBetween(p.entry_date) || 0) * 10) / 10, status: p.status || 'held', addons: (p.add_ons || []).length, names: addOnsOf(firm, id).map(a => `${a.name}${a.year ? ` (${a.year})` : ''}`).join('; '), hex: CO_VAR(id) }; });
  if (sh) rows.push({ id: 'sh', company: sh.company, sector: 'Professional services - Accounting, tax & advisory (Atlanta)', entry: sh.entry, exit: sh.exit, hold: Math.round(sh.hold * 10) / 10, status: 'exited', addons: sh.addons, names: `${sh.named.map(t => cleanEvent(t.event).replace(/^Smith \+ Howard\s+(acquires|merges with|signs agreement to acquire)\s+/i, '').replace(/^(.*?) joins Smith \+ Howard.*$/i, '$1')).join('; ')} (+${Math.max(0, sh.addons - sh.named.length)} unidentified)`, hex: CO_VAR('sh'), sh });
  ui.table(el.querySelector('#pf-tbl'), { rows, pageSize: 10, sortKey: 'entry', sortDir: 1, exportName: 'bsp_companies', onRow: r => openPlatform(r), columns: [
    { key: 'company', label: 'Company', wrap: true, fmt: (v, r) => `<div class="row strong"><span class="sys-dot" ${coAttr(r.id)} aria-hidden="true"></span>${esc(v)}</div><div class="small dim">${esc(r.sector || '')}</div>` },
    { key: 'entry', label: 'Entry', num: true, fmt: (v, r) => `${esc(monYr(v))}${r.exit ? `<div class="small dim">exit ${esc(monYr(r.exit))}</div>` : ''}` },
    { key: 'hold', label: 'Hold (yrs)', num: true, fmt: v => v == null ? '—' : v.toFixed(1) },
    { key: 'status', label: 'Status', fmt: v => v === 'exited' ? stChip('Exited', '') : stChip('Held', 'good') },
    { key: 'addons', label: 'Add-ons', num: true, fmt: v => `<b>${fmt.num(v)}</b>` },
    { key: 'names', label: 'Add-ons named', wrap: true, fmt: v => `<span class="small text-2">${esc(v || '—')}</span>` },
  ] });
  const nextAction = id => sb?.rows.find(x => x.id === id)?.action || '';
  const openPlatform = r => {
    if (r.sh) return inspector.open({ title: 'Smith + Howard', sub: 'Exited Aug 2026 · TPG Growth', color: CO_VAR('sh'), sections: [
      { label: 'Outcome', html: ui.kv({ Entry: esc(monYr(r.entry)), Exit: esc(monYr(r.exit)), Hold: `${r.hold.toFixed(1)} yrs`, 'Add-ons': `${r.addons}`, Result: esc(r.sh.note) }) },
      { label: 'Timeline', html: ui.timeline(r.sh.named.map(t => ({ date: t.date, color: CO_VAR('sh'), html: `${esc(cleanEvent(t.event))} <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` }))) },
    ], actions: [{ label: 'BSP sale release ↗', href: r.sh.src }] });
    const p = r.p;
    inspector.open({ title: esc(p.company), sub: `${esc(p.sector || '')}`, color: r.hex, sections: [
      { label: 'At a glance', html: ui.kv({ HQ: esc([p.hq_city, p.state].filter(Boolean).join(', ')), Entry: esc(monYr(p.entry_date)), Hold: `${r.hold.toFixed(1)} yrs`, Seller: esc(p.entry_source || ''), CEO: esc(p.ceo || ''), Employees: esc(p.employees_est || '') }) },
      p.thesis ? { label: 'Thesis', html: `<div class="small text-2">${esc(p.thesis)}</div>` } : null,
      { label: `Add-ons under BSP · ${r.addons}`, html: r.addons ? ui.timeline(addOnsOf(firm, r.id).map(a => ({ date: a.year || 'n/d', color: r.hex, html: `${esc(a.name)}${a.hq ? ` <span class="dim">· ${esc(a.hq)}</span>` : ''}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener">↗</a>` : ''}` }))) : '<div class="small dim">None announced under BSP</div>' },
      (p.sources || []).length ? { label: 'Sources', html: `<div class="col gap-4 small">${p.sources.slice(0, 6).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener" class="ellipsis">${esc(srcLabel(s))}</a>`).join('')}</div>` } : null,
      nextAction(r.id) ? { label: 'Next action', html: `<div class="small">${esc(nextAction(r.id))}</div>` } : null,
    ].filter(Boolean), actions: [{ label: 'Open company', href: `#/${r.id}` }] });
  };
  // capital table
  const capRows = [...(fund ? [{ id: 'fund', vehicle: 'Broad Sky Partners, LP (Fund I)', company: 'Commingled fund', sold: fund, date: cap.as_of, url: cap.source_url, note: `${cap.investors} investors` }] : []),
    ...(cap?.deal_vehicles || []).map((v, i) => ({ id: `v${i}`, vehicle: v.vehicle, company: v.company, sold: v.sold_usd, date: v.first_sale || v.filed, url: v.source_url, note: v.note || (v.offering_usd ? `of ${fmt.money(v.offering_usd)} offered` : '') }))];
  ui.table(el.querySelector('#cap-tbl'), { rows: capRows, pageSize: 10, sortKey: 'sold', exportName: 'bsp_form_d_vehicles', onRow: r => r.url && window.open(r.url, '_blank', 'noopener'), columns: [
    { key: 'vehicle', label: 'Vehicle', wrap: true, fmt: (v, r) => `<span class="small strong">${esc(v)}</span><div class="small dim">${esc(r.company)}</div>` },
    { key: 'sold', label: 'Sold', num: true, fmt: v => fmt.money(v) },
    { key: 'date', label: 'First sale / filed', num: true, fmt: v => `<span class="small">${fmt.date(v)}</span>` },
    { key: 'note', label: 'Note', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 90))}</span>` },
  ] });
  app.index((f.team || []).map(t => ({ label: t.name, sub: `BSP · ${t.title || ''}`, href: '#/home/firm', kind: 'Person', color: CO_HEX.bsp })));
}

export default {
  id: 'home', name: 'Home', tag: 'BSP', color: 'var(--sys-brand)', group: 'Command',
  tagline: 'Today, by role',
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'firm', name: 'BSP profile', icon: '◈', render: firmView },
    { id: 'agent', name: 'Agent', icon: '◍', flush: true, render: agentView },
  ],
  tour: [
    { order: 100, hash: '#/home/overview', caption: '<b>Broad Sky OS.</b> Six companies. Every number is tied to a decision.', narration: 'This is Broad Sky OS. Six companies, and every number is tied to a decision.', duration: 7000 },
    { order: 105, hash: '#/home/overview', caption: '<b>Six companies.</b> Hold, revenue, entry value, what moves it and status, one row each.', narration: 'One row per company: hold, revenue, entry value, what moves it and its status.', duration: 9000 },
    { order: 110, hash: '#/home/overview', caption: '<b>Today.</b> The day\'s items and the drafts waiting for approval.', narration: 'Today\'s items, and the drafts waiting for approval.', duration: 9000 },
    { order: 120, hash: '#/home/firm', caption: '<b>BSP.</b> A $335M Fund I, six companies today, 23 add-ons, one exit: Smith + Howard, sold August 2026.', narration: 'The firm: a three hundred thirty-five million dollar fund, six companies today, twenty-three add-ons, one exit.', duration: 7000 },
  ],
};
