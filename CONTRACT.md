# Broad Sky Operating Intelligence — build contract for module authors

Static site (GitHub Pages, no build step, vanilla ES modules). Everything a module needs lives in `assets/core.js`.
Read this file fully, then read `assets/core.js` and `assets/app.css` before writing a module.

## 1. Module API
Each module is `modules/<id>.js` exporting default:
```js
export default {
  id: 'pp',                      // route segment: #/pp/<view>
  name: 'Punctual Pros',         // rail label
  tag: 'PA · NJ',                // small rail tag (optional)
  color: 'var(--c-pp)',          // module colour token (see palette)
  group: 'Portfolio',            // 'Command' | 'Portfolio' | 'Intelligence' | 'Briefing'
  tagline: 'Residential HVAC, plumbing & electrical — Central PA and the Jersey Shore',
  hq: { lat: 40.06, lon: -76.37, label: 'East Hempfield, PA' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', badge: null, flush: false,
      async render(ctx) { /* fill ctx.el; return an optional cleanup function */ } },
  ],
  tour: [ { hash: '#/pp/weather', caption: 'HTML caption', narration: 'spoken text', duration: 9000 } ],
}
```
`render(ctx)` receives `ctx = { el, module, view, params, data, ui, maps, charts, fmt, live, inspector, app, esc, $, $$ }`.
- `el` is the `#content` element (already emptied). Set `flush:true` on a view to remove padding (full-bleed map layouts using `.split`).
- Return a function to clean up (remove map instances, intervals, listeners). Leaflet maps MUST be removed on unmount (`map.remove()`).
- `params` = query params from the hash (`#/pp/movers?county=Lancaster`). Use `app.go(moduleId, viewId, params)` to navigate.
- Never use `innerHTML` with unescaped data: wrap all data strings in `esc()`. Use `fmt.*` helpers for numbers/dates.

## 2. Data
`await ctx.data.load('pp_zips')` → array of row objects (columnar files decode automatically). `await ctx.data.research('ma_targets_pp')` → `{meta, items, …}` or `null` if the file does not exist (ALWAYS handle null: render `ui.note('Research dataset not yet available', 'warn')`).
Legacy-derived tables in `data/`: cet_ne_counties, cet_ne_development, cet_ne_rfps, cet_nyc_archive_summary, pp_zips, pp_meta (object), pp_sales_90d, fl_lawfirms, ts_sites (27k rows — always filter/aggregate before rendering), ts_parents.
Research datasets in `data/research/` (shape `{meta, items}`; see `data/research/README.md` when present): cet_opportunities, cet_wwtp_targets, pp_storm_events, pp_demand_model, ma_targets_cet, ma_targets_pp, ma_targets_fl_ts, pe_landscape, bsp_firm (also `firm`, `timeline`, `bpi_opportunities`, `fh_opportunities` keys), fl_midsize_firms, pp_market, pp_filings, cet_filings, frontline_filings, thomas_filings, bpi_filings, fairharbor_filings, rival_filings, public_comps.
Property transfers in `data/sales/` (shape `{meta, items}`): pp_sales_pa_a, pp_sales_pa_b, pp_sales_nj, cet_transfers_ma, cet_transfers_ct_ri, cet_home_sales_ma, cet_home_sales_ct_ri, ts_sales_gloucester_nj, bpi_sales_dc, fh_sales_nyc — load with `data.research('sales/pp_sales_nj')`? No: use `data.load('sales/pp_sales_nj')` (path with slash loads exactly `data/sales/pp_sales_nj.json`).
Every panel that shows data ends with a provenance footer: `foot: ui.source('NOAA Storm Events', url, 'Sept 2026')`.

## 3. UI vocabulary (use these, do not invent new CSS unless scoped to your module with a `.m-<id>` prefix)
- Page: `ui.pageHead({title, sub, actions, chips})` then `.grid grid-2|grid-3|grid-4|grid-main|grid-side` of `ui.panel({title, sub, actions, body, foot, accent, flush, scroll})`.
- KPIs: `ui.kpis([{label, value, sub, delta, color, spark}])` — values pre-formatted (`fmt.compact`, `fmt.money`, `fmt.num`).
- Tables: `ui.table(el, {columns:[{key,label,fmt,num,width,wrap}], rows, pageSize, onRow, exportName, sortKey})` → controller with `.update(rows)`.
- Filters: `ui.filters(el, [{key,label,type:'select'|'search'|'toggle',options,value}], state => …)` → `{state, setCount}`.
- Chips/scores/tiers: `fmt.chip(text,color)`, `fmt.tier('Tier 1')`, `fmt.score(87)`, `fmt.link(url,text)`.
- Inspector (right panel): `inspector.open({title, sub, color, sections:[{label, html}], actions:[{label, href}|{id,label,onClick}]})`. Open it on row/card/map-point click. Use `ui.kv({...})` for key/value sections.
- Cards: `ui.cards(items,{color})` + `ui.bindCards(el, items, onSelect)`.
- Maps: `const map = maps.create(el, {center, zoom})`; `maps.points(map, rows, {color, radius, popup, onClick, cluster})`; `maps.marker(map, lat, lon, {color, label, popup})`; `maps.legend(map, [{color,label}], title)`; `maps.overlay(map, html)`; `maps.circle(...)`. Map containers need a fixed height: use `.map` (380px), `.map.tall` (560px) or `.split` full-bleed layout in a `flush` view.
- Charts (inline SVG, return HTML strings): `charts.bar(data,{h,color,fmt})`, `charts.hbar(data,{fmt,labelW})`, `charts.line(series,{h,fmt,area})`, `charts.heatgrid(rows, cols, values,{fmt,color})`, `charts.donut(data)`, `charts.sparkline(values)`.
- Live: `await live.nwsAlerts('PA')`, `await live.forecast(lat, lon)`, `live.wmo(code)`, `await live.history(lat, lon, from, to)`.
- Search: `app.index([{label, sub, href, kind, color}])` after loading data so entities appear in ⌘K (cap ~500 per module).
- Notes: `ui.note(html, 'warn'|'brand'|'')`, `ui.empty(msg)`, `ui.loading(msg)`, `ui.toast(msg)`.

## 4. Design rules (MBB / Palantir standard)
- Lead every view with the answer: a one-line "So what" in `pageHead.sub` plus 3–6 KPIs. Then evidence (map/table/chart). Then the action list.
- Dense but legible: 12–13px text, mono numerals, no decorative imagery, colour only to encode meaning (tier, severity, module).
- Every number has units and a source. Estimates are labelled "est." Illustrative numbers are labelled "illustrative".
- Every list is sortable and exportable (CSV). Every entity opens the inspector with sources (links) and a recommended next action.
- Empty states and loading states are explicit. Never throw on a missing dataset.
- Mobile: layouts collapse to one column (grid helpers already do). Maps stay usable.
- Colours: company tokens `--c-bsp --c-cet --c-pp --c-fl --c-ts --c-bpi --c-fh --c-ma --c-pe --c-fin`; semantic `--green --amber --red --accent --purple --cyan`.

## 5. Facts (do not contradict; see data/research/bsp_firm.json for more)
- Broad Sky Partners: NYC LMM PE, CEO/founder Tyler Zachem; 7 platforms, 23 add-ons; first exit Smith + Howard → TPG (Aug 2026, ~100→800 professionals, 9 add-ons). Portfolio Resource Group (PRG) led by operators.
- CET (Commonwealth Electrical Technologies): Worcester + Taunton MA; NuWave Energy Solutions (Norwell MA, Oct 2025); Horton Electrical Services (CT, Sept 15 2026, 120+ staff, wastewater/pump stations/solar/civil). Licensed in all 6 New England states. **No NYC expansion** (CEO guidance) — NYC analysis archived.
- Punctual Pros: East Hempfield (Lancaster Co.) PA; One Hour / Benjamin Franklin / Mister Sparky; ~240 zips; Horvath Home Services (Beachwood/Toms River NJ, Dec 2024; Ocean & Monmouth).
- Frontline Managed Services: St. Louis; 800+ law firms, >50% of AM Law 200; managed IT + revenue cycle.
- Thomas Scientific: Swedesboro NJ; lab supply distribution; acquired Jan 2022 from Carlyle.
- BPI (Bully Pulpit International): comms/public affairs; Apr 2023. Fair Harbor: sustainable beachwear; Mar 2022.

## 6. Deliverable checklist per module
[ ] every view renders with the datasets present today AND degrades gracefully if a research file is missing
[ ] maps clean up on unmount; no console errors; no unescaped HTML from data
[ ] each view ≤ ~1.5s to first paint on a laptop (aggregate big tables before render; paginate)
[ ] ⌘K index registered; inspector wired; CSV export on main tables; provenance footers
[ ] `tour` steps (3–5) describing the module's most compelling views

## 7. Shared components (assets/components.js) — use them for consistency
```js
import { renderTargets, renderFilings, opportunityCard, fitTierOf } from '../assets/components.js';
renderTargets(ctx, el, { items: ma.items, color: 'var(--c-pp)', platformLabel: 'Punctual Pros', exportName: 'pp_addon_targets' }); // filters + table + inspector
renderFilings(ctx, el, { data: await ctx.data.research('pp_filings'), color: 'var(--c-pp)', title: 'Punctual Pros' });   // financial picture, estimate table, filings table
ui.cards(items.map(o => opportunityCard(ctx, o, 'var(--c-cet)')));                                                       // consistent opportunity cards
```
## 8. Testing (mandatory before you finish)
A static server is already running at http://127.0.0.1:8765/ (python http.server on the repo root; if it is not up, start it with `python3 -m http.server 8765 --bind 127.0.0.1 &`). Do NOT use the interactive browser pane (other agents share it). Use headless Chrome:
`scripts/check_page.sh "#/pp/weather" /tmp/pp_weather.png` → prints console errors and writes a screenshot; open the PNG with the Read tool and look at it critically (layout, empty panels, overflow, unreadable text). Every view of your module must pass with zero console errors at 1600×1000 and render sensibly at 1100×900 (`scripts/check_page.sh "#/pp/weather" /tmp/x.png 1100 900`).
Module-scoped CSS: put it in `modules/<id>.css` and inject once at the top of your first render: `if (!document.getElementById('css-<id>')) { const l = document.createElement('link'); l.id = 'css-<id>'; l.rel = 'stylesheet'; l.href = 'modules/<id>.css'; document.head.appendChild(l); }`. Prefix every selector with `.m-<id>` and add that class to your root element.
Never edit assets/core.js, assets/app.css, assets/components.js, index.html or modules/registry.js — report needed changes in your final summary instead.
