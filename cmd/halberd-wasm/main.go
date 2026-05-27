// Command halberd-wasm is the policy engine compiled for browsers. Build
// with `scripts/build-wasm.sh`; the output (`halberd.wasm`) and Go's
// `wasm_exec.js` glue land in `web/public/`. The web playground loads
// both and calls the engine's request/response evaluators entirely
// client-side.
//
// The engine is literally the same code that ships in halberd-http and
// halberd-stdio — `internal/policy.Engine` — so the playground's
// decisions match production behavior byte-for-byte.
//
//go:build js && wasm

package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
	"syscall/js"

	"github.com/Builder106/halberd/internal/policy"
)

// The build script copies policies/*.yaml into ./policies/ before the
// WASM build, because Go's //go:embed forbids `..` paths and these rule
// packs live at the repo root, not under cmd/halberd-wasm/.
//
//go:embed policies/*.yaml
var packsFS embed.FS

// engines is the pre-compiled engine for each bundled rule pack. Built
// once at WASM startup so per-evaluate calls don't pay regex compile
// cost — the same hot-path optimization the binaries use.
var engines = map[string]*policy.Engine{}

func main() {
	if err := loadBundles(); err != nil {
		fmt.Println("halberd-wasm: load bundles:", err)
		return
	}

	js.Global().Set("halberd", js.ValueOf(map[string]any{
		"packs":            js.FuncOf(packsFn),
		"evaluateRequest":  js.FuncOf(evaluateRequestFn),
		"evaluateResponse": js.FuncOf(evaluateResponseFn),
		"version":          "0.1.0-wasm",
	}))

	fmt.Println("halberd-wasm: engine ready,", len(engines), "rule packs loaded")

	// Block forever so the JS side keeps a reference to the loaded module
	// and the runtime's goroutine doesn't exit. Standard syscall/js pattern.
	select {}
}

func loadBundles() error {
	entries, err := packsFS.ReadDir("policies")
	if err != nil {
		return fmt.Errorf("read embedded policies: %w", err)
	}
	for _, ent := range entries {
		if ent.IsDir() || !strings.HasSuffix(ent.Name(), ".yaml") {
			continue
		}
		raw, err := packsFS.ReadFile("policies/" + ent.Name())
		if err != nil {
			return fmt.Errorf("read %s: %w", ent.Name(), err)
		}
		bundle, err := policy.ParseBundle(raw)
		if err != nil {
			return fmt.Errorf("parse %s: %w", ent.Name(), err)
		}
		name := strings.TrimSuffix(ent.Name(), ".yaml")
		engines[name] = policy.New(bundle)
	}
	return nil
}

// packsFn returns the list of available rule pack identifiers plus
// human-readable metadata (server name, tool count, response-filter
// status) for the UI's picker.
func packsFn(_ js.Value, _ []js.Value) any {
	type packInfo struct {
		Name            string `json:"name"`
		Server          string `json:"server"`
		ResponseFilters bool   `json:"responseFilters"`
	}
	out := make([]packInfo, 0, len(engines))
	for name, e := range engines {
		out = append(out, packInfo{
			Name:            name,
			Server:          e.Server(),
			ResponseFilters: e.HasResponseFilters(),
		})
	}
	b, _ := json.Marshal(out)
	return string(b)
}

func evaluateRequestFn(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return jsErr("evaluateRequest(pack, payload)")
	}
	pack := args[0].String()
	payload := args[1].String()

	e, ok := engines[pack]
	if !ok {
		return jsErr("unknown pack: " + pack)
	}

	d := e.EvaluateRequest([]byte(payload))
	b, err := json.Marshal(d)
	if err != nil {
		return jsErr("marshal decision: " + err.Error())
	}
	return string(b)
}

func evaluateResponseFn(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return jsErr("evaluateResponse(pack, payload)")
	}
	pack := args[0].String()
	payload := args[1].String()

	e, ok := engines[pack]
	if !ok {
		return jsErr("unknown pack: " + pack)
	}

	r := e.EvaluateResponse([]byte(payload))
	// Re-shape so the UI gets a uniform { modified, payload, detections }
	// envelope back as a single JSON string.
	out := struct {
		Modified   bool              `json:"modified"`
		Payload    string            `json:"payload"`
		Detections []policy.Detection `json:"detections"`
	}{
		Modified:   r.Modified,
		Payload:    string(r.Payload),
		Detections: r.Detections,
	}
	b, _ := json.Marshal(out)
	return string(b)
}

func jsErr(msg string) any {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}
