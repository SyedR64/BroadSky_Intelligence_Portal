# UNIFIED · the one template for every page

Binding spec for the Broad Sky OS site and shell. Every page — the shell, gallery, the six concept sites, the six OS pages, every plan, Voice AI, AI agents and the memo — uses one frame, one type scale, one spacing rhythm and one voice. If a page needs something this file does not cover, add it to `assets/system.css` as a `.sys-` component and document it here; do not invent it locally.

Author on every page: **Syed Rahman**. No other name, no email, no employer anywhere.

Reference build: `scripts/system_demo.html` (every component, light and dark; `?theme=dark` for a whole dark page).

## 0 · Voice

Short, plain and specific. Say the finding, give the number, stop.

**Product name.** The product is **Broad Sky OS**: one operating system for Broad Sky and its six companies. The wordmark is the text "Broad Sky OS" from `Frame.PRODUCT` (`assets/frame.js`): top bar, mobile sheet and footer. Page titles read `<Page> · Broad Sky OS`; a portal screen reads `<Module> · <Screen> · Broad Sky OS` through `modules/copy.js`. The assistant is "Broad Sky OS" and its floating button reads "Ask". The earlier product name and its "the desk" shorthand never appear in text a visitor or the model reads. File names, storage keys, the memo PDF (`BSP_Desk_Memo.pdf`) and the repo path `BroadSky_Intelligence_Portal` keep their names. The old product name is retired everywhere else (titles, meta, copy, films, memo, scripts, prompts).

**The firm.** "Broad Sky" is written out in the "Viewing as" switch and in the Connections group heading. Everywhere else the firm is BSP ("BSP portfolio company", "BSP's first exit"). Spell out "Broad Sky Partners (BSP)" at most once per page: the frame's concept notice on concept pages, the memo's "To" line, or the first body mention on other pages. Keep the legal name only where it is the record: entity names in filings (`Broad Sky Partners, LP`, `Broad Sky Partners LLC`, `BSP-FL LP`), quoted press text and wire headlines. Portfolio Resource Group is spelled out once per page, then PRG. The firm's own site names no software vendor and never mentions AI: nothing is worded as the firm's own stated position on either.

**Viewing as.** The words are always "Viewing as", never "signed in" or "logged in". It is navigation, not security.

**The twelve copy rules.** They bind every screen and page.

1. A lead only under the screen title: one line, 12 words at most, a status or a number. No lead under a section heading.
2. A tile is label, value, change. A caption is 4 words at most, or none.
3. A card is a title plus the visual. No subtitle that describes the chart.
4. No "Source:" line on the page. Mark it `data-src` and it moves to the Sources drawer. Method, legend and caveat text take `data-method`. A warning that changes a decision stays, as a chip of 12 words at most.
5. No instruction text ("click a row", "choose a cell", keyboard hints). Controls are labelled, not explained.
6. No process notes, apologies or research to-dos on any screen. Uncertainty is the `est.` badge on the number, defined once in Method.
7. A table cell is 10 words at most, one line. Longer detail opens in the side panel. No raw identifiers in cells.
8. An action line starts with a verb and is 15 words at most, one per card. No paragraph of advice.
9. The screen name appears once. No sentence appears twice on one screen, or on two screens.
10. Sentences stop at 18 words. A glossary term is defined once, in a tooltip.
11. The answer comes first: the table or list that is the point of the screen starts on the first screen at 1440x900.
12. Pages that only explain (methods, transcripts, design notes) become a drawer behind a control, not a tab.

Targets: a portal screen is at most 60 percent of its audited word count, a first screen at most half. No number, name, date or control is removed to hit a target; text is.

**Also binding.** No "So what" label: the answer is simply the first sentence. No email addresses. Never "playbook" or "Tough Leaf". "Platform" never in the private-equity sense. No snake_case or raw identifiers. No developer words ("route", "alias", "module", "view"). Nobody at the firm is addressed by name. Smith + Howard has exited and gets no screen. No legal-compliance copy. No marketing cadence: no taglines, no triplets for rhythm, no "not X, but Y" flourishes, no rhetorical questions. Dates in words; `est.` badges on estimates.

**CET.** Commonwealth Electrical Technologies, also branded CET Energy Solutions; headquarters Worcester, Massachusetts; "400+ professionals" (its own site). Six add-ons: NuWave Energy Solutions (7 October 2025) and Horton Electrical Services (15 September 2026) confirmed; Direct Electric Services, JDL Electric, New Horizons Technologies and Vanguard Building Solutions are labelled "reported" (trade press, 28 to 29 October 2026). Licensed in about ten states across New England and the Mid-Atlantic (reported). It has no New York City plan: never say or imply one, and "New England only" is not correct. Punctual Pros is "one of the largest franchisee operators within Authority Brands".

**Before and after.**

| Before | After |
|---|---|
| **So what:** the firm runs on a Carlyle and MidOcean lineage, a bench of private-credit lenders and specialist sell-side banks. | The firm runs on a Carlyle and MidOcean lineage, private-credit lenders and specialist sell-side banks. |
| Six companies, one portal: every datapoint tied to a revenue, acquisition or operating decision. | Six companies. Every number is tied to a decision. |
| Broad Sky put $90.0M of equity into BPI in April 2023, and Broad Sky's Fund I is $335M. | BSP put $90.0M of equity into BPI in April 2023 (Form D); Fund I is $335M. |

`scripts/apply_voice.py` is the earlier mechanical pass (Broad Sky to BSP with the legal-name exceptions, "So what" labels). Its product-name rule predates Broad Sky OS: do not re-run it. Brevity is an editing job, not a script.

---

## 1 · Files

| File | Role |
|---|---|
| `assets/system.css` | Tokens (`--sys-*`, `--co-*`), frame, scaffolding, components, dark variant, print. The only shared stylesheet. |
| `assets/session.js` | The one state store: who the visitor is "Viewing as" (`Session.role()`, `setRole(id)`, `level()`, `co()`, `roles()`, `levels()`, `onChange(fn)`; also sets `data-level` and `data-co` on `<html>`) and which tools are connected (`conn`, `setConn`, `connectedApps`). Imported by `frame.js`, `core.js` and `agent.js`. Only an explicit choice (the switch or `?role=`) is stored; the default is the managing partner. |
| `assets/frame.js` | `Frame.mount(opts)` injects top bar with the "Viewing as" switch, concept tag, breadcrumb (folded into the page's sub-nav when it has one), footer, Ask button, hotkey, sub-nav scroll-spy and the copy safety net. With `?embed=1` it draws nothing but the page (§9a). Also exports `humanize`, `humanizeText`, `label`, `LABELS`, `COMPANIES`. |
| `modules/embed.js` | `embedView(ctx, src, opts)`: shows one of the site's own pages in an iframe that fills the shell's content area (§9a). |
| `assets/chat.js` / `chat.css` | Grounded assistant. Opened by the frame's Ask button; pages still mount it with their persona. A docked assistant sends the research assistant a short text of the page behind it (title, `h1`, `.sys-lead`, `.sys-kpi` tiles, `.sys-note`; nothing inside a closed `<details>`, whose summary line still counts); a view with more to say sets `window.BSPView = { describe() }` (the 3D map does). Voice: the microphone in the composer listens only while pressed (hold on a touch screen, click to start and stop elsewhere), sends the question for one short answer, and reads it aloud; a voice bar above the composer carries the state line, Stop and Mute (`bsp-voice-muted`). Where the browser cannot listen the button stays, marked unavailable, and says so in one line. |
| page CSS (`site.css`, `growth-plan.css`, `app.css` …) | Page-specific layout only (maps, demos, charts). No colours, fonts, radii, header, banner or footer. Read tokens with `var(--sys-…)`. |

Retire as pages migrate: `.announce`, `.concept` / `.concept-in` banners, every private `<header class="nav|hdr">`, and every private `<footer>`.

## 2 · Load order (in `<head>`, exactly this order)

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page name · Broad Sky OS</title>
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

`app.html` alone adds `&family=Instrument+Serif` to the same font link: the display face of the home's command band (§3d). No other page loads it.

Use the same `?v=` stamp on `system.css`, `frame.js` and `chat.js` (`scripts/bump_version.sh`). The frame reuses its own `?v=` when it lazy-loads the chat, so the chat module is never loaded twice.

## 3 · DOM skeleton

```
body[data-co?]                          ← company pages only: pp | cet | fl | ts | bpi | fh
  header.sys-top                        ← injected: brand · Viewing as path · Home · Agent · Connections · Concepts · Ask · theme
  nav.sys-crumb                         ← injected only on a page without a sub-nav: Home / Concepts / ● Company / Page, concept tag at the right
  main#main
    nav.sys-subnav                      ← the page bar: parent / ● page name, at most five section anchors, the concept tag
                                          (span.sys-concept, injected on concept pages) and one button. The frame adds the parent
                                          (a.sys-subnav-up) and the tag, so a page has two bars: the top bar and this one.
    section.sys-hero                    ← .sys-eyebrow → h1.sys-h1 → p.sys-lead → .sys-actions → .sys-kpis (optional)
    section.sys-section (repeat)        ← .sys-section-head (.sys-kicker, h2.sys-h2; no lead under it) → content
    section.sys-cta                     ← one closing call to action
  footer.sys-footer                     ← injected: brand + one line, Home / Agent / Connections / Concepts / Narrated tour / Executive memo / All pages, disclaimer + author line
```

Section content uses only: `.sys-grid--2|3|4`, `.sys-card` (`-label`, `-title`, `-body`, `-list`, `-foot`), `.sys-kpi` (`-label`, `-value`, `-sub`, `.sys-delta--up|down`), `.sys-table-wrap > table.sys-table` (`.sys-n` numeric cells), `.sys-note--info|warn|good|bad|co`, `.sys-chip` (`--soft` for the company accent; `--good|warn|bad|info` for status, so pages never define their own status chips), `.sys-est`, `.sys-btn`, `.sys-prose`, `.sys-fold` (§3c), `.sys-dialog` (§3b); provenance is `data-src` (§7). Anything bespoke (map, chart, simulator, 3D) sits inside a `.sys-card` or a full-width block inside `.sys-wrap`.

### 3b · Dialog (`dialog.sys-dialog`, system.css §6o)

- **Markup.** A native `<dialog class="sys-dialog" aria-labelledby="…">` opened with `showModal()`, so the browser supplies the focus trap, Escape and the backdrop. Inside: `.sys-card-label` → `h2.sys-h3` (`tabindex="-1"`, focused on open) → `.sys-card-body` / `.sys-card-list` → one `.sys-actions` row (one `.sys-btn--primary`, then `.sys-btn--ghost` Cancel or Close). No private header, close icon or colours.
- **Look.** The card recipe (`--sys-surface`, 1px `--sys-line`, `--sys-r-lg`, `--sys-sh-3`), `min(520px, 100vw − 2 gutters)` wide, a blurred ink backdrop. At ≤560px it is a bottom sheet with the safe-area inset under it and full-width buttons. The action row is sticky at the bottom, so it stays in reach while a long body scrolls.
- **Behaviour.** Escape and Cancel close it; the page returns focus to the control that opened it (or the nearest surviving one when that control was redrawn). A dialog never asks for a password, an email address or any other account field, and never imitates a vendor's sign-in page (plain monogram tile and app name only). First user: `agent.html` (connect consent, records sync, role sheet).

### 3a · Sub-nav (`nav.sys-subnav`)

- **Title, dot only.** `a.sys-subnav-title` is the page's short name as plain text (company name on a concept home, the OS name on an OS page, the plan name on a plan). The frame draws one dot before it in the company accent (brand orange on portfolio-wide pages). No logo, icon, wordmark or SVG inside the title; system.css hides any that remain.
- **One CTA, and the portal link has one wording.** `.sys-subnav-actions` holds at most one `.sys-btn--sm`. When it links into the portal it reads exactly **"Open in portal"** (not "Open in the portal", "Open the portal" or "View in portal"), uses `.sys-btn--secondary`, and points at the most specific route (`app.html#/cet/overview`, `app.html#/techos/overview`). A page-local action ("Try the demo", "Request a quote") uses `.sys-btn--primary` instead; a page may add one small secondary 'Open in portal' link beside its own primary button; never two primary buttons. The CTA is hidden at ≤560px, so nothing important may live only there.

### 3c · Closed section (`details.sys-fold`)

- **Markup.** `<details class="sys-fold"><summary>Label</summary>…</details>`. It lives in `assets/system.css` so standalone pages and the shell share it; the older module names that carry the same look (`ma-how`, `bsp-drawer`, `cs-drawer`, `pe-more`) keep working and add only spacing.
- **Use.** Explanation, method and design notes (copy rule 12) sit in a closed `.sys-fold` or behind the Method control, never in a tab.

### 3d · Command band and the home's parts (system.css §6q)

The first block of every home in the shell (`modules/home.js`), and the only place the display face appears.

- **Band.** `section.sys-command[data-sys-theme="dark"]`: a dark island in both themes (`--sys-cmd-bg`, deep navy; one step lighter than the page in dark), radius `--sys-r-xl` (32px; 24px at ≤560px). Inside, depth comes from washes (`--sys-cmd-panel`, `--sys-cmd-panel-2` on hover, `--sys-cmd-line`), never borders. Order: `.sys-command-kicker` (mono 12px, a green dot, greeting by time of day and role, or company · role, plus a `sample` badge on sandbox homes), one `h1.sys-display` (`--sys-font-display`, `--sys-fs-command` 36→68px, `--sys-tr-command`; one per screen, never under 28px), one `.sys-command-lead` line, then its body. Decoration is CSS or an inline `aria-hidden` SVG (`.sys-command-mark`, one star per company in its accent).
- **Headline.** A reading of data the home already has, never an instruction: the firm home counts its list ("One loan due. Two exit windows."); a company or role home uses the first sentence of its catalogue line ("4 jobs today.").
- **Ask box.** `form.sys-askbox` (pill, one text field, `button.sys-send` round ink button) and `.sys-prompts` of `.sys-chip` buttons: the role's own question first as `.sys-chip--sig`, then its prompts. One ask entry on a screen at a time: the band's box, or the dock's composer while the dock is open, or `button.sys-askbox.sys-askbar` (the sticky pill), which shows (`[data-show]`) only while no other ask box is in view and sits in the flow at the end of the column, so it never covers the last line.
- **Figures.** `.sys-figs > .sys-fig` (`-label` mono 12px, `-value` Inter 600 tabular at `--sys-fs-fig`, `-sub`); at most three; estimates carry `.sys-est`. `.sys-figs--card` puts them on cards below the band (one row each at ≤560px).
- **Attention rows.** `.sys-attn` with `h2.sys-attn-title` and `ol.sys-attn-list > li.sys-attn-row`: one shape for every row, `.sys-attn-when` (a short time or count, a status edge from `data-st`), `.sys-attn-main` (a `.sys-attn-open` button that covers the row, then `.sys-attn-meta` with the grey `.sys-attn-sub` and `.sys-attn-acts` links that sit above the cover), and the status chip. Read-only lines go in one quiet `.sys-attn-quiet` line under the list.
- **Below the band.** `.sys-sec-head` (h2 20px, a quiet count or a pressed-chip toggle); `.sys-tiles > a.sys-tile[data-co]` (accent top bar, one figure, one `.sys-hold` bar, one status chip; always in the order PP, CET, Frontline, Thomas Scientific, BPI, Fair Harbor); `.sys-hold-bar` (years held on a shared 0–6 scale: `--sys-hold-track`, the exit window hatched in `--sys-hold-zone` from 4 years, the one exit to date as a `--sys-hold-mark` tick) with its `.sys-hold-key`; `ul.sys-day` of `.sys-day-item` buttons (columns on wide screens, `--list` or ≤560px a list), each asking the agent its own question; `.sys-next` (a field role's next job inside the band, `.sys-next-acts` 48px buttons); `th[aria-sort] .sys-sort` for a column you can sort.
- **Type floor.** Nothing in these parts is under 12px except the shared 11px `.sys-est` elsewhere.

Alternate band: `.sys-section--alt` (warm grey). Dark band: `data-sys-theme="dark"` on the section. Never more than one dark band in a row, never two `.sys-section--alt` in a row.

## 4 · Type, spacing, radii

| Role | Class / token | Size | Weight · tracking |
|---|---|---|---|
| Command headline (the home's band only, §3d) | `.sys-display` / `--sys-fs-command`, `--sys-font-display` (Instrument Serif, fallback ui-serif, Georgia) | `clamp(36px, 4.6vw, 68px)` | 400 · −.03em |
| Display hero only (a gallery or section hero) | `.sys-h1.sys-h1--display` | `clamp(48px, 9vw, 112px)` | 800 · −.05em |
| Page title (one per page) | `.sys-h1` / `--sys-fs-3xl` | `clamp(36px, 6.2vw, 72px)` | 800 · −.04em |
| Section title | `.sys-h2` / `--sys-fs-2xl` | `clamp(28px, 4.2vw, 48px)` | 800 · −.04em |
| Card / sub-section title | `.sys-h3`, `.sys-card-title` | 18–22px | 700 · −.02em |
| Lead | `.sys-lead` | 16–20px, ink-2, max 62ch | 400 |
| Body | — | 16px / 1.6 | 400 |
| Prose (memo, growth plans) | `.sys-prose` | 17px / 1.7, max 68ch | 400 |
| Kicker | `.sys-kicker` | mono 12px, uppercase, .12em | 600 |
| Labels, table heads | `.sys-card-label`, `th` | mono 11px, uppercase, .07–.08em | 600 |
| Numbers | `.sys-num`, `.sys-kpi-value` | mono, tabular | 600 |
| Provenance (in the Sources drawer) | `.sys-src` | mono 12px, mute | 500 |

Fonts: Inter for everything; JetBrains Mono only for numbers, labels, kickers and provenance; Instrument Serif (`--sys-font-display`) only for the one headline of the home's command band (§3d), never under 28px. No other families.

Spacing scale `--sys-sp-1…10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Rhythm: section padding `--sys-section-y` (56→112px); section head → content `--sys-head-gap` (28→48px); grid gap 16px (24px with `.sys-grid--gap-lg`); inside cards 10px between parts. Content width `--sys-wrap` 1200px with `--sys-gut` 16→40px; the frame uses the same width so edges line up.

Radii: 6 (kbd, code), 10 (notes, small controls), 16 (cards, tables, KPI strips), 24 (feature cards, CTA), 32 (the command band), pill (buttons, chips, nav). Tokens `--sys-r-xs|sm|r|lg|xl|pill`; `--sys-r-md` is an alias of `--sys-r` (16) for pages that think in sm/md/lg, so never redefine it locally. Shadows: `--sys-sh-1` resting, `--sys-sh-2` hover/raised, `--sys-sh-3` floating media only.

Buttons: one `.sys-btn--primary` per view region; `--secondary` beside it; `--ghost` for tertiary; `--accent` (gradient) at most once per page, usually in the hero or CTA; `--co` only on company pages. Sizes `--sm` (36px, top bars, card feet), default (44px), `--lg` (52px, hero and CTA).

## 5 · Frame.mount options per page

| Page | Call | Persona | Notes |
|---|---|---|---|
| `index.html` (front door) | no mount | — | Forwarding page into `app.html#/home/overview`. See §9. |
| `redesigns/index.html` | `Frame.mount({})` | portal | Active = Concepts. No concept tag (gallery is ours, not a company mock). |
| `redesigns/<co>/index.html` | `Frame.mount({})` | auto = company | Concept tag + `Concepts / ● Company` in the page bar, automatic. Old `.concept` bar and private header removed; section links move to `.sys-subnav`. |
| `redesigns/<co>/<os>.html` | `Frame.mount({})` | company | Active = Concepts; the page bar reads `Company / ● OS name` (ServiceOS, GridOS, FirmOS, LabOS, SignalOS, HarborOS). |
| `redesigns/<co>/growth-plan.html`, `punctual-pros/nationwide.html`, `ads.html` | `Frame.mount({})` | company | Active = Concepts; the page bar reads `Company / ● Growth plan`. |
| `redesigns/voice-ai.html`, `ai-agents.html` | `Frame.mount({ banner: true })` | portal | Page bar `Growth plans / ● Page`. |
| `app.html` | `Frame.mount({ variant: 'app', theme })` (the saved `bsp-theme`, light by default) | portal | See §8. Hotkey ⌘J (⌘K stays the shell's search). The top bar carries no page links; the side menu does. |
| `agent.html` (the agent) | `Frame.mount({ active: 'agent', crumb: [{ label: 'Home', href: './' }, { label: 'Agent' }], persona: inst.id, chat: inst })`, called once after `Chat.mount` | `ag-<role>` (registered by `assets/agent.js`) | Inline agent (`Chat.mount('#ca-chat', { mode: 'inline', hostedOnly: true, expand: false, commands: false, engine: false, workspace, renderCard, onTurn })`); no floating launcher. Top-bar link "Agent" (id `agent`). Inside the shell it is embedded at `#/home/agent` with `?embed=1` (§9a). Consent, sync and role sheet use `.sys-dialog` (§3b). Page CSS `assets/agent.css`, prefix `ca-`. |
| `theater.html`, `redesigns/case-studies.html`, `redesigns/methodology.html` | no mount | — | Forwarding pages. See §9. |
| any page with `?embed=1` | whatever it asks for | — | Drawn as the embedded form (§9a). |
| `briefing/executive_memo.html` | no mount | — | See §10. |

Other options: `nav` (per-page override of primary links, `{ <id>: href }` or `{ <id>: { href, label, hint } }`; ids are `home`, `agent`, `connect`, `concepts`; the old `os` and `playbooks` ids mark Concepts. A link whose href is a `#/` route on the current page is marked `aria-current` while the hash is on that route and the frame keeps it in sync on `hashchange`, so pages never patch frame links after mount), `co`, `active`, `persona`, `crumb: [{label, href?, co?}]` (hrefs are root-relative: `'redesigns/'`, `'app.html#/pp/overview'`), `crumbAside: 'Concept · Oct 2026'`, `cta: {label, href}` (small primary button in the bar), `viewAs` (the "Viewing as" switch; default on), `footer`, `hotkey`, `chat` (an existing widget instance), `humanize: true | 'observe' | false`. Mount once per page; a second call returns the first frame.

Chat: pages keep mounting their own floating widget (`Chat.mount(null, { persona, mode: 'floating' })`; any `theme` option is ignored, the widget follows the page theme) with their FAQ and suggestions. **Launcher label rule:** the shell's floating launcher (persona `portal`, the assistant "Broad Sky OS") reads just "Ask". A company persona's launcher reads "Ask " + its short name — the persona's `short` field, or `short_name` passed to `Chat.mount` when a page renames its assistant ("Ask Punctual Pros", "Ask CET", "Ask Fair Harbor"). Never derive it by truncating the persona name to its first word ("Ask Punctual", "Ask Fair"). At ≤560px the launcher is an icon-only 44px circle (label kept in `aria-label`), see §11. The Ask button opens that widget if present, else focuses an inline chat, else lazy-loads `chat.js` with the persona. Pass `chat: inst` to `Frame.mount` (or call `Frame.mount(...).setChat(inst)`) when you hold the instance. A page with its own Ask panel calls `Frame.mount(...).setAsk(fn)`: while `fn` is set the Ask button and the hotkey call it instead of opening the assistant, and `setAskState(open)` sets `aria-expanded` on the Ask button; `setAsk(null)` restores the assistant and removes `aria-expanded`. Both do nothing in the embed variant.

## 6 · Accent rules

- **Brand gradient** (`--sys-grad`, orange → violet): kicker rule, active top-bar link underline, `.sys-btn--accent`, and at most one `.sys-grad-text` phrase in the page `h1`. Nowhere else.
- **Company accent** (`--co-pp` #f08a3c, `--co-cet` #4c8dff, `--co-fl` #9d7bff, `--co-ts` #2ecc8f, `--co-bpi` #e05c8a, `--co-fh` #3fd0e0): set `data-co` on `<body>` for a company page, or on a single card, chip, KPI or crumb item on portfolio-wide pages. Allowed on: dots, card top bars, KPI top borders, list bullets, kicker rule, crumb dot, sub-nav dot and active pill (`--co-soft` / `--co-ink`), `.sys-note--co`, `.sys-btn--co`, hero glow. Not allowed on: body text, headings, section backgrounds, large fills, table text. Text in an accent uses `--co-ink`, never the raw `--co`.
- One company per card. Portfolio pages show each company only in its own colour; the order is always PP, CET, Frontline, Thomas Scientific, BPI, Fair Harbor.
- Status colours (`--sys-good|warn|bad|info`) mean status only: deltas, notes, est./illustrative/live badges.
- Concept sites keep the company's identity through `--co`, the accent dot before `.sys-subnav-title` (§3a), and photography or demos inside cards — not through a private type scale, header or palette.

## 7 · Copy rules

1. Plain English sentences. Sentence case for headings and buttons. No marketing filler.
2. **No raw identifiers in visible text**: no snake_case (`book_job`, `pp_sales_pa_a`), no file names (`.json`), no internal ids (`ra-pp`, `kb-fl-2`), no `key=value`, no route hashes, no `(null)`, `undefined`, `NaN`. Write the human name: "Punctual Pros deed records (PA)", "books the job and pages the on-call tech". Use `Frame.label(id)` / `Frame.humanizeText(s)` in renderers; `Frame.humanize` is the safety net, not the plan. Wrap genuine code in `<code>` or mark the block `data-raw`. A table cell holds no identifier at all.
3. **Every estimate carries `.sys-est`** (`<span class="sys-est">est.</span>`) right after the number; illustrative figures use `.sys-est--illus` ("illustrative"); live feeds use `.sys-est--live` ("live"). Missing values render as "—", never blank, never "null".
4. **Provenance and method sit behind controls, not on the page.** No "Source:" line, caption or legend paragraph on a screen. Mark the element `data-src` (the shell moves it into the Sources drawer) or `data-method` (the Method drawer), and the screen's as-of date `data-asof` (the one chip in the header). Each control shows only when it has content. A standalone page keeps its sources in a closed `.sys-fold`. A warning that changes a decision stays on the screen, as a chip of 12 words at most. Dataset names come from `Frame.LABELS`.
5. Numbers: `$14.2M`, `27%`, `4,417`, `Sept 2026`; ranges with an en dash (`$25–35M`); mono via `.sys-num` in running text.
6. Author line: "Prepared by Syed Rahman". The footer already carries it with the disclaimer; do not repeat it elsewhere except the memo's title block.
7. Concept notice wording comes only from the frame (`Frame.BANNER_TEXT`); pages never write their own.
8. Link text says where it goes ("Wastewater accounts →"), never "click here". External links open in a new tab with `rel="noopener"`.
9. **Visitor-ready, never developer-facing.** Nothing a visitor sees mentions keys, model pickers, slash commands, dataset ids, the repo, builds, deploys, scripts, manifests, row counts, version strings or a "working draft". Data dates read as plain sentences ("Updated October 8, 2026") or sit in the as-of chip. Estimates stay visible behind a "Show estimates" / "Hide estimates" toggle, never a "BSP-only" label.
10. **Define a term on first use in a view.** `modules/copy.js` `gloss()` adds a short definition in parentheses after the first use of unitranche, PIK, delayed-draw, NPDES, SRF, WWTP, FSM, MOIC, IRR, CTV, LSA, ASR, BDC, RCM, MSP, LMM, SPV, GAV, DTC, AOV, GPO and NWS in running text of `#content` (and separately in `#inspector`). It never touches headings, labels, KPI tiles, chips, buttons or links, never nests inside another parenthesis, and skips a view that already spells the term out. Loan shorthand from lender filings ("S+425–475", "marked at par") is rewritten in words by `Copy.credit`. PRG and EBITDA need no gloss for this audience.
11. **Same words for the same thing.** Company modules use the tab names Operating picture, Add-on targets, Growth opportunities, Comparables and Public filings; the matching h1 reads "<Company> · operating picture | add-on targets | public filings". A company's ranked levers panel is "Growth levers"; the full target table is "Full screen"; the redesign pages are "Growth plan".

## 8 · `app.html` (the shell: the website, with a side menu)

The shell is not a separate product skin. A visitor moving between `index.html`, a concept page and `app.html` sees the same background, surfaces, type scale, card radius and shadow, KPI tiles, tables, buttons, chips, notes and est. badges, and the same light or dark theme.

**Theme (one preference, every page).** `html[data-sys-theme]` is `light` or `dark`; the choice is saved under `localStorage['bsp-theme']`, light by default like the site, and an explicit saved choice wins. Every page applies it in the inline `<head>` script of §2 before the stylesheets (no flash). The one toggle is the frame's top-bar button (`.sys-theme[data-sys-theme-toggle]`, next to Ask) on every page; it calls `Frame.setTheme()` (also `getTheme`, `toggleTheme`), which writes the attribute and the key, and other open tabs follow through the `storage` event. No page is locked to one theme; the portal's 3D map (`#/theater/play`) draws its stage as a dark band on either theme. In the portal, `Frame.mount({ variant: 'app', theme })` gets the saved value, the console's own `#theme-btn` hides because the frame renders the toggle, and `Theme.set()` in `assets/core.js` calls `Frame.setTheme()`. Every chat widget follows the page (`theme` is always `'auto'`; the assistant page's own theme button also calls `Frame.setTheme()`). Dark exists only as system.css §2 tokens; the console has no palette of its own. `html[data-theme]` is mirrored for older module CSS hooks. `Theme.watch` hears every change, whoever makes it, and Leaflet maps swap between the Esri light and dark tiles in place (filters and selection survive). The chat widget (`theme: 'auto'`) follows the attribute.

**Load order and shell.** `system.css` before `app.css`; `Frame.mount` before `App.start()`; `App.start()` waits for the role in view (`assets/session.js`). The frame strip (56px, the same top bar as every page: wordmark, "Viewing as", Ask, theme) sits above the menu and content; `body[data-sys-layout="app"]` becomes a column flex and `#app` fills the rest (system.css §7a). No banner, breadcrumb row or footer, and no page links in the strip: the side menu carries them. ⌘K opens the shell's search; the Ask button and ⌘J open the chat. `modules/registry.js` holds the menu (`RAIL` for the firm levels, `MENUS` for the company levels) and the `LEVELS` table; the menu and the tabs are drawn from them at draw time. A screen the level does not have sends the visitor home with one line, "Not in this view."

| Console part | Built from |
|---|---|
| Menu `#rail` | a vertical sys-nav on `--sys-bg`: `.sys-card-label` group heads, `a.rail-item` links (14px Inter, pill hover on `--sys-bg-3`, current = `--co-soft` / `--co-ink`), the module's `.sys-dot` accent, `.sys-kbd` tags; the footer is a `.sys-src` line ("All views" for the firm levels, and the author line). The firm menu fits without scrolling at 1440x900 and 1280x800. At ≤900px the menu is one native picker (`#rail-pick`). |
| Screen bar `#topbar` | the sub-nav pattern (§3a): `nav.sys-subnav-links` of `a.view-tab` links (current = `--co-soft`), then the one as-of chip (`.sys-chip`), the "Sources" and "Method" buttons (`.sys-btn--secondary.sys-btn--sm`, each shown only when it has content) and `.sys-btn--secondary` search with `.sys-kbd`. |
| Content `#content` | `--sys-bg`, padding `--sys-sp-6` / `--sys-gut`. `#main[data-co]` carries the module accent (`--co`), so `.sys-card[data-co]` bars, `.sys-chip--soft`, `.sys-note--co` and the current tab read it. |
| Inspector `#inspector` (the side panel; also the Sources and Method drawers) | a `.sys-card` drawer (`--sys-sh-2`, accent bar from `data-co`), `.sys-card-title` head, `.sys-card-label` section heads, `.sys-btn--secondary.sys-btn--sm` actions; full-height overlay at ≤900px. |
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

**Bespoke blocks in a module** use the same vocabulary, never new colours: a block is `<section class="sys-card">` with `<h3 class="sys-card-title">`, `<div class="sys-card-body">` and a a source marked `data-src`; a figure is `<div class="sys-kpi"><div class="sys-kpi-label">…</div><div class="sys-kpi-value">…</div><div class="sys-kpi-sub">…</div></div>` inside `.sys-kpis`; status is `.sys-chip--good/--warn/--bad/--info`; an accent is `data-co="<company>"` (or `data-co="" style="--co:var(--c-…)"`). Hand-written `.panel/.kpi/.btn/.chip/.tbl/.note` still work: `modules/copy.js` adds the matching `.sys-` class after every render and `app.css` aliases the old child classes to the same tokens.

- Module renderers write human labels (`Frame.label`) and `.sys-est` badges; `humanize: 'observe'` catches anything that slips through on re-render.
- Menu footer: "All views" (firm levels) and "Syed Rahman · Nov 2026".

## 9 · Forwarding pages (`index.html`, `theater.html`, `redesigns/case-studies.html`, `redesigns/methodology.html`)

- `index.html` is the front door: it carries `<meta name="bsp-forward" content="app.html#/home/overview">` (plus its title, description and share image) and opens the firm view, keeping the query string (`?role=`, `?backend=`). Old anchors land where their content now lives: `#briefing` on `#/briefing/play`, `#platforms` on `#/home/overview`, `#deals` on `#/ma/pipeline`, `#os` and `#growth-plans` on the same anchors of `redesigns/`. Its body card reads "Opening the firm view." with one link, "Open Broad Sky OS".
- The other three pages moved into the shell: the 3D map is `app.html#/theater/play`, the sponsor case histories are `#/cases/timeline` and the deal record is `#/bsp/deals`. Each old address only hands its visitor on.
- Head: the §2 order, plus `<meta name="bsp-forward" content="<target>">`, one inline script that replaces the location, and `<noscript><meta http-equiv="refresh" content="0; url=<target>"></noscript>`. The script keeps what the old link carried: the 3D map's `scene`, `autoplay` and `fallback` go inside the hash (`theater.html?scene=S3&autoplay=0` opens `app.html#/theater/play?scene=S3&autoplay=0`), an old section anchor opens the matching screen (`#sequence` opens `#/cases/sequence`, `#rubric` opens `#/bsp/rubric`), and any other query string stays on `app.html`.
- Body: no `Frame.mount`, no chat. One `.sys-card` in the middle of the screen: a `.sys-card-label`, the sentence "This page has moved into Broad Sky OS." as `h1.sys-card-title`, and one `.sys-btn--primary` link to the target. Light or dark from the saved theme.
- `scripts/ci_check.py` checks each target and does not render the page; the knowledge build and the sitemap leave it out. No page uses the frame's `variant: 'minimal'` any more.

## 9a · Embedded form (`?embed=1`)

- **What it is.** Any page opened with `?embed=1` is drawn by `Frame.mount` as variant `embed`, whatever the page asked for, and gets `<html data-embed>`. Pages need no change. The shell (`modules/embed.js`, `embedView`) shows such a page in an iframe for the agent (`#/home/agent`), each company's Tools (its software page) and Plan (its growth plan).
- **What it draws.** The page's own content only: no top bar, footer, breadcrumb, concept tag, page sub-bar or floating Ask button (system.css §7a hides them). It fills the shell's content area and scrolls once. The shell owns the bar, the switch and Ask.
- **Role and theme.** The shell passes `?role=<id>` (and `?backend=off` when the shell has it); the page follows the switch through the storage event (`assets/session.js`) and the same saved theme.
- **The home's dock (`?embed=1&dock=1`).** The home overview (`modules/home.js`) has no first row: its head, an answer area (`#hm-out`, empty until used), then the body. The role's agent is docked at the right: the shell draws its chrome ("Agent", one muted line "<role> · <organization>" that opens the "Viewing as" switch, Clear while the thread has a message or the home shows an address answer (it empties both), Close) and `agent.html` in its dock form fills it: the signature question as one card, the chips as quiet rows, the thread, the composer at the bottom. 360px column from 1200px (open unless closed there, `localStorage['bsp-os-dock']`), an overlay from the right below, a full-width sheet at ≤560px. While the home is on screen the top bar's Ask and its hotkey toggle the dock (`Frame.mount().setAsk`; the hotkey pressed inside the dock posts `{ type: 'bsp:dock-toggle' }`) and the floating launcher is hidden; while the dock is closed every home shows "Ask the agent", which opens it. For every role, as in the floating Ask panel, a site address typed in the dock is not sent to the agent: the page posts `{ type: 'bsp:address', text, id }`, the home writes `#/home/overview?address=<text>` in place and runs the address lookup in its answer area, and posts `{ type: 'bsp:address-done', id, status, side }` back, so the reply line reads "The answer for <address> is on the left" (or "on the home screen"), the lookup's error, or "Lookup stopped for <address>". The answer area is a labelled region, not a live one; one status line reads out the answer's first sentence. Beside the docked column below 1440px the six-company table drops "What moves it" (the row's side panel holds the next action) so Status always shows. The `#/home/agent` screen keeps the full embedded form.
- **Links.** A link in an embedded page that leads to `app.html` or to another page opens in the top window, never inside the frame.

## 10 · Print pages

- `briefing/executive_memo.html` owns its print layout: load `system.css` for tokens and `.sys-prose`, set `<body data-sys-print="own">`, and do not call `Frame.mount`. All system print rules skip `data-sys-print="own"`.
- Every other page prints through system.css §10: frame, banner, sub-nav, buttons, footer links and the chat are hidden; colours go to black on white; cards, KPIs, notes and table rows do not break across pages; external prose links print their URL.

## 11 · Mobile

Mobile-first. The "Viewing as" path is in the top bar at every width. As the bar narrows, "Back to …" moves into the sheet's header, then the organization's name goes (its dot stays), then the role title ellipses; at ≤560px the wordmark shrinks to its mark. The sheet's map scrolls sideways under sticky row labels when its columns do not fit, and at ≤720px the sheet is full height with a stacked list of 44px role rows. On a standalone page the primary links collapse into a menu sheet at ≤960px; a page shows two bars at most (top bar + page bar, 56 + 48px); at ≤560px the page bar's parent becomes a back arrow; the floating chat launcher is an icon-only 44px circle anchored bottom-right inside the safe-area insets at ≤560px and the labelled pill ("Ask", or "Ask" + a company name) from 561px up, and it steps aside (fades out, `.ch-launch--tuck`) while it would sit on a page button or link, coming back as soon as the user scrolls past it; the footer carries extra bottom padding so the launcher never sits on its last line; the sub-nav scrolls horizontally with a fade; grids are one column below 720px (KPI strips two columns); hero and CTA buttons stack. Nothing may scroll the page horizontally at 390px — wide tables scroll inside `.sys-table-wrap`, maps and charts size to their container.

## 12 · Checklist (every page must pass all twelve)

1. Head follows §2 exactly: Inter + JetBrains Mono, `system.css` before page CSS, same `?v=` stamp on system, frame and chat.
2. `Frame.mount` is called once with the options in §5; the right primary link is marked active; no private header, banner or footer remains; the page also reads correctly with `?embed=1` (§9a).
3. Concept pages show the frame banner (not a local one) and the automatic breadcrumb with the company dot.
4. Skeleton follows §3: one `h1.sys-h1`, sections built from `.sys-section-head` + `.sys-*` components, one `.sys-cta`, frame footer last.
5. No colour, font family, font size, radius or shadow literal in page CSS that a `--sys-*` / `--co-*` token covers.
6. Accents follow §6: gradient only in its allowed places, company accent only via `data-co` and never as text colour except `--co-ink`.
7. Visible text contains no snake_case, file names, internal ids, `key=value`, `(null)`, `undefined` or `NaN` — check with `document.body.innerText` after the page settles.
8. Every estimate has `.sys-est`, every illustrative figure `.sys-est--illus`, every live feed `.sys-est--live`; missing values show "—".
9. Provenance and method are marked `data-src` and `data-method`, not printed on the screen; the as-of date is `data-asof`.
10. Author appears only as "Syed Rahman"; no email, phone, employer or other name anywhere in markup, metadata or scripts.
11. Ask opens the chat with the page's persona (§5); ⌘K (⌘J in the shell) does the same; the floating launcher and Ask open the same widget.
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
- Inside clipped scrollers (side menu, screen tabs, tables, palette) the ring draws inside the element (`outline-offset: -2px`) so it is never cut off.

**Landmarks, skip link, names**

- One `main#main` per page; the frame adds `a.sys-skip` ("Skip to content") as the first tab stop. It focuses `<main>` (made `tabindex="-1"`) without touching `location.hash`, so it is safe on hash-routed pages such as `app.html`.
- The concept banner is a top-level `<aside aria-label="Concept notice">`; nothing on a page sits outside a landmark. Embedded widgets (the full-screen assistant) never add a second `<main>`.
- Icon-only buttons carry an `aria-label` that starts with their visible text when there is any ("Ask (opens the … chat)", "Close inspector", "Previous page", "Next page", "Open menu" / "Close menu", "Dismiss concept notice"). Search boxes without a visible label carry `aria-label`; selects sit inside their `<label>`.
- A table wrap that scrolls but holds nothing focusable gets `tabindex="0"`, `role="region"` and a name from its caption or card heading (the frame does this on mount, on DOM changes and on resize), so keyboard users can scroll it.

**Keyboard**

- Tab order: skip link → brand → Viewing as → primary links → Ask → (shell) menu items → screen tabs → Sources, Method and search → view content (filters, sortable headers, rows) → chat composer when open.
- The "Viewing as" path is one button (`aria-haspopup="dialog"`) that opens a modal sheet (`role="dialog"`, labelled "Viewing as") onto the role in view: arrows move through the map (Up and Down within an organization, Left and Right across), Home and End go to the first and last role, typing a letter goes to "Find a role" (Enter picks the first match; with no match one status line says "No role matches.", and while roles match it gives their count to a screen reader), Enter or Space chooses, Tab stays inside the sheet, Escape or a press on the dimmed page closes it and returns focus to the button. Its accessible name is "Viewing as <role>, <organization>. Change"; the dock's role line has the same popup type and ends its name with ". Change" too.
- Menu items are links (`a.rail-item`) with `aria-current="page"` on the active module; Enter or Space opens the module and focus stays on the item after the route change. View tabs carry `aria-current="page"`; segmented buttons and filter toggles carry `aria-pressed`.
- `UI.table`: sortable headers are focusable with `aria-sort` and sort on Enter or Space; when a table has a row inspector, rows are focusable and open it on Enter or Space.
- The inspector moves focus to its close button when opened from the keyboard; Escape or the close button closes it and returns focus to the row or control that opened it. Escape inside the chat closes only the chat.
- Escape closes the floating chat panel and returns focus to its launcher; ⌘K / ⌘J still open it.
- The mobile menu sheet (≤960px) traps focus while open (menu button plus sheet links form one loop), opens onto its first link when activated from the keyboard, and Escape closes it and returns focus to the menu button.

**Checks before shipping a page**

1. axe-core shows no serious or critical violations at 1400px in each theme the page supports (`color-contrast`, `button-name`, `label`, `link-name`, `duplicate-id`, `scrollable-region-focusable`, landmark rules).
2. A keyboard-only pass reaches every control with a visible ring, and Escape closes whatever is open.
3. Page markup follows the ARIA patterns it claims: `role="tablist"` holds only `role="tab"` children (no `aria-pressed` on tabs), `aria-expanded` only on elements that support it (not on plain table rows), `aria-label` only on elements with a role, `<aside>` only at the top level, headings step down one level at a time, and an SVG with `role="img"` contains no focusable nodes.
