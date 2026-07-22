/**
 * Copyright-safe venue imagery.
 *
 * The Atlas does NOT scrape or self-host a venue's photos. A venue's imagery is
 * its official Instagram embed (see InstagramEmbed) when post permalinks exist,
 * and the branded HeroPlaceholder otherwise. Seed data currently carries generic
 * Unsplash stock URLs — those are neither the venue's real photos nor part of the
 * strategy (and are hotlink-blocked in production), so we treat them as "no image"
 * and fall back to the branded placeholder.
 */
export function safeVenueImage(url?: string | null): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  // Reject stock/placeholder sources we must not present as a venue's own photo.
  if (/(^|\.)unsplash\.com/i.test(u) || u.includes("images.unsplash.com")) {
    return null;
  }
  return u;
}
