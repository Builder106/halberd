import { test as base, createBdd } from "playwright-bdd";
import type { Page } from "@playwright/test";

// The slowMo + video pipeline produces watchable demos out of plain
// Playwright runs, but four extra knobs are needed to make the
// recordings *legible* at 1× playback:
//
//  1. Locator.fill animated character-by-character (slowMo only pauses
//     between actions, not within one).
//  2. Cursor injection so viewers can see where the test "looks" —
//     headless Chromium hides the system cursor.
//  3. Dark-mode pin so there's no flash of light-theme background
//     before React hydrates.
//  4. dwellForDemo helper called at every "thing just appeared" beat
//     because slowMo doesn't cover page.goto or expect().toBeVisible.
//
// Knobs are calibrated for a single-worker run with launchOptions.slowMo
// in the ~1200ms range and DEMO_TYPE_DELAY ~70ms.

const DWELL_DEFAULT_MS = Number(process.env.DEMO_DWELL_MS ?? 1500);
const TYPE_DELAY_MS = Number(process.env.DEMO_TYPE_DELAY ?? 70);
const TAIL_MS = Number(process.env.DEMO_TAIL_MS ?? 1500);

const cursorScript = `
(() => {
  if (window.__halberdCursor) return;
  window.__halberdCursor = true;
  const dot = document.createElement('div');
  dot.style.cssText = [
    'position:fixed','left:-50px','top:-50px','width:18px','height:18px',
    'background:rgba(124,77,255,0.95)','border:2px solid #fff',
    'border-radius:50%','pointer-events:none','z-index:2147483647',
    'transform:translate(-50%,-50%)','transition:transform 80ms linear',
    'box-shadow:0 0 12px rgba(124,77,255,0.65)'
  ].join(';');
  document.documentElement.appendChild(dot);
  document.addEventListener('mousemove', (e) => {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  }, true);
  document.addEventListener('mousedown', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(0.7)';
  }, true);
  document.addEventListener('mouseup', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(1)';
  }, true);
})();
`;

const darkPinScript = `
(() => {
  // Halberd is dark-only by design; pin the html class before React
  // hydrates so there's no flash of unmounted background colour.
  document.documentElement.classList.add('dark');
  document.documentElement.style.backgroundColor = '#0a0e14';
})();
`;

// Animate any locator.fill() by clearing and pressSequentially-ing,
// so form input shows up character-by-character in the recording.
async function animatedFill(page: Page, selector: string, value: string) {
  const loc = page.locator(selector);
  await loc.click({ force: true });
  await loc.press("ControlOrMeta+A");
  await loc.press("Delete");
  await loc.pressSequentially(value, { delay: TYPE_DELAY_MS });
}

type DemoFixtures = {
  dwellForDemo: (ms?: number) => Promise<void>;
  animatedFill: (selector: string, value: string) => Promise<void>;
};

export const test = base.extend<DemoFixtures>({
  // Inject scripts before any navigation. addInitScript fires on
  // every page load so it survives client-side route changes too.
  page: async ({ page }, use) => {
    await page.addInitScript(darkPinScript);
    await page.addInitScript(cursorScript);
    await use(page);
  },

  dwellForDemo: async ({ page }, use) => {
    await use(async (ms = DWELL_DEFAULT_MS) => {
      try {
        await page.waitForTimeout(ms);
      } catch {
        /* page may already be closed; non-fatal during teardown */
      }
    });
  },

  animatedFill: async ({ page }, use) => {
    await use((selector, value) => animatedFill(page, selector, value));
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);

// Re-export the tail constant so the hooks step file can use it
// without duplicating env lookup.
export { TAIL_MS };
