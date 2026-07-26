"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Sparkles } from "lucide-react";

/**
 * Per-draft actions in the Pending Venues queue: Enrich (run the Grok →
 * house-voice research + geocode in place), Reject, and Publish. Publish is
 * blocked server-side until the venue has been enriched (has a map location).
 */
export function PendingVenueActions({
  restaurantId,
  needsEnrich = false,
}: {
  restaurantId: string;
  needsEnrich?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "enrich" | "approved" | "rejected">(null);
  const [error, setError] = useState("");

  async function setStatus(status: "approved" | "rejected") {
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
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      setError(data.error ?? "Failed — try again.");
    }
  }

  async function enrich() {
    setBusy("enrich");
    setError("");
    const res = await fetch("/api/admin/venues/enrich-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      setError(data.error ?? "Enrichment failed.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={enrich}
          disabled={busy !== null}
          className={
            "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 " +
            (needsEnrich
              ? "border-brand-gold/70 text-brand-gold hover:bg-brand-gold/10"
              : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold")
          }
          title="Research this venue with AI and geocode it"
        >
          {busy === "enrich" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {needsEnrich ? "Enrich" : "Re-enrich"}
        </button>
        <button
          type="button"
          onClick={() => setStatus("rejected")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-1.5 text-sm font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
        >
          {busy === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Reject
        </button>
        <button
          type="button"
          onClick={() => setStatus("approved")}
          disabled={busy !== null || needsEnrich}
          title={needsEnrich ? "Enrich this venue before publishing" : "Publish"}
          className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-3 py-1.5 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Publish
        </button>
      </div>
    </div>
  );
}
