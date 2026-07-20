import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { PendingVenueActions } from "@/components/admin/PendingVenueActions";
import type { Restaurant } from "@/lib/types/database";

export const metadata = { title: "Pending Venues" };
export const dynamic = "force-dynamic";

export default async function PendingVenuesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Access Denied
        </h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data: pending } = await db
    .from("restaurants")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const rows = (pending ?? []) as Restaurant[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            Pending Venues
          </h1>
          <p className="mt-1 text-text-muted">
            New venues awaiting a final check before they go live.
          </p>
        </div>
        <Link
          href="/admin/enrich"
          className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
        >
          AI Enrichment
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          Nothing in the queue. New venues added via enrichment appear here for
          review before publishing.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border-subtle bg-surface-0 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-bold text-text-primary">
                    {r.name}
                    {r.location_label && (
                      <span className="ml-2 text-sm font-normal text-brand-sienna-light">
                        {r.location_label}
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {[r.city, r.country].filter(Boolean).join(", ")} ·{" "}
                    {STYLE_LABELS[r.style as BbqStyle] ?? r.style} ·{" "}
                    {r.address || "no address"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                    {r.phone && <span>{r.phone}</span>}
                    {r.website && <span className="text-brand-gold">website</span>}
                    {r.instagram_url && <span>Instagram</span>}
                    {Array.isArray(r.instagram_posts) &&
                      r.instagram_posts.length > 0 && (
                        <span>{r.instagram_posts.length} IG posts</span>
                      )}
                    {Array.isArray(r.enrichment_sources) &&
                      r.enrichment_sources.length > 0 && (
                        <span>· {r.enrichment_sources.length} sources on file</span>
                      )}
                  </div>
                </div>
                <PendingVenueActions restaurantId={r.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
