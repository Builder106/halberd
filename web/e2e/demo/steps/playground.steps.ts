import { expect } from "@playwright/test";
import { Given, When, Then } from "../support/fixtures";

// All steps target the live (or locally-served) playground. Locators
// prefer accessible roles + labels over CSS selectors; where the UI
// uses native <select>, we drive it via the <option>'s label rather
// than a value attribute, so changes to internal ids don't break the
// test.

Given("I am on the Halberd playground", async ({ page, dwellForDemo }) => {
  await page.goto("/");
  // Wait for the playground section to be visible (engine readiness
  // is signalled by the rule-pack picker label showing up).
  await page
    .getByText("Garrison · which sentry stands the watch")
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#sentry").scrollIntoViewIfNeeded();
  await dwellForDemo(800);
});

When(
  "I choose the {string} rule pack",
  async ({ page, dwellForDemo }, packName: string) => {
    // Select by value (= pack identifier) rather than label — the
    // option label appends "  ·  scribes also amend responses" for
    // packs with response filters, which is fragile to whitespace.
    const select = page.getByRole("combobox");
    await select.selectOption(packName);
    await dwellForDemo(500);
  },
);

When(
  "I load the {string} scenario",
  async ({ page, dwellForDemo }, scenarioLabel: string) => {
    await page.getByRole("button", { name: scenarioLabel }).click();
    await dwellForDemo(500);
  },
);

When("I challenge the envelope", async ({ page, dwellForDemo }) => {
  await page.getByRole("button", { name: /Challenge the envelope/i }).click();
  // Verdict block has to paint AND the wax seal SVG has to render —
  // the dwell here is the "money shot" pause so viewers see the seal.
  await page
    .locator('[aria-label^="Halberd verdict"]')
    .waitFor({ state: "visible", timeout: 5_000 });
  await dwellForDemo(2200);
});

Then("the verdict reads {string}", async ({ page }, verdict: string) => {
  await expect(
    page.getByText(verdict, { exact: true }).first(),
  ).toBeVisible({ timeout: 5_000 });
});

Then(
  "a deny_pattern violation is recorded on the {word} field",
  async ({ page }, field: string) => {
    const proclamation = page.locator("text=⌜ proclamation ⌟").locator("..");
    await expect(proclamation).toContainText("deny_pattern");
    await expect(proclamation).toContainText(`field: ${field}`);
  },
);

Then(
  "the rewritten payload no longer contains {string}",
  async ({ page }, needle: string) => {
    const payload = page
      .locator("text=as delivered to the agent (rewritten):")
      .locator(".. >> pre")
      .first();
    await expect(payload).not.toContainText(needle);
  },
);

Then(
  "the rewritten payload contains {string}",
  async ({ page }, needle: string) => {
    const payload = page
      .locator("text=as delivered to the agent (rewritten):")
      .locator(".. >> pre")
      .first();
    await expect(payload).toContainText(needle);
  },
);

Then("no violations are recorded", async ({ page }) => {
  // The "Pass granted" verdict block shows the description sentence
  // and no proclamation block; if a proclamation header appears we've
  // misclassified.
  await expect(page.locator("text=⌜ proclamation ⌟")).toHaveCount(0);
});

