import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import { enrichVenue, type VenueLead } from "@/lib/ai/enrich";
import { geocodeAddress } from "@/lib/geo/geocode";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Enrich a bulk-imported DRAFT venue in place (P-enrich). Runs the existing
 * Grok → house-voice research on the draft's seed fields, geocodes the result,
 * and writes the full record back — but keeps status='pending' so nothing
 * publishes without a human clicking Publish afterwards.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI is off — set XAI_API_KEY to enable enrichment." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select(
      "id, name, instagram_url, instagram_handle, website, address, city, country, status"
    )
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  const lead: VenueLead = {
    name: row.name ?? undefined,
    instagram:
      row.instagram_url ??
      (row.instagram_handle
        ? `https://www.instagram.com/${row.instagram_handle}/`
        : undefined),
    website: row.website ?? undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    country: row.country || undefined,
  };

  let e;
  try {
    e = await enrichVenue(lead);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed." },
      { status: 502 }
    );
  }

  // Build the patch from ONLY the fields enrichment actually returned, so we
  // never overwrite good data with null.
  const patch: Record<string, unknown> = {
    enriched_at: new Date().toISOString(),
  };
  if (e.name) patch.name = e.name;
  if (e.description) patch.description = e.description;
  if (e.style) patch.style = e.style;
  if (e.address) patch.address = e.address;
  if (e.phone) patch.phone = e.phone;
  if (typeof e.price_level === "number") patch.price_level = e.price_level;
  if (e.offerings.length) patch.offerings = e.offerings;
  if (e.hours) patch.hours = e.hours;
  if (typeof e.permanently_closed === "boolean")
    patch.permanently_closed = e.permanently_closed;
  if (e.instagram_url) patch.instagram_url = e.instagram_url;
  if (e.x_url) patch.x_url = e.x_url;
  if (e.facebook_url) patch.facebook_url = e.facebook_url;
  if (e.tiktok_url) patch.tiktok_url = e.tiktok_url;
  if (e.youtube_url) patch.youtube_url = e.youtube_url;
  if (e.location_label) patch.location_label = e.location_label;
  if (e.instagram_posts.length) patch.instagram_posts = e.instagram_posts;
  if (e.citations?.length) patch.enrichment_sources = e.citations;

  // Geocode so the draft gets a real map location (the Publish guard needs it).
  let city = e.city ?? row.city;
  let country = e.country ?? row.country;
  const geo = await geocodeAddress({
    address: e.address ?? row.address,
    city,
    country,
  });
  if (geo) {
    patch.lat = geo.lat;
    patch.lng = geo.lng;
    if (geo.country_code) patch.country_code = geo.country_code;
    city = geo.city ?? city;
    country = geo.country ?? country;
  }
  if (city) patch.city = city;
  if (country) patch.country = country;

  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    name: (patch.name as string) ?? row.name,
    confidence: e.confidence,
    geocoded: Boolean(geo),
    reviewer_notes: e.reviewer_notes,
  });
}
