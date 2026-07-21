package main

import (
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
