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
