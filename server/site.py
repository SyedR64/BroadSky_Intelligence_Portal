"""
The live site brief: a real address typed by a visitor, answered from public records with a floor plan, a 3D shell and a map.

Lane S3 of the live address design (os/design_live_address.md sections 2, 3 and 5). No model call, no key, no company record
for a real address. Three parts:

  lookup(parsed, area, pick=None, deadline_s=8.0, building=None)
        The resolve ladder (design 2.2), each step through site_sources.py:
          1  the local sales row (property.lookup_record): parcel centroid, year, size, rooms          precision parcel
          2  New Jersey: the statewide parcel layer by address text                                    precision parcel
          3  Pennsylvania: the county parcel layer for a wired county                                  precision parcel
          4  the Census geocoder on the cleaned one-line address                                       precision typed
          4b parcels within 60 m of that point whose address equals the typed one                      upgrades to parcel
          5  the town or ZIP centre                                                                    precision town
        then the building outline (USA Structures), NJ permits and the ground elevation. Steps 2 to 4 run side by side. On a lot
        with several buildings choose_building picks the one drawn (the largest, unless the record's area per story says
        otherwise, or the person's own pick `building`); the card says which (building.lot and a note on its descriptive line).
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
import site_plan
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


SIZEABLE_M2 = 150.0          # a building on the lot at least this big (and 0.4 of the largest) can be the one asked about;
SIZEABLE_SHARE = 0.4         # below it is a detached garage or a shed, which never competes with a house
SIZEABLE_MAX = 6
RECORD_SQFT = (200, 2_000_000)   # a parsed floor area outside this is ignored
RECORD_OVER = 2.0            # the largest outline is doubted only when it is more than this times the recorded area per story ...
RECORD_OVER_HOUSE = 3.0      # ... or this many times when the facts read as a house (a ranch with its garage and porch runs 2.5 x)
RECORD_FIT = 3.5             # and the outline taken instead must itself be within this factor of the recorded area per story


def record_size(facts):
    """(recorded floor area in sq ft, stories) from the public facts, for the building pick. The floor area is read in the same
    order as site_plan.building_kind (floor_area_sqft, then living_area_sqft); a number outside RECORD_SQFT is skipped and the next
    key is tried. The area is None when no source states a sane one; stories is 1 when none is recorded."""
    area = None
    for k in ('floor_area_sqft', 'living_area_sqft'):
        f = next((f for f in facts or [] if isinstance(f, dict) and f.get('k') == k and f.get('v') not in (None, '')), None)
        a = site_plan._num((f or {}).get('v'))
        if a is not None and RECORD_SQFT[0] <= a <= RECORD_SQFT[1]:
            area = a
            break
    f = next((f for f in facts or [] if isinstance(f, dict) and f.get('k') == 'stories'), None)
    n = site_plan._num((f or {}).get('v'))
    return area, (n if n and 1 <= n <= 200 else 1)


def reads_as_house(facts):
    """True when the facts alone (no outline) read as a house: no large floor area, no 4 stories, no non-residential fact."""
    return site_plan.building_kind(None, 0, list(facts or []))['kind'] == 'house'


def _area(b):
    a = site_plan._num((b or {}).get('area_m2'))
    return a if a is not None and a > 0 else 0.0


def _rank_key(b):
    """Largest first; equal areas by build_id, then by the rounded centre, so the order never depends on the layer's order."""
    bid = b.get('build_id')
    c = b.get('centroid') or ()
    try:
        cxy = tuple(round(float(v), 7) for v in c[:2])
    except (TypeError, ValueError):
        cxy = ()
    return (-_area(b), (0, bid, '') if isinstance(bid, (int, float)) and not isinstance(bid, bool) else (1, 0, str(bid or '')), cxy)


def choose_building(cands, area_sqft=None, stories=None, building=None, nearer=None, house=True):
    """Which of the candidate outlines on one lot is drawn (candidates: centre inside the lot, not flagged outbuilding).

    Sizeable = at least 150 m2 and 0.4 of the largest, at most 6, largest first (ties by build_id, then centre). The default is
    the largest. It gives way only when the record states a floor area, the largest is more than 2 x the recorded area per story
    (3 x when the facts read as a house: house=True), and another sizeable outline is closer to it in log terms and within 3.5 x
    of it: then the sizeable outline that fits best. building (1-based rank in the sizeable list) is the person's own choice and
    wins when it is in range. nearer(b) -> metres to the street point is only for the evaluation of a variant (scratch
    eval_rule.py); the shipped rule passes None.

    Returns {'pick', 'why': 'only' | 'largest' | 'record' | 'chosen', 'sizeable': [outlines], 'shown': rank or None}."""
    cs = sorted((b for b in cands or [] if b), key=_rank_key)
    if not cs:
        return {'pick': None, 'why': None, 'sizeable': [], 'shown': None}
    big = cs[0]
    top = _area(big)
    size = [b for b in cs if _area(b) >= SIZEABLE_M2 and _area(b) >= SIZEABLE_SHARE * top][:SIZEABLE_MAX]
    pick, why = big, ('only' if len(cs) == 1 else 'largest')
    if isinstance(building, int) and not isinstance(building, bool) and 1 <= building <= len(size):
        pick, why = size[building - 1], 'chosen'
    elif area_sqft and RECORD_SQFT[0] <= area_sqft <= RECORD_SQFT[1] and len(size) >= 2:
        per = area_sqft * site_geo.M2_PER_SQFT / (stories if stories and stories >= 1 else 1)
        if top > (RECORD_OVER_HOUSE if house else RECORD_OVER) * per:
            fit = lambda b: abs(math.log(max(_area(b), 1e-6) / per))   # noqa: E731
            best = min(size, key=lambda b: (fit(b), size.index(b)))
            if (best is not big and fit(best) < fit(big) and fit(best) <= math.log(RECORD_FIT)
                    and (nearer is None or nearer(best) < nearer(big))):
                pick, why = best, 'record'
    shown = next((i + 1 for i, b in enumerate(size) if b is pick), None)
    return {'pick': pick, 'why': why, 'sizeable': size, 'shown': shown}


def _primary_building(buildings, parcel_ring, point_ll, facts=None, building=None):
    """The building drawn and the rest on the lot. With a parcel: choose_building over the outlines whose centre is inside it
    and that are not flagged outbuildings; the others inside (at most 4, largest first) are outbuildings, each other sizeable
    one marked 'sizeable' (a second building, not a shed). With no parcel: the outline holding the point, else the nearest
    within 25 m. Returns (building, outbuildings, lot) where lot is {why, shown, buildings: [sizeable outlines]} or None."""
    bs = [b for b in buildings or [] if isinstance(b, dict) and b.get('ring_ll') and b.get('centroid')]
    if not bs:
        return None, [], None
    if parcel_ring:
        pr, origin = site_geo.ll_to_m(parcel_ring)
        inside = [b for b in bs if site_geo.point_in_ring(site_geo.point_ll_to_m(b['centroid'], origin), pr)]
        area, stories = record_size(facts)
        ch = choose_building([b for b in inside if not b.get('outbuilding')], area, stories, building, house=reads_as_house(facts))
        prim = ch['pick']
        if prim is None:
            return None, [], None
        others = [dict(b, sizeable=True) if any(b is s for s in ch['sizeable']) else b
                  for b in sorted(inside, key=_rank_key) if b is not prim][:4]
        return prim, others, {'why': ch['why'], 'shown': ch['shown'], 'buildings': ch['sizeable']}
    if not point_ll:
        return None, [], None
    best, bd = None, None
    for b in bs:
        if b.get('outbuilding'):
            continue
        ring, origin = site_geo.ll_to_m(b['ring_ll'])
        p = site_geo.point_ll_to_m(point_ll, origin)
        d = 0.0 if site_geo.point_in_ring(p, ring) else site_geo.dist_to_boundary(p, ring)
        if d <= 25 and (bd is None or d < bd):
            best, bd = b, d
    return best, [], None


def lookup(parsed, area=None, pick=None, deadline_s=TOTAL_S, building=None):
    """Resolve one typed address to public facts (the SiteFacts of design 2.1). Cached; never raises on a source failure.

    building: the person's pick among the sizeable buildings on the lot (1-based, largest first); anything else is ignored.

    Returns {status: 'found' | 'choose' | 'not_found', precision: 'parcel' | 'typed' | 'town' | None, label, line, town, state, zip,
    county, record, parcel, geocode, town_place, building, outbuildings, lot, permits, facts: [fact], choose: [{label, key}],
    degraded: [source names], seconds}. lot is {why, shown, buildings} for the outline pick (None without a parcel). 'found' means the house is placed (parcel or typed); a town alone is 'not_found'."""
    parsed = dict(parsed or {})
    building = building if isinstance(building, int) and not isinstance(building, bool) and 1 <= building <= 8 else None
    # one cache entry per address: a person's building pick re-picks from the cached outlines, with no upstream call
    key = (parsed.get('key') or '', (parsed.get('zip') or (parsed.get('town') or '').upper()), parsed.get('state') or '', pick or '', live_on())
    hit = _cache_get(key)
    if hit is None:
        with _lock_for(key):                                    # two identical lookups make one set of upstream calls
            hit = _cache_get(key)
            if hit is None:
                hit = _resolve(parsed, area, pick, deadline_s)
                _cache_put(key, hit, _ttl(hit[0]))
    res, outlines = hit
    return _repick(res, outlines, building) if building and outlines else res


def _repick(res, outlines, building):
    """A copy of the cached answer with the person's pick among the buildings on the lot drawn; the cached entry is unchanged.
    An out-of-range pick gives the default answer back."""
    prim, outs, lot = _primary_building(outlines['buildings'], outlines['ring'], outlines['point'], res.get('facts'), building)
    if (lot or {}).get('why') != 'chosen':
        return res
    return dict(res, building=prim, outbuildings=outs, lot=lot)


def _resolve(parsed, area, pick, deadline_s):
    """(res, outlines): outlines holds what the building pick needs ({buildings, ring, point}) or None without an outline."""
    t0 = time.monotonic()
    until = t0 + max(0.5, float(deadline_s or TOTAL_S))
    degraded = []
    county, state = _county_for(parsed, area)
    town, zip_ = parsed.get('town'), parsed.get('zip')
    res = {'status': 'not_found', 'precision': None, 'line': parsed.get('line'), 'town': town, 'state': state, 'zip': zip_, 'county': county,
           'record': None, 'parcel': None, 'geocode': None, 'town_place': None, 'building': None, 'outbuildings': [], 'lot': None, 'permits': [],
           'facts': [], 'choose': [], 'degraded': degraded, 'seconds': 0.0}
    if not parsed.get('key') or not parsed.get('house_no'):
        res['town_place'] = sources.town_point(zip=zip_, town=town, state=state).get('place')
        res['precision'] = 'town' if res['town_place'] else None
        res['label'] = label_of(parsed, town, state, zip_)
        return res, None
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
        return res, None
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
        return res, None
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
        return res, None
    res['status'] = 'found'
    outlines = None
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
            outlines = {'buildings': list(fp.get('buildings') or []), 'ring': ring, 'point': point if not ring else None}
            prim, outs, lot = _primary_building(outlines['buildings'], ring, outlines['point'], F)
            res['building'], res['outbuildings'], res['lot'] = prim, outs, lot
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
    return res, outlines


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

def _rect_room(name, kind, x, y, w, h, floor, short=None):
    s = short if isinstance(short, str) and 0 < len(short) <= 7 else site_plan.short_name(name)
    return {'x': round(x, 1), 'y': round(y, 1), 'w': round(w, 1), 'h': round(h, 1), 'label': name, 'short': s, 'kind': kind, 'floor': floor,
            'basis': 'likely'}


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
                                 'outbuildings': [dict({'ring_m': site_geo.simplify_ring(site_geo.ll_to_m(o['ring_ll'], origin)[0]), 'basis': 'public'},
                                                       **({'kind': 'building'} if o.get('sizeable') else {}))
                                                  for o in live.get('outbuildings') or [] if o.get('ring_ll')]})
        lot = _lot_block(live.get('lot'))
        if lot:
            blk['lot'] = lot
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
        kind = site_plan.building_kind(live, blk['footprint'].get('area_m2'))
        blk['kind'], blk['kind_from'] = kind['kind'], kind['from']
        if kind['kind'] == 'large':                              # R6: the outline, the street side, no rooms, no interior lines
            site_plan.large_card(card, w_ft, d_ft, live, kind)
            floors = card['floors']
        else:
            fw0 = next((f.get('w') for f in floors if f.get('w')), w_ft)
            fh0 = next((f.get('h') for f in floors if f.get('h')), d_ft)
            for fl in floors:
                fl['w'], fl['h'] = w_ft, d_ft
            have = {f['id'] for f in floors}
            want = ['first'] + (['second'] if stories >= 2 else [])
            for f in want:
                if f not in have:
                    floors.append({'id': f, 'name': W.FLOOR_NAMES[f], 'w': w_ft, 'h': d_ft, 'rooms': [], 'items': [], 'runs': []})
            floors.sort(key=lambda f: ['basement', 'first', 'second'].index(f['id']))
            fit_m = site_geo.simplify_ring(full_m)              # a dense outline would cost a lot per floor (R10)
            under = any(f['id'] == 'basement' for f in floors)
            for fl in floors:                                    # same garage and basement on every floor: one frame, one stair
                lay = site_geo.fit_layout(fit_m, street_m, floor=fl['id'], storeys=stories, beds=hf.get('beds'), sqft=hf.get('sqft'),
                                          garage=bool(hf.get('garage')), basement=under)
                fl['rooms'] = [_rect_room(r['label'], r['kind'], r['rect_ft']['x'], r['rect_ft']['y'], r['rect_ft']['w'], r['rect_ft']['h'],
                                          fl['id'], r.get('short')) for r in lay['rooms']]
            ring_ft = site_plan.plan_ring(blk, w_ft, d_ft)
            locs = (W._rules().get('locations') or {}).get(house.get('foundation') or 'basement') or {}
            if ring_ft:                                          # items by room, runs square inside the outline (R3, R5)
                rep = site_plan.dress_house(floors, ring_ft, locs, card.setdefault('outside', []), (w_ft / (fw0 or w_ft), d_ft / (fh0 or d_ft)))
                if rep['failed']:
                    log.warning('site: %d run(s) could not be routed inside the outline', len(rep['failed']))
            else:
                for fl in floors:
                    fl['wet_walls'] = _wet_from_rooms(fl['rooms'], fl['id'])
            card['layout'] = {'from': 'outline', 'basis': 'likely'}
    elif site_plan.building_kind(live, None)['kind'] == 'large':   # no outline, but the record says it is no house: no house rooms
        kind = site_plan.building_kind(live, None)
        w0 = (floors[0].get('w') if floors else None) or 40
        h0 = (floors[0].get('h') if floors else None) or 30
        card['building'] = {'kind': 'large', 'kind_from': kind['from']}
        site_plan.large_card(card, w0, h0, live, kind)
        floors = card['floors']
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
    hs = card.get('house')
    if isinstance(hs, dict) and isinstance(hs.get('text'), str):    # "Electric heat (likely)." reads better than "heat. (likely)"
        hs['text'] = re.sub(r'\.\s*\(likely\)', ' (likely).', hs['text'])
    notes = building_notes(card, live)
    if notes:                                                   # on the card's own descriptive line, after what the record says
        if not isinstance(card.get('house'), dict):
            card['house'] = {}
        hs = card['house']
        hs['text'] = ' '.join(x for x in (str(hs.get('text') or '').strip(), notes) if x)
    card['basis'] = 'likely'
    return card


LOT_NOTE = {'largest': '{n} buildings on this lot. Showing the largest.',
            'record': '{n} buildings on this lot. Showing the one that best fits the recorded size.',
            'chosen': '{n} buildings on this lot. Showing the one you picked.'}
OUTLINE_OVER = 1.25          # a large building's outline this many times the whole recorded area: both numbers are shown


def _sqft100(m2):
    return int(round((m2 or 0) / site_geo.M2_PER_SQFT / 100.0)) * 100


def _lot_block(lot):
    """card.building.lot, only with two or more sizeable buildings: {n, shown, why, buildings: [{n, sqft, shown}]}. Ranks and
    ground areas rounded to 100 sq ft; no identifier from the layer."""
    bs = (lot or {}).get('buildings') or []
    if len(bs) < 2 or not lot.get('shown'):
        return None
    return {'n': len(bs), 'shown': lot['shown'], 'why': lot.get('why'),
            'buildings': [{'n': i + 1, 'sqft': _sqft100(b.get('area_m2')), 'shown': i + 1 == lot['shown']} for i, b in enumerate(bs)]}


def building_notes(card, live):
    """The short notes the card's descriptive line carries: how many buildings the lot holds and which one is drawn, and for a
    large building an outline far bigger than the whole recorded floor area. '' when there is nothing to say."""
    b = (card or {}).get('building') or {}
    out = []
    lot = b.get('lot') or {}
    if lot.get('n', 0) >= 2 and lot.get('why') in LOT_NOTE:
        out.append(LOT_NOTE[lot['why']].format(n=lot['n']))
    fp = b.get('footprint') or {}
    if b.get('kind') == 'large' and fp.get('ring_m'):
        area, _ = record_size((live or {}).get('facts'))
        m2 = ((live or {}).get('building') or {}).get('area_m2') or fp.get('area_m2')
        if area and m2 and m2 / site_geo.M2_PER_SQFT > OUTLINE_OVER * area:
            out.append(f'Outline: about {_sqft100(m2):,} sq ft of ground. Record: {int(round(area)):,} sq ft. They do not agree.')
    return ' '.join(out)


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
    if b.get('kind') == 'large':
        return _large_text(live, card, short, hf, tail)
    parts = []
    pub = []
    if hf.get('year'):
        pub.append(f"built {hf['year']}")
    if hf.get('sqft'):
        pub.append(f"{hf['sqft']:,} sq ft")
    if hf.get('stories'):
        n = hf['stories']
        pub.append(site_plan.stories_words(n))
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


def _large_text(live, card, short, hf, tail):
    """The answer for a large or non-residential building (R6): what the record says, then only what holds for any building."""
    import workspace as W
    fp = (card.get('building') or {}).get('footprint') or {}
    pub = [x for x in (site_plan.facility_name(card),) if x]
    if hf.get('year'):
        pub.append(f"built {hf['year']}")
    if hf.get('sqft'):
        pub.append(f"{hf['sqft']:,} sq ft")
    if hf.get('stories'):
        n = hf['stories']
        pub.append(site_plan.stories_words(n))
    has_ring = bool(fp.get('ring_m'))
    if pub:
        parts = [f"{short}. " + W._uc(', '.join(pub)) + ' (public record).']
    elif has_ring:
        parts = [f'{short} is on the map.', 'No public building record.',
                 f"Outline from imagery dated {_mon(fp.get('as_of'))}." if fp.get('as_of') else 'Outline from imagery.']
    else:
        parts = [f'{short} is on the map.', 'No public building record.']
    if not has_ring:
        parts.append('No building outline.')
    parts.append('Likely: fixture shutoffs under each sink; building shutoff in the mechanical room, ask the site contact.')
    parts += tail
    parts.append('?Outline, 3D and map below.' if has_ring else '?Map below.')
    txt = fit_words(parts)
    head, rest = (short, txt[len(short):]) if txt.startswith(short) else ('', txt)
    if site_plan.BANNED_LARGE.search(rest):                     # a recorded word that reads as a house never reaches the answer
        txt = head + re.sub(r'\s{2,}', ' ', site_plan.BANNED_LARGE.sub('', rest))
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


def brief(text, role_id, connected=None, deadline_s=TOTAL_S, pick=None, building=None):
    """Answer a typed address for one role, word for word, with no model call.

    connected: the apps the page says are connected (None means every app of the role, as views.prepared reads it). The company's
    own record is used only when its system is connected AND the typed address equals a customer record exactly; anything else is
    answered from public records. Returns {status, text, cards, choices, sources, degraded}; cards are the floor_sketch card and a
    map_command card, choices are [{label, key}] for 'choose'. building: which of the sizeable buildings on the lot to draw (1-based,
    largest first), the person's own pick; out of range it is ignored."""
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
        if isinstance(building, int) and not isinstance(building, bool) and 1 <= building <= 8:
            args['building'] = building
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
            site_plan.trade_view(fs, t)                          # "an electrical job, where are the wires": the panel leads
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
