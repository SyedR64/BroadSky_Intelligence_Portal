#!/usr/bin/env python3
"""Build the SBA loan candidate screen for BSP's portfolio segments.

Sources (both public, from the SBA open-data portal data.sba.gov):
  * Paycheck Protection Program FOIA loan-level files (dataset "ppp-foia"):
    public_150k_plus_*.csv and public_up_to_150k_*_*.csv.
  * SBA 7(a) and 504 FOIA loan-level files (dataset "7a-504-foia"):
    FOIA_7a_FY1991_FY1999_*.csv, FOIA_7a_FY2000_FY2009_*.csv,
    FOIA_7a_FY2010_FY2019_*.csv, FOIA_7a_FY2020_Present_*.csv,
    FOIA_504_FY1991_FY2009_*.csv, FOIA_504_FY2010_Present_*.csv
    (every FOIA_7a_*/FOIA_504_* file found is read).
  * Census ZCTA gazetteer (ZIP centroids) for distances.

Nothing raw is written into the repo. Everything goes to the output paths given
on the command line.

Outputs
  <export-dir>/ppp_<seg>.csv        every PPP loan row that matches the segment's
                                    NAICS codes and geography, all SBA columns,
                                    values byte-for-byte as released (one row per loan)
  <export-dir>/sba7a_<seg>.csv      same for 7(a) loans (every FY file found, FY1991 to date)
  <export-dir>/sba504_<seg>.csv     same for 504 loans
  <export-dir>/ppp_pp_geo_unresolved.csv   pp-state rows whose ZIP has no centroid
  <out>                             compact candidates JSON: one record per business
                                    (first/second draw and name variants collapsed),
                                    SBA 7(a)/504 links, exclusions, flags, shortlist.

The full exports are unfiltered apart from NAICS and geography. The business view
and shortlist never carry the PPP Race, Ethnicity, Gender or Veteran fields.

Usage
  python3 -I scripts/build_ppp_screen.py --ppp-dir DIR --sba-dir DIR \
      --zcta FILE --export-dir DIR --out FILE [--repo DIR] [--cid-map FILE]

Standard library only (Python 3.9+). Re-runnable: outputs are overwritten, and
--cid-map keeps candidate ids stable across runs.
"""
import argparse
import csv
import datetime as dt
import difflib
import glob
import html
import json
import math
import multiprocessing as mp
import os
import re
import sys
from collections import Counter, defaultdict

ENC = dict(encoding="utf-8", errors="surrogateescape", newline="")

# ---------------------------------------------------------------- segments
NEW_ENGLAND = {"CT", "MA", "RI", "NH", "VT", "ME"}
PP_STATES = {"PA", "NJ", "DE", "MD", "NY"}

SEGMENTS = {
    "pp": {
        "label": "Punctual Pros (residential HVAC, plumbing, electrical)",
        "naics": {"238220", "238210"},
        "geo": "pp_radius",
        "radius_mi": 120.0,
        "band": (15, 200),
        "cap": 60,
    },
    "cet": {
        "label": "Commonwealth Electrical Technologies (New England electrical, solar, EV, efficiency; water/sewer)",
        "naics": {"238210", "237110"},
        "geo": "new_england",
        "band": (20, 300),
        "cap": 60,
    },
    "fl": {
        "label": "Frontline Managed Services (managed IT and revenue-cycle services for law firms)",
        "naics": {"541512", "541513", "541519"},
        "geo": "us",
        "band": (10, 200),
        "cap": 25,
    },
    "ts": {
        "label": "Thomas Scientific (lab supplies and equipment distribution)",
        "naics": {"423490", "423450", "424690"},
        "geo": "us",
        "band": (10, 250),
        "cap": 25,
    },
    "bpi": {
        "label": "Bully Pulpit International (public affairs and communications)",
        "naics": {"541820", "541910"},
        "geo": "us",
        "band": (10, 150),
        "cap": 20,
    },
    "fh": {
        "label": "Fair Harbor (branded consumer apparel and swim)",
        "naics_prefix": "315",
        "naics": {"424350"},
        "geo": "us",
        "band": (10, 150),
        "cap": 10,
    },
}
SEG_ORDER = ["pp", "cet", "fl", "ts", "bpi", "fh"]

# hub / node ZIPs (centroids looked up in the gazetteer; fallbacks are city centres)
PP_HUBS = {"Lancaster PA hub": ("17601", 40.0767, -76.3108),
           "Toms River NJ hub": ("08753", 39.9767, -74.1557)}
CET_NODES = {"Worcester MA": ("01606", 42.3126, -71.7956),
             "Taunton MA": ("02780", 41.9028, -71.0897),
             "Norwell MA": ("02061", 42.1610, -70.7928)}

# BSP companies, add-ons and the exited Smith + Howard group (excluded, not shortlisted)
BSP_EXCLUDE_NAMES = [
    "PUNCTUAL PROS", "HORVATH HOME SERVICES", "HORVATH HOME SERVICE",
    "COMMONWEALTH ELECTRICAL TECHNOLOGIES", "COMMONWEALTH ELECTRICAL TECH",
    "NUWAVE ENERGY SOLUTIONS", "NU WAVE ENERGY SOLUTIONS", "HORTON ELECTRICAL SERVICES",
    "HORTON ELECTRICAL SERVICE", "HORTON ELECTRIC SERVICES",
    "FRONTLINE MANAGED SERVICES", "GLASSER TECH", "GLASSERTECH", "INVOICEPREP", "INVOICE PREP",
    "LOGICFORCE", "LOGICFORCE CONSULTING",
    "THOMAS SCIENTIFIC", "NORTH CENTRAL INSTRUMENTS", "QUINTANA SUPPLY", "DAY ASSOCIATES",
    "ARROWHEAD FORENSICS",
    "BULLY PULPIT INTERACTIVE", "BULLY PULPIT INTERNATIONAL", "BULLY PULPIT",
    "PROPPER DALEY", "AGADO COMMUNICATIONS", "AGADO",
    "FAIR HARBOR CLOTHING", "FAIR HARBOR",
    "SMITH AND HOWARD", "SMITH HOWARD", "GEELS NORTON",
]
# exact-address markers for Punctual Pros / CET sites (normalised street text)
BSP_EXCLUDE_ADDR = [
    ("516 RUNNING PUMP", "PA"), ("518 RUNNING PUMP", "PA"), ("6014 PATRIOT", "PA"),
    ("2575 EASTERN BLVD", "PA"), ("1130 SHIP AVE", "NJ"),
    ("125 BLACKSTONE RIVER", "MA"), ("125 JOHN HANCOCK", "MA"),
]
AUTHORITY_BRANDS = ("ONE HOUR", "BENJAMIN FRANKLIN", "MISTER SPARKY")

LEGAL_SUFFIX = {
    "INC", "INCORPORATED", "LLC", "L", "C", "CORP", "CORPORATION", "CO", "COMPANY", "LTD",
    "LIMITED", "LP", "LLP", "PC", "PLLC", "PLC", "THE", "LLLP", "PA", "PSC",
}
GENERIC_TOKENS = {
    "PLUMBING", "HEATING", "AIR", "CONDITIONING", "COOLING", "ELECTRIC", "ELECTRICAL",
    "SERVICES", "SERVICE", "HOME", "AND", "OF", "CONTRACTORS", "CONTRACTOR", "CONTRACTING",
    "MECHANICAL", "SYSTEMS", "SOLUTIONS", "GROUP", "TECHNOLOGIES", "TECHNOLOGY", "TECH",
    "SCIENTIFIC", "SUPPLY", "ENERGY", "ENTERPRISES", "HVAC", "COMFORT", "INDOOR", "TOTAL",
    "SONS", "SON", "BROTHERS", "BROS", "CONSULTING", "MANAGED", "IT", "LEGAL", "BILLING",
    "LAB", "LABORATORY", "EQUIPMENT", "CORPORATION", "INC", "LLC", "CO", "COMPANY", "NEW",
    "ENGLAND", "THE", "A", "AT", "BY", "FOR", "IN", "ON", "DBA", "INCL", "FORMER",
    "HOLDINGS", "HOLDING", "ACQUISITION", "ACQUISITIONS",
}
BUSINESS_WORDS = GENERIC_TOKENS | LEGAL_SUFFIX | {
    "ASSOCIATES", "PARTNERS", "INDUSTRIES", "HOLDINGS", "INTERNATIONAL", "NETWORKS", "DATA",
    "COMPUTER", "COMPUTERS", "SOFTWARE", "DIGITAL", "MEDIA", "COMMUNICATIONS", "STRATEGIES",
    "RESEARCH", "APPAREL", "CLOTHING", "DESIGN", "DESIGNS", "BUILDERS", "CONSTRUCTION",
    "INSTALLATIONS", "INSTALLATION", "PUMP", "UTILITY", "UTILITIES", "SIGNAL", "POWER",
    "SOLAR", "CONTROLS", "WIRING", "LIGHTING", "SECURITY", "PIPING", "DRAIN", "SEWER",
    "WATER", "EXCAVATING", "EXCAVATION", "PAVING", "SITE", "WORK", "WORKS", "CHEMICAL",
    "CHEMICALS", "MEDICAL", "SURGICAL", "DENTAL", "SALES", "DISTRIBUTION", "DISTRIBUTORS",
    "IMPORTS", "TRADING", "FASHION", "FASHIONS", "SWIM", "WEAR", "STUDIO", "AGENCY", "PR",
    "PUBLIC", "RELATIONS", "AFFAIRS", "MARKETING", "LAW", "INFORMATION", "CLOUD", "CYBER",
    "NETWORK", "SUPPORT", "SPECIALISTS", "PROFESSIONALS", "PROS", "PRO", "EXPRESS", "USA",
    "AMERICA", "AMERICAN", "NATIONAL", "GLOBAL", "UNLIMITED", "MANAGEMENT", "PROPERTIES",
}

# ---------------------------------------------------------------- helpers
_nonalnum = re.compile(r"[^A-Z0-9 ]+")
_ws = re.compile(r"\s+")
_dba = re.compile(r"\b(?:D\s*/?\s*B\s*/?\s*A|DOING BUSINESS AS|A\s*/?\s*K\s*/?\s*A|T\s*/\s*A)\b")


def split_dba(name):
    """Return (legal, dba) parts of a borrower name, as released (trimmed)."""
    s = name or ""
    m = _dba.search(s.upper())
    if not m:
        return s.strip(), ""
    return s[: m.start()].strip(" ,;-"), s[m.end():].strip(" ,;-:")


def norm_tokens(s):
    s = (s or "").upper().replace("&", " AND ").replace("+", " AND ")
    s = s.replace("'", "")
    s = _nonalnum.sub(" ", s)
    toks = _ws.sub(" ", s).strip().split(" ")
    toks = [t for t in toks if t]
    while toks and toks[-1] in LEGAL_SUFFIX:
        toks.pop()
    if toks and toks[0] == "THE":
        toks = toks[1:]
    return toks


def norm_name(s):
    return " ".join(norm_tokens(s))


def compact(s):
    return norm_name(s).replace(" ", "")


def zip5(*vals):
    for v in vals:
        d = re.sub(r"[^0-9]", "", v or "")
        if not d or set(d) == {"0"}:
            continue
        if len(d) in (4, 8):
            d = "0" + d
        if len(d) >= 5:
            return d[:5]
        if len(d) == 3:  # damaged; skip
            continue
    return ""


def iso_date(s):
    s = (s or "").strip()
    if not s:
        return ""
    if re.match(r"\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return "%s-%02d-%02d" % (m.group(3), int(m.group(1)), int(m.group(2)))
    return s


def fnum(s):
    try:
        return float((s or "").replace(",", "").strip())
    except ValueError:
        return 0.0


def inum(s):
    try:
        return int(round(float((s or "").strip())))
    except ValueError:
        return 0


def haversine(lat1, lon1, lat2, lon2):
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_zcta(path):
    pts = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        first = f.readline()
        sep = "|" if "|" in first else "\t"
        hdr = [h.strip() for h in first.split(sep)]
        iz, ila, ilo = hdr.index("GEOID"), hdr.index("INTPTLAT"), hdr.index("INTPTLONG")
        for line in f:
            p = line.rstrip("\n").split(sep)
            try:
                pts[p[iz].strip()] = (float(p[ila]), float(p[ilo]))
            except (ValueError, IndexError):
                pass
    z3 = defaultdict(list)
    for z, (la, lo) in pts.items():
        z3[z[:3]].append((la, lo))
    z3c = {k: (sum(a for a, _ in v) / len(v), sum(b for _, b in v) / len(v)) for k, v in z3.items()}
    return pts, z3c


# worker globals
G = {}


def _init_worker(zcta_path):
    G["zcta"], G["z3"] = load_zcta(zcta_path)
    G["hubs"] = {k: G["zcta"].get(z, (la, lo)) for k, (z, la, lo) in PP_HUBS.items()}


def geo_for(z):
    """(lat, lon, basis) for a ZIP5 using ZCTA centroid, else ZIP3 mean."""
    if not z:
        return None
    p = G["zcta"].get(z)
    if p:
        return (p[0], p[1], "zcta")
    p = G["z3"].get(z[:3])
    if p:
        return (p[0], p[1], "zip3")
    return None


def naics_segments(naics):
    out = []
    for seg in SEG_ORDER:
        c = SEGMENTS[seg]
        if naics in c["naics"] or (c.get("naics_prefix") and naics.startswith(c["naics_prefix"])):
            out.append(seg)
    return out


def geo_match(seg, state, z):
    """Return (match, info) where info is (dist, hub, basis) for pp."""
    c = SEGMENTS[seg]
    if c["geo"] == "us":
        return True, None
    if c["geo"] == "new_england":
        return state in NEW_ENGLAND, None
    # pp radius
    if state not in PP_STATES:
        return False, None
    g = geo_for(z)
    if not g:
        return None, None  # unresolved
    best = None
    for hub, (la, lo) in G["hubs"].items():
        d = haversine(g[0], g[1], la, lo)
        if best is None or d < best[0]:
            best = (d, hub, g[2])
    return best[0] <= c["radius_mi"], best


# ---------------------------------------------------------------- PPP pass (per file, in workers)
PPP_KEEP = ["LoanNumber", "DateApproved", "ProcessingMethod", "BorrowerName", "BorrowerAddress",
            "BorrowerCity", "BorrowerState", "BorrowerZip", "LoanStatus", "LoanStatusDate",
            "CurrentApprovalAmount", "FranchiseName", "BusinessAgeDescription", "JobsReported",
            "NAICSCode", "BusinessType", "OriginatingLender", "ServicingLenderName", "NonProfit",
            "ForgivenessAmount", "ProjectZip", "ProjectCountyName"]


def ppp_worker(args):
    path, tmpdir = args
    base = os.path.basename(path)
    writers, handles = {}, {}
    out = []  # (segs, geo_info, kept-fields dict)
    rows = matched = 0
    with open(path, **ENC) as f:
        rd = csv.reader(f)
        hdr = next(rd)
        idx = {h: i for i, h in enumerate(hdr)}
        i_n, i_st, i_z, i_pz, i_ps = idx["NAICSCode"], idx["BorrowerState"], idx["BorrowerZip"], idx["ProjectZip"], idx["ProjectState"]
        for row in rd:
            rows += 1
            naics = row[i_n].strip()
            segs = naics_segments(naics)
            if not segs:
                continue
            st = row[i_st].strip().upper()
            pst = row[i_ps].strip().upper()
            z = zip5(row[i_z], row[i_pz])
            hit = []
            ginfo = None
            for seg in segs:
                ok, info = geo_match(seg, st, z)
                if ok is False and pst and pst != st:
                    # a miscoded BorrowerState (e.g. 'NV' on a Long Island ZIP): fall back to ProjectState
                    ok, info = geo_match(seg, pst, z)
                key = seg
                if ok is None:
                    key = "pp_geo_unresolved"
                elif not ok:
                    continue
                if info:
                    ginfo = info
                if key not in writers:
                    h = open(os.path.join(tmpdir, "%s__%s.csv" % (key, base)), "w", **ENC)
                    handles[key] = h
                    writers[key] = csv.writer(h)
                    writers[key].writerow(hdr)
                writers[key].writerow(row)
                if ok:
                    hit.append(seg)
            if hit:
                matched += 1
                out.append((hit, ginfo, {k: row[idx[k]] for k in PPP_KEEP}))
    for h in handles.values():
        h.close()
    return base, rows, matched, out


def _addr_key(addr):
    t = norm_tokens(addr)
    return " ".join(t[:2]) if len(t) >= 2 and t[0][:1].isdigit() else ""


def merge_same_address(bizs):
    groups = defaultdict(list)
    for bk, b in bizs.items():
        ak = _addr_key(b["addr"].most_common(1)[0][0]) if b["addr"] else ""
        if not ak or not b["zip"]:
            continue
        name = b["names"].most_common(1)[0][0]
        d = distinctive(norm_tokens(name))
        first = d[0] if d else (norm_tokens(name)[:1] or [""])[0]
        groups[(b["zip"], ak, first)].append(bk)
    n = 0
    for keys in groups.values():
        if len(keys) < 2:
            continue
        keys.sort(key=lambda k: (-bizs[k]["loans"], k))
        tgt = bizs[keys[0]]
        for k in keys[1:]:
            src = bizs.pop(k)
            for f in ("names", "dbas", "addr", "city", "state", "naics", "btype", "draws", "franchise",
                      "lender", "age", "status"):
                tgt[f].update(src[f])
            tgt["jobs"] = max(tgt["jobs"], src["jobs"])
            tgt["amount"] += src["amount"]
            tgt["loans"] += src["loans"]
            tgt["forgiven"] += src["forgiven"]
            tgt["loan_numbers"] += src["loan_numbers"]
            tgt["segs"] |= src["segs"]
            tgt["nonprofit"] = tgt["nonprofit"] or src["nonprofit"]
            for f, fn in (("first_date", min), ("last_date", max)):
                vals = [v for v in (tgt[f], src[f]) if v]
                tgt[f] = fn(vals) if vals else ""
            if src["geo"] and (tgt["geo"] is None or src["geo"][0] < tgt["geo"][0]):
                tgt["geo"] = src["geo"]
            n += 1
    return n


# ---------------------------------------------------------------- SBA pass
SBA_KEEP = ["Program", "BorrName", "BorrStreet", "BorrCity", "BorrState", "BorrZip", "GrossApproval",
            "ApprovalDate", "ApprovalFY", "NaicsCode", "NaicsDescription", "FranchiseName",
            "BusinessType", "BusinessAge", "LoanStatus", "PaidInFullDate", "ChargeOffDate",
            "GrossChargeOffAmount", "JobsSupported", "BankName", "CDC_Name", "ProcessingMethod",
            "TermInMonths", "ProjectCounty"]


def sba_status_text(s):
    s = (s or "").strip().upper().replace(" ", "")
    return {
        "PIF": "paid in full",
        "CHGOFF": "charged off",
        "EXEMPT": "still open (disbursed; detail withheld under FOIA Exemption 4)",
        "CANCLD": "cancelled",
        "COMMIT": "approved, not yet disbursed",
        "NOTFUNDED": "approved, not yet disbursed",
        "CLOSED": "closed (legacy status)",
    }.get(s, s.lower() or "unknown")


class SBAWriter:
    """Writes rows in the SBA 7(a)/504 FOIA file style: non-empty values quoted, empty values bare, LF endings."""

    def __init__(self, fh):
        self.fh = fh

    def writerow(self, row):
        self.fh.write(",".join(('"%s"' % v.replace('"', '""')) if v != "" else "" for v in row) + "\n")


def sba_worker(args):
    path, tmpdir, link_keys = args
    base = os.path.basename(path)
    program = "504" if "504" in base.split("_")[1] else "7a"
    writers, handles = {}, {}
    seg_rows = []   # (segs, kept)
    linked = []     # (bizkey, method, kept)
    rows = 0
    zip_keys, city_keys, city_index = link_keys
    with open(path, **ENC) as f:
        rd = csv.reader(f)
        hdr = next(rd)
        idx = {h: i for i, h in enumerate(hdr)}
        for row in rd:
            rows += 1
            naics = row[idx["NaicsCode"]].strip()
            st = row[idx["BorrState"]].strip().upper()
            z = zip5(row[idx["BorrZip"]])
            kept = {k: (row[idx[k]] if k in idx else "") for k in SBA_KEEP}
            kept["_program"] = program
            kept["_file"] = base
            segs = naics_segments(naics)
            hit = []
            for seg in segs:
                ok, info = geo_match(seg, st, z)
                key = seg if ok else ("pp_geo_unresolved" if ok is None else None)
                if key is None:
                    continue
                wkey = "%s_%s" % (program, key)
                if wkey not in writers:
                    h = open(os.path.join(tmpdir, "sba%s__%s.csv" % (wkey, base)), "w", **ENC)
                    handles[wkey] = h
                    writers[wkey] = SBAWriter(h)
                    writers[wkey].writerow(hdr)
                writers[wkey].writerow(row)
                if ok:
                    hit.append(seg)
                    if info:
                        kept["_geo"] = info
            if hit:
                seg_rows.append((hit, kept))
            # link to PPP businesses regardless of the SBA loan's own NAICS
            legal, _ = split_dba(row[idx["BorrName"]])
            cn = compact(legal)
            cfull = compact(row[idx["BorrName"]])
            city = norm_name(row[idx["BorrCity"]])
            bk = None
            method = ""
            for c in (cn, cfull):
                if c and (c + "|" + z) in zip_keys:
                    bk, method = zip_keys[c + "|" + z], "name+zip"
                    break
            if not bk:
                for c in (cn, cfull):
                    k = c + "|" + city + "|" + st
                    if c and k in city_keys:
                        bk, method = city_keys[k], "name+city"
                        break
            if not bk and cn and len(cn) >= 6:
                cands = city_index.get(city + "|" + st)
                if cands:
                    best = None
                    for cc, key in cands:
                        if cc[:3] != cn[:3]:
                            continue
                        r = difflib.SequenceMatcher(None, cn, cc).ratio()
                        if r >= 0.9 and (best is None or r > best[0]):
                            best = (r, key)
                    if best:
                        bk, method = best[1], "fuzzy name+city (%.2f)" % best[0]
            if bk:
                linked.append((bk, method, kept))
    for h in handles.values():
        h.close()
    return base, program, rows, seg_rows, linked


# ---------------------------------------------------------------- business aggregation
def new_biz():
    return {"names": Counter(), "dbas": Counter(), "addr": Counter(), "city": Counter(),
            "state": Counter(), "zip": "", "naics": Counter(), "btype": Counter(),
            "jobs": 0, "amount": 0.0, "loans": 0, "first_date": "", "last_date": "",
            "draws": Counter(), "franchise": Counter(), "lender": Counter(), "age": Counter(),
            "nonprofit": False, "forgiven": 0.0, "loan_numbers": [], "segs": set(),
            "geo": None, "status": Counter(), "sba": [], "source": "ppp"}


def add_ppp(b, segs, ginfo, k):
    legal, dba = split_dba(k["BorrowerName"])
    b["names"][legal.strip()] += 1
    if dba:
        b["dbas"][dba] += 1
    b["addr"][k["BorrowerAddress"].strip()] += 1
    b["city"][k["BorrowerCity"].strip().title()] += 1
    b["state"][k["BorrowerState"].strip().upper()] += 1
    b["naics"][k["NAICSCode"].strip()] += 1
    if k["BusinessType"].strip():
        b["btype"][k["BusinessType"].strip()] += 1
    b["jobs"] = max(b["jobs"], inum(k["JobsReported"]))
    b["amount"] += fnum(k["CurrentApprovalAmount"])
    b["loans"] += 1
    d = iso_date(k["DateApproved"])
    if d and (not b["first_date"] or d < b["first_date"]):
        b["first_date"] = d
    if d and d > b["last_date"]:
        b["last_date"] = d
    b["draws"][k["ProcessingMethod"].strip()] += 1
    if k["FranchiseName"].strip():
        b["franchise"][k["FranchiseName"].strip()] += 1
    lender = k["OriginatingLender"].strip() or k["ServicingLenderName"].strip()
    if lender:
        b["lender"][lender] += 1
    if k["BusinessAgeDescription"].strip():
        b["age"][k["BusinessAgeDescription"].strip()] += 1
    if k["NonProfit"].strip().upper() in ("Y", "YES", "TRUE"):
        b["nonprofit"] = True
    b["forgiven"] += fnum(k["ForgivenessAmount"])
    b["loan_numbers"].append(k["LoanNumber"].strip())
    b["status"][k["LoanStatus"].strip()] += 1
    b["segs"].update(segs)
    if ginfo and (b["geo"] is None or ginfo[0] < b["geo"][0]):
        b["geo"] = ginfo


def sba_record(kept, method=""):
    return {
        "program": "504" if kept["_program"] == "504" else "7(a)",
        "date": iso_date(kept["ApprovalDate"]),
        "fy": kept["ApprovalFY"].strip(),
        "amount": fnum(kept["GrossApproval"]),
        "status_code": kept["LoanStatus"].strip(),
        "status": sba_status_text(kept["LoanStatus"]),
        "paid_in_full": iso_date(kept["PaidInFullDate"]),
        "charge_off": iso_date(kept["ChargeOffDate"]),
        "jobs_supported": inum(kept["JobsSupported"]),
        "business_age": kept["BusinessAge"].strip(),
        "naics": kept["NaicsCode"].strip(),
        "franchise": kept["FranchiseName"].strip(),
        "lender": (kept.get("BankName") or kept.get("CDC_Name") or "").strip(),
        "borr_name": kept["BorrName"].strip(),
        "borr_city": kept["BorrCity"].strip(),
        "borr_state": kept["BorrState"].strip(),
        "borr_zip": zip5(kept["BorrZip"]),
        "business_type": kept["BusinessType"].strip(),
        "link": method,
        "file": kept["_file"],
    }


# ---------------------------------------------------------------- existing lists / PE flags
def load_reference(repo):
    rd = os.path.join(repo, "data", "research")
    lists = {}

    def alts(company):
        s = company or ""
        parts = re.split(r"\s*/\s*|\(|\)|\bd/b/a\b|\bdba\b|\bincl\.|\bformer\b|;|,\s*(?=[A-Z][a-z]+ [A-Z])", s,
                         flags=re.I)
        out = {norm_name(p) for p in parts if p and len(norm_name(p)) >= 3}
        out.add(norm_name(s))
        return [a for a in out if a]

    def add(seg, item):
        lists.setdefault(seg, []).append({
            "id": item.get("id"), "company": item.get("company"),
            "state": (item.get("state") or "").upper(),
            "city": norm_name(item.get("hq_city") or ""),
            "alts": alts(item.get("company")),
            "lat": item.get("lat"), "lon": item.get("lon"),
            "ownership": item.get("ownership"),
        })

    for seg, fn in (("pp", "ma_targets_pp.json"), ("cet", "ma_targets_cet.json")):
        p = os.path.join(rd, fn)
        if os.path.exists(p):
            for it in json.load(open(p)).get("items", []):
                add(seg, it)
    p = os.path.join(rd, "ma_targets_fl_ts.json")
    if os.path.exists(p):
        for it in json.load(open(p)).get("items", []):
            seg = "fl" if (it.get("platform") == "frontline" or str(it.get("id", "")).startswith("fl")) else "ts"
            add(seg, it)

    pe = []
    for fn in ("ma_targets_pp.json", "ma_targets_cet.json"):
        p = os.path.join(rd, fn)
        if not os.path.exists(p):
            continue
        m = json.load(open(p)).get("meta", {})
        for s in m.get("excluded_pe_or_strategic_owned", []) or []:
            nm = re.sub(r"\(.*?\)", "", s)
            owner = (re.search(r"\((.*?)\)", s) or [None, "PE or strategic owner"])[1]
            pe.append((norm_name(nm), owner))
        for c in m.get("pe_backed_competitors", []) or []:
            owner = c.get("sponsor") or c.get("owner") or "PE sponsor"
            for nm in [c.get("platform"), c.get("company")] + list(c.get("regional_holdings") or []):
                if nm:
                    pe.append((norm_name(re.sub(r"\(.*?\)", "", nm)), owner))
    pe = [(n, o) for n, o in pe if len(n) >= 5]
    return lists, pe


def distinctive(tokens):
    return [t for t in tokens if t not in GENERIC_TOKENS and len(t) > 1]


def distinct_compact(tokens):
    return "".join(t for t in tokens if t not in GENERIC_TOKENS)


def match_existing(seg_lists, name_variants, state, city, zip_):
    """Conservative match of a business to a hand-built list item (same state).

    3: identical compact names (if the name is all generic words, it must also be within 25 miles)
    2: identical distinctive part (non-generic words), within 25 miles of the listed HQ, and
       either the same city or a broadly similar full name
    1: every distinctive word (2+ of them) of the list name appears in the name, within 25 miles; or, in the same
       city or within 10 miles, every distinctive word (1+) of one name appears in the other and the full names are
       broadly similar (SequenceMatcher >= 0.6; catches 'LAURY HEATING COLLING' / 'Laury Heating Cooling' and
       'OFF HEATING' / 'Timothy Off Plumbing'). Website domains are compared later,
       in scripts/build_ma_ppp_screen.py, where the enrichment supplies the company's site.
    """
    best = None
    cityn = norm_name(city)
    g = geo_for(zip_)
    for it in seg_lists:
        if it["state"] and state and it["state"] != state:
            continue
        same_city = bool(it["city"]) and (it["city"] == cityn or it["city"] in cityn or cityn in it["city"])
        if g and it.get("lat") is not None and it.get("lon") is not None:
            dmi = haversine(g[0], g[1], float(it["lat"]), float(it["lon"]))
            near, close = dmi <= 25, same_city or dmi <= 10
        else:
            near = close = same_city
        for a in it["alts"]:
            at = a.split()
            ac = a.replace(" ", "")
            ad = distinct_compact(at)
            dist = sorted(set(distinctive(at)))
            for nv in name_variants:
                nt = nv.split()
                nc = nv.replace(" ", "")
                nd = distinct_compact(nt)
                score = 0
                if ac == nc and (ad or near):
                    score = 3
                elif (ad and ad == nd and near and (same_city or (len(ad) >= 3 and
                        difflib.SequenceMatcher(None, ac, nc).ratio() >= 0.6))):
                    score = 2
                elif len(dist) >= 2 and all(t in nt for t in dist) and near:
                    score = 1
                elif (close and dist and (all(t in nt for t in dist) or
                                          (distinctive(nt) and all(t in at for t in distinctive(nt))))
                      and difflib.SequenceMatcher(None, ac, nc).ratio() >= 0.6):
                    score = 1
                if score and (best is None or score > best[0]):
                    best = (score, it)
    return best[1] if best else None


def match_pe(pe, name_variants, tok_freq=None):
    """Exact/prefix match -> (name, owner, 'listed'); distinctive-word match -> (name, owner, 'possible')."""
    for nv in name_variants:
        nc = nv.replace(" ", "")
        for n, owner in pe:
            ncmp = n.replace(" ", "")
            if ncmp == nc or (len(ncmp) >= 8 and (nc.startswith(ncmp) or ncmp.startswith(nc) and len(nc) >= 8)):
                return n, owner, "listed"
    for nv in name_variants:
        nt = set(nv.split())
        for n, owner in pe:
            d = [t for t in distinctive(n.split()) if len(t) >= 5]
            if tok_freq is not None and any(tok_freq.get(t, 0) > 5 for t in d):
                continue  # common word; too weak to suggest the same company
            if d and len(d) <= 2 and all(t in nt for t in d):
                return n, owner, "possible"
    return None


EXCLUDE_STATE = {  # names that only mean the BSP company in these states
    "PUNCTUAL PROS": {"PA"}, "HORVATH HOME SERVICES": {"NJ"}, "HORVATH HOME SERVICE": {"NJ"},
    "HORTON ELECTRICAL SERVICES": {"CT"}, "HORTON ELECTRICAL SERVICE": {"CT"}, "HORTON ELECTRIC SERVICES": {"CT"},
    "NUWAVE ENERGY SOLUTIONS": {"MA"}, "NU WAVE ENERGY SOLUTIONS": {"MA"}, "DAY ASSOCIATES": {"MA"},
    "QUINTANA SUPPLY": {"MA"}, "NORTH CENTRAL INSTRUMENTS": {"MN"}, "ARROWHEAD FORENSICS": {"KS"},
    "FAIR HARBOR": {"NY"}, "AGADO": set(), "GLASSER TECH": {"NY"},
}


def is_excluded(name_variants, addr, state):
    for nv in name_variants:
        for x in BSP_EXCLUDE_NAMES:
            if x in EXCLUDE_STATE and state not in EXCLUDE_STATE[x]:
                continue
            xn = norm_name(x)
            if nv == xn or nv.startswith(xn + " ") or (len(xn) >= 16 and xn in nv):
                return "name matches BSP company or add-on: %s" % x.title()
    a = norm_name(addr)
    for prefix, st in BSP_EXCLUDE_ADDR:
        if st == state and a.startswith(norm_name(prefix)):
            return "address matches a BSP company site (%s)" % prefix.title()
    return None


# ---------------------------------------------------------------- scoring
def has(tokens, words):
    s = " " + " ".join(tokens) + " "
    return [w for w in words if (" " + w + " ") in s]


RES_WORDS = ["HOME", "HOMES", "RESIDENTIAL", "COMFORT", "HEATING", "COOLING", "AIR", "HVAC",
             "PLUMBING", "HEAT", "INDOOR", "CLIMATE", "DRAIN", "SEWER AND DRAIN"]
COMM_WORDS = ["MECHANICAL", "INDUSTRIAL", "CONSTRUCTION", "FIRE", "SPRINKLER", "PROCESS",
              "PIPING", "PIPELINE", "COMMERCIAL", "INSTITUTIONAL", "MECHANICAL CONTRACTORS",
              "BUILDERS", "DESIGN BUILD", "SHEET METAL", "WELDING", "GEOTHERMAL DRILLING",
              "COOLING TOWER", "REFRIGERATION", "BUILDING", "CONTROLS", "TOWER"]
CET_CAP = ["ELECTRIC", "ELECTRICAL", "ENERGY", "SOLAR", "POWER", "UTILITY", "UTILITIES", "LINE",
           "SIGNAL", "CONTROLS", "GENERATOR", "GENERATORS", "EV", "CHARGING", "LIGHTING", "SUBSTATION"]
CET_LV = ["SECURITY", "ALARM", "ALARMS", "CABLING", "CABLE", "TELECOM", "TELECOMMUNICATIONS", "AUDIO",
          "VIDEO", "DATA", "COMMUNICATIONS", "SOUND", "INTEGRATION", "THEATER", "NETWORK", "NETWORKS",
          "FIBER", "FIRE ALARM", "TECHNOLOGIES"]
CET_WATER = ["PUMP", "PUMPS", "SEWER", "WATER", "WASTEWATER", "UTILITY", "UTILITIES", "PIPELINE",
             "DRAIN", "DRAINAGE", "WELL", "WELLS", "TREATMENT"]
FL_STRONG = ["LEGAL", "LAW", "LAWYER", "LAWYERS", "ATTORNEY", "ATTORNEYS", "LITIGATION", "COUNSEL",
             "EDISCOVERY", "E DISCOVERY", "PARALEGAL", "LEGALTECH", "LAWTECH", "LAWFIRM",
             "DOCKET", "BARRISTER", "JURIS", "LEGALWORKS"]
FL_WEAK = ["DISCOVERY", "LEX", "LEXIS", "CASE", "COURT", "JUSTICE"]
FL_LAWFIRM = ["LAW GROUP", "LAW OFFICE", "LAW OFFICES", "LAW FIRM", "ATTORNEYS AT LAW", "APC", "ESQ",
              "ATTORNEY AT LAW", "LAW CENTER", "INJURY", "LAW PLLC", "LAW PC", "LAW LLC"]
TS_STRONG = ["SCIENTIFIC", "LABWARE", "CLEANROOM", "CLEAN ROOM", "BIOPRODUCTS", "BIOSCIENCE", "BIOSCIENCES",
             "LIFE SCIENCE", "LIFE SCIENCES", "REAGENT", "REAGENTS", "ANALYTICAL", "MICROSCOPE",
             "MICROSCOPES", "MICROSCOPY", "CHROMATOGRAPHY", "PIPETTE", "PIPETTES", "CONTAMINATION CONTROL",
             "LAB SUPPLY", "LAB SUPPLIES", "LABORATORY SUPPLY", "LABORATORY SUPPLIES", "LAB EQUIPMENT",
             "LABORATORY EQUIPMENT", "LAB ACCESSORIES", "LABORATORY TRADING"]
TS_INSTR = ["INSTRUMENTS", "INSTRUMENT", "LAB", "LABS", "LABORATORY", "LABORATORIES", "SCIENCE", "SCIENCES",
            "BIOTECH", "SPECTRO"]  # count only under NAICS 423490 (lab and other professional equipment)
TS_WEAK = ["CHEMICAL", "CHEMICALS", "CHEMISTRY", "SAFETY", "SUPPLY", "SUPPLIES", "TECHNICAL"]
TS_NEG = ["DENTAL", "VETERINARY", "PHARMACY", "HOME MEDICAL", "MOBILITY", "WHEELCHAIR", "ORTHOPEDIC",
          "HEARING", "OPTICAL", "BEAUTY", "COSMETIC", "OXYGEN", "DURABLE MEDICAL", "DME", "POOL",
          "JANITORIAL", "FERTILIZER", "AGRI", "FARM", "PAINT", "FUEL", "PETROLEUM", "PROPANE",
          "RESPIRATORY", "PROSTHETIC", "PROSTHETICS", "SURGICAL", "SLEEP", "PATHOLOGY", "MEDICAL GROUP",
          "CLINIC", "BIOMEDICAL", "BIO MEDICAL", "NUCLEAR", "IMAGING", "X RAY", "RADIOLOGY", "HOSPITAL",
          "AMBULANCE", "CAR WASH", "LAUNDRY", "HEALTHCARE", "HEALTH CARE", "PHYSICIANS", "PC", "ORTHOTIC",
          "ORTHOTICS", "OPTICAL LAB", "DENTAL LAB", "PODIATRY"]
BPI_STRONG = ["PUBLIC AFFAIRS", "STRATEGIES", "STRATEGIC", "ADVOCACY", "GOVERNMENT", "POLICY",
              "CAMPAIGN", "CAMPAIGNS", "POLITICAL", "CIVIC", "PUBLIC STRATEGIES", "GOVERNMENT RELATIONS",
              "ISSUES", "STRATEGY", "PUBLIC POLICY", "COALITION", "COALITIONS"]
BPI_WEAK = ["COMMUNICATIONS", "MEDIA", "MESSAGE", "MESSAGING", "CONSULTING", "PARTNERS", "GROUP", "IMPACT"]
BPI_POLL = ["POLL", "POLLING", "POLLSTER", "OPINION", "PUBLIC OPINION", "POLITICAL", "CIVIC",
            "STRATEGY GROUP", "PUBLIC RESEARCH", "VOTER", "ELECTION"]
FH_POS = ["SWIM", "SWIMWEAR", "SURF", "BOARDSHORTS", "BOARDSHORT", "BEACH", "CLOTHING", "OUTFITTERS",
          "BRAND", "BRANDS", "LIFESTYLE", "SPORTSWEAR", "ACTIVEWEAR", "COLLECTION", "SUPPLY",
          "APPAREL", "THREADS", "WEAR", "GOODS", "OUTDOOR", "OUTDOORS", "SPORTS", "CO"]
FH_NEG = ["SEWING", "SEW", "CUT AND SEW", "CONTRACT", "EMBROIDERY", "SCREEN", "SCREENPRINTING",
          "PRINTING", "PRINT", "UNIFORM", "UNIFORMS", "TEXTILE", "TEXTILES", "KNITTING", "MILLS", "MILL",
          "MANUFACTURING", "FACTORY", "GARMENT", "LAUNDRY", "DYE", "DYEING", "FABRIC", "FABRICS",
          "INDUSTRIES", "PROMOTIONAL", "PROMOTIONS", "TRADING", "IMPORT", "IMPORTS", "EXPORT",
          "BRIDAL", "LINGERIE", "HOSIERY", "SOCKS", "TAILOR", "TAILORING", "ALTERATIONS", "LEATHER",
          "FUR", "COSTUME", "COSTUMES", "SAFETY", "WORKWEAR", "MEDICAL", "SCRUBS"]
BIG_LOW_VOLTAGE_ONLY = set(CET_LV)
SOLE_TYPES = {"Sole Proprietorship", "Self-Employed Individuals", "Independent Contractors", "Individual"}
_LEGAL_RE = re.compile(r"\b(INC|INCORPORATED|LLC|L\.L\.C|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|PC|PLLC|PA|PSC|LLLP)\b\.?", re.I)


def person_named(tokens, btype, raw=""):
    if btype in SOLE_TYPES:
        return True
    if raw and _LEGAL_RE.search(raw):
        return False
    if not tokens or len(tokens) > 4:
        return False
    if any(t in BUSINESS_WORDS for t in tokens):
        return False
    if any(t.isdigit() for t in tokens):
        return False
    return 2 <= len(tokens) <= 4 and all(len(t) >= 1 for t in tokens)


def jobs_fit(j, band):
    lo, hi = band
    if not (lo <= j <= hi):
        return None
    mid = math.sqrt(lo * hi)
    span = math.log(hi / mid)
    return max(8.0, 30.0 * (1 - abs(math.log(j / mid)) / span * 0.75))


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ppp-dir", required=True)
    ap.add_argument("--sba-dir", required=True)
    ap.add_argument("--zcta", required=True, help="Census ZCTA gazetteer text file")
    ap.add_argument("--export-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--cid-map", default="", help="JSON map biz_key->cid, read and updated for stable ids")
    ap.add_argument("--workers", type=int, default=max(1, min(8, (os.cpu_count() or 2) - 1)))
    a = ap.parse_args()

    os.makedirs(a.export_dir, exist_ok=True)
    tmpdir = os.path.join(a.export_dir, "_parts")
    os.makedirs(tmpdir, exist_ok=True)
    for f in glob.glob(os.path.join(tmpdir, "*.csv")):
        os.remove(f)

    ppp_files = sorted(glob.glob(os.path.join(a.ppp_dir, "public_*.csv")))
    sba_files = sorted(glob.glob(os.path.join(a.sba_dir, "FOIA_7a_*.csv")) +
                       glob.glob(os.path.join(a.sba_dir, "FOIA_504_*.csv")))
    if not ppp_files:
        sys.exit("no PPP files in %s" % a.ppp_dir)
    log = lambda *x: print(*x, file=sys.stderr, flush=True)
    log("PPP files:", len(ppp_files), "SBA files:", len(sba_files))

    _init_worker(a.zcta)
    ctx = mp.get_context("spawn")

    # ---- PPP pass
    bizs = {}
    counts = {s: Counter() for s in SEG_ORDER}
    total_rows = 0
    with ctx.Pool(a.workers, initializer=_init_worker, initargs=(a.zcta,)) as pool:
        for base, rows, matched, out in pool.imap_unordered(ppp_worker, [(p, tmpdir) for p in ppp_files]):
            total_rows += rows
            log("  %s rows=%d matched=%d" % (base, rows, matched))
            for segs, ginfo, k in out:
                legal, _ = split_dba(k["BorrowerName"])
                z = zip5(k["BorrowerZip"], k["ProjectZip"])
                ck = compact(legal) or compact(k["BorrowerName"])
                bk = ck + "|" + z
                b = bizs.get(bk)
                if b is None:
                    b = bizs[bk] = new_biz()
                    b["zip"] = z
                add_ppp(b, segs, ginfo, k)
                for s in segs:
                    counts[s]["ppp_rows_matched"] += 1

    # second dedupe pass: same ZIP + same street number/name + same first distinctive name word
    merged_n = merge_same_address(bizs)
    log("  merged %d name variants at the same address" % merged_n)

    # merge PPP export parts
    def merge_parts(prefix, dest):
        """Concatenate per-file parts byte for byte (one header). Returns the data-row count."""
        parts = sorted(glob.glob(os.path.join(tmpdir, prefix + "__*.csv")))
        n = 0
        with open(dest, "wb") as out:
            for i, p in enumerate(parts):
                with open(p, **ENC) as f:
                    n += sum(1 for _ in csv.reader(f)) - 1
                with open(p, "rb") as f:
                    head = f.readline()
                    if i == 0:
                        out.write(head)
                    while True:
                        chunk = f.read(1 << 20)
                        if not chunk:
                            break
                        out.write(chunk)
                os.remove(p)
        return n

    export_files = {}
    for s in SEG_ORDER + ["pp_geo_unresolved"]:
        dest = os.path.join(a.export_dir, "ppp_%s.csv" % s)
        n = merge_parts(s, dest)
        export_files["ppp_%s.csv" % s] = n
    counts["pp"]["ppp_rows_geo_unresolved"] = export_files["ppp_pp_geo_unresolved.csv"]

    # ---- SBA pass: build link keys from PPP businesses
    zip_keys, city_keys, city_index = {}, {}, defaultdict(list)
    for bk, b in bizs.items():
        ck = bk.split("|")[0]
        zip_keys[bk] = bk
        st = b["state"].most_common(1)[0][0]
        city = norm_name(b["city"].most_common(1)[0][0])
        city_keys.setdefault(ck + "|" + city + "|" + st, bk)
        city_index[city + "|" + st].append((ck, bk))
        for d in b["dbas"]:
            cd = compact(d)
            if cd:
                zip_keys.setdefault(cd + "|" + b["zip"], bk)
    link_keys = (zip_keys, city_keys, dict(city_index))

    sba_only = {}
    sba_asof = set()
    with ctx.Pool(min(a.workers, max(1, len(sba_files))), initializer=_init_worker, initargs=(a.zcta,)) as pool:
        res = pool.imap_unordered(sba_worker, [(p, tmpdir, link_keys) for p in sba_files])
        for base, program, rows, seg_rows, linked in res:
            m = re.search(r"asof_(\d{6})", base)
            if m:
                sba_asof.add(m.group(1))
            log("  %s rows=%d segment rows=%d linked=%d" % (base, rows, len(seg_rows), len(linked)))
            linked_ids = set()
            for bk, method, kept in linked:
                rec = sba_record(kept, method)
                key = (kept["_file"], kept["BorrName"], kept["ApprovalDate"], kept["GrossApproval"])
                if key in linked_ids:
                    continue
                linked_ids.add(key)
                bizs[bk]["sba"].append(rec)
            for segs, kept in seg_rows:
                for s in segs:
                    counts[s]["sba_%s_rows_matched" % program] += 1
                key = (kept["_file"], kept["BorrName"], kept["ApprovalDate"], kept["GrossApproval"])
                if key in linked_ids:
                    continue
                legal, dba = split_dba(kept["BorrName"])
                z = zip5(kept["BorrZip"])
                bk = (compact(legal) or compact(kept["BorrName"])) + "|" + z
                if bk in bizs:  # same key, linked in another file pass
                    bizs[bk]["sba"].append(sba_record(kept, "name+zip"))
                    bizs[bk]["segs"].update(segs)
                    continue
                b = sba_only.get(bk)
                if b is None:
                    b = sba_only[bk] = new_biz()
                    b["zip"] = z
                    b["source"] = "sba_only"
                b["names"][legal] += 1
                if dba:
                    b["dbas"][dba] += 1
                b["addr"][kept["BorrStreet"].strip()] += 1
                b["city"][kept["BorrCity"].strip().title()] += 1
                b["state"][kept["BorrState"].strip().upper()] += 1
                b["naics"][kept["NaicsCode"].strip()] += 1
                if kept["BusinessType"].strip():
                    b["btype"][kept["BusinessType"].strip().title()] += 1
                if kept["FranchiseName"].strip():
                    b["franchise"][kept["FranchiseName"].strip()] += 1
                b["segs"].update(segs)
                g = kept.get("_geo")
                if g and (b["geo"] is None or g[0] < b["geo"][0]):
                    b["geo"] = g
                b["sba"].append(sba_record(kept, "segment match (no PPP loan found)"))
    for s in SEG_ORDER + ["pp_geo_unresolved"]:
        for prog in ("7a", "504"):
            dest = os.path.join(a.export_dir, "sba%s_%s.csv" % (prog, s))
            export_files["sba%s_%s.csv" % (prog, s)] = merge_parts("sba%s_%s" % (prog, s), dest)
    try:
        os.rmdir(tmpdir)
    except OSError:
        pass
    # SBA-only businesses whose key collides with each other across files are already merged
    for bk, b in sba_only.items():
        bizs[bk] = b

    # ---- reference lists
    lists, pe = load_reference(a.repo)
    asof = max(sba_asof) if sba_asof else ""
    asof_iso = ("20%s-%s-%s" % (asof[:2], asof[2:4], asof[4:6])) if asof else ""
    coo_recent_cut = ""
    if asof_iso:
        y = int(asof_iso[:4]) - 3
        coo_recent_cut = "%d%s" % (y, asof_iso[4:])

    cidmap = {}
    if a.cid_map and os.path.exists(a.cid_map):
        cidmap = json.load(open(a.cid_map))
    next_n = Counter()
    for k, v in cidmap.items():
        seg, n = v.rsplit("-", 1)
        next_n[seg] = max(next_n[seg], int(n))

    # ---- finalize business records per segment
    records = {s: [] for s in SEG_ORDER}
    excluded = {s: [] for s in SEG_ORDER}
    tok_freq = Counter()
    for b in bizs.values():
        for t in set(t for n in b["names"] for t in norm_tokens(n)):
            tok_freq[t] += 1
    for bk, b in bizs.items():
        name = b["names"].most_common(1)[0][0] if b["names"] else ""
        alt_names = [html.unescape(n) for n in b["names"] if n != name]
        dba = html.unescape(b["dbas"].most_common(1)[0][0]) if b["dbas"] else ""
        name = html.unescape(name)
        state = b["state"].most_common(1)[0][0] if b["state"] else ""
        city = b["city"].most_common(1)[0][0] if b["city"] else ""
        addr = b["addr"].most_common(1)[0][0] if b["addr"] else ""
        variants = {norm_name(n) for n in b["names"]} | {norm_name(d) for d in b["dbas"]}
        variants.discard("")
        btype = b["btype"].most_common(1)[0][0] if b["btype"] else ""
        sba = sorted(b["sba"], key=lambda r: (r["date"], r["amount"]))
        latest = sba[-1] if sba else None
        coo = [r for r in sba if r["business_age"].lower() == "change of ownership"]
        coo_date = coo[-1]["date"] if coo else ""
        vehicle = ""
        name_toks = set(t for n in b["names"] for t in norm_tokens(n))
        for r in reversed(sba):
            if (name_toks & {"HOLDINGS", "HOLDING", "ACQUISITION", "ACQUISITIONS", "ACQUISITIONCO"}
                    and r["amount"] >= 1000000 and r["status_code"].replace(" ", "") != "CANCLD"
                    and (r["business_age"].startswith("New") or r["business_age"].startswith("Startup"))):
                vehicle = r["date"]
                break
        jobs_sba = None
        for r in reversed(sba):
            if r["jobs_supported"] > 0 and r["status_code"].replace(" ", "") != "CANCLD":
                jobs_sba = r
                break
        ppp_last = b["last_date"]
        if jobs_sba and (not ppp_last or jobs_sba["date"] > ppp_last):
            jobs_latest = jobs_sba["jobs_supported"]
            jobs_src = ("SBA %s JobsSupported on loan approved %s (jobs created plus retained, "
                        "lender-reported)" % (jobs_sba["program"], jobs_sba["date"]))
        elif b["loans"]:
            jobs_latest = b["jobs"]
            jobs_src = "PPP JobsReported (borrower-reported, %s)" % (b["first_date"][:4] if b["first_date"][:4] == ppp_last[:4] else "%s-%s" % (b["first_date"][:4], ppp_last[:4]))
        else:
            jobs_latest = 0
            jobs_src = "none reported"
        exc = is_excluded(variants, addr, state)
        pe_hit = match_pe(pe, variants, tok_freq)
        franchise = b["franchise"].most_common(1)[0][0] if b["franchise"] else ""
        if not franchise and latest and latest["franchise"]:
            franchise = latest["franchise"]
        tokens = norm_tokens(name) + norm_tokens(dba)
        status_sba = Counter(r["status_code"].replace(" ", "") for r in sba)
        for seg in sorted(b["segs"], key=SEG_ORDER.index):
            rec = {
                "biz_key": bk, "segment": seg, "name": name, "dba": dba, "alt_names": alt_names[:4],
                "address": addr, "city": city, "state": state, "zip": b["zip"],
                "naics": b["naics"].most_common(1)[0][0] if b["naics"] else "",
                "naics_all": sorted(b["naics"]), "business_type": btype,
                "jobs_reported": b["jobs"], "jobs_latest": jobs_latest, "jobs_latest_source": jobs_src,
                "loan_total_usd": round(b["amount"], 2), "loans": b["loans"],
                "date_approved": b["first_date"], "ppp_last_date": ppp_last,
                "draws": dict(b["draws"]), "franchise_name": franchise,
                "ppp_lender": b["lender"].most_common(1)[0][0] if b["lender"] else "",
                "ppp_business_age": b["age"].most_common(1)[0][0] if b["age"] else "",
                "nonprofit": b["nonprofit"], "forgiven_usd": round(b["forgiven"], 2),
                "ppp_loan_numbers": b["loan_numbers"],
                "source": "sba_only" if b["source"] == "sba_only" else ("ppp+sba" if sba else "ppp"),
                "sba_loans": len(sba),
                "sba_latest_loan": ("%s, %s, $%s, %s" % (latest["program"], latest["date"],
                                    format(int(latest["amount"]), ","), latest["status"])) if latest else "",
                "sba_latest_date": latest["date"] if latest else "",
                "sba_latest_amount": latest["amount"] if latest else None,
                "sba_latest_status": latest["status"] if latest else "",
                "sba_latest_jobs_supported": latest["jobs_supported"] if latest else None,
                "sba_latest_business_age": latest["business_age"] if latest else "",
                "sba_link_method": latest["link"] if latest else "",
                "sba_charged_off": status_sba.get("CHGOFF", 0) > 0,
                "sba_detail": [{k: r[k] for k in ("program", "date", "amount", "status", "jobs_supported",
                                                  "business_age", "naics", "lender", "link")} for r in sba][-6:],
                "change_of_ownership": coo_date,
                "change_of_ownership_recent": bool(coo_date and coo_recent_cut and coo_date >= coo_recent_cut),
                "possible_acquisition_vehicle": vehicle,
                "person_named": person_named(norm_tokens(name), btype, name),
                "pe_backed_flag": (("%s (%s)" if pe_hit[2] == "listed" else "possible: name resembles %s (%s); check")
                                   % (pe_hit[0].title(), pe_hit[1][:60])) if pe_hit and seg in ("pp", "cet") else "",
                "on_existing_list": "",
                "ownership": "unverified",
            }
            if b["geo"]:
                rec["dist_mi"] = round(b["geo"][0], 1)
                rec["nearest_hub"] = b["geo"][1]
                rec["geo_basis"] = "ZIP centroid" if b["geo"][2] == "zcta" else "ZIP3 average centroid"
            if btype == "Employee Stock Ownership Plan(ESOP)":
                rec["ownership"] = "esop"
            if exc:
                rec["excluded_reason"] = exc
                excluded[seg].append(rec)
                continue
            hit = match_existing(lists.get(seg, []), variants, state, city, b["zip"])
            if hit:
                rec["on_existing_list"] = "%s (%s)" % (hit["id"], hit["company"])
                if hit.get("ownership"):
                    rec["ownership"] = hit["ownership"] if isinstance(hit["ownership"], str) and len(hit["ownership"]) < 40 else rec["ownership"]
            records[seg].append(rec)

    # ---- CET node distances
    for rec in records["cet"]:
        g = geo_for(rec["zip"])
        if g:
            best = min(((haversine(g[0], g[1], *G_CET[k]), k) for k in G_CET), key=lambda x: x[0])
            rec["dist_mi"] = round(best[0], 1)
            rec["nearest_hub"] = "CET " + best[1]
            rec["geo_basis"] = "ZIP centroid" if g[2] == "zcta" else "ZIP3 average centroid"

    # ---- scoring and shortlist
    coo_cut_global[0] = coo_recent_cut
    shortlist = []
    seg_summary = {}
    for seg in SEG_ORDER:
        c = SEGMENTS[seg]
        band = c["band"]
        recs = records[seg]
        for r in recs:
            score_and_reason(seg, r, band)
        cnt = counts[seg]
        cnt["businesses_after_dedupe"] = len(recs) + len(excluded[seg])
        cnt["excluded_bsp"] = len(excluded[seg])
        cnt["businesses_after_exclusions"] = len(recs)
        cnt["ppp_businesses_after_exclusions"] = sum(1 for r in recs if r["loans"])
        cnt["sba_only_businesses_added"] = sum(1 for r in recs if r["source"] == "sba_only")
        cnt["ppp_businesses_with_sba_link"] = sum(1 for r in recs if r["source"] == "ppp+sba")
        cnt["in_jobs_band_ppp"] = sum(1 for r in recs if r["loans"] and band[0] <= r["jobs_reported"] <= band[1])
        cnt["in_jobs_band_latest"] = sum(1 for r in recs if band[0] <= r["jobs_latest"] <= band[1])
        cnt["change_of_ownership_flagged"] = sum(1 for r in recs if r["change_of_ownership"])
        cnt["on_existing_list_matched"] = sum(1 for r in recs if r["on_existing_list"])
        cnt["franchise_units"] = sum(1 for r in recs if r["franchise_name"])
        pool_ = [r for r in recs if r.get("eligible")]
        cnt["eligible_for_shortlist"] = len(pool_)
        pool_.sort(key=lambda r: -r["score"])
        chosen = pick(seg, pool_, c["cap"])
        cnt["shortlisted"] = len(chosen)
        for i, r in enumerate(chosen, 1):
            r["rank"] = i
        shortlist.extend(chosen)
        seg_summary[seg] = {"label": c["label"], "naics": sorted(c["naics"]) + (["315xxx"] if c.get("naics_prefix") else []),
                            "geography": {"pp_radius": "PA, NJ, DE, MD, NY borrowers (PPP: ProjectState when BorrowerState is miscoded) within %d miles (straight line, ZIP centroid) of Lancaster PA 17601 or Toms River NJ 08753" % c.get("radius_mi", 0),
                                          "new_england": "Borrower state CT, MA, RI, NH, VT or ME (PPP: ProjectState when BorrowerState is miscoded)",
                                          "us": "All states and territories"}[c["geo"]],
                            "jobs_band": list(band), "cap": c["cap"], "counts": dict(cnt),
                            "excluded": [{"name": r["name"], "city": r["city"], "state": r["state"],
                                          "reason": r["excluded_reason"]} for r in excluded[seg]]}

    # ---- stable cids for every record
    all_recs = [r for s in SEG_ORDER for r in sorted(records[s], key=lambda r: (r["ppp_loan_numbers"][:1] or ["~"], r["biz_key"]))]
    for r in all_recs:
        k = r["segment"] + "|" + r["biz_key"]
        if k not in cidmap:
            next_n[r["segment"]] += 1
            cidmap[k] = "%s-%04d" % (r["segment"], next_n[r["segment"]])
        r["cid"] = cidmap[k]
    if a.cid_map:
        json.dump(cidmap, open(a.cid_map, "w"), indent=0, sort_keys=True)

    # ---- write compact candidates file
    cols = ["cid", "segment", "name", "dba", "city", "state", "zip", "naics", "business_type",
            "jobs_reported", "jobs_latest", "jobs_latest_source", "loan_total_usd", "loans",
            "date_approved", "franchise_name", "source", "sba_loans", "sba_latest_loan",
            "change_of_ownership", "change_of_ownership_recent", "dist_mi", "nearest_hub",
            "on_existing_list", "pe_backed_flag", "person_named", "nonprofit", "ownership",
            "score", "eligible", "address", "ppp_loan_numbers"]
    rows = [[r.get(k) for k in cols] for r in all_recs]
    sl_fields = ["cid", "segment", "rank", "name", "dba", "address", "city", "state", "zip", "naics",
                 "naics_all", "business_type", "jobs_reported", "jobs_latest", "jobs_latest_source",
                 "loan_total_usd", "loans", "date_approved", "ppp_last_date", "draws", "franchise_name",
                 "ppp_lender", "ppp_business_age", "source", "sba_loans", "sba_latest_loan",
                 "sba_latest_jobs_supported", "sba_link_method", "sba_detail", "change_of_ownership",
                 "change_of_ownership_recent", "dist_mi", "nearest_hub", "geo_basis", "distance_note",
                 "on_existing_list", "pe_backed_flag", "person_named", "ownership", "score",
                 "signals", "rank_reason", "ppp_loan_numbers"]
    out = {
        "meta": {
            "dataset": "BSP SBA loan candidate screen (PPP + 7(a)/504)",
            "generated": dt.date.today().isoformat(),
            "script": "scripts/build_ppp_screen.py",
            "sources": {
                "ppp": {"portal": "https://data.sba.gov/dataset/ppp-foia",
                        "files": [os.path.basename(p) for p in ppp_files],
                        "rows_read": total_rows,
                        "data_age": "PPP loans approved Apr 2020 - May 2021; JobsReported is what the borrower reported on the application then. Batch dated 2024-09-30 (latest on the portal when run)."},
                "sba_7a_504": {"portal": "https://data.sba.gov/dataset/7a-504-foia",
                               "files": [os.path.basename(p) for p in sba_files],
                               "as_of": asof_iso},
                "zip_centroids": os.path.basename(a.zcta) + " (US Census ZCTA gazetteer)",
            },
            "field_definitions_from_sba_dictionaries": FIELD_DEFS,
            "rules": RULES,
            "change_of_ownership_recent_cutoff": coo_recent_cut,
            "export_dir": os.path.abspath(a.export_dir),
            "export_files_rows": export_files,
            "privacy": "The business view and shortlist do not carry the PPP Race, Ethnicity, Gender or Veteran fields; those exist only in the verbatim loan-level exports.",
        },
        "segments": seg_summary,
        "businesses": {"cols": cols, "rows": rows},
        "shortlist": [{k: r.get(k) for k in sl_fields} for r in shortlist],
        # businesses matched to a hand-built list but left off the shortlist (the anchor cap): full records, so a company
        # whose ownership was already checked can still be joined to its hand-built record by build_ma_ppp_screen.py
        "on_list": [{k: r.get(k) for k in sl_fields} for r in all_recs if r.get("on_existing_list") and not r.get("rank")],
    }
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"), default=str)
    log("wrote", a.out)
    for seg in SEG_ORDER:
        log(seg, json.dumps(seg_summary[seg]["counts"]))


G_CET = {}

FIELD_DEFS = {
    "PPP.JobsReported": "Number of Employees (PPP data dictionary).",
    "PPP.ProcessingMethod": "Loan Delivery Method (PPP for first draw; PPS for second draw).",
    "PPP.DateApproved": "Loan Funded Date.",
    "PPP.CurrentApprovalAmount": "Loan Approval Amount (current).",
    "PPP.BusinessAgeDescription": "Business Age Description.",
    "PPP.FranchiseName": "Franchise Name.",
    "PPP.LoanStatus": "Loan Status Description; replaced by 'Exemption 4' when the loan is disbursed but not Paid in Full or Charged Off.",
    "SBA.JobsSupported": "Total Jobs Created + Jobs Retained as reported by lender on SBA Loan Application. SBA does not review, audit, or validate these numbers; they are self-reported, good faith estimates by the lender.",
    "SBA.BusinessAge": "Categorical description of the age of the business. Values seen: 'Change of Ownership', 'Existing or more than 2 years old', 'New Business or 2 years or less', 'Startup, Loan Funds will Open Business', and others. The dictionary does not define 'Change of Ownership' further; it is read here as the loan financing a change of ownership on that approval date.",
    "SBA.LoanStatus": "CANCLD = Cancelled; CHGOFF = Charged Off; COMMIT (7a) / NOT FUNDED (504) = Undisbursed; EXEMPT = disbursed but not cancelled, paid in full or charged off (status exempt from disclosure under FOIA Exemption 4); PIF = Paid In Full (files also use 'P I F'); CLOSED (504) = closed for another reason, no longer used.",
    "SBA.GrossApproval": "Total loan amount (7a); SBA/CDC loan amount (504).",
    "SBA.ApprovalDate": "Date the loan was approved.",
    "SBA.BusinessType": "Borrower Business Type - Individual, Partnership, or Corporation.",
}

RULES = {
    "business_key": "Normalised legal name (text before any DBA, punctuation and legal suffixes removed, spaces dropped) + 5-digit borrower ZIP. First- and second-draw PPP loans and name variants with the same key collapse into one record.",
    "business_rollup": "jobs_reported = max PPP JobsReported; loan_total_usd = sum of PPP CurrentApprovalAmount; loans = PPP loan count; date_approved = earliest PPP DateApproved.",
    "sba_link": "Every 7(a)/504 row (any NAICS) is linked to a PPP business by name+ZIP, then exact name+city+state, then fuzzy name (SequenceMatcher >= 0.90) within the same city and state. Segment-matching SBA rows with no PPP link become SBA-only businesses.",
    "jobs_latest": "The latest SBA loan's JobsSupported is used when that loan was approved after the business's last PPP loan; otherwise PPP JobsReported. jobs_latest_source says which.",
    "change_of_ownership": "Date of the latest 7(a)/504 loan whose BusinessAge is 'Change of Ownership'. Recent means within three years of the SBA as-of date; such businesses rank lower (the buyer may be a searcher or small acquirer).",
    "exclusions": "BSP companies and add-ons (and the exited Smith + Howard group) are removed from the business view by name or by known site address. They stay in the verbatim exports.",
    "existing_lists": "Matches to data/research/ma_targets_*.json (same state; exact name, distinctive name tokens plus city, close fuzzy name, or every distinctive word of one name in the other within 10 miles or the same city with broadly similar full names) are flagged in on_existing_list, not removed. build_ma_ppp_screen.py also matches on the website domain.",
    "geography": "PPP rows are placed by BorrowerState; when BorrowerState fails a segment's state test and ProjectState differs, ProjectState is tried (a few rows carry a miscoded BorrowerState).",
    "stale_sba_only": "An SBA-only business whose latest 7(a)/504 loan was approved before FY2010 (before 2009-10-01) and that took no PPP loan is kept in the business view and the full data but is not eligible for the shortlist: nothing on record shows it operating since.",
    "shortlist": "Shortlist uses jobs_latest within the segment band and ranks by fit; at most 3 businesses already on a hand-built list are kept as calibration anchors. Sole proprietors and person-named borrowers rank lower but stay in the full data.",
}


coo_cut_global = [""]


def score_and_reason(seg, r, band):
    toks = norm_tokens(r["name"]) + norm_tokens(r["dba"]) + [t for n in r.get("alt_names", []) for t in norm_tokens(n)]
    j = r["jobs_latest"]
    jf = jobs_fit(j, band)
    reasons, signals = [], []
    score = 0.0
    eligible = jf is not None
    if jf is not None:
        score += jf
        reasons.append("%d jobs (%s)." % (j, "PPP 2020-21" if r["jobs_latest_source"].startswith("PPP") else "SBA loan " + r["jobs_latest_source"].split("approved ")[1][:4]))
    if seg == "pp":
        d = r.get("dist_mi")
        if d is not None:
            score += max(5.0, 25.0 - 20.0 * max(0.0, d - 30) / 90.0)
            r["distance_note"] = "%d mi from the %s (straight line, %s)" % (round(d), r["nearest_hub"], r.get("geo_basis", "ZIP centroid"))
            reasons.append("%d miles from %s." % (round(d), r["nearest_hub"].split(" ")[0].replace("Toms", "Toms River")))
        if r["naics"] == "238220":
            score += 10
        z3 = (r["zip"] or "")[:3]
        if z3 in ("100", "101", "102", "103", "104", "111", "112", "113", "114", "116"):
            score -= 10
            reasons.append("New York City market, mostly commercial and multifamily work, away from both hubs.")
        elif z3 in ("115", "117", "118", "119"):
            score -= 6
            reasons.append("Long Island, a long drive from both hubs.")
        res = has(toks, RES_WORDS)
        com = has(toks, COMM_WORDS)
        if res:
            score += 10
            signals.append("residential words in name: " + ", ".join(res).lower())
            reasons.append("Name points to home service.")
        if com:
            score -= 10
            signals.append("commercial words in name: " + ", ".join(com).lower())
            reasons.append("Name suggests commercial work.")
        if r["naics"] == "238210" and not res:
            score -= 5
        if r["franchise_name"] and any(x in r["franchise_name"].upper() for x in AUTHORITY_BRANDS):
            score -= 5
            reasons.append("Runs the same brands as Punctual Pros (%s)." % r["franchise_name"])
        elif r["franchise_name"]:
            score -= 15
            reasons.append("Franchise unit (%s)." % r["franchise_name"])
    elif seg == "cet":
        cap = has(toks, CET_CAP)
        lv = has(toks, CET_LV)
        wat = has(toks, CET_WATER)
        if r["naics"] == "237110":
            if wat:
                score += 12
                signals.append("water/sewer words: " + ", ".join(wat).lower())
                reasons.append("Water, sewer or pump work fits Horton's niche.")
            else:
                score -= 5
        else:
            if cap:
                score += 10
                signals.append("electrical/energy words: " + ", ".join(cap).lower())
            if has(toks, ["SUPPLY", "SUPPLIES", "DISTRIBUTORS", "WHOLESALE"]):
                score -= 15
                reasons.append("Name suggests a supply house, not a contractor.")
            if lv and not cap:
                score -= 12
                signals.append("low-voltage words: " + ", ".join(lv).lower())
                reasons.append("Name suggests low-voltage work only.")
            if has(toks, ["SOLAR", "ENERGY", "EV", "CHARGING", "POWER", "UTILITY", "SUBSTATION", "GENERATOR", "GENERATORS"]):
                score += 5
                reasons.append("Name points to energy or utility work.")
        d = r.get("dist_mi")
        if d is not None:
            score += max(0.0, 8.0 - d / 20.0)
            r["distance_note"] = "%d mi from %s (straight line, ZIP centroid)" % (round(d), r["nearest_hub"])
            reasons.append("%d miles from CET's %s site." % (round(d), r["nearest_hub"].replace("CET ", "").split(" ")[0]))
        if r["franchise_name"]:
            score -= 15
            reasons.append("Franchise unit (%s)." % r["franchise_name"])
    elif seg == "fl":
        s = has(toks, FL_STRONG)
        w = has(toks, FL_WEAK)
        lf = has(norm_tokens(r["name"]) + [x for x in (r["name"] or "").upper().replace(",", " ").split() if x in ("APC", "ESQ", "PLLC", "PC", "LLC")], FL_LAWFIRM)
        if lf:
            eligible = False
            signals.append("looks like a law firm itself: " + ", ".join(lf).lower())
        if s:
            score += 30
            signals.append("legal words in name: " + ", ".join(s).lower())
            reasons.append("Name signals a legal focus (%s)." % ", ".join(x.lower() for x in s))
        elif w:
            score += 8
            signals.append("weak legal words: " + ", ".join(w).lower())
            reasons.append("Weak legal hint in name (%s)." % ", ".join(x.lower() for x in w))
        if not s and not r["on_existing_list"]:
            eligible = False
        if r["state"] in ("MO", "IL", "KS"):
            score += 4
            reasons.append("Near Frontline's St. Louis base.")
        elif r["state"] in ("CA", "TX"):
            score += 2
        r["distance_note"] = "HQ ZIP %s, %s" % (r["zip"], r["state"])
    elif seg == "ts":
        s = has(toks, TS_STRONG)
        if r["naics"] == "423490":
            s += has(toks, TS_INSTR)
        w = has(toks, TS_WEAK)
        n = has(toks, TS_NEG)
        if s:
            score += 30
            signals.append("lab/scientific words: " + ", ".join(s).lower())
            reasons.append("Name signals lab or scientific supply (%s)." % ", ".join(x.lower() for x in s))
        elif w and r["naics"] in ("423490", "424690"):
            score += 6
            signals.append("weak supply words: " + ", ".join(w).lower())
        if n:
            score -= 25
            signals.append("non-lab words: " + ", ".join(n).lower())
        if not s and not r["on_existing_list"]:
            eligible = False
        r["distance_note"] = "HQ ZIP %s, %s" % (r["zip"], r["state"])
    elif seg == "bpi":
        if r["naics"] == "541910":
            p = has(toks, BPI_POLL)
            if p:
                score += 25
                signals.append("opinion-research words: " + ", ".join(p).lower())
                reasons.append("Name signals public-opinion research.")
            else:
                eligible = False
        else:
            s = has(toks, BPI_STRONG)
            w = has(toks, BPI_WEAK)
            if s:
                score += 25
                signals.append("public-affairs words: " + ", ".join(s).lower())
                reasons.append("Name signals public affairs or advocacy (%s)." % ", ".join(x.lower() for x in s))
            elif w:
                score += 6
                signals.append("general comms words: " + ", ".join(w).lower())
        if r["state"] in ("DC", "VA", "MD"):
            score += 8
            reasons.append("Washington area.")
        elif r["state"] in ("NY", "CA"):
            score += 4
        r["distance_note"] = "HQ ZIP %s, %s" % (r["zip"], r["state"])
    elif seg == "fh":
        cn = "".join(toks)
        swim = [w for w in ("SWIM", "SURF", "BEACH", "BOARDSHORT", "SUNWEAR", "RESORTWEAR") if w in cn]
        coast = has(toks, ["ISLAND", "COAST", "COASTAL", "SHORE", "HARBOR"])
        brandish = has(toks, ["OUTFITTERS", "OUTFITTER", "SPORTSWEAR", "LIFESTYLE", "BRAND", "BRANDS", "CLOTHING"])
        n = has(toks, FH_NEG + ["LABEL", "TRIM", "PLEATING", "STITCHING", "PAD", "GLOVE", "TEES", "DANCE",
                                "CORPORATE", "CUSTOM", "SURFBOARD", "INTIMATES", "DRESSMAKING", "GRAPHICS",
                                "ART", "HOSIEY", "SEASHORE", "SALES", "MARKETING", "GEAR", "CAP", "CAPS", "HEADWEAR"])
        if swim:
            score += 30
            signals.append("swim/beach words: " + ", ".join(swim).lower())
            reasons.append("Swim or beach brand angle like Fair Harbor (%s)." % ", ".join(x.lower() for x in swim))
        if coast:
            score += 12
            signals.append("coastal words: " + ", ".join(coast).lower())
            if not swim:
                reasons.append("Coastal lifestyle name (%s)." % ", ".join(x.lower() for x in coast))
        if brandish:
            score += 4
            signals.append("brand words: " + ", ".join(brandish).lower())
        if n:
            score -= 30
            signals.append("contract/maker words: " + ", ".join(n).lower())
        if not (swim or coast) or n:
            eligible = False
        r["distance_note"] = "HQ ZIP %s, %s" % (r["zip"], r["state"])

    if r["nonprofit"]:
        score -= 40
        eligible = False
    if r["person_named"]:
        score -= 12
        reasons.append("Sole proprietor or person-named borrower.")
    if r["pe_backed_flag"]:
        if r["pe_backed_flag"].startswith("possible"):
            score -= 12
            reasons.append("Name resembles a PE-owned company on the hand-built list; check ownership.")
        else:
            score -= 30
            reasons.append("Hand-built list says a PE firm or strategic buyer owns it.")
    if r["change_of_ownership"]:
        if r["change_of_ownership_recent"]:
            score -= 25
            reasons.append("Bought with an SBA loan on %s; new owner may be a searcher or small buyer." % r["change_of_ownership"])
        else:
            score -= 4
            reasons.append("Changed hands with SBA financing in %s." % r["change_of_ownership"][:4])
    if r.get("possible_acquisition_vehicle") and not r["change_of_ownership"]:
        recent = coo_cut_global[0] and r["possible_acquisition_vehicle"] >= coo_cut_global[0]
        score -= 20 if recent else 4
        reasons.append("Holding-company borrower took a large SBA loan as a new business on %s; it may already have been bought." % r["possible_acquisition_vehicle"])
    if r["sba_charged_off"]:
        score -= 10
        reasons.append("Has a charged-off SBA loan.")
    if r["sba_latest_date"] and r["sba_latest_date"] >= "2023-01-01" and not r["change_of_ownership_recent"]:
        score += 3
        reasons.append("Took a %s loan in %s." % (r["sba_latest_loan"].split(",")[0], r["sba_latest_date"][:4]))
    if r["on_existing_list"]:
        reasons.append("Already on BSP's hand-built target list.")
    if r["source"] == "sba_only":
        reasons.append("Found only in 7(a)/504 data.")
        if r["sba_latest_date"] and r["sba_latest_date"] < "2009-10-01":
            eligible = False
            reasons.append("Latest SBA loan is from before FY2010 and there is no PPP loan, so it may no longer operate.")
    r["score"] = round(score, 1)
    r["eligible"] = bool(eligible)
    r["signals"] = signals
    r["rank_reason"] = " ".join(reasons)


def pick(seg, pool_, cap):
    anchors = 0
    chosen = []
    seen_names = set()
    if seg == "cet":
        quotas = {"MA": 20, "CT": 13, "NH": 8, "RI": 7, "ME": 6, "VT": 6}
        bystate = defaultdict(list)
        for r in pool_:
            bystate[r["state"]].append(r)
        tmp = []
        for st, q in quotas.items():
            n = 0
            for r in bystate.get(st, []):
                if n >= q:
                    break
                if r["on_existing_list"]:
                    if anchors >= 3:
                        continue
                    anchors += 1
                key = compact(r["name"])
                if key in seen_names:
                    continue
                seen_names.add(key)
                tmp.append(r)
                n += 1
        left = [r for r in pool_ if r not in tmp and not r["on_existing_list"] and compact(r["name"]) not in seen_names]
        while len(tmp) < cap and left:
            r = left.pop(0)
            seen_names.add(compact(r["name"]))
            tmp.append(r)
        return sorted(tmp, key=lambda r: -r["score"])[:cap]
    for r in pool_:
        if len(chosen) >= cap:
            break
        if r["on_existing_list"]:
            if anchors >= 3:
                continue
            anchors += 1
        key = compact(r["name"])
        if key in seen_names:
            continue
        seen_names.add(key)
        chosen.append(r)
    return chosen


if __name__ == "__main__":
    # CET node centroids for the main process
    def _cet_nodes(zcta_path):
        pts, _ = load_zcta(zcta_path)
        return {k: pts.get(z, (la, lo)) for k, (z, la, lo) in CET_NODES.items()}
    _args = sys.argv
    if "--zcta" in _args:
        G_CET.update(_cet_nodes(_args[_args.index("--zcta") + 1]))
    main()
