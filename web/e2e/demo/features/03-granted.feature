# Cluster III — PASS GRANTED. Halberd is a firewall, not a wall — a
# safe request flows through unchanged. This scenario exists to
# counter the easy misread that "everything just gets blocked." The
# brass-seal verdict shows the affirmative case clearly.

Feature: Pass granted — a safe envelope reaches the upstream

  Background:
    Given I am on the Halberd playground

  Scenario: A safe SELECT is forwarded under the postgres bundle
    When I choose the "mcp-server-postgres" rule pack
    And I load the "Safe SELECT (allowed)" scenario
    And I challenge the envelope
    Then the verdict reads "Pass granted"
    And no violations are recorded
