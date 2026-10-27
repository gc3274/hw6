import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import Thumb from "@/components/Thumb";
import { button, errorBox, input, label, noticeBox, textLink } from "@/components/ui";
import { listImages, type ImageRow } from "@/lib/data/images";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { parseImageQuery, type ImageQuery } from "@/lib/images";
import { hrefWith } from "@/lib/params";
import { topicInfo, TOPICS } from "@/lib/roasts";

export const metadata: Metadata = {
  title: "Images",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ImagesPage({ searchParams }: PageProps<"/images">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseImageQuery(sp);
  let result: { rows: ImageRow[]; total: number } | null = null;
  try {
    result = await listImages(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the photos failed", error);
  }

  // Set by deleteImage's redirect
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Images</h1>
        <Link href="/images/new" className={button("secondary")}>
          Upload a photo
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        The photos people post for roasting, plus legacy photos from before roast mode. Open one to
        see its roasts, edit its note or topic, or delete it.
      </p>

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That photo was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Photo deleted, along with its roasts and their votes.
        </p>
      )}

      <div className="mt-6">
        <FilterBar action="/images" showClear={query.topic !== null}>
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
        </FilterBar>
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The photos couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Results({ query, rows, total }: { query: ImageQuery; rows: ImageRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="images-count" className="mt-6">
      <p id="images-count" className="text-sm text-muted">
        {`${nouns(total, "photo")}${query.topic !== null ? (total === 1 ? " matches" : " match") : ""}, newest first`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Photo</th>
              <th scope="col" className={th}>Owner</th>
              <th scope="col" className={`${th} text-right`}>Roasts</th>
              <th scope="col" className={th}>Has a note</th>
              <th scope="col" className={th}>Uploaded</th>
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
        <Pagination pathname="/images" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function Row({ row }: { row: ImageRow }) {
  const topic = topicInfo(row.topic);
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th scope="row" className="py-3 pr-4 text-left font-normal">
        <Link
          href={`/images/${row.id}`}
          className={`flex w-fit items-center gap-3 ${textLink}`}
        >
          <Thumb src={row.imageUrl} alt="" />
          {topic ? (
            <span>
              <span aria-hidden="true">{topic.emoji}</span> {topic.label} photo
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>Caption photo</span>
              <Badge>Legacy</Badge>
            </span>
          )}
        </Link>
      </th>
      <td className="max-w-48 py-3 pr-4 break-words">
        <Link href={`/users/${row.owner.id}`} className={textLink}>
          {row.owner.name ?? "No name yet"}
        </Link>
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">{row.roasts.toLocaleString("en-US")}</td>
      <td className="py-3 pr-4">{row.hasNote ? "Yes" : "No"}</td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <time dateTime={row.createdAt}>{DATE.format(new Date(row.createdAt))}</time>
      </td>
    </tr>
  );
}

function NoRows({ query, total }: { query: ImageQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/images", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (query.topic !== null) {
    return (
      <EmptyState title="No photos match these filters." action={{ href: "/images", label: "Clear filters" }} />
    );
  }
  return (
    <EmptyState title="No photos yet." action={{ href: "/images/new", label: "Upload a photo" }}>
      Photos appear here when someone posts one in the app, or when you upload one.
    </EmptyState>
  );
}
