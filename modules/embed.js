/* Shows one of the site's own pages inside the shell, filling the content area.
   Used for the agent (home/agent), each company's software page (<co>/tools) and growth plan (<co>/plan).
   The page is asked for its embedded form (?embed=1: no top bar, footer or floating Ask button; assets/frame.js) and is
   given the role in view, so it follows the "Viewing as" switch (assets/session.js). Same origin only. */
import { Session } from '../assets/session.js?v=20261123143257';

/** Draw `src` (a path from the site root, for example 'agent.html' or 'redesigns/cet/gridos.html') into ctx.el.
    opts.title is the frame's accessible name; opts.params are extra query parameters. Returns the unmount function. */
export function embedView(ctx, src, opts = {}) {
  const el = ctx.el;
  const u = new URL(src, new URL('../', import.meta.url));
  u.searchParams.set('embed', '1');
  u.searchParams.set('role', Session.role().id);
  for (const [k, v] of Object.entries(opts.params || {})) if (v != null && v !== '') u.searchParams.set(k, v);
  if (opts.hash) u.hash = opts.hash;
  el.innerHTML = '';
  el.classList.add('embed-host');
  const f = document.createElement('iframe');
  f.className = 'embed-frame';
  f.title = opts.title || 'Page';
  f.src = u.href;
  f.setAttribute('loading', 'eager');
  f.style.cssText = 'display:block;width:100%;border:0;background:transparent';
  const fit = () => { const top = f.getBoundingClientRect().top; f.style.height = Math.max(320, innerHeight - top) + 'px'; };
  el.appendChild(f);
  fit();
  addEventListener('resize', fit);
  const stop = Session.onChange((role, what) => {
    if (what !== 'role') return;
    try { const n = new URL(f.src); n.searchParams.set('role', role.id); f.src = n.href; } catch { /* keep the page */ }
  });
  return () => { removeEventListener('resize', fit); stop(); el.classList.remove('embed-host'); };
}
