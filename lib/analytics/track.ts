/**
 * Client-side click capture. Uses sendBeacon so the event survives the
 * navigation that an outbound-link click triggers. First-party, no cookies.
 */
export interface ClickEventPayload {
  event_type:
    | "affiliate"
    | "website"
    | "phone"
    | "email"
    | "instagram"
    | "map"
    | "share"
    | "save"
    | "media";
  restaurant_id?: string | null;
  media_pick_id?: string | null;
  partner?: string;
  target_url?: string;
  page_path?: string;
  subtag?: string;
}

/** Convenience: log a Watch/Read/Listen outbound click keyed to its pick. */
export function logMediaClick(mediaPickId: string, subtag: string, targetUrl?: string): void {
  logClick({
    event_type: "media",
    media_pick_id: mediaPickId,
    subtag,
    target_url: targetUrl,
  });
}

export function logClick(ev: ClickEventPayload): void {
  try {
    const payload = JSON.stringify({
      ...ev,
      page_path:
        ev.page_path ??
        (typeof location !== "undefined" ? location.pathname : undefined),
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([payload], { type: "application/json" })
      );
    } else {
      fetch("/api/track", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* never let telemetry break a click */
  }
}
