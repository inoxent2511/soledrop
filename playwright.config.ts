import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end and QA sweeps against a running production build (`node qa/serve.mjs 3200`).
 * QA_BASE_URL points elsewhere when needed. Chromium is authoritative; the other projects run
 * the same specs for cross-browser parity.
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: process.env.QA_ARTIFACT_DIR ?? "qa/out/e2e",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: process.env.QA_REPORT_FILE ?? "qa/out/e2e-results.json" }]],
  use: {
    baseURL: process.env.QA_BASE_URL ?? "http://127.0.0.1:3200",
    reducedMotion: "reduce",
    trace: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
})
