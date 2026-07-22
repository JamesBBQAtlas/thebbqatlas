import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { restaurantSlug } from "@/lib/utils/slug";
import { resolveCountryCode } from "@/lib/constants/countries";
import { safeVenueImage } from "@/lib/restaurants/image";
import { sendModerationOutcome } from "@/lib/email/senders";

type ModType = "submission" | "review" | "photo";
type Action = "approve" | "reject";

/** Resolve who to email about a submission's outcome (best-effort). */
async function submitterEmail(
  admin: SupabaseClient,
  submission: { contact_email?: string | null; submitted_by?: string | null }
): Promise<string | null> {
  if (submission.contact_email) return submission.contact_email;
  if (submission.submitted_by) {
    try {
      const { data } = await admin.auth.admin.getUserById(submission.submitted_by);
      return data?.user?.email ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Recompute a restaurant's review aggregates from its approved reviews. */
async function recomputeReviewStats(admin: SupabaseClient, restaurantId: string) {
  const { data } = await admin
    .from("reviews")
    .select("rating")
    .eq("restaurant_id", restaurantId)
    .eq("status", "approved");
  const ratings = (data ?? [])
    .map((r) => r.rating)
    .filter((n): n is number => typeof n === "number");
  const count = ratings.length;
  const avg = count ? ratings.reduce((a, b) => a + b, 0) / count : 0;
  await admin
    .from("restaurants")
    .update({ review_count: count, avg_rating: Number(avg.toFixed(2)) })
    .eq("id", restaurantId);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Back-compat: older client sent { submissionId, action }.
  const type: ModType = body.type ?? (body.submissionId ? "submission" : "submission");
  const id: string = body.id ?? body.submissionId;
  const action: Action = body.action;
  const notes: string | undefined = body.notes;

  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  try {
    if (type === "submission") {
      const { data: submission } = await admin
        .from("submissions")
        .select("*")
        .eq("id", id)
        .single();
      if (!submission) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const kind = submission.submission_type ?? "new_venue";

      if (action === "reject") {
        await admin
          .from("submissions")
          .update({ moderation_status: "rejected", admin_notes: notes ?? null })
          .eq("id", id);
        const to = await submitterEmail(admin, submission);
        if (to) {
          await sendModerationOutcome({
            to,
            venueName: submission.name,
            approved: false,
            kind,
            notes,
          });
        }
        return NextResponse.json({ ok: true });
      }

      // Approve — behaviour depends on the kind of submission.
      if (kind === "new_venue") {
        await admin.from("restaurants").insert({
          slug: restaurantSlug(submission.name, submission.city),
          name: submission.name,
          description: submission.description,
          style: submission.style,
          lat: submission.lat,
          lng: submission.lng,
          address: submission.address,
          city: submission.city,
          country: submission.country,
          country_code: resolveCountryCode(null, submission.country),
          website: submission.website,
          // Copyright-safe: never seed a stock hero. Approved venues start with
          // no hero (branded placeholder) unless an approved photo exists.
          hero_image_url: safeVenueImage(submission.hero_image_url),
          price_level: 2,
          avg_rating: 0,
          review_count: 0,
          is_featured: false,
          status: "approved",
        });
      } else if (kind === "closure" && submission.target_restaurant_id) {
        // Approving a closure report marks the target venue permanently closed.
        await admin
          .from("restaurants")
          .update({ permanently_closed: true })
          .eq("id", submission.target_restaurant_id);
      }
      // For a generic "correction" we simply mark it resolved; an admin applies
      // the specific edit to the venue directly.

      await admin
        .from("submissions")
        .update({ moderation_status: "approved" })
        .eq("id", id);
      const to = await submitterEmail(admin, submission);
      if (to) {
        await sendModerationOutcome({
          to,
          venueName: submission.name,
          approved: true,
          kind,
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "review") {
      const { data: review } = await admin
        .from("reviews")
        .select("id, restaurant_id")
        .eq("id", id)
        .single();
      if (!review) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await admin
        .from("reviews")
        .update({ status: action === "approve" ? "approved" : "rejected" })
        .eq("id", id);
      if (review.restaurant_id) {
        await recomputeReviewStats(admin, review.restaurant_id);
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "photo") {
      await admin
        .from("review_photos")
        .update({ status: action === "approve" ? "approved" : "rejected" })
        .eq("id", id);
      return NextResponse.json({ ok: true });
    }

    if (type === "claim") {
      const { data: claim } = await admin
        .from("restaurant_claims")
        .select("id, restaurant_id, user_id, role_requested")
        .eq("id", id)
        .single();
      if (!claim) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await admin
        .from("restaurant_claims")
        .update({ status: action === "approve" ? "approved" : "rejected" })
        .eq("id", id);
      if (action === "approve") {
        // Record ownership on the venue and set the user's account type.
        await admin
          .from("restaurants")
          .update({ owner_id: claim.user_id })
          .eq("id", claim.restaurant_id);
        await admin
          .from("profiles")
          .upsert(
            {
              id: claim.user_id,
              account_type:
                claim.role_requested === "seller" ? "seller" : "owner",
            },
            { onConflict: "id" }
          );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Moderation failed" },
      { status: 500 }
    );
  }
}
