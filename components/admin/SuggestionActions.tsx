"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";

export function SuggestionActions({ suggestionId }: { suggestionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setError("");
    const res = await fetch("/api/admin/suggestions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId, action }),
    });
    if (res.ok) router.refresh();
    else {
      setBusy(null);
      setError("Failed — try again.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <button
        type="button"
        onClick={() => act("reject")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-1.5 text-sm font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
      >
        {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Dismiss
      </button>
      <button
        type="button"
        onClick={() => act("approve")}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-3 py-1.5 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
      >
        {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Approve
      </button>
    </div>
  );
}
