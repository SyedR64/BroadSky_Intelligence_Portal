#!/usr/bin/env python3
"""Build data/research/ma_ppp_screen.json: the SBA loan add-on screen, one item per shortlisted company.

Inputs
  --candidates  ppp_candidates.json from scripts/build_ppp_screen.py (the business view and the ranked shortlist)
  --enrichment  one or more enrichment files (JSON {items:[...]}, short keys, documented in ENRICH_KEYS below) written by
                the ownership step: Claude agents acting as a typed decision model over public web evidence, then an
                independent re-check of every founder-led or family call. scripts/classify_ownership.py makes the same
                typed decision through a pluggable provider.
  --zcta        Census ZCTA gazetteer (ZIP centroids) for lat/lon
  --ppp-dir     data/ppp (published SBA rows) so each item carries the keys that join it to its loan rows
  --profiles    data/ppp/enrichment/profiles.json: one company profile per item (JSON list, keyed by cid), read from the
                company's own website where one was found: specialties, end markets, service area, a one-line description
                and any headcount the company states, with its source page
  --benchmarks  data/research/revenue_benchmarks.json (scripts/estimate_revenue.py benchmarks): Census SUSB 2022 receipts
                per employee and payroll share by industry and size class, CPI-U and the BLS benefit load
  --stated      optional {items:[{id, revenue_usd, year, source, url}]}: revenue a company states, which overrides the model
Revenue (est.) per item comes from scripts/estimate_revenue.py (estimate_one), run on the item itself: a headcount method
(the headcount the company states for its US business, else the latest loan jobs figure, x Census receipts per employee)
and, for PPP borrowers, a payroll method (PPP loan amount, first draw or else second draw -> payroll -> revenue at the
Census payroll share), in 2025 dollars, with a low-high range, the method used and a confidence. A revenue figure the
company states overrides it. Staff (employees) is the headcount the company states on its own site when the profile has
one, else the latest loan jobs figure, labelled either way. A count of people on a team page is not a stated headcount
(profile stated_employees_kind 'team_page_count'), so the loan figure stays; a stated count that includes staff outside
the US (stated_employees_scope 'worldwide') is shown but the revenue model keeps the loan figure. When a first-draw PPP
jobs figure cannot fit its payroll and the model uses the second draw instead, staff follows the second draw.
Output: data/research/ma_ppp_screen.json ({meta, items}); companies judged out of segment or closed are counted in meta and
left out of items. Standard library only; the same inputs give the same file.

Fit score (0-100), all parts from fields in the item:
  segment fit   0-30  enriched: 30 x (1 - probability the company is out of segment); not enriched: 18 when the name carries
                      a segment signal, else 12
  size          0-20  latest jobs figure inside the segment's ideal band 20, elsewhere in the screen band 12, outside 5
  ownership     0-30  label points: founder-led 30, family (next generation) 27, employee or partner-owned 18, unknown 10,
                      franchise unit 4, sponsor-backed or acquired 0, closed or out of segment 0. A call the re-check fully
                      confirmed (its own deal search ran) scores its label's points; any other checked company scores the
                      probability-weighted average of the label points; an unchecked company scores 10
  proximity     0-10  Punctual Pros and CET only (miles to the nearest hub or site): <=30 mi 10, <=60 7, <=90 4, farther 2
  verification  0-5   re-check confirmed 5; confirmed from the company site only (the re-check's deal search could not run) 3;
                      could not confirm, or corrected on review, 1; not run or record received in part 0
  evidence      0-5   company's own site 2, press or news 2, state or SBA record 1, any other source 1 (cap 5)
  Segments without a proximity part are scaled from 90 to 100 points. A company already sold to a sponsor or roll-up, or
  closed, is capped at 40. Tier 1 needs a fully confirmed call, operating 'yes' and no sale, rebrand or shared
  applicant-tracking warning; any other company is capped at 79 (Tier 2 at most). Tiers use the engine's thresholds:
  Tier 1 >=80, Tier 2 65-79, Tier 3 50-64, Tier 4 <50.
Verdicts (verification.verdict): confirmed, confirmed_site_only (derived when a confirmed re-check says its own deal or sale
searches could not run), unverifiable, corrected (overturned on review), partial (record received in part, re-check
missing), not run, not received.
Hand-built list matches: on_existing_list comes from scripts/build_ppp_screen.py (names and places); this script adds a match
on the website domain. Checked companies that build_ppp_screen.py left off the shortlist because they are already on a
hand-built list (its anchor cap) are kept here from the candidates' on_list, so their checks reach the hand-built record.
"""
import argparse, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estimate_revenue as REV   # the revenue model (Census SUSB benchmarks + SBA loan data); standard library only
SEGS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
SEG_NAME = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}
LABELS = ['founder_led', 'family_next_generation', 'employee_or_partner_owned', 'pe_backed_or_acquired', 'franchise_unit', 'closed_or_inactive', 'not_in_segment', 'unknown']
# typed decision -> the ownership vocabulary of the hand-built target files (ma_targets_pp / _cet)
OWN_MAP = {'founder_led': 'founder', 'family_next_generation': 'family', 'employee_or_partner_owned': 'private_independent', 'pe_backed_or_acquired': 'pe',
           'franchise_unit': 'franchisee', 'closed_or_inactive': 'closed', 'not_in_segment': 'not_in_segment', 'unknown': 'unverified'}
OWN_PTS = {'founder_led': 30, 'family_next_generation': 27, 'employee_or_partner_owned': 18, 'unknown': 10, 'franchise_unit': 4, 'pe_backed_or_acquired': 0, 'closed_or_inactive': 0, 'not_in_segment': 0}
IDEAL = {'pp': (30, 150), 'cet': (40, 200), 'fl': (15, 100), 'ts': (20, 150), 'bpi': (15, 100), 'fh': (15, 100)}
TRADE = {'238220': 'Plumbing, heating and air-conditioning contractor', '238210': 'Electrical contractor', '237110': 'Water and sewer line contractor',
         '541512': 'Computer systems design', '541513': 'Computer facilities management', '541519': 'Other computer services',
         '423490': 'Lab and scientific equipment wholesaler', '423450': 'Medical and lab equipment wholesaler', '424690': 'Chemical products wholesaler',
         '541820': 'Public relations agency', '541910': 'Market and opinion research', '424350': 'Clothing wholesaler'}
ENRICH_KEYS = """cid, web (website), op (operating yes/no/unclear), seg (in segment), segnote, wdec (worker decision), dec (final decision after
re-check), p (8 probabilities in LABELS order), founded, years, staff, rev ([count, rating, source] or null), rsig (review signal),
succ (succession signal), fit (fit note), risks (list), ev ([[claim, url, type]]), ver ([verdict, reason, url] or null), partial"""


SALE_FLAG = re.compile(r'rebrand|possible (sale|recent ownership change)|new owner|outside capital|change of ownership|applicant-tracking account', re.I)
ICIMS = re.compile(r'//careers-[^/]*\.icims\.com', re.I)
NO_DEAL_SEARCH = re.compile(r'search(es)?\b[^.]*\bcould not (be )?run', re.I)


def verdict_of(e):
    """The re-check verdict in the screen's vocabulary (see the docstring)."""
    if not e: return 'not received'
    ver = e.get('ver')
    if not ver: return 'partial' if e.get('partial') else 'not run'
    if ver[0] == 'confirmed' and NO_DEAL_SEARCH.search(ver[1] or ''): return 'confirmed_site_only'
    return ver[0]


def domain(u):
    m = re.match(r'(?:https?://)?(?:www\.)?([^/:?#]+)', (u or '').strip().lower())
    return m.group(1) if m and '.' in m.group(1) else None


def hand_built_domains():
    """{segment: {website domain: (id, company)}} from the hand-built target lists."""
    out = {}
    rd = os.path.join(ROOT, 'data', 'research')
    for fn in ('ma_targets_pp.json', 'ma_targets_cet.json', 'ma_targets_fl_ts.json'):
        p = os.path.join(rd, fn)
        if not os.path.exists(p): continue
        for it in json.load(open(p, encoding='utf-8')).get('items', []):
            seg = 'pp' if fn.endswith('_pp.json') else 'cet' if fn.endswith('_cet.json') else 'fl' if (it.get('platform') == 'frontline' or str(it.get('id', '')).startswith('fl')) else 'ts'
            d = domain(it.get('website'))
            if d: out.setdefault(seg, {})[d] = (it.get('id'), it.get('company'))
    return out


def article(phrase):
    """'a' or 'an' by sound: an HVAC, an electrical, a lab; an all-caps initialism takes 'an' when its first letter is read with a vowel sound."""
    w = (phrase or ' ').split()[0]
    if len(w) > 1 and w.isupper() and w.isalpha():
        return 'an' if w[0] in 'AEFHILMNORSX' else 'a'
    return 'an' if w[0].lower() in 'aeiou' else 'a'


def trade_of(naics):
    if naics in TRADE: return TRADE[naics]
    if str(naics).startswith('315'): return 'Apparel maker'
    return f'NAICS {naics}'


DEC_WORD = {'founder_led': 'founder-led', 'family_next_generation': 'family-owned'}
OWN_WORDS = {'founder_led': 'founder-owned', 'family_next_generation': 'family-owned (next generation)', 'employee_or_partner_owned': 'employee- or partner-owned',
             'franchise_unit': 'franchise'}
HEDGE = {'confirmed': '', 'confirmed_site_only': 'likely ', 'unverifiable': 'likely ', 'not run': 'likely ', 'partial': 'possibly ', 'corrected': 'likely '}
HEDGE_NOTE = {'confirmed_site_only': ' (per its own site; no deal search was run)', 'unverifiable': ' (unconfirmed)', 'not run': ' (unconfirmed)',
              'partial': ' (record received in part; unconfirmed)', 'corrected': ' (unconfirmed)'}
SHORT_TRADE = {'238220': 'HVAC or plumbing contractor', '238210': 'electrical contractor', '237110': 'water, sewer and pump-station contractor',
               '423490': 'lab and scientific supply distributor', '423450': 'lab and medical supply distributor', '424690': 'chemical and lab supply distributor',
               '541820': 'public affairs and PR firm', '541910': 'public-opinion research firm', '424350': 'apparel company'}


SEG_DESC = {'pp': 'residential HVAC, plumbing and electrical', 'cet': 'electrical, solar and water contracting', 'fl': 'managed IT and billing services for law firms',
            'ts': 'lab and scientific supply distribution', 'bpi': 'public affairs and communications', 'fh': 'branded apparel and swim'}


def short_trade(s, seg):
    n = str(s.get('naics') or '')
    return SHORT_TRADE.get(n) or ('apparel company' if n.startswith('315') else 'legal IT services firm (IT for law firms; focus not yet confirmed)' if seg == 'fl' and re.search(r'legal|juris|law', s.get('name') or '', re.I)
                                  else 'IT services firm' if n.startswith('5415') else trade_of(n).lower())


def title_of(s, e, seg, dec, verdict):
    """'Founder-owned HVAC or plumbing contractor 30 mi from Lancaster PA, Punctual Pros add-on acquisition target: NAME'.
    Calls the re-check did not fully confirm read 'Likely ...'; a sold company is listed for reference, not as a target."""
    lead = {'founder_led': 'founder-owned ', 'family_next_generation': 'family-owned ', 'employee_or_partner_owned': 'employee- or partner-owned ', 'franchise_unit': 'franchise '}.get(dec, '') if e else ''
    if lead: lead = HEDGE.get(verdict, 'likely ') + lead
    trade = short_trade(s, seg)
    place = f" {round(s['dist_mi'])} mi from {str(s.get('nearest_hub') or '').replace(' hub', '')}" if seg in ('pp', 'cet') and s.get('dist_mi') is not None else f" in {s.get('city')}, {s.get('state')}"
    if e and dec == 'pe_backed_or_acquired':
        t = f"{trade}{place}, already sold to a sponsor or roll-up (listed for reference, not a {SEG_NAME[seg]} target): {s['name']}"
    else:
        status = '' if lead else ', owner not identified' if e else ', ownership not yet checked'
        t = f"{lead}{trade}{place}{status}, {SEG_NAME[seg]} add-on acquisition target: {s['name']}"
    return t[0].upper() + t[1:]


def summary_of(s, e, seg, dec, verdict, fit, tier):
    """One plain sentence a reader (or the assistant's search) can match: who, what, where, how owned, for which BSP company.
    Ownership is stated as fact only when the re-check fully confirmed it; unchecked companies are not called privately held."""
    trade = short_trade(s, seg)
    head = f"{s.get('name')} in {s.get('city')}, {s.get('state')}"
    dist = f", {round(s['dist_mi'])} miles from {str(s.get('nearest_hub') or '').replace(' hub', '')}" if seg in ('pp', 'cet') and s.get('dist_mi') is not None else ''
    target = f"a possible add-on acquisition target for {SEG_NAME[seg]} found in SBA loan records"
    if not e:
        first = f"{head} is {article(trade)} {trade}{dist} whose ownership has not been checked: {target}."
    elif dec == 'pe_backed_or_acquired':
        first = f"{head} is {article(trade)} {trade}{dist} that was already sold to a sponsor or roll-up; it is listed for reference, not as a {SEG_NAME[seg]} target."
    elif dec in OWN_WORDS:
        own = HEDGE.get(verdict, 'likely ') + OWN_WORDS[dec]
        first = f"{head} is {article(own)} {own} {trade}{dist}{HEDGE_NOTE.get(verdict, '')}: {target}."
    else:
        first = f"{head} is {article(trade)} {trade}{dist} whose owner was not identified: {target}."
    jobs = f" It reported {s['jobs_latest']} jobs ({'PPP, 2020-21' if (s.get('jobs_latest_source') or '').startswith('PPP') else 'latest SBA loan'})." if s.get('jobs_latest') else ''
    return f"{first}{jobs} Fit {fit} of 100 ({tier})."


def amount_band(v):
    if not v: return 'no PPP loan'
    for hi, lab in [(150e3, 'under $150K'), (350e3, '$150K to $350K'), (1e6, '$350K to $1M'), (2e6, '$1M to $2M'), (5e6, '$2M to $5M'), (10e6, '$5M to $10M')]:
        if v < hi: return lab
    return '$10M or more'


def jobs_band(n):
    if n is None: return 'unknown'
    for hi, lab in [(10, 'under 10'), (20, '10 to 19'), (50, '20 to 49'), (100, '50 to 99'), (250, '100 to 249')]:
        if n < hi: return lab
    return '250 or more'


# Profile lists are written in lower case; acronyms and proper names are restored for display, word by word.
CASE = {'hvac': 'HVAC', 'ev': 'EV', 'ppe': 'PPE', 'ups': 'UPS', 'voip': 'VoIP', 'seo': 'SEO', 'it': 'IT', 'esr': 'ESR', 'soc': 'SOC', 'mdr': 'MDR',
        'hipaa': 'HIPAA', 'cmmc': 'CMMC', 'i-9': 'I-9', 'e-verify': 'E-Verify', 'ph': 'pH', 'par': 'PAR', 'ai': 'AI', 'av': 'AV', 'pac': 'PAC',
        'ac': 'AC', 'drosophila': 'Drosophila'}


def tidy_terms(xs):
    out = []
    for x in xs or []:
        s = re.sub(r"[A-Za-z0-9/'-]+", lambda m: CASE.get(m.group(0).lower(), m.group(0)), str(x).strip())
        if s and s not in out: out.append(s)
    return out


def host_path(u):
    """'https://www.comfort-pro.com/our-team/' -> 'comfort-pro.com/our-team'."""
    m = re.match(r'(?:https?://)?(?:www\.)?([^?#\s]+)', (u or '').strip())
    return m.group(1).rstrip('/') if m else u


def plain_jobs(src):
    """The loan record's jobs field in plain words: 'PPP JobsReported (borrower-reported, 2020)' -> 'jobs the borrower reported
    on its PPP loan, 2020'; 'SBA 7(a) JobsSupported on loan approved 2024-12-19 (...)' -> 'jobs its SBA 7(a) loan of 2024-12-19
    supports, as the lender reported them'."""
    src = src or ''
    m = re.match(r'PPP JobsReported \(borrower-reported, ([^)]+)\)', src)
    if m: return f"jobs the borrower reported on its PPP loan, {m.group(1).replace('-', ' and ')}"
    m = re.match(r'SBA (7\(a\)|504) JobsSupported on loan approved (\d{4}-\d{2}-\d{2})', src)
    if m: return f"jobs its SBA {m.group(1)} loan of {m.group(2)} supports, as the lender reported them"
    return src


def staff_of(item, prof):
    """(employees, basis, source, note, url, scope): a headcount the company states on its own site wins; else the latest loan
    jobs figure. A count of people on a team page is not a stated headcount, so the loan figure stays (the count goes in the
    note). scope is 'worldwide' when the stated count includes staff outside the US."""
    loan, lsrc = item.get('jobs_latest'), item.get('jobs_latest_source') or ''
    words = plain_jobs(lsrc)
    loan_txt = (f"SBA loan record: {words}" if lsrc else 'SBA loan record')
    pr = prof or {}
    st, ssrc = pr.get('stated_employees'), pr.get('stated_employees_source') or ''
    if st and not re.match(r'\s*SBA\b', ssrc):
        url = re.match(r'\S+', ssrc).group(0) if ssrc else None
        extra = ssrc[len(url):].strip(' ()') if url else ''
        if pr.get('stated_employees_kind') == 'team_page_count' and loan is not None:
            note = (f"The company's team page ({host_path(url)}) lists {st} people, but the site states no headcount, so staff "
                    f"is the jobs figure on its SBA loan record: {loan} ({words}).")
            return loan, 'loan', loan_txt, note, None, None
        scope = pr.get('stated_employees_scope')
        note = f"Stated on the company's website ({host_path(url)})" + (f": {extra}" if extra else '') + '.'
        if scope == 'worldwide':
            note += ' The count includes staff outside the US.'
        if loan:
            note += f" The SBA loan record had {loan} jobs ({words})."
        return st, 'stated', f"company website ({host_path(url)})", note, url, scope
    return loan, 'loan' if loan is not None else None, loan_txt, None, None, None


TABLE_WORDS = {'detailed': 'detailed size table', 'broad': 'broad size table', 'parent_detailed': 'parent industry, detailed sizes',
               'parent_broad': 'parent industry, broad sizes', 'all_sizes': 'all firm sizes', 'parent_all_sizes': 'parent industry, all firm sizes'}


def money_words(v):
    return REV.money(v) if v is not None else None


def revenue_fields(item, rev):
    """Screen fields from one estimate_revenue result: the figure, its range, the method and plain words with the benchmark table."""
    if not rev or rev.get('revenue_est_usd') is None:
        return {'revenue_est_usd': None, 'revenue_est_low_usd': None, 'revenue_est_high_usd': None, 'revenue_method': None, 'revenue_basis': None,
                'revenue_confidence': None, 'revenue_confidence_note': (rev or {}).get('confidence_note'), 'revenue_source': 'No revenue figure on record.',
                'revenue_note': None, 'revenue_methods': {}}
    m = rev.get('methods') or {}
    if rev['basis'] == 'stated':
        st = rev['stated']
        method, src = 'stated', f"Stated revenue for {st.get('year')}: {st.get('source')}{(' (' + st['url'] + ')') if st.get('url') else ''}."
        note = f"{money_words(rev['revenue_est_usd'])} stated ({st.get('year')})"
    else:
        mids = rev.get('midpoint_methods') or rev.get('methods_used') or []
        method = 'blend' if len(mids) == 2 else mids[0] if mids else None
        naics, ind = item.get('naics'), rev.get('industry') or ''
        parts = []
        if 'headcount' in m:
            h = m['headcount']
            who = {'stated': 'staff the company states', 'second_draw': 'jobs on the second-draw PPP loan'}.get(h.get('jobs_basis'), 'jobs on the loan record')
            parts.append(f"Headcount method {money_words(h['revenue_usd'])}: {h['jobs']} {who} x ${h['receipts_per_employee_2025']:,} "
                         f"receipts per employee (Census, NAICS {rev.get('benchmark_naics') or naics}, {h['size_class']} employees, {TABLE_WORDS.get(h['table'], h['table'])})."
                         + ('' if h.get('in_midpoint', True) else ' It sets only the range.'))
        if 'payroll' in m:
            p = m['payroll']
            parts.append(f"Payroll method {money_words(p['revenue_usd'])}: {p['draw']}-draw PPP loan ${p['loan_usd']:,} x 12 / 2.5 = "
                         f"{money_words(p['ppp_annual_payroll_usd'])} payroll for {p['payroll_year']}, less benefits (/ {p['benefit_load']}), "
                         f"divided by the {round(p['payroll_share'] * 100, 1)}% payroll share (Census, {p['size_class']} employees, "
                         f"{TABLE_WORDS.get(p['table'], p['table'])}), then CPI-U to 2025."
                         + ('' if p.get('in_midpoint', True) else ' It sets only the range.'))
        how = {'blend': 'The estimate is the midpoint of both methods.', 'headcount': 'The estimate is the headcount method.',
               'payroll': 'The estimate is the payroll method.'}.get(method, '')
        src = (f"Modelled (est.), not reported by the company: Census SUSB 2022 benchmarks for {ind} and the company's SBA loan data, "
               f"in 2025 dollars. {' '.join(parts)} {how} Range {money_words(rev['revenue_low_usd'])} to {money_words(rev['revenue_high_usd'])}.").strip()
        words = {'blend': 'headcount and payroll methods', 'headcount': 'headcount method', 'payroll': 'payroll method'}.get(method, 'model')
        note = (f"est. {money_words(rev['revenue_est_usd'])} ({money_words(rev['revenue_low_usd'])} to {money_words(rev['revenue_high_usd'])}); "
                f"{words}; {rev.get('confidence')} confidence")
    keep = ('revenue_usd', 'size_class', 'table', 'jobs', 'jobs_basis', 'receipts_per_employee_2025', 'draw', 'loan_usd', 'loan_jobs', 'payroll_share',
            'payroll_year', 'in_midpoint')
    return {'revenue_est_usd': rev['revenue_est_usd'], 'revenue_est_low_usd': rev.get('revenue_low_usd'), 'revenue_est_high_usd': rev.get('revenue_high_usd'),
            'revenue_method': method, 'revenue_basis': 'stated' if rev['basis'] == 'stated' else 'model', 'revenue_dollars': '2025 dollars' if rev['basis'] != 'stated' else None,
            'revenue_confidence': rev.get('confidence'), 'revenue_confidence_note': rev.get('confidence_note'), 'revenue_source': src, 'revenue_note': note,
            'revenue_methods': {k: {kk: v[kk] for kk in keep if kk in v} for k, v in m.items()}}


def load_zcta(path):
    out = {}
    with open(path, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            p = line.split('\t')
            if len(p) >= 7:
                try: out[p[0].strip()] = (round(float(p[5]), 4), round(float(p[6]), 4))
                except ValueError: pass
    return out


def decode(j):
    cols, en = j['cols'], j['enums']
    return [{c: (en[c][v] if c in en else v) for c, v in zip(cols, r)} for r in j['rows']]


def sba_row_keys(ppp_dir, seg, prog):
    """{(ApprovalDate, rounded GrossApproval, state): [row index]} for the published 7(a) or 504 file of a segment."""
    p = os.path.join(ppp_dir, f'{seg}_{prog}.json')
    if not os.path.exists(p): return {}
    out = {}
    for i, r in enumerate(decode(json.load(open(p, encoding='utf-8')))):
        try: amt = round(float(r.get('GrossApproval') or 0))
        except ValueError: continue
        out.setdefault((r.get('ApprovalDate'), amt, (r.get('BorrState') or '').upper()), []).append(i)
    return out


def score(s, e, seg, flags=None):
    """(fit_score, fit_breakdown, tier) by the documented formula."""
    dec = (e or {}).get('dec') or 'unknown'
    if e:
        pnis = (e.get('p') or [0] * 8)[6] or 0
        segfit = round(30 * (1 - pnis))
    else:
        segfit = 18 if re.search(r'Name (points|signals)|Home-service name|brand angle|Coastal lifestyle|fits Horton|energy or utility', s.get('rank_reason') or '') else 12
    jl = s.get('jobs_latest') or 0
    lo, hi = IDEAL[seg]
    blo, bhi = {'pp': (15, 200), 'cet': (20, 300), 'fl': (10, 200), 'ts': (10, 250), 'bpi': (10, 150), 'fh': (10, 150)}[seg]
    size = 20 if lo <= jl <= hi else 12 if blo <= jl <= bhi else 5
    verdict = verdict_of(e)
    if verdict == 'confirmed':
        own = OWN_PTS.get(dec, 10)
    elif e and e.get('p'):   # not confirmed: the probability-weighted average of the label points
        own = round(sum(pr * OWN_PTS.get(lab, 10) for lab, pr in zip(LABELS, e['p'])), 1)
    else:
        own = 10
    parts = {'segment_fit': segfit, 'size': size, 'ownership': own}
    if seg in ('pp', 'cet'):
        d = s.get('dist_mi')
        parts['proximity'] = 2 if d is None else 10 if d <= 30 else 7 if d <= 60 else 4 if d <= 90 else 2
    parts['verification'] = {'confirmed': 5, 'confirmed_site_only': 3, 'unverifiable': 1, 'corrected': 1}.get(verdict, 0)
    types = {t for _, _, t in ((e or {}).get('ev') or [])}
    ev = (2 if 'company_site' in types else 0) + (2 if types & {'press', 'news'} else 0) + (1 if 'state_record' in types else 0) + (1 if types & {'other', 'review_snippet'} else 0)
    parts['evidence'] = min(5, ev)
    raw = sum(parts.values())
    total = raw if seg in ('pp', 'cet') else raw * 100 / 90
    cap = None
    if dec in ('pe_backed_or_acquired', 'closed_or_inactive'):
        total = min(total, 40)
    total = int(round(total + 1e-9))
    if total >= 80:   # Tier 1 needs a fully confirmed call on an operating company with no sale or rebrand warning
        why = [] if verdict == 'confirmed' else [{'confirmed_site_only': 'confirmed from the company site only (no deal search)', 'unverifiable': 'the re-check could not confirm the owner',
                                                 'partial': 'record received in part', 'not run': 'no re-check', 'corrected': 'corrected on review'}.get(verdict, 'not confirmed')]
        if (e or {}).get('op') != 'yes': why.append('operating status unclear')
        if flags and any(SALE_FLAG.search(f) for f in flags): why.append('a sale, rebrand or shared applicant-tracking warning')
        if why:
            cap = f"Capped at 79 (Tier 2 at most) from {total}: " + '; '.join(why) + '.'
            total = 79
    tier = 'Tier 1' if total >= 80 else 'Tier 2' if total >= 65 else 'Tier 3' if total >= 50 else 'Tier 4'
    return total, parts, tier, cap


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--candidates', required=True)
    ap.add_argument('--enrichment', nargs='+', default=[])
    ap.add_argument('--zcta', required=True)
    ap.add_argument('--ppp-dir', default=os.path.join(ROOT, 'data', 'ppp'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'research', 'ma_ppp_screen.json'))
    ap.add_argument('--generated', default=None, help='date for meta.generated (default: the candidates file date)')
    ap.add_argument('--profiles', default=os.path.join(ROOT, 'data', 'ppp', 'enrichment', 'profiles.json'))
    ap.add_argument('--benchmarks', default=REV.BENCH)
    ap.add_argument('--stated', default=None, help='optional {items:[{id, revenue_usd, year, source, url}]}: revenue a company states')
    a = ap.parse_args()
    cand = json.load(open(a.candidates, encoding='utf-8'))
    cm, segs, shortlist = cand['meta'], cand['segments'], cand['shortlist']
    enr = {}
    prof_path = os.path.abspath(a.profiles) if a.profiles else None
    enrich_files = [f for f in a.enrichment if os.path.abspath(f) != prof_path]   # the profiles list is read on its own
    for f in enrich_files:
        for e in json.load(open(f, encoding='utf-8')).get('items', []):
            enr[e['cid']] = e
    profiles = {p['cid']: p for p in json.load(open(a.profiles, encoding='utf-8'))} if a.profiles and os.path.exists(a.profiles) else {}
    bench = json.load(open(a.benchmarks, encoding='utf-8'))
    bench_by = {x['naics']: x for x in bench['items']}
    loans = REV.load_ppp(a.ppp_dir)
    stated_rev = {x['id']: x for x in bench['meta'].get('stated_revenue') or []}
    if a.stated:
        for x in json.load(open(a.stated, encoding='utf-8')).get('items', []): stated_rev[x['id']] = x
    zc = load_zcta(a.zcta)
    sba_keys = {(seg, prog): sba_row_keys(a.ppp_dir, seg, prog) for seg in SEGS for prog in ('sba7a', 'sba504')}
    gen = a.generated or cm.get('generated') or datetime.date.today().isoformat()
    sba_asof = cm['sources']['sba_7a_504'].get('as_of')
    fys = [int(y) for f in cm['sources']['sba_7a_504'].get('files') or [] for y in re.findall(r'FY(\d{4})', f)]
    sba_from = f"FY{min(fys)}" if fys else 'FY2010'   # earliest fiscal year in the 7(a)/504 files read
    items, out_of_segment = [], []
    cov = {seg: {'shortlisted': 0, 'enriched': 0, 'enrichment_partial': 0, 'in_segment': 0, 'founder_or_family': 0, 'confirmed_by_recheck': 0,
                 'confirmed_site_only': 0, 'tier_1': 0, 'tier_1_capped': 0, 'screened_out': 0, 'sponsor_backed_or_acquired': 0, 'ownership_unverified': 0,
                 'kept_from_hand_built_match': 0} for seg in SEGS}
    # checked companies that build_ppp_screen.py left off the shortlist because they matched a hand-built list (anchor cap)
    in_sl = {s['cid'] for s in shortlist}
    kept = [dict(r, kept_checked=True) for r in cand.get('on_list') or [] if r['cid'] in enr and r['cid'] not in in_sl]
    hb_dom = hand_built_domains()
    for s in shortlist + kept:
        seg = s['segment']; e = enr.get(s['cid']); c = cov[seg]
        if s.get('kept_checked'): c['kept_from_hand_built_match'] += 1
        else: c['shortlisted'] += 1
        if e:
            c['enriched' if not e.get('partial') else 'enrichment_partial'] += 1
        dec = e['dec'] if e else 'unknown'
        if dec in ('not_in_segment', 'closed_or_inactive'):
            c['screened_out'] += 1
            out_of_segment.append({'id': s['cid'], 'company': s['name'], 'segment': seg, 'decision': dec, 'reason': (e or {}).get('segnote') or (e or {}).get('fit') or ''})
            continue
        c['in_segment'] += 1
        flags = list((e or {}).get('risks') or [])
        if s.get('change_of_ownership_recent'):
            flags.append(f"SBA loan financed a change of ownership on {s['change_of_ownership']}; the business may have a new owner")
        if s.get('person_named'):
            flags.append('Borrower is named for a person (sole proprietor or self-employed)')
        if e and dec != 'pe_backed_or_acquired' and any(ICIMS.search(u or '') for _, u, _ in e.get('ev') or []):
            flags.append("Careers portal runs on a shared iCIMS applicant-tracking account; check whose account it is (a roll-up's account means the company was sold)")
        fit, parts, tier, cap = score(s, e, seg, flags)
        verdict = verdict_of(e)
        if dec in ('founder_led', 'family_next_generation'): c['founder_or_family'] += 1
        if dec == 'pe_backed_or_acquired': c['sponsor_backed_or_acquired'] += 1
        if dec == 'unknown': c['ownership_unverified'] += 1
        ver = (e or {}).get('ver')
        if dec in ('founder_led', 'family_next_generation') and verdict in ('confirmed', 'confirmed_site_only'): c['confirmed_by_recheck' if verdict == 'confirmed' else 'confirmed_site_only'] += 1
        if tier == 'Tier 1': c['tier_1'] += 1
        if cap: c['tier_1_capped'] += 1
        ll = zc.get(str(s.get('zip') or '')[:5])
        m = re.match(r'([a-z]+-t?\d+)', s.get('on_existing_list') or '')
        list_id, list_name = (m.group(1), s.get('on_existing_list')) if m else (None, None)
        dm = domain((e or {}).get('web'))
        if not list_id and dm and dm in hb_dom.get(seg, {}):   # same website as a hand-built target
            list_id, nm = hb_dom[seg][dm]
            list_name = f"{list_id} ({nm}; same website)"
        # keys into the published loan rows (data/ppp): PPP by LoanNumber, 7(a)/504 by row position in the segment file
        rows = {'ppp_loan_numbers': list(s.get('ppp_loan_numbers') or []), 'sba7a_rows': [], 'sba504_rows': []}
        for d in s.get('sba_detail') or []:
            prog = 'sba7a' if d.get('program') == '7(a)' else 'sba504'
            for i in sba_keys[(seg, prog)].get((d.get('date'), round(float(d.get('amount') or 0)), (s.get('state') or '').upper()), []):
                if i not in rows[f'{prog}_rows']: rows[f'{prog}_rows'].append(i)
        prob = dict(zip(LABELS, (e or {}).get('p') or [])) if e else None
        rev = (e or {}).get('rev') or [None, None, None]
        enrichment = 'not received' if not e else 'partial' if e.get('partial') else 'complete'
        item = {
            'id': s['cid'], 'segment': seg, 'company': s['name'],
            'title': title_of(s, e, seg, dec, verdict),
            'summary': summary_of(s, e, seg, dec, verdict, fit, tier), 'dba': s.get('dba') or None, 'website': (e or {}).get('web') or None,
            'hq_address': s.get('address') or None, 'hq_city': s.get('city'), 'state': s.get('state'), 'zip': s.get('zip'),
            'lat': ll[0] if ll else None, 'lon': ll[1] if ll else None, 'geo_precision': 'zip' if ll else None,
            'distance_mi': s.get('dist_mi'), 'nearest_hub': s.get('nearest_hub') or None,
            'naics': s.get('naics'), 'trade': trade_of(s.get('naics')), 'trade_plain': short_trade(s, seg), 'business_type': s.get('business_type') or None,
            'franchise_name': s.get('franchise_name') or None,
            'jobs_reported_ppp': s.get('jobs_reported') or None, 'jobs_reported_ppp_years': '2020-2021' if s.get('jobs_reported') else None,
            'jobs_latest': s.get('jobs_latest'), 'jobs_latest_source': s.get('jobs_latest_source'), 'jobs_band': jobs_band(s.get('jobs_latest')),
            'employees': s.get('jobs_latest'), 'employees_source': 'SBA loan record (PPP jobs reported 2020-2021, or 7(a)/504 jobs supported when a later SBA loan exists)',
            'ppp_amount_usd': s.get('loan_total_usd') or 0, 'ppp_amount_band': amount_band(s.get('loan_total_usd')), 'ppp_loans': s.get('loans') or 0,
            'ppp_first_approved': s.get('date_approved') or None, 'ppp_lender': s.get('ppp_lender') or None,
            'sba_loans': s.get('sba_loans') or 0, 'sba_latest_loan': s.get('sba_latest_loan') or None, 'sba_latest_jobs_supported': s.get('sba_latest_jobs_supported'),
            'sba_change_of_ownership': s.get('change_of_ownership') or None, 'sba_change_of_ownership_recent': bool(s.get('change_of_ownership_recent')),
            'sba_loan_history': [{k: d.get(k) for k in ('program', 'date', 'amount', 'status', 'jobs_supported', 'business_age', 'lender')} for d in (s.get('sba_detail') or [])],
            'ownership': OWN_MAP.get(dec, 'unverified'), 'ownership_decision': dec if e else None, 'ownership_decision_worker': (e or {}).get('wdec'),
            'ownership_probabilities': prob,
            'ownership_evidence': [{'claim': cl, 'url': u, 'type': t} for cl, u, t in ((e or {}).get('ev') or [])],
            'verification': {'verdict': verdict, 'reason': ver[1], 'url': ver[2]} if ver else {'verdict': verdict, 'reason': 'Record received in part: the evidence was cut off and the re-check is missing.' if verdict == 'partial' else None, 'url': None},
            'founded_year': (e or {}).get('founded'), 'years_in_business_note': (e or {}).get('years') or None, 'employees_now_note': (e or {}).get('staff') or None,
            'succession_signal': (e or {}).get('succ') or None, 'review_signal': (e or {}).get('rsig') or None,
            'review_count': rev[0], 'review_rating': rev[1], 'review_source': rev[2],
            'operating': (e or {}).get('op') or 'unverified', 'in_segment': (e or {}).get('seg') if e else None, 'segment_note': (e or {}).get('segnote') or None,
            'strategic_rationale': (e or {}).get('fit') or s.get('rank_reason'), 'rank_reason': s.get('rank_reason'), 'screen_rank': s.get('rank'),
            'fit_score': fit, 'fit_breakdown': parts, 'tier': tier, 'fit_cap': cap,
            'on_existing_list': list_id, 'on_existing_list_name': list_name,
            'kept_from_hand_built_match': bool(s.get('kept_checked')),
            'pe_backed_flag': s.get('pe_backed_flag') or None,
            'risk_flags': flags, 'enrichment': enrichment,
            'sources': list(dict.fromkeys([u for _, u, _ in ((e or {}).get('ev') or [])] + ([ver[2]] if ver and ver[2] else []))),
            'full_data_keys': rows, 'retrieved': gen,
        }
        # company profile (own website where one was found) and staff: a stated headcount wins over the loan jobs figure
        pr = profiles.get(s['cid'])
        emp, basis, esrc, enote, eurl, escope = staff_of(item, pr)
        item.update({'employees': emp, 'employees_basis': basis, 'employees_source': esrc, 'employees_note': enote, 'employees_source_url': eurl,
                     'employees_scope': escope,
                     'specialties': tidy_terms((pr or {}).get('specialties')), 'end_markets': tidy_terms((pr or {}).get('end_markets')),
                     'service_area': (pr or {}).get('service_area') or None, 'one_line': (pr or {}).get('one_line') or None,
                     'profile_pages_read': list((pr or {}).get('pages_read') or []), 'profile_scale_note': (pr or {}).get('stated_trucks_or_techs') or None,
                     'profile': 'received' if pr else 'not received'})
        # revenue (est.): the revenue model run on this item (stated staff or loan jobs, PPP loans, Census benchmarks)
        rev = REV.estimate_one(item, item, bench_by, bench['meta'], loans, stated_rev)
        hc = (rev.get('methods') or {}).get('headcount') or {}
        if hc.get('jobs_basis') == 'second_draw' and item['employees_basis'] == 'loan':
            # the first draw's jobs figure does not fit its payroll; staff follows the second draw the model used
            item.update({'employees': hc['jobs'], 'employees_source': 'SBA loan record: jobs the borrower reported on its second-draw PPP loan, 2021',
                         'employees_note': (f"The PPP loans reported {item['jobs_latest']} jobs, but the first draw's payroll is far too small "
                                            f"for that many staff. The second-draw loan's {hc['jobs']} jobs fit its payroll, so staff uses them (2021).")})
        item.update(revenue_fields(item, rev))
        items.append(item)
    items.sort(key=lambda t: (SEGS.index(t['segment']), -t['fit_score'], t['screen_rank'] or 999, t['company']))
    coverage = {}
    for seg in SEGS:
        k = segs[seg]['counts']
        coverage[seg] = {'label': segs[seg]['label'], 'naics': segs[seg]['naics'], 'geography': segs[seg]['geography'], 'jobs_band': segs[seg]['jobs_band'],
                         'ppp_rows_matched': k.get('ppp_rows_matched'), 'sba_7a_rows_matched': k.get('sba_7a_rows_matched'), 'sba_504_rows_matched': k.get('sba_504_rows_matched'),
                         'businesses': k.get('businesses_after_exclusions'), 'in_jobs_band': k.get('in_jobs_band_latest'), 'change_of_ownership_flagged': k.get('change_of_ownership_flagged'),
                         'on_existing_list_matched': k.get('on_existing_list_matched'), 'excluded_bsp_companies': [x['name'] for x in segs[seg].get('excluded') or []],
                         **cov[seg], 'in_items': sum(1 for t in items if t['segment'] == seg)}
    received = sorted({seg for seg in SEGS if cov[seg]['enriched'] or cov[seg]['enrichment_partial']})
    highlights = []   # plain sentences naming the best targets per company, so a reader or the assistant's search finds them
    for seg in SEGS:
        rows = [t for t in items if t['segment'] == seg]
        ff = [t for t in rows if t['ownership_decision'] in ('founder_led', 'family_next_generation')]
        if ff:
            near = sorted(ff, key=lambda t: -t['fit_score'])[:8]
            highlights.append(f"{SEG_NAME[seg]} ({SEG_DESC[seg]}): founder- or family-owned add-on targets from SBA loan records, best fit first: " + '; '.join(
                f"{t['company']} ({t['hq_city']}, {t['state']}{', ' + str(round(t['distance_mi'])) + ' mi from ' + str(t['nearest_hub'] or '').replace(' hub', '') if t.get('distance_mi') is not None and seg in ('pp', 'cet') else ''}; {DEC_WORD[t['ownership_decision']]}{', confirmed by a second check' if t['verification']['verdict'] == 'confirmed' else ', confirmed from its own site only' if t['verification']['verdict'] == 'confirmed_site_only' else ', unconfirmed'})" for t in near) + '.')
        elif rows:
            top = rows[:8]
            highlights.append(f"{SEG_NAME[seg]} ({SEG_DESC[seg]}): add-on candidates from SBA loan records, ownership not yet checked, best fit first: " + '; '.join(f"{t['company']} ({t['hq_city']}, {t['state']}; {t['trade_plain']})" for t in top) + '.')
    # revenue model summary: range width, staff basis, and the check against the hand-built lists' vendor figures
    hand_rev = {}
    for fn in ('ma_targets_pp.json', 'ma_targets_cet.json', 'ma_targets_fl_ts.json'):
        p = os.path.join(ROOT, 'data', 'research', fn)
        if os.path.exists(p):
            for h in json.load(open(p, encoding='utf-8')).get('items', []): hand_rev[h.get('id')] = h.get('revenue_est_usd')
    widths = sorted(t['revenue_est_high_usd'] / t['revenue_est_low_usd'] for t in items if t.get('revenue_est_low_usd') and t.get('revenue_est_high_usd'))
    cal = sorted(t['revenue_est_usd'] / hand_rev[t['on_existing_list']] for t in items
                 if t.get('on_existing_list') and t.get('revenue_est_usd') and (hand_rev.get(t['on_existing_list']) or 0) > 0)
    med = lambda xs: None if not xs else (xs[len(xs) // 2] if len(xs) % 2 else (xs[len(xs) // 2 - 1] + xs[len(xs) // 2]) / 2)
    rv = {'width': round(med(widths), 1) if widths else None, 'cal_n': len(cal), 'cal_ratio': round(med(cal), 1) if cal else None,
          'stated_staff': sum(1 for t in items if t.get('employees_basis') == 'stated'),
          'stated_rev': sum(1 for t in items if t.get('revenue_basis') == 'stated')}
    by_seg = {}
    for seg in SEGS:
        v = sorted(t['revenue_est_usd'] for t in items if t['segment'] == seg and t.get('revenue_est_usd'))
        conf = {}
        for t in items:
            if t['segment'] == seg: conf[t.get('revenue_confidence') or 'none'] = conf.get(t.get('revenue_confidence') or 'none', 0) + 1
        by_seg[seg] = {'with_estimate': len(v), 'median_usd': REV.rnd(med(v), 10000) if v else None, 'confidence': conf}
    revenue_model = {
        'what': 'Revenue (est.) for every loan-screen company, from scripts/estimate_revenue.py run on the item.',
        'dollars': '2025 dollars (CPI-U); a stated figure is as stated',
        'methods': {'headcount': 'Staff the company states for its US business, else the latest loan jobs figure, x Census receipts per employee for the industry and size class.',
                    'payroll': 'PPP loan (first draw, else second draw) x 12 / 2.5 = payroll, less benefits (BLS), / the Census payroll share for the industry and size class, then CPI-U to 2025.',
                    'blend': 'Midpoint of the two methods.', 'stated': f"Revenue the company states; overrides the model. Companies with one: {rv['stated_rev']}."},
        'range': ('Lowest method x (1 - s) to highest x (1 + s); s is the gap to neighbouring Census size classes, 10% to 40%. It covers the two '
                  'methods and the spread between Census size classes, not how far one company can sit from its class average.'),
        'confidence': ('High: the two methods agree within 25%. Medium: within 60%, or one method alone. Low: further apart, a thin Census cell, '
                       'or a data warning. The portal shows a loan-screen estimate at medium confidence at most, since it is modelled.'),
        'checks': ('PPP payroll per reported job above $100K plus benefits: the payroll method sets only the range. Below $20K: the jobs figure '
                   'or the loan is wrong, so a consistent second draw replaces the first, or else the headcount method sets only the range.'),
        'benchmarks': os.path.relpath(os.path.abspath(a.benchmarks), ROOT), 'benchmarks_generated': bench['meta'].get('generated'),
        'range_width_median': rv['width'], 'staff_stated_on_website': rv['stated_staff'],
        'vs_hand_built': {'companies': rv['cal_n'], 'median_ratio': rv['cal_ratio'], 'note': 'Model estimate / the hand-built list\'s vendor-modelled figure, same company.'},
        'by_segment': by_seg,
    }
    meta = {
        'dataset': 'SBA loan add-on screen: PPP, 7(a) and 504 borrowers matched to the six BSP companies',
        'title': 'SBA loan screen',
        'generated': gen,
        'method': (
            f'We read every loan in the SBA Paycheck Protection Program release and every SBA 7(a) and 504 file from {sba_from} to date, and kept the borrowers whose '
            'industry code and location match a BSP company: residential HVAC, plumbing and electrical near Lancaster PA and Toms River NJ for '
            'Punctual Pros; New England electrical and water and sewer contractors for CET; computer services firms for Frontline; lab, scientific '
            'and chemical supply wholesalers for Thomas Scientific; public relations and opinion research firms for BPI; apparel makers and clothing '
            'wholesalers for Fair Harbor. First and second PPP draws and name variants were merged into one business, and each business was linked '
            'to its 7(a) and 504 loans by name and ZIP code or name and city. BSP companies and their add-ons were removed. Companies already on a '
            'hand-built target list stay in and are marked. A ranked shortlist per company was built from the loan records: the jobs figure, distance '
            'to the hub, the industry words in the name and any recent SBA loan; a company known only from loans made before FY2010 is kept in '
            'the records but not shortlisted. '
            'Ownership was then classified by Claude agents acting as a typed decision model: each agent read public web evidence (the company\'s own '
            'website, state business records, press releases and news, and search-engine result snippets) and returned one of eight labels '
            '(founder-led, family next generation, employee or partner-owned, sponsor-backed or acquired, franchise unit, closed, out of segment, '
            'unknown) with a probability for each and the evidence behind it. Every founder-led or family call was then sent to a second agent '
            'for an independent re-check for a sale, a parent company or an investor; one record arrived in part, without its re-check, and is '
            'marked so. Where the second agent\'s own deal searches could not run, the call is marked as confirmed from the company site only and '
            'scores lower, and a later review overturned one call. Review counts and ratings come only from search-engine '
            'snippets and companies\' own websites; no review site was scraped, and no reviewer names are kept. Jev, TypeSafe AI\'s decision API, '
            'was not used because no account was available; scripts/classify_ownership.py makes the same decision through either provider. '
            f'PPP jobs are what borrowers reported in 2020 and 2021. The 7(a) and 504 data run from {sba_from} to {sba_asof}, and each company shows its latest '
            'SBA loan, the jobs that loan supports, and whether the loan financed a change of ownership. The fit score adds six parts shown in '
            'fit_formula; tiers use the engine\'s thresholds, and Tier 1 needs a fully confirmed call. '
            'Each company then got a short profile from its own website where one was found: what it does (specialties), who it serves, '
            'where it works and any headcount it states. Staff is that stated headcount with its source page, or else the latest jobs figure '
            'on its SBA loans, labelled either way. '
            + ('No company states its revenue, so revenue' if not rv['stated_rev'] else f"{rv['stated_rev']} companies state their revenue, which is used as stated. Other revenue")
            + ' is modelled (est.) in 2025 dollars from US Census '
            'Statistics of U.S. Businesses 2022 benchmarks and the company\'s SBA loan data: the stated US headcount or else the loan jobs '
            'figure times Census receipts per employee for its industry and size, and, for PPP borrowers, the PPP loan turned back into payroll and divided by the '
            'Census payroll share. The estimate is the midpoint of the two, with a low-high range and a confidence; see revenue_model.'),
        'fit_formula': {
            'segment_fit': '0-30. Checked companies: 30 x (1 - the probability it is out of segment). Unchecked: 18 when the name carries a segment signal, else 12.',
            'size': '0-20. Latest jobs figure inside the ideal band: 20; elsewhere inside the screen band: 12; outside: 5.',
            'ownership': '0-30. Label points: founder-led 30, family next generation 27, employee or partner-owned 18, unknown 10, franchise unit 4, sponsor-backed or acquired 0, closed or out of segment 0. A call the re-check fully confirmed (its own deal search ran) scores its label points; any other checked company scores the probability-weighted average of the label points; an unchecked company scores 10.',
            'proximity': '0-10, Punctual Pros and CET only. Straight-line miles from the ZIP centroid to the nearest hub or site: 30 or less 10, 60 or less 7, 90 or less 4, farther 2.',
            'verification': '0-5. Independent re-check confirmed 5; confirmed from the company site only, with no deal search, 3; re-check could not confirm, or the call was corrected on review, 1; not run or record received in part 0.',
            'evidence': "0-5. Company's own site 2, press or news 2, state or SBA record 1, any other source 1.",
            'scaling': 'Segments with no proximity part are scaled from 90 to 100 points.',
            'cap': 'A company already sold to a sponsor or roll-up, or closed, is capped at 40. Tier 1 needs a fully confirmed call, an operating company and no sale, rebrand or shared applicant-tracking warning; any other company is capped at 79.',
            'ideal_jobs_band': {seg: list(IDEAL[seg]) for seg in SEGS},
            'tiers': 'Tier 1 80 or more; Tier 2 65 to 79; Tier 3 50 to 64; Tier 4 below 50.',
        },
        'ownership_vocabulary': {'founder_led': 'founder', 'family_next_generation': 'family', 'employee_or_partner_owned': 'private_independent',
                                 'pe_backed_or_acquired': 'pe', 'franchise_unit': 'franchisee', 'unknown': 'unverified'},
        'sources': [
            {'name': 'SBA Paycheck Protection Program loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/ppp-foia', 'as_of': '2024-09-30', 'retrieved': gen,
             'note': 'Latest batch on the portal when the screen ran; loans approved April 2020 to May 2021.'},
            {'name': 'SBA 7(a) and 504 loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/7-a-504-foia', 'as_of': sba_asof, 'retrieved': gen},
            {'name': 'US Census ZCTA gazetteer (ZIP centroids)', 'url': 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html', 'as_of': '2024', 'retrieved': gen},
            {'name': 'Company websites, state business records, press releases, news and search-engine snippets', 'url': None, 'retrieved': gen, 'note': 'Cited for each company with its ownership evidence.'},
            *[{'name': f"{x['name']} ({x.get('publisher', '')})".replace(' ()', ''), 'url': x.get('url'), 'as_of': str(x.get('data_year')) if x.get('data_year') else None,
               'retrieved': x.get('retrieved'), 'note': 'Used for the revenue model benchmarks.'}
              for x in bench['meta'].get('sources') or [] if 'Census' in (x.get('publisher') or '') or 'Labor Statistics' in (x.get('publisher') or '')],
        ],
        'caveats': [
            'PPP jobs are what the borrower reported in 2020 or 2021, not a current headcount. Where a later 7(a) or 504 loan exists, its jobs figure is used instead; the lender reports it and SBA does not check it.',
            "Reading 'Change of Ownership' in the SBA business-age field as a loan that financed a purchase is our interpretation; the SBA dictionary does not define it further.",
            'Ownership comes from public web evidence only. A founder-led or family label means no sale, parent or investor was found, not that the owner has confirmed it. Most re-checks that backed a founder or family call could not run their own deal searches; those calls are marked as confirmed from the company site only, score lower and cannot reach Tier 1.',
            f'7(a) and 504 loans go back to {sba_from}. A company known only from loans made before FY2010, with no PPP loan, stays in the loan records but is not shortlisted, since nothing on record shows it still operates.',
            'Review counts and ratings are as shown in search-engine snippets or on the company\'s own site; they were not checked on the review sites.',
            'Ownership checks cover the shortlist for all six companies, with a second, skeptical pass on every founder or family call.',
            'PPP is a weak source for Fair Harbor: apparel makers in the loan data are mostly contract sewers, uniform makers and small boutiques, so few branded swim or apparel companies appear.',
            'Distances are straight lines from the ZIP centroid, not drive times.',
            f'Revenue for loan-screen companies is modelled from Census benchmarks and SBA loan data, not reported. Each figure carries a low-high '
            f'range (the high end is a median {rv["width"]} times the low end) and a confidence. The range covers the two methods and the spread between '
            f'Census size classes; no model price is shown when its high end is more than 4 times the low end. Census figures are national averages for an industry '
            f'and size, and a company can sit well above or below them. On the {rv["cal_n"]} companies that are also on a hand-built list, the model '
            f'reads a median {rv["cal_ratio"]} times the vendor figures those lists use, mostly because the vendor assumes lower revenue per employee. '
            f'So loan-screen and hand-built revenue are shown and summarised apart.',
            f'Staff for loan-screen companies is the headcount the company states on its website where it gives one ({rv["stated_staff"]} companies), '
            f'else the jobs figure on its latest SBA loan, which may be several years old. The revenue model uses the stated headcount when it covers '
            f'the US business only, else the loan figure.',
        ],
        'highlights': highlights,
        'enrichment_status': {'received_for': received, 'note': 'Ownership results cover every shortlist. Companies added to a shortlist after the check ran are listed as not received; rerun this script with a new enrichment file to fold them in.'},
        'coverage': coverage,
        'screened_out': out_of_segment,
        'full_data': {'index': 'data/ppp/index.json', 'note': 'Every SBA column and row that matches each segment, unfiltered, as published loan files; items carry full_data_keys to find their own rows.'},
        'revenue_model': revenue_model,
        'build_inputs': {'candidates': os.path.basename(a.candidates), 'enrichment': sorted(os.path.relpath(os.path.abspath(f), ROOT) for f in enrich_files),
                         'profiles': os.path.relpath(os.path.abspath(a.profiles), ROOT) if a.profiles else None, 'zcta': os.path.basename(a.zcta),
                         'benchmarks': os.path.relpath(os.path.abspath(a.benchmarks), ROOT), 'stated': os.path.basename(a.stated) if a.stated else None,
                         'note': 'candidates and zcta are working files kept outside the repo (scripts/build_ppp_screen.py output and the Census ZCTA gazetteer).'},
        'item_count': len(items),
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump({'meta': meta, 'items': items}, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'{os.path.relpath(a.out, ROOT)}: {len(items)} items, {len(out_of_segment)} screened out')
    for seg in SEGS:
        c = coverage[seg]
        print(f"  {seg:4} shortlisted {c['shortlisted']:3}  enriched {c['enriched']:3}(+{c['enrichment_partial']} part)  in items {c['in_items']:3}  founder/family {c['founder_or_family']:3}  confirmed {c['confirmed_by_recheck']:3}  T1 {c['tier_1']:3}")


if __name__ == '__main__':
    main()
