import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin, Globe, ChevronRight, UtensilsCrossed, Beer, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getRestaurantBySlug,
  getRestaurants,
  getSignatureDishes,
} from "@/lib/queries/restaurants";
import { STYLE_LABELS } from "@/lib/constants/styles";
import {
  groupOfferings,
  OFFERING_CATEGORY_LABELS,
  ALCOHOL_LABELS,
  type AlcoholPolicy,
} from "@/lib/constants/offerings";
import { resolveCountryCode, countryName } from "@/lib/constants/countries";
import { haversineKm } from "@/lib/utils/geo";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { TrackedLink } from "@/components/monetization/TrackedLink";
import { SaveShareActions } from "@/components/restaurants/SaveShareActions";
import { RestaurantLocatorMap } from "@/components/restaurants/RestaurantLocatorMap";
import { ReportCorrection } from "@/components/restaurants/ReportCorrection";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; slug: string };
}

// Pre-render every approved restaurant (ISR: refresh hourly).
export const revalidate = 3600;

export async function generateStaticParams() {
  const restaurants = await getRestaurants();
  return routing.locales.flatMap((locale) =>
    restaurants.map((r) => ({ locale, slug: r.slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) return { title: "Restaurant Not Found" };

  const location = [restaurant.city, restaurant.country].filter(Boolean).join(", ");
  const description =
    restaurant.description?.slice(0, 160) ??
    `${restaurant.name} — ${STYLE_LABELS[restaurant.style]} barbecue in ${location}.`;

  return {
    title: restaurant.name,
    description,
    alternates: { canonical: `/restaurants/${restaurant.slug}` },
    openGraph: {
      title: restaurant.name,
      description,
      type: "article",
      images: restaurant.hero_image_url ? [restaurant.hero_image_url] : [],
    },
  };
}

export default async function RestaurantPage({ params }: Props) {
  setRequestLocale(params.locale);
  const t = await getTranslations("Restaurant");

  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();
  if (restaurant.slug !== params.slug) {
    redirect(`/restaurants/${restaurant.slug}`);
  }

  const [dishes, allRestaurants] = await Promise.all([
    getSignatureDishes(restaurant.id),
    getRestaurants(),
  ]);

  const code = resolveCountryCode(restaurant.country_code, restaurant.country);
  const cityCountry = [restaurant.city, restaurant.country].filter(Boolean).join(", ");
  const paragraphs = (restaurant.description ?? "")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const menu = groupOfferings(restaurant.offerings);
  const alcohol = restaurant.alcohol as AlcoholPolicy | null;

  // Nearby (by true distance). Miles for US/UK, kilometres elsewhere.
  const useMiles = code === "US" || code === "GB";
  const fmtDist = (km: number) => {
    if (useMiles) {
      const mi = km * 0.621371;
      return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
    }
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  };
  const nearby = allRestaurants
    .filter(
      (r) =>
        r.id !== restaurant.id &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng)
    )
    .map((r) => ({ r, km: haversineKm(restaurant.lat, restaurant.lng, r.lat, r.lng) }))
    .sort((a, b) => a.km - b.km)
    .filter((x) => x.km <= 320) // ~200 mi
    .slice(0, 6);

  return (
    <>
      <JsonLd
        data={[
          restaurantJsonLd(restaurant),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Directory", path: "/directory" },
            { name: restaurant.name, path: `/restaurants/${restaurant.slug}` },
          ]),
        ]}
      />

      {/* Hero */}
      <section className="relative h-[52vh] min-h-[360px] w-full overflow-hidden pt-18">
        {restaurant.hero_image_url ? (
          <Image
            src={restaurant.hero_image_url}
            alt={`${restaurant.name} — ${STYLE_LABELS[restaurant.style]} barbecue in ${cityCountry}`}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface-2 to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background" />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-[1200px] px-6 pb-10 sm:px-10">
            <nav
              aria-label="Breadcrumb"
              className="mb-3 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-text-muted"
            >
              <Link href="/" className="transition-colors hover:text-brand-gold">
                {t("breadcrumbHome")}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-border-strong" />
              <Link
                href="/directory"
                className="transition-colors hover:text-brand-gold"
              >
                {t("breadcrumbDirectory")}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-border-strong" />
              <span className="text-text-secondary">
                {STYLE_LABELS[restaurant.style]}
              </span>
            </nav>

            <h1 className="max-w-4xl font-heading text-4xl font-extrabold leading-[1.05] text-text-primary text-balance sm:text-5xl md:text-6xl">
              {restaurant.name}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              {restaurant.permanently_closed && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive bg-destructive/15 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.06em] text-destructive">
                  Permanently closed
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-sienna bg-brand-sienna/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-brand-sienna-light">
                {STYLE_LABELS[restaurant.style]}
              </span>
              {cityCountry && (
                <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                  <MapPin className="h-4 w-4 text-text-muted" />
                  {restaurant.city}
                  {restaurant.country ? `, ${restaurant.country}` : ""}
                  <FlagIcon code={code} className="ml-0.5 text-base" />
                </span>
              )}
              {restaurant.price_level > 0 && (
                <span className="text-sm font-semibold tracking-wide">
                  <span className="text-brand-gold">
                    {"$".repeat(restaurant.price_level)}
                  </span>
                  <span className="text-text-muted">
                    {"$".repeat(Math.max(0, 4 - restaurant.price_level))}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main two-column layout */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="min-w-0">
          {paragraphs.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-1 font-heading text-2xl font-bold text-text-primary">
                {t("atlasReview")}
              </h2>
              <p className="u-eyebrow mb-5 text-text-muted">The BBQ Atlas</p>
              <div className="space-y-4 text-lg leading-[1.75] text-text-secondary">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}

          {/* On the Menu — structured, searchable offerings */}
          {menu.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-5 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
                On the Menu
              </h2>
              <div className="space-y-5">
                {menu.map((group) => (
                  <div key={group.category}>
                    <h3 className="u-eyebrow mb-2.5 text-text-muted">
                      {OFFERING_CATEGORY_LABELS[group.category]}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <span
                          key={item.slug}
                          className={
                            group.category === "meats"
                              ? "rounded-full border border-brand-sienna/60 bg-brand-sienna/10 px-3 py-1 text-sm font-medium text-text-primary"
                              : "rounded-full border border-border-default bg-surface-1 px-3 py-1 text-sm text-text-secondary"
                          }
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dishes.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-5 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
                {t("signatureDishes")}
              </h2>
              <ul className="space-y-4">
                {dishes.map((dish) => (
                  <li
                    key={dish.id}
                    className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-0 p-4"
                  >
                    <UtensilsCrossed className="mt-0.5 h-5 w-5 shrink-0 text-brand-sienna" />
                    <div>
                      <p className="font-semibold text-text-primary">{dish.name}</p>
                      {dish.description && (
                        <p className="mt-1 text-sm leading-relaxed text-text-muted">
                          {dish.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
            <SaveShareActions restaurantId={restaurant.id} name={restaurant.name} />
          </div>

          {/* Details */}
          <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
            <h3 className="mb-4 border-b border-border-subtle pb-3 font-heading text-base font-bold text-text-primary">
              {t("location")}
            </h3>
            <dl className="space-y-3.5">
              {restaurant.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-sienna" />
                  <div>
                    <dt className="u-eyebrow text-[0.6875rem] text-text-muted">
                      {t("address")}
                    </dt>
                    <dd className="text-[0.9375rem] text-text-primary">
                      {restaurant.address}
                    </dd>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-[0.9375rem] text-text-secondary">
                      <FlagIcon code={code} className="text-base" />
                      {countryName(code, restaurant.country)}
                    </dd>
                  </div>
                </div>
              )}
              {restaurant.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-sienna" />
                  <div>
                    <dt className="u-eyebrow text-[0.6875rem] text-text-muted">
                      {t("phone")}
                    </dt>
                    <dd className="text-[0.9375rem] text-text-primary">
                      {restaurant.phone}
                    </dd>
                  </div>
                </div>
              )}
              {alcohol && (
                <div className="flex items-start gap-3">
                  <Beer className="mt-0.5 h-4 w-4 shrink-0 text-brand-sienna" />
                  <div>
                    <dt className="u-eyebrow text-[0.6875rem] text-text-muted">
                      Drinks
                    </dt>
                    <dd className="text-[0.9375rem] text-text-primary">
                      {ALCOHOL_LABELS[alcohol]}
                    </dd>
                  </div>
                </div>
              )}
              {restaurant.website && (
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-brand-sienna" />
                  <div className="min-w-0">
                    <dt className="u-eyebrow text-[0.6875rem] text-text-muted">
                      {t("website")}
                    </dt>
                    <dd className="truncate text-[0.9375rem]">
                      <TrackedLink
                        href={restaurant.website}
                        eventType="website"
                        restaurantId={restaurant.id}
                        className="text-brand-gold transition-colors hover:text-brand-gold-light hover:underline"
                      >
                        {restaurant.website
                          .replace(/^https?:\/\/(www\.)?/, "")
                          .replace(/\/$/, "")}
                      </TrackedLink>
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {/* Locator map */}
          <RestaurantLocatorMap
            lat={restaurant.lat}
            lng={restaurant.lng}
            nearby={nearby.map((n) => ({ lat: n.r.lat, lng: n.r.lng }))}
            caption={cityCountry}
          />

          {/* Keep listings honest */}
          <div className="text-center">
            <ReportCorrection restaurantId={restaurant.id} name={restaurant.name} />
          </div>
        </aside>
      </div>

      {/* Nearby on the Atlas — by real distance */}
      {nearby.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 pb-24 sm:px-10">
          <h2 className="mb-6 font-heading text-2xl font-bold text-text-primary">
            {t("nearby")}
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map(({ r, km }) => (
              <Link
                key={r.id}
                href={`/restaurants/${r.slug}`}
                className="group flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-0 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-border-default hover:shadow-lg"
              >
                <div className="min-w-0">
                  <p className="font-heading text-[1.0625rem] font-bold text-text-primary transition-colors group-hover:text-brand-gold">
                    {r.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
                    {[r.city, r.country].filter(Boolean).join(", ")}
                    <FlagIcon
                      code={resolveCountryCode(r.country_code, r.country)}
                      className="text-sm"
                    />
                  </p>
                  <span className="mt-3 inline-block rounded-full border border-brand-sienna/30 bg-brand-sienna/5 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna">
                    {STYLE_LABELS[r.style]}
                  </span>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-brand-gold">
                  {fmtDist(km)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
