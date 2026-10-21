import { describe, expect, it } from "vitest";
import {
  canPublish,
  CREATE_ERRORS,
  createRefusal,
  criticChoices,
  checkViolationField,
  deleteWarning,
  describeGenerateError,
  eligibleCritic,
  isJpeg,
  parseCreateForm,
  roastInsert,
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

describe("checkViolationField", () => {
  const violation = (constraint: string) =>
    `new row for relation "captions" violates check constraint "${constraint}"`;

  it("maps each editable column's check to its field", () => {
    expect(checkViolationField(violation("captions_content_len"))).toBe("content");
    expect(checkViolationField(violation("captions_tip_len"))).toBe("tip");
    expect(checkViolationField(violation("captions_rating_range"))).toBe("rating");
  });

  it("returns null for checks no form field can fix", () => {
    expect(checkViolationField(violation("captions_one_voice"))).toBeNull();
    expect(checkViolationField(violation("captions_upvotes_min"))).toBeNull();
  });

  it("returns null for other messages and a missing one", () => {
    expect(checkViolationField("captions_content_len_extra")).toBeNull();
    expect(checkViolationField("permission denied for table captions")).toBeNull();
    expect(checkViolationField("")).toBeNull();
    expect(checkViolationField(undefined)).toBeNull();
  });
});

describe("deleteWarning", () => {
  it("counts the votes that go with the roast", () => {
    expect(deleteWarning(3)).toBe("Its 3 votes are deleted too. This can’t be undone.");
    expect(deleteWarning(1)).toBe("Its 1 vote is deleted too. This can’t be undone.");
    expect(deleteWarning(1200)).toBe("Its 1,200 votes are deleted too. This can’t be undone.");
  });

  it("leaves votes out when there are none", () => {
    expect(deleteWarning(0)).toBe("It has no votes. This can’t be undone.");
  });
});

describe("parseCreateForm", () => {
  const IMAGE = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";

  it("reads a post id and a critic id", () => {
    expect(parseCreateForm(form({ imageId: IMAGE, criticId: "1" }))).toEqual({
      ok: true,
      imageId: IMAGE,
      criticId: 1,
    });
  });

  it("lowercases the post id", () => {
    const result = parseCreateForm(form({ imageId: IMAGE.toUpperCase(), criticId: "7" }));
    expect(result).toEqual({ ok: true, imageId: IMAGE, criticId: 7 });
  });

  it("refuses a missing or malformed post id", () => {
    for (const imageId of ["", "abc", `${IMAGE}x`, "1"]) {
      expect(parseCreateForm(form({ imageId, criticId: "1" })), imageId).toEqual({
        ok: false,
        error: CREATE_ERRORS.gone,
      });
    }
    expect(parseCreateForm(form({ criticId: "1" }))).toEqual({ ok: false, error: CREATE_ERRORS.gone });
  });

  it("refuses a critic id that isn't a whole number from 1", () => {
    for (const criticId of ["", "0", "-1", "1.5", "abc", " 1", "1e2", "999999"]) {
      expect(parseCreateForm(form({ imageId: IMAGE, criticId })), criticId).toEqual({
        ok: false,
        error: CREATE_ERRORS.noCritic,
      });
    }
    expect(parseCreateForm(form({ imageId: IMAGE }))).toEqual({ ok: false, error: CREATE_ERRORS.noCritic });
  });
});

describe("createRefusal", () => {
  const chef = { topic: "food" };
  const general = { topic: null };

  it("allows the topic expert and the general panel on a roast post", () => {
    expect(createRefusal({ topic: "food" }, chef)).toBeNull();
    expect(createRefusal({ topic: "food" }, general)).toBeNull();
    expect(createRefusal({ topic: "anything" }, general)).toBeNull();
  });

  it("refuses a post that no longer exists", () => {
    expect(createRefusal(null, chef)).toBe(CREATE_ERRORS.gone);
    expect(createRefusal(null, null)).toBe(CREATE_ERRORS.gone);
  });

  it("refuses legacy caption posts, whatever the critic", () => {
    expect(createRefusal({ topic: null }, general)).toBe(CREATE_ERRORS.legacy);
    expect(createRefusal({ topic: null }, chef)).toBe(CREATE_ERRORS.legacy);
    expect(createRefusal({ topic: "memes" }, general)).toBe(CREATE_ERRORS.legacy);
  });

  it("refuses a critic who isn't on the post's panel, or doesn't exist", () => {
    expect(createRefusal({ topic: "art" }, chef)).toBe(CREATE_ERRORS.offPanel);
    expect(createRefusal({ topic: "anything" }, chef)).toBe(CREATE_ERRORS.offPanel);
    expect(createRefusal({ topic: "food" }, null)).toBe(CREATE_ERRORS.offPanel);
  });
});

describe("roastInsert", () => {
  const image = { id: "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60", user_id: "0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a" };
  const draft = { criticId: 1, content: "Raw in the middle, burnt on the edges.", tip: "Lower the heat.", rating: 3 };
  const generated = { prompt: "You are the judging panel…\n\nRoast this.", model: "gemini-3.5-flash" };

  it("files the roast under the post's owner, private, in the critic's voice", () => {
    expect(roastInsert(image, draft, generated)).toEqual({
      image_id: image.id,
      user_id: image.user_id,
      critic_id: 1,
      humor_flavor_id: null,
      content: draft.content,
      tip: draft.tip,
      rating: 3,
      prompt: generated.prompt,
      model: generated.model,
      is_public: false,
    });
  });

  it("keeps a missing tip and score as null", () => {
    const row = roastInsert(image, { ...draft, tip: null, rating: null }, generated);
    expect(row.tip).toBeNull();
    expect(row.rating).toBeNull();
    expect(row.is_public).toBe(false);
  });

  it("never sets posted_at, votes or anything else", () => {
    expect(Object.keys(roastInsert(image, draft, generated)).sort()).toEqual([
      "content",
      "critic_id",
      "humor_flavor_id",
      "image_id",
      "is_public",
      "model",
      "prompt",
      "rating",
      "tip",
      "user_id",
    ]);
  });
});

describe("criticChoices", () => {
  const panel = [{ id: 1 }, { id: 5 }, { id: 6 }, { id: 7 }];

  it("counts each critic's roasts on the post and preselects the first with none", () => {
    const { choices, preselect } = criticChoices(panel, [1, 5, 5, null]);
    expect(choices.map((c) => [c.id, c.existing])).toEqual([
      [1, 1],
      [5, 2],
      [6, 0],
      [7, 0],
    ]);
    expect(preselect).toBe(6);
  });

  it("preselects the expert on a post with no roasts", () => {
    expect(criticChoices(panel, []).preselect).toBe(1);
  });

  it("preselects nobody when every critic has a roast", () => {
    expect(criticChoices(panel, [7, 6, 5, 1]).preselect).toBeNull();
  });

  it("ignores roasts by critics who aren't on the panel", () => {
    const { choices } = criticChoices(panel, [2, 3]);
    expect(choices.every((c) => c.existing === 0)).toBe(true);
  });

  it("handles an empty panel", () => {
    expect(criticChoices([], [1])).toEqual({ choices: [], preselect: null });
  });

  it("keeps the critics' own fields", () => {
    const { choices } = criticChoices([{ id: 4, name: "Margaux" }], []);
    expect(choices).toEqual([{ id: 4, name: "Margaux", existing: 0 }]);
  });
});
