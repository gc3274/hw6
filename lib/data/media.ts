import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET } from "@/lib/captions";
import { rangeFor, type MediaQuery } from "@/lib/params";
import { parseTopic, type Topic } from "@/lib/roasts";
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

// Also used by lib/data/votes.ts for its critic filter
export async function listCritics(db: SupabaseClient): Promise<CriticOption[]> {
  const { data, error } = await db
    .from("critics")
    .select("id, slug, name, emoji, topic")
    .order("sort_order")
    .overrideTypes<CriticOption[], { merge: false }>();
  if (error) throw fail("Critics", error);
  return data ?? [];
}

// Owner names for a page of rows. profiles can't be embedded from captions
// (captions.user_id points at auth.users), so this is a second read. Also used
// by lib/data/votes.ts for voter names, which have the same problem.
export async function ownerNames(db: SupabaseClient, ids: string[]) {
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

// The create flow (/media/new). context is left out on purpose: the uploader's
// note is shown only on a roast's detail page, and createRoast reads it itself.

type PostRow = {
  id: string;
  user_id: string;
  image_path: string;
  topic: string | null;
  created_at: string;
  captions: { critic_id: number | null; is_public: boolean }[];
};

export type RoastPost = {
  id: string;
  imageUrl: string;
  topic: string | null;
  createdAt: string;
  roasts: number;
  publicRoasts: number;
  owner: { id: string; name: string | null };
};

// Roast posts only (a topic set), newest first, for the "pick a post" step
export async function listRoastPosts(page: number): Promise<{ rows: RoastPost[]; total: number }> {
  const db = await adminDb();
  const [from, to] = rangeFor(page);
  const { data, error, count } = await db
    .from("images")
    .select("id, user_id, image_path, topic, created_at, captions(critic_id, is_public)", { count: "exact" })
    .not("topic", "is", null)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to)
    .overrideTypes<PostRow[], { merge: false }>();
  if (error) throw fail("Roast posts", error);

  const rows = data ?? [];
  const names = await ownerNames(db, [...new Set(rows.map((r) => r.user_id))]);
  const bucket = db.storage.from(IMAGE_BUCKET);

  return {
    rows: rows.map((r) => {
      const roasts = r.captions.filter((c) => c.critic_id !== null);
      return {
        id: r.id,
        imageUrl: bucket.getPublicUrl(r.image_path).data.publicUrl,
        topic: r.topic,
        createdAt: r.created_at,
        roasts: roasts.length,
        publicRoasts: roasts.filter((c) => c.is_public).length,
        owner: { id: r.user_id, name: names.get(r.user_id) ?? null },
      };
    }),
    total: count ?? 0,
  };
}

export type PanelCritic = CriticOption & { description: string };

type PanelRoastRow = {
  id: string;
  critic_id: number;
  content: string;
  rating: number | null;
  is_public: boolean;
  critics: Voice | null;
};

export type PanelRoast = {
  id: string;
  criticId: number;
  critic: Voice | null;
  content: string;
  rating: number | null;
  isPublic: boolean;
};

export type PostForCreate = {
  id: string;
  imageUrl: string;
  // null on a legacy caption post, which can't get roasts
  topic: Topic | null;
  createdAt: string;
  owner: { id: string; name: string | null };
  // Its roasts so far, oldest first
  roasts: PanelRoast[];
  // The critics who may roast it, in panel order; empty on a legacy post
  panel: PanelCritic[];
};

// null when no post has this id, so the page can 404
export async function getPostForCreate(imageId: string): Promise<PostForCreate | null> {
  const db = await adminDb();

  const { data: image, error } = await db
    .from("images")
    .select("id, user_id, image_path, topic, created_at")
    .eq("id", imageId)
    .maybeSingle<{ id: string; user_id: string; image_path: string; topic: string | null; created_at: string }>();
  if (error) throw fail("Post", error);
  if (!image) return null;

  // parseTopic first, so only a known slug reaches the or() filter
  const topic = parseTopic(image.topic);

  const [roasts, panel, names] = await Promise.all([
    db
      .from("captions")
      .select("id, critic_id, content, rating, is_public, critics(name, emoji)")
      .eq("image_id", image.id)
      .not("critic_id", "is", null)
      .order("created_at")
      .order("id")
      .overrideTypes<PanelRoastRow[], { merge: false }>(),
    topic === null
      ? Promise.resolve({ data: [] as PanelCritic[], error: null })
      : db
          .from("critics")
          .select("id, slug, name, emoji, topic, description")
          .or(`topic.is.null,topic.eq.${topic}`)
          .order("sort_order")
          .overrideTypes<PanelCritic[], { merge: false }>(),
    ownerNames(db, [image.user_id]),
  ]);
  if (roasts.error) throw fail("Roasts on the post", roasts.error);
  if (panel.error) throw fail("Critic panel", panel.error);

  return {
    id: image.id,
    imageUrl: db.storage.from(IMAGE_BUCKET).getPublicUrl(image.image_path).data.publicUrl,
    topic,
    createdAt: image.created_at,
    owner: { id: image.user_id, name: names.get(image.user_id) ?? null },
    roasts: (roasts.data ?? []).map((r) => ({
      id: r.id,
      criticId: r.critic_id,
      critic: r.critics,
      content: r.content,
      rating: r.rating,
      isPublic: r.is_public,
    })),
    panel: panel.data ?? [],
  };
}
