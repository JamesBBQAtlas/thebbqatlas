import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Store, TrendingUp, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurants } from "@/lib/queries/restaurants";
import { ClaimForm, type ClaimVenue, type ExistingClaim } from "@/components/account/ClaimForm";

export const dynamic = "force-dynamic";

interface Props {
  params: { locale: string };
  searchParams: { claim?: string };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "List on The BBQ Atlas",
    description:
      "Claim your venue or list your barbecue gear on The BBQ Atlas — reach a global audience of barbecue lovers.",
    alternates: { canonical: "/list" },
  };
}

const BENEFITS = [
  { icon: TrendingUp, title: "Be discovered", body: "Get in front of barbecue lovers exploring the map and guides worldwide." },
  { icon: BadgeCheck, title: "Own your listing", body: "Keep your details accurate — hours, menu, photos and more, verified as yours." },
  { icon: Store, title: "Grow your business", body: "Featured placement, gear sales and premium tools are on the way." },
];

export default async function ListPage({ params, searchParams }: Props) {
  setRequestLocale(params.locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let venues: ClaimVenue[] = [];
  let existingClaims: ExistingClaim[] = [];
  if (user) {
    const [all, { data: claimRows }] = await Promise.all([
      getRestaurants(),
      supabase
        .from("restaurant_claims")
        .select("role_requested, status, restaurants(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    venues = all.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      country: r.country,
      slug: r.slug,
    }));
    existingClaims = (claimRows ?? []).map((c) => ({
      restaurantName: (c.restaurants as { name?: string } | null)?.name ?? "Venue",
      role: c.role_requested,
      status: c.status,
    }));
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="mb-10 text-center">
        <p className="u-eyebrow mb-3 text-brand-sienna">For businesses</p>
        <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
          List on The BBQ Atlas
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">
          The definitive guide to world barbecue — claim your venue or list your
          gear, and reach people who live for smoke and fire.
        </p>
      </div>

      <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-border-subtle bg-surface-0 p-5"
          >
            <Icon className="mb-3 h-6 w-6 text-brand-gold" />
            <h3 className="font-heading font-bold text-text-primary">{title}</h3>
            <p className="mt-1 text-sm text-text-muted">{body}</p>
          </div>
        ))}
      </div>

      {user ? (
        <ClaimForm
          venues={venues}
          existingClaims={existingClaims}
          presetSlug={searchParams.claim}
          defaultEmail={user.email ?? undefined}
        />
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-center">
          <p className="text-text-secondary">
            Sign in to claim your venue or list your gear.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
