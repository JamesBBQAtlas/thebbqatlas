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
    | "save";
  restaurant_id?: string | null;
  partner?: string;
  target_url?: string;
  page_path?: string;
  subtag?: string;
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
