import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests against the production server. GEMINI is deliberately not
// configured here, so lessons come from the labelled offline demos.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3311", trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/serve-standalone.mjs",
    url: "http://127.0.0.1:3311/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: "3311", GEMINI_API_KEY: "", GOOGLE_GENAI_USE_VERTEXAI: "" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /(?:mobile|learning-labs|periodic-table|court-setting|render-efficiency)\.spec\.ts/ },
  ],
});
