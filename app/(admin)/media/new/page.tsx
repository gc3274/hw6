import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import RatingPill from "@/components/RatingPill";
import Thumb from "@/components/Thumb";
import { card, errorBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import { getPostForCreate, listRoastPosts, type PostForCreate, type RoastPost } from "@/lib/data/media";
import { requireSuperadmin } from "@/lib/dal";
import { CREATE_ERRORS, criticChoices } from "@/lib/media";
import { hrefWith, parsePage } from "@/lib/params";
import { topicInfo } from "@/lib/roasts";
import CreateRoastForm from "./CreateRoastForm";

export const metadata: Metadata = {
  title: "Generate a roast",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

// Also the limit for createRoast posted from this page: up to two 25-second
// Gemini tries plus the photo download and the insert
export const maxDuration = 60;

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const nouns = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const ownerName = (owner: { name: string | null }) => owner.name ?? "someone with no name yet";

export default async function NewMediaPage({ searchParams }: PageProps<"/media/new">) {
  await requireSuperadmin();

  const sp = await searchParams;
  const image = first(sp.image);
  if (!image) return <PickPost page={parsePage(sp.page)} />;
  if (!isUuid(image)) notFound();

  let post: PostForCreate | null = null;
  let failed = false;
  try {
    post = await getPostForCreate(image.toLowerCase());
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the post failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        <BackLink />
        <Heading />
        <p className={`${errorBox} mt-6`}>
          This post couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!post) notFound();

  return <PickCritic post={post} />;
}

function Heading() {
  return <h1 className="font-display text-3xl font-bold tracking-tight">Generate a roast</h1>;
}

function BackLink() {
  return (
    <p className="mb-4">
      <Link href="/media/new" className={`text-sm ${textLink}`}>
        All roast posts
      </Link>
    </p>
  );
}

async function PickPost({ page }: { page: number }) {
  let result: { rows: RoastPost[]; total: number } | null = null;
  try {
    result = await listRoastPosts(page);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the roast posts failed", error);
  }

  return (
    <>
      <p className="mb-4">
        <Link href="/media" className={`text-sm ${textLink}`}>
          All roasts
        </Link>
      </p>
      <Heading />
      <p className="mt-2 max-w-prose text-muted">
        Pick a post, then a critic from its panel. Gemini writes the roast in that critic’s voice,
        and it’s saved private under the post’s owner.
      </p>

      {!result ? (
        <p className={`${errorBox} mt-6`}>
          The posts couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      ) : result.rows.length === 0 ? (
        <div className="mt-6">
          {result.total > 0 ? (
            <EmptyState
              title={`Page ${page} is past the end of the list.`}
              action={{ href: "/media/new", label: "Go to page 1" }}
            />
          ) : (
            <EmptyState title="No roast posts yet.">
              Posts appear here after someone uploads in the app.
            </EmptyState>
          )}
        </div>
      ) : (
        <section aria-labelledby="posts-count" className="mt-6">
          <p id="posts-count" className="text-sm text-muted">
            {nouns(result.total, "roast post")}, newest first
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.rows.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </ul>
          <div className="mt-6">
            <Pagination pathname="/media/new" query={{ page }} page={page} total={result.total} />
          </div>
        </section>
      )}
    </>
  );
}

function PostCard({ post }: { post: RoastPost }) {
  const topic = topicInfo(post.topic);
  return (
    <li>
      <Link
        href={hrefWith("/media/new", {}, { image: post.id })}
        className={`flex h-full items-start gap-3 ${card} p-3 hover:border-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      >
        <Thumb src={post.imageUrl} alt="" size={64} />
        <span className="min-w-0 text-sm">
          <span className="block font-medium">
            <span aria-hidden="true">{topic?.emoji}</span> {topic?.label ?? "Roast"} post
          </span>
          <span className="block break-words text-muted">by {ownerName(post.owner)}</span>
          <span className="mt-1 block text-muted">
            {post.roasts === 0 ? "No roasts" : `${nouns(post.roasts, "roast")}, ${post.publicRoasts} posted`}
            {", "}
            <time dateTime={post.createdAt}>{DATE.format(new Date(post.createdAt))}</time>
          </span>
        </span>
      </Link>
    </li>
  );
}

function PickCritic({ post }: { post: PostForCreate }) {
  const topic = topicInfo(post.topic);
  const owner = (
    <Link href={`/users/${post.owner.id}`} className={textLink}>
      {ownerName(post.owner)}
    </Link>
  );

  // Legacy caption posts have no topic, so no panel; createRoast refuses them too
  if (!topic) {
    return (
      <>
        <BackLink />
        <Heading />
        <div className="mt-6">
          <EmptyState
            title={CREATE_ERRORS.legacy}
            action={{ href: "/media/new", label: "Pick a roast post" }}
          >
            This post is from before roast mode, so it has no topic and no critic panel.
          </EmptyState>
        </div>
      </>
    );
  }

  const { choices, preselect } = criticChoices(
    post.panel,
    post.roasts.map((r) => r.criticId),
  );

  return (
    <>
      <BackLink />
      <Heading />
      <p className="mt-2 max-w-prose text-muted">
        {topic.label} post by {owner}. The roast is saved private, so it shows only in the
        owner’s review screen until they post it.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="critic-heading" className={`${card} min-w-0 p-5 sm:p-6`}>
          <h2 id="critic-heading" className="text-xl font-semibold tracking-tight">
            Pick a critic
          </h2>
          <div className="mt-4">
            {choices.length === 0 ? (
              <p className={errorBox}>
                No critics are on this post’s panel. The critics table may be empty.
              </p>
            ) : (
              <CreateRoastForm
                imageId={post.id}
                choices={choices.map((c) => ({
                  id: c.id,
                  name: c.name,
                  emoji: c.emoji,
                  expertIn: topicInfo(c.topic)?.label ?? null,
                  existing: c.existing,
                }))}
                preselect={preselect}
              />
            )}
          </div>
        </section>

        <aside aria-label="About this post" className="min-w-0 space-y-6">
          <Image
            src={post.imageUrl}
            alt={`The ${topic.label.toLowerCase()} photo to roast`}
            width={640}
            height={640}
            sizes="(min-width: 1024px) 20rem, 100vw"
            className="aspect-square w-full rounded-xl border border-line bg-canvas object-cover"
          />
          <Panel post={post} />
        </aside>
      </div>
    </>
  );
}

function Panel({ post }: { post: PostForCreate }) {
  return (
    <section aria-labelledby="panel-heading">
      <h2 id="panel-heading" className="text-base font-semibold tracking-tight">
        Panel so far
      </h2>
      {post.roasts.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No roasts on this post yet.</p>
      ) : (
        <ul className={`${card} mt-2 divide-y divide-line`}>
          {post.roasts.map((r) => (
            <li key={r.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">
                  <span aria-hidden="true">{r.critic?.emoji}</span> {r.critic?.name ?? "Critic"}
                </span>
                <RatingPill rating={r.rating} />
                {!r.isPublic && <Badge>Private</Badge>}
              </div>
              <Link href={`/media/${r.id}`} className={`mt-1 line-clamp-2 text-sm ${textLink}`}>
                {r.content}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
