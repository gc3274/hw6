import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import RatingPill from "@/components/RatingPill";
import Thumb from "@/components/Thumb";
import { card, errorBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import {
  getUserDetail,
  POSTS_LIMIT,
  VOTES_LIMIT,
  type UserDetail,
  type UserPost,
  type UserVote,
} from "@/lib/data/users";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { hrefWith } from "@/lib/params";
import { panelScore, topicInfo } from "@/lib/roasts";
import { fullName } from "@/lib/users";

export const metadata: Metadata = {
  title: "User",
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

const backLink = (
  <Link href="/users" className={`text-sm ${textLink}`}>
    All users
  </Link>
);

export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  await requireSuperadmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let user: UserDetail | null = null;
  let failed = false;
  try {
    user = await getUserDetail(id.toLowerCase());
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the user failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This user couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!user) notFound();

  const name = fullName(user.firstName, user.lastName);

  return (
    <>
      {backLink}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight break-words">
          {name ?? "No name yet"}
        </h1>
        {user.isSuperadmin && <Badge tone="accent">Superadmin</Badge>}
      </div>
      <p className="mt-2 text-muted">
        Joined <When iso={user.createdAt} />. Read only: profiles are edited by their owners.
      </p>

      <Account user={user} />

      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-8">
        <Posts user={user} />
        <Votes user={user} />
      </div>
    </>
  );
}

function Account({ user }: { user: UserDetail }) {
  const none = <span className="text-muted">None</span>;
  return (
    <section aria-labelledby="account-heading" className={`${card} mt-8 p-5 sm:p-6`}>
      <h2 id="account-heading" className="text-xl font-semibold tracking-tight">
        Account
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Field
          term="Sign-in email"
          note="From the Google account they sign in with. This is the one to trust."
        >
          {user.signInEmail ?? (
            <span className="text-muted">Couldn’t be read from Supabase Auth. Reload to try again.</span>
          )}
        </Field>
        <Field
          term={
            <span className="flex flex-wrap items-center gap-2">
              Profile email <Badge>User-supplied</Badge>
            </span>
          }
          note="Typed on their profile, and they can change it to anything."
        >
          {user.profileEmail ?? none}
        </Field>
        <Field term="Bio">{user.bio ?? none}</Field>
        <Field term="Profile last updated">
          <When iso={user.updatedAt} />
        </Field>
        <Field term="User ID">
          <span className="break-all">{user.id}</span>
        </Field>
      </dl>
    </section>
  );
}

function Field({ term, note, children }: { term: ReactNode; note?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="mt-1 break-words">{children}</dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Posts({ user }: { user: UserDetail }) {
  const { posts, postCount } = user;
  return (
    <section aria-labelledby="posts-heading" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="posts-heading" className="text-xl font-semibold tracking-tight">
          Posts
        </h2>
        {postCount > 0 && (
          <Link href={hrefWith("/media", {}, { owner: user.id })} className={`text-sm ${textLink}`}>
            See their roasts
          </Link>
        )}
      </div>
      {postCount > 0 && (
        <p className="mt-1 text-sm text-muted">
          {postCount > POSTS_LIMIT
            ? `Latest ${POSTS_LIMIT} of ${postCount.toLocaleString("en-US")}, newest first.`
            : `${nouns(postCount, "post")}, newest first.`}
        </p>
      )}
      {posts.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No posts yet.">
            Posts appear here after they upload a photo in the app.
          </EmptyState>
        </div>
      ) : (
        <ul className={`${card} mt-4 divide-y divide-line`}>
          {posts.map((p) => (
            <PostItem key={p.id} post={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PostItem({ post }: { post: UserPost }) {
  const topic = topicInfo(post.topic);
  const legacy = post.topic === null;
  const roasts = post.roastRatings.length;
  const href = hrefWith("/media", {}, { image: post.id, kind: legacy ? "legacy" : null });

  return (
    <li className="flex items-start gap-4 p-4">
      <Thumb src={post.imageUrl} alt={topic ? `${topic.label} post` : "Legacy caption post"} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {topic ? (
            <span className="font-medium">
              <span aria-hidden="true">{topic.emoji}</span> {topic.label}
            </span>
          ) : (
            <Badge>Legacy caption</Badge>
          )}
          <span className="text-sm text-muted">
            <When iso={post.createdAt} />
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {legacy
            ? nouns(post.legacyCaptions, "caption")
            : roasts === 0
              ? "No roasts"
              : `${nouns(roasts, "roast")}, ${post.publicRoasts} posted`}
        </p>
        <Link href={href} className={`mt-2 inline-block text-sm ${textLink}`}>
          {legacy ? "Open captions" : "Open roasts"}
        </Link>
      </div>
      {!legacy && roasts > 0 && (
        <div className="shrink-0 text-right">
          <p className="sr-only">Panel score</p>
          <RatingPill rating={panelScore(post.roastRatings)} />
        </div>
      )}
    </li>
  );
}

function Votes({ user }: { user: UserDetail }) {
  const { votes, upvotes, downvotes } = user;
  const total = upvotes + downvotes;
  return (
    <section aria-labelledby="votes-heading" className="min-w-0">
      <h2 id="votes-heading" className="text-xl font-semibold tracking-tight">
        Votes cast
      </h2>
      {total > 0 && (
        <p className="mt-1 text-sm text-muted">
          {`${upvotes.toLocaleString("en-US")} up, ${downvotes.toLocaleString("en-US")} down. ${
            total > VOTES_LIMIT ? `Latest ${VOTES_LIMIT} below.` : "Newest first."
          }`}
        </p>
      )}
      {votes.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No votes yet.">
            Votes appear here when they vote on public roasts in the app.
          </EmptyState>
        </div>
      ) : (
        <ul className={`${card} mt-4 divide-y divide-line`}>
          {votes.map((v) => (
            <VoteItem key={v.captionId} vote={v} />
          ))}
        </ul>
      )}
    </section>
  );
}

function VoteItem({ vote }: { vote: UserVote }) {
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={vote.value === 1 ? "accent" : "neutral"}>{vote.value === 1 ? "Up" : "Down"}</Badge>
        {vote.critic ? (
          <span className="text-sm font-medium">
            <span aria-hidden="true">{vote.critic.emoji}</span> {vote.critic.name}
          </span>
        ) : (
          <Badge>Legacy caption</Badge>
        )}
        {vote.ownPost && <Badge>Self-vote</Badge>}
        <span className="text-sm text-muted">
          <When iso={vote.createdAt} />
        </span>
      </div>
      <Link href={`/media/${vote.captionId}`} className={`mt-2 line-clamp-2 text-sm ${textLink}`}>
        {vote.content ?? "Open this roast"}
      </Link>
    </li>
  );
}
