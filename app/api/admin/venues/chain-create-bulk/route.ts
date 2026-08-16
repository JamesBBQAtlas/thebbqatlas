import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { checkDuplicate } from "@/lib/venues/dedupe-server";
import { seedChainLocations, resolvePhantomFlagship, type SeedLocation } from "@/lib/admin/chain-seed";
import { identifyFlagship } from "@/lib/admin/chain-discovery/classify";
import { geocodeStructured } from "@/lib/geo/geocode";
import { canonicalCountry } from "@/lib/constants/countries";
import { uniqueRestaurantSlug, resolveOrCreateBrand } from "@/lib/admin/venues";
import { BBQ_STYLES } from "@/lib/constants/styles";
import { auditField, auditCreated } from "@/lib/admin/content-audit";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface BulkLoc {
  name: string | null;
  location_label: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone?: string | null;
  instagram_url?: string | null;
}

/**
 * v3 — the BULK "Discover all locations" create path, converged onto the SAME
 * chain model + dedupe as the single-venue "Build roster" path.
 *
 * The old bulk flow POSTed each discovered location to /api/admin/venues, which
 * ran NO dedupe and grouped by brand_id (not rendered as a linked chain) — so
 * running it on a brand already in the Atlas (Hutchins) spawned duplicates under
 * a parallel brand chain. This route instead:
 *   1. RECONCILES to an existing chain — if any discovered location matches a live
 *      venue, its chain root (chain_parent_id ?? id) becomes the parent, so we
 *      link into the existing chain rather than spin up a parallel one;
 *   2. else creates the identified FLAGSHIP as the chain parent (chain_parent_id
 *      null), and
 *   3. seeds every other location via seedChainLocations — which dedupes against
 *      existing records (normalised street / geo-proximity / fuzzy brand) and
 *      LINKS rather than duplicates, flags uncertain matches possible_duplicate_of,
 *      and parents everything under the flagship (renders as one linked chain).
 *   4. writes dossier.discovery_debug on the parent, like the single path.
 * Zero hardcoded chain names.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const result = (body.result ?? {}) as {
    brand_name?: string | null;
    description?: string | null;
    website?: string | null;
    style?: string | null;
    instagram_url?: string | null;
    x_url?: string | null;
    facebook_url?: string | null;
    tiktok_url?: string | null;
    youtube_url?: string | null;
    locations?: BulkLoc[];
  };
  const brand = String(result.brand_name ?? "").trim();
  const locations = Array.isArray(result.locations) ? result.locations : [];
  if (!brand) return NextResponse.json({ error: "No brand name to create a chain from." }, { status: 400 });
  if (!locations.length) return NextResponse.json({ error: "No locations to create." }, { status: 400 });

  const country = canonicalCountry(locations.find((l) => l.country)?.country ?? null);
  const toSeed = (l: BulkLoc): SeedLocation => ({
    name: l.name || brand,
    address: l.address,
    city: l.city,
    country: l.country,
    source_url: result.website ?? null,
  });

  // ── 1. Reconcile to an EXISTING chain, if any location already lives here ──
  let parentId: string | null = null;
  let reconciled = false;
  for (const l of locations) {
    const matches = await checkDuplicate(ctx.db, { name: l.name || brand, address: l.address, city: l.city });
    const strong = matches.find((m) => m.confidence === "high");
    if (strong) {
      const { data: row } = await ctx.db
        .from("restaurants")
        .select("id, chain_parent_id")
        .eq("id", strong.id)
        .single();
      parentId = ((row?.chain_parent_id as string | null) ?? strong.id) as string;
      reconciled = true;
      break;
    }
  }

  // ── 2. No existing chain → create the identified FLAGSHIP as the parent ──
  let createdParent = false;
  let seedLocs = locations;
  if (!parentId) {
    const fp = identifyFlagship(
      locations.map((l) => ({ location_label: l.location_label, street: l.address, city: l.city, address: l.address ?? "" })),
      { flagshipLocation: (body.flagship ?? null) as { city?: string | null; address?: string | null } | null }
    );
    const flagIdx = fp?.index ?? 0;
    const flag = locations[flagIdx];
    const declaredCountry = canonicalCountry(flag.country ?? country);
    const brandRow = await resolveOrCreateBrand(ctx.db, {
      name: brand,
      description: result.description ?? null,
      website: result.website ?? null,
      instagram_url: result.instagram_url ?? null,
      x_url: result.x_url ?? null,
      facebook_url: result.facebook_url ?? null,
      tiktok_url: result.tiktok_url ?? null,
      youtube_url: result.youtube_url ?? null,
    });
    const geo = await geocodeStructured({ address: flag.address, city: flag.city, country: declaredCountry || country, name: brand });
    const located = Boolean(geo.result);
    const style = result.style && (BBQ_STYLES as readonly string[]).includes(result.style) ? result.style : "other";
    const slug = await uniqueRestaurantSlug(ctx.db, `${brand} ${flag.city ?? "flagship"}`);
    const { data: created, error: insErr } = await ctx.db
      .from("restaurants")
      .insert({
        slug,
        name: brand,
        location_label: flag.location_label ?? null,
        description: `${brand} — barbecue${flag.city ? ` in ${flag.city}` : ""}.`,
        style,
        lat: located ? geo.result!.lat : null,
        lng: located ? geo.result!.lng : null,
        address: flag.address ?? null,
        city: flag.city ?? null,
        country: declaredCountry || country,
        country_code: located ? geo.result!.country_code : null,
        // geocode-fix — persist pin quality (Confirmed/Approx/Missing in admin).
        geo_precision: geo.precision,
        geo_confidence: geo.confidence,
        geo_source: geo.source,
        website: result.website ?? null,
        instagram_url: result.instagram_url ?? null,
        x_url: result.x_url ?? null,
        facebook_url: result.facebook_url ?? null,
        tiktok_url: result.tiktok_url ?? null,
        youtube_url: result.youtube_url ?? null,
        price_level: 2,
        hero_image_url: "",
        hero_source: "none",
        // Moderation gate (Part 2) — bulk-created venues land pending, never auto-live.
        status: "pending",
        category: "restaurant",
        brand_id: brandRow?.id ?? null,
        chain_parent_id: null,
        flagship_unset: false,
        chain_rostered_at: new Date().toISOString(),
        needs_attention: !located,
        attention_reason: !located
          ? geo.reason ?? "Couldn't locate — check address / set pin manually"
          : null,
        dossier: { is_chain: true, discovery_source_type: "bulk", flagship_reason: fp?.reason ?? "first location listed" },
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json({ error: insErr?.message ?? "Could not create the chain flagship." }, { status: 500 });
    }
    parentId = created.id as string;
    createdParent = true;
    seedLocs = locations.filter((_, i) => i !== flagIdx);
    await auditCreated(ctx.db, parentId, { name: brand, city: flag.city ?? null, status: "pending" }, {
      source: "roster",
      changedBy: ctx.userId,
      note: "bulk chain flagship created",
    });
  }

  // ── 3. Seed the rest under the parent — dedupes/links, never duplicates ──
  const seedResult = await seedChainLocations(ctx.db, parentId, brand, country, seedLocs);

  // A4 — if the parent we're rostering under turned out to be an address-less seed
  // (e.g. an existing handle-only row we matched into), absorb the best real branch
  // so we never leave a phantom flagship. No-op when the parent has a real street.
  await resolvePhantomFlagship(ctx.db, parentId, locations[0]?.city ?? null);

  // ── 4. discovery_debug + is_chain on the parent (same trail as single path) ──
  const { data: parentNow } = await ctx.db
    .from("restaurants")
    .select("dossier, needs_attention, attention_reason")
    .eq("id", parentId)
    .single();
  const dossier = ((parentNow?.dossier as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  // Item 4 — leave the SAME audit trail on a reconcile as on a fresh crawl: the
  // source pages it saw (crawled_urls) and the raw addresses — never an empty
  // trail just because the run short-circuited to reconcile.
  const crawledUrls = Array.from(
    new Set(
      [result.website, ...locations.map((l) => l.instagram_url)].filter((u): u is string => Boolean(u))
    )
  ).slice(0, 40);
  // Item 4 — a successful reconcile/roster clears the parent's STALE extraction
  // flag from an earlier 0-result run (don't touch a different attention reason).
  const staleDiscoveryFlag = /chain discovery extracted|extracted 0 addresses|0 addresses from|crawled page|couldn.?t locate|verify pin|no street address/i;
  const clearStale =
    Boolean((parentNow as { needs_attention?: boolean } | null)?.needs_attention) &&
    staleDiscoveryFlag.test(String((parentNow as { attention_reason?: string | null } | null)?.attention_reason ?? ""));
  await ctx.db
    .from("restaurants")
    .update({
      ...(clearStale ? { needs_attention: false, attention_reason: null } : {}),
      dossier: {
        ...dossier,
        is_chain: true,
        discovery_source_type: "bulk",
        discovery_debug: {
          source: "bulk Discover all locations",
          website: result.website ?? null,
          crawled_urls: crawledUrls,
          raw_addresses: locations.map((l) => l.address).filter(Boolean).slice(0, 40),
          decisions: seedResult.decisions.slice(0, 60),
          counts: {
            reconciled,
            created_parent: createdParent,
            added: seedResult.added.length,
            linked: seedResult.linked,
            updated: seedResult.updated.length,
            matched_parent: seedResult.matchedParent,
            possible_duplicates: seedResult.possibleDuplicates,
            need_pin: seedResult.needsLocation,
          },
          at: new Date().toISOString(),
        },
      },
    })
    .eq("id", parentId);
  await ctx.db.from("restaurants").update({ flagship_unset: false }).eq("chain_parent_id", parentId);

  await auditField(ctx.db, parentId, "chain", null,
    { rostered: true, bulk: true, reconciled, added: seedResult.added.length, linked: seedResult.linked },
    { source: "roster", changedBy: ctx.userId, note: `bulk roster (${reconciled ? "reconciled to existing" : "new flagship"})` });

  revalidateVenues();

  const linkedOrPresent = seedResult.linked + seedResult.updated.length + seedResult.matchedParent;
  return NextResponse.json({
    ok: true,
    brand,
    parent_id: parentId,
    reconciled,
    created_parent: createdParent,
    added: seedResult.added.length,
    linked: seedResult.linked,
    already_present: linkedOrPresent,
    possible_duplicates: seedResult.possibleDuplicates,
    needs_location: seedResult.needsLocation,
    message: reconciled
      ? `Reconciled to the existing ${brand} chain — ${seedResult.added.length} new, ${linkedOrPresent} linked/updated, ${seedResult.possibleDuplicates} flagged. Zero duplicates.`
      : `Created the ${brand} chain — flagship + ${seedResult.added.length} branch(es), ${seedResult.possibleDuplicates} flagged.`,
  });
}
