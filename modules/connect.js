/* Connections: every tool the firm and its companies run on, by name, with an honest state.
   Data: data/research/connections.json. States and wording: the OS build spec, section 6. */
const injectCss = () => { if (!document.getElementById('css-connect')) { const l = document.createElement('link'); l.id = 'css-connect'; l.rel = 'stylesheet'; l.href = 'modules/connect.css?v=20261123143257'; document.head.appendChild(l); } };

async function overview(ctx) {
  injectCss();
  ctx.el.innerHTML = '<div class="page-head"><h1 class="sys-h1">Connections</h1></div>';
}

export default {
  id: 'connect', name: 'Connections', color: 'var(--sys-brand)',
  views: [
    { id: 'overview', name: 'Connections', render: overview },
  ],
};
