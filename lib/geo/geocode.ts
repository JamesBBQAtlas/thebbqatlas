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

/**
 * VERY coarse granularities that must NEVER be planted as a venue pin, not even
 * in the legacy accept-coarse path — a country / region / continent / postcode
 * centroid is meaningless as a location (this is the "address-less parent pinned
 * to the geographic centre of the USA" bug, FAIL 4). Town/place/locality-level
 * remains a legacy-acceptable coarse hit; anything coarser than a town is dropped.
 */
const TOO_COARSE_PLACE_TYPES = new Set([
  "country",
  "region",
  "state",
  "province",
  "continent",
  "postal_code",
  "postcode",
]);

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

/**
 * Known PLACEHOLDER coordinates that are not real venue pins — the (0,0) null
 * island, and country-centroid points a geocoder returns for an address-less
 * query (e.g. the US centroid an address-less parent got stamped with). These
 * must be treated as "no pin", never corroborated by the backfill or trusted by
 * the map. Add more national centroids here as they surface.
 */
const SENTINEL_CENTROIDS: ReadonlyArray<readonly [number, number]> = [
  [39.7837305527552, -100.445882119238], // MapTiler US country centroid
];
export function isSentinelPin(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return true;
  return SENTINEL_CENTROIDS.some(([cLat, cLng]) => Math.abs(lat - cLat) < 0.01 && Math.abs(lng - cLng) < 0.01);
}

/** A real, storable pin — finite, not (0,0), not a national-centroid sentinel. */
export function hasRealPoint(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    !isSentinelPin(lat, lng)
  );
}

/** The pin-quality trio that must never outlive its coordinates. */
export interface GeoConfidenceFields {
  geo_precision: string | null;
  geo_confidence: number | null;
  geo_source: string | null;
}

/**
 * GEO HONESTY INVARIANT — confidence/precision/source are only meaningful WITH a
 * real pin. Given the coordinates and the pin-quality trio, return the trio as-is
 * when the point is real, or ALL-NULL when it isn't. So no row can carry a stamped
 * confidence for a coordinate that doesn't exist (the Home Team phantom:
 * geo_confidence 0.9 with lat/lng NULL). Apply this at EVERY geo write so the pair
 * is always co-set — coordinates and confidence together, or both null.
 */
export function coherentGeoConfidence(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fields: Partial<GeoConfidenceFields> | null | undefined
): GeoConfidenceFields {
  if (!hasRealPoint(lat, lng)) {
    return { geo_precision: null, geo_confidence: null, geo_source: null };
  }
  return {
    geo_precision: fields?.geo_precision ?? null,
    geo_confidence: typeof fields?.geo_confidence === "number" ? fields.geo_confidence : null,
    geo_source: fields?.geo_source ?? null,
  };
}

/**
 * FLAGSHIP LOCATION GUARD (roster provenance): a flagship must be a real, located
 * place. Refuse to seed one when BOTH there is no street address AND the only
 * geocode resolved to a country that DISAGREES with the brand's declared country
 * — a bare IG-handle geocode that lands a US brand in Myanmar is not a location.
 * A flagship WITH a street, or one whose pin is in the right country, is fine.
 */
export function flagshipUnlocatable(opts: {
  hasStreet: boolean;
  declaredCountryCode: string | null | undefined;
  geoCountryCode: string | null | undefined;
}): boolean {
  if (opts.hasStreet) return false;
  return Boolean(
    opts.declaredCountryCode &&
      opts.geoCountryCode &&
      opts.declaredCountryCode.toUpperCase() !== opts.geoCountryCode.toUpperCase()
  );
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

/** Run one MapTiler geocoding query; null on any miss / invalid point / (0,0).
 *  A `countryCode` (ISO-2) constrains the search to that country — a country
 *  filter alone kills most cross-town / cross-country mismatches (geocode-fix). */
async function queryMapTiler(q: string, countryCode?: string | null): Promise<GeoResult | null> {
  if (!MAPTILER_KEY || !q.trim()) return null;
  try {
    const cc = (countryCode ?? "").trim().toLowerCase();
    const url =
      `${MAPTILER_GEOCODE}/${encodeURIComponent(q.trim())}.json` +
      `?key=${MAPTILER_KEY}&limit=1&language=en` +
      (cc && /^[a-z]{2}$/.test(cc) ? `&country=${cc}` : "");
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
export function isTooCoarse(place_type: string | null): boolean {
  return place_type != null && TOO_COARSE_PLACE_TYPES.has(place_type);
}

export async function resolveGeocode(
  queries: string[],
  run: (q: string) => Promise<GeoResult | null>
): Promise<{ result: GeoResult | null; coarse: GeoResult | null }> {
  let firstCoarse: GeoResult | null = null;
  for (const q of queries) {
    const hit = await run(q);
    if (!hit) continue;
    // A country/region/postcode centroid is never a usable venue pin — drop it
    // entirely, even for legacy callers (FAIL 4: no more US-centre pins).
    if (isTooCoarse(hit.place_type)) continue;
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
export const GEOCODE_INCOMPLETE_REASON = "incomplete address — add a street/postcode";
export const GEOCODE_LOWCONF_REASON = "geocode low-confidence — verify pin";
/** A postcode-area pin was placed (right area, not the exact door) — verify it. */
export const GEOCODE_APPROX_REASON = "geocode: postcode-area pin — verify the exact spot";

// ── geocode-fix: postcode-first anchoring + confidence gate ──────────────────
import { resolveCountryCode } from "@/lib/constants/countries";
import { haversineKm } from "@/lib/utils/geo";

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
/** Same shape, but findable ANYWHERE in a freeform address string. */
const UK_POSTCODE_INLINE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/** Pull a UK postcode out of a freeform address line, or null. */
export function extractUKPostcode(address: string | null | undefined): string | null {
  const m = (address ?? "").match(UK_POSTCODE_INLINE);
  return m ? m[0].toUpperCase().replace(/\s+/g, " ").trim() : null;
}

export interface PostcodeAnchor {
  lat: number;
  lng: number;
  city: string | null;
  source: string;
}

/**
 * Resolve a postcode to a PRECISE anchor point. The UK routes to postcodes.io —
 * free, official ONS data, near-exact — which alone makes the "NW1 0TH →
 * Carshalton" class of error impossible. Other countries return null here and
 * the caller relies on the country-constrained geocoder. A small seam so more
 * national postcode sources can be added later without touching callers.
 */
export async function postcodeAnchor(
  countryCode: string | null,
  postcode: string | null | undefined
): Promise<PostcodeAnchor | null> {
  const pc = (postcode ?? "").trim();
  if (!pc) return null;
  const cc = (countryCode ?? "").toUpperCase();
  const looksUK = UK_POSTCODE.test(pc);
  if ((cc === "GB" || cc === "UK" || (!cc && looksUK)) && looksUK) {
    try {
      const res = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(pc.replace(/\s+/g, ""))}`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        result?: { latitude?: number; longitude?: number; admin_district?: string; parish?: string; admin_ward?: string };
      };
      const r = data.result;
      if (r && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) {
        return {
          lat: r.latitude as number,
          lng: r.longitude as number,
          city: r.admin_district ?? r.parish ?? r.admin_ward ?? null,
          source: "postcodes.io",
        };
      }
    } catch {
      /* fall through to the geocoder */
    }
  }
  return null;
}

export type GeoPrecision = "poi" | "address" | "street" | "postcode" | "place" | "region" | "country" | "none";
export type GeoStatus = "confident" | "approximate" | "flagged";

export interface StructuredGeo {
  /** The pin to store, or null when we must NOT place a speculative pin. */
  result: GeoResult | null;
  precision: GeoPrecision;
  confidence: number; // 0..1
  source: string | null; // "postcodes.io" | "maptiler"
  status: GeoStatus;
  reason: string | null; // set when flagged
}

/** A full-address hit must fall within this of the postcode anchor to be trusted. */
const ANCHOR_VALIDATE_KM = 8;

export interface StructuredParts {
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  name?: string | null;
}

/**
 * PURE decision core (no network) — given the resolved postcode `anchor`, the
 * country-constrained geocoder `hit`, and the ISO country, decide the pin to
 * store and how confident we are. Kept separate from `geocodeStructured` so the
 * whole confidence gate is unit-testable without touching MapTiler / postcodes.io.
 *
 * The gate, in order:
 *   (1) accept the full-address hit ONLY if it's precise, in the stated country,
 *       AND within `ANCHOR_VALIDATE_KM` of the postcode anchor (the Rack City
 *       guard — a precise hit in the wrong town is rejected, never trusted);
 *   (2) else the postcode anchor itself is a correct-area pin (postcode-level);
 *   (3) else place NO pin and flag with a specific reason (incomplete vs weak).
 */
export function decideStructuredGeo(
  parts: StructuredParts,
  anchor: PostcodeAnchor | null,
  hit: GeoResult | null,
  iso: string | null
): StructuredGeo {
  const hasStreet = Boolean((parts.address ?? "").trim());

  if (hit && hit.precise && !isTooCoarse(hit.place_type)) {
    const inCountry = !iso || !hit.country_code || hit.country_code.toUpperCase() === iso;
    const nearAnchor = !anchor || haversineKm(hit.lat, hit.lng, anchor.lat, anchor.lng) <= ANCHOR_VALIDATE_KM;
    if (inCountry && nearAnchor) {
      return {
        result: hit,
        precision: (hit.place_type as GeoPrecision) ?? "address",
        // A hit validated against its own postcode is our strongest signal.
        confidence: anchor ? 0.95 : 0.9,
        source: "maptiler",
        status: "confident",
        reason: null,
      };
    }
    // Precise but the wrong town/country (the Rack City case) — never trust it.
  }

  // The postcode anchor is a correct-area pin (postcode-level precision).
  if (anchor) {
    return {
      result: {
        lat: anchor.lat,
        lng: anchor.lng,
        country_code: iso,
        city: anchor.city,
        country: parts.country ?? null,
        place_type: "postcode",
        precise: false,
      },
      precision: "postcode",
      confidence: 0.75,
      source: anchor.source,
      status: "approximate",
      reason: null,
    };
  }

  // Nothing confident. Do NOT place a speculative pin — flag with a reason.
  const incomplete = !hasStreet || (!parts.postcode && !parts.city);
  return {
    result: null,
    precision: "none",
    confidence: 0,
    source: null,
    status: "flagged",
    reason: incomplete ? GEOCODE_INCOMPLETE_REASON : GEOCODE_LOWCONF_REASON,
  };
}

/**
 * geocode-fix — the well-formed, country-constrained, postcode-anchored,
 * confidence-gated geocode. (1) resolve the postcode as the primary anchor;
 * (2) run the full structured address country-constrained; (3) accept the
 * full-address pin ONLY if it's precise, in the right country, AND within the
 * postcode area — otherwise fall back to the postcode anchor; (4) if nothing
 * confident resolves, place NO pin and return a flagged status with a specific
 * reason. Never accepts MapTiler features[0] blindly; never guesses a centroid.
 *
 * The network I/O lives here; the decision lives in `decideStructuredGeo`.
 *
 * A LADDER of queries is tried, most-specific → least (all country-constrained):
 * dropping the postcode token on the 2nd rung is deliberate — an over-specified
 * "601 E Main St, Arlington, TX, 76010, USA" makes MapTiler return the ZIP-area
 * centroid (rejected as too-coarse), whereas the same address without the ZIP
 * resolves to the street. We stop at the first CONFIDENT decision and otherwise
 * keep the best (approximate anchor > flagged) — restoring the fallback the
 * single-query version had lost (the Arlington low-confidence regression).
 */
export function structuredLadder(p: StructuredParts): string[] {
  const j = (xs: (string | null | undefined)[]) =>
    xs.filter((s) => s && String(s).trim()).join(", ");
  return [
    j([p.address, p.city, p.region, p.postcode, p.country]),
    j([p.address, p.city, p.region, p.country]), // drop the ZIP → street resolves
    j([p.address, p.city, p.country]),
    j([p.name, p.city, p.region, p.country]), // POI-by-name fallback
    j([p.city, p.region, p.postcode, p.country]), // area (context only)
  ].filter((q, i, a) => q && a.indexOf(q) === i);
}

const geoRank = (s: StructuredGeo): number =>
  s.status === "confident" ? 2 : s.status === "approximate" ? 1 : 0;

export async function geocodeStructured(parts: StructuredParts): Promise<StructuredGeo> {
  const iso = resolveCountryCode(null, parts.country ?? null);
  const anchor = await postcodeAnchor(iso, parts.postcode);

  let best: StructuredGeo | null = null;
  for (const q of structuredLadder(parts)) {
    const hit = await queryMapTiler(q, iso);
    const decided = decideStructuredGeo(parts, anchor, hit, iso);
    if (decided.status === "confident") return decided; // best possible — stop
    if (!best || geoRank(decided) > geoRank(best)) best = decided;
  }
  return best ?? decideStructuredGeo(parts, anchor, null, iso);
}
