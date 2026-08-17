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
  faqPageJsonLd,
} from "@/lib/seo/jsonld";
import { groupByCountry, groupByCity } from "@/lib/seo/hubs";
import { cityIntro, cityFaqs, cityMetaDescription } from "@/lib/seo/hub-content";
import { HubFaq } from "@/components/seo/HubFaq";
import { SearchImpressionBeacon } from "@/components/seo/SearchImpressionBeacon";
import { DirectoryPagination } from "@/components/directory/DirectoryPagination";
import { paginate, parsePageParam, pagePath } from "@/lib/directory/paginate";
import { type BbqStyle } from "@/lib/constants/styles";
import { StyleChip } from "@/components/restaurants/StyleChip";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; country: string; city: string };
  searchParams?: { page?: string };
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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  const city = country && groupByCity(country.venues).get(params.city);
  // A missing hub 404s (see below); its metadata is noindex either way.
  if (!country || !city) return { title: "Not Found", robots: { index: false } };
  const thin = city.venues.length < HUB_INDEX_MIN_VENUES;
  // Part 6/7 — self-canonical per page (page 1 = bare path, no ?page=1 duplicate).
  const { page, totalPages } = paginate(city.venues, parsePageParam(searchParams?.page));
  const suffix = page > 1 ? ` (page ${page} of ${totalPages})` : "";
  return {
    title: `Barbecue in ${city.name}, ${country.name}${suffix}`,
    description: cityMetaDescription(city.name, country.name, city.venues),
    alternates: { canonical: pagePath(`/directory/${params.country}/${params.city}`, page) },
    // Thin single-venue hubs are noindex (but still followed) — the venue page ranks.
    ...(thin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CityHubPage({ params, searchParams }: Props) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  const city = country && groupByCity(country.venues).get(params.city);
  // Part 6 — a hub that no longer exists (its last venue moved/closed, or a
  // stale indexed URL like /directory/united-states/dudley) returns a clean 404.
  // That is the correct SEO signal for a removed page — Google de-indexes it —
  // and it keeps the real hubs statically cached (a page-level redirect does NOT
  // fire for an unlisted param under ISR anyway, and redirecting thin removed
  // hubs to a broad parent risks a soft-404). The duplicate-canonical fix is the
  // thin-hub noindex above, not a redirect.
  if (!country || !city) notFound();

  const styles = [...new Set(city.venues.map((r) => r.style))] as BbqStyle[];
  const intro = cityIntro(city.name, country.name, city.venues);
  const faqs = cityFaqs(city.name, country.name, city.venues);
  // Part 7 — paginate the city's venues too (a big city can carry many branches).
  const pageData = paginate(city.venues, parsePageParam(searchParams?.page));

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
            <StyleChip
              key={s}
              style={s}
              className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-brand-sienna-light transition-colors hover:border-brand-sienna focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold"
            />
          ))}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pageData.items.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>

      <DirectoryPagination
        basePath={`/directory/${country.slug}/${city.slug}`}
        page={pageData.page}
        totalPages={pageData.totalPages}
      />

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
