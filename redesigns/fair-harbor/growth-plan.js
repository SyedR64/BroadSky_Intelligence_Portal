/* Fair Harbor — growth plan (concept page). Reads the portal's research datasets; no shared code is modified. */
import { Data } from '../../assets/core.js?v=20261009185324';
import { Chat } from '../../assets/chat.js?v=20261009185324';
import { Frame } from '../../assets/frame.js?v=20261009185324';

const $ = (s, r = document) => r.querySelector(s);
const tkn = (n, fb) => { try { return getComputedStyle(document.body).getPropertyValue(n).trim() || fb; } catch { return fb; } };
const T = { co: tkn('--co', '#3fd0e0'), ink: tkn('--sys-ink', '#0c1320'), mute: tkn('--sys-mute', '#5f6774'), line: tkn('--sys-line', '#e8e5de'), bad: tkn('--sys-bad', '#c62828'), orange: tkn('--sys-orange', '#f2832f'), surface: tkn('--sys-surface', '#ffffff') };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = s => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const money = (n, d = 1) => n == null || isNaN(n) ? '—' : Math.abs(n) >= 1e9 ? `$${trim((n / 1e9).toFixed(d))}B` : Math.abs(n) >= 1e6 ? `$${trim((n / 1e6).toFixed(d))}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
const num = (n, d = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const range = (a, f = x => x) => Array.isArray(a) ? `${f(a[0])}–${f(a[1])}` : f(a);
const EST = '<span class="sys-est">est.</span>';
const host = u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } };
const QS = new URLSearchParams(location.search);
const srcLink = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || host(u))}</a>` : '';
const dash = s => String(s ?? '').replace(/(\d)-(\d)/g, '$1–$2');
/* Reader-facing copy: dataset IDs (FH-14, gl-10, ra-fh…) and file names stay out of the prose; sources live in links and the footer. */
const IDP = String.raw`(?:FH-\d+|gl-\d+|fin-\d+|rival-\d+|ra-fh|ph-\d|tpl-[a-z]+-[\w*]+|ai-\d+|fh-opp-\d+|bsp-fh)(?![\w*-])`;
const ID_PAREN = new RegExp(String.raw`\s*\((?:[a-z]+_[a-z_]+\s+)?${IDP}(?:\s*[,;]\s*(?:[a-z]+_[a-z_]+\s+)?${IDP})*(\s*,\s*est\.)?\)`, 'g');
const ID_BARE = new RegExp(String.raw`(?:\b[a-z]+_[a-z_]+\s+)?\b${IDP}`, 'g');
/* ISO dates → words (Dec 11, 2025) */
function wdate(t) { return t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+mo - 1] || mo} ${+d}, ${y}`); }
const clean = s => dash(wdate(String(s ?? '')).replace(ID_PAREN, (m, e) => e ? ' (est.)' : '').replace(ID_BARE, '')
  .replace(/\s*\(?\b(?:data\/research\/)?[a-z_]+\.json\)?/g, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:)])/g, '$1'));
const UP = { usd: '', pct: '', ebitda: 'EBITDA', dtc: 'DTC', us: 'US', fy2025: 'FY2025', fy2024: 'FY2024', q2: 'Q2', acq: 'acquisition', intl: 'international', b2b: 'B2B', ev: 'EV', harboros: 'HarborOS', footjoy: 'FootJoy', klaviyo: 'Klaviyo', bain: 'Bain', vuori: 'Vuori', chubbies: 'Chubbies', est: '(est.)', x: 'x' };
const sentence = k => { const w = k.split('_').map(t => t in UP ? UP[t] : t).filter(Boolean).join(' '); return w.charAt(0).toUpperCase() + w.slice(1); };
/* calendar: month 0 of the roadmap is the memo date (Oct 2026) */
const BASE = { y: 2026, m: 9, d: 6 };
const mDate = (m, o = { month: 'short', year: 'numeric' }) => new Date(Date.UTC(BASE.y, BASE.m + m, BASE.d)).toLocaleString('en-US', { ...o, timeZone: 'UTC' });
const yearsBetween = (a, b) => (b - a) / (365.25 * 864e5);


const [pb, firm, pe, ev, comps, filings, refs, rival] = await Promise.all(
  ['fh_playbook', 'bsp_firm', 'pe_landscape', 'serviceos_evidence', 'public_comps', 'fairharbor_filings', 'design_refs', 'rival_filings'].map(n => Data.load(`research/${n}`).catch(() => null))); // direct path: skips the data/<name>.json HEAD probe (8 console 404s)

if (!pb) {
  $('#kpis').innerHTML = '<p class="sys-src">The Fair Harbor growth plan data did not load.</p>';
  mountChat(null);
} else {
  const items = pb.items || [];
  const K = k => items.filter(i => i.kind === k);
  const byId = id => items.find(i => i.id === id);
  const road = pb.meta.kpi_roadmap || [];
  const m0 = road[0], m36 = road[road.length - 1];
  const g0 = String(pb.meta.generated || '2026-10-06').split('-').map(Number); BASE.y = g0[0]; BASE.m = g0[1] - 1; BASE.d = g0[2] || 1;
  const at = (m, k) => { const i = road.findIndex(r => r.month >= m); if (i <= 0) return road[Math.max(0, i)][k]; const a = road[i - 1], b = road[i]; return a[k] + (b[k] - a[k]) * (m - a.month) / (b.month - a.month); }; // straight line between roadmap points
  const fhItem = (firm?.items || []).find(i => i.id === 'bsp-fh');
  const entryDate = new Date((fhItem?.entry_date || '2022-03-23') + 'T00:00:00Z');
  const exitAt = m => new Date(Date.UTC(BASE.y, BASE.m + m, BASE.d));
  const holdAt = m => yearsBetween(entryDate, exitAt(m));
  const est = metric => ((filings?.meta?.estimate_table || []).find(r => r.metric.startsWith(metric)) || {}).estimate || '';
  const rev2021 = (est('2021 net revenue').match(/\$(\d+)-(\d+)M/) || [0, 30, 40]).slice(1).map(Number); // est. $30–40M
  const rev2025 = dash(est('2025 net revenue').replace(/\s*\(.*$/, '')) || '$20–35M';
  const fil = id => (filings?.items || []).find(i => i.id === id);
  const cite = (id, label) => { const it = fil(id) || byId(id) || (rival?.items || []).find(i => i.id === id); return it?.source_url ? srcLink(it.source_url, label) : esc(label); };
  const askLink = n => `<a href="#ask-${n}">Ask ${n}</a>`;

  /* ── hero ── */
  // The authored lede stays: pb.meta.thesis repeats the H1 almost word for word.
  const cagr = (Math.pow(m36.revenue_usd / m0.revenue_usd, 12 / m36.month) - 1) * 100;
  const KPIS = [
    { l: 'Net revenue', from: money(m0.revenue_usd, 0), to: money(m36.revenue_usd, 0), d: `+${Math.round((m36.revenue_usd / m0.revenue_usd - 1) * 100)}% · ${cagr.toFixed(1)}%/yr · today’s range ${rev2025}`, f: m0.revenue_usd / m36.revenue_usd },
    { l: 'EBITDA', from: money(m0.ebitda_usd), to: money(m36.ebitda_usd), d: `${m0.ebitda_margin_pct.toFixed(1)}% → ${m36.ebitda_margin_pct.toFixed(1)}% margin`, f: m0.ebitda_usd / m36.ebitda_usd },
    { l: 'Doors + owned stores', from: num(m0.locations_or_accounts), to: num(m36.locations_or_accounts), d: `+${num(m36.locations_or_accounts - m0.locations_or_accounts)} doors · ${(m36.locations_or_accounts / m0.locations_or_accounts).toFixed(1)}x`, f: m0.locations_or_accounts / m36.locations_or_accounts },
    { l: 'Revenue per employee', from: money(m0.revenue_per_employee_usd), to: money(m36.revenue_per_employee_usd), d: `headcount ${m0.headcount} → ${m36.headcount}`, f: m0.revenue_per_employee_usd / m36.revenue_per_employee_usd },
  ];
  $('#kpis').innerHTML = KPIS.map(k => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${esc(k.l)}</span><span class="sys-kpi-value"><small>${k.from} →</small>${k.to}<span class="sys-sr">by month 36 (${mDate(36)})</span></span><span class="sys-kpi-sub">${/^\+/.test(k.d) ? `<span class="sys-delta sys-delta--up">${esc(k.d.split(' · ')[0])}</span>${k.d.includes(' · ') ? ` · ${esc(k.d.split(' · ').slice(1).join(' · '))}` : ''}` : esc(k.d)}</span><span class="pb-bar" aria-hidden="true"><i style="width:${Math.round(k.f * 100)}%"></i></span></div>`).join('');
  $('#kpi-foot').innerHTML = `<b>Read this as recovery first.</b> Our outside-in estimate puts revenue at or below its 2021 entry scale (est. $${rev2021[0]}–${rev2021[1]}M). The plan gets back to the top of that range by month 36 (${mDate(36)}). Bar = today as a share of month 36. Analyst assumptions, not company guidance.`;

  /* ── memo ── */
  const memo = (pb.meta.narrative || []).map(s => {
    if (/still a ~\$27M business/.test(s)) return `This starts from a hypothesis for management to confirm. If our outside-in estimate is right (~${money(m0.revenue_usd, 0)} of revenue, range ${rev2025}, built from web traffic rather than company data), Fair Harbor is about ${holdAt(0).toFixed(1)} years in and at or below its 2021 entry scale (est. $${rev2021[0]}–${rev2021[1]}M), with low single-digit EBITDA and no add-ons.`;
    if (/unsold/.test(s)) return 'We should stay capital-light: operating cash and an ABL of roughly $3.4–4.6M (est.) cover the plan, with a small sponsor follow-on as the backstop. Solo Brands\' delisting shows what term debt does to a swim brand.';
    if (/still below Chubbies/.test(s)) return clean(s) + ` On revenue, that only takes the business back to the top of the estimated entry range.`;
    return clean(s);
  });
  const xIdx = memo.findIndex(s => /Smith \+ Howard lesson/.test(s));
  const p4 = K('expansion_phase').find(p => p.phase === 4)?.data_points || {}, mid = a => (a[0] + a[1]) / 2;
  const evX = m36.revenue_usd * (mid(p4.entry_ev_to_revenue_est || [1.3, 2.5]) + mid(p4.harboros_multiple_credit_x_revenue || [0.2, 0.5])) / mid(p4.entry_ev_est_usd || [40e6, 90e6]);
  memo.splice(xIdx < 0 ? memo.length : xIdx, 0, `Measured from entry, the default exit case is weak: about ${evX.toFixed(2)}x the est. entry EV midpoint over ~${holdAt(36).toFixed(1)} years, roughly ${((Math.pow(evX, 1 / holdAt(36)) - 1) * 100).toFixed(1)}% a year of EV growth. Measured from today's value at the same multiple, it earns about ${((Math.pow(m36.revenue_usd * (mid(p4.entry_ev_to_revenue_est || [1.3, 2.5]) + mid(p4.harboros_multiple_credit_x_revenue || [0.2, 0.5])) / (m0.revenue_usd * mid(p4.entry_ev_to_revenue_est || [1.3, 2.5])), 12 / m36.month) - 1) * 100).toFixed(0)}% a year. So the real decision is exit timing, which the Financing section sets out.`);
  $('#memo').innerHTML = memo.map(s => `<li>${esc(s)}</li>`).join('');
  $('#memo').previousElementSibling.textContent = `Memo · ${memo.length} points`;

  /* ── template vs plan ── */
  const sh = byId('tpl-sh-6')?.key_figures || {};
  const rows = [
    ['Revenue multiple', sh.revenue_multiple_of_entry, m36.revenue_usd / ((rev2021[0] + rev2021[1]) / 2 * 1e6), v => `${v.toFixed(1)}x`],
    ['Footprint multiple', sh.locations_exit, m36.locations_or_accounts / m0.locations_or_accounts, v => `${v.toFixed(1)}x`],
    ['People multiple', sh.professionals_exit / sh.professionals_entry, m36.headcount / m0.headcount, v => `${v.toFixed(1)}x`],
    ['Acquisitions', sh.add_ons, 0, v => `${v}`],
    ['Years held', sh.hold_years, holdAt(m36.month), v => `${v.toFixed(1)}`],
  ];
  const vsCard = (cls, label, title, sub, idx) => `<article class="sys-card pb-vs--${cls}"><p class="sys-card-label">${label}</p><h3 class="sys-card-title">${title}</h3><p class="sys-card-body">${sub}</p><div class="pb-vs">${rows.map(r => { const v = r[idx], mx = Math.max(r[1] || 0, r[2] || 0) || 1; return `<div class="pb-vs-row"><span class="lab">${esc(r[0])}</span><span class="pb-track"><i style="width:${Math.max(2, (v / mx) * 100)}%"></i></span><span class="val">${r[3](v || 0)}</span></div>`; }).join('')}</div></article>`;
  $('#versus').innerHTML = vsCard('sh', 'Template · exited Aug 2026', 'Smith + Howard', `~${sh.professionals_entry} → ~${sh.professionals_exit} professionals, 1 → ${sh.locations_exit} offices, ${sh.add_ons} add-ons, sold to TPG Growth`, 1)
    + vsCard('fh', `Plan · entry ${entryDate.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })} → exit ${mDate(36)}`, `Fair Harbor plan${EST}`, `${money(m0.revenue_usd, 0)} today → ${money(m36.revenue_usd, 0)} revenue at month 36, ${m0.locations_or_accounts} → ${m36.locations_or_accounts} doors, headcount held near ${m36.headcount}, no acquisitions assumed`, 2);
  $('#versus-src').innerHTML = `<b>Source:</b> BSP exit release and the Fair Harbor growth plan, Oct 2026. Fair Harbor's revenue multiple is measured from the 2021 entry-year estimate (midpoint $${(rev2021[0] + rev2021[1]) / 2}M), not from today. Footprint and people are measured from today, because entry-year counts aren't public. A month-36 exit (${mDate(36)}) is ~${holdAt(36).toFixed(1)} years after BSP's March 2022 entry, about twice the Smith + Howard hold.`;
  $('#steps').innerHTML = K('template').filter(t => t.entity === 'Smith + Howard').map((t, i) => `<li class="sys-card"><span class="sys-card-label">Step ${i + 1} · Smith + Howard</span><h3 class="sys-card-title">${esc(clean(t.move))}</h3><p class="sys-card-body">${esc(clean(t.what_they_did))}</p><div class="sys-note sys-note--co"><span><b>Fair Harbor translation.</b> ${esc(clean(t.fair_harbor_translation))}</span></div></li>`).join('');
  const fig = (k, v) => { const lab = sentence(k); const val = /_usd/.test(k) ? money(v) : /_pct/.test(k) ? `${v}%` : Array.isArray(v) ? v.join(', ') : /founded|year/.test(k) ? String(v) : num(v, v % 1 ? 1 : 0); return `<span class="sys-chip">${esc(lab)}: <b class="sys-num">${esc(val)}</b></span>`; };
  $('#analogs').innerHTML = K('template').filter(t => t.entity !== 'Smith + Howard').map(t => `<article class="sys-card"><span class="sys-card-label">${esc(t.move.split(':')[0])}</span><h3 class="sys-card-title">${esc(t.entity)}</h3><div class="sys-chips">${Object.entries(t.key_figures || {}).slice(0, 4).map(([k, v]) => fig(k, v)).join('')}</div><p class="sys-card-body">${esc(clean(t.fair_harbor_translation))}</p><p class="sys-card-foot"><span>${srcLink(t.source_url, 'Source: ' + host(t.source_url))}</span><span class="sys-num">Confidence: ${esc(t.confidence)}</span></p></article>`).join('');

  /* ── phased map ── */
  buildMap(K('expansion_phase'), firm, pe, at);

  /* ── levers ── */
  const LEV = ['gl-01', 'gl-02', 'gl-03', 'gl-04', 'gl-05', 'gl-07', 'gl-08', 'gl-12'];
  const lv = LEV.map(byId).filter(Boolean);
  const phT = (n, k) => K('expansion_phase').find(p => p.phase === n)?.kpi_targets?.[k]?.target;
  const doorsAt = m => Math.round(at(m, 'locations_or_accounts')) - 2; // roadmap counts 2 owned stores
  // Horizon and checkpoints for each lever, read off the phase targets and the KPI roadmap so the sections chain.
  // basis: fh = observed Fair Harbor data; bench = industry benchmark standing in; est = estimate midpoint; stale = dated public count.
  const LH = {
    'gl-01': { by: 24, cps: [[18, doorsAt(18)], [36, doorsAt(36)]], basis: 'stale', tag: '2022 count', note: '~252 is the 2022 count; the current stockist list is not public.', ev: '' },
    'gl-02': { by: 36, cps: [[18, phT(2, 'wholesale_share_of_revenue_pct')]], basis: 'est', tag: 'estimate, not company data', note: '40% is the midpoint of an estimated 35–45% non-DTC share.' },
    'gl-03': { by: 24, cps: [[6, phT(1, 'markdown_share_pct')]], basis: 'fh' },
    'gl-04': { by: 36, cps: [[6, phT(1, 'swim_return_rate_pct')]], basis: 'bench', tag: 'benchmark, not company data', note: "21.6% is Loop's swimwear benchmark; Fair Harbor's rate is not public." },
    'gl-05': { by: 36, cps: [[30, phT(3, 'repeat_purchase_rate_pct')]], basis: 'bench', tag: 'benchmark, not company data', note: "20% is the low end of Klaviyo's 20–30% 'good' range; Fair Harbor's actual is not disclosed.", ev: '' },
    'gl-07': { by: 36, cps: [], basis: 'fh' },
    'gl-08': { by: 36, cps: [], basis: 'fh' },
    'gl-12': { by: 36, cps: [[12, at(12, 'ebitda_margin_pct')], [24, at(24, 'ebitda_margin_pct')]], basis: 'est', tag: 'estimate, not company data', note: '6% is the midpoint of an estimated 0–12% range.' },
  };
  $('#lever-list').innerHTML = lv.map(l => {
    const h = LH[l.id] || { by: 36, cps: [], basis: 'fh' };
    const cps = h.cps.filter(c => c[1] != null);
    const b = l.baseline ?? 0, t = l.target, down = t < b, mx = Math.max(b, t, ...cps.map(c => c[1])) * 1.12 || 1;
    const pb_ = b / mx * 100, pt = t / mx * 100;
    const span = down ? `left:${pt}%;width:${pb_ - pt}%` : `left:${pb_}%;width:${pt - pb_}%`;
    const pc = /%/.test(l.unit) ? '%' : '';
    const f = v => `${num(v, v % 1 ? 1 : 0)}${pc}`;
    const path = [['today', b], ...cps.filter(c => c[0] < h.by), [`M${h.by}`, t], ...cps.filter(c => c[0] > h.by)].map(([m, v]) => [typeof m === 'number' ? `M${m}` : m, v]);
    const unit = String(l.unit).replace(/\s*\(month \d+\)/, '');
    const ev = h.note ? `${h.note} ${h.ev ?? clean(l.evidence).replace(/^Fair Harbor est\.[^;]*;\s*(.)/, (m, c) => c.toUpperCase())}`.trim() : clean(l.evidence);
    return `<article class="sys-card"><span class="sys-card-label">${esc(unit)} · ${down ? '▼ lower is better' : '▲ higher is better'}</span><div class="pb-lever-top"><h3 class="sys-card-title">${esc(l.lever)}</h3><span class="vals">${f(b)} → <b>${f(t)}</b> <span class="pb-sub">by M${h.by}</span></span></div>${h.tag ? `<div class="sys-chips"><span class="sys-chip sys-chip--soft">${esc(h.tag)}</span></div>` : ''}<div class="pb-ltrack ${down ? 'down' : ''}" role="img" aria-label="${esc(l.lever)}: ${esc(path.map(([m, v]) => `${m} ${f(v)}`).join(', '))}"><span class="base ${h.basis !== 'fh' ? 'bench' : ''}" style="width:${down ? pt : pb_}%"></span><span class="tgt" style="${span}"></span>${cps.map(c => `<span class="cp" style="left:calc(${c[1] / mx * 100}% - 1px)"></span>`).join('')}<span class="mk" style="left:calc(${pt}% - 1px)"></span></div><div class="pb-lpath" aria-hidden="true">${path.map(([m, v]) => `<span><i>${esc(m)}</i> ${f(v)}</span>`).join('<span class="sep">→</span>')}</div><p class="sys-card-body">${esc(ev)} ${EST}</p></article>`;
  }).join('');
  const rest = K('growth_lever').filter(l => !LEV.includes(l.id));
  $('#lever-more').innerHTML = `<b>Source:</b> Fair Harbor growth plan (growth levers), Oct 2026. Also tracked: ${rest.map(l => `${esc(l.lever)} (${l.baseline == null ? 'baseline not public' : num(l.baseline)} → ${num(l.target)}${/^%/.test(l.unit) ? '' : ' '}${esc(l.unit)})`).join('; ')}.`;

  /* ── agents ── */
  const ag = K('ai_agent');
  const WHO = [['all', 'Everyone', null], ['cust', 'Customers', /customer|shopper/i], ['cx', 'CX team', /\bCX\b/], ['merch', 'Merch & planning', /merch|planning/i], ['fin', 'Finance', /finance|margin/i], ['mkt', 'Growth marketing', /growth marketing|repeat customers/i], ['whs', 'Wholesale & ops', /wholesale|reps|buyers|\bops\b/i]];
  const tagsOf = a => WHO.filter(w => w[2] && w[2].test(a.who_it_helps || '')).map(w => w[0]);
  const ICONS = [
    '<path d="M4 17 17 4l3 3L7 20H4z M13 8l3 3 M10 11l2 2 M7 14l2 2"/>', '<path d="M4 5h16v10H9l-5 4z"/>', '<path d="M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3"/>',
    '<path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2"/>', '<path d="M3 12 12 3h8v8l-9 9z M16 8h.01"/>', '<path d="M3 6h18v12H3z M3 7l9 6 9-6"/>',
    '<path d="M3 10v4l11 5V5L3 10z M18 8a5 5 0 0 1 0 8"/>', '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18"/>', '<path d="M3 9 5 4h14l2 5 M3 9v11h18V9 M3 9h18 M9 20v-6h6v6"/>'];
  const WK = 12;
  $('#agent-list').innerHTML = ag.map((a, i) => { const w = a.weeks_to_deploy || [0, 0]; return `<article class="sys-card pb-agent" data-tags="${tagsOf(a).join(' ')}"><span class="sys-card-label"><span class="pb-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i % ICONS.length]}</svg></span>Agent ${String(i + 1).padStart(2, '0')}</span><h3 class="sys-card-title">${esc(a.agent)}</h3><p class="sys-card-body">${esc(clean(a.job_to_be_done))}</p>${a.metric_value != null ? `<p class="pb-metric"><b>${num(a.metric_value, a.metric_value % 1 ? 1 : 0)}${/%/.test(a.metric_unit || '') ? '%' : ''}</b><span>${esc(String(a.metric_unit || '').replace(/^%\s*/, ''))}</span></p>` : `<p class="pb-metric"><span>No independent metric verified yet</span></p>`}<div class="sys-chips">${String(a.who_it_helps || '').split(/,\s*/).map(x => `<span class="sys-chip sys-chip--soft">${esc(x)}</span>`).join('')}</div><div class="pb-wk"><span>${w[0]}–${w[1]} weeks</span><span class="t" aria-hidden="true"><i style="left:${w[0] / WK * 100}%;width:${(w[1] - w[0]) / WK * 100}%"></i></span></div><p class="sys-card-foot"><span>${esc((a.vendor_examples || []).join(' · '))}</span><span>${esc(a.cost_model)}</span></p></article>`; }).join('');
  const counts = Object.fromEntries(WHO.map(w => [w[0], w[0] === 'all' ? ag.length : ag.filter(a => tagsOf(a).includes(w[0])).length]));
  $('#who-toggle').innerHTML = WHO.map((w, i) => `<button type="button" class="sys-chip" data-w="${w[0]}" aria-pressed="${i === 0}">${esc(w[1])}<span class="sys-num">${counts[w[0]]}</span></button>`).join('');
  $('#who-toggle').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#who-toggle button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); const w = b.dataset.w; document.querySelectorAll('#agent-list .pb-agent').forEach(c => c.classList.toggle('dim', w !== 'all' && !c.dataset.tags.split(' ').includes(w))); });
  if (QS.get('who')) document.querySelector(`#who-toggle button[data-w="${CSS.escape(QS.get('who'))}"]`)?.click(); // deep link: ?who=fin

  /* ── talent ── */
  $('#talent-list').innerHTML = K('talent_program').map(t => `<article class="sys-card"><h3 class="sys-card-title">${esc(t.program)}</h3><div class="sys-chips">${String(t.who_it_helps || '').split(/[,;]\s*/).map(x => `<span class="sys-chip">${esc(x)}</span>`).join('')}</div><p class="pb-metric"><span>${esc(clean(t.metric))}</span></p><p class="sys-card-body">${esc(clean(t.evidence))}</p></article>`).join('');

  /* ── add-on machine ── */
  const g = id => byId(id) || {};
  const UNITS = [
    { h: 'Wholesale doors (specialty, golf, sporting goods)', sh: 'S+H step 2: the next city → the next door type', b: m0.locations_or_accounts, t: m36.locations_or_accounts, fmt: v => num(v), delta: `+${num(m36.locations_or_accounts - m0.locations_or_accounts)}`, small: 'doors by month 36' },
    { h: 'Collegiate schools licensed', sh: 'S+H step 3: capability add-ons sold to existing clients', b: g('gl-10').baseline, t: g('gl-10').target, fmt: v => num(v), delta: `+${num(g('gl-10').target - g('gl-10').baseline)}`, small: `schools by M36 (${phT(2, 'collegiate_schools') ?? 15} by M18)` },
    { h: 'B2B custom and licensing', sh: 'S+H step 3: a new menu for the same buyers', b: 0, t: g('gl-09').target, fmt: v => `${v}%`, delta: money(m36.revenue_usd * g('gl-09').target / 100), small: `${g('gl-09').target}% of month-36 revenue (est.)` },
    { h: 'International DTC (Canada, UK, Australia)', sh: 'S+H step 4: density in a chosen region', b: g('gl-08').baseline, t: g('gl-08').target, fmt: v => `${v}%`, delta: money(m36.revenue_usd * g('gl-08').target / 100), small: `${g('gl-08').target}% of month-36 revenue (est.)` },
  ];
  const opp6 = (firm?.fh_opportunities || []).find(o => o.id === 'fh-opp-06');
  $('#units').innerHTML = `<span class="sys-card-label">Channel add-ons · today → month 36</span><h3 class="sys-card-title">Five ways to add revenue without buying a company</h3><div class="pb-units">` + UNITS.map(u => { const mx = Math.max(u.b, u.t) || 1; return `<div class="pb-unit"><div><b>${esc(u.h)}</b><div class="pb-sub">${esc(u.sh.replace(/^S\+H /, 'Smith + Howard '))} · ${u.fmt(u.b)} → ${u.fmt(u.t)}</div></div><div class="delta">${esc(u.delta)}<small>${esc(u.small)}</small></div><div class="t" aria-hidden="true"><i style="width:${u.b / mx * 100}%"></i><b style="left:${u.b / mx * 100}%;width:${(u.t - u.b) / mx * 100}%"></b></div></div>`; }).join('')
    + (opp6 ? `<div class="pb-unit"><div><b>Collaborations as the awareness engine</b><div class="pb-sub">${esc(clean(opp6.value_or_scale))}</div></div><div class="delta">~3/yr<small>2025–26 cadence (${cite('FH-16', 'site collections')})</small></div></div>` : '')
    + `</div><p class="sys-src"><b>Source:</b> Fair Harbor growth plan (KPI roadmap and growth levers), Oct 2026. Doors from the KPI roadmap; schools, B2B and international from the growth-lever targets. Revenue in $ = target share × month-36 revenue${EST}</p>`;
  const chub = byId('tpl-an-chubbies')?.key_figures || {};
  const f5 = byId('fin-05'), f1 = byId('fin-01');
  const q2 = (rival?.items || []).find(i => i.id === 'rival-012')?.key_figures || {};
  $('#watch').innerHTML = `<div class="sys-chips"><span class="sys-chip sys-chip--soft">Opportunistic watch, not a screened target</span></div><h3 class="sys-card-title">Chubbies, owned by a delisted, levered parent</h3><p class="sys-card-body">${esc(clean(f5?.implication || ''))}</p><dl class="pb-dl"><dt>FY2025 net sales</dt><dd>${money(chub.net_sales_fy2025_usd)}</dd><dt>Wholesale + retail share</dt><dd>${chub.wholesale_retail_share_pct ?? '—'}%</dd><dt>Segment EBITDA margin</dt><dd>${chub.segment_ebitda_margin_pct ?? '—'}%</dd><dt>Q2 2026 net sales change</dt><dd>${q2.chubbies_q2_change_pct ?? '—'}%</dd><dt>Q2 2026 DTC change</dt><dd>${chub.q2_2026_dtc_change_pct ?? '—'}%</dd><dt>Parent long-term debt (Jun 30, 2026)</dt><dd>${money(f5?.key_figures?.solo_long_term_debt_2026_06_30_usd)}</dd></dl><p class="sys-card-body">Chubbies is ~${(chub.net_sales_fy2025_usd / m0.revenue_usd).toFixed(1)}x Fair Harbor's est. revenue, so the play is to pick up doors, reps or a license if they come loose, and be the clean-balance-sheet partner. ${askLink(6)} commissions a proper tuck-in screen.</p><p class="sys-src"><b>Source:</b> ${srcLink(byId('tpl-an-chubbies')?.source_url, 'Solo Brands 10-K')} · ${srcLink(f5?.source_url, 'Form 25 / 10-Q')} · ${cite('rival-012', 'Solo Brands Q2 2026 10-Q')}</p>`;

  /* ── financing ── */
  $('#road-table').innerHTML = `<div class="sys-table-wrap"><table class="sys-table"><thead><tr><th scope="col">Month</th><th scope="col" class="sys-n">Revenue</th><th scope="col" class="sys-n">EBITDA</th><th scope="col" class="sys-n">Margin</th><th scope="col" class="sys-n">Headcount</th><th scope="col" class="sys-n">Rev / FTE</th><th scope="col" class="sys-n">Doors + stores</th></tr></thead><tbody>${road.map(r => `<tr class="${r.month === 36 ? 'hl' : ''}"><td>${r.month === 0 ? 'Today' : 'M' + r.month} <small>${mDate(r.month)}</small></td><td class="sys-n">${money(r.revenue_usd)}</td><td class="sys-n">${money(r.ebitda_usd, 2)}</td><td class="sys-n">${r.ebitda_margin_pct.toFixed(1)}%</td><td class="sys-n">${r.headcount}</td><td class="sys-n">${money(r.revenue_per_employee_usd)}</td><td class="sys-n">${r.locations_or_accounts}</td></tr>`).join('')}</tbody><caption>Source: Fair Harbor growth plan (KPI roadmap), Oct 2026. Analyst assumptions, not company guidance.</caption></table></div>`;
  drawRoad(road);
  const apparel = (comps?.items || []).filter(c => c.sector_tag === 'apparel_dtc' && c.ebitda_margin_latest_pct != null);
  const med = arr => { const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const appMed = apparel.length ? med(apparel.map(c => c.ebitda_margin_latest_pct)) : null;
  const lulu = apparel.find(c => c.ticker === 'LULU');
  $('#road-src').innerHTML = `<b>Source:</b> Fair Harbor growth plan and public comparables, Oct 2026. Bars = revenue; line = EBITDA margin. Month-36 margin of ${m36.ebitda_margin_pct}% compares with an apparel/DTC public-comp median of ${appMed == null ? '—' : appMed.toFixed(1) + '%'} (${apparel.map(c => c.ticker).join(', ')}) and ${lulu ? `LULU ${lulu.ebitda_margin_latest_pct}%` : 'LULU'} as the ceiling (SEC XBRL). Analyst assumptions anchored to the public-filings estimate table; not forecasts or company guidance.`;
  buildCalc((ev?.items || []).find(i => i.id === 'ra-fh'), K('expansion_phase').find(p => p.phase === 4), m0, m36, { at, holdAt });
  // fin-01 is history: the $6.0M gap on the 2022 Form D is an offering ceiling that was never filled, not committed or undrawn capital today.
  const FIN_TXT = { 'fin-01': f => ({ d: `$30.7M of primary equity sold to 24 investors on 2022-03-15, of $36.7M offered; about 9.2% of Fund I's $335M. No proceeds to officers.`, i: `History only: the $6.0M gap is an offering amount never filled in March 2022, not committed or undrawn capital today. HarborOS is funded from operating cash or the ABL, or a small sponsor follow-on.` }) };
  $('#instr').innerHTML = K('financing').map(f => { const o = FIN_TXT[f.id]?.(f) || { d: f.description, i: f.implication }; return `<article class="sys-card"><span class="sys-card-label">Financing · ${esc(f.confidence)} confidence</span><h3 class="sys-card-title">${esc(f.instrument)}</h3><p class="sys-card-body">${esc(clean(o.d))}</p><div class="sys-note sys-note--co"><span>${esc(clean(o.i))}</span></div><p class="sys-card-foot"><span>${srcLink(f.source_url, 'Source: ' + host(f.source_url))}</span></p></article>`; }).join('');

  /* ── risks ── */
  const fig18 = (filings?.items || []).find(i => i.id === 'FH-18')?.key_figures || {};
  const RISKS = [
    ['h', 'The baseline itself is an estimate', `Fair Harbor has never disclosed revenue, EBITDA or debt; the $27M / 6% baseline is the midpoint of a $20–35M, 0–12% low-confidence range, and it sits at or below the est. 2021 entry scale.`, `Lock targets only after a monthly KPI pack (${askLink(1)}). Re-base the roadmap, not the thesis.`],
    ['h', 'Markdown dependence erodes the brand', `38.5% of live variants were marked down in Sept 2026 and the women's line was cleared at ~70% off (${cite('FH-14', 'live Shopify catalog, 24 Sep 2026')}; ${cite('FH-15', "women's update page, Dec 2025")}).`, `Markdown guardrail (${askLink(4)}), planning hire, markdown agent on SKU-level end-of-season pricing.`],
    ['h', 'Weather and a single peak season', 'Swim is the most-returned category at Shopify brands (21.6%, an industry benchmark) and sales peak May–July; a cold, wet summer hits revenue and inventory together.', 'Grow non-swim from 64% toward 70% of the assortment, buy to forecast, size the ABL to the seasonal build.'],
    ['m', 'DTC demand is softening across the category', `Fair Harbor web visits fell ${fig18.fairharbor_last_month_change_pct == null ? '—' : Math.abs(fig18.fairharbor_last_month_change_pct).toFixed(1)}% month on month (${cite('FH-18', 'Similarweb, Aug 2026')}); Chubbies DTC fell 20.8% in Q2 2026.`, 'Shift mix toward wholesale (~50% by M36) and retention flows before raising paid spend.'],
    ['m', 'Wholesale credit exposure', `Fair Harbor appears in the J.Crew (2020) and Express (2024) bankruptcy dockets (${cite('FH-20', 'CourtListener')}); more doors means more receivables.`, 'Credit limits by account tier, credit insurance on department-store AR, diversify into golf and campus doors.'],
    ['m', 'Website accessibility litigation', `Two ADA website suits in S.D.N.Y. (2024, settled; Jul 2026, open) (${cite('FH-19', 'CourtListener')}).`, 'Fold a WCAG 2.2 AA remediation into the HarborOS PDP and checkout work in phase 1.'],
    ['m', 'Unknown current lender and covenants', `The eCapital ABL lien was released on Dec 11, 2025, the same day the core marks moved to a Topco; the new facility is not public (${cite('fin-02', 'USPTO lien records')}).`, `Confirm facility, covenants and borrowing base (${askLink(5)}); no term debt until EBITDA clears ~$4–5M.`],
    ['l', 'AI vendor claims are upper bounds', 'Every agent metric is vendor- or research-reported and self-selected.', 'Pilot each agent with a holdout group; pay-per-resolution pricing where offered.'],
  ];
  $('#risk-list').innerHTML = RISKS.map((r, i) => `<article class="sys-card"><span class="sys-card-label">Risk ${i + 1} · ${{ h: 'High', m: 'Medium', l: 'Low' }[r[0]]} severity</span><h3 class="sys-card-title">${esc(r[1])}</h3><p class="sys-card-body">${r[2]}</p><div class="sys-note sys-note--good" style="margin-top:auto"><span><b>Mitigation.</b> ${r[3]}</span></div></article>`).join('');

  /* ── PRG asks ── */
  const ra = (ev?.items || []).find(i => i.id === 'ra-fh');
  const ASKS = [
    ['Close the baseline gap', 'Stand up a monthly KPI pack: net revenue by channel, gross margin, markdown share, return rate, repeat rate, door count. Every number on this page is re-based on it.', ['PRG finance + FH CFO', 'Before the Q4 2026 board']],
    [`Approve HarborOS phase 1 (${ra ? range(ra.investment_usd, v => money(v)) : '$0.3–0.7M'})`, `Fund from operating cash or ABL headroom; if the 2027 swim build leaves no room, a small sponsor follow-on. Start with the fit advisor, CX agent and returns-to-exchange (3–10 weeks each).`, ['PRG tech enablement', 'Live before the 2027 swim peak']],
    ['Hire a head of planning and a wholesale key-account lead', 'Planning owns open-to-buy with AI forecasting; the wholesale lead runs a commissioned rep network (10–15%), so door growth is a variable cost.', ['PRG talent network', 'First 90 days']],
    ['Set a markdown guardrail', 'Target ≤30% of live variants below compare-at price by month 6 and 25% by month 24; no sitewide sales without board visibility.', ['CEO + merchandising', 'Month 6 checkpoint']],
    ['Confirm the ABL and keep term debt off', 'Verify the post-Dec-2025 facility, covenants and borrowing base (~$3.4–4.6M est.). Revisit leverage only once EBITDA clears ~$4–5M.', ['PRG capital markets', 'Next 60 days']],
    ['Commission a Fair Harbor tuck-in screen', 'Build a target screen for sustainable and coastal apparel brands, and keep a standing watch on Chubbies doors, reps and licenses.', ['BSP deal team', 'Q1 2027']],
  ];
  $('#ask-list').innerHTML = ASKS.map((a, i) => `<article class="sys-card" id="ask-${i + 1}"><span class="sys-card-label">Ask ${i + 1}</span><h3 class="sys-card-title">${esc(a[0])}${/HarborOS phase 1/.test(a[0]) ? EST : ''}</h3><p class="sys-card-body">${esc(a[1])}</p><p class="sys-card-foot"><span class="sys-chips"><span class="sys-chip sys-chip--soft">${esc(a[2][0])}</span><span class="sys-chip">${esc(a[2][1])}</span></span></p></article>`).join('');

  /* ── rationale & sources ── */
  $('#refs').innerHTML = `<li><b>A memo, not a brochure.</b> Follow the arc of a plan that already exited.</li>`
    + `<li><b>Lead with the number.</b> Four numbers read before the prose.</li>`
    + `<li><b>A map, because the thesis is about doors.</b> Show where they are.</li>`
    + `<li><b>Sources on every claim.</b> Assumptions never read as guidance.</li>`;
  const SRC = ['tpl-sh-6', 'tpl-an-chubbies', 'fin-01', 'fin-03', 'ai-02', 'ai-01'].map(byId).filter(Boolean);
  $('#src-list').innerHTML = SRC.map(s => `<li>${esc(s.entity || s.agent || s.instrument)}: ${srcLink(s.source_url)}</li>`).join('');

  mountChat({ pb, m0, m36, ag, f1, ra, clean });
}

/* ── map ─────────────────────────────────────────────────────────────────── */
function buildMap(phases, firm, pe, at) {
  const tabsEl = $('#phase-tabs'), panel = $('#phase-panel');
  if (!window.L) { $('#map').innerHTML = '<p class="sys-src pb-maperr">Map library did not load.</p>'; }
  const fh = (firm?.items || []).find(i => i.id === 'bsp-fh');
  const bspHq = firm?.firm;
  // City-level geocodes of places named in fairharbor_filings / fh_playbook / bsp_firm (no store list is public).
  const P = [
    { n: 'NYC HQ (520 Broadway) + SoHo Prince St store', lat: 40.7233, lon: -73.9985, c: 'own', ph: [1, 2, 3, 4], s: 'Source: NY Department of State record; store pages' },
    fh && { n: `Registered address: ${String(fh.hq_city).split('(')[0].trim()}, NY`, lat: fh.lat, lon: fh.lon, c: 'own', ph: [1], s: 'Source: Shopify and SEC filing address (city-level)' },
    { n: 'Palm Beach Gardens store (second owned store)', lat: 26.8406, lon: -80.1342, c: 'own', ph: [1, 2], s: 'Source: Fair Harbor store page' },
    { n: 'Fair Harbor Clothing Topco LLC (IP holdco), Jersey City', lat: 40.7178, lon: -74.0431, c: 'own', ph: [1, 4], s: 'Source: USPTO trademark assignment' },
    bspHq && { n: 'BSP HQ (34 E 51st St)', lat: bspHq.lat, lon: bspHq.lon, c: 'bsp', ph: [1, 2, 3, 4], s: 'Source: BSP (address-level)' },
    { n: 'Scheels partnership (2023) — Midwest sporting goods', lat: 46.8772, lon: -96.7898, c: 'door', ph: [2], s: 'Source: Fair Harbor site, 2023' },
    { n: 'University of Michigan (collegiate license)', lat: 42.278, lon: -83.7382, c: 'door', ph: [2, 3], s: 'Source: Fair Harbor collegiate collection' },
    { n: 'Syracuse University (collegiate license)', lat: 43.0377, lon: -76.1341, c: 'door', ph: [2, 3], s: 'Source: Fair Harbor collegiate collection' },
    { n: 'Purdue University (collegiate license)', lat: 40.4237, lon: -86.9212, c: 'door', ph: [2, 3], s: 'Source: Fair Harbor collegiate collection' },
    { n: 'Colgate University (collegiate license)', lat: 42.8184, lon: -75.5446, c: 'door', ph: [2, 3], s: 'Source: Fair Harbor collegiate collection' },
    { n: 'Fairfield University (collegiate license)', lat: 41.1579, lon: -73.2537, c: 'door', ph: [2, 3], s: 'Source: Fair Harbor collegiate collection' },
    { n: 'Canada DTC (Toronto shown)', lat: 43.6532, lon: -79.3832, c: 'intl', ph: [4], s: 'Phase 4 plan (est.)' },
    { n: 'United Kingdom DTC (London shown)', lat: 51.5074, lon: -0.1278, c: 'intl', ph: [4], s: 'Phase 4 plan (est.)' },
    { n: 'Australia DTC (Sydney shown)', lat: -33.8688, lon: 151.2093, c: 'intl', ph: [4], s: 'Phase 4 plan (est.)' },
    { n: 'Chubbies (Austin, TX) — closest analog', lat: 30.2672, lon: -97.7431, c: 'analog', ph: [2, 3, 4], s: 'Source: Solo Brands SEC filings' },
    { n: 'Smith + Howard (Atlanta) — template exit', lat: 33.749, lon: -84.388, c: 'analog', ph: [1, 2, 3, 4], s: 'Source: S+H and TPG press releases' },
  ].filter(Boolean);
  // Competing sponsors active in sustainable apparel (pe_landscape heatmap), aggregated by HQ city.
  const active = pe?.meta?.sector_heatmap?.fair_harbor?.most_active || [];
  const sp = new Map();
  (pe?.items || []).filter(i => active.includes(i.id) && i.hq_lat != null).forEach(i => { const k = `${i.hq_lat.toFixed(1)},${i.hq_lon.toFixed(1)}`; const g = sp.get(k) || { lat: i.hq_lat, lon: i.hq_lon, hq: i.hq, firms: [] }; g.firms.push(i.firm); sp.set(k, g); });
  for (const g of sp.values()) P.push({ n: `${g.firms.length} competing sponsor${g.firms.length > 1 ? 's' : ''} · ${g.hq}`, sub: g.firms.join(', '), lat: g.lat, lon: g.lon, c: 'sponsor', ph: [1, 2, 3, 4], r: 5 + g.firms.length * 2, s: 'Source: private-equity landscape' });
  const REG = [
    { n: 'Northeast coastal specialty doors', lat: 41.3, lon: -71.6, km: 230, ph: [2] },
    { n: 'Florida coastal specialty doors', lat: 27.6, lon: -80.7, km: 220, ph: [2] },
    { n: 'US national DTC + B2B custom accounts (97.2% of web traffic is US)', lat: 39.3, lon: -96.5, km: 1500, ph: [3] },
  ];
  const tok = (n, fb) => { try { return getComputedStyle(document.body).getPropertyValue(n).trim() || fb; } catch { return fb; } };
  const COL = { own: tok('--sys-ink', '#0c1320'), bsp: tok('--sys-mute', '#5f6774'), door: tok('--co', '#3fd0e0'), intl: tok('--sys-orange', '#f2832f'), sponsor: tok('--sys-warn', '#b45309'), analog: tok('--sys-mute-2', '#9aa1ab') };
  const LAB = { own: 'Fair Harbor HQ, stores, holdco', bsp: 'BSP', door: 'Channel adds (doors, schools)', intl: 'International DTC markets', sponsor: 'Competing sponsors (aggregated)', analog: 'Analog / template' };
  $('#legend').innerHTML = Object.keys(LAB).map(k => `<span><i style="background:${COL[k]}"></i>${esc(LAB[k])}</span>`).join('') + '<span><i class="reg"></i>Target region (no public store list)</span>';
  const VIEWS = { 0: [[24, -125], [50, -66]], 1: [[25.5, -82], [42, -71]], 2: [[25.5, -100], [48, -69]], 3: [[24, -125], [50, -66]], 4: [[-42, -100], [58, 155]] };
  let map = null, layer = null;
  if (window.L) {
    map = L.map('map', { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors', maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16, pane: 'shadowPane', opacity: .9 }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  const LABELS = {
    markdown_share: 'Markdown share of live variants', swim_return_rate: 'Swim return rate', ebitda_margin: 'EBITDA margin', harboros_spend: 'HarborOS spend',
    wholesale_doors: 'Wholesale doors', wholesale_share_of_revenue: 'Wholesale share of revenue', collegiate_schools: 'Collegiate schools licensed', revenue: 'Net revenue',
    repeat_purchase_rate: 'Repeat purchase rate', b2b_and_licensing_share_of_revenue: 'B2B and licensing share of revenue', international_share_of_revenue: 'International share of revenue',
    live_products: 'Live products', variants: 'Variants', variants_marked_down: 'Variants marked down', swim_return_rate_benchmark: 'Swim return rate (Loop benchmark)',
    womens_clearance_discount: "Women's clearance discount", new_products_2024_2025_2026: 'New products 2024 / 2025 / 2026', ebitda_margin_est_range: 'EBITDA margin (est. range)',
    apparel_comp_median_ebitda_margin: 'Apparel comp median EBITDA margin', nonswim_product_share: 'Non-swim share of products', swim_products: 'Swim products', kids_products: 'Kids products',
    golf_shop_products: 'Golf shop products', footjoy_collab_products: 'FootJoy collab products', collegiate_products: 'Collegiate products', specialty_doors_2022: 'Specialty doors (2022)',
    chubbies_wholesale_share: 'Chubbies wholesale share', chubbies_wholesale_growth: 'Chubbies wholesale growth', chubbies_dtc_growth: 'Chubbies DTC growth',
    repeat_rate_benchmark: 'Repeat-rate benchmark (Klaviyo)', klaviyo_flow_revenue_share: 'Klaviyo flows: share of email revenue', klaviyo_flow_send_share: 'Klaviyo flows: share of sends',
    bain_retention_profit_lift: 'Bain: profit lift from +5 pts retention', b2b_custom_skus: 'B2B custom SKUs', custom_embroidery_products: 'Custom embroidery products', site_pages_per_visit: 'Site pages per visit',
    us_traffic_share: 'US share of web traffic', vuori_intl_markets_2022: 'Vuori international markets (2022)', global_e_case_conversion_uplift: 'Global-e case: conversion uplift',
    chubbies_acq_price: 'Chubbies acquisition price', entry_ev_est: 'Entry EV (est.)', entry_ev_to_revenue_est: 'Entry EV / revenue (est.)', harboros_multiple_credit_x_revenue: 'HarborOS multiple credit',
    implied_exit_ev_usd_at_m36: 'Implied exit EV at M36',
  };
  const kind = k => /usd/.test(k) ? 'usd' : /pct/.test(k) ? 'pct' : /_x_|to_revenue/.test(k) ? 'x' : 'n';
  const one = (t, v) => t === 'usd' ? money(v) : t === 'pct' ? `${num(v, v % 1 ? 1 : 0)}%` : t === 'x' ? `${v}x` : num(v, v % 1 ? 1 : 0);
  const fmtK = (k, v) => { if (v == null) return '—'; const t = kind(k); if (Array.isArray(v)) { if (/2024_2025_2026/.test(k)) return v.join(' / '); return t === 'usd' ? `${money(v[0])}–${money(v[1])}` : `${num(v[0], v[0] % 1 ? 1 : 0)}–${one(t, v[1])}`; } return one(t, v); };
  const lab = k => LABELS[k] || LABELS[k.replace(/_usd$|_pct$/, '')] || sentence(k);
  // Revenue, margin and doors come off the KPI roadmap at the phase's start and end month, so the phases chain into the roadmap table.
  const ROAD = { revenue_usd: m => at(m, 'revenue_usd'), ebitda_margin_pct: m => +at(m, 'ebitda_margin_pct').toFixed(2), wholesale_doors: m => Math.round(at(m, 'locations_or_accounts')) - 2 };
  const ml = m => m === 0 ? 'today' : `M${m}`;
  const draw = idx => {
    tabsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.p === idx)));
    const ph = phases.find(p => p.phase === idx);
    if (ph) {
      const dp = Object.entries(ph.data_points || {}).filter(([, v]) => typeof v === 'number' || (Array.isArray(v) && typeof v[0] === 'number')).slice(0, 4);
      const { start: s0, end: s1 } = ph.months;
      const rows = Object.entries(ph.kpi_targets || {}).map(([k, v]) => {
        if (ROAD[k]) return [k, ROAD[k](s0), ml(s0), ROAD[k](s1), ml(s1)];
        return [k, v.baseline, v.baseline == null ? '' : 'today', v.target, ml(s1)];
      });
      panel.innerHTML = `<span class="sys-card-label">Phase ${ph.phase} · months ${s0}–${s1} · ${mDate(s0)} – ${mDate(s1)}</span><h3 class="sys-card-title">${esc(ph.name)}</h3><p class="sys-card-body">${esc(clean(ph.thesis))}</p><div class="sys-table-wrap"><table class="sys-table"><tbody>${rows.map(([k, b, bl, t, tl]) => `<tr><td>${esc(lab(k))}</td><td class="sys-n">${b == null ? '<small>not public</small>' : `${fmtK(k, b)} <small>${bl}</small>`} → <b>${fmtK(k, t)}</b> <small>${tl}</small></td></tr>`).join('')}</tbody><caption>Est. analyst assumptions, not company guidance. Revenue, margin and doors are read off the KPI roadmap (straight line between its 12-month points); the other targets are checkpoints on the lever paths below.</caption></table></div><div class="sys-chips">${(ph.geography || []).map(x => `<span class="sys-chip sys-chip--soft">${esc(x)}</span>`).join('')}</div>${dp.length ? `<p class="sys-src">Data points: ${dp.map(([k, v]) => `${esc(lab(k))} ${fmtK(k, v)}`).join(' · ')}</p>` : ''}`;
    } else {
      panel.innerHTML = `<span class="sys-card-label">All phases · months 0–36</span><h3 class="sys-card-title">The 36-month map</h3><p class="sys-card-body">Fix the base in New York and Florida, then add doors. Later phases use the customer file and open Canada, the UK and Australia.</p><div class="sys-table-wrap"><table class="sys-table"><tbody>${phases.map(p => `<tr><td>Phase ${p.phase}: ${esc(p.name)}</td><td class="sys-n">${mDate(p.months.start)} – ${mDate(p.months.end)}</td></tr>`).join('')}</tbody></table></div><p class="sys-src">Sponsors shown are those the private-equity landscape lists as most active near Fair Harbor's sector; ${esc(String(pe?.meta?.sector_heatmap?.fair_harbor?.note || '').replace(/^./, c => c.toLowerCase()))}</p>`;
    }
    if (!map) return;
    layer.clearLayers();
    REG.filter(r => idx === 0 || r.ph.includes(idx)).forEach(r => layer.addLayer(L.circle([r.lat, r.lon], { radius: r.km * 1000, color: T.co, weight: 1, dashArray: '4 4', fillColor: T.co, fillOpacity: r.km > 1000 ? .06 : .16 }).bindTooltip(esc(r.n), { className: 'fh-tip', sticky: true })));
    P.forEach(p => {
      const on = idx === 0 || p.ph.includes(idx);
      const m = L.circleMarker([p.lat, p.lon], { radius: p.r || (p.c === 'intl' ? 9 : p.c === 'own' ? 8 : 7), color: T.surface, weight: 2, fillColor: COL[p.c], fillOpacity: on ? .95 : .18, opacity: on ? 1 : .25 });
      m.bindTooltip(`<b>${esc(p.n)}</b>${p.sub ? `<br>${esc(p.sub)}` : ''}<br><span style="color:${T.mute}">${esc(p.s)}</span>`, { className: 'fh-tip', direction: 'top' });
      layer.addLayer(m);
    });
    map.fitBounds(VIEWS[idx] || VIEWS[0], { padding: [10, 10] });
  };
  tabsEl.innerHTML = `<button type="button" class="sys-chip" data-p="0">All phases</button>` + phases.map(p => `<button type="button" class="sys-chip" data-p="${p.phase}">Phase ${p.phase} · M${p.months.start}–${p.months.end}</button>`).join('');
  tabsEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) draw(+b.dataset.p); });
  const p0 = Math.max(0, Math.min(4, +QS.get('phase') || 0)); // deep link: ?phase=1..4
  draw(p0);
  if (map) { setTimeout(() => { map.invalidateSize(); map.fitBounds(VIEWS[p0] || VIEWS[0], { padding: [10, 10] }); }, 150); }
}

/* ── roadmap chart (inline SVG) ──────────────────────────────────────────── */
function drawRoad(road) {
  const W = 640, H = 240, pl = 52, pr = 48, pt = 16, pb = 44, svg = $('#roadchart');
  const maxR = Math.ceil(Math.max(...road.map(r => r.revenue_usd)) / 1e7) * 1e7, maxM = 15;
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / road.length * .5;
  const x = i => pl + iw / road.length * (i + .5), yR = v => pt + ih - v / maxR * ih, yM = v => pt + ih - v / maxM * ih;
  let s = '';
  for (let t = 0; t <= maxR; t += 1e7) s += `<line x1="${pl}" x2="${W - pr}" y1="${yR(t)}" y2="${yR(t)}" stroke="${T.line}"/><text x="${pl - 8}" y="${yR(t) + 4}" text-anchor="end" font-size="11" fill="${T.mute}" font-family="JetBrains Mono">$${t / 1e6}M</text>`;
  for (let t = 0; t <= maxM; t += 5) s += `<text x="${W - pr + 8}" y="${yM(t) + 4}" font-size="11" fill="${T.bad}" font-family="JetBrains Mono">${t}%</text>`;
  road.forEach((r, i) => { s += `<rect x="${x(i) - bw / 2}" y="${yR(r.revenue_usd)}" width="${bw}" height="${pt + ih - yR(r.revenue_usd)}" rx="6" fill="${r.month === 36 ? T.ink : T.co}" opacity="${r.month === 0 ? .55 : .9}"><title>Month ${r.month}: ${money(r.revenue_usd)} revenue</title></rect><text x="${x(i)}" y="${yR(r.revenue_usd) - 6}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${T.ink}" font-family="JetBrains Mono">${money(r.revenue_usd)}</text><text x="${x(i)}" y="${H - 18}" text-anchor="middle" font-size="11.5" fill="${T.mute}" font-family="Inter">${r.month === 0 ? 'Today' : 'M' + r.month}</text><text x="${x(i)}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="${T.mute}" font-family="Inter">${mDate(r.month)}</text>`; });
  s += `<polyline fill="none" stroke="${T.orange}" stroke-width="2.5" points="${road.map((r, i) => `${x(i)},${yM(r.ebitda_margin_pct)}`).join(' ')}"/>`;
  road.forEach((r, i) => { s += `<circle cx="${x(i)}" cy="${yM(r.ebitda_margin_pct)}" r="4.5" fill="${T.surface}" stroke="${T.orange}" stroke-width="2.5"><title>Month ${r.month}: ${r.ebitda_margin_pct}% EBITDA margin</title></circle><text x="${x(i) + bw / 2 + 6}" y="${yM(r.ebitda_margin_pct) + 4}" font-size="11.5" font-weight="700" fill="${T.bad}" stroke="${T.surface}" stroke-width="3" paint-order="stroke" font-family="JetBrains Mono">${r.ebitda_margin_pct}%</text>`; });
  svg.innerHTML = s;
}

/* ── returns calculator ─────────────────────────────────────────────────── */
function buildCalc(ra, ph4, m0, m36, { at, holdAt }) {
  const el = $('#calc');
  const entry = ph4?.data_points?.entry_ev_est_usd || [40e6, 90e6];
  const entryMid = (entry[0] + entry[1]) / 2;
  const entryMult = ph4?.data_points?.entry_ev_to_revenue_est || [1.3, 2.5];
  const credit = ra?.multiple_expansion_turns || [0.2, 0.5];
  const EXITS = [18, 24, 36];
  const st = { rev: m36.revenue_usd / 1e6, mult: +((entryMult[0] + entryMult[1]) / 2).toFixed(1), cr: +((credit[0] + credit[1]) / 2).toFixed(2), exit: 36 };
  const pctYr = (x, yrs) => (Math.pow(x, 1 / yrs) - 1) * 100;
  const sgn = v => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(1)}%`;
  el.innerHTML = `<span class="sys-card-label">Returns calculator</span><h3 class="sys-card-title">Returns and exit timing${EST}</h3><p class="sys-card-body">${esc(ra ? `HarborOS: ${range(ra.investment_usd, v => money(v))} investment, ${range(ra.time_to_value_months)} months to value, +${range(ra.ebitda_impact_pct_revenue)} pts of EBITDA margin (${range(ra.ebitda_impact_usd, v => money(v, 2))}/yr). Credit of ${range(credit)}x ${ra.multiple_basis}.` : 'HarborOS roadmap assumption not loaded.')}</p>
    <div class="pb-range"><span class="pb-sub" id="exit-lbl">Exit at</span><div class="sys-chips pb-exit" role="group" aria-labelledby="exit-lbl">${EXITS.map(m => `<button type="button" class="sys-chip" data-m="${m}" aria-pressed="${m === st.exit}">M${m} · ${mDate(m)}</button>`).join('')}</div></div>
    <div class="pb-range"><label for="c-rev">Month-36 revenue (M18 and M24 scale with it)</label><input id="c-rev" type="range" min="30" max="50" step="0.5" value="${st.rev}"><div class="row"><span>$30M</span><span id="o-rev"></span><span>$50M</span></div></div>
    <div class="pb-range"><label for="c-mult">Base EV / revenue (entry was an est. ${range(entryMult)}x)</label><input id="c-mult" type="range" min="1" max="3" step="0.1" value="${st.mult}"><div class="row"><span>1.0x</span><span id="o-mult"></span><span>3.0x</span></div></div>
    <div class="pb-range"><label for="c-cr">HarborOS multiple credit</label><input id="c-cr" type="range" min="0" max="0.5" step="0.05" value="${st.cr}"><div class="row"><span>0x</span><span id="o-cr"></span><span>0.5x</span></div></div>
    <div class="sys-kpis pb-calc-kpis" aria-live="polite"><div class="sys-kpi"><span class="sys-kpi-label">Exit EV (base + HarborOS)</span><span class="sys-kpi-value" id="o-ev"></span></div><div class="sys-kpi"><span class="sys-kpi-label">Of which HarborOS credit</span><span class="sys-kpi-value" id="o-hc"></span></div><div class="sys-kpi"><span class="sys-kpi-label">vs entry EV midpoint (${money(entryMid, 0)})</span><span class="sys-kpi-value" id="o-x"></span><span class="sys-kpi-sub" id="o-xs"></span></div><div class="sys-kpi"><span class="sys-kpi-label">vs today's mark at the same multiple</span><span class="sys-kpi-value" id="o-t"></span><span class="sys-kpi-sub" id="o-ts"></span></div></div>
    <p class="sys-src"><b>Source:</b> Fair Harbor growth plan and OS program evidence, Oct 2026. Entry EV ${range(entry, v => money(v, 0))} (est., about 1.3–2.5x 2021 revenue) and the multiples are analyst estimates. BSP entered in March 2022. EV only: equity MOIC and IRR need the stake, debt and fees, which are not public. Today's mark = today's est. revenue × the same base multiple, without HarborOS credit. Implied EV / exit EBITDA: <b id="o-ebx"></b>. A high read there means the revenue multiple is doing the work, and margin has to catch up for a strategic buyer to pay it.</p>`;
  $('#exit-box').innerHTML = `<span class="sys-card-label">Exit timing</span><h3 class="sys-card-title">Measured from entry and from today${EST}</h3><div class="sys-note sys-note--warn" aria-live="polite"><span id="o-verdict"></span></div>
    <div class="sys-table-wrap"><table class="sys-table"><thead><tr><th scope="col">Exit</th><th scope="col" class="sys-n">Years since entry</th><th scope="col" class="sys-n">Revenue</th><th scope="col" class="sys-n">Exit EV</th><th scope="col" class="sys-n">× entry EV</th><th scope="col" class="sys-n">%/yr since entry</th><th scope="col" class="sys-n">%/yr from today</th></tr></thead><tbody id="o-tbl"></tbody><caption>Source: Fair Harbor growth plan, Oct 2026. Rows follow the calculator settings above; M18 and M24 revenue follow the roadmap's shape. Analyst estimates.</caption></table></div>`;
  const r0 = m0.revenue_usd, rRoad36 = m36.revenue_usd;
  const revAt = m => r0 + (at(m, 'revenue_usd') - r0) * (st.rev * 1e6 - r0) / (rRoad36 - r0); // keep the roadmap's shape, scale its uplift
  const caseAt = m => { const rev = revAt(m), ev = rev * (st.mult + st.cr), yrs = holdAt(m), mark = r0 * st.mult; return { m, rev, ev, hc: rev * st.cr, yrs, xe: ev / entryMid, xt: ev / mark, ce: pctYr(ev / entryMid, yrs), ct: pctYr(ev / mark, m / 12), ebitda: rev * at(m, 'ebitda_margin_pct') / 100 }; };
  const upd = () => {
    st.rev = +$('#c-rev').value; st.mult = +$('#c-mult').value; st.cr = +$('#c-cr').value;
    $('#o-rev').textContent = `$${st.rev.toFixed(1)}M`; $('#o-mult').textContent = `${st.mult.toFixed(1)}x`; $('#o-cr').textContent = `+${st.cr.toFixed(2)}x`;
    const cs = EXITS.map(caseAt), c = cs.find(x => x.m === st.exit), c36 = cs.find(x => x.m === 36), c24 = cs.find(x => x.m === 24);
    $('#o-ev').textContent = money(c.ev); $('#o-hc').textContent = '+' + money(c.hc);
    $('#o-x').textContent = `${c.xe.toFixed(2)}x`; $('#o-xs').textContent = `${sgn(c.ce)}/yr over ${c.yrs.toFixed(1)} yrs`;
    $('#o-t').textContent = `${c.xt.toFixed(2)}x`; $('#o-ts').textContent = `${sgn(c.ct)}/yr over ${(c.m / 12).toFixed(1)} yrs`;
    $('#o-ebx').textContent = `${(c.ev / c.ebitda).toFixed(1)}x`;
    $('#o-tbl').innerHTML = cs.map(x => `<tr class="${x.m === st.exit ? 'hl' : ''}"><td>M${x.m} <small>${mDate(x.m)}</small></td><td class="sys-n">${x.yrs.toFixed(1)}</td><td class="sys-n">${money(x.rev)}</td><td class="sys-n">${money(x.ev)}</td><td class="sys-n">${x.xe.toFixed(2)}x</td><td class="sys-n">${sgn(x.ce)}</td><td class="sys-n">${sgn(x.ct)}</td></tr>`).join('');
    const weak = c.ce < 8;
    $('#o-verdict').innerHTML = `<b>${weak ? 'Measured from entry, this is a weak result.' : 'Measured from entry, this clears a modest bar.'}</b> ${money(c.ev)} is ${c.xe.toFixed(2)}x the est. entry EV midpoint over ~${c.yrs.toFixed(1)} years since March 2022, about ${sgn(c.ce)} a year of EV growth before fees or leverage. That is because, on our estimate, revenue today is below entry scale. From today's mark the plan earns ${sgn(c.ct)} a year. <b>The trade-off:</b> selling at M24 on the wholesale story earns ${sgn(c24.ct)}/yr on the remaining hold but returns ${c24.xe.toFixed(2)}x entry. Holding to M36 for international and margin adds ${money(c36.ev - c24.ev)} of EV and returns ${c36.xe.toFixed(2)}x, at ${sgn(c36.ct)}/yr.`;
  };
  el.querySelectorAll('input').forEach(i => i.addEventListener('input', upd));
  el.querySelector('.pb-exit').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (!b) return; st.exit = +b.dataset.m; el.querySelectorAll('.pb-exit button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); upd(); });
  upd();
}

/* ── chat ───────────────────────────────────────────────────────────────── */
function mountChat(ctx) {
  const faq = [];
  if (ctx) {
    const { pb, m0, m36, ag, ra, clean } = ctx;
    const ph = (pb.items || []).filter(i => i.kind === 'expansion_phase');
    faq.push({ q: 'What is the Fair Harbor growth thesis?', href: 'growth-plan.html#template', a: `<p><b>${esc(pb.meta.thesis)}</b></p><ul>${ph.map(p => `<li><b>Phase ${p.phase} (months ${p.months.start}–${p.months.end}):</b> ${esc(p.name)}</li>`).join('')}</ul><p>The Smith + Howard lesson: buyers pay for a scaled, legible company, so the exit story is wholesale breadth, repeat-customer economics and margin. <span class="ch-badge">est.</span></p>` });
    faq.push({ q: 'What are the month-36 KPI targets for Fair Harbor?', href: 'growth-plan.html#financing', a: `<p>Analyst assumptions, not company guidance:</p><table><thead><tr><th>KPI</th><th>Today</th><th>Month 36</th></tr></thead><tbody><tr><td>Revenue</td><td class="n">${money(m0.revenue_usd, 0)}</td><td class="n">${money(m36.revenue_usd, 0)}</td></tr><tr><td>EBITDA</td><td class="n">${money(m0.ebitda_usd)} (${m0.ebitda_margin_pct}%)</td><td class="n">${money(m36.ebitda_usd)} (${m36.ebitda_margin_pct}%)</td></tr><tr><td>Doors + stores</td><td class="n">${m0.locations_or_accounts}</td><td class="n">${m36.locations_or_accounts}</td></tr><tr><td>Revenue / employee</td><td class="n">${money(m0.revenue_per_employee_usd)}</td><td class="n">${money(m36.revenue_per_employee_usd)}</td></tr></tbody></table>` });
    faq.push({ q: 'How is the Fair Harbor plan financed?', href: 'growth-plan.html#financing', a: `<p>Capital-light. Operating cash or ABL headroom funds HarborOS (${ra ? range(ra.investment_usd, v => money(v)) : '$0.3–0.7M'} est.), with a small sponsor follow-on as the backstop, and an ABL of roughly <b>$3.4–4.6M</b> (est.) carries the seasonal swim build and wholesale receivables. No term debt until EBITDA clears ~$4–5M: Solo Brands' $100M Chubbies term loan is the cautionary precedent.</p><p>The 2022 Form D ($30.7M sold of $36.7M offered) is history, not available capital.</p>` });
    faq.push({ q: 'Which AI agents does HarborOS run for Fair Harbor?', href: 'growth-plan.html#agents', a: `<p>${ag.length} agents, an est. ${ra ? range(ra.investment_usd, v => money(v)) : '$0.3–0.7M'} build (vendor claims are upper bounds):</p><ul>${ag.map(a => `<li><b>${esc(a.agent)}</b> — ${esc(clean(a.who_it_helps))}; ${a.weeks_to_deploy ? `${a.weeks_to_deploy[0]}–${a.weeks_to_deploy[1]} weeks` : ''}</li>`).join('')}</ul>` });
  }
  try {
    Frame.mount({}).setChat(Chat.mount(null, { persona: 'fh', short_name: 'Fair Harbor', mode: 'floating', theme: 'light', name: 'Fair Harbor helper', faq, suggestions: faq.map(f => f.q) }));
  } catch (e) { console.warn('Chat widget did not mount:', e.message); }
}
