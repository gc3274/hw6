import type { ReactNode } from "react";

export type DivergingRow = {
  key: string;
  // Above the bar, e.g. the critic, score and roast
  label?: ReactNode;
  up: number;
  down: number;
  // Below the bar, e.g. "3 of 5 never voted on"
  note?: ReactNode;
  title: string;
};

type DivergingBarProps = {
  rows: DivergingRow[];
  // Shared scale; defaults to the largest side of any row
  max?: number;
};

const side = (n: number, max: number) => `${(n / max) * 100}%`;

// Polarity around a neutral midline: downvotes grow left, upvotes right, each
// count at its bar's end. A row with no votes keeps only the midline.
export default function DivergingBar({ rows, max }: DivergingBarProps) {
  const scale = Math.max(1, max ?? Math.max(0, ...rows.flatMap((r) => [r.up, r.down])));
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.key} className="min-w-0">
          {row.label && <div className="mb-1.5 min-w-0">{row.label}</div>}
          <div
            className="grid grid-cols-[2.25rem_minmax(0,1fr)_1px_minmax(0,1fr)_2.25rem] items-center gap-x-0.5"
            title={row.title}
          >
            <span className="pr-1 text-right text-xs text-muted tabular-nums">
              {row.down > 0 ? `−${row.down}` : ""}
            </span>
            <div className="flex justify-end">
              {row.down > 0 && (
                <div className="h-3 rounded-l bg-negative" style={{ width: side(row.down, scale) }} />
              )}
            </div>
            <div aria-hidden="true" className="h-5 bg-deemph" />
            <div className="flex">
              {row.up > 0 && <div className="h-3 rounded-r bg-critic" style={{ width: side(row.up, scale) }} />}
              {row.up === 0 && row.down === 0 && <span className="pl-2 text-xs text-muted">no votes yet</span>}
            </div>
            <span className="pl-1 text-xs text-muted tabular-nums">{row.up > 0 ? `+${row.up}` : ""}</span>
          </div>
          {row.note && <div className="mt-1 text-xs text-muted">{row.note}</div>}
        </li>
      ))}
    </ul>
  );
}
