import Capacitor
import Foundation
import FoundationModels
import UIKit

@available(iOS 27.0, *)
@Generable
private struct GeneratedWeatherBriefing {
    @Guide(description: "One short sentence about the supplied temperature range and trend, in the supplied unit. When temperature.missingHours is positive, explicitly qualify this as available readings. No greeting.")
    var temperature: String
    @Guide(description: "One short sentence about the supplied precipitation chances and timing, with a practical takeaway if justified. If missingPrecipitationHours is positive, state that precipitation data is incomplete and never promise dry weather. No invented numbers.")
    var precipitation: String
}

/// A narrow on-device text bridge. Cloud fallback stays in the shared client.
@objc(AppleBriefingPlugin)
public final class AppleBriefingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleBriefingPlugin"
    public let jsName = "AppleBriefing"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    // Accessed only on the main queue. Keep calls so cancellation settles even
    // if the framework takes time to acknowledge a cancelled task.
    private var jobs: [String: (task: Task<Void, Never>, call: CAPPluginCall)] = [:]

    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(stopForBackground),
            name: UIApplication.willResignActiveNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func unavailableReason() -> String? {
        // SystemLanguageModel follows the installed OS. Do not opt into the
        // iOS 26 model: its evaluated output did not meet our quality bar.
        guard #available(iOS 27.0, *) else { return "requires_ios27" }
        switch SystemLanguageModel.default.availability {
        case .available:
            return SystemLanguageModel.default.supportsLocale(Locale(identifier: "en")) ? nil : "language_unsupported"
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible: return "device_unsupported"
            case .appleIntelligenceNotEnabled: return "intelligence_disabled"
            case .modelNotReady: return "model_not_ready"
            @unknown default: return "unavailable"
            }
        @unknown default: return "unavailable"
        }
    }

    @objc func availability(_ call: CAPPluginCall) {
        if let reason = unavailableReason() { call.resolve(["available": false, "reason": reason]) }
        else { call.resolve(["available": true, "modelOSMajor": ProcessInfo.processInfo.operatingSystemVersion.majorVersion]) }
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let id = call.getString("requestId"), UUID(uuidString: id) != nil,
              let facts = call.getString("facts"), !facts.isEmpty, facts.utf8.count <= 12_000,
              let instructions = call.getString("instructions"), !instructions.isEmpty, instructions.utf8.count <= 4_000 else {
            call.reject("A bounded weather briefing request is required.", "INVALID_REQUEST")
            return
        }
        DispatchQueue.main.async { [self] in
            guard UIApplication.shared.applicationState == .active else {
                call.reject("The app is inactive.", "CANCELLED"); return
            }
            guard jobs[id] == nil, jobs.isEmpty else {
                call.reject("An on-device briefing is already running.", "BUSY"); return
            }
            guard #available(iOS 27.0, *), unavailableReason() == nil else {
                call.reject("Apple Intelligence is unavailable.", "UNAVAILABLE"); return
            }
            let task = Task { @MainActor [self] in
                do {
                    let session = LanguageModelSession(model: .default, instructions: instructions)
                    let response = try await session.respond(to: facts, generating: GeneratedWeatherBriefing.self,
                        options: GenerationOptions(sampling: .greedy, maximumResponseTokens: 250))
                    try Task.checkCancellation()
                    let text = response.content.temperature + " " + response.content.precipitation
                    self.recordTestResult(text)
                    guard let job = self.jobs.removeValue(forKey: id) else { return }
                    job.call.resolve(["text": text])
                } catch {
                    self.recordTestResult("Native generation error: \(error)")
                    guard let job = self.jobs.removeValue(forKey: id) else { return }
                    job.call.reject("On-device briefing could not complete.", Task.isCancelled ? "CANCELLED" : "GENERATION_FAILED")
                }
            }
            jobs[id] = (task, call)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        let id = call.getString("requestId") ?? ""
        DispatchQueue.main.async { [self] in
            cancelJob(id)
            call.resolve()
        }
    }

    private func cancelJob(_ id: String) {
        guard let job = self.jobs.removeValue(forKey: id) else { return }
        job.task.cancel()
        job.call.reject("The briefing was cancelled.", "CANCELLED")
    }

    private func recordTestResult(_ result: String) {
        #if DEBUG
        if ProcessInfo.processInfo.environment["EIGHTBIT_UI_TEST_SEED"] != nil {
            // Synthetic evaluation only; no model output is logged by production.
            UserDefaults.standard.set(result, forKey: "EIGHTBIT_UI_TEST_APPLE_RESULT")
        }
        #endif
    }

    @objc private func stopForBackground() {
        DispatchQueue.main.async { [self] in
            for id in Array(jobs.keys) { cancelJob(id) }
        }
    }
}
