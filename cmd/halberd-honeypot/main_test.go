package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type rpcContent struct {
	Text string `json:"text"`
}

type rpcTool struct {
	Name string `json:"name"`
}

type rpcServerInfo struct {
	Name string `json:"name"`
}

type rpcResult struct {
	Content    []rpcContent  `json:"content"`
	IsError    bool           `json:"isError"`
	ServerInfo rpcServerInfo `json:"serverInfo"`
	Tools      []rpcTool     `json:"tools"`
}

type rpcResponse struct {
	Result *rpcResult `json:"result"`
	Error  *struct{}  `json:"error"`
}

type rpcParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type rpcRequest struct {
	JSONRPC string     `json:"jsonrpc"`
	ID      int        `json:"id"`
	Method  string     `json:"method"`
	Params  *rpcParams `json:"params,omitempty"`
}

// driveServer pipes one request per line and returns the responses, one
// per line, in the order the server emitted them.
func driveServer(t *testing.T, requests ...string) []rpcResponse {
	t.Helper()
	in := strings.NewReader(strings.Join(requests, "\n") + "\n")
	out := &bytes.Buffer{}
	if err := serve(in, out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var responses []rpcResponse
	for _, line := range strings.Split(strings.TrimRight(out.String(), "\n"), "\n") {
		if line == "" {
			continue
		}
		var r rpcResponse
		if err := json.Unmarshal([]byte(line), &r); err != nil {
			t.Fatalf("decode %q: %v", line, err)
		}
		responses = append(responses, r)
	}
	return responses
}

func resultContent(t *testing.T, r rpcResponse) string {
	t.Helper()
	if r.Result == nil || len(r.Result.Content) == 0 {
		t.Fatalf("response missing content: %+v", r)
	}
	return r.Result.Content[0].Text
}

func toolRequest(t *testing.T, name string, arguments json.RawMessage) string {
	t.Helper()
	request, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "tools/call",
		Params:  &rpcParams{Name: name, Arguments: arguments},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	return string(request)
}

func TestInitialize(t *testing.T) {
	resps := driveServer(t, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	if len(resps) != 1 {
		t.Fatalf("expected 1 response, got %d", len(resps))
	}
	if resps[0].Result == nil || resps[0].Result.ServerInfo.Name != "halberd-honeypot" {
		name := "<missing>"
		if resps[0].Result != nil {
			name = resps[0].Result.ServerInfo.Name
		}
		t.Errorf("serverInfo.name = %v, want halberd-honeypot", name)
	}
}

func TestToolsList_AdvertisesFourTools(t *testing.T) {
	resps := driveServer(t, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if resps[0].Result == nil || len(resps[0].Result.Tools) != 4 {
		count := 0
		if resps[0].Result != nil {
			count = len(resps[0].Result.Tools)
		}
		t.Fatalf("expected 4 tools, got %d", count)
	}
	want := map[string]bool{
		"get_weather": false, "execute_sql": false,
		"read_file": false, "list_users": false,
	}
	for _, tool := range resps[0].Result.Tools {
		name := tool.Name
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
		toolRequest(t, "get_weather", json.RawMessage(`{"city":"NYC"}`)))
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
		toolRequest(t, "execute_sql", json.RawMessage(`{"query":"SELECT 1"}`)))
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

	args, err := json.Marshal(struct {
		Path string `json:"path"`
	}{Path: tmp.Name()})
	if err != nil {
		t.Fatalf("marshal arguments: %v", err)
	}
	resps := driveServer(t, toolRequest(t, "read_file", args))
	if got := resultContent(t, resps[0]); !strings.Contains(got, want) {
		t.Errorf("read_file did not return fixture content; got %q", got)
	}
}

func TestReadFile_SurfacesOSErrors(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "does-not-exist")
	args, err := json.Marshal(struct {
		Path string `json:"path"`
	}{Path: missing})
	if err != nil {
		t.Fatalf("marshal arguments: %v", err)
	}
	resps := driveServer(t, toolRequest(t, "read_file", args))
	if resps[0].Result == nil || !resps[0].Result.IsError {
		t.Errorf("expected isError=true for missing file; got %+v", resps[0].Result)
	}
}

func TestListUsers_EmbedsAllThreeSecretShapes(t *testing.T) {
	resps := driveServer(t,
		toolRequest(t, "list_users", json.RawMessage(`{}`)))
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
		toolRequest(t, "no_such_tool", json.RawMessage(`{}`)))
	if resps[0].Result == nil || !resps[0].Result.IsError {
		t.Errorf("expected isError=true for unknown tool; got %+v", resps[0].Result)
	}
}

func TestUnknownMethod_ReturnsJSONRPCError(t *testing.T) {
	resps := driveServer(t,
		`{"jsonrpc":"2.0","id":1,"method":"nonsense/method"}`)
	if resps[0].Error == nil {
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
