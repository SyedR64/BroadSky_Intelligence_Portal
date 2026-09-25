# Broad Sky — Operating Intelligence Hub

Single-page portal that lazy-loads five standalone tool iframes inside a Tough Leaf–style dark sidebar shell.

---

## Folder layout

```
pages_portfolio/
├── index.html          ← Hub shell (~34 KB) — the only page GitHub Pages serves
└── tools/
    ├── cet-nuwave.html          (12 MB)  CET / NuWave  NYC Project Intelligence & Bid Pipeline
    ├── punctual-pros.html       ( 9 MB)  Punctual Pros Territory Intelligence (v11)
    ├── thomas-scientific.html   (21 MB)  Thomas Scientific Target-Account Dashboard
    ├── frontline.html           (96 KB)  Frontline Law Firm Target Dashboard
    └── smith-howard.html        ( 5 MB)  Smith + Howard NYC Metro Prospect Map v3
```

---

## Deploy to GitHub Pages

### Option A — Repo root (simplest)

1. Copy `pages_portfolio/` contents to the **root** of a new repo (so `index.html` is at `/`).
2. Repo → Settings → Pages → Source: **Deploy from branch** → `main` → `/` (root).
3. Push. Pages builds in ~60 seconds.

```
your-repo/
├── index.html      ← was pages_portfolio/index.html
└── tools/
    └── *.html
```

### Option B — `/docs` subfolder (existing repo)

1. Copy `pages_portfolio/` contents into a `/docs` folder at the repo root.
2. Repo → Settings → Pages → Source: **Deploy from branch** → `main` → `/docs`.

```
your-repo/
└── docs/
    ├── index.html
    └── tools/
        └── *.html
```

### Option C — `gh-pages` branch

```bash
git checkout --orphan gh-pages
git rm -rf .
cp -r pages_portfolio/* .
git add .
git commit -m "deploy hub"
git push origin gh-pages
```
Repo → Settings → Pages → Source: `gh-pages` → `/`.

---

## Notes

- **No build step.** All five tools are self-contained single-file HTML — no npm, no bundler.
- **Lazy loading.** An iframe's `src` is set only when the user first clicks that tool. The hub shell loads instantly.
- **Mobile RAM saver.** At ≤ 768px, background iframe `src` values are cleared after 8 s of inactivity so the browser can reclaim memory. The iframe reloads on next visit.
- **Fixed-viewport tools** (CET, Punctual Pros — both specify `width=1440`) are wrapped in a horizontally scrollable container on narrow screens rather than being rewritten.
- **Full-screen button** on every header strip opens the tool directly in a new tab — useful when the iframe feels cramped.
- **File sizes.** Thomas Scientific (21 MB) and CET (12 MB) are large because they embed full deed/DOB datasets as JSON. GitHub Pages has a 100 MB per-file limit; all five files are well under it. Repository soft limit is 1 GB.

---

## Customisation quick-reference

| What | Where in `index.html` |
|---|---|
| Change accent color | `.nav-item.active` border-left, `.logo-square` background — search `#c8541c` |
| Add a sixth tool | Copy one `<div class="tool-pane">` block; add `nav-item` and `topbar-tab`; add ID to `TOOLS` array |
| Change unload delay | `MOBILE_UNLOAD_DELAY = 8000` in the script block |
| Remove the header strip | Delete `.tool-header` divs and subtract `44px` from iframe height |
