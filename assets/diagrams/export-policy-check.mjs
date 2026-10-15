import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

if (!process.argv[2]) {
  throw new Error("Usage: node export-policy-check.mjs OUTPUT_DIRECTORY [PLAYWRIGHT_PACKAGE_DIRECTORY]");
}

const require = createRequire(
  process.argv[3]
    ? join(resolve(process.argv[3]), "package.json")
    : new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const outputDirectory = resolve(process.argv[2]);
const source = new URL("./policy-check.html", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.HALBERD_DIAGRAM_BROWSER });
try {
  for (const theme of ["light", "dark"]) {
    for (const layout of ["wide", "compact"]) {
      const width = layout === "wide" ? 960 : 480;
      const page = await browser.newPage({
        viewport: { width, height: 1100 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      await page.goto(source.href, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        const loaded = await Promise.all([
          document.fonts.load('600 42px "Cormorant Garamond"'),
          document.fonts.load('500 22px "Manrope"'),
          document.fonts.load('700 24px "Manrope"'),
        ]);
        await document.fonts.ready;
        if (loaded.some((faces) => faces.length === 0 || faces.some((font) => font.status !== "loaded"))) {
          throw new Error("The diagram fonts did not load.");
        }
      });
      const diagram = page.locator(`svg.${layout}`);
      const check = await diagram.evaluate((svg) => {
        const box = svg.viewBox.baseVal;
        const luminance = (color) => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number);
          return channels.reduce((total, channel, index) => {
            const value = channel / 255;
            const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            return total + linear * [0.2126, 0.7152, 0.0722][index];
          }, 0);
        };
        const paper = luminance(getComputedStyle(svg.querySelector(".paper")).fill);
        const panel = luminance(getComputedStyle(svg.querySelector(".panel")).fill);
        let minimumContrast = Infinity;
        for (const text of svg.querySelectorAll("text")) {
          const bounds = text.getBBox();
          if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > box.width || bounds.y + bounds.height > box.height) {
            throw new Error(`Text leaves the canvas: ${text.textContent}`);
          }
          const foreground = luminance(getComputedStyle(text).fill);
          for (const background of [paper, panel]) {
            const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
            minimumContrast = Math.min(minimumContrast, contrast);
          }
        }
        if (minimumContrast < 4.5) {
          throw new Error(`Text contrast is below 4.5:1: ${minimumContrast}`);
        }
        return { width: box.width * 2, height: box.height * 2, minimumContrast };
      });
      const name = `policy-check-${layout === "compact" ? "mobile-" : ""}${theme}.png`;
      await diagram.screenshot({ path: join(outputDirectory, name), omitBackground: true });
      console.log(JSON.stringify({ file: name, ...check }));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
