package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Builder106/halberd/internal/audit"
	"github.com/Builder106/halberd/internal/policy"
)

func testPolicyEngine(t *testing.T) *policy.Engine {
	t.Helper()
	b := &policy.Bundle{
		Version: 1,
		Server:  "test-server",
	}
	return policy.New(b)
}

func testAuditBus(t *testing.T) *audit.Bus {
	t.Helper()
	dir := t.TempDir()
	f, err := os.Create(filepath.Join(dir, "audit.log"))
	if err != nil {
		t.Fatalf("failed to create audit log: %v", err)
	}
	t.Cleanup(func() { _ = f.Close() })
	return audit.NewBus(f, 64)
}

func TestRun(t *testing.T) {
	engine := testPolicyEngine(t)
	bus := testAuditBus(t)
	defer func() { _ = bus.Stop(context.Background()) }()

	t.Run("successful child command exit 0", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		code := run(ctx, engine, bus, []string{"true"})
		if code != 0 {
			t.Errorf("expected exit code 0, got %d", code)
		}
	})

	t.Run("nonexistent binary returns 126", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		code := run(ctx, engine, bus, []string{"/nonexistent-binary-xyz-123"})
		if code != 126 {
			t.Errorf("expected exit code 126, got %d", code)
		}
	})

	t.Run("child process exit with status 42", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		code := run(ctx, engine, bus, []string{"sh", "-c", "exit 42"})
		if code != 42 {
			t.Errorf("expected exit code 42, got %d", code)
		}
	})
}
