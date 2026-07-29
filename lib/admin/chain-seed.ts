import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { composeAddress, normStreet, normCity } from "@/lib/admin/address";
import { canonicalCountry } from "@/lib/constants/countries";

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
}

interface ExistingRow {
  id: string;
  address: string | null;
  city: string | null;
  location_label: string | null;
  isParent: boolean;
}

/** Identity keys for a physical location — street first, city/label as fallback. */
function keysFor(row: {
  address: string | null;
  city: string | null;
  location_label: string | null;
}) {
  return {
    street: normStreet(row.address),
    city: normCity(row.city),
    label: normCity(row.location_label ?? row.city),
  };
}

/**
 * Seed / reconcile a chain's sibling locations (§09.2.2). Identity is the
 * PHYSICAL LOCATION, not the city string: two records at the same normalised
 * street address are the same place however the city is spelled ("Olathe" vs
 * "Olathe, KS"). Behaviour:
 *   - matches each incoming location against the parent + all existing siblings;
 *   - an incoming location that maps to the PARENT's own venue is skipped (never
 *     seeded as a sibling — this kills the "flagship duplicated" bug);
 *   - a match against an existing sibling UPDATES it in place (filling a fuller
 *     address / city), never inserts;
 *   - only genuinely new locations are inserted.
 * Idempotent: running it twice yields zero net new rows. Shared by the parent
 * enrich (quick {name,city} list) and the roster gateway (full {name,address,city}).
 */
export async function seedChainLocations(
  db: SupabaseClient,
  parentId: string,
  brand: string,
  country: string | null,
  locations: SeedLocation[]
): Promise<SeedResult> {
  const found = locations.length;
  const result: SeedResult = { found, added: [], updated: [], matchedParent: 0 };
  if (!found) return result;

  const { data: parentRow } = await db
    .from("restaurants")
    .select("id, address, city, location_label")
    .eq("id", parentId)
    .single();
  const { data: siblingRows } = await db
    .from("restaurants")
    .select("id, address, city, location_label")
    .eq("chain_parent_id", parentId);

  const existing: ExistingRow[] = [
    ...(parentRow ? [{ ...(parentRow as Omit<ExistingRow, "isParent">), isParent: true }] : []),
    ...((siblingRows ?? []) as Omit<ExistingRow, "isParent">[]).map((r) => ({ ...r, isParent: false })),
  ];
  const consumed = new Set<string>(); // existing ids already matched this run

  const matches = (incoming: SeedLocation, e: ExistingRow): boolean => {
    const a = keysFor({ address: incoming.address ?? null, city: incoming.city, location_label: incoming.name });
    const b = keysFor(e);
    if (a.street && b.street && a.street === b.street) return true; // same physical address
    if (a.city && (a.city === b.city || a.city === b.label)) return true; // same city/label
    if (a.label && (a.label === b.city || a.label === b.label)) return true;
    return false;
  };

  for (const loc of locations) {
    const label = loc.name && loc.name !== brand ? loc.name : loc.city;
    if (!label) continue;

    const match = existing.find((e) => !consumed.has(e.id) && matches(loc, e));

    if (match) {
      consumed.add(match.id);
      if (match.isParent) {
        result.matchedParent += 1; // the parent's own location — never a sibling
        continue;
      }
      // Update the existing sibling in place — fill a fuller address / city.
      const patch: Record<string, unknown> = {};
      const composed = composeAddress({ street: loc.address, city: loc.city });
      if (composed && composed.length > (match.address ?? "").length) patch.address = composed;
      if (normCity(loc.city) && !normCity(match.city)) patch.city = loc.city;
      if (Object.keys(patch).length) await db.from("restaurants").update(patch).eq("id", match.id);
      result.updated.push({ label, city: loc.city });
      continue;
    }

    // Genuinely new location → insert a $0 seed.
    const slug = await uniqueRestaurantSlug(db, `${brand} ${loc.city ?? label}`);
    const composed = composeAddress({ street: loc.address, city: loc.city });
    const { data: inserted, error } = await db
      .from("restaurants")
      .insert({
        slug,
        name: brand,
        location_label: label,
        description: `${brand} — barbecue${loc.city ? ` in ${loc.city}` : ""}.`,
        style: "other",
        lat: 0,
        lng: 0,
        address: composed,
        city: loc.city || "",
        country: canonicalCountry(country),
        price_level: 2,
        hero_image_url: "",
        hero_source: "none",
        status: "pending",
        category: "restaurant",
        chain_parent_id: parentId,
      })
      .select("id")
      .single();
    if (!error && inserted) {
      // Register the new row so later incoming items dedupe against it too.
      existing.push({
        id: inserted.id as string,
        address: composed,
        city: loc.city ?? null,
        location_label: label,
        isParent: false,
      });
      consumed.add(inserted.id as string);
      result.added.push({ label, city: loc.city });
    }
  }

  return result;
}
