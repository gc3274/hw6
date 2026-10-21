import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET } from "@/lib/captions";
import { rangeFor, type MediaQuery } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";
import { fullName } from "@/lib/users";

// Reads for the roasts pages. Writes live in app/(admin)/media/actions.ts.
// Every read throws on error, so a page never shows half-loaded rows as real.

export type CriticOption = { id: number; slug: string; name: string; emoji: string; topic: string | null };

type Voice = { name: string; emoji: string };

type ListRow = {
  id: string;
  image_id: string;
  user_id: string;
  critic_id: number | null;
  content: string;
  rating: number | null;
  is_public: boolean;
  posted_at: string | null;
  created_at: string;
  upvotes: number;
  downvotes: number;
  critics: Voice | null;
  humor_flavors: { name: string } | null;
  images: { id: string; image_path: string; topic: string | null };
};

export type MediaRow = {
  id: string;
  imageId: string;
  imageUrl: string;
  topic: string | null;
  // null on a legacy caption
  critic: Voice | null;
  // The humor flavor a legacy caption was written in
  flavor: string | null;
  content: string;
  rating: number | null;
  isPublic: boolean;
  postedAt: string | null;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  owner: { id: string; name: string | null };
};

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

async function listCritics(db: SupabaseClient): Promise<CriticOption[]> {
  const { data, error } = await db
    .from("critics")
    .select("id, slug, name, emoji, topic")
    .order("sort_order")
    .overrideTypes<CriticOption[], { merge: false }>();
  if (error) throw fail("Critics", error);
  return data ?? [];
}

// Owner names for a page of rows. profiles can't be embedded from captions
// (captions.user_id points at auth.users), so this is a second read.
async function ownerNames(db: SupabaseClient, ids: string[]) {
  const names = new Map<string, string | null>();
  if (ids.length === 0) return names;
  const { data, error } = await db
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids)
    .overrideTypes<{ id: string; first_name: string | null; last_name: string | null }[], { merge: false }>();
  if (error) throw fail("Owners", error);
  for (const p of data ?? []) names.set(p.id, fullName(p.first_name, p.last_name));
  return names;
}

export async function listMedia(q: MediaQuery): Promise<{ rows: MediaRow[]; total: number; critics: CriticOption[] }> {
  const db = await adminDb();
  const critics = await listCritics(db);

  // A slug that names no critic matches nothing, rather than quietly showing everything
  const criticId = q.critic === null ? null : (critics.find((c) => c.slug === q.critic)?.id ?? -1);
  if (criticId === -1) return { rows: [], total: 0, critics };

  // images!inner, so the topic filters below drop rows instead of nulling the embed
  let query = db
    .from("captions")
    .select(
      "id, image_id, user_id, critic_id, content, rating, is_public, posted_at, created_at, upvotes, downvotes, critics(name, emoji), humor_flavors(name), images!inner(id, image_path, topic)",
      { count: "exact" },
    );
  // captions_one_voice: no critic means a humor flavor, so a legacy caption
  if (q.kind === "roast") query = query.not("critic_id", "is", null);
  if (q.kind === "legacy") query = query.is("critic_id", null);
  if (criticId !== null) query = query.eq("critic_id", criticId);
  if (q.topic === "legacy") query = query.is("images.topic", null);
  else if (q.topic !== null) query = query.eq("images.topic", q.topic);
  if (q.visibility !== null) query = query.eq("is_public", q.visibility === "public");
  if (q.owner !== null) query = query.eq("user_id", q.owner);
  if (q.image !== null) query = query.eq("image_id", q.image);

  const [from, to] = rangeFor(q.page);
  // id last, so pages never overlap when two rows share a timestamp
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to)
    .overrideTypes<ListRow[], { merge: false }>();
  if (error) throw fail("Roasts list", error);

  const rows = data ?? [];
  const names = await ownerNames(db, [...new Set(rows.map((r) => r.user_id))]);
  const bucket = db.storage.from(IMAGE_BUCKET);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      imageId: r.image_id,
      imageUrl: bucket.getPublicUrl(r.images.image_path).data.publicUrl,
      topic: r.images.topic,
      critic: r.critic_id === null ? null : r.critics,
      flavor: r.humor_flavors?.name ?? null,
      content: r.content,
      rating: r.rating,
      isPublic: r.is_public,
      postedAt: r.posted_at,
      createdAt: r.created_at,
      upvotes: r.upvotes,
      downvotes: r.downvotes,
      owner: { id: r.user_id, name: names.get(r.user_id) ?? null },
    })),
    total: count ?? 0,
    critics,
  };
}

type DetailRow = {
  id: string;
  image_id: string;
  user_id: string;
  critic_id: number | null;
  humor_flavor_id: number | null;
  content: string;
  tip: string | null;
  rating: number | null;
  prompt: string;
  model: string;
  is_public: boolean;
  posted_at: string | null;
  created_at: string;
  upvotes: number;
  downvotes: number;
  critics: CriticOption | null;
  humor_flavors: { name: string } | null;
  images: {
    id: string;
    image_path: string;
    topic: string | null;
    context: string | null;
    created_at: string;
  } | null;
};

type SiblingRow = {
  id: string;
  critic_id: number | null;
  content: string;
  rating: number | null;
  is_public: boolean;
  critics: Voice | null;
  humor_flavors: { name: string } | null;
};

export type MediaSibling = {
  id: string;
  critic: Voice | null;
  flavor: string | null;
  content: string;
  rating: number | null;
  isPublic: boolean;
};

export type MediaDetail = {
  id: string;
  criticId: number | null;
  humorFlavorId: number | null;
  critic: CriticOption | null;
  flavor: string | null;
  content: string;
  tip: string | null;
  rating: number | null;
  isPublic: boolean;
  postedAt: string | null;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  model: string;
  // Service-only columns, shown only on the detail page and labelled private:
  // the prompt sent to Gemini and the note the uploader typed for the critics
  prompt: string;
  uploaderNote: string | null;
  image: { id: string; url: string; topic: string | null; createdAt: string };
  owner: { id: string; name: string | null };
  // The other roasts (or captions) on the same post, oldest first
  siblings: MediaSibling[];
};

// null when no caption has this id, so the page can 404
export async function getMedia(id: string): Promise<MediaDetail | null> {
  const db = await adminDb();

  const { data: row, error } = await db
    .from("captions")
    .select(
      "id, image_id, user_id, critic_id, humor_flavor_id, content, tip, rating, prompt, model, is_public, posted_at, created_at, upvotes, downvotes, critics(id, slug, name, emoji, topic), humor_flavors(name), images(id, image_path, topic, context, created_at)",
    )
    .eq("id", id)
    .maybeSingle<DetailRow>();
  if (error) throw fail("Roast", error);
  if (!row) return null;
  // images.id is not null and the foreign key cascades, so this can't happen
  if (!row.images) throw new Error(`Roast ${row.id} has no post`);

  const [siblings, names] = await Promise.all([
    db
      .from("captions")
      .select("id, critic_id, content, rating, is_public, critics(name, emoji), humor_flavors(name)")
      .eq("image_id", row.image_id)
      .neq("id", row.id)
      .order("created_at")
      .order("id")
      .overrideTypes<SiblingRow[], { merge: false }>(),
    ownerNames(db, [row.user_id]),
  ]);
  if (siblings.error) throw fail("Other roasts on the post", siblings.error);

  const note = row.images.context?.trim();

  return {
    id: row.id,
    criticId: row.critic_id,
    humorFlavorId: row.humor_flavor_id,
    critic: row.critic_id === null ? null : row.critics,
    flavor: row.humor_flavors?.name ?? null,
    content: row.content,
    tip: row.tip,
    rating: row.rating,
    isPublic: row.is_public,
    postedAt: row.posted_at,
    createdAt: row.created_at,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    model: row.model,
    prompt: row.prompt,
    uploaderNote: note || null,
    image: {
      id: row.images.id,
      url: db.storage.from(IMAGE_BUCKET).getPublicUrl(row.images.image_path).data.publicUrl,
      topic: row.images.topic,
      createdAt: row.images.created_at,
    },
    owner: { id: row.user_id, name: names.get(row.user_id) ?? null },
    siblings: (siblings.data ?? []).map((s) => ({
      id: s.id,
      critic: s.critic_id === null ? null : s.critics,
      flavor: s.humor_flavors?.name ?? null,
      content: s.content,
      rating: s.rating,
      isPublic: s.is_public,
    })),
  };
}
