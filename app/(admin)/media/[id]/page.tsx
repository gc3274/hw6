import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import RatingPill from "@/components/RatingPill";
import { card, errorBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import { getMedia, type MediaDetail, type MediaSibling } from "@/lib/data/media";
import { requireSuperadmin } from "@/lib/dal";
import { canPublish } from "@/lib/media";
import { hrefWith } from "@/lib/params";
import { topicInfo } from "@/lib/roasts";
import DeleteRoastDialog from "./DeleteRoastDialog";
import RoastEditForm from "./RoastEditForm";

export const metadata: Metadata = {
  title: "Roast",
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

export default async function MediaDetailPage({ params, searchParams }: PageProps<"/media/[id]">) {
  await requireSuperadmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let media: MediaDetail | null = null;
  let failed = false;
  try {
    media = await getMedia(id.toLowerCase());
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the roast failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        <BackLink legacy={false} />
        <p className={`${errorBox} mt-6`}>
          This roast couldn’t load. The database didn’t answer, or this server is missing its
          service key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!media) notFound();

  // Set by deleteRoast when the delete itself failed
  const deleteFailed = first((await searchParams).error) === "delete";
  const legacy = media.critic === null;
  const topic = topicInfo(media.image.topic);
  const owner = (
    <Link href={`/users/${media.owner.id}`} className={textLink}>
      {media.owner.name ?? "someone with no name yet"}
    </Link>
  );

  return (
    <>
      <BackLink legacy={legacy} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight break-words">
          {media.critic ? (
            <>
              <span aria-hidden="true">{media.critic.emoji}</span> {media.critic.name}’s roast
            </>
          ) : (
            `${media.flavor ?? "Humor flavor"} caption`
          )}
        </h1>
        {legacy && <Badge>Legacy caption</Badge>}
        {media.isPublic ? <Badge tone="accent">Public</Badge> : <Badge>Private</Badge>}
      </div>
      <p className="mt-2 max-w-prose text-muted">
        {legacy ? (
          <>
            Written before roast mode, on a post by {owner}. Only its words and visibility can
            change.
          </>
        ) : (
          <>
            {topic ? `${topic.label} post` : "Post"} by {owner}.
          </>
        )}
      </p>

      {deleteFailed && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: the database didn’t answer. Try again.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="edit-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="edit-heading" className="text-xl font-semibold tracking-tight">
              Edit
            </h2>
            <p className="mt-1 text-sm text-muted">
              The words stay credited to the {legacy ? "caption’s voice" : "critic"}, and votes are
              kept.
            </p>
            <div className="mt-5">
              <RoastEditForm
                id={media.id}
                legacy={legacy}
                content={media.content}
                tip={media.tip}
                rating={media.rating}
                isPublic={media.isPublic}
                publishLocked={!canPublish({ isPublic: media.isPublic, postedAt: media.postedAt }, true)}
              />
            </div>
          </section>

          <Private media={media} />

          <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
              Delete
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Removes this {legacy ? "caption" : "roast"} and its votes from the database. The post
              and its photo stay.
            </p>
            <div className="mt-4">
              <DeleteRoastDialog
                id={media.id}
                votes={media.upvotes + media.downvotes}
                noun={legacy ? "caption" : "roast"}
              />
            </div>
          </section>
        </div>

        <aside aria-label="About this post" className="min-w-0 space-y-6">
          <Image
            src={media.image.url}
            alt={topic ? `The ${topic.label.toLowerCase()} photo this roast is about` : "The photo this caption is about"}
            width={640}
            height={640}
            sizes="(min-width: 1024px) 20rem, 100vw"
            className="aspect-square w-full rounded-xl border border-line bg-canvas object-cover"
          />
          <Facts media={media} />
          <Siblings media={media} />
        </aside>
      </div>
    </>
  );
}

function BackLink({ legacy }: { legacy: boolean }) {
  return legacy ? (
    <Link href={hrefWith("/media", {}, { kind: "legacy" })} className={`text-sm ${textLink}`}>
      All legacy captions
    </Link>
  ) : (
    <Link href="/media" className={`text-sm ${textLink}`}>
      All roasts
    </Link>
  );
}

function Facts({ media }: { media: MediaDetail }) {
  // posted_at is the first time it went public; hiding it later keeps the stamp
  const posted = media.postedAt ? (
    media.isPublic ? (
      <When iso={media.postedAt} />
    ) : (
      <>
        <When iso={media.postedAt} />, now hidden
      </>
    )
  ) : (
    "Never by the owner"
  );

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
      {media.critic && (
        <Fact term="Score">
          <RatingPill rating={media.rating} />
        </Fact>
      )}
      <Fact term="Votes">
        <span className="tabular-nums">
          {media.upvotes} up, {media.downvotes} down
        </span>
      </Fact>
      <Fact term="Posted">{posted}</Fact>
      <Fact term="Written">
        <When iso={media.createdAt} />
      </Fact>
      <Fact term="Model" wide>
        <span className="break-all">{media.model}</span>
      </Fact>
    </dl>
  );
}

function Fact({ term, wide = false, children }: { term: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-muted">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

// captions.prompt and images.context are readable only with the service role.
// They are shown here and nowhere else.
function Private({ media }: { media: MediaDetail }) {
  return (
    <section aria-labelledby="private-heading" className={`${card} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="private-heading" className="text-xl font-semibold tracking-tight">
          Behind the {media.critic ? "roast" : "caption"}
        </h2>
        <Badge>Private, never shown in the app</Badge>
      </div>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-muted">Note from the uploader</dt>
          <dd className="mt-1 break-words">
            {media.uploaderNote ?? <span className="text-muted">They left no note.</span>}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Prompt sent to the model</dt>
          <dd className="mt-1">
            <details>
              <summary className={`w-fit cursor-pointer ${textLink}`}>Show the prompt</summary>
              <p className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-line bg-canvas p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
                {media.prompt}
              </p>
            </details>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Siblings({ media }: { media: MediaDetail }) {
  const legacy = media.critic === null;
  return (
    <section aria-labelledby="siblings-heading">
      <h2 id="siblings-heading" className="text-base font-semibold tracking-tight">
        {legacy ? "Other captions on this post" : "Rest of the panel"}
      </h2>
      {media.siblings.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          {legacy ? "None." : "This is the only roast on the post."}
        </p>
      ) : (
        <ul className={`${card} mt-2 divide-y divide-line`}>
          {media.siblings.map((s) => (
            <SiblingItem key={s.id} sibling={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SiblingItem({ sibling }: { sibling: MediaSibling }) {
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {sibling.critic ? (
          <span className="font-medium">
            <span aria-hidden="true">{sibling.critic.emoji}</span> {sibling.critic.name}
          </span>
        ) : (
          <span className="font-medium">{sibling.flavor ?? "Legacy caption"}</span>
        )}
        {sibling.critic && <RatingPill rating={sibling.rating} />}
        {!sibling.isPublic && <Badge>Private</Badge>}
      </div>
      <Link href={`/media/${sibling.id}`} className={`mt-1 line-clamp-2 text-sm ${textLink}`}>
        {sibling.content}
      </Link>
    </li>
  );
}
