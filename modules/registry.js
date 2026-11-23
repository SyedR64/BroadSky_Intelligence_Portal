/* Module registry. Each module: {id,name,tag,color,group,views:[{id,name,icon,badge,flush,render(ctx)}]}.
   The order of the exported array is the load, search and tour order and it never changes (home stays first: it is the
   default screen). The side menu and the tab rows are drawn from the flags set at the bottom of this file, sorted and
   filtered at draw time in assets/core.js. A screen is flagged, never taken out of its module's views. Which levels
   see a module or screen is the LEVELS table below (its rules sit above it); the shell reads it, nothing is deleted. */
import home from './home.js?v=20261123172325';
import signals from './signals.js?v=20261123172325';
import bsp from './bsp.js?v=20261123172325';
import cet from './cet.js?v=20261123172325';
import pp from './pp.js?v=20261123172325';
import fl from './fl.js?v=20261123172325';
import ts from './ts.js?v=20261123172325';
import bpi from './bpi.js?v=20261123172325';
import fh from './fh.js?v=20261123172325';
import ma from './ma.js?v=20261123172325';
import deal from './deal.js?v=20261123172325';
import cases from './cases.js?v=20261123172325';
import pe from './pe.js?v=20261123172325';
import national from './national.js?v=20261123172325';
import fin from './fin.js?v=20261123172325';
import techos from './techos.js?v=20261123172325';
import theater from './theater.js?v=20261123172325';
import briefing from './briefing.js?v=20261123172325';
import connect from './connect.js?v=20261123172325';
import globe from './globe.js?v=20261123172325';
/* Menu names. The window title reads "<module name> · <view title>" (modules/copy.js VIEW_TITLES), so a module name
   must not repeat a word of its own view titles ("PE landscape · sponsor landscape"). Ids never change. */
const NAMES = { home: 'Home', cases: 'Sponsor precedents', pe: 'Private equity', national: 'US expansion', fin: 'Fundamentals', briefing: 'Narrated tour' };
export const modules = [home, signals, bsp, cet, pp, fl, ts, bpi, fh, ma, deal, cases, pe, national, fin, techos, theater, briefing, connect, globe];
for (const m of modules) if (NAMES[m.id]) m.name = NAMES[m.id];

/* ── The firm's side menu (OS_SPEC 4.3): Home, then three groups, one item per module, in this order ──────────
   A group that holds one module of its own name ('Home') is drawn with no heading. A module that is not listed is off
   the menu: its address, tabs, search entries and tour steps are unchanged, and it shows in the menu only while it is
   open. The firm levels see this menu filtered by LEVELS below (investor relations: Home, Fundamentals, Connections);
   the company levels use MENUS instead. It must fit with no scrolling at 1440x900 and at 1280x800.
   scripts/make_sitemap.py reads RAIL by regex: keep it one statement of ['Group name', ['id', …]] pairs. */
const RAIL = [['Home', ['home']], ['Portfolio', ['cet', 'pp', 'fl', 'ts', 'bpi', 'fh']], ['Deals', ['ma', 'deal', 'pe', 'bsp']], ['Value creation', ['signals', 'fin', 'techos', 'connect', 'globe']]];
/* The modules off the menu. In the portal the open one is drawn as a 15th item under a rule, with no heading (a fourth
   heading does not fit a laptop screen); this name is the heading they share on the "All pages" page (make_sitemap.py). */
const OFF_MENU_GROUP = 'More';
/* Screens with no tab. The address still loads and stays in search, the sitemap, the tour and the checker; the tab
   shows only while that screen is open. */
const NO_TAB = { home: ['firm'], fh: ['market'], ma: ['screen', 'loans'], bsp: ['network'], fin: ['explorer', 'methods'], national: ['method'] };
/* Tab order where it differs from the order of the module's views. Ids not listed keep their place after these. */
const TAB_ORDER = { ma: ['overview', 'pipeline', 'research', 'rivals', 'whitespace'], pp: ['overview', 'movers', 'weather', 'territory', 'market', 'filings'] };

/* ── Forwarding table: 'module/view' that was merged away → where it lands ──────
   Read ONLY ON A MISS (assets/core.js App.resolve): while the old view object still exists the old address opens it
   as before, and the entry starts forwarding the moment that object is deleted. The old link's parameters are kept
   and the parameters named here are added. scripts/ci_check.py reads this table by regex and checks that every
   target is a live address: one 'old': 'new' pair per line, plain single-quoted strings. */
export const ALIASES = {
  'signals/levers': 'signals/overview?co=all',
  'cet/territory': 'cet/overview?counties=1',
  'cet/targets': 'ma/pipeline?platform=cet',
  'pp/targets': 'ma/pipeline?platform=pp',
  'fl/targets': 'ma/pipeline?platform=fl',
  'ts/targets': 'ma/pipeline?platform=ts',
  'ma/theses': 'ma/pipeline',
  'bpi/benchmarks': 'fin/comps?sector=communications_agencies',
  'fh/benchmarks': 'fin/comps?sector=apparel_dtc',
  'ma/valuation': 'fin/comps',
  'pe/heatmap': 'pe/landscape?show=grid',
  'fin/deal': 'fin/portfolio',
  'fin/rivals': 'ma/rivals',
};

/* ── Who sees what: the five levels of Broad Sky OS (OS_SPEC 3 and 4.4; audit_inventory.md 3.4, adopted as written) ──
   This is navigation, not security: a visitor is "Viewing as" a role (assets/session.js), nobody signs in. What a role
   may read in the agent is decided by the server (server/workspace.py); this table only decides which screens the
   menu, the tabs and the search box offer, and which addresses open.
   Rules for the table:
   · A key is 'module' (every screen of it) or 'module/screen' (that screen only; it wins over the module's key).
   · `to` lists the levels that open it. A module or screen with no key at all opens for the firm levels only, so a
     screen added without a rule is never shown to a company.
   · `own: true` keeps a company level to its own company. A company module (cet, pp, fl, ts, bpi, fh) opens only for
     that company's roles. A screen with `param` opens with that address parameter set to the viewer's company
     (OWN_PARAM below): ma/pipeline?platform=pp, signals/overview?co=pp, fin/portfolio?co=pp (that company's row only),
     fin/comps?sector=<the company's sector key>,
     techos/roadmap?co=pp, techos/overview?os=pp. Only parameters that already exist are used.
   · `plus` names roles that open it although their level does not (fl-sales on Frontline's mid-size targets).
   · ONLY lists the roles that open nothing but the keys named (investor relations: the fund and documents).
   · Opening anything else sends the visitor to the role's home with one line, "Not in this view." (assets/core.js).
     The forwarding table (ALIASES) is followed first, so old addresses keep working for the firm levels.
   · `<co>/tools` and `<co>/plan` (each company's software page and growth plan) are listed below the table for all six
     companies: Tools opens for the office level up, Plan for company leadership up (OS_SPEC 3: the office menu has no
     Plan). A screen that does not exist yet is simply not drawn. */
const FIRM = ['firm_leadership', 'firm_team'], LEAD = [...FIRM, 'co_leadership'], OFFICE = [...LEAD, 'co_office'], ALL = [...OFFICE, 'co_field'];
export const COMPANIES = ['cet', 'pp', 'fl', 'ts', 'bpi', 'fh'];
export const SECTORS = { cet: 'commercial_electrical_energy', pp: 'residential_home_services', fl: 'legal_bpo_managed_services', ts: 'lab_distribution', bpi: 'communications_agencies', fh: 'apparel_dtc' };
/* the office roles in sales or operations, who see their company's Local signals overview */
const SALES_OPS = ['pp-sales', 'pp-location-gm', 'cet-sales', 'cet-project-manager', 'fl-sales', 'ts-sales', 'ts-inside-sales', 'bpi-sales', 'fh-sales'];
export const LEVELS = {
  'home': { to: ALL },
  'home/firm': { to: FIRM },
  'signals': { to: LEAD, own: true },
  'signals/overview': { to: LEAD, own: true, param: 'co', plus: SALES_OPS },
  'bsp': { to: FIRM },
  'bsp/patterns': { to: LEAD },
  'bsp/rubric': { to: LEAD },
  'cet': { to: LEAD, own: true },
  'cet/overview': { to: OFFICE, own: true },
  'cet/opportunities': { to: LEAD, own: true, plus: ['cet-sales', 'cet-estimator', 'cet-project-manager'] },
  'pp': { to: LEAD, own: true },
  'pp/overview': { to: OFFICE, own: true },
  'pp/weather': { to: OFFICE, own: true },
  'pp/territory': { to: OFFICE, own: true },
  'fl': { to: LEAD, own: true },
  'fl/overview': { to: OFFICE, own: true },
  'fl/midsize': { to: LEAD, own: true, plus: ['fl-sales'] },
  'ts': { to: LEAD, own: true },
  'ts/overview': { to: OFFICE, own: true },
  'ts/accounts': { to: LEAD, own: true, plus: ['ts-sales', 'ts-inside-sales'] },
  'bpi': { to: LEAD, own: true },
  'bpi/overview': { to: OFFICE, own: true },
  'bpi/opportunities': { to: LEAD, own: true, plus: ['bpi-sales'] },
  'fh': { to: LEAD, own: true },
  'fh/overview': { to: OFFICE, own: true },
  'fh/opportunities': { to: LEAD, own: true, plus: ['fh-sales'] },
  'ma': { to: FIRM },
  'ma/pipeline': { to: LEAD, own: true, param: 'platform' },
  'deal': { to: FIRM },
  'cases': { to: FIRM },
  'cases/timeline': { to: LEAD },
  'cases/levers': { to: LEAD },
  'pe': { to: FIRM },
  'national': { to: FIRM, plus: ['pp-ceo', 'pp-cfo', 'pp-vp-operations'] },
  'fin': { to: FIRM },
  'fin/portfolio': { to: LEAD, own: true, param: 'co' },
  'fin/comps': { to: LEAD, own: true, param: 'sector' },
  'techos': { to: FIRM },
  'techos/roadmap': { to: LEAD, own: true, param: 'co' },
  'techos/overview': { to: [...FIRM, 'co_office'], own: true, param: 'os' },
  'theater': { to: LEAD },
  'briefing': { to: OFFICE },
  'connect': { to: OFFICE },
  'globe': { to: ALL },   // every level opens it; the field level reaches it only through an address step and never sees it in its menu
};
for (const co of COMPANIES) { LEVELS[`${co}/tools`] = { to: OFFICE, own: true }; LEVELS[`${co}/plan`] = { to: LEAD, own: true }; }
/* the value an own-company parameter takes for a company (see `param` above) */
export const OWN_PARAM = { platform: co => co, co: co => co, os: co => co, sector: co => SECTORS[co] };
/* roles that open only these keys, whatever their level says */
export const ONLY = { 'bsp-investor-relations': ['home', 'fin/portfolio', 'connect'] };
/* The menus of the company levels (OS_SPEC 3), in this order. '<co>' is the viewer's company: '<co>' alone is its
   module, '<co>/plan' one screen of it. An item names a module or one screen; a screen item opens with its own-company
   parameter. An item the role cannot open, or whose screen does not exist yet, is left out. The firm levels use RAIL. */
export const MENUS = {
  co_leadership: ['home', '<co>', 'fin/portfolio', 'ma/pipeline', 'signals/overview', '<co>/plan', '<co>/tools', 'connect', 'globe'],
  co_office: ['home', '<co>', '<co>/tools', 'connect'],
  co_field: ['home'],
};
/* names for the screen items of those menus (a module item reads the module's name) */
export const MENU_NAMES = { 'fin/portfolio': 'Fundamentals', 'ma/pipeline': 'Add-on pipeline', 'signals/overview': 'Local signals', '<co>/plan': 'Plan', '<co>/tools': 'Tools' };

/* Flags only: nothing below reorders `modules` or any module's views. */
RAIL.forEach(([group, ids], g) => ids.forEach((id, i) => { const m = modules.find(x => x.id === id); if (m) { m.group = group; m.railPos = g * 100 + i; } }));
for (const m of modules) {
  if (m.railPos == null) { m.rail = false; m.group = OFF_MENU_GROUP; }
  for (const v of m.views || []) if ((NO_TAB[m.id] || []).includes(v.id)) v.menu = false;
  if (TAB_ORDER[m.id]) m.tabOrder = TAB_ORDER[m.id];
}
