/* Thomas Scientific concept — shared catalog, FAQ, geography and helpers.
   Products and catalog numbers are ILLUSTRATIVE (concept only). Lab-site counts come from
   the portal's lab-site dataset and are only ever shown in aggregate. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (n, d = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/* ── Categories (periodic-table cells) ─────────────────────────────────────── */
export const CATS = [
  { id: 'consumables', sym: 'Cs', no: '01', name: 'Consumables', blurb: 'Pipettes, tips, tubes, plates, flasks and filtration', subs: ['Pipettes & tips', 'Tubes & vials', 'Plates & flasks', 'Filtration'], hue: '#0b7d77' },
  { id: 'equipment', sym: 'Eq', no: '02', name: 'Equipment', blurb: 'Centrifuges, balances, incubators, biosafety cabinets', subs: ['Centrifuges', 'Balances', 'Incubators', 'Microscopy'], hue: '#2457c5' },
  { id: 'chemicals', sym: 'Ch', no: '03', name: 'Chemicals', blurb: 'HPLC and ACS solvents, buffers, reagents, standards', subs: ['Solvents', 'Buffers', 'Acids & bases', 'Salts'], hue: '#8a4bd1' },
  { id: 'safety', sym: 'Sf', no: '04', name: 'Safety & PPE', blurb: 'Gloves, eyewear, lab coats, spill and eyewash', subs: ['Gloves', 'Eye & face', 'Apparel', 'Spill control'], hue: '#b85a12' },
  { id: 'cleanroom', sym: 'Cr', no: '05', name: 'Cleanroom', blurb: 'ISO 5–8 wipes, garments, disinfectants, mats', subs: ['Wipes', 'Garments', 'Disinfectants', 'Entry control'], hue: '#0b7699' },
  { id: 'coldchain', sym: 'Cc', no: '06', name: 'Cold chain', blurb: 'ULT freezers, lab refrigerators, shippers, loggers', subs: ['ULT freezers', 'Refrigerators', 'Shippers', 'Monitoring'], hue: '#3a6ea5' },
];

/* ── Illustrative catalog (concept data; catalog numbers are not real SKUs) ─── */
const P = (id, cat, name, spec, pack, stock, tags, vert = []) => ({ id, cat, name, spec, pack, stock, tags, vert });
export const PRODUCTS = [
  P('TS-1105-10', 'consumables', 'Serological pipette, 10 mL', 'Polystyrene · sterile · individually wrapped · 1/10 mL grad.', '200 / case', 'ships', 'serological pipette 10 ml sterile individually wrapped cell culture', ['research', 'biopharma']),
  P('TS-1105-25', 'consumables', 'Serological pipette, 25 mL', 'Polystyrene · sterile · individually wrapped', '150 / case', 'ships', 'serological pipette 25 ml sterile', ['research', 'biopharma']),
  P('TS-1105-05', 'consumables', 'Serological pipette, 5 mL', 'Polystyrene · sterile · paper/plastic wrap', '200 / case', 'ships', 'serological pipette 5 ml sterile', ['research', 'biopharma']),
  P('TS-2210-200', 'consumables', 'Filter pipette tips, 200 µL', 'Aerosol barrier · sterile · RNase/DNase-free · racked', '960 / pack', 'ships', 'filter tips 200 ul µl barrier sterile pcr molecular rnase', ['research', 'clinical', 'cannabis']),
  P('TS-2210-1000', 'consumables', 'Filter pipette tips, 1000 µL', 'Aerosol barrier · sterile · racked', '768 / pack', 'ships', 'filter tips 1000 ul µl barrier sterile', ['research', 'clinical']),
  P('TS-3015-15', 'consumables', 'Microcentrifuge tubes, 1.5 mL', 'Polypropylene · snap cap · graduated', '500 / bag', 'ships', 'microcentrifuge tube 1.5 ml eppendorf style', ['research', 'clinical']),
  P('TS-3050-50', 'consumables', 'Conical centrifuge tubes, 50 mL', 'Polypropylene · sterile · rack pack', '500 / case', 'ships', 'conical tube 50 ml falcon style sterile', ['research', 'biopharma', 'clinical']),
  P('TS-4096-PCR', 'consumables', 'PCR plate, 96-well, skirted', 'Polypropylene · low-profile · qPCR-compatible', '50 / case', 'ships', 'pcr plate 96 well qpcr skirted molecular', ['research', 'clinical', 'cannabis']),
  P('TS-5075-T75', 'consumables', 'Cell culture flask, T-75', 'TC-treated · vented cap · sterile', '100 / case', '2day', 'cell culture flask t75 t-75 tc treated vented', ['research', 'biopharma']),
  P('TS-5100-PD', 'consumables', 'Petri dish, 100 mm', 'Polystyrene · sterile · stackable', '500 / case', 'ships', 'petri dish 100 mm sterile microbiology agar', ['research', 'clinical', 'biopharma']),
  P('TS-6002-CV', 'consumables', 'Cryogenic vial, 2 mL', 'Internal thread · self-standing · sterile', '500 / case', 'ships', 'cryovial cryogenic vial 2 ml -80 liquid nitrogen biobank', ['research', 'biopharma', 'clinical']),
  P('TS-6510-SW', 'consumables', 'Specimen collection swab kit', 'Flocked swab + 3 mL transport medium', '50 kits / box', 'ships', 'swab specimen collection transport medium kit', ['clinical']),
  P('TS-7020-SY', 'consumables', 'Syringe filter, 0.22 µm PES', '25 mm · sterile · low protein binding', '50 / pack', 'ships', 'syringe filter 0.22 um pes sterile filtration', ['research', 'biopharma', 'cannabis']),
  P('TS-7200-HV', 'consumables', 'HPLC autosampler vial, 2 mL', 'Amber glass · 9 mm screw · PTFE/silicone septa', '100 / pack', 'ships', 'hplc vial amber 2 ml autosampler chromatography lc-ms', ['cannabis', 'biopharma', 'research']),
  P('TS-8810-MC', 'equipment', 'Microcentrifuge, 24-place', 'Up to 21,300 × g · aerosol-tight rotor', 'each', 'quote', 'microcentrifuge centrifuge 24 place', ['research', 'clinical']),
  P('TS-8850-BC', 'equipment', 'Benchtop centrifuge, refrigerated', 'Swing-bucket · 4 × 750 mL · −10 to 40 °C', 'each', 'quote', 'centrifuge benchtop refrigerated swing bucket', ['research', 'biopharma', 'clinical']),
  P('TS-9001-AB', 'equipment', 'Analytical balance, 0.1 mg', '220 g capacity · internal calibration', 'each', '2day', 'analytical balance 0.1 mg scale weighing', ['research', 'biopharma', 'cannabis']),
  P('TS-9120-VM', 'equipment', 'Vortex mixer, variable speed', '300–3,200 rpm · touch and continuous', 'each', 'ships', 'vortex mixer', ['research', 'clinical']),
  P('TS-9200-HS', 'equipment', 'Hot plate stirrer, 7 × 7 in', 'Ceramic top · to 450 °C · digital', 'each', 'ships', 'hot plate stirrer magnetic', ['research', 'cannabis']),
  P('TS-9300-CO2', 'equipment', 'CO₂ incubator, 170 L', 'IR sensor · HEPA airflow · high-heat decon', 'each', 'quote', 'co2 incubator cell culture 170 l', ['research', 'biopharma']),
  P('TS-9400-BSC', 'equipment', 'Biosafety cabinet, Class II A2', '4 ft · NSF/ANSI 49 · UV option', 'each', 'quote', 'biosafety cabinet bsc class ii a2 hood', ['research', 'biopharma', 'clinical']),
  P('TS-9510-PH', 'equipment', 'Benchtop pH meter', 'pH/mV/temp · GLP data logging', 'each', 'ships', 'ph meter benchtop', ['research', 'cannabis', 'biopharma']),
  P('TS-9620-PP', 'equipment', 'Adjustable pipette, 20–200 µL', 'Single-channel · autoclavable · calibrated', 'each', 'ships', 'pipette pipettor adjustable 20-200 ul µl single channel', ['research', 'clinical', 'cannabis']),
  P('TS-9700-MS', 'equipment', 'Compound microscope, LED', 'Binocular · 40×–1000× · plan achromat', 'each', '2day', 'microscope compound led', ['research', 'clinical', 'forensics']),
  P('TS-C056-4L', 'chemicals', 'Methanol, HPLC grade', 'CAS 67-56-1 · ≥99.9% · 4 L amber glass', '4 × 4 L', 'ships', 'methanol hplc cas 67-56-1 solvent lc-ms', ['cannabis', 'biopharma', 'research']),
  P('TS-C075-4L', 'chemicals', 'Acetonitrile, HPLC grade', 'CAS 75-05-8 · ≥99.9% · 4 L', '4 × 4 L', '2day', 'acetonitrile hplc cas 75-05-8 solvent', ['cannabis', 'biopharma', 'research']),
  P('TS-C064-4L', 'chemicals', 'Ethanol, 200 proof', 'CAS 64-17-5 · ACS/USP · 4 L', '4 × 4 L', 'ships', 'ethanol 200 proof cas 64-17-5 absolute', ['research', 'cannabis', 'clinical']),
  P('TS-C067-70', 'chemicals', 'Isopropyl alcohol, 70%', 'CAS 67-63-0 · USP · 1 gal', '4 × 1 gal', 'ships', 'isopropyl alcohol ipa 70% cas 67-63-0 disinfect', ['clinical', 'cleanroom', 'research']),
  P('TS-C764-NA', 'chemicals', 'Sodium chloride, ACS', 'CAS 7647-14-5 · ≥99.0% · 500 g', 'each', 'ships', 'sodium chloride nacl cas 7647-14-5 acs salt', ['research']),
  P('TS-C077-TR', 'chemicals', 'Tris base, molecular biology', 'CAS 77-86-1 · ≥99.8% · 1 kg', 'each', 'ships', 'tris base cas 77-86-1 buffer molecular biology', ['research', 'biopharma']),
  P('TS-C100-PBS', 'chemicals', 'Phosphate-buffered saline, 10×', 'pH 7.4 · sterile-filtered · 1 L', '6 × 1 L', 'ships', 'pbs phosphate buffered saline 10x buffer', ['research', 'biopharma', 'clinical']),
  P('TS-S001-NG', 'safety', 'Nitrile exam gloves', '4 mil · powder-free · textured fingertips', '10 × 100 / case', 'ships', 'nitrile gloves exam powder free ppe', ['research', 'clinical', 'cannabis', 'forensics', 'biopharma']),
  P('TS-S020-SG', 'safety', 'Safety glasses, anti-fog', 'ANSI Z87.1+ · wraparound', '12 / box', 'ships', 'safety glasses eyewear goggles ansi z87', ['research', 'cannabis', 'cleanroom']),
  P('TS-S040-LC', 'safety', 'Lab coat, fluid-resistant', 'Knit cuffs · snap front · S–3XL', '30 / case', 'ships', 'lab coat apparel fluid resistant', ['research', 'clinical', 'forensics']),
  P('TS-S080-SK', 'safety', 'Chemical spill kit, 5 gal', 'Universal sorbents · OSHA-ready', 'each', 'ships', 'spill kit chemical universal', ['research', 'cannabis']),
  P('TS-S090-EW', 'safety', 'Eyewash station, plumbed', 'ANSI Z358.1 · bowl and dust covers', 'each', '2day', 'eyewash station ansi z358', ['research', 'cannabis']),
  P('TS-R005-WP', 'cleanroom', 'Cleanroom wipes, ISO Class 5', '9 × 9 in · knit polyester · sealed edge', '10 × 150 / case', 'ships', 'cleanroom wipes iso 5 class 100 polyester sealed edge', ['cleanroom', 'biopharma']),
  P('TS-R020-CV', 'cleanroom', 'Cleanroom coverall, sterile', 'ISO 5 · hooded · bound seams', '25 / case', 'ships', 'cleanroom coverall gown garment sterile iso 5 gowning', ['cleanroom', 'biopharma']),
  P('TS-R030-IPA', 'cleanroom', 'Sterile 70% IPA spray', 'Gamma-irradiated · USP WFI · 16 oz', '12 / case', 'ships', 'sterile ipa spray 70% cleanroom disinfectant', ['cleanroom', 'biopharma']),
  P('TS-R040-TM', 'cleanroom', 'Tacky mat, 30-layer', '24 × 36 in · numbered layers', '4 mats / case', 'ships', 'tacky mat sticky mat contamination control entry', ['cleanroom']),
  P('TS-R050-SC', 'cleanroom', 'Shoe covers, cleanroom', 'Non-skid · polypropylene · elastic', '300 / case', 'ships', 'shoe covers booties cleanroom', ['cleanroom', 'biopharma']),
  P('TS-K080-ULT', 'coldchain', 'Ultra-low freezer, −80 °C', '23 cu ft upright · hydrocarbon refrigerants', 'each', 'quote', 'ult freezer -80 ultra low freezer biobank', ['research', 'biopharma', 'clinical']),
  P('TS-K004-LR', 'coldchain', 'Laboratory refrigerator, 2–8 °C', '23 cu ft · glass door · alarm', 'each', 'quote', 'lab refrigerator fridge 2-8 vaccine reagent', ['clinical', 'biopharma', 'research']),
  P('TS-K100-DS', 'coldchain', 'Insulated dry-ice shipper', 'EPS + corrugated · 48–72 h hold', '6 / case', 'ships', 'dry ice shipper insulated shipping box cold chain', ['biopharma', 'clinical', 'research']),
  P('TS-K200-DL', 'coldchain', 'USB temperature data logger', '−80 to 70 °C probe · PDF report', 'each', 'ships', 'temperature data logger monitoring probe', ['biopharma', 'clinical', 'research']),
  P('TS-K300-CB', 'coldchain', 'Cryobox, 81-place', 'Polycarbonate · −196 °C rated', '10 / pack', 'ships', 'cryobox cryo box storage 81 place freezer box', ['research', 'biopharma']),
];
export const STOCK = { ships: { label: 'In stock · ships today', cls: 'ok' }, '2day': { label: 'Ships in 1–2 days', cls: 'soon' }, quote: { label: 'Configured to order · quote', cls: 'quote' } };
export const catById = id => CATS.find(c => c.id === id);

/** Simple ranked catalog search: keyword, CAS number, or catalog number. */
export function search(q, limit = 8) {
  const s = String(q || '').toLowerCase().trim(); if (!s) return [];
  const toks = s.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of PRODUCTS) {
    const hay = `${p.id} ${p.name} ${p.spec} ${p.tags}`.toLowerCase();
    let sc = 0;
    if (p.id.toLowerCase() === s) sc += 100;
    if (hay.includes(s)) sc += 20;
    for (const t of toks) { if (hay.includes(t)) sc += t.length > 2 ? 5 : 2; else if (t.length > 3 && hay.includes(t.slice(0, -1))) sc += 3; }
    const hits = toks.filter(t => hay.includes(t)).length;
    if (hits < Math.ceil(toks.length * .5) && sc < 20) continue;
    if (p.name.toLowerCase().startsWith(toks[0])) sc += 4;
    if (sc > 0) out.push({ p, sc });
  }
  return out.sort((a, b) => b.sc - a.sc).slice(0, limit).map(x => x.p);
}

/* ── Verticals ───────────────────────────────────────────────────────────── */
export const VERTICALS = [
  { id: 'research', name: 'Academic & research', siteKey: ['Academic Medical'], likeLabel: 'Academic medical center lab sites', pain: 'Grant-funded budgets, hundreds of PIs ordering independently, procurement inside Jaggaer or Ariba.', fix: 'Punchout catalogs per department, PI-level budgets, quick reorder of the core consumables list.' },
  { id: 'biopharma', name: 'Biopharma & CDMO', siteKey: [], pain: 'GMP documentation, validated substitutes, cleanroom gowning and cold-chain sample movement.', fix: 'CoA and SDS on every line, change-notification on approved items, VMI in QC and manufacturing stockrooms.' },
  { id: 'clinical', name: 'Clinical diagnostics', siteKey: ['Diagnostics Lab', 'Pathology', 'Hospital', 'Oncology Clinic', 'Diagnostic Center'], likeLabel: 'Clinical lab sites (diagnostics, pathology, hospital, oncology)', pain: 'CLIA-regulated workflows, standing orders, no tolerance for a stock-out on collection kits.', fix: 'Standing orders with lot control, collection-kit assembly, multi-site replenishment from one account.' },
  { id: 'cleanroom', name: 'Cleanroom & advanced tech', siteKey: [], pain: 'ISO-class contamination control across gowning rooms, multiple shifts and sterile consumables.', fix: 'Gowning-room VMI, ISO-class kitting and Northeast cleanroom specialists from the Quintana Supply and Day Associates teams.' },
  { id: 'cannabis', name: 'Cannabis & hemp testing', siteKey: [], pain: 'State-mandated potency, pesticide and solvent testing on HPLC/LC-MS, under tight turnaround and audit.', fix: 'HPLC/LC-MS-grade solvents and vials, filtration, PPE and audit-ready documentation in one order.' },
  { id: 'forensics', name: 'Forensics & public safety', siteKey: [], pain: 'Chain-of-custody evidence collection, crime-scene supplies and agency purchasing rules.', fix: 'Evidence-collection kits and agency kitting, building on Arrowhead Forensics (Lenexa, KS).' },
];

/* ── Geography: tile-grid cartogram (col,row) and illustrative regional teams ─── */
export const TILES = { AK: [0, 0], ME: [11, 0], WI: [6, 1], VT: [10, 1], NH: [11, 1], WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2], OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3], CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4], AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5], OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6], HI: [0, 7], TX: [4, 7], FL: [9, 7], PR: [11, 7] };
export const STATE_NAMES = { AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming' };
export const REGIONS = [
  { id: 'ne', name: 'New England & New York', states: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY'], hub: 'Haverhill & Dracut, MA (Quintana Supply · Day Associates) + Swedesboro, NJ', focus: 'Cleanroom, biotech corridor, academic medical centers' },
  { id: 'ma', name: 'Mid-Atlantic', states: ['NJ', 'PA', 'DE', 'MD', 'DC', 'VA', 'WV'], hub: 'Swedesboro, NJ (headquarters & distribution center)', focus: 'Biopharma and CDMO, clinical reference labs, research universities' },
  { id: 'se', name: 'Southeast', states: ['NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'TN', 'KY', 'PR'], hub: 'Swedesboro, NJ + national distribution network', focus: 'Research Triangle biopharma, clinical diagnostics, Puerto Rico pharma manufacturing' },
  { id: 'mw', name: 'Great Lakes & Upper Midwest', states: ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO'], hub: 'Brooklyn Park, MN (North Central Instruments)', focus: 'Microscopy and equipment, medical device, academic research' },
  { id: 'ce', name: 'Central & Gulf', states: ['KS', 'NE', 'SD', 'ND', 'OK', 'AR', 'LA', 'TX'], hub: 'Lenexa, KS (Arrowhead Forensics)', focus: 'Forensics and public safety, Texas clinical labs, energy and industrial labs' },
  { id: 'mt', name: 'Mountain', states: ['CO', 'UT', 'WY', 'MT', 'ID', 'NM', 'AZ', 'NV'], hub: 'Lenexa, KS + national distribution network', focus: 'Cannabis testing, diagnostics, university research' },
  { id: 'pa', name: 'Pacific', states: ['CA', 'OR', 'WA', 'AK', 'HI'], hub: 'National distribution network', focus: 'Biotech clusters, cannabis testing, clinical diagnostics' },
];
export const regionOf = st => REGIONS.find(r => r.states.includes(st));

/* ── Aggregates of the lab-site dataset (fallback, recomputed live when the dataset loads) ─── */
export const SITES_FALLBACK = { total: 27503, parents: 20001, states: 55, vertical: { 'Diagnostics Lab': 20292, 'Academic Medical': 2975, Pathology: 2195, Hospital: 1046, 'Oncology Clinic': 918, 'Diagnostic Center': 77 } };
export function aggregateSites(rows) {
  const by = {}, vert = {}, arche = {}, label = {}; const parents = new Set();
  for (const r of rows) {
    const s = r.state || '—'; (by[s] ||= { n: 0, vert: {}, arche: {} }); by[s].n++;
    by[s].vert[r.vertical] = (by[s].vert[r.vertical] || 0) + 1; by[s].arche[r.commercial_archetype_v3c] = (by[s].arche[r.commercial_archetype_v3c] || 0) + 1;
    vert[r.vertical] = (vert[r.vertical] || 0) + 1; arche[r.commercial_archetype_v3c] = (arche[r.commercial_archetype_v3c] || 0) + 1; label[r.commercial_priority_label_v3c] = (label[r.commercial_priority_label_v3c] || 0) + 1;
    if (r.parent) parents.add(r.parent);
  }
  return { total: rows.length, parents: parents.size, states: Object.keys(by).length, by, vertical: vert, archetype: arche, label };
}

/* ── FAQ (shared by both pages and the chat widget) ─────────────────────── */
export const FAQ = [
  { q: 'What does Thomas Scientific sell?', a: '<p>Six categories for working labs: <b>consumables</b>, <b>equipment</b>, <b>chemicals</b>, <b>safety & PPE</b>, <b>cleanroom</b> and <b>cold chain</b>, plus services that keep them stocked (vendor-managed inventory, punchout, kitting).</p>', href: '#categories' },
  { q: 'Do you supply cleanroom consumables and garments?', a: '<p>Yes. ISO Class 5–8 wipes, sterile garments and coveralls, sterile IPA, tacky mats and gowning-room supplies. Our Northeast cleanroom specialists joined from <b>Quintana Supply</b> (Haverhill, MA) and <b>Day Associates</b> (Dracut, MA), both acquired in 2023.</p>', href: '#verticals' },
  { q: 'Do you serve cannabis and hemp testing labs?', a: '<p>Yes. HPLC and LC-MS-grade solvents, amber autosampler vials, syringe filters, balances, PPE and audit-ready CoA/SDS documentation, shipped together so potency and residual-solvent testing never waits on one missing line.</p>', href: '#verticals' },
  { q: 'How does pricing work? Can I get a quote?', a: '<p>Accounts get <b>contract pricing</b> by volume and category. Build a quote cart from any product (or paste catalog numbers into Quick Order) and a specialist returns pricing. Concept target: same business day.</p>', href: '#quote' },
  { q: 'How do I set up a punchout catalog?', a: '<p>We connect to the procurement system you already use (Coupa, SAP Ariba, Jaggaer and other cXML/OCI systems). Buyers shop at your contract prices and the cart returns as a requisition.</p>', href: '#services' },
  { q: 'What is vendor-managed inventory (VMI)?', a: '<p>We own the min/max for the stockrooms you choose: scan-based or scheduled counts, automatic replenishment, consignment for critical items and a monthly usage review. Your scientists stop placing reorders.</p>', href: '#services' },
  { q: 'Can you build custom kits?', a: '<p>Yes. Specimen-collection kits, evidence-collection kits, new-hire and gowning kits, and protocol-specific packs assembled under one catalog number. Forensics kitting builds on Arrowhead Forensics (Lenexa, KS).</p>', href: '#services' },
  { q: 'Who is my account representative?', a: '<p>Pick your state in the <b>Find your lab team</b> section. It shows your regional team, the hub that serves you and how many lab sites we already map in your state.</p>', href: '#reps' },
  { q: 'Do you ship temperature-sensitive products?', a: '<p>Yes. ULT freezers and lab refrigerators, dry-ice and insulated shippers, and USB temperature loggers with PDF reports for chain-of-custody records.</p>', href: '#categories' },
  { q: 'Where can I find CoA and SDS documents?', a: '<p>Certificates of Analysis and Safety Data Sheets attach to every product and order line in the document center, searchable by catalog number or lot.</p>', href: '#categories' },
  { q: 'Where do you ship from?', a: '<p>Headquarters and distribution in <b>Swedesboro, NJ</b>, with regional teams from North Central Instruments (Brooklyn Park, MN), Quintana Supply and Day Associates (Massachusetts) and Arrowhead Forensics (Lenexa, KS).</p>', href: '#reps' },
  { q: 'How long has Thomas Scientific been in business?', a: '<p>Since <b>1900</b>, more than 125 years of supplying laboratories. BSP became the majority investor in January 2022.</p>', href: '#heritage' },
  { q: 'Are you hiring?', a: '<p>Distribution, customer service, inside sales and lab specialists. In production a careers page would list open roles by distribution center.</p>', href: '#faq' },
  { q: 'What is LabOS?', a: '<p><b>LabOS</b> is the operating layer behind this site: AI product search, punchout and B2B commerce, vendor-managed inventory, supplier-consolidation analytics and account-health scoring. <a href="labos.html">See the LabOS product page →</a></p>', href: 'labos.html' },
];
export const SUGGESTIONS = ['Do you supply cleanroom consumables?', 'How do I set up a punchout catalog?', 'What is vendor-managed inventory?', 'Who is my account representative?', 'What is LabOS?'];

/* ── Shared UI bits ──────────────────────────────────────────────────────── */
/* The frame (assets/frame.js) owns the top bar, concept banner, breadcrumb and footer. */
export function toast(msg) {
  let t = document.querySelector('.ts-toast'); if (!t) { t = document.createElement('div'); t.className = 'ts-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.innerHTML = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200);
}
export function reveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
}
/** Mount the floating concierge and hand it to the frame so Ask and the hotkey open the same widget. */
export function mountChat(Chat, frame) {
  try {
    const inst = Chat.mount(null, { persona: 'ts', short_name: 'Thomas', mode: 'floating', theme: 'light', faq: FAQ, suggestions: SUGGESTIONS, greeting: 'Search the catalog, find your regional lab team, or ask about punchout, VMI, kitting and cleanroom supply.' });
    frame?.setChat?.(inst);
    return inst;
  } catch (e) { console.warn('chat unavailable', e.message); return null; }
}
/* Turn plain-text "est." in rendered copy into the system badge (UNIFIED §7.3),
   placed after the number it qualifies: "est. $285M" → "$285M [est.]". */
const RX_EST = /\(est\.\)|\best\.(\s+[~$−-]*\d[\d.,]*(?:\s?[–-]\s?\$?[\d.,]+)?(?:[MBK%x]|\s?bps)?)?/g;
export function badgeEst(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const hits = [];
  for (let t = w.nextNode(); t; t = w.nextNode()) { const pe = t.parentElement; if (pe && !pe.closest('.sys-est,script,style,svg,textarea,code,[data-raw]') && /\best\./.test(t.nodeValue)) hits.push(t); }
  const badge = () => { const b = document.createElement('span'); b.className = 'sys-est'; b.textContent = 'est.'; return b; };
  for (const t of hits) {
    const v = t.nodeValue, frag = document.createDocumentFragment(); let last = 0, m;
    RX_EST.lastIndex = 0;
    while ((m = RX_EST.exec(v))) {
      let pre = v.slice(last, m.index);
      if (m[1]) { frag.append(pre + m[1].trimStart()); frag.append(badge()); }
      else { frag.append(pre.replace(/\s+$/, '')); frag.append(badge()); }
      last = m.index + m[0].length;
    }
    frag.append(v.slice(last).replace(/^\s*\(\s*\)/, ''));
    t.replaceWith(frag);
  }
}
