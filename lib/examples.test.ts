import { describe, expect, it } from "vitest";
import {
  EXAMPLE_ROAST_MAX,
  EXAMPLE_RULES,
  EXAMPLE_TIP_MAX,
  exampleFormValues,
  exampleWriteErrors,
  EXPLANATION_MAX,
  parseExampleQuery,
  PHOTO_MAX,
  validateExample,
} from "./examples";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const exampleForm = (overrides: Record<string, string> = {}) =>
  form({
    topic: "food",
    image_description: "Instant ramen in a mixing bowl, one sad egg on top.",
    roast: "The egg is doing all the work and it knows it.",
    tip: "",
    score: "3",
    explanation: "Points at a real detail, stays playful, and the score is honest.",
    priority: "0",
    ...overrides,
  });

const errorsFor = (fd: FormData) => {
  const result = validateExample(fd);
  return result.ok ? {} : result.errors;
};

describe("limits match the generation_examples checks in the migration", () => {
  it("uses the same numbers, and the prompt's roast and tip targets", () => {
    // image_description_len, roast_len, tip_len, explanation_len
    expect([PHOTO_MAX, EXAMPLE_ROAST_MAX, EXAMPLE_TIP_MAX, EXPLANATION_MAX]).toEqual([300, 140, 90, 300]);
  });
});

describe("validateExample", () => {
  it("returns the row to save, with whitespace collapsed and an empty tip as null", () => {
    const result = validateExample(exampleForm({ roast: "  The egg is\ndoing all the work. ", topic: "" }));
    expect(result).toEqual({
      ok: true,
      values: {
        topic: null,
        image_description: "Instant ramen in a mixing bowl, one sad egg on top.",
        roast: "The egg is doing all the work.",
        tip: null,
        score: 3,
        explanation: "Points at a real detail, stays playful, and the score is honest.",
        priority: 0,
      },
    });
  });

  it.each([
    ["image_description", "", false],
    ["image_description", "p".repeat(PHOTO_MAX), true],
    ["image_description", "p".repeat(PHOTO_MAX + 1), false],
    ["roast", "", false],
    ["roast", "🍜".repeat(EXAMPLE_ROAST_MAX), true],
    ["roast", "🍜".repeat(EXAMPLE_ROAST_MAX + 1), false],
    ["tip", "", true],
    ["tip", "t".repeat(EXAMPLE_TIP_MAX), true],
    ["tip", "t".repeat(EXAMPLE_TIP_MAX + 1), false],
    ["explanation", "", false],
    ["explanation", "x".repeat(EXPLANATION_MAX), true],
    ["explanation", "x".repeat(EXPLANATION_MAX + 1), false],
  ])("%s of %j is ok: %s", (field, value, ok) => {
    const errors = errorsFor(exampleForm({ [field]: value }));
    if (ok) expect(errors).not.toHaveProperty(field);
    else expect(errors).toHaveProperty(field, EXAMPLE_RULES[field as keyof typeof EXAMPLE_RULES]);
  });

  it.each([
    ["0", 0],
    ["10", 10],
    [" 7 ", 7],
  ])("reads score %j as %i", (raw, score) => {
    const result = validateExample(exampleForm({ score: raw }));
    expect(result.ok && result.values.score).toBe(score);
  });

  it.each(["", "11", "-1", "7.5", "1e1"])("rejects score %j, since every example needs one", (raw) => {
    expect(errorsFor(exampleForm({ score: raw }))).toHaveProperty("score");
  });

  it.each([
    ["", 0],
    ["100", 100],
  ])("reads priority %j as %i", (raw, priority) => {
    const result = validateExample(exampleForm({ priority: raw }));
    expect(result.ok && result.values.priority).toBe(priority);
  });

  it.each(["101", "-3", "abc"])("rejects priority %j", (raw) => {
    expect(errorsFor(exampleForm({ priority: raw }))).toHaveProperty("priority");
  });

  it.each(["legacy", "general"])("rejects topic %j", (raw) => {
    expect(errorsFor(exampleForm({ topic: raw }))).toHaveProperty("topic");
  });
});

describe("exampleWriteErrors", () => {
  it.each([
    ["generation_examples_topic_check", "topic"],
    ["generation_examples_image_description_len", "image_description"],
    ["generation_examples_roast_len", "roast"],
    ["generation_examples_tip_len", "tip"],
    ["generation_examples_score_range", "score"],
    ["generation_examples_explanation_len", "explanation"],
    ["generation_examples_priority_range", "priority"],
  ] as const)("maps check %s to %s", (constraint, field) => {
    const error = { code: "23514", message: `violates check constraint "${constraint}"` };
    expect(exampleWriteErrors(error)).toEqual({ [field]: EXAMPLE_RULES[field] });
  });

  it("leaves other errors to the generic message", () => {
    expect(exampleWriteErrors({ code: "57014", message: "canceling statement" })).toBeNull();
    expect(exampleWriteErrors(undefined)).toBeNull();
  });
});

describe("parseExampleQuery", () => {
  it.each([
    [{}, { topic: null, page: 1 }],
    [{ topic: "general", page: "2" }, { topic: "general", page: 2 }],
    [{ topic: "fit" }, { topic: "fit", page: 1 }],
    [{ topic: "legacy", page: "x" }, { topic: null, page: 1 }],
  ])("reads %j", (sp, query) => {
    expect(parseExampleQuery(sp)).toEqual(query);
  });
});

describe("exampleFormValues", () => {
  it("starts empty, with no score picked and priority 0", () => {
    expect(exampleFormValues()).toEqual({
      topic: "",
      image_description: "",
      roast: "",
      tip: "",
      score: "",
      explanation: "",
      priority: "0",
    });
  });

  it("turns a saved row into field strings", () => {
    const values = exampleFormValues({
      topic: null,
      image_description: "A bed made with one pillow.",
      roast: "Minimalism or surrender?",
      tip: null,
      score: 0,
      explanation: "Short and specific.",
      priority: 5,
    });
    expect(values).toMatchObject({ topic: "", tip: "", score: "0", priority: "5" });
  });
});
