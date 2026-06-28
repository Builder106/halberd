import { expect } from "@playwright/test";
import { Then } from "../../demo/support/fixtures";

// Supplements the shared demo step definitions with QA-only steps.
// Imports from the demo fixtures so all steps share the same test
// instance — required by playwright-bdd for type-safe fixture access.

Then(
  "an allow_values violation is recorded on the {word} field",
  async ({ page }, field: string) => {
    const proclamation = page.locator("text=⌜ proclamation ⌟").locator("..");
    await expect(proclamation).toContainText("allow_values");
    await expect(proclamation).toContainText(`field: ${field}`);
  },
);
