package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestOpenAuditSink(t *testing.T) {
	t.Run("stderr sink", func(t *testing.T) {
		sink, closer, err := openAuditSink("-")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sink == nil {
			t.Fatal("expected non-nil sink")
		}
		closer()
	})

	t.Run("file sink", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "audit.log")
		sink, closer, err := openAuditSink(path)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sink == nil {
			t.Fatal("expected non-nil sink")
		}
		closer()
	})

	t.Run("invalid path error", func(t *testing.T) {
		_, _, err := openAuditSink("/nonexistent-dir/audit.log")
		if err == nil {
			t.Fatal("expected error for nonexistent directory")
		}
	})
}

func TestLocalHostOnly(t *testing.T) {
	h := localHostOnly(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for _, tc := range []struct {
		host string
		want int
	}{
		{"127.0.0.1:9090", http.StatusNoContent},
		{"localhost:9090", http.StatusNoContent},
		{"[::1]:9090", http.StatusNoContent},
		{"attacker.example:9090", http.StatusForbidden},
	} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "http://"+tc.host+"/", nil)
		h.ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Errorf("host %q status=%d, want %d", tc.host, w.Code, tc.want)
		}
	}
}
