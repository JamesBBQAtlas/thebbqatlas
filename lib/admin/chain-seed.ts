import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { composeAddress, normStreet, normCity, settlementCity } from "@/lib/admin/address";
import { canonicalCountry, resolveCountryCode } from "@/lib/constants/countries";
import { geocodePrecise, GEOCODE_COARSE_REASON } from "@/lib/geo/geocode";
import { haversineKm } from "@/lib/utils/geo";
import { auditField } from "@/lib/admin/content-audit";

/** A location to seed: a branch label/name, optional street address, and city.
 *  Chain-discovery v2 (Part 1) also passes the branch's own country and the
 *  source URL it was read from, so the geocode write-guard can compare the
 *  geocoded country to the declared one and every pin traces back to a page. */
export interface SeedLocation {
  name: string | null;
  address?: string | null;
  city: string | null;
  /** The branch's declared country (falls back to the chain-anchored country). */
  country?: string | null;
  /** The page this branch was read from (stored as provenance). */
  source_url?: string | null;
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
  /** Existing STANDALONE same-brand rows that were LINKED into the chain instead
   *  of being duplicated (Part 4C — the "operator manually added a branch" case). */
  linked: number;
  /** New rows inserted flagged as a POSSIBLE duplicate of an existing record
   *  (uncertain same-city/same-brand match) — never a silent twin (Part 4C). */
  possibleDuplicates: number;
}

interface ExistingRow {
  id: string;
  address: string | null;
  city: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  isParent: boolean;
  /** A standalone same-brand row (not yet a member) — a confident match LINKS it
   *  into the chain rather than creating a duplicate (Part 4C). */
  linkable?: boolean;
  /** Its style, so a linked row can inherit the flagship style if it was "other". */
  style?: string | null;
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

/** Settlement-normalised city identity key ("City of Westminster" → "london"). */
function cityKeyOf(city: string | null): string {
  return normCity(settlementCity(city));
}

/**
 * The city identity to dedupe a NO-STREET placeholder by: its city text if it
 * has one, else fall back to its address line (a branch given only "Seoul" as its
 * address, with no city field, must still dedupe as "seoul"). Only meaningful for
 * a candidate/member that carries no distinct street.
 */
function placeholderCityKey(city: string | null, address: string | null): string {
  return cityKeyOf(city) || (address ? cityKeyOf(address) : "");
}

/** Known street-type tokens (after normStreet's abbreviation) that mark a road. */
const STREET_TYPES = new Set([
  "st", "ave", "rd", "blvd", "dr", "ln", "ct", "pl", "pkwy", "hwy",
  "way", "sq", "square", "terrace", "close", "walk", "row", "cres", "crescent",
  "gate", "wharf", "quay", "mews", "hill", "grove", "gardens", "parade",
]);

/**
 * Does this address carry a DISTINCT STREET (a real building line), versus being
 * just a bare city/settlement name? A roster seed like "Syracuse" or "Hamburg"
 * has no street — it geocodes to the city centre, not the building, so it must
 * NOT be treated as a precise location for dedupe. A real street has either a
 * building number (a digit) or a street-type token, and isn't just the city.
 */
function hasDistinctStreet(streetKey: string, cityKey: string): boolean {
  if (!streetKey) return false;
  if (streetKey === cityKey) return false; // the "street" is literally the city
  if (/\d/.test(streetKey)) return true; // has a building number
  return streetKey.split(" ").some((w) => STREET_TYPES.has(w)); // named road
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
  const result: SeedResult = { found, added: [], updated: [], matchedParent: 0, needsLocation: 0, linked: 0, possibleDuplicates: 0 };
  if (!found) return result;

  const { data: parentRow } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng, style")
    .eq("id", parentId)
    .single();
  // A chain is one brand = one cuisine — a new branch inherits the flagship's
  // style, never the "other" default (systemic fix). Only a definite (non-"other")
  // flagship style is inherited.
  const parentStyle = (parentRow as { style?: string } | null)?.style ?? null;
  const branchStyle = parentStyle && parentStyle !== "other" ? parentStyle : "other";
  const { data: siblingRows } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng")
    .eq("chain_parent_id", parentId);

  // Part 4C — also load STANDALONE rows carrying this brand name that are NOT yet
  // members of any chain (chain_parent_id IS NULL, excluding the parent itself).
  // These are the "operator manually added a branch" records: a confident match
  // must LINK them into the chain, never create a second copy (the duplicate
  // Trophy Club bug). Rows already parented under a DIFFERENT chain are left alone.
  const { data: brandRows } = await db
    .from("restaurants")
    .select("id, address, city, location_label, lat, lng, style, chain_parent_id")
    .eq("name", brand)
    .is("chain_parent_id", null)
    .neq("id", parentId);

  const existing: ExistingRow[] = [
    ...(parentRow ? [{ ...(parentRow as Omit<ExistingRow, "isParent">), isParent: true }] : []),
    ...((siblingRows ?? []) as Omit<ExistingRow, "isParent">[]).map((r) => ({ ...r, isParent: false })),
    ...((brandRows ?? []) as (Omit<ExistingRow, "isParent" | "linkable"> & { chain_parent_id: string | null })[])
      .filter((r) => r.id !== parentId)
      .map((r) => ({ id: r.id, address: r.address, city: r.city, location_label: r.location_label, lat: r.lat, lng: r.lng, style: r.style, isParent: false, linkable: true })),
  ];
  const consumed = new Set<string>(); // existing ids already matched this run

  // Geocode each incoming candidate up front (lightly throttled for MapTiler).
  // We need the coordinates both to dedupe by proximity AND to seed a real pin.
  // A candidate that fails to geocode gets geo=null.
  interface Candidate {
    loc: SeedLocation;
    /** Normalised street identity key (may be empty, or just the city). */
    streetKey: string;
    /** True only when it carries a real building line, not a bare city. */
    hasStreet: boolean;
    /** Settlement-normalised city key, for the city-only dedupe rule. */
    cityKey: string;
    /** City identity for a no-street placeholder (city text, else address). */
    effCityKey: string;
    lat: number | null;
    lng: number | null;
    country_code: string | null;
    geoCity: string | null;
    /** A specific attention reason (e.g. cross-country mis-pin) if not located. */
    attentionReason: string | null;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    let lat: number | null = null;
    let lng: number | null = null;
    let country_code: string | null = null;
    let geoCity: string | null = null;
    let attentionReason: string | null = null;
    if (i > 0) await sleep(200); // light courtesy throttle
    // Geocode with the BRANCH's declared country as context (falls back to the
    // chain-anchored country), so a place name resolves in the right country.
    const declaredCountry = canonicalCountry(loc.country ?? country);
    // Part 3 — precision-first: a branch address that only resolves to a town
    // centroid must NOT be pinned there; flag it for manual placement instead.
    const geo = await geocodePrecise({ address: loc.address, city: loc.city, country: declaredCountry || country, name: loc.name });
    if (geo.result && hasCoords(geo.result.lat, geo.result.lng)) {
      // Hard write-guard (§3.3): if the geocoded country ≠ the declared country,
      // DO NOT store the pin — flag it. This kills the cross-country mis-pin bug
      // (real overseas branches geocoded into random US states).
      const declaredCode = declaredCountry ? resolveCountryCode(null, declaredCountry) : null;
      const geoCode = geo.result.country_code ? geo.result.country_code.toUpperCase() : null;
      if (declaredCode && geoCode && declaredCode !== geoCode) {
        attentionReason = `Geocoded outside ${declaredCountry} (got ${geoCode}) — verify address / set pin`;
      } else {
        lat = geo.result.lat;
        lng = geo.result.lng;
        country_code = geo.result.country_code;
        geoCity = geo.result.city;
      }
    } else if (geo.status === "coarse_only") {
      attentionReason = GEOCODE_COARSE_REASON;
    }
    // Street key from the branch's OWN address line only (not folded with the
    // city), so a city-only entry reads as "no distinct street".
    const cityKey = cityKeyOf(loc.city);
    const streetKey = normStreet(loc.address);
    const hasStreet = hasDistinctStreet(streetKey, cityKey);
    candidates.push({
      loc,
      streetKey,
      hasStreet,
      cityKey,
      effCityKey: hasStreet ? "" : placeholderCityKey(loc.city, loc.address ?? null),
      lat,
      lng,
      country_code,
      geoCity,
      attentionReason,
    });
  }

  const matches = (c: Candidate, e: ExistingRow): boolean => {
    const eStreetKey = normStreet(e.address);
    const eCityKey = cityKeyOf(e.city);
    const eHasStreet = hasDistinctStreet(eStreetKey, eCityKey);
    // 1. Same real street address — the strongest identity signal (both sides
    //    must actually HAVE a distinct street; a bare-city "street" doesn't count).
    if (c.hasStreet && eHasStreet && c.streetKey === eStreetKey) return true;
    // 2. Geographic proximity — both sides have real (non-0,0) coordinates.
    if (hasCoords(c.lat, c.lng) && hasCoords(e.lat, e.lng)) {
      if (haversineKm(c.lat as number, c.lng as number, e.lat as number, e.lng as number) <= SAME_PLACE_KM) {
        return true;
      }
    }
    // 3. CITY-ONLY candidate (no distinct street of its own): it geocodes to the
    //    city centre and carries nothing to tell it apart from a member already
    //    in that settlement, so it must NEVER spawn a same-city duplicate of the
    //    flagship or a sibling (the Dinosaur "Syracuse" seed vs the 246 W Willow
    //    St flagship, ~700 m apart, that street+geo dedupe alone kept). A
    //    candidate WITH a distinct street is exempt — that's how genuine
    //    same-city branches (Bodean's Soho vs Tower Hill) are both kept.
    if (!c.hasStreet && c.cityKey && c.cityKey === eCityKey) return true;
    return false;
  };

  for (const c of candidates) {
    const loc = c.loc;
    const label = loc.name && loc.name !== brand ? loc.name : loc.city;
    if (!label) continue;

    // Fix 5 — placeholder collapse. A branch with NO distinct street is just a
    // city-level (or worse, city-less) placeholder: it carries nothing to tell it
    // apart from another member in the same city or at the same pin. So BEFORE the
    // normal match/insert, drop it if ANY existing member (consumed or not) shares
    // its city identity or its coordinates — this collapses a cluster of identical
    // "Seoul" / same-pin, no-address branches to ONE instead of materialising N
    // stacked duplicates. Branches WITH a real street are exempt (they insert as
    // usual), so genuine same-city branches are never wrongly merged.
    if (!c.hasStreet) {
      const dup = existing.find((e) => {
        const eStreetKey = normStreet(e.address);
        const eHasStreet = hasDistinctStreet(eStreetKey, cityKeyOf(e.city));
        const eEff = eHasStreet ? "" : placeholderCityKey(e.city, e.address);
        if (c.effCityKey && eEff && c.effCityKey === eEff) return true;
        if (
          hasCoords(c.lat, c.lng) &&
          hasCoords(e.lat, e.lng) &&
          haversineKm(c.lat as number, c.lng as number, e.lat as number, e.lng as number) <= SAME_PLACE_KM
        )
          return true;
        return false;
      });
      if (dup) {
        if (dup.isParent) result.matchedParent += 1;
        else result.updated.push({ label, city: settlementCity(loc.city) || loc.city });
        continue; // never materialise a duplicate placeholder
      }
    }

    const match = existing.find((e) => !consumed.has(e.id) && matches(c, e));

    if (match) {
      consumed.add(match.id);
      if (match.isParent) {
        result.matchedParent += 1; // the parent's own location — never a sibling
        continue;
      }
      if (match.linkable) {
        // Part 4C — a confident match to a STANDALONE same-brand row: LINK it into
        // the chain (set its parent) instead of creating a duplicate. Fill a fuller
        // address / pin, inherit the flagship style if it was on "other", and audit.
        const linkPatch: Record<string, unknown> = { chain_parent_id: parentId };
        const composedL = composeAddress({ street: loc.address, city: loc.city });
        if (composedL && composedL.length > (match.address ?? "").length) linkPatch.address = composedL;
        const settleL = settlementCity(loc.city);
        if (settleL && !settlementCity(match.city)) linkPatch.city = settleL;
        if (hasCoords(c.lat, c.lng) && !hasCoords(match.lat, match.lng)) {
          linkPatch.lat = c.lat;
          linkPatch.lng = c.lng;
          if (c.country_code) linkPatch.country_code = c.country_code;
        }
        if (branchStyle !== "other" && (!match.style || match.style === "other")) linkPatch.style = branchStyle;
        await db.from("restaurants").update(linkPatch).eq("id", match.id);
        await auditField(db, match.id, "chain", null,
          { linked_to: parentId, reason: "matched an existing standalone same-brand branch" },
          { source: "roster", changedBy: null, note: "linked existing branch into chain (dedupe, not duplicated)" });
        match.linkable = false; // it's a member now
        result.linked += 1;
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

    // Part 4C — before inserting, check for a PROBABLE-BUT-UNCERTAIN duplicate: a
    // same-brand record already in this city that we did NOT confidently match.
    // We only treat it as uncertain when the two can't be told apart — the existing
    // row has no distinct street, OR this candidate didn't get a real pin to compare
    // — so two clearly-distinct geocoded branches in one city are NOT flagged.
    let possibleDupOf: string | null = null;
    if (c.hasStreet && c.cityKey) {
      const uncertain = existing.find((e) => {
        if (consumed.has(e.id)) return false;
        if (cityKeyOf(e.city) !== c.cityKey) return false;
        const eHasStreet = hasDistinctStreet(normStreet(e.address), cityKeyOf(e.city));
        return !eHasStreet || !hasCoords(c.lat, c.lng);
      });
      if (uncertain) possibleDupOf = uncertain.id;
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
      // Inherit the flagship's cuisine (never the "other" default).
      style: branchStyle,
      lat: located ? c.lat : 0,
      lng: located ? c.lng : 0,
      address: composed,
      city: settle,
      // Per-branch declared country (falls back to the chain-anchored country).
      country: canonicalCountry(loc.country ?? country),
      price_level: 2,
      hero_image_url: "",
      hero_source: "none",
      status: "pending",
      category: "restaurant",
      chain_parent_id: parentId,
    };
    if (located && c.country_code) insertRow.country_code = c.country_code;
    // Provenance — every pin traces back to the page it was read from (§3.4).
    if (loc.source_url) insertRow.enrichment_sources = [loc.source_url];
    if (possibleDupOf) {
      // Part 4C — never silently create a twin. Insert FLAGGED with a link to the
      // record it may duplicate, so the operator can merge or dismiss in the queue.
      insertRow.possible_duplicate_of = possibleDupOf;
      insertRow.duplicate_reason = `Possible duplicate — a same-brand record already exists in ${settle || "this city"}. Merge or dismiss.`;
      insertRow.needs_attention = true;
      insertRow.attention_reason =
        insertRow.attention_reason ?? `Possible duplicate of an existing ${brand} record in ${settle || "this city"} — merge or dismiss.`;
    }
    if (!located) {
      // Fix B — never silently pin a new seed at (0,0). Flag it so the operator
      // fixes the address / drops a manual pin before it can go live. The reason
      // is specific when the geocode write-guard rejected a cross-country pin.
      insertRow.needs_attention = true;
      insertRow.attention_reason = c.attentionReason ?? insertRow.attention_reason ?? "Couldn't locate — check address / set pin manually";
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
      if (possibleDupOf) result.possibleDuplicates += 1;
      // Audit the inherited style at creation (source=roster).
      if (branchStyle !== "other") {
        await auditField(db, inserted.id as string, "style", null, branchStyle, {
          source: "roster",
          changedBy: null,
          note: "inherited flagship style at creation",
        });
      }
    }
  }

  return result;
}
