import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";

export async function POST(request: Request) {
  // Cookie OR Bearer auth so native clients can save too (Phase 8d).
  const auth = await getRequestUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { restaurantId, action } = body;

  if (!restaurantId || !["save", "unsave"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (action === "save") {
    const { error } = await auth.db.from("saved_spots").upsert(
      { user_id: auth.userId, restaurant_id: restaurantId },
      { onConflict: "user_id,restaurant_id", ignoreDuplicates: true }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ saved: true });
  }

  const { error } = await auth.db
    .from("saved_spots")
    .delete()
    .eq("user_id", auth.userId)
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}