import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { DisplayNameForm } from "@/components/account/DisplayNameForm";
import { UsernameForm } from "@/components/account/UsernameForm";
import { AccountManagement } from "@/components/account/AccountManagement";
import { SecuritySettings } from "@/components/account/SecuritySettings";
import { MarketingPrefToggle } from "@/components/email/MarketingPrefToggle";
import { resolveAvatarUrl } from "@/lib/account/avatar-resolve";
import type { AccountType } from "@/lib/types/database";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
  const avatar = await resolveAvatarUrl(supabase, profile?.avatar_url, accountType);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <Link
        href="/profile"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Atlas
      </Link>
      <h1 className="mb-8 font-heading text-3xl font-bold text-text-primary">
        Account settings
      </h1>

      <div className="space-y-6">
        {/* Profile */}
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
          <h2 className="mb-4 font-heading font-bold text-text-primary">Profile</h2>
          <div className="flex items-start gap-5">
            <AvatarUpload current={avatar} />
            <div className="flex-1 space-y-4">
              <div>
                <p className="u-eyebrow mb-1 text-[0.6875rem] text-text-muted">
                  Display name
                </p>
                <DisplayNameForm initial={displayName} />
              </div>
              <UsernameForm initial={profile?.username ?? ""} />
            </div>
          </div>
        </div>

        {/* Account: sign-in methods, change email, change/set password */}
        <AccountManagement currentEmail={user.email ?? ""} />

        {/* Security (2FA) */}
        <SecuritySettings />

        {/* Email preferences */}
        {profile?.unsubscribe_token && (
          <div>
            <h2 className="mb-3 font-heading font-bold text-text-primary">
              Email preferences
            </h2>
            <MarketingPrefToggle
              token={profile.unsubscribe_token}
              initialOptIn={Boolean(profile.marketing_opt_in)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
