import "server-only";

// The two builder methods selectAll needs; a PostgREST select() query has both
type Pageable<T> = {
  order(column: string): Pageable<T>;
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

export type SelectAllResult<T> = { rows: T[]; truncated: boolean };

// PostgREST returns at most 1000 rows per request, so a full-table read pages
// through with .range(). Every page is ordered by the table's primary key, or
// pages could overlap or skip rows. Stops at `cap` rows and says if it cut any.
// A failed page throws: partial data would make every stat quietly wrong.
export async function selectAll<T>(
  build: () => Pageable<T>,
  orderBy: readonly [string, ...string[]],
  { pageSize = 1000, cap = 20000 }: { pageSize?: number; cap?: number } = {},
): Promise<SelectAllResult<T>> {
  const page = async (from: number, to: number): Promise<T[]> => {
    let query = build();
    for (const column of orderBy) query = query.order(column);
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(`Paged read failed: ${error.message}`);
    return data ?? [];
  };

  const rows: T[] = [];
  while (rows.length < cap) {
    const from = rows.length;
    const to = Math.min(from + pageSize, cap) - 1;
    const batch = await page(from, to);
    rows.push(...batch);
    if (batch.length < to - from + 1) return { rows, truncated: false };
  }

  // Exactly at the cap: one more row means the table is bigger than what we read
  const more = await page(cap, cap);
  return { rows, truncated: more.length > 0 };
}
