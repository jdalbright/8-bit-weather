import Foundation

enum WidgetWeatherClient {
    static func url(for place: WidgetPlace) throws -> URL {
        guard place.valid else { throw WidgetWeatherError.invalidPayload }
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        components.queryItems = [
            .init(name: "latitude", value: String(place.latitude)),
            .init(name: "longitude", value: String(place.longitude)),
            .init(name: "current", value: "temperature_2m,weather_code,is_day"),
            .init(name: "daily", value: "temperature_2m_max,temperature_2m_min"),
            .init(name: "temperature_unit", value: "celsius"),
            .init(name: "timezone", value: "auto"),
            .init(name: "timeformat", value: "unixtime"),
            .init(name: "forecast_days", value: "2")
        ]
        guard let url = components.url else { throw WidgetWeatherError.invalidPayload }
        return url
    }

    static func fetch(for place: WidgetPlace, session: URLSession = .shared) async throws -> WidgetForecast {
        var request = URLRequest(url: try url(for: place))
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200,
              data.count <= 200_000 else { throw WidgetWeatherError.invalidResponse }
        return try parse(data, for: place, now: Date())
    }

    static func parse(_ data: Data, for place: WidgetPlace, now: Date) throws -> WidgetForecast {
        struct Response: Decodable {
            struct Current: Decodable { let time: Double; let temperature_2m: Double?; let weather_code: Int?; let is_day: Int }
            struct Daily: Decodable { let time: [Double]; let temperature_2m_max: [Double?]; let temperature_2m_min: [Double?] }
            let timezone: String
            let utc_offset_seconds: Double
            let current: Current
            let daily: Daily
        }
        let response = try JSONDecoder().decode(Response.self, from: data)
        guard place.valid, TimeZone(identifier: response.timezone) != nil,
              response.current.time.isFinite, (0...40_000_000_000).contains(response.current.time),
              response.utc_offset_seconds.isFinite, abs(response.utc_offset_seconds) <= 24 * 3600,
              response.current.is_day == 0 || response.current.is_day == 1,
              !response.daily.time.isEmpty,
              response.daily.time.allSatisfy({ $0.isFinite && (0...40_000_000_000).contains($0) }),
              response.daily.time.count == response.daily.temperature_2m_max.count,
              response.daily.time.count == response.daily.temperature_2m_min.count else { throw WidgetWeatherError.invalidResponse }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        let days = response.daily.time.enumerated().map { index, time in
            // Open-Meteo daily Unix timestamps use its fixed utc_offset_seconds.
            WidgetDay(date: formatter.string(from: Date(timeIntervalSince1970: time + response.utc_offset_seconds)),
                      high: response.daily.temperature_2m_max[index], low: response.daily.temperature_2m_min[index])
        }
        return WidgetForecast(version: 1, placeId: place.id, latitude: place.latitude, longitude: place.longitude,
                              timezone: response.timezone, fetchedAt: now.timeIntervalSince1970 * 1000,
                              current: WidgetCurrent(time: response.current.time, temperature: response.current.temperature_2m,
                                                     code: response.current.weather_code, isDay: response.current.is_day == 1), daily: days)
    }
}
