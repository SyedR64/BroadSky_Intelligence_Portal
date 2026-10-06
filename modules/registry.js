/* Module registry — order = rail order. Each module: {id,name,tag,color,group,views:[{id,name,icon,badge,flush,render(ctx)}]} */
import home from './home.js?v=20261006155542';
import bsp from './bsp.js?v=20261006155542';
import cet from './cet.js?v=20261006155542';
import pp from './pp.js?v=20261006155542';
import fl from './fl.js?v=20261006155542';
import ts from './ts.js?v=20261006155542';
import bpi from './bpi.js?v=20261006155542';
import fh from './fh.js?v=20261006155542';
import ma from './ma.js?v=20261006155542';
import cases from './cases.js?v=20261006155542';
import pe from './pe.js?v=20261006155542';
import national from './national.js?v=20261006155542';
import fin from './fin.js?v=20261006155542';
import techos from './techos.js?v=20261006155542';
import theater from './theater.js?v=20261006155542';
import briefing from './briefing.js?v=20261006155542';
/* Rail and heading names. Headings read "<module name> · <view title>" (modules/copy.js VIEW_TITLES), so a module
   name must not repeat a word of its own view titles ("PE landscape · sponsor landscape"). Ids never change. */
const NAMES = { cases: 'Sponsor precedents', pe: 'Private equity', national: 'US expansion', fin: 'Fundamentals', briefing: 'Narrated tour' };
export const modules = [home, bsp, cet, pp, fl, ts, bpi, fh, ma, cases, pe, national, fin, techos, theater, briefing];
for (const m of modules) if (NAMES[m.id]) m.name = NAMES[m.id];
