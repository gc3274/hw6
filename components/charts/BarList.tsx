import type { ReactNode } from "react";

export type BarListRow = {
  key: string;
  label: ReactNode;
  // A quieter line under the label
  detail?: ReactNode;
  value: number;
  valueLabel: string;
  title: string;
};

type BarListProps = {
  rows: BarListRow[];
  // Room kept after the longest bar for its value label
  reserve?: string;
};

// One series, one hue: a bar per item with its value at the tip
export default function BarList({ rows, reserve = "6rem" }: BarListProps) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="@container space-y-3">
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid gap-1 @md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] @md:items-center @md:gap-4"
        >
          <div className="min-w-0">
            <div className="truncate text-sm">{row.label}</div>
            {row.detail && <div className="text-xs text-muted">{row.detail}</div>}
          </div>
          <div className="flex min-w-0 items-center gap-2" title={row.title}>
            {row.value > 0 && (
              <div
                className="h-3 shrink-0 rounded-r bg-critic"
                style={{ width: `max(2px, calc((100% - ${reserve}) * ${row.value / max}))` }}
              />
            )}
            <span className={`text-sm whitespace-nowrap tabular-nums ${row.value > 0 ? "" : "text-muted"}`}>
              {row.valueLabel}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
