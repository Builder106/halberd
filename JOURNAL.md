# JOURNAL — Halberd

> Dated log of decisions, pivots, incidents, and quotes. Add entries as
> things happen — retrospectives need this raw material to land.
> Reverse-chronological; one paragraph max per entry.

## 2026-05-26 — Project kickoff #milestone #decision

Started Halberd as the next cybersecurity project after ClearHash. Goal: a
zero-trust JSON-RPC firewall sitting between an LLM agent and its MCP servers,
inspecting `tools/call` traffic for argument injection, capability creep, and
response-side prompt-injection payloads. Picked Go over OCaml (already
represented by `ocaml_limit`) and over Python (red-teaming harness was the
alternative; deferred). MIT license. Module path
`github.com/Builder106/halberd`.

## 2026-05-26 — Scaffold scope: P1 + P2 only #decision

Considered scaffolding all five phases as empty milestones. Rejected — the
"no half-finished implementations" rule from the global CLAUDE.md applies.
P1 (HTTP reverse proxy + audit bus) and P2 (YAML policy engine with
deny-pattern matching and unknown-tool blocking) ship as real working code in
the first pass; P3 (stdio transport), P4 (response inspection), and P5
(rule packs + hardening) live in the README roadmap.

## 2026-05-26 — Policy DSL: hand-rolled, not JSON Schema #decision

Considered pulling in `xeipuuv/gojsonschema` to validate `tools/call`
arguments against full JSON Schema. Rejected for v0.1: the policy DSL is
intentionally narrow (`type`, `max_length`, `deny_patterns`, `allow_values`)
and a hand-rolled validator keeps the dependency surface to one library
(`yaml.v3`). Reconsider in v0.2 if rule packs need `oneOf` / `anyOf` /
recursive shapes.

## 2026-05-26 — JSON-RPC error code -32000 for policy violations #decision

Picked the `-32000` server-defined error code for policy violations. The
JSON-RPC 2.0 spec reserves `-32000` through `-32099` for "implementation-
defined server errors." Halberd surfaces violations through this code so the
agent's MCP client treats them as recoverable upstream errors and (in
practice) reasons about why the tool failed rather than crashing the session.

## 2026-05-26 — Go toolchain not installed locally #incident

`go` not on PATH at scaffold time. Wrote `go.mod` by hand against Go 1.22.
Next step: `brew install go && cd Halberd && go mod tidy && go test ./...`
to verify the codebase compiles. CI will compile against a fresh toolchain
either way.
