"""
The likely plan inside a real building outline: what kind of building it is, where the equipment sits and how the lines run.

Pure functions, no network, no clock, no randomness: the same card in gives the same card out. Used by server/site.py dress()
and answer_text(). Units are feet in the plan frame: x across, y down, the street at the bottom (FLOORPLAN_SPEC section 3).

  building_kind(live, footprint_m2, facts=None)  -> {kind: 'house' | 'large', from: short plain reason}        ruling R6
  plan_ring(building, w, h)                      -> the outline in plan feet, placed as the drawing places it
  dress_house(floors, ring, locations, outside, scale)
        Places the template's items by room (not by scaling), puts fixture shutoffs at every wet room on the floors people
        live on, and routes every run square inside the outline (R3, R5): water from the service to the heater and up to each
        wet room, drain from each wet room down to where it leaves for the street, gas from the meter wall to the appliance,
        the service line from its entry wall to the panel. Where a line goes to another floor both floors carry a riser mark
        at the same spot. Returns a short report {failed: [...]} of runs that could not be routed (none expected).
  large_card(card, w, h, live_facts)             -> the card for a large or non-residential building (R6): no rooms, no
        interior lines, the water service and sewer outside on the street side, one note.

Every inferred thing keeps basis 'likely'. Author: Syed Rahman.
"""

import heapq
import math
import re

import site_geo

FT = site_geo.FT
SQFT_PER_M2 = 1.0 / site_geo.M2_PER_SQFT

# R6: a building is 'large' when any of these holds (the thresholds the ruling names)
FOOTPRINT_SQFT_LARGE = 4500        # footprint over this
FLOOR_AREA_SQFT_LARGE = 8000       # recorded floor area over this
STOREYS_LARGE = 4                  # this many storeys or more
NONRES_KEYS = ('property_class', 'land_use', 'facility', 'tax_exempt', 'use_type', 'building_use', 'zoning_use')
NONRES_WORDS = re.compile(r'\b(public|exempt|commercial|industrial|institutional|institution|school|church|charity|government|'
                          r'municipal|hospital|retail|warehouse|railroad|cemetery|utility company|non.?residential|apartments?|'
                          r'business|telephone|telegraph)\b', re.I)
# assessor class codes that are not one-family homes (NJ: 4A commercial, 4B industrial, 4C apartments, 5A/5B railroad,
# 6A/6B telephone and petroleum, 15A to 15F exempt), tested on the code before the words
NONRES_CODES = re.compile(r'^\s*(4[ABC]|5[AB]|6[AB]|15[A-F])\b', re.I)
OFFICE_USE = re.compile(r'^\s*(an? )?office( building| buildings| use|s)?\s*$', re.I)   # an office, not a home with one

LARGE_NOTE = 'Interior layout is not on public record.'
LARGE_SHUTOFF = 'In the mechanical room, usually on the street side at the lowest floor; ask the site contact'
LARGE_SOURCE_LINE = 'Source: public property records where shown.'
HOUSE_FACTS = ('beds', 'baths', 'attached_garage', 'garage', 'bedrooms', 'bathrooms')   # a large card never lists these
BANNED_LARGE = re.compile(r'\b(house|houses|home|homes|garage|garages|living|bedroom|bedrooms|kitchen|kitchens)\b', re.I)

WET = ('kitchen', 'bath', 'laundry')
ITEM_IN = 1.5          # feet an item sits in from the wall it is on
ROUTE_IN = 1.0         # feet a run keeps from the outline
STACK_OFF = 5.0        # feet between a fixture marker and the riser beside it, where the room allows
TURN_FT = 6.0          # a turn costs this many feet of run, so lines stay simple
STACK_REACH = 12.0     # feet (along the run) a fixture may sit from its stack before it gets its own drop
SHARE_COST = 0.8       # extra cost per foot for a drain on the water line's own route: it takes a parallel one when it can
FIX_NOTE = {'kitchen': 'Under the sink', 'bath': 'Under the sink and behind the toilet', 'laundry': 'At the washer hookup'}
METER = {'kind': 'electric_meter', 'label': 'Electric meter', 'short': 'EM', 'basis': 'likely',
         'note': 'Outside, where the service line comes in'}
ORDER = ['basement', 'first', 'second']


# ---------------------------------------------------------------- R6: house or large

def _num(v):
    try:
        x = float(str(v).replace(',', ''))
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def building_kind(live, footprint_m2, facts=None):
    """{kind, from}: 'large' when the footprint, the recorded floor area, the storeys or a non-residential fact says so."""
    facts = (live or {}).get('facts') or [] if facts is None else facts
    fp_sqft = (footprint_m2 or 0) * SQFT_PER_M2
    if fp_sqft > FOOTPRINT_SQFT_LARGE:
        return {'kind': 'large', 'from': f'footprint {fp_sqft:,.0f} sq ft'}
    by = {}
    for f in facts:
        if isinstance(f, dict) and f.get('k') and f.get('v') not in (None, ''):
            by.setdefault(f['k'], f)
    for k in ('floor_area_sqft', 'living_area_sqft'):
        a = _num((by.get(k) or {}).get('v'))
        if a and a > FLOOR_AREA_SQFT_LARGE:
            return {'kind': 'large', 'from': f'recorded floor area {a:,.0f} sq ft'}
    n = _num((by.get('stories') or {}).get('v'))
    if n and n >= STOREYS_LARGE:
        return {'kind': 'large', 'from': f'{n:g} storeys on record'}
    for k in NONRES_KEYS:
        f = by.get(k)
        if not f:
            continue
        v = str(f['v']).strip()
        if re.search(r'\bnon[\s-]?exempt\b|\bnot exempt\b', v, re.I):    # "Non-exempt" says the opposite
            continue
        if (k == 'facility' or (k == 'tax_exempt' and v.lower() in ('yes', 'y', 'true', '1')) or NONRES_CODES.search(v)
                or NONRES_WORDS.search(v) or OFFICE_USE.search(v)):
            return {'kind': 'large', 'from': f"{str(f.get('label') or k).lower()}: {v[:40]}"}
    return {'kind': 'house', 'from': f'footprint {fp_sqft:,.0f} sq ft' if fp_sqft else 'no outline'}


# ---------------------------------------------------------------- the outline in plan feet

def plan_ring(building, w, h):
    """The card's outline (building.footprint.ring_m) in plan feet, turned and centred exactly as the floor sketch draws it:
    the axes of the outline's minimum-area rectangle, down the page towards the street (front.bearing_deg), the outline's
    bounding box centred on the w x h plan. None without a usable ring."""
    fp = (building or {}).get('footprint') or {}
    ring = [[float(p[0]), float(p[1])] for p in fp.get('ring_m') or [] if isinstance(p, (list, tuple)) and len(p) >= 2]
    if len(ring) > 3 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        return None
    try:
        rect = site_geo.oriented_rect(ring)
    except ValueError:
        return None
    u, v = rect['u'], rect['v']
    across = u if (w >= h) == (rect['w_m'] >= rect['d_m']) else v
    down = (across[1], -across[0])
    fb = _num(((building or {}).get('front') or {}).get('bearing_deg'))
    street = (math.sin(math.radians(fb)), math.cos(math.radians(fb))) if fb is not None else (0.0, -1.0)
    if down[0] * street[0] + down[1] * street[1] <= 0:
        down = (-down[0], -down[1])
    ax = (-down[1], down[0])
    pts = [(e * ax[0] + n * ax[1], e * down[0] + n * down[1]) for e, n in ring]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [[w / 2 + (x - cx) / FT, h / 2 + (y - cy) / FT] for x, y in pts]


# ---------------------------------------------------------------- small geometry in plan feet

def pip(p, ring):
    """Point in polygon (even-odd), for a plain list of [x, y] corners."""
    x, y = p[0], p[1]
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def wall_dist(p, ring):
    return min(_seg_dist(p, ring[i - 1], ring[i]) for i in range(len(ring)))


def ok(p, ring, m):
    return pip(p, ring) and wall_dist(p, ring) >= m - 1e-6


def ensure(p, ring, m=ITEM_IN):
    """p if it is at least m inside, else the nearest such point (never outside)."""
    if ok(p, ring, max(m * 0.7, ROUTE_IN)):
        return [p[0], p[1]]
    q = site_geo.snap_inside(p, ring, m)
    if not ok(q, ring, ROUTE_IN):
        q = _open_point(ring)
    return [q[0], q[1]]


_OPEN = {}


def _open_point(ring):
    """The ring's most open inside point (cached per ring: it is the slowest thing here)."""
    k = tuple((round(x, 3), round(y, 3)) for x, y in ring)
    if k not in _OPEN:
        if len(_OPEN) > 256:
            _OPEN.clear()
        _OPEN[k] = site_geo.representative_point(ring)
    return _OPEN[k]


def _spans(ring, c, vertical):
    """Intervals of the line x = c (vertical) or y = c inside the ring."""
    cuts = []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if vertical:
            (a0, a1), (b0, b1) = a, b
        else:
            (a1, a0), (b1, b0) = a, b
        if (a0 <= c) != (b0 <= c):
            cuts.append(a1 + (c - a0) * (b1 - a1) / (b0 - a0))
    cuts.sort()
    return [(cuts[i], cuts[i + 1]) for i in range(0, len(cuts) - 1, 2)]


def bounds(ring):
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def wall_point(ring, side, frac, m=ITEM_IN):
    """A point m in from the outline on one side: 'front' (street, bottom), 'rear', 'left' or 'right', at frac along it."""
    x0, y0, x1, y1 = bounds(ring)
    vertical = side in ('front', 'rear')
    lo, hi = (x0, x1) if vertical else (y0, y1)
    c0 = lo + (hi - lo) * min(1.0, max(0.0, frac))
    mid = (lo + hi) / 2
    step = max(0.5, (hi - lo) / 80)
    k = 0
    while k * step <= (hi - lo):
        for c in ((c0 + k * step, c0 - k * step) if k else (c0,)):
            if not (lo + m <= c <= hi - m):
                continue
            sp = [s for s in _spans(ring, c, vertical) if s[1] - s[0] > 2 * m]
            if not sp:
                continue
            if side in ('front', 'right'):
                t = max(s[1] for s in sp) - m
            else:
                t = min(s[0] for s in sp) + m
            p = [c, t] if vertical else [t, c]
            if ok(p, ring, m * 0.98):
                return p
        k += 1
        if k > 400:
            break
    return ensure([mid, (y0 + y1) / 2] if vertical else [(x0 + x1) / 2, mid], ring, m)


def _in_room(r, p, pad=0.0):
    return r['x'] - pad <= p[0] <= r['x'] + r['w'] + pad and r['y'] - pad <= p[1] <= r['y'] + r['h'] + pad


def room_of(rooms, p):
    inside = [r for r in rooms if _in_room(r, p)]
    inside.sort(key=lambda r: (r.get('kind') in ('hall', 'stairs'), r['w'] * r['h']))
    return inside[0] if inside else None


def _inset(r):
    return min(ITEM_IN, r['w'] / 2, r['h'] / 2)


def fixture_point(r, ring):
    """Where a wet room's fixtures sit: the middle of its wet wall (the room's rear wall, as wet_walls draws it), in a little."""
    m = _inset(r)
    return ensure([r['x'] + r['w'] / 2, r['y'] + m], ring)


def wet_wall(r, floor):
    what = 'Kitchen sink wall' if r['kind'] == 'kitchen' else f"{r['label']} supply and drain wall"
    return {'floor': floor, 'a': [round(r['x'], 1), round(r['y'], 1)], 'b': [round(r['x'] + r['w'], 1), round(r['y'], 1)],
            'rooms': [r['label']], 'what': what, 'basis': 'likely'}


def _corner(r, ring, rear=True, right=True):
    m = _inset(r)
    return ensure([r['x'] + r['w'] - m if right else r['x'] + m, r['y'] + m if rear else r['y'] + r['h'] - m], ring)


def _garage_wall(r, ring):
    """The garage wall the house shares (an inside wall), a little in from it: where a panel or heater hangs in a garage."""
    m = _inset(r)
    cx, cy = r['x'] + r['w'] / 2, r['y'] + r['h'] / 2
    edges = [('rear', [cx, r['y'] - 1.0], [cx, r['y'] + m]), ('left', [r['x'] - 1.0, cy], [r['x'] + m, cy]),
             ('right', [r['x'] + r['w'] + 1.0, cy], [r['x'] + r['w'] - m, cy]), ('front', [cx, r['y'] + r['h'] + 1.0], [cx, r['y'] + r['h'] - m])]
    for _, probe, at in edges:
        if pip(probe, ring):
            return ensure(at, ring)
    return _corner(r, ring)


# ---------------------------------------------------------------- where each spot is, given the rooms

WALL_SPOTS = {'front-wall-left': ('front', 0.15), 'front-wall-center': ('front', 0.5), 'front-wall-right': ('front', 0.85),
              'rear-wall-left': ('rear', 0.15), 'rear-wall-center': ('rear', 0.5), 'rear-wall-right': ('rear', 0.85),
              'side-left': ('left', 0.5), 'side-right': ('right', 0.5), 'entry-left': ('left', 0.3), 'entry-right': ('right', 0.3),
              'kitchen-sink': ('rear', 0.25)}


class Floor:
    """One floor's rooms and the shared outline, with the places the rules name."""

    def __init__(self, fl, ring):
        self.fl, self.ring = fl, ring
        self.rooms = [r for r in fl.get('rooms') or [] if all(isinstance(r.get(k), (int, float)) for k in ('x', 'y', 'w', 'h'))]
        big = max((r for r in self.rooms if r.get('kind') not in ('hall', 'stairs', 'garage')), key=lambda r: r['w'] * r['h'], default=None)
        c = [big['x'] + big['w'] / 2, big['y'] + big['h'] / 2] if big else None
        self.centre = c if c and ok(c, ring, ITEM_IN) else _open_point(ring)

    def first(self, *kinds):
        for k in kinds:
            r = next((r for r in self.rooms if r.get('kind') == k), None)
            if r:
                return r
        return None

    def wet(self):
        if self.fl['id'] == 'basement':
            return [r for r in self.rooms if r.get('kind') in ('kitchen', 'bath', 'laundry')]
        return [r for r in self.rooms if r.get('kind') in WET]

    def spot(self, spot):
        ring = self.ring
        if spot in WALL_SPOTS:
            side, frac = WALL_SPOTS[spot]
            return wall_point(ring, side, frac)
        if spot in ('kitchen', 'bath'):
            r = self.first(spot, 'kitchen', 'bath', 'laundry')
            return fixture_point(r, ring) if r else wall_point(ring, 'rear', 0.25)
        if spot == 'utility-corner':
            r = self.first('utility', 'laundry')
            if r:
                return _corner(r, ring)
            g = self.first('garage')
            return _garage_wall(g, ring) if g else wall_point(ring, 'rear', 0.85)
        if spot == 'garage':
            g = self.first('garage')
            if g:
                return _garage_wall(g, ring)
            r = self.first('utility', 'laundry')
            return _corner(r, ring) if r else wall_point(ring, 'right', 0.75)
        if spot == 'stairs-top':
            r = self.first('stairs')
            return ensure([r['x'] + r['w'] / 2, r['y'] + r['h'] / 2], ring) if r else ensure(self.centre, ring)
        if spot == 'attic':
            r = self.first('hall')
            return ensure([r['x'] + r['w'] / 2, r['y'] + r['h'] / 2], ring) if r else ensure(self.centre, ring)
        return ensure(self.centre, ring)


def _spread(p, taken, ring):
    """Moves a point off another marker at the same spot (a gas shutoff beside the furnace), staying inside."""
    if not any(abs(p[0] - q[0]) < 2.0 and abs(p[1] - q[1]) < 2.0 for q in taken):
        return p
    for k in range(1, 6):
        for dx, dy in ((3, 0), (-3, 0), (0, 3), (0, -3)):
            q = [p[0] + dx * k, p[1] + dy * k]
            if ok(q, ring, ITEM_IN) and not any(abs(q[0] - t[0]) < 2.0 and abs(q[1] - t[1]) < 2.0 for t in taken):
                return q
    return p


# ---------------------------------------------------------------- square routing inside the outline

def _seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def _cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _segs_meet(a, b, c, d):
    d1, d2, d3, d4 = _cross(c, d, a), _cross(c, d, b), _cross(a, b, c), _cross(a, b, d)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))


def seg_clear(a, b, ring, m):
    """True when the segment a-b stays at least m inside the ring along its whole length."""
    if not pip(a, ring):
        return False
    n = len(ring)
    lo_x, hi_x, lo_y, hi_y = min(a[0], b[0]) - m, max(a[0], b[0]) + m, min(a[1], b[1]) - m, max(a[1], b[1]) + m
    for i in range(n):
        c, d = ring[i], ring[(i + 1) % n]
        if max(c[0], d[0]) < lo_x or min(c[0], d[0]) > hi_x or max(c[1], d[1]) < lo_y or min(c[1], d[1]) > hi_y:
            continue
        if _segs_meet(a, b, c, d):
            return False
        if min(_seg_dist(a, c, d), _seg_dist(b, c, d), _seg_dist(c, a, b), _seg_dist(d, a, b)) < m - 1e-6:
            return False
    return True


class Router:
    """Square runs on a grid of lines through every endpoint, every outline corner (offset by the margin) and an even spacing.
    A* over (node, heading) with a cost per turn, so the straight L wins whenever it stays inside, and otherwise the run goes
    round through the rooms or along a wall. Lazy: only the nodes a search reaches are tested."""

    def __init__(self, ring, margin, points):
        self.ring, self.m = ring, margin
        x0, y0, x1, y1 = bounds(ring)
        step = max(2.0, max(x1 - x0, y1 - y0) / 12)

        def lines(lo, hi, vals, fixed):
            raw = [lo + margin + step * k for k in range(int((hi - lo - 2 * margin) / step) + 1)]
            raw += [v + s * margin for v in vals for s in (-1, 1)]
            keep = sorted({round(v, 3) for v in fixed})
            for v in sorted(raw):
                if lo + margin - 1e-6 <= v <= hi - margin + 1e-6 and all(abs(v - k) > 0.2 for k in keep):
                    keep.append(round(v, 3))
                    keep.sort()
            return keep
        self.xs = lines(x0, x1, [p[0] for p in ring], [p[0] for p in points])
        self.ys = lines(y0, y1, [p[1] for p in ring], [p[1] for p in points])
        self.xi = {v: i for i, v in enumerate(self.xs)}
        self.yi = {v: i for i, v in enumerate(self.ys)}
        self._node, self._edge = {}, {}

    def node(self, i, j):
        k = (i, j)
        if k not in self._node:
            self._node[k] = ok((self.xs[i], self.ys[j]), self.ring, self.m)
        return self._node[k]

    def edge(self, i, j, i2, j2):
        k = (min(i, i2), min(j, j2), max(i, i2), max(j, j2))
        if k not in self._edge:
            self._edge[k] = self.node(i, j) and self.node(i2, j2) and seg_clear((self.xs[i], self.ys[j]), (self.xs[i2], self.ys[j2]), self.ring, self.m)
        return self._edge[k]

    def route(self, a, b, avoid=None):
        """Axis-aligned points from a to b (both must be grid points), or None. `avoid`: grid edges that cost SHARE_COST a
        foot more (another line's route). The grid edges of the route found are left in self.last."""
        self.last = set()
        ka, kb = (self.xi.get(round(a[0], 3)), self.yi.get(round(a[1], 3))), (self.xi.get(round(b[0], 3)), self.yi.get(round(b[1], 3)))
        if None in ka or None in kb or not self.node(*ka) or not self.node(*kb):
            return None
        if ka == kb:
            return [[a[0], a[1]], [b[0], b[1]]]
        xs, ys = self.xs, self.ys
        tx, ty = xs[kb[0]], ys[kb[1]]
        h = lambda i, j: abs(xs[i] - tx) + abs(ys[j] - ty)
        dirs = ((1, 0), (-1, 0), (0, 1), (0, -1))
        start = (ka[0], ka[1], -1)
        best = {start: 0.0}
        prev = {}
        heap = [(h(*ka), 0.0, 0, start)]   # ties go to the deeper state
        n = 0
        while heap:
            f, g, _, s = heapq.heappop(heap)
            g = -g
            if g > best.get(s, math.inf) + 1e-9:
                continue
            i, j, d = s
            if (i, j) == kb:
                path = [(i, j)]
                while s in prev:
                    s = prev[s]
                    path.append((s[0], s[1]))
                path.reverse()
                self.last = {(min(p[0], q[0]), min(p[1], q[1]), max(p[0], q[0]), max(p[1], q[1])) for p, q in zip(path, path[1:])}
                return self._points(path, a, b)
            for nd, (di, dj) in enumerate(dirs):
                i2, j2 = i + di, j + dj
                if not (0 <= i2 < len(xs) and 0 <= j2 < len(ys)) or not self.edge(i, j, i2, j2):
                    continue
                L = abs(xs[i2] - xs[i]) + abs(ys[j2] - ys[j])
                g2 = g + L + (TURN_FT if d not in (-1, nd) else 0.0)
                if avoid and (min(i, i2), min(j, j2), max(i, i2), max(j, j2)) in avoid:
                    g2 += SHARE_COST * L
                s2 = (i2, j2, nd)
                if g2 < best.get(s2, math.inf) - 1e-9:
                    best[s2] = g2
                    prev[s2] = s
                    n += 1
                    heapq.heappush(heap, (g2 + h(i2, j2), -g2, n, s2))
        return None

    def _points(self, path, a, b):
        pts = [[self.xs[i], self.ys[j]] for i, j in path]
        out = [pts[0]]
        for k in range(1, len(pts) - 1):
            p, q, r = out[-1], pts[k], pts[k + 1]
            if (abs(p[0] - q[0]) < 1e-9 and abs(q[0] - r[0]) < 1e-9) or (abs(p[1] - q[1]) < 1e-9 and abs(q[1] - r[1]) < 1e-9):
                continue
            out.append(q)
        out.append(pts[-1])
        out[0], out[-1] = [a[0], a[1]], [b[0], b[1]]
        return out


SHORT = {'living room': 'Living', 'family room': 'Family', 'dining room': 'Dining', 'half bath': 'H.bath', 'utility': 'Utility',
         'laundry': 'Laundry', 'laundry and utility': 'Laundry', 'main bedroom': 'Main bd', 'pantry or half bath': 'Pantry',
         'partial basement': 'Bsmt', 'unfinished basement': 'Bsmt', 'basement': 'Bsmt', 'storage': 'Storage', 'mudroom': 'Mudroom'}


def short_name(label):
    """A room name of 7 characters at most, for a room too small for its full name ('Bedroom 2' -> 'Bed 2')."""
    s = str(label or '').strip()
    if len(s) <= 7:
        return s
    low = s.lower()
    if low in SHORT:
        return SHORT[low]
    m = re.match(r'bedroom\s*(\d+)$', low)
    if m:
        return f'Bed {m.group(1)}'
    m = re.match(r'bath\s*(\d+)$', low)
    if m:
        return f'Bath {m.group(1)}'
    return s.split()[0][:7]


def _r(v):
    return round(v + 0.0, 1)


def _rp(p):
    return [_r(p[0]), _r(p[1])]


# ---------------------------------------------------------------- the house plan

def dress_house(floors, ring, locations, outside, scale=(1.0, 1.0)):
    """Places items by room and routes runs square inside `ring` (plan feet) on every floor, in place. `locations` is
    likely_rules.locations for the house's foundation (kind -> {spot, floor, note}); `outside` the card's outside list (to line
    the gas and sewer up with their outside markers); `scale` maps the template's own drawing onto the plan (for a run kind
    the rules do not place). Returns {failed: [run descriptions that could not be routed]}."""
    floors.sort(key=lambda f: ORDER.index(f['id']) if f['id'] in ORDER else 9)
    F = {f['id']: Floor(f, ring) for f in floors}
    ids = [f['id'] for f in floors]
    out_by = {o.get('kind'): o for o in outside or []}

    # 1. items by room
    for f in floors:
        fl = F[f['id']]
        taken = []
        placed = []
        for it in f.get('items') or []:
            spot = ((locations or {}).get(it.get('kind')) or {}).get('spot') or 'center'
            if it.get('kind') == 'fixture_shutoffs':
                spot = 'kitchen'
            p = _spread(fl.spot(spot), taken, ring)
            taken.append(p)
            it.pop('snapped', None)
            it['x'], it['y'] = _rp(p)
            placed.append(it)
        f['items'] = placed

    # 2. fixture shutoffs at every wet room on the floors people live on
    fx = next((it for f in floors for it in f['items'] if it.get('kind') == 'fixture_shutoffs'), None)
    living = [i for i in ids if i != 'basement']
    wets = {i: [(r, fixture_point(r, ring)) for r in F[i].wet()] for i in ids}
    if fx:
        for f in floors:
            f['items'] = [it for it in f['items'] if it.get('kind') != 'fixture_shutoffs']
        put = 0
        for i in ids:
            for r, p in wets[i]:
                if i not in living and r.get('kind') != 'laundry':
                    continue
                it = dict(fx, x=_r(p[0]), y=_r(p[1]), room=r['label'], note=FIX_NOTE.get(r.get('kind'), fx.get('note')))
                F[i].fl['items'].append(it)
                put += 1
        if not put:                                              # no wet room on the plan: the nearest sensible wall
            at = living[0] if living else ids[0]
            p = wall_point(ring, 'rear', 0.25)
            F[at].fl['items'].append(dict(fx, x=_r(p[0]), y=_r(p[1])))
        for f in floors:                                         # the fixture marker first, as the answer reads it
            f['items'].sort(key=lambda it: 0 if it.get('kind') == 'fixture_shutoffs' else 1)

    # 3. runs: what each line joins, then one router for the card
    def item(fid, *kinds):
        for k in kinds:
            it = next((x for x in F[fid].fl['items'] if x.get('kind') == k), None)
            if it:
                return [it['x'], it['y']]
        return None

    tmpl = {i: list(F[i].fl.get('runs') or []) for i in ids}
    kinds_brought = {r.get('kind') for i in ids for r in tmpl[i]}
    plans = {i: [] for i in ids}           # floor -> [(run base, a, b, risers)]

    def side_point(o, default_side, default_at):
        side, at = (o or {}).get('side') or default_side, (o or {}).get('at')
        at = default_at if not isinstance(at, (int, float)) else at
        return wall_point(ring, {'front': 'front', 'rear': 'rear', 'left': 'left', 'right': 'right'}.get(side, default_side), at)

    # the stack: where lines go between floors, inside a wet room on every floor it serves (a wet wall, never a hall)
    wet_floors = [i for i in living if wets[i]]
    S = None

    def wet_here(i, c):
        return any(_in_room(r, c, -0.3) and r.get('kind') in WET + ('utility',) for r in F[i].rooms)

    def drop_spot(rooms_pts, floors_served, near_pts, aim):
        """The best riser point: in a wet room on each floor it serves, clear of the fixture markers, near `aim`."""
        best = None
        for r, _ in rooms_pts:
            m = min(1.0, r['w'] / 2, r['h'] / 2)
            nx, ny = max(1, int(r['w'] - 2 * m) + 1), max(1, int(r['h'] - 2 * m) + 1)
            for gx in range(nx + 1):
                for gy in range(ny + 1):
                    c = [r['x'] + m + (r['w'] - 2 * m) * gx / nx, r['y'] + m + (r['h'] - 2 * m) * gy / ny]
                    if not ok(c, ring, ROUTE_IN):
                        continue
                    dry = sum(1 for i in floors_served if not wet_here(i, c))
                    near = min([math.hypot(c[0] - q[0], c[1] - q[1]) for q in near_pts] + [99.0])
                    cost = sum(math.hypot(c[0] - q[0], c[1] - q[1]) for q in aim)
                    key = (dry, near < 3.0, round(cost, 3), round(c[0], 3), round(c[1], 3))
                    if best is None or key < best[0]:
                        best = (key, c)
        return _rp(best[1]) if best else None

    if wet_floors and (('water' in kinds_brought) or ('drain' in kinds_brought)):
        low = wet_floors[0]
        above = [i for i in wet_floors if ORDER.index(i) > ORDER.index(low)] if low in ORDER else []
        cands = sorted(wets[low], key=lambda rp: (0 if rp[0].get('kind') == 'bath' else 1))
        if above:
            pairs = [(math.hypot(p[0] - q[0], p[1] - q[1]), k, rp, q) for k, rp in enumerate(cands) for _, q in wets[above[0]]]
            _, _, best, target = min(pairs, key=lambda t: (round(t[0], 3), t[1]))
            pool = [best] + [rq for rq in wets[above[0]] if rq[1] == target]
            aim = [best[1], target]
        else:
            best = cands[0]
            pool, aim = [best], [best[1]]
        fixtures = [q for i in ids for _, q in wets[i]]
        S = drop_spot(pool, [low] + above[:1], fixtures, aim) or _rp(ensure(best[1], ring))
    bottom = ids[0]
    src_floor = next((i for i in ids if item(i, 'water_heater')), None) or next((i for i in ids if item(i, 'main_water')), None)
    src = item(src_floor, 'water_heater', 'main_water') if src_floor else None
    exit_pt = item(bottom, 'sewer_cleanout')
    if exit_pt is None:
        o = out_by.get('sewer_cleanout')
        exit_pt = side_point(o, 'front', 0.5) if not o or o.get('side') == 'front' else wall_point(ring, 'front', 0.5)
        exit_pt = _rp(exit_pt)

    def base(r, kind=None, label=None):
        b = {k: v for k, v in r.items() if k not in ('points', 'risers')} if r else {}
        if kind:
            b['kind'] = kind
            b.setdefault('label', label or kind.capitalize())
        b['basis'] = 'likely' if (b.get('basis') or 'likely') != 'record' else 'record'
        return b

    sx_, sy_ = scale
    for i in ids:
        for r in tmpl[i]:
            k = r.get('kind')
            if k == 'water':
                a, b = item(i, 'main_water'), item(i, 'water_heater')
                if a and b and a != b:
                    plans[i].append((base(r), a, b, []))
            elif k == 'gas':
                a = _rp(side_point(out_by.get('gas_meter'), 'right', 0.35))
                b = item(i, 'gas_shutoff', 'furnace', 'boiler', 'water_heater') or _rp(F[i].centre)
                plans[i].append((base(r), a, b, []))
            elif k == 'drain':
                if S is not None:
                    continue                                     # drawn below, from the wet rooms down to the street
                a = item(i, 'sewer_cleanout') or exit_pt
                st = wall_point(ring, 'rear', 0.5)
                wr = wets.get(i) or []
                if wr:
                    st = wr[0][1]
                plans[i].append((base(r), _rp(st), a, []))
            elif k == 'power':
                # the service line comes in through the wall nearest the panel, from the meter outside on that wall (R5)
                b = item(i, 'panel')
                if not b:
                    continue
                x0, y0, x1, y1 = bounds(ring)
                best = None
                for side in ('left', 'right', 'front', 'rear'):
                    frac = (b[1] - y0) / max(1e-6, y1 - y0) if side in ('left', 'right') else (b[0] - x0) / max(1e-6, x1 - x0)
                    q = wall_point(ring, side, frac, ROUTE_IN + 0.05)
                    d = abs(q[0] - b[0]) + abs(q[1] - b[1])
                    if best is None or d < best[0] - 1e-9:
                        best = (d, side, frac, q)
                _, side, frac, q = best
                a = _rp(q)
                if abs(a[0] - b[0]) < 0.05 and abs(a[1] - b[1]) < 0.05:
                    continue
                plans[i].append((base(r), a, b, []))
                if outside is not None and not any(o.get('kind') == METER['kind'] for o in outside):
                    outside.append(dict(METER, side=side, at=round(min(1.0, max(0.0, frac)), 3), floor=i))
            else:                                                # a kind the rules do not place: its own ends, inside
                pts = r.get('points') or []
                if len(pts) >= 2:
                    a = _rp(ensure([pts[0][0] * sx_, pts[0][1] * sy_], ring))
                    b = _rp(ensure([pts[-1][0] * sx_, pts[-1][1] * sy_], ring))
                    plans[i].append((base(r), a, b, []))

    # wet rooms: supply up from the heater, drain down to where it leaves (R5), with risers at the stack. A fixture more than
    # STACK_REACH from the main stack gets its own drop beside it (a second stack), so no line crosses half the house.
    water_t = next((r for i in ids for r in tmpl[i] if r.get('kind') == 'water'), None)
    drain_t = next((r for i in ids for r in tmpl[i] if r.get('kind') == 'drain'), None)
    pos = {i: k for k, i in enumerate(ids)}
    if S is not None:
        fixtures = [q for i in ids for _, q in wets[i]]
        stacks = [{'pt': S, 'use': {}}]                        # use: floor -> [fixture points]
        man = lambda p, q: abs(p[0] - q[0]) + abs(p[1] - q[1])
        for i in ids:
            if pos[i] == 0:
                continue
            for r, p in wets[i]:
                p = _rp(p)
                if man(p, S) <= STACK_REACH:
                    stacks[0]['use'].setdefault(i, []).append(p)
                    continue
                st = next((t for t in stacks[1:] if man(p, t['pt']) <= STACK_REACH and wet_here(i, t['pt'])), None)
                if st is None:
                    pt = drop_spot([(r, p)], [i], fixtures, [p]) or _rp(ensure(p, ring))
                    st = {'pt': pt, 'use': {}}
                    stacks.append(st)
                st['use'].setdefault(i, []).append(p)
        for st in stacks:
            top = max([pos[i] for i in st['use']] + [0])
            if top == 0:
                continue
            P_ = st['pt']
            if water_t is not None and src is not None:
                sf = pos[src_floor]
                for i in ids:
                    if pos[i] < sf or pos[i] > top:
                        continue
                    up = pos[i] < top
                    ends = st['use'].get(i, [])
                    if pos[i] == sf:
                        if up:
                            plans[i].append((base(water_t), src, P_, [[P_[0], P_[1], 'up']]))
                        continue
                    ris = [[P_[0], P_[1], 'down']] + ([[P_[0], P_[1], 'up']] if up else [])
                    if not ends:
                        plans[i].append((base(water_t), P_, P_, ris))
                    for k, p in enumerate(ends):
                        plans[i].append((base(water_t), P_, p, ris if k == 0 else []))
            if drain_t is not None:
                for i in ids:
                    if pos[i] > top:
                        continue
                    up = pos[i] < top
                    ends = st['use'].get(i, [])
                    if pos[i] == 0:
                        plans[i].append((base(drain_t), P_, exit_pt, [[P_[0], P_[1], 'up']]))
                        continue
                    ris = [[P_[0], P_[1], 'down']] + ([[P_[0], P_[1], 'up']] if up else [])
                    if not ends:
                        plans[i].append((base(drain_t), P_, P_, ris))
                    for k, p in enumerate(ends):
                        plans[i].append((base(drain_t), p, P_, ris if k == 0 else []))
        # the bottom floor's own fixtures: straight from the supply, straight to where the drain leaves
        b0 = ids[0]
        for r, p in wets[b0]:
            p = _rp(p)
            if water_t is not None and src is not None and pos[src_floor] == 0:
                plans[b0].append((base(water_t), src, p, []))
            if drain_t is not None:
                plans[b0].append((base(drain_t), p, exit_pt, []))

    ends = [p for i in ids for _, a, b, _ in plans[i] for p in (a, b)]
    routers = [Router(ring, ROUTE_IN, ends)]
    failed = []
    for i in ids:
        runs = []
        wet_edges = set()
        order = sorted(range(len(plans[i])), key=lambda k: (plans[i][k][0].get('kind') == 'drain', k))
        for b, a, z, ris in (plans[i][k] for k in order):
            avoid = wet_edges if b.get('kind') == 'drain' else None
            if a == z:
                pts = [list(a), list(z)]
            else:
                pts = routers[0].route(a, z, avoid)
                if pts is not None and b.get('kind') == 'water':
                    wet_edges |= routers[0].last
                if pts is None:
                    if len(routers) == 1:
                        routers.append(Router(ring, ROUTE_IN / 2, ends))
                    pts = routers[1].route(a, z, None)
            if pts is None:
                failed.append(f"{i} {b.get('kind')} {a}->{z}")
                continue
            run = dict(b, points=[_rp(p) for p in pts])
            if ris:
                run['risers'] = [[_r(x), _r(y), d] for x, y, d in ris]
            runs.append(run)
        F[i].fl['runs'] = runs

    # 4. wet walls and the room each item is in
    for f in floors:
        fl = F[f['id']]
        f['wet_walls'] = [wet_wall(r, f['id']) for r in fl.wet()]
        for it in f['items']:
            r = room_of(fl.rooms, (it['x'], it['y']))
            if r and r.get('kind') not in ('hall',):
                it['room'] = r['label']
            else:
                it.pop('room', None)
    return {'failed': failed}


# ---------------------------------------------------------------- the large building (R6)

def large_outside():
    """The water service and the sewer, outside on the street side: the two things that hold for any building."""
    return [{'kind': 'main_water', 'label': 'Water service', 'short': 'W', 'floor': 'first', 'side': 'front', 'at': 0.3,
             'basis': 'likely', 'focus': True, 'note': 'Comes in on the street side'},
            {'kind': 'sewer_cleanout', 'label': 'Sewer', 'short': 'C', 'floor': 'first', 'side': 'front', 'at': 0.7,
             'basis': 'likely', 'focus': True, 'note': 'Leaves on the street side; a cleanout is often near the front wall'}]


def large_unplaced():
    """Likely for any building, with no place on the plan: fixture shutoffs at each fixture and the building shutoff."""
    return [{'kind': 'fixture_shutoffs', 'label': 'Fixture shutoffs', 'short': 'FX', 'basis': 'likely', 'focus': True,
             'note': 'At each fixture: under each sink and behind each toilet'},
            {'kind': 'main_water', 'label': 'Building shutoff', 'short': 'MS', 'basis': 'likely', 'focus': True, 'note': LARGE_SHUTOFF}]


def _storeys_words(n):
    return {1: 'one storey', 2: 'two storeys', 3: 'three storeys'}.get(n, f'{n:g} storeys')


def large_card(card, w, h, live, kind):
    """Turns the card into the R6 card for a large or non-residential building, in place."""
    facts = [f for f in card.get('facts') or [] if f.get('k') not in HOUSE_FACTS
             and not BANNED_LARGE.search(str(f.get('label') or '')) and not BANNED_LARGE.search(str(f.get('v') or ''))]
    for f in facts:                                             # a recorded area is the building's floor area here
        if f.get('k') == 'living_area_sqft':
            f['label'] = 'Floor area'
    card['facts'] = facts
    b = card.setdefault('building', {})
    b['kind'], b['kind_from'] = 'large', kind['from']
    card['floors'] = [{'id': 'first', 'name': 'Ground floor', 'w': w, 'h': h, 'rooms': [], 'items': [], 'runs': [], 'wet_walls': []}]
    card['outside'] = large_outside()
    card['unplaced'] = large_unplaced()
    card['focus'] = ['fixture_shutoffs', 'main_water', 'sewer_cleanout']
    card['layout'] = {'from': 'none', 'basis': 'likely', 'note': LARGE_NOTE}
    card['source_line'] = LARGE_SOURCE_LINE
    hs = card.get('house') or {}
    st = (b.get('storeys') or {})
    bits = []
    if st.get('basis') == 'public' and isinstance(st.get('n'), (int, float)):
        bits.append(_storeys_words(st['n'])[:1].upper() + _storeys_words(st['n'])[1:] + ' (public record).')
    if hs.get('year') and hs.get('year_basis') == 'public':
        bits.append(f"Built {hs['year']}.")
    hs['text'] = ' '.join(bits)                                  # the note says it once, on the plan
    card['house'] = hs
    card['basis'] = 'likely'
    return card


def facility_name(card):
    """The recorded facility name, in plain case ('TOWN HALL' -> 'Town hall'), when it says nothing about a house."""
    f = next((f for f in card.get('facts') or [] if f.get('k') == 'facility' and f.get('v')), None)
    if not f:
        return None
    v = re.sub(r'\s+', ' ', str(f['v'])).strip()
    if not v or BANNED_LARGE.search(v) or len(v) > 40:
        return None
    return v[:1].upper() + v[1:].lower()
