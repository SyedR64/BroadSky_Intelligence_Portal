"""
Records the live-address contract fixtures (design_live_address.md section 7.1) from REAL calls to free public services,
against PUBLIC BUILDINGS only (a town hall, county courthouses, a township park), never a private home.

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python tests/fixtures/site/record_fixtures.py

Each fixture file holds:
  typed        the address as a visitor would type it
  recorded     the date of the calls
  calls        every outgoing request (url, params) and the response as received, in order. Requests name a fixed field
               whitelist, so no owner, mailing, buyer or seller field is ever in a response; the recorder still passes every
               attribute dict through site_sources.scrub before writing, and refuses to write if a blocked key slipped through.
  adapters     what each site_sources adapter returned for those calls (tests replay the calls and compare)
  card         an example floor_sketch card with the new place, building and facts fields (None where nothing is drawn)
  map_command  an example map command card (steps of kind "site")

The card and the map command are examples of the contract for lanes C1 to C4; they are built here with simple geometry
(the real geometry is lane S2's) and the existing sketch() rules. They are not what the endpoint will return byte for byte.
"""

import datetime
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, SERVER)

import property as homes          # noqa: E402
import site_sources as S          # noqa: E402
import workspace as W             # noqa: E402

SCENARIOS = [
    {'name': 'nj_full', 'typed': '33 Washington St, Toms River, NJ 08753', 'state': 'NJ', 'county': 'Ocean', 'town': 'Toms River',
     'zip': '08753', 'issue': 'sink repair', 'what': 'Toms River Town Hall (public building)'},
    {'name': 'pa_york_full', 'typed': '45 N George St, York, PA 17401', 'state': 'PA', 'county': 'York', 'town': 'York', 'zip': '17401',
     'issue': 'sink repair', 'what': 'York County Judicial Center (public building)'},
    {'name': 'pa_franklin_full', 'typed': '157 Lincoln Way E, Chambersburg, PA 17201', 'state': 'PA', 'county': 'Franklin', 'town': 'Chambersburg',
     'zip': '17201', 'issue': 'sink repair', 'what': 'Franklin County Courthouse (public building)'},
    {'name': 'pa_lancaster_outline_only', 'typed': '50 N Duke St, Lancaster, PA 17602', 'state': 'PA', 'county': 'Lancaster', 'town': 'Lancaster',
     'zip': '17602', 'issue': 'sink repair', 'what': 'Lancaster County Courthouse (public building)'},
    {'name': 'town_only', 'typed': '1 Zzyzx Test Ln, Lititz, PA 17543', 'state': 'PA', 'county': 'Lancaster', 'town': 'Lititz', 'zip': '17543',
     'issue': 'sink repair', 'what': 'a street that does not exist, in Lititz'},
    {'name': 'choose', 'typed': '200 Georgia Rd, Freehold, NJ', 'state': 'NJ', 'county': 'Monmouth', 'town': 'Freehold', 'zip': None,
     'issue': 'sink repair', 'what': 'Freehold Township park land, four public lots at one address'},
]

CEIL = {'parcel': 19, 'typed': 16.5, 'town': 12.5}


# ---------------------------------------------------------------- recording

class Recorder:
    def __init__(self, real):
        self.real, self.calls = real, []

    def __call__(self, url, params, timeout=None):
        try:
            resp = self.real(url, params, timeout=timeout or S.CALL_TIMEOUT)
        except Exception as e:                                  # noqa: BLE001
            self.calls.append({'url': url, 'params': dict(params), 'error': type(e).__name__})
            raise
        self.calls.append({'url': url, 'params': dict(params), 'response': clean_response(resp)})
        return resp


def clean_response(resp):
    """Scrub every attribute dict, then check nothing blocked is left anywhere in the response."""
    if isinstance(resp, dict) and isinstance(resp.get('features'), list):
        resp = dict(resp)
        resp['features'] = [dict(f, attributes=S.scrub(f.get('attributes'))) if isinstance(f, dict) else f for f in resp['features']]
        resp.pop('fields', None)
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if S.blocked_key(k) and k not in ('outFields',):
                    raise SystemExit(f'blocked key in a response: {k}')
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(resp)
    return resp


# ---------------------------------------------------------------- simple geometry (the real one is lane S2's)

M_PER_DEG = 111320.0


def to_local(ring, origin):
    k = math.cos(math.radians(origin[1]))
    return [[round((p[0] - origin[0]) * k * M_PER_DEG, 2), round((p[1] - origin[1]) * M_PER_DEG, 2)] for p in ring]


def to_ll(pts, origin):
    k = math.cos(math.radians(origin[1]))
    return [[round(origin[0] + x / (k * M_PER_DEG), 7), round(origin[1] + y / M_PER_DEG, 7)] for x, y in pts]


def simplify(pts, tol=0.15):
    if len(pts) < 4:
        return pts
    def dp(a):
        if len(a) < 3:
            return a
        (x1, y1), (x2, y2) = a[0], a[-1]
        L = math.hypot(x2 - x1, y2 - y1) or 1e-9
        d = [abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / L for x, y in a[1:-1]]
        i = max(range(len(d)), key=d.__getitem__)
        if d[i] <= tol:
            return [a[0], a[-1]]
        return dp(a[:i + 2])[:-1] + dp(a[i + 1:])
    closed = pts[0] == pts[-1]
    body = pts[:-1] if closed else pts
    far = max(range(len(body)), key=lambda i: math.hypot(body[i][0] - body[0][0], body[i][1] - body[0][1]))
    out = dp(body[:far + 1])[:-1] + dp(body[far:] + [body[0]])
    return out if out[0] == out[-1] else out + [out[0]]


def ring_area(pts):
    return abs(sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))) / 2


def hull(pts):
    p = sorted(set(map(tuple, pts)))
    if len(p) < 3:
        return p
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for q in p:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], q) <= 0:
            hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]


def min_rect(pts):
    """(w_m, d_m, rot_deg): the oriented minimum rectangle; rot_deg is the long side's angle from east, counter-clockwise."""
    h = hull(pts)
    best = None
    for i in range(len(h)):
        a = math.atan2(h[(i + 1) % len(h)][1] - h[i][1], h[(i + 1) % len(h)][0] - h[i][0])
        c, s = math.cos(-a), math.sin(-a)
        xs = [x * c - y * s for x, y in h]
        ys = [x * s + y * c for x, y in h]
        w, d = max(xs) - min(xs), max(ys) - min(ys)
        if best is None or w * d < best[0]:
            best = (w * d, w, d, math.degrees(a))
    _, w, d, rot = best
    if d > w:
        w, d, rot = d, w, rot + 90
    return w, d, (rot + 180) % 180


def inside(pt, ring):
    x, y, n, ok = pt[0], pt[1], len(ring), False
    for i in range(n - 1):
        (x1, y1), (x2, y2) = ring[i], ring[i + 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            ok = not ok
    return ok


def cap(pts, n):
    if len(pts) <= n:
        return pts
    step = math.ceil((len(pts) - 1) / (n - 1))
    out = pts[:-1:step]
    return out + [pts[0]]


# ---------------------------------------------------------------- example card and map command

def fact_val(facts, *keys):
    for k in keys:
        for f in facts:
            if f['k'] == k:
                return f
    return None


def build_card(sc, place, parcel, buildings, extra_facts, permits):
    facts = [dict(f) for f in list(parcel['facts']) + list(extra_facts)]      # copies: the adapter output stays as returned
    sources = []

    def n_of(src, date=None):
        for i, s in enumerate(sources):
            if s['_id'] == src:
                return i + 1
        sources.append(dict(S.source_entry(src, date), _id=src))
        return len(sources)

    origin_parcel = parcel['centroid']
    # the building on the lot: the real pick (server/site.py), so the example card draws what the endpoint draws
    prim, outs, _lot = W.site_module()._primary_building(buildings, parcel['ring_ll'], None, facts) if parcel['ring_ll'] else (None, [], None)
    origin = prim['centroid'] if prim else origin_parcel
    year_f = fact_val(facts, 'year_built')
    area_f = fact_val(facts, 'living_area_sqft', 'floor_area_sqft')
    st_f = fact_val(facts, 'stories')
    cr = W._county_rule(sc['county'], sc['state'])
    year = year_f['v'] if year_f else (cr.get('median_year') or 1975)
    era = W._era(year)
    stories = st_f['v'] if st_f else (era.get('stories') or 2)
    fm = cr.get('fuel') or {'gas': 1.0}
    fuel = max(sorted(fm), key=lambda k: fm[k])
    fnd = W._foundation(sc['state'], year)
    house = {'year': year, 'sqft': area_f['v'] if area_f else None, 'stories': stories, 'style': era.get('style'), 'foundation': fnd,
             'basement': 'full' if fnd == 'basement' else 'none', 'fuel': fuel, 'garage': None}
    issue = W._issue_for(sc['issue'])
    focus = issue.get('focus') or []
    items = W._likely_items(house, set(), focus)
    runs = W._likely_runs(house, items, [])
    for f in facts:
        f['n'] = n_of(f['src'], f['as_of'])
    area = W.area_of(sc['zip'], sc['town'], sc['state'])
    hbasis = {'year': 'public' if year_f else 'likely', 'fuel': 'likely', 'layout': 'likely', 'card': 'likely'}
    card = W.sketch(sc['typed'], house, items, runs, hbasis, area, issue, focus,
                    'Public record and likely layout. No company record for this address.', [n_of('nj_parcels' if sc['state'] == 'NJ' else parcel['src'])])
    building = {'frame': {'origin': {'lon': origin[0], 'lat': origin[1]}, 'units': 'm', 'x': 'east', 'y': 'north'}}
    if prim:
        ring_m = cap(simplify(to_local(prim['ring_ll'], origin)), 48)
        w, d, rot = min_rect(ring_m)
        w_ft, d_ft = round(w * 3.28084), round(d * 3.28084)
        building['footprint'] = {'ring_m': ring_m, 'area_m2': round(ring_area(ring_m), 1), 'w_ft': w_ft, 'd_ft': d_ft, 'rot_deg': round(rot, 1),
                                 'basis': 'public', 'src': n_of('structures', prim['as_of']), 'as_of': prim['as_of'], 'method': 'outline from imagery',
                                 'outbuildings': [dict({'ring_m': cap(simplify(to_local(b['ring_ll'], origin)), 48), 'basis': 'public'},
                                                       **({'kind': 'building'} if b.get('sizeable') else {})) for b in outs[:4]]}
        lot = W.site_module()._lot_block(_lot)
        if lot:
            building['lot'] = lot
        hm = prim['height_m']
        n = stories if isinstance(stories, (int, float)) else 2
        if hm and 2.7 * n <= hm <= 12:
            building['height'] = {'eave_m': round(hm, 1), 'ridge_m': round(hm, 1), 'from': 'source', 'basis': 'public', 'src': building['footprint']['src']}
        else:
            building['height'] = {'eave_m': round(n * 2.7, 1), 'ridge_m': round(n * 2.7 + 2.6, 1), 'from': 'storeys', 'basis': 'likely',
                                  'src': building['footprint']['src']}
        for fl in card['floors']:                               # the plan rectangle becomes the outline's oriented rectangle
            sx, sy = w_ft / fl['w'], d_ft / fl['h']
            fl['w'], fl['h'] = w_ft, d_ft
            for it in fl['items']:
                it['x'], it['y'] = round(it['x'] * sx, 1), round(it['y'] * sy, 1)
            for r in fl['runs']:
                r['points'] = [[round(x * sx, 1), round(y * sy, 1)] for x, y in r['points']]
            for rm in fl['rooms']:
                rm['x'], rm['y'], rm['w'], rm['h'] = round(rm['x'] * sx), round(rm['y'] * sy), round(rm['w'] * sx), round(rm['h'] * sy)
    building['storeys'] = {'n': stories, 'basis': 'public' if st_f else 'likely'} | ({'src': st_f['n']} if st_f else {})
    if parcel['ring_ll']:
        pr = cap(simplify(to_local(parcel['ring_ll'], origin)), 40)
        building['parcel'] = {'ring_m': pr, 'area_m2': round(ring_area(pr), 1), 'basis': 'public', 'src': n_of(parcel['src'], parcel['as_of'])}
    if prim and place.get('precision') == 'typed':
        dx = (place['lon'] - origin[0]) * math.cos(math.radians(origin[1])) * M_PER_DEG
        dy = (place['lat'] - origin[1]) * M_PER_DEG
        building['front'] = {'bearing_deg': round((math.degrees(math.atan2(dx, dy)) + 360) % 360), 'basis': 'public', 'from': 'geocoded street point'}
    else:
        building['front'] = {'bearing_deg': None, 'basis': 'likely', 'from': 'assumed'}
    card['place'] = {'label': place['label'], 'lat': place['lat'], 'lon': place['lon'], 'precision': 'parcel', 'geocoder': 'parcel centroid',
                     'basis': 'public', 'src': n_of(parcel['src'], parcel['as_of'])}
    card['building'] = building
    card['front_basis'] = building['front']['basis']
    card['facts'] = [{'k': f['k'], 'label': f['label'], 'v': f['v'], 'basis': 'public', 'src': f['n'], 'as_of': f['as_of']} for f in facts]
    if permits:
        card['permits'] = [{'date': p['date'], 'type': p['type'], 'trades': p['trades'], 'basis': 'public', 'src': n_of('nj_permits')} for p in permits[:6]]
    card['sources'] = [{'n': i + 1, **{k: v for k, v in s.items() if k != '_id'}} for i, s in enumerate(sources)]
    return card, prim, origin


def map_cmd(sc, steps):
    return {'type': 'card', 'kind': 'map_command', 'id': 'mc-' + sc['name'],
            'cmd': {'title': sc['typed'], 'source': 'site', 'steps': steps}}


def site_step(label, lat, lon, precision, sub, bearing=None, outline=None, height=None, hbasis=None):
    st = {'kind': 'site', 'lat': round(lat, 6), 'lon': round(lon, 6), 'label': label, 'sub': sub, 'precision': precision,
          'zoom': CEIL[precision] if precision != 'parcel' else 18.5, 'pitch': 60 if precision == 'parcel' else 0,
          'bearing': bearing or 0, 'hold_ms': 8000 if precision == 'parcel' else 4000}
    if outline:
        st['outline'] = outline
        st['height_m'] = height
        st['height_basis'] = hbasis
    return st


def label_of(typed):
    return typed.split(',')[0].strip() + ', ' + typed.split(',')[1].strip() if ',' in typed else typed


# ---------------------------------------------------------------- scenarios

def run(sc):
    rec = Recorder(homes._get_json)
    homes._get_json = rec
    try:
        key = S.street_key(sc['typed'].split(',')[0])
        out = {'geocode': S.geocode(sc['typed'])}
        g = (out['geocode'].get('matches') or [None])[0]
        near = (g['lat'], g['lon']) if g else None
        if sc['state'] == 'NJ':
            out['parcels'] = S.nj_parcels(key, county=sc['county'], town=sc['town'], near=near)
        else:
            out['parcels'] = S.pa_parcels(sc['county'], key, town=sc['town'], near=near)
        parcels = out['parcels'].get('parcels') or []
        card, cmd = None, None
        town = S.town_point(zip=sc['zip'], town=sc['town'], state=sc['state'])['place'] or {}
        town_step = site_step(sc['town'] + ', ' + sc['state'], town.get('lat') or (g or {}).get('lat'), town.get('lon') or (g or {}).get('lon'), 'town',
                              'Town')
        if len(parcels) == 1:
            p = parcels[0]
            out['footprints'] = S.footprints(ring_ll=p['ring_ll'])
            if p['id'].get('block') and sc['state'] == 'NJ':
                out['permits'] = S.nj_permits(p['id']['muni_code'], p['id']['block'], p['id']['lot'])
            out['elevation'] = S.elevation(p['centroid'][1], p['centroid'][0])
            place = {'label': sc['typed'], 'lat': p['centroid'][1], 'lon': p['centroid'][0], 'precision': 'typed' if g else 'parcel'}
            if g:
                place.update({'lat': g['lat'], 'lon': g['lon']})
            extra = [out['elevation']['fact']] if out['elevation'].get('fact') else []
            card, prim, origin = build_card(sc, place, p, out['footprints'].get('buildings') or [], extra, (out.get('permits') or {}).get('permits'))
            card['place'].update({'lat': origin[1], 'lon': origin[0]})
            b = card['building']
            outline = to_ll(b['footprint']['ring_m'], origin) if b.get('footprint') else None
            sub = ('Parcel match · outline from imagery dated ' + datetime.date.fromisoformat(b['footprint']['as_of']).strftime('%b %Y')
                   if b.get('footprint') else 'Parcel match · no building outline')
            cmd = map_cmd(sc, [town_step, site_step(label_of(sc['typed']), origin[1], origin[0], 'parcel', sub, b['front'].get('bearing_deg'),
                                                   outline, (b.get('height') or {}).get('ridge_m'), (b.get('height') or {}).get('basis'))])
        elif len(parcels) > 1:
            cmd = map_cmd(sc, [town_step] + [site_step(p['label'], p['centroid'][1], p['centroid'][0], 'typed', 'One of several lots at this address')
                                             for p in parcels[:6]])
        elif g:
            cmd = map_cmd(sc, [town_step, site_step(label_of(sc['typed']), g['lat'], g['lon'], 'typed', 'Street match · no parcel')])
        else:
            out['town'] = S.town_point(zip=sc['zip'], town=sc['town'], state=sc['state'])
            cmd = map_cmd(sc, [site_step(sc['town'] + ', ' + sc['state'], town['lat'], town['lon'], 'town', 'Town only · the house was not found')])
        status = 'found' if len(parcels) == 1 else 'choose' if len(parcels) > 1 else 'town_only' if not g else 'typed'
        return {'name': sc['name'], 'typed': sc['typed'], 'issue': sc['issue'], 'what': sc['what'], 'status': status,
                'recorded': S._today().isoformat(), 'calls': rec.calls, 'adapters': out, 'card': card, 'map_command': cmd}
    finally:
        homes._get_json = rec.real


POISON = {
    'Parcels_Composite_NJ_WM': {'OWNER_NAME': 'ZZTEST NAME', 'ST_ADDRESS': 'ZZTEST STREET', 'CITY_STATE': 'ZZTEST CITY', 'ZIP_CODE': '00000', 'SALE_PRICE': 999999},
    'OPEN_DATA/Parcels': {'OWNER_FULL': 'ZZTEST NAME', 'OWN_NAME1': 'ZZTEST NAME', 'MAIL_ADDR1': 'ZZTEST STREET', 'PREV_OWNER': 'ZZTEST NAME', 'PRICE': 999999},
    'FC_TaxRecords': {'FULL_OWNER': 'ZZTEST NAME', 'OWNER_FNAME1': 'ZZTEST NAME', 'OWNER_ADDRESS_1': 'ZZTEST STREET', 'PREVIOUS_OWNER_1': 'ZZTEST NAME'},
    'Parcels_HUBnew': {'OWNER_NAME': 'ZZTEST NAME', 'OWNERADD1': 'ZZTEST STREET', 'OWNER_ZIP': '00000', 'SALE_PRICE': 999999},
    'USA_Structures_View': {'PROP_ADDR': 'ZZTEST STREET', 'OWNER_NAME': 'ZZTEST NAME'},
}


def write_poison():
    """owner_poison.json: the recorded responses of the four found fixtures with owner, mailing, previous-owner and price keys
    added to every attribute dict (and an owner key on each geocoder match). Synthetic, for the privacy tests."""
    import copy
    out = {'note': ('Synthetic poison for the privacy tests: the recorded responses of nj_full, pa_york_full, pa_franklin_full and '
                    'pa_lancaster_outline_only with owner, mailing, previous-owner and sale-price keys added to every attribute dict. '
                    'The strings ZZTEST NAME and ZZTEST STREET must never reach any adapter output, card or map command.'),
           'poison': POISON, 'fixtures': {}}
    for n in ('nj_full', 'pa_york_full', 'pa_franklin_full', 'pa_lancaster_outline_only'):
        with open(os.path.join(HERE, n + '.json'), encoding='utf-8') as f:
            calls = copy.deepcopy(json.load(f)['calls'])
        for c in calls:
            for k, extra in POISON.items():
                if k in c['url']:
                    for ft in (c.get('response') or {}).get('features') or []:
                        ft['attributes'].update(extra)
            if 'geocoding' in c['url']:
                for m in c['response']['result']['addressMatches']:
                    m['ownerName'] = 'ZZTEST NAME'
        out['fixtures'][n] = calls
    with open(os.path.join(HERE, 'owner_poison.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
        f.write('\n')


def main():
    if sys.argv[1:] == ['--poison-only']:
        write_poison()
        return
    for sc in SCENARIOS:
        fx = run(sc)
        text = json.dumps(fx, indent=1, ensure_ascii=False)
        for bad in ('OWNER', 'OWN1', 'MAIL_', 'PREV_OWNER', 'SALE_PRICE'):
            if bad in text:
                raise SystemExit(f'{sc["name"]}: {bad} in the fixture')
        with open(os.path.join(HERE, sc['name'] + '.json'), 'w', encoding='utf-8') as f:
            f.write(text + '\n')
        print(sc['name'], fx['status'], len(fx['calls']), 'calls', len(text), 'bytes')
    write_poison()


if __name__ == '__main__':
    main()
