"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

export interface SubscriberRow {
  email: string;
  source: string;
  hasAccount: boolean;
  subscribedAt: string;
  unsubscribedAt: string | null;
  steps: string[];
}

interface Counts {
  subscribed: number;
  unsubscribed: number;
  reach: number;
  newsletterOnly: number;
  members: number;
  optedInMembers: number;
}

const fmt = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0 p-4">
      <p className="text-2xl font-bold tabular-nums text-text-primary">{value}</p>
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      {hint && <p className="mt-0.5 text-[0.6875rem] text-text-muted">{hint}</p>}
    </div>
  );
}

function toCsv(rows: SubscriberRow[]): string {
  const head = ["email", "source", "has_account", "subscribed", "unsubscribed", "steps_sent"];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [
      r.email,
      r.source,
      r.hasAccount ? "yes" : "no",
      r.subscribedAt ? new Date(r.subscribedAt).toISOString().slice(0, 10) : "",
      r.unsubscribedAt ? new Date(r.unsubscribedAt).toISOString().slice(0, 10) : "",
      r.steps.join(" / "),
    ]
      .map((v) => esc(String(v)))
      .join(",")
  );
  return [head.join(","), ...lines].join("\n");
}

export function SubscribersConsole({ counts, rows }: { counts: Counts; rows: SubscriberRow[] }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "active" | "unsub">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "active" && r.unsubscribedAt) return false;
      if (tab === "unsub" && !r.unsubscribedAt) return false;
      if (needle && !`${r.email} ${r.source}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, tab]);

  function downloadCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Subscribed" value={counts.subscribed} hint="active" />
        <Stat label="Unsubscribed" value={counts.unsubscribed} />
        <Stat label="Newsletter reach" value={counts.reach} hint="subs + opted-in members" />
        <Stat label="Newsletter-only" value={counts.newsletterOnly} hint="no account" />
        <Stat label="Members" value={counts.members} />
        <Stat label="Opted-in members" value={counts.optedInMembers} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg border border-border-subtle bg-surface-0 p-1">
          {([
            ["all", "All"],
            ["active", "Subscribed"],
            ["unsub", "Unsubscribed"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors " +
                (tab === k ? "bg-brand-gold text-text-inverse" : "text-text-secondary hover:text-text-primary")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email / source…"
            className="w-64 rounded-md border border-border-default bg-surface-1 py-1.5 pl-8 pr-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
        >
          <Download className="h-3.5 w-3.5" /> CSV ({filtered.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-0 text-left text-xs uppercase tracking-[0.05em] text-text-muted">
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Account?</th>
              <th className="px-3 py-2 font-semibold">Subscribed</th>
              <th className="px-3 py-2 font-semibold">Unsubscribed</th>
              <th className="px-3 py-2 font-semibold">Steps sent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  No subscribers match.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.email} className="border-b border-border-subtle/60">
                  <td className="px-3 py-2 text-text-primary">{r.email}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.source}</td>
                  <td className="px-3 py-2">
                    {r.hasAccount ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase text-emerald-400">
                        Member
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{fmt(r.subscribedAt)}</td>
                  <td className="px-3 py-2">
                    {r.unsubscribedAt ? (
                      <span className="text-destructive">{fmt(r.unsubscribedAt)}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.steps.length ? r.steps.join(" · ") : <span className="text-text-muted">none</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
