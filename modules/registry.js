/* Module registry. Each module: {id,name,tag,color,group,views:[{id,name,icon,badge,flush,render(ctx)}]}.
   The order of the exported array is the load, search and tour order and it never changes (home stays first: it is the
   default screen). The side menu and the tab rows are drawn from the flags set at the bottom of this file, sorted and
   filtered at draw time in assets/core.js. A screen is flagged, never taken out of its module's views. */
import home from './home.js?v=20261123143257';
import signals from './signals.js?v=20261123143257';
import bsp from './bsp.js?v=20261123143257';
import cet from './cet.js?v=20261123143257';
import pp from './pp.js?v=20261123143257';
import fl from './fl.js?v=20261123143257';
import ts from './ts.js?v=20261123143257';
import bpi from './bpi.js?v=20261123143257';
import fh from './fh.js?v=20261123143257';
import ma from './ma.js?v=20261123143257';
import deal from './deal.js?v=20261123143257';
import cases from './cases.js?v=20261123143257';
import pe from './pe.js?v=20261123143257';
import national from './national.js?v=20261123143257';
import fin from './fin.js?v=20261123143257';
import techos from './techos.js?v=20261123143257';
import theater from './theater.js?v=20261123143257';
import briefing from './briefing.js?v=20261123143257';
import connect from './connect.js?v=20261123143257';
/* Rail and heading names. Headings read "<module name> · <view title>" (modules/copy.js VIEW_TITLES), so a module
   name must not repeat a word of its own view titles ("PE landscape · sponsor landscape"). Ids never change. */
const NAMES = { cases: 'Sponsor precedents', pe: 'Private equity', national: 'US expansion', fin: 'Fundamentals', briefing: 'Narrated tour' };
export const modules = [home, signals, bsp, cet, pp, fl, ts, bpi, fh, ma, deal, cases, pe, national, fin, techos, theater, briefing, connect];
for (const m of modules) if (NAMES[m.id]) m.name = NAMES[m.id];

/* ── The side menu: three groups, one item per module, in this order ────────────
   A module that is not listed is off the menu: its address, tabs, search entries and tour steps are unchanged, and it
   shows in the menu only while it is open. scripts/make_sitemap.py reads RAIL by regex: keep it one statement of
   ['Group name', ['id', …]] pairs. */
const RAIL = [['Portfolio', ['home', 'cet', 'pp', 'fl', 'ts', 'bpi', 'fh']], ['Deals', ['ma', 'deal', 'pe', 'bsp']], ['Value creation', ['signals', 'fin', 'techos', 'connect']]];
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

/* Flags only: nothing below reorders `modules` or any module's views. */
RAIL.forEach(([group, ids], g) => ids.forEach((id, i) => { const m = modules.find(x => x.id === id); if (m) { m.group = group; m.railPos = g * 100 + i; } }));
for (const m of modules) {
  if (m.railPos == null) { m.rail = false; m.group = OFF_MENU_GROUP; }
  for (const v of m.views || []) if ((NO_TAB[m.id] || []).includes(v.id)) v.menu = false;
  if (TAB_ORDER[m.id]) m.tabOrder = TAB_ORDER[m.id];
}
