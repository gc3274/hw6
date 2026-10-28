// Search params for the list pages. Every value is parsed against a fixed set
// or pattern, so nothing raw reaches a PostgREST filter, and every link the
// pages build goes through hrefWith, so it targets a real route.
import { isUuid } from "@/lib/captions";
import { parseTopic, type Topic } from "@/lib/roasts";

export const PAGE_SIZE = 25;
export const MAX_PAGE = 1000;
const SEARCH_MAX = 60;

export type SearchParams = Record<string, string | string[] | undefined>;

// Search params can arrive as a string, a repeated param (array), or not at all
const firstParam = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => {
  const raw = firstParam(v);
  return allowed.find((a) => a === raw) ?? null;
};

const SLUG_RE = /^[a-z-]{1,40}$/;
const slug = (v: unknown): string | null => {
  const raw = firstParam(v);
  return typeof raw === "string" && SLUG_RE.test(raw) ? raw : null;
};

const uuid = (v: unknown): string | null => {
  const raw = firstParam(v);
  return isUuid(raw) ? raw.toLowerCase() : null;
};

// Whole numbers 1..1000; anything else is page 1
export function parsePage(v: unknown): number {
  const raw = firstParam(v);
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n)) return 1;
  return Math.min(Math.max(n, 1), MAX_PAGE);
}

// Inclusive bounds for .range()
export function rangeFor(page: number): [number, number] {
  const p = parsePage(page);
  return [(p - 1) * PAGE_SIZE, p * PAGE_SIZE - 1];
}

type PageResult = {
  data: unknown[] | null;
  error: { code?: string; details?: string | null } | null;
  count: number | null;
};

// PostgREST answers a page past the last row with an error (416, PGRST103) instead
// of an empty page. Its details say how many rows there are ("An offset of 1000 was
// requested, but there are only 11 rows."), so this turns it back into an empty page
// with that total, and the list shows "past the end" instead of "couldn't load".
export function emptyPastEnd<R extends PageResult>(result: R): R {
  if (result.error?.code !== "PGRST103") return result;
  const total = /only (\d+) rows?/.exec(result.error.details ?? "")?.[1];
  return { ...result, data: [], error: null, count: total === undefined ? null : Number(total) };
}

export type MediaQuery = {
  kind: "roast" | "legacy" | "all";
  critic: string | null;
  topic: Topic | "legacy" | null;
  visibility: "public" | "private" | null;
  owner: string | null;
  image: string | null;
  page: number;
};

export function parseMediaQuery(sp: SearchParams): MediaQuery {
  return {
    kind: oneOf(sp.kind, ["roast", "legacy", "all"] as const) ?? "roast",
    critic: slug(sp.critic),
    topic: parseTopic(sp.topic) ?? oneOf(sp.topic, ["legacy"] as const),
    visibility: oneOf(sp.visibility, ["public", "private"] as const),
    owner: uuid(sp.owner),
    image: uuid(sp.image),
    page: parsePage(sp.page),
  };
}

export type UserQuery = {
  q: string | null;
  role: "superadmin" | null;
  sort: "joined" | "name";
  page: number;
};

export function parseUserQuery(sp: SearchParams): UserQuery {
  return {
    q: searchTerm(sp.q),
    role: oneOf(sp.role, ["superadmin"] as const),
    sort: oneOf(sp.sort, ["joined", "name"] as const) ?? "joined",
    page: parsePage(sp.page),
  };
}

export type VoteQuery = {
  view: "votes" | "ratings";
  value: "up" | "down" | null;
  critic: string | null;
  // Ratings are roasts only, so there is no legacy topic here
  topic: Topic | null;
  page: number;
};

export function parseVoteQuery(sp: SearchParams): VoteQuery {
  return {
    view: oneOf(sp.view, ["votes", "ratings"] as const) ?? "votes",
    value: oneOf(sp.value, ["up", "down"] as const),
    critic: slug(sp.critic),
    topic: parseTopic(sp.topic),
    page: parsePage(sp.page),
  };
}

// Letters, marks, digits, space and @ . ' - only. That removes , ( ) * % _ " and \,
// so the term can't change the or() grammar or add LIKE wildcards.
const NOT_SEARCHABLE = /[^\p{L}\p{M}\p{N} @.'-]/gu;
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function searchTerm(raw: unknown): string | null {
  const v = firstParam(raw);
  if (typeof v !== "string") return null;
  const cleaned = collapse(collapse(v).replace(NOT_SEARCHABLE, ""));
  const capped = Array.from(cleaned).slice(0, SEARCH_MAX).join("").trimEnd();
  return capped || null;
}

// For .or(): `first_name.ilike."%term%",last_name.ilike."%term%"`. Pass a searchTerm() result.
export function ilikeAny(cols: string[], term: string): string {
  return cols.map((col) => `${col}.ilike."%${term}%"`).join(",");
}

export type ParamValue = string | number | null | undefined;

// Values that are the parsers' defaults, so links leave them out
const DEFAULTS: Record<string, string> = { page: "1", kind: "roast", sort: "joined", view: "votes" };

// Canonical link: current params with the patch applied, empty values and
// defaults dropped, keys sorted. Changing anything but the page starts again
// at page 1, so a filter link can't land past the last page.
export function hrefWith(pathname: string, current: Record<string, ParamValue>, patch: Record<string, ParamValue> = {}): string {
  const merged: Record<string, ParamValue> = { ...current, ...patch };
  if (!("page" in patch) && Object.keys(patch).length > 0) delete merged.page;

  const params = new URLSearchParams();
  for (const key of Object.keys(merged).sort()) {
    const value = merged[key];
    if (value === null || value === undefined || value === "") continue;
    if (String(value) === DEFAULTS[key]) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
