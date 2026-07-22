"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserPlus, UserMinus, AlertTriangle } from "lucide-react";

export interface AdminRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

export interface RoleLogRow {
  id: string;
  actor_email: string | null;
  target_email: string | null;
  old_role: string | null;
  new_role: string | null;
  created_at: string;
}

type Msg = { kind: "ok" | "err"; text: string } | null;

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TeamConsole({
  admins,
  log,
  currentUserId,
  serviceRoleConfigured,
}: {
  admins: AdminRow[];
  log: RoleLogRow[];
  currentUserId: string;
  serviceRoleConfigured: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const isLastAdmin = admins.length <= 1;

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Something went wrong." });
      } else {
        setMsg({ kind: "ok", text: data.message ?? "Done." });
        setEmail("");
        router.refresh();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-brand-gold">
          <ShieldCheck className="h-5 w-5" />
          <p className="u-eyebrow">Team &amp; Roles</p>
        </div>
        <h1 className="font-heading text-3xl font-bold text-text-primary">Admin access</h1>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Grant or revoke admin. This is the only place admin rights change —
          normal users can never promote themselves. To make someone an admin,
          they must sign up first, then you promote them by email.
        </p>
      </header>

      {!serviceRoleConfigured && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-brand-orange/40 bg-brand-orange/10 p-4 text-sm text-brand-orange">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The service-role key isn&apos;t configured in this environment, so role
            changes will fail. Set <code>SUPABASE_SERVICE_ROLE_KEY</code> to enable.
          </span>
        </div>
      )}

      {msg && (
        <div
          role="status"
          className={`mb-6 rounded-lg border p-3 text-sm ${
            msg.kind === "ok"
              ? "border-green-500/40 bg-green-500/10 text-green-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Promote */}
      <section className="mb-10 rounded-xl border border-border-subtle bg-surface-0 p-6">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
          <UserPlus className="h-4 w-4 text-brand-gold" /> Promote a user to admin
        </h2>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) call({ action: "promote", email: email.trim() });
          }}
        >
          <label htmlFor="promote-email" className="sr-only">
            User email
          </label>
          <input
            id="promote-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="flex-1 rounded-lg border border-border-default bg-surface-1 px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="rounded-lg bg-brand-gold px-5 py-2.5 font-semibold text-brand-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Working…" : "Promote to admin"}
          </button>
        </form>
      </section>

      {/* Current admins */}
      <section className="mb-10">
        <h2 className="mb-3 font-heading text-lg font-bold text-text-primary">
          Current admins ({admins.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-1 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Admin since</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === currentUserId;
                return (
                  <tr key={a.id} className="border-t border-border-subtle">
                    <td className="px-4 py-3 text-text-primary">{a.email ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {a.display_name ?? "—"}
                      {isSelf && (
                        <span className="ml-2 rounded bg-brand-gold/15 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase text-brand-gold">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{fmt(a.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy || isLastAdmin}
                        title={
                          isLastAdmin
                            ? "Can't remove the last admin"
                            : `Revoke admin from ${a.email ?? "user"}`
                        }
                        onClick={() => call({ action: "revoke", userId: a.id })}
                        className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isLastAdmin && (
          <p className="mt-2 text-xs text-text-muted">
            You&apos;re the only admin — promote someone else before you can revoke
            your own access (prevents lockout).
          </p>
        )}
      </section>

      {/* Audit log */}
      <section>
        <h2 className="mb-3 font-heading text-lg font-bold text-text-primary">
          Recent role changes
        </h2>
        {log.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-surface-0 p-4 text-sm text-text-muted">
            No role changes recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {log.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border-subtle bg-surface-0 px-4 py-2.5 text-sm text-text-secondary"
              >
                <span className="text-text-muted">{fmt(r.created_at)}</span> —{" "}
                <span className="text-text-primary">{r.actor_email ?? "system"}</span>{" "}
                set <span className="text-text-primary">{r.target_email ?? "a user"}</span>{" "}
                from <span className="font-mono">{r.old_role ?? "?"}</span> →{" "}
                <span className="font-mono text-brand-gold">{r.new_role ?? "?"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
