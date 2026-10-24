"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { matchedText, reindent, segments } from "../lib/envelope";
import {
  loadHalberd,
  parseDecision,
  parsePacks,
  parseResponseResult,
  type Decision,
  type PackInfo,
  type ResponseResult,
} from "../lib/halberd";
import { presets, type Preset } from "../lib/presets";

type Halberd = Awaited<ReturnType<typeof loadHalberd>>;
type Engine = { kind: "loading" } | { kind: "ready"; h: Halberd; packs: PackInfo[] } | { kind: "error"; message: string };

type Output =
  | { kind: "idle" }
  | { kind: "request"; decision: Decision; sent: string }
  | { kind: "response"; result: ResponseResult; sent: string };

type Direction = Preset["direction"];

const DEFAULT_PACK = "mcp-server-postgres";

// The console on the session's three lanes. A request is written on the
// assistant side and either reaches the server lane or stops at the line; a
// response is written on the server side and arrives on the assistant side,
// amended or not. The engine is the real one, running in this tab.
export function Console() {
  const [engine, setEngine] = useState<Engine>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadHalberd()
      .then((h) => {
        if (!cancelled) setEngine({ kind: "ready", h, packs: parsePacks(h.packs()) });
      })
      .catch((err: Error) => {
        if (!cancelled) setEngine({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (engine.kind === "loading") {
    return <p className="console__state">Loading the policy engine. It is about 1 MiB over the wire.</p>;
  }
  if (engine.kind === "error") {
    return <p className="console__state">The policy engine did not load: {engine.message}</p>;
  }
  return <Bench h={engine.h} packs={engine.packs} />;
}

function Bench({ h, packs }: { h: Halberd; packs: PackInfo[] }) {
  const [pack, setPack] = useState(DEFAULT_PACK);
  const [direction, setDirection] = useState<Direction>(presets[DEFAULT_PACK][0].direction);
  const [payload, setPayload] = useState(presets[DEFAULT_PACK][0].payload);
  const [output, setOutput] = useState<Output>({ kind: "idle" });

  const packPresets = useMemo(() => presets[pack] ?? [], [pack]);

  const applyPreset = useCallback((p: Preset) => {
    setPayload(p.payload);
    setDirection(p.direction);
    setOutput({ kind: "idle" });
  }, []);

  const changePack = useCallback(
    (next: string) => {
      setPack(next);
      const first = presets[next]?.[0];
      if (first) applyPreset(first);
      else setPayload("");
    },
    [applyPreset],
  );

  const send = useCallback(() => {
    try {
      if (direction === "request") {
        setOutput({ kind: "request", decision: parseDecision(h.evaluateRequest(pack, payload)), sent: payload });
      } else {
        setOutput({ kind: "response", result: parseResponseResult(h.evaluateResponse(pack, payload)), sent: payload });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setOutput({
        kind: "request",
        decision: { Blocked: true, Violations: [{ Category: "engine_error", Tool: "", Field: "", Rule: "exception", Detail: detail }] },
        sent: payload,
      });
    }
  }, [direction, h, pack, payload]);

  const refused = output.kind === "request" && output.decision.Blocked;

  return (
    <div className={`console console--${direction}${refused ? " console--refused" : ""}`}>
      <div className="console__pack">
        <label className="field__label" htmlFor="pack">
          Rule pack
        </label>
        <select id="pack" className="field__select" value={pack} onChange={(e) => changePack(e.target.value)}>
          {packs.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="console__editor">
        <fieldset className="toggle">
          <legend className="field__label">Message</legend>
          {(
            [
              ["request", "A request to the server"],
              ["response", "A reply from the server"],
            ] as const
          ).map(([d, label]) => (
            <button
              key={d}
              type="button"
              className="toggle__opt"
              aria-pressed={direction === d}
              onClick={() => {
                setDirection(d);
                setOutput({ kind: "idle" });
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>

        {packPresets.length > 0 ? (
          <div className="examples">
            <p className="field__label" id="examples-label">
              Examples
            </p>
            <ul className="examples__list" aria-labelledby="examples-label">
              {packPresets.map((p) => (
                <li key={p.id}>
                  <button type="button" className="examples__opt" onClick={() => applyPreset(p)}>
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="field__label" htmlFor="payload">
          {direction === "request" ? "JSON-RPC request" : "JSON-RPC reply"}
        </label>
        <textarea
          id="payload"
          className="field__code"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
          rows={14}
        />
        <button type="button" className="act act--wide" onClick={send}>
          <span className="act__label">Send through Halberd</span>
        </button>
      </div>

      <div className="console__rail" aria-hidden="true" />

      <section className="console__out" aria-live="polite" aria-label="Halberd verdict">
        {output.kind === "idle" ? (
          <p className="console__hint">
            {direction === "request"
              ? "Send the request. If the pack allows it, it lands on the server side. If not, Halberd answers on the assistant side."
              : "Send the reply. It arrives on the assistant side as delivered, with anything the filters changed."}
          </p>
        ) : output.kind === "request" ? (
          <RequestVerdict decision={output.decision} sent={output.sent} />
        ) : (
          <ResponseVerdict result={output.result} sent={output.sent} />
        )}
      </section>
    </div>
  );
}

function RequestVerdict({ decision, sent }: { decision: Decision; sent: string }) {
  if (!decision.Blocked) {
    return (
      <div className="verdict verdict--allowed">
        <p className="verdict__word">Allowed</p>
        <p className="verdict__line">Forwarded to the server unchanged.</p>
        <pre className="env__code">
          <code>{reindent(sent)}</code>
        </pre>
      </div>
    );
  }
  const violations = decision.Violations ?? [];
  return (
    <div className="verdict verdict--refused">
      <p className="verdict__word">Refused</p>
      <p className="verdict__line">Halberd answered the assistant with error -32000. Nothing reached the server.</p>
      {violations.map((v, i) => {
        const hit = matchedText(v.Detail);
        return (
          <dl key={i} className="violation">
            <dt>Rule</dt>
            <dd>{v.Rule}</dd>
            {v.Field ? (
              <>
                <dt>Field</dt>
                <dd>{v.Field}</dd>
              </>
            ) : null}
            {v.Tool ? (
              <>
                <dt>Tool</dt>
                <dd>{v.Tool}</dd>
              </>
            ) : null}
            <dt>Category</dt>
            <dd>{v.Category}</dd>
            <dt>Detail</dt>
            <dd className="violation__detail">
              {segments(v.Detail, hit ? [`"${hit}"`] : []).map((s, j) =>
                s.hit ? (
                  <mark key={j} className="hl">
                    {s.text}
                  </mark>
                ) : (
                  s.text
                ),
              )}
            </dd>
          </dl>
        );
      })}
    </div>
  );
}

function ResponseVerdict({ result, sent }: { result: ResponseResult; sent: string }) {
  const detections = result.detections ?? [];
  return (
    <div className={`verdict verdict--${result.modified ? "amended" : "allowed"}`}>
      <p className="verdict__word">{result.modified ? "Amended" : "Allowed"}</p>
      <p className="verdict__line">
        {result.modified
          ? `The filters changed it: ${detections.map((d) => d.kind).join(", ")}.`
          : "Delivered to the assistant unchanged."}
      </p>
      <pre className="env__code" aria-label="Delivered to the assistant">
        <code>{reindent(result.payload)}</code>
      </pre>
      {result.modified ? (
        <details className="original">
          <summary>Show the reply as the server sent it</summary>
          <pre className="env__code">
            <code>{reindent(sent)}</code>
          </pre>
        </details>
      ) : null}
    </div>
  );
}
