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
 *     name + city + country (a well-known venue often geocodes by name / POI);
 *   • PRECISION GATE (Part 3) — MapTiler tells us the granularity of each hit in
 *     `place_type` (poi / address / street vs place / municipality / region /
 *     postal_code / country). A street query that only resolves to a TOWN centroid
 *     comes back tagged `place`/`municipality`, not `address` — accepting it would
 *     silently pin a rural highway venue in the middle of the nearest town (the
 *     "7501 MS-57 → centre of Ocean Springs" bug). We now classify every hit and
 *     let precise-seeking callers (`geocodePrecise`) reject a coarse-only result
 *     and flag it for manual placement instead;
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
  /** MapTiler's primary granularity for this hit (e.g. "address", "poi", "place"). */
  place_type: string | null;
  /**
   * True when the hit is street/address/POI-level — a real venue location.
   * False when the best MapTiler could do is a town/city/region/postcode/country
   * CENTROID. Precise-seeking callers must NOT pin a `precise: false` result.
   */
  precise: boolean;
}

/**
 * MapTiler `place_type` values that represent a genuine on-the-ground location
 * rather than an administrative-area centroid. Everything else — `place`
 * (town/city), `municipality`, `locality`, `neighbourhood`, `region`,
 * `postal_code`, `country`, `continent` — is a coarse centroid.
 */
const PRECISE_PLACE_TYPES = new Set(["poi", "address", "street"]);

/** Classify a hit's granularity from its MapTiler `place_type` array. */
export function classifyPrecision(pt?: string[] | null): {
  place_type: string | null;
  precise: boolean;
} {
  const types = Array.isArray(pt) ? pt.map((t) => String(t).toLowerCase()) : [];
  return {
    place_type: types[0] ?? null,
    precise: types.some((t) => PRECISE_PLACE_TYPES.has(t)),
  };
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

    const { place_type, precise } = classifyPrecision(top.place_type);
    return { lat, lng, country_code, city, country, place_type, precise };
  } catch {
    return null;
  }
}

const join = (xs: (string | null | undefined)[]) =>
  xs.filter((s) => s && String(s).trim()).join(", ");

/** The query ladder: full address → name+city+country (POI) → city+country. */
function buildQueries(parts: {
  address?: string | null;
  city?: string | null;
  country?: string | null;
  name?: string | null;
}): string[] {
  const primary = join([parts.address, parts.city, parts.country]);
  const byName = join([parts.name, parts.city, parts.country]);
  const cityOnly = join([parts.city, parts.country]);
  return [primary, byName, cityOnly].filter((q, i, a) => q && a.indexOf(q) === i);
}

/**
 * Pure resolution core (dependency-injected `run` so it's unit-testable without
 * hitting the network). Walks the query ladder and returns the FIRST precise
 * hit; if none of the queries produce a street/POI-level result it returns the
 * best coarse (centroid) hit it saw so the caller can decide what to do with it.
 */
export async function resolveGeocode(
  queries: string[],
  run: (q: string) => Promise<GeoResult | null>
): Promise<{ result: GeoResult | null; coarse: GeoResult | null }> {
  let firstCoarse: GeoResult | null = null;
  for (const q of queries) {
    const hit = await run(q);
    if (!hit) continue;
    if (hit.precise) return { result: hit, coarse: null };
    if (!firstCoarse) firstCoarse = hit;
  }
  return { result: null, coarse: firstCoarse };
}

/**
 * Geocode a venue to real coordinates. Tries the full English address first,
 * then falls back to `name + city + country` (a named venue often resolves to a
 * POI when a messy street line doesn't), then city+country.
 *
 * By default (legacy behaviour) this PREFERS a precise street/POI hit but will
 * fall back to a coarse town centroid rather than return nothing — existing
 * operator-driven callers (manual add, edit, verify-pin) rely on getting *a*
 * point back. Pass `{ requirePrecise: true }` (or use `geocodePrecise`) to make
 * a coarse-only result return null so the caller flags it for manual placement.
 * Returns null — never (0,0) — when nothing usable resolves.
 */
export async function geocodeAddress(
  parts: {
    address?: string | null;
    city?: string | null;
    country?: string | null;
    /** Venue name, used as a POI query when the address won't resolve. */
    name?: string | null;
  },
  opts?: { requirePrecise?: boolean }
): Promise<GeoResult | null> {
  const { result, coarse } = await resolveGeocode(buildQueries(parts), queryMapTiler);
  if (result) return result;
  if (opts?.requirePrecise) return null;
  return coarse;
}

/**
 * Precision-first geocode for enrichment and chain rostering (Part 3).
 * Returns `{ result }` set ONLY when a street/POI-level pin was found. When the
 * address only resolves to a town/city/region centroid, `result` is null and
 * `coarse` carries that centroid (for context/logging) — the caller must leave
 * the pin UNSET and flag `needs_attention` ("geocode: town-level only — verify
 * pin") rather than dropping the venue in the middle of a town. `status`:
 *   • "precise"      — a real street/POI pin (use it)
 *   • "coarse_only"  — only a town-level centroid was found (do NOT pin; flag)
 *   • "not_found"    — nothing resolved at all (do NOT pin; flag)
 */
export async function geocodePrecise(parts: {
  address?: string | null;
  city?: string | null;
  country?: string | null;
  name?: string | null;
}): Promise<{
  result: GeoResult | null;
  coarse: GeoResult | null;
  status: "precise" | "coarse_only" | "not_found";
}> {
  const { result, coarse } = await resolveGeocode(buildQueries(parts), queryMapTiler);
  if (result) return { result, coarse: null, status: "precise" };
  if (coarse) return { result: null, coarse, status: "coarse_only" };
  return { result: null, coarse: null, status: "not_found" };
}

/** Reason string for a non-precise geocode outcome, for `attention_reason`. */
export const GEOCODE_COARSE_REASON = "geocode: town-level only — verify pin";
export const GEOCODE_NONE_REASON = "no street address resolved";
