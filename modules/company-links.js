/* One row of links on each company's first screen: its add-on list, deal model and local signals in the portal,
   (Tools and Plan are tabs of the company). Drawn as a <nav> so the knowledge build leaves the row
   out of the page text. No imports: every string below is fixed copy. */
const CO = {
  cet: { name: 'CET' }, pp: { name: 'Punctual Pros' }, fl: { name: 'Frontline' },
  ts: { name: 'Thomas Scientific' }, bpi: { name: 'BPI' }, fh: { name: 'Fair Harbor' },
};
const go = (href, label) => `<a class="sys-chip" href="${href}">${label} <span aria-hidden="true">→</span></a>`;
/** The link row for one company id (cet, pp, fl, ts, bpi, fh). Returns '' for any other id. */
export function companyLinks(id) {
  const c = CO[id]; if (!c) return '';
  return `<nav class="sys-row mb-12" aria-label="More on ${c.name}" data-company-links="${id}">${go(`#/ma/pipeline?platform=${id}`, 'Add-on targets')}${go(`#/deal/returns?p=${id}`, 'Deal model')}${go(`#/signals/overview?co=${id}`, 'Local signals')}</nav>`;
}
