/**
 * Server-side geocoding via OpenStreetMap Nominatim. Used when creating a brand
 * new venue from a Grok lead so every location gets real map coordinates.
 * Nominatim's usage policy asks for ≤1 request/second and a valid User-Agent —
 * callers doing batches must throttle (see the batch create route).
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": "TheBBQAtlas/1.0 (hello@thebbqatlas.com)",
  Accept: "application/json",
};

export interface GeoResult {
  lat: number;
  lng: number;
  country_code: string | null;
  city: string | null;
  country: string | null;
}

export async function geocodeAddress(parts: {
  address?: string | null;
  city?: string | null;
  country?: string | null;
}): Promise<GeoResult | null> {
  const q = [parts.address, parts.city, parts.country]
    .filter((s) => s && String(s).trim())
    .join(", ");
  if (!q.trim()) return null;

  try {
    const res = await fetch(
      `${NOMINATIM}/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
      { headers: HEADERS }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const top = data[0];
    const lat = parseFloat(top.lat);
    const lng = parseFloat(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const addr = top.address ?? {};
    return {
      lat,
      lng,
      country_code: addr.country_code
        ? String(addr.country_code).toUpperCase()
        : null,
      city:
        addr.city ??
        addr.town ??
        addr.village ??
        addr.suburb ??
        parts.city ??
        null,
      country: addr.country ?? parts.country ?? null,
    };
  } catch {
    return null;
  }
}
