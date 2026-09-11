import Foundation

// This is a deliberately narrow Codable projection of src/types.ts. All temperatures
// remain Celsius in storage; presentation alone converts the user's preferred units.
struct WidgetPlace: Codable, Equatable, Sendable {
    var id: String
    var name: String
    var latitude: Double
    var longitude: Double

    var valid: Bool {
        !id.isEmpty && id.count <= 512 && !name.isEmpty && name.count <= 512
            && latitude.isFinite && longitude.isFinite
            && abs(latitude) <= 90 && abs(longitude) <= 180
    }

    func matches(_ other: WidgetPlace) -> Bool {
        id == other.id && abs(latitude - other.latitude) < 0.001
            && abs(longitude - other.longitude) < 0.001
    }

    var deepLink: URL? {
        var url = URLComponents()
        url.scheme = "eightbitweather"
        url.host = "place"
        url.queryItems = [URLQueryItem(name: "id", value: id)]
        return url.url
    }
}

struct WidgetCurrent: Codable, Sendable {
    var time: Double
    var temperature: Double?
    var code: Int?
    var isDay: Bool
}

struct WidgetDay: Codable, Sendable {
    var date: String
    var high: Double?
    var low: Double?
}

struct WidgetForecast: Codable, Sendable {
    var version: Int
    var placeId: String
    var latitude: Double
    var longitude: Double
    var timezone: String
    var fetchedAt: Double
    var current: WidgetCurrent
    var daily: [WidgetDay]

    func matches(_ place: WidgetPlace) -> Bool {
        version == 1 && place.valid && placeId == place.id && latitude.isFinite && longitude.isFinite
            && abs(latitude) <= 90 && abs(longitude) <= 180 && abs(latitude - place.latitude) < 0.001
            && abs(longitude - place.longitude) < 0.001 && fetchedAt.isFinite
            && (0...40_000_000_000_000).contains(fetchedAt)
            && current.time.isFinite && (0...40_000_000_000).contains(current.time)
            && (current.temperature == nil || (current.temperature!.isFinite && abs(current.temperature!) < 1000))
            && daily.allSatisfy { day in
                (day.high == nil || (day.high!.isFinite && abs(day.high!) < 1000))
                    && (day.low == nil || (day.low!.isFinite && abs(day.low!) < 1000))
            }
            && TimeZone(identifier: timezone) != nil
    }

    func day(at date: Date) -> WidgetDay? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timezone)
        formatter.dateFormat = "yyyy-MM-dd"
        return daily.first { $0.date == formatter.string(from: date) }
    }

    var staleDate: Date {
        // Matches shared web rules: 45-minute cache age or 60-minute observation age.
        Date(timeIntervalSince1970: min(fetchedAt / 1000 + 45 * 60, current.time + 60 * 60))
    }

    func isStale(at date: Date) -> Bool {
        date.timeIntervalSince1970 < fetchedAt / 1000 || date.timeIntervalSince1970 < current.time || date >= staleDate
    }

    func timelineDates(from now: Date) -> [Date] {
        var dates = [now]
        if staleDate > now { dates.append(staleDate) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timezone) ?? .current
        // Include one date after the cached horizon: old high/low values disappear
        // even when iOS delays requesting another timeline for several days.
        for day in 1...min(9, max(2, daily.count + 1)) {
            if let midnight = calendar.date(byAdding: .day, value: day, to: calendar.startOfDay(for: now)) {
                dates.append(midnight)
            }
        }
        return Array(Set(dates)).sorted()
    }
}

struct WidgetPayload: Codable, Sendable {
    var version: Int
    var place: WidgetPlace?
    var units: String
    var weather: WidgetForecast?
    var landscape: String
    var updatedAt: Double

    static let landscapes: Set<String> = ["meadow", "raleigh", "beach", "coastal-plain", "piedmont", "blue-ridge"]

    func validated() throws -> WidgetPayload {
        guard version == 1, ["metric", "imperial"].contains(units),
              Self.landscapes.contains(landscape), updatedAt.isFinite,
              place == nil || place!.valid else { throw WidgetWeatherError.invalidPayload }
        var payload = self
        // Never display a previous city's weather beneath the new city's name.
        if let forecast = weather, let place, forecast.matches(place) { }
        else { payload.weather = nil }
        return payload
    }

    func temperature(_ celsius: Double?) -> String {
        guard let celsius, celsius.isFinite, abs(celsius) < 1000 else { return "—" }
        let value = units == "imperial" ? celsius * 9 / 5 + 32 : celsius
        // Match JavaScript Math.round, including negative halves.
        return "\(Int(floor(value + 0.5)))°"
    }

    var artworkName: String {
        let light: String
        if weather?.current.isDay == false { light = "night" }
        else if let code = weather?.current.code, code >= 3 { light = "overcast" }
        else { light = "day" }
        return "\(landscape)-\(light)"
    }

    /// Template artwork shared by all accessory families, including inline images.
    var accessorySymbol: String {
        guard let code = weather?.current.code else { return "unknown" }
        switch code {
        case 0, 1: return weather?.current.isDay == false ? "moon" : "sun"
        case 2, 3: return "cloud"
        case 45, 48: return "fog"
        case 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82: return "rain"
        case 71, 73, 75, 77, 85, 86: return "snow"
        case 95, 96, 99: return "storm"
        default: return "unknown"
        }
    }

    var condition: String {
        guard let code = weather?.current.code else { return "Conditions unavailable" }
        switch code {
        case 0: return weather?.current.isDay == false ? "Clear night" : "Clear skies"
        case 1: return weather?.current.isDay == false ? "Mostly clear" : "Mostly sunny"
        case 2: return "Partly cloudy"
        case 3: return "Overcast"
        case 45: return "Foggy"
        case 48: return "Freezing fog"
        case 51: return "Light drizzle"
        case 53: return "Drizzle"
        case 55: return "Heavy drizzle"
        case 56, 57: return "Freezing drizzle"
        case 61: return "Light rain"
        case 63: return "Rainy"
        case 65: return "Heavy rain"
        case 66, 67: return "Freezing rain"
        case 71: return "Light snow"
        case 73: return "Snowy"
        case 75: return "Heavy snow"
        case 77: return "Snow grains"
        case 80: return "Light showers"
        case 81: return "Rain showers"
        case 82: return "Heavy showers"
        case 85, 86: return "Snow showers"
        case 95: return "Thunderstorms"
        case 96, 99: return "Storms & hail"
        default: return "Conditions unavailable"
        }
    }
}

enum WidgetWeatherError: Error {
    case invalidPayload, unavailableContainer, invalidResponse
}
