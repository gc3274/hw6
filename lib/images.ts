// Rules for the photos pages (images rows). Pure, so they run in tests; the
// actions in app/(admin)/images/actions.ts apply them before any write.
// Limits match the captions and roast mode migrations.
import { CONTEXT_MAX, IMAGE_MAX_BYTES, isOwnImagePath, readContext } from "@/lib/captions";
import { codePoints, nouns } from "@/lib/format";
import { isJpeg } from "@/lib/media";
import { parsePage, type SearchParams } from "@/lib/params";
import { parseTopic, type Topic } from "@/lib/roasts";

export type ImageQuery = {
  // "legacy" is a photo with no topic, from before roast mode
  topic: Topic | "legacy" | null;
  page: number;
};

export function parseImageQuery(sp: SearchParams): ImageQuery {
  const raw = Array.isArray(sp.topic) ? sp.topic[0] : sp.topic;
  return { topic: parseTopic(raw) ?? (raw === "legacy" ? "legacy" : null), page: parsePage(sp.page) };
}

export const NOTE_RULE = `Keep the note to ${CONTEXT_MAX} characters, or leave it empty.`;

// readContext clips an over-long note to fit, which suits the main app's form.
// Here it is refused instead, so nothing is cut without the admin seeing it.
export function readNote(raw: unknown): { ok: true; note: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, note: null };
  if (typeof raw !== "string") return { ok: false };
  if (codePoints(raw.replace(/\s+/g, " ").trim()) > CONTEXT_MAX) return { ok: false };
  return { ok: true, note: readContext(raw) || null };
}

export type TopicLock = "legacy" | "roasted";

// The topic can change only on a roast photo with no captions at all
export function topicLock({ topic, captionCount }: { topic: string | null; captionCount: number }): TopicLock | null {
  if (parseTopic(topic) === null) return "legacy";
  return captionCount > 0 ? "roasted" : null;
}

export const TOPIC_LOCKED: Record<TopicLock, string> = {
  legacy: "Legacy photos stay legacy: giving one a topic would show its old caption post again in the main app.",
  roasted: "A photo with roasts keeps its topic, because its panel of critics was picked for that topic.",
};

export type ImageField = "context" | "topic";

export const IMAGE_RULES: Record<ImageField, string> = {
  context: NOTE_RULE,
  topic: "Choose a topic.",
};

// The image file and its owner never change: its roasts were written about this photo
export type ImagePatch = { context: string | null; topic?: Topic };

export type ImageEditResult =
  | { ok: true; patch: ImagePatch }
  | { ok: false; errors: Partial<Record<ImageField, string>> };

// The note can always change. A topic is read only when the form sent one: a
// locked photo's form has no topic field, and a stale form that sends a new
// topic for a photo that has since been roasted is refused.
export function validateImageEdit(
  fd: FormData,
  current: { topic: string | null; captionCount: number },
): ImageEditResult {
  const errors: Partial<Record<ImageField, string>> = {};

  const note = readNote(fd.get("context"));
  if (!note.ok) errors.context = IMAGE_RULES.context;
  const patch: ImagePatch = { context: note.ok ? note.note : null };

  const sent = fd.get("topic");
  if (sent !== null) {
    const lock = topicLock(current);
    const topic = parseTopic(sent);
    if (lock) {
      if (sent !== current.topic) errors.topic = TOPIC_LOCKED[lock];
    } else if (topic === null) {
      errors.topic = IMAGE_RULES.topic;
    } else {
      patch.topic = topic;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, patch };
}

// The checks on images a form field can fix, for constraintField
export const IMAGE_CONSTRAINTS: Record<string, ImageField> = {
  images_context_len: "context",
  images_topic_check: "topic",
};

// The delete dialog's warning. Captions cascade from images and votes from
// captions; generation_requests.image_id is on delete set null.
export function deleteWarning(
  roasts: number,
  votes: number,
  noun: [string, string] = ["roast", "roasts"],
): string {
  let what: string;
  if (roasts === 0) what = "Deletes the photo.";
  else if (votes === 0) what = `Deletes the photo and its ${nouns(roasts, ...noun)}.`;
  else what = `Deletes the photo, its ${nouns(roasts, ...noun)} and ${roasts === 1 ? "its" : "their"} ${nouns(votes, "vote")}.`;
  return `${what} Request logs keep a record of the run without the photo. This can’t be undone.`;
}

// Uploads ---------------------------------------------------------------------

// <user id>/<random uuid>.jpg: the shape images_path_owner and the bucket's insert policy expect
export function newImagePath(userId: string, uuid: string): string {
  return `${userId}/${uuid}.jpg`;
}

const PHOTO_MB = IMAGE_MAX_BYTES / (1024 * 1024);

export const UPLOAD_ERRORS = {
  path: "That upload isn’t in your folder. Start again.",
  topic: "Pick a topic.",
  note: NOTE_RULE,
  missing: "The upload didn’t arrive. Try again.",
  unreadable: "Couldn’t read the upload back from storage. Try again.",
  tooBig: `The photo is over ${PHOTO_MB} MB. Try a smaller one.`,
  notJpeg: "That file isn’t a JPEG. Try another photo.",
  taken: "That photo is already posted.",
  save: "Couldn’t save the photo: the database didn’t answer. Try again.",
} as const;

export type UploadInput = { path: string; topic: Topic; note: string | null };

// The arguments createImage gets from the browser, which may be anything
export function parseUpload(
  userId: string,
  path: unknown,
  topic: unknown,
  note: unknown,
): ({ ok: true } & UploadInput) | { ok: false; error: string } {
  if (!isOwnImagePath(userId, path)) return { ok: false, error: UPLOAD_ERRORS.path };
  const parsedTopic = parseTopic(topic);
  if (parsedTopic === null) return { ok: false, error: UPLOAD_ERRORS.topic };
  const parsedNote = readNote(note);
  if (!parsedNote.ok) return { ok: false, error: UPLOAD_ERRORS.note };
  return { ok: true, path, topic: parsedTopic, note: parsedNote.note };
}

// Same checks as the main app's upload action: at most 5 MB, and JPEG magic bytes
export function fileProblem(size: number, head: Uint8Array): string | null {
  if (size > IMAGE_MAX_BYTES) return UPLOAD_ERRORS.tooBig;
  if (!isJpeg(head)) return UPLOAD_ERRORS.notJpeg;
  return null;
}

export type ImageInsert = { user_id: string; image_path: string; topic: Topic; context: string | null };

// Posted under the admin's own account: user_id's default, auth.uid(), is null
// under the service role, and images_path_owner ties the path to it
export function imageInsert(userId: string, input: UploadInput): ImageInsert {
  return { user_id: userId, image_path: input.path, topic: input.topic, context: input.note };
}
