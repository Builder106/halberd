package policy

import (
	"regexp"
	"sort"
	"strings"
)

// ansiCSI matches CSI escape sequences (ESC [ params final-byte) and OSC
// sequences (ESC ] ... BEL). These are the two ANSI escape categories that
// produce visible terminal-control output; less common forms (DCS, SOS,
// PM, APC) are left alone for v0.1.
var (
	ansiCSI = regexp.MustCompile(`\x1b\[[0-9;]*[@-~]`)
	ansiOSC = regexp.MustCompile(`\x1b\][^\x07]*\x07`)
)

// zeroWidth matches Unicode characters that have no visible width but can
// be used to hide content from log scrapers, conceal injection markers, or
// disrupt textual diff review.
var zeroWidth = regexp.MustCompile(`[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}]`)

// secretScanner is one named detector. Each entry has a regex that locates
// the secret in plain text and a replace function that produces the
// sanitized string. Replacement preserves length where reasonable so the
// agent sees roughly the same shape of response.
type secretScanner struct {
	re      *regexp.Regexp
	replace func(match string) string
}

const redactedPlaceholder = "[REDACTED]"

var builtinScanners = map[string]secretScanner{
	"aws_access_key": {
		// Standard AWS access keys begin AKIA; STS temporary creds begin
		// ASIA. Both have 16 uppercase-alphanumeric chars after the prefix.
		re:      regexp.MustCompile(`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`),
		replace: func(_ string) string { return redactedPlaceholder },
	},
	"github_token": {
		// GitHub personal access tokens (classic + fine-grained) and
		// server-to-server tokens, all 36+ chars after the prefix.
		re:      regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{36,}\b`),
		replace: func(_ string) string { return redactedPlaceholder },
	},
	"rsa_private_key": {
		// Catches RSA, OPENSSH, EC, DSA, and unlabeled "-----BEGIN PRIVATE
		// KEY-----" blocks. Replaces the entire block from BEGIN to END.
		re:      regexp.MustCompile(`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`),
		replace: func(_ string) string { return redactedPlaceholder },
	},
}

func listScannerNames() string {
	names := make([]string, 0, len(builtinScanners))
	for n := range builtinScanners {
		names = append(names, n)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}

// sanitizeString applies the global response filter to one decoded string
// value and returns the sanitized string plus the detections that fired.
// The empty path "" means the field path is unknown; callers should pass
// a JSON-pointer-style string like "result.content[0].text".
func (f *GlobalResponseFilter) sanitizeString(s, path string) (string, []Detection) {
	out := s
	var detections []Detection

	if f.StripAnsiEscapes {
		if ansiCSI.MatchString(out) {
			out = ansiCSI.ReplaceAllString(out, "")
			detections = append(detections, Detection{Kind: "ansi_csi", Path: path})
		}
		if ansiOSC.MatchString(out) {
			out = ansiOSC.ReplaceAllString(out, "")
			detections = append(detections, Detection{Kind: "ansi_osc", Path: path})
		}
	}

	if f.StripZeroWidth && zeroWidth.MatchString(out) {
		out = zeroWidth.ReplaceAllString(out, "")
		detections = append(detections, Detection{Kind: "zero_width", Path: path})
	}

	for _, name := range f.SecretScanners {
		sc, ok := builtinScanners[name]
		if !ok {
			continue
		}
		if sc.re.MatchString(out) {
			out = sc.re.ReplaceAllStringFunc(out, sc.replace)
			detections = append(detections, Detection{Kind: name, Path: path})
		}
	}

	return out, detections
}
