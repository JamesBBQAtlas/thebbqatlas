import type { Restaurant } from "@/lib/types/database";
import { STYLE_LABELS, BBQ_STYLES, type BbqStyle } from "@/lib/constants/styles";
import { parseStoredFaq } from "@/lib/seo/venue-faq";
import { resolveHero, heroSourceLabel, isRealPhoto } from "@/lib/constants/hero";
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
  const hasRealPhoto = isRealPhoto(r);
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
    category: (r.category as string | null) ?? null,
    manualCategory: Boolean((r as { manual_category?: boolean }).manual_category),
    enriched_at: r.enriched_at ?? null,
    needs_attention: Boolean(r.needs_attention),
    attention_reason: r.attention_reason ?? null,
    hasRealPhoto,
    heroUrl: resolved.url,
    heroSourceLabel: heroSourceLabel(resolved.source, r.style, styleLabel),
    hasIG: Boolean(r.instagram_handle || r.instagram_url),
    postsCount: posts.length,
    hasPending: Boolean(r.pending_changes),
    pending: (r.pending_changes as Record<string, unknown> | null) ?? null,
    fields: {
      name: r.name,
      location_label: r.location_label ?? null,
      hook: r.hook ?? null,
      description: r.description ?? null,
      style: r.style,
      category: (r.category as string | null) ?? null,
      // Part G — operator-editable FAQ entries (auto-generated FAQ is computed at
      // render, not stored here).
      faq: parseStoredFaq((r as { faq?: unknown }).faq),
      address: r.address ?? null,
      phone: r.phone ?? null,
      website: r.website ?? null,
      instagram_handle: r.instagram_handle ?? null,
      instagram_url: r.instagram_url ?? null,
      hours: r.hours ?? null,
      price_level: r.price_level ?? null,
      x_url: r.x_url ?? null,
      facebook_url: r.facebook_url ?? null,
      tiktok_url: r.tiktok_url ?? null,
      youtube_url: r.youtube_url ?? null,
      country: r.country || null,
      city: r.city || null,
      permanently_closed: Boolean(r.permanently_closed),
      offerings: Array.isArray(r.offerings) ? r.offerings : [],
      featured_video_id: r.featured_video_id ?? null,
      featured_video_title: r.featured_video_title ?? null,
      featured_video_channel: r.featured_video_channel ?? null,
      featured_video_thumb: r.featured_video_thumb ?? null,
    },
    hook: r.hook ?? null,
    description: r.description ?? null,
    cost: Number(r.enrichment_cost ?? 0) || 0,
    // The MOST RECENT run's cost (from the breakdown), shown separately from the
    // accumulated total so a re-enriched venue's $0.04 total doesn't read as a
    // per-run ceiling breach.
    lastRunCost: (() => {
      const bd = (r.enrichment_cost_breakdown ?? {}) as Record<string, unknown>;
      return (Number(bd.grok_cost) || 0) + (Number(bd.claude_cost) || 0);
    })(),
    chainSeed: Boolean(r.chain_parent_id),
    chainParentId: r.chain_parent_id ?? null,
    // The parent a held (footprint/off-brand) row would attach to if confirmed —
    // powers the one-click "Confirm branch" (niggle v2 #4).
    chainParentHint: (r as { chain_parent_hint?: string | null }).chain_parent_hint ?? null,
    // Parent-of-a-chain flag (for the "part of a chain" preview note); siblings
    // are chainSeed, not isChainParent.
    isChainParent: !r.chain_parent_id && Boolean((r.dossier as { is_chain?: boolean } | null)?.is_chain),
    chainRostered: Boolean(r.chain_rostered_at),
    flagshipUnset: Boolean((r as { flagship_unset?: boolean }).flagship_unset),
    chainCandidate: Boolean((r as { chain_candidate?: boolean }).chain_candidate),
    isFeatured: Boolean(r.is_featured),
    permanentlyClosed: Boolean(r.permanently_closed),
    manualCopy: Boolean((r as { manual_copy?: boolean }).manual_copy),
    lat: r.lat,
    lng: r.lng,
    // geocode-fix — pin quality, so admin shows Confirmed / Approximate / Missing
    // and a locked (hand-placed) pin is visibly protected from re-geocoding.
    geoPrecision: ((r as { geo_precision?: string | null }).geo_precision) ?? null,
    geoConfidence:
      typeof (r as { geo_confidence?: number | null }).geo_confidence === "number"
        ? ((r as { geo_confidence?: number | null }).geo_confidence as number)
        : null,
    geoLocked: Boolean((r as { geo_locked?: boolean }).geo_locked),
    geoSource: ((r as { geo_source?: string | null }).geo_source) ?? null,
  };
}
