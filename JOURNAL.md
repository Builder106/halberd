# JOURNAL — Halberd

> Dated log of decisions, pivots, incidents, and quotes. Add entries as
> things happen — retrospectives need this raw material to land.
> Reverse-chronological; one paragraph max per entry.

## 2026-05-26 — Full green CI after four iterations #milestone

After the initial red run, four follow-up commits to get all four jobs
(test, bench, govulncheck, golangci-lint) green: (1) bumped Go from 1.22
to stable for stdlib CVE fixes, (2) discovered golangci-lint 2.12.2 was
built with Go 1.25 and can't parse 1.26's stdlib export data — pinned CI
to 1.25 (still in N-1 patch support), (3) bumped golangci-lint-action v6
→ v7 (v6 doesn't support golangci-lint v2 — CI told me directly), (4)
migrated `.golangci.yml` to v2 schema (formatters split out, `version: "2"`
discriminator), fixed gofmt struct-tag alignment, tightened audit-log
file mode to 0o600 (gosec G302), and added doc comments on every
exported identifier in `internal/audit`, `internal/jsonrpc`,
`internal/policy`, and `internal/transport/http`. Lesson: golangci-lint
loses races with the Go release cycle reliably — always pin to N-1
unless you've verified support for current. Final green run: 26460291188.

## 2026-05-26 — First CI run red on stdlib CVEs and lint nits #incident #decision

First push of the scaffold tripped govulncheck because CI pinned Go 1.22,
which has unpatched CVEs in `crypto/tls`, `crypto/x509`, `net`, and
`net/http` reachable from `http.Server.ListenAndServe` and
`httputil.ReverseProxy.ServeHTTP`. Local Go 1.26.3 doesn't have those.
Decision: keep `go.mod` at `go 1.22` as the floor for downstream users,
but switch CI's `setup-go` to `go-version: stable` so the vulnerability
scan reflects what a fresh install gets. golangci-lint also flagged four
nits in `internal/transport/http/proxy_test.go` (two unused `r
*http.Request` params, two unchecked `w.Write` returns) — fixed in the
same commit `f5c0ff4`.

## 2026-05-26 — First green build + baseline bench numbers #milestone

`go test ./...` and `go test -race ./...` pass on first run after install
(Go 1.26.3 from Homebrew). Build produces both `halberd` and `halberd-http`
binaries cleanly. Initial bench on Apple M1: blocked DROP TABLE evaluates
in **2.6 µs/op at 31 allocs/op**, an allowed SELECT in **4.0 µs/op at 25
allocs/op**. Both an order of magnitude under the 200 µs / 50-alloc
ceilings declared in CONTRIBUTING. The 25–31 allocs/op number is mostly
`json.Unmarshal` of the JSON-RPC params (decoded twice — once in `peek` for
the audit-log tool name, once in `evaluateToolCall`). Single-pass decode is
the obvious future optimization but not load-bearing for v0.1.

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
