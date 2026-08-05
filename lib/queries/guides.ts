import { createAnonClient } from "@/lib/supabase/anon";
import type { Guide } from "@/lib/types/database";
import { FALLBACK_GUIDES } from "@/lib/data/fallback-guides";

/**
 * THE single guides visibility rule: a guide is public IFF
 *   is_published = true AND published_at <= now()
 * Applied to BOTH the index list and the by-slug detail read, so an unpublished
 * or future-dated guide is never served, and a scheduled guide appears on its
 * date automatically.
 *
 * IMPORTANT (content-leak fix): the DB is the source of truth. An EMPTY result
 * is a valid answer (e.g. all guides unpublished) — we must NOT substitute the
 * bundled fallback for it, or a pulled guide reappears. FALLBACK_GUIDES is a
 * last resort for a genuine DB *error* only, and it too is filtered by the
 * visibility rule (and is currently empty, since the old seed guides are retired).
 */
function visible(g: Guide): boolean {
  return Boolean(g.is_published) && !!g.published_at && new Date(g.published_at).getTime() <= Date.now();
}

export async function getGuides(): Promise<Guide[]> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .eq("is_published", true)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false });
    if (error) throw error;
    // Empty is a valid answer — never fall back to (possibly pulled) seed content.
    return (data ?? []) as Guide[];
  } catch {
    // Genuine DB error only — and still honour the visibility rule.
    return FALLBACK_GUIDES.filter(visible);
  }
}

export async function getGuideBySlug(slug: string): Promise<Guide | null> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .lte("published_at", new Date().toISOString())
      // maybeSingle: 0 rows returns null WITHOUT throwing, so an unpublished /
      // future / missing slug resolves to null → the route 404s (not the old
      // behaviour where .single() threw on 0 rows and leaked the fallback).
      .maybeSingle();
    if (error) throw error;
    return (data as Guide) ?? null;
  } catch {
    // Genuine DB error only — fallback must still pass the visibility rule.
    return FALLBACK_GUIDES.filter(visible).find((g) => g.slug === slug) ?? null;
  }
}
