import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Console } from "./Console";
import * as halberdLib from "../lib/halberd";

const packs = [
  { name: "mcp-server-postgres", server: "mcp-server-postgres", responseFilters: true },
  { name: "mcp-server-git", server: "mcp-server-git", responseFilters: true },
  { name: "no-presets-pack", server: "x", responseFilters: false },
];

function bridge(overrides: Partial<Awaited<ReturnType<typeof halberdLib.loadHalberd>>> = {}) {
  return {
    packs: () => JSON.stringify(packs),
    evaluateRequest: vi.fn((_pack: string, payload: string) => {
      if (payload.includes("DROP TABLE")) {
        return JSON.stringify({
          Blocked: true,
          Violations: [
            { Category: "T2_arg_injection", Tool: "query", Field: "sql", Rule: "deny_pattern", Detail: 'matched "x" at offset 0: "DROP TABLE"' },
          ],
        });
      }
      if (payload.includes("git_commit")) {
        return JSON.stringify({
          Blocked: true,
          Violations: [{ Category: "T4_capability_creep", Tool: "", Field: "", Rule: "unknown_tool", Detail: "tool not declared in policy bundle" }],
        });
      }
      if (payload.includes("NULLVIOLATIONS")) return JSON.stringify({ Blocked: true, Violations: null });
      if (payload.includes("THROWSTRING")) throw "plain failure";
      if (payload.includes("THROWERROR")) throw new Error("engine exploded");
      return JSON.stringify({ Blocked: false, Violations: null });
    }),
    evaluateResponse: vi.fn((_pack: string, payload: string) => {
      if (payload.includes("AKIA")) {
        return JSON.stringify({
          modified: true,
          payload: '{"jsonrpc":"2.0","id":1,"result":{"content":[{"text":"[REDACTED]","type":"text"}]}}',
          detections: [{ kind: "aws_access_key", path: "result.content[0].text" }],
        });
      }
      if (payload.includes("NODETECTIONS")) return JSON.stringify({ modified: true, payload, detections: null });
      return JSON.stringify({ modified: false, payload, detections: null });
    }),
    version: "test",
    ...overrides,
  };
}

const ready = async (b = bridge()) => {
  vi.spyOn(halberdLib, "loadHalberd").mockResolvedValue(b);
  render(<Console />);
  await screen.findByLabelText("Rule pack");
  return b;
};
const editor = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const send = () => fireEvent.click(screen.getByRole("button", { name: "Send through Halberd" }));
const verdict = () => screen.getByRole("region", { name: "Halberd verdict" });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Console", () => {
  it("shows a loading line, then the bench", async () => {
    await ready();
    expect(editor().value).toContain("SELECT id, name FROM students");
    expect(screen.getByText(/If the pack allows it/)).toBeTruthy();
  });

  it("shows the load error", async () => {
    vi.spyOn(halberdLib, "loadHalberd").mockRejectedValue(new Error("WASM init failed"));
    render(<Console />);
    expect(screen.getByText(/Loading the policy engine/)).toBeTruthy();
    expect(await screen.findByText("The policy engine did not load: WASM init failed")).toBeTruthy();
  });

  it("ignores a load that settles after unmount", async () => {
    let resolve!: (h: ReturnType<typeof bridge>) => void;
    let reject!: (e: Error) => void;
    const spy = vi.spyOn(halberdLib, "loadHalberd");
    spy.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<Console />).unmount();
    resolve(bridge());
    spy.mockReturnValueOnce(new Promise((_r, j) => (reject = j)));
    render(<Console />).unmount();
    reject(new Error("late"));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/late/)).toBeNull();
  });

  it("forwards an allowed request to the server side", async () => {
    await ready();
    send();
    expect(within(verdict()).getByText("Allowed")).toBeTruthy();
    expect(within(verdict()).getByText("Forwarded to the server unchanged.")).toBeTruthy();
  });

  it("refuses a request and shows the rule, field, tool and matched text", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "DROP TABLE (refused)" }));
    send();
    const v = verdict();
    expect(within(v).getByText("Refused")).toBeTruthy();
    expect(v.textContent).toContain("deny_pattern");
    expect(v.textContent).toContain("sql");
    expect(v.textContent).toContain("query");
    expect(within(v).getByText('"DROP TABLE"').tagName).toBe("MARK");
    expect(document.querySelector(".console--refused")).toBeTruthy();
  });

  it("refuses an unknown tool without field, tool or match", async () => {
    await ready();
    fireEvent.change(screen.getByLabelText("Rule pack"), { target: { value: "mcp-server-git" } });
    fireEvent.change(editor(), { target: { value: '{"method":"tools/call","params":{"name":"git_commit"}}' } });
    send();
    const v = verdict();
    expect(v.textContent).toContain("unknown_tool");
    expect(within(v).queryByText("Field")).toBeNull();
    expect(within(v).queryByText("Tool")).toBeNull();
  });

  it("handles a refusal with no violations listed", async () => {
    await ready();
    fireEvent.change(editor(), { target: { value: "NULLVIOLATIONS" } });
    send();
    expect(within(verdict()).getByText("Refused")).toBeTruthy();
  });

  it("reports engine exceptions as a refusal", async () => {
    await ready();
    fireEvent.change(editor(), { target: { value: "THROWERROR" } });
    send();
    expect(verdict().textContent).toContain("engine exploded");
    fireEvent.change(editor(), { target: { value: "THROWSTRING" } });
    send();
    expect(verdict().textContent).toContain("plain failure");
  });

  it("amends a reply and can show the original", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Response with embedded AWS key (amended)" }));
    expect(screen.getByText("JSON-RPC reply")).toBeTruthy();
    expect(screen.getByText(/It arrives on the assistant side/)).toBeTruthy();
    send();
    const v = verdict();
    expect(within(v).getByText("Amended")).toBeTruthy();
    expect(v.textContent).toContain("aws_access_key");
    expect(within(v).getByLabelText("Delivered to the assistant").textContent).toContain("[REDACTED]");
    expect(within(v).getByText("Show the reply as the server sent it")).toBeTruthy();
  });

  it("amends with no detections listed, and delivers unchanged replies", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "A reply from the server" }));
    fireEvent.change(editor(), { target: { value: "NODETECTIONS" } });
    send();
    expect(within(verdict()).getByText("Amended")).toBeTruthy();
    fireEvent.change(editor(), { target: { value: '{"result":{}}' } });
    send();
    expect(within(verdict()).getByText("Delivered to the assistant unchanged.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "A request to the server" }));
    expect(screen.getByText("JSON-RPC request")).toBeTruthy();
  });

  it("switches packs, loading the first example or clearing the editor", async () => {
    await ready();
    fireEvent.change(screen.getByLabelText("Rule pack"), { target: { value: "mcp-server-git" } });
    expect(editor().value).toContain("git_status");
    fireEvent.change(screen.getByLabelText("Rule pack"), { target: { value: "no-presets-pack" } });
    expect(editor().value).toBe("");
    expect(screen.queryByText("Examples")).toBeNull();
  });
});
