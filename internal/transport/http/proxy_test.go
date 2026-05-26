package http

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

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
		w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{}}`))
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
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

func TestProxy_NonPostPassesThrough(t *testing.T) {
	upstreamHit := false
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHit = true
		w.Write([]byte("ok"))
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
