import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { DisplayNameForm } from "@/components/account/DisplayNameForm";
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

  const [{ data: submissions }, { data: claims }] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-gold/15 font-heading text-2xl font-bold text-brand-gold">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              My Atlas
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <DisplayNameForm initial={displayName} />
              <span className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna">
                {ACCOUNT_LABELS[accountType]}
              </span>
            </div>
          </div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* Owner/seller call-to-action for consumers */}
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
        <h2 className="mb-4 font-heading text-xl font-bold text-text-primary">
          Saved Spots
        </h2>
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
                  <p className="text-sm text-text-muted capitalize">
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
