import { describe, expect, it } from "vitest";
import { ledgerRows, type LedgerSource } from "@/lib/votes";

const OWNER = "11111111-1111-4111-8111-111111111111";
const VOTER = "22222222-2222-4222-8222-222222222222";
const ROAST = "33333333-3333-4333-8333-333333333333";
const CAPTION = "44444444-4444-4444-8444-444444444444";

const chef = { name: "Chef Scorch", emoji: "🔥" };

const vote = (patch: Partial<LedgerSource> = {}): LedgerSource => ({
  caption_id: ROAST,
  user_id: VOTER,
  value: 1,
  created_at: "2026-10-20T15:00:00Z",
  captions: { content: "Overcooked.", user_id: OWNER, critic_id: 1, critics: chef, images: { topic: "food" } },
  ...patch,
});

const names = new Map<string, string | null>([
  [VOTER, "Ada Lovelace"],
  [OWNER, "Grace Hopper"],
]);

describe("ledgerRows", () => {
  it("returns [] for no votes", () => {
    expect(ledgerRows([], names)).toEqual([]);
  });

  it("maps a vote on someone else's roast", () => {
    expect(ledgerRows([vote()], names)).toEqual([
      {
        captionId: ROAST,
        voter: { id: VOTER, name: "Ada Lovelace" },
        value: 1,
        createdAt: "2026-10-20T15:00:00Z",
        content: "Overcooked.",
        critic: chef,
        topic: "food",
        selfVote: false,
      },
    ]);
  });

  it("flags a vote cast by the owner of the roasted post", () => {
    const [row] = ledgerRows([vote({ user_id: OWNER, value: -1 })], names);
    expect(row.selfVote).toBe(true);
    expect(row.value).toBe(-1);
    expect(row.voter).toEqual({ id: OWNER, name: "Grace Hopper" });
  });

  it("gives a legacy caption no critic", () => {
    const legacy = vote({
      caption_id: CAPTION,
      captions: { content: "When the code compiles", user_id: OWNER, critic_id: null, critics: null, images: { topic: null } },
    });
    const [row] = ledgerRows([legacy], names);
    expect(row.critic).toBeNull();
    expect(row.topic).toBeNull();
  });

  it("ignores a critic embed on a row with no critic id", () => {
    const odd = vote({
      captions: { content: "x", user_id: OWNER, critic_id: null, critics: chef, images: { topic: null } },
    });
    expect(ledgerRows([odd], names)[0].critic).toBeNull();
  });

  it("leaves the voter's name null when they have no profile name", () => {
    expect(ledgerRows([vote()], new Map())[0].voter).toEqual({ id: VOTER, name: null });
  });

  it("keeps the order it was given", () => {
    const rows = ledgerRows([vote({ caption_id: CAPTION }), vote()], names);
    expect(rows.map((r) => r.captionId)).toEqual([CAPTION, ROAST]);
  });
});
