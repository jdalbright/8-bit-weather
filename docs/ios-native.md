# Native iOS build and installation

The iOS app packages the shared React application with Capacitor 8. It targets iOS 17 or later and includes a small/medium WidgetKit extension. Web and iOS builds are separate; the native bundle is `dist-native`, copied into the application by Capacitor. There is no hosted page dependency for launching the app.

## Requirements

- macOS with Xcode 26 or newer and an installed iOS Simulator runtime, Node/npm, and network access for initial Swift package resolution.
- Verified development host: Xcode 26.6 (17F113), selected at `/Applications/Xcode.app/Contents/Developer`; iOS 26.5 Simulator runtime.
- Apple briefing generation requires iOS 27 or later. The existing Foundation Models APIs compile with this SDK and select the installed OS model at runtime. Xcode 27 with an iOS 27 runtime (or a compatible provisioned device) is still needed to evaluate that newer model; the installed iOS 26.5 simulator only verifies the older-OS fallback gate. See [the verification boundary](ios-apple-briefing.md).
- App bundle identifier: `app.eightbitweather.app`.
- Widget identifier: `app.eightbitweather.app.widget`.
- Shared App Group: `group.app.eightbitweather.shared`.

## Build locally

Run from the repository root:

```sh
npm ci
npm run build:native
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/eightbit-ios-derived \
  -clonedSourcePackagesDirPath /tmp/eightbit-ios-packages \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
```

Simulator builds use local ad-hoc signing (`CODE_SIGN_IDENTITY=-`) to retain App Group entitlements without a development account. `CODE_SIGNING_ALLOWED=NO` is useful for compile checks only and does not verify App Group runtime access.

The included Xcode project contains the app, widget extension, App Group entitlements, and UI test target. Do not run `cap add ios` again. `cap sync ios` updates the generated web assets and Swift package list while retaining these targets. Generated web assets are intentionally ignored by Git.

Open `ios/App/App.xcodeproj` in Xcode for interactive builds. The shared `App` scheme embeds `WeatherWidgetExtension`; `WeatherWidgetExtension` is also available as a separate build scheme.

## Simulator install and tests

List available devices and substitute a device UUID as needed:

```sh
xcrun simctl list devices available
xcrun simctl boot 893B0ADB-6BA1-4DF3-AC4C-D52134139EE5
xcrun simctl bootstatus 893B0ADB-6BA1-4DF3-AC4C-D52134139EE5 -b
xcrun simctl install 893B0ADB-6BA1-4DF3-AC4C-D52134139EE5 \
  /tmp/eightbit-ios-derived/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch 893B0ADB-6BA1-4DF3-AC4C-D52134139EE5 app.eightbitweather.app
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=893B0ADB-6BA1-4DF3-AC4C-D52134139EE5' \
  -derivedDataPath /tmp/eightbit-ios-derived \
  -clonedSourcePackagesDirPath /tmp/eightbit-ios-packages \
  -resultBundlePath /tmp/eightbit-ios-ui-tests-pass.xcresult \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
```

Use a fresh result-bundle path for repeated test runs. The UI tests cover native launch/navigation/background-resume, audio activation and durable volume preferences, the denied-location search fallback, and cached offline launch with matching-place deep links and selection persistence. Sound requires a user tap after a cold launch, matching the website's existing behavior; audio preferences remain saved. Ambient audio respects the silent switch and does not request background audio execution.

The offline test uses synthetic Raleigh/Asheville forecasts in `AppUITests/offline-preferences.json`, generated from the shared TypeScript fixture via `scripts/make-ios-fixtures.mjs`. A Debug-only host hook seeds only this app’s Capacitor weather preferences and simulates network loss at WKWebView document start. It asserts cached temperatures and the offline label, opens a real `eightbitweather://place` URL through iOS, and relaunches without reseeding to verify durable selection. This is controlled network-loss verification in the actual native WebView, not a physical radio test. The `EIGHTBIT_UI_TEST_SEED`, `EIGHTBIT_UI_TEST_OFFLINE`, `EIGHTBIT_UI_TEST_BRIEFING_PROBE`, and synthetic `EIGHTBIT_UI_TEST_APPLE_RESULT` diagnostics are absent from Release builds. The briefing probe exercises actual native bridge registration, model availability, cancellation, and invalid-input rejection without model inference. An opt-in live Apple evaluation is documented in [Apple briefing verification](ios-apple-briefing.md).

Reset location permission before testing the system prompt again:

```sh
xcrun simctl privacy 893B0ADB-6BA1-4DF3-AC4C-D52134139EE5 reset location app.eightbitweather.app
```

After saving a place, open a matching deep link (URL-encode the saved ID):

```sh
xcrun simctl openurl 893B0ADB-6BA1-4DF3-AC4C-D52134139EE5 'eightbitweather://place?id=YOUR_SAVED_PLACE_ID'
```

Long-press the simulator Home Screen, choose Edit/Add Widget, and search for 8-Bit Weather to add the small and medium widgets. The widget opens the matching selected place. WidgetKit controls actual refresh timing; the requested timeline interval is not an exact schedule. See [Widget implementation and tests](ios-widget.md) for cache, refresh, and stale-data behavior.

## Physical iPhone

Connect/unlock the iPhone and enable Developer Mode when iOS requests it. Select a development team in Xcode for both app and widget targets and register the exact bundle IDs and shared App Group under that team. Then select the connected device and run the `App` scheme. This local project now uses Jacob Albright's approved Personal Team for app and widget signing.

### Connected iPhone check (September 11, 2026)

The iPhone 17 Pro is connected over USB, paired, and trusted, with Developer Mode enabled. Its reported OS is **iOS 26.6.2**, so Apple briefing generation is intentionally unavailable under the iOS 27 policy.

After explicit development-signing approval, Xcode provisioned the app and widget with the shared App Group. The user approved macOS keychain access and trusted the developer profile on the phone. The signed Debug build, strict signature verification, installation, and launch all passed. Its development profiles expire **September 18, 2026**; rebuild and reinstall after renewal.

Physical tests passed for native bridge availability/validation, navigation/landscape/background-resume, and a live OpenAI briefing through the production endpoint. The live test handles the fresh-install welcome screen by selecting Raleigh through normal city search. See [physical test results and screenshots](ios/evidence/iphone-development/README.md) for result bundles, the corrected initial test failure, and remaining verification limits.

The signed app is `/tmp/eightbit-iphone-connected-derived/Build/Products/Debug-iphoneos/App.app`; build log: `/tmp/eightbit-iphone-connected-build.log`. Device audio, GPS accuracy, physical offline radio behavior, and Home Screen widget rendering/scheduling remain unverified. No TestFlight or App Store submission was performed.

## Recorded native verification

- Native app plus embedded WidgetKit extension: **build passed**, Xcode 26.6 / iOS 26.5 Simulator, without a signing account.
- Generic unsigned Release build for iPhoneOS: **passed**; compile-only evidence at `/tmp/eightbit-ios-device-build.log`.
- Initial build log: `/tmp/eightbit-ios-build.log`.
- Simulator UI test log: `/tmp/eightbit-ios-test-pass.log`; result bundle: `/tmp/eightbit-ios-ui-tests-pass.xcresult`.
- Final signed simulator suite: **4 tests passed, 0 failures**, in 72 seconds. Covered audio gesture/volume persistence, native navigation/landscape/background-resume, denied location with city-search fallback, seeded cached weather under controlled network loss, system deep-link routing from Raleigh to Asheville, and cold-relaunch selection persistence. Earlier harness failures were corrected before this passing run.
- App Group registration was verified with `simctl get_app_container … groups` after ad-hoc signing.
- A focused repeat of the final volume test also passed using an alternate target volume, proving it works with preexisting settings; log `/tmp/eightbit-ios-audio-repeat.log`.
- A focused final navigation/layout run also passed with the updated native permission wording; log `/tmp/eightbit-ios-layout-screen.log`, result `/tmp/eightbit-ios-layout-screen.xcresult`. Landscape waits for actual frame rotation and exercises navigation before capturing the full display with `XCUIScreen.main.screenshot()`.
- Passing screenshots: [offline cache](ios/evidence/native-test-offline-cache.png), [landscape](ios/evidence/native-test-landscape.png), [resume](ios/evidence/native-test-resume.png), and [location denial](ios/evidence/native-test-permission-denied.png).
- Native UI test/runtime results are recorded in [the implementation ledger](ios/IMPLEMENTATION.md), including checks that remain blocked or unperformed.

The initial simulator boot stalled in `CoreLocationMigrator`. A targeted shutdown and boot recovered it; the second boot completed in 10 seconds. The ledger records simulator launch and test results separately from build success.

## Native feedback and power awareness

The app now includes optional native haptics, automatic decorative-animation reduction for Low Power Mode/thermal pressure, and three Lock Screen widget layouts. See [behavior and verification](ios-experience.md).
