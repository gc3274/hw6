import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { button, errorBox, input, label, noticeBox, textLink } from "@/components/ui";
import { TERMS_MAX } from "@/lib/chains";
import { listTerms, type TermRow } from "@/lib/data/terms";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { hrefWith } from "@/lib/params";
import { TOPICS } from "@/lib/roasts";
import { parseTermQuery, topicLabel, type TermQuery } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms",
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

export default async function TermsPage({ searchParams }: PageProps<"/terms">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseTermQuery(sp);
  let result: { rows: TermRow[]; total: number } | null = null;
  try {
    result = await listTerms(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the terms failed", error);
  }

  // Set by deleteTerm's redirect; they only change the banner above the list
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Terms</h1>
        <Link href="/terms/new" className={button("secondary")}>
          Add a term
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Words the critics can use. Each roast’s prompt gets up to {TERMS_MAX} terms for its photo’s
        topic, every-topic terms included, highest priority first. Changes apply from the next roast.
      </p>

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That term was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Term deleted. It’s left out of prompts from the next roast.
        </p>
      )}

      {/* Keyed on the query, so Clear filters also clears the fields */}
      <div key={hrefWith("/terms", query)} className="mt-6">
        <Filters query={query} />
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The terms couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

const isFiltered = (q: TermQuery) => q.topic !== null || q.q !== null;

function Filters({ query }: { query: TermQuery }) {
  return (
    <FilterBar action="/terms" showClear={isFiltered(query)}>
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className={label}>Search</span>
        <input
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          maxLength={60}
          placeholder="Term or definition"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Topic</span>
        <select name="topic" defaultValue={query.topic ?? ""} className={input}>
          <option value="">All terms</option>
          <option value="general">Every topic</option>
          {TOPICS.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.emoji} {t.label}
            </option>
          ))}
        </select>
      </label>
    </FilterBar>
  );
}

function Results({ query, rows, total }: { query: TermQuery; rows: TermRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="terms-count" className="mt-6">
      <p id="terms-count" className="text-sm text-muted">
        {`${nouns(total, "term")}${isFiltered(query) ? (total === 1 ? " matches" : " match") : ""}, highest priority first`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Term</th>
              <th scope="col" className={th}>Definition</th>
              <th scope="col" className={th}>Topic</th>
              <th scope="col" className={`${th} text-right`}>Priority</th>
              <th scope="col" className={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <th scope="row" className="max-w-56 py-3 pr-4 text-left font-normal break-words">
                  <Link href={`/terms/${r.id}`} className={textLink}>
                    {r.term}
                  </Link>
                </th>
                <td className="min-w-64 py-3 pr-4">
                  <p className="line-clamp-2 text-muted">{r.definition}</p>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">{topicLabel(r.topic)}</td>
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
        <Pagination pathname="/terms" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function NoRows({ query, total }: { query: TermQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/terms", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (isFiltered(query)) {
    return <EmptyState title="No terms match these filters." action={{ href: "/terms", label: "Clear filters" }} />;
  }
  return (
    <EmptyState title="No terms yet." action={{ href: "/terms/new", label: "Add a term" }}>
      Until you add some, prompts go out with no glossary.
    </EmptyState>
  );
}
