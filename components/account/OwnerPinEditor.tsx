"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, MapPin, AlertTriangle } from "lucide-react";
import { PinMap } from "@/components/admin/PinMap";

/**
 * Owner map-pin correction (Build Prompt 2 addendum). A draggable marker starting at
 * the venue's current pin; the owner positions it and submits. It's a PROPOSAL — it
 * lands in moderation, never live, and only goes live (locked) once an admin approves.
 */
export function OwnerPinEditor({
  venue,
  hasPending,
}: {
  venue: { id: string; name: string; lat: number | null; lng: number | null };
  hasPending: boolean;
}) {
  const router = useRouter();
  // Sensible default centre when the venue has no pin yet (roughly the US, where most
  // venues are) — the owner drags it to the real spot.
  const startLat = typeof venue.lat === "number" && venue.lat !== 0 ? venue.lat : 39.5;
  const startLng = typeof venue.lng === "number" && venue.lng !== 0 ? venue.lng : -98.35;
  const [pos, setPos] = useState<{ lat: number; lng: number }>({ lat: startLat, lng: startLng });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; err?: string; far?: boolean } | null>(null);

  const moved = venue.lat != null && venue.lng != null && (pos.lat !== venue.lat || pos.lng !== venue.lng);

  async function submit() {
    setBusy(true);
    setResult(null);
    let res: Response;
    try {
      res = await fetch("/api/owner/venues/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: venue.id, lat: pos.lat, lng: pos.lng }),
      });
    } catch {
      setBusy(false);
      setResult({ err: "Network error — try again." });
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setResult({ err: data.error ?? "Couldn't submit — try again." });
      return;
    }
    setResult({
      ok: `Pin submitted for review${typeof data.distanceKm === "number" ? ` (${data.distanceKm} km from the current spot)` : ""}. It'll update once approved.`,
      far: Boolean(data.far),
    });
    router.refresh();
  }

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary">
          <MapPin className="h-4 w-4" /> Set your exact location
        </span>
        {hasPending && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            <AlertTriangle className="h-3 w-3" /> pin awaiting review
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-text-muted">Drag the marker (or tap the map) to the exact spot, then submit. Reviewed before it goes live.</p>
      <PinMap lat={pos.lat} lng={pos.lng} onChange={(lat, lng) => setPos({ lat, lng })} className="h-64 w-full overflow-hidden rounded-lg" />

      {result?.ok && (
        <p className={`mt-3 flex items-center gap-1 text-sm ${result.far ? "text-amber-400" : "text-emerald-400"}`}>
          <Check className="h-4 w-4" />{result.ok}
        </p>
      )}
      {result?.err && <p className="mt-3 text-sm text-destructive">{result.err}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !moved}
          title={!moved ? "Move the marker first" : ""}
          className="inline-flex items-center gap-1 rounded-md border border-brand-gold/50 bg-brand-gold/10 px-3 py-1.5 text-sm font-semibold text-brand-gold transition-colors hover:bg-brand-gold/20 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Submit pin for review
        </button>
      </div>
    </div>
  );
}
