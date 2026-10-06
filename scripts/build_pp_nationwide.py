#!/usr/bin/env python3
"""Build data/research/pp_nationwide.json - evidence base for taking Punctual Pros nationwide."""
import json, collections, os

ROOT = "/Users/syed/BSP/data"
R = os.path.join(ROOT, "research")
TODAY = "2026-10-06"
REPO_RET = "2026-09-24"

# ---------------- repo-derived data points ----------------
z = json.load(open(os.path.join(ROOT, "pp_zips.json")))
cols, en = z["cols"], z["enums"]
rows = []
for r in z["rows"]:
    d = dict(zip(cols, r))
    for k, v in en.items():
        if k in d and isinstance(d[k], int) and isinstance(v, list):
            d[k] = v[d[k]]
    rows.append(d)

core = [r for r in rows if r["service_territory_flag"] == 1]
core_hu = sum(r["housing_units"] for r in core)
core_owner = round(sum(r["housing_units"] * r["owner_occupancy_rate"] for r in core))
core_by_county = dict(collections.Counter(r["county"] for r in core).most_common())
core_tier1 = sum(1 for r in core if r["opportunity_tier_v3"] == "Tier 1")
core_gonow = sum(1 for r in core if r["practical_priority_label"] == "Go now")
adj = [r for r in rows if r["adjacent_to_service_territory"] == 1]
adj_t1 = [r for r in adj if r["opportunity_tier_v3"] == "Tier 1"]
adj_t1_by_state = dict(collections.Counter(r["state"] for r in adj_t1))
adj_t1_hu = sum(r["housing_units"] for r in adj_t1)
adj_t1_by_state_hu = {s: sum(r["housing_units"] for r in adj_t1 if r["state"] == s) for s in adj_t1_by_state}
adj_t1_top_counties = [f"{c} ({n})" for c, n in collections.Counter(f"{r['county']}, {r['state']}" for r in adj_t1).most_common(8)]
nc_t1 = [r for r in rows if r["service_territory_flag"] == 0 and r["opportunity_tier_v3"] == "Tier 1"]
nc_t1_by_state = dict(collections.Counter(r["state"] for r in nc_t1))
nc_t1_hu_by_state = {s: sum(r["housing_units"] for r in nc_t1 if r["state"] == s) for s in nc_t1_by_state}
gonow_by_state = dict(collections.Counter(r["state"] for r in rows if r["practical_priority_label"] == "Go now" and r["service_territory_flag"] == 0))

def metro(name, state, counties):
    x = [r for r in rows if r["state"] == state and r["county"] in counties]
    return {"metro": name, "state": state, "counties": counties, "zips": len(x),
            "tier1_zips": sum(1 for r in x if r["opportunity_tier_v3"] == "Tier 1"),
            "go_now_zips": sum(1 for r in x if r["practical_priority_label"] == "Go now"),
            "housing_units": sum(r["housing_units"] for r in x)}

ny_south = metro("Southern NY (Southern Tier + lower Hudson, excl. NYC/Long Island)", "NY",
                 ["Broome County", "Tioga County", "Chemung County", "Steuben County", "Orange County",
                  "Rockland County", "Sullivan County", "Ulster County", "Dutchess County", "Putnam County"])
nj_shore = metro("Jersey Shore (Horvath base)", "NJ", ["Ocean County", "Monmouth County"])
nj_south = metro("South Jersey", "NJ", ["Atlantic County", "Cape May County", "Burlington County", "Camden County", "Gloucester County"])
md_north = metro("Northern MD ring (I-81/I-83/I-95)", "MD", ["Washington County", "Frederick County", "Carroll County", "Harford County", "Cecil County"])
phl = metro("Philadelphia suburbs", "PA", ["Montgomery County", "Chester County", "Bucks County", "Delaware County"])
pgh = metro("Pittsburgh", "PA", ["Allegheny County", "Westmoreland County", "Butler County", "Washington County", "Beaver County"])
bal = metro("Baltimore", "MD", ["Baltimore County", "Baltimore city", "Anne Arundel County", "Howard County", "Harford County", "Carroll County"])
dcmd = metro("Washington DC (MD suburbs)", "MD", ["Montgomery County", "Prince George's County", "Frederick County"])

ma = json.load(open(os.path.join(R, "ma_targets_pp.json")))
tg = ma["items"]
tg_by_state = dict(collections.Counter(i["state"] for i in tg))
tg_fit70_by_state = dict(collections.Counter(i["state"] for i in tg if i["fit_score"] >= 70))
tg_rev_by_state = {s: sum((i["revenue_est_usd"] or 0) for i in tg if i["state"] == s) for s in tg_by_state}
tg_emp_by_state = {s: sum((i["employees"] or 0) for i in tg if i["state"] == s) for s in tg_by_state}
tg_top = [f"{t['company']} ({t['fit_score']})" for t in ma["meta"]["ranked_top_10"][:5]]
abm = ma["meta"]["authority_brands_territory_map"]
ab_total = len(abm)
ab_pp = [x for x in abm if x["owner_status"].startswith("portfolio")]
ab_non_pp = [x for x in abm if not x["owner_status"].startswith("portfolio")]
ab_by_state = dict(collections.Counter(x["state"] for x in abm))
ab_non_pp_by_state = dict(collections.Counter(x["state"] for x in ab_non_pp))
ab_pp_by_state = dict(collections.Counter(x["state"] for x in ab_pp))
ab_by_brand = dict(collections.Counter(x["brand"] for x in abm))
ab_linked_targets = sum(1 for x in ab_non_pp if "target pp-t" in x["owner_status"])

pe = json.load(open(os.path.join(R, "pe_landscape.json")))
pp_spons = [i for i in pe["items"] if "punctual_pros" in i["overlap_with_bsp"]]
pp_spons_threat = dict(collections.Counter(i["threat_level"] for i in pp_spons))
pp_spons_high = [i["firm"] for i in pp_spons if i["threat_level"] == "high"]

fil = {i["id"]: i for i in json.load(open(os.path.join(R, "pp_filings.json")))["items"]}
oh, bf, ms = (fil["pp-fil-016"]["key_figures"], fil["pp-fil-017"]["key_figures"], fil["pp-fil-018"]["key_figures"])
fdd_outlets = oh["territories_operated"] + bf["territories_operated"] + ms["territories_operated"]
fdd_franchisees = oh["franchisees_at_2025-12-31"] + bf["franchisees_at_2025-12-31"] + ms["franchisees_at_2025-12-31"]
fdd_rev = oh["aggregate_gross_revenue_usd"] + bf["aggregate_gross_revenue_usd"] + ms["aggregate_gross_revenue_usd"]
pp_terr = fil["pp-fil-020"]["key_figures"]
i21 = fil["pp-fil-021"]["key_figures"]
pa_outlets = sum(i21["franchised_outlets_end_2025_PA"].values())
nj_outlets = sum(i21["franchised_outlets_end_2025_NJ"].values())
FDD_URL = fil["pp-fil-016"]["source_url"]
FDD_BF_URL = fil["pp-fil-017"]["source_url"]
FDD_MS_URL = fil["pp-fil-018"]["source_url"]
PGIM_URL = fil["pp-fil-010"]["source_url"]
AB_URL = fil["pp-fil-028"]["source_url"]
FORMD_URL = fil["pp-fil-004"]["source_url"]
SPV_URL = fil["pp-fil-005"]["source_url"]
ADV_URL = fil["pp-fil-007"]["source_url"]
QCEW_URL = fil["pp-fil-029"]["source_url"]
BSP_PP_URL = fil["pp-fil-026"]["source_url"]
HORVATH_URL = fil["pp-fil-027"]["source_url"]
AB_1851 = "https://1851franchise.com/authority-brands-2025-franchise-growth-2731413"

# ---------------- items ----------------
items = []
def add(**kw):
    kw.setdefault("retrieved", TODAY)
    items.append(kw)

SH = "Smith + Howard"
# 1. template
T = [
 ("2022-11-15", "Broad Sky Partners makes a strategic investment in Smith + Howard (Atlanta tax, accounting and advisory firm, founded ~1971). Stated plan: expand advisory services, widen the geographic footprint and speed up technology through acquisitions.", SH, "Atlanta, GA", "~100 professionals in a single Atlanta office at entry (per BSP's Aug 2026 exit release)", "https://markets.financialcontent.com/bpas/article/bizwire-2022-11-15-smith-howard-and-broad-sky-partners-announce-strategic-platform-investment"),
 ("2023-08-17", "Add-on 1: merges with Market Street Partners. Service line: accounting, tax and advisory. This was the first move outside Georgia, into Tennessee.", "Market Street Partners", "Chattanooga, TN", "First new state (TN); first acquisition under BSP", "https://www.accountingtoday.com/news/smith-howard-acquires-market-street-partners"),
 ("2024-01-31", "Add-on 2: acquires JMM CPAs. Service line: employee benefit plan (EBP) audit. It gives the EBP practice a national footprint.", "JMM CPAs", "Chicago, IL", "30 EBP-dedicated staff; combined practice serves 500+ plans", "https://www.smith-howard.com/smith-howard-announces-expansion-of-benefit-plan-audit-practice/"),
 ("2024-04-30", "Add-on 3: acquires VIP Search Group. Service line: executive search / talent advisory.", "VIP Search Group", "Richardson (Dallas), TX", "Texas entry; local press called it the third acquisition in 12 months", "https://www.smith-howard.com/smith-howard-acquires-vip-search-and-vip-solutions-businesses/"),
 ("2024-04-30", "Add-on 4: acquires VIP Solutions Group in the same transaction. Service line: talent and staffing solutions. It is counted separately here to reconcile with BSP's 'nine acquisitions'.", "VIP Solutions Group", "Richardson (Dallas), TX", "Bought alongside VIP Search; counting it separately is an analyst reconciliation", "https://www.smith-howard.com/smith-howard-acquires-vip-search-and-vip-solutions-businesses/"),
 ("2024-11-26", "Add-on 5: acquires Fahrenheit Advisors. Service lines: business strategy, finance and accounting, human capital management, sales advisory and executive search. This gave the firm its first Mid-Atlantic office.", "Fahrenheit Advisors", "Richmond, VA", "140+ professionals added; first Mid-Atlantic office", "https://www.cpapracticeadvisor.com/2024/12/12/smith-howard-acquires-fahrenheit-advisors-in-virginia/152764/"),
 ("2024-12-11", "Milestone: at the Fahrenheit deal, Inside Public Accounting reports Smith + Howard's FY23 net revenue.", SH, "Atlanta, GA", "FY23 net revenue $53.2M", "https://insidepublicaccounting.com/2024/12/11/smith-howard-acquires-fahrenheit-advisors/"),
 ("2025-01-31", "Add-on 6: acquires Smith Kesler & Co. (est. 1974). Service line: construction-focused audit and tax. Entry into the Carolinas.", "Smith Kesler & Co.", "NC / SC (4 offices)", "4 offices added across the Carolinas", "https://www.cpapracticeadvisor.com/2025/02/11/smith-howard-adds-smith-kesler-co-in-south-carolina/155885/"),
 ("2025-09-03", "Add-on 7: acquires Horton, Lee, Burnett, Peacock, Cleveland & Grainger. Service line: accounting and consulting. Entry into Alabama.", "Horton, Lee & Burnett", "Birmingham, AL", "Alabama entry (a 58-year-old firm)", "https://www.cpapracticeadvisor.com/2025/09/03/smith-howard-acquires-horton-lee-burnett-in-alabama/168402/"),
 ("2026-01-13", "Add-on 8: acquires Bauknight Pietras & Stormer (BPS), one of the largest locally owned CPA firms in South Carolina. Service lines: audit, tax, advisory and captive insurance.", "Bauknight Pietras & Stormer (BPS)", "Columbia, SC", "~90 staff and 13 partners added; BPS FY24 net revenue $21.8M vs Smith + Howard FY24 $74.2M", "https://www.accountingtoday.com/news/smith-howard-buys-bauknight-pietras-stormer"),
 ("2026-01-13", "Milestone: with BPS, Smith + Howard has >600 employees, >45 partners and 10 offices, ranks No. 85 on Accounting Today's 2025 Top 100, and expects about $175M of 2026 revenue.", SH, "Southeast US", "~$175M expected 2026 revenue; 10 offices; >600 employees", "https://www.accountingtoday.com/news/smith-howard-buys-bauknight-pietras-stormer"),
 ("2026-02-03", "Add-on 9: Geels Norton joins. Service line: cyber-risk, SOC audit and advisory. The firm called it its third strategic growth milestone in six months.", "Geels Norton", "Atlanta, GA (location not disclosed)", "Adds a cyber/SOC capability", "https://www.smith-howard.com/smith-howard-welcomes-geels-norton-expanding-cyber-risk-audit-and-advisory-capabilities/"),
 ("2026-06-09", "TPG Growth signs a definitive agreement to make a significant investment in Smith + Howard, which marks Broad Sky's exit.", SH, "AL, GA, NC, SC, TN, TX, VA", "~800 professionals across 7 states", "https://www.smith-howard.com/smith-howard-announces-significant-investment-from-tpg/"),
 ("2026-08-06", "Broad Sky completes the sale of Smith + Howard to TPG, its first exit. Over 3.7 years: ~100 to ~800 professionals, 1 office to 11 locations across the Southeast plus an India offshore delivery center, nine strategic acquisitions, ~4x revenue, and investment in leadership, technology and AI-enabled capabilities.", SH, "Atlanta, GA -> Southeast US + India", "~4x revenue; 8x headcount; 1 -> 11 locations; 9 acquisitions", "https://broadskypartners.com/broad-sky-partners-completes-sale-of-smith-howard-to-tpg/"),
]
for n, (d, e, c, loc, m, u) in enumerate(T, 1):
    add(id=f"pn-tpl-{n:02d}", kind="template", date=d, event=e, company=c, location=loc, metric=m, source_url=u)
FL = [
 ("2024-12-11", "Second analog: Broad Sky invests in Frontline Managed Services, which provides managed IT and revenue-cycle management for law firms. It was already a national/global footprint at entry: offices in St. Louis, Toledo, Honolulu, New York, Toronto, London, Hyderabad, Goa and Cape Town.", "Frontline Managed Services", "St. Louis, MO (national + global)", "800+ law-firm clients incl. >50% of the AM Law 200; ~1,000 employees at investment", "https://markets.financialcontent.com/bpas/article/bizwire-2024-12-11-frontline-managed-services-a-global-leader-in-managed-it-for-the-legal-industry-secures-investment-from-broad-sky-partners-to-fuel-strategic-growth-and-expansion", REPO_RET),
 ("2025-08-06", "Frontline launches HELIX, an AI-optimized service desk for law firms. AI-enabled delivery serves as the scale lever across its national client base, the same 'AI + offshore delivery' pattern used at Smith + Howard.", "Frontline Managed Services", "National", "AI service desk rolled out to the 800+ firm client base", "https://www.thecannatareport.com/breaking-news/frontline-helix-for-legal/", REPO_RET),
 ("2026-01-27", "Frontline appoints Tim Britt CEO (Seelin Naidoo moves to the board). This is a scale-stage leadership upgrade.", "Frontline Managed Services", "St. Louis, MO", "Nearly 900 law-firm clients; ~1,100 employees (Jan 2026)", "https://www.prnewswire.com/news-releases/frontline-managed-services-appoints-tim-britt-as-chief-executive-officer-302670506.html", REPO_RET),
]
for n, (d, e, c, loc, m, u, ret) in enumerate(FL, len(T) + 1):
    add(id=f"pn-tpl-{n:02d}", kind="template", date=d, event=e, company=c, location=loc, metric=m, source_url=u, retrieved=ret)

# 2. ai_agent
A = [
 ("24/7 AI dispatcher (call answering & booking)", "Answer every inbound call 24/7, triage no-heat / no-cool / leak calls, check capacity and book the job straight into the dispatch board. Overflow and after-hours calls go to the agent, not voicemail.", "customer",
  ["ServiceTitan AI Voice Agent", "Avoca AI", "Sameday AI", "Netic"],
  "ServiceTitan reports its AI voice agents book 70% of calls overall and 90% after adjusting for capacity limits; a Northwinds Services Group director cites 80-85%.", 70, "% booking rate (overall)", "Per-call usage fee, no commitment (ServiceTitan); typically layered on the existing FSM subscription", 3,
  "https://www.servicetitan.com/features/pro/voice-agent"),
 ("Missed-call text-back & speed-to-lead agent", "Within seconds of any unanswered or abandoned call, web form or LSA lead, send an SMS that offers booking slots, then hand warm leads to a CSR or the voice agent.", "customer",
  ["Podium", "ServiceTitan Marketing Pro", "CallRail", "Hatch"],
  "Invoca's 2026 home-services benchmark (published July 2026) finds that only 52% of callers to home-services businesses reach a person, and that 55% of businesses never ask the lead to book.", 52, "% of inbound home-services calls answered by a person", "SaaS per location per month plus SMS usage", 2,
  "https://invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026"),
 ("AI estimator & proposal builder (unsold-estimate recovery)", "Build good/better/best replacement proposals from tech photos, equipment data and the price book, then work every unsold estimate with automated follow-up until it closes.", "technician",
  ["ServiceTitan Field Pro (Atlas)", "ServiceTitan Sales Pro", "XOi", "Profit Rhino"],
  "Above + Beyond Service Co., a ~$20M Oklahoma shop about Punctual Pros' size, generated $1.2M from unsold estimates in H1 2025 and lifted average ticket 29% using Field Pro's AI.", 1.2, "USD M revenue recovered from unsold estimates (H1 2025)", "Add-on SKU to FSM platform; one follow-up coordinator FTE", 6,
  "https://www.servicetitan.com/blog/success-story-above-beyond-field-pro"),
 ("Technician sales copilot (AI ride-alongs)", "Record in-home conversations with consent, score them against the plan, and send targeted coaching clips, so a manager can 'ride along' with every tech every day.", "technician",
  ["Rilla", "ServiceTitan Field Pro"],
  "A Houston Mister Sparky (same Authority Brands franchise Punctual Pros runs) raised technicians' average ticket 25% with Rilla, and managers reviewed 10 calls in the time one ride-along took.", 25, "% average-ticket lift", "Per-seat SaaS per month", 4,
  "https://legacy.rilla.com/testimonials/mister-sparky"),
 ("Technician diagnostics copilot (visual remote support)", "Gives field techs photo/video capture, equipment ID, step-by-step repair video and live senior-tech support, so junior techs fix it the first time and second truck rolls drop.", "technician",
  ["XOi Vision", "ServiceTitan Field Pro", "Bluon"],
  "A 33-technician HVAC company that used XOi Vision cut second truck rolls by 58%, cut customer credits by 19% and raised tech-recommended repairs by 12%.", 58, "% reduction in second truck rolls", "Per-tech SaaS per month", 4,
  "https://xoi.io/customer-stories/guardian-environmental-services-uk"),
 ("Route & schedule optimizer (AI dispatch)", "Assign each job to the tech who maximizes expected margin (skills, sales history, drive time, capacity), and re-plan the board live as emergencies land.", "office",
  ["ServiceTitan Dispatch Pro", "Housecall Pro", "Workiz"],
  "ServiceTitan says Dispatch Pro customers who went live from Jan 2023 to Jan 2025 saw 14% larger average tickets, 6% less drive time and 2x dispatcher efficiency over 6 months.", 14, "% average-ticket increase", "Add-on SKU priced per technician", 8,
  "https://www.servicetitan.com/features/pro/dispatch"),
 ("Membership renewal & retention agent", "Spot members due for tune-ups or renewal and members at risk of lapsing, run SMS/email/voice outreach to book maintenance visits, and upsell non-members after every repair.", "owner",
  ["ServiceTitan Marketing Pro", "Sera", "Podium"],
  "Sera's analysis of its billyGO test company found the average sale per member was more than 2.5x that of a non-member, and members produced 256% more revenue.", 2.5, "x average sale per member vs non-member", "SaaS per location plus messaging usage", 4,
  "https://sera.tech/blog/the-math-of-hvac-membership-plans"),
 ("Review & reputation agent", "Ask for a Google review by SMS/email after every completed job, draft owner responses within 48 hours, and flag detractors for service recovery before they post.", "customer",
  ["Podium", "NiceJob", "Birdeye", "ServiceTitan Reputation"],
  "BrightLocal's 2025 Local Consumer Review Survey finds 84% of consumers use Google to read reviews, and 96% are open to writing a review when asked properly.", 96, "% of consumers open to leaving a review when asked", "SaaS per location per month", 2,
  "https://www.brightlocal.com/research/local-consumer-review-survey-2025/"),
 ("AP/AR & bookkeeping agent", "Capture supplier invoices (distributor, parts, fuel), match them to POs and jobs, chase open A/R and financing fundings, and post entries for a multi-entity close across PA / NJ / new add-ons.", "office",
  ["Ramp", "BILL", "Vic.ai", "ServiceTitan Payments"],
  "Ardent Partners' State of ePayables 2025 puts the average cost to process an invoice at $12.42 against $2.65 for best-in-class automated AP teams, 79% lower.", 79, "% lower cost per invoice (best-in-class vs average)", "SaaS plus per-transaction / interchange", 8,
  "https://tradeshift.com/state-of-epayables-2025-report/"),
 ("Permit & inspection filing agent", "Pre-fill municipal mechanical, plumbing and electrical permits for each township from job data, track approvals and book inspections. This matters across ~250 PA municipalities plus NJ, MD and DE jurisdictions.", "office",
  ["PermitFlow", "Shovels (permit data)"],
  "PermitFlow says (vendor claim) its software delivers 2.5x faster permit approvals and a 90% reduction in permitting workload.", 90, "% reduction in permitting workload (vendor claim)", "SaaS / per-permit", 10,
  "https://www.permitflow.com/permit-management"),
 ("Recruiting screener & interview agent", "Chat with tech, apprentice and CSR applicants 24/7, screen licenses, EPA 608 and driving records, and schedule ride-along interviews automatically. Also feeds the trade-school pipeline.", "owner",
  ["Workday Paradox (Olivia)", "Workstream", "ServiceTitan hiring partners"],
  "Compass Group cut time-to-apply from 9 minutes to under 3 (-66%) with Workday Paradox, and 33% of candidate conversations happened outside business hours.", 66, "% reduction in time-to-apply", "Enterprise SaaS; SMB tiers per location", 6,
  "https://www.workday.com/en-us/customer-stories/a-h/compass-high-volume-hiring-with-conversational-ai.html"),
]
for n, a in enumerate(A, 1):
    agent, jtbd, who, vend, claim, val, unit, cost, wks, url = a
    add(id=f"pn-ai-{n:02d}", kind="ai_agent", agent=agent, job_to_be_done=jtbd, who_it_helps=who, vendor_examples=vend,
        metric_claim=claim, metric_value=val, metric_unit=unit, cost_model=cost, weeks_to_deploy=wks, source_url=url)

# 3. pro_program
P = [
 ("Thaddeus Stevens College of Technology partnership (Lancaster)", "technician",
  "Thaddeus Stevens College in Lancaster, minutes from Punctual Pros' HQ, reports a 97% placement rate for the class of 2024, 18 job opportunities per 2025 graduate and a $52,500 median first-year salary. Its HVAC programs sit in the Burnham Holdings Center for HVAC Technology.",
  18, "job opportunities per graduate (2025)", "Analyst assumption: $50-150K/yr for scholarships, lab equipment, a signing-bonus pool and in-lab recruiting days; competes with 1,200+ employers for graduates",
  "https://www.stevenscollege.edu/why-thaddeus-stevens-college/"),
 ("PA registered apprenticeship (earn-while-you-learn) - HVAC, plumbing, electrical", "technician",
  "Pennsylvania has 15,965 active registered apprentices and has added 194 new apprenticeship and pre-apprenticeship programs under Gov. Shapiro. The 2025-26 budget includes $12.5M for apprenticeship training and $3.5M for Schools-to-Work.",
  15965, "active registered apprentices in PA (Dec 2025)", "State grants offset classroom costs; PP pays apprentice wages on a step ladder (analyst: ~$18-22/hr start)",
  "https://www.pa.gov/agencies/dli/newsroom/invests--3-5-million-in-2025-26-budget-to-boost-apprenticeships"),
 ("Technician shortage - HVAC (BLS)", "technician",
  "BLS projects about 40,600 openings a year for HVAC mechanics and installers over 2025-35, with employment up 11%. The median wage was $61,010 in May 2025 across ~440,900 jobs.",
  40600, "annual US HVAC technician openings (2025-35)", "Context: wage inflation and recruiting cost drive the case for apprenticeship and AI leverage",
  "https://www.bls.gov/ooh/installation-maintenance-and-repair/heating-air-conditioning-and-refrigeration-mechanics-and-installers.htm"),
 ("Technician shortage - plumbing (BLS)", "technician",
  "BLS projects about 42,000 openings a year for plumbers, pipefitters and steamfitters, with employment up 7% over 2025-35. The median wage was $63,800 in May 2025 across ~510,600 jobs, and the trade needs a 4-5 year apprenticeship.",
  42000, "annual US plumber openings", "Context",
  "https://www.bls.gov/ooh/construction-and-extraction/plumbers-pipefitters-and-steamfitters.htm"),
 ("Technician shortage - electrical (BLS)", "technician",
  "BLS projects about 72,700 openings a year for electricians, with employment up 9% over 2025-35. The median wage was $63,190 in 2025 across ~821,000 jobs.",
  72700, "annual US electrician openings", "Context",
  "https://www.bls.gov/ooh/construction-and-extraction/electricians.htm"),
 ("Industry shortage estimate (ACCA / ACHR News)", "owner",
  "ServiceTitan, citing ACHR News, says the HVAC industry is short about 110,000 technicians, with around 25,000 leaving the workforce each year, and that the gap could reach 225,000 by 2027.",
  110000, "unfilled HVAC technician positions (industry estimate)", "Context; the estimate is not from an official statistical agency",
  "https://www.servicetitan.com/blog/hvac-technician-shortage"),
 ("Pay ladders, tool stipends & career paths (retention)", "technician",
  "ServiceTitan's trailing-12-month data to Jan 2026 shows annual technician turnover of 16% in HVAC (3.54-year tenure), 18% in plumbing and 21% in electrical.",
  16, "% annual HVAC technician turnover", "Analyst assumption: $1-2K/yr tool stipend per tech plus a published apprentice -> tech -> lead -> trainer -> manager ladder; the goal is turnover below 12%",
  "https://www.servicetitan.com/toolbox/state-of-the-trades/trends/technician-tenure-turnover-by-trade"),
 ("Local wage benchmark (Lancaster plumbing/HVAC, QCEW)", "technician",
  "BLS QCEW shows Lancaster County NAICS 23822 (plumbing/HVAC contractors) at 2,847 employees and $76,155 average annual pay in 2024, up from $62,157 in 2019 (+22.5%).",
  76155, "USD average annual pay, Lancaster 23822 (2024)", "Benchmark for pay-ladder design; wage growth outpaces CPI",
  QCEW_URL),
 ("Ride-along training & AI coaching at scale", "technician",
  "In five months Neighborly put Rilla's AI coaching in front of more than 2,000 service pros at 500+ franchise locations. It analyzed 375,000+ conversations, delivered ~4,000 coaching hours and lifted average ticket 13%.",
  375000, "customer conversations analyzed (5 months)", "Per-seat SaaS; replaces most in-truck manager ride-alongs",
  "https://www.franchise.org/?p=219252"),
 ("Contractor partner / overflow network", "owner",
  "Frontdoor (American Home Shield) runs a network of ~17,000 independent contractor firms, including ~4,200 preferred contractors who handled ~84% of its 2025 service requests. This shows that a vetted subcontractor network can absorb peak demand at scale.",
  17000, "independent contractor firms in Frontdoor network (2025)", "Analyst: PP pays referral or overflow fees to vetted local subs in fringe zips during storms. Under Authority Brands territory rules it needs franchisor approval",
  "https://www.stocktitan.net/sec-filings/FTDR/10-k-frontdoor-inc-files-annual-report-3f9879ae43b7.html"),
 ("Veteran hiring & ownership pipeline", "technician",
  "Authority Brands says 42 active military and veteran personnel became franchise owners in 2025, as the system added 246 owners and 340 territories. Veterans are also a hiring channel for technicians and field leaders.",
  42, "veteran franchise owners added by Authority Brands (2025)", "Low cost: DoD SkillBridge and Helmets to Hardhats placements; analyst assumption of a $0-5K recruiting cost per hire",
  AB_1851),
]
for n, p in enumerate(P, 1):
    prog, who, ev, val, unit, cost, url = p
    ret = REPO_RET if url == QCEW_URL else TODAY
    add(id=f"pn-pro-{n:02d}", kind="pro_program", program=prog, who_it_helps=who, evidence=ev, metric_value=val, metric_unit=unit,
        cost_note=cost, source_url=url, retrieved=ret)

# 4. growth_lever
G = [
 ("Website redesign & online booking", 5, 20, "% of jobs booked online",
  "Fewer than 5% of bookings at ServiceTitan shops were online before the Schedule Engine deal. The Eco Plumbers went from 0% to an expected 20% in three years, and most providers expect >30% online within three years.",
  "https://www.achrnews.com/articles/146728-servicetitan-acquires-schedule-engine"),
 ("Google Local Services Ads (pay-per-lead)", 43.9, 55, "% LSA lead book rate",
  "SearchLight's Feb 2026 benchmark covers 888 contractors and $6.72M of spend. It shows LSA leads at $53 average cost per lead (HVAC $51, plumbing $57, electrical $39), a 43.9% book rate and $233 per paying customer. Faster AI answering raises the book rate.",
  "https://searchlightdigital.io/google-local-service-ads-cost-per-lead/"),
 ("Local SEO & Google reviews", None, 9355, "Google reviews (target = Haller Enterprises benchmark)",
  "Haller Enterprises (Lititz, PA) is the largest independent competitor in the core and shows 9,355 Google reviews at a 4.8 rating. BrightLocal finds 84% of consumers read reviews on Google. Punctual Pros' own review count was not collected (null).",
  "https://www.hallerent.com/"),
 ("Memberships (Comfort Club economics)", 6500, 32000, "active members (analyst assumption; baseline unverified)",
  "Sera's analysis found members' average sale is more than 2.5x that of non-members, and members produce 256% more revenue. The baseline of ~6,500 members is an analyst assumption (~0.9% of 711,991 owner-occupied units in the 248 core zips).",
  "https://sera.tech/blog/the-math-of-hvac-membership-plans"),
 ("Generator / IAQ / water-treatment attach", 6.5, None, "% penetration of addressable US homes with home standby generators",
  "Generac's FY2025 annual report puts home standby penetration at ~6.5% of its addressable market (single-family, owner-occupied homes valued >$175K). Mister Sparky electricians can attach generators, and IAQ and water treatment ride on HVAC and plumbing visits.",
  "https://www.sec.gov/Archives/edgar/data/0001474735/000110465926051520/tm264770d2_ars.pdf"),
 ("Consumer financing attach", None, 14, "% higher spend for financed customers",
  "Synchrony's Tenth Annual Major Purchase Study (2025) found its cardholders spent $1,665 (14%) more on average than non-cardholders. Presenting financing on every replacement quote is the lever.",
  "https://www.synchrony.com/business/b2b/industries/heating-air-conditioning"),
 ("New-mover marketing engine", 2137, None, "meaningful home sales per 90 days in the 248 core zips (county deed records)",
  "American Home Shield's 2024 survey (n>1,000) found that 92% of new homeowners hit a home issue in year one, including electrical 20%, HVAC failure 16% and water heater failure 14%. 82% paid out of pocket, averaging $5,719. The repo's deed pull shows ~2,137 meaningful sales per quarter in PP's core zips.",
  "https://www.parealtors.org/blog/92-of-homeowners-experience-a-home-related-issue-in-year-one/"),
 ("Storm / weather surge growth plan", 20, 55, "% lift during a heat wave (calls -> revenue)",
  "ServiceTitan's study of ~800 HVAC shops found heat waves raise daily calls 20%, jobs 25% and revenue 55%. The first heat wave of the season lifts daily revenue ~90%, so staffing and marketing should be pre-positioned before the first event (see Punctual Pros demand model).",
  "https://www.servicetitan.com/blog/hvac-revenue-heat-waves"),
 ("Dynamic pricing & digital price book", None, 14, "% average-ticket lift (dispatch + price book)",
  "ServiceTitan reports Dispatch Pro customers raised average ticket 14%. Pricing every task flat-rate in a tablet price book with good/better/best options, then routing high-ticket jobs to the best closers, is the mechanism. ServiceTitan also cites that 66% of homeowners would rebook if mobile is part of the experience.",
  "https://www.servicetitan.com/features/pro/dispatch"),
 ("Territory productivity to top-quartile", 0.88, 3.06, "USD M revenue per territory",
  f"One Hour's 2026 FDD Item 19 shows FY2025 average revenue per territory of ${oh['avg_revenue_per_territory_usd']/1e6:.2f}M against ${oh['top25_territories_avg_usd']/1e6:.2f}M for top-quartile territories. Punctual Pros' estimated ~$22M across 25 territories (~$0.88M each) leaves room to grow inside its existing footprint.",
  FDD_URL),
]
for n, g in enumerate(G, 1):
    lever, base, target, unit, ev, url = g
    ret = REPO_RET if url in (FDD_URL, "https://www.hallerent.com/") else TODAY
    add(id=f"pn-lev-{n:02d}", kind="growth_lever", lever=lever, baseline=base, target=target, unit=unit, evidence=ev, source_url=url, retrieved=ret)

# 5. expansion_phase
MKT = {
 "hvac_services_us": {"value_usd": 17.93e9, "year": 2025, "note": "Mordor Intelligence US HVAC services (residential + commercial), 5.9% CAGR to $25.35B by 2031; an older Mordor vintage gives $21.16B", "source_url": "https://www.mordorintelligence.com/industry-reports/united-states-hvac-services-market"},
 "residential_hvac_equipment_us": {"value_usd": 26.5e9, "year": 2025, "note": "GMI manufacturer-level residential HVAC equipment (not services), 4.6% CAGR to $41.8B by 2035", "source_url": "https://www.gminsights.com/industry-analysis/us-residential-hvac-market"},
 "trade_workforce_us": {"hvac_jobs": 440900, "plumber_jobs": 510600, "electrician_jobs": 821000, "annual_openings_total": 40600 + 42000 + 72700, "source_url": "https://www.bls.gov/ooh/"},
 "authority_brands": {"brands": 15, "franchise_owners": "1,000+", "territories": "2,700+", "new_territories_2025": 340, "new_owners_2025": 246, "revenue_claim": ">$2B", "source_urls": [AB_1851, AB_URL]},
 "fdd_system_2025": {"one_hour_outlets": oh["territories_operated"], "ben_franklin_outlets": bf["territories_operated"], "mister_sparky_outlets": ms["territories_operated"],
                     "total_outlets": fdd_outlets, "franchisees": fdd_franchisees,
                     "reported_gross_revenue_usd": {"one_hour": oh["aggregate_gross_revenue_usd"], "ben_franklin": bf["aggregate_gross_revenue_usd"], "mister_sparky": ms["aggregate_gross_revenue_usd"], "total": fdd_rev},
                     "top_quartile_franchisee_avg_usd": {"one_hour": oh["top25_franchisees"]["avg_usd"], "ben_franklin": bf["top25_franchisees"]["avg_usd"], "mister_sparky": ms["top25_franchisees"]["avg_usd"]},
                     "largest_franchisee_usd": {"one_hour": oh["top25_franchisees"]["high_usd"], "ben_franklin": bf["top25_franchisees"]["high_usd"], "mister_sparky": ms["top25_franchisees"]["high_usd"]},
                     "note": "Item 19 aggregates cover reporting franchisees only", "source_urls": [FDD_URL, FDD_BF_URL, FDD_MS_URL]},
}
phases = [
 dict(phase="Phase 1 - Densify the PA core + adjacent ring", months="0-12",
      geography=["Lancaster", "York", "Dauphin", "Cumberland", "Berks", "Lebanon", "Franklin", "Adams", "Perry", "adjacent ring: Schuylkill, Lehigh, Chester, Montgomery, Northumberland PA; Frederick, Washington, Harford, Carroll, Cecil, Baltimore Co. MD"],
      thesis="Before buying geography, win the zips Punctual Pros already serves. Deploy the AI dispatcher, missed-call text-back, memberships and the new website across the 248 core zips. Lift revenue per territory toward the FDD top quartile. Close 1-2 founder-owned tuck-ins inside the core, such as Lancaster Plumbing Heating Cooling & Electrical and Zimmerman, to add trucks and technicians where route density already exists. This mirrors Smith + Howard's first year: build the operating system (leadership, tech, AI), then make the first add-on (Market Street Partners).",
      data_points={"core_zips": len(core), "core_zips_by_state": dict(collections.Counter(r["state"] for r in core)), "core_zips_by_county": core_by_county,
                   "core_housing_units": core_hu, "core_owner_occupied_units_est": core_owner, "core_tier1_zips": core_tier1, "core_go_now_zips": core_gonow,
                   "adjacent_tier1_zips_by_state": adj_t1_by_state, "adjacent_tier1_zips_total": len(adj_t1), "adjacent_tier1_housing_units": adj_t1_hu,
                   "adjacent_tier1_housing_units_by_state": adj_t1_by_state_hu, "adjacent_tier1_top_counties": adj_t1_top_counties,
                   "pp_territories_fdd": {"total": pp_terr["total_territories"], "PA": pp_terr["PA_territories"], "NJ": pp_terr["NJ_territories"]},
                   "pa_addon_targets": tg_by_state.get("PA"), "pa_addon_targets_fit70plus": tg_fit70_by_state.get("PA"),
                   "pa_targets_modeled_revenue_usd": tg_rev_by_state.get("PA"), "top_ranked_targets": tg_top,
                   "basis": "python3 over data/pp_zips.json (columnar decode), data/research/ma_targets_pp.json, data/research/pp_filings.json"},
      market_evidence=[f"One Hour FY2025 avg revenue per territory ${oh['avg_revenue_per_territory_usd']:,} vs top-quartile ${oh['top25_territories_avg_usd']:,} (2026 FDD Item 19).",
                       "Heat waves lift HVAC daily revenue 55% on average and ~90% for the first event of a season (ServiceTitan, ~800 shops).",
                       "Only 52% of home-services callers reach a person (Invoca 2026)."],
      kpi_targets={"revenue_usd": 38_000_000, "ebitda_usd": 5_300_000, "technicians": 135, "territories": 32, "members": 11_000},
      source_urls=[FDD_URL, "https://www.servicetitan.com/blog/hvac-revenue-heat-waves", "https://invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026", BSP_PP_URL]),
 dict(phase="Phase 2 - Tuck-ins across PA, NJ, MD, DE and southern NY", months="9-24",
      geography=["Central & Eastern PA", "Jersey Shore (Ocean, Monmouth) + South Jersey", "Northern MD", "Delaware", "Southern NY (Southern Tier, lower Hudson)"],
      thesis="Repeat the Horvath play (Dec 2024, first out-of-state deal) by buying Authority Brands franchisees and strong independents next to PA and NJ hubs, then convert independents to the tri-brand where Authority grants the territory. The 17 PE sponsors tracked in the private-equity landscape as overlapping Punctual Pros (e.g., Sila/Goldman, Legacy/Gridiron, Ally/Watchtower, Northwinds/TruArc, Wrench/Leonard Green) are bidding for the same founders. Broad Sky's edge is the operator growth plan plus the AI stack, which raises a tuck-in's margin within 12 months. This is Smith + Howard's 2024-25 cadence: several deals a year, each adding a new state or a new service line.",
      data_points={"addon_targets_by_state": tg_by_state, "addon_targets_fit70plus_by_state": tg_fit70_by_state,
                   "addon_targets_modeled_revenue_usd_by_state": tg_rev_by_state, "addon_targets_modeled_employees_by_state": tg_emp_by_state,
                   "authority_territories_mapped": ab_total, "authority_territories_by_state": ab_by_state,
                   "authority_territories_pp_owned_or_inferred_by_state": ab_pp_by_state, "authority_territories_not_pp_by_state": ab_non_pp_by_state,
                   "authority_territories_linked_to_ranked_targets": ab_linked_targets, "authority_territories_by_brand": ab_by_brand,
                   "noncore_tier1_zips_by_state": nc_t1_by_state, "noncore_tier1_housing_units_by_state": nc_t1_hu_by_state,
                   "noncore_go_now_zips_by_state": gonow_by_state,
                   "metros": [nj_shore, nj_south, md_north, ny_south],
                   "pe_sponsors_overlapping_punctual_pros": len(pp_spons), "pe_sponsor_threat_mix": pp_spons_threat, "pe_sponsors_high_threat": pp_spons_high,
                   "fdd_franchised_outlets_end_2025": {"PA": pa_outlets, "NJ": nj_outlets},
                   "basis": "python3 over data/research/ma_targets_pp.json (items + meta.authority_brands_territory_map), data/pp_zips.json, data/research/pe_landscape.json, data/research/pp_filings.json"},
      market_evidence=[f"PA has {pa_outlets} and NJ {nj_outlets} franchised One Hour / Ben Franklin / Mister Sparky outlets (2026 FDD Item 20); Punctual Pros operates 25 of them.",
                       "GF Data: sub-$25M TEV deals price at 6.3-6.9x EBITDA vs 10.0x for $100-250M TEV (H1 2025), which is the buy-and-build multiple arbitrage.",
                       "Authority Brands added 340 territories and 246 owners in 2025, so the franchisor is growing its system, which helps territory approvals."],
      kpi_targets={"revenue_usd": 65_000_000, "ebitda_usd": 9_800_000, "technicians": 230, "territories": 44, "members": 20_000},
      source_urls=[HORVATH_URL, "https://middlemarketgrowth.org/gf-data-report-h1-2025/", AB_1851, fil["pp-fil-021"]["source_url"]]),
 dict(phase="Phase 3 - Mid-Atlantic hub along I-81 / I-95", months="18-36",
      geography=["Baltimore", "Washington DC (MD suburbs)", "Richmond, VA", "Philadelphia suburbs (Montgomery, Chester, Bucks, Delaware)", "Pittsburgh"],
      thesis="Win a metro anchor in each of four or five large Mid-Atlantic metros (1M+ housing units each), as Fahrenheit Advisors gave Smith + Howard its first Mid-Atlantic office. Run them through one shared contact center, AI dispatch, pricing, finance and recruiting backbone in Lancaster. Pittsburgh (Pittsburgh Classic Air Care holds 6 One Hour territories) and the 19 mapped MD Authority territories are the obvious franchise-to-franchise conversations. Fund the larger anchor deals with a Broad Sky co-invest SPV like the TS, FL and CET vehicles.",
      data_points={"metros": [bal, dcmd, phl, pgh], "richmond_va": "not in data/pp_zips.json (VA not modeled); needs a separate ZIP pull",
                   "authority_territories_md": ab_by_state.get("MD"), "authority_territories_md_not_pp": ab_non_pp_by_state.get("MD"),
                   "authority_territories_western_pa_outside_screen": sum(1 for x in abm if "Western PA" in x["owner_status"]),
                   "fdd_other_pa_one_hour_franchisees": pp_terr.get("other_PA_one_hour_franchisees_listed"),
                   "md_tier1_zips_noncore": nc_t1_by_state.get("MD"), "md_tier1_housing_units": nc_t1_hu_by_state.get("MD"),
                   "basis": "python3 over data/pp_zips.json (county filters), data/research/ma_targets_pp.json meta.authority_brands_territory_map, data/research/pp_filings.json"},
      market_evidence=["US HVAC services market ~$17.9B (2025), growing ~5.9%/yr (Mordor Intelligence).",
                       "BLS: ~155,300 annual openings across HVAC (40,600), plumbing (42,000) and electrical (72,700), so a talent engine is a moat at metro scale.",
                       "Smith + Howard entered VA through Fahrenheit Advisors (140+ professionals), its first Mid-Atlantic office."],
      kpi_targets={"revenue_usd": 100_000_000, "ebitda_usd": 16_000_000, "technicians": 350, "territories": 58, "members": 32_000},
      source_urls=["https://www.mordorintelligence.com/industry-reports/united-states-hvac-services-market", "https://www.bls.gov/ooh/installation-maintenance-and-repair/heating-air-conditioning-and-refrigeration-mechanics-and-installers.htm",
                   "https://www.cpapracticeadvisor.com/2024/12/12/smith-howard-acquires-fahrenheit-advisors-in-virginia/152764/", SPV_URL]),
 dict(phase="Phase 4 - National consolidator inside the Authority Brands network", months="36-60",
      geography=["Authority Brands franchise system nationwide (One Hour, Ben Franklin, Mister Sparky)", "priority: Sun Belt and Midwest multi-territory franchisees"],
      thesis="Become the largest multi-brand operator in the One Hour / Benjamin Franklin / Mister Sparky system by buying multi-territory franchisees whose founders want liquidity, and plug them into Punctual Pros' AI and talent operating system. Exit as a scaled ~$100M+ revenue national company to a larger sponsor or strategic, as Smith + Howard went to TPG Growth with ~4x revenue. The FDD shows the size of the pool: over a thousand outlets, ~280 franchisees, and the largest single franchisees at $31-73M of revenue.",
      data_points={"fdd_system_outlets_end_2025": {"one_hour": oh["territories_operated"], "ben_franklin": bf["territories_operated"], "mister_sparky": ms["territories_operated"], "total": fdd_outlets},
                   "fdd_franchisees_end_2025": fdd_franchisees, "fdd_reported_gross_revenue_fy2025_usd": fdd_rev,
                   "pp_share_of_tri_brand_outlets_pct": round(100 * pp_terr["total_territories"] / fdd_outlets, 2),
                   "largest_franchisee_revenue_usd": MKT["fdd_system_2025"]["largest_franchisee_usd"],
                   "top_quartile_franchisee_avg_usd": MKT["fdd_system_2025"]["top_quartile_franchisee_avg_usd"],
                   "authority_brands_territories": "2,700+", "authority_brands_owners": "1,000+", "authority_brands_brands": 15,
                   "basis": "python3 over data/research/pp_filings.json (FDD Items 19/20) plus Authority Brands 2025 growth release"},
      market_evidence=[f"Tri-brand FY2025 reported gross revenue ${fdd_rev/1e6:,.1f}M across {fdd_outlets:,} outlets (2026 FDDs).",
                       "Authority Brands: 15 brands, 1,000+ owners, 2,700+ territories; claims >$2B revenue.",
                       "GF Data Q2 2026: initial-buyout total debt 2.9x EBITDA at a 7.0x average valuation, so equity-heavy structures dominate and a co-invest is needed for large buys."],
      kpi_targets={"revenue_usd": 175_000_000, "ebitda_usd": 29_000_000, "technicians": 600, "territories": 85, "members": 55_000},
      source_urls=[FDD_URL, FDD_BF_URL, FDD_MS_URL, AB_1851, AB_URL, "https://www.acg.org/news-trends/news/gf-data-reports-show-steady-middle-market-deal-flow-amid-more-selective"]),
]
for n, ph in enumerate(phases, 1):
    ph["kpi_targets"]["basis"] = "Analyst assumption, not company guidance; anchored to FY2025 est. revenue ~$22M / adj. EBITDA ~$2.6M / 25 territories (Punctual Pros filings estimate table)"
    add(id=f"pn-phase-{n}", kind="expansion_phase", **ph, source_url=ph["source_urls"][0])

# 6. financing
F = [
 ("Senior credit facility headroom (delayed-draw term loan)", "$1.4M unfunded DDTL in PGIM Private Credit Fund's slice; total facility likely ~$10-18M (estimate)",
  "PGIM Private Credit Fund's 6/30/2026 10-Q lists a first-lien term loan to Punctual Pros Midco, LLC: $4.83M par at 3M SOFR+5.00% (8.73% all-in), due 3/26/2029, plus a $1.4M unfunded delayed-draw commitment. That is a sponsor unitranche with an acquisition line; other PGIM accounts likely hold more.",
  PGIM_URL, REPO_RET),
 ("Broad Sky Fund I equity (follow-on capital)", "Fund I $335.0M sold (46 investors); PP entry check est. ~$8-15M",
  "Broad Sky Partners, LP's Apr 2025 Form D/A reports $335.0M sold to 46 investors. Form ADV Schedule D shows $414.2M gross asset value, and no Punctual Pros-specific vehicle exists, so add-ons so far are funded from the main fund and debt.",
  FORMD_URL, REPO_RET),
 ("Deal-specific co-invest SPV (template from TS / FL / CET)", "$7.5M-$95M per company historically",
  "Broad Sky has raised deal-level co-invest for other portfolio companies: BSP-TS Co-Invest I ($35.9M) and II ($59.6M), BSP-FL Co-Invest ($30.0M of $37.5M offered) and BSP-CET Co-Invest ($7.5M, 1 investor). A Punctual Pros co-invest would fund the larger Phase 3-4 deals.",
  SPV_URL, REPO_RET),
 ("Seller rollover equity", "20-35% of tuck-in consideration (typical)",
  "GHJ / FocalPoint find typical rolled equity today ranges from 20% to 35% in most PE transactions (range 5-49%). Founder rollover cuts the cash at close and keeps sellers like Frank Horvath aligned to the exit.",
  "https://www.ghjadvisors.com/ghj-insights/trends-in-deal-structures-rollover-equity", TODAY),
 ("Typical lower-middle-market leverage", "2.9-3.3x total debt / EBITDA",
  "GF Data reports total debt/EBITDA for initial (non-add-on) buyouts of 2.9x in Q2 2026 (down from 3.4x), with senior debt pricing at 7.8% and an average valuation of 7.0x TTM adjusted EBITDA. Expect equity-heavy add-on funding.",
  "https://www.acg.org/news-trends/news/gf-data-reports-show-steady-middle-market-deal-flow-amid-more-selective", TODAY),
 ("Multiple arbitrage (buy small, sell scaled)", "6.3-6.9x entry (sub-$25M TEV) vs 10.0x ($100-250M TEV)",
  "GF Data H1 2025: sub-$25M TEV deals averaged 6.3-6.9x EBITDA while $100-250M TEV deals priced at 10.0x. Rolling ~$2-5M-EBITDA tuck-ins into a ~$16-29M-EBITDA company creates value even before synergies.",
  "https://middlemarketgrowth.org/gf-data-report-h1-2025/", TODAY),
]
for n, f in enumerate(F, 1):
    s, amt, ev, url, ret = f
    add(id=f"pn-fin-{n:02d}", kind="financing", source_of_funds=s, amount_or_range=amt, evidence=ev, source_url=url, retrieved=ret)

# ---------------- meta ----------------
counts = dict(collections.Counter(i["kind"] for i in items))
narrative = (
 "Punctual Pros can follow the Smith + Howard growth plan: Broad Sky took a single-office Atlanta firm with ~100 professionals to ~800 professionals, 11 locations, nine acquisitions and ~4x revenue in 3.5 years, then sold it to TPG Growth. "
 f"Punctual Pros starts from a similar base: ~$22M estimated FY2025 revenue, 25 Authority Brands territories, {len(core)} core Central-PA zips with ~{core_hu/1e6:.1f}M housing units, and one out-of-state add-on (Horvath, Jersey Shore). "
 f"Phase 1 (months 0-12) densifies the core and the {len(adj_t1)} Tier-1 adjacent zips ({adj_t1_by_state.get('PA',0)} PA, {adj_t1_by_state.get('MD',0)} MD) and closes 1-2 tuck-ins from the 61-company target screen. "
 f"Phase 2 (9-24) repeats the Horvath deal across PA, NJ, MD, DE and southern NY, where {len(ab_non_pp)} mapped Authority territories are not yet owned by Punctual Pros and {len(pp_spons)} PE sponsors are competing for the same founders. "
 "Phase 3 (18-36) builds a Mid-Atlantic hub along I-81/I-95 (Baltimore-DC, Richmond, Philadelphia suburbs, Pittsburgh), just as Fahrenheit Advisors gave Smith + Howard its first Mid-Atlantic office. "
 f"Phase 4 makes Punctual Pros the national consolidator inside the One Hour / Ben Franklin / Mister Sparky system: {fdd_outlets:,} outlets and ${fdd_rev/1e6:,.0f}M of reported revenue, where Punctual Pros holds ~{100*pp_terr['total_territories']/fdd_outlets:.1f}% today. "
 "The redesigned website is only the front door; the real leverage is an AI layer: a 24/7 voice dispatcher (ServiceTitan reports 70% booking, 90% capacity-adjusted), missed-call text-back, AI estimating that recovered $1.2M of unsold estimates at a $20M peer, Rilla coaching that lifted a Mister Sparky's ticket 25%, AI dispatch, and back-office agents for AP, permits and recruiting. "
 "Just as important, the plan helps the pros themselves: a Thaddeus Stevens College pipeline (97% placement, 18 job opportunities per graduate), PA earn-while-you-learn apprenticeships, pay ladders and tool stipends against 16-21% annual technician turnover, AI copilots that make junior techs productive faster, and veteran hiring. "
 "That matters because BLS projects ~155,000 HVAC, plumbing and electrical openings a year nationally, so technician capacity, not demand, is the binding constraint. "
 "Growth levers stack on top: online booking, Google LSA and reviews, memberships (members spend 2.5x more), financing, generator and IAQ attach, new-mover marketing from the deed feed, and a weather-surge plan. "
 "Funding comes from the existing unitranche and its delayed-draw line, 20-35% seller rollover, Fund I follow-ons and, for larger company deals, a co-invest SPV like those for Thomas Scientific, Frontline and CET, at today's equity-heavy ~2.9-3.3x leverage. "
 "The exit thesis is multiple arbitrage plus organic growth: buy tuck-ins at ~6-7x, build a ~$100M+ revenue, AI-enabled national company, and sell it in the 10x+ tier, as Smith + Howard went to TPG."
)
kpi_roadmap = [
 {"month": 0, "revenue_usd": 24_000_000, "ebitda_usd": 2_900_000, "technicians": 85, "territories": 25, "members": 6_500,
  "note": "ASSUMPTION. Oct 2026 run-rate = FY2025 est. ~$22M grown ~8% (2025 system same-store sales +8.4-14.3%); EBITDA ~12%; technicians ~60-65% of ~130-150 staff; members ~0.9% of core owner-occupied units."},
 {"month": 12, "revenue_usd": 38_000_000, "ebitda_usd": 5_300_000, "technicians": 135, "territories": 32, "members": 11_000,
  "note": "ASSUMPTION. Phase 1 complete: +10-12% organic from AI answering/booking and memberships, plus 2 tuck-ins (~$10M acquired revenue); margin ~14%."},
 {"month": 24, "revenue_usd": 65_000_000, "ebitda_usd": 9_800_000, "technicians": 230, "territories": 44, "members": 20_000,
  "note": "ASSUMPTION. Phase 2 tuck-ins in NJ / MD / DE / southern NY plus the first Phase 3 metro anchor; margin ~15% from shared contact center and AI dispatch."},
 {"month": 36, "revenue_usd": 100_000_000, "ebitda_usd": 16_000_000, "technicians": 350, "territories": 58, "members": 32_000,
  "note": "ASSUMPTION. Mid-Atlantic hub (~4.5x FY2025 revenue in ~3 years, the Smith + Howard ~4x analog); margin ~16%; exit-ready national company story."},
]
meta = {
 "dataset": "pp_nationwide",
 "title": "How Broad Sky takes Punctual Pros nationwide: Smith + Howard template, AI agents, pro programs, growth levers, expansion phases, financing",
 "generated": TODAY,
 "method": "Template events come from Broad Sky, Smith + Howard and Frontline releases plus Accounting Today, CPA Practice Advisor and Inside Public Accounting coverage, fetched 2026-10-06. AI-agent, pro-program and growth-lever evidence comes from vendor case studies (ServiceTitan, Rilla, XOi, Workday Paradox, PermitFlow), industry benchmarks (Invoca 2026, BrightLocal 2025, SearchLight Feb 2026, Ardent Partners 2025, GF Data, Synchrony) and government sources (BLS OOH 2025-35, BLS QCEW, PA L&I). Each claim was read on the cited page except where a caveat says otherwise. Expansion-phase data points were computed with python3 from repo datasets: data/pp_zips.json (columnar, decoded with cols/enums/rows; core = service-territory flag 1; adjacent = adjacent to service territory 1; Tier = opportunity tier), data/research/ma_targets_pp.json (items and meta.authority_brands_territory_map), data/research/pe_landscape.json (overlap with BSP contains 'punctual_pros'), data/research/pp_filings.json (FDD Items 19/20, PGIM 10-Q, Form D/ADV). KPI targets and KPI roadmap are labelled analyst assumptions anchored to pp_filings' FY2025 estimates.",
 "caveats": [
  "Smith + Howard is the closest Broad Sky precedent for a regional-to-national build: an Atlanta accounting and advisory firm (not a law firm) that Broad Sky sold to TPG Growth in August 2026. Frontline Managed Services serves law firms but was already national at entry, so it appears only as a secondary analog (3 items).",
  "Smith + Howard has exited the portfolio, so it has no portal module; it appears here only as the template timeline inside the Punctual Pros evidence base.",
  "Add-on count conflict: BSP's Aug 2026 release says 'nine strategic acquisitions', while BSP's Smith + Howard portfolio page lists 5 add-ons. Named transactions found: Market Street Partners, JMM CPAs, VIP Search + VIP Solutions (one transaction), Fahrenheit Advisors, Smith Kesler & Co., Horton Lee & Burnett, BPS and Geels Norton. Counting VIP Search and VIP Solutions separately reaches nine; that split is an analyst reconciliation.",
  "Smith + Howard entry revenue was not disclosed. Known figures are FY23 $53.2M, FY24 $74.2M and ~$175M expected for 2026; '~4x' is BSP's own claim. The India delivery center date and city are not public.",
  "AI-agent metrics are mostly vendor-published case studies or vendor claims (ServiceTitan, Rilla, XOi, PermitFlow, Paradox) and represent selected customers, not controlled studies. Treat them as directional upper-bound benchmarks.",
  "Punctual Pros' current membership count, review count, online-booking share and technician headcount are not public. Baselines marked 'analyst assumption' or null must be replaced with company data.",
  "Market-size figures vary by publisher: Mordor's US HVAC services estimate is $17.93B (2025) in its latest vintage and $21.16B in an older one. GMI's $26.5B is residential equipment, not services. No residential-only plumbing or electrical services size was verified.",
  "Richmond, VA is named in Phase 3, but data/pp_zips.json covers only PA, NJ, MD, NY and WV, so it has no ZIP metrics; DE also has no ZIP rows. Authority territory counts cover only the 66 PA/NJ/MD/DE locations parsed in Punctual Pros add-on targets, not the national system.",
  "Expanding the franchise footprint needs Authority Brands' territory approval and transfer consent. Converting independents to franchise brands, or acquiring outside the franchise system, may face territorial restrictions not analysed here.",
  "Generac's ~6.5% home-standby penetration and the Frontdoor 10-K figures were taken from summaries of the filings (SEC ARS PDF; StockTitan 10-K summary), not read line by line.",
 ],
 "item_count": len(items),
 "item_counts_by_kind": counts,
 "narrative": narrative,
 "kpi_roadmap": kpi_roadmap,
 "anchors": {"fy2025_revenue_est_usd": 22_000_000, "fy2025_revenue_range_usd": [16_000_000, 28_000_000], "fy2025_adj_ebitda_est_usd": 2_600_000,
             "staff_est": "~130-150", "territories": pp_terr["total_territories"], "source": "data/research/pp_filings.json meta.estimate_table"},
 "market_evidence": MKT,
}
out = {"meta": meta, "items": items}
p = os.path.join(R, "pp_nationwide.json")
with open(p, "w") as fh:
    json.dump(out, fh, indent=1, ensure_ascii=False)
print(p, len(items), counts)
