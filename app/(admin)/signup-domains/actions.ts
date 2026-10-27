"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { domainWriteErrors, validateDomain, type DomainState } from "@/lib/access";
import { requireSuperadmin } from "@/lib/dal";
import { DB_DOWN, parseId } from "@/lib/forms";
import { adminDb } from "@/lib/supabase/admin";

const GONE: DomainState = { ok: false, message: "This domain is no longer on the list. Go back to the list." };
const FAILED: DomainState = { ok: false, message: DB_DOWN };

// The hook reads the list on every sign-up, so a change applies to the next one.
// One field, so a field error needs no message of its own next to the button.
export async function createDomain(_prev: DomainState, fd: FormData): Promise<DomainState> {
  await requireSuperadmin();

  const result = validateDomain(fd);
  if (!result.ok) return { ok: false, message: "", errors: result.errors };

  try {
    const db = await adminDb();
    const { error } = await db.from("allowed_signup_domains").insert({ apex_domain: result.value });
    if (error) {
      const errors = domainWriteErrors(error);
      if (errors) return { ok: false, message: "", errors };
      console.error("Adding the domain failed", error);
      return FAILED;
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("Adding the domain failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing
  redirect("/signup-domains?created=1");
}

export async function updateDomain(_prev: DomainState, fd: FormData): Promise<DomainState> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) return GONE;

  try {
    const db = await adminDb();
    const { data: row, error: readError } = await db
      .from("allowed_signup_domains")
      .select("id")
      .eq("id", id)
      .maybeSingle<{ id: number }>();
    if (readError) {
      console.error("Reading the domain before saving failed", readError);
      return FAILED;
    }
    if (!row) return GONE;

    const result = validateDomain(fd);
    if (!result.ok) return { ok: false, message: "", errors: result.errors };

    const { data: saved, error } = await db
      .from("allowed_signup_domains")
      .update({ apex_domain: result.value })
      .eq("id", row.id)
      .select("id");
    if (error) {
      const errors = domainWriteErrors(error);
      if (errors) return { ok: false, message: "", errors };
      console.error("Saving the domain failed", error);
      return FAILED;
    }
    if (!saved || saved.length === 0) return GONE;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Saving the domain failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// The returned row tells a delete from a row that was already gone
export async function deleteDomain(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) redirect("/signup-domains?error=gone");

  let outcome: "deleted" | "gone" | "failed";
  try {
    const db = await adminDb();
    const { data, error } = await db.from("allowed_signup_domains").delete().eq("id", id).select("id");
    if (error) console.error("Deleting the domain failed", error);
    outcome = error ? "failed" : data && data.length > 0 ? "deleted" : "gone";
  } catch (error) {
    unstable_rethrow(error);
    console.error("Deleting the domain failed", error);
    outcome = "failed";
  }

  if (outcome === "failed") redirect(`/signup-domains/${id}?error=delete`);
  if (outcome === "gone") redirect("/signup-domains?error=gone");
  revalidatePath("/", "layout");
  redirect("/signup-domains?deleted=1");
}
