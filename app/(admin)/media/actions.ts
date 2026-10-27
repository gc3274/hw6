"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { IMAGE_BUCKET, IMAGE_MAX_BYTES, isUuid } from "@/lib/captions";
import { RUN_BUDGET_MS } from "@/lib/chains";
import { finishRequest, loadChainConfig, logResponse, startRequest, type RequestStatus } from "@/lib/data/generation";
import { requireSuperadmin } from "@/lib/dal";
import { generateRoasts } from "@/lib/gemini";
import {
  canPublish,
  checkViolationField,
  CREATE_ERRORS,
  createRefusal,
  describeGenerateError,
  FIELD_RULES,
  isJpeg,
  parseCreateForm,
  PUBLISH_REFUSED,
  roastInsert,
  validateRoastEdit,
  voiceOf,
  type CreateState,
  type EditState,
} from "@/lib/media";
import { hrefWith } from "@/lib/params";
import { parseTopic, type Critic } from "@/lib/roasts";
import { adminDb } from "@/lib/supabase/admin";

const GONE: EditState = { ok: false, message: "This roast no longer exists. Go back to the list." };
const DB_DOWN: EditState = { ok: false, message: "Couldn’t save: the database didn’t answer. Try again." };
const FIX_FIELDS = "Fix the fields marked below.";

type Created = { ok: true; id: string } | { ok: false; error: string };
// What the request log records about the run. status and detail are set on failure.
type Run = { requestId: string | null; chainId: number | null; configProblem: string | null; status: RequestStatus; detail: string | null };

const PHOTO_MB = IMAGE_MAX_BYTES / (1024 * 1024);

// Everything after the form check. Never redirects, so createRoast can call it in a try.
async function generateRoast(
  adminId: string,
  imageId: string,
  criticId: number,
  run: Run,
  startedAt: number,
): Promise<Created> {
  const db = await adminDb();
  const [imageRead, criticRead] = await Promise.all([
    db
      .from("images")
      .select("id, user_id, image_path, topic, context")
      .eq("id", imageId)
      .maybeSingle<{ id: string; user_id: string; image_path: string; topic: string | null; context: string | null }>(),
    db
      .from("critics")
      .select("id, slug, name, emoji, description, topic")
      .eq("id", criticId)
      .maybeSingle<Critic & { topic: string | null }>(),
  ]);
  if (imageRead.error || criticRead.error) {
    console.error("Reading the post or critic failed", imageRead.error ?? criticRead.error);
    return { ok: false, error: "Couldn’t start: the database didn’t answer. Try again." };
  }

  // Legacy posts and off-panel critics are refused before anything is sent to Gemini
  const image = imageRead.data;
  const critic = criticRead.data;
  const topic = parseTopic(image?.topic ?? null);
  const refusal = createRefusal(image, critic);
  if (refusal || !image || !critic || !topic) return { ok: false, error: refusal ?? CREATE_ERRORS.gone };

  // Logged before the model is called, like a run from the main app
  run.requestId = await startRequest({ userId: adminId, imagePath: image.image_path, imageId: image.id, topic });
  if (!run.requestId) {
    return { ok: false, error: "Couldn’t start: the request log couldn’t be written. Try again." };
  }
  const requestId = run.requestId;
  const failRun = (error: string, detail: string): Created => {
    run.detail = detail;
    return { ok: false, error };
  };

  const { data: file, error: downloadError } = await db.storage.from(IMAGE_BUCKET).download(image.image_path);
  if (downloadError || !file) {
    console.error("Downloading the post's photo failed", downloadError?.message ?? "no data");
    return failRun("Couldn’t read the post’s photo from storage. Try again.", "The photo couldn't be downloaded.");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return failRun(`The post’s photo is over ${PHOTO_MB} MB, so it can’t be sent to Gemini.`, "The photo is over 5 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) {
    return failRun("The post’s photo isn’t a JPEG, so it can’t be sent to Gemini.", "The file isn't a JPEG.");
  }

  const config = await loadChainConfig(topic);
  run.chainId = config.chain.id;
  run.configProblem = config.problem;

  const result = await generateRoasts({
    chain: config.chain,
    context: { topic, critics: [critic], note: image.context ?? "", terms: config.terms, examples: config.examples },
    image: { data: Buffer.from(bytes).toString("base64"), mimeType: "image/jpeg" },
    deadline: startedAt + RUN_BUDGET_MS,
    onResponse: (log) => logResponse(requestId, log),
  });
  if (!result.ok) {
    if (result.reason !== "not_configured") run.status = result.reason;
    return failRun(describeGenerateError(result.reason), result.error);
  }
  const draft = result.roasts.find((r) => r.criticId === critic.id);
  if (!draft) return failRun(describeGenerateError("failed"), "No roast for the chosen critic.");

  const { data: saved, error } = await db
    .from("captions")
    .insert(roastInsert(image, draft, result))
    .select("id")
    .single<{ id: string }>();
  if (error || !saved) {
    console.error("Saving the generated roast failed", error);
    return failRun(
      "Couldn’t save the roast: the database didn’t answer. Try again.",
      `Saving the roast failed: ${error?.message ?? "no row"}`,
    );
  }
  return { ok: true, id: saved.id };
}

// One critic's roast for a post already in the app, saved private under the post's
// owner. Logged in generation_requests as source 'admin' under the admin, so it never
// spends the owner's daily posts. /media/new sets maxDuration for the Gemini calls.
export async function createRoast(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const { userId } = await requireSuperadmin();
  // The model calls' time budget counts from here
  const startedAt = Date.now();

  const input = parseCreateForm(fd);
  if (!input.ok) return { error: input.error };

  const run: Run = { requestId: null, chainId: null, configProblem: null, status: "failed", detail: null };
  let created: Created;
  try {
    created = await generateRoast(userId, input.imageId, input.criticId, run, startedAt);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Generating the roast failed", error);
    run.detail = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    created = { ok: false, error: "Couldn’t generate the roast. Try again." };
  }

  if (run.requestId) {
    const notes = [created.ok ? null : run.detail, run.configProblem].filter(Boolean);
    await finishRequest(run.requestId, {
      status: created.ok ? "succeeded" : run.status,
      error: notes.length > 0 ? notes.join(" ") : null,
      chainId: run.chainId,
      imageId: input.imageId,
      roastCount: created.ok ? 1 : 0,
      durationMs: Date.now() - startedAt,
    });
  }
  if (!created.ok) return { error: created.error };

  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing
  redirect(`/media/${created.id}?created=1`);
}

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
