import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const useLocalServer = !process.env.TEST_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  ...(useLocalServer
    ? {
        webServer: {
          command: 'npm run start',
          url: `${baseURL}/login`,
          // Never reuse a local server for tests: its database environment may
          // differ from the environment selected for this test run.
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }
    : {}),
  use: {
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': '10.250.0.10' },
    launchOptions: { headless: process.env.HEADED !== 'true' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
