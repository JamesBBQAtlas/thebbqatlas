import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { CLAUDE_WRITER_MODEL } from "@/lib/ai/claude";
import {
  researchDossier,
  researchInstagram,
  writeVenueCopy,
  inheritBrandFacts,
  missingCoreAnchors,
  mergeDossierFacts,
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
import { ensureFlagshipParent, recordIsFlagship } from "@/lib/admin/flagship";
import { composeAddress, preferFullerAddress } from "@/lib/admin/address";

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
  const searchesLeft = () => Math.max(0, MAX_TOTAL_SEARCHES - grokSearches);
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

  // ── Chain: the TRUE flagship is the parent, not enrichment order ───────────
  // A parent record (chain_parent_id null) that pass-1 reveals to be a chain gets
  // its hierarchy set by the ORIGINAL location (read from the About/origin page),
  // NOT by which location we happened to enrich first. If we started from a
  // BRANCH, the real flagship becomes the parent and this branch its sibling.
  // Seeding + the roster stamp always happen, so the flag is never left unset.
  const isParent = !row.chain_parent_id;
  const detectedChain = isParent && dossier.is_chain;
  const alreadyRostered = Boolean(row.chain_rostered_at);
  let seeded: Awaited<ReturnType<typeof seedChainLocations>> | null = null;
  let rosteredNow = false;
  let twoPass = false;
  let reassignedToFlagship = false;
  let recordFlagshipConfirmed = false;
  let flagshipUnknown = false;
  let flagshipParentId: string | null = null;
  if (detectedChain && !alreadyRostered) {
    const brand = dossier.name ?? row.name;
    const country = dossier.country ?? row.country ?? null;

    // We need the brand facts AND the flagship identity before deciding the
    // hierarchy. If pass-1 was thin OR didn't name the original, do the focused
    // About-page pass now (budget permitting) and MERGE fill-empty (never clobber).
    if ((missingCoreAnchors(dossier) || !dossier.flagship_location) && searchesLeft() > 0) {
      const aboutLead: VenueLead = {
        ...lead,
        notes:
          `${brand} is a multi-location barbecue chain. Read the brand's ABOUT / OUR STORY / HISTORY / origin page (and homepage) for: ` +
          `the founding/established date, founders/pitmaster, cook method, wood/fuel and signature specialities, ` +
          `AND which location is the ORIGINAL / first / flagship (its city and street address). ` +
          `Do NOT spend searches on the other branches' pages.`,
      };
      try {
        const res2 = await researchDossier(aboutLead, { maxSearches: searchesLeft() });
        dossier = mergeDossierFacts(dossier, res2.dossier);
        recordPass("chain_about", res2);
        twoPass = true;
      } catch {
        return NextResponse.json(
          {
            error: "Chain detected, but the brand/flagship facts pass failed. Re-run Enrich to finish it.",
            retry_pass2: true,
            is_chain: true,
            is_chain_parent: true,
          },
          { status: 502 }
        );
      }
    }

    const fl = dossier.flagship_location;
    recordFlagshipConfirmed = recordIsFlagship(
      { city: dossier.city ?? row.city, address: dossier.address ?? row.address, location_label: row.location_label },
      fl
    );

    if (fl && !recordFlagshipConfirmed) {
      // ── BRANCH-FIRST DISCOVERY (bounded) ──────────────────────────────────
      // We started from a branch. We've already read the About/origin page and
      // gathered the brand facts (≤6 searches). Now: create/populate the true
      // flagship as the parent, seed the roster under it, and DEMOTE this branch
      // to a clean sibling — then STOP. We do NOT also write this branch's own
      // copy in the same call (that's done cheaply later when it's enriched as a
      // sibling). This keeps the branch-first path inside the search budget and
      // guarantees the flagship is never left an empty seed.
      try {
        const fr = await ensureFlagshipParent(ctx.db, {
          branchId: restaurantId,
          brand,
          country,
          flagship: fl,
          brandDossier: dossier,
        });
        // Seed the rest of the roster UNDER THE FLAGSHIP (dedupes vs the branch +
        // any siblings; skips the flagship's own venue).
        seeded = await seedChainLocations(ctx.db, fr.flagshipId, brand, country, dossier.chain_locations);
        await ctx.db
          .from("restaurants")
          .update({ chain_rostered_at: new Date().toISOString() })
          .eq("id", fr.flagshipId);

        // Write the flagship's BRAND-level copy (Claude only — NO web search) so
        // its page carries website + story, not an empty seed. Its OWN location
        // specifics (hours, exact address) come when it's enriched later.
        let fCopy: Awaited<ReturnType<typeof writeVenueCopy>> | null = null;
        try {
          fCopy = await writeVenueCopy(fr.flagshipDossier, { isFlagship: true });
        } catch {
          fCopy = null;
        }
        const fCopyCost = fCopy ? round4(claudeCost(fCopy.usage, fCopy.model ?? CLAUDE_WRITER_MODEL)) : 0;
        const fStyle = matchBbqStyle(fr.flagshipDossier.bbq_style);
        const fPrice = priceBandToLevel(fr.flagshipDossier.price_band);
        const fIgHandle = fr.flagshipDossier.instagram ? normalizeHandle(fr.flagshipDossier.instagram) : null;
        const fSocials = mapSocials(fr.flagshipDossier.other_socials);
        const flagPatch: Record<string, unknown> = {
          enriched_at: new Date().toISOString(),
          dossier: fr.flagshipDossier,
          enrichment_model: `${grokModel} + ${CLAUDE_WRITER_MODEL}`,
          needs_attention: false,
          attention_reason: null,
        };
        if (fr.flagshipDossier.website) flagPatch.website = fr.flagshipDossier.website;
        if (fr.flagshipDossier.instagram) flagPatch.instagram_url = fr.flagshipDossier.instagram;
        if (fIgHandle) flagPatch.instagram_handle = fIgHandle;
        if (fStyle) flagPatch.style = fStyle;
        if (fPrice) flagPatch.price_level = fPrice;
        if (fSocials.x_url) flagPatch.x_url = fSocials.x_url;
        if (fSocials.facebook_url) flagPatch.facebook_url = fSocials.facebook_url;
        if (fSocials.tiktok_url) flagPatch.tiktok_url = fSocials.tiktok_url;
        if (fSocials.youtube_url) flagPatch.youtube_url = fSocials.youtube_url;
        const fHook = fCopy?.hook ?? null;
        const fDesc = fCopy?.description ?? null;
        if (fHook || fDesc) {
          if (fr.status === "approved") {
            // Don't silently change a live flagship's copy — hold it for approval.
            flagPatch.pending_changes = { hook: fHook, description: fDesc };
          } else {
            if (fHook) flagPatch.hook = fHook;
            if (fDesc) flagPatch.description = fDesc;
          }
        }
        await ctx.db.from("restaurants").update(flagPatch).eq("id", fr.flagshipId);

        // Commit the BRANCH's own research (cost/dossier/sources/debug) and mark
        // it a CLEAN sibling — NO attention flag, NO copy written here.
        const branchGrokCost = round4(gCost);
        const branchPatch: Record<string, unknown> = {
          enriched_at: new Date().toISOString(),
          dossier,
          enrichment_cost: round4(priorCost + branchGrokCost),
          enrichment_cost_breakdown: {
            grok_searches: grokSearches,
            grok_in_tokens: grokInTokens,
            grok_out_tokens: grokOutTokens,
            grok_cost: branchGrokCost,
            search_cost: round4(grokSearches * 0.005),
            total_searches: grokSearches,
            passes: passLog.length,
            action: "branch-first discovery",
          },
          enrichment_model: grokModel,
          enrichment_sources: consulted.size ? [...consulted] : null,
          enrichment_debug: { passes: passLog, total_searches: grokSearches },
          needs_attention: false,
          attention_reason: null,
        };
        await ctx.db.from("restaurants").update(branchPatch).eq("id", restaurantId);

        return NextResponse.json({
          ok: true,
          mode,
          name: brand,
          branch_first_discovery: true,
          reassigned_to_flagship: true,
          flagship_id: fr.flagshipId,
          flagship_city: fr.flagshipCity,
          flagship_created: fr.created,
          is_chain: true,
          is_chain_parent: false,
          needs_attention: false,
          message: `Flagship ${fr.flagshipCity ?? "location"} identified and populated with the brand facts — enrich the flagship to finish its page, then the siblings.`,
          cost: round4(branchGrokCost + fCopyCost),
          chain_seeds: seeded?.added ?? [],
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Flagship reassignment failed." },
          { status: 500 }
        );
      }
    } else {
      // This record IS the flagship (confident match), OR the flagship couldn't be
      // determined — either way it stays the parent. If unknown, it makes NO
      // origin claim and is flagged for review.
      flagshipUnknown = !fl;
      seeded = await seedChainLocations(ctx.db, restaurantId, brand, country, dossier.chain_locations);
      await ctx.db
        .from("restaurants")
        .update({ chain_rostered_at: new Date().toISOString() })
        .eq("id", restaurantId);
      rosteredNow = true;
    }
  }

  // ── Retry-on-thin: fire AT MOST ONCE, only within the search budget ────────
  // If a parent/standalone dossier still lacks core anchors, the research likely
  // read a per-location stub, not the About/story page. ONE more steered search
  // — never a loop, never past the budget — MERGED fill-empty. Siblings inherit
  // brand facts, so this is parents/standalone only.
  let retriedThin = false;
  if (!row.chain_parent_id && missingCoreAnchors(dossier) && searchesLeft() > 0) {
    const site = dossier.website ?? lead.website ?? null;
    let root: string | null = null;
    try {
      if (site) root = new URL(site).origin;
    } catch {
      root = null;
    }
    const retryLead: VenueLead = {
      ...lead,
      website: site ?? undefined,
      notes:
        `Read ${dossier.name ?? row.name}'s OWN About / Our Story / History page or its HOMEPAGE` +
        (root ? ` — start at ${root}` : "") +
        ` for the FOUNDING/established year, PITMASTER/owner(s), COOK METHOD and WOOD/FUEL, and signature SPECIALITIES. These live on the story/homepage, NOT a per-location stub.`,
    };
    try {
      const retry = await researchDossier(retryLead, { maxSearches: searchesLeft() });
      dossier = mergeDossierFacts(dossier, retry.dossier);
      recordPass("retry_thin", retry);
      retriedThin = true;
      twoPass = true; // used the doubled-ceiling headroom
    } catch {
      // Keep what we have — the honest "needs attention" flag is the final fallback.
    }
  }

  // Who is this copy FOR? A sibling (or a branch we just reassigned under the
  // flagship) writes as a branch and may NEVER claim to be the original. Only a
  // CONFIRMED flagship — or an already-rostered parent (which, post-reassignment,
  // is always the flagship) — may write "where it all began". An indeterminate
  // flagship writes generic chain copy (no origin claim).
  const isSiblingRow = Boolean(row.chain_parent_id);
  let writeOpts: { branchOf?: string | null; isFlagship?: boolean } | undefined;
  if (isSiblingRow || reassignedToFlagship) {
    writeOpts = { branchOf: dossier.name ?? row.name };
  } else if (detectedChain) {
    writeOpts = recordFlagshipConfirmed ? { isFlagship: true } : undefined;
  } else if (alreadyRostered) {
    writeOpts = { isFlagship: true };
  }

  let copy;
  try {
    copy = await writeVenueCopy(dossier, writeOpts);
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
      total_searches: grokSearches,
      passes: passLog.length,
      action: twoPass ? "enrich (2-pass)" : "enrich",
    },
    enrichment_model: `${grokModel} + ${claudeModel}`,
    enrichment_sources: sources.length ? sources : null,
    // Per-pass raw dossiers + usage, so a "read the pages but extracted nothing"
    // result is diagnosable (what each pass returned vs what got stored).
    enrichment_debug: { passes: passLog, total_searches: grokSearches },
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
  // A reassigned branch is effectively a sibling for the attention check — its
  // brand facts are inherited, so only its OWN location facts matter.
  const effectivelySibling = Boolean(row.chain_parent_id) || reassignedToFlagship;
  const locationFactsMissing = !address;
  // If the search budget was blown (an API cap leak), stop trusting the result
  // and flag — never let a runaway pass through silently.
  const searchRunaway = grokSearches > MAX_TOTAL_SEARCHES;
  const attention =
    overCeiling ||
    searchRunaway ||
    flagshipUnknown ||
    (effectivelySibling ? locationFactsMissing : copy.needs_attention);
  metadata.needs_attention = attention;
  metadata.attention_reason = attention
    ? overCeiling
      ? `Enrichment cost ${thisCost.toFixed(3)} exceeded the $${runCeiling} ceiling.`
      : searchRunaway
        ? `Search budget exceeded (${grokSearches} > ${MAX_TOTAL_SEARCHES}) — stopped and flagged; check enrichment_debug.`
        : flagshipUnknown
          ? "Chain detected but the original/flagship location couldn't be determined confidently — no location claims to be the original; review and set the flagship."
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
    two_pass: twoPass,
    retried_thin: retriedThin,
    sources_count: sources.length,
    // Chain signalling — parent only. Siblings report is_chain:false so the UI
    // never re-opens the roster gateway for them (the loop fix). The flagship's
    // pass-2 already ran server-side, so the gateway is now optional (find any
    // extra branches beyond what pass-1 saw), not required for a rich flagship.
    is_chain: detectedChain,
    // If we reassigned, THIS record is now a branch — not the chain parent — so
    // the roster gateway must not offer itself here.
    is_chain_parent: isParent && !reassignedToFlagship,
    // Pre-request value: still surfaces the (now optional) roster gateway once.
    chain_already_rostered: alreadyRostered,
    rostered_now: rosteredNow,
    // Flagship designation — the true "home" record, independent of enrich order.
    reassigned_to_flagship: reassignedToFlagship,
    flagship_id: flagshipParentId,
    flagship_unknown: flagshipUnknown,
    brand: detectedChain ? dossier.name ?? row.name : null,
    chain_locations_url: detectedChain ? dossier.chain_locations_url : null,
    // Honest counts from the seed pass (the full-roster gateway can find more).
    chain_seed_result: seeded,
    chain_seeds: seeded ? seeded.added : [],
  });
}
