import type { ReactNode } from "react";
import { card, focusRing } from "@/components/ui";

export type LegendItem = { label: string; swatch: string; shape?: "bar" | "dot" };
export type TableColumn = { label: string; numeric?: boolean };
export type TableView = { columns: TableColumn[]; rows: (string | number)[][] };

type ChartFrameProps = {
  id: string;
  title: string;
  description?: ReactNode;
  // What the numbers rest on, e.g. "17 roasts"; always shown, so small n is never hidden
  basis: string;
  // Drawn only for two or more series; one series is named by the title
  legend?: LegendItem[];
  // When set, this sentence stands in for the chart and its table
  empty?: string | null;
  // The chart as a table, for keyboard and screen-reader users and exact values
  table?: TableView;
  // Lines under the chart: verdicts, summaries, caveats
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
};

// The card every chart sits in: title, legend, the chart or its empty state,
// a "Show as table" twin, and the "based on" footnote.
export default function ChartFrame({
  id,
  title,
  description,
  basis,
  legend,
  empty,
  table,
  footer,
  className = "",
  children,
}: ChartFrameProps) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className={`${card} flex min-w-0 flex-col p-5 ${className}`}>
      <h3 id={titleId} className="font-semibold">
        {title}
      </h3>
      {description && <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>}

      {empty ? (
        <p className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <>
          {legend && legend.length >= 2 && <Legend items={legend} />}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-4 space-y-1 text-sm">{footer}</div>}
          {table && <TableTwin table={table} />}
        </>
      )}

      <p className="mt-auto pt-4 text-xs text-muted">Based on {basis}.</p>
    </section>
  );
}

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 ${item.shape === "dot" ? "rounded-full" : "rounded-xs"} ${item.swatch}`}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function TableTwin({ table }: { table: TableView }) {
  const align = (i: number) => (table.columns[i]?.numeric ? "text-right tabular-nums" : "text-left");
  return (
    <details className="group mt-4 text-sm">
      <summary className={`w-fit cursor-pointer rounded-sm font-medium text-accent ${focusRing}`}>
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              {table.columns.map((col, i) => (
                <th key={col.label} scope="col" className={`py-2 pr-4 font-medium whitespace-nowrap text-muted ${align(i)}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="border-b border-line last:border-0">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className={`py-2 pr-4 font-normal ${align(i)}`}>
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className={`py-2 pr-4 ${align(i)}`}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
