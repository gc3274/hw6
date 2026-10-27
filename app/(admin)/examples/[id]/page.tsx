import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import ConfirmDelete from "@/components/ConfirmDelete";
import RatingPill from "@/components/RatingPill";
import { card, errorBox, noticeBox, textLink } from "@/components/ui";
import { EXAMPLES_MAX, examplesBlock } from "@/lib/chains";
import { getExample, type ExampleDetail } from "@/lib/data/examples";
import { requireSuperadmin } from "@/lib/dal";
import { exampleFormValues } from "@/lib/examples";
import { parseId } from "@/lib/forms";
import { topicLabel } from "@/lib/terms";
import { deleteExample, updateExample } from "../actions";
import ExampleForm from "../ExampleForm";

export const metadata: Metadata = {
  title: "Example review",
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
    <Link href="/examples" className={`text-sm ${textLink}`}>
      All example reviews
    </Link>
  );
}

export default async function ExamplePage({ params, searchParams }: PageProps<"/examples/[id]">) {
  await requireSuperadmin();

  const id = parseId((await params).id);
  if (id === null) notFound();

  let example: ExampleDetail | null = null;
  let failed = false;
  try {
    example = await getExample(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the example review failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        <BackLink />
        <p className={`${errorBox} mt-6`}>
          This example review couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!example) notFound();

  const sp = await searchParams;
  // Set by deleteExample when the delete itself failed
  const deleteFailed = first(sp.error) === "delete";
  // Set by createExample after it saves a new example
  const created = !deleteFailed && first(sp.created) === "1";

  return (
    <>
      <BackLink />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Example review</h1>
        <Badge>{topicLabel(example.topic)}</Badge>
        <RatingPill rating={example.score} />
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Priority {example.priority}. Added <When iso={example.createdAt} />
        {example.updatedAt !== example.createdAt && (
          <>
            , last changed <When iso={example.updatedAt} />
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
          Example added. It goes into prompts from the next roast, as long as it’s in the top{" "}
          {EXAMPLES_MAX} for the photo’s topic.
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
              <ExampleForm
                action={updateExample}
                id={example.id}
                initial={exampleFormValues(example)}
                submitLabel="Save changes"
                pendingText="Saving…"
              />
            </div>
          </section>

          <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
              Delete
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">Removes this example review.</p>
            <div className="mt-4">
              <ConfirmDelete
                action={deleteExample}
                fields={{ id: String(example.id) }}
                noun="example"
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
            How the saved example reads to the model, listed with the other examples for the photo’s
            topic.
          </p>
          <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
            {examplesBlock([
              {
                imageDescription: example.image_description,
                roast: example.roast,
                tip: example.tip,
                score: example.score,
                explanation: example.explanation,
              },
            ]).trim()}
          </p>
        </aside>
      </div>
    </>
  );
}
