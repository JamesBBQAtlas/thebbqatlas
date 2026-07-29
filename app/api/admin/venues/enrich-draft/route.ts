import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { CLAUDE_WRITER_MODEL } from "@/lib/ai/claude";
import {
  researchDossier,
  researchInstagram,
  writeVenueCopy,
  inheritBrandFacts,
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
  let parentDossier: VenueDossier | null = null;
  let branchNote: string | undefined;
  if (row.chain_parent_id) {
    const { data: parent } = await ctx.db
      .from("restaurants")
      .select("website, dossier")
      .eq("id", row.chain_parent_id)
      .single();
    parentWebsite = parent?.website ?? null;
    parentDossier = (parent?.dossier as VenueDossier | null) ?? null;
    const label = row.location_label || row.city || "this";
    // The sibling inherits the parent's brand-level facts (below), so its
    // research only chases THIS branch's own location facts — never the brand
    // identity it could never verify per-outpost.
    branchNote =
      `This is the ${label} location of ${row.name}, a known multi-location barbecue chain. ` +
      `The brand's history, pitmaster, style and specialities are already known — do NOT research them. ` +
      `Find ONLY THIS specific branch's own facts: its street address, opening hours, phone, opening date, ` +
      `and anything unique to this ${label} location` +
      (parentWebsite ? ` — start from ${parentWebsite} and its Locations/Find-us page.` : ".") +
      ` It is definitely a chain; do not spend searches re-confirming that.`;
  } else if (row.chain_rostered_at) {
    // Two-pass model (pass 2): the chain is already rostered, so spend the whole
    // budget on THIS flagship's own facts instead of re-discovering the chain.
    branchNote =
      `${row.name} is a known multi-location barbecue chain whose locations are ALREADY catalogued. ` +
      `Do NOT research, list, or spend any searches on its other locations. ` +
      `Spend the entire budget on THIS flagship venue's own facts: opening hours, founders/pitmaster, ` +
      `established date, specialities, cook method, wood/fuel, setting/vibe, website, and Instagram.`;
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
  let grokModel = GROK_MODEL;
  // Research usage accumulates across passes (a chain flagship runs two).
  let grokInTokens = 0;
  let grokOutTokens = 0;
  let grokSearches = 0;
  let gCost = 0;
  try {
    const res = await researchDossier(lead);
    dossier = res.dossier;
    citations = res.citations;
    grokModel = res.model ?? GROK_MODEL;
    grokInTokens += res.usage.in_tokens;
    grokOutTokens += res.usage.out_tokens;
    grokSearches += res.usage.searches;
    gCost += grokCost(res.usage, grokModel);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Research failed." }, { status: 502 });
  }

  // Chain SIBLING: seed the dossier with the parent's verified brand-level facts
  // (history, pitmaster, style, cook method, wood/fuel, specialities, character)
  // BEFORE writing copy — those belong to the brand, not this outpost, so the
  // writer composes from the shared identity + this location's own specifics
  // instead of refusing on absent brand facts it correctly won't invent.
  if (row.chain_parent_id && parentDossier) {
    inheritBrandFacts(dossier, parentDossier);
  }

  // ── Chain flagship: DETERMINISTIC detect → seed → roster-stamp → pass-2 ───
  // When pass-1 reveals a PARENT to be a chain, we ALWAYS, in THIS one request:
  //   (a) seed its sibling locations,
  //   (b) stamp chain_rostered_at immediately (never leave siblings created but
  //       the flag unset — the intermittent-regression root cause), and
  //   (c) run pass-2, a focused fact-enrich of the flagship's OWN facts, so it
  //       reliably ends RICH instead of stuck in the thin pass-1 state.
  // No client round-trip and no manual gateway click — that fragile handoff is
  // what dropped pass-2 last run.
  const isParent = !row.chain_parent_id;
  const detectedChain = isParent && dossier.is_chain;
  const alreadyRostered = Boolean(row.chain_rostered_at);
  let seeded: Awaited<ReturnType<typeof seedChainLocations>> | null = null;
  let rosteredNow = false;
  let twoPass = false;
  if (detectedChain && !alreadyRostered) {
    seeded = await seedChainLocations(
      ctx.db,
      restaurantId,
      dossier.name ?? row.name,
      dossier.country ?? row.country ?? null,
      dossier.chain_locations
    );
    // Stamp the roster flag NOW — its own step, right after seeding — so siblings
    // are never left created-but-unflagged even if pass-2 throws below.
    await ctx.db
      .from("restaurants")
      .update({ chain_rostered_at: new Date().toISOString() })
      .eq("id", restaurantId);
    rosteredNow = true;

    // Pass 2: the chain is catalogued now, so spend the whole budget on THIS
    // flagship's own facts rather than re-discovering the chain.
    const flagshipLead: VenueLead = {
      ...lead,
      notes:
        `${dossier.name ?? row.name} is a known multi-location barbecue chain whose locations are ALREADY catalogued. ` +
        `Do NOT research, list, or spend any searches on its other locations. ` +
        `Spend the entire budget on THIS flagship venue's own facts: opening hours, founders/pitmaster, ` +
        `established date, specialities, cook method, wood/fuel, setting/vibe, website, and Instagram.`,
    };
    try {
      const res2 = await researchDossier(flagshipLead);
      // Keep pass-1's chain roster fields (pass-2 was told to ignore them and may
      // return them empty).
      dossier = {
        ...res2.dossier,
        is_chain: true,
        chain_locations: dossier.chain_locations,
        chain_locations_url: dossier.chain_locations_url ?? res2.dossier.chain_locations_url,
      };
      grokModel = res2.model ?? grokModel;
      grokInTokens += res2.usage.in_tokens;
      grokOutTokens += res2.usage.out_tokens;
      grokSearches += res2.usage.searches;
      gCost += grokCost(res2.usage, res2.model ?? grokModel);
      twoPass = true;
    } catch {
      // Pass-2 failed — do NOT silently commit the thin pass-1 copy. The flag is
      // already stamped and the siblings seeded, so re-running Enrich on the
      // flagship takes the already-rostered path (a single focused facts pass).
      return NextResponse.json(
        {
          error:
            "Chain detected and its locations were seeded, but the flagship's facts pass failed. Re-run Enrich on the flagship to finish it.",
          retry_pass2: true,
          is_chain: true,
          is_chain_parent: true,
          chain_seeds: seeded?.added ?? [],
        },
        { status: 502 }
      );
    }
  }

  let copy;
  try {
    copy = await writeVenueCopy(
      dossier,
      row.chain_parent_id
        ? { branchOf: dossier.name ?? row.name }
        : detectedChain || alreadyRostered
          ? { isFlagship: true }
          : undefined
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copywriting failed." }, { status: 502 });
  }
  const claudeModel = copy.model ?? CLAUDE_WRITER_MODEL;

  // Exact cost from usage across all passes. A two-pass flagship legitimately
  // spends ~2×, so its ceiling is doubled — don't false-flag the accepted model.
  const cCost = claudeCost(copy.usage, claudeModel);
  const thisCost = round4(gCost + cCost);
  const runCeiling = twoPass ? CEILING * 2 : CEILING;
  const overCeiling = thisCost > runCeiling;

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
      grok_searches: grokSearches,
      grok_in_tokens: grokInTokens,
      grok_out_tokens: grokOutTokens,
      claude_in_tokens: copy.usage.in_tokens,
      claude_out_tokens: copy.usage.out_tokens,
      grok_cost: round4(gCost),
      claude_cost: round4(cCost),
      search_cost: round4(grokSearches * 0.005),
      action: twoPass ? "enrich (2-pass)" : "enrich",
    },
    enrichment_model: `${grokModel} + ${claudeModel}`,
    enrichment_sources: sources.length ? sources : null,
  };
  // Flag attention for ANY venue (draft OR approved) when the cost overran or
  // the dossier was too thin — and always CLEAR the flag on a clean run so a
  // successful re-enrich un-flags a previously-flagged venue.
  //
  // A chain SIBLING inherits its brand-level facts from the parent, so its
  // "needs attention" must fire ONLY when THIS outpost's own location facts are
  // missing (no address) — NEVER because brand-level facts are absent (they're
  // inherited). The refuse-to-invent guardrail is untouched: the writer still
  // won't fabricate, we've simply supplied it real brand facts to work from.
  const isSibling = Boolean(row.chain_parent_id);
  const locationFactsMissing = !address;
  const attention = overCeiling || (isSibling ? locationFactsMissing : copy.needs_attention);
  metadata.needs_attention = attention;
  metadata.attention_reason = attention
    ? overCeiling
      ? `Enrichment cost ${thisCost.toFixed(3)} exceeded the $${runCeiling} ceiling.`
      : isSibling
        ? "This outpost's own location facts (address/hours) are missing — add them, then re-enrich."
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
    two_pass: twoPass,
    // Chain signalling — parent only. Siblings report is_chain:false so the UI
    // never re-opens the roster gateway for them (the loop fix). The flagship's
    // pass-2 already ran server-side, so the gateway is now optional (find any
    // extra branches beyond what pass-1 saw), not required for a rich flagship.
    is_chain: detectedChain,
    is_chain_parent: isParent,
    // Pre-request value: still surfaces the (now optional) roster gateway once.
    chain_already_rostered: alreadyRostered,
    rostered_now: rosteredNow,
    brand: detectedChain ? dossier.name ?? row.name : null,
    chain_locations_url: detectedChain ? dossier.chain_locations_url : null,
    // Honest counts from the seed pass (the full-roster gateway can find more).
    chain_seed_result: seeded,
    chain_seeds: seeded ? seeded.added : [],
  });
}
