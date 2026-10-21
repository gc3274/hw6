"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/captions";
import { requireSuperadmin } from "@/lib/dal";
import {
  canPublish,
  checkViolationField,
  FIELD_RULES,
  PUBLISH_REFUSED,
  validateRoastEdit,
  voiceOf,
  type EditState,
} from "@/lib/media";
import { hrefWith } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

const GONE: EditState = { ok: false, message: "This roast no longer exists. Go back to the list." };
const DB_DOWN: EditState = { ok: false, message: "Couldn’t save: the database didn’t answer. Try again." };
const FIX_FIELDS = "Fix the fields marked below.";

// Content, tip, rating and visibility only. critic_id and humor_flavor_id are never
// in the patch, so a roast can't change voice and captions_one_voice always holds.
export async function updateRoast(_prev: EditState, fd: FormData): Promise<EditState> {
  await requireSuperadmin();

  const id = fd.get("id");
  if (!isUuid(id)) return GONE;

  const db = await adminDb();
  const { data: row, error: readError } = await db
    .from("captions")
    .select("id, critic_id, humor_flavor_id, is_public, posted_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      critic_id: number | null;
      humor_flavor_id: number | null;
      is_public: boolean;
      posted_at: string | null;
    }>();
  if (readError) {
    console.error("Reading the roast before saving failed", readError);
    return DB_DOWN;
  }
  if (!row) return GONE;

  const voice = voiceOf(row);
  if (voice === "invalid") {
    return { ok: false, message: "This row has no single critic or humor flavor, so it can’t be edited here." };
  }

  const result = validateRoastEdit(fd, { legacy: voice === "legacy" });
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  // Publishing makes the photo public too, so only what the owner once posted
  if (!canPublish({ isPublic: row.is_public, postedAt: row.posted_at }, result.patch.is_public)) {
    return { ok: false, message: FIX_FIELDS, errors: { is_public: PUBLISH_REFUSED } };
  }

  // An update, never an insert: the captions_set_posted_at trigger stamps posted_at
  // on the first publish and keeps it when the roast is hidden again
  const { data: saved, error } = await db
    .from("captions")
    .update(result.patch)
    .eq("id", row.id)
    .select("id");
  if (error) {
    // The form checks mirror the captions checks, so this is a backstop if they drift
    const field = error.code === "23514" ? checkViolationField(error.message) : null;
    if (field) return { ok: false, message: FIX_FIELDS, errors: { [field]: FIELD_RULES[field] } };
    console.error("Saving the roast failed", error);
    return DB_DOWN;
  }
  if (!saved || saved.length === 0) return GONE;

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// Its votes go with it (caption_votes cascades). The post and its photo stay,
// so a post left with no roasts is hidden from the app, and the list says so.
export async function deleteRoast(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = fd.get("id");
  if (!isUuid(id)) redirect(hrefWith("/media", {}, { error: "gone" }));

  const db = await adminDb();
  const { data, error } = await db
    .from("captions")
    .delete()
    .eq("id", id)
    .select("id, image_id, critic_id")
    .overrideTypes<{ id: string; image_id: string; critic_id: number | null }[], { merge: false }>();
  if (error) {
    console.error("Deleting the roast failed", error);
    redirect(hrefWith(`/media/${id.toLowerCase()}`, {}, { error: "delete" }));
  }
  const deleted = data?.[0];
  if (!deleted) redirect(hrefWith("/media", {}, { error: "gone" }));

  // Only a roast can leave a roast post empty; legacy posts are never shown anyway
  let emptyPost: string | null = null;
  if (deleted.critic_id !== null) {
    const { count, error: countError } = await db
      .from("captions")
      .select("id", { count: "exact", head: true })
      .eq("image_id", deleted.image_id)
      .not("critic_id", "is", null);
    if (countError) console.error("Counting the post's roasts failed", countError);
    else if (count === 0) emptyPost = deleted.image_id;
  }

  revalidatePath("/", "layout");
  redirect(hrefWith("/media", {}, { deleted: 1, emptyPost }));
}
