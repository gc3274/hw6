import { describe, expect, it } from "vitest";
import { ADMIN_NAV, isActive } from "./nav";

describe("ADMIN_NAV", () => {
  it("lists the four admin sections in order", () => {
    expect(ADMIN_NAV.map((i) => [i.label, i.href])).toEqual([
      ["Overview", "/"],
      ["Users", "/users"],
      ["Roasts", "/media"],
      ["Votes & ratings", "/votes"],
    ]);
  });
});

describe("isActive", () => {
  it("matches the overview on / only", () => {
    expect(isActive("/", "/")).toBe(true);
    for (const p of ["/users", "/media", "/media/new", "/votes"]) expect(isActive(p, "/")).toBe(false);
  });

  it("matches a section and the pages under it", () => {
    expect(isActive("/media", "/media")).toBe(true);
    expect(isActive("/media/new", "/media")).toBe(true);
    expect(isActive("/media/0b7f2c9e-1d2a-4c3b-9e8f-1a2b3c4d5e6f", "/media")).toBe(true);
    expect(isActive("/users/abc", "/users")).toBe(true);
  });

  it("does not match a different path that shares a prefix", () => {
    expect(isActive("/mediax", "/media")).toBe(false);
    expect(isActive("/users-old", "/users")).toBe(false);
    expect(isActive("/", "/media")).toBe(false);
  });

  it("marks exactly one section on every admin route", () => {
    const routes = ["/", "/users", "/users/x", "/media", "/media/new", "/media/x", "/votes"];
    for (const p of routes) {
      expect(ADMIN_NAV.filter((i) => isActive(p, i.href)), p).toHaveLength(1);
    }
  });
});
