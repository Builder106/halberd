Feature: Refused — inbound attacks are blocked before reaching the server

  Background:
    Given I am on the Halberd playground

  # ── postgres pack ──────────────────────────────────────────────────────────

  Scenario: DROP TABLE is refused under the postgres pack
    When I choose the "mcp-server-postgres" rule pack
    And I load the "DROP TABLE (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the sql field

  Scenario: Statement chaining via semicolon is refused under the postgres pack
    When I choose the "mcp-server-postgres" rule pack
    And I load the "Statement chaining via ; -- (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the sql field

  Scenario: pg_read_server_files is refused under the postgres pack
    When I choose the "mcp-server-postgres" rule pack
    And I load the "pg_read_server_files (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the sql field

  # ── filesystem pack ────────────────────────────────────────────────────────

  Scenario: Path traversal is refused under the filesystem pack
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Path traversal (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the path field

  Scenario: Absolute path is refused under the filesystem pack
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Absolute path (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the path field

  Scenario: Home expansion to .ssh/id_rsa is refused under the filesystem pack
    When I choose the "mcp-server-filesystem" rule pack
    And I load the "Home expansion to .ssh/id_rsa (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the path field

  # ── git pack ───────────────────────────────────────────────────────────────

  Scenario: Upload-pack smuggling via ref is refused under the git pack
    When I choose the "mcp-server-git" rule pack
    And I load the "--upload-pack smuggling via ref (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And a deny_pattern violation is recorded on the target field

  Scenario: A write tool not in the git bundle is refused
    When I choose the "mcp-server-git" rule pack
    And I load the "git_commit (denied — write tool not in bundle)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"

  # ── github pack ────────────────────────────────────────────────────────────

  Scenario: Out-of-org owner is refused under the github pack
    When I choose the "mcp-server-github" rule pack
    And I load the "get_issue outside org allowlist (blocked)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
    And an allow_values violation is recorded on the owner field

  Scenario: delete_repository not in the github bundle is refused
    When I choose the "mcp-server-github" rule pack
    And I load the "delete_repository (denied — not in bundle)" scenario
    And I challenge the envelope
    Then the verdict reads "Refused"
