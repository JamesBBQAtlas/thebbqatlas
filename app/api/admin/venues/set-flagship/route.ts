import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { mergeDossierFacts, missingCoreAnchors, type VenueDossier } from "@/lib/ai/enrich";
import { populateFlagship } from "@/lib/admin/flagship";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Human picks the flagship for an AMBIGUOUS chain (one the research couldn't
 * auto-resolve). The chosen location becomes the parent, carries the brand facts
 * (reused from whichever member gathered them during discovery), gets its
 * brand-level page written (Claude only, NO web search), and every other member
 * re-points to it and unlocks for the normal cheap sibling inheritance.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: chosen, error: loadErr } = await ctx.db
    .from("restaurants")
    .select("id, name, city, address, status, chain_parent_id, dossier")
    .eq("id", restaurantId)
    .single();
  if (loadErr || !chosen) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  // The chain group is rooted at the current temp parent (this row, or its parent
  // if this row is a seed under one). Members = root + all rows under the root.
  const rootId = (chosen.chain_parent_id as string | null) ?? (chosen.id as string);
  const { data: underRoot } = await ctx.db
    .from("restaurants")
    .select("id, name, city, address, status, dossier")
    .eq("chain_parent_id", rootId);
  const { data: rootRow } = await ctx.db
    .from("restaurants")
    .select("id, name, city, address, status, dossier")
    .eq("id", rootId)
    .single();
  const members = [
    ...(rootRow ? [rootRow] : []),
    ...(underRoot ?? []),
  ] as unknown as Array<{ id: string; dossier: VenueDossier | null }>;

  // Reuse the brand facts already gathered during discovery: the richest member
  // dossier (the temp parent that did the discovery usually carries them).
  let brandDossier: VenueDossier | null = null;
  for (const m of members) {
    const d = m.dossier;
    if (d && !missingCoreAnchors(d)) {
      brandDossier = d;
      break;
    }
  }
  if (!brandDossier) brandDossier = (chosen.dossier as VenueDossier | null) ?? null;

  // Build the chosen flagship's dossier: keep ITS own location facts (from its
  // row / dossier), fill in the brand facts. Never clobber.
  const chosenBase: VenueDossier | null = (chosen.dossier as VenueDossier | null) ?? null;
  const seedFromRow: VenueDossier = {
    name: (chosen.name as string) ?? null,
    also_known_as: [],
    what_it_is: null,
    address: (chosen.address as string) ?? null,
    city: (chosen.city as string) ?? null,
    region_state: null,
    country: null,
    postcode: null,
    lat: null,
    lng: null,
    phone: null,
    website: null,
    instagram: null,
    other_socials: [],
    hours: null,
    established: null,
    opening_date: null,
    flagship_location: null,
    founders_pitmaster: null,
    bbq_style: null,
    specialities: [],
    cook_method: null,
    wood_fuel: null,
    price_band: null,
    awards_press: [],
    setting_vibe: null,
    ordering_notes: null,
    best_photo_post_url: null,
    recent_instagram_posts: [],
    location_label: null,
    is_chain: true,
    chain_locations: [],
    chain_locations_url: null,
    sources: [],
    unknowns: [],
  };
  const base = chosenBase ? { ...chosenBase, is_chain: true } : seedFromRow;
  const finalDossier: VenueDossier = brandDossier ? mergeDossierFacts(base, brandDossier) : base;
  finalDossier.is_chain = true;

  const nowIso = new Date().toISOString();

  // Reassign the hierarchy: chosen becomes the parent; every OTHER member points
  // to it. Clear the "flagship not set" flag across the whole group.
  await ctx.db
    .from("restaurants")
    .update({ chain_parent_id: null, chain_rostered_at: nowIso, flagship_unset: false })
    .eq("id", chosen.id);
  for (const m of members) {
    if (m.id === chosen.id) continue;
    // Demote to a sibling and clear the now-stale "flagship not set" attention.
    await ctx.db
      .from("restaurants")
      .update({
        chain_parent_id: chosen.id,
        flagship_unset: false,
        needs_attention: false,
        attention_reason: null,
      })
      .eq("id", m.id);
  }

  // Populate the chosen flagship's brand-level page (Claude only — NO web search).
  const { copyWritten } = await populateFlagship(ctx.db, {
    flagshipId: chosen.id as string,
    status: (chosen.status as string) ?? "pending",
    dossier: finalDossier,
    grokModel: "set-flagship",
  });

  revalidateVenues();
  return NextResponse.json({
    ok: true,
    flagship_id: chosen.id,
    flagship_name: chosen.name,
    copy_written: copyWritten,
    message: copyWritten
      ? `${chosen.name}${chosen.city ? ` (${chosen.city})` : ""} set as the flagship — its page is written and the other locations are now siblings.`
      : `${chosen.name}${chosen.city ? ` (${chosen.city})` : ""} set as the flagship — enrich it to write its page; the other locations are now siblings.`,
  });
}
