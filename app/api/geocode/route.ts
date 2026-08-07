import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": "TheBBQAtlas/1.0 (hello@thebbqatlas.com)",
  Accept: "application/json",
  "Accept-Language": "en",
};

// A bare 5-digit (or ZIP+4) string — treat as a US ZIP by default, since the
// audience is US-centric and Nominatim otherwise matches 5-digit codes abroad.
const US_ZIP = /^\d{5}(-\d{4})?$/;

async function nominatim(path: string) {
  const res = await fetch(`${NOMINATIM}${path}`, { headers: HEADERS });
  return res.json();
}

export async function GET(request: Request) {
  // Rate limit: 30 lookups per IP per minute (proxies external Nominatim). This
  // route hits a paid external quota, so it's fail-closed — a limiter outage
  // denies rather than letting an abuser run the bill up (Fable M-4).
  if (!(await rateLimit(`geocode:${clientIp(request)}`, 30, 60, { failClosed: true }))) {
    return NextResponse.json(
      { error: "Too many lookups — please slow down." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  try {
    if (q) {
      const trimmed = q.trim();

      // US ZIP codes take priority: structured postalcode lookup, US-only.
      if (US_ZIP.test(trimmed)) {
        const zip5 = trimmed.slice(0, 5);
        let data = await nominatim(
          `/search?format=json&addressdetails=1&limit=5&countrycodes=us&postalcode=${zip5}`
        );
        // Fall back to a US-scoped free-text search if the structured one is empty.
        if (!Array.isArray(data) || data.length === 0) {
          data = await nominatim(
            `/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=${zip5}`
          );
        }
        return NextResponse.json(data);
      }

      const data = await nominatim(
        `/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(trimmed)}`
      );
      return NextResponse.json(data);
    }

    if (lat && lng) {
      // Validate as real coordinates before interpolating into the upstream URL
      // (param injection guard, Fable Low) — and pass the parsed numbers, never
      // the raw strings.
      const latN = Number(lat);
      const lngN = Number(lng);
      if (
        !Number.isFinite(latN) ||
        !Number.isFinite(lngN) ||
        Math.abs(latN) > 90 ||
        Math.abs(lngN) > 180
      ) {
        return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
      }
      const url = `${NOMINATIM}/reverse?format=json&addressdetails=1&lat=${latN}&lon=${lngN}`;
      const res = await fetch(url, { headers: HEADERS });
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Provide q or lat/lng" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}