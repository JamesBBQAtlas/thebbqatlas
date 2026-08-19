/* Owner map-pin correction (Build Prompt 2 addendum) — coordinate validation +
 * the far-move sanity threshold. Pure.
 * Run: node_modules/.bin/tsx scripts/test-owner-pin.mts
 */
import { validCoord, PIN_FAR_KM } from "../app/api/owner/venues/pin/route";
import { haversineKm } from "../lib/utils/geo";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[validCoord — accepts real points, rejects junk]");
{
  ok("accepts a real US point", JSON.stringify(validCoord(33.51, -102.0)) === JSON.stringify({ lat: 33.51, lng: -102.0 }));
  ok("accepts numeric strings", JSON.stringify(validCoord("40.05", "-83.07")) === JSON.stringify({ lat: 40.05, lng: -83.07 }));
  ok("REJECTS null island (0,0)", validCoord(0, 0) === null);
  ok("REJECTS out-of-range lat", validCoord(120, -83) === null);
  ok("REJECTS out-of-range lng", validCoord(40, 200) === null);
  ok("REJECTS NaN / non-numeric", validCoord("x", 10) === null && validCoord(undefined, undefined) === null);
}

console.log("\n[far-move sanity — >50 km from the current pin is flagged]");
{
  const cur = { lat: 33.51, lng: -102.0 };          // Wolfforth TX
  const near = { lat: 33.58, lng: -101.85 };        // Lubbock (~15 km)
  const farFL = { lat: 30.38, lng: -86.12 };        // Miramar Beach FL (~1300 km)
  const dNear = haversineKm(cur.lat, cur.lng, near.lat, near.lng);
  const dFar = haversineKm(cur.lat, cur.lng, farFL.lat, farFL.lng);
  ok("PIN_FAR_KM is 50", PIN_FAR_KM === 50);
  ok("a nearby correction is NOT flagged far", dNear <= PIN_FAR_KM);
  ok("a cross-state jump IS flagged far", dFar > PIN_FAR_KM, { dFar });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
