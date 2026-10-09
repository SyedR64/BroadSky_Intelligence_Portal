#!/usr/bin/env python3
"""Snapshot live public sources into data/live/*.json so the static site has a
fallback when a browser-side live API call fails (CORS, rate limits, outages).

Sources (all public, no keys):
  nws_alerts.json         NWS active alerts for PA, NJ, MA, CT, RI, NH, ME, VT
  forecast_hubs.json      Open-Meteo 7-day forecast (plus 2 observed days) for the 10 Punctual Pros weather hubs;
                          the browser's Live.forecast falls back to the nearest hub when Open-Meteo fails
  usaspending_trades.json USASpending contract awards, NAICS 238210/238220, 8 states, since 2026-01-01
  echo_npdes_majors.json  EPA ECHO NPDES major POTWs (SIC 4952) in CT, MA, RI with compliance status
  census_permits.json     Census Building Permits Survey, newest monthly county file, 8 states
  fred_signals.json       FRED keyless CSVs: rates, credit spreads, home sales and prices, equipment, copper, fuel and
                          power costs, trade labor, legal, hospital and consumer demand (Local signals view), plus monthly
                          customs duties from the Treasury fiscal data API
  housing_counties.json   Realtor.com county housing inventory (newest month) for the portfolio's counties
  nih_awards.json         NIH RePORTER awards issued this year to date vs the same window last year, 8 research
                          states, plus the largest funded institutions
  federal_buying.json     USASpending monthly contract obligations: lab supplies, PR and advertising, northeastern
                          electrical and HVAC trades (fiscal year vs prior year)
  policy_activity.json    Federal Register rules, proposed rules and presidential documents, year to date vs last
                          year, all agencies plus EPA, Energy and HHS
  manifest.json           per-source status, row counts, bytes, fetched_at, source URLs

Every source is isolated in try/except: one failure never fails the run, and a
failed source keeps its previous snapshot on disk. Stdlib only (urllib).
Usage: python3 scripts/refresh_live.py [--only nws,forecast,...]
"""
import csv, io, json, os, re, sys, time, datetime as dt, urllib.request, urllib.error, urllib.parse
from http.client import HTTPException  # a dropped connection mid-response (RemoteDisconnected, IncompleteRead) is retried too

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'live')
UA = 'BroadSkyPortal/1.0 (research)'
STATES = ['PA', 'NJ', 'MA', 'CT', 'RI', 'NH', 'ME', 'VT']
STATE_FIPS = {'PA': '42', 'NJ': '34', 'MA': '25', 'CT': '09', 'RI': '44', 'NH': '33', 'ME': '23', 'VT': '50'}
MAX_BYTES = 2_000_000
FALLBACK_HUBS = [('Lancaster', 40.04, -76.31), ('York', 39.96, -76.73), ('Harrisburg', 40.27, -76.88), ('Carlisle', 40.20, -77.19), ('Reading', 40.34, -75.93),
                 ('Lebanon', 40.34, -76.42), ('Chambersburg', 39.94, -77.66), ('Gettysburg', 39.83, -77.23), ('Toms River', 39.95, -74.20), ('Freehold', 40.26, -74.27)]


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def http(url, data=None, headers=None, timeout=45, retries=2, raw=False):
    h = {'User-Agent': UA, 'Accept': 'application/json'}
    h.update(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h['Content-Type'] = 'application/json'
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=h, method='POST' if body else 'GET')
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b.decode('utf-8', 'replace') if raw else json.loads(b)
        except (urllib.error.URLError, OSError, HTTPException, ValueError) as e:
            last = e
            if isinstance(e, urllib.error.HTTPError) and 400 <= e.code < 500 and e.code != 429:
                break
            wait = 2 * (attempt + 1)
            if isinstance(e, urllib.error.HTTPError) and e.code == 429:   # honour a short Retry-After
                try: wait = max(wait, min(30, int(e.headers.get('Retry-After') or 0)))
                except (TypeError, ValueError): pass
            if attempt < retries:
                time.sleep(wait)
    raise RuntimeError(f'{url}: {last}')


def write(name, payload):
    """Write data/live/<name>.json compactly; trim `items` until under MAX_BYTES."""
    path = os.path.join(OUT, f'{name}.json')
    s = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    items = payload.get('items')
    while len(s.encode()) > MAX_BYTES and isinstance(items, list) and len(items) > 10:
        items = items[: int(len(items) * 0.8)]
        payload['items'] = items
        payload['truncated'] = True
        s = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(s)
    os.replace(tmp, path)
    return len(s.encode()), len(items) if isinstance(items, list) else None


# ── Sources ─────────────────────────────────────────────────────────────────
def src_nws():
    urls, items, errors = [], [], {}
    for st in STATES:
        u = f'https://api.weather.gov/alerts/active?area={st}'
        urls.append(u)
        try:
            j = http(u, headers={'Accept': 'application/geo+json'})
        except Exception as e:  # keep other states
            errors[st] = str(e)[:200]
            continue
        for f in j.get('features', []):
            p = f.get('properties', {})
            items.append({'id': p.get('id'), 'state': st, 'event': p.get('event'), 'severity': p.get('severity'), 'urgency': p.get('urgency'),
                          'certainty': p.get('certainty'), 'headline': p.get('headline'), 'areaDesc': p.get('areaDesc'),
                          'zones': (p.get('geocode') or {}).get('UGC', []), 'fips': (p.get('geocode') or {}).get('SAME', []),
                          'onset': p.get('onset'), 'ends': p.get('ends') or p.get('expires'), 'sent': p.get('sent'), 'sender': p.get('senderName'),
                          'description': (p.get('description') or '')[:1500], 'instruction': (p.get('instruction') or '')[:800]})
    if len(errors) == len(STATES):
        raise RuntimeError('all NWS requests failed: ' + json.dumps(errors)[:400])
    counts = {st: sum(1 for i in items if i['state'] == st) for st in STATES}
    return {'dataset': 'nws_alerts', 'title': 'National Weather Service active alerts', 'states': STATES, 'counts_by_state': counts, 'errors': errors, 'source_urls': urls, 'items': items}


def hubs():
    try:
        j = json.load(open(os.path.join(ROOT, 'data', 'research', 'pp_demand_model.json')))
        hs = [(i['name'], float(i['lat']), float(i['lon'])) for i in j.get('items', []) if i.get('component') == 'weather_hub' and i.get('lat') is not None]
        if hs:
            return hs, 'data/research/pp_demand_model.json'
    except Exception:
        pass
    return FALLBACK_HUBS, 'fallback list'


def src_forecast():
    hs, origin = hubs()
    lat = ','.join(f'{h[1]:.4f}' for h in hs)
    lon = ','.join(f'{h[2]:.4f}' for h in hs)
    daily = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,snowfall_sum'
    u = ('https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode({'latitude': lat, 'longitude': lon, 'daily': daily, 'temperature_unit': 'fahrenheit',
         'wind_speed_unit': 'mph', 'precipitation_unit': 'inch', 'timezone': 'America/New_York', 'forecast_days': 7, 'past_days': 2}))
    j = http(u)
    if isinstance(j, dict):
        j = [j]
    items = []
    for (name, la, lo), r in zip(hs, j):
        d = r.get('daily', {})
        items.append({'hub': name, 'lat': la, 'lon': lo, 'days': [
            {'date': t, 'tmax': d['temperature_2m_max'][k], 'tmin': d['temperature_2m_min'][k], 'precip': d['precipitation_sum'][k],
             'pop': (d.get('precipitation_probability_max') or [None] * 99)[k], 'wind': d['wind_speed_10m_max'][k], 'gust': d['wind_gusts_10m_max'][k],
             'code': d['weather_code'][k], 'snow': d['snowfall_sum'][k]} for k, t in enumerate(d.get('time', []))]})
    return {'dataset': 'forecast_hubs', 'title': 'Open-Meteo 7-day forecast, Punctual Pros weather hubs', 'hub_source': origin,
            'units': {'temp': 'F', 'precip': 'in', 'wind': 'mph'}, 'source_urls': [u], 'items': items}


def src_usaspending():
    u = 'https://api.usaspending.gov/api/v2/search/spending_by_award/'
    today = dt.date.today().isoformat()
    fields = ['Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date', 'Awarding Agency', 'Awarding Sub Agency',
              'Place of Performance State Code', 'Place of Performance City Code', 'NAICS', 'Description', 'generated_internal_id']
    filters = {'award_type_codes': ['A', 'B', 'C', 'D'], 'naics_codes': {'require': ['238210', '238220']},
               'place_of_performance_locations': [{'country': 'USA', 'state': s} for s in STATES],
               'time_period': [{'start_date': '2026-01-01', 'end_date': today}]}
    items, page = [], 1
    while len(items) < 300:
        j = http(u, data={'filters': filters, 'fields': fields, 'limit': 100, 'page': page, 'sort': 'Award Amount', 'order': 'desc'}, timeout=90)
        for r in j.get('results', []):
            n = r.get('NAICS') or {}
            gid = r.get('generated_internal_id')
            items.append({'award_id': r.get('Award ID'), 'recipient': r.get('Recipient Name'), 'amount': r.get('Award Amount'), 'start': r.get('Start Date'),
                          'end': r.get('End Date'), 'agency': r.get('Awarding Agency'), 'sub_agency': r.get('Awarding Sub Agency'),
                          'state': r.get('Place of Performance State Code'), 'naics': n.get('code') if isinstance(n, dict) else n,
                          'description': (r.get('Description') or '')[:300], 'url': f'https://www.usaspending.gov/award/{gid}' if gid else None})
        if not (j.get('page_metadata') or {}).get('hasNext'):
            break
        page += 1
    items = items[:300]
    by_state = {s: {'count': 0, 'amount': 0.0} for s in STATES}
    for i in items:
        if i['state'] in by_state:
            by_state[i['state']]['count'] += 1
            by_state[i['state']]['amount'] += float(i['amount'] or 0)
    return {'dataset': 'usaspending_trades', 'title': 'Federal contract awards to electrical (238210) and plumbing/HVAC (238220) contractors',
            'filters': {'naics': ['238210', '238220'], 'states': STATES, 'since': '2026-01-01', 'award_types': 'contracts A-D', 'sort': 'amount desc', 'max_rows': 300},
            'by_state': by_state, 'source_urls': [u], 'items': items}


def src_echo():
    cols = '1,2,4,5,12,26,27,28,29,53,61,62,67,68,99,100,101,103,105,116,123,194'
    base = 'https://echodata.epa.gov/echo/cwa_rest_services.'
    items, urls = [], []
    for st in ['CT', 'MA', 'RI']:
        q = base + 'get_facilities?' + urllib.parse.urlencode({'output': 'JSON', 'p_st': st, 'p_sic': '4952', 'p_maj': 'Y'})
        urls.append(q)
        qid = http(q, timeout=90)['Results']['QueryID']
        page = 1
        while True:
            r = http(base + 'get_qid?' + urllib.parse.urlencode({'output': 'JSON', 'qid': qid, 'pageno': page, 'qcolumns': cols}), timeout=90)['Results']
            fac = r.get('Facilities') or []
            for f in fac:
                items.append({'name': f.get('CWPName'), 'npdes_id': f.get('SourceID'), 'city': f.get('CWPCity'), 'state': f.get('CWPState'), 'county': f.get('CWPCounty'),
                              'lat': f.get('FacLat'), 'lon': f.get('FacLong'), 'design_flow_mgd': f.get('CWPTotalDesignFlowNmbr'), 'actual_flow_mgd': f.get('CWPActualAverageFlowNmbr'),
                              'permit_status': f.get('CWPPermitStatusDesc'), 'permit_expires': f.get('CWPExpirationDate'), 'major_minor': f.get('CWPMajorMinorStatusFlag'),
                              'days_since_inspection': f.get('CWPDaysLastInspection'), 'last_inspection': f.get('CWPDateLastInspection'), 'status': f.get('CWPStatus'),
                              'snc_status': f.get('CWPSNCStatus'), 'violation_status': f.get('CWPVioStatus'), 'qtrs_with_nc': f.get('CWPQtrsWithNC'),
                              'qtrs_with_snc': f.get('CWPQtrsWithSNC'), 'formal_actions': f.get('CWPFormalEaCnt'), 'total_penalties': f.get('CWPTotalPenalties'),
                              'snc_event': f.get('CWPSNCEventDesc'),
                              'url': f"https://echo.epa.gov/detailed-facility-report?fid={f.get('SourceID')}" if f.get('SourceID') else None})
            total = int(r.get('QueryRows') or 0)
            if not fac or sum(1 for i in items if i['state'] == st) >= total or page >= 10:
                break
            page += 1
    counts = {st: sum(1 for i in items if i['state'] == st) for st in ['CT', 'MA', 'RI']}
    return {'dataset': 'echo_npdes_majors', 'title': 'EPA ECHO: major municipal wastewater (SIC 4952) NPDES permittees, CT/MA/RI',
            'counts_by_state': counts, 'source_urls': urls, 'items': items}


def src_census():
    idx_url = 'https://www2.census.gov/econ/bps/County/'
    listing = http(idx_url, raw=True, headers={'Accept': 'text/html'})
    files = sorted(set(re.findall(r'href="(co(\d{2})(\d{2})c\.txt)"', listing)), key=lambda x: (x[1], x[2]))
    files = [f for f in files if f[1] in ('25', '26', '27')]
    if not files:
        raise RuntimeError('no monthly county files found in listing')
    fname, yy, mm = files[-1]
    u = idx_url + fname
    text = http(u, raw=True, headers={'Accept': 'text/plain'}, timeout=90)
    fips_to_state = {v: k for k, v in STATE_FIPS.items()}
    items = []
    for line in text.splitlines()[2:]:
        p = [x.strip() for x in line.split(',')]
        if len(p) < 18 or p[1] not in fips_to_state:
            continue
        n = lambda k: int(float(p[k] or 0))
        items.append({'state': fips_to_state[p[1]], 'fips': p[1] + p[2], 'county': p[5], 'units_1': n(7), 'units_2': n(10), 'units_3_4': n(13), 'units_5p': n(16),
                      'units_total': n(7) + n(10) + n(13) + n(16), 'value_total': n(8) + n(11) + n(14) + n(17), 'bldgs_1': n(6)})
    if not items:
        raise RuntimeError(f'{fname}: no rows parsed for target states')
    items.sort(key=lambda r: -r['units_total'])
    totals = {s: sum(r['units_total'] for r in items if r['state'] == s) for s in STATES}
    return {'dataset': 'census_permits', 'title': 'Census Building Permits Survey, monthly county estimates (current month)', 'file': fname,
            'period': f'20{yy}-{mm}', 'units_by_state': totals, 'source_urls': [u], 'items': items}


# ── Local signals: the market, cost, labor and funding factors beyond the weather (modules/signals.js) ─────────
def _prev_items(name):
    """Items of the snapshot already on disk, keyed by id (used to carry a series forward when one fetch fails)."""
    try:
        return {i.get('id'): i for i in json.load(open(os.path.join(OUT, f'{name}.json'))).get('items', []) if isinstance(i, dict)}
    except Exception:
        return {}


def _same_day(d, year):
    try:
        return d.replace(year=year)
    except ValueError:  # Feb 29
        return d.replace(year=year, day=28)


# (FRED id, plain label, unit, frequency, factor group). Units ending in % are compared in points, the rest in percent.
FRED_SERIES = [
    ('MORTGAGE30US', '30-year mortgage rate', '%', 'weekly', 'financing'),
    ('BAMLH0A0HYM2', 'Junk-bond spread (cost of buyout debt)', '%', 'daily', 'financing'),
    ('DPRIME', 'Bank prime rate (vans, equipment, credit lines)', '%', 'daily', 'financing'),
    ('EXHOSLUSM495S', 'Existing home sales, US (annual pace)', 'homes', 'monthly', 'housing'),
    ('HOUST', 'Housing starts, US (annual pace)', 'thousand homes', 'monthly', 'housing'),
    ('TLNRESCONS', 'Commercial and public construction spending, US (annual pace)', '$M', 'monthly', 'housing'),
    ('PASTHPI', 'Home prices, Pennsylvania', 'index', 'quarterly', 'housing'),
    ('NJSTHPI', 'Home prices, New Jersey', 'index', 'quarterly', 'housing'),
    ('MASTHPI', 'Home prices, Massachusetts', 'index', 'quarterly', 'housing'),
    ('CTSTHPI', 'Home prices, Connecticut', 'index', 'quarterly', 'housing'),
    ('PCU333415333415', 'Prices of heating and air-conditioning equipment', 'index', 'monthly', 'costs'),
    ('PCOPPUSDM', 'Copper price', '$ per metric ton', 'monthly', 'costs'),
    ('PCU335311335311', 'Prices of transformers', 'index', 'monthly', 'costs'),
    ('PCU3353133531', 'Prices of switchgear', 'index', 'monthly', 'costs'),
    ('PCU334516334516', 'Prices of lab instruments', 'index', 'monthly', 'costs'),
    ('GASREGW', 'Gasoline price', '$ per gallon', 'weekly', 'costs'),
    ('GASDESW', 'Diesel price', '$ per gallon', 'weekly', 'costs'),
    ('APU000072610', 'Electricity price, US average', '$ per kWh', 'monthly', 'costs'),
    ('APU000072511', 'Heating oil price, US average', '$ per gallon', 'monthly', 'costs'),
    ('CES2023800001', 'Specialty trade contractor jobs, US', 'thousand', 'monthly', 'labor'),
    ('JTS2300JOL', 'Construction job openings, US', 'thousand', 'monthly', 'labor'),
    ('CES2000000003', 'Construction pay per hour, US', '$', 'monthly', 'labor'),
    ('CES6000000003', 'Professional services pay per hour, US', '$', 'monthly', 'labor'),
    ('CES6054150001', 'Computer services jobs, US', 'thousand', 'monthly', 'labor'),
    ('PAUR', 'Unemployment rate, Pennsylvania', '%', 'monthly', 'labor'),
    ('NJUR', 'Unemployment rate, New Jersey', '%', 'monthly', 'labor'),
    ('MAUR', 'Unemployment rate, Massachusetts', '%', 'monthly', 'labor'),
    ('CTUR', 'Unemployment rate, Connecticut', '%', 'monthly', 'labor'),
    ('DCUR', 'Unemployment rate, District of Columbia', '%', 'monthly', 'labor'),
    ('MOUR', 'Unemployment rate, Missouri', '%', 'monthly', 'labor'),
    ('UMCSENT', 'Consumer sentiment', 'index', 'monthly', 'demand'),
    ('RSCCAS', 'Clothing store sales, US', '$M', 'monthly', 'demand'),
    ('CES6054110001', 'Legal services jobs, US', 'thousand', 'monthly', 'demand'),
    ('PCU541110541110', 'Prices charged by law firms', 'index', 'monthly', 'demand'),
    ('CES6562200001', 'Hospital jobs, US', 'thousand', 'monthly', 'demand'),
    ('PCU541810541810', 'Prices charged by advertising agencies', 'index', 'monthly', 'demand'),
    ('CP', 'Corporate profits after tax, US (annual pace)', '$B', 'quarterly', 'demand'),
]


def _fred_csv(sid):
    text = http(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', raw=True, headers={'Accept': 'text/csv'}, timeout=30, retries=1)
    obs = []
    for line in text.strip().splitlines()[1:]:
        d, _, v = line.partition(',')
        try:
            obs.append((dt.date.fromisoformat(d.strip()), float(v)))
        except ValueError:  # '.' marks a missing observation
            continue
    if not obs:
        raise RuntimeError(f'{sid}: no observations')
    return obs


def _fred_item(sid, label, unit, freq, group, obs):
    last_d, last_v = obs[-1]
    target = _same_day(last_d, last_d.year - 1) + dt.timedelta(days=3)
    prior = [o for o in obs if o[0] <= target]
    ya = prior[-1] if prior and (target - prior[-1][0]).days <= 120 else None
    months = {}
    for d, v in obs:  # month-end resample keeps the file small and the charts on one monthly axis
        months[f'{d.year}-{d.month:02d}'] = v
    keys = sorted(months)[-(12 if freq == 'quarterly' else 25):]
    pts = [[k, round(months[k], 4)] for k in keys]
    pts_mode = unit.endswith('%')
    chg = None
    if ya is not None:
        chg = round(last_v - ya[1], 3) if pts_mode else (round(last_v / ya[1] - 1, 4) if ya[1] else None)
    return {'id': sid, 'label': label, 'unit': unit, 'freq': freq, 'group': group, 'last': round(last_v, 4), 'date': last_d.isoformat(),
            'year_ago': round(ya[1], 4) if ya else None, 'year_ago_date': ya[0].isoformat() if ya else None,
            'chg': chg, 'chg_kind': 'pts' if pts_mode else 'pct', 'points': pts, 'url': f'https://fred.stlouisfed.org/series/{sid}'}


def src_fred():
    """FRED keyless CSV downloads, one request at a time (FRED drops parallel connections)."""
    prev = _prev_items('fred_signals')
    items, errors, ok = [], {}, 0
    for k, (sid, label, unit, freq, group) in enumerate(FRED_SERIES):
        if k:
            time.sleep(1.0)
        try:
            items.append(_fred_item(sid, label, unit, freq, group, _fred_csv(sid)))
            ok += 1
        except Exception as e:
            errors[sid] = str(e)[:200]
            if sid in prev:  # keep yesterday's reading for this series, flagged
                items.append({**prev[sid], 'stale': True})
    if ok < len(FRED_SERIES) / 2:
        raise RuntimeError(f'only {ok} of {len(FRED_SERIES)} FRED series fetched: ' + json.dumps(errors)[:300])
    # tariffs: customs duties collected each month, from the Treasury's Monthly Treasury Statement (keyless)
    tu = ('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_4?'
          'filter=classification_desc:eq:Customs%20Duties&sort=-record_date&page[size]=40&fields=record_date,current_month_gross_rcpt_amt')
    try:
        rows = http(tu, timeout=45).get('data') or []
        obs = sorted((dt.date.fromisoformat(r['record_date']), float(r['current_month_gross_rcpt_amt']) / 1e6) for r in rows if r.get('current_month_gross_rcpt_amt'))
        it = _fred_item('CUSTOMS', 'Customs duties collected (tariffs)', '$M per month', 'monthly', 'costs', obs)
        it['url'] = 'https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/receipts-of-the-u-s-government'
        items.append(it)
    except Exception as e:
        errors['CUSTOMS'] = str(e)[:200]
        if 'CUSTOMS' in prev:
            items.append({**prev['CUSTOMS'], 'stale': True})
    return {'dataset': 'fred_signals', 'title': 'FRED economic series behind the local signals view, plus Treasury customs duties', 'publisher': 'Federal Reserve Bank of St. Louis (FRED); US Treasury',
            'errors': errors, 'source_urls': [f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={s[0]}' for s in FRED_SERIES] + [tu], 'items': items}


# County FIPS -> (label, state, portfolio companies whose footprint, HQ or office it is). CT uses planning regions.
PORTFOLIO_COUNTIES = {
    '42071': ('Lancaster', 'PA', ['pp']), '42133': ('York', 'PA', ['pp']), '42043': ('Dauphin', 'PA', ['pp']), '42041': ('Cumberland', 'PA', ['pp']),
    '42011': ('Berks', 'PA', ['pp']), '42075': ('Lebanon', 'PA', ['pp']), '42055': ('Franklin', 'PA', ['pp']), '42001': ('Adams', 'PA', ['pp']),
    '42099': ('Perry', 'PA', ['pp']), '42029': ('Chester', 'PA', ['pp']), '42091': ('Montgomery', 'PA', ['pp']),
    '34029': ('Ocean', 'NJ', ['pp']), '34025': ('Monmouth', 'NJ', ['pp']), '34001': ('Atlantic', 'NJ', ['pp']), '34005': ('Burlington', 'NJ', ['pp']),
    '25027': ('Worcester', 'MA', ['cet']), '25005': ('Bristol', 'MA', ['cet']), '25023': ('Plymouth', 'MA', ['cet']), '25017': ('Middlesex', 'MA', ['cet']),
    '25021': ('Norfolk', 'MA', ['cet']), '25009': ('Essex', 'MA', ['cet']), '25025': ('Suffolk', 'MA', ['cet']), '25013': ('Hampden', 'MA', ['cet']),
    '25015': ('Hampshire', 'MA', ['cet']), '09110': ('Capitol region', 'CT', ['cet']), '09120': ('Greater Bridgeport', 'CT', ['cet']),
    '09140': ('Naugatuck Valley', 'CT', ['cet']), '09170': ('South Central', 'CT', ['cet']), '09190': ('Western', 'CT', ['cet']),
    '09180': ('Southeastern', 'CT', ['cet']), '44007': ('Providence', 'RI', ['cet']),
    '34015': ('Gloucester', 'NJ', ['ts']), '29189': ('St. Louis County', 'MO', ['fl']), '29510': ('St. Louis city', 'MO', ['fl']),
    '11001': ('District of Columbia', 'DC', ['bpi']), '36061': ('Manhattan', 'NY', ['bpi', 'fh']), '06075': ('San Francisco', 'CA', ['bpi']),
    '17031': ('Cook (Chicago)', 'IL', ['bpi']),
}


def src_realtor():
    u = 'https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_County.csv'
    text = http(u, raw=True, headers={'Accept': 'text/csv'}, timeout=90)
    if len(text) > 20_000_000:
        raise RuntimeError('county file larger than expected')

    def num(r, k, nd=4):
        try:
            return round(float(r.get(k) or ''), nd)
        except ValueError:
            return None
    items, month = [], None
    for r in csv.DictReader(io.StringIO(text)):
        f = str(r.get('county_fips') or '').strip()
        if not f.isdigit() or f.zfill(5) not in PORTFOLIO_COUNTIES:
            continue
        f = f.zfill(5)
        label, st, cos = PORTFOLIO_COUNTIES[f]
        m = str(r.get('month_date_yyyymm') or '')
        month = month or (f'{m[:4]}-{m[4:6]}' if len(m) == 6 else None)
        items.append({'id': f, 'fips': f, 'county': label, 'state': st, 'cos': cos, 'month': f'{m[:4]}-{m[4:6]}' if len(m) == 6 else None,
                      'active': num(r, 'active_listing_count', 0), 'active_yy': num(r, 'active_listing_count_yy'),
                      'new': num(r, 'new_listing_count', 0), 'new_yy': num(r, 'new_listing_count_yy'),
                      'pending': num(r, 'pending_listing_count', 0), 'pending_yy': num(r, 'pending_listing_count_yy'),
                      'dom': num(r, 'median_days_on_market', 0), 'dom_yy': num(r, 'median_days_on_market_yy'),
                      'price': num(r, 'median_listing_price', 0), 'price_yy': num(r, 'median_listing_price_yy'),
                      'price_reduced_share': num(r, 'price_reduced_share'), 'quality_flag': num(r, 'quality_flag', 0)})
    if len(items) < len(PORTFOLIO_COUNTIES) / 2:
        raise RuntimeError(f'only {len(items)} portfolio counties found in the county file')
    return {'dataset': 'housing_counties', 'title': 'Realtor.com county housing inventory, portfolio counties (newest month)', 'publisher': 'Realtor.com Economic Research',
            'month': month, 'notes': '_yy fields are changes vs the same month last year (0.1 = +10%). quality_flag 1 = the publisher flags the month as less reliable.',
            'source_urls': [u, 'https://www.realtor.com/research/data/'], 'items': items}


NIH_STATES = ['CA', 'MA', 'NY', 'PA', 'MD', 'NC', 'TX', 'NJ']


def src_nih():
    """NIH awards with a notice date from Jan 1 to today, this year vs the same window last year (sub-projects excluded)."""
    u = 'https://api.reporter.nih.gov/v2/projects/search'
    today = dt.date.today()
    windows = {'current': (f'{today.year}-01-01', today.isoformat()), 'prior': (f'{today.year - 1}-01-01', _same_day(today, today.year - 1).isoformat())}
    states, orgs, calls = [], {}, 0
    for st in NIH_STATES:
        row = {'id': st, 'state': st}
        for w, (a, b) in windows.items():
            crit = {'award_notice_date': {'from_date': a, 'to_date': b}, 'org_states': [st], 'exclude_subprojects': True}
            seen, amt, offset, total = set(), 0.0, 0, 0
            while True:
                if calls:
                    time.sleep(0.4)  # RePORTER asks for about one request a second
                j = http(u, data={'criteria': crit, 'include_fields': ['ApplId', 'AwardAmount', 'Organization'], 'offset': offset, 'limit': 500,
                                  'sort_field': 'appl_id', 'sort_order': 'asc'}, timeout=90)
                calls += 1
                total = int((j.get('meta') or {}).get('total') or 0)
                res = j.get('results') or []
                for r in res:
                    if r.get('appl_id') in seen:
                        continue
                    seen.add(r.get('appl_id'))
                    v = float(r.get('award_amount') or 0)
                    amt += v
                    o = r.get('organization') or {}
                    key = (str(o.get('org_name') or 'Unknown').strip(), st)
                    rec = orgs.setdefault(key, {'org': key[0], 'state': st, 'city': (o.get('org_city') or '').title(), 'current': 0.0, 'prior': 0.0, 'current_n': 0, 'prior_n': 0})
                    rec[w] += v
                    rec[w + '_n'] += 1
                offset += len(res)
                if not res or offset >= total or offset >= 14500:
                    break
            row[w + '_count'] = len(seen)
            row[w + '_amount'] = round(amt)
            row[w + '_partial'] = offset < total
        states.append(row)
    top = sorted(orgs.values(), key=lambda o: -o['current'])[:15]
    for o in top:
        o['current'], o['prior'] = round(o['current']), round(o['prior'])
    return {'dataset': 'nih_awards', 'title': 'NIH research awards, year to date vs the same window last year, 8 research states', 'publisher': 'NIH RePORTER',
            'windows': windows, 'states': NIH_STATES, 'requests': calls, 'top_orgs': top,
            'notes': 'Counts and dollars of awards with a notice date in each window; multi-project sub-awards excluded so parent awards are not double counted.',
            'source_urls': [u, 'https://reporter.nih.gov/'], 'items': states}


def src_fedbuy():
    """USASpending monthly contract obligations for three portfolio-relevant buying lines (fiscal year Oct-Sep)."""
    u = 'https://api.usaspending.gov/api/v2/search/spending_over_time/'
    today = dt.date.today()
    fy_now = today.year + (1 if today.month >= 10 else 0)
    period = [{'start_date': f'{fy_now - 3}-10-01', 'end_date': today.isoformat()}]
    segs = [
        ('lab_supplies', 'Federal buying of lab equipment and supplies', ['ts'], {'psc_codes': {'require': [['Product', '66', '6640']]}}, 'Product code 6640, laboratory equipment and supplies'),
        ('communications', 'Federal contracts to PR and advertising firms', ['bpi'], {'naics_codes': {'require': ['541820', '541810']}}, 'Industry codes 541820 (public relations) and 541810 (advertising)'),
        ('trades_northeast', 'Federal contracts to electrical and HVAC contractors, 8 northeastern states', ['cet', 'pp'],
         {'naics_codes': {'require': ['238210', '238220']}, 'place_of_performance_locations': [{'country': 'USA', 'state': s} for s in STATES]},
         'Industry codes 238210 (electrical) and 238220 (plumbing and HVAC), work performed in PA, NJ, MA, CT, RI, NH, ME, VT'),
    ]
    items = []
    for k, (sid, label, cos, f, basis) in enumerate(segs):
        if k:
            time.sleep(1.0)
        j = http(u, data={'group': 'month', 'filters': {'award_type_codes': ['A', 'B', 'C', 'D'], 'time_period': period, **f}}, timeout=90)
        months, fy = [], {}
        for r in j.get('results') or []:
            tp = r.get('time_period') or {}
            fyr, fm = int(tp.get('fiscal_year')), int(tp.get('month'))
            y, m = (fyr - 1, fm + 9) if fm <= 3 else (fyr, fm - 3)
            v = float(r.get('aggregated_amount') or 0)
            months.append([f'{y}-{m:02d}', round(v)])
            fy[str(fyr)] = fy.get(str(fyr), 0) + v
        months.sort()
        last_full = str(fy_now - 1)
        cur, prv = fy.get(last_full), fy.get(str(fy_now - 2))
        items.append({'id': sid, 'label': label, 'cos': cos, 'basis': basis, 'months': months, 'fy_totals': {k2: round(v2) for k2, v2 in fy.items()},
                      'last_full_fy': int(last_full), 'chg': round(cur / prv - 1, 4) if cur and prv else None})
    return {'dataset': 'federal_buying', 'title': 'Federal contract obligations by month for portfolio-relevant buying lines', 'publisher': 'USASpending.gov',
            'notes': 'Fiscal years run October to September. Obligations can be negative in a month when earlier awards are reduced.',
            'source_urls': [u, 'https://www.usaspending.gov/search'], 'items': items}


def src_fedreg():
    """Federal Register document counts by type, year to date vs the same window last year."""
    today = dt.date.today()
    windows = {'current': (f'{today.year}-01-01', today.isoformat()), 'prior': (f'{today.year - 1}-01-01', _same_day(today, today.year - 1).isoformat())}
    groups = [('all', None, 'All agencies', ['bpi']), ('epa', 'environmental-protection-agency', 'Environmental Protection Agency', ['cet', 'pp']),
              ('energy', 'energy-department', 'Energy Department', ['cet', 'pp']), ('hhs', 'health-and-human-services-department', 'Health and Human Services', ['ts'])]
    items, urls = [], []
    for k, (gid, slug, label, cos) in enumerate(groups):
        row = {'id': gid, 'label': label, 'cos': cos}
        for w, (a, b) in windows.items():
            q = [('conditions[publication_date][gte]', a), ('conditions[publication_date][lte]', b)] + ([('conditions[agencies][]', slug)] if slug else [])
            url = 'https://www.federalregister.gov/api/v1/documents/facets/type?' + urllib.parse.urlencode(q)
            if w == 'current':
                urls.append(url)
            if k or w == 'prior':
                time.sleep(0.5)
            j = http(url, timeout=45)
            row[w] = {t: int((j.get(t) or {}).get('count') or 0) for t in ('RULE', 'PRORULE', 'PRESDOCU', 'NOTICE')}
        items.append(row)
    return {'dataset': 'policy_activity', 'title': 'Federal Register rules and proposed rules, year to date vs last year', 'publisher': 'Federal Register (National Archives)',
            'windows': windows, 'source_urls': urls, 'items': items}


SOURCES = {'nws_alerts': src_nws, 'forecast_hubs': src_forecast, 'usaspending_trades': src_usaspending, 'echo_npdes_majors': src_echo, 'census_permits': src_census,
           'fred_signals': src_fred, 'housing_counties': src_realtor, 'nih_awards': src_nih, 'federal_buying': src_fedbuy, 'policy_activity': src_fedreg}
ALIASES = {'nws': 'nws_alerts', 'forecast': 'forecast_hubs', 'usaspending': 'usaspending_trades', 'echo': 'echo_npdes_majors', 'census': 'census_permits',
           'fred': 'fred_signals', 'housing': 'housing_counties', 'realtor': 'housing_counties', 'nih': 'nih_awards', 'fedbuy': 'federal_buying', 'fedreg': 'policy_activity'}


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    only = None
    if '--only' in argv:
        only = {ALIASES.get(x, x) for x in argv[argv.index('--only') + 1].split(',')}
    mpath = os.path.join(OUT, 'manifest.json')
    try:
        manifest = json.load(open(mpath))
    except Exception:
        manifest = {}
    manifest.setdefault('sources', {})
    ok = 0
    for name, fn in SOURCES.items():
        if only and name not in only:
            continue
        t0 = time.time()
        prev = manifest['sources'].get(name, {})
        try:
            payload = fn()
            payload = {'fetched_at': now_iso(), **payload}
            size, rows = write(name, payload)
            manifest['sources'][name] = {'status': 'ok', 'file': f'data/live/{name}.json', 'fetched_at': payload['fetched_at'], 'rows': rows, 'bytes': size,
                                         'seconds': round(time.time() - t0, 1), 'source_urls': payload.get('source_urls', [])[:10], 'title': payload.get('title')}
            ok += 1
            print(f'  ok    {name:20s} {rows} rows  {size/1e3:.0f} KB  {time.time()-t0:.1f}s')
        except Exception as e:
            manifest['sources'][name] = {**prev, 'status': 'error', 'error': str(e)[:500], 'attempted_at': now_iso(),
                                         'last_ok_at': prev.get('fetched_at') if prev.get('status') == 'ok' else prev.get('last_ok_at')}
            print(f'  FAIL  {name:20s} {str(e)[:200]}')
    manifest['generated_at'] = now_iso()
    manifest['note'] = 'Nightly snapshots of public live sources (scripts/refresh_live.py). A source with status error keeps its previous file.'
    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=1)
    print(f'refresh_live: {ok} source(s) ok -> {mpath}')
    return 0  # never fail the run


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
