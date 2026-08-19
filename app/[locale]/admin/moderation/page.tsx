import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { domainMatchHint } from "@/lib/admin/claims";
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

  const [subsRes, reviewsRes, photosRes, claimsRes, mediaPhotosRes] = await Promise.all([
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
      .select("*, restaurants(name, slug, website)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // Part 3 — community venue photos land in `media` (kind='image'), NOT
    // `review_photos`, so they never reached this tab. Read the real pending images so
    // Moderation → Photos matches the Media tab's pending count.
    db
      .from("media")
      .select("id, url, created_at, restaurant_id, source")
      .eq("status", "pending")
      .eq("kind", "image")
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

  const reviewPhotos: PhotoItem[] = (photosRes.data ?? []).map((p) => ({
    id: p.id,
    url: p.url,
    created_at: p.created_at,
    restaurantName: p.reviews?.restaurants?.name,
    restaurantSlug: p.reviews?.restaurants?.slug,
    source: "review" as const,
  }));

  // Part 3 — resolve each community `media` photo's venue name in one query, then map
  // to the same PhotoItem shape (tagged source:"media" so approve/reject writes back to
  // `media`). This is what makes Moderation → Photos show the 22 pending venue uploads.
  const rawMediaPhotos = (mediaPhotosRes.data ?? []) as Array<{
    id: string; url: string; created_at: string; restaurant_id: string | null; source: string | null;
  }>;
  const mediaVenueIds = [...new Set(rawMediaPhotos.map((m) => m.restaurant_id).filter(Boolean))] as string[];
  const venueById = new Map<string, { name: string; slug: string }>();
  if (mediaVenueIds.length) {
    const { data: venues } = await db
      .from("restaurants")
      .select("id, name, slug")
      .in("id", mediaVenueIds);
    for (const v of venues ?? []) venueById.set(v.id, { name: v.name, slug: v.slug });
  }
  const mediaPhotos: PhotoItem[] = rawMediaPhotos.map((m) => ({
    id: m.id,
    url: m.url,
    created_at: m.created_at,
    restaurantName: m.restaurant_id ? venueById.get(m.restaurant_id)?.name : undefined,
    restaurantSlug: m.restaurant_id ? venueById.get(m.restaurant_id)?.slug : undefined,
    source: "media" as const,
  }));

  // One unified Photos queue — community venue uploads + review attachments — newest
  // first, so the tab count equals the true pending-photo total (Media tab parity).
  const photos: PhotoItem[] = [...mediaPhotos, ...reviewPhotos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const claims: ClaimModItem[] = (claimsRes.data ?? []).map((c) => ({
    id: c.id,
    role: c.role_requested,
    restaurantName: c.restaurants?.name,
    restaurantSlug: c.restaurants?.slug,
    note: c.note ?? undefined,
    contactEmail: c.contact_email ?? undefined,
    // Verification hint (Prompt 2a) — does the contact email sit on the venue's own
    // web domain? A hint for the reviewer, never an auto-decision.
    domainMatch: domainMatchHint(c.contact_email, c.restaurants?.website),
    created_at: c.created_at,
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
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
