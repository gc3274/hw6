import { describe, expect, it } from "vitest";
import {
  DEFINITION_MAX,
  parseTermQuery,
  parseTopicFilter,
  PRIORITY_MAX,
  TERM_EXAMPLE_MAX,
  TERM_MAX,
  TERM_RULES,
  TERM_TAKEN,
  termFormValues,
  termWriteErrors,
  topicLabel,
  validateTerm,
} from "./terms";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const termForm = (overrides: Record<string, string> = {}) =>
  form({ term: "Mise en place", definition: "Everything prepped before the heat goes on.", example: "", topic: "", priority: "0", ...overrides });

const errorsFor = (fd: FormData) => {
  const result = validateTerm(fd);
  return result.ok ? {} : result.errors;
};

describe("limits match the terms checks in the migration", () => {
  it("uses the same numbers", () => {
    // terms_term_len, terms_definition_len, terms_example_len, terms_priority_range
    expect([TERM_MAX, DEFINITION_MAX, TERM_EXAMPLE_MAX, PRIORITY_MAX]).toEqual([60, 300, 200, 100]);
  });
});

describe("validateTerm", () => {
  it("returns the row to save, with whitespace collapsed and an empty example as null", () => {
    const result = validateTerm(termForm({ term: "  Mise   en place ", priority: "7", topic: "food" }));
    expect(result).toEqual({
      ok: true,
      values: {
        term: "Mise en place",
        definition: "Everything prepped before the heat goes on.",
        example: null,
        topic: "food",
        priority: 7,
      },
    });
  });

  it.each([
    ["term", "", false],
    ["term", "   ", false],
    ["term", "a", true],
    ["term", "🔥".repeat(TERM_MAX), true],
    ["term", "🔥".repeat(TERM_MAX + 1), false],
    ["definition", "", false],
    ["definition", "d".repeat(DEFINITION_MAX), true],
    ["definition", "d".repeat(DEFINITION_MAX + 1), false],
    ["example", "", true],
    ["example", "e".repeat(TERM_EXAMPLE_MAX), true],
    ["example", "e".repeat(TERM_EXAMPLE_MAX + 1), false],
  ])("%s of %j is ok: %s", (field, value, ok) => {
    const errors = errorsFor(termForm({ [field]: value }));
    if (ok) expect(errors).not.toHaveProperty(field);
    else expect(errors).toHaveProperty(field, TERM_RULES[field as keyof typeof TERM_RULES]);
  });

  it.each([
    ["", null],
    ["food", "food"],
    ["anything", "anything"],
  ])("reads topic %j as %j", (raw, topic) => {
    const result = validateTerm(termForm({ topic: raw }));
    expect(result.ok && result.values.topic).toBe(topic);
  });

  it.each(["legacy", "general", "Food"])("rejects topic %j", (raw) => {
    expect(errorsFor(termForm({ topic: raw }))).toHaveProperty("topic");
  });

  it.each([
    ["", 0],
    ["0", 0],
    [" 42 ", 42],
    ["100", 100],
  ])("reads priority %j as %i", (raw, priority) => {
    const result = validateTerm(termForm({ priority: raw }));
    expect(result.ok && result.values.priority).toBe(priority);
  });

  it.each(["101", "-1", "1.5", "1e2", "abc"])("rejects priority %j", (raw) => {
    expect(errorsFor(termForm({ priority: raw }))).toHaveProperty("priority");
  });

  it("treats missing fields as empty", () => {
    expect(Object.keys(errorsFor(new FormData())).sort()).toEqual(["definition", "term"]);
  });
});

describe("termWriteErrors", () => {
  it("names a duplicate as taken, whatever the capitals", () => {
    const error = { code: "23505", message: 'duplicate key value violates unique constraint "terms_term_lower_key"' };
    expect(termWriteErrors(error)).toEqual({ term: TERM_TAKEN });
  });

  it.each([
    ["terms_term_len", "term"],
    ["terms_definition_len", "definition"],
    ["terms_example_len", "example"],
    ["terms_topic_check", "topic"],
    ["terms_priority_range", "priority"],
  ] as const)("maps check %s to %s", (constraint, field) => {
    const error = { code: "23514", message: `new row for relation "terms" violates check constraint "${constraint}"` };
    expect(termWriteErrors(error)).toEqual({ [field]: TERM_RULES[field] });
  });

  it("leaves other errors to the generic message", () => {
    expect(termWriteErrors({ code: "08006", message: "connection failure" })).toBeNull();
    expect(termWriteErrors({ code: "23514", message: 'violates check constraint "other"' })).toBeNull();
    expect(termWriteErrors(null)).toBeNull();
  });
});

describe("parseTermQuery", () => {
  it("defaults to every term on page 1", () => {
    expect(parseTermQuery({})).toEqual({ topic: null, q: null, page: 1 });
  });

  it.each([
    ["food", "food"],
    ["general", "general"],
    [["art", "food"], "art"],
    ["legacy", null],
    ["FOOD", null],
    ["", null],
  ])("reads topic %j as %j", (raw, topic) => {
    expect(parseTopicFilter(raw)).toBe(topic);
    expect(parseTermQuery({ topic: raw }).topic).toBe(topic);
  });

  it("cleans the search and reads the page", () => {
    expect(parseTermQuery({ q: "  al%_dente ", page: "3" })).toEqual({ topic: null, q: "aldente", page: 3 });
  });
});

describe("topicLabel", () => {
  it.each([
    [null, "Every topic"],
    ["food", "Food"],
    ["anything", "Anything"],
  ])("labels %j as %j", (topic, label) => {
    expect(topicLabel(topic)).toBe(label);
  });
});

describe("termFormValues", () => {
  it("starts empty with priority 0 and every topic", () => {
    expect(termFormValues()).toEqual({ term: "", definition: "", example: "", topic: "", priority: "0" });
  });

  it("turns a saved row into field strings", () => {
    expect(termFormValues({ term: "Al dente", definition: "Firm to the bite.", example: null, topic: "food", priority: 12 })).toEqual({
      term: "Al dente",
      definition: "Firm to the bite.",
      example: "",
      topic: "food",
      priority: "12",
    });
  });
});
