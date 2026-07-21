import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GrokError } from "@/lib/ai/grok";
import { enrichVenue, type VenueLead } from "@/lib/ai/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET ?slug= — resolve a venue by slug so the console can load & apply to it. */
export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const { data } = await ctx.db
    .from("restaurants")
    .select(
      "id, name, slug, description, website, phone, address, city, country, style, offerings, price_level, hours, permanently_closed, instagram_url, x_url, facebook_url, tiktok_url, youtube_url"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "No venue with that slug." }, { status: 404 });
  return NextResponse.json({ restaurant: data });
}

/**
 * POST — send Grok hunting for a venue's metadata from whatever the admin has.
 * Returns a reviewable draft; it does NOT write anything.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI enrichment is off — set XAI_API_KEY to switch it on." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));

  // If a restaurantId is supplied, seed the lead from the existing row so Grok
  // fills the gaps rather than starting cold.
  let lead: VenueLead = (body.lead ?? {}) as VenueLead;
  if (body.restaurantId) {
    const { data: r } = await ctx.db
      .from("restaurants")
      .select("name, website, address, city, country, phone")
      .eq("id", body.restaurantId)
      .single();
    if (r) {
      lead = {
        name: r.name ?? lead.name,
        website: r.website ?? lead.website,
        address: r.address ?? lead.address,
        city: r.city ?? lead.city,
        country: r.country ?? lead.country,
        phone: r.phone ?? lead.phone,
        ...lead,
      };
    }
  }

  if (!lead.name && !lead.instagram && !lead.website && !lead.address) {
    return NextResponse.json(
      { error: "Give Grok something to work with — a name, handle, or address." },
      { status: 400 }
    );
  }

  let enriched;
  try {
    enriched = await enrichVenue(lead);
  } catch (err) {
    const msg =
      err instanceof GrokError
        ? err.message
        : err instanceof Error
          ? `Enrichment error: ${err.message}`
          : "Enrichment failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Provenance: log the hunt (and its sources). Best-effort — a logging failure
  // must never lose a successful enrichment.
  try {
    await ctx.db.from("enrichment_runs").insert({
      restaurant_id: body.restaurantId ?? null,
      entity_type: "venue",
      lead: lead as unknown as Record<string, unknown>,
      result: enriched as unknown as Record<string, unknown>,
      citations: enriched.citations?.length ? enriched.citations : null,
      model: process.env.XAI_MODEL ?? "grok-4.5",
      created_by: ctx.userId,
    });
  } catch {
    // provenance logging is secondary — ignore
  }

  return NextResponse.json({ enriched });
}

/**
 * PUT — apply admin-approved fields to an existing restaurant row. Only the
 * fields the admin actually sends are written, so nothing is overwritten by
 * accident.
 */
export async function PUT(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const fields = (body.fields ?? {}) as Record<string, unknown>;
  if (!restaurantId || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to apply." }, { status: 400 });
  }

  // Whitelist the columns enrichment is allowed to touch.
  const ALLOWED = new Set([
    "description",
    "website",
    "phone",
    "address",
    "city",
    "country",
    "style",
    "offerings",
    "price_level",
    "hours",
    "permanently_closed",
    "instagram_url",
    "x_url",
    "facebook_url",
    "tiktok_url",
    "youtube_url",
    "brand_id",
    "location_label",
  ]);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED.has(k) && v !== undefined && v !== null) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No allowed fields." }, { status: 400 });
  }

  // Capture current values so we can record (and return) exactly what changed.
  const cols = Object.keys(update);
  const { data: current } = await ctx.db
    .from("restaurants")
    .select(cols.join(","))
    .eq("id", restaurantId)
    .single();
  const before = (current ?? {}) as Record<string, unknown>;
  const changes = cols
    .map((f) => ({ field: f, from: before[f] ?? null, to: update[f] }))
    .filter((c) => JSON.stringify(c.from ?? null) !== JSON.stringify(c.to ?? null));

  // Stamp enrichment metadata so freshness reflects this update.
  update.enriched_at = new Date().toISOString();
  const citations: string[] = Array.isArray(body.citations) ? body.citations : [];
  if (citations.length) update.enrichment_sources = citations;

  const { error } = await ctx.db
    .from("restaurants")
    .update(update)
    .eq("id", restaurantId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit trail — record exactly what changed. Best-effort.
  try {
    await ctx.db.from("enrichment_runs").insert({
      restaurant_id: restaurantId,
      entity_type: "venue_apply",
      result: { changes } as unknown as Record<string, unknown>,
      citations: citations.length ? citations : null,
      model: process.env.XAI_MODEL ?? "grok-4.5",
      created_by: ctx.userId,
    });
  } catch {
    // audit is secondary — never fail the apply
  }

  return NextResponse.json({ ok: true, applied: cols, changes });
}
