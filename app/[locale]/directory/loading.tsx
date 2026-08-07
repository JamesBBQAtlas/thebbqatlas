/** Route-level loading state for the directory (Fable Low). */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-gold/25 border-t-brand-gold" />
    </div>
  );
}
