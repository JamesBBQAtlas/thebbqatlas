import { NextResponse } from "next/server";
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
import { seedChainLocations } from "@/lib/admin/chain-seed";
import { composeAddress, preferFullerAddress } from "@/lib/admin/address";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CEILING = 0.04;

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
      "id, name, location_label, instagram_url, instagram_handle, website, address, city, country, lat, lng, x_url, facebook_url, tiktok_url, youtube_url, instagram_posts, status, enrichment_cost, chain_parent_id, chain_rostered_at"
    )
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  const priorCost = Number(row.enrichment_cost ?? 0) || 0;

  // For a chain SIBLING with sparse facts, borrow the parent's website and tell
  // Grok exactly which branch to research — otherwise it burns its (bounded)
  // search budget re-discovering that the brand is a chain instead of finding
  // this location's address/hours/phone (the Joe's-Olathe thin-dossier case).
  let parentWebsite: string | null = null;
  let branchNote: string | undefined;
  if (row.chain_parent_id) {
    const { data: parent } = await ctx.db
      .from("restaurants")
      .select("website")
      .eq("id", row.chain_parent_id)
      .single();
    parentWebsite = parent?.website ?? null;
    const label = row.location_label || row.city || "this";
    branchNote =
      `This is the ${label} location of ${row.name}, a known multi-location barbecue chain. ` +
      `Find THIS specific branch's street address, opening hours, and phone` +
      (parentWebsite ? ` — start from ${parentWebsite} and its Locations/Find-us page.` : ".") +
      ` It is definitely a chain; do not spend searches re-confirming that.`;
  }

  const lead: VenueLead = {
    name: row.name ?? undefined,
    instagram:
      row.instagram_url ??
      (row.instagram_handle ? `https://www.instagram.com/${row.instagram_handle}/` : undefined),
    website: row.website ?? parentWebsite ?? undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    country: row.country || undefined,
    notes: branchNote,
  };

  // ---- light mode: one lean, targeted IG search --------------------------
  if (mode === "light") {
    let find;
    let citations: string[];
    let usage;
    let grokModel = GROK_MODEL;
    try {
      const r = await researchInstagram(lead);
      find = r.find;
      citations = r.citations;
      usage = r.usage;
      grokModel = r.model ?? GROK_MODEL;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "IG search failed." },
        { status: 502 }
      );
    }
    const cost = round4(grokCost(usage, grokModel));
    const igHandle = find.instagram ? normalizeHandle(find.instagram) : null;
    const socials = mapSocials(find.other_socials);
    const patch: Record<string, unknown> = {
      enriched_at: new Date().toISOString(),
      enrichment_cost: round4(priorCost + cost),
      enrichment_cost_breakdown: {
        grok_searches: usage.searches,
        grok_in_tokens: usage.in_tokens,
        grok_out_tokens: usage.out_tokens,
        grok_cost: round4(grokCost(usage, grokModel)),
        search_cost: round4(usage.searches * 0.005),
        action: "find_ig",
      },
      enrichment_model: grokModel,
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
  let grokModel = GROK_MODEL;
  try {
    const res = await researchDossier(lead);
    dossier = res.dossier;
    citations = res.citations;
    grokUsage = res.usage;
    grokModel = res.model ?? GROK_MODEL;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Research failed." }, { status: 502 });
  }

  let copy;
  try {
    copy = await writeVenueCopy(dossier);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copywriting failed." }, { status: 502 });
  }
  const claudeModel = copy.model ?? CLAUDE_WRITER_MODEL;

  // Exact cost from usage, priced off the models the APIs actually returned.
  const gCost = grokCost(grokUsage, grokModel);
  const cCost = claudeCost(copy.usage, claudeModel);
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
  // Full address — street, city, region/state, postcode (§09.2.6). Never
  // downgrade an existing fuller address to a thinner one.
  const composed = composeAddress({
    street: dossier.address,
    city: dossier.city,
    region: dossier.region_state,
    postcode: dossier.postcode,
  });
  const address = preferFullerAddress(composed, row.address);

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

  // Was the dossier too thin to write honest copy? If so we must NOT blank the
  // venue's copy with an empty draft — we keep whatever's there and flag why.
  const thin = copy.needs_attention && !copy.hook && !copy.description;

  // The full proposed change set (venue-facing fields).
  const proposed: Record<string, unknown> = {};
  if (dossier.name) proposed.name = dossier.name;
  if (dossier.location_label) proposed.location_label = dossier.location_label;
  // Only propose copy when we actually wrote some — never overwrite existing
  // copy (or create a blank "pending change") when the dossier was too thin.
  if (!thin) {
    if (copy.hook) proposed.hook = copy.hook;
    if (copy.description) proposed.description = copy.description;
  }
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
    enrichment_model: `${grokModel} + ${claudeModel}`,
    enrichment_sources: sources.length ? sources : null,
  };
  // Flag attention for ANY venue (draft OR approved) when the cost overran or
  // the dossier was too thin — and always CLEAR the flag on a clean run so a
  // successful re-enrich un-flags a previously-flagged venue.
  const attention = overCeiling || copy.needs_attention;
  metadata.needs_attention = attention;
  metadata.attention_reason = attention
    ? overCeiling
      ? `Enrichment cost ${thisCost.toFixed(3)} exceeded the $${CEILING} ceiling.`
      : copy.attention_reason ?? "Dossier too thin to write an honest page — needs more research or manual facts."
    : null;

  // For an approved (live) venue, hold changes as pending — but only if there's
  // actually something worth approving. A too-thin result that changes nothing
  // real should NOT create an empty "pending changes" (the confusing state).
  const rowKnown = row as unknown as Record<string, unknown>;
  const differsFromRow = (key: string, val: unknown) =>
    !(key in rowKnown) || String(rowKnown[key] ?? "") !== String(val ?? "");
  const meaningful =
    "hook" in proposed ||
    "description" in proposed ||
    Object.entries(proposed).some(([k, v]) => differsFromRow(k, v));

  const patch =
    row.status === "approved"
      ? meaningful
        ? { ...metadata, pending_changes: proposed }
        : metadata
      : { ...metadata, ...proposed };

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Chain handling is PARENT-ONLY (§09.2.1). A sibling (row already carries a
  // chain_parent_id) never runs chain detection, never seeds, never signals a
  // chain back to the UI — it only writes its own venue's dossier/copy/cost.
  const isParent = !row.chain_parent_id;
  const isChain = isParent && dossier.is_chain;
  const alreadyRostered = Boolean(row.chain_rostered_at);
  const seeded =
    isChain && !alreadyRostered
      ? await seedChainLocations(
          ctx.db,
          restaurantId,
          dossier.name ?? row.name,
          country,
          dossier.chain_locations
        )
      : null;

  return NextResponse.json({
    ok: true,
    mode,
    name: dossier.name ?? row.name,
    needs_attention: attention,
    attention_reason: metadata.attention_reason,
    thin, // dossier too thin → no copy written
    has_copy: Boolean(copy.hook || copy.description),
    // Did an approved venue actually get proposed changes to review?
    has_pending: row.status === "approved" && meaningful,
    pending: row.status === "approved" && meaningful,
    copy: { hook: copy.hook, description: copy.description },
    cost: thisCost,
    over_ceiling: overCeiling,
    // Chain signalling — parent only. Siblings report is_chain:false so the UI
    // never re-opens the roster gateway for them (the loop fix).
    is_chain: isChain,
    is_chain_parent: isParent,
    chain_already_rostered: alreadyRostered,
    brand: isChain ? dossier.name ?? row.name : null,
    chain_locations_url: isChain ? dossier.chain_locations_url : null,
    // Honest counts from the quick-seed pass (roster gateway does the full one).
    chain_seed_result: seeded,
    chain_seeds: seeded ? seeded.added : [],
  });
}
