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

func TestParseBundle_RejectsBadDispositions(t *testing.T) {
	for _, field := range []string{"unknown_tool", "unknown_method"} {
		src := "version: 1\nserver: x\ntools: []\ndefaults:\n  " + field + ": denny\n"
		_, err := ParseBundle([]byte(src))
		if err == nil || !strings.Contains(err.Error(), field) {
			t.Fatalf("expected %s error, got %v", field, err)
		}
	}
}

func TestParseBundle_RejectsUnknownFields(t *testing.T) {
	for _, src := range []string{
		"version: 1\nserver: x\ntools: []\ndefaults:\n  unknown_tools: deny\n",
		"version: 1\nserver: x\ntools:\n  - name: t\n    action: allow\n",
		"version: 1\nserver: x\ntools:\n  - name: t\n    arguments:\n      a: { type: string, deny_pattrens: ['.*'] }\n",
	} {
		if _, err := ParseBundle([]byte(src)); err == nil {
			t.Fatalf("expected unknown field error for %q", src)
		}
	}
}

func TestParseBundle_RejectsNonMappingDefaults(t *testing.T) {
	const src = "version: 1\nserver: x\ntools: []\ndefaults: [deny]\n"
	if _, err := ParseBundle([]byte(src)); err == nil {
		t.Fatal("expected malformed defaults error")
	}
}

func TestParseBundle_RejectsStringConstraintsOnNumber(t *testing.T) {
	const src = "version: 1\nserver: x\ntools:\n  - name: t\n    arguments:\n      a: { type: number, deny_patterns: ['.*'] }\n"
	if _, err := ParseBundle([]byte(src)); err == nil || !strings.Contains(err.Error(), "string constraints") {
		t.Fatalf("expected string constraint error, got %v", err)
	}
}

func TestParseBundle_RejectsSecondDocument(t *testing.T) {
	const src = "version: 1\nserver: x\ntools: []\n---\nversion: 1\nserver: y\ntools: []\n"
	if _, err := ParseBundle([]byte(src)); err == nil || !strings.Contains(err.Error(), "multiple YAML documents") {
		t.Fatalf("expected multiple-document error, got %v", err)
	}
	const malformed = "version: 1\nserver: x\ntools: []\n---\n: invalid yaml\n"
	if _, err := ParseBundle([]byte(malformed)); err == nil || !strings.Contains(err.Error(), "parse policy bundle") {
		t.Fatalf("expected malformed second-document error, got %v", err)
	}
}
