import { RATING_MAX } from "@/lib/roasts";

// The 0-10 scorecard: the critic's number plus a ten-notch ruler filled up to it,
// so a column of ratings can be scanned by length as well as read.
export default function RatingPill({ rating }: { rating: number | null }) {
  if (rating === null) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted">
        Unscored
      </span>
    );
  }

  const filled = Math.min(Math.max(Math.round(rating), 0), RATING_MAX);
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-0.5">
      <span className="text-sm font-semibold tabular-nums">
        <span className="sr-only">Rated </span>
        {rating}
        <span className="font-normal text-muted">/{RATING_MAX}</span>
      </span>
      <span aria-hidden="true" className="flex items-end gap-px">
        {Array.from({ length: RATING_MAX }, (_, i) => (
          <span
            key={i}
            className={`w-0.75 rounded-[1px] ${i < filled ? "bg-ink" : "bg-line"} ${i % 5 === 4 ? "h-3" : "h-2"}`}
          />
        ))}
      </span>
    </span>
  );
}
