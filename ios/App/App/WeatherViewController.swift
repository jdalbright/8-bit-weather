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
        // Capacitor defaults to bounces = false. Let UIKit own edge resistance.
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
        webView?.scrollView.showsVerticalScrollIndicator = false
        webView?.scrollView.showsHorizontalScrollIndicator = false
        bridge?.registerPluginInstance(NativeScrollPlugin())
        bridge?.registerPluginInstance(WeatherWidgetPlugin())
        bridge?.registerPluginInstance(AppleBriefingPlugin())
        // Ambient audio respects the silent switch and mixes with a user's other audio.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: .mixWithOthers)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
}

/// Native refresh shares UIScrollView's rubber-band gesture instead of cancelling
/// web touch events. It stays unavailable off Today or while a request is busy.
@objc(NativeScrollPlugin)
public final class NativeScrollPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeScrollPlugin"
    public let jsName = "NativeScroll"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]
    private let refreshControl = UIRefreshControl()
    private var enabled = false
    private var requestId = 0
    private var startedAt: CFTimeInterval = 0
    private var finishWork: DispatchWorkItem?
    private let refreshInk = UIColor(red: 116 / 255, green: 66 / 255, blue: 189 / 255, alpha: 1)

    public override func load() {
        refreshControl.tintColor = refreshInk
        refreshControl.backgroundColor = .clear
        // WKWebView's composited content can otherwise cover the native control.
        refreshControl.layer.zPosition = 1
        setTitle("Pull to refresh")
        refreshControl.addTarget(self, action: #selector(refresh), for: .valueChanged)
    }

    private func setTitle(_ title: String) {
        refreshControl.attributedTitle = NSAttributedString(string: title, attributes: [
            .font: UIFont.monospacedSystemFont(ofSize: 12, weight: .medium),
            .foregroundColor: refreshInk
        ])
    }

    @objc func configure(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let visible = call.getBool("visible") ?? false
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(); return }
            self.enabled = enabled
            if !visible {
                self.requestId += 1
                self.finishWork?.cancel()
                self.finishWork = nil
                self.refreshControl.endRefreshing()
                self.webView?.scrollView.refreshControl = nil
                self.setTitle("Pull to refresh")
                call.resolve()
                return
            }
            // Keep one control attached throughout Today. Replacing/removing it
            // as loading changes can disturb UIKit's animated content inset.
            if self.webView?.scrollView.refreshControl !== self.refreshControl {
                self.webView?.scrollView.refreshControl = self.refreshControl
            }
            self.refreshControl.isEnabled = enabled || self.refreshControl.isRefreshing
            self.refreshControl.isHidden = !enabled && !self.refreshControl.isRefreshing
            self.webView?.scrollView.bringSubviewToFront(self.refreshControl)
            call.resolve()
        }
    }

    @objc private func refresh() {
        guard enabled else { refreshControl.endRefreshing(); return }
        finishWork?.cancel()
        requestId += 1
        startedAt = CACurrentMediaTime()
        setTitle("Updating weather…")
        notifyListeners("refresh", data: ["requestId": requestId])
    }

    private func settleRefresh(requestId: Int) {
        guard requestId == self.requestId else { return }
        // A fast/cached result should not flash or collapse beneath a held finger.
        let remaining = max(0, 0.6 - (CACurrentMediaTime() - startedAt))
        if remaining > 0 || webView?.scrollView.isDragging == true {
            let work = DispatchWorkItem { [weak self] in self?.settleRefresh(requestId: requestId) }
            finishWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + max(remaining, 0.1), execute: work)
            return
        }
        refreshControl.endRefreshing()
        // Change the idle label only after the native spinner has folded away.
        let work = DispatchWorkItem { [weak self] in
            guard let self, requestId == self.requestId else { return }
            self.setTitle("Pull to refresh")
            self.refreshControl.isEnabled = self.enabled
            self.refreshControl.isHidden = !self.enabled
            self.finishWork = nil
        }
        finishWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    @objc func finish(_ call: CAPPluginCall) {
        let requestId = call.getInt("requestId")
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(); return }
            guard requestId == self.requestId else { call.resolve(); return }
            self.finishWork?.cancel()
            self.settleRefresh(requestId: self.requestId)
            call.resolve()
        }
    }
}
