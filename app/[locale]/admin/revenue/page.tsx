import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevenueSummary, fmtMinorUnits } from "@/lib/admin/revenue";
import { PREMIUM, LISTING, STRIPE_ENABLED, PREMIUM_PURCHASABLE, LISTING_PURCHASABLE } from "@/lib/stripe/config";

export const metadata = { title: "Revenue" };
export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "green" | "amber" | "red" | "gold";
}) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "red"
          ? "text-red-400"
          : tone === "gold"
            ? "text-brand-gold"
            : "text-text-primary";
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
      <div className={`font-heading text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-sm text-text-secondary">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-heading text-lg font-bold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default async function RevenuePage() {
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

  const rev = await getRevenueSummary(db);
  const cur = rev.currency;
  const payingPremium = rev.premium.active + rev.premium.pastDue;

  // Billing posture banner: TEST vs LIVE, and whether prices are configured.
  const liveKeys = STRIPE_ENABLED; // STRIPE_SECRET_KEY present
  const posture = !liveKeys
    ? { tone: "amber" as const, text: "Stripe is OFF — no secret key set. Billing is dormant; these figures are the go-live seam." }
    : { tone: "green" as const, text: "Stripe is ON. Whether it's TEST or LIVE depends on which secret key is set in the environment." };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">Revenue</h1>
      <p className="mt-1 text-text-muted">
        Subscriptions, featured listings and one-off orders at a glance. Read-only — the source of
        truth is Stripe; entitlement is reconciled by the webhook.
      </p>

      {/* Billing posture */}
      <div
        className={`mt-5 rounded-xl border p-4 text-sm ${
          posture.tone === "green"
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
            : "border-amber-500/30 bg-amber-500/5 text-amber-200"
        }`}
      >
        {posture.text}
        <span className="ml-1 text-text-muted">
          Consumer premium {PREMIUM_PURCHASABLE ? "purchasable" : "price not set"} · Featured listing{" "}
          {LISTING_PURCHASABLE ? "purchasable" : "price not set"}.
        </span>
      </div>

      {/* Headline */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Est. MRR"
          value={fmtMinorUnits(rev.mrrMinorUnits, cur)}
          tone="gold"
          sub="from list prices × paying subs"
        />
        <Stat
          label="Premium subscribers"
          value={payingPremium}
          sub={`${rev.premium.trialing} trialing · ${rev.premium.cancelingSoon} canceling`}
          tone={payingPremium ? "green" : "default"}
        />
        <Stat
          label="Featured listings"
          value={rev.listing.active}
          tone={rev.listing.active ? "green" : "default"}
          sub={`${LISTING.price}/${LISTING.interval} each`}
        />
        <Stat
          label="Orders (30d)"
          value={rev.orders.count30d}
          sub={`${fmtMinorUnits(rev.orders.gross30dMinorUnits, cur)} gross`}
        />
        <Stat label="Orders (all time)" value={rev.orders.countAll} />
      </div>

      {/* Subscription breakdown */}
      <Section title="Consumer premium">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Active" value={rev.premium.active} tone={rev.premium.active ? "green" : "default"} />
          <Stat label="Trialing" value={rev.premium.trialing} />
          <Stat label="Past due" value={rev.premium.pastDue} tone={rev.premium.pastDue ? "amber" : "default"} />
          <Stat label="Canceling soon" value={rev.premium.cancelingSoon} tone={rev.premium.cancelingSoon ? "amber" : "default"} />
          <Stat label="Canceled" value={rev.premium.canceled} tone={rev.premium.canceled ? "red" : "default"} />
          <Stat label="Total records" value={rev.premium.total} />
        </div>
        <p className="mt-3 text-xs text-text-muted">
          {PREMIUM.name} — {PREMIUM.price}/{PREMIUM.interval}. &quot;Paying&quot; counts active + past-due
          (a free trial contributes $0 to MRR until it converts).
        </p>
      </Section>

      {/* Recent orders */}
      <Section title="Recent orders">
        {rev.orders.recent.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-sm text-text-muted">
            No orders yet. One-off purchases (BBQ Mail, etc.) will appear here once billing is live.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-[0.05em] text-text-muted">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rev.orders.recent.map((o) => (
                  <tr key={o.id} className="border-b border-border-subtle/50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-2.5 text-text-primary">{o.description ?? "—"}</td>
                    <td className="px-4 py-2.5 text-text-muted">{o.type ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-primary">
                      {o.amountTotal !== null ? fmtMinorUnits(o.amountTotal, (o.currency ?? cur).toUpperCase()) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          o.status === "paid"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-surface-2 text-text-muted"
                        }`}
                      >
                        {o.status ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="mt-8 text-xs text-text-muted">
        Est. MRR is directional — computed from configured list prices, not read back from Stripe
        invoices. For authoritative billing, revenue and payout figures, use the Stripe Dashboard.
      </p>
    </div>
  );
}
