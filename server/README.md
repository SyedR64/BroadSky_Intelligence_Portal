# Assistant backend (Python, no Cloudflare)

This is the hosted part of the BSP Desk assistant: a small Python web service, first written as a port of the Cloudflare Worker in [`../worker`](../worker). It keeps the Claude API key on the server and answers every question with Claude working as a research agent over a real knowledge base. It also saves conversation threads and answer feedback, and enforces per-visitor and daily limits.

## How an answer is made

1. **Retrieve.** The server searches the knowledge base (`knowledge/kb.sqlite`) for the question and puts the best six excerpts, numbered, in front of Claude. A short follow-up is searched together with the previous question.
2. **Research.** Claude can call three tools before it answers, up to five model steps in all:
   - `search_knowledge`: search again with other words, a name or a company;
   - `read_source`: read a whole source when an excerpt is cut off;
   - `deal_model`: run the acquisition model (`dealmath.py`, a line-for-line port of `modules/deal-lib.js`, so the numbers match the portal and its Excel download) for price, financing, returns, a DCF and what a buyer can pay, and return a link that opens the same scenario in the portal.

   For BSP Desk only, Claude also has Anthropic's web search for public facts the knowledge base does not hold.
3. **Answer.** Claude writes a short answer that cites its sources as `[1]`, `[2]`. The stream tells the site what is happening (`status`), which numbered sources the answer can cite (`sources`, sent again when the list grows) and then the text.

The last step always answers, and the whole answer is capped at `UPSTREAM_TOTAL_TIMEOUT` seconds. While Claude thinks or a tool runs, the stream carries `: ping` comment lines. The client ignores them, and they stop proxies from closing a quiet connection.

## The knowledge base

`scripts/build_corpus.py` builds it, and the monthly **Refresh assistant knowledge** workflow rebuilds it and commits the result. A commit to `server/` redeploys the service. The sources are:

- BSP's own website, read through its public WordPress data: team biographies, strategy, investments and news.
- Every web page the portal's research cites: press releases, SEC Form D filings, company pages and trade press.
- The portfolio companies' own sites.
- News coverage from Bing News and Google News.
- A few Wikipedia articles.
- The portal itself: every page and view as a visitor sees it, the research files and the prepared answers.

Each document is cut into passages of about 1,100 characters. Each passage is indexed two ways in one SQLite file:

- **Keywords:** an FTS5 index ranked by BM25.
- **Meaning:** a static embedding. The tokenizer's token vectors (minishlab/potion-base-8M) are averaged and normalised, so a query is embedded with numpy alone, with no model server.

A search runs both and merges the two rankings, so "who runs the firm" finds the CEO's biography even though the words differ. `knowledge/corpus.jsonl` is the readable copy of everything the assistant knows, one document per line; the server does not load it.

| File | Purpose |
|---|---|
| `app.py` | Routes, validation, rate limits, the research loop and its streaming relay, SQLite storage (FastAPI, uvicorn, the Anthropic Python SDK) |
| `knowledge.py` | Opens `knowledge/kb.sqlite` and runs the hybrid search |
| `dealmath.py` | The acquisition model (port of `modules/deal-lib.js`) and the `deal_model` tool |
| `chatlog.py` | The chat log: one JSON file per question and answer (and per rating) in a private Vercel Blob store |
| `knowledge/` | `kb.sqlite` (the index), `deal_presets.json` (the model's presets), `corpus.jsonl` (readable copy of every document), all built by `scripts/build_corpus.py` |
| `main.py` | Zero-config start for Railway: Railpack runs `python main.py` when it finds this file |
| `requirements.txt` | Pinned dependencies (Python 3.10 or newer; `.python-version` asks for 3.12). `requirements-dev.txt` adds the test tools. |
| `railway.json` | Start command, `/health` check and restart-on-failure. Railway only reads this for services created before config files were deprecated, and stops reading it on Dec 1, 2026. New services use `main.py` plus the dashboard settings below. |
| `tests/` | `test_server.py` (pytest over real HTTP), `e2e_browser.py` (Playwright with the real site), `mock_claude.py` (stand-in for the Claude API) |

## Endpoints

These are the same endpoints as the Worker. CORS only allows the origins in `ALLOWED_ORIGINS`, and a POST from any other origin gets `403`.

| Method and path | Returns |
|---|---|
| `GET /health` (also `/`) | `{ok, model, version, db, llm, kv, log, kb}`. `llm` is false when no Claude key is set; `kv` is always true because rate limits are kept in memory; `log` says whether the chat log is on; `kb` gives the knowledge base's document and passage counts and build time (false if it could not open). |
| `POST /chat` | `text/event-stream` of `data: {"type": "meta" \| "status" \| "thinking" \| "sources" \| "text" \| "done" \| "error", ...}`, or a JSON error. Body: `{persona, question, messages, context, retrieve, page}`; `context` items become the first numbered sources, and `retrieve: false` skips the knowledge-base search (used by "Expand with Claude"). |
| `POST /feedback` | `201 {ok, id}` (the rating also goes to the chat log) |
| `POST /log` | `202 {ok, saved}`. An answer the browser built itself (portfolio data, a prepared deep dive, a fallback) for the chat log: `{persona, question, answer, kind, intent, engine, sources, seconds, page}`. Shares the save rate limit with `/feedback` and `/thread`. |
| `POST /thread` | `{ok, thread_id, updated_at}` (insert, or update if the thread exists) |
| `GET /thread/:id` | `{ok, thread_id, persona, title, messages, created_at, updated_at}` |
| `GET /stats` | `{threads, messages, feedback, feedback_up, feedback_down, today:{requests, tokens_in, tokens_out}, daily_cap, model}` |

Error codes match the Worker: `no_model_key`, `rate_limited`, `daily_cap`, `upstream_busy`, `backend_auth`, `upstream_unavailable`, `upstream_timeout`, `refusal`, and the rest. A 400 from Claude that names an optional feature (web search, the server-side fallback beta, effort) is retried once without it.

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
python3 -m pytest -q tests          # starts its own mock and servers on free ports; covers the tool loop, sources and limits
python3 tests/e2e_browser.py        # 18 browser checks with the real site in headless Chromium (needs Playwright)
```

## Deploy on Railway

1. **Create the service.** At railway.com, choose New Project, then Deploy from GitHub repo, and pick this repository. In the service's **Settings**, set **Root Directory** to `server`. Railpack sees `requirements.txt`, installs the dependencies, and starts the app with `python main.py`, which listens on Railway's `$PORT`.
2. **Add the secret.** Under **Variables**, add `ANTHROPIC_API_KEY`. The other variables are optional.
3. **Keep data across deploys.** Choose Add Volume and mount it at `/data`. The app picks up `RAILWAY_VOLUME_MOUNT_PATH` by itself. Without a volume, the database is erased on every redeploy.
4. **Turn on health checks.** Under Settings, then Deploy, set the healthcheck path to `/health` and the restart policy to On Failure.
5. **Get a public URL.** Under Settings, then Networking, choose Generate Domain. Check `https://<name>.up.railway.app/health`: it should return `"llm": true`.
6. **Point the site at it.** Set `chatEndpoint` in `assets/runtime.json` to that URL and push. The site checks `/health` on every page load, and if the backend is down, it quietly uses the grounded engine instead. Note that `.github/workflows/deploy-worker.yml` targets Cloudflare and stays idle without the `CLOUDFLARE_*` secrets, so it never overwrites this file.

## Cost notes (estimates)

- **Railway.** The server uses about 47 MB of memory when idle (measured locally) and almost no CPU, roughly $0.50 to $1 a month at Railway's rates ($10 per GB of RAM per month, $20 per vCPU per month, $0.15 per GB of volume per month), est. That fits within the Hobby plan's included $5 of usage ($5 a month subscription). The Free plan gives $1 of credit a month with 0.5 GB of RAM and a 0.5 GB volume, which may cover it.
- **Claude.** The first step sends about 6,000 to 9,000 input tokens (rules, tools, the retrieved sources and the conversation); each extra research step adds the new search results, and the cached prefix is read back at a tenth of the price. A typical answer costs about $0.03 to $0.10 on Claude Opus 5.5 ($4 and $20 per million input and output tokens); web searches add $0.01 each. `DAILY_CAP` sets a hard daily limit on spend. Set `MODEL=claude-sonnet-5-5` to roughly halve the cost per answer.
- **Single process.** Run one replica. The per-visitor limits are in memory, and SQLite expects one writer. If you need more capacity, move storage to Railway Postgres before adding replicas.

Author: Syed Rahman.
