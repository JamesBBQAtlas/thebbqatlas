import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getRestaurants } from "@/lib/queries/restaurants";
import { STYLE_LABELS } from "@/lib/constants/styles";
import { MapCanvas } from "@/components/map/MapCanvas";

interface Props {
  params: { locale: string };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "The Map",
    description:
      "Explore the world's great barbecue on an interactive map — Texas smokehouses, Korean grillrooms, Argentine asados and more. Filter by style and country.",
    alternates: { canonical: "/map" },
  };
}

export default async function MapPage({ params }: Props) {
  setRequestLocale(params.locale);
  const restaurants = await getRestaurants();

  // Group for the crawlable / no-JS fallback
  const byCountry = new Map<string, typeof restaurants>();
  for (const r of restaurants) {
    const arr = byCountry.get(r.country) ?? [];
    arr.push(r);
    byCountry.set(r.country, arr);
  }
  const groups = [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mt-18 h-[calc(100vh-4.5rem)]">
      <MapCanvas
        restaurants={restaurants}
        mapKey={process.env.NEXT_PUBLIC_MAPTILER_KEY}
      />

      {/* SEO / no-JS fallback: every restaurant as a crawlable link, grouped by country */}
      <div className="sr-only">
        <h1>The BBQ Atlas — Interactive Map</h1>
        <p>Browse {restaurants.length} barbecue destinations worldwide.</p>
        {groups.map(([country, list]) => (
          <section key={country}>
            <h2>{country}</h2>
            <ul>
              {list.map((r) => (
                <li key={r.id}>
                  <Link href={`/restaurants/${r.slug}`}>
                    {r.name} — {r.city}, {r.country} ({STYLE_LABELS[r.style]})
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <noscript>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            The BBQ Atlas — Directory
          </h1>
          <p className="mt-2 text-text-muted">
            The interactive map needs JavaScript. Here are all {restaurants.length} spots:
          </p>
          {groups.map(([country, list]) => (
            <section key={country} className="mt-6">
              <h2 className="font-heading text-lg font-bold text-brand-gold">{country}</h2>
              <ul className="mt-2 space-y-1">
                {list.map((r) => (
                  <li key={r.id}>
                    <a
                      href={`/restaurants/${r.slug}`}
                      className="text-text-secondary hover:text-brand-gold"
                    >
                      {r.name} — {r.city} ({STYLE_LABELS[r.style]})
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </noscript>
    </div>
  );
}
