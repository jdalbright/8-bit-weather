# iOS briefing provider selection

## Current behavior

Settings → Weather briefing lets iOS users select OpenAI or Apple Intelligence. OpenAI is the default for new installations and older saved settings without a valid provider choice. The website always uses OpenAI. Provider choices persist through the existing native Preferences store; changing providers does not change saved places, weather, units, or audio.

Only the selected provider generates new summaries. Apple selection never contacts OpenAI, and OpenAI selection never starts Apple generation. Failures offer a bounded retry and an explicit switch action when the alternative is usable or has an eligible saved briefing. Switching updates the saved preference. A selected but unavailable Apple option stays selected; Settings explains the reason and rechecks availability when opened or foregrounded.

OpenAI needs connectivity for new summaries. Apple uses the iOS 27 on-device model and can generate offline from fresh usable cached weather. Offline reads only use the selected provider's saved summaries within the existing validity window. Caches, pending jobs, and failures are partitioned by provider; legacy summaries without provider metadata count as OpenAI. Switching cancels old work and rejects late responses. Cloud rate limits do not prevent Apple generation.

The existing server endpoint, model configuration, request shape, and privacy protections are unchanged. No coordinates or saved place names are sent to either language model. No Apple PCC service is configured.

## Verification

Provider tests cover migration, strict routing, per-provider caches, offline switching, cancellation in both directions, late responses, settings persistence, changing availability, and explicit recovery actions. Native browser transport is mocked and is not evidence of model quality or physical behavior. The signed-app debug launch flag `EIGHTBIT_UI_TEST_PROVIDER=apple|openai` drives the real Settings controls and a forecast refresh without replacing user data, and emits `PROVIDER_UI_RESULT`. Relaunch normally after testing.

### Provider selection verification — September 11, 2026

- 247 unit tests and 37 server tests passed; three optional server live tests skipped. Native Node ESM smoke, typechecking, lint, and native bundle checks passed.
- 24 native browser briefing/interaction tests and eight website briefing/interaction tests passed in Chromium and WebKit. These mock the native transport and provider responses.
- Signed Debug app built successfully, passed strict code-signature verification, and installed over the existing app on the connected iPhone 17 Pro running iOS 27.
- Physical Settings check started with the migrated OpenAI default, selected Apple, refreshed weather, and received a validated Apple Intelligence summary. The next launch read the saved Apple selection.
- Physical Settings then selected OpenAI and refreshed weather; a real OpenAI summary appeared. That run contained no Apple generation calls. The app was reopened normally with OpenAI saved.
- Failure isolation, explicit fallback actions, and cancellation races are covered by deterministic tests; physical success-path verification does not simulate every provider outage.

## September 12: accuracy loop on the connected iPhone

The signed Debug build with Apple prompt revision 2 was installed over the existing app on the connected iPhone 17 Pro running iOS 27. Seven synthetic forecasts were passed through the real Swift bridge and on-device model with WebView networking disabled. Saved preferences, places, and weather were not seeded or replaced. The returned texts were reviewed against the inputs and passed through the production JavaScript validator locally; this checks actual model output, but is not a physical end-to-end UI or persistence test.

The initial revision 1 samples exposed false precipitation gaps for a complete dry forecast and an invented unavailable low for partial temperature data. The latter previously passed validation. Revision 2 supplies plain coverage states, full temperature units, omits zero missing counts and redundant steady high descriptions, and computes a precipitation sentence for the model to copy. Validation requires that exact sentence and rejects invented high/low claims in steady temperature prose. Older Apple cache revisions are invalidated online and offline.

| Final physical case | Result | Launch plus generation |
| --- | --- | --- |
| Complete dry forecast | Correct steady 72°F and no precipitation expected | 1.42 s |
| Frozen precipitation code | Correct 25°F and generic 80% precipitation wording | 1.53 s |
| Celsius warming | Correct 2°C to 14°C and 60% peak timing | 1.70 s |
| Partial zero precipitation readings | Explicit incomplete data with available peak 0% | 2.28 s |
| Partial temperatures and precipitation | Available temperature readings and explicit incomplete precipitation data | 1.61 s |
| Both topics unavailable | Both unavailable statements retained | 1.41 s |
| Clipped first interval at local morning boundary | 86°F to 72°F and 80% peak correctly assigned to this morning | 6.12 s |

All seven final outputs passed the production validator. Device locks blocked several launch attempts; those produced no model sample and are excluded from this table. The initial four successful candidate cases were also repeated successfully on the final installed build. This is a small synthetic evaluation, not a guarantee against all model hallucinations.

[Sanitized synthetic inputs and exact final outputs](../src/test/apple-device-samples.json) are replayed by [the device regression tests](../src/lib/apple-briefing-device.test.ts). These include both original incorrect outputs as rejection regressions and contain no device identifiers, coordinates, or saved user data. Final validation included 401 client tests and 150 server tests (four opt-in live tests skipped), then six additional device replays and two previous-revision cache cases; all passed. The 22 native browser briefing cases passed in Chromium and WebKit with mocked transport. Typechecking, lint, web/native builds, asset checks, native packaging checks, signed iPhone build, strict signature verification, and device installation passed. Independent accuracy, replay, and native integration reviews reported no remaining material code findings after a TypeScript guard correction.

## September 11: on-device wording refinement

The connected iPhone 17 Pro on iOS 27 reports the model available and has generated and cached a real Apple briefing. Earlier OpenAI attribution persisted until a forecast refresh replaced the cached summary.

Apple input calculates the temperature high/low and their local dayparts, distinguishes steady temperatures, and supplies peak hourly precipitation chances and their dayparts. The first overlapping interval is clipped to the briefing start before assigning its daypart. Local calendar labels respect the forecast timezone, including daylight-saving transitions. Native generation requests a plain-text response rather than a guided two-field structure.

The local accuracy revision uses generic precipitation wording because compact Apple facts omit precipitation type. It distinguishes complete, partial, and unavailable temperature and precipitation coverage separately; partial zero readings cannot imply a dry forecast. Shared numeric validation checks both range endpoints and explicit temperature units, and rejects contradictory coverage claims. Apple retains its compact sentence/length policy and rejects specific precipitation types unsupported by its facts. OpenAI's existing claim checks are shared without changing its fuller prompt or output limits.

Generated Apple summaries carry `applePromptRevision`; only the current revision is reused, including offline. Earlier Apple summaries are regenerated when fresh weather and the local model are available. OpenAI caches remain eligible. Offline cards say **Saved briefing** with the original generation timestamp. Revision 2 has physical-model verification recorded below; the September 11 samples are historical.

The debug-only `EIGHTBIT_UI_TEST_APPLE_SAMPLE` launch variable accepts a JSON object containing `facts` and `instructions`. It calls the real native bridge while suppressing the normal UI request, without modifying saved places, preferences, or cached weather. Use `EIGHTBIT_UI_TEST_OFFLINE=true` alongside it to prevent cloud requests. Console output is prefixed `APPLE_SAMPLE_RESULT`; relaunch normally after evaluation. These hooks are absent from Release builds.

Final physical comparison used the same three fact sets on the iPhone's actual iOS 27 model, with WebView networking disabled:

- Hot-day forecast: “Temperatures will drop from 95°F this afternoon to 74°F tomorrow morning, making it feel cooler as the day ends. Rain chances peak at 14% tomorrow morning.” Accepted; temperatures and peak probability match the supplied forecast.
- Synthetic steady-temperature/rain forecast: “Temperatures will stay at 72°F this afternoon, feeling comfortable as the day ends. Rain chances peak at 70% this evening and overnight.” Accepted; correct steady temperature and precipitation timing.
- Synthetic missing measurements: the model omitted required uncertainty. Rejected by the shared validator; an explicit provider switch or retry remains necessary.

Evaluation including app launch took about 2–3 seconds per sample. This small comparison demonstrates an improvement, not a guarantee of semantic accuracy across all weather. Full unit/server checks passed before the final prompt-only refinement; the final 40 Apple routing/fact/validation tests, typechecking, lint, native assets check and signed physical build passed. Native browser briefing regression checks passed in Chromium and WebKit.

This is prompt and input engineering, not training or replacing Apple's system model. Physical evaluation is necessary: earlier iterations copied example wording, listed dayparts, or used past tense. Passing mocked tests alone does not establish prose quality.

## Historical integration notes

The following records the earlier automatic-fallback implementation and its evaluation. Current provider selection above supersedes its routing and fallback descriptions.

## iOS 27 model policy

Apple documents that `SystemLanguageModel` changes with the upgrade to iOS 27 and improves instruction following. The existing on-device session API uses that installed model; a different model name is not selected in the app. See [Apple's June 2026 Foundation Models updates](https://developer.apple.com/documentation/updates/foundationmodels). This integration uses the on-device model; Apple's separate `PrivateCloudComputeLanguageModel` is not configured.

Both native availability and generation are gated at iOS 27, returning `requires_ios27` / `UNAVAILABLE` on older versions before accessing the model. The bridge reports the operating system's major version, and the shared client refuses local inference if that metadata is absent or below 27. New Apple cache entries include `appleModelOSMajor`; older Apple evaluation entries are ignored online and offline, while legacy OpenAI entries remain compatible. This metadata describes the OS model generation, not a stable model identifier.

The iOS 26 results below were mixed and do not qualify that model for use. The current host has Xcode 26.6 and only an iOS 26.5 simulator. Actual iOS 27 model quality, availability, latency, and output remain **unverified** until the evaluation runs with an iOS 27 runtime or compatible physical phone. The live model test now explicitly skips older OS versions, even when opted in.

### Verification after the iOS 27 policy change

- Frontend: 224 tests passed, including 36 Apple routing/validation/lifecycle cases. Tests cover rejection of iOS 26 and missing/invalid OS metadata before inference, one cloud fallback, offline refusal, replacement of old Apple caches, and reuse of new Apple/legacy OpenAI caches. Server: 37 passed, three opt-in paid tests skipped; Node ESM smoke passed.
- Native browser tests: 26 passed in Chromium/WebKit, with mocked Apple/cloud responses. The added iOS 26 scenario performs no local inference and retains its OpenAI briefing offline. Website briefing regressions: six passed.
- Actual iOS 26.5 native bridge test: passed, returning `requires_ios27` and refusing a valid direct generation request with `UNAVAILABLE`. The opted-in live evaluation skipped as required (one pass, one skip, zero failures); this is not iOS 27 model evidence.
- Native TypeScript/lint and bundle checks passed. Signed simulator build/run and unsigned iPhone Release build passed with the app's iOS 17 deployment target retained.

Follow-up evidence is in [the iOS 27 policy test logs](ios/evidence/apple-briefing/ios27-policy/). Native results: `/tmp/ios27-briefing-version-gate.xcresult`. No actual iOS 27 generation or production OpenAI call was performed.

## Behavior and interfaces

- `AppleBriefing` is a Capacitor plugin with `availability()`, `generate({requestId, facts, instructions})`, and `cancel({requestId})`. Availability distinguishes old OS, ineligible device, disabled Intelligence, unready model, and unsupported English. The framework is weak-linked and every use is guarded by iOS 27 availability; the app's minimum remains iOS 17.
- Shared code validates forecast measurements and freshness, aligns precipitation to its interval, converts temperatures, calculates the known temperature range, and groups equal precipitation/condition intervals into compact local-time facts. No coordinates or saved place names go to either language model. A concise Apple-specific prompt and guided Swift generation request two sentences, retaining the existing English 75-word maximum, warm/practical style and uncertainty rules. The OpenAI prompt stays unchanged. Explicit numeric probability and temperature claims are checked against the forecast; this is not a full semantic fact checker.
- Apple gets 20 seconds including availability; cloud fallback gets its own existing 15-second client deadline. A fresh model session uses a guided two-field Swift structure, greedy sampling, and a 250-token response budget. Invalid local prose, unsupported explicit numeric claims, overconfident dry-weather claims with missing precipitation, ambiguous claims of absent temperature readings, or errors use fallback; old or incomplete forecasts do not. The existing backend model configuration, 12-second provider timeout, and WAF/CORS protections are retained.
- Navigation, superseding location/units, backgrounding, or clearing data cancel active work without cloud fallback. Swift also cancels on app resignation, settles bridge calls immediately, and ignores late model completion. JS request identity and cache epochs prevent late results from restoring cleared or mismatched data.
- Cached results take priority. Native Preferences persist optional `provider: 'apple' | 'openai'` attribution; old entries without provider metadata remain readable. Offline generation is allowed only from fresh complete cached weather; saved summaries retain their existing 24-hour window. Cloud 429 cooldowns do not prevent Apple generation for a different request.
- Briefing badges identify the provider after generation. Settings explains on-device processing and automatic cloud fallback. Missing cloud configuration affects only fallback, not Apple generation or forecasts.

## Reproduce verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run check:assets
npm run test:e2e
npm run test:native-web
npm run ios:sync
npm run check:native
```

Native browser tests compile an isolated bundle in `/tmp/8bit-weather-native-browser-bundle` with a synthetic cloud URL. Every request to that URL is intercepted, and Capacitor transport/model replies are mocked. This URL is never written into the normal `dist-native` bundle or `ios:sync` output. Browser tests cover local attribution, cloud fallback, privacy copy, cache persistence, offline generation, navigation cancellation, and rate limits in Chromium and WebKit.

Use [the native build instructions](ios-native.md) for signed simulator and unsigned device builds. The default simulator suite includes `testAppleBriefingNativeBridgeAvailabilityAndValidation`, which exercises the real registered Swift plugin. The opt-in actual-model evaluation uses synthetic forecasts for temperature changes, rain timing across a 24-hour window, and missing values:

```sh
TEST_RUNNER_RUN_LIVE_APPLE_BRIEFING=true xcodebuild \
  -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,id=YOUR_IOS_27_SIMULATOR_ID' \
  -derivedDataPath /tmp/eightbit-ios-derived \
  -clonedSourcePackagesDirPath /tmp/eightbit-ios-packages \
  -only-testing:AppUITests/AppUITests/testLiveAppleBriefingSamples \
  -resultBundlePath /tmp/apple-briefing-live-samples.xcresult \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
```

Replace the simulator placeholder with an installed iOS 27 or later simulator and choose a fresh result path on repeat runs. Model availability and assets depend on the host/device. The test runs through the actual native app with network access disabled in its WebView, captures output for human review, and requires Apple attribution for the complete temperature/rain scenarios; the incomplete-data scenario may produce an accepted summary or a recoverable offline rejection. It verifies that no cloud attribution appears; no OpenAI request can run. Physical testing requires a connected eligible phone, provisioning, and Apple Intelligence enabled. Review temperature ranges, precipitation probabilities/timing, missing-data uncertainty, readability, and latency; simulator evidence does not establish physical performance or battery behavior.

## Initial iOS 26 evaluation (September 11, 2026; historical)

| Check | Result |
| --- | --- |
| Frontend unit tests | 216 passed, including 28 Apple routing/validation/lifecycle cases |
| Server tests | 37 passed; three opt-in paid OpenAI tests skipped |
| Native Node ESM startup | Passed after including the shared prompt module in the smoke graph |
| TypeScript / lint | Passed, including native browser test sources |
| Website Chromium / WebKit | 153 passed, nine intentional capability skips; final focused briefing regression 6 passed |
| Native browser transport / UI | 24 passed in Chromium and WebKit; model/cloud replies mocked |
| Native XCTest suite | 6 passed, 0 failed; subsequent final live evaluation passed with the added incomplete-data rejection guard |
| Real Apple model in simulator | Temperature trend and 70% rain-timing samples accepted within the 20-second deadline; misleading incomplete-data output rejected, with a recoverable offline state |
| Builds | Web, native bundle, signed simulator app/widget, and unsigned iPhone Release passed |
| Compatibility / packaging | iOS 17 deployment retained; Foundation Models weak-link verified; test hooks and fake cloud URL absent from Release |
| Web asset budget | 2339.2 KiB / 3 MB |

[Logs and screenshots](ios/evidence/apple-briefing/) include [actual model samples](ios/evidence/apple-briefing/live-samples.json), [temperature sample](ios/evidence/apple-briefing/simulator-temperature-trend.png), [rain sample](ios/evidence/apple-briefing/simulator-rain-timing.png), and [rejected incomplete-data state](ios/evidence/apple-briefing/simulator-missing-values.png). The separately labelled mocked browser screenshot verifies the UI only.

The full XCTest result is `/tmp/apple-briefing-all-native-final.xcresult`; the final actual-model evaluation is `/tmp/apple-briefing-live-accepted-or-fallback.xcresult`. During evaluation, earlier model responses introduced unsupported probabilities or overstated missing data, and cold/contended simulator attempts sometimes reached the deadline. Those findings led to guided generation and conservative output rejection. Successful samples establish that the actual native pipeline works, not general semantic accuracy or guaranteed generation latency. Incomplete-data rejection uses OpenAI online (covered by tests); the actual simulator evaluation deliberately disabled networking.

Final simulator build: `/tmp/eightbit-ios-derived/Build/Products/Debug-iphonesimulator/App.app`. Final unsigned device build: `/tmp/eightbit-ios-device-derived/Build/Products/Release-iphoneos/App.app`. At that September 10 checkpoint, production fallback and the physical phone were unverified. The September 11 deployment and physical tests below supersede that release status.

## External release requirements

The approved OpenAI backend deployment and environment configuration are complete; see [native briefing setup](ios-briefing.md) for live verification results. Development signing was subsequently approved, and the app and widget were signed and installed on the iPhone 17 Pro running iOS 26.6.2. Physical native availability/version gating, navigation/background-resume, and a live OpenAI briefing passed; see [device results](ios/evidence/iphone-development/README.md). iOS 17 compatibility is compile/weak-link checked; an older-OS runtime was not installed for execution testing. Actual iOS 27 Apple model evaluation also remains pending.

Apple API references: [Foundation Models](https://developer.apple.com/documentation/foundationmodels), [model availability](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel), [supported devices and setup](https://support.apple.com/en-us/121115). The installed Xcode 26.6 SDK interface was used to verify the exact APIs compiled here.
