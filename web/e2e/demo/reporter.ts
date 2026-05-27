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
        // CRF 23 is visually transparent at this resolution; -tune
        // stillimage biases the encoder for the long-still-frame
        // segments common in slowMo'd UI demos. faststart moves moov
        // atom up so GitHub starts playback before download
        // completes.
        this.runFfmpeg([
          "-y",
          "-i",
          webm,
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-tune",
          "stillimage",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-an",
          mp4,
        ]);
        rmSync(webm);
        console.log(`[demo] wrote ${mp4}`);
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

  // Explicit scenario-title → README-stable slug. The keys must match
  // the Scenario lines in .feature files exactly. README image refs
  // are written against these slugs, so re-running the demo suite
  // overwrites the same filenames rather than producing new ones.
  //
  // (Was tried via `@slug=foo` Gherkin tags first; playwright-bdd
  // drops `=`-bearing tags during its parse step, so they never reach
  // TestCase.tags. The lookup table is uglier but bulletproof.)
  private slugForScenario: Record<string, string> = {
    "A DROP TABLE is refused under the postgres bundle":
      "refused-drop-table",
    "A path-traversal read is refused under the filesystem bundle":
      "refused-path-traversal",
    "An aws + github + rsa-laden response is amended under the honeypot bundle":
      "amended-aws-github-rsa-laden-response",
    "A safe SELECT is forwarded under the postgres bundle":
      "granted-safe-select",
  };

  private slugify(test: TestCase): string {
    const explicit = this.slugForScenario[test.title];
    if (explicit) return explicit;

    // Fall back for warmups (which the reporter discards anyway) and
    // for any scenarios added without a table entry.
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
