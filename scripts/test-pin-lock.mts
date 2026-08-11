/**
 * Regression coverage (post-cleanup item 2) for the manual-pin lock — the exact
 * behaviour PM couldn't exercise live (no hand-placed pin existed yet):
 *   • an admin-set pin locks;
 *   • a locked pin SURVIVES a re-enrich / update-details (coords untouched);
 *   • an explicit "re-geocode from address" CLEARS the lock.
 * Pure logic, no DB. Run: npm run test:pin-lock
 */
import { pinLockOnEdit, shouldKeepLockedPin, isRealPin } from "../lib/geo/pin-lock";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log("\n[pinLockOnEdit — the admin edit route's lock decision]");
ok("hand-placed pin, not re-geocoding → LOCK", pinLockOnEdit(true, false) === true);
ok("explicit re-geocode → CLEAR the lock", pinLockOnEdit(true, true) === false);
ok("re-geocode with no manual pin → CLEAR the lock", pinLockOnEdit(false, true) === false);
ok("no manual pin, no re-geocode → no change (null)", pinLockOnEdit(false, false) === null);

console.log("\n[shouldKeepLockedPin — enrich / update-details / ops must skip a locked pin]");
ok("locked + real pin → KEEP (survives re-enrich)", shouldKeepLockedPin(true, 51.5401, -0.1374) === true);
ok("NOT locked → do not keep (enrich may re-geocode)", shouldKeepLockedPin(false, 51.5401, -0.1374) === false);
ok("locked but pin is 0,0 → do not keep (no real pin to protect)", shouldKeepLockedPin(true, 0, 0) === false);
ok("locked but pin is null → do not keep", shouldKeepLockedPin(true, null, null) === false);

console.log("\n[end-to-end lock lifecycle, modelled on the routes]");
{
  // 1. Admin drops a pin and saves (no re-geocode) → the edit route locks it.
  const locked = pinLockOnEdit(/*hasManualPin*/ true, /*regeocode*/ false);
  ok("admin-set pin → geo_locked becomes true", locked === true);

  // 2. A later enrich runs on that row (geo_locked=true, real coords). The
  //    enrich path must keep the coordinates — assert it decides to skip.
  const rowLat = 51.5401, rowLng = -0.1374;
  const keptDuringEnrich = shouldKeepLockedPin(locked === true, rowLat, rowLng);
  ok("re-enrich keeps the locked coords (unchanged)", keptDuringEnrich === true);
  // The pin the enrich would store IS the row's pin (never re-geocoded).
  const storedLat = keptDuringEnrich ? rowLat : /* would re-geocode */ NaN;
  ok("locked coords are exactly the admin's pin after enrich", storedLat === rowLat);

  // 3. Operator hits "re-geocode from address" → the lock clears.
  const afterRegeocode = pinLockOnEdit(/*hasManualPin*/ false, /*regeocode*/ true);
  ok("re-geocode-from-address clears the lock", afterRegeocode === false);
  // 4. Now unlocked → a subsequent enrich is free to re-geocode.
  ok("once unlocked, enrich no longer force-keeps the pin", shouldKeepLockedPin(afterRegeocode === true, rowLat, rowLng) === false);
}

console.log("\n[isRealPin]");
ok("finite non-zero → real", isRealPin(51.5, -0.1) === true);
ok("0,0 sentinel → not real", isRealPin(0, 0) === false);
ok("null → not real", isRealPin(null, null) === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
