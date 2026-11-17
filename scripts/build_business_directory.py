#!/usr/bin/env python3
"""All-business directory: one record per business in the six SBA loan segments, for the portal and for BSP Desk.

Standard library only. No network calls. The same inputs always give the same output (apart from the build date).

Input
  --candidates  ppp_candidates.json from scripts/build_ppp_screen.py (the business-level view: every deduplicated business
                in all six segments, with its PPP and SBA 7(a)/504 links). Its rows already carry the stable business id (cid).
  --cid-map     cid_map.json from the same run ({business key: cid}); used to check that every id is the stable one.
  --zcta        US Census ZCTA gazetteer (2024_Gaz_zcta_national.txt) for ZIP centroids.
  data/ppp/<segment>_ppp.json, _sba7a.json, _sba504.json   the published loan rows (county, first-draw amount, SBA jobs).
  data/research/ma_ppp_screen.json   the researched SBA screen (ownership, specialties, revenue from research).
  data/research/revenue_benchmarks.json and scripts/estimate_revenue.py   the revenue model (imported, not changed).
  data/ppp/enrichment/web_research.json   website ownership research on 10,000 businesses (rows keyed by business id: the
                                         ownership call, its confidence, the quote it rests on, website, fit score) and a deals
                                         section (a later search of public news for a sale or investment). Optional.

Output
  data/ppp/directory/<segment>.json      columnar JSON (the portal's format; assets/core.js decodes it). A segment over
                                         --split-mb is written as <segment>-<STATE>.json files plus a small <segment>.json
                                         that lists them.
  data/ppp/directory/businesses.sqlite.gz   SQLite with the same records, an FTS5 index on name, dba, city and trade (with
                                         the specialties) and, where the site was read, the website quote (its own column), and
                                         indexes on segment, state, zip, naics, jobs, revenue and distance; gzip-compressed.
                                         Served by the site; server/directory.py downloads it on first use.
  data/ppp/directory/researched.json     columnar JSON of only the businesses in web_research.json, with the columns an
                                         engine table needs (RESEARCHED_COLS).
  data/ppp/directory/index.json          build date, counts, file sizes, sha256 of the gz and field notes.

Field rules
  jobs_ppp            PPP JobsReported (max over the business's PPP loans; borrower-reported, 2020-21).
  jobs_sba            JobsSupported on the latest SBA 7(a)/504 loan (lender-reported), when that row is in the published files.
  jobs_latest         The latest figure on record and its source (the screen's rule: the latest SBA loan's JobsSupported when
                      it came after the last PPP loan, else PPP JobsReported).
  ppp_first_draw_usd  Sum of CurrentApprovalAmount over first-draw loans (ProcessingMethod PPP); second draws apart.
  county              PPP ProjectCountyName (most common over the business's loans), else the SBA ProjectCounty of a loan
                      with the same name and ZIP, else the most common county of every loan in that ZIP (county_basis says which).
  lat, lon            ZCTA centroid of the ZIP (geo_precision 'zip'), else the mean of the ZIP3 ('zip3').
  dist_hub_mi         Straight-line miles to the nearest BSP hub: Punctual Pros (Lancaster PA, Toms River NJ) and CET
                      (Worcester, Taunton, Norwell MA) only, as the screen computed it.
  trade               A plain label for the NAICS code. specialties is the researched list for a business on the SBA screen,
                      else the plain NAICS label only (specialties_basis says so).
  ownership           Researched ownership for a business on the SBA screen; the hand-built list's call when it has one;
                      ("Private (ownership not disclosed)" on a list counts as unknown); else the website research call when
                      the site was read (web_coverage 'covered') and its confidence is 0.5 or more, or the re-check changed it
                      (ownership_basis 'company website, read by AI and re-checked' for a founder or family call the re-check
                      kept, '... and corrected on re-check' for a call it changed, 'company website, read by AI' otherwise);
                      'esop' from the SBA business type; else 'unknown'
                      (basis 'not researched', or for a researched business 'company website read, no clear call' or
                      'company website could not be read').
                      A deal found in public news (deal_status 'sold_or_pe_backed') overrides any of these with 'pe' and names
                      the buyer in ownership_basis.
  website, web_*      From web_research.json: the matched website (Overture Maps Places), whether it was read (web_coverage),
                      the call as a plain label (web_ownership), its probability (web_confidence; empty where the re-check
                      changed the call), the quote on the site it rests on (web_cue: email addresses, review text and
                      people's names removed), the reader's own note when it gave a note rather than a quote (web_note) and
                      whether a second model re-checked it (web_rechecked). founded is the year the site gives. fit_score is
                      the target fit score (0 to 100) used to pick the 10,000.
  name, dba, address  An email address a borrower typed into a loan record is removed; a city that is only digits is left empty.
  specialties         also the website research's specialties when the business is not on the SBA screen and the reader did
                      not find the site to be another kind of business (specialties_basis 'company website, read by AI').
  deal_*              From the deals section of web_research.json (status sold_or_pe_backed, still_independent, unclear or
                      no_deal_found; deal_url is the evidence_url the search cited).
  revenue_*           The SBA screen's figures where the business is on the screen (the same Census model with checked
                      inputs; revenue_basis 'researched model'). Otherwise MODELLED with
                      scripts/estimate_revenue.py (Census SUSB 2022 receipts per employee and payroll shares, CPI-U to 2025,
                      PPP payroll), never reported by the company. Industry codes with no Census benchmark in
                      revenue_benchmarks.json (older 315xxx apparel codes) use the closest benchmarked apparel code, with a
                      note and one step less confidence.

Usage
  python3 scripts/build_business_directory.py --candidates .../ppp_candidates.json --cid-map .../cid_map.json \\
      --zcta .../2024_Gaz_zcta_national.txt [--work /tmp/dir] [--split-mb 25]
"""
import argparse, collections, datetime, gzip, hashlib, json, os, re, shutil, sqlite3, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import estimate_revenue as REV          # noqa: E402  the revenue model (read only)
from build_ppp_screen import split_dba, compact, zip5, load_zcta   # noqa: E402  the screen's own name and ZIP keys

SEGS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
SEG_LABEL = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}
OUT_DIR = os.path.join(ROOT, 'data', 'ppp', 'directory')

TRADE = {
    '237110': 'water and sewer line contractor', '238210': 'electrical contractor', '238220': 'HVAC and plumbing contractor',
    '423450': 'medical and lab supply distributor', '423490': 'lab and scientific supply distributor',
    '424690': 'chemical and lab supply distributor', '424350': 'clothing wholesaler',
    '541512': 'IT services firm (computer systems design)', '541513': 'IT services firm (computer facilities management)',
    '541519': 'IT services firm (other computer services)', '541820': 'public relations firm', '541910': 'market and opinion research firm',
    '315110': 'apparel maker (hosiery and socks)', '315111': 'apparel maker (sheer hosiery)', '315119': 'apparel maker (hosiery and socks)',
    '315120': 'apparel maker (knitting mill)', '315190': 'apparel maker (knitting mill)', '315191': 'apparel maker (knit outerwear)',
    '315192': 'apparel maker (knit underwear and nightwear)', '315210': 'apparel maker (cut and sew contractor)',
    '315211': "apparel maker (men's cut and sew contractor)", '315212': "apparel maker (women's cut and sew contractor)",
    '315220': "apparel maker (men's and boys' clothing)", '315221': "apparel maker (men's underwear and nightwear)",
    '315222': "apparel maker (men's suits and coats)", '315223': "apparel maker (men's shirts)", '315224': "apparel maker (men's trousers)",
    '315225': 'apparel maker (work clothing)', '315228': "apparel maker (men's outerwear)", '315231': "apparel maker (women's lingerie)",
    '315232': "apparel maker (women's blouses and shirts)", '315233': "apparel maker (women's dresses)",
    '315234': "apparel maker (women's suits and coats)", '315239': "apparel maker (women's outerwear)",
    '315240': "apparel maker (women's and children's clothing)", '315250': 'apparel maker (cut and sew)',
    '315280': 'apparel maker (cut and sew)', '315291': "apparel maker (infants' clothing)", '315292': 'apparel maker (fur and leather)',
    '315299': 'apparel maker (cut and sew)', '315990': 'apparel maker (accessories and other apparel)',
    '315991': 'apparel maker (hats and caps)', '315992': 'apparel maker (gloves)', '315993': 'apparel maker (neckwear)',
    '315999': 'apparel maker (accessories and other apparel)',
}
# Codes with no Census benchmark in revenue_benchmarks.json -> the closest benchmarked code (same 5-digit family).
BENCH_PROXY_PREFIX = [('3151', '315190'), ('3152', '315280'), ('3159', '315990')]
SBA_LATEST_RX = re.compile(r'^(7\(a\)|504), (\d{4}-\d{2}-\d{2}), \$([\d,]+(?:\.\d+)?), (.*)$')
STATE_NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut',
    'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana',
    'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
    'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands', 'AS': 'American Samoa', 'MP': 'Northern Mariana Islands',
}

# Column order of a directory record (the SQLite table and the columnar JSON share it).
COLS = [
    'id', 'segment', 'name', 'dba', 'address', 'city', 'county', 'county_basis', 'state', 'zip', 'lat', 'lon', 'geo_precision',
    'naics', 'trade', 'specialties', 'specialties_basis', 'business_type', 'franchise', 'nonprofit', 'person_named',
    'jobs_ppp', 'jobs_sba', 'jobs_latest', 'jobs_latest_source', 'ppp_loans', 'ppp_total_usd', 'ppp_first_draw_usd',
    'ppp_second_draw_usd', 'ppp_first_approved', 'ppp_loan_numbers', 'sba_loans', 'sba_latest_program', 'sba_latest_date',
    'sba_latest_amount_usd', 'sba_latest_status', 'change_of_ownership_date', 'change_of_ownership_recent', 'dist_hub_mi',
    'nearest_hub', 'on_sba_screen', 'screen_rank', 'hand_built_list_id', 'hand_built_list_name', 'pe_list_match', 'ownership',
    'ownership_basis', 'revenue_est_usd', 'revenue_low_usd', 'revenue_high_usd', 'revenue_basis', 'revenue_confidence',
    'revenue_methods', 'revenue_benchmark_naics', 'revenue_note', 'source', 'data_source',
    'website', 'web_coverage', 'web_ownership', 'web_confidence', 'web_cue', 'web_note', 'founded', 'web_rechecked', 'fit_score',
    'deal_status', 'deal_buyer', 'deal_date', 'deal_url',
]
SQL_TYPES = {'lat': 'REAL', 'lon': 'REAL', 'dist_hub_mi': 'REAL', 'ppp_total_usd': 'REAL', 'ppp_first_draw_usd': 'REAL',
             'ppp_second_draw_usd': 'REAL', 'sba_latest_amount_usd': 'REAL', 'web_confidence': 'REAL', 'fit_score': 'REAL'}
INT_COLS = {'jobs_ppp', 'jobs_sba', 'jobs_latest', 'ppp_loans', 'sba_loans', 'screen_rank', 'revenue_est_usd', 'revenue_low_usd',
            'revenue_high_usd', 'nonprofit', 'person_named', 'change_of_ownership_recent', 'on_sba_screen', 'founded', 'web_rechecked',
            'segment_rank'}
# researched.json: only the businesses in web_research.json, with what an engine table shows.
RESEARCHED_COLS = [
    'id', 'segment', 'name', 'dba', 'city', 'state', 'zip', 'trade', 'jobs_latest', 'revenue_est_usd', 'revenue_low_usd',
    'revenue_high_usd', 'dist_hub_mi', 'nearest_hub', 'fit_score', 'segment_rank', 'website', 'web_coverage', 'ownership',
    'ownership_basis', 'web_ownership', 'web_confidence', 'web_cue', 'web_note', 'founded', 'web_rechecked', 'deal_status', 'deal_buyer',
    'deal_date', 'deal_url', 'on_sba_screen',
]
WEB_RESEARCH = os.path.join(ROOT, 'data', 'ppp', 'enrichment', 'web_research.json')
# website research call -> (the ownership column's code, the plain label shown)
WEB_LABEL = {'founder_led': ('founder', 'Founder-run'), 'family_next_generation': ('family', 'Family-owned'),
             'employee_or_partner_owned': ('private_independent', 'Employee- or partner-owned'),
             'pe_backed_or_acquired': ('pe', 'PE-backed or acquired'), 'franchise_unit': ('franchisee', 'Franchise unit'),
             'closed_or_inactive': ('closed', 'Closed or inactive'), 'not_in_segment': ('not_in_segment', 'Outside the segment'),
             'unknown': (None, 'Unknown')}
WEB_MIN_CONFIDENCE = 0.5
# web_cue in the FTS index: on the 2026-11-17 build it adds 1.2% to the gz (25.76 MB without, 26.06 MB with), under the
# 15% allowed, so it is on by default (--fts-cue no leaves it out).
FTS_CUE_DEFAULT = 'yes'
JSON_SKIP = {'revenue_note'}   # long per-row text: in SQLite only (the assistant reads it); the portal shows the figures
# The website quote and deal details are in researched.json (10,000 rows), not in every segment file: as null columns over
# 64,000 rows they push fl.json past --split-mb.
JSON_SKIP |= {'web_cue', 'web_note', 'web_rechecked', 'deal_buyer', 'deal_date', 'deal_url'}

# An email address in a loan record's name or address (some borrowers typed one in), or in a website quote. "NET@WORK INC." and
# "AB@Z SERVICE" are names, not addresses: only a real domain ending (or "Hotmail Com" with a space) counts.
EMAIL_RX = re.compile(r'[\w.%+-]+@[\w-]+(?:\.[\w-]+)*(?:\.(?:com|net|org|edu|gov|us|biz|info|co)\b|\s(?:com|net|org|edu)\b)', re.I)

# ---- the website quote (cue): the reader's own notes, review text and people's names are not the site's words
# A cue that is the reader's note about the site or the record, not a sentence from the site.
CUE_NOTE = re.compile(
    r"^(?:site|website|title|cues?|no (?:site|page|text|content|owner|ownership|business|company|founder|description|statement|"
    r"clear|explicit|direct|stated|named)|only (?:a|the|one|reviews?|title|footer|generic)|home ?page|page (?:is|reads|shows|title|"
    r"text|content)|the (?:site|page|home ?page|record|domain)|this (?:site|page)|record|roll-?up|unresolved|dead|blocked|server|"
    r"connection|robots|https?|dns|bot|redirect|parked|placeholder|error|crawl|covered|domain|customer-relationship)\b"
    r"|\b(?:pre-label|rollup_names|bot_check|redirects? to|crawled)\b|\bsite (?:is|does|describes|shows|says|has|gives|lists|content|"
    r"reads)\b|\brecord (?:does|says|gives|shows|lists)\b", re.I)
# A trailing comment the reader added to a real quote: "; no owner stated.", "(owner-operator, not founder)", "(pre-label kept)".
CUE_TAIL = re.compile(r"\s*(?:;\s*(?:no|only|the site|site|the record|record|roll-?up|title|cues?|pre-label|not)\b[^;]*|"
                      r"\([^()]*\b(?:not|pre-label|site|record|review|quote|label|statement|kept|owner-operator)\b[^()]*\))\s*\.?\s*$", re.I)
# Review text (a customer's words, often naming the owner): never shown as the business's own words.
CUE_REVIEW = re.compile(r"\b(?:customer (?:review|quote|testimonial)|original review|reviewer|I (?:highly |would |strongly )?recommend|"
                        r"highly recommend|five stars?|5 stars?)\b", re.I)
# People named in a quote ("founder David Wall", "owned and operated by Andrew Smith and Peter Jones", "I'm Jane Doe, President")
# become [name]: owners and staff are private people, not part of the public loan records.
_NM = r"(?:[A-Z][a-z]{0,2}'?)?[A-Z][a-z]+(?:-[A-Z][a-z]+)?(?![A-Za-z])"     # Bob, McKeeman, DeRosa, D'Amico, Smith-Jones
_NAME = rf"{_NM}(?:\s+[A-Z]\.)?(?:\s+{_NM}){{1,2}}"
_PAIR = rf"{_NM}\s+(?:and|&)\s+{_NAME}"                      # "Matt and Mark Russo"
_NAMES = rf"(?:{_PAIR}|{_NAME})(?:(?:,\s*|,?\s+and\s+|\s*&\s*)(?:{_PAIR}|{_NAME}))*"
_ROLE = (r"(?i:co-owner|owners?|vice president|president|co-founder|founders?|ceo|principal|proprietor|managing partner|chairman|"
         r"grandfather|father|mother|sons?|daughters?|brothers?|sister|wife|husband|uncle|mr\.?|mrs\.?|ms\.?|dr\.?)")
_BY = (r"(?i:founded|started|established|formed|owned|operated|run|led|purchased|acquired|bought|opened|incorporated|headed|managed)"
       r"(?: in \d{4})?(?: today| now| currently)? by(?: (?i:brothers|partners|founders?|owners?|(?:his|her|their) (?:father|son|wife|brother|husband|daughter)),?)?")
_TITLE = r"(?i:co-)?(?i:owner|president|founder|ceo|principal|proprietor)"
NAME_PATTERNS = [
    re.compile(rf"(?<![\w-]){_ROLE}[,:]?\s+({_NAMES}|{_NM}(?:\s+(?:and|&)\s+{_NM})?(?![\w-]))"),   # role, then the name(s)
    re.compile(rf"\b{_BY}\s+({_NAMES})"),                                                   # founded by X (and Y)
    re.compile(rf"\b(?i:I'm|I am|my name is|meet)\s+({_NAME}|{_NM})"),                        # I'm X
    re.compile(rf"\b({_NAME}|{_NM})(?=,?\s+(?:is|was|became|has been|serves as)\s+(?:the |our |its )?(?:current |new |second-generation |"
               rf"third-generation |founding )?{_TITLE}\b)"),
    re.compile(rf"\b({_NAMES})(?=,\s*(?:the |our |its )?(?:{_TITLE}|(?i:son|daughter|grandson))\b|\s+(?:founded|started|established|"
               r"purchased|bought|sold|took over|stepped in|opened)\b(?! by))"),
    re.compile(rf"\b({_NM})(?=,? the (?i:owner|founder|president)\b)"),
]
# Words that make a capitalised run a business, a title or a sentence, not a person.
NOT_NAME = set('''inc llc corp corporation company co group holdings capital partners electric electrical plumbing heating cooling air
services service systems solutions technologies technology tech industries associates enterprises international mechanical
contractors contracting construction energy management equity fund family brothers sons supply supplies labs laboratories
products medical health healthcare chemical chemicals consulting communications media marketing agency public relations research
network networks data software computers computer it hvac the our we this that since in at as a an and of for with family-owned
founder owner owners president ceo chief executive officer director manager partner principal inventor chemist engineer consultant
master electrician plumber technician comfort sales operations vice chairman today now when after before its their his her my your
us she he they who you one two three new old north south east west american national united first second third global advisors advisory ventures
brands worldwide usa america financial investments insurance bank realty properties studio studios design digital strategies works
business enterprise enterprises small woman women veteran owned certified minority local printing'''.split())


def _is_person(span):
    words = re.findall(r"[A-Za-z][A-Za-z'.-]*", span)
    return bool(words) and not any(w.lower().strip('.').rstrip("'s") in NOT_NAME or w.lower() in NOT_NAME for w in words)


def redact_names(s):
    """People's names in a website quote -> [name]."""
    for rx in NAME_PATTERNS:
        def sub(m):
            span = m.group(1)
            parts = re.split(r'(,\s*|,?\s+and\s+|\s*&\s*)', span)
            if not all(_is_person(p) for p in parts[::2]):
                return m.group(0)
            out = ''.join('[name]' if i % 2 == 0 else p for i, p in enumerate(parts))
            return m.group(0)[:m.start(1) - m.start(0)] + out + m.group(0)[m.end(1) - m.start(0):]
        s = rx.sub(sub, s)
    return s


def plain_note(s):
    """A reader's note in plain words: no internal field names or pre-labels."""
    s = re.sub(r'\s*[;,]?\s*\(?\bpre-label\b[^;)]*\)?', '', s, flags=re.I)
    s = re.sub(r'\brollup_names include\b', 'known roll-ups include', s)
    s = re.sub(r'\(rollup_names\)', '(on a list of known roll-ups)', s)
    s = re.sub(r'\brollup_names\b', 'a list of known roll-ups', s)
    s = re.sub(r'\b(?:rollup|roll-up) hit:?', 'Known roll-up match:', s, flags=re.I)
    s = re.sub(r'\bbot_check\b', 'a bot check', s)
    s = re.sub(r'\b[a-z]+(?:_[a-z]+)+\b', lambda m: m.group().replace('_', ' '), s)
    return re.sub(r'\s{2,}', ' ', s).strip(' ;,')


def split_cue(cue):
    """A website research cue -> (quote from the site or None, the reader's note or None). Email addresses are removed, review
    text is dropped, people's names become [name], and a reader's comment is never shown as the site's words."""
    s = re.sub(r'\s+', ' ', EMAIL_RX.sub('', re.sub(r'[\w.%+-]+@[\w-]+(?:\.[\w-]+)+', '', str(cue or '')))).strip(' ;,')
    if not s:
        return None, None
    if CUE_REVIEW.search(s):
        return None, None
    if CUE_NOTE.search(s):
        return None, redact_names(plain_note(s)) or None
    prev = None
    while prev != s:
        prev, s = s, CUE_TAIL.sub('', s).strip(' ;,')
    s = redact_names(s)
    return (s or None), None


def scrub_email(s):
    """A loan record's name or address with any email address in it removed."""
    if not s or '@' not in s:
        return s
    return re.sub(r'\s{2,}', ' ', EMAIL_RX.sub('', s)).strip(' ,;-')


def title_county(s):
    s = re.sub(r'\s+', ' ', (s or '').strip())
    if not s or s.upper() in ('NONE', 'N/A', 'UNKNOWN'):
        return ''
    s = re.sub(r'\s+COUNTY$', '', s, flags=re.I)
    return ' '.join(w.capitalize() if not re.match(r"^(of|the|and)$", w, re.I) else w.lower() for w in s.split(' ')).replace("'S", "'s")


_SURR = re.compile(r'[\udc80-\udcff]')


def clean(v):
    """A byte the SBA file holds that is not valid UTF-8 (read with surrogateescape) shown as its Latin-1 character (0xBF is ¿),
    as the published loan files show it."""
    return _SURR.sub(lambda m: bytes([ord(m.group()) - 0xDC00]).decode('latin-1'), v) if isinstance(v, str) else v


def num(x):
    try:
        return float(str(x).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def load_sba(ppp_dir):
    """Every published 7(a)/504 row, decoded: [(program, row)]."""
    out = []
    for seg in SEGS:
        for prog in ('sba7a', 'sba504'):
            p = os.path.join(ppp_dir, f'{seg}_{prog}.json')
            if not os.path.exists(p):
                continue
            d = json.load(open(p, encoding='utf-8'))
            cols, en = d['cols'], d['enums']
            for r in d['rows']:
                out.append(('504' if prog == 'sba504' else '7(a)', {c: (en[c][v] if c in en and v is not None else v) for c, v in zip(cols, r)}))
    return out


def bench_for(naics, bench_by):
    """(benchmark NAICS, proxy note or None) for an industry code."""
    if naics in bench_by:
        return naics, None
    for pre, code in BENCH_PROXY_PREFIX:
        if str(naics).startswith(pre) and code in bench_by:
            return code, (f'No Census benchmark for NAICS {naics}; benchmarked on {code} ({bench_by[code]["industry"]}), '
                          f'the closest code with one.')
    return None, None


def write_columnar(path, meta, recs, cols):
    """The portal's columnar JSON (scripts/compact_sales.py; assets/core.js Data.decode)."""
    enums, rows = {}, []
    n = len(recs)
    for c in cols:
        vals = [r.get(c) for r in recs]
        if all(isinstance(v, str) or v is None for v in vals):
            card = len(set(vals))
            if card <= 5000 and card < max(2, n * 0.5):
                enums[c] = sorted(set(v for v in vals if v is not None))
    idx = {c: {v: i for i, v in enumerate(o)} for c, o in enums.items()}
    for r in recs:
        row = []
        for c in cols:
            v = r.get(c)
            if v is not None and c in idx:
                v = idx[c][v]
            elif isinstance(v, float):
                v = round(v, 5)
            row.append(v)
        rows.append(row)
    meta = dict(meta, item_count=len(rows))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'format': 'columnar', 'meta': meta, 'cols': cols, 'enums': enums, 'rows': rows}, f, separators=(',', ':'), ensure_ascii=False)
    return os.path.getsize(path)


def write_sqlite(raw, recs, meta, cols=None, fts_cue=True):
    """The directory database: table businesses (cols, default COLS), FTS5 table biz_fts over name, dba, city and trade (with the
    specialties) and, when fts_cue, the website quote in a web_cue column, indexes for the tool's filters and sorts, and a meta table (JSON values).
    Returns the meta written."""
    cols = cols or COLS
    if os.path.exists(raw):
        os.remove(raw)
    con = sqlite3.connect(raw)
    con.execute('PRAGMA journal_mode=OFF')
    con.execute('PRAGMA synchronous=OFF')
    con.execute('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)')
    defs = ', '.join(f'{c} {SQL_TYPES.get(c, "INTEGER" if c in INT_COLS else "TEXT")}' for c in cols if c != 'id')
    con.execute(f'CREATE TABLE businesses (rid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, {defs})')
    con.executemany(f'INSERT INTO businesses ({", ".join(cols)}) VALUES ({", ".join("?" * len(cols))})',
                    [[x.get(c) for c in cols] for x in sorted(recs, key=lambda x: (x['segment'], x['state'], x['name']))])
    # the website quote has its own column (so a trade filter, "trade : word", never matches quote text), and only where the
    # site was read: a dead or blocked site has no quote. A keyword search with no column filter still finds it.
    cue = fts_cue and 'web_cue' in cols and 'web_coverage' in cols
    con.execute(f"CREATE VIRTUAL TABLE biz_fts USING fts5(name, dba, city, trade{', web_cue' if cue else ''}, content='businesses', "
                "content_rowid='rid', tokenize='unicode61 remove_diacritics 2')")
    con.execute(f"INSERT INTO biz_fts(rowid, name, dba, city, trade{', web_cue' if cue else ''}) SELECT rid, name, dba, city, "
                "trade || ' ' || COALESCE(specialties, '')"
                + (", CASE WHEN web_coverage = 'covered' THEN COALESCE(web_cue, '') ELSE '' END" if cue else '') + ' FROM businesses')
    for c in ('segment', 'state', 'zip', 'naics', 'jobs_latest', 'revenue_est_usd', 'dist_hub_mi', 'county', 'ownership'):
        if c in cols:
            con.execute(f'CREATE INDEX ix_{c} ON businesses({c})')
    con.execute('CREATE INDEX ix_seg_state ON businesses(segment, state)')
    meta = dict(meta, rows=len(recs), rows_by_segment=dict(collections.Counter(x['segment'] for x in recs)),
                rows_by_state=dict(con.execute('SELECT state, COUNT(*) FROM businesses GROUP BY state ORDER BY 2 DESC').fetchall()),
                revenue_coverage=dict(collections.Counter(x.get('revenue_basis') for x in recs)))
    con.executemany('INSERT INTO meta (k, v) VALUES (?, ?)', [(k, json.dumps(v)) for k, v in meta.items()])
    con.commit()
    con.execute("INSERT INTO biz_fts(biz_fts) VALUES('optimize')")
    con.commit()
    con.execute('VACUUM')
    con.close()
    return meta


def gzip_file(raw, gz):
    """gzip -9 with a fixed mtime (same input, same bytes). Returns (raw bytes, gz bytes, sha256 of the gz)."""
    with open(raw, 'rb') as fi, open(gz, 'wb') as fz, gzip.GzipFile(filename='businesses.sqlite', mode='wb', compresslevel=9, fileobj=fz, mtime=0) as fo:
        shutil.copyfileobj(fi, fo, 1 << 20)
    h = hashlib.sha256()
    with open(gz, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return os.path.getsize(raw), os.path.getsize(gz), h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--candidates', required=True)
    ap.add_argument('--cid-map', required=True)
    ap.add_argument('--zcta', required=True)
    ap.add_argument('--ppp-dir', default=os.path.join(ROOT, 'data', 'ppp'))
    ap.add_argument('--screen', default=os.path.join(ROOT, 'data', 'research', 'ma_ppp_screen.json'))
    ap.add_argument('--benchmarks', default=REV.BENCH)
    ap.add_argument('--out-dir', default=OUT_DIR)
    ap.add_argument('--work', default=None, help='where the raw .sqlite is built before gzip (default: next to the output)')
    ap.add_argument('--split-mb', type=float, default=25.0)
    ap.add_argument('--generated', default=None)
    ap.add_argument('--web-research', default=WEB_RESEARCH, help='website ownership research ("" to build without it)')
    ap.add_argument('--fts-cue', choices=('yes', 'no'), default=FTS_CUE_DEFAULT, help='index the website quote for keyword search')
    a = ap.parse_args()
    t0 = time.time()
    generated = a.generated or datetime.date.today().isoformat()
    os.makedirs(a.out_dir, exist_ok=True)

    cand = json.load(open(a.candidates, encoding='utf-8'))
    bcols = cand['businesses']['cols']
    ci = {c: i for i, c in enumerate(bcols)}
    brows = cand['businesses']['rows']
    cid_map = json.load(open(a.cid_map, encoding='utf-8'))
    cid_known = set(cid_map.values())
    shortlist_rank = {s['cid']: s.get('rank') for s in cand.get('shortlist') or []}
    as_of_coo_cut = cand['meta'].get('change_of_ownership_recent_cutoff')
    print(f'candidates: {len(brows):,} businesses; cid map {len(cid_map):,}', flush=True)

    zpts, z3c = load_zcta(a.zcta)
    loans = REV.load_ppp(a.ppp_dir)
    sba = load_sba(a.ppp_dir)
    print(f'loaded: {len(zpts):,} ZCTAs, {len(loans):,} PPP loans, {len(sba):,} SBA 7(a)/504 rows ({time.time() - t0:.0f} s)', flush=True)

    # county: by ZIP (majority over every loan), by SBA name+ZIP key; SBA rows by (date, amount, state) for the latest loan's jobs
    zip_county = collections.defaultdict(collections.Counter)
    for x in loans.values():
        z = zip5(x.get('BorrowerZip'), x.get('ProjectZip'))
        c = title_county(x.get('ProjectCountyName'))
        if z and c:
            zip_county[(z, x.get('ProjectState') or x.get('BorrowerState'))][c] += 1
    sba_by_key = collections.defaultdict(list)
    sba_by_loan = collections.defaultdict(list)
    for prog, x in sba:
        z = zip5(x.get('BorrZip'))
        legal, _ = split_dba(x.get('BorrName') or '')
        sba_by_key[(compact(legal), z)].append((prog, x))
        amt = num(x.get('GrossApproval'))
        sba_by_loan[(prog, (x.get('ApprovalDate') or '')[:10], round(amt or 0), (x.get('BorrState') or '').strip())].append(x)
        c = title_county(x.get('ProjectCounty'))
        if z and c:
            zip_county[(z, (x.get('ProjectState') or x.get('BorrState') or '').strip())][c] += 1

    screen = {x['id']: x for x in json.load(open(a.screen, encoding='utf-8'))['items']}
    bench = json.load(open(a.benchmarks, encoding='utf-8'))
    bmeta = bench['meta']
    bench_by = {x['naics']: x for x in bench['items']}
    stated = {x['id']: x for x in bmeta.get('stated_revenue') or []}
    web = {'meta': {}, 'rows': {}, 'deals': {}}
    if a.web_research and os.path.exists(a.web_research):
        web = json.load(open(a.web_research, encoding='utf-8'))
    web_rows, deals = web.get('rows') or {}, web.get('deals') or {}
    print(f'web research: {len(web_rows):,} businesses, {len(deals):,} deal results', flush=True)

    recs = []
    miss = collections.Counter()
    for r in brows:
        g = lambda c: r[ci[c]]
        cid = g('cid')
        if cid not in cid_known:
            miss['cid_not_in_map'] += 1
        seg, name, dba = g('segment'), scrub_email(g('name') or ''), scrub_email(g('dba') or '')
        if dba.upper() in ('NONE', 'N/A', 'NA'):
            dba = ''
        if not name:   # the whole name was an email address
            name, dba = dba or 'Name withheld', ''
        city = scrub_email(g('city') or '')
        if city.strip().isdigit():   # a ZIP code typed as the city
            city = ''
        state, z, naics = (g('state') or '').strip(), zip5(g('zip')), str(g('naics') or '')
        nums = [str(x) for x in (g('ppp_loan_numbers') or [])]
        lrows = [loans[k] for k in nums if k in loans]
        miss['ppp_loan_not_found'] += len(nums) - len(lrows)
        first = [x for x in lrows if x.get('ProcessingMethod') == 'PPP']
        second = [x for x in lrows if x.get('ProcessingMethod') == 'PPS']
        # geography
        p = zpts.get(z)
        lat, lon, prec = (p[0], p[1], 'zip') if p else ((z3c[z[:3]][0], z3c[z[:3]][1], 'zip3') if z and z[:3] in z3c else (None, None, None))
        if lat is None:
            miss['no_latlon'] += 1
        cc = collections.Counter(title_county(x.get('ProjectCountyName')) for x in lrows if title_county(x.get('ProjectCountyName')))
        county, cbasis = (cc.most_common(1)[0][0], 'ppp') if cc else ('', '')
        legal, _ = split_dba(name)
        skey = sba_by_key.get((compact(legal), z)) or []
        if not county:
            sc = collections.Counter(title_county(x.get('ProjectCounty')) for _, x in skey if title_county(x.get('ProjectCounty')))
            if sc:
                county, cbasis = sc.most_common(1)[0][0], 'sba'
        if not county and z:
            zc = zip_county.get((z, state))
            if zc:
                county, cbasis = zc.most_common(1)[0][0], 'zip'
        if not county:
            miss['no_county'] += 1
        # latest SBA loan
        prog = sdate = sstatus = None
        samt = None
        jobs_sba = None
        m = SBA_LATEST_RX.match(g('sba_latest_loan') or '')
        if m:
            prog, sdate, samt, sstatus = m.group(1), m.group(2), float(m.group(3).replace(',', '')), m.group(4)
            cands = sba_by_loan.get((prog, sdate, round(samt), state)) or []
            if len(cands) > 1:
                cands = [x for x in cands if zip5(x.get('BorrZip')) == z] or cands
            if cands:
                js = num(cands[0].get('JobsSupported'))
                jobs_sba = int(round(js)) if js is not None else None
            else:
                miss['sba_latest_row_not_found'] += 1
        elif g('sba_latest_loan'):
            miss['sba_latest_unparsed'] += 1
        jl_src = g('jobs_latest_source') or ''
        jobs_latest = g('jobs_latest') if jl_src != 'none reported' else None
        if jobs_sba is None and jl_src.startswith('SBA'):
            jobs_sba = jobs_latest
        jobs_ppp = g('jobs_reported') if g('source') != 'sba_only' else None
        # lists
        hb = g('on_existing_list') or ''
        hm = re.match(r'^(\S+) \((.*)\)$', hb)
        hb_id, hb_name = (hm.group(1), hm.group(2)) if hm else ((hb, '') if hb else ('', ''))
        scr = screen.get(cid)
        trade = TRADE.get(naics) or ('apparel maker' if naics.startswith('315') else f'NAICS {naics}')
        rec = {
            'id': cid, 'segment': seg, 'name': name, 'dba': dba, 'address': scrub_email(g('address') or ''), 'city': city, 'county': county,
            'county_basis': cbasis, 'state': state, 'zip': z, 'lat': round(lat, 5) if lat is not None else None,
            'lon': round(lon, 5) if lon is not None else None, 'geo_precision': prec, 'naics': naics, 'trade': trade,
            'business_type': g('business_type') or '', 'franchise': g('franchise_name') or '', 'nonprofit': int(bool(g('nonprofit'))),
            'person_named': int(bool(g('person_named'))), 'jobs_ppp': jobs_ppp, 'jobs_sba': jobs_sba, 'jobs_latest': jobs_latest,
            'jobs_latest_source': jl_src, 'ppp_loans': g('loans') or 0, 'ppp_total_usd': g('loan_total_usd') or None,
            'ppp_first_draw_usd': round(sum(num(x.get('CurrentApprovalAmount')) or 0 for x in first), 2) if first else None,
            'ppp_second_draw_usd': round(sum(num(x.get('CurrentApprovalAmount')) or 0 for x in second), 2) if second else None,
            'ppp_first_approved': g('date_approved') or None, 'ppp_loan_numbers': ','.join(nums) or None,
            'sba_loans': g('sba_loans') or 0, 'sba_latest_program': prog, 'sba_latest_date': sdate, 'sba_latest_amount_usd': samt,
            'sba_latest_status': sstatus, 'change_of_ownership_date': g('change_of_ownership') or None,
            'change_of_ownership_recent': int(bool(g('change_of_ownership_recent'))),
            'dist_hub_mi': g('dist_mi'), 'nearest_hub': g('nearest_hub') or None, 'on_sba_screen': int(scr is not None),
            'screen_rank': shortlist_rank.get(cid), 'hand_built_list_id': hb_id or None, 'hand_built_list_name': hb_name or None,
            'pe_list_match': g('pe_backed_flag') or None, 'source': g('source'),
            'data_source': ('SBA PPP loan data (FOIA, as of 2024-09-30)' if g('source') == 'ppp' else
                            'SBA 7(a)/504 loan data (FOIA, as of 2026-09-30)' if g('source') == 'sba_only' else
                            'SBA PPP and 7(a)/504 loan data (FOIA)'),
        }
        # website research and deals
        w = web_rows.get(cid) or {}
        wl = w.get('label')
        wcode, wplain = WEB_LABEL.get(wl, (None, None))
        # a call the re-check changed has no probability of its own (the model's probabilities belong to the first call)
        changed = bool(w.get('changed_by_recheck'))
        conf = None if changed else w.get('confidence')
        quote, note = split_cue(w.get('cue')) if w.get('coverage') == 'covered' else (None, None)
        note = note or (plain_note(w['reader_note']) if w.get('reader_note') and w.get('coverage') == 'covered' else None)
        rec.update({'website': w.get('website'), 'web_coverage': w.get('coverage') if w else None, 'web_ownership': wplain,
                    'web_confidence': conf, 'web_cue': quote, 'web_note': note, 'founded': w.get('founded'),
                    'web_rechecked': int(bool(w.get('rechecked'))) if w else None, 'fit_score': w.get('fit_score'),
                    'segment_rank': w.get('segment_rank')})
        d = deals.get(cid) or {}
        rec.update({'deal_status': d.get('status'), 'deal_buyer': d.get('buyer'), 'deal_date': d.get('date'),
                    'deal_url': d.get('evidence_url') or d.get('url')})
        web_call = bool(wcode and w.get('coverage') == 'covered' and (changed or (conf or 0) >= WEB_MIN_CONFIDENCE))
        # specialties and ownership (a site the reader found to be another kind of business gives no specialties)
        if scr and scr.get('specialties'):
            rec['specialties'], rec['specialties_basis'] = '; '.join(scr['specialties']), 'researched'
        elif w.get('specialties') and w.get('coverage') == 'covered' and wl != 'not_in_segment':
            rec['specialties'], rec['specialties_basis'] = '; '.join(w['specialties']), 'company website, read by AI'
        else:
            rec['specialties'], rec['specialties_basis'] = trade, 'NAICS trade label only (not researched)'
        own = (g('ownership') or '').strip()
        undisclosed = own.lower().startswith('private (ownership not disclosed')   # a hand-built list that says it does not know
        if undisclosed:
            own = 'unknown'
        esop_type = own == 'esop' and not hb   # set from the SBA business type "Employee Stock Ownership Plan(ESOP)", not from a list
        if scr:
            rec['ownership'], rec['ownership_basis'] = scr.get('ownership') or 'unverified', 'researched (SBA screen)'
        elif own and own not in ('unverified', 'unknown') and not esop_type:
            rec['ownership'], rec['ownership_basis'] = own, 'hand-built list'
        elif web_call:
            kept = w.get('rechecked') and not changed and wl in ('founder_led', 'family_next_generation')
            rec['ownership'] = wcode
            rec['ownership_basis'] = ('company website, read by AI and corrected on re-check' if changed else
                                      'company website, read by AI and re-checked' if kept else 'company website, read by AI')
        elif esop_type:
            rec['ownership'], rec['ownership_basis'] = own, 'SBA loan record (ESOP business type)'
        else:
            rec['ownership'] = 'unknown'
            rec['ownership_basis'] = ('hand-built list, ownership not disclosed' if undisclosed else 'not researched' if not w else
                                      'company website read, no clear call' if w.get('coverage') == 'covered'
                                      else 'company website could not be read')
        if d.get('status') == 'sold_or_pe_backed':
            rec['ownership'] = 'pe'
            rec['ownership_basis'] = ('sold to or backed by ' + (d.get('buyer') or 'a buyer not named') + ' (public news'
                                      + (f", {d['date']}" if d.get('date') else '') + ')')
        # revenue
        if scr and scr.get('revenue_est_usd'):
            rec.update({'revenue_est_usd': scr.get('revenue_est_usd'), 'revenue_low_usd': scr.get('revenue_est_low_usd'),
                        'revenue_high_usd': scr.get('revenue_est_high_usd'),
                        'revenue_basis': 'researched ' + (scr.get('revenue_basis') or 'model'),
                        'revenue_confidence': scr.get('revenue_confidence'), 'revenue_methods': scr.get('revenue_method'),
                        'revenue_benchmark_naics': None, 'revenue_note': scr.get('revenue_note') or ''})
        else:
            bn, pnote = bench_for(naics, bench_by)
            t = {'id': cid, 'segment': seg, 'naics': bn or naics, 'jobs_latest': jobs_latest, 'jobs_source': jl_src, 'company': name}
            s = {'segment': seg, 'naics': bn or naics, 'jobs_latest_source': jl_src, 'full_data_keys': {'ppp_loan_numbers': nums}}
            if bn is None:
                e = {'revenue_est_usd': None, 'basis': 'none', 'confidence': None, 'confidence_note': f'No Census benchmark for NAICS {naics}.'}
            else:
                try:
                    e = REV.estimate_one(t, s, bench_by, bmeta, loans, stated)
                except ZeroDivisionError:
                    # estimate_revenue.py divides by a method that rounds to $0 (a tiny PPP loan or one job): retry without the
                    # PPP loans (headcount method only) and say so. Reported to the owner of that script; not changed here.
                    miss['revenue_zero_method_retry'] += 1
                    e = REV.estimate_one(t, dict(s, full_data_keys={'ppp_loan_numbers': []}), bench_by, bmeta, loans, stated)
                    if e.get('revenue_est_usd'):
                        e['confidence'] = 'low'
                        e['confidence_note'] = ('The payroll method rounds to $0 on this PPP loan, so only the headcount method is used. '
                                                + (e.get('confidence_note') or ''))
            note = e.get('confidence_note') or ''
            conf = e.get('confidence')
            if pnote and e.get('revenue_est_usd'):
                note = (pnote + ' ' + note).strip()
                if conf in REV.LEVELS:
                    conf = REV.LEVELS[max(0, REV.LEVELS.index(conf) - 1)]
            rec.update({'revenue_est_usd': e.get('revenue_est_usd'), 'revenue_low_usd': e.get('revenue_low_usd'),
                        'revenue_high_usd': e.get('revenue_high_usd'),
                        'revenue_basis': e.get('basis') if e.get('revenue_est_usd') else 'none', 'revenue_confidence': conf,
                        'revenue_methods': '+'.join(e.get('midpoint_methods') or e.get('methods_used') or []) or None,
                        'revenue_benchmark_naics': bn if bn != naics else None, 'revenue_note': note})
            if not e.get('revenue_est_usd'):
                miss['no_revenue'] += 1
                rec.update({'revenue_est_usd': None, 'revenue_low_usd': None, 'revenue_high_usd': None, 'revenue_confidence': None})
        for c in INT_COLS:
            if rec.get(c) is not None:
                rec[c] = int(rec[c])
        recs.append({k: clean(v) for k, v in rec.items()})
    print(f'records: {len(recs):,} ({time.time() - t0:.0f} s); gaps: {dict(miss)}', flush=True)

    ids = [x['id'] for x in recs]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    by_seg = collections.Counter(x['segment'] for x in recs)

    # ---- (a) columnar JSON per segment
    jcols = [c for c in COLS if c not in JSON_SKIP]
    files = {}
    meta_common = {
        'generated': generated, 'source': 'SBA PPP (FOIA, as of 2024-09-30) and SBA 7(a)/504 (FOIA, as of 2026-09-30) loan records',
        'script': 'scripts/build_business_directory.py',
        'notes': ['Jobs come from the latest loan record: PPP JobsReported is what the borrower reported in 2020-21; SBA JobsSupported is '
                  'what the lender reported on a 7(a) or 504 loan, approved as far back as 1991 (jobs_latest_source gives the date).',
                  'Revenue is always modelled (est.) from Census benchmarks and the loan data. "researched model" means the SBA screen ran '
                  'the same model with checked inputs; only a revenue_basis that says "stated" is a figure a source reported.',
                  'Ownership is unknown unless ownership_basis gives a source: researched (SBA screen), hand-built list (checked against '
                  'company sites and public sources), company website (read by AI, used when the site was read and the call has a '
                  'probability of 0.5 or more; "re-checked" means a second model tried to refute a founder or family call and kept it, '
                  '"corrected on re-check" that it changed the call, which then has no probability), '
                  'public news of a sale, or SBA loan record (ESOP business type).',
                  'Specialties for a business that was not researched are the plain NAICS trade label only.'],
    }
    if web_rows:
        wm = web.get('meta') or {}
        src = (wm.get('websites') or {}).get('source') or 'Overture Maps Foundation Places'
        meta_common['notes'] += [
            f"Websites ({sum(1 for x in recs if x.get('website')):,} businesses) were matched by name and place to {src}",
            f"Website research ({wm.get('date') or generated}): {len(web_rows):,} businesses had their own sites read. " + ' '.join(wm.get('models') or []),
        ]
    for seg in SEGS:
        srecs = sorted((x for x in recs if x['segment'] == seg), key=lambda x: (x['state'], x['name']))
        meta = dict(meta_common, dataset=f'All businesses in the {SEG_LABEL[seg]} SBA loan segment', segment=seg)
        p = os.path.join(a.out_dir, f'{seg}.json')
        size = write_columnar(p, meta, srecs, jcols)
        for old in [f for f in os.listdir(a.out_dir) if f.startswith(seg + '-') and f.endswith('.json')]:
            os.remove(os.path.join(a.out_dir, old))
        if size > a.split_mb * 1e6:
            parts = []
            for st in sorted({x['state'] for x in srecs}):
                part = [x for x in srecs if x['state'] == st]
                fn = f'{seg}-{st or "XX"}.json'
                sz = write_columnar(os.path.join(a.out_dir, fn), dict(meta, state=st), part, jcols)
                parts.append({'file': fn, 'state': st, 'rows': len(part), 'bytes': sz})
            with open(p, 'w', encoding='utf-8') as f:
                json.dump({'format': 'split', 'meta': dict(meta, item_count=len(srecs)), 'parts': parts}, f, separators=(',', ':'))
            files[seg] = {'rows': len(srecs), 'bytes_unsplit': size, 'split_by_state': parts, 'bytes': os.path.getsize(p)}
        else:
            files[seg] = {'file': f'{seg}.json', 'rows': len(srecs), 'bytes': size}
        print(f'{seg}.json: {len(srecs):,} rows, {size / 1e6:.1f} MB' + (' -> split by state' if seg in files and 'split_by_state' in files[seg] else ''), flush=True)

    # ---- (b) SQLite + FTS5, gzip
    work = a.work or a.out_dir
    os.makedirs(work, exist_ok=True)
    raw = os.path.join(work, 'businesses.sqlite')
    meta_db = {
        'built_at': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(), 'generated': generated,
        'sources': [{'title': 'SBA Paycheck Protection Program loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/ppp-foia', 'publisher': 'U.S. Small Business Administration', 'date': '2024-09-30'},
                    {'title': 'SBA 7(a) and 504 loan data (FOIA)', 'url': 'https://data.sba.gov/dataset/7-a-504-foia', 'publisher': 'U.S. Small Business Administration', 'date': '2026-09-30'},
                    {'title': 'Statistics of U.S. Businesses 2022 (revenue model benchmarks)', 'url': REV.SUSB_PAGE, 'publisher': 'U.S. Census Bureau', 'date': bmeta.get('generated')}],
        'change_of_ownership_recent_cutoff': as_of_coo_cut, 'notes': meta_common['notes'],
    }
    if web_rows:
        wm = web.get('meta') or {}
        meta_db['sources'].append({'title': 'Overture Maps Places (business websites)', 'url': 'https://overturemaps.org/',
                                   'publisher': 'Overture Maps Foundation', 'date': (wm.get('websites') or {}).get('overture_release') or '',
                                   'attribution': (wm.get('websites') or {}).get('source') or ''})
        meta_db['web_research'] = {'date': wm.get('date'), 'rows': len(web_rows), 'deals': len(deals),
                                   'ownership_basis': dict(collections.Counter(x['ownership_basis'] for x in recs if x['id'] in web_rows))}
    meta_db = write_sqlite(raw, recs, meta_db, fts_cue=a.fts_cue == 'yes')
    gz = os.path.join(a.out_dir, 'businesses.sqlite.gz')
    raw_bytes, gz_bytes, sha = gzip_file(raw, gz)
    if a.work is None:
        os.remove(raw)
    print(f'businesses.sqlite: {raw_bytes / 1e6:.1f} MB raw, {gz_bytes / 1e6:.1f} MB gzip', flush=True)

    # ---- (c) researched.json: only the businesses whose websites were read
    researched = None
    rpath = os.path.join(a.out_dir, 'researched.json')
    if web_rows:
        rrecs = sorted((x for x in recs if x['id'] in web_rows),
                       key=lambda x: (SEGS.index(x['segment']), x.get('segment_rank') or 10**9, x['name']))
        rmeta = dict(meta_common, dataset='Businesses whose own websites were read for ownership (website research)',
                     research_date=(web.get('meta') or {}).get('date'))
        rsize = write_columnar(rpath, rmeta, rrecs, RESEARCHED_COLS)
        missing = sorted(set(web_rows) - {x['id'] for x in rrecs})
        researched = {'file': 'researched.json', 'rows': len(rrecs), 'bytes': rsize, 'not_in_directory': len(missing)}
        print(f'researched.json: {len(rrecs):,} rows, {rsize / 1e6:.2f} MB' + (f'; {len(missing)} research ids not in the directory' if missing else ''), flush=True)
    elif os.path.exists(rpath):
        os.remove(rpath)

    index = {'meta': {'dataset': 'All-business directory (SBA loan segments)', 'generated': generated, 'built_at': meta_db['built_at'],
                      'script': 'scripts/build_business_directory.py', 'notes': meta_common['notes'], 'sources': meta_db['sources']},
             'rows': len(recs), 'rows_by_segment': dict(by_seg), 'files': files,
             'sqlite': {'file': 'businesses.sqlite.gz', 'bytes': gz_bytes, 'raw_bytes': raw_bytes, 'sha256': sha,
                        'built_at': meta_db['built_at']},
             'columns': jcols, 'revenue_coverage': meta_db['revenue_coverage'], 'gaps': dict(miss)}
    if researched:
        index['researched'] = dict(researched, columns=RESEARCHED_COLS, ownership_basis=meta_db['web_research']['ownership_basis'],
                                   fts_includes_website_quote=a.fts_cue == 'yes')
    with open(os.path.join(a.out_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=1)
        f.write('\n')
    print(json.dumps({'ownership_basis': dict(collections.Counter(x['ownership_basis'] for x in recs)),
                      'ownership_basis_by_segment': {s: dict(collections.Counter(x['ownership_basis'] for x in recs if x['segment'] == s)) for s in SEGS},
                      'web_ownership_by_segment': {s: dict(collections.Counter(x['web_ownership'] for x in recs if x['segment'] == s and x.get('web_ownership')))
                                                   for s in SEGS}}, indent=1))
    print(json.dumps({'rows_by_segment': dict(by_seg), 'revenue_coverage': meta_db['revenue_coverage'],
                      'county_basis': dict(collections.Counter(x['county_basis'] for x in recs)),
                      'geo_precision': dict(collections.Counter(x['geo_precision'] for x in recs))}, indent=1))
    print(f'done in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
