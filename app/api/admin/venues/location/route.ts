import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { geocodeAddress } from "@/lib/geo/geocode";
import { canonicalCountry } from "@/lib/constants/countries";
import { settlementCity } from "@/lib/admin/address";
import { revalidateVenues } from "@/lib/cache/venues";
import { auditFromPatch } from "@/lib/admin/content-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual location correction (admin). Update the full address (incl. postcode),
 * city and country; re-geocode the pin from the new address by default, OR accept
 * an explicit lat/lng the operator nudged by hand. Applies live and revalidates so
 * the corrected address + pin show on the next load of the venue page and map.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select("id, name, address, city, country, lat, lng, needs_attention, attention_reason")
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const address = typeof body.address === "string" ? body.address.trim() : (row.address as string);
  // Geocode with the PRECISE city the operator typed; store the settlement form
  // ("City of Westminster" → London) for consistent grouping (Fix C). A bare
  // locality is left exactly as entered.
  const city = typeof body.city === "string" ? body.city.trim() : (row.city as string);
  const storedCity = settlementCity(city) || city;
  const country = canonicalCountry(
    typeof body.country === "string" && body.country.trim() ? body.country : (row.country as string)
  );

  const patch: Record<string, unknown> = { address, city: storedCity, country };

  // An explicit numeric lat/lng from the operator wins (a hand-nudged pin);
  // otherwise (or when they ask to re-geocode) derive the pin from the address.
  const hasManualPin =
    typeof body.lat === "number" && typeof body.lng === "number" && Number.isFinite(body.lat) && Number.isFinite(body.lng);
  let locatedOk = false;
  if (hasManualPin && !body.regeocode) {
    patch.lat = body.lat;
    patch.lng = body.lng;
    locatedOk = true;
  } else {
    // MapTiler geocode (name-fallback) never returns (0,0) — a null is a real miss.
    const geo = await geocodeAddress({ address, city, country, name: row.name as string });
    if (geo) {
      patch.lat = geo.lat;
      patch.lng = geo.lng;
      if (geo.country_code) patch.country_code = geo.country_code;
      locatedOk = true;
    } else if (hasManualPin) {
      patch.lat = body.lat;
      patch.lng = body.lng;
      locatedOk = true;
    } else {
      return NextResponse.json(
        { error: "Couldn't geocode that address — refine it or enter lat/lng manually." },
        { status: 422 }
      );
    }
  }

  // Fix 3 — a resolved pin clears a lingering "couldn't locate" flag automatically.
  const locateReason = /couldn.?t locate|set pin manually|place this venue|location facts/i;
  if (locatedOk && row.needs_attention && locateReason.test(String(row.attention_reason ?? ""))) {
    patch.needs_attention = false;
    patch.attention_reason = null;
  }

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await auditFromPatch(ctx.db, restaurantId, row as Record<string, unknown>, patch, {
    source: "manual_edit",
    changedBy: ctx.userId,
    note: "location edit",
  });

  revalidateVenues();
  return NextResponse.json({ ok: true, lat: patch.lat, lng: patch.lng, address, city, country });
}
