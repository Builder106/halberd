Feature: Pass granted — safe envelopes flow through unchanged

  Background:
    Given I am on the Halberd playground

  Scenario: A safe SELECT is forwarded under the postgres pack
    When I choose the "mcp-server-postgres" rule pack
    And I load the "Safe SELECT (allowed)" scenario
    And I challenge the envelope
    Then the verdict reads "Pass granted"
    And no violations are recorded

  Scenario: A relative file read is forwarded under the filesystem pack
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Relative read (allowed)" scenario
    And I challenge the envelope
    Then the verdict reads "Pass granted"
    And no violations are recorded

  Scenario: git status is forwarded under the git pack
    When I choose the "mcp-server-git" rule pack
    And I load the "git status (allowed)" scenario
    And I challenge the envelope
    Then the verdict reads "Pass granted"
    And no violations are recorded

  Scenario: An in-org request is forwarded under the github pack
    When I choose the "mcp-server-github" rule pack
    And I load the "get_issue in your-org (allowed)" scenario
    And I challenge the envelope
    Then the verdict reads "Pass granted"
    And no violations are recorded
