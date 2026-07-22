export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center gap-3 text-text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-brand-gold" />
        <p className="text-sm">Loading the back office…</p>
      </div>
    </div>
  );
}
