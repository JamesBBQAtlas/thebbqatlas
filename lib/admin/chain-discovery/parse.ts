/**
 * Chain-discovery parsers (Part 1, §2) — GENERAL, no per-chain logic. Each
 * function takes raw HTML or already-fetched JSON and returns RawCandidate[].
 * The engine tries them in order of reliability; whichever yields real street
 * addresses wins. We parse the REAL DOM/JSON — never a readability/markdown
 * extraction (which strips the locator markup and returns nothing).
 */
import * as cheerio from "cheerio";
import type { RawCandidate } from "./normalize";

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
};

// ── 1. schema.org JSON-LD (the cleanest generic signal) ─────────────────────
const ADDRESS_TYPES = /(Restaurant|FoodEstablishment|LocalBusiness|BarOrPub|CafeOrCoffeeShop|Store|Organization|Place)/i;

function fromPostalAddress(node: Record<string, unknown>, name: string | null, phone: string | null, sourceUrl: string | null): RawCandidate | null {
  const addr = node.address;
  if (!addr) return null;
  if (typeof addr === "string") {
    return { location_label: name, address: addr, phone, source_url: sourceUrl };
  }
  if (typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const country = a.addressCountry;
    return {
      location_label: name,
      street: str(a.streetAddress),
      city: str(a.addressLocality),
      region: str(a.addressRegion),
      postcode: str(a.postalCode),
      country: typeof country === "object" ? str((country as Record<string, unknown>).name) : str(country),
      phone: str(node.telephone) ?? phone,
      source_url: sourceUrl,
    };
  }
  return null;
}

function walkJsonLd(node: unknown, out: RawCandidate[], sourceUrl: string | null): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, out, sourceUrl);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj["@graph"]) walkJsonLd(obj["@graph"], out, sourceUrl);
  const type = obj["@type"];
  const typeStr = Array.isArray(type) ? type.join(" ") : String(type ?? "");
  if (obj.address && (ADDRESS_TYPES.test(typeStr) || !type)) {
    const c = fromPostalAddress(obj, str(obj.name), str(obj.telephone), sourceUrl);
    if (c) out.push(c);
  }
  // Recurse into common container props that may hold sub-locations.
  for (const key of ["location", "hasPart", "subOrganization", "department", "makesOffer", "containsPlace", "itemListElement"]) {
    if (obj[key]) walkJsonLd(obj[key], out, sourceUrl);
  }
}

export function parseJsonLd(html: string, sourceUrl: string | null = null): RawCandidate[] {
  const $ = cheerio.load(html);
  const out: RawCandidate[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      walkJsonLd(JSON.parse(raw), out, sourceUrl);
    } catch {
      /* malformed JSON-LD block — skip it */
    }
  });
  return out;
}

// ── 2. Flat HTML locator (DOM heuristics) ───────────────────────────────────
const POSTCODE_ANY = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]\d[A-Z]\s*\d[A-Z]\d|\d{5}(?:-\d{4})?|\d{4})\b/i;
const US_CITY_STATE_ZIP = /^(.*?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;
const PHONE = /(\+?\d[\d().\-\s]{7,}\d)/;

/** Split a multi-line address block into {street, city, region, postcode}. */
function splitBlock(text: string): RawCandidate | null {
  const lines = text.split(/\n|<br\s*\/?>(?=)/i).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const joined = lines.join(", ");
  if (!POSTCODE_ANY.test(joined)) return null;
  const phone = joined.match(PHONE)?.[1] ?? null;
  // US "City, ST 12345" on the last address line.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(US_CITY_STATE_ZIP);
    if (m) {
      const street = lines.slice(0, i).join(", ").replace(PHONE, "").trim() || null;
      return { street, city: m[1].trim(), region: m[2].toUpperCase(), postcode: m[3], phone, address: joined };
    }
  }
  // Otherwise return the whole thing as a one-line address and let normalise/geocode sort it.
  return { address: joined.replace(PHONE, "").replace(/,\s*,/g, ",").trim(), phone };
}

export function parseFlatDom(html: string, sourceUrl: string | null = null): RawCandidate[] {
  const $ = cheerio.load(html);
  const out: RawCandidate[] = [];
  const seen = new Set<string>();

  const push = (c: RawCandidate | null) => {
    if (!c) return;
    const key = (c.address ?? `${c.street}|${c.city}`).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...c, source_url: sourceUrl });
  };

  // (a) microdata PostalAddress blocks.
  $('[itemtype*="PostalAddress"]').each((_, el) => {
    const g = (prop: string) => $(el).find(`[itemprop="${prop}"]`).first().text().trim() || null;
    const street = g("streetAddress");
    if (street) {
      push({
        street,
        city: g("addressLocality"),
        region: g("addressRegion"),
        postcode: g("postalCode"),
        country: g("addressCountry"),
      });
    }
  });

  // (b) <address> elements.
  $("address").each((_, el) => push(splitBlock($(el).html() ?? $(el).text())));

  // (c) elements whose class/id hint at a store/location card. These are the
  // messiest source — a "location" card often bundles hours, nav labels, "GET
  // DIRECTIONS", marketing text around the address. So instead of dumping the
  // whole block into the address field (the FAIL-3 blob), pull the CLEAN street/
  // city/state/zip out of the block's visible text by pattern. Fall back to
  // splitBlock only for a short, address-shaped block with no clean hit.
  if (out.length === 0) {
    $('[class*="location" i],[class*="store" i],[class*="address" i],[id*="location" i]').each((_, el) => {
      // Only leaf-ish blocks (avoid the whole list container).
      if ($(el).find('[class*="location" i],[class*="store" i]').length > 2) return;
      const text = ($(el).text() ?? "").replace(/\s+/g, " ").trim();
      const clean = extractAddressesFromText(text, sourceUrl);
      if (clean.length) {
        for (const c of clean) push(c);
      } else if (text.length <= 120) {
        push(splitBlock(($(el).html() ?? "").replace(/<[^>]+>/g, "\n")));
      }
    });
  }
  return out;
}

// ── 3. Generic store-locator JSON (provider-agnostic) ───────────────────────
const ADDR_KEYS = ["address", "address1", "streetAddress", "street", "addr1", "line1"];
const CITY_KEYS = ["city", "addressLocality", "locality", "town"];
const REGION_KEYS = ["state", "region", "province", "addressRegion", "stateCode"];
const ZIP_KEYS = ["zip", "postalCode", "postcode", "zipCode", "postal"];
const COUNTRY_KEYS = ["country", "addressCountry", "countryCode"];
const PHONE_KEYS = ["phone", "telephone", "phoneNumber"];
const NAME_KEYS = ["name", "locationName", "storeName", "title", "label"];

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const hit = Object.keys(o).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (hit && (typeof o[hit] === "string" || typeof o[hit] === "number")) return str(o[hit]);
  }
  return null;
};

/** Flatten a location object so nested `address`/`location`/`geo` sub-objects
 *  are visible to `pick` alongside the top-level scalars (Yext-style payloads
 *  nest the street under `address:{line1,...}`; others put it flat). */
function flattenLoc(o: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of ["address", "location", "geo", "geocodedCoordinate"]) {
    const hit = Object.keys(o).find((kk) => kk.toLowerCase() === key.toLowerCase());
    const v = hit ? o[hit] : undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(merged, v);
  }
  // Top-level scalars overlay (keep name/phone; never clobber nested street).
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" || typeof v === "number") merged[k] = v;
  }
  return merged;
}

/** Recursively find the array of location objects in an arbitrary JSON payload. */
function findLocationArray(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    const looksLikeLocations = node.filter((n) => {
      if (!n || typeof n !== "object") return false;
      const f = flattenLoc(n as Record<string, unknown>);
      return Boolean(pick(f, ADDR_KEYS) || pick(f, CITY_KEYS));
    });
    if (looksLikeLocations.length >= 1 && looksLikeLocations.length === node.length) {
      return node as Record<string, unknown>[];
    }
    let best: Record<string, unknown>[] = [];
    for (const n of node) {
      const r = findLocationArray(n, depth + 1);
      if (r.length > best.length) best = r;
    }
    return best;
  }
  let best: Record<string, unknown>[] = [];
  for (const v of Object.values(node as Record<string, unknown>)) {
    const r = findLocationArray(v, depth + 1);
    if (r.length > best.length) best = r;
  }
  return best;
}

export function parseLocatorJson(payload: unknown, sourceUrl: string | null = null): RawCandidate[] {
  const arr = findLocationArray(payload);
  return arr.map((raw) => {
    const o = flattenLoc(raw);
    return {
      location_label: pick(o, NAME_KEYS),
      street: pick(o, ADDR_KEYS),
      city: pick(o, CITY_KEYS),
      region: pick(o, REGION_KEYS),
      postcode: pick(o, ZIP_KEYS),
      country: pick(o, COUNTRY_KEYS),
      phone: pick(o, PHONE_KEYS),
      source_url: sourceUrl,
    };
  });
}

/** Extract candidates from JSON embedded in the page's own <script> tags —
 *  `<script type="application/json">`, Next.js `__NEXT_DATA__`, or a
 *  `window.X = {…}` / `= […]` assignment that carries the location array. */
export function parseInlineJson(html: string, sourceUrl: string | null = null): RawCandidate[] {
  const $ = cheerio.load(html);
  const blobs: string[] = [];
  $('script[type="application/json"], script#__NEXT_DATA__').each((_, el) => {
    const t = $(el).contents().text().trim();
    if (t) blobs.push(t);
  });
  $("script:not([type]), script[type='text/javascript']").each((_, el) => {
    const t = $(el).contents().text();
    const m = t.match(/[=:]\s*(\[[\s\S]{200,}\]|\{[\s\S]{200,}\})\s*[;,\n]/);
    if (m) blobs.push(m[1]);
  });
  let best: RawCandidate[] = [];
  for (const b of blobs) {
    try {
      const got = parseLocatorJson(JSON.parse(b), sourceUrl);
      if (got.length > best.length) best = got;
    } catch {
      /* not valid JSON — skip */
    }
  }
  return best;
}

// ── 3b. Address-from-visible-text (Part 4A) ─────────────────────────────────
// The discovery bug: the engine knew it was a chain, found no page literally
// named "Locations", and gave up — while both branch addresses sat in plain text
// on the homepage under a heading like "BBQ Near You!". Discovery must be
// ADDRESS-DRIVEN, not page-driven: pull every address out of the raw VISIBLE
// TEXT of whatever pages we read, by pattern, regardless of the page's name.

// A US street line: number + words, then "City, ST 12345". Captured greedily but
// bounded to one line's worth of characters so we don't span paragraphs.
const US_ADDRESS =
  /\b(\d{1,6}[\w.\- ]{2,60}?(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway|ct|court|pl|place|sq|square|ter|terrace|cir|circle|pike|trail|trl|route|rt|row)\b[\w.\- ]{0,30}?),?\s+([A-Za-z][A-Za-z.\- ]{1,28}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/gi;

// An international street line: number + words containing a street-type token,
// then up to two comma segments, ending in a recognizable non-US postcode
// (UK/CA/etc.). Deliberately conservative — geocode does the real resolving.
const INTL_ADDRESS =
  /\b(\d{1,6}[\w.\- ]{2,60}?(?:street|st|road|rd|avenue|ave|lane|ln|way|close|crescent|cres|parade|pde|terrace|drive|dr|walk|row|quay|wharf|square|sq|grove|hill|gardens|mews)\b[\w.,\- ]{0,60}?)\s+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/gi;

/**
 * Extract candidate addresses from a page's raw VISIBLE text (not its markup).
 * Runs the US and international line patterns over the de-tagged text and returns
 * one RawCandidate per distinct hit. Provider-agnostic; the caller still runs the
 * hasStreetAddress gate + geocode, so a false positive costs a geocode, not a
 * bad pin.
 */
export function extractAddressesFromText(text: string, sourceUrl: string | null = null): RawCandidate[] {
  const out: RawCandidate[] = [];
  const seen = new Set<string>();
  const clean = text.replace(/ /g, " ").replace(/[ \t]+/g, " ");

  const push = (c: RawCandidate) => {
    const key = (c.address ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...c, source_url: sourceUrl });
  };

  for (const m of clean.matchAll(US_ADDRESS)) {
    const street = m[1].replace(/\s+/g, " ").trim().replace(/,+$/, "");
    const city = m[2].replace(/\s+/g, " ").trim();
    const region = m[3].toUpperCase();
    const postcode = m[4];
    push({
      street,
      city,
      region,
      postcode,
      address: `${street}, ${city}, ${region} ${postcode}`,
    });
  }
  for (const m of clean.matchAll(INTL_ADDRESS)) {
    const street = m[1].replace(/\s+/g, " ").trim().replace(/,+$/, "");
    const postcode = m[2].replace(/\s+/g, " ").trim();
    push({ street, postcode, address: `${street} ${postcode}` });
  }
  return out;
}

/** Pull an HTML page's visible text (drop script/style, collapse tags to spaces). */
export function visibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  return $("body").text() || $.root().text();
}

/** Extract addresses straight from an HTML page's visible text (Part 4A). */
export function parseVisibleText(html: string, sourceUrl: string | null = null): RawCandidate[] {
  return extractAddressesFromText(visibleText(html), sourceUrl);
}

// Words that mark a candidate's address as a SCRAPED BLOB (hours / nav / marketing
// dumped in with the street) rather than a clean address line.
const ADDRESS_NOISE =
  /\b(hours?|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|\d{1,2}\s?(am|pm)\b|get directions|directions|menu|order|live music|catering|call us|closed|open|book|reserve|gift card)\b/i;

/**
 * Clean the address on every candidate (fix the FAIL-3 blob). A card scraped from
 * the DOM often carries hours/nav/marketing text around the street — if a
 * candidate's address looks like a blob (long, or contains hours/nav words), we
 * re-extract the CLEAN "street, city, ST zip" from its text by pattern. A single
 * blob that contains TWO addresses is split into two candidates (this is how a
 * second branch buried in a homepage block gets recovered). Clean structured
 * candidates pass through untouched. This runs BEFORE the street-address gate and
 * dedupe, so both see clean data.
 */
export function refineCandidates(cands: RawCandidate[]): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const c of cands) {
    const line = (c.address ?? "").trim();
    const structuredClean =
      (c.street ?? "").trim() &&
      ((c.postcode ?? "").trim() || (c.city ?? "").trim()) &&
      !ADDRESS_NOISE.test(`${c.street} ${c.city ?? ""}`);
    const messy = line.length > 90 || ADDRESS_NOISE.test(line);
    if (structuredClean && !messy) {
      out.push(c);
      continue;
    }
    const text = [c.location_label, c.street, c.address, c.city, c.region, c.postcode]
      .filter(Boolean)
      .join(" ");
    const clean = extractAddressesFromText(text, c.source_url ?? null);
    if (clean.length) {
      for (const cl of clean) {
        out.push({
          ...cl,
          location_label: cl.location_label ?? c.location_label ?? null,
          phone: c.phone ?? cl.phone ?? null,
        });
      }
    } else {
      // Nothing cleaner found — keep the original (the street-address gate will
      // decide whether it's real enough to seed).
      out.push(c);
    }
  }
  return out;
}

// ── 4. Locator discovery + hierarchical links ───────────────────────────────
// Part 4A — a BROAD synonym list, matched contains/case-insensitive on the link
// href OR its visible label. Never an exact match on "Locations": a chain may
// call it "Visit Us", "Find Us", "Our Pits", "Come See Us", "Store Locator",
// "Near You", "Hours", "Order", etc.
const LOCATOR_HINTS =
  /(location|store|find|where|visit|hours|branch|near you|our pits|our spots|our places|come see|order|directions|our restaurants|eat with us|stop by)/i;

/** Absolute-ise an href against a base URL; null if it leaves the host. */
function sameHostUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    const b = new URL(base);
    if (u.host !== b.host) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Find candidate locator-page URLs from a page's nav/footer links (§1). */
export function findLocatorLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const label = $(el).text().trim();
    if (!href) return;
    if (LOCATOR_HINTS.test(href) || LOCATOR_HINTS.test(label)) {
      const abs = sameHostUrl(href, baseUrl);
      if (abs) out.add(abs);
    }
  });
  return [...out];
}

/**
 * Given a locator page, return the child links that sit UNDER the locator path
 * (region/state/city/leaf gateways) — the signal that this is a hierarchical
 * index rather than a flat list (§2.3). Excludes the page itself.
 */
export function findChildLocatorLinks(html: string, locatorUrl: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  let basePath: string;
  try {
    basePath = new URL(locatorUrl).pathname.replace(/\/+$/, "");
  } catch {
    return [];
  }
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const abs = sameHostUrl(href, locatorUrl);
    if (!abs) return;
    let path: string;
    try {
      path = new URL(abs).pathname.replace(/\/+$/, "");
    } catch {
      return;
    }
    if (path === basePath) return; // the page itself
    if (path.startsWith(basePath + "/") && path.length > basePath.length + 1) out.add(abs);
  });
  return [...out];
}

/** True when a page's own markup already contains multiple street addresses —
 *  i.e. it's a FLAT locator, not an index of gateway links. */
export function looksFlat(candidates: RawCandidate[]): boolean {
  const withStreet = candidates.filter((c) => (c.street ?? "").trim() || /\d/.test((c.address ?? "").split(",")[0] ?? ""));
  return withStreet.length >= 2;
}
