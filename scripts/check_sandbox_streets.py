#!/usr/bin/env python3
"""
Do any of the example customers' streets exist on the real road map?

The example records (server/sandbox/*.json, built by scripts/build_agent_sandbox.py) use invented street names, listed in
server/sandbox/streets.json. If a visitor typed a REAL address that equals an example customer's address (same house number,
street and ZIP), the example record could answer for it. The sandbox note only says the names had no home sales among about
240,000 rows; this script asks the US Census geocoder, the road map the live address feature itself uses.

  python3 scripts/check_sandbox_streets.py            the example addresses as written (about 200, one call each)
  python3 scripts/check_sandbox_streets.py --deep     also probe each street in each of its towns at five other house numbers
  python3 scripts/check_sandbox_streets.py --json     the summary as JSON on stdout

What it counts:
  collision   the geocoder returns a match whose street name equals the example street (a real street of that name exists
              in that ZIP, at that number). The script exits 1.
  near        the geocoder returns a match with a different street name (reported, not a failure: an exact-key match in
              the workspace needs the same street name).
  clear       no match.
  error       the service did not answer for that address after a retry. Errors are reported, never counted as clear; with
              errors and no collision the script exits 2 (inconclusive).

Exit 0: every address was checked and none collides. Exit 1: at least one collision. Exit 2: inconclusive.
Standard library only; no key. Polite pacing: one call at a time, a short pause between calls, a User-Agent that names the
purpose. Public data only; no person or private home is involved (the addresses are invented).
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SANDBOX = os.path.join(ROOT, 'server', 'sandbox')
CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
BENCHMARK = 'Public_AR_Current'
PACE_S = float(os.environ.get('CHECK_STREETS_PACE', '0.25'))
TIMEOUT_S = 15
DEEP_NUMBERS = (1, 100, 500, 1000, 2000)
# A public building that is on the real road map. If the geocoder does not find it, "no match" means nothing, so the run is inconclusive.
CONTROL = '45 N George St, York, PA 17401'
SUFFIX_WORDS = {'LANE': 'LN', 'COURT': 'CT', 'WAY': 'WAY', 'DRIVE': 'DR', 'ROAD': 'RD', 'STREET': 'ST', 'AVENUE': 'AVE', 'PLACE': 'PL',
                'TERRACE': 'TER', 'CIRCLE': 'CIR', 'BOULEVARD': 'BLVD', 'TRAIL': 'TRL', 'PARKWAY': 'PKWY'}


def walk_addresses(node, found):
    """Every {line, town, state, zip} dictionary anywhere in a loaded JSON value."""
    if isinstance(node, dict):
        if isinstance(node.get('line'), str) and node.get('town') and node.get('state') and node.get('zip'):
            found.append({'line': node['line'].strip(), 'town': node['town'], 'state': node['state'], 'zip': str(node['zip'])})
        for v in node.values():
            walk_addresses(v, found)
    elif isinstance(node, list):
        for v in node:
            walk_addresses(v, found)


def split_line(line):
    """'418 Wexcombe Ln' -> ('418', 'WEXCOMBE', 'LN'); the street name is everything between the number and the last word."""
    m = re.match(r'^\s*(\d+)\s+(.+?)\s*$', line)
    if not m:
        return None
    words = m.group(2).upper().split()
    if len(words) < 2:
        return m.group(1), words[0] if words else '', ''
    return m.group(1), ' '.join(words[:-1]), words[-1]


def example_addresses():
    """The distinct example addresses (street line, town, state, ZIP) found in every sandbox file."""
    found = []
    for name in sorted(os.listdir(SANDBOX)):
        if name.endswith('.json'):
            with open(os.path.join(SANDBOX, name), encoding='utf-8') as f:
                walk_addresses(json.load(f), found)
    seen, out = set(), []
    for a in found:
        k = (a['line'].upper(), a['zip'])
        if k not in seen:
            seen.add(k)
            out.append(a)
    return out


def example_street_words():
    """The invented street bases from streets.json (for the report)."""
    try:
        with open(os.path.join(SANDBOX, 'streets.json'), encoding='utf-8') as f:
            return [b['base'].upper() for b in json.load(f).get('bases', [])]
    except (OSError, ValueError, KeyError):
        return []


def census(one_line):
    """One geocoder call, one retry on a transport error. Returns (matches, error)."""
    url = CENSUS_URL + '?' + urllib.parse.urlencode({'address': one_line, 'benchmark': BENCHMARK, 'format': 'json'})
    last = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'BSP-Desk-street-check/1.0 (sandbox street names against the public road map)'})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                js = json.load(r)
            ms = ((js or {}).get('result') or {}).get('addressMatches')
            if not isinstance(ms, list):
                return None, 'payload'
            return ms, None
        except urllib.error.HTTPError as e:
            last = 'http %s' % e.code
            if e.code < 500:
                break
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            last = type(e).__name__
        time.sleep(1.5)
    return None, last or 'error'


def judge(want_name, ms):
    """'collision' when any match carries the example street name, 'near' when matches exist under another name, else 'clear'."""
    names = []
    for m in ms:
        ac = (m or {}).get('addressComponents') or {}
        names.append(' '.join(x for x in (ac.get('preDirection'), ac.get('streetName')) if x).upper())
    if any(n == want_name or n.endswith(' ' + want_name) for n in names):
        return 'collision', [m.get('matchedAddress') for m in ms][:3]
    if ms:
        return 'near', [m.get('matchedAddress') for m in ms][:3]
    return 'clear', []


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--deep', action='store_true', help='also probe each street and town at five other house numbers')
    ap.add_argument('--json', action='store_true', help='print the summary as JSON')
    ap.add_argument('--limit', type=int, default=0, help='check only the first N addresses (for a quick test)')
    args = ap.parse_args()

    addrs = example_addresses()
    if not addrs:
        print('No example addresses found under server/sandbox. Is the folder complete?', file=sys.stderr)
        return 2
    probes = [dict(a, kind='as written') for a in addrs]
    if args.deep:
        seen = set()
        for a in addrs:
            parts = split_line(a['line'])
            if not parts:
                continue
            _, name, suffix = parts
            k = (name, suffix, a['zip'])
            if k in seen:
                continue
            seen.add(k)
            for n in DEEP_NUMBERS:
                probes.append({'line': '%d %s %s' % (n, name.title(), suffix.title()), 'town': a['town'], 'state': a['state'], 'zip': a['zip'], 'kind': 'probe'})
    if args.limit:
        probes = probes[:args.limit]

    results, t0 = [], time.monotonic()
    ctl, ctl_err = census(CONTROL)
    control_ok = bool(ctl) and not ctl_err
    if not control_ok:
        print('Control address (%s) was not found by the geocoder (%s): a "no match" would mean nothing. Run again later.' % (CONTROL, ctl_err or 'no match'),
              file=sys.stderr)
        return 2
    time.sleep(PACE_S)
    for i, a in enumerate(probes):
        parts = split_line(a['line'])
        want = parts[1] if parts else ''
        ms, err = census('%s, %s, %s %s' % (a['line'], a['town'], a['state'], a['zip']))
        if err:
            verdict, hits = 'error', [err]
        else:
            verdict, hits = judge(want, ms)
        results.append({'address': '%s, %s, %s %s' % (a['line'], a['town'], a['state'], a['zip']), 'street': want, 'kind': a['kind'],
                        'verdict': verdict, 'matches': hits})
        if not args.json and verdict in ('collision', 'near', 'error'):
            print('  %-9s %s %s' % (verdict.upper(), results[-1]['address'], ('-> ' + '; '.join(h or '' for h in hits)) if hits else ''), flush=True)
        if i + 1 < len(probes):
            time.sleep(PACE_S)

    count = lambda v: sum(1 for r in results if r['verdict'] == v)
    streets = sorted({r['street'] for r in results})
    collided = sorted({r['street'] for r in results if r['verdict'] == 'collision'})
    summary = {'checked': len(results), 'distinct_addresses': len(addrs), 'distinct_street_names': len(streets),
               'invented_bases_in_streets_json': len(example_street_words()), 'collision': count('collision'), 'near': count('near'),
               'clear': count('clear'), 'error': count('error'), 'collided_streets': collided, 'deep': args.deep,
               'seconds': round(time.monotonic() - t0, 1), 'benchmark': BENCHMARK, 'control_found': control_ok}
    summary['exit'] = 1 if summary['collision'] else (2 if summary['error'] else 0)
    if args.json:
        print(json.dumps({'summary': summary, 'results': [r for r in results if r['verdict'] != 'clear']}, indent=1))
    else:
        print('\nExample street check against the Census geocoder (%s)' % BENCHMARK)
        print('  addresses checked : %d (%d distinct example addresses, %d distinct street names%s)'
              % (summary['checked'], summary['distinct_addresses'], summary['distinct_street_names'], ', deep probes on' if args.deep else ''))
        print('  clear             : %d' % summary['clear'])
        print('  near (other name) : %d' % summary['near'])
        print('  collision         : %d%s' % (summary['collision'], (' (' + ', '.join(collided) + ')') if collided else ''))
        print('  service errors    : %d' % summary['error'])
        print('  control address   : found on the road map (%s)' % CONTROL)
        print('  time              : %.1f s' % summary['seconds'])
        verdict = {0: 'PASS: no example street exists on the real road map.',
                   1: 'FAIL: an example street exists on the real road map; a real address could meet an example record.',
                   2: 'INCONCLUSIVE: the geocoder did not answer for some addresses; run again.'}[summary['exit']]
        print(verdict)
    return summary['exit']


if __name__ == '__main__':
    sys.exit(main())
