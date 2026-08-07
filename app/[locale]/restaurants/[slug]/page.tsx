import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin, Globe, ChevronRight, UtensilsCrossed, Beer, Phone, Store, Clock, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getRestaurantBySlug,
  getRestaurants,
  getNearbyVenues,
  getSignatureDishes,
  getSlugRedirect,
} from "@/lib/queries/restaurants";
import { safeVenueImage } from "@/lib/restaurants/image";
import { STYLE_LABELS } from "@/lib/constants/styles";
import { styleHeroUrl } from "@/lib/constants/hero";
import {
  groupOfferings,
  OFFERING_CATEGORY_LABELS,
  ALCOHOL_LABELS,
  type AlcoholPolicy,
} from "@/lib/constants/offerings";
import { resolveCountryCode, countryName } from "@/lib/constants/countries";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { SocialIcon, SOCIAL_LABELS, type SocialKind } from "@/components/ui/SocialIcon";
import { TrackedLink } from "@/components/monetization/TrackedLink";
import { VenueUserActions } from "@/components/restaurants/VenueUserActions";
import { InstagramEmbed } from "@/components/restaurants/InstagramEmbed";
import { RestaurantLocatorMap } from "@/components/restaurants/RestaurantLocatorMap";
import { ReportCorrection } from "@/components/restaurants/ReportCorrection";
import { TrackView } from "@/components/account/TrackView";
import { VenueViewBeacon } from "@/components/restaurants/VenueViewBeacon";
import { JsonLd } from "@/components/seo/JsonLd";
import { restaurantJsonLd, breadcrumbJsonLd, eventJsonLd, faqPageJsonLd } from "@/lib/seo/jsonld";
import { venueFaqs } from "@/lib/seo/hub-content";
import { HubFaq } from "@/components/seo/HubFaq";
import { SITE, absoluteUrl } from "@/lib/seo/site";
import {
  CATEGORY_LABELS,
  isTimeBased,
  eventStatus,
  formatEventDates,
} from "@/lib/constants/categories";
import { createAnonClient } from "@/lib/supabase/anon";
import { getVenueMetrics } from "@/lib/queries/checkins";
import { getRecentVisitors } from "@/lib/queries/profiles";
import { getPublicAvatarSignedUrls, avatarBadge } from "@/lib/account/public-avatar";
import { VenueVisitors } from "@/components/restaurants/VenueVisitors";
import { getApprovedMedia } from "@/lib/queries/media";
import { CommunityGallery } from "@/components/restaurants/CommunityGallery";
import { FeaturedVideo } from "@/components/restaurants/FeaturedVideo";
import { FeaturedUpgrade } from "@/components/restaurants/FeaturedUpgrade";
import { VenueReport } from "@/components/restaurants/VenueReport";
import { VenueReviews } from "@/components/restaurants/VenueReviews";
import { getGearForStyle } from "@/lib/queries/gear";
import { groupedHours } from "@/lib/restaurants/hours";
import { SmallHoursAside } from "@/components/restaurants/SmallHoursAside";
import { GearProductCard } from "@/components/gear/GearProductCard";
import { AffiliateDisclosure } from "@/components/monetization/AffiliateDisclosure";
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

  const canonical = `/restaurants/${restaurant.slug}`;
  // Fall back to the dedicated 1200×630 share card when there's no copyright-safe
  // hero, so the preview never renders imageless (or in the wrong aspect ratio).
  const ogImage = safeVenueImage(restaurant.hero_image_url) || SITE.ogImage;

  return {
    title: restaurant.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: restaurant.name,
      description,
      type: "article",
      url: absoluteUrl(canonical),
      siteName: SITE.name,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: restaurant.name,
      description,
      images: [ogImage],
    },
  };
}

export default async function RestaurantPage({ params }: Props) {
  setRequestLocale(params.locale);
  const t = await getTranslations("Restaurant");

  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) {
    // Retired slug? 301 to its new home so old links/SEO never 404.
    const dest = await getSlugRedirect(params.slug);
    if (dest) permanentRedirect(`/restaurants/${dest}`);
    notFound();
  }
  if (restaurant.slug !== params.slug) {
    permanentRedirect(`/restaurants/${restaurant.slug}`);
  }

  // The venue page reads NO cookies, so it renders statically (ISR, Fable H-1).
  // The user-specific bits — check-in, saved, photo-upload gate — hydrate
  // client-side (VenueUserActions / CommunityUpload), and the profile view is
  // captured via a client beacon (VenueViewBeacon → /api/venue-view).
  const anon = createAnonClient();
  const brandId = restaurant.brand_id ?? null;
  const [dishes, nearbyRows, metrics, media, siblings, brand, gear, visitors] =
    await Promise.all([
      getSignatureDishes(restaurant.id),
      getNearbyVenues(restaurant.lat, restaurant.lng, restaurant.id, 6),
      getVenueMetrics(restaurant.id),
      getApprovedMedia(restaurant.id),
      brandId ? getSiblingLocations(brandId, restaurant.id) : Promise.resolve([]),
      brandId
        ? anon
            .from("brands")
            .select("name, slug")
            .eq("id", brandId)
            .single()
            .then((r) => r.data as Pick<Brand, "name" | "slug"> | null)
        : Promise.resolve(null),
      getGearForStyle(restaurant.style),
      getRecentVisitors(restaurant.id, 50),
    ]);
  const hours = groupedHours(restaurant.hours);

  const code = resolveCountryCode(restaurant.country_code, restaurant.country);
  const cityCountry = [restaurant.city, restaurant.country].filter(Boolean).join(", ");
  const paragraphs = (restaurant.description ?? "")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const menu = groupOfferings(restaurant.offerings);
  const alcohol = restaurant.alcohol as AlcoholPolicy | null;

  // A saved handle must ALWAYS be reachable as a link-out, even with 0 embeddable
  // posts: fall back to building the Instagram URL from the handle.
  const igHref =
    restaurant.instagram_url ??
    (restaurant.instagram_handle
      ? `https://www.instagram.com/${restaurant.instagram_handle.replace(/^@/, "")}/`
      : null);
  const socials = (
    [
      { kind: "instagram", label: SOCIAL_LABELS.instagram, href: igHref },
      { kind: "x", label: SOCIAL_LABELS.x, href: restaurant.x_url },
      { kind: "facebook", label: SOCIAL_LABELS.facebook, href: restaurant.facebook_url },
      { kind: "tiktok", label: SOCIAL_LABELS.tiktok, href: restaurant.tiktok_url },
      { kind: "youtube", label: SOCIAL_LABELS.youtube, href: restaurant.youtube_url },
    ] as const
  ).filter((s): s is { kind: SocialKind; label: string; href: string } => Boolean(s.href));

  // Venue imagery hierarchy (copyright-safe): (1) an approved uploaded photo
  // from our moderated media system; else (2) the official Instagram embed (its
  // own section below); else (3) the branded "Add a photo" placeholder. We never
  // scrape, hotlink, or self-host a third party's image as a hero.
  // §2 hero resolution: a real photo when we have one — the admin-set
  // hero_image_url, else an approved community photo — otherwise the atmospheric
  // style default. Instagram is NEVER the hero. Always an image; never photo-less.
  const communityHero = media.find((m) => m.kind === "image")?.url ?? null;
  const realHero =
    restaurant.hero_image_url && restaurant.hero_image_url.trim()
      ? { url: restaurant.hero_image_url, source: restaurant.hero_source ?? "atlas_licensed" }
      : communityHero
        ? { url: communityHero, source: "user_upload" as const }
        : null;
  const hero = realHero
    ? { url: realHero.url, isReal: true }
    : { url: styleHeroUrl(restaurant.style), isReal: false };

  // Paid "Featured" listing (Phase 5.1) — drives the verified badge + placement.
  const isPaidFeatured =
    Boolean(restaurant.is_premium) &&
    (!restaurant.premium_until ||
      new Date(restaurant.premium_until).getTime() > Date.now());

  // Nearby (by true distance). Miles for US/UK, kilometres elsewhere.
  const useMiles = code === "US" || code === "GB";
  const fmtDist = (km: number) => {
    if (useMiles) {
      const mi = km * 0.621371;
      return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
    }
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  };
  // Nearest approved venues, already filtered/sorted/limited in Postgres (H-1).
  const nearby = nearbyRows.map((r) => ({ r, km: r.distance_km }));

  // Data-driven venue FAQ (Fable H-4) — style + location, visible + JSON-LD.
  const venueFaqList = venueFaqs({
    name: restaurant.name,
    styleLabel:
      restaurant.style && restaurant.style !== "other" ? STYLE_LABELS[restaurant.style] : null,
    city: restaurant.city,
    country: restaurant.country,
    address: restaurant.address,
  });

  // Sign uploaded photos, then flatten to plain rows for the client roster.
  const visitorAvatars = await getPublicAvatarSignedUrls(
    visitors.map((v) => v.userId)
  );
  const visitorRows = visitors.map((v) => {
    const badge = avatarBadge(v.username ?? v.userId);
    return {
      username: v.username,
      note: v.note,
      createdAt: v.created_at,
      avatarUrl: visitorAvatars.get(v.userId) ?? null,
      initial: badge.initial,
      badgeClass: badge.className,
    };
  });

  return (
    <>
      <JsonLd
        data={[
          isTimeBased(restaurant.category) && restaurant.event_starts_at
            ? eventJsonLd(restaurant)
            : restaurantJsonLd(restaurant),
          ...(venueFaqList.length ? [faqPageJsonLd(venueFaqList)] : []),
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
      <VenueViewBeacon restaurantId={restaurant.id} />

      {/* Hero — always a good-looking, legal image (real photo or style default),
          under a warm-dark gradient for legibility. Never an Instagram embed. */}
      <section className="relative h-[52vh] min-h-[360px] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero.url}
          alt={
            hero.isReal
              ? `${restaurant.name} — ${STYLE_LABELS[restaurant.style]} barbecue in ${cityCountry}`
              : `${STYLE_LABELS[restaurant.style]} barbecue`
          }
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background" />

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
              {isPaidFeatured && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/60 bg-brand-gold/15 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.06em] text-brand-gold">
                  <Star className="h-3.5 w-3.5 fill-brand-gold" />
                  Featured · Verified owner
                </span>
              )}
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
          {(restaurant.hook || paragraphs.length > 0) && (
            <section className="mb-12">
              <h2 className="mb-1 font-heading text-2xl font-bold text-text-primary">
                {t("atlasReview")}
              </h2>
              <p className="u-eyebrow mb-5 text-text-muted">The BBQ Atlas</p>
              {restaurant.hook && (
                <p className="mb-5 font-heading text-xl italic leading-snug text-text-primary text-balance">
                  {restaurant.hook}
                </p>
              )}
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

          {restaurant.featured_video_id && (
            <FeaturedVideo
              videoId={restaurant.featured_video_id}
              title={restaurant.featured_video_title}
              channel={restaurant.featured_video_channel}
              thumb={restaurant.featured_video_thumb}
              restaurantId={restaurant.id}
            />
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

          <CommunityGallery restaurantId={restaurant.id} media={media} />

          {/* "X members have been here" — the count expands the public roster */}
          <VenueVisitors total={metrics.visited} visitors={visitorRows} />

          {/* Written, moderated reviews (no stars) */}
          <VenueReviews restaurantId={restaurant.id} venueName={restaurant.name} />


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

          {gear.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-5 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
                Recommended Gear
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {gear.map((p) => (
                  <GearProductCard
                    key={p.id}
                    product={p}
                    restaurantId={restaurant.id}
                    restaurantSlug={restaurant.slug}
                  />
                ))}
              </div>
              <AffiliateDisclosure variant="inline" className="mt-4" />
            </section>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <VenueUserActions
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            permanentlyClosed={Boolean(restaurant.permanently_closed)}
            visited={metrics.visited}
            saved={metrics.saved}
          />

          {/* Owner-only: upgrade this venue to a Featured listing (Phase 5.1). */}
          <FeaturedUpgrade restaurantId={restaurant.id} />

          {/* Owner-only: the venue performance report (Phase 5.2). */}
          <VenueReport restaurantId={restaurant.id} />

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
                    {restaurant.lat != null && restaurant.lng != null && (
                      <dd className="mt-1.5">
                        <TrackedLink
                          href={`https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`}
                          eventType="map"
                          restaurantId={restaurant.id}
                          className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-gold transition-colors hover:text-brand-gold-light"
                        >
                          Get directions
                        </TrackedLink>
                      </dd>
                    )}
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
                    <dd className="text-[0.9375rem]">
                      <TrackedLink
                        href={`tel:${restaurant.phone.replace(/[^0-9+]/g, "")}`}
                        eventType="phone"
                        restaurantId={restaurant.id}
                        className="text-text-primary transition-colors hover:text-brand-gold"
                      >
                        {restaurant.phone}
                      </TrackedLink>
                    </dd>
                  </div>
                </div>
              )}
              {hours.length > 0 && (
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-sienna" />
                  <div className="min-w-0 flex-1">
                    <dt className="u-eyebrow text-[0.6875rem] text-text-muted">
                      Hours
                    </dt>
                    <dd className="mt-1 space-y-0.5">
                      {hours.map((h) => (
                        <div
                          key={h.days}
                          className="flex justify-between gap-4 text-[0.8125rem]"
                        >
                          <span className="text-text-muted">{h.days}</span>
                          <span className="text-right text-text-primary">
                            {h.value}
                          </span>
                        </div>
                      ))}
                      <SmallHoursAside hours={restaurant.hours} />
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
                {socials.map((s) => {
                  const cls =
                    "inline-flex items-center gap-2 rounded-full border border-border-default px-3.5 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold";
                  // Instagram is the social clicks a venue actually cares about —
                  // track it (Fable C-1). Others stay plain outbound links.
                  return s.kind === "instagram" ? (
                    <TrackedLink
                      key={s.label}
                      href={s.href}
                      eventType="instagram"
                      restaurantId={restaurant.id}
                      ariaLabel={s.label}
                      title={s.label}
                      className={cls}
                    >
                      <SocialIcon kind={s.kind} className="h-4 w-4" />
                      <span>{s.label}</span>
                    </TrackedLink>
                  ) : (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      title={s.label}
                      className={cls}
                    >
                      <SocialIcon kind={s.kind} className="h-4 w-4" />
                      <span>{s.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Locator map */}
          <RestaurantLocatorMap
            lat={restaurant.lat}
            lng={restaurant.lng}
            nearby={nearby.map((n) => ({ lat: n.r.lat, lng: n.r.lng }))}
            caption={cityCountry}
            slug={restaurant.slug}
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

      {venueFaqList.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 sm:px-10">
          <HubFaq faqs={venueFaqList} heading={`${restaurant.name} — FAQ`} />
        </section>
      )}

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
