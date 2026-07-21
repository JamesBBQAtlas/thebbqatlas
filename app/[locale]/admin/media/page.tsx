import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MediaModerationActions } from "@/components/admin/MediaModerationActions";

export const metadata = { title: "Media Moderation" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  source: string;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
}

export default async function MediaModerationPage() {
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
    .from("media")
    .select("id, kind, url, caption, source, created_at, restaurants(name, slug)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">
        Media Moderation
      </h1>
      <p className="mb-8 text-text-muted">
        Community photos &amp; videos awaiting review before they appear on venue
        pages.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          Nothing pending. Uploaded photos and check-in shots appear here for
          review.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {rows.map((m) => (
            <div
              key={m.id}
              className="overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
            >
              <div className="relative aspect-video bg-surface-2">
                {m.kind === "video" ? (
                  <video controls preload="metadata" className="h-full w-full object-cover" src={m.url} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold text-text-primary">
                    {m.restaurants?.name ?? "Unknown venue"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {m.kind} · {m.source}
                  </p>
                </div>
                <MediaModerationActions mediaId={m.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
