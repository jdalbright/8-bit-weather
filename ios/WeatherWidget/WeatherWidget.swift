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
    @Environment(\.widgetFamily) private var family
    let entry: WeatherEntry
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

@main
struct EightBitWeatherWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetWeatherStore.kind, provider: WeatherProvider()) { WeatherWidgetView(entry: $0) }
            .configurationDisplayName("8-Bit Weather")
            .description("Your selected place, its little landscape, and the latest saved weather.")
            .supportedFamilies([.systemSmall, .systemMedium])
            .contentMarginsDisabled()
    }
}

#Preview(as: .systemSmall) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }
#Preview(as: .systemMedium) { EightBitWeatherWidget() } timeline: { WeatherEntry.preview }
