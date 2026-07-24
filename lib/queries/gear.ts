import { createAnonClient } from "@/lib/supabase/anon";
import type { GearProduct, GearCategory } from "@/lib/types/database";

/** All ACTIVE catalogue products, ordered for display. Public (anon) read. */
export async function getGearProducts(): Promise<GearProduct[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("gear_products")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (data?.length) return data as GearProduct[];
  } catch {
    // Table may not exist yet (pre-migration) — degrade to empty.
  }
  return [];
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
