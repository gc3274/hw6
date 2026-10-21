// Pure helpers for the votes page. The rows come from lib/data/votes.ts.

type Voice = { name: string; emoji: string };

// One caption_votes row with the roast it was cast on, as lib/data/votes.ts selects it
export type LedgerSource = {
  caption_id: string;
  user_id: string;
  value: -1 | 1;
  created_at: string;
  captions: {
    content: string;
    // The post owner: a caption's user_id is the uploader, not the critic
    user_id: string;
    critic_id: number | null;
    critics: Voice | null;
    images: { topic: string | null } | null;
  };
};

export type LedgerVote = {
  captionId: string;
  voter: { id: string; name: string | null };
  value: -1 | 1;
  createdAt: string;
  content: string;
  // null on a legacy caption
  critic: Voice | null;
  topic: string | null;
  // The voter owns the post the roast is on. The app allows it; the stats
  // leave these out of crowd approval.
  selfVote: boolean;
};

// Same order as given; names maps a voter id to their profile name
export function ledgerRows(rows: LedgerSource[], names: Map<string, string | null>): LedgerVote[] {
  return rows.map((r) => ({
    captionId: r.caption_id,
    voter: { id: r.user_id, name: names.get(r.user_id) ?? null },
    value: r.value,
    createdAt: r.created_at,
    content: r.captions.content,
    critic: r.captions.critic_id === null ? null : r.captions.critics,
    topic: r.captions.images?.topic ?? null,
    selfVote: r.user_id === r.captions.user_id,
  }));
}
