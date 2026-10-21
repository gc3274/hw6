import { Fragment, type ReactNode } from "react";
import { RATING_MAX } from "@/lib/roasts";
import { onRuler, RulerDot, RulerTicks } from "./Ruler";

export type RangeRow = {
  key: string | number;
  label: ReactNode;
  min: number | null;
  max: number | null;
  mean: number | null;
  // Right-hand reading, e.g. "mean 3.7, 3 scored" or "no roasts yet"
  note: string;
  // Native tooltip on the row
  title: string;
};

type RangeStripProps = {
  rows: RangeRow[];
  // The shaded stretch of the ruler, drawn behind every row
  band: { from: number; to: number; label: string };
};

// One row per item on a shared 0-10 ruler: a line from lowest to highest, a dot
// at the mean, and the band the brief asks for shaded behind. A single score
// draws only the dot; no score draws an empty track.
export default function RangeStrip({ rows, band }: RangeStripProps) {
  const bandBox = { left: onRuler(band.from), width: `calc(${onRuler(band.to)} - ${onRuler(band.from)})` };
  return (
    <div className="@container">
      <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,9rem)] @lg:items-center @lg:gap-x-4">
        <div className="hidden @lg:block" />
        <div className="space-y-1 pb-1">
          <div className="relative h-5">
            <span
              className="absolute inset-y-0 flex items-center justify-center rounded-t-sm bg-grid px-1 text-xs whitespace-nowrap text-muted"
              style={bandBox}
            >
              {band.label}
            </span>
          </div>
          <RulerTicks ticks={[0, band.from, band.to, RATING_MAX]} />
        </div>
        <div className="hidden @lg:block" />

        {rows.map((row) => (
          <Fragment key={row.key}>
            <div className="mt-3 min-w-0 truncate text-sm @lg:mt-0">{row.label}</div>
            <div className="relative h-7" title={row.title}>
              <div aria-hidden="true" className="absolute inset-y-0 bg-grid" style={bandBox} />
              <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-line" />
              {row.min !== null && row.max !== null && row.max > row.min && (
                <div
                  aria-hidden="true"
                  className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-critic"
                  style={{ left: onRuler(row.min), width: `calc(${onRuler(row.max)} - ${onRuler(row.min)})` }}
                />
              )}
              {row.mean !== null && <RulerDot value={row.mean} className="bg-critic" />}
            </div>
            <div className="text-sm text-muted tabular-nums @lg:text-right">{row.note}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
