/**
 * Server-side geocoding via MapTiler's Geocoding API — the SAME provider (and
 * the same key) as our basemap, so results are ours to STORE permanently (unlike
 * Google, whose terms forbid persisting geocoded addresses/coordinates for a
 * directory like this). We were previously on OpenStreetMap Nominatim; this
 * moves address→coordinates onto MapTiler so we stay single-provider and within
 * a store-permitted licence.
 *
 * Robustness rules baked in here:
 *   • query in English/romanised text (callers pass English address + city +
 *     country) with `language=en` so non-Latin venues resolve and return English
 *     place names;
 *   • a `name` fallback — if the street address won't resolve, try
 *     name + city + country (a well-known venue often geocodes by name);
 *   • NEVER return (0,0) or a non-finite point — a bad geocode returns null so
 *     the caller flags it instead of pinning a venue in the ocean.
 */

// The basemap key is public (NEXT_PUBLIC_) and works server-side too; a server-
// only MAPTILER_KEY overrides it if set. Geocoding draws from the same MapTiler
// request quota as the basemap.
const MAPTILER_KEY =
  process.env.MAPTILER_KEY ?? process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
const MAPTILER_GEOCODE = "https://api.maptiler.com/geocoding";

export interface GeoResult {
  lat: number;
  lng: number;
  country_code: string | null;
  city: string | null;
  country: string | null;
}

/** Real, usable coordinates — not non-finite and not the (0,0) placeholder. */
function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

interface MtContext {
  id?: string;
  text?: string;
  text_en?: string;
  country_code?: string;
}
interface MtFeature {
  center?: [number, number];
  place_type?: string[];
  text?: string;
  text_en?: string;
  context?: MtContext[];
  properties?: { country_code?: string } & Record<string, unknown>;
}

const enText = (c: MtContext | MtFeature): string | null =>
  (c.text_en as string) || (c.text as string) || null;

/** Run one MapTiler geocoding query; null on any miss / invalid point / (0,0). */
async function queryMapTiler(q: string): Promise<GeoResult | null> {
  if (!MAPTILER_KEY || !q.trim()) return null;
  try {
    const url =
      `${MAPTILER_GEOCODE}/${encodeURIComponent(q.trim())}.json` +
      `?key=${MAPTILER_KEY}&limit=1&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: MtFeature[] };
    const top = data.features?.[0];
    if (!top || !Array.isArray(top.center) || top.center.length < 2) return null;
    const lng = Number(top.center[0]);
    const lat = Number(top.center[1]);
    if (!validCoord(lat, lng)) return null;

    // Walk the feature + its context for the country (name + ISO code) and the
    // best city-level label. With language=en the `text` fields are English.
    const ctx = Array.isArray(top.context) ? top.context : [];
    const feats = [top, ...ctx];
    let country: string | null = null;
    let country_code: string | null =
      top.properties?.country_code ? String(top.properties.country_code).toUpperCase() : null;
    for (const c of feats) {
      const id = String((c as MtContext).id ?? "");
      if (id.startsWith("country")) {
        country = country ?? enText(c);
        const cc = (c as MtContext).country_code;
        if (!country_code && cc) country_code = String(cc).toUpperCase();
      }
    }

    // City = the MUNICIPALITY / place level, NEVER neighbourhood/suburb/subregion.
    // MapTiler returns a "super-neighbourhood" or civic-association label at the
    // neighbourhood level ("Washington Avenue Coalition / Memorial Park") — taking
    // that as the city corrupts the town (bug: the real city, Houston, sits at the
    // municipality/place level). Prefer the town-bearing levels, in priority order.
    const CITY_LEVELS = ["municipality", "municipal_district", "joint_municipality", "place", "locality"];
    let city: string | null = null;
    for (const level of CITY_LEVELS) {
      for (const c of feats) {
        if (String((c as MtContext).id ?? "").startsWith(level)) {
          city = enText(c);
          break;
        }
      }
      if (city) break;
    }
    return { lat, lng, country_code, city, country };
  } catch {
    return null;
  }
}

/**
 * Geocode a venue to real coordinates. Tries the full English address first,
 * then falls back to `name + city + country` (a named venue often resolves when
 * a messy street line doesn't). Returns null — never (0,0) — when nothing
 * resolves, so callers treat it as a failure and flag rather than publish.
 */
export async function geocodeAddress(parts: {
  address?: string | null;
  city?: string | null;
  country?: string | null;
  /** Venue name, used only as a last-resort query when the address won't resolve. */
  name?: string | null;
}): Promise<GeoResult | null> {
  const join = (xs: (string | null | undefined)[]) =>
    xs.filter((s) => s && String(s).trim()).join(", ");

  const primary = join([parts.address, parts.city, parts.country]);
  const byName = join([parts.name, parts.city, parts.country]);

  // Try, in order: full address → name+city+country → city+country alone.
  const queries = [primary, byName, join([parts.city, parts.country])].filter(
    (q, i, a) => q && a.indexOf(q) === i
  );
  for (const q of queries) {
    const hit = await queryMapTiler(q);
    if (hit) return hit;
  }
  return null;
}
