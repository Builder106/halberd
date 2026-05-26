package policy

import (
	"strings"
	"testing"
)

const postgresBundle = `
version: 1
server: mcp-server-postgres
tools:
  - name: query
    arguments:
      sql:
        type: string
        max_length: 8192
        deny_patterns:
          - '(?i)\bdrop\s+(table|database|schema)\b'
          - ';\s*--'
  - name: list_tables
    arguments: {}
defaults:
  unknown_tool: deny
  unknown_method: log_and_pass
`

func newEngine(t *testing.T, src string) *Engine {
	t.Helper()
	b, err := ParseBundle([]byte(src))
	if err != nil {
		t.Fatalf("parse bundle: %v", err)
	}
	return New(b)
}

func req(method, name, arg, val string) []byte {
	return []byte(`{"jsonrpc":"2.0","id":1,"method":"` + method +
		`","params":{"name":"` + name + `","arguments":{"` + arg + `":"` + val + `"}}}`)
}

func TestEngine_AllowsSafeQuery(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest(req("tools/call", "query", "sql", "SELECT id, name FROM students LIMIT 10"))
	if d.Blocked {
		t.Fatalf("expected allow, got blocked: %v", d.Violations)
	}
}

func TestEngine_BlocksDropTable(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest(req("tools/call", "query", "sql", "DROP TABLE users"))
	if !d.Blocked {
		t.Fatal("expected block on DROP TABLE, got allow")
	}
	if len(d.Violations) != 1 || d.Violations[0].Rule != "deny_pattern" {
		t.Fatalf("expected single deny_pattern violation, got %+v", d.Violations)
	}
}

func TestEngine_BlocksCommentChaining(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest(req("tools/call", "query", "sql", "SELECT 1; -- and more"))
	if !d.Blocked {
		t.Fatal("expected block on '; --' chain, got allow")
	}
}

func TestEngine_BlocksUnknownTool(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest(req("tools/call", "execute_sql", "query", "SELECT 1"))
	if !d.Blocked {
		t.Fatal("expected block on unknown tool, got allow")
	}
	if len(d.Violations) == 0 || d.Violations[0].Category != CategoryCapabilityCreep {
		t.Fatalf("expected capability_creep violation, got %+v", d.Violations)
	}
}

func TestEngine_MaxLength(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest(req("tools/call", "query", "sql", strings.Repeat("a", 9000)))
	if !d.Blocked {
		t.Fatal("expected block on oversized argument")
	}
}

func TestEngine_PassesListTools(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest([]byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	if d.Blocked {
		t.Fatalf("tools/list should pass, got %v", d.Violations)
	}
}

func TestEngine_RejectsMalformedJSON(t *testing.T) {
	e := newEngine(t, postgresBundle)
	d := e.EvaluateRequest([]byte(`{not json`))
	if !d.Blocked {
		t.Fatal("expected block on malformed envelope")
	}
}

func TestEngine_AllowValues(t *testing.T) {
	const src = `
version: 1
server: example
tools:
  - name: lookup
    arguments:
      kind:
        type: string
        allow_values: [user, group, role]
defaults: { unknown_tool: deny, unknown_method: log_and_pass }
`
	e := newEngine(t, src)
	if d := e.EvaluateRequest(req("tools/call", "lookup", "kind", "user")); d.Blocked {
		t.Fatalf("expected allow for whitelisted value: %v", d.Violations)
	}
	if d := e.EvaluateRequest(req("tools/call", "lookup", "kind", "admin")); !d.Blocked {
		t.Fatal("expected block for value outside allowlist")
	}
}

func BenchmarkEngine_BlockedDropTable(b *testing.B) {
	e := newEngineBench(b, postgresBundle)
	payload := req("tools/call", "query", "sql", "DROP TABLE users")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = e.EvaluateRequest(payload)
	}
}

func BenchmarkEngine_AllowedSelect(b *testing.B) {
	e := newEngineBench(b, postgresBundle)
	payload := req("tools/call", "query", "sql", "SELECT id, name FROM students WHERE classroom_id = $1 LIMIT 10")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = e.EvaluateRequest(payload)
	}
}

func newEngineBench(b *testing.B, src string) *Engine {
	b.Helper()
	bundle, err := ParseBundle([]byte(src))
	if err != nil {
		b.Fatalf("parse bundle: %v", err)
	}
	return New(bundle)
}
