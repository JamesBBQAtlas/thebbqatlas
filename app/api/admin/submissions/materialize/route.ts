import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { geocodeAddress } from "@/lib/geo/geocode";
import { canonicalCountry } from "@/lib/constants/countries";
import { settlementCity, composeAddress } from "@/lib/admin/address";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { BBQ_STYLES } from "@/lib/constants/styles";
import { auditCreated } from "@/lib/admin/content-audit";
import { toHubVenue } from "@/lib/admin/hub";
import type { Restaurant } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const validCoord = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);

/**
 * Materialise a public submission into a PENDING (non-public) venue so the
 * normal enrichment/edit pipeline can run on it inside the Moderation Queue —
 * before it's approved to publish. OPERATOR-TRIGGERED ONLY (requireAdmin): a
 * submission is never auto-materialised, so a spammer can't trigger any AI spend
 * by hammering the public form. Idempotent — returns the existing pending venue
 * if this submission was already materialised.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const submissionId = String(body.submissionId ?? "");
  if (!submissionId) return NextResponse.json({ error: "submissionId required." }, { status: 400 });

  const { data: sub, error: subErr } = await ctx.db
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (subErr || !sub) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  // Idempotent: reuse the pending venue if we already made one and it still exists.
  if (sub.materialized_restaurant_id) {
    const { data: existing } = await ctx.db
      .from("restaurants")
      .select("*")
      .eq("id", sub.materialized_restaurant_id)
      .single();
    if (existing) {
      return NextResponse.json({ ok: true, restaurantId: existing.id, venue: toHubVenue(existing as Restaurant), reused: true });
    }
  }

  const name = String(sub.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Submission has no venue name." }, { status: 400 });

  const style =
    sub.style && (BBQ_STYLES as readonly string[]).includes(sub.style)
      ? sub.style
      : Array.isArray(sub.styles) && sub.styles[0] && (BBQ_STYLES as readonly string[]).includes(sub.styles[0])
        ? sub.styles[0]
        : "other";
  const rawCity = String(sub.city ?? "").trim();
  const city = settlementCity(rawCity) || rawCity;
  const country = canonicalCountry(String(sub.country ?? "").trim());
  const address = composeAddress({ street: sub.address, city: rawCity }) || String(sub.address ?? "").trim();

  // Pin: trust a submitted lat/lng only if real; else geocode; else 0,0 + flag
  // (never a silent ocean pin — same rule as the rest of the pipeline).
  let lat = 0;
  let lng = 0;
  let country_code: string | null = null;
  let needs_attention = false;
  let attention_reason: string | null = null;
  if (validCoord(sub.lat, sub.lng)) {
    lat = sub.lat;
    lng = sub.lng;
  } else {
    const geo = await geocodeAddress({ address: sub.address, city: rawCity, country });
    if (geo && validCoord(geo.lat, geo.lng)) {
      lat = geo.lat;
      lng = geo.lng;
      country_code = geo.country_code;
    } else {
      needs_attention = true;
      attention_reason = "Couldn't locate — check address / set pin manually";
    }
  }

  const slug = await uniqueRestaurantSlug(ctx.db, name);
  const igHandle = sub.instagram_handle
    ? String(sub.instagram_handle).replace(/^@/, "").replace(/\/+$/, "").toLowerCase()
    : null;
  const { data: inserted, error: insErr } = await ctx.db
    .from("restaurants")
    .insert({
      slug,
      name,
      description: String(sub.description ?? "").trim(),
      style,
      lat,
      lng,
      address,
      city,
      country,
      country_code,
      website: sub.website ?? null,
      instagram_handle: igHandle,
      instagram_url: igHandle ? `https://www.instagram.com/${igHandle}/` : null,
      price_level: 2,
      hero_image_url: "",
      hero_source: "none",
      status: "pending", // NON-public until the operator enriches, reviews & approves
      category: "restaurant",
      needs_attention,
      attention_reason,
    })
    .select("*")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Could not create the pending venue." }, { status: 500 });
  }

  await ctx.db
    .from("submissions")
    .update({ materialized_restaurant_id: inserted.id })
    .eq("id", submissionId);

  await auditCreated(ctx.db, inserted.id, { name, city, status: "pending" }, {
    source: "manual_edit",
    changedBy: ctx.userId,
    note: "materialised from public submission",
  });

  return NextResponse.json({ ok: true, restaurantId: inserted.id, venue: toHubVenue(inserted as Restaurant) });
}
