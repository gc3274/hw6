import type { ReactNode } from "react";

type MeterProps = {
  label: ReactNode;
  // A second, quieter line under the label
  detail?: ReactNode;
  value: number;
  total: number;
  // The count beside the label, e.g. "3 of 4"
  valueLabel: string;
  title: string;
};

// A single ratio against its whole: a thin fill on a lighter track of the same
// hue. With nothing to count, only the label and its reading show.
export default function Meter({ label, detail, value, total, valueLabel, title }: MeterProps) {
  const share = total > 0 ? Math.min(value / total, 1) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-sm">{label}</div>
        <div className={`shrink-0 text-sm tabular-nums ${total > 0 ? "" : "text-muted"}`}>{valueLabel}</div>
      </div>
      {detail && <div className="text-sm text-muted">{detail}</div>}
      {total > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-critic/15" title={title}>
          <div className="h-full rounded-full bg-critic" style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </div>
  );
}
