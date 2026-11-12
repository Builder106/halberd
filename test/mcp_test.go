package test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

var (
	builtBinDir  string
	buildBinOnce sync.Once
	buildBinErr  error
)

func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find repo root containing go.mod")
		}
		dir = parent
	}
}

func binaryName(base string) string {
	if runtime.GOOS == "windows" {
		return base + ".exe"
	}
	return base
}

func buildBinaries(t *testing.T) string {
	t.Helper()
	buildBinOnce.Do(func() {
		dir, err := os.MkdirTemp("", "halberd-test-bin-*")
		if err != nil {
			buildBinErr = err
			return
		}
		builtBinDir = dir

		repoRoot := findRepoRoot(t)
		cmd := exec.Command("go", "build", "-o", builtBinDir, "./cmd/...")
		cmd.Dir = repoRoot
		if out, err := cmd.CombinedOutput(); err != nil {
			buildBinErr = fmt.Errorf("go build ./cmd/... failed: %w\n%s", err, string(out))
			return
		}
	})

	if buildBinErr != nil {
		t.Fatalf("build test binaries: %v", buildBinErr)
	}
	return builtBinDir
}

func getFreePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("get free port: %v", err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	_ = l.Close()
	return port
}

func waitForHTTP(t *testing.T, targetURL string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 500 * time.Millisecond}
	for time.Now().Before(deadline) {
		resp, err := client.Get(targetURL)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for HTTP server at %s", targetURL)
}

func stopProcess(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	if runtime.GOOS == "windows" {
		return cmd.Process.Kill()
	}
	if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
		return cmd.Process.Kill()
	}
	return nil
}

func isExitOk(err error) bool {
	if err == nil {
		return true
	}
	msg := err.Error()
	if runtime.GOOS == "windows" {
		return strings.Contains(msg, "exit status 1") ||
			strings.Contains(msg, "killed") ||
			strings.Contains(msg, "access is denied")
	}
	return strings.Contains(msg, "signal: terminated") ||
		strings.Contains(msg, "signal: interrupt") ||
		strings.Contains(msg, "killed")
}

func TestRealStdioMCPServer(t *testing.T) {
	repoRoot := findRepoRoot(t)
	binDir := buildBinaries(t)

	stdioBin := filepath.Join(binDir, binaryName("halberd-stdio"))
	honeypotBin := filepath.Join(binDir, binaryName("halberd-honeypot"))
	policyPath := filepath.Join(repoRoot, "policies", "halberd-honeypot.yaml")
	auditPath := filepath.Join(t.TempDir(), "audit.jsonl")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, stdioBin,
		"--policy", policyPath,
		"--audit", auditPath,
		"--",
		honeypotBin,
	)
	cmd.Dir = repoRoot

	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		t.Fatalf("stdin pipe: %v", err)
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("stdout pipe: %v", err)
	}
	cmd.Stderr = io.Discard

	if err := cmd.Start(); err != nil {
		t.Fatalf("start halberd-stdio wrapping halberd-honeypot: %v", err)
	}

	reader := bufio.NewReader(stdoutPipe)

	sendAndReceive := func(t *testing.T, req string) string {
		t.Helper()
		if _, err := io.WriteString(stdinPipe, req+"\n"); err != nil {
			t.Fatalf("write to stdin: %v", err)
		}
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read from stdout: %v", err)
		}
		return strings.TrimSpace(line)
	}

	t.Run("initialization", func(t *testing.T) {
		resp := sendAndReceive(t, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
		var res struct {
			Result struct {
				ProtocolVersion string `json:"protocolVersion"`
				ServerInfo      struct {
					Name string `json:"name"`
				} `json:"serverInfo"`
			} `json:"result"`
		}
		if err := json.Unmarshal([]byte(resp), &res); err != nil {
			t.Fatalf("decode init resp %q: %v", resp, err)
		}
		if res.Result.ProtocolVersion != "2024-11-05" {
			t.Errorf("protocolVersion = %q, want 2024-11-05", res.Result.ProtocolVersion)
		}
		if res.Result.ServerInfo.Name != "halberd-honeypot" {
			t.Errorf("serverInfo.name = %q, want halberd-honeypot", res.Result.ServerInfo.Name)
		}
	})

	t.Run("tool discovery", func(t *testing.T) {
		resp := sendAndReceive(t, `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`)
		var res struct {
			Result struct {
				Tools []struct {
					Name string `json:"name"`
				} `json:"tools"`
			} `json:"result"`
		}
		if err := json.Unmarshal([]byte(resp), &res); err != nil {
			t.Fatalf("decode tools resp %q: %v", resp, err)
		}
		toolNames := make(map[string]bool)
		for _, tool := range res.Result.Tools {
			toolNames[tool.Name] = true
		}
		for _, want := range []string{"get_weather", "execute_sql", "read_file", "list_users"} {
			if !toolNames[want] {
				t.Errorf("tool %q missing from tools/list result", want)
			}
		}
	})

	t.Run("allowed call", func(t *testing.T) {
		resp := sendAndReceive(t, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"SELECT * FROM users;"}}}`)
		if !strings.Contains(resp, `ok: executed \"SELECT * FROM users;\"`) && !strings.Contains(resp, `ok: executed "SELECT * FROM users;"`) {
			t.Fatalf("expected sql result, got: %s", resp)
		}
	})

	t.Run("refused call", func(t *testing.T) {
		resp := sendAndReceive(t, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"DROP TABLE users;"}}}`)
		var rpcErr struct {
			Error struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(resp), &rpcErr); err != nil {
			t.Fatalf("decode error resp %q: %v", resp, err)
		}
		if rpcErr.Error.Code != -32000 {
			t.Fatalf("expected code -32000, got: %d", rpcErr.Error.Code)
		}
		if !strings.Contains(rpcErr.Error.Message, "deny_pattern") {
			t.Errorf("expected deny_pattern message, got: %s", rpcErr.Error.Message)
		}
	})

	t.Run("filtered response", func(t *testing.T) {
		// Fake secrets from list_users must be redacted by Halberd's secret_scanners
		respUsers := sendAndReceive(t, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_users","arguments":{}}}`)
		if strings.Contains(respUsers, "AKIAIOSFODNN7EXAMPLE") {
			t.Errorf("leaked AWS key in filtered response: %s", respUsers)
		}
		if strings.Contains(respUsers, "ghp_AAAA") {
			t.Errorf("leaked GitHub token in filtered response: %s", respUsers)
		}
		if strings.Contains(respUsers, "-----BEGIN RSA PRIVATE KEY-----") {
			t.Errorf("leaked RSA key in filtered response: %s", respUsers)
		}
		if !strings.Contains(respUsers, "[REDACTED]") {
			t.Errorf("expected [REDACTED] in filtered response: %s", respUsers)
		}

		// Tool poisoning from get_weather must have ANSI escapes and zero-width spaces stripped
		respWeather := sendAndReceive(t, `{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"Austin"}}}`)
		if strings.Contains(respWeather, "\x1b[31m") || strings.Contains(respWeather, "\x1b[0m") {
			t.Errorf("ANSI escape sequences not stripped: %s", respWeather)
		}
		if strings.Contains(respWeather, "\u200b") {
			t.Errorf("Zero-width space not stripped: %s", respWeather)
		}
	})

	t.Run("shutdown", func(t *testing.T) {
		resp := sendAndReceive(t, `{"jsonrpc":"2.0","id":7,"method":"shutdown","params":{}}`)
		if !strings.Contains(resp, `"result":null`) {
			t.Errorf("expected null result for shutdown, got: %s", resp)
		}

		// Close host stdin to trigger clean EOF shutdown through the stdio wrapper
		if err := stdinPipe.Close(); err != nil {
			t.Fatalf("close stdin pipe: %v", err)
		}

		// Verify wrapper and child process exit cleanly with exit code 0
		if err := cmd.Wait(); err != nil {
			t.Fatalf("halberd-stdio exit failed: %v", err)
		}

		// Verify audit log has recorded decisions
		auditBytes, err := os.ReadFile(auditPath)
		if err != nil {
			t.Fatalf("read audit file: %v", err)
		}
		auditLog := string(auditBytes)
		if !strings.Contains(auditLog, `"blocked":true`) {
			t.Errorf("audit log missing blocked decision: %s", auditLog)
		}
		if !strings.Contains(auditLog, `"direction":"response"`) {
			t.Errorf("audit log missing response filter event: %s", auditLog)
		}
	})
}

func TestRealStreamableHTTPMCPServer(t *testing.T) {
	repoRoot := findRepoRoot(t)
	binDir := buildBinaries(t)

	httpBin := filepath.Join(binDir, binaryName("halberd-http"))
	honeypotBin := filepath.Join(binDir, binaryName("halberd-honeypot"))
	policyPath := filepath.Join(repoRoot, "policies", "halberd-honeypot.yaml")
	auditPath := filepath.Join(t.TempDir(), "audit.jsonl")

	upstreamPort := getFreePort(t)
	proxyPort := getFreePort(t)

	upstreamAddr := fmt.Sprintf("127.0.0.1:%d", upstreamPort)
	proxyAddr := fmt.Sprintf("127.0.0.1:%d", proxyPort)

	// 1. Start upstream honeypot in Streamable HTTP mode
	upstreamCtx, upstreamCancel := context.WithCancel(context.Background())
	defer upstreamCancel()

	upstreamCmd := exec.CommandContext(upstreamCtx, honeypotBin, "--listen", upstreamAddr)
	upstreamCmd.Dir = repoRoot
	upstreamCmd.Stderr = io.Discard
	if err := upstreamCmd.Start(); err != nil {
		t.Fatalf("start honeypot in HTTP mode: %v", err)
	}
	defer func() {
		_ = stopProcess(upstreamCmd)
		_ = upstreamCmd.Wait()
	}()

	waitForHTTP(t, "http://"+upstreamAddr+"/health", 5*time.Second)

	// 2. Start halberd-http reverse proxy
	proxyCtx, proxyCancel := context.WithCancel(context.Background())
	defer proxyCancel()

	proxyCmd := exec.CommandContext(proxyCtx, httpBin,
		"--policy", policyPath,
		"--target", "http://"+upstreamAddr,
		"--listen", proxyAddr,
		"--audit", auditPath,
	)
	proxyCmd.Dir = repoRoot
	proxyCmd.Stderr = io.Discard
	if err := proxyCmd.Start(); err != nil {
		t.Fatalf("start halberd-http proxy: %v", err)
	}
	defer func() {
		_ = stopProcess(proxyCmd)
		_ = proxyCmd.Wait()
	}()

	waitForHTTP(t, "http://"+proxyAddr+"/health", 5*time.Second)

	client := &http.Client{Timeout: 10 * time.Second}

	// Helper to send a POST request with Accept: text/event-stream and read the response
	sendRequest := func(t *testing.T, reqBody string, acceptSSE bool) (int, string) {
		t.Helper()
		req, err := http.NewRequest(http.MethodPost, "http://"+proxyAddr+"/", strings.NewReader(reqBody))
		if err != nil {
			t.Fatalf("new request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		if acceptSSE {
			req.Header.Set("Accept", "text/event-stream")
		}

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("HTTP POST: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("read response body: %v", err)
		}
		return resp.StatusCode, string(body)
	}

	t.Run("initialization", func(t *testing.T) {
		code, body := sendRequest(t, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`, true)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if !strings.Contains(body, "2024-11-05") || !strings.Contains(body, "halberd-honeypot") {
			t.Fatalf("unexpected init response: %s", body)
		}
	})

	t.Run("tool discovery", func(t *testing.T) {
		code, body := sendRequest(t, `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`, true)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		for _, tool := range []string{"get_weather", "execute_sql", "read_file", "list_users"} {
			if !strings.Contains(body, tool) {
				t.Errorf("tool %q missing from tools/list SSE body: %s", tool, body)
			}
		}
	})

	t.Run("allowed call", func(t *testing.T) {
		code, body := sendRequest(t, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"SELECT 1;"}}}`, true)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if !strings.Contains(body, `ok: executed \"SELECT 1;\"`) && !strings.Contains(body, `ok: executed "SELECT 1;"`) {
			t.Fatalf("expected sql result, got: %s", body)
		}
	})

	t.Run("refused call", func(t *testing.T) {
		code, body := sendRequest(t, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"DROP TABLE users;"}}}`, true)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if !strings.Contains(body, "-32000") {
			t.Fatalf("expected JSON-RPC error code -32000 in refused response: %s", body)
		}
		if !strings.Contains(body, "deny_pattern") {
			t.Fatalf("expected deny_pattern in refused response: %s", body)
		}
	})

	t.Run("filtered response", func(t *testing.T) {
		code, body := sendRequest(t, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_users","arguments":{}}}`, true)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if strings.Contains(body, "AKIAIOSFODNN7EXAMPLE") {
			t.Errorf("leaked AWS key in SSE response: %s", body)
		}
		if strings.Contains(body, "ghp_AAAA") {
			t.Errorf("leaked GitHub token in SSE response: %s", body)
		}
		if strings.Contains(body, "-----BEGIN RSA PRIVATE KEY-----") {
			t.Errorf("leaked RSA key in SSE response: %s", body)
		}
		if !strings.Contains(body, "[REDACTED]") {
			t.Errorf("expected [REDACTED] in filtered SSE response: %s", body)
		}
	})

	t.Run("shutdown", func(t *testing.T) {
		code, body := sendRequest(t, `{"jsonrpc":"2.0","id":6,"method":"shutdown","params":{}}`, true)
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200", code)
		}
		if !strings.Contains(body, `"result":null`) {
			t.Errorf("expected null result for shutdown, got: %s", body)
		}

		// Wait for audit log to record expected decisions before terminating the proxy process
		deadline := time.Now().Add(5 * time.Second)
		var auditLog string
		for time.Now().Before(deadline) {
			if auditBytes, err := os.ReadFile(auditPath); err == nil {
				auditLog = string(auditBytes)
				if strings.Contains(auditLog, `"blocked":true`) && strings.Contains(auditLog, `"direction":"response"`) {
					break
				}
			}
			time.Sleep(25 * time.Millisecond)
		}

		// Stop proxy and upstream processes cleanly
		if err := stopProcess(proxyCmd); err != nil {
			t.Fatalf("stop proxy: %v", err)
		}
		if err := proxyCmd.Wait(); err != nil && !isExitOk(err) {
			t.Fatalf("proxy shutdown: %v", err)
		}

		if err := stopProcess(upstreamCmd); err != nil {
			t.Fatalf("stop upstream: %v", err)
		}
		if err := upstreamCmd.Wait(); err != nil && !isExitOk(err) {
			t.Fatalf("upstream shutdown: %v", err)
		}

		// Verify audit log has recorded decisions
		if auditBytes, err := os.ReadFile(auditPath); err == nil {
			auditLog = string(auditBytes)
		}
		if !strings.Contains(auditLog, `"blocked":true`) {
			t.Errorf("audit log missing blocked decision: %s", auditLog)
		}
		if !strings.Contains(auditLog, `"direction":"response"`) {
			t.Errorf("audit log missing response filter event: %s", auditLog)
		}
	})
}
