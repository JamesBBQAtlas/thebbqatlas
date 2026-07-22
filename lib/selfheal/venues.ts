import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichVenue, type EnrichedVenue } from "@/lib/ai/enrich";
import { CLAUDE_ENABLED } from "@/lib/ai/claude";

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

type AgreeBy = "both" | "grok" | "claude" | "conflict";
interface FieldAgreement {
  by: AgreeBy;
  grok?: string;
  claude?: string;
}

const disp = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};
const norm = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim().toLowerCase().replace(/\/+$/, "");
};
const has = (v: unknown): boolean =>
  v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
const similar = (a: unknown, b: unknown): boolean => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

/**
 * Run BOTH engines on a venue (Grok always; Claude when enabled), then
 * reconcile into a proposal + per-field agreement so nothing slips through a
 * single model's blind spot. Returns null if neither finds anything to fill.
 */
export async function buildSuggestion(v: VenueRow): Promise<{
  kind: string;
  title: string;
  summary: string;
  current: Record<string, unknown>;
  proposed: Record<string, unknown>;
  agreement: Record<string, FieldAgreement>;
  models: string[];
  sources: string[];
  confidence: number;
} | null> {
  const lead = {
    name: v.name,
    instagram: v.instagram_url ?? undefined,
    website: v.website ?? undefined,
    address: v.address ?? undefined,
    city: v.city ?? undefined,
    country: v.country ?? undefined,
    phone: v.phone ?? undefined,
  };

  const [g, c] = await Promise.all([
    enrichVenue(lead, "grok").catch(() => null),
    CLAUDE_ENABLED ? enrichVenue(lead, "claude").catch(() => null) : Promise.resolve(null),
  ]);
  if (!g && !c) return null;

  const models: string[] = [];
  if (g) models.push("grok");
  if (c) models.push("claude");

  const proposed: Record<string, unknown> = {};
  const current: Record<string, unknown> = {};
  const agreement: Record<string, FieldAgreement> = {};

  const reconcile = (field: string, curVal: unknown, gVal: unknown, cVal: unknown) => {
    const curEmpty = !has(curVal);
    if (!curEmpty) return;
    const gHas = has(gVal);
    const cHas = has(cVal);
    if (!gHas && !cHas) return;

    if (gHas && cHas) {
      if (similar(gVal, cVal)) {
        proposed[field] = gVal;
        agreement[field] = { by: "both" };
      } else {
        proposed[field] = gVal; // default to Grok's; conflict surfaced for review
        agreement[field] = { by: "conflict", grok: disp(gVal), claude: disp(cVal) };
      }
    } else if (gHas) {
      proposed[field] = gVal;
      agreement[field] = { by: "grok" };
    } else {
      proposed[field] = cVal;
      agreement[field] = { by: "claude" };
    }
    current[field] = curVal ?? null;
  };

  const gf = (k: keyof EnrichedVenue) => (g ? g[k] : undefined);
  const cf = (k: keyof EnrichedVenue) => (c ? c[k] : undefined);

  reconcile("website", v.website, gf("website"), cf("website"));
  reconcile("phone", v.phone, gf("phone"), cf("phone"));
  reconcile("hours", v.hours, gf("hours"), cf("hours"));
  reconcile("price_level", v.price_level, gf("price_level"), cf("price_level"));
  for (const s of FILLABLE_SOCIAL) reconcile(s, v[s], gf(s), cf(s));
  if ((v.offerings?.length ?? 0) === 0) {
    reconcile("offerings", [], gf("offerings"), cf("offerings"));
  }
  if ((v.description?.trim().length ?? 0) < 40) {
    const gd = (g?.description?.length ?? 0) > 60 ? g?.description : undefined;
    const cd = (c?.description?.length ?? 0) > 60 ? c?.description : undefined;
    reconcile("description", v.description, gd, cd);
  }

  // Closure — flagged for human confirmation, never auto-applied.
  const gClosed = g?.permanently_closed === true;
  const cClosed = c?.permanently_closed === true;
  const isClosure = (gClosed || cClosed) && v.permanently_closed !== true;
  if (isClosure) {
    proposed.permanently_closed = true;
    current.permanently_closed = v.permanently_closed ?? false;
    agreement.permanently_closed = {
      by: gClosed && cClosed ? "both" : gClosed ? "grok" : "claude",
    };
  }

  if (Object.keys(proposed).length === 0) return null;

  const byBoth = Object.values(agreement).filter((a) => a.by === "both").length;
  const bySingle = Object.values(agreement).filter((a) => a.by === "grok" || a.by === "claude").length;
  const conflicts = Object.values(agreement).filter((a) => a.by === "conflict").length;

  const confidence =
    g && c
      ? Math.min(1, ((g.confidence + c.confidence) / 2) * (byBoth > 0 ? 1.05 : 1))
      : (g?.confidence ?? c?.confidence ?? 0);

  const fieldCount = Object.keys(proposed).filter((k) => k !== "permanently_closed").length;
  const kind = isClosure ? "closure" : "gap_fill";
  const dual = c && g;
  const title = isClosure
    ? `Possibly closed: ${v.name}`
    : `Fill ${fieldCount} gap${fieldCount === 1 ? "" : "s"}: ${v.name}`;
  const summary = dual
    ? `Grok + Claude agree on ${byBoth}, ${bySingle} found by one only${conflicts ? `, ${conflicts} to reconcile` : ""}.`
    : `${g ? "Grok" : "Claude"} found ${fieldCount} detail${fieldCount === 1 ? "" : "s"} to fill.`;

  const sources = [...new Set([...(g?.citations ?? []), ...(c?.citations ?? [])])].slice(0, 20);

  return { kind, title, summary, current, proposed, agreement, models, sources, confidence };
}

/**
 * Sweep a batch of thin venues into the suggestions queue. Venues run in
 * parallel (each doing Grok + Claude concurrently) so a dual-AI batch still
 * finishes within the serverless time budget.
 */
export async function runSelfHealSweep(
  db: SupabaseClient,
  limit = 4
): Promise<{ scanned: number; created: number }> {
  // Dual-AI is heavier — keep the concurrent batch smaller when Claude is on.
  const cap = Math.min(limit, CLAUDE_ENABLED ? 5 : 8);
  const venues = await findThinVenues(db, cap);

  const results = await Promise.all(
    venues.map(async (v) => {
      try {
        const s = await buildSuggestion(v);
        if (!s) return false;
        const { error } = await db.from("suggestions").insert({
          kind: s.kind,
          restaurant_id: v.id,
          title: s.title,
          summary: s.summary,
          current: s.current,
          proposed: s.proposed,
          agreement: s.agreement,
          models: s.models,
          sources: s.sources,
          confidence: s.confidence,
          status: "pending",
          created_by: "self-heal",
        });
        // Provenance: mirror the single-venue route's audit trail (F-14).
        try {
          await db.from("enrichment_runs").insert({
            restaurant_id: v.id,
            entity_type: "selfheal",
            lead: { name: v.name, city: v.city, country: v.country } as Record<string, unknown>,
            result: s as unknown as Record<string, unknown>,
            citations: s.sources.length ? s.sources : null,
            model: s.models.join("+") || "grok",
            created_by: null,
          });
        } catch {
          /* provenance logging is secondary */
        }
        return !error;
      } catch {
        return false;
      }
    })
  );

  return { scanned: venues.length, created: results.filter(Boolean).length };
}
