"use client";

import { useState } from "react";
import { Loader2, Check, BellOff } from "lucide-react";

export function MarketingPrefToggle({
  token,
  initialOptIn,
}: {
  token: string;
  initialOptIn: boolean;
}) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !optIn;
    await fetch(`/api/unsubscribe?token=${token}${next ? "&resub=1" : ""}`, {
      method: "POST",
    }).catch(() => {});
    setOptIn(next);
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-center">
      <p className="flex items-center justify-center gap-2 text-lg text-text-primary">
        {optIn ? (
          <>
            <Check className="h-5 w-5 text-brand-gold" /> You&apos;re subscribed to the
            Missives.
          </>
        ) : (
          <>
            <BellOff className="h-5 w-5 text-text-muted" /> You&apos;re unsubscribed from
            the Missives.
          </>
        )}
      </p>
      <p className="mt-2 text-sm text-text-muted">
        {optIn
          ? "You'll get The BBQ Atlas newsletter and occasional updates. Service emails (like submission confirmations) are unaffected."
          : "You won't receive any marketing emails. You can resubscribe anytime."}
      </p>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`mt-5 inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-bold uppercase tracking-[0.06em] transition-colors disabled:opacity-40 ${
          optIn
            ? "border border-border-default text-text-secondary hover:border-destructive hover:text-destructive"
            : "bg-brand-gold text-text-inverse hover:bg-brand-gold/90"
        }`}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {optIn ? "Unsubscribe" : "Resubscribe"}
      </button>
    </div>
  );
}
