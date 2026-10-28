import "server-only";
import { emptyPastEnd, ilikeAny, rangeFor } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";
import type { TermQuery } from "@/lib/terms";

// Reads for the terms pages. Writes live in app/(admin)/terms/actions.ts.
// Every read throws on error, so a page never shows half-loaded rows as real.

type ListRow = {
  id: number;
  term: string;
  definition: string;
  topic: string | null;
  priority: number;
  updated_at: string;
};

export type TermRow = {
  id: number;
  term: string;
  definition: string;
  // null = every topic
  topic: string | null;
  priority: number;
  updatedAt: string;
};

export type TermDetail = TermRow & { example: string | null; createdAt: string };

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

export async function listTerms(q: TermQuery): Promise<{ rows: TermRow[]; total: number }> {
  const db = await adminDb();

  let query = db
    .from("terms")
    .select("id, term, definition, topic, priority, updated_at", { count: "exact" });
  if (q.topic === "general") query = query.is("topic", null);
  else if (q.topic !== null) query = query.eq("topic", q.topic);
  // q went through searchTerm(), so it can't break out of the quoted or() values
  if (q.q) query = query.or(ilikeAny(["term", "definition"], q.q));

  const [from, to] = rangeFor(q.page);
  // The prompt's order (priority, then term), with id last so pages never overlap
  const { data, error, count } = emptyPastEnd(
    await query
      .order("priority", { ascending: false })
      .order("term")
      .order("id")
      .range(from, to)
      .overrideTypes<ListRow[], { merge: false }>(),
  );
  if (error) throw fail("Terms list", error);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      term: r.term,
      definition: r.definition,
      topic: r.topic,
      priority: r.priority,
      updatedAt: r.updated_at,
    })),
    total: count ?? 0,
  };
}

// null when no term has this id, so the page can 404
export async function getTerm(id: number): Promise<TermDetail | null> {
  const db = await adminDb();
  const { data, error } = await db
    .from("terms")
    .select("id, term, definition, example, topic, priority, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<ListRow & { example: string | null; created_at: string }>();
  if (error) throw fail("Term", error);
  if (!data) return null;

  return {
    id: data.id,
    term: data.term,
    definition: data.definition,
    example: data.example,
    topic: data.topic,
    priority: data.priority,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
