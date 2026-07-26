import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import {
  researchDossier,
  writeVenueCopy,
  priceBandToLevel,
  mapSocials,
  type VenueLead,
} from "@/lib/ai/enrich";
import { geocodeAddress } from "@/lib/geo/geocode";
import { normalizeHandle } from "@/lib/admin/seed-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Enrich ONE venue (enrichment v3). Grok researches a strict facts-only dossier;
 * Claude writes the house-voice copy; we geocode and write the record back —
 * status stays 'pending' so nothing publishes without a human Publish.
 *
 * mode="full"  (default): full research + house-voice copy. For seed drafts.
 * mode="light" (Phase B): gap-fill only — backfill a missing Instagram handle,
 *   hero post and socials on an already-live venue WITHOUT touching its curated
 *   name / description / style / status. Skips the Claude copy leg.
 *
 * A dossier too thin to write honestly sets needs_attention instead of a padded
 * page.
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
  const mode: "full" | "light" = body.mode === "light" ? "light" : "full";
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select(
      "id, name, instagram_url, instagram_handle, hero_post_url, website, address, city, country, lat, lng, x_url, facebook_url, tiktok_url, youtube_url, status"
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

  let dossier;
  let citations: string[];
  try {
    const res = await researchDossier(lead);
    dossier = res.dossier;
    citations = res.citations;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed." },
      { status: 502 }
    );
  }

  const igHandle = dossier.instagram ? normalizeHandle(dossier.instagram) : null;
  const heroPost = dossier.best_photo_post_url;
  const socials = mapSocials(dossier.other_socials);
  const patch: Record<string, unknown> = { enriched_at: new Date().toISOString() };

  if (mode === "light") {
    // Gap-fill only — never overwrite curated fields on a live venue.
    if (!row.instagram_url && dossier.instagram) patch.instagram_url = dossier.instagram;
    if (!row.instagram_handle && igHandle) patch.instagram_handle = igHandle;
    if (!row.hero_post_url && heroPost) patch.hero_post_url = heroPost;
    if (!row.x_url && socials.x_url) patch.x_url = socials.x_url;
    if (!row.facebook_url && socials.facebook_url) patch.facebook_url = socials.facebook_url;
    if (!row.tiktok_url && socials.tiktok_url) patch.tiktok_url = socials.tiktok_url;
    if (!row.youtube_url && socials.youtube_url) patch.youtube_url = socials.youtube_url;
    if (dossier.sources.length || citations.length)
      patch.enrichment_sources = [...new Set([...dossier.sources, ...citations])];
    // Geocode only if it isn't on the map yet.
    if (row.lat === 0 && row.lng === 0) {
      const geo = await geocodeAddress({
        address: dossier.address ?? row.address,
        city: dossier.city ?? row.city,
        country: dossier.country ?? row.country,
      });
      if (geo) {
        patch.lat = geo.lat;
        patch.lng = geo.lng;
        if (geo.country_code) patch.country_code = geo.country_code;
      }
    }

    const { error: updErr } = await ctx.db
      .from("restaurants")
      .update(patch)
      .eq("id", restaurantId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      mode,
      name: row.name,
      instagram: patch.instagram_url ?? row.instagram_url ?? null,
      hero_post_url: patch.hero_post_url ?? row.hero_post_url ?? null,
    });
  }

  // ---- full mode: research + house-voice copy -----------------------------
  let copy;
  try {
    copy = await writeVenueCopy(dossier);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copywriting failed." },
      { status: 502 }
    );
  }

  if (dossier.name) patch.name = dossier.name;
  const composed = [copy.hook, copy.description].filter(Boolean).join("\n\n");
  if (composed) patch.description = composed;
  if (copy.style) patch.style = copy.style;

  const address = [dossier.address, dossier.postcode]
    .filter((s) => s && String(s).trim())
    .join(", ");
  if (address) patch.address = address;
  if (dossier.phone) patch.phone = dossier.phone;
  if (dossier.website) patch.website = dossier.website;
  if (dossier.instagram) patch.instagram_url = dossier.instagram;
  if (!row.instagram_handle && igHandle) patch.instagram_handle = igHandle;
  if (socials.x_url) patch.x_url = socials.x_url;
  if (socials.facebook_url) patch.facebook_url = socials.facebook_url;
  if (socials.tiktok_url) patch.tiktok_url = socials.tiktok_url;
  if (socials.youtube_url) patch.youtube_url = socials.youtube_url;
  if (dossier.hours) patch.hours = dossier.hours;
  const price = priceBandToLevel(dossier.price_band);
  if (price) patch.price_level = price;
  if (heroPost) patch.hero_post_url = heroPost;
  if (dossier.sources.length || citations.length)
    patch.enrichment_sources = [...new Set([...dossier.sources, ...citations])];

  patch.needs_attention = copy.needs_attention;
  patch.attention_reason = copy.attention_reason;

  // Geocode (dossier coords first, else address lookup) so it lands on the map.
  let city = dossier.city ?? row.city;
  let country = dossier.country ?? row.country;
  if (dossier.lat !== null && dossier.lng !== null) {
    patch.lat = dossier.lat;
    patch.lng = dossier.lng;
  } else {
    const geo = await geocodeAddress({
      address: dossier.address ?? row.address,
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
  }
  if (city) patch.city = city;
  if (country) patch.country = country;

  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    mode,
    name: (patch.name as string) ?? row.name,
    needs_attention: copy.needs_attention,
    attention_reason: copy.attention_reason,
    geocoded: patch.lat !== undefined,
    confidence: dossier.unknowns.length,
  });
}
