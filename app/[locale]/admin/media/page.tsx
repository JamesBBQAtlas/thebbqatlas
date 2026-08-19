import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MediaModerationActions } from "@/components/admin/MediaModerationActions";
import { MediaSafetySweep } from "@/components/admin/MediaSafetySweep";
import { PHOTO_SAFETY_ENABLED } from "@/lib/ai/photo-safety";

export const metadata = { title: "Media Moderation" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  source: string;
  created_at: string;
  safety_status: string | null;
  safety_label: string | null;
  safety_reason: string | null;
  restaurants: { name: string; slug: string } | null;
}

/** Small coloured pill for the AI safety-screen result (Prompt 4). Never a
 *  moderation decision — just a signal for the reviewer. */
function SafetyBadge({ status, label, reason }: { status: string | null; label: string | null; reason: string | null }) {
  const s = status ?? "unchecked";
  const style =
    s === "flag"
      ? "bg-red-500/15 text-red-400"
      : s === "pass"
        ? "bg-emerald-500/15 text-emerald-400"
        : s === "error"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-surface-2 text-text-muted";
  const text =
    s === "flag"
      ? `⚠ flagged${label && label !== "flagged" ? `: ${label}` : ""}`
      : s === "pass"
        ? "safety: pass"
        : s === "error"
          ? "safety: check failed"
          : "safety: not checked";
  return (
    <span title={reason ?? undefined} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${style}`}>
      {text}
    </span>
  );
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
    .select("id, kind, url, caption, source, created_at, safety_status, safety_label, safety_reason, restaurants(name, slug)")
    .eq("status", "pending")
    // Flagged photos first, so anything the AI screen caught is triaged before the rest.
    .order("safety_status", { ascending: true })
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];
  const flaggedCount = rows.filter((r) => r.safety_status === "flag").length;
  const uncheckedCount = rows.filter((r) => !r.safety_status || r.safety_status === "unchecked").length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">
        Media Moderation
      </h1>
      <p className="mb-4 text-text-muted">
        Community photos &amp; videos awaiting review before they appear on venue
        pages.
      </p>

      {/* AI safety screen (Prompt 4) — an assist, never an auto-decision. */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        {flaggedCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400">
            {flaggedCount} flagged by safety screen
          </span>
        )}
        {uncheckedCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-text-muted">
            {uncheckedCount} not yet screened
          </span>
        )}
        {PHOTO_SAFETY_ENABLED ? (
          <MediaSafetySweep />
        ) : (
          <span className="text-xs text-text-muted">Safety screen off (set XAI_API_KEY to enable).</span>
        )}
      </div>

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
                  <div className="mt-1.5">
                    <SafetyBadge status={m.safety_status} label={m.safety_label} reason={m.safety_reason} />
                  </div>
                </div>
                <MediaModerationActions
                  mediaId={m.id}
                  canScreen={PHOTO_SAFETY_ENABLED}
                  screened={Boolean(m.safety_status && m.safety_status !== "unchecked")}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
