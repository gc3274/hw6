import type { ReactNode } from "react";

export type BarSegment = { value: number; name: string; className: string };

export type StackedRow = {
  key: string;
  label: ReactNode;
  segments: BarSegment[];
  // Read at the bar's tip, e.g. "3 of 4 posted"
  valueLabel: string;
  // Shown instead of a bar when the row has nothing in it
  emptyLabel: string;
};

type StackedBarProps = {
  rows: StackedRow[];
  // Room kept after the longest bar for its value label
  reserve?: string;
};

// Horizontal bars split into segments, all on one scale so length compares rows.
// 16px thick, a 2px gap between segments, only the data end rounded.
export default function StackedBar({ rows, reserve = "10rem" }: StackedBarProps) {
  const totals = rows.map((r) => r.segments.reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(0, ...totals);

  return (
    <ul className="@container space-y-3">
      {rows.map((row, i) => {
        const filled = row.segments.filter((s) => s.value > 0);
        return (
          <li
            key={row.key}
            className="grid gap-1 @md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] @md:items-center @md:gap-4"
          >
            <div className="min-w-0 text-sm">{row.label}</div>
            {totals[i] > 0 ? (
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="flex h-4 shrink-0 gap-0.5"
                  style={{ width: `max(2px, calc((100% - ${reserve}) * ${totals[i] / max}))` }}
                >
                  {filled.map((s, j) => (
                    <div
                      key={s.name}
                      title={`${s.name}: ${s.value}`}
                      className={`min-w-0.5 ${s.className} ${j === filled.length - 1 ? "rounded-r" : ""}`}
                      style={{ flex: `${s.value} 1 0` }}
                    />
                  ))}
                </div>
                <span className="text-sm whitespace-nowrap tabular-nums">{row.valueLabel}</span>
              </div>
            ) : (
              <p className="text-sm text-muted">{row.emptyLabel}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
