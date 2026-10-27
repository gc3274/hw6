import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import ConfirmDelete from "@/components/ConfirmDelete";
import { card, errorBox, noticeBox, textLink } from "@/components/ui";
import { getModel, listProviderOptions, type ModelDetail, type ProviderOption } from "@/lib/data/llm";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { parseId } from "@/lib/forms";
import {
  FALLBACK_NOTE,
  isCallable,
  modelBlockedReason,
  modelDeleteWarning,
  thinkingLabel,
  UNCALLABLE_NOTE,
} from "@/lib/llm";
import { deleteModel } from "../actions";
import ModelForm from "../ModelForm";

export const metadata: Metadata = {
  title: "Model",
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

const backLink = (
  <Link href="/llm-models" className={`text-sm ${textLink}`}>
    All models
  </Link>
);

export default async function ModelPage({ params, searchParams }: PageProps<"/llm-models/[id]">) {
  await requireSuperadmin();

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) notFound();

  let loaded: { model: ModelDetail | null; providers: ProviderOption[] } | null = null;
  try {
    const [model, providers] = await Promise.all([getModel(id), listProviderOptions()]);
    loaded = { model, providers };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the model failed", error);
  }

  if (!loaded) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This model couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  const { model, providers } = loaded;
  if (!model) notFound();

  const sp = await searchParams;
  // Set by deleteModel when it refused or failed
  const error = first(sp.error);
  const deleteFailed = error === "delete";
  const inUse = error === "in_use";
  // Set by createModel after it saves
  const created = !deleteFailed && !inUse && first(sp.created) === "1";
  const callable = model.provider !== null && isCallable(model.provider.slug);

  return (
    <>
      {backLink}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight break-words">{model.name}</h1>
        {!callable && <Badge tone="danger">Not callable</Badge>}
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Calls <code className="break-all text-ink">{model.providerModelId}</code>
        {model.provider && (
          <>
            {" "}
            from{" "}
            <Link href={`/llm-providers/${model.provider.id}`} className={textLink}>
              {model.provider.name}
            </Link>
          </>
        )}
        . {model.steps.length === 0 ? "No chain steps use it yet." : `Used by ${nouns(model.steps.length, "chain step")}.`}
      </p>

      {deleteFailed && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: the database didn’t answer. Try again.
        </p>
      )}
      {inUse && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: chain steps still use this model.
        </p>
      )}
      {created && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Model added. No chain step uses it yet: steps are read-only here and keep their models.
          To change what a step calls, edit the model it already uses.
        </p>
      )}
      {!callable && <p className={`${errorBox} mt-6`}>{UNCALLABLE_NOTE}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="edit-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="edit-heading" className="text-xl font-semibold tracking-tight">
              Edit
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Changes apply to every step that uses this model from the next roast run. {FALLBACK_NOTE}
            </p>
            <div className="mt-5">
              <ModelForm
                providers={providers}
                model={{
                  id: model.id,
                  name: model.name,
                  providerId: model.providerId,
                  providerModelId: model.providerModelId,
                  temperatureSupported: model.temperatureSupported,
                  thinkingLevel: model.thinkingLevel,
                }}
              />
            </div>
          </section>

          <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
              Delete
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Removes this model. Only a model no chain step uses can be deleted.
            </p>
            <div className="mt-4">
              <ConfirmDelete
                action={deleteModel}
                fields={{ id: String(model.id) }}
                noun="model"
                warning={modelDeleteWarning(model.responses)}
                blockedReason={modelBlockedReason(model.steps.length)}
              />
            </div>
          </section>
        </div>

        <aside aria-label="About this model" className="min-w-0 space-y-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Fact term="Model ID" wide>
              <code className="break-all">{model.providerModelId}</code>
            </Fact>
            <Fact term="Temperature">{model.temperatureSupported ? "Supported" : "Not supported"}</Fact>
            <Fact term="Thinking level">{thinkingLabel(model.thinkingLevel)}</Fact>
            <Fact term="Logged responses">
              <span className="tabular-nums">{model.responses.toLocaleString("en-US")}</span>
            </Fact>
            <Fact term="Updated">
              <When iso={model.updatedAt} />
            </Fact>
            <Fact term="Added">
              <When iso={model.createdAt} />
            </Fact>
          </dl>
          <Steps model={model} />
        </aside>
      </div>
    </>
  );
}

function Fact({ term, wide = false, children }: { term: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-muted">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Steps({ model }: { model: ModelDetail }) {
  return (
    <section aria-labelledby="steps-heading">
      <h2 id="steps-heading" className="text-base font-semibold tracking-tight">
        Used by {nouns(model.steps.length, "chain step")}
      </h2>
      {model.steps.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No step calls this model.</p>
      ) : (
        <ul className={`${card} mt-2 divide-y divide-line`}>
          {model.steps.map((s) => (
            <li key={s.id} className="p-3 text-sm">
              <Link href={`/prompt-chains/${s.chain.id}`} className={`break-words ${textLink}`}>
                Step {s.order} of {s.chain.name}
              </Link>
              <p className="mt-0.5 break-words text-muted">{s.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
