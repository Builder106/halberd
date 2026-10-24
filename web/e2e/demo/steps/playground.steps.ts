import { expect, type Page } from "@playwright/test";
import { Given, When, Then } from "../support/fixtures";

// All steps target the console at /console, live or locally served.
// Locators use accessible roles and labels, so markup changes that keep
// the labels intact don't break the suite.

const verdict = (page: Page) => page.getByRole("region", { name: "Halberd verdict" });

Given("I am on the Halberd console", async ({ page, dwellForDemo }) => {
  await page.goto("/console");
  // The rule pack picker renders once the WASM engine is ready.
  await page.getByLabel("Rule pack").waitFor({ state: "visible", timeout: 30_000 });
  await dwellForDemo(800);
});

When("I choose the {string} rule pack", async ({ page, dwellForDemo }, packName: string) => {
  await page.getByLabel("Rule pack").selectOption(packName);
  await dwellForDemo(500);
});

When("I load the {string} scenario", async ({ page, dwellForDemo }, scenarioLabel: string) => {
  await page.getByRole("button", { name: scenarioLabel, exact: true }).click();
  await dwellForDemo(500);
});

When("I send it through Halberd", async ({ page, dwellForDemo }) => {
  await page.getByRole("button", { name: "Send through Halberd" }).click();
  // The pause is the shot viewers need to read the verdict.
  await verdict(page).locator(".verdict__word").waitFor({ state: "visible", timeout: 5_000 });
  await dwellForDemo(2200);
});

Then("the verdict reads {string}", async ({ page }, word: string) => {
  await expect(verdict(page).locator(".verdict__word")).toHaveText(word, { timeout: 5_000 });
});

Then("a(n) {word} violation is recorded on the {word} field", async ({ page }, rule: string, field: string) => {
  const v = verdict(page).locator("dl.violation").first();
  await expect(v.locator("dt", { hasText: "Rule" }).locator("xpath=following-sibling::dd[1]")).toHaveText(rule);
  await expect(v.locator("dt", { hasText: "Field" }).locator("xpath=following-sibling::dd[1]")).toHaveText(field);
});

Then("the rewritten payload no longer contains {string}", async ({ page }, needle: string) => {
  await expect(verdict(page).getByLabel("Delivered to the assistant")).not.toContainText(needle);
});

Then("the rewritten payload contains {string}", async ({ page }, needle: string) => {
  await expect(verdict(page).getByLabel("Delivered to the assistant")).toContainText(needle);
});

Then("no violations are recorded", async ({ page }) => {
  await expect(verdict(page).locator("dl.violation")).toHaveCount(0);
});
