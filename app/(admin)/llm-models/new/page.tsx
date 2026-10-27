import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { card, errorBox, textLink } from "@/components/ui";
import { FALLBACK_MODEL } from "@/lib/chains";
import { listProviderOptions, type ProviderOption } from "@/lib/data/llm";
import { requireSuperadmin } from "@/lib/dal";
import { parseModelQuery } from "@/lib/llm";
import ModelForm from "../ModelForm";

export const metadata: Metadata = {
  title: "Add a model",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

export default async function NewModelPage({ searchParams }: PageProps<"/llm-models/new">) {
  await requireSuperadmin();

  // ?provider= comes from a provider page's "Add a model" link
  const { provider } = parseModelQuery(await searchParams);
  let providers: ProviderOption[] | null = null;
  try {
    providers = await listProviderOptions();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the providers failed", error);
  }

  return (
    <>
      <Link href="/llm-models" className={`text-sm ${textLink}`}>
        All models
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Add a model</h1>
      <p className="mt-2 max-w-prose text-muted">
        A model chain steps can call. If a call is busy, missing or refused, the step retries once on{" "}
        {FALLBACK_MODEL}.
      </p>

      {!providers ? (
        <p className={`${errorBox} mt-6`}>
          The providers couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      ) : providers.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Add a provider first." action={{ href: "/llm-providers/new", label: "Add a provider" }}>
            Every model belongs to a provider.
          </EmptyState>
        </div>
      ) : (
        <section aria-label="New model" className={`${card} mt-8 max-w-2xl p-5 sm:p-6`}>
          <ModelForm
            providers={providers}
            providerId={providers.some((p) => p.id === provider) ? provider : null}
          />
        </section>
      )}
    </>
  );
}
