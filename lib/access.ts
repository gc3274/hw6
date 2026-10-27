// Rules for the two sign-up lists (allowed_signup_domains and
// whitelisted_email_addresses) and what they mean for new accounts. Pure, so
// they run in tests. The formats are the tables' checks, and domainAllows is
// the match hook_before_user_created makes, both in the prompt chains migration.
import { codePoints, nouns } from "@/lib/format";
import { constraintField, type FormState } from "@/lib/forms";
import { parsePage, type SearchParams } from "@/lib/params";

export const DOMAIN_MAX = 253;
export const EMAIL_MAX = 254;
// allowed_signup_domains_format
export const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// whitelisted_email_addresses_format, with [:space:] written as \s
export const EMAIL_RE = /^[^@\s]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type AccessQuery = { q: string | null; page: number };

const SEARCH_MAX = 60;

// Like searchTerm, but domains and addresses keep + and _ (first_last@gmail.com,
// me+tag@gmail.com). The result only goes into an ilike pattern, through likePattern.
export function accessSearch(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const cleaned = v.trim().toLowerCase().replace(/[^\p{L}\p{N}@.+_'-]/gu, "");
  return Array.from(cleaned).slice(0, SEARCH_MAX).join("") || null;
}

// "contains" for .ilike(): LIKE's own wildcards and escape character are escaped
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

export function parseAccessQuery(sp: SearchParams): AccessQuery {
  return { q: accessSearch(sp.q), page: parsePage(sp.page) };
}

export type DomainField = "apex_domain";
export type EmailField = "email_address";
export type DomainState = FormState<DomainField>;
export type EmailState = FormState<EmailField>;

export const DOMAIN_RULES = {
  empty: "Enter a domain, like columbia.edu.",
  long: `Keep the domain to ${DOMAIN_MAX} characters.`,
  address: "That’s a whole email address. Enter just the part after the @, or add the address to the email whitelist.",
  format: "That isn’t a domain. Use letters, digits, hyphens and dots, like columbia.edu.",
  taken: "That domain is already on the list.",
} as const;

export const EMAIL_RULES = {
  empty: "Enter an email address.",
  long: `Keep the address to ${EMAIL_MAX} characters.`,
  format: "That isn’t a full email address. Enter one like someone@gmail.com.",
  taken: "That address is already on the list.",
} as const;

// People paste "@columbia.edu", so one leading @ is dropped
export function normalizeDomain(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v.startsWith("@") ? v.slice(1) : v;
}

// The column must be lowercase, and the hook lowercases the sign-up email too
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function validateDomain(
  fd: FormData,
): { ok: true; value: string } | { ok: false; errors: Record<DomainField, string> } {
  const value = normalizeDomain(fd.get("apex_domain"));
  const fail = (message: string) => ({ ok: false as const, errors: { apex_domain: message } });
  if (value === "") return fail(DOMAIN_RULES.empty);
  if (codePoints(value) > DOMAIN_MAX) return fail(DOMAIN_RULES.long);
  if (DOMAIN_RE.test(value)) return { ok: true, value };
  return fail(EMAIL_RE.test(value) ? DOMAIN_RULES.address : DOMAIN_RULES.format);
}

export function validateEmail(
  fd: FormData,
): { ok: true; value: string } | { ok: false; errors: Record<EmailField, string> } {
  const value = normalizeEmail(fd.get("email_address"));
  const fail = (message: string) => ({ ok: false as const, errors: { email_address: message } });
  if (value === "") return fail(EMAIL_RULES.empty);
  if (codePoints(value) > EMAIL_MAX) return fail(EMAIL_RULES.long);
  return EMAIL_RE.test(value) ? { ok: true, value } : fail(EMAIL_RULES.format);
}

const DOMAIN_CONSTRAINTS: Record<string, DomainField> = {
  allowed_signup_domains_apex_domain_key: "apex_domain",
  allowed_signup_domains_format: "apex_domain",
};

const EMAIL_CONSTRAINTS: Record<string, EmailField> = {
  whitelisted_email_addresses_email_key: "email_address",
  whitelisted_email_addresses_format: "email_address",
};

type DbError = { code?: string; message?: string } | null | undefined;

// A failed insert or update as a field error, or null when the field can't fix it
export function domainWriteErrors(error: DbError): Record<DomainField, string> | null {
  if (!constraintField(error, DOMAIN_CONSTRAINTS)) return null;
  return { apex_domain: error?.code === "23505" ? DOMAIN_RULES.taken : DOMAIN_RULES.format };
}

export function emailWriteErrors(error: DbError): Record<EmailField, string> | null {
  if (!constraintField(error, EMAIL_CONSTRAINTS)) return null;
  return { email_address: error?.code === "23505" ? EMAIL_RULES.taken : EMAIL_RULES.format };
}

// The hook's match: the email's domain is the listed domain or a subdomain of it
export function domainAllows(apex: string, domain: string): boolean {
  return domain === apex || domain.endsWith(`.${apex}`);
}

// What the hook reads as the domain: everything after the last @
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at === -1 || at === email.length - 1 ? null : email.slice(at + 1);
}

// Every list entry that would let `domain` in: itself and each parent that still
// has a dot (a listed domain always has one), e.g. cs.columbia.edu, columbia.edu
export function allowingDomains(domain: string): string[] {
  const labels = domain.split(".");
  return labels.slice(0, -1).map((_, i) => labels.slice(i).join("."));
}

// What the two lists add up to, for SignupEffect
export type SignupLists = {
  // The first few allowed domains, A to Z
  domains: string[];
  domainCount: number;
  addressCount: number;
};

export const DOMAINS_SHOWN = 3;

function domainList(domains: string[], count: number): string {
  const shown = domains.slice(0, DOMAINS_SHOWN);
  const rest = count - shown.length;
  if (shown.length === 0) return nouns(count, "allowed domain");
  if (rest > 0) return `${shown.join(", ")} or ${nouns(rest, "other domain")}`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} or ${shown[shown.length - 1]}`;
}

export function signupSummary({ domains, domainCount, addressCount }: SignupLists): { closed: boolean; text: string } {
  if (domainCount === 0 && addressCount === 0) {
    return {
      closed: true,
      text: "Sign-ups are closed: both lists are empty, so nobody new can create an account.",
    };
  }
  if (domainCount === 0) {
    return {
      closed: false,
      text:
        addressCount === 1
          ? "New accounts can sign up only with the 1 whitelisted address."
          : `New accounts can sign up only with one of the ${nouns(addressCount, "whitelisted address", "whitelisted addresses")}.`,
    };
  }
  const plus = addressCount > 0 ? `, plus ${nouns(addressCount, "whitelisted address", "whitelisted addresses")}` : "";
  return {
    closed: false,
    text: `New accounts can sign up with an email at ${domainList(domains, domainCount)} (subdomains included)${plus}.`,
  };
}

type DeleteContext = {
  // A listed parent domain that still lets the same people in, if any
  coveredBy: string | null;
  // Entries on both lists together, this one included
  entries: number;
};

const LAST_ENTRY = " It’s the last entry on both lists, so nobody new will be able to sign up.";
const FOREVER = " This can’t be undone.";

export function domainDeleteWarning(domain: string, { coveredBy, entries }: DeleteContext): string {
  if (coveredBy) {
    return `Sign-ups from ${domain} keep working, because ${coveredBy} is on the list too.${FOREVER}`;
  }
  const last = entries <= 1 ? LAST_ENTRY : "";
  return `New sign-ups with an email at ${domain} or its subdomains stop at the next sign-in attempt, unless a subdomain or address is listed separately. Existing accounts keep working.${last}${FOREVER}`;
}

export function emailDeleteWarning(email: string, { coveredBy, entries }: DeleteContext): string {
  if (coveredBy) {
    return `${email} can still sign up, because ${coveredBy} is an allowed domain.${FOREVER}`;
  }
  const last = entries <= 1 ? LAST_ENTRY : "";
  return `${email} can’t create an account from the next sign-in attempt. If it already has one, that account keeps working.${last}${FOREVER}`;
}
