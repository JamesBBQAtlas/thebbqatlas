import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

async function count(
  db: SupabaseClient,
  table: string,
  filter?: { col: string; val: string }
): Promise<number> {
  try {
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.eq(filter.col, filter.val);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className="font-heading text-3xl font-bold text-text-primary">{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

export default async function AdminDashboard() {
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

  // Prefer the service-role client (bypasses RLS) for reliable counts.
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [
    restaurantsTotal,
    restaurantsApproved,
    subsPending,
    subsApproved,
    subsRejected,
    reviewsPending,
    reviewsApproved,
    photos,
    photosPending,
    users,
    clicksTotal,
    clicksAffiliate,
    checkInsTotal,
    savesTotal,
    mediaPending,
    suggestionsPending,
  ] = await Promise.all([
    count(db, "restaurants"),
    count(db, "restaurants", { col: "status", val: "approved" }),
    count(db, "submissions", { col: "moderation_status", val: "pending" }),
    count(db, "submissions", { col: "moderation_status", val: "approved" }),
    count(db, "submissions", { col: "moderation_status", val: "rejected" }),
    count(db, "reviews", { col: "status", val: "pending" }),
    count(db, "reviews", { col: "status", val: "approved" }),
    count(db, "review_photos"),
    count(db, "review_photos", { col: "status", val: "pending" }),
    count(db, "profiles"),
    count(db, "click_events"),
    count(db, "click_events", { col: "event_type", val: "affiliate" }),
    count(db, "check_ins"),
    count(db, "saved_spots"),
    count(db, "media", { col: "status", val: "pending" }),
    count(db, "suggestions", { col: "status", val: "pending" }),
  ]);

  const pendingTotal = subsPending + reviewsPending + photosPending;

  // Corrections/closures are submissions with a non-'new_venue' type.
  let correctionsPending = 0;
  try {
    const { count: c } = await db
      .from("submissions")
      .select("*", { count: "exact", head: true })
      .eq("moderation_status", "pending")
      .neq("submission_type", "new_venue");
    correctionsPending = c ?? 0;
  } catch {
    /* column may not exist in older envs */
  }
  const newVenuePending = Math.max(0, subsPending - correctionsPending);

  // Basic per-restaurant clicks (aggregated in-app; fine at launch volume).
  let topClicks: { name: string; slug: string; clicks: number }[] = [];
  try {
    const [{ data: events }, { data: rests }] = await Promise.all([
      db.from("click_events").select("restaurant_id").limit(5000),
      db.from("restaurants").select("id, name, slug"),
    ]);
    if (events && rests) {
      const nameById = new Map(rests.map((r) => [r.id, r]));
      const tally = new Map<string, number>();
      for (const e of events) {
        if (e.restaurant_id) tally.set(e.restaurant_id, (tally.get(e.restaurant_id) ?? 0) + 1);
      }
      topClicks = [...tally.entries()]
        .map(([id, clicks]) => {
          const r = nameById.get(id);
          return { name: r?.name ?? "Unknown", slug: r?.slug ?? "", clicks };
        })
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);
    }
  } catch {
    /* leave empty */
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            Admin Overview
          </h1>
          <p className="mt-1 text-text-muted">Key numbers across the Atlas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/venues"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Pending Venues
          </Link>
          <Link
            href="/admin/media"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Media
            {mediaPending > 0 && (
              <span className="ml-2 rounded-full bg-brand-orange px-2 py-0.5 text-xs text-white">
                {mediaPending}
              </span>
            )}
          </Link>
          <Link
            href="/admin/optimize"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Self-Healing
            {suggestionsPending > 0 && (
              <span className="ml-2 rounded-full bg-brand-orange px-2 py-0.5 text-xs text-white">
                {suggestionsPending}
              </span>
            )}
          </Link>
          <Link
            href="/admin/health"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            SEO Health
          </Link>
          <Link
            href="/admin/audit"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Change Log
          </Link>
          <Link
            href="/admin/email"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Email Log
          </Link>
          <Link
            href="/admin/listings"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Listings
          </Link>
          <Link
            href="/admin/enrich"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            AI Enrichment
          </Link>
          <Link
            href="/admin/moderation"
            className="rounded-md border-[1.5px] border-brand-gold px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-brand-gold transition-colors hover:bg-brand-gold hover:text-text-inverse"
          >
            Moderation Queue
            {pendingTotal > 0 && (
              <span className="ml-2 rounded-full bg-brand-orange px-2 py-0.5 text-xs text-white">
                {pendingTotal}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Restaurants" value={restaurantsTotal} hint={`${restaurantsApproved} approved`} />
        <Stat label="Submissions pending" value={newVenuePending} hint={`${subsApproved} approved · ${subsRejected} rejected`} />
        <Stat label="Corrections pending" value={correctionsPending} hint="edits & closures" />
        <Stat label="Reviews pending" value={reviewsPending} hint={`${reviewsApproved} approved`} />
        <Stat label="Photos pending" value={photosPending} hint={`${photos} total`} />
        <Stat label="Videos" value="—" hint="uploads phase" />
        <Stat label="Users" value={users} />
        <Stat label="Check-ins" value={checkInsTotal} hint="'I've been here' visits" />
        <Stat label="Saves" value={savesTotal} hint="saved-spot bookmarks" />
        <Stat label="Clicks (all)" value={clicksTotal} />
        <Stat label="Affiliate clicks" value={clicksAffiliate} />
      </div>

      <section className="mt-12">
        <h2 className="mb-4 font-heading text-xl font-bold text-text-primary">
          Most-clicked restaurants
        </h2>
        {topClicks.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-text-muted">
            No click data yet — this fills in as visitors interact with listings
            and affiliate links.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-subtle">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-1 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Restaurant</th>
                  <th className="px-4 py-3 text-right font-semibold">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {topClicks.map((r) => (
                  <tr key={r.slug} className="border-t border-border-subtle bg-surface-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/restaurants/${r.slug}`}
                        className="text-text-primary hover:text-brand-gold"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-gold">
                      {r.clicks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-text-muted">
        Lightweight overview. The full revenue/attribution dashboard is
        post-launch; per-page affiliate subtags and click capture are already
        recording from now.
      </p>
    </div>
  );
}
