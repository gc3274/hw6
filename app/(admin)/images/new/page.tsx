import type { Metadata } from "next";
import Link from "next/link";
import { card, textLink } from "@/components/ui";
import { requireSuperadmin } from "@/lib/dal";
import UploadForm from "./UploadForm";

export const metadata: Metadata = {
  title: "Upload a photo",
};

// Read on every request: this page must never be prerendered with service-role data
export const dynamic = "force-dynamic";

export default async function NewImagePage() {
  await requireSuperadmin();

  return (
    <>
      <Link href="/images" className={`text-sm ${textLink}`}>
        All photos
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Upload a photo</h1>
      <div className="mt-2 max-w-prose space-y-2 text-muted">
        <p>
          The photo is posted under your own account in the main app: it shows on your dashboard
          there, and you post its roasts from there. Nothing is public until a roast is posted.
        </p>
        <p>After uploading, you can generate roasts for it from its page here.</p>
      </div>

      <section aria-label="New photo" className={`${card} mt-8 max-w-2xl p-5 sm:p-6`}>
        <UploadForm />
      </section>
    </>
  );
}
