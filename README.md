# BSP Desk

BSP Desk is a concept workspace for the Portfolio Resource Group (PRG) at **Broad Sky Partners (BSP)**. It turns public data into growth, add-on and operating ideas for six portfolio companies. Each company also gets a concept website and an "OS": a bundle of proven software and AI tools. Every number carries a source. Estimates are marked est.; sample figures are marked illustrative.

**Live site:** https://syedr64.github.io/BroadSky_Intelligence_Portal/

Concept by Syed Rahman for the Portfolio Resource Group at Broad Sky Partners (BSP). Not an official company site.

**Where to start**

- **Landing page:** a short tour, the six companies and an assistant you can ask in plain English.
- **Portal:** maps, add-on screens, filings and the private-equity landscape, one view per question.
- **Site concepts:** a new website and an OS for each company, plus a growth plan.
- **Executive memo:** where the six companies stand and what to do in the first 90 days.

## For developers

Every view leads with one short sentence and its KPIs, then the evidence (map, table or chart), then the action list. Voice rules: `UNIFIED.md` §0.

- **Stack:** vanilla ES modules, no build step, GitHub Pages (`.nojekyll`). Leaflet for maps, inline SVG charts, MapLibre + deck.gl for the 3D theater.
- **Shared runtime:** `assets/core.js` (data loaders, formatting, UI kit, maps, charts, live feeds, tour, app shell), `assets/chat.js` (the assistant), `assets/components.js` (targets / filings / opportunity cards).
- **Contracts:** `CONTRACT.md` (portal modules) and `CONTRACT_SITES.md` (landing, concept sites, OS pages).

## Site map

| Path | What it is |
|---|---|
| `index.html` | Landing page: "Hello, BSP." with the inline assistant, six example prompts, product tour, live evidence counts, the six companies, the OS program and the briefing video. |
| `app.html` | The portal (hash routes `app.html#/<module>/<view>`, ⌘K search, inspector, narrated tour). |
| `redesigns/index.html` | Gallery of the six concept websites and the OS program, with the design principles behind them. |
| `redesigns/punctual-pros/` | Concept site · `serviceos.html` (ServiceOS) · `nationwide.html` (nationwide plan) · `ads.html` (growth marketing and sample ads) |
| `redesigns/cet/` | Concept site · `gridos.html` (GridOS) · growth plan (`growth-plan.html`) |
| `redesigns/frontline/` | Concept site · `firmos.html` (FirmOS) · growth plan (`growth-plan.html`) |
| `redesigns/thomas-scientific/` | Concept site · `labos.html` (LabOS) · growth plan (`growth-plan.html`) |
| `redesigns/bpi/` | Concept site · `signalos.html` (SignalOS) · growth plan (`growth-plan.html`) |
| `redesigns/fair-harbor/` | Concept site · `harboros.html` (HarborOS) · growth plan (`growth-plan.html`) |
| `redesigns/ai-agents.html`, `redesigns/voice-ai.html` | Cross-portfolio agentic-layer program and the 24/7 voice-AI model |
| `theater.html` | Full-screen 3D theater (also in the portal at `#/theater/play`) |
| `briefing/` | Rendered briefing (`broad_sky_briefing.mp4`), 29-second intro, executive memo (HTML + PDF), shot lists |

Every concept page carries the same dismissible banner ("Concept work by Syed Rahman for the Portfolio Resource Group at Broad Sky Partners (BSP). Not an official company website; estimates are marked est.") with the shared navigation **Portal · Site concepts · OS program · Briefing**, the floating assistant, and the same footer disclaimer as the landing page. All internal links are relative, so the site works from any GitHub Pages sub-path.

## Module map (portal)

| Rail group | Module (`#/id`) | Views | What it answers |
|---|---|---|---|
| Command | Command Center (`home`) | overview, firm | Portfolio footprint, value and exit readiness, live NWS alerts, signals this week, BSP timeline, data coverage |
| Portfolio | Commonwealth Electrical, CET (`cet`) | overview, opportunities, wastewater, territory, transfers, targets, filings | New England bid radar, Horton wastewater cross-sell, county fit, new-owner retrofit triggers, add-on screen |
| Portfolio | Punctual Pros (`pp`) | overview, weather, movers, territory, market, targets, filings | Weather-driven staffing, new-mover leads from home sales, adjacent-zip expansion, franchise market, tuck-ins |
| Portfolio | Frontline Managed Services (`fl`) | overview, amlaw, midsize, targets, filings | AM Law account plan, mid-size firm pipeline, legal-IT add-ons, deal math |
| Portfolio | Thomas Scientific (`ts`) | overview, accounts, sites, targets, filings | 27k scored lab and hospital sites, parent-account plays, distributor add-ons, credit file |
| Portfolio | Bully Pulpit International (`bpi`) | overview, opportunities, benchmarks, filings | Growth plays, agency comps, filings |
| Portfolio | Fair Harbor (`fh`) | overview, opportunities, benchmarks, filings, market | Capital-light growth, apparel comps, Manhattan home-sales market, filings |
| Intelligence | Acquisition engine (`ma`) | overview, pipeline, theses, rivals, valuation, whitespace | Portfolio-wide add-on pipeline, theses joined to county home sales, stressed rivals, multiple arbitrage |
| Intelligence | PE landscape (`pe`) | landscape, deals, heatmap, companies | 35 competing sponsors, disclosed deals, rival presence by portfolio county |
| Intelligence | Filings & financials (`fin`) | portfolio, deal, explorer, comps, rivals, methods | Form D/ADV capital, triangulated financials, deal math, 31 public comps, data-gaps register |
| Intelligence | **Tech enablement (`techos`)** | overview, evidence, roadmap, calculator | The six OS theses (ServiceOS, GridOS, FirmOS, LabOS, SignalOS, HarborOS): KPIs moved, est. investment and EBITDA impact, valuation-premium evidence, 12–24 month roadmap, equity-value calculator |
| Briefing | 3D theater (`theater`) | play | GPU-rendered scenes over the portfolio datasets |
| Briefing | Briefing & video (`briefing`) | play | Narrated tour and rendered MP4 |

The tour is assembled from each module's `tour` array (3–5 steps each), sorted by each step's optional `order` in `Tour.register` (`assets/core.js`).

## The assistant (`assets/chat.js`)

One widget serves the landing page (inline, persona `portal`), the portal and every concept page (floating launcher, personas `portal`, `pp`, `cet`, `fl`, `ts`, `bpi`, `fh`). It answers in three tiers, each grounded in the repo's own data:

1. **Grounded intents (no key, no backend).** Regex-matched intents run against the datasets directly: zip coverage (`Do you serve 17601?`), live NWS storms and the demand model, CET bids due and programs, Horton wastewater targets, add-on targets, PE competitors, filings estimates, new-mover counts, the OS theses, the Punctual Pros nationwide plan, voice AI, AI agents, sample ads and portal navigation. Answers carry numbers, sources and a link into the right portal view.
2. **Retrieval fallback.** If no intent matches, the question is scored against an index built from the portal's view catalogue, the `meta` summaries of the research files (financial pictures, theses, top actions) and the page's own FAQ entries; the best matches are returned with links.
3. **Optional bring-your-own Claude key.** The settings dialog accepts an Anthropic API key. It is stored **only in this browser's `localStorage`** (`bsp-anthropic-key`, plus model and mode) and is sent only to `api.anthropic.com` via the official SDK. With a key, free-form questions stream from Claude, grounded with the same retrieved context; "always" mode routes intent questions to Claude as well. Remove the key from the same dialog. Nothing is stored server-side, and the site works fully without a key.

Sites extend a persona through `Chat.mount(null, { persona, mode: 'floating', faq, suggestions })`; `scripts/chat_test.html?q=…&p=…` mounts the inline widget and auto-asks a question for testing.

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

## Run and test locally

```sh
cd /path/to/BSP
python3 -m http.server 8765 --bind 127.0.0.1
open http://127.0.0.1:8765/                       # landing
open http://127.0.0.1:8765/app.html#/techos/overview
open http://127.0.0.1:8765/redesigns/             # concept gallery
```

Headless smoke test (prints console errors and saves a screenshot; paths without `#` load as-is, `#/…` routes load in `app.html`):

```sh
scripts/check_page.sh "#/pp/weather" /tmp/pp_weather.png            # portal route, 1600×1000
scripts/check_page.sh "redesigns/cet/gridos.html" /tmp/g.png 390 844 # page at phone width
```

To list every portal route, open `scripts/export_routes.html` (or dump it headlessly with `--dump-dom`) and run `check_page.sh` on each. Test the assistant with `scripts/chat_test.html?q=Do%20you%20serve%2017601%3F&p=pp`.

Before each deploy, run `scripts/bump_version.sh`. It stamps one cache-busting `?v=` on the shared imports in `index.html`, `app.html`, `theater.html`, `scripts/chat_test.html`, `modules/*.js`, `assets/*.js`, every `redesigns/**/*.html` and the concept sites' own JS imports of `../../assets/*`. Concept-site CSS/JS (`site.css`, `os.js`, …) carry their own `?v=` stamps.

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


## Growth plans & programs (added Oct 6, 2026)

| Page | What it is | Data |
|---|---|---|
| `redesigns/punctual-pros/nationwide.html` | The "From Lancaster to national" growth plan: Smith + Howard template, four phases, levers, AI agents, pro programs, financing, returns | `data/research/pp_nationwide.json` |
| `redesigns/punctual-pros/ads.html` | Growth marketing & sample ads: CTV platforms, benchmarks, creatives, three media plans, calculator; rendered spots in `briefing/ads/` (`scripts/make_ads.py`) | `data/research/pp_ads.json` |
| `redesigns/voice-ai.html` | 24/7 voice AI as the growth engine: economics, reference voice-AI platforms, ASR/LLM stack, sample calls, governance | `data/research/voice_ai.json` |
| `redesigns/ai-agents.html` | The agentic layer: 45 agents across six operating systems, patterns, rollout waves, governance | `data/research/ai_agents_portfolio.json` |
| `redesigns/<slug>/growth-plan.html` | Growth plans for CET, Frontline, Thomas Scientific, BPI, Fair Harbor | `data/research/<co>_playbook.json` |
| `theater.html` / `app.html#/theater/play` | WebGL 3D theater (MapLibre GL + deck.gl): six fly-through scenes over real data | sales, opportunities, targets, live NWS |
| `briefing/BSP_Desk_Memo.pdf` | Four-page executive memo (`briefing/executive_memo.html`, printed with headless Chrome) | all research metas |
| `briefing/broad_sky_intro.mp4` | Cinematic product-intro film (`scripts/make_cinematic.py`: Playwright recording + title cards + narration + synthesized music) | `briefing/cinematic_shots_master.json` |

The live **"revenue left on the table" counter** (`assets/counter.js`) sums sourced, annualized opportunity values (missed calls without 24/7 voice coverage, uncaptured new-mover and storm demand, open CET bids at a 10% win rate) and divides by seconds per year. It is a way to feel the cost of waiting, labelled est., with the components one click away.
