#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/eightbit-widget-tests.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc -module-cache-path "$test_dir/module-cache" ios/Shared/WidgetWeather.swift ios/Shared/WidgetWeatherStore.swift ios/Shared/WidgetWeatherClient.swift scripts/widget-tests.swift -o "$test_dir/widget-tests"
"$test_dir/widget-tests"
