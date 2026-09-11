import Capacitor
import UIKit

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
    private var impact: UIImpactFeedbackGenerator?

    public override func load() {
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
            call.resolve()
        }
    }
    @objc func triggerHaptic(_ call: CAPPluginCall) {
        guard let kind = call.getString("kind"), ["selection", "impact"].contains(kind) else {
            call.reject("Unknown feedback type.", "INVALID_ARGUMENT"); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.hapticsEnabled, UIApplication.shared.applicationState == .active else { call.resolve(); return }
            if kind == "selection" {
                if self.selection == nil { self.selection = UISelectionFeedbackGenerator() }
                self.selection?.selectionChanged()
            } else {
                if self.impact == nil { self.impact = UIImpactFeedbackGenerator(style: .light) }
                self.impact?.impactOccurred(intensity: 0.6)
            }
            call.resolve()
        }
    }
}
