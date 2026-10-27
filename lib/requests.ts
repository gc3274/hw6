// Search params and display rules for the roast run logs (/requests and
// /llm-responses). Pure, so they run in tests. The rows come from
// lib/data/requests.ts; what writes them is lib/data/generation.ts here and
// lib/generation.ts in the main app.
import type { BadgeTone } from "@/components/Badge";
import type { FallbackReason, ResponseStatus } from "@/lib/chains";
import { parseId } from "@/lib/forms";
import { parsePage, type SearchParams } from "@/lib/params";

// The main app's DAILY_GENERATION_LIMIT: app runs in the last 24 hours, failed ones included
export const DAILY_LIMIT = 5;

// A one-line preview of a model's answer, in code points
export const PREVIEW_MAX = 80;

// The route that runs a roast gives up at 60 s, so a run still pending this long
// after it started was cut off before it could log its outcome
export const UNFINISHED_AFTER_MS = 2 * 60 * 1000;

const firstParam = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => {
  const raw = firstParam(v);
  return allowed.find((a) => a === raw) ?? null;
};

// generation_requests_status_check and generation_requests_source_check
export const REQUEST_STATUSES = ["pending", "succeeded", "rejected", "busy", "failed", "limited", "legacy"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_SOURCES = ["app", "admin"] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

// llm_responses_status_check
export const RESPONSE_STATUSES = ["ok", "rejected", "busy", "failed"] as const satisfies readonly ResponseStatus[];

export type RequestQuery = {
  status: RequestStatus | null;
  source: RequestSource | null;
  // A prompt chain id
  chain: number | null;
  page: number;
};

export function parseRequestQuery(sp: SearchParams): RequestQuery {
  return {
    status: oneOf(sp.status, REQUEST_STATUSES),
    source: oneOf(sp.source, REQUEST_SOURCES),
    chain: parseId(sp.chain),
    page: parsePage(sp.page),
  };
}

export type ResponseQuery = {
  status: ResponseStatus | null;
  // An llm_models id. Fallback calls have none, so this filter leaves them out.
  model: number | null;
  fallback: "yes" | "no" | null;
  page: number;
};

export function parseResponseQuery(sp: SearchParams): ResponseQuery {
  return {
    status: oneOf(sp.status, RESPONSE_STATUSES),
    model: parseId(sp.model),
    fallback: oneOf(sp.fallback, ["yes", "no"] as const),
    page: parsePage(sp.page),
  };
}

export type DisplayStatus = RequestStatus | "unfinished";

// Display only: the row itself stays pending, nothing is written
export function displayStatus(status: RequestStatus, createdAt: string, now: number): DisplayStatus {
  if (status !== "pending") return status;
  const started = Date.parse(createdAt);
  return Number.isFinite(started) && now - started > UNFINISHED_AFTER_MS ? "unfinished" : "pending";
}

export const REQUEST_STATUS_INFO: Record<DisplayStatus, { label: string; tone: BadgeTone; meaning: string }> = {
  pending: { label: "Pending", tone: "neutral", meaning: "Still running: the outcome isn’t logged yet." },
  unfinished: {
    label: "Unfinished",
    tone: "neutral",
    meaning: "Still pending more than 2 minutes after it started, so the run was cut off before it could log its outcome.",
  },
  succeeded: { label: "Succeeded", tone: "accent", meaning: "The roasts were saved." },
  rejected: { label: "Rejected", tone: "danger", meaning: "The model said the photo can’t be judged." },
  busy: { label: "Busy", tone: "danger", meaning: "The model was busy, or the run ran out of time." },
  failed: { label: "Failed", tone: "danger", meaning: "Something else went wrong. The notes say what." },
  limited: {
    label: "Limited",
    tone: "neutral",
    meaning: `Stopped at the daily limit of ${DAILY_LIMIT} runs, before any model was called.`,
  },
  legacy: {
    label: "Legacy",
    tone: "neutral",
    meaning: "From before request logging, copied from the old attempts table. Its outcome wasn’t recorded.",
  },
};

export const SOURCE_LABELS: Record<RequestSource, string> = { app: "App", admin: "Admin" };

export const RESPONSE_STATUS_INFO: Record<ResponseStatus, { label: string; tone: BadgeTone }> = {
  ok: { label: "OK", tone: "accent" },
  rejected: { label: "Rejected", tone: "danger" },
  busy: { label: "Busy", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

// Why a step was retried on the fallback model, in words
export const FALLBACK_REASONS: Record<FallbackReason, string> = {
  busy: "model busy",
  not_found: "model not found",
  bad_request: "request refused",
  unsupported_provider: "provider not callable",
};

// "850 ms", "3.2 s", or "—" when nothing was recorded
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// One line: whitespace collapsed, cut on code points so an emoji is never split
export function preview(text: string | null, max = PREVIEW_MAX): string {
  if (text === null) return "";
  const line = Array.from(text.replace(/\s+/g, " ").trim());
  return line.length > max ? `${line.slice(0, max).join("").trimEnd()}…` : line.join("");
}

// Which chain a run used. prompt_chain_id is null both when the built-in chain
// ran (the database had no usable chain, and the notes start "config_fallback")
// and when the run stopped before a chain was picked. A model answer (succeeded,
// rejected, busy) means a chain ran, so a null id there is the built-in one.
export type ChainUse = "chain" | "built-in" | "none";

export function chainUse(run: { status: RequestStatus; chainId: number | null; error: string | null }): ChainUse {
  if (run.chainId !== null) return "chain";
  if (run.error?.includes("config_fallback")) return "built-in";
  return run.status === "succeeded" || run.status === "rejected" || run.status === "busy" ? "built-in" : "none";
}

// What the photo column shows. Admin runs always record their post, and app runs
// record it once they succeed, so a missing id there means the post was deleted
// since (image_id is set null). Otherwise the run never saved a post.
export type PhotoState = "post" | "deleted" | "none";

export function photoState(run: { status: RequestStatus; source: RequestSource; imageId: string | null }): PhotoState {
  if (run.imageId !== null) return "post";
  return run.source === "admin" || run.status === "succeeded" ? "deleted" : "none";
}
