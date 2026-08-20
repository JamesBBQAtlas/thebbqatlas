"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldX } from "lucide-react";

/**
 * Revoke an approved ownership claim (Prompt 2 #3). Two-step confirm in-button to
 * avoid an accidental revoke; on success the owner's edit rights are gone immediately.
 */
export function OwnerRevokeButton({ claimId, ownerLabel }: { claimId: string; ownerLabel: string }) {
  const router = useRouter();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function revoke() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/owners/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setErr(data.error ?? "Couldn't revoke — try again.");
    } catch {
      setErr("Network error — try again.");
    }
    setBusy(false);
    setArming(false);
  }

  if (!arming) {
    return (
      <button
        type="button"
        onClick={() => setArming(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive"
      >
        <ShieldX className="h-4 w-4" /> Revoke
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">Revoke {ownerLabel}?</span>
      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md bg-destructive px-2.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirm
      </button>
      <button
        type="button"
        onClick={() => setArming(false)}
        disabled={busy}
        className="rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
      >
        Cancel
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
