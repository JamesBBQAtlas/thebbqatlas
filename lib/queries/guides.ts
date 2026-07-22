import { createAnonClient } from "@/lib/supabase/anon";
import type { Guide } from "@/lib/types/database";
import { FALLBACK_GUIDES } from "@/lib/data/fallback-guides";

export async function getGuides(): Promise<Guide[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("guides")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    if (data?.length) return data as Guide[];
  } catch {
    // fallback
  }
  return FALLBACK_GUIDES;
}

export async function getGuideBySlug(slug: string): Promise<Guide | null> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("guides")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();
    if (data) return data as Guide;
  } catch {
    // fallback
  }
  return FALLBACK_GUIDES.find((g) => g.slug === slug) ?? null;
}