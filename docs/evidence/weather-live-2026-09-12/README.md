# Live weather accuracy check — September 12, 2026

## Finding

The earlier dry Raleigh response conflicts with independent NOAA radar at the same coordinate and nearly identical time. Later live conditions agree with several NOAA airport observations. This does **not** establish that the original accuracy problem is fixed by the pending local display/normalization changes.

All local times below are EDT (UTC−04:00). These are live production/API observations, not mocked test fixtures. No deployment, provider change, or device installation was performed for this check.

## Raleigh: match the original zero to its radar frame

Test coordinate: **35.7796, −78.6382** (central Raleigh).

| Source | Observation time | Reading |
| --- | --- | --- |
| Production `/api/weather`, original response | 1:22:00 PM | Overcast, 79.0°F, 86% humidity, precipitation rate 0 mm/h, probability 0% |
| NOAA radar at the same coordinate | 1:21:57 PM | Opaque yellow/orange precipitation echo; returned RGB 255,182,0 |
| Production `/api/weather`, later response | 2:17:00 PM | Thunderstorms, 74.5°F, 91% humidity, precipitation rate 2.13 mm/h, probability 100% |
| NOAA radar at the same coordinate | 2:16:14 PM | Opaque green precipitation echo; returned RGB 13,183,18 |

The first pair is separated by **3 seconds**; the second by **46 seconds**. The radar point query uses WMS 1.1.1 / EPSG:4326, bounding box `-78.6482,35.7696,-78.6282,35.7896`, 101×101 pixels, central pixel x=50/y=50. Requested frame timestamps are advertised in the saved capabilities response. Point results contain rendered RGBA values rather than numeric reflectivity; no exact dBZ or surface rain rate is inferred from these colors.

The yellow/orange echo agrees with the user's report of rain and contradicts treating the location as confidently dry. Radar detects precipitation aloft and cannot independently prove the exact surface rain rate, lightning, or probability calibration. Its spatial resolution also limits point precision.

The earlier response in `app-raleigh-earlier-zero.json` is copied verbatim from the successful production API tool result in the preceding turn; it is not a newly fetched historical endpoint. A progress message initially said 1:02 PM; converting its Unix timestamp confirms **1:22 PM**, and the final comparison uses the corrected matching frame. The extra 1:02 PM radar files are exploratory and are not the matched evidence.

## Actual app screen

Inspected the user's existing Chrome tab at `https://8-bit-weather.vercel.app/`, titled **Raleigh · 8-Bit Weather**. Its selected view was Now, not a future forecast preview.

- First inspection: Thunderstorms, 80°F, current precipitation chance 100%, 3 mph wind, 82% humidity, UV 4; observation time 1:34 PM.
- After using the visible Refresh control: Thunderstorms, 75°F, current precipitation chance 100%, 5 mph wind, 90% humidity, UV 3; observation time 2:17 PM. Footer read Updated 9 min ago.

The UI had already changed from the user's reported zero before inspection. The tab's exact saved coordinates were not read, so the central-Raleigh API coordinate above is not asserted to be the tab's precise location. The UI/API readings are similar, not identical. No iPhone screen was inspected.

## Exact station-coordinate comparisons

The app's live current endpoint was requested at each coordinate reported by NOAA's Aviation Weather Center. Observation times, rather than fetch times or rounded report times, are compared. Temperatures are Celsius to avoid rounding away differences.

| Station / coordinates | NOAA observation (EDT) | App at 2:19 PM EDT | Assessment |
| --- | --- | --- | --- |
| Asheville KAVL / 35.4318, −82.5379 | 2:04 PM: heavy rain and mist, 22.2°C | Heavy rain, 22.17°C, 100%, 0.04 mm/h | Rain type and temperature agree; the tiny rate does not establish matching heavy-rain intensity |
| Anderson KAND / 34.4980, −82.7092 | 2:09 PM: light rain, 26.1°C | Light rain, 26.36°C, 100%, 0.91 mm/h | Rain type and temperature agree |
| RDU KRDU / 35.8923, −78.7820 | 2:07 PM: thunderstorm; remarks say rain ended at 2:06 PM, 27.2°C | Thunderstorms, 27.13°C, 0%, 0 mm/h | Storm label agrees; zero precipitation can coexist with thunder after rain ends |
| Johnston KJNX / 35.5369, −78.3934 | 1:55 PM: scattered clouds, no precipitation code, 31.0°C | Partly cloudy, 30.85°C, 0%, 0 mm/h | Conditions and temperature agree, with a 24-minute observation gap |

Temperature differences are 0.03–0.26°C. Observation gaps range from 10 to 24 minutes; these are useful corroboration, not exact simultaneous instrument comparisons. NOAA METAR accumulated precipitation is not equivalent to Xweather's instantaneous mm/h estimate. A single wet/dry event cannot validate a forecast probability statistically. UV and feels-like values were not independently validated.

Earlier RDU/nearby station responses in `noaa-metar.json` and `nws-krdu-latest.json` were older and not sufficient to rule out a localized Raleigh shower. They are retained as initial evidence, not substituted for the newer station comparison.

## Forecast cross-check

NWS grid RAH/75,57 at central Raleigh forecasts chance of showers and thunderstorms: 37% for 1–2 PM, 41% for 2–3 PM, and 48% for 3–4 PM. The app screen's future 2 PM and 3 PM tiles showed 41% and 48%. These are **forecast intervals**, not observations. Agreement is not necessarily independent because commercial providers can incorporate NWS forecasts.

## What this establishes, and what remains unresolved

1. There is real external evidence supporting the user's reported discrepancy at the original time; this is not merely a hypothetical fixture failure.
2. The deployed service is capable of reporting rain and nonzero probabilities. This is not a permanently hard-coded zero.
3. The pending local changes prevent an unqualified rain code being erased by a zero rate and avoid displaying a contradictory percentage beside known active precipitation. They do not add independent rain detection or correct an upstream all-dry reading.
4. The original normalized response does not retain Xweather's raw coded condition. It cannot establish whether the original cloud label came directly from Xweather or from the server's former zero-rate suppression. The supplied rate and probability were zero before display formatting.
5. Current/rain caches last ten minutes, which can delay changing showers. The original response was newly fetched at 1:22:05 for a 1:22 condition, so its specific radar discrepancy is not explained by an old observation timestamp. Provider estimates and normalized timestamps are not guarantees of fresh underlying measurements.

The original accuracy incident remains unresolved end-to-end. Do not label the local display fix as externally validated remediation of that incident.

## Sources and reproduction

- [Production app](https://8-bit-weather.vercel.app/)
- [Production Raleigh current endpoint](https://8-bit-weather.vercel.app/api/weather?latitude=35.7796&longitude=-78.6382&section=current)
- [NOAA station observations](https://aviationweather.gov/api/data/metar?ids=KRDU,KAVL,KAND,KJNX&format=json&hours=1)
- [NWS RDU latest observation](https://api.weather.gov/stations/KRDU/observations/latest)
- [NWS Raleigh hourly forecast](https://api.weather.gov/gridpoints/RAH/75,57/forecast/hourly)
- [NOAA radar service capabilities](https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&version=1.3.0&request=GetCapabilities)
- [NOAA radar viewer](https://radar.weather.gov/station/KRAX/standard)

Raw JSON/XML/PNG responses are saved beside this report. Live endpoint URLs will change their results over time; use the saved files for this comparison. Radar map bounds are −78.85,35.60,−78.43,35.96, 840×720 pixels in EPSG:4326. The Raleigh test coordinate is approximately pixel (419.2,360.8). The SVG comparison marks that point without interpreting the raster as a direct surface measurement.
