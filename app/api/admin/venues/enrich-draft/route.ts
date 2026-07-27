import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { CLAUDE_WRITER_MODEL } from "@/lib/ai/claude";
import {
  researchDossier,
  researchInstagram,
  writeVenueCopy,
  matchBbqStyle,
  priceBandToLevel,
  mapSocials,
  type VenueDossier,
  type VenueLead,
} from "@/lib/ai/enrich";
import { grokCost, claudeCost, round4 } from "@/lib/ai/cost";
import { geocodeAddress } from "@/lib/geo/geocode";
import { normalizeHandle } from "@/lib/admin/seed-import";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CEILING = 0.04;

/** Insert un-enriched sibling seeds for a chain — never auto-enriched (§09.2). */
async function seedChainSiblings(
  db: SupabaseClient,
  parentId: string,
  brand: string,
  country: string | null,
  dossier: VenueDossier
): Promise<number> {
  if (!dossier.is_chain || !dossier.chain_locations.length) return 0;
  const { data: existing } = await db
    .from("restaurants")
    .select("city, location_label")
    .eq("chain_parent_id", parentId);
  const seen = new Set(
    (existing ?? []).map((r) =>
      `${(r.location_label ?? "").toLowerCase()}|${(r.city ?? "").toLowerCase()}`
    )
  );
  let added = 0;
  for (const loc of dossier.chain_locations) {
    const label = loc.name || loc.city || "";
    const key = `${label.toLowerCase()}|${(loc.city ?? "").toLowerCase()}`;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    const slug = await uniqueRestaurantSlug(db, `${brand} ${loc.city ?? label}`);
    const { error } = await db.from("restaurants").insert({
      slug,
      name: brand,
      location_label: loc.name && loc.name !== brand ? loc.name : loc.city,
      description: `${brand} — barbecue${loc.city ? ` in ${loc.city}` : ""}.`,
      style: "other",
      lat: 0,
      lng: 0,
      address: "",
      city: loc.city || "",
      country: country || "",
      price_level: 2,
      hero_image_url: "",
      hero_source: "none",
      status: "pending",
      category: "restaurant",
      chain_parent_id: parentId,
    });
    if (!error) added += 1;
  }
  return added;
}

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
      "id, name, instagram_url, instagram_handle, website, address, city, country, lat, lng, x_url, facebook_url, tiktok_url, youtube_url, instagram_posts, status, enrichment_cost"
    )
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  const priorCost = Number(row.enrichment_cost ?? 0) || 0;

  const lead: VenueLead = {
    name: row.name ?? undefined,
    instagram:
      row.instagram_url ??
      (row.instagram_handle ? `https://www.instagram.com/${row.instagram_handle}/` : undefined),
    website: row.website ?? undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    country: row.country || undefined,
  };

  // ---- light mode: one lean, targeted IG search --------------------------
  if (mode === "light") {
    let find;
    let citations: string[];
    let usage;
    try {
      const r = await researchInstagram(lead);
      find = r.find;
      citations = r.citations;
      usage = r.usage;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "IG search failed." },
        { status: 502 }
      );
    }
    const cost = round4(grokCost(usage));
    const igHandle = find.instagram ? normalizeHandle(find.instagram) : null;
    const socials = mapSocials(find.other_socials);
    const patch: Record<string, unknown> = {
      enriched_at: new Date().toISOString(),
      enrichment_cost: round4(priorCost + cost),
      enrichment_cost_breakdown: {
        grok_searches: usage.searches,
        grok_in_tokens: usage.in_tokens,
        grok_out_tokens: usage.out_tokens,
        grok_cost: round4(grokCost(usage)),
        search_cost: round4(usage.searches * 0.005),
        action: "find_ig",
      },
      enrichment_model: GROK_MODEL,
    };
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
    return NextResponse.json({ ok: true, mode, name: row.name, posts: find.recent_instagram_posts.length, cost });
  }

  // ---- full mode: bounded dossier + Haiku copy ---------------------------
  let dossier: VenueDossier;
  let citations: string[];
  let grokUsage;
  try {
    const res = await researchDossier(lead);
    dossier = res.dossier;
    citations = res.citations;
    grokUsage = res.usage;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Research failed." }, { status: 502 });
  }

  let copy;
  try {
    copy = await writeVenueCopy(dossier);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copywriting failed." }, { status: 502 });
  }

  // Exact cost from usage.
  const gCost = grokCost(grokUsage);
  const cCost = claudeCost(copy.usage);
  const thisCost = round4(gCost + cCost);
  const overCeiling = thisCost > CEILING;

  const igHandle = dossier.instagram ? normalizeHandle(dossier.instagram) : null;
  const socials = mapSocials(dossier.other_socials);
  const sources = [...new Set([...dossier.sources, ...citations])];
  const igPosts = [
    ...(dossier.best_photo_post_url ? [dossier.best_photo_post_url] : []),
    ...dossier.recent_instagram_posts,
  ].filter((v, i, a) => a.indexOf(v) === i);
  const style = matchBbqStyle(dossier.bbq_style);
  const price = priceBandToLevel(dossier.price_band);
  const address = [dossier.address, dossier.postcode].filter((s) => s && String(s).trim()).join(", ");

  // Geocode.
  let city = dossier.city ?? row.city;
  let country = dossier.country ?? row.country;
  let lat: number | null = null;
  let lng: number | null = null;
  let country_code: string | null = null;
  if (dossier.lat !== null && dossier.lng !== null) {
    lat = dossier.lat;
    lng = dossier.lng;
  } else {
    const geo = await geocodeAddress({ address: dossier.address ?? row.address, city, country });
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      country_code = geo.country_code;
      city = geo.city ?? city;
      country = geo.country ?? country;
    }
  }

  // The full proposed change set (venue-facing fields).
  const proposed: Record<string, unknown> = {};
  if (dossier.name) proposed.name = dossier.name;
  if (dossier.location_label) proposed.location_label = dossier.location_label;
  proposed.hook = copy.hook;
  proposed.description = copy.description ?? "";
  if (style) proposed.style = style;
  if (address) proposed.address = address;
  if (dossier.phone) proposed.phone = dossier.phone;
  if (dossier.website) proposed.website = dossier.website;
  if (dossier.instagram) proposed.instagram_url = dossier.instagram;
  if (igHandle) proposed.instagram_handle = igHandle;
  if (igPosts.length) proposed.instagram_posts = igPosts;
  if (socials.x_url) proposed.x_url = socials.x_url;
  if (socials.facebook_url) proposed.facebook_url = socials.facebook_url;
  if (socials.tiktok_url) proposed.tiktok_url = socials.tiktok_url;
  if (socials.youtube_url) proposed.youtube_url = socials.youtube_url;
  if (dossier.hours) proposed.hours = dossier.hours;
  if (price) proposed.price_level = price;
  if (lat !== null && lng !== null) {
    proposed.lat = lat;
    proposed.lng = lng;
    if (country_code) proposed.country_code = country_code;
  }
  if (city) proposed.city = city;
  if (country) proposed.country = country;

  // Metadata always commits (cost, dossier, model). needs_attention flags the
  // draft copy or a cost overrun.
  const metadata: Record<string, unknown> = {
    enriched_at: new Date().toISOString(),
    dossier,
    enrichment_cost: round4(priorCost + thisCost),
    enrichment_cost_breakdown: {
      grok_searches: grokUsage.searches,
      grok_in_tokens: grokUsage.in_tokens,
      grok_out_tokens: grokUsage.out_tokens,
      claude_in_tokens: copy.usage.in_tokens,
      claude_out_tokens: copy.usage.out_tokens,
      grok_cost: round4(gCost),
      claude_cost: round4(cCost),
      search_cost: round4(grokUsage.searches * 0.005),
      action: "enrich",
    },
    enrichment_model: `${GROK_MODEL} + ${CLAUDE_WRITER_MODEL}`,
    enrichment_sources: sources.length ? sources : null,
  };
  const flagAttention = overCeiling || (row.status !== "approved" && copy.needs_attention);
  if (flagAttention) {
    metadata.needs_attention = true;
    metadata.attention_reason = overCeiling
      ? `Enrichment cost ${thisCost.toFixed(3)} exceeded the $${CEILING} ceiling.`
      : copy.attention_reason;
  }

  const patch =
    row.status === "approved"
      ? { ...metadata, pending_changes: proposed }
      : { ...metadata, ...proposed };

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const seeded = await seedChainSiblings(ctx.db, restaurantId, dossier.name ?? row.name, country, dossier);

  return NextResponse.json({
    ok: true,
    mode,
    name: dossier.name ?? row.name,
    needs_attention: copy.needs_attention,
    attention_reason: copy.attention_reason,
    pending: row.status === "approved",
    copy: { hook: copy.hook, description: copy.description },
    cost: thisCost,
    over_ceiling: overCeiling,
    chain_seeds: seeded,
  });
}
