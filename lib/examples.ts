// Rules for example reviews (generation_examples rows). Pure, so they run in
// tests; the actions in app/(admin)/examples/actions.ts apply them before any
// write. Limits match the generation_examples checks in the prompt chains
// migration: the roast and tip are held to the same targets the prompt asks
// the critics for.
import { constraintField, lengthOk, readText, readTopicOrAll, readWhole, type FormState } from "@/lib/forms";
import { parsePage, type SearchParams } from "@/lib/params";
import { parseTopic, RATING_MAX, ROAST_TARGET, TIP_TARGET, type Topic } from "@/lib/roasts";
import { parseTopicFilter, PRIORITY_RULE, readPriority, TOPIC_RULE, type TopicFilter } from "@/lib/terms";

export const PHOTO_MAX = 300;
export const EXAMPLE_ROAST_MAX = ROAST_TARGET;
export const EXAMPLE_TIP_MAX = TIP_TARGET;
export const EXPLANATION_MAX = 300;

export type ExampleQuery = { topic: TopicFilter | null; page: number };

export function parseExampleQuery(sp: SearchParams): ExampleQuery {
  return { topic: parseTopicFilter(sp.topic), page: parsePage(sp.page) };
}

export type ExampleField = "topic" | "image_description" | "roast" | "tip" | "score" | "explanation" | "priority";
export type ExampleState = FormState<ExampleField>;
export type ExampleErrors = Partial<Record<ExampleField, string>>;

// Named after the columns, so they insert and update as they are
export type ExampleValues = {
  topic: Topic | null;
  image_description: string;
  roast: string;
  tip: string | null;
  score: number;
  explanation: string;
  priority: number;
};

export const EXAMPLE_RULES: Record<ExampleField, string> = {
  topic: TOPIC_RULE,
  image_description: `Describe the photo in 1 to ${PHOTO_MAX} characters.`,
  roast: `Write 1 to ${EXAMPLE_ROAST_MAX} characters, the length the critics are asked for.`,
  tip: `Keep the tip to ${EXAMPLE_TIP_MAX} characters, or leave it empty.`,
  score: `Use a whole number from 0 to ${RATING_MAX}.`,
  explanation: `Write 1 to ${EXPLANATION_MAX} characters.`,
  priority: PRIORITY_RULE,
};

export function validateExample(
  fd: FormData,
): { ok: true; values: ExampleValues } | { ok: false; errors: ExampleErrors } {
  const errors: ExampleErrors = {};

  const topic = readTopicOrAll(fd);
  if (topic === undefined) errors.topic = EXAMPLE_RULES.topic;

  const imageDescription = readText(fd, "image_description");
  if (!lengthOk(imageDescription, 1, PHOTO_MAX)) errors.image_description = EXAMPLE_RULES.image_description;

  const roast = readText(fd, "roast");
  if (!lengthOk(roast, 1, EXAMPLE_ROAST_MAX)) errors.roast = EXAMPLE_RULES.roast;

  const tip = readText(fd, "tip");
  if (tip && !lengthOk(tip, 1, EXAMPLE_TIP_MAX)) errors.tip = EXAMPLE_RULES.tip;

  // Required: every example shows how harsh to score
  const score = readWhole(fd, "score", 0, RATING_MAX);
  if (score === null) errors.score = EXAMPLE_RULES.score;

  const explanation = readText(fd, "explanation");
  if (!lengthOk(explanation, 1, EXPLANATION_MAX)) errors.explanation = EXAMPLE_RULES.explanation;

  const priority = readPriority(fd);
  if (priority === null) errors.priority = EXAMPLE_RULES.priority;

  if (topic === undefined || score === null || priority === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    values: { topic, image_description: imageDescription, roast, tip: tip || null, score, explanation, priority },
  };
}

const EXAMPLE_CONSTRAINTS: Record<string, ExampleField> = {
  generation_examples_topic_check: "topic",
  generation_examples_image_description_len: "image_description",
  generation_examples_roast_len: "roast",
  generation_examples_tip_len: "tip",
  generation_examples_score_range: "score",
  generation_examples_explanation_len: "explanation",
  generation_examples_priority_range: "priority",
};

// A failed insert or update as field errors, or null when no field can fix it.
// The table has no unique keys, and the form checks mirror its checks, so this
// is a backstop if they drift.
export function exampleWriteErrors(error: { code?: string; message?: string } | null | undefined): ExampleErrors | null {
  const field = constraintField(error, EXAMPLE_CONSTRAINTS);
  return field ? { [field]: EXAMPLE_RULES[field] } : null;
}

export type ExampleFormValues = Record<ExampleField, string>;

// The form's starting values: a saved row, or an empty form with priority 0
export function exampleFormValues(row?: {
  topic: string | null;
  image_description: string;
  roast: string;
  tip: string | null;
  score: number;
  explanation: string;
  priority: number;
}): ExampleFormValues {
  return {
    topic: parseTopic(row?.topic) ?? "",
    image_description: row?.image_description ?? "",
    roast: row?.roast ?? "",
    tip: row?.tip ?? "",
    score: row ? String(row.score) : "",
    explanation: row?.explanation ?? "",
    priority: String(row?.priority ?? 0),
  };
}
