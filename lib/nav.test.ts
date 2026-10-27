import { describe, expect, it } from "vitest";
import { ADMIN_NAV, ADMIN_NAV_GROUPS, isActive } from "./nav";

describe("ADMIN_NAV_GROUPS", () => {
  it("lists every admin section in its group, in order", () => {
    expect(ADMIN_NAV_GROUPS.map((g) => [g.label, g.items.map((i) => [i.label, i.href])])).toEqual([
      [
        "Content",
        [
          ["Overview", "/"],
          ["Users", "/users"],
          ["Images", "/images"],
          ["Roasts", "/media"],
          ["Votes & ratings", "/votes"],
        ],
      ],
      [
        "Prompts",
        [
          ["Chains & steps", "/prompt-chains"],
          ["Chain mix", "/chain-mix"],
          ["Terms", "/terms"],
          ["Examples", "/examples"],
        ],
      ],
      [
        "LLM",
        [
          ["Models", "/llm-models"],
          ["Providers", "/llm-providers"],
          ["Requests", "/requests"],
          ["Responses", "/llm-responses"],
        ],
      ],
      [
        "Access",
        [
          ["Sign-up domains", "/signup-domains"],
          ["Email whitelist", "/whitelist"],
        ],
      ],
    ]);
  });

  it("flattens to ADMIN_NAV with no repeated href", () => {
    expect(ADMIN_NAV).toHaveLength(15);
    expect(new Set(ADMIN_NAV.map((i) => i.href)).size).toBe(ADMIN_NAV.length);
  });
});

describe("isActive", () => {
  it("matches the overview on / only", () => {
    expect(isActive("/", "/")).toBe(true);
    for (const p of ["/users", "/media", "/media/new", "/votes", "/images"]) expect(isActive(p, "/")).toBe(false);
  });

  it("matches a section and the pages under it", () => {
    expect(isActive("/media", "/media")).toBe(true);
    expect(isActive("/media/new", "/media")).toBe(true);
    expect(isActive("/media/0b7f2c9e-1d2a-4c3b-9e8f-1a2b3c4d5e6f", "/media")).toBe(true);
    expect(isActive("/users/abc", "/users")).toBe(true);
    expect(isActive("/prompt-chains/2", "/prompt-chains")).toBe(true);
  });

  it("does not match a different path that shares a prefix", () => {
    expect(isActive("/mediax", "/media")).toBe(false);
    expect(isActive("/users-old", "/users")).toBe(false);
    expect(isActive("/", "/media")).toBe(false);
    expect(isActive("/llm-models", "/llm-responses")).toBe(false);
  });

  it("marks exactly one section on every admin route", () => {
    const routes = [
      "/",
      "/users",
      "/users/x",
      "/images",
      "/images/new",
      "/images/x",
      "/media",
      "/media/new",
      "/media/x",
      "/votes",
      "/prompt-chains",
      "/prompt-chains/1",
      "/chain-mix",
      "/terms",
      "/terms/new",
      "/terms/1",
      "/examples",
      "/examples/new",
      "/examples/1",
      "/llm-models",
      "/llm-models/new",
      "/llm-models/1",
      "/llm-providers",
      "/llm-providers/new",
      "/llm-providers/1",
      "/requests",
      "/requests/x",
      "/llm-responses",
      "/llm-responses/x",
      "/signup-domains",
      "/signup-domains/1",
      "/whitelist",
      "/whitelist/1",
    ];
    for (const p of routes) {
      expect(ADMIN_NAV.filter((i) => isActive(p, i.href)), p).toHaveLength(1);
    }
  });
});
