import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
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
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; country: string; city: string };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const all = await getRestaurants();
  const params: { country: string; city: string }[] = [];
  for (const country of groupByCountry(all).values()) {
    for (const city of groupByCity(country.venues).values()) {
      params.push({ country: country.slug, city: city.slug });
    }
  }
  return routing.locales.flatMap((locale) =>
    params.map((p) => ({ locale, ...p }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  const city = country && groupByCity(country.venues).get(params.city);
  if (!country || !city) return { title: "Not Found" };
  return {
    title: `Barbecue in ${city.name}, ${country.name}`,
    description: `The best barbecue in ${city.name}, ${country.name} — ${city.venues.length} venues mapped on The BBQ Atlas.`,
    alternates: { canonical: `/directory/${params.country}/${params.city}` },
  };
}

export default async function CityHubPage({ params }: Props) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  const city = country && groupByCity(country.venues).get(params.city);
  if (!country || !city) notFound();

  const styles = [...new Set(city.venues.map((r) => r.style))] as BbqStyle[];

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <JsonLd
        data={[
          collectionPageJsonLd(
            `Barbecue in ${city.name}, ${country.name}`,
            `Barbecue venues in ${city.name}.`,
            `/directory/${country.slug}/${city.slug}`
          ),
          itemListJsonLd(
            `Barbecue in ${city.name}`,
            city.venues.map((r) => ({
              name: r.name,
              path: `/restaurants/${r.slug}`,
            }))
          ),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Directory", path: "/directory" },
            { name: country.name, path: `/directory/${country.slug}` },
            { name: city.name, path: `/directory/${country.slug}/${city.slug}` },
          ]),
        ]}
      />

      <nav className="mb-4 text-sm text-text-muted">
        <Link href="/directory" className="hover:text-brand-gold">
          Directory
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/directory/${country.slug}`} className="hover:text-brand-gold">
          {country.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text-secondary">{city.name}</span>
      </nav>

      <h1 className="flex flex-wrap items-center gap-3 font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        Barbecue in {city.name}
        <FlagIcon code={country.code} className="text-3xl" />
      </h1>
      <p className="mt-4 text-lg text-text-secondary">
        {city.venues.length} {city.venues.length === 1 ? "venue" : "venues"} in{" "}
        {city.name}, {country.name}.
      </p>

      {styles.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {styles.map((s) => (
            <Link
              key={s}
              href={`/styles/${s}`}
              className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-brand-sienna-light transition-colors hover:border-brand-sienna"
            >
              {STYLE_LABELS[s]}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {city.venues.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>

      <div className="mt-12">
        <Link
          href={`/directory/${country.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold hover:underline"
        >
          More barbecue in {country.name} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
