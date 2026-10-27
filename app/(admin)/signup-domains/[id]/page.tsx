import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import ConfirmDelete from "@/components/ConfirmDelete";
import SignupEffect from "@/components/SignupEffect";
import { card, errorBox, textLink } from "@/components/ui";
import { domainDeleteWarning, type SignupLists } from "@/lib/access";
import { getDomain, signupLists, type DomainDetail } from "@/lib/data/access";
import { requireSuperadmin } from "@/lib/dal";
import { parseId } from "@/lib/forms";
import { deleteDomain, updateDomain } from "../actions";
import DomainForm from "../DomainForm";

export const metadata: Metadata = {
  title: "Sign-up domain",
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
    <Link href="/signup-domains" className={`text-sm ${textLink}`}>
      All sign-up domains
    </Link>
  );
}

export default async function SignupDomainPage({ params, searchParams }: PageProps<"/signup-domains/[id]">) {
  await requireSuperadmin();

  const id = parseId((await params).id);
  if (id === null) notFound();

  let loaded: { domain: DomainDetail | null; lists: SignupLists } | null = null;
  try {
    const [domain, lists] = await Promise.all([getDomain(id), signupLists()]);
    loaded = { domain, lists };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the sign-up domain failed", error);
  }

  if (!loaded) {
    return (
      <>
        <BackLink />
        <p className={`${errorBox} mt-6`}>
          This domain couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  const { domain, lists } = loaded;
  if (!domain) notFound();

  // Set by deleteDomain when the delete itself failed
  const deleteFailed = first((await searchParams).error) === "delete";

  return (
    <>
      <BackLink />

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight break-all">{domain.apexDomain}</h1>
      <p className="mt-2 max-w-prose text-muted">
        Lets new accounts sign up with an email at {domain.apexDomain} or any of its subdomains.{" "}
        {domain.coveredBy && `${domain.coveredBy} is on the list too and already covers it. `}
        Added <When iso={domain.createdAt} />.
      </p>

      <div className="mt-6">
        <SignupEffect lists={lists} />
      </div>

      {deleteFailed && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: the database didn’t answer. Try again.
        </p>
      )}

      <div className="mt-8 max-w-3xl space-y-8">
        <section aria-labelledby="edit-heading" className={`${card} p-5 sm:p-6`}>
          <h2 id="edit-heading" className="text-xl font-semibold tracking-tight">
            Edit
          </h2>
          <p className="mt-1 text-sm text-muted">The new domain applies from the next sign-up.</p>
          <div className="mt-5">
            <DomainForm
              action={updateDomain}
              id={domain.id}
              initial={domain.apexDomain}
              submitLabel="Save changes"
              pendingText="Saving…"
            />
          </div>
        </section>

        <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
          <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
            Delete
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">Takes this domain off the list.</p>
          <div className="mt-4">
            <ConfirmDelete
              action={deleteDomain}
              fields={{ id: String(domain.id) }}
              noun="domain"
              warning={domainDeleteWarning(domain.apexDomain, {
                coveredBy: domain.coveredBy,
                entries: lists.domainCount + lists.addressCount,
              })}
            />
          </div>
        </section>
      </div>
    </>
  );
}
