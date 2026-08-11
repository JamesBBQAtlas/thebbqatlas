/**
 * geocode-fix — the manual-pin lock decisions, as PURE functions so the
 * "a hand-placed pin survives a re-enrich, and only an explicit re-geocode
 * clears the lock" behaviour is unit-testable without a DB or the network.
 * Both the edit route (which sets the lock) and the enrich / ops paths (which
 * must respect it) call these, so the test exercises the real logic.
 */

/** A pin is "real" — finite and not the (0,0) null-island sentinel. */
export function isRealPin(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  );
}

/**
 * Edit route — what should a save do to `geo_locked`?
 *   • a hand-placed pin that is NOT being re-geocoded → LOCK it (true);
 *   • an explicit "re-geocode from address" → CLEAR the lock (false);
 *   • otherwise → leave it as-is (null = don't write the column).
 * Mirrors how `manual_copy` protects hand-edited copy.
 */
export function pinLockOnEdit(hasManualPin: boolean, regeocode: boolean): boolean | null {
  if (regeocode) return false; // deliberate re-geocode releases the lock
  if (hasManualPin) return true; // a hand-placed pin is sacred → lock it
  return null; // no manual pin, no re-geocode → no change
}

/**
 * Enrich / update-details / ops-refresh — must we KEEP the stored pin and skip
 * re-geocoding it? True only when the pin is locked AND real; a locked row with
 * no real pin (shouldn't happen) still falls through to a normal geocode.
 */
export function shouldKeepLockedPin(
  geoLocked: boolean | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  return Boolean(geoLocked) && isRealPin(lat, lng);
}
