import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";

const TYPES = new Set(["guide", "news"]);

/** GET ?entityType&entityId → { bookmarked }. False for signed-out visitors. */
export async function GET(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ bookmarked: false });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType") ?? "";
  const entityId = searchParams.get("entityId") ?? "";
  if (!TYPES.has(entityType) || !entityId) {
    return NextResponse.json({ bookmarked: false });
  }

  const { data } = await auth.db
    .from("bookmarks")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  return NextResponse.json({ bookmarked: Boolean(data) });
}

/** POST — save a bookmark (idempotent per user+entity). */
export async function POST(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const entityType = String(body.entityType ?? "");
  const entityId = String(body.entityId ?? "");
  if (!TYPES.has(entityType) || !entityId) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { error } = await auth.db.from("bookmarks").upsert(
    {
      user_id: auth.userId,
      entity_type: entityType,
      entity_id: entityId,
      title: body.title ? String(body.title).slice(0, 200) : null,
      slug: body.slug ? String(body.slug).slice(0, 200) : null,
    },
    { onConflict: "user_id,entity_type,entity_id" }
  );
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true, bookmarked: true });
}

/** DELETE ?entityType&entityId — remove a bookmark. */
export async function DELETE(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType") ?? "";
  const entityId = searchParams.get("entityId") ?? "";
  if (!TYPES.has(entityType) || !entityId) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await auth.db
    .from("bookmarks")
    .delete()
    .eq("user_id", auth.userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  return NextResponse.json({ ok: true, bookmarked: false });
}
