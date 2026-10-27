import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import ConfirmDelete from "@/components/ConfirmDelete";
import { card, errorBox, noticeBox, textLink } from "@/components/ui";
import { FALLBACK_MODEL } from "@/lib/chains";
import { getProvider, type ProviderDetail } from "@/lib/data/llm";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { parseId } from "@/lib/forms";
import { isCallable, PROVIDER_DELETE_WARNING, providerBlockedReason } from "@/lib/llm";
import { hrefWith } from "@/lib/params";
import { deleteProvider } from "../actions";
import ProviderEditForm from "./ProviderEditForm";

export const metadata: Metadata = {
  title: "Provider",
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
  <Link href="/llm-providers" className={`text-sm ${textLink}`}>
    All providers
  </Link>
);

export default async function ProviderPage({ params, searchParams }: PageProps<"/llm-providers/[id]">) {
  await requireSuperadmin();

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) notFound();

  let provider: ProviderDetail | null = null;
  let failed = false;
  try {
    provider = await getProvider(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the provider failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This provider couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!provider) notFound();

  const sp = await searchParams;
  // Set by deleteProvider when it refused or failed
  const error = first(sp.error);
  const deleteFailed = error === "delete";
  const inUse = error === "in_use";
  // Set by createProvider after it saves
  const created = !deleteFailed && !inUse && first(sp.created) === "1";
  const callable = isCallable(provider.slug);
  const blocked = providerBlockedReason(provider.models.length);

  return (
    <>
      {backLink}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight break-words">{provider.name}</h1>
        {callable && <Badge tone="accent">Callable by the app</Badge>}
      </div>
      <p className="mt-2 max-w-prose text-muted">
        {callable
          ? "Steps that use its models call them directly."
          : `The app has no client for this provider, so steps that use its models go straight to the fallback, ${FALLBACK_MODEL}.`}
      </p>

      {deleteFailed && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: the database didn’t answer. Try again.
        </p>
      )}
      {inUse && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: models still use this provider.
        </p>
      )}
      {created && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Provider added. Add its models next.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="edit-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="edit-heading" className="text-xl font-semibold tracking-tight">
              Edit
            </h2>
            <p className="mt-1 text-sm text-muted">Only the name can change.</p>
            <div className="mt-5">
              <ProviderEditForm id={provider.id} name={provider.name} slug={provider.slug} />
            </div>
          </section>

          <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
              Delete
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Removes this provider. Only a provider with no models can be deleted.
            </p>
            <div className="mt-4">
              <ConfirmDelete
                action={deleteProvider}
                fields={{ id: String(provider.id) }}
                noun="provider"
                warning={PROVIDER_DELETE_WARNING}
                blockedReason={blocked}
              />
            </div>
          </section>
        </div>

        <aside aria-label="About this provider" className="min-w-0 space-y-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Fact term="Slug" wide>
              <code className="break-all">{provider.slug}</code>
            </Fact>
            <Fact term="Added">
              <When iso={provider.createdAt} />
            </Fact>
            <Fact term="Updated">
              <When iso={provider.updatedAt} />
            </Fact>
          </dl>
          <Models provider={provider} />
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

function Models({ provider }: { provider: ProviderDetail }) {
  return (
    <section aria-labelledby="models-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="models-heading" className="text-base font-semibold tracking-tight">
          {provider.models.length === 0 ? "Models" : nouns(provider.models.length, "model")}
        </h2>
        <Link
          href={hrefWith("/llm-models/new", {}, { provider: provider.id })}
          className={`text-sm ${textLink}`}
        >
          Add a model
        </Link>
      </div>
      {provider.models.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          None yet.
          {!isCallable(provider.slug) && " Its models would only ever run on the fallback."}
        </p>
      ) : (
        <ul className={`${card} mt-2 divide-y divide-line`}>
          {provider.models.map((m) => (
            <li key={m.id} className="p-3 text-sm">
              <Link href={`/llm-models/${m.id}`} className={`break-words ${textLink}`}>
                {m.name}
              </Link>
              <p className="mt-0.5 text-xs break-all text-muted">
                <code>{m.providerModelId}</code>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
