/**
 * Admin venue-listing column sort (pure + testable). One comparator used by the
 * whole filtered set before pagination, so "newest first" is genuinely the
 * newest across all pages. Nulls/blanks ("never enriched", "unknown country")
 * ALWAYS sort last regardless of direction.
 */
export type SortKey = "name" | "status" | "country" | "photo" | "ig" | "enriched";
export type SortDir = "asc" | "desc";
export const SORT_KEYS: SortKey[] = ["name", "status", "country", "photo", "ig", "enriched"];

/** The venue fields the comparator needs (HubVenue satisfies this structurally). */
export interface SortableVenue {
  id: string;
  name: string;
  status: string;
  country: string | null;
  hasRealPhoto: boolean;
  hasIG: boolean;
  postsCount: number;
  enriched_at: string | null;
}

// Grouped, stable status ordering (any sensible order is fine).
const STATUS_RANK: Record<string, number> = { pending: 0, approved: 1, parked: 2, rejected: 3 };

/** Name key: case-insensitive, ignoring a leading quote/apostrophe/punctuation
 *  so 'Wilson's and "Smoke" sort under W / S. */
export const nameSortKey = (s: string): string =>
  (s ?? "").toLowerCase().replace(/^[^\p{L}\p{N}]+/u, "").trim();

const enrichedMs = (v: SortableVenue) => (v.enriched_at ? new Date(v.enriched_at).getTime() : NaN);

export function compareVenues(a: SortableVenue, b: SortableVenue, key: SortKey, dir: SortDir): number {
  const mult = dir === "asc" ? 1 : -1;
  const tie = () => nameSortKey(a.name).localeCompare(nameSortKey(b.name)) || a.id.localeCompare(b.id);

  if (key === "enriched") {
    const ta = enrichedMs(a), tb = enrichedMs(b);
    const na = Number.isNaN(ta), nb = Number.isNaN(tb);
    if (na && nb) return tie();
    if (na) return 1; // never-enriched always last
    if (nb) return -1;
    return (ta - tb) * mult || tie();
  }
  if (key === "country") {
    const ca = (a.country ?? "").trim(), cb = (b.country ?? "").trim();
    if (!ca && !cb) return tie();
    if (!ca) return 1; // unknown country always last
    if (!cb) return -1;
    return ca.localeCompare(cb) * mult || tie();
  }
  if (key === "name") return nameSortKey(a.name).localeCompare(nameSortKey(b.name)) * mult || a.id.localeCompare(b.id);
  if (key === "status") return ((STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)) * mult || tie();
  if (key === "photo") return (Number(a.hasRealPhoto) - Number(b.hasRealPhoto)) * mult || tie();
  // ig — presence first, then post count (desc → IG venues + higher counts on top).
  const pa = a.hasIG ? 1 : 0, pb = b.hasIG ? 1 : 0;
  if (pa !== pb) return (pa - pb) * mult;
  return ((a.postsCount ?? 0) - (b.postsCount ?? 0)) * mult || tie();
}
