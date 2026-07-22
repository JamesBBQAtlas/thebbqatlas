import { createAnonClient } from "@/lib/supabase/anon";
import type { NewsPost } from "@/lib/types/database";
import { FALLBACK_NEWS } from "@/lib/data/fallback-news";

/** All published News & Missives, newest first. Falls back to seed content. */
export async function getNews(): Promise<NewsPost[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("news")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    if (data?.length) return data as NewsPost[];
  } catch {
    // fallback
  }
  return FALLBACK_NEWS;
}

/** A single published post by slug. Falls back to seed content. */
export async function getNewsBySlug(slug: string): Promise<NewsPost | null> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("news")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();
    if (data) return data as NewsPost;
  } catch {
    // fallback
  }
  return FALLBACK_NEWS.find((n) => n.slug === slug) ?? null;
}
