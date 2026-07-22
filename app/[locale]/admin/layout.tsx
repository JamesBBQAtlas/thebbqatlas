import { ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

async function count(
  db: SupabaseClient,
  table: string,
  filter?: { col: string; val: string }
): Promise<number> {
  try {
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.eq(filter.col, filter.val);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Admin shell — persistent section tabs on every admin page, plus a distinct
 * "Admin" treatment (accent bar + badge) so it's obvious you're in the back
 * office. The public site header/menu still sits above this (root layout), so
 * you can always jump back to Map/Directory/etc.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  // Non-admins: let the page render its own Access Denied / redirect, without
  // exposing the admin chrome + nav.
  if (!isAdmin) return <>{children}</>;

  // Admin requires a stepped-up (aal2) session. If the admin has a verified
  // factor but is still at aal1, challenge for the TOTP code first; if they have
  // no factor at all, they must enrol 2FA before using the back office.
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    if (aal?.nextLevel === "aal2") {
      redirect("/login/mfa?next=/admin");
    }
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-brand-gold" />
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Two-factor required
        </h1>
        <p className="mx-auto mt-2 max-w-md text-text-muted">
          Admin access requires two-factor authentication. Set it up in your
          account security settings, then come back.
        </p>
        <Link
          href="/profile/settings"
          className="mt-6 inline-flex rounded-lg bg-brand-gold px-5 py-2.5 font-semibold text-brand-black transition-opacity hover:opacity-90"
        >
          Go to security settings
        </Link>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [mediaPending, suggestionsPending, subsPending, reviewsPending, photosPending] =
    await Promise.all([
      count(db, "media", { col: "status", val: "pending" }),
      count(db, "suggestions", { col: "status", val: "pending" }),
      count(db, "submissions", { col: "moderation_status", val: "pending" }),
      count(db, "reviews", { col: "status", val: "pending" }),
      count(db, "review_photos", { col: "status", val: "pending" }),
    ]);
  const pendingTotal = subsPending + reviewsPending + photosPending;

  return (
    <div className="admin-shell min-h-screen">
      {/* Persistent admin chrome — sticks just below the site header */}
      <div className="sticky top-18 z-30">
        {/* Accent bar signals "admin" */}
        <div className="h-0.5 w-full bg-gradient-to-r from-brand-sienna via-brand-gold to-brand-sienna" />
        <div className="border-b border-brand-gold/15 bg-surface-0/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 sm:px-10">
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em] text-brand-gold transition-colors hover:bg-brand-gold/15"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin
          </Link>
          <AdminNav
            counts={{ media: mediaPending, suggestions: suggestionsPending, pending: pendingTotal }}
          />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
