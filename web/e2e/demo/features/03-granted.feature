# Cluster III, allowed. A safe request flows through unchanged. This
# scenario counters the easy misread that everything gets blocked.

Feature: Allowed: a safe request reaches the server

  Background:
    Given I am on the Halberd console

  Scenario: A safe SELECT is forwarded under the postgres bundle
    When I choose the "mcp-server-postgres" rule pack
    And I load the "Safe SELECT (allowed)" scenario
    And I send it through Halberd
    Then the verdict reads "Allowed"
    And no violations are recorded
