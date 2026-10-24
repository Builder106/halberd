Feature: Allowed: safe requests flow through unchanged

  Background:
    Given I am on the Halberd console

  Scenario: A safe SELECT is forwarded under the postgres pack
    When I choose the "mcp-server-postgres" rule pack
    And I load the "Safe SELECT (allowed)" scenario
    And I send it through Halberd
    Then the verdict reads "Allowed"
    And no violations are recorded

  Scenario: A relative file read is forwarded under the filesystem pack
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Relative read (allowed)" scenario
    And I send it through Halberd
    Then the verdict reads "Allowed"
    And no violations are recorded

  Scenario: git status is forwarded under the git pack
    When I choose the "mcp-server-git" rule pack
    And I load the "git status (allowed)" scenario
    And I send it through Halberd
    Then the verdict reads "Allowed"
    And no violations are recorded

  Scenario: An in-org request is forwarded under the github pack
    When I choose the "mcp-server-github" rule pack
    And I load the "get_issue in your-org (allowed)" scenario
    And I send it through Halberd
    Then the verdict reads "Allowed"
    And no violations are recorded
