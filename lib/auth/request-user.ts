import { createClient as createSbClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Phase 8d — resolve the request's user from EITHER a cookie session (web) OR an
 * `Authorization: Bearer <supabase access token>` header (native / API clients),
 * so the write path isn't cookie-only.
 *
 * Returns the authenticated user plus a `db` client scoped to that user — the
 * cookie client for web, or a token-authenticated anon client for Bearer — so
 * writes still go through RLS as that user. null when unauthenticated.
 */
export async function getRequestUser(
  request: Request
): Promise<{ user: User; userId: string; db: SupabaseClient } | null> {
  // 1) Cookie session (web).
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (user) return { user, userId: user.id, db: cookieClient as unknown as SupabaseClient };

  // 2) Bearer token (native / API). The token-scoped client applies RLS as the
  //    token's user, exactly like the cookie client does for web.
  const authz = request.headers.get("authorization") ?? "";
  if (authz.startsWith("Bearer ")) {
    const token = authz.slice(7).trim();
    if (token) {
      const scoped = createSbClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const { data } = await scoped.auth.getUser();
      if (data.user) return { user: data.user, userId: data.user.id, db: scoped };
    }
  }
  return null;
}
