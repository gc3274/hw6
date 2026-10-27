"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireSuperadmin } from "@/lib/dal";
import { exampleWriteErrors, validateExample, type ExampleState } from "@/lib/examples";
import { DB_DOWN, FIX_FIELDS, parseId } from "@/lib/forms";
import { adminDb } from "@/lib/supabase/admin";

const GONE: ExampleState = { ok: false, message: "This example no longer exists. Go back to the list." };
const FAILED: ExampleState = { ok: false, message: DB_DOWN };

// Prompts read examples on every roast, so a saved change applies to the next one
export async function createExample(_prev: ExampleState, fd: FormData): Promise<ExampleState> {
  await requireSuperadmin();

  const result = validateExample(fd);
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  let id: number;
  try {
    const db = await adminDb();
    const { data, error } = await db
      .from("generation_examples")
      .insert(result.values)
      .select("id")
      .single<{ id: number }>();
    if (error || !data) {
      const errors = exampleWriteErrors(error);
      if (errors) return { ok: false, message: FIX_FIELDS, errors };
      console.error("Adding the example failed", error);
      return FAILED;
    }
    id = data.id;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Adding the example failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing
  redirect(`/examples/${id}?created=1`);
}

export async function updateExample(_prev: ExampleState, fd: FormData): Promise<ExampleState> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) return GONE;

  try {
    const db = await adminDb();
    const { data: row, error: readError } = await db
      .from("generation_examples")
      .select("id")
      .eq("id", id)
      .maybeSingle<{ id: number }>();
    if (readError) {
      console.error("Reading the example before saving failed", readError);
      return FAILED;
    }
    if (!row) return GONE;

    const result = validateExample(fd);
    if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

    const { data: saved, error } = await db
      .from("generation_examples")
      .update(result.values)
      .eq("id", row.id)
      .select("id");
    if (error) {
      const errors = exampleWriteErrors(error);
      if (errors) return { ok: false, message: FIX_FIELDS, errors };
      console.error("Saving the example failed", error);
      return FAILED;
    }
    if (!saved || saved.length === 0) return GONE;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Saving the example failed", error);
    return FAILED;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// The returned row tells a delete from a row that was already gone
export async function deleteExample(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) redirect("/examples?error=gone");

  let outcome: "deleted" | "gone" | "failed";
  try {
    const db = await adminDb();
    const { data, error } = await db.from("generation_examples").delete().eq("id", id).select("id");
    if (error) console.error("Deleting the example failed", error);
    outcome = error ? "failed" : data && data.length > 0 ? "deleted" : "gone";
  } catch (error) {
    unstable_rethrow(error);
    console.error("Deleting the example failed", error);
    outcome = "failed";
  }

  if (outcome === "failed") redirect(`/examples/${id}?error=delete`);
  if (outcome === "gone") redirect("/examples?error=gone");
  revalidatePath("/", "layout");
  redirect("/examples?deleted=1");
}
