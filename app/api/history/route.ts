import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TYPES = new Set(["venue", "guide", "news"]);

/**
 * Record that the signed-in user viewed something (venue/guide/news). Deduped
 * per user+entity; repeat views just bump viewed_at. Silently no-ops for
 * signed-out visitors so it's safe to fire from every page.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true }); // anonymous: nothing to store

  const body = await request.json().catch(() => ({}));
  const entityType = String(body.entityType ?? "");
  const entityId = String(body.entityId ?? "");
  if (!TYPES.has(entityType) || !entityId) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await supabase.from("view_history").upsert(
    {
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      title: body.title ? String(body.title).slice(0, 200) : null,
      slug: body.slug ? String(body.slug).slice(0, 200) : null,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entity_type,entity_id" }
  );

  return NextResponse.json({ ok: true });
}
