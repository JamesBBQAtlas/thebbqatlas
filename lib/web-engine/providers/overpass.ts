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
import { sharesBrand } from "./match";

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

/** Escape a brand for use inside an Overpass (PCRE) regex literal. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the Overpass QL for a brand. Unions two ways a chain is tagged:
 *   • `brand` = the canonical chain tag (the reliable one) — case-insensitive; and
 *   • `name` starting with the brand on an eating amenity — catches branches a mapper
 *     labelled by name but never brand-tagged.
 * `nwr` = nodes+ways+relations; `out center tags` returns each element's tags plus a
 * single representative lat/long (the node's own, or a way/relation's centre).
 */
export function overpassQuery(brand: string, opts?: { timeoutSec?: number }): string {
  const b = escapeRegex(brand.trim());
  const timeout = Math.max(25, Math.min(opts?.timeoutSec ?? 60, 180));
  return [
    `[out:json][timeout:${timeout}];`,
    `(`,
    `  nwr["brand"~"^${b}$",i];`,
    `  nwr["brand"~"${b}",i];`,
    `  nwr["name"~"^${b}",i]["amenity"~"^(restaurant|fast_food|cafe)$"];`,
    `);`,
    `out center tags;`,
  ].join("\n");
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
export function parseOverpass(body: unknown, brand: string): ProviderBranch[] {
  const elements =
    body && typeof body === "object" && Array.isArray((body as { elements?: unknown }).elements)
      ? ((body as { elements: unknown[] }).elements as OverpassElement[])
      : [];
  const out: ProviderBranch[] = [];
  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const tags = (el.tags && typeof el.tags === "object" ? el.tags : {}) as Record<string, unknown>;
    const brandTag = tagStr(tags, "brand") ?? tagStr(tags, "brand:en");
    const nameTag = tagStr(tags, "name") ?? tagStr(tags, "name:en");
    // Brand guard — the record's own brand/name must plausibly be the chain.
    if (!sharesBrand(brandTag ?? nameTag, brand)) continue;

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

export interface OverpassResult {
  branches: ProviderBranch[];
  /** Raw element count returned (before the brand/location filter). */
  rawElements: number;
  status: number;
  error: string | null;
}

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
  }
): Promise<OverpassResult> {
  const endpoints = opts.endpoint ? [opts.endpoint] : opts.endpoints ?? OVERPASS_MIRRORS;
  const ql = overpassQuery(brand, { timeoutSec: opts.timeoutSec });
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
        return { branches: [], rawElements: 0, status: res.status, error: lastError };
      }
      const body = (await res.json()) as unknown;
      const rawElements =
        body && typeof body === "object" && Array.isArray((body as { elements?: unknown }).elements)
          ? (body as { elements: unknown[] }).elements.length
          : 0;
      return { branches: parseOverpass(body, brand), rawElements, status: res.status, error: null };
    } catch (e) {
      lastError = `overpass @ ${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
      // network error — try the next mirror
    }
  }
  return { branches: [], rawElements: 0, status: lastStatus, error: lastError };
}
