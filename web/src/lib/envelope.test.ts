import { describe, expect, it } from "vitest";
import { matchedText, pretty, reindent, segments } from "./envelope";

describe("pretty", () => {
  it("indents JSON and spells out invisible characters", () => {
    expect(pretty({ a: "x​y" })).toBe('{\n  "a": "x\\u200by"\n}');
  });
});

describe("reindent", () => {
  it("re-indents JSON text", () => {
    expect(reindent('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
  it("leaves text that is not JSON alone", () => {
    expect(reindent("not json")).toBe("not json");
  });
});

describe("segments", () => {
  it("returns the whole text when there is nothing to find", () => {
    expect(segments("abc")).toEqual([{ text: "abc", hit: false }]);
    expect(segments("abc", [""])).toEqual([{ text: "abc", hit: false }]);
  });
  it("splits around every occurrence", () => {
    expect(segments("a DROP b DROP", ["DROP"])).toEqual([
      { text: "a ", hit: false },
      { text: "DROP", hit: true },
      { text: " b ", hit: false },
      { text: "DROP", hit: true },
    ]);
  });
  it("keeps the earlier hit when two overlap", () => {
    expect(segments("abcd", ["abc", "bcd"])).toEqual([
      { text: "abc", hit: true },
      { text: "d", hit: false },
    ]);
  });
});

describe("matchedText", () => {
  it("reads the matched text from an engine detail", () => {
    expect(matchedText('matched "(?i)x" at offset 0: "DROP TABLE"')).toBe("DROP TABLE");
  });
  it("returns null for details without a match", () => {
    expect(matchedText("argument length 9000 exceeds max 8192")).toBeNull();
  });
});
