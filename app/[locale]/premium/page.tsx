import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Check, Sparkles, CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/account/entitlements";
import { PREMIUM, PREMIUM_PURCHASABLE } from "@/lib/stripe/config";
import {
  PremiumUpgradeButton,
  ManageBillingButton,
} from "@/components/monetization/BillingButtons";

export const dynamic = "force-dynamic";

interface Props {
  params: { locale: string };
  searchParams: { status?: string };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Atlas Premium",
    description:
      "Go ad-free, unlock your personal saved-spots map, and get the Pitmaster's Secret with Atlas Premium.",
    alternates: { canonical: "/premium" },
  };
}

export default async function PremiumPage({ params, searchParams }: Props) {
  setRequestLocale(params.locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const premium = user
    ? await getPremiumStatus(supabase, user.id)
    : {
        isPremium: false,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasBillingAccount: false,
      };

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      {searchParams.status === "success" && (
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-gold">
          <CircleCheck className="h-4 w-4" />
          Welcome to Premium — thank you for supporting the Atlas!
        </div>
      )}
      {searchParams.status === "cancelled" && (
        <div className="mb-8 rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-sm text-text-muted">
          No worries — checkout was cancelled. You can upgrade anytime.
        </div>
      )}

      <div className="text-center">
        <p className="u-eyebrow mb-3 flex items-center justify-center gap-1.5 text-brand-gold">
          <Sparkles className="h-3.5 w-3.5" /> {PREMIUM.name}
        </p>
        <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
          The best of the Atlas
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-text-secondary">
          {PREMIUM.blurb}
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-border-default bg-surface-0 p-8">
        <div className="flex items-baseline gap-1">
          <span className="font-heading text-4xl font-bold text-text-primary">
            {PREMIUM.price}
          </span>
          <span className="text-text-muted">/ {PREMIUM.interval}</span>
        </div>

        <ul className="mt-6 space-y-3">
          {PREMIUM.benefits.map((b) => (
            <li key={b} className="flex items-start gap-3 text-text-secondary">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          {!user ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-6 py-3 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90"
            >
              Sign in to upgrade
            </Link>
          ) : premium.isPremium ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-semibold text-brand-gold">
                <CircleCheck className="h-5 w-5" /> You&apos;re a Premium member.
                {premium.cancelAtPeriodEnd && premium.currentPeriodEnd
                  ? ` Access until ${new Date(premium.currentPeriodEnd).toLocaleDateString()}.`
                  : ""}
              </p>
              <ManageBillingButton />
            </div>
          ) : PREMIUM_PURCHASABLE ? (
            <PremiumUpgradeButton label={`Upgrade — ${PREMIUM.price}/${PREMIUM.interval}`} />
          ) : (
            <p className="rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-sm text-text-muted">
              Premium is almost here — we&apos;re putting the finishing touches on
              checkout. Check back shortly.
            </p>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-text-muted">
        Cancel anytime. Payments are handled securely by Stripe — we never see or
        store your card details.
      </p>
    </div>
  );
}
