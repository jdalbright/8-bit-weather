import { defineConfig, devices } from '@playwright/test';

/** Native production assets, real browser engines, mocked Capacitor transport.
 * These tests do not replace Xcode simulator/device or WidgetKit verification. */
export default defineConfig({
  testDir: './native-tests',
  outputDir: '/tmp/8bit-weather-native-test-results',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', locale: 'en-US', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'native-chromium', use: { browserName: 'chromium' } },
    { name: 'native-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  // The fake cloud URL belongs only to this isolated browser-test build, never ios:sync.
  webServer: { command: 'VITE_NATIVE_WEATHER_URL=https://weather.example/api/weather VITE_NATIVE_BRIEFING_URL=https://weather.example/api/weather-briefing npx vite build --mode native --emptyOutDir --outDir /tmp/8bit-weather-native-browser-bundle && npx vite preview --host 127.0.0.1 --mode native --outDir /tmp/8bit-weather-native-browser-bundle --port 4178 --strictPort', url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 60000 },
});
