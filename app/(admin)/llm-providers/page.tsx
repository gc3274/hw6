import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import { button, errorBox, noticeBox, textLink } from "@/components/ui";
import { listProviders, type ProviderRow } from "@/lib/data/llm";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { isCallable, parseProviderQuery, type ProviderQuery } from "@/lib/llm";
import { hrefWith } from "@/lib/params";

export const metadata: Metadata = {
  title: "LLM providers",
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

export default async function ProvidersPage({ searchParams }: PageProps<"/llm-providers">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseProviderQuery(sp);
  let result: { rows: ProviderRow[]; total: number } | null = null;
  try {
    result = await listProviders(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the providers failed", error);
  }

  // Set by deleteProvider's redirect
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">LLM providers</h1>
        <Link href="/llm-providers/new" className={button("secondary")}>
          Add a provider
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        The companies whose models the prompt chain steps call. The app matches a provider by its
        slug and only has a client for “google”.
      </p>

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That provider was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Provider deleted.
        </p>
      )}

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The providers couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Results({ query, rows, total }: { query: ProviderQuery; rows: ProviderRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        {total > 0 ? (
          // A hand-typed ?page= past the last page
          <EmptyState
            title={`Page ${query.page} is past the end of the list.`}
            action={{ href: hrefWith("/llm-providers", query, { page: 1 }), label: "Go to page 1" }}
          />
        ) : (
          <EmptyState title="No providers yet." action={{ href: "/llm-providers/new", label: "Add a provider" }}>
            Add “google” first: it’s the only provider the app can call.
          </EmptyState>
        )}
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="providers-count" className="mt-6">
      <p id="providers-count" className="text-sm text-muted">
        {nouns(total, "provider")}, by name
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Name</th>
              <th scope="col" className={th}>Slug</th>
              <th scope="col" className={`${th} text-right`}>Models</th>
              <th scope="col" className={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/llm-providers/${r.id}`} className={`break-words ${textLink}`}>
                      {r.name}
                    </Link>
                    {isCallable(r.slug) && <Badge tone="accent">Callable by the app</Badge>}
                  </div>
                </th>
                <td className="py-3 pr-4">
                  <code className="text-xs break-all">{r.slug}</code>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{r.models.toLocaleString("en-US")}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={r.updatedAt}>{DATE.format(new Date(r.updatedAt))}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <Pagination pathname="/llm-providers" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}
