import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  if (!restaurantId || !url || !storagePath) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
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
  });
  if (error) {
    return NextResponse.json({ error: "Could not register media" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
