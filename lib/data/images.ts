import "server-only";
import { IMAGE_BUCKET } from "@/lib/captions";
import { ownerNames } from "@/lib/data/media";
import type { ImageQuery } from "@/lib/images";
import { rangeFor } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

// Reads for the photos pages. Writes live in app/(admin)/images/actions.ts.
// Every read throws on error, so a page never shows half-loaded rows as real.

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

type Owner = { id: string; name: string | null };

type ListRow = {
  id: string;
  user_id: string;
  image_path: string;
  topic: string | null;
  context: string | null;
  created_at: string;
  captions: { critic_id: number | null }[];
};

export type ImageRow = {
  id: string;
  imageUrl: string;
  topic: string | null;
  owner: Owner;
  // Captions written by a critic; a legacy photo's captions don't count
  roasts: number;
  // Only whether there is one: the note itself is shown on the detail page alone
  hasNote: boolean;
  createdAt: string;
};

export async function listImages(q: ImageQuery): Promise<{ rows: ImageRow[]; total: number }> {
  const db = await adminDb();

  let query = db
    .from("images")
    .select("id, user_id, image_path, topic, context, created_at, captions(critic_id)", { count: "exact" });
  if (q.topic === "legacy") query = query.is("topic", null);
  else if (q.topic !== null) query = query.eq("topic", q.topic);

  const [from, to] = rangeFor(q.page);
  // id last, so pages never overlap when two rows share a timestamp
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to)
    .overrideTypes<ListRow[], { merge: false }>();
  if (error) throw fail("Photos list", error);

  const rows = data ?? [];
  const names = await ownerNames(db, [...new Set(rows.map((r) => r.user_id))]);
  const bucket = db.storage.from(IMAGE_BUCKET);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      imageUrl: bucket.getPublicUrl(r.image_path).data.publicUrl,
      topic: r.topic,
      owner: { id: r.user_id, name: names.get(r.user_id) ?? null },
      roasts: r.captions.filter((c) => c.critic_id !== null).length,
      hasNote: !!r.context?.trim(),
      createdAt: r.created_at,
    })),
    total: count ?? 0,
  };
}

type DetailRow = {
  id: string;
  user_id: string;
  image_path: string;
  topic: string | null;
  context: string | null;
  created_at: string;
};

type CaptionRow = {
  id: string;
  critic_id: number | null;
  content: string;
  is_public: boolean;
  upvotes: number;
  downvotes: number;
  created_at: string;
  critics: { name: string; emoji: string } | null;
  humor_flavors: { name: string } | null;
};

export type ImageCaption = {
  id: string;
  // null on a legacy caption
  critic: { name: string; emoji: string } | null;
  flavor: string | null;
  content: string;
  isPublic: boolean;
  votes: number;
  createdAt: string;
};

export type ImageDetail = {
  id: string;
  imageUrl: string;
  topic: string | null;
  // The uploader's private note: it goes into the prompt and is never shown in the app
  note: string | null;
  createdAt: string;
  owner: Owner;
  // Every caption on it, roasts and legacy captions alike, oldest first
  captions: ImageCaption[];
  // Up plus down across those captions; they cascade with the photo
  votes: number;
  // Roast runs logged for it in generation_requests
  runs: number;
};

// null when no photo has this id, so the page can 404
export async function getImage(id: string): Promise<ImageDetail | null> {
  const db = await adminDb();

  const { data: row, error } = await db
    .from("images")
    .select("id, user_id, image_path, topic, context, created_at")
    .eq("id", id)
    .maybeSingle<DetailRow>();
  if (error) throw fail("Photo", error);
  if (!row) return null;

  const [captions, names, runs] = await Promise.all([
    db
      .from("captions")
      .select("id, critic_id, content, is_public, upvotes, downvotes, created_at, critics(name, emoji), humor_flavors(name)")
      .eq("image_id", row.id)
      .order("created_at")
      .order("id")
      .overrideTypes<CaptionRow[], { merge: false }>(),
    ownerNames(db, [row.user_id]),
    db.from("generation_requests").select("id", { count: "exact", head: true }).eq("image_id", row.id),
  ]);
  if (captions.error) throw fail("Captions on the photo", captions.error);
  if (runs.error) throw fail("Runs for the photo", runs.error);

  const list = (captions.data ?? []).map((c) => ({
    id: c.id,
    critic: c.critic_id === null ? null : c.critics,
    flavor: c.humor_flavors?.name ?? null,
    content: c.content,
    isPublic: c.is_public,
    votes: c.upvotes + c.downvotes,
    createdAt: c.created_at,
  }));

  return {
    id: row.id,
    imageUrl: db.storage.from(IMAGE_BUCKET).getPublicUrl(row.image_path).data.publicUrl,
    topic: row.topic,
    note: row.context?.trim() || null,
    createdAt: row.created_at,
    owner: { id: row.user_id, name: names.get(row.user_id) ?? null },
    captions: list,
    votes: list.reduce((sum, c) => sum + c.votes, 0),
    runs: runs.count ?? 0,
  };
}
