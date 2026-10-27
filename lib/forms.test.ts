import { describe, expect, it } from "vitest";
import { constraintField, isStillReferenced, lengthOk, parseId, readText, readTopicOrAll, readWhole } from "./forms";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("readText", () => {
  it("collapses whitespace and reads a missing field as empty", () => {
    expect(readText(form({ a: "  two\n\nlines  " }), "a")).toBe("two lines");
    expect(readText(form({}), "a")).toBe("");
  });
});

describe("lengthOk", () => {
  it("counts code points like char_length", () => {
    expect(lengthOk("🔥🔥", 1, 2)).toBe(true);
    expect(lengthOk("🔥🔥🔥", 1, 2)).toBe(false);
    expect(lengthOk("", 1, 2)).toBe(false);
  });
});

describe("readWhole", () => {
  it.each([
    ["0", 0],
    ["100", 100],
    ["101", null],
    ["-1", null],
    ["1.5", null],
    ["", null],
    ["1e2", null],
  ])("%j in 0..100 is %j", (raw, expected) => {
    expect(readWhole(form({ n: raw }), "n", 0, 100)).toBe(expected);
  });
});

describe("readTopicOrAll", () => {
  it("reads empty as every topic, a topic as itself and anything else as invalid", () => {
    expect(readTopicOrAll(form({ topic: "" }))).toBeNull();
    expect(readTopicOrAll(form({}))).toBeNull();
    expect(readTopicOrAll(form({ topic: "food" }))).toBe("food");
    expect(readTopicOrAll(form({ topic: "legacy" }))).toBeUndefined();
  });
});

describe("parseId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    [["7", "8"], 7],
    [3, 3],
    ["0", null],
    ["01", null],
    ["-1", null],
    ["1.0", null],
    ["99999999999999999", null],
    [undefined, null],
  ])("%j is %j", (raw, expected) => {
    expect(parseId(raw)).toBe(expected);
  });
});

describe("constraintField", () => {
  const map = { terms_term_lower_key: "term", terms_definition_len: "definition" } as const;

  it("maps a named unique or check violation to its field", () => {
    expect(
      constraintField({ code: "23505", message: 'duplicate key value violates unique constraint "terms_term_lower_key"' }, map),
    ).toBe("term");
    expect(
      constraintField({ code: "23514", message: 'new row for relation "terms" violates check constraint "terms_definition_len"' }, map),
    ).toBe("definition");
  });

  it("ignores other errors and unknown constraints", () => {
    expect(constraintField({ code: "23503", message: 'constraint "terms_term_lower_key"' }, map)).toBeNull();
    expect(constraintField({ code: "23514", message: 'violates check constraint "other"' }, map)).toBeNull();
    expect(constraintField(null, map)).toBeNull();
  });
});

describe("isStillReferenced", () => {
  it("is a foreign key violation", () => {
    expect(isStillReferenced({ code: "23503" })).toBe(true);
    expect(isStillReferenced({ code: "23505" })).toBe(false);
    expect(isStillReferenced(null)).toBe(false);
  });
});
