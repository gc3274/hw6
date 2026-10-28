import { describe, expect, it } from "vitest";
import {
  emptyPastEnd,
  hrefWith,
  ilikeAny,
  PAGE_SIZE,
  parseMediaQuery,
  parsePage,
  parseUserQuery,
  parseVoteQuery,
  rangeFor,
  searchTerm,
} from "@/lib/params";

const UUID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";

describe("parsePage", () => {
  it("defaults to 1 when missing or unreadable", () => {
    for (const v of [undefined, null, "", "abc", "NaN", "2.5", "1e3", "0x10", " 3", {}]) {
      expect(parsePage(v), String(v)).toBe(1);
    }
  });

  it("clamps zero and negatives to 1", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage(-2)).toBe(1);
  });

  it("reads whole numbers and caps them at 1000", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(7)).toBe(7);
    expect(parsePage("1000")).toBe(1000);
    expect(parsePage("5000")).toBe(1000);
  });

  it("uses the first value of a repeated param", () => {
    expect(parsePage(["4", "5"])).toBe(4);
    expect(parsePage([])).toBe(1);
  });
});

describe("rangeFor", () => {
  it("maps a page to an inclusive row range", () => {
    expect(PAGE_SIZE).toBe(25);
    expect(rangeFor(1)).toEqual([0, 24]);
    expect(rangeFor(3)).toEqual([50, 74]);
  });

  it("never returns a negative range", () => {
    expect(rangeFor(0)).toEqual([0, 24]);
    expect(rangeFor(Number.NaN)).toEqual([0, 24]);
  });
});

describe("parseMediaQuery", () => {
  it("defaults to roasts with no filters", () => {
    expect(parseMediaQuery({})).toEqual({
      kind: "roast",
      critic: null,
      topic: null,
      visibility: null,
      owner: null,
      image: null,
      page: 1,
    });
  });

  it("reads every filter", () => {
    expect(
      parseMediaQuery({
        kind: "all",
        critic: "chef-scorch",
        topic: "food",
        visibility: "private",
        owner: UUID,
        image: UUID.toUpperCase(),
        page: "2",
      }),
    ).toEqual({ kind: "all", critic: "chef-scorch", topic: "food", visibility: "private", owner: UUID, image: UUID, page: 2 });
  });

  it("accepts legacy as a kind and as a topic", () => {
    const q = parseMediaQuery({ kind: "legacy", topic: "legacy" });
    expect(q.kind).toBe("legacy");
    expect(q.topic).toBe("legacy");
  });

  it("drops bad values instead of passing them on", () => {
    expect(
      parseMediaQuery({
        kind: "everything",
        critic: "Chef_Scorch",
        topic: "selfies",
        visibility: "hidden",
        owner: "not-a-uuid",
        image: `${UUID}.png`,
        page: "-1",
      }),
    ).toEqual(parseMediaQuery({}));
  });

  it("drops critic slugs that are too long or carry PostgREST syntax", () => {
    expect(parseMediaQuery({ critic: "a".repeat(41) }).critic).toBeNull();
    expect(parseMediaQuery({ critic: "a".repeat(40) }).critic).toBe("a".repeat(40));
    expect(parseMediaQuery({ critic: "chef,id.eq.1" }).critic).toBeNull();
  });

  it("uses the first value of repeated params", () => {
    expect(parseMediaQuery({ critic: ["chef-scorch", "margaux"], topic: ["art", "food"] })).toMatchObject({
      critic: "chef-scorch",
      topic: "art",
    });
  });
});

describe("parseUserQuery", () => {
  it("defaults to everyone, newest first", () => {
    expect(parseUserQuery({})).toEqual({ q: null, role: null, sort: "joined", page: 1 });
  });

  it("reads search, role, sort and page", () => {
    expect(parseUserQuery({ q: "  ann  lee ", role: "superadmin", sort: "name", page: "2" })).toEqual({
      q: "ann lee",
      role: "superadmin",
      sort: "name",
      page: 2,
    });
  });

  it("drops unknown roles and sorts, and cleans the search", () => {
    expect(parseUserQuery({ q: "a,b)", role: "admin", sort: "email" })).toEqual({
      q: "ab",
      role: null,
      sort: "joined",
      page: 1,
    });
  });
});

describe("parseVoteQuery", () => {
  it("defaults to the votes view with no filters", () => {
    expect(parseVoteQuery({})).toEqual({ view: "votes", value: null, critic: null, topic: null, page: 1 });
  });

  it("reads view, value, critic, topic and page", () => {
    expect(parseVoteQuery({ view: "ratings", value: "down", critic: "margaux", topic: "fit", page: "3" })).toEqual({
      view: "ratings",
      value: "down",
      critic: "margaux",
      topic: "fit",
      page: 3,
    });
  });

  it("drops bad values, and legacy is not a ratings topic", () => {
    expect(parseVoteQuery({ view: "all", value: "1", critic: "Bad Slug", topic: "legacy" })).toEqual(parseVoteQuery({}));
  });
});

describe("searchTerm", () => {
  it("strips the characters that matter to PostgREST or LIKE", () => {
    expect(searchTerm("a,b)")).toBe("ab");
    expect(searchTerm('x,(y)*%_"z')).toBe("xyz");
    expect(searchTerm("back\\slash")).toBe("backslash");
  });

  it("keeps letters, digits, spaces and @ . ' -", () => {
    expect(searchTerm("O'Brien-Lee")).toBe("O'Brien-Lee");
    expect(searchTerm("ann.lee@columbia.edu")).toBe("ann.lee@columbia.edu");
    expect(searchTerm("José 2")).toBe("José 2");
  });

  it("collapses spaces and caps at 60 characters", () => {
    expect(searchTerm("  ann \t  lee  ")).toBe("ann lee");
    expect(searchTerm("a".repeat(80))).toBe("a".repeat(60));
    expect(searchTerm(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
  });

  it("returns null when nothing usable is left", () => {
    for (const v of [undefined, null, "", "   ", ",()*%_\"", "🔥", 42, {}]) {
      expect(searchTerm(v), String(v)).toBeNull();
    }
  });

  it("uses the first value of a repeated param", () => {
    expect(searchTerm(["ann", "bob"])).toBe("ann");
  });
});

describe("ilikeAny", () => {
  it("builds a PostgREST or() filter with quoted patterns", () => {
    expect(ilikeAny(["first_name", "last_name", "email"], "ann lee")).toBe(
      'first_name.ilike."%ann lee%",last_name.ilike."%ann lee%",email.ilike."%ann lee%"',
    );
  });

  it("handles a single column", () => {
    expect(ilikeAny(["email"], "a")).toBe('email.ilike."%a%"');
  });
});

describe("hrefWith", () => {
  const media = parseMediaQuery({});

  it("returns the bare route when everything is at its default", () => {
    expect(hrefWith("/media", media)).toBe("/media");
    expect(hrefWith("/users", parseUserQuery({}))).toBe("/users");
    expect(hrefWith("/votes", parseVoteQuery({}))).toBe("/votes");
  });

  it("drops defaults and page=1", () => {
    expect(hrefWith("/media", media, { kind: "roast", page: 1 })).toBe("/media");
    expect(hrefWith("/users", parseUserQuery({}), { sort: "joined" })).toBe("/users");
    expect(hrefWith("/votes", parseVoteQuery({}), { view: "votes" })).toBe("/votes");
  });

  it("keeps non-default values in a stable key order", () => {
    const a = hrefWith("/media", { ...media, topic: "food" }, { critic: "chef-scorch", kind: "all" });
    const b = hrefWith("/media", { ...media, kind: "all" }, { topic: "food", critic: "chef-scorch" });
    expect(a).toBe("/media?critic=chef-scorch&kind=all&topic=food");
    expect(b).toBe(a);
  });

  it("removes a filter patched to null", () => {
    expect(hrefWith("/media", { ...media, critic: "margaux", topic: "fit" }, { critic: null })).toBe("/media?topic=fit");
  });

  it("keeps the page for pagination links and resets it when a filter changes", () => {
    const onPage3 = { ...media, topic: "food" as const, page: 3 };
    expect(hrefWith("/media", onPage3)).toBe("/media?page=3&topic=food");
    expect(hrefWith("/media", onPage3, { page: 4 })).toBe("/media?page=4&topic=food");
    expect(hrefWith("/media", onPage3, { page: 1 })).toBe("/media?topic=food");
    expect(hrefWith("/media", onPage3, { topic: "art" })).toBe("/media?topic=art");
  });

  it("encodes search text", () => {
    expect(hrefWith("/users", parseUserQuery({}), { q: "ann lee" })).toBe("/users?q=ann+lee");
  });
});

describe("emptyPastEnd", () => {
  const pastEnd = {
    data: null,
    error: {
      code: "PGRST103",
      details: "An offset of 1000 was requested, but there are only 11 rows.",
      message: "Requested range not satisfiable",
    },
    count: null,
  };

  it("turns a page past the last row into an empty page with the real total", () => {
    expect(emptyPastEnd(pastEnd)).toMatchObject({ data: [], error: null, count: 11 });
  });

  it.each([
    ["An offset of 50 was requested, but there are only 1 rows.", 1],
    ["An offset of 50 was requested, but there are only 0 rows.", 0],
    [null, null],
  ])("reads the total from %j", (details, count) => {
    expect(emptyPastEnd({ ...pastEnd, error: { ...pastEnd.error, details } }).count).toBe(count);
  });

  it("leaves other errors and good pages alone", () => {
    const other = { data: null, error: { code: "57014", details: null }, count: null };
    expect(emptyPastEnd(other)).toBe(other);
    const ok = { data: [1, 2], error: null, count: 2 };
    expect(emptyPastEnd(ok)).toBe(ok);
  });
});
