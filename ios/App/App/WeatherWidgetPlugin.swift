import Capacitor
import Foundation
import WidgetKit

@objc(WeatherWidgetPlugin)
public final class WeatherWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WeatherWidgetPlugin"
    public let jsName = "WeatherWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        guard let json = call.getString("payload"), let data = json.data(using: .utf8), data.count <= 2_000_000 else {
            call.reject("A valid weather payload is required.", "INVALID_PAYLOAD")
            return
        }
        do {
            try WidgetWeatherStore.write(payloadData: data)
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetWeatherStore.kind)
            call.resolve()
        } catch {
            call.reject("Could not save shared widget weather.", "WIDGET_SAVE_FAILED", error)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        do {
            try WidgetWeatherStore.clear()
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetWeatherStore.kind)
            call.resolve()
        } catch {
            call.reject("Could not clear shared widget weather.", "WIDGET_CLEAR_FAILED", error)
        }
    }
}
