import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPrefToggle } from "@/components/email/MarketingPrefToggle";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { token?: string; done?: string };
}) {
  setRequestLocale(params.locale);
  const token = searchParams.token?.trim();

  let found = false;
  let optIn = false;
  if (token && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("marketing_opt_in")
        .eq("unsubscribe_token", token)
        .maybeSingle();
      if (data) {
        found = true;
        // If arriving via the one-click GET link, opt-in is already false.
        optIn = searchParams.done === "1" ? false : Boolean(data.marketing_opt_in);
      }
    } catch {
      /* fall through to invalid */
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20 sm:px-10">
      <div className="mb-8 text-center">
        <p className="u-eyebrow mb-2 text-brand-gold">Email preferences</p>
        <h1 className="font-heading text-3xl font-bold text-text-primary">
          The BBQ Atlas Missives
        </h1>
      </div>

      {!token || !found ? (
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-center text-text-muted">
          This preferences link is invalid or has expired. If you&apos;re signed
          in, you can manage email preferences from your account settings.
        </div>
      ) : (
        <MarketingPrefToggle token={token} initialOptIn={optIn} />
      )}
    </div>
  );
}
