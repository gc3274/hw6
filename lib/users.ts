// Pure helpers for the users pages. The rows come from lib/data/users.ts.

export type ActivityImage = { user_id: string; topic: string | null };
export type ActivityCaption = { user_id: string; is_public: boolean; critic_id: number | null };
export type ActivityVote = { user_id: string };

// Per user: roast posts they uploaded, roasts written on those posts (and how many
// they posted), and votes they cast. Legacy caption posts and captions don't count.
export type UserActivity = { posts: number; roasts: number; publicRoasts: number; votesCast: number };

// Every id gets a row, zeros included; rows for anyone else are ignored
export function userActivity(
  ids: string[],
  images: ActivityImage[],
  captions: ActivityCaption[],
  votes: ActivityVote[],
): Record<string, UserActivity> {
  const out: Record<string, UserActivity> = {};
  for (const id of ids) out[id] = { posts: 0, roasts: 0, publicRoasts: 0, votesCast: 0 };

  for (const img of images) {
    if (img.topic !== null && out[img.user_id]) out[img.user_id].posts++;
  }
  for (const c of captions) {
    const row = out[c.user_id];
    if (c.critic_id === null || !row) continue;
    row.roasts++;
    if (c.is_public) row.publicRoasts++;
  }
  for (const v of votes) {
    if (out[v.user_id]) out[v.user_id].votesCast++;
  }
  return out;
}

// "Ada Lovelace", or null before onboarding. Never falls back to the email:
// profiles.email is user-supplied, so it can't stand in for who someone is.
export function fullName(first: string | null, last: string | null): string | null {
  return [first, last].map((s) => s?.trim()).filter(Boolean).join(" ") || null;
}
