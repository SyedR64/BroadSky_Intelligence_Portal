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
    for i, a in enumerate(hull):
        b = hull[(i + 1) % len(hull)]
        e = _unit(_sub(b, a))
        n = (-e[1], e[0])
        us = [_dot(p, e) for p in hull]
        vs = [_dot(p, n) for p in hull]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        area = (u1 - u0) * (v1 - v0)
        key = (round(area, 9), (u1 - u0) + (v1 - v0))
        if best is None or key < best[0]:
            best = (key, e, n, u0, u1, v0, v1)
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

def _scan_x(ring, y):
    """Sorted x crossings of the ring with the horizontal line at y (half-open rule)."""
    xs = []
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        if (a[1] <= y) != (b[1] <= y):
            xs.append(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
    xs.sort()
    return [(xs[i], xs[i + 1]) for i in range(0, len(xs) - 1, 2)]


def _strip_common(ring, ya, yb, xhi=None, wall=0.15, samples=9):
    """x intervals that stay inside the ring over the whole strip [ya, yb]."""
    cur = None
    for k in range(samples):
        y = ya + (yb - ya) * k / (samples - 1)
        iv = _scan_x(ring, y)
        if cur is None:
            cur = iv
        else:
            nxt = []
            for a0, a1 in cur:
                for b0, b1 in iv:
                    lo, hi = max(a0, b0), min(a1, b1)
                    if hi - lo > 1e-6:
                        nxt.append((lo, hi))
            cur = nxt
        if not cur:
            return []
    out = []
    for lo, hi in cur:
        lo += wall
        hi -= wall
        if xhi is not None:
            hi = min(hi, xhi)
        if hi - lo > 1e-6:
            out.append((lo, hi))
    return out


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


# kind, label, weight, minimum width in metres
def _program(floor, storeys, beds, W, D, garage):
    """The rooms of one floor as two bands, front band first. Pure rules, all likely."""
    bed = lambda i: ('bedroom', 'Bedroom %d' % i if beds > 1 else 'Bedroom', 3.0, 2.6)
    baths = 1 if beds <= 2 else 2
    if floor == 'basement':
        return [[('living', 'Basement', 4.0, 3.0)], [('utility', 'Utility', 1.8, 2.0), ('storage', 'Storage', 1.2, 1.8)]]
    if floor == 'second':
        n = beds if storeys >= 2 else min(beds, 2)
        n = max(1, min(n, 4))
        rooms = [('bedroom', 'Bedroom %d' % (i + 1), 3.0, 2.6) for i in range(n)]
        half = (n + 1) // 2
        front = rooms[:half]
        back = rooms[half:] + [('bath', 'Bath', 1.6, 1.5)] + [('stairs', 'Stairs', 1.0, 1.0)]
        return [front, back]
    if storeys > 1:
        front = [('living', 'Living room', 3.2, 3.0), ('kitchen', 'Kitchen', 2.4, 2.4)]
        back = [('dining', 'Dining', 2.4, 2.4), ('bath', 'Half bath', 1.2, 1.4), ('stairs', 'Stairs', 1.0, 1.0)]
        return [front, back]
    front = [('living', 'Living room', 3.2, 3.0), ('kitchen', 'Kitchen', 2.4, 2.4)]
    if W >= 10 and not garage:
        front.append(('dining', 'Dining', 2.0, 2.2))
    back = [('bedroom', 'Bedroom %d' % (i + 1) if beds > 1 else 'Bedroom', 3.0, 2.6) for i in range(max(1, min(beds, 4)))]
    back += [('bath', 'Bath' if i == 0 else 'Bath %d' % (i + 1), 1.6, 1.5) for i in range(baths)]
    return [front, back[:6]]


def _allocate(rooms, intervals):
    """Share rooms (kind, label, weight, minw) between x intervals in order, by width."""
    tw = sum(r[2] for r in rooms)
    wide = sum(b - a for a, b in intervals)
    plan = [[] for _ in intervals]
    if not rooms or not intervals:
        return plan
    i = 0
    acc = 0.0
    for k, r in enumerate(rooms):
        cap = (intervals[i][1] - intervals[i][0]) / wide * tw
        if plan[i] and acc + r[2] / 2 > cap and i < len(intervals) - 1 and len(rooms) - k >= 1:
            i += 1
            acc = 0.0
        plan[i].append(r)
        acc += r[2]
    return plan


def _layout_floor(ring_p, W, D, floor, storeys, beds, garage, wall):
    rooms, dropped = [], []
    gx0 = gd = None
    if garage and floor == 'first' and W >= 7.0:
        gw = 5.8 if W >= 15.0 else 3.3
        gd = min(D, 6.5)
        iv = _strip_common(ring_p, wall, gd - wall, None, wall)
        if iv:
            hi = max(b for a, b in iv)
            lo = hi - gw
            if lo > wall + 2.5 and rect_in_ring(lo, wall, hi, gd - wall, ring_p):
                gx0 = lo
                rooms.append(('garage', 'Garage', lo, wall, hi, gd - wall))
    prog = _program(floor, storeys, beds, W, D, gx0 is not None)
    hall = 1.1 if (D >= 7.5 and len(prog) == 2 and floor != 'basement') else 0.0
    bands = len(prog)
    if D < 4.8 and bands == 2:
        prog = [prog[0] + prog[1]]
        bands, hall = 1, 0.0
    usable = D - hall
    if bands == 1:
        spans = [(0.0, D)]
    else:
        fd = usable * 0.5
        spans = [(0.0, fd), (fd + hall, D)]
    for (y0, y1), prog_band in zip(spans, prog):
        ya, yb = y0 + wall, y1 - wall
        if yb - ya < 1.8:
            dropped += [r[1] for r in prog_band]
            continue
        xhi = gx0 - wall if (gx0 is not None and y0 < gd) else None
        iv = [(a, b) for a, b in _strip_common(ring_p, ya, yb, xhi, wall) if b - a >= 2.0]
        for chunk, (a, b) in zip(_allocate(prog_band, iv), iv):
            tw = sum(r[2] for r in chunk)
            x = a
            for kind, label, wt, minw in chunk:
                w = (b - a) * wt / tw if tw else 0
                if w < minw * 0.8:
                    dropped.append(label)
                    x += w
                    continue
                rooms.append((kind, label, x, ya, x + w, yb))
                x += w
    if hall:
        fd = usable * 0.5
        ya, yb = fd + wall * 0.0, fd + hall
        iv = [(a, b) for a, b in _strip_common(ring_p, ya, yb, (gx0 - wall) if (gx0 is not None and ya < gd) else None, wall) if b - a >= 2.0]
        if iv:
            a = min(i[0] for i in iv)
            b = max(i[1] for i in iv)
            if len(iv) == 1 and rect_in_ring(a, ya, b, yb, ring_p):
                rooms.append(('hall', 'Hall', a, ya, b, yb))
    out = []
    for kind, label, x0, y0, x1, y1 in rooms:
        if not rect_in_ring(x0, y0, x1, y1, ring_p):
            dropped.append(label)
            continue
        out.append((kind, label, x0, y0, x1, y1))
    return out, dropped


def fit_layout(ring_m, street_pt=None, floor='first', storeys=1, beds=None, sqft=None, garage=False, wall_m=0.15):
    """An inferred room layout for one floor, fitted inside the real footprint.

    The footprint is a public outline; the rooms are NOT: every room has
    basis "likely" and callers draw them dashed. The layout is a typical
    arrangement for the house type: public rooms at the front, bedrooms and
    baths behind a hall, a garage at one end when `garage` is true.

    Returns {floor, rooms, frame, coverage, dropped, basis, front_basis}.
    Each room: {kind, label, floor, plan_m {x0,y0,x1,y1} (frame metres, y up
    from the front wall), rect_ft {x,y,w,h} (feet, y down, front at the
    bottom of the drawing), ring_m [4 corners in the ring's own metres],
    w_m, d_m, area_m2, basis "likely"}.
    Every room lies wholly inside the ring, rooms never overlap, and no
    room is narrower than 1.4 m (the hall, 1.1 m, is the one exception).
    """
    ring = _clean(ring_m)
    fr = plan_frame(ring, street_pt)
    ring_p = [to_plan(fr, p) for p in ring]
    W, D = fr['w_m'], fr['d_m']
    try:
        st = float(storeys) if storeys else 1.0
    except (TypeError, ValueError):
        st = 1.0
    if beds in (None, '', 0):
        liv = (float(sqft) * M2_PER_SQFT) if sqft else None
        beds = 3 if liv is None else (2 if liv < 95 else 3 if liv < 150 else 4)
    beds = int(beds)
    raw, dropped = _layout_floor(ring_p, W, D, floor, st, beds, bool(garage), float(wall_m))
    rooms = []
    for kind, label, x0, y0, x1, y1 in raw:
        corners = [from_plan(fr, p) for p in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        rooms.append({
            'kind': kind, 'label': label, 'floor': floor,
            'plan_m': {'x0': round(x0, 2), 'y0': round(y0, 2), 'x1': round(x1, 2), 'y1': round(y1, 2)},
            'rect_ft': {'x': round(x0 / FT, 1), 'y': round((D - y1) / FT, 1), 'w': round((x1 - x0) / FT, 1), 'h': round((y1 - y0) / FT, 1)},
            'ring_m': _out(corners, 2), 'w_m': round(x1 - x0, 2), 'd_m': round(y1 - y0, 2),
            'area_m2': round((x1 - x0) * (y1 - y0), 1), 'basis': 'likely'})
    cover = sum((r['plan_m']['x1'] - r['plan_m']['x0']) * (r['plan_m']['y1'] - r['plan_m']['y0']) for r in rooms)
    area = ring_area_m2(ring)
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
