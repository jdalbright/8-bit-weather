# 8-Bit Weather

A little pixel world, with your real weather. A mobile-first React app with animated landscapes, original weather-reactive chiptunes, saved places, and offline PWA support.

**[Open 8-Bit Weather](https://8-bit-weather.vercel.app/)**

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. It starts on `http://127.0.0.1:5173` and chooses the next available port if that port is occupied. No `.env` file, API key, account, or backend is needed.

The first screen asks you to use your location or search for a city. Selecting a city also saves it on this device. GPS weather is labeled **Current location**; use the location button again when you want a fresh position. The app does not continuously track your location.

## Build and install

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Service-worker caching and update prompts run in the production build, not the development server. Serve `dist/` at the root of an HTTPS site; no server functions are required.

## GitHub and Vercel hosting

The source repository is [jdalbright/8-bit-weather](https://github.com/jdalbright/8-bit-weather). Vercel builds the linked GitHub repository with `npm run build` and serves `dist/`. Pushes to `main` deploy to production; other branches receive preview deployments. No environment variables or paid services are required. `vercel.json` keeps the service worker fresh so installed apps can discover updates.

## Install on your device

- **Android / Chromium:** Use the app's Settings → Install app when the browser provides an install prompt, or the browser's install menu.
- **iPhone / iPad:** In Safari, use Share → Add to Home Screen.
- **Safari on Mac:** File → Add to Dock.
- An HTTP LAN address is not enough for phone installation or geolocation. Localhost works on the same computer; phones need HTTPS.

After one successful online visit, the application shell, fonts, icons, and all landscape variants are cached. The last fetched forecasts can be read offline. Cached information shows its age; expired forecast rows are removed. When a new app version is available, an Update app notice allows a controlled reload while keeping saved preferences and places.

## Weather and privacy

Forecasts and city search come directly from [Open-Meteo](https://open-meteo.com/). Its public hosted API requires no key for **noncommercial** apps and has usage limits. Keep this app free of advertising and subscriptions under the current provider arrangement. See [the terms](https://open-meteo.com/en/terms).

Current conditions, hourly data, and daily forecasts are model-derived weather data. WMO weather codes are translated to readable labels, timestamps are displayed in the selected location's time zone, and Celsius/km/h values are converted locally for Fahrenheit/mph. Weather data is [CC BY 4.0](https://open-meteo.com/en/licence); location names originate from [GeoNames](https://www.geonames.org/).

Preferences, saved places, the selected location, and up to 12 recent forecast snapshots are stored only in this browser. Coordinates (rounded to three decimal places for GPS selections) are sent to Open-Meteo to request weather; search terms are sent to its geocoding service. Open-Meteo's own [privacy policy](https://open-meteo.com/en/terms#privacy) applies to those requests. The app has no accounts, analytics, ads, or runtime AI calls. Settings → Clear saved data removes the app's stored choices and forecasts.

Forecasts refresh every 15 minutes while the app is visible, when returning to stale data, or through Refresh. Searches are debounced, superseded requests are canceled, and provider rate-limit cooldowns are respected. A GPS cache is never reused at changed coordinates.

### Pull to refresh

On a touchscreen, scroll to the top of Today and pull down on the forecast. A violet pixel strip shows **Pull to refresh**, then **Release to refresh** once the pull is long enough. Releasing fetches fresh weather for the selected place and shows **Refreshing…** until the request finishes. A shorter pull or sliding back up cancels it.

This uses the same refresh action and rate-limit handling as the footer button, without reloading the app or resetting sound and preferences. It is inactive while offline, while a request is running, or before choosing a place. Horizontal forecast scrolling, controls, multi-touch, and zoomed-page panning are left alone. Native browser pull-to-refresh is suppressed on the selected Today view on touch devices to avoid a duplicate page reload; other tabs retain their usual scrolling. The existing Refresh button remains available for keyboard and assistive-technology users. Reduced motion removes the spinner animation and settling transition.

### Rain outlook

A compact pixel timeline appears below the current conditions only when rain or showers are forecast within the next two hours. Tap or slide the timeline (or use the arrow keys) for the time window and expected amount in inches or millimeters. Dry weather adds no extra card. Snow alone does not trigger it.

The outlook uses Open-Meteo's 15-minute rain plus shower amounts, with a 0.1 mm per-interval threshold to suppress trace amounts. Each timestamp marks the end of the preceding 15 minutes, including partially overlapping intervals at the edges of the two-hour window. The card is hidden offline, for stale forecasts, and when any interval is missing. Older saved forecasts still work without the new data. Timing is approximate model guidance, not radar nowcasting; outside regions with native 15-minute data, the provider interpolates hourly data. See the [provider's interval definitions](https://open-meteo.com/en/docs#minutely_15-variable-definition).

### UV index

The current conditions use a two-by-two grid for precipitation chance, wind, humidity, and UV. The UV tile stays visible at low levels and at night. Tap it to expand the colored pixel scale, sun-protection guidance, today's hourly UV timeline, and the daily peak. The timeline supports touch and arrow keys. Categories follow the [National Weather Service UV scale](https://www.weather.gov/ilx/uv-index); the displayed index is rounded to a whole number and its category matches that number. Levels above 11 remain visible as Extreme.

Open-Meteo supplies current `uv_index`, hourly `uv_index`, and daily `uv_index_max` in the existing forecast request. A 24-hour lookback retains the earlier part of today, so opening the app after midday still shows the full day's peak. Peak timing and the time UV becomes low for the rest of today require a complete local-day curve, including 23- and 25-hour daylight-saving days. If daily and hourly peak levels disagree, only the daily peak value is shown. These are forecast estimates, not a personal UV measurement or a time-to-sunburn prediction.

Current UV uses a recent current sample, falling back to the current hour while the forecast is fresh. Unknown UV is shown as unavailable, never zero. Old caches without UV still load. Offline or stale UV is labeled as saved; current UV, current protection advice, and forward-looking low-UV timing are withheld until a fresh forecast is available.

## Sound and motion

Sound starts off on each page load. Tap Sound to activate Web Audio. Music, weather ambience, and interface sounds have independent switches and volume sliders. Six original compositions respond to sunshine, clouds, rain, snow, storms, and nighttime. No music files or audio services are downloaded.

The sound engine uses scheduled oscillators, generated noise, gain envelopes, crossfades, and a compressor. Each theme has original A/B sections that alternate without restarting on a normal weather refresh. Dawn and dusk use a softer, sparser arrangement. It pauses when the document is hidden. Animations pause offscreen or in the background; both the device's reduced-motion preference and the app's motion setting are respected. Storm lighting uses a slow, subtle glimmer instead of rapid flashes.

### Living Meadow — version 1.1

The same mountain meadow now blends daylight and night artwork through warm dawn and violet dusk. Each twilight window spans 30 minutes before and after the selected location's sunrise or sunset. Missing or unsuitable solar times fall back to the provider's day/night flag; stale or offline weather retains the lighting of its saved observation. Lighting, wildlife, and precipitation effects are atmospheric illustrations, not extra weather measurements.

Clouds, grass, and the station rotor respond to wind speed. Rain adds creek ripples; snow drifts; fog rolls low across the valley. Occasional birds and nighttime fireflies disappear during storms and snowfall. Tap the river for a ripple or the station for its indicator light; these accessible controls keep sound off until you enable it, then follow the interface sounds channel. Reduced motion uses brief static feedback.

The stream has flowing currents, layered reflections, and small eddies around its rocks. Highlights follow the bends downstream, and tapped ripples drift with the current. The same animation runs in the original meadow and the Raleigh scene, whose skyline and oak trees appear for selected locations within 25 km of central Raleigh. Both scene sets include day, overcast, and night artwork, work offline, and respect the existing motion controls.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium webkit
npm run build
npm run check:assets
npm run test:e2e
```

The browser tests start a production preview server on port 4177. They use explicitly mocked weather and coordinates for reproducibility; the normal app has no sample weather. Test artifacts are written under `/tmp/8bit-weather-*`, outside the project. The app has also been exercised against the live Open-Meteo APIs through the in-app browser.

Tests cover units, WMO codes, missing measurements, time zones/DST, stale caches, request races, API failures, permission denial/timeouts, search and saved places, audio activation/background suspension, all scene families, small screens, and production offline caching. Chromium and iPhone-sized WebKit tests are browser verification, not proof of physical-device installation, hardware silent-switch behavior, or lock-screen playback.

The Living Meadow tests also cover all 32 weather/lighting combinations, shared layer alignment, 44-pixel scenery controls, keyboard interaction, and offscreen/reduced-motion behavior. The audio suite renders two complete A/B cycles of all six production soundtracks with an offline audio clock, checks sample peaks and loop boundaries, and exercises real-time crossfades, phrase continuity, and independent channel muting in both browsers. Sample analysis does not replace listening on phone speakers or headphones; physical-device listening and installation remain separate checks.

GitHub Actions runs type checking, lint, unit tests, production build, the asset budget, and Chromium/WebKit tests on pull requests and pushes to `main` or `codex/**`. The asset check limits the entire build output (a stricter check than just the precache) to 1.5 MB. Validate the branch's Vercel preview before moving a release to `main`.

## Project structure

- `src/components`: Today, Places, Settings, pixel icons, and scene rendering.
- `src/hooks`: weather requests, audio lifetime, motion, and installation.
- `src/lib`: provider adapters, formatting, and versioned browser storage.
- `src/audio`: original musical compositions and Web Audio engine.
- `public/art`: optimized generated landscape variants, with UI text kept in HTML.
- `docs/design`: approved visual reference and asset notes.

Pixelify Sans and IBM Plex Mono are bundled locally under the SIL Open Font License. Their license files are included in `docs/licenses/`.

The pixel font stack includes **Weather Five**, a modified Pixelify Sans subset containing only the numeral 5 at weights 400 and 600. Its flat top and straight upper-left stem improve readability while preserving the original character width and vertical metrics. All other characters retain their existing fonts. These OFL-licensed overlays live in `src/fonts/`; regenerate them after `npm ci` with `python scripts/build-weather-five.py` (requires the Python `fontTools` package). The script retains the upstream copyright and license metadata and gives the modified fonts their own family name.
