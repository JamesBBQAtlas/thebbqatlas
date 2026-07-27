import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import {
  researchDossier,
  researchInstagram,
  writeVenueCopy,
  buildCopyPatch,
  matchBbqStyle,
  priceBandToLevel,
  mapSocials,
  type VenueLead,
} from "@/lib/ai/enrich";
import { geocodeAddress } from "@/lib/geo/geocode";
import { normalizeHandle } from "@/lib/admin/seed-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Enrich ONE venue (VENUE-SYSTEM-SPEC §6, cost-capped). All AI calls are bounded
 * (grok-4-fast, 3 search results, no agentic sprawl; Haiku writer, capped output)
 * to hold well under the $0.04/venue ceiling.
 *
 * mode="full"  (default): bounded Grok dossier (persisted) → Haiku house-voice
 *   copy → geocode. Copy is pending_copy for a live venue, direct for a draft.
 * mode="light" (Find IG):  ONE lean, targeted IG search — backfills handle/url +
 *   recent posts + socials only, no full dossier, no copy, no hero.
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
      "id, name, instagram_url, instagram_handle, website, address, city, country, lat, lng, x_url, facebook_url, tiktok_url, youtube_url, instagram_posts, status"
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

  // ---- light mode: one lean, targeted IG search --------------------------
  if (mode === "light") {
    let find;
    let citations: string[];
    try {
      const r = await researchInstagram(lead);
      find = r.find;
      citations = r.citations;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "IG search failed." },
        { status: 502 }
      );
    }
    const igHandle = find.instagram ? normalizeHandle(find.instagram) : null;
    const socials = mapSocials(find.other_socials);
    const patch: Record<string, unknown> = { enriched_at: new Date().toISOString() };
    if (!row.instagram_url && find.instagram) patch.instagram_url = find.instagram;
    if (!row.instagram_handle && igHandle) patch.instagram_handle = igHandle;
    if (find.recent_instagram_posts.length) {
      const existing = Array.isArray(row.instagram_posts) ? row.instagram_posts : [];
      patch.instagram_posts = existing.length ? existing : find.recent_instagram_posts;
    }
    if (!row.x_url && socials.x_url) patch.x_url = socials.x_url;
    if (!row.facebook_url && socials.facebook_url) patch.facebook_url = socials.facebook_url;
    if (!row.tiktok_url && socials.tiktok_url) patch.tiktok_url = socials.tiktok_url;
    if (!row.youtube_url && socials.youtube_url) patch.youtube_url = socials.youtube_url;
    if (citations.length) patch.enrichment_sources = citations;
    if (row.lat === 0 && row.lng === 0) {
      const geo = await geocodeAddress({ address: row.address, city: row.city, country: row.country });
      if (geo) {
        patch.lat = geo.lat;
        patch.lng = geo.lng;
        if (geo.country_code) patch.country_code = geo.country_code;
      }
    }
    const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      mode,
      name: row.name,
      instagram: patch.instagram_url ?? row.instagram_url ?? null,
      posts: find.recent_instagram_posts.length,
    });
  }

  // ---- full mode: bounded dossier + Haiku copy ---------------------------
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

  let copy;
  try {
    copy = await writeVenueCopy(dossier);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copywriting failed." },
      { status: 502 }
    );
  }

  const igHandle = dossier.instagram ? normalizeHandle(dossier.instagram) : null;
  const socials = mapSocials(dossier.other_socials);
  const sources = [...new Set([...dossier.sources, ...citations])];
  const igPosts = [
    ...(dossier.best_photo_post_url ? [dossier.best_photo_post_url] : []),
    ...dossier.recent_instagram_posts,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const patch: Record<string, unknown> = {
    enriched_at: new Date().toISOString(),
    dossier,
  };
  Object.assign(patch, buildCopyPatch(row.status, copy));

  if (dossier.name) patch.name = dossier.name;
  if (dossier.location_label) patch.location_label = dossier.location_label;
  const style = matchBbqStyle(dossier.bbq_style);
  if (style) patch.style = style;
  const address = [dossier.address, dossier.postcode]
    .filter((s) => s && String(s).trim())
    .join(", ");
  if (address) patch.address = address;
  if (dossier.phone) patch.phone = dossier.phone;
  if (dossier.website) patch.website = dossier.website;
  if (dossier.instagram) patch.instagram_url = dossier.instagram;
  if (!row.instagram_handle && igHandle) patch.instagram_handle = igHandle;
  if (igPosts.length) patch.instagram_posts = igPosts;
  if (socials.x_url) patch.x_url = socials.x_url;
  if (socials.facebook_url) patch.facebook_url = socials.facebook_url;
  if (socials.tiktok_url) patch.tiktok_url = socials.tiktok_url;
  if (socials.youtube_url) patch.youtube_url = socials.youtube_url;
  if (dossier.hours) patch.hours = dossier.hours;
  const price = priceBandToLevel(dossier.price_band);
  if (price) patch.price_level = price;
  if (sources.length) patch.enrichment_sources = sources;

  let city = dossier.city ?? row.city;
  let country = dossier.country ?? row.country;
  if (dossier.lat !== null && dossier.lng !== null) {
    patch.lat = dossier.lat;
    patch.lng = dossier.lng;
  } else {
    const geo = await geocodeAddress({ address: dossier.address ?? row.address, city, country });
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

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    mode,
    name: (patch.name as string) ?? row.name,
    needs_attention: copy.needs_attention,
    attention_reason: copy.attention_reason,
    pending_copy: row.status === "approved",
    copy: { hook: copy.hook, description: copy.description },
    geocoded: patch.lat !== undefined,
  });
}
