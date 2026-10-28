package http

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Builder106/halberd/internal/audit"
	"github.com/Builder106/halberd/internal/jsonrpc"
	"github.com/Builder106/halberd/internal/policy"
)

const testBundle = `
version: 1
server: test
tools:
  - name: query
    arguments:
      sql:
        type: string
        deny_patterns: ['(?i)\bdrop\s+table\b']
defaults: { unknown_tool: deny, unknown_method: log_and_pass }
`

func newTestProxy(t *testing.T, upstream http.Handler) (handler http.Handler, audited *bytes.Buffer, cleanup func()) {
	t.Helper()
	srv := httptest.NewServer(upstream)
	u, _ := url.Parse(srv.URL)

	bundle, err := policy.ParseBundle([]byte(testBundle))
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}

	auditBuf := &bytes.Buffer{}
	bus := audit.NewBus(auditBuf, 16)
	engine := policy.New(bundle)
	return NewHandler(u, engine, bus), auditBuf, func() {
		srv.Close()
		_ = bus // bus drains async; tests that inspect audit log call time.Sleep before reading
	}
}

func TestProxy_ForwardsAllowedRequest(t *testing.T) {
	upstreamHit := false
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHit = true
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "SELECT") {
			t.Errorf("upstream did not see SELECT, got %s", body)
		}
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{}}`))
	})

	h, _, cleanup := newTestProxy(t, upstream)
	defer cleanup()

	w := httptest.NewRecorder()
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT 1"}}}`)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !upstreamHit {
		t.Fatal("upstream not reached for allowed request")
	}
}

func TestProxy_BlocksDropTable(t *testing.T) {
	upstreamHit := false
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		upstreamHit = true
		w.WriteHeader(http.StatusOK)
	})

	h, _, cleanup := newTestProxy(t, upstream)
	defer cleanup()

	w := httptest.NewRecorder()
	body := []byte(`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"query","arguments":{"sql":"DROP TABLE students"}}}`)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	h.ServeHTTP(w, r)

	if upstreamHit {
		t.Fatal("upstream reached despite policy block")
	}
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (JSON-RPC error in body)", w.Code)
	}

	var resp jsonrpc.Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error == nil || resp.Error.Code != jsonrpc.CodePolicyViolation {
		t.Fatalf("expected policy violation error, got %+v", resp)
	}
	if string(resp.ID) != "7" {
		t.Errorf("response id = %s, want 7", string(resp.ID))
	}
}

const responseFilterBundle = `
version: 1
server: test
tools:
  - name: query
    arguments: {}
defaults: { unknown_tool: deny, unknown_method: log_and_pass }
response_filters:
  global:
    strip_ansi_escapes: true
    secret_scanners: [aws_access_key]
`

func TestProxy_SanitizesResponse(t *testing.T) {
	// Upstream sends a response with an embedded AWS key. Halberd must
	// redact it before the client sees the body.
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"db user AKIAIOSFODNN7EXAMPLE"}]}}`))
	})
	srv := httptest.NewServer(upstream)
	defer srv.Close()

	u, _ := url.Parse(srv.URL)
	bundle, err := policy.ParseBundle([]byte(responseFilterBundle))
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	h := NewHandler(u, policy.New(bundle), bus)

	w := httptest.NewRecorder()
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{}}}`)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	h.ServeHTTP(w, r)

	if strings.Contains(w.Body.String(), "AKIAIOSFODNN7EXAMPLE") {
		t.Errorf("AWS key leaked through response inspector: %s", w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "[REDACTED]") {
		t.Errorf("redaction placeholder missing: %s", w.Body.String())
	}
	if cl := w.Header().Get("Content-Length"); cl != strconv.Itoa(w.Body.Len()) {
		t.Errorf("Content-Length = %q, want %d", cl, w.Body.Len())
	}
}

func TestProxy_ResponseBodySizeLimit(t *testing.T) {
	tests := []struct {
		name       string
		response   []byte
		wantStatus int
	}{
		{
			name:       "exact limit",
			response:   responseBodyOfSize(t, maxResponseBytes),
			wantStatus: http.StatusOK,
		},
		{
			name:       "over limit",
			response:   responseBodyOfSize(t, maxResponseBytes+1),
			wantStatus: http.StatusBadGateway,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write(tt.response)
			})
			srv := httptest.NewServer(upstream)
			defer srv.Close()

			u, _ := url.Parse(srv.URL)
			bundle, err := policy.ParseBundle([]byte(responseFilterBundle))
			if err != nil {
				t.Fatalf("bundle: %v", err)
			}
			bus := audit.NewBus(&bytes.Buffer{}, 16)
			defer func() { _ = bus.Stop(context.Background()) }()
			h := NewHandler(u, policy.New(bundle), bus)

			w := httptest.NewRecorder()
			body := []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{}}}`)
			r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
			h.ServeHTTP(w, r)

			if w.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", w.Code, tt.wantStatus)
			}
			if tt.wantStatus == http.StatusOK && !bytes.Equal(w.Body.Bytes(), tt.response) {
				t.Fatal("response at the size limit was not forwarded intact")
			}
		})
	}
}

func responseBodyOfSize(t *testing.T, size int) []byte {
	t.Helper()
	prefix := []byte(`{"jsonrpc":"2.0","id":1,"result":{"text":"`)
	suffix := []byte(`"}}`)
	paddingSize := size - len(prefix) - len(suffix)
	if paddingSize < 0 {
		t.Fatalf("response size %d is too small for the JSON-RPC envelope", size)
	}

	body := make([]byte, 0, size)
	body = append(body, prefix...)
	body = append(body, bytes.Repeat([]byte("A"), paddingSize)...)
	body = append(body, suffix...)
	return body
}

func TestProxy_NonPostPassesThrough(t *testing.T) {
	upstreamHit := false
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		upstreamHit = true
		_, _ = w.Write([]byte("ok"))
	})

	h, _, cleanup := newTestProxy(t, upstream)
	defer cleanup()

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	h.ServeHTTP(w, r)

	if !upstreamHit {
		t.Fatal("GET should pass through to upstream")
	}
}

func TestProxy_RequestBodyTooLarge(t *testing.T) {
	h, _, cleanup := newTestProxy(t, http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))
	defer cleanup()

	// 5MB body exceeds maxRequestBytes (4MB)
	largeBody := bytes.Repeat([]byte("A"), 5<<20)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(largeBody))
	h.ServeHTTP(w, r)

	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", w.Code)
	}
}

func TestProxy_MalformedJSON(t *testing.T) {
	h, _, cleanup := newTestProxy(t, http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))
	defer cleanup()

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("{invalid-json")))
	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
}

func TestProxy_InspectsSSEResponse(t *testing.T) {
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("id: 1\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"text\":\"AKIAIOSFODNN7EXAMPLE\"}}\n\n"))
	})
	srv := httptest.NewServer(upstream)
	defer srv.Close()

	u, _ := url.Parse(srv.URL)
	bundle, err := policy.ParseBundle([]byte(responseFilterBundle))
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	h := NewHandler(u, policy.New(bundle), bus)

	w := httptest.NewRecorder()
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{}}}`)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	h.ServeHTTP(w, r)

	if strings.Contains(w.Body.String(), "AKIAIOSFODNN7EXAMPLE") || !strings.Contains(w.Body.String(), "[REDACTED]") || !strings.Contains(w.Body.String(), "id: 1") {
		t.Fatalf("expected inspected SSE event, got %s", w.Body.String())
	}
}

func TestInspectSSE_RejectsInvalidEventWithoutForwarding(t *testing.T) {
	bundle, err := policy.ParseBundle([]byte(responseFilterBundle))
	if err != nil {
		t.Fatal(err)
	}
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	var out bytes.Buffer
	err = inspectSSE(&out, strings.NewReader("data: private but not JSON\n\n"), policy.New(bundle), bus)
	if err == nil || out.Len() != 0 {
		t.Fatalf("invalid event forwarded: err=%v body=%q", err, out.String())
	}
}

func TestProxy_SSEForwardsInspectedEventBeforeStreamEnds(t *testing.T) {
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"text\":\"AKIAIOSFODNN7EXAMPLE\"}}\n\n")
		w.(http.Flusher).Flush()
		<-release
	}))
	defer upstream.Close()
	u, _ := url.Parse(upstream.URL)
	bundle, _ := policy.ParseBundle([]byte(responseFilterBundle))
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	proxy := httptest.NewServer(NewHandler(u, policy.New(bundle), bus))
	defer proxy.Close()
	defer close(release)

	resp, err := http.Post(proxy.URL, "application/json", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	line := make(chan string, 1)
	go func() {
		got, _ := bufio.NewReader(resp.Body).ReadString('\n')
		line <- got
	}()
	select {
	case got := <-line:
		if !strings.Contains(got, "[REDACTED]") || strings.Contains(got, "AKIAIOSFODNN7EXAMPLE") {
			t.Fatalf("uninspected event: %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("inspected event was buffered until stream ended")
	}
}

func TestProxy_GzipResponseInspected(t *testing.T) {
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "gzip")
		zw := gzip.NewWriter(w)
		_, _ = zw.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"text":"AKIAIOSFODNN7EXAMPLE"}}`))
		_ = zw.Close()
	})
	srv := httptest.NewServer(upstream)
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	bundle, _ := policy.ParseBundle([]byte(responseFilterBundle))
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	h := NewHandler(u, policy.New(bundle), bus)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
	r.Header.Set("Accept-Encoding", "gzip")
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "AKIAIOSFODNN7EXAMPLE") || !strings.Contains(w.Body.String(), "[REDACTED]") {
		t.Fatalf("compressed response bypassed filter: status=%d body=%s", w.Code, w.Body.String())
	}
	if w.Header().Get("Content-Encoding") != "" {
		t.Fatal("stale Content-Encoding on inspected body")
	}
}

func TestProxy_UnsupportedEncodingFailsClosed(t *testing.T) {
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "br")
		_, _ = w.Write([]byte("private"))
	})
	srv := httptest.NewServer(upstream)
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	bundle, _ := policy.ParseBundle([]byte(responseFilterBundle))
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	h := NewHandler(u, policy.New(bundle), bus)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != http.StatusBadGateway || strings.Contains(w.Body.String(), "private") {
		t.Fatalf("unsupported encoding leaked: status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestProxy_RejectsCrossOrigin(t *testing.T) {
	h, _, cleanup := newTestProxy(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer cleanup()
	for _, origin := range []string{"https://attacker.example", "null", "http://attacker.example:9090"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:9090/", nil)
		r.Header.Set("Origin", origin)
		h.ServeHTTP(w, r)
		if w.Code != http.StatusForbidden {
			t.Errorf("origin %q status=%d, want 403", origin, w.Code)
		}
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:9090/", nil)
	r.Header.Set("Origin", "http://127.0.0.1:9090")
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("same local origin status=%d, want 200", w.Code)
	}
	w = httptest.NewRecorder()
	r = httptest.NewRequest(http.MethodGet, "https://proxy.example.com/", nil)
	r.Header.Set("Origin", "https://proxy.example.com")
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("same remote origin status=%d, want 200", w.Code)
	}
}

func TestProxy_BlockSummaryWithoutField(t *testing.T) {
	// Unknown tool blocked without field
	h, _, cleanup := newTestProxy(t, http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))
	defer cleanup()

	w := httptest.NewRecorder()
	body := []byte(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"unknown_tool","arguments":{}}}`)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var resp jsonrpc.Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Error == nil || !strings.Contains(resp.Error.Message, "unknown_tool on ") {
		t.Errorf("unexpected error message: %+v", resp.Error)
	}
}

func TestProxy_ModifyResponse_ReadError(t *testing.T) {
	upstream := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			return
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			return
		}
		_, _ = conn.Write([]byte("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n"))
		_ = conn.Close()
	})
	srv := httptest.NewServer(upstream)
	defer srv.Close()

	u, _ := url.Parse(srv.URL)
	bundle, err := policy.ParseBundle([]byte(responseFilterBundle))
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}
	bus := audit.NewBus(&bytes.Buffer{}, 16)
	defer func() { _ = bus.Stop(context.Background()) }()
	h := NewHandler(u, policy.New(bundle), bus)

	w := httptest.NewRecorder()
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{}}}`)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected Bad Gateway (502) on upstream read error, got %d", w.Code)
	}
}
