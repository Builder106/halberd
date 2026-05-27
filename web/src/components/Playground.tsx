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
import { SectionMarker } from "./SectionMarker";
import { WaxSeal } from "./WaxSeal";
import { Crest } from "./Crest";

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
      id="sentry"
      className="relative max-w-5xl mx-auto px-6 py-24 border-b border-(--color-border)"
    >
      <SectionMarker
        numeral="II"
        ceremonial="The Sentry's Challenge"
        functional="Try Halberd in the browser"
      />
      <p
        className="text-(--color-fg) mb-3 italic text-lg"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        State your purpose, traveller.
      </p>
      <p className="text-(--color-fg-2) mb-12 max-w-2xl">
        The real <code>internal/policy</code> engine compiled to WebAssembly
        and running client-side. Pick a rule pack, paste a JSON-RPC envelope,
        and see what the sentry would do.
      </p>

      {engine.kind === "loading" && (
        <div className="p-6 rounded-lg border border-(--color-border) bg-(--color-panel)/40 text-sm text-(--color-fg-2) font-mono">
          Raising the gate… (4.5 MiB engine, ~1 MiB over the wire)
        </div>
      )}

      {engine.kind === "error" && (
        <div className="p-6 rounded-lg border border-(--color-wax)/40 bg-(--color-wax)/10 text-sm text-(--color-wax) font-mono">
          The sentry could not be reached: {engine.message}
        </div>
      )}

      {engine.kind === "ready" && (
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
          {/* Left column: controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                Garrison · which sentry stands the watch
              </label>
              <div className="flex items-center gap-3">
                <Crest pack={pack} size={22} />
                <select
                  value={pack}
                  onChange={(e) => onPackChange(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md font-mono text-sm border border-(--color-border) bg-(--color-panel) text-(--color-fg) focus:outline-none focus:border-(--color-brass)"
                >
                  {engine.packs.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.responseFilters ? "  ·  scribes also amend responses" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                Direction · who comes to the gate
              </label>
              <div className="inline-flex rounded-md border border-(--color-border) overflow-hidden">
                {([
                  { d: "request", label: "request — inbound" },
                  { d: "response", label: "response — outbound" },
                ] as const).map(({ d, label }) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`px-4 py-2 text-sm font-mono transition ${
                      direction === d
                        ? "bg-(--color-fg) text-(--color-bg)"
                        : "bg-(--color-panel) text-(--color-fg-2) hover:text-(--color-fg)"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {packPresets.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-(--color-fg-2) mb-2">
                  Scenarios · attacks the garrison drills against
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
                Dispatch · the JSON-RPC envelope at the gate
              </label>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                spellCheck={false}
                rows={14}
                className="w-full px-3 py-2 rounded-md font-mono text-xs border border-(--color-border) bg-(--color-bg-2) text-(--color-fg) focus:outline-none focus:border-(--color-brass) resize-y"
              />
            </div>

            <button
              onClick={evaluate}
              className="w-full px-5 py-3 rounded-md font-medium bg-(--color-fg) text-(--color-bg) hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              <span className="text-(--color-brass)" aria-hidden>
                ⚔
              </span>
              Challenge the envelope
              <span aria-hidden>→</span>
            </button>
          </div>

          {/* Right column: the verdict */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-(--color-fg-2)">
              The verdict · pressed in wax by the sentry
              {latencyMs !== null && (
                <span className="ml-2 font-mono text-xs text-(--color-fg-3)">
                  · {latencyMs}ms
                </span>
              )}
            </label>

            {output.kind === "idle" && (
              <div className="p-8 rounded-lg border border-dashed border-(--color-border) text-center">
                <p
                  className="italic text-(--color-fg-3) text-lg"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Awaiting a challenge.
                </p>
                <p className="mt-2 font-mono text-xs text-(--color-fg-3)">
                  press <span className="text-(--color-fg-2)">Challenge</span>{" "}
                  to see the verdict.
                </p>
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
      className={`rounded-lg border p-6 ${
        blocked
          ? "border-(--color-wax)/40 bg-(--color-wax)/5"
          : "border-(--color-brass)/40 bg-(--color-brass)/5"
      }`}
    >
      <div className="flex items-start gap-5 mb-4">
        <WaxSeal variant={blocked ? "refused" : "granted"} size={112} />
        <div className="flex-1 pt-2">
          <p
            className="text-2xl mb-1"
            style={{
              fontFamily: "var(--font-serif)",
              color: blocked ? "var(--color-wax)" : "var(--color-brass)",
            }}
          >
            {blocked ? "Refused" : "Pass granted"}
          </p>
          <p className="font-mono text-xs text-(--color-fg-3) tracking-wider">
            {blocked
              ? "the envelope is returned to its sender with a synthetic JSON-RPC error"
              : "the envelope is forwarded to the upstream MCP server unchanged"}
          </p>
        </div>
      </div>

      {blocked && decision.Violations && decision.Violations.length > 0 ? (
        <div className="space-y-3 mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--color-fg-3)">
            ⌜ proclamation ⌟
          </p>
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
      ) : null}
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
  const modified = result.modified;
  return (
    <div
      className={`rounded-lg border p-6 ${
        modified
          ? "border-(--color-ink)/40 bg-(--color-ink)/5"
          : "border-(--color-brass)/40 bg-(--color-brass)/5"
      }`}
    >
      <div className="flex items-start gap-5 mb-4">
        <WaxSeal variant={modified ? "amended" : "granted"} size={112} />
        <div className="flex-1 pt-2">
          <p
            className="text-2xl mb-1"
            style={{
              fontFamily: "var(--font-serif)",
              color: modified ? "var(--color-ink)" : "var(--color-brass)",
            }}
          >
            {modified ? "Amended" : "Passed through"}
          </p>
          <p className="font-mono text-xs text-(--color-fg-3) tracking-wider">
            {modified
              ? "the auditor struck the offending passages before delivery to the agent"
              : "the response reached the agent unchanged"}
          </p>
        </div>
      </div>

      {detections.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--color-fg-3) self-center mr-1">
            ⌜ struck ⌟
          </span>
          {detections.map((d, i) => (
            <span
              key={i}
              className="font-mono text-xs px-2 py-0.5 rounded border border-(--color-ink)/30 text-(--color-ink) bg-(--color-ink)/10"
              title={d.path}
            >
              {d.kind}
            </span>
          ))}
        </div>
      )}

      <label className="block text-xs font-mono text-(--color-fg-3) mb-1">
        {modified
          ? "as delivered to the agent (rewritten):"
          : "as delivered to the agent (unchanged):"}
      </label>
      <pre className="font-mono text-xs bg-(--color-panel) border border-(--color-border) rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
        {tryPretty(result.payload)}
      </pre>

      {modified && (
        <details className="mt-3">
          <summary className="text-xs font-mono text-(--color-fg-3) cursor-pointer hover:text-(--color-fg-2)">
            show the original as the server wrote it
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
