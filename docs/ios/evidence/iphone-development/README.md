# Physical iPhone verification — September 11, 2026

Device: iPhone 17 Pro, iOS 26.6.2, connected over USB. Development signing and backend deployment were explicitly approved. The user completed macOS keychain authorization and trusted the developer profile on the phone.

The Debug app and embedded WidgetKit extension built successfully with Xcode 26.6, using Jacob Albright’s Personal Team. Installation and normal launch succeeded. Both provisioning profiles include the shared App Group; strict signature verification passed. The installed development profiles expire September 18, 2026, requiring renewal and reinstallation.

| Physical-device check | Result |
| --- | --- |
| Native bridge availability and validation | Passed, 8.865 seconds; iOS 26 correctly returns `requires_ios27` |
| Navigation, landscape, background/resume | Passed, 14.955 seconds |
| Live OpenAI connection | Passed, 17.268 seconds; selected Raleigh through normal first-launch city search and displayed a real briefing from the production backend |

The initial combined test run passed the first two checks but failed the live check because no city had been selected on the fresh installation. The opt-in live test was corrected to select Raleigh only when the welcome screen appears, then the focused live test passed. No saved data was cleared or synthetic forecast seeded for this check.

Evidence: [OpenAI briefing](openai-briefing.png), [resume](resume.png), [landscape](landscape.png). Local result bundles: `/tmp/eightbit-iphone-live-tests.xcresult` and `/tmp/eightbit-iphone-openai-test.xcresult`. Build log: `/tmp/eightbit-iphone-connected-build.log`.

To repeat the live check, use `TEST_RUNNER_RUN_LIVE_OPENAI_BRIEFING=true` with the App scheme and `-only-testing:AppUITests/AppUITests/testLiveOpenAIBriefingConnection`. This opt-in test uses the configured production endpoint and may generate a paid OpenAI request when there is no valid cached briefing.

Apple generation on iOS 27 remains unverified because this phone runs iOS 26.6.2. Physical offline radio behavior, audio output, GPS accuracy, and Home Screen widget rendering/scheduling were not tested here. Widget updates resolved through the native bridge, but a CoreDevice App Group file listing did not expose the expected cache file; physical widget cache persistence is therefore not claimed. No Git push, TestFlight, or App Store submission was performed.
