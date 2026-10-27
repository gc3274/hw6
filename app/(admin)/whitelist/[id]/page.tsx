import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import ConfirmDelete from "@/components/ConfirmDelete";
import SignupEffect from "@/components/SignupEffect";
import { card, errorBox, textLink } from "@/components/ui";
import { emailDeleteWarning, type SignupLists } from "@/lib/access";
import { getAddress, signupLists, type AddressDetail } from "@/lib/data/access";
import { requireSuperadmin } from "@/lib/dal";
import { parseId } from "@/lib/forms";
import { deleteAddress, updateAddress } from "../actions";
import AddressForm from "../AddressForm";

export const metadata: Metadata = {
  title: "Whitelisted address",
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
    <Link href="/whitelist" className={`text-sm ${textLink}`}>
      Email whitelist
    </Link>
  );
}

export default async function WhitelistedAddressPage({ params, searchParams }: PageProps<"/whitelist/[id]">) {
  await requireSuperadmin();

  const id = parseId((await params).id);
  if (id === null) notFound();

  let loaded: { address: AddressDetail | null; lists: SignupLists } | null = null;
  try {
    const [address, lists] = await Promise.all([getAddress(id), signupLists()]);
    loaded = { address, lists };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the whitelisted address failed", error);
  }

  if (!loaded) {
    return (
      <>
        <BackLink />
        <p className={`${errorBox} mt-6`}>
          This address couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  const { address, lists } = loaded;
  if (!address) notFound();

  // Set by deleteAddress when the delete itself failed
  const deleteFailed = first((await searchParams).error) === "delete";

  return (
    <>
      <BackLink />

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight break-all">{address.emailAddress}</h1>
      <p className="mt-2 max-w-prose text-muted">
        This address can sign up whatever its domain.{" "}
        {address.coveredBy && `Its domain is already allowed through ${address.coveredBy}, so this entry adds nothing for now. `}
        Added <When iso={address.createdAt} />.
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
          <p className="mt-1 text-sm text-muted">The new address applies from the next sign-up.</p>
          <div className="mt-5">
            <AddressForm
              action={updateAddress}
              id={address.id}
              initial={address.emailAddress}
              submitLabel="Save changes"
              pendingText="Saving…"
            />
          </div>
        </section>

        <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
          <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
            Delete
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">Takes this address off the whitelist.</p>
          <div className="mt-4">
            <ConfirmDelete
              action={deleteAddress}
              fields={{ id: String(address.id) }}
              noun="address"
              warning={emailDeleteWarning(address.emailAddress, {
                coveredBy: address.coveredBy,
                entries: lists.domainCount + lists.addressCount,
              })}
            />
          </div>
        </section>
      </div>
    </>
  );
}
