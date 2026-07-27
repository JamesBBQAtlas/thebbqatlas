import type { Restaurant, HeroSource } from "@/lib/types/database";
import { STYLE_LABELS, BBQ_STYLES, type BbqStyle } from "@/lib/constants/styles";
import { resolveHero, heroSourceLabel, REAL_HERO_SOURCES } from "@/lib/constants/hero";
import type { HubVenue } from "@/components/admin/VenueHub";

/** Style dropdown options for the admin Hero panel. */
export const STYLE_OPTIONS = BBQ_STYLES.map((s) => ({
  slug: s as string,
  label: STYLE_LABELS[s],
}));

/** Map a full venue row to the serializable shape the admin hub renders. */
export function toHubVenue(r: Restaurant): HubVenue {
  const resolved = resolveHero({
    hero_image_url: r.hero_image_url,
    hero_source: r.hero_source ?? "none",
    style: r.style,
  });
  const styleLabel = STYLE_LABELS[r.style as BbqStyle] ?? r.style;
  const hasRealPhoto = Boolean(
    r.hero_image_url &&
      r.hero_image_url.trim() &&
      REAL_HERO_SOURCES.includes((r.hero_source ?? "none") as HeroSource)
  );
  const posts = Array.isArray(r.instagram_posts) ? r.instagram_posts : [];
  return {
    id: r.id,
    name: r.name,
    location_label: r.location_label ?? null,
    city: r.city || null,
    country: r.country || null,
    status: r.status,
    style: r.style,
    styleLabel,
    enriched_at: r.enriched_at ?? null,
    needs_attention: Boolean(r.needs_attention),
    attention_reason: r.attention_reason ?? null,
    hasRealPhoto,
    heroUrl: resolved.url,
    heroSourceLabel: heroSourceLabel(resolved.source, r.style, styleLabel),
    hasIG: Boolean(r.instagram_handle || r.instagram_url),
    postsCount: posts.length,
    hasPendingCopy: Boolean(r.pending_copy),
    hook: r.hook ?? null,
    description: r.description ?? null,
    lat: r.lat,
    lng: r.lng,
  };
}
