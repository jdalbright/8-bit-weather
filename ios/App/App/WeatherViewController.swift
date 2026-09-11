import AVFoundation
import Capacitor
import UIKit
import WebKit

/// The web app owns its screens; this host registers the small native integration surface.
final class WeatherViewController: CAPBridgeViewController {
    #if DEBUG
    /// Simulator UI tests can seed only this app's weather keys and emulate network loss.
    /// These hooks are compiled out of Release and are never enabled by web content.
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let environment = ProcessInfo.processInfo.environment
        if let json = environment["EIGHTBIT_UI_TEST_SEED"], let data = json.data(using: .utf8),
           data.count < 100_000, let values = try? JSONDecoder().decode([String: String].self, from: data) {
            for (key, value) in values where key.hasPrefix("CapacitorStorage.8bit-weather:") {
                UserDefaults.standard.set(value, forKey: key)
            }
        }
        if environment["EIGHTBIT_UI_TEST_OFFLINE"] == "true" {
            let script = """
            Object.defineProperty(navigator, 'onLine', {get: () => false, configurable: false});
            window.fetch = () => Promise.reject(new TypeError('Simulated offline network for native UI testing'));
            """
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if environment["EIGHTBIT_UI_TEST_BRIEFING_PROBE"] == "true" {
            // Exercise real Capacitor registration and Swift availability guards,
            // without requesting model inference or making a cloud request.
            let script = """
            window.addEventListener('load', async () => {
              const result = document.createElement('p');
              result.id = 'native-briefing-probe';
              result.style.cssText = 'position:fixed;top:80px;left:10px;z-index:9999;background:white;color:black';
              document.body.appendChild(result);
              try {
                const plugin = window.Capacitor.Plugins.AppleBriefing;
                const status = await plugin.availability();
                if (typeof status.available !== 'boolean') throw new Error('Invalid availability');
                await plugin.cancel({requestId: crypto.randomUUID()});
                let code = '';
                try { await plugin.generate({requestId: 'invalid'}); } catch (error) { code = error.code; }
                if (code !== 'INVALID_REQUEST') throw new Error('Invalid validation');
                if (status.reason === 'requires_ios27') {
                  code = '';
                  try { await plugin.generate({requestId: crypto.randomUUID(), facts: '{}', instructions: 'Summarize weather.'}); }
                  catch (error) { code = error.code; }
                  if (code !== 'UNAVAILABLE') throw new Error('Older OS allowed generation');
                }
                result.textContent = 'Native briefing bridge passed: ' + (status.available ? 'available' : status.reason);
              } catch (error) { result.textContent = 'Native briefing bridge failed: ' + error.message; }
            });
            """
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        return super.webView(with: frame, configuration: configuration)
    }
    #endif

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WeatherWidgetPlugin())
        bridge?.registerPluginInstance(AppleBriefingPlugin())
        // Ambient audio respects the silent switch and mixes with a user's other audio.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: .mixWithOthers)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
}
