/**
 * Hand-off: engine locator branches → SeedLocation[] for the EXISTING chain machinery
 * (WEB-ENGINE Part 2). Do NOT fork the downstream — this only shapes the input to
 * `seedChainLocations`, which then does the attach-under-one-flagship, geocode and the
 * off-brand / bare-location guards (Parts A). Reuses the ONE `normStreet` key.
 *
 * Part A naming, enforced here at the source:
 *  - the branch's per-location label ("Acworth") becomes `SeedLocation.name`, which
 *    `seedChainLocations` stores as `location_label` — the ROW's `name` column is set
 *    to the brand inside `seedChainLocations`. So a heading is NEVER the venue name.
 *  - a label that is empty, or equal to the city, is dropped (null) so the branch is a
 *    plain city-labelled member, never a bogus "name == city" venue.
 */
import { normStreet, normCity } from "@/lib/admin/address";
import type { SeedLocation } from "@/lib/admin/chain-seed";
import type { LocatorBranch } from "./types";

export interface FeedToSeeds {
  seeds: SeedLocation[];
  /** How many branches collapsed onto an already-seen physical location. */
  deduped: number;
  /** Branches dropped for having neither a street nor a city. */
  dropped: number;
}

/** The dedupe identity discovery already uses: normalised street | normalised city.
 *  Exported so the provider tier keys cross-source dedupe and the cross-check on the
 *  SAME identity — one dedupe key across every tier, never a fork. */
export function locationKey(address: string | null | undefined, city: string | null | undefined): string {
  return `${normStreet(address ?? null)}|${normCity(city ?? "")}`;
}

/**
 * Map a feed's branches to seeds, deduped by physical location. `brand` is the chain
 * name (from the flagship, cross-checked against the feed's own brand_name upstream) —
 * NOT written here into a name; `seedChainLocations` owns that. A branch label equal to
 * its city is dropped so it can't become a `name == city` row (the Part A tripwire).
 *
 * `opts.carryProvider` (provider tier only): also carry the branch's own lat/long and
 * its `provider_refs` onto the seed, so seedChainLocations prefers the provider pin and
 * force-gates the row. Render/own-feed callers omit it — their seeds are unchanged.
 */
export function feedBranchesToSeeds(
  branches: LocatorBranch[],
  brand: string,
  opts?: { carryProvider?: boolean }
): FeedToSeeds {
  const seeds: SeedLocation[] = [];
  const seen = new Set<string>();
  let deduped = 0;
  let dropped = 0;

  for (const b of branches ?? []) {
    const address = b.address ?? null;
    const city = b.city ?? null;
    if (!address && !city) {
      dropped++;
      continue;
    }
    // Dedupe on the shared street|city key (only when there's a real street — a
    // city-only branch is left for seedChainLocations' placeholder-collapse).
    if (address) {
      const key = locationKey(address, city);
      if (seen.has(key)) {
        deduped++;
        continue;
      }
      seen.add(key);
    }
    // The label goes to SeedLocation.name (→ location_label). Drop a label that is
    // just the city or the brand, so no heading/city becomes the venue name.
    const label = b.location_label ?? null;
    const labelIsCity = label != null && normCity(label) === normCity(city ?? "");
    const labelIsBrand = label != null && normCity(label) === normCity(brand);
    const name = label && !labelIsCity && !labelIsBrand ? label : null;

    seeds.push({
      name,
      address,
      city,
      region: b.region ?? null,
      postcode: b.postcode ?? null,
      country: b.country ?? null,
      source_url: b.source_url ?? null,
      ...(opts?.carryProvider
        ? {
            lat: b.lat ?? null,
            lng: b.lng ?? null,
            provider_refs: b.provider_refs ?? null,
          }
        : {}),
    });
  }

  return { seeds, deduped, dropped };
}
