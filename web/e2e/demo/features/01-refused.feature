# Cluster I — REFUSED. The sentry blocks malicious tools/call requests
# before they ever reach the upstream MCP server. Two scenarios from
# different rule packs to show this is policy-driven, not hard-coded.

Feature: Refused — the sentry blocks an inbound attack

  Background:
    Given I am on the Halberd playground

  @slug=refused-drop-table
  Scenario: A DROP TABLE is refused under the postgres bundle
    When I choose the "mcp-server-postgres" rule pack
    And I load the "DROP TABLE (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the sql field

  @slug=refused-path-traversal
  Scenario: A path-traversal read is refused under the filesystem bundle
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Path traversal (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the path field
