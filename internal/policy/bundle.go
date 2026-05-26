// Package policy contains Halberd's IO-free policy engine: YAML bundle
// loading, regex denylist compilation, and the per-request evaluator that
// the HTTP and stdio transports call on the hot path.
package policy

import (
	"fmt"
	"os"
	"regexp"

	"gopkg.in/yaml.v3"
)

// Bundle is a deserialized policy YAML file. One Bundle protects one MCP
// server; the proxy holds exactly one Bundle for the lifetime of a process.
type Bundle struct {
	Version         int              `yaml:"version"`
	Server          string           `yaml:"server"`
	Tools           []ToolRule       `yaml:"tools"`
	Defaults        Defaults         `yaml:"defaults"`
	ResponseFilters *ResponseFilters `yaml:"response_filters,omitempty"`
}

// ResponseFilters configures sanitization applied to JSON-RPC responses
// flowing from the upstream MCP server back to the agent. A nil
// ResponseFilters disables response inspection entirely (the fast path
// for bundles that don't need it).
type ResponseFilters struct {
	Global GlobalResponseFilter `yaml:"global"`
}

// GlobalResponseFilter applies to every response, regardless of which
// tool produced it.
type GlobalResponseFilter struct {
	StripAnsiEscapes bool     `yaml:"strip_ansi_escapes"`
	StripZeroWidth   bool     `yaml:"strip_zero_width"`
	SecretScanners   []string `yaml:"secret_scanners"`
}

// Defaults controls how the engine handles requests the bundle hasn't
// explicitly classified.
type Defaults struct {
	UnknownTool   string `yaml:"unknown_tool"`
	UnknownMethod string `yaml:"unknown_method"`
}

// ToolRule is the policy for one MCP tool (one entry under `tools:` in the
// YAML). A ToolRule with an empty Arguments map allows every call to that
// tool unconditionally.
type ToolRule struct {
	Name      string                  `yaml:"name"`
	Arguments map[string]ArgumentRule `yaml:"arguments"`
}

// ArgumentRule constrains one argument of one tool. All non-zero fields are
// AND-combined: an argument must pass type, length, allow_values, and every
// deny_pattern.
type ArgumentRule struct {
	Type         string   `yaml:"type"`
	DenyPatterns []string `yaml:"deny_patterns"`
	MaxLength    int      `yaml:"max_length"`
	AllowValues  []string `yaml:"allow_values"`

	denyCompiled []*regexp.Regexp
	allowSet     map[string]struct{}
}

// Disposition values accepted by Defaults.UnknownTool and
// Defaults.UnknownMethod.
const (
	DispositionAllow      = "allow"
	DispositionDeny       = "deny"
	DispositionLogAndPass = "log_and_pass"
)

// LoadBundle reads a YAML file from disk and returns a compiled Bundle.
// Regex patterns are compiled at load time; an invalid pattern fails with a
// clear error pointing at the tool, argument, and offending pattern.
func LoadBundle(path string) (*Bundle, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read policy bundle: %w", err)
	}
	return ParseBundle(raw)
}

// ParseBundle deserializes a YAML document into a compiled Bundle. Useful
// when the bundle source is not a file on disk (e.g. config-map mount,
// embedded testdata).
func ParseBundle(raw []byte) (*Bundle, error) {
	var b Bundle
	if err := yaml.Unmarshal(raw, &b); err != nil {
		return nil, fmt.Errorf("parse policy bundle: %w", err)
	}
	if err := b.compile(); err != nil {
		return nil, err
	}
	if err := b.validate(); err != nil {
		return nil, err
	}
	return &b, nil
}

func (b *Bundle) compile() error {
	for i := range b.Tools {
		for argName, arg := range b.Tools[i].Arguments {
			compiled := make([]*regexp.Regexp, 0, len(arg.DenyPatterns))
			for _, pat := range arg.DenyPatterns {
				re, err := regexp.Compile(pat)
				if err != nil {
					return fmt.Errorf("tool %q arg %q: invalid deny_pattern %q: %w",
						b.Tools[i].Name, argName, pat, err)
				}
				compiled = append(compiled, re)
			}
			arg.denyCompiled = compiled
			if len(arg.AllowValues) > 0 {
				arg.allowSet = make(map[string]struct{}, len(arg.AllowValues))
				for _, v := range arg.AllowValues {
					arg.allowSet[v] = struct{}{}
				}
			}
			b.Tools[i].Arguments[argName] = arg
		}
	}
	return nil
}

func (b *Bundle) validate() error {
	if b.Version != 1 {
		return fmt.Errorf("unsupported bundle version %d (want 1)", b.Version)
	}
	if b.Defaults.UnknownTool == "" {
		b.Defaults.UnknownTool = DispositionDeny
	}
	if b.Defaults.UnknownMethod == "" {
		b.Defaults.UnknownMethod = DispositionLogAndPass
	}
	for _, t := range b.Tools {
		if t.Name == "" {
			return fmt.Errorf("tool with empty name")
		}
		for argName, arg := range t.Arguments {
			if arg.Type != "" && arg.Type != "string" && arg.Type != "number" && arg.Type != "boolean" {
				return fmt.Errorf("tool %q arg %q: unsupported type %q", t.Name, argName, arg.Type)
			}
		}
	}
	if b.ResponseFilters != nil {
		for _, name := range b.ResponseFilters.Global.SecretScanners {
			if _, ok := builtinScanners[name]; !ok {
				return fmt.Errorf("response_filters: unknown secret_scanner %q (available: %s)",
					name, listScannerNames())
			}
		}
	}
	return nil
}

func (b *Bundle) toolRule(name string) (ToolRule, bool) {
	for _, t := range b.Tools {
		if t.Name == name {
			return t, true
		}
	}
	return ToolRule{}, false
}
