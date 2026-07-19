import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { restaurantId, action } = await request.json();

  if (!restaurantId || !["save", "unsave"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (action === "save") {
    const { error } = await supabase.from("saved_spots").upsert(
      { user_id: user.id, restaurant_id: restaurantId },
      { onConflict: "user_id,restaurant_id", ignoreDuplicates: true }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ saved: true });
  }

  const { error } = await supabase
    .from("saved_spots")
    .delete()
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}