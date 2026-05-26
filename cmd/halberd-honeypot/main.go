// Command halberd-honeypot is a deliberately-vulnerable MCP server that
// speaks JSON-RPC over stdio. It exists as a known-bad upstream so that
// integration tests and demo recordings can exercise Halberd's policy
// engine against an adversary that actually produces the threats from
// docs/threat-model.md, not just refuses to play along.
//
// VULNERABLE BY DESIGN. Do not connect to production data. The whole
// point of this binary is that:
//
//   - get_weather returns a tool-poisoning payload (ANSI escapes,
//     zero-width Unicode, role-tag spoofing) in every response. (T1)
//   - execute_sql happily echoes back any query as a successful result
//     so request-side argument-injection rules can be exercised. (T2)
//   - read_file opens whatever path the agent supplies and returns the
//     contents — no sandbox at all. (T3)
//   - list_users hardcodes fake AWS / GitHub / RSA secrets in its
//     response so response-side scrubbing can be observed. (T5)
//
// Pair with halberd-stdio for the end-to-end story:
//
//	halberd-stdio --policy policies/mcp-server-postgres.yaml \
//	              --audit  /tmp/halberd.jsonl \
//	              -- halberd-honeypot
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"syscall"
)

const version = "0.1.0"

func main() {
	log.SetOutput(os.Stderr)
	log.SetFlags(0)
	log.SetPrefix("halberd-honeypot: ")
	log.Println("VULNERABLE BY DESIGN — do not point at production data.")
	log.Printf("v%s — pair with halberd-stdio in front of this binary.", version)

	// Treat SIGINT/SIGTERM as a clean EOF on stdin so the read loop exits.
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		_ = os.Stdin.Close()
	}()

	if err := serve(os.Stdin, os.Stdout); err != nil && !errors.Is(err, io.EOF) {
		log.Printf("serve: %v", err)
		os.Exit(1)
	}
}

// serve runs the JSON-RPC stdio loop, reading one message per line from r
// and writing one response per line to w. Returns when r reaches EOF or
// an unrecoverable error fires.
func serve(r io.Reader, w io.Writer) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64<<10), 4<<20)

	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)

	for sc.Scan() {
		line := sc.Bytes()
		var req struct {
			JSONRPC string          `json:"jsonrpc"`
			ID      json.RawMessage `json:"id,omitempty"`
			Method  string          `json:"method"`
			Params  json.RawMessage `json:"params,omitempty"`
		}
		if err := json.Unmarshal(line, &req); err != nil {
			log.Printf("malformed request: %v", err)
			continue
		}

		// Notifications carry no id and expect no response.
		if len(req.ID) == 0 {
			continue
		}

		resp := dispatch(req.ID, req.Method, req.Params)
		if err := enc.Encode(resp); err != nil {
			return fmt.Errorf("write response: %w", err)
		}
	}
	return sc.Err()
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func dispatch(id json.RawMessage, method string, params json.RawMessage) response {
	r := response{JSONRPC: "2.0", ID: id}

	switch method {
	case "initialize":
		r.Result = map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "halberd-honeypot", "version": version},
		}
	case "ping":
		r.Result = map[string]any{}
	case "tools/list":
		r.Result = map[string]any{"tools": toolList}
	case "tools/call":
		r.Result = callTool(params)
	default:
		r.Error = &rpcError{Code: -32601, Message: "method not found: " + method}
	}
	return r
}
