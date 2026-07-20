"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GA_ENABLED } from "@/lib/analytics/ga";

const COOKIE = "bbqatlas_consent";
const ONE_YEAR = 60 * 60 * 24 * 365;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function readConsent(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.match(/(?:^|; )bbqatlas_consent=([^;]+)/)?.[1];
}

function writeConsent(value: "granted" | "denied") {
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/**
 * GDPR-style consent banner. Only rendered when analytics is configured
 * (NEXT_PUBLIC_GA_ID); shown once until the visitor chooses, then it updates
 * Google Consent Mode accordingly. Accepting enables analytics only — we never
 * request ad/marketing storage.
 */
export function CookieConsent() {
  const t = useTranslations("Cookies");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (GA_ENABLED && !readConsent()) setShow(true);
  }, []);

  function decide(granted: boolean) {
    writeConsent(granted ? "granted" : "denied");
    const state = granted ? "granted" : "denied";
    // Analytics + advertising (AdSense-ready). Declining keeps everything denied.
    window.gtag?.("consent", "update", {
      analytics_storage: state,
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
    });
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("title")}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-xl border border-border-default bg-surface-0/95 p-4 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Cookie className="hidden h-6 w-6 shrink-0 text-brand-gold sm:block" />
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("message")}{" "}
          <Link
            href="/privacy"
            className="text-brand-gold underline-offset-2 hover:underline"
          >
            {t("privacyLink")}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="rounded-md border border-border-default px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            {t("decline")}
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90"
          >
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
