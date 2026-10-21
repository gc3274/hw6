import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { selectAll } from "@/lib/data/select-all";

type Call = { order: string[]; from: number; to: number };

// A fake PostgREST table: records the order columns and range of every request
function fakeTable(size: number, failAt: number | null = null) {
  const rows = Array.from({ length: size }, (_, i) => ({ i }));
  const calls: Call[] = [];
  const build = () => {
    const order: string[] = [];
    const query = {
      order(column: string) {
        order.push(column);
        return query;
      },
      range(from: number, to: number) {
        calls.push({ order: [...order], from, to });
        if (failAt !== null && from >= failAt) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
    };
    return query;
  };
  return { build, calls };
}

describe("selectAll", () => {
  it("pages past the 1000-row cap until a short page", async () => {
    const table = fakeTable(2500);
    const result = await selectAll(table.build, ["id"]);
    expect(result.rows).toHaveLength(2500);
    expect(result.rows.map((r) => r.i)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    expect(result.truncated).toBe(false);
    expect(table.calls.map((c) => [c.from, c.to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("orders every page by the given key columns", async () => {
    const table = fakeTable(1500);
    await selectAll(table.build, ["caption_id", "user_id"]);
    expect(table.calls.map((c) => c.order)).toEqual([
      ["caption_id", "user_id"],
      ["caption_id", "user_id"],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const table = fakeTable(2000);
    const result = await selectAll(table.build, ["id"]);
    expect(result).toMatchObject({ truncated: false });
    expect(result.rows).toHaveLength(2000);
    expect(table.calls).toHaveLength(3);
  });

  it("returns [] for an empty table", async () => {
    const table = fakeTable(0);
    expect(await selectAll(table.build, ["id"])).toEqual({ rows: [], truncated: false });
  });

  it("stops at the cap and says whether rows were left behind", async () => {
    const over = fakeTable(2500);
    const cut = await selectAll(over.build, ["id"], { pageSize: 1000, cap: 2000 });
    expect(cut.rows).toHaveLength(2000);
    expect(cut.truncated).toBe(true);
    expect(over.calls.every((c) => c.to < 2000 || c.from === 2000)).toBe(true);

    const exact = fakeTable(2000);
    expect(await selectAll(exact.build, ["id"], { pageSize: 1000, cap: 2000 })).toMatchObject({ truncated: false });
  });

  it("keeps every page inside the cap when the cap is not a multiple of the page size", async () => {
    const table = fakeTable(5000);
    const result = await selectAll(table.build, ["id"], { pageSize: 1000, cap: 2500 });
    expect(result.rows).toHaveLength(2500);
    expect(table.calls.slice(0, 3).map((c) => [c.from, c.to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ]);
  });

  it("throws when a page fails, instead of returning partial data", async () => {
    const table = fakeTable(2500, 1000);
    await expect(selectAll(table.build, ["id"])).rejects.toThrow("boom");
  });
});
