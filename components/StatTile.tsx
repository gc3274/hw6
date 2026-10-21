import type { ReactNode } from "react";

type StatTileProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

// One KPI. Render tiles inside a <dl> so each label stays tied to its number.
export default function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight">{value}</dd>
      {detail && <dd className="mt-1 text-sm text-muted">{detail}</dd>}
    </div>
  );
}
