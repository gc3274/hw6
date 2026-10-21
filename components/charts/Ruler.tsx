import { RATING_MAX } from "@/lib/roasts";

// Position on the 0-10 scorecard ruler as a CSS percentage, clamped to the ends
export function onRuler(value: number): string {
  return `${(Math.min(Math.max(value, 0), RATING_MAX) / RATING_MAX) * 100}%`;
}

// Tick numbers for the 0-10 ruler. The end labels sit inside the track so they
// never spill past the card.
export function RulerTicks({ ticks }: { ticks: number[] }) {
  return (
    <div aria-hidden="true" className="relative h-4 text-xs text-muted tabular-nums">
      {ticks.map((t) => (
        <span
          key={t}
          className={`absolute top-0 ${t <= 0 ? "" : t >= RATING_MAX ? "-translate-x-full" : "-translate-x-1/2"}`}
          style={{ left: onRuler(t) }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// One dot on the ruler: 10px, with a 2px surface ring so it stays legible where marks meet
export function RulerDot({ value, className }: { value: number; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${className}`}
      style={{ left: onRuler(value) }}
    />
  );
}
