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
import { canonicalCountry } from "@/lib/constants/countries";
import { revalidateVenues } from "@/lib/cache/venues";
import { normalizeHandle } from "@/lib/admin/seed-import";
import { desiredVenueSlug } from "@/lib/admin/slug";
import { composeAddress, preferFullerAddress, settlementCity } from "@/lib/admin/address";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CEILING = 0.04;
// Hard backstop on TOTAL web searches across ALL passes of one enrich (pass-1 +
// optional flagship pass-2 + the single retry-on-thin). The $-ceiling is the
// secondary guard; this bounds the search COUNT itself so a parse/extraction
// failure can never rack up a runaway tally.
const MAX_TOTAL_SEARCHES = 6;

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
  // Explicit operator override to let a re-enrich overwrite hand-edited copy.
  const overwriteManual = Boolean(body.overwriteManual);
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select(
      "id, slug, name, location_label, instagram_url, instagram_handle, website, address, city, country, lat, lng, x_url, facebook_url, tiktok_url, youtube_url, instagram_posts, status, enrichment_cost, chain_parent_id, chain_rostered_at, flagship_unset, manual_copy"
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
    // Persist the handle + URL the MOMENT one is found — regardless of post
    // count (Fix 2). A 0-post account is still a valid link-out; the photo embed
    // simply doesn't render (copyright-safe). If a handle is found but the row
    // has no URL yet, build the URL from the handle; if a URL is found but no
    // handle parsed, still save the URL so the IG ✓ lights up.
    if (find.instagram) {
      if (!row.instagram_url) patch.instagram_url = find.instagram;
      if (!row.instagram_handle && igHandle) patch.instagram_handle = igHandle;
    } else if (igHandle) {
      if (!row.instagram_handle) patch.instagram_handle = igHandle;
      if (!row.instagram_url) patch.instagram_url = `https://www.instagram.com/${igHandle}/`;
    }
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
    // Find IG writes socials/handle straight onto the live row — refresh the
    // public page so the new link-out logos actually show (they were saved but
    // the cached page kept the old render).
    if (row.status === "approved") revalidateVenues();
    // Report EXACTLY what happened so the hub never claims "Found Instagram"
    // when nothing was saved (the Moyo Shisanyama case). saved_ig is true only
    // when the row now carries a handle or URL.
    const savedHandle = (patch.instagram_handle as string) ?? row.instagram_handle ?? null;
    const savedUrl = (patch.instagram_url as string) ?? row.instagram_url ?? null;
    const savedIg = Boolean(savedHandle || savedUrl);
    return NextResponse.json({
      ok: true,
      mode,
      name: row.name,
      saved_ig: savedIg,
      handle: savedHandle,
      posts: find.recent_instagram_posts.length,
      cost,
    });
  }

  // Manual copy is sacred (Fix 3): if a human hand-edited this venue's copy, a
  // full re-enrich would overwrite their words. Stop BEFORE spending a cent and
  // ask the operator to confirm; they re-run with overwriteManual to proceed.
  if (mode === "full" && row.manual_copy && !overwriteManual) {
    return NextResponse.json({
      ok: true,
      mode,
      name: row.name,
      manual_copy_guard: true,
      message:
        "This venue has hand-edited copy. Re-enriching will overwrite it — confirm to overwrite, or edit it directly instead.",
    });
  }

  // ---- full mode: bounded dossier + Haiku copy ---------------------------
  // Research runs in at most a few bounded passes sharing ONE hard total-search
  // budget, so a parse/extraction failure can NEVER run to a runaway count. Every
  // pass FILL-EMPTY MERGES into the accumulated dossier — a later, thinner pass
  // may ADD missing facts but must NEVER clobber facts an earlier pass found (the
  // wholesale-replace clobber was the empty-but-expensive regression).
  let dossier: VenueDossier;
  let grokModel = GROK_MODEL;
  let grokInTokens = 0;
  let grokOutTokens = 0;
  let grokSearches = 0;
  let gCost = 0;
  const consulted = new Set<string>();
  const passLog: Array<Record<string, unknown>> = [];
  const recordPass = (
    label: string,
    res: {
      dossier: VenueDossier;
      citations: string[];
      usage: { in_tokens: number; out_tokens: number; searches: number };
      model: string;
    }
  ) => {
    grokModel = res.model ?? grokModel;
    grokInTokens += res.usage.in_tokens;
    grokOutTokens += res.usage.out_tokens;
    grokSearches += res.usage.searches;
    gCost += grokCost(res.usage, res.model ?? grokModel);
    for (const u of [...res.citations, ...res.dossier.sources]) if (u) consulted.add(u);
    // Raw per-pass diagnostics — exactly what THIS pass returned, so a "read the
    // pages but extracted nothing" result is inspectable vs what got stored.
    passLog.push({
      pass: label,
      searches: res.usage.searches,
      out_tokens: res.usage.out_tokens,
      model: res.model,
      dossier: res.dossier,
    });
  };

  try {
    const res = await researchDossier(lead);
    dossier = res.dossier;
    recordPass("pass1", res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Research failed." }, { status: 502 });
  }

  // Chain SIBLING inherits parent brand facts BEFORE writing copy — those belong
  // to the brand, not this outpost.
  if (row.chain_parent_id && parentDossier) {
    inheritBrandFacts(dossier, parentDossier);
  }

  // ── Step 1: chain DETECTION ONLY — never auto-crown ───────────────────────
  // Enrich is a plain, reliable single-venue pass. If the venue LOOKS like part
  // of a chain, we set a SOFT `chain_candidate` flag and surface a "build roster?"
  // affordance — but we create NO sibling rows, pick NO flagship, and change NO
  // hierarchy here. Building the roster (Step 2) and picking the flagship (Step 3)
  // are separate, explicit operator actions. A non-deterministic research call
  // must never make an authoritative structural decision.
  const isParent = !row.chain_parent_id;
  const alreadyRostered = Boolean(row.chain_rostered_at);
  // A CONFIRMED flagship = a parent the operator has picked (rostered, not unset).
  const isConfirmedFlagship = isParent && alreadyRostered && !Boolean(row.flagship_unset);
  // Looks chain-like but its roster hasn't been built yet → offer "Build roster".
  const chainCandidate = isParent && dossier.is_chain && !alreadyRostered;

  // NO retry-on-thin. The single-venue enrich makes EXACTLY ONE search-enabled
  // Grok call — that is the real, structural cap on our side (the number of
  // search-enabled calls is fixed at 1; there is no second pass to double the
  // count). If pass 1 came back thin, we hand what we have to the writer, which
  // runs in `alwaysWrite` mode and produces concise honest copy from the facts
  // present — a thin venue getting three tight sentences is the correct outcome,
  // not a trigger for more searching.

  // Who is this copy FOR? A sibling writes as a branch and may NEVER claim to be
  // the original. Only a CONFIRMED flagship (one the operator has picked) may
  // write "where it all began". Everything else — including a chain_candidate
  // that hasn't had a flagship picked — writes plain single-venue copy.
  // alwaysWrite: the writer is PROTECTED — it always produces house-voice copy
  // from the facts on hand, even if research came back thin. A single-venue
  // enrich must never return empty copy.
  const isSiblingRow = Boolean(row.chain_parent_id);
  const writeOpts: { branchOf?: string | null; isFlagship?: boolean; alwaysWrite: boolean } = {
    alwaysWrite: true,
  };
  if (isSiblingRow) {
    writeOpts.branchOf = dossier.name ?? row.name;
  } else if (isConfirmedFlagship) {
    writeOpts.isFlagship = true;
  }

  let copy;
  try {
    copy = await writeVenueCopy(dossier, writeOpts);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copywriting failed." }, { status: 502 });
  }
  const claudeModel = copy.model ?? CLAUDE_WRITER_MODEL;

  // Exact cost from real API usage (never an estimate). Single-venue ceiling.
  const cCost = claudeCost(copy.usage, claudeModel);
  const thisCost = round4(gCost + cCost);
  const overCeiling = thisCost > CEILING;

  const igHandle = dossier.instagram ? normalizeHandle(dossier.instagram) : null;
  const socials = mapSocials(dossier.other_socials);
  // Every URL consulted across all passes (pass-1, flagship pass-2, retry-on-thin)
  // — so a future thin result is diagnosable at a glance, not one lone stub URL.
  const sources = [...new Set([...consulted, ...dossier.sources])];
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

  // Geocode. `city` stays PRECISE for the geocoder query; we settlement-normalise
  // only the value we store (below). A coordinate is only "valid" if it's real —
  // a hallucinated (0,0) from the dossier is NOT and must fall through to a real
  // geocode instead of pinning the venue in the Atlantic.
  const validCoord = (a: number | null, b: number | null) =>
    typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
  let city = dossier.city ?? row.city;
  let country = dossier.country ?? row.country;
  let lat: number | null = null;
  let lng: number | null = null;
  let country_code: string | null = null;
  if (validCoord(dossier.lat, dossier.lng)) {
    lat = dossier.lat;
    lng = dossier.lng;
  } else {
    const geo = await geocodeAddress({ address: dossier.address ?? row.address, city, country });
    if (geo && validCoord(geo.lat, geo.lng)) {
      lat = geo.lat;
      lng = geo.lng;
      country_code = geo.country_code;
      city = geo.city ?? city;
      country = geo.country ?? country;
    }
  }
  // Fix B — did we END UP with a real location? A venue that neither geocoded now
  // nor already had a valid pin must be FLAGGED (never left silently at 0,0 while
  // looking enriched — the Red Dog Southampton "West Quay South" case).
  const noValidLocation = !validCoord(lat, lng) && !validCoord(row.lat as number, row.lng as number);

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
    // AI just (re)authored the copy — it's no longer a protected manual edit.
    // (For an approved venue this rides in pending_changes and applies on approve.)
    if (copy.hook || copy.description) proposed.manual_copy = false;
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
  // Store the SETTLEMENT, not the admin district ("City of Westminster" → London),
  // while the full precise address (incl. postcode) above is left untouched.
  const storedCity = city ? settlementCity(city) || city : city;
  if (storedCity) proposed.city = storedCity;
  // Canonical country name (one chip per country; stops the USA/United States,
  // Mexico/México split re-appearing as we enrich).
  if (country) proposed.country = canonicalCountry(country);

  // Slug regeneration (root-cause fix): when enrich corrects a venue's city/name,
  // its slug can go stale (a Dallas venue stuck at a "…-austin" URL). Regenerate
  // it — but ONLY for a not-yet-approved row (safe/low-traffic), and always leave
  // a 301 so no link breaks. An approved venue's live slug is left alone (the
  // operator can rename it deliberately via the admin edit).
  if (row.status !== "approved") {
    const finalName = (dossier.name as string) || row.name;
    const finalCity = (storedCity as string) || row.city || null;
    const newSlug = await desiredVenueSlug(ctx.db, restaurantId, finalName, finalCity, row.slug);
    if (row.slug && newSlug !== row.slug) {
      proposed.slug = newSlug;
      await ctx.db
        .from("slug_redirects")
        .upsert({ old_slug: row.slug, new_slug: newSlug }, { onConflict: "old_slug" });
    }
  }

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
      total_searches: grokSearches,
      passes: passLog.length,
      action: "enrich",
    },
    enrichment_model: `${grokModel} + ${claudeModel}`,
    enrichment_sources: sources.length ? sources : null,
    // Per-pass raw dossiers + usage, so a "read the pages but extracted nothing"
    // result is diagnosable (what each pass returned vs what got stored).
    enrichment_debug: { passes: passLog, total_searches: grokSearches },
    // Soft chain-candidate flag (Step 1). Cleared once the roster is built.
    chain_candidate: chainCandidate,
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
  // A chain SIBLING inherits brand facts from its parent, so its attention fires
  // only when THIS outpost's OWN location facts are missing (no address).
  const effectivelySibling = Boolean(row.chain_parent_id);
  const locationFactsMissing = !address;
  // If the search budget was blown (an API cap leak), stop trusting the result
  // and flag — never let a runaway pass through silently.
  const searchRunaway = grokSearches > MAX_TOTAL_SEARCHES;
  const attention =
    overCeiling ||
    searchRunaway ||
    noValidLocation ||
    (effectivelySibling ? locationFactsMissing : copy.needs_attention);
  metadata.needs_attention = attention;
  metadata.attention_reason = attention
    ? overCeiling
      ? `Enrichment cost ${thisCost.toFixed(3)} exceeded the $${CEILING} ceiling.`
      : searchRunaway
        ? `Search budget exceeded (${grokSearches} > ${MAX_TOTAL_SEARCHES}) — stopped and flagged; check enrichment_debug.`
        : noValidLocation
          ? address
            ? "Couldn't locate — check address / set pin manually"
            : effectivelySibling
              ? "This outpost's own location facts (address) are missing — add them, then re-enrich."
              : "No address to place this venue on the map — add one, then re-enrich."
          : effectivelySibling
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
    sources_count: sources.length,
    // Step 1 detection ONLY: a soft "looks like a chain — build roster?" flag.
    // No siblings created, no flagship picked. Building the roster is the operator's
    // next explicit action.
    chain_candidate: chainCandidate,
    chain_candidate_message: chainCandidate
      ? `${dossier.name ?? row.name} looks like a multi-location chain — “Build roster” to add its other locations (nothing is crowned until you pick the flagship).`
      : null,
  });
}
