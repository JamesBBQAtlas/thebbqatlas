"use client";

import { useEffect } from "react";

/**
 * Fires a fire-and-forget venue-view beacon on mount (Fable H-1) so the venue
 * page can be static while views are still recorded server-side (session hash +
 * bot filter computed from the request headers in /api/venue-view). Renders
 * nothing.
 */
export function VenueViewBeacon({ restaurantId }: { restaurantId: string }) {
  useEffect(() => {
    const payload = JSON.stringify({ restaurantId });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/venue-view",
          new Blob([payload], { type: "application/json" })
        );
      } else {
        fetch("/api/venue-view", {
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* telemetry must never break the page */
    }
  }, [restaurantId]);

  return null;
}
