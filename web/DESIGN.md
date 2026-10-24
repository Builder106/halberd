# Halberd site design

## Brief

- **Subject:** Halberd, a policy proxy for the Model Context Protocol. It sits in the
  JSON-RPC pipe between an AI assistant and an MCP server, checks each `tools/call`
  against a YAML rule pack, refuses matches with error `-32000`, and redacts recognized
  secrets from results on the way back.
- **Audience:** developers who wire MCP servers into Claude Desktop, Cursor and similar
  hosts, and security reviewers deciding whether the proxy is worth trying.
- **Job:** show what Halberd does to real messages in under a minute, let visitors try
  the real engine (Go compiled to WebAssembly), and get them to the build instructions.
- **Constraints:** every verdict on the site must be what the engine returns. The
  project is pre-release with no binary download. The copy must keep the limits the
  threat model states (partial coverage, no sandbox, no prompt-injection detection).
- **Replaces:** the May 2026 "keep tour" (wax seals, brass, parchment, Roman numerals).
  Its metaphor was decoration laid over a template sidebar, cards and a purple glow.

## Concepts

| | A. The session (material) | B. The rule pack (process) | C. The audit log (formal) |
|---|---|---|---|
| Idea | The site is one MCP session drawn as a sequence diagram: assistant, Halberd, server; every message crosses or stops at Halberd's line | The site is the postgres rule pack set large; each key is a section, and requests light up the line that catches them | Every block of the site is one JSONL audit record; the page is the log, read top to bottom |
| Anchor | MCP is JSON-RPC over a pipe, and Halberd is a process in the middle of that pipe that decides per message | Halberd is configured entirely by a YAML bundle per server | Halberd writes one JSON line per decision to an audit bus |
| Signature | A result row crosses the line and its AWS key turns into `[REDACTED]` exactly where it crosses | Type SQL; the matching `deny_patterns` line highlights | Lines stream in as you scroll, refused ones stay marked |
| Structure | The page is the diagram; lanes replace the navbar; one unit is one exchange (request and reply, paired by `id`) | The page is a file; line numbers navigate | The page is a log; timestamps navigate |
| Swap test | Fails for any other firewall: it needs JSON-RPC ids, `tools/call`, `-32000` and a stdio pipe | A config file fits any config-driven tool | A log fits any logging product |
| O / F / Fe / P / S | 4 / 5 / 4 / 1 / 5 | 3 / 5 / 4 / 3 / 4 | 3 / 3 / 5 / 4 / 3 |

**Pick A.** It is the only one that could not be moved to another product, and the
layout itself carries the verdicts. From C: the escape hatch is the audit log
(`/log`), in Halberd's real event format. From B: the policy excerpt opens inside the
`tools/list` exchange.

The name (a polearm) is used once: the Halberd lifeline is the shaft, and the drawn
head sits at its top as the mark. No other medieval imagery.

## Concept card

```
Idea:         One MCP session, drawn as a sequence diagram. Every message meets Halberd's line.
Metaphor:     A protocol sequence diagram: three lifelines (assistant, Halberd, server), time flows down.
Signature:    Exchange 3. The result envelope travels from the server lane to the assistant lane, scrubbed
              by scroll; characters that have crossed the line are already redacted, the rest are not.
Emotion:      Calm, exact, a little dry. The feeling of reading a trace that explains itself.
Motion verb:  Travel and stop. Messages slide at constant speed along their wire, then cross the line
              or stop dead at it with a 4 px recoil.
Screenshot:   A DROP TABLE envelope pressed against the line, "DROP TABLE" under a highlighter stroke,
              and an empty server lane beside it that says nothing arrived.
Structure:    The site is the session. Lane headers (assistant, Halberd, server) replace the navbar.
              One unit is one exchange, addressed by its JSON-RPC id (/#id-4). Inner views are the
              console (send your own message) and the audit log.
Escape hatch: /log, the session as audit records, one line per decision, each linking to its exchange.
```

**Layout rule.** Where a block sits says what Halberd did with it. Prose and envelopes
for refused requests stay in the assistant lane, because the request never left.
Allowed requests land in the server lane. Amended responses arrive in the assistant
lane with their redactions.

## Art direction

**Palette** (source: a reviewed transcript: paper, ink, a highlighter, a redaction bar)

| Role | Hex | Use |
|---|---|---|
| ground | `#F1F2F4` | page; cool, never cream |
| ink | `#0D0F12` | text, lifelines, redaction bars, curtain |
| muted | `#585F69` | secondary text (5.9:1 on ground) |
| line | `#C6CBD2` | wires and the few hairlines |
| mark | `#FFE14A` | highlighter behind matched text; fill only, ink on top |
| panel | `#E6E8EB` | envelope ground |

No dark theme: one committed theme, light because a trace on paper is the reference.

**Type**

- Archivo (Google, variable `wdth` 62 to 125, `wght` 100 to 900): display at `wdth` 112
  and weight 760, text at `wdth` 100 and weight 400, lane labels at `wdth` 80 and
  weight 600.
- Fragment Mono (Google, 400): JSON-RPC envelopes and rule names only. Mono is content
  here, never a label style.
- Scale: display `clamp(2.6rem, 1.2rem + 5.6vw, 6.75rem)`, tracking `-0.035em`,
  leading 0.92. Exchange titles `clamp(1.5rem, 1.1rem + 1.5vw, 2.5rem)`. Body 17 px on
  1.55. Envelopes 13 px on 1.55.

**Grid.** 12 columns, gutter `clamp(1rem, 0.6rem + 1.6vw, 2.5rem)`. Halberd's line sits
on the boundary after column 5 (42% of the width), so the lanes are unequal: the
assistant lane holds prose, the server lane holds arrivals. Every block hangs from the
line or from the outer margins.

**Shape.** Radius 0 everywhere except envelopes (2 px). No shadows.

**Motion.** One ease family: `expo.out` for stops and settles, `none` for travel.
Travel speed about 900 px/s. Stagger 40 ms. Page transition: an ink panel crosses the
viewport left to right, like a message crossing the line (0.7 s each way).

**Hover, one per role.**

- Primary actions (Send, Open the console, Build from source): the label travels
  0.35 em to the right while a 2 px wire draws in behind it from the left.
- Exchange links (corner tag, log rows): the row advances 8 px and the id takes the
  highlighter.
- Utility links (GitHub, docs): underline thickens; color stays.

**Idle.** The hero wire carries the session at rest: method names slide from the
assistant lane to the line on a loop; allowed ones pass, refused ones stop. It runs on
the GSAP ticker, pauses off screen, and is off under reduced motion.

## Structure plan

Desktop (1440):

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ASSISTANT            ▲ HALBERD (drawn head on the line)           SERVER  │ fixed lane header
│ claude-desktop       ┃ halberd-stdio                mcp-server-postgres ↗ │
├──────────────────────╂────────────────────────────────────────────────────┤
│ Every tool call      ┃                                                    │
│ meets this line      ┃   idle wire: tools/call ─────▶┃                    │
│ first.  (h1, flush   ┃                                                    │
│ right to the line)   ┃                                                    │
│ intro paragraph      ┃                                                    │
│                      ┃                                                    │
│ id 1  initialize ────╂──────────▶ {initialize}                            │
│ prose                ┃            ◀── {result} returned                   │
│ id 2  tools/list ────╂──────────▶ policy excerpt opens here               │
│ id 3  query SELECT ──╂──────────▶ {request}  (allowed)                    │
│ {result, redacted} ◀─╂──────────── {result with key}  SIGNATURE (scrub)   │
│ id 4  {DROP TABLE}━━━┫ stop       nothing arrived.                        │
│ error -32000 ◀───────┫ editable: change the SQL, send again               │
│ id 5  pg_read… ━━━━━━┫ stop                                               │
│ id 6  export_db ━━━━━┫ stop (unknown_tool)                                │
│ id 7  list_tables ───╂──────────▶  ◀── poisoned result, stripped          │
│ close: install, three commands under the three lanes                      │
│ id 4 of 7, refused (→ /log)                         Open the console →    │ fixed bottom corners
└───────────────────────────────────────────────────────────────────────────┘
```

Phone (390): the axis turns. Each exchange is a vertical stack: assistant side above,
a full-width Halberd line with the head mark at its left end, server side below.
Refused exchanges have nothing below the line except "Nothing reached the server."
The lane header becomes a top bar (mark, name, Log). The corner tag and the console
link become one bottom bar.

```
┌──────────────────────────┐
│ ▲ Halberd        Log  ↗  │
│ Every tool call          │
│ meets this line first.   │
│ ━━▲━━━━━━━━━━━━━━━━━━━━  │
│ id 4  tools/call query   │
│ ASSISTANT                │
│ {DROP TABLE envelope}    │
│ ━━▲━━━━━━ stopped ━━━━━  │
│ SERVER                   │
│ Nothing reached it.      │
│ prose                    │
│ id 4 of 7 · Console      │
└──────────────────────────┘
```

Views:

- `/` the session at rest, every exchange open, each with an `id-N` anchor.
- `/console` the same three lanes as a tool: the server label is the pack picker,
  the assistant lane is the editor, the verdict lands where Halberd puts it.
- `/log` the escape hatch: one audit record per decision, linking to `/#id-N`.
- 404: a request for the missing path crosses the line (Halberd passes unknown
  methods) and the server answers `-32601 Method not found`.

## Genericness test

- Skeleton: no navbar, hero, sections, footer. The lane header is the diagram's own
  header, the content is exchanges in protocol order, and the close is the session's
  last message.
- Hero: the h1 is flush against the Halberd line, not centered over a blob.
- Cards: replaced by envelopes, which are the actual messages.
- Labels: no eyebrows; ids and method names are real protocol fields.
- Colour: no accent except the highlighter, which only ever marks matched text.
- Changed after the test: dropped a planned verdict colour set (red, green, amber).
  Allowed traffic has no colour at all; position and the stop carry the meaning.
