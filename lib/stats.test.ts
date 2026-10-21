import { describe, expect, it } from "vitest";
import { panelScore } from "@/lib/roasts";
import {
  CHARACTER_RULES,
  characterChecks,
  criticHarshness,
  criticLeaderboard,
  crowdVerdict,
  crowdVsCritic,
  decisionDelays,
  kpis,
  mean,
  median,
  panelInflation,
  panelSize,
  pipelineHealth,
  postRateByRating,
  round1,
  topicBreakdown,
  uploadsPerWeek,
  voteLedger,
  type AttemptRow,
  type CaptionRow,
  type CriticRow,
  type CrowdRow,
  type ImageRow,
  type ProfileRow,
  type VoteRow,
} from "./stats";

// The seeded panel: four topic experts, then the three general critics
const CRITICS: CriticRow[] = [
  { id: 1, slug: "chef-scorch", name: "Chef Scorch", emoji: "🔥", topic: "food", sort_order: 1 },
  { id: 2, slug: "vivienne-vex", name: "Vivienne Vex", emoji: "🧐", topic: "art", sort_order: 2 },
  { id: 3, slug: "reno-randy", name: "Reno Randy", emoji: "🔨", topic: "room", sort_order: 3 },
  { id: 4, slug: "margaux", name: "Margaux", emoji: "💅", topic: "fit", sort_order: 4 },
  { id: 5, slug: "jaded-new-yorker", name: "Jaded New Yorker", emoji: "🗽", topic: null, sort_order: 5 },
  { id: 6, slug: "chronically-online", name: "Chronically Online", emoji: "📱", topic: null, sort_order: 6 },
  { id: 7, slug: "midwest-mom", name: "Midwest Mom", emoji: "🥧", topic: null, sort_order: 7 },
];
const SCORCH = 1;
const MARGAUX = 4;
const JADED = 5;
const ONLINE = 6;
const MOM = 7;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function roast(over: Partial<CaptionRow> = {}): CaptionRow {
  const row: CaptionRow = {
    id: nextId("roast"),
    image_id: "img-1",
    user_id: "owner",
    humor_flavor_id: null,
    critic_id: JADED,
    content: "Seen sadder plates on the 6 train.",
    tip: "Salt it.",
    rating: 5,
    model: "gemini-3.5-flash-001",
    is_public: false,
    posted_at: null,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    created_at: "2026-10-16T10:00:00Z",
    ...over,
  };
  return { ...row, score: over.score ?? row.upvotes - row.downvotes };
}

function legacy(over: Partial<CaptionRow> = {}): CaptionRow {
  return roast({ humor_flavor_id: 1, critic_id: null, tip: null, rating: null, ...over });
}

function image(over: Partial<ImageRow> = {}): ImageRow {
  const id = over.id ?? nextId("img");
  return {
    id,
    user_id: "owner",
    image_path: `owner/${id}.jpg`,
    topic: "food",
    has_note: false,
    created_at: "2026-10-16T09:59:00Z",
    ...over,
  };
}

function vote(over: Partial<VoteRow> = {}): VoteRow {
  return { caption_id: "roast-x", user_id: nextId("voter"), value: 1, created_at: "2026-10-17T12:00:00Z", ...over };
}

function attempt(over: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: nextId("attempt"),
    user_id: "owner",
    image_path: "owner/a.jpg",
    created_at: "2026-10-16T09:58:00Z",
    ...over,
  };
}

const profile = (id: string): ProfileRow => ({ id, created_at: "2026-09-30T12:00:00Z" });

describe("mean / median / round1", () => {
  it("returns null on empty input instead of NaN", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it("handles one value", () => {
    expect(mean([3])).toBe(3);
    expect(median([4])).toBe(4);
  });

  it("takes the middle pair's average for an even count, without mutating the input", () => {
    const xs = [10, 1, 3, 2];
    expect(median(xs)).toBe(2.5);
    expect(median([1, 2, 3])).toBe(2);
    expect(xs).toEqual([10, 1, 3, 2]);
  });

  it("rounds to one decimal exactly like panelScore", () => {
    expect(round1(3.66)).toBe(3.7);
    expect(round1(3.65)).toBe(panelScore([3.65]));
    expect(round1(2)).toBe(2);
  });

  it("never returns negative zero", () => {
    expect(Object.is(round1(-0.04), 0)).toBe(true);
  });
});

describe("kpis", () => {
  it("is all zeros and nulls on an empty dataset", () => {
    expect(kpis([], [], [], [], [])).toEqual({
      users: 0,
      roastPhotos: 0,
      legacyPhotos: 0,
      notes: 0,
      roasts: 0,
      roastsPosted: 0,
      votes: 0,
      upvotes: 0,
      downvotes: 0,
      attempts: 0,
      saved: 0,
      panelMeanAll: null,
      scoredAll: 0,
      panelMeanPublic: null,
      scoredPublic: 0,
    });
  });

  it("averages a single private roast but has no public number", () => {
    const k = kpis([image()], [roast({ rating: 3 })], [], [], []);
    expect(k).toMatchObject({ roasts: 1, roastsPosted: 0, panelMeanAll: 3, panelMeanPublic: null });
  });

  it("splits photos by era and counts notes", () => {
    const images = [
      image({ topic: "food", has_note: true }),
      image({ topic: "anything" }),
      image({ topic: null, has_note: true }),
      image({ topic: null }),
      image({ topic: null }),
    ];
    expect(kpis(images, [], [], [], [])).toMatchObject({ roastPhotos: 2, legacyPhotos: 3, notes: 2 });
  });

  it("averages all roasts against posted roasts only, ignoring legacy captions", () => {
    const captions = [
      roast({ rating: 3 }),
      roast({ rating: 9, is_public: true, posted_at: "2026-10-16T10:05:00Z" }),
      roast({ rating: null, is_public: true, posted_at: "2026-10-16T10:05:00Z" }),
      legacy({ is_public: true }),
    ];
    expect(kpis([], captions, [], [], [])).toMatchObject({
      roasts: 3,
      roastsPosted: 2,
      panelMeanAll: 6,
      scoredAll: 2,
      panelMeanPublic: 9,
      scoredPublic: 1,
    });
  });

  it("counts users, votes by value, and attempts that saved a photo", () => {
    const images = [image({ image_path: "owner/a.jpg" })];
    const votes = [vote({ value: 1 }), vote({ value: 1 }), vote({ value: -1 })];
    const attempts = [attempt({ image_path: "owner/a.jpg" }), attempt({ image_path: "owner/b.jpg" })];
    const k = kpis(images, [], votes, [profile("a"), profile("b")], attempts);
    expect(k).toMatchObject({ users: 2, votes: 3, upvotes: 2, downvotes: 1, attempts: 2, saved: 1 });
  });
});

describe("criticHarshness", () => {
  it("lists every critic with no roasts in panel order", () => {
    const rows = criticHarshness([], CRITICS);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.critic.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of rows) expect(r).toMatchObject({ n: 0, scored: 0, mean: null, min: null, max: null, posted: 0 });
  });

  it("puts the only scored critic first", () => {
    const rows = criticHarshness([roast({ critic_id: SCORCH, rating: 3 })], CRITICS);
    expect(rows[0]).toMatchObject({ n: 1, scored: 1, mean: 3, min: 3, max: 3 });
    expect(rows[0].critic.id).toBe(SCORCH);
    expect(rows.slice(1).every((r) => r.n === 0)).toBe(true);
  });

  it("averages only the scored roasts", () => {
    const captions = [2, 5, null].map((rating) => roast({ critic_id: MOM, rating }));
    const mom = criticHarshness(captions, CRITICS).find((r) => r.critic.id === MOM);
    expect(mom).toMatchObject({ n: 3, scored: 2, mean: 3.5, min: 2, max: 5 });
  });

  it("rounds the mean to one decimal", () => {
    const captions = [3, 4, 4].map((rating) => roast({ critic_id: MOM, rating }));
    expect(criticHarshness(captions, CRITICS)[0].mean).toBe(3.7);
  });

  it("sorts harshest first, ties by panel order, unscored critics last", () => {
    const captions = [
      roast({ critic_id: MOM, rating: 6 }),
      roast({ critic_id: ONLINE, rating: 2 }),
      roast({ critic_id: JADED, rating: 6 }),
      roast({ critic_id: SCORCH, rating: null }),
    ];
    const order = criticHarshness(captions, CRITICS).map((r) => r.critic.id);
    expect(order).toEqual([ONLINE, JADED, MOM, 1, 2, 3, 4]);
  });

  it("ignores legacy captions and counts posted roasts only", () => {
    const captions = [
      roast({ critic_id: JADED, is_public: true, posted_at: "2026-10-16T10:05:00Z" }),
      roast({ critic_id: JADED }),
      legacy({ is_public: true }),
    ];
    const jaded = criticHarshness(captions, CRITICS).find((r) => r.critic.id === JADED);
    expect(jaded).toMatchObject({ n: 2, posted: 1 });
    expect(criticHarshness(captions, CRITICS).reduce((sum, r) => sum + r.n, 0)).toBe(2);
  });
});

describe("characterChecks / CHARACTER_RULES", () => {
  const check = (captions: CaptionRow[], id: string) => {
    const found = characterChecks(captions, CRITICS).find((c) => c.id === id);
    if (!found) throw new Error(`no check ${id}`);
    return found;
  };

  it("has a rule for each measurable line in the prompts", () => {
    expect(CHARACTER_RULES.map((r) => r.id)).toEqual([
      "jaded-no-exclamation",
      "online-lowercase",
      "margaux-one-sentence",
      "one-emoji",
      "no-hashtags",
    ]);
  });

  it("counts nothing when there are no roasts", () => {
    const checks = characterChecks([], CRITICS);
    expect(checks).toHaveLength(CHARACTER_RULES.length);
    for (const c of checks) expect(c).toMatchObject({ passed: 0, total: 0 });
  });

  it("checks the Jaded New Yorker for exclamation points, and only him", () => {
    const captions = [
      roast({ critic_id: JADED, content: "fine." }),
      roast({ critic_id: JADED, content: "wow!" }),
      roast({ critic_id: SCORCH, content: "RAW!" }),
    ];
    const jaded = check(captions, "jaded-no-exclamation");
    expect(jaded).toMatchObject({ passed: 1, total: 2 });
    expect(jaded.critic?.id).toBe(JADED);
  });

  it("checks Chronically Online for lowercase", () => {
    const captions = [
      roast({ critic_id: ONLINE, content: "the way i gasped 😭" }),
      roast({ critic_id: ONLINE, content: "Not The Pasta" }),
    ];
    expect(check(captions, "online-lowercase")).toMatchObject({ passed: 1, total: 2 });
  });

  it("checks Margaux for one sentence; no terminator counts as one", () => {
    const captions = [
      roast({ critic_id: MARGAUX, content: "A calm sentence." }),
      roast({ critic_id: MARGAUX, content: "Two. Sentences." }),
      roast({ critic_id: MARGAUX, content: "no terminator at all" }),
    ];
    expect(check(captions, "margaux-one-sentence")).toMatchObject({ passed: 2, total: 3 });
  });

  it("allows one emoji per roast for every critic, counting a ZWJ sequence once", () => {
    const captions = [
      roast({ critic_id: SCORCH, content: "🔥" }),
      roast({ critic_id: JADED, content: "🔥🔥" }),
      roast({ critic_id: MOM, content: "👨‍🍳 plated" }),
      legacy({ content: "🔥🔥🔥" }),
    ];
    const emoji = check(captions, "one-emoji");
    expect(emoji).toMatchObject({ passed: 2, total: 3 });
    expect(emoji.critic).toBeNull();
  });

  it("flags word-like hashtags but not #1", () => {
    const captions = [
      roast({ critic_id: MOM, content: "#1 pasta" }),
      roast({ critic_id: MOM, content: "#fail" }),
    ];
    expect(check(captions, "no-hashtags")).toMatchObject({ passed: 1, total: 2 });
  });

  it("drops a critic's rule when that critic is not in the table", () => {
    const checks = characterChecks([], CRITICS.filter((c) => c.slug !== "margaux"));
    expect(checks.map((c) => c.id)).not.toContain("margaux-one-sentence");
  });
});

describe("postRateByRating", () => {
  const counts = (captions: CaptionRow[]) =>
    postRateByRating(captions).map((b) => [b.bucket, b.posted, b.total]);
  const posted = { is_public: true, posted_at: "2026-10-16T10:05:00Z" };

  it("returns the four buckets in a fixed order, all empty", () => {
    expect(counts([])).toEqual([
      ["0-3", 0, 0],
      ["4-6", 0, 0],
      ["7-10", 0, 0],
      ["unscored", 0, 0],
    ]);
    expect(postRateByRating([]).map((b) => b.label)).toEqual(["Harsh 0–3", "Middling 4–6", "Kind 7–10", "Unscored"]);
  });

  it("puts a single posted 8 in Kind", () => {
    expect(counts([roast({ rating: 8, ...posted })])).toEqual([
      ["0-3", 0, 0],
      ["4-6", 0, 0],
      ["7-10", 1, 1],
      ["unscored", 0, 0],
    ]);
  });

  it("splits at 3/4 and 6/7, with null as unscored", () => {
    const captions = [3, 4, 6, 7, null].map((rating) => roast({ rating }));
    expect(counts(captions)).toEqual([
      ["0-3", 0, 1],
      ["4-6", 0, 2],
      ["7-10", 0, 1],
      ["unscored", 0, 1],
    ]);
  });

  it("ignores legacy captions even when public", () => {
    expect(postRateByRating([legacy({ is_public: true })]).every((b) => b.total === 0)).toBe(true);
  });
});

describe("decisionDelays", () => {
  it("returns [] for no roasts", () => {
    expect(decisionDelays([])).toEqual([]);
  });

  it("measures minutes from roast to post", () => {
    const r = roast({ created_at: "2026-10-16T10:00:00Z", is_public: true, posted_at: "2026-10-16T10:04:00Z" });
    expect(decisionDelays([r])).toEqual([4]);
  });

  it("skips unposted roasts and legacy captions", () => {
    const captions = [
      roast(),
      legacy({ is_public: true, posted_at: "2026-10-16T10:04:00Z" }),
    ];
    expect(decisionDelays(captions)).toEqual([]);
  });

  it("clamps a post stamped before the roast to 0", () => {
    const r = roast({ created_at: "2026-10-16T10:00:00Z", is_public: true, posted_at: "2026-10-16T09:59:00Z" });
    expect(decisionDelays([r])).toEqual([0]);
  });
});

describe("panelInflation", () => {
  const posted = { is_public: true, posted_at: "2026-10-16T10:05:00Z" };

  it("returns [] for no data", () => {
    expect(panelInflation([], [])).toEqual([]);
  });

  it("compares the full panel with the posted roasts", () => {
    const img = image({ id: "p1", topic: "food", created_at: "2026-10-16T09:59:00Z" });
    const captions = [roast({ image_id: "p1", rating: 3 }), roast({ image_id: "p1", rating: 9, ...posted })];
    expect(panelInflation([img], captions)).toEqual([
      { imageId: "p1", topic: "food", createdAt: "2026-10-16T09:59:00Z", fullScore: 6, publicScore: 9, delta: 3 },
    ]);
  });

  it("excludes a post with nothing posted", () => {
    const img = image({ id: "p1" });
    expect(panelInflation([img], [roast({ image_id: "p1", rating: 3 })])).toEqual([]);
  });

  it("includes a fully posted panel with delta 0", () => {
    const img = image({ id: "p1" });
    const captions = [roast({ image_id: "p1", rating: 3, ...posted }), roast({ image_id: "p1", rating: 5, ...posted })];
    expect(panelInflation([img], captions)[0]).toMatchObject({ fullScore: 4, publicScore: 4, delta: 0 });
  });

  it("excludes a post whose only posted roast is unscored", () => {
    const img = image({ id: "p1" });
    const captions = [roast({ image_id: "p1", rating: 3 }), roast({ image_id: "p1", rating: null, ...posted })];
    expect(panelInflation([img], captions)).toEqual([]);
  });

  it("sorts by delta, biggest first", () => {
    const images = [image({ id: "small" }), image({ id: "big" })];
    const captions = [
      roast({ image_id: "small", rating: 5 }),
      roast({ image_id: "small", rating: 6, ...posted }),
      roast({ image_id: "big", rating: 1 }),
      roast({ image_id: "big", rating: 9, ...posted }),
    ];
    expect(panelInflation(images, captions).map((r) => [r.imageId, r.delta])).toEqual([
      ["big", 4],
      ["small", 0.5],
    ]);
  });
});

describe("crowdVsCritic / crowdVerdict", () => {
  const posted = { is_public: true, posted_at: "2026-10-16T10:05:00Z" };
  const row = (rating: number | null, upvotes: number, downvotes: number): CrowdRow => ({
    captionId: nextId("roast"),
    critic: CRITICS[4],
    rating,
    content: "x",
    upvotes,
    downvotes,
    net: upvotes - downvotes,
  });

  it("is empty with no verdict when nothing is posted", () => {
    expect(crowdVsCritic([], CRITICS)).toEqual([]);
    expect(crowdVerdict([])).toBeNull();
  });

  it("makes one row per posted roast and skips private ones", () => {
    const captions = [roast({ upvotes: 2, downvotes: 1, ...posted }), roast({ upvotes: 5 })];
    const rows = crowdVsCritic(captions, CRITICS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ upvotes: 2, downvotes: 1, net: 1 });
    expect(rows[0].critic.id).toBe(JADED);
  });

  it("skips legacy captions", () => {
    expect(crowdVsCritic([legacy({ upvotes: 3, ...posted })], CRITICS)).toEqual([]);
  });

  it("sorts by net, then by rating", () => {
    const captions = [
      roast({ id: "low", rating: 2, upvotes: 1, ...posted }),
      roast({ id: "high", rating: 8, upvotes: 1, ...posted }),
      roast({ id: "top", rating: 1, upvotes: 3, ...posted }),
      roast({ id: "none", rating: null, upvotes: 1, ...posted }),
    ];
    expect(crowdVsCritic(captions, CRITICS).map((r) => r.captionId)).toEqual(["top", "high", "low", "none"]);
  });

  it("needs five voted rows before it gives a verdict", () => {
    const four = [row(2, 3, 1), row(3, 2, 1), row(8, 0, 1), row(9, 1, 1)];
    expect(crowdVerdict(four)).toBeNull();
  });

  it("compares harsh and kind roasts once five rows have votes", () => {
    const rows = [row(2, 2, 0), row(3, 2, 1), row(4, 1, 1), row(7, 0, 1), row(9, 1, 1)];
    expect(crowdVerdict(rows)).toEqual({ harshMeanNet: 1, kindMeanNet: -0.5, n: 5 });
  });

  it("does not count rows with no votes toward the minimum", () => {
    const rows = [row(2, 2, 0), row(3, 2, 1), row(4, 1, 1), row(7, 0, 1), row(9, 0, 0), row(8, 0, 0)];
    expect(crowdVerdict(rows)).toBeNull();
    expect(crowdVerdict(rows, 4)).toEqual({ harshMeanNet: 1, kindMeanNet: -1, n: 4 });
  });

  it("gives no verdict when one side has no voted roasts", () => {
    const rows = [row(2, 2, 0), row(3, 2, 1), row(4, 1, 1), row(1, 0, 1), row(5, 1, 1)];
    expect(crowdVerdict(rows)).toBeNull();
  });
});

describe("voteLedger", () => {
  const posted = { is_public: true, posted_at: "2026-10-16T10:05:00Z" };
  const era = (ledger: ReturnType<typeof voteLedger>, name: "legacy" | "roast") => {
    const found = ledger.eras.find((e) => e.era === name);
    if (!found) throw new Error(`no era ${name}`);
    return found;
  };

  it("is all zeros with no data", () => {
    const ledger = voteLedger([], []);
    expect(ledger).toMatchObject({ votes: 0, voters: 0, selfVotes: 0 });
    for (const e of ledger.eras) expect(e).toMatchObject({ posted: 0, up: 0, down: 0, silent: 0 });
    expect(ledger.eras.map((e) => e.era)).toEqual(["roast", "legacy"]);
  });

  it("counts a posted legacy caption's votes in the legacy era only", () => {
    const caption = legacy({ id: "leg", user_id: "owner", upvotes: 1, ...posted });
    const ledger = voteLedger([caption], [vote({ caption_id: "leg", user_id: "someone" })]);
    expect(era(ledger, "legacy")).toMatchObject({ posted: 1, up: 1, down: 0, silent: 0 });
    expect(era(ledger, "roast")).toMatchObject({ posted: 0, up: 0, down: 0, silent: 0 });
    expect(ledger.selfVotes).toBe(0);
  });

  it("counts an owner voting on their own roast as a self-vote", () => {
    const caption = roast({ id: "mine", user_id: "owner", upvotes: 1, ...posted });
    const ledger = voteLedger([caption], [vote({ caption_id: "mine", user_id: "owner" })]);
    expect(ledger.selfVotes).toBe(1);
  });

  it("counts posted roasts nobody voted on as silent", () => {
    const captions = [roast({ upvotes: 1, ...posted }), roast({ ...posted })];
    expect(era(voteLedger(captions, []), "roast")).toMatchObject({ posted: 2, up: 1, silent: 1 });
  });

  it("ignores unposted captions and their counters", () => {
    const captions = [roast({ upvotes: 4, downvotes: 2 }), legacy({ upvotes: 1 })];
    const ledger = voteLedger(captions, []);
    for (const e of ledger.eras) expect(e).toMatchObject({ posted: 0, up: 0, down: 0, silent: 0 });
  });

  it("counts votes and distinct voters", () => {
    const votes = [
      vote({ caption_id: "a", user_id: "u1" }),
      vote({ caption_id: "b", user_id: "u1" }),
      vote({ caption_id: "a", user_id: "u2", value: -1 }),
    ];
    expect(voteLedger([], votes)).toMatchObject({ votes: 3, voters: 2 });
  });
});

describe("pipelineHealth / panelSize", () => {
  it("is empty with no attempts", () => {
    expect(pipelineHealth([], [], [], CRITICS)).toEqual({
      attempts: 0,
      saved: 0,
      lost: 0,
      lostRate: null,
      models: [],
      fallbackShare: { part: 0, total: 0 },
      missingTip: 0,
      missingRating: 0,
      roasts: 0,
      shortPanels: 0,
      roastImages: 0,
      cappedUsers: 0,
    });
  });

  it("counts an attempt with no saved photo as lost", () => {
    const attempts = [attempt({ image_path: "owner/a.jpg" }), attempt({ image_path: "owner/b.jpg" })];
    const images = [image({ image_path: "owner/a.jpg" })];
    expect(pipelineHealth(attempts, images, [], CRITICS)).toMatchObject({ attempts: 2, saved: 1, lost: 1, lostRate: 0.5 });
  });

  it("counts models by use and the fallback's share", () => {
    const captions = [
      roast({ model: "gemini-2.5-flash-lite" }),
      roast({ model: "gemini-3.5-flash-001" }),
      roast({ model: "gemini-3.5-flash-001" }),
    ];
    const health = pipelineHealth([], [], captions, CRITICS);
    expect(health.models).toEqual([
      { model: "gemini-3.5-flash-001", count: 2 },
      { model: "gemini-2.5-flash-lite", count: 1 },
    ]);
    expect(health.fallbackShare).toEqual({ part: 1, total: 3 });
  });

  it("counts missing tips and scores on roasts only", () => {
    const captions = [roast({ tip: null }), roast({ rating: null }), roast(), legacy(), legacy()];
    expect(pipelineHealth([], [], captions, CRITICS)).toMatchObject({ missingTip: 1, missingRating: 1, roasts: 3 });
  });

  it("knows each topic's panel size", () => {
    expect(panelSize("food", CRITICS)).toBe(4);
    expect(panelSize("anything", CRITICS)).toBe(3);
    expect(panelSize(null, CRITICS)).toBeNull();
  });

  it("counts roast posts with fewer roasts than their panel", () => {
    const images = [image({ id: "food", topic: "food" }), image({ id: "any", topic: "anything" }), image({ id: "old", topic: null })];
    const captions = [
      ...[1, 5, 6].map((critic_id) => roast({ image_id: "food", critic_id })),
      ...[5, 6, 7].map((critic_id) => roast({ image_id: "any", critic_id })),
      legacy({ image_id: "old" }),
    ];
    expect(pipelineHealth([], images, captions, CRITICS)).toMatchObject({ shortPanels: 1, roastImages: 2 });
  });

  it("counts users who hit five attempts inside 24 hours", () => {
    const at = (user_id: string, created_at: string) => attempt({ user_id, created_at });
    const burst = ["10:00", "11:00", "12:00", "13:00", "14:00"].map((t) => at("burst", `2026-10-16T${t}:00Z`));
    const spread = ["2026-10-14T10:00:00Z", "2026-10-14T11:00:00Z", "2026-10-15T12:00:00Z", "2026-10-16T13:00:00Z", "2026-10-16T14:00:00Z"].map((t) => at("spread", t));
    const four = ["10:00", "11:00", "12:00", "13:00"].map((t) => at("four", `2026-10-16T${t}:00Z`));
    expect(pipelineHealth(burst, [], [], CRITICS).cappedUsers).toBe(1);
    expect(pipelineHealth(spread, [], [], CRITICS).cappedUsers).toBe(0);
    expect(pipelineHealth(four, [], [], CRITICS).cappedUsers).toBe(0);
  });
});

describe("uploadsPerWeek", () => {
  const NOW = new Date("2026-10-21T12:00:00Z");

  it("is empty with no images", () => {
    expect(uploadsPerWeek([], NOW)).toEqual({ weeks: [], launchedAt: null });
  });

  it("zero-fills Monday weeks from the first upload through now", () => {
    const result = uploadsPerWeek([image({ topic: null, created_at: "2026-10-01T12:00:00Z" })], NOW);
    expect(result.weeks.map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(result.weeks.map((w) => w.legacy)).toEqual([1, 0, 0, 0]);
    expect(result.weeks.map((w) => w.roast)).toEqual([0, 0, 0, 0]);
    expect(result.launchedAt).toBeNull();
  });

  it("buckets by the New York calendar by default", () => {
    // Saturday Oct 4, 11 pm in New York; already Monday Oct 5 in UTC
    const img = image({ topic: "food", created_at: "2026-10-05T03:00:00Z" });
    expect(uploadsPerWeek([img], NOW).weeks[0]).toMatchObject({ weekStart: "2026-09-28", roast: 1 });
    expect(uploadsPerWeek([img], NOW, "UTC").weeks[0]).toMatchObject({ weekStart: "2026-10-05", roast: 1 });
  });

  it("marks the launch at the earliest roast post", () => {
    const images = [
      image({ topic: null, created_at: "2026-10-01T12:00:00Z" }),
      image({ topic: "art", created_at: "2026-10-18T12:00:00Z" }),
      image({ topic: "food", created_at: "2026-10-15T12:00:00Z" }),
    ];
    const result = uploadsPerWeek(images, NOW);
    expect(result.launchedAt).toBe("2026-10-15T12:00:00Z");
    expect(result.weeks.map((w) => [w.legacy, w.roast])).toEqual([
      [1, 0],
      [0, 0],
      [0, 2],
      [0, 0],
    ]);
  });

  it("labels weeks by their Monday", () => {
    const result = uploadsPerWeek([image({ created_at: "2026-10-01T12:00:00Z" })], NOW);
    expect(result.weeks.slice(0, 2).map((w) => w.label)).toEqual(["Sep 28", "Oct 5"]);
  });
});

describe("criticLeaderboard", () => {
  const posted = { is_public: true, posted_at: "2026-10-16T10:05:00Z" };

  it("lists every critic with nulls when there is nothing yet", () => {
    const rows = criticLeaderboard([], [], CRITICS);
    expect(rows.map((r) => r.critic.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of rows) {
      expect(r).toMatchObject({ roasts: 0, posted: 0, postRate: null, avgRating: null, up: 0, down: 0, approval: null });
    }
  });

  it("measures roasts, average score and post rate per critic", () => {
    const captions = [
      roast({ critic_id: MOM, rating: 3, ...posted }),
      roast({ critic_id: MOM, rating: 4 }),
      roast({ critic_id: MOM, rating: null }),
      roast({ critic_id: MOM, rating: 4 }),
    ];
    const mom = criticLeaderboard(captions, [], CRITICS)[0];
    expect(mom.critic.id).toBe(MOM);
    expect(mom).toMatchObject({ roasts: 4, posted: 1, postRate: 0.25, scored: 3, avgRating: 3.7 });
  });

  it("leaves owners' votes on their own roasts out of crowd approval", () => {
    const captions = [roast({ id: "r1", critic_id: JADED, user_id: "owner", ...posted })];
    const votes = [
      vote({ caption_id: "r1", user_id: "owner", value: 1 }),
      vote({ caption_id: "r1", user_id: "a", value: 1 }),
      vote({ caption_id: "r1", user_id: "b", value: -1 }),
      vote({ caption_id: "r1", user_id: "c", value: 1 }),
    ];
    const jaded = criticLeaderboard(captions, votes, CRITICS)[0];
    expect(jaded).toMatchObject({ up: 2, down: 1, selfVotes: 1 });
    expect(jaded.approval).toBeCloseTo(2 / 3);
  });

  it("ignores legacy captions and their votes", () => {
    const captions = [legacy({ id: "leg", ...posted })];
    const rows = criticLeaderboard(captions, [vote({ caption_id: "leg" })], CRITICS);
    expect(rows.every((r) => r.roasts === 0 && r.up === 0)).toBe(true);
  });

  it("ranks by roasts written, ties in panel order", () => {
    const captions = [
      roast({ critic_id: MOM }),
      roast({ critic_id: MOM }),
      roast({ critic_id: ONLINE }),
      roast({ critic_id: JADED }),
    ];
    expect(criticLeaderboard(captions, [], CRITICS).map((r) => r.critic.id)).toEqual([MOM, JADED, ONLINE, 1, 2, 3, 4]);
  });
});

describe("topicBreakdown", () => {
  it("lists every topic, then legacy, all empty", () => {
    const rows = topicBreakdown([], []);
    expect(rows.map((r) => r.topic)).toEqual(["food", "art", "room", "fit", "anything", "legacy"]);
    for (const r of rows) expect(r).toMatchObject({ posts: 0, roasts: 0, publicRoasts: 0, avgRating: null });
  });

  it("counts posts, roasts, posted roasts and the average score per topic", () => {
    const images = [
      image({ id: "f1", topic: "food" }),
      image({ id: "f2", topic: "food" }),
      image({ id: "a1", topic: "art" }),
      image({ id: "old", topic: null }),
    ];
    const captions = [
      roast({ image_id: "f1", rating: 2, is_public: true, posted_at: "2026-10-16T10:05:00Z" }),
      roast({ image_id: "f1", rating: 3 }),
      roast({ image_id: "f2", rating: null }),
      roast({ image_id: "a1", rating: 8 }),
      legacy({ image_id: "old", is_public: true }),
    ];
    const byTopic = Object.fromEntries(topicBreakdown(images, captions).map((r) => [r.topic, r]));
    expect(byTopic.food).toMatchObject({ posts: 2, roasts: 3, publicRoasts: 1, scored: 2, avgRating: 2.5 });
    expect(byTopic.art).toMatchObject({ posts: 1, roasts: 1, publicRoasts: 0, avgRating: 8 });
    expect(byTopic.room).toMatchObject({ posts: 0, avgRating: null });
    expect(byTopic.legacy).toMatchObject({ posts: 1, roasts: 0, publicRoasts: 0, avgRating: null });
  });
});
