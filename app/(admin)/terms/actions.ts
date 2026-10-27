"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireSuperadmin } from "@/lib/dal";
import { DB_DOWN, FIX_FIELDS, parseId } from "@/lib/forms";
import { adminDb } from "@/lib/supabase/admin";
import { termWriteErrors, validateTerm, type TermState } from "@/lib/terms";

const GONE: TermState = { ok: false, message: "This term no longer exists. Go back to the list." };
const FAILED: TermState = { ok: false, message: DB_DOWN };

// Prompts read terms on every roast, so a saved change applies to the next one
export async function createTerm(_prev: TermState, fd: FormData): Promise<TermState> {
  await requireSuperadmin();

  const result = validateTerm(fd);
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  let id: number;
  try {
    const db = await adminDb();
    const { data, error } = await db.from("terms").insert(result.values).select("id").single<{ id: number }>();
    if (error || !data) {
      const errors = termWriteErrors(error);
      if (errors) return { ok: false, message: FIX_FIELDS, errors };
      console.error("Adding the term failed", error);
      return FAILED;
    }
    id = data.id;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Adding the term failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing
  redirect(`/terms/${id}?created=1`);
}

export async function updateTerm(_prev: TermState, fd: FormData): Promise<TermState> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) return GONE;

  try {
    const db = await adminDb();
    const { data: row, error: readError } = await db
      .from("terms")
      .select("id")
      .eq("id", id)
      .maybeSingle<{ id: number }>();
    if (readError) {
      console.error("Reading the term before saving failed", readError);
      return FAILED;
    }
    if (!row) return GONE;

    const result = validateTerm(fd);
    if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

    const { data: saved, error } = await db.from("terms").update(result.values).eq("id", row.id).select("id");
    if (error) {
      const errors = termWriteErrors(error);
      if (errors) return { ok: false, message: FIX_FIELDS, errors };
      console.error("Saving the term failed", error);
      return FAILED;
    }
    if (!saved || saved.length === 0) return GONE;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Saving the term failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// The returned row tells a delete from a row that was already gone
export async function deleteTerm(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) redirect("/terms?error=gone");

  let outcome: "deleted" | "gone" | "failed";
  try {
    const db = await adminDb();
    const { data, error } = await db.from("terms").delete().eq("id", id).select("id");
    if (error) console.error("Deleting the term failed", error);
    outcome = error ? "failed" : data && data.length > 0 ? "deleted" : "gone";
  } catch (error) {
    unstable_rethrow(error);
    console.error("Deleting the term failed", error);
    outcome = "failed";
  }

  if (outcome === "failed") redirect(`/terms/${id}?error=delete`);
  if (outcome === "gone") redirect("/terms?error=gone");
  revalidatePath("/", "layout");
  redirect("/terms?deleted=1");
}
