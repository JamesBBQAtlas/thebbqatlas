import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
  faqPageJsonLd,
} from "@/lib/seo/jsonld";
import { groupByCountry, groupByCity } from "@/lib/seo/hubs";
import { cityIntro, cityFaqs, cityMetaDescription } from "@/lib/seo/hub-content";
import { HubFaq } from "@/components/seo/HubFaq";
import { SearchImpressionBeacon } from "@/components/seo/SearchImpressionBeacon";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; country: string; city: string };
}

export const revalidate = 3600;

// Part 6 (SEO triage) — a city hub with only ONE venue is thin: its content
// barely differs from that single venue's page, which is what makes Google flag
// it "Duplicate without user-selected canonical". Below this many venues the hub
// is noindex'd (and dropped from the sitemap) so the venue page carries the SEO.
const HUB_INDEX_MIN_VENUES = 2;

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
  // A missing hub redirects (see below); keep its metadata noindex just in case.
  if (!country || !city) return { title: "Not Found", robots: { index: false } };
  const thin = city.venues.length < HUB_INDEX_MIN_VENUES;
  return {
    title: `Barbecue in ${city.name}, ${country.name}`,
    description: cityMetaDescription(city.name, country.name, city.venues),
    alternates: { canonical: `/directory/${params.country}/${params.city}` },
    // Thin single-venue hubs are noindex (but still followed) — the venue page ranks.
    ...(thin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CityHubPage({ params }: Props) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  const city = country && groupByCity(country.venues).get(params.city);
  // Part 6 — a hub that no longer exists (its last venue moved/closed, or a
  // stale indexed URL like /directory/united-states/dudley) must not dead-end on
  // a 404. Consolidate it up to its parent instead: unknown city → the country
  // hub, unknown country → the directory root. A temporary redirect (not
  // permanent) because hubs are data-driven and can legitimately reappear when a
  // venue is added there again.
  if (!country) redirect("/directory");
  if (!city) redirect(`/directory/${params.country}`);

  const styles = [...new Set(city.venues.map((r) => r.style))] as BbqStyle[];
  const intro = cityIntro(city.name, country.name, city.venues);
  const faqs = cityFaqs(city.name, country.name, city.venues);

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
          faqPageJsonLd(faqs),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Directory", path: "/directory" },
            { name: country.name, path: `/directory/${country.slug}` },
            { name: city.name, path: `/directory/${country.slug}/${city.slug}` },
          ]),
        ]}
      />

      <SearchImpressionBeacon
        page={`city:${country.slug}/${city.slug}`}
        items={city.venues.slice(0, 50).map((r, i) => ({ restaurantId: r.id, position: i + 1 }))}
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
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text-secondary">{intro}</p>

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

      <HubFaq faqs={faqs} heading={`Barbecue in ${city.name} — FAQ`} />

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
