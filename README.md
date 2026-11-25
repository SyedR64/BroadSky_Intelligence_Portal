# Broad Sky OS

Broad Sky OS is one operating system for Broad Sky Partners (BSP) and its six portfolio companies. A visitor is always "Viewing as" one of 44 roles in five levels; the level decides the menu, the home screen and the screens that open. It turns public data into growth, add-on and operating ideas, lists the tools each company runs on by brand name, and gives every role an agent. Estimates are marked est.; sample figures are marked illustrative.

**Live site:** https://broadsky-agent.vercel.app/ (older addresses, including GitHub Pages and broadsky-desk.vercel.app, forward there)

Concept by Syed Rahman for the Portfolio Resource Group at Broad Sky Partners (BSP). Not an official company site. This is navigation, not security: nobody signs in, and what a role may read in the agent is decided on the server.

## How it fits together

- **Front door.** `index.html` is a forwarding page. It opens `app.html#/home/overview`, the managing partner's home, keeps the query string (`?role=`, `?backend=`), and maps the old anchors: `#briefing` to `#/briefing/play`, `#platforms` to `#/home/overview`, `#deals` to `#/ma/pipeline`, `#os` and `#growth-plans` to the same anchors on `redesigns/`.
- **One shell.** `app.html` holds the top bar, the side menu, the screen and a side panel. Every screen is `app.html#/<module>/<screen>`; ⌘K searches, ⌘J opens the assistant.
- **"Viewing as" switch.** In the top bar of every page, left of the theme button. Closed, it reads the role and organisation ("Managing partner · Broad Sky"); open, it lists the five levels, then the roles of the chosen level by organisation. A click changes the role, the menu, the home and `?role=` in the address. The role nobody has chosen is the managing partner, and only an explicit choice (the switch or `?role=`) is stored.
- **Sources and Method.** Every screen gets two header controls and one as-of chip. An element marked `data-src` moves into the Sources drawer, one marked `data-method` into the Method drawer, one marked `data-asof` becomes the chip. A control shows only when it has content.
- **Connections.** `#/connect/overview` lists every tool by brand name, grouped by organisation (the firm, then the six companies; a company role sees its own). Each tool shows its category, what the OS reads from it, one state (Live, Sandbox, Connector available, Planned) and a mark for what is known about real use, with a source link. Data: `data/research/connections.json`.
- **Embedded pages.** A page opened with `?embed=1` draws no top bar, footer, crumb or floating Ask button. The shell shows it in an iframe (`modules/embed.js`) for the agent (`#/home/agent`) and for each company's Tools (its software page) and Plan (its growth plan). Links in an embedded page open in the top window.
- **Agent.** `agent.html` gives each role today's list, a question box and drafts that wait for approval. Roles come from `data/agent/catalog.json`; example data for the demonstration tools sits in `server/sandbox/`.

### Levels

| Level | Roles | Home | Menu |
|---|---|---|---|
| Firm leadership | 2 | Six companies, value and what moves it, today's items, approvals | Everything |
| Firm team | 5 | Same (investor relations: fund and documents only) | Everything (investor relations: Home, Fundamentals, Connections) |
| Company leadership | 18 | The company's four figures, today's items, approvals | Own company, add-on pipeline, Local signals, Plan, Tools, Connections |
| Company office | 15 | Today's items and the agent | Own company, Tools, Connections |
| Company field | 4 | Today's jobs and the agent | Home only |

A screen the level does not have sends the visitor to their home with one line, "Not in this view." The rules are the `LEVELS` table in `modules/registry.js`. Old links keep working for the firm levels.

### Shell state: `assets/session.js`

One store for the frame, the shell and the agent page, imported by `assets/frame.js`, `assets/core.js` and `assets/agent.js`. `Session.role()`, `setRole(id)`, `level()`, `co()`, `roles()`, `levels()` and `onChange(fn)` cover the role; a change also sets `data-level` and `data-co` on `<html>`. `Session.conn(co, app)` and `setConn(co, app, state)` keep the connection state of each tool per organisation under `bsp-os-connections`; `connectedApps(co, apps, defaults)` lists the connected ones for the agent request. A tool whose state in `connections.json` is "sandbox" counts as connected until the visitor disconnects it. Storage keys: `bsp-agent-role` (the chosen role), `bsp-os-role`, `bsp-os-connections`, `bsp-theme`. Another tab, or the shell around an embedded page, follows a change through the `storage` event.

### Top bar and footer

- **Shell:** the wordmark "Broad Sky OS", the "Viewing as" switch, Ask and the theme button. The side menu carries the page links.
- **Standalone pages** (concept sites, plans, assistant page, sitemap): the same bar plus Home, Agent, Connections and Concepts. At 960px and narrower, those links move into a menu sheet.
- **Footer** (standalone pages only): the wordmark, one line, the same links with Narrated tour, Executive memo and All pages, the disclaimer and "Prepared by Syed Rahman".
- **Pages:** titles read `<Page> · Broad Sky OS`.

## Voice

Twelve copy rules bind every screen and page; the full list is in `UNIFIED.md` §0. In short: a screen has one short lead under its title; tiles are label, value and change; cards are a title plus the visual; sources and method sit behind their controls; no instruction text, process notes or raw identifiers; a table cell is one line; actions start with a verb; the answer is on the first screen.

## For developers

- **Stack:** vanilla ES modules, no build step, static hosting (`.nojekyll`). Leaflet for maps, inline SVG charts, MapLibre + deck.gl for the 3D map.
- **Shared runtime:** `assets/session.js` (role and connections), `assets/frame.js` (top bar, switch, footer, theme, embed form), `assets/core.js` (data loaders, formatting, UI kit, maps, charts, live feeds, tour, Sources and Method drawers, app shell), `assets/chat.js` (the assistant), `assets/components.js` (targets, filings and opportunity cards), `modules/registry.js` (module order, menus, `LEVELS`, forwarding table).
- **Contracts:** `UNIFIED.md` (design system and voice), `CONTRACT.md` (screens), `CONTRACT_SITES.md` (concept sites and software pages).
- **Rules that keep it working:** never rename a module id, screen id or URL parameter in use; new imports between site files carry the same `?v=` stamp as their neighbours; a link to the agent never carries `q=`.

## Site map

| Path | What it is |
|---|---|
| `index.html` | Forwarding page into `app.html#/home/overview` (the front door). |
| `app.html` | The shell: `app.html#/<module>/<screen>`, "Viewing as", ⌘K search, side panel, narrated tour. |
| `agent.html` | The agent page. Inside the shell it is embedded at `#/home/agent`. |
| `assistant.html` | The full-screen assistant. |
| `sitemap.html` | Every page and screen (`scripts/make_sitemap.py`). |
| `redesigns/index.html` | Gallery of the six concept websites and the software and growth-plan program. |
| `redesigns/punctual-pros/` | Concept site · `serviceos.html` (ServiceOS) · `nationwide.html` (nationwide plan) · `ads.html` (growth marketing and sample ads) |
| `redesigns/cet/` | Concept site · `gridos.html` (GridOS) · `growth-plan.html` |
| `redesigns/frontline/` | Concept site · `firmos.html` (FirmOS) · `growth-plan.html` |
| `redesigns/thomas-scientific/` | Concept site · `labos.html` (LabOS) · `growth-plan.html` |
| `redesigns/bpi/` | Concept site · `signalos.html` (SignalOS) · `growth-plan.html` |
| `redesigns/fair-harbor/` | Concept site · `harboros.html` (HarborOS) · `growth-plan.html` |
| `redesigns/ai-agents.html`, `redesigns/voice-ai.html` | Cross-portfolio agent program and the 24/7 voice-AI model |
| `theater.html`, `redesigns/case-studies.html`, `redesigns/methodology.html` | Forwarding pages: the 3D map is `app.html#/theater/play` (old `?scene=` links carry over); the other two forward to `#/cases/timeline` and `#/bsp/deals`. |
| `briefing/` | The two films (`broad_sky_intro.mp4`, `broad_sky_briefing.mp4`), the executive memo (HTML and PDF), shot lists |

Concept pages carry the frame's concept tag and the same top bar, footer and floating Ask button as every page. All internal links are relative, so the site works from any sub-path.

## Screens

Menu for the firm levels: Home, Portfolio (six companies), Deals, Value creation. Company levels use their own menus (see Levels).

| Menu group | Module (`#/id`) | Screens | What it answers |
|---|---|---|---|
| Home | Home (`home`) | overview, agent (and `firm`, the BSP profile, off the tabs) | The level's home (firm, company or role), then the agent |
| Portfolio | CET (`cet`) | overview, opportunities, wastewater, transfers, filings, tools, plan | Bid radar, Horton wastewater cross-sell, county fit, new-owner retrofit triggers, add-on screen |
| Portfolio | Punctual Pros (`pp`) | overview, weather, movers, territory, market, filings, tools, plan | Weather-driven staffing, new-mover leads from home sales, adjacent-zip expansion, franchise market, tuck-ins |
| Portfolio | Frontline (`fl`) | overview, amlaw, midsize, filings, tools, plan | AM Law account plan, mid-size firm pipeline, legal-IT add-ons, deal math |
| Portfolio | Thomas Scientific (`ts`) | overview, accounts, sites, filings, tools, plan | 27k scored lab and hospital sites, parent-account plays, distributor add-ons, credit file |
| Portfolio | BPI (`bpi`) | overview, opportunities, filings, tools, plan | Growth plays, agency comps, filings |
| Portfolio | Fair Harbor (`fh`) | overview, opportunities, filings, tools, plan (and `market`, off the tabs) | Capital-light growth, apparel comps, Manhattan home-sales market, filings |
| Deals | Acquisition engine (`ma`) | overview, pipeline, research, rivals, whitespace (and `screen`, `loans`, off the tabs) | Portfolio-wide add-on pipeline, theses joined to county home sales, stressed rivals, multiple arbitrage. Every target and rival profile carries its deal math and a "How we estimated this" disclosure, with a link into the acquisition model |
| Deals | Acquisition model (`deal`) | returns, dcf, rollup, sensitivity | Live buyout, DCF, buy-and-build and sensitivity model with spreadsheet inputs; presets for the portfolio and every screened add-on (`#/deal/returns?p=<target id>`); rival scenarios by share link; Excel download with live formulas. Shared math in `modules/deal-lib.js` |
| Deals | Private equity (`pe`) | landscape, deals, comparables | 35 competing sponsors, disclosed deals, rival presence by portfolio county |
| Deals | Deal record (`bsp`) | deals, patterns, rubric, network | Every disclosed BSP deal from public announcements, the patterns read from them and an inferred rubric |
| Value creation | Local signals (`signals`) | overview, readings | The forces likely moving each company's sales and margins, read from public data and sized in dollars (est.), and the readings behind them |
| Value creation | Fundamentals (`fin`) | portfolio, comps (and `explorer`, `methods`, off the tabs) | Form D and ADV capital, triangulated financials, 31 public comps |
| Value creation | Tech enablement (`techos`) | overview, evidence, roadmap, calculator | The six software theses (ServiceOS, GridOS, FirmOS, LabOS, SignalOS, HarborOS): KPIs moved, investment, EBITDA impact, roadmap, equity-value calculator |
| Value creation | Connections (`connect`) | overview | Every tool by brand name with its state |
| Off the menu | Sponsor precedents (`cases`), US expansion (`national`), 3D map (`theater`), Narrated tour (`briefing`) | timeline, levers, sequence, exits · scorer, phases, markets · play · play | Reached from links, search and the tour. The 3D map is GPU-rendered scenes over the portfolio data; the Narrated tour plays the two films and the chapters over the live screens |

The tour is assembled from each module's `tour` array, sorted by each step's optional `order` in `Tour.register` (`assets/core.js`).

## The assistant (`assets/chat.js`)

The assistant is "Broad Sky OS"; its floating button reads "Ask". One widget serves the shell and every concept page (personas `portal`, `pp`, `cet`, `fl`, `ts`, `bpi`, `fh`). It answers in tiers, each grounded in sourced data:

1. **Grounded intents (no key, no backend).** Regex-matched intents run against the datasets directly: zip coverage (`Do you serve 17601?`), live NWS storms and the demand model, CET bids due and programs, Horton wastewater targets, add-on targets, PE competitors, filings estimates, new-mover counts, the software theses, the Punctual Pros nationwide plan, voice AI, AI agents, sample ads and navigation. Answers carry numbers, sources and a link to the right screen.
2. **Retrieval fallback.** If no intent matches, the question is scored against an index built from the screen catalogue, the `meta` summaries of the research files and the page's own FAQ entries; the best matches are returned with links.
3. **Hosted Claude with a knowledge base.** Open questions go to the assistant backend (`server/`, live on Vercel). Claude works there as a research agent over a knowledge base built by `scripts/build_corpus.py`: BSP's own website, every page the research cites, the portfolio companies' sites, news coverage and Broad Sky OS's own pages and research. The knowledge base is one SQLite file with a keyword index and a meaning index. Claude can search it again, read whole sources and run the acquisition model before it writes a cited answer; it can also search the web. The answer streams with numbered sources and live progress lines. Details: `server/README.md`.
4. **Developer key (only with `?dev=1`).** Without a hosted backend, the settings dialog accepts an Anthropic API key kept only in this browser's `localStorage` and sent only to `api.anthropic.com`.

Sites extend a persona through `Chat.mount(null, { persona, mode: 'floating', faq, suggestions })`; `scripts/chat_test.html?q=…&p=…` mounts the inline widget and auto-asks a question for testing.

## Data provenance

All data is static JSON under `data/`. Columnar files (`{"format":"columnar", cols, enums, rows}`) are decoded automatically by `Data.load`. Research files use the shape `{meta, items}`, and `meta` carries `generated`, `method`, `sources_summary` and `caveats`.

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
| `cet_ne_counties`, `cet_ne_development`, `cet_ne_rfps` | Earlier CET tool: Census CBP/ACS/BPS, municipal development logs, USASpending, COMMBUYS / CTsource (compiled Apr–May 2026) |
| `pp_zips`, `pp_meta`, `pp_sales_90d` | Earlier Punctual Pros tool: ACS 5-yr, county recorder deed transfers (Jan–Apr 2026) |
| `fl_lawfirms` | AM Law 200 (2025) public rankings + analyst scoring |
| `ts_sites`, `ts_parents` | NPPES NPI, CMS provider utilization 2023, CLIA, Hospital Compare, PECOS |

### Research datasets (`data/research/*.json`, see `data/research/README.md`)

| Dataset | Main sources |
|---|---|
| `bsp_firm` | broadskypartners.com, SEC EDGAR Form D, press releases (BusinessWire, PR Newswire) |
| `connections` | Vendor documentation and public company sources, one entry per tool, with its state and use mark |
| `cet_opportunities`, `cet_wwtp_targets` | State SRF intended-use plans and priority lists, BidNet / COMMBUYS, EPA ECHO NPDES |
| `pp_storm_events`, `pp_demand_model`, `pp_market` | NOAA NCEI Storm Events, trade studies (ServiceTitan, Samsara, AHS), Authority Brands directories, Census ACS / PEP / BPS |
| `fl_midsize_firms` | Law-firm websites, sitemaps and press releases |
| `ma_targets_cet`, `ma_targets_pp`, `ma_targets_fl_ts` | ZoomInfo (licensed), company websites, press releases, PrivSource |
| `pe_landscape` | Sponsor websites and press releases, SEC Form D / ADV |
| `pp_filings`, `cet_filings`, `frontline_filings`, `thomas_filings`, `bpi_filings`, `fairharbor_filings` | SEC EDGAR (Form D, ADV, BDC schedules, N-PORT), USASpending / SBA, FEC, state registries, FDDs |
| `rival_filings`, `public_comps` | SEC BDC 10-Q/10-K schedules, N-PORT, SEC XBRL companyfacts (31 listed peers) |

Live feeds are fetched in the browser: NWS alerts (`api.weather.gov`), Open-Meteo forecasts and history.

### Nightly snapshots (`data/live/`, written by `scripts/refresh_live.py`)

| File | What it holds | Source (keyless) |
|---|---|---|
| `nws_alerts`, `forecast_hubs` | Active weather alerts in 8 states; 7-day forecasts for the Punctual Pros hubs (browser fallback) | National Weather Service; Open-Meteo |
| `usaspending_trades` | Largest 2026 federal contracts to electrical and HVAC contractors, 8 states | USASpending |
| `echo_npdes_majors` | Large municipal wastewater plants in CT, MA, RI with compliance status | EPA ECHO |
| `census_permits` | Newest monthly county building-permit counts, 8 states | Census Building Permits Survey |
| `fred_signals` | Rates, credit spreads, home sales and prices, equipment, copper, transformer, fuel and power prices, trade labor and pay, state unemployment, legal, hospital, apparel and consumer demand, corporate profits; customs duties | FRED CSV downloads (Freddie Mac, BLS, Census, FHFA, EIA, BEA, University of Michigan and others); US Treasury fiscal data |
| `housing_counties` | New listings, homes under contract, days on market and list prices in the portfolio's counties, newest month | Realtor.com county inventory data |
| `nih_awards` | NIH award dollars and counts, year to date vs the same days last year, 8 research states; largest funded institutions | NIH RePORTER |
| `federal_buying` | Monthly federal contract dollars for lab supplies, PR and advertising, northeastern electrical and HVAC trades | USASpending |
| `policy_activity` | Federal rules, proposed rules and presidential documents, year to date vs last year (all agencies, EPA, Energy, HHS) | Federal Register |

Each source is fetched on its own; a failed source keeps its previous file and `data/live/manifest.json` records every status, row count and fetch time. Local signals reads these files plus the county table (`data/national_counties.json`) and the revenue points in each company's filings estimate table.

## Run and test locally

```sh
cd /path/to/BSP
python3 -m http.server 8765 --bind 127.0.0.1
open http://127.0.0.1:8765/                                   # forwards to the firm view
open "http://127.0.0.1:8765/app.html?role=pp-ceo#/home/overview"   # a company chief executive's home
open http://127.0.0.1:8765/redesigns/                         # concept gallery
```

`?role=<id>` before the `#` sets the role for the visit; `?backend=off` keeps the page from calling the hosted backend.

Checker (every page, every screen, the five levels, the forwarding pages and the link audit):

```sh
python3 scripts/ci_check.py                                   # starts its own static server if :8765 is free
python3 scripts/ci_check.py --base http://127.0.0.1:8765      # against a running server
python3 scripts/ci_check.py --links-only                      # the link audit alone, no browser
```

Headless smoke test (prints console errors and saves a screenshot; paths without `#` load as-is, `#/…` routes load in `app.html`):

```sh
scripts/check_page.sh "#/pp/weather" /tmp/pp_weather.png            # screen, 1600×1000
scripts/check_page.sh "redesigns/cet/gridos.html" /tmp/g.png 390 844 # page at phone width
```

Test the assistant with `scripts/chat_test.html?q=Do%20you%20serve%2017601%3F&p=pp`. `scripts/export_routes.html` lists every screen.

Before each deploy, run `scripts/bump_version.sh`. It stamps one cache-busting `?v=` on the shared imports in `index.html`, `app.html`, `agent.html`, `scripts/chat_test.html`, `modules/*.js`, `assets/*.js`, every `redesigns/**/*.html` and the concept sites' own JS imports of `../../assets/*`. Concept-site CSS and JS (`site.css`, `os.js`, …) carry their own `?v=` stamps.

## Rebuild data

| Step | Command |
|---|---|
| Legacy tables → `data/*.json` + `data/manifest.json` | `python3 scripts/build_data.py [path/to/2023_Gaz_zcta_national.txt]` |
| Compact new `data/sales/*.json` files to columnar | `python3 scripts/compact_sales.py [max_items]` |
| CET home sales (MA, CT, RI) | `python3 scripts/fetch_cet_home_sales.py [ma] [ct]`: re-pulls the residential sales and removes CT CAMA homes that had been mis-tagged as commercial from `cet_transfers_ct_ri` |
| Thomas Scientific home sales (Gloucester NJ) | `python3 scripts/fetch_ts_home_sales.py [YTDSR1A2026.zip]` |
| Punctual Pros home sales (NJ and PA) | `python3 scripts/fetch_pp_sales.py [--dry-run] [--only <source>]`: runs once a week (Mondays, and on every manual run) inside the nightly `refresh-data.yml` job; keeps an 18-month window; Dauphin County is a frozen snapshot and is not refreshed. Then `python3 scripts/build_homes_db.py`. See `server/README.md`. |
| Research summaries | `python3 scripts/describe_research.py` |
| Agent sandbox files | `python3 scripts/build_agent_sandbox.py` |
| Sitemap | `python3 scripts/make_sitemap.py` |

## Render the briefing video

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &          # site must be served
python3 scripts/export_tour.py                           # → briefing/tour_steps.json (ordered steps: hash, caption, narration, duration)
python3 scripts/make_briefing.py                         # → briefing/broad_sky_briefing.mp4, poster.jpg, manifest.json
```

`make_briefing.py` needs Google Chrome, macOS `say` and `imageio-ffmpeg` (`pip install imageio-ffmpeg`). The Narrated tour screen (`#/briefing/play`) plays the two films and can always play the live tour.

## Growth plans and programs

| Page | What it is | Data |
|---|---|---|
| `redesigns/punctual-pros/nationwide.html` | The nationwide growth plan: four phases, levers, AI agents, pro programs, financing, returns | `data/research/pp_nationwide.json` |
| `redesigns/punctual-pros/ads.html` | Growth marketing and sample ads: CTV platforms, benchmarks, creatives, three media plans, calculator; rendered spots in `briefing/ads/` (`scripts/make_ads.py`) | `data/research/pp_ads.json` |
| `redesigns/voice-ai.html` | 24/7 voice AI as the growth engine: economics, reference platforms, ASR/LLM stack, sample calls, governance | `data/research/voice_ai.json` |
| `redesigns/ai-agents.html` | The agent program: 45 agents across six software suites, patterns, rollout waves, governance | `data/research/ai_agents_portfolio.json` |
| `redesigns/<slug>/growth-plan.html` | Growth plans for CET, Frontline, Thomas Scientific, BPI, Fair Harbor | `data/research/<co>_playbook.json` |
| `app.html#/theater/play` | WebGL 3D map (MapLibre GL + deck.gl): six fly-through scenes over real data. `theater.html` forwards here. | sales, opportunities, targets, live NWS |
| `briefing/BSP_Desk_Memo.pdf` | Four-page executive memo (`briefing/executive_memo.html`, printed with headless Chrome) | all research metas |
| `briefing/broad_sky_intro.mp4` | Cinematic product-intro film (`scripts/make_cinematic.py`) | `briefing/cinematic_shots_master.json` |

## Disclaimer

**This site holds public and licensed research data. Verify before use.** Figures come from public records (SEC, state and county assessor and recorder files, federal APIs), licensed sources (for example ZoomInfo) and analyst estimates. Private-company revenue, EBITDA, leverage and valuations are **estimates** triangulated from public filings, not company-reported numbers. Property records lag their sources by weeks to months, and assessor layers carry only each parcel's last sale. Nothing here is investment advice. Confirm any number with the primary source (the Sources control on each screen links it) before it goes into a decision, a model or an outside communication. Owner names shown in property records come from public assessor rolls; use them only for aggregate market analysis or lawful business outreach.
