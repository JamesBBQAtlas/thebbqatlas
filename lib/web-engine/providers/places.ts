/**
 * Google Places (Maps Platform) — provider #2 of the location-data provider tier.
 * Uses **Places API (New)** `places:searchText` (patch 0070 — our key is New-only; the
 * legacy Text Search endpoint returns REQUEST_DENIED "legacy API not enabled"). Returns
 * REAL records with real ids (`places:<id>`), never a model's invention.
 *
 * HARD RULE (security): only ever calls Google's own API — never the chain's protected
 * site, never an unlocker.
 *
 * Pure + injectable: `parsePlacesResult` + `buildSearchTextRequest` are pure (unit-tested
 * against the New API shapes); the sweep takes an injected `fetch` (and `sleep`) so the
 * network + page-token delay are stubbed in tests — no live key, no live calls.
 */
import type { ProviderBranch } from "../types";
import { localityFromAddress } from "@/lib/admin/address";
import { sharesBrand } from "./match";

/** Places API (New) Text Search — POST, key in a header, field mask REQUIRED. */
export const PLACES_SEARCHTEXT_URL = "https://places.googleapis.com/v1/places:searchText";
/** MINIMAL field mask — only what the roster renders, to stay in the cheap SKU tier.
 *  `nextPageToken` must be in the mask to receive it (it doesn't change the per-place SKU). */
export const PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,nextPageToken";
/** Text Search SKU list price — ~$32 / 1000 requests. Each page is one billable request. */
export const PLACES_COST_PER_CALL_USD = 0.032;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** A Places API (New) place resource (the shape our field mask returns). */
interface PlacesNewResult {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  location?: { latitude?: number; longitude?: number };
}

/**
 * Map one Places API (New) `place` to a ProviderBranch. Pure. New shapes (differ from
 * legacy): `id` (not `place_id`), `displayName.text` (not `name`), `formattedAddress`,
 * `location.latitude/longitude` (not `geometry.location.lat/lng`), `nationalPhoneNumber`.
 * The city is parsed from `formattedAddress` via the canonical parser. Returns null with
 * no id or no usable location.
 */
export function parsePlacesResult(raw: unknown): ProviderBranch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as PlacesNewResult;
  const placeId = str(r.id);
  if (!placeId) return null;
  const formatted = str(r.formattedAddress);
  const lat = toNum(r.location?.latitude);
  const lng = toNum(r.location?.longitude);
  if (!formatted && (lat == null || lng == null)) return null;
  const name = str(r.displayName?.text);
  const city = formatted ? localityFromAddress(formatted) || null : null;
  return {
    brand_name: name,
    location_label: name,
    address: formatted,
    city,
    region: null,
    postcode: null,
    country: null,
    lat,
    lng,
    phone: str(r.nationalPhoneNumber) ?? str(r.internationalPhoneNumber),
    external_id: placeId,
    platform: "places",
    provider: "places",
    provider_refs: [`places:${placeId}`],
    source_url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
  };
}

/** A `locationRestriction` for a region-scoped sweep (New API rectangle/circle). */
export type LocationRestriction =
  | { rectangle: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } } }
  | { circle: { center: { latitude: number; longitude: number }; radius: number } };

/** Build the exact Places API (New) `searchText` request — POST, header auth, required
 *  minimal field mask, JSON body. Exported so the request shape is unit-testable. */
export function buildSearchTextRequest(
  key: string,
  body: { textQuery: string; pageSize?: number; pageToken?: string; locationRestriction?: LocationRestriction }
): { url: string; init: RequestInit } {
  return {
    url: PLACES_SEARCHTEXT_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
  };
}

export interface PlacesBudget {
  /** Hard cap on billable requests this run (pages count individually). */
  maxCalls: number;
  /** Hard cap on spend (USD) this run — whichever cap trips first stops the sweep. */
  maxUsd: number;
  /** Per-request price (defaults to the Text Search SKU). */
  costPerCallUsd?: number;
}

/** One region of a geographic sweep — a key (e.g. a state code) + an optional
 *  `locationRestriction` (omit for the bare national query). */
export interface PlacesRegion {
  key: string;
  locationRestriction?: LocationRestriction;
}

export interface PlacesResult {
  branches: ProviderBranch[];
  /** Billable requests made. */
  calls: number;
  /** Estimated spend (USD) = calls × per-call price. */
  spendUsd: number;
  /** True when the sweep stopped early because a budget cap was hit. */
  capped: boolean;
  /** The last non-OK status seen (the New API's `error.status`, or an HTTP code). */
  status: string | null;
  error: string | null;
  /** How many branches each swept region returned (for the receipt + diagnosis). */
  perRegion: { key: string; count: number }[];
  /** Region keys fully swept this run (+ any passed as already-swept for a resume). */
  regionsSwept: string[];
  /** Region keys NOT swept because the cap tripped — the resume cursor. */
  regionsRemaining: string[];
}

interface PlacesPage {
  results: unknown[];
  nextPageToken: string | null;
  status: string;
  error: string | null;
}

/** One Places API (New) `searchText` request (one billable call). Never throws. */
async function searchTextPage(
  query: string,
  key: string,
  fetchImpl: typeof fetch,
  opts?: { pageToken?: string; locationRestriction?: LocationRestriction }
): Promise<PlacesPage> {
  const req = buildSearchTextRequest(key, {
    textQuery: query,
    pageSize: 20,
    ...(opts?.pageToken ? { pageToken: opts.pageToken } : {}),
    ...(opts?.locationRestriction ? { locationRestriction: opts.locationRestriction } : {}),
  });
  try {
    const res = await fetchImpl(req.url, req.init);
    const json = (await res.json().catch(() => null)) as
      | { places?: unknown[]; nextPageToken?: string; error?: { code?: number; message?: string; status?: string } }
      | null;
    if (!res.ok) {
      // New API errors come back as { error: { code, message, status } }.
      const status = json?.error?.status ?? `HTTP_${res.status}`;
      const error = json?.error?.message ?? `places http ${res.status}`;
      return { results: [], nextPageToken: null, status, error };
    }
    return {
      results: Array.isArray(json?.places) ? (json!.places as unknown[]) : [],
      nextPageToken: str(json?.nextPageToken),
      status: "OK",
      error: null,
    };
  } catch (e) {
    return { results: [], nextPageToken: null, status: "FETCH_ERROR", error: e instanceof Error ? e.message : String(e) };
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sweep Places API (New) for a brand and return deduped branches, cost-capped. Runs the
 * bare-brand query, then each optional region-scoped query (`"<brand> <region>"`) for a
 * systematic geographic sweep, paginating each up to 3 pages (the New API's max via
 * `nextPageToken`). A page token needs a moment to activate, so there's a short delay
 * between pages (injected `sleep`, a no-op in tests). Stops the moment `maxCalls` or
 * `maxUsd` is reached and reports `capped: true` — never silently truncates. Deduped by
 * place id across the run. (Overpass is the breadth source; Places verifies/fills — so a
 * light national sweep is usually enough.)
 */
export async function fetchPlaces(
  brand: string,
  opts: {
    key: string;
    fetchImpl: typeof fetch;
    /** Sweep regions (default: one bare national query). Each may carry a
     *  `locationRestriction` so the New API returns that region's branches. */
    regions?: PlacesRegion[];
    /** Region keys already swept on a prior run — skipped here (resume). */
    skipRegionKeys?: string[];
    budget: PlacesBudget;
    sleep?: (ms: number) => Promise<void>;
    pageDelayMs?: number;
    maxPagesPerQuery?: number;
  }
): Promise<PlacesResult> {
  const costPerCall = opts.budget.costPerCallUsd ?? PLACES_COST_PER_CALL_USD;
  const sleep = opts.sleep ?? defaultSleep;
  const pageDelayMs = opts.pageDelayMs ?? 1500;
  const maxPages = Math.max(1, Math.min(opts.maxPagesPerQuery ?? 3, 3));
  const allRegions: PlacesRegion[] = opts.regions?.length ? opts.regions : [{ key: "national" }];
  const skip = new Set(opts.skipRegionKeys ?? []);
  const regions = allRegions.filter((r) => !skip.has(r.key));

  const byPlaceId = new Map<string, ProviderBranch>();
  const perRegion: { key: string; count: number }[] = [];
  const regionsSwept: string[] = [...(opts.skipRegionKeys ?? [])];
  let calls = 0;
  let capped = false;
  let lastStatus: string | null = null;
  let lastError: string | null = null;
  let i = 0;

  const budgetLeft = () => calls < opts.budget.maxCalls && (calls + 1) * costPerCall <= opts.budget.maxUsd + 1e-9;

  for (; i < regions.length; i++) {
    if (!budgetLeft()) { capped = true; break; }
    const region = regions[i];
    let regionCount = 0;
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      if (page > 0 && !budgetLeft()) { capped = true; break; }
      if (page > 0 && pageToken) await sleep(pageDelayMs);
      const res = await searchTextPage(brand, opts.key, opts.fetchImpl, { pageToken, locationRestriction: region.locationRestriction });
      calls++;
      if (res.status !== "OK") { lastStatus = res.status; lastError = res.error; }
      for (const raw of res.results) {
        const branch = parsePlacesResult(raw);
        // Brand guard — a text search can return a nearby different eatery.
        if (branch && sharesBrand(branch.brand_name, brand) && branch.external_id) {
          if (!byPlaceId.has(branch.external_id)) { byPlaceId.set(branch.external_id, branch); regionCount++; }
        }
      }
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
    perRegion.push({ key: region.key, count: regionCount });
    regionsSwept.push(region.key);
    if (capped) { i++; break; }
  }
  // Anything we never reached (cap tripped) is the resume cursor.
  const regionsRemaining = regions.slice(i).map((r) => r.key);

  return {
    branches: [...byPlaceId.values()],
    calls,
    spendUsd: Number((calls * costPerCall).toFixed(4)),
    capped,
    status: lastStatus,
    error: lastError,
    perRegion,
    regionsSwept,
    regionsRemaining,
  };
}

/** Is the Places provider configured? (Overpass needs no key; Places needs this one.) */
export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}
