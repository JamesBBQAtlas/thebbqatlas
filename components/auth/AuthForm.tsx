"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MARKETING_CONSENT_TEXT } from "@/lib/email/consent";

type AuthMode = "login" | "signup" | "magic";

const inputCls =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20";

export function AuthForm({
  mode: initialMode = "login",
  next = "/profile",
}: {
  mode?: AuthMode;
  next?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `/auth/callback?next=${encodeURIComponent(next)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const title =
    mode === "signup" ? "Create your account" : mode === "magic" ? "Magic link" : "Welcome back";
  const subtitle =
    mode === "signup"
      ? "Save spots, submit venues, and make the Atlas yours."
      : mode === "magic"
        ? "We'll email you a one-tap sign-in link."
        : "Sign in to your BBQ Atlas.";

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl,
          data: {
            marketing_opt_in: marketingOptIn,
            marketing_opt_in_text: MARKETING_CONSENT_TEXT,
          },
        },
      });
      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        // No email confirmation required — session is live now.
        await fetch("/api/account/post-signup", { method: "POST" }).catch(() => {});
        window.location.href = next;
      } else {
        setMessage("Check your email to confirm your account.");
      }
    } else if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl },
      });
      setMessage(error ? error.message : "Magic link sent — check your email.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.href = next;
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 shadow-xl">
      <div className="mb-6 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-4">
        <div>
          <label htmlFor="email" className="u-eyebrow mb-1.5 block text-[0.6875rem] text-text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className={inputCls}
          />
        </div>
        {mode !== "magic" && (
          <div>
            <label htmlFor="password" className="u-eyebrow mb-1.5 block text-[0.6875rem] text-text-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className={inputCls}
            />
          </div>
        )}
        {mode === "signup" && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-subtle bg-surface-1 p-3">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold"
            />
            <span className="text-xs leading-relaxed text-text-secondary">
              {MARKETING_CONSENT_TEXT}
            </span>
          </label>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {loading
            ? "Please wait…"
            : mode === "signup"
              ? "Sign up"
              : mode === "magic"
                ? "Send magic link"
                : "Sign in"}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface-0 px-2 text-text-muted">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2.5 rounded-md border border-border-default px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
          <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.964 10.71A5.4 5.4 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.581C13.463.891 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
        Continue with Google
      </button>

      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-text-muted">
        {mode !== "login" && (
          <button type="button" onClick={() => setMode("login")} className="hover:text-brand-gold">
            Sign in
          </button>
        )}
        {mode !== "signup" && (
          <button type="button" onClick={() => setMode("signup")} className="hover:text-brand-gold">
            Create account
          </button>
        )}
        {mode !== "magic" && (
          <button type="button" onClick={() => setMode("magic")} className="hover:text-brand-gold">
            Magic link
          </button>
        )}
      </div>

      {message && (
        <p className="mt-4 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-center text-sm text-text-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
