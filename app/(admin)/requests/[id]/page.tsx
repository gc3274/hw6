import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import Thumb from "@/components/Thumb";
import { card, errorBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import { getRequest, type RequestDetail, type ResponseSummary } from "@/lib/data/requests";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import {
  chainUse,
  DAILY_LIMIT,
  displayStatus,
  FALLBACK_REASONS,
  formatDuration,
  photoState,
  REQUEST_STATUS_INFO,
  RESPONSE_STATUS_INFO,
  SOURCE_LABELS,
  type DisplayStatus,
} from "@/lib/requests";
import { topicInfo } from "@/lib/roasts";

export const metadata: Metadata = {
  title: "Generation request",
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
  second: "2-digit",
});

function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{DATE_TIME.format(new Date(iso))}</time>;
}

const pre =
  "mt-1 rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap";

const backLink = (
  <Link href="/requests" className={`text-sm ${textLink}`}>
    All generation requests
  </Link>
);

export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  await requireSuperadmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let request: RequestDetail | null = null;
  let failed = false;
  try {
    request = await getRequest(id.toLowerCase());
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the generation request failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This generation request couldn’t load. The database didn’t answer, or this server is
          missing its service key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!request) notFound();

  const status = displayStatus(request.status, request.createdAt, request.readAt);
  const info = REQUEST_STATUS_INFO[status];
  const topic = topicInfo(request.topic);

  return (
    <>
      {backLink}
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Roast run</h1>
      <p className="mt-2 max-w-prose text-muted">
        {info.meaning}{" "}
        {request.source === "app"
          ? `It counts toward the uploader’s ${DAILY_LIMIT}-a-day limit.`
          : "Run from this admin area, so it counts toward no one’s daily limit."}
      </p>

      <section aria-labelledby="summary-heading" className={`${card} mt-8 p-5 sm:p-6`}>
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight">
          Summary
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field term="Status">
            <Badge tone={info.tone}>{info.label}</Badge>
          </Field>
          <Field term="Source">
            {SOURCE_LABELS[request.source]}
            <span className="mt-1 block text-xs text-muted">
              {request.source === "app" ? "Posted from the main app." : "Generated from this admin area."}
            </span>
          </Field>
          <Field term={request.source === "app" ? "Uploader" : "Admin who ran it"}>
            <Link href={`/users/${request.who.id}`} className={textLink}>
              {request.who.name ?? "someone with no name yet"}
            </Link>
          </Field>
          <Field term="Topic">{topic ? topic.label : <span className="text-muted">Not recorded</span>}</Field>
          <Field term="Chain">
            <Chain request={request} status={status} />
          </Field>
          <Field term="Started">
            <When iso={request.createdAt} />
          </Field>
          <Field term="Finished">
            {request.finishedAt ? <When iso={request.finishedAt} /> : <span className="text-muted">Not recorded</span>}
          </Field>
          <Field term="Took">{formatDuration(request.durationMs)}</Field>
          <Field term="Roasts saved">
            {request.status === "legacy" ? <span className="text-muted">Not recorded</span> : request.roastCount}
          </Field>
          <Field term="Photo">
            <Photo request={request} />
          </Field>
          <Field term="Request ID">
            <span className="font-mono text-xs break-all">{request.id}</span>
          </Field>
        </dl>
        {request.error && (
          <div className="mt-5">
            <h3 className="text-sm text-muted">Error and notes</h3>
            <pre className={pre}>{request.error}</pre>
          </div>
        )}
      </section>

      <Timeline request={request} status={status} />
    </>
  );
}

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="mt-1 break-words">{children}</dd>
    </div>
  );
}

function Chain({ request, status }: { request: RequestDetail; status: DisplayStatus }) {
  const use = chainUse(request);
  if (use === "chain") {
    return (
      <Link href={`/prompt-chains/${request.chainId}`} className={textLink}>
        {request.chainName ?? `Chain ${request.chainId}`}
      </Link>
    );
  }
  if (use === "built-in") {
    return (
      <>
        Built-in chain
        <span className="mt-1 block text-xs text-muted">
          The database had no usable chain, so the one-pass prompt built into the app ran. The notes
          say why.
        </span>
      </>
    );
  }
  if (use === "deleted") {
    return (
      <>
        A deleted chain
        <span className="mt-1 block text-xs text-muted">
          The chain this run used has been deleted since. Its model calls below still show what ran.
        </span>
      </>
    );
  }
  const why =
    status === "legacy"
      ? "Not recorded for runs from before request logging."
      : status === "pending"
        ? "None yet: it’s still running."
        : status === "unfinished"
          ? "Not recorded: the run never finished."
          : status === "limited"
            ? "None: it stopped at the daily limit."
            : "None: the run stopped before a chain was picked.";
  return <span className="text-muted">{why}</span>;
}

function Photo({ request }: { request: RequestDetail }) {
  const photo = photoState(request);
  if (photo === "post" && request.imageId) {
    return (
      <Link href={`/images/${request.imageId}`} className={`inline-flex items-center gap-3 ${textLink}`}>
        <Thumb src={request.imageUrl} alt="" size={56} />
        Open the post
      </Link>
    );
  }
  if (photo === "deleted") return <span className="text-muted">Photo deleted</span>;
  return <span className="text-muted">No post was saved from this run.</span>;
}

function Timeline({ request, status }: { request: RequestDetail; status: DisplayStatus }) {
  const { responses } = request;
  const empty =
    status === "limited"
      ? "It stopped at the daily limit, so no model was called."
      : status === "legacy"
        ? "Runs from before request logging have no model calls on record."
        : status === "pending"
          ? "The model hasn’t answered yet."
          : "It stopped before any model was called, or its calls couldn’t be logged.";

  return (
    <section aria-labelledby="calls-heading" className="mt-10">
      <h2 id="calls-heading" className="text-xl font-semibold tracking-tight">
        Model calls
      </h2>
      {responses.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No model calls for this run.">{empty}</EmptyState>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            {nouns(responses.length, "call")}, in the order they were made. Open one for its prompts
            and the raw answer.
          </p>
          <ol className={`${card} mt-4 divide-y divide-line`}>
            {responses.map((r) => (
              <Call key={r.id} response={r} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Call({ response }: { response: ResponseSummary }) {
  const status = RESPONSE_STATUS_INFO[response.status];
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="font-medium">Step {response.stepOrder}</span>
        <span className="font-mono text-xs break-all text-muted">{response.providerModelId}</span>
        {response.isFallback && (
          <Badge>
            Fallback{response.fallbackReason ? `: ${FALLBACK_REASONS[response.fallbackReason]}` : ""}
          </Badge>
        )}
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="tabular-nums text-muted">{formatDuration(response.durationMs)}</span>
        <Link href={`/llm-responses/${response.id}`} className={`ml-auto ${textLink}`}>
          Open the call
        </Link>
      </div>
      {response.error && <p className="mt-1 line-clamp-2 text-sm break-words text-muted">{response.error}</p>}
    </li>
  );
}
