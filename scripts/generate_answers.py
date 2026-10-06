#!/usr/bin/env python3
"""Precompute Claude deep-dive answers for the assistant's suggested prompts.

For each prompt in data/answers/prompts.json:
  1. pick datasets by keyword mapping (plus persona defaults, or the prompt's own "datasets"),
  2. build a grounding pack (meta narrative / financial picture / top items, <= 4k chars per dataset,
     plus the nightly live snapshots in data/live when the question is about weather, alerts or bids),
  3. ask Claude (Python SDK, streaming, get_final_message) in a senior PE operating-partner voice,
  4. write data/answers/<slug>.json {question, persona, model, generated_at, html, markdown, sources}
     and data/answers/index.json.

Prompts answered less than 7 days ago are skipped unless --force.
Env: ANTHROPIC_API_KEY (required), MODEL (default claude-opus-5-5), EFFORT (default medium),
     MAX_TOKENS (default 3000).  Options: --force, --only <slug,...>, --limit N, --dry-run (print packs, no API).
"""
import datetime as dt, glob, html, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANS = os.path.join(ROOT, 'data', 'answers')
RES = os.path.join(ROOT, 'data', 'research')
LIVE = os.path.join(ROOT, 'data', 'live')
MODEL = os.environ.get('MODEL', 'claude-opus-5-5')
EFFORT = os.environ.get('EFFORT', 'medium')
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', '3000'))
STALE_DAYS = 7
PER_DATASET = 4000
MAX_DATASETS = 6

LABELS = {
    'ai_agents_portfolio': 'Portfolio AI-agent plan', 'bpi_filings': 'BPI public filings', 'bpi_playbook': 'BPI growth plan', 'bsp_firm': 'Broad Sky firm profile',
    'bsp_methodology': 'Broad Sky acquisition methodology', 'bsp_network': 'Broad Sky professional network', 'cases_cross_sector': 'Cross-sector sponsor case studies',
    'cases_home_services': 'Home-services company case studies', 'cet_filings': 'CET public filings', 'cet_opportunities': 'CET opportunity radar',
    'cet_playbook': 'CET growth plan', 'cet_wwtp_targets': 'CET wastewater-plant targets', 'design_refs': 'Design principles', 'fairharbor_filings': 'Fair Harbor public filings',
    'fh_playbook': 'Fair Harbor growth plan', 'fl_midsize_firms': 'Mid-size law firms', 'fl_playbook': 'Frontline growth plan', 'frontline_filings': 'Frontline public filings',
    'ma_targets_cet': 'CET add-on targets', 'ma_targets_fl_ts': 'Frontline and Thomas Scientific add-on targets', 'ma_targets_pp': 'Punctual Pros add-on targets',
    'pe_landscape': 'Private-equity landscape', 'pp_ads': 'Punctual Pros ad plan', 'pp_demand_model': 'Punctual Pros demand model', 'pp_filings': 'Punctual Pros public filings',
    'pp_market': 'Punctual Pros market profile', 'pp_nationwide': 'Punctual Pros nationwide plan', 'pp_storm_events': 'Punctual Pros storm events',
    'public_comps': 'Public comparables', 'rival_filings': 'Competitor filings', 'serviceos_evidence': 'ServiceOS evidence', 'thomas_filings': 'Thomas Scientific public filings',
    'ts_playbook': 'Thomas Scientific growth plan', 'voice_ai': 'Voice AI research', 'cet_ne_rfps': 'New England public bids', 'pp_meta': 'Punctual Pros territory profile',
    'live:nws_alerts': 'National Weather Service alerts (nightly snapshot)', 'live:forecast_hubs': 'Open-Meteo 7-day forecast (nightly snapshot)',
    'live:usaspending_trades': 'Federal trade-contractor awards (nightly snapshot)', 'live:echo_npdes_majors': 'EPA wastewater-plant compliance (nightly snapshot)',
    'live:census_permits': 'Census building permits (nightly snapshot)',
}
COMPANY = {'pp': 'Punctual Pros', 'cet': 'Commonwealth Electrical Technologies (CET)', 'fl': 'Frontline Managed Services', 'ts': 'Thomas Scientific',
           'bpi': 'Bully Pulpit International (BPI)', 'fh': 'Fair Harbor'}
PERSONA_DEFAULTS = {
    'portal': ['bsp_firm'], 'pp': ['pp_market', 'pp_filings'], 'cet': ['cet_playbook', 'cet_filings'], 'fl': ['fl_playbook', 'frontline_filings'],
    'ts': ['ts_playbook', 'thomas_filings'], 'bpi': ['bpi_playbook', 'bpi_filings'], 'fh': ['fh_playbook', 'fairharbor_filings'],
}
# (regex on the lowercased question, datasets, per-company dataset family to add for the companies named)
KEYWORDS = [
    (r'nationwide|scale .*punctual|roll-?up', ['pp_nationwide', 'cases_home_services', 'ma_targets_pp'], None),
    (r'wastewater|horton|wwtp|switchgear|treatment plant', ['cet_wwtp_targets', 'live:echo_npdes_majors', 'cet_playbook'], None),
    (r'storm|weather|alert|forecast|this week', ['live:nws_alerts', 'live:forecast_hubs', 'pp_demand_model', 'pp_storm_events'], None),
    (r'compet|rival|landscape|\bpe\b|sponsor', ['pe_landscape', 'rival_filings', 'cases_home_services'], None),
    (r'\bbids?\b|\brfps?\b|due in', ['cet_ne_rfps', 'cet_opportunities', 'live:usaspending_trades'], None),
    (r'revenue|filings?|financial|ebitda|estimate', [], 'filings'),
    (r'add-?on|acqui|targets?\b|m&a', [], 'targets'),
    (r'serviceos|tech-?enable|valuation|multiple', ['serviceos_evidence', 'public_comps'], None),
    (r'new-?mover|home sales|\bleads?\b', ['pp_ads', 'pp_market', 'live:census_permits'], None),
    (r'public comps|comparables|\bcomps\b', ['public_comps', 'serviceos_evidence'], None),
    (r'\bctv\b|\bads?\b|media plan|advertis|marketing', ['pp_ads'], None),
    (r'northeast|new england|scale cet', ['cet_playbook', 'cet_opportunities', 'ma_targets_cet', 'live:census_permits'], None),
    (r'growth plan|playbook|value-?creation', [], 'playbook'),
    (r'ai agents?|agentic|automation', ['ai_agents_portfolio', 'voice_ai'], None),
    (r'voice|24/7|2am|after-?hours|missed call', ['voice_ai', 'pp_demand_model'], None),
    (r'membership|comfort club|rebate|heat pump', ['pp_market', 'pp_nationwide', 'pp_filings'], None),
    (r'solar|\bev\b|charging|incentive|program', ['cet_opportunities', 'cet_playbook'], None),
    (r'service desk|ebilling|a/r|law firm|security', ['fl_playbook', 'fl_midsize_firms'], None),
    (r'cleanroom|vendor-managed|punchout|\blabs?\b', ['ts_playbook', 'thomas_filings'], None),
    (r'methodolog|how .*broad sky buys|thesis', ['bsp_methodology'], None),
]
COMPANY_WORDS = {'pp': r'punctual|\bpp\b', 'cet': r'\bcet\b|commonwealth|horton|nuwave', 'fl': r'frontline', 'ts': r'thomas', 'bpi': r'\bbpi\b|bully', 'fh': r'fair harbor|trunks'}
PER_COMPANY = {
    'filings': {'pp': 'pp_filings', 'cet': 'cet_filings', 'fl': 'frontline_filings', 'ts': 'thomas_filings', 'bpi': 'bpi_filings', 'fh': 'fairharbor_filings'},
    'targets': {'pp': 'ma_targets_pp', 'cet': 'ma_targets_cet', 'fl': 'ma_targets_fl_ts', 'ts': 'ma_targets_fl_ts'},
    'playbook': {'pp': 'pp_nationwide', 'cet': 'cet_playbook', 'fl': 'fl_playbook', 'ts': 'ts_playbook', 'bpi': 'bpi_playbook', 'fh': 'fh_playbook'},
}


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def label(name):
    return LABELS.get(name, name.replace('live:', '').replace('_', ' '))


def choose_datasets(q, persona, explicit=None):
    if explicit:
        return explicit[:MAX_DATASETS]
    ql = q.lower()
    cos = [c for c, rx in COMPANY_WORDS.items() if re.search(rx, ql)] or ([persona] if persona in COMPANY else [])
    out = []
    for rx, ds, fam in KEYWORDS:
        if re.search(rx, ql):
            out += ds
            if fam:
                out += [PER_COMPANY[fam][c] for c in cos if c in PER_COMPANY[fam]]
    if re.search(r'every company|portfolio|across the portfolio', ql):
        out += ['serviceos_evidence', 'ai_agents_portfolio', 'bsp_firm']
    out += PERSONA_DEFAULTS.get(persona, [])
    seen, res = set(), []
    for d in out:
        if d not in seen and (d.startswith('live:') or os.path.exists(path_for(d))):
            seen.add(d); res.append(d)
    return res[:MAX_DATASETS]


def path_for(name):
    if name.startswith('live:'):
        return os.path.join(LIVE, name[5:] + '.json')
    p = os.path.join(RES, name + '.json')
    return p if os.path.exists(p) else os.path.join(ROOT, 'data', name + '.json')


def clip(v, n):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    return s if len(s) <= n else s[:n] + '…'


ITEM_DROP = {'source_urls', 'retrieved', 'geometry', 'assumptions', 'sources', 'raw', 'polygon', 'coords'}


def compact_item(it, n=600):
    if not isinstance(it, dict):
        return clip(it, n)
    d = {k: v for k, v in it.items() if k not in ITEM_DROP and v not in (None, '', [], {})}
    return clip(d, n)


def pack_dataset(name):
    """<= PER_DATASET chars: title, key meta (financial_picture, narrative, thesis, summaries, caveats), then top items."""
    try:
        j = json.load(open(path_for(name)))
    except Exception as e:
        return None
    if isinstance(j, list):
        meta, items = {}, j
    else:
        meta, items = j.get('meta', {}) if 'meta' in j else {k: v for k, v in j.items() if k != 'items'}, j.get('items', [])
    if name == 'cet_ne_rfps':  # keep open bids only, soonest first
        today = dt.date.today()
        def due(r):
            m = re.match(r'(\d{2})/(\d{2})/(\d{4})', str(r.get('due_date') or ''))
            return dt.date(int(m[3]), int(m[1]), int(m[2])) if m else dt.date(2100, 1, 1)
        items = sorted([r for r in items if due(r) >= today], key=due)
    parts = [f'### {label(name)}']
    if name.startswith('live:'):
        parts.append(f"fetched_at: {j.get('fetched_at')}")
        for k in ('counts_by_state', 'by_state', 'units_by_state', 'period', 'filters'):
            if k in j: parts.append(f'{k}: {clip(j[k], 600)}')
    else:
        for k in ('title', 'subject', 'generated'):
            if meta.get(k): parts.append(f'{k}: {clip(meta[k], 300)}')
        for k in ('financial_picture', 'narrative', 'thesis', 'thesis_summary', 'landscape_summary', 'expansion_thesis', 'territory_summary', 'program_summary',
                  'value_summary', 'strategy_summary', 'multiple_premium_summary', 'methodology_narrative', 'network_summary', 'pp_revenue_model', 'top_10_actions',
                  'priority_top_15', 'ranked_top_10', 'top_20_ranked', 'implications_for_bsp', 'sector_benchmarks', 'estimate_table', 'kpi_roadmap', 'cross_case_patterns',
                  'formula', 'test_plan', 'coverage_by_state'):
            if k in meta:
                parts.append(f'{k}: {clip(meta[k], 1400)}')
            if sum(map(len, parts)) > PER_DATASET * 0.6:
                break
        if meta.get('caveats'):
            parts.append(f"caveats: {clip(meta['caveats'], 300)}")
    body = '\n'.join(parts)
    rows = []
    for it in items[:40]:
        r = '- ' + compact_item(it)
        if len(body) + sum(map(len, rows)) + len(r) > PER_DATASET:
            break
        rows.append(r)
    if rows:
        body += f'\nitems ({len(items)} total, first {len(rows)} shown):\n' + '\n'.join(rows)
    return body[:PER_DATASET]


def system_prompt(persona):
    today = dt.date.today().strftime('%B %d, %Y')
    if persona in COMPANY:
        voice = (f"You are writing a reference answer for the customer-facing assistant on a concept website for {COMPANY[persona]}, a Broad Sky Partners portfolio company. "
                 "Answer the visitor's question helpfully and specifically, in the company's voice, then add a short 'Why this matters for the business' note "
                 "written as a senior private-equity operating partner would.")
    else:
        voice = ("You are a senior private-equity operating partner at Broad Sky Partners (a New York lower-middle-market firm; portfolio: Commonwealth Electrical "
                 "Technologies, Punctual Pros, Frontline Managed Services, Thomas Scientific, Bully Pulpit International, Fair Harbor), writing a deep-dive answer "
                 "for the firm's operating-intelligence portal.")
    return (f"{voice}\n\nToday is {today}.\n\nRules:\n"
            "- Write in markdown: a one-paragraph bottom line first, then short headings, bullets and at most one compact table. 350-700 words.\n"
            "- Ground every claim in the CONTEXT. Cite datasets by their plain-English name in parentheses, e.g. (Punctual Pros demand model).\n"
            "- Never invent numbers. If a figure is not in the context, say what data would answer it instead of guessing.\n"
            "- Label anything modelled or inferred as an estimate (write 'est.').\n"
            "- No legal or regulatory-compliance advice.\n"
            "- House style: say 'growth plan' (never 'playbook') and 'portfolio company' for a sponsor's company ('platform' only for software). "
            "Write dates in words (Oct 6, 2026). Never print file names or identifiers with underscores. No greetings and no addressing anyone by name. "
            "Do not cite brands as design inspiration.\n"
            "- End with 2-4 concrete next actions for the operating team.")


def md_inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![*\w])\*([^*\n]+)\*(?!\w)', r'<em>\1</em>', s)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    return s


def md_to_html(md):
    """Minimal markdown: headings, paragraphs, ul/ol (one level), tables, hr, blockquote, inline bold/italic/code/links."""
    out, lines, i = [], md.replace('\r', '').split('\n'), 0
    para = []
    def flush():
        if para:
            out.append('<p>' + md_inline(' '.join(para)) + '</p>'); para.clear()
    while i < len(lines):
        ln = lines[i].rstrip()
        if not ln.strip():
            flush(); i += 1; continue
        m = re.match(r'^(#{1,6})\s+(.*)', ln)
        if m:
            flush(); lvl = min(len(m[1]) + 1, 6); out.append(f'<h{lvl}>{md_inline(m[2])}</h{lvl}>'); i += 1; continue
        if re.match(r'^\s*([-*_])\s*\1\s*\1[\s\1]*$', ln):
            flush(); out.append('<hr>'); i += 1; continue
        if ln.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i + 1]):
            flush()
            cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
            head = cells(ln); i += 2; body = []
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                body.append(cells(lines[i])); i += 1
            out.append('<table><thead><tr>' + ''.join(f'<th>{md_inline(c)}</th>' for c in head) + '</tr></thead><tbody>' +
                       ''.join('<tr>' + ''.join(f'<td>{md_inline(c)}</td>' for c in r) + '</tr>' for r in body) + '</tbody></table>')
            continue
        if re.match(r'^\s*([-*+]|\d+[.)])\s+', ln):
            flush(); ordered = bool(re.match(r'^\s*\d', ln)); tag = 'ol' if ordered else 'ul'; li = []
            while i < len(lines) and (re.match(r'^\s*([-*+]|\d+[.)])\s+', lines[i]) or (lines[i].startswith('  ') and lines[i].strip() and li)):
                m2 = re.match(r'^\s*([-*+]|\d+[.)])\s+', lines[i])
                if m2 and bool(re.match(r'^\s*\d', lines[i])) != ordered:
                    break
                if m2:
                    li.append(re.sub(r'^\s*([-*+]|\d+[.)])\s+', '', lines[i]).strip())
                else:
                    li[-1] += ' ' + lines[i].strip()
                i += 1
            out.append(f'<{tag}>' + ''.join(f'<li>{md_inline(x)}</li>' for x in li) + f'</{tag}>'); continue
        if ln.startswith('>'):
            flush(); q = []
            while i < len(lines) and lines[i].startswith('>'):
                q.append(lines[i][1:].strip()); i += 1
            out.append('<blockquote>' + md_inline(' '.join(q)) + '</blockquote>'); continue
        para.append(ln.strip()); i += 1
    flush()
    return '\n'.join(out)


def load_prompts():
    return json.load(open(os.path.join(ANS, 'prompts.json')))['items']


def is_fresh(slug):
    try:
        j = json.load(open(os.path.join(ANS, f'{slug}.json')))
        t = dt.datetime.fromisoformat(j['generated_at'].replace('Z', '+00:00'))
        return (dt.datetime.now(dt.timezone.utc) - t).days < STALE_DAYS
    except Exception:
        return False


def ask_claude(client, persona, question, context):
    import anthropic
    messages = [{'role': 'user', 'content': f'CONTEXT:\n{context}\n\nQUESTION: {question}'}]
    max_tokens = MAX_TOKENS
    use_fallback, use_effort = True, True
    attempt = 0
    while attempt < 4:
        attempt += 1
        extra = {}
        if use_effort:
            extra['output_config'] = {'effort': EFFORT}  # thinking stays adaptive (param omitted); sent raw so older SDKs accept it
        kw = dict(model=MODEL, max_tokens=max_tokens, system=system_prompt(persona), messages=messages)
        if use_fallback:
            extra['fallbacks'] = 'default'  # re-run a policy decline on Anthropic's recommended fallback model
            kw['betas'] = ['server-side-fallback-2026-07-01']
        api = client.beta.messages if use_fallback else client.messages
        try:
            with api.stream(**kw, extra_body=extra) as stream:
                msg = stream.get_final_message()
        except anthropic.BadRequestError as e:  # retry once without an option this API version does not accept
            detail = str(e).lower()
            if use_fallback and re.search(r'fallback|beta', detail):
                use_fallback = False; continue
            if use_effort and re.search(r'output_config|effort', detail):
                use_effort = False; continue
            raise
        if msg.stop_reason == 'refusal':
            raise RuntimeError('declined by safety classifiers (after fallback)')
        # A mid-output fallback keeps the partial text and the fallback model continues it, so join every
        # text block; the 'fallback' block itself is only an audit marker.
        text = ''.join(b.text for b in msg.content if getattr(b, 'type', '') == 'text').strip()
        if msg.stop_reason == 'max_tokens' and max_tokens == MAX_TOKENS:
            max_tokens *= 2  # adaptive thinking shares the budget; give it room once
            continue
        if not text:
            raise RuntimeError(f'empty answer (stop_reason={msg.stop_reason})')
        return text, msg.model, msg.usage
    raise RuntimeError('no answer after retries')


def write_index():
    rows = []
    for p in sorted(glob.glob(os.path.join(ANS, '*.json'))):
        b = os.path.basename(p)
        if b in ('index.json', 'prompts.json'):
            continue
        try:
            j = json.load(open(p))
        except Exception:
            continue
        rows.append({'slug': b[:-5], 'question': j.get('question'), 'persona': j.get('persona'), 'model': j.get('model'),
                     'generated_at': j.get('generated_at'), 'sources': [s['name'] for s in j.get('sources', [])]})
    idx = {'generated_at': now_iso(), 'count': len(rows), 'note': 'Precomputed Claude deep-dives (scripts/generate_answers.py). Fetch data/answers/<slug>.json for the full answer.', 'items': rows}
    json.dump(idx, open(os.path.join(ANS, 'index.json'), 'w'), indent=1, ensure_ascii=False)
    return len(rows)


def main(argv):
    force, dry = '--force' in argv, '--dry-run' in argv
    only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
    limit = int(argv[argv.index('--limit') + 1]) if '--limit' in argv else None
    prompts = [p for p in load_prompts() if not only or p['slug'] in only]
    if not dry and not os.environ.get('ANTHROPIC_API_KEY'):
        print('generate_answers: ANTHROPIC_API_KEY is not set; nothing to do. Add it as a repository secret (or export it locally) to precompute answers.')
        return 0
    client = None
    if not dry:
        try:
            import anthropic
        except ImportError:
            print('generate_answers: the anthropic package is missing. Run: pip install anthropic'); return 1
        client = anthropic.Anthropic(max_retries=4)
    done = failed = skipped = 0
    for p in prompts:
        if limit is not None and done >= limit:
            break
        slug, q, persona = p['slug'], p['question'], p.get('persona', 'portal')
        if not force and not dry and is_fresh(slug):
            skipped += 1; continue
        ds = choose_datasets(q, persona, p.get('datasets'))
        packs = [(d, pack_dataset(d)) for d in ds]
        packs = [(d, b) for d, b in packs if b]
        context = '\n\n'.join(b for _, b in packs)
        if dry:
            print(f'--- {slug} [{persona}] {len(context)} chars: {", ".join(label(d) for d, _ in packs)}'); done += 1; continue
        t0 = time.time()
        try:
            md, model, usage = ask_claude(client, persona, q, context)
        except Exception as e:  # keep going; the previous answer (if any) stays on disk
            failed += 1; print(f'  FAIL {slug}: {str(e)[:300]}'); continue
        sources = []
        for d, _ in packs:
            j = {}
            try: j = json.load(open(path_for(d)))
            except Exception: pass
            m = j.get('meta', {}) if isinstance(j, dict) else {}
            sources.append({'name': label(d), 'dataset': d, 'path': os.path.relpath(path_for(d), ROOT),
                            'as_of': (j.get('fetched_at') if isinstance(j, dict) else None) or m.get('generated')})
        rec = {'question': q, 'persona': persona, 'slug': slug, 'model': model, 'generated_at': now_iso(), 'html': md_to_html(md), 'markdown': md,
               'sources': sources, 'usage': {'input_tokens': getattr(usage, 'input_tokens', None), 'output_tokens': getattr(usage, 'output_tokens', None)}}
        json.dump(rec, open(os.path.join(ANS, f'{slug}.json'), 'w'), indent=1, ensure_ascii=False)
        done += 1
        print(f'  ok   {slug}  {len(md)} chars  {time.time() - t0:.0f}s  ({", ".join(s["name"] for s in sources)})')
    n = write_index() if not dry else 0
    print(f'generate_answers: {done} {"planned (dry run)" if dry else "generated"}, {skipped} fresh (skipped), {failed} failed; index has {n} answers.')
    return 1 if failed and not done else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
