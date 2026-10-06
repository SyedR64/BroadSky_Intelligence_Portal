/* How Broad Sky buys · methodology page renderer. Shared logic lives in modules/bsp-lib.js (also used by the portal module).
   Prepared by Syed Rahman. */
import {
  loadBundle, esc, PLATFORMS, PORDER, sellerLabel, DEAL_TYPE, STRENGTH, TESTS, isTargetTest, critShort, TYPE_LABEL,
  stripSVG, graphSVG, legendHTML, bindGraph, nodeDetail, introFor, nextFive, firstCallScript, buildFaq,
  fmtMonth, fmtDay, monthsBetween, clip, host, estHTML,
} from '../modules/bsp-lib.js?v=20261006134218';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const n1 = v => v == null || isNaN(v) ? '—' : Number(v).toFixed(1);
const PCOL = { pp: 'var(--co-pp)', cet: 'var(--co-cet)', fl: 'var(--co-fl)', ts: 'var(--co-ts)', bpi: 'var(--co-bpi)', fh: 'var(--co-fh)', sh: 'var(--sys-mute)' };
const co = p => PLATFORMS[p]?.co ? ` data-co="${PLATFORMS[p].co}"` : p ? ' style="--co:var(--sys-mute);--co-ink:var(--sys-ink-2);--co-soft:var(--sys-bg-2)"' : '';
const pchip = p => p ? `<span class="sys-chip sys-chip--soft"${co(p)}>${esc(PLATFORMS[p].short)}</span>` : '—';
const link = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || host(u))}</a>` : '—';
const DT = { ...DEAL_TYPE, platform: 'Anchor acquisition' };
/* ISO dates in dataset text → words (Oct 29, 2024) */
const wd = v => String(v ?? '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+mo - 1] || mo} ${+d}, ${y}`);
const money = v => v == null ? '—' : `$${(v / 1e6).toFixed(1)}M`;
const SRC_METH = '<b>Source:</b> Broad Sky acquisition methodology, built from primary press releases, SEC Form D and Form ADV filings and lender schedules, retrieved Oct 2026.';
const SRC_NET = '<b>Source:</b> Broad Sky professional network, public professional roles from firm websites, releases and SEC filings, retrieved Oct 2026.';
const SRC_POOL = '<b>Source:</b> add-on target screens for Punctual Pros, CET, Frontline and Thomas Scientific (Sept 2026), scored with the inferred Broad Sky rubric.';
const GATE_CLS = { Priority: 'good', 'Watch list': 'warn', Pass: 'mute', 'Held out': 'bad' };

export async function boot() {
  const b = await loadBundle(n => fetch(`../data/research/${n}.json`, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));
  if (!b.meth) { $('#kpis').innerHTML = '<div class="sys-note sys-note--warn"><span>The methodology dataset is not available yet.</span></div>'; return null; }
  renderKpis(b); renderNarrative(b); renderDeals(b); renderPatterns(b); renderRubric(b); renderCadence(b); renderNetwork(b); renderNext(b);
  return { faq: buildFaq(b, ''), intents: intents(b) };
}

/* ── hero KPIs ── */
function renderKpis(b) {
  const c = b.cadence;
  const k = (label, value, sub) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${esc(label)}</span><span class="sys-kpi-value">${value}</span><span class="sys-kpi-sub">${sub}</span></div>`;
  $('#kpis').innerHTML = [
    k('Companies', c.platforms, `${c.pePlatforms} bought from other sponsors, ${c.platforms - c.pePlatforms} from founders or partners`),
    k('Add-ons', c.addonsStated ?? '—', `${c.addonsNamed} identified by name; none from a private-equity seller`),
    k('Months between companies', n1(c.medianGap), 'Median, Jan 2022 to Feb 2025'),
    k('Months to first add-on', n1(c.medianFirst), 'Median across five companies'),
  ].join('');
  $('#kpi-src').innerHTML = SRC_METH;
}

/* ── narrative ── */
function renderNarrative(b) {
  const nar = b.meth.meta?.methodology_narrative || [];
  const W = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
  $('#nar-lead').textContent = `${W[nar.length] || nar.length} observations, each traceable to a press release or a filing. Weights and strengths are analyst inference from the public record, not Broad Sky’s internal criteria.`;
  $('#nar').innerHTML = `<ol class="mx-nar-list">${nar.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('#nar-src').innerHTML = SRC_METH;
}

/* ── deals ── */
function dealDetail(b, d) {
  const P = PLATFORMS[d._p]; const plat = b.deals.find(x => x.deal_type === 'platform' && x._p === d._p);
  const timing = d.deal_type === 'add_on' && plat ? `${n1(monthsBetween(plat.date, d.date))} months after the anchor deal` : d.deal_type === 'exit' && plat ? `${n1(monthsBetween(plat.date, d.date))}-month hold` : null;
  const v = d.co_invest_vehicle?.vehicles || [];
  const row = (k, val) => val ? `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>` : '';
  return `<article class="sys-card mx-deal-card"${co(d._p)}>
    <div class="mx-deal-h"><div><p class="sys-card-label"><span class="sys-dot" aria-hidden="true"></span>${esc(DT[d.deal_type] || 'Deal')} · ${esc(P?.short || 'Broad Sky')} · ${esc(fmtDay(d.date))}</p><h3 class="sys-card-title">${esc(d.company)}</h3>${d.hq ? `<p class="sys-muted">${esc(d.hq)}${d.sector ? ` · ${esc(d.sector)}` : ''}</p>` : ''}</div><button class="sys-btn sys-btn--ghost sys-btn--sm" type="button" data-close>Close</button></div>
    ${d.rationale_quoted ? `<blockquote class="mx-quote">${esc(d.rationale_quoted)}</blockquote>` : ''}
    <dl class="mx-dl">
      ${row('Seller', `${esc(sellerLabel(d.seller_type))}${d.seller ? ` · ${esc(d.seller)}` : ''}`)}
      ${row('Timing', timing ? esc(timing) : '')}
      ${row('Buy-side advisers', esc(d.buyer_advisor || 'Not disclosed'))}
      ${row('Sell-side advisers', esc(d.seller_advisor || 'Not disclosed'))}
      ${row('Lenders and capital', esc(wd(d.lender_or_capital || 'Not disclosed')))}
      ${row('Co-invest vehicle', v.length ? v.map(x => `${esc(x.entity)}${x.amount_sold_usd != null ? ` (${money(x.amount_sold_usd)} sold)` : ''}`).join('; ') : 'None disclosed')}
      ${row('Structure', d.structure_notes ? esc(wd(d.structure_notes)) : '')}
      ${row('Size signals', d.size_signals ? estHTML(esc(wd(d.size_signals))) : '')}
    </dl>
    <p class="sys-src"><b>Source:</b> ${link(d.source_url, host(d.source_url))}, retrieved ${esc(wd(d.retrieved || '—'))}.</p>
  </article>`;
}
function renderDeals(b) {
  $('#strip').innerHTML = stripSVG(b, PCOL);
  const box = $('#deal-detail');
  const show = id => { const d = b.dealById.get(id); if (!d) return; box.innerHTML = dealDetail(b, d); $$('#strip .bsp-mk').forEach(m => m.classList.toggle('sel', m.dataset.deal === id)); $$('#deal-table tbody tr').forEach(r => r.classList.toggle('sel', r.dataset.deal === id)); $('[data-close]', box).onclick = () => { box.innerHTML = ''; $$('.sel', $('#deals')).forEach(x => x.classList.remove('sel')); }; };
  $$('#strip .bsp-mk').forEach(m => { m.addEventListener('click', () => show(m.dataset.deal)); m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(m.dataset.deal); } }); });
  const rows = b.deals;
  $('#deal-table').innerHTML = `<table class="sys-table mx-click"><caption>${SRC_METH} Select a row for the rationale.</caption><thead><tr><th>Date</th><th>Company</th><th>Portfolio company</th><th>Type</th><th>Seller</th><th>Buy-side advisers</th><th>Lenders</th><th>Co-invest vehicle</th></tr></thead><tbody>${rows.map(d => `<tr data-deal="${esc(d.id)}" tabindex="0"><td class="sys-n">${esc(fmtMonth(d.date))}</td><td><b>${esc(d.company)}</b></td><td>${pchip(d._p)}</td><td>${esc(DEAL_TYPE[d.deal_type])}</td><td>${esc(sellerLabel(d.seller_type))}</td><td>${esc(clip(d.buyer_advisor || '—', 60))}</td><td>${esc(clip(wd(d.lender_or_capital || 'Not disclosed'), 70))}</td><td>${esc((d.co_invest_vehicle?.vehicles || []).map(v => v.entity).join(', ') || '—')}</td></tr>`).join('')}</tbody></table>`;
  $$('#deal-table tbody tr').forEach(tr => { const go = () => { show(tr.dataset.deal); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
}

/* ── patterns ── */
function renderPatterns(b) {
  let f = 'all';
  const draw = () => {
    const list = b.patterns.filter(p => f === 'all' || p.strength === f);
    const split = t => { const m = String(t).match(/^([^:.]{12,110})[:.]\s+(.*)$/s); return m ? [m[1], m[2]] : [clip(t, 110), t]; };
    $('#pat-grid').innerHTML = list.map(p => { const [h, rest] = split(p.pattern); const ev = (p.evidence_deal_ids || []).map(id => b.dealById.get(id)).filter(Boolean); return `<article class="sys-card mx-pat mx-pat--${esc(p.strength)}"><p class="sys-card-label"><span class="mx-str mx-str--${esc(p.strength)}">${esc(STRENGTH[p.strength] || p.strength)}</span> · ${ev.length} deals</p><h3 class="sys-card-title">${esc(h)}</h3><p class="mx-impl"><b>For the next deal:</b> ${esc(p.implication_for_next_deals || '—')}</p><details class="mx-more"><summary>The evidence</summary><p class="sys-card-body">${esc(rest)}</p><div class="mx-ev">${ev.map(d => `<button type="button" class="mx-evb"${co(d._p)} data-deal="${esc(d.id)}">${esc(clip(d.company, 30))}</button>`).join('')}</div><p class="sys-src">${(p.source_urls || [p.source_url]).filter(Boolean).slice(0, 3).map(u => link(u, host(u))).join(' · ')}</p></details></article>`; }).join('');
    $$('#pat-grid [data-deal]').forEach(btn => btn.onclick = () => { const d = b.dealById.get(btn.dataset.deal); $('#deal-detail').innerHTML = dealDetail(b, d); $('[data-close]', $('#deal-detail')).onclick = () => { $('#deal-detail').innerHTML = ''; }; $('#deals').scrollIntoView({ behavior: 'smooth' }); });
  };
  const opts = [['all', `All ${b.patterns.length}`], ['strong', `Strong ${b.patterns.filter(p => p.strength === 'strong').length}`], ['moderate', `Moderate ${b.patterns.filter(p => p.strength === 'moderate').length}`]];
  $('#pat-filter').innerHTML = opts.map(([v, l]) => `<button type="button" class="sys-chip" aria-pressed="${v === f}" data-v="${v}">${esc(l)}</button>`).join('');
  $$('#pat-filter button').forEach(btn => btn.onclick = () => { f = btn.dataset.v; $$('#pat-filter button').forEach(x => x.setAttribute('aria-pressed', x === btn)); draw(); });
  draw();
  const CT = { buy_side_banker: 'Buy-side bank', sell_side_banker: 'Sell-side banks', exit_banker: 'Exit banks', legal_counsel: 'Counsel', accounting_ma_consultant: 'Accounting M&A adviser', platform_relationship: 'Relationships', proprietary_search: 'Retained search', thematic_research: 'Thematic research', capital_partner: 'Capital partners' };
  $('#channels').innerHTML = `<table class="sys-table"><caption>${SRC_METH}</caption><thead><tr><th>Channel</th><th>Type</th><th class="sys-n">Deals</th><th>What it means</th></tr></thead><tbody>${b.channels.slice().sort((x, y) => y.deal_count - x.deal_count).map(s => `<tr><td><b>${esc(s.channel)}</b></td><td>${esc(CT[s.channel_type] || 'Other')}</td><td class="sys-n">${s.deal_count}</td><td>${esc(s.implication || '—')}</td></tr>`).join('')}</tbody></table>`;
}

/* ── rubric ── */
function renderRubric(b) {
  const crit = b.criteria.slice().sort((a, c) => c.weight_pct - a.weight_pct);
  const tag = c => isTargetTest(c.id) ? '<span class="mx-tag mx-tag--in">In the score</span>' : TESTS[c.id]?.tested === 'platform' ? '<span class="mx-tag">Portfolio company level</span>' : '<span class="mx-tag mx-tag--off">First call</span>';
  $('#weights').innerHTML = `<p class="sys-card-label">Inferred weights</p><ul class="mx-weights">${crit.map(c => `<li><details><summary><span class="mx-w-n">${esc(c.criterion)}</span><span class="mx-w-v sys-num">${c.weight_pct}%</span><span class="mx-w-bar" aria-hidden="true"><i style="width:${c.weight_pct / 15 * 100}%"></i></span>${tag(c)}</summary><p>${esc(c.test)}</p><p class="mx-bands">${Object.entries(c.scoring_bands || {}).sort((x, y) => y[0] - x[0]).map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join('')}</p><p class="sys-muted">${esc(TESTS[c.id]?.how || '')}</p></details></li>`).join('')}</ul><p class="sys-src">${SRC_METH} Weights are inferred from the deal record, not disclosed by Broad Sky.</p>`;
  const S = b.scored; const pools = PORDER.filter(p => S.rows.some(r => r._p === p));
  let pf = 'all', all = false;
  $('#rub-filter').innerHTML = [['all', 'All companies'], ...pools.map(p => [p, PLATFORMS[p].short])].map(([v, l]) => `<button type="button" class="sys-chip"${v === 'all' ? '' : co(v)} aria-pressed="${v === pf}" data-v="${v}">${esc(l)}</button>`).join('') + `<button type="button" class="sys-chip" data-all aria-pressed="false">Show all ${S.ranked.length}</button>`;
  const draw = () => {
    const list = S.ranked.filter(r => pf === 'all' || r._p === pf); const shown = all ? list : list.slice(0, 15);
    $('#scored').innerHTML = `<table class="sys-table"><caption>${SRC_POOL} ${shown.length} of ${list.length} shown.</caption><thead><tr><th class="sys-n">#</th><th>Target</th><th>Portfolio company</th><th class="sys-n">Broad Sky fit</th><th>Gate</th><th>Why it scores</th></tr></thead><tbody>${shown.map(r => `<tr><td class="sys-n">${r._rank}</td><td><b>${esc(r.company)}</b><div class="sys-muted mx-s">${esc([r.hq_city, r.state].filter(Boolean).join(', '))}</div></td><td>${pchip(r._p)}</td><td class="sys-n"><span class="mx-score"${co(r._p)}><i style="width:${r._score}%"></i></span>${r._score}</td><td><span class="mx-gate mx-gate--${GATE_CLS[r._gate]}">${esc(r._gate)}</span></td><td class="mx-why">${esc(r._explain)}</td></tr>`).join('')}</tbody></table>`;
  };
  $$('#rub-filter button[data-v]').forEach(btn => btn.onclick = () => { pf = btn.dataset.v; $$('#rub-filter button[data-v]').forEach(x => x.setAttribute('aria-pressed', x === btn)); draw(); });
  const ab = $('#rub-filter [data-all]'); ab.onclick = () => { all = !all; ab.setAttribute('aria-pressed', all); ab.textContent = all ? 'Top 15 only' : `Show all ${S.ranked.length}`; draw(); };
  draw();
  $('#rub-lead').textContent = `Each criterion scores 1 to 5. The Broad Sky fit score uses the five criteria the add-on screens can test per target, at their rubric weights, on a 0–100 scale. ${S.ranked.length} targets across ${pools.length} portfolio companies are scored live from the screens.`;
  $('#csv').onclick = () => {
    const cols = [['Rank', r => r._rank ?? ''], ['Target', r => r.company], ['Portfolio company', r => r._plat], ['City', r => r.hq_city || ''], ['State', r => r.state || ''], ['Broad Sky fit', r => r._score], ['Gate', r => r._gate], ['Full rubric with portfolio company context', r => r._full], ['Screen fit score', r => r.fit_score ?? ''], ...b.criteria.map(c => [`${c.criterion} (${c.weight_pct}%)`, r => r._crit[c.id]]), ['Why', r => r._explain], ['Intro path', r => { const ip = introFor(b, r); return ip ? `${ip.sourced ? ip.confidence : 'default'}: ${ip.names.filter(Boolean).join(' > ')}` : ''; }], ['Website', r => r.website || '']];
    const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [...S.ranked, ...S.rows.filter(r => r._affil)];
    const csv = [cols.map(c => cell(c[0])).join(','), ...rows.map(r => cols.map(c => cell(c[1](r))).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'broad-sky-fit-scored-pipeline.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
}

/* ── cadence ── */
function bars(list, max, unit) {
  return `<ul class="mx-barlist">${list.map(x => `<li${co(x.p)}><span class="mx-bl">${esc(x.label)}</span><span class="mx-bt" title="${esc(x.label)}: ${esc(n1(x.value))}${unit}"><i style="width:${Math.max(2, x.value / max * 100)}%"></i></span><span class="mx-bv sys-num">${n1(x.value)}${unit}</span></li>`).join('')}</ul>`;
}
function renderCadence(b) {
  const c = b.cadence;
  const k = (label, value, sub) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${esc(label)}</span><span class="sys-kpi-value">${value}</span><span class="sys-kpi-sub">${sub}</span></div>`;
  $('#cad-kpis').innerHTML = [
    k('Months between companies', n1(c.medianGap), `Median; mean ${n1(c.meanGap)} over ${c.gaps.length} intervals`),
    k('Months to first add-on', n1(c.medianFirst), 'Median of the five companies with an add-on'),
    k('Add-ons per company-year', n1(c.portfolioRate), `Portfolio; ${n1(c.activeRate)} median among active buyers`),
    k('Hold to first exit', `${n1(c.exitHold)} mo`, 'Smith + Howard, nine add-ons, to TPG Growth'),
  ].join('');
  const first = PORDER.map(p => c.firstAddon.find(f => f.p === p)).filter(f => f && f.months != null).map(f => ({ p: f.p, label: PLATFORMS[f.p].short, value: f.months }));
  $('#bars-first').innerHTML = bars(first, Math.max(...first.map(x => x.value)), ' mo');
  const wait = c.firstAddon.filter(f => f.months == null).map(f => `${PLATFORMS[f.p].short} (${n1(f.sinceMonths)} months)`);
  $('#bars-first-note').innerHTML = `${wait.length ? `No add-on yet: ${esc(wait.join(', '))}. ` : ''}<b>Source:</b> Broad Sky acquisition methodology, deal dates, Oct 2026.`;
  const rate = PORDER.map(p => c.rates.find(r => r.p === p)).filter(Boolean).map(r => ({ p: r.p, label: PLATFORMS[r.p].short, value: r.perYear }));
  $('#bars-rate').innerHTML = bars(rate, Math.max(...rate.map(x => x.value), 1), '');
}

/* ── network ── */
function renderNetwork(b) {
  const g = b.graph; if (!g) { $('#graph').innerHTML = '<div class="sys-note sys-note--warn"><span>The network dataset is not available yet.</span></div>'; return; }
  $('#graph').innerHTML = graphSVG(g); $('#legend').innerHTML = legendHTML();
  const node = $('#node');
  const showNode = n => {
    const det = nodeDetail(g, n);
    node.innerHTML = `<p class="sys-card-label">${esc(TYPE_LABEL[n.type] || '')}</p><h3 class="sys-card-title">${esc(n.name)}</h3><p class="sys-muted">${esc(n.title || '')}</p>${n.relevance_to_pipeline ? `<p class="mx-s"><b>Why it matters:</b> ${esc(n.relevance_to_pipeline)}</p>` : ''}<p class="sys-card-label mx-gap-s">Connections (${det.conns.length})</p><ul class="mx-conns">${det.conns.slice(0, 14).map(c => `<li><button type="button" class="mx-linkbtn" data-node="${esc(c.other.id)}">${esc(c.text)}</button><span>${esc(clip(c.e.evidence, 140))}</span></li>`).join('')}</ul>${det.paths.length ? `<p class="sys-card-label mx-gap-s">On intro paths to</p><ul class="mx-conns">${det.paths.map(p => `<li><span>${esc(p.target)}</span></li>`).join('')}</ul>` : ''}<p class="sys-src"><b>Sources:</b> ${det.sources.slice(0, 4).map(u => link(u, host(u))).join(' · ')}</p>`;
    $$('[data-node]', node).forEach(btn => btn.onclick = () => { const m = g.byId.get(btn.dataset.node); if (m) { ctl.select(m.id); showNode(m); } });
  };
  node.innerHTML = `<p class="sys-card-label">Select a node</p><h3 class="sys-card-title">${g.nodes.length} people and organizations</h3><p class="sys-card-body">${g.edges.length} sourced connections. ${esc((b.net.meta?.network_summary || [])[0] || '')}</p>`;
  const ctl = bindGraph($('#graph'), g, { onSelect: showNode });
  let t; $('#net-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { const k = ctl.search(e.target.value); $('#net-hits').textContent = e.target.value ? `${k} match${k === 1 ? '' : 'es'}` : ''; }, 160); };
  const top = nextFive(b, 6, 2).map(r => ({ r, ip: introFor(b, r) })).filter(x => x.ip);
  const plat = g.paths.filter(p => /^next_platform/.test(p.target_ref)).map(p => ({ r: null, ip: { sourced: true, ...p, names: p.path_node_ids.map(id => g.byId.get(id)?.name) } }));
  const sourcedTargets = g.paths.filter(p => !/^next_platform/.test(p.target_ref) && !top.some(x => x.ip.id === p.id)).map(p => { const id = String(p.target_ref).split('#')[1]; const r = b.scored.rows.find(x => x.id === id); return { r, ip: { sourced: true, ...p, names: p.path_node_ids.map(i => g.byId.get(i)?.name) } }; });
  const all = [...top, ...sourcedTargets, ...plat];
  let showAll = false;
  const drawPaths = () => { $('#paths').innerHTML = all.slice(0, showAll ? all.length : 9).map((x, i) => `<button type="button" class="sys-card mx-path"${x.r ? co(x.r._p) : ''} data-i="${i}"><span class="sys-card-label">${x.r ? `${esc(x.r._plat)} · ` : 'Next company · '}${x.ip.sourced ? `${esc(x.ip.confidence)} confidence` : 'default route'}${x.r?._affil ? ' · verify affiliation first' : ''}</span><span class="sys-card-title">${esc(x.r ? x.r.company : x.ip.target.replace(/^Next company:\s*/, ''))}</span><span class="mx-chain">${x.ip.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i aria-hidden="true">→</i>')}</span><span class="sys-card-body">${esc(clip(x.ip.path, 220))}</span></button>`).join('');
  $$('#paths .mx-path').forEach(btn => btn.onclick = () => { const x = all[Number(btn.dataset.i)]; $$('#paths .mx-path').forEach(y => y.setAttribute('aria-pressed', y === btn)); ctl.path(x.ip.path_node_ids); const last = g.byId.get(x.ip.path_node_ids[x.ip.path_node_ids.length - 1]); if (last) showNode(last); $('#graph').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  };
  drawPaths();
  const more = $('#paths-more'); if (more) { more.hidden = all.length <= 9; more.textContent = `Show all ${all.length} intro paths`; more.onclick = () => { showAll = !showAll; more.textContent = showAll ? 'Show fewer' : `Show all ${all.length} intro paths`; drawPaths(); }; }
  $('#net-src').innerHTML = SRC_NET + ' Intro paths are analyst constructions; none has been validated with the people involved.';
}

/* ── next five ── */
function renderNext(b) {
  const list = nextFive(b, 5, 2);
  $('#next-list').innerHTML = list.map((r, i) => { const ip = introFor(b, r); const sc = firstCallScript(b, r); return `<article class="sys-card mx-nx"${co(r._p)}>
    <div class="mx-nx-h"><span class="mx-nx-rank sys-num">${i + 1}</span><div><p class="sys-card-label"><span class="sys-dot" aria-hidden="true"></span>${esc(r._plat)} add-on · ${esc([r.hq_city, r.state].filter(Boolean).join(', '))}</p><h3 class="sys-card-title">${esc(r.company)}</h3></div><div class="mx-nx-score"><span class="sys-num">${r._score}</span><span>Broad Sky fit</span></div></div>
    <p class="sys-card-body">${esc(r._explain)}</p>
    <div class="mx-nx-grid">
      <div><p class="sys-card-label">Intro path · ${ip?.sourced ? `${esc(ip.confidence)} confidence` : 'default route'}</p>${ip ? `<span class="mx-chain">${ip.names.filter(Boolean).map(n => `<span>${esc(n)}</span>`).join('<i aria-hidden="true">→</i>')}</span><p class="mx-s">${esc(ip.path)}</p>` : '<p class="mx-s">—</p>'}
        <p class="sys-card-label mx-gap-s">Profile</p><p class="mx-s">${esc(r.ownership ? String(r.ownership).replace(/_/g, ' ') : '—')}${r.founded_year ? ` · founded ${r.founded_year}` : ''}${r.employees != null ? ` · ${r.employees} employees` : ''}${r.revenue_est_usd ? ` · ${money(r.revenue_est_usd)}<span class="sys-est">est.</span> revenue` : ''}</p>
        ${r.risk_flags?.length ? `<p class="sys-card-label mx-gap-s">Risk flags</p><ul class="mx-flags">${r.risk_flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      </div>
      <div><p class="sys-card-label">First-call script (draft)</p><ol class="mx-script">${sc.map(s => `<li><b>${esc(s.k)}.</b> ${esc(s.t)}</li>`).join('')}</ol></div>
    </div>
    <p class="sys-src"><b>Sources:</b> ${(r.sources || []).slice(0, 3).map(u => link(u, host(u))).join(' · ')}${ip?.sourced ? ` · intro: ${link(ip.source_url, host(ip.source_url))}` : ''}</p>
  </article>`; }).join('');
  $('#next-src').innerHTML = SRC_POOL + ' Revenue figures are modeled estimates. Scripts are drafts for the Portfolio Resource Group, not outreach that has happened.';
}

/* ── chat intents (run before the portal's own intents on this page) ── */
function intents(b) {
  const faq = buildFaq(b, '');
  const A = (q, rx) => (faq.find(f => f.q === q) || (rx && faq.find(f => rx.test(f.q))))?.a || '';
  const L = (h, t) => `<a class="ch-link" href="${esc(h)}">${esc(t)} →</a>`;
  const platIn = q => /punctual|pros|hvac|home/i.test(q) ? 'pp' : /\bcet\b|commonwealth|electric/i.test(q) ? 'cet' : /frontline|legal/i.test(q) ? 'fl' : /thomas|lab/i.test(q) ? 'ts' : null;
  return [
    { id: 'bsp_intro', rx: [/introduc|intro path|warm (path|intro)|who (in|from) the network|who (can|could|knows|should)/i], run: async q => {
      const p = platIn(q) || 'pp'; const r = b.scored.ranked.find(x => x._p === p); if (!r) return null; const ip = introFor(b, r);
      return { html: `<p>The top ${esc(PLATFORMS[p].short)} target on the Broad Sky rubric is <b>${esc(r.company)}</b> (${esc([r.hq_city, r.state].filter(Boolean).join(', '))}), Broad Sky fit <b>${r._score}</b>.</p>${ip ? `<p><b>${ip.sourced ? `Sourced path, ${esc(ip.confidence)} confidence` : 'Default route (no sourced path yet)'}:</b> ${esc(ip.names.filter(Boolean).join(' → '))}</p><p>${esc(ip.path)}</p>` : ''}<p>Intro paths are hypotheses over public connections, not known relationships.</p>`, links: [L('#next', 'The next five'), L('#network', 'Network map')] };
    } },
    { id: 'bsp_score', rx: [/rubric|score (the|my|our)? ?(pipeline|targets?)|broad sky fit|next (five|5)|top (targets?|add-?ons?)|pipeline/i], run: async q => {
      const p = platIn(q); const list = b.scored.ranked.filter(r => !p || r._p === p).slice(0, 5);
      return { html: `<p>Scored on the five criteria the add-on screens can test (owner readiness, size band, adjacency, fit with the company thesis, downside) at their inferred Broad Sky weights${p ? `, ${esc(PLATFORMS[p].short)} only` : ''}:</p><ol>${list.map(r => `<li><b>${esc(r.company)}</b> · ${esc(r._plat)} · ${r._score} (${esc(r._gate)}) — ${esc(clip(r._explain, 140))}</li>`).join('')}</ol><p>Gates: 70+ priority, 55–69 watch list. Download the full scored pipeline from the rubric section.</p>`, links: [L('#rubric', 'The rubric'), L('#next', 'The next five')] };
    } },
    { id: 'bsp_pattern', rx: [/acqui\w* (pattern|strateg|method|growth plan|approach)|how (does )?broad sky (buy|acquire|invest|do deals)|broad sky['’]?s? (pattern|method|strategy)|investment (pattern|strategy)/i], run: async () => ({ html: A('What is Broad Sky’s acquisition pattern?'), links: [L('#narrative', 'Narrative'), L('#patterns', 'Patterns')] }) },
    { id: 'bsp_cadence', rx: [/first add-?on|cadence|how (fast|often|quickly)|months between|pace/i], run: async () => ({ html: A('How long until the first add-on after an anchor deal?', /first add-on after/i), links: [L('#cadence', 'Cadence')] }) },
    { id: 'bsp_advisers', rx: [/bank(s|er)|advis[eo]r|lawyer|counsel|berenson|harris williams/i], run: async () => ({ html: A('Which banks and lawyers does Broad Sky use?'), links: [L('#patterns', 'Where the deals come from')] }) },
    { id: 'bsp_finance', rx: [/lend|financ|debt|co-?invest|spv|unitranche|capital constellation/i], run: async () => ({ html: A('How does Broad Sky finance its portfolio companies?', /how does broad sky finance/i), links: [L('#deals', 'Deal ledger')] }) },
    { id: 'bsp_ceo', rx: [/ceo|founders? (stay|leave)|management (stay|change)/i], run: async () => ({ html: A('Do founder CEOs stay after Broad Sky buys?'), links: [L('#patterns', 'Patterns')] }) },
    { id: 'bsp_size', rx: [/how big|deal size|check size|size band|ebitda/i], run: async () => ({ html: A('How big are the deals Broad Sky does?'), links: [L('#rubric', 'The rubric')] }) },
  ];
}
