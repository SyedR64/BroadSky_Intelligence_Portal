/* Command Center — portfolio-wide situational awareness */
const COS = [
  { id: 'cet', name: 'Commonwealth Electrical (CET)', short: 'CET', color: 'var(--c-cet)', hex: '#4c8dff', sector: 'Commercial electrical · solar · energy', hq: 'Worcester, MA', lat: 42.2626, lon: -71.8023, entry: '2025-02', addons: ['NuWave Energy Solutions (Oct 2025)', 'Horton Electrical Services (Sept 2026)'], footprint: 'Licensed in all 6 New England states', lever: 'Cross-sell Horton wastewater accounts into solar, storage & efficiency; win municipal/utility programs' },
  { id: 'pp', name: 'Punctual Pros', short: 'PP', color: 'var(--c-pp)', hex: '#f08a3c', sector: 'Residential HVAC · plumbing · electrical', hq: 'East Hempfield, PA', lat: 40.0629, lon: -76.3700, entry: '2024-04', addons: ['Horvath Home Services (Dec 2024)'], footprint: '~240 Central PA zips + Ocean/Monmouth NJ', lever: 'New-mover marketing, weather-driven capacity planning, tuck-in franchisees in adjacent counties' },
  { id: 'fl', name: 'Frontline Managed Services', short: 'FL', color: 'var(--c-fl)', hex: '#9d7bff', sector: 'Legal managed IT · revenue cycle', hq: 'St. Louis, MO', lat: 38.6270, lon: -90.1994, entry: '2024-12', addons: [], footprint: '800+ law firms · >50% of AM Law 200', lever: 'Expand into mid-size firms; bundle cyber + eBilling; add-on legal MSPs' },
  { id: 'ts', name: 'Thomas Scientific', short: 'TS', color: 'var(--c-ts)', hex: '#2ecc8f', sector: 'Lab supply distribution', hq: 'Swedesboro, NJ', lat: 39.7476, lon: -75.3105, entry: '2022-01', addons: [], footprint: 'National · 27k scored lab/hospital sites', lever: 'Target-account selling into diagnostics labs & hospital systems; regional distributor roll-ups' },
  { id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--c-bpi)', hex: '#e05c8a', sector: 'Communications · public affairs', hq: 'Washington, DC', lat: 38.9072, lon: -77.0369, entry: '2023-04', addons: [], footprint: 'DC · NYC · SF · Chicago · Europe', lever: 'Corporate reputation & AI-era comms demand; public-sector RFPs' },
  { id: 'fh', name: 'Fair Harbor', short: 'FH', color: 'var(--c-fh)', hex: '#3fd0e0', sector: 'Consumer · sustainable apparel', hq: 'New York, NY', lat: 40.7128, lon: -74.0060, entry: '2022-03', addons: [], footprint: 'DTC + wholesale', lever: 'Wholesale door expansion; category extension; retention' },
];

/* Dataset inventory snapshot (ls of data/research + data/sales, 2026-09-24). Row counts are refreshed at render time from
   data/manifest.json (legacy tables) and from any dataset this page already loaded; "Refresh live counts" re-reads every file. */
const DATA_FILES = [{"g":"research","n":"bpi_filings","co":"bpi","rows":23,"gen":"2026-09-24"},{"g":"research","n":"bsp_firm","co":"bsp","rows":6,"gen":"2026-09-24"},{"g":"research","n":"cet_filings","co":"cet","rows":25,"gen":"2026-09-24"},{"g":"research","n":"cet_opportunities","co":"cet","rows":86,"gen":"2026-09-24"},{"g":"research","n":"cet_wwtp_targets","co":"cet","rows":183,"gen":"2026-09-24"},{"g":"research","n":"fairharbor_filings","co":"fh","rows":25,"gen":"2026-09-24"},{"g":"research","n":"fl_midsize_firms","co":"fl","rows":143,"gen":"2026-09-24"},{"g":"research","n":"frontline_filings","co":"fl","rows":21,"gen":"2026-09-24"},{"g":"research","n":"ma_targets_cet","co":"ma","rows":48,"gen":"2026-09-24"},{"g":"research","n":"ma_targets_fl_ts","co":"ma","rows":48,"gen":"2026-09-24"},{"g":"research","n":"ma_targets_pp","co":"ma","rows":61,"gen":"2026-09-24"},{"g":"research","n":"pe_landscape","co":"pe","rows":35,"gen":"2026-09-24"},{"g":"research","n":"pp_demand_model","co":"pp","rows":54,"gen":"2026-09-24"},{"g":"research","n":"pp_filings","co":"pp","rows":29,"gen":"2026-09-24"},{"g":"research","n":"pp_market","co":"pp","rows":177,"gen":"2026-09-24"},{"g":"research","n":"pp_storm_events","co":"pp","rows":1575,"gen":"2026-09-24"},{"g":"research","n":"public_comps","co":"fin","rows":31,"gen":"2026-09-24"},{"g":"research","n":"rival_filings","co":"fin","rows":51,"gen":"2026-09-24"},{"g":"research","n":"thomas_filings","co":"ts","rows":31,"gen":"2026-09-24"},{"g":"sales","n":"bpi_sales_dc","co":"bpi","rows":8003,"res":7169,"gen":"2026-09-24","counties":["District of Columbia DC"]},{"g":"sales","n":"cet_home_sales_ct_ri","co":"cet","rows":31591,"res":31591,"gen":"2026-09-24","counties":["Fairfield CT","Hartford CT","Litchfield CT","Middlesex CT","New Haven CT","New London CT","Providence RI","Tolland CT","Windham CT"]},{"g":"sales","n":"cet_home_sales_ma","co":"cet","rows":14273,"res":14273,"gen":"2026-09-24","counties":["Bristol MA","Essex MA","Hampden MA","Hampshire MA","Middlesex MA","Norfolk MA","Plymouth MA","Suffolk MA","Worcester MA"]},{"g":"sales","n":"cet_transfers_ct_ri","co":"cet","rows":5816,"res":0,"gen":"2026-09-24","counties":["Fairfield CT","Hartford CT","Litchfield CT","Middlesex CT","New Haven CT","New London CT","Providence RI","Tolland CT","Windham CT"]},{"g":"sales","n":"cet_transfers_ma","co":"cet","rows":4317,"res":0,"gen":"2026-09-24","counties":["Bristol MA","Essex MA","Hampden MA","Hampshire MA","Middlesex MA","Norfolk MA","Plymouth MA","Suffolk MA","Worcester MA"]},{"g":"sales","n":"fh_sales_nyc","co":"fh","rows":19553,"res":17018,"gen":"2026-09-24","counties":["New York NY"]},{"g":"sales","n":"pp_sales_nj","co":"pp","rows":25486,"res":21478,"gen":"2026-09-24","counties":["Atlantic NJ","Burlington NJ","Monmouth NJ","Ocean NJ"]},{"g":"sales","n":"pp_sales_pa_a","co":"pp","rows":19822,"res":17099,"gen":"2026-09-24","counties":["Cumberland PA","Dauphin PA","Lancaster PA","York PA"]},{"g":"sales","n":"pp_sales_pa_b","co":"pp","rows":31941,"res":27214,"gen":"2026-09-24","counties":["Adams PA","Berks PA","Chester PA","Franklin PA","Lebanon PA","Montgomery PA","Perry PA"]},{"g":"sales","n":"ts_sales_gloucester_nj","co":"ts","rows":2936,"res":2936,"gen":"2026-09-24","counties":["Gloucester NJ"]}];
const CO_HEX = { cet: '#4c8dff', pp: '#f08a3c', fl: '#9d7bff', ts: '#2ecc8f', bpi: '#e05c8a', fh: '#3fd0e0', ma: '#f5b73d', pe: '#c9a0ff', fin: '#8bd3ff', bsp: '#d9622b' };
const CO_SHORT = { cet: 'CET', pp: 'PP', fl: 'FL', ts: 'TS', bpi: 'BPI', fh: 'FH', ma: 'M&A', pe: 'PE', fin: 'FIN', bsp: 'BSP' };
const LEGACY_CO = { cet_ne_counties: 'cet', cet_ne_development: 'cet', cet_ne_rfps: 'cet', cet_nyc_archive_summary: 'cet', pp_zips: 'pp', pp_sales_90d: 'pp', pp_meta: 'pp', fl_lawfirms: 'fl', ts_sites: 'ts', ts_parents: 'ts' };
/* bsp_firm.timeline company names → company colour */
const tlColor = c => { const s = String(c || ''); return /Commonwealth|CET|NuWave|Horton/i.test(s) ? CO_HEX.cet : /Punctual|Horvath/i.test(s) ? CO_HEX.pp : /Frontline/i.test(s) ? CO_HEX.fl : /Thomas/i.test(s) ? CO_HEX.ts : /Bully|BPI/i.test(s) ? CO_HEX.bpi : /Fair Harbor/i.test(s) ? CO_HEX.fh : /Smith/i.test(s) ? '#8a94a6' : CO_HEX.bsp; };
const mdy = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : (s || null); };

async function overview(ctx) {
  const { el, ui, fmt, data, maps, live, esc, app } = ctx;
  const [firm, rfps, zips, maCet, maPp, maFlTs, pe, cetOpp, manifest, alertsPA, alertsNJ, alertsMA, alertsCT] = await Promise.all([
    data.research('bsp_firm'), data.load('cet_ne_rfps').catch(() => []), data.load('pp_zips').catch(() => []),
    data.research('ma_targets_cet'), data.research('ma_targets_pp'), data.research('ma_targets_fl_ts'), data.research('pe_landscape'), data.research('cet_opportunities'),
    fetch('data/manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    live.nwsAlerts('PA').catch(() => []), live.nwsAlerts('NJ').catch(() => []), live.nwsAlerts('MA').catch(() => []), live.nwsAlerts('CT').catch(() => []),
  ]);
  if (!el.isConnected) return;
  // KPI definitions mirror the module views: CET overview (opportunities, bids due ≤60 d), M&A overview (targets screened), PE landscape (sponsors profiled)
  const opps = cetOpp?.items || [];
  const due = [...opps.filter(o => o.stage !== 'awarded').map(o => ({ ...o, _src: 'opp' })), ...rfps.map(r => ({ title: String(r.title || '').replace(/\s+/g, ' '), owner_or_agency: r.agency, state: r.state, due_date: mdy(r.due_date), _src: 'legacy' }))]
    .map(o => ({ ...o, _d: fmt.days(o.due_date) })).filter(o => o._d != null && o._d >= 0 && o._d <= 60).sort((a, b) => a._d - b._d);
  const targets = (maCet?.items?.length || 0) + (maPp?.items?.length || 0) + (maFlTs?.items?.length || 0);
  const alerts = [...alertsPA, ...alertsNJ, ...alertsMA, ...alertsCT];
  const sevAlerts = alerts.filter(a => /Extreme|Severe/.test(a.severity));
  const stats = firm?.firm?.stats || { platforms: 7, add_ons: 23, exits: 1 };
  const homeFiles = DATA_FILES.filter(d => d.g === 'sales' && d.res);
  const homeTotal = homeFiles.reduce((s, d) => s + d.res, 0);
  const homeCounties = new Set(homeFiles.flatMap(d => d.counties)).size;
  const homeCos = [...new Set(homeFiles.map(d => d.co))];

  el.innerHTML = ui.pageHead({
    title: 'Command Center',
    sub: `<b>So what:</b> Broad Sky Partners has ${COS.length} active platforms, ${stats.add_ons} add-ons to date and one realized exit (Smith + Howard → TPG, Aug 2026). This portal turns public and licensed data into revenue, M&A and operating actions for each portfolio company. This week: ${fmt.num(due.length)} CET bids fall due within 60 days, ${fmt.num(targets)} add-on targets are screened, and ${fmt.num(homeTotal)} home sales are on file for ${fmt.num(homeCounties)} counties the portfolio serves.`,
    actions: `<button class="btn brand" id="play-brief">▶ Play 4-minute briefing</button><a class="btn" href="#/ma">Acquisition engine</a><a class="btn" href="#/pe">PE landscape</a>`,
  }) +
  ui.kpis([
    { label: 'Active platforms', value: COS.length, sub: `${fmt.num(stats.add_ons)} add-ons · ${fmt.num(stats.exits)} exit`, color: 'var(--c-bsp)' },
    { label: 'CET opportunities tracked', value: cetOpp ? fmt.num(opps.length) : '—', sub: cetOpp ? `${fmt.num(due.length)} bids due ≤60 days${due[0] ? ` · next ${fmt.dateShort(due[0].due_date)}` : ''}` : 'dataset pending', color: 'var(--c-cet)' },
    { label: 'M&A targets screened', value: targets ? fmt.num(targets) : '—', sub: `CET ${maCet?.items?.length || 0} · PP ${maPp?.items?.length || 0} · FL+TS ${maFlTs?.items?.length || 0}`, color: 'var(--c-ma)' },
    { label: 'PE sponsors profiled', value: pe ? fmt.num(pe.items.length) : '—', sub: pe ? `${fmt.num(pe.items.filter(f => f.threat_level === 'high').length)} high-threat · funds · deals` : 'dataset pending', color: 'var(--c-pe)' },
    { label: 'Home sales on file', value: fmt.compact(homeTotal), sub: `${fmt.num(homeCounties)} counties · ${homeCos.map(c => CO_SHORT[c]).join(' · ')}`, color: 'var(--green)' },
    { label: 'Live NWS alerts', value: fmt.num(alerts.length), sub: `${fmt.num(sevAlerts.length)} severe/extreme · PA NJ MA CT`, color: sevAlerts.length ? 'var(--red)' : 'var(--green)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Portfolio footprint', sub: 'Headquarters, operating footprints and live weather alerts touching the territories', body: `<div class="map tall" id="home-map"></div>`, flush: true, foot: ui.source('Company filings & press; NWS alerts API', 'https://api.weather.gov', 'live') })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Platforms', sub: 'Click a company to open its module', body: `<div class="cards" id="co-cards">${COS.map(c => `<div class="card" data-id="${c.id}" style="--cc:${c.color}"><div class="t">${esc(c.name)}<span class="rk">${esc(c.entry)}</span></div><div class="s">${esc(c.sector)} · ${esc(c.hq)}</div><div class="m">${fmt.chip(c.footprint)}${c.addons.map(a => fmt.chip(a, c.hex)).join('')}</div></div>`).join('')}</div>` })}
    </div>
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Signals this week', sub: 'Bids due, live alerts, top-ranked add-ons and the latest sponsor deals', body: `<div id="signals">${ui.loading()}</div>`, foot: ui.source('cet_opportunities · NWS · ma_targets_* · pe_landscape', null, cetOpp?.meta?.generated || 'Sept 2026') })}
    ${ui.panel({ title: 'Value-creation levers by platform', sub: 'Where this portal points each management team', body: `<div class="col gap-8">${COS.map(c => `<div class="row" style="align-items:flex-start"><span class="chip solid" style="--cc:${c.hex};min-width:40px;justify-content:center">${c.short}</span><div class="small text-2">${esc(c.lever)}</div></div>`).join('')}</div>` })}
    ${ui.panel({ title: 'Broad Sky timeline', sub: 'Platforms, add-ons and exits · newest first', body: `<div id="tl">${ui.loading()}</div>`, scroll: true, foot: firm ? ui.source('Press releases & Broad Sky site', 'https://broadskypartners.com/news/', firm.meta?.generated) : '' })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Data coverage', sub: `Every dataset behind the portal · ${DATA_FILES.length + (manifest?.datasets?.length || 0)} files · home sales in ${fmt.num(homeCounties)} portfolio counties`, actions: `<button class="btn xs" id="dc-refresh">↻ Refresh live counts</button>`, body: `<div id="dc-tbl"></div>`, flush: true, foot: ui.source('data/manifest.json + data/research + data/sales (meta.generated)', null, manifest?.generated || '2026-09-24') })}</div>`;

  // map
  const map = maps.create(el.querySelector('#home-map'), { center: [40.3, -76.0], zoom: 6 });
  for (const c of COS) maps.marker(map, c.lat, c.lon, { color: c.hex, label: c.short, popup: `<b>${esc(c.name)}</b><br>${esc(c.hq)}<br><span class="muted">${esc(c.footprint)}</span><br><a href="#/${c.id}">Open module →</a>` });
  const cnt = await data.load('cet_ne_counties').catch(() => []);
  if (!el.isConnected) return () => map.remove();
  maps.points(map, cnt.filter(c => c.centroid_lat), { latKey: 'centroid_lat', lonKey: 'centroid_lng', color: r => r.cet_fit_tier === 'Tier 1' ? '#4c8dff' : r.cet_fit_tier === 'Tier 2' ? '#8ab4ff' : '#2a3a55', radius: r => r.cet_fit_tier === 'Tier 1' ? 7 : 5, cluster: false, opacity: .55, popup: r => `<b>${esc(r.county_name)}, ${esc(r.state)}</b><br>CET fit ${esc(r.cet_fit_score)} · ${esc(r.cet_fit_tier)}<br><span class="muted">${esc(r.notes || '')}</span>` });
  maps.points(map, zips.filter(z => z.service_territory_flag === 1), { color: '#f08a3c', radius: 2.5, cluster: false, opacity: .5, weight: 0 });
  for (const a of alerts) if (a.geometry) L.geoJSON(a.geometry, { style: { color: /Extreme|Severe/.test(a.severity) ? '#ff5c5c' : '#f5b73d', weight: 1, fillOpacity: .12 } }).bindPopup(`<b>${esc(a.event)}</b><br>${esc(a.areaDesc)}<br><span class="muted">${esc(a.headline || '')}</span>`).addTo(map);
  maps.legend(map, [{ color: '#f08a3c', label: 'Punctual Pros core zips' }, { color: '#4c8dff', label: 'CET Tier-1 counties' }, { color: '#8ab4ff', label: 'CET Tier-2 counties' }, { color: '#f5b73d', label: 'NWS alert (moderate)' }, { color: '#ff5c5c', label: 'NWS alert (severe)' }], 'Layers');
  el.querySelectorAll('#co-cards .card').forEach(c => c.onclick = () => app.go(c.dataset.id));
  el.querySelector('#play-brief').onclick = () => window.BSP.Tour.start(0);

  // signals — all from real fields: cet_opportunities.due_date, NWS alerts, ma_targets meta.ranked_top_10 / ranked_top_8, pe_landscape items[].deals_2025_2026
  const sig = [];
  due.slice(0, 3).forEach(o => sig.push({ c: 'var(--c-cet)', t: `CET bid due ${fmt.dateShort(o.due_date)} (${o._d}d)`, s: `${o.owner_or_agency || ''}${o.state ? ` (${o.state})` : ''} — ${o.title || ''}`, h: '#/cet/opportunities' }));
  (sevAlerts.length ? sevAlerts.slice(0, 2) : alerts.slice(0, 2)).forEach(a => sig.push({ c: sevAlerts.length ? 'var(--red)' : 'var(--amber)', t: `${a.event} · ${a.state}`, s: a.areaDesc, h: a.state === 'PA' || a.state === 'NJ' ? '#/pp/weather' : '#/cet/overview' }));
  const ranked = [['PP', 'pp', maPp?.meta?.ranked_top_10], ['CET', 'cet', maCet?.meta?.ranked_top_10], ['FL', 'fl', maFlTs?.meta?.frontline?.ranked_top_8], ['TS', 'ts', maFlTs?.meta?.thomas_scientific?.ranked_top_8]];
  ranked.forEach(([lab, p, list]) => { const t = (list || [])[0]; if (t && t.company) sig.push({ c: 'var(--c-ma)', t: `${lab} add-on #${t.rank ?? 1} · fit ${t.fit_score ?? '—'}`, s: `${t.company}${t.why ? ` — ${t.why}` : ''}`, h: `#/ma/pipeline?platform=${p}&q=${encodeURIComponent(String(t.company).split(/[,(/]/)[0].trim())}` }); });
  const deals = (pe?.items || []).flatMap(f => (f.deals_2025_2026 || []).map(d => ({ ...d, firm: f.firm }))).filter(d => d.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  deals.slice(0, 2).forEach(d => sig.push({ c: 'var(--c-pe)', t: `PE deal · ${fmt.dateShort(d.date)}`, s: `${d.firm} → ${d.company}${d.type ? ` (${String(d.type).replace(/_/g, '-')})` : ''}${d.sector ? ` · ${d.sector}` : ''}`, h: '#/pe/deals' }));
  el.querySelector('#signals').innerHTML = sig.length ? `<div class="col gap-8">${sig.slice(0, 11).map(s => `<a class="row" style="align-items:flex-start;color:inherit;text-decoration:none" href="${esc(s.h)}"><span class="chip" style="--cc:${s.c};flex-shrink:0">${esc(s.t)}</span><span class="small text-2 ellipsis" title="${esc(s.s)}">${esc(s.s)}</span></a>`).join('')}</div>` : ui.empty('No signals');

  // timeline — bsp_firm.timeline, newest first, coloured by company
  const tl = (firm?.timeline || []).filter(t => t.date).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  el.querySelector('#tl').innerHTML = tl.length ? ui.timeline(tl.slice(0, 40).map(t => ({ date: t.date, color: tlColor(t.company), html: `${t.company ? `<b>${esc(t.company)}</b> · ` : ''}${esc(t.event)}${t.source_url ? ` <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` }))) : ui.note('Timeline pending: <b>bsp_firm</b> research dataset not available.', 'warn');

  // data coverage — legacy rows from manifest.json, research/sales from the embedded inventory, live where this page already holds the data
  const loaded = { bsp_firm: firm, ma_targets_cet: maCet, ma_targets_pp: maPp, ma_targets_fl_ts: maFlTs, pe_landscape: pe, cet_opportunities: cetOpp };
  const rows = [
    ...(manifest?.datasets || []).map(d => { const n = String(d.file).replace(/\.json$/, ''); return { id: `legacy/${n}`, g: 'legacy', n, co: LEGACY_CO[n] || 'bsp', rows: d.rows, res: n === 'pp_sales_90d' ? d.rows : 0, counties: 0, gen: manifest.generated, basis: 'live (manifest)', src: d.source || '' }; }),
    ...DATA_FILES.map(d => { const L = loaded[d.n]; return { id: `${d.g}/${d.n}`, g: d.g, n: d.n, co: d.co, rows: L ? (L.items || []).length : d.rows, res: d.g === 'sales' ? d.res : 0, counties: d.counties ? d.counties.length : 0, countyList: d.counties || [], gen: L?.meta?.generated ? String(L.meta.generated).slice(0, 10) : d.gen, basis: L ? 'live' : 'snapshot', src: '' }; }),
  ];
  const cols = [
    { key: 'n', label: 'Dataset', fmt: (v, r) => `<span class="chip solid" style="--cc:${CO_HEX[r.co] || CO_HEX.bsp};min-width:38px;justify-content:center">${esc(CO_SHORT[r.co] || r.co)}</span> <span class="mono small">${esc(v)}</span>` },
    { key: 'g', label: 'Group', fmt: v => `<span class="dim small">${esc(v)}</span>` },
    { key: 'rows', label: 'Rows', num: true, fmt: v => v == null ? '—' : fmt.num(v) },
    { key: 'res', label: 'Home sales', num: true, fmt: v => v ? fmt.num(v) : '<span class="dim">—</span>' },
    { key: 'counties', label: 'Counties', num: true, title: r => (r.countyList || []).join(', '), fmt: v => v ? fmt.num(v) : '<span class="dim">—</span>' },
    { key: 'gen', label: 'Generated', num: true, fmt: v => `<span class="small">${esc(v || '—')}</span>` },
    { key: 'basis', label: 'Count basis', fmt: v => `<span class="dim small">${esc(v)}</span>` },
  ];
  const openDs = r => ctx.inspector.open({ title: esc(r.n), sub: `${esc(r.g)} dataset · ${esc(CO_SHORT[r.co] || '')}`, color: CO_HEX[r.co], sections: [
    { label: 'Inventory', html: ui.kv({ File: `<span class="mono small">data/${r.g === 'legacy' ? '' : r.g + '/'}${esc(r.n)}.json</span>`, Rows: r.rows == null ? '—' : fmt.num(r.rows), 'Home sales': r.res ? fmt.num(r.res) : null, Generated: esc(r.gen || '—'), 'Count basis': esc(r.basis) }) },
    r.countyList?.length ? { label: 'Counties covered', html: `<div class="small text-2">${r.countyList.map(esc).join(' · ')}</div>` } : null,
    r.src ? { label: 'Source', html: `<div class="small text-2">${esc(r.src)}</div>` } : null,
    { label: 'Next action', html: `<div class="small text-2">${r.g === 'sales' ? 'Re-pull quarterly (scripts/fetch_*_home_sales.py for CET/TS; county layers for PP) and check the newest sale date against the source lag noted in the file caveats.' : 'Rebuild with scripts/build_data.py (legacy) or re-run the research pull; confirm meta.generated moves forward.'}</div>` },
  ].filter(Boolean) });
  const dt = ui.table(el.querySelector('#dc-tbl'), { columns: cols, rows, pageSize: 12, sortKey: 'res', exportName: 'bsp_data_coverage', onRow: openDs });
  el.querySelector('#dc-refresh').onclick = async ev => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Counting…';
    const out = await Promise.all(rows.map(async r => {
      if (r.g === 'legacy') return r;
      try { const d = await data.load(`${r.g}/${r.n}`); const items = Array.isArray(d) ? d : (d.items || []); const res = r.g === 'sales' ? items.filter(x => x.use_type === 'residential').length : 0; const cs = r.g === 'sales' ? [...new Set(items.filter(x => x.county && (res ? x.use_type === 'residential' : true)).map(x => `${x.county} ${x.state}`))].sort() : null; return { ...r, rows: items.length, res, counties: cs ? cs.length : 0, countyList: cs || [], gen: d.meta?.generated ? String(d.meta.generated).slice(0, 10) : r.gen, basis: 'live' }; }
      catch { return { ...r, basis: 'missing' }; }
    }));
    if (!el.isConnected) return;
    dt.update(out); b.textContent = '✓ Live counts'; ui.toast(`Recounted ${out.filter(r => r.basis === 'live').length} datasets`);
  };
  app.index(COS.map(c => ({ label: c.name, sub: c.sector, href: `#/${c.id}`, kind: 'Company', color: c.hex })));
  return () => map.remove();
}

async function firmView(ctx) {
  const { el, ui, fmt, data, esc } = ctx;
  const firm = await data.research('bsp_firm');
  const f = firm?.firm;
  el.innerHTML = ui.pageHead({ title: 'Broad Sky Partners — firm profile', sub: f?.strategy || 'New York lower-middle-market private equity firm investing $50–250M of control equity in essential business services and consumer companies.', chips: `${fmt.chip('Founded 2014', 'var(--c-bsp)')}${fmt.chip('Fund I ~$137M (Dec 2024)')}${fmt.chip('7 platforms · 23 add-ons')}${fmt.chip('1 exit')}` }) +
  `<div class="grid grid-2">
    ${ui.panel({ title: 'History', body: f?.history ? `<div class="prose">${esc(f.history)}</div>` : ui.note('Firm history will populate from data/research/bsp_firm.json', 'warn') })}
    ${ui.panel({ title: 'Team & Portfolio Resource Group', body: f?.team?.length ? `<div class="col gap-4">${f.team.map(t => `<div class="row"><span class="strong">${esc(t.name)}</span><span class="muted small">${esc(t.title || '')}</span></div>`).join('')}</div>${f.prg ? `<h4 class="mt-12">Portfolio Resource Group</h4><div class="small text-2">${esc(typeof f.prg === 'string' ? f.prg : JSON.stringify(f.prg))}</div>` : ''}` : ui.note('Team list pending', 'warn') })}
    ${ui.panel({ title: 'Platforms', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Company</th><th>Sector</th><th>Entry</th><th>Status</th><th class="num">Add-ons</th></tr></thead><tbody>${(firm?.items || []).map(p => `<tr><td>${esc(p.company)}</td><td>${esc(p.sector)}</td><td class="num">${esc(p.entry_date)}</td><td>${fmt.chip(p.status, p.status === 'exited' ? 'var(--muted)' : 'var(--green)')}</td><td class="num">${(p.add_ons || []).length}</td></tr>`).join('') || '<tr><td colspan=5><div class="empty">Pending research</div></td></tr>'}</tbody></table></div>` })}
    ${ui.panel({ title: 'Sources', body: `<div class="col gap-4 small">${(f?.sources || []).map(s => `<a href="${esc(s)}" target="_blank">${esc(s)}</a>`).join('') || '—'}</div>` })}
  </div>`;
}

export default {
  id: 'home', name: 'Command Center', tag: 'BSP', color: 'var(--c-bsp)', group: 'Command',
  tagline: 'Portfolio-wide situational awareness',
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'firm', name: 'Broad Sky profile', icon: '◈', render: firmView },
  ],
  tour: [
    { order: 100, hash: '#/home/overview', caption: '<b>Broad Sky Operating Intelligence.</b> Six platforms, one portal: every datapoint tied to a revenue, acquisition or operating decision.', narration: 'Welcome to Broad Sky Operating Intelligence: six platforms, one portal, and every datapoint tied to an action.', duration: 7000 },
    { order: 110, hash: '#/home/overview', caption: '<b>This week.</b> Signals pull live bid deadlines, NWS alerts, top-ranked add-ons and rival deals; <b>Data coverage</b> lists every dataset, including home sales in 36 portfolio counties.', narration: 'Signals pull live bid deadlines, weather alerts, top add-ons and rival deals. The coverage table lists every dataset, including county home sales.', duration: 9000 },
    { order: 120, hash: '#/home/firm', caption: '<b>Broad Sky Partners.</b> Founded 2014 · 7 platforms · 23 add-ons · first exit: Smith + Howard → TPG (Aug 2026).', narration: 'Broad Sky itself: founded in 2014, seven platforms, twenty-three add-ons, and a first exit to TPG.', duration: 7000 },
  ],
};
