import "server-only";
import { IMAGE_BUCKET } from "@/lib/captions";
import { listCritics, ownerNames, type CriticOption } from "@/lib/data/media";
import { emptyPastEnd, rangeFor, type VoteQuery } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";
import { ledgerRows, type LedgerSource, type LedgerVote } from "@/lib/votes";

// Read only: votes are cast in the app and ratings are written by the critics,
// so nothing here writes and the page has no controls that could.
// Every read throws on error, so a page never shows half-loaded rows as real.

type Voice = { name: string; emoji: string };

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

// The critic filter as an id: null for any critic, -1 for a slug that names no
// critic, which matches nothing rather than quietly showing everything
const criticIdFor = (critics: CriticOption[], slug: string | null) =>
  slug === null ? null : (critics.find((c) => c.slug === slug)?.id ?? -1);

export async function listVotes(q: VoteQuery): Promise<{ rows: LedgerVote[]; total: number; critics: CriticOption[] }> {
  const db = await adminDb();
  const critics = await listCritics(db);
  const criticId = criticIdFor(critics, q.critic);
  if (criticId === -1) return { rows: [], total: 0, critics };

  // captions!inner, so the critic filter drops votes instead of nulling the embed
  let query = db
    .from("caption_votes")
    .select(
      "caption_id, user_id, value, created_at, captions!inner(content, user_id, critic_id, critics(name, emoji), images(topic))",
      { count: "exact" },
    );
  if (q.value !== null) query = query.eq("value", q.value === "up" ? 1 : -1);
  if (criticId !== null) query = query.eq("captions.critic_id", criticId);

  const [from, to] = rangeFor(q.page);
  // The primary key last, so pages never overlap when two votes share a timestamp
  const { data, error, count } = emptyPastEnd(
    await query
      .order("created_at", { ascending: false })
      .order("caption_id")
      .order("user_id")
      .range(from, to)
      .overrideTypes<LedgerSource[], { merge: false }>(),
  );
  if (error) throw fail("Votes list", error);

  const rows = data ?? [];
  const names = await ownerNames(db, [...new Set(rows.map((r) => r.user_id))]);
  return { rows: ledgerRows(rows, names), total: count ?? 0, critics };
}

type RatingSource = {
  id: string;
  content: string;
  rating: number;
  is_public: boolean;
  created_at: string;
  upvotes: number;
  downvotes: number;
  critics: Voice | null;
  images: { image_path: string; topic: string | null };
};

export type RatingRow = {
  id: string;
  imageUrl: string;
  topic: string | null;
  critic: Voice | null;
  content: string;
  rating: number;
  isPublic: boolean;
  createdAt: string;
  upvotes: number;
  downvotes: number;
};

// Scored roasts, highest score first. Roasts the critic left unscored, and
// legacy captions (which never had a score), are not listed.
export async function listRatings(q: VoteQuery): Promise<{ rows: RatingRow[]; total: number; critics: CriticOption[] }> {
  const db = await adminDb();
  const critics = await listCritics(db);
  const criticId = criticIdFor(critics, q.critic);
  if (criticId === -1) return { rows: [], total: 0, critics };

  // images!inner, so the topic filter drops rows instead of nulling the embed
  let query = db
    .from("captions")
    .select(
      "id, content, rating, is_public, created_at, upvotes, downvotes, critics(name, emoji), images!inner(image_path, topic)",
      { count: "exact" },
    )
    .not("critic_id", "is", null)
    .not("rating", "is", null);
  if (criticId !== null) query = query.eq("critic_id", criticId);
  if (q.topic !== null) query = query.eq("images.topic", q.topic);

  const [from, to] = rangeFor(q.page);
  // id last, so pages never overlap when two roasts share a score and timestamp
  const { data, error, count } = emptyPastEnd(
    await query
      .order("rating", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .overrideTypes<RatingSource[], { merge: false }>(),
  );
  if (error) throw fail("Ratings list", error);

  const bucket = db.storage.from(IMAGE_BUCKET);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      imageUrl: bucket.getPublicUrl(r.images.image_path).data.publicUrl,
      topic: r.images.topic,
      critic: r.critics,
      content: r.content,
      rating: r.rating,
      isPublic: r.is_public,
      createdAt: r.created_at,
      upvotes: r.upvotes,
      downvotes: r.downvotes,
    })),
    total: count ?? 0,
    critics,
  };
}
