package policy

import "fmt"

type Decision struct {
	Blocked    bool
	Violations []Violation
}

type Violation struct {
	Category   string
	Tool       string
	Field      string
	Rule       string
	Detail     string
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

const (
	CategoryArgInjection   = "T2_arg_injection"
	CategoryOutOfScope     = "T3_out_of_scope"
	CategoryCapabilityCreep = "T4_capability_creep"
	CategoryExfiltration   = "T5_exfiltration"
	CategoryToolPoisoning  = "T1_tool_poisoning"
	CategoryMalformed      = "malformed_request"
)
