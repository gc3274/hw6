import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import ConfirmDelete from "@/components/ConfirmDelete";
import { card, errorBox, noticeBox, textLink } from "@/components/ui";
import { TERMS_MAX, termsBlock } from "@/lib/chains";
import { getTerm, type TermDetail } from "@/lib/data/terms";
import { requireSuperadmin } from "@/lib/dal";
import { parseId } from "@/lib/forms";
import { termFormValues, topicLabel } from "@/lib/terms";
import { deleteTerm, updateTerm } from "../actions";
import TermForm from "../TermForm";

export const metadata: Metadata = {
  title: "Term",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{DATE.format(new Date(iso))}</time>;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function BackLink() {
  return (
    <Link href="/terms" className={`text-sm ${textLink}`}>
      All terms
    </Link>
  );
}

export default async function TermPage({ params, searchParams }: PageProps<"/terms/[id]">) {
  await requireSuperadmin();

  const id = parseId((await params).id);
  if (id === null) notFound();

  let term: TermDetail | null = null;
  let failed = false;
  try {
    term = await getTerm(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the term failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        <BackLink />
        <p className={`${errorBox} mt-6`}>
          This term couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!term) notFound();

  const sp = await searchParams;
  // Set by deleteTerm when the delete itself failed
  const deleteFailed = first(sp.error) === "delete";
  // Set by createTerm after it saves a new term
  const created = !deleteFailed && first(sp.created) === "1";

  return (
    <>
      <BackLink />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight break-words">{term.term}</h1>
        <Badge>{topicLabel(term.topic)}</Badge>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Priority {term.priority}. Added <When iso={term.createdAt} />
        {term.updatedAt !== term.createdAt && (
          <>
            , last changed <When iso={term.updatedAt} />
          </>
        )}
        .
      </p>

      {deleteFailed && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: the database didn’t answer. Try again.
        </p>
      )}
      {created && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Term added. It goes into prompts from the next roast, as long as it’s in the top{" "}
          {TERMS_MAX} for the photo’s topic.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="edit-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="edit-heading" className="text-xl font-semibold tracking-tight">
              Edit
            </h2>
            <p className="mt-1 text-sm text-muted">Changes apply from the next roast.</p>
            <div className="mt-5">
              <TermForm
                action={updateTerm}
                id={term.id}
                initial={termFormValues(term)}
                submitLabel="Save changes"
                pendingText="Saving…"
              />
            </div>
          </section>

          <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
              Delete
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">Removes this term from the glossary.</p>
            <div className="mt-4">
              <ConfirmDelete
                action={deleteTerm}
                fields={{ id: String(term.id) }}
                noun="term"
                warning="It stops going into prompts from the next roast. This can’t be undone."
              />
            </div>
          </section>
        </div>

        <aside aria-labelledby="prompt-heading" className="min-w-0">
          <h2 id="prompt-heading" className="text-base font-semibold tracking-tight">
            In the prompt
          </h2>
          <p className="mt-1 text-sm text-muted">
            How the saved term reads to the model, listed with the other terms for the photo’s topic.
          </p>
          <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
            {termsBlock([term]).trim()}
          </p>
        </aside>
      </div>
    </>
  );
}
