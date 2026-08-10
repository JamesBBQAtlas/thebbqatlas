/**
 * Pure link-health helpers (no server-only / no network) so they're unit-testable.
 * Part C — the key rule: a transient failure is NEVER a false "broken".
 */
export type LinkStatus = "ok" | "broken" | "redirected" | "unchecked";

/**
 * Classify a generic HTTP outcome. 2xx/3xx (followed) → ok; a genuine 4xx →
 * broken; but 429 (rate-limited), any 5xx, and a null (timeout/network error) →
 * `unchecked` so the item is retried, not falsely flagged dead.
 */
export function classifyHttp(status: number | null): LinkStatus {
  if (status === null) return "unchecked"; // network error / timeout → retry
  if (status === 429) return "unchecked"; // rate-limited → transient, retry
  if (status >= 200 && status < 400) return "ok";
  if (status >= 400 && status < 500) return "broken";
  return "unchecked"; // 5xx — server-side, transient; retry
}

export interface LinkHealthResult {
  status: LinkStatus;
  code: number | null;
  note: string | null;
}

/**
 * The outcome of a YouTube CHANNEL check, ready to classify. A channel can't be
 * validated by oEmbed (oEmbed only supports videos → a live channel 404s), so we
 * ask the YouTube Data API `channels.list` instead:
 *   • `items`     — the API answered 200; `count` is how many channels matched
 *                   (≥1 ⇒ live, 0 ⇒ genuinely gone);
 *   • `api_error` — the API answered non-2xx (bad key, quota, 5xx) → NOT broken,
 *                   just uncheckable right now;
 *   • `network`   — timeout / network error → NOT broken, retry;
 *   • `page`      — no API key: we fell back to fetching the channel page, and
 *                   `dead` is whether the "channel does not exist / terminated"
 *                   copy was present.
 * The cardinal rule (Part C): a transient/uncheckable outcome is NEVER `broken`.
 */
export type ChannelOutcome =
  | { kind: "items"; count: number }
  | { kind: "api_error"; code: number }
  | { kind: "network" }
  | { kind: "page"; status: number | null; dead: boolean };

export function classifyChannelHealth(o: ChannelOutcome): LinkHealthResult {
  switch (o.kind) {
    case "network":
      return { status: "unchecked", code: null, note: "network error — will retry" };
    case "api_error":
      // A bad handle to the API is ambiguous (could be a formatting issue, not a
      // dead channel), and quota/5xx are transient — never flag broken on these.
      return { status: "unchecked", code: o.code, note: `YouTube API ${o.code} — couldn't verify, will retry` };
    case "items":
      return o.count >= 1
        ? { status: "ok", code: 200, note: null }
        : { status: "broken", code: 200, note: "channel not found" };
    case "page":
      if (o.dead) return { status: "broken", code: o.status, note: "channel unavailable" };
      return { status: classifyHttp(o.status), code: o.status, note: null };
  }
}
