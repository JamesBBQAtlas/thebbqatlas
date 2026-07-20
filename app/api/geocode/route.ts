import { NextResponse } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": "TheBBQAtlas/1.0 (hello@thebbqatlas.com)",
  Accept: "application/json",
};

// A bare 5-digit (or ZIP+4) string — treat as a US ZIP by default, since the
// audience is US-centric and Nominatim otherwise matches 5-digit codes abroad.
const US_ZIP = /^\d{5}(-\d{4})?$/;

async function nominatim(path: string) {
  const res = await fetch(`${NOMINATIM}${path}`, { headers: HEADERS });
  return res.json();
}

export async function GET(request: Request) {
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
      const url = `${NOMINATIM}/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: HEADERS });
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Provide q or lat/lng" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}