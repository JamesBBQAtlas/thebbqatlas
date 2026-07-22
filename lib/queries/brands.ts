import { createAnonClient } from "@/lib/supabase/anon";
import type { Brand, Restaurant } from "@/lib/types/database";

/** A published brand plus its approved locations, for the brand page. */
export async function getBrandBySlug(
  slug: string
): Promise<{ brand: Brand; locations: Restaurant[] } | null> {
  try {
    const supabase = createAnonClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("*")
      .eq("slug", slug)
      .single();
    if (!brand) return null;

    const { data: locations } = await supabase
      .from("restaurants")
      .select("*")
      .eq("brand_id", brand.id)
      .eq("status", "approved")
      .order("city", { ascending: true });

    return { brand: brand as Brand, locations: (locations ?? []) as Restaurant[] };
  } catch {
    return null;
  }
}

/** Sibling locations under the same brand (excluding the current one). */
export async function getSiblingLocations(
  brandId: string,
  excludeId: string
): Promise<Restaurant[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("brand_id", brandId)
      .eq("status", "approved")
      .neq("id", excludeId)
      .order("city", { ascending: true });
    return (data ?? []) as Restaurant[];
  } catch {
    return [];
  }
}

/** All brands, for sitemap/listing. */
export async function getBrands(): Promise<Brand[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase.from("brands").select("*");
    return (data ?? []) as Brand[];
  } catch {
    return [];
  }
}
