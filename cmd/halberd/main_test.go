package main

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testPolicyYaml(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "policy.yaml")
	content := `version: 1
server: test-server
tools:
  - name: echo
    action: allow
`
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test policy: %v", err)
	}
	return path
}

func TestCmdLint(t *testing.T) {
	t.Run("missing arg", func(t *testing.T) {
		code := cmdLint(nil)
		if code != 2 {
			t.Errorf("expected 2, got %d", code)
		}
	})

	t.Run("nonexistent file", func(t *testing.T) {
		code := cmdLint([]string{"nonexistent.yaml"})
		if code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})

	t.Run("valid policy", func(t *testing.T) {
		path := testPolicyYaml(t)
		code := cmdLint([]string{path})
		if code != 0 {
			t.Errorf("expected 0, got %d", code)
		}
	})
}

func TestUsage(t *testing.T) {
	oldStderr := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	usage()

	_ = w.Close()
	os.Stderr = oldStderr

	var buf bytes.Buffer
	_, _ = io.Copy(&buf, r)

	if !strings.Contains(buf.String(), "halberd — policy operator CLI") {
		t.Errorf("unexpected usage output: %s", buf.String())
	}
}
