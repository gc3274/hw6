// Rules for the LLM providers and models pages. Pure, so they run in tests; the
// actions in app/(admin)/llm-providers and app/(admin)/llm-models apply them
// before any write. Limits match the prompt chains migration.
import { CALLABLE_PROVIDER, FALLBACK_MODEL, type ThinkingLevel } from "@/lib/chains";
import { nouns } from "@/lib/format";
import { constraintField, lengthOk, parseId, readText } from "@/lib/forms";
import { parsePage, type SearchParams } from "@/lib/params";

export const PROVIDER_NAME_MAX = 60;
export const PROVIDER_SLUG_RE = /^[a-z0-9-]{2,30}$/;
export const MODEL_NAME_MAX = 80;
export const PROVIDER_MODEL_ID_MAX = 80;
export const PROVIDER_MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
export const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const satisfies readonly ThinkingLevel[];

// The app has a client for one provider only; steps under any other go straight to the fallback
export const isCallable = (slug: string) => slug === CALLABLE_PROVIDER;

export type ProviderQuery = { page: number };

export function parseProviderQuery(sp: SearchParams): ProviderQuery {
  return { page: parsePage(sp.page) };
}

export type ModelQuery = { provider: number | null; page: number };

export function parseModelQuery(sp: SearchParams): ModelQuery {
  return { provider: parseId(sp.provider), page: parsePage(sp.page) };
}

type Errors<F extends string> = Partial<Record<F, string>>;
type Result<T, F extends string> = { ok: true; values: T } | { ok: false; errors: Errors<F> };

const done = <T, F extends string>(values: T, errors: Errors<F>): Result<T, F> =>
  Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };

// Providers -----------------------------------------------------------------

export type ProviderField = "name" | "slug";

export const PROVIDER_RULES: Record<ProviderField, string> = {
  name: `Write 1 to ${PROVIDER_NAME_MAX} characters.`,
  slug: "Use 2 to 30 lowercase letters, digits or hyphens.",
};

const PROVIDER_TAKEN: Record<ProviderField, string> = {
  name: "Another provider already has this name.",
  slug: "Another provider already uses this slug.",
};

export type ProviderInsert = { name: string; slug: string };
// The slug is fixed once created: the app matches providers by it
export type ProviderPatch = { name: string };

function readProviderName(fd: FormData, errors: Errors<ProviderField>): string {
  const name = readText(fd, "name");
  if (!lengthOk(name, 1, PROVIDER_NAME_MAX)) errors.name = PROVIDER_RULES.name;
  return name;
}

export function validateProviderCreate(fd: FormData): Result<ProviderInsert, ProviderField> {
  const errors: Errors<ProviderField> = {};
  const name = readProviderName(fd, errors);
  const slug = readText(fd, "slug");
  if (!PROVIDER_SLUG_RE.test(slug)) errors.slug = PROVIDER_RULES.slug;
  return done({ name, slug }, errors);
}

// Only the name: a slug field in the form data is ignored, never saved
export function validateProviderEdit(fd: FormData): Result<ProviderPatch, ProviderField> {
  const errors: Errors<ProviderField> = {};
  const name = readProviderName(fd, errors);
  return done({ name }, errors);
}

const PROVIDER_CONSTRAINTS: Record<string, ProviderField> = {
  llm_providers_name_len: "name",
  llm_providers_name_lower_key: "name",
  llm_providers_slug_format: "slug",
  llm_providers_slug_key: "slug",
};

// The field errors for a 23505 or 23514 a form field can fix, or null
export function providerConstraintErrors(
  error: { code?: string; message?: string } | null | undefined,
): Errors<ProviderField> | null {
  const field = constraintField(error, PROVIDER_CONSTRAINTS);
  if (!field) return null;
  return { [field]: error?.code === "23505" ? PROVIDER_TAKEN[field] : PROVIDER_RULES[field] };
}

// Why the provider can't be deleted yet, or null when it can (llm_models restricts the delete)
export function providerBlockedReason(models: number): string | null {
  if (models === 0) return null;
  const them = models === 1 ? "it" : "them";
  return `${nouns(models, "model")} ${models === 1 ? "uses" : "use"} this provider. Delete ${them} or move ${them} to another provider first.`;
}

export const PROVIDER_DELETE_WARNING = "No models use it, so nothing else is deleted. This can’t be undone.";

// Models --------------------------------------------------------------------

export type ModelField = "name" | "llm_provider_id" | "provider_model_id" | "thinking_level";

export const MODEL_RULES: Record<ModelField, string> = {
  name: `Write 1 to ${MODEL_NAME_MAX} characters.`,
  llm_provider_id: "Choose a provider.",
  provider_model_id:
    "Start with a lowercase letter or digit, then up to 79 lowercase letters, digits, dots, underscores or hyphens.",
  thinking_level: "Choose a thinking level from the list.",
};

export const MODEL_ID_TAKEN = "That provider already has a model with this ID.";
export const PROVIDER_GONE = "That provider no longer exists. Choose another.";

export type ModelValues = {
  name: string;
  llm_provider_id: number;
  provider_model_id: string;
  is_temperature_supported: boolean;
  thinking_level: ThinkingLevel | null;
};

// "" (Not sent) is null; anything outside the list is undefined
export function parseThinkingLevel(v: unknown): ThinkingLevel | null | undefined {
  if (v === "" || v === null) return null;
  return THINKING_LEVELS.find((level) => level === v);
}

// Same for create and edit. The provider's existence is checked by the action.
export function validateModel(fd: FormData): Result<ModelValues, ModelField> {
  const errors: Errors<ModelField> = {};

  const name = readText(fd, "name");
  if (!lengthOk(name, 1, MODEL_NAME_MAX)) errors.name = MODEL_RULES.name;

  const providerId = parseId(fd.get("llm_provider_id"));
  if (providerId === null) errors.llm_provider_id = MODEL_RULES.llm_provider_id;

  const providerModelId = readText(fd, "provider_model_id");
  if (!PROVIDER_MODEL_ID_RE.test(providerModelId)) errors.provider_model_id = MODEL_RULES.provider_model_id;

  const thinking = parseThinkingLevel(fd.get("thinking_level"));
  if (thinking === undefined) errors.thinking_level = MODEL_RULES.thinking_level;

  return done(
    {
      name,
      llm_provider_id: providerId ?? 0,
      provider_model_id: providerModelId,
      // An unchecked box sends nothing
      is_temperature_supported: fd.get("is_temperature_supported") === "true",
      thinking_level: thinking ?? null,
    },
    errors,
  );
}

const MODEL_CONSTRAINTS: Record<string, ModelField> = {
  llm_models_name_len: "name",
  llm_models_provider_model_id_format: "provider_model_id",
  llm_models_thinking_level_check: "thinking_level",
  llm_models_provider_model_key: "provider_model_id",
};

export function modelConstraintErrors(
  error: { code?: string; message?: string } | null | undefined,
): Errors<ModelField> | null {
  const field = constraintField(error, MODEL_CONSTRAINTS);
  if (!field) return null;
  return { [field]: error?.code === "23505" ? MODEL_ID_TAKEN : MODEL_RULES[field] };
}

export function thinkingLabel(level: string | null): string {
  if (level === null) return "Not sent";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

// Why the model can't be deleted yet, or null when it can (prompt_chain_steps restricts the delete).
// Chains are read-only here, so the way out is editing the model, not the steps.
export function modelBlockedReason(steps: number): string | null {
  if (steps === 0) return null;
  const verb = steps === 1 ? "uses" : "use";
  return `${nouns(steps, "chain step")} ${verb} this model, so it can’t be deleted. Steps can’t be changed here; to switch what they call, edit this model’s ID instead.`;
}

// llm_responses.llm_model_id is on delete set null; provider_model_id is plain text and stays
export function modelDeleteWarning(responses: number): string {
  const logs =
    responses === 0
      ? "No logged responses point at it."
      : `Its ${nouns(responses, "logged response")} ${responses === 1 ? "keeps" : "keep"} the model ID ${responses === 1 ? "it" : "they"} called but ${responses === 1 ? "loses" : "lose"} the link to this model.`;
  return `${logs} This can’t be undone.`;
}

export const FALLBACK_NOTE = `If a call is busy, the model can’t be found, or the request is rejected as invalid, the step retries once on ${FALLBACK_MODEL}. A safety refusal or an unusable answer is not retried.`;
export const UNCALLABLE_NOTE = `The app only calls “${CALLABLE_PROVIDER}” models. Steps that use a model under another provider go straight to ${FALLBACK_MODEL}.`;
export const THINKING_NOTE =
  "Must be one the model accepts: Gemini 3 Flash takes minimal, Pro models need low or high, and older 2.5 models take none (choose Not sent).";
