import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { OwnerRevokeButton } from "@/components/admin/OwnerRevokeButton";

export const metadata = { title: "Owners" };
export const dynamic = "force-dynamic";

interface ClaimRow {
  id: string;
  restaurant_id: string;
  user_id: string;
  role_requested: string | null;
  decided_at: string | null;
}

export default async function OwnersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  // Current owners = approved, not-yet-revoked claims.
  const { data: claimData } = await db
    .from("restaurant_claims")
    .select("id, restaurant_id, user_id, role_requested, decided_at")
    .eq("status", "approved")
    .order("decided_at", { ascending: false });
  const claims = (claimData ?? []) as ClaimRow[];

  // Look up venue + claimant identity in bulk (no embed dependency).
  const venueIds = [...new Set(claims.map((c) => c.restaurant_id).filter(Boolean))];
  const userIds = [...new Set(claims.map((c) => c.user_id).filter(Boolean))];
  const [{ data: venues }, { data: profiles }] = await Promise.all([
    venueIds.length
      ? db.from("restaurants").select("id, name, slug, owner_id").in("id", venueIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string; owner_id: string | null }[] }),
    userIds.length
      ? db.from("profiles").select("id, username").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; username: string | null }[] }),
  ]);
  const venueById = new Map((venues ?? []).map((v) => [v.id, v]));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">Owners</h1>
      <p className="mb-8 text-text-muted">
        Venues with an approved owner. Revoking removes their edit rights immediately (their
        account is kept); it&apos;s recorded in the Change Log.
      </p>

      {claims.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No approved owners yet. Approve a claim in the Moderation Queue and it appears here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-[0.05em] text-text-muted">
                <th className="px-4 py-2.5 font-semibold">Venue</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Linked</th>
                <th className="px-4 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => {
                const v = venueById.get(c.restaurant_id);
                const owner = nameById.get(c.user_id) ?? c.user_id.slice(0, 8);
                const linked = v?.owner_id === c.user_id;
                return (
                  <tr key={c.id} className="border-b border-border-subtle/50 last:border-0">
                    <td className="px-4 py-2.5 text-text-primary">
                      {v ? (
                        <Link href={`/restaurants/${v.slug}`} className="hover:text-brand-gold hover:underline">
                          {v.name}
                        </Link>
                      ) : (
                        <span className="text-text-muted">{c.restaurant_id.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{owner}</td>
                    <td className="px-4 py-2.5 text-text-muted">{c.role_requested ?? "owner"}</td>
                    <td className="px-4 py-2.5">
                      {linked ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">owner_id set</span>
                      ) : (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">claim only</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end">
                        <OwnerRevokeButton claimId={c.id} ownerLabel={String(owner)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
