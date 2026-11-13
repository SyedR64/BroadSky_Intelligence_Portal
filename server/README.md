# Assistant backend (Python, no Cloudflare)

This is the hosted part of the BSP Desk assistant: a small Python web service, first written as a port of the Cloudflare Worker in [`../worker`](../worker). It keeps the Claude API key on the server and answers every question with Claude working as a research agent over a real knowledge base. It also saves conversation threads and answer feedback, and enforces per-visitor and daily limits.

## How an answer is made

1. **Retrieve.** The server searches the knowledge base (`knowledge/kb.sqlite`) for the question and puts the best six excerpts, numbered, in front of Claude. A short follow-up is searched together with the previous question.
2. **Research.** Claude can call three tools before it answers, up to five model steps in all:
   - `search_knowledge`: search again with other words, a name or a company;
   - `read_source`: read a whole source when an excerpt is cut off;
   - `deal_model`: run the acquisition model (`dealmath.py`, a line-for-line port of `modules/deal-lib.js`, so the numbers match the portal and its Excel download) for price, financing, returns, a DCF and what a buyer can pay, and return a link that opens the same scenario in the portal.

   For BSP Desk only, Claude also has Anthropic's web search for public facts the knowledge base does not hold, and two home-records tools for the Punctual Pros territory (see [Home-sales records](#home-sales-records)):
   - `new_homeowners`: recent home buyers by county, town or ZIP code, ranked for the new-homeowner promotion;
   - `property_brief`: what the public record says about one address, what to check on arrival and which offers are worth raising.
3. **Answer.** Claude writes a short answer that cites its sources as `[1]`, `[2]`. The stream tells the site what is happening (`status`), which numbered sources the answer can cite (`sources`, sent again when the list grows) and then the text.

A question that clearly asks for a new-homeowner list or a brief on one address skips step 1 for BSP Desk: the records answer it, and Claude can still search. The test is strict (`tool_route` in `app.py`): the question must name homeowners or home buyers, or pair "new buyers" or "recent owners" with a place, a mailer or a house; a question about the buyers or owners of companies keeps its excerpts. A search result Claude already has from an earlier step is named by its number and title, not sent again. A tool result is cut at 12,000 characters; this is a backstop, not a saving, because no tool returns that much today. Earlier answers in a thread are sent in full only for the most recent one; older ones are cut to their first 2,000 characters.

The last step always answers, and the whole answer is capped at `UPSTREAM_TOTAL_TIMEOUT` seconds. While Claude thinks or a tool runs, the stream carries `: ping` comment lines. The client ignores them, and they stop proxies from closing a quiet connection.

## The knowledge base

`scripts/build_corpus.py` builds it, and the monthly **Refresh assistant knowledge** workflow rebuilds it and commits the result. A commit to `server/` redeploys the service. The sources are:

- BSP's own website, read through its public WordPress data: team biographies, strategy, investments and news.
- Every web page the portal's research cites: press releases, SEC Form D filings, company pages and trade press.
- The portfolio companies' own sites.
- News coverage from Bing News and Google News.
- A few Wikipedia articles.
- The portal itself: every page and view as a visitor sees it, the research files and the prepared answers. Local signals shows one company's forces at a time, so each company's table is read as its own document (this is where Fair Harbor's weather and season forces come from).
- A short note on what the home-sales records cover: the counties, the date sales reach and the newest full month for each, the two home-records tools and the no-names rule. The build reads it from the `meta` table of `knowledge/homes.sqlite`, so it carries dates and no row counts. Rebuild the portal source after a sales refresh to move the dates.

Each document is cut into passages of about 1,100 characters. Each passage is indexed two ways in one SQLite file:

- **Keywords:** an FTS5 index ranked by BM25.
- **Meaning:** a static embedding. The tokenizer's token vectors (minishlab/potion-base-8M) are averaged and normalised, so a query is embedded with numpy alone, with no model server.

**Rebuild the portal part by hand.** Run it from the repo root. This needs no model download and fetches no outside website for text. It re-reads the research files, the prepared answers, the home-sales coverage and every rendered page, keeps the other sources as last collected, and rebuilds the index. Without `model2vec` the index step reuses the embedding table and tokenizer already stored in `kb.sqlite`, which are the same numbers. The rendered pages still load their map and chart libraries and the live weather alerts, as a visitor's browser would; nothing but a GET leaves the machine.

```bash
uv run --no-project --python 3.12 --with playwright==1.60.0 --with numpy==2.5.3 --with tokenizers==0.23.2 python scripts/build_corpus.py --only portal
```

A search runs both and merges the two rankings, so "who runs the firm" finds the CEO's biography even though the words differ. `knowledge/corpus.jsonl` is the readable copy of everything the assistant knows, one document per line; the server does not load it.

## Home-sales records

`knowledge/homes.sqlite` holds one row per recorded sale in the Punctual Pros territory: four New Jersey and eleven Pennsylvania counties, about 94,000 sales at the Nov 13, 2026 refresh, some 75,000 of them market sales of homes. The counts move with each refresh; the build prints the current ones and `/health` reports them. `property.py` reads it for the two BSP Desk tools. The concept-site assistants never get these tools.

**Rebuild.** Run this from the repo root after the home-sales files in `data/sales/` change, then commit the new file. It needs only the Python standard library and takes a few seconds. When the sales files have not changed, the build leaves the file on disk untouched, so a rebuild never makes a diff by itself.

```bash
python3 scripts/build_homes_db.py     # reads data/sales/pp_sales_nj.json, pp_sales_pa_a.json and pp_sales_pa_b.json
```

**Sources.** All public.

- New Jersey: the Division of Taxation's statewide sales file, for Atlantic, Burlington, Monmouth and Ocean counties.
- Pennsylvania: each county's open parcel or assessment data (Adams, Berks, Chester, Cumberland, Dauphin, Franklin, Lancaster, Lebanon, Montgomery, Perry and York).
- For a New Jersey address, `property_brief` also asks two state services live: the NJ Office of GIS parcel and tax list, and the Department of Community Affairs construction permit data on data.nj.gov. Each call has a 3 s timeout and one retry. If a service does not answer, the brief says it could not be checked and carries on.
- Pennsylvania has no public permit feed, so a Pennsylvania brief uses the sale record only. County assessor websites and listing sites are never fetched.

**Automatic refresh.** `scripts/fetch_pp_sales.py` runs inside the nightly GitHub Actions job (`.github/workflows/refresh-data.yml`) after the live snapshot. It runs once a week, on Mondays, and on every manual run of the workflow. It needs only the Python standard library. A run takes about 10 seconds when the New Jersey file has not changed and about two minutes when it has. The first run took 128 seconds.

```bash
python3 scripts/fetch_pp_sales.py --dry-run          # fetch and print the per-source table; write nothing
python3 scripts/fetch_pp_sales.py                    # merge and rewrite the files that changed
python3 scripts/fetch_pp_sales.py --only york --diff # one source, and which fields changed on rows already held
```

- **Why weekly.** County deeds post weeks late, so a weekly pull shows the same sales as a nightly one. The sales files and `homes.sqlite` change a little on almost every pull and pack poorly in git. A pull every night would add about 2.5 MB to the repository each night and deploy the backend each night. To pull every night anyway, set `SALES_REFRESH_DAY: 'daily'` at the top of the workflow.
- It asks each source for sales from the newest sale date held, less 45 days, up to today. Deeds are recorded late, so the overlap matters. New Jersey is a whole-file download, so every record in the posted files is read. The state posts the next sales year's file (`YTDSR1A<year>.zip`) while the current one is still up; both names are tried each run and an unmodified file is not downloaded again.
- Rows keep the id scheme of the first pull. A row that comes back with a changed source field replaces the held row. A held row that does not come back is kept. The county services hold only the latest sale per parcel, so this is how earlier sales survive.
- A sale can come back under a new id: New Jersey records a deed again in the next yearly file under a new book and page, and a county sometimes moves a sale date by a few days. The new row then replaces the held one, so the sale is not listed twice. The match is the same lot, date and price in a newer state file (NJ), or the same parcel, buyer and price within 45 days (PA).
- A source that errors, returns nothing, returns far fewer rows than are held for the overlap, or has lost a field leaves its rows untouched and is listed in the file's `meta.failed_sources`. The note is written once and stays the same while the failure lasts, so a long outage does not rewrite the file each run. A county with no rows held inside the window and none returned is not a failure; rows it holds from before the window then leave with the window. The run fails only when every source failed, and the workflow step never blocks the live-data commit.
- **Dauphin County is not refreshed.** Its rows came from a property-tax inquiry website whose robots.txt disallows automated access. The 227 rows already held are a frozen snapshot from Sep 24, 2026 and do not get newer. The script fetches robots.txt for every other host and skips a source whose path is disallowed. If a robots.txt cannot be read after three tries, that source is skipped for the run and the note says the file could not be read.
- **18-month window.** Sales older than 18 months are dropped. The cut-off is the first day of the month, so rows leave once a month. The window moves only for a source that answered in that run; a source that failed keeps all its rows until it answers again. Franklin County's public file has not been updated past December 2025, so its rows thin out as the window moves and are gone by July 2027.
- **File notes.** When rows change, `meta.coverage` is recomputed. The New Jersey source names every state file in use. Notes from the first pull that quote a date or a count are marked "First pull (2026-09-24)". A county's `retrieved` date is the day its rows last changed, not the day the source was last asked, so a brief's "records pulled" date can be older than the last run. The run log has the per-source table for every run.
- The files are written in a fixed row order and JSON layout. A file whose rows did not change is not rewritten, and `meta.generated` moves only when rows change. The workflow rebuilds `homes.sqlite` only when a sales file changed. A changed `homes.sqlite` triggers a backend deploy; an unchanged run does not.
- Buyer and seller columns stay as they are in the site files. The refresh adds no other personal field, and `homes.sqlite` still carries no names.
- **Town names.** Fifteen Lancaster rows carry no town, because three Lancaster municipality codes had no town in the first pull either. The script logs any Lancaster code it has not seen before. Berks and Lebanon rows with no town in the source take the town of their parcel-number prefix.

**No names.** The build step drops buyer and seller names, so the database has no owner column and no answer can name an owner. Mail is addressed to "New homeowner". The source files' QA notes quote sample records with owner names, so those notes are not copied either. The build stops without writing a file if a buyer or seller name from the source rows turns up in the notes or source list it keeps.

**The lag.** Public sale records run behind. At the Nov 13, 2026 refresh the New Jersey files reached mid-October 2026 with July 2026 as the newest full month; Pennsylvania's newest full month was September 2026. A month counts as full for a state only when the counties that are full for it carry at least 90% of recent sales, so a month that some counties have only part posted is not reported as full. The gap to today is the publisher's lag plus the age of this copy. Every list and every brief states the date the sales reach and the date the records were pulled. A brief also says that a purchase after that date is not in the data yet, and a brief with no sale on record asks when the caller bought. A request for a month the data has not reached says so and gives the newest full month. A period that cannot be read says so too. The assistant is told never to present recorded sales as this month's.

**One brief, one lot.** A condo building, or a street the county records without house numbers, puts many lots under one address. A brief never merges them: it lists the lots and asks for the unit. With the unit in the address ("4901 Harbor Beach Blvd Unit A7") it briefs the lot whose state unit code matches.

**Permits.** The lookup asks for the block and lot as written and in the zero-padded forms some towns file. A town with no rows in the feed at all (Lakehurst and Pine Beach, as of Nov 12, 2026) gets "does not report", not "no permit on record".

**What a brief can and cannot say.** Every fact is tagged recorded (with its source and date) or inferred. Offers are leads with their evidence: a permit that is not on record is not proof that no work was done. No record says where pipes, the panel or the water heater are, so the brief never does.

| Setting | Default | Notes |
|---|---|---|
| `HOMES_DB_PATH` | `knowledge/homes.sqlite` | Another database file |
| `PROPERTY_LIVE` | `on` | `off` skips the two live New Jersey lookups (the tests set it) |
| `PROPERTY_LIVE_TIMEOUT` | `3` | Seconds per attempt for a live lookup |

| File | Purpose |
|---|---|
| `app.py` | Routes, validation, rate limits, the research loop and its streaming relay, SQLite storage (FastAPI, uvicorn, the Anthropic Python SDK) |
| `knowledge.py` | Opens `knowledge/kb.sqlite` and runs the hybrid search |
| `dealmath.py` | The acquisition model (port of `modules/deal-lib.js`) and the `deal_model` tool |
| `property.py` | The home-sales records and the `new_homeowners` and `property_brief` tools (reads `knowledge/homes.sqlite`, built by `scripts/build_homes_db.py`) |
| `chatlog.py` | The chat log: one JSON file per question and answer (and per rating) in a private Vercel Blob store |
| `knowledge/` | `kb.sqlite` (the index), `deal_presets.json` (the model's presets), `corpus.jsonl` (readable copy of every document), all built by `scripts/build_corpus.py` |
| `main.py` | Zero-config start for Railway: Railpack runs `python main.py` when it finds this file |
| `requirements.txt` | Pinned dependencies (Python 3.10 or newer; `.python-version` asks for 3.12). `requirements-dev.txt` adds the test tools. |
| `railway.json` | Start command, `/health` check and restart-on-failure. Railway only reads this for services created before config files were deprecated, and stops reading it on Dec 1, 2026. New services use `main.py` plus the dashboard settings below. |
| `tests/` | `test_server.py` (pytest over real HTTP), `e2e_browser.py` (Playwright with the real site), `mock_claude.py` (stand-in for the Claude API) |

## Voice mode

`POST /chat` with `"mode": "voice"` returns one short answer written to be read aloud. It is the same stream with the same personas, tool rules, per-visitor limit and daily cap.

- **One step.** The server looks up four excerpts and Claude answers from them. There is no search or read loop and no web search.
- **One tool call at most.** Only a question that clearly belongs to the home records or the deal model is offered that tool (BSP Desk only, as in chat). Claude may call it once; the next call must answer.
- **Short and plain.** The rules ask for under about 80 words in spoken sentences, numbers said the way a person says them, the answer first, and a plain statement when the knowledge base does not cover the question. Effort is `low`. `max_tokens` is 3,000: a ceiling that covers the model's thinking, one tool call and the answer, not a length (the rules and the effort set that). The reasoning is never streamed. An answer that still hits the ceiling ends with one spoken line saying so; when nothing was spoken, the stream ends with an `error` event (`cut_off`) and the page falls back to its own answer.
- **Clean text, whatever the model writes.** The server strips markdown, `[n]` markers, links and web addresses from the stream before it leaves, so the text can go straight to speech. A list item, heading or table row gets a full stop, so a list is not read as one run-on sentence. A preamble before a tool call is dropped.
- **Sources still arrive.** The `sources` event is sent as usual, so the screen can show what the answer rests on. `done` carries `"mode": "voice"`.

Voice requests carry the last six turns at most, each cut to 1,500 characters, and the first 3,000 characters of the page context.

## Model state and the key check

`/health` used to report `llm: true` whenever a key was set, even when every answer failed on a dead key. It now reports what the provider last said:

- **From real calls, free.** Every `/chat` call records its outcome: `ok`, `auth` (key rejected), `billing` (no credit or another billing problem), `rate_limited`, `down` or `error` (for example a model the account cannot use). `/health` and `/stats` return it as `llm_state` and `model_state` (`state`, `ok`, `message`, `checked_at`, `source`, `last_call`, `probe`). `llm` is false for `no_key`, `auth`, `billing` and `error`. A rate limit or an outage is reported but leaves `llm` true, and stops counting after ten minutes.
- **`GET /health?deep=1`, the key check.** One request with `max_tokens: 0` to the model the site uses: the provider reads a one-word prompt and writes nothing, so it costs a few input tokens (well under a hundredth of a cent). It goes through the same key, account and model checks as an answer. The server runs it at most once per ten minutes per instance (once a minute after a rate limit or an outage) and returns the stored result in between, with `model_state.check` saying which happened. The public endpoint cannot be used to spend credit.
- **`unverified`.** The state lives in memory, so it describes one instance. A fresh instance has a key but no evidence yet and says `unverified` (`llm` stays true). The site asks for the key check once in that case, and the scheduled workflow below always does.
- **Recovery.** `auth`, `billing` and `error` do not expire by themselves, and the site stops sending questions while `llm` is false. So the site also asks for the key check when it loads to an off state and before a question, at most once per ten minutes per page. Once the key or the account is fixed, the next check clears the state with no redeploy.
- **A real reply.** The key check counts HTTP 200 as `ok` only when the body is a model reply. A web page from a wrong address or a gateway is recorded as `error`.

What the key check can and cannot find:

- It finds a missing, invalid or revoked key (401), a key without permission (403), a billing error (402, or the 400 "credit balance is too low"), a model the account cannot use (404), a rate limit (429) and a provider outage (5xx, 529, timeout).
- It has not been run against a real account with no credit left: there is no key on the development machine. The provider documents billing errors on the Messages endpoint, and a zero-output request is a Messages request, so it should be refused the same way. A real `/chat` call records `billing` either way, and that also flips `llm`.
- It does not test the optional features an answer uses (web search, the fallback beta), limits that only bite under load, or the site's own daily cap.

`.github/workflows/assistant-health.yml` calls the key check four times a day and fails when live answers are off; GitHub emails the repository owner when a scheduled run fails. It retries through a cold start, waits out a rate limit or an outage, and does not fail on a slow answer. In the site, the assistant header says "Limited" instead of "Online" when the backend reports that live answers are off.

## Endpoints

These are the same endpoints as the Worker. CORS only allows the origins in `ALLOWED_ORIGINS`, and a POST from any other origin gets `403`.

| Method and path | Returns |
|---|---|
| `GET /health` (also `/`) | `{ok, model, version, db, llm, llm_state, model_state, kv, log, kb, homes}`. `llm` is false when no Claude key is set or the provider last rejected the key or the account (see [Model state and the key check](#model-state-and-the-key-check)); `?deep=1` runs the key check; `kv` is always true because rate limits are kept in memory; `log` says whether the chat log is on; `kb` gives the knowledge base's document and passage counts and build time (false if it could not open); `homes` gives the home-sales row counts, build time and data-through dates per state (false if the file is missing). |
| `POST /chat` | `text/event-stream` of `data: {"type": "meta" \| "status" \| "thinking" \| "sources" \| "text" \| "done" \| "error", ...}`, or a JSON error. Body: `{persona, question, messages, context, retrieve, page, mode}`; `context` items become the first numbered sources, `retrieve: false` skips the knowledge-base search (used by "Expand with Claude"), and `mode: "voice"` asks for a short spoken answer (see [Voice mode](#voice-mode)). `done` carries `mode`, `steps` and `usage: {input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`. |
| `POST /feedback` | `201 {ok, id}` (the rating also goes to the chat log) |
| `POST /log` | `202 {ok, saved}`. An answer the browser built itself (portfolio data, a prepared deep dive, a fallback) for the chat log: `{persona, question, answer, kind, intent, engine, sources, seconds, page}`. Shares the save rate limit with `/feedback` and `/thread`. |
| `POST /thread` | `{ok, thread_id, updated_at}` (insert, or update if the thread exists) |
| `GET /thread/:id` | `{ok, thread_id, persona, title, messages, created_at, updated_at}` |
| `GET /stats` | `{threads, messages, feedback, feedback_up, feedback_down, today:{requests, tokens_in, tokens_out}, daily_cap, model, llm, llm_state, model_state, knowledge, homes}` |

Error codes match the Worker: `no_model_key`, `rate_limited`, `daily_cap`, `upstream_busy`, `backend_auth`, `backend_billing`, `bad_mode`, `upstream_unavailable`, `upstream_timeout`, `refusal`, and the rest. A 400 from Claude that names an optional feature (web search, the server-side fallback beta, effort) is retried once without it.

**Timeouts:** connecting to Claude times out after 6 s, and the wait for Claude's first reply after 45 s. A whole answer, tool calls included, is capped at 150 s (`UPSTREAM_TOTAL_TIMEOUT`); if it runs longer, the stream ends with an `upstream_timeout` error event. When a visitor presses Stop or closes the page, the server cancels the Claude stream at once and logs `visitor disconnected ... cancelled the upstream Claude stream`.

## Configuration (environment variables)

| Name | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | **Secret.** Set it only in the host's variables UI, never in a file. Without it, `/health` reports `llm:false` and the site keeps using its grounded answers. |
| `MODEL` | `claude-opus-5-5` | `claude-sonnet-5-5` costs about half as much per answer |
| `EFFORT` | `medium` | `low`, `medium` or `high` |
| `WEB_SEARCH` | `on` | `off` removes web search from BSP Desk (it is never offered to the concept-site assistants) |
| `DAILY_CAP` | `400` | Total `/chat` requests per UTC day across all visitors. `0` switches Claude off. |
| `RL_PER_10MIN` | `30` | `/chat` requests per visitor in any 10-minute window |
| `ALLOWED_ORIGINS` | `https://broadsky-agent.vercel.app,https://broadsky-desk.vercel.app,https://syedr64.github.io,http://127.0.0.1:8765,http://localhost:8765` | Comma-separated. The site's own addresses (`SITE_ORIGINS`: broadsky-agent.vercel.app, its earlier name broadsky-desk.vercel.app, and GitHub Pages) are always allowed. |
| `DB_PATH` | `$RAILWAY_VOLUME_MOUNT_PATH/bsp_assistant.db` if a volume is attached, else `data/bsp_assistant.db` next to `app.py` | The folder is created if it is missing |
| `UPSTREAM_TOTAL_TIMEOUT` | `150` | Seconds per answer, tool calls included |
| `BLOB_READ_WRITE_TOKEN` | (unset) | **Secret.** Vercel adds it when a Blob store is connected to the project (here: the private store `bsp-desk-chats`). With it, every question and answer is saved to the store; without it the chat log is off. |
| `CHAT_LOG` | `on` | `off` stops the chat log while keeping the store connected |
| `FAKE_ANTHROPIC_URL` | (unset) | **Tests only.** Sends Claude calls to a local mock instead of api.anthropic.com. |
| `VERCEL_BLOB_API_URL` | `https://vercel.com/api/blob` | **Tests only.** Points the chat log at the mock store. |

Visitors are identified by a salted SHA-256 hash of their IP address, never the raw IP. The IP is read from `X-Real-IP` (which Railway's edge sets), then the last hop of `X-Forwarded-For`, then the socket address. Per-visitor limits are kept in memory, so they reset when the server restarts. The daily cap is stored in SQLite, so it survives restarts as long as the database is on a volume.

## Run locally

```bash
cd server
python3 -m pip install --user -r requirements-dev.txt
export ANTHROPIC_API_KEY=...            # in your shell only
python3 -m uvicorn app:app --host 127.0.0.1 --port 8787
# Serve the site:  python3 -m http.server 8765 --bind 127.0.0.1   (from the repo root)
# Then open http://127.0.0.1:8765/assistant.html?backend=http://127.0.0.1:8787
```

To try it with no key and no cost, use the mock Claude API:

```bash
python3 tests/mock_claude.py --port 8799 &
FAKE_ANTHROPIC_URL=http://127.0.0.1:8799 ANTHROPIC_API_KEY=test-not-a-real-key python3 -m uvicorn app:app --port 8787
```

The mock calls a tool when the question carries a marker: `[mock:homes]` runs `new_homeowners` for Ocean County and `[mock:brief]` runs `property_brief` for a Pennsylvania address. The markers are listed at the top of `tests/mock_claude.py`.

## Chat log

Every question and answer is saved for later analysis in the private Vercel Blob store **bsp-desk-chats** (team BSP, connected to this project), one JSON file each:

- `chats/YYYY/MM/DD/HHMMSS-<id>.json`: the question, earlier turns, the page it was asked on, the answer as shown, the reasoning summary, the progress steps, the numbered sources, how it ended (`answered`, `error`, `refused`, `left early`, `stopped`), the model, tokens and seconds. `source` is `server` for the research agent's answers and `browser` for answers the page built from the portfolio data or a prepared deep dive (those arrive on `POST /log`, with the intent that answered).
- `ratings/YYYY/MM/DD/HHMMSS-<id>.json`: each thumbs up or down, with the question and an excerpt of the answer.

Visitors appear only as a hashed id (`visitor`), never by address. The server writes after the answer's last event and before the stream closes; a slow or missing store only skips the record. To browse: Vercel dashboard → Storage → bsp-desk-chats → Browser. To analyze, download everything into one file with `scripts/export_chats.py` (standard library only):

```bash
BLOB_READ_WRITE_TOKEN=… python3 scripts/export_chats.py                       # writes chat-logs/chats.csv, chats.jsonl, ratings.csv, ratings.jsonl
python3 scripts/export_chats.py --env-file server/.env.local --since 2026-10-01  # after `vercel env pull .env.local` in server/
```

The token is on the store's **.env.local** tab in the dashboard. `chat-logs/` is ignored by git: the logs hold visitors' questions and stay off the public repository. Re-running only downloads new files.

## Tests

```bash
cd server
python3 -m pytest -q tests          # starts its own mock and servers on free ports; covers the tool loop, sources and limits, and the home-records tools (test_property.py)
python3 tests/e2e_browser.py        # browser checks with the real site in headless Chromium (needs Playwright)
python3 tests/measure_tokens.py --voice   # estimates what three typical questions send, part by part, in chat and voice mode
```

The mock (`tests/mock_claude.py`) can script a run of tool calls (`[mock:plan:…]`), fail the key check (`POST /_probe`), report cache usage (`[mock:cache]`) and answer in heavy markdown (`[mock:md]`).

## Deploy on Railway

1. **Create the service.** At railway.com, choose New Project, then Deploy from GitHub repo, and pick this repository. In the service's **Settings**, set **Root Directory** to `server`. Railpack sees `requirements.txt`, installs the dependencies, and starts the app with `python main.py`, which listens on Railway's `$PORT`.
2. **Add the secret.** Under **Variables**, add `ANTHROPIC_API_KEY`. The other variables are optional.
3. **Keep data across deploys.** Choose Add Volume and mount it at `/data`. The app picks up `RAILWAY_VOLUME_MOUNT_PATH` by itself. Without a volume, the database is erased on every redeploy.
4. **Turn on health checks.** Under Settings, then Deploy, set the healthcheck path to `/health` and the restart policy to On Failure.
5. **Get a public URL.** Under Settings, then Networking, choose Generate Domain. Check `https://<name>.up.railway.app/health`: it should return `"llm": true`.
6. **Point the site at it.** Set `chatEndpoint` in `assets/runtime.json` to that URL and push. The site checks `/health` on every page load, and if the backend is down, it quietly uses the grounded engine instead. Note that `.github/workflows/deploy-worker.yml` targets Cloudflare and stays idle without the `CLOUDFLARE_*` secrets, so it never overwrites this file.

## Cost notes (estimates)

- **Railway.** The server uses about 47 MB of memory when idle (measured locally) and almost no CPU, roughly $0.50 to $1 a month at Railway's rates ($10 per GB of RAM per month, $20 per vCPU per month, $0.15 per GB of volume per month), est. That fits within the Hobby plan's included $5 of usage ($5 a month subscription). The Free plan gives $1 of credit a month with 0.5 GB of RAM and a 0.5 GB volume, which may cover it.
- **Claude.** Each step sends the fixed part again (rules and tool definitions: about 4,500 tokens by the estimate in `tests/measure_tokens.py`, more than half of a typical step), then the retrieved excerpts, the conversation and every tool result so far. The fixed part and the growing conversation are marked for the prompt cache, so each step after the first reads the earlier ones at a twentieth of the input price on Claude Opus 5.5 when the cache hits; the first step pays a 25% premium to write it. The chat log records `tokens.cache_read` and `tokens.cache_write` per answer and per step (`usage_steps`), so the real discount can be read after a deploy. A voice answer sends about 2,000 to 8,000 tokens in one or two steps. A one-step voice answer marks nothing for the cache, because nothing would read it back; a two-step one marks the fixed part, and its second step reads it. A typical chat answer costs about $0.03 to $0.10 on Claude Opus 5.5 ($4 and $20 per million input and output tokens); web searches add $0.01 each. `DAILY_CAP` sets a hard daily limit on spend. Set `MODEL=claude-sonnet-5-5` to roughly halve the cost per answer.
- **Single process.** Run one replica. The per-visitor limits are in memory, and SQLite expects one writer. If you need more capacity, move storage to Railway Postgres before adding replicas.

Author: Syed Rahman.
