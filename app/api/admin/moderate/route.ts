import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { restaurantSlug } from "@/lib/utils/slug";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId, action } = await request.json();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data: submission } = await admin
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "approve") {
    const slug = restaurantSlug(submission.name, submission.city);
    await admin.from("restaurants").insert({
      slug,
      name: submission.name,
      description: submission.description,
      style: submission.style,
      lat: submission.lat,
      lng: submission.lng,
      address: submission.address,
      city: submission.city,
      country: submission.country,
      website: submission.website,
      hero_image_url: submission.hero_image_url ?? "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
      price_level: 2,
      avg_rating: 0,
      review_count: 0,
      is_featured: false,
      status: "approved",
    });
    await admin
      .from("submissions")
      .update({ moderation_status: "approved" })
      .eq("id", submissionId);
  } else {
    await admin
      .from("submissions")
      .update({ moderation_status: "rejected" })
      .eq("id", submissionId);
  }

  return NextResponse.json({ ok: true });
}