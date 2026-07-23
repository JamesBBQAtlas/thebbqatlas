import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin, Globe, ChevronRight, UtensilsCrossed, Beer, Phone, Store, Camera } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getRestaurantBySlug,
  getRestaurants,
  getSignatureDishes,
} from "@/lib/queries/restaurants";
import { safeVenueImage } from "@/lib/restaurants/image";
import { STYLE_LABELS, STYLE_PIN_COLORS } from "@/lib/constants/styles";
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
import { CheckInButton } from "@/components/restaurants/CheckInButton";
import { InstagramEmbed } from "@/components/restaurants/InstagramEmbed";
import { HeroPlaceholder } from "@/components/restaurants/HeroPlaceholder";
import { RestaurantLocatorMap } from "@/components/restaurants/RestaurantLocatorMap";
import { ReportCorrection } from "@/components/restaurants/ReportCorrection";
import { TrackView } from "@/components/account/TrackView";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantJsonLd, breadcrumbJsonLd, eventJsonLd } from "@/lib/seo/jsonld";
import {
  CATEGORY_LABELS,
  isTimeBased,
  eventStatus,
  formatEventDates,
} from "@/lib/constants/categories";
import { createClient } from "@/lib/supabase/server";
import { getVenueMetrics, getUserCheckIn } from "@/lib/queries/checkins";
import { getApprovedMedia } from "@/lib/queries/media";
import { CommunityGallery } from "@/components/restaurants/CommunityGallery";
import { getSiblingLocations } from "@/lib/queries/brands";
import { slugify } from "@/lib/seo/hubs";
import type { Brand } from "@/lib/types/database";
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
      images: safeVenueImage(restaurant.hero_image_url)
        ? [safeVenueImage(restaurant.hero_image_url) as string]
        : [],
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const brandId = restaurant.brand_id ?? null;
  const [dishes, allRestaurants, metrics, myCheckIn, media, siblings, brand] =
    await Promise.all([
      getSignatureDishes(restaurant.id),
      getRestaurants(),
      getVenueMetrics(restaurant.id),
      user ? getUserCheckIn(supabase, user.id, restaurant.id) : Promise.resolve(null),
      getApprovedMedia(restaurant.id),
      brandId ? getSiblingLocations(brandId, restaurant.id) : Promise.resolve([]),
      brandId
        ? supabase
            .from("brands")
            .select("name, slug")
            .eq("id", brandId)
            .single()
            .then((r) => r.data as Pick<Brand, "name" | "slug"> | null)
        : Promise.resolve(null),
    ]);

  const code = resolveCountryCode(restaurant.country_code, restaurant.country);
  const cityCountry = [restaurant.city, restaurant.country].filter(Boolean).join(", ");
  const paragraphs = (restaurant.description ?? "")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const menu = groupOfferings(restaurant.offerings);
  const alcohol = restaurant.alcohol as AlcoholPolicy | null;

  const socials = [
    { label: "Instagram", href: restaurant.instagram_url },
    { label: "X", href: restaurant.x_url },
    { label: "Facebook", href: restaurant.facebook_url },
    { label: "TikTok", href: restaurant.tiktok_url },
    { label: "YouTube", href: restaurant.youtube_url },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  // Venue imagery hierarchy (copyright-safe): (1) an approved uploaded photo
  // from our moderated media system; else (2) the official Instagram embed (its
  // own section below); else (3) the branded "Add a photo" placeholder. We never
  // scrape, hotlink, or self-host a third party's image as a hero.
  const heroImage = media.find((m) => m.kind === "image")?.url ?? null;
  const canUpload = Boolean(user);
  const uploadHref = canUpload
    ? "#add-photos"
    : `/login?next=/restaurants/${restaurant.slug}`;

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
          isTimeBased(restaurant.category) && restaurant.event_starts_at
            ? eventJsonLd(restaurant)
            : restaurantJsonLd(restaurant),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Directory", path: "/directory" },
            { name: restaurant.name, path: `/restaurants/${restaurant.slug}` },
          ]),
        ]}
      />
      <TrackView
        entityType="venue"
        entityId={restaurant.id}
        title={restaurant.name}
        slug={restaurant.slug}
      />

      {/* Hero */}
      <section className="relative h-[52vh] min-h-[360px] w-full overflow-hidden">
        {heroImage ? (
          // Approved, moderated upload from our own media system — never scraped.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={`${restaurant.name} — ${STYLE_LABELS[restaurant.style]} barbecue in ${cityCountry}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <HeroPlaceholder
            variant="hero"
            styleColor={STYLE_PIN_COLORS[restaurant.style]}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background" />

        {/* Tier 3: branded invitation to contribute the first photo. */}
        {!heroImage && (
          <div className="absolute inset-x-0 top-[34%] z-[1] flex flex-col items-center px-6 text-center">
            <p className="font-heading text-xs uppercase tracking-[0.22em] text-white/70">
              No photos yet
            </p>
            <Link
              href={uploadHref}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse shadow-lg transition-colors hover:bg-brand-gold/90"
            >
              <Camera className="h-4 w-4" />
              Add a photo
            </Link>
            <Link
              href={`/list?claim=${restaurant.slug}`}
              className="mt-2.5 text-xs font-semibold text-white/70 underline-offset-2 transition-colors hover:text-brand-gold hover:underline"
            >
              Own this venue?
            </Link>
          </div>
        )}

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
              {restaurant.category && restaurant.category !== "restaurant" && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.06em] text-brand-gold">
                  {CATEGORY_LABELS[restaurant.category]}
                </span>
              )}
              {isTimeBased(restaurant.category) &&
                formatEventDates(restaurant.event_starts_at, restaurant.event_ends_at) && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold">
                    {formatEventDates(
                      restaurant.event_starts_at,
                      restaurant.event_ends_at
                    )}
                    {eventStatus(
                      restaurant.event_starts_at,
                      restaurant.event_ends_at
                    ) === "ongoing" && (
                      <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em]">
                        On now
                      </span>
                    )}
                    {eventStatus(
                      restaurant.event_starts_at,
                      restaurant.event_ends_at
                    ) === "past" && (
                      <span className="text-text-muted">· past event</span>
                    )}
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

          {Array.isArray(restaurant.instagram_posts) &&
            restaurant.instagram_posts.length > 0 && (
              <section className="mb-12">
                <h2 className="mb-5 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
                  From their Instagram
                </h2>
                <InstagramEmbed posts={restaurant.instagram_posts} />
              </section>
            )}

          <CommunityGallery
            restaurantId={restaurant.id}
            media={media}
            canUpload={Boolean(user)}
          />

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
          <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-0 p-6">
            <CheckInButton
              restaurantId={restaurant.id}
              restaurantName={restaurant.name}
              isAuthed={Boolean(user)}
              initial={myCheckIn}
            />
            {(metrics.visited > 0 || metrics.saved > 0) && (
              <div className="flex items-center gap-4 border-t border-border-subtle pt-4 text-sm">
                {metrics.visited > 0 && (
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="font-heading text-lg font-bold text-brand-gold">
                      {metrics.visited.toLocaleString()}
                    </span>
                    {metrics.visited === 1 ? "has been here" : "have been here"}
                  </span>
                )}
                {metrics.saved > 0 && (
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="font-heading text-lg font-bold text-brand-gold">
                      {metrics.saved.toLocaleString()}
                    </span>
                    saved
                  </span>
                )}
              </div>
            )}
            <div className="border-t border-border-subtle pt-4">
              <SaveShareActions restaurantId={restaurant.id} name={restaurant.name} />
            </div>
          </div>

          {/* Part of a brand — other locations */}
          {brand && (
            <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
              <p className="u-eyebrow mb-1 text-text-muted">Part of</p>
              <Link
                href={`/brands/${brand.slug}`}
                className="font-heading text-lg font-bold text-text-primary transition-colors hover:text-brand-gold"
              >
                {brand.name}
              </Link>
              {siblings.length > 0 && (
                <>
                  <p className="mt-4 mb-2 text-sm text-text-muted">
                    Other locations
                  </p>
                  <ul className="space-y-1.5">
                    {siblings.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/restaurants/${s.slug}`}
                          className="flex items-center justify-between gap-2 text-sm text-text-secondary transition-colors hover:text-brand-gold"
                        >
                          <span>{s.location_label || s.city || s.name}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-border-strong" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

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

          {/* Socials — find them online */}
          {socials.length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
              <h3 className="mb-4 border-b border-border-subtle pb-3 font-heading text-base font-bold text-text-primary">
                Find them
              </h3>
              <div className="flex flex-wrap gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-border-default px-3.5 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Locator map */}
          <RestaurantLocatorMap
            lat={restaurant.lat}
            lng={restaurant.lng}
            nearby={nearby.map((n) => ({ lat: n.r.lat, lng: n.r.lng }))}
            caption={cityCountry}
          />

          {/* Ownership + keeping listings honest */}
          <div className="space-y-2 text-center">
            <Link
              href={`/list?claim=${restaurant.slug}`}
              className="inline-flex items-center gap-1.5 text-xs text-text-muted underline-offset-2 transition-colors hover:text-brand-gold hover:underline"
            >
              <Store className="h-3.5 w-3.5" />
              Own this business? Claim your listing
            </Link>
            <div>
              <ReportCorrection restaurantId={restaurant.id} name={restaurant.name} />
            </div>
          </div>
        </aside>
      </div>

      {/* Explore more — programmatic internal linking into hubs */}
      <section className="mx-auto max-w-[1200px] px-6 pb-8 sm:px-10">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/styles/${restaurant.style}`}
            className="rounded-full border border-border-subtle bg-surface-0 px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
          >
            {STYLE_LABELS[restaurant.style]} barbecue
          </Link>
          {restaurant.city && restaurant.country && (
            <Link
              href={`/directory/${slugify(restaurant.country)}/${slugify(restaurant.city)}`}
              className="rounded-full border border-border-subtle bg-surface-0 px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              Barbecue in {restaurant.city}
            </Link>
          )}
          {restaurant.country && (
            <Link
              href={`/directory/${slugify(restaurant.country)}`}
              className="rounded-full border border-border-subtle bg-surface-0 px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              Barbecue in {restaurant.country}
            </Link>
          )}
        </div>
      </section>

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
