import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";
import { geocodeStructured, extractUKPostcode, isSentinelPin } from "@/lib/geo/geocode";
import { haversineKm } from "@/lib/utils/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Item 3 — NON-DESTRUCTIVE pin-confidence backfill.
 *
 * The confidence fields (geo_precision / geo_confidence / geo_source) are null on
 * every venue pinned before the geocode-fix shipped, so the admin pin badge reads
 * blank across the existing catalogue even where the pin is fine. This job fills
 * them in WITHOUT moving any pin:
 *   • only venues that HAVE a real pin (not null / not 0,0) and null geo_precision;
 *   • geo_locked (hand-placed) pins are TRUSTED and skipped entirely;
 *   • it re-runs geocodeStructured purely to CORROBORATE the stored pin — it never
 *     writes lat/lng. If the fresh geocode lands near the stored pin, the pin is
 *     marked Confirmed (or Approximate for a postcode-level hit); if it can't
 *     corroborate, the pin is marked Approximate ("verify") — but left exactly
 *     where it is.
 *
 * Bounded per run (network-bound: one geocode per venue) and fully reported —
 * processed / updated / remaining — so nothing is silently capped. Re-run until
 * remaining is 0. Dry-run by default; ?apply=1 writes.
 */

const NEAR_KM = 3; // a fresh geocode within this of the stored pin corroborates it
const MAX_PER_RUN = 200;

interface Row {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

/** A genuine pin to corroborate — real coords AND not a placeholder sentinel
 *  (0,0 or a country centroid). Sentinel pins are "missing", never backfilled. */
function isRealCandidatePin(r: Row): boolean {
  return (
    typeof r.lat === "number" && typeof r.lng === "number" &&
    Number.isFinite(r.lat) && Number.isFinite(r.lng) &&
    !isSentinelPin(r.lat, r.lng)
  );
}

// The exact US country-centroid point some address-less rows were stamped with.
const US_CENTROID: [number, number] = [39.7837305527552, -100.445882119238];

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const apply = url.searchParams.get("apply") === "1" || body.apply === true;
  const limit = Math.min(MAX_PER_RUN, Math.max(1, Number(body.limit) || MAX_PER_RUN));

  // Candidates: a GENUINE pin, no confidence yet, not locked. Sentinel pins —
  // (0,0) and the US country-centroid point — are excluded in SQL so they neither
  // inflate the count (was 787 incl. the 524 null-island rows) nor burn a geocode
  // call; the pin-sanity audit already treats those as "missing". A JS
  // isSentinelPin pass is the belt-and-suspenders. Count the backlog first (for an
  // honest "remaining"), then take this run's slice.
  const base = ctx.db
    .from("restaurants")
    .select("id, name, address, city, country, lat, lng", { count: "exact" })
    .is("geo_precision", null)
    .eq("geo_locked", false)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .or("lat.neq.0,lng.neq.0") // exclude the exact (0,0) null-island sentinel
    .or(`lat.neq.${US_CENTROID[0]},lng.neq.${US_CENTROID[1]}`); // exclude the US centroid

  const { data, count, error } = await base.order("id", { ascending: true }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = ((data ?? []) as Row[]).filter(isRealCandidatePin); // drop any sentinel that slipped the SQL filter

  let processed = 0, updated = 0, confirmed = 0, approximate = 0, geocodeCalls = 0;

  for (const r of rows) {
    processed++;
    const geo = await geocodeStructured({
      address: r.address,
      city: r.city,
      postcode: extractUKPostcode(r.address),
      country: r.country,
      name: r.name,
    });
    geocodeCalls++;

    let precision: string;
    let confidence: number;
    let source: string;
    if (geo.result) {
      const km = haversineKm(r.lat as number, r.lng as number, geo.result.lat, geo.result.lng);
      if (km <= NEAR_KM && geo.result.precise) {
        // Fresh precise hit corroborates the stored pin → Confirmed.
        precision = (geo.result.place_type as string) || "address";
        confidence = 0.9;
        source = geo.source ?? "maptiler";
        confirmed++;
      } else if (km <= NEAR_KM) {
        // Near, but only postcode/area level → Approximate.
        precision = "postcode";
        confidence = 0.75;
        source = geo.source ?? "maptiler";
        approximate++;
      } else {
        // A fresh geocode disagrees with the stored pin — don't move it, but flag
        // the pin as needing a look.
        precision = "approximate";
        confidence = 0.4;
        source = "backfill-uncorroborated";
        approximate++;
      }
    } else {
      // Couldn't re-resolve at all — the pin stands, but mark it for verification.
      precision = "approximate";
      confidence = 0.4;
      source = "backfill-uncorroborated";
      approximate++;
    }

    if (apply) {
      const { error: upErr } = await ctx.db
        .from("restaurants")
        // Deliberately NOT writing lat/lng — the pin is never moved.
        .update({ geo_precision: precision, geo_confidence: confidence, geo_source: source })
        .eq("id", r.id);
      if (!upErr) updated++;
    }
  }

  if (apply && updated) revalidateVenues();

  const remaining = Math.max(0, (count ?? rows.length) - (apply ? updated : processed));
  return NextResponse.json({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    counts: {
      candidates_total: count ?? rows.length,
      processed,
      updated,
      confirmed,
      approximate,
      geocode_calls: geocodeCalls,
      remaining,
    },
    note:
      remaining > 0
        ? `${remaining} pinned venue(s) still need confidence backfilled — re-run to continue (${MAX_PER_RUN}/run). Pins are never moved; locked pins are skipped.`
        : "All pinned venues have confidence populated. No pin was moved; locked pins were skipped.",
  });
}
