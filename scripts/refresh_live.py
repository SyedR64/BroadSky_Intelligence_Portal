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
  manifest.json           per-source status, row counts, bytes, fetched_at, source URLs

Every source is isolated in try/except: one failure never fails the run, and a
failed source keeps its previous snapshot on disk. Stdlib only (urllib).
Usage: python3 scripts/refresh_live.py [--only nws,forecast,...]
"""
import json, os, re, sys, time, datetime as dt, urllib.request, urllib.error, urllib.parse

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
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
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


SOURCES = {'nws_alerts': src_nws, 'forecast_hubs': src_forecast, 'usaspending_trades': src_usaspending, 'echo_npdes_majors': src_echo, 'census_permits': src_census}
ALIASES = {'nws': 'nws_alerts', 'forecast': 'forecast_hubs', 'usaspending': 'usaspending_trades', 'echo': 'echo_npdes_majors', 'census': 'census_permits'}


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
