package policy

import (
	"fmt"
	"os"
	"regexp"

	"gopkg.in/yaml.v3"
)

type Bundle struct {
	Version  int         `yaml:"version"`
	Server   string      `yaml:"server"`
	Tools    []ToolRule  `yaml:"tools"`
	Defaults Defaults    `yaml:"defaults"`
}

type Defaults struct {
	UnknownTool   string `yaml:"unknown_tool"`
	UnknownMethod string `yaml:"unknown_method"`
}

type ToolRule struct {
	Name      string                   `yaml:"name"`
	Arguments map[string]ArgumentRule  `yaml:"arguments"`
}

type ArgumentRule struct {
	Type         string   `yaml:"type"`
	DenyPatterns []string `yaml:"deny_patterns"`
	MaxLength    int      `yaml:"max_length"`
	AllowValues  []string `yaml:"allow_values"`

	denyCompiled []*regexp.Regexp
	allowSet     map[string]struct{}
}

const (
	DispositionAllow      = "allow"
	DispositionDeny       = "deny"
	DispositionLogAndPass = "log_and_pass"
)

func LoadBundle(path string) (*Bundle, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read policy bundle: %w", err)
	}
	return ParseBundle(raw)
}

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
