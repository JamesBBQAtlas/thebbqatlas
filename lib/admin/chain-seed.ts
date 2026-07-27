import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";

/** A location to seed: a branch label and/or a city. */
export interface SeedLocation {
  name: string | null;
  city: string | null;
}

/**
 * Insert un-enriched sibling seeds for a chain (§09.1.2 / §2b). Shared by the
 * parent enrich (dossier's quick chain_locations) and the roster gateway (the
 * full, authoritative branch list). Dedupes GLOBALLY on brand name + label/city
 * (case-insensitive) against every existing row for the brand, so re-running —
 * whether an enrich or a roster scan — never adds duplicates. Each seed is a $0
 * placeholder (no enrichment run); it points back to the parent via
 * chain_parent_id. Returns the labels actually inserted.
 */
export async function seedChainLocations(
  db: SupabaseClient,
  parentId: string,
  brand: string,
  country: string | null,
  locations: SeedLocation[]
): Promise<{ label: string; city: string | null }[]> {
  if (!locations.length) return [];

  // Every existing row for this brand (parent + any prior siblings).
  const { data: brandRows } = await db
    .from("restaurants")
    .select("city, location_label")
    .ilike("name", brand);
  const seen = new Set(
    (brandRows ?? []).map(
      (r) => `${(r.location_label ?? r.city ?? "").toLowerCase()}|${(r.city ?? "").toLowerCase()}`
    )
  );

  const added: { label: string; city: string | null }[] = [];
  for (const loc of locations) {
    const label = loc.name && loc.name !== brand ? loc.name : loc.city;
    if (!label) continue;
    const key = `${label.toLowerCase()}|${(loc.city ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const slug = await uniqueRestaurantSlug(db, `${brand} ${loc.city ?? label}`);
    const { error } = await db.from("restaurants").insert({
      slug,
      name: brand,
      location_label: label,
      description: `${brand} — barbecue${loc.city ? ` in ${loc.city}` : ""}.`,
      style: "other",
      lat: 0,
      lng: 0,
      address: "",
      city: loc.city || "",
      country: country || "",
      price_level: 2,
      hero_image_url: "",
      hero_source: "none",
      status: "pending",
      category: "restaurant",
      chain_parent_id: parentId,
    });
    if (!error) added.push({ label, city: loc.city });
  }
  return added;
}
