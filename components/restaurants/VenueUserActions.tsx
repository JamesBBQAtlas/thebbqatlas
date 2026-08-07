"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { CheckInButton } from "@/components/restaurants/CheckInButton";
import { SaveShareActions } from "@/components/restaurants/SaveShareActions";
import type { CheckInVisibility } from "@/lib/types/database";

interface Props {
  restaurantId: string;
  restaurantName: string;
  permanentlyClosed: boolean;
  /** Venue totals (not user-specific) — rendered immediately. */
  visited: number;
  saved: number;
}

interface MeState {
  authed: boolean;
  checkIn: { note: string | null; visibility: CheckInVisibility } | null;
  saved: boolean;
}

/**
 * Client island for the venue sidebar's user-specific actions (Fable H-1) — so
 * the venue page can be static (no per-request cookie read). Fetches the signed-in
 * user's check-in + saved state after hydration and feeds it to the existing
 * CheckInButton / SaveShareActions. Those components read their initial state
 * from props once (via useState), so we key them on the resolved state to remount
 * them the moment it lands — a logged-out visitor sees the correct default with no
 * flash; a logged-in visitor's state fills in a beat later.
 */
export function VenueUserActions({
  restaurantId,
  restaurantName,
  permanentlyClosed,
  visited,
  saved,
}: Props) {
  const [me, setMe] = useState<MeState>({ authed: false, checkIn: null, saved: false });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/venues/me?restaurantId=${encodeURIComponent(restaurantId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeState | null) => {
        if (cancelled || !d) return;
        setMe({ authed: Boolean(d.authed), checkIn: d.checkIn ?? null, saved: Boolean(d.saved) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return (
    <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-0 p-6">
      {permanentlyClosed ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <Store className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This venue has <strong>permanently closed</strong>.
          </span>
        </div>
      ) : (
        <CheckInButton
          key={`ci-${me.authed}-${me.checkIn ? "in" : "out"}`}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          isAuthed={me.authed}
          initial={me.checkIn}
        />
      )}
      {!permanentlyClosed && (visited > 0 || saved > 0) && (
        <div className="flex items-center gap-4 border-t border-border-subtle pt-4 text-sm">
          {visited > 0 && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="font-heading text-lg font-bold text-brand-gold">
                {visited.toLocaleString()}
              </span>
              {visited === 1 ? "has been here" : "have been here"}
            </span>
          )}
          {saved > 0 && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="font-heading text-lg font-bold text-brand-gold">
                {saved.toLocaleString()}
              </span>
              saved
            </span>
          )}
        </div>
      )}
      <div className="border-t border-border-subtle pt-4">
        <SaveShareActions
          key={`ss-${me.saved}`}
          restaurantId={restaurantId}
          name={restaurantName}
          initialSaved={me.saved}
        />
      </div>
    </div>
  );
}
