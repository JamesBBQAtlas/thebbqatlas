import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDuplicate } from "@/lib/venues/dedupe-server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public soft duplicate-check for the Submit form (§ global dedupe guard). Given
 * a candidate name + optional location, returns the venues it might duplicate,
 * ranked with a reason + confidence. This only WARNS — it never blocks a
 * submission. Reads all venues via the service role so pending seeds count too.
 */
export async function POST(request: Request) {
  if (!(await rateLimit(`dupcheck:${clientIp(request)}`, 30, 300))) {
    return NextResponse.json({ matches: [] });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.slice(0, 200) : "";
  if (!name.trim()) return NextResponse.json({ matches: [] });

  const candidate = {
    name,
    address: typeof body.address === "string" ? body.address.slice(0, 300) : null,
    city: typeof body.city === "string" ? body.city.slice(0, 120) : null,
    lat: typeof body.lat === "number" ? body.lat : null,
    lng: typeof body.lng === "number" ? body.lng : null,
  };

  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();
  try {
    const matches = await checkDuplicate(db, candidate);
    return NextResponse.json({ matches });
  } catch {
    // Never let a dedupe hiccup block the form.
    return NextResponse.json({ matches: [] });
  }
}
