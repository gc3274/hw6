import "server-only";
import { selectAll } from "@/lib/data/select-all";
import { adminDb } from "@/lib/supabase/admin";
import type {
  AttemptRow,
  CaptionRow,
  CriticRow,
  Dataset,
  ImageRow,
  ProfileRow,
  VoteRow,
} from "@/lib/stats";

// Every table the overview reads, plus the names of any that hit the row cap
export type StatsDataset = Dataset & { truncated: string[] };

// Columns are listed explicitly. captions.prompt and images.context are never
// selected: a note only becomes has_note, from a read that returns ids alone.
const COLUMNS = {
  critics: "id, slug, name, emoji, topic, sort_order",
  captions:
    "id, image_id, user_id, humor_flavor_id, critic_id, content, tip, rating, model, is_public, posted_at, upvotes, downvotes, score, created_at",
  images: "id, user_id, image_path, topic, created_at",
  caption_votes: "caption_id, user_id, value, created_at",
  generation_requests: "id, user_id, image_path, created_at",
  profiles: "id, created_at",
} as const;

type ImageBase = Omit<ImageRow, "has_note">;

// One full read of everything the stats need, through the service role.
// Throws if any read fails, so the page never shows numbers from half a dataset.
export async function loadStatsDataset(): Promise<StatsDataset> {
  const db = await adminDb();

  const [critics, captions, images, notes, votes, attempts, profiles] = await Promise.all([
    selectAll<CriticRow>(() => db.from("critics").select(COLUMNS.critics), ["id"]),
    selectAll<CaptionRow>(() => db.from("captions").select(COLUMNS.captions), ["id"]),
    selectAll<ImageBase>(() => db.from("images").select(COLUMNS.images), ["id"]),
    selectAll<{ id: string }>(
      () => db.from("images").select("id").not("context", "is", null).neq("context", ""),
      ["id"],
    ),
    selectAll<VoteRow>(() => db.from("caption_votes").select(COLUMNS.caption_votes), [
      "caption_id",
      "user_id",
    ]),
    // Runs from the main app only (legacy rows included): admin runs reuse a post's
    // path, so they would count as saved, and they don't spend anyone's daily posts
    selectAll<AttemptRow>(
      () => db.from("generation_requests").select(COLUMNS.generation_requests).eq("source", "app"),
      ["id"],
    ),
    selectAll<ProfileRow>(() => db.from("profiles").select(COLUMNS.profiles), ["id"]),
  ]);

  const withNote = new Set(notes.rows.map((r) => r.id));
  const reads = { critics, captions, images, caption_votes: votes, generation_requests: attempts, profiles };

  return {
    critics: critics.rows,
    captions: captions.rows,
    images: images.rows.map((img) => ({ ...img, has_note: withNote.has(img.id) })),
    votes: votes.rows,
    attempts: attempts.rows,
    profiles: profiles.rows,
    truncated: Object.entries(reads).flatMap(([table, read]) => (read.truncated ? [table] : [])),
  };
}
