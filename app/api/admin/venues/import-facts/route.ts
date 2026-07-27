import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import { CLAUDE_ENABLED } from "@/lib/ai/claude";
import {
  writeVenueCopy,
  buildCopyPatch,
  matchBbqStyle,
  priceBandToLevel,
  mapSocials,
} from "@/lib/ai/enrich";
import { geocodeAddress } from "@/lib/geo/geocode";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { parseFactsSheet, rowToDossier, factsHandle } from "@/lib/admin/facts-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 15;

async function processRow(
  db: SupabaseClient,
  row: Record<string, string>
): Promise<{ created: boolean; attention: boolean }> {
  const dossier = rowToDossier(row);
  const handle = factsHandle(row);
  const copy = await writeVenueCopy(dossier); // Claude-only — Grok skipped

  let lat = dossier.lat;
  let lng = dossier.lng;
  let country_code: string | null = null;
  if (lat === null || lng === null) {
    const geo = await geocodeAddress({
      address: dossier.address,
      city: dossier.city,
      country: dossier.country,
    });
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      country_code = geo.country_code;
    }
  }

  const style = matchBbqStyle(dossier.bbq_style);
  const price = priceBandToLevel(dossier.price_band);
  const socials = mapSocials(dossier.other_socials);
  const igPosts = [
    ...(dossier.best_photo_post_url ? [dossier.best_photo_post_url] : []),
    ...dossier.recent_instagram_posts,
  ].filter((v, i, a) => a.indexOf(v) === i);
  const address = [dossier.address, dossier.postcode]
    .filter((s) => s && String(s).trim())
    .join(", ");

  // Match an existing venue (idempotent on IG handle, else exact name).
  let existing: { id: string; status: string } | null = null;
  if (handle) {
    const { data } = await db
      .from("restaurants")
      .select("id, status")
      .eq("instagram_handle", handle)
      .maybeSingle();
    const r = data as { id: string; status: string } | null;
    if (r) existing = { id: r.id, status: r.status };
  }
  if (!existing && dossier.name) {
    const { data } = await db
      .from("restaurants")
      .select("id, status")
      .ilike("name", dossier.name)
      .limit(1);
    const r = (data as { id: string; status: string }[] | null)?.[0];
    if (r) existing = { id: r.id, status: r.status };
  }

  if (existing) {
    const patch: Record<string, unknown> = {
      dossier,
      enriched_at: new Date().toISOString(),
      ...buildCopyPatch(existing.status, copy),
    };
    if (dossier.name) patch.name = dossier.name;
    if (dossier.location_label) patch.location_label = dossier.location_label;
    if (style) patch.style = style;
    if (address) patch.address = address;
    if (dossier.phone) patch.phone = dossier.phone;
    if (dossier.website) patch.website = dossier.website;
    if (dossier.instagram) patch.instagram_url = dossier.instagram;
    if (handle) patch.instagram_handle = handle;
    if (igPosts.length) patch.instagram_posts = igPosts;
    if (socials.x_url) patch.x_url = socials.x_url;
    if (socials.facebook_url) patch.facebook_url = socials.facebook_url;
    if (socials.tiktok_url) patch.tiktok_url = socials.tiktok_url;
    if (socials.youtube_url) patch.youtube_url = socials.youtube_url;
    if (price) patch.price_level = price;
    if (lat !== null && lng !== null) {
      patch.lat = lat;
      patch.lng = lng;
      if (country_code) patch.country_code = country_code;
    }
    if (dossier.city) patch.city = dossier.city;
    if (dossier.country) patch.country = dossier.country;
    await db.from("restaurants").update(patch).eq("id", existing.id);
    return { created: false, attention: copy.needs_attention };
  }

  const slug = await uniqueRestaurantSlug(db, dossier.name || handle || "venue");
  await db.from("restaurants").insert({
    slug,
    name: dossier.name || handle || "Unnamed venue",
    description: copy.description ?? "",
    hook: copy.hook ?? null,
    style: style ?? "other",
    lat: lat ?? 0,
    lng: lng ?? 0,
    address: address || "",
    city: dossier.city || "",
    country: dossier.country || "",
    country_code,
    website: dossier.website,
    phone: dossier.phone,
    price_level: price ?? 2,
    hero_image_url: "",
    hero_source: "none",
    status: "pending",
    category: "restaurant",
    instagram_handle: handle,
    instagram_url: dossier.instagram,
    instagram_posts: igPosts.length ? igPosts : null,
    x_url: socials.x_url,
    facebook_url: socials.facebook_url,
    tiktok_url: socials.tiktok_url,
    youtube_url: socials.youtube_url,
    dossier,
    enriched_at: new Date().toISOString(),
    needs_attention: copy.needs_attention,
    attention_reason: copy.attention_reason,
    location_label: dossier.location_label,
  });
  return { created: true, attention: copy.needs_attention };
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!CLAUDE_ENABLED && !GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI is off — set ANTHROPIC_API_KEY (or XAI_API_KEY)." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const csv = typeof body.csv === "string" ? body.csv : "";
  const offset = Math.max(0, parseInt(String(body.offset ?? 0), 10) || 0);
  if (!csv.trim()) {
    return NextResponse.json({ error: "No CSV provided." }, { status: 400 });
  }

  const rows = parseFactsSheet(csv);
  const total = rows.length;
  const slice = rows.slice(offset, offset + BATCH);

  let created = 0;
  let updated = 0;
  let attention = 0;
  let errors = 0;
  for (const row of slice) {
    try {
      const r = await processRow(ctx.db, row);
      if (r.created) created += 1;
      else updated += 1;
      if (r.attention) attention += 1;
    } catch {
      errors += 1;
    }
  }

  const nextOffset = offset + slice.length;
  return NextResponse.json({
    total,
    nextOffset,
    done: nextOffset >= total,
    created,
    updated,
    attention,
    errors,
  });
}
