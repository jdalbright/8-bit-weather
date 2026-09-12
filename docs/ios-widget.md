# Native weather widget

The iOS app embeds a WidgetKit extension supporting small and medium Home Screen widgets plus circular, rectangular, and inline Lock Screen widgets on iOS 17+. See [Lock Screen layouts and verification](ios-experience.md). Both sizes display the app's selected place, temperature, conditions, daily high/low, preferred units, and the same authored regional scenery. Six landscapes each have day, overcast, and night artwork. Static artwork is appropriate for WidgetKit's scheduled rendering model; app animations remain in the shared React screens.

## Data contract and ownership

The `WeatherWidget` Capacitor plugin exposes `update({ payload: JSON.stringify(value) })` and `clear()`. `value` is the shared React data contract:

```ts
{
  version: 1,
  place: Place | null,
  units: 'metric' | 'imperial',
  weather: WeatherSnapshot | null,
  landscape: 'meadow' | 'raleigh' | 'beach' | 'coastal-plain' | 'piedmont' | 'blue-ridge',
  updatedAt: number // Unix milliseconds
}
```

All weather temperatures are canonical Celsius. Swift converts only for display and matches JavaScript rounding. `WidgetWeather.swift` decodes a narrow projection of the shared app snapshot, ignoring unrelated fields. The app owns selection and preferences; the widget never chooses a different place or requests GPS permissions.

Both targets use App Group **group.app.eightbitweather.shared**. `WidgetWeatherStore` writes an atomic `weather-widget-v1.json` selection and app-weather file. Widget refreshes write a separate `weather-widget-refresh-v1.json`. Reading merges a refreshed forecast only when place ID and coordinates match and its fetch time is at least as recent. Refreshes cannot overwrite preferences. Shared advisory file locking coordinates selection writes, refresh checks/writes, and clear across processes, preventing an in-flight refresh from recreating cleared place data. Files use complete-until-first-user-authentication protection on iOS. There is no remote account or cross-device sync.

A place with no weather renders its name and a refresh message. Invalid payload schemas do not replace valid storage; mismatched weather is discarded. Missing temperatures render an em dash. Corrupt numeric values are validated before display.

## Refresh and stale/offline behavior

`WeatherProvider` requests a new timeline no earlier than 30 minutes later. When cached Xweather data is older than ten minutes (or absent/legacy), it requests normalized current conditions and daily forecasts through the Xweather backend, with a 12-second timeout per request. Provider credentials remain server-only. See [Xweather configuration](xweather.md). The app reloads this widget kind after publishing new data or changing selection/preferences.

iOS controls actual refresh timing and applies a system budget; a 30-minute policy is not a guaranteed interval. See Apple's [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) and [TimelineProvider](https://developer.apple.com/documentation/widgetkit/timelineprovider).

The widget retains matching cached weather when a request fails and labels it **Saved**, with a relative timestamp. It also marks observations saved after 45 minutes of cache age or 60 minutes of observation age, matching the app's thresholds. Future-dated observations or a rolled-back clock are treated as stale. A precomputed timeline entry switches to stale without waiting for another network request. Local-midnight entries advance high/low through the cached horizon and one empty day, so expired daily ranges disappear even if future refreshes are delayed. Artwork retains the cached observation's lighting rather than inventing fresh conditions.

## Deep links

Tapping either widget opens `eightbitweather://place?id=<encoded place ID>`. URL components preserve special characters safely. The app handles both cold launch and resumed links and only selects an existing saved/current place; an unknown ID does not import arbitrary coordinates. An unconfigured widget opens the app's place route.

## Reproducible checks

```sh
sh scripts/test-widget.sh
WIDGET_LIVE_TEST=1 sh scripts/test-widget.sh
node scripts/build-widget-assets.mjs
node --experimental-strip-types scripts/make-ios-fixtures.mjs /tmp/eightbit-weather-ios-fixtures
```

The Swift harness compiles the actual shared Swift sources with `xcrun swiftc` into a temporary directory. It checks decoding, units and rounding, regional lighting, deep-link escaping, invalid data, age thresholds, local dates, durable writes, cache merging, place changes during a refresh, clear behavior, and timeline expiration. Optional live mode calls the actual provider. The asset generator converts the repository's existing WebP scenes to eighteen PNG asset sets, preserving authored pixels with nearest-neighbor sampling.

The fixture generator uses the actual JavaScript `normalizeWeather` and existing forecast fixture. It creates clearly labelled synthetic **fresh**, **stale** (90 minutes old), and **missing** states, with Raleigh selected and Asheville also saved. Files are written only to the requested output folder; it never modifies a simulator. Each state includes a widget JSON file and a Preferences JSON/plist containing the native `CapacitorStorage.` keys. Merge those keys into the disposable simulator app's `UserDefaults.standard` domain; do not replace a real user's entire defaults domain. Remove the widget refresh file when switching fixtures, terminate before seeding, and relaunch to hydrate. Reachable weather services replace fixtures normally, so stale/offline UI checks need an isolated offline test environment. Deep links are listed in the generated README.

For Home Screen checks: launch the installed app, choose a place, add **8-Bit Weather** through the Home Screen widget gallery, inspect both sizes, switch places and units in the app, then tap the widget. Repeat with stale/missing fixtures and after app termination. Check VoiceOver reading, larger text, nighttime scenes, and muted/tinted Home Screen appearances on a device. Device installation requires an Apple signing team with App Group capability enabled for both bundle IDs. Actual iOS scheduling, locked-device refresh, and device-only behavior need physical-device observation; compilation and unit tests do not establish those outcomes.

## Recorded evidence

- 2026-09-10: native owner built the app and embedded WidgetKit extension successfully with Xcode; no Swift compilation errors reported.
- 2026-09-10: final Swift suite passed **41 checks**: 40 deterministic checks (including offline URLSession failure, HTTP 429 handling, and timeline expiration) plus an actual live Open-Meteo refresh. The restricted shell could not resolve the provider; rerunning with approved public-network access succeeded.
- 2026-09-10: 18 generated scene images occupy approximately 8.7 MB; generation script passed ESLint. Fixture plist passed `plutil -lint`.
- Home Screen visual verification and actual system scheduling are tracked separately in the main iOS acceptance record; these are not claimed by the above code-level checks.
