// Headless capture of the playground in its blocked-verdict state.
// Saves to assets/playground-hero.png at the repo root.
//
// Run: cd web && node scripts/screenshot-hero.mjs

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const out = path.join(repoRoot, "assets", "playground-hero.png");

const url = process.env.HALBERD_URL ?? "https://halberd-keep.vercel.app/";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1800 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

console.log(`navigating to ${url}`);
await page.goto(url, { waitUntil: "networkidle" });

// Wait for halberd-wasm to initialize. The playground swaps from the
// "Raising the gate…" loading state to the form once globalThis.halberd
// is registered.
await page.waitForSelector("text=Garrison · which sentry stands the watch", {
  timeout: 30_000,
});

// Drive a guaranteed-blocked scenario so the wax seal renders.
await page.getByRole("button", { name: /DROP TABLE \(blocked\)/i }).click();
await page.getByRole("button", { name: /Challenge the envelope/i }).click();

// Wait for the verdict block.
await page.waitForSelector("text=Refused", { timeout: 10_000 });
await page.waitForTimeout(800); // tiny dwell so the wax-seal SVG paints

const playground = page.locator("#sentry");
await playground.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);

const box = await playground.boundingBox();
if (!box) throw new Error("could not measure the playground section");

await page.screenshot({
  path: out,
  clip: {
    x: Math.max(box.x - 16, 0),
    y: Math.max(box.y - 16, 0),
    width: Math.min(box.width + 32, 1440),
    height: Math.min(box.height + 32, 1700),
  },
});

console.log(`wrote ${out}`);
await browser.close();
