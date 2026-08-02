"use client";

import { useEffect, useState } from "react";
import { Moon, X } from "lucide-react";
import { openStateAt } from "@/lib/restaurants/hours";
import { SMALL_HOURS_LINE } from "@/lib/eggs/registry";

/**
 * Egg #6 — a quiet, dry aside for the night owls. Shows near the hours ONLY
 * when the visitor's own local time is roughly overnight (≈ midnight–5am) AND
 * the venue is currently closed by its hours. Client-only + gated behind an
 * effect, so it never renders on the server (no hydration flash, no layout
 * shift for anyone who isn't up at 3am reading about brisket). Dismissible.
 */
export function SmallHoursAside({ hours }: { hours: unknown }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const now = new Date();
    const overnight = now.getHours() >= 0 && now.getHours() < 5;
    if (overnight && openStateAt(hours, now) === "closed") setShow(true);
  }, [hours]);

  if (!show) return null;

  return (
    <p className="mt-2 flex items-start justify-between gap-2 rounded-md border border-brand-sienna/25 bg-brand-sienna/5 px-2.5 py-1.5 text-[0.75rem] italic leading-relaxed text-text-muted">
      <span className="flex items-start gap-1.5">
        <Moon className="mt-0.5 h-3 w-3 shrink-0 text-brand-sienna" aria-hidden="true" />
        {SMALL_HOURS_LINE}
      </span>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
      >
        <X className="h-3 w-3" />
      </button>
    </p>
  );
}
