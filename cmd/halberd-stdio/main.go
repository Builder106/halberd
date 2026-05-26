// Command halberd-stdio wraps an MCP server that speaks JSON-RPC over
// stdio (Claude Desktop, Cursor, Windsurf, and similar hosts launch their
// servers this way). Drop halberd-stdio into the host's config in place
// of the real server command and Halberd inspects every tools/call
// passing in either direction.
//
// Usage:
//
//	halberd-stdio --policy <bundle.yaml> --audit <path.jsonl> -- <server-cmd> [server-args...]
//
// Example (Claude Desktop, ~/Library/Application Support/Claude/claude_desktop_config.json):
//
//	"mcpServers": {
//	  "postgres": {
//	    "command": "/usr/local/bin/halberd-stdio",
//	    "args": [
//	      "--policy", "/etc/halberd/postgres.yaml",
//	      "--audit",  "/var/log/halberd/postgres.jsonl",
//	      "--",
//	      "mcp-server-postgres", "--conn-string", "postgresql://..."
//	    ]
//	  }
//	}
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/Builder106/halberd/internal/audit"
	"github.com/Builder106/halberd/internal/policy"
	stdiox "github.com/Builder106/halberd/internal/transport/stdio"
)

func main() {
	var (
		policyPath = flag.String("policy", "", "path to policy bundle (required)")
		auditPath  = flag.String("audit", "", "audit log path (required; do not point at the same stream as the host)")
	)
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, `halberd-stdio -- wrap a stdio-speaking MCP server with Halberd's policy engine.

Usage:
  halberd-stdio --policy <bundle.yaml> --audit <path.jsonl> -- <server-cmd> [server-args...]

Everything after `+"`--`"+` is treated as the server command and its arguments.`)
		flag.PrintDefaults()
	}
	flag.Parse()

	if *policyPath == "" {
		fmt.Fprintln(os.Stderr, "halberd-stdio: --policy is required")
		flag.Usage()
		os.Exit(2)
	}
	if *auditPath == "" {
		fmt.Fprintln(os.Stderr, "halberd-stdio: --audit is required (must not collide with host stderr)")
		flag.Usage()
		os.Exit(2)
	}
	if flag.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "halberd-stdio: missing server command after `--`")
		flag.Usage()
		os.Exit(2)
	}

	bundle, err := policy.LoadBundle(*policyPath)
	if err != nil {
		slog.Error("load policy", "path", *policyPath, "err", err)
		os.Exit(2)
	}

	auditFile, err := os.OpenFile(*auditPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		slog.Error("open audit log", "path", *auditPath, "err", err)
		os.Exit(2)
	}
	defer func() { _ = auditFile.Close() }()

	bus := audit.NewBus(auditFile, 4096)
	engine := policy.New(bundle)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	exitCode := run(ctx, engine, bus, flag.Args())
	if dropped := bus.Dropped(); dropped > 0 {
		slog.Warn("audit events dropped under load", "count", dropped)
	}
	_ = bus.Stop(context.Background())
	os.Exit(exitCode)
}

func run(ctx context.Context, engine *policy.Engine, bus *audit.Bus, argv []string) int {
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	// WaitDelay kills the child if it ignores SIGTERM. Tuned conservatively;
	// most MCP servers shut down in well under a second.
	cmd.WaitDelay = 5 * time.Second

	childStdin, err := cmd.StdinPipe()
	if err != nil {
		slog.Error("get child stdin pipe", "err", err)
		return 126
	}
	childStdout, err := cmd.StdoutPipe()
	if err != nil {
		slog.Error("get child stdout pipe", "err", err)
		return 126
	}
	childStderr, err := cmd.StderrPipe()
	if err != nil {
		slog.Error("get child stderr pipe", "err", err)
		return 126
	}

	if err := cmd.Start(); err != nil {
		slog.Error("start server", "cmd", argv[0], "err", err)
		return 126
	}

	wrapErr := stdiox.Wrap(ctx, engine, bus,
		stdiox.HostStreams{In: os.Stdin, Out: os.Stdout, Err: os.Stderr},
		stdiox.ChildStreams{Stdin: childStdin, Stdout: childStdout, Stderr: childStderr},
	)
	if wrapErr != nil && !errors.Is(wrapErr, context.Canceled) {
		slog.Error("wrap loop exited", "err", wrapErr)
	}

	waitErr := cmd.Wait()
	var exitErr *exec.ExitError
	switch {
	case waitErr == nil:
		return 0
	case errors.As(waitErr, &exitErr):
		return exitErr.ExitCode()
	default:
		slog.Error("child wait", "err", waitErr)
		return 1
	}
}
