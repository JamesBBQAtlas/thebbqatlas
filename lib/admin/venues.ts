import type { SupabaseClient } from "@supabase/supabase-js";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** A restaurant slug that isn't already taken (appends -2, -3, … on collision). */
export async function uniqueRestaurantSlug(
  db: SupabaseClient,
  base: string
): Promise<string> {
  const root = slugify(base) || "venue";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const { data } = await db
      .from("restaurants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${i}`;
  }
  // Extremely unlikely — fall back to a time-free disambiguator.
  return `${root}-${Math.floor(performance.now())}`;
}

/** Resolve a brand by slug, or create it. Returns { id, slug }. */
export async function resolveOrCreateBrand(
  db: SupabaseClient,
  brand: {
    name: string;
    slug?: string;
    description?: string | null;
    website?: string | null;
    instagram_url?: string | null;
    x_url?: string | null;
    facebook_url?: string | null;
    tiktok_url?: string | null;
    youtube_url?: string | null;
  }
): Promise<{ id: string; slug: string } | null> {
  const slug = slugify(brand.slug || brand.name);
  if (!slug) return null;

  const { data: existing } = await db
    .from("brands")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return { id: existing.id, slug: existing.slug };

  const insert: Record<string, unknown> = { slug, name: brand.name };
  for (const k of [
    "description",
    "website",
    "instagram_url",
    "x_url",
    "facebook_url",
    "tiktok_url",
    "youtube_url",
  ] as const) {
    if (brand[k]) insert[k] = brand[k];
  }
  const { data, error } = await db
    .from("brands")
    .insert(insert)
    .select("id, slug")
    .single();
  if (error || !data) return null;
  return { id: data.id, slug: data.slug };
}
