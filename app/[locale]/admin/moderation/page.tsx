import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ModerationConsole,
  type ReviewItem,
  type PhotoItem,
  type CorrectionItem,
  type ClaimModItem,
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

  const [subsRes, reviewsRes, photosRes, claimsRes] = await Promise.all([
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
    db
      .from("restaurant_claims")
      .select("*, restaurants(name, slug)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const allSubs = (subsRes.data ?? []) as Submission[];
  // Submitter provenance (IP / country) captured by the guarded submit endpoint —
  // shown on each card, no Submission-type change needed.
  const subMeta: Record<string, { country: string | null; ip: string | null }> = {};
  for (const raw of (subsRes.data ?? []) as Array<Record<string, unknown>>) {
    subMeta[String(raw.id)] = {
      country: (raw.submitter_country as string) ?? null,
      ip: (raw.submitter_ip as string) ?? null,
    };
  }
  // Anti-spam intel: how many automated attempts we've dropped lately (operator
  // awareness + future Cloudflare rule-building).
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count: spamBlocked7d } = await db
    .from("submission_abuse_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);
  const submissions = allSubs.filter(
    (s) => (s.submission_type ?? "new_venue") === "new_venue"
  );
  const correctionSubs = allSubs.filter(
    (s) => (s.submission_type ?? "new_venue") !== "new_venue"
  );

  // Resolve target venue names for corrections/closures.
  const targetIds = [
    ...new Set(correctionSubs.map((s) => s.target_restaurant_id).filter(Boolean)),
  ] as string[];
  const targetById = new Map<string, { name: string; slug: string }>();
  if (targetIds.length) {
    const { data: targets } = await db
      .from("restaurants")
      .select("id, name, slug")
      .in("id", targetIds);
    for (const t of targets ?? []) targetById.set(t.id, { name: t.name, slug: t.slug });
  }
  // Resolve the venue each flagged submission may duplicate (for the flag link).
  const dupIds = [
    ...new Set(submissions.map((s) => s.possible_duplicate_of).filter(Boolean)),
  ] as string[];
  const dupTargets: Record<string, { name: string; slug: string }> = {};
  if (dupIds.length) {
    const { data: dupRows } = await db
      .from("restaurants")
      .select("id, name, slug")
      .in("id", dupIds);
    const byId = new Map((dupRows ?? []).map((r) => [r.id, { name: r.name, slug: r.slug }]));
    for (const s of submissions) {
      if (s.possible_duplicate_of && byId.has(s.possible_duplicate_of)) {
        dupTargets[s.id] = byId.get(s.possible_duplicate_of)!;
      }
    }
  }

  const corrections: CorrectionItem[] = correctionSubs.map((s) => ({
    id: s.id,
    kind: (s.submission_type ?? "correction") as "correction" | "closure",
    message: s.description,
    created_at: s.created_at,
    contactEmail: s.contact_email ?? undefined,
    targetName: s.target_restaurant_id
      ? targetById.get(s.target_restaurant_id)?.name
      : undefined,
    targetSlug: s.target_restaurant_id
      ? targetById.get(s.target_restaurant_id)?.slug
      : undefined,
  }));

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

  const claims: ClaimModItem[] = (claimsRes.data ?? []).map((c) => ({
    id: c.id,
    role: c.role_requested,
    restaurantName: c.restaurants?.name,
    restaurantSlug: c.restaurants?.slug,
    note: c.note ?? undefined,
    contactEmail: c.contact_email ?? undefined,
    created_at: c.created_at,
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
        corrections={corrections}
        claims={claims}
        reviews={reviews}
        photos={photos}
        dupTargets={dupTargets}
        subMeta={subMeta}
        spamBlocked7d={spamBlocked7d ?? 0}
      />
    </div>
  );
}
