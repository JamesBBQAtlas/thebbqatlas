import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify, uniqueRestaurantSlug } from "@/lib/admin/venues";

/**
 * Rename a restaurant's slug and leave a 301 behind so the old URL never 404s.
 * Writes the new slug on the row and records old→new in slug_redirects (the
 * venue page consults that table when no venue matches a requested slug).
 * Skips a redirect row when the old slug is about to be re-used by a live venue
 * (caller passes freeingForLiveSlug) — that URL now legitimately serves another
 * venue, so a redirect would be wrong and would never fire anyway.
 */
export async function renameVenueSlug(
  db: SupabaseClient,
  id: string,
  newSlug: string,
  oldSlug: string | null,
  opts?: { skipRedirect?: boolean }
): Promise<void> {
  await db.from("restaurants").update({ slug: newSlug }).eq("id", id);
  if (oldSlug && oldSlug !== newSlug && !opts?.skipRedirect) {
    // Upsert so a re-rename keeps pointing old → newest.
    await db.from("slug_redirects").upsert({ old_slug: oldSlug, new_slug: newSlug }, { onConflict: "old_slug" });
    // If the OLD slug had itself been a redirect target, re-point those too.
    await db.from("slug_redirects").update({ new_slug: newSlug }).eq("new_slug", oldSlug);
  }
}

/**
 * The slug a (name, city) pair SHOULD produce, unique across venues. Returns the
 * current slug unchanged if it already matches (so we don't churn URLs need-
 * lessly) — otherwise a fresh unique slug.
 */
export async function desiredVenueSlug(
  db: SupabaseClient,
  id: string,
  name: string,
  city: string | null,
  currentSlug: string | null
): Promise<string> {
  const root = slugify(`${name} ${city ?? ""}`.trim());
  if (!root) return currentSlug ?? "venue";
  // Already correct (exact or a -N variant of the right root) → keep it.
  if (currentSlug && (currentSlug === root || new RegExp(`^${root}-\\d+$`).test(currentSlug))) {
    return currentSlug;
  }
  // Is the ideal root free (ignoring this row)?
  const { data } = await db.from("restaurants").select("id").eq("slug", root).maybeSingle();
  if (!data || data.id === id) return root;
  return uniqueRestaurantSlug(db, `${name} ${city ?? ""}`);
}
