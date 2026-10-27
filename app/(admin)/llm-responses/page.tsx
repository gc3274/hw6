import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { errorBox, input, label, textLink } from "@/components/ui";
import { FALLBACK_MODEL } from "@/lib/chains";
import { listModelOptions, listResponses, type ModelOption, type ResponseRow } from "@/lib/data/requests";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { hrefWith } from "@/lib/params";
import {
  FALLBACK_REASONS,
  formatDuration,
  parseResponseQuery,
  preview,
  RESPONSE_STATUS_INFO,
  RESPONSE_STATUSES,
  type ResponseQuery,
} from "@/lib/requests";

export const metadata: Metadata = {
  title: "LLM responses",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const isFiltered = (q: ResponseQuery) => q.status !== null || q.model !== null || q.fallback !== null;

export default async function LlmResponsesPage({ searchParams }: PageProps<"/llm-responses">) {
  await requireSuperadmin();

  const query = parseResponseQuery(await searchParams);
  let result: { rows: ResponseRow[]; total: number } | null = null;
  let models: ModelOption[] = [];
  try {
    [result, models] = await Promise.all([listResponses(query), listModelOptions()]);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the LLM responses failed", error);
  }

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">LLM responses</h1>
      <p className="mt-2 max-w-prose text-muted">
        One row per model call a roast run made, with the prompts sent and the raw answer. When a
        step’s model can’t answer, the step is retried once on{" "}
        <span className="font-mono text-sm">{FALLBACK_MODEL}</span>. Those fallback calls have no
        model row, so the model filter leaves them out.
      </p>

      <div className="mt-6">
        <Filters query={query} models={models} />
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The LLM responses couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Filters({ query, models }: { query: ResponseQuery; models: ModelOption[] }) {
  return (
    <FilterBar action="/llm-responses" showClear={isFiltered(query)}>
      <label className="flex flex-col gap-1">
        <span className={label}>Status</span>
        <select name="status" defaultValue={query.status ?? ""} className={input}>
          <option value="">Any status</option>
          {RESPONSE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RESPONSE_STATUS_INFO[s].label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Model</span>
        <select name="model" defaultValue={query.model === null ? "" : String(query.model)} className={input}>
          <option value="">Any model</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Fallback</span>
        <select name="fallback" defaultValue={query.fallback ?? ""} className={input}>
          <option value="">Any call</option>
          <option value="yes">Fallback calls only</option>
          <option value="no">No fallback calls</option>
        </select>
      </label>
    </FilterBar>
  );
}

function Results({ query, rows, total }: { query: ResponseQuery; rows: ResponseRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="responses-count" className="mt-6">
      <p id="responses-count" className="text-sm text-muted">
        {`${nouns(total, "call")}${isFiltered(query) ? (total === 1 ? " matches" : " match") : ""}, newest first`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-5xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>When</th>
              <th scope="col" className={th}>Step</th>
              <th scope="col" className={th}>Model that answered</th>
              <th scope="col" className={th}>Fallback</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={`${th} text-right`}>Took</th>
              <th scope="col" className={th}>Answer</th>
              <th scope="col" className={th}>Run</th>
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
        <Pagination pathname="/llm-responses" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function Row({ row }: { row: ResponseRow }) {
  const status = RESPONSE_STATUS_INFO[row.status];
  return (
    <tr className="border-b border-line align-top last:border-0">
      <th scope="row" className="py-3 pr-4 text-left font-normal whitespace-nowrap">
        <Link href={`/llm-responses/${row.id}`} className={textLink}>
          <time dateTime={row.createdAt}>{DATE_TIME.format(new Date(row.createdAt))}</time>
        </Link>
      </th>
      <td className="py-3 pr-4 whitespace-nowrap tabular-nums">{row.stepOrder}</td>
      <td className="max-w-56 py-3 pr-4">
        <span className="font-mono text-xs break-all">{row.providerModelId}</span>
      </td>
      <td className="py-3 pr-4">
        {row.isFallback ? (
          <Badge>{row.fallbackReason ? `Fallback: ${FALLBACK_REASONS[row.fallbackReason]}` : "Fallback"}</Badge>
        ) : (
          <span className="text-muted">No</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums">{formatDuration(row.durationMs)}</td>
      <td className="max-w-md min-w-60 py-3 pr-4 break-words">
        {row.preview ? (
          row.preview
        ) : (
          <span className="text-muted">{row.error ? preview(row.error) : "No answer"}</span>
        )}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <Link href={`/requests/${row.requestId}`} className={textLink}>
          Open the run
        </Link>
      </td>
    </tr>
  );
}

function NoRows({ query, total }: { query: ResponseQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/llm-responses", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (isFiltered(query)) {
    return (
      <EmptyState title="No calls match these filters." action={{ href: "/llm-responses", label: "Clear filters" }} />
    );
  }
  return (
    <EmptyState title="No model calls logged yet.">
      Each roast run logs every call it makes to a model here, from the app and from this admin area.
    </EmptyState>
  );
}
