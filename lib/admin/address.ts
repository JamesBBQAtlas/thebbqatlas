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
