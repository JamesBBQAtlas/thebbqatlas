/** Great-circle distance (metres) between two lat/lng points. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** US visitors → miles, everyone else → kilometres. */
export function prefersMiles(): boolean {
  return typeof navigator !== "undefined" && /US/i.test(navigator.language || "");
}

export function formatDistance(m: number): string {
  if (prefersMiles()) {
    const mi = m / 1609.34;
    return mi < 0.1 ? "0.1 mi" : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  const km = m / 1000;
  return km < 0.1 ? "0.1 km" : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
