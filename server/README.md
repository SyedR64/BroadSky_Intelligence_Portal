# Assistant backend (Python, no Cloudflare)

This is the hosted part of the BSP Desk assistant, rewritten from the Cloudflare Worker in [`../worker`](../worker) as a small Python web service. It keeps the Claude API key on the server, so every visitor gets Claude answers grounded in the portal's own data without bringing a key. It also saves conversation threads and answer feedback, and enforces per-visitor and daily limits.

The routes, JSON shapes and streaming events match the Worker exactly, so the site's client (`assets/backend.js`) works without changes. The only difference on the wire: while Claude is thinking, the stream carries `: ping` comment lines. The client ignores them, and they stop proxies from closing a quiet connection.

| File | Purpose |
|---|---|
| `app.py` | Routes, validation, rate limits, the Claude streaming proxy, SQLite storage (FastAPI + uvicorn + httpx) |
| `main.py` | Zero-config start for Railway: Railpack runs `python main.py` when it finds this file |
| `requirements.txt` | Pinned dependencies (Python 3.9 or newer; `.python-version` asks Railway for 3.12) |
| `railway.json` | Start command, `/health` check and restart-on-failure. Railway only reads this for services created before config files were deprecated, and stops reading it on Dec 1, 2026. New services use `main.py` plus the dashboard settings below. |
| `tests/` | `test_server.py` (pytest over real HTTP), `e2e_browser.py` (Playwright with the real site), `mock_claude.py` (stand-in for the Claude API) |

## Endpoints

These are the same endpoints as the Worker. CORS only allows the origins in `ALLOWED_ORIGINS`, and a POST from any other origin gets `403`.

| Method and path | Returns |
|---|---|
| `GET /health` (also `/`) | `{ok, model, version, db, llm, kv}`. `llm` is false when no Claude key is set, and `kv` is always true because rate limits are kept in memory. |
| `POST /chat` | `text/event-stream` of `data: {"type": "meta" \| "text" \| "done" \| "error", ...}`, or a JSON error |
| `POST /feedback` | `201 {ok, id}` |
| `POST /thread` | `{ok, thread_id, updated_at}` (insert, or update if the thread exists) |
| `GET /thread/:id` | `{ok, thread_id, persona, title, messages, created_at, updated_at}` |
| `GET /stats` | `{threads, messages, feedback, feedback_up, feedback_down, today:{requests, tokens_in, tokens_out}, daily_cap, model}` |

Error codes match the Worker: `no_model_key`, `rate_limited`, `daily_cap`, `upstream_busy`, `backend_auth`, `upstream_unavailable`, `upstream_timeout`, `refusal`, and the rest. The persona system prompts and grounding rules are copied word for word from the Worker.

**Timeouts:** connecting to Claude times out after 6 s, and the wait for Claude's first reply after 45 s. A whole answer is capped at 120 s (`UPSTREAM_TOTAL_TIMEOUT`); if it runs longer, the stream ends with an `upstream_timeout` error event. When a visitor presses Stop or closes the page, the server cancels the Claude stream at once and logs `visitor disconnected ... cancelled the upstream Claude stream`.

## Configuration (environment variables)

| Name | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | **Secret.** Set it only in the host's variables UI, never in a file. Without it, `/health` reports `llm:false` and the site keeps using its grounded answers. |
| `MODEL` | `claude-opus-5-5` | `claude-sonnet-5-5` costs about half as much per answer |
| `EFFORT` | `medium` | `low`, `medium` or `high` |
| `DAILY_CAP` | `2000` | Total `/chat` requests per UTC day across all visitors. `0` switches Claude off. |
| `RL_PER_10MIN` | `30` | `/chat` requests per visitor in any 10-minute window |
| `ALLOWED_ORIGINS` | `https://syedr64.github.io,http://127.0.0.1:8765,http://localhost:8765` | Comma-separated |
| `DB_PATH` | `$RAILWAY_VOLUME_MOUNT_PATH/bsp_assistant.db` if a volume is attached, else `data/bsp_assistant.db` next to `app.py` | The folder is created if it is missing |
| `UPSTREAM_TOTAL_TIMEOUT` | `120` | Seconds per answer |
| `FAKE_ANTHROPIC_URL` | (unset) | **Tests only.** Sends Claude calls to a local mock instead of api.anthropic.com. |

Visitors are identified by a salted SHA-256 hash of their IP address, never the raw IP. The IP is read from `X-Real-IP` (which Railway's edge sets), then the last hop of `X-Forwarded-For`, then the socket address. Per-visitor limits are kept in memory, so they reset when the server restarts. The daily cap is stored in SQLite, so it survives restarts as long as the database is on a volume.

## Run locally

```bash
cd server
python3 -m pip install --user -r requirements.txt
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

## Tests

```bash
cd server
python3 -m pytest -q tests          # 22 tests; starts its own mock and servers on free ports
python3 tests/e2e_browser.py        # 16 browser checks with the real site in headless Chromium (needs Playwright)
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
- **Claude.** Each answer sends about 3,000 input tokens (the persona, grounding rules and up to 12,000 characters of context) and uses at most 2,000 output tokens. `DAILY_CAP` sets a hard daily limit on spend. Set `MODEL=claude-sonnet-5-5` to roughly halve the cost per answer.
- **Single process.** Run one replica. The per-visitor limits are in memory, and SQLite expects one writer. If you need more capacity, move storage to Railway Postgres before adding replicas.

Author: Syed Rahman.
