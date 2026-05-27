import { defineConfig, devices } from "@playwright/test";

// QA config — the inverse of playwright.demo.config.ts:
//   - parallel workers (no shared state across tests)
//   - headless, no slowMo
//   - no video recording (the demo suite owns that)
//   - retries on failure (flake protection for the WASM-load timing)
//
// Boots `next start` as the test server. The WASM artifacts at
// /halberd.wasm and /wasm_exec.js need to be present in web/public/
// before the server boots — they're committed to the repo, so a
// fresh CI checkout has them; locally, run `./scripts/build-wasm.sh`
// from the repo root if they're missing.

export default defineConfig({
  testDir: "e2e/qa/specs",
  outputDir: "test-results/qa",

  fullyParallel: true,
  workers: undefined, // let Playwright pick (cores - 1)
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,

  use: {
    baseURL: process.env.HALBERD_URL ?? "http://localhost:3010",
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  webServer: process.env.HALBERD_URL
    ? undefined
    : {
        // `next start` over `next dev` — closer to production (the
        // build is already on disk) and avoids the dev-server's
        // hot-reload setup overhead per test.
        command: "npx next build && npx next start --port 3010",
        url: "http://localhost:3010",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },

  reporter: process.env.CI
    ? [["list"], ["github"]]
    : [["list"]],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
