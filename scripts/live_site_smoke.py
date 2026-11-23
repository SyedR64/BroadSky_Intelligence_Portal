#!/usr/bin/env python3
"""
Live smoke test of the live-address sources: six PUBLIC landmark addresses, the real free services, no key, no model call.

Each landmark is a municipal building or a county courthouse (never a private home). For each one the script calls the
adapters in server/site_sources.py directly and checks:

  census      the geocoder returns a point, and the point is where the building is
  parcels     the county or state layer returns the building's lot, with the public facts that county publishes
              (a county that publishes no building facts is expected to return land use and acreage only)
  structures  the outline layer returns at least one building outline for the lot
  usgs_epqs   the ground elevation service returns a plausible height
  nj_permits  (New Jersey only) the permit feed answers (an empty list is fine)
  brief       server/site.py brief(), when that file exists: status found, at most 40 words, a floor sketch card and a
              map command card, sources listed, and none of the words example, sandbox, fictional or owner in the text

and, always, that no key anywhere in any output looks like an owner, mailing, buyer, seller or price field (the privacy rule:
an owner's name is never shown, stored or logged). A privacy failure fails the run at once.

A "source" is one upstream service or county layer (census, structures, usgs_epqs, nj_parcels, nj_permits, pa_york, ...). A
source fails when at most half of its checks pass. The run is tolerant of one upstream service being down:

  exit 0   no source failed, or exactly one (a warning is printed)
  exit 1   two or more sources failed, or a privacy check failed

  uv run --no-project --python 3.12 --with-requirements server/requirements.txt python scripts/live_site_smoke.py
  ... --json              the full result as JSON
  ... --only York         only landmarks whose name contains the text
  ... --extra             also run the extra landmarks (Lebanon County)
  ... --no-brief          skip server/site.py even if it exists

Every call goes through site_sources (2.5 s timeout, one retry on a dropped connection). Here a failed call gets one more try
after a pause. Calls are made one at a time with a pause between landmarks: polite to public services.
"""

import argparse
import importlib.util
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, 'server')
sys.path.insert(0, SERVER)

PACE_S = float(os.environ.get('SMOKE_PACE', '0.4'))
RETRY_PAUSE_S = 2.0
BRIEF_ROLE = os.environ.get('SMOKE_BRIEF_ROLE', 'pp-plumber')
BRIEF_BANNED = re.compile(r'\b(example|sandbox|fictional|owner)\b', re.I)

# name, address as a visitor would type it, state, county, town, expected point (lat, lon), facts the layer must return.
# Public buildings only. The expected facts are what each county's layer published for the building on 23 Nov 2026.
LANDMARKS = [
    {'name': 'Toms River Town Hall (NJ, Ocean)', 'address': '33 Washington St, Toms River, NJ 08753', 'state': 'NJ', 'county': 'Ocean',
     'town': 'Toms River', 'point': (39.9528, -74.1958), 'facts': ['property_class', 'floor_area_sqft']},
    {'name': 'Trenton City Hall (NJ, Mercer)', 'address': '319 E State St, Trenton, NJ 08608', 'state': 'NJ', 'county': 'Mercer',
     'town': 'Trenton', 'point': (40.2206, -74.7594), 'facts': ['year_built', 'floor_area_sqft', 'stories']},
    {'name': 'York County Judicial Center (PA, York)', 'address': '45 N George St, York, PA 17401', 'state': 'PA', 'county': 'York',
     'town': 'York', 'point': (39.9634, -76.7281), 'facts': ['year_built', 'floor_area_sqft']},
    {'name': 'Franklin County Courthouse (PA, Franklin)', 'address': '157 Lincoln Way E, Chambersburg, PA 17201', 'state': 'PA',
     'county': 'Franklin', 'town': 'Chambersburg', 'point': (39.9373, -77.6596), 'facts': ['floor_area_sqft', 'stories']},
    {'name': 'Cumberland County Courthouse (PA, Cumberland)', 'address': '1 Courthouse Square, Carlisle, PA 17013', 'state': 'PA',
     'county': 'Cumberland', 'town': 'Carlisle', 'point': (40.2015, -77.1897), 'facts': ['year_built', 'floor_area_sqft']},
    # Lancaster publishes no building facts: location and outline are real, the rest is "likely" (design 5.1). Land use and acreage only.
    {'name': 'Lancaster County Courthouse (PA, Lancaster)', 'address': '50 N Duke St, Lancaster, PA 17602', 'state': 'PA',
     'county': 'Lancaster', 'town': 'Lancaster', 'point': (40.0394, -76.3039), 'facts': ['land_use', 'lot_acres'], 'building_facts': False},
]
EXTRA = [
    {'name': 'Lebanon County Municipal Building (PA, Lebanon)', 'address': '400 S 8th St, Lebanon, PA 17042', 'state': 'PA', 'county': 'Lebanon',
     'town': 'Lebanon', 'point': (40.3334, -76.4237), 'facts': ['year_built', 'living_area_sqft']},
]
POINT_TOLERANCE_DEG = 0.01      # about 1 km: the geocoder puts the point on the street, so exactness is not asked

# 'town' and 'known' must not match, so a bare 'own' counts only at the start of a word or after an underscore. (The server's own
# guard, site_sources.BLOCKED, matches 'OWN' anywhere: right for upstream field names, too broad for our output keys such as 'town'.)
OWNERISH = re.compile(r'owner|(?:^|[_\s])own(?![a-z])|mail|buyer|seller|grantee|grantor|price|consideration|occupant|resident|tenant', re.I)


# ---------------------------------------------------------------- helpers

def load_sources():
    import site_sources as S                                    # server/ is on sys.path; httpx is imported by property when a call runs
    return S


def load_brief():
    """server/site.py by file path. `import site` would give the standard library's site module, which Python has already loaded."""
    path = os.path.join(SERVER, 'site.py')
    if not os.path.exists(path):
        return None, 'server/site.py is not present'
    try:
        spec = importlib.util.spec_from_file_location('bsp_site_brief', path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except Exception as e:                                      # noqa: BLE001
        return None, 'server/site.py did not import (%s: %s)' % (type(e).__name__, str(e)[:120])
    fn = getattr(mod, 'brief', None)
    return (fn, None) if callable(fn) else (None, 'server/site.py has no brief()')


def call(label, fn, *a, **kw):
    """Run one adapter; on a service failure (ok False, kind timeout or http) try once more. Returns (result, seconds, tries)."""
    t0 = time.monotonic()
    r = fn(*a, **kw)
    tries = 1
    if isinstance(r, dict) and r.get('ok') is False and r.get('error') in ('timeout', 'http'):
        time.sleep(RETRY_PAUSE_S)
        r = fn(*a, **kw)
        tries = 2
    return r, round(time.monotonic() - t0, 2), tries


def owner_keys(node, path=''):
    """Paths of every dictionary key in a value that looks like an owner, mailing, buyer, seller or price field."""
    out = []
    if isinstance(node, dict):
        for k, v in node.items():
            if OWNERISH.search(str(k)):
                out.append('%s.%s' % (path, k))
            out += owner_keys(v, '%s.%s' % (path, k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out += owner_keys(v, '%s[%d]' % (path, i))
    return out


def words(text):
    return len(re.findall(r"\S+", text or ''))


def check_brief(res):
    """Pure check of one brief() result against the contract. Returns a list of problems (empty when it passes)."""
    bad = []
    if not isinstance(res, dict):
        return ['brief did not return a dict']
    if res.get('status') != 'found':
        bad.append('status %r, wanted found' % res.get('status'))
    text = res.get('text') or ''
    if not text:
        bad.append('no text')
    if words(text) > 40:
        bad.append('text has %d words, the limit is 40' % words(text))
    hit = BRIEF_BANNED.search(text)
    if hit:
        bad.append('text uses the word %r' % hit.group(0))
    cards = res.get('cards') or []
    kinds = [c.get('kind') for c in cards if isinstance(c, dict)]
    if 'floor_sketch' not in kinds:
        bad.append('no floor_sketch card')
    maps = [c for c in cards if isinstance(c, dict) and c.get('kind') == 'map_command']
    if not maps:
        bad.append('no map_command card')
    else:
        steps = ((maps[0].get('cmd') or {}).get('steps')) or []
        if not any(isinstance(s, dict) and s.get('kind') == 'site' for s in steps):
            bad.append('the map command has no step of kind site')
    if not res.get('sources'):
        bad.append('no sources listed')
    return bad


# ---------------------------------------------------------------- one landmark

def run_landmark(S, lm, brief_fn):
    """Returns {'name', 'checks': [{source, name, ok, detail, seconds}], 'dump': <everything returned, for the privacy scan>}."""
    checks, dump = [], {}

    def add(source, name, ok, detail, seconds):
        checks.append({'source': source, 'name': name, 'ok': bool(ok), 'detail': detail, 'seconds': seconds})

    typed = lm['address']
    street = typed.split(',')[0]
    key = S.street_key(street)

    # 1. Census geocoder
    g, sec, _ = call('census', S.geocode, typed)
    dump['geocode'] = g
    m = (g.get('matches') or [None])[0] if g.get('ok') else None
    if not g.get('ok'):
        add('census', 'location', False, 'service error: %s' % g.get('error'), sec)
    elif not m:
        add('census', 'location', False, 'no match for the address', sec)
    else:
        dl, dn = abs(m['lat'] - lm['point'][0]), abs(m['lon'] - lm['point'][1])
        ok = dl <= POINT_TOLERANCE_DEG and dn <= POINT_TOLERANCE_DEG
        add('census', 'location', ok, 'point %.4f, %.4f%s' % (m['lat'], m['lon'], '' if ok else ' (not near the building)'), sec)
    near = (m['lat'], m['lon']) if m else None

    # 2. The parcel layer
    if lm['state'] == 'NJ':
        p, sec, _ = call('parcels', S.nj_parcels, key, county=lm['county'], town=lm['town'], near=near)
    else:
        p, sec, _ = call('parcels', S.pa_parcels, lm['county'], key, town=lm['town'], near=near)
    dump['parcels'] = p
    psrc = p.get('src') or ('nj_parcels' if lm['state'] == 'NJ' else 'pa')
    parcel = (p.get('parcels') or [None])[0] if p.get('ok') else None
    if not p.get('ok'):
        add(psrc, 'lot and facts', False, 'service error: %s' % p.get('error'), sec)
    elif not parcel:
        add(psrc, 'lot and facts', False, 'no lot returned for %s' % street, sec)
    else:
        have = {f.get('k') for f in parcel.get('facts') or [] if isinstance(f, dict) and f.get('k')}
        missing = [k for k in lm['facts'] if k not in have]
        ring_ok = bool(parcel.get('ring_ll')) and len(parcel['ring_ll']) >= 4
        ok = not missing and ring_ok
        detail = '%d facts (%s)' % (len(have), ', '.join(sorted(have)))
        if missing:
            detail += '; MISSING ' + ', '.join(missing)
        if not ring_ok:
            detail += '; no lot outline'
        if lm.get('building_facts') is False and parcel.get('building_facts') is not False:
            ok, detail = False, detail + '; the county was expected to publish no building facts'
        add(psrc, 'lot and facts', ok, detail, sec)

    # 3. The outline layer
    if parcel and parcel.get('ring_ll'):
        f, sec, _ = call('structures', S.footprints, ring_ll=parcel['ring_ll'])
    elif near:
        f, sec, _ = call('structures', S.footprints, lat=near[0], lon=near[1], distance_m=25)
    else:
        f, sec = {'ok': False, 'error': 'no point to ask about'}, 0.0
    dump['footprints'] = f
    blds = f.get('buildings') or [] if f.get('ok') else []
    if not f.get('ok'):
        add('structures', 'outline', False, 'service error: %s' % f.get('error'), sec)
    elif not blds:
        add('structures', 'outline', False, 'no building outline found', sec)
    else:
        biggest = max(blds, key=lambda b: b.get('area_m2') or 0)
        npts = len(biggest.get('ring_ll') or [])
        add('structures', 'outline', npts >= 4, '%d outline(s) by %s, largest %s m2, imagery %s' % (len(blds), f.get('query'), biggest.get('area_m2'), biggest.get('as_of')), sec)

    # 4. Ground elevation
    if near:
        e, sec, _ = call('usgs_epqs', S.elevation, near[0], near[1])
        dump['elevation'] = e
        fact = e.get('fact') if e.get('ok') else None
        if not e.get('ok'):
            add('usgs_epqs', 'ground elevation', False, 'service error: %s' % e.get('error'), sec)
        else:
            ok = bool(fact) and -5 < fact['v'] < 1000
            add('usgs_epqs', 'ground elevation', ok, ('%s m' % fact['v']) if fact else 'no elevation value', sec)

    # 5. NJ permits (the feed is keyed by block and lot, so it needs the parcel)
    if lm['state'] == 'NJ' and parcel:
        i = parcel['id']
        pm, sec, _ = call('nj_permits', S.nj_permits, i.get('muni_code'), i.get('block'), i.get('lot'))
        dump['permits'] = pm
        add('nj_permits', 'permit feed', pm.get('ok'), ('%d permit(s)' % len(pm.get('permits') or [])) if pm.get('ok') else 'service error: %s' % pm.get('error'), sec)

    # 6. The whole answer, when server/site.py is there
    if brief_fn:
        text = 'going to %s for a sink repair, give me the floor plans, view' % typed
        t0 = time.monotonic()
        try:
            res = brief_fn(text, BRIEF_ROLE)
            err = None
        except Exception as ex:                                 # noqa: BLE001
            res, err = None, '%s: %s' % (type(ex).__name__, str(ex)[:160])
        sec = round(time.monotonic() - t0, 2)
        dump['brief'] = res
        if err:
            add('brief', 'whole answer', False, 'raised ' + err, sec)
        else:
            problems = check_brief(res)
            deg = (res or {}).get('degraded') or []
            add('brief', 'whole answer', not problems, ('status %s, %d words, %d source(s)%s' % (
                res.get('status'), words(res.get('text')), len(res.get('sources') or []), ('; degraded: ' + ', '.join(map(str, deg))) if deg else ''))
                if not problems else '; '.join(problems), sec)
    return {'name': lm['name'], 'address': typed, 'checks': checks, 'dump': dump}


# ---------------------------------------------------------------- the run

def tally(landmarks):
    by = {}
    for lm in landmarks:
        for c in lm['checks']:
            by.setdefault(c['source'], []).append(c['ok'])
    failed = sorted(s for s, oks in by.items() if sum(oks) * 2 <= len(oks))
    return by, failed


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--extra', action='store_true')
    ap.add_argument('--no-brief', action='store_true')
    args = ap.parse_args()

    S = load_sources()
    brief_fn, brief_note = (None, 'skipped by --no-brief') if args.no_brief else load_brief()
    lms = [l for l in LANDMARKS + (EXTRA if args.extra else []) if args.only.lower() in l['name'].lower()]
    if not lms:
        print('No landmark matches --only %r' % args.only, file=sys.stderr)
        return 1

    t0 = time.monotonic()
    done = []
    for i, lm in enumerate(lms):
        if not args.json:
            print('\n%s\n  %s' % (lm['name'], lm['address']), flush=True)
        r = run_landmark(S, lm, brief_fn)
        done.append(r)
        if not args.json:
            for c in r['checks']:
                print('  %-4s %-11s %-16s %5.2fs  %s' % ('ok' if c['ok'] else 'FAIL', c['source'], c['name'], c['seconds'], c['detail']), flush=True)
        if i + 1 < len(lms):
            time.sleep(PACE_S)

    by, failed = tally(done)
    leaks = []
    for r in done:
        for path in owner_keys(r['dump']):
            leaks.append('%s: %s' % (r['name'], path))
    total = round(time.monotonic() - t0, 1)
    code = 1 if (leaks or len(failed) >= 2) else 0

    summary = {'landmarks': len(done), 'checks': sum(len(r['checks']) for r in done),
               'checks_failed': sum(1 for r in done for c in r['checks'] if not c['ok']),
               'sources': {s: '%d/%d' % (sum(o), len(o)) for s, o in sorted(by.items())}, 'sources_failed': failed,
               'privacy_leaks': leaks, 'brief': 'checked' if brief_fn else brief_note, 'seconds': total, 'exit': code}
    if args.json:
        print(json.dumps({'summary': summary, 'landmarks': [{k: v for k, v in r.items() if k != 'dump'} for r in done]}, indent=1))
    else:
        print('\nSummary: %d landmarks, %d checks, %d failed, %.1f s. brief(): %s.' % (summary['landmarks'], summary['checks'], summary['checks_failed'], total, summary['brief']))
        print('Sources: ' + ', '.join('%s %s' % (s, v) for s, v in summary['sources'].items()))
        print('Privacy: %s' % ('no owner, mailing, buyer, seller or price key in any output' if not leaks else 'LEAK ' + '; '.join(leaks)))
        if leaks:
            print('FAIL: an owner-like key reached the output.')
        elif len(failed) >= 2:
            print('FAIL: %d sources failed (%s).' % (len(failed), ', '.join(failed)))
        elif failed:
            print('PASS with one source down (%s). Tolerated.' % failed[0])
        else:
            print('PASS: every source answered.')
    summ = os.environ.get('GITHUB_STEP_SUMMARY')
    if summ:
        try:
            with open(summ, 'a', encoding='utf-8') as f:
                f.write('### Live site smoke\n\n| Landmark | Check | Result | Seconds | Detail |\n|---|---|---|---|---|\n')
                for r in done:
                    for c in r['checks']:
                        f.write('| %s | %s / %s | %s | %.2f | %s |\n' % (r['name'], c['source'], c['name'], 'ok' if c['ok'] else '**FAIL**', c['seconds'], c['detail'].replace('|', '/')))
                f.write('\nSources down: %s. Privacy leaks: %s. Exit %d.\n' % (', '.join(failed) or 'none', len(leaks), code))
        except OSError:
            pass
    if os.environ.get('GITHUB_ACTIONS'):
        if leaks:
            print('::error title=Owner-like key in a live answer::%s' % '; '.join(leaks)[:400])
        elif len(failed) >= 2:
            print('::error title=Live address sources failing::%s' % ', '.join(failed))
        elif failed:
            print('::warning title=One live address source is down::%s' % failed[0])
    return code


if __name__ == '__main__':
    sys.exit(main())
