import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { OwnerVenueEditor } from "@/components/account/OwnerVenueEditor";

export const metadata = { title: "My Venues" };
export const dynamic = "force-dynamic";

/**
 * Owner dashboard (Build Prompt 2b) — the venues a user owns (via restaurants.owner_id
 * OR an approved restaurant_claims row), each with a moderated accuracy editor. Owner
 * edits NEVER write live: they submit as pending changes an admin reviews. Hero photos
 * + product links (PREMIUM) arrive in later slices; this is the FREE accuracy surface.
 */

const FIELDS =
  "id, name, slug, status, description, phone, website, instagram_url, x_url, facebook_url, tiktok_url, youtube_url, hours";

interface OwnedVenue {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  phone: string | null;
  website: string | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  hours: Record<string, string> | null;
}

export default async function OwnerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/owner");

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  // Owned venues = owner_id link OR an approved claim (the two ownership sources).
  const [{ data: byOwner }, { data: claims }] = await Promise.all([
    db.from("restaurants").select(FIELDS).eq("owner_id", user.id),
    db.from("restaurant_claims").select("restaurant_id").eq("user_id", user.id).eq("status", "approved"),
  ]);
  const claimIds = [...new Set((claims ?? []).map((c) => c.restaurant_id).filter(Boolean))] as string[];
  const missing = claimIds.filter((id) => !(byOwner ?? []).some((v) => v.id === id));
  const byClaim = missing.length
    ? (await db.from("restaurants").select(FIELDS).in("id", missing)).data ?? []
    : [];
  const venues = [...((byOwner ?? []) as unknown as OwnedVenue[]), ...(byClaim as unknown as OwnedVenue[])];

  // Pending owner edits (to show a "changes awaiting review" note per venue).
  const pendingByVenue = new Set<string>();
  if (venues.length) {
    const { data: pend } = await db
      .from("suggestions")
      .select("restaurant_id")
      .eq("kind", "owner_edit")
      .eq("status", "pending")
      .eq("created_by", user.id)
      .in("restaurant_id", venues.map((v) => v.id));
    for (const p of pend ?? []) if (p.restaurant_id) pendingByVenue.add(p.restaurant_id);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">My Venues</h1>
      <p className="mb-8 text-text-muted">
        Keep your listing accurate. Edits are reviewed before they go live — you&apos;ll see them
        marked <span className="font-semibold text-amber-400">awaiting review</span> until an admin approves.
      </p>

      {venues.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          <p>You don&apos;t manage any venues yet.</p>
          <p className="mt-2 text-sm">
            Find your venue and choose <span className="font-semibold">“Own this business? Claim your listing”</span> —
            once an admin approves your claim it appears here.{" "}
            <Link href="/list" className="text-brand-gold hover:underline">Browse venues</Link>
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {venues.map((v) => (
            <OwnerVenueEditor
              key={v.id}
              venue={{
                id: v.id,
                name: v.name,
                slug: v.slug,
                description: v.description,
                phone: v.phone,
                website: v.website,
                instagram_url: v.instagram_url,
                x_url: v.x_url,
                facebook_url: v.facebook_url,
                tiktok_url: v.tiktok_url,
                youtube_url: v.youtube_url,
                hours: v.hours,
              }}
              hasPending={pendingByVenue.has(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
