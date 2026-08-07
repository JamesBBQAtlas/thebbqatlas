#!/usr/bin/env node
/**
 * Non-town city audit (enrichment neighbourhood-overwrite bug).
 *
 * Enrichment used to overwrite a correct submitted city (e.g. "Houston") with a
 * geocoder neighbourhood / civic-association label (e.g. "Washington Avenue
 * Coalition / Memorial Park"), corrupting the city + slug. That path is now
 * fixed in lib/admin/address.ts (bestSettlement + looksLikeSubLocality) and
 * lib/geo/geocode.ts (city from the municipality/place level, not neighbourhood).
 *
 * This one-off flags any EXISTING live venue whose stored `city` still looks like
 * a neighbourhood / civic-association / POI / region rather than a real town, so
 * the handful that slipped through before the fix can be corrected by hand (an
 * in-place admin edit of the city — no delete/resubmit needed).
 *
 * Usage:  NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *           node scripts/audit-nontown-cities.mjs
 * Exit 0 with a clean list; exit 1 if any suspect city is found.
 */

const SUBLOCALITY =
  /(\s\/\s)|\b(coalition|neighbou?rhood|super[-\s]*neighbou?rhood|(?:civic|residents?|homeowners?|home\s*owners?|property\s*owners?)\s*(?:association|assn)|civic\s*club|h\.?o\.?a\.?)\b/i;
const POI =
  /shopping\s*cent(?:re|er)|retail\s*park|outlet|\bmall\b|\bplaza\b|\barcade\b|\bstation\b|\bairport\b|\bterminal\b|\bprecinct\b|\bstadium\b|\bshopping\b/i;

function suspect(city) {
  if (!city) return null;
  if (SUBLOCALITY.test(city)) return "neighbourhood/association";
  if (POI.test(city)) return "POI/landmark";
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "audit-nontown-cities: SKIPPED (no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env)."
    );
    process.exit(0);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("restaurants")
    .select("id, name, city, slug, country, status")
    .order("city", { ascending: true });
  if (error) {
    console.error("audit-nontown-cities: query failed:", error.message);
    process.exit(1);
  }
  const bad = (data ?? [])
    .map((r) => ({ ...r, why: suspect(r.city) }))
    .filter((r) => r.why);
  if (bad.length === 0) {
    console.log(`✓ audit-nontown-cities: clean (${data?.length ?? 0} venues checked).`);
    process.exit(0);
  }
  console.log(`⚠ audit-nontown-cities: ${bad.length} venue(s) with a non-town city:\n`);
  for (const r of bad) {
    console.log(`  [${r.status}] ${r.name}`);
    console.log(`      city: "${r.city}"  (${r.why})`);
    console.log(`      slug: ${r.slug}  ·  ${r.country}  ·  id ${r.id}\n`);
  }
  console.log("Fix each with an in-place admin edit of the city (no delete/resubmit).");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
