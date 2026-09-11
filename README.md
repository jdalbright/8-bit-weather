# 8-Bit Weather

A little pixel world, with your real weather. A shared React app with animated landscapes, original weather-reactive chiptunes, saved places, offline PWA support, and a Capacitor iOS app with small and medium WidgetKit widgets.

**[Open 8-Bit Weather](https://8-bit-weather.vercel.app/)**

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. It starts on `http://127.0.0.1:5173` and chooses the next available port if that port is occupied. The forecast works without an API key or backend. AI briefings additionally need the server setup below.

The first screen asks you to use your location or search for a city. Selecting a city also saves it on this device. GPS weather is labeled **Current location**; use the location button again when you want a fresh position. The app does not continuously track your location.

## Build and install

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Service-worker caching and update prompts run in the production build, not the development server. Serve `dist/` at the root of an HTTPS site; the optional AI briefing uses a Vercel Function outside this static directory.

### Native iOS app and widgets

The iOS app bundles the same screens and artwork in `dist-native/`; web and iOS have separate releases. Native location uses iOS permissions, preferences and cached weather use local Capacitor Preferences, and the widget shares the selected place and cached forecast through an App Group. The native package does not register the web service worker or show browser installation prompts.

```sh
npm ci
npm run ios:sync
npm run check:native
npm run ios:open
```

Select the **App** scheme and an iPhone simulator in Xcode, then Run. See [native build/install instructions](docs/ios-native.md), the [dependency graph and verification checklist](docs/ios/IMPLEMENTATION.md), and [widget behavior](docs/ios-widget.md). Native iOS targets require iOS 17 or newer. Device installation requires your signing team and App Group provisioning.

Native briefings use Apple Intelligence on eligible iOS 27+ devices, with automatic OpenAI fallback on older iOS versions or when Apple is unavailable or generation fails. The iOS 26 model is intentionally disabled; the app still supports iOS 17. Apple generation can work offline with fresh cached weather. OpenAI fallback connects to the compatible production backend through `VITE_NATIVE_BRIEFING_URL` in `.env.native`; see [native briefing configuration and verification](docs/ios-briefing.md). No provider secret belongs in the app bundle.

## GitHub and Vercel hosting

The source repository is [jdalbright/8-bit-weather](https://github.com/jdalbright/8-bit-weather). Vercel builds the linked GitHub repository with `npm run build` and serves `dist/`. Pushes to `main` deploy to production; other branches receive preview deployments. Weather remains keyless; the optional briefing requires server-only OpenAI configuration. `vercel.json` keeps the service worker fresh so installed apps can discover updates.

## Install on your device

- **Android / Chromium:** Use the app's Settings → Install app when the browser provides an install prompt, or the browser's install menu.
- **iPhone / iPad:** In Safari, use Share → Add to Home Screen.
- **Safari on Mac:** File → Add to Dock.
- An HTTP LAN address is not enough for phone installation or geolocation. Localhost works on the same computer; phones need HTTPS.

After one successful online visit, the application shell, fonts, icons, and all landscape variants are cached. The last fetched forecasts can be read offline. Cached information shows its age; expired forecast rows are removed. When a new app version is available, an Update app notice allows a controlled reload while keeping saved preferences and places.

## Weather and privacy

Forecasts and city search come directly from [Open-Meteo](https://open-meteo.com/). Its public hosted API requires no key for **noncommercial** apps and has usage limits. Keep this app free of advertising and subscriptions under the current provider arrangement. See [the terms](https://open-meteo.com/en/terms).

Current conditions, hourly data, and daily forecasts are model-derived weather data. WMO weather codes are translated to readable labels, timestamps are displayed in the selected location's time zone, and Celsius/km/h values are converted locally for Fahrenheit/mph. Weather data is [CC BY 4.0](https://open-meteo.com/en/licence); location names originate from [GeoNames](https://www.geonames.org/).

Preferences, saved places, the selected location, and up to 12 recent forecast snapshots are stored locally in this browser on web, or in native Preferences on iOS. The iOS widget stores the selected place and a forecast projection in the app’s local App Group, and can refresh that place directly from Open-Meteo while the app is closed. Coordinates (rounded to three decimal places for GPS selections) are sent to Open-Meteo to request weather; search terms are sent to its geocoding service. Open-Meteo's own [privacy policy](https://open-meteo.com/en/terms#privacy) applies to those requests. Native briefings use Apple Intelligence on-device when available. When cloud briefings are enabled, the website and native fallback send a limited hourly forecast, timezone, and chosen temperature units through this app’s server to OpenAI. Native fallback runs automatically when Apple Intelligence is unavailable or fails and the app is online. Coordinates and place names are excluded from those requests. Responses use `store: false`; this does not disable OpenAI’s separate abuse-monitoring retention. The app has no accounts, analytics, or ads. Settings → Clear saved data removes stored choices, forecasts, and briefings, including in-memory copies.

Forecasts refresh every 15 minutes while the app is visible, when returning to stale data, or through Refresh. Searches are debounced, superseded requests are canceled, and provider rate-limit cooldowns are respected. A GPS cache is never reused at changed coordinates. If browser storage fails, the latest forecast for the current place stays available in memory through refresh failures and offline resume during that visit.

Hourly precipitation probabilities describe the hour ending at the provider timestamp, so the current tile and hourly rail pair each displayed hour with the following timestamp’s probability. Daily dates use the provider’s fixed `utc_offset_seconds`; weekday labels come from those calendar dates. UV curve completeness is checked against actual local-day boundaries independently of the daily timestamps.

### AI weather briefings

The Weather briefing card summarizes the next 24 elapsed hours in 2–3 warm, practical sentences. The server rejects output outside that sentence range or above 75 words. It loads independently above the hourly forecast. The default model is `gpt-5.6-luna`, with reasoning disabled, a 250-token output cap, a 12-second SDK timeout, and no automatic SDK retries. Model input comes from the displayed forecast, with temperatures converted and precipitation intervals aligned in code. Unsupported weather codes count as missing data when checking coverage. No weather search or tools are enabled in OpenAI.

Successful briefings are cached on this device for 15 minutes, up to 12 entries. Location, forecast identity, units, current hourly window, and prompt version determine reuse. Navigation and StrictMode share in-flight requests. Changing locations cancels an obsolete request; responses are never reused across GPS coordinates. Offline, a matching saved briefing keeps its timestamp until its original 24-hour window ends; native Apple Intelligence can also generate from fresh, complete cached weather. Missing or stale weather prevents generation. API failures do not interrupt weather, and retries respect a cooldown. The first voice is an internal `warm-practical` preset; personality selection is reserved for a later release.

#### Local and preview configuration

The endpoint is `POST /api/weather-briefing`, implemented as a Vercel Node function. It accepts only a validated, bounded forecast and returns plain summary text with generation time, forecast window, expiry, and prompt version. Unknown request properties are discarded. It does not accept a custom prompt or client-selected model. The SDK and key are server-only and must never be imported into client modules.

The handler rejects noncanonical route aliases so they cannot bypass the firewall's exact path match. Vercel redirects duplicate-slash paths to the canonical path before routing (local `vercel dev` normalizes them internally). Provider cooldowns are preserved from `Retry-After` or `retry-after-ms`; missing or invalid values use 60 seconds. Each Retry click permits one attempt; later navigation or visibility changes do not reuse that click.

Use the existing environment key or the secure OpenAI Platform setup flow for credentials. `.env.example` documents the server-only variables: `OPENAI_API_KEY`, `OPENAI_WEATHER_MODEL` (defaults to `gpt-5.6-luna`), and `WEATHER_BRIEFING_ENABLED` (defaults to disabled). Never use `VITE_` for these variables, commit a key, or put one in browser storage. No credentials are needed for the normal mocked tests.

`npm run dev:full` uses `vercel dev` to run Vite and the function together against the linked project’s Development configuration. Set `WEATHER_BRIEFING_ENABLED=true` in that local environment for live testing. `npm run dev` and `npm run preview` still serve the core forecast without a function; the briefing displays its unavailable state. API paths are excluded from the service-worker navigation fallback.

`npm run test:briefing:live` is an explicit paid API smoke test using the environment key. It makes three calls with synthetic dry/rain/snow forecasts and prints only generated sample text and token/latency metadata. Normal `npm test` skips these calls. Review sample accuracy and tone before release. Metadata logging contains model, duration, token counts or a generic failure category; it never logs credentials, request bodies, coordinates, or raw provider errors.

#### Public activation

The **Weather briefing rate limit** firewall rule was published on 2026-09-09 for the linked `8-bit-weather` Vercel project (rule ID `rule_weather_briefing_rate_limit_2d1Sci`). It matches **POST `/api/weather-briefing`** and allows **10 requests per IP in a fixed 60-second window**, then returns **HTTP 429** before the function runs. It applies to matching requests on Vercel deployments; `vercel dev` on localhost is outside the platform firewall. Vercel counts per region, so this is not a global or account spending cap. No database is required.

The reproducible policy is [config/firewall/weather-briefing.json](config/firewall/weather-briefing.json). This file documents the remote rule; application deployments do not automatically apply it. Inspect live settings with `vercel firewall rules inspect "Weather briefing rate limit" --json --scope jdalbrights-projects` and check for unrelated drafts with `vercel firewall diff --json --scope jdalbrights-projects` before any later firewall changes. Preserve other rules when updating this one.

Live verification sent 12 invalid POST bodies, avoiding OpenAI generation: the first 10 reached the current deployment (404 because the briefing function has not been deployed), and requests 11–12 received 429. The homepage still returned 200, and GET requests to the endpoint were not rate-limited. The observed firewall response has no `Retry-After` header; the app already applies a 60-second cooldown in that case, including when the response body is HTML.

The firewall is active independently of the AI feature release. Configure the server key and optional model separately for Preview and Production, verify the preview, then deploy with `WEATHER_BRIEFING_ENABLED=true` to activate briefings. Roll back AI independently by setting `WEATHER_BRIEFING_ENABLED=false` and redeploying. Without activation or a key, the function returns a generic 503 and makes no OpenAI request. Publishing the firewall rule did not deploy the app or change its production environment variables.

See [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), and [Vercel rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

### Pull to refresh

On a touchscreen, scroll to the top of Today and pull down on the forecast. A violet pixel strip shows **Pull to refresh**, then **Release to refresh** once the pull is long enough. Releasing fetches fresh weather for the selected place and shows **Refreshing…** until the request finishes. A shorter pull or sliding back up cancels it.

This uses the same refresh action and rate-limit handling as the footer button, without reloading the app or resetting sound and preferences. It is inactive while offline, while a request is running, or before choosing a place. Horizontal forecast scrolling, controls, multi-touch, and zoomed-page panning are left alone. Native browser pull-to-refresh is suppressed on the selected Today view on touch devices to avoid a duplicate page reload; other tabs retain their usual scrolling. The existing Refresh button remains available for keyboard and assistive-technology users. Reduced motion removes the spinner animation and settling transition.

### Rain outlook

A compact pixel timeline appears below the current conditions only when rain or showers are forecast within the next two hours. Tap or slide the timeline (or use the arrow keys) for the time window and expected amount in inches or millimeters. Dry weather adds no extra card. Snow alone does not trigger it.

The outlook uses Open-Meteo's 15-minute rain plus shower amounts, with a 0.1 mm per-interval threshold to suppress trace amounts. Each timestamp marks the end of the preceding 15 minutes, including partially overlapping intervals at the edges of the two-hour window. The card is hidden offline, for stale forecasts, and when any interval is missing. Older saved forecasts still work without the new data. Timing is approximate model guidance, not radar nowcasting; outside regions with native 15-minute data, the provider interpolates hourly data. See the [provider's interval definitions](https://open-meteo.com/en/docs#minutely_15-variable-definition).

### Radar

The Radar tab and rain outlook's **Open radar** shortcut open a themed precipitation map in both the website/PWA and iOS app. Keyless NOAA imagery covers available U.S. regional radar networks over an OpenFreeMap basemap. Choose radar intensity or precipitation type, play or scrub approximately two hours of observations, and recenter on the selected place. Forecasts remain separate from these recent observations. Playback respects reduced motion, power settings and backgrounding; offline, unavailable, delayed and outside-coverage states are explicit. See [radar sources, architecture and validation](docs/radar.md).

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

The stream has flowing currents, layered reflections, and small eddies around its rocks. Highlights follow the bends downstream, and tapped ripples drift with the current. Raleigh retains its skyline and oaks within 25 km of downtown. Elsewhere in North Carolina, coordinates automatically select Beach (within 20 km of the oceanfront), Coastal Plain, Piedmont, or Blue Ridge. Beach has rolling surf, sea oats, and gulls; Coastal Plain has reeds and slower water; the wooded scenes have fitted creek effects. The original meadow remains the first-use and outside-NC scene. All six scenes include day, overcast, and night artwork, work offline, and respect the existing motion controls. Geographic matching uses bundled state data with no extra API calls or keys. See [regional artwork and prompts](docs/design/nc-regions-v1/README.md) and [map sources and approximations](src/data/README.md).

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

Unit regressions cover provider-shaped spring/autumn DST data, precipitation interval alignment, storage write failures, delayed audio start/mute and visibility races, navigation focus, and accessible hourly conditions.

Tests cover units, WMO codes, missing measurements, time zones/DST, stale caches, request races, API failures, permission denial/timeouts, search and saved places, audio activation/background suspension, all scene families, small screens, and production offline caching. Chromium and iPhone-sized WebKit tests are browser verification, not proof of physical-device installation, hardware silent-switch behavior, or lock-screen playback.

The Living Meadow tests also cover all 32 weather/lighting combinations, shared layer alignment, 44-pixel scenery controls, keyboard interaction, and offscreen/reduced-motion behavior. The audio suite renders two complete A/B cycles of all six production soundtracks with an offline audio clock, checks sample peaks and loop boundaries, and exercises real-time crossfades, phrase continuity, and independent channel muting in both browsers. Sample analysis does not replace listening on phone speakers or headphones; physical-device listening and installation remain separate checks.

GitHub Actions runs type checking, lint, unit tests, production build, the asset budget, and Chromium/WebKit tests on pull requests and pushes to `main` or `codex/**`. The asset check limits core/offline output to 3 MB, with a separate 2 MB ceiling for the optional radar engine, style and worker. Optional radar assets are lazy-loaded and excluded from the PWA precache. Validate the branch's Vercel preview before moving a release to `main`.

## Project structure

- `src/components`: Today, Places, Settings, pixel icons, and scene rendering.
- `src/hooks`: weather requests, audio lifetime, motion, and installation.
- `src/lib`: provider adapters, formatting, and versioned browser storage.
- `src/audio`: original musical compositions and Web Audio engine.
- `public/art`: optimized generated landscape variants, with UI text kept in HTML.
- `docs/design`: approved visual reference and asset notes.

Pixelify Sans and IBM Plex Mono are bundled locally under the SIL Open Font License. Their license files are included in `docs/licenses/`.

The pixel font stack includes **Weather Five**, a modified Pixelify Sans subset containing only the numeral 5 at weights 400 and 600. Its flat top and straight upper-left stem improve readability while preserving the original character width and vertical metrics. All other characters retain their existing fonts. These OFL-licensed overlays live in `src/fonts/`; regenerate them after `npm ci` with `python scripts/build-weather-five.py` (requires the Python `fontTools` package). The script retains the upstream copyright and license metadata and gives the modified fonts their own family name.
