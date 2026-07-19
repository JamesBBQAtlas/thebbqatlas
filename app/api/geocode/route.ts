import { NextResponse } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": "TheBBQAtlas/1.0 (hello@thebbqatlas.com)",
  Accept: "application/json",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  try {
    if (q) {
      const url = `${NOMINATIM}/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: HEADERS });
      const data = await res.json();
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