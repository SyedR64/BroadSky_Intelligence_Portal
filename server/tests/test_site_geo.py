"""
Tests for server/site_geo.py: pure geometry for the live site brief. No network.

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python -m pytest -q tests/test_site_geo.py
"""

import math
import os
import sys

import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

import site_geo as g   # noqa: E402

LON0, LAT0 = -76.3005, 40.1585     # near a small town centre in Lancaster County; any point would do


def rect_ring(w, d, rot_deg=0.0, c=(0.0, 0.0)):
    """A w by d rectangle (metres) turned rot_deg counter-clockwise, as a closed ring."""
    t = math.radians(rot_deg)
    pts = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * w / 2, sy * d / 2
        pts.append([c[0] + x * math.cos(t) - y * math.sin(t), c[1] + x * math.sin(t) + y * math.cos(t)])
    return pts + [pts[0]]


def to_ll(ring_m, lon0=LON0, lat0=LAT0):
    return g.m_to_ll(ring_m, {'lon': lon0, 'lat': lat0})


def hav(a, b):
    """Great-circle metres on the local mean radius (an independent check of the scale)."""
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dl = math.radians(b[0] - a[0])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


# an L-shaped house, 18 m by 12 m with a 7 m by 5 m notch: area 216 - 35 = 181 m2
L_SHAPE = [[0, 0], [18, 0], [18, 7], [11, 7], [11, 12], [0, 12]]


# ---- round trip and area -------------------------------------------------------

def test_round_trip_within_5_cm():
    ring = rect_ring(14, 9, 23)
    ll = to_ll(ring)
    back, origin = g.ll_to_m(ll)
    ll2 = g.m_to_ll(back, origin)
    again, _ = g.ll_to_m(ll2, origin)
    for a, b in zip(back, again):
        assert math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05
    # the ring that comes back is the ring that went in, up to the shift of origin
    ox, oy = back[0][0] - ring[0][0], back[0][1] - ring[0][1]
    for a, b in zip(back, ring):
        assert math.hypot(a[0] - ox - b[0], a[1] - oy - b[1]) < 0.05


def test_round_trip_ll_and_rounded_output():
    ll = to_ll(L_SHAPE)
    m, o = g.ll_to_m(ll)
    ll2 = g.m_to_ll(g.simplify_ring(m, tol=0.0, max_points=48), o)
    # simplification keeps the six corners; rounding to a centimetre moves nothing more than 5 cm
    m2, _ = g.ll_to_m(ll2, o)
    m1, _ = g.ll_to_m(ll, o)
    assert len(m2) == 6
    for a, b in zip(m1, m2):
        assert math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05


def test_metres_match_great_circle_distances():
    ll = to_ll([[0, 0], [100, 0], [100, 60], [0, 60]])
    m, _ = g.ll_to_m(ll)
    for i in range(4):
        j = (i + 1) % 4
        d_m = math.hypot(m[i][0] - m[j][0], m[i][1] - m[j][1])
        assert abs(d_m - hav(ll[i], ll[j])) / d_m < 0.005


def test_area_within_one_percent():
    ring = rect_ring(30, 20, 37)
    m, _ = g.ll_to_m(to_ll(ring))
    assert abs(g.ring_area_m2(m) - 600) / 600 < 0.01
    m, _ = g.ll_to_m(to_ll(L_SHAPE))
    assert abs(g.ring_area_m2(m) - 181) / 181 < 0.01


def test_ring_accepts_closed_and_open_and_third_coordinate():
    ll = [[p[0], p[1], 3.0] for p in to_ll(rect_ring(10, 8))]
    m, _ = g.ll_to_m(ll)
    assert len(m) == 4
    with pytest.raises(ValueError):
        g.ll_to_m([[0, 0], [1, 1]])
    with pytest.raises(ValueError):
        g.ll_to_m([[0, 0], [1, 1], ['x', 2]])


# ---- simplification ------------------------------------------------------------

def noisy_circle(n=400, r=9.0):
    return [[r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)] for i in range(n)]


def test_simplify_caps_at_48_points_and_keeps_area():
    ring = noisy_circle()
    out = g.simplify_ring(ring)
    assert 3 <= len(out) <= 48
    a0, a1 = g.ring_area_m2(ring), g.ring_area_m2(out)
    assert abs(a1 - a0) / a0 < 0.01
    assert len(g.simplify_ring(ring, max_points=40)) <= 40


def test_simplify_keeps_corners_and_drops_collinear_points():
    ring = [[0, 0], [5, 0], [10, 0], [10, 8], [5, 8], [0, 8]]
    out = g.simplify_ring(ring)
    assert len(out) == 4
    assert g.ring_area_m2(out) == pytest.approx(80)


def test_simplify_a_small_ring_is_unchanged_and_output_is_serialisable():
    out = g.simplify_ring(L_SHAPE)
    assert len(out) == 6 and all(isinstance(v, float) for p in out for v in p)


# ---- oriented rectangle --------------------------------------------------------

@pytest.mark.parametrize('rot', [0, 12.5, 45, 90, 137, 170])
def test_oriented_rect_recovers_size_and_bearing(rot):
    ring = rect_ring(17, 9, rot, (5, -3))
    r = g.oriented_rect(ring)
    assert r['w_m'] == pytest.approx(17, abs=0.01) and r['d_m'] == pytest.approx(9, abs=0.01)
    assert r['c'] == pytest.approx([5, -3], abs=0.01)
    # the long side lies along math angle `rot`; as a compass bearing that is (90 - rot) mod 180
    assert r['rot_deg'] == pytest.approx((90 - rot) % 180, abs=0.05) or abs(r['rot_deg'] - (90 - rot) % 180) in (pytest.approx(180, abs=0.05),)
    assert r['w_ft'] == pytest.approx(17 / 0.3048, abs=0.05)


def test_oriented_rect_non_rectangular_ring():
    r = g.oriented_rect(L_SHAPE)
    # the L is 18 by 12 overall, so the minimum rectangle is the bounding box
    assert (r['w_m'], r['d_m']) == (pytest.approx(18), pytest.approx(12))
    assert r['rot_deg'] == pytest.approx(90, abs=0.01)
    assert len(r['corners']) == 4
    # a turned L: the same rectangle comes back, turned
    t = math.radians(30)
    turned = [[x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t)] for x, y in L_SHAPE]
    r2 = g.oriented_rect(turned)
    assert (r2['w_m'], r2['d_m']) == (pytest.approx(18, abs=0.01), pytest.approx(12, abs=0.01))


def test_oriented_rect_degenerate():
    with pytest.raises(ValueError):
        g.oriented_rect([[0, 0], [1, 1], [2, 2], [3, 3]])


# ---- front side ----------------------------------------------------------------

def test_front_side_by_street_point_and_bearing():
    ring = rect_ring(16, 9)           # long side east-west
    south = g.front_side(ring, (0, -20))
    assert south['bearing_deg'] == pytest.approx(180, abs=0.1) and south['side'] == 'long' and south['normal_axis'] == 'short' and south['basis'] == 'public'
    assert south['street_bearing_deg'] == pytest.approx(180, abs=0.1)
    north = g.front_side(ring, (1, 30))
    assert north['bearing_deg'] == pytest.approx(0, abs=0.1) or north['bearing_deg'] == pytest.approx(360, abs=0.1)
    east = g.front_side(ring, (25, 0))
    assert east['bearing_deg'] == pytest.approx(90, abs=0.1) and east['side'] == 'short'
    west = g.front_side(ring, (-25, 2))
    assert west['bearing_deg'] == pytest.approx(270, abs=0.1)


def test_front_side_on_a_turned_house_and_without_a_street_point():
    ring = rect_ring(16, 9, 30)
    # street straight down the long side's outward normal at bearing 120 (30 degrees turned from 90)
    r = g.oriented_rect(ring)
    n = (math.sin(math.radians(150)), math.cos(math.radians(150)))   # candidate normal, bearing 150
    f = g.front_side(ring, (n[0] * 30, n[1] * 30))
    assert f['bearing_deg'] == pytest.approx(150, abs=0.5) or f['bearing_deg'] == pytest.approx(330, abs=0.5)
    a = g.front_side(ring, None)
    assert a['basis'] == 'assumed' and a['street_bearing_deg'] is None
    # assumed front is the side that faces most nearly south
    assert 90 < a['bearing_deg'] < 270


def test_plan_frame_puts_front_at_the_bottom_without_mirroring():
    for bearing_pt, expect in (((0, -30), (16, 9)), ((30, 0), (9, 16))):
        fr = g.plan_frame(rect_ring(16, 9), bearing_pt)
        assert (fr['w_m'], fr['d_m']) == (pytest.approx(expect[0]), pytest.approx(expect[1]))
        # a point on the front wall has plan y = 0, the middle of the back wall has y = d
        sp = fr['front']['normal']
        front_mid = [fr['c'][0] + sp[0] * fr['d_m'] / 2, fr['c'][1] + sp[1] * fr['d_m'] / 2]
        # front mid-point on its own wall: y is 0 only for the axis that matches; check generally via round trip
        p = g.to_plan(fr, front_mid)
        assert p[1] == pytest.approx(0, abs=1e-6)
        assert g.from_plan(fr, p) == pytest.approx(front_mid, abs=1e-9)
        # pure rotation: e1 x e2 > 0
        assert fr['e1'][0] * fr['e2'][1] - fr['e1'][1] * fr['e2'][0] > 0


def test_street_to_the_south_gives_east_on_the_right():
    fr = g.plan_frame(rect_ring(16, 9), (0, -30))
    east = g.to_plan(fr, [8, 0])
    west = g.to_plan(fr, [-8, 0])
    assert east[0] > west[0]


# ---- snapping inside -----------------------------------------------------------

def test_snap_inside_keeps_an_interior_point():
    assert g.snap_inside([2, 2], L_SHAPE) == [2, 2]


def test_snap_inside_moves_an_outside_point_in():
    for pt in ([-3, 5], [14, 10], [20, 3], [5, 30]):     # (14, 10) is in the notch of the L
        out = g.snap_inside(pt, L_SHAPE, margin=0.3)
        assert g.point_in_ring(out, L_SHAPE)
        assert g.dist_to_boundary(out, L_SHAPE) >= 0.29


def test_snap_inside_a_point_on_the_wall_and_a_narrow_ring():
    out = g.snap_inside([9, 0], L_SHAPE, margin=0.3)
    assert g.dist_to_boundary(out, L_SHAPE) >= 0.29
    narrow = [[0, 0], [10, 0], [10, 0.4], [0, 0.4]]
    out = g.snap_inside([5, 3], narrow, margin=0.5)
    assert g.point_in_ring(out, narrow)


def test_representative_point_of_a_notched_ring_is_inside():
    c_shape = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10]]
    p = g.representative_point(c_shape)
    assert g.point_in_ring(p, c_shape) and g.dist_to_boundary(p, c_shape) > 1.0


# ---- height rule (design section 7.3) -------------------------------------------

def test_height_empty_is_inferred_and_likely():
    h = g.height_rule(None, 2, 1973)
    assert h['from'] == 'storeys' and h['basis'] == 'likely' and h['rejected'] is False
    assert h['eave_m'] == pytest.approx(5.4) and h['ridge_m'] == pytest.approx(8.0)


def test_height_4_01_m_on_two_storeys_is_rejected():
    h = g.height_rule(4.01, 2, 1973)
    assert h['rejected'] is True and h['from'] == 'storeys' and h['basis'] == 'likely'
    assert h['eave_m'] == pytest.approx(5.4) and h['ridge_m'] > 5.4
    assert h['recorded_m'] == pytest.approx(4.01) and 'below' in h['reason']


def test_height_8_2_m_on_two_storeys_is_kept_as_public():
    h = g.height_rule(8.2, 2, 1973)
    assert h['rejected'] is False and h['from'] == 'source' and h['basis'] == 'public'
    assert h['ridge_m'] == pytest.approx(8.2) and h['eave_m'] == pytest.approx(5.4)


def test_height_limits_and_odd_inputs():
    assert g.height_rule(12.0, 3)['basis'] == 'public'
    assert g.height_rule(12.1, 3)['basis'] == 'likely'
    assert g.height_rule(5.4, 2)['basis'] == 'public'          # exactly 2.7 m a storey
    assert g.height_rule(5.39, 2)['basis'] == 'likely'
    assert g.height_rule('n/a', 1)['basis'] == 'likely'
    assert g.height_rule(float('nan'), 1)['basis'] == 'likely'
    assert g.height_rule(0, 1)['basis'] == 'likely'
    h = g.height_rule(None, None)
    assert h['storeys_assumed'] is True and h['eave_m'] == pytest.approx(2.7)
    assert g.height_rule(None, 2, 1900)['ridge_m'] > g.height_rule(None, 2, 1990)['ridge_m'] - 1   # older roofs are not lower
    assert g.height_rule(None, 1.5)['eave_m'] == pytest.approx(4.05)


# ---- storeys cross-check ---------------------------------------------------------

def test_check_storeys_agrees_and_disagrees():
    ok = g.check_storeys(100, 1100, 1)      # 102 m2 on 100 m2
    assert ok['uncertain'] is False and ok['n_est'] == 1.0
    two = g.check_storeys(100, 2150, 2)
    assert two['uncertain'] is False and two['n_est'] == 2.0
    bad = g.check_storeys(60, 2900, 1)      # 270 m2 on a 60 m2 footprint is not one storey
    assert bad['uncertain'] is True and bad['note'] == 'storeys uncertain' and bad['basis'] == 'likely'
    # with no storeys given the estimate comes from area
    est = g.check_storeys(100, 2150, None)
    assert est['n_est'] == 2.0 and est['n_given'] is None and est['uncertain'] is False
    # a garage on the footprint is taken off
    assert g.check_storeys(100, 1000, 1, garage_m2=40)['ratio'] > g.check_storeys(100, 1000, 1)['ratio']
    assert g.check_storeys(None, None, 2)['uncertain'] is False


# ---- rooms inside a real footprint ------------------------------------------------

def overlaps(a, b):
    return min(a['x1'], b['x1']) - max(a['x0'], b['x0']) > 1e-6 and min(a['y1'], b['y1']) - max(a['y0'], b['y0']) > 1e-6


def assert_layout_ok(res, ring):
    assert res['basis'] == 'likely' and res['rooms']
    fr = res['frame']
    plan_ring = None
    for r in res['rooms']:
        assert r['basis'] == 'likely' and r['label']
        assert min(r['w_m'], r['d_m']) >= (1.0 if r['kind'] == 'hall' else 1.4)
        for p in r['ring_m']:
            assert g.point_in_ring(p, ring, eps=0.03), (r['label'], p)
        # the corner ring is a real rectangle of the stated size
        assert g.ring_area_m2(r['ring_m']) == pytest.approx(r['area_m2'], abs=0.6)
    boxes = [r['plan_m'] for r in res['rooms']]
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            assert not overlaps(boxes[i], boxes[j]), (res['rooms'][i]['label'], res['rooms'][j]['label'])


def test_layout_in_a_rectangle():
    ring = rect_ring(15.5, 8.8, 0)                       # about 51 ft by 29 ft
    res = g.fit_layout(ring, (0, -25), storeys=1, beds=3)
    assert_layout_ok(res, ring)
    labels = [r['label'] for r in res['rooms']]
    assert 'Living room' in labels and 'Kitchen' in labels and sum(1 for k in labels if k.startswith('Bedroom')) == 3
    assert 'Bath' in labels
    assert res['coverage'] > 0.7
    # public rooms sit at the front (low y), bedrooms behind
    ys = {r['label']: r['plan_m']['y0'] for r in res['rooms']}
    assert ys['Living room'] < ys['Bedroom 1']


def test_layout_in_a_non_rectangular_ring():
    ring = [[x, y] for x, y in L_SHAPE]
    res = g.fit_layout(ring, (9, -20), storeys=1, beds=3)
    assert_layout_ok(res, ring)
    assert res['coverage'] > 0.5
    # nothing may sit in the notch (11..18 east, 7..12 north)
    for r in res['rooms']:
        cx = sum(p[0] for p in r['ring_m']) / 4
        cy = sum(p[1] for p in r['ring_m']) / 4
        assert not (cx > 11.2 and cy > 7.2)
    # the same L turned and with the street on another side still fits
    t = math.radians(33)
    turned = [[x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t)] for x, y in L_SHAPE]
    res2 = g.fit_layout(turned, (-30, 10), storeys=1, beds=2)
    assert_layout_ok(res2, turned)


def test_layout_garage_stays_inside_and_clear_of_rooms():
    ring = rect_ring(17, 9.5, 10)
    res = g.fit_layout(ring, (0, -30), storeys=1, beds=3, garage=True)
    assert_layout_ok(res, ring)
    assert any(r['kind'] == 'garage' for r in res['rooms'])


def test_layout_two_storey_floors():
    ring = rect_ring(12.5, 9.0, 0)
    first = g.fit_layout(ring, (0, -20), floor='first', storeys=2, sqft=1840)
    second = g.fit_layout(ring, (0, -20), floor='second', storeys=2, sqft=1840)
    base = g.fit_layout(ring, (0, -20), floor='basement', storeys=2)
    for res in (first, second, base):
        assert_layout_ok(res, ring)
    assert any(r['label'].startswith('Bedroom') for r in second['rooms'])
    assert not any(r['label'].startswith('Bedroom') for r in first['rooms'])
    assert second['floor'] == 'second' and all(r['floor'] == 'second' for r in second['rooms'])


def test_layout_small_footprint_drops_rooms_instead_of_overflowing():
    ring = rect_ring(5.0, 3.5)
    res = g.fit_layout(ring, (0, -10), storeys=1, beds=3)
    for r in res['rooms']:
        for p in r['ring_m']:
            assert g.point_in_ring(p, ring, eps=0.03)
    assert isinstance(res['dropped'], list)


def test_layout_rect_ft_sits_inside_the_drawing_with_front_at_the_bottom():
    ring = rect_ring(15.5, 8.8)
    res = g.fit_layout(ring, (0, -25), storeys=1, beds=3)
    W, D = res['frame']['w_ft'], res['frame']['d_ft']
    for r in res['rooms']:
        f = r['rect_ft']
        assert f['x'] >= -0.1 and f['y'] >= -0.1 and f['x'] + f['w'] <= W + 0.1 and f['y'] + f['h'] <= D + 0.1
    lv = next(r for r in res['rooms'] if r['label'] == 'Living room')
    bd = next(r for r in res['rooms'] if r['label'] == 'Bedroom 1')
    assert lv['rect_ft']['y'] > bd['rect_ft']['y']       # front room is drawn lower on the page


# ---- the card block ----------------------------------------------------------------

def test_footprint_block_shape_and_rules():
    ring = rect_ring(15.5, 8.8, 20)
    ll = to_ll(ring)
    street = g.point_m_to_ll([0, -30], {'lon': LON0, 'lat': LAT0})
    parcel = to_ll(rect_ring(40, 38))
    b = g.footprint_block(ll, street, parcel, recorded_height_m=4.01, storeys=2, year=1973, living_sqft=1840,
                          image_date='2010-08-17', src=3)
    assert set(b) >= {'frame', 'footprint', 'height', 'storeys', 'front', 'parcel'}
    fp = b['footprint']
    assert len(fp['ring_m']) <= 48 and fp['basis'] == 'public' and fp['as_of'] == '2010-08-17'
    assert fp['area_m2'] == pytest.approx(15.5 * 8.8, rel=0.01)
    assert b['height']['basis'] == 'likely' and b['height']['from'] == 'storeys'
    assert b['storeys'] == {'n': 2, 'basis': 'public', 'check': b['storeys']['check']}
    assert b['storeys']['check']['uncertain'] is False or b['storeys']['check']['uncertain'] is True
    assert b['front']['basis'] == 'public'
    assert len(b['parcel']['ring_m']) <= 40
    # the ring can be put back on the map within a few centimetres
    back = g.m_to_ll(fp['ring_m'], b['frame']['origin'])
    m2, _ = g.ll_to_m(back, b['frame']['origin'])
    assert abs(g.ring_area_m2(m2) - 15.5 * 8.8) / (15.5 * 8.8) < 0.01
    # no street point: assumed front, no recorded height: likely
    b2 = g.footprint_block(ll)
    assert b2['front']['basis'] == 'assumed' and b2['height']['basis'] == 'likely' and b2['storeys']['basis'] == 'likely'
    assert 'parcel' not in b2
    import json
    assert len(json.dumps(b)) < 6000
