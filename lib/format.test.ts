import { describe, expect, it } from "vitest";
import { codePoints, countEmoji, fmt1, nyDayKey, sentenceCount, shareLabel } from "@/lib/format";

describe("shareLabel", () => {
  it("says none yet when there is nothing to count", () => {
    expect(shareLabel(0, 0)).toBe("none yet");
  });

  it("shows counts only below 10", () => {
    expect(shareLabel(2, 5)).toBe("2 of 5");
    expect(shareLabel(0, 3)).toBe("0 of 3");
    expect(shareLabel(9, 9)).toBe("9 of 9");
  });

  it("adds a rounded percent from 10 up", () => {
    expect(shareLabel(2, 14)).toBe("2 of 14 (14%)");
    expect(shareLabel(14, 14)).toBe("14 of 14 (100%)");
    expect(shareLabel(0, 10)).toBe("0 of 10 (0%)");
    expect(shareLabel(1, 3000)).toBe("1 of 3000 (0%)");
  });
});

describe("fmt1", () => {
  it("shows a dash for missing values", () => {
    expect(fmt1(null)).toBe("–");
    expect(fmt1(Number.NaN)).toBe("–");
    expect(fmt1(Number.POSITIVE_INFINITY)).toBe("–");
  });

  it("always shows one decimal", () => {
    expect(fmt1(3)).toBe("3.0");
    expect(fmt1(0)).toBe("0.0");
    expect(fmt1(3.74)).toBe("3.7");
  });

  it("rounds half up like panelScore", () => {
    expect(fmt1(3.65)).toBe("3.7");
    expect(fmt1(9.96)).toBe("10.0");
  });

  it("keeps the sign of negatives and never prints -0.0", () => {
    expect(fmt1(-1.26)).toBe("-1.3");
    expect(fmt1(-0.01)).toBe("0.0");
  });
});

describe("nyDayKey", () => {
  it("uses the New York calendar day", () => {
    expect(nyDayKey("2026-10-21T16:00:00Z")).toBe("2026-10-21");
  });

  it("puts 03:00Z on the previous New York day", () => {
    expect(nyDayKey("2026-10-05T03:00:00Z")).toBe("2026-10-04");
  });

  it("follows daylight saving changes", () => {
    // New York midnight is 04:00Z on EDT days and 05:00Z on EST days
    expect(nyDayKey("2026-11-01T03:59:59Z")).toBe("2026-10-31");
    expect(nyDayKey("2026-11-01T04:00:00Z")).toBe("2026-11-01");
    expect(nyDayKey("2026-03-08T04:59:59Z")).toBe("2026-03-07");
    expect(nyDayKey("2026-03-08T05:00:00Z")).toBe("2026-03-08");
  });

  it("reads the timestamps PostgREST returns", () => {
    expect(nyDayKey("2026-10-15T02:30:00.123456+00:00")).toBe("2026-10-14");
  });
});

describe("countEmoji", () => {
  it("counts a ZWJ sequence as one emoji", () => {
    expect(countEmoji("👨‍🍳")).toBe(1);
    expect(countEmoji("👨‍🍳 plated")).toBe(1);
  });

  it("counts each emoji, including skin tones, flags and keycaps, once", () => {
    expect(countEmoji("🔥")).toBe(1);
    expect(countEmoji("🔥🔥")).toBe(2);
    expect(countEmoji("👍🏽")).toBe(1);
    expect(countEmoji("🇺🇸")).toBe(1);
    expect(countEmoji("1️⃣")).toBe(1);
    expect(countEmoji("🛏️ nice")).toBe(1);
  });

  it("returns 0 for plain text and empty strings", () => {
    expect(countEmoji("")).toBe(0);
    expect(countEmoji("the way i gasped, #1 pasta")).toBe(0);
  });
});

describe("sentenceCount", () => {
  it("splits on terminators followed by a space or the end", () => {
    expect(sentenceCount("Hi. There?")).toBe(2);
    expect(sentenceCount("A calm sentence.")).toBe(1);
    expect(sentenceCount("Two. Sentences.")).toBe(2);
    expect(sentenceCount("Wow!!! Really?!")).toBe(2);
  });

  it("counts text with no terminator as one sentence", () => {
    expect(sentenceCount("no terminator at all")).toBe(1);
  });

  it("does not split inside numbers, and lets a closing quote follow the terminator", () => {
    expect(sentenceCount("Rated 3.5 out of 10.")).toBe(1);
    expect(sentenceCount('She said "no." Then left.')).toBe(2);
  });

  it("does not count a trailing emoji as a sentence", () => {
    expect(sentenceCount("Bold choice. 🔥")).toBe(1);
  });

  it("returns 0 for empty or blank text", () => {
    expect(sentenceCount("")).toBe(0);
    expect(sentenceCount("   ")).toBe(0);
  });
});

describe("codePoints", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(codePoints("🔥🔥")).toBe(2);
    expect(codePoints("abc")).toBe(3);
    expect(codePoints("")).toBe(0);
  });
});
