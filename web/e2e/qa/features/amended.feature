Feature: Amended — secrets are redacted from outbound responses

  Background:
    Given I am on the Halberd playground

  Scenario: AWS + GitHub + RSA secrets are redacted under the honeypot pack
    When I choose the "halberd-honeypot" rule pack
    And I load the "Response with AWS + GitHub + RSA (sanitized)" scenario
    And I challenge the envelope
    Then the verdict reads "Amended"
    And the rewritten payload no longer contains "AKIAIOSFODNN7EXAMPLE"
    And the rewritten payload contains "[REDACTED]"

  Scenario: An embedded AWS key in a postgres response is redacted
    When I choose the "mcp-server-postgres" rule pack
    And I load the "Response with embedded AWS key (sanitized)" scenario
    And I challenge the envelope
    Then the verdict reads "Amended"
    And the rewritten payload no longer contains "AKIAIOSFODNN7EXAMPLE"
    And the rewritten payload contains "[REDACTED]"

  Scenario: A tool-poisoning response is amended under the honeypot pack
    When I choose the "halberd-honeypot" rule pack
    And I load the "Tool-poisoning response (sanitized)" scenario
    And I challenge the envelope
    Then the verdict reads "Amended"
