const threats = [
  {
    id: "T1",
    name: "Tool poisoning",
    coverage: "covered, v0.1",
    summary:
      "A compromised MCP server slips role-tag spoofs, ANSI escapes, or zero-width Unicode into a tool response to hijack the agent's next turn.",
    halberd: "Response inspector strips ANSI and zero-width Unicode in place.",
  },
  {
    id: "T2",
    name: "Argument injection",
    coverage: "covered, v0.1",
    summary:
      "The agent is induced to call a legitimate tool with hostile arguments: DROP TABLE, --upload-pack=…, statement chaining via ;--.",
    halberd:
      "Per-tool regex denylist, type checks, max-length, and allowlist enums.",
  },
  {
    id: "T3",
    name: "Out-of-scope I/O",
    coverage: "v0.2 roadmap",
    summary:
      "A narrow-purpose tool gets pushed to read /etc/shadow, hit a private IP, or write outside its sandbox.",
    halberd:
      "Path traversal, absolute-path, and home-expansion patterns already deny on filesystem and git packs.",
  },
  {
    id: "T4",
    name: "Capability creep",
    coverage: "covered, v0.1",
    summary:
      'Mid-session, an MCP server pushes "tools/list_changed" and adds a tool the agent calls before any human reviews it.',
    halberd:
      "Tool inventory pinned to the bundle; any unknown tool is denied by default.",
  },
  {
    id: "T5",
    name: "Exfiltration via response",
    coverage: "covered, v0.1",
    summary:
      "A tool response carries AWS keys, GitHub tokens, or RSA private keys back into the model context.",
    halberd:
      "Built-in scanners redact aws_access_key, github_token, and rsa_private_key on the wire.",
  },
];

const packs = [
  { name: "mcp-server-postgres", tools: 3 },
  { name: "mcp-server-filesystem", tools: 9 },
  { name: "mcp-server-git", tools: 8 },
  { name: "mcp-server-github", tools: 8 },
  { name: "halberd-honeypot", tools: 4, hint: "deliberately-vulnerable demo target" },
];

export function ThreatModel() {
  return (
    <section
      id="threats"
      className="relative max-w-6xl mx-auto px-6 py-24 border-b border-(--color-border)"
    >
      <h2
        className="text-3xl font-bold mb-3"
        style={{ fontFamily: "var(--font-display)" }}
      >
        What Halberd defends against
      </h2>
      <p className="text-(--color-fg-2) mb-12 max-w-2xl">
        Five named threat categories. v0.1 ships request-side and
        response-side coverage for four of them on both HTTP and stdio
        transports.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {threats.map((t) => (
          <div
            key={t.id}
            className="p-5 rounded-lg border border-(--color-border) bg-(--color-panel)/40"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-(--color-fg-3) text-sm">
                  {t.id}
                </span>
                <h3 className="font-semibold">{t.name}</h3>
              </div>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  t.coverage.startsWith("covered")
                    ? "text-(--color-success) bg-(--color-success)/10 border border-(--color-success)/30"
                    : "text-(--color-warning) bg-(--color-warning)/10 border border-(--color-warning)/30"
                }`}
              >
                {t.coverage}
              </span>
            </div>
            <p className="text-sm text-(--color-fg-2) mb-3">{t.summary}</p>
            <p className="text-sm text-(--color-fg-3)">
              <span className="text-(--color-fg-2) font-medium">Halberd: </span>
              {t.halberd}
            </p>
          </div>
        ))}
      </div>

      <h3
        className="text-xl font-bold mt-16 mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Bundled rule packs
      </h3>
      <div className="flex flex-wrap gap-2">
        {packs.map((p) => (
          <a
            key={p.name}
            href={`https://github.com/Builder106/Halberd/blob/main/policies/${p.name}.yaml`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-3 px-3 py-2 rounded-md border border-(--color-border) bg-(--color-panel)/40 hover:bg-(--color-panel) hover:border-(--color-accent)/40 transition"
          >
            <span className="font-mono text-sm text-(--color-fg)">
              {p.name}
            </span>
            <span className="text-xs text-(--color-fg-3)">
              {p.tools} tools
            </span>
            {p.hint && (
              <span className="text-xs italic text-(--color-warning)">
                {p.hint}
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
