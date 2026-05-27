// QA tests for the halberd-wasm bridge. These tests exercise the JS-
// facing API that cmd/halberd-wasm/main.go exposes via syscall/js —
// the layer between the React playground and Halberd's
// internal/policy engine that wasn't covered by any Go test.
//
// The Go engine itself has thorough unit + property tests under
// internal/policy/; what THESE tests catch is drift between the Go
// engine's return shapes and the JS wrapper's serialization
// (e.g. someone renames a Decision field in Go and forgets to update
// halberd.evaluateRequest's JSON shape).

import { test, expect } from "@playwright/test";

// Shape of the API we expect the WASM module to register. The actual
// methods return JSON strings (syscall/js is friendliest with
// primitives), so callers JSON.parse on the JS side. We mirror that
// here rather than reaching into the WASM internals.
type HalberdBridge = {
  packs: () => string;
  evaluateRequest: (pack: string, payload: string) => string;
  evaluateResponse: (pack: string, payload: string) => string;
  version: string;
};

declare global {
  // eslint-disable-next-line no-var
  var halberd: HalberdBridge | undefined;
}

test.beforeEach(async ({ page }) => {
  // The bridge is registered inside go.run(instance), which is
  // started after WebAssembly.instantiateStreaming resolves. The
  // playground's loader (web/src/lib/halberd.ts) handles all that
  // — we just wait for the global to land.
  await page.goto("/");
  await page.waitForFunction(() => typeof globalThis.halberd === "object", {
    timeout: 15_000,
  });
});

test("packs() returns the five bundled rule packs with metadata", async ({
  page,
}) => {
  const json = await page.evaluate(() => globalThis.halberd!.packs());
  const packs = JSON.parse(json) as Array<{
    name: string;
    server: string;
    responseFilters: boolean;
  }>;

  const names = packs.map((p) => p.name).sort();
  expect(names).toEqual([
    "halberd-honeypot",
    "mcp-server-filesystem",
    "mcp-server-git",
    "mcp-server-github",
    "mcp-server-postgres",
  ]);

  // All v0.1 packs ship with response_filters enabled (the rule
  // packs catalog has matched secret scanners). Verify the bridge
  // is forwarding the bundle's HasResponseFilters() correctly.
  for (const p of packs) {
    expect(p.responseFilters).toBe(true);
    expect(p.server).toBeTruthy();
  }
});

test("evaluateRequest blocks DROP TABLE under the postgres pack", async ({
  page,
}) => {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "query", arguments: { sql: "DROP TABLE users" } },
  });

  const decision = await page.evaluate(
    ([pack, payload]) =>
      JSON.parse(globalThis.halberd!.evaluateRequest(pack, payload)),
    ["mcp-server-postgres", payload],
  );

  expect(decision.Blocked).toBe(true);
  expect(decision.Violations).toBeTruthy();
  expect(decision.Violations.length).toBeGreaterThan(0);
  expect(decision.Violations[0].Category).toBe("T2_arg_injection");
  expect(decision.Violations[0].Field).toBe("sql");
  expect(decision.Violations[0].Rule).toBe("deny_pattern");
  expect(decision.Violations[0].Detail).toMatch(/DROP TABLE/);
});

test("evaluateRequest allows a safe SELECT under the postgres pack", async ({
  page,
}) => {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "query",
      arguments: { sql: "SELECT id, name FROM students LIMIT 10" },
    },
  });

  const decision = await page.evaluate(
    ([pack, payload]) =>
      JSON.parse(globalThis.halberd!.evaluateRequest(pack, payload)),
    ["mcp-server-postgres", payload],
  );

  expect(decision.Blocked).toBe(false);
  // Violations is `null` when nothing fires — explicit guard so a
  // future schema change to `[]` would fail loudly.
  expect(decision.Violations).toBeNull();
});

test("evaluateResponse redacts AWS / GitHub / RSA secrets under the honeypot pack", async ({
  page,
}) => {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [
        {
          type: "text",
          text:
            "rows:\n" +
            "  alice  aws_key=AKIAIOSFODNN7EXAMPLE\n" +
            "  bob    gh_token=ghp_" + "A".repeat(36) + "\n" +
            "  carol  ssh_key=-----BEGIN RSA PRIVATE KEY-----\n" +
            "    MIIBOgIBAAJBAK...[FIXTURE]\n" +
            "    -----END RSA PRIVATE KEY-----",
        },
      ],
    },
  });

  const result = await page.evaluate(
    ([pack, payload]) =>
      JSON.parse(globalThis.halberd!.evaluateResponse(pack, payload)),
    ["halberd-honeypot", payload],
  );

  expect(result.modified).toBe(true);
  expect(result.payload).not.toContain("AKIAIOSFODNN7EXAMPLE");
  expect(result.payload).not.toContain("ghp_AAAA");
  expect(result.payload).not.toContain("BEGIN RSA PRIVATE KEY");
  expect(result.payload).toContain("[REDACTED]");

  const kinds = (result.detections ?? []).map((d: { kind: string }) => d.kind);
  expect(kinds).toContain("aws_access_key");
  expect(kinds).toContain("github_token");
  expect(kinds).toContain("rsa_private_key");
});

test("evaluateRequest returns an error envelope for an unknown pack", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    JSON.parse(
      globalThis.halberd!.evaluateRequest(
        "no-such-pack",
        '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"q","arguments":{}}}',
      ),
    ),
  );

  // The bridge returns `{error: "..."}` for invalid inputs rather
  // than throwing — easier for the playground UI to render.
  expect(result.error).toMatch(/unknown pack/i);
});

test("evaluateRequest blocks malformed JSON-RPC envelopes without crashing", async ({
  page,
}) => {
  const decision = await page.evaluate(() =>
    JSON.parse(
      globalThis.halberd!.evaluateRequest(
        "mcp-server-postgres",
        "{ this is not json",
      ),
    ),
  );

  expect(decision.Blocked).toBe(true);
  expect(decision.Violations[0].Category).toBe("malformed_request");
});

test("payloads round-trip multi-byte unicode without mangling", async ({
  page,
}) => {
  // The Decision.Detail field will quote the matched substring; if
  // the WASM bridge's string marshalling mishandles UTF-8, the
  // emoji and CJK characters here will surface as garbage in the
  // returned JSON.
  const sql = "SELECT '🗡️ 守護者 ⛨'; DROP TABLE users";
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "query", arguments: { sql } },
  });

  const decision = await page.evaluate(
    ([pack, payload]) =>
      JSON.parse(globalThis.halberd!.evaluateRequest(pack, payload)),
    ["mcp-server-postgres", payload],
  );

  expect(decision.Blocked).toBe(true);
  // Detail contains the matched portion of the SQL — confirm the
  // bytes survived JSON.stringify → syscall/js → Go string → JSON
  // marshal → JSON.parse. The DROP TABLE is what matched, not the
  // emoji, but a UTF-8 mishandle would corrupt the offset and
  // therefore the substring.
  expect(decision.Violations[0].Detail).toMatch(/DROP TABLE/);
});

test("the bridge advertises a version string", async ({ page }) => {
  const version = await page.evaluate(() => globalThis.halberd!.version);
  expect(version).toBeTruthy();
  expect(typeof version).toBe("string");
});
