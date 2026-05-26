package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// driveServer pipes one request per line and returns the responses, one
// per line, in the order the server emitted them.
func driveServer(t *testing.T, requests ...string) []map[string]any {
	t.Helper()
	in := strings.NewReader(strings.Join(requests, "\n") + "\n")
	out := &bytes.Buffer{}
	if err := serve(in, out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var responses []map[string]any
	for _, line := range strings.Split(strings.TrimRight(out.String(), "\n"), "\n") {
		if line == "" {
			continue
		}
		var r map[string]any
		if err := json.Unmarshal([]byte(line), &r); err != nil {
			t.Fatalf("decode %q: %v", line, err)
		}
		responses = append(responses, r)
	}
	return responses
}

func resultContent(t *testing.T, r map[string]any) string {
	t.Helper()
	result, ok := r["result"].(map[string]any)
	if !ok {
		t.Fatalf("response missing result: %+v", r)
	}
	content, ok := result["content"].([]any)
	if !ok || len(content) == 0 {
		t.Fatalf("response missing content: %+v", result)
	}
	first, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("content[0] is not an object: %+v", content[0])
	}
	return first["text"].(string)
}

func TestInitialize(t *testing.T) {
	resps := driveServer(t, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	if len(resps) != 1 {
		t.Fatalf("expected 1 response, got %d", len(resps))
	}
	result := resps[0]["result"].(map[string]any)
	info := result["serverInfo"].(map[string]any)
	if info["name"] != "halberd-honeypot" {
		t.Errorf("serverInfo.name = %v, want halberd-honeypot", info["name"])
	}
}

func TestToolsList_AdvertisesFourTools(t *testing.T) {
	resps := driveServer(t, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	tools := resps[0]["result"].(map[string]any)["tools"].([]any)
	if len(tools) != 4 {
		t.Fatalf("expected 4 tools, got %d", len(tools))
	}
	want := map[string]bool{
		"get_weather": false, "execute_sql": false,
		"read_file": false, "list_users": false,
	}
	for _, tool := range tools {
		name := tool.(map[string]any)["name"].(string)
		if _, ok := want[name]; !ok {
			t.Errorf("unexpected tool advertised: %q", name)
		}
		want[name] = true
	}
	for name, present := range want {
		if !present {
			t.Errorf("tool %q missing from list", name)
		}
	}
}

func TestGetWeather_EmitsToolPoisoningPayload(t *testing.T) {
	resps := driveServer(t,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"NYC"}}}`)
	text := resultContent(t, resps[0])
	if !strings.Contains(text, "\x1b[") {
		t.Error("get_weather response missing ANSI escape (T1 payload)")
	}
	if !strings.Contains(text, "<|im_start") {
		t.Error("get_weather response missing role-tag spoof (T1 payload)")
	}
}

func TestExecuteSQL_EchoesQuery(t *testing.T) {
	resps := driveServer(t,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"SELECT 1"}}}`)
	text := resultContent(t, resps[0])
	if !strings.Contains(text, "SELECT 1") {
		t.Errorf("execute_sql should echo the query; got %q", text)
	}
}

func TestReadFile_OpensActualPath(t *testing.T) {
	tmp, err := os.CreateTemp(t.TempDir(), "honeypot-fixture-*.txt")
	if err != nil {
		t.Fatalf("temp file: %v", err)
	}
	const want = "halberd-honeypot test fixture"
	if _, err := tmp.WriteString(want); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	_ = tmp.Close()

	req, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "tools/call",
		"params": map[string]any{
			"name":      "read_file",
			"arguments": map[string]any{"path": tmp.Name()},
		},
	})
	resps := driveServer(t, string(req))
	if got := resultContent(t, resps[0]); !strings.Contains(got, want) {
		t.Errorf("read_file did not return fixture content; got %q", got)
	}
}

func TestReadFile_SurfacesOSErrors(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "does-not-exist")
	req, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "tools/call",
		"params": map[string]any{
			"name":      "read_file",
			"arguments": map[string]any{"path": missing},
		},
	})
	resps := driveServer(t, string(req))
	result := resps[0]["result"].(map[string]any)
	if result["isError"] != true {
		t.Errorf("expected isError=true for missing file; got %+v", result)
	}
}

func TestListUsers_EmbedsAllThreeSecretShapes(t *testing.T) {
	resps := driveServer(t,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_users","arguments":{}}}`)
	text := resultContent(t, resps[0])
	if !strings.Contains(text, "AKIA") {
		t.Error("list_users response missing AWS-key shape (T5)")
	}
	if !strings.Contains(text, "ghp_") {
		t.Error("list_users response missing GitHub-token shape (T5)")
	}
	if !strings.Contains(text, "BEGIN RSA PRIVATE KEY") {
		t.Error("list_users response missing RSA private key shape (T5)")
	}
}

func TestUnknownTool_ReturnsIsError(t *testing.T) {
	resps := driveServer(t,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}`)
	result := resps[0]["result"].(map[string]any)
	if result["isError"] != true {
		t.Errorf("expected isError=true for unknown tool; got %+v", result)
	}
}

func TestUnknownMethod_ReturnsJSONRPCError(t *testing.T) {
	resps := driveServer(t,
		`{"jsonrpc":"2.0","id":1,"method":"nonsense/method"}`)
	if _, ok := resps[0]["error"]; !ok {
		t.Errorf("expected error response for unknown method; got %+v", resps[0])
	}
}

func TestNotificationProducesNoResponse(t *testing.T) {
	// `id` absent → notification. Server must not respond.
	in := strings.NewReader(`{"jsonrpc":"2.0","method":"notifications/initialized"}` + "\n")
	out := &bytes.Buffer{}
	if err := serve(in, out); err != nil {
		t.Fatalf("serve: %v", err)
	}
	if out.Len() != 0 {
		t.Errorf("server responded to a notification: %q", out.String())
	}
}
