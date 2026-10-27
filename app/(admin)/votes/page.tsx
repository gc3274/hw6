import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import RatingPill from "@/components/RatingPill";
import Thumb from "@/components/Thumb";
import { errorBox, focusRing, input, label, textLink } from "@/components/ui";
import type { CriticOption } from "@/lib/data/media";
import { listRatings, listVotes, type RatingRow } from "@/lib/data/votes";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { hrefWith, parseVoteQuery, type VoteQuery } from "@/lib/params";
import { topicInfo, TOPICS } from "@/lib/roasts";
import type { LedgerVote } from "@/lib/votes";

export const metadata: Metadata = {
  title: "Votes & ratings",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});


const VIEWS = [
  { view: "votes", label: "Votes" },
  { view: "ratings", label: "Critic ratings" },
] as const;

// The unfiltered list for a view: /votes or /votes?view=ratings
const viewHref = (view: VoteQuery["view"]) => hrefWith("/votes", {}, { view });

// Each view reads only its own filters; the others stay in the URL but do nothing
const isNarrowed = (q: VoteQuery) =>
  q.view === "votes" ? q.value !== null || q.critic !== null : q.critic !== null || q.topic !== null;

const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

export default async function VotesPage({ searchParams }: PageProps<"/votes">) {
  await requireSuperadmin();

  const query = parseVoteQuery(await searchParams);

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Votes &amp; ratings</h1>
      <p className="mt-2 max-w-prose text-muted">
        Read only. Votes are what people in the app think of each posted roast; critic ratings are
        the 0 to 10 scores the panel gave each photo.
      </p>

      <ViewTabs query={query} />

      {query.view === "votes" ? <VotesView query={query} /> : <RatingsView query={query} />}
    </>
  );
}

function ViewTabs({ query }: { query: VoteQuery }) {
  return (
    <nav aria-label="View" className="mt-6">
      <ul className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
        {VIEWS.map(({ view, label: text }) => {
          const active = query.view === view;
          return (
            <li key={view}>
              {/* The critic filter means the same thing in both views, so it carries over */}
              <Link
                href={hrefWith("/votes", { critic: query.critic }, { view })}
                aria-current={active ? "page" : undefined}
                className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${
                  active ? "bg-accent/10 text-accent" : "text-muted hover:bg-canvas hover:text-ink"
                } ${focusRing}`}
              >
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CriticSelect({ query, critics }: { query: VoteQuery; critics: CriticOption[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={label}>Critic</span>
      <select name="critic" defaultValue={query.critic ?? ""} className={input}>
        <option value="">Any critic</option>
        {critics.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.emoji} {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// Shared by both views: a page past the end, then filters that match nothing,
// then the real empty state
function NoRows({
  query,
  total,
  noun,
  empty,
}: {
  query: VoteQuery;
  total: number;
  noun: string;
  empty: { title: string; body: string };
}) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/votes", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (isNarrowed(query)) {
    return (
      <EmptyState
        title={`No ${noun} match these filters.`}
        action={{ href: viewHref(query.view), label: "Clear filters" }}
      />
    );
  }
  return <EmptyState title={empty.title}>{empty.body}</EmptyState>;
}

const loadError = (what: string) => (
  <p className={`${errorBox} mt-6`}>
    The {what} couldn’t load. The database didn’t answer, or this server is missing its service key.
    Reload the page to try again.
  </p>
);

function CriticName({ critic }: { critic: { name: string; emoji: string } }) {
  return (
    <span className="font-medium">
      <span aria-hidden="true">{critic.emoji}</span> {critic.name}
    </span>
  );
}

// Votes ---------------------------------------------------------------------

async function VotesView({ query }: { query: VoteQuery }) {
  let result: { rows: LedgerVote[]; total: number; critics: CriticOption[] } | null = null;
  try {
    result = await listVotes(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the votes failed", error);
  }

  return (
    <>
      <div className="mt-6">
        <FilterBar key={hrefWith("/votes", query)} action="/votes" showClear={isNarrowed(query)}>
          <label className="flex flex-col gap-1">
            <span className={label}>Vote</span>
            <select name="value" defaultValue={query.value ?? ""} className={input}>
              <option value="">Up and down</option>
              <option value="up">Upvotes</option>
              <option value="down">Downvotes</option>
            </select>
          </label>
          <CriticSelect query={query} critics={result?.critics ?? []} />
        </FilterBar>
      </div>

      {result ? <VotesTable query={query} rows={result.rows} total={result.total} /> : loadError("votes")}
    </>
  );
}

function VotesTable({ query, rows, total }: { query: VoteQuery; rows: LedgerVote[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows
          query={query}
          total={total}
          noun="votes"
          empty={{
            title: "No votes yet.",
            body: "Votes appear when people vote on public roasts in the app.",
          }}
        />
      </div>
    );
  }

  return (
    <section aria-labelledby="votes-count" className="mt-6">
      <p id="votes-count" className="text-sm text-muted">
        {`${nouns(total, "vote")}${isNarrowed(query) ? " match" : ""}, newest first`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Voter</th>
              <th scope="col" className={th}>Vote</th>
              <th scope="col" className={th}>On the roast</th>
              <th scope="col" className={th}>Cast</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <VoteRow key={`${v.captionId}:${v.voter.id}`} vote={v} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted">
        A self-vote is one cast by the person who posted the photo. The app allows it, and the
        overview leaves these out of crowd approval. Times are New York time.
      </p>
      <div className="mt-6">
        <Pagination pathname="/votes" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function VoteRow({ vote }: { vote: LedgerVote }) {
  const topic = topicInfo(vote.topic);
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th scope="row" className="max-w-56 py-3 pr-4 text-left font-normal">
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/users/${vote.voter.id}`} className={`break-words ${textLink}`}>
            {vote.voter.name ?? "No name yet"}
          </Link>
          {vote.selfVote && <Badge>Self-vote</Badge>}
        </span>
      </th>
      <td className="py-3 pr-4">
        <Badge tone={vote.value === 1 ? "accent" : "neutral"}>{vote.value === 1 ? "Up" : "Down"}</Badge>
      </td>
      <td className="py-3 pr-4">
        <div className="min-w-72">
          <p className="flex flex-wrap items-center gap-2">
            {vote.critic ? <CriticName critic={vote.critic} /> : <Badge>Legacy caption</Badge>}
            {topic && <span className="text-muted">{topic.label} post</span>}
          </p>
          <Link href={`/media/${vote.captionId}`} className={`mt-1 line-clamp-2 ${textLink}`}>
            {vote.content}
          </Link>
        </div>
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <time dateTime={vote.createdAt}>{DATE_TIME.format(new Date(vote.createdAt))}</time>
      </td>
    </tr>
  );
}

// Ratings -------------------------------------------------------------------

async function RatingsView({ query }: { query: VoteQuery }) {
  let result: { rows: RatingRow[]; total: number; critics: CriticOption[] } | null = null;
  try {
    result = await listRatings(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the ratings failed", error);
  }

  return (
    <>
      <div className="mt-6">
        <FilterBar
          key={hrefWith("/votes", query)}
          action="/votes"
          clearHref={viewHref("ratings")}
          showClear={isNarrowed(query)}
        >
          {/* A GET form sends only its fields, so the view has to be one of them */}
          <input type="hidden" name="view" value="ratings" />
          <CriticSelect query={query} critics={result?.critics ?? []} />
          <label className="flex flex-col gap-1">
            <span className={label}>Topic</span>
            <select name="topic" defaultValue={query.topic ?? ""} className={input}>
              <option value="">Any topic</option>
              {TOPICS.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </label>
        </FilterBar>
      </div>

      {result ? <RatingsTable query={query} rows={result.rows} total={result.total} /> : loadError("ratings")}
    </>
  );
}

function RatingsTable({ query, rows, total }: { query: VoteQuery; rows: RatingRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows
          query={query}
          total={total}
          noun="scored roasts"
          empty={{
            title: "No scored roasts yet.",
            body: "Scores appear after someone posts a photo in the app and the panel roasts it.",
          }}
        />
      </div>
    );
  }

  return (
    <section aria-labelledby="ratings-count" className="mt-6">
      <p id="ratings-count" className="text-sm text-muted">
        {`${nouns(total, "scored roast")}${isNarrowed(query) ? " match" : ""}, highest score first`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Roast</th>
              <th scope="col" className={th}>Score</th>
              <th scope="col" className={th}>Visibility</th>
              <th scope="col" className={`${th} text-right`}>Votes</th>
              <th scope="col" className={th}>Written</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RatingTableRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Only roasts the critic scored are listed. Legacy captions never had a score.
      </p>
      <div className="mt-6">
        <Pagination pathname="/votes" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function RatingTableRow({ row }: { row: RatingRow }) {
  const topic = topicInfo(row.topic);
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th scope="row" className="py-3 pr-4 text-left font-normal">
        <div className="flex min-w-72 gap-3">
          <Thumb src={row.imageUrl} alt={topic ? `${topic.label} post` : "Post"} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              {row.critic ? <CriticName critic={row.critic} /> : <span className="text-muted">Unknown critic</span>}
              {topic && <span className="text-muted">{topic.label} post</span>}
            </p>
            <Link href={`/media/${row.id}`} className={`mt-1 line-clamp-2 ${textLink}`}>
              {row.content}
            </Link>
          </div>
        </div>
      </th>
      <td className="py-3 pr-4">
        <RatingPill rating={row.rating} />
      </td>
      <td className="py-3 pr-4">
        {row.isPublic ? <Badge tone="accent">Public</Badge> : <Badge>Private</Badge>}
      </td>
      <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums">
        {row.upvotes} up, {row.downvotes} down
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <time dateTime={row.createdAt}>{DATE.format(new Date(row.createdAt))}</time>
      </td>
    </tr>
  );
}
