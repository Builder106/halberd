#!/usr/bin/env bash
# Build halberd-wasm and stage it for the web playground.
#
# Inputs:
#   - cmd/halberd-wasm/main.go  (Go source, build-tagged js+wasm)
#   - policies/*.yaml           (rule packs to embed in the binary)
#   - $(go env GOROOT)/lib/wasm/wasm_exec.js  (Go's WASM glue)
#
# Outputs:
#   - web/public/halberd.wasm
#   - web/public/wasm_exec.js
#
# Why the policies are copied: Go's //go:embed forbids `..` paths, and
# the rule packs live at the repo root rather than under cmd/halberd-wasm.
# A staging copy keeps the embed-side path local and the source of truth
# in policies/.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

stage="cmd/halberd-wasm/policies"
out_wasm="web/public/halberd.wasm"
out_glue="web/public/wasm_exec.js"

echo "==> Staging rule packs into $stage"
mkdir -p "$stage"
# Clean stale copies; nothing else lives in this directory.
find "$stage" -maxdepth 1 -name '*.yaml' -delete
cp policies/*.yaml "$stage/"

echo "==> Building halberd.wasm"
mkdir -p "$(dirname "$out_wasm")"
GOOS=js GOARCH=wasm go build -trimpath -ldflags='-s -w' \
  -o "$out_wasm" ./cmd/halberd-wasm

# Go 1.24+ moved wasm_exec.js from misc/wasm/ to lib/wasm/. Probe both.
goroot=$(go env GOROOT)
glue_candidates=(
  "$goroot/lib/wasm/wasm_exec.js"
  "$goroot/misc/wasm/wasm_exec.js"
)
glue=""
for candidate in "${glue_candidates[@]}"; do
  if [[ -f "$candidate" ]]; then
    glue="$candidate"
    break
  fi
done
if [[ -z "$glue" ]]; then
  echo "ERROR: could not find wasm_exec.js under $goroot" >&2
  exit 1
fi

echo "==> Copying $glue"
cp "$glue" "$out_glue"

size=$(wc -c < "$out_wasm" | tr -d ' ')
echo "==> Done. halberd.wasm = $((size / 1024)) KiB"
