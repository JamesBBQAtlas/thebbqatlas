import type { Restaurant, MapItemCategory } from "./database";
import type { BbqStyle } from "@/lib/constants/styles";

/**
 * Phase 8a — the public data contract.
 *
 * `PublicRestaurant` is the ONLY venue shape a public/anon client (a native app,
 * a versioned API, an unauthenticated web read) should ever receive. It mirrors
 * the `public_venues` DB view exactly — internal enrichment/ops columns
 * (dossier, pending_copy, enrichment_cost, attention_reason, contact_email,
 * outreach_*, hero_exif, duplicate_*, owner/claim ids, status, …) are absent by
 * construction, so they cannot leak under a mobile anon key.
 *
 * When adding a field: add the column to `public_venues` (migration), add it to
 * `PUBLIC_VENUE_COLUMNS`, then add it here. Keep all three in lockstep.
 */
export interface PublicRestaurant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  hook: string | null;
  style: BbqStyle;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  website: string | null;
  price_level: number | null;
  avg_rating: number | null;
  review_count: number | null;
  hero_image_url: string | null;
  hero_source: string | null;
  hero_photo_credit: string | null;
  is_featured: boolean;
  is_premium: boolean | null;
  premium_tier: string | null;
  category: MapItemCategory | null;
  permanently_closed: boolean | null;
  phone: string | null;
  hours: Record<string, string> | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  alcohol: string | null;
  offerings: string[] | null;
  instagram_url: string | null;
  instagram_handle: string | null;
  instagram_posts: string[] | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  brand_id: string | null;
  location_label: string | null;
  enriched_at: string | null;
  featured_video_id: string | null;
  featured_video_title: string | null;
  featured_video_channel: string | null;
  featured_video_thumb: string | null;
  created_at: string;
}

/**
 * The exact public column list, as a Supabase `.select()` string. Use this
 * (never `*`) whenever reading venues on a path that anon/mobile can reach.
 */
export const PUBLIC_VENUE_COLUMNS =
  "id, slug, name, description, hook, style, lat, lng, address, city, country, country_code, website, price_level, avg_rating, review_count, hero_image_url, hero_source, hero_photo_credit, is_featured, is_premium, premium_tier, category, permanently_closed, phone, hours, event_starts_at, event_ends_at, alcohol, offerings, instagram_url, instagram_handle, instagram_posts, x_url, facebook_url, tiktok_url, youtube_url, brand_id, location_label, enriched_at, featured_video_id, featured_video_title, featured_video_channel, featured_video_thumb, created_at";

/**
 * Project a full internal `Restaurant` down to the public contract. Use on the
 * server when you already have a `Restaurant` (e.g. from an admin/service read)
 * but are about to hand it to a public surface.
 */
export function toPublicRestaurant(r: Restaurant): PublicRestaurant {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    hook: r.hook ?? null,
    style: r.style,
    lat: r.lat,
    lng: r.lng,
    address: r.address ?? null,
    city: r.city ?? null,
    country: r.country ?? null,
    country_code: r.country_code ?? null,
    website: r.website ?? null,
    price_level: r.price_level ?? null,
    avg_rating: r.avg_rating ?? null,
    review_count: r.review_count ?? null,
    hero_image_url: r.hero_image_url ?? null,
    hero_source: r.hero_source ?? null,
    hero_photo_credit: (r as { hero_photo_credit?: string | null }).hero_photo_credit ?? null,
    is_featured: Boolean(r.is_featured),
    is_premium: (r as { is_premium?: boolean | null }).is_premium ?? null,
    premium_tier: (r as { premium_tier?: string | null }).premium_tier ?? null,
    category: r.category ?? null,
    permanently_closed: r.permanently_closed ?? null,
    phone: r.phone ?? null,
    hours: r.hours ?? null,
    event_starts_at: r.event_starts_at ?? null,
    event_ends_at: r.event_ends_at ?? null,
    alcohol: r.alcohol ?? null,
    offerings: r.offerings ?? null,
    instagram_url: r.instagram_url ?? null,
    instagram_handle: r.instagram_handle ?? null,
    instagram_posts: r.instagram_posts ?? null,
    x_url: r.x_url ?? null,
    facebook_url: r.facebook_url ?? null,
    tiktok_url: r.tiktok_url ?? null,
    youtube_url: r.youtube_url ?? null,
    brand_id: r.brand_id ?? null,
    location_label: r.location_label ?? null,
    enriched_at: r.enriched_at ?? null,
    featured_video_id: r.featured_video_id ?? null,
    featured_video_title: r.featured_video_title ?? null,
    featured_video_channel: r.featured_video_channel ?? null,
    featured_video_thumb: r.featured_video_thumb ?? null,
    created_at: r.created_at,
  };
}
