import type {
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Defers every video rename + GIF conversion until onEnd, because
// Playwright's onTestEnd fires before the video file is guaranteed
// to have flushed to disk. By onEnd, every test's video is fully
// written and we can rename / ffmpeg them safely.
//
// Skips:
//   - Warmup tests whose title starts with "Warmup" (slug prefix
//     "warmup-…"). Their videos are discarded because the first
//     one or two slots in a single-worker slowMo run reliably
//     produce 0-byte webms.
//   - Any webm that is itself 0 bytes (defensive — defends against
//     the same bug landing on a non-warmup slot).

type Job = {
  src: string;
  test: TestCase;
};

class DemoReporter implements Reporter {
  private outDir: string;
  private jobs: Job[] = [];

  constructor(opts: { outDir?: string } = {}) {
    this.outDir = resolve(opts.outDir ?? "../assets/demo");
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const video = result.attachments.find((a) => a.name === "video");
    if (!video?.path) return;
    this.jobs.push({ src: video.path, test });
  }

  async onEnd() {
    if (this.jobs.length === 0) {
      console.log("[demo] no video jobs to process");
      return;
    }
    mkdirSync(this.outDir, { recursive: true });

    for (const job of this.jobs) {
      const slug = this.slugify(job.test);
      if (slug.startsWith("warmup-")) {
        this.discard(job.src, `warmup (${slug})`);
        continue;
      }
      if (!existsSync(job.src) || statSync(job.src).size === 0) {
        this.discard(job.src, `0-byte (${slug})`);
        continue;
      }
      const webm = join(this.outDir, `${slug}.webm`);
      renameSync(job.src, webm);

      try {
        const mp4 = join(this.outDir, `${slug}.mp4`);
        this.runFfmpeg([
          "-y",
          "-i",
          webm,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          mp4,
        ]);
        rmSync(webm);

        const gif = join(this.outDir, `${slug}.gif`);
        // Build a palette first for cleaner colour rendering; keep
        // the GIF small (fps 12, width 960) so each embeds well under
        // GitHub's 10 MB attach limit.
        const palette = join(this.outDir, `_${slug}.palette.png`);
        this.runFfmpeg([
          "-y",
          "-i",
          mp4,
          "-vf",
          "fps=12,scale=960:-1:flags=lanczos,palettegen=max_colors=128",
          palette,
        ]);
        this.runFfmpeg([
          "-y",
          "-i",
          mp4,
          "-i",
          palette,
          "-lavfi",
          "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a",
          gif,
        ]);
        rmSync(palette);
        console.log(`[demo] wrote ${gif}`);
      } catch (err) {
        console.error(`[demo] ffmpeg failed for ${slug}:`, err);
      }

      // Remove the per-test attachments dir if it's now empty.
      this.cleanEmpty(dirname(job.src));
    }
  }

  private discard(path: string, why: string) {
    console.log(`[demo] discarding ${why}`);
    try {
      if (existsSync(path)) rmSync(path);
      this.cleanEmpty(dirname(path));
    } catch {
      /* ignore */
    }
  }

  private cleanEmpty(dir: string) {
    try {
      rmSync(dir, { recursive: false });
    } catch {
      /* directory not empty or already gone */
    }
  }

  private slugify(test: TestCase): string {
    // Prefer an explicit `@slug=<name>` Gherkin tag so the README
    // links to a stable filename across re-runs. Fall back to the
    // feature+scenario titles for tests that don't carry the tag
    // (notably the warmups, which the reporter discards anyway).
    const tagged = test.tags.find((t) => t.startsWith("@slug="));
    if (tagged) return tagged.slice("@slug=".length);

    const parts = test.titlePath().filter(Boolean);
    const last2 = parts.slice(-2).join(" ");
    return last2
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^scenario-/, "");
  }

  private runFfmpeg(args: string[]) {
    // Suppress ffmpeg's progress chatter; surface only its errors.
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  }

  // Satisfy the Reporter interface for the noop methods.
  onBegin() {}
  printsToStdio() {
    return true;
  }
}

export default DemoReporter;
