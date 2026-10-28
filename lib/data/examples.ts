import "server-only";
import type { ExampleQuery } from "@/lib/examples";
import { emptyPastEnd, rangeFor } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

// Reads for the example review pages. Writes live in app/(admin)/examples/actions.ts.
// Every read throws on error, so a page never shows half-loaded rows as real.

type ListRow = {
  id: number;
  topic: string | null;
  roast: string;
  score: number;
  priority: number;
  updated_at: string;
};

export type ExampleRow = {
  id: number;
  // null = every topic
  topic: string | null;
  roast: string;
  score: number;
  priority: number;
  updatedAt: string;
};

type DetailRow = ListRow & {
  image_description: string;
  tip: string | null;
  explanation: string;
  created_at: string;
};

// Keeps the column names, so it feeds exampleFormValues as it is
export type ExampleDetail = {
  id: number;
  topic: string | null;
  image_description: string;
  roast: string;
  tip: string | null;
  score: number;
  explanation: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

export async function listExamples(q: ExampleQuery): Promise<{ rows: ExampleRow[]; total: number }> {
  const db = await adminDb();

  let query = db
    .from("generation_examples")
    .select("id, topic, roast, score, priority, updated_at", { count: "exact" });
  if (q.topic === "general") query = query.is("topic", null);
  else if (q.topic !== null) query = query.eq("topic", q.topic);

  const [from, to] = rangeFor(q.page);
  // The prompt's order: priority, then id
  const { data, error, count } = emptyPastEnd(
    await query
      .order("priority", { ascending: false })
      .order("id")
      .range(from, to)
      .overrideTypes<ListRow[], { merge: false }>(),
  );
  if (error) throw fail("Example reviews list", error);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      topic: r.topic,
      roast: r.roast,
      score: r.score,
      priority: r.priority,
      updatedAt: r.updated_at,
    })),
    total: count ?? 0,
  };
}

// null when no example has this id, so the page can 404
export async function getExample(id: number): Promise<ExampleDetail | null> {
  const db = await adminDb();
  const { data, error } = await db
    .from("generation_examples")
    .select("id, topic, image_description, roast, tip, score, explanation, priority, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<DetailRow>();
  if (error) throw fail("Example review", error);
  if (!data) return null;

  return {
    id: data.id,
    topic: data.topic,
    image_description: data.image_description,
    roast: data.roast,
    tip: data.tip,
    score: data.score,
    explanation: data.explanation,
    priority: data.priority,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
