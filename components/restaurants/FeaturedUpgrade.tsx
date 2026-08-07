"use client";

import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";

interface Status {
  owns: boolean;
  isFeatured: boolean;
  purchasable: boolean;
  until: string | null;
}

/**
 * Owner-only "Upgrade to Featured" CTA (Phase 5.1). The venue page is static, so
 * this island fetches the current user's ownership + Featured state after
 * hydration and only shows anything to the venue's owner. Non-owners see nothing.
 */
export function FeaturedUpgrade({ restaurantId }: { restaurantId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/stripe/listing-status?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setStatus(d as Status);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [restaurantId]);

  // Nothing for non-owners (or before we know).
  if (!status || !status.owns) return null;

  async function upgrade() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/listing-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError((data.error as string) || "Couldn't start checkout.");
        setBusy(false);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  if (status.isFeatured) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-gold">
        <Star className="h-4 w-4 fill-brand-gold" />
        <span>
          This venue is <strong>Featured</strong>
          {status.until ? ` — renews ${new Date(status.until).toLocaleDateString("en-US")}` : ""}.
        </span>
      </div>
    );
  }

  if (!status.purchasable) return null;

  return (
    <div className="mt-6 rounded-xl border border-border-subtle bg-surface-0 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Star className="h-4 w-4 text-brand-gold" />
        You own this venue
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        Make it a <strong>Featured</strong> listing — prioritised placement across the Atlas and a
        verified owner badge on this page.
      </p>
      <button
        type="button"
        onClick={upgrade}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
        Upgrade to Featured
      </button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
