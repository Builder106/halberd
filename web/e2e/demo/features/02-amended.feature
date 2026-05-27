# Cluster II — AMENDED. The auditor strikes secrets out of an
# outbound response before the agent ever sees them. The honeypot
# pack is deliberately calibrated to produce response-side
# detections so this scenario consistently shows three redactions
# (aws_access_key, github_token, rsa_private_key).

Feature: Amended — the auditor strikes secrets from a response

  Background:
    Given I am on the Halberd playground

  @slug=amended-aws-github-rsa-laden-response
  Scenario: An aws + github + rsa-laden response is amended under the honeypot bundle
    When I choose the "halberd-honeypot" rule pack
    And I load the "Response with AWS + GitHub + RSA (sanitized)" scenario
    And I challenge the envelope
    Then the verdict reads "Amended"
    And the rewritten payload no longer contains "AKIAIOSFODNN7EXAMPLE"
    And the rewritten payload contains "[REDACTED]"
