import XCTest
import UIKit

final class AppUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        if name.contains("testLiveAppleBriefingSamples") || name.contains("testLiveOpenAIBriefingConnection") { return }
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
    }

    func testLaunchNavigationAndResume() {
        let settings = app.buttons["Settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 20))
        settings.tap()
        XCTAssertTrue(app.staticTexts["Weather units"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["How to install"].exists)
        app.buttons["Places"].tap()
        XCTAssertTrue(app.buttons["Use my location"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .landscapeLeft
        let rotated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.frame.width > self.app.frame.height
        }, object: app)
        XCTAssertEqual(XCTWaiter.wait(for: [rotated], timeout: 5), .completed)
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["Weather units"].waitForExistence(timeout: 5))
        app.buttons["Places"].tap()
        XCTAssertTrue(app.buttons["Use my location"].waitForExistence(timeout: 5))
        let landscape = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        landscape.name = "Native Places in landscape"
        landscape.lifetime = .keepAlways
        add(landscape)
        XCUIDevice.shared.orientation = .portrait
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["Use my location"].waitForExistence(timeout: 10))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Native Places after resume"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testAppleBriefingNativeBridgeAvailabilityAndValidation() {
        app.terminate()
        app.launchEnvironment["EIGHTBIT_UI_TEST_BRIEFING_PROBE"] = "true"
        app.launch()
        let passed = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Native briefing bridge passed:")).firstMatch
        XCTAssertTrue(passed.waitForExistence(timeout: 20), app.debugDescription)
        if #unavailable(iOS 27.0) {
            XCTAssertEqual(passed.label, "Native briefing bridge passed: requires_ios27")
        }
        let evidence = XCTAttachment(string: passed.label)
        evidence.name = "Actual Foundation Models availability and Capacitor bridge validation"
        evidence.lifetime = .keepAlways
        add(evidence)
    }

    /// Opt-in deployment/device smoke test. Uses the configured live backend
    /// with the app's normal forecast; does not replace saved places or data.
    func testLiveOpenAIBriefingConnection() throws {
        guard ProcessInfo.processInfo.environment["RUN_LIVE_OPENAI_BRIEFING"] == "true" else {
            throw XCTSkip("Set TEST_RUNNER_RUN_LIVE_OPENAI_BRIEFING=true to verify the live OpenAI connection.")
        }
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
        if app.staticTexts["Find your weather"].exists {
            app.buttons["Places"].tap()
            let search = app.searchFields.firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 10))
            search.tap()
            search.typeText("Raleigh")
            let city = app.buttons.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Raleigh", "North Carolina")).firstMatch
            XCTAssertTrue(city.waitForExistence(timeout: 20), app.debugDescription)
            city.tap()
        }
        XCTAssertTrue(app.staticTexts["OpenAI"].firstMatch.waitForExistence(timeout: 40), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Weather briefing"].firstMatch.exists)
        let evidence = XCTAttachment(string: app.debugDescription)
        evidence.name = "Live OpenAI briefing in native app"
        evidence.lifetime = .keepAlways
        add(evidence)
        app.webViews.firstMatch.swipeUp()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Live OpenAI briefing on device"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    /// Explicit opt-in: uses Apple's actual model, never OpenAI. Simulator
    /// availability depends on host assets; device output must be reviewed too.
    func testLiveAppleBriefingSamples() throws {
        guard #available(iOS 27.0, *) else {
            throw XCTSkip("Apple generation requires iOS 27; iOS 26 model quality is not approved.")
        }
        guard ProcessInfo.processInfo.environment["RUN_LIVE_APPLE_BRIEFING"] == "true" else {
            throw XCTSkip("Set TEST_RUNNER_RUN_LIVE_APPLE_BRIEFING=true for actual Apple model evaluation.")
        }
        continueAfterFailure = true
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "offline-preferences", withExtension: "json"))
        let base = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: String])
        for scenario in ["temperature-trend", "rain-timing", "missing-values"] {
            var seed = base
            let settingsKey = "CapacitorStorage.8bit-weather:v1"
            var settings = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(try XCTUnwrap(seed[settingsKey]).utf8)) as? [String: Any])
            var preferences = try XCTUnwrap(settings["preferences"] as? [String: Any])
            preferences["briefingProvider"] = "apple"
            settings["preferences"] = preferences
            seed[settingsKey] = String(data: try JSONSerialization.data(withJSONObject: settings), encoding: .utf8)
            let forecastKey = "CapacitorStorage.8bit-weather:v1:forecasts"
            var forecasts = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(try XCTUnwrap(seed[forecastKey]).utf8)) as? [[String: Any]])
            let now = Date().timeIntervalSince1970
            let hour = floor(now / 3600) * 3600
            for index in forecasts.indices {
                forecasts[index]["fetchedAt"] = now * 1000
                var current = try XCTUnwrap(forecasts[index]["current"] as? [String: Any])
                current["time"] = now
                forecasts[index]["current"] = current
                var hours = try XCTUnwrap(forecasts[index]["hourly"] as? [[String: Any]])
                for i in hours.indices {
                    hours[i]["time"] = hour + Double(i) * 3600
                    hours[i]["temperature"] = scenario == "temperature-trend" ? 26.0 - Double(min(i, 24)) * 0.5 : 22.0
                    hours[i]["code"] = scenario == "rain-timing" && i >= 8 && i < 15 ? 61 : 1
                    hours[i]["precipitation"] = scenario == "rain-timing" && i >= 9 && i <= 15 ? 70 : 0
                    if scenario == "missing-values" && i % 3 == 0 { hours[i]["temperature"] = NSNull(); hours[i]["precipitation"] = NSNull() }
                }
                forecasts[index]["hourly"] = hours
            }
            seed[forecastKey] = String(data: try JSONSerialization.data(withJSONObject: forecasts), encoding: .utf8)
            seed["CapacitorStorage.8bit-weather:v1:briefings"] = "[]"
            app.terminate()
            app.launchEnvironment["EIGHTBIT_UI_TEST_SEED"] = String(data: try JSONSerialization.data(withJSONObject: seed), encoding: .utf8)
            app.launchEnvironment["EIGHTBIT_UI_TEST_OFFLINE"] = "true"
            app.launch()
            let apple = app.staticTexts["Apple Intelligence"].firstMatch
            let accepted = apple.waitForExistence(timeout: 30)
            if scenario == "missing-values" && !accepted {
                // Rejecting unreliable incomplete-data prose is a valid outcome.
                // This offline test must show its recoverable state, never cloud output.
                XCTAssertTrue(app.staticTexts["Apple Intelligence is unavailable right now. Try again or switch to OpenAI."].exists)
            } else {
                XCTAssertTrue(accepted, "No accepted Apple briefing for synthetic \(scenario); see attached UI evidence.")
            }
            XCTAssertFalse(app.staticTexts["OpenAI"].exists)
            let evidence = XCTAttachment(string: "SYNTHETIC \(scenario)\n\(app.debugDescription)")
            evidence.name = "Actual Apple model output - \(scenario)"
            evidence.lifetime = .keepAlways
            add(evidence)
            app.webViews.firstMatch.swipeUp()
            let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            screenshot.name = "Apple briefing - \(scenario)"
            screenshot.lifetime = .keepAlways
            add(screenshot)
        }
    }

    func testAudioControlAndDurableVolume() {
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "Native audio accessibility hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        let soundOff = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Sound off")).firstMatch
        let soundOn = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Sound on")).firstMatch
        if soundOn.exists { soundOn.tap() }
        XCTAssertTrue(soundOff.waitForExistence(timeout: 10))
        soundOff.tap()
        XCTAssertTrue(soundOn.waitForExistence(timeout: 5))
        app.buttons["Settings"].tap()
        let volume = app.sliders["Music volume"].firstMatch
        XCTAssertTrue(volume.waitForExistence(timeout: 10))
        let previousVolume = volume.value as? String
        // WKWebView sliders expose a frame/value but no native scrubber bounds to XCTest.
        let targetPosition = (Double(previousVolume ?? "0") ?? 0) < 40 ? 0.7 : 0.2
        volume.coordinate(withNormalizedOffset: CGVector(dx: targetPosition, dy: 0.5)).tap()
        let savedVolume = volume.value as? String
        XCTAssertNotNil(savedVolume)
        XCTAssertNotEqual(savedVolume, previousVolume)
        app.terminate()
        app.launch()
        // Sound always needs a fresh user gesture on cold launch, while preferences persist.
        XCTAssertTrue(soundOff.waitForExistence(timeout: 20))
        app.buttons["Settings"].tap()
        XCTAssertTrue(volume.waitForExistence(timeout: 10))
        XCTAssertEqual(volume.value as? String, savedVolume)
        soundOff.tap()
        XCTAssertTrue(soundOn.waitForExistence(timeout: 5))
        soundOn.tap()
    }

    func testLocationPermissionDenialPreservesCitySearch() {
        app.buttons["Places"].tap()
        addUIInterruptionMonitor(withDescription: "Location permission") { alert in
            let deny = alert.buttons["Don’t Allow"].firstMatch
            if deny.exists { deny.tap(); return true }
            let alternate = alert.buttons["Don't Allow"].firstMatch
            if alternate.exists { alternate.tap(); return true }
            return false
        }
        app.buttons["Use my location"].tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if permission.waitForExistence(timeout: 10) {
            let deny = permission.buttons["Don’t Allow"]
            let alternate = permission.buttons["Don't Allow"]
            XCTAssertTrue(deny.exists || alternate.exists)
            (deny.exists ? deny : alternate).tap()
        }
        XCTAssertTrue(app.staticTexts["Location permission is off. Allow location in iPhone Settings, or search for a city."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.searchFields.firstMatch.exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Location permission and search fallback"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testNativeCachedOfflineLaunchAndMatchingPlaceDeepLink() throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "offline-preferences", withExtension: "json"))
        let seed = try String(contentsOf: fixture, encoding: .utf8)
        app.terminate()
        app.launchEnvironment["EIGHTBIT_UI_TEST_SEED"] = seed
        app.launchEnvironment["EIGHTBIT_UI_TEST_OFFLINE"] = "true"
        app.launch()
        XCTAssertTrue(app.buttons["Change location, Raleigh"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["You’re offline. Showing your saved forecast."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "75° Fahrenheit")).firstMatch.exists)
        let cached = XCTAttachment(screenshot: app.screenshot())
        cached.name = "Native WKWebView cached weather under controlled network loss"
        cached.lifetime = .keepAlways
        add(cached)

        app.open(URL(string: "eightbitweather://place?id=4453066")!)
        XCTAssertTrue(app.buttons["Change location, Asheville"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "65° Fahrenheit")).firstMatch.exists)

        // Relaunch without reseeding: selection must come from native durable preferences.
        app.terminate()
        app.launchEnvironment.removeValue(forKey: "EIGHTBIT_UI_TEST_SEED")
        app.launch()
        XCTAssertTrue(app.buttons["Change location, Asheville"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["You’re offline. Showing your saved forecast."].waitForExistence(timeout: 10))
    }
}
