import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? "http://localhost:3100"

export default defineConfig({
  testDir: "./test/e2e",
  // The account specs share one fresh database and build on each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: "node apps/server/test/e2e-server.ts",
          url: `${baseURL}/api/health`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: { ...process.env, PORT: "3100" },
        },
      }),
})
