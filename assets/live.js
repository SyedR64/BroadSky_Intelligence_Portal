/* Live2 — read the nightly snapshots written by scripts/refresh_live.py (data/live/<name>.json).
   Use when a live browser-side API call fails:
     import { Live2 } from '../assets/live.js?v=20261006143735';
     const alerts = await Live2.fallback(() => ctx.live.nwsAlerts('PA'), 'nws_alerts', s => s.items.filter(a => a.state === 'PA'));
   Snapshots: nws_alerts, forecast_hubs, usaspending_trades, echo_npdes_majors, census_permits, manifest. */
const BASE = new URL('.', import.meta.url).href.replace(/assets\/$/, '');
const _cache = new Map();

export const Live2 = {
  /** Fetch data/live/<name>.json. Returns the parsed snapshot ({fetched_at, source_urls, items, ...}) or null if missing. */
  async snapshot(name) {
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Bad snapshot name: ${name}`);
    if (_cache.has(name)) return _cache.get(name);
    const p = fetch(`${BASE}data/live/${name}.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    _cache.set(name, p);
    const v = await p; if (v == null) _cache.delete(name);
    return v;
  },
  /** Per-source status written by the nightly job. */
  manifest() { return Live2.snapshot('manifest'); },
  /** Age of a snapshot in hours (null if unknown). */
  ageHours(snap) { const t = Date.parse(snap?.fetched_at || ''); return Number.isFinite(t) ? (Date.now() - t) / 36e5 : null; },
  /** Try the live call first; on failure resolve the snapshot (optionally mapped). Result is tagged with _snapshot when it came from disk. */
  async fallback(liveFn, name, map = s => s.items) {
    try { return await liveFn(); }
    catch (e) {
      const s = await Live2.snapshot(name); if (!s) throw e;
      const v = map(s); try { if (v && typeof v === 'object') Object.defineProperty(v, '_snapshot', { value: { fetched_at: s.fetched_at, name }, enumerable: false }); } catch { }
      return v;
    }
  },
};
window.BSPLive2 = Live2;
export default Live2;
