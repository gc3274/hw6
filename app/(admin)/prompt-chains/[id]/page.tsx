import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import { card, errorBox, noticeBox, textLink } from "@/components/ui";
import {
  CALLABLE_PROVIDER,
  EXAMPLES_MAX,
  FALLBACK_MODEL,
  PLACEHOLDERS,
  TERMS_MAX,
  type InputType,
  type OutputType,
  type Placeholder,
} from "@/lib/chains";
import { getChainDetail, type ChainDetail, type StepDetail } from "@/lib/data/prompts";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { parseId } from "@/lib/forms";
import { hrefWith } from "@/lib/params";
import { RATING_MAX, ROAST_TARGET, TIP_TARGET, TOPICS } from "@/lib/roasts";

export const metadata: Metadata = {
  title: "Prompt chain",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const INPUTS: Record<InputType, string> = { image: "Photo and text", text: "Text only" };
const OUTPUTS: Record<OutputType, string> = { text: "Notes for the next step", roast_json: "The reviews (JSON)" };

const example = TOPICS[0];

// What each placeholder becomes when a step runs (lib/chains.ts buildVars)
const PLACEHOLDER_MEANINGS: Record<Placeholder, string> = {
  topic: `The photo’s topic label and hint, like “${example.label} (${example.hint})”.`,
  critics: "One line per critic on the panel: slug, name and voice.",
  terms: `Up to ${TERMS_MAX} terms for the topic, or nothing when there are none.`,
  examples: `Up to ${EXAMPLES_MAX} example reviews for the topic, or nothing when there are none.`,
  note: "The uploader’s note on a line of its own, or nothing when they left none.",
  previous: "The previous step’s answer. Empty on step 1.",
  roast_max: `${ROAST_TARGET}, the longest roast the prompt asks for.`,
  tip_max: `${TIP_TARGET}, the longest tip.`,
  rating_max: `${RATING_MAX}, the top score.`,
};

const pre =
  "mt-2 rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap";

const backLink = (
  <Link href="/prompt-chains" className={`text-sm ${textLink}`}>
    All prompt chains
  </Link>
);

export default async function PromptChainPage({ params }: PageProps<"/prompt-chains/[id]">) {
  await requireSuperadmin();

  const id = parseId((await params).id);
  if (id === null) notFound();

  let chain: ChainDetail | null = null;
  let failed = false;
  try {
    chain = await getChainDetail(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the prompt chain failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This prompt chain couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!chain) notFound();

  return (
    <>
      {backLink}
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight break-words">{chain.name}</h1>
      <p className="mt-2 max-w-prose text-muted">{chain.description}</p>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm">
        <Fact term="Slug">
          <span className="font-mono break-all">{chain.slug}</span>
        </Fact>
        <Fact term="Share of runs">
          <Link href="/chain-mix" className={textLink}>
            {chain.weight}%
          </Link>
        </Fact>
        <Fact term="Steps">{chain.steps.length}</Fact>
        <Fact term="Log">
          <Link href={hrefWith("/requests", {}, { chain: chain.id })} className={textLink}>
            Runs that used this chain
          </Link>
        </Fact>
      </dl>

      {chain.problems.length > 0 && (
        <div role="note" className={`${errorBox} mt-6`}>
          <p>
            This chain can’t run as it stands, so a run that picks it falls back to the one-pass
            chain, or to the one-pass prompt built into the app.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {chain.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="steps-heading" className="min-w-0">
          <h2 id="steps-heading" className="text-xl font-semibold tracking-tight">
            Steps, in the order they run
          </h2>
          <p className="mt-1 text-sm text-muted">
            {chain.steps.length === 0
              ? "This chain has no steps."
              : `${nouns(chain.steps.length, "call")} to the model per run, plus a fallback call when a step needs one.`}
          </p>
          <ol className="mt-4 space-y-6">
            {chain.steps.map((s) => (
              <StepCard key={s.id} step={s} />
            ))}
          </ol>
        </section>

        <aside aria-label="How the prompts are filled in" className="min-w-0 space-y-6">
          <section aria-labelledby="fallback-heading" className={`${noticeBox}`}>
            <h2 id="fallback-heading" className="font-semibold">
              Fallback
            </h2>
            <p className="mt-1">
              When a step’s model is busy, missing, refuses the request, or isn’t callable, that step
              is retried once on <span className="font-mono break-all">{FALLBACK_MODEL}</span>.
            </p>
          </section>
          <Legend />
        </aside>
      </div>
    </>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function temperatureText(step: StepDetail): string {
  if (step.temperature === null) return "Not sent";
  if (step.model && !step.model.temperatureSupported) return "Not sent: the model doesn’t take one";
  return String(step.temperature);
}

function StepCard({ step }: { step: StepDetail }) {
  const { model } = step;
  const callable = model?.provider?.slug === CALLABLE_PROVIDER;
  const headingId = `step-${step.id}-heading`;

  return (
    <li className={`${card} p-5 sm:p-6`}>
      <section aria-labelledby={headingId}>
        <h3 id={headingId} className="text-lg font-semibold tracking-tight">
          Step {step.order}
        </h3>
        <p className="mt-1 text-muted">{step.description}</p>

        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Fact term="Input">{step.inputType ? INPUTS[step.inputType] : "Unknown"}</Fact>
          <Fact term="Output">{step.outputType ? OUTPUTS[step.outputType] : "Unknown"}</Fact>
          <Fact term="Model">
            {model ? (
              <span className="flex flex-col items-start gap-1">
                <Link href={`/llm-models/${model.id}`} className={textLink}>
                  {model.name}
                </Link>
                <span className="font-mono text-xs break-all text-muted">{model.providerModelId}</span>
                {!callable && <Badge tone="danger">Not callable — uses the fallback</Badge>}
              </span>
            ) : (
              "Missing"
            )}
          </Fact>
          <Fact term="Temperature">{temperatureText(step)}</Fact>
          <Fact term="Thinking level">{model?.thinkingLevel ?? "Not sent"}</Fact>
        </dl>

        <h4 className="mt-6 text-sm font-medium">System prompt</h4>
        <pre className={pre}>{step.systemPrompt}</pre>
        <h4 className="mt-4 text-sm font-medium">User prompt</h4>
        <pre className={pre}>{step.userPrompt}</pre>
      </section>
    </li>
  );
}

function Legend() {
  return (
    <section aria-labelledby="legend-heading" className={`${card} p-5`}>
      <h2 id="legend-heading" className="font-semibold">
        Placeholders
      </h2>
      <p className="mt-1 text-sm text-muted">Filled in for each run before the prompt is sent.</p>
      <dl className="mt-4 space-y-3 text-sm">
        {PLACEHOLDERS.map((key) => (
          <div key={key}>
            <dt className="font-mono text-xs font-medium">{`{{${key}}}`}</dt>
            <dd className="mt-0.5 text-muted">{PLACEHOLDER_MEANINGS[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
