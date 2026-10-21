// Copied from gc3274/hw1@3eb3337 lib/captions.ts; keep in sync
// Subset: cleanCaption, CAPTION_MAX, isUuid, IMAGE_BUCKET, IMAGE_MAX_BYTES, FeedSort.
// Shared by server code and client components, so nothing here may touch
// the server, Supabase or env. Limits match the checks in the captions migration.
export const IMAGE_BUCKET = "images";
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CAPTION_MAX = 200;

export type FeedSort = "top" | "new";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", "“": "”", "‘": "’" };
// Word-like tags at the very end. Tags without a letter (#1) are part of the joke.
const TRAILING_HASHTAG = /(?:^|\s+)#[\p{N}_]*\p{L}[\p{L}\p{N}_]*$/u;

function stripQuotes(s: string) {
  const close = QUOTE_PAIRS[s[0]];
  return close && s.length >= 2 && s.endsWith(close) ? s.slice(1, -1).trim() : s;
}

function stripHashtags(s: string) {
  let out = s;
  while (TRAILING_HASHTAG.test(out)) out = out.replace(TRAILING_HASHTAG, "").trimEnd();
  return out;
}

export function cleanCaption(text: string) {
  return stripHashtags(stripQuotes(stripHashtags(collapse(text))));
}
