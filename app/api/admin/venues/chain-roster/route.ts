import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { researchChainRoster } from "@/lib/ai/enrich";
import { grokCost, round4 } from "@/lib/ai/cost";
import { seedChainLocations } from "@/lib/admin/chain-seed";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// §09.1.2b — the roster scan is opt-in and HARD-capped. One bounded call reads
// the brand's own locations page; even at the 5-search cap it stays well under
// this ceiling. If the meter somehow exceeds it, we record the spend but still
// return what we found (the scan already happened — we don't seed beyond it).
const ROSTER_CEILING = 0.05;

/**
 * Chain roster gateway. Given a chain PARENT venue, reads its own
 * "Locations"/"Find us" page (chain_locations_url from the dossier) and seeds
 * every branch as a deduped $0 placeholder linked back to the parent. This is
 * the single, bounded "scan the roster" action behind the enrich-result gateway
 * prompt — never runs automatically, never enriches the branches.
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
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select("id, name, country, dossier, enrichment_cost, chain_parent_id")
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  // Roster scans start from the PARENT (the venue that was enriched). A sibling
  // seed has a chain_parent_id — bounce the caller to the parent instead.
  if (row.chain_parent_id) {
    return NextResponse.json(
      { error: "Run the roster scan from the chain's parent venue, not a branch." },
      { status: 400 }
    );
  }

  const dossier = (row.dossier ?? {}) as {
    is_chain?: boolean;
    chain_locations_url?: string | null;
    name?: string | null;
  };
  const brand = row.name ?? dossier.name ?? "";
  if (!brand) {
    return NextResponse.json({ error: "Venue has no brand name to scan." }, { status: 400 });
  }

  const priorCost = Number(row.enrichment_cost ?? 0) || 0;

  let roster;
  try {
    roster = await researchChainRoster({
      brand,
      url: dossier.chain_locations_url ?? null,
      country: row.country ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Roster scan failed." },
      { status: 502 }
    );
  }

  const cost = round4(grokCost(roster.usage, roster.model ?? GROK_MODEL));
  const overCeiling = cost > ROSTER_CEILING;

  // Seed/reconcile every branch — matched on PHYSICAL LOCATION, idempotent, and
  // skipping the parent's own venue (§09.2.2). Full address available here.
  const result = await seedChainLocations(
    ctx.db,
    restaurantId,
    brand,
    row.country ?? null,
    roster.locations.map((l) => ({ name: l.name, address: l.address, city: l.city }))
  );

  // Record the roster-scan spend AND stamp the chain as rostered so the gateway
  // is never offered again for this chain (§09.2.1).
  await ctx.db
    .from("restaurants")
    .update({
      enrichment_cost: round4(priorCost + cost),
      chain_rostered_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  const alreadyPresent = result.updated.length + result.matchedParent;
  return NextResponse.json({
    ok: true,
    brand,
    // One honest, consistent readout (§09.2.3).
    found: result.found,
    added: result.added.length,
    already_present: alreadyPresent,
    summary: `${result.found} found · ${result.added.length} new · ${alreadyPresent} already present`,
    seeded: result.added,
    cost,
    over_ceiling: overCeiling,
    used_url: dossier.chain_locations_url ?? null,
  });
}
