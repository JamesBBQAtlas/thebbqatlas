import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase-table-backed fixed-window rate limiter for cost-bearing server routes
 * (Vercel Firewall is the primary edge defense; this backstops the routes). No
 * paid KV service.
 *
 * Behaviour when the limiter is DISABLED (no service key — a config state, e.g.
 * local/build): always allow. When the limiter is ENABLED but ERRORS at runtime
 * (DB hiccup): we now `console.warn` so the failure is visible/alertable in the
 * logs (Fable M-4), and — for a truly cost-sensitive caller passing
 * `failClosed` — we DENY rather than wave the request through. Everything else
 * still fails open so a limiter blip can't take down legitimate user traffic.
 *
 * Returns true when the request is ALLOWED.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opts?: { failClosed?: boolean }
): Promise<boolean> {
  // No key = the limiter is intentionally off (config), not a failure — allow,
  // and never fail-closed here or we'd block every request in such an env.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  const onFailure = () => (opts?.failClosed ? false : true);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn(`[rate-limit] check failed for "${key}": ${error.message}`);
      return onFailure();
    }
    return data === true;
  } catch (e) {
    console.warn(
      `[rate-limit] check threw for "${key}": ${e instanceof Error ? e.message : "unknown"}`
    );
    return onFailure();
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
