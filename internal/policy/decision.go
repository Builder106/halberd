package policy

import "fmt"

// Decision is the policy engine's verdict on one JSON-RPC payload. Blocked
// is true when at least one Violation matched; the caller is expected to
// short-circuit the proxy chain and synthesize a JSON-RPC error.
type Decision struct {
	Blocked    bool
	Violations []Violation
}

// Violation is one matched rule. Several may accumulate on a single payload
// (e.g. a value that's both too long and matches a deny_pattern); all are
// returned so the audit log captures the full picture.
type Violation struct {
	Category string
	Tool     string
	Field    string
	Rule     string
	Detail   string
}

func (v Violation) String() string {
	if v.Field != "" {
		return fmt.Sprintf("[%s] tool=%q field=%q rule=%q: %s", v.Category, v.Tool, v.Field, v.Rule, v.Detail)
	}
	if v.Tool != "" {
		return fmt.Sprintf("[%s] tool=%q rule=%q: %s", v.Category, v.Tool, v.Rule, v.Detail)
	}
	return fmt.Sprintf("[%s] rule=%q: %s", v.Category, v.Rule, v.Detail)
}

// Threat-category identifiers used in Violation.Category. The T-prefixed
// codes match the taxonomy in docs/threat-model.md.
const (
	CategoryArgInjection    = "T2_arg_injection"
	CategoryOutOfScope      = "T3_out_of_scope"
	CategoryCapabilityCreep = "T4_capability_creep"
	CategoryExfiltration    = "T5_exfiltration"
	CategoryToolPoisoning   = "T1_tool_poisoning"
	CategoryMalformed       = "malformed_request"
)
