/**
 * Location-data provider tier — orchestrator (patch 0061). Discovery TIER 3:
 * normal crawl → render engine → THIS provider tier → loud hold/hand-seed. It sources
 * bot-protected chains (City Barbeque, Mission) from SANCTIONED provider APIs
 * (OpenStreetMap/Overpass + Google Places) instead of their guarded sites — legitimate,
 * non-circumventing, and returning REAL records with provider ids, never a model's
 * invention.
 *
 * Two jobs:
 *   1. discoverViaProviders — OSM breadth + Places authority, cross-source deduped,
 *      handed to the SAME chain machinery as gated seeds (Part A naming + normStreet
 *      dedupe, no fork). Prefers the provider's lat/long; only geocodes what's missing.
 *   2. providerCrossCheck — a cheap count-and-compare (OSM only, free) run on EVERY
 *      chain after it rosters from its own feed: agree → raise confidence; disagree →
 *      flag the specific missing/extra branches. Never a full re-import, never an
 *      overwrite — the own feed stays the authoritative primary.
 *
 * HARD RULES enforced here: only provider APIs are ever called (no protected site, no
 * unlocker); a model is NEVER asked to enumerate branches; everything lands gated.
 */
import type { ProviderBranch } from "../types";
import { feedBranchesToSeeds, locationKey, type FeedToSeeds } from "../feed-to-seeds";
import { haversineKm } from "@/lib/utils/geo";
import type { SeedLocation } from "@/lib/admin/chain-seed";
import { fetchOverpass, type OverpassResult } from "./overpass";
import { fetchPlaces, PLACES_COST_PER_CALL_USD, type PlacesBudget, type PlacesResult } from "./places";

/** Two provider records are the "same place" if their pins are within ≈150 m — the
 *  geo-proximity backstop for when street tagging differs across the two sources. */
const SAME_PLACE_KM = 0.15;

function hasPin(b: { lat?: number | null; lng?: number | null }): boolean {
  return (
    typeof b.lat === "number" && typeof b.lng === "number" &&
    Number.isFinite(b.lat) && Number.isFinite(b.lng) && !(b.lat === 0 && b.lng === 0)
  );
}

/** Does this branch carry a real street key (not just a bare city)? */
function streetKeyOf(b: ProviderBranch): string {
  const k = locationKey(b.address, b.city);
  const street = k.split("|")[0] ?? "";
  return street;
}

export interface MergeResult {
  branches: ProviderBranch[];
  /** How many OSM branches collapsed onto a Places branch (cross-source duplicates). */
  crossSourceDupes: number;
  /** Final count sourced primarily from each provider. */
  fromPlaces: number;
  fromOsm: number;
}

/**
 * Merge OSM + Places branches into one deduped set. PLACES is preferred for authority:
 * a Places branch is kept as the primary record; a matching OSM branch only contributes
 * its provider ref (and fills a field Places lacked — a phone, a pin). Matching is by
 * the shared `normStreet` identity key first, then a geo-proximity backstop (≈150 m) for
 * when the two sources tag the street differently. An OSM branch with no Places match is
 * kept on its own. Within each source, exact street-key duplicates collapse too.
 */
export function mergeProviderBranches(osm: ProviderBranch[], places: ProviderBranch[]): MergeResult {
  const primaries: ProviderBranch[] = [];
  const byKey = new Map<string, ProviderBranch>();

  const addPrimary = (b: ProviderBranch) => {
    const key = streetKeyOf(b);
    if (key) {
      const existing = byKey.get(key);
      if (existing) { mergeInto(existing, b); return; }
    }
    // Geo backstop within the same source (a keyless/city-only near-duplicate).
    if (hasPin(b)) {
      const near = primaries.find((p) => hasPin(p) && haversineKm(p.lat!, p.lng!, b.lat!, b.lng!) <= SAME_PLACE_KM);
      if (near) { mergeInto(near, b); return; }
    }
    primaries.push(b);
    if (key) byKey.set(key, b);
  };

  // Places first — they become the authoritative primaries.
  for (const p of places) addPrimary(p);

  let crossSourceDupes = 0;
  for (const o of osm) {
    const key = streetKeyOf(o);
    let target: ProviderBranch | undefined = key ? byKey.get(key) : undefined;
    if (!target && hasPin(o)) {
      target = primaries.find((p) => hasPin(p) && haversineKm(p.lat!, p.lng!, o.lat!, o.lng!) <= SAME_PLACE_KM);
    }
    if (target) {
      mergeInto(target, o);
      crossSourceDupes++;
    } else {
      addPrimary(o);
    }
  }

  const fromPlaces = primaries.filter((b) => b.provider === "places").length;
  const fromOsm = primaries.filter((b) => b.provider === "osm").length;
  return { branches: primaries, crossSourceDupes, fromPlaces, fromOsm };
}

/** Fold `src`'s provider refs (and any field the primary lacks) into `primary`. The
 *  primary's OWN provider stays authoritative; only its provenance ids grow. */
function mergeInto(primary: ProviderBranch, src: ProviderBranch): void {
  for (const ref of src.provider_refs) {
    if (!primary.provider_refs.includes(ref)) primary.provider_refs.push(ref);
  }
  if (!primary.phone && src.phone) primary.phone = src.phone;
  if (!primary.postcode && src.postcode) primary.postcode = src.postcode;
  if (!primary.region && src.region) primary.region = src.region;
  if (!primary.country && src.country) primary.country = src.country;
  if (!hasPin(primary) && hasPin(src)) { primary.lat = src.lat; primary.lng = src.lng; }
  if (!primary.address && src.address) primary.address = src.address;
  if (!primary.city && src.city) primary.city = src.city;
}

export interface ProviderDiscovery {
  seeds: SeedLocation[];
  branches: ProviderBranch[];
  deduped: number;
  dropped: number;
  debug: {
    tier: "provider" | "none";
    osm: { count: number; rawElements: number; error: string | null };
    places: { count: number; calls: number; spendUsd: number; capped: boolean; status: string | null; error: string | null };
    merged: number;
    crossSourceDupes: number;
    fromPlaces: number;
    fromOsm: number;
    seedCount: number;
    deduped: number;
    dropped: number;
    reason: string | null;
  };
}

/**
 * Run the provider tier for a chain and produce GATED seeds. OSM first (free, one call);
 * Places second (authoritative, cost-capped) when a key is configured. Merge, then hand
 * to the SAME feed→seeds shaper with `carryProvider` so each seed keeps the provider pin
 * + refs and is force-gated downstream. Never throws — a dead provider comes back as a
 * loud structured empty (tier "none") so the caller hand-seeds, never a silent zero.
 */
export async function discoverViaProviders(opts: {
  brand: string;
  fetchImpl: typeof fetch;
  /** Google Places key — when absent, the tier runs OSM-only (still valid, still gated). */
  placesKey?: string | null;
  /** Region terms for a deeper Places sweep ("Ohio", "Georgia", …). Optional. */
  regions?: string[];
  /** Places per-run cost cap. Defaults: 15 calls / $0.60. */
  placesBudget?: Partial<PlacesBudget>;
  overpassEndpoint?: string;
  /** Test seams. */
  sleep?: (ms: number) => Promise<void>;
  pageDelayMs?: number;
}): Promise<ProviderDiscovery> {
  const osm: OverpassResult = await fetchOverpass(opts.brand, {
    fetchImpl: opts.fetchImpl,
    endpoint: opts.overpassEndpoint,
  });

  let places: PlacesResult = { branches: [], calls: 0, spendUsd: 0, capped: false, status: null, error: null };
  if (opts.placesKey) {
    const budget: PlacesBudget = {
      maxCalls: opts.placesBudget?.maxCalls ?? 15,
      maxUsd: opts.placesBudget?.maxUsd ?? 0.6,
      costPerCallUsd: opts.placesBudget?.costPerCallUsd ?? PLACES_COST_PER_CALL_USD,
    };
    places = await fetchPlaces(opts.brand, {
      key: opts.placesKey,
      fetchImpl: opts.fetchImpl,
      regions: opts.regions,
      budget,
      sleep: opts.sleep,
      pageDelayMs: opts.pageDelayMs,
    });
  }

  const merged = mergeProviderBranches(osm.branches, places.branches);
  const { seeds, deduped, dropped }: FeedToSeeds = feedBranchesToSeeds(merged.branches, opts.brand, { carryProvider: true });
  const tier: "provider" | "none" = seeds.length ? "provider" : "none";

  return {
    seeds,
    branches: merged.branches,
    deduped,
    dropped,
    debug: {
      tier,
      osm: { count: osm.branches.length, rawElements: osm.rawElements, error: osm.error },
      places: { count: places.branches.length, calls: places.calls, spendUsd: places.spendUsd, capped: places.capped, status: places.status, error: places.error },
      merged: merged.branches.length,
      crossSourceDupes: merged.crossSourceDupes,
      fromPlaces: merged.fromPlaces,
      fromOsm: merged.fromOsm,
      seedCount: seeds.length,
      deduped,
      dropped,
      reason:
        tier === "none"
          ? `provider tier — OSM ${osm.branches.length}, Places ${places.branches.length}, 0 usable branches — hand-seed${osm.error ? ` (osm: ${osm.error})` : ""}${places.error ? ` (places: ${places.error})` : ""}`
          : null,
    },
  };
}

export interface CrossCheck {
  ownCount: number;
  providerCount: number;
  /** True when the two sources line up: no branch is missing from either side. */
  agree: boolean;
  /** Provider branches with no matching own-feed location — a branch the locator may
   *  have missed (verify), keyed by normStreet|normCity. */
  missingFromOwn: string[];
  /** Own-feed locations with no matching provider record — possibly a stale/closed
   *  branch, or one the providers simply don't carry (confirm). */
  extraInOwn: string[];
}

/**
 * PURE count-and-compare of a chain's own-feed roster against provider records, on the
 * ONE shared `normStreet|normCity` key. The own feed stays authoritative — this only
 * flags where the two disagree so a human can look. A location whose key is empty
 * (neither street nor city) is ignored on both sides (nothing to compare).
 */
export function crossCheckCounts(
  ownSeeds: Array<{ address?: string | null; city?: string | null }>,
  providerBranches: Array<{ address?: string | null; city?: string | null }>
): CrossCheck {
  const ownKeys = new Set<string>();
  for (const s of ownSeeds) {
    const k = locationKey(s.address, s.city);
    if (k !== "|") ownKeys.add(k);
  }
  const provKeys = new Set<string>();
  for (const b of providerBranches) {
    const k = locationKey(b.address, b.city);
    if (k !== "|") provKeys.add(k);
  }
  const missingFromOwn = [...provKeys].filter((k) => !ownKeys.has(k));
  const extraInOwn = [...ownKeys].filter((k) => !provKeys.has(k));
  return {
    ownCount: ownKeys.size,
    providerCount: provKeys.size,
    agree: missingFromOwn.length === 0 && extraInOwn.length === 0,
    missingFromOwn,
    extraInOwn,
  };
}

/**
 * Run the cheap cross-check for a rostered chain: fetch the OSM count ONLY (free — no
 * Places spend on a second opinion, per the cost rule) and compare to the own-feed
 * seeds. Best-effort: an OSM error yields a null result the caller records but never
 * fails the roster on.
 */
export async function providerCrossCheck(opts: {
  brand: string;
  ownSeeds: Array<{ address?: string | null; city?: string | null }>;
  fetchImpl: typeof fetch;
  overpassEndpoint?: string;
}): Promise<{ ran: boolean; osmError: string | null; check: CrossCheck | null }> {
  const osm = await fetchOverpass(opts.brand, { fetchImpl: opts.fetchImpl, endpoint: opts.overpassEndpoint });
  if (osm.error && osm.branches.length === 0) {
    return { ran: false, osmError: osm.error, check: null };
  }
  return { ran: true, osmError: osm.error, check: crossCheckCounts(opts.ownSeeds, osm.branches) };
}

/**
 * Is the provider tier enabled? Overpass needs no key, so the tier can run OSM-only when
 * explicitly switched on (PROVIDER_TIER_OSM=on); a Google Places key adds the
 * authoritative second source. Inert until one of these is set, mirroring the render
 * engine's gated-on-env pattern — nothing external is called before ops turns it on.
 */
export function providersConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY) || process.env.PROVIDER_TIER_OSM === "on";
}
