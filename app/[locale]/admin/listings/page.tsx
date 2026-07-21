import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/constants/categories";
import { freshness } from "@/lib/admin/freshness";
import { ListingsTable, type ListingRow } from "@/components/admin/ListingsTable";
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

export default async function ListingsPage() {
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

  const [{ data: venueData }, checkIns, saves, mediaApproved, mediaPending, reviewsApproved, reviewsPending, guides, news, bookmarks, suggestionsPending] =
    await Promise.all([
      db
        .from("restaurants")
        .select(
          "id, name, slug, city, country, style, category, enriched_at, status, website, phone, hours, instagram_url, x_url, facebook_url, tiktok_url, youtube_url, instagram_posts, lat, lng, hero_image_url, created_at, brand_id"
        )
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
      count(db, "suggestions", { col: "status", val: "pending" }),
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
    photos: approved.filter((r) => (r.instagram_posts?.length ?? 0) > 0 || r.hero_image_url).length,
    geo: approved.filter(hasGeo).length,
  };

  // Coverage
  const countries = new Set(all.map((r) => r.country).filter(Boolean));
  const cities = new Set(all.map((r) => r.city).filter(Boolean));
  const brands = new Set(all.map((r) => r.brand_id).filter(Boolean));

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

  const rows: ListingRow[] = all.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    city: r.city,
    country: r.country,
    style: r.style,
    category: r.category ?? null,
    status: r.status,
    enriched_at: r.enriched_at ?? null,
    website: r.website,
    phone: r.phone ?? null,
    instagram_url: r.instagram_url ?? null,
    has_hours: Boolean(r.hours),
  }));

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
          <Bar label="Photos" value={comp.photos} total={A} health />
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
        {suggestionsPending > 0 && (
          <p className="mt-3 text-sm text-brand-gold">
            {suggestionsPending} self-healing suggestion{suggestionsPending === 1 ? "" : "s"} awaiting
            your review in Self-Healing.
          </p>
        )}
      </Section>

      {/* Interactive table */}
      <Section title="All listings">
        <ListingsTable rows={rows} />
      </Section>
    </div>
  );
}
