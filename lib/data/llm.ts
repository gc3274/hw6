import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelQuery, ProviderQuery } from "@/lib/llm";
import { rangeFor } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

// Reads for the LLM providers and models pages. Writes live in
// app/(admin)/llm-providers/actions.ts and app/(admin)/llm-models/actions.ts.
// Every read throws on error, so a page never shows half-loaded rows as real.

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

export type ProviderOption = { id: number; name: string; slug: string };

// For the model form's select and the models filter
export async function listProviderOptions(db?: SupabaseClient): Promise<ProviderOption[]> {
  const client = db ?? (await adminDb());
  const { data, error } = await client
    .from("llm_providers")
    .select("id, name, slug")
    .order("name")
    .order("id")
    .overrideTypes<ProviderOption[], { merge: false }>();
  if (error) throw fail("Providers", error);
  return data ?? [];
}

type ProviderListRow = {
  id: number;
  name: string;
  slug: string;
  updated_at: string;
  llm_models: { id: number }[];
};

export type ProviderRow = { id: number; name: string; slug: string; models: number; updatedAt: string };

export async function listProviders(q: ProviderQuery): Promise<{ rows: ProviderRow[]; total: number }> {
  const db = await adminDb();
  const [from, to] = rangeFor(q.page);
  // id last, so pages never overlap when two names tie
  const { data, error, count } = await db
    .from("llm_providers")
    .select("id, name, slug, updated_at, llm_models(id)", { count: "exact" })
    .order("name")
    .order("id")
    .range(from, to)
    .overrideTypes<ProviderListRow[], { merge: false }>();
  if (error) throw fail("Providers list", error);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      models: r.llm_models.length,
      updatedAt: r.updated_at,
    })),
    total: count ?? 0,
  };
}

type ProviderDetailRow = {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  llm_models: { id: number; name: string; provider_model_id: string }[];
};

export type ProviderDetail = {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  models: { id: number; name: string; providerModelId: string }[];
};

// null when no provider has this id, so the page can 404
export async function getProvider(id: number): Promise<ProviderDetail | null> {
  const db = await adminDb();
  const { data: row, error } = await db
    .from("llm_providers")
    .select("id, name, slug, created_at, updated_at, llm_models(id, name, provider_model_id)")
    .eq("id", id)
    .order("name", { referencedTable: "llm_models" })
    .order("id", { referencedTable: "llm_models" })
    .maybeSingle<ProviderDetailRow>();
  if (error) throw fail("Provider", error);
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    models: row.llm_models.map((m) => ({ id: m.id, name: m.name, providerModelId: m.provider_model_id })),
  };
}

type ModelListRow = {
  id: number;
  name: string;
  llm_provider_id: number;
  provider_model_id: string;
  is_temperature_supported: boolean;
  thinking_level: string | null;
  updated_at: string;
  llm_providers: ProviderOption | null;
  prompt_chain_steps: { id: number }[];
};

export type ModelRow = {
  id: number;
  name: string;
  provider: ProviderOption | null;
  providerModelId: string;
  temperatureSupported: boolean;
  thinkingLevel: string | null;
  steps: number;
  updatedAt: string;
};

export async function listModels(
  q: ModelQuery,
): Promise<{ rows: ModelRow[]; total: number; providers: ProviderOption[] }> {
  const db = await adminDb();
  const providers = await listProviderOptions(db);

  let query = db
    .from("llm_models")
    .select(
      "id, name, llm_provider_id, provider_model_id, is_temperature_supported, thinking_level, updated_at, llm_providers(id, name, slug), prompt_chain_steps(id)",
      { count: "exact" },
    );
  if (q.provider !== null) query = query.eq("llm_provider_id", q.provider);

  const [from, to] = rangeFor(q.page);
  const { data, error, count } = await query
    .order("name")
    .order("id")
    .range(from, to)
    .overrideTypes<ModelListRow[], { merge: false }>();
  if (error) throw fail("Models list", error);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.llm_providers,
      providerModelId: r.provider_model_id,
      temperatureSupported: r.is_temperature_supported,
      thinkingLevel: r.thinking_level,
      steps: r.prompt_chain_steps.length,
      updatedAt: r.updated_at,
    })),
    total: count ?? 0,
    providers,
  };
}

type ModelDetailRow = Omit<ModelListRow, "prompt_chain_steps"> & { created_at: string };

type StepRow = {
  id: number;
  step_order: number;
  description: string;
  prompt_chain_id: number;
  prompt_chains: { id: number; name: string } | null;
};

export type ModelStep = { id: number; order: number; description: string; chain: { id: number; name: string } };

export type ModelDetail = {
  id: number;
  name: string;
  providerId: number;
  provider: ProviderOption | null;
  providerModelId: string;
  temperatureSupported: boolean;
  thinkingLevel: string | null;
  createdAt: string;
  updatedAt: string;
  // The chain steps that call it, by chain then step order
  steps: ModelStep[];
  // llm_responses rows linked to it; they keep their provider_model_id if it is deleted
  responses: number;
};

// null when no model has this id, so the page can 404
export async function getModel(id: number): Promise<ModelDetail | null> {
  const db = await adminDb();
  const { data: row, error } = await db
    .from("llm_models")
    .select(
      "id, name, llm_provider_id, provider_model_id, is_temperature_supported, thinking_level, created_at, updated_at, llm_providers(id, name, slug)",
    )
    .eq("id", id)
    .maybeSingle<ModelDetailRow>();
  if (error) throw fail("Model", error);
  if (!row) return null;

  const [steps, responses] = await Promise.all([
    db
      .from("prompt_chain_steps")
      .select("id, step_order, description, prompt_chain_id, prompt_chains(id, name)")
      .eq("llm_model_id", row.id)
      .order("prompt_chain_id")
      .order("step_order")
      .order("id")
      .overrideTypes<StepRow[], { merge: false }>(),
    db.from("llm_responses").select("id", { count: "exact", head: true }).eq("llm_model_id", row.id),
  ]);
  if (steps.error) throw fail("Steps using the model", steps.error);
  if (responses.error) throw fail("Responses from the model", responses.error);

  return {
    id: row.id,
    name: row.name,
    providerId: row.llm_provider_id,
    provider: row.llm_providers,
    providerModelId: row.provider_model_id,
    temperatureSupported: row.is_temperature_supported,
    thinkingLevel: row.thinking_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: (steps.data ?? []).map((s) => ({
      id: s.id,
      order: s.step_order,
      description: s.description,
      // prompt_chain_id is not null and cascades, so the embed is always there
      chain: s.prompt_chains ?? { id: s.prompt_chain_id, name: `Chain ${s.prompt_chain_id}` },
    })),
    responses: responses.count ?? 0,
  };
}
