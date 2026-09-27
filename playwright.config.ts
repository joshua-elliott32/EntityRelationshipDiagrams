import { existsSync } from "node:fs";
import { chromium, defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Local escape hatch: set PLAYWRIGHT_CHROMIUM_PATH to use an already-installed
// Chromium (e.g. a sandbox whose browser build differs from this Playwright
// version). CI installs the matching browser and ignores this.
const customChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions =
  customChromium && !existsSync(chromium.executablePath())
    ? { executablePath: customChromium }
    : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } }],
  // Serves the static export, which is exactly what Vercel will host.
  webServer: {
    command: `npx --yes serve@14 out -l ${PORT} --no-clipboard`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
