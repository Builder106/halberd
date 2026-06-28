import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// QA-BDD config: Gherkin QA scenarios that exercise the playground UI
// end-to-end — pack picker, preset buttons, challenge button, verdict
// rendering, violation display, and rewritten payloads. These complement
// wasm-bridge.spec.ts (which calls the WASM bridge directly via
// page.evaluate) by going through the React component layer.
//
// Reuses the demo step definitions and fixtures unchanged. dwellForDemo
// calls in those steps are no-ops when DEMO !== "1", so the suite runs
// at full Playwright speed.

const testDir = defineBddConfig({
  features: "e2e/qa/features/**/*.feature",
  steps: [
    "e2e/demo/steps/**/*.ts",
    "e2e/demo/support/fixtures.ts",
    "e2e/qa/steps/**/*.ts",
  ],
});

export default defineConfig({
  testDir,
  outputDir: "test-results/qa-bdd",

  fullyParallel: true,
  workers: undefined,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,

  use: {
    baseURL: process.env.HALBERD_URL ?? "http://localhost:3010",
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  webServer: process.env.HALBERD_URL
    ? undefined
    : {
        command: "npx next build && npx next start --port 3010",
        url: "http://localhost:3010",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },

  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
