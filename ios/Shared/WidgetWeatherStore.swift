import Foundation
import Darwin

enum WidgetWeatherStore {
    static let group = "group.app.eightbitweather.shared"
    static let kind = "EightBitWeatherWidget"
    static let selectionFilename = "weather-widget-v1.json"
    static let refreshFilename = "weather-widget-refresh-v1.json"

    static func container() throws -> URL {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
        else { throw WidgetWeatherError.unavailableContainer }
        return url
    }

    static func write(payloadData: Data) throws {
        try write(payloadData: payloadData, directory: container())
    }

    static func write(payloadData: Data, directory: URL) throws {
        guard payloadData.count <= 1_000_000 else { throw WidgetWeatherError.invalidPayload }
        let value = try JSONDecoder().decode(WidgetPayload.self, from: payloadData).validated()
        try withLock(directory: directory) {
            try writeData(JSONEncoder().encode(value), to: directory.appendingPathComponent(selectionFilename))
        }
    }

    static func read() -> WidgetPayload? {
        guard let directory = try? container() else { return nil }
        return read(directory: directory)
    }

    static func read(directory: URL) -> WidgetPayload? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(selectionFilename)),
              var selection = try? JSONDecoder().decode(WidgetPayload.self, from: data).validated() else { return nil }
        if let place = selection.place,
           let refreshedData = try? Data(contentsOf: directory.appendingPathComponent(refreshFilename)),
           let refreshed = try? JSONDecoder().decode(WidgetForecast.self, from: refreshedData),
           refreshed.matches(place), refreshed.fetchedAt >= (selection.weather?.fetchedAt ?? 0) {
            selection.weather = refreshed
        }
        return selection
    }

    static func writeRefresh(_ forecast: WidgetForecast, for place: WidgetPlace) throws {
        try writeRefresh(forecast, for: place, directory: container())
    }

    static func writeRefresh(_ forecast: WidgetForecast, for place: WidgetPlace, directory: URL) throws {
        guard forecast.matches(place) else { throw WidgetWeatherError.invalidPayload }
        try withLock(directory: directory) {
            // Coordinate with app clear/write across processes so the check and write
            // cannot repopulate personal data after a simultaneous clear operation.
            guard let selection = read(directory: directory), let selectedPlace = selection.place,
                  selectedPlace.matches(place), forecast.fetchedAt >= (selection.weather?.fetchedAt ?? 0) else { return }
            // This separate file cannot overwrite a simultaneous app place/unit change.
            try writeData(JSONEncoder().encode(forecast), to: directory.appendingPathComponent(refreshFilename))
        }
    }

    static func clear() throws { try clear(directory: container()) }

    static func clear(directory: URL) throws {
        try withLock(directory: directory) {
            for filename in [selectionFilename, refreshFilename] {
                let url = directory.appendingPathComponent(filename)
                if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
            }
        }
    }

    private static func withLock(directory: URL, operation: () throws -> Void) throws {
        let descriptor = open(directory.appendingPathComponent(".weather-widget.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw WidgetWeatherError.unavailableContainer }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw WidgetWeatherError.unavailableContainer }
        defer { flock(descriptor, LOCK_UN) }
        try operation()
    }

    private static func writeData(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
        #if os(iOS)
        // Home-screen refresh remains available after first unlock, including while locked.
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        #endif
    }
}
