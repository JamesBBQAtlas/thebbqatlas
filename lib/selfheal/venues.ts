import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichVenue } from "@/lib/ai/enrich";

/**
 * The self-healing data engine. It finds venues with gaps or drift, runs Grok,
 * and writes a *suggestion* — a proposed set of changes for an admin to approve.
 * It never edits live content directly. To respect the "recommend first" rule,
 * it only ever proposes to FILL EMPTY fields (or flag a closure) — it does not
 * propose overwriting facts a venue already has.
 */

const FILLABLE_SOCIAL = [
  "instagram_url",
  "x_url",
  "facebook_url",
  "tiktok_url",
  "youtube_url",
] as const;

interface VenueRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  hours: Record<string, string> | null;
  price_level: number | null;
  style: string | null;
  offerings: string[] | null;
  address: string | null;
  city: string | null;
  country: string | null;
  permanently_closed: boolean | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
}

/** Venues that look thin (missing common fields) and have no pending suggestion. */
export async function findThinVenues(
  db: SupabaseClient,
  limit: number
): Promise<VenueRow[]> {
  // Which venues already have a pending suggestion — skip those.
  const { data: pending } = await db
    .from("suggestions")
    .select("restaurant_id")
    .eq("status", "pending");
  const skip = new Set((pending ?? []).map((p) => p.restaurant_id).filter(Boolean));

  const { data } = await db
    .from("restaurants")
    .select(
      "id, name, slug, description, website, phone, hours, price_level, style, offerings, address, city, country, permanently_closed, instagram_url, x_url, facebook_url, tiktok_url, youtube_url"
    )
    .eq("status", "approved")
    .or("website.is.null,phone.is.null,hours.is.null,instagram_url.is.null")
    .order("enriched_at", { ascending: true, nullsFirst: true })
    .limit(limit + skip.size + 10);

  return ((data ?? []) as VenueRow[]).filter((r) => !skip.has(r.id)).slice(0, limit);
}

/** Run Grok on one venue and build a gap-fill/closure suggestion, or null. */
export async function buildSuggestion(v: VenueRow): Promise<{
  kind: string;
  title: string;
  summary: string;
  current: Record<string, unknown>;
  proposed: Record<string, unknown>;
  sources: string[];
  confidence: number;
} | null> {
  const e = await enrichVenue({
    name: v.name,
    instagram: v.instagram_url ?? undefined,
    website: v.website ?? undefined,
    address: v.address ?? undefined,
    city: v.city ?? undefined,
    country: v.country ?? undefined,
    phone: v.phone ?? undefined,
  });

  const proposed: Record<string, unknown> = {};
  const current: Record<string, unknown> = {};

  const fill = (field: string, cur: unknown, next: unknown) => {
    const isEmpty = cur === null || cur === undefined || cur === "";
    if (isEmpty && next !== null && next !== undefined && next !== "") {
      proposed[field] = next;
      current[field] = cur ?? null;
    }
  };

  fill("website", v.website, e.website);
  fill("phone", v.phone, e.phone);
  fill("hours", v.hours, e.hours);
  fill("price_level", v.price_level, e.price_level);
  for (const s of FILLABLE_SOCIAL) fill(s, v[s], e[s]);
  if ((v.offerings?.length ?? 0) === 0 && e.offerings.length) {
    proposed.offerings = e.offerings;
    current.offerings = v.offerings ?? [];
  }
  // Only suggest a description when the current one is a thin stub.
  if ((v.description?.trim().length ?? 0) < 40 && (e.description?.length ?? 0) > 60) {
    proposed.description = e.description;
    current.description = v.description ?? null;
  }

  // Closure signal — flagged for human confirmation, never auto-applied.
  const isClosure = e.permanently_closed === true && v.permanently_closed !== true;
  if (isClosure) {
    proposed.permanently_closed = true;
    current.permanently_closed = v.permanently_closed ?? false;
  }

  if (Object.keys(proposed).length === 0) return null;

  const fieldCount = Object.keys(proposed).filter((k) => k !== "permanently_closed").length;
  const kind = isClosure ? "closure" : "gap_fill";
  const title = isClosure ? `Possibly closed: ${v.name}` : `Fill ${fieldCount} gap${fieldCount === 1 ? "" : "s"}: ${v.name}`;
  const summary = isClosure
    ? `Grok found signs this venue may be permanently closed. Confirm before hiding it.`
    : `Grok found ${fieldCount} missing detail${fieldCount === 1 ? "" : "s"} to fill in.`;

  return {
    kind,
    title,
    summary,
    current,
    proposed,
    sources: e.citations,
    confidence: e.confidence,
  };
}

/**
 * Sweep a batch of thin venues into the suggestions queue. Bounded (default
 * small) so a single run stays within serverless time limits.
 */
export async function runSelfHealSweep(
  db: SupabaseClient,
  limit = 4
): Promise<{ scanned: number; created: number }> {
  const venues = await findThinVenues(db, limit);
  let created = 0;
  for (const v of venues) {
    try {
      const s = await buildSuggestion(v);
      if (!s) continue;
      const { error } = await db.from("suggestions").insert({
        kind: s.kind,
        restaurant_id: v.id,
        title: s.title,
        summary: s.summary,
        current: s.current,
        proposed: s.proposed,
        sources: s.sources,
        confidence: s.confidence,
        status: "pending",
        created_by: "self-heal",
      });
      if (!error) created++;
    } catch {
      // Skip a venue that errors; the next sweep can retry it.
    }
  }
  return { scanned: venues.length, created };
}
