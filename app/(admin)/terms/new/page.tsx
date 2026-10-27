import type { Metadata } from "next";
import Link from "next/link";
import { card, textLink } from "@/components/ui";
import { requireSuperadmin } from "@/lib/dal";
import { termFormValues } from "@/lib/terms";
import { createTerm } from "../actions";
import TermForm from "../TermForm";

export const metadata: Metadata = {
  title: "Add a term",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

export default async function NewTermPage() {
  await requireSuperadmin();

  return (
    <>
      <Link href="/terms" className={`text-sm ${textLink}`}>
        All terms
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Add a term</h1>
      <p className="mt-2 max-w-prose text-muted">
        A word the critics can use when it fits, with what it means. It goes into prompts from the
        next roast, for the topic you pick.
      </p>

      <section aria-label="New term" className={`${card} mt-8 max-w-3xl p-5 sm:p-6`}>
        <TermForm action={createTerm} initial={termFormValues()} submitLabel="Add term" pendingText="Adding…" />
      </section>
    </>
  );
}
