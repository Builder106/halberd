# Cluster II, amended. The response filters redact secrets from a
# server reply before the assistant ever sees them. The honeypot
# pack is deliberately calibrated to produce response-side
# detections so this scenario consistently shows three redactions
# (aws_access_key, github_token, rsa_private_key).

Feature: Amended: Halberd redacts secrets from a reply

  Background:
    Given I am on the Halberd console

  Scenario: An aws + github + rsa-laden response is amended under the honeypot bundle
    When I choose the "halberd-honeypot" rule pack
    And I load the "Response with AWS + GitHub + RSA (amended)" scenario
    And I send it through Halberd
    Then the verdict reads "Amended"
    And the rewritten payload no longer contains "AKIAIOSFODNN7EXAMPLE"
    And the rewritten payload contains "[REDACTED]"
