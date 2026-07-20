"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";

export function PendingVenueActions({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approved" | "rejected">(null);
  const [error, setError] = useState("");

  async function set(status: "approved" | "rejected") {
    setBusy(status);
    setError("");
    const res = await fetch("/api/admin/venues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, status }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setBusy(null);
      setError("Failed — try again.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
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
        Publish
      </button>
    </div>
  );
}
