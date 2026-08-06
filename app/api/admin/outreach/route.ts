import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

const CHANNELS = new Set(["instagram", "email", "facebook", "phone", "website", "other"]);
const STATUSES = new Set([
  "none",
  "to_contact",
  "contacted",
  "awaiting_reply",
  "info_received",
  "declined",
  "resolved",
]);

/**
 * Outreach Hub writes. Everything goes through the service-role client (the
 * outreach_log table + the restaurants outreach fields are admin-only, RLS-locked).
 *
 * POST  = log an outreach touch: one outreach_log row per channel hit, then
 *         advance outreach_status (default → 'contacted') and set a follow-up date.
 * PATCH = adjust state without logging a touch: outreach_status, contact_email,
 *         and/or the next follow-up date.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "").trim();
  const channels: string[] = Array.isArray(body.channels)
    ? body.channels.map(String).filter((c: string) => CHANNELS.has(c))
    : [];
  const direction = body.direction === "in" ? "in" : "out";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) || null : null;
  const followupAt =
    typeof body.followupAt === "string" && body.followupAt ? body.followupAt : null;
  const status =
    typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "contacted";

  if (!restaurantId || channels.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one channel to log." },
      { status: 400 }
    );
  }

  const rows = channels.map((channel) => ({
    restaurant_id: restaurantId,
    channel,
    direction,
    note,
    created_by: ctx.userId,
  }));
  const { error: logErr } = await ctx.db.from("outreach_log").insert(rows);
  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  const patch: Record<string, unknown> = { outreach_status: status };
  // Only overwrite the follow-up date when the caller sent one (null clears it
  // explicitly via PATCH, not here).
  if (body.followupAt !== undefined) patch.outreach_next_followup_at = followupAt;
  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, logged: rows.length, status });
}

export async function PATCH(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "").trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    patch.outreach_status = body.status;
  }
  if (body.contactEmail !== undefined) {
    const email = String(body.contactEmail ?? "").trim();
    patch.contact_email = email
      ? email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
        ? email.toLowerCase()
        : null
      : null;
    if (email && patch.contact_email === null) {
      return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    }
  }
  if (body.followupAt !== undefined) {
    patch.outreach_next_followup_at =
      typeof body.followupAt === "string" && body.followupAt ? body.followupAt : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
