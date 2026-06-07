import { createClient } from "@/lib/supabase/server";
import type { Restaurant, SignatureDish, GearItem, Review } from "@/lib/types/database";
import { FALLBACK_RESTAURANTS } from "@/lib/data/fallback-restaurants";

async function getSupabaseRestaurants(): Promise<Restaurant[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("status", "approved")
      .order("avg_rating", { ascending: false });

    if (error || !data?.length) return null;
    return data as Restaurant[];
  } catch {
    return null;
  }
}

export async function getRestaurants(): Promise<Restaurant[]> {
  const data = await getSupabaseRestaurants();
  return data ?? FALLBACK_RESTAURANTS;
}

export async function getFeaturedRestaurants(limit = 3): Promise<Restaurant[]> {
  const all = await getRestaurants();
  return all.filter((r) => r.is_featured).slice(0, limit);
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .eq("status", "approved")
      .single();
    if (data) return data as Restaurant;
  } catch {
    // fallback
  }
  return FALLBACK_RESTAURANTS.find((r) => r.slug === slug) ?? null;
}

export async function getSignatureDishes(restaurantId: string): Promise<SignatureDish[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("signature_dishes")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    if (data?.length) return data as SignatureDish[];
  } catch {
    // fallback
  }
  return [];
}

export async function getGearItems(restaurantId: string): Promise<GearItem[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("gear_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    if (data?.length) return data as GearItem[];
  } catch {
    // fallback
  }
  return [];
}

export async function getReviews(restaurantId: string): Promise<Review[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("reviews")
      .select("*, profiles(display_name, avatar_url)")
      .eq("restaurant_id", restaurantId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (data) return data as Review[];
  } catch {
    // fallback
  }
  return [];
}