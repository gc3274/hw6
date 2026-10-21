// The product name in the display face, plus the admin's one touch of the main
// app's lime: the Admin chip, so it's always clear which app this is.
export default function Wordmark() {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-display text-lg leading-tight font-bold tracking-tight">
        Deconstructive Criticism
      </span>
      <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-semibold text-ink">Admin</span>
    </span>
  );
}
