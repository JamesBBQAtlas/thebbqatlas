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

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { q?: string };
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
  let query = db
    .from("restaurants")
    .select(
      "id, name, slug, city, country, style, category, enriched_at, status, website, phone, hours, instagram_url"
    )
    .order("name", { ascending: true })
    .limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,country.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as Restaurant[];

  const gaps = (r: Restaurant) =>
    [!r.website && "site", !r.phone && "phone", !r.hours && "hours", !r.instagram_url && "IG"].filter(
      Boolean
    ) as string[];

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

      <p className="mb-4 text-sm text-text-muted">{rows.length} shown</p>

      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-1 text-xs uppercase tracking-[0.06em] text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Venue</th>
              <th className="px-4 py-3 font-semibold">Type / Style</th>
              <th className="px-4 py-3 font-semibold">Gaps</th>
              <th className="px-4 py-3 font-semibold">Enriched</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = gaps(r);
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
                      <span className="text-brand-gold">complete</span>
                    ) : (
                      <span className="text-brand-sienna-light">{g.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {r.enriched_at ? new Date(r.enriched_at).toLocaleDateString() : "—"}
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
