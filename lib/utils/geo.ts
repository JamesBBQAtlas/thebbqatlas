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