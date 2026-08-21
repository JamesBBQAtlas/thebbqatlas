import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { OwnerVenueEditor } from "@/components/account/OwnerVenueEditor";
import { OwnerPinEditor } from "@/components/account/OwnerPinEditor";
import { OwnerHeroPicker } from "@/components/account/OwnerHeroPicker";
import { VenueCompleteness } from "@/components/account/VenueCompleteness";
import { hasPageControl } from "@/lib/account/listing";
import { Lock } from "lucide-react";

export const metadata = { title: "My Venues" };
export const dynamic = "force-dynamic";

/**
 * Owner dashboard (Build Prompt 2b) — the venues a user owns (via restaurants.owner_id
 * OR an approved restaurant_claims row), each with a moderated accuracy editor. Owner
 * edits NEVER write live: they submit as pending changes an admin reviews. Hero photos
 * + product links (PREMIUM) arrive in later slices; this is the FREE accuracy surface.
 */

const FIELDS =
  "id, name, slug, status, description, phone, website, instagram_url, x_url, facebook_url, tiktok_url, youtube_url, shop_url, tickets_url, gift_card_url, order_url, hours, lat, lng, hero_image_url, listing_tier, listing_until";

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
  shop_url: string | null;
  tickets_url: string | null;
  gift_card_url: string | null;
  order_url: string | null;
  hours: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  hero_image_url: string | null;
  listing_tier: string | null;
  listing_until: string | null;
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

  // Pending owner submissions (per venue), to show an "awaiting review" note — split
  // by kind so the field editor and the pin editor each show their own state.
  const pendingByVenue = new Set<string>();
  const pendingPinByVenue = new Set<string>();
  const pendingHeroByVenue = new Set<string>();
  if (venues.length) {
    const { data: pend } = await db
      .from("suggestions")
      .select("restaurant_id, kind")
      .in("kind", ["owner_edit", "geo_correction", "hero_set"])
      .eq("status", "pending")
      .eq("created_by", user.id)
      .in("restaurant_id", venues.map((v) => v.id));
    for (const p of pend ?? []) {
      if (!p.restaurant_id) continue;
      if (p.kind === "geo_correction") pendingPinByVenue.add(p.restaurant_id);
      else if (p.kind === "hero_set") pendingHeroByVenue.add(p.restaurant_id);
      else pendingByVenue.add(p.restaurant_id);
    }
  }

  // Approved community-photo counts per venue — drives the Tier-3 completeness meter.
  const photoCountByVenue = new Map<string, number>();
  if (venues.length) {
    const { data: mediaRows } = await db
      .from("media")
      .select("restaurant_id")
      .eq("status", "approved")
      .in("restaurant_id", venues.map((v) => v.id));
    for (const m of mediaRows ?? []) {
      if (!m.restaurant_id) continue;
      photoCountByVenue.set(m.restaurant_id, (photoCountByVenue.get(m.restaurant_id) ?? 0) + 1);
    }
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
            <div key={v.id} className="rounded-xl border border-border-subtle bg-surface-0 p-5">
              <VenueCompleteness
                venue={v}
                photoCount={photoCountByVenue.get(v.id) ?? 0}
                hasControl={hasPageControl(v)}
              />
              <OwnerVenueEditor
                bare
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
                  shop_url: v.shop_url,
                  tickets_url: v.tickets_url,
                  gift_card_url: v.gift_card_url,
                  order_url: v.order_url,
                  hours: v.hours,
                }}
                hasControl={hasPageControl(v)}
                hasPending={pendingByVenue.has(v.id)}
              />
              {/* Tier 3 — the Pro-only hero control is SHOWN to free owners, locked, with a
                  calm upgrade prompt (never a silent hide); it unlocks in place on upgrade. */}
              {hasPageControl(v) ? (
                <OwnerHeroPicker venueId={v.id} hasPending={pendingHeroByVenue.has(v.id)} />
              ) : (
                <div className="mt-4 rounded-lg border border-brand-gold/25 bg-brand-gold/5 p-4">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-brand-gold" />
                    <span className="text-sm font-semibold text-text-primary">Hero image</span>
                    <span className="ml-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
                      Pro
                    </span>
                  </div>
                  <p className="text-sm text-text-muted">
                    Choose the photo that leads your page with the{" "}
                    <span className="font-semibold text-brand-gold">Pro tier</span> — control your
                    hero and make a strong first impression.
                  </p>
                </div>
              )}
              <OwnerPinEditor
                venue={{ id: v.id, name: v.name, lat: v.lat, lng: v.lng }}
                hasPending={pendingPinByVenue.has(v.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
