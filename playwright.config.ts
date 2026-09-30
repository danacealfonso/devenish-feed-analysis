import { defineConfig, devices } from "@playwright/test";

// Local, git-ignored secrets for tests (E2E_SERVICE_ROLE_KEY): the sign-in form now needs Cloudflare's human check,
// which automation can't pass, so tests sign in with a one-time server-generated link instead.
try {
  process.loadEnvFile(".env.test.local");
} catch {}

/**
 * End-to-end tests run against the deployed site by default.
 *   npm run e2e                               # live: https://devenish-a4843.web.app
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://devenish-a4843.web.app",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile-safari/ },
    // Opt-in, so a default run doesn't need Firefox installed: E2E_FIREFOX=1 npx playwright test --project=firefox
    ...(process.env.E2E_FIREFOX
      ? [{ name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile-safari/ }]
      : []),
    // iPhone Safari has no push and no hover; a smoke test catches what only shows up there.
    { name: "iphone-safari", use: { ...devices["iPhone 15"] }, testMatch: /mobile-safari\.spec\.ts/ },
  ],
});
