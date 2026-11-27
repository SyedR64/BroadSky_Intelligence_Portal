# Public legal records: where they can be read, and what the first slice uses

Survey of 27 November 2026 for the legal records layer of Broad Sky OS. It covers federal district courts, state and municipal
courts, UCC liens, business-entity registries, property records, professional and contractor licences, and public contract
awards, starting with the states the six companies work in.

How to read it. Every claim is marked **Verified by fetching** (a request was made on 27 November 2026 and the answer is noted)
or **Not verified** (from memory, a search result or a page that would not load). Three research passes wrote Parts 1 to 3;
they are kept as written. Nothing here is legal advice, and no site's terms of use were read in full unless a part says so.

Rules the survey and the build kept: public pages and endpoints only; no login, account, key, payment or CAPTCHA was used or
attempted; where a site showed a bot check the pass stopped and recorded it. Records are about companies. A private person is
never looked up or stored.

## Summary

| Record type | Open and machine-readable today | Closed, or behind a check | Would need an account or payment |
|---|---|---|---|
| Federal district and bankruptcy courts | CourtListener's public search feed over the RECAP archive (20 results a call, no key); per-court CM/ECF RSS feeds (about one day each; 12 of 15 tried answered); GovInfo opinions | CourtListener REST API answers 401 without a token | A free CourtListener account gives an API token; PACER charges $0.10 a page, capped at $3 a document, waived under $30 a quarter |
| State and municipal courts | City open data only: NYC OATH hearings, NYC housing litigation, Chicago ordinance violations, Philadelphia L&I | Maryland, Rhode Island, New York, New Hampshire, New Jersey, Cook County and DC answered with bot checks or blocks; Massachusetts and Connecticut disallow all agents in robots.txt; Missouri forbids scraping; Delaware bars commercial use | Paid aggregators (UniCourt, Docket Alarm, CourtLink, Trellis) are the realistic route to state dockets |
| UCC liens | Connecticut (daily, business and individual debtors in separate fields); Colorado; Oregon as a one-month slice | Pennsylvania, New York, Massachusetts, New Hampshire, Missouri, California, Florida, Delaware, Maryland, Rhode Island, Illinois, DC search pages showed bot checks or would not load | Paid lien vendors publish no prices |
| Business-entity registries | Connecticut (master, filing history, name changes); New York; Colorado; Oregon; Pennsylvania and Iowa (monthly) | Most Secretary of State search pages sit behind a bot check | OpenCorporates needs a key (free only for open-licensed products) |
| Property records | NYC ACRIS, Philadelphia deeds, Connecticut sales, New Jersey parcels, Maryland real property, Cook County sales, DC tax roll | Massachusetts land records and several county recorders | National vendors (ATTOM, CoreLogic, Regrid) |
| Licences | Connecticut credentials and home-improvement contractors, Delaware business licences, NYC buildings licences, DC business licences | Massachusetts, Rhode Island, New Hampshire, Pennsylvania's home-improvement search, Illinois | None found that is worth paying for first |
| Public contract awards | USAspending (no key); NYC, Chicago, DC, Connecticut, Massachusetts, New Jersey, Delaware and Maryland spending data | Illinois BidBuy shows a login | SAM.gov needs a key |

## What the first slice uses

Built and run on 27 November 2026 by `scripts/refresh_legal.py`, for 30 named companies already in `data/research`
(competitors, add-on targets and sector rivals, a few for each portfolio company):

| Source | Record type | Route | Verified |
|---|---|---|---|
| CourtListener public search feed (RECAP archive) | Federal district and bankruptcy dockets | `https://www.courtlistener.com/feed/search/?q=caseName:"…"&type=r`, one call a company | Verified by fetching: HTTP 200, 20 entries, rights line "Created for the public domain by Free Law Project" |
| Connecticut UCC lien filings | Liens | `https://data.ct.gov/resource/xfev-8smz.json`, business debtors only, active liens | Verified by fetching: HTTP 200, rows returned |
| USAspending | Federal contract awards | `POST https://api.usaspending.gov/api/v2/search/spending_by_award/`, recipient name then an exact check of the returned name | Verified by fetching: HTTP 200; the name search is loose, so every row is checked |

Written but not in the first refresh, because their text searches were slow on the day (run with `--all` or `--only`):
the Connecticut Business Registry (entity filings), Connecticut licences, the New York corporation registry and Delaware
business licences. No property source is in the build yet.

What the build does with a private person: an individual debtor is skipped; a private party in a case caption is written
"Individual"; a docket link is stored with a neutral last word in place of the case name (checked in a browser: it opens the docket). Officer names, agent names and email
addresses in registry rows are dropped.

## Options that need the owner

- **A free CourtListener account.** Its token opens the REST API (docket numbers, nature of suit, party lists, alerts). Default limits per the docs: 5 a minute, 50 an hour, 125 a day. Not verified beyond the docs page.
- **PACER.** The official federal dockets and documents, per-page fees as above. An account and a payment method are needed.
- **A state-docket vendor.** UniCourt lists $59, $199 and $399 a month; Docket Alarm $39.99 a month plus fees or $99 a user a month; CourtLink and Trellis are by quote (Trellis pricing not verified).
- **OpenCorporates or a Secretary of State API vendor** for the states whose registries are closed. Prices in Part 2.

## Part 1 · Federal, state and municipal courts


Survey date: 27 Nov 2026. Method: curl with User-Agent `legal-records-survey/1.0`, a handful of requests per site, no login, no key, no CAPTCHA bypass. Test names used: "Horizon Services", "IES Holdings". Raw fetches are in the session scratchpad folder `s/`.

Labels: **V** = Verified by fetching (27 Nov 2026). **NV** = Not verified (memory or a secondary page; the source is named). No legal advice. Terms of use are paraphrased.

---

### Federal district courts

| Source | Holds | Machine-readable route | Cost | Terms on automated use | Login / CAPTCHA | Coverage | Verified? |
|---|---|---|---|---|---|---|---|
| CourtListener / RECAP archive (Free Law Project) | Federal dockets, docket entries, parties, some documents (district, appeal, bankruptcy), plus opinions | Atom search feed `https://www.courtlistener.com/feed/search/?q=...&type=r` (no key). REST API v4 `https://www.courtlistener.com/api/rest/v4/` (token needed). Bulk CSV on S3 `https://com-courtlistener-storage.s3-us-west-2.amazonaws.com/?list-type=2&prefix=bulk-data/` | Free. Higher API limits by membership or commercial agreement (price not seen) | Not readable: `robots.txt` and `/terms/` returned 403 to my client. API docs ban more than one account per person, project or organization | Feed: none. API: anonymous gets 401 (v4) and 403 (v3). Token comes from a free account profile | Everything RECAP has gathered, not everything in PACER. Fresh dockets depend on court RSS feeds, which have gaps. Bulk dockets snapshot dated 2026-09-30 | Mostly V (see notes) |
| PACER (and PACER Case Locator) | Official dockets, filings, party names, judgments for all federal courts | None public. Per-court `rss_outside.pl` RSS feeds (below). CM/ECF is web only | $0.10 per page, $3 cap per document, fees waived if you spend $30 or less in a quarter. Case-finding by name search is also charged | Not read (policy page URL returned 404). NV | Account required. Case Locator page loads, search sits behind login | All federal courts; filings back to each court's go-live | Fees V; terms NV |
| Court CM/ECF RSS feeds (free) | Newest docket entries: case number, caption, entry text, link to docket | `https://ecf.<court>.uscourts.gov/cgi-bin/rss_outside.pl` | Free | No `robots.txt` on the PAED ECF host (404). No terms read. NV | None for the feed. Docket links behind it need PACER login | Rolling window of about one day only. Not an archive | V (table below) |
| GovInfo USCOURTS (opinions) | Written opinions from selected appellate, district, bankruptcy courts | Sitemaps with no key: `https://www.govinfo.gov/sitemap/USCOURTS_sitemap_index.xml`. Per-case MODS metadata and PDF with no key. API `https://api.govinfo.gov/collections/USCOURTS/...` needs api.data.gov key | Free | US government work, public domain per GovInfo policy page. Robots lists the sitemaps | No login or CAPTCHA on sitemaps and files. API gives 401 `API_KEY_MISSING` without a key | 2005 to 2026 for most of my districts. S.D.N.Y. absent. Opinions only, not dockets | V |

#### Notes with evidence

**CourtListener**
- V: `GET /api/rest/v4/search/?q=%22Horizon+Services%22&type=r` returned HTTP 401, body `Authentication credentials were not provided.` Your finding is confirmed.
- V: `GET /api/rest/v3/search/?q=x` returned HTTP 403, body says anonymous users have no API permission. Confirmed.
- V: Atom feed for "Horizon Services" returned HTTP 200, `application/atom+xml`, 20 entries, rights line "Created for the public domain by Free Law Project". 17 of 20 entries were E.D. Pa. Entry fields: title, docket link, published date, court (as `author`), empty summary. Confirmed.
- V: Second feed call, `q="IES Holdings"&type=r&order_by=dateFiled desc`, returned HTTP 200 and 20 entries dated 2026-08-31 back to 2023-01-27. Matching is loose (one hit was a school district), so a company-name watch needs a check on each hit. The feed cap is 20 entries per call. No pagination seen.
- V: Rate limits, from the v4 docs (wiki.free.law, REST API v4.7): authenticated users get 5 requests per minute, 50 per hour, 125 per day by default. Membership or commercial agreement raises it. The docs say the limits roll and all apply at once. These figures are low; I expected higher. Take them from the page, not memory.
- V: Docs say token auth is the programmatic route and the token is on your profile page, so a free account is required. I did not create one.
- V: Bulk data is on a public S3 bucket, CSV snapshots (not deltas). `dockets-*.csv.bz2` has 37 files; newest `dockets-2026-09-30.csv.bz2`, about 5.1 GB. No `docket-entries-` or `parties-` files under `bulk-data/` in my listing. The bulk docs list dockets but not entries.
- V: Coverage page says RECAP holds "hundreds of millions of docket entries" and gains about 100,000 entries on a typical day. It says its alert coverage depends on court RSS, with gaps for courts with none or partial feeds.
- NV: Terms of use and `robots.txt`. CloudFront blocked my client (HTTP 403 on both). That blocking is itself a finding. The feed's "public domain" rights line is the only terms text I saw.

**PACER**
- V: `https://pacer.uscourts.gov/pacer-pricing-how-fees-work` HTTP 200. Says $0.10 per page, $3 cap per document, billing only if more than $30 in a quarter, $30 per name for staff-run searches, search-result pages are charged, "Search by Case Number instead of Party Name" to avoid fees.
- V: `https://pcl.uscourts.gov/pcl/index.jsf` HTTP 200, shows PACER login and menus. No anonymous search seen.
- V: `https://pacer.uscourts.gov/robots.txt` HTTP 200 but it is a generic CMS file, nothing about court data.
- NV: PACER terms on automated access (the `/policy-and-rules` URL I guessed returned 404).

**Court RSS feeds** (HTTP status from my single fetch of `https://ecf.<court>.uscourts.gov/cgi-bin/rss_outside.pl`)

| Court | HTTP | Items | Span | Entry types |
|---|---|---|---|---|
| PAED | 200 | 27 | 26 Nov 14:35 to 27 Nov 09:25 | all |
| PAMD | 200 | 0 (empty body) | none | not provided |
| PAWD | 200 | 6 | 26 Nov 18:23 to 27 Nov 09:40 | order, order-cr, motion, cmp |
| NJD | 200 | 48 | 26 Nov 11:51 to 27 Nov 09:17 | all |
| DED | 500 (twice) | 0 | none | server error |
| MDD | 200 | 0 (empty body) | none | not provided |
| MAD | 200 | 13 | 26 Nov 13:49 to 26 Nov 22:02 | partial list (answer, motion, minutes, ...) |
| CTD | 200 (first try timed out) | 171 | 26 Nov 13:36 to 27 Nov 09:41, plus one item stamped year 3926 | all |
| RID | 200 | 2 | 26 Nov 20:28 to 21:23 | all |
| NHD | 200 | 1 | 26 Nov 15:48 | all |
| NYSD | 200 | 55 | 26 Nov 10:14 to 27 Nov 06:26 | partial list |
| NYED | 200 | 0 (empty body) | none | not provided |
| ILND | 200 | 26 | 26 Nov 13:02 to 26 Nov 21:57 | order, order-cr, motion, cmp |
| DCD | 200 (first try failed) | 14 | 26 Nov 13:19 to 27 Nov 03:57 | all |
| MOED | 200 | 6 | 26 Nov 13:20 to 27 Nov 04:03 | all |

- V: An item holds case number plus caption (e.g. `2:26-cv-00585 NOVAKHOVA v. BONILLA et al`), a link to the docket, the entry text and number, and a pubDate. Window is about one day. A watcher must poll at least daily to avoid missing entries.
- V: "Partial" courts only list the entry types in the feed's own description line. A complaint ("cmp") appears in ILND, PAWD and MAD but not necessarily every filing type.
- V: Real-world failures happen: DED returned 500, CTD and DCD failed on the first call, one CTD item has a bad date.

**GovInfo**
- V: `https://api.govinfo.gov/collections/USCOURTS/2026-11-01T00:00:00Z` returned HTTP 401, `API_KEY_MISSING`, "Get one at https://www.govinfo.gov/api-signup". A key is required for the API. Key rate limit: NV (I recall about 1,000 requests per hour; not checked).
- V: `https://www.govinfo.gov/sitemap/USCOURTS_sitemap_index.xml` HTTP 200, 3,684 monthly or yearly sitemap entries, no key. District coverage per sitemap (first year, last year, latest change): PAED 2005 to 2026 (2026-11-26); PAMD, PAWD, NJD (from 1991), DED, MDD, CTD, NHD, DCD, NYED all to 2026 (latest 2026-11-26); MAD 2026-11-20; RID 2026-11-25; ILND to 2025 only (2026-04-02); MOED to 2026 (2026-07-04). **S.D.N.Y. is absent** (no `nysd` sitemaps).
- V: `.../sitemap/USCOURTS/USCOURTS_paed_2026_sitemap.xml` HTTP 200, 2,244 packages. `https://www.govinfo.gov/metadata/pkg/USCOURTS-paed-2_25-cv-06320/mods.xml` HTTP 200 XML (title, date, parties in caption). PDF at `/content/pkg/.../pdf/...-0.pdf` HTTP 200. No key.
- V: The USCOURTS RSS feed `https://www.govinfo.gov/rss/uscourts.xml` returns 200 but is empty and stamped 2017, so it is not usable.
- V: GovInfo bulk-data repository has no USCOURTS folder.
- V: GovInfo robots disallows `/app/search/*`; sitemaps are advertised. Policy page: federal works are public domain.

---

### State and municipal courts

| Source | Holds | Machine-readable route | Cost | Terms on automated use | Login / CAPTCHA | Coverage | Verified? |
|---|---|---|---|---|---|---|---|
| Pennsylvania UJS Web Portal `ujsportal.pacourts.us` | Dockets for Common Pleas, Magisterial District and appellate courts; participant, organization and docket-number search | None found. HTML form only | Free to view | Terms page says nothing about automation (liability text only). No `robots.txt` (404). Site needs JavaScript and cookies | Search page loads for anonymous users (HTTP 200) and has no CAPTCHA element in its HTML. I did not submit a search, so whether the submit is challenged is NV | Statewide; criminal migration caveat noted on page | Page V; search behaviour NV |
| New Jersey courts portal `portal.njcourts.gov` | Civil Part and foreclosure case jackets (party or docket search); other divisions elsewhere | None found | NV | Not readable | First request got an Imperva Incapsula block page ("Request unsuccessful. Incapsula incident ID"). `robots.txt` path returned a "NJCourts Online: Login" page. Stop here | Public civil jacket exists per NJ pages found by web search; whether registration is needed is unclear | Block V; rest NV |
| Delaware CourtConnect `courtconnect.courts.delaware.gov` | Civil docket reports by person, business name, judge or docket; judgments search | HTML form only, via a disclaimer click-through | Free | Disclaimer bans commercial use of the data. No `robots.txt` (404) | No login, no CAPTCHA seen on the entry pages. Disclaimer step before search | Delaware Judiciary civil dockets (which courts: NV) | V |
| Maryland Judiciary Case Search `casesearch.courts.state.md.us` | District and circuit court case search | Not reachable | NV | Not readable | HTTP 403 with a DataDome bot challenge (`captcha-delivery.com`) on first request, same for `robots.txt`. Stop | n/a | Block V |
| Massachusetts `masscourts.org` | Trial Court case search | None | NV | `robots.txt` lists `Disallow: /eservices/*` for all agents, and a 60 second crawl delay | Home page loads as a redirect stub. Search not tested because robots disallows it | n/a | Robots V |
| Connecticut Judicial Branch case look-up `civilinquiry.jud.ct.gov` | Civil, family, housing, small claims: look-up by party name, docket number, attorney, property address | None found | Free | `robots.txt` is `Disallow: /` for all agents (one allowed path: legal notices). Site has a disclaimer page | Form page loaded (HTTP 200) with no CAPTCHA seen | Superior Court civil, housing, small claims | V |
| Rhode Island public portal `publicportal.courts.ri.gov` | State court case search | Not reachable | NV | Not readable | Root URL is an IIS default page. `/PublicPortal/` returned 403 with DataDome challenge. Stop | n/a | Block V |
| New Hampshire courts `courts.nh.gov` | Case Access Portal for Superior and Circuit court | Not reachable | NV | Not readable | `www.courts.nh.gov` returned "Access Denied" (Akamai) to my client. Secondary page says non-parties must register and confirm an email first | NV | Block V; rest NV |
| New York eCourts WebCivil / NYSCEF `iapps.courts.state.ny.us` | Supreme Court civil index and e-filed documents | Not reachable | NV | Not readable | HTTP 403 Cloudflare "Just a moment" challenge on all three URLs tried, including `robots.txt`. Stop | n/a | Block V |
| Cook County Clerk of the Circuit Court `casesearch.cookcountyclerkofcourt.org` | Circuit court civil and other case search | Cook County open data portal has court-adjacent sets (criminal, State's Attorney). No civil docket set found | NV | Not readable | HTTP 200 but body is "Request Rejected" (WAF) for the home page and `robots.txt` | n/a | Block V |
| DC Superior Court portal `portal-dc.tylertech.cloud/Portal/` | Smart Search by case number or party; hearings search | None | NV | No `robots.txt` (404). Terms not read | Home loads. Smart Search URL returned HTTP 405 with an AWS WAF CAPTCHA script. Help text says up to 200 results per search. Stop | n/a | Block V |
| Missouri Case.net `courts.mo.gov/casenet` | Case.net statewide | None | NV | The 403 page and `robots.txt` both state that data scrapers and automated, repetitive querying of Missouri court sites are "expressly prohibited" | HTTP 403 on first request | n/a | V |

#### Open data, municipal and "court-like" records (these work)

| Source | Holds | Machine-readable route | Cost | Terms on automated use | Login / CAPTCHA | Coverage | Verified? |
|---|---|---|---|---|---|---|---|
| NYC OATH Hearings Division Case Status (`jz4z-kudi`) | Tickets and hearings: respondent name, agency, hearing status and date, penalty, balance, judgment docketed date | Socrata JSON `https://data.cityofnewyork.us/resource/jz4z-kudi.json`; metadata `/api/views/jz4z-kudi.json` | Free | `robots.txt` has `Crawl-delay: 1`. NYC terms page not found (404). NV | None | 22,286,208 rows; updated 2026-11-27. Some dates are junk (min 1900, max 9999) | V |
| NYC OATH Trials Division (`y3hw-z6bm`) | Trial-side case status | Same Socrata pattern | Free | As above | None | Updated 2026-11-05 | Listing V; rows not queried |
| NYC HPD Housing Litigations (`59kj-x8nc`) | Housing court cases brought by the city: respondent, case type, status, judgment, penalty | Socrata JSON `.../resource/59kj-x8nc.json` | Free | As above | None | 242,293 rows; updated 2026-11-01; junk dates present | V |
| Chicago Ordinance Violations (`6br9-quuz`) | Administrative hearings: docket number, respondents, disposition, fine, hearing date | Socrata JSON `https://data.cityofchicago.org/resource/6br9-quuz.json` | Free | License says "See Terms of Use"; `robots.txt` crawl delay 1 | None | 825,531 rows; updated 2026-11-26; junk dates present | V |
| Chicago Building Violations (`22u3-xenr`) | Building code violations by address (no respondent name column) | Socrata JSON | Free | As above | None | Updated 2026-11-27 | V |
| Philadelphia L&I violations, investigations, appeals | Violations with owner field `opa_owner`; appeals with `ownername`, `organization`, decision | Carto SQL `https://phl.carto.com/api/v2/sql?q=SELECT ... FROM violations` (also `case_investigations`, `li_appeals`) | Free | Not read. NV | None | violations 2,044,709 rows, 2007-01-01 to 2026-11-26; investigations 2,148,027 rows; appeals 28,882 rows | V |
| State open-data portals (PA, NY, DE, CT, NJ, MO) | Catalog search for "court" found only statistics, juvenile or inmate sets, no civil dockets | Socrata catalog `https://api.us.socrata.com/api/catalog/v1` | Free | n/a | None | n/a | V |
| Cook County open data | "Court" search found 35 datasets, mostly criminal sentencing and administrative sets | Socrata | Free | n/a | None | Not civil | V |

Evidence:
- V: OATH query for respondent text "HORIZON SERVICES" returned a count of 2 (agency DEP, status NEW ISSUANCE). Chicago for the same name returned 0. HPD litigations respondent like "HORIZON" returned 56. All requests were HTTP 200 with no key or token.
- NV: Socrata throttling for callers without an app token. Not tested beyond a few calls. Docs not read.
- Caution: OATH `respondent_last_name` and the Chicago `respondents` field include private individuals as well as businesses. Filter to company names and do not store person-level rows.
- Maryland open data (`opendata.maryland.gov`) catalog search for "judiciary court" returned no datasets.

#### Paid aggregators (public pricing only)

| Vendor | What it covers | Public price | Verified? |
|---|---|---|---|
| UniCourt | Federal (PACER) and state dockets; search plus document downloads; separate DEEP API product | Personal $59/month, Professional $199, Premium $399; yearly $590 and $3,990 for two of them. API access only on an Enterprise plan via sales | V (`unicourt.com/pricing`, HTTP 200) |
| Docket Alarm (Clio) | Federal and state dockets, alerts, developer API | Free tier (5 actions per week); pay-as-you-go $39.99/month plus $4 per document, $3 per docket update, $1 per federal search; flat $99 per user per month. PACER and state document fees billed separately | V (`docketalarm.com/pricing`, HTTP 200) |
| LexisNexis CourtLink | Page claims 322M+ federal and state dockets and documents, about 100k added weekly | None public; contact sales | V |
| Trellis | State trial court dockets | Pricing page returned 403 Cloudflare block to my client | Block V; coverage NV |
| Westlaw Dockets (Thomson Reuters) | Court dockets within Westlaw | None found on the page | V page; price NV |
| Bloomberg Law dockets | Federal and state dockets | Product URL I tried returned 404; no price seen | NV |

---

### What is usable today without an account

1. Federal: the CourtListener Atom feed (20 hits per call, no key, loose matching) plus the 12 per-court ECF RSS feeds that answered (about one day of entries each; PAMD, MDD, NYED empty, DED broken). GovInfo sitemaps, MODS and PDFs give keyless district opinions (not S.D.N.Y.).
2. CourtListener's API and bulk data need a free account token (docs: 5 per minute, 50 per hour, 125 per day), but the dockets bulk CSV on the public S3 bucket (2026-09-30, about 5 GB) needs no account. PACER needs an account and charges $0.10 per page.
3. State civil dockets are not machine-readable anonymously: MD, RI, NH, NY, NJ and Cook County blocked or challenged my client, DC has an AWS WAF CAPTCHA, Missouri bans scraping, Massachusetts and Connecticut disallow all agents in `robots.txt`, Delaware bans commercial use. Only Pennsylvania's search page loaded cleanly, with search behaviour untested. I stopped at each block.
4. Genuinely open and machine-readable "court-like" records: NYC OATH hearings and HPD housing litigations, Chicago ordinance (administrative hearing) violations, Philadelphia L&I violations and appeals, all JSON or SQL without a key. Watch for junk dates and individuals in respondent fields.
5. Nationwide: expect the same pattern, with federal watch via CourtListener plus ECF RSS feeds and open-data city hearings as the free base, state dockets mostly behind bot checks or contract-only. Paid aggregators (UniCourt from $59 per month, Docket Alarm from $39.99 or $99 per month, CourtLink by quote) are the realistic route for state-court coverage.

## Part 2 · UCC liens and business-entity registries


Survey date: 27 Nov 2026. Method: `curl` with User-Agent `legal-records-survey/1.0`, a handful of requests per site, no logins, no keys, no CAPTCHA attempts. Search-engine snippets are marked **Not verified (secondary)**.

Labels used below:
- **V** = Verified by fetching (27 Nov 2026). The evidence is in the notes.
- **NV** = Not verified. I say where the claim comes from.
- **BLOCKED** = my fetch hit a bot check, access-denied page or error. I stopped there. That is a finding, not a failure to try.

Terms of use: I read the dataset-level licence field on each open-data portal. I did not fetch the portals' site-wide terms pages, so "terms" below means the licence field plus any statement on the data page. Treat the licence field as a hint, not a legal clearance.

---

### UCC liens

#### Table

| State or source | Holds | Machine-readable route | Cost | Terms on automated use | Login / CAPTCHA | Freshness | Verified? |
|---|---|---|---|---|---|---|---|
| **Connecticut** (data.ct.gov) | One row per filing. Separates business debtor (`debtor_nm_bus`) from individual debtor (`debtor_nm_last/first/...`). Filing type, lapse date, status, secured party, addresses. Also holds IRS, vessel, aircraft, judgment and municipal liens. Only active liens or those under 1 year past lapse. | Socrata `xfev-8smz`: `https://data.ct.gov/resource/xfev-8smz.json` | Free | Licence field "Public Domain". Site-wide terms not fetched. | None | Daily (metadata). Newest `dt_accept` 2026-11-26. 851,504 rows. | **V** |
| **Colorado** (data.colorado.gov) | Normalised into 4 tables joined on `fileid`: filings, debtors, secured parties, collateral. Debtor table splits organisation (`organizationname`) from individual (`lastname`...). Filing type, lapse date, termination flag. | Socrata `wffy-3uut` (filings), `8upq-58vz` (debtors), `ap62-sav4` (secured parties), `4am6-w6u4` (collateral) | Free | Licence field "Public Domain" on all four | None | Daily ("every day after midnight"). Newest filing date 2026-11-25. Back to 1966. | **V** |
| **Oregon** (data.oregon.gov) | Only last month's filings (`snfi-f79b`, 5,302 rows) plus a secured-party list (`2kf7-i54h`, 219,197 rows). Rows are per party: `party_type` DB/SP, `entity_type` ORG/IND. Has file type, lapse date, lien type. | Socrata `snfi-f79b`, `2kf7-i54h` | Free | Licence field "Public Domain" | None | Monthly. Last update 2026-11-04. Not a full history. | **V** |
| **New York** | No UCC dataset on data.ny.gov (catalogue search for UCC, uniform commercial code, financing statement, secured party). UCC search moved to a new system: `ucc-efiling.dos.ny.gov`. The old search host returns 404 with a notice. The DOS page lists "Data Subscription" there. | HTML only. No open dataset. | NV | NV | **BLOCKED**: `ucc-efiling.dos.ny.gov` returned HTTP 403 "Just a moment..." (Cloudflare challenge) | n/a | **V** (block); cost NV |
| **Florida** | State does not hold UCC. Run by a vendor (Image API, LLC) as the "Florida Secured Transaction Registry" at floridaucc.com. The state does publish **federal tax lien** bulk files (filings, events, debtors, secured parties). | floridaucc.com loads as a JavaScript app with no usable HTML (NV for any API). Federal tax liens only via state SFTP, see entity table. | NV | NV | NV | Federal lien files: daily and quarterly | **V** (structure), rest NV |
| **Pennsylvania** | UCC search on `file.dos.pa.gov/search/ucc` | HTML only | NV | NV | **BLOCKED**: HTTP 999 page titled "Security Check", "Security Verification Required" | n/a | **V** (block) |
| **New Jersey** | UCC Online Services. Search types: Individual, Organization, Filing Number. Certified and non-certified. A separate "Bulk Data" search takes a filing-date range. Page says records "through Wednesday, November 25, 2026". | HTML forms at `https://www.njportal.com/ucc/`. Bulk page: `.../ucc/SearchBulk/Search.aspx`. No API seen. | Fees apply; amounts shown inside the session, not on the pages I fetched. NV | NV | Forms load without login. A "New User" account is optional. No CAPTCHA seen in HTML. I did not submit any search. | Near-daily (page states data through 25 Nov) | **V** (pages), cost NV |
| **Delaware** | UCC search is only through "Delaware Authorized Searchers" (private firms), except "Search to Reflect". | None free | Paid via searchers. Fee amounts NV. | NV | n/a | n/a | **V** (policy text), cost NV |
| **Maryland** | State staff do not search UCC records. Page lists private search companies (CorpAssist, CT Lien Solutions, CSC...). Bulk "public release files" incl. UCC data are sold through contractor SpecPrint, Inc. | Bulk: contractor sale. No API seen. | Paid. Price NV. Search snippet says certified search $2 and filing $4.50 (NV, secondary). | NV | n/a | n/a | **V** (policy text) |
| **Massachusetts** | UCC search at `corp.sec.state.ma.us/CorpWeb/UCCSearch/UCCSearch.aspx` | HTML only | Snippet: $10 listing, $30 with copies (NV, secondary) | NV | **BLOCKED**: HTTP 307 redirect loop to itself with Imperva (Incapsula) cookies set. `curl` stopped after 50 redirects. | n/a | **V** (block) |
| **Rhode Island** | UCC filing menu exists at `business.sos.ri.gov/uccfiling/ucc/UccMenu.aspx` (loads, HTTP 200, shows UCC-1 / UCC-3 filing forms). Search page not tested. | HTML only | NV | NV | The entity search on the same site shows a Cloudflare Turnstile widget. UCC search NV. | n/a | Partly **V** |
| **New Hampshire** | UCC at `sos.nh.gov/corporation-division/ucc` | HTML only | NV | NV | **BLOCKED**: HTTP 403 "Access Denied" (Akamai reference page) | n/a | **V** (block) |
| **Illinois** | UCC search via ilsos.gov | HTML only | Snippet: bulk full extract $2,500 one-time, weekly update $200 (NV, secondary: Illinois Admin Code snippet) | NV | **BLOCKED**: `ilsos.gov` and `apps.ilsos.gov` both failed (HTTP/2 INTERNAL_ERROR, then 30 s timeout with http1.1). Could not read any page. | n/a | **V** (fetch failure) |
| **District of Columbia** | NV. Search snippets did not cover UCC. | NV | NV | NV | NV | n/a | NV |
| **Missouri** | UCC page `sos.mo.gov/business/ucc` returns "Page not found". Business site `bsd.sos.mo.gov` is behind a challenge. A Missouri regulation snippet says UCC bulk data is available "in a format approved by the filing office" (NV, secondary). | NV | NV | NV | **BLOCKED** on `bsd.sos.mo.gov` (HTTP 403 "Just a moment...") | n/a | **V** (block) |
| **Washington, Texas, California** | UCC held by other offices or vendors. Not checked beyond the entity side. | NV | NV | NV | See entity table | n/a | NV |
| **Paid UCC vendors** | CSC, CT Lien Solutions (Wolters Kluwer), Ficoso (formerly First Corporate Solutions) | Vendor portals and APIs, sales contact | No public price found. Cobalt Intelligence sells a UCC API; its own blog compares itself to CSC (NV). | Contract | Account | n/a | **V** that pricing is not on public pages (CSC page loaded, no prices; Wolters Kluwer page showed a Cloudflare challenge; Ficoso page loaded, no prices) |

#### Notes

**Connecticut UCC (`xfev-8smz`).** Verified.
- Fields (32): `id_lien_flng_nbr, id_ucc_flng_nbr, lien_status, cd_flng_type, tx_lien_descript, debtor_nm_last, debtor_nm_suff, debtor_nm_pref, debtor_nm_first, debtor_nm_mid, debtor_nm_bus, debtor_ad_str1, debtor_ad_str2, debtor_ad_city, debtor_ad_state, debtor_ad_zip, sec_party_nm_last..., sec_party_nm_bus, sec_party_ad_*, dt_lapse, dt_accept, cd_volume, cd_start_page, qt_pages`.
- Organisation vs individual: organisations fill `debtor_nm_bus`. Individuals fill `debtor_nm_last`/`first`. 573,343 of 851,504 rows have `debtor_nm_bus` set. Use `debtor_nm_bus is not null` to skip individuals.
- The dataset description says it holds active liens and those less than 1 year past lapse. Lapse date `9999-12-31` means no lapse (for example IRS liens).
- `cd_flng_type` values (counts): ORIG FIN STMT 521,120; AMENDMENT 310,074; RELEASE ORIG 6,850; VESSEL LIEN 3,096; RELEASE 2,401; CONTINUATION 1,012; JUDGMENT LIEN 381; TERMINATION 107; and about 19 more. Amendments are separate rows linked by `id_lien_flng_nbr`.
- `tx_lien_descript` shows the lien source, for example `IRS`, `OFS`.
- Sample, returns rows (HTTP 200):
  `https://data.ct.gov/resource/xfev-8smz.json?$where=upper(debtor_nm_bus)%20like%20%27%25ELECTRICAL%25%27%20AND%20cd_flng_type%3D%27ORIG%20FIN%20STMT%27%20AND%20lien_status%3D%27Active%27&$select=id_ucc_flng_nbr,debtor_nm_bus,sec_party_nm_bus,dt_accept,dt_lapse&$order=dt_accept%20DESC&$limit=2`
  First row: Advanced Electrical Contractors, Inc., secured party American Southern Insurance Company, accepted 2026-11-19, lapse 2031-11-19.
- "Avantor" matched no business debtor (the `like '%AVANTOR%'` query returned only "KAVANTOROS INC", IRS liens). "Dinto" and "Kraft Kennedy" not tested here.
- Bulk CSV: `https://data.ct.gov/api/views/xfev-8smz/rows.csv?accessType=DOWNLOAD` returned HTTP 200 with `Content-Length: 0` on a HEAD request. I did not download it. Treat as untested.
- CT's own Bulk Data page says exports from the portal search are capped at 1,000 rows and points to the open data portal for large pulls. (V, page fetched.)
- Socrata throttles by IP without an app token (V, dev.socrata.com app-tokens page). I used no token. An app token is a free key, so I did not request one under your rules. Your decision for production.

**Colorado UCC.** Verified.
- Filings (`wffy-3uut`, 2,617,931 rows): `transactionid, masterdocumentid, transactiontype, filingdate, lapsedate, filingtype, documenttype, continuation, terminationflag, financialstatementtype, manufacturedhometransactions, fileid`.
- `filingtype` counts: ucc 2,132,919; efs 80,498; lien_irs 264,188; lien_hosp 99,067; lien_othr_stat 40,614; others small.
- Debtors (`8upq-58vz`, 2,031,843 rows): `debtorid, fileid, actiontype, recordstatus, debtordescription, lastname, firstname, ..., organizationname, organizationjurisdiction, organizationtype, organizationid, address1..zipcode, efsuniqueid`.
- Secured parties (`ap62-sav4`, 2,102,402 rows): `spid, fileid, actiontype, recordstatus, lastname..., organizationname, address1..., assignor`.
- Collateral (`4am6-w6u4`, 1,716,905 rows): `collateralid, fileid, collateraldescription, farmproductflag, county...`.
- Data quality warning: the secured-party table contains junk entries (a row with a personal name styled in sovereign-citizen format). The debtor description says inactive records older than two years may have formatting problems.
- Working three-step join (all HTTP 200):
  1. `https://data.colorado.gov/resource/8upq-58vz.json?$where=upper(organizationname)%20like%20%27%25ELECTRICAL%25%27%20and%20recordstatus%3D%27active%27&$select=fileid,organizationname,state,recordstatus&$limit=2` returned fileid 1791270, "Taylor Electrical Services LLC".
  2. `https://data.colorado.gov/resource/wffy-3uut.json?$where=fileid%3D%271791270%27` returned filingtype `ucc`, filing date 2020-05-25, lapse date 2030-05-25.
  3. `https://data.colorado.gov/resource/ap62-sav4.json?$where=fileid%3D%271791270%27&$select=fileid,organizationname,state,recordstatus` returned "U.S. Small Business Administration".
- `AVANTOR%` returned no Colorado org debtor.

**Oregon UCC.** Verified. `snfi-f79b` fields: `lien_type, original_file_number, file_number, file_type, filing_date, lapse_date, party_type, entity_type, entity, mail_addr_1.., image_link`. Last month: 5,302 rows; party_type/entity_type mix DB-ORG 1,696, DB-IND 1,250, SP-ORG 2,297, SP-IND 59. Lien types UCC 4,655, IRS 278, EFS 194, RW 109. Because it is last month only, you must snapshot it every month to build history. Sample: `https://data.oregon.gov/resource/snfi-f79b.json?$where=entity_type%3D%27ORG%27%20AND%20party_type%3D%27DB%27&$select=lien_type,file_number,file_type,filing_date,lapse_date,entity&$limit=2` (HTTP 200). `2kf7-i54h` fields: `lt_cd, filenumber, filing_date, lapse_date, secured_party, addr1.., image_link` (219,197 rows). The image link points to `records.sos.state.or.us` document images.

**New York.** The Socrata catalogue search (all domains) for UCC terms returned only NYC ACRIS collateral codes and unrelated NY datasets. DOS page `https://dos.ny.gov/uniform-commercial-code` (HTTP 200) lists "UCC/Lien Search: By Debtor, By Filing Number, By Secured Party" and links to `https://ucc-efiling.dos.ny.gov/`, which returned the Cloudflare challenge. The retired search host `appext20.dos.ny.gov/pls/ucc_public/...` returns 404 with the notice that DOS "has transitioned to a new UCC system starting on Monday March 9th" and gives the new URL plus a bulk filing API host for service companies (filing, not search).

**Florida federal tax liens.** The state's data-download page lists four lien files (filings, events, debtors, secured parties), daily and quarterly. These are federal tax liens, not UCC. UCC itself sits with the vendor at floridaucc.com. See entity notes for the SFTP access issue.

**Paid vendors.** CSC, CT Lien Solutions and Ficoso list no prices on public pages I could fetch. Do not assume prices.

---

### Business-entity registries

#### Table

| State or source | Holds | Machine-readable route | Cost | Terms on automated use | Login / CAPTCHA | Freshness | Verified? |
|---|---|---|---|---|---|---|---|
| **Connecticut** | Business master (name, type, status, sub-status, registration date, dissolution date, annual report due date, NAICS, addresses, agent link). Filing history (type, date). Name changes (old/new, date). Agents. Principals. | Socrata: master `n7gp-d28j` (1,310,232 rows), filing history `ah3s-bes7`, name changes `enwv-52we`, agents `qh2m-n44y`, principals `ka36-64k6` | Free | Licence field: Public Domain on master, name changes, principals. **None** on filing history and agents. | None | Daily rebuild. Newest `create_dt` 2026-11-26. | **V** |
| **New York** | Active entities only (4,288,123 rows): DOS ID, name, filing date, county, jurisdiction, entity type, service-of-process address, registered agent, chairman. Plus all filings (21.2M), entity status history, name status history, daily filings. | Socrata `n9v6-gdp6` (active corporations), `63wc-4exh` (all filings), `3gg2-jgnp` (status history), `ekwr-p59j` (name history), `k4vb-judh` (daily filings, incl. mergers via `mrgr_const_name`) | Free | Licence field empty. Dataset note: DOS gives no warranty on accuracy. | None | `n9v6-gdp6` says monthly, last update 2026-11-26. `63wc-4exh` weekly. `k4vb-judh` daily. | **V** |
| **Colorado** | Entities since 1864: id, name, status, type, jurisdiction, formation date, principal and agent addresses. Transaction history (mergers, agent changes, name changes). | Socrata `4ykn-tg5h` (3,142,085 rows), `casm-dbbj` (21.9M rows), `qpft-q492`, `u7sb-g482` | Free | Licence "Public Domain" | None | Daily. Updated 2026-11-23. | **V** |
| **Oregon** | Active businesses (1,593,752 rows): registry number, name, type, registry date, associated party names, address, jurisdiction. New business lists by month. Active nonprofits. | Socrata `tckn-sxa6` (weekly), `esjy-u4fc` (new last month), `8kyv-b2kw` | Free | Licence field empty on `tckn-sxa6`; "Public Domain U.S. Government" on `esjy-u4fc` | None | Weekly (updated 2026-11-24) | **V** |
| **Pennsylvania** | `data.pa.gov` `xvd7-5r2c` "Registered Businesses in PA Current by County": one row per entity-party (4,200,322 rows). Name, filing number, type, creation date, address, officer name and title. No status column (current only). | Socrata `xvd7-5r2c`. HTML search `file.dos.pa.gov/search/business` is blocked. | Free | Licence "Public Domain U.S. Government" | Open data: none. Business search: **BLOCKED** ("Security Check", HTTP 999) | Monthly (updated 2026-11-03) | **V** |
| **Iowa** | "Active Iowa Business Entities": legal name, type, effective date, registered agent name and address, principal office. 351,617 rows. Active entities only. | Listed on Iowa Data Hub `https://data.iowa.gov/catalog/dataset/554`. This is not Socrata (the `/resource/ez5t-3qay.json` form returns 404). A direct CSV/API URL was **not found** in the HTML. | Free | Page says licence type "CC BY" (attribution) | None for page | Monthly. Page says data last updated 08 Nov 2026. | **V** (page); download URL NV |
| **Florida** | Corporate filings and events (corporations, LLCs, LPs), fictitious names, general partnerships, federal tax liens. Fixed-width text files with published layouts. | Daily and quarterly files on `sftp.floridados.gov`, with a username and password printed on the state's own data-downloads page. | Free | Page: downloads are "offered as is" and may change or be deleted | Search site `search.sunbiz.org` **BLOCKED** (Cloudflare "Just a moment...", HTTP 403). SFTP needs a login (shared public credentials published by the state). **I did not connect.** Your call whether a published shared login counts as "no account". | Daily on work days, quarterly full files (Jan, Apr, Jul, Oct) | **V** (page); files not opened |
| **Washington** | CCFS entity search. Bulk "Corporations Data Extract" is discontinued per data.wa.gov dataset `f9jk-mm39` (a link-only record). The page says users can export search results to CSV. | HTML only | Free | NV | `ccfs.sos.wa.gov` page contains a Cloudflare Turnstile. **BLOCKED.** | n/a | **V** |
| **Texas** | SOSDirect: entity records, plus paid bulk "data" orders placed inside SOSDirect. Texas Comptroller "Active Franchise Taxpayers" on data.texas.gov (`9cir-efmm`) is a tax list, not the SOS registry. | Account required for SOSDirect. Statute page: Sec. 405.018 allows fees for electronic access. | $1 per search (search snippet; NV, secondary). Bulk price NV. | NV | **Account required** (SOSDirect). I did not enter it. | n/a | Partly **V** (statute page); fee NV |
| **California** | bizfile Online. Official bulk order link sits inside bizfile ("BE & UCC Bulk Orders") per state page snippet. A key-gated API exists per a third-party guide. | HTML. API: key by request. | Third-party guide: "Master Unload" $100 data (2025, NV, secondary) | NV | `bizfileonline.sos.ca.gov/search/business` returned a tiny Imperva/Incapsula page (212 bytes). **BLOCKED.** The call to the calico API host returned 404. | n/a | **V** (block); rest NV |
| **Delaware** | Entity name search page loads. It contains a CAPTCHA panel (`pnlCaptcha`, `captchaDiv`). General status needs a paid certificate/status request. | HTML only | Search free for name only; status or good standing certificate paid. Amounts NV. | NV | **CAPTCHA element on search page.** Stopped. | n/a | **V** (CAPTCHA); fees NV |
| **New Jersey** | Business Records Service: name search, status reports, standing certificates, documents, and "Business Entity Lists" (search by date range, name, principal, agent). | HTML forms at `https://www.njportal.com/DOR/BusinessRecords/`. | Status reports, certificates, documents are fee-based (page text). List and search fees NV. | NV | Name-search page loads without login. No CAPTCHA seen in the HTML. I did not submit searches. | n/a | **V** (pages); fees NV |
| **Maryland** | Business Express entity search. State sells public release files (corporate charter, personal property, UCC) via contractor SpecPrint, Inc. `opendata.maryland.gov` has only an aggregate "Number of businesses in the State" dataset (`ftgf-3uby`, not opened). | HTML search. Bulk: contractor. | Bulk: paid, price NV | NV | **Cloudflare Turnstile** present on `egov.maryland.gov/BusinessExpress/EntitySearch`. Stopped. | n/a | **V** |
| **Massachusetts** | Corporations search at `corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx` | HTML only | NV | NV | **BLOCKED** (Imperva redirect loop, HTTP 307 to itself) | n/a | **V** (block) |
| **Rhode Island** | Entity search `business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx` | HTML only | NV | NV | **Cloudflare Turnstile** widget on the search form. Stopped. | n/a | **V** |
| **New Hampshire** | QuickStart `quickstart.sos.nh.gov/online/BusinessInquire` | HTML only | NV | NV | **BLOCKED**: HTTP 403 Access Denied | n/a | **V** (block) |
| **Illinois** | `apps.ilsos.gov/corporatellc/` | HTML only | Bulk: snippet suggests paid extract (NV) | NV | **Could not fetch** (HTTP/2 error, timeout) | n/a | **V** (failure) |
| **District of Columbia** | CorpOnline. `corponline.dlcp.dc.gov` redirected to `boss.dc.gov`, which returned a "Processing, please wait..." interstitial. Search snippets say an Access DC account is needed (third-party sites disagree). | HTML only | NV | NV | Interstitial and probable account. **Stopped.** | n/a | **V** (interstitial); account rule NV |
| **Missouri** | `bsd.sos.mo.gov/BusinessEntity/BESearch.aspx` | HTML only | Single abstract $5 (statute snippet, NV). Bulk price NV. | NV | **BLOCKED**: HTTP 403 "Just a moment..." | n/a | **V** (block) |
| **Georgia** (extra) | Bulk corporations data via state portal | FTP subscription | One-time $1,000; or $100 set-up plus $500 per month | Bulk Corporations Data Agreement required | Account and agreement | n/a | **V** (page fetched) |
| **OpenCorporates** | Company registry data from many jurisdictions. Search, company, officers, filings. | REST API `https://api.opencorporates.com/v0.4/...`. Needs an API token. Unauthenticated call returned HTTP 401 "Invalid Api Token". Bulk by SFTP for Enterprise. | Essentials GBP 2,250/yr (500 calls/month, 200/day). Starter GBP 6,600/yr (2,500/month). Basic GBP 12,000/yr (5,000/month). Enterprise: quote. Free for public-benefit projects. | Docs: data under a share-alike attribution Open Database Licence. Free API accounts need your product to be open data too. Paid accounts remove share-alike. | API key required (I did not request one) | Varies by jurisdiction | **V** |
| **GLEIF (LEI)** | LEI records: legal name, address, status, successor entity, jurisdiction, legal form. Only entities that hold an LEI (large companies, funds, some private firms). | API `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=...`. Golden Copy files: `https://goldencopy.gleif.org/api/v2/golden-copies/publishes/latest` lists CSV/JSON/XML zips (3,508,996 records, publish date 2026-11-27). | Free | Terms page: access service is free and data is under CC0 | None | Golden Copy daily (8:00 publish) | **V** |
| **SEC EDGAR** | Registered public filers | `data.sec.gov` / `www.sec.gov` APIs | Free | SEC requires a User-Agent that names a contact. | My generic User-Agent got HTTP 403 "Request Rate Threshold Exceeded". I stopped rather than add a name or email, as you asked. | n/a | **V** (403); policy NV |
| **Cobalt Intelligence** | Secretary-of-State and UCC lookup API | Paid API | Not public. Capterra lists "from US$1,000" (NV, secondary). Every lookup is billed even with no match (vendor help page, NV, secondary). | Contract | Key | Live lookups | NV |
| **Middesk** | KYB API, claims all 50 states and DC | Paid API | Not public. Vendr estimate USD 2 to 5 per verification at 1,000 to 5,000 per month (NV, secondary). | Contract | Key | Live | NV |
| **CSC / CT Lien Solutions / Ficoso** | See UCC notes | Vendor portals | Not public | Contract | Account | n/a | **V** (no public prices) |

#### Notes

**Connecticut entity datasets.** Verified, all HTTP 200.
- Business master `n7gp-d28j` fields: `id, name, business_type, status, sub_status, accountnumber, annual_report_due_date, began_transacting_in_ct, billing*, business_email_address, citizenship, formation_place, date_registration, dissolution_date, mailing*, naics_code, naics_sub_code, office_jurisdiction*, records_address*, total_authorized_shares, create_dt, geo_location, ...`.
- Filing history `ah3s-bes7` fields: `account, name, filing_date, effective_date, type, filing_type, report_year, organizer_name, organizer_title, volume, pages, start_page, date_forfeited, physical_filing, create_dt`. `account` joins to master `id`. The `name` column holds a filing number, not the business name.
- Name changes `enwv-52we`: `unique_key, business_name_old, business_name_new, name_change_date`.
- Agents `qh2m-n44y` and Principals `ka36-64k6` contain **residence addresses of individuals** (for example `residence_street_address_1`). They also hold agent emails and phones. Your brief says no private individuals. Select only business-type agents (`type='Business'`) and drop residence fields, or skip principals.
- Sample: `https://data.ct.gov/resource/n7gp-d28j.json?$q=Kraft%20Kennedy&$select=name,business_type,status,date_registration,dissolution_date,annual_report_due_date,naics_code&$limit=2` returned "KRAFT & KENNEDY, INC", Stock, Active, registered 2016-11-17, annual report due 2027-11-17.
- `$q=` is a free-text search, so "Elm Electrical" returned "ELM Contractor Services LLC" and others. Use `$where=upper(name) like ...` for exact prefixes.

**New York entity datasets.** Verified, all HTTP 200.
- `n9v6-gdp6` fields: `dos_id, current_entity_name, initial_dos_filing_date, county, jurisdiction, entity_type, dos_process_*, chairman_*, registered_agent_*, location_*`. It lists active entities only ("does not include information on inactive corporations").
- Chairman and registered-agent names can be individuals. Take the entity name and agent only when the agent is an organisation.
- `63wc-4exh` is every filing since the database began: `corpid_num, film_num, date_filed, approved_date, eff_date, dura_date, dis_eff_date, for_inc_date, mod_certcode, entitytype, documenttype, law, corp_name, fict_name, ...`. Dissolutions and mergers appear as filing types here. `dnbf-xifz` (constituent) carries merger parties.
- `k4vb-judh` is the daily feed with filer and service-of-process data, merger constituent names and stock fields.
- Sample, returns rows: `https://data.ny.gov/resource/n9v6-gdp6.json?$where=upper(current_entity_name)%20like%20%27KRAFT%25%27&$select=dos_id,current_entity_name,initial_dos_filing_date,entity_type,registered_agent_name,jurisdiction&$limit=3`. First row: KRAFT & KENNEDY, INC., a foreign business corporation formed in Delaware, filed in NY 2010-10-20.
- Name history: `https://data.ny.gov/resource/ekwr-p59j.json?$where=upper(corp_name)%20like%20%27KRAFT%20%26%20KENNEDY%25%27&$limit=3` returned three name rows, one active (`name_status A`).
- NY's public entity search at `apps.dos.ny.gov/publicInquiry/` reset the connection on my fetch. Not needed, since open data covers it.

**Colorado entity datasets.** Verified. `4ykn-tg5h` fields: `entityid, entityname, principal*, mailing*, entitystatus, jurisdictonofformation, entitytype, agent*, entityformdate`. `casm-dbbj` fields: `entityid, transactionid, historydes, comment, receiveddate, effectivedate, name` (history includes "Statement of Change Changing the Registered Agent Information"). Sample, returns rows: `https://data.colorado.gov/resource/4ykn-tg5h.json?$where=upper(entityname)%20like%20%27KRAFT%25%27&$select=entityid,entityname,entitystatus,entitytype,jurisdictonofformation,entityformdate,agentorganizationname&$limit=2` (first row "Kraft & Company, LLC", Good Standing; second "Kraft & Kennedy, Inc", foreign Delaware, agent Corporation Service Company). Agent fields can hold individual names.

**Oregon entity datasets.** Verified. `tckn-sxa6` fields: `registry_number, business_name, entity_type, registry_date, associated_name_type, first_name, middle_name, last_name, suffix, not_of_record_entity, entity_of_record_reg_number, entity_of_record_name, address, city, state, zip, jurisdiction, business_details`. It has several rows per entity (one per associated name or address). It lacks a status column; the `business_details.url` links to the state's search page with status filter. No sample hit for "ELM ELECTRIC": the query returned `[]`.

**Pennsylvania entity dataset.** Verified. `xvd7-5r2c` fields: `business_name_source_, business_name, filing_number, address_line1.., city, state, zip, typeofbusinessregistration, creationdate, party_type, last_name, middle_name, first_name, shortcountyname, county_code, georeferenced_...`. Type counts include Domestic LLC 1,706,303, Domestic Business Corporation 1,483,506, Foreign Business Corporation 362,368, Foreign LLC 139,356. Sample: `https://data.pa.gov/resource/xvd7-5r2c.json?$where=upper(business_name)%20like%20%27AVANTOR%25%27&$select=business_name,filing_number,typeofbusinessregistration,creationdate,city,state&$limit=3` returned "Avantor Performance Materials, Llc", Foreign LLC, 2014-04-23 (three duplicate rows, one per party). De-duplicate on `filing_number`. Drop `first/last/middle_name` (officers are individuals). No formation, dissolution or name-change fields, so it supports "does this entity exist and where" but not change tracking. Change tracking would need diffing monthly snapshots.

**Iowa.** The Iowa Data Hub page (HTTP 200) shows title, description, "Update Frequency: Monthly", "License Type: CC BY", "Rows 351617", unique id `corp_number`. I tried `/api/dataset/554/csv`, `/catalog/dataset/554/download` and the Socrata form: all 404. A secondary source (catalog.data.gov) says a CSV resource exists. The exact file URL is **not verified**. Sole proprietors and partnerships are not in the file (page text).

**Florida.** Data page lists these paths under the SFTP root: daily corporate filings `doc/cor/yyyymmddc.txt`, daily corporate events `doc/cor/events/yyyymmddce.txt`, federal lien files under `doc/flr/...`, fictitious names `doc/fic/...`, quarterly zips `doc/quarterly/cor/cordata.zip` and `corevent.zip`. Files are fixed-width text. The page also says annual reports and address changes are not "events", so they are not in the events files. Registered agent is in the corporate filing layout (layout PDFs not fetched).

**Washington.** `data.wa.gov` dataset `f9jk-mm39` (HTTP 200) is a link record. Its description says: the Corporations Data Extract feature is no longer available. Use Advanced Search and CSV export. That route sits behind Turnstile, so it is not usable by a program.

**Delaware.** The name-search page has CAPTCHA elements in its HTML. Per your rule I stopped. `data.delaware.gov` has only business licence datasets (`5zy2-grhr`, `khpy-2pnr`), not the Division of Corporations registry.

**New Jersey.** The Business Records Service says users can "download lists or abstracts of businesses on file". The list form (`EntityDocs/BusinessList.aspx`) offers search by original filing date range, business name, principal name, registered agent and associated name. Cost and any login at checkout were not tested.

**OpenCorporates.** Pricing page and API reference fetched. A free key exists only for projects that publish under the same open licence. A commercial, closed product needs a paid plan. The API reference says paid accounts remove the share-alike restrictions.

**GLEIF.** `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=AVANTOR,%20INC.&page[size]=1` returned HTTP 200 with LEI `5493003VM0XB4U8YD238`, "AVANTOR FUNDING, INC.", status ACTIVE (the filter is a loose match, so check the name field). Entity fields include `legalName, otherNames, legalAddress, headquartersAddress, jurisdiction, legalForm, status, successorEntity, creationDate`. A fuzzy-completion call for "Kraft Kennedy" returned no data (not every company has an LEI). Golden Copy listing returned HTTP 200 with CSV (about 488 MB zipped), JSON and XML.

---

### Other states and the rest

**Genuinely open and machine-readable (verified above):** Connecticut (both record types), Colorado (both), Oregon (entities weekly; UCC only as a monthly slice), New York (entities only), Pennsylvania (entities, current only), Iowa (entities, monthly file, download URL not confirmed).

**Searched and found nothing open:** the Socrata catalogue shows no entity or UCC datasets for Delaware, Maryland (aggregates only), Massachusetts (no portal domain), New Hampshire, Rhode Island, DC, Missouri, Illinois, New Jersey, Washington (link only), Texas (tax list only), Vermont. Cambridge MA and Kansas City have city-level lists that are not state registries.

**Bulk by purchase or agreement (not open):**
- Georgia: $1,000 one-time or $100 plus $500/month (verified).
- Maryland: SpecPrint contractor (verified); price not found.
- Illinois: snippet says $2,500 full extract and $200 weekly (NV).
- California: key-gated API and bulk order inside bizfile (NV).
- Indiana ($9,500 per snippet), Oklahoma ($500 master per snippet), Kentucky (authorised subscribers), Minnesota (request form, account required), Arkansas, West Virginia, Tennessee: all from search snippets, **NV**. Verify before planning.
- Ohio: business reports page returned HTTP 403 for me; a snippet says free downloads exist (NV).

**The rest, in plain terms:** most of the other states offer an HTML search form, often behind Cloudflare, Imperva or Akamai, with a paid bulk file or vendor API. Plan on a licensed aggregator for those states, not on scraping.

**Gaps I did not close:**
- No cost for NJ, DE, MA, MD, RI, NH, IL UCC searches from official pages.
- No terms-of-use text for any state beyond the licence fields.
- Washington, Texas and California UCC offices not checked.
- Socrata portals have no site-wide terms read. Also not checked: whether bulk `rows.csv` downloads work (the CT HEAD returned length 0).

---

### What is usable today without an account

1. Connecticut: UCC liens plus five entity datasets, all free, daily, via Socrata JSON with `$where`. Skip individual debtors (`debtor_nm_bus is not null`) and the residence fields in agents and principals.
2. Colorado: UCC (four tables joined on `fileid`, daily) and entities with history, all Public Domain. New York: entities, status and name history, and a daily filings feed (no UCC). Oregon: entities weekly, UCC as a monthly slice only.
3. Pennsylvania entities (current only, monthly, officer rows to drop) and Iowa entities (monthly, CC BY, download URL still to find) are open. GLEIF is free and CC0 but covers only LEI holders.
4. Everything else in your 12 states sits behind a CAPTCHA, a bot wall, an account or a fee (PA, NJ UCC and DE, MD, MA, RI, NH, IL, DC, MO, NY UCC). I stopped at each one. Florida's free bulk files need a shared state-published SFTP login (not used).
5. OpenCorporates (free key only for open-licence projects; GBP 2,250 to 12,000 a year otherwise) and paid vendors (Middesk, Cobalt, CSC, CT, Ficoso: no public prices) are the route for the closed states.

## Part 3 · Property, licences and contract awards


Survey date: 27 Nov 2026. Method: `curl` with User-Agent `legal-records-survey/1.0`, a handful of requests per site, no login, no key, no CAPTCHA attempts. Where a page showed a bot check or a 403, I stopped there and recorded it.

Labels used below:
- **V** = Verified by fetching (27 Nov 2026). The URL and what came back are in the notes.
- **NV** = Not verified (from memory, or from a search-result summary). The source is named.

Terms of use: for Socrata portals the dataset metadata field `licenseId` is quoted (fetched from `/api/views/<id>.json`). I did not find or fetch a separate written terms page that mentions bots for most sites. "No automated-access rule found" means I did not find one, not that none exists. Socrata's own docs (V, https://dev.socrata.com/docs/app-tokens.html) say requests without an app token share an IP-based pool and "may be subject to throttling". That applies to every Socrata source below.

Privacy flags: several sources contain private people's names (owners, grantors, sole-proprietor licensees). Each row says what lets a program keep company records only.

---

### 1. Property records

| State / source | Holds | Machine-readable route | Cost | Terms on automated use | Login / CAPTCHA | Freshness | Verified? |
|---|---|---|---|---|---|---|---|
| NYC ACRIS (3 datasets) | Deeds, mortgages etc. Master (doc type, amount, dates), Parties (name, address, party type 1/2/3), Legals (borough/block/lot, `property_type`) | Socrata: master `bnx9-e6tj`, parties `636b-3b5g`, legals `8h5j-fqxa`, codes `94g4-w6xz` (property types), `7isb-wh4c` (doc types). `https://data.cityofnewyork.us/resource/<id>.json` | Free | No automated-access rule found. App-token throttling applies | None | Rows to `recorded_datetime` 2026-10-30; `good_through_date` 2026-10-31 (about 4 weeks behind). 17.1M master rows, history from the 1960s+ (NV for start year) | V |
| Philadelphia transfers | Deeds, mortgages, satisfactions with `grantors`, `grantees`, price, address, OPA account | Carto SQL: `https://phl.carto.com/api/v2/sql?q=SELECT ... FROM rtt_summary` (table name is `rtt_summary`, not `real_estate_transfers`) | Free | No rule found | None | 5,161,535 rows. Latest valid `recording_date` 2026-08-11 (3.5 months behind). One row has a bad `display_date` of year 9798, so sort on `recording_date` | V |
| Philadelphia OPA properties | Assessment, owner, category, sale | Carto SQL table `opa_properties_public` | Free | No rule found | None | Row 1 `assessment_date` 2026-04-29, `sale_date` 2026-10-07 | V |
| Connecticut real estate sales | Sales since 2001: town, address, date, price, assessed value, `propertytype` | Socrata `5mzw-sjtu` on data.ct.gov | Free | `licenseId` PUBLIC_DOMAIN | None | Latest `daterecorded` 2025-09-30 (14 months behind). 1,188,997 rows | V |
| Connecticut parcel / CAMA | Parcel, `owner`, mailing address, values, `state_use_description` | Socrata `rny9-6ak2` (2025), `pqrn-qghw` (2024) | Free | Not checked | None | 2025 file updated 2025-09-19 | V |
| Massachusetts MassGIS parcels | Statewide parcels + assessor fields | Page `https://www.mass.gov/info-details/massgis-data-property-tax-parcels` | Free (NV) | n/a | **Blocked**: HTTP 403 "Not allowed" to my generic User-Agent | NV | V (blocked) |
| Massachusetts Registry of Deeds | Deeds, mortgages | `https://www.masslandrecords.com/` | NV | n/a | **Bot gate**: HTTP 307 redirect loop with Imperva/Incapsula cookies. Stopped | NV | V (blocked) |
| New Jersey parcels + MOD-IV | Composite parcels with MOD-IV fields: `PROP_CLASS`, `OWNER_NAME`, `PROP_LOC`, `NET_VALUE`, `DEED_DATE`, `SALE_PRICE` | ArcGIS FeatureServer `https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query` (max 2,000 rows per call, Query + Extract) | Free | Not checked | None | Layer `dataLastEditDate` 2026-08-18 | V |
| New Jersey county clerk search | Deeds, mortgages per county | Per-county sites | NV | NV | NV | NV | NV |
| NJ MOD-IV download pages (nj.gov Treasury) | Tax list downloads | I guessed two URLs; both 404. njgin.nj.gov returned an Incapsula 403 ("Request unsuccessful") | NV | n/a | **Bot gate** on njgin.nj.gov | NV | V (404 / blocked) |
| Lancaster County PA | Recorder of Deeds | `https://www.lancasterdeeds.com/` loads (HTTP 200, reCAPTCHA script on page). Search-result summary says the system is Infodex (IQS), guest search available | Fee not published (NV) | NV | reCAPTCHA present on the home page. Not tested further | NV | Partly V |
| York County PA | Recorder of Deeds | `https://yorkcountypa.gov/539/Recorder-of-Deeds` loads (200). Search summary says SearchIQS | Online viewing free, copies cost (NV, third-party summary) | NV | Not tested | NV | Partly V |
| Dauphin County PA | Recorder of Deeds | `https://deeds.dauphincounty.gov/AcclaimWeb` loads as "Welcome, Guest" (200). Search by name, doc type, book/page, date, consideration, UPI. HTML only | Free to search (NV) | NV | reCAPTCHA string present on page; guest access, no login seen | NV | Partly V |
| Landex (PA vendor) | Land-record software used by some PA counties (not Lancaster, per its county site) | `https://www.landex.com/` (200) | Remote service is time and page billed (NV; Chemung NY page via search) | n/a | Paid account | n/a | Partly V |
| Delaware FirstMap | State GIS | `https://enterprise.firstmap.delaware.gov/arcgis/rest/services` returns JSON with folders incl. `PlanningCadastre`. I did not open the parcel layer | Free | Not checked | None | NV | Partly V |
| Maryland SDAT real property | Assessments + 3 sale segments (grantor name, date, price, how conveyed), land use, tax class | Socrata `ed4q-f8tm` on opendata.maryland.gov (183 columns) | Free | `licenseId` PUBLIC_DOMAIN | None | Updated 2026-11-06. 2,434,625 rows | V |
| Cook County Assessor sales | Sales with `seller_name`, `buyer_name`, `class`, price, `pin` | Socrata `wvhk-k5uv` on **datacatalog.cookcountyil.gov** (data.cookcountyil.gov is not a valid Socrata domain here) | Free | Not checked | None | Latest `sale_date` 2026-09-15. 2,691,587 rows. Updated 2026-11-15 | V |
| Cook County parcel addresses | Parcel list with `class`, owner mailing name | Socrata `tx2p-k2g9` (first row has an individual's name as `mail_address_name`) | Free | n/a | None | n/a | V |
| Cook County Recorder | Quit claim, mortgage, foreclosure, 2011 to Mar 2015 only | Socrata e.g. `4f2q-h3b7` | Free | n/a | None | Frozen 2015 | V (catalogue only) |
| DC ITS public extract | Tax roll with `OWNERNAME`, `PROPTYPE`, `USECODE`, `CLASSTYPE`, `SALEPRICE`, `SALEDATE`, `DEEDDATE`, `INST_NO` | ArcGIS `https://services.arcgis.com/neT9SoYxizqTHZPH/arcgis/rest/services/ITSPE_08172026/FeatureServer/0/query` (found via opendata.dc.gov Hub search) | Free | Not checked | None | Row `EXTRACTDAT` 2026-11-16 | V |
| DC CAMA commercial / sales | Commercial CAMA, property sales | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer/23` and `/57` | Free | Not checked | None | NV | Found only |
| DC Recorder of Deeds | Deeds | No open dataset found in Hub search. ITS extract carries `INST_NO` only | n/a | n/a | n/a | n/a | V (absence in Hub search) |
| St. Louis | Open-data portal `https://www.stlouis-mo.gov/data/` loads; assessor ArcGIS `maps6.stlouis-mo.gov/arcgis/rest/services` has an ASSESSOR folder that returns "Token Required" (HTTP 200 body code 499) | Parcel dataset not located | n/a | n/a | **Token required** on assessor services. Stopped | NV | V (token) |
| ATTOM | National property API | Sales-led. A search summary says Basic plans start at $500/month with 30-day trial | $500/month entry (NV, search summary of ATTOM page) | Commercial licence | Account + key | n/a | NV |
| Regrid | Parcels, API | Self-serve monthly plans billed by records. No public dollar figure found | Not found | Commercial licence | Account + key | n/a | NV |
| PropertyRadar | Property / owner data | `https://www.propertyradar.com/pricing` (fetched): Solo $119/month, $99/month prepaid annually; Team $249/month, $199/month prepaid; API with paid plans (NV on API tiers) | From $99/month | Commercial licence | Account | n/a | Pricing V |
| CoreLogic | Property data | `https://www.corelogic.com/` loads; no public price found | Quote | Commercial | Account | n/a | V (no price) |

#### Notes: property

Company-only filtering, by source:
- **ACRIS**: parties file has only a free-text `name`. Keep a deed only if a party name matches company suffixes (LLC, INC, CORP, LP, TRUST COMPANY). Also filter legals `property_type` to commercial codes (the codes file lists types such as `FS` "4 family with store/office"). Private owners appear as people's names in the same table. Do not store non-company parties.
- **Philadelphia**: `grantors` / `grantees` are free text and include private names (first row: a person and a bank). Join `opa_account_num` to OPA `category_code_description` (COMMERCIAL 12,489, INDUSTRIAL 3,833, APARTMENTS > 4 UNITS 4,126, MIXED USE 14,140; SINGLE FAMILY 463,045) to keep commercial parcels only.
- **Connecticut sales**: no party names at all. `propertytype` includes Commercial (9,664 rows), Industrial (1,268), Apartments (1,998). Safe to use for company-level context only if joined to a parcel owner. **CAMA** has `owner` (private names; first row is two people). Keep only `state_use_description` that is commercial and an owner name with a company suffix.
- **New Jersey**: `PROP_CLASS` is the state class code. Class `4A` (commercial) returned 119,325 parcels. `OWNER_NAME` is free text, so also check for a company suffix. My `OWNER_NAME LIKE '%AVANTOR%'` test on class 4A returned zero rows, so owner-name matching needs variant names.
- **Maryland**: the dataset title says "Hidden Property Owner Names". There is no owner column. Sales segments do include `grantor_name` (first row: a private person), so drop it. Keep `land_use_code` Commercial/Industrial rows. Owner occupancy code `H` marks homestead (residential).
- **Cook County**: sales have `seller_name` and `buyer_name` (first row: an LLC seller and a personal trust buyer). `class` is the assessor class; 5xx are commercial and industrial, 2xx residential (NV for the class table; first row class 318 is a multi-unit). Filter on class, then on company suffix.
- **DC**: `OWNERNAME` free text (first row an LLC). `USECODE` / `CLASSTYPE` and `PROPTYPE` filter commercial.

Evidence (V, 27 Nov 2026):
- `https://data.cityofnewyork.us/resource/bnx9-e6tj.json?$limit=1` returned 200, fields `document_id, record_type, crfn, recorded_borough, doc_type, document_date, document_amt, recorded_datetime, ...`.
- `https://data.cityofnewyork.us/resource/636b-3b5g.json?$where=upper(name)%20like%20%27%25LLC%25%27&$limit=3` returned 200 with company parties. Party type counts: 1 = 25.5M, 2 = 21.2M, 3 = 47k.
- `https://data.cityofnewyork.us/resource/bnx9-e6tj.json?$select=max(recorded_datetime),count(*)` returned max 2026-10-30, count 17,143,212.
- `https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20rtt_summary%20LIMIT%201` returned 200, fields `document_id, document_type, display_date, street_address, grantors, grantees, total_consideration, opa_account_num, ...`.
- `https://phl.carto.com/api/v2/sql?q=SELECT%20category_code_description,count(*)%20FROM%20opa_properties_public%20GROUP%20BY%201%20ORDER%20BY%202%20DESC%20LIMIT%209` returned the category counts above.
- `https://data.ct.gov/resource/5mzw-sjtu.json?$limit=1` returned `serialnumber, listyear, daterecorded, town, address, assessedvalue, saleamount, salesratio, propertytype, remarks`.
- NJ: `https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0?f=json` lists 44 fields incl. `PROP_CLASS, OWNER_NAME, DEED_DATE, SALE_PRICE`. `.../0/query?where=PROP_CLASS%3D%274A%27&returnCountOnly=true&f=json` returned `{"count":119325}`.
- MD: `https://opendata.maryland.gov/resource/ed4q-f8tm.json?$select=count(*)` returned 2,434,625. First row includes `sales_segment_1_grantor_name_...` with a private name.
- Cook: `https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json?$select=max(sale_date),count(*)` returned 2026-09-15 and 2,691,587.
- DC: ITS extract layer first row fields include `OWNERNAME, USECODE, CLASSTYPE, SALEPRICE, SALEDATE, EXTRACTDAT`.
- Blocks: `https://www.mass.gov/info-details/massgis-data-property-tax-parcels` returned HTTP 403 page titled "Not allowed". `https://www.masslandrecords.com/` returned 307 with Incapsula cookies, twice. `https://njgin.nj.gov/njgin/edata/parcels/index.html` returned 403 "Incapsula incident ID".
- PA counties: see table. Lancaster and Dauphin home pages mention reCAPTCHA; I did not submit any search.

Gaps: Delaware county parcel layers, NJ county clerks, St. Louis parcels, and Massachusetts (both sources blocked to a generic client) are open items.

---

### 2. Professional and contractor licences

| State / source | Holds | Machine-readable route | Business vs individual | Cost | Terms on automated use | Login / CAPTCHA | Freshness | Verified? |
|---|---|---|---|---|---|---|---|---|
| **CT** State Licenses and Credentials | All eLicense credentials. Fields: `credentialid, name, type, businessname, dba, fullcredentialcode, credentialtype, credentialnumber, credentialsubcategory, credential, status, statusreason, active, issuedate, effectivedate, expirationdate, address, city, state, zip, recordrefreshedon` | Socrata `ngch-56tr` | `type` = INDIVIDUAL / BUSINESS / CORPORATION / LLC. Electrical, plumbing, HVAC contractor credentials are held by **individuals** (13,929 of 13,945 "Electrical Unlimited Contractor" rows). `businessname` is sometimes filled | Free | `licenseId` PUBLIC_DOMAIN | None | Dataset rows updated 2026-11-27 ("Updated daily") | V |
| **CT** Home Improvement Contractor | HIC and related registrations | Socrata `5r9m-qgni` (same fields, no address column) | Business-level: types LLC 52,090, CORPORATION 12,248, PARTNERSHIP 1,613, INDIVIDUAL 68,730, SOLE PROPRIETOR 15 | Free | PUBLIC_DOMAIN (set on ngch-56tr; not read for this one, NV) | None | Sample `recordrefreshedon` 2026-02-19 | V |
| **NYC** DOB License Info | NYC licences: Electrical Firm 5,548, Electrical Contractor 5,109, Master Plumber 3,007, General Contractor 34,800, Oil Burner Installer 413, etc. | Socrata `t8hj-ruu2` | `business_name` set on firms; `last_name`, `first_name` for people. **No issue or expiry date field**; only `license_status` | Free | Not checked | None | Updated 2026-11-26 | V |
| **DE** Professional and Occupational Licensing | Individuals only: `last_name, first_name, license_no, profession_id, license_type, issue_date, expiration_date, disciplinary_action, license_status`. Electrical Examiners 27,221 rows; Plumbing/HVACR 4,153 | Socrata `pjnv-eaih` | Individual only | Free | Not checked | None | Updated 2026-11-26 | V |
| **DE** Delaware Business Licenses | Division of Revenue business licences: `business_name, trade_name, category, current_license_valid_from/to, address, license_number` | Socrata `5zy2-grhr`. Categories incl. RESIDENT CONTRACTOR 9,142; NON-RESIDENT CONTRACTOR 4,984 | Business | Free | `licenseId` PUBLIC_DOMAIN | None | Updated 2026-11-26 | V |
| **DC** Basic Business Licenses | `ENTITYNAME, ENTITYTRADENAME, ENTITYTYPE, LICENSETYPE, LICENSESTATUS, start/end dates, BUSINESSACTIVITY` plus owner and agent names | ArcGIS `https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0/query` | Mixed. Sole proprietors have `ENTITYNAME` null and owner first/last name filled. Drop those rows | Free | Not checked | None | Row `DATAREFRESHEDON` 2026-11-26 | V |
| **Chicago** Business Licenses | `legal_name, doing_business_as_name, license_description, license_start_date, expiration_date, license_status` | Socrata `r5kz-chrr` | Business | Free | Not checked | None | Updated 2026-11-26. My search for CONTRACTOR / ELECTRIC / PLUMB in `license_description` returned zero rows | V |
| **Philadelphia** L&I trade licences | `licensetype` (CONTRACTOR 17,743; ELECTRICAL CONTRACTOR 2,938; PLUMBER MASTER 1,614 ...), `companyname`, `contactname`, dates, status | Carto table `li_trade_licenses` | Mixed; company name often null | Free | None found | None | **Stale**: latest `issuedate` 2020-03-12 | V |
| **PA** state | PALS (BPOA portal) covers state boards. **No state electrician / plumber / HVAC licence** (NV: four contractor-marketing guides in a search summary; NYC DOB info below is from the same search) | `https://www.pals.pa.gov/` loads (200); Angular app; reCAPTCHA string in page source | n/a | Free | NV | reCAPTCHA present | n/a | Site V, claim NV |
| **PA** AG Home Improvement Contractor search | HIC registration lookup | `https://hicsearch.attorneygeneral.gov/` (200). HTML form, no open data seen | Business + individual | Free | NV | **Cloudflare Turnstile** on page. Stopped | n/a | V |
| **NJ** Consumer Affairs verification | Professional and business licence lookup | `https://newjersey.mylicense.com/verification/Search.aspx` (200), "Search for a Person" / switch to "Business Search". Form only. No captcha string found | Both | Free | NV | None seen | n/a | V |
| **NJ** open data | Searched data.nj.gov catalogue for "license", "business", "professional": no contractor or professional licence dataset (results were child care, stables, facilities) | n/a | n/a | n/a | n/a | n/a | n/a | V (absence) |
| **MA** DOL check-a-license, HIC | Division of Professional Licensure; HIC at Office of Consumer Affairs | `https://www.mass.gov/check-a-license` | n/a | n/a | NV | **Blocked**: HTTP 403 "Not allowed" | n/a | V (blocked). Open data on mass.gov: not found |
| **MD** DLLR / MHIC | Licence search | `https://labor.maryland.gov/license/` loads (200) but needs JavaScript; old search URL 404. No licence dataset in opendata.maryland.gov search for "license" / "contractor" | n/a | n/a | NV | None seen | n/a | V (limited) |
| **RI** CRB | Contractor registration | `https://crb.ri.gov/` | n/a | n/a | NV | **Cloudflare "Just a moment"**. Stopped. `elicense.ri.gov` did not connect | n/a | V (blocked) |
| **NH** OPLC | Licence verification | `https://www.oplc.nh.gov/`, `https://forms.nh.gov/licenseverification/` | n/a | n/a | NV | **HTTP 403 Access Denied** (Akamai). Stopped | n/a | V (blocked) |
| **NY State** | No statewide electrician licence (NV, search summary; local rules) | n/a | n/a | n/a | n/a | n/a | n/a | NV |
| **IL** IDFPR | Licence lookup | `https://online-dfpr.micropact.com/lookup/licenselookup.aspx` (200) | Both | Free | NV | **reCAPTCHA** on page. Not tested | n/a | V |
| **MO** Professional Registration | Licence search | `https://pr.mo.gov/licensee-search.asp` redirects to `https://mopro.mo.gov/license/s/license-search` (Salesforce portal, needs JavaScript). data.mo.gov has no licence dataset I could find (alcohol only) | n/a | n/a | NV | Not tested | n/a | V (limited) |

#### Federal enforcement records

| Source | Holds | Route | Key needed? | Cost | Terms | CAPTCHA | Freshness | Verified? |
|---|---|---|---|---|---|---|---|---|
| EPA ECHO case search | Civil and criminal enforcement cases | `https://echodata.epa.gov/echo/case_rest_services.get_cases?output=JSON&p_case_number=1` returned success JSON with no key. Metadata: `...case_rest_services.metadata?output=JSON` | **No key** | Free | Not checked | None | NV | V |
| OSHA enforcement | Inspections, violations, penalties | Old `enforcedata.dol.gov` and `enfxfr.dol.gov` now 301 to `https://data.dol.gov/` (JS app, I could not read it). `https://apiprod.dol.gov/v4/get/OSHA/inspection/json?limit=1` returned 403 empty body. `https://www.osha.gov/data` returned 403. A search summary says bulk CSV needs no key and the API needs a free account | API: yes (NV). Bulk: NV | Free | NV | None | NV | Partly V (the moves and 403s) |
| NLRB cases | Case filings, election results | `https://www.nlrb.gov/search/case` loads (200) with a "Downloads" feature. API or bulk file not located | NV | Free | NV | None seen | NV | Page V, route NV |

#### Notes: licences

CT sample queries (V, each returned 200):
- Credential types with "electric": `https://data.ct.gov/resource/ngch-56tr.json?$select=credential,count(*)&$where=upper(credential)%20like%20%27%25ELECTRIC%25%27&$group=credential` returned ELECTRICAL UNLIMITED CONTRACTOR 13,945; LIMITED CONTRACTOR 3,171; UNLIMITED JOURNEYPERSON 25,745; and four others. Plumbing: PLUMBING & PIPING UNLIMITED CONTRACTOR 7,545, LIMITED 4,139. HVAC: HEATING, PIPING & COOLING UNLIMITED CONTRACTOR 6,038, LIMITED 6,472. Sheet metal limited contractor 2,480.
- Active electrical contractors that carry a business name: `https://data.ct.gov/resource/ngch-56tr.json?$select=businessname,credential,status,expirationdate,city,state&$where=credential%20like%20%27ELECTRICAL%25CONTRACTOR%27%20AND%20active=%271%27%20AND%20businessname%20IS%20NOT%20NULL&$limit=50`. It returned one row (an out-of-state firm). The filled-in `businessname` is rare for electrical rows. **A CT electrical licence is held by a person, so match on `name` (the person) and treat the firm link as weak.** Using `type!='INDIVIDUAL'` returned only old inactive rows.
- Business name search on HIC: `https://data.ct.gov/resource/5r9m-qgni.json?$where=upper(businessname)%20like%20%27%25ARETE%25%27&$select=businessname,credential,status,expirationdate` returned three rows (one ACTIVE, expiry 2027-03-31).
- Test for "Dinto": a name search on `ngch-56tr` for `%DINTO%` returned only unrelated individuals. No Dinto Electrical record is in CT.
- `ngch-56tr` metadata: `https://data.ct.gov/api/views/ngch-56tr.json` (200) says "Updated daily", attribution DAS and DCP.

Other evidence (V):
- NYC: `https://data.cityofnewyork.us/resource/t8hj-ruu2.json?$where=license_type=%27ELECTRICAL%20FIRM%27&$limit=1` returned `business_name, business_house_number, business_street_name, business_email, business_phone_number, license_status`. Do not ingest the email or phone.
- DE: `https://data.delaware.gov/resource/5zy2-grhr.json?$where=upper(business_name)%20like%20%27%25ELECTRIC%25%27&$limit=1` returned "R & R ELECTRIC INC", RESIDENT CONTRACTOR, valid to 2026-12-31. `pjnv-eaih` has no business column.
- DC: `.../FEEDS/DCRA/FeatureServer/0/query?where=1%3D1&outFields=*&resultRecordCount=1&returnGeometry=false&f=json` returned the field list in the table above.
- Philadelphia: `https://phl.carto.com/api/v2/sql?q=SELECT%20licensetype,count(*),max(issuedate)%20FROM%20li_trade_licenses%20GROUP%20BY%201%20ORDER%20BY%202%20DESC%20LIMIT%2010`.
- Socrata catalogue results for data.nj.gov, data.pa.gov, data.mo.gov, data.ny.gov and opendata.maryland.gov show no contractor or electrician licence dataset. `data.ri.gov` and `data.nh.gov` are not Socrata domains (catalogue returned "Domain not found").
- ECHO name filter: I tried eight guessed parameter names (`p_case_name`, `p_defendant`, `p_cn`, `p_name` and others). All were ignored and returned "Rows Returned would be 313991 ... Queryset Limit". `p_case_number` was accepted. A name search needs the correct parameter from EPA's service docs, which I could not fetch (the docs URL I tried returned 404).

Gaps to close before build: MA, RI, NH are bot-blocked to a generic client. PA, NJ, IL, MO are lookup forms with no bulk route. MD licence data has no open dataset I could find.

---

### 3. Public contract awards

| State / source | Holds | Machine-readable route | Vendor-name field | Cost | Terms on automated use | Login / CAPTCHA | Freshness | Verified? |
|---|---|---|---|---|---|---|---|---|
| **USAspending** | Federal awards | `POST https://api.usaspending.gov/api/v2/search/spending_by_award/` with `filters.recipient_search_text`, `award_type_codes`, `time_period`. Also `POST /api/v2/recipient/` (keyword) and `/api/v2/autocomplete/recipient/` | `Recipient Name` | Free | Not found; bulk download endpoint `/api/v2/bulk_download/awards/` listed in docs | None, no key | `GET /api/v2/awards/last_updated/` returned 11/26/2026 | V |
| **SAM.gov** | Opportunities, entities, awards | `https://api.sam.gov/prod/opportunity/v2/search` returned HTTP 404 with no key (I did not request a key) | n/a | NV | NV | API key needed (NV) | n/a | Not usable |
| **FPDS** | Contract actions | `https://www.fpds.gov/fpdsng_cms/` redirects to `https://sam.gov/contracting`. ATOM feed `https://www.fpds.gov/ezsearch/FEEDS/ATOM?FEEDNAME=PUBLIC&q=VENDOR_FULL_NAME:%22AVANTOR%22` returned 200 with an empty feed | n/a | Free | NV | None | n/a | V (no usable output) |
| **NYC** Recent Contract Awards | Notices with `vendor_name`, `contract_amount`, `agency_name`, `pin`, `start_date`, contact name and email | Socrata `qyyg-4tf5` | `vendor_name` | Free | Not checked | None | Max `start_date` 2026-11-25; 54,115 rows | V |
| **NYC** Checkbook NYC API | Contracts and spending | `POST https://www.checkbooknyc.com/api` with XML (`type_of_data`, `status`, `category`, criteria) | `vendor_code` only (see notes) | Free | Not checked | None, no key | NV | V (works, filter limited) |
| **NY State** Open Book | State contract search | `https://wwe2.osc.state.ny.us/transparency/contracts/contractsearch.cfm` (200, HTML form) | form field | Free | NV | None seen | NV | V |
| **NY State** authority procurement | Authority procurements | Socrata `ehig-g5x3` on data.ny.gov (`vendor_name`, `award_date`, `contract_amount`) | `vendor_name` | Free | Not checked | None | Dataset updated 2025-12-01 | V |
| **MA** CTHRU / Comptroller spending | Payments | Socrata `pegc-naaa` on `cthru.data.socrata.com` | `vendor`, `vendor_id` | Free | `licenseId` USGOV_WORKS | None | Updated 2026-11-26; 49,409,933 rows; `max(date)` 2026-11-30 (future fiscal dates) | V |
| **MA** COMMBUYS | Bids, awards | `https://www.commbuys.com/bso/` loads (200). Search is a web form | n/a | Free | NV | None seen | NV | Page V |
| **CT** Open Expenditures | Payments | Socrata `ajdm-rvz7` on data.ct.gov | `vendor`, `vendor_id`, `vendor_type` | Free | Not checked | None | Max `payment_date` 2026-11-26 | V |
| **CT** contract awards (CTsource) | Awards | No contract award dataset found in data.ct.gov catalogue search ("contracts", "procurement") | n/a | n/a | n/a | n/a | n/a | V (absence) |
| **PA** Treasury e-library | Contracts | `https://contracts.patreasury.gov/` returns a redirect page to `https://www.patreasury.gov/transparency/e-library/` | n/a | Free | NV | NV | NV | Redirect V; contents not read |
| **PA** eMarketplace | Awards | `https://www.emarketplace.state.pa.us/Search.aspx` loads (200), HTML form | n/a | Free | NV | None seen | NV | V |
| **PA** open data | `data.pa.gov` search for "contract", "vendor", "procurement" found only `qq4v-6fbd` "Public Supplier Search General Services" (type href, a link, last touched 2018) | n/a | n/a | n/a | n/a | n/a | n/a | V |
| **NJ** YourMoney purchasing | Purchases by vendor | Socrata `piv7-rtxj` (vendor YTD total), `ubnu-tqu7` (FY, agency, commodity, vendor, YTD; 660,425 rows). Spending `apet-rp2i` has `payee_name` | `vendor_name`, `payee_name` | Free | Not checked | None | `piv7-rtxj` updated 2026-09-03; `ubnu-tqu7` FY through 30-Jun-26; `apet-rp2i` through 2026-09-30 | V |
| **NJ** NJSTART | Awards | `https://www.njstart.gov/bso/` loads (200). I guessed one search URL; it errored | n/a | Free | NV | None seen | NV | Page V |
| **DE** checkbook | Payments by vendor | Socrata `7bip-nb4g` (`vendor`, `amount`, `check_date`). `5s6n-7hpx` has no vendor field | `vendor` | Free | Not checked | None | Updated 2026-11-10 | V |
| **DE** contracts | Contract list and spend | `xxed-9nm8` Current Contracts (no vendor field; link to mmp.delaware.gov), `75y3-eci7` line-item spend (`vendor_name`) | `vendor_name` (spend only) | Free | Not checked | None | `xxed-9nm8` 2026-11-24; `75y3-eci7` 2026-11-15 | V |
| **MD** payments | State payments | Socrata `7syw-q4cy` on opendata.maryland.gov (`vendor_name`, `amount`, `agency_name`, `fiscal_year`) | `vendor_name` | Free | Not checked | None | Updated 2026-11-09; max `fiscal_year` 2027 | V |
| **MD** eMMA | Bids and awards | `https://emma.maryland.gov/` loads (200). Open data has only old eMM bid sets (FY2012 to FY2019) | n/a | Free | NV | None seen | stale | V |
| **RI** | `transparency.ri.gov` loads (200). `www.ridop.ri.gov` is behind Cloudflare "Just a moment" | n/a | n/a | n/a | NV | **Cloudflare challenge** on ridop. Stopped | n/a | V (limited) |
| **NH** TransparentNH / DAS | Contracts, spending | `https://www.nh.gov/transparentnh/` and `https://das.nh.gov/purchasing/` | n/a | n/a | NV | **HTTP 403 Access Denied**. Stopped | n/a | V (blocked) |
| **IL** Chicago contracts | Contracts and POs | Socrata `rsxa-ify5` (189,298 rows; `vendor_name`, `award_amount`, `department`, `approval_date`). Payments `s4vu-giwb` | `vendor_name` | Free | Not checked | None | Max `approval_date` 2026-11-25 | V |
| **IL** state | Comptroller ledger and BidBuy | `https://ledger.illinoiscomptroller.gov/` 404; `https://www.bidbuy.illinois.gov/` loads a login page | n/a | n/a | NV | Login page shown. Stopped | n/a | V (limited) |
| **DC** Contracts from PASS | Awards of $100k or more | ArcGIS `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Government_Operations/MapServer/37/query` | `SUPPLIER` | Free | Not checked | None | Sample FY2026, award date 2026-05 | V |
| **MO** | MissouriBUYS (`https://missouribuys.mo.gov/` loads, 200). `accountability.mo.gov` did not connect. data.mo.gov catalogue search found no contract or payment dataset | n/a | n/a | n/a | NV | None seen | n/a | V (limited) |

#### Notes: awards

USAspending (V):
- Working call: `POST https://api.usaspending.gov/api/v2/search/spending_by_award/` with body `{"filters":{"recipient_search_text":["AVANTOR PERFORMANCE MATERIALS"],"award_type_codes":["A","B","C","D"]},"fields":["Recipient Name","Award Amount","Start Date"],"limit":3,"page":1}` returned 200 with "AVANTOR PERFORMANCE MATERIALS, INC." rows.
- **Short names are unreliable.** `["AVANTOR"]` returned "EPL PATHOLOGY ARCHIVES, LLC", and `["IES HOLDINGS"]` returned "MEGGITT AIRCRAFT BRAKING SYSTEMS CORPORATION". `["Consilio"]` returned "CONSILIO, INC." correctly. Always check `Recipient Name` on each result, or resolve the name first with `POST /api/v2/recipient/` (`{"keyword":"avantor",...}` returned AVANTOR PERFORMANCE MATERIALS, LLC and two others with UEIs) or `POST /api/v2/autocomplete/recipient/`.
- Rate limit and terms: I found no stated limit in the response headers (only a load-balancer cookie) and did not fetch a terms page that mentions automation. Treat limits as NV.
- Pagination: `page_metadata.hasNext` and `last_record_unique_id`.

SAM.gov: the route I tried returned 404 without a key. I did not request a key. Treat SAM.gov as needing an account.

Checkbook NYC (V): `POST https://www.checkbooknyc.com/api` with `type_of_data=Contracts` returned XML errors that name the required parameters (`status`, `category`) and the valid criteria for registered expense contracts: `agency_code, vendor_code, current_amount, spent_to_date, award_method, expense_category, contract_id, ... pin`. So a vendor name search is not allowed; you need the vendor code first (NV on how to get it).

NYC Recent Contract Awards (V): `https://data.cityofnewyork.us/resource/qyyg-4tf5.json?$limit=1` returned `request_id, start_date, end_date, agency_name, type_of_notice_description, category_description, short_title, selection_method_description, pin, contact_name, email, contract_amount, vendor_name, vendor_address`. Do not ingest `contact_name` or `email` (city staff).

Chicago (V): `https://data.cityofchicago.org/resource/rsxa-ify5.json?$where=upper(vendor_name)%20like%20%27%25ELECTRIC%25%27&$limit=1` returned REVERE ELECTRIC SUPPLY COMPANY (1998). Payments `s4vu-giwb` first row has `check_date` as a year only.

DC (V): `.../MapServer/37/query?where=SUPPLIER%20LIKE%20%27%25ELECTRIC%25%27&outFields=SUPPLIER,CONTRACTNUMBER,CONTRACTAMOUNT,AWARDDATE,AGENCY_NAME,FISCALYEAR&orderByFields=AWARDDATE%20DESC&resultRecordCount=2&returnGeometry=false&f=json` returned RSC ELECTRICAL & MECHANICAL CO ($149,900, DPW, FY2026). `AWARDDATE` is epoch milliseconds. The layer also lists contracting officer email fields; skip them.

CT ledger (V): `https://data.ct.gov/resource/ajdm-rvz7.json?$limit=1` returned `fiscal_year, service, department, program, account, expense_category, fund, vendor, vendor_id, payment_id, payment_method, payment_status, payment_date, invoice_id, amount, purchase_order_number, vendor_type, ...`. `vendor_type` (first row "Governmental") may help separate companies from people (NV on all values).

MA CTHRU (V): fields `vendor, vendor_id, amount, date, department, cabinet_secretariat, object_class, payment_id, city, state, zip_code`. The first `$limit=1` request timed out once (HTTP 000); a smaller aggregate call to the same dataset worked. Plan for slow responses on this 49M-row table.

Gaps: SAM.gov and FPDS are not open to a keyless client. NH and RI are bot-blocked. PA, NJ, MA, MD and MO have web forms but no open award dataset that I could verify. IL state data was not reached.

---

### Roll-out beyond the target states

Portals that matched in my Socrata catalogue searches and are open data: data.cityofnewyork.us, data.cityofchicago.org, datacatalog.cookcountyil.gov, data.ct.gov, data.nj.gov, data.pa.gov, data.ny.gov, data.delaware.gov, opendata.maryland.gov, data.mo.gov, cthru.data.socrata.com (all V as domains). Other states and cities that publish these record types as open data: **not surveyed** (no fetches). Recommended next step is the same Socrata catalogue query (`https://api.us.socrata.com/api/catalog/v1?domains=<portal>&q=<words>`) run per candidate portal (for example data.sfgov.org, data.lacity.org, data.texas.gov, data.wa.gov), then ArcGIS Hub search `https://<hub>/api/search/v1/collections/dataset/items?q=<words>` for Hub portals (V on opendata.dc.gov).

---

### What is usable today without an account

1. **Open JSON APIs, no key, no bot check (V):** NYC ACRIS and DOB licences and contract awards, Philadelphia deeds and OPA (Carto), CT licences, HIC, sales and ledger, DE business licences and checkbook, MD real property and payments, Cook County sales, Chicago contracts and licences, NJ parcels with MOD-IV class, NJ purchasing, MA CTHRU payments, DC business licences / tax roll / PASS contracts, USAspending, EPA ECHO.
2. **Company-only filtering works in most:** use class fields (NJ `PROP_CLASS`, Cook `class`, Philly category, CT `propertytype`, DC `USECODE`) plus a company-suffix check on the name; drop Maryland grantors, CT CAMA owners and DC sole-proprietor owner names.
3. **Licences by business are thin:** CT electrical/plumbing/HVAC licences belong to individuals (HIC `5r9m-qgni` and DE `5zy2-grhr` are the business-level sets); NYC DOB lists firms; PA and NY State issue no state electrician licence (NV).
4. **Blocked to a generic client (stop):** mass.gov, masslandrecords.com, njgin.nj.gov, osha.gov/data, crb.ri.gov, ridop.ri.gov, oplc.nh.gov, nh.gov/transparentnh (403 or challenge); Turnstile on PA HIC search; reCAPTCHA on IDFPR; SAM.gov needs a key; OSHA API and St. Louis assessor services need a token.
5. **Gotchas:** USAspending `recipient_search_text` returns unrelated names for short queries, so verify names; Philadelphia transfers lag about 3.5 months and have a bad year-9798 date; CT sales stop at 2025-09-30; Philadelphia trade licences stop at 2020; ACRIS lags about 4 weeks.
