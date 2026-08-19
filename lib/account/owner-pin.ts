// Owner map-pin correction — pure helpers (Build Prompt 2 addendum).
// These live in a lib module (not the route file) because a Next.js App Router
// `route.ts` may only export HTTP handlers + segment config; exporting anything
// else fails the production build. Keeping them here lets the route AND the test
// import them without violating that rule.

/** A proposed pin more than this from the current pin is flagged for the admin as
 *  implausible (never auto-applied — the admin always confirms). */
export const PIN_FAR_KM = 50;

/** Validate/normalise a proposed coordinate. Rejects non-numeric, out-of-range,
 *  and (0,0) "null island". Returns the clean {lat,lng} or null. */
export function validCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = typeof lat === "number" ? lat : Number(lat);
  const ln = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  if (la === 0 && ln === 0) return null; // null island
  return { lat: la, lng: ln };
}
