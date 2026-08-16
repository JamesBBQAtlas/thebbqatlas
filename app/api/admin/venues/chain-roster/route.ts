import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { resolveChainSite } from "@/lib/ai/enrich";
import { grokCost, round4 } from "@/lib/ai/cost";
import { logAiUsage } from "@/lib/ai/usage-log";
import { auditField } from "@/lib/admin/content-audit";
import { seedChainLocations } from "@/lib/admin/chain-seed";
import { discoverChainLocations } from "@/lib/chains/discoverLocations";
import { identifyFlagship } from "@/lib/admin/chain-discovery/classify";
import { hasStreetAddress } from "@/lib/admin/chain-discovery/normalize";
import { uniqueRestaurantSlug } from "@/lib/admin/venues";
import { normCity } from "@/lib/admin/address";
import { canonicalCountry } from "@/lib/constants/countries";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Chain-discovery v2 (Part 1). Given a chain PARENT venue (which may be a bare
 * seed stub — handle-only, no website), this:
 *   Step 0 — resolves the OFFICIAL website + canonical brand name (Grok is used
 *            ONLY to find the site, never the location list), and upgrades the
 *            stub row in place.
 *   Steps 1-4 — a GENERAL engine reads the chain's OWN locator (JSON API → flat
 *            HTML DOM → hierarchical crawl), with country anchored from the chain
 *            itself and a hard geocode write-guard. No cap, no invented branches.
 *   Step 5 — seeds/reconciles every branch idempotently via seedChainLocations.
 *
 * There is ZERO chain-specific logic here or in the engine.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required." }, { status: 400 });

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select("id, name, slug, status, country, city, address, lat, lng, website, instagram_handle, dossier, enrichment_cost, chain_parent_id, needs_attention, attention_reason")
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  if (row.chain_parent_id) {
    return NextResponse.json(
      { error: "Run discovery from the chain's parent venue, not a branch." },
      { status: 400 }
    );
  }

  const dossier = (row.dossier ?? {}) as {
    is_chain?: boolean; chain_locations_url?: string | null; name?: string | null;
  };
  const priorCost = Number(row.enrichment_cost ?? 0) || 0;
  let grokCostTotal = 0;

  // ── Step 0 — resolve the official website + canonical brand name ──────────
  const originOf = (u: string | null | undefined): string | null => {
    if (!u) return null;
    try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin; } catch { return null; }
  };
  let website = originOf(row.website) ?? originOf(dossier.chain_locations_url);
  let brand = (row.name ?? dossier.name ?? "").trim();

  if (!website) {
    if (!GROK_ENABLED) {
      return NextResponse.json({ error: "No website on file and AI is off — set XAI_API_KEY, or add the site to the venue." }, { status: 503 });
    }
    let site;
    try {
      site = await resolveChainSite({
        name: row.name, handle: row.instagram_handle, city: row.city, country: row.country,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Site resolution failed." }, { status: 502 });
    }
    grokCostTotal = round4(grokCost(site.usage, site.model ?? GROK_MODEL));
    await logAiUsage(ctx.db, {
      provider: "xai", model: site.model ?? GROK_MODEL, task: "roster",
      entity_type: "restaurant", entity_id: restaurantId,
      input_tokens: site.usage.in_tokens, output_tokens: site.usage.out_tokens,
      search_count: site.usage.searches, cost: grokCostTotal, usage_raw: site.usage, user_id: ctx.userId,
    });
    website = originOf(site.website);
    if (site.canonical_name) brand = site.canonical_name.trim();
    if (!website) {
      // Never guess a domain — flag for the operator (§0, Step 0).
      await ctx.db.from("restaurants").update({
        enrichment_cost: round4(priorCost + grokCostTotal),
        needs_attention: true,
        attention_reason: "Couldn't identify the chain's official website — add it manually to run discovery.",
      }).eq("id", restaurantId);
      return NextResponse.json({
        ok: false, needs_site: true, brand,
        message: "No official website could be confidently identified. Add the site to the venue and re-run.",
        cost: grokCostTotal,
      }, { status: 200 });
    }
  }
  if (!brand) return NextResponse.json({ error: "Venue has no brand name to discover." }, { status: 400 });

  // Persist the resolved site + canonical name onto the (possibly stub) parent —
  // upgrade in place, never clone (§7.2). Refresh the slug only while non-public.
  const parentPatch: Record<string, unknown> = { website };
  if (brand && brand !== row.name) parentPatch.name = brand;
  if (row.status !== "approved" && brand && brand !== row.name) {
    parentPatch.slug = await uniqueRestaurantSlug(ctx.db, brand);
  }
  // FAIL 4 — an address-less brand/parent must NOT carry a centroid pin (the
  // "pinned to the geographic centre of the USA" bug). If the parent has no street
  // address, clear any pin to NULL so it's treated as "no pin", not planted at a
  // country/city centre. A parent with a real address keeps its pin.
  const parentHasStreet = hasStreetAddress({ address: (row.address as string | null) ?? null });
  if (!parentHasStreet) {
    parentPatch.lat = null;
    parentPatch.lng = null;
  }
  await ctx.db.from("restaurants").update(parentPatch).eq("id", restaurantId);

  // ── Steps 1-4 — discover the full location set via the ONE shared engine ──
  // Part 4A — chain-roster and the bulk "Discover all locations" tool both call
  // discoverChainLocations, so they can never diverge again (that divergence is
  // exactly how 2Fifty's Riverdale Park branch was found by the bulk tool and
  // missed by the single one). It runs the site CRAWL *and* a WEB pass and unions
  // them: the crawl reads the chain's own pages (locator index, JSON-LD,
  // per-location pages, visible text) for free; the web pass finds JS-rendered or
  // off-site locations the crawler can't see. Neither alone is trusted complete.
  // No dollar cap on discovery — only wall-clock (~190s under the 300s limit).
  const lead = {
    name: brand,
    website,
    instagram: row.instagram_handle ? `https://www.instagram.com/${row.instagram_handle}/` : undefined,
    address: (row.address as string | null) ?? undefined,
    city: (row.city as string | null) ?? undefined,
    country: (row.country as string | null) ?? undefined,
  };
  const discovery = await discoverChainLocations({
    lead,
    website,
    brand,
    country: row.country ?? null,
    deadlineMs: 190_000,
  });

  // Fold the web pass into the spend ledger (the crawl is free; the web pass costs
  // a Grok search). Logged separately from Step 0's site-resolution call.
  if (discovery.ranWeb && discovery.usage && discovery.model && discovery.cost > 0) {
    grokCostTotal = round4(grokCostTotal + discovery.cost);
    await logAiUsage(ctx.db, {
      provider: "xai", model: discovery.model, task: "roster",
      entity_type: "restaurant", entity_id: restaurantId,
      input_tokens: discovery.usage.in_tokens, output_tokens: discovery.usage.out_tokens,
      search_count: discovery.usage.searches, cost: discovery.cost, usage_raw: discovery.usage, user_id: ctx.userId,
    });
  }

  // The shared module reports an array of source types (e.g. ["crawl:hierarchical",
  // "web"]); collapse to one label for the debug record + operator message.
  const sourceType = discovery.sourceTypes.join("+") || "none";

  const anchoredCountry = discovery.country ?? row.country ?? null;
  // Was this asserted to be a chain (by enrichment or the operator, OR by the web
  // pass)? If so, a <2-branch result is a LOUD failure — never a silent "not a
  // chain". Folding in discovery.isChain makes variation E (locations exist but
  // only off-site, no street to roster) surface loudly instead of vanishing.
  const knownChain = Boolean(dossier.is_chain) || discovery.isChain;

  // Part 4B — LOUD on failure, but ONLY when extraction found NOTHING (round-2
  // fix). Finding exactly ONE real location is a VALID result — a single venue, or
  // a chain whose other branches have closed — so it is LINKED/deduped below, not
  // errored. The hard failure is reserved for a genuine extraction miss (0 found).
  if (discovery.locations.length === 0) {
    const urlList = discovery.crawledUrls.slice(0, 20);
    const rawList = discovery.rawAddresses.slice(0, 20);
    if (knownChain) {
      const reason =
        `Chain discovery extracted 0 addresses from ${discovery.crawledUrls.length} crawled page(s)` +
        (discovery.lowConfidence.length ? ` (${discovery.lowConfidence.length} HQ/shipping seen, not rostered)` : "") +
        `. Review the crawl (dossier.discovery_debug) and add branches manually if needed.`;
      await ctx.db.from("restaurants").update({
        enrichment_cost: round4(priorCost + grokCostTotal),
        needs_attention: true,
        attention_reason: reason,
        dossier: {
          ...dossier,
          is_chain: true,
          discovery_source_type: sourceType,
          discovery_debug: {
            crawled_urls: urlList,
            raw_addresses: rawList,
            low_confidence: discovery.lowConfidence.map((l) => ({ address: l.address, reason: l.reason })),
            source_types: discovery.sourceTypes,
            ran_web: discovery.ranWeb,
            ran_crawl: discovery.ranCrawl,
            notes: discovery.notes,
            at: new Date().toISOString(),
          },
        },
      }).eq("id", restaurantId);
      revalidateVenues();
      return NextResponse.json({
        ok: false, brand, website, chain_underfilled: true, source_type: sourceType,
        found: 0, added: 0,
        crawled_urls: urlList, raw_addresses: rawList,
        low_confidence: discovery.lowConfidence.map((l) => l.address),
        notes: discovery.notes,
        message: reason,
        cost: grokCostTotal,
      }, { status: 200 });
    }
    // Not flagged a chain and nothing found — clear chain framing, no error.
    await ctx.db.from("restaurants").update({
      enrichment_cost: round4(priorCost + grokCostTotal),
      chain_candidate: false, flagship_unset: false, chain_rostered_at: null,
      country: canonicalCountry(anchoredCountry) || row.country,
    }).eq("id", restaurantId);
    revalidateVenues();
    return NextResponse.json({
      ok: true, brand, website, not_a_chain: true, source_type: sourceType,
      found: 0, added: 0, notes: discovery.notes,
      low_confidence: discovery.lowConfidence.map((l) => l.address),
      cost: grokCostTotal,
      message: "No locations found on the official site.",
    });
  }

  // One real location is a valid single-venue outcome (not a multi-location chain).
  const singleLocation = discovery.locations.length < 2;

  // ── Step 5 — seed/reconcile every branch (idempotent, deduped). Runs even for a
  // single location, so a found address LINKS to an existing record (no duplicate,
  // no error). ────────────────────────────────────────────────────────────────
  const result = await seedChainLocations(
    ctx.db,
    restaurantId,
    brand,
    anchoredCountry,
    discovery.locations.map((l) => ({
      name: l.location_label ?? l.name,
      address: l.address,
      city: l.city,
      region: l.region,
      postcode: l.postcode,
      country: l.country,
      source_url: l.source_url,
    }))
  );

  // Part 4D — identify the flagship from research signals (the dossier's own
  // flagship_location, a name cue like "The Original", or the earliest founding
  // year on a location). When the signal points at the PARENT's own location we
  // crown the parent automatically (flagship set); when it points at a branch we
  // record it + surface a one-click re-parent suggestion (the flagship must be the
  // parent at the root — we don't auto-move rows unprompted). No signal → leave
  // flagship_unset so the operator crowns it, as before.
  const flagshipPick = identifyFlagship(
    // DiscoveredLocation carries its street line as `address`; map it to the
    // Pick<NormalLocation> shape identifyFlagship expects (index stays 1:1).
    discovery.locations.map((l) => ({
      location_label: l.location_label,
      street: l.address,
      city: l.city,
      address: l.address ?? "",
    })),
    {
      flagshipLocation:
        (dossier as { flagship_location?: { city?: string | null; address?: string | null } | null })
          .flagship_location ?? null,
    }
  );
  let flagshipCrowned = false;
  let suggestedFlagship: { label: string | null; city: string | null; reason: string } | null = null;
  if (flagshipPick) {
    const fl = discovery.locations[flagshipPick.index];
    const parentCity = normCity(row.city as string | null);
    if (parentCity && normCity(fl.city) === parentCity) flagshipCrowned = true;
    else suggestedFlagship = { label: fl.location_label, city: fl.city, reason: flagshipPick.reason };
  }

  // Truthful, DISTINCT counts (FAIL 2): a duplicate is now LINKED, not counted as
  // "new"; the real roster size is new + linked + updated-in-place + the parent.
  const alreadyPresent = result.updated.length + result.matchedParent;
  const distinctRostered = result.added.length + result.linked + alreadyPresent;

  const nowIso = new Date().toISOString();
  // Item 4 — a SUCCESSFUL discovery run (addresses extracted / branches linked)
  // must clear a STALE extraction/geocode flag left by an earlier 0-result run,
  // so the Ribs Lane parent no longer reads "extracted 0 addresses" after a run
  // that now extracts them. Only clear a discovery-class reason — never a
  // different attention flag the operator cares about.
  const staleDiscoveryFlag = /chain discovery extracted|extracted 0 addresses|0 addresses from|crawled page|couldn.?t locate|verify pin|no street address/i;
  const clearStale =
    Boolean((row as { needs_attention?: boolean }).needs_attention) &&
    staleDiscoveryFlag.test(String((row as { attention_reason?: string | null }).attention_reason ?? ""));
  await ctx.db.from("restaurants").update({
    enrichment_cost: round4(priorCost + grokCostTotal),
    chain_rostered_at: nowIso,
    ...(clearStale ? { needs_attention: false, attention_reason: null } : {}),
    // Crown the parent as flagship only when a signal identifies it; a single
    // location is trivially its own flagship, so it's never left "flagship unset".
    flagship_unset: singleLocation ? false : !flagshipCrowned,
    chain_candidate: false,
    country: canonicalCountry(anchoredCountry) || row.country,
    dossier: {
      ...dossier,
      is_chain: true,
      chain_locations_url: discovery.locatorUrl,
      discovery_source_type: sourceType,
      identified_flagship: flagshipCrowned
        ? { scope: "parent", reason: flagshipPick?.reason ?? null }
        : suggestedFlagship
          ? { scope: "branch", ...suggestedFlagship }
          : null,
      // FAIL 5 — persist the working on EVERY run (not just failures): the pages
      // crawled, every raw address seen, the per-address dedupe decision, the
      // HQ/shipping addresses held back, and the counts. This is what makes the
      // roster auditable ("shows its working") from the parent record.
      discovery_debug: {
        crawled_urls: discovery.crawledUrls.slice(0, 40),
        raw_addresses: discovery.rawAddresses.slice(0, 40),
        decisions: result.decisions.slice(0, 60),
        low_confidence: discovery.lowConfidence.map((l) => ({ address: l.address, reason: l.reason })),
        source_types: discovery.sourceTypes,
        ran_web: discovery.ranWeb,
        ran_crawl: discovery.ranCrawl,
        // How each rostered location was found — crawl-only, web-only, or both.
        found_via: {
          crawl: discovery.locations.filter((l) => l.found_via === "crawl").length,
          web: discovery.locations.filter((l) => l.found_via === "web").length,
          both: discovery.locations.filter((l) => l.found_via === "both").length,
        },
        // Format-variant duplicates the union dedupe collapsed (diacritic /
        // number-position / colonia variants of one address) — recorded, not
        // silently dropped, so the roster shows its dedupe working (A3).
        merged_variants: discovery.mergedAway.slice(0, 40),
        counts: {
          distinct: distinctRostered,
          added: result.added.length,
          linked: result.linked,
          updated: result.updated.length,
          matched_parent: result.matchedParent,
          possible_duplicates: result.possibleDuplicates,
          need_pin: result.needsLocation,
        },
        notes: discovery.notes,
        partial: discovery.partial,
        at: nowIso,
      },
    },
  }).eq("id", restaurantId);
  await ctx.db.from("restaurants").update({ flagship_unset: singleLocation ? false : !flagshipCrowned }).eq("chain_parent_id", restaurantId);

  await auditField(ctx.db, restaurantId, "chain", null,
    { rostered: true, added: result.added.length, linked: result.linked, distinct: distinctRostered, source: sourceType },
    { source: "roster", changedBy: ctx.userId, note: `roster built via ${sourceType}` });

  revalidateVenues();
  const sourceLabel =
    discovery.sourceTypes.length > 1 ? `by crawling ${discovery.pagesFetched} page(s) and a web search`
    : discovery.sourceTypes.includes("web") ? "from a web search"
    : sourceType.includes("hierarchical") ? `by crawling ${discovery.pagesFetched} pages`
    : sourceType.includes("jsonapi") ? "from the store-locator API"
    : sourceType.includes("jsonld") ? "from the locations page (structured data)"
    : sourceType.includes("text") ? "from the site's own pages (addresses in text)"
    : "from the official locations page";
  const locSuffix = result.needsLocation ? ` · ${result.needsLocation} need a pin` : "";
  const partSuffix = discovery.partial ? " · PARTIAL (re-run to continue)" : "";
  const dupSuffix = result.possibleDuplicates ? ` · ${result.possibleDuplicates} possible duplicate${result.possibleDuplicates === 1 ? "" : "s"} flagged` : "";

  // A single-location outcome is reported as a single venue, not a chain — with
  // the found address linked/deduped, never errored (round-2 fix).
  const message = singleLocation
    ? `One location found — ${result.linked ? "linked to the existing record" : result.added.length ? "added" : "already on file"}; treated as a single venue, not a multi-location chain.`
    : `${distinctRostered} distinct locations rostered.`;

  return NextResponse.json({
    ok: true,
    brand,
    website,
    single_location: singleLocation,
    not_a_chain: singleLocation,
    flagship_unset: singleLocation ? false : !flagshipCrowned,
    flagship_crowned: flagshipCrowned || singleLocation,
    suggested_flagship: suggestedFlagship,
    source_type: sourceType,
    source_note: `${distinctRostered} distinct location${distinctRostered === 1 ? "" : "s"} ${sourceLabel}${discovery.country ? ` · ${discovery.country}` : ""}`,
    locator_url: discovery.locatorUrl,
    country: discovery.country,
    partial: discovery.partial,
    // `found` now reports DISTINCT locations after dedupe (FAIL 2) — not the raw
    // scraped count, and a duplicate is never counted as "new".
    found: distinctRostered,
    scraped: result.found,
    added: result.added.length,
    linked: result.linked,
    possible_duplicates: result.possibleDuplicates,
    already_present: alreadyPresent,
    needs_location: result.needsLocation,
    low_confidence: discovery.lowConfidence.map((l) => l.address),
    notes: discovery.notes,
    summary: singleLocation
      ? `1 location · ${result.linked ? "linked existing" : result.added.length ? "new" : "already present"} · single venue`
      : `${distinctRostered} distinct · ${result.added.length} new · ${result.linked} linked · ${alreadyPresent} already present${dupSuffix}${locSuffix}${partSuffix}`,
    seeded: result.added,
    cost: grokCostTotal,
  });
}
