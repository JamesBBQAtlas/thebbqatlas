"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Check, X } from "lucide-react";

/**
 * Quick-photo mode: paste one Instagram post/reel URL to set a venue's embedded
 * hero without a full re-enrichment. Used in the pending queue and the listings
 * table so we can photo-up existing live venues fast.
 */
export function QuickPhotoInput({
  restaurantId,
  current = null,
}: {
  restaurantId: string;
  current?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(url: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/venues/hero-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, postUrl: url }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(data.error ?? "Failed.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={current ? "Change hero photo" : "Set Instagram hero photo"}
        className={
          "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors " +
          (current
            ? "border-brand-gold/50 text-brand-gold hover:bg-brand-gold/10"
            : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold")
        }
      >
        <Camera className="h-3.5 w-3.5" />
        {current ? "Photo ✓" : "Photo"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste Instagram post URL…"
          className="w-56 rounded-md border border-border-default bg-surface-1 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => save(value.trim())}
          disabled={busy || !value.trim()}
          title="Set hero"
          className="inline-flex items-center rounded-md bg-brand-gold px-2 py-1.5 text-xs font-bold text-text-inverse disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        {current && (
          <button
            type="button"
            onClick={() => save("")}
            disabled={busy}
            title="Clear hero"
            className="inline-flex items-center rounded-md border border-border-default px-2 py-1.5 text-xs text-text-muted hover:border-destructive hover:text-destructive disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && <span className="text-[0.6875rem] text-destructive">{error}</span>}
    </div>
  );
}
