/**
 * Google Places (Maps Platform) — provider #2 of the location-data provider tier
 * (patch 0061). AUTHORITATIVE: Text Search for the brand returns `place_id`,
 * `formatted_address`, `geometry`, name (and sometimes phone/hours) — near-complete for
 * major chains. Effectively free inside Google's monthly Maps Platform credit at our
 * volume, but every billable request is COUNTED and cost-CAPPED with a logged stop.
 *
 * HARD RULE (security): only ever calls Google's own API — never the chain's protected
 * site, never an unlocker. Returns REAL records with real ids (`places:<place_id>`),
 * never a model's invention.
 *
 * Pure + injectable: `parsePlacesResult` is pure (unit-tested against the documented
 * Text Search shape); the sweep takes an injected `fetch` (and `sleep`) so the network
 * and the page-token delay are stubbed in tests — no live key, no live calls.
 */
import type { ProviderBranch } from "../types";
import { localityFromAddress } from "@/lib/admin/address";
import { sharesBrand } from "./match";

export const PLACES_TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
/** Text Search SKU list price — $32 / 1000 requests. Each page is one billable request. */
export const PLACES_COST_PER_CALL_USD = 0.032;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

interface PlacesRawResult {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
}

/**
 * Map one Text Search result to a ProviderBranch. Pure. The street line is the first
 * segment of `formatted_address` (kept whole as the address so provenance is complete;
 * `normStreet` keys on the first comma-part downstream), the city via the canonical
 * `localityFromAddress` parser. Returns null when there is no place_id or no usable
 * location (a result with neither an address nor coordinates).
 */
export function parsePlacesResult(raw: unknown): ProviderBranch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as PlacesRawResult;
  const placeId = str(r.place_id);
  if (!placeId) return null;
  const formatted = str(r.formatted_address);
  const lat = toNum(r.geometry?.location?.lat);
  const lng = toNum(r.geometry?.location?.lng);
  if (!formatted && (lat == null || lng == null)) return null;
  const city = formatted ? localityFromAddress(formatted) || null : null;
  return {
    brand_name: str(r.name),
    location_label: str(r.name),
    address: formatted,
    city,
    region: null,
    postcode: null,
    country: null,
    lat,
    lng,
    phone: str(r.formatted_phone_number) ?? str(r.international_phone_number),
    external_id: placeId,
    platform: "places",
    provider: "places",
    provider_refs: [`places:${placeId}`],
    source_url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
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

export interface PlacesResult {
  branches: ProviderBranch[];
  /** Billable requests made. */
  calls: number;
  /** Estimated spend (USD) = calls × per-call price. */
  spendUsd: number;
  /** True when the sweep stopped early because a budget cap was hit. */
  capped: boolean;
  /** The last non-OK Google status seen (REQUEST_DENIED, OVER_QUERY_LIMIT, …), if any. */
  status: string | null;
  error: string | null;
}

interface PlacesPage {
  results: unknown[];
  nextPageToken: string | null;
  status: string;
  error: string | null;
}

/** One Text Search request (one billable call). Never throws. */
async function textSearchPage(
  query: string,
  key: string,
  fetchImpl: typeof fetch,
  pageToken?: string
): Promise<PlacesPage> {
  const params = new URLSearchParams({ query, key });
  if (pageToken) params.set("pagetoken", pageToken);
  try {
    const res = await fetchImpl(`${PLACES_TEXTSEARCH_URL}?${params.toString()}`);
    if (!res.ok) return { results: [], nextPageToken: null, status: `HTTP_${res.status}`, error: `places http ${res.status}` };
    const body = (await res.json()) as { results?: unknown[]; next_page_token?: string; status?: string; error_message?: string };
    const status = body.status ?? "UNKNOWN";
    return {
      results: Array.isArray(body.results) ? body.results : [],
      nextPageToken: str(body.next_page_token),
      status,
      error: status !== "OK" && status !== "ZERO_RESULTS" ? body.error_message ?? status : null,
    };
  } catch (e) {
    return { results: [], nextPageToken: null, status: "FETCH_ERROR", error: e instanceof Error ? e.message : String(e) };
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sweep Google Places for a brand and return deduped branches, cost-capped. Runs the
 * bare-brand query, then each optional region-scoped query ("<brand> in <region>") for a
 * systematic geographic sweep, paginating each up to 3 pages (Google's max). A page
 * token needs a moment to activate, so there's a short delay between pages (injected as
 * `sleep`, a no-op in tests). Stops the moment `maxCalls` or `maxUsd` is reached and
 * reports `capped: true` — never silently truncates. Deduped by place_id across the run.
 */
export async function fetchPlaces(
  brand: string,
  opts: {
    key: string;
    fetchImpl: typeof fetch;
    regions?: string[];
    budget: PlacesBudget;
    sleep?: (ms: number) => Promise<void>;
    pageDelayMs?: number;
    maxPagesPerQuery?: number;
  }
): Promise<PlacesResult> {
  const costPerCall = opts.budget.costPerCallUsd ?? PLACES_COST_PER_CALL_USD;
  const sleep = opts.sleep ?? defaultSleep;
  const pageDelayMs = opts.pageDelayMs ?? 2000;
  const maxPages = Math.max(1, Math.min(opts.maxPagesPerQuery ?? 3, 3));
  const queries = [brand, ...(opts.regions ?? []).map((r) => `${brand} in ${r}`)];

  const byPlaceId = new Map<string, ProviderBranch>();
  let calls = 0;
  let capped = false;
  let lastStatus: string | null = null;
  let lastError: string | null = null;

  const budgetLeft = () => calls < opts.budget.maxCalls && (calls + 1) * costPerCall <= opts.budget.maxUsd + 1e-9;

  outer: for (const query of queries) {
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      if (!budgetLeft()) { capped = true; break outer; }
      if (page > 0 && pageToken) await sleep(pageDelayMs);
      const res = await textSearchPage(query, opts.key, opts.fetchImpl, pageToken);
      calls++;
      if (res.status !== "OK" && res.status !== "ZERO_RESULTS") { lastStatus = res.status; lastError = res.error; }
      for (const raw of res.results) {
        const branch = parsePlacesResult(raw);
        // Brand guard — Places text search can return a nearby different eatery.
        if (branch && sharesBrand(branch.brand_name, brand) && branch.external_id) {
          if (!byPlaceId.has(branch.external_id)) byPlaceId.set(branch.external_id, branch);
        }
      }
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
  }

  return {
    branches: [...byPlaceId.values()],
    calls,
    spendUsd: Number((calls * costPerCall).toFixed(4)),
    capped,
    status: lastStatus,
    error: lastError,
  };
}

/** Is the Places provider configured? (Overpass needs no key; Places needs this one.) */
export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}
