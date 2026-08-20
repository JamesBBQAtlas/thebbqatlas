"use client";

import { useEffect, useState } from "react";
import { Loader2, Star, Crown } from "lucide-react";

interface Status {
  owns: boolean;
  isFeatured: boolean;
  hasControl: boolean;
  tier: string | null;
  until: string | null; // featured window end
  controlUntil: string | null; // pro period end
  proPurchasable: boolean;
  featuredPurchasable: boolean;
  proPrice: string;
  featuredPrice: string;
}

/**
 * Owner-only listing manager (Aug 19 realignment). The venue page is static, so this
 * island fetches the current user's ownership + entitlement state after hydration and
 * only shows to the venue's owner. Two independent offers:
 *   • PRO ($49/mo) — full page control (hero + all owner links).
 *   • FEATURED (~$100/wk) — a separate, time-boxed prominence window, bought on top.
 */
export function FeaturedUpgrade({ restaurantId }: { restaurantId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | "pro" | "featured">(null);
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

  if (!status || !status.owns) return null;

  async function buy(plan: "pro" | "featured") {
    setBusy(plan);
    setError("");
    try {
      const res = await fetch("/api/stripe/listing-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError((data.error as string) || "Couldn't start checkout.");
        setBusy(null);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Network error.");
      setBusy(null);
    }
  }

  const proDate = status.controlUntil ? new Date(status.controlUntil).toLocaleDateString("en-US") : null;
  const featDate = status.until ? new Date(status.until).toLocaleDateString("en-US") : null;

  return (
    <div className="mt-6 space-y-3">
      {/* PRO — page control */}
      {status.hasControl ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-gold">
          <Crown className="h-4 w-4" />
          <span>
            <strong>Pro</strong> — full page control active{proDate ? ` (renews ${proDate})` : ""}.
          </span>
        </div>
      ) : status.proPurchasable ? (
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Crown className="h-4 w-4 text-brand-gold" /> You own this venue
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Go <strong>Pro</strong> ({status.proPrice}) for full control of your page — choose your
            hero photo and add all your links (shop, ordering, tickets, gift cards).
          </p>
          <button
            type="button"
            onClick={() => buy("pro")}
            disabled={busy !== null}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {busy === "pro" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
            Go Pro — {status.proPrice}
          </button>
        </div>
      ) : null}

      {/* FEATURED — time-boxed prominence, bought on top of any tier */}
      {status.isFeatured ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-gold">
          <Star className="h-4 w-4 fill-brand-gold" />
          <span>
            <strong>Featured</strong>{featDate ? ` until ${featDate}` : ""}.
          </span>
        </div>
      ) : status.featuredPurchasable ? (
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          <p className="text-sm text-text-secondary">
            Want a boost? <strong>Feature</strong> this venue ({status.featuredPrice}) for prioritised
            placement across the Atlas — a time-boxed window, on top of any tier.
          </p>
          <button
            type="button"
            onClick={() => buy("featured")}
            disabled={busy !== null}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-brand-gold/50 px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-brand-gold hover:bg-brand-gold/10 disabled:opacity-40"
          >
            {busy === "featured" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
            Feature — {status.featuredPrice}
          </button>
        </div>
      ) : null}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
