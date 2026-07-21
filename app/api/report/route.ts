import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCorrectionAck } from "@/lib/email/senders";

/**
 * Public "report a correction / closure" endpoint. Creates a pending
 * submission of type correction|closure tied to a target venue, which then
 * appears in the admin Corrections queue. Venue fields are copied from the
 * target so the submissions row satisfies its NOT NULL columns; the user's
 * message lives in `description`.
 */
export async function POST(request: Request) {
  let payload: {
    restaurantId?: string;
    submissionType?: "correction" | "closure";
    message?: string;
    email?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { restaurantId, submissionType, message, email } = payload;
  const kind = submissionType === "closure" ? "closure" : "correction";
  const trimmed = (message ?? "").trim();

  if (!restaurantId || trimmed.length < 3 || trimmed.length > 2000) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : await createClient();

  const { data: target } = await admin
    .from("restaurants")
    .select("name, description, style, lat, lng, address, city, country, website")
    .eq("id", restaurantId)
    .single();

  if (!target) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const { error } = await admin.from("submissions").insert({
    name: target.name,
    description: trimmed,
    style: target.style,
    lat: target.lat,
    lng: target.lng,
    address: target.address,
    city: target.city,
    country: target.country,
    website: target.website,
    submission_type: kind,
    target_restaurant_id: restaurantId,
    contact_email: email?.trim() || null,
    moderation_status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: "Could not file report" }, { status: 500 });
  }

  // Acknowledge to the reporter if they left an email (transactional).
  const ackEmail = email?.trim();
  if (ackEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ackEmail)) {
    await sendCorrectionAck({ to: ackEmail, venueName: target.name });
  }

  return NextResponse.json({ ok: true });
}
