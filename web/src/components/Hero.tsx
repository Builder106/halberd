import { HalberdMark } from "./HalberdMark";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-(--color-border)">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 60% at 18% 50%, rgba(124,77,255,0.20), transparent 70%), radial-gradient(50% 50% at 80% 20%, rgba(0,212,255,0.10), transparent 70%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-32 flex flex-col md:flex-row items-center gap-16">
        <HalberdMark size={260} className="shrink-0" />

        <div className="flex-1 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-mono rounded-full border border-(--color-border) bg-(--color-panel) text-(--color-fg-2)">
            <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent-2) shadow-[0_0_10px_rgba(0,212,255,0.6)]" />
            v0.1 · MIT · pre-release
          </div>

          <h1
            className="text-6xl md:text-7xl font-extrabold tracking-tight leading-none mb-5"
            style={{ fontFamily: "var(--font-display)" }}
          >
            HALBERD
          </h1>

          <div
            className="w-32 h-1 mb-6 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, var(--color-accent), var(--color-accent-2))",
            }}
          />

          <p className="text-xl md:text-2xl text-(--color-fg-2) mb-3">
            A JSON-RPC firewall for MCP agents.
          </p>
          <p className="text-base font-mono text-(--color-fg-3) mb-10">
            tools/call → policy → audit → upstream
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href="#playground"
              className="inline-flex items-center px-5 py-2.5 rounded-md font-medium text-(--color-bg) bg-(--color-fg) hover:opacity-90 transition"
            >
              Try it in the browser →
            </a>
            <a
              href="https://github.com/Builder106/Halberd"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center px-5 py-2.5 rounded-md font-medium text-(--color-fg) border border-(--color-border) hover:bg-(--color-panel) transition"
            >
              View on GitHub ↗
            </a>
            <a
              href="#install"
              className="inline-flex items-center px-5 py-2.5 rounded-md font-medium text-(--color-fg-2) hover:text-(--color-fg) transition"
            >
              Install
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
