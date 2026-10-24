import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TryRefusal } from "./TryRefusal";
import * as halberdLib from "../lib/halberd";

const engine = (result: object) => ({
  packs: () => "[]",
  evaluateRequest: vi.fn<(pack: string, payload: string) => string>(() => JSON.stringify(result)),
  evaluateResponse: vi.fn(() => "{}"),
  version: "test",
});

const submit = (sql?: string) => {
  if (sql !== undefined) fireEvent.change(screen.getByRole("textbox"), { target: { value: sql } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TryRefusal", () => {
  it("shows the match when the pack refuses the query", async () => {
    const e = engine({
      Blocked: true,
      Violations: [{ Category: "T2", Tool: "query", Field: "sql", Rule: "deny_pattern", Detail: 'matched "x" at offset 0: "DROP TABLE"' }],
    });
    vi.spyOn(halberdLib, "loadHalberd").mockResolvedValue(e);
    render(<TryRefusal />);
    submit();
    expect(screen.getByText("Loading the policy engine.")).toBeTruthy();
    expect(await screen.findByText("Refused: deny_pattern.")).toBeTruthy();
    expect(screen.getByText("DROP TABLE").tagName).toBe("MARK");
    expect(JSON.parse(e.evaluateRequest.mock.calls[0]![1]).params.arguments.sql).toBe("DROP TABLE students");
  });

  it("shows the detail when the refusal has no matched text", async () => {
    vi.spyOn(halberdLib, "loadHalberd").mockResolvedValue(
      engine({ Blocked: true, Violations: [{ Category: "T2", Tool: "query", Field: "sql", Rule: "max_length", Detail: "argument length 9000 exceeds max 8192" }] }),
    );
    render(<TryRefusal />);
    submit("x".repeat(9000));
    expect(await screen.findByText("argument length 9000 exceeds max 8192.")).toBeTruthy();
  });

  it("allows a harmless query", async () => {
    vi.spyOn(halberdLib, "loadHalberd").mockResolvedValue(engine({ Blocked: false, Violations: null }));
    render(<TryRefusal />);
    submit("SELECT 1");
    expect(await screen.findByText("Allowed.")).toBeTruthy();
  });

  it("treats a block without violations as allowed text", async () => {
    vi.spyOn(halberdLib, "loadHalberd").mockResolvedValue(engine({ Blocked: true, Violations: [] }));
    render(<TryRefusal />);
    submit();
    expect(await screen.findByText("Allowed.")).toBeTruthy();
  });

  it("reports a failed load", async () => {
    const spy = vi.spyOn(halberdLib, "loadHalberd").mockRejectedValue(new Error("no wasm"));
    render(<TryRefusal />);
    submit();
    expect(await screen.findByText("The policy engine did not load: no wasm")).toBeTruthy();
    spy.mockRejectedValue("offline");
    submit();
    expect(await screen.findByText("The policy engine did not load: offline")).toBeTruthy();
  });
});
