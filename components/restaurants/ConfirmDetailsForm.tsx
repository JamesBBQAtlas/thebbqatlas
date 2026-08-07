"use client";

import { useState } from "react";
import { Check, Loader2, PencilLine } from "lucide-react";

/**
 * #61 — the owner-facing confirm/correct actions. "Everything's correct" stamps
 * the listing as owner-verified; "Something needs fixing" files a correction for
 * moderation. Both advance the Outreach Hub server-side.
 */
export function ConfirmDetailsForm({ slug, initialEmail }: { slug: string; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [mode, setMode] = useState<"idle" | "correcting">("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"confirmed" | "corrected" | null>(null);
  const [error, setError] = useState("");

  async function submit(action: "confirm" | "correct") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/venues/confirm-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action, email, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as string) || "Something went wrong.");
      } else {
        setDone(action === "confirm" ? "confirmed" : "corrected");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (done === "confirmed") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-300">
        <p className="font-semibold">Thank you — noted as confirmed.</p>
        <p className="mt-1 text-emerald-300/80">
          Your listing is marked as owner-verified. Nothing else to do.
        </p>
      </div>
    );
  }
  if (done === "corrected") {
    return (
      <div className="mt-6 rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-5 text-sm text-brand-gold">
        <p className="font-semibold">Got it — thank you.</p>
        <p className="mt-1 text-brand-gold/80">
          We&apos;ll review your correction and update the listing. No account needed.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs text-text-muted">Your email (optional — so we can follow up)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourvenue.com"
          className="mt-1 w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
      </label>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => submit("confirm")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Everything&apos;s correct
          </button>
          <button
            type="button"
            onClick={() => setMode("correcting")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-border-default px-4 py-2.5 text-sm font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
          >
            <PencilLine className="h-4 w-4" />
            Something needs fixing
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What should we change? (address, hours, phone, website, anything.)"
            className="w-full resize-y rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => submit("correct")}
              disabled={busy || message.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send the correction
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="text-sm font-semibold text-text-muted hover:text-text-secondary"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
