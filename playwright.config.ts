/**
 * playwright.config.ts
 *
 * HomeStream E2E test configuration.
 *
 * Runs against the Vite dev server (npm run dev) on port 5173.
 * All tests use Chromium headless by default.
 *
 * Usage:
 *   npm run test:e2e          — run all E2E tests
 *   npm run test:e2e:ui       — open Playwright UI
 *   npm run test:e2e:headed   — run with visible browser (debug)
 *   npm run test:e2e:report   — show last HTML report
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // All E2E tests live in e2e/
  testDir: './e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if test.only is accidentally left in
  forbidOnly: !!process.env.CI,

  // Retry once on CI to handle flaky network-dependent tests
  retries: process.env.CI ? 1 : 0,

  // Limit parallelism on CI
  workers: process.env.CI ? 2 : undefined,

  // HTML report saved to playwright-report/
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    // Base URL — Vite dev server
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',

    // Capture trace on first retry for debugging
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on first retry
    video: 'on-first-retry',

    // Generous timeout for media-heavy pages
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Vite dev server automatically before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  // Global timeout per test
  timeout: 60_000,

  // Output folder for test artifacts
  outputDir: 'playwright-results/',
});
