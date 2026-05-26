# Policy DSL reference

A Halberd policy bundle is a YAML document describing which JSON-RPC tool
calls an MCP server is allowed to receive, and which arguments are
acceptable for each. Bundles are loaded once at proxy startup and compiled
to an in-memory matcher — regex patterns are precompiled, allowlists are
hashed.

## Top-level shape

```yaml
version: 1
server: <string>
tools: [<tool>...]
defaults:
  unknown_tool:   allow | deny | log_and_pass
  unknown_method: allow | deny | log_and_pass
```

| Key | Required | Notes |
|---|---|---|
| `version` | yes | Must be `1`. Future-incompatible changes bump this. |
| `server` | yes | Free-form identifier; appears in audit-log entries. |
| `tools` | yes | List of tool rules. Empty list is valid but then every `tools/call` is rejected when `defaults.unknown_tool = deny`. |
| `defaults.unknown_tool` | no | Default: `deny`. |
| `defaults.unknown_method` | no | Default: `log_and_pass`. |

## Tool rule

```yaml
- name: <string>
  arguments:
    <arg-name>: <argument-rule>
```

Tools whose `name` is referenced by a `tools/call` request are matched
case-sensitively. A tool listed here with no `arguments` map is allowed
unconditionally — useful for read-only metadata calls like `list_tables`.

## Argument rule

```yaml
type:          string | number | boolean
max_length:    <int>          # only for type=string; bytes, not chars
allow_values:  [<string>...]  # strict enum; if non-empty, value must match
deny_patterns: [<regex>...]   # any match blocks the request
```

All four fields are optional. They combine with AND semantics: an argument
must pass type, length, allow_values, *and* every deny_pattern.

### Regex flavor

Patterns use Go's `regexp` package, which is RE2. **No backreferences, no
lookaround.** Use `(?i)` for case-insensitive matching. Patterns are
compiled at bundle load — invalid regex fails `halberd lint` with the file
and line number.

### Length limits

`max_length` is measured in bytes of the UTF-8 encoded string, not Unicode
code points. The default upper bound for any string argument should be
8192 — long-tail tools rarely need more, and capping protects against
denial-of-service via oversized payloads.

## What Halberd does *not* validate

By design, the v0.1 DSL is deliberately small. It does **not** support:

- Nested object/array argument schemas
- Cross-argument constraints (`if a == "X" then b is required`)
- Custom Go callbacks or scripting
- Inheritance / `include:` between bundles

If you need those, you're probably looking for [OPA](https://www.openpolicyagent.org/)
or [Cedar](https://www.cedarpolicy.com/). Halberd's design point is
fast-path matching on the 90% of MCP tool surfaces that take a flat
`{string, number, boolean}` argument map.
