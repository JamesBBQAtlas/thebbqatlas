import type { Guide, NewsPost, Restaurant } from "@/lib/types/database";
import { STYLE_LABELS } from "@/lib/constants/styles";
import {
  groupOfferings,
  OFFERING_CATEGORY_LABELS,
} from "@/lib/constants/offerings";
import { resolveCountryCode } from "@/lib/constants/countries";
import { safeVenueImage } from "@/lib/restaurants/image";
import { SITE, absoluteUrl } from "./site";

/**
 * JSON-LD builders. Each returns a plain object; keys set to `undefined` are
 * dropped automatically by JSON.stringify, so callers don't need to prune.
 *
 * Deliberately NO `aggregateRating` on restaurants — The BBQ Atlas celebrates
 * rather than ranks, so we don't emit star ratings into search results.
 */

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    logo: {
      "@type": "ImageObject",
      url: SITE.logo,
    },
    ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    inLanguage: "en-US",
    publisher: { "@id": ORG_ID },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

export function restaurantJsonLd(r: Restaurant) {
  const url = absoluteUrl(`/restaurants/${r.slug}`);
  const code = resolveCountryCode(r.country_code, r.country);
  const menu = groupOfferings(r.offerings);

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${url}#restaurant`,
    name: r.name,
    description: r.description || undefined,
    url,
    // Copyright-safe: only approved (non-stock) media; else the branded default.
    image: safeVenueImage(r.hero_image_url) || SITE.logo,
    servesCuisine: [`${STYLE_LABELS[r.style]} Barbecue`, "Barbecue"],
    priceRange: r.price_level ? "$".repeat(r.price_level) : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: r.address || undefined,
      addressLocality: r.city || undefined,
      addressCountry: code || r.country || undefined,
    },
    geo:
      Number.isFinite(r.lat) && Number.isFinite(r.lng)
        ? {
            "@type": "GeoCoordinates",
            latitude: r.lat,
            longitude: r.lng,
          }
        : undefined,
    hasMenu: menu.length
      ? {
          "@type": "Menu",
          hasMenuSection: menu.map((group) => ({
            "@type": "MenuSection",
            name: OFFERING_CATEGORY_LABELS[group.category],
            hasMenuItem: group.items.map((item) => ({
              "@type": "MenuItem",
              name: item.label,
            })),
          })),
        }
      : undefined,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function eventJsonLd(r: Restaurant) {
  const url = absoluteUrl(`/restaurants/${r.slug}`);
  const code = resolveCountryCode(r.country_code, r.country);
  return {
    "@context": "https://schema.org",
    "@type": r.category === "festival" ? "Festival" : "Event",
    name: r.name,
    description: r.description || undefined,
    image: safeVenueImage(r.hero_image_url) || SITE.logo,
    startDate: r.event_starts_at || undefined,
    endDate: r.event_ends_at || undefined,
    eventStatus: r.permanently_closed
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    url,
    location: {
      "@type": "Place",
      name: r.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: r.address || undefined,
        addressLocality: r.city || undefined,
        addressCountry: code || r.country || undefined,
      },
      geo:
        Number.isFinite(r.lat) && Number.isFinite(r.lng)
          ? { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng }
          : undefined,
    },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function articleJsonLd(guide: Guide) {
  const url = absoluteUrl(`/guides/${guide.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: guide.title,
    description: guide.excerpt || undefined,
    image: safeVenueImage(guide.hero_image_url) || SITE.logo,
    datePublished: guide.published_at || guide.created_at || undefined,
    dateModified: guide.published_at || guide.created_at || undefined,
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: url,
    url,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** An ItemList of venues — helps search + AI engines read a hub as a ranked set. */
export function itemListJsonLd(
  name: string,
  items: { name: string; path: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absoluteUrl(it.path),
    })),
  };
}

/** A CollectionPage wrapper for hub/landing pages. */
export function collectionPageJsonLd(name: string, description: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function newsJsonLd(post: NewsPost) {
  const url = absoluteUrl(`/news/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": post.category === "news" ? "NewsArticle" : "OpinionNewsArticle",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.excerpt || undefined,
    image: safeVenueImage(post.hero_image_url) || SITE.logo,
    datePublished: post.published_at || post.created_at || undefined,
    dateModified: post.published_at || post.created_at || undefined,
    author: post.author
      ? { "@type": "Organization", name: post.author, url: SITE.url }
      : { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: url,
    url,
    isPartOf: { "@id": WEBSITE_ID },
  };
}
