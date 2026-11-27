/* Globe: a full-bleed 3D globe that any part of the product steers through the map command bus (assets/mapcmd.js):
   a 'bsp:map' event, MapCmd.run(cmd), a { type: 'bsp:map', cmd } message from an embedded page, or the address
   (#/globe/view?tour=<id>, #/globe/view?lat=…&lon=…&label=…[&kind=site&precision=typed]).
   Two renderers sit behind the one command. assets/runtime.json "maps.google3dTilesKey" set: the CesiumJS
   photorealistic renderer (assets/godseye-cesium.js); empty or absent (the default): the MapLibre globe
   (assets/godseye.js). Neither the file nor any tile is fetched before the visitor opens this screen.
   Prepared tours come from data/research/globe_tours.json (built from the add-on screens and the firm records).
   The firm levels see the portfolio tours; a company role sees its own company's. The field level is shown the
   globe only for an address: a typed address ('site' steps) or a job's example address; no tours, no other places.
   Layers (the MapLibre renderer, every level but the field): a switch in the panel turns the globe dark, adds a glow at
   its edge and opens a list of layers, each with a swatch, a name, a count or a time, and its own switch:
     Satellite imagery   the renderer's own USGS layer
     Night lights        NASA GIBS, VIIRS Black Marble 2016 (public domain; NASA asks for the credit)
     Weather             NOAA National Weather Service: the MRMS radar mosaic (the time shown is the newest frame's)
                         and the counties under an active alert (the same call the Local signals screen makes)
     Local signals       the county readings the Local signals screen reads: Realtor.com listings, Census permits
     Competitors         the Punctual Pros market research in data/research/pp_market.json (firm and Punctual Pros)
     Acquisition targets the "Best 3 add-on targets" tours in data/research/globe_tours.json
   No aircraft layer: no free source's terms cover a company product (see THIRD_PARTY_NOTICES.md §3).
   The "Live layers" tour (#/globe/view?tour=live-layers) is a staged move: the whole globe, down to a region, then one
   town, with the layers switching on in turn (STAGES below sets the order and the timing). #/globe/view?layers=1
   opens the screen with the layers already on. */
import { Session } from '../assets/session.js?v=20261127070155';
import { MapCmd } from '../assets/mapcmd.js?v=20261127070155';

const V = new URL(import.meta.url).search;   // the registry's ?v= stamp, reused for the engine and the stylesheet

/** The Google key in assets/runtime.json (maps.google3dTilesKey), or ''. Read when the screen opens, never before. */
export async function mapsKey() {
  try {
    const r = await fetch(`assets/runtime.json${V || ''}`, { cache: 'no-cache' });
    if (!r.ok) return '';
    const k = (await r.json())?.maps?.google3dTilesKey;
    return typeof k === 'string' && /^[\w-]{20,60}$/.test(k.trim()) ? k.trim() : '';
  } catch { return ''; }
}

/** The CesiumJS renderer behind the same small interface as assets/godseye.js mount(). */
async function mountCesium(host, key, opts) {
  const CX = await import(`../assets/godseye-cesium.js${V || '?v=20261127070155'}`);
  const api = CX.createGlobe(host, { maps: { google3dTilesKey: key }, controls: false, onStop: opts.onStop, onEnd: opts.onEnd });
  const r = await api.ready;
  return {
    renderer: 'cesium', api,
    get mode() { return r.ok ? 'cesium' : 'fallback'; },
    run: cmd => api.run(cmd), goTo: i => api.goTo(i), next: () => api.next(), prev: () => api.prev(),
    pause: () => api.pause(), resume: () => api.resume(), home: () => api.home(),
    state: () => { const st = api.state(); return { ...st, look: st.mode, renderer: 'cesium', mode: r.ok ? 'cesium' : 'fallback' }; },
    destroy: () => api.destroy(),
  };
}

/* ── Layers ───────────────────────────────────────────────────────────────── */
export const LIVE_TOUR = 'live-layers';
const NIGHT_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
const RADAR = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer';
const radarTiles = t => `${RADAR}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&time=${t}&f=image`;
const RADAR_NEWEST = `${RADAR}/query?where=${encodeURIComponent("name LIKE 'CONUS%'")}&outFields=idp_validtime&orderByFields=${encodeURIComponent('idp_validtime DESC')}&resultRecordCount=1&returnGeometry=false&f=json`;
const COUNTIES_URL = new URL('../data/national_counties.json', import.meta.url).href;
const ALERT_STATES = ['PA', 'NJ', 'MA', 'CT', 'RI'];   // the states the Local signals screen asks the Weather Service about
const SEVERITY = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
const CREDIT = {
  night: 'Night lights <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance" target="_blank" rel="noopener">NASA GIBS</a>',
  wx: 'Radar and alerts <a href="https://www.weather.gov/disclaimer" target="_blank" rel="noopener">NOAA National Weather Service</a>',
  sig: 'Listings <a href="https://www.realtor.com/research/data/" target="_blank" rel="noopener">Realtor.com</a> Permits <a href="https://www.census.gov/construction/bps/" target="_blank" rel="noopener">Census Bureau</a>',
};
const NIGHT_SKY = { 'sky-color': '#01030a', 'horizon-color': '#2f6fd0', 'fog-color': '#0a1730', 'sky-horizon-blend': .7, 'horizon-fog-blend': .6, 'fog-ground-blend': .3,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, .55, 5, .7, 9, .45, 13, 0] };
/* the look's imagery: dim from orbit so the lights and the marks read, fuller colour and contrast near the ground */
const NIGHT_SAT = { 'raster-saturation': .28, 'raster-contrast': .26, 'raster-brightness-max': ['interpolate', ['linear'], ['zoom'], 2, .5, 6, .66, 10, .84] };
const NIGHT_PLACES = ['interpolate', ['linear'], ['zoom'], 1.5, .3, 5, .75, 8, .95];
/* The staged move. Each stage switches its layers on in turn (ms after the stage starts; 'arrive' counts from the
   moment the camera lands) and holds before the next. Change the order or the timing here. */
const STAGES = [
  { label: 'Whole globe', on: [['night', 1200], ['wx', 4200]], hold: 7200 },
  { label: 'Region', on: [['sig', 'arrive', 200], ['rival', 'arrive', 1300]], hold: 3600 },
  { label: null, on: [['tgt', 300]], hold: 0 },   // the town: its label comes from the target
];
const BASE_ON = ['sat'];                              // what the staged move starts with
/** The staged move's stops, as the panel lists them: the last is the town's own name. */
const stageStops = town => STAGES.map(s => ({ label: s.label || String(town?.sub || '').split(' · ').pop() || town?.label || 'Town' }));
const fc = features => ({ type: 'FeatureCollection', features });
const pt = (lon, lat, properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } });
const pctS = x => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}%`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthWords = ym => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? `${MON[+m[2] - 1]} ${m[1]}` : ''; };
const utc = t => `${new Date(t).toISOString().slice(11, 16)} UTC`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** The layers mode on the MapLibre renderer. Nothing is fetched and no layer is added before it is first switched on. */
function layersMode({ g, screen, panel, ctx, role, targets, town, esc, onStage, onPause, onMode }) {
  const map = g.map, { live, data } = ctx;
  const tok = n => getComputedStyle(g.root).getPropertyValue(n).trim();   // the stage is the dark band: its tokens colour the map
  const C = { sat: tok('--sys-good'), night: tok('--sys-ink'), wx: tok('--sys-info'), sig: tok('--sys-warn'), rival: tok('--sys-mute'), tgt: tok('--sys-brand'), ink: tok('--sys-ink') };   // weather blue, signals amber, competitors grey, targets the brand colour
  const rivalsOK = !role.co || role.co === 'pp';
  const ROWS = [
    { id: 'sat', name: 'Satellite imagery', val: 'USGS', tip: 'USDA and USGS, The National Map' },
    { id: 'night', name: 'Night lights', val: '2016', tip: 'NASA GIBS, VIIRS Black Marble 2016' },
    { id: 'wx', name: 'Weather', tip: 'NOAA National Weather Service radar: time of the newest frame' },
    { id: 'sig', name: 'Local signals', tip: 'Counties with a reading' },
    ...(rivalsOK ? [{ id: 'rival', name: 'Competitors', tip: 'Punctual Pros market research' }] : []),
    ...(targets.length ? [{ id: 'tgt', name: 'Acquisition targets', tip: 'Best add-on targets by company' }] : []),
  ];
  const state = Object.fromEntries(ROWS.map(r => [r.id, false]));
  const info = {};                 // what each layer holds once loaded: { n, asof } or { t }
  let on = false, built = false, destroyed = false, halo = null, clock = 0, radarIv = 0, radarT = null, src = null, saved = null;

  /* ── the panel section ── */
  const $sec = document.createElement('section'); $sec.className = 'gx-layers'; $sec.hidden = true; $sec.setAttribute('aria-label', 'Layers');
  $sec.innerHTML = `<div class="sys-card-label gx-lh"><span>Layers</span><span class="sys-num gx-utc"></span></div>
    <ul class="gx-rows">${ROWS.map(r => `<li><button type="button" class="gx-row" role="switch" aria-checked="false" data-layer="${r.id}" title="${esc(r.tip)}"><span class="gx-sw" style="--c:${esc(C[r.id])}" aria-hidden="true"></span><span class="gx-rn">${esc(r.name)}</span><span class="sys-num gx-rv">${esc(r.val || '')}</span><span class="gx-tg" aria-hidden="true"></span></button></li>`).join('')}</ul>`;
  panel.querySelector('.gx-tours').after($sec);
  const $row = id => $sec.querySelector(`[data-layer="${id}"]`);
  const setVal = (id, text) => { const b = $row(id); if (b) b.querySelector('.gx-rv').textContent = text; };
  $sec.addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (b) set(b.dataset.layer, b.getAttribute('aria-checked') !== 'true'); });
  const tick = () => { $sec.querySelector('.gx-utc').textContent = utc(Date.now()); };

  /* ── data: each loaded once, when the mode first opens ── */
  const loads = {};
  const once = (k, fn) => (loads[k] ||= fn().catch(e => { console.warn('[globe] layer', k, e?.message || e); return null; }));
  const counties = () => once('cty', async () => {
    const r = await fetch(COUNTIES_URL, { cache: 'no-cache' }); if (!r.ok) throw new Error(`counties ${r.status}`);
    const j = data.decode(await r.json()), rows = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
    return new Map(rows.map(c => [String(c.fips).padStart(5, '0'), c]));
  });
  const loadSignals = () => once('sig', async () => {
    const [cty, housing, permits] = await Promise.all([counties(), Promise.resolve(live.snapshot('housing_counties')).catch(() => null), Promise.resolve(live.snapshot('census_permits')).catch(() => null)]);
    if (!cty) return null;
    const by = new Map();
    const row = f => { const k = String(f).padStart(5, '0'), c = cty.get(k); if (!c) return null; if (!by.has(k)) by.set(k, { c }); return by.get(k); };
    for (const h of housing?.items || []) { if (role.co && !(h.cos || []).includes(role.co)) continue; const o = row(h.fips); if (o && Number.isFinite(h.active_yy)) o.listings = h.active_yy; }
    for (const p of permits?.items || []) { const o = role.co ? by.get(String(p.fips).padStart(5, '0')) : row(p.fips); if (o && Number.isFinite(p.units_total)) o.permits = p.units_total; }
    const feats = [...by.values()].filter(o => o.listings != null || o.permits != null).map(o => pt(o.c.lon, o.c.lat, {
      t: `${String(o.c.county_name).replace(/ County$/, '')}\n${o.listings != null ? `Listings ${pctS(o.listings)}` : `Permits ${Math.round(o.permits).toLocaleString('en-US')}`}` }));
    return { feats, n: feats.length, asof: [housing?.month && `Realtor.com county listings against a year earlier, ${monthWords(housing.month)}`, permits?.period && `Census building permits, ${monthWords(permits.period)}`].filter(Boolean).join(' · ') };
  });
  const loadAlerts = () => once('alerts', async () => {
    const [cty, ...lists] = await Promise.all([counties(), ...ALERT_STATES.map(s => live.nwsAlerts(s).catch(() => []))]);
    if (!cty) return null;
    const by = new Map();
    for (const a of lists.flat()) for (const f of a?.fips || []) {
      const k = String(f).slice(-5), c = cty.get(k); if (!c) continue;
      const cur = by.get(k); if (!cur || (SEVERITY[a.severity] || 0) > (SEVERITY[cur.a.severity] || 0)) by.set(k, { c, a });
    }
    return { feats: [...by.values()].map(o => pt(o.c.lon, o.c.lat, { t: String(o.a.event || 'Alert') })), n: by.size };
  });
  const loadRivals = () => once('rival', async () => {
    const mk = await data.research('pp_market');
    const feats = (mk?.items || []).filter(i => i.kind === 'competitor' && Number.isFinite(i.lat) && Number.isFinite(i.lon)).map(i => pt(i.lon, i.lat, { t: String(i.name) }));
    return { feats, n: feats.length, asof: mk?.meta?.generated ? `Punctual Pros market research, ${monthWords(mk.meta.generated)}` : 'Punctual Pros market research' };
  });
  const loadRadar = () => live.fetchJSON(RADAR_NEWEST, { ttl: 4 * 60e3 }).then(j => { const t = j?.features?.[0]?.attributes?.idp_validtime; if (!Number.isFinite(t)) throw new Error('no radar frame'); return t; });

  /* ── the map's layers: added once, hidden and clear; a switch fades them in ── */
  const halo_ = 'rgba(4,8,14,.9)', FONT = ['Noto Sans Regular'];
  const label = (id, source, color, minzoom, extra = {}) => ({ id, type: 'symbol', source, minzoom, ...(extra.filter ? { filter: extra.filter } : {}),
    layout: { visibility: 'none', 'text-field': ['get', 't'], 'text-font': FONT, 'text-size': extra.size || 10.5, 'text-anchor': 'left', 'text-justify': 'left', 'text-offset': [extra.dx || .9, 0], 'text-max-width': 14, 'text-optional': true },
    paint: { 'text-color': color, 'text-halo-color': halo_, 'text-halo-width': 1.3, 'text-opacity': 0, 'text-opacity-transition': { duration: 400, delay: 200 } } });
  const ring = (id, source, color, extra = {}) => ({ id, type: 'circle', source, ...(extra.filter ? { filter: extra.filter } : {}), layout: { visibility: 'none' },
    paint: { 'circle-color': color, 'circle-radius': 0, 'circle-radius-transition': { duration: 520 }, 'circle-opacity': 0, 'circle-opacity-transition': { duration: 420 }, 'circle-stroke-color': extra.stroke || color, 'circle-stroke-width': extra.sw ?? 1.5, 'circle-stroke-opacity': 0, 'circle-stroke-opacity-transition': { duration: 420 } } });
  /* each layer's parts on the map: [map layer id, the paint it carries when on] */
  const z = (a, b, c) => ['interpolate', ['linear'], ['zoom'], 2, a, 7, b, 12, c];
  const PARTS = {
    sat: [['sat', { 'raster-opacity': 1 }]],
    night: [['gl-night', { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 3.2, .88, 6, .5, 7.8, 0] }]],
    wx: [['gl-radar', { 'raster-opacity': .62 }], ['gl-alert', { 'circle-radius': z(3, 7, 10), 'circle-opacity': .14, 'circle-stroke-opacity': .85 }], ['gl-alert-t', { 'text-opacity': .9 }]],
    sig: [['gl-sig', { 'circle-radius': z(1.6, 3.6, 5), 'circle-opacity': .92, 'circle-stroke-opacity': .8 }], ['gl-sig-t', { 'text-opacity': .95 }]],
    rival: [['gl-rival-c', { 'circle-radius': ['step', ['get', 'point_count'], 9, 5, 11, 15, 13], 'circle-opacity': .8, 'circle-stroke-opacity': .9 }], ['gl-rival-n', { 'text-opacity': 1 }],
      ['gl-rival', { 'circle-radius': z(2.5, 4.5, 6), 'circle-opacity': .1, 'circle-stroke-opacity': .95 }], ['gl-rival-t', { 'text-opacity': .9 }]],
    tgt: [['gl-tgt-r', { 'circle-radius': z(5, 9, 13), 'circle-opacity': .14, 'circle-stroke-opacity': .95 }], ['gl-tgt', { 'circle-radius': z(2, 3.2, 4), 'circle-opacity': 1, 'circle-stroke-opacity': .9 }], ['gl-tgt-t', { 'text-opacity': 1 }]],
  };
  function build() {
    if (built) return; built = true;
    const under = map.getLayer('roads') ? 'roads' : undefined;
    map.setPaintProperty('sat', 'raster-opacity-transition', { duration: 600 });
    map.addSource('gl-night', { type: 'raster', tiles: [NIGHT_TILES], tileSize: 256, maxzoom: 8, attribution: CREDIT.night });
    map.addLayer({ id: 'gl-night', type: 'raster', source: 'gl-night', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 1100 }, 'raster-fade-duration': 300, 'raster-contrast': .22, 'raster-saturation': .18 } }, under);
    for (const [id, attribution] of [['gl-alert', CREDIT.wx], ['gl-sig', CREDIT.sig], ['gl-tgt', undefined]]) map.addSource(id, { type: 'geojson', data: fc([]), ...(attribution ? { attribution } : {}) });
    map.addSource('gl-rival', { type: 'geojson', data: fc([]), cluster: true, clusterRadius: 26, clusterMaxZoom: 8 });
    map.addLayer(ring('gl-alert', 'gl-alert', C.wx, { sw: 1.4 }));
    map.addLayer(ring('gl-sig', 'gl-sig', C.sig, { stroke: halo_, sw: 1 }));
    map.addLayer(ring('gl-rival', 'gl-rival', C.rival, { filter: ['!', ['has', 'point_count']], sw: 1.6 }));
    map.addLayer(ring('gl-rival-c', 'gl-rival', 'rgb(10,14,20)', { filter: ['has', 'point_count'], stroke: C.rival, sw: 1.4 }));
    map.addLayer(ring('gl-tgt-r', 'gl-tgt', C.tgt, { sw: 1.8 }));
    map.addLayer(ring('gl-tgt', 'gl-tgt', C.tgt, { stroke: '#fff', sw: 1 }));
    map.addLayer(label('gl-alert-t', 'gl-alert', C.wx, 7.4, { dx: 1.1 }));
    map.addLayer(label('gl-sig-t', 'gl-sig', C.sig, 6.2));
    map.addLayer(label('gl-rival-t', 'gl-rival', C.ink, 9.2, { size: 11, filter: ['!', ['has', 'point_count']] }));
    const n = label('gl-rival-n', 'gl-rival', C.ink, 0, { size: 11, filter: ['has', 'point_count'] });
    Object.assign(n.layout, { 'text-field': ['get', 'point_count_abbreviated'], 'text-anchor': 'center', 'text-justify': 'center', 'text-offset': [0, 0], 'text-allow-overlap': true }); map.addLayer(n);
    map.addLayer(label('gl-tgt-t', 'gl-tgt', '#fff', 4.4, { size: 11.5, dx: 1.2 }));
    if (targets.length) { map.getSource('gl-tgt').setData(fc(targets.map((s, i) => pt(s.lon, s.lat, { t: s.label, i })))); info.tgt = { n: targets.length }; setVal('tgt', String(targets.length)); }
    map.on('click', 'gl-tgt-r', onTarget);
    map.on('mouseenter', 'gl-tgt-r', pointer); map.on('mouseleave', 'gl-tgt-r', unpointer);
  }
  const pointer = () => { map.getCanvas().style.cursor = 'pointer'; }, unpointer = () => { map.getCanvas().style.cursor = ''; };
  const onTarget = e => { const s = targets[e.features?.[0]?.properties?.i]; if (s) MapCmd.run({ title: 'Acquisition targets', steps: [s], source: s._src }); };
  const hideT = {};
  function paint(id, show, instant) {
    for (const [layer, props] of PARTS[id] || []) {
      if (!map.getLayer(layer)) continue;
      clearTimeout(hideT[layer]);
      if (show) map.setLayoutProperty(layer, 'visibility', 'visible');
      else hideT[layer] = setTimeout(() => { if (!state[id] && map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', 'none'); }, instant ? 0 : 1200);
      const apply = () => { if (destroyed || !map.getLayer(layer) || state[id] !== show) return; for (const [k, v] of Object.entries(props)) map.setPaintProperty(layer, k, show ? v : 0); };
      show && !instant ? requestAnimationFrame(apply) : apply();   // one frame at zero first, so the fade starts from clear
    }
  }
  /** Fill a layer's data the first time it is needed; its row shows the count or the time, or "Unavailable". */
  async function fill(id) {
    if (id === 'sig') { const d = await loadSignals(); if (destroyed) return; if (d?.n) { map.getSource('gl-sig')?.setData(fc(d.feats)); info.sig = d; setVal('sig', String(d.n)); } else setVal('sig', 'Unavailable'); }
    else if (id === 'rival') { const d = await loadRivals(); if (destroyed) return; if (d?.n) { map.getSource('gl-rival')?.setData(fc(d.feats)); info.rival = d; setVal('rival', String(d.n)); } else setVal('rival', 'Unavailable'); }
    else if (id === 'wx') { radar(); const d = await loadAlerts(); if (destroyed) return; if (d) { map.getSource('gl-alert')?.setData(fc(d.feats)); info.wx = { ...info.wx, alerts: d.n }; } }
    credit();
  }
  /** The newest radar frame: its time on the row, its tiles on the map. Asked again every five minutes while the mode is on. */
  async function radar() {
    let t; try { t = await loadRadar(); } catch (e) { console.warn('[globe] radar', e?.message || e); if (radarT == null) setVal('wx', 'Unavailable'); return; }
    if (destroyed || t === radarT) return;
    radarT = t; info.wx = { ...info.wx, t }; setVal('wx', utc(t));
    const s = map.getSource('gl-radar');
    if (s) s.setTiles([radarTiles(t)]);
    else {
      map.addSource('gl-radar', { type: 'raster', tiles: [radarTiles(t)], tileSize: 256, maxzoom: 9, bounds: [-127, 23, -65, 50.5], attribution: CREDIT.wx });
      map.addLayer({ id: 'gl-radar', type: 'raster', source: 'gl-radar', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 900 }, 'raster-fade-duration': 300 } }, map.getLayer('roads') ? 'roads' : undefined);
      if (state.wx) paint('wx', true);
    }
    credit();
  }
  /** One layer on or off. */
  function set(id, show, { instant = false } = {}) {
    if (!(id in state) || !on) return;
    state[id] = !!show; $row(id)?.setAttribute('aria-checked', String(!!show));
    paint(id, !!show, instant);
    credit();
  }
  /** The source line for the Sources drawer: only the layers that are on. */
  function credit() {
    const parts = [];
    if (on && state.sat) parts.push('Imagery: USDA and USGS, The National Map');
    if (on && state.night) parts.push('Night lights: NASA GIBS, VIIRS Black Marble 2016');
    if (on && state.wx) parts.push(`Weather: NOAA National Weather Service radar${info.wx?.t ? `, ${utc(info.wx.t)}` : ''}${info.wx?.alerts != null ? `, and ${info.wx.alerts} ${info.wx.alerts === 1 ? 'county' : 'counties'} under an active alert` : ''}`);
    if (on && state.sig && info.sig?.asof) parts.push(`Local signals: ${info.sig.asof}`);
    if (on && state.rival && info.rival?.asof) parts.push(`Competitors: ${info.rival.asof}`);
    if (on && state.tgt && targets.length) parts.push(`Acquisition targets: ${targets[0]._src || 'hand-researched add-on screens'}`);
    if (!parts.length) { src?.remove(); src = null; return; }
    if (!src) { src = document.createElement('p'); src.className = 'sys-src'; src.dataset.src = ''; panel.appendChild(src); }
    const text = parts.join(' · '); if (src.textContent !== text) src.textContent = text;
  }

  /* ── the look: dark space, a glow at the globe's edge, deeper imagery ── */
  /** The globe's radius on screen, in pixels (null when its edge is off screen): the point where the map stops answering. */
  function limb() {
    const c = map.getContainer(), w = c.clientWidth, h = c.clientHeight, cx = w / 2, cy = h / 2;
    const onGlobe = r => { try { const q = map.project(map.unproject([cx + r, cy])); return Math.hypot(q.x - cx - r, q.y - cy) < 1.5; } catch { return false; } };
    let lo = 0, hi = Math.hypot(w, h) / 2;
    if (onGlobe(hi)) return null;
    for (let k = 0; k < 13; k++) { const mid = (lo + hi) / 2; onGlobe(mid) ? lo = mid : hi = mid; }
    return lo;
  }
  const glow = () => {
    if (!halo) return;
    const zoom = map.getZoom(), r = map.getPitch() < 3 && zoom < 5 ? limb() : null;
    if (r == null) { halo.style.opacity = '0'; return; }
    halo.style.setProperty('--r', `${r.toFixed(1)}px`); halo.style.opacity = String(Math.max(0, Math.min(1, (4.6 - zoom) / 1.2)));
  };
  function look(show) {
    if (show) {
      saved = { sky: map.getSky?.() || null, places: map.getLayer('places') ? map.getPaintProperty('places', 'text-opacity') : null,
        sat: Object.fromEntries(Object.keys(NIGHT_SAT).map(k => [k, map.getPaintProperty('sat', k)])) };
      map.setSky(NIGHT_SKY);
      for (const [k, v] of Object.entries(NIGHT_SAT)) map.setPaintProperty('sat', k, v);
      if (map.getLayer('places')) map.setPaintProperty('places', 'text-opacity', NIGHT_PLACES);
      halo = document.createElement('div'); halo.className = 'gx-halo'; halo.setAttribute('aria-hidden', 'true'); g.root.appendChild(halo);
      map.on('move', glow); map.on('resize', glow); glow();
    } else if (saved) {
      if (saved.sky) map.setSky(saved.sky);
      for (const [k, v] of Object.entries(saved.sat)) map.setPaintProperty('sat', k, v ?? (k === 'raster-brightness-max' ? 1 : 0));
      if (saved.places != null && map.getLayer('places')) map.setPaintProperty('places', 'text-opacity', saved.places);
      map.off('move', glow); map.off('resize', glow); halo?.remove(); halo = null; saved = null;
    }
  }

  /** The mode on or off. On: the look, the list, and every layer switched on unless `only` names the ones to start with. */
  function toggle(show, { only = null } = {}) {
    show = !!show;
    if (show === on) { if (show && only) for (const r of ROWS) set(r.id, only.includes(r.id), { instant: true }); return; }
    if (!show) { stop(); for (const r of ROWS) if (r.id !== 'sat') set(r.id, false, { instant: true }); set('sat', true, { instant: true }); }
    on = show;
    screen.toggleAttribute('data-layers', on); $sec.hidden = !on;
    if (on) panel.dataset.sysTheme = 'dark'; else delete panel.dataset.sysTheme;
    look(on); onMode?.(on);
    clearInterval(clock); clearInterval(radarIv);
    if (on) {
      build(); tick(); clock = setInterval(tick, 15e3); radarIv = setInterval(() => { if (state.wx) radar(); }, 5 * 60e3);
      for (const r of ROWS) set(r.id, only ? only.includes(r.id) : true, { instant: !!only });
      for (const id of ['wx', 'sig', 'rival']) if (id in state) fill(id);
    } else credit();
  }

  /* ── the staged move ── */
  const run = { token: 0, i: -1, at: 0, paused: false, timers: [] };   // i: the stage playing (-1 when none); at: the last one played
  const later = (ms, fn) => { const tok = run.token; run.timers.push(setTimeout(() => { if (tok === run.token && !destroyed) fn(); }, ms)); };
  const wait = ms => new Promise(res => later(ms, res));
  const arrive = (cam, ms) => new Promise(res => {
    if (reduced() || !ms) { map.jumpTo(cam); return res(); }
    let done = false; const fin = () => { if (!done) { done = true; map.off('moveend', fin); res(); } };
    map.stop();   // a move still easing would end here and answer for this one
    map.flyTo({ ...cam, duration: ms, curve: 1.42, essential: true, easing: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
    map.once('moveend', fin); later(ms + 1500, fin);
  });
  const stageOn = (i, at) => { for (const [id, when, ms = 0] of STAGES[i].on) if ((when === 'arrive') === (at === 'arrive')) later(at === 'arrive' ? ms : when, () => set(id, true)); };
  function stop() { run.token++; run.i = -1; run.timers.forEach(clearTimeout); run.timers = []; map.off('mousedown', userStop); map.off('wheel', userStop); map.off('touchstart', userStop); }
  const userStop = () => { if (run.i >= 0 && !run.paused) { pause(); onPause?.(true); } };
  /** Play from stage i: everything earlier stages switch on is on, the rest is off, then stage i runs and the move goes on. */
  async function play(i = 0) {
    if (!town) return;
    stop(); const tok = ++run.token; run.paused = false; run.i = run.at = i;
    const last = MapCmd.validate({ title: town.label, steps: [{ ...town, zoom: Math.min(town.zoom ?? 12.4, 12.4) }] }).cmd; if (!last) return;
    const before = new Set(BASE_ON); STAGES.slice(0, i).forEach(s => s.on.forEach(([id]) => before.add(id)));
    toggle(true, { only: [...before] });
    if (i < 2) { g.home(); map.stop(); }   // the engine clears its pins and card; the camera is ours until the town
    for (const ev of ['mousedown', 'wheel', 'touchstart']) map.on(ev, userStop);
    const still = () => tok === run.token && !destroyed;
    const region = { center: [town.lon + 1.15, town.lat + .35], zoom: 6.35, pitch: 32, bearing: -14 };
    for (let k = i; k < STAGES.length && still(); k++) {
      run.i = run.at = k; onStage?.(k); stageOn(k, 'start');
      if (k === 0) {
        const start = { center: [town.lon + 46, 22], zoom: 1.72, pitch: 0, bearing: 0 };
        const far = Math.abs(map.getCenter().lng - start.center[0]) > 8 || Math.abs(map.getZoom() - start.zoom) > .4 || map.getPitch() > 2;
        await arrive(start, far ? 2400 : 0); if (!still()) return;
        if (!reduced()) map.easeTo({ center: [town.lon + 6, 33], zoom: 2.05, duration: STAGES[0].hold, easing: t => t, essential: true });
      } else if (k === 1) {
        await arrive(region, 5200); if (!still()) return;
        if (!reduced()) map.easeTo({ bearing: region.bearing + 9, duration: STAGES[1].hold, easing: t => t, essential: true });
      } else {
        map.off('mousedown', userStop); map.off('wheel', userStop); map.off('touchstart', userStop);
        g.run(last);   // the engine's own flight, pin, card and slow orbit
      }
      stageOn(k, 'arrive');
      if (STAGES[k].hold) await wait(STAGES[k].hold);
    }
  }
  function pause() { run.paused = true; run.token++; run.timers.forEach(clearTimeout); run.timers = []; try { map.stop(); } catch { } g.pause(); }
  const director = {
    goTo: i => play(Math.max(0, Math.min(STAGES.length - 1, i))), next: () => director.goTo(run.at + 1), prev: () => director.goTo(run.at - 1),
    pause, resume: () => play(Math.max(0, run.at)), stop,
  };

  return {
    get on() { return on; }, toggle, set, play, director, available: true,
    /** For checks: what the mode is showing. */
    state: () => ({ on, layers: { ...state }, values: Object.fromEntries(ROWS.map(r => [r.id, $row(r.id)?.querySelector('.gx-rv').textContent || ''])), stage: run.i, radar: radarT, halo: halo ? +halo.style.opacity : 0 }),
    destroy() { destroyed = true; stop(); clearInterval(clock); clearInterval(radarIv); Object.values(hideT).forEach(clearTimeout); src?.remove(); halo?.remove(); try { map.off('move', glow); map.off('resize', glow); map.off('click', 'gl-tgt-r', onTarget); } catch { } },
  };
}

/** The tours a role may run: firm levels get the firm's; a company role gets its own company's. */
function toursFor(all, role) {
  if (role.level === 'co_field') return [];
  const co = role.co;
  const out = [];
  for (const t of all) {
    const f = t.for || {};
    if (!co && f.firm) out.push(t);
    else if (co && f.co === co) out.push(t);
    else if (co && f.own_stop) {
      const own = (t.steps || []).filter(s => s.co === co);
      if (own.length) out.push({ ...t, id: `${t.id}-${co}`, title: 'Headquarters', steps: own });
    }
  }
  return out;
}

async function view(ctx) {
  const { el, params, data, esc, app } = ctx;
  if (!document.getElementById('css-globe')) { const l = document.createElement('link'); l.id = 'css-globe'; l.rel = 'stylesheet'; l.href = `modules/globe.css${V || '?v=20261127070155'}`; document.head.appendChild(l); }
  const role = Session.role();
  const field = role.level === 'co_field';
  el.innerHTML = `<div class="gx-screen">
    <div class="gx-host"></div>
    <aside class="sys-card gx-panel" aria-label="Tours">
      <div class="gx-head"><h1 class="sys-card-title gx-h1">Globe</h1>
        <div class="gx-acts"><div class="gx-ctl" hidden>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="prev" aria-label="Previous stop"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="pause" aria-label="Pause" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="next" aria-label="Next stop"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="home" aria-label="Whole globe"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.5 8h11M8 2.5c-2 2.2-2 8.8 0 11M8 2.5c2 2.2 2 8.8 0 11" stroke="currentColor" stroke-width="1.2" fill="none"/></svg></button>
        </div>
        <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon gx-mode" aria-label="Layers" title="Layers" aria-pressed="false" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 2.2 5.1 8 8l5.8-2.9L8 2.2zM2.2 8 8 10.9 13.8 8M2.2 10.9 8 13.8l5.8-2.9" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/></svg></button></div></div>
      <div class="sys-chips gx-tours" role="group" aria-label="Tours"></div>
      <div class="gx-now" hidden><div class="sys-card-label gx-title"></div><ol class="gx-stops"></ol></div>
    </aside></div>`;
  const host = el.querySelector('.gx-host'), $tours = el.querySelector('.gx-tours'), $now = el.querySelector('.gx-now'), $title = el.querySelector('.gx-title'), $stops = el.querySelector('.gx-stops'), $ctl = el.querySelector('.gx-ctl'), $mode = el.querySelector('.gx-mode');
  let src = null;   // the tour's source line: marked data-src, so the shell moves it to the Sources drawer
  let current = null, L = null;   // the command on screen; the layers mode (the MapLibre renderer only)

  const allTours = (await data.research('globe_tours'))?.tours || [];
  const tours = toursFor(allTours, role);
  $tours.innerHTML = tours.map(t => `<button type="button" class="sys-chip" data-tour="${esc(t.id)}" aria-pressed="false">${esc(t.title)}</button>`).join('');
  if (!tours.length) $tours.hidden = true;

  const key = params.fallback === '1' ? '' : await mapsKey();
  if (!host.isConnected) return;   // the visitor left while the key was read
  const screen = el.querySelector('.gx-screen');
  screen.dataset.renderer = key ? 'cesium' : 'open';
  const engineOpts = {
    preserveDrawingBuffer: params.capture === '1',
    forceFallback: params.fallback === '1',
    onStop: i => { if (!current?._live) mark(i); },
    onEnd: () => {},
  };
  const mark = i => { [...$stops.children].forEach((li, k) => li.classList.toggle('on', k === i)); };
  let g;
  try { g = key ? await mountCesium(host, key, engineOpts) : await (await import(`../assets/godseye.js${V || '?v=20261127070155'}`)).mount(host, engineOpts); }
  catch (e) { console.warn('[globe]', e); host.innerHTML = `<div class="gx-msg">${ctx.ui.note('The globe could not load.', 'warn')}</div>`; return; }
  if (!host.isConnected) { g.destroy(); return; }
  if (!g.renderer) g.renderer = 'open';
  window.BSPGlobe = g;
  // phones: the renderer's own controls sit below the panel band
  const $panel = el.querySelector('.gx-panel');
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => screen.style.setProperty('--gx-panel-h', `${Math.ceil($panel.getBoundingClientRect().bottom - screen.getBoundingClientRect().top)}px`)) : null;
  ro?.observe($panel);

  /* layers: the firm sees every company's best add-on targets, a company its own; the staged move ends on one of them
     (a Punctual Pros target where the role has one: the competitor research is that market's), else the role's own headquarters */
  const targets = []; { const seen = new Set(); for (const t of (role.co ? tours : allTours)) if (/^best3/.test(t.id)) for (const s of t.steps || []) if (!seen.has(s.label)) { seen.add(s.label); targets.push({ ...s, _src: t.source }); } }
  const town = targets.find(s => /platform=pp\b/.test(s.href || '')) || targets[0] || (role.co ? (allTours.find(t => t.id === 'companies')?.steps || []).find(s => s.co === role.co) : null) || null;
  const canLayers = !field && g.renderer === 'open' && g.mode === 'open' && !!g.map;
  const want = { live: false, layers: params.layers === '1' };   // asked for before the map's style had loaded
  const styled = () => { try { return !!g.map.getLayer('sat') && g.map.style?._loaded !== false; } catch { return false; } };
  const arm = () => {
    if (L || !host.isConnected || !g.map) return;
    if (!styled()) { g.map.once('styledata', arm); return; }   // a slow start: the engine hands the map over before its style is in
    L = layersMode({ g, screen, panel: $panel, ctx, role, targets, town, esc, onStage: mark, onPause: p => setPaused(p), onMode: v => $mode.setAttribute('aria-pressed', String(v)) });
    g.layers = L; $mode.hidden = false;
    if (want.live) run({ tour: LIVE_TOUR }); else if (want.layers && !current) L.toggle(true);
  };
  if (canLayers && town) { $tours.insertAdjacentHTML('beforeend', `<button type="button" class="sys-chip" data-tour="${LIVE_TOUR}" aria-pressed="false">Live layers</button>`); $tours.hidden = false; }
  const drive = () => (current?._live ? L.director : g);   // who the stop list and the transport buttons steer
  const clear = () => { current = null; $now.hidden = true; $ctl.hidden = true; setSrc(null); $tours.querySelectorAll('[data-tour]').forEach(b => b.setAttribute('aria-pressed', 'false')); history.replaceState(history.state, '', '#/globe/view'); };
  $mode.addEventListener('click', () => { if (!L) return; if (L.on && current?._live) clear(); L.toggle(!L.on); });
  const setSrc = text => {
    src?.remove(); src = null;
    if (!text) return;
    src = document.createElement('p'); src.className = 'sys-src'; src.dataset.src = ''; src.textContent = text;
    el.querySelector('.gx-panel').appendChild(src);
  };
  const show = cmd => {
    current = cmd;
    $now.hidden = !cmd.steps.length; $ctl.hidden = cmd.steps.length < 2 || g.mode === 'fallback';
    $title.textContent = cmd.title;
    $stops.innerHTML = cmd.steps.map((s, i) => `<li><button type="button" class="gx-stop" data-i="${i}"><span class="gx-k sys-num">${i + 1}</span><span class="gx-l">${esc(s.label)}</span></button></li>`).join('');
    $tours.querySelectorAll('[data-tour]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tour === cmd._tour)));
    setSrc(cmd.source);
    setPaused(false);
    if (cmd._live) L.play(0); else { L?.director.stop(); g.run(cmd); }
  };
  /** Resolve and run a cleaned command (a tour id or steps). The field level keeps address steps only. */
  const run = cmd => {
    if (!cmd) return false;
    if (cmd.tour === LIVE_TOUR) {
      if (!canLayers || !town) return false;
      if (!L) { want.live = true; return true; }   // runs as soon as the map's style is in
      want.live = false;
      show({ title: 'Live layers', steps: stageStops(town), source: '', _tour: LIVE_TOUR, _live: true });
      const h = `#/globe/view?tour=${LIVE_TOUR}`; if (location.hash !== h) history.replaceState(history.state, '', h);
      return true;
    }
    if (cmd.tour) {
      const t = tours.find(x => x.id === cmd.tour) || (!role.co && !field ? allTours.find(x => x.id === cmd.tour) : null);
      if (!t) return false;
      const v = MapCmd.validate({ title: t.title, steps: t.steps, source: t.source });
      if (!v.ok) return false;
      show({ ...v.cmd, _tour: t.id });
      const h = `#/globe/view?tour=${encodeURIComponent(t.id)}`; if (location.hash !== h) history.replaceState(history.state, '', h);
      return true;
    }
    let c = cmd;
    if (field) { const steps = (c.steps || []).filter(s => s.kind === 'address' || s.kind === 'site'); if (!steps.length) return false; c = { ...c, steps, marks: [] }; }
    show(c);
    return true;
  };

  $tours.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (b) run({ tour: b.dataset.tour }); });
  $stops.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { setPaused(false); drive().goTo(+b.dataset.i); } });
  const $pause = $ctl.querySelector('[data-act=pause]');
  function setPaused(p) { $pause.setAttribute('aria-pressed', String(p)); $pause.setAttribute('aria-label', p ? 'Play' : 'Pause'); $pause.querySelector('svg').innerHTML = p ? '<path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/>' : '<path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'; }
  $ctl.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    if (a === 'prev') { setPaused(false); drive().prev(); } else if (a === 'next') { setPaused(false); drive().next(); }
    else if (a === 'pause') { const p = $pause.getAttribute('aria-pressed') !== 'true'; setPaused(p); p ? drive().pause() : drive().resume(); }
    else if (a === 'home') { L?.director.stop(); g.home(); clear(); }
  });

  // commands from anywhere in the product while the screen is open
  const onCmd = e => {
    const v = e.detail?._clean ? { ok: true, cmd: e.detail } : MapCmd.validate(e.detail);
    if (!v.ok) { console.warn('[globe] command refused:', (v.errors || []).join('; ')); return; }
    if (run(v.cmd) && !v.cmd.tour && location.hash !== '#/globe/view') history.replaceState(history.state, '', '#/globe/view');
  };
  window.addEventListener(MapCmd.EVENT, onCmd);
  window.__bspGlobeOpen = true;

  // first command: one sent before the screen opened, else the address; else the globe waits with the companies marked
  const first = MapCmd.takePending() || MapCmd.fromAddress(params);
  if (!run(first) && !field) {
    const hq = allTours.find(t => t.id === 'companies');
    const marks = (hq?.steps || []).filter(s => !role.co || s.co === role.co).map(s => ({ lat: s.lat, lon: s.lon, label: s.label }));
    if (marks.length) g.run({ title: '', steps: [], marks, fit: false });
  } else want.layers = false;   // #/globe/view?layers=1 opens with the layers on, unless a command came with it
  if (canLayers) arm();

  app.index([...tours.map(t => ({ label: `Globe · ${t.title}`, sub: t.steps.map(s => s.label).slice(0, 3).join(', '), href: `#/globe/view?tour=${t.id}`, kind: 'Tour', color: 'var(--sys-brand)' })),
    ...(canLayers && town ? [{ label: 'Globe · Live layers', sub: stageStops(town).map(s => s.label).join(', '), href: `#/globe/view?tour=${LIVE_TOUR}`, kind: 'Tour', color: 'var(--sys-brand)' }] : [])]);

  return () => {
    window.__bspGlobeOpen = false;
    window.removeEventListener(MapCmd.EVENT, onCmd);
    ro?.disconnect();
    src?.remove();
    try { L?.destroy(); } catch { }
    if (window.BSPGlobe === g) window.BSPGlobe = null;
    try { g.destroy(); } catch { }
  };
}

export default {
  id: 'globe',
  name: 'Globe',
  tag: 'GL',
  color: 'var(--sys-brand)',
  group: 'Command',
  tagline: 'A 3D globe of the portfolio, steered by tours and by the agent',
  views: [
    { id: 'view', name: 'Globe', icon: '◍', flush: true, render: view },
  ],
};
