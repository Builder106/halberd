"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadHalberd,
  parsePacks,
  parseDecision,
  parseResponseResult,
  type PackInfo,
  type Decision,
  type ResponseResult,
} from "../lib/halberd";
import { presets, type Preset } from "../lib/presets";

type EngineState =
  | { kind: "loading" }
  | { kind: "ready"; packs: PackInfo[] }
  | { kind: "error"; message: string };

type Output =
  | { kind: "idle" }
  | { kind: "request"; decision: Decision }
  | { kind: "response"; result: ResponseResult; original: string };

export function Playground() {
  const [engine, setEngine] = useState<EngineState>({ kind: "loading" });
  const [pack, setPack] = useState<string>("mcp-server-postgres");
  const [direction, setDirection] = useState<"request" | "response">("request");
  const [payload, setPayload] = useState<string>("");
  const [output, setOutput] = useState<Output>({ kind: "idle" });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHalberd()
      .then((h) => {
        if (cancelled) return;
        const packs = parsePacks(h.packs());
        setEngine({ kind: "ready", packs });
        // Preselect the first preset of the default pack.
        const firstPreset = presets[pack]?.[0];
        if (firstPreset) {
          setPayload(firstPreset.payload);
          setDirection(firstPreset.direction);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setEngine({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packPresets = useMemo(() => presets[pack] ?? [], [pack]);

  const applyPreset = useCallback((p: Preset) => {
    setPayload(p.payload);
    setDirection(p.direction);
    setOutput({ kind: "idle" });
  }, []);

  const onPackChange = useCallback(
    (next: string) => {
      setPack(next);
      const first = presets[next]?.[0];
      if (first) {
        applyPreset(first);
      } else {
        setPayload("");
      }
    },
    [applyPreset],
  );

  const evaluate = useCallback(() => {
    if (engine.kind !== "ready" || !globalThis.halberd) return;
    const start = performance.now();
    try {
      if (direction === "request") {
        const json = globalThis.halberd.evaluateRequest(pack, payload);
        const decision = parseDecision(json);
        setOutput({ kind: "request", decision });
      } else {
        const json = globalThis.halberd.evaluateResponse(pack, payload);
        const result = parseResponseResult(json);
        setOutput({ kind: "response", result, original: payload });
      }
      setLatencyMs(Math.round((performance.now() - start) * 1000) / 1000);
    } catch (err) {
      setOutput({
        kind: "request",
        decision: {
          Blocked: true,
          Violations: [
            {
              Category: "engine_error",
              Tool: "",
              Field: "",
              Rule: "exception",
              Detail: err instanceof Error ? err.message : String(err),
            },
          ],
        },
      });
    }
  }, [direction, engine.kind, pack, payload]);

  return (
    <section
      id="playground"
      className="relative max-w-6xl mx-auto px-6 py-24 border-b border-(--color-border)"
    >
      <h2
        className="text-3xl font-bold mb-3"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Try Halberd in the browser
      </h2>
      <p className="text-(--color-fg-2) mb-12 max-w-2xl">
        The real{" "}
        <code>internal/policy</code> engine compiled to WebAssembly and
        running client-side. Pick a rule pack, paste or load a JSON-RPC
        envelope, and see what Halberd would do.
      </p>

      {engine.kind === "loading" && (
        <div className="p-6 rounded-lg border border-(--color-border) bg-(--color-panel)/40 text-sm text-(--color-fg-2) font-mono">
          Loading halberd-wasm… (4.5 MiB binary, ~1 MiB over the wire)
        </div>
      )}

      {engine.kind === "error" && (
        <div className="p-6 rounded-lg border border-(--color-danger)/40 bg-(--color-danger)/10 text-sm text-(--color-danger) font-mono">
          Failed to load engine: {engine.message}
        </div>
      )}

      {engine.kind === "ready" && (
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
          {/* Left column: controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                Rule pack
              </label>
              <select
                value={pack}
                onChange={(e) => onPackChange(e.target.value)}
                className="w-full px-3 py-2 rounded-md font-mono text-sm border border-(--color-border) bg-(--color-panel) text-(--color-fg) focus:outline-none focus:border-(--color-accent)"
              >
                {engine.packs.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.responseFilters ? "  ·  response filters on" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                Direction
              </label>
              <div className="inline-flex rounded-md border border-(--color-border) overflow-hidden">
                {(["request", "response"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`px-4 py-2 text-sm font-mono transition ${
                      direction === d
                        ? "bg-(--color-fg) text-(--color-bg)"
                        : "bg-(--color-panel) text-(--color-fg-2) hover:text-(--color-fg)"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {packPresets.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                  Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {packPresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className={`text-xs font-mono px-2.5 py-1 rounded border transition ${
                        p.expect === "block"
                          ? "border-(--color-danger)/40 text-(--color-danger) hover:bg-(--color-danger)/10"
                          : p.expect === "sanitize"
                            ? "border-(--color-warning)/40 text-(--color-warning) hover:bg-(--color-warning)/10"
                            : "border-(--color-success)/40 text-(--color-success) hover:bg-(--color-success)/10"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                Payload ({direction === "request" ? "JSON-RPC tools/call" : "JSON-RPC response"})
              </label>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                spellCheck={false}
                rows={14}
                className="w-full px-3 py-2 rounded-md font-mono text-xs border border-(--color-border) bg-(--color-bg-2) text-(--color-fg) focus:outline-none focus:border-(--color-accent) resize-y"
              />
            </div>

            <button
              onClick={evaluate}
              className="w-full px-5 py-3 rounded-md font-medium bg-(--color-fg) text-(--color-bg) hover:opacity-90 transition"
            >
              Evaluate →
            </button>
          </div>

          {/* Right column: output */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-(--color-fg-2)">
              Halberd&apos;s decision
              {latencyMs !== null && (
                <span className="ml-2 font-mono text-xs text-(--color-fg-3)">
                  ({latencyMs}ms)
                </span>
              )}
            </label>

            {output.kind === "idle" && (
              <div className="p-8 rounded-lg border border-dashed border-(--color-border) text-sm text-(--color-fg-3) text-center">
                Click <code>Evaluate</code> to see the decision.
              </div>
            )}

            {output.kind === "request" && (
              <RequestVerdict decision={output.decision} />
            )}

            {output.kind === "response" && (
              <ResponseVerdict result={output.result} original={output.original} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function RequestVerdict({ decision }: { decision: Decision }) {
  const blocked = decision.Blocked;
  return (
    <div
      className={`rounded-lg border p-5 ${
        blocked
          ? "border-(--color-danger)/40 bg-(--color-danger)/5"
          : "border-(--color-success)/40 bg-(--color-success)/5"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
            blocked ? "bg-(--color-danger)" : "bg-(--color-success)"
          }`}
        >
          <span className="text-(--color-bg) font-bold">
            {blocked ? "⛔" : "✓"}
          </span>
        </span>
        <span
          className={`font-mono text-sm uppercase tracking-wider ${
            blocked ? "text-(--color-danger)" : "text-(--color-success)"
          }`}
        >
          {blocked ? "Blocked" : "Allowed"}
        </span>
      </div>

      {blocked && decision.Violations && decision.Violations.length > 0 ? (
        <div className="space-y-3">
          {decision.Violations.map((v, i) => (
            <div
              key={i}
              className="rounded border border-(--color-border) bg-(--color-panel) p-3 text-sm"
            >
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-(--color-fg-3) mb-2">
                <span>
                  <span className="text-(--color-fg-2)">category:</span>{" "}
                  {v.Category}
                </span>
                {v.Tool && (
                  <span>
                    <span className="text-(--color-fg-2)">tool:</span> {v.Tool}
                  </span>
                )}
                {v.Field && (
                  <span>
                    <span className="text-(--color-fg-2)">field:</span> {v.Field}
                  </span>
                )}
                <span>
                  <span className="text-(--color-fg-2)">rule:</span> {v.Rule}
                </span>
              </div>
              <pre className="font-mono text-xs text-(--color-fg) whitespace-pre-wrap break-words">
                {v.Detail}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-(--color-fg-2) font-mono">
          {blocked
            ? "Blocked, but no violation details."
            : "Forwarded to upstream unchanged."}
        </p>
      )}
    </div>
  );
}

function ResponseVerdict({
  result,
  original,
}: {
  result: ResponseResult;
  original: string;
}) {
  const detections = result.detections ?? [];
  return (
    <div
      className={`rounded-lg border p-5 ${
        result.modified
          ? "border-(--color-warning)/40 bg-(--color-warning)/5"
          : "border-(--color-success)/40 bg-(--color-success)/5"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
            result.modified ? "bg-(--color-warning)" : "bg-(--color-success)"
          }`}
        >
          <span className="text-(--color-bg) font-bold">
            {result.modified ? "✎" : "✓"}
          </span>
        </span>
        <span
          className={`font-mono text-sm uppercase tracking-wider ${
            result.modified ? "text-(--color-warning)" : "text-(--color-success)"
          }`}
        >
          {result.modified ? "Sanitized" : "Passed through"}
        </span>
      </div>

      {detections.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {detections.map((d, i) => (
            <span
              key={i}
              className="font-mono text-xs px-2 py-0.5 rounded border border-(--color-warning)/30 text-(--color-warning) bg-(--color-warning)/10"
              title={d.path}
            >
              {d.kind}
            </span>
          ))}
        </div>
      )}

      <label className="block text-xs font-mono text-(--color-fg-3) mb-1">
        {result.modified ? "Rewritten payload (what the agent sees):" : "Payload (unchanged):"}
      </label>
      <pre className="font-mono text-xs bg-(--color-panel) border border-(--color-border) rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
        {tryPretty(result.payload)}
      </pre>

      {result.modified && (
        <details className="mt-3">
          <summary className="text-xs font-mono text-(--color-fg-3) cursor-pointer hover:text-(--color-fg-2)">
            show original
          </summary>
          <pre className="mt-2 font-mono text-xs bg-(--color-bg-2) border border-(--color-border) rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
            {tryPretty(original)}
          </pre>
        </details>
      )}
    </div>
  );
}

function tryPretty(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
