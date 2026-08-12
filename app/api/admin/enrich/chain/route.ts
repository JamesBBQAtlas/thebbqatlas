import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GrokError } from "@/lib/ai/grok";
import { type VenueLead } from "@/lib/ai/enrich";
import { discoverChainLocations } from "@/lib/chains/discoverLocations";
import { grokCost, round4 } from "@/lib/ai/cost";
import { logAiUsage } from "@/lib/ai/usage-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST — ask whether a business is a multi-location chain and, if so, find ALL of
 * its locations in one hunt. Returns a reviewable result; writes nothing. The
 * console then creates each location as its own venue under a shared brand.
 *
 * Convergence (chain-roster fix): this and the single-venue "Build roster" now
 * call the SAME discoverChainLocations engine, so they can never diverge again.
 * The web pass (Grok) stays PRIMARY here — it's what this bulk tool always used —
 * and the site crawl folds in ADDITIVELY, catching per-location pages the web
 * search misses (the exact 2Fifty Riverdale Park gap) with zero bulk regression.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI enrichment is off — set XAI_API_KEY to switch it on." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const lead = (body.lead ?? {}) as VenueLead;
  if (!lead.name && !lead.instagram && !lead.website && !lead.address) {
    return NextResponse.json(
      { error: "Give Grok something to work with — a name, handle, or address." },
      { status: 400 }
    );
  }

  try {
    const brand = (lead.name ?? "").trim() || (lead.website ?? "").trim() || "this chain";
    const discovery = await discoverChainLocations({
      lead,
      website: lead.website ?? null,
      brand,
      country: lead.country ?? null,
      // Web is primary here; the crawl folds in additively (no bulk regression).
      useWeb: true,
      useCrawl: Boolean(lead.website),
    });

    // Rebuild the reviewable ChainResult the console consumes, unchanged in shape
    // (brand facts + one row per location, now including any crawl-only branch).
    const chain = {
      is_chain: discovery.isChain,
      brand_name: discovery.brand?.name ?? (lead.name ?? null),
      description: discovery.brand?.description ?? null,
      website: discovery.brand?.website ?? lead.website ?? null,
      style: discovery.brand?.style ?? null,
      instagram_url: discovery.brand?.instagram_url ?? null,
      x_url: discovery.brand?.x_url ?? null,
      facebook_url: discovery.brand?.facebook_url ?? null,
      tiktok_url: discovery.brand?.tiktok_url ?? null,
      youtube_url: discovery.brand?.youtube_url ?? null,
      locations: discovery.locations.map((l) => ({
        name: l.name,
        location_label: l.location_label,
        address: l.address,
        city: l.city,
        country: l.country,
        phone: l.phone,
        hours: l.hours,
        instagram_url: l.instagram_url,
      })),
      confidence: discovery.confidence,
      reviewer_notes: discovery.reviewerNotes,
      citations: discovery.crawledUrls,
      // Surface HOW each location was found so the operator can see the crawl's
      // additive contribution (e.g. the branch the web search alone missed).
      found_via: {
        crawl: discovery.locations.filter((l) => l.found_via === "crawl").length,
        web: discovery.locations.filter((l) => l.found_via === "web").length,
        both: discovery.locations.filter((l) => l.found_via === "both").length,
      },
      source_types: discovery.sourceTypes,
    };

    // Exact per-call AI ledger row — chain discovery makes real Grok search
    // calls and used to be invisible to the spend dashboard (Fable M-1). Only the
    // web pass costs money; the crawl is free.
    if (discovery.ranWeb && discovery.usage && discovery.model) {
      await logAiUsage(ctx.db, {
        provider: "xai",
        model: discovery.model,
        task: "chain_discovery",
        entity_type: "chain",
        entity_id: null,
        input_tokens: discovery.usage.in_tokens,
        output_tokens: discovery.usage.out_tokens,
        search_count: discovery.usage.searches,
        cost: round4(grokCost(discovery.usage, discovery.model)),
        usage_raw: discovery.usage,
        user_id: ctx.userId,
      });
    }
    // Provenance: mirror the venue route's audit trail (F-14). Best-effort.
    try {
      await ctx.db.from("enrichment_runs").insert({
        restaurant_id: null,
        entity_type: "chain",
        lead: lead as unknown as Record<string, unknown>,
        result: chain as unknown as Record<string, unknown>,
        citations: chain.citations.length ? chain.citations : null,
        model: discovery.model ?? process.env.XAI_MODEL ?? "grok-4.5",
        created_by: ctx.userId,
      });
    } catch {
      /* provenance logging is secondary */
    }
    return NextResponse.json({ chain });
  } catch (err) {
    const msg = err instanceof GrokError ? err.message : "Discovery failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
