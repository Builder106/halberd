package policy

import (
	"strings"
	"testing"
)

func TestParseBundle_AppliesDefaults(t *testing.T) {
	const src = `version: 1
server: x
tools: []
`
	b, err := ParseBundle([]byte(src))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if b.Defaults.UnknownTool != DispositionDeny {
		t.Errorf("unknown_tool default = %q, want deny", b.Defaults.UnknownTool)
	}
	if b.Defaults.UnknownMethod != DispositionLogAndPass {
		t.Errorf("unknown_method default = %q, want log_and_pass", b.Defaults.UnknownMethod)
	}
}

func TestParseBundle_RejectsBadVersion(t *testing.T) {
	_, err := ParseBundle([]byte("version: 99\nserver: x\ntools: []\n"))
	if err == nil || !strings.Contains(err.Error(), "version") {
		t.Fatalf("expected version error, got %v", err)
	}
}

func TestParseBundle_RejectsBadRegex(t *testing.T) {
	const src = `version: 1
server: x
tools:
  - name: t
    arguments:
      a:
        type: string
        deny_patterns: ['[invalid']
`
	_, err := ParseBundle([]byte(src))
	if err == nil {
		t.Fatal("expected regex compile error")
	}
}

func TestParseBundle_RejectsBadType(t *testing.T) {
	const src = `version: 1
server: x
tools:
  - name: t
    arguments:
      a: { type: blob }
`
	_, err := ParseBundle([]byte(src))
	if err == nil || !strings.Contains(err.Error(), "unsupported type") {
		t.Fatalf("expected unsupported-type error, got %v", err)
	}
}
