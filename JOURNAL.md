# JOURNAL — Halberd

> Dated log of decisions, pivots, incidents, and quotes. Add entries as
> things happen — retrospectives need this raw material to land.
> Reverse-chronological; one paragraph max per entry.

## 2026-05-26 — Filed upstream API feature request; community/community gates API-created discussions #milestone #incident

Halberd's goreleaser pipeline can do everything except set the GitHub
repo's social-preview image — that's still a web-UI-only operation in
2026. Filed a refreshed feature request at
[community/community#197021](https://github.com/orgs/community/discussions/197021)
(Apps, API and Webhooks → Product Feedback → API) referencing the
3.5-year-old precedent at #32166 and framing the 2026 use case
(agentic release workflows, MCP-server tooling layer, security-tooling
release pipelines). Proposed `PUT /repos/{owner}/{repo}/social-preview`
plus a GraphQL `updateRepository(input: { socialPreview: Upload })`
mirror; downstream landing pads in `cli/cli` and
`github/github-mcp-server` follow once the platform endpoint exists.

**Lesson worth recording**: community/community runs a bot that
auto-closes any discussion missing the `source:ui` label. That label is
only applied by the discussion-template form on the web; the GraphQL
`createDiscussion` mutation bypasses templates entirely, so the bot
killed the first attempt (#197020) ~10 minutes after I filed it via
`gh api`. Re-filed via UI as #197021 — same body, picked the dropdowns
that the template requires. Takeaway: for repos that gate intake on
template labels, the GraphQL discussion API is a footgun. Worth
checking `.github/DISCUSSION_TEMPLATE/*.yml` before automating
discussion creation against any community repo.

## 2026-05-26 — Release infrastructure: social card + goreleaser #milestone

Two release-prep items shipped:

- **Social-preview card** at `assets/social-preview.{svg,png}`, 1200×630.
  Adapts the existing banner's color palette (dark slate, purple→cyan
  accent stripe, halberd silhouette) to the wider 1.9:1 ratio used by
  link-share cards. GitHub's REST API doesn't expose social-preview as
  a settable field — needs manual upload via Settings → Social preview.
  Documented in the README's branding-assets section.
- **goreleaser** config at `.goreleaser.yaml` + release workflow at
  `.github/workflows/release.yml`. Tag-driven (`v*`); builds 4 binaries
  × 4 OS/arch targets (linux/darwin × amd64/arm64), bundles each archive
  with LICENSE/README/CONTRIBUTING + every rule pack + the example
  bundle + threat-model and policy-DSL docs, generates a SHA-256
  checksum manifest, and publishes a GitHub Release. Skipped Windows
  for v0.1 — halberd-stdio's PTY-free stdio handoff isn't tested there
  and the audience is Unix-first.

Two decisions worth recording:

- **`const version` → `var version`.** Goreleaser injects the tag value
  via `-ldflags "-X main.version=…"`, which only works on package vars.
  cmd/halberd and cmd/halberd-honeypot both updated. Snapshot dry-run
  confirms the binary now reports the resolved tag (or `<next>-next-<sha>`
  for snapshot builds).
- **No Docker image yet.** Goreleaser can build images, but Halberd is
  a process-mode proxy that mostly runs alongside its host (Claude
  Desktop, Cursor, etc.), not in a container. Docker shippable later
  when there's a real ops story for the remote / k8s deployment.

Validated locally with `goreleaser release --snapshot --clean
--skip=announce,publish`: 16 cross-compiles + 4 archives + checksums
in 57s, every binary present in every archive, version injection
working. Ready for the first real tag push.

## 2026-05-26 — halberd-honeypot ships #milestone

Added `cmd/halberd-honeypot`: a minimal stdio MCP server (~200 LOC) whose
four tools each embody one of the v0.1 threat categories. Pairs with
`halberd-stdio` and a matched `policies/halberd-honeypot.yaml` bundle for
a one-command end-to-end demo:

```
halberd-stdio --policy policies/halberd-honeypot.yaml --audit out.jsonl
              -- halberd-honeypot
```

Pipe in a `DROP TABLE`, a `../../etc/passwd`, or a `list_users` call and
watch Halberd block / redact / audit before the agent sees the response.
Smoke test in this session exercised all three behaviors in one pipe
invocation: two requests blocked with synthetic `-32000` errors, one
response with three redactions (AWS / GitHub / RSA), full audit trail.

Three decisions worth recording:

- **Not in `testdata/`, in `cmd/`.** `testdata/` is Go-specific magic
  that gets excluded from `go build ./...`. The honeypot is a real
  binary that's *intended* to be built and run — just never against
  production data. Calling it `cmd/halberd-honeypot` plus a banner that
  prints "VULNERABLE BY DESIGN" on startup communicates intent better
  than burying it in a fixture directory.
- **No build tag.** I considered `//go:build honeypot` to keep it out
  of default builds. Rejected — the honeypot is a positive feature
  (the test fixture that proves the whole stack works), not an
  embarrassment to hide. Documented prominently, no gating.
- **`tools/list_changed` deferred.** T4 (capability creep) needs a
  stateful interaction sequence: server advertises N tools, agent calls
  one, server then pushes a notification adding tool N+1. The honeypot
  doesn't simulate this in v0.1 — its tool list is static. v0.2 adds a
  trigger tool that emits the notification on demand so operators can
  exercise mid-session inventory drift.

11 honeypot-side tests cover the protocol (initialize, tools/list,
notification suppression, unknown-method errors) and each tool's
threat-shaped output. Combined with the existing transport and policy
suites, Halberd's test surface now exceeds 60 cases.

## 2026-05-26 — P5 rule packs + hardening shipped (v0.1 feature-complete) #milestone

Three new rule packs land alongside the existing postgres pack:
`mcp-server-{filesystem,git,github}`. 28 declared tools total across the
four packs, 19 table-driven scenarios in
`internal/policy/packs_test.go` covering both block-and-allow paths.
Each pack is calibrated against a specific threat set documented in the
file header, not a generic "all tools allowed" stance — write-mutating
tools default to denied, array-arg tools are omitted (v0.1 DSL is
scalar-only), and the github pack ships with a `your-org` placeholder
operators must edit before deploying.

Hardening that came along for the ride:
- **`internal/audit/bus_test.go`**: 9 tests covering JSONL framing, time
  stamping, drop-when-full, post-Stop drop semantics, Stop idempotence,
  ctx-deadline honoring, nil-ctx safety, and a conservation property
  (sent == written + dropped) under 16-goroutine × 256-record load.
  Closed the bus's zero-coverage gap.
- **CI actions bumped to Node-24-native majors** ahead of the June 2,
  2026 deadline: `actions/checkout@v5`, `actions/setup-go@v6`,
  `actions/upload-artifact@v5`. The deprecation warnings drop;
  `golangci/golangci-lint-action@v7` stays put for now (v7 was the
  latest as of the migration to golangci-lint v2 last week).

v0.1 covers four of the five threat categories (T1, T2, T4, T5) over
both HTTP and stdio transports. T3 (out-of-scope I/O) is the v0.2
roadmap. Halberd is feature-complete for v0.1.

## 2026-05-26 — Bus.Record race: random select biased the post-Stop drop #incident

The first audit-bus tests exposed a subtle correctness gap: `Bus.Record`
used a single select that watched `<-done`, the buffered send, and a
default branch all as peers. Go picks randomly among ready cases, so a
post-Stop Record sometimes landed in the still-buffered channel rather
than dropping — but the drain goroutine had already exited, so that
event was silently lost (neither written nor counted). Fix: split into a
priority check on `done` first (return early if closed), then a
non-blocking send attempt. Now Record's contract is "after Stop, every
event is counted as dropped" without race. Lesson: when a select has a
done-signal AND a buffered-send case, the done-signal must be checked
first — otherwise Go's random selection silently breaks the priority
invariant operators expect.

## 2026-05-26 — P4 response inspection shipped #milestone #decision

Halberd now sanitizes JSON-RPC responses in both transports: T1 (tool
poisoning via ANSI / zero-width Unicode) and T5 (secret exfiltration via
AWS / GitHub / RSA keys) are covered on the response side. Sanitize-in-
place strategy, not block-with-error — the agent already invoked the
tool, suppressing the response leaves it confused; redacting bad bits
preserves the call's usefulness. Three load-bearing decisions:

- **JSON-tree walk, not raw-byte regex.** ANSI escapes get encoded as
  `` on the wire, not raw ESC. Zero-width chars may be raw UTF-8
  *or* `​`. Scanning raw bytes would miss the JSON-encoded forms.
  The walker unmarshals the envelope, recursively descends `result`,
  sanitizes each string leaf, and re-marshals. `id`, `jsonrpc`, and
  `error` are kept as `json.RawMessage` so protocol metadata round-trips
  byte-exact.
- **SSE skipped in v0.1.** Buffering a `text/event-stream` body to scan
  it would break the streaming contract; per-event inspection lands in
  P4.5 / v0.2. The HTTP `ModifyResponse` short-circuits on
  `Content-Type: text/event-stream`.
- **Opt-in per bundle.** `response_filters: nil` is the fast path —
  transports skip the response-buffering entirely via
  `engine.HasResponseFilters()`. Bundles that only do request-side
  enforcement pay zero response overhead.

Detection records carry `{kind, path}` only — never the matched secret
itself. Logging the very thing we were redacting would defeat the point.

## 2026-05-26 — JSON fixture gotcha: raw ESC bytes are invalid JSON #incident

First run of the response-inspection tests failed with "expected
modification, got none." Root cause: I had embedded raw `\x1b` bytes in
test JSON fixtures using backtick raw strings. RFC 8259 requires control
characters (U+0000–U+001F) to be escaped in JSON strings; Go's
`json.Unmarshal` rejects unescaped ESC, so `EvaluateResponse` fell
through to its "non-JSON, pass through" branch. Fixed by writing ``
in the JSON — which is also what real MCP servers send on the wire.
Lesson: when authoring JSON-RPC test fixtures, paste the on-the-wire
representation, not the post-decode form.

## 2026-05-26 — P3 stdio transport shipped #milestone #decision

Halberd now wraps stdio MCP servers (Claude Desktop, Cursor, Windsurf).
The `halberd-stdio` binary forks the real server, owns its stdin/stdout/
stderr pipes, and runs the policy engine between the host and child in
both directions. Three correctness decisions worth recording:

- **Plain pipes, not a PTY.** MCP stdio is line-delimited JSON-RPC with
  no terminal semantics, and a PTY's line-discipline translation would
  silently corrupt binary content in tool arguments. Earlier planning
  notes called this a "PTY wrapper" — the implementation is `exec.Cmd`
  pipes with newline framing.
- **Blocked notifications drop silently.** JSON-RPC notifications have
  no `id` and the spec forbids a response, so a blocked notification is
  audited but produces no synthetic error. Blocked requests (with `id`)
  still get a `-32000` JSON-RPC error response with the original id
  preserved.
- **Audit log requires a `--path` flag.** Defaulting to stderr would
  collide with the child server's stderr (which we transparently forward
  to the host), corrupting the audit stream. Operator-aware path is the
  safe default.

## 2026-05-26 — Audit bus send-on-closed-channel race fixed #incident

The new stdio tests caught a real bug in `internal/audit`: `Bus.Stop`
called `close(b.ch)` while `Bus.Record` was still selecting on
`b.ch <- e`. The race detector flagged it; in production this would
panic intermittently when a transport's `Stop` raced with an in-flight
audit. Fixed by switching to a `done` channel — `Stop` closes `done`,
`Record` selects on `done` first and counts a dropped event if the bus
has stopped, and the channel itself is never closed. Property tested
under `-race`: 0 panics across the full suite. Lesson: never close a
channel that has multiple senders without a happens-before guarantee on
all of them.

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
