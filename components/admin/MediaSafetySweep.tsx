"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Admin "screen photos now" button (Prompt 4). Runs a bounded safety sweep over the
 * least-recently-screened photos and refreshes. The same sweep runs weekly via cron;
 * this is the on-demand trigger. Screening only writes safety signals — it never
 * approves or rejects.
 */
export function MediaSafetySweep() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/media/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sweep: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.summary) {
        const s = data.summary;
        setMsg(`Screened ${s.screened} — ${s.flagged} flagged, ${s.errors} errors.`);
        router.refresh();
      } else {
        setMsg(data.error ?? "Couldn't run the sweep.");
      }
    } catch {
      setMsg("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-brand-gold/50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.05em] text-brand-gold transition-colors hover:bg-brand-gold/10 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {busy ? "Screening…" : "Screen photos now"}
      </button>
      {msg && <span className="text-xs text-text-muted">{msg}</span>}
    </div>
  );
}
