/**
 * Address helpers (§09.2.6 / §09.2.2). Two jobs:
 *  - compose a FULL address (street, city, region/state, postcode) without
 *    duplicating parts the dossier already folded together;
 *  - normalise a street/city string so the SAME physical location matches
 *    however it's spelled ("Olathe" vs "Olathe, KS"), for chain dedupe.
 */

const clean = (v: string | null | undefined): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";

/**
 * Build a full address from dossier parts, skipping any token already present
 * in what we've accumulated (so a street that already contains the city/zip
 * isn't doubled up). Produces e.g. "3002 W 47th Ave, Kansas City, KS 66103".
 */
export function composeAddress(parts: {
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
}): string {
  const acc: string[] = [];
  const push = (v: string | null | undefined) => {
    const s = clean(v);
    if (!s) return;
    if (acc.join(", ").toLowerCase().includes(s.toLowerCase())) return;
    acc.push(s);
  };
  push(parts.street);
  push(parts.city);
  push([clean(parts.region), clean(parts.postcode)].filter(Boolean).join(" "));
  return acc.join(", ");
}

/**
 * Normalise a CITY to the SETTLEMENT, not the administrative district (§09.2.7).
 * A pin's postcode and full street address stay precise; only the grouping
 * `city` is cleaned so "City of Westminster" and "Greater London" don't sit as
 * their own countries-of-one on the directory. Conservative and UK-focused:
 * only the explicit ADMIN-DISTRICT forms are rewritten — a bare locality
 * ("Bermondsey", "Croydon") is left exactly as entered.
 *   "Greater London" / "City of Westminster" / "City of London"  → "London"
 *   "London Borough of Hackney" / "Royal Borough of Greenwich"    → "London"
 *   "City of Nottingham"                                          → "Nottingham"
 *   "Royal Borough of Kingston upon Thames"                       → "London"
 *   "Borough of Poole" / "Poole Borough"                          → "Poole"
 */
export function settlementCity(city: string | null | undefined): string {
  const raw = clean(city);
  if (!raw) return "";
  const low = raw.toLowerCase();

  // The Greater London family — the whole conurbation is addressed as "London".
  if (low === "greater london" || low === "city of london" || low === "city of westminster") {
    return "London";
  }
  // Any London borough (incl. the two royal boroughs inside London) → "London".
  if (/\blondon borough of\b/.test(low)) return "London";
  const LONDON_ROYAL = new Set([
    "royal borough of kensington and chelsea",
    "royal borough of greenwich",
    "royal borough of kingston upon thames",
  ]);
  if (LONDON_ROYAL.has(low)) return "London";

  // "City of X" → the settlement X (City of Nottingham → Nottingham).
  let m = raw.match(/^city of\s+(.+)$/i);
  if (m) return m[1].trim();
  // "Royal/Metropolitan/plain Borough of X" → X.
  m = raw.match(/^(?:royal\s+|metropolitan\s+)?borough of\s+(.+)$/i);
  if (m) return m[1].trim();
  // Trailing admin suffix ("Poole Borough", "X District Council") → X.
  const stripped = raw
    .replace(/\s+(?:metropolitan borough|borough council|borough|district council|district|council)$/i, "")
    .trim();
  return stripped || raw;
}

/**
 * Does this "city" value look like a POI / landmark / retail site rather than a
 * town? A reverse-geocode or a bad facts sheet can drop a shopping centre,
 * station or mall name into the city field ("Westmorland Shopping Centre" for a
 * venue that's actually in Kendal). Those must be rejected — the city has to be
 * the postal town. Conservative: only clear POI indicators, never plausible town
 * names (a real "…Park" or "…Market" town isn't caught).
 */
export function looksLikePoiCity(city: string | null | undefined): boolean {
  const s = clean(city).toLowerCase();
  if (!s) return false;
  return /shopping\s*cent(?:re|er)|retail\s*park|outlet|\bmall\b|\bplaza\b|\barcade\b|\bstation\b|\bairport\b|\bterminal\b|\bprecinct\b|\bstadium\b|\bshopping\b/.test(
    s
  );
}

/** Country / UK-nation tokens we drop from the tail of an address when hunting
 *  for the town. */
const ADDRESS_COUNTRY = /^(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|usa|u\.s\.a\.|u\.s\.|united states|united states of america|ireland|eire|éire)$/i;
/** A street line: starts with a number, or carries a street-type / unit word. */
const STREET_WORD = /^\d|\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|way|close|court|ct|unit|suite|ste|floor|fl|yard|wharf|quay|mews|row|terrace|smokehouse|arcade|building|bldg|house|no)\b/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{4,5}(?:-\d{4})?)\b/gi;

/**
 * Best-effort extraction of the TOWN / locality from a full address string — the
 * locality token that sits before the region + postcode. e.g.
 * "The Old Smokehouse, Yard 2 Stricklandgate, Kendal, England LA9 4ND" → "Kendal".
 * Strips postcodes, drops trailing country/nation tokens, and skips street
 * lines, returning the last remaining non-street part (settlement-normalised).
 * Returns "" when it can't find a confident town.
 */
export function localityFromAddress(address: string | null | undefined): string {
  const raw = clean(address);
  if (!raw) return "";
  let parts = raw
    .split(",")
    .map((p) => p.replace(POSTCODE, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  // Drop trailing pure country / nation tokens.
  while (parts.length > 1 && ADDRESS_COUNTRY.test(parts[parts.length - 1])) parts.pop();
  // The town is the LAST remaining part that isn't a street line or a POI.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (STREET_WORD.test(p) || looksLikePoiCity(p)) continue;
    return settlementCity(p);
  }
  return "";
}

/**
 * Resolve the CITY to a real town: trust a provided/geocoded city when it isn't
 * a POI, else fall back to the town parsed from the address, else the geocoder's
 * settlement — never a POI/landmark. Returns "" only when nothing usable exists
 * (caller should then flag rather than store a POI).
 */
export function bestSettlement(opts: {
  city?: string | null;
  address?: string | null;
  geoCity?: string | null;
}): string {
  const provided = settlementCity(opts.city);
  if (provided && !looksLikePoiCity(provided)) return provided;
  const fromAddress = localityFromAddress(opts.address);
  if (fromAddress && !looksLikePoiCity(fromAddress)) return fromAddress;
  const geo = settlementCity(opts.geoCity);
  if (geo && !looksLikePoiCity(geo)) return geo;
  return "";
}

/** Completeness score = count of comma-separated tokens (more parts = fuller). */
export function addressScore(addr: string | null | undefined): number {
  if (!addr) return 0;
  return clean(addr)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/**
 * Pick the fuller of two addresses — NEVER downgrade a complete address to a
 * thinner one. Ties go to the freshly-composed one (it's the newest facts).
 */
export function preferFullerAddress(
  fresh: string | null | undefined,
  existing: string | null | undefined
): string {
  const f = clean(fresh);
  const e = clean(existing);
  if (!f) return e;
  if (!e) return f;
  return addressScore(f) >= addressScore(e) ? f : e;
}

/**
 * Normalise a STREET address to an identity key: take the portion before the
 * first comma (the street line), lowercase, strip punctuation, collapse
 * whitespace, and standardise the common US street-type abbreviations so
 * "3002 W 47th Ave" == "3002 W 47th Avenue". Empty string if nothing usable.
 */
export function normStreet(addr: string | null | undefined): string {
  const first = clean(addr).split(",")[0] ?? "";
  let s = first
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const abbr: Record<string, string> = {
    avenue: "ave",
    street: "st",
    road: "rd",
    boulevard: "blvd",
    drive: "dr",
    lane: "ln",
    court: "ct",
    place: "pl",
    parkway: "pkwy",
    highway: "hwy",
    north: "n",
    south: "s",
    east: "e",
    west: "w",
    northeast: "ne",
    northwest: "nw",
    southeast: "se",
    southwest: "sw",
  };
  s = s
    .split(" ")
    .map((w) => abbr[w] ?? w)
    .join(" ");
  return s;
}

/**
 * Normalise a CITY / branch label to an identity key: lowercase, strip a
 * trailing US state suffix (", KS" / " KS") and country suffix, drop
 * punctuation, collapse whitespace. "Olathe, KS" and "Olathe" both → "olathe".
 */
export function normCity(city: string | null | undefined): string {
  let s = clean(city).toLowerCase();
  if (!s) return "";
  s = s
    .replace(/,?\s*(united states|usa|u\.s\.a\.|u\.s\.)\s*$/i, "")
    // Trailing 2-letter STATE code — only when it's a separate token (comma or
    // space before it), so we don't chop the last 2 letters off a city name
    // ("Fort Worth" must NOT become "Fort Wor").
    .replace(/[,\s]+[a-z]{2}\.?\s*$/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Expand common city abbreviations so "Ft. Worth" == "Fort Worth" and
  // "St. Louis" == "Saint Louis" (prevents same-city seed duplicates).
  const cityAbbr: Record<string, string> = { ft: "fort", mt: "mount", st: "saint" };
  s = s
    .split(" ")
    .map((w) => cityAbbr[w] ?? w)
    .join(" ");
  return s;
}
