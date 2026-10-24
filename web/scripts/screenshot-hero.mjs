// Capture the console after Halberd refuses a DROP TABLE request.
// Run against a local production server; HALBERD_URL overrides port 3010.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = path.join(repoRoot, "assets", "console-hero.png");
const url = new URL("/console", process.env.HALBERD_URL ?? "http://127.0.0.1:3010");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1150 }, deviceScaleFactor: 1 });
  await page.goto(url.toString());
  await page.getByLabel("Rule pack").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "DROP TABLE (refused)", exact: true }).click();
  await page.getByRole("button", { name: "Send through Halberd" }).click();
  await page.getByRole("region", { name: "Halberd verdict" }).locator(".verdict__word").waitFor();
  await page.evaluate(() => window.scrollTo(0, 220));
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, animations: "disabled" });
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
}
