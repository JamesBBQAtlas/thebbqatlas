"use client";

import { useState } from "react";
import { Bookmark, Share2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

/**
 * Save + Share actions for a restaurant. Save posts to the saved-spots API
 * (redirects to sign-in when unauthenticated); full My-Atlas wiring lands in
 * the accounts phase. Share uses the native share sheet with a clipboard
 * fallback. Click events will feed the analytics layer in a later phase.
 */
export function SaveShareActions({
  restaurantId,
  name,
  initialSaved = false,
}: {
  restaurantId: string;
  name: string;
  initialSaved?: boolean;
}) {
  const t = useTranslations("Restaurant");
  const [saved, setSaved] = useState(initialSaved);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    // Toggle: the API expects { restaurantId, action } — sending the wrong shape
    // (restaurant_id, no action) was silently 400ing, so nothing ever saved.
    const action = saved ? "unsave" : "save";
    try {
      const res = await fetch("/api/saved-spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, action }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) setSaved(action === "save");
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; no-op */
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={handleSave}
        disabled={busy}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-md border-[1.5px] px-4 py-3 text-[0.8125rem] font-semibold uppercase tracking-[0.06em] transition-colors duration-200",
          saved
            ? "border-brand-gold bg-brand-gold text-text-inverse"
            : "border-brand-gold text-brand-gold hover:bg-brand-gold hover:text-text-inverse"
        )}
      >
        {saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? t("saved") : t("save")}
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border-default px-4 py-3 text-[0.8125rem] font-medium uppercase tracking-[0.04em] text-text-secondary transition-colors duration-200 hover:border-border-strong hover:text-text-primary"
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        {copied ? "Copied" : t("share")}
      </button>
    </div>
  );
}
