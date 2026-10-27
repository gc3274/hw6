import type { Metadata } from "next";
import Link from "next/link";
import { card, textLink } from "@/components/ui";
import { requireSuperadmin } from "@/lib/dal";
import ProviderCreateForm from "./ProviderCreateForm";

export const metadata: Metadata = {
  title: "Add a provider",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

export default async function NewProviderPage() {
  await requireSuperadmin();

  return (
    <>
      <Link href="/llm-providers" className={`text-sm ${textLink}`}>
        All providers
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Add a provider</h1>
      <p className="mt-2 max-w-prose text-muted">
        A company whose models chain steps can call. Add its models from the provider’s page once
        it’s saved.
      </p>

      <section aria-label="New provider" className={`${card} mt-8 max-w-2xl p-5 sm:p-6`}>
        <ProviderCreateForm />
      </section>
    </>
  );
}
