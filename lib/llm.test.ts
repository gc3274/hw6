import { describe, expect, it } from "vitest";
import { CALLABLE_PROVIDER, FALLBACK_MODEL } from "@/lib/chains";
import {
  FALLBACK_NOTE,
  isCallable,
  MODEL_ID_TAKEN,
  MODEL_NAME_MAX,
  MODEL_RULES,
  modelBlockedReason,
  modelConstraintErrors,
  modelDeleteWarning,
  parseModelQuery,
  parseProviderQuery,
  parseThinkingLevel,
  PROVIDER_MODEL_ID_MAX,
  PROVIDER_MODEL_ID_RE,
  PROVIDER_NAME_MAX,
  PROVIDER_RULES,
  PROVIDER_SLUG_RE,
  providerBlockedReason,
  providerConstraintErrors,
  THINKING_LEVELS,
  thinkingLabel,
  UNCALLABLE_NOTE,
  validateModel,
  validateProviderCreate,
  validateProviderEdit,
} from "@/lib/llm";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

// Copied from 20261028120000_prompt_chains_and_observability.sql
const SQL = {
  providerSlug: "^[a-z0-9-]{2,30}$",
  providerModelId: "^[a-z0-9][a-z0-9._-]{0,79}$",
  providerNameMax: 60,
  modelNameMax: 80,
  // One leading character plus {0,79}
  providerModelIdMax: 80,
  thinkingLevels: ["minimal", "low", "medium", "high"],
};

// How Postgres words a unique (23505) or check (23514) violation
const violation = (code: string, constraint: string) => ({
  code,
  message:
    code === "23505"
      ? `duplicate key value violates unique constraint "${constraint}"`
      : `new row for relation "llm_models" violates check constraint "${constraint}"`,
});

describe("parity with the migration", () => {
  it("uses the same patterns and limits as the checks", () => {
    expect(PROVIDER_SLUG_RE.source).toBe(SQL.providerSlug);
    expect(PROVIDER_MODEL_ID_RE.source).toBe(SQL.providerModelId);
    expect(PROVIDER_NAME_MAX).toBe(SQL.providerNameMax);
    expect(MODEL_NAME_MAX).toBe(SQL.modelNameMax);
    expect(PROVIDER_MODEL_ID_MAX).toBe(SQL.providerModelIdMax);
    expect([...THINKING_LEVELS]).toEqual(SQL.thinkingLevels);
  });

  it.each([
    ["google", true],
    ["open-ai", true],
    ["x1", true],
    ["a".repeat(30), true],
    ["a", false],
    ["a".repeat(31), false],
    ["Google", false],
    ["open_ai", false],
    ["open ai", false],
    ["", false],
  ])("provider slug %j is %s", (slug, ok) => {
    expect(PROVIDER_SLUG_RE.test(slug)).toBe(ok);
  });

  it.each([
    ["gemini-3.5-flash", true],
    ["gemini-flash-lite-latest", true],
    ["model_3.5", true],
    ["7b", true],
    ["a", true],
    ["a".repeat(80), true],
    ["a".repeat(81), false],
    ["-gemini", false],
    [".gemini", false],
    ["Gemini-3", false],
    ["gemini 3", false],
    ["models/gemini", false],
    ["", false],
  ])("provider model id %j is %s", (id, ok) => {
    expect(PROVIDER_MODEL_ID_RE.test(id)).toBe(ok);
  });
});

describe("isCallable", () => {
  it("is true only for the provider the app has a client for", () => {
    expect(CALLABLE_PROVIDER).toBe("google");
    expect(isCallable("google")).toBe(true);
    expect(isCallable("openai")).toBe(false);
    expect(isCallable("Google")).toBe(false);
  });
});

describe("query parsers", () => {
  it.each([
    [{}, { page: 1 }],
    [{ page: "3" }, { page: 3 }],
    [{ page: "x" }, { page: 1 }],
  ])("providers %j", (sp, expected) => {
    expect(parseProviderQuery(sp)).toEqual(expected);
  });

  it.each([
    [{}, { provider: null, page: 1 }],
    [{ provider: "2", page: "4" }, { provider: 2, page: 4 }],
    [{ provider: ["5", "6"] }, { provider: 5, page: 1 }],
    [{ provider: "0" }, { provider: null, page: 1 }],
    [{ provider: "google" }, { provider: null, page: 1 }],
    [{ provider: "1,2" }, { provider: null, page: 1 }],
  ])("models %j", (sp, expected) => {
    expect(parseModelQuery(sp)).toEqual(expected);
  });
});

describe("validateProviderCreate", () => {
  it("reads a name and a slug", () => {
    expect(validateProviderCreate(form({ name: "  Google  AI ", slug: "google" }))).toEqual({
      ok: true,
      values: { name: "Google AI", slug: "google" },
    });
  });

  it.each([
    ["", false],
    ["   ", false],
    ["a", true],
    ["🔥".repeat(60), true],
    ["🔥".repeat(61), false],
  ])("name %j ok: %s", (name, ok) => {
    const result = validateProviderCreate(form({ name, slug: "google" }));
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.errors).toEqual({ name: PROVIDER_RULES.name });
  });

  it("refuses a slug the check would refuse, without lowercasing it", () => {
    expect(validateProviderCreate(form({ name: "Google", slug: "Google" }))).toEqual({
      ok: false,
      errors: { slug: PROVIDER_RULES.slug },
    });
  });

  it("reports every bad field at once", () => {
    const result = validateProviderCreate(form({ name: "", slug: "" }));
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(["name", "slug"]);
  });
});

describe("validateProviderEdit", () => {
  it("never puts the slug in the patch", () => {
    const result = validateProviderEdit(form({ name: "Google", slug: "openai", id: "1" }));
    expect(result).toEqual({ ok: true, values: { name: "Google" } });
  });

  it("checks the name", () => {
    expect(validateProviderEdit(form({ name: "x".repeat(61) }))).toEqual({
      ok: false,
      errors: { name: PROVIDER_RULES.name },
    });
  });
});

describe("providerConstraintErrors", () => {
  it.each([
    ["23505", "llm_providers_name_lower_key", { name: "Another provider already has this name." }],
    ["23505", "llm_providers_slug_key", { slug: "Another provider already uses this slug." }],
    ["23514", "llm_providers_name_len", { name: PROVIDER_RULES.name }],
    ["23514", "llm_providers_slug_format", { slug: PROVIDER_RULES.slug }],
  ])("maps %s on %s", (code, constraint, expected) => {
    expect(providerConstraintErrors(violation(code, constraint))).toEqual(expected);
  });

  it("returns null for anything else", () => {
    expect(providerConstraintErrors(violation("23505", "llm_providers_pkey"))).toBeNull();
    expect(providerConstraintErrors({ code: "23503", message: 'constraint "llm_providers_slug_key"' })).toBeNull();
    expect(providerConstraintErrors(null)).toBeNull();
  });
});

describe("providerBlockedReason", () => {
  it.each([
    [0, null],
    [1, "1 model uses this provider. Delete it or move it to another provider first."],
    [3, "3 models use this provider. Delete them or move them to another provider first."],
  ])("%i models", (n, expected) => {
    expect(providerBlockedReason(n)).toBe(expected);
  });
});

const modelForm = (overrides: Record<string, string> = {}) =>
  form({
    name: "Gemini 3.5 Flash",
    llm_provider_id: "1",
    provider_model_id: "gemini-3.5-flash",
    is_temperature_supported: "true",
    thinking_level: "minimal",
    ...overrides,
  });

describe("validateModel", () => {
  it("reads every field", () => {
    expect(validateModel(modelForm())).toEqual({
      ok: true,
      values: {
        name: "Gemini 3.5 Flash",
        llm_provider_id: 1,
        provider_model_id: "gemini-3.5-flash",
        is_temperature_supported: true,
        thinking_level: "minimal",
      },
    });
  });

  it("reads an unchecked box as false and Not sent as null", () => {
    const fd = modelForm({ thinking_level: "" });
    fd.delete("is_temperature_supported");
    const result = validateModel(fd);
    expect(result.ok && result.values.is_temperature_supported).toBe(false);
    expect(result.ok && result.values.thinking_level).toBeNull();
  });

  it.each([
    ["name", "", MODEL_RULES.name],
    ["name", "x".repeat(81), MODEL_RULES.name],
    ["llm_provider_id", "", MODEL_RULES.llm_provider_id],
    ["llm_provider_id", "0", MODEL_RULES.llm_provider_id],
    ["llm_provider_id", "google", MODEL_RULES.llm_provider_id],
    ["provider_model_id", "Gemini-3", MODEL_RULES.provider_model_id],
    ["provider_model_id", "", MODEL_RULES.provider_model_id],
    ["thinking_level", "max", MODEL_RULES.thinking_level],
    ["thinking_level", "MINIMAL", MODEL_RULES.thinking_level],
  ])("refuses %s = %j", (field, value, message) => {
    expect(validateModel(modelForm({ [field]: value }))).toEqual({ ok: false, errors: { [field]: message } });
  });

  it("accepts an 80-character name", () => {
    expect(validateModel(modelForm({ name: "x".repeat(80) })).ok).toBe(true);
  });
});

describe("parseThinkingLevel", () => {
  it.each([
    ["", null],
    [null, null],
    ["minimal", "minimal"],
    ["high", "high"],
    ["none", undefined],
    [undefined, undefined],
  ])("%j is %j", (raw, expected) => {
    expect(parseThinkingLevel(raw)).toBe(expected);
  });
});

describe("modelConstraintErrors", () => {
  it.each([
    ["23505", "llm_models_provider_model_key", { provider_model_id: MODEL_ID_TAKEN }],
    ["23514", "llm_models_name_len", { name: MODEL_RULES.name }],
    ["23514", "llm_models_provider_model_id_format", { provider_model_id: MODEL_RULES.provider_model_id }],
    ["23514", "llm_models_thinking_level_check", { thinking_level: MODEL_RULES.thinking_level }],
  ])("maps %s on %s", (code, constraint, expected) => {
    expect(modelConstraintErrors(violation(code, constraint))).toEqual(expected);
  });

  it("returns null for the foreign key and unknown constraints", () => {
    expect(modelConstraintErrors({ code: "23503", message: 'constraint "llm_models_llm_provider_id_fkey"' })).toBeNull();
    expect(modelConstraintErrors(violation("23505", "llm_models_pkey"))).toBeNull();
  });
});

describe("thinkingLabel", () => {
  it.each([
    [null, "Not sent"],
    ["minimal", "Minimal"],
    ["high", "High"],
  ])("%j is %j", (level, label) => {
    expect(thinkingLabel(level)).toBe(label);
  });
});

describe("modelBlockedReason", () => {
  it("allows deleting an unused model", () => {
    expect(modelBlockedReason(0)).toBeNull();
  });

  it("counts the steps that use it", () => {
    expect(modelBlockedReason(1)).toMatch(/^1 chain step uses this model, so it can’t be deleted\./);
    expect(modelBlockedReason(3)).toMatch(/^3 chain steps use this model, so it can’t be deleted\./);
  });
});

describe("modelDeleteWarning", () => {
  it.each([
    [0, "No logged responses point at it. This can’t be undone."],
    [1, "Its 1 logged response keeps the model ID it called but loses the link to this model. This can’t be undone."],
    [
      1200,
      "Its 1,200 logged responses keep the model ID they called but lose the link to this model. This can’t be undone.",
    ],
  ])("%i responses", (n, expected) => {
    expect(modelDeleteWarning(n)).toBe(expected);
  });
});

describe("notes", () => {
  it("name the fallback model and the callable provider", () => {
    expect(FALLBACK_NOTE).toContain(FALLBACK_MODEL);
    expect(UNCALLABLE_NOTE).toContain(FALLBACK_MODEL);
    expect(UNCALLABLE_NOTE).toContain(`“${CALLABLE_PROVIDER}”`);
  });
});
