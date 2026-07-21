import type { Restaurant } from "@/lib/types/database";
import { resolveCountryCode, countryName } from "@/lib/constants/countries";

/**
 * Programmatic-SEO hub helpers. As venues are added, style and location hub
 * pages appear automatically — the search footprint grows on its own. All
 * grouping is derived from real, approved venues (no invented pages).
 */

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface CountryGroup {
  slug: string;
  name: string;
  code: string | null;
  venues: Restaurant[];
}

export interface CityGroup {
  slug: string;
  name: string;
  venues: Restaurant[];
}

/** Group approved venues by country (slug → group). */
export function groupByCountry(restaurants: Restaurant[]): Map<string, CountryGroup> {
  const map = new Map<string, CountryGroup>();
  for (const r of restaurants) {
    if (!r.country) continue;
    const slug = slugify(r.country);
    if (!slug) continue;
    const code = resolveCountryCode(r.country_code, r.country);
    let g = map.get(slug);
    if (!g) {
      g = { slug, name: countryName(code, r.country), code, venues: [] };
      map.set(slug, g);
    }
    g.venues.push(r);
  }
  return map;
}

/** Group a country's venues by city. */
export function groupByCity(venues: Restaurant[]): Map<string, CityGroup> {
  const map = new Map<string, CityGroup>();
  for (const r of venues) {
    if (!r.city) continue;
    const slug = slugify(r.city);
    if (!slug) continue;
    let g = map.get(slug);
    if (!g) {
      g = { slug, name: r.city, venues: [] };
      map.set(slug, g);
    }
    g.venues.push(r);
  }
  return map;
}

export function findCountry(
  restaurants: Restaurant[],
  countrySlug: string
): CountryGroup | null {
  return groupByCountry(restaurants).get(countrySlug) ?? null;
}

export function findCity(
  country: CountryGroup,
  citySlug: string
): CityGroup | null {
  return groupByCity(country.venues).get(citySlug) ?? null;
}
