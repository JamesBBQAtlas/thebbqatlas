import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { VenueImportPanel } from "@/components/admin/VenueImportPanel";
import {
  PendingVenuesManager,
  type DraftVenue,
} from "@/components/admin/PendingVenuesManager";
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

  const drafts: DraftVenue[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city || null,
    country: r.country || null,
    instagram_handle: r.instagram_handle ?? null,
    hero_post_url: r.hero_post_url ?? null,
    enriched_at: r.enriched_at ?? null,
    needs_attention: Boolean(r.needs_attention),
    attention_reason: r.attention_reason ?? null,
    lat: r.lat,
    lng: r.lng,
    sourcesCount: Array.isArray(r.enrichment_sources)
      ? r.enrichment_sources.length
      : 0,
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            Pending Venues
          </h1>
          <p className="mt-1 text-text-muted">
            Seed → enrich → review → publish. Nothing goes live without your yes.
          </p>
        </div>
        <Link
          href="/admin/enrich"
          className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
        >
          Single-venue console
        </Link>
      </div>

      <div className="mb-8">
        <VenueImportPanel />
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          Nothing in the queue. Import a seed sheet above, or add venues via the
          console — they appear here as drafts for enrichment and review.
        </p>
      ) : (
        <PendingVenuesManager venues={drafts} />
      )}
    </div>
  );
}
