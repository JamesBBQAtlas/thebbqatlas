export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Is `pt` a geographic OUTLIER for a brand's footprint (patch 0074)? True only when the
 * footprint has enough points to trust (`minFootprint`) AND no OTHER footprint point
 * lies within `isolationKm` of `pt` — i.e. it's a lone island with no nearby sibling
 * (a "Miramar Beach, FL" entry on a West-Texas brand's page). A normal branch always
 * has a nearby sibling, so it's never an outlier; a tiny roster is never judged. `pt`'s
 * own coordinate is expected to be present in `footprint` and is excluded by distance.
 */
export function isFootprintOutlier(
  pt: { lat: number; lng: number },
  footprint: { lat: number; lng: number }[],
  opts?: { minFootprint?: number; isolationKm?: number }
): boolean {
  const minFootprint = opts?.minFootprint ?? 4;
  const isolationKm = opts?.isolationKm ?? 600;
  if (footprint.length < minFootprint) return false;
  const hasNearbySibling = footprint.some((p) => {
    const d = haversineKm(p.lat, p.lng, pt.lat, pt.lng);
    return d > 0.01 && d <= isolationKm; // not itself, and within the region
  });
  return !hasNearbySibling;
}

export function findNearby<T extends { lat: number; lng: number }>(
  items: T[],
  lat: number,
  lng: number,
  limit = 6,
  maxKm = 50
): T[] {
  return items
    .map((item) => ({
      item,
      distance: haversineKm(lat, lng, item.lat, item.lng),
    }))
    .filter(({ distance }) => distance <= maxKm && distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ item }) => item);
}