// @vitest-environment node
// The session page claims every verdict on it comes from the real engine.
// This test holds it to that: it loads public/halberd.wasm in Node and runs
// each scripted request and reply through the same pack the page names.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInThisContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { audit, exchanges, refusal, site, verdictOf } from "./session";

type Bridge = {
  evaluateRequest: (pack: string, payload: string) => string;
  evaluateResponse: (pack: string, payload: string) => string;
};

const pub = join(__dirname, "../../public");
let engine: Bridge;

beforeAll(async () => {
  runInThisContext(readFileSync(join(pub, "wasm_exec.js"), "utf8"));
  const Go = (globalThis as unknown as { Go: new () => { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => Promise<void> } }).Go;
  const go = new Go();
  const { instance } = await WebAssembly.instantiate(readFileSync(join(pub, "halberd.wasm")), go.importObject);
  void go.run(instance);
  for (let i = 0; i < 200 && !(globalThis as { halberd?: Bridge }).halberd; i++) await new Promise((r) => setTimeout(r, 10));
  engine = (globalThis as unknown as { halberd: Bridge }).halberd;
}, 30_000);

describe("the session matches the policy engine", () => {
  for (const x of exchanges) {
    it(`request ${x.id} is ${x.violation ? "refused" : "allowed"} as shown`, () => {
      const d = JSON.parse(engine.evaluateRequest(site.pack, JSON.stringify(x.request)));
      expect(d.Blocked).toBe(Boolean(x.violation));
      expect(d.Violations?.[0] ?? undefined).toEqual(x.violation);
      if (x.match) expect(JSON.stringify(x.request)).toContain(x.match);
    });

    if (x.response) {
      it(`reply ${x.id} is ${x.delivered ? "amended" : "unchanged"} as shown`, () => {
        const r = JSON.parse(engine.evaluateResponse(site.pack, JSON.stringify(x.response)));
        expect(r.modified).toBe(Boolean(x.delivered));
        expect((r.detections ?? []).map((d: { kind: string }) => d.kind)).toEqual(x.detections ?? []);
        if (x.delivered) expect(JSON.parse(r.payload)).toEqual(x.delivered);
      });
    }
  }
});

describe("session helpers", () => {
  it("builds Halberd's -32000 reply the way the proxy does", () => {
    const x = exchanges.find((e) => e.id === 4)!;
    expect(refusal(x)).toEqual({
      jsonrpc: "2.0",
      id: 4,
      error: { code: -32000, message: "halberd: deny_pattern on sql", data: [x.violation] },
    });
  });

  it("names a verdict for every exchange", () => {
    expect(exchanges.map(verdictOf)).toEqual(["allowed", "allowed", "amended", "refused", "refused", "refused", "amended"]);
  });

  it("writes a request record for every exchange and a reply record only when a filter changed it", () => {
    expect(audit.filter((r) => r.line.direction === "request")).toHaveLength(exchanges.length);
    expect(audit.filter((r) => r.line.direction === "response").map((r) => r.exchange)).toEqual([3, 7]);
    expect(audit[0].line).not.toHaveProperty("tool");
    expect(audit.find((r) => r.exchange === 4)!.line).toMatchObject({ tool: "query", blocked: true });
  });
});
