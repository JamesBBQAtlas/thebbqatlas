import { createAnonClient } from "@/lib/supabase/anon";
import type { NewsPost } from "@/lib/types/database";

/** All published News & Missives, newest first. Reads the DB only — a clean empty
 *  table returns [] (NEVER seed content), so retired/empty news can't inject phantom
 *  seed URLs into the sitemap (B1 / L5). A transient error also yields [] and
 *  self-heals on the next request. */
export async function getNews(): Promise<NewsPost[]> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as NewsPost[];
  } catch {
    return [];
  }
}

/** A single published post by slug, or null. Never falls back to seed content —
 *  a clean not-found returns null (maybeSingle) so the page 404s. */
export async function getNewsBySlug(slug: string): Promise<NewsPost | null> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    return (data as NewsPost) ?? null;
  } catch {
    return null;
  }
}
