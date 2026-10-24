// Formatting for JSON-RPC envelopes on screen. pretty() keeps the JSON valid
// but spells out invisible characters (zero-width spaces, joiners, BOMs) as
// \uXXXX escapes, because an envelope that hides them would hide the attack.
// segments() splits that text so a matched pattern or a redacted secret can
// be marked without touching the characters around it.

const INVISIBLE = /[​-‏⁠﻿]/g;

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    INVISIBLE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Parse and re-indent JSON text; return it untouched when it is not JSON. */
export function reindent(source: string): string {
  try {
    return pretty(JSON.parse(source));
  } catch {
    return source;
  }
}

export type Segment = { text: string; hit: boolean };

/** Split `source` around every occurrence of each needle. Overlaps keep the earlier hit. */
export function segments(source: string, needles: readonly string[] = []): Segment[] {
  const hits: [number, number][] = [];
  for (const needle of needles) {
    if (!needle) continue;
    for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, i + needle.length)) {
      hits.push([i, i + needle.length]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);

  const out: Segment[] = [];
  let at = 0;
  for (const [start, end] of hits) {
    if (start < at) continue;
    if (start > at) out.push({ text: source.slice(at, start), hit: false });
    out.push({ text: source.slice(start, end), hit: true });
    at = end;
  }
  if (at < source.length) out.push({ text: source.slice(at), hit: false });
  return out;
}

/** The text a deny_pattern matched, from an engine detail like `matched "re" at offset 0: "DROP TABLE"`. */
export function matchedText(detail: string): string | null {
  const m = /at offset \d+: "(.*)"$/.exec(detail);
  return m ? m[1] : null;
}
