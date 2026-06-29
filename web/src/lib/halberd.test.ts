import { describe, it, expect } from "vitest";
import { parsePacks, parseDecision, parseResponseResult } from "./halberd";

describe("parsePacks", () => {
  it("puts mcp-server-postgres first", () => {
    const input = JSON.stringify([
      { name: "mcp-server-git", server: "stdio", responseFilters: false },
      { name: "mcp-server-postgres", server: "stdio", responseFilters: true },
      { name: "halberd-honeypot", server: "stdio", responseFilters: true },
    ]);
    const result = parsePacks(input);
    expect(result[0].name).toBe("mcp-server-postgres");
  });

  it("puts halberd-honeypot last", () => {
    const input = JSON.stringify([
      { name: "halberd-honeypot", server: "stdio", responseFilters: true },
      { name: "mcp-server-git", server: "stdio", responseFilters: false },
    ]);
    const result = parsePacks(input);
    expect(result[result.length - 1].name).toBe("halberd-honeypot");
  });

  it("sorts remaining packs alphabetically between postgres and honeypot", () => {
    const input = JSON.stringify([
      { name: "mcp-server-z", server: "stdio", responseFilters: false },
      { name: "mcp-server-a", server: "stdio", responseFilters: false },
      { name: "mcp-server-postgres", server: "stdio", responseFilters: true },
      { name: "halberd-honeypot", server: "stdio", responseFilters: true },
    ]);
    const result = parsePacks(input);
    expect(result.map((p) => p.name)).toEqual([
      "mcp-server-postgres",
      "mcp-server-a",
      "mcp-server-z",
      "halberd-honeypot",
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(parsePacks("[]")).toEqual([]);
  });
});

describe("parseDecision", () => {
  it("parses a blocked decision", () => {
    const payload = JSON.stringify({
      Blocked: true,
      Violations: [
        { Category: "sql", Tool: "query", Field: "sql", Rule: "drop", Detail: "DROP TABLE" },
      ],
    });
    const d = parseDecision(payload);
    expect(d.Blocked).toBe(true);
    expect(d.Violations).toHaveLength(1);
    expect(d.Violations![0].Rule).toBe("drop");
  });

  it("parses an allowed decision with null violations", () => {
    const payload = JSON.stringify({ Blocked: false, Violations: null });
    const d = parseDecision(payload);
    expect(d.Blocked).toBe(false);
    expect(d.Violations).toBeNull();
  });

  it("throws when the response contains an error field", () => {
    expect(() => parseDecision(JSON.stringify({ error: "pack not found" }))).toThrow(
      "pack not found",
    );
  });
});

describe("parseResponseResult", () => {
  it("parses a modified result with detections", () => {
    const payload = JSON.stringify({
      modified: true,
      payload: '{"redacted":true}',
      detections: [{ kind: "aws-key", path: "result.content[0].text" }],
    });
    const r = parseResponseResult(payload);
    expect(r.modified).toBe(true);
    expect(r.detections).toHaveLength(1);
    expect(r.detections![0].kind).toBe("aws-key");
  });

  it("parses an unmodified result with null detections", () => {
    const payload = JSON.stringify({ modified: false, payload: '{"ok":true}', detections: null });
    const r = parseResponseResult(payload);
    expect(r.modified).toBe(false);
    expect(r.detections).toBeNull();
  });

  it("throws when the response contains an error field", () => {
    expect(() => parseResponseResult(JSON.stringify({ error: "engine error" }))).toThrow(
      "engine error",
    );
  });
});
