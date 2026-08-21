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
  faqPageJsonLd,
} from "@/lib/seo/jsonld";
import { groupByCountry, groupByCity } from "@/lib/seo/hubs";
import { countryIntro, countryFaqs, countryMetaDescription } from "@/lib/seo/hub-content";
import { HubFaq } from "@/components/seo/HubFaq";
import { SearchImpressionBeacon } from "@/components/seo/SearchImpressionBeacon";
import { DirectoryPagination } from "@/components/directory/DirectoryPagination";
import { paginate, parsePageParam, pagePath } from "@/lib/directory/paginate";

interface Props {
  params: { locale: string; country: string };
  searchParams?: { page?: string };
}

// B9: these hubs paginate via ?page=, a dynamic (request-time) read. Under the previous
// on-demand-ISR config (revalidate + generateStaticParams) that searchParams read tripped
// Next's "static→dynamic at runtime" bailout and 500'd every ?page= URL (crawler-hit,
// ~50 city URLs live). Rendering explicitly dynamic makes every page return 200. DB load
// is unaffected: getRestaurants() is unstable_cache'd (tag "venues"), so there are no
// full-table reads per request — only a cheap in-memory group/paginate. Resolves L2.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  if (!country) return { title: "Not Found", robots: { index: false } };
  const cityCount = groupByCity(country.venues).size;
  // Part 6/7 — each page self-canonicals to its own clean URL (page 1 = bare path, no
  // ?page=1 duplicate); the page number is in the title so paginated pages aren't seen
  // as duplicates of page 1.
  const { page, totalPages } = paginate(country.venues, parsePageParam(searchParams?.page));
  const suffix = page > 1 ? ` (page ${page} of ${totalPages})` : "";
  return {
    title: `Barbecue in ${country.name}${suffix}`,
    description: countryMetaDescription(country.name, country.venues, cityCount),
    alternates: { canonical: pagePath(`/directory/${params.country}`, page) },
  };
}

export default async function CountryHubPage({ params, searchParams }: Props) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();
  const country = groupByCountry(all).get(params.country);
  // Part 6 — an unknown/emptied country hub returns a clean 404 (correct SEO for
  // a removed page; Google de-indexes it). Keeps real hubs statically cached.
  if (!country) notFound();

  // Part 7 — bound the rendered list to one page (fast first paint on mobile even as a
  // country grows to hundreds); numbered links below keep every venue crawlable.
  const pageData = paginate(country.venues, parsePageParam(searchParams?.page));

  const cities = [...groupByCity(country.venues).values()].sort(
    (a, b) => b.venues.length - a.venues.length
  );
  const intro = countryIntro(country.name, country.venues, cities.length);
  const faqs = countryFaqs(
    country.name,
    country.venues,
    cities.map((c) => c.name)
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
          faqPageJsonLd(faqs),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Directory", path: "/directory" },
            { name: country.name, path: `/directory/${country.slug}` },
          ]),
        ]}
      />

      <SearchImpressionBeacon
        page={`country:${country.slug}`}
        items={country.venues.slice(0, 50).map((r, i) => ({ restaurantId: r.id, position: i + 1 }))}
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
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text-secondary">{intro}</p>

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
        {pageData.items.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>

      <DirectoryPagination
        basePath={`/directory/${country.slug}`}
        page={pageData.page}
        totalPages={pageData.totalPages}
      />

      <HubFaq faqs={faqs} heading={`Barbecue in ${country.name} — FAQ`} />

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
