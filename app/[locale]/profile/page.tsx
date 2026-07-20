import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  Store,
  Map as MapIcon,
  Settings,
  Clock,
  Sparkles,
  MapPinCheckInside,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { avatarFor } from "@/lib/account/avatar";
import { getPremiumStatus } from "@/lib/account/entitlements";
import { getUserCheckIns } from "@/lib/queries/checkins";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { Restaurant, Submission, AccountType } from "@/lib/types/database";

export const metadata = { title: "My Atlas" };
export const dynamic = "force-dynamic";

const ACCOUNT_LABELS: Record<AccountType, string> = {
  consumer: "Explorer",
  owner: "Venue Owner",
  seller: "Seller",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "bg-brand-gold/15 text-brand-gold"
      : status === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-surface-2 text-text-muted";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] ${tone}`}
    >
      {status}
    </span>
  );
}

const HISTORY_HREF: Record<string, (slug: string) => string> = {
  venue: (s) => `/restaurants/${s}`,
  guide: (s) => `/guides/${s}`,
  news: (s) => `/news/${s}`,
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const accountType = (profile?.account_type ?? "consumer") as AccountType;
  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Member";
  const avatar = avatarFor(profile?.avatar_url, accountType);
  const premium = await getPremiumStatus(supabase, user.id);

  const { data: savedRows } = await supabase
    .from("saved_spots")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const restaurantIds = (savedRows ?? []).map((r) => r.restaurant_id);

  let savedRestaurants: Restaurant[] = [];
  if (restaurantIds.length > 0) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("*")
      .in("id", restaurantIds)
      .eq("status", "approved");
    if (restaurants) {
      const order = new Map(restaurantIds.map((id, i) => [id, i]));
      savedRestaurants = [...restaurants].sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
      ) as Restaurant[];
    }
  }

  const [{ data: submissions }, { data: claims }, { data: history }, checkIns] =
    await Promise.all([
      supabase
        .from("submissions")
        .select("*")
        .eq("submitted_by", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("restaurant_claims")
        .select("*, restaurants(name, slug)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("view_history")
        .select("*")
        .eq("user_id", user.id)
        .order("viewed_at", { ascending: false })
        .limit(8),
      getUserCheckIns(supabase, user.id),
    ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <AvatarUpload current={avatar} />
          <div>
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              My Atlas
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-text-secondary">{displayName}</span>
              {profile?.username && (
                <span className="text-text-muted">@{profile.username}</span>
              )}
              <span className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna">
                {ACCOUNT_LABELS[accountType]}
              </span>
              {premium.isPremium ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
                  <Sparkles className="h-3 w-3" /> Premium
                </span>
              ) : (
                <Link
                  href="/premium"
                  className="inline-flex items-center gap-1 rounded-full border border-border-default px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-text-muted transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
                >
                  <Sparkles className="h-3 w-3" /> Go Premium
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/profile/settings"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-4 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Owner/seller CTA for consumers */}
      {accountType === "consumer" && (
        <Link
          href="/list"
          className="mb-10 flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-0 p-5 transition-colors hover:border-brand-gold/50"
        >
          <Store className="h-6 w-6 shrink-0 text-brand-gold" />
          <div>
            <p className="font-semibold text-text-primary">
              Own or represent a BBQ business?
            </p>
            <p className="text-sm text-text-muted">
              Claim your venue or list your gear on The BBQ Atlas →
            </p>
          </div>
        </Link>
      )}

      {/* Saved spots */}
      <section className="mb-14">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-text-primary">
            Saved Spots
          </h2>
          {savedRestaurants.length > 0 && (
            <Link
              href="/profile/map"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold hover:underline"
            >
              <MapIcon className="h-4 w-4" />
              View on map
            </Link>
          )}
        </div>
        {savedRestaurants.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-text-muted">
            No saved spots yet.{" "}
            <Link href="/map" className="text-brand-gold hover:underline">
              Explore the map
            </Link>{" "}
            and tap the save icon on any venue.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {savedRestaurants.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
        )}
      </section>

      {/* Places you've been */}
      {checkIns.length > 0 && (
        <section className="mb-14">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-text-primary">
            <MapPinCheckInside className="h-5 w-5 text-brand-sienna" />
            Places you&apos;ve been
            <span className="text-sm font-normal text-text-muted">
              · {checkIns.length}
            </span>
          </h2>
          <div className="space-y-3">
            {checkIns.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-surface-0 p-4"
              >
                <div className="min-w-0">
                  {c.restaurants?.slug ? (
                    <Link
                      href={`/restaurants/${c.restaurants.slug}`}
                      className="font-semibold text-text-primary transition-colors hover:text-brand-gold"
                    >
                      {c.restaurants.name}
                    </Link>
                  ) : (
                    <p className="font-semibold text-text-primary">A venue</p>
                  )}
                  {c.restaurants &&
                    (c.restaurants.city || c.restaurants.country) && (
                      <p className="text-sm text-text-muted">
                        {[c.restaurants.city, c.restaurants.country]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  {c.note && (
                    <p className="mt-1.5 text-sm italic text-text-secondary">
                      &ldquo;{c.note}&rdquo;
                    </p>
                  )}
                </div>
                {c.visibility === "private" && (
                  <span
                    className="mt-0.5 flex shrink-0 items-center gap-1 text-[0.6875rem] uppercase tracking-[0.06em] text-text-muted"
                    title="Only you can see this note"
                  >
                    <Lock className="h-3 w-3" /> Private
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently viewed */}
      {(history ?? []).length > 0 && (
        <section className="mb-14">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-text-primary">
            <Clock className="h-5 w-5 text-text-muted" />
            Recently viewed
          </h2>
          <div className="flex flex-wrap gap-2">
            {(history ?? []).map((h) => {
              const href = h.slug
                ? (HISTORY_HREF[h.entity_type]?.(h.slug) ?? "#")
                : "#";
              return (
                <Link
                  key={h.id}
                  href={href}
                  className="rounded-full border border-border-subtle bg-surface-0 px-4 py-1.5 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-brand-gold"
                >
                  {h.title ?? h.slug ?? "Item"}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Claims */}
      {(claims ?? []).length > 0 && (
        <section className="mb-14">
          <h2 className="mb-4 font-heading text-xl font-bold text-text-primary">
            My Venue Claims
          </h2>
          <div className="space-y-3">
            {(claims ?? []).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-0 p-4"
              >
                <div>
                  <p className="font-semibold text-text-primary">
                    {c.restaurants?.name ?? "Venue"}
                  </p>
                  <p className="text-sm capitalize text-text-muted">
                    {c.role_requested} claim
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Submissions */}
      <section>
        <h2 className="mb-4 font-heading text-xl font-bold text-text-primary">
          My Submissions
        </h2>
        {(submissions ?? []).length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-text-muted">
            No submissions yet.{" "}
            <Link href="/submit" className="text-brand-gold hover:underline">
              Submit a spot
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {(submissions as Submission[]).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-0 p-4"
              >
                <div>
                  <p className="font-semibold text-text-primary">{s.name}</p>
                  <p className="text-sm text-text-muted">
                    {[s.city, s.country].filter(Boolean).join(", ")} ·{" "}
                    {STYLE_LABELS[s.style] ?? s.style}
                  </p>
                </div>
                <StatusBadge status={s.moderation_status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
