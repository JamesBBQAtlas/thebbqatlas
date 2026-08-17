/**
 * Locator platform ADAPTERS (WEB-ENGINE). Given the JSON a chain's locations page
 * fetches (intercepted by the engine), extract a domain-agnostic `LocatorBranch[]`.
 * The intercepted feed is the gold: complete, structured, all records in one payload
 * with address + lat/long + phone. A small adapter set covers most chains; a strong
 * GENERIC field-alias extractor is the safety net for custom locators.
 *
 * Every adapter is PURE (payload → branches) and unit-tested with real / documented
 * payload shapes. No BBQ assumptions — raw facts only.
 */
import type { CapturedResponse, LocatorBranch, LocatorFeedResult } from "./types";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
/** Join a street line from up to two parts, de-duping and trimming. */
const streetLine = (a: unknown, b: unknown): string | null => {
  const s = [str(a), str(b)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return s || null;
};
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// ── Olo / NomNom (validated live on City Barbeque: nomnom-prod-api.<brand>.com) ──
// Feed shape: {"restaurants":[{ name:"Acworth"(branch label), storename:"City
// Barbeque"(brand), streetaddress, streetaddress2, city, state, zip, country,
// latitude, longitude, telephone, id, slug }]}. NOTE name != city (Arlington branch
// sits in Columbus) — label and city are kept distinct.
export function isOloPayload(url: string, body: unknown): boolean {
  if (/nomnom|olo\.com/i.test(url)) return isObj(body) && Array.isArray((body as Record<string, unknown>).restaurants);
  return (
    isObj(body) &&
    Array.isArray((body as Record<string, unknown>).restaurants) &&
    ((body as { restaurants: unknown[] }).restaurants).some((r) => isObj(r) && ("streetaddress" in r || "storename" in r))
  );
}
export function extractOlo(body: unknown): LocatorBranch[] {
  const arr = isObj(body) && Array.isArray((body as Record<string, unknown>).restaurants) ? (body as { restaurants: unknown[] }).restaurants : [];
  return arr
    .filter(isObj)
    .map((r): LocatorBranch => ({
      brand_name: str(r.storename),
      location_label: str(r.name),
      address: streetLine(r.streetaddress, r.streetaddress2),
      city: str(r.city),
      region: str(r.state),
      postcode: str(r.zip) ?? str(r.zipcode) ?? str(r.postalcode),
      country: str(r.country),
      lat: num(r.latitude),
      lng: num(r.longitude),
      phone: str(r.telephone) ?? str(r.phone),
      external_id: r.id != null ? String(r.id) : str(r.slug),
      platform: "olo",
    }))
    .filter((b) => b.address || b.city);
}

// ── Yext (Answers / Search / Pages API) — response.{entities|docs}[] with a nested
// `address` object and coordinates. Handles line1/line2 + region + postalCode. ──
export function isYextPayload(url: string, body: unknown): boolean {
  if (/yext/i.test(url)) return true;
  const resp = isObj(body) ? (body.response as unknown) : null;
  return isObj(resp) && (Array.isArray((resp as Record<string, unknown>).entities) || Array.isArray((resp as Record<string, unknown>).docs));
}
export function extractYext(body: unknown): LocatorBranch[] {
  const resp = isObj(body) ? (body.response as Record<string, unknown> | undefined) : undefined;
  const rows = (Array.isArray(resp?.entities) ? resp!.entities : Array.isArray(resp?.docs) ? resp!.docs : []) as unknown[];
  return rows
    .filter(isObj)
    .map((e): LocatorBranch => {
      const p = isObj(e.profile) ? (e.profile as Record<string, unknown>) : e;
      const addr = isObj(p.address) ? (p.address as Record<string, unknown>) : {};
      const coord = (isObj(p.yextDisplayCoordinate) ? p.yextDisplayCoordinate : isObj(p.geocodedCoordinate) ? p.geocodedCoordinate : isObj(p.displayCoordinate) ? p.displayCoordinate : {}) as Record<string, unknown>;
      return {
        brand_name: null,
        location_label: str(p.name) ?? str(p.geomodifier) ?? str(p.locationName),
        address: streetLine(addr.line1, addr.line2),
        city: str(addr.city),
        region: str(addr.region) ?? str(addr.state),
        postcode: str(addr.postalCode) ?? str(addr.postalcode),
        country: str(addr.countryCode) ?? str(addr.country),
        lat: num(coord.latitude) ?? num(coord.lat),
        lng: num(coord.longitude) ?? num(coord.lng) ?? num(coord.long),
        phone: str(p.mainPhone) ?? str(p.phone),
        external_id: str(e.id) ?? str((e as Record<string, unknown>).$key) ?? str(p.id),
        platform: "yext",
      };
    })
    .filter((b) => b.address || b.city);
}

// ── Toast (guest ordering) — an array of restaurants each with a nested location
// {address1,address2,city,state,zip} + latitude/longitude. Tolerant to top-level too. ──
export function isToastPayload(url: string, body: unknown): boolean {
  if (/toasttab|toast-/i.test(url)) return true;
  const arr = toastArray(body);
  return arr.length > 0 && arr.some((r) => isObj(r) && (isObj(r.location) || "address1" in r));
}
function toastArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isObj(body)) {
    for (const k of ["restaurants", "locations", "data", "results"]) {
      if (Array.isArray((body as Record<string, unknown>)[k])) return (body as Record<string, unknown>)[k] as unknown[];
    }
  }
  return [];
}
export function extractToast(body: unknown): LocatorBranch[] {
  return toastArray(body)
    .filter(isObj)
    .map((r): LocatorBranch => {
      const loc = isObj(r.location) ? (r.location as Record<string, unknown>) : r;
      return {
        brand_name: str(r.name) && isObj(r.location) ? str(r.name) : null,
        location_label: str(loc.name) ?? str(r.locationName) ?? (isObj(r.location) ? null : str(r.name)),
        address: streetLine(loc.address1, loc.address2),
        city: str(loc.city),
        region: str(loc.state) ?? str(loc.stateCode),
        postcode: str(loc.zip) ?? str(loc.zipCode) ?? str(loc.postalCode),
        country: str(loc.country) ?? str(loc.countryCode),
        lat: num(loc.latitude) ?? num(r.latitude),
        lng: num(loc.longitude) ?? num(r.longitude),
        phone: str(loc.phone) ?? str(r.phone),
        external_id: str(r.guid) ?? str(r.id) ?? str(loc.guid),
        platform: "toast",
      };
    })
    .filter((b) => b.address || b.city);
}

// ── Algolia (hits[]) — a search index; each hit is a flat location doc. Delegates
// field mapping to the generic alias walker (Algolia docs are just flat objects). ──
export function isAlgoliaPayload(url: string, body: unknown): boolean {
  if (/algolia/i.test(url)) return true;
  return isObj(body) && Array.isArray((body as Record<string, unknown>).hits);
}
export function extractAlgolia(body: unknown): LocatorBranch[] {
  const hits = isObj(body) && Array.isArray((body as Record<string, unknown>).hits) ? ((body as { hits: unknown[] }).hits) : [];
  return hits.filter(isObj).map((h) => genericBranch(h, "algolia")).filter((b): b is LocatorBranch => b !== null);
}

// ── Generic field-alias extractor — the safety net. Walks any JSON, finds the array
// of objects that look like locations (a street + city, or coordinates), and maps
// common field aliases. Covers custom locators, Brandify/Where2GetIt, Momentfeed, and
// anything the specific adapters miss. Domain-agnostic. ──
const ALIASES = {
  street: ["streetaddress", "street_address", "address1", "addressline1", "address_line1", "line1", "street", "addr1"],
  street2: ["streetaddress2", "address2", "addressline2", "line2", "addr2", "suite"],
  city: ["city", "locality", "town", "municipality"],
  region: ["state", "region", "province", "administrativearea", "state_code", "statecode", "stateabbr"],
  postcode: ["zip", "zipcode", "postalcode", "postal_code", "postcode", "zip_code"],
  country: ["country", "countrycode", "country_code"],
  lat: ["latitude", "lat"],
  lng: ["longitude", "lng", "lon", "long"],
  phone: ["telephone", "phone", "phonenumber", "phone_number", "mainphone", "tel"],
  label: ["locationname", "location_name", "name", "title", "storename", "store_name", "displayname"],
} as const;

function lc(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k.toLowerCase().replace(/[\s_-]/g, "")] = v;
  return out;
}
function pick(o: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return null;
}
export function genericBranch(raw: unknown, platform = "generic"): LocatorBranch | null {
  if (!isObj(raw)) return null;
  const o = lc(raw);
  // Coordinates may sit under a nested geo/coordinates object.
  const geo = (isObj(o.geo) ? o.geo : isObj(o.coordinates) ? o.coordinates : isObj(o.geocode) ? o.geocode : {}) as Record<string, unknown>;
  const geoLc = lc(geo);
  const b: LocatorBranch = {
    brand_name: null,
    location_label: str(pick(o, ALIASES.label)),
    address: streetLine(pick(o, ALIASES.street), pick(o, ALIASES.street2)),
    city: str(pick(o, ALIASES.city)),
    region: str(pick(o, ALIASES.region)),
    postcode: str(pick(o, ALIASES.postcode)),
    country: str(pick(o, ALIASES.country)),
    lat: num(pick(o, ALIASES.lat)) ?? num(pick(geoLc, ALIASES.lat)),
    lng: num(pick(o, ALIASES.lng)) ?? num(pick(geoLc, ALIASES.lng)),
    phone: str(pick(o, ALIASES.phone)),
    external_id: str(o.id) ?? str(o.storeid) ?? str(o.slug),
    platform,
  };
  // A location needs at least a street OR (a city + coordinates) to be usable.
  return b.address || (b.city && b.lat != null && b.lng != null) ? b : null;
}

/** Recursively find the largest array of objects that yield generic branches. */
export function extractGeneric(body: unknown): LocatorBranch[] {
  let best: LocatorBranch[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      const branches = node.map((x) => genericBranch(x)).filter((b): b is LocatorBranch => b !== null);
      if (branches.length > best.length) best = branches;
      for (const x of node) visit(x, depth + 1);
      return;
    }
    if (isObj(node)) for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(body, 0);
  return best;
}

interface Adapter {
  name: string;
  detect: (url: string, body: unknown) => boolean;
  extract: (body: unknown) => LocatorBranch[];
}
const ADAPTERS: Adapter[] = [
  { name: "olo", detect: isOloPayload, extract: extractOlo },
  { name: "yext", detect: isYextPayload, extract: extractYext },
  { name: "toast", detect: isToastPayload, extract: extractToast },
  { name: "algolia", detect: isAlgoliaPayload, extract: extractAlgolia },
];

/**
 * Read a locator feed from the engine's intercepted network responses. Prefer a known
 * platform adapter; else the generic extractor over every JSON payload. Returns the
 * branch set that yielded the MOST records (a locator returns all stores in one feed),
 * plus LOUD debug — a genuinely empty read reports tier "none" with a reason, never a
 * silent zero.
 */
export function parseLocatorFeed(responses: CapturedResponse[]): LocatorFeedResult {
  const jsonResponses = (responses ?? []).filter((r) => r && r.body != null && (typeof r.body === "object"));
  let best: { branches: LocatorBranch[]; platform: string } = { branches: [], platform: "none" };

  for (const r of jsonResponses) {
    for (const a of ADAPTERS) {
      if (!a.detect(r.url, r.body)) continue;
      const branches = a.extract(r.body).map((b) => ({ ...b, source_url: b.source_url ?? r.url }));
      if (branches.length > best.branches.length) best = { branches, platform: a.name };
    }
  }
  // Generic fallback if no known adapter produced a bigger set.
  for (const r of jsonResponses) {
    const branches = extractGeneric(r.body).map((b) => ({ ...b, source_url: b.source_url ?? r.url }));
    if (branches.length > best.branches.length) best = { branches, platform: "generic" };
  }

  const brand_name = best.branches.map((b) => b.brand_name).find((n): n is string => Boolean(n)) ?? null;
  return {
    branches: best.branches,
    brand_name,
    platform: best.branches.length ? best.platform : null,
    debug: {
      tier: best.branches.length ? "network" : "none",
      platform: best.branches.length ? best.platform : null,
      candidatePayloads: jsonResponses.length,
      branchCount: best.branches.length,
      reason: best.branches.length ? null : `no locator feed in ${jsonResponses.length} JSON payload(s) — hand-seed or check the URL`,
    },
  };
}
