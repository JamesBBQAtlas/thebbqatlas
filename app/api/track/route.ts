import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set([
  "affiliate",
  "website",
  "phone",
  "email",
  "instagram",
  "map",
  "share",
  "save",
]);

/**
 * Append-only click capture. Fire-and-forget from the browser (sendBeacon).
 * Inserts into click_events under the caller's session (anon or authenticated);
 * RLS allows the insert. Never throws back to the client.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventType = String(body.event_type ?? "").slice(0, 32);
  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const str = (v: unknown, max: number) =>
    v == null ? null : String(v).slice(0, max);

  const row = {
    event_type: eventType,
    restaurant_id: (body.restaurant_id as string) ?? null,
    partner: str(body.partner, 48),
    target_url: str(body.target_url, 2048),
    page_path: str(body.page_path, 512),
    subtag: str(body.subtag, 120),
  };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("click_events").insert({ ...row, user_id: user?.id ?? null });
  } catch {
    /* swallow — telemetry must not error */
  }

  return NextResponse.json({ ok: true });
}
