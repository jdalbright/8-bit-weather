import Foundation

enum WidgetWeatherClient {
    static func url(for place: WidgetPlace, section: String = "current") throws -> URL {
        guard place.valid, ["current", "forecast"].contains(section) else { throw WidgetWeatherError.invalidPayload }
        let endpoint = Bundle.main.object(forInfoDictionaryKey: "WeatherBackendURL") as? String
            ?? "https://8-bit-weather.vercel.app/api/weather"
        guard var components = URLComponents(string: endpoint), components.scheme == "https",
              components.host != nil, components.user == nil, components.password == nil,
              components.path == "/api/weather", components.query == nil, components.fragment == nil else { throw WidgetWeatherError.invalidPayload }
        components.queryItems = [
            .init(name: "latitude", value: String(format: "%.4f", locale: Locale(identifier: "en_US_POSIX"), place.latitude)),
            .init(name: "longitude", value: String(format: "%.4f", locale: Locale(identifier: "en_US_POSIX"), place.longitude)),
            .init(name: "section", value: section)
        ]
        guard let url = components.url else { throw WidgetWeatherError.invalidPayload }
        return url
    }

    static func fetch(for place: WidgetPlace, session: URLSession = .shared) async throws -> WidgetForecast {
        func load(_ section: String) async throws -> [String: Any] {
            var request = URLRequest(url: try url(for: place, section: section))
            request.timeoutInterval = 12
            let (data, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse, response.statusCode == 200, data.count <= 200_000,
                  let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["provider"] as? String == "xweather",
                  let latitude = object["latitude"] as? Double, let longitude = object["longitude"] as? Double,
                  abs(latitude-place.latitude) < 0.001, abs(longitude-place.longitude) < 0.001 else { throw WidgetWeatherError.invalidResponse }
            return object
        }
        var current = try await load("current")
        let forecast = try await load("forecast")
        guard let currentTime = current["updatedAt"] as? Double,
              let forecastTime = forecast["updatedAt"] as? Double else { throw WidgetWeatherError.invalidResponse }
        current["sectionTimes"] = ["current": currentTime, "forecast": forecastTime]
        current["daily"] = forecast["daily"]
        return try parse(JSONSerialization.data(withJSONObject: current), for: place, now: Date())
    }

    static func parse(_ data: Data, for place: WidgetPlace, now: Date) throws -> WidgetForecast {
        struct Response: Decodable {
            let provider: String
            let latitude: Double; let longitude: Double
            let timezone: String; let updatedAt: Double
            let current: WidgetCurrent; let daily: [WidgetDay]
            let sectionTimes: WidgetSectionTimes?
        }
        let response = try JSONDecoder().decode(Response.self, from: data)
        let result = WidgetForecast(version: 1, placeId: place.id, latitude: response.latitude, longitude: response.longitude,
                                    timezone: response.timezone, fetchedAt: response.updatedAt,
                                    current: response.current, daily: response.daily, provider: "xweather", sectionTimes: response.sectionTimes)
        guard response.provider == "xweather", result.matches(place), !result.daily.isEmpty,
              response.updatedAt <= now.timeIntervalSince1970 * 1000 + 60_000,
              (response.sectionTimes?.forecast ?? response.updatedAt) <= now.timeIntervalSince1970 * 1000 + 60_000,
              (response.sectionTimes?.current ?? response.updatedAt) <= now.timeIntervalSince1970 * 1000 + 60_000 else { throw WidgetWeatherError.invalidResponse }
        return result
    }
}
