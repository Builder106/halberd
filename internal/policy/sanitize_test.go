package policy

import (
	"strings"
	"testing"
)

func allFilter() *GlobalResponseFilter {
	return &GlobalResponseFilter{
		StripAnsiEscapes: true,
		StripZeroWidth:   true,
		SecretScanners:   []string{"aws_access_key", "github_token", "rsa_private_key"},
	}
}

func TestSanitizeString_StripsANSIColor(t *testing.T) {
	in := "\x1b[31mhot path\x1b[0m"
	out, det := allFilter().sanitizeString(in, "test")
	if out != "hot path" {
		t.Errorf("got %q, want %q", out, "hot path")
	}
	if len(det) == 0 {
		t.Fatal("expected at least one detection")
	}
	if det[0].Kind != "ansi_csi" {
		t.Errorf("detection kind = %q, want ansi_csi", det[0].Kind)
	}
}

func TestSanitizeString_StripsANSIOSC(t *testing.T) {
	in := "before\x1b]0;malicious title\x07after"
	out, det := allFilter().sanitizeString(in, "")
	if out != "beforeafter" {
		t.Errorf("got %q, want %q", out, "beforeafter")
	}
	if len(det) == 0 || det[0].Kind != "ansi_osc" {
		t.Errorf("expected ansi_osc detection, got %+v", det)
	}
}

func TestSanitizeString_StripsZeroWidth(t *testing.T) {
	// U+200B (ZWSP), U+200C (ZWNJ), U+FEFF (BOM) — kept as escape sequences
	// because Go's source-file scanner rejects an embedded U+FEFF byte.
	in := "vis\u200bible\u200ctext\ufeff"
	out, det := allFilter().sanitizeString(in, "")
	if out != "visibletext" {
		t.Errorf("got %q, want %q", out, "visibletext")
	}
	if len(det) == 0 || det[0].Kind != "zero_width" {
		t.Errorf("expected zero_width detection, got %+v", det)
	}
}

func TestSanitizeString_RedactsAWSKey(t *testing.T) {
	in := "credentials: AKIAIOSFODNN7EXAMPLE in env"
	out, det := allFilter().sanitizeString(in, "result.content[0].text")
	if !strings.Contains(out, redactedPlaceholder) {
		t.Errorf("got %q, expected [REDACTED]", out)
	}
	if strings.Contains(out, "AKIAIOSFODNN7EXAMPLE") {
		t.Errorf("AWS key leaked into output: %q", out)
	}
	if len(det) == 0 || det[0].Kind != "aws_access_key" {
		t.Errorf("expected aws_access_key detection, got %+v", det)
	}
}

func TestSanitizeString_RedactsGitHubToken(t *testing.T) {
	in := "token: ghp_" + strings.Repeat("A", 36) + " keep this"
	out, det := allFilter().sanitizeString(in, "")
	if !strings.Contains(out, redactedPlaceholder) {
		t.Errorf("got %q, expected [REDACTED]", out)
	}
	if strings.Contains(out, "ghp_AAAA") {
		t.Errorf("GitHub token leaked: %q", out)
	}
	if len(det) == 0 || det[0].Kind != "github_token" {
		t.Errorf("expected github_token detection, got %+v", det)
	}
}

func TestSanitizeString_RedactsRSAPrivateKey(t *testing.T) {
	in := "key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK...\n-----END RSA PRIVATE KEY-----\nrest"
	out, det := allFilter().sanitizeString(in, "")
	if !strings.Contains(out, redactedPlaceholder) {
		t.Errorf("got %q, expected [REDACTED]", out)
	}
	if strings.Contains(out, "MIIBOg") {
		t.Errorf("key body leaked: %q", out)
	}
	if len(det) == 0 || det[0].Kind != "rsa_private_key" {
		t.Errorf("expected rsa_private_key detection, got %+v", det)
	}
}

func TestSanitizeString_NoOpOnCleanText(t *testing.T) {
	in := "the quick brown fox jumps over the lazy dog"
	out, det := allFilter().sanitizeString(in, "")
	if out != in {
		t.Errorf("clean text was modified: %q -> %q", in, out)
	}
	if len(det) != 0 {
		t.Errorf("clean text produced detections: %+v", det)
	}
}

func TestSanitizeString_RespectsFlags(t *testing.T) {
	in := "\x1b[31mcolored\x1b[0m AKIAIOSFODNN7EXAMPLE\u200b"

	// Only secrets enabled — ANSI and zero-width should survive.
	f := &GlobalResponseFilter{SecretScanners: []string{"aws_access_key"}}
	out, _ := f.sanitizeString(in, "")
	if !strings.Contains(out, "\x1b[31m") {
		t.Errorf("ANSI was stripped despite flag off: %q", out)
	}
	if !strings.Contains(out, "\u200b") {
		t.Errorf("zero-width was stripped despite flag off: %q", out)
	}
	if strings.Contains(out, "AKIAIOSFODNN7EXAMPLE") {
		t.Errorf("AWS key not redacted: %q", out)
	}
}

func TestSanitizeString_MultipleDetections(t *testing.T) {
	in := "\x1b[31mAKIAIOSFODNN7EXAMPLE\x1b[0m"
	out, det := allFilter().sanitizeString(in, "")
	if strings.Contains(out, "\x1b") {
		t.Errorf("ANSI not stripped: %q", out)
	}
	if strings.Contains(out, "AKIA") {
		t.Errorf("AWS key not redacted: %q", out)
	}
	if len(det) < 2 {
		t.Errorf("expected at least 2 detections, got %+v", det)
	}
}
