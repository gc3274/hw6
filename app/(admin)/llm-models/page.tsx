import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { button, errorBox, input, label, noticeBox, textLink } from "@/components/ui";
import { listModels, type ModelRow, type ProviderOption } from "@/lib/data/llm";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { isCallable, parseModelQuery, thinkingLabel, type ModelQuery } from "@/lib/llm";
import { hrefWith } from "@/lib/params";

export const metadata: Metadata = {
  title: "LLM models",
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

type Loaded = { rows: ModelRow[]; total: number; providers: ProviderOption[] };

export default async function ModelsPage({ searchParams }: PageProps<"/llm-models">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseModelQuery(sp);
  let result: Loaded | null = null;
  try {
    result = await listModels(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the models failed", error);
  }

  // Set by deleteModel's redirect
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">LLM models</h1>
        <Link href="/llm-models/new" className={button("secondary")}>
          Add a model
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        The models prompt chain steps call. Editing a model’s ID changes what its steps call on the
        next roast run.
      </p>

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That model was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Model deleted. Its logged responses keep the model ID they called.
        </p>
      )}

      {/* Keyed by the URL, so "Clear filters" also resets the fields */}
      <div key={hrefWith("/llm-models", query)} className="mt-6">
        <Filters query={query} providers={result?.providers ?? []} />
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The models couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Filters({ query, providers }: { query: ModelQuery; providers: ProviderOption[] }) {
  return (
    <FilterBar action="/llm-models" showClear={query.provider !== null}>
      <label className="flex flex-col gap-1">
        <span className={label}>Provider</span>
        <select name="provider" defaultValue={query.provider ?? ""} className={input}>
          <option value="">Any provider</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </FilterBar>
  );
}

function Results({ query, rows, total }: { query: ModelQuery; rows: ModelRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="models-count" className="mt-6">
      <p id="models-count" className="text-sm text-muted">
        {`${nouns(total, "model")}${query.provider !== null ? (total === 1 ? " matches" : " match") : ""}, by name`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-4xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Name</th>
              <th scope="col" className={th}>Provider</th>
              <th scope="col" className={th}>Model ID</th>
              <th scope="col" className={th}>Temperature</th>
              <th scope="col" className={th}>Thinking level</th>
              <th scope="col" className={th}>Used by</th>
              <th scope="col" className={th}>Updated</th>
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
        <Pagination pathname="/llm-models" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function Row({ row }: { row: ModelRow }) {
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th scope="row" className="max-w-56 py-3 pr-4 text-left font-normal">
        <Link href={`/llm-models/${row.id}`} className={`break-words ${textLink}`}>
          {row.name}
        </Link>
      </th>
      <td className="max-w-48 py-3 pr-4">
        {row.provider ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/llm-providers/${row.provider.id}`} className={`break-words ${textLink}`}>
              {row.provider.name}
            </Link>
            {!isCallable(row.provider.slug) && <Badge tone="danger">Not callable</Badge>}
          </div>
        ) : (
          <span className="text-muted">Unknown</span>
        )}
      </td>
      <td className="max-w-56 py-3 pr-4">
        <code className="text-xs break-all">{row.providerModelId}</code>
      </td>
      <td className="py-3 pr-4">{row.temperatureSupported ? "Yes" : "No"}</td>
      <td className="py-3 pr-4 whitespace-nowrap">{thinkingLabel(row.thinkingLevel)}</td>
      <td className="py-3 pr-4 whitespace-nowrap">
        {row.steps === 0 ? <span className="text-muted">No steps</span> : `${nouns(row.steps, "step")}`}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <time dateTime={row.updatedAt}>{DATE.format(new Date(row.updatedAt))}</time>
      </td>
    </tr>
  );
}

function NoRows({ query, total }: { query: ModelQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/llm-models", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (query.provider !== null) {
    return (
      <EmptyState title="No models match these filters." action={{ href: "/llm-models", label: "Clear filters" }}>
        That provider has no models yet, or no longer exists.
      </EmptyState>
    );
  }
  return (
    <EmptyState title="No models yet." action={{ href: "/llm-models/new", label: "Add a model" }}>
      Chain steps can only call a model listed here.
    </EmptyState>
  );
}
