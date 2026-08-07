import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ExternalLink, PencilLine, PlusCircle, Search, Sparkles, Wrench } from "lucide-react";

export const metadata = { title: "Change Log" };
export const dynamic = "force-dynamic";

/**
 * The Change Log is a UNIFIED timeline of every venue-data change, from two
 * sources merged and de-duplicated:
 *  - content_audit — the per-field trail written at EVERY mutation point (manual
 *    edits, moderation, roster, imports, AND ai enrichment). This is the
 *    comprehensive source and is what keeps the log live between enrichment runs.
 *  - enrichment_runs — used only for the non-field events content_audit doesn't
 *    capture: "created venue", and (opt-in) the AI hunts.
 * Previously the page read ONLY enrichment_runs, so with enrichment paused the
 * log looked frozen even though manual/moderation edits were flowing.
 */

interface Change {
  field: string;
  from: unknown;
  to: unknown;
}
interface Event {
  key: string;
  kind: "ai_enrichment" | "manual_edit" | "roster" | "import" | "operator" | "system" | "venue_create" | "venue_hunt";
  restaurantId: string | null;
  restaurantName: string | null;
  restaurantSlug: string | null;
  changes: Change[];
  citations: string[];
  model: string | null;
  by: string | null;
  at: string;
}

interface AuditRow {
  id: string;
  restaurant_id: string | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  source: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
}
interface RunRow {
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

const LABELS: Record<Event["kind"], { text: string; cls: string; Icon: typeof PencilLine }> = {
  ai_enrichment: { text: "AI enrichment", cls: "bg-brand-gold/15 text-brand-gold", Icon: Sparkles },
  manual_edit: { text: "Manual edit", cls: "bg-brand-sienna/15 text-brand-sienna-light", Icon: PencilLine },
  roster: { text: "Roster", cls: "bg-surface-2 text-text-secondary", Icon: Wrench },
  import: { text: "Import", cls: "bg-surface-2 text-text-secondary", Icon: Wrench },
  operator: { text: "Operator", cls: "bg-brand-sienna/15 text-brand-sienna-light", Icon: PencilLine },
  system: { text: "System", cls: "bg-surface-2 text-text-muted", Icon: Wrench },
  venue_create: { text: "Created venue", cls: "bg-emerald-500/15 text-emerald-400", Icon: PlusCircle },
  venue_hunt: { text: "AI hunt", cls: "bg-surface-2 text-text-muted", Icon: Search },
};

const AUDIT_KINDS = new Set(["ai_enrichment", "manual_edit", "roster", "import", "operator", "system"]);

/** Group consecutive content_audit rows (same venue + source + author, within a
 *  10s window) into one change event — a batched save writes many field rows at
 *  once and should read as a single entry. */
function groupAudit(rows: AuditRow[]): Event[] {
  const out: Event[] = [];
  let cur: Event | null = null;
  let curStart = 0;
  for (const r of rows) {
    const kind = (AUDIT_KINDS.has(r.source) ? r.source : "system") as Event["kind"];
    const t = new Date(r.created_at).getTime();
    const sameGroup =
      cur &&
      cur.restaurantId === r.restaurant_id &&
      cur.kind === kind &&
      cur.by === r.changed_by &&
      Math.abs(curStart - t) < 10_000;
    if (!sameGroup) {
      cur = {
        key: `a-${r.id}`,
        kind,
        restaurantId: r.restaurant_id,
        restaurantName: r.restaurants?.name ?? null,
        restaurantSlug: r.restaurants?.slug ?? null,
        changes: [],
        citations: [],
        model: null,
        by: r.changed_by,
        at: r.created_at,
      };
      curStart = t;
      out.push(cur);
    }
    cur!.changes.push({ field: r.field, from: r.old_value, to: r.new_value });
  }
  return out;
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

  // 1) content_audit — the comprehensive per-field trail (all sources).
  let auditQ = db
    .from("content_audit")
    .select("id, restaurant_id, field, old_value, new_value, source, changed_by, note, created_at, restaurants(name, slug)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (venueFilter) auditQ = auditQ.eq("restaurant_id", venueFilter);
  const { data: auditData } = await auditQ;
  const auditEvents = groupAudit((auditData ?? []) as unknown as AuditRow[]);

  // 2) enrichment_runs — only for venue_create (and AI hunts when opted in);
  //    field-change enrichment already appears via content_audit (source=ai_enrichment).
  const runKinds = showAll ? ["venue_create", "venue_hunt"] : ["venue_create"];
  let runsQ = db
    .from("enrichment_runs")
    .select("id, restaurant_id, entity_type, result, citations, model, created_by, created_at, restaurants(name, slug)")
    .in("entity_type", runKinds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (venueFilter) runsQ = runsQ.eq("restaurant_id", venueFilter);
  const { data: runsData } = await runsQ;
  const runEvents: Event[] = ((runsData ?? []) as unknown as RunRow[]).map((r) => ({
    key: `r-${r.id}`,
    kind: (r.entity_type === "venue_create" ? "venue_create" : "venue_hunt") as Event["kind"],
    restaurantId: r.restaurant_id,
    restaurantName: r.restaurants?.name ?? null,
    restaurantSlug: r.restaurants?.slug ?? null,
    changes: (r.result?.changes ?? []).map((c) => ({ field: c.field, from: c.from, to: c.to })),
    citations: Array.isArray(r.citations) ? r.citations : [],
    model: r.model,
    by: r.created_by,
    at: r.created_at,
  }));

  // Merge + sort newest-first.
  const events = [...auditEvents, ...runEvents].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  // Resolve who made each change.
  const ids = [...new Set(events.map((e) => e.by).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: pf } = await db.from("profiles").select("id, display_name").in("id", ids);
    for (const p of pf ?? []) nameById.set(p.id, p.display_name ?? "admin");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">Change Log</h1>
          <p className="mt-1 text-text-muted">
            Every change made to a venue&apos;s data — manual edits, moderation, roster and AI
            enrichment — what changed, by whom, and its sources.
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

      {events.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No changes recorded yet. Editing a venue, applying enrichment, or approving a
          self-healing suggestion will appear here.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const l = LABELS[e.kind];
            return (
              <div key={e.key} className="rounded-xl border border-border-subtle bg-surface-0 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] ${l.cls}`}>
                      <l.Icon className="h-3 w-3" />
                      {l.text}
                    </span>
                    {e.restaurantSlug ? (
                      <Link
                        href={`/restaurants/${e.restaurantSlug}`}
                        className="font-semibold text-text-primary hover:text-brand-gold"
                      >
                        {e.restaurantName ?? "Venue"}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-primary">
                        {e.restaurantName ?? "Venue"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{nameById.get(e.by ?? "") ?? "system"}</span>
                    <span>·</span>
                    <span>{timeAgo(e.at)}</span>
                    {e.model && <span className="hidden sm:inline">· {e.model}</span>}
                  </div>
                </div>

                {e.changes.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs">
                    {e.changes.map((c, i) => (
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

                {e.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.citations.slice(0, 4).map((u) => (
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
