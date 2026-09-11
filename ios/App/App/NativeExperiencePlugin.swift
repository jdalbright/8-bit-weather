import Capacitor
import UIKit
import CoreHaptics

/// Foreground-only tactile feedback and event-driven power awareness; no battery polling.
@objc(NativeExperiencePlugin)
public final class NativeExperiencePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeExperiencePlugin"
    public let jsName = "NativeExperience"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setHapticsEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "triggerHaptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPowerState", returnType: CAPPluginReturnPromise)
    ]
    private var hapticsEnabled = false
    private var observers: [NSObjectProtocol] = []
    private var selection: UISelectionFeedbackGenerator?
    private var impacts: [String: UIImpactFeedbackGenerator] = [:]
    private var notification: UINotificationFeedbackGenerator?
    private var hapticEngine: CHHapticEngine?
    private var ripplePlayer: CHHapticPatternPlayer?
    private let impactStyles: [String: UIImpactFeedbackGenerator.FeedbackStyle] = [
        "light": .light, "medium": .medium, "heavy": .heavy, "soft": .soft, "rigid": .rigid
    ]

    public override func load() {
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification,
                                                                object: nil, queue: .main) { [weak self] _ in
            self?.stopCustomHaptics()
        })
        for name in [Notification.Name.NSProcessInfoPowerStateDidChange,
                     ProcessInfo.thermalStateDidChangeNotification,
                     UIApplication.didBecomeActiveNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                self.notifyListeners("powerStateChanged", data: self.powerState())
            })
        }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }

    private func powerState() -> [String: Any] {
        let process = ProcessInfo.processInfo
        let thermal: String
        switch process.thermalState {
        case .nominal: thermal = "nominal"
        case .fair: thermal = "fair"
        case .serious: thermal = "serious"
        case .critical: thermal = "critical"
        @unknown default: thermal = "serious"
        }
        return ["lowPowerMode": process.isLowPowerModeEnabled, "thermalState": thermal]
    }
    @objc func getPowerState(_ call: CAPPluginCall) { call.resolve(powerState()) }
    @objc func setHapticsEnabled(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else { call.reject("A boolean is required.", "INVALID_ARGUMENT"); return }
        DispatchQueue.main.async { [weak self] in
            self?.hapticsEnabled = enabled
            if !enabled { self?.stopCustomHaptics() }
            call.resolve()
        }
    }
    @objc func triggerHaptic(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        let style = call.getString("style") ?? "light"
        let outcome = call.getString("type") ?? ""
        let name = call.getString("name") ?? ""
        guard kind == "selection" || (kind == "impact" && impactStyles[style] != nil)
                || (kind == "notification" && ["success", "warning", "error"].contains(outcome))
                || (kind == "pattern" && name == "waterRipple") else {
            call.reject("Unknown feedback type.", "INVALID_ARGUMENT"); return
        }
        let requestedAt = ProcessInfo.processInfo.systemUptime
        DispatchQueue.main.async { [weak self] in
            guard let self, self.hapticsEnabled, UIApplication.shared.applicationState == .active,
                  ProcessInfo.processInfo.systemUptime - requestedAt < 0.25 else { call.resolve(); return }
            switch kind {
            case "selection":
                if self.selection == nil { self.selection = UISelectionFeedbackGenerator() }
                self.selection?.selectionChanged()
            case "impact": self.playImpact(style)
            case "notification":
                if self.notification == nil { self.notification = UINotificationFeedbackGenerator() }
                self.notification?.notificationOccurred(outcome == "success" ? .success : outcome == "warning" ? .warning : .error)
            case "pattern": self.playWaterRipple(requestedAt: requestedAt)
            default: break
            }
            call.resolve()
        }
    }

    private func playImpact(_ style: String) {
        guard let feedbackStyle = impactStyles[style] else { return }
        if impacts[style] == nil { impacts[style] = UIImpactFeedbackGenerator(style: feedbackStyle) }
        impacts[style]?.impactOccurred(intensity: 0.6)
    }

    private func stopCustomHaptics() {
        try? ripplePlayer?.stop(atTime: CHHapticTimeImmediate)
        ripplePlayer = nil
        let engine = hapticEngine
        hapticEngine = nil
        engine?.stop(completionHandler: nil)
    }

    private func playWaterRipple(requestedAt: TimeInterval) {
        try? ripplePlayer?.stop(atTime: CHHapticTimeImmediate)
        ripplePlayer = nil
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { playImpact("soft"); return }
        do {
            let engine: CHHapticEngine
            if let existing = hapticEngine { engine = existing }
            else {
                engine = try CHHapticEngine()
                engine.playsHapticsOnly = true
                engine.isAutoShutdownEnabled = true
                // Engine callbacks may arrive off-main. Ignore callbacks from a retired engine.
                // start() below handles idle/interrupt stops. Retain the player so a late
                // stop callback cannot discard a newer ripple's cancellation handle.
                engine.stoppedHandler = { _ in }
                engine.resetHandler = { [weak self, weak engine] in
                    DispatchQueue.main.async {
                        guard let self, let engine, self.hapticEngine === engine else { return }
                        self.stopCustomHaptics()
                    }
                }
                hapticEngine = engine
            }
            // Restart after idle shutdown or interruption; only a new touch starts playback.
            try engine.start()
            guard hapticsEnabled, UIApplication.shared.applicationState == .active,
                  ProcessInfo.processInfo.systemUptime - requestedAt < 0.25 else { return }
            let events = zip([0.0, 0.08, 0.18], [Float(0.45), 0.28, 0.12]).map { time, intensity in
                CHHapticEvent(eventType: .hapticTransient, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.15)
                ], relativeTime: time)
            }
            let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameters: []))
            ripplePlayer = player
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            stopCustomHaptics()
            if hapticsEnabled && UIApplication.shared.applicationState == .active
                && ProcessInfo.processInfo.systemUptime - requestedAt < 0.25 { playImpact("soft") }
        }
    }
}
