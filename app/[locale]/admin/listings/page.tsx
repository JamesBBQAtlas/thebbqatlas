import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/constants/categories";
import { freshness } from "@/lib/admin/freshness";
import { VenueHub } from "@/components/admin/VenueHub";
import { toHubVenue, STYLE_OPTIONS } from "@/lib/admin/hub";
import { summarizeCosts, getAiUsageReport } from "@/lib/admin/cost-summary";
import { fmtUsd } from "@/lib/constants/enrichment-cost";
import { isRealPhoto } from "@/lib/constants/hero";
import type { Restaurant, MapItemCategory } from "@/lib/types/database";

export const metadata = { title: "Listings" };
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

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "green" | "amber" | "red" | "gold";
}) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "red"
          ? "text-red-400"
          : tone === "gold"
            ? "text-brand-gold"
            : "text-text-primary";
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
      <div className={`font-heading text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-sm text-text-secondary">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function Bar({
  label,
  value,
  total,
  health = false,
}: {
  label: string;
  value: number;
  total: number;
  health?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const color = !health
    ? "#D4AF37"
    : pct >= 70
      ? "#34D399"
      : pct >= 40
        ? "#FBBF24"
        : "#F87171";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">
          {value} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-heading text-lg font-bold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const initialFilters = {
    fresh: one("fresh"),
    attn: one("attn") === "1",
    closed: one("closed") === "1",
    flagship: one("flagship") === "1",
  };
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
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [{ data: venueData }, checkIns, saves, mediaApproved, mediaPending, reviewsApproved, reviewsPending, guides, news, bookmarks] =
    await Promise.all([
      db
        .from("restaurants")
        .select("*")
        // Stable order so a status change (enrich/approve/roster) never re-sorts a
        // row under the operator — the hub groups by chain but keeps this order.
        // (select("*") also picks up flagship_unset / chain_candidate, which the
        // old explicit column list omitted — that's why "Build roster" never showed.)
        .order("created_at", { ascending: true })
        .limit(2000),
      count(db, "check_ins"),
      count(db, "saved_spots"),
      count(db, "media", { col: "status", val: "approved" }),
      count(db, "media", { col: "status", val: "pending" }),
      count(db, "reviews", { col: "status", val: "approved" }),
      count(db, "reviews", { col: "status", val: "pending" }),
      count(db, "guides"),
      count(db, "news"),
      count(db, "bookmarks"),
    ]);

  const all = (venueData ?? []) as Restaurant[];
  const approved = all.filter((r) => r.status === "approved");
  const A = approved.length || 1; // avoid /0

  // Freshness distribution
  const freshCount = { green: 0, amber: 0, red: 0 };
  for (const r of all) freshCount[freshness(r.enriched_at).tone]++;

  // Completeness (of approved)
  const hasSocial = (r: Restaurant) =>
    r.instagram_url || r.x_url || r.facebook_url || r.tiktok_url || r.youtube_url;
  const hasGeo = (r: Restaurant) =>
    Number.isFinite(r.lat) && Number.isFinite(r.lng) && !(r.lat === 0 && r.lng === 0);
  const comp = {
    website: approved.filter((r) => r.website).length,
    phone: approved.filter((r) => r.phone).length,
    hours: approved.filter((r) => r.hours).length,
    socials: approved.filter(hasSocial).length,
    // "Real photo" — the SAME definition the Venue Hub uses (hero_source is a
    // real source), so the two metrics can't disagree.
    photos: approved.filter(isRealPhoto).length,
    geo: approved.filter(hasGeo).length,
  };

  // Coverage
  const countries = new Set(all.map((r) => r.country).filter(Boolean));
  const cities = new Set(all.map((r) => r.city).filter(Boolean));
  // Distinct multi-location brands, each keyed by its parent identity so a
  // chain is counted once however it's modelled: a brands-table brand (brand_id),
  // a chain parent flagged is_chain, or a sibling pointing at its parent.
  const brands = new Set<string>();
  for (const r of all) {
    if (r.brand_id) brands.add(`brand:${r.brand_id}`);
    if (r.chain_parent_id) brands.add(`chain:${r.chain_parent_id}`);
    else if ((r.dossier as { is_chain?: boolean } | null)?.is_chain) brands.add(`chain:${r.id}`);
  }

  // Category mix
  const catCounts = new Map<string, number>();
  for (const r of all) {
    const c = r.category ?? "restaurant";
    catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }

  // Top countries / styles
  const tally = (key: (r: Restaurant) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of all) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const topCountries = tally((r) => r.country).slice(0, 8);
  const topStyles = tally((r) => r.style).slice(0, 8);

  // Growth
  const now = Date.now();
  const since = (days: number) =>
    all.filter((r) => r.created_at && now - new Date(r.created_at).getTime() <= days * 86_400_000)
      .length;

  const hubVenues = all.map(toHubVenue);

  // Spend by provider — read EXACT figures from the append-only AI usage ledger
  // (no scaling). Falls back to the legacy per-venue derivation only if the
  // ledger isn't available yet (older env).
  const usage = await getAiUsageReport(db);
  const cost = usage
    ? null
    : summarizeCosts(
        all.map((r) => ({
          enrichment_cost: r.enrichment_cost ?? null,
          enrichment_cost_breakdown:
            (r.enrichment_cost_breakdown as Record<string, unknown> | null) ?? null,
          enriched_at: r.enriched_at ?? null,
        })),
        new Date().toISOString().slice(0, 10)
      );

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">Listings &amp; Insights</h1>
      <p className="mt-1 text-text-muted">
        The whole catalogue at a glance — then search, sort, filter and enrich any venue below.
      </p>

      {/* Headline */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Venues live" value={approved.length} tone="gold" sub={`${all.length - approved.length} pending`} />
        <Stat label="Countries" value={countries.size} />
        <Stat label="Cities" value={cities.size} />
        <Stat label="Brands" value={brands.size} />
        <Stat label="Added (30d)" value={since(30)} sub={`${since(7)} this week`} />
        <Stat label="Check-ins" value={checkIns} />
      </div>

      {/* Enrichment health */}
      <Section title="Enrichment health">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Fresh (≤1mo)" value={freshCount.green} tone="green" sub={`${Math.round((freshCount.green / (all.length || 1)) * 100)}%`} />
          <Stat label="Ageing (1–3mo)" value={freshCount.amber} tone="amber" sub={`${Math.round((freshCount.amber / (all.length || 1)) * 100)}%`} />
          <Stat label="Stale / never" value={freshCount.red} tone="red" sub={`${Math.round((freshCount.red / (all.length || 1)) * 100)}%`} />
        </div>
      </Section>

      {/* Completeness */}
      <Section title="Data completeness (of live venues)">
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-xl border border-border-subtle bg-surface-0 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Bar label="Website" value={comp.website} total={A} health />
          <Bar label="Phone" value={comp.phone} total={A} health />
          <Bar label="Opening hours" value={comp.hours} total={A} health />
          <Bar label="Socials" value={comp.socials} total={A} health />
          <Bar label="Real photo" value={comp.photos} total={A} health />
          <Bar label="On the map (geo)" value={comp.geo} total={A} health />
        </div>
      </Section>

      {/* Reach */}
      <Section title="Reach">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
              Top countries
            </h3>
            <div className="space-y-2.5">
              {topCountries.map(([c, n]) => (
                <Bar key={c} label={c} value={n} total={all.length} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
              Top styles
            </h3>
            <div className="space-y-2.5">
              {topStyles.map(([s, n]) => (
                <Bar key={s} label={STYLE_LABELS[s as BbqStyle] ?? s} value={n} total={all.length} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Item types */}
      <Section title="Item types">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {CATEGORY_ORDER.map((c) => (
            <Stat key={c} label={CATEGORY_LABELS[c as MapItemCategory]} value={catCounts.get(c) ?? 0} />
          ))}
        </div>
      </Section>

      {/* Community & content */}
      <Section title="Community &amp; content">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Saves" value={saves} />
          <Stat label="Photos live" value={mediaApproved} sub={`${mediaPending} pending`} tone={mediaPending ? "amber" : "default"} />
          <Stat label="Reviews" value={reviewsApproved} sub={`${reviewsPending} pending`} tone={reviewsPending ? "amber" : "default"} />
          <Stat label="Guides" value={guides} />
          <Stat label="News" value={news} />
          <Stat label="Bookmarks" value={bookmarks} />
        </div>
      </Section>

      {/* Spend by provider — exact, from the append-only AI usage ledger */}
      <Section title="Spend by provider">
        {usage ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Anthropic (Claude)" value={fmtUsd(usage.allTime.anthropic)} sub={`${fmtUsd(usage.today.anthropic)} today · ${fmtUsd(usage.week.anthropic)} 7d`} tone="gold" />
              <Stat label="xAI (Grok + search)" value={fmtUsd(usage.allTime.xai)} sub={`${fmtUsd(usage.today.xai)} today · ${fmtUsd(usage.week.xai)} 7d`} tone="gold" />
              <Stat label="Total" value={fmtUsd(usage.allTime.total)} sub={`${fmtUsd(usage.today.total)} today · ${fmtUsd(usage.week.total)} 7d`} />
              <Stat label="Venues enriched" value={usage.venuesEnriched} />
              <Stat label="Searches · AI calls" value={`${usage.allTime.searches} · ${usage.allTime.calls}`} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">By model</h3>
                <div className="space-y-2 text-sm">
                  {usage.byModel.length === 0 && <p className="text-text-muted">No calls logged yet.</p>}
                  {usage.byModel.map((m) => (
                    <div key={`${m.provider}:${m.model}`} className="flex items-baseline justify-between gap-3">
                      <span className="text-text-secondary">
                        {m.model} <span className="text-text-muted">· {m.provider}</span>
                      </span>
                      <span className="whitespace-nowrap text-text-primary">
                        {fmtUsd(m.cost)} <span className="text-text-muted">· {m.calls} call{m.calls === 1 ? "" : "s"}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">By task</h3>
                <div className="space-y-2 text-sm">
                  {usage.byTask.length === 0 && <p className="text-text-muted">No calls logged yet.</p>}
                  {usage.byTask.map((tk) => (
                    <div key={tk.task} className="flex items-baseline justify-between gap-3">
                      <span className="text-text-secondary">{tk.task} <span className="text-text-muted">· {tk.calls}×</span></span>
                      <span className="whitespace-nowrap text-text-primary">
                        {fmtUsd(tk.cost)}
                        <span className="text-text-muted"> · A {fmtUsd(tk.anthropic)} / x {fmtUsd(tk.xai)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Exact — summed from the per-call AI usage ledger (provider · model · task, all-time / today / 7-day). Not scaled or estimated.
            </p>
          </>
        ) : cost ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Anthropic (Claude)" value={fmtUsd(cost.anthropicAllTime)} sub={`${fmtUsd(cost.anthropicToday)} today`} tone="gold" />
              <Stat label="xAI (Grok + search)" value={fmtUsd(cost.xaiAllTime)} sub={`${fmtUsd(cost.xaiToday)} today`} tone="gold" />
              <Stat label="Total" value={fmtUsd(cost.totalAllTime)} sub={`${fmtUsd(cost.totalToday)} today`} />
              <Stat label="Venues enriched" value={cost.venuesEnriched} />
              <Stat label="Total searches" value={cost.totalSearches} />
            </div>
            <p className="mt-3 text-xs text-text-muted">{cost.basis}</p>
          </>
        ) : null}
      </Section>

      {/* Control hub — the same surface for existing venues and new imports */}
      <Section title="Venue control hub">
        <VenueHub venues={hubVenues} styleOptions={STYLE_OPTIONS} initialFilters={initialFilters} />
      </Section>
    </div>
  );
}
