import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import SignupEffect from "@/components/SignupEffect";
import { card, errorBox, input, label, noticeBox, textLink } from "@/components/ui";
import { parseAccessQuery, type AccessQuery, type SignupLists } from "@/lib/access";
import { listAddresses, signupLists, type AddressRow } from "@/lib/data/access";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { hrefWith } from "@/lib/params";
import { createAddress } from "./actions";
import AddressForm from "./AddressForm";

export const metadata: Metadata = {
  title: "Email whitelist",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function WhitelistPage({ searchParams }: PageProps<"/whitelist">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const query = parseAccessQuery(sp);
  let result: { rows: AddressRow[]; total: number; lists: SignupLists } | null = null;
  try {
    const [list, lists] = await Promise.all([listAddresses(query), signupLists()]);
    result = { ...list, lists };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the email whitelist failed", error);
  }

  // Set by the create and delete redirects; they only change the banner
  const gone = first(sp.error) === "gone";
  const deleted = !gone && first(sp.deleted) === "1";
  const created = !gone && !deleted && first(sp.created) === "1";

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Email whitelist</h1>
      <p className="mt-2 max-w-prose text-muted">
        Single addresses that can sign up whatever their domain. To let in a whole school, add its{" "}
        <Link href="/signup-domains" className={textLink}>
          sign-up domain
        </Link>{" "}
        instead.
      </p>

      {result && (
        <div className="mt-6">
          <SignupEffect lists={result.lists} />
        </div>
      )}

      {gone && (
        <p role="status" className={`${errorBox} mt-6`}>
          That address was already deleted.
        </p>
      )}
      {deleted && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Address deleted. If it already had an account, that account keeps working.
        </p>
      )}
      {created && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Address added. It can sign up from now on.
        </p>
      )}

      <section aria-labelledby="add-heading" className={`${card} mt-6 p-5 sm:p-6`}>
        <h2 id="add-heading" className="text-xl font-semibold tracking-tight">
          Add an address
        </h2>
        <div className="mt-4">
          {/* A new key after each add, so the field starts empty again */}
          <AddressForm
            key={result?.lists.addressCount ?? "unknown"}
            action={createAddress}
            initial=""
            submitLabel="Add address"
            pendingText="Adding…"
          />
        </div>
      </section>

      {/* Keyed on the query, so Clear filters also clears the field */}
      <div key={hrefWith("/whitelist", query)} className="mt-8">
        <FilterBar action="/whitelist" showClear={query.q !== null}>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className={label}>Search</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q ?? ""}
              maxLength={60}
              placeholder="Address or domain"
              className={input}
            />
          </label>
        </FilterBar>
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The email whitelist couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Results({ query, rows, total }: { query: AccessQuery; rows: AddressRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";

  return (
    <section aria-labelledby="addresses-count" className="mt-6">
      <p id="addresses-count" className="text-sm text-muted">
        {`${nouns(total, "address", "addresses")}${query.q ? (total === 1 ? " matches" : " match") : ""}, A to Z`}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-md border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Address</th>
              <th scope="col" className={th}>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <th scope="row" className="py-3 pr-4 text-left font-normal break-all">
                  <Link href={`/whitelist/${r.id}`} className={textLink}>
                    {r.emailAddress}
                  </Link>
                </th>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={r.createdAt}>{DATE.format(new Date(r.createdAt))}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <Pagination pathname="/whitelist" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function NoRows({ query, total }: { query: AccessQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/whitelist", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (query.q) {
    return (
      <EmptyState
        title={`No addresses match '${query.q}'.`}
        action={{ href: "/whitelist", label: "Clear search" }}
      />
    );
  }
  return (
    <EmptyState title="No addresses on the list." action={{ href: "#email_address", label: "Add an address" }}>
      Add one to let a single person in from outside the sign-up domains.
    </EmptyState>
  );
}
