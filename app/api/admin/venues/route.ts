import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { geocodeAddress } from "@/lib/geo/geocode";
import { uniqueRestaurantSlug, resolveOrCreateBrand } from "@/lib/admin/venues";
import { BBQ_STYLES } from "@/lib/constants/styles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
}

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
  const country = (v.country || geo.country || "").trim();
  const slug = await uniqueRestaurantSlug(
    ctx.db,
    v.location_label ? `${name} ${v.location_label}` : name
  );

  // Optional brand attachment.
  let brandId: string | null = null;
  if (body.brand?.name) {
    const brand = await resolveOrCreateBrand(ctx.db, {
      name: String(body.brand.name),
      description: v.description ?? null,
      website: v.website ?? null,
      instagram_url: v.instagram_url ?? null,
      x_url: v.x_url ?? null,
      facebook_url: v.facebook_url ?? null,
      tiktok_url: v.tiktok_url ?? null,
      youtube_url: v.youtube_url ?? null,
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

  // Provenance log — the audit trail of where this venue's data came from.
  await ctx.db.from("enrichment_runs").insert({
    restaurant_id: data.id,
    entity_type: "venue_create",
    lead: body.lead ?? null,
    result: v as unknown as Record<string, unknown>,
    citations: citations.length ? citations : null,
    model: body.model ?? null,
    created_by: ctx.userId,
  });

  return NextResponse.json({ id: data.id, slug: data.slug, status: data.status });
}

/** PATCH — approve or reject a pending venue. */
export async function PATCH(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
  if (!restaurantId || !status) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { error } = await ctx.db
    .from("restaurants")
    .update({ status })
    .eq("id", restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
