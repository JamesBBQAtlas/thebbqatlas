/**
 * Validate a post-auth redirect target. To avoid open redirects, it must be a
 * SAME-ORIGIN absolute path: a single leading slash, never "//" or "/\" (which
 * browsers treat as protocol-relative external URLs). Anything else falls back.
 */
export function safeNext(
  next: string | null | undefined,
  fallback = "/profile"
): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
