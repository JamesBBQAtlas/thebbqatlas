import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ExternalLink } from "lucide-react";
import { SuggestionActions } from "@/components/admin/SuggestionActions";
import { RunSweepButton } from "@/components/admin/RunSweepButton";

export const metadata = { title: "Self-Healing" };
export const dynamic = "force-dynamic";

interface Suggestion {
  id: string;
  kind: string;
  title: string;
  summary: string;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  sources: string[] | null;
  confidence: number | null;
  restaurant_id: string | null;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function OptimizePage() {
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

  const { data } = await db
    .from("suggestions")
    .select("*, restaurants(name, slug)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Suggestion[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            Self-Healing
          </h1>
          <p className="mt-1 max-w-xl text-text-muted">
            Grok proposes fixes and gap-fills for your venues. Nothing changes on
            the live site until you approve it here.
          </p>
        </div>
        <RunSweepButton />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No pending suggestions. Run a sweep, or wait for the scheduled one — new
          proposals land here for your review.
        </p>
      ) : (
        <div className="space-y-5">
          {rows.map((s) => {
            const fields = Object.keys(s.proposed ?? {});
            return (
              <div
                key={s.id}
                className="rounded-xl border border-border-subtle bg-surface-0 p-5"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] ${
                          s.kind === "closure"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-brand-gold/15 text-brand-gold"
                        }`}
                      >
                        {s.kind === "closure" ? "Possible closure" : "Gap fill"}
                      </span>
                      {s.confidence != null && (
                        <span className="text-xs text-text-muted">
                          {Math.round(s.confidence * 100)}% confident
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1.5 font-heading text-lg font-bold text-text-primary">
                      {s.restaurants?.slug ? (
                        <Link
                          href={`/restaurants/${s.restaurants.slug}`}
                          className="hover:text-brand-gold"
                        >
                          {s.restaurants?.name ?? "Venue"}
                        </Link>
                      ) : (
                        (s.restaurants?.name ?? "Venue")
                      )}
                    </h2>
                    <p className="text-sm text-text-muted">{s.summary}</p>
                  </div>
                  <SuggestionActions suggestionId={s.id} />
                </div>

                <div className="overflow-hidden rounded-lg border border-border-subtle">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-1 text-xs uppercase tracking-[0.06em] text-text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Field</th>
                        <th className="px-3 py-2 font-semibold">Current</th>
                        <th className="px-3 py-2 font-semibold">Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f) => (
                        <tr key={f} className="border-t border-border-subtle align-top">
                          <td className="px-3 py-2 font-semibold text-text-secondary">{f}</td>
                          <td className="px-3 py-2 text-text-muted">
                            {fmt(s.current?.[f])}
                          </td>
                          <td className="px-3 py-2 text-brand-gold">
                            {fmt(s.proposed?.[f])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {Array.isArray(s.sources) && s.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.sources.slice(0, 6).map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-gold hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span className="max-w-[220px] truncate">{u}</span>
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
