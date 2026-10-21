import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { errorBox, input, label, textLink } from "@/components/ui";
import { listUsers, type UserRow } from "@/lib/data/users";
import { requireSuperadmin } from "@/lib/dal";
import { hrefWith, parseUserQuery, type UserQuery } from "@/lib/params";
import { fullName } from "@/lib/users";

export const metadata: Metadata = {
  title: "Users",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

const JOINED = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const nouns = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  await requireSuperadmin();

  const query = parseUserQuery(await searchParams);
  let result: { rows: UserRow[]; total: number } | null = null;
  try {
    result = await listUsers(query);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the users failed", error);
  }

  const filtered = query.q !== null || query.role !== null;

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Users</h1>
      <p className="mt-2 max-w-prose text-muted">
        Everyone who has signed in to the app. Read only: people edit their own profiles, and admin
        access is granted in the database.
      </p>

      <div className="mt-6">
        <FilterBar action="/users" showClear={filtered || query.sort !== "joined"}>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className={label}>Search</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q ?? ""}
              maxLength={60}
              placeholder="Name or profile email"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Show</span>
            <select name="role" defaultValue={query.role ?? ""} className={input}>
              <option value="">Everyone</option>
              <option value="superadmin">Superadmins only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Sort</span>
            <select name="sort" defaultValue={query.sort} className={input}>
              <option value="joined">Newest first</option>
              <option value="name">Name, A to Z</option>
            </select>
          </label>
        </FilterBar>
      </div>

      {result ? (
        <Results query={query} rows={result.rows} total={result.total} filtered={filtered} />
      ) : (
        <p className={`${errorBox} mt-6`}>
          The users couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      )}
    </>
  );
}

function Results({
  query,
  rows,
  total,
  filtered,
}: {
  query: UserQuery;
  rows: UserRow[];
  total: number;
  filtered: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <NoRows query={query} total={total} />
      </div>
    );
  }

  const th = "py-2 pr-4 font-medium whitespace-nowrap text-muted";
  const num = "py-3 pr-4 text-right tabular-nums";

  return (
    <section aria-labelledby="users-count" className="mt-6">
      <p id="users-count" className="text-sm text-muted">
        {filtered ? `${nouns(total, "user")} match` : nouns(total, "user")}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface px-4">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>Name</th>
              <th scope="col" className={th}>Profile email</th>
              <th scope="col" className={th}>Joined</th>
              <th scope="col" className={`${th} text-right`}>Posts</th>
              <th scope="col" className={`${th} text-right`}>Roasts</th>
              <th scope="col" className={`${th} text-right`}>Posted</th>
              <th scope="col" className={`${th} text-right`}>Votes cast</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const name = fullName(u.firstName, u.lastName);
              return (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/users/${u.id}`} className={textLink}>
                        {name ?? "No name yet"}
                      </Link>
                      {u.isSuperadmin && <Badge tone="accent">Superadmin</Badge>}
                    </span>
                  </th>
                  <td className="max-w-64 py-3 pr-4 break-words text-muted">
                    {u.profileEmail ?? "None"}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <time dateTime={u.createdAt}>{JOINED.format(new Date(u.createdAt))}</time>
                  </td>
                  <td className={num}>{u.activity.posts}</td>
                  <td className={num}>{u.activity.roasts}</td>
                  <td className={num}>{u.activity.publicRoasts}</td>
                  <td className={num}>{u.activity.votesCast}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Posts are the photos they sent to the panel, Roasts are the critics’ roasts on those photos,
        and Posted is how many of those they made public; legacy caption posts aren’t in these three.
        Votes cast counts every vote they made. Profile emails are typed by each person and can be
        changed by them; a user’s page also shows the email they sign in with.
      </p>
      <div className="mt-6">
        <Pagination pathname="/users" query={query} page={query.page} total={total} />
      </div>
    </section>
  );
}

function NoRows({ query, total }: { query: UserQuery; total: number }) {
  // A hand-typed ?page= past the last page
  if (total > 0) {
    return (
      <EmptyState
        title={`Page ${query.page} is past the end of the list.`}
        action={{ href: hrefWith("/users", query, { page: 1 }), label: "Go to page 1" }}
      />
    );
  }
  if (query.q) {
    return (
      <EmptyState
        title={`No users match '${query.q}'.`}
        action={{ href: hrefWith("/users", query, { q: null }), label: "Clear search" }}
      />
    );
  }
  if (query.role) {
    return (
      <EmptyState
        title="No superadmins match."
        action={{ href: hrefWith("/users", query, { role: null }), label: "Show everyone" }}
      />
    );
  }
  return (
    <EmptyState title="No users yet.">People appear here after they sign in to the app.</EmptyState>
  );
}
