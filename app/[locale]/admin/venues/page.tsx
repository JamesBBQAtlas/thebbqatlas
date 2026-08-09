import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { VenueImportPanel } from "@/components/admin/VenueImportPanel";
import { FactsImportPanel } from "@/components/admin/FactsImportPanel";
import { VenueHub, type FlagshipSummary } from "@/components/admin/VenueHub";
import { toHubVenue, STYLE_OPTIONS } from "@/lib/admin/hub";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
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

  // Part 5 — attach admin provenance: the originating submission's PII (email/IP/
  // country/status/date) for member-submitted venues, plus last-updated actor.
  // This is an ADMIN-only surface, so PII is allowed here (never on public_venues).
  const subIds = [...new Set(rows.map((r) => r.first_submission_id).filter(Boolean))] as string[];
  const subById = new Map<string, Record<string, unknown>>();
  if (subIds.length) {
    const { data: subs } = await db
      .from("submissions")
      .select("id, contact_email, submitter_ip, submitter_country, moderation_status, created_at")
      .in("id", subIds);
    for (const s of (subs ?? []) as Record<string, unknown>[]) subById.set(s.id as string, s);
  }
  const hubVenues = rows.map((r) => {
    const sub = r.first_submission_id ? subById.get(r.first_submission_id) : null;
    return {
      ...toHubVenue(r),
      provenance: {
        source: r.first_submission_id ? ("member" as const) : ("bulk" as const),
        addedAt: r.first_submitted_at ?? r.created_at ?? null,
        updatedActor: r.updated_by_actor ?? null,
        updatedAt: r.updated_at ?? null,
        submission: sub
          ? {
              email: (sub.contact_email as string) ?? null,
              ip: (sub.submitter_ip as string) ?? null,
              country: (sub.submitter_country as string) ?? null,
              status: (sub.moderation_status as string) ?? null,
              submittedAt: (sub.created_at as string) ?? null,
            }
          : null,
      },
    };
  });

  // Resolve each chain child's FLAGSHIP — usually already approved and thus not
  // in this pending list. Fetch a published summary so the child's gate + badge +
  // popup work from Pending without leaving the screen.
  const parentIds = [...new Set(rows.map((r) => r.chain_parent_id).filter(Boolean))] as string[];
  let flagships: FlagshipSummary[] = [];
  if (parentIds.length) {
    const { data: fdata } = await db
      .from("restaurants")
      .select("id, name, slug, city, style, enriched_at, hook, description")
      .in("id", parentIds);
    flagships = ((fdata ?? []) as Record<string, unknown>[]).map((f) => ({
      id: f.id as string,
      name: (f.name as string) ?? "Flagship",
      slug: (f.slug as string) ?? "",
      city: (f.city as string) ?? null,
      styleLabel: STYLE_LABELS[(f.style as BbqStyle)] ?? "Other",
      enriched: f.enriched_at != null,
      hook: (f.hook as string) ?? null,
      description: (f.description as string) ?? null,
    }));
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
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
        <VenueHub venues={hubVenues} styleOptions={STYLE_OPTIONS} initialStatus="pending" flagships={flagships} />
      )}
    </div>
  );
}
