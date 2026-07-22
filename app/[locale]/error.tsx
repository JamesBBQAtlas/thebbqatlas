"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Segment-level error boundary for the localized app. Catches render/runtime
 * errors in a page and offers a retry without a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="u-eyebrow mb-3 text-brand-sienna-light">Something went wrong</p>
      <h1 className="font-heading text-3xl font-bold text-text-primary sm:text-4xl">
        The fire went out.
      </h1>
      <p className="mt-4 max-w-md text-lg text-text-secondary">
        Something broke on our end. Try again — if it keeps happening, it&apos;s
        us, not you.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-gold px-5 py-2.5 font-semibold text-brand-black transition-opacity hover:opacity-90"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </button>
      {error.digest && (
        <p className="mt-4 text-xs text-text-muted">Reference: {error.digest}</p>
      )}
    </div>
  );
}
