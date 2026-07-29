import type { SupabaseClient } from "@supabase/supabase-js";
import { findDuplicates, type DuplicateMatch, type VenueLike } from "./dedupe";

/** Load every venue's identity fields once, for matching a candidate against. */
export async function loadExistingVenues(db: SupabaseClient): Promise<VenueLike[]> {
  const { data } = await db
    .from("restaurants")
    .select("id, name, slug, address, city, lat, lng, chain_parent_id")
    .limit(5000);
  return (data ?? []) as VenueLike[];
}

/** Rank existing venues a single candidate might duplicate (loads + matches). */
export async function checkDuplicate(
  db: SupabaseClient,
  candidate: VenueLike
): Promise<DuplicateMatch[]> {
  const existing = await loadExistingVenues(db);
  return findDuplicates(candidate, existing);
}
