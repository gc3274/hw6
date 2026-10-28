import "server-only";
import { IMAGE_BUCKET } from "@/lib/captions";
import type { FallbackReason, ResponseStatus } from "@/lib/chains";
import { ownerNames } from "@/lib/data/media";
import { emptyPastEnd, rangeFor } from "@/lib/params";
import { preview, type RequestQuery, type RequestSource, type RequestStatus, type ResponseQuery } from "@/lib/requests";
import { adminDb } from "@/lib/supabase/admin";

// Reads for the roast run logs: generation_requests (/requests) and
// llm_responses (/llm-responses). Both are written only by the roast pipeline
// (lib/data/generation.ts here, lib/generation.ts in the main app), so there are
// no writes here. Every read throws on error, so a page never shows half-loaded
// rows as real.

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

type Db = Awaited<ReturnType<typeof adminDb>>;

// numeric(3, 2) can arrive as a string
const toNumber = (v: number | string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const photoUrl = (db: Db, image: { image_path: string } | null) =>
  image ? db.storage.from(IMAGE_BUCKET).getPublicUrl(image.image_path).data.publicUrl : null;

type RequestListRow = {
  id: string;
  user_id: string;
  source: RequestSource;
  image_id: string | null;
  topic: string | null;
  prompt_chain_id: number | null;
  status: RequestStatus;
  error: string | null;
  roast_count: number;
  duration_ms: number | null;
  created_at: string;
  prompt_chains: { id: number; name: string } | null;
  images: { id: string; image_path: string } | null;
};

export type RequestRow = {
  id: string;
  createdAt: string;
  source: RequestSource;
  status: RequestStatus;
  topic: string | null;
  chainId: number | null;
  // null when the chain was deleted since, or none ran
  chainName: string | null;
  // Read only to tell the built-in chain apart (it notes "config_fallback")
  error: string | null;
  roastCount: number;
  durationMs: number | null;
  imageId: string | null;
  imageUrl: string | null;
  who: { id: string; name: string | null };
};

// readAt is when the rows were read, the moment a pending run's age is judged
// against (lib/requests.ts displayStatus)
export async function listRequests(q: RequestQuery): Promise<{ rows: RequestRow[]; total: number; readAt: number }> {
  const db = await adminDb();

  let query = db
    .from("generation_requests")
    .select(
      "id, user_id, source, image_id, topic, prompt_chain_id, status, error, roast_count, duration_ms, created_at, prompt_chains(id, name), images(id, image_path)",
      { count: "exact" },
    );
  if (q.status !== null) query = query.eq("status", q.status);
  if (q.source !== null) query = query.eq("source", q.source);
  if (q.chain !== null) query = query.eq("prompt_chain_id", q.chain);

  const [from, to] = rangeFor(q.page);
  // id last, so pages never overlap when two runs share a timestamp
  const { data, error, count } = emptyPastEnd(
    await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .overrideTypes<RequestListRow[], { merge: false }>(),
  );
  if (error) throw fail("Generation requests", error);
  const readAt = Date.now();

  const rows = data ?? [];
  const names = await ownerNames(db, [...new Set(rows.map((r) => r.user_id))]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source,
      status: r.status,
      topic: r.topic,
      chainId: r.prompt_chain_id,
      chainName: r.prompt_chains?.name ?? null,
      error: r.error,
      roastCount: r.roast_count,
      durationMs: r.duration_ms,
      imageId: r.image_id,
      imageUrl: photoUrl(db, r.images),
      who: { id: r.user_id, name: names.get(r.user_id) ?? null },
    })),
    total: count ?? 0,
    readAt,
  };
}

type ResponseSummaryRow = {
  id: string;
  step_order: number;
  provider_model_id: string;
  is_fallback: boolean;
  fallback_reason: FallbackReason | null;
  status: ResponseStatus;
  error: string | null;
  duration_ms: number;
  created_at: string;
};

type RequestDetailRow = Omit<RequestListRow, "prompt_chains"> & {
  image_path: string;
  finished_at: string | null;
  prompt_chains: { id: number; name: string; slug: string } | null;
  llm_responses: ResponseSummaryRow[] | null;
};

export type ResponseSummary = {
  id: string;
  stepOrder: number;
  providerModelId: string;
  isFallback: boolean;
  fallbackReason: FallbackReason | null;
  status: ResponseStatus;
  error: string | null;
  durationMs: number;
  createdAt: string;
};

export type RequestDetail = RequestRow & {
  // When the row was read, as for listRequests
  readAt: number;
  finishedAt: string | null;
  chainSlug: string | null;
  // Its model calls, in the order they were made
  responses: ResponseSummary[];
};

const byCreated = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);

// null when no run has this id, so the page can 404
export async function getRequest(id: string): Promise<RequestDetail | null> {
  const db = await adminDb();
  const { data: row, error } = await db
    .from("generation_requests")
    .select(
      "id, user_id, source, image_path, image_id, topic, prompt_chain_id, status, error, roast_count, duration_ms, created_at, finished_at, prompt_chains(id, name, slug), images(id, image_path), llm_responses(id, step_order, provider_model_id, is_fallback, fallback_reason, status, error, duration_ms, created_at)",
    )
    .eq("id", id)
    .maybeSingle<RequestDetailRow>();
  if (error) throw fail("Generation request", error);
  if (!row) return null;
  const readAt = Date.now();

  const names = await ownerNames(db, [row.user_id]);

  return {
    id: row.id,
    readAt,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    source: row.source,
    status: row.status,
    topic: row.topic,
    chainId: row.prompt_chain_id,
    chainName: row.prompt_chains?.name ?? null,
    chainSlug: row.prompt_chains?.slug ?? null,
    error: row.error,
    roastCount: row.roast_count,
    durationMs: row.duration_ms,
    imageId: row.image_id,
    imageUrl: photoUrl(db, row.images),
    who: { id: row.user_id, name: names.get(row.user_id) ?? null },
    responses: [...(row.llm_responses ?? [])].sort(byCreated).map((r) => ({
      id: r.id,
      stepOrder: r.step_order,
      providerModelId: r.provider_model_id,
      isFallback: r.is_fallback,
      fallbackReason: r.fallback_reason,
      status: r.status,
      error: r.error,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    })),
  };
}

// The list never reads the prompts, only the answer for its one-line preview
type ResponseListRow = ResponseSummaryRow & {
  generation_request_id: string;
  llm_model_id: number | null;
  response_text: string | null;
};

export type ResponseRow = ResponseSummary & {
  requestId: string;
  modelId: number | null;
  // The first line of the answer; empty when there was none
  preview: string;
};

export async function listResponses(q: ResponseQuery): Promise<{ rows: ResponseRow[]; total: number }> {
  const db = await adminDb();

  let query = db
    .from("llm_responses")
    .select(
      "id, generation_request_id, llm_model_id, step_order, provider_model_id, is_fallback, fallback_reason, status, error, response_text, duration_ms, created_at",
      { count: "exact" },
    );
  if (q.status !== null) query = query.eq("status", q.status);
  if (q.model !== null) query = query.eq("llm_model_id", q.model);
  if (q.fallback !== null) query = query.eq("is_fallback", q.fallback === "yes");

  const [from, to] = rangeFor(q.page);
  const { data, error, count } = emptyPastEnd(
    await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .overrideTypes<ResponseListRow[], { merge: false }>(),
  );
  if (error) throw fail("LLM responses", error);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      requestId: r.generation_request_id,
      modelId: r.llm_model_id,
      stepOrder: r.step_order,
      providerModelId: r.provider_model_id,
      isFallback: r.is_fallback,
      fallbackReason: r.fallback_reason,
      status: r.status,
      error: r.error,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
      preview: preview(r.response_text),
    })),
    total: count ?? 0,
  };
}

export type ModelOption = { id: number; name: string; providerModelId: string };

// The model filter on /llm-responses
export async function listModelOptions(): Promise<ModelOption[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("llm_models")
    .select("id, name, provider_model_id")
    .order("name")
    .order("id")
    .overrideTypes<{ id: number; name: string; provider_model_id: string }[], { merge: false }>();
  if (error) throw fail("LLM model options", error);
  return (data ?? []).map((m) => ({ id: m.id, name: m.name, providerModelId: m.provider_model_id }));
}

type ResponseDetailRow = ResponseSummaryRow & {
  generation_request_id: string;
  prompt_chain_id: number | null;
  prompt_chain_step_id: number | null;
  llm_model_id: number | null;
  system_prompt: string;
  user_prompt: string;
  temperature: number | string | null;
  response_text: string | null;
  generation_requests: { id: string; source: RequestSource; created_at: string } | null;
  prompt_chains: { id: number; name: string } | null;
  prompt_chain_steps: { id: number; description: string; input_type: string } | null;
  llm_models: { id: number; name: string } | null;
};

export type ResponseDetail = ResponseSummary & {
  request: { id: string; source: RequestSource | null; createdAt: string | null };
  chain: { id: number; name: string } | null;
  step: { id: number; description: string; withPhoto: boolean } | null;
  model: { id: number; name: string } | null;
  systemPrompt: string;
  userPrompt: string;
  // What was sent; null when none was
  temperature: number | null;
  responseText: string | null;
};

// null when no response has this id, so the page can 404
export async function getResponse(id: string): Promise<ResponseDetail | null> {
  const db = await adminDb();
  const { data: row, error } = await db
    .from("llm_responses")
    .select(
      "id, generation_request_id, prompt_chain_id, prompt_chain_step_id, llm_model_id, step_order, provider_model_id, is_fallback, fallback_reason, system_prompt, user_prompt, temperature, response_text, status, error, duration_ms, created_at, generation_requests(id, source, created_at), prompt_chains(id, name), prompt_chain_steps(id, description, input_type), llm_models(id, name)",
    )
    .eq("id", id)
    .maybeSingle<ResponseDetailRow>();
  if (error) throw fail("LLM response", error);
  if (!row) return null;

  return {
    id: row.id,
    stepOrder: row.step_order,
    providerModelId: row.provider_model_id,
    isFallback: row.is_fallback,
    fallbackReason: row.fallback_reason,
    status: row.status,
    error: row.error,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    request: {
      id: row.generation_request_id,
      source: row.generation_requests?.source ?? null,
      createdAt: row.generation_requests?.created_at ?? null,
    },
    chain: row.prompt_chains,
    step: row.prompt_chain_steps && {
      id: row.prompt_chain_steps.id,
      description: row.prompt_chain_steps.description,
      withPhoto: row.prompt_chain_steps.input_type === "image",
    },
    model: row.llm_models,
    systemPrompt: row.system_prompt,
    userPrompt: row.user_prompt,
    temperature: toNumber(row.temperature),
    responseText: row.response_text,
  };
}
