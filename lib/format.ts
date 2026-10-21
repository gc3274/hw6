// Small display and text helpers for the stats page. Pure, so they run in tests.

// Counts always; a percent only once the denominator is big enough to mean something
export function shareLabel(part: number, total: number): string {
  if (total === 0) return "none yet";
  const label = `${part} of ${total}`;
  return total >= 10 ? `${label} (${Math.round((part / total) * 100)}%)` : label;
}

// "1 roast", "2,400 roasts"; pass the plural when adding "s" is wrong
export function nouns(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

// One decimal, rounded the same way as panelScore; "–" when there is no number
export function fmt1(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "–";
  const rounded = Math.round(x * 10) / 10;
  return (rounded === 0 ? 0 : rounded).toFixed(1);
}

const NY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "YYYY-MM-DD" of the New York calendar day the instant falls on
export function nyDayKey(iso: string): string {
  const parts = NY_DAY.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
// Flags are regional-indicator pairs and keycaps end in U+20E3; neither is Extended_Pictographic
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

// Counted per grapheme, so a ZWJ sequence like 👨‍🍳 or a skin-toned 👍🏽 is one emoji
export function countEmoji(s: string): number {
  let n = 0;
  for (const { segment } of graphemes.segment(s)) if (EMOJI.test(segment)) n++;
  return n;
}

// A terminator run ends a sentence when a space or the end follows (closing quotes allowed),
// so "3.5" doesn't split. Pieces with no letters or digits, like a trailing emoji, don't count.
const SENTENCE_END = /[.!?]+["'”’)]*(?:\s+|$)/u;
const HAS_WORD = /[\p{L}\p{N}]/u;

export function sentenceCount(s: string): number {
  return s.split(SENTENCE_END).filter((piece) => HAS_WORD.test(piece)).length;
}

// Postgres char_length counts code points, so emoji count as 1
export function codePoints(s: string): number {
  return Array.from(s).length;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-05" -> "Oct 5". Takes a day key, so the time zone was already applied.
export function dayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

// A wait in the largest unit that reads naturally: "4 minutes", "2 hours", "3 days"
export function durationLabel(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (Math.round(minutes) < 60) return plural(Math.round(minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.round(minutes / (24 * 60)), "day");
}
