package stdio

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Builder106/halberd/internal/audit"
	"github.com/Builder106/halberd/internal/jsonrpc"
	"github.com/Builder106/halberd/internal/policy"
)

const testBundle = `
version: 1
server: test
tools:
  - name: query
    arguments:
      sql:
        type: string
        deny_patterns: ['(?i)\bdrop\s+table\b']
defaults: { unknown_tool: deny, unknown_method: log_and_pass }
`

// rig wires four io.Pipes together to simulate host and child without
// fork-execing anything. The fake "child" runs in a goroutine: it reads a
// line from its stdin, asserts on it, and writes a result to its stdout.
type rig struct {
	hostIn      *io.PipeWriter
	hostOut     *bufio.Reader
	hostOutPipe *io.PipeReader
	childStdin  *bufio.Reader
	childStdout *io.PipeWriter
	childStderr *io.PipeWriter
	auditBuf    *bytes.Buffer
	bus         *audit.Bus
	wrapDone    chan error
	cancel      context.CancelFunc
}

func newRig(t *testing.T) *rig {
	t.Helper()
	bundle, err := policy.ParseBundle([]byte(testBundle))
	if err != nil {
		t.Fatalf("parse bundle: %v", err)
	}
	engine := policy.New(bundle)

	hostInR, hostInW := io.Pipe()
	hostOutR, hostOutW := io.Pipe()
	childInR, childInW := io.Pipe()
	childOutR, childOutW := io.Pipe()
	childErrR, childErrW := io.Pipe()

	auditBuf := &bytes.Buffer{}
	bus := audit.NewBus(auditBuf, 16)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- Wrap(ctx, engine, bus, HostStreams{
			In:  hostInR,
			Out: hostOutW,
			Err: io.Discard,
		}, ChildStreams{
			Stdin:  childInW,
			Stdout: childOutR,
			Stderr: childErrR,
		})
		_ = hostOutW.Close()
	}()

	return &rig{
		hostIn:      hostInW,
		hostOut:     bufio.NewReader(hostOutR),
		hostOutPipe: hostOutR,
		childStdin:  bufio.NewReader(childInR),
		childStdout: childOutW,
		childStderr: childErrW,
		auditBuf:    auditBuf,
		bus:         bus,
		wrapDone:    done,
		cancel:      cancel,
	}
}

func (r *rig) close(t *testing.T) {
	t.Helper()
	_ = r.hostIn.Close()
	_ = r.childStdout.Close()
	_ = r.childStderr.Close()
	r.cancel()
	select {
	case <-r.wrapDone:
	case <-time.After(2 * time.Second):
		t.Fatal("Wrap did not return within 2s of close")
	}
	_ = r.bus.Stop(context.Background())
}

// readChildLine reads one JSON-RPC line that the wrapper forwarded to the
// child, with a timeout so a stuck test fails loudly instead of hanging.
func readChildLine(t *testing.T, r *rig) string {
	t.Helper()
	type res struct {
		line string
		err  error
	}
	ch := make(chan res, 1)
	go func() {
		line, err := r.childStdin.ReadString('\n')
		ch <- res{line, err}
	}()
	select {
	case got := <-ch:
		if got.err != nil {
			t.Fatalf("read child stdin: %v", got.err)
		}
		return strings.TrimRight(got.line, "\n")
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for line on child stdin")
		return ""
	}
}

func readHostLine(t *testing.T, r *rig) string {
	t.Helper()
	type res struct {
		line string
		err  error
	}
	ch := make(chan res, 1)
	go func() {
		line, err := r.hostOut.ReadString('\n')
		ch <- res{line, err}
	}()
	select {
	case got := <-ch:
		if got.err != nil {
			t.Fatalf("read host stdout: %v", got.err)
		}
		return strings.TrimRight(got.line, "\n")
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for line on host stdout")
		return ""
	}
}

func TestWrap_ForwardsAllowed(t *testing.T) {
	r := newRig(t)
	defer r.close(t)

	req := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT 1"}}}`
	if _, err := r.hostIn.Write([]byte(req + "\n")); err != nil {
		t.Fatalf("write host stdin: %v", err)
	}

	got := readChildLine(t, r)
	if got != req {
		t.Fatalf("child saw %q, want %q", got, req)
	}

	// Fake child responds. The wrapper should forward unchanged.
	resp := `{"jsonrpc":"2.0","id":1,"result":{"rows":[]}}`
	if _, err := r.childStdout.Write([]byte(resp + "\n")); err != nil {
		t.Fatalf("write child stdout: %v", err)
	}
	if got := readHostLine(t, r); got != resp {
		t.Fatalf("host saw %q, want %q", got, resp)
	}
}

func TestWrap_BlocksRequestWithSyntheticError(t *testing.T) {
	r := newRig(t)
	defer r.close(t)

	req := `{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"query","arguments":{"sql":"DROP TABLE users"}}}`
	if _, err := r.hostIn.Write([]byte(req + "\n")); err != nil {
		t.Fatalf("write host stdin: %v", err)
	}

	line := readHostLine(t, r)
	var resp jsonrpc.Response
	if err := json.Unmarshal([]byte(line), &resp); err != nil {
		t.Fatalf("decode response: %v\nline: %s", err, line)
	}
	if resp.Error == nil || resp.Error.Code != jsonrpc.CodePolicyViolation {
		t.Fatalf("expected policy violation, got %+v", resp)
	}
	if string(resp.ID) != "42" {
		t.Errorf("response id = %s, want 42", string(resp.ID))
	}

	// And nothing should have reached the child.
	type res struct{ line string }
	ch := make(chan res, 1)
	go func() {
		line, _ := r.childStdin.ReadString('\n')
		ch <- res{line}
	}()
	select {
	case got := <-ch:
		t.Fatalf("blocked request leaked to child: %q", got.line)
	case <-time.After(150 * time.Millisecond):
		// good — child saw nothing
	}
}

func TestWrap_DropsBlockedNotificationSilently(t *testing.T) {
	r := newRig(t)
	defer r.close(t)

	// Notification — no `id` field. The spec forbids a response.
	notif := `{"jsonrpc":"2.0","method":"tools/call","params":{"name":"query","arguments":{"sql":"DROP TABLE users"}}}`
	if _, err := r.hostIn.Write([]byte(notif + "\n")); err != nil {
		t.Fatalf("write host stdin: %v", err)
	}

	// Spawn exactly one reader. If a line arrives, the test fails. If the
	// pipe closes (which it will when close() tears down host stdin and
	// Wrap closes the host stdout writer), the read returns an error and
	// the goroutine exits cleanly — no race on the bufio.Reader.
	hostSaw := make(chan string, 1)
	go func() {
		if line, err := r.hostOut.ReadString('\n'); err == nil && line != "" {
			hostSaw <- line
		}
	}()

	select {
	case line := <-hostSaw:
		t.Fatalf("blocked notification produced a host response: %q", line)
	case <-time.After(150 * time.Millisecond):
		// good — no response, as the spec requires
	}

	// Audit log should still record the block. Force a drain by stopping
	// the bus and reading what landed.
	_ = r.bus.Stop(context.Background())
	if !strings.Contains(r.auditBuf.String(), `"blocked":true`) {
		t.Errorf("audit log missing blocked entry: %q", r.auditBuf.String())
	}
}

func TestWrap_ChildStderrPassesThrough(t *testing.T) {
	bundle, _ := policy.ParseBundle([]byte(testBundle))
	engine := policy.New(bundle)

	hostInR, hostInW := io.Pipe()
	hostOutR, hostOutW := io.Pipe()
	childInR, childInW := io.Pipe()
	childOutR, childOutW := io.Pipe()
	childErrR, childErrW := io.Pipe()

	bus := audit.NewBus(&bytes.Buffer{}, 16)
	hostErr := &syncBuf{}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- Wrap(ctx, engine, bus, HostStreams{In: hostInR, Out: hostOutW, Err: hostErr},
			ChildStreams{Stdin: childInW, Stdout: childOutR, Stderr: childErrR})
	}()

	if _, err := childErrW.Write([]byte("connecting to postgres...\n")); err != nil {
		t.Fatalf("write child stderr: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(hostErr.String(), "connecting to postgres") {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !strings.Contains(hostErr.String(), "connecting to postgres") {
		t.Fatalf("stderr did not reach host: %q", hostErr.String())
	}

	_ = hostInW.Close()
	_ = childErrW.Close()
	_ = childOutW.Close()
	_ = hostOutR.Close()
	_ = childInR.Close()
	cancel()
	<-done
	_ = bus.Stop(context.Background())
}

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}
func (s *syncBuf) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}
