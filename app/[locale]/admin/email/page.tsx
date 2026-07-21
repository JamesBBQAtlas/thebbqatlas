import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_ENABLED } from "@/lib/email/config";

export const metadata = { title: "Email Log" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  to_email: string;
  type: string;
  stream: string;
  status: string;
  provider_id: string | null;
  subject: string | null;
  error: string | null;
  created_at: string;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "sent"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "failed"
        ? "bg-red-500/15 text-red-400"
        : "bg-surface-2 text-text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] ${cls}`}>
      {status}
    </span>
  );
}

export default async function EmailLogPage() {
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
    .from("email_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];

  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">Email Log</h1>
      <p className="mt-1 text-text-muted">
        Every send attempt (transactional + marketing).{" "}
        {EMAIL_ENABLED ? (
          <span className="text-emerald-400">BBQ Mail is live.</span>
        ) : (
          <span className="text-amber-400">
            RESEND_API_KEY not set — sends are logged as skipped.
          </span>
        )}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          <div className="font-heading text-2xl font-bold text-emerald-400">{sent}</div>
          <div className="text-sm text-text-secondary">Sent</div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          <div className="font-heading text-2xl font-bold text-red-400">{failed}</div>
          <div className="text-sm text-text-secondary">Failed</div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          <div className="font-heading text-2xl font-bold text-text-primary">{skipped}</div>
          <div className="text-sm text-text-secondary">Skipped (no key)</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No emails yet.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-1 text-xs uppercase tracking-[0.06em] text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">To</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle bg-surface-0 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">
                      {r.type.replace(/_/g, " ")}
                    </div>
                    <div className="text-[0.625rem] uppercase tracking-[0.05em] text-text-muted">
                      {r.stream}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.to_email}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                    {r.error && (
                      <div className="mt-1 max-w-[240px] truncate text-[0.6875rem] text-red-400" title={r.error}>
                        {r.error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
