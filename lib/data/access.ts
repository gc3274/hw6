import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowingDomains, DOMAINS_SHOWN, emailDomain, type AccessQuery, type SignupLists } from "@/lib/access";
import { rangeFor } from "@/lib/params";
import { adminDb } from "@/lib/supabase/admin";

// Reads for the sign-up domain and email whitelist pages. Writes live in their
// actions.ts files. Every read throws on error, so a page never shows
// half-loaded rows as real.

type DomainDbRow = { id: number; apex_domain: string; created_at: string; updated_at: string };
type AddressDbRow = { id: number; email_address: string; created_at: string; updated_at: string };

export type DomainRow = { id: number; apexDomain: string; createdAt: string; updatedAt: string };
export type AddressRow = { id: number; emailAddress: string; createdAt: string; updatedAt: string };

// coveredBy: another listed domain that lets the same people in, so deleting
// this entry changes nothing for them
export type DomainDetail = DomainRow & { coveredBy: string | null };
export type AddressDetail = AddressRow & { coveredBy: string | null };

const fail = (what: string, error: { message: string }) => new Error(`${what} failed: ${error.message}`);

const toDomain = (r: DomainDbRow): DomainRow => ({
  id: r.id,
  apexDomain: r.apex_domain,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toAddress = (r: AddressDbRow): AddressRow => ({
  id: r.id,
  emailAddress: r.email_address,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Both lists in one summary: the first few domains and how many of each
export async function signupLists(): Promise<SignupLists> {
  const db = await adminDb();
  const [domains, addresses] = await Promise.all([
    db
      .from("allowed_signup_domains")
      .select("apex_domain", { count: "exact" })
      .order("apex_domain")
      .order("id")
      .limit(DOMAINS_SHOWN)
      .overrideTypes<{ apex_domain: string }[], { merge: false }>(),
    db.from("whitelisted_email_addresses").select("id", { count: "exact", head: true }),
  ]);
  if (domains.error) throw fail("Allowed domains", domains.error);
  if (addresses.error) throw fail("Whitelisted addresses", addresses.error);

  return {
    domains: (domains.data ?? []).map((d) => d.apex_domain),
    domainCount: domains.count ?? 0,
    addressCount: addresses.count ?? 0,
  };
}

export async function listDomains(q: AccessQuery): Promise<{ rows: DomainRow[]; total: number }> {
  const db = await adminDb();
  let query = db
    .from("allowed_signup_domains")
    .select("id, apex_domain, created_at, updated_at", { count: "exact" });
  // q went through searchTerm(), so it carries no LIKE wildcards
  if (q.q) query = query.ilike("apex_domain", `%${q.q}%`);

  const [from, to] = rangeFor(q.page);
  const { data, error, count } = await query
    .order("apex_domain")
    .order("id")
    .range(from, to)
    .overrideTypes<DomainDbRow[], { merge: false }>();
  if (error) throw fail("Allowed domains list", error);
  return { rows: (data ?? []).map(toDomain), total: count ?? 0 };
}

export async function listAddresses(q: AccessQuery): Promise<{ rows: AddressRow[]; total: number }> {
  const db = await adminDb();
  let query = db
    .from("whitelisted_email_addresses")
    .select("id, email_address, created_at, updated_at", { count: "exact" });
  if (q.q) query = query.ilike("email_address", `%${q.q}%`);

  const [from, to] = rangeFor(q.page);
  const { data, error, count } = await query
    .order("email_address")
    .order("id")
    .range(from, to)
    .overrideTypes<AddressDbRow[], { merge: false }>();
  if (error) throw fail("Whitelisted addresses list", error);
  return { rows: (data ?? []).map(toAddress), total: count ?? 0 };
}

// The broadest listed domain among these candidates, or null
async function broadestListed(db: SupabaseClient, candidates: string[]): Promise<string | null> {
  if (candidates.length === 0) return null;
  const { data, error } = await db
    .from("allowed_signup_domains")
    .select("apex_domain")
    .in("apex_domain", candidates)
    .overrideTypes<{ apex_domain: string }[], { merge: false }>();
  if (error) throw fail("Covering domains", error);
  const found = (data ?? []).map((d) => d.apex_domain).sort((a, b) => a.length - b.length);
  return found[0] ?? null;
}

// null when no domain has this id, so the page can 404
export async function getDomain(id: number): Promise<DomainDetail | null> {
  const db = await adminDb();
  const { data, error } = await db
    .from("allowed_signup_domains")
    .select("id, apex_domain, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<DomainDbRow>();
  if (error) throw fail("Allowed domain", error);
  if (!data) return null;

  // Its parents only: apex_domain is unique, so the row itself never matches
  const coveredBy = await broadestListed(db, allowingDomains(data.apex_domain).slice(1));
  return { ...toDomain(data), coveredBy };
}

// null when no address has this id, so the page can 404
export async function getAddress(id: number): Promise<AddressDetail | null> {
  const db = await adminDb();
  const { data, error } = await db
    .from("whitelisted_email_addresses")
    .select("id, email_address, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<AddressDbRow>();
  if (error) throw fail("Whitelisted address", error);
  if (!data) return null;

  const domain = emailDomain(data.email_address);
  const coveredBy = domain ? await broadestListed(db, allowingDomains(domain)) : null;
  return { ...toAddress(data), coveredBy };
}
