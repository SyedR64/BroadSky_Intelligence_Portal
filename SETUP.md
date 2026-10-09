# Turning on the assistant backend

## The site: hosted on Vercel at broadsky-desk.vercel.app

The site itself is a second Vercel project, **broadsky-desk** (team BSP), built from this same repository at the repository root with no framework and no build step, so every push to `main` publishes it. Its address is `broadsky-desk.vercel.app`; the project's first name, `bspdesk.vercel.app`, still answers and forwards there. The backend always accepts requests from `https://broadsky-desk.vercel.app` and from GitHub Pages (`SITE_ORIGINS` in `server/app.py`), so the assistant works there with no variable change. GitHub Pages stays on: `assets/frame.js` and the memo forward any `syedr64.github.io/BroadSky_Intelligence_Portal/…` link to the same page on the new address. For a custom domain, add it under the project's **Domains** and update `HOME` in `assets/frame.js`, `SITE_ORIGINS` and the canonical links.

## Live assistant: deployed on Vercel (Oct 8, 2026)

The streaming backend runs as the Vercel project **bsp-desk** (team BSP, root directory `server/`, FastAPI, Python 3.12) at https://bsp-desk.vercel.app. `assets/runtime.json` points the site at it. Variables on the project: `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`, `DB_PATH=/tmp/bsp-desk.sqlite` (threads and feedback are kept per function instance there; the visitor's browser copy is the record). Every push to `main` that touches `server/` redeploys it. The Cloudflare worker below is an alternative and is not in use.

**Chat log.** Every question and answer (and every thumbs up or down) is saved as a JSON file in the private Vercel Blob store **bsp-desk-chats**, connected to bsp-desk, which put its `BLOB_READ_WRITE_TOKEN` on the project. Browse it under Storage → bsp-desk-chats, or download it all into one CSV and JSONL with `python3 scripts/export_chats.py` (details in `server/README.md`, "Chat log"). `CHAT_LOG=off` pauses it.

Claude answers from the knowledge base in `server/knowledge/`: BSP's website, press releases, SEC filings, news, the portfolio companies' sites and the portal's own research, searched by keyword and by meaning. It can search again, read whole sources and run the acquisition model before it answers (details in `server/README.md`). The **Refresh assistant knowledge** workflow rebuilds that knowledge base on the 1st of each month and commits it, which redeploys the backend; run it from Actions any time to pick up news sooner. Optional variables: `WEB_SEARCH=off` turns off web search, `DAILY_CAP` (default 400 questions a day) bounds spend, `MODEL=claude-sonnet-5-5` halves the cost per answer.

## Quick path: use the Claude API credits with one secret (10 minutes)

This needs no Cloudflare account. It switches on the weekly deep dives, which the assistant serves to every visitor as static answers.

1. Create an API key: [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) → **Create Key** → name it `bsp-desk` → copy the key once.
2. Add it as the repository secret `ANTHROPIC_API_KEY`: [github.com/SyedR64/BroadSky_Intelligence_Portal/settings/secrets/actions/new](https://github.com/SyedR64/BroadSky_Intelligence_Portal/settings/secrets/actions/new), or from a terminal (the value is prompted, not echoed):

   ```bash
   gh secret set ANTHROPIC_API_KEY -R SyedR64/BroadSky_Intelligence_Portal
   ```

3. Run the first generation now instead of waiting for Monday:

   ```bash
   gh workflow run generate-answers.yml -R SyedR64/BroadSky_Intelligence_Portal
   ```

   The action writes `data/answers/*.json`, commits them, and the site picks them up on the next Pages build. Expect about $2 to $4 of credits per full run (33 prompts on Claude Opus 5.5); the weekly run only refreshes answers older than seven days.

The live, streaming assistant for open questions still needs the hosted worker below (a free Cloudflare account plus two more secrets).


The site is static (GitHub Pages). The assistant already answers from the portal's own data with no backend. This guide switches on the hosted half: a Cloudflare Worker that holds the Claude API key, streams Claude answers to every visitor, and stores threads and feedback in a D1 database. Plan on about 15 minutes. Nothing here costs money until Claude answers questions.

## What changes for visitors

| | Before (today) | After the backend is live |
|---|---|---|
| Scripted questions (expansion plan, bid radar, storm impact, …) | Grounded engine: answers computed from the portal's datasets | Same: instant, free, no model call |
| Free-form questions | Best retrieval match from the research files, or Claude only for visitors who paste their own API key | Retrieval finds the relevant sources, then Claude writes a cited answer (`[1]`, `[2]`) from them, streamed word by word |
| Common deep questions | Precomputed Claude deep-dives from `data/answers/` when present (static, no backend needed) | Same, served first; live Claude covers everything else |
| Threads and ratings | Kept in the visitor's browser only | Saved to D1; thumbs up/down recorded; counts appear in the portal's data-coverage panel |
| When limits are hit or Claude is down | n/a | The visitor sees a one-line note and the grounded answer; nothing breaks |

The site finds the backend by itself: the deploy workflow writes the Worker URL into `assets/runtime.json`, and every page checks `GET /health` (2.5-second timeout) before using it. While `chatEndpoint` is `null`, the site behaves exactly as it does today.

## Steps

### 1. Create a free Cloudflare account

Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). Then open **Workers & Pages** once: Cloudflare asks you to choose a `workers.dev` subdomain (for example `broadsky`). The backend will live at `https://bsp-assistant.<subdomain>.workers.dev`.

### 2. Copy your Account ID

In the dashboard, **Workers & Pages → Overview**: the **Account ID** is in the right-hand column. Copy it.

### 3. Create an API token for deploys

**My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template**, then add one row: **Account · D1 · Edit**. The token should end up with at least:

- Account · Workers Scripts · Edit
- Account · Workers KV Storage · Edit
- Account · D1 · Edit
- Account · Account Settings · Read
- User · User Details · Read, and User · Memberships · Read (included in the template)

Under **Account Resources**, pick your account. Create the token and copy it (it is shown once).

### 4. Create a Claude API key

At [console.anthropic.com](https://console.anthropic.com) → **Settings → API keys → Create key**. Add billing credit under **Settings → Billing**. Then, under **Settings → Limits**, set a monthly spend limit (for example $50). That is the hard ceiling no matter what happens on the site.

### 5. Add three repository secrets

GitHub → **SyedR64/BroadSky_Intelligence_Portal → Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 2 |
| `ANTHROPIC_API_KEY` | the key from step 4 |

Secrets never appear in the repository, the Worker source or the logs.

### 6. Run the deploy workflow

**Actions → deploy-worker → Run workflow** (branch `main`). It takes about two minutes and:

1. creates the D1 database `bsp_assistant` and the KV namespace `bsp_assistant_rl` if they don't exist,
2. applies `worker/schema.sql`,
3. deploys the Worker and stores `ANTHROPIC_API_KEY` as a Worker secret,
4. checks `/health`,
5. commits the Worker URL to `assets/runtime.json` as `github-actions[bot]` and asks Pages to rebuild.

After this, the workflow redeploys automatically whenever anything under `worker/` changes on `main`. Without the Cloudflare secrets it exits early with a notice and stays green.

### 7. Verify

```bash
curl https://bsp-assistant.<subdomain>.workers.dev/health
# {"ok":true,"model":"claude-opus-5-5","version":"1.0.0","db":true,"llm":true,"kv":true}

curl -N https://bsp-assistant.<subdomain>.workers.dev/chat \
  -H 'Origin: https://syedr64.github.io' -H 'Content-Type: application/json' \
  -d '{"persona":"portal","question":"What does BSP look for in an add-on?","context":[],"messages":[]}'
# data: {"type":"meta",...}  data: {"type":"text",...}  …  data: {"type":"done",...}
```

Then open the site (Pages takes a minute or two to publish `runtime.json`) and ask a free-form question. `db:false` means the D1 step failed; `llm:false` means the `ANTHROPIC_API_KEY` secret is missing. Re-run the workflow after fixing either.

## Cost

**Cloudflare: $0 at portfolio-demo traffic.** Free plan limits per day: Workers 100,000 requests (CPU time per request is 10 ms; time spent waiting on Claude does not count); D1 5 million rows read and 100,000 rows written (5 GB storage); KV 100,000 reads and 1,000 writes. The per-visitor limiter writes KV once per chat question, so beyond about 1,000 Claude questions a day it stops counting (it fails open) while the D1 daily cap keeps working. Workers Paid ($5 a month) raises every one of these limits.

**Claude: about $0.01 to $0.05 for a typical answer on Claude Opus 5.5** ($4 per million input tokens, $20 per million output tokens; thinking tokens bill as output and fall within the 2,000-token `max_tokens`):

| Answer | Input tokens (rules + sources + history) | Output tokens | Cost |
|---|---|---|---|
| Short | 2,000 × $4 / 1M = $0.008 | 400 × $20 / 1M = $0.008 | **$0.016** |
| Typical | 4,000 × $4 / 1M = $0.016 | 1,000 × $20 / 1M = $0.020 | **$0.036** |
| Longest allowed | 10,000 × $4 / 1M = $0.040 | 2,000 × $20 / 1M = $0.040 | **$0.080** |

The longest case needs a full 12,000-character source pack plus a long conversation and an answer that hits the 2,000-token cap; most answers land in the first two rows.

**Guards, cheapest first:**

1. **Daily cap (`DAILY_CAP`, default 2,000 questions a day across all visitors).** Worst case at the default: 2,000 × $0.036 ≈ **$72 a day** typical, 2,000 × $0.080 = **$160 a day** at the ceiling. For a demo portal, set it to `200` in `worker/wrangler.toml` (≈ $7 a day typical, $16 ceiling) and push; the workflow redeploys. `"0"` switches Claude off and leaves the rest of the site untouched.
2. **Per visitor:** 30 questions per rolling 10 minutes (`RL_PER_10MIN`).
3. **Console spend limit** (step 4): the hard monthly ceiling.
4. **Cheaper model:** `MODEL = "claude-sonnet-5-5"` ($2 / $10 per million) halves every number above.

Live usage (`requests`, `tokens_in`, `tokens_out` for today) is at `GET /stats` and in the D1 table `usage_daily`.

## Precomputed deep-dives (no backend needed)

`.github/workflows/generate-answers.yml` runs `scripts/generate_answers.py` every Monday at 10:00 UTC (and on demand from **Actions → Generate Claude deep-dives → Run workflow**, with `force` and `only` inputs). It needs only the `ANTHROPIC_API_KEY` repository secret, not Cloudflare; without the key it skips with a notice and stays green. For each prompt in `data/answers/prompts.json` (30 suggested questions, each with a `slug`, `question` and `persona`, plus an optional `datasets` override) it builds a grounding pack from `data/research/*.json` and the nightly `data/live/*.json` snapshots, asks Claude (`claude-opus-5-5`, effort `medium`, policy-decline fallback on), and commits:

- `data/answers/<slug>.json`: `{question, persona, slug, model, generated_at, html, markdown, sources: [{name, dataset, path, as_of}], usage}`
- `data/answers/index.json`: `{generated_at, count, items: [{slug, question, persona, model, generated_at, sources: [name, …]}]}`

Answers younger than 7 days are skipped unless `force` is set. A full run of 30 prompts costs roughly $1 to $3. Override the model or effort with the repository variables `ANSWERS_MODEL` and `ANSWERS_EFFORT`. Locally: `python3 scripts/generate_answers.py --dry-run` prints the grounding packs without calling the API.

`Backend.precomputed(question)` in `assets/backend.js` serves these answers as static files, so the most common deep questions are instant and free for every visitor, with or without the Worker. It reads `index.json` once, matches the question exactly (after normalizing case and punctuation) or by word overlap of at least 60%, then loads `<slug>.json`. Scripts, inline event handlers and `javascript:` links are stripped from the HTML before display.

## Other workflows

| Workflow | When | What it does | Secrets |
|---|---|---|---|
| `refresh-data.yml` | daily 09:10 UTC, or on demand | `scripts/refresh_live.py` snapshots NWS alerts, Open-Meteo forecasts, USASpending awards and monthly federal buying, EPA ECHO wastewater permittees, Census building permits, FRED economic series and Treasury customs duties, Realtor.com county housing, NIH RePORTER awards and Federal Register rule counts into `data/live/` (about 4 minutes; NIH paging is the slow part) (a failed source keeps its previous file; `data/live/manifest.json` records each status), regenerates `data/research/README.md`, and commits if anything changed | none |
| `pages-check.yml` | every push and pull request to `main` | serves the repo and loads every page and app route in headless Chromium with `scripts/ci_check.py`; fails on console errors or same-origin 404s; the summary is on the run page | none |
| `deploy-worker.yml` | pushes to `main` that touch `worker/`, or on demand | the backend deploy described above | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY` |
| `generate-answers.yml` | Mondays 10:00 UTC, or on demand | the deep-dives above | `ANTHROPIC_API_KEY` |
| `refresh-knowledge.yml` | the 1st of each month 10:25 UTC, or on demand | rebuilds the assistant's knowledge base with `scripts/build_corpus.py` (BSP's website, cited sources, company sites, news, the portal's pages and research), checks it and commits `server/knowledge/`, which redeploys the backend | none |

Commits made by these workflows use the built-in `GITHUB_TOKEN`, which does not start other workflows, so each committing workflow also asks GitHub Pages to rebuild (best effort). If a data commit ever fails to appear on the site, re-run the latest **pages-build-deployment** run under Actions, or push any commit.

## Operations

- **Rotate the Claude key:** update the `ANTHROPIC_API_KEY` repo secret and re-run the workflow.
- **Pause Claude:** set `DAILY_CAP = "0"` (keeps threads and feedback working), or delete the Worker's secret in the Cloudflare dashboard.
- **Local testing:** see [`worker/README.md`](worker/README.md); open the site with `?backend=http://127.0.0.1:8787` to point it at `wrangler dev`, `?backend=auto` to go back.
- **Data:** threads and feedback live in D1 `bsp_assistant` (Cloudflare dashboard → D1 → Console). Raw IP addresses are never stored; the limiter keys on a truncated hash.

Author: Syed Rahman.
