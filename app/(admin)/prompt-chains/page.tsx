import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import { button, errorBox, textLink } from "@/components/ui";
import { listChains, type ChainSummary } from "@/lib/data/prompts";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { parsePage } from "@/lib/params";

export const metadata: Metadata = {
  title: "Prompt chains",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

export default async function PromptChainsPage({ searchParams }: PageProps<"/prompt-chains">) {
  await requireSuperadmin();

  const page = parsePage((await searchParams).page);
  let result: { rows: ChainSummary[]; total: number } | null = null;
  try {
    result = await listChains(page);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the prompt chains failed", error);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Prompt chains</h1>
        <Link href="/chain-mix" className={button("secondary")}>
          Change the mix
        </Link>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Each roast run picks one chain by the{" "}
        <Link href="/chain-mix" className={textLink}>
          chain mix
        </Link>{" "}
        and runs its steps in order, each step’s answer feeding the next. Chains and steps are read
        only here: the migration seeds them.
      </p>

      {result ? (
        <Results page={page} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The prompt chains couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Results({ page, rows, total }: { page: number; rows: ChainSummary[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        {total > 0 ? (
          // A hand-typed ?page= past the last page
          <EmptyState
            title={`Page ${page} is past the end of the list.`}
            action={{ href: "/prompt-chains", label: "Go to page 1" }}
          />
        ) : (
          <EmptyState title="No prompt chains yet.">
            The prompt chains migration seeds them. Until it runs, every roast uses the one-pass
            prompt built into the app.
          </EmptyState>
        )}
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="chains-count" className="mt-6">
      <p id="chains-count" className="text-sm text-muted">
        {nouns(total, "chain")}, oldest first
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Chain</th>
              <th scope="col" className={th}>What it does</th>
              <th scope="col" className={`${th} text-right`}>Steps</th>
              <th scope="col" className={`${th} text-right`}>Share of runs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line align-top last:border-0">
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  <Link href={`/prompt-chains/${c.id}`} className={textLink}>
                    {c.name}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs break-all text-muted">{c.slug}</p>
                </th>
                <td className="max-w-prose py-3 pr-4 break-words">{c.description}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{c.steps}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{c.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <Pagination pathname="/prompt-chains" query={{ page }} page={page} total={total} />
      </div>
    </section>
  );
}
