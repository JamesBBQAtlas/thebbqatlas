import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { MapPin, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getRestaurants } from "@/lib/queries/restaurants";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  itemListJsonLd,
  collectionPageJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo/jsonld";
import { groupByCountry, groupByCity } from "@/lib/seo/hubs";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; country: string };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const all = await getRestaurants();
  const slugs = [...groupByCountry(all).keys()];
  return routing.locales.flatMap((locale) =>
    slugs.map((country) => ({ locale, country }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  if (!country) return { title: "Not Found" };
  return {
    title: `Barbecue in ${country.name}`,
    description: `Discover ${country.venues.length} barbecue venues across ${country.name} on The BBQ Atlas — by city and style.`,
    alternates: { canonical: `/directory/${params.country}` },
  };
}

export default async function CountryHubPage({ params }: Props) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  if (!country) notFound();

  const cities = [...groupByCity(country.venues).values()].sort(
    (a, b) => b.venues.length - a.venues.length
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <JsonLd
        data={[
          collectionPageJsonLd(
            `Barbecue in ${country.name}`,
            `Barbecue venues across ${country.name}.`,
            `/directory/${country.slug}`
          ),
          itemListJsonLd(
            `Barbecue in ${country.name}`,
            country.venues.map((r) => ({
              name: r.name,
              path: `/restaurants/${r.slug}`,
            }))
          ),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Directory", path: "/directory" },
            { name: country.name, path: `/directory/${country.slug}` },
          ]),
        ]}
      />

      <nav className="mb-4 text-sm text-text-muted">
        <Link href="/directory" className="hover:text-brand-gold">
          Directory
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text-secondary">{country.name}</span>
      </nav>

      <h1 className="flex items-center gap-3 font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        Barbecue in {country.name}
        <FlagIcon code={country.code} className="text-3xl" />
      </h1>
      <p className="mt-4 text-lg text-text-secondary">
        {country.venues.length} {country.venues.length === 1 ? "venue" : "venues"}{" "}
        across {cities.length} {cities.length === 1 ? "city" : "cities"}.
      </p>

      {cities.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {cities.map((c) => (
            <Link
              key={c.slug}
              href={`/directory/${country.slug}/${c.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-0 px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              <MapPin className="h-3.5 w-3.5" />
              {c.name}
              <span className="text-text-muted">{c.venues.length}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {country.venues.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>

      <div className="mt-12">
        <Link
          href="/directory"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold hover:underline"
        >
          All venues worldwide <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
