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
import { fetchOverpass, resolveWikidataId, type OverpassResult } from "./overpass";
import { fetchPlaces, PLACES_COST_PER_CALL_USD, type PlacesBudget, type PlacesResult, type PlacesRegion } from "./places";
import { usStateRegions, US_STATE_CODES } from "./us-regions";

/** Force-path ("Roster from providers") Places budget — James approved ~$3 to pull a
 *  whole chain. Kept OFF the automated single-venue path (which stays at $0.60). */
export const FORCE_PLACES_MAX_USD = 3.0;
export const FORCE_PLACES_MAX_CALLS = 100;

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

const EMPTY_PLACES: PlacesResult = {
  branches: [], calls: 0, spendUsd: 0, capped: false, status: null, error: null,
  perRegion: [], regionsSwept: [], regionsRemaining: [],
};

export interface ProviderDiscovery {
  seeds: SeedLocation[];
  branches: ProviderBranch[];
  deduped: number;
  dropped: number;
  /** The Wikidata id used/resolved for the OSM match (cache this on the flagship). */
  wikidataId: string | null;
  /** Places regions swept this run + any not reached (the resume cursor). */
  regionsSwept: string[];
  regionsRemaining: string[];
  debug: {
    tier: "provider" | "none";
    osm: { count: number; rawElements: number; variants: OverpassResult["variants"]; error: string | null };
    places: {
      count: number; calls: number; spendUsd: number; capped: boolean; status: string | null; error: string | null;
      perRegion: { key: string; count: number }[];
    };
    wikidataId: string | null;
    merged: number;
    crossSourceDupes: number;
    fromPlaces: number;
    fromOsm: number;
    seedCount: number;
    deduped: number;
    dropped: number;
    regionsSwept: number;
    regionsRemaining: number;
    reason: string | null;
  };
}

/**
 * Run the provider tier for a chain and produce GATED seeds (patch 0071 — COVERAGE).
 *   • OSM breadth: one free Overpass call matched by `brand:wikidata` (resolved from the
 *     flagship's Wikipedia link, cached) + a spelling-tolerant brand/name regex.
 *   • Places gap-fill: on the FORCE path a geographic sweep (national + every US state OSM
 *     didn't already cover), paginated + deduped, under a raised (~$3) cap; the automated
 *     path stays a single national query at the low cap. `skipRegionKeys` resumes a
 *     cap-stopped sweep from its cursor (dedupe + append, never restart).
 * Merge (normStreet + geo backstop, prefer Places, keep every id), then hand to the SAME
 * feed→seeds shaper with `carryProvider` (force-gated downstream). Never throws.
 */
export async function discoverViaProviders(opts: {
  brand: string;
  fetchImpl: typeof fetch;
  /** Google Places key — when absent, the tier runs OSM-only (still valid, still gated). */
  placesKey?: string | null;
  /** Pre-resolved Wikidata id (cached on the flagship dossier) — skips the lookup. */
  wikidataId?: string | null;
  /** The flagship's Wikipedia URL, to resolve the Wikidata id if not already cached. */
  wikipediaUrl?: string | null;
  /** FORCE path: geographic Places sweep + raised cap. The automated path leaves it off. */
  fullSweep?: boolean;
  /** Region keys already swept (resume cursor) — skipped this run. */
  skipRegionKeys?: string[];
  /** Places per-run cost cap override. */
  placesBudget?: Partial<PlacesBudget>;
  overpassEndpoint?: string;
  /** Test seams. */
  sleep?: (ms: number) => Promise<void>;
  pageDelayMs?: number;
}): Promise<ProviderDiscovery> {
  // Resolve the Wikidata id (gold-standard OSM match) if not already cached.
  let wikidataId = opts.wikidataId ?? null;
  if (!wikidataId && opts.wikipediaUrl) {
    wikidataId = await resolveWikidataId({ fetchImpl: opts.fetchImpl, wikipediaUrl: opts.wikipediaUrl });
  }

  const osm: OverpassResult = await fetchOverpass(opts.brand, {
    fetchImpl: opts.fetchImpl,
    endpoint: opts.overpassEndpoint,
    wikidataId,
  });

  let places: PlacesResult = EMPTY_PLACES;
  if (opts.placesKey) {
    // Gap-fill: sweep only states OSM didn't already cover (a working OSM keeps Places
    // cheap). The bare national query always runs (catches cross-state top results).
    const coveredStates = new Set(
      osm.branches.map((b) => (b.region ?? "").toUpperCase()).filter((s) => US_STATE_CODES.includes(s))
    );
    const regions: PlacesRegion[] = opts.fullSweep
      ? [{ key: "national" }, ...usStateRegions().filter((r) => !coveredStates.has(r.key))]
      : [{ key: "national" }];
    const budget: PlacesBudget = {
      maxCalls: opts.placesBudget?.maxCalls ?? (opts.fullSweep ? FORCE_PLACES_MAX_CALLS : 15),
      maxUsd: opts.placesBudget?.maxUsd ?? (opts.fullSweep ? FORCE_PLACES_MAX_USD : 0.6),
      costPerCallUsd: opts.placesBudget?.costPerCallUsd ?? PLACES_COST_PER_CALL_USD,
    };
    places = await fetchPlaces(opts.brand, {
      key: opts.placesKey,
      fetchImpl: opts.fetchImpl,
      regions,
      skipRegionKeys: opts.skipRegionKeys,
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
    wikidataId,
    regionsSwept: places.regionsSwept,
    regionsRemaining: places.regionsRemaining,
    debug: {
      tier,
      osm: { count: osm.branches.length, rawElements: osm.rawElements, variants: osm.variants, error: osm.error },
      places: {
        count: places.branches.length, calls: places.calls, spendUsd: places.spendUsd,
        capped: places.capped, status: places.status, error: places.error, perRegion: places.perRegion,
      },
      wikidataId,
      merged: merged.branches.length,
      crossSourceDupes: merged.crossSourceDupes,
      fromPlaces: merged.fromPlaces,
      fromOsm: merged.fromOsm,
      seedCount: seeds.length,
      deduped,
      dropped,
      regionsSwept: places.regionsSwept.length,
      regionsRemaining: places.regionsRemaining.length,
      reason:
        tier === "none"
          ? `provider tier — OSM ${osm.branches.length} (raw ${osm.rawElements}), Places ${places.branches.length}, 0 usable branches — hand-seed${osm.error ? ` (osm: ${osm.error})` : ""}${places.error ? ` (places: ${places.error})` : ""}`
          : null,
    },
  };
}

/** The numbers behind a "From providers" run's visible receipt (patch 0071 Part C). */
export interface ProviderReceipt {
  found: number;
  osm: number;
  places: number;
  deduped: number;
  spendUsd: number;
  capUsd: number;
  regionsSwept: number;
  regionsTotal: number;
  capped: boolean;
  /** Best-effort expected total (OSM raw count / known size) for the "remaining" estimate. */
  expectedTotal?: number | null;
}

/** A one-line receipt shown on the chain parent — always, every run. Pure. */
export function formatProviderReceipt(r: ProviderReceipt): string {
  const regionPart = r.regionsTotal > 1 ? ` · swept ${r.regionsSwept}/${r.regionsTotal} regions` : "";
  const dedupePart = r.deduped ? ` · deduped ${r.deduped}` : "";
  return `Found ${r.found} location${r.found === 1 ? "" : "s"} · OSM ${r.osm} · Places ${r.places}${dedupePart}${regionPart} · spent $${r.spendUsd.toFixed(2)} (cap $${r.capUsd.toFixed(2)})`;
}

/** When a run stopped BECAUSE it hit the cap, an explicit, estimated notice — the alert
 *  James asked for. Null when the run wasn't capped (completed). Pure. */
export function providerInformedStop(r: ProviderReceipt): string | null {
  if (!r.capped) return null;
  const unswept = Math.max(0, r.regionsTotal - r.regionsSwept);
  const remainEst =
    r.expectedTotal && r.expectedTotal > r.found ? `~${r.expectedTotal - r.found} likely remaining; ` : "";
  return `⏸ Stopped at the $${r.capUsd.toFixed(2)} cap — found ${r.found}; ${remainEst}${unswept} region${unswept === 1 ? "" : "s"} not yet swept. Use “Continue sweeping” to resume.`;
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
