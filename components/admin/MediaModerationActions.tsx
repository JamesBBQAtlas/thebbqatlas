"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, ShieldCheck } from "lucide-react";

export function MediaModerationActions({
  mediaId,
  canScreen = false,
  screened = false,
}: {
  mediaId: string;
  canScreen?: boolean;
  screened?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approved" | "rejected">(null);
  const [screening, setScreening] = useState(false);

  async function set(status: "approved" | "rejected") {
    setBusy(status);
    const res = await fetch("/api/admin/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, status }),
    });
    if (res.ok) router.refresh();
    else setBusy(null);
  }

  async function screen() {
    setScreening(true);
    const res = await fetch("/api/admin/media/safety", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    if (res.ok) router.refresh();
    setScreening(false);
  }

  return (
    <div className="flex items-center gap-2">
      {canScreen && (
        <button
          type="button"
          onClick={screen}
          disabled={screening || busy !== null}
          title="Run the AI safety screen on this photo"
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-sm font-semibold text-text-muted transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          {screening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {screened ? "Re-screen" : "Screen"}
        </button>
      )}
      <button
        type="button"
        onClick={() => set("rejected")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-1.5 text-sm font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
      >
        {busy === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Reject
      </button>
      <button
        type="button"
        onClick={() => set("approved")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-3 py-1.5 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
      >
        {busy === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Approve
      </button>
    </div>
  );
}
