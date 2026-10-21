// Rules for admin edits to roasts (captions rows). Pure, so they run in tests;
// the actions in app/(admin)/media/actions.ts apply them before any write.
import { CAPTION_MAX } from "@/lib/captions";
import { codePoints } from "@/lib/format";
import { RATING_MAX, TIP_MAX } from "@/lib/roasts";

export type Voice = "roast" | "legacy" | "invalid";

// captions_one_voice: a row has a critic (roast) or a humor flavor (legacy), never both
export function voiceOf(row: { critic_id: number | null; humor_flavor_id: number | null }): Voice {
  if (row.critic_id !== null && row.humor_flavor_id === null) return "roast";
  if (row.critic_id === null && row.humor_flavor_id !== null) return "legacy";
  return "invalid";
}

export type EditField = "content" | "tip" | "rating" | "is_public";
// critic_id and humor_flavor_id are never part of an edit
export type RoastPatch = { content: string; is_public: boolean; tip?: string | null; rating?: number | null };
export type RoastEditResult =
  | { ok: true; patch: RoastPatch }
  | { ok: false; errors: Partial<Record<EditField, string>> };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
};

const RATING_RE = /^\d{1,2}$/;

// One wording per rule, shared by the form checks and the database's check constraints
export const FIELD_RULES = {
  content: `Write 1 to ${CAPTION_MAX} characters.`,
  tip: `Keep the tip to ${TIP_MAX} characters, or leave it empty.`,
  rating: `Use a whole number from 0 to ${RATING_MAX}, or leave it empty.`,
} as const;

// Same limits as the captions checks: content 1-200, tip null or 1-200, rating null or 0-10.
// Legacy captions have no tip or rating, so only content and visibility are read for them.
export function validateRoastEdit(fd: FormData, { legacy }: { legacy: boolean }): RoastEditResult {
  const errors: Partial<Record<EditField, string>> = {};

  const content = text(fd, "content");
  const contentLength = codePoints(content);
  if (contentLength < 1 || contentLength > CAPTION_MAX) {
    errors.content = FIELD_RULES.content;
  }

  const visibility = fd.get("is_public");
  if (visibility !== "true" && visibility !== "false") errors.is_public = "Choose public or private.";

  const patch: RoastPatch = { content, is_public: visibility === "true" };

  if (!legacy) {
    const tip = text(fd, "tip");
    if (codePoints(tip) > TIP_MAX) errors.tip = FIELD_RULES.tip;
    patch.tip = tip || null;

    const rating = text(fd, "rating");
    if (rating === "") {
      patch.rating = null;
    } else if (RATING_RE.test(rating) && Number(rating) <= RATING_MAX) {
      patch.rating = Number(rating);
    } else {
      errors.rating = FIELD_RULES.rating;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, patch };
}

// What updateRoast hands back to the edit form
export type EditState = { ok: boolean; message: string; errors?: Partial<Record<EditField, string>> };

// The check constraints on captions that a form field can fix. Postgres names the
// failing one in the 23514 message: violates check constraint "captions_tip_len".
const CHECK_FIELDS: Record<string, keyof typeof FIELD_RULES> = {
  captions_content_len: "content",
  captions_tip_len: "tip",
  captions_rating_range: "rating",
};

export function checkViolationField(message: string | undefined): keyof typeof FIELD_RULES | null {
  const constraint = /check constraint "([a-z_]+)"/.exec(message ?? "")?.[1];
  return (constraint && CHECK_FIELDS[constraint]) || null;
}

// A public roast makes its photo public (images RLS), so the admin may only
// re-publish what the owner posted at some point. Hiding is always allowed.
export function canPublish({ isPublic, postedAt }: { isPublic: boolean; postedAt: string | null }, next: boolean): boolean {
  if (!next || isPublic) return true;
  return postedAt !== null;
}

// Shown next to the Public option and returned when the server refuses a publish
export const PUBLISH_REFUSED =
  "The owner never posted this roast, so it stays private. Making it public would also make their photo public.";

// The delete dialog's warning: the roast's votes go with it (caption_votes cascade)
export function deleteWarning(votes: number): string {
  const lost =
    votes === 0
      ? "It has no votes."
      : `Its ${votes.toLocaleString("en-US")} ${votes === 1 ? "vote is" : "votes are"} deleted too.`;
  return `${lost} This can’t be undone.`;
}

// General critics (topic null) sit on every roast panel; experts only on their own topic.
// Legacy posts have no topic and never get roasts.
export function eligibleCritic(criticTopic: string | null, imageTopic: string | null): boolean {
  if (imageTopic === null) return false;
  return criticTopic === null || criticTopic === imageTopic;
}

export type GenerateFailure = "not_configured" | "rejected" | "busy" | "failed";

const GENERATE_ERRORS: Record<GenerateFailure, string> = {
  not_configured: "GEMINI_API_KEY isn't set on this deployment.",
  rejected: "Gemini declined this photo (safety filter, or the main subject is a person).",
  busy: "Gemini is busy. Try again in a minute.",
  failed: "Gemini's answer was unusable. Try again.",
};

export function describeGenerateError(reason: GenerateFailure): string {
  return GENERATE_ERRORS[reason];
}

// JPEG files always start with FF D8 FF (same check as the main app's upload action)
export const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
