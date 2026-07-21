"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";

export function RunSweepButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/selfheal?limit=6", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`Scanned ${data.scanned}, ${data.created} new suggestion${data.created === 1 ? "" : "s"}.`);
      router.refresh();
    } else {
      setMsg(data.error || "Sweep failed.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-brand-gold transition-colors hover:bg-brand-gold hover:text-text-inverse disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Healing…" : "Run a sweep now"}
      </button>
      {msg && <span className="text-sm text-text-muted">{msg}</span>}
    </div>
  );
}
