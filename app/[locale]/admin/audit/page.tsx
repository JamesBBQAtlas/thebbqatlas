import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ExternalLink, PencilLine, PlusCircle, Search } from "lucide-react";

export const metadata = { title: "Change Log" };
export const dynamic = "force-dynamic";

interface Run {
  id: string;
  restaurant_id: string | null;
  entity_type: string;
  result: { changes?: { field: string; from: unknown; to: unknown }[] } | null;
  citations: string[] | null;
  model: string | null;
  created_by: string | null;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
}

function shortVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { all?: string; restaurant?: string };
}) {
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

  const showAll = searchParams.all === "1";
  const venueFilter = searchParams.restaurant;

  let query = db
    .from("enrichment_runs")
    .select("id, restaurant_id, entity_type, result, citations, model, created_by, created_at, restaurants(name, slug)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (venueFilter) query = query.eq("restaurant_id", venueFilter);
  if (!showAll) query = query.in("entity_type", ["venue_apply", "venue_create"]);
  const { data } = await query;
  const runs = (data ?? []) as unknown as Run[];

  // Resolve who made each change.
  const ids = [...new Set(runs.map((r) => r.created_by).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: pf } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    for (const p of pf ?? []) nameById.set(p.id, p.display_name ?? "admin");
  }

  const label = (t: string) =>
    t === "venue_apply"
      ? { text: "Applied changes", cls: "bg-brand-gold/15 text-brand-gold", Icon: PencilLine }
      : t === "venue_create"
        ? { text: "Created venue", cls: "bg-emerald-500/15 text-emerald-400", Icon: PlusCircle }
        : { text: "AI hunt", cls: "bg-surface-2 text-text-muted", Icon: Search };

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">Change Log</h1>
          <p className="mt-1 text-text-muted">
            Every change made to a venue&apos;s data — what changed, by whom, and its sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/audit"
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              !showAll
                ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                : "border-border-subtle text-text-secondary hover:text-brand-gold"
            }`}
          >
            Changes only
          </Link>
          <Link
            href="/admin/audit?all=1"
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              showAll
                ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                : "border-border-subtle text-text-secondary hover:text-brand-gold"
            }`}
          >
            Include AI hunts
          </Link>
        </div>
      </div>

      {venueFilter && (
        <p className="mb-4 text-sm text-text-muted">
          Filtered to one venue.{" "}
          <Link href="/admin/audit" className="text-brand-gold hover:underline">
            Show all
          </Link>
        </p>
      )}

      {runs.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No changes recorded yet. Applying enrichment or approving a self-healing
          suggestion will appear here.
        </p>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => {
            const l = label(r.entity_type);
            const changes = r.result?.changes ?? [];
            return (
              <div key={r.id} className="rounded-xl border border-border-subtle bg-surface-0 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] ${l.cls}`}>
                      <l.Icon className="h-3 w-3" />
                      {l.text}
                    </span>
                    {r.restaurants?.slug ? (
                      <Link
                        href={`/restaurants/${r.restaurants.slug}`}
                        className="font-semibold text-text-primary hover:text-brand-gold"
                      >
                        {r.restaurants.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-primary">
                        {r.restaurants?.name ?? "Venue"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{nameById.get(r.created_by ?? "") ?? "system"}</span>
                    <span>·</span>
                    <span>{timeAgo(r.created_at)}</span>
                    {r.model && <span className="hidden sm:inline">· {r.model}</span>}
                  </div>
                </div>

                {r.entity_type === "venue_apply" && changes.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs">
                    {changes.map((c, i) => (
                      <li key={i} className="text-text-secondary">
                        <span className="font-semibold text-text-primary">
                          {c.field.replace(/_/g, " ")}
                        </span>
                        :{" "}
                        <span className="text-text-muted line-through">{shortVal(c.from)}</span>{" "}
                        → <span className="text-brand-gold">{shortVal(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {Array.isArray(r.citations) && r.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.citations.slice(0, 4).map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[0.6875rem] text-brand-gold hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="max-w-[200px] truncate">{u}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
