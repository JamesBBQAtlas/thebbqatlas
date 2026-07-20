import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminContext {
  userId: string;
  /** Service-role client when available (bypasses RLS), else the user client. */
  db: SupabaseClient;
}

/**
 * Resolve the current request's admin context, or null if the caller is not a
 * signed-in admin. Use in admin-only API routes:
 *   const ctx = await requireAdmin();
 *   if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return null;

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  return { userId: user.id, db };
}
