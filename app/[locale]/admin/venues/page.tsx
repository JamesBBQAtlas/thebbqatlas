import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { VenueImportPanel } from "@/components/admin/VenueImportPanel";
import { FactsImportPanel } from "@/components/admin/FactsImportPanel";
import { VenueHub } from "@/components/admin/VenueHub";
import { toHubVenue, STYLE_OPTIONS } from "@/lib/admin/hub";
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
  const hubVenues = rows.map(toHubVenue);

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

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <VenueImportPanel />
        <FactsImportPanel />
      </div>

      {hubVenues.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          Nothing in the queue. Import a seed sheet above, or add venues via the
          console — they appear here as drafts for enrichment and review.
        </p>
      ) : (
        <VenueHub venues={hubVenues} styleOptions={STYLE_OPTIONS} initialStatus="pending" />
      )}
    </div>
  );
}
