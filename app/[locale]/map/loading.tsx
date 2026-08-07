/** Route-level loading state for the map (Fable Low) — fills the viewport so the
 * shell doesn't flash empty before the GL map mounts. */
export default function Loading() {
  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-surface-0"
      role="status"
      aria-label="Loading map"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-gold/25 border-t-brand-gold" />
    </div>
  );
}
