# Halberd roadmap

Halberd can be built from source and tried as a local developer tool. Its first binary release is still pending. The policy checks are specific to each rule pack; Halberd is not a general prompt-injection detector or an operating-system sandbox.

## Next: first developer release

- [x] Validate policy files strictly. Unknown keys, invalid defaults, extra YAML documents, and incompatible argument constraints now fail at load time.
- [x] Inspect configured response filters on JSON-RPC results, including complete HTTP SSE events and gzip responses. Unsupported encodings and malformed filtered events fail closed.
- [x] Default the HTTP listener to loopback, reject cross-origin browser requests, and stop the stdio wrapper when its child exits.
- [x] Verify the source build: Go lint, vet, race tests, and 100% policy-package coverage; web lint, type checks, 40 unit tests, eight WebAssembly bridge tests, and 17 browser flow scenarios.
- [ ] Test against a real stdio MCP server and a real Streamable HTTP server. Check initialization, tool discovery, an allowed call, a refused call, a filtered response, and shutdown.
- [ ] Run a GoReleaser snapshot and inspect the archives for all four binaries, the example policy, and the bundled rule packs. Smoke-test an extracted archive on a supported platform.
- [ ] Cut and verify the first tagged release. Until then, use the [source build instructions](README.md#install).

## v0.2: narrower I/O boundaries

- **T3 path and network rules:** Add path canonicalization and explicit filesystem-root and destination allowlists. Specify how symlinks, redirects, DNS changes, and private address ranges are handled before calling this an I/O guard. Pattern denylists in today's bundles do not provide that boundary.
- **Array-valued arguments:** Let policies check every element of arguments such as `read_multiple_files`. The current filesystem pack denies those tools rather than claiming to inspect their arrays.
- **Tool inventory changes:** Check `tools/list_changed` notifications as well as calls to tools absent from a bundle. Today the request-side unknown-tool check is the guard.
- **Browser policy editor:** Let developers edit and test a policy bundle in the WebAssembly playground. Keep the YAML and the evaluation result visible so the browser does not hide what rule actually matched.

## Later: ecosystem and observability

- Check calls against an upstream server's tool schema during session setup, with a defined response when that schema changes.
- Add `halberd init <mcp-server>` to generate a starter policy from tool definitions. Generated rules need review before use.
- Expose decision counts, audit drops, and latency through standard metrics.

## Outside Halberd's scope

Halberd does not inspect raw model prompts, audit MCP server source code, manage identities, or guarantee that pattern-based filters catch every hostile instruction or secret. See the [threat model](docs/threat-model.md) for the current enforcement boundary and the [policy DSL](docs/policy-dsl.md) for supported rules.
