"""
Signature views: one question per role, answered with a picture and a draft, with no model call.

  build_view(role_id, view, args=None) -> {kind, title, lead, data, basis, source, as_of, draft}
  prepared(role_id, connected=None)    -> the role's signature answer {role, q, view, text, cards, draft, as_of}
  write_prepared(path=None)            -> writes data/agent/prepared.json for every role (dates frozen to the data's base date)
  signature(role_id)                   -> the role's signature {q, tool, args, view, draft}
  card(view)                           -> the view as a card event for the agent page

Five general pictures: scorecard, bridge, heatmap, pipeline_board and ranked_bars. Live first: where the repository holds real
data for a role's question (add-on screens, rival loan schedules, Form D filings, the deal model presets, CET's public bids and
wastewater plants, recorded home sales, the law-firm lists, the lab-site registry, the BPI and Fair Harbor opportunity lists)
the picture is built from it. Example records (server/sandbox, read through workspace._visible_records so every role's scope
holds) are used only for what lives inside a company's own systems. Every drawn item carries its basis: "public",
"estimate" or "company record (example data)". Nothing here calls a model or the network.

workspace.py is imported lazily (it will import this module from run_tool), so there is no circular import at load time.
"""
from __future__ import annotations

import contextlib
import datetime
import hashlib
import json
import math
import os
import re
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RESEARCH = os.path.join(ROOT, 'data', 'research')
CATALOG = os.path.join(ROOT, 'data', 'agent', 'catalog.json')
PREPARED = os.path.join(ROOT, 'data', 'agent', 'prepared.json')
PRESETS = os.path.join(HERE, 'knowledge', 'deal_presets.json')

KINDS = ('scorecard', 'bridge', 'heatmap', 'pipeline_board', 'ranked_bars')
SITE_KINDS = ('floor_plan', 'house_model', 'floor_sketch')
PUBLIC, EST, REC = 'public', 'estimate', 'company record (example data)'
BASES = (PUBLIC, EST, REC)
REC_LINE = 'Company record (example data)'
LEAD_WORDS, SENTENCE_WORDS = 40, 18
FIRM_LEVELS = ('firm_leadership', 'firm_team')
BASE_FALLBACK = datetime.date(2026, 11, 17)
COS = ('pp', 'cet', 'fl', 'ts', 'bpi', 'fh')
CO_SHORT = {'pp': 'Punctual Pros', 'cet': 'CET', 'fl': 'Frontline', 'ts': 'Thomas Scientific', 'bpi': 'BPI', 'fh': 'Fair Harbor', 'bsp': 'Broad Sky'}
LOWER_IS_BETTER = {'callbacks', 'open_rfis', 'safety_incidents', 'npt', 'open_tickets', 'response_time', 'ebilling_rejection', 'days_to_pay',
                   'late_orders', 'backorders', 'overtime_hours', 'hours_over_scope', 'retainers_at_risk', 'return_rate', 'low_stock',
                   'markdown_share', 'ship_days'}
CO_KPIS = {'cet': ('backlog_k', 'bid_win_rate', 'field_utilization', 'open_rfis', 'safety_incidents'),
           'fl': ('csat', 'flr', 'response_time', 'ebilling_rejection', 'days_to_pay'),
           'ts': ('fill_rate', 'late_orders', 'backorders', 'digital_share'),
           'bpi': ('utilization', 'retainers', 'hours_over_scope', 'rev_per_fte_k'),
           'fh': ('aov', 'return_rate', 'repeat_rate', 'ship_days'),
           'pp': ('booking_rate', 'callbacks', 'avg_ticket', 'members')}

_lock = threading.Lock()
_cache: dict = {}


class ViewError(ValueError):
    """An unknown view or topic (a bad request, not an access refusal)."""


# ---------------------------------------------------------------- loading

def _ws():
    import workspace   # lazy: workspace imports this module from run_tool
    return workspace


def _json(path):
    with _lock:
        v = _cache.get(path)
    if v is None:
        with open(path, encoding='utf-8') as f:
            v = json.load(f)
        with _lock:
            _cache[path] = v
    return v


def _research(name):
    return _json(os.path.join(RESEARCH, name + '.json'))


def reset():
    with _lock:
        _cache.clear()


def base_date():
    """The sandbox's base date (manifest), the 'today' every prepared answer is frozen to."""
    try:
        s = _ws().load('manifest').get('base_date')
        return datetime.date.fromisoformat(s)
    except Exception:   # noqa: BLE001
        return BASE_FALLBACK


def _catalog_roles():
    try:
        return {r['id']: r for r in _json(CATALOG).get('roles') or [] if isinstance(r, dict) and r.get('id')}
    except Exception:   # noqa: BLE001
        return {}


def _role(role_id):
    try:
        return _ws().role(role_id)
    except Exception:   # noqa: BLE001
        return None


def _level(role_id, R=None):
    R = R or _role(role_id) or {}
    lv = R.get('level') or (_catalog_roles().get(role_id) or {}).get('level')
    if lv:
        return lv
    if R.get('company') in (None, 'bsp'):
        return 'firm_team'
    return 'co_field' if R.get('style') == 'field' else ('co_leadership' if R.get('team') == 'leadership' else 'co_office')


# ---------------------------------------------------------------- words, dates, numbers

def words(s):
    return len(re.findall(r"[A-Za-z0-9$%][\w$%.,'/&+-]*", s or ''))


def sentences(s):
    return [x for x in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9$])', (s or '').strip()) if x]


def lead_ok(s):
    return bool(s) and words(s) <= LEAD_WORDS and all(words(x) <= SENTENCE_WORDS for x in sentences(s))


def _month(m):
    b = base_date()
    y, mo = divmod(b.year * 12 + b.month - 1 + int(m), 12)
    return y, mo + 1


def _mon(m, year=False):
    y, mo = _month(m)
    s = datetime.date(y, mo, 1).strftime('%b')
    return f'{s} {y}' if year else s


def _month_name(m):
    y, mo = _month(m)
    return datetime.date(y, mo, 1).strftime('%B %Y')


def _mw(m):
    """Full month name, no year: 'October'."""
    y, mo = _month(m)
    return datetime.date(y, mo, 1).strftime('%B')


def _short_name(s, n=30):
    """A long company name cut at a word, with no ellipsis: for a lead sentence."""
    s = re.sub(r'\s*\(.*?\)', '', str(s or '')).strip()
    if len(s) <= n:
        return s
    out = ''
    for w in s.split(' '):
        if len((out + ' ' + w).strip()) > n:
            break
        out = (out + ' ' + w).strip()
    return out.rstrip(',;:-&') or s[:n]


def _day(d):
    return base_date() + datetime.timedelta(days=int(d))


def _short_date(d):
    x = d if isinstance(d, datetime.date) else _day(d)
    return f"{x.strftime('%b')} {x.day}"


def _iso_short(s):
    try:
        return _short_date(datetime.date.fromisoformat(str(s)[:10]))
    except (TypeError, ValueError):
        return ''


def _rel(d):
    """Relative words for a day offset: today, tomorrow, in 5 days, 3 days ago."""
    d = int(d)
    if d == 0:
        return 'today'
    if d == 1:
        return 'tomorrow'
    if d == -1:
        return 'yesterday'
    return f'in {d} days' if d > 0 else f'{-d} days ago'


def _money(v, k=False):
    return _ws().money(v, k)


def _m(v):
    """$M figure from dollars: $18.4M, $940K."""
    if not isinstance(v, (int, float)):
        return ''
    if abs(v) >= 1e9:
        return f'${v / 1e9:,.1f}B'
    if abs(v) >= 1e6:
        return f'${v / 1e6:,.1f}M'
    if abs(v) >= 1e3:
        return f'${v / 1e3:,.0f}K'
    return f'${v:,.0f}'


def _k(v):
    """Signed thousands: +$53k, -$23k."""
    return f"{'-' if v < 0 else '+'}${abs(round(v)):,}k"


def _clip(s, n=60):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    if len(s) <= n:
        return s
    cut = s[:n - 1].rsplit(' ', 1)[0].rstrip(' ,;:-(')
    return cut + '...'


def _title_case(s):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    if s.isupper() and len(s) > 4:
        small = {'And', 'Of', 'The', 'For', 'In', 'At', 'On', 'To'}
        out = []
        for i, w in enumerate(s.title().split(' ')):
            out.append(w.lower() if i and w in small else w)
        s = ' '.join(out).replace("'S ", "'s ")
        s = re.sub(r'\b(Inc|Llc|Co|Corp|Ltd)\b\.?', lambda m: {'Inc': 'Inc.', 'Llc': 'LLC', 'Co': 'Co.', 'Corp': 'Corp.', 'Ltd': 'Ltd.'}[m.group(1)], s)
    return s


def _ref(*parts):
    return 'v' + hashlib.sha1('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()[:10]


def _pct_gap(a, b):
    return (a - b) / b * 100 if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b else 0.0


def _tol():
    try:
        return _ws()._plan_tol()
    except Exception:   # noqa: BLE001
        return 1.0


def _status(value, target, lower_better=False):
    """good within the plan tolerance or on the right side of plan; warn up to 5 percent off; bad beyond."""
    if not isinstance(value, (int, float)) or not isinstance(target, (int, float)) or not target:
        return 'good'
    gap = _pct_gap(value, target)
    off = gap if lower_better else -gap
    if off <= _tol():
        return 'good'
    return 'warn' if off <= 5 else 'bad'


def _num_words(v, unit=''):
    if not isinstance(v, (int, float)):
        return ''
    v = round(v, 1) if isinstance(v, float) else v
    v = int(v) if isinstance(v, float) and v == int(v) else v
    if unit == '%':
        return f'{v}%'
    if unit in ('k$', '$k'):
        return _money(v, True)
    if unit == '$':
        return _money(v)
    s = f'{v:,}' if isinstance(v, int) else f'{v:,.1f}'
    return f'{s} {unit}'.strip() if unit else s


# ---------------------------------------------------------------- company records (through workspace, so scopes hold)

def _season(co, m):
    try:
        s = _ws().load(co).get('season') or {}
    except Exception:   # noqa: BLE001
        return 1.0
    f = s.get(str(_month(m)[1]))
    return float(f) if isinstance(f, (int, float)) else 1.0


def _seasoned(app, set_, rec):
    """workspace._seasoned with the month frozen to the base date."""
    r = dict(rec)
    if app == 'financials' and set_ == 'pnl' and isinstance(r.get('m'), int):
        f = _season(r.get('co'), r['m'])
        for k in ('revenue_k', 'cogs_k', 'opex_k', 'plan_revenue_k', 'plan_cogs_k', 'plan_opex_k'):
            if isinstance(r.get(k), (int, float)):
                r[k] = r[k] * f
        if all(isinstance(r.get(k), (int, float)) for k in ('revenue_k', 'cogs_k', 'opex_k')):
            r['ebitda_k'] = r['revenue_k'] - r['cogs_k'] - r['opex_k']
        if all(isinstance(r.get(k), (int, float)) for k in ('plan_revenue_k', 'plan_cogs_k', 'plan_opex_k')):
            r['plan_ebitda_k'] = r['plan_revenue_k'] - r['plan_cogs_k'] - r['plan_opex_k']
    elif r.get('seasonal') and isinstance(r.get('m'), int):
        f = _season(r.get('co'), r['m'])
        count = r.get('unit') not in ('%', '$', 'k$')
        for k in ('value', 'target', 'payroll_k', 'plan_k'):
            if isinstance(r.get(k), (int, float)) and not isinstance(r.get(k), bool):
                v = r[k] * f
                r[k] = int(math.floor(v + 0.5)) if count and k in ('value', 'target') and isinstance(rec.get(k), int) else v
    return r


def _recs(role_id, app, set_):
    """The records of one set this role may read, in its scope (workspace's own visibility rule)."""
    return [_seasoned(app, set_, r) for r in _ws()._visible_records(role_id, app, set_)]


def _scope(R, app, set_):
    return ((R.get('apps') or {}).get(app) or {}).get(set_)


def _team_label(co, team):
    if not team:
        return ''
    lab = ''
    try:
        lab = _ws()._team_name(team)
    except Exception:   # noqa: BLE001
        pass
    if lab:
        return lab.replace(' hub', '') if co == 'pp' else lab
    try:
        for r in _ws()._records('adp', 'headcount', co):
            if r.get('team') == team:
                if co == 'bpi' and r.get('unit'):
                    return r['unit']
                if r.get('group') and r['group'] not in ('Staff', 'Distribution', 'Field crews'):
                    return r['group']
                if r.get('unit'):
                    return r['unit']
    except Exception:   # noqa: BLE001
        pass
    return team.replace('-', ' ').title()


# ---------------------------------------------------------------- the five shapes

def _scorecard(rows, cols, cells, target_label='plan'):
    return {'rows': rows, 'cols': cols, 'cells': cells, 'target_label': target_label}


def _bridge(unit, start, steps, end):
    return {'unit': unit, 'start': start, 'steps': steps, 'end': end}


def _heatmap(unit, good, rows, cols, cells):
    return {'unit': unit, 'good': good, 'rows': rows, 'cols': cols, 'cells': cells}


def _board(unit, amount_label, stages, cards):
    return {'unit': unit, 'amount_label': amount_label, 'stages': stages, 'cards': cards}


def _bars(unit, value_label, bars, max_=None, plan_label=None, threshold=None):
    d = {'unit': unit, 'value_label': value_label, 'bars': bars}
    if max_ is not None:
        d['max'] = max_
    if plan_label:
        d['plan_label'] = plan_label
    if threshold:
        d['threshold'] = threshold
    return d


def _res(title, lead, data, basis, source, as_of, draft=None):
    return {'title': title, 'lead': lead, 'data': data, 'basis': basis, 'source': source, 'as_of': as_of, 'draft': draft}


def _as_of_rec():
    return base_date().isoformat()


def _gen(name, key='generated'):
    try:
        d = _research(name)
        return str((d.get('meta') or {}).get(key) or d.get(key) or '')[:10]
    except Exception:   # noqa: BLE001
        return ''


# ---------------------------------------------------------------- builders: company records

def _pnl_last(rows, co, m=-1):
    return next((r for r in rows if r.get('co') == co and r.get('m') == m and r.get('team') in (None, '')), None)


def b_portfolio_scorecard(ctx):
    rows_all = _recs(ctx['role_id'], 'financials', 'pnl')
    cos = [c for c in COS if _pnl_last(rows_all, c)]
    rows, cells, below_e, below_r = [], [], [], []
    for c in cos:
        trend = [_pnl_last(rows_all, c, m) for m in range(-12, 0)]
        r = trend[-1]
        rows.append({'id': c, 'label': CO_SHORT[c], 'co': c, 'basis': REC})
        rev, prev = r['revenue_k'], r['plan_revenue_k']
        eb, peb = r['ebitda_k'], r['plan_ebitda_k']
        mg, pmg = eb / rev * 100 if rev else 0, peb / prev * 100 if prev else 0
        cells.append([
            {'value': round(rev), 'target': round(prev), 'status': _status(rev, prev), 'trend': [round(x['revenue_k']) for x in trend if x], 'est': True},
            {'value': round(eb), 'target': round(peb), 'status': _status(eb, peb), 'trend': [round(x['ebitda_k']) for x in trend if x], 'est': True},
            {'value': round(mg, 1), 'target': round(pmg, 1), 'status': _status(mg, pmg),
             'trend': [round(x['ebitda_k'] / x['revenue_k'] * 100, 1) for x in trend if x and x['revenue_k']], 'est': True}])
        if _status(eb, peb) != 'good':
            below_e.append(CO_SHORT[c])
        if _status(rev, prev) != 'good':
            below_r.append(CO_SHORT[c])
    cols = [{'id': 'revenue', 'label': 'Revenue', 'unit': '$k'}, {'id': 'ebitda', 'label': 'EBITDA', 'unit': '$k'},
            {'id': 'margin', 'label': 'EBITDA margin', 'unit': '%'}]
    mon = _month_name(-1)
    n = len(below_e)
    if n:
        lead = f"{n} of {len(cos)} companies are below EBITDA plan for {_mw(-1)}: {_and(below_e)}."
    else:
        lead = f"All {len(cos)} companies are on or above EBITDA plan for {_mw(-1)}."
    lead += f" Revenue is below plan at {len(below_r)}." if below_r else ' Revenue is on or above plan everywhere.'
    body = (f"{_and(below_e)} {'is' if n == 1 else 'are'} below EBITDA plan for {_mw(-1)}." if n
            else f'All six companies are on EBITDA plan for {_mw(-1)}.')
    return _res(f'Six companies against plan, {mon}', lead, _scorecard(rows, cols, cells), REC,
                f'{REC_LINE}: monthly profit and loss against plan, {_mon(-12, True)} to {_mon(-1, True)}. Modeled figures.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the off-plan list to the partners channel', 'body': body, 'channel_rx': 'partner|firm'})


def _and(xs):
    xs = [x for x in xs if x]
    if len(xs) <= 1:
        return ''.join(xs)
    return ', '.join(xs[:-1]) + ' and ' + xs[-1]


def b_company_scorecard(ctx):
    rid, co = ctx['role_id'], ctx['company']
    kp = [r for r in _recs(rid, 'financials', 'kpis') if r.get('co') == co and r.get('team') in (None, '') and isinstance(r.get('m'), int)]
    pnl = [r for r in _recs(rid, 'financials', 'pnl') if r.get('co') == co]
    months = [-3, -2, -1]
    cols = [{'id': str(m), 'label': _mon(m)} for m in months]
    rows, cells, off = [], [], []
    if pnl:
        for key, plan, label in (('revenue_k', 'plan_revenue_k', 'Revenue'), ('ebitda_k', 'plan_ebitda_k', 'EBITDA')):
            line = []
            for m in months:
                r = _pnl_last(pnl, co, m)
                if not r:
                    line.append(None)
                    continue
                st = _status(r[key], r[plan])
                line.append({'value': round(r[key]), 'target': round(r[plan]), 'status': st, 'est': True})
            trend = [round(x[key]) for x in (_pnl_last(pnl, co, m) for m in range(-12, 0)) if x]
            rows.append({'id': key.replace('_k', ''), 'label': label, 'unit': '$k', 'basis': REC, 'trend': trend})
            cells.append(line)
            last = line[-1]
            if last and last['status'] != 'good':
                off.append((abs(_pct_gap(last['value'], last['target'])), label, _num_words(last['value'], '$k'), _num_words(last['target'], '$k')))
    for kpi in CO_KPIS.get(co, ()):
        series = {r['m']: r for r in kp if r.get('kpi') == kpi}
        if not series:
            continue
        low = kpi in LOWER_IS_BETTER
        f = series.get(-1) or next(iter(series.values()))
        line = []
        for m in months:
            r = series.get(m)
            if not r:
                line.append(None)
                continue
            line.append({'value': r.get('value'), 'target': r.get('target'), 'status': _status(r.get('value'), r.get('target'), low), 'est': bool(r.get('est'))})
        rows.append({'id': kpi.replace('_', '-'), 'label': f.get('label') or kpi, 'unit': f.get('unit') or '', 'basis': REC,
                     'good': 'low' if low else 'high', 'trend': [series[m].get('value') for m in range(-12, 0) if m in series]})
        cells.append(line)
        last = line[-1]
        if last and last['status'] != 'good':
            off.append((abs(_pct_gap(last['value'], last['target'])), f.get('label') or kpi, _num_words(last['value'], f.get('unit')),
                        _num_words(last['target'], f.get('unit'))))
    off.sort(reverse=True)
    if off:
        w = off[0]
        lead = f"{len(off)} of {len(rows)} figures are off plan in {_mw(-1)}. {w[1]} is furthest off: {w[2]} against {w[3]}."
        body = f"{len(off)} of {len(rows)} figures are off plan for {_mw(-1)}. {w[1]} is furthest off: {w[2]} against {w[3]}."
    else:
        lead = f"All {len(rows)} figures are on plan in {_mw(-1)}."
        body = f"All {len(rows)} figures were on plan for {_mw(-1)}."
    return _res(f'{CO_SHORT[co]} against plan, {_mon(-3)} to {_mon(-1, True)}', lead, _scorecard(rows, cols, cells, 'target'), REC,
                f'{REC_LINE}: monthly results and KPIs against plan. Modeled figures.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the off-plan figures to leadership', 'body': body, 'channel_rx': 'leadership'})


def b_hub_scorecard(ctx):
    rid = ctx['role_id']
    kp = [r for r in _recs(rid, 'financials', 'kpis') if r.get('co') == 'pp' and r.get('team') and isinstance(r.get('m'), int)]
    hubs = sorted({r['team'] for r in kp}, key=lambda t: ('lancaster', 'york', 'harrisburg', 'toms-river').index(t)
                  if t in ('lancaster', 'york', 'harrisburg', 'toms-river') else 9)
    cols_def = (('revenue_k', 'Revenue', '$k'), ('jobs', 'Jobs', 'jobs'), ('callbacks', 'Callbacks', 'jobs'), ('memberships_sold', 'Memberships sold', 'plans'))
    cols = [{'id': k.replace('_', '-'), 'label': lab, 'unit': u} for k, lab, u in cols_def]
    rows, cells, misses = [], [], []
    for h in hubs:
        rows.append({'id': h, 'label': _team_label('pp', h), 'basis': REC})
        line = []
        for k, lab, u in cols_def:
            s = {r['m']: r for r in kp if r['team'] == h and r.get('kpi') == k}
            r = s.get(-1)
            if not r:
                line.append(None)
                continue
            st = _status(r.get('value'), r.get('target'), k in LOWER_IS_BETTER)
            line.append({'value': r.get('value'), 'target': r.get('target'), 'status': st, 'est': True,
                         'trend': [s[m].get('value') for m in range(-12, 0) if m in s]})
            if st != 'good':
                misses.append((abs(_pct_gap(r.get('value'), r.get('target'))), _team_label('pp', h), lab.lower()))
        cells.append(line)
    misses.sort(reverse=True)
    n_off = len({x[1] for x in misses})
    lead = (f"{n_off} of {len(hubs)} hubs missed at least one target in {_mw(-1)}. {misses[0][1]} is furthest off, on {misses[0][2]}."
            if misses else f"All {len(hubs)} hubs met their targets in {_mw(-1)}.")
    body = (f"Hub scorecard for {_mw(-1)}: {misses[0][1]} is furthest off plan, on {misses[0][2]}." if misses
            else f"Hub scorecard for {_mw(-1)}: every hub met its targets.")
    return _res(f'Hubs against plan, {_month_name(-1)}', lead, _scorecard(rows, cols, cells, 'target'), REC,
                f'{REC_LINE}: hub KPIs against target, {_mon(-12, True)} to {_mon(-1, True)}. Modeled figures.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the hub scorecard to leadership', 'body': body, 'channel_rx': 'leadership'})


def b_plan_bridge(ctx):
    rid, co = ctx['role_id'], ctx['company']
    r = _pnl_last(_recs(rid, 'financials', 'pnl'), co, -1)
    if not r:
        return None
    rev = r['revenue_k'] - r['plan_revenue_k']
    cogs = -(r['cogs_k'] - r['plan_cogs_k'])
    opex = -(r['opex_k'] - r['plan_opex_k'])
    steps = [{'label': 'Revenue', 'delta': round(rev), 'basis': REC}, {'label': 'Cost of work', 'delta': round(cogs), 'basis': REC}]
    pay = None
    if _scope(ctx['R'], 'adp', 'payroll'):
        pay = next((p for p in _recs(rid, 'adp', 'payroll') if p.get('co') == co and p.get('m') == -1), None)
    if pay and isinstance(pay.get('payroll_k'), (int, float)) and isinstance(pay.get('plan_k'), (int, float)):
        pd = -(pay['payroll_k'] - pay['plan_k'])
        steps += [{'label': 'Payroll', 'delta': round(pd), 'basis': REC}, {'label': 'Other operating costs', 'delta': round(opex - pd), 'basis': REC}]
    else:
        steps.append({'label': 'Operating costs', 'delta': round(opex), 'basis': REC})
    start, end = round(r['plan_ebitda_k']), round(r['ebitda_k'])
    # rounding: make the steps sum exactly to the gap
    gap = end - start - sum(s['delta'] for s in steps)
    if gap:
        big = max(steps, key=lambda s: abs(s['delta']))
        big['delta'] += gap
    diff = end - start
    worst = min(steps, key=lambda s: s['delta'])
    best = max(steps, key=lambda s: s['delta'])
    mon = _month_name(-1)
    if abs(diff) <= max(1, abs(start) * _tol() / 100):
        head = f"EBITDA was on plan in {_mw(-1)}, at ${end:,}k."
    else:
        head = f"EBITDA was ${abs(diff):,}k {'under' if diff < 0 else 'over'} plan in {_mw(-1)}."
    if worst['delta'] < 0:
        tail = f" {worst['label']} took ${abs(worst['delta']):,}k against plan."
        if best['delta'] > 0:
            tail += f" {best['label']} added ${best['delta']:,}k."
    else:
        tail = f" {best['label']} added the most, ${best['delta']:,}k."
    body = f"{_mw(-1)} EBITDA was ${end:,}k against a ${start:,}k plan.{tail}"
    who = 'controller'
    return _res(f'{CO_SHORT[co]} EBITDA, plan to actual, {mon}', head + tail,
                _bridge('$k', {'label': 'Plan EBITDA', 'value': start, 'basis': REC}, steps, {'label': 'Actual EBITDA', 'value': end, 'basis': REC}),
                REC, f'{REC_LINE}: {CO_SHORT[co]} profit and loss and payroll against plan, {_mon(-1, True)}. Modeled figures.', _as_of_rec(),
                {'action': 'reply_email', 'label': f'Reply to the {who} with the bridge', 'body': body, 'thread_rx': 'controller|close|results|board',
                 'fallback': {'action': 'chat_post', 'label': 'Post the bridge in the finance channel', 'body': body, 'channel_rx': 'finance|leadership'}})


HC_CLASSES = (('field', 'Field', r'technician|field|crew|distribution|warehouse|engineering'),
              ('service', 'Service and desk', r'desk|call center|customer service|billing|collections|project management|estimating|operations'),
              ('sales', 'Sales and marketing', r'sales|marketing|account|e-commerce|wholesale|retail'),
              ('office', 'Office and leadership', r'.'))


def b_open_roles(ctx):
    rows_all = _recs(ctx['role_id'], 'adp', 'headcount')
    cos = [c for c in COS if any(r.get('co') == c for r in rows_all)]
    rows, cells = [], []
    totals = {}
    for c in cos:
        rows.append({'id': c, 'label': CO_SHORT[c], 'basis': REC})
        line = {k: None for k, _, _ in HC_CLASSES}
        for r in rows_all:
            if r.get('co') != c:
                continue
            g = (r.get('group') or '').lower()
            if c == 'bpi' and g == 'staff':
                k = 'service'
            else:
                k = next(k for k, _, rx in HC_CLASSES if re.search(rx, g))
            line[k] = (line[k] or 0) + (r.get('open_roles') or 0)
        cells.append([line[k] for k, _, _ in HC_CLASSES])
        totals[c] = sum(v or 0 for v in line.values())
    top = max(totals, key=totals.get) if totals else None
    tot = sum(totals.values())
    topk = None
    if top:
        line = cells[cos.index(top)]
        topk = HC_CLASSES[max(range(len(line)), key=lambda i: line[i] or 0)][1].lower()
    lead = f"{tot} open roles across {len(cos)} companies. {CO_SHORT.get(top, '')} has the most, {totals.get(top, 0)}, mostly {topk}."
    return _res('Open roles by company and team type', lead,
                _heatmap('open roles', 'low', rows, [{'id': k, 'label': lab} for k, lab, _ in HC_CLASSES], cells), REC,
                f'{REC_LINE}: headcount and open roles by team, six companies. Modeled figures.', _as_of_rec(),
                {'action': 'calendar_hold', 'label': f'Hold 30 minutes with {CO_SHORT.get(top, "the company")} on hiring',
                 'body': f"Hiring review with {CO_SHORT.get(top, 'the company')}: {totals.get(top, 0)} open roles, mostly {topk}.", 'when': 'This week'})


def b_hub_callbacks(ctx):
    kp = [r for r in _recs(ctx['role_id'], 'financials', 'kpis') if r.get('co') == 'pp' and r.get('kpi') == 'callbacks' and r.get('team')]
    months = list(range(-6, 0))
    hubs = sorted({r['team'] for r in kp}, key=lambda t: ('lancaster', 'york', 'harrisburg', 'toms-river').index(t)
                  if t in ('lancaster', 'york', 'harrisburg', 'toms-river') else 9)
    rows, cells, sums = [], [], {}
    for h in hubs:
        s = {r['m']: r.get('value') for r in kp if r['team'] == h}
        rows.append({'id': h, 'label': _team_label('pp', h), 'basis': REC})
        cells.append([s.get(m) for m in months])
        sums[h] = sum(v or 0 for v in cells[-1])
    hi = max(sums, key=sums.get)
    lo = min(sums, key=sums.get)
    lead = (f"{_team_label('pp', hi)} has the most callbacks: {sums[hi]} in six months. "
            f"{_team_label('pp', lo)} has the fewest, {sums[lo]}.")
    return _res(f'Callbacks by hub, {_mon(-6)} to {_mon(-1, True)}', lead,
                _heatmap('jobs', 'low', rows, [{'id': str(m), 'label': _mon(m)} for m in months], cells), REC,
                f'{REC_LINE}: callbacks per hub, {_mon(-6, True)} to {_mon(-1, True)}. Modeled figures.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the callback heatmap to the hub managers',
                 'body': f"{_team_label('pp', hi)} had the most callbacks over six months: {sums[hi]}. Review the repeat visits this week.",
                 'channel_rx': 'ops|hub|operations|leadership'})


def b_crew_hours(ctx):
    projs = [p for p in _recs(ctx['role_id'], 'procore', 'projects') if p.get('daily')]
    days = list(range(-6, 1))
    scored = []
    for p in projs:
        by = {}
        for d in p.get('daily') or []:
            if isinstance(d.get('day'), int) and d['day'] in days:
                by[d['day']] = by.get(d['day'], 0) + (d.get('hours') or 0)
        if by:
            scored.append((sum(by.values()), p, by))
    scored.sort(key=lambda x: -x[0])
    top = scored[:8]
    rows = [{'id': _ref(p.get('id')), 'label': _clip(p.get('name'), 40), 'basis': REC, 'tag': p.get('health') or ''} for _, p, _ in top]
    cells = [[by.get(d) for d in days] for _, _, by in top]
    risk = [p for _, p, _ in scored if (p.get('health') or 'On track') != 'On track']
    if not top:
        return None
    lead = f"{_clip(top[0][1].get('name'), 40)} burned the most crew hours this week: {top[0][0]:,}."
    lead += f" {len(risk)} of {len(scored)} active projects are not on track." if risk else ' Every active project is on track.'
    return _res('Crew hours by project, last seven days', lead,
                _heatmap('hours', 'low', rows, [{'id': str(d), 'label': _short_date(d)} for d in days], cells), REC,
                f'{REC_LINE}: daily logs, crew and hours by project.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the at-risk projects to the project managers',
                 'body': (f"{len(risk)} projects are not on track this week. Top crew hours: {_clip(top[0][1].get('name'), 40)}, {top[0][0]:,} hours."),
                 'channel_rx': 'pm|project|ops|operations'})


AGE_BANDS = (('0-2', '0 to 2 days', 0, 2), ('3-7', '3 to 7 days', 3, 7), ('8-14', '8 to 14 days', 8, 14), ('15+', '15 days or more', 15, 10 ** 6))


def b_ticket_age(ctx):
    t = [x for x in _recs(ctx['role_id'], 'servicedesk', 'tickets') if x.get('status') != 'Resolved' and isinstance(x.get('opened_d'), int)]
    desks = sorted({x.get('team') for x in t if x.get('team')})
    rows, cells, old = [], [], {}
    for d in desks:
        mine = [x for x in t if x.get('team') == d]
        rows.append({'id': d, 'label': _team_label('fl', d), 'basis': REC})
        line = []
        for _, _, lo, hi in AGE_BANDS:
            n = sum(1 for x in mine if lo <= -x['opened_d'] <= hi)
            line.append(n)
        cells.append(line)
        old[d] = line[-1]
    worst = max(old, key=old.get)
    past = sum(1 for x in t if x.get('status') == 'Past due')
    lead = f"{_team_label('fl', worst)} has the oldest open tickets: {old[worst]} open 15 days or more. {past} tickets are past due."
    return _res('Open tickets by desk and age', lead,
                _heatmap('tickets', 'low', rows, [{'id': k, 'label': lab} for k, lab, _, _ in AGE_BANDS], cells), REC,
                f'{REC_LINE}: open service-desk tickets by desk and age.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the past-due count to the desk leads',
                 'body': f"{past} tickets are past due. {_team_label('fl', worst)} holds the most tickets open 15 days or more: {old[worst]}.",
                 'channel_rx': 'desk|ops|operations|service'})


ORDER_COLS = (('Picking', 'Picking'), ('On hold', 'On hold'), ('Late', 'Late'), ('Backordered', 'Backordered'))


def b_center_orders(ctx):
    o = _recs(ctx['role_id'], 'financials', 'orders')
    dcs = sorted({x.get('dc') for x in o if x.get('dc')}, key=lambda d: (d != 'Swedesboro', d))
    rows = [{'id': _ref(d), 'label': d, 'basis': REC} for d in dcs]
    cells = [[sum(1 for x in o if x.get('dc') == d and x.get('status') == s) for s, _ in ORDER_COLS] for d in dcs]
    behind = {d: cells[i][2] + cells[i][3] for i, d in enumerate(dcs)}
    w = max(behind, key=behind.get)
    lead = f"{w} is furthest behind: {behind[w]} orders late or backordered. {sum(behind.values())} are behind across {len(dcs)} centers."
    return _res('Open orders by center and status', lead, _heatmap('orders', 'low', rows, [{'id': s, 'label': lab} for s, lab in ORDER_COLS], cells),
                REC, f'{REC_LINE}: open sales orders by distribution center and status.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the late orders to the center leads',
                 'body': f"{w} has {behind[w]} orders late or backordered. Please clear the oldest first.", 'channel_rx': 'ops|center|distribution|operations'})


def b_office_utilization(ctx):
    kp = [r for r in _recs(ctx['role_id'], 'financials', 'kpis') if r.get('co') == 'bpi' and r.get('kpi') == 'utilization' and r.get('team')]
    months = list(range(-6, 0))
    offices = sorted({r['team'] for r in kp})
    rows, cells, last, target = [], [], {}, None
    for o in offices:
        s = {r['m']: r for r in kp if r['team'] == o}
        rows.append({'id': o, 'label': _team_label('bpi', o), 'basis': REC})
        cells.append([s[m].get('value') if m in s else None for m in months])
        if -1 in s:
            last[o] = s[-1].get('value')
            target = s[-1].get('target')
    hot = max(last, key=last.get)
    cold = min(last, key=last.get)
    lead = (f"{_team_label('bpi', hot)} runs hottest at {last[hot]}% in {_mw(-1)}; {_team_label('bpi', cold)} runs coldest at {last[cold]}%."
            + (f" Target is {target}%." if target is not None else ''))
    return _res(f'Utilization by office, {_mon(-6)} to {_mon(-1, True)}', lead,
                _heatmap('%', 'high', rows, [{'id': str(m), 'label': _mon(m)} for m in months], cells), REC,
                f'{REC_LINE}: billable utilization by office. Modeled figures.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the utilization heatmap to the office leads',
                 'body': f"{_team_label('bpi', hot)} ran at {last[hot]}% in {_mw(-1)}; {_team_label('bpi', cold)} at {last[cold]}%.",
                 'channel_rx': 'ops|office|operations|leadership'})


DEAL_STAGES = ('Sourced', 'Screening', 'IOI', 'LOI', 'Diligence')


def b_deal_stages(ctx):
    R = ctx['R']
    deals = [d for d in _recs(ctx['role_id'], 'dealcloud', 'deals') if d.get('stage') in DEAL_STAGES]
    label = (R.get('label') or '').lower()
    mine = [d for d in deals if ((d.get('owner') or {}).get('role') or '').lower() == label] or deals
    cards = []
    for d in sorted(mine, key=lambda d: (DEAL_STAGES.index(d['stage']), d.get('next_d') if isinstance(d.get('next_d'), int) else 999)):
        cards.append({'ref': _ref(d.get('id')), 'title': d.get('name') or '', 'amount': d.get('revenue_m'), 'stage': d['stage'],
                      'tag': CO_SHORT.get(d.get('fit_for'), ''), 'due': _rel(d['next_d']) if isinstance(d.get('next_d'), int) else '',
                      'owner': (d.get('owner') or {}).get('role') or '', 'next_step': d.get('next_step') or '', 'basis': REC, 'est': True})
    soon = sum(1 for d in mine if isinstance(d.get('next_d'), int) and 0 <= d['next_d'] <= 7)
    lead = f"{len(mine)} live deals. {soon} have a next step within a week."
    loi = next((d for d in mine if d['stage'] == 'LOI'), None)
    draft = ({'action': 'crm_stage', 'label': 'Move the LOI deal to Diligence', 'stage': 'Diligence', 'record': ('dealcloud', 'deals', loi),
              'body': f"Move {loi.get('name')} to Diligence once LOI terms are settled."} if loi else None)
    return _res('Live deals by stage', lead,
                _board('$M', 'revenue', [{'id': s, 'label': s, 'count': sum(1 for c in cards if c['stage'] == s)} for s in DEAL_STAGES], cards),
                REC, f'{REC_LINE}: deal list with stage and next step. Revenue figures are estimates.', _as_of_rec(), draft)


JOB_STAGES = ('Unassigned', 'Scheduled', 'En route', 'Running late', 'On site', 'Done')


def b_today_jobs(ctx):
    rid, R = ctx['role_id'], ctx['R']
    w = _ws()
    jobs = [j for j in _recs(rid, 'servicetitan', 'jobs') if j.get('day') == 0]
    team = R.get('team')
    if team and _scope(R, 'servicetitan', 'jobs') == 'team':
        jobs = [j for j in jobs if j.get('team') == team]
    techs = {t.get('id'): t for t in w._st().get('technicians') or []}
    cards = []
    for j in sorted(jobs, key=lambda j: (JOB_STAGES.index(j['status']) if j.get('status') in JOB_STAGES else 9, j.get('start') or '')):
        c = w._customer(j.get('customer')) or {}
        t = techs.get(j.get('tech')) or {}
        tname = '' if not t else (w._tech_name(t) if hasattr(w, '_tech_name') else (t.get('name') or ''))
        cards.append({'ref': _ref(j.get('id')), 'title': f"{j.get('type') or 'Job'}, {(c.get('address') or {}).get('town') or ''}".strip(', '),
                      'stage': j.get('status') if j.get('status') in JOB_STAGES else 'Scheduled', 'tag': j.get('trade') or '',
                      'due': w.clock(j.get('start')) if j.get('start') else '', 'owner': tname or 'To be assigned',
                      'next_step': 'Member' if j.get('member') else '', 'amount': j.get('value'), 'basis': REC, 'urgent': bool(j.get('urgent'))})
    un = [j for j in jobs if j.get('status') == 'Unassigned']
    late = sum(1 for j in jobs if j.get('status') == 'Running late')
    hub = _team_label('pp', team) or 'your hub'
    lead = f"{len(jobs)} jobs today at {hub}. {len(un)} wait for a technician; {late} running late."
    first = sorted(un, key=lambda j: (not j.get('member'), not j.get('urgent'), j.get('start') or ''))[0] if un else None
    draft = None
    if first:
        draft = {'action': 'book_job', 'label': 'Assign the waiting member job to a technician' if first.get('member') else 'Assign the waiting job to a technician',
                 'record': ('servicetitan', 'jobs', first), 'when': f"Today {w.clock(first.get('start'))}".strip(),
                 'body': f"{first.get('type') or 'Job'}: assign the next free technician."}
    return _res(f'Today at {hub}', lead,
                _board('$', 'ticket value', [{'id': s, 'label': s, 'count': sum(1 for c in cards if c['stage'] == s)} for s in JOB_STAGES], cards),
                REC, f'{REC_LINE}: today\'s jobs, status and technician.', _as_of_rec(), draft)


TICKET_STAGES = ('New', 'In progress', 'Waiting on client', 'Past due')


def b_my_tickets(ctx):
    w = _ws()
    t = [x for x in _recs(ctx['role_id'], 'servicedesk', 'tickets') if x.get('status') in TICKET_STAGES]
    pr = {'P1': 0, 'P2': 1, 'P3': 2, 'P4': 3}
    t.sort(key=lambda x: (x.get('status') != 'Past due', pr.get(x.get('priority'), 9), x.get('opened_d') or 0))
    cards = [{'ref': _ref(x.get('id')), 'title': f"{x.get('number')}, {_clip(w.tok(x.get('subject') or ''), 40)}", 'stage': x['status'],
              'tag': x.get('priority') or '', 'due': f"opened {_rel(x['opened_d'])}" if isinstance(x.get('opened_d'), int) else '',
              'owner': _clip(x.get('client'), 30), 'basis': REC} for x in t]
    past = [x for x in t if x['status'] == 'Past due']
    oldest = max((-x['opened_d'] for x in t if isinstance(x.get('opened_d'), int)), default=0)
    lead = f"{len(t)} open tickets. {len(past)} are past due; the oldest opened {oldest} days ago."
    top = t[0] if t else None
    draft = ({'action': 'ticket_update', 'label': 'Update the first past-due ticket' if past else 'Update the first open ticket', 'stage': 'In progress',
              'record': ('servicedesk', 'tickets', top), 'body': 'Working on this now. I will confirm the fix with you today.'} if top else None)
    return _res('Your open tickets', lead,
                _board('', '', [{'id': s, 'label': s, 'count': sum(1 for c in cards if c['stage'] == s)} for s in TICKET_STAGES], cards),
                REC, f'{REC_LINE}: your service-desk tickets by status.', _as_of_rec(), draft)


CREW_STAGES = (('lead', 'Project lead'), ('foreman', 'Foreman'), ('crew', 'Crew'), ('rfi', 'Open RFIs'))


def b_site_crew(ctx):
    projs = [p for p in _recs(ctx['role_id'], 'procore', 'projects') if p.get('crew_today')]
    rid = ctx['role_id']
    projs.sort(key=lambda p: (rid not in (p.get('for') or ()), any(x.get('name') != 'You' for x in []), p.get('next_d') or 999))
    if not projs:
        return None
    p = projs[0]
    cards = []
    pm = p.get('pm') or {}
    if pm:
        cards.append({'ref': _ref(p.get('id'), 'pm'), 'title': pm.get('name') or 'Project manager', 'stage': 'lead',
                      'owner': pm.get('role') or 'Project manager', 'basis': REC})
    foreman = None
    for x in p.get('crew_today') or []:
        st = 'foreman' if 'foreman' in (x.get('role') or '').lower() else 'crew'
        if st == 'foreman' and not foreman:
            foreman = x.get('name')
        cards.append({'ref': _ref(p.get('id'), x.get('name'), x.get('role')), 'title': x.get('name') or '', 'stage': st,
                      'owner': x.get('role') or '', 'basis': REC})
    rfis = [r for r in p.get('rfis') or [] if r.get('status') == 'Open']
    for r in rfis:
        cards.append({'ref': _ref(p.get('id'), r.get('n')), 'title': f"{r.get('n')}: {r.get('subject')}", 'stage': 'rfi',
                      'due': f"due {_rel(r['due_d'])}" if isinstance(r.get('due_d'), int) else '', 'basis': REC})
    if p.get('owner_name'):
        cards.append({'ref': _ref(p.get('id'), 'owner'), 'title': p['owner_name'], 'stage': 'lead', 'owner': 'Owner', 'basis': REC})
    n = sum(1 for c in cards if c['stage'] in ('crew', 'foreman'))
    lead = f"{_clip(p.get('name'), 40)} today: {n} on the crew" + (f", with {foreman} as foreman." if foreman else '.')
    if rfis:
        lead += (f" One RFI is open: {_clip(rfis[0].get('subject'), 40).lower()}." if len(rfis) == 1 else
                 f" {len(rfis)} RFIs are open; first: {_clip(rfis[0].get('subject'), 40).lower()}.")
    return _res(f"Today's site: {_clip(p.get('name'), 40)}", lead,
                _board('', '', [{'id': k, 'label': lab, 'count': sum(1 for c in cards if c['stage'] == k)} for k, lab in CREW_STAGES], cards),
                REC, f"{REC_LINE}: today's crew, project lead and open RFIs.", _as_of_rec(),
                {'action': 'daily_log', 'label': "Add today's work to the daily log", 'record': ('procore', 'projects', p), 'when': f'Crew of {n}, today',
                 'body': "Today's work: (add what the crew finished)."})


def b_due_dates(ctx):
    rid = ctx['role_id']
    bars = []
    for d in _recs(rid, 'financials', 'debt'):
        if isinstance(d.get('next_test_d'), int) and d['next_test_d'] >= 0:
            bars.append({'ref': _ref(d.get('id')), 'label': f"{CO_SHORT.get(d.get('co'), '')} covenant test", 'value': d['next_test_d'],
                         'sub': _clip(d.get('covenant'), 40), 'status': 'bad' if d['next_test_d'] <= 21 else ('warn' if d['next_test_d'] <= 45 else 'good'),
                         'basis': REC})
    if _scope(ctx['R'], 'financials', 'fund'):
        for f in _recs(rid, 'financials', 'fund'):
            if isinstance(f.get('next_report_d'), int):
                bars.append({'ref': _ref(f.get('id')), 'label': f"{f.get('fund')} investor report", 'value': f['next_report_d'], 'sub': 'Quarterly report',
                             'status': 'warn' if f['next_report_d'] <= 45 else 'good', 'basis': REC})
    if _scope(ctx['R'], 'financials', 'packs'):
        late = [p for p in _recs(rid, 'financials', 'packs') if p.get('status') in ('Late', 'Due')]
        for p in late:
            bars.append({'ref': _ref(p.get('id')), 'label': f"{CO_SHORT.get(p.get('company'), '')} reporting pack", 'value': 0,
                         'sub': f"{p.get('status')} for {_mon(p.get('m') or -1)}", 'status': 'bad' if p.get('status') == 'Late' else 'warn', 'basis': REC})
    bars.sort(key=lambda b: b['value'])
    within = [b for b in bars if b['value'] <= 45]
    if not bars:
        return None
    first = next((b for b in bars if 'covenant' in b['label']), bars[0])
    lead = f"{len(within)} tests and reports fall within 45 days. {first['label'].replace(' covenant test', '')}'s covenant test comes first, {_rel(first['value'])}."
    return _res('Tests and reports due in the next 45 days', lead,
                _bars('days', 'days away', bars, threshold={'value': 45, 'label': '45 days'}), REC,
                f'{REC_LINE}: covenant test dates, the fund report date and reporting packs. Modeled figures.', _as_of_rec(),
                {'action': 'calendar_hold', 'label': 'Hold prep time before the first covenant test', 'when': _short_date(max(0, first['value'] - 3)),
                 'body': f"Prepare the {first['label']}: compliance certificate and leverage calculation."})


def b_project_dates(ctx):
    rid = ctx['role_id']
    bars = []
    for p in _recs(rid, 'procore', 'projects'):
        if rid not in (p.get('for') or ()) and _scope(ctx['R'], 'procore', 'projects') == 'own':
            continue
        name = _clip(p.get('name'), 32)
        if isinstance(p.get('next_d'), int) and 0 <= p['next_d'] <= 14:
            bars.append({'ref': _ref(p.get('id'), 'm'), 'label': f"{name}: {_clip(p.get('next_milestone'), 30).lower()}", 'value': p['next_d'],
                         'sub': 'Milestone', 'status': 'warn' if p['next_d'] <= 3 else 'good', 'basis': REC})
        for i in p.get('inspections') or []:
            if isinstance(i.get('day'), int) and 0 <= i['day'] <= 14:
                bars.append({'ref': _ref(p.get('id'), i.get('kind'), i.get('day')), 'label': f"{name}: {_clip(i.get('kind') or i.get('what') or 'inspection', 30).lower()}",
                             'value': i['day'], 'sub': 'Inspection', 'status': 'warn' if i['day'] <= 3 else 'good', 'basis': REC})
        for r in p.get('rfis') or []:
            if r.get('status') == 'Open' and isinstance(r.get('due_d'), int) and r['due_d'] <= 14:
                bars.append({'ref': _ref(p.get('id'), r.get('n')), 'label': f"{name}: {r.get('n')}, {_clip(r.get('subject'), 30).lower()}",
                             'value': max(0, r['due_d']), 'sub': 'RFI answer due' + (' (overdue)' if r['due_d'] < 0 else ''),
                             'status': 'bad' if r['due_d'] <= 2 else 'warn', 'basis': REC})
    bars.sort(key=lambda b: b['value'])
    bars = bars[:10]
    if not bars:
        return None
    lead = f"{len(bars)} dates fall in the next two weeks. First: {bars[0]['label'].split(': ', 1)[-1]}, {_rel(bars[0]['value'])}."
    rfi = next((b for b in bars if b['sub'].startswith('RFI')), None)
    projs = [p for p in _recs(rid, 'procore', 'projects') if rid in (p.get('for') or ())]
    open_rfi = next(((p, r) for p in projs for r in p.get('rfis') or [] if r.get('status') == 'Open'), None)
    draft = ({'action': 'rfi', 'label': f"Draft an RFI to close the open {open_rfi[1].get('subject', '').lower()} question"[:90],
              'record': ('procore', 'projects', open_rfi[0]), 'when': _short_date(max(1, open_rfi[1].get('due_d') or 3)),
              'body': f"Please confirm the {open_rfi[1].get('subject', '').lower()} so the crew can proceed."} if open_rfi else
             {'action': 'calendar_hold', 'label': 'Hold time to prepare the first milestone', 'when': 'This week', 'body': 'Prepare for the next milestone.'})
    del rfi
    return _res('Due on your projects in the next two weeks', lead, _bars('days', 'days away', bars, threshold={'value': 14, 'label': 'Two weeks'}), REC,
                f'{REC_LINE}: milestones, inspections and RFIs on your projects.', _as_of_rec(), draft)


def b_invoice_rejections(ctx):
    inv = [x for x in _recs(ctx['role_id'], 'financials', 'invoices') if x.get('status') in ('Rejected', 'Appealed') and x.get('reason')]
    by = {}
    for x in inv:
        a = by.setdefault(x['reason'], {'v': 0, 'n': 0, 'top': None})
        a['v'] += x.get('amount') or 0
        a['n'] += 1
        if not a['top'] or (x.get('amount') or 0) > (a['top'].get('amount') or 0):
            a['top'] = x
    bars = [{'ref': _ref('reason', k), 'label': k, 'value': v['v'], 'sub': f"{v['n']} invoices", 'basis': REC}
            for k, v in sorted(by.items(), key=lambda kv: -kv[1]['v'])]
    total = sum(b['value'] for b in bars)
    big = max(inv, key=lambda x: x.get('amount') or 0) if inv else None
    if not bars:
        return None
    lead = f"{_m(total)} is stuck in {len(inv)} rejected or appealed invoices. {bars[0]['label']} holds the most, {_m(bars[0]['value'])}."
    client = (big or {}).get('client') or ''
    return _res('Rejected invoices by reason', lead, _bars('$', 'stuck', bars), REC,
                f'{REC_LINE}: invoices rejected or under appeal, by rejection reason.', _as_of_rec(),
                {'action': 'reply_email', 'label': 'Reply to the client about the largest rejected invoice',
                 'thread_rx': re.escape(client.split(' ')[0]) + '|rejected invoice|appeal' if client else 'rejected invoice|appeal',
                 'body': (f"Invoice {big.get('number')} for {_money(big.get('amount'))} was rejected: {big.get('reason', '').lower()}. "
                          'We will correct and resubmit it this week.') if big else 'We will correct and resubmit the rejected invoice this week.'})


def b_slipping_accounts(ctx):
    rid = ctx['role_id']
    acc = [a for a in _recs(rid, 'salesforce', 'accounts') if isinstance(a.get('last_order_d'), int)]
    orders = _recs(rid, 'financials', 'orders') if _scope(ctx['R'], 'financials', 'orders') else []
    val = {}
    for o in orders:
        val[o.get('account')] = val.get(o.get('account'), 0) + (o.get('value') or 0)
    acc.sort(key=lambda a: a['last_order_d'])
    bars = [{'ref': _ref(a.get('id')), 'label': a.get('name') or '', 'value': -a['last_order_d'],
             'sub': f"{_m(val.get(a.get('name'), 0))} ordered on record" + (f" · {a.get('health')}" if a.get('health') else ''),
             'status': 'bad' if -a['last_order_d'] > 60 else ('warn' if -a['last_order_d'] > 30 else 'good'), 'basis': REC} for a in acc[:8]]
    if not bars:
        return None
    slip = sum(1 for a in acc if -a['last_order_d'] > 30)
    lead = f"{slip} of your {len(acc)} accounts have not ordered in 30 days. {bars[0]['label']} is longest, at {bars[0]['value']} days."
    return _res('Accounts by days since the last order', lead, _bars('days', 'days since last order', bars, threshold={'value': 30, 'label': '30 days'}),
                REC, f'{REC_LINE}: your accounts, last order date and orders on record.', _as_of_rec(),
                {'action': 'calendar_hold', 'label': f"Hold time to call {_clip(bars[0]['label'], 40)}", 'when': 'Tomorrow',
                 'body': f"Reorder call: {bars[0]['label']}, no order in {bars[0]['value']} days."})


def b_stock_cover(ctx):
    inv = [x for x in _recs(ctx['role_id'], 'financials', 'inventory') if isinstance(x.get('days_cover'), (int, float))]
    inv.sort(key=lambda x: x['days_cover'])
    bars = [{'ref': _ref(x.get('id')), 'label': _clip(x.get('name'), 40), 'value': round(x['days_cover'], 1),
             'sub': f"{x.get('on_hand')} on hand · reorder at {x.get('reorder_point')} · {x.get('on_order')} on order",
             'status': 'bad' if (x.get('on_hand') or 0) <= (x.get('reorder_point') or 0) else ('warn' if x['days_cover'] < 14 else 'good'), 'basis': REC}
            for x in inv[:8]]
    if not bars:
        return None
    dc = inv[0].get('dc') or 'the center'
    under = sum(1 for x in inv if (x.get('on_hand') or 0) <= (x.get('reorder_point') or 0))
    lead = f"{_clip(inv[0].get('name'), 40)} runs out first at {dc}: {bars[0]['value']} days of cover. {under} items sit at or under their reorder point."
    return _res(f'What runs out first at {dc}', lead, _bars('days', 'days of cover', bars, threshold={'value': 14, 'label': 'Two weeks'}), REC,
                f'{REC_LINE}: stock on hand, on order and reorder points at {dc}.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the five lowest items to purchasing',
                 'body': 'Lowest cover: ' + '; '.join(f"{b['label']} {b['value']} days" for b in bars[:5]) + '.', 'channel_rx': 'purchas|ops|warehouse|center|swedesboro'})


def b_retainer_hours(ctx):
    acc = [a for a in _recs(ctx['role_id'], 'salesforce', 'accounts') if isinstance(a.get('hours_used'), (int, float)) and a.get('hours_plan')]
    over = [a for a in acc if a['hours_used'] > a['hours_plan']]
    over.sort(key=lambda a: -(a['hours_used'] / a['hours_plan']))
    show = over[:8] or sorted(acc, key=lambda a: -(a['hours_used'] / a['hours_plan']))[:8]
    bars = [{'ref': _ref(a.get('id')), 'label': a.get('name') or '', 'value': a['hours_used'], 'plan': a['hours_plan'],
             'sub': f"{round((a['hours_used'] / a['hours_plan'] - 1) * 100)}% over" + (f" · renews {_rel(a['renewal_d'])}" if isinstance(a.get('renewal_d'), int) else ''),
             'status': 'bad' if a['hours_used'] > a['hours_plan'] * 1.1 else 'warn', 'basis': REC} for a in show]
    if not bars:
        return None
    top = show[0]
    lead = (f"{len(over)} retainers have used more hours than planned. {top.get('name')} is furthest over, at {top['hours_used']:,} of {top['hours_plan']:,} hours."
            if over else 'No retainer is over its hours plan.')
    return _res('Retainers over their hours plan', lead, _bars('hours', 'hours used', bars, plan_label='plan'), REC,
                f'{REC_LINE}: retainer hours used and planned, by account.', _as_of_rec(),
                {'action': 'reply_email', 'label': 'Send the client a status note on hours', 'thread_rx': 'hour|scope|retainer',
                 'body': f"A quick status note: {top['hours_used']:,} of {top['hours_plan']:,} planned hours are used. Can we agree the scope for the rest of the term?"})


def b_returns(ctx):
    r = _recs(ctx['role_id'], 'shopify', 'returns')
    by = {}
    for x in r:
        a = by.setdefault(x.get('reason') or 'Other', {'n': 0, 'top': None})
        a['n'] += x.get('count_30d') or 0
        if not a['top'] or (x.get('count_30d') or 0) > (a['top'].get('count_30d') or 0):
            a['top'] = x
    bars = [{'ref': _ref('ret', k), 'label': k, 'value': v['n'], 'sub': f"Most: {_clip((v['top'] or {}).get('product'), 34)}", 'basis': REC}
            for k, v in sorted(by.items(), key=lambda kv: -kv[1]['n'])][:8]
    if not bars:
        return None
    tot = sum(v['n'] for v in by.values())
    defect = next((b for b in bars if b['label'].lower().startswith('defect')), None)
    lead = f"{tot:,} returns in 30 days. {bars[0]['label']} leads with {bars[0]['value']:,}."
    if defect:
        lead += f" The top defect is {defect['label'].split(': ', 1)[-1].lower()}, {defect['value']:,} returns."
    return _res('Returns by reason, last 30 days', lead, _bars('returns', 'returns', bars), REC,
                f'{REC_LINE}: returns by reason and product, last 30 days.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the top defect to the product team',
                 'body': (f"Top defect in 30 days: {defect['label'].split(': ', 1)[-1].lower()}, {defect['value']} returns. {defect['sub']}." if defect
                          else f"Top return reason in 30 days: {bars[0]['label'].lower()}."), 'channel_rx': 'product|design|ops|operations'})


def b_weeks_cover(ctx):
    p = [x for x in _recs(ctx['role_id'], 'shopify', 'products') if isinstance(x.get('weeks_cover'), (int, float))]
    p.sort(key=lambda x: x['weeks_cover'])
    bars = [{'ref': _ref(x.get('id')), 'label': _clip(x.get('name'), 40), 'value': x['weeks_cover'],
             'sub': f"{x.get('inventory')} units · {x.get('sell_through_pct')}% sold through", 'status': 'bad' if x['weeks_cover'] <= 2 else 'warn', 'basis': REC}
            for x in p[:8]]
    if not bars:
        return None
    n = sum(1 for x in p if x['weeks_cover'] <= 2)
    lead = f"{n} products sell out within two weeks at today's pace. {bars[0]['label']} has {bars[0]['value']} weeks left."
    return _res('Products closest to selling out', lead, _bars('weeks', 'weeks of cover', bars, threshold={'value': 2, 'label': 'Two weeks'}), REC,
                f'{REC_LINE}: store products, stock and sell-through.', _as_of_rec(),
                {'action': 'chat_post', 'label': 'Post the low-stock list to merchandising',
                 'body': 'Selling out within two weeks: ' + '; '.join(f"{b['label']} ({b['value']} weeks)" for b in bars[:5] if b['value'] <= 2) + '.',
                 'channel_rx': 'merch|product|ecommerce|e-commerce'})


# ---------------------------------------------------------------- builders: public data

def _all_targets():
    out = []
    for f in ('ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts'):
        try:
            d = _research(f)
        except Exception:   # noqa: BLE001
            continue
        for i in d.get('items') or []:
            co = {'frontline': 'fl', 'thomas_scientific': 'ts'}.get(i.get('platform')) or f.split('_')[-1]
            co = co if co in COS else ('pp' if f.endswith('pp') else 'cet')
            if isinstance(i.get('fit_score'), (int, float)):
                out.append(dict(i, _co=co, _file=f))
    return out


def b_addon_targets(ctx):
    co = ctx['args'].get('company')
    items = [i for i in _all_targets() if not co or i['_co'] == co]
    items.sort(key=lambda i: (-i['fit_score'], i.get('company') or ''))
    top = items[:8]
    if not top:
        return None
    bars = []
    for i in top:
        place = ', '.join(x for x in (i.get('hq_city'), i.get('state') or i.get('hq_state')) if x)
        sub = ' · '.join(x for x in (CO_SHORT[i['_co']] + ' add-on' if not co else '', place,
                                     f"est. revenue {_m(i['revenue_est_usd'])}" if isinstance(i.get('revenue_est_usd'), (int, float)) else '',
                                     f"{i['employees']} staff" if isinstance(i.get('employees'), int) else '') if x)
        bars.append({'ref': _ref(i.get('id')), 'label': _clip(i.get('company'), 48), 'value': i['fit_score'], 'sub': sub, 'basis': EST,
                     'co': i['_co'], 'lat': i.get('lat'), 'lon': i.get('lon')})
    a = bars[0]
    who = f"a {CO_SHORT[top[0]['_co']]} add-on" if not co else f"for {CO_SHORT[co]}"
    lead = (f"{_short_name(a['label'])} leads at {a['value']} of 100, {who}. {_short_name(bars[1]['label'])} and "
            f"{_short_name(bars[2]['label'])} follow.") if len(bars) >= 3 else f"{_short_name(a['label'])} leads at {a['value']} of 100."
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{_clip(a['label'], 32)} leads at {a['value']} of 100, {who}. Eight best fits are shown."
    title = f"Best add-on targets{' for ' + CO_SHORT[co] if co else ', all companies'}"
    data = _bars('pts', 'fit score', bars, max_=100)
    data['globe'] = f'best3-{co}' if co in ('pp', 'cet', 'fl', 'ts') else ('best3' if not co else '')
    gen = max(_gen(f) for f in ('ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts'))
    return _res(title, lead, data, EST,
                'Add-on target screens: company search estimates checked against each firm\'s own site and public sources. Fit score out of 100.',
                gen, {'action': 'chat_post', 'label': 'Post the top three targets to the deal team',
                      'body': 'Top add-on fits: ' + '; '.join(f"{b['label']} ({b['value']})" for b in bars[:3]) + '.', 'channel_rx': 'deal|firm'})


def _mark_and_maturity(kf, entity=''):
    """(mark % of face, earliest term maturity, spread, borrower prefix) from one loan schedule's key figures.
    A schedule that lists several borrowers ("Apex / Any Hour") keys their figures by name: the mark keeps its own borrower."""
    ent = re.sub(r'[^a-z ]', ' ', (entity or '').lower())

    def prefix(k):
        parts = k.split('_')
        for n in (2, 1):
            p = ' '.join(parts[:n])
            if len(p) > 3 and f' {p} ' in f' {ent} ' and p not in ('tl', 'mark'):
                return '_'.join(parts[:n])
        return ''
    marks = [(k, v) for k, v in kf.items() if 'mark' in k and isinstance(v, (int, float)) and 50 <= v <= 101]
    mark, pre = None, ''
    if marks:
        dated = sorted((k for k, _ in marks if re.search(r'20\d\d', k)), reverse=True)
        k = dated[0] if dated else marks[0][0]
        mark, pre = kf[k], prefix(k)
    else:
        for k, v in kf.items():
            if k.endswith('fair_value_usd') and isinstance(v, (int, float)):
                par = kf.get(k.replace('fair_value_usd', 'par_usd'))
                if isinstance(par, (int, float)) and par:
                    mark, pre = round(v / par * 100, 1), prefix(k)
                    break
    keys = [k for k in kf if not pre or k.startswith(pre)]
    mat = None
    for k in keys:
        v = kf[k]
        if 'maturity' in k and 'revolver' not in k and isinstance(v, str) and re.match(r'20\d\d', v):
            mat = v if mat is None else min(mat, v)
    spread = next((kf[k] for k in keys if 'spread' in k and isinstance(kf[k], str)), '')
    return mark, mat, spread, pre


def b_rival_loans(ctx):
    d = _research('rival_filings')
    best = {}
    for i in d.get('items') or []:
        if i.get('category') != 'bdc_loan_schedule':
            continue
        mark, mat, spread, pre = _mark_and_maturity(i.get('key_figures') or {}, i.get('entity'))
        if mark is None:
            continue
        name = pre.replace('_', ' ').title() if pre else re.split(r'\s*[(/]', i.get('entity') or '')[0].strip().rstrip(',')
        name = re.sub(r',?\s*(LLC|Inc\.?|LP|L\.P\.)$', '', name).strip()
        cur = best.get(name)
        if not cur or mark < cur['mark']:
            best[name] = {'mark': mark, 'mat': mat, 'spread': spread, 'id': i.get('id')}
    rows = sorted(best.items(), key=lambda kv: kv[1]['mark'])[:10]
    bars = [{'ref': _ref(v['id']), 'label': k, 'value': round(v['mark'], 1),
             'sub': ' · '.join(x for x in (f"matures {_iso_month(v['mat'])}" if v['mat'] else '', _clip(v['spread'], 34)) if x),
             'status': 'bad' if v['mark'] < 93 else ('warn' if v['mark'] < 98 else 'good'), 'basis': PUBLIC} for k, v in rows]
    if not bars:
        return None
    under = sum(1 for v in best.values() if v['mark'] < 95)
    lead = f"{bars[0]['label']} is marked lowest, at {bars[0]['value']}% of face. {under} of {len(best)} rival borrowers are marked under 95."
    return _res('Rival loans by lender mark', lead, _bars('%', 'lender mark, % of face', bars, max_=100, threshold={'value': 95, 'label': '95% of face'}),
                PUBLIC, 'Business development company loan schedules (SEC filings): fair value against face, rate and maturity.', _gen('rival_filings'),
                {'action': 'chat_post', 'label': 'Post the stressed rivals to the partners channel',
                 'body': 'Rivals with loans marked under 95: ' + '; '.join(f"{b['label']} ({b['value']}%)" for b in bars if b['value'] < 95)[:300] + '.',
                 'channel_rx': 'partner|firm'})


def _iso_month(s):
    try:
        y, m = str(s)[:7].split('-')
        return datetime.date(int(y), int(m), 1).strftime('%b %Y')
    except (ValueError, TypeError):
        return str(s)[:4]


def b_deal_bridge(ctx):
    import dealmath   # lazy, like workspace
    co = ctx['args'].get('company') or ctx['company'] or 'pp'
    p = next((x for x in dealmath.presets().get('presets') or [] if x.get('co') == co and x.get('group') == 'portfolio'), None)
    if not p:
        return None
    L = dealmath.lbo(p['vals'])
    eq0 = L['totalEq']
    steps = [{'label': n, 'delta': round(v, 1), 'basis': EST} for n, v in L['bridge']]
    end = round(L['exitEq'], 1)
    start = round(eq0, 1)
    gap = round(end - start - sum(s['delta'] for s in steps), 1)
    if abs(gap) >= 0.1:
        steps.append({'label': 'Other', 'delta': gap, 'basis': EST})
    top = max(steps, key=lambda s: s['delta'])
    moic = L.get('moic')
    lead = (f"Base case: ${start:,.1f}M in, ${end:,.1f}M out in year {L['N']}" + (f", {moic:.1f}x." if moic else '.')
            + f" {top['label']} adds the most, ${top['delta']:,.1f}M.")
    return _res(f"{CO_SHORT[co]}: where the gain comes from", lead,
                _bridge('$M', {'label': 'Equity in', 'value': start, 'basis': EST}, steps, {'label': 'Equity out', 'value': end, 'basis': EST}),
                EST, f"Acquisition model preset for {CO_SHORT[co]}: size from public estimates, market benchmarks for price and debt.",
                str(dealmath.presets().get('generated') or '')[:10],
                {'action': 'chat_post', 'label': 'Post the bridge in the deal team channel',
                 'body': f"{CO_SHORT[co]} base case: ${start:,.1f}M in, ${end:,.1f}M out. {top['label']} adds ${top['delta']:,.1f}M.", 'channel_rx': 'deal|firm'})


def b_fund_raised(ctx):
    f = _research('bsp_firm').get('firm') or {}
    fd = f.get('capital_raised_sec_form_d') or {}
    bars = []
    if isinstance(fd.get('broad_sky_partners_lp_total_sold_usd'), (int, float)):
        bars.append({'ref': _ref('main-fund'), 'label': 'Main fund', 'value': round(fd['broad_sky_partners_lp_total_sold_usd'] / 1e6, 1),
                     'sub': f"{fd.get('investors')} investors · filed {_iso_short(fd.get('as_of'))}, {str(fd.get('as_of'))[:4]}", 'basis': PUBLIC})
    veh = {}
    for v in fd.get('deal_vehicles') or []:
        if isinstance(v.get('sold_usd'), (int, float)) and str(v.get('vehicle') or '').startswith('BSP'):
            k = next((CO_SHORT[c] for c, rx in (('ts', 'Thomas'), ('bpi', 'Bully|BPI'), ('fl', 'Frontline'), ('cet', 'Commonwealth|CET'),
                                                ('pp', 'Punctual'), ('fh', 'Fair Harbor')) if re.search(rx, v.get('company') or '')), v.get('company'))
            veh[k] = veh.get(k, 0) + v['sold_usd']
    for k, v in sorted(veh.items(), key=lambda kv: -kv[1]):
        bars.append({'ref': _ref('veh', k), 'label': f'{k} vehicles', 'value': round(v / 1e6, 1), 'sub': 'Deal and co-invest vehicles', 'basis': PUBLIC})
    if not bars:
        return None
    side = round(sum(veh.values()) / 1e6, 1)
    lead = (f"Form D filings show ${bars[0]['value']:,.1f}M raised for the main fund from {fd.get('investors')} investors. "
            f"Deal vehicles add ${side:,.1f}M across {len(veh)} companies.")
    return _res('Capital raised, by vehicle', lead, _bars('$M', 'raised', bars), PUBLIC,
                'SEC Form D filings for the main fund and each deal and co-invest vehicle.', str(f.get('retrieved') or fd.get('as_of') or '')[:10],
                {'action': 'reply_email', 'label': 'Reply to the investor with the fund figures', 'thread_rx': 'investor|question|LP|fund',
                 'body': (f"Thank you for the question. The main fund's latest Form D reports ${bars[0]['value']:,.1f}M raised from "
                          f"{fd.get('investors')} investors.")})


CET_STAGE = (('open', 'Open bids'), ('planned', 'Planned'), ('recurring', 'Programs'), ('awarded', 'Awarded'))


def b_public_bids(ctx):
    d = _research('cet_opportunities')
    today = base_date().isoformat()
    # an open bid whose due date has passed is closed: it leaves the board
    it = [i for i in d.get('items') or [] if i.get('stage') in dict(CET_STAGE)
          and not (i.get('stage') == 'open' and i.get('due_date') and str(i['due_date'])[:10] < today)]
    cards = []
    for st, _ in CET_STAGE:
        mine = sorted((i for i in it if i.get('stage') == st), key=lambda i: -(i.get('fit_score') or 0))[:4]
        for i in mine:
            cards.append({'ref': _ref(i.get('id')), 'title': _clip(i.get('title'), 64), 'stage': st, 'tag': i.get('state') or '',
                          'owner': _clip(i.get('owner_or_agency'), 40), 'amount': round(i['est_value_usd'] / 1e6, 1) if isinstance(i.get('est_value_usd'), (int, float)) else None,
                          'due': f"due {_iso_short(i['due_date'])}" if i.get('due_date') else '', 'next_step': f"Fit {i.get('fit_score')}" if i.get('fit_score') else '',
                          'basis': PUBLIC, 'est': isinstance(i.get('est_value_usd'), (int, float))})
    if not cards:
        return None
    top = cards[0]
    opened = [c for c in cards if c['stage'] == 'open']
    if opened:
        o = opened[0]
        lead = (f"{sum(1 for i in it if i.get('stage') == 'open')} public bids are still open. The best fit scores "
                f"{o['next_step'].replace('Fit ', '')} of 100" + (f", {o['due']}." if o.get('due') else '.'))
    else:
        lead = f"No public bid is open today. {len(cards)} planned and recurring items are shown, best fit first."
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{len(cards)} of {len(it)} radar items are shown, best fit first in each stage."
    return _res('CET public bids and projects, best fit first', lead,
                _board('$M', 'est. value', [{'id': k, 'label': lab, 'count': sum(1 for c in cards if c['stage'] == k)} for k, lab in CET_STAGE], cards),
                PUBLIC, 'CET opportunity radar: state capital plans, public bid portals and federal awards. Values are estimates.', _gen('cet_opportunities'),
                {'action': 'calendar_hold', 'label': 'Hold time to review the best-fit open bids', 'when': 'This week',
                 'body': f"Review the {min(4, len(opened)) or len(cards)} best-fit open bids on the radar and pick the ones to price."})


def b_wwtp(ctx):
    d = _research('cet_wwtp_targets')
    byid = {i.get('id'): i for i in d.get('items') or []}
    top = (d.get('meta') or {}).get('priority_top_15') or []
    bars = []
    for t in top[:8]:
        i = byid.get(t.get('id')) or {}
        sub = ' · '.join(x for x in (', '.join(y for y in (_title_case(i.get('town')), t.get('state')) if y),
                                     f"{i['design_flow_mgd']:g} MGD" if isinstance(i.get('design_flow_mgd'), (int, float)) else '',
                                     f"project {_m(i['project_value_usd'])}" if isinstance(i.get('project_value_usd'), (int, float)) and i['project_value_usd'] else '') if x)
        bars.append({'ref': _ref(t.get('id')), 'label': _clip(t.get('facility_name'), 44), 'value': t.get('horton_fit'), 'sub': sub, 'basis': PUBLIC,
                     'funded': bool(re.search('funded', str(i.get('project_class') or ''), re.I))})
    if not bars:
        return None
    funded = sum(1 for b in bars if b.pop('funded'))
    lead = f"{bars[0]['label']} leads at {bars[0]['value']} of 100. " + (
        f"All top {len(bars)} have a funded upgrade project." if funded == len(bars) else f"{funded} of the top {len(bars)} have a funded upgrade project.")
    return _res('Wastewater plants to call first', lead, _bars('pts', 'fit score', bars, max_=100), PUBLIC,
                'Treatment plants in CT, MA and RI from state permit and Clean Water Fund lists, scored for electrical fit.', _gen('cet_wwtp_targets'),
                {'action': 'chat_post', 'label': 'Post the first three plants to the sales channel',
                 'body': 'First wastewater calls: ' + '; '.join(f"{b['label']} ({b['value']})" for b in bars[:3]) + '.', 'channel_rx': 'sales|business|leadership'})


def b_law_firms(ctx):
    d = _research('fl_midsize_firms')
    byid = {i.get('id'): i for i in d.get('items') or []}
    top = (d.get('meta') or {}).get('top_20_ranked') or sorted(d.get('items') or [], key=lambda i: i.get('fit_rank') or 999)
    bars = []
    for t in top[:8]:
        i = byid.get(t.get('id')) or t
        name = t.get('firm_name') or i.get('firm_name')
        n = t.get('attorney_count') or i.get('attorney_count')
        sub = ' · '.join(x for x in (t.get('metro') or i.get('metro') or '', f'{n} lawyers' if isinstance(n, int) else '') if x)
        bars.append({'ref': _ref(t.get('id')), 'label': _clip(name, 44), 'value': t.get('frontline_fit_score') or i.get('frontline_fit_score'),
                     'sub': sub, 'basis': PUBLIC})
    bars = [b for b in bars if isinstance(b['value'], (int, float))]
    if not bars:
        return None
    lead = f"{len(d.get('items') or [])} mid-size firms screened. {_short_name(bars[0]['label'])} leads at {bars[0]['value']} of 100."
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{len(d.get('items') or [])} mid-size firms screened. {_clip(bars[0]['label'], 30)} leads at {bars[0]['value']} of 100."
    return _res('Law firms to call first', lead, _bars('pts', 'fit score', bars, max_=100), PUBLIC,
                'Mid-size law firm screen: firm sites, legal press and public records. Fit score out of 100.', _gen('fl_midsize_firms'),
                {'action': 'chat_post', 'label': 'Post the first three firms to the sales channel',
                 'body': 'First calls this week: ' + '; '.join(b['label'] for b in bars[:3]) + '.', 'channel_rx': 'sales|business|leadership'})


def b_lab_sites(ctx):
    d = _json(os.path.join(ROOT, 'data', 'ts_sites.json'))
    cols, enums = d.get('cols') or [], d.get('enums') or {}
    si, vi = cols.index('state'), cols.index('vertical')

    def val(row, i, name):
        v = row[i]
        e = enums.get(name)
        return e[v] if isinstance(v, int) and e and 0 <= v < len(e) else v
    counts, by_state, by_vert = {}, {}, {}
    for r in d.get('rows') or []:
        s, v = val(r, si, 'state'), val(r, vi, 'vertical')
        counts[(s, v)] = counts.get((s, v), 0) + 1
        by_state[s] = by_state.get(s, 0) + 1
        by_vert[v] = by_vert.get(v, 0) + 1
    states = [s for s, _ in sorted(by_state.items(), key=lambda kv: -kv[1])[:8]]
    verts = [v for v, _ in sorted(by_vert.items(), key=lambda kv: -kv[1])[:5]]
    rows = [{'id': s, 'label': s, 'basis': PUBLIC} for s in states]
    cells = [[counts.get((s, v)) for v in verts] for s in states]
    total = sum(by_state.values())
    lead = f"{total:,} lab and clinical sites in public registries. {states[0]} has the most, {by_state[states[0]]:,}; {verts[0].lower()} sites lead."
    as_of = ''
    try:
        as_of = str(_json(os.path.join(ROOT, 'data', 'manifest.json')).get('generated') or '')[:10]
    except Exception:   # noqa: BLE001
        pass
    return _res('Lab and clinical sites by state and type', lead,
                _heatmap('sites', 'high', rows, [{'id': _ref(v), 'label': v} for v in verts], cells), PUBLIC,
                'Public lab registries: CLIA, the NPI registry, CMS utilization and hospital data.', as_of,
                {'action': 'chat_post', 'label': f'Post the {states[0]} site count to the sales team',
                 'body': f"{states[0]} has {by_state[states[0]]:,} lab and clinical sites on public registries. Let's split the top parents this week.",
                 'channel_rx': 'sales|leadership'})


def b_new_homeowners(ctx):
    import property as homes   # lazy (never a bare top-level import: it would hide the built-in)
    if not homes.ready():
        return None
    homes._db()
    cov = (homes._meta or {}).get('coverage') or {}
    latest = {st: (c or {}).get('dense_month') for st, c in (cov.get('state') or {}).items() if (c or {}).get('dense_month')}
    if not latest:
        return None
    rows = []
    for st, ym in latest.items():
        rows += [(st, r['county'], r['n'], ym) for r in homes._q(
            'SELECT county, COUNT(*) n FROM sales WHERE market=1 AND home=1 AND state=? AND ym=? GROUP BY county', (st, ym))]
    rows.sort(key=lambda x: -x[2])
    bars = [{'ref': _ref(st, c), 'label': f'{c} County, {st}', 'value': n, 'sub': f"{_iso_month(ym)} sales", 'basis': PUBLIC} for st, c, n, ym in rows[:10]]
    if not bars:
        return None
    tot = sum(x[2] for x in rows)
    months = ' and '.join(f"{_iso_month(ym).split(' ')[0]} ({st})" for st, ym in sorted(latest.items()))
    lead = f"{tot:,} homes sold to new owners in the latest full months: {months}. {bars[0]['label']} leads with {bars[0]['value']:,}."
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{tot:,} homes sold to new owners in the latest full month. {bars[0]['label']} leads with {bars[0]['value']:,}."
    built = str((homes._meta or {}).get('built_at') or '')[:10]
    return _res('New homeowners by county, latest full month', lead, _bars('homes', 'home sales', bars), PUBLIC,
                'County deed records: recorded market sales of homes in the territory counties.', built,
                {'action': 'chat_post', 'label': f"Post the {bars[0]['label'].split(' County')[0]} new-owner count to marketing",
                 'body': f"{bars[0]['label']} had {bars[0]['value']:,} home sales in the latest full month. Queue the new-owner mailer there first.",
                 'channel_rx': 'marketing|sales|leadership'})


OPP_KIND = {'bpi': (('federal', 'Federal bids', r'federal'), ('practice', 'New practices', r'practice'), ('markets', 'New markets', r'international|geographic'),
                    ('other', 'Other', r'.')),
            'fh': (('channels', 'Channels', r'wholesale|channel'), ('products', 'Products and collabs', r'category|collab|licens'),
                   ('markets', 'New markets', r'international'), ('brand', 'Brand', r'.'))}


def _first_money(s):
    m = re.search(r'\$\s?([\d.,]+)\s*([MBK])', s or '', re.I)
    if not m:
        return None
    try:
        v = float(m.group(1).replace(',', ''))
    except ValueError:
        return None
    return v * {'M': 1, 'B': 1000, 'K': 0.001}[m.group(2).upper()]


def b_growth_opportunities(ctx):
    co = ctx['company'] if ctx['company'] in OPP_KIND else (ctx['args'].get('company') or 'bpi')
    if co not in OPP_KIND:
        return None
    opps = _research('bsp_firm').get(f'{co}_opportunities') or []
    stages = OPP_KIND[co]
    cards = []
    for o in opps:
        st = next(k for k, _, rx in stages if re.search(rx, o.get('type') or ''))
        cards.append({'ref': _ref(o.get('id')), 'title': _clip(o.get('title'), 64), 'stage': st, 'amount': _first_money(o.get('value_or_scale')),
                      'next_step': _clip(o.get('value_or_scale'), 60), 'basis': PUBLIC, 'est': False})
    cards.sort(key=lambda c: -(c['amount'] or 0))
    if not cards:
        return None
    sized = [c for c in cards if c['amount']]
    stg0 = [{'id': k, 'label': lab, 'count': sum(1 for c in cards if c['stage'] == k)} for k, lab, _ in stages]
    most = max(stg0, key=lambda s: s['count'])
    lead = f"{len(cards)} public opportunities, by kind. {most['label']} lead with {most['count']}."
    if sized:
        lead += f" The largest named value is ${sized[0]['amount']:,.1f}M."
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{len(cards)} public opportunities, by kind. The largest named value is ${sized[0]['amount']:,.1f}M." if sized else lead
    stg = [{'id': k, 'label': lab, 'count': sum(1 for c in cards if c['stage'] == k)} for k, lab, _ in stages]
    stg = [s for s in stg if s['count']]
    return _res(f'{CO_SHORT[co]} public opportunities', lead, _board('$M', 'named value', stg, cards), PUBLIC,
                'Public sources: federal award records, press and company filings.', str((_research('bsp_firm').get('meta') or {}).get('generated') or
                                                                                         (_research('bsp_firm').get('firm') or {}).get('retrieved') or '')[:10],
                {'action': 'chat_post', 'label': 'Post the top opportunity to the sales channel',
                 'body': f"Top public opportunity: {_clip(cards[0]['title'], 80)}.", 'channel_rx': 'sales|business|leadership|growth'})


# ---------------------------------------------------------------- builders: the catalogue's signature questions (wave 3 integration)

def _tour(tid):
    try:
        return next((t for t in _research('globe_tours').get('tours') or [] if t.get('id') == tid), None)
    except Exception:   # noqa: BLE001
        return None


def _fig(step, name):
    return next((f[1] for f in step.get('figures') or [] if isinstance(f, list) and len(f) >= 2 and f[0] == name), None)


def _step(lat, lon, label, sub='', zoom=12.5, figures=None, hold_ms=5000):
    s = {'lat': round(float(lat), 5), 'lon': round(float(lon), 5), 'label': _clip(label, 58), 'sub': _clip(sub, 78), 'zoom': zoom, 'pitch': 50,
         'hold_ms': hold_ms}
    if figures:
        s['figures'] = figures[:4]
    return s


def _firm_name(s):
    """'Lancaster Plumbing, Heating, Cooling & Electrical' -> 'Lancaster Plumbing'; 'Midland Scientific, Inc.' -> 'Midland Scientific'."""
    return re.split(r',', re.sub(r',?\s+(Inc|LLC|Corp|Corporation|Co|Ltd)\.?$', '', str(s or '').strip()))[0].strip()


def b_best3(ctx):
    """The managing partner's question: the "Best 3 add-on targets" globe tour, as a ranked list of the tour's own three stops."""
    co = ctx['args'].get('company')
    tid = f'best3-{co}' if co in ('pp', 'cet', 'fl', 'ts') else 'best3'
    t = _tour(tid)
    if not t or not t.get('steps'):
        return None
    bars = []
    for s in t['steps'][:3]:
        fit = _fig(s, 'Fit')
        try:
            fit = int(str(fit))
        except (TypeError, ValueError):
            continue
        rev, staff = _fig(s, 'Revenue'), _fig(s, 'Staff')
        sub = ' · '.join(x for x in (s.get('sub') or '', f'est. revenue {rev}' if rev else '', f'{staff} staff' if staff else '') if x)
        bars.append({'ref': _ref(tid, s.get('label')), 'label': _clip(s.get('label'), 48), 'value': fit, 'sub': sub, 'basis': EST,
                     'lat': s.get('lat'), 'lon': s.get('lon')})
    if len(bars) < 3:
        return None
    names = [_firm_name(b['label']) for b in bars]
    lead = (f"The three best add-on targets: {names[0]} (fit {bars[0]['value']}), {names[1]} ({bars[1]['value']}) and {names[2]} "
            f"({bars[2]['value']}). The globe flies to each.")
    data = _bars('pts', 'fit score', bars, max_=100)
    data['globe'] = tid
    res = _res(t.get('title') or 'Best 3 add-on targets', lead, data, EST,
               'Add-on target screens: company search estimates checked against each firm\'s own site and public sources. Fit score out of 100.',
               str(_research('globe_tours').get('generated') or '')[:10] or max(_gen(f) for f in ('ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts')),
               {'action': 'chat_post', 'label': 'Post the three targets to the partners channel', 'channel_rx': 'partner|deal|firm',
                'body': 'Best three add-on targets: ' + '; '.join(f"{_firm_name(b['label'])} (fit {b['value']})" for b in bars) + '.'})
    res['map'] = {'tour': tid}
    return res


def b_addon_by_company(ctx):
    """The associate's question: the best add-on target for each company with a screen, then the runners-up."""
    toured = {_firm_name(st.get('label')).lower(): n for co in ('pp', 'cet', 'fl', 'ts') for n, st in enumerate((_tour(f'best3-{co}') or {}).get('steps') or [])}
    # ties go in the order the company's globe tour shows them, so the associate and the managing partner see the same firm first
    items = sorted(_all_targets(), key=lambda i: (-i['fit_score'], toured.get(_firm_name(i.get('company')).lower(), 9), i.get('company') or ''))
    best, rest = {}, []
    for i in items:
        if i['_co'] in best:
            rest.append(i)
        else:
            best[i['_co']] = i
    top = sorted(best.values(), key=lambda i: -i['fit_score'])
    pick = top + [i for i in rest if i not in top][:max(0, 8 - len(top))]
    if not pick:
        return None
    bars = []
    for i in pick:
        place = ', '.join(x for x in (i.get('hq_city'), i.get('state') or i.get('hq_state')) if x)
        sub = ' · '.join(x for x in (CO_SHORT[i['_co']] + ' add-on', place,
                                     f"est. revenue {_m(i['revenue_est_usd'])}" if isinstance(i.get('revenue_est_usd'), (int, float)) else '') if x)
        bars.append({'ref': _ref(i.get('id')), 'label': _clip(i.get('company'), 48), 'value': i['fit_score'], 'sub': sub, 'basis': EST, 'co': i['_co']})
    lead = 'Best fit per company. ' + ' '.join(f"{CO_SHORT[i['_co']]}: {_firm_name(i.get('company'))}, {i['fit_score']}." for i in top)
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{_short_name(top[0].get('company'))} leads at {top[0]['fit_score']} of 100. Each company's best fit is shown first."
    data = _bars('pts', 'fit score', bars, max_=100)
    data['globe'] = 'best3'
    gen = max(_gen(f) for f in ('ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts'))
    return _res('Best add-on target for each company', lead, data, EST,
                'Add-on target screens: company search estimates checked against each firm\'s own site and public sources. Fit score out of 100.',
                gen, {'action': 'chat_post', 'label': 'Post the top target for each company to the deal team', 'channel_rx': 'deal|firm',
                      'body': 'Top target per company: ' + '; '.join(f"{CO_SHORT[i['_co']]}: {_firm_name(i.get('company'))} ({i['fit_score']})" for i in top) + '.'})


def b_hub_cold(ctx):
    """Punctual Pros: overnight lows at the ten weather hubs for the next seven days (Open-Meteo, a live public feed)."""
    try:
        d = _json(os.path.join(ROOT, 'data', 'live', 'forecast_hubs.json'))
    except Exception:   # noqa: BLE001
        return None
    day0 = str(d.get('fetched_at') or '')[:10]
    hubs = [h for h in d.get('items') or [] if h.get('hub') and h.get('days')]
    if not hubs or not day0:
        return None
    dates = [x['date'] for x in hubs[0]['days'] if x.get('date') and x['date'] >= day0][:7]
    if not dates:
        return None

    def low(h, dt):
        v = next((x.get('tmin') for x in h['days'] if x.get('date') == dt), None)
        return round(v) if isinstance(v, (int, float)) else None
    hubs.sort(key=lambda h: min((low(h, dt) for dt in dates if low(h, dt) is not None), default=99))
    st = lambda h: 'NJ' if isinstance(h.get('lon'), (int, float)) and h['lon'] > -75.2 else 'PA'
    rows = [{'id': _ref('hub', h['hub']), 'label': f"{h['hub']}, {st(h)}", 'basis': PUBLIC} for h in hubs]
    cols = [{'id': dt, 'label': datetime.date.fromisoformat(dt).strftime('%a %-d')} for dt in dates]
    cells = [[low(h, dt) for dt in dates] for h in hubs]
    cold = hubs[0]
    cmin = min(v for v in cells[0] if v is not None)
    cday = datetime.date.fromisoformat(dates[cells[0].index(cmin)]).strftime('%A')
    frz = sum(1 for line in cells if any(v is not None and v < 32 for v in line))
    lead = f"{cold['hub']} faces the coldest night, {cmin}°F on {cday}. {frz} of {len(hubs)} hubs drop below freezing this week."
    return _res('Overnight lows by hub, next seven days', lead, _heatmap('°F', 'high', rows, cols, cells), PUBLIC,
                'Open-Meteo seven-day forecast for the ten Punctual Pros weather hubs.', day0,
                {'action': 'chat_post', 'label': 'Post the cold-night staffing plan to the hub managers', 'channel_rx': 'hub|ops|operations|leadership',
                 'body': f"Coldest night this week: {cold['hub']}, {cmin}°F on {cday}. Put an extra no-heat technician on call at the coldest hubs."})


def b_research_sites(ctx):
    """Thomas Scientific: the research institutions with the most NIH awards this year (NIH RePORTER, a live public feed)."""
    try:
        d = _json(os.path.join(ROOT, 'data', 'live', 'nih_awards.json'))
    except Exception:   # noqa: BLE001
        return None
    orgs = [o for o in d.get('top_orgs') or [] if isinstance(o.get('current'), (int, float)) and o.get('org')]
    if not orgs:
        return None
    orgs.sort(key=lambda o: -o['current'])
    top = orgs[:8]
    where = {}
    try:
        ts = _json(os.path.join(ROOT, 'data', 'ts_sites.json'))
        cols, enums = ts.get('cols') or [], ts.get('enums') or {}
        ci, si, la, lo = cols.index('city'), cols.index('state'), cols.index('lat'), cols.index('lon')
        for r in ts.get('rows') or []:
            st = r[si]
            st = enums['state'][st] if isinstance(st, int) and 'state' in enums and 0 <= st < len(enums['state']) else st
            c = r[ci]
            c = enums['city'][c] if isinstance(c, int) and 'city' in enums and 0 <= c < len(enums['city']) else c
            if isinstance(r[la], (int, float)) and isinstance(r[lo], (int, float)):
                where.setdefault((str(c).upper(), st), []).append((r[la], r[lo]))
    except Exception:   # noqa: BLE001
        where = {}
    bars = []
    for o in top:
        g = (o['current'] / o['prior'] - 1) * 100 if isinstance(o.get('prior'), (int, float)) and o['prior'] else None
        name = _title_case(o['org']).replace(' At ', ' at ').replace(' Of ', ' of ')
        sub = ' · '.join(x for x in (f"{_title_case(o.get('city') or '')}, {o.get('state')}", f"{'up' if g >= 0 else 'down'} {abs(g):.0f}% on last year" if g is not None else '') if x)
        pts = where.get((str(o.get('city') or '').upper(), o.get('state'))) or []
        bars.append({'ref': _ref('nih', o['org']), 'label': _clip(name, 48), 'value': round(o['current'] / 1e6), 'sub': sub, 'basis': PUBLIC,
                     'growth': g, 'lat': sum(p[0] for p in pts) / len(pts) if pts else None, 'lon': sum(p[1] for p in pts) / len(pts) if pts else None})
    fast = max((b for b in bars[:5] if b['growth'] is not None), key=lambda b: b['growth'], default=None)
    lead = f"{_short_name(bars[0]['label'])} leads NIH awards this year at ${bars[0]['value']:,}M."
    if fast:
        lead += f" Of the top five, {_short_name(fast['label'])} grew fastest, up {fast['growth']:.0f}%."
    steps = [_step(b['lat'], b['lon'], b['label'], b['sub'], 11.5, [['NIH awards', f"${b['value']:,}M"]]) for b in bars[:3] if b['lat'] is not None]
    for b in bars:
        b.pop('growth', None)
        b.pop('lat', None)
        b.pop('lon', None)
    res = _res('Research sites by NIH awards this year', lead, _bars('$M', 'NIH awards, year to date', bars), PUBLIC,
               'NIH RePORTER: research awards issued this year to date, by institution, in eight research states.', str(d.get('fetched_at') or '')[:10],
               {'action': 'chat_post', 'label': 'Post the top three sites to the sales team', 'channel_rx': 'sales|leadership',
                'body': 'Research sites to win next: ' + '; '.join(f"{b['label']} (${b['value']:,}M NIH this year)" for b in bars[:3]) + '.'})
    if steps:
        res['map'] = {'title': 'Research sites to win next', 'source': 'NIH RePORTER', 'steps': steps}
    return res


def b_contract_values(ctx):
    """BPI: its public contract opportunities ranked by named value (federal award records)."""
    opps = _research('bsp_firm').get('bpi_opportunities') or []
    bars = []
    for o in opps:
        v = _first_money(o.get('value_or_scale'))
        if not v:
            continue
        first = re.split(r'[;(]', o.get('value_or_scale') or '')[0].strip()
        bars.append({'ref': _ref(o.get('id') or o.get('title')), 'label': _clip(re.split(r'\s+[-(]', o.get('title') or '')[0], 48), 'value': round(v, 1),
                     'sub': _clip(first, 60), 'basis': PUBLIC, 'recompete': 'recompete' in str(o.get('type') or '')})
    bars.sort(key=lambda b: -b['value'])
    if not bars:
        return None
    rec = next((b for b in bars if b['recompete']), bars[0])
    n_re = sum(1 for b in bars if b['recompete'])
    for b in bars:
        b.pop('recompete', None)
    lead = f"{n_re} federal recompetes are named. The largest is {rec['label']}, ${rec['value']:,.1f}M obligated."
    if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
        lead = f"{n_re} federal recompetes are named. The largest is ${rec['value']:,.1f}M obligated."
    f = _research('bsp_firm')
    return _res('BPI public contracts by value', lead, _bars('$M', 'named value', bars), PUBLIC,
                'Federal award records and public filings for contracts BPI holds or could bid.',
                str((f.get('meta') or {}).get('generated') or (f.get('firm') or {}).get('retrieved') or '')[:10],
                {'action': 'calendar_hold', 'label': 'Hold an hour to plan the largest recompete', 'when': 'This week',
                 'body': f"Plan the {rec['label']} recompete: incumbent position, timing and team."})


def b_fund_question(ctx):
    """Investor relations: the open investor question and the Fund I figures that answer it (Form D commitments are public)."""
    fund = next(iter(_recs(ctx['role_id'], 'financials', 'fund')), None)
    if not fund:
        return None
    th = next((t for t in _recs(ctx['role_id'], 'email', 'threads') if t.get('kind') == 'investor question'), None)
    pub = 'public' if 'public' in str(fund.get('commitments_basis') or '').lower() else REC
    cols = [{'id': 'committed', 'label': 'Committed', 'unit': '$M'}, {'id': 'called', 'label': 'Called', 'unit': '$M'},
            {'id': 'called_pct', 'label': 'Called', 'unit': '%'}, {'id': 'investors', 'label': 'Investors', 'unit': ''}]
    nop = {'target': None, 'status': None}   # fund figures have no plan to be on or off
    cells = [[{'value': fund.get('commitments_m'), 'basis': PUBLIC if pub == 'public' else REC, **nop},
              {'value': fund.get('called_m'), 'basis': REC, 'est': True, **nop},
              {'value': fund.get('called_pct'), 'basis': REC, 'est': True, **nop},
              {'value': fund.get('investors'), 'basis': PUBLIC if pub == 'public' else REC, **nop}]]
    rows = [{'id': _ref(fund.get('id')), 'label': fund.get('fund') or 'Fund I', 'basis': REC}]
    nxt = fund.get('next_report_d')
    lead = (f"{fund.get('fund') or 'Fund I'} has called {fund.get('called_pct')}% of commitments, ${fund.get('called_m'):,.1f}M of "
            f"${fund.get('commitments_m'):,.1f}M." + (f" The next quarterly report is due in {nxt} days." if isinstance(nxt, int) and nxt > 0 else ''))
    body = (f"Thank you for the question. {fund.get('fund') or 'Fund I'} has called {fund.get('called_pct')}% of commitments to date. "
            'Your capital account statement in the next quarterly report shows your own figure.')
    return _res(f"{fund.get('fund') or 'Fund I'}: the figures for the investor's question", lead, _scorecard(rows, cols, cells, target_label=''), REC,
                f'{REC_LINE}: fund record; commitments and investor count from the SEC Form D filing. Called share is modeled.', _as_of_rec(),
                {'action': 'reply_email', 'label': 'Reply to the investor with the Fund I figures', 'body': body,
                 'thread_rx': re.escape(_ws().tok((th or {}).get('subject') or '')[:24]) if th else 'investor|capital|fund'})


def b_wwtp_map(ctx):
    res = b_wwtp(ctx)
    if not res:
        return None
    d = _research('cet_wwtp_targets')
    byid = {i.get('id'): i for i in d.get('items') or []}
    steps = []
    for t in ((d.get('meta') or {}).get('priority_top_15') or [])[:3]:
        i = byid.get(t.get('id')) or {}
        if isinstance(i.get('lat'), (int, float)) and isinstance(i.get('lon'), (int, float)):
            steps.append(_step(i['lat'], i['lon'], t.get('facility_name') or 'Plant', ', '.join(x for x in (_title_case(i.get('town')), t.get('state')) if x),
                               14.5, [['Fit', str(t.get('horton_fit'))]]))
    if steps:
        res['map'] = {'title': 'Wastewater plants to call first', 'source': 'State permit and Clean Water Fund lists', 'steps': steps}
    res['draft'] = {'action': 'calendar_hold', 'label': 'Hold an hour to call the first plant', 'when': 'This week',
                    'body': f"Call {res['data']['bars'][0]['label']} about its funded upgrade project."}
    return res


def b_new_homeowners_map(ctx):
    res = b_new_homeowners(ctx)
    if not res:
        return None
    pts = {}
    try:
        z = _json(os.path.join(ROOT, 'data', 'pp_zips.json'))
        rows = z.get('rows') if isinstance(z, dict) and isinstance(z.get('rows'), list) else (z if isinstance(z, list) else [])
        cols = z.get('cols') if isinstance(z, dict) else None
        enums = (z.get('enums') or {}) if isinstance(z, dict) else {}
        for r in rows:
            if cols and isinstance(r, list):
                r = {c: (enums[c][v] if c in enums and isinstance(v, int) and 0 <= v < len(enums[c]) else v) for c, v in zip(cols, r)}
            if not isinstance(r, dict):
                continue
            c = re.sub(r'\s+County$', '', str(r.get('county') or ''))
            if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float)):
                pts.setdefault((c, r.get('state')), []).append((r['lat'], r['lon']))
    except Exception:   # noqa: BLE001
        pts = {}
    steps = []
    for b in res['data']['bars'][:3]:
        m = re.match(r'(.+) County, (\w\w)$', b['label'])
        p = pts.get((m.group(1), m.group(2))) if m else None
        if p:
            steps.append(_step(sum(x[0] for x in p) / len(p), sum(x[1] for x in p) / len(p), b['label'], f"{b['value']:,} new owners · {b['sub']}", 9.5,
                               [['New owners', f"{b['value']:,}"]]))
    if steps:
        res['map'] = {'title': 'New homeowners by county', 'source': 'County deed records', 'steps': steps}
    return res


def b_bids_30(ctx):
    """CET estimator: open public bids due in the next 30 days, best fit first (the radar's due dates)."""
    res = b_public_bids(ctx)
    if not res:
        return None
    d = _research('cet_opportunities')
    today = base_date()
    soon = [i for i in d.get('items') or [] if i.get('stage') == 'open' and i.get('due_date')
            and 0 <= (datetime.date.fromisoformat(str(i['due_date'])[:10]) - today).days <= 30]
    soon.sort(key=lambda i: (str(i['due_date'])[:10], -(i.get('fit_score') or 0)))
    if soon:
        f = soon[0]
        who = _clip(re.split(r'[(,]', f.get('owner_or_agency') or '')[0].strip(), 40)
        lead = (f"{len(soon)} public bid{'s are' if len(soon) != 1 else ' is'} due in the next 30 days. The first"
                + (f", for {who}," if who else '') + f" is due {_iso_short(f['due_date'])}, fit {f.get('fit_score')} of 100.")
        if words(lead) > LEAD_WORDS or any(words(s) > SENTENCE_WORDS for s in sentences(lead)):
            lead = f"{len(soon)} public bids are due in the next 30 days. The first is due {_iso_short(f['due_date'])}, fit {f.get('fit_score')} of 100."
        res['lead'] = lead
        res['draft'] = {'action': 'calendar_hold', 'label': 'Hold two hours to price the first bid due', 'when': f"Before {_iso_short(f['due_date'])}",
                        'body': f"Price the {who + ' ' if who else ''}bid due {_iso_short(f['due_date'])}: scope, crew and materials."}
    else:
        res['lead'] = 'No public bid is due in the next 30 days. Planned and recurring items are shown, best fit first.'
    return res


RUNBOOK_WORDS = (('password', r'password|mfa|sign.?in|locked|log.?in'), ('new hire', r'new hire|onboard|laptop|set ?up'),
                 ('vpn', r'vpn|remote|connect|reach|offline|network'), ('document', r'document|drive|file|share|docket|folder'),
                 ('phishing', r'phish|suspicious|link|spoof'))


def _runbook_for(ticket):
    """The runbook for a ticket: the client's own runbook for that kind of call, else the general one; None when no kind matches."""
    subj = (ticket or {}).get('subject') or ''
    kind = next((k for k, rx in RUNBOOK_WORDS if re.search(rx, subj, re.I)), None)
    if not kind:
        return None
    rbs = [r for r in _recs_any('fl', 'servicedesk', 'runbooks') if kind in (r.get('title') or '').lower()]
    own = next((r for r in rbs if (r.get('client') and r.get('client') == ticket.get('client'))), None)
    return own or next((r for r in rbs if not r.get('client')), rbs[0] if rbs else None)


def _recs_any(co, app, set_):
    try:
        data = _ws().load(co)
        apps = data.get('apps') if 'apps' in data else data
        return list(((apps or {}).get(app) or {}).get(set_) or [])
    except Exception:   # noqa: BLE001
        return []


def b_next_ticket(ctx):
    """Frontline help desk: the next ticket and the runbook steps for it, over the board of the engineer's own tickets."""
    res = b_my_tickets(ctx)
    if not res or not res['data']['cards']:
        return res
    w = _ws()
    t = [x for x in _recs(ctx['role_id'], 'servicedesk', 'tickets') if x.get('status') in TICKET_STAGES]
    pr = {'P1': 0, 'P2': 1, 'P3': 2, 'P4': 3}
    t.sort(key=lambda x: (x.get('status') != 'Past due', pr.get(x.get('priority'), 9), x.get('opened_d') or 0))
    top = next((x for x in t if _runbook_for(x)), t[0])   # the first ticket in order that has a runbook to walk through
    rb = _runbook_for(top)
    steps = [s.rstrip('.') for s in (rb or {}).get('steps') or []]
    subj = _clip(w.tok(top.get('subject') or ''), 40)
    if steps:
        lead = f"Next: {top.get('number')}, {subj[:1].lower() + subj[1:]}. " + ' '.join(f"{i}. {s}." for i, s in enumerate(steps[:4], 1))
    else:
        lead = f"Next: {top.get('number')}, {subj[:1].lower() + subj[1:]}. {res['lead']}"
    res['lead'] = lead
    if res.get('draft'):
        res['draft'] = dict(res['draft'], label='Update the ticket with the step finished',
                            body=f"Step done: {steps[0][:1].lower() + steps[0][1:]}. Next I will {steps[1][:1].lower() + steps[1][1:]}." if len(steps) >= 2
                            else res['draft']['body'])
    return res


# ---------------------------------------------------------------- topics, access, signatures

# kind, builder, sandbox sets read (app, set) or None for public data, company rule, who may read public data
TOPICS = {
    'portfolio_scorecard': ('scorecard', b_portfolio_scorecard, (('financials', 'pnl'),), 'portfolio', None),
    'company_scorecard': ('scorecard', b_company_scorecard, (('financials', 'pnl'), ('financials', 'kpis')), 'company', None),
    'hub_scorecard': ('scorecard', b_hub_scorecard, (('financials', 'kpis'),), 'pp', None),
    'plan_bridge': ('bridge', b_plan_bridge, (('financials', 'pnl'),), 'company', None),
    'deal_bridge': ('bridge', b_deal_bridge, None, 'any', 'execs'),
    'open_roles': ('heatmap', b_open_roles, (('adp', 'headcount'),), 'portfolio', None),
    'hub_callbacks': ('heatmap', b_hub_callbacks, (('financials', 'kpis'),), 'pp', None),
    'crew_hours': ('heatmap', b_crew_hours, (('procore', 'projects'),), 'cet', None),
    'ticket_age': ('heatmap', b_ticket_age, (('servicedesk', 'tickets'),), 'fl', None),
    'center_orders': ('heatmap', b_center_orders, (('financials', 'orders'),), 'ts', None),
    'office_utilization': ('heatmap', b_office_utilization, (('financials', 'kpis'),), 'bpi', None),
    'lab_sites': ('heatmap', b_lab_sites, None, 'ts', ('ts-sales', 'ts-inside-sales')),
    'deal_stages': ('pipeline_board', b_deal_stages, (('dealcloud', 'deals'),), 'bsp', None),
    'public_bids': ('pipeline_board', b_public_bids, None, 'cet', ('cet-sales', 'cet-estimator', 'cet-project-manager')),
    'today_jobs': ('pipeline_board', b_today_jobs, (('servicetitan', 'jobs'),), 'pp', None),
    'my_tickets': ('pipeline_board', b_my_tickets, (('servicedesk', 'tickets'),), 'fl', None),
    'site_crew': ('pipeline_board', b_site_crew, (('procore', 'projects'),), 'cet', None),
    'growth_opportunities': ('pipeline_board', b_growth_opportunities, None, ('bpi', 'fh'), ('bpi-sales', 'fh-sales', 'bpi-account-director')),
    'addon_targets': ('ranked_bars', b_addon_targets, None, 'any', 'leaders'),
    'rival_loans': ('ranked_bars', b_rival_loans, None, 'bsp', 'firm'),
    'fund_raised': ('ranked_bars', b_fund_raised, None, 'bsp', 'firm_all'),
    'due_dates': ('ranked_bars', b_due_dates, (('financials', 'debt'),), 'portfolio', None),
    'project_dates': ('ranked_bars', b_project_dates, (('procore', 'projects'),), 'cet', None),
    'wwtp': ('ranked_bars', b_wwtp, None, 'cet', ('cet-sales', 'cet-estimator')),
    'law_firms': ('ranked_bars', b_law_firms, None, 'fl', ('fl-sales',)),
    'new_homeowners': ('ranked_bars', b_new_homeowners, None, 'pp', ('pp-sales', 'pp-location-gm', 'pp-dispatcher')),
    'invoice_rejections': ('ranked_bars', b_invoice_rejections, (('financials', 'invoices'),), 'fl', None),
    'slipping_accounts': ('ranked_bars', b_slipping_accounts, (('salesforce', 'accounts'),), 'ts', None),
    'stock_cover': ('ranked_bars', b_stock_cover, (('financials', 'inventory'),), 'ts', None),
    'retainer_hours': ('ranked_bars', b_retainer_hours, (('salesforce', 'accounts'),), 'bpi', None),
    'returns': ('ranked_bars', b_returns, (('shopify', 'returns'),), 'fh', None),
    'weeks_cover': ('ranked_bars', b_weeks_cover, (('shopify', 'products'),), 'fh', None),
    # the catalogue's signature questions (data/agent/catalog.json roles[].signature) that the topics above do not answer as asked
    'best3': ('ranked_bars', b_best3, None, 'any', 'firm'),
    'addon_by_company': ('ranked_bars', b_addon_by_company, None, 'bsp', 'firm'),
    'hub_cold': ('heatmap', b_hub_cold, None, 'pp', ('pp-location-gm', 'pp-dispatcher')),
    'research_sites': ('ranked_bars', b_research_sites, None, 'ts', ('ts-sales', 'ts-inside-sales')),
    'contract_values': ('ranked_bars', b_contract_values, None, ('bpi',), ('bpi-sales', 'bpi-account-director')),
    'fund_question': ('scorecard', b_fund_question, (('financials', 'fund'), ('email', 'threads')), 'bsp', None),
    'wwtp_map': ('ranked_bars', b_wwtp_map, None, 'cet', ('cet-sales', 'cet-estimator')),
    'new_homeowners_map': ('ranked_bars', b_new_homeowners_map, None, 'pp', ('pp-sales', 'pp-location-gm', 'pp-dispatcher')),
    'bids_30': ('pipeline_board', b_bids_30, None, 'cet', ('cet-sales', 'cet-estimator', 'cet-project-manager')),
    'next_ticket': ('pipeline_board', b_next_ticket, (('servicedesk', 'tickets'), ('servicedesk', 'runbooks')), 'fl', None),
}


def _sig(q, view, topic, draft, company=None):
    args = {'view': view, 'topic': topic}
    if company:
        args['company'] = company
    return {'q': q, 'tool': 'show_view', 'args': args, 'view': view, 'draft': {'action': draft}}


def _site(q, address, view, draft):
    return {'q': q, 'tool': 'site_brief', 'args': {'address': address, 'view': view}, 'view': view, 'draft': {'action': draft}}


# The same shape as the catalogue's `signature` field (SIGNATURE_DESIGN 4.3), keyed by role id. Used when the catalogue has none.
SIGNATURES = {
    'bsp-managing-partner': _sig('Which companies are off plan this month?', 'scorecard', 'portfolio_scorecard', 'chat_post'),
    'bsp-partner': _sig("Which rivals' loans are marked down the most?", 'ranked_bars', 'rival_loans', 'chat_post'),
    'bsp-operating-partner': _sig('Where are the open roles across our companies?', 'heatmap', 'open_roles', 'calendar_hold'),
    'bsp-senior-associate': _sig('Where would the gain on Punctual Pros come from?', 'bridge', 'deal_bridge', 'chat_post', 'pp'),
    'bsp-associate': _sig('Which add-on targets fit best?', 'ranked_bars', 'addon_targets', 'chat_post'),
    'bsp-fund-cfo': _sig('What tests and reports are due in 45 days?', 'ranked_bars', 'due_dates', 'calendar_hold'),
    'bsp-investor-relations': _sig('What has each fund vehicle raised?', 'ranked_bars', 'fund_raised', 'reply_email'),
    'pp-ceo': _sig('How did each hub do against plan last month?', 'scorecard', 'hub_scorecard', 'chat_post'),
    'pp-cfo': _sig('Why did margin miss plan last month?', 'bridge', 'plan_bridge', 'reply_email'),
    'pp-vp-operations': _sig('Which hub has the most callbacks?', 'heatmap', 'hub_callbacks', 'chat_post'),
    'pp-sales': _sig('Where are the new homeowners in our counties?', 'ranked_bars', 'new_homeowners', 'chat_post'),
    'pp-hvac-technician': _site('Show me 418 Wexcombe Ln before I get there.', '418 Wexcombe Ln, Lititz, PA', 'model', 'order_part'),
    'pp-plumber': _site('Going to 27 Brindlemoor Ct. Where are the pipes?', '27 Brindlemoor Ct, Red Lion, PA', 'plan', 'text_customer'),
    'pp-dispatcher': _site("What's on record at 418 Wexcombe Ln?", '418 Wexcombe Ln, Lititz, PA', 'plan', 'book_job'),
    'pp-location-gm': _sig("What does today's Lancaster board look like?", 'pipeline_board', 'today_jobs', 'book_job'),
    'cet-ceo': _sig('Which numbers are off plan this month?', 'scorecard', 'company_scorecard', 'chat_post'),
    'cet-cfo': _sig('What moved margin against plan last month?', 'bridge', 'plan_bridge', 'reply_email'),
    'cet-vp-operations': _sig('Which projects burned the most crew hours this week?', 'heatmap', 'crew_hours', 'chat_post'),
    'cet-sales': _sig('Which wastewater plants should we call first?', 'ranked_bars', 'wwtp', 'chat_post'),
    'cet-estimator': _sig('Which public bids should we chase first?', 'pipeline_board', 'public_bids', 'calendar_hold'),
    'cet-project-manager': _sig("What's due on my projects in the next two weeks?", 'ranked_bars', 'project_dates', 'rfi'),
    'cet-field-electrician': _sig("Who is on today's site?", 'pipeline_board', 'site_crew', 'daily_log'),
    'fl-ceo': _sig('Which numbers are off plan this month?', 'scorecard', 'company_scorecard', 'chat_post'),
    'fl-cfo': _sig('What moved margin against plan last month?', 'bridge', 'plan_bridge', 'reply_email'),
    'fl-vp-operations': _sig('Which desk has the oldest open tickets?', 'heatmap', 'ticket_age', 'chat_post'),
    'fl-sales': _sig('Which law firms should we call first?', 'ranked_bars', 'law_firms', 'chat_post'),
    'fl-help-desk-engineer': _sig('Which of my tickets need me first?', 'pipeline_board', 'my_tickets', 'ticket_update'),
    'fl-billing-specialist': _sig('Why are invoices rejected, and how much is stuck?', 'ranked_bars', 'invoice_rejections', 'reply_email'),
    'ts-ceo': _sig('Which numbers are off plan this month?', 'scorecard', 'company_scorecard', 'chat_post'),
    'ts-cfo': _sig('What moved margin against plan last month?', 'bridge', 'plan_bridge', 'reply_email'),
    'ts-vp-operations': _sig('Which center is behind on orders this week?', 'heatmap', 'center_orders', 'chat_post'),
    'ts-sales': _sig('Where are the lab sites we can sell to?', 'heatmap', 'lab_sites', 'chat_post'),
    'ts-inside-sales': _sig('Which accounts stopped ordering?', 'ranked_bars', 'slipping_accounts', 'calendar_hold'),
    'ts-warehouse-lead': _sig('What runs out first at Swedesboro?', 'ranked_bars', 'stock_cover', 'chat_post'),
    'bpi-ceo': _sig('Which numbers are off plan this month?', 'scorecard', 'company_scorecard', 'chat_post'),
    'bpi-cfo': _sig('What moved margin against plan last month?', 'bridge', 'plan_bridge', 'reply_email'),
    'bpi-vp-operations': _sig('Which office runs hot or cold on utilization?', 'heatmap', 'office_utilization', 'chat_post'),
    'bpi-sales': _sig('Which public opportunities should we pursue first?', 'pipeline_board', 'growth_opportunities', 'chat_post'),
    'bpi-account-director': _sig('Which retainers are over their hours?', 'ranked_bars', 'retainer_hours', 'reply_email'),
    'fh-ceo': _sig('Which numbers are off plan this month?', 'scorecard', 'company_scorecard', 'chat_post'),
    'fh-cfo': _sig('What moved margin against plan last month?', 'bridge', 'plan_bridge', 'reply_email'),
    'fh-vp-operations': _sig('What are customers returning, and why?', 'ranked_bars', 'returns', 'chat_post'),
    'fh-sales': _sig('Which growth opportunities should we open first?', 'pipeline_board', 'growth_opportunities', 'chat_post'),
    'fh-ecommerce-manager': _sig('Which products sell out in the next two weeks?', 'ranked_bars', 'weeks_cover', 'chat_post'),
}


# The catalogue (data/agent/catalog.json roles[].signature, written by scripts/build_agent_sandbox.py) is the source of every
# signature question and draft. Where the catalogue's question needs a picture other than the role's entry above, this names it:
# role -> (general picture, topic, company). A globe_tour signature is answered with a ranked list plus a map command card.
CAT_TOPIC = {
    'bsp-managing-partner': ('ranked_bars', 'best3', None),
    'bsp-partner': ('pipeline_board', 'deal_stages', None),
    'bsp-operating-partner': ('scorecard', 'portfolio_scorecard', None),
    'bsp-associate': ('ranked_bars', 'addon_by_company', None),
    'bsp-investor-relations': ('scorecard', 'fund_question', None),
    'pp-vp-operations': ('heatmap', 'hub_cold', None),
    'pp-sales': ('ranked_bars', 'new_homeowners_map', None),
    'cet-sales': ('ranked_bars', 'wwtp_map', None),
    'cet-estimator': ('pipeline_board', 'bids_30', None),
    'fl-help-desk-engineer': ('pipeline_board', 'next_ticket', None),
    'ts-sales': ('ranked_bars', 'research_sites', None),
    'bpi-sales': ('ranked_bars', 'contract_values', None),
}
CAT_SITE_VIEW = {'floor_plan': 'plan', 'house_model': 'model'}


def signature(role_id):
    """The role's signature: the catalogue's `signature` field (question, picture, draft action and title, address) when present,
    else the table above. Shape: {q, tool, args, view, draft: {action, title?}, picture?, tour?}."""
    base = SIGNATURES.get(role_id)
    cat = (_catalog_roles().get(role_id) or {}).get('signature')
    if not isinstance(cat, dict) or not (cat.get('question') or cat.get('q')):
        return dict(base) if base else None
    q = cat.get('question') or cat.get('q')
    cview = cat.get('view')
    dr = cat.get('draft') if isinstance(cat.get('draft'), dict) else {}
    draft = {'action': dr.get('action') or ((base or {}).get('draft') or {}).get('action')}
    if dr.get('title'):
        draft['title'] = dr['title']
    if cview in CAT_SITE_VIEW or (base or {}).get('tool') == 'site_brief':
        addr = cat.get('address') or ((base or {}).get('args') or {}).get('address')
        v = CAT_SITE_VIEW.get(cview) or ((base or {}).get('args') or {}).get('view') or 'plan'
        return {'q': q, 'tool': 'site_brief', 'args': {'address': addr, 'view': v}, 'view': v, 'draft': draft, 'picture': cview}
    if role_id in CAT_TOPIC:
        kind, topic, co = CAT_TOPIC[role_id]
    elif base and base.get('tool') == 'show_view':
        kind, topic, co = base['view'], base['args'].get('topic'), base['args'].get('company')
    else:
        return dict(base) if base else None
    args = {'view': kind, 'topic': topic}
    if co or ((base or {}).get('args') or {}).get('company'):
        args['company'] = co or base['args']['company']
    out = {'q': q, 'tool': 'show_view', 'args': args, 'view': kind, 'draft': draft, 'picture': cview or kind}
    tour = next((str(x).split('#', 1)[1] for x in cat.get('data') or [] if 'globe_tours.json#' in str(x)), None)
    if cview == 'globe_tour' and tour:
        out['tour'] = tour
    return out


def _public_ok(role_id, R, who, co):
    lv = _level(role_id, R)
    rco = R.get('company')
    if who == 'firm_all':
        return rco in (None, 'bsp')
    if rco in (None, 'bsp'):
        return role_id != 'bsp-investor-relations' and lv in FIRM_LEVELS
    if lv == 'co_field':
        return False
    if who == 'firm':
        return False
    if co not in (None, 'any') and co != rco:
        return False
    if who == 'execs':
        return lv == 'co_leadership' and role_id.endswith(('-ceo', '-cfo'))
    if lv == 'co_leadership':
        return True
    return isinstance(who, tuple) and role_id in who


def topics_for(view):
    return [t for t, spec in TOPICS.items() if spec[0] == view]


def access(role_id, view, topic, company=None):
    """(True, '') when the role may see this view and topic, else (False, reason). Scopes come from roles.json."""
    R = _role(role_id)
    if not R:
        return False, 'unknown role'
    spec = TOPICS.get(topic)
    if not spec or spec[0] != view:
        return False, 'unknown view'
    kind, fn, needs, corule, who = spec
    rco = R.get('company')
    if needs is None:
        co = company or (rco if rco in COS else None)
        if isinstance(corule, tuple):
            if (co or rco) not in corule and rco not in (None, 'bsp'):
                return False, 'outside'
        elif corule not in ('any', 'bsp') and rco in COS and rco != corule:
            return False, 'outside'
        if corule == 'bsp' and rco in COS:
            return False, 'outside'
        target = co if co else (corule if isinstance(corule, str) and corule in COS else None)
        return (True, '') if _public_ok(role_id, R, who, target if corule != 'any' else co) else (False, 'outside')
    for app, set_ in needs:
        scope = _scope(R, app, set_)
        if not scope:
            return False, 'outside'
        if corule == 'portfolio' and scope != 'portfolio' and not (topic == 'due_dates' and rco == 'bsp'):
            return False, 'outside'
    if corule in COS and rco not in (corule,) and not any(_scope(R, a, s) == 'portfolio' for a, s in needs):
        return False, 'outside'
    if corule == 'company' and rco not in COS and not all(_scope(R, a, s) == 'portfolio' for a, s in needs):
        return False, 'outside'
    if topic == 'due_dates' and not (_scope(R, 'financials', 'debt') == 'portfolio' or _scope(R, 'financials', 'fund')):
        return False, 'outside'
    return True, ''


def _refusal(role_id, view, topic):
    R = _role(role_id) or {}
    la = R.get('label_a') or 'this role'
    return {'kind': view, 'title': '', 'lead': f"That's outside your access as {la}.", 'data': None, 'basis': None, 'source': '',
            'as_of': base_date().isoformat(), 'draft': None, 'error': 'outside'}


# ---------------------------------------------------------------- drafts

def _channel(role_id, R, rx):
    chans = _ws()._visible_records(role_id, 'chat', 'channels')
    if not chans:
        return None
    if rx:
        hit = next((c for c in chans if re.search(rx, (c.get('name') or '') + ' ' + (c.get('id') or ''), re.I)), None)
        if hit:
            return hit
    return next((c for c in chans if c.get('team') == R.get('team')), chans[0])


def _thread(role_id, rx):
    th = [t for t in _ws()._visible_records(role_id, 'email', 'threads')]
    if rx:
        hit = next((t for t in th if re.search(rx, _ws().tok(t.get('subject') or ''), re.I)), None)
        if hit:
            return hit
    return th[0] if th else None


def _draft(role_id, R, spec):
    """A draft (never sent) for one of the role's own actions, as the agent page's action_draft card."""
    if not spec:
        return None
    w = _ws()
    acts = R.get('actions') or ()
    if spec.get('action') not in acts and spec.get('fallback'):
        spec = spec['fallback']
    action = spec.get('action')
    if action not in acts:
        for alt in ('chat_post', 'reply_email', 'calendar_hold'):
            if alt in acts:
                spec = dict(spec, action=alt, label={'chat_post': 'Post this in your team channel', 'reply_email': 'Reply with this summary',
                                                     'calendar_hold': 'Hold time to act on this'}[alt])
                action = alt
                break
        else:
            return None
    co = R.get('company')
    meta = w._action_meta(action, co)
    app = meta['app']
    if app not in (R.get('apps') or {}):
        return None
    body = re.sub(r'\s+', ' ', spec.get('body') or '').strip()[:600]
    rec = spec.get('record')
    rec = rec[2] if isinstance(rec, tuple) and len(rec) == 3 else None
    rec_id = (rec or {}).get('id') or ''
    fields = []
    if action == 'chat_post':
        ch = _channel(role_id, R, spec.get('channel_rx'))
        rec_id = rec_id or (ch or {}).get('id') or ''
        fields = [{'label': 'Channel', 'value': (ch or {}).get('name') or 'Team channel'}, {'label': 'Message', 'value': body}]
    elif action == 'reply_email':
        t = _thread(role_id, spec.get('thread_rx'))
        if not t:
            return None
        rec_id = t.get('id') or ''
        fields = [{'label': 'To', 'value': w.who(t.get('from'), co, t.get('co'))}, {'label': 'Subject', 'value': 'Re: ' + w.tok(t.get('subject') or '')},
                  {'label': 'Message', 'value': body}]
    elif action == 'calendar_hold':
        fields = [{'label': 'What', 'value': body}, {'label': 'When', 'value': spec.get('when') or 'Not set'}, {'label': 'With', 'value': 'Just you'}]
    elif action == 'crm_stage':
        if not rec:
            return None
        fields = [{'label': 'Deal', 'value': rec.get('name') or ''}, {'label': 'From', 'value': rec.get('stage') or ''},
                  {'label': 'To', 'value': spec.get('stage') or 'Not set'}, {'label': 'Note', 'value': body}]
    elif action == 'book_job':
        cust = w._customer((rec or {}).get('customer')) if rec else None
        fields = [{'label': 'Customer', 'value': f"Customer at {w._addr_line(cust, town=False)}" if cust else 'Not set'},
                  {'label': 'Job', 'value': body}, {'label': 'When', 'value': spec.get('when') or 'Not set'},
                  {'label': 'Technician', 'value': spec.get('tech') or 'To be assigned'}]
    elif action == 'ticket_update':
        if not rec:
            return None
        fields = [{'label': 'Ticket', 'value': f"{rec.get('number')}, {w.tok(rec.get('subject') or '')}"}, {'label': 'Status', 'value': spec.get('stage') or 'In progress'},
                  {'label': 'Note to client', 'value': body}]
    elif action in ('daily_log', 'rfi'):
        if not rec:
            return None
        pname = f"{rec.get('number')}, {rec.get('name')}" if rec.get('number') else (rec.get('name') or '')
        if action == 'daily_log':
            fields = [{'label': 'Project', 'value': pname}, {'label': 'Crew and hours', 'value': spec.get('when') or 'Today'}, {'label': 'Notes', 'value': body}]
        else:
            fields = [{'label': 'Project', 'value': pname}, {'label': 'Question', 'value': body}, {'label': 'Needed by', 'value': spec.get('when') or 'Not set'}]
    elif action in ('text_customer', 'order_part'):
        fields = list(spec.get('fields') or [])
    else:
        return None
    if not body:
        return None
    card_ = w.action_card(role_id, action, app, w.app_name(app, co), spec.get('label') or meta['label'], fields, rec_id, body)
    out = {'action': action, 'label': spec.get('label') or meta['label'], 'body': body, 'app': app, 'app_name': card_['app_name'],
           'fields': card_['fields'], 'status': 'draft', 'card': card_}
    for k in ('stage', 'when'):
        if spec.get(k):
            out[k] = spec[k]
    return out


# ---------------------------------------------------------------- the tool

def _pick_topic(role_id, view, args):
    t = args.get('topic')
    if t:
        return t
    sig = signature(role_id) or {}
    if sig.get('view') == view and (sig.get('args') or {}).get('topic'):
        return sig['args']['topic']
    for t in topics_for(view):
        if access(role_id, view, t, args.get('company'))[0]:
            return t
    ts = topics_for(view)
    return ts[0] if ts else None


def build_view(role_id, view, args=None):
    """One general picture for a role: {kind, title, lead, data, basis, source, as_of, draft}.

    `args`: optional `topic` (which question the picture answers; defaults to the role's signature when the view matches) and
    `company`. A role outside the view's access gets the same keys with data None, error 'outside' and a one-line lead.
    Raises ViewError for an unknown view or topic."""
    args = dict(args) if isinstance(args, dict) else {}
    if view not in KINDS:
        raise ViewError(f'unknown view: {view}')
    topic = _pick_topic(role_id, view, args)
    if topic not in TOPICS or TOPICS[topic][0] != view:
        raise ViewError(f'unknown topic for {view}: {topic}')
    company = args.get('company') if args.get('company') in COS else None
    ok, _why = access(role_id, view, topic, company)
    if not ok:
        return _refusal(role_id, view, topic)
    R = _role(role_id)
    rco = R.get('company')
    target = company or (rco if rco in COS else None)
    if TOPICS[topic][3] in COS:
        target = TOPICS[topic][3]
    if company and rco in COS and company != rco:
        return _refusal(role_id, view, topic)
    if topic == 'company_scorecard' and not target:
        topic = 'portfolio_scorecard'
    if topic == 'plan_bridge' and not target:
        target = 'pp'
    ctx = {'role_id': role_id, 'R': R, 'company': target, 'args': dict(args, company=company or (rco if rco in COS else None)), 'topic': topic}
    w = _ws()
    token = w._READER.set(role_id)
    try:
        res = TOPICS[topic][1](ctx)
    finally:
        w._READER.reset(token)
    if not res:
        return {'kind': view, 'title': '', 'lead': 'No records to draw.', 'data': None, 'basis': None, 'source': '',
                'as_of': base_date().isoformat(), 'draft': None, 'error': 'empty'}
    res['lead'] = _fit_lead(res['lead'])
    res['data']['topic'] = topic
    spec = res.get('draft')
    want = args.get('draft') if isinstance(args.get('draft'), dict) else None   # the catalogue's draft: its action and title win
    d = None
    if want and want.get('action'):
        d = _draft(role_id, R, dict(spec or {}, action=want['action'], **({'label': want['title']} if want.get('title') else {})))
    res['draft'] = d or _draft(role_id, R, spec)
    out = {'kind': view, 'title': res['title'], 'lead': res['lead'], 'data': res['data'], 'basis': res['basis'], 'source': res['source'],
           'as_of': res['as_of'] or base_date().isoformat(), 'draft': res['draft']}
    if res.get('map'):
        out['map'] = res['map']
    return out


def _fit_lead(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    if lead_ok(s):
        return s
    keep = []
    for x in sentences(s):
        if words(x) > SENTENCE_WORDS:
            continue
        if words(' '.join(keep + [x])) > LEAD_WORDS:
            break
        keep.append(x)
    return ' '.join(keep) or ' '.join(s.split()[:SENTENCE_WORDS]).rstrip(',;:') + '.'


def card(view):
    """A view as a card event for the agent page (assets/agent-views.js draws `data` by `kind`)."""
    if not view or view.get('error'):
        return None
    cid = 'vw-' + hashlib.sha1(json.dumps([view['kind'], view['title'], view['as_of']], sort_keys=True).encode('utf-8')).hexdigest()[:8]
    return {'type': 'card', 'kind': view['kind'], 'id': cid, 'title': view['title'], 'lead': view['lead'], 'basis': view['basis'],
            'est': view['basis'] == EST or any(isinstance(x, dict) and x.get('est') for x in _items(view)), 'as_of': view['as_of'],
            'source_line': view['source'], 'data': view['data']}


def map_card(view, tour=None):
    """The 'map_command' card for a picture that has places (a globe-tour signature): a prepared tour by id, or the picture's own
    stops. The shell's map bus (assets/mapcmd.js) flies the globe to them."""
    m = (view or {}).get('map') or ({'tour': tour} if tour else None)
    if tour and not (m or {}).get('tour') and not (m or {}).get('steps'):
        m = {'tour': tour}
    if not m:
        return None
    cmd = {'tour': m['tour']} if m.get('tour') else {'title': m.get('title') or view.get('title') or 'Places', 'source': m.get('source') or '',
                                                       'steps': list(m.get('steps') or [])[:12]}
    if not cmd.get('tour') and not cmd['steps']:
        return None
    cid = 'mc-' + hashlib.sha1(json.dumps(cmd, sort_keys=True).encode('utf-8')).hexdigest()[:8]
    return {'type': 'card', 'kind': 'map_command', 'id': cid, 'title': view.get('title') or cmd.get('title') or 'Globe', 'cmd': cmd}


def _items(view):
    d = view.get('data') or {}
    out = []
    for k in ('rows', 'bars', 'cards', 'steps'):
        out += [x for x in d.get(k) or [] if isinstance(x, dict)]
    for line in d.get('cells') or []:
        if isinstance(line, list):
            out += [x for x in line if isinstance(x, dict)]
    return out


# ---------------------------------------------------------------- the flagship (site_brief) and the prepared answer

class _Sources:
    """The app's Sources contract, enough for one prepared answer."""
    def __init__(self):
        self.items, self.by_key = [], {}

    def add(self, key, title, url='', publisher='', date='', kind=''):
        if key in self.by_key:
            return self.by_key[key]
        self.items.append({'n': len(self.items) + 1, 'title': title, 'url': url, 'publisher': publisher, 'date': date, 'kind': kind})
        self.by_key[key] = len(self.items)
        return len(self.items)

    def header(self, n):
        it = self.items[n - 1]
        return f"[{n}] {it['title']}" + (f" ({it['publisher']})" if it['publisher'] else '')


FLOOR_WORDS = {'basement': 'basement', 'first': 'first floor', 'second': 'second floor'}


def _and_words(xs):
    xs = [x for x in xs if x]
    return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' and ' + xs[-1] if xs else ''


def _site_lead(sig, cards_):
    c = next((x for x in cards_ if x.get('kind') in SITE_KINDS), None)
    addr = sig['args']['address'].rsplit(',', 1)[0]
    if not c:
        return f'{addr}: no plan on record. Dashed means likely.'
    items = []
    for f in c.get('floors') or []:
        for it in f.get('items') or []:
            if it.get('basis') == 'record':
                items.append((not it.get('focus'), f.get('id'), it))
    items.sort(key=lambda x: x[0])
    parts = []
    for _, fl, it in items[:2]:
        note = re.split(r'[,;]', it.get('note') or '')[0].strip().rstrip('.')
        where = FLOOR_WORDS.get(fl, fl or '')
        parts.append(f"{it.get('label')}: {where}" + (f", {note[:1].lower() + note[1:]}" if note else '') + '.')
    wall = re.search(r'behind the (\w+) wall', sig.get('q') or '', re.I)
    if wall:   # "Behind this wall": the runs that touch that room's wall, with their certainty, and nothing more (WAVE3 ruling 9)
        room = wall.group(1).lower()
        runs = [(r, f.get('id')) for f in c.get('floors') or [] for r in f.get('runs') or [] if room in str(r.get('label') or '').lower()]
        if runs:
            certain = {('likely' if r.get('basis') in ('likely', None) else 'on record') for r, _ in runs}
            names = _and_words([str(r.get('label')).lower() for r, _ in runs])
            rise = next((r.get('rise') for r, _ in runs if r.get('rise')), None)
            lead = (f"{addr}, from our records. Behind the {room} wall: {names}, {' and '.join(sorted(certain))}"
                    + (f", rising from the {rise.get('from')}." if rise else '.') + ' Floor plans below; dashed means likely.')
            return _fit_lead(lead)
    has3d = any(x.get('kind') == 'house_model' for x in cards_)
    tail = ('3D model below; dashed means likely.' if has3d and sig['args'].get('view') == 'model'
            else 'Floor plans and 3D view below; dashed means likely.' if sig['args'].get('view') == 'model'
            else 'Floor plans below; dashed means likely.')
    lead = f'{addr}, from our records. ' + ' '.join(parts) + ' ' + tail
    return _fit_lead(lead)


def _site_draft(role_id, R, sig):
    w = _ws()
    action = (sig.get('draft') or {}).get('action')
    if action not in (R.get('actions') or ()):
        return None
    line = sig['args']['address'].split(',')[0].strip().lower()
    cust = next((c for c in w._visible_records(role_id, 'servicetitan', 'customers') if ((c.get('address') or {}).get('line') or '').lower() == line), None)
    if not cust:
        return None
    job = next((j for j in w._visible_records(role_id, 'servicetitan', 'jobs') if j.get('customer') == cust.get('id') and j.get('day') == 0), None)
    if action == 'text_customer':
        spec = {'action': action, 'label': 'Text the customer to clear the path to the water heater',
                'body': 'We are on the way. Please clear a path to the water heater in the basement.',
                'fields': [{'label': 'To', 'value': f"Customer on job {job.get('number')}" if job else f"Customer at {w._addr_line(cust, town=False)}"}]}
    elif action == 'order_part':
        part = next((p for p in w._st().get('parts') or [] if p.get('code') == 'ign-hsi'), None) or {}
        hub = (job or cust).get('team') or R.get('team')
        stock = (part.get('stock') or {}).get(hub)
        hn = (w._team_name(hub) or 'Hub').replace(' hub', '')
        spec = {'action': action, 'label': 'Order the ignitor from the Lancaster hub' if hub == 'lancaster' else 'Order the ignitor from the hub',
                'body': 'Hot-surface ignitor for the furnace on this job.',
                'fields': [{'label': 'Part', 'value': part.get('name') or 'Hot-surface ignitor'}, {'label': 'Quantity', 'value': '1'},
                           {'label': 'Pick up', 'value': f'{hn} hub ({stock} on hand)' if isinstance(stock, int) else f'{hn} hub'},
                           {'label': 'Job', 'value': (job or {}).get('number') or 'Not set'}]}
    elif action == 'book_job':
        spec = {'action': action, 'label': 'Book a plumber for the kitchen wall, plan attached', 'record': ('servicetitan', 'jobs', job or {'customer': cust['id']}),
                'body': 'Plumber to open the kitchen wall behind the sink; plan attached.', 'when': 'Not set'}
    else:
        return None
    if (sig.get('draft') or {}).get('title'):
        spec['label'] = sig['draft']['title']   # the catalogue's draft title
    return _draft(role_id, R, spec)


@contextlib.contextmanager
def frozen_today():
    """Freeze workspace.today() to the data's base date (only for building the static copy, never inside a live request)."""
    w = _ws()
    real = w.today
    b = base_date()
    w.today = lambda: b
    try:
        yield b
    finally:
        w.today = real


def prepared(role_id, connected=None):
    """The role's signature answer with no model call: {role, q, view, text, cards, draft, as_of}.

    `connected`: the apps the person connected (None means all). If a company system the answer reads is not connected, the
    answer is the same "not connected" line the agent gives, with no cards."""
    R = _role(role_id)
    sig = signature(role_id)
    if not R or not sig:
        return None
    w = _ws()
    if sig.get('tool') == 'site_brief':
        need = ['servicetitan']
    else:
        spec = TOPICS.get((sig.get('args') or {}).get('topic')) or (None, None, None)
        need = sorted({a for a, _ in (spec[2] or ())})
    if connected is not None:
        miss = [a for a in need if a not in connected]
        if miss:
            return {'role': role_id, 'q': sig['q'], 'view': sig['view'], 'text': w.not_connected(miss[0], R.get('company')).split('. Ask')[0] + '.',
                    'cards': [], 'draft': None, 'as_of': base_date().isoformat()}
    if sig.get('tool') == 'site_brief':
        ws = {'role': role_id, 'connected': sorted((R.get('apps') or {}).keys()), 'job': None}
        try:
            _text, err, cards_ = w.run_tool('site_brief', dict(sig['args']), ws, _Sources())
        except Exception:   # noqa: BLE001
            err, cards_ = True, []
        cards_ = [] if err else list(cards_ or [])
        d = _site_draft(role_id, R, sig)
        lead = _site_lead(sig, cards_)
        cards_ = [c for c in cards_ if c.get('kind') != 'action_draft']
        if d:
            cards_.append(d['card'])
        view_kind = next((c.get('kind') for c in cards_ if c.get('kind') in SITE_KINDS), sig['view'])
        return {'role': role_id, 'q': sig['q'], 'view': view_kind, 'text': lead, 'basis': REC, 'cards': cards_,
                'draft': {k: v for k, v in d.items() if k != 'card'} if d else None, 'as_of': base_date().isoformat()}
    v = build_view(role_id, sig['view'], dict(sig.get('args') or {}, draft=sig.get('draft')))
    c = card(v)
    cards_ = [c] if c else []
    mc = map_card(v, sig.get('tour'))
    if mc:
        cards_.append(mc)
    if v.get('draft'):
        cards_.append(v['draft']['card'])
    return {'role': role_id, 'q': sig['q'], 'view': v['kind'], 'text': v['lead'], 'basis': v.get('basis'), 'cards': cards_,
            'draft': {k: x for k, x in v['draft'].items() if k != 'card'} if v.get('draft') else None, 'as_of': v['as_of']}


def role_ids():
    ids = list(_catalog_roles().keys())
    if not ids:
        try:
            ids = sorted(_ws().roles().keys())
        except Exception:   # noqa: BLE001
            ids = sorted(SIGNATURES)
    return ids


def build_prepared():
    """Every role's prepared answer, with every date frozen to the data's base date."""
    with frozen_today() as b:
        out = {}
        for rid in role_ids():
            p = prepared(rid)
            if p:
                out[rid] = p
    return {'version': 1, 'base_date': b.isoformat(), 'note': 'Signature answers built from data by server/views.py with no model call. '
            'Company records are example data; public data carries its own source and date.', 'roles': out}


def write_prepared(path=None):
    """Write data/agent/prepared.json (one role per line). Returns the path."""
    path = path or PREPARED
    doc = build_prepared()
    head = {k: v for k, v in doc.items() if k != 'roles'}
    lines = ['{' + ', '.join(f'{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in head.items()) + ', "roles": {']
    rows = [f'{json.dumps(rid)}: {json.dumps(p, ensure_ascii=False, separators=(",", ":"), sort_keys=True)}' for rid, p in doc['roles'].items()]
    lines.append(',\n'.join(rows))
    lines.append('}}')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    os.replace(tmp, path)
    return path


if __name__ == '__main__':   # uv run --no-project --python 3.12 python server/views.py  -> rebuild data/agent/prepared.json
    import sys
    sys.path.insert(0, HERE)
    print(write_prepared(sys.argv[1] if len(sys.argv) > 1 else None))
