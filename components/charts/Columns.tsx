export type ColumnDatum = {
  key: string;
  label: string;
  // The two stacked series: base sits on the axis, top above it
  base: number;
  top: number;
  // Native tooltip for the column
  title: string;
};

type ColumnsProps = {
  data: ColumnDatum[];
  // SVG fill classes for the two series
  baseClass: string;
  topClass: string;
  // A labelled hairline at the left edge of one column's slot
  marker?: { index: number; label: string } | null;
  // Says what the chart shows; the table twin carries the values
  ariaLabel: string;
};

const PLOT = 168;
const PAD_TOP = 24;
const AXIS = 24;
const HEIGHT = PAD_TOP + PLOT + AXIS;
const GAP = 2;

// Smallest 1/2/5 step that gives at most four intervals
function tickStep(max: number): number {
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const s of [1, 2, 5]) if (Math.ceil(max / (s * magnitude)) <= 4) return s * magnitude;
  }
}

// A column segment with only its top corners rounded, drawn around x = 0
function roundedTop(width: number, yTop: number, yBottom: number): string {
  const r = Math.min(4, width / 2, yBottom - yTop);
  const x = -width / 2;
  return [
    `M ${x} ${yBottom}`,
    `V ${yTop + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${yTop}`,
    `H ${x + width - r}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${yTop + r}`,
    `V ${yBottom}`,
    "Z",
  ].join(" ");
}

// Stacked columns in one SVG. Positions are percentages of the width, so the
// chart fills any card without scaling its text; each column is a nested SVG
// at its slot's center, so it keeps a fixed width of at most 24px.
export default function Columns({ data, baseClass, topClass, marker, ariaLabel }: ColumnsProps) {
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(0, ...data.map((d) => d.base + d.top));
  const step = tickStep(max);
  const yMax = Math.max(1, Math.ceil(max / step)) * step;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const y = (v: number) => PAD_TOP + PLOT - (v / yMax) * PLOT;
  const width = Math.max(4, Math.min(24, Math.floor(240 / n)));
  const center = (i: number) => `${((i + 0.5) / n) * 100}%`;
  // Thin the week labels so they never touch; the latest always shows
  const every = Math.ceil(n / 6);
  const showLabel = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every);

  return (
    <div className="flex gap-2">
      <div aria-hidden="true" className="relative w-6 shrink-0 text-right text-xs text-muted tabular-nums" style={{ height: HEIGHT }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
            {t}
          </span>
        ))}
      </div>
      <svg role="img" aria-label={ariaLabel} width="100%" height={HEIGHT} className="min-w-0 flex-1 overflow-visible">
        {ticks.map((t) => (
          <line
            key={t}
            x1="0"
            x2="100%"
            y1={y(t)}
            y2={y(t)}
            strokeWidth={1}
            shapeRendering="crispEdges"
            className={t === 0 ? "stroke-deemph" : "stroke-grid"}
          />
        ))}

        {marker && marker.index >= 0 && marker.index < n && (
          <g>
            <line
              x1={`${(marker.index / n) * 100}%`}
              x2={`${(marker.index / n) * 100}%`}
              y1={PAD_TOP - 16}
              y2={y(0)}
              strokeWidth={1}
              shapeRendering="crispEdges"
              className="stroke-ink"
            />
            <text
              x={`${(marker.index / n) * 100}%`}
              dx={marker.index / n > 0.6 ? -4 : 4}
              y={PAD_TOP - 8}
              textAnchor={marker.index / n > 0.6 ? "end" : "start"}
              className="fill-ink text-xs"
            >
              {marker.label}
            </text>
          </g>
        )}

        {data.map((d, i) => {
          const total = d.base + d.top;
          const baseTop = y(d.base);
          // The 2px surface gap comes out of the top segment
          const topBottom = d.base > 0 ? baseTop - GAP : y(0);
          const topTop = Math.min(y(total), topBottom - 1);
          return (
            <svg key={d.key} x={center(i)} overflow="visible">
              <g>
                <title>{d.title}</title>
                <rect x={-12} y={PAD_TOP} width={24} height={PLOT} fill="transparent" />
                {d.base > 0 &&
                  (d.top > 0 ? (
                    <rect x={-width / 2} y={baseTop} width={width} height={y(0) - baseTop} className={baseClass} />
                  ) : (
                    <path d={roundedTop(width, baseTop, y(0))} className={baseClass} />
                  ))}
                {d.top > 0 && <path d={roundedTop(width, topTop, topBottom)} className={topClass} />}
              </g>
              {i === n - 1 && total > 0 && (
                <text y={y(total) - 6} textAnchor="middle" className="fill-ink text-xs tabular-nums">
                  {total}
                </text>
              )}
              {showLabel(i) && (
                <text y={y(0) + 16} textAnchor="middle" className="fill-muted text-xs">
                  {d.label}
                </text>
              )}
            </svg>
          );
        })}
      </svg>
    </div>
  );
}
