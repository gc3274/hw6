import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import { card, errorBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import { FALLBACK_MODEL } from "@/lib/chains";
import { getResponse, type ResponseDetail } from "@/lib/data/requests";
import { requireSuperadmin } from "@/lib/dal";
import { FALLBACK_REASONS, formatDuration, RESPONSE_STATUS_INFO, SOURCE_LABELS } from "@/lib/requests";

export const metadata: Metadata = {
  title: "LLM response",
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
  "mt-2 rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap";

const backLink = (
  <Link href="/llm-responses" className={`text-sm ${textLink}`}>
    All LLM responses
  </Link>
);

export default async function LlmResponsePage({ params }: PageProps<"/llm-responses/[id]">) {
  await requireSuperadmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let response: ResponseDetail | null = null;
  let failed = false;
  try {
    response = await getResponse(id.toLowerCase());
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the LLM response failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This LLM response couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!response) notFound();

  const status = RESPONSE_STATUS_INFO[response.status];
  const none = (text: string) => <span className="text-muted">{text}</span>;

  return (
    <>
      {backLink}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Step {response.stepOrder} call</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
        {response.isFallback && <Badge>Fallback</Badge>}
      </div>
      <p className="mt-2 max-w-prose text-muted">
        One call to the model, with the prompts exactly as they were sent. The photo itself is never
        stored in the log
        {response.step?.withPhoto ? ", though this step sent it along with the prompts." : "."}
      </p>

      <section aria-labelledby="call-heading" className={`${card} mt-8 p-5 sm:p-6`}>
        <h2 id="call-heading" className="text-xl font-semibold tracking-tight">
          The call
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field term="Run">
            <Link href={`/requests/${response.request.id}`} className={textLink}>
              Open the run
            </Link>
            {response.request.source && (
              <span className="mt-1 block text-xs text-muted">
                {SOURCE_LABELS[response.request.source]} run
                {response.request.createdAt && (
                  <>
                    , started <When iso={response.request.createdAt} />
                  </>
                )}
              </span>
            )}
          </Field>
          <Field term="Chain">
            {response.chain ? (
              <Link href={`/prompt-chains/${response.chain.id}`} className={textLink}>
                {response.chain.name}
              </Link>
            ) : (
              none("The built-in one-pass chain, or a chain deleted since")
            )}
          </Field>
          <Field term="Step">
            {response.stepOrder}
            {response.step && <span className="mt-1 block text-xs text-muted">{response.step.description}</span>}
          </Field>
          <Field term="Model">
            {response.model ? (
              <Link href={`/llm-models/${response.model.id}`} className={textLink}>
                {response.model.name}
              </Link>
            ) : response.isFallback ? (
              none(`No model row: fallback calls go straight to ${FALLBACK_MODEL}`)
            ) : (
              none("No model row: the built-in chain, or a model deleted since")
            )}
          </Field>
          <Field term="Model called or answered">
            <span className="font-mono text-sm break-all">{response.providerModelId}</span>
          </Field>
          <Field term="Fallback">
            {response.isFallback
              ? `Yes: ${response.fallbackReason ? FALLBACK_REASONS[response.fallbackReason] : "reason not recorded"}`
              : "No"}
          </Field>
          <Field term="Temperature sent">
            {response.temperature === null ? none("Not sent") : String(response.temperature)}
          </Field>
          <Field term="Status">
            <Badge tone={status.tone}>{status.label}</Badge>
          </Field>
          <Field term="Took">{formatDuration(response.durationMs)}</Field>
          <Field term="Made">
            <When iso={response.createdAt} />
          </Field>
          <Field term="Error">{response.error ?? none("None")}</Field>
        </dl>
      </section>

      <Text id="system" title="System prompt">
        {response.systemPrompt}
      </Text>
      <Text id="user" title="User prompt">
        {response.userPrompt}
      </Text>
      <Text id="answer" title="Raw response">
        {response.responseText ?? <span className="font-sans text-muted">No answer</span>}
      </Text>
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

function Text({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8">
      <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <pre className={pre}>{children}</pre>
    </section>
  );
}
