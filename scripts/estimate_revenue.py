#!/usr/bin/env python3
"""Revenue estimates (est.) for small private companies found in SBA loan records, from official Census and BLS data.

Two steps, standard library only, no network calls. The same inputs always give the same output.

  benchmarks  Reads the Census Statistics of U.S. Businesses (SUSB) 2022 tables and two BLS API responses (CPI-U and the
              Employer Costs for Employee Compensation shares) and writes data/research/revenue_benchmarks.json.
  estimate    Reads that file, the profile tasks (or the screen), the screen and the published PPP rows, and writes one revenue
              estimate per company, a calibration table against the hand-built lists and the spread of estimates per segment.

Benchmarks (one item per NAICS code the screen uses)
  Source: SUSB 2022, U.S. totals by 6-digit NAICS and enterprise employment size. The detailed-size table
  (us_state_naics_detailedsizes_2022.txt: 5-9, 10-14, 15-19, 20-24, 25-29, 30-34, 35-39, 40-49, 50-74, 75-99, 100-149,
  150-199, 200-299, 300-399, 400-499 employees) and the broad-size table (us_state_6digitnaics_2022.txt: 5-9, 10-19, 20-99,
  100-499). Receipts and annual payroll are in $1,000; employment is the March 12 count. SUSB 2022 is coded on the 2017
  NAICS, so 2022 code 424350 (clothing wholesalers) is the sum of 2017 codes 424320 and 424330.
  For each size class: receipts per employee = receipts / employment; payroll share = annual payroll / receipts.
  2025 dollars: receipts per employee x CPI-U 2025 annual average / CPI-U 2022 annual average (BLS series CUUR0000SA0).

Method, per company
  (a) Headcount method: jobs figure x receipts per employee (2025 dollars) for the NAICS and the size class of that jobs
      figure. The jobs figure is the headcount the company states on its own website for its US business (employees_basis
      'stated' with no employees_scope 'worldwide'), else the latest loan figure: the PPP JobsReported (2020-21) or the jobs
      a later SBA 7(a) loan supports. A stated count that includes staff outside the US is not used; when it differs from
      the loan figure by more than 1.5 times, that is a warning.
  (b) Payroll method, PPP borrowers only. A PPP loan (first or second draw) was 2.5 x average monthly payroll, with pay above
      $100,000 per employee per year left out. So annual PPP payroll = loan amount x 12 / 2.5. First draws (ProcessingMethod
      PPP) are used; with none on file, second draws (PPS). CurrentApprovalAmount, read from data/ppp/<segment>_ppp.json via
      the screen's full_data_keys. PPP payroll counts
      employer health insurance, retirement and state unemployment tax, which Census payroll leaves out; we divide by a
      benefit load from the BLS Employer Costs for Employee Compensation, 2019 average (construction for NAICS 23, all
      private industry otherwise). Revenue = Census-basis payroll / payroll share for the NAICS and size class of the PPP
      jobs figure, then CPI-U from the payroll year (the year before the loan was approved) to 2025.
      Low check: PPP payroll below $20,000 per reported job cannot pay real staff, so the jobs figure or the loan is wrong.
      When a second draw exists whose own payroll per job is plausible ($20,000 to $100,000 x the benefit load), the second
      draw replaces the first for both methods (its jobs figure for the headcount method when that rested on the PPP jobs).
      Otherwise the payroll method (the loan amount comes from payroll records) sets the estimate and the headcount method
      only the range, and confidence drops a step.
  (c) Estimate = midpoint of the methods available. Range = lowest method x (1 - s) to highest method x (1 + s), where s is
      the size-class spread: the largest gap, in receipts per employee or payroll share, between the size class used and
      its reliable neighbour classes in the same table, never below 10% (class averages hide firm-level variation) and
      never above 40%. The range covers the two methods and the gap between neighbouring Census size classes, not how far
      one company can sit from its class average. Confidence: two methods within 25% of each other are high; within 60%
      medium; further apart low.
      One method alone is medium, or low when the benchmark had to fall back to a broader table. Each warning lowers
      confidence one step: a jobs figure from an SBA loan approved before 2018, PPP payroll per reported job above
      $100,000 x the benefit load or below $20,000, or a stated worldwide headcount far from the loan figure. PPP counts cash
      pay only up to $100,000 a head, with benefits on top, so payroll per job
      above that line means heavy benefits (union benefit funds) or a low jobs count. The Census payroll share then does
      not fit, so that payroll result sets the range but is left out of the midpoint.
  Benchmark swaps: two Thomas Scientific lab-supply distributors are filed under NAICS 424690 (chemical wholesalers, about
  2.5 times the lab-supply receipts per employee); they are benchmarked on 423490 like the other lab distributors.
  A revenue figure the company itself states, or a cited article reports, overrides the model and is labelled as stated.
  Third-party modelled figures (data vendors, directories) never override it.

Size class choice: a cell is reliable with at least 25 firms and no high-noise flag (J) on employment, payroll or receipts.
The detailed class is used when it is reliable and holds at least 100 firms; receipts are skewed, and in thin wholesale
cells a few large distributors swing receipts per employee by 2x between neighbouring classes. Otherwise the broad class
from the 6-digit table is used (reliable test), then the 4-digit parent industry (detailed, then broad), then all
sizes together (the industry, then its parent). For a broad
class the spread compares it with the reliable detailed classes inside it.

Usage
  python3 scripts/estimate_revenue.py benchmarks --detailed us_state_naics_detailedsizes_2022.txt \\
      --six us_state_6digitnaics_2022.txt --cpi bls_cpi_u.json --ecec bls_ecec_2019.json --tasks profile_tasks.json
  python3 scripts/estimate_revenue.py estimate --tasks profile_tasks.json --out revenue.json
"""
import argparse, csv, datetime, glob, json, math, os, statistics, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BENCH = os.path.join(ROOT, 'data', 'research', 'revenue_benchmarks.json')
SEGS = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh']
SEG_NAME = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor'}

SUSB_PAGE = 'https://www.census.gov/data/tables/2022/econ/susb/2022-susb-annual.html'
SUSB_DETAILED_URL = 'https://www2.census.gov/programs-surveys/susb/tables/2022/us_state_naics_detailedsizes_2022.txt'
SUSB_SIX_URL = 'https://www2.census.gov/programs-surveys/susb/tables/2022/us_state_6digitnaics_2022.txt'
BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
CPI_SERIES = 'CUUR0000SA0'
PPP_SOURCE = 'https://data.sba.gov/dataset/ppp-foia'

# SUSB 2022 uses the 2017 NAICS; a 2022 code that does not exist there is the sum of its 2017 codes.
NAICS_2017 = {'424350': ['424320', '424330']}
DETAILED = ['<5', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-49', '50-74', '75-99',
            '100-149', '150-199', '200-299', '300-399', '400-499']
BROAD = ['<5', '5-9', '10-19', '20-99', '100-499', '500+']
MIN_FIRMS = 25
MIN_FIRMS_DETAILED = 100
INSIDE_BROAD = {'5-9': ['5-9'], '10-19': ['10-14', '15-19'], '20-99': ['20-24', '25-29', '30-34', '35-39', '40-49', '50-74', '75-99'],
                '100-499': ['100-149', '150-199', '200-299', '300-399', '400-499']}
SPREAD_FLOOR, SPREAD_CAP = 0.10, 0.40
PPP_MULTIPLE = 2.5            # first draw = 2.5 x average monthly payroll
PPP_CAP = 100000              # annual pay per employee counted
CAP_PER_JOB_LOAN = PPP_MULTIPLE * PPP_CAP / 12   # largest first draw per employee: $20,833
CAP_NEAR = 85000              # PPP payroll per job at or above this: the cap may bind
OLD_JOBS_YEAR = 2018          # a jobs figure from a loan approved before this year is old
LOW_PER_JOB = 20000           # PPP payroll per reported job below this cannot be real staff: the jobs figure or the loan is wrong
# Benchmark swaps by segment: (segment, filed NAICS) -> (NAICS benchmarked, note shown with the estimate)
BENCH_OVERRIDE = {('ts', '424690'): ('423490', 'Filed under NAICS 424690 (chemical wholesalers), whose receipts per employee run '
                                     'about 2.5 times the lab-supply rate, so it is benchmarked on 423490 like the other lab '
                                     'distributors.')}


# ---------- helpers ----------

def size_label(s):
    """'04:10-14' / '07: 20-24' -> '10-14' / '20-24'."""
    return s.split(':', 1)[1].strip().replace(',', '')


def cls_detailed(n):
    if n is None or n <= 0: return None
    bounds = [(4, '<5'), (9, '5-9'), (14, '10-14'), (19, '15-19'), (24, '20-24'), (29, '25-29'), (34, '30-34'), (39, '35-39'),
              (49, '40-49'), (74, '50-74'), (99, '75-99'), (149, '100-149'), (199, '150-199'), (299, '200-299'), (399, '300-399'),
              (499, '400-499')]
    for hi, lab in bounds:
        if n <= hi: return lab
    return None


def cls_broad(n):
    if n is None or n <= 0: return None
    for hi, lab in [(4, '<5'), (9, '5-9'), (19, '10-19'), (99, '20-99'), (499, '100-499')]:
        if n <= hi: return lab
    return '500+'


def num(x):
    try: return float(x)
    except (TypeError, ValueError): return None


def rnd(x, step=1000):
    return None if x is None else int(round(x / step) * step)


def money(x):
    if x is None: return None
    if x >= 1e9: return f'${x / 1e9:.1f}B'
    if x >= 1e6: return f'${x / 1e6:.1f}M'
    return f'${x / 1e3:.0f}K'


# ---------- step 1: benchmarks ----------

def read_susb(path, codes):
    """{naics: {size label: row}} for U.S. rows of the wanted codes."""
    out = {}
    with open(path, encoding='latin-1', newline='') as f:
        for r in csv.DictReader(f):
            if r['STATE'] != '00' or r['NAICS'] not in codes: continue
            out.setdefault(r['NAICS'], {})[size_label(r['ENTRSIZEDSCR'])] = r
    return out


def cell(rows, label, cpi_factor):
    """One size class (rows: list of SUSB rows to add up, for combined codes)."""
    if not rows or any(r is None for r in rows): return None
    firms = sum(int(r['FIRM']) for r in rows)
    emp = sum(int(r['EMPL']) for r in rows)
    pay = sum(int(r['PAYR']) for r in rows)
    rcpt = sum(int(r['RCPT']) for r in rows)
    flags = ''.join(sorted(set(r[k] for r in rows for k in ('EMPLFL_N', 'PAYRFL_N', 'RCPTFL_N'))))
    if emp <= 0 or rcpt <= 0: return None
    rpe = rcpt * 1000 / emp
    return {'size_class': label, 'firms': firms, 'employees': emp, 'payroll_k': pay, 'receipts_k': rcpt,
            'receipts_per_employee_2022': round(rpe), 'receipts_per_employee_2025': round(rpe * cpi_factor),
            'payroll_share': round(pay / rcpt, 4), 'noise_flags': flags,
            'reliable': firms >= MIN_FIRMS and 'J' not in flags}


def table(data, codes, labels, cpi_factor):
    out = []
    for lab in labels:
        rows = [data.get(c, {}).get(lab) for c in codes]
        c = cell(rows, lab, cpi_factor)
        if c: out.append(c)
    return out


def cpi_annual(path):
    d = json.load(open(path))
    s = d['Results']['series'][0]
    assert s['seriesID'] == CPI_SERIES, s['seriesID']
    return {int(x['year']): float(x['value']) for x in s['data'] if x['period'] == 'M13'}


def ecec_load(path):
    """Benefit load = (Census-basis payroll + PPP extras) / Census-basis payroll, from ECEC percent-of-compensation series.
    Census payroll ~ wages and salaries (02) + paid leave (04) + supplemental pay (09). PPP payroll also counts health
    insurance (15), retirement and savings (18) and state unemployment insurance (26)."""
    d = json.load(open(path))
    vals = {}
    for s in d['Results']['series']:
        v = [float(x['value']) for x in s['data']]
        vals[s['seriesID']] = (sum(v) / len(v), sorted({x['year'] for x in s['data']}), len(v))
    out = {}
    for key, ind, name in [('construction', '230000', 'Construction'), ('private', '000000', 'All private industry')]:
        g = lambda est: vals[f'CMU2{est}{ind}0000P'][0]
        base = g('02') + g('04') + g('09')
        extra = g('15') + g('18') + g('26')
        out[key] = {'industry': name, 'benefit_load': round((base + extra) / base, 4),
                    'census_basis_pct_of_compensation': round(base, 2), 'ppp_extra_pct_of_compensation': round(extra, 2),
                    'parts_pct': {'wages_and_salaries': round(g('02'), 2), 'paid_leave': round(g('04'), 2),
                                  'supplemental_pay': round(g('09'), 2), 'health_insurance': round(g('15'), 2),
                                  'retirement_and_savings': round(g('18'), 2), 'state_unemployment_insurance': round(g('26'), 2)},
                    'series': [f'CMU2{e}{ind}0000P' for e in ('02', '04', '09', '15', '18', '26')],
                    'period': f"{vals[f'CMU202{ind}0000P'][1][0]} average of {vals[f'CMU202{ind}0000P'][2]} quarters"}
    return out


def build_benchmarks(a):
    tasks = json.load(open(a.tasks))
    codes = sorted({t['naics'] for t in tasks if t.get('naics')})
    susb_codes = {c: NAICS_2017.get(c, [c]) for c in codes}
    parents = {c: c[:4] for c in codes}
    want = {x for v in susb_codes.values() for x in v} | set(parents.values())
    det = read_susb(a.detailed, want)
    six = read_susb(a.six, want)
    cpi = cpi_annual(a.cpi)
    f22 = cpi[2025] / cpi[2022]
    loads = ecec_load(a.ecec)
    items = []
    for c in codes:
        sc = susb_codes[c]
        label = (det.get(sc[0]) or {}).get('Total', {}).get('NAICSDSCR')
        if len(sc) > 1: label = 'Clothing and clothing accessories merchant wholesalers (2017 codes ' + ' + '.join(sc) + ')'
        tot = cell([det.get(x, {}).get('Total') for x in sc], 'all sizes', f22)
        p = parents[c]
        it = {
            'id': c, 'naics': c, 'industry': label, 'susb_naics_2017': sc, 'parent_naics': p,
            'parent_industry': (det.get(p) or {}).get('Total', {}).get('NAICSDSCR'),
            'all_sizes': tot,
            'detailed': table(det, sc, DETAILED, f22),
            'broad': table(six, sc, BROAD, f22),
            'parent_detailed': table(det, [p], DETAILED, f22),
            'parent_broad': table(six, [p], BROAD, f22),
            'parent_all_sizes': cell([det.get(p, {}).get('Total')], 'all sizes', f22),
            'benefit_load_key': 'construction' if c.startswith('23') else 'private',
        }
        band = [x for x in it['detailed'] if x['reliable'] and x['size_class'] in DETAILED[1:14]]
        if band:
            r = [x['receipts_per_employee_2025'] for x in band]
            s = [x['payroll_share'] for x in band]
            it['band_5_to_299'] = {'reliable_classes': len(band), 'receipts_per_employee_2025_min': min(r),
                                   'receipts_per_employee_2025_max': max(r), 'payroll_share_min': min(s), 'payroll_share_max': max(s)}
        items.append(it)
    meta = {
        'dataset': 'revenue_benchmarks',
        'title': 'Revenue benchmarks by industry and company size',
        'generated': a.generated or datetime.date.today().isoformat(),
        'summary': ('Receipts per employee and payroll as a share of receipts, by industry code and company size, from the '
                    'Census Bureau. They turn an SBA loan record into a revenue estimate (est.) for a private company that '
                    'publishes no revenue.'),
        'method': __doc__.split('Usage')[0].strip(),
        'sources': [
            {'name': 'Statistics of U.S. Businesses (SUSB), U.S. and states, 6-digit NAICS, detailed enterprise employment sizes',
             'publisher': 'U.S. Census Bureau', 'data_year': 2022, 'file': 'us_state_naics_detailedsizes_2022.txt',
             'url': SUSB_DETAILED_URL, 'page': SUSB_PAGE, 'retrieved': a.retrieved},
            {'name': 'Statistics of U.S. Businesses (SUSB), U.S. and states, 6-digit NAICS, broad enterprise employment sizes',
             'publisher': 'U.S. Census Bureau', 'data_year': 2022, 'file': 'us_state_6digitnaics_2022.txt',
             'url': SUSB_SIX_URL, 'page': SUSB_PAGE, 'retrieved': a.retrieved},
            {'name': 'Consumer Price Index for All Urban Consumers (CPI-U), U.S. city average, all items, annual averages',
             'publisher': 'U.S. Bureau of Labor Statistics', 'series': CPI_SERIES, 'url': BLS_API, 'retrieved': a.retrieved},
            {'name': 'Employer Costs for Employee Compensation (ECEC), private industry, percent of total compensation',
             'publisher': 'U.S. Bureau of Labor Statistics', 'url': BLS_API, 'retrieved': a.retrieved},
            {'name': 'SBA Paycheck Protection Program loan data (FOIA release)', 'publisher': 'U.S. Small Business Administration',
             'url': PPP_SOURCE},
        ],
        'units': ('receipts_k and payroll_k are $1,000 (2022 dollars, as published). receipts_per_employee_2022 is in 2022 '
                  'dollars; receipts_per_employee_2025 is in 2025 dollars. payroll_share is annual payroll / receipts.'),
        'size_classes': ('SUSB enterprise size: employees of the whole company on March 12, 2022, across all its locations. '
                         'detailed comes from the detailed-size table, broad from the 6-digit table. parent_* rows are the '
                         '4-digit industry, used only when the 6-digit cells are too thin.'),
        'reliability_rule': (f'A class is reliable with at least {MIN_FIRMS} firms and no J (high noise, 5% or more) flag on employment, '
                             f'payroll or receipts. Census flags: G under 2% noise, H 2 to 5%, J 5% or more. Estimates use a detailed class '
                             f'only when it is reliable and holds at least {MIN_FIRMS_DETAILED} firms, else the broad class.'),
        'inflation': {
            'index': 'CPI-U, U.S. city average, all items (BLS ' + CPI_SERIES + '), annual averages',
            'annual_average': {str(y): cpi[y] for y in sorted(cpi)},
            'factor_2022_to_2025': round(f22, 4),
            'factor_to_2025': {str(y): round(cpi[2025] / cpi[y], 4) for y in sorted(cpi)},
            'note': ('BLS published no October 2025 CPI because of the 2025 lapse in appropriations; the 2025 annual average '
                     'above is the figure BLS published (M13).'),
        },
        'ppp_payroll': {
            'rule': 'A PPP loan (first or second draw) = 2.5 x average monthly payroll; annual pay above $100,000 per employee left out. Annual PPP payroll = loan amount x 12 / 2.5. First draws are used, else second draws.',
            'largest_first_draw_per_employee_cash_pay_usd': round(CAP_PER_JOB_LOAN),
            'cap_note': 'The $100,000 limit applies to cash pay. Employer health insurance, retirement and state unemployment tax are added on top, so a loan can exceed $20,833 per employee.',
            'benefit_load': loads,
            'benefit_load_note': ('PPP payroll costs include employer health insurance, retirement and state unemployment tax. '
                                  'Census annual payroll does not. Dividing PPP payroll by the load puts it on the Census basis. '
                                  'ECEC covers firms of every size; small firms spend less on benefits, so the load may be a '
                                  'little high for them, which would make the payroll method a little low.'),
        },
        'stated_revenue': [],
        'stated_revenue_note': ('Company-stated revenue figures (the company itself, or a cited article quoting it) that override '
                                'the model: {id, revenue_usd, year, source, url}. None was found in the screen evidence. Figures '
                                'seen there are third-party estimates or contract values (a data vendor at about $2.5M for '
                                'pp-11873, a construction directory at $10M to $20M of annual volume for cet-3948, a directory '
                                'band of $1M to $10M for cet-1956), so they do not override the model.'),
        'caveats': [
            'Benchmarks are national averages for each size class. A single company can sit well above or below them.',
            'The jobs figure is mostly what borrowers reported for PPP in 2020 and 2021. The estimate is revenue at that size, in 2025 dollars, not a forecast of growth since.',
            'Wholesale receipts per employee vary widely with the product line, so wholesale estimates are less certain.',
            'The SBA screen industry code is the one the borrower gave the SBA. A company that also does other work may sit in a different benchmark.',
        ],
        'item_count': len(items),
    }
    out = {'meta': meta, 'items': items}
    write_json(a.out, out)
    print(f'wrote {a.out}: {len(items)} industries; CPI 2022->2025 x{f22:.4f}; benefit loads ' +
          ', '.join(f"{k} {v['benefit_load']}" for k, v in loads.items()))


# ---------- step 2: estimates ----------

def load_ppp(ppp_dir):
    """{LoanNumber: decoded row} from every data/ppp/<segment>_ppp.json (columnar)."""
    loans = {}
    for seg in SEGS:
        p = os.path.join(ppp_dir, f'{seg}_ppp.json')
        if not os.path.exists(p): continue
        d = json.load(open(p))
        cols, en = d['cols'], d['enums']
        for r in d['rows']:
            row = {c: (en[c][v] if c in en else v) for c, v in zip(cols, r)}
            loans[row['LoanNumber']] = row
    return loans


def pick(bench, n, which):
    """Benchmark cell for n employees: detailed, then broad, then the 4-digit parent. Returns (cell, table name, neighbours)."""
    order = [('detailed', cls_detailed(n), DETAILED), ('broad', cls_broad(n), BROAD),
             ('parent_detailed', cls_detailed(n), DETAILED), ('parent_broad', cls_broad(n), BROAD)]
    for name, lab, labels in order:
        if lab is None: continue
        rows = {x['size_class']: x for x in bench.get(name, [])}
        c = rows.get(lab)
        if not c or not c['reliable']: continue
        if name.endswith('detailed'):
            if c['firms'] < MIN_FIRMS_DETAILED: continue
            i = labels.index(lab)
            nb = [rows[l] for l in labels[max(0, i - 1):i + 2] if l != lab and l in rows and rows[l]['reliable'] and l != '<5']
        else:
            det = {x['size_class']: x for x in bench.get(name.replace('broad', 'detailed'), [])}
            nb = [det[l] for l in INSIDE_BROAD.get(lab, []) if l in det and det[l]['reliable']]
        return c, name, nb
    for name in ('all_sizes', 'parent_all_sizes'):  # last resort: every size together
        c = bench.get(name)
        if c and c['reliable']:
            return c, name, []
    return None, None, []


def spread(c, nb):
    s = 0.0
    for x in nb:
        s = max(s, abs(x['receipts_per_employee_2025'] / c['receipts_per_employee_2025'] - 1),
                abs(x['payroll_share'] / c['payroll_share'] - 1))
    return min(SPREAD_CAP, max(SPREAD_FLOOR, s))


def year_of(date_str):
    """'04/10/2020' or '2025-02-21' -> 2020 / 2025."""
    if not date_str: return None
    if '/' in date_str: return int(date_str.split('/')[-1])
    return int(date_str[:4])


def jobs_year(item):
    src = item.get('jobs_latest_source') or item.get('jobs_source') or ''
    if 'SBA 7(a)' in src or 'SBA 504' in src:
        for tok in src.split():
            if len(tok) == 10 and tok[4] == '-' and tok[:4].isdigit(): return int(tok[:4])
    if 'PPP' in src:
        return 2021 if '2021' in src and '2020' not in src else 2020
    return None


LEVELS = ['low', 'medium', 'high']


def draw_stats(rows):
    """(amount, jobs reported, annual PPP payroll per reported job or None) for a set of PPP loans."""
    amt = sum(num(x['CurrentApprovalAmount']) or 0 for x in rows)
    pjobs = sum(int(num(x['JobsReported']) or 0) for x in rows)
    return amt, pjobs, (amt * 12 / PPP_MULTIPLE / pjobs if pjobs > 0 and amt > 0 else None)


def fold(r):
    """Gap between two methods in words: '45%' up to double, else 'about 3.4-fold' / 'about 29-fold'."""
    if r < 2: return f'by {round((r - 1) * 100)}%'
    return f'about {r:.1f}-fold' if r < 10 else f'about {r:.0f}-fold'


def estimate_one(t, scr, bench_by, meta, loans, stated):
    seg = t.get('segment') or scr.get('segment')
    naics = t.get('naics') or scr.get('naics')
    bnaics, bnote = BENCH_OVERRIDE.get((seg, naics), (naics, None))
    b = bench_by.get(bnaics)
    infl = meta['inflation']['factor_to_2025']
    loan_jobs = t.get('jobs_latest') if t.get('jobs_latest') is not None else scr.get('jobs_latest')
    warnings, notes, methods = [], [], {}
    sp = []
    res = {'id': t['id'], 'segment': seg, 'company': t.get('company') or scr.get('company'),
           'naics': naics, 'jobs_latest': loan_jobs, 'jobs_source': t.get('jobs_source') or scr.get('jobs_latest_source')}
    if bnaics != naics: res['benchmark_naics'] = bnaics
    if not b:
        res.update({'revenue_est_usd': None, 'basis': 'none', 'confidence': None, 'confidence_note': 'No benchmark for this industry code.'})
        return res
    res['industry'] = b['industry']
    if bnote: notes.append(bnote)
    load = meta['ppp_payroll']['benefit_load'][b['benefit_load_key']]['benefit_load']
    # jobs for the headcount method: a current headcount the company states for its US business, else the latest loan figure
    basis = t.get('employees_basis') or scr.get('employees_basis')
    emp = t.get('employees') if t.get('employees') is not None else scr.get('employees')
    scope = t.get('employees_scope') or scr.get('employees_scope')
    jobs, jobs_basis = loan_jobs, 'loan'
    if basis == 'stated' and emp:
        if scope == 'worldwide':
            if loan_jobs and max(emp, loan_jobs) / min(emp, loan_jobs) > 1.5:
                warnings.append(f'The company states {emp} staff, but that count includes staff outside the US; its SBA loan record had '
                                f'{loan_jobs} jobs. The model uses the loan figure.')
        else:
            jobs, jobs_basis = emp, 'stated'
            if loan_jobs and max(emp, loan_jobs) / min(emp, loan_jobs) > 1.5:
                notes.append(f'The headcount method uses the {emp} staff the company states; its SBA loan record had {loan_jobs} jobs.')
    # PPP loans for the payroll method: first draws, else second draws (also 2.5 x average monthly payroll)
    keys = (scr.get('full_data_keys') or {}).get('ppp_loan_numbers') or []
    rows = [loans[k] for k in keys if k in loans]
    missing = [k for k in keys if k not in loans]
    if missing: notes.append(f'{len(missing)} PPP loan row(s) not found in data/ppp.')
    first = [x for x in rows if x.get('ProcessingMethod') == 'PPP']
    second = [x for x in rows if x.get('ProcessingMethod') == 'PPS']
    draws, draw = (first, 'first') if first else (second, 'second')
    amt, pjobs, per_job = draw_stats(draws) if draws else (0, 0, None)
    jobs_from_ppp = jobs_basis == 'loan' and 'PPP' in (res['jobs_source'] or '')
    if per_job is not None and per_job < LOW_PER_JOB and draw == 'first' and second:
        # the first draw's jobs figure cannot be right for its payroll; a second draw whose own jobs fit its payroll replaces it
        a2, j2, pj2 = draw_stats(second)
        if pj2 and LOW_PER_JOB <= pj2 <= PPP_CAP * load:
            notes.append(f'The first-draw PPP loan reported {pjobs} jobs on ${amt:,.0f}, about ${per_job / 1000:.0f}K of payroll a job, '
                         f'too low for real staff. The second-draw loan ({j2} jobs, about ${pj2 / 1000:.0f}K a job) is consistent, '
                         f'so the model uses it.')
            draws, draw, amt, pjobs, per_job = second, 'second', a2, j2, pj2
            if jobs_from_ppp: jobs, jobs_basis = j2, 'second_draw'
    # (a) headcount
    if jobs and jobs > 0:
        c, tab, nb = pick(b, jobs, 'headcount')
        if c:
            v = jobs * c['receipts_per_employee_2025']
            methods['headcount'] = {'revenue_usd': rnd(v), 'jobs': jobs, 'jobs_basis': jobs_basis, 'size_class': c['size_class'], 'table': tab,
                                    'receipts_per_employee_2025': c['receipts_per_employee_2025'],
                                    'formula': f"{jobs} jobs x ${c['receipts_per_employee_2025']:,} receipts per employee"}
            sp.append(spread(c, nb))
            if tab.startswith('parent') or tab.endswith('all_sizes'): notes.append('fallback')
        jy = jobs_year(scr or t) if jobs_basis == 'loan' else None
        if jy and jy < OLD_JOBS_YEAR:
            warnings.append(f'The jobs figure comes from an SBA loan approved in {jy}.')
    # (b) payroll
    if draws:
        appr_year = min(year_of(x['DateApproved']) for x in draws)
        pay_year = appr_year - 1
        ppp_payroll = amt * 12 / PPP_MULTIPLE
        census_payroll = ppp_payroll / load
        c, tab, nb = pick(b, pjobs if pjobs > 0 else jobs, 'payroll')
        if c and amt > 0:
            rev_base = census_payroll / c['payroll_share']
            f = infl[str(pay_year)]
            methods['payroll'] = {
                'revenue_usd': rnd(rev_base * f), 'draw': draw, 'loan_usd': rnd(amt, 1), 'loans': [x['LoanNumber'] for x in draws],
                'approved': sorted(x['DateApproved'] for x in draws), 'loan_jobs': pjobs or None,
                'ppp_annual_payroll_usd': rnd(ppp_payroll), 'benefit_load': load, 'census_basis_payroll_usd': rnd(census_payroll),
                'payroll_year': pay_year, 'size_class': c['size_class'], 'table': tab, 'payroll_share': c['payroll_share'],
                'cpi_factor_to_2025': f,
                'formula': (f"${amt:,.0f} x 12 / 2.5 = ${ppp_payroll:,.0f} PPP payroll; / {load} = ${census_payroll:,.0f}; "
                            f"/ {c['payroll_share']} payroll share x {f} CPI ({pay_year} to 2025)")}
            sp.append(spread(c, nb))
            if tab.startswith('parent') or tab.endswith('all_sizes'): notes.append('fallback')
            if len(draws) > 1: notes.append(f'{len(draws)} {draw}-draw loans under related names were added together.')
            if draw == 'second' and not first: notes.append('The payroll method uses the second-draw PPP loan; no first draw is on file.')
            if per_job is not None:
                methods['payroll']['ppp_payroll_per_job_usd'] = rnd(per_job)
                if per_job > PPP_CAP * load:
                    # Cash pay counted by PPP stops at $100,000 a head; benefits sit on top. Above $100,000 x the average
                    # load, heavy benefits (union funds) or a low jobs count drive the loan, and the Census payroll share
                    # no longer fits, so the method stays in the range but not in the midpoint.
                    methods['payroll']['in_midpoint'] = False
                    warnings.append(f'PPP payroll is ${per_job / 1000:,.0f}K per reported job, above $100K pay plus average '
                                    f'benefits. Union benefit funds or a low jobs count can do this, so the payroll method '
                                    f'sets only the range.')
                elif per_job < LOW_PER_JOB:
                    # No real payroll pays this little a head: the loan's jobs figure or its amount is wrong. The loan amount
                    # comes from payroll records, so the payroll method sets the estimate when the headcount rests on that
                    # jobs figure; the headcount method then sets only the range.
                    if 'headcount' in methods and (jobs_from_ppp or jobs_basis == 'second_draw'):
                        methods['headcount']['in_midpoint'] = False
                        warnings.append(f'PPP payroll is only about ${per_job / 1000:,.1f}K per reported job ({pjobs} jobs on '
                                        f'${amt:,.0f}), too low for real staff, so the jobs figure or the loan is wrong. The '
                                        f'estimate uses the payroll method; the headcount method sets only the range.')
                    else:
                        notes.append(f'The PPP loan reported {pjobs} jobs on ${amt:,.0f}, too little payroll for that many staff.')
                elif per_job >= CAP_NEAR:
                    notes.append('Pay per job is near the $100,000 PPP cap, so the payroll method may read low.')
    # (c) combine
    vals = [m['revenue_usd'] for m in methods.values()]
    res['methods'] = methods
    st = stated.get(t['id'])
    if not vals and not st:
        res.update({'revenue_est_usd': None, 'basis': 'none', 'confidence': None,
                    'confidence_note': 'No jobs figure and no PPP loan, so no estimate.'})
        return res
    if vals:
        s = max(sp) if sp else SPREAD_FLOOR
        mid_keys = [k for k, m in methods.items() if m.get('in_midpoint', True)] or list(methods)
        mid_vals = [methods[k]['revenue_usd'] for k in mid_keys]
        mid = sum(mid_vals) / len(mid_vals)
        lo, hi = min(vals) * (1 - s), max(vals) * (1 + s)
        if len(mid_vals) == 2:
            r = max(vals) / min(vals)
            lvl = 2 if r <= 1.25 else 1 if r <= 1.6 else 0
            why = [f'The two methods agree within {max(1, round((r - 1) * 100))}%.' if r <= 1.25
                   else f'The two methods differ {fold(r)}.']
        else:
            lvl = 0 if 'fallback' in notes else 1
            if len(vals) == 2:
                why = [f'Estimate from the {mid_keys[0]} method; the two methods differ {fold(max(vals) / min(vals))}.']
            elif 'headcount' in methods:
                why = ['Headcount method only (no PPP loan on file).']
            else:
                why = ['Payroll method only (' + ('no Census cell fits the jobs figure).' if jobs else 'no jobs figure).')]
        if 'fallback' in notes:
            why.append('The size-class cells were too thin, so a wider Census cell was used.')
        lvl = max(0, lvl - len(warnings))
        res.update({'model_est_usd': rnd(mid, 10000), 'model_low_usd': rnd(lo, 10000), 'model_high_usd': rnd(hi, 10000),
                    'spread_used': round(s, 3), 'methods_used': sorted(methods), 'midpoint_methods': sorted(mid_keys)})
        conf, conf_note = LEVELS[lvl], ' '.join(why + warnings + [n for n in notes if n != 'fallback'])
    if st:
        res.update({'revenue_est_usd': st['revenue_usd'], 'revenue_low_usd': None, 'revenue_high_usd': None, 'basis': 'stated',
                    'stated': st, 'confidence': 'stated',
                    'confidence_note': f"Stated revenue for {st.get('year')}: {st.get('source')}."})
    else:
        res.update({'revenue_est_usd': res['model_est_usd'], 'revenue_low_usd': res['model_low_usd'],
                    'revenue_high_usd': res['model_high_usd'], 'basis': 'model', 'confidence': conf, 'confidence_note': conf_note})
    v = res['revenue_est_usd']
    if res['basis'] == 'model':
        res['display'] = f"est. {money(v)} ({money(res['revenue_low_usd'])} to {money(res['revenue_high_usd'])})"
    else:
        res['display'] = f"{money(v)} (stated, {st.get('year')})"
    return res


def pctl(xs, q):
    xs = sorted(xs)
    if not xs: return None
    k = (len(xs) - 1) * q
    f = math.floor(k)
    c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def calibrate(screen_items, by_id_result, hand_built, bench_by):
    rows = []
    for it in screen_items:
        hb_id = it.get('on_existing_list')
        if not hb_id: continue
        r = by_id_result.get(it['id'])
        h = hand_built.get(hb_id) or {}
        hb = h.get('revenue_est_usd')
        row = {'id': it['id'], 'hand_built_id': hb_id, 'company': it['company'], 'naics': it['naics'],
               'jobs_sba': it.get('jobs_latest'), 'employees_hand_built': h.get('employees'),
               'hand_built_revenue_usd': hb, 'hand_built_source': h.get('revenue_source'),
               'model_est_usd': r and r.get('model_est_usd'),
               'headcount_usd': r and r['methods'].get('headcount', {}).get('revenue_usd'),
               'payroll_usd': r and r['methods'].get('payroll', {}).get('revenue_usd')}
        if hb:
            for k in ('model_est_usd', 'headcount_usd', 'payroll_usd'):
                if row[k]: row['ratio_' + k.replace('_usd', '')] = round(row[k] / hb, 3)
            if h.get('employees') and r:
                # receipts per employee implied by the hand-built pair, against the Census benchmark for the same class
                # split the gap: headcount (SBA jobs vs the list's employees) and revenue per employee (the list's own
                # revenue / employees vs the Census figure for a company of that size)
                row['hand_built_revenue_per_employee'] = round(hb / h['employees'])
                c, _, _ = pick(bench_by.get(it['naics'], {}), h['employees'], 'calibration')
                if c:
                    row['census_receipts_per_employee_2025'] = c['receipts_per_employee_2025']
                    row['hand_built_rpe_vs_census'] = round(hb / h['employees'] / c['receipts_per_employee_2025'], 3)
                if it.get('jobs_latest'):
                    row['sba_jobs_vs_hand_built_employees'] = round(it['jobs_latest'] / h['employees'], 3)
        rows.append(row)

    def stats(key):
        xs = [x[key] for x in rows if x.get(key)]
        if not xs: return None
        logs = [math.log(x) for x in xs]
        return {'n': len(xs), 'median_ratio': round(statistics.median(xs), 3),
                'geometric_mean_ratio': round(math.exp(sum(logs) / len(logs)), 3),
                'median_absolute_error_pct': round(statistics.median(abs(x - 1) for x in xs) * 100, 1),
                'within_25pct': sum(1 for x in xs if 0.75 <= x <= 1.25), 'within_50pct': sum(1 for x in xs if 0.5 <= x <= 1.5),
                'above_1': sum(1 for x in xs if x > 1), 'below_1': sum(1 for x in xs if x < 1)}

    def med(key):
        xs = [x[key] for x in rows if x.get(key)]
        return round(statistics.median(xs), 3) if xs else None

    abs_err = [abs(x['model_est_usd'] - x['hand_built_revenue_usd']) for x in rows if x.get('model_est_usd') and x.get('hand_built_revenue_usd')]
    summary = {'estimate': stats('ratio_model_est'), 'headcount_method': stats('ratio_headcount'), 'payroll_method': stats('ratio_payroll'),
               'median_absolute_error_usd': rnd(statistics.median(abs_err), 1000) if abs_err else None,
               'median_hand_built_rpe_vs_census': med('hand_built_rpe_vs_census'),
               'median_sba_jobs_vs_hand_built_employees': med('sba_jobs_vs_hand_built_employees')}
    return rows, summary


def distribution(results):
    out = {}
    for seg in SEGS:
        rs = [r for r in results if r['segment'] == seg]
        v = [r['revenue_est_usd'] for r in rs if r.get('revenue_est_usd')]
        conf = {}
        for r in rs: conf[r.get('confidence') or 'none'] = conf.get(r.get('confidence') or 'none', 0) + 1
        both = sum(1 for r in rs if len(r.get('methods') or {}) == 2)
        out[seg] = {'segment_name': SEG_NAME[seg], 'companies': len(rs), 'with_estimate': len(v),
                    'both_methods': both, 'one_method': sum(1 for r in rs if len(r.get('methods') or {}) == 1),
                    'min_usd': min(v) if v else None, 'p25_usd': rnd(pctl(v, .25), 10000), 'median_usd': rnd(pctl(v, .5), 10000),
                    'p75_usd': rnd(pctl(v, .75), 10000), 'max_usd': max(v) if v else None, 'confidence': conf}
    return out


def run_estimates(a):
    bench = json.load(open(a.benchmarks))
    meta = bench['meta']
    bench_by = {x['naics']: x for x in bench['items']}
    screen = json.load(open(a.screen))['items']
    scr_by = {x['id']: x for x in screen}
    tasks = json.load(open(a.tasks)) if a.tasks else screen
    if isinstance(tasks, dict): tasks = tasks.get('items', [])
    loans = load_ppp(a.ppp_dir)
    stated = {x['id']: x for x in meta.get('stated_revenue') or []}
    if a.stated:
        for x in json.load(open(a.stated)).get('items', []): stated[x['id']] = x
    for t in tasks:  # a task may carry a stated figure of its own
        if t.get('revenue_stated_usd'):
            stated[t['id']] = {'id': t['id'], 'revenue_usd': t['revenue_stated_usd'], 'year': t.get('revenue_stated_year'),
                               'source': t.get('revenue_stated_source'), 'url': t.get('revenue_stated_url')}
    results = [estimate_one(t, scr_by.get(t['id'], {}), bench_by, meta, loans, stated) for t in tasks]
    # calibration runs on every screen company that is also on a hand-built list
    hand_built = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'research', 'ma_targets_*.json'))):
        for h in json.load(open(f))['items']: hand_built[h['id']] = h
    cal_items = [x for x in screen if x.get('on_existing_list')]
    res_by = {r['id']: r for r in results}
    for x in cal_items:
        if x['id'] not in res_by: res_by[x['id']] = estimate_one(x, x, bench_by, meta, loans, stated)
    cal_rows, cal_sum = calibrate(cal_items, res_by, hand_built, bench_by)
    out = {'meta': {'dataset': 'revenue_estimates', 'generated': a.generated or datetime.date.today().isoformat(),
                    'benchmarks': os.path.relpath(a.benchmarks, ROOT) if a.benchmarks.startswith(ROOT) else a.benchmarks,
                    'tasks': os.path.basename(a.tasks) if a.tasks else 'screen items',
                    'dollars': '2025 dollars (CPI-U); stated figures are as stated', 'method': 'See the docstring of scripts/estimate_revenue.py and meta.method in data/research/revenue_benchmarks.json.',
                    'item_count': len(results)},
           'items': results, 'calibration': {'rows': cal_rows, 'summary': cal_sum}, 'distribution': distribution(results)}
    write_json(a.out, out)
    report(results, cal_rows, cal_sum, out['distribution'])
    print(f'\nwrote {a.out}: {len(results)} companies')


def report(results, cal_rows, cal_sum, dist):
    print('Calibration: model vs hand-built (hand-built figures are ZoomInfo modelled estimates)')
    print(f"{'id':<10}{'company':<34}{'jobs':>5}{'hbEmp':>6}{'hand-built':>12}{'headcount':>11}{'payroll':>11}{'est':>11}{'ratio':>7}{'hbRPE':>7}{'jobs':>7}")
    for r in cal_rows:
        print(f"{r['id']:<10}{r['company'][:33]:<34}{r['jobs_sba'] or '':>5}{r['employees_hand_built'] or '':>6}"
              f"{money(r['hand_built_revenue_usd']) or '-':>12}{money(r['headcount_usd']) or '-':>11}{money(r['payroll_usd']) or '-':>11}"
              f"{money(r['model_est_usd']) or '-':>11}{r.get('ratio_model_est', '-'):>7}{r.get('hand_built_rpe_vs_census', '-'):>7}{r.get('sba_jobs_vs_hand_built_employees', '-'):>7}")
    print(json.dumps(cal_sum, indent=1))
    print('\nDistribution per segment (2025 dollars)')
    for seg, d in dist.items():
        print(f"{seg:<4} n={d['companies']:<3} est={d['with_estimate']:<3} both={d['both_methods']:<3} min {money(d['min_usd'])} "
              f"p25 {money(d['p25_usd'])} median {money(d['median_usd'])} p75 {money(d['p75_usd'])} max {money(d['max_usd'])} {d['confidence']}")


def write_json(path, obj):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    b = sub.add_parser('benchmarks')
    b.add_argument('--detailed', required=True, help='SUSB us_state_naics_detailedsizes_2022.txt')
    b.add_argument('--six', required=True, help='SUSB us_state_6digitnaics_2022.txt')
    b.add_argument('--cpi', required=True, help='BLS API response for CUUR0000SA0 with annualaverage=true (2019-2025)')
    b.add_argument('--ecec', required=True, help='BLS API response for the ECEC percent-of-compensation series (2019)')
    b.add_argument('--tasks', required=True, help='profile tasks or any JSON list with a naics field (sets the industries)')
    b.add_argument('--retrieved', default=None)
    b.add_argument('--generated', default=None)
    b.add_argument('--out', default=BENCH)
    e = sub.add_parser('estimate')
    e.add_argument('--benchmarks', default=BENCH)
    e.add_argument('--tasks', default=None, help='profile tasks (JSON list); default: every screen item')
    e.add_argument('--screen', default=os.path.join(ROOT, 'data', 'research', 'ma_ppp_screen.json'))
    e.add_argument('--ppp-dir', default=os.path.join(ROOT, 'data', 'ppp'))
    e.add_argument('--stated', default=None, help='optional {items:[{id, revenue_usd, year, source, url}]}')
    e.add_argument('--generated', default=None)
    e.add_argument('--out', required=True)
    a = ap.parse_args()
    if a.cmd == 'benchmarks':
        a.retrieved = a.retrieved or datetime.date.today().isoformat()
        build_benchmarks(a)
    else:
        run_estimates(a)


if __name__ == '__main__':
    main()
