"use client";

import { useEffect } from "react";

/**
 * Fires a fire-and-forget search-impression beacon for the venues shown in a
 * listing (Fable C-1). Works on ISR-cached hubs because it runs client-side per
 * session; the server dedupes per session/day and drops bots. Renders nothing.
 */
export function SearchImpressionBeacon({
  page,
  items,
}: {
  page: string;
  items: { restaurantId: string; position: number }[];
}) {
  const ids = items.map((i) => i.restaurantId).join(",");
  useEffect(() => {
    if (!items.length) return;
    const payload = JSON.stringify({ page, items });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/search-impression",
          new Blob([payload], { type: "application/json" })
        );
      } else {
        fetch("/api/search-impression", {
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* telemetry never breaks the page */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ids]);

  return null;
}
