"""
The live site brief: a real address typed by a visitor, answered from public records with a floor plan, a 3D shell and a map.

Lane S3 of the live address design (os/design_live_address.md sections 2, 3 and 5). No model call, no key, no company record
for a real address. Three parts:

  lookup(parsed, area, pick=None, deadline_s=8.0)
        The resolve ladder (design 2.2), each step through site_sources.py:
          1  the local sales row (property.lookup_record): parcel centroid, year, size, rooms          precision parcel
          2  New Jersey: the statewide parcel layer by address text                                    precision parcel
          3  Pennsylvania: the county parcel layer for a wired county                                  precision parcel
          4  the Census geocoder on the cleaned one-line address                                       precision typed
          4b parcels within 60 m of that point whose address equals the typed one                      upgrades to parcel
          5  the town or ZIP centre                                                                    precision town
        then the building outline (USA Structures), NJ permits and the ground elevation. Steps 2 to 4 run side by side.
        Each call has its own 2.5 s timeout (site_sources.CALL_TIMEOUT); the whole lookup stops at deadline_s (8 s) and returns
        whatever answered, naming the rest in 'degraded'. Results are cached in memory: 24 hours for an answer, 5 minutes for
        "not found", 60 seconds for an answer with a missing source.
  dress(card, live, house, add_source)
        Adds to the floor_sketch card that workspace.sketch() built: place, building (the real outline in local metres through
        site_geo.py, height, storeys, parcel, front), facts, and the inferred plan fitted inside the outline (rooms, wet walls,
        snapped equipment and runs). Every element carries its basis. Nothing inferred is ever 'public'.
  brief(text, role_id, connected=None, deadline_s=8.0)
        The endpoint's answer: {status, text (40 words at most), cards: [floor_sketch, map_command], choices, sources, degraded}.

Privacy (WAVE3 ruling 4): no request names an owner, mailing, buyer or seller field (site_sources whitelists and guard), the
local sales table holds no names, and the sale price is never read. Nothing here logs the typed address.

Import note: `import property as homes`, never a bare `import property`. workspace is imported inside functions (it imports this
module lazily too). Author: Syed Rahman.
"""

import concurrent.futures as cf
import datetime
import hashlib
import logging
import math
import re
import threading
import time

import property as homes
import site_geo
import site_sources as sources

log = logging.getLogger('bsp.site')

TOTAL_S = 8.0
TTL_FOUND, TTL_PARTIAL, TTL_MISS = 24 * 3600, 60, 300
CACHE_MAX = 1000
CEIL = {'parcel': 19.0, 'typed': 16.5, 'town': 12.5}          # zoom ceiling by how well the point is known (WAVE3 ruling 2)
ZOOM = {'parcel': 18.5, 'typed': 16.5, 'town': 12.5}
STATUSES = ('found', 'choose', 'not_found', 'outside', 'error')
WORDS_MAX, SENTENCE_MAX = 40, 18
BANNED = re.compile(r'\b(example|sandbox|fictional)\b', re.I)
FT = site_geo.FT

_pool = cf.ThreadPoolExecutor(max_workers=8, thread_name_prefix='site')
_cache: dict = {}
_cache_lock = threading.Lock()
_key_locks: dict = {}


def live_on():
    """Live calls follow the property module's switch (PROPERTY_LIVE=off turns every network step off)."""
    return bool(getattr(homes, 'LIVE_ON', True))


def reset():
    with _cache_lock:
        _cache.clear()
        _key_locks.clear()


# ---------------------------------------------------------------- cache

def _cache_get(key):
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        if hit:
            _cache.pop(key, None)
    return None


def _cache_put(key, value, ttl):
    with _cache_lock:
        if len(_cache) >= CACHE_MAX:
            for k in sorted(_cache, key=lambda k: _cache[k][0])[:max(1, CACHE_MAX // 10)]:
                _cache.pop(k, None)
        _cache[key] = (time.monotonic() + ttl, value)


def _lock_for(key):
    with _cache_lock:
        lk = _key_locks.get(key)
        if lk is None:
            lk = _key_locks[key] = threading.Lock()
        return lk


def _ttl(res):
    if res['status'] == 'not_found':
        return TTL_MISS
    return TTL_PARTIAL if res.get('degraded') else TTL_FOUND


# ---------------------------------------------------------------- small helpers

def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _title_town(t):
    return ' '.join(w[:1].upper() + w[1:].lower() if w.isupper() or w.islower() else w for w in str(t or '').split())


def label_of(parsed, town=None, state=None, zip_=None):
    """The normalised typed address: "418 Wexcombe Ln, Lititz, PA 17543". Never an owner, never a sales-file name."""
    line = re.sub(r'\s+', ' ', str(parsed.get('line') or '')).strip(' ,')
    tail = ' '.join(x for x in (state or parsed.get('state'), zip_ or parsed.get('zip')) if x)
    return ', '.join(x for x in (line, _title_town(town or parsed.get('town')), tail) if x)


def one_line(parsed, town=None, state=None, zip_=None):
    return label_of(parsed, town, state, zip_)


def _pick_key(p):
    pid = p.get('id') or {}
    raw = pid.get('pams_pin') or pid.get('county_pin') or '|'.join(str(pid.get(k) or '') for k in ('muni_code', 'block', 'lot', 'qual'))
    return 'p-' + hashlib.sha1(str(raw).encode('utf-8')).hexdigest()[:10]


def _wait(futs, until):
    """Wait for named futures until a monotonic deadline. {name: result}; a future still running or failed is left out."""
    left = max(0.0, until - time.monotonic())
    done, _ = cf.wait(list(futs.values()), timeout=left)
    out = {}
    for name, f in futs.items():
        if f in done:
            try:
                out[name] = f.result()
            except Exception as e:                                  # noqa: BLE001 (one source failing drops that source only)
                log.warning('site: %s failed: %s', name, type(e).__name__)
    return out


def _sale_fact(k, label, v, rec):
    s = rec.get('source') or {}
    return {'k': k, 'label': label, 'v': v, 'basis': 'public', 'src': 'sales', 'source': s.get('title') or 'Recorded property sales',
            'as_of': s.get('date') or None, 'date_kind': 'retrieved'}


# ---------------------------------------------------------------- the ladder

def _county_for(parsed, area):
    county, state = (area or {}).get('county'), (area or {}).get('state') or parsed.get('state')
    if not county:
        tp = sources.town_point(zip=parsed.get('zip'), town=parsed.get('town'), state=state)
        pl = tp.get('place') or {}
        county = pl.get('county') or None
        state = state or pl.get('state')
    if not county and parsed.get('town'):
        # A postal town the ZIP table names only inside a longer place name ("Freehold" in "West Freehold"): its county, when
        # only one county carries the name in that state. It only narrows the parcel query; step 4b recovers a wrong guess.
        t = re.escape(str(parsed['town']).strip().upper())
        cs = {(re.sub(r'\s+County$', '', str(r['county'] or '')), r['state']) for r in sources._zip_rows()
              if re.search(r'\b' + t + r'\b', str(r['city'] or '').upper()) and (not state or r['state'] == state)}
        if len(cs) == 1:
            county, st = next(iter(cs))
            state = state or st
    return county, state


def _pick_parcel(parcels, rec, pick):
    """One parcel, several (a choice), or none."""
    if not parcels:
        return None, []
    if pick:
        hit = [p for p in parcels if _pick_key(p) == pick]
        return (hit[0], []) if hit else (None, [])
    if rec and rec.get('parcel'):
        rp = rec['parcel']
        for p in parcels:
            pid = p.get('id') or {}
            if rp.get('county_pin') and str(pid.get('county_pin') or '') == str(rp['county_pin']):
                return p, []
            if rp.get('block') and str(pid.get('block')) == str(rp.get('block')) and str(pid.get('lot')) == str(rp.get('lot')):
                return p, []
    if len(parcels) == 1:
        return parcels[0], []
    return None, parcels


def _primary_building(buildings, parcel_ring, point_ll):
    """The house: the largest outline that is not an outbuilding and whose centre is inside the parcel; with no parcel, the one
    holding the point, else the nearest within 25 m. The rest inside the parcel are outbuildings (rings only)."""
    bs = [b for b in buildings or [] if b.get('ring_ll')]
    if not bs:
        return None, []
    if parcel_ring:
        pr, origin = site_geo.ll_to_m(parcel_ring)
        inside = [b for b in bs if site_geo.point_in_ring(site_geo.point_ll_to_m(b['centroid'], origin), pr)]
        mains = sorted((b for b in inside if not b.get('outbuilding')), key=lambda b: -(b.get('area_m2') or 0))
        if mains:
            return mains[0], [b for b in inside if b is not mains[0]][:4]
        return None, []
    if not point_ll:
        return None, []
    best, bd = None, None
    for b in bs:
        if b.get('outbuilding'):
            continue
        ring, origin = site_geo.ll_to_m(b['ring_ll'])
        p = site_geo.point_ll_to_m(point_ll, origin)
        d = 0.0 if site_geo.point_in_ring(p, ring) else site_geo.dist_to_boundary(p, ring)
        if d <= 25 and (bd is None or d < bd):
            best, bd = b, d
    return best, []


def lookup(parsed, area=None, pick=None, deadline_s=TOTAL_S):
    """Resolve one typed address to public facts (the SiteFacts of design 2.1). Cached; never raises on a source failure.

    Returns {status: 'found' | 'choose' | 'not_found', precision: 'parcel' | 'typed' | 'town' | None, label, line, town, state, zip,
    county, record, parcel, geocode, town_place, building, outbuildings, permits, facts: [fact], choose: [{label, key}],
    degraded: [source names], seconds}. 'found' means the house is placed (parcel or typed); a town alone is 'not_found'."""
    parsed = dict(parsed or {})
    key = (parsed.get('key') or '', (parsed.get('zip') or (parsed.get('town') or '').upper()), parsed.get('state') or '', pick or '', live_on())
    hit = _cache_get(key)
    if hit is not None:
        return hit
    with _lock_for(key):                                        # two identical lookups make one set of upstream calls
        hit = _cache_get(key)
        if hit is not None:
            return hit
        res = _resolve(parsed, area, pick, deadline_s)
        _cache_put(key, res, _ttl(res))
        return res


def _resolve(parsed, area, pick, deadline_s):
    t0 = time.monotonic()
    until = t0 + max(0.5, float(deadline_s or TOTAL_S))
    degraded = []
    county, state = _county_for(parsed, area)
    town, zip_ = parsed.get('town'), parsed.get('zip')
    res = {'status': 'not_found', 'precision': None, 'line': parsed.get('line'), 'town': town, 'state': state, 'zip': zip_, 'county': county,
           'record': None, 'parcel': None, 'geocode': None, 'town_place': None, 'building': None, 'outbuildings': [], 'permits': [],
           'facts': [], 'choose': [], 'degraded': degraded, 'seconds': 0.0}
    if not parsed.get('key') or not parsed.get('house_no'):
        res['town_place'] = sources.town_point(zip=zip_, town=town, state=state).get('place')
        res['precision'] = 'town' if res['town_place'] else None
        res['label'] = label_of(parsed, town, state, zip_)
        return res
    # 1. the local sales row: no network, about a millisecond
    rec = None
    try:
        r1 = homes.lookup_record({'address': parsed.get('line'), 'municipality': town or '', 'county': county or '', 'state': state or '',
                                  'zip': zip_ or '', 'pick': pick if pick and not str(pick).startswith('p-') else ''})
        if r1.get('status') == 'not_found' and town and (zip_ or county):
            # a postal town that is another municipality ("Camp Hill" for Lower Allen Township): state, county and ZIP only
            r1 = homes.lookup_record({'address': parsed.get('line'), 'county': county or '', 'state': state or '', 'zip': zip_ or '',
                                      'pick': pick if pick and not str(pick).startswith('p-') else ''})
    except Exception as e:                                      # noqa: BLE001
        log.warning('site: sales lookup failed: %s', type(e).__name__)
        r1 = {'status': 'unavailable'}
    if r1.get('status') == 'choose' and not pick:
        res.update(status='choose', choose=list(r1.get('choose') or [])[:6], label=label_of(parsed, town, state, zip_))
        return res
    if r1.get('status') == 'found':
        rec = r1['record']
        res['record'] = rec
        state = state or rec.get('state')
        county = county or rec.get('county')
        zip_ = zip_ or rec.get('zip')
        res.update(state=state, county=county, zip=zip_)
    elif r1.get('status') == 'unavailable':
        degraded.append('sales')
    key = sources.street_key(parsed.get('line'))
    geo = parcel = None
    candidates = []
    if live_on():
        # 2, 3 and 4 side by side: the parcel layer by address text and the geocoder
        futs = {'geocode': _pool.submit(sources.geocode, one_line(parsed, town, state, zip_))}
        if state == 'NJ':
            muni = ((rec or {}).get('parcel') or {}).get('muni_code')
            futs['parcel'] = _pool.submit(sources.nj_parcels, key, county=county, town=town, muni_code=muni)
        elif state == 'PA' and county in sources.PA_COUNTIES:
            futs['parcel'] = _pool.submit(sources.pa_parcels, county, key, town=town)
        got = _wait(futs, min(until, time.monotonic() + 4.0))
        g = got.get('geocode')
        if not g or not g.get('ok'):
            degraded.append('geocoder')
        elif g.get('matches'):
            geo = g['matches'][0]
            res['geocode'] = geo
        if 'parcel' in futs:
            pr = got.get('parcel')
            if not pr or not pr.get('ok'):
                degraded.append('parcel')
            else:
                parcel, candidates = _pick_parcel(pr.get('parcels') or [], rec, pick)
        if geo:                                                 # the geocoder can name the ZIP and state the typed text left out
            parts = geo.get('parts') or {}
            zip_ = zip_ or parts.get('zip')
            state = state or parts.get('state')
            res.update(zip=zip_, state=state)
        if parcel is None and not candidates and geo and time.monotonic() < until:
            # 4b. parcels within 60 m of the street point whose address equals the typed one
            near = None
            if state == 'NJ':
                near = _pool.submit(sources.nj_parcels_near, key, geo['lat'], geo['lon'])
            else:
                if not county:
                    county = (sources.town_point(zip=zip_, state=state).get('place') or {}).get('county')
                    res['county'] = county
                if state == 'PA' and county in sources.PA_COUNTIES:
                    near = _pool.submit(sources.pa_parcels_near, county, key, geo['lat'], geo['lon'])
            if near:
                got = _wait({'near': near}, min(until, time.monotonic() + 3.0))
                nr = got.get('near')
                if not nr or not nr.get('ok'):
                    degraded.append('parcel')
                else:
                    parcel, candidates = _pick_parcel(nr.get('parcels') or [], rec, pick)
    if candidates and not rec:
        cs = candidates[:6]
        labs = [p.get('label') or p.get('addr') or '' for p in cs]
        dup = len(set(labs)) < len(labs)
        res.update(status='choose', label=label_of(parsed, town, state, zip_), geocode=geo,
                   town_place=sources.town_point(zip=zip_, town=town, state=state).get('place'),
                   choose=[{'label': lab + (f', lot {i + 1} of {len(cs)}' if dup else ''), 'key': _pick_key(p),
                            'lat': (p.get('centroid') or [None, None])[1], 'lon': (p.get('centroid') or [None, None])[0]}
                           for i, (p, lab) in enumerate(zip(cs, labs))])
        return res
    res['parcel'] = parcel
    res['label'] = label_of(parsed, town, state, zip_)
    # facts: the sales row, then the parcel's assessor row
    F = []
    if rec:
        if rec.get('year_built'):
            F.append(_sale_fact('year_built', 'Year built', rec['year_built'], rec))
        if rec.get('sqft'):
            F.append(_sale_fact('living_area_sqft', 'Living area (sq ft)', rec['sqft'], rec))
        if rec.get('beds'):
            F.append(_sale_fact('beds', 'Bedrooms', rec['beds'], rec))
    have = {f['k'] for f in F}
    for f in (parcel or {}).get('facts') or []:
        if f.get('k') not in have:
            F.append(dict(f))
    # where the house is, and how well it is known
    point = None
    if parcel and parcel.get('centroid'):
        point, res['precision'] = list(parcel['centroid']), 'parcel'
    elif rec and rec.get('lat') is not None and rec.get('lon') is not None:
        point, res['precision'] = [rec['lon'], rec['lat']], 'parcel'
    elif geo:
        point, res['precision'] = [geo['lon'], geo['lat']], 'typed'
    res['town_place'] = sources.town_point(zip=zip_, town=town, state=state).get('place')
    if point is None:
        res['precision'] = 'town' if res['town_place'] else None
        res['facts'] = F
        res['seconds'] = round(time.monotonic() - t0, 3)
        return res
    res['status'] = 'found'
    res['point'] = point
    # enrich side by side: the outline, NJ permits, ground elevation
    if live_on() and time.monotonic() < until:
        futs = {}
        ring = (parcel or {}).get('ring_ll')
        futs['footprint'] = _pool.submit(sources.footprints, ring_ll=ring) if ring else _pool.submit(sources.footprints, lat=point[1], lon=point[0], distance_m=25)
        pid = (parcel or {}).get('id') or ((rec or {}).get('parcel') if state == 'NJ' else None) or {}
        if state == 'NJ' and pid.get('block') and pid.get('lot') and pid.get('muni_code'):
            futs['permits'] = _pool.submit(sources.nj_permits, pid['muni_code'], pid['block'], pid['lot'])
        futs['elevation'] = _pool.submit(sources.elevation, point[1], point[0])
        got = _wait(futs, until)
        fp = got.get('footprint')
        if not fp or not fp.get('ok'):
            degraded.append('footprint')
        else:
            prim, outs = _primary_building(fp.get('buildings') or [], ring, point if not ring else None)
            res['building'], res['outbuildings'] = prim, outs
        if 'permits' in futs:
            pm = got.get('permits')
            if not pm or not pm.get('ok'):
                degraded.append('permits')
            else:
                res['permits'] = (pm.get('permits') or [])[:6]
        ev = got.get('elevation')
        if not ev or not ev.get('ok'):
            degraded.append('elevation')
        elif ev.get('fact'):
            F.append(ev['fact'])
    res['facts'] = F
    res['seconds'] = round(time.monotonic() - t0, 3)
    return res


# ---------------------------------------------------------------- reading the facts into the house record

FUEL_WORDS = (('propane', 'propane'), ('oil', 'oil'), ('gas', 'gas'), ('electric', 'electric'), ('heat pump', 'electric'))


def fact(live, *keys):
    for k in keys:
        for f in (live or {}).get('facts') or []:
            if f.get('k') == k and f.get('v') not in (None, '', 0):
                return f
    return None


def house_facts(live):
    """{year, sqft, beds, stories, bldg_desc, reading, fuel, garage} from the public facts; only what a source states."""
    out = {}
    f = fact(live, 'year_built')
    if f and f.get('note') != 'commercial building record':
        out['year'] = int(f['v'])
    elif f:
        out['year'] = int(f['v'])
    f = fact(live, 'living_area_sqft', 'floor_area_sqft')
    if f:
        out['sqft'] = int(f['v'])
    f = fact(live, 'beds')
    if f and isinstance(f['v'], (int, float)) and f['v'] > 0:
        out['beds'] = int(f['v'])
    f = fact(live, 'stories')
    if f and isinstance(f['v'], (int, float)) and 1 <= f['v'] <= 6:
        out['stories'] = f['v']
    f = fact(live, 'building_desc')
    if f:
        out['bldg_desc'] = str(f['v'])[:40]
        r = sources.read_bldg_desc(f['v'])
        bits = [f"{r['stories']:g} stor{'y' if r['stories'] == 1 else 'ies'}" if r['stories'] else '', r['material'] or '',
                f"{r['garage_cars']}-car garage" if r['garage_cars'] else '']
        if any(bits):
            out['reading'] = ', '.join(b for b in bits if b)
    f = fact(live, 'heat_source')
    if f:
        low = str(f['v']).lower()
        out['fuel'] = next((v for w, v in FUEL_WORDS if w in low), None)
    if fact(live, 'garage_cars') or (fact(live, 'attached_garage') or {}).get('v') == 'yes':
        out['garage'] = True
    return {k: v for k, v in out.items() if v not in (None, '')}


# ---------------------------------------------------------------- sources numbering

def source_entry(live, src, date=None):
    if src == 'sales':
        s = ((live or {}).get('record') or {}).get('source') or {}
        return {'title': s.get('title') or 'Recorded property sales', 'publisher': s.get('publisher') or '', 'url': s.get('url') or '',
                'date': s.get('date') or date or ''}
    return sources.source_entry(src, date)


class Numbering:
    """Numbers each source once: wraps the app's Sources (model path) or keeps its own list (the endpoint)."""

    def __init__(self, live, app_sources=None):
        self.live, self.app, self.items, self.by = live, app_sources, [], {}

    def __call__(self, src, date=None):
        if src in self.by:
            return self.by[src]
        e = source_entry(self.live, src, date)
        if self.app is not None:
            n = self.app.add(f'site:{src}', e['title'], e['url'], e['publisher'], e['date'], 'data')
        else:
            n = len(self.items) + 1
        self.by[src] = n
        self.items.append({'n': n, **e})
        return n


# ---------------------------------------------------------------- the card

def _rect_room(name, kind, x, y, w, h, floor):
    return {'x': round(x, 1), 'y': round(y, 1), 'w': round(w, 1), 'h': round(h, 1), 'label': name, 'kind': kind, 'floor': floor, 'basis': 'likely'}


def _room_kind(name):
    n = name.lower()
    for k in ('kitchen', 'bath', 'bedroom', 'living', 'dining', 'laundry', 'garage', 'hall', 'stairs', 'utility', 'storage'):
        if k in n:
            return k
    return 'room'


def _rule_layout(house):
    """The likely_rules room layout for a house with no outline: first matching row of rooms.select."""
    import workspace as W
    rooms = W._rules().get('rooms') or {}
    era = W._era(house.get('year') or 1975)
    style = str(house.get('style') or era.get('style') or '').lower()
    st = house.get('stories') or 1
    for row in rooms.get('select') or []:
        if row.get('type'):
            continue
        if row.get('styles') and not any(s in style for s in row['styles']):
            continue
        if row.get('eras') and era.get('name') not in row['eras']:
            continue
        if row.get('min_stories') and st < row['min_stories']:
            continue
        if row.get('max_stories') and st > row['max_stories']:
            continue
        name = row.get('layout')
        if name in (rooms.get('layouts') or {}):
            return name, rooms['layouts'][name], ((W._rules().get('wet_wall') or {}).get('by_layout') or {}).get(name) or []
    return None, None, []


def _wet_from_rooms(rooms, floor):
    out = []
    for r in rooms:
        if r['kind'] in ('kitchen', 'bath'):
            what = 'Kitchen sink wall' if r['kind'] == 'kitchen' else f"{r['label']} supply and drain wall"
            out.append({'floor': floor, 'a': [r['x'], r['y']], 'b': [round(r['x'] + r['w'], 1), r['y']], 'rooms': [r['label']], 'what': what,
                        'basis': 'likely'})
    return out


def dress(card, live, house, add):
    """Add place, building, facts, rooms and wet walls to a public floor_sketch card, in place. add(src, date) -> source number.

    With an outline the plan rectangle becomes the outline's oriented rectangle (front at the bottom), rot_deg follows the 3D
    view's convention (plan +x at bearing rot_deg + 90, plan +y towards the front at rot_deg + 180), rooms come from
    site_geo.fit_layout and every item and run point is snapped inside the real ring. Without one, rooms come from the rule
    layouts. Returns the card."""
    import workspace as W
    live = live or {}
    precision = live.get('precision')
    card['example'] = False
    card['address'] = live.get('label') or card.get('address')
    point = live.get('point')
    if precision in ('parcel', 'typed') and point:
        pl = live.get('parcel')
        src = (pl or {}).get('src') if precision == 'parcel' and pl else ('sales' if precision == 'parcel' else 'census')
        card['place'] = {'label': card['address'], 'lat': round(point[1], 7), 'lon': round(point[0], 7), 'precision': precision,
                         'geocoder': 'parcel centroid' if precision == 'parcel' else 'census', 'basis': 'public',
                         'src': add(src, (pl or {}).get('as_of') if pl else None)}
    elif live.get('town_place'):
        tp = live['town_place']
        card['place'] = {'label': tp.get('label'), 'lat': tp.get('lat'), 'lon': tp.get('lon'), 'precision': 'town', 'geocoder': 'zip centroid',
                         'basis': 'public', 'src': add('zip_centroids')}
    facts = []
    for f in live.get('facts') or []:
        facts.append({'k': f.get('k'), 'label': f.get('label'), 'v': f.get('v'), 'basis': 'public', 'src': add(f.get('src'), f.get('as_of')),
                      'as_of': f.get('as_of')})
    card['facts'] = facts
    if live.get('permits'):
        card['permits'] = [{'date': p.get('date'), 'type': p.get('type'), 'trades': p.get('trades') or [], 'basis': 'public', 'src': add('nj_permits')}
                           for p in live['permits'][:6]]
    b = live.get('building')
    hf = house_facts(live)
    storeys_public = 'stories' in hf
    floors = card.get('floors') or []
    stories = house.get('stories') or 1
    if b and b.get('ring_ll'):
        geo = live.get('geocode')
        street_ll = [geo['lon'], geo['lat']] if geo else None
        parcel_ll = (live.get('parcel') or {}).get('ring_ll')
        n_b = add('structures', b.get('as_of'))
        blk = site_geo.footprint_block(b['ring_ll'], street_ll, parcel_ll, b.get('height_m'), hf.get('stories'), house.get('year'),
                                       hf.get('sqft'), b.get('as_of'), n_b)
        full_m, origin = site_geo.ll_to_m(b['ring_ll'])
        street_m = site_geo.point_ll_to_m(street_ll, origin) if street_ll else None
        fr = site_geo.plan_frame(full_m, street_m)
        front = fr['front']['bearing_deg']
        ring_m = blk['footprint']['ring_m']
        blk['footprint'].update({'axis_deg': blk['footprint']['rot_deg'], 'rot_deg': round((front - 180.0) % 360.0, 1),
                                 'method': 'outline from imagery', 'imagery': b.get('imagery_source'),
                                 'outbuildings': [{'ring_m': site_geo.simplify_ring(site_geo.ll_to_m(o['ring_ll'], origin)[0]), 'basis': 'public'}
                                                  for o in live.get('outbuildings') or [] if o.get('ring_ll')]})
        if 'parcel' in blk:
            blk['parcel']['src'] = add((live.get('parcel') or {}).get('src') or 'nj_parcels', (live.get('parcel') or {}).get('as_of'))
            blk['parcel']['as_of'] = (live.get('parcel') or {}).get('as_of')
        if storeys_public:
            sf = fact(live, 'stories')
            blk['storeys']['src'] = add(sf['src'], sf.get('as_of'))
        else:                                                   # no county storeys: the plan's own (likely) storeys
            blk['storeys'].update({'n': stories, 'basis': 'likely'})
            blk['height'] = dict(blk['height'], **{k: v for k, v in site_geo.height_rule(b.get('height_m'), stories, house.get('year')).items()
                                                   if k in ('eave_m', 'ridge_m', 'from', 'basis')})
        if blk['height'].get('basis') != 'public':
            blk['height']['basis'] = 'likely'
        blk['front']['basis'] = 'public' if street_ll else 'assumed'
        blk['front']['from'] = 'geocoded street point' if street_ll else 'assumed'
        blk['footprint']['basis'] = 'public'
        card['building'] = blk
        card['front_basis'] = blk['front']['basis']
        w_ft, d_ft = max(8, round(fr['w_ft'])), max(8, round(fr['d_ft']))
        D_m = d_ft * FT

        def snap(x, y):
            world = site_geo.from_plan(fr, [x * FT, D_m - y * FT])
            s = site_geo.snap_inside(world, ring_m, 0.3)
            p = site_geo.to_plan(fr, s)
            return [round(min(max(p[0] / FT, 0), w_ft), 1), round(min(max((D_m - p[1]) / FT, 0), d_ft), 1)]
        for fl in floors:
            sx, sy = w_ft / (fl.get('w') or w_ft), d_ft / (fl.get('h') or d_ft)
            fl['w'], fl['h'] = w_ft, d_ft
            for it in fl.get('items') or []:
                x, y = snap(it['x'] * sx, it['y'] * sy)
                it['snapped'] = [x, y] != [round(it['x'] * sx, 1), round(it['y'] * sy, 1)]
                it['x'], it['y'] = x, y
            for r in fl.get('runs') or []:
                r['points'] = [snap(px * sx, py * sy) for px, py in r['points']]
        have = {f['id'] for f in floors}
        want = ['first'] + (['second'] if stories >= 2 else [])
        for f in want:
            if f not in have:
                floors.append({'id': f, 'name': W.FLOOR_NAMES[f], 'w': w_ft, 'h': d_ft, 'rooms': [], 'items': [], 'runs': []})
        floors.sort(key=lambda f: ['basement', 'first', 'second'].index(f['id']))
        for fl in floors:
            lay = site_geo.fit_layout(full_m, street_m, floor=fl['id'], storeys=stories, beds=hf.get('beds'), sqft=hf.get('sqft'),
                                      garage=bool(hf.get('garage')) and fl['id'] == 'first')
            fl['rooms'] = [_rect_room(r['label'], r['kind'], r['rect_ft']['x'], r['rect_ft']['y'], r['rect_ft']['w'], r['rect_ft']['h'], fl['id'])
                           for r in lay['rooms']]
            fl['wet_walls'] = _wet_from_rooms(fl['rooms'], fl['id'])
        card['layout'] = {'from': 'outline', 'basis': 'likely'}
    else:
        name, layout, wet = _rule_layout(dict(house, stories=stories))
        have = {f['id'] for f in floors}
        if 'first' not in have and floors:
            floors.append({'id': 'first', 'name': W.FLOOR_NAMES['first'], 'w': floors[0]['w'], 'h': floors[0]['h'], 'rooms': [], 'items': [], 'runs': []})
            floors.sort(key=lambda f: ['basement', 'first', 'second'].index(f['id']))
        for fl in floors:
            rows = ((layout or {}).get('floors') or {}).get(fl['id']) or []
            if fl['id'] == 'basement' or not rows:
                for r in fl.get('rooms') or []:
                    r.setdefault('basis', 'likely')
                continue
            w, h = fl['w'], fl['h']
            fl['rooms'] = [_rect_room(r['name'], _room_kind(r['name']), r['x'] * w, r['y'] * h, r['w'] * w, r['h'] * h, fl['id']) for r in rows]
            fl['wet_walls'] = [{'floor': fl['id'], 'a': [round(s['a'][0] * w, 1), round(s['a'][1] * h, 1)],
                                'b': [round(s['b'][0] * w, 1), round(s['b'][1] * h, 1)], 'rooms': s.get('rooms') or [], 'what': s.get('what'),
                                'basis': 'likely'} for s in wet if s.get('floor') == fl['id']]
        if name:
            card['layout'] = {'from': 'rules', 'name': name, 'basis': 'likely'}
    card['floors'] = floors[:3]
    for fl in card['floors']:
        for it in fl.get('items') or []:
            if it.get('basis') != 'record':
                it['basis'] = 'likely'
        for r in fl.get('runs') or []:
            if r.get('basis') != 'record':
                r['basis'] = 'likely'
    for o in card.get('outside') or []:
        if o.get('basis') != 'record':
            o['basis'] = 'likely'
    card['basis'] = 'likely'
    return card


# ---------------------------------------------------------------- the map command

def _short_label(live):
    lab = live.get('label') or ''
    parts = [p.strip() for p in lab.split(',')]
    return ', '.join(parts[:2]) if len(parts) > 1 else lab


def map_command(live, card=None):
    """The 'map_command' card: a town step, then a 'site' step capped by the point's precision. None when nothing is placed."""
    live = live or {}
    steps = []
    tp = live.get('town_place')
    prec = live.get('precision')
    if tp and tp.get('lat') is not None:
        steps.append({'kind': 'site', 'lat': round(tp['lat'], 6), 'lon': round(tp['lon'], 6), 'label': tp.get('label') or 'Town', 'sub': 'Town',
                      'precision': 'town', 'zoom': ZOOM['town'], 'pitch': 0, 'bearing': 0, 'hold_ms': 2500})
    point = live.get('point')
    if live.get('status') == 'choose':
        for c in live.get('choose') or []:
            if c.get('lat') is not None and c.get('lon') is not None:
                steps.append({'kind': 'site', 'lat': round(c['lat'], 6), 'lon': round(c['lon'], 6), 'label': c['label'][:80],
                              'sub': 'One of several lots at this address', 'precision': 'typed', 'zoom': ZOOM['typed'], 'pitch': 0,
                              'bearing': 0, 'hold_ms': 3000})
    elif prec in ('parcel', 'typed') and point:
        b = (card or {}).get('building') or {}
        fp = b.get('footprint') or {}
        if prec == 'parcel':
            sub = 'Parcel match · ' + (f"outline from imagery dated {_mon(fp.get('as_of'))}" if fp.get('as_of') else
                                        'outline from imagery' if fp else 'no building outline')
        else:
            sub = 'Street match · parcel not matched'
        lat, lon = point[1], point[0]
        if fp.get('ring_m') and b.get('frame'):
            c = site_geo.ring_centroid(fp['ring_m'])
            lon, lat = site_geo.point_m_to_ll(c, b['frame']['origin'])
        step = {'kind': 'site', 'lat': round(lat, 6), 'lon': round(lon, 6), 'label': _short_label(live), 'sub': sub, 'precision': prec,
                'zoom': min(ZOOM[prec], CEIL[prec]), 'pitch': 60 if prec == 'parcel' else 45, 'front_deg': round(((b.get('front') or {}).get('bearing_deg') or 0)),
                # the camera looks AT the front wall, so it heads the opposite way to the way the front faces
                'bearing': round((((b.get('front') or {}).get('bearing_deg') or 0) + 180) % 360),
                'hold_ms': 8000}
        if fp.get('ring_m') and b.get('frame'):
            step['outline'] = [[round(x, 7), round(y, 7)] for x, y in site_geo.m_to_ll(fp['ring_m'], b['frame']['origin'])][:48]
            h = b.get('height') or {}
            step['height_m'] = h.get('ridge_m')
            step['height_basis'] = h.get('basis') or 'likely'
        steps.append(step)
    if not steps:
        return None
    cid = 'mc-' + hashlib.sha1(f"{live.get('label')}|{prec}".encode('utf-8')).hexdigest()[:8]
    return {'type': 'card', 'kind': 'map_command', 'id': cid, 'cmd': {'title': live.get('label') or 'Site', 'source': 'site', 'steps': steps[:12]}}


def _mon(iso):
    try:
        return datetime.date.fromisoformat(str(iso)[:10]).strftime('%b %Y')
    except ValueError:
        return str(iso or '')


# ---------------------------------------------------------------- the 40-word answer

def words(s):
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'.,/&-]*", s or ''))


def _sentences(s):
    return [x for x in re.split(r'(?<=[.!?])\s+', (s or '').strip()) if x]


def fit_words(parts, limit=WORDS_MAX):
    """Join sentences in order. Required sentences always stay; optional ones (marked with a leading '?') are kept, in order, only
    while the whole fits the limit. Each sentence is cut to 18 words."""
    items = []
    for p in parts:
        if not p:
            continue
        opt = p.startswith('?')
        p = p[1:] if opt else p
        ws = p.split()
        if len(ws) > SENTENCE_MAX:
            p = ' '.join(ws[:SENTENCE_MAX]).rstrip(',;:') + '.'
        items.append((opt, p))
    keep = [not opt for opt, _ in items]
    budget = limit - sum(words(p) for opt, p in items if not opt)
    for i, (opt, p) in enumerate(items):
        if opt and words(p) <= budget:
            keep[i] = True
            budget -= words(p)
    out = ' '.join(p for (opt, p), k in zip(items, keep) if k)
    while words(out) > limit:                                   # required sentences alone overflow: cut the last words
        out = ' '.join(out.split()[:-1]).rstrip(',;:') + '.'
    return out


def _where(it):
    import workspace as W
    note = (it.get('note') or '').rstrip('.')
    note = re.sub(r'[;,.]?\s*confirm on site\.?$', '', note, flags=re.I)
    return W._lc(note) if note else W._floor_words(it.get('floor'))


def _focus_items(card, n=2):
    items = [i for f in card.get('floors') or [] for i in f.get('items') or []] + list(card.get('outside') or [])
    out = []
    for k in card.get('focus') or []:
        it = next((i for i in items if i.get('kind') == k), None)
        if it and it not in out:
            out.append(it)
    return out[:n]


def answer_text(live, card, area=None, record=False):
    """The answer, built from the card by a template (design 2.6): at most 40 words, sentences of 18 at most."""
    import workspace as W
    live = live or {}
    label = live.get('label') or (card or {}).get('address') or 'That address'
    short = _short_label(live) or label
    out_area = (area or {}).get('status') == 'out'
    tail = ['Outside our service area; refer to dispatch.'] if out_area else []
    st = live.get('status')
    if record and card:
        its = _focus_items(card)
        bits = [f"{short}: company record (example data)."]
        for it in its:
            bits.append(f"?{it.get('label')}: {_where(it)}" + (' (likely).' if it.get('basis') != 'record' else '.'))
        bits.append('Plan below; dashed means likely.')
        return fit_words(bits)
    if st == 'choose':
        return fit_words([f"More than one lot matches {W.plain(live.get('line') or label, 60)}.", 'Pick the right one below; each is a street address.'])
    if st != 'found' or not card:
        tp = live.get('town_place') or {}
        if tp.get('label'):
            t = re.sub(r'\s+\d{5}$', '', tp['label'])
            return fit_words([f'Found {t}, not the house.', 'Check the number and street.',
                              '?Nothing is drawn for the building until the address matches a parcel.'] + tail)
        return fit_words([f"I could not find {W.plain(live.get('line') or label, 60)}.", 'Check the number, street and town.'])
    hf = house_facts(live)
    b = card.get('building') or {}
    fp = b.get('footprint') or {}
    parts = []
    pub = []
    if hf.get('year'):
        pub.append(f"built {hf['year']}")
    if hf.get('sqft'):
        pub.append(f"{hf['sqft']:,} sq ft")
    if hf.get('stories'):
        n = hf['stories']
        pub.append({1: 'one storey', 2: 'two storeys', 3: 'three storeys'}.get(n, f'{n:g} storeys'))
    if pub:
        parts.append(f"{short}. " + W._uc(', '.join(pub)) + ' (public record).')
    elif fp:
        parts.append(f'{short} is on the map.')
        parts.append('No public building record.')
        parts.append(f"Outline from imagery dated {_mon(fp.get('as_of'))}." if fp.get('as_of') else 'Outline from imagery.')
    else:
        parts.append(f'{short} is on the map.' if live.get('precision') == 'parcel' else f'{short} is on the map at street level.')
        parts.append('No building outline.')
    if live.get('precision') == 'typed':
        parts.append('?The parcel is not matched.')
    for i, it in enumerate(_focus_items(card)):
        lead = 'Likely: ' if i == 0 else '?Likely: '
        parts.append(f"{lead}{W._lc(it.get('label') or '')}, {_where(it)}.")
    parts += tail
    parts.append('Plan, 3D and map below; dashed is likely.')
    txt = fit_words(parts)
    return txt


# ---------------------------------------------------------------- brief(): the endpoint's answer

def may_ask(role_id):
    """The Punctual Pros field and office roles with the site tool, and the firm levels (a demonstration from the firm view)."""
    import workspace as W
    try:
        R = W.role(role_id)
    except Exception:                                           # noqa: BLE001
        return False
    lvl = str(R.get('level') or '')
    if lvl.startswith('firm_'):
        return True
    return R.get('company') == 'pp' and 'site_brief' in (R.get('tools') or ())


def _empty(status, text, **kw):
    out = {'status': status, 'text': text, 'cards': [], 'choices': [], 'sources': [], 'degraded': []}
    out.update(kw)
    return out


class LocalSources:
    """The app's Sources contract (app.py), kept local to one brief: add() numbers a source once per key."""

    def __init__(self):
        self.items, self.by = [], {}

    def add(self, key, title, url='', publisher='', date='', kind=''):
        if key in self.by:
            return self.by[key]
        n = len(self.items) + 1
        self.items.append({'n': n, 'title': title, 'publisher': publisher, 'url': url, 'date': date, 'kind': kind})
        self.by[key] = n
        return n

    def header(self, n):
        it = self.items[n - 1]
        return f"[{n}] {it['title']} ({it['publisher']}, {it['date']})"


def brief(text, role_id, connected=None, deadline_s=TOTAL_S, pick=None):
    """Answer a typed address for one role, word for word, with no model call.

    connected: the apps the page says are connected (None means every app of the role, as views.prepared reads it). The company's
    own record is used only when its system is connected AND the typed address equals a customer record exactly; anything else is
    answered from public records. Returns {status, text, cards, choices, sources, degraded}; cards are the floor_sketch card and a
    map_command card, choices are [{label, key}] for 'choose'."""
    import workspace as W
    t = re.sub(r'\s+', ' ', text if isinstance(text, str) else '').strip()[:240]
    try:
        R = W.role(role_id)
    except Exception:                                           # noqa: BLE001
        return _empty('outside', "That's outside your access.")
    if not may_ask(role_id):
        return _empty('outside', f"That's outside your access as {R.get('label_a') or 'this role'}.")
    if not t or not re.search(r'\d', t):
        return _empty('not_found', 'Give the street address with the town or ZIP.')
    try:
        apps = list((R.get('apps') or {}).keys())
        conn = apps if connected is None else [a for a in connected if isinstance(a, str) and a in apps]
        ws = {'role': role_id, 'connected': sorted(set(conn)), 'job': None, '_deadline': deadline_s, '_brief': True}
        S = LocalSources()
        args = {'address': t, 'issue': t}
        if pick:
            args['pick'] = str(pick)[:40]
        token = W._READER.set(role_id)
        try:
            _txt, err, cards = W._site_brief(ws, args, S)
        finally:
            W._READER.reset(token)
        info = ws.get('_site_out') or {}
        live = ws.get('_site') or {}
        record = bool(info.get('record'))
        area = info.get('area')
        fs = next((c for c in cards if c.get('kind') == 'floor_sketch'), None)
        mc = next((c for c in cards if c.get('kind') == 'map_command'), None)
        if record and fs:
            fs['example'] = True
            status = 'found'
            text_out = answer_text({'label': fs.get('address')}, fs, area, record=True)
            cards_out = [fs] + ([mc] if mc else [])
        elif live.get('status') == 'choose':
            status = 'choose'
            text_out = answer_text(live, None, area)
            mc = map_command(live)
            cards_out = [mc] if mc else []
        elif live.get('status') == 'found' and fs:
            status = 'found'
            text_out = answer_text(live, fs, area)
            cards_out = [fs] + ([mc] if mc else [])
        else:
            status = 'not_found'
            text_out = answer_text(live, None, area) if live else _no_place_text(_txt)
            mc = mc or (map_command(live) if live else None)
            cards_out = [mc] if mc else []
        srcs = [dict(s) for s in S.items if s.get('kind') != 'rules'] + [dict(s) for s in S.items if s.get('kind') == 'rules']
        for s in srcs:
            s.pop('kind', None)
        choices = [{'label': c['label'], 'key': c['key']} for c in live.get('choose') or []] if status == 'choose' else []
        out = {'status': status, 'text': text_out, 'cards': cards_out, 'choices': choices,
               'sources': srcs if status in ('found',) else [s for s in srcs if s.get('title')], 'degraded': list(live.get('degraded') or [])}
        if live.get('precision'):
            out['precision'] = live['precision']
        if not record and BANNED.search(out['text']):            # a real address never reads as example data
            out['text'] = BANNED.sub('', out['text'])
        return out
    except Exception as e:                                      # noqa: BLE001
        log.warning("site: brief failed: %s", type(e).__name__, exc_info=True)
        return _empty('error', 'The address lookup failed. Try again in a moment.')


def _no_place_text(model_text):
    if 'Ask for the ZIP or the town' in (model_text or ''):
        return 'I could not place that address. Give the town or the ZIP.'
    if (model_text or '').startswith('SERVICE AREA: outside'):
        return 'I could not find that address. It is outside the Punctual Pros service area; refer to dispatch.'
    return 'I could not find that address. Check the number, street and town.'
