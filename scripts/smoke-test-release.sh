#!/usr/bin/env bash
# Smoke-test release snapshot archives built by GoReleaser.
#
# Inspects archives for all four binaries (halberd, halberd-http,
# halberd-stdio, halberd-honeypot), example policy, bundled rule packs,
# verifies checksums, extracts the host platform archive, and smoke-tests
# the extracted binaries against both stdio and HTTP transports.
#
# Usage:
#   ./scripts/smoke-test-release.sh [--skip-build]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_BUILD=0
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=1
fi

# Locate goreleaser if building
GORELEASER_BIN=""
if [[ $SKIP_BUILD -eq 0 ]]; then
  if command -v goreleaser >/dev/null 2>&1; then
    GORELEASER_BIN="goreleaser"
  elif [[ -x "$(go env GOPATH)/bin/goreleaser" ]]; then
    GORELEASER_BIN="$(go env GOPATH)/bin/goreleaser"
  elif [[ -x "$HOME/platform/sdk/go/bin/goreleaser" ]]; then
    GORELEASER_BIN="$HOME/platform/sdk/go/bin/goreleaser"
  elif [[ -x "$HOME/go/bin/goreleaser" ]]; then
    GORELEASER_BIN="$HOME/go/bin/goreleaser"
  else
    echo "ERROR: goreleaser not found in PATH or GOPATH/bin." >&2
    echo "Install with: go install github.com/goreleaser/goreleaser/v2@latest" >&2
    exit 1
  fi
fi

if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "==> Running GoReleaser snapshot build..."
  "$GORELEASER_BIN" release --snapshot --clean --skip=announce,publish
else
  echo "==> Skipping GoReleaser build (--skip-build specified)..."
fi

DIST_DIR="$REPO_ROOT/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "ERROR: dist/ directory does not exist." >&2
  exit 1
fi

echo "==> Verifying sha256 checksums..."
(cd "$DIST_DIR" && sha256sum -c checksums.txt)

EXPECTED_TARGETS=(
  "darwin_amd64"
  "darwin_arm64"
  "linux_amd64"
  "linux_arm64"
)

REQUIRED_FILES=(
  "halberd"
  "halberd-honeypot"
  "halberd-http"
  "halberd-stdio"
  "halberd.example.yaml"
  "policies/halberd-honeypot.yaml"
  "policies/mcp-server-filesystem.yaml"
  "policies/mcp-server-git.yaml"
  "policies/mcp-server-github.yaml"
  "policies/mcp-server-postgres.yaml"
  "docs/policy-dsl.md"
  "docs/threat-model.md"
  "README.md"
  "LICENSE"
  "CONTRIBUTING.md"
)

echo "==> Inspecting archives for expected files..."
for target in "${EXPECTED_TARGETS[@]}"; do
  archive=$(ls "$DIST_DIR"/halberd_*_"${target}".tar.gz 2>/dev/null | head -n 1)
  if [[ -z "$archive" || ! -f "$archive" ]]; then
    echo "ERROR: Missing expected archive for target $target" >&2
    exit 1
  fi

  echo "  Checking $(basename "$archive")..."
  archive_contents=$(tar -ztf "$archive")

  for req in "${REQUIRED_FILES[@]}"; do
    if ! echo "$archive_contents" | grep -Fxq "$req"; then
      echo "ERROR: Archive $(basename "$archive") is missing required file: $req" >&2
      exit 1
    fi
  done
done
echo "==> All target archives contain all four binaries, example policy, and rule packs."

# Determine host platform archive
HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  x86_64)  HOST_ARCH="amd64" ;;
  aarch64) HOST_ARCH="arm64" ;;
esac

HOST_TARGET="${HOST_OS}_${HOST_ARCH}"
HOST_ARCHIVE=$(ls "$DIST_DIR"/halberd_*_"${HOST_TARGET}".tar.gz 2>/dev/null | head -n 1)

if [[ -z "$HOST_ARCHIVE" || ! -f "$HOST_ARCHIVE" ]]; then
  echo "NOTICE: Current platform ($HOST_TARGET) does not match built archives; skipping execution smoke-test."
  exit 0
fi

echo "==> Smoke-testing extracted archive for host platform ($HOST_TARGET)..."
TMP_DIR=$(mktemp -d -t halberd-smoke-XXXXXX)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

tar -xzf "$HOST_ARCHIVE" -C "$TMP_DIR"

# 1. halberd CLI version and lint
echo "  Testing halberd version..."
VERSION_OUTPUT=$("$TMP_DIR/halberd" version)
echo "    Reported version: $VERSION_OUTPUT"
if [[ "$VERSION_OUTPUT" == "dev" || -z "$VERSION_OUTPUT" ]]; then
  echo "ERROR: Expected version injected by GoReleaser, got: '$VERSION_OUTPUT'" >&2
  exit 1
fi

echo "  Testing halberd lint on example policy..."
"$TMP_DIR/halberd" lint "$TMP_DIR/halberd.example.yaml" >/dev/null

echo "  Testing halberd lint on bundled rule packs..."
for p in "$TMP_DIR"/policies/*.yaml; do
  "$TMP_DIR/halberd" lint "$p" >/dev/null
done

# 2. Stdio smoke-test (halberd-stdio wrapping halberd-honeypot)
echo "  Testing stdio transport (halberd-stdio + halberd-honeypot)..."
STDIO_AUDIT="$TMP_DIR/stdio_audit.jsonl"
STDIO_OUT="$TMP_DIR/stdio_out.jsonl"

INIT_REQ='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}'
LIST_REQ='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
CALL_ALLOWED='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"SELECT 1;"}}}'
CALL_REFUSED='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"DROP TABLE users;"}}}'

printf '%s\n%s\n%s\n%s\n' "$INIT_REQ" "$LIST_REQ" "$CALL_ALLOWED" "$CALL_REFUSED" | \
  "$TMP_DIR/halberd-stdio" --policy "$TMP_DIR/policies/halberd-honeypot.yaml" --audit "$STDIO_AUDIT" -- "$TMP_DIR/halberd-honeypot" > "$STDIO_OUT" 2>/dev/null

if ! grep -q '"id":1' "$STDIO_OUT" || ! grep -q '"serverInfo"' "$STDIO_OUT"; then
  echo "ERROR: Stdio initialize failed" >&2
  exit 1
fi
if ! grep -q '"id":2' "$STDIO_OUT" || ! grep -q '"execute_sql"' "$STDIO_OUT"; then
  echo "ERROR: Stdio tools/list failed" >&2
  exit 1
fi
if ! grep -q '"id":3' "$STDIO_OUT" || ! grep -q 'ok: executed' "$STDIO_OUT"; then
  echo "ERROR: Stdio allowed tools/call failed" >&2
  exit 1
fi
if ! grep -q '"id":4' "$STDIO_OUT" || ! grep -q '"code":-32000' "$STDIO_OUT"; then
  echo "ERROR: Stdio refused tools/call was not blocked" >&2
  exit 1
fi
if [[ ! -s "$STDIO_AUDIT" ]]; then
  echo "ERROR: Stdio audit log is empty" >&2
  exit 1
fi

# 3. HTTP smoke-test (halberd-http proxying to halberd-honeypot --listen)
echo "  Testing Streamable HTTP transport (halberd-http + halberd-honeypot)..."
# Allocate two free loopback ports
get_free_port() {
  python3 -c 'import socket; s = socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()'
}
UPSTREAM_PORT=$(get_free_port)
PROXY_PORT=$(get_free_port)

HTTP_AUDIT="$TMP_DIR/http_audit.jsonl"

"$TMP_DIR/halberd-honeypot" --listen "127.0.0.1:$UPSTREAM_PORT" >/dev/null 2>&1 &
HONEYPOT_PID=$!

"$TMP_DIR/halberd-http" \
  --listen "127.0.0.1:$PROXY_PORT" \
  --target "http://127.0.0.1:$UPSTREAM_PORT" \
  --policy "$TMP_DIR/policies/halberd-honeypot.yaml" \
  --audit "$HTTP_AUDIT" >/dev/null 2>&1 &
PROXY_PID=$!

cleanup_processes() {
  kill "$PROXY_PID" 2>/dev/null || true
  kill "$HONEYPOT_PID" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup_processes EXIT

# Wait for proxy to become ready
for _ in {1..50}; do
  if curl -sf "http://127.0.0.1:$PROXY_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

# Test HTTP allowed call
HTTP_ALLOWED=$(curl -sf -X POST "http://127.0.0.1:$PROXY_PORT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"SELECT 1;"}}}')
if ! echo "$HTTP_ALLOWED" | grep -q 'ok: executed'; then
  echo "ERROR: HTTP allowed call failed: $HTTP_ALLOWED" >&2
  exit 1
fi

# Test HTTP refused call
HTTP_REFUSED=$(curl -sf -X POST "http://127.0.0.1:$PROXY_PORT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"DROP TABLE users;"}}}')
if ! echo "$HTTP_REFUSED" | grep -q '"code":-32000'; then
  echo "ERROR: HTTP refused call was not blocked: $HTTP_REFUSED" >&2
  exit 1
fi

# Test HTTP scrubbed response (fake credentials)
HTTP_SCRUBBED=$(curl -sf -X POST "http://127.0.0.1:$PROXY_PORT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"list_users","arguments":{}}}')
if ! echo "$HTTP_SCRUBBED" | grep -q '\[REDACTED\]'; then
  echo "ERROR: HTTP response filtering failed to redact secrets: $HTTP_SCRUBBED" >&2
  exit 1
fi

if [[ ! -s "$HTTP_AUDIT" ]]; then
  echo "ERROR: HTTP audit log is empty" >&2
  exit 1
fi

kill "$PROXY_PID" 2>/dev/null || true
kill "$HONEYPOT_PID" 2>/dev/null || true

echo "==> GoReleaser snapshot release and smoke test PASSED successfully!"
