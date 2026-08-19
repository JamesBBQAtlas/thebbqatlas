import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { SuggestionActions } from "@/components/admin/SuggestionActions";

export const metadata = { title: "Owner Edits" };
export const dynamic = "force-dynamic";

/**
 * Owner accuracy edits awaiting review (Build Prompt 2b). Each is a pending
 * `suggestions` row (kind='owner_edit') proposed by a venue's approved owner —
 * NEVER applied live until an admin approves here (reusing the whitelisted
 * suggestions apply). Approve = it goes live + is audit-logged; Dismiss = rejected.
 */

interface OwnerEditRow {
  id: string;
  restaurant_id: string | null;
  title: string | null;
  summary: string | null;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
}

function shortVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

export default async function OwnerEditsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data } = await db
    .from("suggestions")
    .select("id, restaurant_id, title, summary, current, proposed, created_by, created_at, restaurants(name, slug)")
    .eq("kind", "owner_edit")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = (data ?? []) as unknown as OwnerEditRow[];

  // Resolve proposer names.
  const proposerIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (proposerIds.length) {
    const { data: pf } = await db.from("profiles").select("id, display_name, username").in("id", proposerIds);
    for (const p of pf ?? []) nameById.set(p.id, p.display_name ?? p.username ?? "owner");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">Owner Edits</h1>
      <p className="mb-8 text-text-muted">
        Accuracy edits proposed by venue owners. Nothing here is live — approve to publish (protected
        from re-enrichment), or dismiss.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No owner edits awaiting review.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const proposed = r.proposed ?? {};
            const current = r.current ?? {};
            return (
              <div key={r.id} className="rounded-xl border border-border-subtle bg-surface-0 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {r.restaurants?.slug ? (
                      <Link href={`/restaurants/${r.restaurants.slug}`} className="font-semibold text-text-primary hover:text-brand-gold">
                        {r.restaurants?.name ?? "Venue"}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-primary">{r.restaurants?.name ?? "Venue"}</span>
                    )}
                    <p className="mt-0.5 text-xs text-text-muted">
                      proposed by {nameById.get(r.created_by ?? "") ?? "owner"} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <SuggestionActions suggestionId={r.id} />
                </div>
                <ul className="mt-3 space-y-1 text-xs">
                  {Object.keys(proposed).map((k) => (
                    <li key={k} className="text-text-secondary">
                      <span className="font-semibold text-text-primary">{k.replace(/_/g, " ")}</span>:{" "}
                      <span className="text-text-muted line-through">{shortVal((current as Record<string, unknown>)[k])}</span>{" "}
                      → <span className="text-brand-gold">{shortVal((proposed as Record<string, unknown>)[k])}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
