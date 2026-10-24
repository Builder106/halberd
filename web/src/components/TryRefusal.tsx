"use client";

import { useState, type FormEvent } from "react";
import { site } from "../data/session";
import { matchedText } from "../lib/envelope";
import { loadHalberd, parseDecision } from "../lib/halberd";

type Result =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "refused"; rule: string; detail: string }
  | { kind: "allowed" }
  | { kind: "error"; message: string };

// Exchange 4, live: send any SQL through the real engine with the same pack.
// The engine (about 1 MiB compressed) loads on the first send, not with the page.
export function TryRefusal() {
  const [sql, setSql] = useState("DROP TABLE students");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function send(e: FormEvent) {
    e.preventDefault();
    setResult({ kind: "busy" });
    try {
      const h = await loadHalberd();
      const envelope = { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "query", arguments: { sql } } };
      const d = parseDecision(h.evaluateRequest(site.pack, JSON.stringify(envelope)));
      const v = d.Violations?.[0];
      setResult(d.Blocked && v ? { kind: "refused", rule: v.Rule, detail: v.Detail } : { kind: "allowed" });
    } catch (err) {
      setResult({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form className="try" onSubmit={send}>
      <label className="try__label" htmlFor="try-sql">
        Write your own query and send it through the same pack.
      </label>
      <div className="try__row">
        <input
          id="try-sql"
          className="try__input"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="act" type="submit" disabled={result.kind === "busy"}>
          <span className="act__label">Send</span>
        </button>
      </div>
      <p className="try__out" aria-live="polite">
        <TryResult result={result} />
      </p>
    </form>
  );
}

function TryResult({ result }: { result: Result }) {
  switch (result.kind) {
    case "idle":
      return null;
    case "busy":
      return <>Loading the policy engine.</>;
    case "allowed":
      return (
        <>
          <strong>Allowed.</strong> Nothing in it matches the pack, so it would reach the database.
        </>
      );
    case "refused": {
      const text = matchedText(result.detail);
      return (
        <>
          <strong>Refused: {result.rule}.</strong>{" "}
          {text ? (
            <>
              The pack matched <mark className="hl">{text}</mark>. The server would never see it.
            </>
          ) : (
            <>{result.detail}.</>
          )}
        </>
      );
    }
    case "error":
      return <>The policy engine did not load: {result.message}</>;
  }
}
