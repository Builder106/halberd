# Halberd Agent Firewall Architecture

This document describes the high-performance JSON-RPC firewall architecture, WebAssembly bridge design, and threat mitigation engine implemented in Halberd.

## Threat Matrix & Mitigation Coverage

Halberd sits between an LLM agent and Model Context Protocol (MCP) tool servers. The table separates current checks from work that remains planned:

| Threat ID | Threat Category | Attack Vector | Halberd Mitigation |
| --- | --- | --- | --- |
| **T1** | Tool Poisoning | Compromised tool responses returning role-tag spoofing or prompt injection | Selected ANSI and zero-width characters are stripped from JSON-RPC results; prompt injection itself is not detected |
| **T2** | Argument Injection | Hostile parameters in valid tool calls (e.g. `DROP TABLE`, `rm -rf`) | Configured regex, allowlist, length, and type checks; no SQL or shell parser |
| **T3** | Out-of-Scope I/O | Tools attempting unapproved network calls or file traversal | Planned; bundles can deny specific argument patterns but do not sandbox I/O |
| **T4** | Capability Creep | Unvetted tools appearing mid-session via dynamic tool registration | Strict tool name whitelisting in policy packs |
| **T5** | Secret Exfiltration | Tool responses carrying secrets (AWS keys, GitHub tokens, private keys) | Opt-in pattern redaction in JSON-RPC result strings; unknown formats are not caught |

## Request Lifecycle & Verdict Engine

Every JSON-RPC `tools/call` envelope passes through the decision engine:

```mermaid
sequenceDiagram
    participant Agent as AI assistant
    participant Firewall as Halberd proxy
    participant Policy as Policy engine
    participant Server as Upstream MCP server

    Agent->>Firewall: JSON-RPC tools/call
    Firewall->>Policy: EvaluateRequest(payload, policyPack)
    alt Rule violation (T2 or T4)
        Policy-->>Firewall: Refused
        Firewall-->>Agent: JSON-RPC error -32000
    else Allowed
        Policy-->>Firewall: Allowed
        Firewall->>Server: Forward the request
        Server-->>Firewall: Tool response
        Firewall->>Policy: EvaluateResponse(responsePayload)
        alt A configured filter matches
            Policy-->>Firewall: Amended
            Firewall-->>Agent: Response with [REDACTED] values
        else No filter matches
            Firewall-->>Agent: Original response
        end
    end
```

## Verdict Taxonomies

1. **⚔ Refused**: Pressed in red wax when a request contains denied SQL commands, forbidden paths, or unauthorized tool names. The request never hits the upstream server.
2. **⛨ Pass Granted**: Pressed in brass when the request matches all pass rules and contains no violation patterns. Sent to upstream untouched.
3. **✎ Amended**: Pressed in blue ink when a response contains sensitive credentials (AWS keys, GitHub tokens, private RSA blocks). Secrets are struck out and replaced with `[REDACTED]`.

## WebAssembly Bridge (`cmd/halberd-wasm`)

The Go policy engine in `internal/policy` is also compiled to WebAssembly with Go's `js/wasm` target. The browser playground runs policy decisions locally, without a backend policy request.
