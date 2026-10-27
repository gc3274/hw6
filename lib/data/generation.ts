import "server-only";
import { unstable_rethrow } from "next/navigation";
import {
  CHAIN_SELECT,
  DEFAULT_CHAIN,
  EXAMPLES_MAX,
  TERMS_MAX,
  clipText,
  pickChain,
  responseRow,
  toChain,
  validateChain,
  type Chain,
  type ChainRow,
  type Example,
  type ResponseLog,
  type Term,
} from "@/lib/chains";
import type { Topic } from "@/lib/roasts";
import { adminDb } from "@/lib/supabase/admin";

// The roast pipeline's settings and logs for roasts generated here
// (app/(admin)/media/actions.ts). Same steps as the main app's lib/generation.ts,
// logged as source 'admin' under the admin who ran them, so they never count
// toward the post owner's daily limit. Like everything that reaches adminDb(),
// each call checks the superadmin gate first.

export type RequestStatus = "succeeded" | "rejected" | "busy" | "failed" | "limited";

export type ChainConfig = {
  chain: Chain;
  terms: Term[];
  examples: Example[];
  // Anything that went wrong picking the chain, for the request's log
  problem: string | null;
};

type Db = Awaited<ReturnType<typeof adminDb>>;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Written before the model is called. Null when it can't be written: the
// caller refuses to start a run it can't log.
export async function startRequest(input: {
  userId: string;
  imagePath: string;
  imageId: string;
  topic: Topic;
}): Promise<string | null> {
  try {
    const db = await adminDb();
    const { data, error } = await db
      .from("generation_requests")
      .insert({
        user_id: input.userId,
        source: "admin",
        image_path: input.imagePath,
        image_id: input.imageId,
        topic: input.topic,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      console.error("Logging the roast request failed", error?.message ?? "no row");
      return null;
    }
    return data.id;
  } catch (err) {
    unstable_rethrow(err);
    console.error("Logging the roast request failed", message(err));
    return null;
  }
}

type ChainRead = { chain: Chain; problem: null } | { chain: null; problem: string };

async function readChain(db: Db, by: { id: number } | { slug: string }): Promise<ChainRead> {
  const query = db.from("prompt_chains").select(CHAIN_SELECT);
  const { data, error } = await ("id" in by ? query.eq("id", by.id) : query.eq("slug", by.slug)).maybeSingle<ChainRow>();
  const name = "id" in by ? `chain ${by.id}` : `chain ${by.slug}`;
  if (error) return { chain: null, problem: `reading ${name} failed: ${error.message}` };
  if (!data) return { chain: null, problem: `${name} not found` };

  const chain = toChain(data);
  if (!chain) return { chain: null, problem: `${data.slug} has a step without a usable model` };
  const problems = validateChain(chain);
  if (problems.length > 0) return { chain: null, problem: `${data.slug}: ${problems.join(" ")}` };
  return { chain, problem: null };
}

async function pickConfiguredChain(db: Db): Promise<{ chain: Chain | null; problems: string[] }> {
  const problems: string[] = [];
  const { data: mix, error } = await db.from("prompt_chain_mix").select("prompt_chain_id, weight");
  let tried: number | null = null;

  if (error) {
    problems.push(`reading the mix failed: ${error.message}`);
  } else {
    tried = pickChain(
      ((mix ?? []) as { prompt_chain_id: number; weight: number }[]).map((m) => ({
        chainId: m.prompt_chain_id,
        weight: m.weight,
      })),
      Math.random(),
    );
    if (tried === null) {
      problems.push("no chain has a weight above 0");
    } else {
      const picked = await readChain(db, { id: tried });
      if (picked.chain) return { chain: picked.chain, problems };
      problems.push(picked.problem);
    }
  }

  // The seeded one-pass chain, unless it was the one that just failed
  const fallback = await readChain(db, { slug: DEFAULT_CHAIN.slug });
  if (fallback.chain && fallback.chain.id !== tried) return { chain: fallback.chain, problems };
  if (!fallback.chain) problems.push(fallback.problem);
  return { chain: null, problems };
}

// The chain this run uses (picked by the mix), plus the topic's terms and
// examples. Never throws: when the database has no usable chain, the run uses
// the built-in DEFAULT_CHAIN and says so in `problem`.
export async function loadChainConfig(topic: Topic): Promise<ChainConfig> {
  let db: Db;
  try {
    db = await adminDb();
  } catch (err) {
    unstable_rethrow(err);
    return { chain: DEFAULT_CHAIN, terms: [], examples: [], problem: clipText(`config_fallback: ${message(err)}`) };
  }

  const problems: string[] = [];
  let chain: Chain;
  try {
    const picked = await pickConfiguredChain(db);
    problems.push(...picked.problems);
    if (picked.chain) {
      chain = picked.chain;
    } else {
      chain = DEFAULT_CHAIN;
      problems.unshift("config_fallback");
    }
  } catch (err) {
    chain = DEFAULT_CHAIN;
    problems.unshift("config_fallback", message(err));
  }

  const forTopic = `topic.is.null,topic.eq.${topic}`;
  const [termsRead, examplesRead] = await Promise.all([
    db
      .from("terms")
      .select("term, definition, example")
      .or(forTopic)
      .order("priority", { ascending: false })
      .order("term")
      .limit(TERMS_MAX),
    db
      .from("generation_examples")
      .select("image_description, roast, tip, score, explanation")
      .or(forTopic)
      .order("priority", { ascending: false })
      .order("id")
      .limit(EXAMPLES_MAX),
  ]).catch((err: unknown) => {
    problems.push(`reading terms and examples failed: ${message(err)}`);
    return [null, null] as const;
  });

  if (termsRead?.error) problems.push(`reading terms failed: ${termsRead.error.message}`);
  if (examplesRead?.error) problems.push(`reading examples failed: ${examplesRead.error.message}`);

  const terms = ((termsRead && !termsRead.error ? termsRead.data : null) ?? []) as Term[];
  const examples = (
    ((examplesRead && !examplesRead.error ? examplesRead.data : null) ?? []) as {
      image_description: string;
      roast: string;
      tip: string | null;
      score: number;
      explanation: string;
    }[]
  ).map((e) => ({
    imageDescription: e.image_description,
    roast: e.roast,
    tip: e.tip,
    score: e.score,
    explanation: e.explanation,
  }));

  const unique = [...new Set(problems)];
  return { chain, terms, examples, problem: unique.length > 0 ? clipText(unique.join("; ")) : null };
}

// Best effort: a lost log row never breaks a roast
export async function logResponse(requestId: string, log: ResponseLog): Promise<void> {
  try {
    const db = await adminDb();
    const { error } = await db.from("llm_responses").insert(responseRow(requestId, log));
    if (error) console.warn("Logging a model response failed", error.message);
  } catch (err) {
    unstable_rethrow(err);
    console.warn("Logging a model response failed", message(err));
  }
}

// Best effort, and only from pending, so a finished run is never rewritten
export async function finishRequest(
  requestId: string,
  outcome: {
    status: RequestStatus;
    error: string | null;
    chainId: number | null;
    imageId: string | null;
    roastCount: number;
    durationMs: number;
  },
): Promise<void> {
  try {
    const db = await adminDb();
    const { error } = await db
      .from("generation_requests")
      .update({
        status: outcome.status,
        error: outcome.error === null ? null : clipText(outcome.error),
        prompt_chain_id: outcome.chainId,
        image_id: outcome.imageId,
        roast_count: outcome.roastCount,
        duration_ms: Math.max(0, Math.round(outcome.durationMs)),
        finished_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (error) console.warn("Finishing the roast request log failed", error.message);
  } catch (err) {
    unstable_rethrow(err);
    console.warn("Finishing the roast request log failed", message(err));
  }
}
