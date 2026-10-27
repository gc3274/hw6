import { describe, expect, it } from "vitest";
import {
  allowingDomains,
  DOMAIN_MAX,
  DOMAIN_RE,
  DOMAIN_RULES,
  domainAllows,
  domainDeleteWarning,
  domainWriteErrors,
  EMAIL_MAX,
  EMAIL_RE,
  EMAIL_RULES,
  emailDeleteWarning,
  emailDomain,
  emailWriteErrors,
  normalizeDomain,
  normalizeEmail,
  likePattern,
  parseAccessQuery,
  signupSummary,
  validateDomain,
  validateEmail,
} from "./access";

// The checks in the prompt chains migration, copied as written
const SQL_DOMAIN = String.raw`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`;
const SQL_EMAIL = String.raw`^[^@[:space:]]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`;

const domainForm = (value: string) => {
  const fd = new FormData();
  fd.set("apex_domain", value);
  return fd;
};

const emailForm = (value: string) => {
  const fd = new FormData();
  fd.set("email_address", value);
  return fd;
};

describe("formats match the sign-up list checks in the migration", () => {
  it("uses the same regexes and lengths", () => {
    expect(DOMAIN_RE.source).toBe(SQL_DOMAIN);
    expect(EMAIL_RE.source).toBe(SQL_EMAIL.replace("[:space:]", "\\s"));
    expect([DOMAIN_MAX, EMAIL_MAX]).toEqual([253, 254]);
  });
});

describe("normalizeDomain", () => {
  it.each([
    ["columbia.edu", "columbia.edu"],
    ["  Columbia.EDU ", "columbia.edu"],
    ["@columbia.edu", "columbia.edu"],
    [" @Barnard.edu", "barnard.edu"],
    ["@@columbia.edu", "@columbia.edu"],
    ["", ""],
  ])("%j becomes %j", (raw, value) => {
    expect(normalizeDomain(raw)).toBe(value);
  });

  it("reads a missing field as empty", () => {
    expect(normalizeDomain(null)).toBe("");
  });
});

describe("validateDomain", () => {
  it.each([
    ["columbia.edu", "columbia.edu"],
    ["@columbia.edu", "columbia.edu"],
    [" CS.Columbia.edu ", "cs.columbia.edu"],
    ["a-b.co", "a-b.co"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
    ["0.io", "0.io"],
    [`${"a".repeat(63)}.com`, `${"a".repeat(63)}.com`],
    [`${"a.".repeat(125)}com`, `${"a.".repeat(125)}com`],
  ])("accepts %j as %j", (raw, value) => {
    expect(validateDomain(domainForm(raw))).toEqual({ ok: true, value });
  });

  it.each([
    ["", DOMAIN_RULES.empty],
    ["  ", DOMAIN_RULES.empty],
    ["@", DOMAIN_RULES.empty],
    [`${"a.".repeat(125)}comm`, DOMAIN_RULES.long],
    ["someone@columbia.edu", DOMAIN_RULES.address],
    ["columbia", DOMAIN_RULES.format],
    ["columbia.", DOMAIN_RULES.format],
    [".edu", DOMAIN_RULES.format],
    ["-cs.columbia.edu", DOMAIN_RULES.format],
    ["cs-.columbia.edu", DOMAIN_RULES.format],
    ["cs_lab.columbia.edu", DOMAIN_RULES.format],
    ["columbia.e", DOMAIN_RULES.format],
    ["columbia.c0m", DOMAIN_RULES.format],
    ["@@columbia.edu", DOMAIN_RULES.format],
    ["https://columbia.edu", DOMAIN_RULES.format],
    ["columbia .edu", DOMAIN_RULES.format],
    [`${"a".repeat(64)}.com`, DOMAIN_RULES.format],
  ])("rejects %j", (raw, message) => {
    expect(validateDomain(domainForm(raw))).toEqual({ ok: false, errors: { apex_domain: message } });
  });
});

describe("validateEmail", () => {
  it.each([
    ["someone@gmail.com", "someone@gmail.com"],
    ["  Some.One+roasts@CS.Columbia.edu ", "some.one+roasts@cs.columbia.edu"],
    ["ünï@example.org", "ünï@example.org"],
    [`${"a".repeat(249)}@x.co`, `${"a".repeat(249)}@x.co`],
  ])("accepts %j as %j", (raw, value) => {
    expect(validateEmail(emailForm(raw))).toEqual({ ok: true, value });
  });

  it.each([
    ["", EMAIL_RULES.empty],
    [" ", EMAIL_RULES.empty],
    [`${"a".repeat(250)}@x.co`, EMAIL_RULES.long],
    ["someone", EMAIL_RULES.format],
    ["someone@gmail", EMAIL_RULES.format],
    ["@gmail.com", EMAIL_RULES.format],
    ["some one@gmail.com", EMAIL_RULES.format],
    ["a@@gmail.com", EMAIL_RULES.format],
    ["a@b@gmail.com", EMAIL_RULES.format],
    ["someone@gmail_mail.com", EMAIL_RULES.format],
    ["someone@-gmail.com", EMAIL_RULES.format],
  ])("rejects %j", (raw, message) => {
    expect(validateEmail(emailForm(raw))).toEqual({ ok: false, errors: { email_address: message } });
  });

  it("stores only lowercase, as the check requires", () => {
    const result = validateEmail(emailForm("ROAST@GMAIL.COM"));
    expect(result.ok && result.value).toBe("roast@gmail.com");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("write errors", () => {
  it("names duplicates in plain words", () => {
    expect(
      domainWriteErrors({ code: "23505", message: 'violates unique constraint "allowed_signup_domains_apex_domain_key"' }),
    ).toEqual({ apex_domain: DOMAIN_RULES.taken });
    expect(
      emailWriteErrors({ code: "23505", message: 'violates unique constraint "whitelisted_email_addresses_email_key"' }),
    ).toEqual({ email_address: EMAIL_RULES.taken });
  });

  it("maps the format checks to the field", () => {
    expect(domainWriteErrors({ code: "23514", message: 'violates check constraint "allowed_signup_domains_format"' })).toEqual(
      { apex_domain: DOMAIN_RULES.format },
    );
    expect(
      emailWriteErrors({ code: "23514", message: 'violates check constraint "whitelisted_email_addresses_format"' }),
    ).toEqual({ email_address: EMAIL_RULES.format });
  });

  it("leaves other errors to the generic message", () => {
    expect(domainWriteErrors({ code: "23505", message: 'violates unique constraint "other_key"' })).toBeNull();
    expect(emailWriteErrors({ code: "08006", message: "connection failure" })).toBeNull();
    expect(emailWriteErrors(null)).toBeNull();
  });
});

describe("domainAllows (the hook's match)", () => {
  it.each([
    ["columbia.edu", "columbia.edu", true],
    ["columbia.edu", "cs.columbia.edu", true],
    ["columbia.edu", "a.b.columbia.edu", true],
    ["columbia.edu", "notcolumbia.edu", false],
    ["columbia.edu", "columbia.edu.evil.com", false],
    ["cs.columbia.edu", "columbia.edu", false],
  ])("%s allows %s: %s", (apex, domain, allowed) => {
    expect(domainAllows(apex, domain)).toBe(allowed);
  });
});

describe("emailDomain", () => {
  it.each([
    ["someone@cs.columbia.edu", "cs.columbia.edu"],
    ['"a@b"@gmail.com', "gmail.com"],
    ["someone", null],
    ["someone@", null],
  ])("%j has domain %j", (email, domain) => {
    expect(emailDomain(email)).toBe(domain);
  });
});

describe("allowingDomains", () => {
  it("lists the domain and each parent with a dot", () => {
    expect(allowingDomains("a.cs.columbia.edu")).toEqual(["a.cs.columbia.edu", "cs.columbia.edu", "columbia.edu"]);
    expect(allowingDomains("columbia.edu")).toEqual(["columbia.edu"]);
  });

  it("finds exactly the listed domains the hook would match", () => {
    const listed = ["columbia.edu", "cs.columbia.edu", "barnard.edu", "notcolumbia.edu", "edu.columbia.edu"];
    for (const domain of ["columbia.edu", "cs.columbia.edu", "x.cs.columbia.edu", "barnard.edu", "gmail.com"]) {
      const viaCandidates = listed.filter((apex) => allowingDomains(domain).includes(apex));
      const viaHook = listed.filter((apex) => domainAllows(apex, domain));
      expect(viaCandidates, domain).toEqual(viaHook);
    }
  });
});

describe("signupSummary", () => {
  it("says sign-ups are closed when both lists are empty", () => {
    expect(signupSummary({ domains: [], domainCount: 0, addressCount: 0 })).toEqual({
      closed: true,
      text: "Sign-ups are closed: both lists are empty, so nobody new can create an account.",
    });
  });

  it.each([
    [
      { domains: ["columbia.edu"], domainCount: 1, addressCount: 0 },
      "New accounts can sign up with an email at columbia.edu (subdomains included).",
    ],
    [
      { domains: ["barnard.edu", "columbia.edu"], domainCount: 2, addressCount: 2 },
      "New accounts can sign up with an email at barnard.edu or columbia.edu (subdomains included), plus 2 whitelisted addresses.",
    ],
    [
      { domains: ["a.edu", "b.edu", "c.edu"], domainCount: 3, addressCount: 1 },
      "New accounts can sign up with an email at a.edu, b.edu or c.edu (subdomains included), plus 1 whitelisted address.",
    ],
    [
      { domains: ["a.edu", "b.edu", "c.edu"], domainCount: 5, addressCount: 0 },
      "New accounts can sign up with an email at a.edu, b.edu, c.edu or 2 other domains (subdomains included).",
    ],
    [
      { domains: ["a.edu", "b.edu", "c.edu"], domainCount: 4, addressCount: 0 },
      "New accounts can sign up with an email at a.edu, b.edu, c.edu or 1 other domain (subdomains included).",
    ],
    [{ domains: [], domainCount: 0, addressCount: 1 }, "New accounts can sign up only with the 1 whitelisted address."],
    [
      { domains: [], domainCount: 0, addressCount: 3 },
      "New accounts can sign up only with one of the 3 whitelisted addresses.",
    ],
  ])("summarises %j", (lists, text) => {
    expect(signupSummary(lists)).toEqual({ closed: false, text });
  });
});

describe("delete warnings", () => {
  it("says new sign-ups from a domain stop and existing accounts keep working", () => {
    const warning = domainDeleteWarning("columbia.edu", { coveredBy: null, entries: 3 });
    expect(warning).toBe(
      "New sign-ups with an email at columbia.edu or its subdomains stop at the next sign-in attempt, unless a subdomain or address is listed separately. Existing accounts keep working. This can’t be undone.",
    );
  });

  it("warns when the domain is the last entry on both lists", () => {
    expect(domainDeleteWarning("columbia.edu", { coveredBy: null, entries: 1 })).toContain(
      "It’s the last entry on both lists, so nobody new will be able to sign up.",
    );
  });

  it("says nothing changes when a parent domain still covers it", () => {
    expect(domainDeleteWarning("cs.columbia.edu", { coveredBy: "columbia.edu", entries: 2 })).toBe(
      "Sign-ups from cs.columbia.edu keep working, because columbia.edu is on the list too. This can’t be undone.",
    );
  });

  it("says the same for a whitelisted address", () => {
    expect(emailDeleteWarning("someone@gmail.com", { coveredBy: null, entries: 4 })).toBe(
      "someone@gmail.com can’t create an account from the next sign-in attempt. If it already has one, that account keeps working. This can’t be undone.",
    );
    expect(emailDeleteWarning("someone@gmail.com", { coveredBy: null, entries: 1 })).toContain(
      "nobody new will be able to sign up",
    );
    expect(emailDeleteWarning("someone@cs.columbia.edu", { coveredBy: "columbia.edu", entries: 2 })).toBe(
      "someone@cs.columbia.edu can still sign up, because columbia.edu is an allowed domain. This can’t be undone.",
    );
  });

  it("never calls an entry the last while others remain", () => {
    for (const entries of [2, 10]) {
      expect(domainDeleteWarning("a.edu", { coveredBy: null, entries })).not.toContain("last entry");
      expect(emailDeleteWarning("a@b.co", { coveredBy: null, entries })).not.toContain("last entry");
    }
  });
});

describe("parseAccessQuery", () => {
  it.each([
    [{}, { q: null, page: 1 }],
    [{ q: " Columbia.edu ", page: "2" }, { q: "columbia.edu", page: 2 }],
    [{ q: "first_last@gmail.com" }, { q: "first_last@gmail.com", page: 1 }],
    [{ q: "me+tag@gmail.com" }, { q: "me+tag@gmail.com", page: 1 }],
    [{ q: "a%b*c,(d)", page: "-1" }, { q: "abcd", page: 1 }],
    [{ q: "%%" }, { q: null, page: 1 }],
  ])("reads %j", (sp, query) => {
    expect(parseAccessQuery(sp)).toEqual(query);
  });
});

describe("likePattern", () => {
  it("escapes LIKE wildcards so _ and \\ match themselves", () => {
    expect(likePattern("first_last@gmail.com")).toBe("%first\\_last@gmail.com%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
    expect(likePattern("me+tag")).toBe("%me+tag%");
  });
});
