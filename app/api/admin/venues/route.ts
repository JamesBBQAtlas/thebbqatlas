import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { geocodeAddress } from "@/lib/geo/geocode";
import { uniqueRestaurantSlug, resolveOrCreateBrand } from "@/lib/admin/venues";
import { BBQ_STYLES } from "@/lib/constants/styles";
import { revalidateVenues } from "@/lib/cache/venues";
import { canonicalCountry } from "@/lib/constants/countries";
import { auditField, auditCreated } from "@/lib/admin/content-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface VenueInput {
  name?: string;
  description?: string;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  style?: string | null;
  offerings?: string[];
  price_level?: number | null;
  hours?: Record<string, string> | null;
  permanently_closed?: boolean | null;
  instagram_url?: string | null;
  x_url?: string | null;
  facebook_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  instagram_posts?: string[];
  location_label?: string | null;
  category?: string | null;
  event_starts_at?: string | null;
  event_ends_at?: string | null;
}

const CATEGORIES = new Set([
  "restaurant",
  "food_truck",
  "retailer",
  "market",
  "event",
  "festival",
  "school",
  "caterer",
]);

/**
 * POST — create a brand-new venue from a (usually Grok-enriched) lead. We
 * geocode the address for real map coordinates, generate a unique slug, attach
 * it to a brand if given, and record provenance. `publish:true` makes it live;
 * otherwise it lands as `pending` in the review queue so it can be polished.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const v = (body.venue ?? {}) as VenueInput;
  const publish = Boolean(body.publish);

  const name = (v.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  // Real coordinates are non-negotiable for a map — geocode or bail clearly.
  const geo = await geocodeAddress({
    address: v.address,
    city: v.city,
    country: v.country,
    name,
  });
  if (!geo) {
    return NextResponse.json(
      {
        error:
          "Couldn't locate this venue on the map from its address. Add or refine the address/city/country and try again.",
      },
      { status: 422 }
    );
  }

  const style =
    v.style && (BBQ_STYLES as string[]).includes(v.style) ? v.style : "other";
  const price =
    typeof v.price_level === "number" && v.price_level >= 1 && v.price_level <= 4
      ? Math.round(v.price_level)
      : 2;
  const city = (v.city || geo.city || "").trim();
  const country = canonicalCountry(v.country || geo.country || "");
  const slug = await uniqueRestaurantSlug(
    ctx.db,
    v.location_label ? `${name} ${v.location_label}` : name
  );

  // Optional brand attachment. Brand-level socials come from body.brand (the
  // brand's own accounts); the venue keeps its own location-level socials.
  let brandId: string | null = null;
  if (body.brand?.name) {
    const b = body.brand as Record<string, string | null | undefined>;
    const brand = await resolveOrCreateBrand(ctx.db, {
      name: String(b.name),
      description: b.description ?? v.description ?? null,
      website: b.website ?? null,
      instagram_url: b.instagram_url ?? null,
      x_url: b.x_url ?? null,
      facebook_url: b.facebook_url ?? null,
      tiktok_url: b.tiktok_url ?? null,
      youtube_url: b.youtube_url ?? null,
    });
    brandId = brand?.id ?? null;
  }

  const citations: string[] = Array.isArray(body.citations) ? body.citations : [];

  const insert = {
    slug,
    name,
    description: (v.description ?? "").trim() || `${name} — barbecue in ${city || country}.`,
    style,
    lat: geo.lat,
    lng: geo.lng,
    address: (v.address ?? "").trim(),
    city,
    country,
    country_code: geo.country_code,
    website: v.website ?? null,
    phone: v.phone ?? null,
    hours: v.hours ?? null,
    offerings: Array.isArray(v.offerings) ? v.offerings : [],
    price_level: price,
    hero_image_url: "",
    permanently_closed: Boolean(v.permanently_closed),
    instagram_url: v.instagram_url ?? null,
    x_url: v.x_url ?? null,
    facebook_url: v.facebook_url ?? null,
    tiktok_url: v.tiktok_url ?? null,
    youtube_url: v.youtube_url ?? null,
    instagram_posts: Array.isArray(v.instagram_posts) ? v.instagram_posts : null,
    brand_id: brandId,
    location_label: v.location_label ?? null,
    category: v.category && CATEGORIES.has(v.category) ? v.category : "restaurant",
    // Part 5 — the operator chose the item type on the Add-listing form, so it's
    // a confirmed manual value: protect it from being reclassified by a re-enrich.
    manual_category: true,
    manual_category_at: new Date().toISOString(),
    event_starts_at: v.event_starts_at || null,
    event_ends_at: v.event_ends_at || null,
    enrichment_sources: citations.length ? citations : null,
    enriched_at: new Date().toISOString(),
    status: publish ? "approved" : "pending",
  };

  const { data, error } = await ctx.db
    .from("restaurants")
    .insert(insert)
    .select("id, slug, status")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Provenance log — best-effort; must never fail a successful creation.
  try {
    await ctx.db.from("enrichment_runs").insert({
      restaurant_id: data.id,
      entity_type: "venue_create",
      lead: body.lead ?? null,
      result: v as unknown as Record<string, unknown>,
      citations: citations.length ? citations : null,
      model: body.model ?? null,
      created_by: ctx.userId,
    });
  } catch {
    // ignore — provenance is secondary
  }

  // Editorial audit — creation provenance.
  await auditCreated(ctx.db, data.id, { name, city, status: data.status }, {
    source: "manual_edit",
    changedBy: ctx.userId,
    note: "venue created (admin)",
  });

  if (data.status === "approved") revalidateVenues();
  return NextResponse.json({ id: data.id, slug: data.slug, status: data.status });
}

/** PATCH — approve or reject a pending venue. */
export async function PATCH(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  // approved | rejected | parked (holding pen) | pending (return to queue).
  const ALLOWED = ["approved", "rejected", "parked", "pending"];
  const status = ALLOWED.includes(body.status) ? (body.status as string) : null;
  const override = Boolean(body.override);
  if (!restaurantId || !status) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (status === "approved") {
    const { data: row } = await ctx.db
      .from("restaurants")
      .select("lat, lng, needs_attention, attention_reason")
      .eq("id", restaurantId)
      .single();
    // Guard 1: never publish an un-geocoded seed draft (it would pin at 0,0 in
    // the ocean). Catches both the (0,0) placeholder AND a null pin (a geocode
    // failure that was flagged needs_attention). Enrich it, or drop a manual pin
    // via the location editor, first. This one is HARD — no override.
    const badPin =
      row && (row.lat == null || row.lng == null || (row.lat === 0 && row.lng === 0));
    if (badPin) {
      return NextResponse.json(
        { error: "This venue has no map location yet — enrich it or set a pin first." },
        { status: 422 }
      );
    }
    // Guard 2 (Fix 10): a venue flagged needs_attention — most importantly one
    // whose research was too thin to write with authority — must NOT quietly go
    // live with filler. Block it and surface the reason for a human decision;
    // publishing anyway requires an EXPLICIT override from the operator.
    if (row?.needs_attention && !override) {
      return NextResponse.json(
        {
          error:
            (row.attention_reason as string) ||
            "This venue is flagged for attention — review it before publishing.",
          needs_override: true,
          attention_reason: (row.attention_reason as string) ?? null,
        },
        { status: 422 }
      );
    }
  }

  const { data: prev } = await ctx.db
    .from("restaurants")
    .select("status")
    .eq("id", restaurantId)
    .single();

  const { error } = await ctx.db
    .from("restaurants")
    .update({ status })
    .eq("id", restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit the publish/unpublish (status) change.
  await auditField(ctx.db, restaurantId, "published", prev?.status ?? null, status, {
    source: "manual_edit",
    changedBy: ctx.userId,
    note:
      status === "approved"
        ? "published"
        : status === "parked"
          ? "parked"
          : status === "pending"
            ? "returned to pending"
            : "unpublished/declined",
  });

  // Publishing/unpublishing changes what the public site shows — refresh now.
  revalidateVenues();
  return NextResponse.json({ ok: true, status });
}
