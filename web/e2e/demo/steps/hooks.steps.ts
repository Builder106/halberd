import { After, TAIL_MS } from "../support/fixtures";

// Hold the final frame so the last shot reads as a still in the GIF.
// Lives in a step file (not fixtures.ts) because playwright-bdd loads
// step files at generate-time AFTER the test runtime is initialized;
// fixtures.ts itself is imported from a context where test.afterEach
// at module-load time would throw.
After(async ({ page }) => {
  try {
    await page.waitForTimeout(TAIL_MS);
  } catch {
    /* page may already be closed; non-fatal */
  }
});
