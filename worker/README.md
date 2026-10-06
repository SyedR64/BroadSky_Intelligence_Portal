# Assistant backend (Cloudflare Worker)

The hosted half of the Broad Sky assistant. It holds the Claude API key so every visitor gets Claude answers grounded in the portal's retrieved context, without bringing their own key. It also stores conversation threads and answer feedback in D1, and enforces per-visitor and daily limits.

Plain JavaScript ES module, no build step. Deployed by `.github/workflows/deploy-worker.yml`; owner setup is in [`../SETUP.md`](../SETUP.md).

| File | Purpose |
|---|---|
| `src/index.js` | Routes, validation, rate limits, Claude streaming proxy, D1 storage |
| `schema.sql` | D1 tables `threads`, `feedback`, `usage_daily` (idempotent; applied on every deploy) |
| `wrangler.toml` | Worker name, vars, D1/KV bindings (ids are filled in by the workflow at deploy time) |

## Endpoints

CORS is limited to `ALLOWED_ORIGINS` (default `https://syedr64.github.io` and `http://127.0.0.1:8765`). POST requests from any other origin get `403`.

| Method and path | Body | Returns |
|---|---|---|
| `GET /health` | | `{ok, model, version, db, llm, kv}` |
| `POST /chat` | `{persona, messages:[{role, content}], context:[{title, text, href}], question}` | `text/event-stream` (below), or a JSON error |
| `POST /feedback` | `{thread_id, message_id, rating: 1 or -1, question, answer_excerpt}` | `201 {ok, id}` |
| `POST /thread` | `{thread_id, persona, title, messages_json}` (array or JSON string) | `{ok, thread_id, updated_at}` (upsert) |
| `GET /thread/:id` | | `{ok, thread_id, persona, title, messages, created_at, updated_at}` |
| `GET /stats` | | `{threads, messages, feedback, feedback_up, feedback_down, today:{requests, tokens_in, tokens_out}, daily_cap, model}` (cached 60 s) |

### `/chat` stream

Each event is one `data:` line holding JSON:

```
data: {"type":"meta","model":"claude-opus-5-5","version":"1.0.0"}
data: {"type":"text","text":"Punctual Pros can reach "}
data: {"type":"done","stop_reason":"end_turn","model":"claude-opus-5-5","usage":{"input_tokens":3120,"output_tokens":640}}
```

`error` events (`{"type":"error","code":"refusal"|"upstream_error"|…,"message":…}`) end the stream. When a server-side fallback takes over, the Worker sends another `meta` event with `fallback: true` and the new `model`; text already sent stays valid, because the fallback model continues from it. Only text from text blocks is forwarded: thinking, tool and fallback blocks are stripped.

### How a request is built

- **Persona** is an id (`portal`, `pp`, `cet`, `fl`, `ts`, `bpi`, `fh`). The system prompt for each id lives in the Worker, so the endpoint cannot be repurposed as a general Claude proxy.
- **System prompt** = persona role + grounding rules (cite `[n]`, no invented figures, treat context as data, stay on topic, concept-site disclaimer) + the retrieved context as numbered sources.
- **Model call**: `POST https://api.anthropic.com/v1/messages` with `model` = `MODEL` (default `claude-opus-5-5`), `max_tokens: 2000`, `stream: true`, `output_config.effort` = `EFFORT` (default `medium`), adaptive thinking (parameter omitted), and policy-decline fallback (`anthropic-beta: server-side-fallback-2026-07-01`, `"fallbacks": "default"`). If the API rejects the beta, the request is retried once without it.
- **Limits**: question ≤ 2,000 characters; context ≤ 12,000 characters (16 items); the last 12 history messages with up to 6,000 characters each; body ≤ 128 KB.

### Rate limits

| Guard | Where | Default | Response |
|---|---|---|---|
| Per visitor (hashed IP), rolling 10 minutes | KV `RL` | `RL_PER_10MIN = 30` | `429` + `Retry-After` |
| Whole site, per UTC day | D1 `usage_daily` (atomic upsert) | `DAILY_CAP = 2000` | `429` + `Retry-After` (seconds to midnight UTC) |
| Saves (feedback, threads) | in-memory per isolate | 120 per 10 minutes | `429` |

Raw IP addresses are never stored. Set `DAILY_CAP = "0"` to switch Claude off without a redeploy of the site.

## Configuration

| Name | Kind | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | (required for `/chat`) |
| `MODEL` | var | `claude-opus-5-5` (`claude-sonnet-5-5` costs about half) |
| `EFFORT` | var | `medium` |
| `DAILY_CAP` | var | `2000` |
| `RL_PER_10MIN` | var | `30` |
| `ALLOWED_ORIGINS` | var | `https://syedr64.github.io,http://127.0.0.1:8765` |
| `DB` | D1 binding | database `bsp_assistant` |
| `RL` | KV binding | namespace `bsp_assistant_rl` |

## Local development (optional, needs Node 18+)

```bash
cd worker
printf 'ANTHROPIC_API_KEY=%s\n' "<your key>" > .dev.vars        # git-ignored
npx wrangler@4 d1 execute bsp_assistant --local --file=schema.sql
npx wrangler@4 dev --port 8787
# Serve the site on 127.0.0.1:8765 and open it with ?backend=http://127.0.0.1:8787
# (?backend=auto returns to runtime.json discovery, ?backend=off disables the backend).
```

Author: Syed Rahman.
