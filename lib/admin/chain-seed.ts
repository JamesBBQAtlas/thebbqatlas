import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { composeAddress, normStreet, settlementCity } from "@/lib/admin/address";
import { canonicalCountry } from "@/lib/constants/countries";
import { geocodeAddress } from "@/lib/geo/geocode";
import { haversineKm } from "@/lib/utils/geo";

/** A location to seed: a branch label/name, optional street address, and city. */
export interface SeedLocation {
  name: string | null;
  address?: string | null;
  city: string | null;
}

export interface SeedResult {
  /** How many incoming locations were considered. */
  found: number;
  /** Brand-new seed rows inserted. */
  added: { label: string; city: string | null }[];
  /** Existing seed rows matched and updated in place (no new row). */
  updated: { label: string; city: string | null }[];
  /** Incoming locations that ARE the parent's own venue (never seeded). */
  matchedParent: number;
  /** New seeds whose address wouldn't geocode — inserted at 0,0 + needs_attention. */
  needsLocation: number;
}

interface ExistingRow {
  id: string;
  address: string | null;
  city: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  isParent: boolean;
}

/** Two coordinates are the "same place" if within this radius (≈150 m). */
const SAME_PLACE_KM = 0.15;

/** Real, usable coordinates — not null and not the (0,0) placeholder. */
function hasCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A distinct BRANCH label (its own name), never a bare city — "" if none. */
function branchLabelKey(name: string | null, city: string | null, brand: string): string {
  const label = (name ?? "").trim();
  if (!label || label === brand) return "";
  const l = label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const c = (city ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  // Only a label that is genuinely distinct from the city is a safe identity key
  // ("Greater London" as a label would just re-introduce the city collision).
  return l && l !== c ? l : "";
}

/**
 * Seed / reconcile a chain's sibling locations (§09.2.2). Identity is the
 * PHYSICAL LOCATION — matched by normalised STREET address or GEO PROXIMITY,
 * never by city text (a coarse region like "Greater London" collides across
 * genuinely distinct branches). Every incoming candidate is deduped against ALL
 * existing chain members — the parent/flagship AND every current sibling:
 *   - a candidate that maps to the PARENT's own venue is skipped (never seeded
 *     as a sibling — this kills the "flagship duplicated" bug, e.g. a Red Dog
 *     roster spawning a second "37 Hoxton Square");
 *   - a match against an existing sibling UPDATES it in place (filling a fuller
 *     address / city), never inserts;
 *   - only genuinely new locations are inserted, geocoded to real coordinates —
 *     or, if the address won't geocode, inserted at 0,0 and flagged
 *     needs_attention rather than silently pinned in the ocean (Fix B).
 * Idempotent: running it twice yields zero net new rows. Called by the roster
 * gateway with full {name, address, city} locations.
 */
export async function seedChainLocations(
  db: SupabaseClient,
  parentId: string,
  brand: string,
  country: string | null,
  locations: SeedLocation[]
): Promise<SeedResult> {
  const found = locations.length;
  const result: SeedResult = { found, added: [], updated: [], matchedParent: 0, needsLocation: 0 };
  if (!found) return result;

  const { data: parentRow } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng")
    .eq("id", parentId)
    .single();
  const { data: siblingRows } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng")
    .eq("chain_parent_id", parentId);

  const existing: ExistingRow[] = [
    ...(parentRow ? [{ ...(parentRow as Omit<ExistingRow, "isParent">), isParent: true }] : []),
    ...((siblingRows ?? []) as Omit<ExistingRow, "isParent">[]).map((r) => ({ ...r, isParent: false })),
  ];
  const consumed = new Set<string>(); // existing ids already matched this run

  // Geocode each incoming candidate up front (throttled ≤1 req/sec for
  // Nominatim). We need the coordinates both to dedupe by proximity AND to seed
  // a real pin. A candidate that fails to geocode gets geo=null.
  interface Candidate {
    loc: SeedLocation;
    street: string;
    label: string;
    lat: number | null;
    lng: number | null;
    country_code: string | null;
    geoCity: string | null;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const composed = composeAddress({ street: loc.address, city: loc.city });
    let lat: number | null = null;
    let lng: number | null = null;
    let country_code: string | null = null;
    let geoCity: string | null = null;
    if (i > 0) await sleep(1100); // Nominatim courtesy throttle
    const geo = await geocodeAddress({ address: loc.address, city: loc.city, country });
    if (geo && hasCoords(geo.lat, geo.lng)) {
      lat = geo.lat;
      lng = geo.lng;
      country_code = geo.country_code;
      geoCity = geo.city;
    }
    candidates.push({
      loc,
      street: normStreet(composed),
      label: branchLabelKey(loc.name, loc.city, brand),
      lat,
      lng,
      country_code,
      geoCity,
    });
  }

  const matches = (c: Candidate, e: ExistingRow): boolean => {
    // 1. Same normalised street address — the strongest identity signal.
    const eStreet = normStreet(e.address);
    if (c.street && eStreet && c.street === eStreet) return true;
    // 2. Geographic proximity — both sides have real (non-0,0) coordinates.
    if (hasCoords(c.lat, c.lng) && hasCoords(e.lat, e.lng)) {
      if (haversineKm(c.lat as number, c.lng as number, e.lat as number, e.lng as number) <= SAME_PLACE_KM) {
        return true;
      }
    }
    // 3. Fallback ONLY when neither side has a street to compare: an identical
    //    distinct BRANCH label (never a bare city) — keeps re-runs of an
    //    address-less seed idempotent without the "Greater London" collision.
    if (!c.street && !eStreet) {
      const eLabel = branchLabelKey(e.location_label, e.city, brand);
      if (c.label && eLabel && c.label === eLabel) return true;
    }
    return false;
  };

  for (const c of candidates) {
    const loc = c.loc;
    const label = loc.name && loc.name !== brand ? loc.name : loc.city;
    if (!label) continue;

    const match = existing.find((e) => !consumed.has(e.id) && matches(c, e));

    if (match) {
      consumed.add(match.id);
      if (match.isParent) {
        result.matchedParent += 1; // the parent's own location — never a sibling
        continue;
      }
      // Update the existing sibling in place — fill a fuller address / city, and
      // upgrade a placeholder pin to real coordinates if we just geocoded them.
      const patch: Record<string, unknown> = {};
      const composed = composeAddress({ street: loc.address, city: loc.city });
      if (composed && composed.length > (match.address ?? "").length) patch.address = composed;
      const settle = settlementCity(loc.city);
      if (settle && !settlementCity(match.city)) patch.city = settle;
      if (hasCoords(c.lat, c.lng) && !hasCoords(match.lat, match.lng)) {
        patch.lat = c.lat;
        patch.lng = c.lng;
        if (c.country_code) patch.country_code = c.country_code;
        // A placeholder that just got a real pin no longer needs a location flag.
        patch.needs_attention = false;
        patch.attention_reason = null;
      }
      if (Object.keys(patch).length) await db.from("restaurants").update(patch).eq("id", match.id);
      result.updated.push({ label, city: settle || loc.city });
      continue;
    }

    // Genuinely new location → insert a $0 seed with a real pin when we have one.
    const settle = settlementCity(loc.city) || loc.city || "";
    const slug = await uniqueRestaurantSlug(db, `${brand} ${settle || label}`);
    const composed = composeAddress({ street: loc.address, city: loc.city });
    const located = hasCoords(c.lat, c.lng);
    const insertRow: Record<string, unknown> = {
      slug,
      name: brand,
      location_label: label,
      description: `${brand} — barbecue${settle ? ` in ${settle}` : ""}.`,
      style: "other",
      lat: located ? c.lat : 0,
      lng: located ? c.lng : 0,
      address: composed,
      city: settle,
      country: canonicalCountry(country),
      price_level: 2,
      hero_image_url: "",
      hero_source: "none",
      status: "pending",
      category: "restaurant",
      chain_parent_id: parentId,
    };
    if (located && c.country_code) insertRow.country_code = c.country_code;
    if (!located) {
      // Fix B — never silently pin a new seed at (0,0). Flag it so the operator
      // fixes the address / drops a manual pin before it can go live.
      insertRow.needs_attention = true;
      insertRow.attention_reason = "Couldn't locate — check address / set pin manually";
    }
    const { data: inserted, error } = await db
      .from("restaurants")
      .insert(insertRow)
      .select("id")
      .single();
    if (!error && inserted) {
      // Register the new row so later incoming items dedupe against it too.
      existing.push({
        id: inserted.id as string,
        address: composed,
        city: settle || null,
        location_label: label,
        lat: located ? c.lat : 0,
        lng: located ? c.lng : 0,
        isParent: false,
      });
      consumed.add(inserted.id as string);
      result.added.push({ label, city: settle || loc.city });
      if (!located) result.needsLocation += 1;
    }
  }

  return result;
}
