/**
 * Address normalisation for chain discovery (Part 1) — GENERAL across countries.
 * Turns a raw address string (or partially-structured fields) into a normalised
 * location, and decides whether a candidate has a REAL street address — the
 * non-negotiable gate that stops the engine from ever inventing a branch.
 */
import { normStreet } from "@/lib/admin/address";

export interface RawCandidate {
  location_label?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  phone?: string | null;
  /** A single-line address, if the source only gave us that. */
  address?: string | null;
  source_url?: string | null;
}

export interface NormalLocation {
  location_label: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  /** Composed one-line address for geocoding/storage. */
  address: string;
  source_url: string | null;
}

const STREET_TYPES = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway|ct|court|pl|place|sq|square|ter|terrace|cir|circle|pike|trail|trl|route|rt|row|walk|crescent|cres|close|grove|parade|pde|esplanade)\b/i;
const HAS_NUMBER = /\d/;

/**
 * Does this candidate carry a REAL street address? A street number + a street
 * name, or an unmistakable street-type token. City-only / region-only / "coming
 * soon" candidates fail this and must never be seeded (§3.4, §7.4).
 */
export function hasStreetAddress(c: RawCandidate): boolean {
  const street = (c.street ?? "").trim();
  if (street && HAS_NUMBER.test(street) && street.replace(/\d/g, "").trim().length >= 3) return true;
  if (street && STREET_TYPES.test(street)) return true;
  // Fall back to the single-line address: first segment must look like a street.
  const line = (c.address ?? "").trim();
  if (line) {
    const first = line.split(",")[0]?.trim() ?? "";
    if (HAS_NUMBER.test(first) && STREET_TYPES.test(line)) return true;
    if (HAS_NUMBER.test(first) && first.replace(/\d/g, "").trim().length >= 4) return true;
  }
  return false;
}

const COMING_SOON = /\b(coming soon|opening soon|now hiring|temporarily closed|permanently closed|closed)\b/i;

/** True when a candidate is a not-yet-open / closed listing that must not be
 *  pinned as live (§7.4). */
export function isNotOpen(c: RawCandidate): boolean {
  const hay = `${c.location_label ?? ""} ${c.address ?? ""} ${c.street ?? ""}`;
  return COMING_SOON.test(hay);
}

const cap = (s: string) =>
  s.replace(/\s+/g, " ").trim();

/** Compose a one-line address from whatever structured parts exist. */
export function composeLine(c: RawCandidate): string {
  if (c.address && c.address.trim()) return cap(c.address);
  const parts = [c.street, c.city, [c.region, c.postcode].filter(Boolean).join(" "), c.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return cap(parts.join(", "));
}

/**
 * Normalise a raw candidate. `defaultCountry` is the chain-anchored country,
 * applied unless the candidate's own address clearly states another (§3.1).
 */
export function normalize(c: RawCandidate, defaultCountry: string | null): NormalLocation {
  const address = composeLine(c);
  return {
    location_label: c.location_label ? cap(c.location_label) : null,
    street: c.street ? cap(c.street) : null,
    city: c.city ? cap(c.city) : null,
    region: c.region ? cap(c.region) : null,
    postcode: c.postcode ? cap(c.postcode) : null,
    country: (c.country && c.country.trim()) || defaultCountry || null,
    phone: c.phone ? cap(c.phone) : null,
    address,
    source_url: c.source_url ?? null,
  };
}

/**
 * Normalised street key for dedupe. Delegates to the ONE shared street
 * normalizer (`normStreet` in lib/admin/address) so the crawl engine's internal
 * dedupe, the roster union dedupe, the chain reconcile, and the single-venue
 * dedupe can never diverge on how an address is keyed (diacritics, number
 * position, abbreviations) — divergent copies are exactly how the Old Jimmy's
 * triple-duplicate slipped through.
 */
export function streetKey(street: string | null | undefined): string {
  return normStreet(street);
}
