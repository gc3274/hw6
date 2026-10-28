import "server-only";
import { toChain, validateChain, type InputType, type OutputType } from "@/lib/chains";
import { emptyPastEnd, rangeFor } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

// Reads for the prompt chain pages and the chain mix. Chains and steps are
// seeded by the migration and read-only here; the only write is the mix, in
// app/(admin)/chain-mix/actions.ts. Every read throws on error, so a page never
// shows half-loaded rows as real.

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

type MixEmbed = { weight: number; updated_at: string };

// prompt_chain_mix is keyed by the chain id, so PostgREST embeds it as one
// object; an array is read the same way in case it's ever seen as one-to-many
const mixOf = (embed: MixEmbed | MixEmbed[] | null): MixEmbed | null =>
  Array.isArray(embed) ? (embed[0] ?? null) : embed;

type ChainListRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  prompt_chain_steps: { id: number }[] | null;
  prompt_chain_mix: MixEmbed | MixEmbed[] | null;
};

export type ChainSummary = {
  id: number;
  slug: string;
  name: string;
  description: string;
  steps: number;
  // Percent of runs; 0 when the chain has no mix row
  weight: number;
};

export async function listChains(page: number): Promise<{ rows: ChainSummary[]; total: number }> {
  const db = await adminDb();
  const [from, to] = rangeFor(page);
  const { data, error, count } = emptyPastEnd(
    await db
      .from("prompt_chains")
      .select("id, slug, name, description, prompt_chain_steps(id), prompt_chain_mix(weight, updated_at)", {
        count: "exact",
      })
      .order("id")
      .range(from, to)
      .overrideTypes<ChainListRow[], { merge: false }>(),
  );
  if (error) throw fail("Prompt chains", error);

  return {
    rows: (data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      steps: c.prompt_chain_steps?.length ?? 0,
      weight: mixOf(c.prompt_chain_mix)?.weight ?? 0,
    })),
    total: count ?? 0,
  };
}

type StepRow = {
  id: number;
  step_order: number;
  description: string;
  input_type: string;
  output_type: string;
  // numeric(3, 2)
  temperature: number | string | null;
  system_prompt: string;
  user_prompt: string;
  llm_models: {
    id: number;
    name: string;
    provider_model_id: string;
    is_temperature_supported: boolean;
    thinking_level: string | null;
    llm_providers: { id: number; name: string; slug: string } | null;
  } | null;
};

type ChainDetailRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  prompt_chain_mix: MixEmbed | MixEmbed[] | null;
  prompt_chain_steps: StepRow[] | null;
};

export type StepModel = {
  id: number;
  name: string;
  providerModelId: string;
  temperatureSupported: boolean;
  thinkingLevel: string | null;
  provider: { id: number; name: string; slug: string } | null;
};

export type StepDetail = {
  id: number;
  order: number;
  description: string;
  inputType: InputType | null;
  outputType: OutputType | null;
  temperature: number | null;
  systemPrompt: string;
  userPrompt: string;
  // The foreign key is not null and restricts deletes, so this is only a safety net
  model: StepModel | null;
};

export type ChainDetail = {
  id: number;
  slug: string;
  name: string;
  description: string;
  weight: number;
  steps: StepDetail[];
  // What stops the runner from using this chain (lib/chains.ts validateChain).
  // A run that picks it falls back to the one-pass chain, or the built-in one.
  problems: string[];
};

const inputType = (v: string): InputType | null => (v === "image" || v === "text" ? v : null);
const outputType = (v: string): OutputType | null => (v === "text" || v === "roast_json" ? v : null);

// null when no chain has this id, so the page can 404
export async function getChainDetail(id: number): Promise<ChainDetail | null> {
  const db = await adminDb();
  const { data: row, error } = await db
    .from("prompt_chains")
    .select(
      "id, slug, name, description, prompt_chain_mix(weight, updated_at), prompt_chain_steps(id, step_order, description, input_type, output_type, temperature, system_prompt, user_prompt, llm_models(id, name, provider_model_id, is_temperature_supported, thinking_level, llm_providers(id, name, slug)))",
    )
    .eq("id", id)
    .maybeSingle<ChainDetailRow>();
  if (error) throw fail("Prompt chain", error);
  if (!row) return null;

  const stepRows = [...(row.prompt_chain_steps ?? [])].sort((a, b) => a.step_order - b.step_order || a.id - b.id);
  // The same checks the runner makes before it uses a chain
  const runnable = toChain({ id: row.id, slug: row.slug, prompt_chain_steps: stepRows });
  const problems = runnable ? validateChain(runnable) : ["A step has no usable model or holds a value the runner doesn’t know."];

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    weight: mixOf(row.prompt_chain_mix)?.weight ?? 0,
    problems,
    steps: stepRows.map((s) => {
      const temperature = s.temperature === null ? null : Number(s.temperature);
      const m = s.llm_models;
      return {
        id: s.id,
        order: s.step_order,
        description: s.description,
        inputType: inputType(s.input_type),
        outputType: outputType(s.output_type),
        temperature: temperature !== null && Number.isFinite(temperature) ? temperature : null,
        systemPrompt: s.system_prompt,
        userPrompt: s.user_prompt,
        model: m && {
          id: m.id,
          name: m.name,
          providerModelId: m.provider_model_id,
          temperatureSupported: m.is_temperature_supported,
          thinkingLevel: m.thinking_level,
          provider: m.llm_providers,
        },
      };
    }),
  };
}

type MixRowRead = { id: number; slug: string; name: string; description: string; prompt_chain_mix: MixEmbed | MixEmbed[] | null };

export type MixChain = { id: number; slug: string; name: string; description: string; weight: number };

// Every chain, for the one mix form. updatedAt is the newest change to any weight.
export async function listMix(): Promise<{ chains: MixChain[]; updatedAt: string | null }> {
  const db = await adminDb();
  const { data, error } = await db
    .from("prompt_chains")
    .select("id, slug, name, description, prompt_chain_mix(weight, updated_at)")
    .order("id")
    .overrideTypes<MixRowRead[], { merge: false }>();
  if (error) throw fail("Chain mix", error);

  const chains: MixChain[] = [];
  let updatedAt: string | null = null;
  for (const c of data ?? []) {
    const mix = mixOf(c.prompt_chain_mix);
    chains.push({ id: c.id, slug: c.slug, name: c.name, description: c.description, weight: mix?.weight ?? 0 });
    if (mix && (updatedAt === null || Date.parse(mix.updated_at) > Date.parse(updatedAt))) updatedAt = mix.updated_at;
  }
  return { chains, updatedAt };
}

export type ChainOption = { id: number; name: string };

// The chain filter on /requests
export async function listChainOptions(): Promise<ChainOption[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("prompt_chains")
    .select("id, name")
    .order("name")
    .order("id")
    .overrideTypes<ChainOption[], { merge: false }>();
  if (error) throw fail("Prompt chain options", error);
  return data ?? [];
}
