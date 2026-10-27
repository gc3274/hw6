import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import RatingPill from "@/components/RatingPill";
import { button, errorBox, input, label, noticeBox, textLink } from "@/components/ui";
import { EXAMPLES_MAX } from "@/lib/chains";
import { listExamples, type ExampleRow } from "@/lib/data/examples";
import { requireSuperadmin } from "@/lib/dal";
import { parseExampleQuery, type ExampleQuery } from "@/lib/examples";
import { nouns } from "@/lib/format";
import { hrefWith } from "@/lib/params";
import { TOPICS } from "@/lib/roasts";
import { topicLabel } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Example reviews",
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

export default async function ExamplesPage({ searchParams }: PageProps<"/examples">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseExampleQuery(sp);
  let result: { rows: ExampleRow[]; total: number } | null = null;
  try {
    result = await listExamples(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the example reviews failed", error);
  }

  // Set by deleteExample's redirect; they only change the banner above the list
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Example reviews</h1>
        <Link href="/examples/new" className={button("secondary")}>
          Add an example
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Example reviews show the critics the tone and how harsh to score. Each roast’s prompt gets up
        to {EXAMPLES_MAX} for its photo’s topic, every-topic examples included, highest priority
        first, and tells the model never to copy them. Changes apply from the next roast.
      </p>

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That example was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Example deleted. It’s left out of prompts from the next roast.
        </p>
      )}

      {/* Keyed on the query, so Clear filters also clears the field */}
      <div key={hrefWith("/examples", query)} className="mt-6">
        <FilterBar action="/examples" showClear={query.topic !== null}>
          <label className="flex flex-col gap-1">
            <span className={label}>Topic</span>
            <select name="topic" defaultValue={query.topic ?? ""} className={input}>
              <option value="">All examples</option>
              <option value="general">Every topic</option>
              {TOPICS.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </label>
        </FilterBar>
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The example reviews couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Results({ query, rows, total }: { query: ExampleQuery; rows: ExampleRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";
  const filtered = query.topic !== null;

  return (
    <section aria-labelledby="examples-count" className="mt-6">
      <p id="examples-count" className="text-sm text-muted">
        {`${nouns(total, "example")}${filtered ? (total === 1 ? " matches" : " match") : ""}, highest priority first`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Topic</th>
              <th scope="col" className={th}>Roast</th>
              <th scope="col" className={th}>Score</th>
              <th scope="col" className={`${th} text-right`}>Priority</th>
              <th scope="col" className={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="py-3 pr-4 whitespace-nowrap">{topicLabel(r.topic)}</td>
                <th scope="row" className="min-w-72 py-3 pr-4 text-left font-normal">
                  <Link href={`/examples/${r.id}`} className={`line-clamp-2 ${textLink}`}>
                    {r.roast}
                  </Link>
                </th>
                <td className="py-3 pr-4">
                  <RatingPill rating={r.score} />
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{r.priority}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={r.updatedAt}>{DATE.format(new Date(r.updatedAt))}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <Pagination pathname="/examples" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function NoRows({ query, total }: { query: ExampleQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/examples", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (query.topic !== null) {
    return (
      <EmptyState title="No examples match this topic." action={{ href: "/examples", label: "Clear filters" }} />
    );
  }
  return (
    <EmptyState title="No example reviews yet." action={{ href: "/examples/new", label: "Add an example" }}>
      Until you add some, the critics get only the written rules for tone and scoring.
    </EmptyState>
  );
}
