import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import Badge from "@/components/Badge";
import ConfirmDelete from "@/components/ConfirmDelete";
import { button, card, errorBox, noticeBox, textLink } from "@/components/ui";
import { isUuid } from "@/lib/captions";
import { getImage, type ImageCaption, type ImageDetail } from "@/lib/data/images";
import { requireSuperadmin } from "@/lib/dal";
import { nouns } from "@/lib/format";
import { deleteWarning, topicLock } from "@/lib/images";
import { hrefWith } from "@/lib/params";
import { topicInfo } from "@/lib/roasts";
import { deleteImage } from "../actions";
import ImageEditForm from "./ImageEditForm";

export const metadata: Metadata = {
  title: "Photo",
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

const backLink = (
  <Link href="/images" className={`text-sm ${textLink}`}>
    All photos
  </Link>
);

export default async function ImagePage({ params, searchParams }: PageProps<"/images/[id]">) {
  const { userId } = await requireSuperadmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  let image: ImageDetail | null = null;
  let failed = false;
  try {
    image = await getImage(id.toLowerCase());
  } catch (error) {
    unstable_rethrow(error);
    console.error("Loading the photo failed", error);
    failed = true;
  }

  if (failed) {
    return (
      <>
        {backLink}
        <p className={`${errorBox} mt-6`}>
          This photo couldn’t load. The database didn’t answer, or this server is missing its service
          key. Reload the page to try again.
        </p>
      </>
    );
  }
  if (!image) notFound();

  const sp = await searchParams;
  // Set by deleteImage when the delete itself failed
  const deleteFailed = first(sp.error) === "delete";
  // Set by createImage after it saves the upload
  const created = !deleteFailed && first(sp.created) === "1";
  const topic = topicInfo(image.topic);
  const legacy = topic === null;
  const yours = image.owner.id === userId;
  const owner = (
    <Link href={`/users/${image.owner.id}`} className={textLink}>
      {image.owner.name ?? "someone with no name yet"}
    </Link>
  );

  return (
    <>
      {backLink}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {topic ? (
            <>
              <span aria-hidden="true">{topic.emoji}</span> {topic.label} photo
            </>
          ) : (
            "Caption photo"
          )}
        </h1>
        {legacy && <Badge>Legacy</Badge>}
      </div>
      <p className="mt-2 max-w-prose text-muted">
        {legacy ? "Posted before roast mode by " : "Posted by "}
        {owner}
        {yours && " (you)"} on <When iso={image.createdAt} />.
      </p>

      {deleteFailed && (
        <p role="alert" className={`${errorBox} mt-6`}>
          Couldn’t delete: the database didn’t answer. Try again.
        </p>
      )}
      {created && (
        <p role="status" className={`${noticeBox} mt-6`}>
          Uploaded under your account. It stays private in the main app until a roast is posted.
          Generate its first roast below.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <Captions image={image} />

          <section aria-labelledby="edit-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="edit-heading" className="text-xl font-semibold tracking-tight">
              Edit
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              The photo itself can’t be replaced: its roasts were written about it.
            </p>
            <div className="mt-5">
              <ImageEditForm
                id={image.id}
                note={image.note}
                topic={image.topic}
                lock={topicLock({ topic: image.topic, captionCount: image.captions.length })}
              />
            </div>
          </section>

          <section aria-labelledby="delete-heading" className={`${card} p-5 sm:p-6`}>
            <h2 id="delete-heading" className="text-xl font-semibold tracking-tight">
              Delete
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Removes the photo, its {legacy ? "captions" : "roasts"} and their votes, then its file
              in storage.
            </p>
            <div className="mt-4">
              <ConfirmDelete
                action={deleteImage}
                fields={{ id: image.id }}
                noun="photo"
                warning={deleteWarning(
                  image.captions.length,
                  image.votes,
                  legacy ? ["legacy caption", "legacy captions"] : undefined,
                )}
              />
            </div>
          </section>
        </div>

        <aside aria-label="About this photo" className="min-w-0 space-y-6">
          <Image
            src={image.imageUrl}
            alt={topic ? `The ${topic.label.toLowerCase()} photo` : "The legacy caption photo"}
            width={640}
            height={640}
            sizes="(min-width: 1024px) 20rem, 100vw"
            className="aspect-square w-full rounded-xl border border-line bg-canvas object-cover"
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Fact term="Owner" wide>
              <span className="break-words">
                {owner}
                {yours && " (you)"}
              </span>
            </Fact>
            <Fact term="Topic">{topic ? topic.label : <Badge>Legacy</Badge>}</Fact>
            <Fact term="Uploaded">
              <When iso={image.createdAt} />
            </Fact>
            <Fact term="Votes">
              <span className="tabular-nums">{image.votes.toLocaleString("en-US")}</span>
            </Fact>
            <Fact term="Roast runs">
              <span className="tabular-nums">{image.runs.toLocaleString("en-US")}</span>{" "}
              <Link href="/requests" className={textLink}>
                Request log
              </Link>
            </Fact>
          </dl>
        </aside>
      </div>
    </>
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

function Captions({ image }: { image: ImageDetail }) {
  const legacy = image.topic === null;
  const count = image.captions.length;
  const heading = legacy
    ? count === 0
      ? "Legacy captions"
      : nouns(count, "legacy caption")
    : count === 0
      ? "Roasts"
      : nouns(count, "roast");

  return (
    <section aria-labelledby="captions-heading" className={`${card} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="captions-heading" className="text-xl font-semibold tracking-tight">
          {heading}
        </h2>
        {/* Legacy photos have no topic, so no critic panel; createRoast refuses them too */}
        {!legacy && (
          <Link href={hrefWith("/media/new", {}, { image: image.id })} className={button("secondary", "sm")}>
            Generate a roast
          </Link>
        )}
      </div>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {legacy ? "No captions are left on this photo." : "No roasts yet. Generate one to start its panel."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {image.captions.map((c) => (
            <CaptionItem key={c.id} caption={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CaptionItem({ caption }: { caption: ImageCaption }) {
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {caption.critic ? (
          <span className="font-medium">
            <span aria-hidden="true">{caption.critic.emoji}</span> {caption.critic.name}
          </span>
        ) : (
          <span className="font-medium">{caption.flavor ?? "Legacy caption"}</span>
        )}
        {caption.isPublic ? <Badge tone="accent">Public</Badge> : <Badge>Private</Badge>}
        <span className="text-muted tabular-nums">{nouns(caption.votes, "vote")}</span>
      </div>
      <Link href={`/media/${caption.id}`} className={`mt-1 line-clamp-2 text-sm ${textLink}`}>
        {caption.content}
      </Link>
    </li>
  );
}
