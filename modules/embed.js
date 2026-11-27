/* Shows one of the site's own pages inside the shell, filling the content area.
   Used for the agent (home/agent), each company's software page (<co>/tools) and growth plan (<co>/plan).
   The page is asked for its embedded form (?embed=1: no top bar, footer, page sub-bar or floating Ask button;
   assets/frame.js) and is given the role in view, so it follows the "Viewing as" switch (assets/session.js).
   The frame takes the whole content area and the page scrolls inside it: one scroll. Same origin only. */
import { Session } from '../assets/session.js?v=20261127070155';
// the shell's own backend setting from its address: 'off', 'auto' or an http(s) address (assets/backend.js reads the same parameter)
const BACKEND = (() => {
  try {
    const q = String(new URLSearchParams(location.search).get('backend') || '').trim();
    return q === 'off' || q === 'auto' || /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(q) ? q : '';
  } catch { return ''; }
})();

/** Draw `src` (a path from the site root, for example 'agent.html' or 'redesigns/cet/gridos.html') into ctx.el.
    opts.title is the frame's accessible name; opts.params are extra query parameters. Returns the unmount function. */
export function embedView(ctx, src, opts = {}) {
  const el = ctx.el;
  const address = role => {
    const u = new URL(src, new URL('../', import.meta.url));
    u.searchParams.set('embed', '1');
    u.searchParams.set('role', role.id);
    // the page in the frame uses the shell's backend setting, whatever it is (the embedded page does not store it: assets/backend.js)
    if (BACKEND) u.searchParams.set('backend', BACKEND);
    for (const [k, v] of Object.entries(opts.params || {})) if (v != null && v !== '') u.searchParams.set(k, v);
    if (opts.hash) u.hash = opts.hash;
    return u.href;
  };
  el.innerHTML = '';
  // the content area stops scrolling and loses its padding (core.js resets the class on the next screen)
  el.classList.add('embed-host', 'flush');
  const f = document.createElement('iframe');
  f.className = 'embed-frame';
  f.title = opts.title || 'Page';
  f.setAttribute('loading', 'eager');
  f.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:transparent';
  el.appendChild(f);
  // the address waits for the role list, so it names the role in view (an address or stored choice, not a guess)
  let live = true;
  Session.ready().then(() => { if (live) f.src = address(Session.role()); });
  const stop = Session.onChange((role, what) => {
    if (what !== 'role' || !live) return;
    const next = address(role);
    if (f.src !== next) f.src = next;
  });
  return () => { live = false; stop(); el.classList.remove('embed-host', 'flush'); };
}
