import type { Metadata } from "next";
import Link from "next/link";
import { card, textLink } from "@/components/ui";
import { requireSuperadmin } from "@/lib/dal";
import { exampleFormValues } from "@/lib/examples";
import { createExample } from "../actions";
import ExampleForm from "../ExampleForm";

export const metadata: Metadata = {
  title: "Add an example review",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

export default async function NewExamplePage() {
  await requireSuperadmin();

  return (
    <>
      <Link href="/examples" className={`text-sm ${textLink}`}>
        All example reviews
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Add an example review</h1>
      <p className="mt-2 max-w-prose text-muted">
        A model review for the critics to learn the tone and scoring from: a photo described in words,
        the roast, an optional tip, the score and why it works. It goes into prompts from the next
        roast, for the topic you pick.
      </p>

      <section aria-label="New example review" className={`${card} mt-8 max-w-3xl p-5 sm:p-6`}>
        <ExampleForm
          action={createExample}
          initial={exampleFormValues()}
          submitLabel="Add example"
          pendingText="Adding…"
        />
      </section>
    </>
  );
}
