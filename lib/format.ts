// Small display and text helpers for the stats page. Pure, so they run in tests.

// Counts always; a percent only once the denominator is big enough to mean something
export function shareLabel(part: number, total: number): string {
  if (total === 0) return "none yet";
  const label = `${part} of ${total}`;
  return total >= 10 ? `${label} (${Math.round((part / total) * 100)}%)` : label;
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
