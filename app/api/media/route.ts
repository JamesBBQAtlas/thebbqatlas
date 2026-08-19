import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_PENDING_PER_VENUE_PER_DAY } from "@/lib/media/upload-limits";

/**
 * Register an uploaded file as a PENDING media row. The bytes are already in
 * the `media` storage bucket (uploaded client-side to the user's own folder);
 * this records it against a venue for moderation. RLS ensures a user can only
 * insert rows owned by themselves.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const url = String(body.url ?? "");
  const storagePath = String(body.path ?? "");
  const kind = body.kind === "video" ? "video" : "image";
  const source = typeof body.source === "string" ? body.source.slice(0, 40) : "upload";
  const caption =
    typeof body.caption === "string" ? body.caption.trim().slice(0, 300) || null : null;
  // Rights/ownership attestation (Prompt 4) — the uploader must affirm they own the
  // photo or have the right to post it. Enforced server-side, not just in the UI.
  const rightsAttested = body.rightsAttested === true;

  if (!restaurantId || !url || !storagePath) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!rightsAttested) {
    return NextResponse.json(
      { error: "Please confirm you own this photo or have the right to post it." },
      { status: 400 }
    );
  }

  // Abuse rail (Part 5) — the client caps a single upload at 15, but that's
  // bypassable, so bound how many PENDING photos one user can stack on one venue per
  // day server-side. Everything still lands pending → moderation regardless.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentPending } = await supabase
    .from("media")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .gte("created_at", dayAgo);
  if ((recentPending ?? 0) >= MAX_PENDING_PER_VENUE_PER_DAY) {
    return NextResponse.json(
      { error: "You've reached today's photo limit for this venue — thanks! Your earlier uploads are awaiting review." },
      { status: 429 }
    );
  }

  const { error } = await supabase.from("media").insert({
    user_id: user.id,
    restaurant_id: restaurantId,
    kind,
    storage_path: storagePath,
    url,
    caption,
    source,
    status: "pending",
    rights_attested: true,
    rights_attested_at: new Date().toISOString(),
    // safety_status defaults to 'unchecked'; screened by the admin queue / weekly cron.
  });
  if (error) {
    return NextResponse.json({ error: "Could not register media" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
