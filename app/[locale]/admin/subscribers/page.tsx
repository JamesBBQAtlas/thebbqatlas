import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubscribersConsole, type SubscriberRow } from "@/components/admin/SubscribersConsole";

export const metadata = { title: "Subscribers — admin" };
export const dynamic = "force-dynamic";

interface SubRow {
  email: string;
  source: string | null;
  created_at: string;
  unsubscribed_at: string | null;
  confirmed_at: string | null;
  welcome_sent_at: string | null;
  day1_sent_at: string | null;
  day3_sent_at: string | null;
  day7_sent_at: string | null;
  became_member_at: string | null;
}

export default async function SubscribersAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data: subsData } = await db
    .from("email_subscribers")
    .select("email, source, created_at, unsubscribed_at, confirmed_at, welcome_sent_at, day1_sent_at, day3_sent_at, day7_sent_at, became_member_at")
    .order("created_at", { ascending: false });
  const subs = (subsData ?? []) as SubRow[];

  // Members (lowercased email + marketing opt-in) via the security-definer helper.
  const memberEmails = new Set<string>();
  const optedInMembers = new Set<string>();
  try {
    const { data: members } = await db.rpc("marketing_members");
    for (const m of (members ?? []) as { email: string; marketing_opt_in: boolean }[]) {
      if (!m.email) continue;
      const e = m.email.toLowerCase();
      memberEmails.add(e);
      if (m.marketing_opt_in) optedInMembers.add(e);
    }
  } catch {
    /* helper unavailable — reach/newsletter-only counts degrade to subs only */
  }

  const rows: SubscriberRow[] = subs.map((s) => {
    const steps: string[] = [];
    if (s.welcome_sent_at) steps.push("Welcome");
    if (s.day1_sent_at) steps.push("Day 1");
    if (s.day3_sent_at) steps.push("Day 3");
    if (s.day7_sent_at) steps.push("Day 7");
    return {
      email: s.email,
      source: s.source ?? "—",
      hasAccount: memberEmails.has(s.email.toLowerCase()),
      subscribedAt: s.created_at,
      unsubscribedAt: s.unsubscribed_at,
      steps,
    };
  });

  const active = subs.filter((s) => !s.unsubscribed_at);
  const activeEmails = new Set(active.map((s) => s.email.toLowerCase()));
  const reach = new Set([...activeEmails, ...optedInMembers]).size;
  const newsletterOnly = active.filter((s) => !memberEmails.has(s.email.toLowerCase())).length;

  const counts = {
    subscribed: active.length,
    unsubscribed: subs.length - active.length,
    reach,
    newsletterOnly,
    members: memberEmails.size,
    optedInMembers: optedInMembers.size,
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-text-primary">Subscribers</h1>
        <p className="mt-1 text-text-muted">
          The footer newsletter list (separate from member accounts). Signup is single opt-in with
          consent logged — confirmed state is unused, so these are all &ldquo;subscribed, consent
          logged&rdquo;, not unconfirmed.
        </p>
      </div>
      <SubscribersConsole counts={counts} rows={rows} />
    </div>
  );
}
