import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  outputDir: '/tmp/8bit-weather-test-results',
  fullyParallel: true,
  workers: 3,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4177', locale: 'en-US', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: { command: 'npm run preview -- --port 4177 --strictPort', url: 'http://127.0.0.1:4177', reuseExistingServer: false, timeout: 30000 },
});
