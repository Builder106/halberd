import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Demo config: produces narrative recordings under e2e/demo/, single-
// worker, slow enough that the resulting GIFs are watchable at 1× speed.
//
// Why these knobs:
//   - fullyParallel:false + workers:1 — multiple test contexts compete
//     for the video subsystem and most or all videos end up 0 bytes.
//     The QA suite (later) inverts this for speed.
//   - retries:0 — re-runs would re-record over the previous video.
//   - launchOptions.slowMo — between-action pause; below ~800ms reads
//     as twitchy.
//   - video.size matches viewport. If they differ Playwright either
//     letterboxes or refuses to record.
//
// Defaults are overridable via env vars so a single command can tune
// the recording pace (DEMO_SLOWMO=2000 npx playwright …) without
// editing this file.

const SLOWMO = Number(process.env.DEMO_SLOWMO ?? 1200);

const testDir = defineBddConfig({
  features: "e2e/demo/features/**/*.feature",
  // Include fixtures.ts so playwright-bdd can discover our extended
  // `test` and wire it into the generated specs; without it the gen
  // step throws "Can't guess test instance".
  steps: ["e2e/demo/steps/**/*.ts", "e2e/demo/support/fixtures.ts"],
});

export default defineConfig({
  testDir,
  // Snapshot the entire run in this directory. The reporter moves
  // demo videos out of it; warmup + 0-byte videos get cleaned up.
  outputDir: "test-results/demo",

  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,

  // Use the live deployment by default; HALBERD_URL can override to
  // localhost:3000 during dev.
  use: {
    baseURL: process.env.HALBERD_URL ?? "https://halberd-keep.vercel.app",
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: {
      mode: "on",
      size: { width: 1440, height: 900 },
    },
    launchOptions: {
      slowMo: SLOWMO,
    },
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },

  reporter: [["list"], ["./e2e/demo/reporter.ts", { outDir: "../assets/demo" }]],

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The Chrome device preset overrides our viewport — re-pin
        // it (and the matching video size) at project level.
        viewport: { width: 1440, height: 900 },
        video: {
          mode: "on",
          size: { width: 1440, height: 900 },
        },
      },
    },
  ],
});
