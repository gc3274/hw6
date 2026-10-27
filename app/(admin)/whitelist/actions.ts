"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { emailWriteErrors, validateEmail, type EmailState } from "@/lib/access";
import { requireSuperadmin } from "@/lib/dal";
import { DB_DOWN, parseId } from "@/lib/forms";
import { adminDb } from "@/lib/supabase/admin";

const GONE: EmailState = { ok: false, message: "This address is no longer on the list. Go back to the list." };
const FAILED: EmailState = { ok: false, message: DB_DOWN };

// The hook reads the list on every sign-up, so a change applies to the next one.
// One field, so a field error needs no message of its own next to the button.
export async function createAddress(_prev: EmailState, fd: FormData): Promise<EmailState> {
  await requireSuperadmin();

  const result = validateEmail(fd);
  if (!result.ok) return { ok: false, message: "", errors: result.errors };

  try {
    const db = await adminDb();
    const { error } = await db.from("whitelisted_email_addresses").insert({ email_address: result.value });
    if (error) {
      const errors = emailWriteErrors(error);
      if (errors) return { ok: false, message: "", errors };
      console.error("Adding the address failed", error);
      return FAILED;
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("Adding the address failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing
  redirect("/whitelist?created=1");
}

export async function updateAddress(_prev: EmailState, fd: FormData): Promise<EmailState> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) return GONE;

  try {
    const db = await adminDb();
    const { data: row, error: readError } = await db
      .from("whitelisted_email_addresses")
      .select("id")
      .eq("id", id)
      .maybeSingle<{ id: number }>();
    if (readError) {
      console.error("Reading the address before saving failed", readError);
      return FAILED;
    }
    if (!row) return GONE;

    const result = validateEmail(fd);
    if (!result.ok) return { ok: false, message: "", errors: result.errors };

    const { data: saved, error } = await db
      .from("whitelisted_email_addresses")
      .update({ email_address: result.value })
      .eq("id", row.id)
      .select("id");
    if (error) {
      const errors = emailWriteErrors(error);
      if (errors) return { ok: false, message: "", errors };
      console.error("Saving the address failed", error);
      return FAILED;
    }
    if (!saved || saved.length === 0) return GONE;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Saving the address failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// The returned row tells a delete from a row that was already gone
export async function deleteAddress(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) redirect("/whitelist?error=gone");

  let outcome: "deleted" | "gone" | "failed";
  try {
    const db = await adminDb();
    const { data, error } = await db.from("whitelisted_email_addresses").delete().eq("id", id).select("id");
    if (error) console.error("Deleting the address failed", error);
    outcome = error ? "failed" : data && data.length > 0 ? "deleted" : "gone";
  } catch (error) {
    unstable_rethrow(error);
    console.error("Deleting the address failed", error);
    outcome = "failed";
  }

  if (outcome === "failed") redirect(`/whitelist/${id}?error=delete`);
  if (outcome === "gone") redirect("/whitelist?error=gone");
  revalidatePath("/", "layout");
  redirect("/whitelist?deleted=1");
}
