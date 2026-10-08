/* CET concept site: interactions and data-powered sections.
   Data comes from the portal's verified datasets via core.js (Data.research).
   The page frame (top bar, concept notice, breadcrumb, footer) comes from assets/frame.js. */
import { humanizeText } from '../../assets/frame.js?v=20261008145402';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const STATES = { MA: 'Massachusetts', CT: 'Connecticut', RI: 'Rhode Island', NH: 'New Hampshire', ME: 'Maine', VT: 'Vermont' };
export const BOUNDS = { MA: [[41.2, -73.5], [42.9, -69.9]], CT: [[40.95, -73.75], [42.05, -71.78]], RI: [[41.1, -71.9], [42.02, -71.1]], NH: [[42.7, -72.56], [45.3, -70.6]], ME: [[43.0, -71.1], [47.46, -66.9]], VT: [[42.73, -73.44], [45.02, -71.46]] };
export const NE = [[40.95, -73.75], [47.46, -66.9]];
export const OFFICES = [
  { name: 'Worcester, MA', k: 'HQ', lat: 42.2626, lon: -71.8023, note: 'Headquarters · 125 Blackstone River Rd' },
  { name: 'Taunton, MA', k: 'CET', lat: 41.9145, lon: -71.0710, note: '125 John Hancock Rd, Unit 4' },
  { name: 'Norwell, MA', k: 'NuWave', lat: 42.1615, lon: -70.7928, note: 'NuWave Energy Solutions' },
  { name: 'Canton, CT', k: 'Horton', lat: 41.8240, lon: -72.8937, note: 'Horton Electrical Services' },
];
/* map marker colours match the --cet-* category colours in site.css */
export const CAP_COLOR = c => { const m = c.capability_match || []; if (m.includes('wastewater') || m.includes('pump_station')) return '#0891b2'; if (m.includes('ev_charging')) return '#15803d'; if (m.includes('solar') || m.includes('storage')) return '#d97706'; if (m.includes('energy_efficiency')) return '#6a5cff'; return '#4c8dff'; };
export const daysTo = s => { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); };
export const isOpen = o => o.stage !== 'awarded' && (o.due_date ? daysTo(o.due_date) >= 0 : (o.stage === 'open' || o.stage === 'recurring'));
export const money = v => v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${v}`;
export const shortDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); if (!m) return '—'; return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
export const dueLabel = d => d == null ? 'Rolling' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d > 0 ? `${d} days` : `Closed ${-d} days ago`;
export const EST = '<span class="sys-est">est.</span>';
export const ILLUS = '<span class="sys-est sys-est--illus">illustrative</span>';
/** Plain-English copy for dataset text: dataset ids and snake_case become readable names. */
export const plain = s => humanizeText(String(s ?? ''));
export const TILE = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16 };

/* ── Chat content ─────────────────────────────────────────────────────────── */
export const FAQ = [
  { q: 'Which states do you work in?', a: '<p>All six New England states — <b>Massachusetts, Connecticut, Rhode Island, New Hampshire, Maine and Vermont</b> — and we hold electrical licenses in each. Crews work out of <b>Worcester, Taunton and Norwell, MA</b> and <b>Canton, CT</b>.</p>', href: '#footprint' },
  { q: 'Do you take projects in New York City or outside New England?', a: '<p>No. CET is focused on New England, where we are licensed in all six states and can staff work from our four offices. If your site is outside the region we are happy to refer you.</p>', href: '#footprint' },
  { q: 'What does Horton Electrical Services do within CET?', a: '<p><b>Horton Electrical Services</b> (Canton, CT; founded 1976) joined CET in September 2026. Horton leads our municipal water work: <b>wastewater-treatment and pump-station electrical</b>, instrumentation and SCADA, generators, solar installation and O&amp;M, civil site work and <b>24/7 emergency response</b>.</p>', href: '#markets' },
  { q: 'What is NuWave Energy Solutions?', a: '<p><b>NuWave Energy Solutions</b> (Norwell, MA) joined CET in October 2025. NuWave is our energy-efficiency design-build team: LED and controls retrofits, HVAC and process-load optimization, utility-incentive applications (such as <b>Mass Save</b>) and measurement &amp; verification.</p>', href: '#capabilities' },
  { q: 'Can you upgrade a wastewater plant or pump station electrical system?', a: '<p>Yes, it is Horton’s core work: MCCs, switchgear, VFDs, generators, transfer switches and SCADA, phased so the plant keeps treating. We often work on <b>Clean Water SRF</b>-financed projects.</p>', href: '#markets' },
  { q: 'Do you offer 24/7 emergency generator and pump-station service?', a: '<p>Yes. Our <b>24/7 emergency desk</b> dispatches licensed crews from Canton CT, Worcester and Taunton for generator failures, transfer-switch problems, switchgear faults and pump-station alarms. Customers on a <b>CET Assure</b> contract get priority dispatch and monitored alarms.</p>', href: '#contact' },
  { q: 'How do you price work?', a: '<ul><li><b>Design-build:</b> fixed price after a site walk and preliminary design.</li><li><b>Bid-build:</b> lump-sum bids on public and GC packages.</li><li><b>Service:</b> time-and-materials or an annual <b>CET Assure</b> contract.</li><li><b>Efficiency:</b> priced net of utility incentives, with savings verified.</li></ul>', href: '#contact' },
  { q: 'Which incentive and funding programs can you help with?', a: '<p>We map each project to the program that pays for it: <b>SMART 3.0</b> and <b>CT NRES</b> (solar), <b>Mass Save</b> (efficiency), <b>MassEVIP</b> and <b>NEVI</b> (EV charging), resilience grants and state <b>Clean Water SRF</b> programs.</p>', href: '#funding' },
  { q: 'Do you install and operate EV chargers?', a: '<p>Yes. We install Level 2 and DC fast chargers for fleets, transit depots, campuses and municipalities (including on-street charging), handle make-ready and utility coordination, and can operate the network afterwards with uptime reporting through GridOS.</p>', href: '#capabilities' },
  { q: 'Will you maintain a solar array you did not build?', a: '<p>Yes. We take over O&amp;M on existing PV and storage systems: inspection, inverter service, monitoring and truck rolls when production drops. Most owners move it onto a <b>CET Assure</b> contract with a monthly availability report.</p>', href: '#capabilities' },
  { q: 'What is CET Assure?', a: '<p><b>CET Assure</b> is one annual contract covering inspection, preventive maintenance, monitoring and 24/7 response for pump stations, generators, switchgear, solar and EV chargers — one point of contact, one invoice and one uptime report.</p>', href: '#contact' },
  { q: 'What is GridOS?', a: '<p><b>GridOS</b> is the operating layer behind CET: a bid board for every public opportunity in New England, estimating and field coordination, solar fleet and pump-station monitoring, EV network operations and NuWave M&amp;V dashboards. <a href="gridos.html">See GridOS →</a></p>', href: 'gridos.html' },
  { q: 'Are you hiring electricians and apprentices?', a: '<p>Yes — journeyman electricians, apprentices, SCADA/instrumentation technicians, solar O&amp;M technicians, estimators and energy engineers across Worcester, Taunton, Norwell and Canton CT. We pay for apprenticeship training and support licensing in more than one state.</p>', href: '#careers' },
  { q: 'How quickly do you respond to a bid or quote request?', a: '<p>Quote requests get a response within one business day. Send plans and specs for public bids as early as possible — we prefer to be on the plan-holder list so we can walk the site before bid day.</p>', href: '#contact' },
  { q: 'Is CET acquiring other contractors?', a: '<p>Yes. NuWave (2025) and Horton (2026) joined and kept their names and teams. If you own an electrical, solar or efficiency business in New England, start a confidential conversation.</p>', href: '#acquisitions' },
];
export const SUGGESTIONS = ['Do you offer 24/7 emergency generator and pump-station service?', 'Which programs can fund our project?', 'What is CET Assure?', 'What is GridOS?', 'Are you hiring electricians?'];

/* customer-facing program copy; dates, states and sources come from the dataset */
const PROGRAM_COPY = [
  [/Energy Resilience/i, 'CT DEEP Energy Resilience Construction Grants', 'Grant', 'Funds microgrids and outage-prevention builds at critical facilities. We design solar + storage + generator microgrids for WPCAs, shelters and town halls.'],
  [/Leading by Example/i, 'MA DOER Leading by Example — Fleet EVSE 4.0', 'Grant', 'Rolling grants for state agencies and campuses to install fleet charging. We deliver make-ready, chargers, commissioning and networking turnkey.'],
  [/NRES/i, 'CT NRES — Non-Residential Renewable Energy Solutions', 'Tariff', 'Connecticut’s 200 kW–5 MW commercial solar program. The August window has closed; we are building 2027 submissions with owners now.'],
  [/Energy Recovery/i, 'MassDEP Wastewater Energy Recovery Pilot Grants', 'Grant', 'Rolling grants for energy recovery at treatment plants. Horton and NuWave help plants apply — then design and build the electrical scope.'],
  [/SMART 3\.0/i, 'Massachusetts SMART 3.0', 'Incentive', 'The state solar incentive, with adders for landfill, brownfield and public-entity sites. We size projects to the open capacity blocks.'],
  [/MassEVIP/i, 'MassEVIP Workplace & Fleet Charging', 'Incentive', 'Covers up to 60% of eligible charger costs, up to $50K per address. We build it into every Massachusetts workplace and fleet proposal.'],
  [/NEVI/i, 'Rhode Island NEVI Phase 2A', 'Federal', 'Community fast charging: an initial $10M for roughly 20 locations and 110+ ports. Awardees need NEVI-compliant installers.'],
  [/83E/i, 'MA Section 83E Round II — Energy Storage', 'Procurement', 'A 1,000 MW storage procurement with a distribution-connected carve-out. Selected projects will need balance-of-plant electrical.'],
  [/GRANITE/i, 'NH GRANITE Grid Resilience', 'Grant', '$3M for grid-hardening and microgrid builds. We team with New Hampshire municipalities, co-ops and utilities.'],
];

/* ── Shell interactions ───────────────────────────────────────────────────── */
function tabs() {
  const list = $('.cet-mk-list'); if (!list) return;
  const tabsEls = $$('[role=tab]', list);
  const select = t => { tabsEls.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; }); };
  tabsEls.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => { const k = e.key; let j = null; if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % tabsEls.length; if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i - 1 + tabsEls.length) % tabsEls.length; if (k === 'Home') j = 0; if (k === 'End') j = tabsEls.length - 1; if (j != null) { e.preventDefault(); select(tabsEls[j]); tabsEls[j].focus(); } });
  });
  $$('[data-market]').forEach(a => a.addEventListener('click', () => { const t = document.getElementById('t-' + a.dataset.market); if (t) select(t); }));
}
function faq() {
  const el = $('#faq-list'); if (!el) return;
  el.innerHTML = FAQ.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><div class="cet-faq-a">${f.a}</div></details>`).join('');
}
function form() {
  const f = $('#quote'); if (!f) return;
  const setType = v => { const r = f.querySelector(`input[name=type][value="${v}"]`); if (r) r.checked = true; };
  $$('[data-emergency]').forEach(a => a.addEventListener('click', () => setType('emergency')));
  $$('[data-type]').forEach(a => a.addEventListener('click', () => { const t = a.dataset.type; setType(t === 'engineer' ? 'electrical' : t); }));
  f.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    const chk = (id, test) => { const fld = $(id, f).closest('.cet-fld'); const good = test($(id, f).value.trim()); fld.classList.toggle('is-bad', !good); if (!good && ok) { $(id, f).focus(); ok = false; } };
    chk('#f-name', v => v.length > 1); chk('#f-email', v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)); chk('#f-state', v => !!v);
    if (!ok) return;
    const type = f.querySelector('input[name=type]:checked')?.value || 'electrical', st = $('#f-state', f).value, fund = $('#f-fund', f).value;
    const desk = st === 'other' ? null
      : type === 'emergency' ? ['24/7 emergency desk', 'The on-call supervisor is paged immediately and calls you back within 15 minutes (concept target).']
      : type === 'water' ? ['Horton water desk · Canton, CT', 'A wastewater estimator reviews the drawings and coordinates with your engineer of record.']
      : type === 'efficiency' ? ['NuWave · Norwell, MA', 'An energy engineer scopes the retrofit and prepares the incentive application.']
      : type === 'assure' ? ['CET Assure service team', 'We inventory your assets and return a fixed annual price with response-time commitments.']
      : type === 'careers' ? ['Talent team', 'A recruiter from the nearest office follows up about open roles and apprenticeships.']
      : type === 'acq' ? ['Office of the CEO · confidential', 'A member of the leadership team reaches out personally. Nothing is shared outside CET and BSP.']
      : st === 'CT' ? ['Canton, CT estimating', 'A Connecticut estimator responds within one business day.']
      : st === 'RI' ? ['Taunton, MA estimating', 'Our South Coast team covers Rhode Island and responds within one business day.']
      : ['Worcester, MA estimating', 'An estimator responds within one business day.'];
    const r = $('#route', f);
    r.innerHTML = desk ? `<b>Routed to: ${esc(desk[0])}</b><span>${esc(desk[1])}${/SRF|CWF/.test(fund) ? ' We will align the scope to the SRF project list and the funding schedule.' : /SMART|NRES|Mass Save|NEVI|Grant/.test(fund) ? ` We will confirm ${esc(fund)} eligibility before pricing.` : ''}</span><span class="sys-src">Concept form: nothing was sent.</span>`
      : `<b>Thanks. We focus on New England.</b><span>CET works only in MA, CT, RI, NH, ME and VT. We are happy to refer you to a trusted contractor in your region.</span>`;
    r.hidden = false;
  });
}

/* ── Design rationale (design references dataset) ─────────────────────────── */
/* Principle-only: the reference company, owner and link are never shown. */
const PRINCIPLE = { 'ref-cet-shermco': ['Scale and founders', 'Show licensed scale and invite founders in'], 'ref-cet-sciens': ['Recurring revenue', 'Package service as a named program'], 'ref-cet-ameresco': ['Public work', 'Solve funding first, then let buyers self-select'] };
/** Strip any mention of the reference company or its owner from dataset prose. */
const unbrand = (r, t) => {
  const parts = String(r.name || '').split(/[()]/).map(n => n.trim()).filter(Boolean);
  const names = [...new Set([...parts, ...parts.map(n => n.split(/\s+/)[0]).filter(n => n.length >= 4)])].sort((a, b) => b.length - a.length);
  let s = String(t ?? '').replace(/\bBorrowed authority\b/g, 'Third-party authority');
  for (const n of names) { const rx = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s = s.replace(new RegExp(`\\s*\\([^)]*\\b${rx}\\b[^)]*\\)`, 'g'), '').replace(new RegExp(`\\b${rx}(?:'s)?\\b`, 'g'), 'the reference'); }
  return s;
};
const ANCHORS = { 'ref-cet-shermco': [['#acquisitions', 'Acquisitions'], ['#stats', 'Stat band'], ['#emergency', '24/7 band'], ['#markets', 'Markets']], 'ref-cet-sciens': [['#assure', 'CET Assure'], ['#safety', 'Equipment list'], ['#footprint', 'Footprint map'], ['#projects', 'Project stories']], 'ref-cet-ameresco': [['#funding', 'Funding'], ['#pillars', 'Two ways in'], ['#top', 'Hero CTAs'], ['#assure', 'Live bid board']] };
async function refs(Data) {
  const el = $('#refs'); if (!el) return;
  const d = await Data.research('design_refs');
  const items = (d?.items || []).filter(i => String(i.applies_to).includes('cet'));
  if (!items.length) { el.innerHTML = '<p class="sys-src">The design references are not available right now.</p>'; return; }
  el.innerHTML = items.map(r => { const p = PRINCIPLE[r.id] || ['Principle', plain(unbrand(r, r.elements_to_borrow?.[0]?.element || ''))]; return `<article class="sys-card cet-ref"><span class="sys-card-label">${esc(p[0])}</span><h3 class="sys-card-title">${esc(p[1])}</h3><ul>${(r.elements_to_borrow || []).map((e, i) => `<li><b>${esc(plain(unbrand(r, e.element)))}</b>${ANCHORS[r.id]?.[i] ? `<br><a class="cet-jump" href="${ANCHORS[r.id][i][0]}">See it: ${esc(ANCHORS[r.id][i][1])} ↓</a>` : ''}</li>`).join('')}</ul><span class="sys-card-foot"><span class="sys-src">Reviewed ${esc(longDate(r.retrieved))}</span></span></article>`; }).join('');
}
export const clip = (s, n = 60) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 12)).replace(/[\s(,;:–-]+$/, '') + '…'; };
export const cleanSrc = s => String(s || '').replace(/\s*\((web search result|search result)[^)]*\)/gi, '').replace(/\s*\(retrieved[^)]*\)/gi, '').trim();
/** Source names as a reader sees them: no raw API names or dataset ids. */
export const srcName = s => plain(cleanSrc(s).replace(/\bUSAspending\.gov API\s*\(?spending_by_award\)?/i, 'USAspending.gov award search').replace(/\bspending_by_award\b/g, 'award search'));
export const STAGE = { open: 'Open bid', planned: 'Planned', recurring: 'Recurring program', awarded: 'Awarded' };
export const ownerOf = o => /locked|verify|unknown/i.test(o.owner_or_agency || '') ? (o.city ? `${o.city}, ${o.state}` : STATES[o.state] || o.state) : (o.owner_or_agency || '');
const Fmtr = { host: u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } } };
/** '2026-09-24' → 'Sept 24, 2026' (missing → '—'). */
export const longDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); if (!m) return /^\d{4}-\d{2}$/.test(s || '') ? monthYear(s) : s ? String(s) : '—'; const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+m[2] - 1]; return `${mo} ${+m[3]}, ${m[1]}`; };
/** '2026-09-24' → 'Sept 2026'. */
export const monthYear = s => { const m = /^(\d{4})-(\d{2})/.exec(s || ''); if (!m) return s ? String(s) : '—'; return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}`; };

/* ── Opportunity-driven sections ──────────────────────────────────────────── */
function radarCard(items) {
  const c = $('#radar-card'); if (!c) return;
  const open = items.filter(o => o.stage === 'open' && isOpen(o));
  const next = items.filter(o => o.due_date && daysTo(o.due_date) >= 0 && o.stage !== 'awarded').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  $('[data-k=open]', c).textContent = open.length;
  const nst = new Set(open.map(o => o.state)).size; const st = $('[data-k=states]', c); if (st) st.textContent = `open bids · ${nst} state${nst === 1 ? '' : 's'}`;
  $('[data-k=next]', c).innerHTML = next ? `<span class="cet-due">Next due · ${esc(dueLabel(daysTo(next.due_date)))}</span><br><b>${esc(next.title.length > 74 ? next.title.slice(0, 72) + '…' : next.title)}</b>, ${esc(ownerOf(next))}${/, [A-Z]{2}$/.test(ownerOf(next)) ? '' : ', ' + esc(next.state)}` : 'No public bids due this week.';
}
function mini(items) {
  const m = $('#mini'); if (!m) return;
  const up = items.filter(o => o.due_date && daysTo(o.due_date) >= 0 && o.stage !== 'awarded' && o.type !== 'program').sort((a, b) => a.due_date.localeCompare(b.due_date));
  $('[data-k=open]', m).textContent = items.filter(o => o.stage === 'open' && isOpen(o)).length;
  $('[data-k=soon]', m).textContent = up.filter(o => daysTo(o.due_date) <= 14).length;
  $('[data-k=pipe]', m).textContent = money(items.filter(o => o.stage !== 'awarded').reduce((s, o) => s + (o.est_value_usd || 0), 0));
  $('[data-k=rows]', m).innerHTML = up.slice(0, 5).map(o => { const d = daysTo(o.due_date); return `<tr><td class="sys-num cet-due">${esc(dueLabel(d))}</td><td class="cet-t" title="${esc(o.title)}">${esc(o.title)}</td><td class="sys-num">${esc(o.state)}</td><td class="sys-n cet-hide-s"><span class="cet-fit"><i style="width:${o.fit_score || 0}%"></i></span>${o.fit_score ?? '—'}</td></tr>`; }).join('') || '<tr><td colspan="4">No bids due in the next weeks.</td></tr>';
}
let MAP = null, LAYER = null, SEL = null, ITEMS = [];
function statesList(items) {
  const el = $('#states'); if (!el) return;
  el.innerHTML = Object.keys(STATES).map(st => { const s = items.filter(o => o.state === st); const open = s.filter(isOpen).length; return `<button class="cet-st" type="button" data-st="${st}" aria-pressed="false"><span class="cet-st-ab">${st}</span><span><span class="cet-st-nm">${STATES[st]}</span><span class="cet-st-lic">✓ Licensed</span></span><span class="cet-st-ct"><b>${open}</b><span>of ${s.length} tracked</span></span></button>`; }).join('');
  $$('.cet-st', el).forEach(b => b.addEventListener('click', () => selectState(SEL === b.dataset.st ? null : b.dataset.st)));
  detail(null);
}
function detail(st) {
  const el = $('#st-detail'); if (!el) return;
  const pool = ITEMS.filter(o => (!st || o.state === st) && o.stage !== 'awarded');
  const due = pool.filter(o => o.due_date && daysTo(o.due_date) >= 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const list = due.length ? due.slice(0, 4) : pool.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)).slice(0, 4);
  el.innerHTML = `<p class="sys-card-label">${due.length ? 'Next deadlines' : 'Funded pipeline'}${st ? ' · ' + esc(STATES[st]) : ''}</p><ul>${list.map(o => `<li><b>${esc(o.title.length > 80 ? o.title.slice(0, 78) + '…' : o.title)}</b><span>${esc(o.city ? o.city + ', ' + o.state : ownerOf(o))} · ${o.due_date ? esc(shortDate(o.due_date)) + ' · ' + esc(dueLabel(daysTo(o.due_date))) : esc(STAGE[o.stage] || o.stage)}${o.est_value_usd ? ' · ' + money(o.est_value_usd) + EST : ''}</span></li>`).join('') || '<li><span>Nothing open right now.</span></li>'}</ul>`;
}
function selectState(st) {
  SEL = st;
  $$('#states .cet-st').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.st === st)));
  const f = $('#map-filter'); if (f) f.innerHTML = st ? `<b>${esc(STATES[st])}</b> · ${ITEMS.filter(o => o.state === st && isOpen(o)).length} open` : 'All states';
  detail(st);
  if (MAP) { drawPoints(); MAP.flyToBounds(st ? BOUNDS[st] : NE, { padding: [20, 20], duration: .6 }); }
}
function drawPoints() {
  const L = window.L; if (!L || !MAP) return;
  if (LAYER) LAYER.remove();
  LAYER = L.layerGroup().addTo(MAP);
  for (const o of ITEMS) {
    if (o.lat == null || o.lon == null || o.stage === 'awarded') continue;
    if (SEL && o.state !== SEL) continue;
    const c = CAP_COLOR(o), live = isOpen(o);
    const m = L.circleMarker([o.lat, o.lon], { radius: 4 + Math.round((o.fit_score || 50) / 20), color: c, weight: live ? 1.5 : 1.2, fillColor: c, fillOpacity: live ? .55 : .12, opacity: live ? .95 : .6 });
    m.bindPopup(`<b>${esc(o.title)}</b><div class="cet-pm">${esc(ownerOf(o))} · ${esc(o.city || '')}${o.city ? ', ' : ''}${esc(o.state)}</div><div class="cet-pm">${o.due_date ? 'Due ' + esc(shortDate(o.due_date)) + ' · ' + esc(dueLabel(daysTo(o.due_date))) : esc(STAGE[o.stage] || o.stage)}${o.est_value_usd ? ' · ' + money(o.est_value_usd) + EST : ''}</div>${o.source_url ? `<a href="${esc(o.source_url)}" target="_blank" rel="noopener">Source: ${esc(clip(srcName(o.source_name), 60))} ↗</a>` : ''}`, { maxWidth: 300 });
    LAYER.addLayer(m);
  }
}
function initMap() {
  const L = window.L, el = $('#ne-map'); if (!L || !el || MAP) return;
  MAP = L.map(el, { zoomSnap: .25, scrollWheelZoom: false, attributionControl: true, zoomControl: true });
  L.tileLayer(TILE.url, { attribution: TILE.attr, maxZoom: TILE.maxZoom, maxNativeZoom: TILE.maxZoom }).addTo(MAP);
  L.tileLayer(TILE.ref, { maxZoom: TILE.maxZoom, maxNativeZoom: TILE.maxZoom, pane: 'shadowPane', opacity: .9 }).addTo(MAP);
  MAP.fitBounds(NE, { padding: [8, 8] });
  for (const o of OFFICES) {
    const icon = L.divIcon({ className: '', html: `<div class="cet-ofc"></div><div class="cet-ofc-lbl">${esc(o.name)}</div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    L.marker([o.lat, o.lon], { icon, zIndexOffset: 1000, keyboard: true, title: `${o.name}: ${o.note}` }).addTo(MAP).bindPopup(`<b>${esc(o.k === 'HQ' ? 'CET headquarters' : o.k === 'CET' ? 'CET' : o.k)}</b><div class="cet-pm">${esc(o.name)} · ${esc(o.note)}</div>`);
  }
  drawPoints();
  setTimeout(() => MAP.invalidateSize(), 200);
}
function lazyMap() {
  const el = $('#ne-map'); if (!el) return;
  const go = () => { if (window.L) initMap(); else window.addEventListener('load', initMap, { once: true }); };
  if (!('IntersectionObserver' in window)) return go();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '400px' });
  io.observe(el);
}
function programs(items) {
  const el = $('#progs'); if (!el) return;
  const progs = items.filter(o => o.type === 'program').map(o => { const c = PROGRAM_COPY.find(p => p[0].test(o.title)); const d = daysTo(o.due_date); return { st: o.state, kind: c?.[2] || 'Program', title: c?.[1] || o.title, body: c?.[3] || '', d, due: o.due_date, url: o.source_url, src: o.source_name }; });
  progs.push({ st: 'MA', kind: 'Utility incentive', title: 'Mass Save — commercial & industrial', body: 'Prescriptive and custom incentives for LED, controls, HVAC and process upgrades. NuWave prepares the application and proves the savings.', d: null, url: 'https://www.masssave.com/business', src: 'masssave.com' });
  const srf = (rx, st, title) => { const s = items.filter(o => rx.test(o.source_name || '')); return { st, kind: 'Revolving fund', title, body: `${s.length} wastewater and pump-station projects worth ${money(s.reduce((a, o) => a + (o.est_value_usd || 0), 0))}${EST} (applicant estimates) on current lists; we price the electrical scope with your engineer.`, html: true, d: null, rolling: 'Priority list', url: s[0]?.source_url, src: s[0]?.source_name, value: s.reduce((a, o) => a + (o.est_value_usd || 0), 0) }; };
  const ct = srf(/CT DEEP Clean Water Fund/i, 'CT', 'Connecticut Clean Water Fund'); const nne = srf(/Maine DEP CWSRF|VT CWSRF|VT DEC/i, 'ME · VT', 'Maine & Vermont Clean Water SRF');
  progs.push(ct, nne);
  const rank = p => p.d != null && p.d >= 0 ? p.d : p.d == null ? 500 : 1000 - p.d;
  progs.sort((a, b) => rank(a) - rank(b));
  el.innerHTML = progs.map(p => { const when = p.d == null ? (p.rolling || 'Rolling') : p.d >= 0 ? `Due ${shortDate(p.due)}` : 'Next round'; const soon = p.d != null && p.d >= 0 && p.d <= 30; return `<article class="sys-card cet-prog" data-co="cet"><div class="cet-prog-top"><span class="cet-prog-st">${esc(p.st)}</span><span class="sys-card-label">${esc(p.kind)}</span><span class="cet-prog-when${soon ? ' is-soon' : ''}">${esc(when)}</span></div><h3 class="sys-card-title">${esc(p.title)}</h3><p class="sys-card-body">${p.html ? p.body : esc(p.body)}</p>${p.url ? `<span class="sys-card-foot"><a href="${esc(p.url)}" target="_blank" rel="noopener">Source: ${esc(clip(srcName(p.src || Fmtr.host(p.url)), 62))} ↗</a></span>` : ''}</article>`; }).join('');
  if (progs.length > 6) { el.classList.add('is-collapsed'); const more = document.createElement('button'); more.type = 'button'; more.className = 'sys-btn sys-btn--secondary cet-more'; more.textContent = `Show all ${progs.length} programs`; more.addEventListener('click', () => { el.classList.remove('is-collapsed'); more.remove(); }); el.after(more); }
  const fs = $('#fund-strip');
  if (fs) { $('[data-k=srf]', fs).textContent = money(ct.value + nne.value); $('[data-k=progs]', fs).textContent = progs.length - 2; const nx = progs.find(p => p.d != null && p.d >= 0); $('[data-k=nextd]', fs).textContent = nx ? shortDate(nx.due) : 'Rolling'; if (nx) $('[data-k=nextl]', fs).textContent = nx.title.split(' — ')[0]; }
}

export async function init({ Data }) {
  tabs(); faq(); form();
  refs(Data).catch(e => console.warn('refs', e));
  Data.research('cet_wwtp_targets').then(d => { const el = $('[data-k=ww-f]'); if (d && el) { el.textContent = d.items.filter(i => i.project_class && i.project_class !== 'none').length; $('[data-k=ww-n]').textContent = d.items.length; } }).catch(() => {});
  const d = await Data.research('cet_opportunities');
  if (!d) { ['#radar-card [data-k=next]'].forEach(s => { const e = $(s); if (e) e.textContent = 'The bid radar is not available right now.'; }); return; }
  ITEMS = d.items || [];
  radarCard(ITEMS); mini(ITEMS); statesList(ITEMS); programs(ITEMS); lazyMap();
  const src = $('#fp-src'); if (src && d.meta?.generated) src.innerHTML = `<b>Source:</b> CET opportunity radar, ${ITEMS.length} public opportunities from the CT DEEP Clean Water Fund, Maine DEP and Vermont Clean Water SRF lists, BidNet Direct, owner portals and federal awards, compiled ${esc(longDate(d.meta.generated))}. Dot size shows fit score; filled dots are open now, outlined dots are funded pipeline.`;
}

/* ── Chat intents grounded on the same datasets (passed to Chat.mount) ───── */
const NEAREST = { MA: 'Worcester, Taunton and Norwell', CT: 'Canton, CT (Horton)', RI: 'Taunton, MA (South Coast team)', NH: 'Worcester, MA', ME: 'Worcester, MA', VT: 'Worcester, MA and Canton, CT' };
const NAME2ST = { connecticut: 'CT', massachusetts: 'MA', 'rhode island': 'RI', 'new hampshire': 'NH', maine: 'ME', vermont: 'VT' };
export function makeIntents(Data, base = '') {
  const opps = async () => (await Data.research('cet_opportunities'))?.items || [];
  const lnk = (h, t) => `<a class="ch-link" href="${esc(h)}">${esc(t)} →</a>`;
  const KW = [[/\bassure\b/i, 'What is CET Assure?'], [/grid ?os/i, 'What is GridOS?'], [/\bhorton\b(?!.*(call|target|first))/i, 'What does Horton Electrical Services do within CET?'], [/nuwave/i, 'What is NuWave Energy Solutions?'], [/hiring|career|apprentic|\bjobs?\b/i, 'Are you hiring electricians and apprentices?'], [/pric(e|ing)|how much|\bcost/i, 'How do you price work?'], [/acquir|selling my|sell (my|our)|partnership/i, 'Is CET acquiring other contractors?'], [/24\/7|emergenc/i, 'Do you offer 24/7 emergency generator and pump-station service?']];
  const faqIntent = { id: 'cet-faq', rx: KW.map(k => k[0]), run: async q => { const k = KW.find(x => x[0].test(q)); const f = k && FAQ.find(x => x.q === k[1]); return f ? { html: f.a, links: f.href ? [lnk(f.href.startsWith('#') ? base + f.href : f.href, 'Read more')] : [] } : null; } };
  return [
    faqIntent,
    { id: 'cet-nyc', rx: [/new york|\bnyc\b|manhattan|brooklyn/i], run: async () => ({ html: '<p>No — CET works only in New England (MA, CT, RI, NH, ME, VT), where we hold licenses in all six states and staff every job from Worcester, Taunton, Norwell or Canton CT.</p>', links: [lnk(base + '#footprint', 'See our footprint')] }) },
    { id: 'cet-state', rx: [/(work|serve|cover|licen[sc]ed|operate|available).*\b(CT|MA|RI|NH|ME|VT)\b/, /(work|serve|cover|licen[sc]ed|operate|available).*(connecticut|massachusetts|rhode island|new hampshire|maine|vermont)/i], run: async q => {
      const m = q.match(/\b(CT|MA|RI|NH|ME|VT)\b/) || []; const nm = Object.keys(NAME2ST).find(k => q.toLowerCase().includes(k)); const st = m[1] || NAME2ST[nm]; if (!st) return null;
      const items = (await opps()).filter(o => o.state === st); const open = items.filter(isOpen);
      const next = open.filter(o => o.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3);
      return { html: `<p><b>Yes — CET is licensed in ${esc(STATES[st])}.</b> Crews for ${esc(st)} work are staffed from ${esc(NEAREST[st])}.</p><p>We are tracking <b>${open.length}</b> open public opportunities in ${esc(STATES[st])} right now (${items.length} tracked in total).</p>${next.length ? `<ul>${next.map(o => `<li><b>${esc(o.title)}</b> — due ${esc(shortDate(o.due_date))}</li>`).join('')}</ul>` : ''}`, links: [lnk(base + '#contact', 'Request a quote'), lnk(base + '#footprint', 'Footprint map')] };
    } },
    { id: 'cet-bids', rx: [/(bids?|rfps?|opportunit|solicitation).*(due|open|closing|soon|next|this (week|month))/i, /what (are|is) (you|cet) bidding/i], run: async q => {
      const days = Number((q.match(/(\d+)\s*days?/) || [])[1]) || 30;
      const up = (await opps()).filter(o => o.due_date && o.stage !== 'awarded' && daysTo(o.due_date) >= 0 && daysTo(o.due_date) <= days).sort((a, b) => a.due_date.localeCompare(b.due_date));
      return { html: `<h4>Public bids due in the next ${days} days</h4>${up.length ? `<ul>${up.slice(0, 8).map(o => `<li><b>${esc(o.title)}</b> — ${esc(o.state)} · due ${esc(shortDate(o.due_date))} (${esc(dueLabel(daysTo(o.due_date)))})</li>`).join('')}</ul>` : '<p>Nothing due in that window.</p>'}<p>From the GridOS bid radar: public bid boards and state SRF lists across New England.</p>`, links: [lnk('gridos.html#demo', 'Open the GridOS bid board')] };
    } },
    { id: 'cet-ww', rx: [/(which|top|list|best).*(plants|wpcf|wwtp|treatment facilit)/i, /horton.*(call|target|first)/i], run: async () => {
      const d = await Data.research('cet_wwtp_targets'); if (!d) return null;
      const top = [...d.items].sort((a, b) => b.horton_fit - a.horton_fit).slice(0, 5);
      return { html: `<h4>Priority wastewater plants for Horton</h4><ol>${top.map(t => `<li><b>${esc(t.facility_name)}</b> (${esc(t.town)}, ${esc(t.state)}, ${t.design_flow_mgd ?? '—'} MGD): ${esc(t.recent_or_planned_project || 'no listed project')}${t.project_value_usd ? `, ${money(t.project_value_usd)} on the ${esc(t.funding_program)} list` : ''}</li>`).join('')}</ol><p>${d.items.length} plants in CT, MA and RI scored from EPA ECHO and state SRF lists.</p>`, links: [lnk('gridos.html#demo', 'Wastewater tracker in GridOS')] };
    } },
  ];
}

/** Shared page chrome for sibling pages (GridOS). The frame owns the header, banner and footer now. */
export function shell() { /* nothing page-level left to wire */ }
