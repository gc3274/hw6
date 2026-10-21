import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import RatingPill from "@/components/RatingPill";
import Thumb from "@/components/Thumb";
import { button, errorBox, input, label, noticeBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import { listMedia, type CriticOption, type MediaRow } from "@/lib/data/media";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { hrefWith, parseMediaQuery, type MediaQuery } from "@/lib/params";
import { topicInfo, TOPICS } from "@/lib/roasts";

export const metadata: Metadata = {
  title: "Roasts",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const NOUNS: Record<MediaQuery["kind"], [string, string]> = {
  roast: ["roast", "roasts"],
  legacy: ["legacy caption", "legacy captions"],
  all: ["roast or caption", "roasts and captions"],
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MediaPage({ searchParams }: PageProps<"/media">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseMediaQuery(sp);
  let result: { rows: MediaRow[]; total: number; critics: CriticOption[] } | null = null;
  try {
    result = await listMedia(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the roasts failed", error);
  }

  // Set by deleteRoast's redirect; they only change the banner above the list
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";
  const emptyPost = deleted && isUuid(first(sp.emptyPost));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Roasts</h1>
        <Link href="/media/new" className={button("secondary")}>
          Generate a roast
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        AI-generated roasts written by the critic panel. Open one to edit its words, score or
        visibility, or to delete it.
      </p>

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That roast was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Deleted, along with its votes.
          {emptyPost && " That post has no roasts left, so it’s hidden from the public app."}
        </p>
      )}

      <div className="mt-6">
        <Filters query={query} critics={result?.critics ?? []} />
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The roasts couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

// Filters within the chosen kind
const isNarrowed = (q: MediaQuery) =>
  q.critic !== null || q.topic !== null || q.visibility !== null || q.owner !== null || q.image !== null;

// True when the list is anything but the default "every roast"
const isFiltered = (q: MediaQuery) => q.kind !== "roast" || isNarrowed(q);

function Filters({ query, critics }: { query: MediaQuery; critics: CriticOption[] }) {
  return (
    <FilterBar action="/media" showClear={isFiltered(query)}>
      {/* Set from a user's or post's page; kept when the other filters change */}
      {query.owner && <input type="hidden" name="owner" value={query.owner} />}
      {query.image && <input type="hidden" name="image" value={query.image} />}
      <label className="flex flex-col gap-1">
        <span className={label}>Show</span>
        <select name="kind" defaultValue={query.kind} className={input}>
          <option value="roast">Roasts</option>
          <option value="legacy">Legacy captions</option>
          <option value="all">Roasts and legacy captions</option>
        </select>
      </label>
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
      <label className="flex flex-col gap-1">
        <span className={label}>Topic</span>
        <select name="topic" defaultValue={query.topic ?? ""} className={input}>
          <option value="">Any topic</option>
          {TOPICS.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.emoji} {t.label}
            </option>
          ))}
          <option value="legacy">No topic (legacy)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Visibility</span>
        <select name="visibility" defaultValue={query.visibility ?? ""} className={input}>
          <option value="">Public or private</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
    </FilterBar>
  );
}

function Results({ query, rows, total }: { query: MediaQuery; rows: MediaRow[]; total: number }) {
  // owner and image come from links on the users pages, not from the filter fields
  const scope = (query.owner || query.image) && (
    <div className="mt-6 space-y-1 text-sm text-muted">
      {query.owner && (
        <p>
          Showing one person’s posts.{" "}
          <Link href={hrefWith("/media", query, { owner: null })} className={textLink}>
            Show everyone’s
          </Link>
        </p>
      )}
      {query.image && (
        <p>
          Showing one post.{" "}
          <Link href={hrefWith("/media", query, { image: null })} className={textLink}>
            Show every post
          </Link>
        </p>
      )}
    </div>
  );

  if (rows.length === 0) {
    return (
      <>
        {scope}
        <div className="mt-6">
          <NoRows query={query} total={total} />
        </div>
      </>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <>
      {scope}
      <section aria-labelledby="media-count" className="mt-6">
        <p id="media-count" className="text-sm text-muted">
          {`${nouns(total, ...NOUNS[query.kind])}${isNarrowed(query) ? (total === 1 ? " matches" : " match") : ""}, newest first`}
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className={th}>Roast</th>
                <th scope="col" className={th}>Score</th>
                <th scope="col" className={th}>Visibility</th>
                <th scope="col" className={`${th} text-right`}>Votes</th>
                <th scope="col" className={th}>Owner</th>
                <th scope="col" className={th}>Written</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6">
          <Pagination pathname="/media" query={query} page={query.page} total={total} />
        </div>
      </section>
    </>
  );
}

function Row({ row }: { row: MediaRow }) {
  const topic = topicInfo(row.topic);
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th scope="row" className="py-3 pr-4 text-left font-normal">
        <div className="flex min-w-72 gap-3">
          <Thumb src={row.imageUrl} alt={topic ? `${topic.label} post` : "Legacy caption post"} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {row.critic ? (
                <span className="font-medium">
                  <span aria-hidden="true">{row.critic.emoji}</span> {row.critic.name}
                </span>
              ) : (
                <>
                  <Badge>Legacy caption</Badge>
                  {row.flavor && <span className="text-muted">{row.flavor}</span>}
                </>
              )}
              {topic && <span className="text-muted">{topic.label} post</span>}
            </p>
            <Link href={`/media/${row.id}`} className={`mt-1 line-clamp-2 ${textLink}`}>
              {row.content}
            </Link>
          </div>
        </div>
      </th>
      <td className="py-3 pr-4">
        {row.critic ? <RatingPill rating={row.rating} /> : <span className="text-muted">None</span>}
      </td>
      <td className="py-3 pr-4">
        {row.isPublic ? <Badge tone="accent">Public</Badge> : <Badge>Private</Badge>}
      </td>
      <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums">
        {row.upvotes} up, {row.downvotes} down
      </td>
      <td className="max-w-48 py-3 pr-4 break-words">
        <Link href={`/users/${row.owner.id}`} className={textLink}>
          {row.owner.name ?? "No name yet"}
        </Link>
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <time dateTime={row.createdAt}>{DATE.format(new Date(row.createdAt))}</time>
      </td>
    </tr>
  );
}

function NoRows({ query, total }: { query: MediaQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/media", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (isNarrowed(query)) {
    return (
      <EmptyState
        title={`No ${NOUNS[query.kind][1]} match these filters.`}
        action={{ href: "/media", label: "Clear filters" }}
      />
    );
  }
  if (query.kind === "legacy") {
    return <EmptyState title="No legacy captions.">Captions from before roast mode appear here.</EmptyState>;
  }
  return (
    <EmptyState title="No roasts yet." action={{ href: "/media/new", label: "Generate a roast" }}>
      Roasts appear here after someone uploads a photo in the app.
    </EmptyState>
  );
}
