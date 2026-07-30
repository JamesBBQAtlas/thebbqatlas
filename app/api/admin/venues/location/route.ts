import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { geocodeAddress } from "@/lib/geo/geocode";
import { canonicalCountry } from "@/lib/constants/countries";
import { revalidateVenues } from "@/lib/cache/venues";

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
    .select("id, address, city, country, lat, lng")
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const address = typeof body.address === "string" ? body.address.trim() : (row.address as string);
  const city = typeof body.city === "string" ? body.city.trim() : (row.city as string);
  const country = canonicalCountry(
    typeof body.country === "string" && body.country.trim() ? body.country : (row.country as string)
  );

  const patch: Record<string, unknown> = { address, city, country };

  // An explicit numeric lat/lng from the operator wins (a hand-nudged pin);
  // otherwise (or when they ask to re-geocode) derive the pin from the address.
  const hasManualPin =
    typeof body.lat === "number" && typeof body.lng === "number" && Number.isFinite(body.lat) && Number.isFinite(body.lng);
  if (hasManualPin && !body.regeocode) {
    patch.lat = body.lat;
    patch.lng = body.lng;
  } else {
    const geo = await geocodeAddress({ address, city, country });
    if (geo) {
      patch.lat = geo.lat;
      patch.lng = geo.lng;
      if (geo.country_code) patch.country_code = geo.country_code;
    } else if (hasManualPin) {
      patch.lat = body.lat;
      patch.lng = body.lng;
    } else {
      return NextResponse.json(
        { error: "Couldn't geocode that address — refine it or enter lat/lng manually." },
        { status: 422 }
      );
    }
  }

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  revalidateVenues();
  return NextResponse.json({ ok: true, lat: patch.lat, lng: patch.lng, address, city, country });
}
