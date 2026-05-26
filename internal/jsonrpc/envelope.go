// Package jsonrpc implements the subset of JSON-RPC 2.0 used by the Model Context
// Protocol. The MCP spec is JSON-RPC 2.0 over either stdio or HTTP+SSE; this
// package only models the envelope and the error-response shape Halberd needs to
// synthesize when blocking a request.
package jsonrpc

import (
	"encoding/json"
)

type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *Error          `json:"error,omitempty"`
}

type Error struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603

	CodePolicyViolation = -32000
)
