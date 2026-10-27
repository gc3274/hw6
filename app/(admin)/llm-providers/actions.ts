"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/dal";
import { DB_DOWN, FIX_FIELDS, isStillReferenced, parseId, type FormState } from "@/lib/forms";
import {
  providerConstraintErrors,
  validateProviderCreate,
  validateProviderEdit,
  type ProviderField,
} from "@/lib/llm";
import { hrefWith } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

type State = FormState<ProviderField>;

const GONE: State = { ok: false, message: "This provider no longer exists. Go back to the list." };

export async function createProvider(_prev: State, fd: FormData): Promise<State> {
  await requireSuperadmin();

  const result = validateProviderCreate(fd);
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  const db = await adminDb();
  const { data, error } = await db
    .from("llm_providers")
    .insert(result.values)
    .select("id")
    .single<{ id: number }>();
  if (error || !data) {
    const errors = providerConstraintErrors(error);
    if (errors) return { ok: false, message: FIX_FIELDS, errors };
    console.error("Creating the provider failed", error);
    return { ok: false, message: DB_DOWN };
  }

  revalidatePath("/", "layout");
  redirect(`/llm-providers/${data.id}?created=1`);
}

// The name only: the app matches providers by slug, so it never changes
export async function updateProvider(_prev: State, fd: FormData): Promise<State> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) return GONE;

  const db = await adminDb();
  const { data: row, error: readError } = await db
    .from("llm_providers")
    .select("id")
    .eq("id", id)
    .maybeSingle<{ id: number }>();
  if (readError) {
    console.error("Reading the provider before saving failed", readError);
    return { ok: false, message: DB_DOWN };
  }
  if (!row) return GONE;

  const result = validateProviderEdit(fd);
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  const { data: saved, error } = await db
    .from("llm_providers")
    .update(result.values)
    .eq("id", row.id)
    .select("id");
  if (error) {
    const errors = providerConstraintErrors(error);
    if (errors) return { ok: false, message: FIX_FIELDS, errors };
    console.error("Saving the provider failed", error);
    return { ok: false, message: DB_DOWN };
  }
  if (!saved || saved.length === 0) return GONE;

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// Refused while any model uses it; llm_models restricts the delete as a backstop
export async function deleteProvider(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) redirect(hrefWith("/llm-providers", {}, { error: "gone" }));
  const here = `/llm-providers/${id}`;

  const db = await adminDb();
  const [providerRead, modelsRead] = await Promise.all([
    db.from("llm_providers").select("id").eq("id", id).maybeSingle<{ id: number }>(),
    db.from("llm_models").select("id", { count: "exact", head: true }).eq("llm_provider_id", id),
  ]);
  if (providerRead.error || modelsRead.error) {
    console.error("Reading the provider before deleting failed", providerRead.error ?? modelsRead.error);
    redirect(hrefWith(here, {}, { error: "delete" }));
  }
  if (!providerRead.data) redirect(hrefWith("/llm-providers", {}, { error: "gone" }));
  if ((modelsRead.count ?? 0) > 0) redirect(hrefWith(here, {}, { error: "in_use" }));

  const { data, error } = await db.from("llm_providers").delete().eq("id", id).select("id");
  if (error) {
    if (isStillReferenced(error)) redirect(hrefWith(here, {}, { error: "in_use" }));
    console.error("Deleting the provider failed", error);
    redirect(hrefWith(here, {}, { error: "delete" }));
  }
  if (!data || data.length === 0) redirect(hrefWith("/llm-providers", {}, { error: "gone" }));

  revalidatePath("/", "layout");
  redirect(hrefWith("/llm-providers", {}, { deleted: 1 }));
}
