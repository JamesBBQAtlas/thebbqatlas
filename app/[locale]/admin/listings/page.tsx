import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Sparkles, Search, ExternalLink } from "lucide-react";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { Restaurant, MapItemCategory } from "@/lib/types/database";

export const metadata = { title: "Listings" };
export const dynamic = "force-dynamic";

type Fresh = "green" | "amber" | "red";

/** Traffic-light on enrichment age: ≤1mo green, ≤3mo amber, older/never red. */
function freshness(enrichedAt: string | null | undefined): {
  tone: Fresh;
  label: string;
} {
  if (!enrichedAt) return { tone: "red", label: "Never" };
  const days = Math.floor((Date.now() - new Date(enrichedAt).getTime()) / 86_400_000);
  const label =
    days < 1 ? "Today" : days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
  if (days <= 30) return { tone: "green", label };
  if (days <= 90) return { tone: "amber", label };
  return { tone: "red", label };
}

const TONE_CLASSES: Record<Fresh, string> = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};
const DOT: Record<Fresh, string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
};

const FILTERS: { key: string; label: string; tone?: Fresh }[] = [
  { key: "all", label: "All" },
  { key: "green", label: "Fresh (≤1mo)", tone: "green" },
  { key: "amber", label: "Ageing (1–3mo)", tone: "amber" },
  { key: "red", label: "Stale / never", tone: "red" },
];

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { q?: string; fresh?: string };
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

  const q = (searchParams.q ?? "").trim();
  const fresh = searchParams.fresh ?? "all";

  let query = db
    .from("restaurants")
    .select(
      "id, name, slug, city, country, style, category, enriched_at, status, website, phone, hours, instagram_url"
    )
    .order("enriched_at", { ascending: true, nullsFirst: true })
    .limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,country.ilike.%${q}%`);
  const { data } = await query;
  const all = (data ?? []) as Restaurant[];

  // Counts per bucket (over the search results, before the freshness filter).
  const counts: Record<string, number> = { all: all.length, green: 0, amber: 0, red: 0 };
  for (const r of all) counts[freshness(r.enriched_at).tone]++;

  const rows =
    fresh === "all" ? all : all.filter((r) => freshness(r.enriched_at).tone === fresh);

  const gaps = (r: Restaurant) =>
    [!r.website && "site", !r.phone && "phone", !r.hours && "hours", !r.instagram_url && "IG"].filter(
      Boolean
    ) as string[];

  const chipHref = (key: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (key !== "all") params.set("fresh", key);
    const qs = params.toString();
    return `/admin/listings${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text-primary">Listings</h1>
          <p className="mt-1 text-text-muted">
            Every venue on the Atlas. Enrich or update any one with AI in a click.
          </p>
        </div>
        <form className="flex items-center gap-2">
          {fresh !== "all" && <input type="hidden" name="fresh" value={fresh} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, city, country"
              className="w-64 rounded-md border border-border-default bg-surface-0 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
            />
          </div>
        </form>
      </div>

      {/* Freshness filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={chipHref(f.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
              fresh === f.key
                ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                : "border-border-subtle bg-surface-0 text-text-secondary hover:border-brand-gold/50 hover:text-brand-gold"
            }`}
          >
            {f.tone && <span className={`h-2 w-2 rounded-full ${DOT[f.tone]}`} />}
            {f.label}
            <span className="text-text-muted">{counts[f.key] ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-1 text-xs uppercase tracking-[0.06em] text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Venue</th>
              <th className="px-4 py-3 font-semibold">Type / Style</th>
              <th className="px-4 py-3 font-semibold">Gaps</th>
              <th className="px-4 py-3 font-semibold">Last enriched</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = gaps(r);
              const f = freshness(r.enriched_at);
              return (
                <tr key={r.id} className="border-t border-border-subtle bg-surface-0 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">{r.name}</div>
                    <div className="text-xs text-text-muted">
                      {[r.city, r.country].filter(Boolean).join(", ")}
                      {r.status !== "approved" && (
                        <span className="ml-2 rounded-full bg-brand-sienna/15 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase text-brand-sienna-light">
                          {r.status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {r.category && r.category !== "restaurant"
                      ? CATEGORY_LABELS[r.category as MapItemCategory]
                      : STYLE_LABELS[r.style as BbqStyle] ?? r.style}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {g.length === 0 ? (
                      <span className="text-emerald-400">complete</span>
                    ) : (
                      <span className="text-brand-sienna-light">{g.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[f.tone]}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${DOT[f.tone]}`} />
                      {f.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/restaurants/${r.slug}`}
                        className="text-text-muted transition-colors hover:text-brand-gold"
                        title="View listing"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/enrich?slug=${r.slug}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Enrich
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
