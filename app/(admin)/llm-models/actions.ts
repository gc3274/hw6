"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/dal";
import { DB_DOWN, FIX_FIELDS, isStillReferenced, parseId, type FormState } from "@/lib/forms";
import { modelConstraintErrors, PROVIDER_GONE, validateModel, type ModelField } from "@/lib/llm";
import { hrefWith } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

type State = FormState<ModelField>;
type Db = Awaited<ReturnType<typeof adminDb>>;

const GONE: State = { ok: false, message: "This model no longer exists. Go back to the list." };
const NO_PROVIDER: State = { ok: false, message: FIX_FIELDS, errors: { llm_provider_id: PROVIDER_GONE } };

// The chosen provider must still exist; null when the read itself failed
async function providerExists(db: Db, id: number): Promise<boolean | null> {
  const { data, error } = await db.from("llm_providers").select("id").eq("id", id).maybeSingle<{ id: number }>();
  if (error) {
    console.error("Reading the model's provider failed", error);
    return null;
  }
  return data !== null;
}

// A write's error as the form's state: a field the admin can fix, or the database being down
function writeFailure(what: string, error: { code?: string; message?: string }): State {
  const errors = modelConstraintErrors(error);
  if (errors) return { ok: false, message: FIX_FIELDS, errors };
  // 23503 here is the provider foreign key: it was deleted after the check above
  if (isStillReferenced(error)) return NO_PROVIDER;
  console.error(what, error);
  return { ok: false, message: DB_DOWN };
}

export async function createModel(_prev: State, fd: FormData): Promise<State> {
  await requireSuperadmin();

  const result = validateModel(fd);
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  const db = await adminDb();
  const exists = await providerExists(db, result.values.llm_provider_id);
  if (exists === null) return { ok: false, message: DB_DOWN };
  if (!exists) return NO_PROVIDER;

  const { data, error } = await db
    .from("llm_models")
    .insert(result.values)
    .select("id")
    .single<{ id: number }>();
  if (error || !data) return writeFailure("Creating the model failed", error ?? {});

  revalidatePath("/", "layout");
  redirect(`/llm-models/${data.id}?created=1`);
}

// Changing provider_model_id changes what every step using it calls on the next run
export async function updateModel(_prev: State, fd: FormData): Promise<State> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) return GONE;

  const db = await adminDb();
  const { data: row, error: readError } = await db
    .from("llm_models")
    .select("id")
    .eq("id", id)
    .maybeSingle<{ id: number }>();
  if (readError) {
    console.error("Reading the model before saving failed", readError);
    return { ok: false, message: DB_DOWN };
  }
  if (!row) return GONE;

  const result = validateModel(fd);
  if (!result.ok) return { ok: false, message: FIX_FIELDS, errors: result.errors };

  const exists = await providerExists(db, result.values.llm_provider_id);
  if (exists === null) return { ok: false, message: DB_DOWN };
  if (!exists) return NO_PROVIDER;

  const { data: saved, error } = await db.from("llm_models").update(result.values).eq("id", row.id).select("id");
  if (error) return writeFailure("Saving the model failed", error);
  if (!saved || saved.length === 0) return GONE;

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

// Refused while any chain step uses it (prompt_chain_steps restricts the delete).
// llm_responses keep their provider_model_id; their llm_model_id goes null.
export async function deleteModel(fd: FormData): Promise<void> {
  await requireSuperadmin();

  const id = parseId(fd.get("id"));
  if (id === null) redirect(hrefWith("/llm-models", {}, { error: "gone" }));
  const here = `/llm-models/${id}`;

  const db = await adminDb();
  const [modelRead, stepsRead] = await Promise.all([
    db.from("llm_models").select("id").eq("id", id).maybeSingle<{ id: number }>(),
    db.from("prompt_chain_steps").select("id", { count: "exact", head: true }).eq("llm_model_id", id),
  ]);
  if (modelRead.error || stepsRead.error) {
    console.error("Reading the model before deleting failed", modelRead.error ?? stepsRead.error);
    redirect(hrefWith(here, {}, { error: "delete" }));
  }
  if (!modelRead.data) redirect(hrefWith("/llm-models", {}, { error: "gone" }));
  if ((stepsRead.count ?? 0) > 0) redirect(hrefWith(here, {}, { error: "in_use" }));

  const { data, error } = await db.from("llm_models").delete().eq("id", id).select("id");
  if (error) {
    if (isStillReferenced(error)) redirect(hrefWith(here, {}, { error: "in_use" }));
    console.error("Deleting the model failed", error);
    redirect(hrefWith(here, {}, { error: "delete" }));
  }
  if (!data || data.length === 0) redirect(hrefWith("/llm-models", {}, { error: "gone" }));

  revalidatePath("/", "layout");
  redirect(hrefWith("/llm-models", {}, { deleted: 1 }));
}
