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
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// version is set at link time by goreleaser via `-X main.version=<tag>`.
// Local builds report "dev".
var (
	version    = "dev"
	listenAddr = flag.String("listen", "", "listen address for streamable HTTP MCP server (default stdio)")
)

func main() {
	flag.Parse()

	log.SetOutput(os.Stderr)
	log.SetFlags(0)
	log.SetPrefix("halberd-honeypot: ")
	log.Println("VULNERABLE BY DESIGN — do not point at production data.")
	log.Printf("v%s — pair with halberd-stdio or halberd-http in front of this binary.", version)

	if *listenAddr != "" {
		if err := serveHTTP(*listenAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("serve HTTP: %v", err)
			os.Exit(1)
		}
		return
	}

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

// serveHTTP starts a streamable HTTP server for MCP on the given address.
func serveHTTP(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer func() { _ = ln.Close() }()

	log.Printf("listening on http://%s", ln.Addr().String())

	srv := &http.Server{
		Handler:           newHTTPHandler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	idleClosed := make(chan struct{})
	go func() {
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(idleClosed)
	}()

	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	<-idleClosed
	return nil
}

// newHTTPHandler constructs an http.Handler that handles JSON-RPC requests,
// supporting both standard JSON and Server-Sent Events (SSE) streaming responses.
func newHTTPHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			if r.URL.Path == "/health" || r.URL.Path == "/" {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("halberd-honeypot ok\n"))
				return
			}
			if r.URL.Path == "/sse" {
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("Cache-Control", "no-cache")
				w.Header().Set("Connection", "keep-alive")
				_, _ = fmt.Fprintf(w, "event: endpoint\ndata: /message\n\n")
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
				return
			}
		}

		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read error", http.StatusBadRequest)
			return
		}
		_ = r.Body.Close()

		var req struct {
			JSONRPC string          `json:"jsonrpc"`
			ID      json.RawMessage `json:"id,omitempty"`
			Method  string          `json:"method"`
			Params  json.RawMessage `json:"params,omitempty"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "malformed JSON-RPC", http.StatusBadRequest)
			return
		}

		if len(req.ID) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		resp := dispatch(req.ID, req.Method, req.Params)
		respBytes, err := json.Marshal(resp)
		if err != nil {
			http.Error(w, "marshal error", http.StatusInternalServerError)
			return
		}

		isSSE := strings.Contains(r.Header.Get("Accept"), "text/event-stream") ||
			r.URL.Path == "/sse" ||
			r.URL.Query().Get("stream") == "true"

		if isSSE {
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")
			_, _ = fmt.Fprintf(w, "data: %s\n\n", respBytes)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(respBytes)
	})
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

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type ServerCapabilities struct {
	Tools map[string]struct{} `json:"tools"`
}

type InitializeResult struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ServerCapabilities `json:"capabilities"`
	ServerInfo      ServerInfo         `json:"serverInfo"`
}

type ToolsListResult struct {
	Tools []Tool `json:"tools"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func dispatch(id json.RawMessage, method string, params json.RawMessage) response {
	r := response{JSONRPC: "2.0", ID: id}

	switch method {
	case "initialize":
		r.Result, _ = json.Marshal(InitializeResult{
			ProtocolVersion: "2024-11-05",
			Capabilities:    ServerCapabilities{Tools: map[string]struct{}{}},
			ServerInfo:      ServerInfo{Name: "halberd-honeypot", Version: version},
		})
	case "ping":
		r.Result = json.RawMessage(`{}`)
	case "tools/list":
		r.Result, _ = json.Marshal(ToolsListResult{Tools: toolList})
	case "tools/call":
		r.Result, _ = json.Marshal(callTool(params))
	case "shutdown":
		r.Result = json.RawMessage(`null`)
	default:
		r.Error = &rpcError{Code: -32601, Message: "method not found: " + method}
	}
	return r
}
