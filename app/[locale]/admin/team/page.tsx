import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamConsole, type AdminRow, type RoleLogRow } from "@/components/admin/TeamConsole";

export const metadata = { title: "Team & Roles" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [{ data: admins }, { data: log }] = await Promise.all([
    db.rpc("admin_list_admins"),
    db
      .from("role_change_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <TeamConsole
      admins={(admins ?? []) as AdminRow[]}
      log={(log ?? []) as RoleLogRow[]}
      currentUserId={user!.id}
      serviceRoleConfigured={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
    />
  );
}
