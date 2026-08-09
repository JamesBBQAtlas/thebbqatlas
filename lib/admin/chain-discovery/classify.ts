/**
 * Chain-discovery classifiers (Part 4) — GENERAL, no per-chain logic.
 *
 *  • `classifyAddressType` decides whether a discovered address is a real
 *    dine-in BRANCH or an HQ / shipping / mail-order address that must NOT be
 *    rostered as a branch (but must NOT be silently dropped either — it's
 *    surfaced as a low-confidence candidate for the operator to confirm).
 *
 *  • `identifyFlagship` picks the ORIGINAL / flagship location from research
 *    signals (name cues, an earliest founding year, or the dossier's own
 *    flagship_location), so the flagship can be made the PARENT at the top of
 *    the roster. Returns null when there's no confident signal — we never guess
 *    a flagship by list position (the operator crowns it instead).
 */
import type { NormalLocation } from "./normalize";

/** Strong signals that an address is a corporate HQ / shipping / mail address. */
const HQ_SHIPPING = /(\bp\.?\s?o\.?\s?box\b|post office box|headquarters|head office|corporate (?:office|hq)|\bhq\b|mailing|mail[- ]?order|\bshipping\b|ship to|warehouse|distribution (?:cent(?:er|re))|fulfil?lment|registered office)/i;

export type AddressType = "branch" | "hq_shipping";

/**
 * Classify a discovered address. Defaults to "branch" (a real, visitable
 * location) unless it carries an unmistakable HQ / shipping / mail-order signal.
 * A bare "Suite 200" is NOT enough on its own — plenty of real venues sit in a
 * suite — so suite/unit only counts alongside an office/mailing signal.
 */
export function classifyAddressType(loc: {
  location_label?: string | null;
  address?: string | null;
  street?: string | null;
}): AddressType {
  const hay = `${loc.location_label ?? ""} ${loc.street ?? ""} ${loc.address ?? ""}`;
  return HQ_SHIPPING.test(hay) ? "hq_shipping" : "branch";
}

/** Name/label cues that mark the original / flagship location. */
const FLAGSHIP_CUES = /\b(the original|original location|flagship|first location|where it (?:all )?(?:began|started)|our first|est(?:ablished)?\.?\s*\d{4}|since\s*\d{4})\b/i;

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface FlagshipPick {
  /** Index into the locations array of the identified flagship. */
  index: number;
  /** Why it was chosen — recorded for the audit trail / operator. */
  reason: string;
}

/**
 * Identify the flagship among a roster from research signals, in priority order:
 *   1. the dossier's own `flagship_location` (city and/or street match);
 *   2. an explicit name/label cue ("The Original", "Est. 1991", "flagship"…);
 *   3. the earliest founding/established year attached to a specific location.
 * Returns null when nothing is confident — we do NOT crown by list position.
 */
export function identifyFlagship(
  locations: Pick<NormalLocation, "location_label" | "street" | "city" | "address">[],
  opts?: {
    flagshipLocation?: { city?: string | null; address?: string | null } | null;
  }
): FlagshipPick | null {
  if (!locations.length) return null;

  // 1. Dossier flagship_location — match by street first (most specific), then city.
  const fl = opts?.flagshipLocation;
  if (fl && (fl.city || fl.address)) {
    const flStreet = norm(fl.address);
    const flCity = norm(fl.city);
    if (flStreet) {
      const i = locations.findIndex(
        (l) => norm(l.street).length > 0 && (norm(l.street) === flStreet || norm(l.address).includes(flStreet))
      );
      if (i >= 0) return { index: i, reason: `matches the dossier flagship address (${fl.address})` };
    }
    if (flCity) {
      const i = locations.findIndex((l) => norm(l.city) === flCity);
      if (i >= 0) return { index: i, reason: `matches the dossier flagship city (${fl.city})` };
    }
  }

  // 2. Name/label cue on a specific location.
  {
    const i = locations.findIndex(
      (l) => FLAGSHIP_CUES.test(`${l.location_label ?? ""} ${l.address ?? ""}`)
    );
    if (i >= 0) {
      const m = `${locations[i].location_label ?? ""} ${locations[i].address ?? ""}`.match(FLAGSHIP_CUES);
      return { index: i, reason: `flagship cue in its listing ("${m?.[0] ?? "original"}")` };
    }
  }

  // 3. Earliest explicit founding year tied to a location's own text.
  const YEAR = /\b(18|19|20)\d{2}\b/;
  let best = -1;
  let bestYear = Infinity;
  locations.forEach((l, i) => {
    const m = `${l.location_label ?? ""} ${l.address ?? ""}`.match(YEAR);
    if (m) {
      const y = Number(m[0]);
      if (y < bestYear) {
        bestYear = y;
        best = i;
      }
    }
  });
  if (best >= 0 && Number.isFinite(bestYear))
    return { index: best, reason: `earliest founding year on a location (${bestYear})` };

  return null;
}
