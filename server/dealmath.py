"""
Deal maths for the assistant: a line-for-line port of modules/deal-lib.js (lbo, dcf, irr, solveEntry, encode),
so an answer in the chat matches the portal's acquisition model and its Excel download to the decimal.

Presets (portfolio companies, a typical lower-middle-market deal and the screened add-on targets) come from
knowledge/deal_presets.json, which scripts/build_corpus.py exports from the portal's deal-model research and
add-on screens. Inputs use the model's own keys and units (percentages as 12 for 12%, money in $M).
Author: Syed Rahman.
"""

import json
import math
import os
import re
from urllib.parse import urlencode

HERE = os.path.dirname(os.path.abspath(__file__))
PRESETS_PATH = os.path.join(HERE, 'knowledge', 'deal_presets.json')
SITE = 'https://syedr64.github.io/BroadSky_Intelligence_Portal/'
H = 7            # model horizon in years (exit year 2 to 7)
DCF_YEARS = 5

_state = {'data': None}


def presets():
    if _state['data'] is None:
        try:
            with open(PRESETS_PATH, encoding='utf-8') as fh:
                _state['data'] = json.load(fh)
        except (OSError, ValueError):
            _state['data'] = {'inputs': [], 'presets': []}
    return _state['data']


def fin(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def irr(cfs):
    if not any(c > 0 for c in cfs) or not any(c < 0 for c in cfs):
        return None

    def npv(r):
        return sum(c / (1 + r) ** t for t, c in enumerate(cfs))

    def d(r):
        return sum(-t * c / (1 + r) ** (t + 1) for t, c in enumerate(cfs))
    r = 0.15
    for _ in range(60):
        try:
            f, g = npv(r), d(r)
        except (OverflowError, ZeroDivisionError):
            break
        if not fin(f) or not fin(g) or g == 0:
            break
        nr = r - f / g
        if not fin(nr) or nr <= -0.9999:
            break
        if abs(nr - r) < 1e-10:
            return nr
        r = nr
    lo, hi = -0.9999, 10.0
    try:
        flo, fhi = npv(lo), npv(hi)
    except (OverflowError, ZeroDivisionError):
        return None
    if not fin(flo) or not fin(fhi) or flo * fhi > 0:
        return None
    for _ in range(200):
        m = (lo + hi) / 2
        fm = npv(m)
        if abs(fm) < 1e-9:
            return m
        if flo * fm < 0:
            hi = m
        else:
            lo, flo = m, fm
    return (lo + hi) / 2


def clamp_yrs(v):
    return max(2, min(H, int(round(v or 5))))


def lbo(p):
    N = clamp_yrs(p['yrs'])
    g, m0, dm, r, conv, adp, fee = p['gr'] / 100, p['mg'] / 100, p['dm'] / 100, p['ir'] / 100, p['cc'] / 100, p['ad'] / 100, p['fee'] / 100
    z = lambda: [0.0] * (H + 1)
    o = {k: z() for k in ('rev', 'mgn', 'org', 'add', 'ebitda', 'buy', 'adebt', 'aeq', 'int', 'cash', 'nd', 'cf')}
    o['N'] = N
    for y in range(H + 1):
        o['rev'][y] = o['rev'][y - 1] * (1 + g) if y else p['rev']
        o['mgn'][y] = m0 + dm * y
        o['org'][y] = o['rev'][y] * o['mgn'][y]
        o['add'][y] = o['add'][y - 1] * (1 + g) + (p['ae'] if 2 <= y <= N else 0) if y else 0
        o['ebitda'][y] = o['org'][y] + o['add'][y]
        o['buy'][y] = p['ae'] * p['am'] if y and y <= N - 1 else 0
        o['adebt'][y] = o['buy'][y] * adp
        o['aeq'][y] = o['buy'][y] - o['adebt'][y]
        o['int'][y] = max(0, o['nd'][y - 1]) * r if y else 0
        o['cash'][y] = o['ebitda'][y] * conv - o['int'][y] if y else 0
        o['nd'][y] = o['nd'][y - 1] - o['cash'][y] + o['adebt'][y] if y else o['ebitda'][0] * p['lev']
        if y == 0:
            o['cf'][y] = -(o['ebitda'][0] * p['em'] * (1 + fee) - o['nd'][0])
        elif y < N:
            o['cf'][y] = -o['aeq'][y]
        elif y == N:
            o['cf'][y] = o['ebitda'][y] * p['xm'] - o['nd'][y] - o['aeq'][y]
    o['ev0'] = o['ebitda'][0] * p['em']
    o['fees'] = o['ev0'] * fee
    o['debt0'] = o['nd'][0]
    o['eq0'] = o['ev0'] + o['fees'] - o['debt0']
    o['addEq'] = sum(o['aeq'])
    o['totalEq'] = o['eq0'] + o['addEq']
    o['addSpend'] = sum(o['buy'])
    o['exitE'] = o['ebitda'][N]
    o['exitEV'] = o['exitE'] * p['xm']
    o['exitND'] = o['nd'][N]
    o['exitEq'] = o['exitEV'] - o['exitND']
    o['moic'] = o['exitEq'] / o['totalEq'] if o['totalEq'] > 0 else None
    o['irr'] = irr(o['cf']) if o['eq0'] > 0 else None
    cash_in = sum(o['cash'][1:N + 1])
    o['bridge'] = [
        ('Earnings growth', (o['exitE'] - o['ebitda'][0]) * p['em']),
        ('Exit multiple versus entry', (p['xm'] - p['em']) * o['exitE']),
        ('Cash that repaid debt', cash_in),
        ('Paid for add-ons', -o['addSpend']),
        ('Deal fees', -o['fees']),
    ]
    o['gain'] = o['exitEq'] - o['totalEq']
    return o


def dcf(p):
    g, m0, dm, t, w, tg = p['gr'] / 100, p['mg'] / 100, p['dm'] / 100, p['tax'] / 100, p['wacc'] / 100, p['tg'] / 100
    Y = DCF_YEARS
    z = lambda: [0.0] * (Y + 1)
    o = {k: z() for k in ('rev', 'mgn', 'ebitda', 'da', 'ebit', 'tax', 'capex', 'dnwc', 'fcf', 'df', 'pv')}
    for y in range(Y + 1):
        o['rev'][y] = o['rev'][y - 1] * (1 + g) if y else p['rev']
        o['mgn'][y] = m0 + dm * y
        o['ebitda'][y] = o['rev'][y] * o['mgn'][y]
        o['da'][y] = o['rev'][y] * p['da'] / 100
        o['ebit'][y] = o['ebitda'][y] - o['da'][y]
        o['tax'][y] = o['ebit'][y] * t
        o['capex'][y] = o['rev'][y] * p['cx'] / 100
        o['dnwc'][y] = (o['rev'][y] - o['rev'][y - 1]) * p['nwc'] / 100 if y else 0
        o['fcf'][y] = o['ebit'][y] - o['tax'][y] + o['da'][y] - o['capex'][y] - o['dnwc'][y] if y else 0
        o['df'][y] = 1 / (1 + w) ** y
        o['pv'][y] = o['fcf'][y] * o['df'][y] if y else 0
    o['sumPV'] = sum(o['pv'])
    o['okG'] = w > tg
    o['tvG'] = o['fcf'][Y] * (1 + tg) / (w - tg) if o['okG'] else None
    o['pvTvG'] = o['tvG'] * o['df'][Y] if o['okG'] else None
    o['evG'] = o['sumPV'] + o['pvTvG'] if o['okG'] else None
    o['tvM'] = o['ebitda'][Y] * p['tm']
    o['pvTvM'] = o['tvM'] * o['df'][Y]
    o['evM'] = o['sumPV'] + o['pvTvM']
    o['eqG'] = None if o['evG'] is None else o['evG'] - p['nd']
    o['eqM'] = o['evM'] - p['nd']
    o['impliedMult'] = o['tvG'] / o['ebitda'][Y] if o['okG'] and o['ebitda'][Y] else None
    o['evMultG'] = o['evG'] / o['ebitda'][0] if o['evG'] is not None and o['ebitda'][0] else None
    o['evMultM'] = o['evM'] / o['ebitda'][0] if o['ebitda'][0] else None
    o['tvShare'] = o['pvTvG'] / o['evG'] if o['evG'] else None
    return o


def solve_entry(p, target):
    """Entry multiple a buyer can pay and still earn the target IRR (bisection; IRR falls as the price rises)."""
    def f(em):
        r = lbo({**p, 'em': em})
        return -1 if r['irr'] is None else r['irr']
    lo, hi = max(1, p['lev'] / (1 + p['fee'] / 100) + 0.05), 40.0
    if f(lo) < target:
        return None
    if f(hi) >= target:
        return hi
    for _ in range(60):
        m = (lo + hi) / 2
        if f(m) >= target:
            lo = m
        else:
            hi = m
    return lo


def r4(v):
    return round(v * 10000) / 10000


def share_link(preset_id, vals, preset_vals, view='returns'):
    """The portal link that opens this exact scenario (deal-lib's encode: the preset plus inputs that differ)."""
    q = [('p', preset_id)]
    for k, v in vals.items():
        if preset_vals is None or preset_vals.get(k) is None or r4(preset_vals[k]) != r4(v):
            q.append((k, str(r4(v)).rstrip('0').rstrip('.') if '.' in str(r4(v)) else str(r4(v))))
    return f"{SITE}app.html#/deal/{view}?{urlencode(q)}"


# ── The assistant's tool ────────────────────────────────────────────────────
def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', str(s or '').lower()).strip()


ALIASES = [('pp', r'punctual pros?( llc)?'), ('cet', r'(cet|commonwealth electrical( technologies)?)'), ('fl', r'frontline( managed services)?'),
           ('ts', r'(ts|thomas scientific|thomas)'), ('bpi', r'(bpi|bully pulpit( international| interactive)?)'), ('fh', r'fair harbor( clothing)?')]


def find_preset(name):
    data = presets()
    if not name:
        return None
    n = norm(name)
    for p in data['presets']:
        if norm(p['id']) == n or norm(p['label']) == n:
            return p
    for code, rx in ALIASES:   # portfolio companies by their full names (the Thomas Scientific preset is labelled as a lab distributor)
        if re.fullmatch(rx, n):
            hit = next((p for p in data['presets'] if p['id'] == code), None)
            if hit:
                return hit
    for p in data['presets']:   # "Lancaster Plumbing" names "Lancaster Plumbing, Heating, Cooling & Electrical"
        label = norm(p['label'])
        if len(n) >= 4 and (label.startswith(n + ' ') or f' {n} ' in f' {label} '):
            return p
    stop = {'the', 'inc', 'llc', 'co', 'company', 'corp', 'and', 'of'}
    words = set(n.split()) - stop
    if not words:
        return None
    best, best_score = None, (0.0, 0.0)
    for p in data['presets']:
        lw = set(norm(p['label']).split()) - stop
        if not lw:
            continue
        hit = len(words & lw)
        score = (hit / len(words), hit / len(lw))   # share of the question's words found, then how specific the match is
        if score > best_score:
            best, best_score = p, score
    return best if best_score[0] >= 0.6 else None


def preset_catalog():
    """One line per preset for the tool description."""
    out = []
    for p in presets()['presets']:
        if p.get('hidden'):
            continue   # every other screened target is found by name
        v = p['vals']
        e = v['rev'] * v['mg'] / 100
        out.append(f"{p['id']}: {p['label']} (revenue ${v['rev']:g}M, EBITDA margin {v['mg']:g}%, EBITDA ${e:.1f}M, entry {v['em']:g}x)")
    return '\n'.join(out)


def money(v):
    if not fin(v):
        return 'n/m'
    a = abs(v)
    s = f'${a / 1000:,.2f}B' if a >= 1000 else f'${a:,.1f}M' if a >= 10 else f'${a:,.2f}M'
    return ('-' if v < 0 else '') + s


def pct(v):
    return 'n/m' if not fin(v) else f'{v * 100:.1f}%'


def run_tool(args):
    """Run the deal model for the assistant. args: {preset?, overrides?}. Returns (text for Claude, link or None)."""
    data = presets()
    if not data['presets']:
        return 'The acquisition model is not available on this server.', None
    base_p = find_preset(args.get('preset')) or next((p for p in data['presets'] if p['id'] == 'typical'), data['presets'][0])
    keys = {i['key']: i for i in data['inputs']}
    vals = dict(base_p['vals'])
    changed, ignored = [], []
    for k, v in (args.get('overrides') or {}).items():
        if k not in keys:
            ignored.append(k)
            continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            ignored.append(k)
            continue
        lo, hi = keys[k].get('min'), keys[k].get('max')
        if fin(v) and (lo is None or v >= lo) and (hi is None or v <= hi):
            vals[k] = v
            changed.append(k)
        else:
            ignored.append(k)
    L, D = lbo(vals), dcf(vals)
    e0 = vals['rev'] * vals['mg'] / 100
    a, b = solve_entry(vals, 0.25), solve_entry(vals, 0.20)
    link = share_link(base_p['id'], vals, base_p['vals'])
    label = lambda k: f"{keys[k]['label']} ({keys[k]['unit']})" if k in keys else k
    lines = [f"Scenario: {base_p['label']}" + (f" with changes to {', '.join(keys[k]['label'] for k in changed)}" if changed else ' (preset as is)')]
    if base_p.get('summary'):
        lines.append(f"Preset note: {base_p['summary']}")
    est = set(base_p.get('est') or [])
    lines.append('Inputs: ' + '; '.join(f"{label(k)} {vals[k]:g}{' est.' if k in est and k not in changed else ''}" for k in
                                         ('rev', 'mg', 'em', 'lev', 'ir', 'gr', 'dm', 'yrs', 'xm', 'ae', 'am', 'ad', 'cc', 'fee', 'wacc', 'tg', 'tm', 'nd')))
    basis = base_p.get('basis') or {}
    if basis:
        lines.append('Where the preset numbers come from: ' + ' '.join(f"{keys[k]['label']}: {basis[k]}" for k in ('rev', 'mg', 'em', 'lev', 'ir', 'gr', 'xm') if basis.get(k) and k in keys))
    moic = 'n/m' if L['moic'] is None else f"{L['moic']:.2f}x"
    mult_g = '' if D['evMultG'] is None else f" ({D['evMultG']:.1f}x EBITDA today)"
    mult_m = '' if D['evMultM'] is None else f" ({D['evMultM']:.1f}x)"
    lines.append(f"Returns (buyout, exit in year {L['N']}): EBITDA today {money(e0)}; price {money(L['ev0'])} at {vals['em']:g}x; debt at entry {money(L['debt0'])} "
                 f"({vals['lev']:g}x EBITDA at {vals['ir']:g}% interest); fees {money(L['fees'])}; equity check {money(L['eq0'])}; add-on equity {money(L['addEq'])}; "
                 f"exit EBITDA {money(L['exitE'])}; exit value {money(L['exitEV'])} at {vals['xm']:g}x; net debt at exit {money(L['exitND'])}; "
                 f"equity at exit {money(L['exitEq'])}; money multiple {moic}; IRR {pct(L['irr'])}.")
    lines.append('Where the gain comes from: ' + '; '.join(f'{n} {money(v)}' for n, v in L['bridge']) + f"; total gain {money(L['gain'])}.")
    lines.append(f"DCF (five years, discount rate {vals['wacc']:g}%): value with {vals['tg']:g}% long-run growth {money(D['evG'])}{mult_g}; "
                 f"value with a {vals['tm']:g}x year-5 sale {money(D['evM'])}{mult_m}; share value after {money(vals['nd'])} net debt: {money(D['eqG'])} and {money(D['eqM'])}.")
    if a is not None and b is not None:
        lines.append(f"What a buyer can pay and still earn 20% to 25% a year: {a:.1f}x to {b:.1f}x EBITDA ({money(a * e0)} to {money(b * e0)}).")
    lines.append(f"Open this scenario in the acquisition model: {link}")
    if ignored:
        lines.append(f"Ignored inputs (unknown or out of range): {', '.join(ignored)}.")
    return '\n'.join(lines), link


TOOL = {
    'name': 'deal_model',
    'description': ("Run BSP Desk's acquisition model (the same maths as the portal's acquisition model and its Excel download): a leveraged buyout "
                    "with add-ons (price, debt, equity check, exit value, money multiple, IRR and where the gain comes from), a five-year DCF, and the "
                    "price a buyer can pay for a 20% to 25% return. Use it for any question about valuation, purchase price, financing, returns or what a "
                    "company or add-on target is worth. Start from the closest preset and override inputs with the best estimates you found "
                    "(money in $M, percentages as numbers, e.g. 12 for 12%). Presets (any other screened add-on target can be named too):\n{catalog}"),
    'input_schema': {
        'type': 'object',
        'properties': {
            'preset': {'type': 'string', 'description': 'Preset id or name to start from (default: typical lower-middle-market deal).'},
            'overrides': {
                'type': 'object',
                'description': ('Inputs to change. rev revenue $M; mg EBITDA margin %; em entry multiple x; lev debt at entry x EBITDA; ir interest rate %; '
                                'gr revenue growth % a year; dm margin change points a year; yrs exit year 2-7; xm exit multiple x; ae add-on EBITDA bought $M a year; '
                                'am add-on multiple x; ad add-ons paid with debt %; cc cash conversion % of EBITDA; fee deal fees % of price; wacc discount rate %; '
                                'tg long-run growth %; tm year-5 sale multiple x; nd net debt today $M.'),
                'additionalProperties': {'type': 'number'},
            },
        },
        'additionalProperties': False,
    },
}


def tool_definition():
    return {**TOOL, 'description': TOOL['description'].format(catalog=preset_catalog() or '(none)')}
