import { describe, expect, it } from "vitest";
import {
  canPublish,
  describeGenerateError,
  eligibleCritic,
  isJpeg,
  validateRoastEdit,
  voiceOf,
} from "@/lib/media";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const roastForm = (overrides: Record<string, string> = {}) =>
  form({ content: "Soggy enough to file for unemployment.", tip: "", rating: "", is_public: "false", ...overrides });

const errorsFor = (fd: FormData, legacy = false) => {
  const result = validateRoastEdit(fd, { legacy });
  return result.ok ? {} : result.errors;
};

describe("voiceOf", () => {
  it("tells roasts from legacy captions", () => {
    expect(voiceOf({ critic_id: 3, humor_flavor_id: null })).toBe("roast");
    expect(voiceOf({ critic_id: null, humor_flavor_id: 2 })).toBe("legacy");
  });

  it("flags rows with both or neither voice as invalid", () => {
    expect(voiceOf({ critic_id: 3, humor_flavor_id: 2 })).toBe("invalid");
    expect(voiceOf({ critic_id: null, humor_flavor_id: null })).toBe("invalid");
  });
});

describe("validateRoastEdit: content", () => {
  it("rejects 0 code points, including whitespace only", () => {
    expect(errorsFor(roastForm({ content: "" }))).toHaveProperty("content");
    expect(errorsFor(roastForm({ content: "   \n " }))).toHaveProperty("content");
  });

  it("accepts 1 and 200 code points, counting an emoji as 1", () => {
    expect(validateRoastEdit(roastForm({ content: "a" }), { legacy: false }).ok).toBe(true);
    expect(validateRoastEdit(roastForm({ content: "🔥".repeat(200) }), { legacy: false }).ok).toBe(true);
    expect(validateRoastEdit(roastForm({ content: "a".repeat(200) }), { legacy: false }).ok).toBe(true);
  });

  it("rejects 201 code points", () => {
    expect(errorsFor(roastForm({ content: "🔥".repeat(201) }))).toHaveProperty("content");
    expect(errorsFor(roastForm({ content: "a".repeat(201) }))).toHaveProperty("content");
  });

  it("collapses whitespace before counting", () => {
    const result = validateRoastEdit(roastForm({ content: `  ${"a".repeat(100)}   \n  ${"b".repeat(99)}  ` }), {
      legacy: false,
    });
    expect(result.ok && result.patch.content).toBe(`${"a".repeat(100)} ${"b".repeat(99)}`);
  });

  it("rejects a missing content field", () => {
    const fd = roastForm();
    fd.delete("content");
    expect(errorsFor(fd)).toHaveProperty("content");
  });
});

describe("validateRoastEdit: tip", () => {
  it("turns an empty tip into null", () => {
    const result = validateRoastEdit(roastForm({ tip: "  " }), { legacy: false });
    expect(result.ok && result.patch.tip).toBeNull();
  });

  it("keeps a trimmed tip of 1 to 200 code points", () => {
    const result = validateRoastEdit(roastForm({ tip: "  Salt the water.  " }), { legacy: false });
    expect(result.ok && result.patch.tip).toBe("Salt the water.");
    expect(validateRoastEdit(roastForm({ tip: "🧂".repeat(200) }), { legacy: false }).ok).toBe(true);
  });

  it("rejects a tip over 200 code points", () => {
    expect(errorsFor(roastForm({ tip: "🧂".repeat(201) }))).toHaveProperty("tip");
  });
});

describe("validateRoastEdit: rating", () => {
  it("turns an empty rating into null", () => {
    const result = validateRoastEdit(roastForm({ rating: "" }), { legacy: false });
    expect(result.ok && result.patch.rating).toBeNull();
  });

  it.each([
    ["0", 0],
    ["7", 7],
    ["10", 10],
    [" 4 ", 4],
  ])("accepts %j as %i", (raw, value) => {
    const result = validateRoastEdit(roastForm({ rating: raw }), { legacy: false });
    expect(result.ok && result.patch.rating).toBe(value);
  });

  it.each(["7.5", "11", "-1", "abc", "1e1", "0x5", "Infinity"])("rejects %j", (raw) => {
    expect(errorsFor(roastForm({ rating: raw }))).toHaveProperty("rating");
  });
});

describe("validateRoastEdit: visibility", () => {
  it("reads the strings true and false", () => {
    const pub = validateRoastEdit(roastForm({ is_public: "true" }), { legacy: false });
    const priv = validateRoastEdit(roastForm({ is_public: "false" }), { legacy: false });
    expect(pub.ok && pub.patch.is_public).toBe(true);
    expect(priv.ok && priv.patch.is_public).toBe(false);
  });

  it("rejects anything else, including a missing field", () => {
    expect(errorsFor(roastForm({ is_public: "on" }))).toHaveProperty("is_public");
    expect(errorsFor(roastForm({ is_public: "TRUE" }))).toHaveProperty("is_public");
    const fd = roastForm();
    fd.delete("is_public");
    expect(errorsFor(fd)).toHaveProperty("is_public");
  });
});

describe("validateRoastEdit: results", () => {
  it("returns the full roast patch", () => {
    const result = validateRoastEdit(roastForm({ tip: "Salt it.", rating: "3", is_public: "true" }), {
      legacy: false,
    });
    expect(result).toEqual({
      ok: true,
      patch: { content: "Soggy enough to file for unemployment.", tip: "Salt it.", rating: 3, is_public: true },
    });
  });

  it("reports every bad field at once", () => {
    expect(Object.keys(errorsFor(roastForm({ content: "", tip: "x".repeat(201), rating: "11", is_public: "" }))).sort()).toEqual(
      ["content", "is_public", "rating", "tip"],
    );
  });

  it("lets legacy rows edit only content and visibility, ignoring tip and rating", () => {
    const result = validateRoastEdit(roastForm({ tip: "x".repeat(500), rating: "abc", is_public: "true" }), {
      legacy: true,
    });
    expect(result).toEqual({
      ok: true,
      patch: { content: "Soggy enough to file for unemployment.", is_public: true },
    });
  });

  it("still checks content and visibility on legacy rows", () => {
    expect(Object.keys(errorsFor(roastForm({ content: "", is_public: "maybe" }), true)).sort()).toEqual([
      "content",
      "is_public",
    ]);
  });
});

describe("canPublish", () => {
  const POSTED = "2026-10-16T14:00:00+00:00";

  it("always allows unpublishing", () => {
    expect(canPublish({ isPublic: true, postedAt: POSTED }, false)).toBe(true);
    expect(canPublish({ isPublic: false, postedAt: null }, false)).toBe(true);
  });

  it("allows publishing only a roast the owner posted before", () => {
    expect(canPublish({ isPublic: false, postedAt: POSTED }, true)).toBe(true);
    expect(canPublish({ isPublic: false, postedAt: null }, true)).toBe(false);
  });

  it("allows keeping an already public roast public", () => {
    expect(canPublish({ isPublic: true, postedAt: null }, true)).toBe(true);
    expect(canPublish({ isPublic: true, postedAt: POSTED }, true)).toBe(true);
  });
});

describe("eligibleCritic", () => {
  it("puts general critics on every roast panel", () => {
    expect(eligibleCritic(null, "food")).toBe(true);
    expect(eligibleCritic(null, "anything")).toBe(true);
  });

  it("puts a topic expert only on its own topic", () => {
    expect(eligibleCritic("food", "food")).toBe(true);
    expect(eligibleCritic("food", "art")).toBe(false);
    expect(eligibleCritic("food", "anything")).toBe(false);
  });

  it("refuses legacy posts", () => {
    expect(eligibleCritic(null, null)).toBe(false);
    expect(eligibleCritic("food", null)).toBe(false);
  });
});

describe("describeGenerateError", () => {
  it.each([
    ["not_configured", "GEMINI_API_KEY isn't set on this deployment."],
    ["rejected", "Gemini declined this photo (safety filter, or the main subject is a person)."],
    ["busy", "Gemini is busy. Try again in a minute."],
    ["failed", "Gemini's answer was unusable. Try again."],
  ] as const)("explains %s", (reason, message) => {
    expect(describeGenerateError(reason)).toBe(message);
  });
});

describe("isJpeg", () => {
  it("accepts the FF D8 FF signature", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
  });

  it("rejects other files and short buffers", () => {
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
    expect(isJpeg(new Uint8Array([]))).toBe(false);
  });
});
