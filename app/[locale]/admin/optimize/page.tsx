import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { CircleDot, AlertTriangle, Ban, Crown, Inbox } from "lucide-react";
import { freshnessTone, FRESHNESS_DAYS } from "@/lib/admin/freshness";
import { GeoAuditPanel } from "@/components/admin/GeoAuditPanel";
import { CountryBackfillPanel } from "@/components/admin/CountryBackfillPanel";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";

interface Tile {
  href: string;
  label: string;
  value: number;
  sub?: string;
  tone: "green" | "amber" | "red" | "gold" | "default";
  icon: typeof CircleDot;
}

function toneClasses(tone: Tile["tone"]) {
  switch (tone) {
    case "green": return "text-emerald-400 border-emerald-500/30";
    case "amber": return "text-amber-400 border-amber-500/30";
    case "red": return "text-red-400 border-red-500/30";
    case "gold": return "text-brand-gold border-brand-gold/30";
    default: return "text-text-primary border-border-subtle";
  }
}

export default async function StatusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  // One read of the fields the status rule + flags need. Public listings are
  // approved venues; but freshness/attention span the whole catalogue.
  const { data: rows } = await db
    .from("restaurants")
    .select("enriched_at, needs_attention, permanently_closed, flagship_unset, status")
    .limit(5000);
  const all = (rows ?? []) as {
    enriched_at: string | null;
    needs_attention: boolean | null;
    permanently_closed: boolean | null;
    flagship_unset: boolean | null;
    status: string | null;
  }[];

  let green = 0, amber = 0, red = 0, attn = 0, closed = 0, flagship = 0;
  for (const r of all) {
    const tone = freshnessTone(r.enriched_at);
    if (tone === "green") green++; else if (tone === "amber") amber++; else red++;
    if (r.needs_attention) attn++;
    if (r.permanently_closed) closed++;
    if (r.flagship_unset) flagship++;
  }

  // Moderation queue (submissions + reviews + photos pending).
  const countPending = async (table: string, col: string, val: string) => {
    try {
      const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq(col, val);
      return count ?? 0;
    } catch { return 0; }
  };
  const [subs, revs, phts] = await Promise.all([
    countPending("submissions", "moderation_status", "pending"),
    countPending("reviews", "status", "pending"),
    countPending("review_photos", "status", "pending"),
  ]);
  const modPending = subs + revs + phts;

  const freshness: Tile[] = [
    { href: "/admin/listings?fresh=green", label: "Fresh", value: green, sub: `≤ ${FRESHNESS_DAYS.greenMaxDays}d`, tone: "green", icon: CircleDot },
    { href: "/admin/listings?fresh=amber", label: "Ageing", value: amber, sub: `${FRESHNESS_DAYS.greenMaxDays}–${FRESHNESS_DAYS.amberMaxDays}d`, tone: "amber", icon: CircleDot },
    { href: "/admin/listings?fresh=red", label: "Stale / never", value: red, sub: `> ${FRESHNESS_DAYS.amberMaxDays}d`, tone: "red", icon: CircleDot },
  ];
  const flags: Tile[] = [
    { href: "/admin/listings?attn=1", label: "Needs attention", value: attn, tone: "amber", icon: AlertTriangle },
    { href: "/admin/listings?closed=1", label: "Permanently closed", value: closed, tone: "red", icon: Ban },
    { href: "/admin/listings?flagship=1", label: "Flagship unset", value: flagship, tone: "gold", icon: Crown },
    { href: "/admin/moderation", label: "Moderation queue", value: modPending, tone: modPending ? "gold" : "default", icon: Inbox },
  ];

  const TileCard = ({ t }: { t: Tile }) => (
    <Link href={t.href} className={`rounded-xl border bg-surface-0 p-5 transition-colors hover:border-brand-gold/50 ${toneClasses(t.tone)}`}>
      <div className="flex items-center gap-2">
        <t.icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">{t.label}</span>
      </div>
      <div className={`mt-2 font-heading text-3xl font-bold ${toneClasses(t.tone).split(" ")[0]}`}>{t.value}</div>
      {t.sub && <div className="mt-0.5 text-xs text-text-muted">{t.sub}</div>}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">Catalogue status</h1>
      <p className="mt-1 max-w-2xl text-text-muted">
        Health at a glance, by the one freshness rule (green ≤ {FRESHNESS_DAYS.greenMaxDays} days · amber ≤ {FRESHNESS_DAYS.amberMaxDays} days · red older/never, by <code>enriched_at</code> age). Each tile opens Listings pre-filtered — from there, select all and “Enrich selected” to refresh.
      </p>

      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-text-primary">Freshness</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {freshness.map((t) => <TileCard key={t.href} t={t} />)}
      </div>

      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-text-primary">Attention</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {flags.map((t) => <TileCard key={t.href} t={t} />)}
      </div>

      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-text-primary">Pin health</h2>
      <GeoAuditPanel />

      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-text-primary">Country names</h2>
      <CountryBackfillPanel />

      <p className="mt-8 text-sm text-text-muted">
        The old scheduled “self-heal” sweep has been retired (it silently ran a pricey model). Refreshing stale venues is now: <Link href="/admin/listings?fresh=red" className="text-brand-gold hover:underline">open the Red set</Link>, select all, hit “Enrich selected”, confirm the cost. Same cheap Grok → Haiku pipeline, no cron, no separate engine.
      </p>
    </div>
  );
}
