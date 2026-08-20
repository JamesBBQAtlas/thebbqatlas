import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import type { GearProduct, GearCategory } from "@/lib/types/database";
import { reportFallbackServed } from "@/lib/ops/fallback-alert";

/** Cache tag for every gear read (the /gear page AND venue-page recommendations).
 *  Revalidated by revalidateGear() on any admin gear edit so a DB change (e.g. a
 *  re-pointed affiliate_url) shows WITHOUT a redeploy — Part 2 fix. */
export const GEAR_TAG = "gear-products";

// THROWS on DB error (BUILD PROMPT 75, Fix 1c) so a transient failure is never
// cached as an empty catalogue for an hour. An empty result with no error (e.g.
// nothing active) is legitimate and cached normally.
const getGearProductsCached = unstable_cache(
  async (): Promise<GearProduct[]> => {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("gear_products")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`[queries.gear] read failed: ${error.message}`);
    return (data ?? []) as GearProduct[];
  },
  ["gear-products"],
  { tags: [GEAR_TAG], revalidate: 3600 }
);

/** All ACTIVE catalogue products, ordered for display. Public (anon) read.
 *  Degrades to [] (uncached) on a real failure, so a blip never freezes an empty
 *  catalogue and it self-heals on the next request. */
export async function getGearProducts(): Promise<GearProduct[]> {
  try {
    return await getGearProductsCached();
  } catch (e) {
    reportFallbackServed("gear-products", e, { servedLastKnownGood: false });
    return [];
  }
}

export function groupGearByCategory(
  products: GearProduct[]
): Partial<Record<GearCategory, GearProduct[]>> {
  const out: Partial<Record<GearCategory, GearProduct[]>> = {};
  for (const p of products) (out[p.category] ??= []).push(p);
  return out;
}

/**
 * Products to recommend on a venue page: BBQ-style matches first, then featured
 * general picks, then any general pick — de-duped and capped. Empty style_tags
 * means "suits any style".
 */
export async function getGearForStyle(
  style: string,
  limit = 3
): Promise<GearProduct[]> {
  const all = await getGearProducts();
  if (!all.length) return [];

  const matched = all.filter((p) => p.style_tags.includes(style));
  const generalFeatured = all.filter(
    (p) => p.style_tags.length === 0 && p.is_featured
  );
  const general = all.filter((p) => p.style_tags.length === 0);

  const seen = new Set<string>();
  const picks: GearProduct[] = [];
  for (const p of [...matched, ...generalFeatured, ...general]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push(p);
    if (picks.length >= limit) break;
  }
  return picks;
}
