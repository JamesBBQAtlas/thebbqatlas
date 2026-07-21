import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRestaurants } from "@/lib/queries/restaurants";
import { getGuides } from "@/lib/queries/guides";
import { getNews } from "@/lib/queries/news";
import { groupByCountry, groupByCity } from "@/lib/seo/hubs";
import { BBQ_STYLES } from "@/lib/constants/styles";
import { RunSweepButton } from "@/components/admin/RunSweepButton";
import type { Restaurant } from "@/lib/types/database";

export const metadata = { title: "SEO Health" };
export const dynamic = "force-dynamic";

function hasSocial(r: Restaurant) {
  return Boolean(
    r.instagram_url || r.x_url || r.facebook_url || r.tiktok_url || r.youtube_url
  );
}

function Tile({
  label,
  value,
  total,
  tone = "default",
}: {
  label: string;
  value: number;
  total?: number;
  tone?: "default" | "warn" | "bad" | "good";
}) {
  const color =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-brand-sienna-light"
        : tone === "good"
          ? "text-brand-gold"
          : "text-text-primary";
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className={`font-heading text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
      {total !== undefined && total > 0 && (
        <div className="mt-0.5 text-xs text-text-muted">
          {Math.round((value / total) * 100)}% of {total}
        </div>
      )}
    </div>
  );
}

export default async function HealthPage() {
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

  const [venues, guides, news] = await Promise.all([
    getRestaurants(),
    getGuides(),
    getNews(),
  ]);
  const total = venues.length;

  const noGeo = venues.filter(
    (r) => !Number.isFinite(r.lat) || !Number.isFinite(r.lng) || (r.lat === 0 && r.lng === 0)
  );
  const thinDesc = venues.filter((r) => (r.description?.trim().length ?? 0) < 40);
  const noHero = venues.filter((r) => !r.hero_image_url);
  const noHours = venues.filter((r) => !r.hours);
  const noContact = venues.filter((r) => !r.phone && !r.website);
  const noSocial = venues.filter((r) => !hasSocial(r));
  const notPlaceable = venues.filter((r) => !r.city || !r.country);
  const closed = venues.filter((r) => r.permanently_closed);

  // Programmatic footprint
  const countries = groupByCountry(venues);
  let cityCount = 0;
  for (const c of countries.values()) cityCount += groupByCity(c.venues).size;
  const stylesLive = new Set(venues.map((r) => r.style)).size;

  const indexablePages =
    total +
    guides.length +
    news.length +
    BBQ_STYLES.length +
    countries.size +
    cityCount +
    8; // core static pages

  const IssueList = ({
    title,
    items,
    note,
  }: {
    title: string;
    items: Restaurant[];
    note: string;
  }) =>
    items.length === 0 ? null : (
      <section className="mt-8">
        <h3 className="mb-1 font-heading text-lg font-bold text-text-primary">
          {title} <span className="text-text-muted">({items.length})</span>
        </h3>
        <p className="mb-3 text-sm text-text-muted">{note}</p>
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 30).map((r) => (
            <Link
              key={r.id}
              href={`/restaurants/${r.slug}`}
              className="rounded-full border border-border-subtle bg-surface-0 px-3 py-1 text-xs text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              {r.name}
            </Link>
          ))}
          {items.length > 30 && (
            <span className="px-2 py-1 text-xs text-text-muted">+{items.length - 30} more</span>
          )}
        </div>
      </section>
    );

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">SEO Health</h1>
          <p className="mt-1 max-w-xl text-text-muted">
            Where the catalogue needs attention. Data gaps feed the self-healing
            queue — run a sweep to turn them into reviewable fixes.
          </p>
        </div>
        <RunSweepButton />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="Indexable pages" value={indexablePages} tone="good" />
        <Tile label="Style hubs" value={stylesLive} />
        <Tile label="Country hubs" value={countries.size} />
        <Tile label="City hubs" value={cityCount} />
      </div>

      <h2 className="mb-3 mt-10 font-heading text-xl font-bold text-text-primary">
        Data completeness
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Tile label="No map coordinates" value={noGeo.length} total={total} tone={noGeo.length ? "bad" : "good"} />
        <Tile label="Thin description" value={thinDesc.length} total={total} tone={thinDesc.length ? "warn" : "good"} />
        <Tile label="No hero photo" value={noHero.length} total={total} tone="warn" />
        <Tile label="No opening hours" value={noHours.length} total={total} tone="warn" />
        <Tile label="No phone or website" value={noContact.length} total={total} tone="warn" />
        <Tile label="No socials" value={noSocial.length} total={total} tone="warn" />
        <Tile label="Not placeable (no city/country)" value={notPlaceable.length} total={total} tone={notPlaceable.length ? "bad" : "good"} />
        <Tile label="Marked closed" value={closed.length} total={total} />
      </div>

      <IssueList
        title="Missing map coordinates"
        items={noGeo}
        note="These can't appear on the map or in local structured data — highest priority."
      />
      <IssueList
        title="Not placeable in a location hub"
        items={notPlaceable}
        note="Missing city or country, so they're excluded from /directory city & country pages."
      />
      <IssueList
        title="Thin descriptions"
        items={thinDesc}
        note="Under 40 characters — weak for search and AI. Self-healing can propose a fuller one."
      />

      <p className="mt-10 rounded-xl border border-border-subtle bg-surface-0 p-5 text-sm text-text-muted">
        Slugs auto-redirect to canonical URLs, the sitemap regenerates hourly with
        every hub, and structured data (Restaurant, ItemList, CollectionPage,
        Article) is emitted site-wide. To fix data gaps above, use{" "}
        <Link href="/admin/optimize" className="text-brand-gold hover:underline">
          Self-Healing
        </Link>{" "}
        (Grok proposes, you approve).
      </p>
    </div>
  );
}
