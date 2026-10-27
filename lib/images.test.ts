import { describe, expect, it } from "vitest";
import { CONTEXT_MAX, IMAGE_MAX_BYTES, isOwnImagePath } from "@/lib/captions";
import {
  deleteWarning,
  fileProblem,
  IMAGE_CONSTRAINTS,
  IMAGE_RULES,
  imageInsert,
  newImagePath,
  NOTE_RULE,
  parseImageQuery,
  parseUpload,
  readNote,
  TOPIC_LOCKED,
  topicLock,
  UPLOAD_ERRORS,
  validateImageEdit,
} from "@/lib/images";

const ADMIN = "0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a";
const OTHER = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

// Copied from the migrations: images_path_owner (captions and votes),
// generation_requests_path_format (prompt chains), images_context_len and
// images_topic_check (roast mode)
const sqlPathOwner = (userId: string) => new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`);
const SQL_REQUEST_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;
const SQL_CONTEXT_MAX = 140;
const SQL_TOPICS = ["food", "art", "room", "fit", "anything"];

describe("parity with the migrations", () => {
  it("keeps the note limit", () => {
    expect(CONTEXT_MAX).toBe(SQL_CONTEXT_MAX);
  });

  it("builds paths every check accepts", () => {
    const path = newImagePath(ADMIN, FILE);
    expect(path).toBe(`${ADMIN}/${FILE}.jpg`);
    expect(isOwnImagePath(ADMIN, path)).toBe(true);
    expect(sqlPathOwner(ADMIN).test(path)).toBe(true);
    expect(SQL_REQUEST_PATH.test(path)).toBe(true);
  });

  it("builds a valid path from a real random uuid", () => {
    const path = newImagePath(ADMIN, crypto.randomUUID());
    expect(isOwnImagePath(ADMIN, path)).toBe(true);
    expect(sqlPathOwner(ADMIN).test(path)).toBe(true);
  });

  // isOwnImagePath is the stricter of the two, so whatever it accepts the check accepts
  it.each([
    [`${ADMIN}/${FILE}.jpg`, true],
    [`${OTHER}/${FILE}.jpg`, false],
    [`${ADMIN}/${FILE}.png`, false],
    [`${ADMIN}/${FILE}.jpg.exe`, false],
    [`${ADMIN}/x/${FILE}.jpg`, false],
    [`${ADMIN}/${FILE.toUpperCase()}.jpg`, false],
    [`../${ADMIN}/${FILE}.jpg`, false],
    [`${ADMIN}/${"-".repeat(36)}.jpg`, false],
  ])("isOwnImagePath(%j) is %s", (path, ok) => {
    expect(isOwnImagePath(ADMIN, path)).toBe(ok);
    if (ok) expect(sqlPathOwner(ADMIN).test(path)).toBe(true);
  });
});

describe("parseImageQuery", () => {
  it.each([
    [{}, { topic: null, page: 1 }],
    [{ topic: "food" }, { topic: "food", page: 1 }],
    [{ topic: "legacy", page: "2" }, { topic: "legacy", page: 2 }],
    [{ topic: ["art", "fit"] }, { topic: "art", page: 1 }],
    [{ topic: "Food" }, { topic: null, page: 1 }],
    [{ topic: "memes" }, { topic: null, page: 1 }],
    [{ topic: "", page: "0" }, { topic: null, page: 1 }],
  ])("%j", (sp, expected) => {
    expect(parseImageQuery(sp)).toEqual(expected);
  });

  it("knows every topic the check allows", () => {
    for (const topic of SQL_TOPICS) expect(parseImageQuery({ topic }).topic).toBe(topic);
  });
});

describe("readNote", () => {
  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["   ", null],
    ["  My first   carbonara\n", "My first carbonara"],
    ["🍝".repeat(140), "🍝".repeat(140)],
    [`${"a".repeat(140)}   `, "a".repeat(140)],
  ])("reads %j as %j", (raw, note) => {
    expect(readNote(raw)).toEqual({ ok: true, note });
  });

  it("refuses more than 140 code points instead of cutting it", () => {
    expect(readNote("🍝".repeat(141))).toEqual({ ok: false });
    expect(readNote("a".repeat(141))).toEqual({ ok: false });
  });

  it("refuses a file or other non-text value", () => {
    expect(readNote(new Blob(["x"]))).toEqual({ ok: false });
    expect(readNote(5)).toEqual({ ok: false });
  });
});

describe("topicLock", () => {
  it.each([
    [{ topic: "food", captionCount: 0 }, null],
    [{ topic: "anything", captionCount: 0 }, null],
    [{ topic: "food", captionCount: 1 }, "roasted"],
    [{ topic: null, captionCount: 0 }, "legacy"],
    [{ topic: null, captionCount: 4 }, "legacy"],
    [{ topic: "memes", captionCount: 0 }, "legacy"],
  ])("%j is %j", (current, lock) => {
    expect(topicLock(current)).toBe(lock);
  });
});

describe("validateImageEdit", () => {
  const open = { topic: "food", captionCount: 0 };
  const roasted = { topic: "food", captionCount: 2 };
  const legacy = { topic: null, captionCount: 3 };

  it("saves a note and a new topic on an unroasted photo", () => {
    expect(validateImageEdit(form({ context: " Be gentle ", topic: "art" }), open)).toEqual({
      ok: true,
      patch: { context: "Be gentle", topic: "art" },
    });
  });

  it("turns an empty note into null", () => {
    expect(validateImageEdit(form({ context: "  ", topic: "food" }), open)).toEqual({
      ok: true,
      patch: { context: null, topic: "food" },
    });
  });

  it("leaves the topic out when the form sends none", () => {
    for (const current of [open, roasted, legacy]) {
      expect(validateImageEdit(form({ context: "x" }), current)).toEqual({ ok: true, patch: { context: "x" } });
    }
  });

  it("refuses a topic outside the list", () => {
    for (const topic of ["", "legacy", "memes"]) {
      expect(validateImageEdit(form({ context: "", topic }), open)).toEqual({
        ok: false,
        errors: { topic: IMAGE_RULES.topic },
      });
    }
  });

  it("refuses a new topic once the photo has roasts", () => {
    expect(validateImageEdit(form({ context: "", topic: "art" }), roasted)).toEqual({
      ok: false,
      errors: { topic: TOPIC_LOCKED.roasted },
    });
  });

  it("lets a stale form resend the same topic on a roasted photo", () => {
    expect(validateImageEdit(form({ context: "", topic: "food" }), roasted)).toEqual({
      ok: true,
      patch: { context: null },
    });
  });

  it("never gives a legacy photo a topic", () => {
    expect(validateImageEdit(form({ context: "", topic: "food" }), legacy)).toEqual({
      ok: false,
      errors: { topic: TOPIC_LOCKED.legacy },
    });
  });

  it("checks the note however the topic is locked", () => {
    for (const current of [open, roasted, legacy]) {
      expect(validateImageEdit(form({ context: "x".repeat(141) }), current)).toEqual({
        ok: false,
        errors: { context: NOTE_RULE },
      });
    }
  });

  it("never puts anything but the note and topic in the patch", () => {
    const result = validateImageEdit(
      form({ context: "x", topic: "art", image_path: "elsewhere.jpg", user_id: OTHER }),
      open,
    );
    expect(result.ok && Object.keys(result.patch).sort()).toEqual(["context", "topic"]);
  });
});

describe("IMAGE_CONSTRAINTS", () => {
  it("maps the fixable checks to their fields", () => {
    expect(IMAGE_CONSTRAINTS).toEqual({ images_context_len: "context", images_topic_check: "topic" });
  });
});

describe("deleteWarning", () => {
  const end = "This can’t be undone.";

  it.each([
    [0, 0, 0, `Deletes the photo. ${end}`],
    [3, 0, 0, `Deletes the photo and its 3 roasts. ${end}`],
    [3, 5, 0, `Deletes the photo, its 3 roasts and their 5 votes. ${end}`],
    [1, 1, 0, `Deletes the photo, its 1 roast and its 1 vote. ${end}`],
    [2, 1200, 0, `Deletes the photo, its 2 roasts and their 1,200 votes. ${end}`],
    [1, 0, 1, `Deletes the photo and its 1 roast. Its 1 logged roast run stays, without the photo. ${end}`],
    [4, 0, 2, `Deletes the photo and its 4 roasts. Its 2 logged roast runs stay, without the photo. ${end}`],
  ])("%i roasts, %i votes, %i runs", (roasts, votes, runs, expected) => {
    expect(deleteWarning(roasts, votes, runs)).toBe(expected);
  });

  it("names legacy captions on a legacy photo", () => {
    expect(deleteWarning(2, 0, 0, ["legacy caption", "legacy captions"])).toBe(
      `Deletes the photo and its 2 legacy captions. ${end}`,
    );
  });
});

describe("parseUpload", () => {
  const path = newImagePath(ADMIN, FILE);

  it("reads a path in the admin's folder, a topic and a note", () => {
    expect(parseUpload(ADMIN, path, "food", "  first try ")).toEqual({
      ok: true,
      path,
      topic: "food",
      note: "first try",
    });
    expect(parseUpload(ADMIN, path, "anything", "")).toEqual({ ok: true, path, topic: "anything", note: null });
  });

  it.each([
    [newImagePath(OTHER, FILE), "food", "", UPLOAD_ERRORS.path],
    ["", "food", "", UPLOAD_ERRORS.path],
    [42, "food", "", UPLOAD_ERRORS.path],
    [path, "", "", UPLOAD_ERRORS.topic],
    [path, "legacy", "", UPLOAD_ERRORS.topic],
    [path, null, "", UPLOAD_ERRORS.topic],
    [path, "food", "x".repeat(141), UPLOAD_ERRORS.note],
  ])("refuses %j / %j", (p, topic, note, error) => {
    expect(parseUpload(ADMIN, p, topic, note)).toEqual({ ok: false, error });
  });
});

describe("fileProblem", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  it("accepts a JPEG up to 5 MB", () => {
    expect(fileProblem(IMAGE_MAX_BYTES, jpeg)).toBeNull();
    expect(fileProblem(1, jpeg)).toBeNull();
  });

  it("refuses anything bigger, whatever it is", () => {
    expect(fileProblem(IMAGE_MAX_BYTES + 1, jpeg)).toBe(UPLOAD_ERRORS.tooBig);
  });

  it("refuses other formats and empty files", () => {
    expect(fileProblem(4, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(UPLOAD_ERRORS.notJpeg);
    expect(fileProblem(0, new Uint8Array([]))).toBe(UPLOAD_ERRORS.notJpeg);
  });

  it("says how big is too big", () => {
    expect(UPLOAD_ERRORS.tooBig).toContain("5 MB");
  });
});

describe("imageInsert", () => {
  it("posts the photo under the admin, with nothing else set", () => {
    const row = imageInsert(ADMIN, { path: newImagePath(ADMIN, FILE), topic: "art", note: null });
    expect(row).toEqual({ user_id: ADMIN, image_path: `${ADMIN}/${FILE}.jpg`, topic: "art", context: null });
    expect(sqlPathOwner(row.user_id).test(row.image_path)).toBe(true);
  });
});
