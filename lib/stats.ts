// Every number on the overview page. Pure: the rows are fetched once in
// lib/data/stats.ts, and nothing here reads the clock (`now` is passed in) or
// the network, so the whole page is testable without a database.
// Nothing returns NaN: empty input gives zeros, empty arrays or null.
import { countEmoji, dayLabel, sentenceCount } from "@/lib/format";
import { TOPICS, type Topic } from "@/lib/roasts";

// Input rows, with the columns lib/data/stats.ts selects
export type ProfileRow = { id: string; created_at: string };
export type ImageRow = {
  id: string;
  user_id: string;
  image_path: string;
  topic: string | null;
  // Derived in the fetch layer; the note itself never leaves the database
  has_note: boolean;
  created_at: string;
};
export type CaptionRow = {
  id: string;
  image_id: string;
  user_id: string;
  humor_flavor_id: number | null;
  critic_id: number | null;
  content: string;
  tip: string | null;
  rating: number | null;
  model: string;
  is_public: boolean;
  posted_at: string | null;
  upvotes: number;
  downvotes: number;
  score: number;
  created_at: string;
};
export type VoteRow = { caption_id: string; user_id: string; value: -1 | 1; created_at: string };
export type CriticRow = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  topic: string | null;
  sort_order: number;
};
export type AttemptRow = { id: string; user_id: string; image_path: string; created_at: string };

export type Dataset = {
  critics: CriticRow[];
  captions: CaptionRow[];
  images: ImageRow[];
  votes: VoteRow[];
  attempts: AttemptRow[];
  profiles: ProfileRow[];
};

// A roast is written by a critic; a legacy caption has a humor flavor instead
export const isRoast = (c: CaptionRow): boolean => c.critic_id !== null;
const isLegacyCaption = (c: CaptionRow): boolean => c.humor_flavor_id !== null;
const scores = (captions: CaptionRow[]) =>
  captions.flatMap((c) => (c.rating === null ? [] : [c.rating]));

const DAY_MS = 24 * 60 * 60 * 1000;
// Matches DAILY_GENERATION_LIMIT in the main app
const DAILY_LIMIT = 5;

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

// Same expression as panelScore, so the admin and the app round alike
export function round1(x: number): number {
  const rounded = Math.round(x * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

const mean1 = (xs: number[]) => {
  const m = mean(xs);
  return m === null ? null : round1(m);
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const group = out.get(key(item));
    if (group) group.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

// Attempts whose photo was saved; a failed run deletes its image row
function savedAttempts(attempts: AttemptRow[], images: ImageRow[]): number {
  const paths = new Set(images.map((i) => i.image_path));
  return attempts.filter((a) => paths.has(a.image_path)).length;
}

const byPanelOrder = (a: CriticRow, b: CriticRow) => a.sort_order - b.sort_order;

// --- Hero and KPI tiles ------------------------------------------------------

export type Kpis = {
  users: number;
  roastPhotos: number;
  legacyPhotos: number;
  notes: number;
  roasts: number;
  roastsPosted: number;
  votes: number;
  upvotes: number;
  downvotes: number;
  attempts: number;
  saved: number;
  // Every scored roast, posted or not: the number only the admin can see
  panelMeanAll: number | null;
  scoredAll: number;
  // Posted roasts only, which is what the public page averages
  panelMeanPublic: number | null;
  scoredPublic: number;
};

export function kpis(
  images: ImageRow[],
  captions: CaptionRow[],
  votes: VoteRow[],
  profiles: ProfileRow[],
  attempts: AttemptRow[],
): Kpis {
  const roasts = captions.filter(isRoast);
  const posted = roasts.filter((c) => c.is_public);
  const all = scores(roasts);
  const pub = scores(posted);
  const legacyPhotos = images.filter((i) => i.topic === null).length;
  const upvotes = votes.filter((v) => v.value === 1).length;

  return {
    users: profiles.length,
    roastPhotos: images.length - legacyPhotos,
    legacyPhotos,
    notes: images.filter((i) => i.has_note).length,
    roasts: roasts.length,
    roastsPosted: posted.length,
    votes: votes.length,
    upvotes,
    downvotes: votes.length - upvotes,
    attempts: attempts.length,
    saved: savedAttempts(attempts, images),
    panelMeanAll: mean1(all),
    scoredAll: all.length,
    panelMeanPublic: mean1(pub),
    scoredPublic: pub.length,
  };
}

// --- The critics -------------------------------------------------------------

export type CriticHarshness = {
  critic: CriticRow;
  n: number;
  scored: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  posted: number;
};

// Harshest (lowest mean) first, ties in panel order, critics with no score last
export function criticHarshness(captions: CaptionRow[], critics: CriticRow[]): CriticHarshness[] {
  const rows = critics.map((critic) => {
    const own = captions.filter((c) => c.critic_id === critic.id);
    const ratings = scores(own);
    return {
      critic,
      n: own.length,
      scored: ratings.length,
      mean: mean1(ratings),
      min: ratings.length ? Math.min(...ratings) : null,
      max: ratings.length ? Math.max(...ratings) : null,
      posted: own.filter((c) => c.is_public).length,
    };
  });
  return rows.sort((a, b) => {
    if (a.mean === null || b.mean === null) {
      if (a.mean !== b.mean) return a.mean === null ? 1 : -1;
    } else if (a.mean !== b.mean) {
      return a.mean - b.mean;
    }
    return byPanelOrder(a.critic, b.critic);
  });
}

export type CharacterRule = {
  id: string;
  // Quoted from the critic's description or the shared roast instructions
  rule: string;
  // null: the rule is in the shared instructions, so it applies to every critic
  criticSlug: string | null;
  test: (content: string) => boolean;
};

// Same tag shape cleanCaption strips: "#" then a word with a letter, so "#1" is fine
const HASHTAG = /#[\p{N}_]*\p{L}/u;

export const CHARACTER_RULES: readonly CharacterRule[] = [
  {
    id: "jaded-no-exclamation",
    rule: "No exclamation points",
    criticSlug: "jaded-new-yorker",
    test: (s) => !s.includes("!"),
  },
  {
    id: "online-lowercase",
    rule: "All lowercase",
    criticSlug: "chronically-online",
    test: (s) => s === s.toLowerCase(),
  },
  {
    id: "margaux-one-sentence",
    rule: "One calm, devastating sentence",
    criticSlug: "margaux",
    // A roast with no terminator at all still reads as one sentence
    test: (s) => sentenceCount(s) <= 1,
  },
  {
    id: "one-emoji",
    rule: "At most one emoji per review",
    criticSlug: null,
    test: (s) => countEmoji(s) <= 1,
  },
  {
    id: "no-hashtags",
    rule: "No hashtags",
    criticSlug: null,
    test: (s) => !HASHTAG.test(s),
  },
];

export type CharacterCheck = {
  id: string;
  rule: string;
  critic: CriticRow | null;
  passed: number;
  total: number;
};

// Every roast, posted or not. A rule for a critic missing from the table is dropped.
export function characterChecks(captions: CaptionRow[], critics: CriticRow[]): CharacterCheck[] {
  const roasts = captions.filter(isRoast);
  return CHARACTER_RULES.flatMap((rule) => {
    const critic = rule.criticSlug === null ? null : critics.find((c) => c.slug === rule.criticSlug);
    if (critic === undefined) return [];
    const scope = critic ? roasts.filter((c) => c.critic_id === critic.id) : roasts;
    return [
      {
        id: rule.id,
        rule: rule.rule,
        critic,
        passed: scope.filter((c) => rule.test(c.content)).length,
        total: scope.length,
      },
    ];
  });
}

export type LeaderboardRow = {
  critic: CriticRow;
  roasts: number;
  posted: number;
  postRate: number | null;
  scored: number;
  avgRating: number | null;
  // Crowd votes on this critic's roasts, minus owners voting on their own posts
  up: number;
  down: number;
  approval: number | null;
  selfVotes: number;
};

// Most roasts written first, ties in panel order
export function criticLeaderboard(
  captions: CaptionRow[],
  votes: VoteRow[],
  critics: CriticRow[],
): LeaderboardRow[] {
  const roastById = new Map(captions.filter(isRoast).map((c) => [c.id, c]));
  const votesByCritic = new Map<number, { up: number; down: number; self: number }>();
  for (const v of votes) {
    const roast = roastById.get(v.caption_id);
    if (!roast || roast.critic_id === null) continue;
    const tally = votesByCritic.get(roast.critic_id) ?? { up: 0, down: 0, self: 0 };
    if (v.user_id === roast.user_id) tally.self++;
    else if (v.value === 1) tally.up++;
    else tally.down++;
    votesByCritic.set(roast.critic_id, tally);
  }

  const rows = critics.map((critic): LeaderboardRow => {
    const own = [...roastById.values()].filter((c) => c.critic_id === critic.id);
    const posted = own.filter((c) => c.is_public).length;
    const ratings = scores(own);
    const { up, down, self } = votesByCritic.get(critic.id) ?? { up: 0, down: 0, self: 0 };
    return {
      critic,
      roasts: own.length,
      posted,
      postRate: own.length ? posted / own.length : null,
      scored: ratings.length,
      avgRating: mean1(ratings),
      up,
      down,
      approval: up + down ? up / (up + down) : null,
      selfVotes: self,
    };
  });
  return rows.sort((a, b) => b.roasts - a.roasts || byPanelOrder(a.critic, b.critic));
}

// --- What owners dare to post --------------------------------------------------

export type RatingBucket = {
  bucket: "0-3" | "4-6" | "7-10" | "unscored";
  label: string;
  total: number;
  posted: number;
};

function bucketOf(rating: number | null): RatingBucket["bucket"] {
  if (rating === null) return "unscored";
  if (rating <= 3) return "0-3";
  if (rating <= 6) return "4-6";
  return "7-10";
}

// Fixed order, harsh to kind, then unscored
export function postRateByRating(captions: CaptionRow[]): RatingBucket[] {
  const buckets: RatingBucket[] = [
    { bucket: "0-3", label: "Harsh 0–3", total: 0, posted: 0 },
    { bucket: "4-6", label: "Middling 4–6", total: 0, posted: 0 },
    { bucket: "7-10", label: "Kind 7–10", total: 0, posted: 0 },
    { bucket: "unscored", label: "Unscored", total: 0, posted: 0 },
  ];
  for (const c of captions.filter(isRoast)) {
    const b = buckets.find((x) => x.bucket === bucketOf(c.rating));
    if (!b) continue;
    b.total++;
    if (c.is_public) b.posted++;
  }
  return buckets;
}

// Minutes from roast to the owner's first Post. posted_at is kept if they later
// unpost, so it still marks the decision.
export function decisionDelays(captions: CaptionRow[]): number[] {
  return captions.flatMap((c) => {
    if (!isRoast(c) || c.posted_at === null) return [];
    const ms = Date.parse(c.posted_at) - Date.parse(c.created_at);
    return [Math.max(0, ms / 60000)];
  });
}

export type PanelInflation = {
  imageId: string;
  topic: string;
  createdAt: string;
  // What the owner saw: every scored roast
  fullScore: number;
  // What everyone else sees: posted scored roasts only
  publicScore: number;
  delta: number;
};

// Posts with at least one posted, scored roast; the biggest boost first
export function panelInflation(images: ImageRow[], captions: CaptionRow[]): PanelInflation[] {
  const roastsByImage = groupBy(captions.filter(isRoast), (c) => c.image_id);
  const rows = images.flatMap((img): PanelInflation[] => {
    if (img.topic === null) return [];
    const own = roastsByImage.get(img.id) ?? [];
    const fullScore = mean1(scores(own));
    const publicScore = mean1(scores(own.filter((c) => c.is_public)));
    if (fullScore === null || publicScore === null) return [];
    return [
      {
        imageId: img.id,
        topic: img.topic,
        createdAt: img.created_at,
        fullScore,
        publicScore,
        delta: round1(publicScore - fullScore),
      },
    ];
  });
  return rows.sort((a, b) => b.delta - a.delta || a.createdAt.localeCompare(b.createdAt));
}

// --- The crowd ---------------------------------------------------------------

export type CrowdRow = {
  captionId: string;
  critic: CriticRow;
  rating: number | null;
  content: string;
  upvotes: number;
  downvotes: number;
  net: number;
};
export type CrowdVerdict = { harshMeanNet: number; kindMeanNet: number; n: number } | null;

// One row per posted roast, best net first, then the kinder score
export function crowdVsCritic(captions: CaptionRow[], critics: CriticRow[]): CrowdRow[] {
  const byId = new Map(critics.map((c) => [c.id, c]));
  const rows = captions.flatMap((c): CrowdRow[] => {
    const critic = c.critic_id === null ? undefined : byId.get(c.critic_id);
    if (!critic || !c.is_public) return [];
    return [
      {
        captionId: c.id,
        critic,
        rating: c.rating,
        content: c.content,
        upvotes: c.upvotes,
        downvotes: c.downvotes,
        net: c.upvotes - c.downvotes,
      },
    ];
  });
  return rows.sort((a, b) => b.net - a.net || (b.rating ?? -1) - (a.rating ?? -1));
}

// Harsh (4 or lower) vs kind (7 or higher), once enough roasts have votes.
// Roasts nobody voted on say nothing about the crowd, so they don't count.
export function crowdVerdict(rows: CrowdRow[], minVoted = 5): CrowdVerdict {
  const voted = rows.filter((r) => r.upvotes + r.downvotes > 0);
  if (voted.length < minVoted) return null;
  const harsh = mean(voted.filter((r) => r.rating !== null && r.rating <= 4).map((r) => r.net));
  const kind = mean(voted.filter((r) => r.rating !== null && r.rating >= 7).map((r) => r.net));
  if (harsh === null || kind === null) return null;
  return { harshMeanNet: round1(harsh), kindMeanNet: round1(kind), n: voted.length };
}

export type EraLedger = {
  era: "legacy" | "roast";
  label: string;
  posted: number;
  up: number;
  down: number;
  // Posted items nobody voted on
  silent: number;
};
export type VoteLedger = { eras: EraLedger[]; votes: number; voters: number; selfVotes: number };

// Up and down come from the trigger-kept counters on posted items
export function voteLedger(captions: CaptionRow[], votes: VoteRow[]): VoteLedger {
  const era = (name: EraLedger["era"], label: string, inEra: (c: CaptionRow) => boolean): EraLedger => {
    const posted = captions.filter((c) => c.is_public && inEra(c));
    return {
      era: name,
      label,
      posted: posted.length,
      up: posted.reduce((sum, c) => sum + c.upvotes, 0),
      down: posted.reduce((sum, c) => sum + c.downvotes, 0),
      silent: posted.filter((c) => c.upvotes + c.downvotes === 0).length,
    };
  };
  const ownerOf = new Map(captions.map((c) => [c.id, c.user_id]));

  return {
    eras: [
      era("roast", "Roasts", isRoast),
      era("legacy", "Legacy captions (before Oct 15)", isLegacyCaption),
    ],
    votes: votes.length,
    voters: new Set(votes.map((v) => v.user_id)).size,
    selfVotes: votes.filter((v) => ownerOf.get(v.caption_id) === v.user_id).length,
  };
}

// --- The pipeline ------------------------------------------------------------

export type PipelineHealth = {
  attempts: number;
  saved: number;
  lost: number;
  lostRate: number | null;
  models: { model: string; count: number }[];
  fallbackShare: { part: number; total: number };
  missingTip: number;
  missingRating: number;
  roasts: number;
  shortPanels: number;
  roastImages: number;
  cappedUsers: number;
};

// The general critics, plus the topic's expert if it has one; null for legacy posts
export function panelSize(topic: string | null, critics: CriticRow[]): number | null {
  if (topic === null) return null;
  const general = critics.filter((c) => c.topic === null).length;
  return general + (critics.some((c) => c.topic === topic) ? 1 : 0);
}

// Did this user ever start DAILY_LIMIT runs inside one rolling 24 hours?
function hitDailyLimit(times: number[]): boolean {
  const sorted = [...times].sort((a, b) => a - b);
  for (let i = 0; i + DAILY_LIMIT - 1 < sorted.length; i++) {
    if (sorted[i + DAILY_LIMIT - 1] - sorted[i] < DAY_MS) return true;
  }
  return false;
}

export function pipelineHealth(
  attempts: AttemptRow[],
  images: ImageRow[],
  captions: CaptionRow[],
  critics: CriticRow[],
): PipelineHealth {
  const roasts = captions.filter(isRoast);
  const saved = savedAttempts(attempts, images);
  const models = [...countBy(roasts, (c) => c.model)]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));

  const roastsPerImage = countBy(roasts, (c) => c.image_id);
  const roastImages = images.filter((i) => i.topic !== null);
  const shortPanels = roastImages.filter((i) => {
    const expected = panelSize(i.topic, critics) ?? 0;
    return (roastsPerImage.get(i.id) ?? 0) < expected;
  }).length;

  const timesByUser = groupBy(attempts, (a) => a.user_id);

  return {
    attempts: attempts.length,
    saved,
    lost: attempts.length - saved,
    lostRate: attempts.length ? (attempts.length - saved) / attempts.length : null,
    models,
    fallbackShare: { part: roasts.filter((c) => /lite/i.test(c.model)).length, total: roasts.length },
    missingTip: roasts.filter((c) => c.tip === null).length,
    missingRating: roasts.filter((c) => c.rating === null).length,
    roasts: roasts.length,
    shortPanels,
    roastImages: roastImages.length,
    cappedUsers: [...timesByUser.values()].filter((own) =>
      hitDailyLimit(own.map((a) => Date.parse(a.created_at))),
    ).length,
  };
}

export type WeekBucket = { weekStart: string; label: string; legacy: number; roast: number };
export type UploadsPerWeek = { weeks: WeekBucket[]; launchedAt: string | null };

const dayFormats = new Map<string, Intl.DateTimeFormat>();

// "YYYY-MM-DD" of the calendar day the instant falls on in `timeZone`
function dayKeyIn(iso: string, timeZone: string): string {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Day keys are plain calendar dates, so stepping them in UTC never meets a DST shift
const keyToUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// The Monday that starts the day's week
function mondayOf(dayKey: string): string {
  const ms = keyToUtc(dayKey);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return utcToKey(ms - sinceMonday * DAY_MS);
}

// Monday weeks in `timeZone`, from the first upload's week through now's, zero-filled
export function uploadsPerWeek(images: ImageRow[], now: Date, timeZone = "America/New_York"): UploadsPerWeek {
  if (images.length === 0) return { weeks: [], launchedAt: null };

  const counts = new Map<string, { legacy: number; roast: number }>();
  for (const img of images) {
    const week = mondayOf(dayKeyIn(img.created_at, timeZone));
    const count = counts.get(week) ?? { legacy: 0, roast: 0 };
    if (img.topic === null) count.legacy++;
    else count.roast++;
    counts.set(week, count);
  }

  const first = [...counts.keys()].sort()[0];
  const nowWeek = mondayOf(dayKeyIn(now.toISOString(), timeZone));
  const last = nowWeek > first ? nowWeek : first;
  const weeks: WeekBucket[] = [];
  for (let ms = keyToUtc(first); ms <= keyToUtc(last); ms += 7 * DAY_MS) {
    const weekStart = utcToKey(ms);
    weeks.push({ weekStart, label: dayLabel(weekStart), ...(counts.get(weekStart) ?? { legacy: 0, roast: 0 }) });
  }

  const roastTimes = images.filter((i) => i.topic !== null).map((i) => i.created_at);
  const launchedAt = roastTimes.length
    ? roastTimes.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a))
    : null;
  return { weeks, launchedAt };
}

export type TopicRow = {
  topic: Topic | "legacy";
  label: string;
  emoji: string;
  posts: number;
  roasts: number;
  publicRoasts: number;
  scored: number;
  avgRating: number | null;
};

// One row per topic in TOPICS order, then the legacy caption posts
export function topicBreakdown(images: ImageRow[], captions: CaptionRow[]): TopicRow[] {
  const roastsByImage = groupBy(captions.filter(isRoast), (c) => c.image_id);

  const row = (topic: TopicRow["topic"], label: string, emoji: string, own: ImageRow[]): TopicRow => {
    const roasts = own.flatMap((i) => roastsByImage.get(i.id) ?? []);
    const ratings = scores(roasts);
    return {
      topic,
      label,
      emoji,
      posts: own.length,
      roasts: roasts.length,
      publicRoasts: roasts.filter((c) => c.is_public).length,
      scored: ratings.length,
      avgRating: mean1(ratings),
    };
  };

  return [
    ...TOPICS.map((t) => row(t.slug, t.label, t.emoji, images.filter((i) => i.topic === t.slug))),
    row("legacy", "Legacy caption posts", "", images.filter((i) => i.topic === null)),
  ];
}
