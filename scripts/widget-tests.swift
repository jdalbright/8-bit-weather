import Foundation

private final class OfflineWeatherProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    override func stopLoading() { }
}

private final class RateLimitedWeatherProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: "HTTP/1.1", headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}

@main
struct WidgetTests {
    static func main() async throws {
        var checks = 0
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            precondition(value(), message)
            checks += 1
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let now = Date(timeIntervalSince1970: 1_789_060_000)
        let place = WidgetPlace(id: "gps:35.77,-78.63&name=Raleigh + town/é", name: "Raleigh", latitude: 35.7796, longitude: -78.6382)
        let raw = Data(#"{"timezone":"America/New_York","utc_offset_seconds":-14400,"current":{"time":1789060000,"temperature_2m":24,"weather_code":2,"is_day":1},"daily":{"time":[1789012800,1789099200],"temperature_2m_max":[27,28],"temperature_2m_min":[18,19]}}"#.utf8)
        let forecast = try WidgetWeatherClient.parse(raw, for: place, now: now)
        var payload = WidgetPayload(version: 1, place: place, units: "imperial", weather: forecast, landscape: "raleigh", updatedAt: now.timeIntervalSince1970 * 1000)
        check(forecast.current.temperature == 24, "Provider storage remains Celsius")
        check(payload.temperature(24) == "75°", "Convert canonical temperature to Fahrenheit")
        payload.units = "metric"
        check(payload.temperature(-1.5) == "-1°", "Round negative halves like shared JavaScript")
        check(payload.temperature(nil) == "—", "Unknown temperature must not become zero")
        check(payload.temperature(1e100) == "—", "Malformed finite temperatures cannot overflow Int")
        check(forecast.day(at: now)?.high == 27, "Use location-local day for high/low")
        check(forecast.day(at: now.addingTimeInterval(10 * 86400)) == nil, "Do not reuse old high/low on future dates")
        check(!forecast.isStale(at: now.addingTimeInterval(44 * 60)), "Cache is fresh before threshold")
        check(forecast.isStale(at: now.addingTimeInterval(45 * 60)), "Cache becomes stale without a network request")
        check(forecast.isStale(at: now.addingTimeInterval(-1)), "Clock rollback must not make cache fresh")
        let timeline = forecast.timelineDates(from: now)
        check(timeline.first == now && timeline == timeline.sorted(), "Timeline entries start now and are ordered")
        check(timeline.contains(forecast.staleDate), "Timeline predates staleness without needing a refresh")
        check(forecast.day(at: timeline.last!) == nil, "Timeline expires high/low after final cached day")
        var corrupt = forecast
        corrupt.current.temperature = 1e100
        check(!corrupt.matches(place), "Reject corrupt forecast temperature")
        corrupt = forecast
        corrupt.daily[0].high = 1e100
        check(!corrupt.matches(place), "Reject corrupt high temperature")
        corrupt = forecast
        corrupt.latitude = 1000
        check(!corrupt.matches(place), "Reject out-of-range forecast coordinates")
        corrupt = forecast
        corrupt.current.time += 3600
        check(corrupt.isStale(at: now), "Future observation does not appear current")
        check(payload.artworkName == "raleigh-day", "Regional daytime artwork")
        payload.weather?.current.code = 61
        check(payload.artworkName == "raleigh-overcast" && payload.condition == "Light rain", "WMO rain label and artwork")
        payload.weather?.current.isDay = false
        check(payload.artworkName == "raleigh-night", "Night overrides precipitation artwork")
        payload.weather = forecast
        let deepLink = URLComponents(url: place.deepLink!, resolvingAgainstBaseURL: false)!
        check(deepLink.scheme == "eightbitweather" && deepLink.host == "place", "Deep link routes to place")
        check(deepLink.queryItems?.first?.value == place.id, "Deep link safely round-trips reserved characters")
        let request = URLComponents(url: try WidgetWeatherClient.url(for: place), resolvingAgainstBaseURL: false)!
        check(request.host == "api.open-meteo.com" && request.scheme == "https", "Refresh uses fixed HTTPS provider")
        check(request.queryItems?.contains(where: { $0.name == "temperature_unit" && $0.value == "celsius" }) == true, "Refresh requests canonical Celsius")
        try WidgetWeatherStore.write(payloadData: JSONEncoder().encode(payload), directory: directory)
        check(WidgetWeatherStore.read(directory: directory)?.place == place, "Durable selection survives a new read")
        var refresh = forecast
        refresh.fetchedAt += 300_000
        refresh.current.temperature = 26
        try WidgetWeatherStore.writeRefresh(refresh, for: place, directory: directory)
        check(WidgetWeatherStore.read(directory: directory)?.weather?.current.temperature == 26, "New widget forecast replaces older app cache")
        check(WidgetWeatherStore.read(directory: directory)?.units == "metric", "Widget refresh preserves app units")
        let offlineConfig = URLSessionConfiguration.ephemeral
        offlineConfig.protocolClasses = [OfflineWeatherProtocol.self]
        let offlineSession = URLSession(configuration: offlineConfig)
        defer { offlineSession.invalidateAndCancel() }
        do { _ = try await WidgetWeatherClient.fetch(for: place, session: offlineSession); preconditionFailure("Expected offline fetch failure") }
        catch { check((error as? URLError)?.code == .notConnectedToInternet, "Offline request reports failure without inventing weather") }
        check(WidgetWeatherStore.read(directory: directory)?.weather?.current.temperature == 26, "Offline fetch leaves last good cache available")
        let limitedConfig = URLSessionConfiguration.ephemeral
        limitedConfig.protocolClasses = [RateLimitedWeatherProtocol.self]
        let limitedSession = URLSession(configuration: limitedConfig)
        defer { limitedSession.invalidateAndCancel() }
        do { _ = try await WidgetWeatherClient.fetch(for: place, session: limitedSession); preconditionFailure("Expected rate limit rejection") }
        catch { check(error is WidgetWeatherError, "HTTP rate limit does not become weather") }
        try WidgetWeatherStore.writeRefresh(forecast, for: place, directory: directory)
        check(WidgetWeatherStore.read(directory: directory)?.weather?.current.temperature == 26, "Late older refresh cannot roll back forecast")
        var another = place
        another.id = "asheville"
        another.latitude = 35.5951
        another.longitude = -82.5515
        payload.place = another
        payload.landscape = "blue-ridge"
        try WidgetWeatherStore.write(payloadData: JSONEncoder().encode(payload), directory: directory)
        check(WidgetWeatherStore.read(directory: directory)?.weather == nil, "Changing place never displays old city's weather")
        try WidgetWeatherStore.writeRefresh(refresh, for: place, directory: directory)
        check(WidgetWeatherStore.read(directory: directory)?.place == another, "In-flight refresh cannot change selected place")
        payload.place = place
        payload.weather = nil
        try WidgetWeatherStore.write(payloadData: JSONEncoder().encode(payload), directory: directory)
        check(WidgetWeatherStore.read(directory: directory)?.weather?.current.temperature == 26, "Returning to a place can use its matching cached refresh")
        let invalid = Data(#"{"version":9,"place":null,"units":"metric","weather":null,"landscape":"meadow","updatedAt":0}"#.utf8)
        do { try WidgetWeatherStore.write(payloadData: invalid, directory: directory); preconditionFailure("Expected invalid schema rejection") }
        catch { checks += 1 }
        check(WidgetWeatherStore.read(directory: directory)?.place == place, "Invalid bridge payload does not destroy valid cache")
        do { _ = try WidgetWeatherClient.parse(Data(#"{"timezone":"bogus","utc_offset_seconds":0,"current":{"time":1789060000,"temperature_2m":24,"weather_code":2,"is_day":1},"daily":{"time":[1789012800],"temperature_2m_max":[27],"temperature_2m_min":[18]}}"#.utf8), for: place, now: now); preconditionFailure("Expected invalid timezone rejection") }
        catch { checks += 1 }
        do { _ = try WidgetWeatherClient.parse(Data(#"{"timezone":"UTC","utc_offset_seconds":0,"current":{"time":1789060000,"temperature_2m":24,"weather_code":2,"is_day":1},"daily":{"time":[1789012800],"temperature_2m_max":[],"temperature_2m_min":[18]}}"#.utf8), for: place, now: now); preconditionFailure("Expected mismatched series rejection") }
        catch { checks += 1 }
        try WidgetWeatherStore.clear(directory: directory)
        check(WidgetWeatherStore.read(directory: directory) == nil, "Clear removes selection and cached weather")
        try WidgetWeatherStore.writeRefresh(refresh, for: place, directory: directory)
        check(!FileManager.default.fileExists(atPath: directory.appendingPathComponent(WidgetWeatherStore.refreshFilename).path), "Late fetch cannot restore cleared location data")
        if ProcessInfo.processInfo.environment["WIDGET_LIVE_TEST"] == "1" {
            let live = try await WidgetWeatherClient.fetch(for: place)
            check(live.matches(place) && !live.daily.isEmpty, "Live Open-Meteo refresh")
        }
        print("Passed \(checks) widget checks: provider parsing, freshness, units, artwork, deep links, durable cache, selection races, and clearing.")
    }
}
