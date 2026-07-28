import type { BbqStyle } from "@/lib/constants/styles";
import type { HeroSource } from "@/lib/types/database";

/**
 * Style-default hero images (VENUE-SYSTEM-SPEC §7). Real, licensed atmospheric
 * photos we host, mapped from a venue's `style`. They are the FLOOR: a venue is
 * never photo-less on screen — a real photo when we have one, a style-appropriate
 * atmospheric image until then. Files live in /public/heroes (web-compressed).
 */
export const GENERIC_HERO = "hero-generic.jpg";

const STYLE_HERO: Partial<Record<BbqStyle, string>> = {
  texas: "hero-central-texas.jpg",
  carolina: "hero-carolina.jpg",
  "kansas-city": "hero-kansas-city.jpg",
  memphis: "hero-memphis.jpg",
  alabama: "hero-deep-south.jpg",
  korean: "hero-korean-bbq.jpg",
  yakiniku: "hero-japanese.jpg",
  asado: "hero-asado.jpg",
  churrasco: "hero-asado.jpg",
  mexican: "hero-barbacoa.jpg",
  braai: "hero-braai.jpg",
  "nyama-choma": "hero-braai.jpg",
  mangal: "hero-generic.jpg",
  modern: "hero-uk-smokehouse.jpg",
  other: "hero-generic.jpg",
};

export function styleHeroFile(style?: string | null): string {
  return (style && STYLE_HERO[style as BbqStyle]) || GENERIC_HERO;
}
export function styleHeroUrl(style?: string | null): string {
  return `/heroes/${styleHeroFile(style)}`;
}

/** hero_source values that mean "a real photo we may display". */
export const REAL_HERO_SOURCES: HeroSource[] = [
  "user_upload",
  "venue_provided",
  "atlas_licensed",
];

/**
 * The single definition of "has a real photo" — a stored image whose source is
 * one of the real sources. Used by every metric so they can't disagree.
 */
export function isRealPhoto(row: {
  hero_image_url?: string | null;
  hero_source?: HeroSource | string | null;
}): boolean {
  return Boolean(
    row.hero_image_url &&
      row.hero_image_url.trim() &&
      REAL_HERO_SOURCES.includes((row.hero_source ?? "none") as HeroSource)
  );
}

export interface ResolvedHero {
  url: string;
  source: HeroSource;
  isReal: boolean;
}

/**
 * §2 hero resolution — first match wins:
 *   1. real photo  (hero_image_url set AND hero_source is a real source)
 *   2. style default (atmospheric image for the venue's style)
 *   3. generic default (unknown style)
 * Always returns a good-looking, legal image.
 */
export function resolveHero(row: {
  hero_image_url?: string | null;
  hero_source?: HeroSource | string | null;
  style?: string | null;
}): ResolvedHero {
  const src = (row.hero_source ?? "none") as HeroSource;
  if (
    row.hero_image_url &&
    row.hero_image_url.trim() &&
    REAL_HERO_SOURCES.includes(src)
  ) {
    return { url: row.hero_image_url, source: src, isReal: true };
  }
  return { url: styleHeroUrl(row.style), source: "style_default", isReal: false };
}

/** Human badge for the admin Hero panel. */
export function heroSourceLabel(
  source: HeroSource,
  style?: string | null,
  styleLabel?: string
): string {
  switch (source) {
    case "user_upload":
      return "User photo";
    case "venue_provided":
      return "From venue";
    case "atlas_licensed":
      return "Uploaded photo";
    default:
      return `Style default${styleLabel ? ` — ${styleLabel}` : style ? ` — ${style}` : ""}`;
  }
}
