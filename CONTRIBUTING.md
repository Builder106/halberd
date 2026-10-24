# Contributing to Halberd

Thanks for the interest. Halberd is small and opinionated; this document
exists so we don't waste each other's time on PRs that won't land.

## Dev setup

```bash
brew install go         # or your platform's equivalent
git clone https://github.com/Builder106/halberd
cd halberd
go mod tidy
go test ./...
```

To run the HTTP proxy against a remote MCP server:

```bash
go build -o bin/halberd-http ./cmd/halberd-http
./bin/halberd-http --policy policies/mcp-server-postgres.yaml \
                   --target  http://localhost:8080 \
                   --listen  127.0.0.1:9090
```

To wrap a local stdio MCP server (Claude Desktop / Cursor style):

```bash
go build -o bin/halberd-stdio ./cmd/halberd-stdio
./bin/halberd-stdio --policy policies/mcp-server-postgres.yaml \
                    --audit  halberd-stdio.jsonl \
                    -- mcp-server-postgres --conn-string "$PG_CONN"
```

To run the full v0.1 surface against the deliberately-vulnerable
honeypot (the demo target — never point at production data):

```bash
go build -o bin/ ./cmd/...
./bin/halberd-stdio --policy policies/halberd-honeypot.yaml \
                    --audit  halberd.jsonl \
                    -- ./bin/halberd-honeypot
```

See [`cmd/halberd-honeypot/README.md`](cmd/halberd-honeypot/README.md)
for the threat-coverage table.

## Project-specific guardrails

- **Measure policy latency.** The policy engine sits on every JSON-RPC request.
  Run `go test -bench=. -benchmem ./internal/policy` for changes to the hot
  path and compare the result with the benchmark output from CI. CI records
  timings but does not enforce a latency threshold.

- **No third-party dependencies without a strong reason.** Halberd currently

  depends on the Go standard library and `gopkg.in/yaml.v3`. Adding a
  dependency requires a paragraph in the PR description explaining why a
  stdlib equivalent does not work.

- **Rule packs are data, not code.** New protections for a specific MCP

  server go in `policies/<server-name>.yaml`, not in `internal/policy/`.

- **The engine is IO-free.** `internal/policy`does not import`os`, `net`,

  or `io`. Anything that talks to the outside world goes in `cmd/` or
  `internal/transport/`or`internal/audit/`.

## Commit and PR conventions

- Imperative-mood subject line ≤ 72 chars.
- Body explains *why*. The diff already explains *what*.
- One logical change per PR. If a refactor and a feature land together, split

  them — refactor first.

- All tests pass and `go vet ./...` is clean before opening the PR.

## Out of scope (please don't open these PRs)

- **WebSocket transport.** Deprecated in the 2025-06 MCP spec; Halberd only

  supports stdio and streamable HTTP+SSE.

- **TLS termination / mTLS.** Offload to a reverse proxy in front of Halberd

  (nginx, Caddy, Envoy).

- **A web UI / dashboard.** The audit log is JSONL on disk; pipe it into

  whatever you already use.

- **Real-time LLM-based response classification.** Latency budget kills it.

  Future v0.2 may add an async out-of-band classifier; in-band is not on the
  table.

- **Distributed clustering / replication.** Halberd is a single-process

  proxy. Run one per upstream MCP server.

## Cutting a release

Releases are tag-driven. Pushing a `v*` tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which
runs goreleaser against the tag and publishes a GitHub Release with
multi-arch archives.

```bash

# 1. Make sure main is green and the JOURNAL has a release entry

gh run list --limit 1
$EDITOR JOURNAL.md

# 2. Dry-run goreleaser locally — catches config or build errors before

#    they fail in CI

goreleaser release --snapshot --clean --skip=announce,publish

# 3. Tag and push. The release workflow takes over from here

git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0

# 4. Watch the run; the release lands at

#    https://github.com/Builder106/halberd/releases/tag/v0.1.0

gh run watch
```

Goreleaser injects the tag value as `main.version` at link time, so
`halberd version`and the`halberd-honeypot` startup banner both report
the actual release version. Snapshot builds report `<next>-next-<sha>`.

## Maintaining visual assets

The README uses [`assets/banner-dark.svg`](assets/banner-dark.svg) and
[`assets/banner-light.svg`](assets/banner-light.svg), both 1200×420. Phone
layouts are [`assets/banner-mobile-dark.svg`](assets/banner-mobile-dark.svg)
and [`assets/banner-mobile-light.svg`](assets/banner-mobile-light.svg), both
640×500. Its `<picture>` element selects the layout and color scheme.
The Cormorant Garamond wordmark and Manrope caption are outlined, so the
banners render without installed fonts or external requests. Edit these SVGs
directly in a vector editor.

The 1200×630 link-preview card has an editable
[`SVG source`](assets/social-preview.svg) and a
[`PNG export`](assets/social-preview.png). A repository administrator can
upload the PNG through **Settings > Social preview > Upload an image**.

[`assets/favicon.svg`](assets/favicon.svg) is designed for legibility at
32×32. The app also serves the mark as [`/icon.svg`](web/src/app/icon.svg) and
a four-size [`/favicon.ico`](web/src/app/favicon.ico) for clients that request
that path. [`assets/apple-touch-icon.svg`](assets/apple-touch-icon.svg) is the
editable source for the 180×180 [iOS icon](assets/apple-touch-icon.png).
Instructions for editing
and exporting the policy illustration are in
[`assets/diagrams/README.md`](assets/diagrams/README.md).

### Recording demos

The console recordings come from the
[`Gherkin demo suite`](web/e2e/demo/). Run `cd web && npm run demo` to record
them again. Each clip has a GIF and an H.264 MP4 in `assets/demo/`.

The terminal demo uses
[`scripts/demo/honeypot-demo.sh`](scripts/demo/honeypot-demo.sh). Record it
with `asciinema rec --command ./scripts/demo/honeypot-demo.sh assets/honeypot-demo.cast`,
then export the GIF with
`agg --theme github-dark assets/honeypot-demo.cast assets/honeypot-demo.gif`.

## Reporting security issues

Do **not** open a public GitHub issue for a vulnerability in Halberd itself.
Email <vaughanolayinka@gmail.com> with the subject prefix `[halberd security]`.
