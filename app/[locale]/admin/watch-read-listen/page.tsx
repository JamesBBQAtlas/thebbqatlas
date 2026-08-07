import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MediaPicksAdmin, type AdminMediaPick } from "@/components/admin/MediaPicksAdmin";

export const metadata = { title: "Watch, Read & Listen — admin" };
export const dynamic = "force-dynamic";

export default async function MediaPicksAdminPage() {
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
    .from("media_picks")
    .select(
      "id, kind, name, creator, url, blurb, image_url, gear_link, links, sort_order, is_published"
    )
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as AdminMediaPick[];

  // --- KPI (Phase 6.8 D2) --------------------------------------------------
  // Per-kind published/unpublished counts + the top items by outbound clicks
  // over the last 30 days (deduped media click_events, keyed to media_pick_id).
  const perKind: Record<string, { published: number; unpublished: number }> = {};
  for (const r of rows) {
    const k = (perKind[r.kind] ??= { published: 0, unpublished: 0 });
    if (r.is_published) k.published++;
    else k.unpublished++;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Low-volume, admin-only: pull recent media clicks and tally in JS (capped).
  const { data: clickRows } = await db
    .from("click_events")
    .select("media_pick_id")
    .eq("event_type", "media")
    .not("media_pick_id", "is", null)
    .gte("created_at", since)
    .limit(10000);
  const tally = new Map<string, number>();
  for (const c of (clickRows ?? []) as { media_pick_id: string }[]) {
    tally.set(c.media_pick_id, (tally.get(c.media_pick_id) ?? 0) + 1);
  }
  const rowById = new Map(rows.map((r) => [r.id, r] as const));
  const top: { id: string; name: string; kind: string; clicks: number }[] = [];
  for (const [id, clicks] of tally) {
    const r = rowById.get(id);
    if (r) top.push({ id, name: r.name, kind: r.kind, clicks });
  }
  top.sort((a, b) => b.clicks - a.clicks);
  top.splice(5);

  const kpi = { perKind, top, windowDays: 30 };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-text-primary">
          Watch, Read &amp; Listen
        </h1>
        <p className="mt-1 text-text-muted">
          Curate the directory — add, edit, reorder and publish YouTube channels, books and
          podcasts. Book URLs are the raw Amazon product pages; the affiliate tag is added
          automatically when the page renders.
        </p>
      </div>
      <MediaPicksAdmin rows={rows} kpi={kpi} />
    </div>
  );
}
