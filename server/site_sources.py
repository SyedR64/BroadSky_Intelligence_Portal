"""
Public-record sources for a live address: one adapter per free public service, each returning plain dictionaries.

Lane S1 of the live address design (os/design_live_address.md, sections 2.2, 2.3 and 7.1). No model call, no key.

  geocode(address)                         US Census geocoder, one-line address -> a point on the street   (precision "typed")
  town_point(zip=None, town=None, state=None)
                                           the ZIP or town centroid from data/pp_zips.json                 (precision "town")
  nj_parcels(key, county=None, town=None, muni_code=None)
                                           NJ statewide parcel layer by address text, polygon and assessor row
  nj_parcels_near(key, lat, lon, distance_m=60)
                                           NJ parcels within a distance of a point whose address equals key
  nj_permits(muni_code, block, lot)        NJ construction permit feed for one lot
  pa_parcels(county, key, town=None, near=None)
                                           the county parcel layer for a wired Pennsylvania county (PA_COUNTIES)
  pa_parcels_near(county, key, lat, lon, distance_m=60)
  footprints(ring_ll=None, lat=None, lon=None, distance_m=25)
                                           FEMA / ORNL USA Structures outlines in a parcel or near a point
  elevation(lat, lon)                      USGS ground elevation at a point
  source_entry(src, date=None)             {title, publisher, url, date} for a sources list
  scrub(attrs), blocked_key(name)          the owner-field guard

Every adapter returns a dict with 'ok' (bool), 'src' (a SOURCES id) and, when not ok, 'error' ('timeout', 'http', 'payload',
'bad_input'). It never raises on a network or payload failure. Each public value is a fact:
  {'k', 'label', 'v', 'basis': 'public', 'src', 'source', 'as_of', 'date_kind', 'note'?}
date_kind says what as_of is: 'published' (the layer's own date), 'imagery' (the outline's image date) or 'retrieved'.

Privacy (WAVE3 ruling 4): every request names a fixed field whitelist (never '*'); every returned attribute dict is cut to that
whitelist and then passed through a guard that drops any key that looks like an owner, mailing, buyer, seller or previous-owner
field. A sale price is never requested. The module checks its own whitelists against the guard when it is imported.

All calls go through fetch(), which uses property._get_json (one retry on a transport error, none on an HTTP error) with a
2.5 second timeout per call. Tests replace property._get_json, as tests/test_property.py does.

Import note: `import property as homes`, never a bare `import property`. Author: Syed Rahman.
"""

import datetime
import json
import math
import os
import re
import threading
import time

import property as homes

CALL_TIMEOUT = float(os.environ.get('SITE_CALL_TIMEOUT', '2.5'))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIPS_PATH = os.path.join(ROOT, 'data', 'pp_zips.json')
if not os.path.exists(ZIPS_PATH):   # the hosted backend deploys server/ only: use the copy kept beside the knowledge base
    ZIPS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'knowledge', 'zip_points.json')

CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
CENSUS_BENCHMARK = 'Public_AR_Current'
STRUCTURES_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0'
# The footprint layer answers 404 to a GET longer than about 2,000 characters (a 64-point ring did, 23 Nov 2026; 40 points is
# about 1,630). A longer parcel ring is sent as its envelope: a superset, and the primary building is picked inside the ring later.
POLYGON_MAX_PTS = 40
EPQS_URL = 'https://epqs.nationalmap.gov/v1/json'

# ---------------------------------------------------------------- the owner-field guard

BLOCKED = re.compile(r'OWN|MAIL|BUYER|SELLER|PREV_?OWNER|GRANTEE|GRANTOR|CARE_?OF|SOLD_?(?:TO|BY)|^ST_ADDRESS$|^CITY_STATE$|^ZIP_CODE$'
                     r'|^ADDR\d|DEEDED$|SHORT_NAME|SECOND_LIS|THIRD_LIST|^MAD_|PRICE|CONSIDERATION', re.I)


def blocked_key(name):
    """True for a field name that may hold an owner, a mailing address, a buyer, a seller or a sale price."""
    return bool(BLOCKED.search(str(name or '')))


def scrub(attrs, whitelist=None):
    """A copy of one attribute dict with only whitelisted keys, and never a blocked one."""
    if not isinstance(attrs, dict):
        return {}
    allow = set(whitelist) if whitelist else None
    return {k: v for k, v in attrs.items() if (allow is None or k in allow) and not blocked_key(k)}


# ---------------------------------------------------------------- sources

SOURCES = {
    'census': {'title': 'Census Geocoder, one-line address (benchmark Public_AR_Current)', 'publisher': 'U.S. Census Bureau',
               'url': 'https://geocoding.geo.census.gov/geocoder/'},
    'zip_centroids': {'title': 'ZIP code centroids (Census ZIP code tabulation areas), portal ZIP table', 'publisher': 'U.S. Census Bureau',
                      'url': 'https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html'},
    'nj_parcels': {'title': 'New Jersey parcels and MOD-IV tax list (Parcels_Composite_NJ_WM)', 'publisher': 'NJ Office of GIS (NJOGIS)',
                   'url': homes.PARCELS_URL},
    'nj_permits': {'title': 'NJ Construction Permit Data', 'publisher': 'NJ Department of Community Affairs', 'url': homes.PERMITS_PAGE},
    'structures': {'title': 'USA Structures (building outlines)', 'publisher': 'FEMA Geospatial Response Office; Oak Ridge National Laboratory',
                   'url': STRUCTURES_URL},
    'usgs_epqs': {'title': 'Elevation Point Query Service (3DEP)', 'publisher': 'U.S. Geological Survey', 'url': 'https://epqs.nationalmap.gov/v1/docs'},
}

NJ_FIELDS = ('PAMS_PIN', 'PCL_MUN', 'PCLBLOCK', 'PCLLOT', 'PCLQCODE', 'PROP_CLASS', 'COUNTY', 'MUN_NAME', 'PROP_LOC', 'ZIP5', 'IMPRVT_VAL',
             'BLDG_DESC', 'LAND_DESC', 'CALC_ACRE', 'BLDG_CLASS', 'YR_CONSTR', 'DWELL', 'FAC_NAME', 'PCL_PBDATE')
STRUCTURE_FIELDS = ('BUILD_ID', 'OCC_CLS', 'PRIM_OCC', 'OUTBLDG', 'HEIGHT', 'SQMETERS', 'SOURCE', 'IMAGE_DATE', 'PROD_DATE', 'VAL_METHOD',
                    'LONGITUDE', 'LATITUDE')
NJ_CLASS = dict(homes.NJ_CLASS, **{'5A': 'railroad', '5B': 'railroad', '6A': 'telephone business', '15A': 'public school',
                                   '15B': 'other school', '15C': 'public property', '15D': 'church or charity', '15E': 'cemetery',
                                   '15F': 'other exempt'})

# The Pennsylvania county layers named in the home-sales files, read live on 23 Nov 2026 (field lists and one public building each).
# 'addr' is the situs field the LIKE filter runs on; 'town' a field to prefer rows in the typed town; 'building' says whether the
# county publishes building facts (year built, floor area, storeys). Berks (a table with no geometry), Dauphin (not an ArcGIS
# service) and Montgomery (a table with no geometry, outside the service area) are not wired.
PA_COUNTIES = {
    'York': {'src': 'pa_york', 'url': 'https://arcweb1.ycpc.org/server/rest/services/OPEN_DATA/Parcels/FeatureServer/0',
             'title': 'York County parcels and assessment (OPEN_DATA Parcels)', 'publisher': 'York County Planning Commission',
             'addr': 'PROPADR', 'town': None, 'building': True,
             'fields': ('PIDN', 'PROPADR', 'CLASS', 'LUC', 'ACRES', 'STYLE', 'NUM_STORIE', 'RES_LIVING_AREA', 'YRBLT', 'HEATSYS', 'FUEL',
                        'UTILITY', 'APRBLDG', 'COMM_STRUC', 'COMM_YEAR_BUILT', 'COMM_BUILDING_SQ_FT')},
    'Franklin': {'src': 'pa_franklin', 'url': 'https://fcgis.franklincountypa.gov/fcgishosting/rest/services/TaxRecords/FC_TaxRecords/MapServer/0',
                 'title': 'Franklin County tax records (FC_TaxRecords)', 'publisher': 'Franklin County, Pennsylvania',
                 'addr': 'FULL_SITUS_ADDR', 'town': 'REM_PRCL_LOCN_CITY', 'building': True,
                 'fields': ('CONTROL_NUMBER', 'FULL_SITUS_ADDR', 'REM_PRCL_LOCN_CITY', 'REM_PRCL_LOCN_ZIP', 'LAND_USE_CODE', 'LAND_USE_DESC',
                            'YEAR_BUILT', 'CNS_AREA_LIVING', 'CNS_STORIES', 'CNS_STYLE_DESC', 'CNS_BASEMENT', 'HEAT_SOURCE', 'HEAT_DISTRIBUTION',
                            'ATTACHED_GARAGE', 'ATTACHED_GARAGE_AREA_SQFT', 'TOTAL_NUMBER_OF_BEDROOMS', 'PRC_TTL_ASSESS_BLDG', 'TOTAL_DEEDED_ACRES',
                            'COMM_OUTBLDG_1_USE', 'COMM_OUTBLDG_1_SQ_FT', 'COMM_OUTBLDG_1_STORIES')},
    'Cumberland': {'src': 'pa_cumberland', 'url': 'https://services1.arcgis.com/1Cfo0re3un0w6a30/arcgis/rest/services/Tax_Parcels/FeatureServer/0',
                   'title': 'Cumberland County tax parcels', 'publisher': 'Cumberland County, Pennsylvania',
                   'addr': 'SITUS', 'town': 'MUNI_NAME', 'building': True,
                   'fields': ('PIN', 'SITUS', 'SITUS_ZIP', 'MUNI_NAME', 'P_TYPE', 'LUC', 'CalcAcre', 'BLDG_VAL', 'YEAR_BLT', 'SQFT', 'STORY_HEIG',
                              'DWELLING_T', 'BASEMENT_G', 'BASEMENT_P', 'BEDROOM_CO')},
    'Lebanon': {'src': 'pa_lebanon', 'url': 'https://utility.arcgis.com/usrsvcs/servers/7072ca11c43c43feb1ab453851e847b9/rest/services/LandRecords/TaxParcels/MapServer/0',
                'title': 'Lebanon County tax parcels (LandRecords)', 'publisher': 'Lebanon County, Pennsylvania',
                'addr': 'SITUS_ADDR', 'town': 'SITUS_CITY', 'building': True,
                'fields': ('GEO_PIN', 'SITUS_ADDR', 'SITUS_CITY', 'SITUS_ZIP', 'MUNICIPAL1', 'PROPERTY_T', 'LU_CODE', 'DEEDED_ACR', 'BUILDING_A',
                           'LIVING_ARE', 'YEAR_BUILT')},
    'Lancaster': {'src': 'pa_lancaster', 'url': 'https://services1.arcgis.com/I6XnrlnguPDoEObn/arcgis/rest/services/Parcels_HUBnew/FeatureServer/0',
                  'title': 'Lancaster County parcels (Parcels_HUBnew)', 'publisher': 'Lancaster County, Pennsylvania',
                  'addr': 'ADDRESS', 'town': None, 'building': False,
                  'fields': ('PIN', 'DISTRICT', 'LANDUSECD', 'DEED_ACRES', 'ADDRESS', 'BLDGASSESS', 'TAX_EXEMPT')},
    'Chester': {'src': 'pa_chester', 'url': 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/arcgis/rest/services/Parcels_owners/FeatureServer/0',
                'title': 'Chester County parcels', 'publisher': 'Chester County, Pennsylvania',
                'addr': 'LOC_ADDRESS', 'town': None, 'building': False,
                'fields': ('UPI', 'LOC_ADDRESS', 'LUC', 'CLASS', 'PROP_ASSESS', 'ACRE_PLAN_TOT')},
    'Adams': {'src': 'pa_adams', 'url': 'https://mapping.adamscountypa.gov/arcgis/rest/services/AGOL/Parcel_Owners/MapServer/0',
              'title': 'Adams County parcels', 'publisher': 'Adams County, Pennsylvania',
              'addr': 'COMBINED_SITUS', 'town': 'DISTRICT_NAME', 'building': False,
              'fields': ('Parcel_ID', 'COMBINED_SITUS', 'DISTRICT_NAME', 'PROPERTY_TYPE', 'DEEDED_ACRES')},
    'Perry': {'src': 'pa_perry', 'url': 'https://services.arcgis.com/b1rOZp0BNgsXJwyv/arcgis/rest/services/Perry_County_Web_Map_WFL1/FeatureServer/2',
              'title': 'Perry County parcels', 'publisher': 'Perry County, Pennsylvania',
              'addr': 'REM_PRCL_L', 'town': 'REM_USRFLD', 'building': False,
              'fields': ('PIN', 'REM_PRCL_L', 'REM_USRFLD', 'PRC_TTL_AS')},
}
for _c, _s in PA_COUNTIES.items():
    SOURCES[_s['src']] = {'title': _s['title'], 'publisher': _s['publisher'], 'url': _s['url']}


def _check_whitelists():
    for name, fields in [('NJ', NJ_FIELDS), ('structures', STRUCTURE_FIELDS)] + [(c, s['fields']) for c, s in PA_COUNTIES.items()]:
        bad = [f for f in fields if blocked_key(f)]
        if bad:
            raise RuntimeError(f'{name} whitelist names a blocked field: {bad}')


_check_whitelists()


def source_entry(src, date=None):
    """One sources-list entry: {title, publisher, url, date}."""
    s = SOURCES.get(src) or {}
    return {'title': s.get('title') or src, 'publisher': s.get('publisher') or '', 'url': s.get('url') or '', 'date': date or ''}


# ---------------------------------------------------------------- plumbing

def _today():
    return datetime.date.today()


def fetch(url, params, timeout=None):
    """One GET through property._get_json (looked up at call time, so tests can replace it)."""
    return homes._get_json(url, params, timeout=timeout or CALL_TIMEOUT)


def _err_kind(e):
    n = type(e).__name__.lower()
    if 'timeout' in n:
        return 'timeout'
    if 'status' in n or 'http' in n:
        return 'http'
    if 'connect' in n or 'transport' in n or 'network' in n or isinstance(e, (OSError,)):
        return 'timeout'
    return 'payload'


def _fail(src, e):
    return {'ok': False, 'src': src, 'error': _err_kind(e) if isinstance(e, BaseException) else str(e)}


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _int(v):
    f = _num(v)
    return int(round(f)) if f is not None else None


def _epoch_date(v):
    f = _num(v)
    if f is None or f <= 0:
        return None
    try:
        return datetime.datetime.fromtimestamp(f / 1000.0, datetime.timezone.utc).date().isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _fact(k, label, v, src, as_of, date_kind, note=None):
    f = {'k': k, 'label': label, 'v': v, 'basis': 'public', 'src': src, 'source': (SOURCES.get(src) or {}).get('title') or src,
         'as_of': as_of, 'date_kind': date_kind}
    if note:
        f['note'] = note
    return f


def _ring_ll(geom, max_pts=400):
    """The outer ring of an ArcGIS polygon as [[lon, lat], ...] rounded to 7 places, or None."""
    if not isinstance(geom, dict):
        return None
    rings = geom.get('rings')
    if not isinstance(rings, list) or not rings:
        return None
    best = max((r for r in rings if isinstance(r, list)), key=len, default=None)
    out = []
    for p in best or []:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            x, y = _num(p[0]), _num(p[1])
            if x is not None and y is not None and -180 <= x <= 180 and -85 <= y <= 85:
                out.append([round(x, 7), round(y, 7)])
    if len(out) < 4:
        return None
    if len(out) > max_pts:
        step = math.ceil(len(out) / max_pts)
        out = out[::step] + [out[0]]
    return out


def _centroid(ring):
    if not ring:
        return None
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    return [round(sum(p[0] for p in pts) / len(pts), 7), round(sum(p[1] for p in pts) / len(pts), 7)]


def _dist_m(a, b):
    """Metres between two [lon, lat] points (equirectangular; good to a few centimetres over a lot)."""
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320.0


def _features(js):
    if not isinstance(js, dict) or js.get('error'):
        raise ValueError('service error')
    return [f for f in js.get('features') or [] if isinstance(f, dict) and isinstance(f.get('attributes'), dict)]


# ---------------------------------------------------------------- address text

_SUFFIXES = set(homes.SUFFIX.values()) | {'PLZ', 'PLAZA', 'WAY', 'RUN', 'PIKE', 'ROW', 'WALK', 'PATH', 'LOOP', 'BND', 'BEND', 'GRN', 'GLN', 'HL', 'HOLW'}
_DIRS = {'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'}


def street_key(s):
    """The comparison key of a street address: upper case, standard suffixes, no unit (property.addr_split)."""
    s = re.split(r'\s{2,}', str(s or '').strip())[0]           # Franklin writes "157 LINCOLN WAY EAST  CHAMBERSBURG PA 17201"
    return homes.addr_split(s)[0]


def _core(key):
    """House number plus street name: the key without its trailing suffix or direction ("200 GEORGIA RD" -> "200 GEORGIA")."""
    t = key.split()
    while len(t) > 2 and (t[-1] in _SUFFIXES or t[-1] in _DIRS):
        t = t[:-1]
    return ' '.join(t)


def match_level(want, got):
    """'exact' when the keys are equal, 'street' when number and street name agree but the suffix differs, else ''."""
    if not want or not got:
        return ''
    if want == got:
        return 'exact'
    return 'street' if _core(want) == _core(got) else ''


def like_prefix(key):
    """The LIKE prefix for an address filter: house number and first street word ("12 N MAIN", not "12 N"). None when unusable."""
    toks = [t for t in re.sub(r'[^A-Z0-9 ]', ' ', str(key or '').upper()).split() if t]
    if len(toks) < 2 or not re.match(r'^\d', toks[0]):
        return None
    return ' '.join(toks[:2]) if len(toks) == 2 or len(toks[1]) > 2 else ' '.join(toks[:3])


def _sql(v):
    return re.sub(r'[^A-Z0-9 .#/&-]', '', str(v or '').upper())[:60]


# ---------------------------------------------------------------- geocoding

def geocode(address):
    """Census one-line geocoder. {'ok', 'src', 'status': 'found'|'not_found', 'matches': [place, ...]} where place is
    {label, lat, lon, precision: 'typed', geocoder: 'census', basis: 'public', src, as_of, date_kind, parts: {street, city, state, zip}}.
    The point is interpolated along the street's address range: it sits on the street, not on the building."""
    a = re.sub(r'\s+', ' ', str(address or '')).strip()[:120]
    if not a or not re.search(r'\d', a):
        return {'ok': False, 'src': 'census', 'error': 'bad_input'}
    try:
        js = fetch(CENSUS_URL, {'address': a, 'benchmark': CENSUS_BENCHMARK, 'format': 'json'})
        ms = ((js or {}).get('result') or {}).get('addressMatches')
        if not isinstance(ms, list):
            raise ValueError('payload')
    except Exception as e:                                      # noqa: BLE001 (any failure moves down the ladder)
        return _fail('census', e)
    today = _today().isoformat()
    out = []
    for m in ms[:6]:
        if not isinstance(m, dict):
            continue
        c = m.get('coordinates') or {}
        lon, lat = _num(c.get('x')), _num(c.get('y'))
        if lon is None or lat is None or not (-180 <= lon <= 180 and -85 <= lat <= 85):
            continue
        ac = m.get('addressComponents') or {}
        street = ' '.join(str(ac.get(k) or '').strip() for k in ('fromAddress', 'preDirection', 'streetName', 'suffixType', 'suffixDirection')
                          if ac.get(k)) if ac else ''
        out.append({'label': str(m.get('matchedAddress') or '')[:120], 'lat': round(lat, 7), 'lon': round(lon, 7), 'precision': 'typed',
                    'geocoder': 'census', 'basis': 'public', 'src': 'census', 'as_of': today, 'date_kind': 'retrieved',
                    'parts': {'street': street or None, 'city': ac.get('city') or None, 'state': ac.get('state') or None, 'zip': ac.get('zip') or None}})
    return {'ok': True, 'src': 'census', 'status': 'found' if out else 'not_found', 'matches': out}


_zips = None
_zips_lock = threading.Lock()


def _zip_rows():
    global _zips
    if _zips is None:
        with _zips_lock:
            if _zips is None:
                try:
                    with open(ZIPS_PATH, encoding='utf-8') as f:
                        d = json.load(f)
                    cols = d['cols']
                    ix = {c: cols.index(c) for c in ('zip', 'city', 'county', 'state', 'lat', 'lon')}
                    enums = d.get('enums') or {}
                    rows = []
                    for r in d['rows']:
                        def val(c):
                            v = r[ix[c]]
                            return enums[c][v] if c in enums and isinstance(v, int) else v
                        rows.append({c: val(c) for c in ix})
                    _zips = rows
                except (OSError, ValueError, KeyError, IndexError, TypeError):
                    _zips = []
    return _zips


def _town_name(city):
    return re.sub(r'\s+(borough|township|city|town|CDP|village)$', '', str(city or ''), flags=re.I).strip()


def town_point(zip=None, town=None, state=None):
    """A ZIP or town centroid from the portal's ZIP table (Census ZCTA points). {'ok', 'src', 'status', 'place'}.
    place: {label, lat, lon, precision: 'town', geocoder: 'zip centroid', basis: 'public', src, as_of, date_kind, zip, county, state}."""
    rows = _zip_rows()
    z = re.search(r'\b(\d{5})\b', str(zip or ''))
    hit = None
    if z:
        hit = next((r for r in rows if r['zip'] == z.group(1)), None)
    if not hit and town:
        t = re.sub(r'[^A-Z ]', '', str(town).upper()).strip()
        st = str(state or '').upper()[:2]
        cands = [r for r in rows if _town_name(r['city']).upper() == t and (not st or r['state'] == st)]
        hit = cands[0] if cands else None
    if not hit or _num(hit.get('lat')) is None or _num(hit.get('lon')) is None:
        return {'ok': True, 'src': 'zip_centroids', 'status': 'not_found', 'place': None}
    label = ', '.join(x for x in (_town_name(hit['city']), f"{hit['state']} {hit['zip']}") if x)
    return {'ok': True, 'src': 'zip_centroids', 'status': 'found',
            'place': {'label': label, 'lat': round(float(hit['lat']), 5), 'lon': round(float(hit['lon']), 5), 'precision': 'town',
                      'geocoder': 'zip centroid', 'basis': 'public', 'src': 'zip_centroids', 'as_of': None, 'date_kind': 'retrieved',
                      'zip': hit['zip'], 'county': re.sub(r'\s+County$', '', str(hit['county'] or '')), 'state': hit['state']}}


# ---------------------------------------------------------------- New Jersey

_BLDG = re.compile(r'^(\d(?:\.5)?)\s?S?\s?(CB|AL|F|B|V|M)?(?:\s?(\d)\s?G)?(?=\s|\d|$)')
_MATERIAL = {'F': 'frame', 'B': 'brick', 'AL': 'aluminium siding', 'V': 'vinyl siding', 'CB': 'concrete block', 'M': 'masonry'}


def read_bldg_desc(desc):
    """The NJ assessor's building shorthand ("2F2G 2240", "3SM 78326SF") -> {stories, material, garage_cars, floor_area_sqft}.
    Only what the text plainly says; missing parts are None."""
    s = re.sub(r'\s+', ' ', str(desc or '').upper()).strip()
    out = {'stories': None, 'material': None, 'garage_cars': None, 'floor_area_sqft': None}
    m = _BLDG.match(s)
    if not (m and 1 <= float(m.group(1)) <= 6 and (m.group(2) or m.group(3) or 'S' in s[:4])):
        m = None
    if m:
        out['stories'] = float(m.group(1)) if '.' in m.group(1) else int(m.group(1))
        out['material'] = _MATERIAL.get(m.group(2) or '')
        out['garage_cars'] = int(m.group(3)) if m.group(3) else None
    a = re.search(r'(\d{3,7})\s*(?:SF|SQ\s*FT)?\s*$', s)
    if a and (m is None or a.start() >= m.end()):
        v = int(a.group(1))
        if 200 <= v <= 5_000_000:
            out['floor_area_sqft'] = v
    return out


def _nj_parcel(attrs, geom, today):
    a = scrub(attrs, NJ_FIELDS)
    as_of = _epoch_date(a.get('PCL_PBDATE'))
    src = 'nj_parcels'
    F = []
    cls = str(a.get('PROP_CLASS') or '').strip().upper()
    if cls:
        F.append(_fact('property_class', 'Property class', f"{cls} ({NJ_CLASS[cls]})" if cls in NJ_CLASS else cls, src, as_of, 'published'))
    yr = _int(a.get('YR_CONSTR'))
    if yr and 1700 <= yr <= today.year:
        F.append(_fact('year_built', 'Year built', yr, src, as_of, 'published'))
    desc = re.sub(r'\s+', ' ', str(a.get('BLDG_DESC') or '')).strip()
    if desc:
        F.append(_fact('building_desc', 'Assessor building description', desc[:40], src, as_of, 'published'))
        r = read_bldg_desc(desc)
        if r['stories']:
            F.append(_fact('stories', 'Storeys', r['stories'], src, as_of, 'published', note='read from the assessor building description'))
        if r['material']:
            F.append(_fact('material', 'Walls', r['material'], src, as_of, 'published', note='read from the assessor building description'))
        if r['garage_cars']:
            F.append(_fact('garage_cars', 'Garage (cars)', r['garage_cars'], src, as_of, 'published', note='read from the assessor building description'))
        if r['floor_area_sqft']:
            F.append(_fact('floor_area_sqft', 'Building area (sq ft)', r['floor_area_sqft'], src, as_of, 'published',
                           note='read from the assessor building description'))
    iv = _int(a.get('IMPRVT_VAL'))
    if iv:
        F.append(_fact('assessed_improvements', 'Assessed value of improvements ($)', iv, src, as_of, 'published'))
    ac = _num(a.get('CALC_ACRE'))
    if ac:
        F.append(_fact('lot_acres', 'Lot (acres)', round(ac, 3), src, as_of, 'published'))
    if cls in ('2', '4C') and _int(a.get('DWELL')):
        F.append(_fact('dwelling_units', 'Dwelling units', _int(a.get('DWELL')), src, as_of, 'published'))
    if cls.startswith('15') and a.get('FAC_NAME'):
        F.append(_fact('facility', 'Facility', str(a['FAC_NAME']).strip()[:40], src, as_of, 'published'))
    ring = _ring_ll(geom)
    addr = re.sub(r'\s+', ' ', str(a.get('PROP_LOC') or '')).strip()
    muni = str(a.get('MUN_NAME') or '').strip()
    qual = str(a.get('PCLQCODE') or '').strip() or None
    return {'src': src, 'id': {'pams_pin': a.get('PAMS_PIN'), 'muni_code': homes._safe(a.get('PCL_MUN'), 4), 'block': homes._safe(a.get('PCLBLOCK')),
                               'lot': homes._safe(a.get('PCLLOT')), 'qual': homes._safe(qual) if qual else None},
            'addr': addr, 'key': street_key(addr), 'label': ', '.join(x for x in (addr.title(), muni.title()) if x),
            'muni': muni or None, 'county': (str(a.get('COUNTY') or '').title() or None), 'state': 'NJ', 'zip': (str(a.get('ZIP5') or '').strip() or None),
            'ring_ll': ring, 'centroid': _centroid(ring), 'as_of': as_of, 'date_kind': 'published', 'facts': F}


def _nj_query(where, count):
    return fetch(homes.PARCELS_URL + '/query', {'where': where, 'outFields': ','.join(NJ_FIELDS), 'returnGeometry': 'true', 'outSR': 4326,
                                                 'geometryPrecision': 7, 'resultRecordCount': count, 'f': 'json'})


def _rank(parcels, key, near):
    out = []
    for p in parcels:
        lvl = match_level(key, p['key'])
        if not lvl:
            continue
        p['match'] = lvl
        if near and p.get('centroid'):
            p['distance_m'] = round(_dist_m([near[1], near[0]], p['centroid']), 1)
        out.append(p)
    exact = [p for p in out if p['match'] == 'exact']
    out = exact or out
    out.sort(key=lambda p: p.get('distance_m', 0))
    return out


def nj_parcels(key, county=None, town=None, muni_code=None, near=None):
    """NJ parcels whose location matches a street key. {'ok', 'src', 'parcels': [parcel, ...]} with parcel:
    {src, id: {pams_pin, muni_code, block, lot, qual}, addr, key, label, muni, county, state, zip, ring_ll, centroid, as_of, date_kind,
     facts: [fact], match: 'exact'|'street', distance_m?}. Only rows that match the key are returned (exact ones when any).
    town narrows by municipality name (a postal town that names no municipality falls back to the county or the state).
    near is (lat, lon): adds distance_m from the parcel centroid and sorts by it."""
    like = like_prefix(key)
    if not like:
        return {'ok': False, 'src': 'nj_parcels', 'error': 'bad_input'}
    base = f"PROP_LOC LIKE '{like}%'"
    wheres = []
    if muni_code and homes._safe(muni_code, 4):
        wheres.append(f"PCL_MUN='{homes._safe(muni_code, 4)}' AND {base}")
    c = re.sub(r'[^A-Z ]', '', str(county or '').upper()).strip()
    t = _sql(re.sub(r'\b(TWP|TOWNSHIP|BORO|BOROUGH|CITY|TOWN|VILLAGE)\b', '', str(town or '').upper())).strip()
    if t:
        wheres.append((f"COUNTY='{c}' AND " if c else '') + f"MUN_NAME LIKE '{t}%' AND {base}")
    wheres.append((f"COUNTY='{c}' AND " if c else '') + base)
    today = _today()
    try:
        for w in wheres:
            feats = _features(_nj_query(w, 12))
            got = _rank([_nj_parcel(f['attributes'], f.get('geometry'), today) for f in feats], key, near)
            if got:
                return {'ok': True, 'src': 'nj_parcels', 'parcels': got}
        return {'ok': True, 'src': 'nj_parcels', 'parcels': []}
    except Exception as e:                                      # noqa: BLE001
        return _fail('nj_parcels', e)


def _near_params(lat, lon, distance_m):
    return {'geometry': f'{float(lon):.7f},{float(lat):.7f}', 'geometryType': 'esriGeometryPoint', 'inSR': 4326, 'distance': int(distance_m),
            'units': 'esriSRUnit_Meter', 'spatialRel': 'esriSpatialRelIntersects'}


def nj_parcels_near(key, lat, lon, distance_m=60):
    """NJ parcels within distance_m of a point whose address matches key (ladder step 4b). Same shape as nj_parcels.
    Parcels whose address does not match are dropped before anything is returned."""
    if _num(lat) is None or _num(lon) is None or not like_prefix(key):
        return {'ok': False, 'src': 'nj_parcels', 'error': 'bad_input'}
    p = _near_params(lat, lon, min(max(int(distance_m), 5), 150))
    p.update({'outFields': ','.join(NJ_FIELDS), 'returnGeometry': 'true', 'outSR': 4326, 'geometryPrecision': 7, 'resultRecordCount': 40, 'f': 'json'})
    try:
        feats = _features(fetch(homes.PARCELS_URL + '/query', p))
    except Exception as e:                                      # noqa: BLE001
        return _fail('nj_parcels', e)
    today = _today()
    return {'ok': True, 'src': 'nj_parcels', 'parcels': _rank([_nj_parcel(f['attributes'], f.get('geometry'), today) for f in feats], key, (lat, lon))}


def nj_permits(muni_code, block, lot):
    """Permits the NJ feed holds for one lot, newest first. {'ok', 'src', 'permits': [{date, type, trades, cert, status}], 'as_of'}.
    Fees and costs are kept as numbers; nothing in the feed names a person."""
    code, b, l = homes._safe(muni_code, 4), homes._safe(block), homes._safe(lot)
    if not (code and b and l):
        return {'ok': False, 'src': 'nj_permits', 'error': 'bad_input'}
    quoted = lambda v: ','.join(f"'{f}'" for f in homes._bl_forms(v))
    where = f"treasurycode='{code}' AND block in({quoted(b)}) AND lot in({quoted(l)})"
    try:
        js = fetch(homes.PERMITS_URL, {'$where': where, '$select': homes.PERMIT_FIELDS, '$order': 'permitdate DESC', '$limit': 60})
        if not isinstance(js, list):
            raise ValueError('payload')
    except Exception as e:                                      # noqa: BLE001
        return _fail('nj_permits', e)
    today = _today().isoformat()
    out = []
    for r in js:
        if not isinstance(r, dict):
            continue
        d = str(r.get('permitdate') or '')[:10]
        if not homes.words_date(d) or not ('1980-01-01' <= d <= today):
            continue
        trades = [t for t, k in (('building', 'buildfee'), ('plumbing', 'plumbfee'), ('electrical', 'electfee'), ('fire', 'firefee'))
                  if (_num(r.get(k)) or 0) > 0]
        cert = str(r.get('certdate') or '')[:10]
        out.append({'date': d, 'type': str(r.get('permittypedesc') or 'Permit')[:60], 'trades': trades, 'cost': _num(r.get('constcost')) or 0,
                    'cert': cert if homes.words_date(cert) and cert <= today else None, 'status': str(r.get('status') or '')[:4],
                    'basis': 'public', 'src': 'nj_permits'})
    out.sort(key=lambda p: p['date'], reverse=True)
    return {'ok': True, 'src': 'nj_permits', 'permits': out[:20], 'as_of': today, 'date_kind': 'retrieved'}


# ---------------------------------------------------------------- Pennsylvania counties

def _pa_addr(county, a):
    v = re.sub(r'\s{2,}', '  ', str(a.get(PA_COUNTIES[county]['addr']) or '').strip())
    return re.split(r'\s{2,}', v)[0].strip()


def _pa_facts(county, a, src, as_of, today):
    """The building and assessor facts one county row publishes. Coded fields with no published code table are kept apart."""
    F, codes = [], {}

    def add(k, label, v, note=None):
        if v not in (None, '', 0):
            F.append(_fact(k, label, v, src, as_of, 'retrieved', note))

    def year(v):
        y = _int(v)
        return y if y and 1700 <= y <= today.year else None

    def pos(v, lo=1, hi=5_000_000):
        f = _num(v)
        return (int(f) if float(f).is_integer() else f) if f is not None and lo <= f <= hi else None

    if county == 'York':
        y, cy = year(a.get('YRBLT')), year(a.get('COMM_YEAR_BUILT'))
        add('year_built', 'Year built', y or cy, None if y else 'commercial building record')
        la = pos(a.get('RES_LIVING_AREA'), 200)
        add('living_area_sqft', 'Living area (sq ft)', la)
        if not la:
            add('floor_area_sqft', 'Building area (sq ft)', pos(a.get('COMM_BUILDING_SQ_FT'), 200), 'commercial building record')
        add('stories', 'Storeys', pos(a.get('NUM_STORIE'), 1, 6))
        add('assessed_building', 'Assessed building value ($)', pos(a.get('APRBLDG')))
        add('land_use', 'Land use code', ' / '.join(str(x) for x in (a.get('CLASS'), a.get('LUC')) if x) or None)
        add('utilities', 'Utilities', a.get('UTILITY'))
        for k in ('STYLE', 'FUEL', 'HEATSYS', 'COMM_STRUC'):
            if a.get(k) not in (None, ''):
                codes[k] = str(a[k])[:12]
    elif county == 'Franklin':
        add('year_built', 'Year built', year(a.get('YEAR_BUILT')))
        la = pos(a.get('CNS_AREA_LIVING'), 200)
        add('living_area_sqft', 'Living area (sq ft)', la)
        st = pos(a.get('CNS_STORIES'), 1, 6)
        add('stories', 'Storeys', st)
        if not la and not st and a.get('COMM_OUTBLDG_1_SQ_FT'):
            add('floor_area_sqft', 'Building area (sq ft)', pos(a.get('COMM_OUTBLDG_1_SQ_FT'), 200), 'commercial building record')
            add('stories', 'Storeys', pos(a.get('COMM_OUTBLDG_1_STORIES'), 1, 30), 'commercial building record')
        add('style', 'Style', (str(a.get('CNS_STYLE_DESC') or '').strip().title() or None))
        add('heat_source', 'Heat source', (str(a.get('HEAT_SOURCE') or '').strip() or None))
        add('heat_distribution', 'Heat distribution', (str(a.get('HEAT_DISTRIBUTION') or '').strip() or None))
        if la:
            g = str(a.get('ATTACHED_GARAGE') or '').strip().upper()
            add('attached_garage', 'Attached garage', {'YES': 'yes', 'Y': 'yes', 'NO': 'no', 'N': 'no'}.get(g))
            add('garage_area_sqft', 'Attached garage area (sq ft)', pos(a.get('ATTACHED_GARAGE_AREA_SQFT'), 50))
            add('beds', 'Bedrooms', pos(a.get('TOTAL_NUMBER_OF_BEDROOMS'), 1, 20))
        add('assessed_building', 'Assessed building value ($)', pos(a.get('PRC_TTL_ASSESS_BLDG')))
        add('land_use', 'Land use', (str(a.get('LAND_USE_DESC') or '').strip().title() or None))
        add('lot_acres', 'Lot (acres)', pos(a.get('TOTAL_DEEDED_ACRES'), 0.001, 100000))
        if a.get('CNS_BASEMENT') not in (None, ''):
            codes['CNS_BASEMENT'] = str(a['CNS_BASEMENT'])[:12]
    elif county == 'Cumberland':
        add('year_built', 'Year built', year(a.get('YEAR_BLT')))
        add('floor_area_sqft', 'Building area (sq ft)', pos(a.get('SQFT'), 200))
        add('beds', 'Bedrooms', pos(a.get('BEDROOM_CO'), 1, 20))
        add('dwelling_type', 'Dwelling type', (str(a.get('DWELLING_T') or '').strip() or None))
        add('assessed_building', 'Assessed building value ($)', pos(a.get('BLDG_VAL')))
        add('land_use', 'Land use', (str(a.get('LUC') or '').strip() or None))
        add('lot_acres', 'Lot (acres)', pos(a.get('CalcAcre'), 0.001, 100000))
        for k in ('STORY_HEIG', 'BASEMENT_G', 'BASEMENT_P'):
            if a.get(k) not in (None, ''):
                codes[k] = str(a[k])[:12]
    elif county == 'Lebanon':
        add('year_built', 'Year built', year(a.get('YEAR_BUILT')))
        add('living_area_sqft', 'Living area (sq ft)', pos(a.get('LIVING_ARE'), 200))
        add('assessed_building', 'Assessed building value ($)', pos(a.get('BUILDING_A')))
        add('land_use', 'Land use code', ' / '.join(str(x) for x in (a.get('PROPERTY_T'), a.get('LU_CODE')) if x) or None)
        add('lot_acres', 'Lot (acres)', pos(a.get('DEEDED_ACR'), 0.001, 100000))
    elif county == 'Lancaster':
        add('assessed_building', 'Assessed building value ($)', pos(a.get('BLDGASSESS')))
        add('land_use', 'Land use code', a.get('LANDUSECD'))
        add('lot_acres', 'Lot (acres)', pos(a.get('DEED_ACRES'), 0.001, 100000))
        add('tax_exempt', 'Tax exempt', {'Y': 'yes', 'N': 'no'}.get(str(a.get('TAX_EXEMPT') or '').upper()))
    elif county == 'Chester':
        add('assessed_building', 'Assessed property value ($)', pos(a.get('PROP_ASSESS')))
        add('land_use', 'Land use code', ' / '.join(str(x) for x in (a.get('CLASS'), a.get('LUC')) if x) or None)
        add('lot_acres', 'Lot (acres)', pos(a.get('ACRE_PLAN_TOT'), 0.001, 100000))
    elif county == 'Adams':
        add('land_use', 'Property type', a.get('PROPERTY_TYPE'))
        add('lot_acres', 'Lot (acres)', pos(a.get('DEEDED_ACRES'), 0.001, 100000))
    elif county == 'Perry':
        add('assessed_total', 'Assessed value ($)', pos(a.get('PRC_TTL_AS')))
    return F, codes


def _pa_parcel(county, attrs, geom, today):
    cfg = PA_COUNTIES[county]
    a = scrub(attrs, cfg['fields'])
    src, as_of = cfg['src'], today.isoformat()
    facts, codes = _pa_facts(county, a, src, as_of, today)
    addr = _pa_addr(county, a)
    town = str(a.get(cfg['town']) or '').strip() if cfg['town'] else ''
    pin = next((a.get(k) for k in ('PIDN', 'CONTROL_NUMBER', 'PIN', 'GEO_PIN', 'UPI', 'Parcel_ID') if a.get(k)), None)
    ring = _ring_ll(geom)
    out = {'src': src, 'id': {'county_pin': str(pin)[:40] if pin else None}, 'addr': addr, 'key': street_key(addr),
           'label': ', '.join(x for x in (addr.title(), town.title(), county + ' County') if x), 'muni': town.title() or None, 'county': county,
           'state': 'PA', 'ring_ll': ring, 'centroid': _centroid(ring), 'as_of': as_of, 'date_kind': 'retrieved', 'facts': facts,
           'building_facts': cfg['building']}
    if codes:
        out['codes'] = codes                                    # published as codes with no code table checked: not facts
    return out


def _pa_rank(county, parcels, key, town, near):
    got = _rank(parcels, key, near)
    t = re.sub(r'[^A-Z ]', '', str(town or '').upper()).strip()
    if t and PA_COUNTIES[county]['town'] and len(got) > 1:
        in_town = [p for p in got if (p.get('muni') or '').upper().startswith(t)]
        got = in_town or got
    return got


def pa_parcels(county, key, town=None, near=None):
    """The county parcel layer by address text. {'ok', 'src', 'parcels': [parcel]} (same parcel shape as nj_parcels, with
    id {county_pin}, 'building_facts' (does the county publish them) and 'codes' for coded fields with no code table)."""
    c = str(county or '').strip().title().replace(' County', '')
    cfg = PA_COUNTIES.get(c)
    if not cfg:
        return {'ok': False, 'src': 'pa', 'error': 'not_wired'}
    like = like_prefix(key)
    if not like:
        return {'ok': False, 'src': cfg['src'], 'error': 'bad_input'}
    try:
        js = fetch(cfg['url'] + '/query', {'where': f"{cfg['addr']} LIKE '{like}%'", 'outFields': ','.join(cfg['fields']), 'returnGeometry': 'true',
                                           'outSR': 4326, 'geometryPrecision': 7, 'resultRecordCount': 12, 'f': 'json'})
        feats = _features(js)
    except Exception as e:                                      # noqa: BLE001
        return _fail(cfg['src'], e)
    today = _today()
    return {'ok': True, 'src': cfg['src'], 'parcels': _pa_rank(c, [_pa_parcel(c, f['attributes'], f.get('geometry'), today) for f in feats], key, town, near)}


def pa_parcels_near(county, key, lat, lon, distance_m=60):
    """County parcels within distance_m of a point whose address matches key. Non-matching parcels are dropped."""
    c = str(county or '').strip().title().replace(' County', '')
    cfg = PA_COUNTIES.get(c)
    if not cfg:
        return {'ok': False, 'src': 'pa', 'error': 'not_wired'}
    if _num(lat) is None or _num(lon) is None or not like_prefix(key):
        return {'ok': False, 'src': cfg['src'], 'error': 'bad_input'}
    p = _near_params(lat, lon, min(max(int(distance_m), 5), 150))
    p.update({'outFields': ','.join(cfg['fields']), 'returnGeometry': 'true', 'outSR': 4326, 'geometryPrecision': 7, 'resultRecordCount': 40, 'f': 'json'})
    try:
        feats = _features(fetch(cfg['url'] + '/query', p))
    except Exception as e:                                      # noqa: BLE001
        return _fail(cfg['src'], e)
    today = _today()
    return {'ok': True, 'src': cfg['src'], 'parcels': _rank([_pa_parcel(c, f['attributes'], f.get('geometry'), today) for f in feats], key, (lat, lon))}


# ---------------------------------------------------------------- building outlines

def _structure(attrs, geom):
    a = scrub(attrs, STRUCTURE_FIELDS)
    ring = _ring_ll(geom)
    if not ring:
        return None
    img = _epoch_date(a.get('IMAGE_DATE'))
    h = _num(a.get('HEIGHT'))
    lon, lat = _num(a.get('LONGITUDE')), _num(a.get('LATITUDE'))
    return {'src': 'structures', 'build_id': _int(a.get('BUILD_ID')), 'ring_ll': ring,
            'centroid': [round(lon, 7), round(lat, 7)] if lon is not None and lat is not None else _centroid(ring),
            'area_m2': round(_num(a.get('SQMETERS')), 1) if _num(a.get('SQMETERS')) else None,
            'height_m': round(h, 2) if h and h > 0 else None, 'height_checked': False,
            'occupancy': (str(a.get('OCC_CLS') or '').strip() or None), 'use': (str(a.get('PRIM_OCC') or '').strip() or None),
            'outbuilding': bool(str(a.get('OUTBLDG') or '').strip()), 'imagery_source': (str(a.get('SOURCE') or '').strip() or None),
            'method': (str(a.get('VAL_METHOD') or '').strip() or None), 'basis': 'public', 'as_of': img, 'date_kind': 'imagery',
            'produced': _epoch_date(a.get('PROD_DATE'))}


def footprints(ring_ll=None, lat=None, lon=None, distance_m=25):
    """USA Structures outlines that touch a parcel ring (a polygon query, or its envelope for a ring over 40 points), or lie within
    distance_m of a point. {'ok', 'src', 'buildings': [building], 'query': 'parcel'|'envelope'|'point'} with building:
    {src, build_id, ring_ll, centroid, area_m2, height_m, height_checked: False, occupancy, use, outbuilding, imagery_source, method,
     basis: 'public', as_of (the imagery date), date_kind: 'imagery', produced}. height_m is the layer's value as published; its
    meaning is not documented, so the height rule (lane S2) decides whether to use it. Addresses are not requested."""
    # No resultRecordCount here: on this national layer it makes the service sort for paging, and the query then runs past 6 s
    # (measured 23 Nov 2026; without it 0.25 to 0.4 s). The result is cut to 60 outlines after it arrives.
    p = {'outFields': ','.join(STRUCTURE_FIELDS), 'returnGeometry': 'true', 'outSR': 4326, 'geometryPrecision': 7,
         'f': 'json', 'spatialRel': 'esriSpatialRelIntersects', 'inSR': 4326}
    ring = [pt for pt in (ring_ll or []) if isinstance(pt, (list, tuple)) and len(pt) >= 2 and _num(pt[0]) is not None and _num(pt[1]) is not None]
    if 4 <= len(ring) <= POLYGON_MAX_PTS:
        how = 'parcel'
        p.update({'geometry': json.dumps({'rings': [[[round(float(x), 7), round(float(y), 7)] for x, y, *_ in ring]],
                                          'spatialReference': {'wkid': 4326}}, separators=(',', ':')),
                  'geometryType': 'esriGeometryPolygon'})
    elif len(ring) > POLYGON_MAX_PTS:
        how = 'envelope'
        xs, ys = [float(q[0]) for q in ring], [float(q[1]) for q in ring]
        p.update({'geometry': f'{min(xs):.7f},{min(ys):.7f},{max(xs):.7f},{max(ys):.7f}', 'geometryType': 'esriGeometryEnvelope'})
    elif _num(lat) is not None and _num(lon) is not None:
        how = 'point'
        p.update(_near_params(lat, lon, min(max(int(distance_m), 1), 100)))
    else:
        return {'ok': False, 'src': 'structures', 'error': 'bad_input'}
    try:
        feats = _features(fetch(STRUCTURES_URL + '/query', p))
    except Exception as e:                                      # noqa: BLE001
        return _fail('structures', e)
    out = [b for b in (_structure(f['attributes'], f.get('geometry')) for f in feats[:60]) if b]
    return {'ok': True, 'src': 'structures', 'query': how, 'buildings': out}


# ---------------------------------------------------------------- ground elevation

def elevation(lat, lon):
    """Ground elevation at a point from USGS EPQS. {'ok', 'src', 'fact': fact | None}, the value in metres (1 m resolution)."""
    if _num(lat) is None or _num(lon) is None:
        return {'ok': False, 'src': 'usgs_epqs', 'error': 'bad_input'}
    try:
        js = fetch(EPQS_URL, {'x': f'{float(lon):.7f}', 'y': f'{float(lat):.7f}', 'units': 'Meters', 'wkid': 4326})
        if not isinstance(js, dict):
            raise ValueError('payload')
    except Exception as e:                                      # noqa: BLE001
        return _fail('usgs_epqs', e)
    v = _num(js.get('value'))
    if v is None or v < -500 or v > 9000:                     # EPQS answers -1000000 where it has no data
        return {'ok': True, 'src': 'usgs_epqs', 'fact': None}
    return {'ok': True, 'src': 'usgs_epqs',
            'fact': _fact('ground_elevation_m', 'Ground elevation (m)', round(v, 1), 'usgs_epqs', _today().isoformat(), 'retrieved')}


# ---------------------------------------------------------------- helpers for the join (lane S3)

def all_facts(result):
    """Every fact in an adapter result (parcels' facts, an elevation fact), flattened. Handy for a Sources drawer."""
    out = []
    for p in (result or {}).get('parcels') or []:
        out += p.get('facts') or []
    if (result or {}).get('fact'):
        out.append(result['fact'])
    return out


def timed(fn, *args, **kw):
    """(result, seconds): run one adapter and time it."""
    t = time.monotonic()
    r = fn(*args, **kw)
    return r, round(time.monotonic() - t, 3)
