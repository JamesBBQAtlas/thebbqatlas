import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * #61 — venue owner "confirm your details" flow. Driven by an outreach email
 * link: the owner reviews their listing and either confirms it's correct or
 * submits a correction. Public (venue details are public anyway), rate-limited.
 * Both outcomes advance the Outreach Hub (outreach_status='info_received' + an
 * outreach_log entry); a correction also files a normal moderation submission.
 */
export async function POST(request: Request) {
  if (!(await rateLimit(`confirm-details:${clientIp(request)}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const slug = String(body.slug ?? "").trim();
  const action = body.action === "correct" ? "correct" : "confirm";
  const email = String(body.email ?? "").trim().toLowerCase();
  const message = String(body.message ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (action === "correct" && (message.length < 3 || message.length > 2000)) {
    return NextResponse.json({ error: "Tell us what needs fixing (a few words)." }, { status: 400 });
  }

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();

  const { data: venue } = await admin
    .from("restaurants")
    .select("id, name, description, style, lat, lng, address, city, country, website")
    .eq("slug", slug)
    .single();
  if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

  const nowIso = new Date().toISOString();

  if (action === "confirm") {
    await admin
      .from("restaurants")
      .update({
        details_confirmed_at: nowIso,
        details_confirmed_email: email || null,
        outreach_status: "info_received",
        // Part 5 — the venue owner verified their details; record the touch.
        updated_at: nowIso,
        updated_by_actor: "owner",
      })
      .eq("id", venue.id);
    await admin.from("outreach_log").insert({
      restaurant_id: venue.id,
      channel: "confirm_page",
      direction: "inbound",
      contacted_at: nowIso,
      note: `Owner confirmed the listing is correct${email ? ` (${email})` : ""}.`,
    });
    return NextResponse.json({ ok: true, confirmed: true });
  }

  // action === "correct": file a correction submission for moderation + log it.
  await admin.from("submissions").insert({
    name: venue.name,
    description: message,
    style: venue.style,
    lat: venue.lat,
    lng: venue.lng,
    address: venue.address,
    city: venue.city,
    country: venue.country,
    website: venue.website,
    submission_type: "correction",
    target_restaurant_id: venue.id,
    contact_email: email || null,
    moderation_status: "pending",
  });
  await admin
    .from("restaurants")
    .update({ outreach_status: "info_received" })
    .eq("id", venue.id);
  await admin.from("outreach_log").insert({
    restaurant_id: venue.id,
    channel: "confirm_page",
    direction: "inbound",
    contacted_at: nowIso,
    note: `Owner submitted a correction${email ? ` (${email})` : ""}: ${message.slice(0, 300)}`,
  });

  return NextResponse.json({ ok: true, corrected: true });
}
