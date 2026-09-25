/* Shared, higher-level components used by several modules (targets, filings, opportunities). */
import { esc } from './core.js?v=20260924203049';

const num = v => (v == null || isNaN(v)) ? null : Number(v);
const fmtFig = x => x == null ? '—' : typeof x === 'number' ? x.toLocaleString() : typeof x === 'object' ? (Array.isArray(x) ? x.map(fmtFig).join(', ') : Object.entries(x).map(([k, v]) => `${k} ${fmtFig(v)}`).join('; ')) : String(x);
export const fitTierOf = s => s >= 80 ? 'Tier 1' : s >= 65 ? 'Tier 2' : s >= 50 ? 'Tier 3' : 'Tier 4';

/** M&A target screen: filters + table + inspector. items follow the ma_targets_* schema. */
export function renderTargets(ctx, el, { items, color, platformLabel, exportName = 'targets', extraColumns = [], pageSize = 40 }) {
  const { ui, fmt, inspector, app } = ctx;
  items = items.map(t => ({ ...t, fit_score: num(t.fit_score), employees: num(t.employees), revenue_est_usd: num(t.revenue_est_usd), _tier: fitTierOf(num(t.fit_score) || 0), _state: t.state || t.hq_state || '' }));
  const states = [...new Set(items.map(t => t._state).filter(Boolean))].sort();
  const owners = [...new Set(items.map(t => t.ownership).filter(Boolean))].sort();
  el.innerHTML = `<div id="tg-filters"></div><div id="tg-table"></div>`;
  let tbl;
  const apply = st => {
    const q = (st.q || '').toLowerCase();
    const rows = items.filter(t => (!st.state || t._state === st.state) && (!st.tier || t._tier === st.tier) && (!st.own || t.ownership === st.own) && (!q || JSON.stringify(t).toLowerCase().includes(q)));
    f.setCount(`${rows.length} / ${items.length}`); tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#tg-table'), { columns, rows, pageSize, sortKey: 'fit_score', exportName, onRow: open }));
  };
  const f = ui.filters(el.querySelector('#tg-filters'), [
    { key: 'q', label: 'Search company, city, specialty…', type: 'search', value: ctx.params?.q || '' },
    { key: 'state', label: 'State', options: states }, { key: 'tier', label: 'Fit', options: ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'] }, { key: 'own', label: 'Ownership', options: owners },
  ], apply);
  const columns = [
    { key: 'fit_score', label: 'Fit', num: true, fmt: v => fmt.score(v), width: '90px' },
    { key: 'company', label: 'Company', fmt: (v, r) => `<b>${esc(v)}</b>${r.brands_or_franchise ? `<div class="dim small">${esc(r.brands_or_franchise)}</div>` : ''}` },
    { key: '_state', label: 'HQ', fmt: (v, r) => `${esc(r.hq_city || '')}${r.hq_city ? ', ' : ''}${esc(v)}` },
    { key: 'employees', label: 'Staff', num: true, fmt: v => fmt.num(v) },
    { key: 'revenue_est_usd', label: 'Rev. est.', num: true, fmt: v => fmt.money(v) },
    { key: 'ownership', label: 'Ownership', fmt: v => v ? fmt.chip(v, v === 'pe' ? 'var(--red)' : v === 'founder' || v === 'family' ? 'var(--green)' : 'var(--muted)') : '—' },
    { key: 'specialties', label: 'Specialties / trades', fmt: (v, r) => fmt.list(v || r.trades || r.offerings || [], 3) },
    ...extraColumns,
    { key: 'strategic_rationale', label: 'Why', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 140))}</span>` },
  ];
  function open(t) {
    const fb = t.fit_breakdown || {};
    inspector.open({ title: esc(t.company), sub: `${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)} · ${platformLabel || ''} add-on candidate`, color,
      sections: [
        { label: 'Fit', html: `<div class="row gap-12"><div class="kpi grow" style="--kc:${color}"><div class="label">Fit score</div><div class="value">${t.fit_score ?? '—'}</div><div class="sub">${esc(t._tier)}</div></div></div>${Object.keys(fb).length ? (() => { const vals = Object.values(fb).map(num).filter(x => x != null); const scale = Math.max(...vals, 0) <= 5 ? 20 : Math.max(...vals, 0) <= 10 ? 10 : 1; return `<div class="mt-8">${ctx.charts.hbar(Object.entries(fb).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: Math.round((num(v) || 0) * scale) })), { max: 100, fmt: v => v, labelW: 130, color })}</div>`; })() : ''}` },
        { label: 'Profile', html: ui.kv({ Founded: t.founded_year, Employees: fmt.num(t.employees), 'Revenue (est.)': t.revenue_est_usd ? `${fmt.money(t.revenue_est_usd)} <span class="dim small">${esc(t.revenue_source || '')}</span>` : null, Ownership: t.ownership, Brands: t.brands_or_franchise, Specialties: t.specialties || t.trades || t.offerings, 'End markets': t.end_markets || t.customer_segments, Geography: t.geography_served, Reviews: t.review_count ? `${fmt.num(t.review_count)} · ${t.review_rating || ''}★` : null, 'Distance (Lancaster)': t.distance_mi_from_lancaster ? `${t.distance_mi_from_lancaster} mi` : null, 'Distance (Toms River)': t.distance_mi_from_toms_river ? `${t.distance_mi_from_toms_river} mi` : null, Website: t.website ? fmt.link(t.website) : null, 'ZoomInfo ID': t.zoominfo_id }) },
        { label: 'Strategic rationale', html: `<div class="small text-2">${esc(t.strategic_rationale || '')}</div>` },
        t.risk_flags?.length ? { label: 'Risk flags', html: t.risk_flags.map(r => fmt.chip(r, 'var(--amber)')).join(' ') } : null,
        { label: 'Sources', html: `<div class="col gap-4 small">${(t.sources || []).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(fmt.host(s) || s)}</a>`).join('') || '—'}</div><div class="dim small mt-8">Retrieved ${esc(t.retrieved || '')}</div>` },
        { label: 'Next action', html: `<div class="small text-2">Log in deal pipeline → owner outreach via PRG → request 3-yr financials + customer concentration → indicative valuation at sector multiple (see Filings & Financials).</div>` },
      ].filter(Boolean),
      actions: [t.website ? { label: 'Website ↗', href: t.website } : null, { id: 'csv', label: 'Export shortlist', onClick: () => ui.exportCSV(tbl.rows, columns.filter(c => !c.key.startsWith('_')), exportName) }].filter(Boolean) });
  }
  apply(f.state);
  app.index(items.slice(0, 300).map(t => ({ label: t.company, sub: `${platformLabel || ''} target · ${t.hq_city || ''} ${t._state}`, href: location.hash.split('?')[0] + `?q=${encodeURIComponent(t.company)}`, kind: 'Target', color })));
  return { rows: () => tbl?.rows || items };
}

/** Filings & financial-data view for one entity dataset (pp_filings, cet_filings, …). */
export function renderFilings(ctx, el, { data, color, title }) {
  const { ui, fmt } = ctx;
  if (!data) { el.innerHTML = ui.note(`Filings dataset for ${esc(title || 'this company')} is not available yet.`, 'warn'); return; }
  const m = data.meta || {}; const items = data.items || [];
  const cats = [...new Set(items.map(i => i.category))];
  const est = m.estimate_table || [];
  el.innerHTML = `
    <div class="grid grid-main">
      ${ui.panel({ title: 'Financial picture', sub: 'Synthesis from public filings and datasets — estimates, not audited figures', body: `<div class="prose">${esc(m.financial_picture || 'No synthesis available.')}</div>`, accent: true, foot: `<span class="dim">${esc((Array.isArray(m.sources_summary) ? m.sources_summary : []).slice(0, 6).map(x => typeof x === 'string' ? x : (x && (x.source || x.name || x.portal)) || JSON.stringify(x)).join(' · '))}</span>` })}
      ${ui.panel({ title: 'Estimate table', sub: 'Metric · estimate · basis · confidence', body: est.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Metric</th><th>Estimate</th><th>Basis</th><th>Conf.</th></tr></thead><tbody>${est.map(e => `<tr><td class="wrap">${esc(e.metric)}</td><td class="num wrap">${esc(e.estimate)}</td><td class="wrap small text-2">${esc(e.basis)}</td><td>${fmt.chip(e.confidence, e.confidence === 'high' ? 'var(--green)' : e.confidence === 'medium' ? 'var(--amber)' : 'var(--dim)')}</td></tr>`).join('')}</tbody></table></div>` : ui.empty('No estimates') })}
    </div>
    <div class="mt-12" id="fil-filters"></div><div id="fil-table"></div>
    <div class="grid grid-2 mt-12">
      ${ui.panel({ title: 'Data gaps', body: `<ul class="prose">${(Array.isArray(m.data_gaps) ? m.data_gaps : []).map(g => `<li>${esc(g)}</li>`).join('') || '<li>—</li>'}</ul>` })}
      ${ui.panel({ title: 'Next pulls (paid tools / diligence)', body: `<ul class="prose">${(Array.isArray(m.next_pulls) ? m.next_pulls : []).map(g => `<li>${esc(g)}</li>`).join('') || '<li>—</li>'}</ul>` })}
    </div>`;
  const columns = [
    { key: 'category', label: 'Category', fmt: v => fmt.chip(String(v || '').replace(/_/g, ' '), color) },
    { key: 'entity', label: 'Entity' },
    { key: 'title', label: 'Filing / record', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.filer_or_source_agency || '')}</div>` },
    { key: 'filed_or_dated', label: 'Date', num: true },
    { key: 'key_figures', label: 'Key figures', wrap: true, fmt: v => `<span class="num small">${esc(typeof v === 'object' && v ? Object.entries(v).slice(0, 5).map(([k, x]) => `${k}: ${fmtFig(x)}`).join(' · ') : (v || ''))}</span>` },
    { key: 'confidence', label: 'Conf.', fmt: v => fmt.chip(v, v === 'high' ? 'var(--green)' : v === 'medium' ? 'var(--amber)' : 'var(--dim)') },
    { key: 'source_url', label: 'Source', fmt: v => fmt.link(v) },
  ];
  let tbl;
  const f = ui.filters(el.querySelector('#fil-filters'), [{ key: 'q', label: 'Search filings…', type: 'search' }, { key: 'cat', label: 'Category', options: cats }], st => { const q = (st.q || '').toLowerCase(); const rows = items.filter(i => (!st.cat || i.category === st.cat) && (!q || JSON.stringify(i).toLowerCase().includes(q))); f.setCount(`${rows.length} / ${items.length}`); tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#fil-table'), { columns, rows, pageSize: 30, exportName: 'filings', onRow: openF })); });
  function openF(i) { ctx.inspector.open({ title: esc(i.title), sub: `${esc(i.entity || '')} · ${esc(i.filer_or_source_agency || '')} · ${esc(i.filed_or_dated || '')}`, color, sections: [{ label: 'Key figures', html: ui.kv(Object.fromEntries(Object.entries(i.key_figures || {}).map(([k, v]) => [k, esc(fmtFig(v))]))) }, { label: 'What it tells us', html: `<div class="small text-2">${esc(i.what_it_tells_us || '')}</div>` }, { label: 'Source', html: `${fmt.link(i.source_url, i.source_url)}<div class="dim small mt-8">Confidence ${esc(i.confidence)} · retrieved ${esc(i.retrieved || '')}</div>` }], actions: [i.source_url ? { label: 'Open source ↗', href: i.source_url } : null].filter(Boolean) }); }
  f.state && (function () { const q = ''; const rows = items; f.setCount(`${rows.length} / ${items.length}`); tbl = ui.table(el.querySelector('#fil-table'), { columns, rows, pageSize: 30, exportName: 'filings', onRow: openF }); })();
}

/** Generic opportunity list + map for CET/BPI/FH style items ({title, owner_or_agency, state, city, lat, lon, due_date, est_value_usd, fit_score, source_url}). */
export function opportunityCard(ctx, o, color) {
  const { fmt } = ctx; const d = fmt.days(o.due_date);
  return { id: o.id, color, title: `${esc(o.title)}`, sub: `${esc(o.owner_or_agency || o.agency || '')} · ${esc(o.city || o.city_or_county || '')}${o.state ? ', ' + esc(o.state) : ''}`, chips: `${o.type ? fmt.chip(String(o.type).replace(/_/g, ' ')) : ''}${o.est_value_usd || o.estimated_value_m ? fmt.chip(o.est_value_usd ? fmt.money(o.est_value_usd) : `$${o.estimated_value_m}M`, 'var(--green)') : ''}${o.due_date ? fmt.chip(`due ${fmt.dateShort(o.due_date)}${d != null ? ` (${d}d)` : ''}`, d != null && d < 14 ? 'var(--red)' : 'var(--amber)') : ''}${o.fit_score != null ? fmt.chip(`fit ${o.fit_score}`, fmt.scoreColor(o.fit_score)) : o.cet_fit ? fmt.chip(`fit ${o.cet_fit}`) : ''}` };
}
