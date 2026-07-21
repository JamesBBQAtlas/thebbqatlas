import { Link } from "@/i18n/navigation";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { getRestaurants } from "@/lib/queries/restaurants";
import { DirectoryFilters } from "@/components/restaurants/DirectoryFilters";
import { groupByCountry } from "@/lib/seo/hubs";
import { FlagIcon } from "@/components/ui/FlagIcon";

interface DirectoryPageProps {
  searchParams: { style?: string; price?: string; q?: string };
}

export const metadata = { title: "Directory" };

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const all = await getRestaurants();

  // Country hubs for browse (from the full catalogue, before filtering).
  const countries = [...groupByCountry(all).values()].sort(
    (a, b) => b.venues.length - a.venues.length
  );

  let restaurants = all;
  if (searchParams.style && searchParams.style !== "all") {
    restaurants = restaurants.filter((r) => r.style === searchParams.style);
  }
  if (searchParams.price && searchParams.price !== "all") {
    restaurants = restaurants.filter((r) => r.price_level === parseInt(searchParams.price!));
  }
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    restaurants = restaurants.filter((r) =>
      `${r.name} ${r.city} ${r.country}`.toLowerCase().includes(q)
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">BBQ Directory</h1>
      <p className="text-white/60 mb-6">Search and filter {all.length} spots worldwide</p>

      {/* Browse by location / style — internal-linking hubs */}
      <div className="mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Browse by country
          </span>
          {countries.slice(0, 14).map((c) => (
            <Link
              key={c.slug}
              href={`/directory/${c.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-0 px-3 py-1 text-sm text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              <FlagIcon code={c.code} className="text-sm" />
              {c.name}
              <span className="text-text-muted">{c.venues.length}</span>
            </Link>
          ))}
          <Link
            href="/styles"
            className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-sm font-semibold text-brand-gold hover:bg-brand-gold/15"
          >
            Browse by style →
          </Link>
        </div>
      </div>

      <DirectoryFilters />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
        {restaurants.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>
    </div>
  );
}
