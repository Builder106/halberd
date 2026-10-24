# Cluster I, refused. Halberd stops hostile tools/call requests
# before they ever reach the upstream MCP server. Two scenarios from
# different rule packs to show this is policy-driven, not hard-coded.

Feature: Refused: Halberd stops an inbound attack

  Background:
    Given I am on the Halberd console

  Scenario: A DROP TABLE is refused under the postgres bundle
    When I choose the "mcp-server-postgres" rule pack
    And I load the "DROP TABLE (refused)" scenario
    And I send it through Halberd
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the sql field

  Scenario: A path-traversal read is refused under the filesystem bundle
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Path traversal (refused)" scenario
    And I send it through Halberd
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the path field
