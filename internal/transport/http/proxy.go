// Package http wraps net/http/httputil.ReverseProxy with Halberd's policy
// engine. The handler reads the JSON-RPC request body, evaluates it against
// the engine, records the decision to the audit bus, and either forwards the
// request to the upstream MCP server or returns a synthetic policy-violation
// error response.
package http

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"

	"github.com/Builder106/halberd/internal/audit"
	"github.com/Builder106/halberd/internal/jsonrpc"
	"github.com/Builder106/halberd/internal/policy"
)

const (
	maxRequestBytes  = 4 << 20 // 4 MiB ceiling on JSON-RPC envelope
	maxResponseBytes = 8 << 20 // Maximum buffered response body (8 MiB)
)

// NewHandler returns an http.Handler that reverse-proxies JSON-RPC requests
// to target, gating each POST on engine.EvaluateRequest. Decisions are
// pushed to bus regardless of outcome. The underlying httputil.ReverseProxy
// flushes on every write (FlushInterval=-1) so SSE streamed responses from
// the upstream MCP server reach the agent without buffering.
func NewHandler(target *url.URL, engine *policy.Engine, bus *audit.Bus) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(target)

	// FlushInterval -1 causes the proxy to flush on every Write, which is
	// what SSE needs to stream tool/list_changed and tools/call result chunks
	// to the agent without buffering.
	proxy.FlushInterval = -1

	origDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		origDirector(r)
		r.Host = target.Host
	}

	if engine.HasResponseFilters() {
		proxy.ModifyResponse = func(resp *http.Response) error {
			switch resp.Header.Get("Content-Encoding") {
			case "", "identity":
			case "gzip":
				compressed := resp.Body
				reader, err := gzip.NewReader(compressed)
				if err != nil {
					return err
				}
				resp.Body = &gzipBody{Reader: reader, compressed: compressed}
				resp.Header.Del("Content-Encoding")
			default:
				return errors.New("unsupported upstream content encoding")
			}
			if strings.HasPrefix(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
				reader, writer := io.Pipe()
				body := resp.Body
				go func() {
					err := inspectSSE(writer, body, engine, bus)
					_ = body.Close()
					_ = writer.CloseWithError(err)
				}()
				resp.Body = reader
				resp.ContentLength = -1
				resp.Header.Del("Content-Length")
				resp.Header.Del("ETag")
				resp.Header.Del("Content-MD5")
				return nil
			}
			body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
			if err != nil {
				return err
			}
			_ = resp.Body.Close()
			if len(body) > maxResponseBytes {
				return errors.New("upstream response body exceeds size limit")
			}

			result := engine.EvaluateResponse(body)
			if len(result.Detections) > 0 {
				detBytes, _ := json.Marshal(result.Detections)
				bus.Record(audit.Event{
					Direction:  "response",
					Violations: detBytes,
				})
			}

			payload := result.Payload
			resp.Body = io.NopCloser(bytes.NewReader(payload))
			resp.ContentLength = int64(len(payload))
			resp.Header.Set("Content-Length", strconv.Itoa(len(payload)))
			resp.Header.Del("ETag")
			resp.Header.Del("Content-MD5")
			return nil
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && !sameOrigin(origin, r) {
			http.Error(w, "forbidden origin", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodPost {
			proxy.ServeHTTP(w, r)
			return
		}

		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
		if err != nil {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		_ = r.Body.Close()

		decision := engine.EvaluateRequest(body)

		method, tool := peek(body)
		var violBytes json.RawMessage
		if len(decision.Violations) > 0 {
			violBytes, _ = json.Marshal(decision.Violations)
		}
		bus.Record(audit.Event{
			Direction:  "request",
			Method:     method,
			Tool:       tool,
			Blocked:    decision.Blocked,
			Violations: violBytes,
			RemoteAddr: r.RemoteAddr,
		})

		if decision.Blocked {
			writePolicyViolation(w, body, decision)
			return
		}

		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		proxy.ServeHTTP(w, r)
	})
}

type gzipBody struct {
	*gzip.Reader
	compressed io.ReadCloser
}

func (b *gzipBody) Close() error {
	_ = b.Reader.Close()
	return b.compressed.Close()
}

func sameOrigin(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	if !strings.EqualFold(u.Host, r.Host) {
		return false
	}
	return (r.TLS != nil && u.Scheme == "https") || (r.TLS == nil && u.Scheme == "http")
}

func inspectSSE(w io.Writer, body io.Reader, engine *policy.Engine, bus *audit.Bus) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64<<10), maxResponseBytes+1)
	var event bytes.Buffer
	var data []string
	flush := func() error {
		if len(data) == 0 {
			_, err := w.Write(event.Bytes())
			return err
		}
		payload := []byte(strings.Join(data, "\n"))
		if !json.Valid(payload) {
			return errors.New("invalid JSON in upstream event")
		}
		result := engine.EvaluateResponse(payload)
		if len(result.Detections) > 0 {
			detBytes, _ := json.Marshal(result.Detections)
			bus.Record(audit.Event{Direction: "response", Violations: detBytes})
		}
		if !result.Modified {
			_, err := w.Write(event.Bytes())
			return err
		}
		for _, line := range strings.Split(strings.TrimSuffix(event.String(), "\n\n"), "\n") {
			if strings.HasPrefix(line, "data:") {
				continue
			}
			if _, err := io.WriteString(w, line+"\n"); err != nil {
				return err
			}
		}
		_, err := io.WriteString(w, "data: "+string(result.Payload)+"\n\n")
		return err
	}
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if event.Len()+len(line)+1 > maxResponseBytes {
			return errors.New("upstream event exceeds size limit")
		}
		event.WriteString(line)
		event.WriteByte('\n')
		if line == "" {
			if err := flush(); err != nil {
				return err
			}
			event.Reset()
			data = nil
			continue
		}
		if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if event.Len() > 0 {
		return errors.New("incomplete upstream event")
	}
	return nil
}

func writePolicyViolation(w http.ResponseWriter, requestBody []byte, d policy.Decision) {
	id := extractID(requestBody)

	summary := "halberd: request blocked by policy"
	if len(d.Violations) > 0 {
		summary = "halberd: " + d.Violations[0].Rule + " on " + d.Violations[0].Field
	}

	violBytes, _ := json.Marshal(d.Violations)
	resp, _ := jsonrpc.PolicyViolation(id, summary, violBytes)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK) // JSON-RPC errors ride a 200 with error in body
	_, _ = w.Write(resp)
}

func peek(body []byte) (method, tool string) {
	var env struct {
		Method string `json:"method"`
		Params struct {
			Name string `json:"name"`
		} `json:"params"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return "", ""
	}
	return env.Method, env.Params.Name
}

func extractID(body []byte) json.RawMessage {
	var env struct {
		ID json.RawMessage `json:"id"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return nil
	}
	return env.ID
}
