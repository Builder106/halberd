// Command halberd-http runs the policy proxy in front of a remote MCP server
// reachable over HTTP. Configure with --policy (path to bundle), --target
// (upstream MCP URL), --listen (bind address), and --audit (JSONL log path,
// or "-" for stderr).
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Builder106/halberd/internal/audit"
	"github.com/Builder106/halberd/internal/policy"
	httpx "github.com/Builder106/halberd/internal/transport/http"
)

func main() {
	var (
		policyPath = flag.String("policy", "halberd.yaml", "path to policy bundle")
		target     = flag.String("target", "", "upstream MCP server URL (e.g. http://localhost:8080)")
		listen     = flag.String("listen", ":9090", "bind address")
		auditPath  = flag.String("audit", "-", `audit log path ("-" for stderr)`)
	)
	flag.Parse()

	if *target == "" {
		slog.Error("--target is required")
		os.Exit(2)
	}

	targetURL, err := url.Parse(*target)
	if err != nil {
		slog.Error("parse target URL", "error", err)
		os.Exit(2)
	}

	bundle, err := policy.LoadBundle(*policyPath)
	if err != nil {
		slog.Error("load policy", "path", *policyPath, "error", err)
		os.Exit(2)
	}

	auditSink, closeSink, err := openAuditSink(*auditPath)
	if err != nil {
		slog.Error("open audit sink", "path", *auditPath, "error", err)
		os.Exit(2)
	}
	defer closeSink()

	bus := audit.NewBus(auditSink, 4096)
	engine := policy.New(bundle)
	handler := httpx.NewHandler(targetURL, engine, bus)

	srv := &http.Server{
		Addr:              *listen,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("halberd-http starting",
		"listen", *listen,
		"target", targetURL.String(),
		"server", bundle.Server,
		"tools", len(bundle.Tools),
	)

	idleClosed := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		_ = bus.Stop(ctx)
		close(idleClosed)
	}()

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server crashed", "error", err)
		os.Exit(1)
	}
	<-idleClosed
	if dropped := bus.Dropped(); dropped > 0 {
		slog.Warn("audit events dropped under load", "count", dropped)
	}
}

func openAuditSink(path string) (sink *os.File, closer func(), err error) {
	if path == "-" {
		return os.Stderr, func() {}, nil
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, nil, err
	}
	return f, func() { _ = f.Close() }, nil
}
