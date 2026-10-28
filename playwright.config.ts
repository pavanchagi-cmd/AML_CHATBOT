import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL runs the suites against a deployed app (e.g. the Vercel production URL);
// otherwise a local production build is started on port 3100.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3100",
        url: "http://localhost:3100/ask",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
