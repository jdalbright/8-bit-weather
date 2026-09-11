# Native feedback, power awareness, and Lock Screen widgets

The iOS app uses `NativeExperience`, a small Capacitor bridge backed by UIKit and ProcessInfo. It supports iOS 17 and later. The website never calls this bridge and has no haptics setting.

## Haptics

Settings → Touch feedback → Haptic feedback defaults to on, including for existing installations without the preference. Its saved boolean is independent of every audio preference. Invalid stored values use the default; existing places and forecasts are retained.

Selection feedback occurs when the tab or UV/rain chart selection changes. Light impact feedback occurs when selecting a different place or starting a manual forecast request. Both pull-to-refresh and the Refresh button share the request-start path. Offline, cached, and rate-limited returns do not produce refresh feedback. Chart feedback is throttled to one pulse per 80 milliseconds; it never queues a trailing pulse.

The JavaScript client and Swift plugin gate feedback by foreground state and preference. Preference writes are serialized; queued feedback is discarded after preference changes, backgrounding, or a 250ms delay. Native errors are contained. There are no automatic-refresh, ordinary-scroll, discovery, disclosure, cold-launch, or deep-link haptics. Unsupported hardware can silently omit feedback.

## Power-aware scenery

`getPowerState()` returns `{ lowPowerMode, thermalState }`; `powerStateChanged` emits the same fields. The app observes native power/thermal notifications and re-reads state at launch and foreground return, without battery polling. New events supersede outstanding reads; cleanup also removes listeners that resolve after unmount.

Low Power Mode and serious/critical thermal states pause decorative scenery and equalizer animation. Normal/fair states permit animation again when Low Power Mode is off. Existing visibility, Reduce Motion, and the app's Reduce animation preference still take precedence. Chart/briefing disclosure transitions and native refresh/scrolling retain their normal behavior. Audio, weather refresh scheduling, and briefing provider selection are unchanged. Motion settings explain when this automatic reduction is active.

No battery percentage threshold or additional setting is introduced. Reduced rendering activity is the intended optimization; no measured battery-life improvement is claimed.

## Lock Screen widgets

The existing widget kind now offers circular, rectangular, and inline accessory families alongside small and medium Home Screen layouts. Circular shows temperature and a condition symbol; rectangular adds city, conditions, and local-day high/low; inline leads with temperature so long city names cannot displace it.

Accessory symbols are monochrome template pixel images. Layouts use readable system text, support reduced luminance, and redact their weather/location content under system privacy redaction. Missing readings use an em dash. Stale weather has a clock indicator, a spoken Saved weather label, and Saved text in the rectangular/inline layouts. Unconfigured widgets direct users to the app; circular uses an unavailable symbol with an accessible explanation.

All five families share the same selected place, units, cache, deep link, and timeline provider. Existing 30-minute requested refresh policy, 45-minute cache freshness threshold, location-local day expiration, offline handling, and cross-process selection/clear safeguards remain intact. iOS controls actual refresh timing. There is no separate city per widget, new weather request format, provider, paid service, or additional entitlement.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:widget`, and `npm run check:native` after `npm run ios:sync`.

Browser checks: `npm run test:native-web -- native-tests/experience.spec.ts native-tests/interaction-motion.spec.ts native-tests/briefing.spec.ts`. The native transport is mocked; tests cover deliberate feedback, persistence, suppressed/failed calls, foreground reconciliation, power states, both chart controls, and preserved motion/provider behavior. Run web briefing/motion tests against `npm run build` as well.

Physical acceptance: switch tabs, select another saved place, scrub UV and rain, pull to refresh, toggle Haptic feedback, and relaunch. Turn Low Power Mode on/off and verify scenery/equalizer behavior while disclosures stay responsive. Add all three accessory families in the Lock Screen editor (inline is in the date row above the clock), inspect tinted/Always On appearances, and tap through to the selected place. Verify Home Screen widgets still retain their landscape backgrounds. Use deterministic events for thermal tests rather than heating the phone.

Simulator render harnesses can inspect layout, missing/stale data, long names, and privacy redaction, but cannot establish physical haptic feel, system gallery behavior, real Always On appearance, background refresh timing, or energy savings.

### Verification record — September 11, 2026

- Typechecking and lint passed. Unit/server run: 261 client tests and 37 server tests passed; three opt-in live server cases skipped. Native Node ESM smoke check passed.
- 38 distinct targeted Chromium/WebKit cases passed (30 native briefing/experience/motion, eight web briefing/motion). The ten native experience/motion cases passed again after adding the request-start safeguard and rain-chart coverage.
- Swift widget harness passed 54 deterministic checks. Simulator and signed iOS builds passed; native asset and code-signature checks passed.
- Three real simulator UI tests passed: native bridge/settings, navigation/rotation/resume, and cached offline launch with matching-place deep links. The native probe is DEBUG-only, validates actual ProcessInfo values and Capacitor calls, and does not simulate physical haptic sensation.
- An isolated simulator rendering harness exported 40 view checks across five sizes and eight states: fresh, metric, stale, missing readings, cleared selection, long city, reduced luminance, and privacy redaction. This exposed an inline truncation issue; inline now leads with temperature. The harness does not reproduce WidgetKit's container backgrounds/system composition. Simulator Lock Screen gallery registration and addition were confirmed for circular and rectangular widgets.
- The initial feature build installed and launched on the connected iPhone. Installation of the final refinements was blocked when CoreDevice lost the connection; a follow-up device listing reported the iPhone unavailable. The final signed build was subsequently installed at 13:53 local time after reconnection; an initial transient launch preflight rejection cleared on retry, and launch succeeded at 13:54. The provisioning profile was valid through September 18 and Developer Mode was enabled. Physical haptic feel, real Low Power Mode changes, and physical Lock Screen/Always On checks still need user confirmation.
- No commit, push, deployment, paid service, or store submission was performed.
