package jsonrpc

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPolicyViolation_HasCorrectShape(t *testing.T) {
	id := json.RawMessage(`42`)
	raw, err := PolicyViolation(id, "blocked by deny_pattern", []map[string]string{
		{"rule": "deny_pattern", "field": "sql"},
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JSONRPC != "2.0" {
		t.Errorf("jsonrpc = %q, want 2.0", resp.JSONRPC)
	}
	if string(resp.ID) != "42" {
		t.Errorf("id = %s, want 42", string(resp.ID))
	}
	if resp.Error == nil || resp.Error.Code != CodePolicyViolation {
		t.Fatalf("error code = %v, want %d", resp.Error, CodePolicyViolation)
	}
	if !strings.Contains(resp.Error.Message, "blocked by") {
		t.Errorf("missing summary in message: %q", resp.Error.Message)
	}
}

func TestPolicyViolation_PreservesStringID(t *testing.T) {
	id := json.RawMessage(`"call-abc"`)
	raw, _ := PolicyViolation(id, "x", nil)
	if !strings.Contains(string(raw), `"call-abc"`) {
		t.Errorf("string id not preserved: %s", raw)
	}
}
