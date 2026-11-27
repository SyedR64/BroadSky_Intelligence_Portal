# Third-party notices

This file covers the Globe renderer (`assets/godseye-cesium.js`, `assets/godseye-cesium.css`), the Globe screen's
layers (`modules/globe.js`) and what they load.
The screen is called "Globe" everywhere in the product. The reference project below is named here only to give
its copyright notice; its name is a trademark of others and is not used in the product.

## 1. Code adapted from an MIT-licensed reference project

Source: https://github.com/bilawalsidhu/gods-eye-view, commit `43bd25382d7fb547b1f1411236bd1b6c292035aa`
(read on 23 November 2026). Its LICENSE grants MIT for the source code only; its bundled data, media and the
Google imagery in its clips are not covered, and none of them is used here.

What was adapted (rewritten for this product, not copied as files):

| Ours | From the reference | What |
|---|---|---|
| `loadTiles()` in `assets/godseye-cesium.js` | `src/render/cesium/google3d.js` | Order of attempts: a Google key first through `createGooglePhotorealistic3DTileset({ key, onlyUsingWithGoogleGeocoder: true })`, then Cesium ion's hosted Google asset 2275207 with an explicit token; credentials passed to the source, never set SDK-wide. |
| `hold()`, `stop()`, `reducedMotion()` | `src/cameraVerbs.js` | A slow orbit around the stop by advancing the heading of a per-frame `camera.lookAt(target, HeadingPitchRange)`; any manual input cancels a running move; `prefers-reduced-motion` keeps motion still. |
| `SHADERS.night` | `src/styles/surveillance.js` | A reduced night-vision look: phosphor green, halo around bright areas, grain and vignette (no lens distortion, honeycomb or text overlay). |
| `SHADERS.thermal` | `src/styles/thermal.js` | The ironbow colour ramp, the soft blur and the contour banding (no overlay digits, crosshair or lens mask). |
| `api.mode()` | `src/render/cesium/effects.js` | One full-screen `PostProcessStage` per look, off by default, using Cesium's `colorTexture`, `colorTextureDimensions` and `v_textureCoordinates`. |

Not taken: the product name, logo, media, data files, live-feed layers, server, voice agent and every other part.
The Blueprint look, the great-circle flight, the zoom floors and the card are this product's own.

Licence text, as in the reference project's LICENSE file:

```
MIT License

Copyright (c) 2026 Bilawal Sidhu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. CesiumJS

CesiumJS 1.146.0, Apache License 2.0 (npm package metadata), loaded at run time from unpkg.com with
cdn.jsdelivr.net as the fallback. It is not stored in this repository. Its own licence and notices travel with
the build it serves (`Build/Cesium/`).

## 3. Imagery

### Key-free globe (the default)

| Source | Used for | Terms that allow this use | Credit shown on the globe |
|---|---|---|---|
| NASA Global Imagery Browse Services (GIBS): Blue Marble shaded relief and bathymetry; VIIRS Black Marble 2016 night lights | The globe from orbit; city lights on the night side | NASA Earthdata data use guidance: ESDIS content is "generally not copyrighted" and "there are no restrictions on the use of these data"; NASA material may not imply NASA endorsement. GIBS asks clients to acknowledge it. | "Imagery: NASA GIBS" |
| USDA and USGS, The National Map, "USGS Imagery Only" tile service | Aerial imagery of the lower 48 states near the ground | USGS: "USGS-authored or produced data and information are considered to be in the U.S. Public Domain"; USGS asks for credit. The service's own copyright line: "USDA, USGS The National Map: Orthoimagery." | "USDA, USGS The National Map" |

### Layers on the key-free globe (`modules/globe.js`, the Layers switch and the "Live layers" tour)

Terms read on 27 November 2026. Nothing below needs a key, and nothing is stored in this repository beyond the
nightly snapshots that the Local signals screen already keeps in `data/live/`.

| Source | Used for | Terms that allow this use | Credit shown on the globe |
|---|---|---|---|
| NASA GIBS: VIIRS Black Marble 2016 (`VIIRS_Black_Marble`, WMTS, web-mercator tiles to level 8) | Night lights from orbit, fading out as the camera nears the ground | The same NASA Earthdata guidance as above: NASA-led mission data is public domain (CC0) unless marked otherwise, with no restriction on use; NASA is to be acknowledged and its endorsement never implied. | "Night lights NASA GIBS" |
| NOAA National Weather Service: the MRMS radar mosaic (`radar_base_reflectivity_time` image service on mapservices.weather.noaa.gov, a new frame about every five minutes) and active alerts (api.weather.gov) | Weather: the radar picture, the time of its newest frame, and the counties under an alert | The Weather Service's disclaimer: its information is in the public domain unless noted and may be used without charge for any lawful purpose, so long as it is not claimed as one's own, not presented as official once changed, and no endorsement or affiliation is implied. | "Radar and alerts NOAA National Weather Service" |
| Realtor.com Economic Research (county inventory) and the Census Bureau's Building Permits Survey, from the nightly snapshots | Local signals: one mark for each county with a reading | As on the Local signals screen, which shows the same readings with their sources. | "Listings Realtor.com Permits Census Bureau" |

Competitors and acquisition targets are this product's own research (`data/research/pp_market.json`,
`data/research/globe_tours.json`); their source lines are in the screen's Sources list.

**Aircraft positions are not shown.** No free source was found whose terms cover a company product:

- OpenSky Network: its terms of use require a written licence for any for-profit or commercial entity and for any use
  of its API in a live product. Its API also answers only pages on its own site.
- adsb.fi: open data for personal, non-commercial use only.
- adsb.lol: published under the Open Database License and open to everyone, but its API sends no cross-origin
  header, so a page on this site cannot read it without a relay server of our own; it also allows 500 requests a day
  for each address. Not used.

If a licensed feed is added later, the layer must never show a callsign, a registration or any other identifier of
an aircraft.

### Photorealistic globe (only with a key in `assets/runtime.json`)

- Google Photorealistic 3D Tiles (Map Tiles API), through the site's own Google key, or through Cesium ion with
  the site's own ion token. The imagery is Google's. Google's logo and its attribution line are shown on screen at
  all times and are never covered by the product's controls.
- Google's policies forbid caching or storing the tiles outside their terms, extracting or tracing anything from
  them, and image analysis of them. The product only displays them, with its own pins and cards on top.
- Cesium ion's free Community plan is for personal, non-commercial use; a company deployment needs a paid plan.

## 4. Recording the Globe on film or video

What the research note for this work (`research_godseye_tiles.md`, 23 November 2026) reports from Google's Map
Tiles policies page, section on promotional videos, quoted from the note:

> Video and film: the policies page has a section on promotional videos. Conditions: "no more than 30 seconds in
> length," "must not include Street View imagery," must be "clearly marked, 'for promotional purposes only',"
> "about the capabilities of your application(s)," and "may not be resold separately."

And: "Keep Google's logo and the attribution line visible at all times, including in recorded frames."

So, until it is checked again: a clip that shows Google's photorealistic imagery is at most 30 seconds, shows no
Street View, carries the words "for promotional purposes only" on screen, keeps Google's logo and attribution line
in frame, and is not sold on its own. Whether a given film counts as promotional was not confirmed, and the note
found nothing on screenshots. **These terms must be re-checked on Google's own page
(https://developers.google.com/maps/documentation/tile/policies) before any film is cut.** Footage of the key-free
globe (NASA and USGS imagery) is not bound by Google's terms; keep the on-screen credits in frame.
