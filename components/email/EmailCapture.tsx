"use client";

import { useState } from "react";
import { Mail, Loader2, CircleCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MARKETING_CONSENT_TEXT } from "@/lib/email/consent";

const ERRORS: Record<string, string> = {
  invalid_email: "That email doesn't look right — mind checking it?",
  consent_required: "Please tick the box to confirm you'd like our missives.",
  rate_limited: "Too many attempts just now. Please try again shortly.",
  unavailable: "Sign-up is briefly unavailable. Please try again soon.",
};

/**
 * Tasteful newsletter capture. UK-GDPR/PECR: the consent checkbox starts
 * UNTICKED, is worded plainly, is unbundled (its own control), and the submit
 * is disabled until it's ticked — the same P7 standard used at signup.
 */
export function EmailCapture({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || !email) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus("done");
      } else {
        setStatus("error");
        setError(ERRORS[data.error] ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand-gold/30 bg-brand-gold/10 px-5 py-4">
        <CircleCheck className="h-5 w-5 shrink-0 text-brand-gold" />
        <p className="text-sm text-text-primary">
          You&apos;re on the list — welcome to the Atlas. Watch your inbox for our
          next missive.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <label htmlFor="capture-email" className="sr-only">
            Email address
          </label>
          <input
            id="capture-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-border-default bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading" || !consent || !email}
          className="flex items-center justify-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "loading" ? "Joining…" : "Subscribe"}
        </button>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-default bg-surface-1 text-brand-gold focus:ring-2 focus:ring-brand-gold/30"
        />
        <span>
          {MARKETING_CONSENT_TEXT} See our{" "}
          <Link
            href="/privacy"
            className="text-brand-gold underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
