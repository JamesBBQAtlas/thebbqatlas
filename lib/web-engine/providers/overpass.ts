/**
 * OpenStreetMap via the Overpass API — provider #1 of the location-data provider tier
 * (patch 0061). FREE, no key, and one call covers a national chain. We query OSM for a
 * brand and read back every tagged venue's `addr:*` tags + centre lat/long + the OSM
 * element id. Breadth is excellent; tagging can be incomplete/stale (volunteer data),
 * which is exactly why Places verifies/fills and why EVERY provider branch lands gated.
 *
 * HARD RULE (security): this only ever calls the public Overpass endpoint — never the
 * chain's protected site, never a residential-IP unlocker. It returns REAL records with
 * real ids (`osm:<type>/<id>`), never a model's invention.
 *
 * Pure + injectable: `parseOverpass` is a pure payload→branches function (unit-tested
 * against the documented `out center tags` shape); `fetchOverpass` takes an injected
 * `fetch` so the network is stubbed in tests (the established engine seam).
 */
import type { ProviderBranch } from "../types";
import { matchesBrandIdentity } from "./match";

/** Public Overpass endpoint (overridable via env for a self-hosted instance at scale). */
export const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Mirror fallback order (patch 0070) — a 406/429/5xx on one is retried on the next. */
export const OVERPASS_MIRRORS = [
  DEFAULT_OVERPASS_ENDPOINT,
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

/** A DESCRIPTIVE User-Agent — Overpass etiquette REQUIRES this; many mirrors 406/429 an
 *  anonymous datacenter request without it (the live 406 bug in patch 0070). */
export const OVERPASS_USER_AGENT =
  "TheBBQAtlas/1.0 (+https://thebbqatlas.com; contact: james@thebbqatlas.com)";

/** Escape a brand for use inside a (PCRE / JS) regex literal. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A SPELLING-TOLERANT, case-insensitive regex body for a brand (patch 0071). The 0070
 * live run matched 0 in OSM because the free-text tags spell it inconsistently — most
 * often "Barbecue" (-cue) where the brand is "Barbeque" (-que). We fold `barbeque` /
 * `barbecue` to `Barbe[qc]ue` so either OSM spelling matches, and escape every other
 * metachar. e.g. "City Barbeque" → "City Barbe[qc]ue". Valid as both an Overpass and a
 * JS regex body.
 */
export function tolerantBrandRegex(brand: string): string {
  const escaped = escapeRegex(brand.trim());
  return escaped.replace(/barbe[qc]ue/gi, "Barbe[qc]ue");
}

/**
 * Build the Overpass QL for a brand. Unions, most-reliable first:
 *   • `brand:wikidata=Q…` — the GOLD STANDARD chain tag (spelling-independent), when the
 *     brand's Wikidata id is known (resolved from its Wikipedia page, cached on dossier);
 *   • a spelling-tolerant `brand` regex (`~"City Barbe[qc]ue",i`);
 *   • the same tolerant regex on `name` (branches a mapper named but never brand-tagged).
 * NO exact-equality match (that returned 0 in 0070). Queried GLOBALLY — a brand/wikidata
 * tag is specific enough that no area filter is needed. `out center tags` returns each
 * element's tags + a representative lat/long (node's own, or way/relation centre).
 */
export function overpassQuery(brand: string, opts?: { timeoutSec?: number; wikidataId?: string | null }): string {
  const rx = tolerantBrandRegex(brand);
  const timeout = Math.max(25, Math.min(opts?.timeoutSec ?? 60, 180));
  const members: string[] = [];
  if (opts?.wikidataId && /^Q\d+$/.test(opts.wikidataId)) {
    members.push(`  nwr["brand:wikidata"="${opts.wikidataId}"];`);
  }
  members.push(`  nwr["brand"~"${rx}",i];`);
  members.push(`  nwr["name"~"${rx}",i];`);
  return [`[out:json][timeout:${timeout}];`, `(`, ...members, `);`, `out center tags;`].join("\n");
}

/**
 * Resolve a brand's Wikidata id (Q…) from its Wikipedia article — the id OSM tags chain
 * outlets with. Reads `pageprops.wikibase_item` off the Wikipedia API. Injectable fetch;
 * null on anything unresolved (the query then falls back to the tolerant regex). Cache
 * the result on the flagship's dossier so it's resolved once per chain.
 */
export async function resolveWikidataId(opts: {
  fetchImpl: typeof fetch;
  wikipediaUrl?: string | null;
  title?: string | null;
}): Promise<string | null> {
  let title = opts.title ?? null;
  if (!title && opts.wikipediaUrl) {
    const m = opts.wikipediaUrl.match(/\/wiki\/([^?#]+)/);
    if (m) title = decodeURIComponent(m[1]);
  }
  if (!title) return null;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const res = await opts.fetchImpl(url, { headers: { "user-agent": OVERPASS_USER_AGENT, accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> } };
    for (const p of Object.values(body.query?.pages ?? {})) {
      const q = p?.pageprops?.wikibase_item;
      if (q && /^Q\d+$/.test(q)) return q;
    }
    return null;
  } catch {
    return null;
  }
}

const tagStr = (tags: Record<string, unknown>, key: string): string | null => {
  const v = tags[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Compose the OSM street line from addr:housenumber + addr:street (+ addr:unit). */
function osmStreet(tags: Record<string, unknown>): string | null {
  const hn = tagStr(tags, "addr:housenumber");
  const street = tagStr(tags, "addr:street");
  const unit = tagStr(tags, "addr:unit");
  const line = [hn, street].filter(Boolean).join(" ").trim();
  const withUnit = [line, unit ? `Unit ${unit}` : null].filter(Boolean).join(" ").trim();
  return withUnit || null;
}

interface OverpassElement {
  type?: string;
  id?: number | string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, unknown>;
}

/**
 * Parse an Overpass `out center tags` JSON body into ProviderBranch[]. Pure. Keeps only
 * elements that (a) carry a usable location — a street, OR a city with coordinates — and
 * (b) plausibly belong to `brand` (the regex union can pull a near-name; `sharesBrand`
 * filters it). Every kept branch carries `osm:<type>/<id>` as its provider ref.
 */
export function parseOverpass(body: unknown, brand: string, opts?: { wikidataId?: string | null }): ProviderBranch[] {
  const elements =
    body && typeof body === "object" && Array.isArray((body as { elements?: unknown }).elements)
      ? ((body as { elements: unknown[] }).elements as OverpassElement[])
      : [];
  const wikidataId = opts?.wikidataId ?? null;
  const out: ProviderBranch[] = [];
  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const tags = (el.tags && typeof el.tags === "object" ? el.tags : {}) as Record<string, unknown>;
    const brandTag = tagStr(tags, "brand") ?? tagStr(tags, "brand:en");
    const nameTag = tagStr(tags, "name") ?? tagStr(tags, "name:en");
    // Brand guard (0073) — a `brand:wikidata` id match is the HARD signal and is
    // accepted outright. Otherwise the record's own brand/name must EXACTLY be the
    // chain (strict identity), not a loose token overlap: a generic name like "City
    // Barbeque" reduces to the token "city", which the old loose guard let match
    // "Park City BBQ", "…City…", etc. Exact identity keeps real branches, drops the rest.
    const wikidataMatch = Boolean(wikidataId && tagStr(tags, "brand:wikidata") === wikidataId);
    if (!wikidataMatch && !matchesBrandIdentity(brandTag, brand) && !matchesBrandIdentity(nameTag, brand)) continue;

    const lat = toNum(el.lat) ?? toNum(el.center?.lat);
    const lng = toNum(el.lon) ?? toNum(el.center?.lon);
    const address = osmStreet(tags);
    const city = tagStr(tags, "addr:city") ?? tagStr(tags, "addr:town") ?? tagStr(tags, "addr:suburb");
    // Needs a real location: a street, or a city we can pin with coordinates.
    if (!address && !(city && lat != null && lng != null)) continue;

    const type = String(el.type ?? "node");
    const id = el.id != null ? String(el.id) : null;
    if (!id) continue;
    const ref = `osm:${type}/${id}`;

    out.push({
      brand_name: brandTag,
      location_label: nameTag,
      address,
      city,
      region: tagStr(tags, "addr:state") ?? tagStr(tags, "addr:province"),
      postcode: tagStr(tags, "addr:postcode"),
      country: tagStr(tags, "addr:country"),
      lat,
      lng,
      phone: tagStr(tags, "phone") ?? tagStr(tags, "contact:phone"),
      external_id: `${type}/${id}`,
      platform: "osm",
      provider: "osm",
      provider_refs: [ref],
      source_url: `https://www.openstreetmap.org/${type}/${id}`,
    });
  }
  return out;
}

export interface OverpassVariantCounts {
  /** Elements matched by `brand:wikidata` (the gold standard). */
  byWikidata: number;
  /** Elements matched by the tolerant `brand` regex (not already wikidata). */
  byBrand: number;
  /** Elements matched by the tolerant `name` regex (not brand/wikidata). */
  byName: number;
}

export interface OverpassResult {
  branches: ProviderBranch[];
  /** Raw element count returned (before the brand/location filter). */
  rawElements: number;
  /** Per-variant attribution — so a residual 0 shows WHICH match returned nothing. */
  variants: OverpassVariantCounts;
  status: number;
  error: string | null;
}

/** Attribute each returned element to the query variant that found it (patch 0071) —
 *  post-hoc from tags, so a 0 is diagnosable ("byWikidata 0, byBrand 61, byName 0"). */
export function overpassVariantCounts(body: unknown, brand: string, wikidataId?: string | null): OverpassVariantCounts {
  const elements =
    body && typeof body === "object" && Array.isArray((body as { elements?: unknown }).elements)
      ? ((body as { elements: unknown[] }).elements as OverpassElement[])
      : [];
  const rx = new RegExp(tolerantBrandRegex(brand), "i");
  const counts: OverpassVariantCounts = { byWikidata: 0, byBrand: 0, byName: 0 };
  for (const el of elements) {
    const tags = (el?.tags && typeof el.tags === "object" ? el.tags : {}) as Record<string, unknown>;
    if (wikidataId && tags["brand:wikidata"] === wikidataId) { counts.byWikidata++; continue; }
    const brandTag = typeof tags.brand === "string" ? tags.brand : "";
    if (brandTag && rx.test(brandTag)) { counts.byBrand++; continue; }
    const nameTag = typeof tags.name === "string" ? tags.name : "";
    if (nameTag && rx.test(nameTag)) { counts.byName++; continue; }
  }
  return counts;
}

const EMPTY_VARIANTS: OverpassVariantCounts = { byWikidata: 0, byBrand: 0, byName: 0 };

/** A status worth retrying on the next mirror: 403/406 (politeness/UA), 429 (rate), 5xx.
 *  A 400 is a bad QL — the same everywhere, so we don't waste mirrors on it. */
function overpassRetryable(status: number): boolean {
  return status === 403 || status === 406 || status === 429 || status >= 500;
}

/**
 * Query Overpass for a brand and return parsed branches. `fetchImpl` is injected (the
 * global fetch in production, a stub in tests). Never throws.
 *
 * Patch 0070 — the live call was returning **406**. The fixes, per Overpass etiquette:
 *   • a DESCRIPTIVE `User-Agent` (mirrors 406/429 anonymous datacenter traffic without it);
 *   • form-encoded POST (`application/x-www-form-urlencoded`, body `data=<QL>`) — never JSON;
 *   • `Accept: application/json` to match `[out:json]`;
 *   • on 403/406/429/5xx (or a network error) retry on the next MIRROR; the response BODY
 *     (not just the status) is logged into `error` so any residual failure is diagnosable.
 * Polite: one call per chain per endpoint, stops at the first 200.
 */
export async function fetchOverpass(
  brand: string,
  opts: {
    fetchImpl: typeof fetch;
    /** Single endpoint override (tests / self-host). Omit to use the mirror list. */
    endpoint?: string;
    endpoints?: string[];
    timeoutSec?: number;
    /** The brand's Wikidata id (Q…), when resolved — the gold-standard match. */
    wikidataId?: string | null;
  }
): Promise<OverpassResult> {
  const endpoints = opts.endpoint ? [opts.endpoint] : opts.endpoints ?? OVERPASS_MIRRORS;
  const ql = overpassQuery(brand, { timeoutSec: opts.timeoutSec, wikidataId: opts.wikidataId });
  let lastError = "no endpoint reached";
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    try {
      const res = await opts.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "user-agent": OVERPASS_USER_AGENT,
        },
        body: `data=${encodeURIComponent(ql)}`,
      });
      lastStatus = res.status;
      if (!res.ok) {
        // Log the BODY, not just the status — that's what makes a 406/429 diagnosable.
        const bodyText = await res.text().catch(() => "");
        lastError = `overpass ${res.status} @ ${endpoint}: ${bodyText.replace(/\s+/g, " ").trim().slice(0, 300)}`;
        if (overpassRetryable(res.status)) continue; // try the next mirror
        return { branches: [], rawElements: 0, variants: EMPTY_VARIANTS, status: res.status, error: lastError };
      }
      const body = (await res.json()) as unknown;
      const rawElements =
        body && typeof body === "object" && Array.isArray((body as { elements?: unknown }).elements)
          ? (body as { elements: unknown[] }).elements.length
          : 0;
      return {
        branches: parseOverpass(body, brand, { wikidataId: opts.wikidataId }),
        rawElements,
        variants: overpassVariantCounts(body, brand, opts.wikidataId),
        status: res.status,
        error: null,
      };
    } catch (e) {
      lastError = `overpass @ ${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
      // network error — try the next mirror
    }
  }
  return { branches: [], rawElements: 0, variants: EMPTY_VARIANTS, status: lastStatus, error: lastError };
}
