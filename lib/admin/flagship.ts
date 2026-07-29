import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { composeAddress, normStreet, normCity } from "@/lib/admin/address";
import { mergeDossierFacts, matchBbqStyle, type VenueDossier } from "@/lib/ai/enrich";

/**
 * Chain "parent" = the TRUE flagship (the original location), NOT whichever
 * location we happened to enrich first. The research reads the brand's
 * About/origin page and returns `flagship_location`; this module decides whether
 * the record being enriched IS that flagship and, if not, reassigns the chain so
 * the real flagship is the parent and the enriched branch becomes a sibling.
 */

export interface FlagshipLocation {
  city: string | null;
  address: string | null;
  established: string | null;
}

/**
 * Does the record being enriched match the detected flagship location? True only
 * on a CONFIDENT match (same normalised street, or same normalised city/label).
 * A null flagship (couldn't be determined) is never a match.
 */
export function recordIsFlagship(
  record: { city: string | null; address: string | null; location_label?: string | null },
  flagship: FlagshipLocation | null
): boolean {
  if (!flagship) return false;
  const fStreet = normStreet(flagship.address);
  const rStreet = normStreet(record.address);
  if (fStreet && rStreet && fStreet === rStreet) return true;
  const fCity = normCity(flagship.city);
  if (!fCity) return Boolean(fStreet && rStreet && fStreet === rStreet);
  const rCity = normCity(record.city);
  const rLabel = normCity(record.location_label ?? null);
  return fCity === rCity || fCity === rLabel;
}

/**
 * Build the flagship PARENT's dossier from the brand facts gathered while
 * enriching a branch: keep every BRAND-level fact (founding, pitmaster, method,
 * wood, specialities, character, style, socials, chain roster) so siblings can
 * inherit them, but blank the BRANCH's own location specifics and stamp the
 * flagship's own city/address/founding. Never an empty seed.
 */
export function buildFlagshipDossier(
  brandDossier: VenueDossier,
  flagship: FlagshipLocation,
  brand: string
): VenueDossier {
  return {
    ...brandDossier,
    name: brand,
    location_label: null,
    address: flagship.address ?? null,
    city: flagship.city ?? null,
    region_state: null,
    postcode: null,
    lat: null,
    lng: null,
    phone: null,
    hours: null,
    opening_date: null,
    established: flagship.established ?? brandDossier.established,
    is_chain: true,
    unknowns: [],
  };
}

export interface FlagshipReassignResult {
  flagshipId: string;
  created: boolean;
  flagshipCity: string | null;
}

/**
 * Ensure the true flagship is the chain PARENT when we started enriching from a
 * BRANCH. Finds the flagship row (by brand + normalised city/street) or creates
 * it as a seed carrying the brand facts, makes it the parent (chain_parent_id
 * null), then re-points the branch — and anything already parented under the
 * branch — to it. Idempotent-ish: a second run finds the same flagship. Does NO
 * web research (no search-budget impact).
 */
export async function ensureFlagshipParent(
  db: SupabaseClient,
  opts: {
    branchId: string;
    brand: string;
    country: string | null;
    flagship: FlagshipLocation;
    brandDossier: VenueDossier;
  }
): Promise<FlagshipReassignResult> {
  const { branchId, brand, country, flagship, brandDossier } = opts;
  const fStreet = normStreet(flagship.address);
  const fCity = normCity(flagship.city);

  // Look for an existing flagship row among this brand's records (excluding the
  // branch we started from). Match on physical address first, then city/label.
  const { data: candidates } = await db
    .from("restaurants")
    .select("id, city, address, location_label, dossier")
    .eq("name", brand);
  const existing = (candidates ?? []).find((r) => {
    if (r.id === branchId) return false;
    const rStreet = normStreet(r.address as string | null);
    if (fStreet && rStreet && fStreet === rStreet) return true;
    if (!fCity) return false;
    return normCity(r.city as string | null) === fCity || normCity(r.location_label as string | null) === fCity;
  });

  const flagshipDossier = buildFlagshipDossier(brandDossier, flagship, brand);

  let flagshipId: string;
  let created = false;
  if (existing) {
    flagshipId = existing.id as string;
    // Fill-empty MERGE the brand facts onto the existing flagship — never clobber
    // its own good data, but guarantee it carries the brand facts for inheritance.
    const base = (existing.dossier as VenueDossier | null) ?? null;
    const merged = base ? mergeDossierFacts(base, flagshipDossier) : flagshipDossier;
    await db.from("restaurants").update({ chain_parent_id: null, dossier: merged }).eq("id", flagshipId);
  } else {
    const slug = await uniqueRestaurantSlug(db, `${brand} ${flagship.city ?? "flagship"}`);
    const composed = composeAddress({ street: flagship.address, city: flagship.city });
    const { data: ins, error } = await db
      .from("restaurants")
      .insert({
        slug,
        name: brand,
        location_label: null,
        description: `${brand} — barbecue${flagship.city ? ` in ${flagship.city}` : ""}.`,
        style: matchBbqStyle(brandDossier.bbq_style) ?? "other",
        lat: 0,
        lng: 0,
        address: composed,
        city: flagship.city || "",
        country: country || "",
        price_level: 2,
        hero_image_url: "",
        hero_source: "none",
        status: "pending",
        category: "restaurant",
        chain_parent_id: null,
        dossier: flagshipDossier,
      })
      .select("id")
      .single();
    if (error || !ins) {
      // Couldn't create the flagship — leave the chain as-is rather than orphan it.
      throw new Error(`Failed to create flagship parent: ${error?.message ?? "insert failed"}`);
    }
    flagshipId = ins.id as string;
    created = true;
  }

  // Re-point the branch, and anything already parented under the branch, to the
  // flagship. Then make sure the flagship itself is never parented (not to the
  // branch, not to itself).
  await db.from("restaurants").update({ chain_parent_id: flagshipId }).eq("id", branchId);
  await db.from("restaurants").update({ chain_parent_id: flagshipId }).eq("chain_parent_id", branchId);
  await db.from("restaurants").update({ chain_parent_id: null }).eq("id", flagshipId);

  return { flagshipId, created, flagshipCity: flagship.city };
}
