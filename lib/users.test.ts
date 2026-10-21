import { describe, expect, it } from "vitest";
import { fullName, userActivity } from "@/lib/users";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const zero = { posts: 0, roasts: 0, publicRoasts: 0, votesCast: 0 };

describe("userActivity", () => {
  it("returns {} for no users", () => {
    expect(userActivity([], [{ user_id: A, topic: "food" }], [], [{ user_id: A }])).toEqual({});
  });

  it("gives every listed user a row, zeros when they have no activity", () => {
    expect(userActivity([A, B], [], [], [])).toEqual({ [A]: zero, [B]: zero });
  });

  it("counts roast posts only, not legacy caption posts", () => {
    const images = [
      { user_id: A, topic: "food" },
      { user_id: A, topic: "anything" },
      { user_id: A, topic: null },
    ];
    expect(userActivity([A], images, [], [])[A].posts).toBe(2);
  });

  it("counts roasts on the user's posts, and the posted ones, but not legacy captions", () => {
    const captions = [
      { user_id: A, is_public: true, critic_id: 1 },
      { user_id: A, is_public: false, critic_id: 2 },
      { user_id: A, is_public: true, critic_id: null },
    ];
    const row = userActivity([A], [], captions, [])[A];
    expect(row.roasts).toBe(2);
    expect(row.publicRoasts).toBe(1);
  });

  it("counts every vote the user cast", () => {
    const votes = [{ user_id: A }, { user_id: A }, { user_id: B }];
    const out = userActivity([A, B], [], [], votes);
    expect(out[A].votesCast).toBe(2);
    expect(out[B].votesCast).toBe(1);
  });

  it("ignores rows for users not on the page", () => {
    const out = userActivity(
      [A],
      [{ user_id: OTHER, topic: "food" }],
      [{ user_id: OTHER, is_public: true, critic_id: 1 }],
      [{ user_id: OTHER }],
    );
    expect(out).toEqual({ [A]: zero });
    expect(OTHER in out).toBe(false);
  });

  it("keeps users apart", () => {
    const out = userActivity(
      [A, B],
      [{ user_id: B, topic: "art" }],
      [{ user_id: B, is_public: false, critic_id: 3 }],
      [],
    );
    expect(out[A]).toEqual(zero);
    expect(out[B]).toEqual({ posts: 1, roasts: 1, publicRoasts: 0, votesCast: 0 });
  });
});

describe("fullName", () => {
  it("joins first and last name", () => {
    expect(fullName("Ada", "Lovelace")).toBe("Ada Lovelace");
  });

  it("uses whichever half is set", () => {
    expect(fullName("Ada", null)).toBe("Ada");
    expect(fullName(null, "Lovelace")).toBe("Lovelace");
  });

  it("trims and ignores blank names", () => {
    expect(fullName("  Ada ", "   ")).toBe("Ada");
  });

  it("is null before onboarding, never the email", () => {
    expect(fullName(null, null)).toBeNull();
    expect(fullName("", "  ")).toBeNull();
  });
});
