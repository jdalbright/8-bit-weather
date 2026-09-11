import CoreGraphics
import SwiftUI
import WidgetKit

struct WeatherEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload?
    var refreshFailed = false

    var isStale: Bool { refreshFailed || payload?.weather?.isStale(at: date) == true }

    static var preview: WeatherEntry {
        let now = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        return WeatherEntry(date: now, payload: WidgetPayload(
            version: 1,
            place: WidgetPlace(id: "raleigh-preview", name: "Raleigh", latitude: 35.7796, longitude: -78.6382),
            units: "imperial",
            weather: WidgetForecast(version: 1, placeId: "raleigh-preview", latitude: 35.7796, longitude: -78.6382,
                                    timezone: "America/New_York", fetchedAt: now.timeIntervalSince1970 * 1000,
                                    current: WidgetCurrent(time: now.timeIntervalSince1970, temperature: 24, code: 2, isDay: true),
                                    daily: [WidgetDay(date: formatter.string(from: now), high: 27, low: 18)]),
            landscape: "raleigh", updatedAt: now.timeIntervalSince1970 * 1000))
    }
}

struct WeatherProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeatherEntry { .preview }

    func getSnapshot(in context: Context, completion: @escaping (WeatherEntry) -> Void) {
        completion(context.isPreview ? .preview : WeatherEntry(date: Date(), payload: WidgetWeatherStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeatherEntry>) -> Void) {
        Task {
            var payload = WidgetWeatherStore.read()
            var failed = false
            if let selected = payload?.place {
                let fetchedAt = payload?.weather?.fetchedAt ?? 0
                let age = Date().timeIntervalSince1970 - fetchedAt / 1000
                if payload?.weather == nil || age < 0 || age >= 15 * 60 {
                    do {
                        let forecast = try await WidgetWeatherClient.fetch(for: selected)
                        try WidgetWeatherStore.writeRefresh(forecast, for: selected)
                    } catch { failed = true }
                    // The app can change its selection during the network request.
                    payload = WidgetWeatherStore.read()
                }
            }
            let now = Date()
            let dates = payload?.weather?.timelineDates(from: now) ?? [now]
            // A predated stale entry stays truthful even when iOS delays a reload.
            let entries = dates.sorted().map { WeatherEntry(date: $0, payload: payload, refreshFailed: failed) }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
        }
    }
}

struct WeatherWidgetView: View {
    let entry: WeatherEntry
    let family: WidgetFamily
    private var isMedium: Bool { family == .systemMedium }

    var body: some View {
        Group {
            if let payload = entry.payload, let place = payload.place {
                forecast(payload, place: place)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("8-BIT WEATHER").font(.system(size: 11, weight: .bold, design: .monospaced))
                    Spacer(minLength: 0)
                    Text("Your little\nweather world.").font(.system(size: 19, weight: .bold, design: .rounded))
                    Text("Open the app to choose a place.").font(.system(size: 11, weight: .medium))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(isMedium ? 16 : 13)
        .foregroundStyle(.white)
        .widgetURL(entry.payload?.place?.deepLink ?? URL(string: "eightbitweather://place"))
        .containerBackground(for: .widget) { landscape }
    }

    private func forecast(_ payload: WidgetPayload, place: WidgetPlace) -> some View {
        VStack(alignment: .leading, spacing: isMedium ? 5 : 3) {
            Text(place.name)
                .font(.system(size: isMedium ? 17 : 14, weight: .bold, design: .rounded))
                .lineLimit(1).minimumScaleFactor(0.65)
            if let weather = payload.weather {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(payload.temperature(weather.current.temperature))
                        .font(.system(size: isMedium ? 43 : 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    Text(payload.units == "imperial" ? "F" : "C")
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                }
                Text(payload.condition)
                    .font(.system(size: isMedium ? 13 : 11, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.7)
                let day = weather.day(at: entry.date)
                Text("H:\(payload.temperature(day?.high))  L:\(payload.temperature(day?.low))")
                    .font(.system(size: isMedium ? 12 : 11, weight: .medium, design: .monospaced))
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    if entry.isStale { Image(systemName: "clock.arrow.circlepath").accessibilityHidden(true) }
                    Text(entry.isStale ? "Saved" : "Updated")
                    Text(Date(timeIntervalSince1970: weather.fetchedAt / 1000), style: .relative)
                        .lineLimit(1)
                }
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .opacity(0.9)
            } else {
                Spacer(minLength: 0)
                Text("Weather on its way")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                Text("Open the app to refresh.").font(.system(size: 11))
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.trailing, isMedium ? 105 : 0)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens \(place.name) in 8-Bit Weather")
    }

    private var landscape: some View {
        GeometryReader { geometry in
            Image(entry.payload?.artworkName ?? "meadow-day")
                .resizable().interpolation(.none).scaledToFill()
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottom)
                .clipped()
                .overlay {
                    LinearGradient(colors: [.black.opacity(isMedium ? 0.82 : 0.69), .black.opacity(isMedium ? 0.12 : 0.50)],
                                   startPoint: .leading, endPoint: .trailing)
                }
                .overlay(alignment: .bottomTrailing) {
                    if isMedium {
                        Text("8-BIT WEATHER").font(.system(size: 8, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white).shadow(color: .black, radius: 2)
                            .padding(12)
                    }
                }
        }
        .accessibilityHidden(true)
    }
}

struct WeatherWidgetRoot: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeatherEntry
    var body: some View {
        switch family {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline:
            AccessoryWeatherView(entry: entry, family: family)
        default: WeatherWidgetView(entry: entry, family: family)
        }
    }
}

private enum PixelWeatherArtwork {
    // Small, crisp template images also work in WidgetKit's inline Label renderer.
    static let patterns: [String: [String]] = [
        "sun": ["000010000", "010000010", "000111000", "001111100", "101111101", "001111100", "000111000", "010000010", "000010000"],
        "moon": ["000111000", "001110000", "011100000", "111000000", "111000000", "111100010", "011111110", "001111100", "000111000"],
        "cloud": ["000000000", "000111000", "001111100", "011111110", "111111111", "111111111", "011111110", "000000000", "000000000"],
        "fog": ["000111000", "001111100", "011111110", "111111111", "000000000", "011111100", "000000000", "001111110", "000000000"],
        "rain": ["000111000", "001111100", "011111110", "111111111", "000000000", "001001010", "010010100", "000000000", "010010100"],
        "snow": ["000111000", "001111100", "011111110", "111111111", "000000000", "010010010", "111111111", "010010010", "000000000"],
        "storm": ["000111000", "001111100", "011111110", "111111111", "000011000", "000110000", "001111000", "000110000", "001100000"],
        "unknown": ["000111000", "001000100", "000000100", "000001000", "000010000", "000010000", "000000000", "000010000", "000000000"]
    ]
    static let images: [String: CGImage] = patterns.compactMapValues { rows in
        guard let context = CGContext(data: nil, width: 9, height: 9, bitsPerComponent: 8, bytesPerRow: 36,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        for (y, row) in rows.enumerated() {
            for (x, pixel) in row.enumerated() where pixel == "1" {
                context.fill(CGRect(x: x, y: 8 - y, width: 1, height: 1))
            }
        }
        return context.makeImage()
    }
    static func image(_ symbol: String) -> Image {
        guard let cgImage = images[symbol] else { return Image(systemName: "questionmark") }
        return Image(decorative: cgImage, scale: 0.5).renderingMode(.template)
    }
}

struct AccessoryWeatherView: View {
    @Environment(\.isLuminanceReduced) private var dimmed
    @Environment(\.redactionReasons) private var redactionReasons
    let entry: WeatherEntry
    let family: WidgetFamily
    private var payload: WidgetPayload? { entry.payload }
    private var hasWeather: Bool { payload?.place != nil && payload?.weather != nil }
    private var temperature: String { payload?.temperature(payload?.weather?.current.temperature) ?? "—" }
    private var city: String { payload?.place?.name ?? "8-Bit Weather" }
    private var symbol: Image { PixelWeatherArtwork.image(payload?.accessorySymbol ?? "unknown") }
    private var accessibilitySummary: String {
        if redactionReasons.contains(.privacy) { return "Weather hidden while locked." }
        guard let payload, let place = payload.place else { return "8-Bit Weather. Open the app to choose a place." }
        guard let weather = payload.weather else { return "\(place.name). Weather unavailable. Open the app to refresh." }
        let day = weather.day(at: entry.date)
        return "\(place.name). \(entry.isStale ? "Saved weather. " : "")\(temperature) \(payload.units == "imperial" ? "Fahrenheit" : "Celsius"). \(payload.condition). High \(payload.temperature(day?.high)), low \(payload.temperature(day?.low))."
    }
    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Label {
                    Text(hasWeather ? "\(entry.isStale ? "Saved · " : "")\(temperature) · \(city)" : "\(city) · Open app")
                } icon: { if entry.isStale { Image(systemName: "clock.arrow.circlepath") } else { symbol } }
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 2) {
                        HStack(spacing: 2) {
                            symbol.resizable().interpolation(.none).frame(width: 18, height: 18)
                            if entry.isStale { Image(systemName: "clock.arrow.circlepath").font(.system(size: 8)) }
                        }
                        Text(temperature).font(.system(size: 21, weight: .semibold, design: .rounded)).monospacedDigit()
                            .minimumScaleFactor(0.6).lineLimit(1)
                    }.padding(4)
                }
            default:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 3) {
                        if entry.isStale { Image(systemName: "clock.arrow.circlepath") }
                        Text(city).fontWeight(.semibold).lineLimit(1)
                    }
                    if hasWeather {
                        HStack(spacing: 4) {
                            symbol.resizable().interpolation(.none).frame(width: 16, height: 16)
                            Text("\(temperature) \(payload?.condition ?? "Unavailable")").lineLimit(1)
                        }
                        let day = payload?.weather?.day(at: entry.date)
                        Text("\(entry.isStale ? "Saved · " : "")H:\(payload?.temperature(day?.high) ?? "—") L:\(payload?.temperature(day?.low) ?? "—")")
                            .lineLimit(1).minimumScaleFactor(0.75)
                    } else { Text(payload?.place == nil ? "Open app to choose a place" : "Open app to refresh").lineLimit(2) }
                }.font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .foregroundStyle(.primary)
        .opacity(dimmed ? 0.9 : 1)
        .privacySensitive()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint("Opens weather in 8-Bit Weather")
        .widgetURL(payload?.place?.deepLink ?? URL(string: "eightbitweather://place"))
        .containerBackground(for: .widget) { Color.clear }
    }
}

@main
struct EightBitWeatherWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetWeatherStore.kind, provider: WeatherProvider()) { WeatherWidgetRoot(entry: $0) }
            .configurationDisplayName("8-Bit Weather")
            .description("Your selected place and latest saved weather, on your Home Screen or Lock Screen.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
            .contentMarginsDisabled()
    }
}

#Preview(as: .systemSmall) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }
#Preview(as: .systemMedium) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }

#Preview(as: .accessoryCircular) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }
#Preview(as: .accessoryRectangular) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }
#Preview(as: .accessoryInline) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }
