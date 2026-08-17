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

/**
 * Query Overpass for a brand and return parsed branches. `fetchImpl` is injected (the
 * global fetch in production, a stub in tests). One call per chain — polite by default.
 * Never throws: a transport/HTTP error comes back as a structured empty with the reason.
 */
export async function fetchOverpass(
  brand: string,
  opts: {
    fetchImpl: typeof fetch;
    endpoint?: string;
    timeoutSec?: number;
  }
): Promise<OverpassResult> {
  const endpoint = opts.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
  const ql = overpassQuery(brand, { timeoutSec: opts.timeoutSec });
  try {
    const res = await opts.fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(ql)}`,
    });
    const status = res.status;
    if (!res.ok) {
      return { branches: [], rawElements: 0, status, error: `overpass ${status}` };
    }
    const body = (await res.json()) as unknown;
    const rawElements =
      body && typeof body === "object" && Array.isArray((body as { elements?: unknown }).elements)
        ? (body as { elements: unknown[] }).elements.length
        : 0;
    return { branches: parseOverpass(body, brand), rawElements, status, error: null };
  } catch (e) {
    return { branches: [], rawElements: 0, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
