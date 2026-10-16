import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  testDir: "./e2e", timeout: 60000, expect: { timeout: 10000 }, workers: 1, retries: 0,
  globalTeardown: "./e2e/teardown.js",
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: "http://127.0.0.1:13001", timezoneId: "Asia/Bangkok", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: [
    { command: "dotnet run --no-build --no-launch-profile --project CleanMate.SystemTests.Host/CleanMate.SystemTests.Host.csproj", cwd: fileURLToPath(new URL("../backend", import.meta.url)),
      env: { CLEANMATE_E2E_WEB_ROOT: fileURLToPath(new URL("dist", import.meta.url)) }, url: "http://127.0.0.1:13000", timeout: 90000, reuseExistingServer: false },
    { command: "node server.mjs", cwd: dir, env: { PORT: "13001", CLEANMATE_API_URL: "http://127.0.0.1:15238", CLEANMATE_ADMIN_ROOT: fileURLToPath(new URL("dist", import.meta.url)) }, url: "http://127.0.0.1:13001", reuseExistingServer: false }
  ]
});
