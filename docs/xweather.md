# Xweather integration

Weather comes from Vaisala Xweather via `/api/weather`. NOAA remains the radar provider; Open-Meteo/GeoNames remains city search. The OpenAI briefing continues to receive normalized forecast facts.

## Configuration and activation

Set `XWEATHER_CLIENT_ID` and `XWEATHER_CLIENT_SECRET` only in the server environment. Use Xweather's free account **without a payment method or paid overages**. The allowance is shared across all services and locations; caching does not guarantee an unlimited number of users will fit in it. Missing credentials return a recoverable 503 without contacting Xweather.

Set `WEATHER_NATIVE_ORIGINS=capacitor://localhost`. Packaged webviews use the public `VITE_NATIVE_WEATHER_URL`; WidgetKit uses `WeatherBackendURL` in its Info.plist or the matching production endpoint by default. Neither bundle contains credentials. Use `npm run dev:full` for a local backend; plain Vite preview serves only the app shell.

Before approved production activation, configure the environment and apply `config/firewall/weather.json` in Vercel: a shared 10 requests/minute/IP limit for weather GET and briefing POST requests. Hobby allows one rate-limit rule, so replace the existing briefing rule with this combined rule rather than adding a second rule. In-process limits are an additional bounded safeguard, not a distributed rate limiter. No paid infrastructure is added. Deploy the backend before distributing the native build. Verify actual web/native CORS responses, a Raleigh city and GPS forecast, attribution, independent NOAA radar, and the PWA update flow. The previous deployment is the rollback target; saved forecasts retain their source.

## Contract and caching

`GET /api/weather?latitude=<decimal>&longitude=<decimal>&section=current|forecast|rain|history`. History additionally accepts an IANA `timezone`. Coordinates are normalized to four decimal places. Each response carries provider, coordinates, timezone, updatedAt/expiresAt (milliseconds), and the requested normalized section. Measurements use Celsius, km/h, millimeters, and Unix-second forecast timestamps. Responses exclude place names and provider credentials.

Current and rain sections expire after ten minutes; forecast and history after one hour. The forecast section explicitly starts at the current UTC hour and fetches 49 hourly timestamps (including the trailing POP boundary) and seven daily periods separately. The provider default starts next hour and would omit this hour’s precipitation probability. Client section caching, bounded server caching and in-flight deduplication, and Vercel CDN caching reduce repeated accesses. A cold forecast costs more than one provider access. Only app activity or a widget refresh requests weather; there is no scheduled polling. Error responses are not cached as successful data. Provider quota errors respect Retry-After and trigger server backoff; saved snapshots remain visible with their original timestamps.

Xweather hourly POP describes the period beginning at the forecast timestamp. The adapter stores it at the following timestamp to match the app's established end-of-hour contract. Rain samples carry one-minute interval amounts with end timestamps. The card shows the remaining portion of the next-hour prediction until the ten-minute expiry; it does not extrapolate to replace elapsed minutes. Every remaining minute must be present. The detection threshold is 0.4 mm/hour, equivalent to the previous 0.1 mm/15 minutes. Frozen/unknown precipitation is not presented as liquid rain.

Current conditions are estimates. Explicit zero ordinary-rain rates resolve to cloud conditions. Missing rates never mean dry. Chance-only reports without positive local precipitation evidence resolve to the reported cloud conditions; nearby precipitation resolves to local cloud conditions even with a positive rate. Current headline, Now tile, scenery, and widget all use that resolved code, including when a cached label still says thunderstorms. Current labels have no added "possible" suffix, and the timestamp reads "As of". Forecast descriptions retain their qualifiers. The hourly precipitation probability remains a separate forecast and does not override reported active current weather. The server supplies the same resolved code and label to the app and widget. Legacy snapshots remain readable and trigger a fresh provider request on first online use.

## Validation

Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run test:native-web`, `npm run build:native`, `npm run check:native`, and `npm run test:widget`. Server tests mock Xweather and verify credentials stay upstream, condition mapping, interval normalization, cache TTLs, quota backoff, and input/origin validation. Live checks require configured credentials and are separate from these deterministic checks.

Sources: https://www.xweather.com/docs/weather-api/endpoints/conditions, https://www.xweather.com/docs/weather-api/endpoints/forecasts, https://www.xweather.com/pricing/weather-api-pay-as-you-go, https://www.xweather.com/docs/weather-api/resources/attribution

### Local migration verification — 2026-09-11

- Web/native production builds, TypeScript, ESLint, native-bundle checks, native Node ESM smoke, and diff whitespace checks passed.
- 342 client tests and 125 server tests passed; four opt-in live/comparison tests remained skipped.
- 58 Swift widget checks passed.
- Full browser run: 228 passed, 13 intentional skips, one animation sampling failure. Both browser animation cases passed in an isolated single-worker rerun (229 distinct passing cases overall).
- Full native-web run: 58 passed and two animation sampling failures. All four native interaction cases passed in an isolated single-worker rerun (60 distinct passing cases overall). No animation assertions were weakened.
- No Xweather credentials are present in the local environment or local environment files. Live provider/Raleigh checks, deployed cache/firewall behavior, signed native-device installation, and production activation remain unverified. No deployment or paid service activation was performed.


The current precipitation percentage comes from `conditions.periods[].pop`, paired
with the current headline and its timestamp. Future tiles keep their hourly forecast
percentages. A missing current probability displays unavailable, never a substituted
hourly zero. Older saved snapshots remain readable and refresh once online to obtain
the current probability; the same backend cache and quota rules still apply. Existing
snapshots that do not yet contain the field retain their explicitly labelled hourly
percentage until that refresh succeeds. See the [conditions response documentation](https://www.xweather.com/docs/weather-api/endpoints/conditions).

## September 12: forecast refresh review loop

The second review batch covers provider normalization, web/iOS refresh and offline recovery, location changes, backend caching/backoff, and widget handoff. The Apple briefing accuracy batch is recorded separately in `ios-apple-briefing.md`.

Two reproduced races were corrected and independently re-reviewed. Concurrent upstream quota responses must keep the longest active cooldown and return its remaining duration; a later short limit must not reopen access during a longer limit. Widget current conditions and daily forecasts have independent section timestamps. Merging app and widget caches must preserve the newer value for each section, retain the app value on ties, and keep saved location and unit selection intact. Older widget caches without section timestamps use their existing fetch timestamp for both sections.


Validation: 409 client tests and 153 server tests passed (four optional live tests skipped), along with 73 checks against the actual shared Swift widget code, 16 Chromium/WebKit native integration cases, lint, typechecking, web build, and signed iOS app/widget compilation. Three quota race regressions and ten widget checks were added; the original failures were demonstrated before the fixes. Independent provider and React passes found no additional confirmed defects. The reviewers cleared both fixes after challenge. Live provider quotas and physical WidgetKit scheduling were not exercised; this batch did not deploy backend changes or install the new widget build on the phone. Changes remain local and uncommitted.
