import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase-table-backed fixed-window rate limiter for cost-bearing server routes
 * (Vercel Firewall is the primary edge defense; this backstops the routes). No
 * paid KV service. Fails OPEN — if the limiter itself can't run (no service key,
 * DB hiccup) we allow the request rather than hard-blocking legitimate traffic.
 *
 * Returns true when the request is ALLOWED.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
