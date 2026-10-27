// Rules for the glossary (terms rows), plus the topic and priority pieces the
// example reviews share. Pure, so they run in tests; the actions in
// app/(admin)/terms/actions.ts apply them before any write. Limits match the
// terms checks in the prompt chains migration.
import { constraintField, lengthOk, readText, readTopicOrAll, readWhole, type FormState } from "@/lib/forms";
import { parsePage, searchTerm, type SearchParams } from "@/lib/params";
import { parseTopic, topicInfo, type Topic } from "@/lib/roasts";

export const TERM_MAX = 60;
export const DEFINITION_MAX = 300;
export const TERM_EXAMPLE_MAX = 200;
// terms_priority_range and generation_examples_priority_range are both 0-100
export const PRIORITY_MAX = 100;

export const TOPIC_RULE = "Pick a topic, or Every topic.";
export const PRIORITY_RULE = `Use a whole number from 0 to ${PRIORITY_MAX}.`;

// null is "every topic": the row goes into every photo's prompt
export function topicLabel(topic: string | null): string {
  if (topic === null) return "Every topic";
  return topicInfo(topic)?.label ?? topic;
}

// Empty is the column default, 0; anything else must be a whole number in range
export function readPriority(fd: FormData): number | null {
  return readText(fd, "priority") === "" ? 0 : readWhole(fd, "priority", 0, PRIORITY_MAX);
}

// The list filter: a topic, or "general" for the rows with no topic
export type TopicFilter = Topic | "general";

export function parseTopicFilter(v: unknown): TopicFilter | null {
  const raw = Array.isArray(v) ? v[0] : v;
  return raw === "general" ? "general" : parseTopic(raw);
}

export type TermQuery = { topic: TopicFilter | null; q: string | null; page: number };

export function parseTermQuery(sp: SearchParams): TermQuery {
  return { topic: parseTopicFilter(sp.topic), q: searchTerm(sp.q), page: parsePage(sp.page) };
}

export type TermField = "term" | "definition" | "example" | "topic" | "priority";
export type TermState = FormState<TermField>;
export type TermErrors = Partial<Record<TermField, string>>;

// Named after the columns, so they insert and update as they are
export type TermValues = {
  term: string;
  definition: string;
  example: string | null;
  topic: Topic | null;
  priority: number;
};

// One wording per rule, shared by the form checks and the database's checks
export const TERM_RULES: Record<TermField, string> = {
  term: `Write 1 to ${TERM_MAX} characters.`,
  definition: `Write 1 to ${DEFINITION_MAX} characters.`,
  example: `Keep the example to ${TERM_EXAMPLE_MAX} characters, or leave it empty.`,
  topic: TOPIC_RULE,
  priority: PRIORITY_RULE,
};

// terms_term_lower_key is on lower(term)
export const TERM_TAKEN = "That term already exists, maybe with different capitals.";

export function validateTerm(fd: FormData): { ok: true; values: TermValues } | { ok: false; errors: TermErrors } {
  const errors: TermErrors = {};

  const term = readText(fd, "term");
  if (!lengthOk(term, 1, TERM_MAX)) errors.term = TERM_RULES.term;

  const definition = readText(fd, "definition");
  if (!lengthOk(definition, 1, DEFINITION_MAX)) errors.definition = TERM_RULES.definition;

  const example = readText(fd, "example");
  if (example && !lengthOk(example, 1, TERM_EXAMPLE_MAX)) errors.example = TERM_RULES.example;

  const topic = readTopicOrAll(fd);
  if (topic === undefined) errors.topic = TERM_RULES.topic;

  const priority = readPriority(fd);
  if (priority === null) errors.priority = TERM_RULES.priority;

  if (topic === undefined || priority === null || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { term, definition, example: example || null, topic, priority } };
}

const TERM_CONSTRAINTS: Record<string, TermField> = {
  terms_term_lower_key: "term",
  terms_term_len: "term",
  terms_definition_len: "definition",
  terms_example_len: "example",
  terms_topic_check: "topic",
  terms_priority_range: "priority",
};

// A failed insert or update as field errors, or null when no field can fix it.
// The form checks mirror the checks, so in practice only the unique index fires.
export function termWriteErrors(error: { code?: string; message?: string } | null | undefined): TermErrors | null {
  const field = constraintField(error, TERM_CONSTRAINTS);
  if (!field) return null;
  return { [field]: error?.code === "23505" ? TERM_TAKEN : TERM_RULES[field] };
}

// The form's starting values: a saved row, or an empty form with priority 0
export type TermFormValues = Record<TermField, string>;

export function termFormValues(row?: {
  term: string;
  definition: string;
  example: string | null;
  topic: string | null;
  priority: number;
}): TermFormValues {
  return {
    term: row?.term ?? "",
    definition: row?.definition ?? "",
    example: row?.example ?? "",
    topic: parseTopic(row?.topic) ?? "",
    priority: String(row?.priority ?? 0),
  };
}
