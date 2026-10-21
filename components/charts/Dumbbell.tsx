import { Fragment, type ReactNode } from "react";
import { RATING_MAX } from "@/lib/roasts";
import { onRuler, RulerDot, RulerTicks } from "./Ruler";

export type DumbbellRow = {
  key: string;
  label: ReactNode;
  from: number;
  to: number;
  // Right-hand reading, e.g. "4.0 to 6.0, +2.0"
  note: string;
  title: string;
};

type DumbbellProps = {
  rows: DumbbellRow[];
  // Fill classes for the two dots; the legend names them
  fromClass: string;
  toClass: string;
};

// Before and after per item on the 0-10 ruler: two dots joined by a thin
// connector. Equal values draw one dot, the "to" dot on top.
export default function Dumbbell({ rows, fromClass, toClass }: DumbbellProps) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,8rem)] @lg:items-center @lg:gap-x-4">
        <div className="hidden @lg:block" />
        <RulerTicks ticks={[0, 5, RATING_MAX]} />
        <div className="hidden @lg:block" />

        {rows.map((row) => {
          const lo = Math.min(row.from, row.to);
          const hi = Math.max(row.from, row.to);
          return (
            <Fragment key={row.key}>
              <div className="mt-3 min-w-0 truncate text-sm @lg:mt-0">{row.label}</div>
              <div className="relative h-7" title={row.title}>
                <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {hi > lo && (
                  <div
                    aria-hidden="true"
                    className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-deemph"
                    style={{ left: onRuler(lo), width: `calc(${onRuler(hi)} - ${onRuler(lo)})` }}
                  />
                )}
                <RulerDot value={row.from} className={fromClass} />
                <RulerDot value={row.to} className={toClass} />
              </div>
              <div className="text-sm text-muted tabular-nums @lg:text-right">{row.note}</div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
