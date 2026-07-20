import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ModerationConsole,
  type ReviewItem,
  type PhotoItem,
} from "@/components/admin/ModerationConsole";
import type { Submission } from "@/lib/types/database";

export const metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Access Denied
        </h1>
        <p className="mt-2 text-text-muted">
          Admin access required. Set your profile role to admin in Supabase.
        </p>
      </div>
    );
  }

  // Service-role client bypasses RLS for reliable admin reads.
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [subsRes, reviewsRes, photosRes] = await Promise.all([
    db
      .from("submissions")
      .select("*")
      .eq("moderation_status", "pending")
      .order("created_at", { ascending: true }),
    db
      .from("reviews")
      .select("*, restaurants(name, slug)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    db
      .from("review_photos")
      .select("*, reviews(restaurant_id, restaurants(name, slug))")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const submissions = (subsRes.data ?? []) as Submission[];

  // Attach reviewer display names in one extra query.
  const rawReviews = reviewsRes.data ?? [];
  const reviewerIds = [
    ...new Set(rawReviews.map((r) => r.user_id).filter(Boolean)),
  ];
  const nameById = new Map<string, string>();
  if (reviewerIds.length) {
    const { data: pf } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", reviewerIds);
    for (const p of pf ?? []) nameById.set(p.id, p.display_name ?? "Member");
  }

  const reviews: ReviewItem[] = rawReviews.map((r) => ({
    id: r.id,
    body: r.body,
    rating: r.rating,
    created_at: r.created_at,
    restaurantName: r.restaurants?.name,
    restaurantSlug: r.restaurants?.slug,
    reviewer: nameById.get(r.user_id) ?? "Member",
  }));

  const photos: PhotoItem[] = (photosRes.data ?? []).map((p) => ({
    id: p.id,
    url: p.url,
    created_at: p.created_at,
    restaurantName: p.reviews?.restaurants?.name,
    restaurantSlug: p.reviews?.restaurants?.slug,
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">
        Moderation Queue
      </h1>
      <p className="mb-8 text-text-muted">
        Review user-submitted spots, reviews, and photos.
      </p>
      <ModerationConsole
        submissions={submissions}
        reviews={reviews}
        photos={photos}
      />
    </div>
  );
}
