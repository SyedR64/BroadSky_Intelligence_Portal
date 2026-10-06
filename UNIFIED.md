# UNIFIED · the one template for every page

Binding spec for the Broad Sky Operating Intelligence site and portal. Every page — landing, portal, gallery, the six concept sites, the six OS pages, every plan, Voice AI, AI agents, the theater and the memo — uses one frame, one type scale, one spacing rhythm and one voice. If a page needs something this file does not cover, add it to `assets/system.css` as a `.sys-` component and document it here; do not invent it locally.

Author on every page: **Syed Rahman**. No other name, no email, no employer anywhere.

Reference build: `scripts/system_demo.html` (every component, light and dark; `?theme=dark` for a whole dark page).

---

## 1 · Files

| File | Role |
|---|---|
| `assets/system.css` | Tokens (`--sys-*`, `--co-*`), frame, scaffolding, components, dark variant, print. The only shared stylesheet. |
| `assets/frame.js` | `Frame.mount(opts)` injects top bar, concept banner, breadcrumb, footer, Ask button, hotkey, sub-nav scroll-spy and the copy safety net. Also exports `humanize`, `humanizeText`, `label`, `LABELS`, `COMPANIES`. |
| `assets/chat.js` / `chat.css` | Grounded assistant. Opened by the frame's Ask button; pages still mount it with their persona. |
| page CSS (`site.css`, `growth-plan.css`, `app.css` …) | Page-specific layout only (maps, demos, charts). No colours, fonts, radii, header, banner or footer. Read tokens with `var(--sys-…)`. |

Retire as pages migrate: `.announce`, `.concept` / `.concept-in` banners, every private `<header class="nav|hdr">`, every private `<footer>`, `landing.css` frame and pill rules (`.nav`, `.pill`, `.foot`), and the rail's site-link block in `app.html`.

## 2 · Load order (in `<head>`, exactly this order)

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page name · Broad Sky</title>
<meta name="description" content="One plain-English sentence.">
<meta name="theme-color" content="#fbfaf7">          <!-- #0a0e14 on dark pages -->
<script>/* one theme for the whole site … */(function(){try{var t=localStorage.getItem('bsp-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-sys-theme',t);if(t==='dark'){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#0a0e14')}}}catch(e){}})();</script>
<link rel="icon" href="{root}BSP_Logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{root}assets/system.css?v=VERSION">   <!-- 1. system -->
<link rel="stylesheet" href="page.css?v=VERSION">                  <!-- 2. page (optional) -->
```

and at the end of `<body>`:

```html
<script type="module">
  import { Frame } from '{root}assets/frame.js?v=VERSION';
  Frame.mount({ /* options from §5 */ });
</script>
```

Use the same `?v=` stamp on `system.css`, `frame.js` and `chat.js` (`scripts/bump_version.sh`). The frame reuses its own `?v=` when it lazy-loads the chat, so the chat module is never loaded twice.

## 3 · DOM skeleton

```
body[data-co?]                          ← company pages only: pp | cet | fl | ts | bpi | fh
  header.sys-top                        ← injected: brand · Portal · Site concepts · OS program · Growth plans · Briefing · GitHub · Ask
  div.sys-banner                        ← injected on concept pages, identical wording everywhere, dismissible
  nav.sys-crumb                         ← injected: Home / Site concepts / ● Company / Page
  main#main
    nav.sys-subnav                      ← optional: page name + section anchors + one local CTA (replaces private headers)
    section.sys-hero                    ← .sys-eyebrow → h1.sys-h1 → p.sys-lead → .sys-actions → .sys-kpis (optional)
    section.sys-section (repeat)        ← .sys-section-head (.sys-kicker, h2.sys-h2, p.sys-lead) → content → p.sys-src
    section.sys-cta                     ← one closing call to action
  footer.sys-footer                     ← injected: brand + author line, Portal / Site concepts / Programs / Briefing, disclaimer
```

Section content uses only: `.sys-grid--2|3|4`, `.sys-card` (`-label`, `-title`, `-body`, `-list`, `-foot`), `.sys-kpi` (`-label`, `-value`, `-sub`, `.sys-delta--up|down`), `.sys-table-wrap > table.sys-table` (`.sys-n` numeric cells, `<caption>` provenance), `.sys-note--info|warn|good|bad|co`, `.sys-chip` (`--soft` for the company accent; `--good|warn|bad|info` for status, so pages never define their own status chips), `.sys-est`, `.sys-btn`, `.sys-prose`, `.sys-src`. Anything bespoke (map, chart, simulator, 3D) sits inside a `.sys-card` or a full-width block inside `.sys-wrap`.

### 3a · Sub-nav (`nav.sys-subnav`)

- **Title, dot only.** `a.sys-subnav-title` is the page's short name as plain text (company name on a concept home, the OS name on an OS page, the plan name on a plan). The frame draws one dot before it in the company accent (brand orange on portfolio-wide pages). No logo, icon, wordmark or SVG inside the title; system.css hides any that remain.
- **One CTA, and the portal link has one wording.** `.sys-subnav-actions` holds at most one `.sys-btn--sm`. When it links into the portal it reads exactly **"Open in portal"** (not "Open in the portal", "Open the portal" or "View in portal"), uses `.sys-btn--secondary`, and points at the most specific route (`app.html#/cet/overview`, `app.html#/techos/overview`). A page-local action ("Try the demo", "Request a quote") uses `.sys-btn--primary` instead; a page may add one small secondary 'Open in portal' link beside its own primary button; never two primary buttons. The CTA is hidden at ≤560px, so nothing important may live only there.

Alternate band: `.sys-section--alt` (warm grey). Dark band: `data-sys-theme="dark"` on the section. Never more than one dark band in a row, never two `.sys-section--alt` in a row.

## 4 · Type, spacing, radii

| Role | Class / token | Size | Weight · tracking |
|---|---|---|---|
| Landing hero only | `.sys-h1.sys-h1--display` | `clamp(48px, 9vw, 112px)` | 800 · −.05em |
| Page title (one per page) | `.sys-h1` / `--sys-fs-3xl` | `clamp(36px, 6.2vw, 72px)` | 800 · −.04em |
| Section title | `.sys-h2` / `--sys-fs-2xl` | `clamp(28px, 4.2vw, 48px)` | 800 · −.04em |
| Card / sub-section title | `.sys-h3`, `.sys-card-title` | 18–22px | 700 · −.02em |
| Lead | `.sys-lead` | 16–20px, ink-2, max 62ch | 400 |
| Body | — | 16px / 1.6 | 400 |
| Prose (memo, growth plans) | `.sys-prose` | 17px / 1.7, max 68ch | 400 |
| Kicker | `.sys-kicker` | mono 12px, uppercase, .12em | 600 |
| Labels, table heads | `.sys-card-label`, `th` | mono 11px, uppercase, .07–.08em | 600 |
| Numbers | `.sys-num`, `.sys-kpi-value` | mono, tabular | 600 |
| Provenance | `.sys-src`, `caption` | mono 12px, mute | 500 |

Fonts: Inter for everything; JetBrains Mono only for numbers, labels, kickers and provenance. No other families.

Spacing scale `--sys-sp-1…10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Rhythm: section padding `--sys-section-y` (56→112px); section head → content `--sys-head-gap` (28→48px); grid gap 16px (24px with `.sys-grid--gap-lg`); inside cards 10px between parts. Content width `--sys-wrap` 1200px with `--sys-gut` 16→40px; the frame uses the same width so edges line up.

Radii: 6 (kbd, code), 10 (notes, small controls), 16 (cards, tables, KPI strips), 24 (feature cards, CTA), pill (buttons, chips, nav). Tokens `--sys-r-xs|sm|r|lg|pill`; `--sys-r-md` is an alias of `--sys-r` (16) for pages that think in sm/md/lg, so never redefine it locally. Shadows: `--sys-sh-1` resting, `--sys-sh-2` hover/raised, `--sys-sh-3` floating media only.

Buttons: one `.sys-btn--primary` per view region; `--secondary` beside it; `--ghost` for tertiary; `--accent` (gradient) at most once per page, usually in the hero or CTA; `--co` only on company pages. Sizes `--sm` (36px, top bars, card feet), default (44px), `--lg` (52px, hero and CTA).

## 5 · Frame.mount options per page

| Page | Call | Persona | Notes |
|---|---|---|---|
| `index.html` (landing) | `Frame.mount({ crumb: false })` | portal | Inline hero chat stays; Ask scrolls to it and focuses it. Hero uses `.sys-h1--display`. Remove `.announce` and `.nav`. |
| `redesigns/index.html` | `Frame.mount({})` | portal | Active = Site concepts. No banner (gallery is ours, not a company mock). |
| `redesigns/<co>/index.html` | `Frame.mount({})` | auto = company | Banner + crumb `Home / Site concepts / ● Company` automatic. Old `.concept` bar and private header removed; section links move to `.sys-subnav`. |
| `redesigns/<co>/<os>.html` | `Frame.mount({})` | company | Active = OS program; crumb ends with the OS name (ServiceOS, GridOS, FirmOS, LabOS, SignalOS, HarborOS). |
| `redesigns/<co>/growth-plan.html`, `punctual-pros/nationwide.html`, `ads.html` | `Frame.mount({})` | company | Active = Growth plans. |
| `redesigns/voice-ai.html`, `ai-agents.html` | `Frame.mount({ banner: true })` | portal | Crumb `Home / Growth plans / Page`. |
| `app.html` | `Frame.mount({ variant: 'app', theme })` (the saved `bsp-theme`, light by default) | portal | See §8. Hotkey ⌘J (⌘K stays the portal search). The app variant sets `nav: { briefing: 'app.html#/briefing/play' }` itself. |
| `theater.html` | `Frame.mount({ variant: 'minimal', theme: 'dark' })` | portal | See §9. |
| `briefing/executive_memo.html` | no mount | — | See §10. |

Other options: `nav` (per-page override of primary links, `{ <id>: href }` or `{ <id>: { href, label, hint } }`; ids are `portal`, `concepts`, `os`, `playbooks`, `briefing`, `github`. A link whose href is a `#/` route on the current page is marked `aria-current` while the hash is on that route and the frame keeps it in sync on `hashchange`, so pages never patch frame links after mount), `co`, `active`, `persona`, `crumb: [{label, href?, co?}]` (hrefs are root-relative: `'redesigns/'`, `'app.html#/pp/overview'`), `crumbAside: 'Concept · Oct 2026'`, `cta: {label, href}` (small primary button in the bar), `footer`, `hotkey`, `chat` (an existing widget instance), `humanize: true | 'observe' | false`. Mount once per page; a second call returns the first frame.

Chat: pages keep mounting their own floating widget (`Chat.mount(null, { persona, mode: 'floating' })`; any `theme` option is ignored, the widget follows the page theme) with their FAQ and suggestions. **Launcher label rule:** the floating launcher reads "Ask " + the persona's short name — the persona's `short` field, or `short_name` passed to `Chat.mount` when a page renames its assistant ("Ask Punctual Pros", "Ask CET", "Ask Fair Harbor", "Ask the portfolio"). Never derive it by truncating the persona name to its first word ("Ask Punctual", "Ask Fair"); a persona without a short name gets one added, not a fallback. At ≤560px the launcher is an icon-only 44px circle (label kept in `aria-label`), see §11. The Ask button opens that widget if present, else focuses an inline chat, else lazy-loads `chat.js` with the persona. Pass `chat: inst` to `Frame.mount` (or call `Frame.mount(...).setChat(inst)`) when you hold the instance.

## 6 · Accent rules

- **Brand gradient** (`--sys-grad`, orange → violet): kicker rule, active top-bar link underline, banner tag, `.sys-btn--accent`, and at most one `.sys-grad-text` phrase in the page `h1`. Nowhere else.
- **Company accent** (`--co-pp` #f08a3c, `--co-cet` #4c8dff, `--co-fl` #9d7bff, `--co-ts` #2ecc8f, `--co-bpi` #e05c8a, `--co-fh` #3fd0e0): set `data-co` on `<body>` for a company page, or on a single card, chip, KPI or crumb item on portfolio-wide pages. Allowed on: dots, card top bars, KPI top borders, list bullets, kicker rule, crumb dot, sub-nav dot and active pill (`--co-soft` / `--co-ink`), `.sys-note--co`, `.sys-btn--co`, hero glow. Not allowed on: body text, headings, section backgrounds, large fills, table text. Text in an accent uses `--co-ink`, never the raw `--co`.
- One company per card. Portfolio pages show each company only in its own colour; the order is always PP, CET, Frontline, Thomas Scientific, BPI, Fair Harbor.
- Status colours (`--sys-good|warn|bad|info`) mean status only: deltas, notes, est./illustrative/live badges.
- Concept sites keep the company's identity through `--co`, the accent dot before `.sys-subnav-title` (§3a), and photography or demos inside cards — not through a private type scale, header or palette.

## 7 · Copy rules

1. Plain English sentences. Sentence case for headings and buttons. No marketing filler.
2. **No raw identifiers in visible text**: no snake_case (`book_job`, `pp_sales_pa_a`), no file names (`.json`), no internal ids (`ra-pp`, `kb-fl-2`), no `key=value`, no route hashes, no `(null)`, `undefined`, `NaN`. Write the human name: "Punctual Pros deed records (PA)", "books the job and pages the on-call tech". Use `Frame.label(id)` / `Frame.humanizeText(s)` in renderers; `Frame.humanize` is the safety net, not the plan. Wrap genuine code in `<code>` or mark the block `data-raw`.
3. **Every estimate carries `.sys-est`** (`<span class="sys-est">est.</span>`) right after the number; illustrative figures use `.sys-est--illus` ("illustrative"); live feeds use `.sys-est--live` ("live"). Missing values render as "—", never blank, never "null".
4. **Every table, chart and KPI block ends with a provenance line**: `<p class="sys-src"><b>Source:</b> dataset human name, publisher, month year.</p>` (tables use `<caption>`). Dataset names come from `Frame.LABELS`.
5. Numbers: `$14.2M`, `27%`, `4,417`, `Sept 2026`; ranges with an en dash (`$25–35M`); mono via `.sys-num` in running text.
6. Author line: "Prepared by Syed Rahman". The footer already carries it with the disclaimer; do not repeat it elsewhere except the memo's title block.
7. Concept notice wording comes only from the frame (`Frame.BANNER_TEXT`); pages never write their own.
8. Link text says where it goes ("Wastewater accounts →"), never "click here". External links open in a new tab with `rel="noopener"`.

## 8 · `app.html` (portal console: the website, with a rail)

The portal is not a separate product skin. A visitor moving between `index.html`, a concept page and `app.html` sees the same background, surfaces, type scale, card radius and shadow, KPI tiles, tables, buttons, chips, notes and est. badges, and the same light or dark theme.

**Theme (one preference, every page).** `html[data-sys-theme]` is `light` or `dark`; the choice is saved under `localStorage['bsp-theme']`, light by default like the site, and an explicit saved choice wins. Every page applies it in the inline `<head>` script of §2 before the stylesheets (no flash). The one toggle is the frame's top-bar button (`.sys-theme[data-sys-theme-toggle]`, next to Ask) on every page; it calls `Frame.setTheme()` (also `getTheme`, `toggleTheme`), which writes the attribute and the key, and other open tabs follow through the `storage` event. Only `theater.html` (`variant: 'minimal', theme: 'dark'`) is locked dark and shows no toggle. In the portal, `Frame.mount({ variant: 'app', theme })` gets the saved value, the console's own `#theme-btn` hides because the frame renders the toggle, and `Theme.set()` in `assets/core.js` calls `Frame.setTheme()`. Every chat widget follows the page (`theme` is always `'auto'`; the assistant page's own theme button also calls `Frame.setTheme()`). Dark exists only as system.css §2 tokens; the console has no palette of its own. `html[data-theme]` is mirrored for older module CSS hooks. `Theme.watch` hears every change, whoever makes it, and Leaflet maps swap between the Esri light and dark tiles in place (filters and selection survive). The chat widget (`theme: 'auto'`) follows the attribute.

**Load order and shell.** `system.css` before `app.css`; `Frame.mount` before `App.start()`. The frame strip (56px, the same top bar as every page) sits above the rail and content; `body[data-sys-layout="app"]` becomes a column flex and `#app` fills the rest (system.css §7a). No banner, breadcrumb row or footer. ⌘K opens the portal search; the Ask button and ⌘J open the chat. The frame's Briefing link points at `app.html#/briefing/play` and carries `aria-current` on `#/briefing/…`.

| Console part | Built from |
|---|---|
| Rail `#rail` | a vertical sys-nav on `--sys-bg`: `.sys-card-label` group heads, `a.rail-item` links (14px Inter, pill hover on `--sys-bg-3`, current = `--co-soft` / `--co-ink`), the module's `.sys-dot` accent, `.sys-kbd` tags; the counter sits in a `.sys-kpi`, the footer is a `.sys-src` line. At ≤900px the rail is a strip of chips (current = ink fill, the `.sys-chip[aria-current]` look). |
| View bar `#topbar` | the sub-nav pattern (§3a): `.sys-subnav-title` with the module dot, `nav.sys-subnav-links` of `a.view-tab` links (current = `--co-soft`), then `.sys-btn--secondary` search with `.sys-kbd`, a `.sys-chip` live clock with `.sys-dot--live`, and `.sys-btn--ghost.sys-btn--icon` buttons. |
| Content `#content` | `--sys-bg`, padding `--sys-sp-6` / `--sys-gut`. `#main[data-co]` carries the module accent (`--co`), so `.sys-card[data-co]` bars, `.sys-chip--soft`, `.sys-note--co` and the current tab read it. |
| Inspector `#inspector` | a `.sys-card` drawer (`--sys-sh-2`, accent bar from `data-co`), `.sys-card-title` head, `.sys-card-label` section heads, `.sys-btn--secondary.sys-btn--sm` actions; full-height overlay at ≤900px. |
| Palette `#palette`, tour `#tour`, toast | `.sys-card` dialog and bar; palette rows use `.sys-card-label` kinds; tour uses `.sys-btn` and the brand gradient progress; toast is a `.sys-note`. |

**Components (core.js helpers write the system class, and keep the old class on the same element for module CSS hooks).** `app.css` holds layout and aliases only: no colour, radius, shadow or font of its own (every value is a token).

| Old console class | System class it now carries | Helper |
|---|---|---|
| `.page-head` `h1` `.sub` `.actions` | `.sys-h1` (console size: `--sys-fs-2xl`, system.css §7c) · `.sys-lead` · `.sys-chips` · `.sys-actions` | `ui.pageHead` |
| `.panel` `.panel-head h3` `.sub` `.panel-foot` | `.sys-card` · `.sys-card-title` · `.sys-card-body` · `.sys-src`; `accent` adds `data-co` (top bar) | `ui.panel` |
| `.kpis` `.kpi` `.label` `.value` `.sub` `.delta` | `.sys-kpis` strip · `.sys-kpi` · `.sys-kpi-label` (with a `.sys-dot` when a colour is given) · `.sys-kpi-value` · `.sys-kpi-sub` · `.sys-delta--up/--down` | `ui.kpis`, `ui.kpi` |
| `.tbl-wrap` `table.tbl` `th.num` | `.sys-table-wrap` · `.sys-table` · `.sys-n`; footer: `.sys-src` count, `.sys-btn--secondary.sys-btn--sm` CSV export, `.sys-btn--ghost` pager | `ui.table` |
| `.filters` `.f` `select` `input[type=search]` toggle `.btn.active` | `.sys-filters` · `.sys-field` + `.sys-field-label` · `.sys-input` · pressed `.sys-chip` | `ui.filters` |
| `.seg button.active` | `.sys-chips` of `.sys-chip[aria-pressed]` | `ui.seg` |
| `.chip` · `.chip` with `--cc` · `.chip.t1–t4` | `.sys-chip` · `.sys-chip--soft[data-co]` with `--co` · `.sys-chip--good/--info/--warn` | `fmt.chip`, `fmt.tier` |
| `.btn` `.primary` `.brand` `.ghost` `.sm` `.xs` | `.sys-btn` `--primary` `--accent` `--ghost` `--secondary` (default) `--sm`; pressed = `[aria-pressed="true"]` | `ui.btnCls(variant, size)` |
| `.note` `.warn` `.good` `.bad` `.brand` | `.sys-note` `--info` (default) `--warn` `--good` `--bad` `--co` | `ui.note` |
| `.cards` `.card` `.t` `.s` `.m` | `.sys-grid` · `.sys-card.sys-card--link[data-co]` · `.sys-card-title` · `.sys-card-body` · `.sys-chips` | `ui.cards` |
| `.icon-btn` | `.sys-btn--ghost.sys-btn--sm.sys-btn--icon` | shell |
| est. text | `.sys-est` (`--illus`, `--live`) | copy pass |

**Bespoke blocks in a module** use the same vocabulary, never new colours: a block is `<section class="sys-card">` with `<h3 class="sys-card-title">`, `<div class="sys-card-body">` and a `<p class="sys-src">` source line; a figure is `<div class="sys-kpi"><div class="sys-kpi-label">…</div><div class="sys-kpi-value">…</div><div class="sys-kpi-sub">…</div></div>` inside `.sys-kpis`; status is `.sys-chip--good/--warn/--bad/--info`; an accent is `data-co="<company>"` (or `data-co="" style="--co:var(--c-…)"`). Hand-written `.panel/.kpi/.btn/.chip/.tbl/.note` still work: `modules/copy.js` adds the matching `.sys-` class after every render and `app.css` aliases the old child classes to the same tokens.

- Module renderers write human labels (`Frame.label`) and `.sys-est` badges; `humanize: 'observe'` catches anything that slips through on re-render.

## 9 · `theater.html` (minimal transparent frame)

- `<html data-sys-theme="dark">`; `Frame.mount({ variant: 'minimal', theme: 'dark' })`. The bar is fixed, transparent and click-through except for the brand, the link pill and Ask; no banner, crumb or footer.
- Delete the page's own `header.brand` and `.links`; move the "About" toggle into the scene rail. Offset engine chrome that sits top-right (`.bt-rail`, `.bt-status`) to `top: 64px` so it clears Ask.

## 10 · Print pages

- `briefing/executive_memo.html` owns its print layout: load `system.css` for tokens and `.sys-prose`, set `<body data-sys-print="own">`, and do not call `Frame.mount`. All system print rules skip `data-sys-print="own"`.
- Every other page prints through system.css §10: frame, banner, sub-nav, buttons, footer links and the chat are hidden; colours go to black on white; cards, KPIs, notes and table rows do not break across pages; external prose links print their URL.

## 11 · Mobile

Mobile-first. The top bar collapses to brand + Ask + menu at ≤960px (the sheet lists every primary link with a hint); the crumb drops "Home" at ≤560px; the concept banner is one line at ≤560px (truncated, with a "More" toggle that expands it in place), so top bar + banner + crumb stay under 160px (56 + 36 + 41 at 390px); the floating chat launcher is an icon-only 44px circle anchored bottom-right inside the safe-area insets at ≤560px and the full "Ask …" pill from 561px up, and it steps aside (fades out, `.ch-launch--tuck`) while it would sit on a page button or link, coming back as soon as the user scrolls past it; the footer carries extra bottom padding so the launcher never sits on its last line; the sub-nav scrolls horizontally with a fade; grids are one column below 720px (KPI strips two columns); hero and CTA buttons stack. Nothing may scroll the page horizontally at 390px — wide tables scroll inside `.sys-table-wrap`, maps and charts size to their container.

## 12 · Checklist (every page must pass all twelve)

1. Head follows §2 exactly: Inter + JetBrains Mono, `system.css` before page CSS, same `?v=` stamp on system, frame and chat.
2. `Frame.mount` is called once with the options in §5; the right primary link is marked active; no private header, banner or footer remains.
3. Concept pages show the frame banner (not a local one) and the automatic breadcrumb with the company dot.
4. Skeleton follows §3: one `h1.sys-h1`, sections built from `.sys-section-head` + `.sys-*` components, one `.sys-cta`, frame footer last.
5. No colour, font family, font size, radius or shadow literal in page CSS that a `--sys-*` / `--co-*` token covers.
6. Accents follow §6: gradient only in its allowed places, company accent only via `data-co` and never as text colour except `--co-ink`.
7. Visible text contains no snake_case, file names, internal ids, `key=value`, `(null)`, `undefined` or `NaN` — check with `document.body.innerText` after the page settles.
8. Every estimate has `.sys-est`, every illustrative figure `.sys-est--illus`, every live feed `.sys-est--live`; missing values show "—".
9. Every table, chart and KPI group has a provenance line (`.sys-src` or `<caption>`) naming datasets by their human names.
10. Author appears only as "Syed Rahman"; no email, phone, employer or other name anywhere in markup, metadata or scripts.
11. Ask opens the chat with the page's persona (§5); ⌘K (⌘J in the portal) does the same; the floating launcher and Ask open the same widget.
12. `scripts/check_page.sh "<path>" /tmp/x.png 1600 1000` shows zero console errors, and a 390px run (Playwright or a 390px iframe) shows `scrollWidth === 390`, a working menu sheet and readable crumb, hero and footer; open both PNGs and look at them.

## 13 · Accessibility

Target: WCAG 2.2 AA. Checked with axe-core 4.10 (Playwright, 1400px, light and dark where a page has both) plus a keyboard walk. The system carries the rules below so pages get them for free; page CSS and renderers must not undo them.

**Contrast (tokens, system.css §1–2)**

- Every text token passes 4.5:1 on every surface it can sit on, `--sys-bg-3` included. `--sys-mute` / `--sys-mute-2` are `#545c69` / `#646b77` light and `#8b98a8` / `#7a889a` dark. Never fade text with `opacity` or a lighter literal to make it "ghost"; use `--sys-mute-2` (the portal's `--dim` and `--ghost` both read it). Past or inactive cells fade their fill (`filter: saturate()`), not their number.
- Status colours used **as text** read the text-safe shades `--sys-good-ink | --sys-warn-ink | --sys-bad-ink | --sys-info-ink` (75% of the status hue mixed with ink, declared on every theme root). `.sys-est`, `.sys-chip--good|warn|bad|info` and page-level status labels use them; the raw `--sys-good …` stay for dots, bars, borders and tints.
- Company accents as text read `--co-ink` (45% accent + ink on light, 80% on dark), which passes on the page background and on `--co-soft`.
- Text on an accent or brand **fill** (solid chips, avatar tiles, Gantt bars) uses `--sys-on-accent` (`#0a0e14`); white is allowed only on the deep fills that clear 4.5:1 (`--sys-good`, a darkened violet).
- Pages that own their print layout (`data-sys-print="own"`, the memo) read the text-safe brand for their private orange accent.

**Focus**

- `:where(:focus-visible)` draws a 2px ring in `--sys-focus` on every interactive element of every page (`#b84a17` light, `#f0874a` on dark pages, the banner, the footer and dark bands; both clear 3:1). The rule has zero specificity, so a page may replace the ring (an input's box-shadow ring, a thicker stroke on an SVG node) but must never remove focus without a replacement.
- Inside clipped scrollers (portal rail, view tabs, tables, palette) the ring draws inside the element (`outline-offset: -2px`) so it is never cut off.

**Landmarks, skip link, names**

- One `main#main` per page; the frame adds `a.sys-skip` ("Skip to content") as the first tab stop. It focuses `<main>` (made `tabindex="-1"`) without touching `location.hash`, so it is safe on hash-routed pages such as `app.html`.
- The concept banner is a top-level `<aside aria-label="Concept notice">`; nothing on a page sits outside a landmark. Embedded widgets (the full-screen assistant) never add a second `<main>`.
- Icon-only buttons carry an `aria-label` that starts with their visible text when there is any ("Ask the portfolio (opens the … chat)", "Close inspector", "Previous page", "Next page", "Open menu" / "Close menu", "Dismiss concept notice"). Search boxes without a visible label carry `aria-label`; selects sit inside their `<label>`.
- A table wrap that scrolls but holds nothing focusable gets `tabindex="0"`, `role="region"` and a name from its caption or card heading (the frame does this on mount, on DOM changes and on resize), so keyboard users can scroll it.

**Keyboard**

- Tab order: skip link → brand → primary links → Ask → (portal) rail items → view tabs → console actions → view content (filters, sortable headers, rows) → chat composer when open.
- Portal rail items are `role="link"` with `tabindex="0"` and `aria-current="page"` on the active module; Enter or Space opens the module and focus stays on the item after the route change. View tabs carry `aria-current="page"`; segmented buttons and filter toggles carry `aria-pressed`.
- `UI.table`: sortable headers are focusable with `aria-sort` and sort on Enter or Space; when a table has a row inspector, rows are focusable and open it on Enter or Space.
- The inspector moves focus to its close button when opened from the keyboard; Escape or the close button closes it and returns focus to the row or control that opened it. Escape inside the chat closes only the chat.
- Escape closes the floating chat panel and returns focus to its launcher; ⌘K / ⌘J still open it.
- The mobile menu sheet (≤960px) traps focus while open (menu button plus sheet links form one loop), opens onto its first link when activated from the keyboard, and Escape closes it and returns focus to the menu button.

**Checks before shipping a page**

1. axe-core shows no serious or critical violations at 1400px in each theme the page supports (`color-contrast`, `button-name`, `label`, `link-name`, `duplicate-id`, `scrollable-region-focusable`, landmark rules).
2. A keyboard-only pass reaches every control with a visible ring, and Escape closes whatever is open.
3. Page markup follows the ARIA patterns it claims: `role="tablist"` holds only `role="tab"` children (no `aria-pressed` on tabs), `aria-expanded` only on elements that support it (not on plain table rows), `aria-label` only on elements with a role, `<aside>` only at the top level, headings step down one level at a time, and an SVG with `role="img"` contains no focusable nodes.
