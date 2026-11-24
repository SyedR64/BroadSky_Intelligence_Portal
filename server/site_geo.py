"""Geometry for the live site brief: pure functions, no network, no I/O.

Everything here works on rings (lists of [x, y] or [lon, lat] pairs). Local
coordinates are metres, x east and y north, measured from an origin that is
carried with the result, so a ring can always be put back on the map.

Contract summary (see the docstrings for shapes):

    ll_to_m(ring_ll, origin=None)        -> (ring_m, origin)
    m_to_ll(ring_m, origin)              -> ring_ll
    ring_area_m2(ring_m)                 -> float
    simplify_ring(ring_m, ...)           -> ring_m with at most 48 points
    oriented_rect(ring_m)                -> minimum-area rectangle
    front_side(ring_m, street_pt)        -> street-facing side and bearing
    plan_frame(ring_m, street_pt)        -> frame with the front at the bottom
    snap_inside(pt, ring_m, margin)      -> a point inside the ring
    height_rule(recorded_m, storeys, ...)-> eave, ridge, basis
    check_storeys(footprint_m2, sqft, n) -> storeys cross-check
    fit_layout(ring_m, ...)              -> inferred rooms inside the ring
    footprint_block(ring_ll, ...)        -> the card's `building` block

Nothing here states a fact about a house: every inferred value carries
basis "likely", and a value read from a record keeps basis "public".
"""
from __future__ import annotations

import math

FT = 0.3048
M2_PER_SQFT = 0.09290304
MAX_RING_POINTS = 48
MAX_PARCEL_POINTS = 40
SIMPLIFY_M = 0.15
STOREY_M = 2.7          # floor to floor, used for every inference
MAX_HEIGHT_M = 12.0     # a recorded height above this is not believed

_A = 6378137.0
_E2 = 0.00669437999014


# --------------------------------------------------------------------------
# small vector helpers
# --------------------------------------------------------------------------

def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def _cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def _norm(a):
    return math.hypot(a[0], a[1])


def _unit(a):
    n = _norm(a)
    if n == 0:
        raise ValueError('zero-length vector')
    return (a[0] / n, a[1] / n)


def _clean(ring, ndigits=None):
    """Open ring of (x, y) float tuples: no closing repeat, no consecutive duplicates."""
    pts = []
    for p in ring or []:
        try:
            x, y = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError):
            raise ValueError('ring points must be [x, y] numbers')
        if not (math.isfinite(x) and math.isfinite(y)):
            raise ValueError('ring points must be finite')
        if pts and pts[-1] == (x, y):
            continue
        pts.append((x, y))
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    if len(pts) < 3:
        raise ValueError('a ring needs at least 3 distinct points')
    return pts


def _out(pts, nd=2):
    return [[round(x, nd), round(y, nd)] for x, y in pts]


# --------------------------------------------------------------------------
# longitude / latitude <-> local metres
# --------------------------------------------------------------------------

def _scales(lat0):
    """Metres per degree of longitude and of latitude at lat0 (WGS84)."""
    s = math.sin(math.radians(lat0))
    w = math.sqrt(1.0 - _E2 * s * s)
    n = _A / w                               # prime vertical radius
    m = _A * (1.0 - _E2) / (w ** 3)          # meridian radius
    return math.radians(1.0) * n * math.cos(math.radians(lat0)), math.radians(1.0) * m


def _origin(o):
    if isinstance(o, dict):
        return float(o['lon']), float(o['lat'])
    return float(o[0]), float(o[1])


def ll_to_m(ring_ll, origin=None):
    """[[lon, lat], ...] -> (ring_m, origin). Origin defaults to the bounding-box centre.

    Equirectangular about the origin using the local WGS84 radii: well inside
    a centimetre over one lot, and exactly reversible by `m_to_ll`.
    The ring comes back open (no repeated closing point), unrounded.
    """
    pts = _clean(ring_ll)
    if origin is None:
        lons = [p[0] for p in pts]
        lats = [p[1] for p in pts]
        lon0, lat0 = (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2
    else:
        lon0, lat0 = _origin(origin)
    kx, ky = _scales(lat0)
    ring_m = [[(lon - lon0) * kx, (lat - lat0) * ky] for lon, lat in pts]
    return ring_m, {'lon': lon0, 'lat': lat0}


def m_to_ll(ring_m, origin):
    """Inverse of `ll_to_m`: local metres back to [[lon, lat], ...]."""
    lon0, lat0 = _origin(origin)
    kx, ky = _scales(lat0)
    return [[lon0 + float(p[0]) / kx, lat0 + float(p[1]) / ky] for p in ring_m]


def point_ll_to_m(pt_ll, origin):
    lon0, lat0 = _origin(origin)
    kx, ky = _scales(lat0)
    return [(float(pt_ll[0]) - lon0) * kx, (float(pt_ll[1]) - lat0) * ky]


def point_m_to_ll(pt_m, origin):
    return m_to_ll([pt_m], origin)[0]


# --------------------------------------------------------------------------
# area, centroid, containment
# --------------------------------------------------------------------------

def ring_signed_area(ring_m):
    pts = _clean(ring_m)
    s = 0.0
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        s += p[0] * q[1] - q[0] * p[1]
    return s / 2.0


def ring_area_m2(ring_m):
    """Shoelace area in square metres (always positive)."""
    return abs(ring_signed_area(ring_m))


def ring_centroid(ring_m):
    pts = _clean(ring_m)
    a = ring_signed_area(pts)
    if abs(a) < 1e-12:
        return [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]
    cx = cy = 0.0
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        f = p[0] * q[1] - q[0] * p[1]
        cx += (p[0] + q[0]) * f
        cy += (p[1] + q[1]) * f
    return [cx / (6 * a), cy / (6 * a)]


def _seg_closest(p, a, b):
    ab = _sub(b, a)
    L2 = _dot(ab, ab)
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, _dot(_sub(p, a), ab) / L2))
    return (a[0] + ab[0] * t, a[1] + ab[1] * t)


def dist_to_boundary(pt, ring_m):
    pts = _clean(ring_m)
    best = float('inf')
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        q = _seg_closest(pt, a, b)
        best = min(best, math.hypot(pt[0] - q[0], pt[1] - q[1]))
    return best


def point_in_ring(pt, ring_m, eps=1e-9):
    """True when pt is inside the ring or on its boundary."""
    pts = _clean(ring_m)
    x, y = float(pt[0]), float(pt[1])
    if dist_to_boundary((x, y), pts) <= eps:
        return True
    inside = False
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        if (a[1] > y) != (b[1] > y):
            xi = a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if xi > x:
                inside = not inside
    return inside


# --------------------------------------------------------------------------
# simplification
# --------------------------------------------------------------------------

def _seg_dist(p, a, b):
    q = _seg_closest(p, a, b)
    return math.hypot(p[0] - q[0], p[1] - q[1])


def _dp(chain, tol):
    """Douglas-Peucker on an open chain; endpoints are kept."""
    keep = {0, len(chain) - 1}
    stack = [(0, len(chain) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = chain[i], chain[j]
        dmax, k = -1.0, -1
        for m in range(i + 1, j):
            d = _seg_dist(chain[m], a, b)
            if d > dmax:
                dmax, k = d, m
        if dmax > tol:
            keep.add(k)
            stack.append((i, k))
            stack.append((k, j))
    return [chain[i] for i in sorted(keep)]


def simplify_ring(ring_m, tol=SIMPLIFY_M, max_points=MAX_RING_POINTS, ndigits=2):
    """Douglas-Peucker on a closed ring, at most `max_points`, open ring out.

    Starts at `tol` metres and widens the tolerance by a quarter at a time
    until the ring fits, so the shape degrades as little as the cap allows.
    Coordinates are rounded to `ndigits` decimals (1 cm by default).
    """
    pts = _clean(ring_m)
    if len(pts) > 3:
        # split the ring at its two mutually farthest-ish anchors (point 0 and the one far from it)
        far = max(range(len(pts)), key=lambda i: _norm(_sub(pts[i], pts[0])))
        a = pts[0:far + 1]
        b = pts[far:] + [pts[0]]
        t = max(tol, 0.0)
        while True:
            ra, rb = _dp(a, t), _dp(b, t)
            res = ra[:-1] + rb[:-1]
            if len(res) <= max_points and len(res) >= 3:
                break
            if len(res) < 3:      # cannot happen unless tol is huge; fall back to the corners
                res = [pts[0], pts[far], pts[len(pts) // 2]]
                break
            t = t * 1.25 + 0.01
        pts = res
    return _out(pts, ndigits)


# --------------------------------------------------------------------------
# oriented rectangle
# --------------------------------------------------------------------------

def _hull(points):
    pts = sorted(set((round(x, 9), round(y, 9)) for x, y in points))
    if len(pts) <= 2:
        return pts

    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and _cross(_sub(h[-1], h[-2]), _sub(p, h[-2])) <= 0:
                h.pop()
            h.append(p)
        return h
    lo, up = half(pts), half(reversed(pts))
    return lo[:-1] + up[:-1]


def _bearing(vec):
    """Compass bearing, degrees clockwise from north, of an (east, north) vector."""
    return math.degrees(math.atan2(vec[0], vec[1])) % 360.0


def _wall_direction(pts):
    """The direction most wall length runs along (modulo 90 degrees), or None when no direction holds half of it."""
    segs = []
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        L = _norm(_sub(b, a))
        if L > 0:
            segs.append((math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 90.0, L))
    total = sum(L for _, L in segs)
    if not segs or total <= 0:
        return None

    def near(x, c):
        d = abs(x - c) % 90.0
        return min(d, 90.0 - d) <= 2.0
    best = max(segs, key=lambda s: (sum(L for x, L in segs if near(x, s[0])), -s[0]))
    share = [(x, L) for x, L in segs if near(x, best[0])]
    if sum(L for _, L in share) < 0.5 * total:
        return None
    # length-weighted mean angle around the winner, unwrapped near it
    ref = best[0]
    mean = ref + sum(((x - ref + 45.0) % 90.0 - 45.0) * L for x, L in share) / sum(L for _, L in share)
    t = math.radians(mean)
    return (math.cos(t), math.sin(t))


def oriented_rect(ring_m):
    """Minimum-area bounding rectangle.

    Returns {c, u, v, w_m, d_m, rot_deg, corners, w_ft, d_ft} where
      u  unit vector of the LONG axis (east, north), v = u turned 90 degrees left,
      w_m >= d_m the long and short sides,
      rot_deg  compass bearing of the long axis, 0 <= rot_deg < 180
               (0 means the long side runs north-south; 90 means east-west).
    """
    pts = _clean(ring_m)
    hull = _hull(pts)
    if len(hull) < 3:
        raise ValueError('ring is degenerate (all points on a line)')
    best = None

    def box(e):
        n = (-e[1], e[0])
        us = [_dot(p, e) for p in hull]
        vs = [_dot(p, n) for p in hull]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        return (round((u1 - u0) * (v1 - v0), 9), (u1 - u0) + (v1 - v0)), e, n, u0, u1, v0, v1
    for i, a in enumerate(hull):
        b = hull[(i + 1) % len(hull)]
        cand = box(_unit(_sub(b, a)))
        if best is None or cand[0] < best[0]:
            best = cand
    # walls first: when the outline's own walls run one way and the rectangle along them is nearly as
    # small, the plan is drawn square to the walls (an L or a U can otherwise come out tilted)
    wall = _wall_direction(pts)
    if wall is not None:
        cand = box(wall)
        if cand[0][0] <= best[0][0] * 1.2 + 1e-9:
            best = cand
    _, e, n, u0, u1, v0, v1 = best
    lu, lv = u1 - u0, v1 - v0
    if lu >= lv:
        axis, perp, wl, wd, a0, a1, b0, b1 = e, n, lu, lv, u0, u1, v0, v1
    else:
        axis, perp, wl, wd, a0, a1, b0, b1 = n, (-e[0], -e[1]), lv, lu, v0, v1, -v1, -v0
    # perp is axis turned left; recompute so the (axis, perp) pair is right-handed
    perp = (-axis[1], axis[0])
    # centre in the world frame
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    c = (e[0] * cu + n[0] * cv, e[1] * cu + n[1] * cv)
    hw, hd = wl / 2, wd / 2
    corners = [[c[0] + axis[0] * sx * hw + perp[0] * sy * hd, c[1] + axis[1] * sx * hw + perp[1] * sy * hd]
               for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    rot = _bearing(axis) % 180.0
    return {'c': [c[0], c[1]], 'u': [axis[0], axis[1]], 'v': [perp[0], perp[1]],
            'w_m': wl, 'd_m': wd, 'rot_deg': rot, 'corners': corners,
            'w_ft': wl / FT, 'd_ft': wd / FT}


# --------------------------------------------------------------------------
# front side and plan frame
# --------------------------------------------------------------------------

def front_side(ring_m, street_pt=None, rect=None):
    """Which side of the oriented rectangle faces the street.

    `street_pt` is a point on the street in the ring's local metres.
    Returns {normal, bearing_deg, normal_axis, side, side_index, distance_m, street_bearing_deg, basis, plan_side}:
      normal / bearing_deg  outward normal of the front side, bearing from
                            the building toward the street (compass degrees),
      normal_axis           "long" or "short": which rectangle axis the normal follows,
      side                  "long" or "short": the length of the side that faces the street,
      street_bearing_deg    bearing from the building centre to the street point,
      basis                 "public" with a street point, "assumed" without one
                            (then the side facing south is used).
    """
    rect = rect or oriented_rect(ring_m)
    c = rect['c']
    u, v = rect['u'], rect['v']
    hw, hd = rect['w_m'] / 2, rect['d_m'] / 2
    sides = [(u, hw, v, hd, 'long'), ((-u[0], -u[1]), hw, v, hd, 'long'),
             (v, hd, u, hw, 'short'), ((-v[0], -v[1]), hd, u, hw, 'short')]
    if street_pt is None:
        idx = max(range(4), key=lambda i: _dot(sides[i][0], (0.0, -1.0)) + (1e-6 if sides[i][4] == 'long' else 0))
        n, half, along, hl, axis = sides[idx]
        return {'normal': [n[0], n[1]], 'bearing_deg': _bearing(n), 'normal_axis': axis, 'side': 'short' if axis == 'long' else 'long', 'side_index': idx,
                'distance_m': None, 'street_bearing_deg': None, 'basis': 'assumed', 'plan_side': 'bottom'}
    sp = (float(street_pt[0]), float(street_pt[1]))
    best = None
    for i, (n, half, along, hl, axis) in enumerate(sides):
        m = (c[0] + n[0] * half, c[1] + n[1] * half)
        a = (m[0] - along[0] * hl, m[1] - along[1] * hl)
        b = (m[0] + along[0] * hl, m[1] + along[1] * hl)
        d = _seg_dist(sp, a, b)
        proj = _dot(_sub(sp, c), n)
        key = (round(d, 6), -proj)
        if best is None or key < best[0]:
            best = (key, i, n, axis, d)
    _, idx, n, axis, d = best
    to = _sub(sp, c)
    return {'normal': [n[0], n[1]], 'bearing_deg': _bearing(n), 'normal_axis': axis, 'side': 'short' if axis == 'long' else 'long', 'side_index': idx,
            'distance_m': d, 'street_bearing_deg': _bearing(to) if _norm(to) > 0 else None,
            'basis': 'public', 'plan_side': 'bottom'}


def plan_frame(ring_m, street_pt=None):
    """A drawing frame with the front of the building at the bottom.

    {c, e1, e2, w_m, d_m, w_ft, d_ft, front}: e1 is plan-right, e2 is plan-up
    (away from the street); both are unit vectors in the local frame and the
    pair is a pure rotation (nothing is mirrored). A plan point (x, y) has x
    from the left edge and y from the front edge, both in metres.
    """
    rect = oriented_rect(ring_m)
    fr = front_side(ring_m, street_pt, rect)
    n = fr['normal']
    e2 = (-n[0], -n[1])
    e1 = (e2[1], -e2[0])
    if fr['normal_axis'] == 'long':
        w, d = rect['d_m'], rect['w_m']
    else:
        w, d = rect['w_m'], rect['d_m']
    return {'c': rect['c'], 'e1': [e1[0], e1[1]], 'e2': [e2[0], e2[1]], 'w_m': w, 'd_m': d,
            'w_ft': w / FT, 'd_ft': d / FT, 'rot_deg': rect['rot_deg'], 'front': fr}


def to_plan(frame, pt):
    r = _sub(pt, frame['c'])
    return [_dot(r, frame['e1']) + frame['w_m'] / 2, _dot(r, frame['e2']) + frame['d_m'] / 2]


def from_plan(frame, pt):
    x, y = pt[0] - frame['w_m'] / 2, pt[1] - frame['d_m'] / 2
    e1, e2, c = frame['e1'], frame['e2'], frame['c']
    return [c[0] + e1[0] * x + e2[0] * y, c[1] + e1[1] * x + e2[1] * y]


# --------------------------------------------------------------------------
# snapping a point inside a ring
# --------------------------------------------------------------------------

def representative_point(ring_m):
    """A point well inside the ring (the centroid if inside, else the roomiest grid point)."""
    pts = _clean(ring_m)
    c = ring_centroid(pts)
    if point_in_ring(c, pts) and dist_to_boundary(c, pts) > 0:
        # still look for a roomier point when the centroid hugs a wall
        best, bd = c, dist_to_boundary(c, pts)
    else:
        best, bd = None, -1.0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    step = max(x1 - x0, y1 - y0) / 24 or 1.0
    for _ in range(3):
        cx0, cx1, cy0, cy1 = (x0, x1, y0, y1) if best is None or _ == 0 else (best[0] - step * 2, best[0] + step * 2, best[1] - step * 2, best[1] + step * 2)
        nx = max(1, int((cx1 - cx0) / step))
        ny = max(1, int((cy1 - cy0) / step))
        for i in range(nx + 1):
            for j in range(ny + 1):
                p = (cx0 + i * step, cy0 + j * step)
                if point_in_ring(p, pts):
                    d = dist_to_boundary(p, pts)
                    if d > bd:
                        best, bd = p, d
        step /= 4
    if best is None:
        best = tuple(pts[0])
    return [best[0], best[1]]


def snap_inside(pt, ring_m, margin=0.3):
    """The point itself if it is inside by at least `margin`, else the nearest such point.

    Moves a point that is outside (or hugging a wall) to the closest boundary
    point and then in along the wall's inward normal. If the ring is too
    narrow for the margin the margin is halved; as a last resort the ring's
    most open interior point is returned.
    """
    ring = _clean(ring_m)
    p = (float(pt[0]), float(pt[1]))
    m = float(margin)
    for _ in range(6):
        if point_in_ring(p, ring) and dist_to_boundary(p, ring) >= m - 1e-9:
            return [p[0], p[1]]
        # nearest boundary point and its edge
        best = None
        for i, a in enumerate(ring):
            b = ring[(i + 1) % len(ring)]
            q = _seg_closest(p, a, b)
            d = math.hypot(p[0] - q[0], p[1] - q[1])
            if best is None or d < best[0]:
                best = (d, q, a, b)
        _, q, a, b = best
        e = _unit(_sub(b, a))
        nrm = (-e[1], e[0])
        probe = (q[0] + nrm[0] * 1e-4, q[1] + nrm[1] * 1e-4)
        if not point_in_ring(probe, ring):
            nrm = (-nrm[0], -nrm[1])
        cand = (q[0] + nrm[0] * m, q[1] + nrm[1] * m)
        if point_in_ring(cand, ring) and dist_to_boundary(cand, ring) >= m * 0.98:
            return [cand[0], cand[1]]
        m /= 2
    return representative_point(ring)


def snap_points(points, ring_m, margin=0.3):
    return [snap_inside(p, ring_m, margin) for p in points]


# --------------------------------------------------------------------------
# height rule and storeys cross-check
# --------------------------------------------------------------------------

def _roof_allowance(year):
    """Eave to ridge, metres, by era: older roofs are steeper."""
    try:
        y = int(year)
    except (TypeError, ValueError):
        return 2.6
    if y < 1940:
        return 3.2
    if y < 1980:
        return 2.6
    return 2.8


def height_rule(recorded_m, storeys, year=None):
    """Keep a recorded height only when it is plausible for the storeys.

    Plausible means at least 2.7 m per storey and at most 12 m. Otherwise
    the height is inferred: eave = storeys x 2.7 m, ridge = eave plus a roof
    allowance by era, and it is marked likely.

    Returns {eave_m, ridge_m, from, basis, recorded_m, rejected, reason, storeys_assumed}:
      from  "source" (recorded height kept; ridge_m is the recorded value and
            eave_m is the storeys' own height, since the source does not say
            which one it measured) or "storeys",
      basis "public" when the recorded height is kept, else "likely".
    """
    try:
        n = float(storeys) if storeys not in (None, '') else None
    except (TypeError, ValueError):
        n = None
    assumed = n is None or n <= 0
    if assumed:
        n = 1.0
    try:
        h = float(recorded_m) if recorded_m not in (None, '') else None
    except (TypeError, ValueError):
        h = None
    if h is not None and not math.isfinite(h):
        h = None
    reason = None
    if h is None:
        reason = 'none recorded'
    elif h < STOREY_M * n:
        reason = 'below 2.7 m per storey'
    elif h > MAX_HEIGHT_M:
        reason = 'above 12 m'
    if reason is None:
        return {'eave_m': round(min(h, STOREY_M * n), 2), 'ridge_m': round(h, 2), 'from': 'source', 'basis': 'public',
                'recorded_m': round(h, 2), 'rejected': False, 'reason': None, 'storeys_assumed': assumed}
    eave = STOREY_M * n
    return {'eave_m': round(eave, 2), 'ridge_m': round(eave + _roof_allowance(year), 2), 'from': 'storeys',
            'basis': 'likely', 'recorded_m': None if h is None else round(h, 2), 'rejected': h is not None,
            'reason': reason, 'storeys_assumed': assumed}


def check_storeys(footprint_m2, living_sqft, storeys=None, garage_m2=0.0):
    """Cross-check storeys against living area over footprint.

    The footprint includes porches and an attached garage, so pass
    `garage_m2` when it is known. Returns
    {ratio, n_est, n_given, disagree_by, uncertain, basis, note}:
      n_est    nearest of 1, 1.5, 2, 2.5, 3 to the ratio (likely),
      uncertain  true when a given number of storeys is more than one
                 storey away from the ratio ("storeys uncertain").
    """
    try:
        fp = float(footprint_m2) - float(garage_m2 or 0.0)
        liv = float(living_sqft) * M2_PER_SQFT
    except (TypeError, ValueError):
        fp = liv = 0.0
    try:
        given = float(storeys) if storeys not in (None, '') else None
    except (TypeError, ValueError):
        given = None
    if fp <= 0 or liv <= 0:
        return {'ratio': None, 'n_est': given, 'n_given': given, 'disagree_by': None, 'uncertain': False,
                'basis': 'likely' if given is None else 'public', 'note': 'not enough to check'}
    ratio = liv / fp
    n_est = min((1.0, 1.5, 2.0, 2.5, 3.0), key=lambda k: abs(k - ratio))
    dis = None if given is None else abs(given - ratio)
    unc = dis is not None and dis > 1.0
    note = 'storeys uncertain' if unc else ('agrees' if given is not None else 'from area')
    return {'ratio': round(ratio, 2), 'n_est': n_est, 'n_given': given,
            'disagree_by': None if dis is None else round(dis, 2), 'uncertain': unc, 'basis': 'likely', 'note': note}


# --------------------------------------------------------------------------
# rooms inside a real footprint
# --------------------------------------------------------------------------
#
# The outline is turned into the plan frame (front at y = 0), cut into
# axis-aligned cells that lie inside it (an angled wall is approximated from
# the inside), and the cells are split into a few large rectangles: the main
# block and its wings. A garage, when asked for, is cut first at a corner of
# the outline so it has outside walls on two sides or more. The main block
# gets the two-band plan (public rooms to the street, a hall, bedrooms and
# baths behind it); each wing gets whole rooms. Rooms tile the blocks with
# shared edges, so they never overlap and together cover the footprint.
# Every choice is a pure function of the inputs: same ring, same rooms.

MIN_ROOM_M = 5 * FT            # no room narrower than 5 ft, except halls, stairs and closets
MAX_ASPECT = 3.2               # no room longer than 3.2 times its width, except a hall
MAX_BEDS = 5
HALL_M = 1.1
GARAGE_DEPTH_M = 6.1
GARAGE_W1_M, GARAGE_W2_M = 3.7, 6.0
_NARROW_OK = {'hall': 0.9, 'stairs': 0.9, 'closet': 0.6}
_SQUARE_ROOMS = {'living', 'kitchen', 'dining', 'bedroom'}     # kept nearer square than the rest


def _scan_x(ring, y):
    """Sorted x crossings of the ring with the horizontal line at y (half-open rule)."""
    xs = []
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        if (a[1] <= y) != (b[1] <= y):
            xs.append(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
    xs.sort()
    return [(xs[i], xs[i + 1]) for i in range(0, len(xs) - 1, 2)]


def _seg_cross(p1, p2, p3, p4):
    d1, d2 = _sub(p2, p1), _sub(p4, p3)
    den = _cross(d1, d2)
    if abs(den) < 1e-12:
        return False
    t = _cross(_sub(p3, p1), d2) / den
    u = _cross(_sub(p3, p1), d1) / den
    return 1e-7 < t < 1 - 1e-7 and 1e-7 < u < 1 - 1e-7


def rect_in_ring(x0, y0, x1, y1, ring, eps=1e-6):
    """True when the axis-aligned rectangle lies wholly inside the ring."""
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    if not all(point_in_ring(c, ring, eps) for c in corners):
        return False
    for i, a in enumerate(ring):
        if x0 + eps < a[0] < x1 - eps and y0 + eps < a[1] < y1 - eps:
            return False
        b = ring[(i + 1) % len(ring)]
        for j in range(4):
            if _seg_cross(a, b, corners[j], corners[(j + 1) % 4]):
                return False
    return True


def grid_tol(ring_p):
    """How far (metres) a room edge may sit outside the outline after near-equal edges are merged."""
    xs = [p[0] for p in ring_p]
    ys = [p[1] for p in ring_p]
    return max(0.04, max(max(xs) - min(xs), max(ys) - min(ys)) / 600.0)


def _cluster(vals, tol):
    out = []
    for v in sorted(vals):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


def _iv_and(p, q):
    out = []
    for a0, a1 in p:
        for b0, b1 in q:
            lo, hi = max(a0, b0), min(a1, b1)
            if hi - lo > 1e-6:
                out.append((lo, hi))
    return out


def _iv_len(iv):
    return sum(b - a for a, b in iv)


def _bands(ring_p, tol):
    """Horizontal bands [(ya, yb, [(xa, xb), ...])]: x spans that stay inside the ring over the whole band.

    Bands run between the ring's vertex heights, so each band's spans are exact (an angled wall is
    met from the inside). A band thinner than `tol` (two corners at nearly the same height) is
    dropped at the top or bottom and merged into a neighbour in the middle."""
    ys = sorted(set(p[1] for p in ring_p))
    eps = 1e-7
    bands = []
    for ya, yb in zip(ys, ys[1:]):
        if yb - ya <= 2 * eps:
            continue
        bands.append((ya, yb, _iv_and(_scan_x(ring_p, ya + eps), _scan_x(ring_p, yb - eps))))
    while True:
        thin = [k for k, b in enumerate(bands) if b[1] - b[0] < tol]
        if not thin:
            break
        k = thin[0]
        if k == 0 or k == len(bands) - 1:
            bands.pop(k)
            continue
        lo, hi = bands[k - 1], bands[k + 1]
        a, b = _iv_and(lo[2], bands[k][2]), _iv_and(hi[2], bands[k][2])
        if (_iv_len(lo[2]) - _iv_len(a)) * (lo[1] - lo[0]) <= (_iv_len(hi[2]) - _iv_len(b)) * (hi[1] - hi[0]):
            bands[k - 1:k + 1] = [(lo[0], bands[k][1], a)]
        else:
            bands[k:k + 2] = [(bands[k][0], hi[1], b)]
    return bands


def _region_has(bands, x0, y0, x1, y1, tol):
    """True when the rectangle lies inside the banded region (edges may stand out by tol)."""
    if x1 - x0 <= 0 or y1 - y0 <= 0:
        return False
    covered = 0.0
    for ya, yb, iv in bands:
        lo, hi = max(ya, y0), min(yb, y1)
        if hi - lo <= 1e-9:
            continue
        if not any(a - tol - 1e-9 <= x0 and x1 <= b + tol + 1e-9 for a, b in iv):
            return False
        covered += hi - lo
    return covered >= (y1 - y0) - 1e-6


class _Grid:
    """Cells between x cuts and y cuts; `fill[i][j]` true when the cell lies inside the outline."""

    def __init__(self, bands, tol, extra_x=(), extra_y=()):
        self.tol = tol
        xs = [v for _, _, iv in bands for ab in iv for v in ab]
        X = _cluster(xs, tol)
        for v in extra_x:
            if all(abs(v - c) > 1e-9 for c in X):
                X.append(v)
        self.X = sorted(X)
        rows = []
        for ya, yb, iv in bands:
            cut = [ya] + sorted(v for v in extra_y if ya + 1e-9 < v < yb - 1e-9) + [yb]
            rows += [(a, b, iv) for a, b in zip(cut, cut[1:])]
        self.Y = [rows[0][0]] + [r[1] for r in rows] if rows else [0.0]
        self.rows = rows
        self.fill = [[any(a - tol - 1e-9 <= self.X[j] and self.X[j + 1] <= b + tol + 1e-9 for a, b in iv)
                      for j in range(len(self.X) - 1)] for _, _, iv in rows]

    def mark(self, x0, y0, x1, y1, avail):
        for i in range(len(self.Y) - 1):
            if self.Y[i] >= y0 - 1e-9 and self.Y[i + 1] <= y1 + 1e-9:
                for j in range(len(self.X) - 1):
                    if self.X[j] >= x0 - 1e-9 and self.X[j + 1] <= x1 + 1e-9:
                        avail[i][j] = False

    def best_rect(self, avail, minb, min_area):
        """The best free rectangle: largest area, discounted when it is long and thin."""
        X, Y = self.X, self.Y
        C = len(X) - 1
        cnt = [0] * C
        best = None
        for i in range(len(Y) - 1):
            row = avail[i]
            for j in range(C):
                cnt[j] = cnt[j] + 1 if row[j] else 0
            stack = []
            for j in range(C + 1):
                c = cnt[j] if j < C else 0
                start = j
                while stack and stack[-1][1] >= c:
                    s, sc = stack.pop()
                    start = s
                    if sc:
                        x0, x1, y0, y1 = X[s], X[j], Y[i + 1 - sc], Y[i + 1]
                        w, h = x1 - x0, y1 - y0
                        if w >= minb and h >= minb and w * h >= min_area:
                            asp = max(w, h) / min(w, h)
                            score = w * h * min(1.0, 2.2 / asp)
                            if best is None or score > best[0] + 1e-9:
                                best = (score, (x0, y0, x1, y1))
                stack.append((start, c))
        return best[1] if best else None


# label, short, kind, target m2, band ('front' rooms face the street), may be dropped when space is short
_EXTRAS = {
    'first': [('Family room', 'Family', 'living', 17.0, 'front'), ('Laundry', 'Laundry', 'laundry', 5.0, 'back'),
              ('Office', 'Office', 'room', 10.0, 'front'), ('Mudroom', 'Mudroom', 'room', 5.0, 'back'),
              ('Den', 'Den', 'room', 11.0, 'front'), ('Pantry', 'Pantry', 'storage', 4.0, 'back')],
    'second': [('Laundry', 'Laundry', 'laundry', 5.0, 'back'), ('Bonus room', 'Bonus', 'room', 16.0, 'front'),
               ('Office', 'Office', 'room', 10.0, 'front'), ('Linen', 'Linen', 'closet', 3.0, 'back')],
    'basement': [('Workshop', 'Shop', 'room', 14.0, 'back'), ('Storage 2', 'Stor 2', 'storage', 10.0, 'back'),
                 ('Laundry', 'Laundry', 'laundry', 6.0, 'back')],
}
_SHORT = {'Living room': 'Living', 'Half bath': '½ Bath', 'Rec room': 'Rec rm', 'Family room': 'Family',
          'Bonus room': 'Bonus', 'Workshop': 'Shop'}


def _short(label):
    if label in _SHORT:
        return _SHORT[label]
    if label.startswith('Bedroom'):
        return ('Bed' + label[7:])[:7]
    if len(label) <= 7:
        return label
    head, _, num = label.rpartition(' ')
    if num.isdigit():
        return (head[:6 - len(num)] + ' ' + num)[:7]
    return label[:7]


def _room(label, kind, wt, band, core=False, drop=False):
    return {'label': label, 'short': _short(label), 'kind': kind, 'wt': wt, 'band': band, 'core': core, 'drop': drop}


def beds_split(area_m2, beds, storeys):
    """(bedrooms on the first floor, bedrooms on the second): pure, so each floor's call agrees with the other."""
    n = max(0, min(int(beds), MAX_BEDS))
    if storeys < 2:
        return n, 0
    cap2 = max(1, int((0.85 * area_m2 - 12.0) / 11.0))
    n2 = min(n, cap2)
    return n - n2, n2


def _programme(floor, two, beds, area):
    """The rooms one floor needs, all likely: [room], in plan order (front band first)."""
    n1, n2 = beds_split(area, beds, 2 if two else 1)
    many = beds > 1

    def bed(no, wt):
        return _room('Bedroom %d' % no if many else 'Bedroom', 'bedroom', wt, 'back')
    if floor == 'basement':
        return [_room('Rec room', 'living', 30.0, 'front', core=True), _room('Utility', 'utility', 9.0, 'back', core=True),
                _room('Storage', 'storage', 10.0, 'back'), _room('Stairs', 'stairs', 4.5, 'back', core=True)]
    if floor == 'second' or (floor not in ('first', 'basement')):
        n = n2 if two else max(1, min(beds, 2))
        rooms = [bed(i + 1, 14.0 if i == 0 else 11.5) for i in range(n)]
        for r in rooms[:(n + 1) // 2]:
            r['band'] = 'front'
        rooms += [_room('Bath', 'bath', 6.0, 'back', core=True)]
        if n >= 3:
            rooms.append(_room('Bath 2', 'bath', 5.0, 'back', drop=True))
        rooms.append(_room('Stairs', 'stairs', 4.5, 'back', core=True))
        return rooms
    if two:
        rooms = [_room('Living room', 'living', 22.0, 'front', core=True), _room('Dining', 'dining', 12.0, 'front', drop=True),
                 _room('Kitchen', 'kitchen', 14.0, 'back', core=True)]
        rooms.append(_room('Bath', 'bath', 5.5, 'back', core=True) if n1 else _room('Half bath', 'bath', 3.6, 'back', core=True))
        rooms.append(_room('Stairs', 'stairs', 4.5, 'back', core=True))
        rooms += [bed(n2 + i + 1, 11.5) for i in range(n1)]
        return rooms
    rooms = [_room('Living room', 'living', 22.0, 'front', core=True), _room('Kitchen', 'kitchen', 13.0, 'front', core=True),
             _room('Dining', 'dining', 10.0, 'front', drop=True)]
    rooms += [bed(i + 1, 14.0 if i == 0 else 11.5) for i in range(n1)]
    rooms.append(_room('Bath', 'bath', 6.0, 'back', core=True))
    if n1 >= 3:
        rooms.append(_room('Bath 2', 'bath', 5.0, 'back', drop=True))
    return rooms


def _leaf_cost(kind, w, h):
    lo, hi = min(w, h), max(w, h)
    if lo <= 1e-9:
        return 1e6
    asp = hi / lo
    c = (asp - 1.0) * (1.0 if kind in _SQUARE_ROOMS else 0.4)
    if kind != 'hall' and asp > MAX_ASPECT - 0.1:
        c += 100.0 + 100.0 * (asp - MAX_ASPECT + 0.1)
    need = _NARROW_OK.get(kind, MIN_ROOM_M) + 0.05
    if lo < need:
        c += 100.0 + 200.0 * (need - lo)
    return c


def _pack(rooms, w, h):
    """Split a w by h rectangle into len(rooms) rectangles with areas in proportion to the rooms' targets.

    Recursive two-way cuts, searched exhaustively for short lists and around the weight's
    halfway point for long ones. Returns (cost, [(index, x0, y0, x1, y1)]) relative to the corner."""
    cum = [0.0]
    for r in rooms:
        cum.append(cum[-1] + r['wt'])
    kinds = [r['kind'] for r in rooms]
    return _pack_r(kinds, cum, 0, len(rooms), w, h, {})


def _pack_r(kinds, cum, i, j, w, h, memo):
    key = (i, j, w, h)
    hit = memo.get(key)
    if hit is not None:
        return hit
    if j - i == 1:
        res = (_leaf_cost(kinds[i], w, h), [(i, 0.0, 0.0, w, h)])
        memo[key] = res
        return res
    tot = cum[j] - cum[i]
    if j - i <= 3:
        ks = range(i + 1, j)
    else:
        mid = min(range(i + 1, j), key=lambda k: abs(cum[k] - cum[i] - tot / 2))
        ks = [k for k in (mid - 1, mid, mid + 1) if i < k < j]
    best = None
    for k in ks:
        f = (cum[k] - cum[i]) / tot if tot > 0 else (k - i) / (j - i)
        for along_x in ((True, False) if w >= h else (False, True)):
            if along_x:
                a = _pack_r(kinds, cum, i, k, w * f, h, memo)
                if best is not None and a[0] >= best[0]:
                    continue
                b = _pack_r(kinds, cum, k, j, w - w * f, h, memo)
                cost = a[0] + b[0]
                if best is None or cost < best[0] - 1e-9:
                    off = w * f
                    best = (cost, a[1] + [(n, x0 + off, y0, x1 + off, y1) for n, x0, y0, x1, y1 in b[1]])
            else:
                a = _pack_r(kinds, cum, i, k, w, h * f, memo)
                if best is not None and a[0] >= best[0]:
                    continue
                b = _pack_r(kinds, cum, k, j, w, h - h * f, memo)
                cost = a[0] + b[0]
                if best is None or cost < best[0] - 1e-9:
                    off = h * f
                    best = (cost, a[1] + [(n, x0, y0 + off, x1, y1 + off) for n, x0, y0, x1, y1 in b[1]])
    memo[key] = best
    return best


def _place(rooms, rect):
    """Pack rooms into rect; returns (cost, [(room, x0, y0, x1, y1)])."""
    x0, y0, x1, y1 = rect
    if not rooms:
        return 0.0, []
    cost, parts = _pack(rooms, x1 - x0, y1 - y0)
    out = []
    for n, a, b, c, d in parts:
        # share exact cut values between neighbours: the last room of a run ends on the rectangle's own edge
        out.append((rooms[n], x0 + a, y0 + b, x0 + c if abs(c - (x1 - x0)) > 1e-9 else x1, y0 + d if abs(d - (y1 - y0)) > 1e-9 else y1))
    return cost, out


def _fillers(floor, used):
    for label, short, kind, wt, band in _EXTRAS.get(floor, []):
        if label not in used:
            yield {'label': label, 'short': short, 'kind': kind, 'wt': wt, 'band': band, 'core': False, 'drop': True}
    k = 1
    while True:
        label = 'Closet' if k == 1 else 'Closet %d' % k
        k += 1
        if label not in used:
            yield {'label': label, 'short': _short(label), 'kind': 'closet', 'wt': 3.0, 'band': 'back', 'core': False, 'drop': True}


def _next_filler(floor, used, small=False):
    for r in _fillers(floor, used):
        if small and r['kind'] not in ('closet', 'storage'):
            continue
        used.add(r['label'])
        return r


def _closets(rect, used):
    """A thin left-over piece: closets, split so none is longer than 3 times its width."""
    x0, y0, x1, y1 = rect
    w, h = x1 - x0, y1 - y0
    k = max(1, int(math.ceil(max(w, h) / min(w, h) / 3.0 - 1e-9)))
    out = []
    for n in range(k):
        r = _next_filler('closet', used, small=True)
        r['kind'] = 'closet'
        if w >= h:
            a, b = x0 + w * n / k, (x0 + w * (n + 1) / k if n < k - 1 else x1)
            out.append((r, a, y0, b, y1))
        else:
            a, b = y0 + h * n / k, (y0 + h * (n + 1) / k if n < k - 1 else y1)
            out.append((r, x0, a, x1, b))
    return out


def _decompose(grid, garage_rect):
    avail = [row[:] for row in grid.fill]
    if garage_rect:
        grid.mark(*garage_rect, avail)
    blocks, small = [], []
    while len(blocks) < 9:
        r = grid.best_rect(avail, 1.6, 3.0)
        if not r:
            break
        grid.mark(*r, avail)
        blocks.append(r)
    while len(small) < 6:
        r = grid.best_rect(avail, 0.6, 0.8)
        if not r:
            break
        grid.mark(*r, avail)
        w, h = r[2] - r[0], r[3] - r[1]
        if math.ceil(max(w, h) / min(w, h) / 3.0) <= 4:
            small.append(r)
    return blocks, small


def _area(r):
    return (r[2] - r[0]) * (r[3] - r[1])


def _main_options(rooms, rect, hall_ok):
    """Ways to lay out the main block: two bands with a hall between them, or one band."""
    x0, y0, x1, y1 = rect
    D = y1 - y0
    front = [r for r in rooms if r['band'] == 'front']
    back = [r for r in rooms if r['band'] != 'front']
    opts = []
    hall = HALL_M if hall_ok else 0.0
    if front and back and D >= 5.4 + hall:
        wf = sum(r['wt'] for r in front)
        wb = sum(r['wt'] for r in back)
        for frac in (wf / (wf + wb), 0.5):
            fd = min(max((D - hall) * frac, 2.7), D - hall - 2.7)
            c1, p1 = _place(front, (x0, y0, x1, y0 + fd))
            c2, p2 = _place(back, (x0, y0 + fd + hall, x1, y1))
            parts = p1 + p2
            if hall:
                parts.append(({'label': 'Hall', 'short': 'Hall', 'kind': 'hall'}, x0, y0 + fd, x1, y0 + fd + hall))
            opts.append((c1 + c2, parts))
            if c1 + c2 < 100.0:
                return opts[-1]
    c, p = _place(front + back, rect)
    opts.append((c + (1.5 if hall_ok and D >= 6.5 and len(rooms) > 3 else 0.0), p))
    return min(opts, key=lambda o: o[0])


def _assign(prog, blocks, floor):
    """Share the programme between the main block and the wings: [(rect, rooms)], dropped labels."""
    used = {r['label'] for r in prog}
    dropped = []
    total = sum(_area(b) for b in blocks)
    # fit the programme to the space: add rooms to a roomy house, drop optional ones from a tight one
    while total / sum(r['wt'] for r in prog) > 1.45:
        f = next(_fillers(floor, used))
        if f['kind'] == 'closet':
            break
        used.add(f['label'])
        prog.append(f)
    while total / sum(r['wt'] for r in prog) < 0.8:
        d = next((r for r in prog if r['drop']), None)
        if d is None:
            break
        prog.remove(d)
        dropped.append(d['label'])
    s = total / sum(r['wt'] for r in prog)
    main, wings = blocks[0], blocks[1:]
    mcy = (main[1] + main[3]) / 2
    pool = [r for r in prog if not r['core']]
    out = []
    for wg in sorted(wings, key=lambda b: -_area(b)):
        T = _area(wg) / s
        w, h = wg[2] - wg[0], wg[3] - wg[1]
        need = max(1, int(math.ceil(max(w, h) / min(w, h) / 3.0 - 1e-9)))
        front_wing = (wg[1] + wg[3]) / 2 < mcy
        order = ([r for r in pool if r['band'] == 'front'] + [r for r in reversed(pool) if r['band'] != 'front']) if front_wing else \
                ([r for r in reversed(pool) if r['band'] != 'front'] + [r for r in pool if r['band'] == 'front'])
        take, acc = [], 0.0
        if _area(wg) >= 5.0:
            for r in order:
                if acc >= 0.75 * T:
                    break
                if not take or acc + r['wt'] <= 1.35 * T:
                    take.append(r)
                    acc += r['wt']
        while len(take) < need or acc < 0.5 * T:
            f = _next_filler(floor, used, small=_area(wg) < 5.0 or acc >= 0.5 * T)
            f['wt'] = max(f['wt'], (T - acc) / max(1, need - len(take))) if acc < T else f['wt']
            take.append(f)
            acc += f['wt']
        for r in take:
            if r in pool:
                pool.remove(r)
                prog.remove(r)
        # keep plan order inside the wing: front rooms first
        take.sort(key=lambda r: r['band'] != 'front')
        out.append((wg, take))
    main_rooms = list(prog)
    T = _area(main) / s
    acc = sum(r['wt'] for r in main_rooms)
    while acc < 0.6 * T:
        f = _next_filler(floor, used)
        main_rooms.append(f)
        acc += f['wt']
    return [(main, main_rooms)] + out, dropped


def _hard(parts):
    """How many rooms break the width or length rule."""
    n = 0
    for r, x0, y0, x1, y1 in parts:
        lo, hi = min(x1 - x0, y1 - y0), max(x1 - x0, y1 - y0)
        if lo < _NARROW_OK.get(r['kind'], MIN_ROOM_M) + 0.01 or (r['kind'] != 'hall' and hi > (MAX_ASPECT - 0.02) * lo):
            n += 1
    return n


def _fit_block(rooms, rect, main, floor, used):
    """Lay rooms into one block; when a room breaks a rule, even out the sizes, then add a room or two."""
    w, h = rect[2] - rect[0], rect[3] - rect[1]
    best = None
    extra = []
    for k in range(4):
        trial_used = set(used)
        rs = [dict(r) for r in rooms] + [dict(e) for e in extra]
        variants = [rs]
        if len(rs) > 1:
            mean = sum(r['wt'] for r in rs) / len(rs)
            variants.append([dict(r, wt=mean) for r in rs])
        for v in variants:
            c, p = _main_options(v, rect, floor != 'basement') if main else _place(v, rect)
            bad = _hard(p)
            key = (bad, k, c)
            if best is None or key < best[0]:
                best = (key, c, p, trial_used)
            if not bad:
                break
        if best[0][0] == 0:
            break
        f = _next_filler(floor, trial_used, small=max(w, h) * min(w, h) / (len(rs) + 1) < 6.0)
        extra.append(f)
        used |= {f['label']}
    used |= best[3]
    return best[1], best[2]


def _layout(bands, tol, floor, prog, garage_rect, area):
    gx = gy = ()
    if garage_rect:
        gx, gy = (garage_rect[0], garage_rect[2]), (garage_rect[1], garage_rect[3])
    grid = _Grid(bands, tol, gx, gy)
    if len(grid.X) < 2 or not grid.rows:
        return 1e9, [], [r['label'] for r in prog]
    blocks, small = _decompose(grid, garage_rect)
    if not blocks:
        return 1e9, [], [r['label'] for r in prog]
    plan, dropped = _assign([dict(r) for r in prog], blocks, floor)
    used = set()
    for _, rs in plan:
        used |= {r['label'] for r in rs}
    cost = 2.0 * len(blocks)
    parts = []
    for n, (rect, rooms) in enumerate(plan):
        c, p = _fit_block(rooms, rect, n == 0, floor, used)
        cost += c
        parts += p
    for r in small:
        parts += _closets(r, used)
    if garage_rect:
        parts.insert(0, ({'label': 'Garage', 'short': 'Garage', 'kind': 'garage'},) + tuple(garage_rect))
    covered = sum((p[3] - p[1]) * (p[4] - p[2]) for p in parts)
    cost += 40.0 * max(0.0, 1.0 - covered / area) if area else 0.0
    return cost, parts, dropped


def _garage_spots(bands, tol, total_area, ring_p):
    """Garage rectangles at outside corners, best first: (preference, rect)."""
    grid = _Grid(bands, tol)
    X, Y, F = grid.X, grid.Y, grid.fill
    R, C = len(Y) - 1, len(X) - 1
    if R < 1 or C < 1:
        return []
    ymin, xmin, xmax = Y[0], X[0], X[-1]

    def cell(i, j):
        return 0 <= i < R and 0 <= j < C and F[i][j]

    def outside(x, y):
        return not point_in_ring((x, y), ring_p)
    gw_want = GARAGE_W2_M if total_area >= 150.0 else GARAGE_W1_M
    corners = []
    for i in range(R + 1):
        for j in range(C + 1):
            q = [(di, dj) for di, dj in ((0, 0), (0, -1), (-1, 0), (-1, -1)) if cell(i + di, j + dj)]
            if len(q) != 1:
                continue
            di, dj = q[0]
            sx = 1 if dj == 0 else -1
            sy = 1 if di == 0 else -1
            vx, vy = X[j], Y[i]
            first = 0 if (sy == 1 and abs(vy - ymin) < 0.5) else (1 if sy == 1 else 2)
            corners.append(((first, round(min(abs(vx - xmin), abs(vx - xmax)), 2), round(vx, 3), round(vy, 3)), vx, vy, sx, sy))
    corners.sort(key=lambda c: c[0])
    spots = []
    ts = [0.05 + 0.1 * k for k in range(10)]
    for _, vx, vy, sx, sy in corners:
        if len(spots) >= 6:                     # enough to choose from; a big outline has hundreds of corners
            break
        for door_y in (True, False):
            rect = _grow_garage(bands, tol, vx, vy, sx, sy, gw_want, GARAGE_DEPTH_M, door_y)
            if not rect:
                continue
            x0, y0, x1, y1 = rect
            # the two sides that meet at the corner are outside walls: one along its whole length, the other at least half
            fa = sum(outside(x0 + (x1 - x0) * t, vy - sy * 0.12) for t in ts) / len(ts)
            fb = sum(outside(vx - sx * 0.12, y0 + (y1 - y0) * t) for t in ts) / len(ts)
            if max(fa, fb) < 1.0 or min(fa, fb) < 0.5:
                continue
            front = sy == 1 and door_y
            pref = ((0 if abs(vy - ymin) < 0.5 else 1) if front else (2 if sy == 1 else 3)) + (0 if min(fa, fb) == 1.0 else 1)
            edge = min(abs(vx - xmin), abs(vx - xmax))
            spots.append(((pref, round(edge, 2), round(vx, 3), round(vy, 3)), rect))
    spots.sort(key=lambda s: s[0])
    out, seen = [], set()
    for k, r in spots:
        key = tuple(round(v, 2) for v in r)
        if key not in seen:
            seen.add(key)
            out.append((k[0], r))
    return out


def _grow_garage(bands, tol, vx, vy, sx, sy, gw, gd, door_y=True):
    """A garage from corner (vx, vy) towards (sx, sy): door to the street side (door_y) or to the side.

    Tries the wanted size, then smaller ones (never under 3 m by 5 m), then stretches it to a
    wall rather than leave a strip too narrow for a room."""
    def rect(w, d):
        xa, xb = sorted((vx, vx + sx * w))
        ya, yb = sorted((vy, vy + sy * d))
        return xa, ya, xb, yb
    sizes = [(gw, gd), (GARAGE_W1_M, gd), (gw, 5.5), (GARAGE_W1_M, 5.5), (3.0, 5.0)]
    if not door_y:
        sizes = [(d, w) for w, d in sizes]
    fit = next(((w, d) for w, d in sizes if _region_has(bands, *rect(w, d), tol)), None)
    if not fit:
        return None
    w, d = fit
    lw, ld = (7.6, 8.6) if door_y else (8.6, 7.6)
    ext_d = _exact_ext(bands, tol, vx, vy, sx, sy, w, d, True)
    if ext_d - d < 2.4:
        d = ext_d if ext_d <= ld else max(min(w, d), ext_d - 2.4)
    ext_w = _exact_ext(bands, tol, vx, vy, sx, sy, w, d, False)
    if ext_w - w < 2.4:
        w = ext_w if ext_w <= lw else max(min(w, d), ext_w - 2.4)
    r = rect(w, d)
    if min(w, d) < 3.0 - 1e-9 or max(w, d) < 5.0 - 1e-9 or not _region_has(bands, *r, tol):
        return None
    return r


def _exact_ext(bands, tol, vx, vy, sx, sy, w, d, along_y):
    """How far the garage could run (depth when along_y, else width) before it leaves the outline."""
    if along_y:
        xa, xb = sorted((vx, vx + sx * w))
        ys = sorted(set([b[0] for b in bands] + [b[1] for b in bands]))
        best = d
        cands = [abs(y - vy) for y in ys if (y - vy) * sy > d - 1e-9]
        for c in sorted(cands):
            ya, yb = sorted((vy, vy + sy * c))
            if _region_has(bands, xa, ya, xb, yb, tol):
                best = c
            else:
                break
        return best
    ya, yb = sorted((vy, vy + sy * d))
    xs = sorted(set(v for b in bands for ab in b[2] for v in ab))
    best = w
    for c in sorted(abs(x - vx) for x in xs if (x - vx) * sx > w - 1e-9):
        xa, xb = sorted((vx, vx + sx * c))
        if _region_has(bands, xa, ya, xb, yb, tol):
            best = c
        else:
            break
    return best


def _int(v, default):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def fit_layout(ring_m, street_pt=None, floor='first', storeys=1, beds=None, sqft=None, garage=False, wall_m=0.15):
    """An inferred room layout for one floor, fitted inside the real footprint.

    The footprint is a public outline; the rooms are NOT: every room has
    basis "likely" and callers draw them dashed. The layout is a typical
    arrangement for the house type: public rooms at the front, bedrooms and
    baths behind a hall, wings with whole rooms, a garage at an outside
    corner when `garage` is true. Rooms tile the outline with shared edges
    (`wall_m` is kept for callers and no longer used).

    Returns {floor, rooms, frame, coverage, dropped, basis, front_basis}.
    Each room: {kind, label, short, floor, plan_m {x0,y0,x1,y1} (frame metres, y up
    from the front wall), rect_ft {x,y,w,h} (feet, y down, front at the
    bottom of the drawing), ring_m [4 corners in the ring's own metres],
    w_m, d_m, area_m2, basis "likely"}. `short` is the label in 7
    characters or fewer, for a small room on the drawing.
    Rules held (tested): rooms inside the ring and never overlapping; a
    kitchen and a bath on the first floor; bedrooms across the floors equal
    `beds` (at most 5); no room under 5 ft wide except halls, stairs and
    closets; none longer than 3.2 times its width except a hall; the garage
    has outside walls on two sides or more. Never raises for a bad ring.
    """
    try:
        ring = _clean(ring_m)
        fr = plan_frame(ring, street_pt)
    except (ValueError, ZeroDivisionError):
        return {'floor': floor, 'rooms': [], 'frame': None, 'coverage': 0.0, 'dropped': [], 'basis': 'likely', 'front_basis': 'assumed'}
    ring_p = [to_plan(fr, p) for p in ring]
    D = fr['d_m']
    try:
        st = float(storeys) if storeys else 1.0
    except (TypeError, ValueError):
        st = 1.0
    nb = _int(beds, 0)
    if nb <= 0:
        liv = (float(sqft) * M2_PER_SQFT) if _int(sqft, 0) > 0 else None
        nb = 3 if liv is None else (2 if liv < 95 else 3 if liv < 150 else 4)
    nb = min(nb, MAX_BEDS)
    area = ring_area_m2(ring)
    tol = grid_tol(ring_p)
    bands = _bands(ring_p, tol)
    prog = _programme(floor, st >= 2, nb, area)
    tries = []
    if garage and floor == 'first':
        tries = _garage_spots(bands, tol, area, ring_p)[:3]
    best = None
    for pref, g in tries or [(0, None)]:
        cost, parts, dropped = _layout(bands, tol, floor, prog, g, area)
        cost += 3.0 * pref
        if best is None or cost < best[0] - 1e-9:
            best = (cost, parts, dropped)
    _, parts, dropped = best
    if garage and floor == 'first' and not any(p[0]['kind'] == 'garage' for p in parts):
        dropped = dropped + ['Garage']
    rooms = []
    for r, x0, y0, x1, y1 in parts:
        x0, y0, x1, y1 = (round(v, 6) for v in (x0, y0, x1, y1))
        corners = [from_plan(fr, p) for p in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        rooms.append({
            'kind': r['kind'], 'label': r['label'], 'short': r.get('short') or _short(r['label']), 'floor': floor,
            'plan_m': {'x0': round(x0, 2), 'y0': round(y0, 2), 'x1': round(x1, 2), 'y1': round(y1, 2)},
            'rect_ft': {'x': round(x0 / FT, 1), 'y': round((D - y1) / FT, 1), 'w': round((x1 - x0) / FT, 1), 'h': round((y1 - y0) / FT, 1)},
            'ring_m': _out(corners, 2), 'w_m': round(x1 - x0, 2), 'd_m': round(y1 - y0, 2),
            'area_m2': round((x1 - x0) * (y1 - y0), 1), 'basis': 'likely'})
    cover = sum((r['plan_m']['x1'] - r['plan_m']['x0']) * (r['plan_m']['y1'] - r['plan_m']['y0']) for r in rooms)
    return {'floor': floor, 'rooms': rooms,
            'frame': {'c': [round(fr['c'][0], 3), round(fr['c'][1], 3)], 'e1': [round(v, 5) for v in fr['e1']],
                      'e2': [round(v, 5) for v in fr['e2']], 'w_ft': round(fr['w_ft'], 1), 'd_ft': round(fr['d_ft'], 1),
                      'front_bearing_deg': round(fr['front']['bearing_deg'], 1)},
            'coverage': round(cover / area, 2) if area else 0.0, 'dropped': dropped,
            'basis': 'likely', 'front_basis': fr['front']['basis']}


# --------------------------------------------------------------------------
# the card's `building` block
# --------------------------------------------------------------------------

def footprint_block(ring_ll, street_ll=None, parcel_ll=None, recorded_height_m=None, storeys=None, year=None,
                    living_sqft=None, image_date=None, src=None):
    """Build the card's `building` block (design section 3) from real rings.

    ring_ll / parcel_ll are [[lon, lat], ...]; street_ll is the geocoded
    street point [lon, lat] or None. Returns the dict the card carries:

      {frame, footprint{ring_m, area_m2, w_ft, d_ft, rot_deg, basis, as_of, src},
       height{eave_m, ridge_m, from, basis}, storeys{n, basis, check},
       parcel{ring_m, area_m2, basis}|absent, front{bearing_deg, basis}}

    `ring_m` is simplified to at most 48 points (parcel 40), in metres east
    and north of frame.origin. Area is computed from the unsimplified ring.
    """
    full_m, origin = ll_to_m(ring_ll)
    area = ring_area_m2(full_m)
    ring_s = simplify_ring(full_m, SIMPLIFY_M, MAX_RING_POINTS)
    rect = oriented_rect(full_m)
    street_m = point_ll_to_m(street_ll, origin) if street_ll else None
    fr = front_side(full_m, street_m, rect)
    n_given = storeys
    chk = check_storeys(area, living_sqft, storeys) if living_sqft else None
    if n_given in (None, '', 0):
        n_use = chk['n_est'] if chk and chk['n_est'] else 1
        n_basis = 'likely'
    else:
        n_use, n_basis = n_given, 'public'
    hgt = height_rule(recorded_height_m, n_use, year)
    block = {
        'frame': {'origin': {'lon': round(origin['lon'], 7), 'lat': round(origin['lat'], 7)}, 'units': 'm', 'x': 'east', 'y': 'north'},
        'footprint': {'ring_m': ring_s, 'area_m2': round(area, 1), 'w_ft': round(rect['w_ft']), 'd_ft': round(rect['d_ft']),
                      'rot_deg': round(rect['rot_deg'], 1), 'basis': 'public', 'src': src, 'as_of': image_date},
        'height': {'eave_m': hgt['eave_m'], 'ridge_m': hgt['ridge_m'], 'from': hgt['from'], 'basis': hgt['basis'], 'src': src},
        'storeys': {'n': n_use, 'basis': n_basis, 'check': chk},
        'front': {'bearing_deg': round(fr['bearing_deg']), 'basis': fr['basis']},
    }
    if parcel_ll:
        pm, _ = ll_to_m(parcel_ll, origin)
        block['parcel'] = {'ring_m': simplify_ring(pm, SIMPLIFY_M, MAX_PARCEL_POINTS), 'area_m2': round(ring_area_m2(pm), 1), 'basis': 'public'}
    return block
