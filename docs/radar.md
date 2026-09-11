# Precipitation radar

Radar is a shared React view in the website/PWA and Capacitor iOS app. It needs no API key, account, new backend endpoint, or storage migration. Navigation is Today · Radar · Places · Settings; the rain outlook also links to Radar. A place chosen from Radar returns there, while moving the map never changes the forecast location.

## Sources and coverage

- [NOAA regional WMS services](https://opengeo.ncep.noaa.gov/geoserver/www/index.html): `conus`, `alaska`, `hawaii`, `carib` and `guam`. The adapter selects the regional service from the place coordinates and uses its advertised geographic bounds to detect views outside coverage. These rectangular service extents do not imply radar coverage at every point. Other locations receive an explicit coverage message.
- Intensity: `<region>_bref_qcd`, `radar_reflectivity` style, quality-controlled base reflectivity in dBZ.
- Type: `<region>_pcpn_typ`, `radar_precip_type` style. The [NOAA product definitions](https://www.weather.gov/radarfaq/) identify warm/cool/tropical stratiform rain, convective/tropical convective rain, snow and hail. Sleet and freezing rain are not separately identified.
- [OpenFreeMap](https://openfreemap.org/quick_start/): vector basemap and glyphs. `src/data/radar-map-style.json` bundles the customized Positron style; no remote style or sprite sheet is required. Cream land, sage vegetation, muted blue water and restrained roads sit beneath geographically accurate NOAA imagery and town labels.

The NOAA legends in `public/radar` are the original `BREFQCD_CT.png` and `PCPNTYP_CT.png` from `https://www.weather.gov/images/nws/radarfaq/`. Intensity markings run from −20 to 70 dBZ. The type legend's actual left-to-right labels are **WS, S, C, H, CS, ST, CT** (the FAQ prose calls the last two TS and TC). The themed legend uses the same category order and exact swatch colors, with full names visible beside pixel-framed swatches. Its responsive intensity panel displays the original NOAA color row between the −20 and 70 dBZ markings, with live text labels instead of scaling down the image text. `RadarLegend.tsx` keeps both keys available offline and changes the displayed key with the selected layer. Radar colors are not recolored; nearest-neighbor raster rendering avoids smoothing categories. Imagery uses 80% opacity for geographic context.

Visible attribution credits NOAA/NWS, OpenFreeMap, OpenMapTiles and OpenStreetMap. The map credits page includes the original Positron designers, modifications and bundled license notices. See [OpenFreeMap's upstream licenses](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md). Settings privacy explains that the providers receive requests for the viewed geographic area. No imagery or radar history is written into saved forecast snapshots.

## Frames and resource lifecycle

`src/lib/radar.ts` reads the named layer's time Dimension from WMS 1.3.0 GetCapabilities, including comma-separated instants and bounded ISO intervals. It rejects malformed/empty data, deduplicates times, and samples at most 25 real observations from the newest approximately two-hour window. No invented timestamps or extrapolated future radar are used. A stale window remains visible with a delayed label once its newest observation is more than ten minutes old.

`useRadar` refreshes capabilities every two minutes only while Radar is active and online. Requests time out after 12 seconds (including the response body), abort on dependency changes, reject failed responses and honor a shared provider `Retry-After` cooldown across metadata, imagery and prefetch requests, including after map remounts. It retains a previous matching manifest on a refresh failure and exposes the error.

`RadarMap` lazy-loads MapLibre GL JS, its dedicated worker, CSS and the bundled style. MapLibre uses one worker. Each frame is one transparent WMS 1.1.1 GetMap PNG in EPSG:3857 with an explicit TIME and the current viewport bounds, capped at 1024 pixels per dimension and device scale 2. The compressed LRU cache holds at most 25 images / 8 MiB; only the displayed image is decoded, with one next-frame compressed prefetch during playback. The prior image and its timestamp remain until the replacement is decoded. Viewport, layer, place, unmount and lifecycle changes abort obsolete work. Cache and map resources are released on unmount.

Playback begins paused at Latest, advances only after loading, and pauses on map movement, navigation, backgrounding, reduced motion or native power/thermal restrictions. Resume stays paused. Manual slider/keyboard exploration remains available under motion/power restrictions. Times use the selected forecast's timezone; without that forecast they are explicitly labeled UTC. Loading, imagery failure, offline, outside-coverage and delayed observations have distinct messages. Blank imagery never carries a "dry" claim. Rain outlook remains separate future model guidance.

Map pan, pinch, arrow keys, plus/minus keys, zoom buttons and recenter are available. Map rotation is disabled. The map stays within the existing width and native safe areas. The native pull-to-refresh bridge detaches outside Today; the map is marked as an ignored gesture target for web pull-to-refresh.

## Build budgets and regression checks

The core/offline output remains below **3,000,000 bytes**. Optional `radar-map-*`, `radar-vendor-*` and `radar-worker-*` assets have a separate **2,000,000-byte** ceiling and are excluded from the PWA precache. Remote map resources have no service-worker runtime caching rule. Small legends and license notices remain available offline. Native builds bundle the engine locally but initialize it only when Radar opens.

`npm run check:assets` checks both ceilings, verifies that the worker has not been tree-shaken to an empty file, and rejects initial HTML or precache references to optional engine chunks. The explicit worker entry instantiates the upstream worker because MapLibre's package is marked side-effect-free. Keep this guard when upgrading MapLibre. The map adds its overlay before an existing symbol layer and initializes geographic constraints after `style.load`; exact −180/180 constraint endpoints wrap to the same point in MapLibre, so bounds use ±179.999.

Run:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run check:assets
npm run test:e2e
npm run test:native-web
npm run ios:sync
npm run check:native
```

Unit tests cover timestamp parsing/sampling, regions, projection, failed/timeout/rate-limited requests, cache bounds, hook cancellation and polling. Browser tests use the real MapLibre worker with mocked NOAA imagery, assert rendered precipitation pixels, and exercise layers, playback, scrub loading/timestamps, keyboard controls, layout widths 320–1440, location returns, offline/errors/delays, motion restrictions and no radar downloads on Today. Native transport tests add background/resume, low-power mode and detachment of Today’s refresh control. WebKit worker tile requests use a local HTTP fixture server because page routing does not intercept them reliably.

Actual WKWebView checks live in `AppUITests.testRadarLiveMapAndResume` and `testRadarOfflineNavigation`. The live test is opt-in with `TEST_RUNNER_RUN_LIVE_RADAR=true`, uses an isolated simulator and seeded Raleigh preferences, and captures both NOAA layers before/after backgrounding. For this QA build, set `VITE_NATIVE_BRIEFING_URL=https://weather.example/api/weather-briefing` when syncing to avoid unrelated paid briefing requests; do not use that override for distribution. Offline uses the native test harness's offline signal and saved forecast fixture. Simulator validation does not substitute for physical-device or App Store release checks.

Live-provider verification must be separate from deterministic fixtures: inspect real map labels, radar pixels, current provider timestamps, CORS and response statuses for both layers. Provider outages or missing coverage remain possible; this feature makes no availability guarantee. Wind, clouds, temperature, lightning, alerts and future radar animation are outside this version.

## Local verification — September 11, 2026

- TypeScript, ESLint and production web/native builds passed. Unit suites: 273 client and 99 server checks passed; four opt-in live briefing cases were skipped. The Node ESM function smoke check also passed.
- Full Chromium/WebKit suite: 165 passed, nine existing platform-specific cases skipped. Native bridge browser suite: 44 passed. The eight focused radar browser cases passed again after adjusting map height for device safe areas.
- Live Chromium and WebKit sessions loaded OpenFreeMap tiles/glyphs and both NOAA products successfully, with no page errors, map warnings or failed provider responses. Screenshots showed real North Carolina geography, town labels and precipitation. Observations around 18:50–18:52 UTC were current when checked.
- Xcode 26.6 built and ran the actual Capacitor WKWebView on an isolated iPhone 17 Pro simulator with iOS 26.5. Both radar UI tests passed, covering live imagery, playback, type switching, safe-area hit targets, background/resume and offline navigation back to the saved forecast. The offline test also passed after adding navigation to the bundled credits page and back. This is simulator evidence, not physical-device testing.
- Core/offline output is approximately 2.45 MB of the 3 MB budget; optional radar assets are approximately 1.64 MB of the 2 MB budget. Radar engine assets are absent from initial HTML and PWA precache.

No deployment, App Store distribution, production configuration change, credential setup or saved-data migration was performed.

### Independent review loop

Three agents reviewed data/request handling, UI/native lifecycle, and build/test/attribution coverage. Four confirmed issues were fixed: keyboard rotation/pitch remained enabled; imagery did not enforce rate-limit cooldowns; a failed lazy map download left playback enabled and loading forever; and graphics-context loss left invalid controls and could expose a raw renderer exception. All three reviewers re-reviewed the fixes and reported no additional actionable findings.

Regression coverage now includes a suppressed prefetch rate-limit error followed by cache remount and metadata retry, Shift+arrow orientation, failed module download with full-reload recovery, and actual WebGL context loss while paused and playing, followed by scrubbing and map restart. Radar fixture tests block service workers to prevent a reload from bypassing mocked NOAA responses; production PWA behavior remains covered separately. Keyboard assertions wait for the preceding pan to finish and compare geographic bounds rather than assuming every identical viewport has an identical request count.

Recovery testing exposed a further WebKit issue: failed `modulepreload` responses remain cached across page reloads. The UI reviewer reproduced it with a real local HTTP 503 response and no browser request interception. Vite now excludes optional radar JavaScript from module preloading, using normal dynamic imports while retaining CSS dependencies. The reviewer then verified a second successful module download and live NOAA rendering after Reload app. This change preserves lazy loading and both asset budgets.

Post-review validation: 274 client and 99 server unit checks, all 12 focused Chromium/WebKit radar checks, and 44 native-bridge browser checks passed. TypeScript, lint, web/native builds, Xcode simulator build and both bundle budgets passed. The updated app was installed and relaunched in the iPhone simulator, and live radar rendering was visually verified again.

### Main integration verification

The radar feature was integrated with the existing forecast time-travel controls and layered iOS sun icon. Conflicts in App, Today and shared styles were resolved to retain both features. A browser regression now opens Radar from the rain outlook during a future forecast preview and verifies that returning to Today restores current conditions. Combined validation passed: 291 client and 99 server unit checks, 17 Chromium/WebKit radar and forecast-preview checks (one touch-only case skipped in Chromium), six native-bridge radar and forecast-preview checks, lint, web/native builds, native bundle checks and the Xcode simulator build. Core output is 2400.6 KiB and optional radar output is 1600.8 KiB, both within their respective ceilings.
