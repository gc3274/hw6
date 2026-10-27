"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { IMAGE_BUCKET, isUuid } from "@/lib/captions";
import { requireSuperadmin } from "@/lib/dal";
import { constraintField, DB_DOWN, FIX_FIELDS, type FormState } from "@/lib/forms";
import {
  fileProblem,
  IMAGE_CONSTRAINTS,
  IMAGE_RULES,
  imageInsert,
  newImagePath,
  parseUpload,
  UPLOAD_ERRORS,
  validateImageEdit,
  type ImageField,
  type UploadInput,
} from "@/lib/images";
import { hrefWith } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

type State = FormState<ImageField>;
type Db = Awaited<ReturnType<typeof adminDb>>;

export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: string };
// On success createImage redirects instead
export type CreateImageResult = { error: string };

// keep: the path belongs to a photo already, so the file must stay
type Saved = { ok: true; id: string } | { ok: false; error: string; keep: boolean };

const GONE: State = { ok: false, message: "This photo no longer exists. Go back to the list." };

// Best effort; a leftover file in the admin's own folder is harmless
async function removeFile(db: Db, path: string) {
  try {
    const { error } = await db.storage.from(IMAGE_BUCKET).remove([path]);
    if (error) console.error("Removing the photo's file failed", error.message);
  } catch (error) {
    console.error("Removing the photo's file failed", error instanceof Error ? error.message : error);
  }
}

// Step 1 of an upload: a signed URL for one new file in the admin's own folder.
// The browser uploads the resized JPEG straight to Storage with it, so the photo
// never passes through a server action (1 MB body limit) or Vercel (4.5 MB).
export async function prepareImageUpload(): Promise<UploadTicket> {
  const { userId } = await requireSuperadmin();

  const path = newImagePath(userId, crypto.randomUUID());
  try {
    const db = await adminDb();
    // Without upsert, so it can't overwrite an existing file
    const { data, error } = await db.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("Creating the upload URL failed", error?.message ?? "no data");
      return { ok: false, error: "Couldn’t start the upload. Try again." };
    }
    return { ok: true, path, token: data.token };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Creating the upload URL failed", error);
    return { ok: false, error: "Couldn’t start the upload. Try again." };
  }
}

// Everything after the argument check. Never redirects, so createImage can call it in a try.
async function saveUpload(db: Db, userId: string, input: UploadInput): Promise<Saved> {
  const { data: found } = await db.storage.from(IMAGE_BUCKET).exists(input.path);
  if (!found) return { ok: false, error: UPLOAD_ERRORS.missing, keep: true };

  // Read back, so a file uploaded some other way is checked like the main app checks one
  const { data: file, error: downloadError } = await db.storage.from(IMAGE_BUCKET).download(input.path);
  if (downloadError || !file) {
    console.error("Reading the upload back failed", downloadError?.message ?? "no data");
    return { ok: false, error: UPLOAD_ERRORS.unreadable, keep: false };
  }
  const problem = fileProblem(file.size, new Uint8Array(await file.slice(0, 3).arrayBuffer()));
  if (problem) return { ok: false, error: problem, keep: false };

  const { data: row, error } = await db
    .from("images")
    .insert(imageInsert(userId, input))
    .select("id")
    .single<{ id: string }>();
  // image_path is unique: another photo already uses this file
  if (error?.code === "23505") return { ok: false, error: UPLOAD_ERRORS.taken, keep: true };
  if (error || !row) {
    console.error("Saving the photo failed", error);
    return { ok: false, error: UPLOAD_ERRORS.save, keep: false };
  }
  return { ok: true, id: row.id };
}

// Step 2: checks the uploaded file and saves the images row, posted under the
// admin's own account. On success it redirects to the new photo's page.
export async function createImage(path: string, topic: string, note: string): Promise<CreateImageResult> {
  const { userId } = await requireSuperadmin();

  const input = parseUpload(userId, path, topic, note);
  if (!input.ok) return { error: input.error };

  const db = await adminDb();
  // A repeated submit of the same upload goes to the photo it already made
  const { data: existing, error: readError } = await db
    .from("images")
    .select("id")
    .eq("image_path", input.path)
    .maybeSingle<{ id: string }>();
  if (readError) {
    console.error("Checking for an existing photo failed", readError);
    return { error: UPLOAD_ERRORS.save };
  }
  if (existing) redirect(`/images/${existing.id}`);

  let saved: Saved;
  try {
    saved = await saveUpload(db, userId, input);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Saving the upload failed", error);
    saved = { ok: false, error: UPLOAD_ERRORS.save, keep: false };
  }
  if (!saved.ok) {
    if (!saved.keep) await removeFile(db, input.path);
    return { error: saved.error };
  }

  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing
  redirect(`/images/${saved.id}?created=1`);
}

// The note, and the topic while the photo has one and no captions yet. The file
// and owner never change: its roasts were written about this photo.
export async function updateImage(_prev: State, fd: FormData): Promise<State> {
  await requireSuperadmin();

  const id = fd.get("id");
  if (!isUuid(id)) return GONE;

  const db = await adminDb();
  const { data: row, error: readError } = await db
    .from("images")
    .select("id, topic")
    .eq("id", id.toLowerCase())
    .maybeSingle<{ id: string; topic: string | null }>();
  if (readError) {
    console.error("Reading the photo before saving failed", readError);
    return { ok: false, message: DB_DOWN };
  }
  if (!row) return GONE;

  // The topic lock depends on whether it has any captions, so count them now
  const { count, error: countError } = await db
    .from("captions")
    .select("id", { count: "exact", head: true })
    .eq("image_id", row.id);
  if (countError) {
    console.error("Counting the photo's captions failed", countError);
    return { ok: false, message: DB_DOWN };
  }

  const result = validateImageEdit(fd, { topic: row.topic, captionCount: count ?? 0 });
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  const { data: saved, error } = await db.from("images").update(result.patch).eq("id", row.id).select("id");
  if (error) {
    const field = constraintField(error, IMAGE_CONSTRAINTS);
    if (field) return { ok: false, message: FIX_FIELDS, errors: { [field]: IMAGE_RULES[field] } };
    console.error("Saving the photo failed", error);
    return { ok: false, message: DB_DOWN };
  }
  if (!saved || saved.length === 0) return GONE;

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// The row first: its captions and their votes cascade, and generation_requests
// keep their image_path with image_id set to null. Then the file, best effort.
export async function deleteImage(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const raw = fd.get("id");
  if (!isUuid(raw)) redirect(hrefWith("/images", {}, { error: "gone" }));
  const id = raw.toLowerCase();

  const db = await adminDb();
  const { data: row, error: readError } = await db
    .from("images")
    .select("id, image_path")
    .eq("id", id)
    .maybeSingle<{ id: string; image_path: string }>();
  if (readError) {
    console.error("Reading the photo before deleting failed", readError);
    redirect(hrefWith(`/images/${id}`, {}, { error: "delete" }));
  }
  if (!row) redirect(hrefWith("/images", {}, { error: "gone" }));

  const { data, error } = await db.from("images").delete().eq("id", row.id).select("id");
  if (error) {
    console.error("Deleting the photo failed", error);
    redirect(hrefWith(`/images/${id}`, {}, { error: "delete" }));
  }
  if (!data || data.length === 0) redirect(hrefWith("/images", {}, { error: "gone" }));

  await removeFile(db, row.image_path);

  revalidatePath("/", "layout");
  redirect(hrefWith("/images", {}, { deleted: 1 }));
}
