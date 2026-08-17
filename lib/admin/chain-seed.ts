import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { composeAddress, normStreet, normCity, settlementCity, extractCleanAddress } from "@/lib/admin/address";
import { canonicalCountry, resolveCountryCode } from "@/lib/constants/countries";
import { geocodeStructured, GEOCODE_COARSE_REASON, coherentGeoConfidence } from "@/lib/geo/geocode";
import { haversineKm } from "@/lib/utils/geo";
import { auditField } from "@/lib/admin/content-audit";

/** A location to seed: a branch label/name, optional street address, and city.
 *  Chain-discovery v2 (Part 1) also passes the branch's own country and the
 *  source URL it was read from, so the geocode write-guard can compare the
 *  geocoded country to the declared one and every pin traces back to a page. */
export interface SeedLocation {
  name: string | null;
  address?: string | null;
  city: string | null;
  /** State/region, when the source carried it — improves the geocode query. */
  region?: string | null;
  /** Postal/ZIP code, when known — anchors the geocode (geocode-fix). */
  postcode?: string | null;
  /** The branch's declared country (falls back to the chain-anchored country). */
  country?: string | null;
  /** The page this branch was read from (stored as provenance). */
  source_url?: string | null;
  /** A pin the SOURCE already carries (provider tier: OSM/Places lat/long). When
   *  present with provider_refs, seedChainLocations PREFERS it and only geocodes when
   *  it's missing ("prefer the provider's lat/long; only geocode what's missing"). */
  lat?: number | null;
  lng?: number | null;
  /** Location-data provider provenance ids ("osm:node/123", "places:ChIJ…"), set ONLY
   *  by the provider tier (patch 0061). Their presence FORCE-GATES the seeded row:
   *  needs_attention + a "provider-sourced — verify" reason + these ids recorded in
   *  enrichment_sources + never auto-published (status stays pending). Own-feed/render
   *  seeds leave this undefined, so their behaviour is unchanged. */
  provider_refs?: string[] | null;
}

export interface SeedResult {
  /** How many incoming locations were considered. */
  found: number;
  /** Brand-new seed rows inserted. */
  added: { label: string; city: string | null }[];
  /** Existing seed rows matched and updated in place (no new row). */
  updated: { label: string; city: string | null }[];
  /** Incoming locations that ARE the parent's own venue (never seeded). */
  matchedParent: number;
  /** New seeds whose address wouldn't geocode — inserted at 0,0 + needs_attention. */
  needsLocation: number;
  /** Existing STANDALONE same-brand rows that were LINKED into the chain instead
   *  of being duplicated (Part 4C — the "operator manually added a branch" case). */
  linked: number;
  /** New rows inserted flagged as a POSSIBLE duplicate of an existing record
   *  (uncertain same-city/same-brand match) — never a silent twin (Part 4C). */
  possibleDuplicates: number;
  /** Off-brand locations-page links seeded standalone under their real name and
   *  flagged, NOT absorbed as a branch under the parent (Fix 2a). */
  offBrand: number;
  /** Per-incoming-location decision log, for the parent's discovery_debug so the
   *  roster "shows its working" (Part 4B/FAIL 5): what happened to each address. */
  decisions: { address: string; decision: string; reason?: string }[];
}

/** The generic BBQ/company/type words that carry no brand identity. */
const BRAND_STOP = new Set([
  "bbq", "barbecue", "barbeque", "barbq", "bar", "b", "que", "q", "co", "company",
  "inc", "llc", "ltd", "the", "and", "grill", "grille", "smokehouse", "smoke",
  "house", "restaurant", "kitchen", "pit", "pits", "joint", "brothers", "bros",
]);

/** The distinctive lowercase tokens of a brand name, longest-first — the generic
 *  BBQ/company words dropped. The ONE brand tokeniser (naming-pollution #208),
 *  reused by fuzzy matching AND the roster off-brand guard — not a fork. */
export function brandTokens(brand: string): string[] {
  return brand
    .toLowerCase()
    .replace(/['’]/g, "") // drop apostrophes WITHOUT splitting: "Jack's" → "jacks"
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !BRAND_STOP.has(w))
    .sort((a, b) => b.length - a.length);
}

/** A distinctive lowercase token from a brand name, for FUZZY matching existing
 *  records whose name is a variant ("Thatcher Barbecue Company" vs "Thatcher BBQ
 *  Company"). The single strongest (longest) distinctive word. */
export function brandToken(brand: string): string {
  return brandTokens(brand)[0] ?? "";
}

/**
 * A POSITIVE signal that a name is a distinct EATING ESTABLISHMENT — a different
 * business — rather than a bare locality/area label. A genuine cross-linked sister
 * restaurant advertises a cuisine/type ("Tex-Mex & Cantina", "Taqueria", "Grill");
 * a branch named by its town or neighbourhood ("Beaumont", "Duval Station",
 * "Bartram Oaks") does not. Deliberately EXCLUDES barbecue words — a same-cuisine
 * name is more likely the brand itself than a rival, and must not be split off.
 */
const DISTINCT_BUSINESS_RE =
  /\b(?:cantina|taqueria|tacos?|cocina|grill|grille|caf[eé]|coffee|pizza|pizzeria|kitchen|saloon|diner|tavern|\bpub\b|bakery|deli|delicatessen|steakhouse|seafood|sushi|ramen|noodles?|thai|mexican|tex[\s-]?mex|italian|chinese|burgers?|wings|creamery|brewery|brewing|bistro|chophouse|eatery|restaurant|cocktail|lounge|pancake|waffle|donut|doughnut|ice\s*cream|gelato)\b/i;

/**
 * ROSTER PROVENANCE GUARD (Fix 2a): is this locations-page link an OFF-BRAND sister
 * business rather than a branch? Catching a genuine cross-link ("Jackalope Tex-Mex
 * & Cantina" on Jack's BBQ's page) must NOT also catch a branch named by its own
 * area — the first cut (0053) flagged "Beaumont" (Cornerstone's own city) and
 * "Duval Station"/"Bartram Oaks" (Jacksonville areas) as phantom businesses. So a
 * link is off-brand ONLY when ALL hold:
 *   • it shares NONE of the flagship's distinctive brand tokens; AND
 *   • it is NOT the branch's own city or the flagship's city (a locality label); AND
 *   • it POSITIVELY looks like a different eatery (a cuisine/type word) — a bare
 *     place name never qualifies.
 * A brand whose own token is too weak (< 3 chars, e.g. "2M") to judge, or a name
 * that's all generic words, is treated as a branch — never wrongly split off.
 */
export function rosterNameIsOffBrand(
  name: string | null | undefined,
  brand: string,
  opts?: { selfCity?: string | null; parentCity?: string | null }
): boolean {
  if (!name) return false;
  const parentTok = brandToken(brand);
  if (parentTok.length < 3) return false; // brand token too weak to judge
  const nameToks = brandTokens(name);
  if (!nameToks.length) return false; // name is all generic words → treat as branch
  const brandToks = new Set(brandTokens(brand));
  const nameNorm = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  // A branch SHARES the brand's distinctive token (as a token, or as a substring
  // to catch "Jack's BBQ Seattle" whose longest token is the city).
  const shares = nameToks.some((t) => brandToks.has(t)) || nameNorm.includes(parentTok);
  if (shares) return false;
  // A bare LOCALITY label (the branch's own area, or the flagship's city) is never
  // a different business — "Beaumont" is Cornerstone's town, not a rival.
  const nc = normCity(name);
  if (nc && (nc === normCity(opts?.selfCity ?? null) || nc === normCity(opts?.parentCity ?? null))) return false;
  // Only split off a name that POSITIVELY reads as a different eatery. A place name
  // ("Duval Station", "Bartram Oaks") carries no such signal → treated as a branch.
  if (!DISTINCT_BUSINESS_RE.test(name)) return false;
  return true;
}

/**
 * Is this "name" actually a bare LOCATION label, not a real venue name? A venue
 * name must never be its own city or a per-location heading ("Beaumont", "The
 * Original") — that is the orphan-flagship shape (#214). True when the name is
 * empty, or equals the branch's own city or the flagship's city. The insert-time
 * tripwire (A3.5): a bare-location name is a MISLABELLED BRANCH, never seeded under
 * that label — it re-brands to the flagship name and attaches, or holds.
 */
export function nameIsBareLocation(
  name: string | null | undefined,
  opts?: { city?: string | null; parentCity?: string | null }
): boolean {
  if (!name || !name.trim()) return true;
  const nc = normCity(name);
  if (!nc) return true;
  return nc === normCity(opts?.city ?? null) || nc === normCity(opts?.parentCity ?? null);
}

interface ExistingRow {
  id: string;
  address: string | null;
  city: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  isParent: boolean;
  /** A standalone same-brand row (not yet a member) — a confident match LINKS it
   *  into the chain rather than creating a duplicate (Part 4C). */
  linkable?: boolean;
  /** Its style, so a linked row can inherit the flagship style if it was "other". */
  style?: string | null;
}

/** Two coordinates are the "same place" if within this radius (≈150 m). */
const SAME_PLACE_KM = 0.15;

/** Real, usable coordinates — not null and not the (0,0) placeholder. */
function hasCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Human-readable provider names from a row's provider_refs ("osm:…","places:…") →
 *  "OpenStreetMap + Google Places". For the gated-lead attention reason (patch 0061). */
function providerLabel(refs: string[]): string {
  const names: Record<string, string> = { osm: "OpenStreetMap", places: "Google Places" };
  const seen: string[] = [];
  for (const r of refs) {
    const src = (r.split(":")[0] || "").toLowerCase();
    const label = names[src] ?? src;
    if (label && !seen.includes(label)) seen.push(label);
  }
  return seen.join(" + ") || "provider";
}

/** Settlement-normalised city identity key ("City of Westminster" → "london"). */
function cityKeyOf(city: string | null): string {
  return normCity(settlementCity(city));
}

/**
 * The city identity to dedupe a NO-STREET placeholder by: its city text if it
 * has one, else fall back to its address line (a branch given only "Seoul" as its
 * address, with no city field, must still dedupe as "seoul"). Only meaningful for
 * a candidate/member that carries no distinct street.
 */
function placeholderCityKey(city: string | null, address: string | null): string {
  return cityKeyOf(city) || (address ? cityKeyOf(address) : "");
}

/** Known street-type tokens (after normStreet's abbreviation) that mark a road. */
const STREET_TYPES = new Set([
  "st", "ave", "rd", "blvd", "dr", "ln", "ct", "pl", "pkwy", "hwy",
  "way", "sq", "square", "terrace", "close", "walk", "row", "cres", "crescent",
  "gate", "wharf", "quay", "mews", "hill", "grove", "gardens", "parade",
]);

/**
 * Does this address carry a DISTINCT STREET (a real building line), versus being
 * just a bare city/settlement name? A roster seed like "Syracuse" or "Hamburg"
 * has no street — it geocodes to the city centre, not the building, so it must
 * NOT be treated as a precise location for dedupe. A real street has either a
 * building number (a digit) or a street-type token, and isn't just the city.
 */
function hasDistinctStreet(streetKey: string, cityKey: string): boolean {
  if (!streetKey) return false;
  if (streetKey === cityKey) return false; // the "street" is literally the city
  if (/\d/.test(streetKey)) return true; // has a building number
  return streetKey.split(" ").some((w) => STREET_TYPES.has(w)); // named road
}

/** Does this raw address carry a real STREET LINE (building number or named road),
 *  versus a bare city? The public wrapper of hasDistinctStreet, for the flagship
 *  location guard (Fix 2b). */
export function addressHasStreet(address: string | null | undefined, city: string | null | undefined): boolean {
  return hasDistinctStreet(normStreet(address ?? null), cityKeyOf(city ?? null));
}

/**
 * Seed / reconcile a chain's sibling locations (§09.2.2). Identity is the
 * PHYSICAL LOCATION — matched by normalised STREET address or GEO PROXIMITY,
 * never by city text (a coarse region like "Greater London" collides across
 * genuinely distinct branches). Every incoming candidate is deduped against ALL
 * existing chain members — the parent/flagship AND every current sibling:
 *   - a candidate that maps to the PARENT's own venue is skipped (never seeded
 *     as a sibling — this kills the "flagship duplicated" bug, e.g. a Red Dog
 *     roster spawning a second "37 Hoxton Square");
 *   - a match against an existing sibling UPDATES it in place (filling a fuller
 *     address / city), never inserts;
 *   - only genuinely new locations are inserted, geocoded to real coordinates —
 *     or, if the address won't geocode, inserted at 0,0 and flagged
 *     needs_attention rather than silently pinned in the ocean (Fix B).
 * Idempotent: running it twice yields zero net new rows. Called by the roster
 * gateway with full {name, address, city} locations.
 */
export async function seedChainLocations(
  db: SupabaseClient,
  parentId: string,
  brand: string,
  country: string | null,
  locations: SeedLocation[]
): Promise<SeedResult> {
  const found = locations.length;
  const result: SeedResult = { found, added: [], updated: [], matchedParent: 0, needsLocation: 0, linked: 0, possibleDuplicates: 0, offBrand: 0, decisions: [] };
  if (!found) return result;
  // Parse-robustness — clean every incoming address BEFORE geocoding and dedupe:
  // un-glue "St.San" → "St. San" (A5), strip a phone glued to the number (A7), and
  // extract the real street from a scraped page-text blob (Pit Room/Roegels), so a
  // glued/blob twin keys to the flagship instead of pinning the Gulf or spawning a
  // duplicate. A blob we CAN'T reduce to a street is remembered (blobUnresolved) so
  // its seed is flagged for a human below — never geocoded as garbage or guessed.
  const blobUnresolved: boolean[] = [];
  locations = locations.map((l) => {
    if (!l.address) { blobUnresolved.push(false); return l; }
    const ex = extractCleanAddress(l.address);
    blobUnresolved.push(ex.wasBlob && !ex.extracted);
    return { ...l, address: ex.address };
  });
  const note = (address: string, decision: string, reason?: string) =>
    result.decisions.push({ address, decision, ...(reason ? { reason } : {}) });

  const { data: parentRow } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng, style")
    .eq("id", parentId)
    .single();
  // A chain is one brand = one cuisine — a new branch inherits the flagship's
  // style, never the "other" default (systemic fix). Only a definite (non-"other")
  // flagship style is inherited.
  const parentStyle = (parentRow as { style?: string } | null)?.style ?? null;
  const branchStyle = parentStyle && parentStyle !== "other" ? parentStyle : "other";
  const { data: siblingRows } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng")
    .eq("chain_parent_id", parentId);

  // Part 4C (FAIL 1 fix) — also load STANDALONE rows that are likely the same
  // brand, matched FUZZILY by a distinctive brand token, not an exact name. The
  // duplicate Thatcher bug was an exact-name query missing "Thatcher BBQ Company"
  // when the parent brand had resolved to "Thatcher Barbecue Company". A confident
  // address/geo match against one of these LINKS it in rather than duplicating.
  // (Proximity-based candidates are added after geocoding, below.)
  const token = brandToken(brand);
  const { data: brandRows } = token.length >= 3
    ? await db
        .from("restaurants")
        .select("id, address, city, location_label, lat, lng, style, chain_parent_id")
        .ilike("name", `%${token}%`)
        .is("chain_parent_id", null)
        .neq("id", parentId)
    : { data: [] as Record<string, unknown>[] };

  const existing: ExistingRow[] = [
    ...(parentRow ? [{ ...(parentRow as Omit<ExistingRow, "isParent">), isParent: true }] : []),
    ...((siblingRows ?? []) as Omit<ExistingRow, "isParent">[]).map((r) => ({ ...r, isParent: false })),
    ...((brandRows ?? []) as (Omit<ExistingRow, "isParent" | "linkable"> & { chain_parent_id: string | null })[])
      .filter((r) => r.id !== parentId)
      .map((r) => ({ id: r.id, address: r.address, city: r.city, location_label: r.location_label, lat: r.lat, lng: r.lng, style: r.style, isParent: false, linkable: true })),
  ];
  const consumed = new Set<string>(); // existing ids already matched this run

  // Geocode each incoming candidate up front (lightly throttled for MapTiler).
  // We need the coordinates both to dedupe by proximity AND to seed a real pin.
  // A candidate that fails to geocode gets geo=null.
  interface Candidate {
    loc: SeedLocation;
    /** Normalised street identity key (may be empty, or just the city). */
    streetKey: string;
    /** True only when it carries a real building line, not a bare city. */
    hasStreet: boolean;
    /** Settlement-normalised city key, for the city-only dedupe rule. */
    cityKey: string;
    /** City identity for a no-street placeholder (city text, else address). */
    effCityKey: string;
    lat: number | null;
    lng: number | null;
    country_code: string | null;
    geoCity: string | null;
    /** geocode-fix — pin quality, persisted on the seeded row (Confirmed/Approx/Missing). */
    geoPrecision: string | null;
    geoConfidence: number | null;
    geoSource: string | null;
    /** A specific attention reason (e.g. cross-country mis-pin) if not located. */
    attentionReason: string | null;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    let lat: number | null = null;
    let lng: number | null = null;
    let country_code: string | null = null;
    let geoCity: string | null = null;
    let attentionReason: string | null = null;
    const declaredCountry = canonicalCountry(loc.country ?? country);
    let geoPrecision: string | null = null;
    let geoConfidence: number | null = null;
    let geoSource: string | null = null;
    // PROVIDER TIER (patch 0061) — prefer the provider's OWN lat/long. When a seed
    // carries provider_refs AND a real pin (OSM centre / Places geometry), trust that
    // pin and DO NOT geocode ("prefer the provider's lat/long; only geocode what's
    // missing"). The row is force-gated below regardless, so a wrong provider pin is
    // caught by a human — never auto-published.
    const providerPin = Boolean(loc.provider_refs?.length) && hasCoords(loc.lat ?? null, loc.lng ?? null);
    if (providerPin) {
      lat = loc.lat as number;
      lng = loc.lng as number;
      country_code = declaredCountry ? resolveCountryCode(null, declaredCountry) : null;
      geoPrecision = "provider";
      geoConfidence = 0.6; // a provider pin is a lead, not a confirmed geocode
      geoSource = loc.provider_refs && loc.provider_refs[0] ? loc.provider_refs[0].split(":")[0] : "provider";
    } else {
      if (i > 0) await sleep(200); // light courtesy throttle
      // Geocode with the BRANCH's declared country as context (falls back to the
      // chain-anchored country), so a place name resolves in the right country.
      // geocode-fix — the bulk chain path runs through the SAME gated geocoder as the
      // single-venue path (country-constrained, confidence-scored), and PERSISTS
      // geo_precision/geo_confidence/geo_source on each seeded row. A branch that only
      // resolves weakly is left unpinned and flagged, never planted.
      const geo = await geocodeStructured({ address: loc.address, city: loc.city, region: loc.region, postcode: loc.postcode, country: declaredCountry || country, name: loc.name });
      geoPrecision = geo.precision;
      geoConfidence = geo.confidence;
      geoSource = geo.source;
      if (geo.result && hasCoords(geo.result.lat, geo.result.lng)) {
        // Hard write-guard (§3.3): if the geocoded country ≠ the declared country,
        // DO NOT store the pin — flag it. This kills the cross-country mis-pin bug
        // (real overseas branches geocoded into random US states).
        const declaredCode = declaredCountry ? resolveCountryCode(null, declaredCountry) : null;
        const geoCode = geo.result.country_code ? geo.result.country_code.toUpperCase() : null;
        if (declaredCode && geoCode && declaredCode !== geoCode) {
          attentionReason = `Geocoded outside ${declaredCountry} (got ${geoCode}) — verify address / set pin`;
          geoPrecision = "none";
          geoConfidence = 0;
        } else {
          lat = geo.result.lat;
          lng = geo.result.lng;
          country_code = geo.result.country_code;
          geoCity = geo.result.city;
        }
      } else {
        // Flagged — nothing confident resolved; surface the specific reason.
        attentionReason = geo.reason ?? GEOCODE_COARSE_REASON;
      }
    }
    // Scraped-blob guard — the address was a page-text dump with no confidently
    // extractable street. Never trust a geocode of prose: drop any pin and flag it
    // for a human to re-enter the address, rather than planting a garbage location.
    if (blobUnresolved[i]) {
      lat = null;
      lng = null;
      country_code = null;
      geoCity = null;
      geoPrecision = "none";
      geoConfidence = 0;
      attentionReason =
        "Address looks like scraped page text — no clean street could be extracted. Verify and re-enter the address.";
    }
    // Street key from the branch's OWN address line only (not folded with the
    // city), so a city-only entry reads as "no distinct street".
    const cityKey = cityKeyOf(loc.city);
    const streetKey = normStreet(loc.address);
    const hasStreet = hasDistinctStreet(streetKey, cityKey);
    candidates.push({
      loc,
      streetKey,
      hasStreet,
      cityKey,
      effCityKey: hasStreet ? "" : placeholderCityKey(loc.city, loc.address ?? null),
      lat,
      lng,
      country_code,
      geoCity,
      geoPrecision,
      geoConfidence,
      geoSource,
      attentionReason,
    });
  }

  // Part 4C (FAIL 1 fix) — geo-proximity load. Any existing standalone record
  // sitting within ~400m of a candidate's pin is a link candidate regardless of
  // its NAME (catches an identical address whose name doesn't share the brand
  // token). One bounding-box query over all candidate pins, then linked in below.
  const pins = candidates
    .filter((c) => hasCoords(c.lat, c.lng))
    .map((c) => ({ lat: c.lat as number, lng: c.lng as number }));
  if (pins.length) {
    const pad = 0.004; // ≈ 400m
    const minLat = Math.min(...pins.map((p) => p.lat)) - pad;
    const maxLat = Math.max(...pins.map((p) => p.lat)) + pad;
    const minLng = Math.min(...pins.map((p) => p.lng)) - pad;
    const maxLng = Math.max(...pins.map((p) => p.lng)) + pad;
    const { data: nearRows } = await db
      .from("restaurants")
      .select("id, address, city, location_label, lat, lng, style, chain_parent_id")
      .gte("lat", minLat).lte("lat", maxLat)
      .gte("lng", minLng).lte("lng", maxLng)
      .is("chain_parent_id", null)
      .neq("id", parentId);
    for (const r of (nearRows ?? []) as (Omit<ExistingRow, "isParent" | "linkable"> & { chain_parent_id: string | null })[]) {
      if (existing.some((e) => e.id === r.id)) continue;
      existing.push({ id: r.id, address: r.address, city: r.city, location_label: r.location_label, lat: r.lat, lng: r.lng, style: r.style, isParent: false, linkable: true });
    }
  }

  const matches = (c: Candidate, e: ExistingRow): boolean => {
    const eStreetKey = normStreet(e.address);
    const eCityKey = cityKeyOf(e.city);
    const eHasStreet = hasDistinctStreet(eStreetKey, eCityKey);
    // 1. Same real street address — the strongest identity signal (both sides
    //    must actually HAVE a distinct street; a bare-city "street" doesn't count).
    if (c.hasStreet && eHasStreet && c.streetKey === eStreetKey) return true;
    // 2. Geographic proximity — both sides have real (non-0,0) coordinates.
    if (hasCoords(c.lat, c.lng) && hasCoords(e.lat, e.lng)) {
      if (haversineKm(c.lat as number, c.lng as number, e.lat as number, e.lng as number) <= SAME_PLACE_KM) {
        return true;
      }
    }
    // 3. CITY-ONLY candidate (no distinct street of its own): it geocodes to the
    //    city centre and carries nothing to tell it apart from a member already
    //    in that settlement, so it must NEVER spawn a same-city duplicate of the
    //    flagship or a sibling (the Dinosaur "Syracuse" seed vs the 246 W Willow
    //    St flagship, ~700 m apart, that street+geo dedupe alone kept). A
    //    candidate WITH a distinct street is exempt — that's how genuine
    //    same-city branches (Bodean's Soho vs Tower Hill) are both kept.
    if (!c.hasStreet && c.cityKey && c.cityKey === eCityKey) return true;
    return false;
  };

  for (const c of candidates) {
    const loc = c.loc;
    const label = loc.name && loc.name !== brand ? loc.name : loc.city;
    if (!label) continue;

    // ROSTER PROVENANCE GUARD (Fix 2a) — a differently-named sister business
    // cross-linked from the brand's locations page (Jackalope Tex-Mex on Jack's
    // BBQ's page) is NOT a branch. Never rename it to the parent or attach it as a
    // child: seed it standalone under its REAL name, flagged for a human, so the
    // real venue is preserved but not filed under the wrong brand.
    const parentCityHint = (parentRow as { city?: string | null } | null)?.city ?? null;
    if (
      rosterNameIsOffBrand(loc.name, brand, { selfCity: loc.city, parentCity: parentCityHint }) &&
      // TRIPWIRE (A3.5) — a bare LOCATION label ("Beaumont") is never a rival
      // business: it's a mislabelled branch, so let it fall through to the normal
      // branch path (name = brand, attached under the flagship), never an orphan.
      !nameIsBareLocation(loc.name, { city: loc.city, parentCity: parentCityHint })
    ) {
      // DEDUPE (A3.4) — never create a parallel off-brand copy of a row we already
      // have, and collapse a brand-node/orphan that shares this address. If it
      // matches an existing member/near row, note and skip rather than duplicate.
      const offDup = existing.find((e) => !consumed.has(e.id) && matches(c, e));
      if (offDup) {
        note(loc.address ?? loc.name ?? "", "off_brand_duplicate", `off-brand link "${loc.name}" already exists at this address — skipped`);
        continue;
      }
      const offCity = settlementCity(loc.city) || loc.city || "";
      const offSlug = await uniqueRestaurantSlug(db, `${loc.name} ${offCity || label}`);
      const offComposed = composeAddress({ street: loc.address, city: loc.city });
      const offLocated = hasCoords(c.lat, c.lng);
      const offGeo = coherentGeoConfidence(offLocated ? c.lat : null, offLocated ? c.lng : null, {
        geo_precision: c.geoPrecision,
        geo_confidence: c.geoConfidence,
        geo_source: c.geoSource,
      });
      const offRow: Record<string, unknown> = {
        slug: offSlug,
        name: loc.name,
        location_label: null,
        description: `${loc.name} — barbecue${offCity ? ` in ${offCity}` : ""}.`,
        style: "other",
        lat: offLocated ? c.lat : null,
        lng: offLocated ? c.lng : null,
        address: offComposed,
        city: offCity,
        country: canonicalCountry(loc.country ?? country),
        price_level: 2,
        hero_image_url: "",
        hero_source: "none",
        status: "pending",
        category: "restaurant",
        chain_parent_id: null,
        geo_precision: offGeo.geo_precision,
        geo_confidence: offGeo.geo_confidence,
        geo_source: offGeo.geo_source,
        needs_attention: true,
        attention_reason: `Off-brand link from ${brand} locations page — verify. This is "${loc.name}", not a ${brand} branch.`,
      };
      if (offLocated && c.country_code) offRow.country_code = c.country_code;
      if (loc.source_url) offRow.enrichment_sources = [loc.source_url];
      await db.from("restaurants").insert(offRow);
      result.offBrand += 1;
      note(offComposed || (loc.address ?? loc.name ?? ""), "off_brand", `named "${loc.name}" — not a ${brand} branch; seeded standalone + flagged`);
      continue;
    }

    // Fix 5 — placeholder collapse. A branch with NO distinct street is just a
    // city-level (or worse, city-less) placeholder: it carries nothing to tell it
    // apart from another member in the same city or at the same pin. So BEFORE the
    // normal match/insert, drop it if ANY existing member (consumed or not) shares
    // its city identity or its coordinates — this collapses a cluster of identical
    // "Seoul" / same-pin, no-address branches to ONE instead of materialising N
    // stacked duplicates. Branches WITH a real street are exempt (they insert as
    // usual), so genuine same-city branches are never wrongly merged.
    if (!c.hasStreet) {
      const dup = existing.find((e) => {
        const eStreetKey = normStreet(e.address);
        const eHasStreet = hasDistinctStreet(eStreetKey, cityKeyOf(e.city));
        const eEff = eHasStreet ? "" : placeholderCityKey(e.city, e.address);
        if (c.effCityKey && eEff && c.effCityKey === eEff) return true;
        if (
          hasCoords(c.lat, c.lng) &&
          hasCoords(e.lat, e.lng) &&
          haversineKm(c.lat as number, c.lng as number, e.lat as number, e.lng as number) <= SAME_PLACE_KM
        )
          return true;
        return false;
      });
      if (dup) {
        if (dup.isParent) { result.matchedParent += 1; note(loc.address ?? loc.city ?? label, "matched_parent", "city-only placeholder matched the parent"); }
        else { result.updated.push({ label, city: settlementCity(loc.city) || loc.city }); note(loc.address ?? loc.city ?? label, "merged_placeholder", "city-only placeholder collapsed into an existing member"); }
        continue; // never materialise a duplicate placeholder
      }
    }

    const match = existing.find((e) => !consumed.has(e.id) && matches(c, e));

    if (match) {
      consumed.add(match.id);
      if (match.isParent) {
        result.matchedParent += 1; // the parent's own location — never a sibling
        note(loc.address ?? label, "matched_parent", "this location IS the parent's own venue");
        continue;
      }
      if (match.linkable) {
        // Part 4C — a confident match to a STANDALONE same-brand row: LINK it into
        // the chain (set its parent) instead of creating a duplicate. Fill a fuller
        // address / pin, inherit the flagship style if it was on "other", and audit.
        const linkPatch: Record<string, unknown> = { chain_parent_id: parentId };
        const composedL = composeAddress({ street: loc.address, city: loc.city });
        if (composedL && composedL.length > (match.address ?? "").length) linkPatch.address = composedL;
        const settleL = settlementCity(loc.city);
        if (settleL && !settlementCity(match.city)) linkPatch.city = settleL;
        if (hasCoords(c.lat, c.lng) && !hasCoords(match.lat, match.lng)) {
          linkPatch.lat = c.lat;
          linkPatch.lng = c.lng;
          if (c.country_code) linkPatch.country_code = c.country_code;
        }
        if (branchStyle !== "other" && (!match.style || match.style === "other")) linkPatch.style = branchStyle;
        await db.from("restaurants").update(linkPatch).eq("id", match.id);
        await auditField(db, match.id, "chain", null,
          { linked_to: parentId, reason: "matched an existing standalone same-brand branch" },
          { source: "roster", changedBy: null, note: "linked existing branch into chain (dedupe, not duplicated)" });
        match.linkable = false; // it's a member now
        result.linked += 1;
        note(composedL || (loc.address ?? label), "linked", "matched an existing record — linked into the chain, not duplicated");
        continue;
      }
      // Update the existing sibling in place — fill a fuller address / city, and
      // upgrade a placeholder pin to real coordinates if we just geocoded them.
      const patch: Record<string, unknown> = {};
      const composed = composeAddress({ street: loc.address, city: loc.city });
      if (composed && composed.length > (match.address ?? "").length) patch.address = composed;
      const settle = settlementCity(loc.city);
      if (settle && !settlementCity(match.city)) patch.city = settle;
      if (hasCoords(c.lat, c.lng) && !hasCoords(match.lat, match.lng)) {
        patch.lat = c.lat;
        patch.lng = c.lng;
        if (c.country_code) patch.country_code = c.country_code;
        // Record the pin quality for the upgraded placeholder too.
        patch.geo_precision = c.geoPrecision;
        patch.geo_confidence = c.geoConfidence;
        patch.geo_source = c.geoSource;
        // A placeholder that just got a real pin no longer needs a location flag.
        patch.needs_attention = false;
        patch.attention_reason = null;
      }
      if (Object.keys(patch).length) await db.from("restaurants").update(patch).eq("id", match.id);
      result.updated.push({ label, city: settle || loc.city });
      note(composed || (loc.address ?? label), "updated", "matched an existing branch — updated in place");
      continue;
    }

    // Part 4C — before inserting, check for a PROBABLE-BUT-UNCERTAIN duplicate: a
    // same-brand record already in this city that we did NOT confidently match.
    // We only treat it as uncertain when the two can't be told apart — the existing
    // row has no distinct street, OR this candidate didn't get a real pin to compare
    // — so two clearly-distinct geocoded branches in one city are NOT flagged.
    let possibleDupOf: string | null = null;
    if (c.hasStreet && c.cityKey) {
      const uncertain = existing.find((e) => {
        if (consumed.has(e.id)) return false;
        if (cityKeyOf(e.city) !== c.cityKey) return false;
        const eHasStreet = hasDistinctStreet(normStreet(e.address), cityKeyOf(e.city));
        return !eHasStreet || !hasCoords(c.lat, c.lng);
      });
      if (uncertain) possibleDupOf = uncertain.id;
    }

    // Genuinely new location → insert a $0 seed with a real pin when we have one.
    const settle = settlementCity(loc.city) || loc.city || "";
    const slug = await uniqueRestaurantSlug(db, `${brand} ${settle || label}`);
    const composed = composeAddress({ street: loc.address, city: loc.city });
    const located = hasCoords(c.lat, c.lng);
    // GEO HONESTY (Fix 3) — the pin-quality trio is co-set with the coordinate:
    // written together when we have a real pin, both NULL when we don't. No seed
    // ever carries a confidence for a coordinate it lacks.
    const seedGeo = coherentGeoConfidence(located ? c.lat : null, located ? c.lng : null, {
      geo_precision: c.geoPrecision,
      geo_confidence: c.geoConfidence,
      geo_source: c.geoSource,
    });
    const insertRow: Record<string, unknown> = {
      slug,
      name: brand,
      location_label: label,
      description: `${brand} — barbecue${settle ? ` in ${settle}` : ""}.`,
      // Inherit the flagship's cuisine (never the "other" default).
      style: branchStyle,
      // FAIL 4 — an un-located seed gets a NULL pin (never 0,0 "null island"). The
      // publish guard + map both treat null and 0,0 alike as "no pin", and it's
      // flagged needs_attention below.
      lat: located ? c.lat : null,
      lng: located ? c.lng : null,
      address: composed,
      city: settle,
      // Per-branch declared country (falls back to the chain-anchored country).
      country: canonicalCountry(loc.country ?? country),
      price_level: 2,
      hero_image_url: "",
      hero_source: "none",
      status: "pending",
      category: "restaurant",
      chain_parent_id: parentId,
      // geocode-fix — persist pin quality so admin shows Confirmed/Approx/Missing.
      geo_precision: seedGeo.geo_precision,
      geo_confidence: seedGeo.geo_confidence,
      geo_source: seedGeo.geo_source,
    };
    if (located && c.country_code) insertRow.country_code = c.country_code;
    // Provenance — every pin traces back to the page it was read from (§3.4). The
    // provider tier ALSO records each source id ("osm:node/123", "places:ChIJ…") here,
    // so a gated lead is auditable back to the exact provider record.
    const provenance = [...(loc.source_url ? [loc.source_url] : []), ...(loc.provider_refs ?? [])];
    if (provenance.length) insertRow.enrichment_sources = provenance;
    // PROVIDER TIER GATE (patch 0061) — a provider-sourced branch NEVER auto-publishes:
    // it lands needs_attention with a "provider-sourced — verify" reason so a human
    // confirms before publish (third-party data can be stale/wrong). status is already
    // "pending", so it is never live without review. Belt-and-braces.
    if (loc.provider_refs?.length) {
      insertRow.needs_attention = true;
      const provReason = `Provider-sourced (${providerLabel(loc.provider_refs)}) — verify before publish.`;
      insertRow.attention_reason = insertRow.attention_reason ? `${provReason} ${insertRow.attention_reason}` : provReason;
    }
    if (possibleDupOf) {
      // Part 4C — never silently create a twin. Insert FLAGGED with a link to the
      // record it may duplicate, so the operator can merge or dismiss in the queue.
      insertRow.possible_duplicate_of = possibleDupOf;
      insertRow.duplicate_reason = `Possible duplicate — a same-brand record already exists in ${settle || "this city"}. Merge or dismiss.`;
      insertRow.needs_attention = true;
      insertRow.attention_reason =
        insertRow.attention_reason ?? `Possible duplicate of an existing ${brand} record in ${settle || "this city"} — merge or dismiss.`;
    }
    if (!located) {
      // Fix B — never silently pin a new seed. Flag it so the operator fixes the
      // address / drops a manual pin before it can go live. The reason is specific
      // when the geocode write-guard rejected a cross-country / town-level pin.
      insertRow.needs_attention = true;
      insertRow.attention_reason = c.attentionReason ?? insertRow.attention_reason ?? "Couldn't locate — check address / set pin manually";
    }
    note(
      composed || (loc.address ?? label),
      possibleDupOf ? "inserted_possible_duplicate" : "inserted",
      possibleDupOf
        ? "no confident match, but a same-brand record exists in this city — flagged possible duplicate"
        : located ? "new distinct branch" : "new branch, but no precise pin — flagged for a manual pin"
    );
    const { data: inserted, error } = await db
      .from("restaurants")
      .insert(insertRow)
      .select("id")
      .single();
    if (!error && inserted) {
      // Register the new row so later incoming items dedupe against it too.
      existing.push({
        id: inserted.id as string,
        address: composed,
        city: settle || null,
        location_label: label,
        lat: located ? c.lat : null,
        lng: located ? c.lng : null,
        isParent: false,
      });
      consumed.add(inserted.id as string);
      result.added.push({ label, city: settle || loc.city });
      if (!located) result.needsLocation += 1;
      if (possibleDupOf) result.possibleDuplicates += 1;
      // Audit the inherited style at creation (source=roster).
      if (branchStyle !== "other") {
        await auditField(db, inserted.id as string, "style", null, branchStyle, {
          source: "roster",
          changedBy: null,
          note: "inherited flagship style at creation",
        });
      }
    }
  }

  return result;
}

/** A discovered branch that could be promoted to flagship. */
export interface AbsorbCandidate {
  id: string;
  address: string | null;
  city: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Choose which discovered branch becomes the flagship when the origin seed has no
 * street of its own (A4). Prefers a branch that carries a REAL street in the
 * seed's own city (the `cityHint`), else the first branch with a real street.
 * Returns null when no branch has a distinct street (a genuinely address-less
 * chain — left for a human, never force-promoted). Pure — unit-tested.
 */
export function chooseAbsorbTarget(
  children: AbsorbCandidate[],
  cityHint: string | null
): AbsorbCandidate | null {
  const withStreet = children.filter((c) => hasDistinctStreet(normStreet(c.address), cityKeyOf(c.city)));
  if (!withStreet.length) return null;
  if (cityHint) {
    const hintKey = cityKeyOf(cityHint);
    const inCity = withStreet.find((c) => cityKeyOf(c.city) === hintKey);
    if (inCity) return inCity;
  }
  return withStreet[0];
}

/**
 * A4 phantom-seed fix. A handle-only IG seed (no street of its own) would be left
 * as an address-less "flagship-not-set" row ON TOP of the real branches — N+1 rows
 * for an N-location chain (the Bain BBQ shape). Instead, absorb the best real
 * branch INTO the parent (the parent keeps its id/slug, so nothing is orphaned)
 * and delete that now-duplicate branch. Result: N rows, one real flagship, no
 * address-less phantom. Idempotent — a parent that already has a real street is
 * left untouched, so a normal chain is never disturbed.
 */
export async function resolvePhantomFlagship(
  db: SupabaseClient,
  parentId: string,
  cityHint: string | null
): Promise<{ absorbed: boolean; promotedId?: string; promotedLabel?: string | null }> {
  const { data: parent } = await db
    .from("restaurants")
    .select("id, address, city")
    .eq("id", parentId)
    .single();
  if (!parent) return { absorbed: false };
  const p = parent as { address: string | null; city: string | null };
  // Parent already has a real street → not a phantom; nothing to do.
  if (hasDistinctStreet(normStreet(p.address), cityKeyOf(p.city))) return { absorbed: false };

  const { data: kids } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng, country, country_code, geo_precision, geo_confidence, geo_source")
    .eq("chain_parent_id", parentId);
  const children = (kids ?? []) as (AbsorbCandidate & {
    country: string | null; country_code: string | null;
    geo_precision: string | null; geo_confidence: number | null; geo_source: string | null;
  })[];
  const target = chooseAbsorbTarget(children, cityHint);
  if (!target) return { absorbed: false }; // no real branch to promote — leave for a human

  const full = children.find((c) => c.id === target.id)!;
  // Copy the branch's location facts onto the parent (keeping its id/slug/name),
  // making it a real flagship. location_label → null (a flagship isn't a branch).
  await db.from("restaurants").update({
    address: full.address,
    city: full.city,
    lat: full.lat,
    lng: full.lng,
    country: full.country,
    country_code: full.country_code,
    geo_precision: full.geo_precision,
    geo_confidence: full.geo_confidence,
    geo_source: full.geo_source,
    location_label: null,
    flagship_unset: false,
    needs_attention: false,
    attention_reason: null,
  }).eq("id", parentId);
  // Remove the now-duplicate branch (freshly created this run — no inbound refs).
  await db.from("restaurants").delete().eq("id", target.id);
  await auditField(db, parentId, "flagship", null,
    { promoted_from_seed: target.id, address: full.address },
    { source: "roster", changedBy: null, note: "address-less seed absorbed the best branch — no phantom flagship" });
  return { absorbed: true, promotedId: target.id, promotedLabel: full.location_label };
}
