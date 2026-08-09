import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { resolveChainSite } from "@/lib/ai/enrich";
import { grokCost, round4 } from "@/lib/ai/cost";
import { logAiUsage } from "@/lib/ai/usage-log";
import { auditField } from "@/lib/admin/content-audit";
import { seedChainLocations } from "@/lib/admin/chain-seed";
import { discoverChain } from "@/lib/admin/chain-discovery/engine";
import { identifyFlagship } from "@/lib/admin/chain-discovery/classify";
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
    .select("id, name, slug, status, country, city, website, instagram_handle, dossier, enrichment_cost, chain_parent_id")
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
  await ctx.db.from("restaurants").update(parentPatch).eq("id", restaurantId);

  // ── Steps 1-4 — discover the full location set from the chain's own site ──
  // Part 4A — the crawl is ADDRESS-DRIVEN and the per-venue cost cap is WAIVED
  // for a chain (the crawl makes no LLM calls; the lift matters for the stronger
  // copy writer below). No dollar cap on discovery itself — only wall-clock.
  const discovery = await discoverChain({
    website,
    brand,
    country: row.country ?? null,
    // Cap the crawl at ~190s so there's headroom under the 300s function limit
    // for geocoding + seeding every discovered branch.
    deadlineMs: 190_000,
  });

  const anchoredCountry = discovery.country ?? row.country ?? null;
  // Was this asserted to be a chain (by enrichment or the operator)? If so, a
  // <2-branch result is a LOUD failure — never a silent "not a chain".
  const knownChain = Boolean(dossier.is_chain);

  // Part 4B — LOUD on failure. A known chain that yields <2 real dine-in branches
  // gets a hard needs_attention that shows its working: the exact URLs crawled,
  // every raw address string seen, and why the result fell short — never a bare [].
  if (discovery.locations.length < 2 && knownChain) {
    const urlList = discovery.crawledUrls.slice(0, 20);
    const rawList = discovery.rawAddresses.slice(0, 20);
    const reason =
      `Chain discovery found ${discovery.locations.length} dine-in branch(es) — expected ≥2. ` +
      `Crawled ${discovery.crawledUrls.length} page(s); saw ${discovery.rawAddresses.length} raw address string(s)` +
      (discovery.lowConfidence.length ? `, ${discovery.lowConfidence.length} HQ/shipping (not rostered)` : "") +
      `. Review the crawl (dossier.discovery_debug) and add branches manually if needed.`;
    await ctx.db.from("restaurants").update({
      enrichment_cost: round4(priorCost + grokCostTotal),
      needs_attention: true,
      attention_reason: reason,
      dossier: {
        ...dossier,
        is_chain: true,
        discovery_source_type: discovery.sourceType,
        discovery_debug: {
          crawled_urls: urlList,
          raw_addresses: rawList,
          low_confidence: discovery.lowConfidence.map((l) => ({ address: l.address, reason: l.reason })),
          notes: discovery.notes,
          at: new Date().toISOString(),
        },
      },
    }).eq("id", restaurantId);
    revalidateVenues();
    return NextResponse.json({
      ok: false, brand, website, chain_underfilled: true, source_type: discovery.sourceType,
      found: discovery.locations.length, added: 0,
      crawled_urls: urlList, raw_addresses: rawList,
      low_confidence: discovery.lowConfidence.map((l) => l.address),
      notes: discovery.notes,
      message: reason,
      cost: grokCostTotal,
    }, { status: 200 });
  }

  // Not asserted a chain AND <2 found → a genuine single venue. Clear chain flags.
  if (discovery.locations.length <= 1) {
    await ctx.db.from("restaurants").update({
      enrichment_cost: round4(priorCost + grokCostTotal),
      chain_candidate: false, flagship_unset: false, chain_rostered_at: null,
      country: canonicalCountry(anchoredCountry) || row.country,
    }).eq("id", restaurantId);
    revalidateVenues();
    return NextResponse.json({
      ok: true, brand, website, not_a_chain: true, source_type: discovery.sourceType,
      found: discovery.locations.length, added: 0, notes: discovery.notes,
      low_confidence: discovery.lowConfidence.map((l) => l.address),
      cost: grokCostTotal,
      message: "Only one location found on the official site — treated as a single venue.",
    });
  }

  // ── Step 5 — seed/reconcile every branch (idempotent, deduped) ────────────
  const result = await seedChainLocations(
    ctx.db,
    restaurantId,
    brand,
    anchoredCountry,
    discovery.locations.map((l) => ({
      name: l.location_label,
      address: l.street ?? l.address,
      city: l.city,
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
  const flagshipPick = identifyFlagship(discovery.locations, {
    flagshipLocation:
      (dossier as { flagship_location?: { city?: string | null; address?: string | null } | null })
        .flagship_location ?? null,
  });
  let flagshipCrowned = false;
  let suggestedFlagship: { label: string | null; city: string | null; reason: string } | null = null;
  if (flagshipPick) {
    const fl = discovery.locations[flagshipPick.index];
    const parentCity = normCity(row.city as string | null);
    if (parentCity && normCity(fl.city) === parentCity) flagshipCrowned = true;
    else suggestedFlagship = { label: fl.location_label, city: fl.city, reason: flagshipPick.reason };
  }

  const nowIso = new Date().toISOString();
  await ctx.db.from("restaurants").update({
    enrichment_cost: round4(priorCost + grokCostTotal),
    chain_rostered_at: nowIso,
    // Crown the parent as flagship only when a signal identifies it; otherwise the
    // operator still picks the original.
    flagship_unset: !flagshipCrowned,
    chain_candidate: false,
    country: canonicalCountry(anchoredCountry) || row.country,
    dossier: {
      ...dossier,
      is_chain: true,
      chain_locations_url: discovery.locatorUrl,
      discovery_source_type: discovery.sourceType,
      identified_flagship: flagshipCrowned
        ? { scope: "parent", reason: flagshipPick?.reason ?? null }
        : suggestedFlagship
          ? { scope: "branch", ...suggestedFlagship }
          : null,
    },
  }).eq("id", restaurantId);
  await ctx.db.from("restaurants").update({ flagship_unset: !flagshipCrowned }).eq("chain_parent_id", restaurantId);

  await auditField(ctx.db, restaurantId, "chain", null,
    { rostered: true, added: result.added.length, found: result.found, source: discovery.sourceType },
    { source: "roster", changedBy: ctx.userId, note: `roster built via ${discovery.sourceType}` });

  revalidateVenues();

  const alreadyPresent = result.updated.length + result.matchedParent;
  const sourceLabel =
    discovery.sourceType === "hierarchical" ? `by crawling ${discovery.pagesFetched} pages`
    : discovery.sourceType === "jsonapi" ? "from the store-locator API"
    : discovery.sourceType === "jsonld" ? "from the locations page (structured data)"
    : discovery.sourceType === "text" ? "from the site's own pages (addresses in text)"
    : "from the official locations page";
  const locSuffix = result.needsLocation ? ` · ${result.needsLocation} need a pin` : "";
  const partSuffix = discovery.partial ? " · PARTIAL (re-run to continue)" : "";
  const dupSuffix = result.possibleDuplicates ? ` · ${result.possibleDuplicates} possible duplicate${result.possibleDuplicates === 1 ? "" : "s"} flagged` : "";
  const linkSuffix = result.linked ? ` · ${result.linked} existing linked` : "";

  return NextResponse.json({
    ok: true,
    brand,
    website,
    flagship_unset: !flagshipCrowned,
    flagship_crowned: flagshipCrowned,
    suggested_flagship: suggestedFlagship,
    source_type: discovery.sourceType,
    source_note: `Found ${result.found} ${sourceLabel}${discovery.country ? ` · ${discovery.country}` : ""}`,
    locator_url: discovery.locatorUrl,
    country: discovery.country,
    partial: discovery.partial,
    found: result.found,
    added: result.added.length,
    linked: result.linked,
    possible_duplicates: result.possibleDuplicates,
    already_present: alreadyPresent,
    needs_location: result.needsLocation,
    low_confidence: discovery.lowConfidence.map((l) => l.address),
    notes: discovery.notes,
    summary: `${result.found} found · ${result.added.length} new · ${alreadyPresent} already present${linkSuffix}${dupSuffix}${locSuffix}${partSuffix}`,
    seeded: result.added,
    cost: grokCostTotal,
  });
}
