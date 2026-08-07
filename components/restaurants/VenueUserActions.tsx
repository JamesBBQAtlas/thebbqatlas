"use client";

import { useCallback, useEffect, useState } from "react";
import { Store } from "lucide-react";
import { CheckInButton } from "@/components/restaurants/CheckInButton";
import { SaveShareActions } from "@/components/restaurants/SaveShareActions";
import type { CheckInVisibility } from "@/lib/types/database";

interface Props {
  restaurantId: string;
  restaurantName: string;
  permanentlyClosed: boolean;
  /** Server-rendered venue totals — used as the initial value until the live
   *  counts arrive (they'd otherwise freeze in the static ISR cache). */
  visited: number;
  saved: number;
}

interface MeState {
  authed: boolean;
  checkIn: { note: string | null; visibility: CheckInVisibility } | null;
  savedByUser: boolean;
  visited: number;
  saved: number;
}

/**
 * Client island for the venue sidebar's user-specific actions (Fable H-1) — so
 * the venue page can be static (no per-request cookie read). Fetches the live
 * visit/save COUNTS (public — they'd otherwise freeze in the ISR cache) plus the
 * signed-in user's check-in + saved state, and feeds them to the existing
 * CheckInButton / SaveShareActions. Those read their initial state from props
 * once, so we key them on the resolved state to remount the moment it lands, and
 * re-fetch after a check-in/save so the counts update in the same session.
 */
export function VenueUserActions({
  restaurantId,
  restaurantName,
  permanentlyClosed,
  visited,
  saved,
}: Props) {
  const [me, setMe] = useState<MeState>({
    authed: false,
    checkIn: null,
    savedByUser: false,
    visited,
    saved,
  });

  const load = useCallback(() => {
    let cancelled = false;
    fetch(`/api/venues/me?restaurantId=${encodeURIComponent(restaurantId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          authed?: boolean;
          checkIn?: MeState["checkIn"];
          saved?: boolean;
          metrics?: { visited: number; saved: number };
        } | null) => {
          if (cancelled || !d) return;
          setMe({
            authed: Boolean(d.authed),
            checkIn: d.checkIn ?? null,
            savedByUser: Boolean(d.saved),
            visited: d.metrics?.visited ?? visited,
            saved: d.metrics?.saved ?? saved,
          });
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // visited/saved are the initial fallback only — not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => load(), [load]);

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
          onChanged={load}
        />
      )}
      {!permanentlyClosed && (me.visited > 0 || me.saved > 0) && (
        <div className="flex items-center gap-4 border-t border-border-subtle pt-4 text-sm">
          {me.visited > 0 && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="font-heading text-lg font-bold text-brand-gold">
                {me.visited.toLocaleString()}
              </span>
              {me.visited === 1 ? "has been here" : "have been here"}
            </span>
          )}
          {me.saved > 0 && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="font-heading text-lg font-bold text-brand-gold">
                {me.saved.toLocaleString()}
              </span>
              saved
            </span>
          )}
        </div>
      )}
      <div className="border-t border-border-subtle pt-4">
        <SaveShareActions
          key={`ss-${me.savedByUser}`}
          restaurantId={restaurantId}
          name={restaurantName}
          initialSaved={me.savedByUser}
          onChanged={load}
        />
      </div>
    </div>
  );
}
