# Current precipitation correction — September 13, 2026

The local fix reproduces and corrects the original central-Raleigh contradiction using archived NOAA precipitation classifications. The live NOAA lookup was also exercised successfully at Boston. These are local verification results; the production application has not been deployed with this change, and no new native build has been installed.

## Original incident, exact coordinate and time

The captured production response at **35.7796, -78.6382**, **September 12, 17:22 UTC / 1:22 PM EDT**, reported Overcast, 0% precipitation probability, and zero precipitation rate. Its temperature was 26.12°C. The original response is preserved in [the preceding audit](../weather-live-2026-09-12/app-raleigh-earlier-zero.json).

The [NOAA MRMS archive](https://noaa-mrms-pds.s3.amazonaws.com/CONUS/PrecipFlag_00.00/20260912/MRMS_PrecipFlag_00.00_20260912-172200.grib2.gz) contains the surface precipitation type for exactly 17:22 UTC. All four grid cells surrounding that coordinate have flag **6, convection**, according to [NOAA's flag table](https://www.nssl.noaa.gov/projects/mrms/operational/tables.php). This supplies evidence for rain, not proof of lightning or a numerical probability.

- [Original compressed GRIB2](incident-precip-flag.grib2.gz): SHA-256 `f465281b58d3bf5fe7af69b041ce34ca0ae7390d840168aa60efadaed0b54585`.
- [Decoded coordinates, cell values and classification input](incident-radar.json): ECMWF ecCodes 2.48.0, `codes_new_from_message` on the decompressed bytes, followed by `codes_grib_find_nearest(message, 35.7796, 281.3618, npoints=4)`. GRIB longitude uses 0–360 degrees. Grid date/time, not download time, identifies the observation.
- [Actual local reconciliation result](live-rain/report.json): replay at the original response's `updatedAt` yields **Rain on radar**, code 63, no invented probability or rate, and the unchanged temperature and original provider timestamp.

The archived numeric flag is translated into the correction input. It is not represented as an archived WMS response: the live WMS keeps a shorter history. The preceding audit also contains time-matched reflectivity imagery.

## Fresh external comparisons

The explicit live audit fetches the public production current endpoint at exact coordinates, NOAA METAR observations, and the actual new NOAA lookup. It then runs the production-input response through the local correction function. No Xweather credentials, paid service, or deployment are needed for this check.

| Location | App observation UTC | App current condition | Independent evidence | Local result |
| --- | --- | --- | --- | --- |
| Boston Logan, 42.3606, -71.0097 | Sep 13 17:29 | Rain, 19°C, 100% | METAR 17:18 rain/mist, 18.9°C; NOAA 17:28 warm stratiform rain at the exact coordinate | Preserves explicit Rain and its provider probability |
| New York JFK, 40.6392, -73.7639 | Sep 13 17:30 | Light rain, 23.31°C, 100% | METAR 17:14 light rain, 22.8°C; NOAA 17:28 transparent pixel | Preserves explicit Light rain; blank radar does not erase it |
| Eugene, 44.1331, -123.2156 | Sep 13 17:29 | Overcast, 15.14°C, 0% | METAR 17:21 light rain/mist, 15°C; NOAA 17:28 transparent pixel | Unchanged; this discrepancy is unresolved by radar and the observations are eight minutes apart |

The raw station reports and complete request URLs, response status, timestamps, capabilities, and point responses are in [live-rain](live-rain/). Boston's exact returned RGBA was 4,80,164,255, the product's warm-stratiform-rain category. This validates the real lookup/parser path, not just a synthetic response. An earlier [four-location check](live/report.json) at 17:25 had no usable positive radar evidence. Its METARs were 31–34 minutes older, and Raleigh's airport observation was not at the city coordinate, so it does not establish exact current agreement.

This is a bounded validation, not a claim that all weather fields or locations are always correct. The original incident's raw upstream Xweather coded response was not available, so its precise upstream failure cannot be proved from the normalized response. NOAA surface precipitation type is a radar/model estimate, with coverage and detection limits; see [the official product description](https://vlab.noaa.gov/web/wdtd/-/surface-precipitation-type-spt-?selectedFolder=9234881).

## Behavior and regression checks

- Explicit unqualified provider rain survives a separate zero-rate estimate.
- Positive fresh NOAA precipitation can correct otherwise dry/unknown current conditions, with visible attribution and its own source time.
- The current precipitation metric and fresh Now tile show the reported type. Future hourly percentages retain their forecast meaning.
- Unknown/stale/future radar, coverage gaps, and failures cannot create a positive correction or erase explicit precipitation.
- Corrections expire after eight minutes in the app and widget. Current responses recheck after two minutes; the original Xweather estimate has a separate ten-minute warm-instance cache.
- Client and server suites passed: 503 client tests, 208 server tests; four opt-in unrelated live briefing tests skipped. Native Node ESM smoke passed.
- 22 Chromium/WebKit current-weather browser cases and two native-web correction/bridge cases passed. The [browser screenshot](radar-correction-webkit.png) uses a deterministic fixture, not live weather, and was visually inspected.
- 79 Swift widget checks, web production build, TypeScript, ESLint, and diff whitespace checks passed. These checks do not replace signed-device or production deployment verification.

## Release candidate

An isolated candidate at `/tmp/8bit-weather-rain-release-20260913` applies these weather changes to checkout base `9664ea7`, excluding the concurrent Best Time Outside and 48-hour navigation edits. Its `weather-release-manifest.json` records changed source hashes. No commit, push, deployment, or device installation was performed.

At 17:36 UTC, Vercel's read-only deployment lookup confirmed that `8-bit-weather.vercel.app` still targets ready production deployment `dpl_HQgJuXDqcM5D2yLmUaK5eiHXgVrN`, whose Git commit is exactly `9664ea75ec8a803e459fe6b59835e009c8ca5637`. The isolated candidate therefore uses the actual current production base. Publishing remains pending user approval. A [NOAA follow-up](eugene-followup.json) at the same time still contained no Eugene report newer than 17:21 UTC; it cannot resolve the 17:29 discrepancy.

The isolated candidate separately passed its production build, lint, **434 client tests, 187 server tests** (four optional live tests skipped), the Node ESM smoke check, and all **22 Chromium/WebKit weather cases**. Its smaller test count reflects the excluded in-progress features. The temporary folder initially selected system Node 26, whose experimental storage broke the test harness; rerunning with the project's Node 22 runtime and `NODE_OPTIONS=--no-experimental-webstorage` passed. No application assertions were weakened.

Repeat the public live check with `node scripts/check-current-weather-live.mjs <new-output-directory>`. Its optional third argument is a JSON file of up to six `[name, latitude, longitude]` tuples. Use station IDs as names for matching METARs; `Raleigh` uses KRDU as a nearby reference only. Every run preserves its retrieval and source times; it does not compare new conditions against old observations as though they were simultaneous.
