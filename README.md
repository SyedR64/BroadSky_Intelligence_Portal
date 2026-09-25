# Broad Sky Operating Intelligence

A static, single-page portal for the **Broad Sky Partners Portfolio Resource Group**. It turns public and licensed data into revenue, M&A and operating actions for each portfolio company. Every view starts with a one-line "so what" and KPIs, then shows the evidence (map, table or chart), then the action list. Every number carries a source, and estimates are labelled "est.".

- **Stack:** vanilla ES modules, no build step. Leaflet for maps, inline SVG charts. Runs on GitHub Pages (`.nojekyll`).
- **Entry point:** `index.html` loads `assets/core.js` (the runtime: data, formatting, UI, maps, charts, live feeds, tour, app shell) and `modules/registry.js` (the module list, in rail order).
- **Build contract for module authors:** `CONTRACT.md`.

## Module map

| Rail group | Module (`#/id`) | Views | What it answers |
|---|---|---|---|
| Command | Command Center (`home`) | overview, firm | Portfolio footprint, live NWS alerts, signals this week (bids due, top add-ons, rival deals), Broad Sky timeline, **data coverage** for every dataset |
| Portfolio | Commonwealth Electrical, CET (`cet`) | overview, opportunities, wastewater, territory, transfers, targets, filings | New England bid radar, Horton wastewater cross-sell, county fit, new-owner retrofit triggers plus **home sales by county**, add-on screen |
| Portfolio | Punctual Pros (`pp`) | overview, weather, movers, territory, market, targets, filings | Weather-driven staffing, **new-mover leads from home sales**, adjacent-zip expansion, franchise market, tuck-ins |
| Portfolio | Frontline Managed Services (`fl`) | overview, amlaw, midsize, targets, filings | AM Law account plan, mid-size firm pipeline, legal-IT add-ons, deal math |
| Portfolio | Thomas Scientific (`ts`) | overview, accounts, sites, targets, filings | 27k scored lab/hospital sites, parent-account plays, distributor add-ons, credit file |
| Portfolio | Bully Pulpit International (`bpi`) | overview, opportunities, benchmarks, market, filings | Growth plays, agency comps, DC home-sales market, filings |
| Portfolio | Fair Harbor (`fh`) | overview, opportunities, benchmarks, market, filings | Capital-light growth, apparel comps, Manhattan home-sales market, filings |
| Intelligence | Acquisition engine (`ma`) | overview, pipeline, theses, rivals, valuation, whitespace | Cross-platform add-on pipeline, theses joined to county home sales, stressed rivals, multiple arbitrage |
| Intelligence | PE landscape (`pe`) | landscape, deals, heatmap, platforms | 35 competing sponsors, disclosed deals, rival presence × home-sales turnover by portfolio county |
| Intelligence | Filings & financials (`fin`) | portfolio, explorer, comps, rivals, methods | Form D/ADV capital, triangulated financials, 31 public comps, data gaps register |
| Briefing | Briefing & video (`briefing`) | play | Narrated 4-minute tour (35 steps, ~600 words) and rendered MP4 |

The tour is assembled from each module's `tour` array (3–5 steps each). Each step has an optional numeric `order`; `Tour.register` in `assets/core.js` keeps the steps sorted by it, in the order home → cet → pp → fl → ts → bpi → fh → ma → pe → fin → briefing.

## Data provenance

All data is static JSON under `data/`. Columnar files (`{"format":"columnar", cols, enums, rows}`) are decoded automatically by `Data.load`. Research files use the shape `{meta, items}`, and `meta` carries `generated`, `method`, `sources_summary` and `caveats`. The Command Center's **Data coverage** panel lists every file with its row count, home-sale count, counties and generation date.

### Home sales in the counties the portfolio serves

| File (`data/sales/`) | Portfolio company | Counties | Source |
|---|---|---|---|
| `pp_sales_pa_a` | Punctual Pros | Lancaster, York, Dauphin, Cumberland PA | County ArcGIS parcel/CAMA layers; Dauphin property-tax inquiry site |
| `pp_sales_pa_b` | Punctual Pros | Berks, Lebanon, Franklin, Adams, Perry, Chester, Montgomery PA | County ArcGIS parcel/CAMA layers |
| `pp_sales_nj` | Punctual Pros (Horvath) | Ocean, Monmouth, Atlantic, Burlington NJ | NJ Division of Taxation SR1A sales file + NJOGIS parcels |
| `cet_home_sales_ma` | CET | Worcester, Middlesex, Essex, Norfolk, Plymouth, Hampden, Bristol, Hampshire, Suffolk (ex-Boston) MA | MassGIS L3 standardized assessor parcels (last sale) |
| `cet_home_sales_ct_ri` | CET / Horton | All 8 CT counties + Providence RI (Cranston) | CT OPM Real Estate Sales; CT statewide CAMA parcel layer; Cranston RI parcels |
| `cet_transfers_ma`, `cet_transfers_ct_ri` | CET | Same counties (commercial, industrial, mixed use, land ≥ $500K) | Same sources as above |
| `ts_sales_gloucester_nj` | Thomas Scientific (HQ) | Gloucester NJ | NJ Division of Taxation SR1A sales file + NJOGIS parcels |
| `bpi_sales_dc` | BPI (HQ) | District of Columbia | DC OTR owner polygons (DC GIS) |
| `fh_sales_nyc` | Fair Harbor (SoHo store) | New York County (Manhattan) | NYC DOF rolling calendar sales |

Frontline (St. Louis, MO) has no home-sales file. Missouri does not disclose sale prices, and the St. Louis County parcel layer has no usable deed date. Closing this gap needs a licensed MLS or ATTOM feed.

### Legacy tables (`data/*.json`, documented in `data/manifest.json`)

| Dataset | Source |
|---|---|
| `cet_ne_counties`, `cet_ne_development`, `cet_ne_rfps`, `cet_nyc_archive_summary` | Legacy CET tool: Census CBP/ACS/BPS, municipal development logs, USASpending, COMMBUYS / CTsource (compiled Apr–May 2026) |
| `pp_zips`, `pp_meta`, `pp_sales_90d` | Legacy Punctual Pros tool: ACS 5-yr, county recorder deed transfers (Jan–Apr 2026) |
| `fl_lawfirms` | AM Law 200 (2025) public rankings + analyst scoring |
| `ts_sites`, `ts_parents` | NPPES NPI, CMS provider utilization 2023, CLIA, Hospital Compare, PECOS |

### Research datasets (`data/research/*.json`, see `data/research/README.md`)

| Dataset | Main sources |
|---|---|
| `bsp_firm` | broadskypartners.com, SEC EDGAR Form D, press releases (BusinessWire, PR Newswire) |
| `cet_opportunities`, `cet_wwtp_targets` | State SRF intended-use plans and priority lists, BidNet / COMMBUYS, EPA ECHO NPDES |
| `pp_storm_events`, `pp_demand_model`, `pp_market` | NOAA NCEI Storm Events, trade studies (ServiceTitan, Samsara, AHS), Authority Brands directories, Census ACS / PEP / BPS |
| `fl_midsize_firms` | Law-firm websites, sitemaps and press releases |
| `ma_targets_cet`, `ma_targets_pp`, `ma_targets_fl_ts` | ZoomInfo (licensed), company websites, press releases, PrivSource |
| `pe_landscape` | Sponsor websites and press releases, SEC Form D / ADV |
| `pp_filings`, `cet_filings`, `frontline_filings`, `thomas_filings`, `bpi_filings`, `fairharbor_filings` | SEC EDGAR (Form D, ADV, BDC schedules, N-PORT), USASpending / SBA, FEC, state registries, FDDs |
| `rival_filings`, `public_comps` | SEC BDC 10-Q/10-K schedules, N-PORT, SEC XBRL companyfacts (31 listed peers) |

Live feeds are fetched in the browser: NWS alerts (`api.weather.gov`), Open-Meteo forecasts and history.

## Run locally

```sh
cd /path/to/BSP
python3 -m http.server 8765 --bind 127.0.0.1
open http://127.0.0.1:8765/            # or any route, e.g. #/cet/transfers
```

To smoke-test a route headlessly (prints console errors and saves a screenshot):
`scripts/check_page.sh "#/pp/weather" /tmp/pp_weather.png [width] [height]`.

Before each deploy, run `scripts/bump_version.sh` to stamp a new cache-busting `?v=` on the module imports.

## Rebuild data

| Step | Command |
|---|---|
| Legacy tables → `data/*.json` + `data/manifest.json` | `python3 scripts/build_data.py [path/to/2023_Gaz_zcta_national.txt]` |
| Compact new `data/sales/*.json` files to columnar | `python3 scripts/compact_sales.py [max_items]` |
| CET home sales (MA, CT, RI) | `python3 scripts/fetch_cet_home_sales.py [ma] [ct]`: re-pulls the residential sales and removes CT CAMA homes that had been mis-tagged as commercial from `cet_transfers_ct_ri` |
| Thomas Scientific home sales (Gloucester NJ) | `python3 scripts/fetch_ts_home_sales.py [YTDSR1A2026.zip]` |
| Research summaries | `python3 scripts/describe_research.py` |

After any data change, update the `DATA_FILES` snapshot at the top of `modules/home.js` (row counts, home-sale counts, counties, generated date), or use **Refresh live counts** in the Data coverage panel to recount in the browser.

## Render the briefing video

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &          # site must be served
python3 scripts/export_tour.py                           # → briefing/tour_steps.json (ordered steps: hash, caption, narration, duration)
python3 scripts/make_briefing.py                         # → briefing/broad_sky_briefing.mp4, poster.jpg, manifest.json
```

`make_briefing.py` needs Google Chrome, macOS `say` and `imageio-ffmpeg` (`pip install imageio-ffmpeg`). The Briefing module plays the MP4 once `briefing/manifest.json` exists. It can always play the live, narrated in-app tour.

## Disclaimer

**This portal holds public and licensed research data. Verify before use.** Figures come from public records (SEC, state and county assessor and recorder files, federal APIs), licensed sources (for example ZoomInfo) and analyst estimates. Private-company revenue, EBITDA, leverage and valuations are **estimates** triangulated from public filings, not company-reported numbers. Property records lag their sources by weeks to months, and assessor layers carry only each parcel's last sale. Nothing here is investment advice. Confirm any number with the primary source (links are in every inspector and footer) before it goes into a decision, a model or an outside communication. Owner names shown in property records come from public assessor rolls; use them only for aggregate market analysis or lawful business outreach.
