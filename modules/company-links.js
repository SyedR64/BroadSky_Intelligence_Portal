/* One row of links on each company's first screen: its add-on list, deal model and local signals in the portal,
   then its growth plan, website concept and software page. Drawn as a <nav> so the knowledge build leaves the row
   out of the page text. No imports: every string below is fixed copy. */
const CO = {
  cet: { name: 'CET', dir: 'cet', plan: ['Growth plan', 'growth-plan.html'], os: ['GridOS', 'gridos.html'] },
  pp: { name: 'Punctual Pros', dir: 'punctual-pros', plan: ['Nationwide plan', 'nationwide.html'], os: ['ServiceOS', 'serviceos.html'] },
  fl: { name: 'Frontline', dir: 'frontline', plan: ['Growth plan', 'growth-plan.html'], os: ['FirmOS', 'firmos.html'] },
  ts: { name: 'Thomas Scientific', dir: 'thomas-scientific', plan: ['Growth plan', 'growth-plan.html'], os: ['LabOS', 'labos.html'] },
  bpi: { name: 'BPI', dir: 'bpi', plan: ['Growth plan', 'growth-plan.html'], os: ['SignalOS', 'signalos.html'] },
  fh: { name: 'Fair Harbor', dir: 'fair-harbor', plan: ['Growth plan', 'growth-plan.html'], os: ['HarborOS', 'harboros.html'] },
};
const go = (href, label) => `<a class="sys-chip" href="${href}">${label} <span aria-hidden="true">→</span></a>`;
const out = (href, label) => `<a class="sys-chip" href="${href}" target="_blank" rel="noopener">${label} <span aria-hidden="true">↗</span></a>`;
/** The link row for one company id (cet, pp, fl, ts, bpi, fh). Returns '' for any other id. */
export function companyLinks(id) {
  const c = CO[id]; if (!c) return '';
  const base = `redesigns/${c.dir}/`;
  return `<nav class="sys-row mb-12" aria-label="More on ${c.name}" data-company-links="${id}"><span class="sys-card-label">More on ${c.name}</span>${go(`#/ma/pipeline?platform=${id}`, 'Add-on targets')}${go(`#/deal/returns?p=${id}`, 'Deal model')}${go(`#/signals/overview?co=${id}`, 'Local signals')}${out(base + c.plan[1], c.plan[0])}${out(base + 'index.html', 'Website concept')}${out(base + c.os[1], c.os[0])}</nav>`;
}
